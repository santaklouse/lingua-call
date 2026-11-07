import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTranslator } from '@linguacall/i18n';
import type { Language, MessageKey } from '@linguacall/i18n';
import { TranslationPipeline, decodeCallMessage, encodeCallMessage } from '@linguacall/translation';
import type { PipelineState, Segment, TtsEngine, VoiceGender } from '@linguacall/translation';
import { Button, IconButton, SegmentedControl, StatusPill, Switch, TextArea, TokenField, Widget } from '../ui';
import { useRouter } from '../router/context';
import {
  ManualCallError,
  acceptAnswerCode,
  createCallerSession,
  createCalleeSession,
  disposeCall,
  waitForChannelOpen,
} from '../media/manual-rtc';
import {
  createRoomCode,
  normalizeRoomCode,
  startQuickGuest,
  startQuickHost,
} from '../media/local-signaling';
import type { QuickSession } from '../media/local-signaling';
import { createRemoteAudioMixer } from '../media/remote-audio';
import type { RemoteAudioMixer } from '../media/remote-audio';
import { otherLanguage } from '../translation/languages';
import { startStreamPitchTracker } from '../translation/pitch-tracker';
import type { PitchTracker } from '../translation/pitch-tracker';
import { DebugLogger } from '../debug/logger';
import { clearSession, loadSession, saveSession } from '../storage/session';
import type { DebugEntry, DebugLevel } from '../debug/logger';
import { createWebSpeechAsr, isWebSpeechAsrSupported } from '../translation/engines/web-speech-asr';
import {
  createChromeTranslator,
  isChromeTranslatorSupported,
} from '../translation/engines/chrome-translator';
import { createWebSpeechTts, isWebSpeechTtsSupported } from '../translation/engines/web-speech-tts';
import styles from './call.module.css';

type Mode = 'quick-host' | 'quick-guest' | 'manual';
type Entry = 'none' | 'quick' | 'manual';
type SessionState = 'idle' | 'preparing' | 'waiting' | 'connected';
type ManualStage = 'host' | 'guest' | 'guest-answer';

type CallSubtitle = {
  key: string;
  direction: 'you' | 'peer';
  srcText: string;
  dstText: string;
};

type SessionHandle = {
  pc: RTCPeerConnection;
  localStream: MediaStream;
  channel: Promise<RTCDataChannel>;
  dispose: () => void;
};

const CALL_SESSION_KEY = 'linguacall.call';

type CallSnapshot = {
  entry: Entry;
  quickCode: string;
  quickInput: string;
  manualStage: ManualStage;
};

function readInitialCallSnapshot(): CallSnapshot {
  const saved = loadSession<CallSnapshot>(CALL_SESSION_KEY, (value) => {
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    const entry = record['entry'];
    const manualStage = record['manualStage'];
    if (entry !== 'none' && entry !== 'quick' && entry !== 'manual') return null;
    if (manualStage !== 'host' && manualStage !== 'guest' && manualStage !== 'guest-answer') {
      return null;
    }
    return {
      entry,
      quickCode: typeof record['quickCode'] === 'string' ? record['quickCode'] : '',
      quickInput: typeof record['quickInput'] === 'string' ? record['quickInput'] : '',
      manualStage,
    };
  });
  return saved ?? { entry: 'none', quickCode: '', quickInput: '', manualStage: 'host' };
}

const GENDER_LABELS: Record<VoiceGender, MessageKey> = {
  male: 'translate.voice.male',
  female: 'translate.voice.female',
  unknown: 'translate.voice.unknown',
};

function createNoopTts(): TtsEngine {
  return {
    id: 'none',
    languages: [],
    supports: () => false,
    speak: async () => {},
    cancel: () => {},
  };
}

function formatLog(entry: DebugEntry): string {
  const time = new Date(entry.time).toLocaleTimeString();
  return `[${time}] ${entry.level.toUpperCase()} ${entry.message}`;
}

export function ManualCallScreen() {
  const { state, go } = useRouter();
  const t = createTranslator(state.nativeLanguage ?? 'en');
  const localLanguage: Language = state.nativeLanguage ?? 'en';

  const translationSupported = useMemo(
    () => isWebSpeechAsrSupported() && isChromeTranslatorSupported(),
    [],
  );
  const ttsSupported = useMemo(() => isWebSpeechTtsSupported(), []);

  const loggerRef = useRef(new DebugLogger());
  const [logs, setLogs] = useState<readonly DebugEntry[]>([]);
  const log = useCallback((level: DebugLevel, message: string) => {
    loggerRef.current.log(level, message);
  }, []);

  const initialSnapshot = readInitialCallSnapshot();
  const [entry, setEntry] = useState<Entry>(initialSnapshot.entry);
  const [mode, setMode] = useState<Mode | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [manualStage, setManualStage] = useState<ManualStage>(initialSnapshot.manualStage);
  const [restored] = useState(initialSnapshot.entry !== 'none');

  const [quickCode, setQuickCode] = useState(initialSnapshot.quickCode);
  const [quickInput, setQuickInput] = useState(initialSnapshot.quickInput);
  const [roomCopied, setRoomCopied] = useState(false);

  const [offerCode, setOfferCode] = useState('');
  const [answerCode, setAnswerCode] = useState('');
  const [pastedCode, setPastedCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [remoteAudioMixed, setRemoteAudioMixed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.matchMedia('(min-width: 1101px)').matches,
  );

  const [peerLanguage, setPeerLanguage] = useState<Language>(otherLanguage(localLanguage));
  const [subtitles, setSubtitles] = useState<CallSubtitle[]>([]);
  const [localPartial, setLocalPartial] = useState('');
  const [translationState, setTranslationState] = useState<PipelineState>('idle');
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [dubbing, setDubbing] = useState(true);
  const [dubbingActive, setDubbingActive] = useState(false);
  const [remoteGender, setRemoteGender] = useState<VoiceGender>('unknown');
  const [voiceMode, setVoiceMode] = useState<'auto' | 'female' | 'male'>('auto');

  const sessionRef = useRef<SessionHandle | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipelineRef = useRef<TranslationPipeline | null>(null);
  const ttsRef = useRef<TtsEngine | null>(null);
  const mixerRef = useRef<RemoteAudioMixer | null>(null);
  const remoteTrackerRef = useRef<PitchTracker | null>(null);
  const remoteGenderRef = useRef<VoiceGender>('unknown');
  const dubbingRef = useRef(true);
  const speechBusyRef = useRef(false);
  const pendingSpeechRef = useRef<string | null>(null);
  const subtitleKeyRef = useRef(0);
  const peerLanguageRef = useRef<Language>(otherLanguage(localLanguage));

  useEffect(() => loggerRef.current.subscribe(setLogs), []);

  // Remember the call screen/room inputs so F5 restores them.
  useEffect(() => {
    if (entry === 'none') {
      clearSession(CALL_SESSION_KEY);
      return;
    }
    saveSession(CALL_SESSION_KEY, {
      entry,
      quickCode,
      quickInput,
      manualStage,
    } satisfies CallSnapshot);
  }, [entry, quickCode, quickInput, manualStage]);

  useEffect(() => {
    log('info', `Call screen ready: origin=${window.location.origin} secureContext=${String(window.isSecureContext)}`);
  }, [log]);

  useEffect(() => {
    peerLanguageRef.current = peerLanguage;
  }, [peerLanguage]);

  useEffect(() => {
    dubbingRef.current = dubbing;
    if (!dubbing) {
      pendingSpeechRef.current = null;
      ttsRef.current?.cancel();
      mixerRef.current?.duck(false);
      setDubbingActive(false);
    }
  }, [dubbing]);

  const pushSubtitle = useCallback((direction: 'you' | 'peer', srcText: string, dstText: string) => {
    subtitleKeyRef.current += 1;
    setSubtitles((current) => [
      ...current.slice(-11),
      { key: `sub-${subtitleKeyRef.current}`, direction, srcText, dstText },
    ]);
  }, []);

  const playSpeech = useCallback(
    async (text: string) => {
      const tts = ttsRef.current;
      if (tts === null) return;
      speechBusyRef.current = true;
      setDubbingActive(true);
      mixerRef.current?.duck(true);
      log('debug', 'Dubbing: ducking original audio');
      try {
        await tts.speak(text, localLanguage, {
          gender: voiceMode === 'auto' ? remoteGenderRef.current : voiceMode,
        });
      } catch (cause) {
        log('warn', `Dubbing failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      } finally {
        mixerRef.current?.duck(false);
        setDubbingActive(false);
        speechBusyRef.current = false;
        const next = pendingSpeechRef.current;
        pendingSpeechRef.current = null;
        if (next !== null) void playSpeech(next);
      }
    },
    [localLanguage, log],
  );

  const enqueueSpeech = useCallback(
    (text: string) => {
      if (!dubbingRef.current || ttsRef.current === null) return;
      if (speechBusyRef.current) {
        pendingSpeechRef.current = text;
        return;
      }
      void playSpeech(text);
    },
    [playSpeech],
  );

  const setupTranslation = useCallback(
    async (channelPromise: Promise<RTCDataChannel>) => {
      let channel: RTCDataChannel;
      try {
        channel = await channelPromise;
        await waitForChannelOpen(channel);
      } catch (cause) {
        log('warn', `Data channel failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        return;
      }
      if (pcRef.current === null) return;

      channelRef.current = channel;
      log('info', 'Data channel open');
      setSessionState('connected');
      if (remoteStream === null) {
        const tracks = pcRef.current?.getReceivers().map((receiver) => receiver.track) ?? [];
        const liveTracks = tracks.filter((track) => track.readyState === 'live');
        if (liveTracks.length > 0) setRemoteStream(new MediaStream(liveTracks));
      }
      channel.addEventListener('close', () => log('warn', 'Data channel closed'));

      channel.onmessage = (event: MessageEvent) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '');
        const message = decodeCallMessage(raw);
        if (message === null) {
          log('warn', 'Ignored unknown data-channel message');
          return;
        }
        if (message.type === 'hello') {
          setPeerLanguage(message.lang);
          peerLanguageRef.current = message.lang;
          pipelineRef.current?.setLanguages(localLanguage, message.lang);
          log('info', `Peer language: ${message.lang}`);
          return;
        }
        log('info', `Subtitle in: ${message.srcText} → ${message.dstText}`);
        pushSubtitle('peer', message.srcText, message.dstText);
        enqueueSpeech(message.dstText);
      };

      channel.send(encodeCallMessage({ type: 'hello', lang: localLanguage }));
      log('info', `Hello sent (${localLanguage})`);

      if (!translationSupported) {
        log('warn', 'Translation engines are unavailable in this browser');
        return;
      }

      if (ttsSupported) {
        const tts = createWebSpeechTts();
        ttsRef.current = tts;
        void tts.warmup?.().catch(() => {});
        log('info', 'TTS ready');
      }

      const pipeline = new TranslationPipeline({
        engines: {
          asr: createWebSpeechAsr(),
          mt: createChromeTranslator(),
          tts: createNoopTts(),
        },
        sourceLanguage: localLanguage,
        targetLanguage: peerLanguageRef.current,
        dubbing: false,
        onPartial: (text) => setLocalPartial(text),
        onSegment: (segment: Segment) => {
          setLocalPartial('');
          pushSubtitle('you', segment.srcText, segment.dstText);
          log('info', `Subtitle out: ${segment.srcText} → ${segment.dstText}`);
          if (channel.readyState === 'open') {
            channel.send(
              encodeCallMessage({
                type: 'subtitle',
                id: segment.id,
                srcLang: segment.srcLang,
                dstLang: segment.dstLang,
                srcText: segment.srcText,
                dstText: segment.dstText,
                final: true,
                t0: segment.startedAtMs,
                t1: segment.endedAtMs,
              }),
            );
          }
        },
        onError: (cause) => {
          setTranslationError(cause.message);
          log('error', `Translation error: ${cause.message}`);
        },
        onState: (next) => setTranslationState(next),
      });
      pipelineRef.current = pipeline;
      try {
        await pipeline.start();
        log('info', 'Translation pipeline started');
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setTranslationError(message);
        log('error', `Pipeline failed: ${message}`);
      }
    },
    [enqueueSpeech, localLanguage, log, pushSubtitle, translationSupported, ttsSupported],
  );

  const attachSession = useCallback(
    (session: SessionHandle) => {
      sessionRef.current = session;
      pcRef.current = session.pc;
      setLocalStream(session.localStream);
      log(
        'info',
        `Media: ${session.localStream.getTracks().map((track) => track.kind).join(', ') || 'none'}`,
      );
      const localCandidates = (session.pc.localDescription?.sdp.match(/a=candidate/g) ?? []).length;
      log(
        'info',
        `Peer connection: state=${session.pc.connectionState} ice=${session.pc.iceConnectionState} localCandidates=${localCandidates}`,
      );
      session.pc.addEventListener('iceconnectionstatechange', () => {
        log('info', `ICE state: ${session.pc.iceConnectionState} (gathering=${session.pc.iceGatheringState})`);
      });
      session.pc.addEventListener('connectionstatechange', () => {
        const pcState = session.pc.connectionState;
        log('info', `Connection: ${pcState} (ice=${session.pc.iceConnectionState})`);
        if (pcState === 'connected') {
          setSessionState('connected');
        } else if (pcState === 'failed') {
          setSessionState('waiting');
          setError(t('manual.connectionError'));
        } else if (pcState === 'disconnected') {
          setSessionState('waiting');
        }
      });

      // Watchdog: surface a clear error instead of an endless "Waiting" state.
      window.setTimeout(() => {
        const pc = pcRef.current;
        if (pc === null || pc === session.pc) {
          if (pc !== null && pc.connectionState === 'connected') return;
          if (pc === null || pc.connectionState === 'connecting' || pc.connectionState === 'new') {
            log(
              'error',
              `Connection still not established after 20s (state=${pc?.connectionState ?? 'none'}, ice=${pc?.iceConnectionState ?? 'none'})`,
            );
            setError(t('manual.connectionError'));
          }
        }
      }, 20_000);
      session.pc.addEventListener('track', (event: RTCTrackEvent) => {
        const [stream] = event.streams;
        if (stream !== undefined) {
          setRemoteStream(stream);
          setSessionState('connected');
          log('info', 'Remote media received');
        }
      });
      if (session.pc.connectionState === 'connected') {
        setSessionState('connected');
        log('info', 'Session was already connected');
      }
      void setupTranslation(session.channel);
    },
    [log, setupTranslation],
  );

  useEffect(() => {
    localStreamRef.current = localStream;
    if (localVideoRef.current !== null) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current !== null) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (remoteStream === null) return;
    let disposed = false;
    void startStreamPitchTracker(remoteStream, (gender) => {
      remoteGenderRef.current = gender;
      setRemoteGender(gender);
      log('info', `Remote voice: ${gender}`);
    })
      .then((tracker) => {
        if (disposed) {
          tracker.stop();
          return;
        }
        remoteTrackerRef.current = tracker;
      })
      .catch(() => {
        remoteTrackerRef.current = null;
      });
    return () => {
      disposed = true;
      remoteTrackerRef.current?.stop();
      remoteTrackerRef.current = null;
    };
  }, [log, remoteStream]);

  useEffect(() => {
    if (remoteStream === null) return;
    let disposed = false;
    void createRemoteAudioMixer(remoteStream)
      .then((mixer) => {
        if (disposed) {
          mixer.dispose();
          return;
        }
        mixerRef.current = mixer;
        setRemoteAudioMixed(true);
        log('info', 'Remote audio mixer ready (ducking enabled)');
      })
      .catch((cause: unknown) => {
        setRemoteAudioMixed(false);
        log('warn', `Remote audio mixer failed: ${String(cause)}`);
      });
    return () => {
      disposed = true;
      mixerRef.current?.dispose();
      mixerRef.current = null;
      setRemoteAudioMixed(false);
    };
  }, [log, remoteStream]);

  const cleanupCall = useCallback(() => {
    remoteTrackerRef.current?.stop();
    remoteTrackerRef.current = null;
    mixerRef.current?.dispose();
    mixerRef.current = null;
    ttsRef.current?.cancel();
    ttsRef.current = null;
    void pipelineRef.current?.stop();
    pipelineRef.current = null;
    channelRef.current = null;
    speechBusyRef.current = false;
    pendingSpeechRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanupCall();
      sessionRef.current?.dispose();
      sessionRef.current = null;
      pcRef.current = null;
      disposeCall(null, localStreamRef.current);
    };
  }, [cleanupCall]);

  const resetCallState = () => {
    setMode(null);
    setEntry('none');
    setSessionState('idle');
    setManualStage('host');
    setQuickCode('');
    setOfferCode('');
    setAnswerCode('');
    setPastedCode('');
    setLocalStream(null);
    setRemoteStream(null);
    setSubtitles([]);
    setLocalPartial('');
    setTranslationState('idle');
    setTranslationError(null);
    setRemoteAudioMixed(false);
    setDubbingActive(false);
    setRemoteGender('unknown');
    remoteGenderRef.current = 'unknown';
    setMuted(false);
    setCameraOn(true);
  };

  const fail = useCallback(
    (cause: unknown) => {
      const message =
        cause instanceof ManualCallError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : String(cause);
      setError(message);
      log('error', message);
    },
    [log],
  );

  const hangup = () => {
    clearSession(CALL_SESSION_KEY);
    cleanupCall();
    sessionRef.current?.dispose();
    sessionRef.current = null;
    pcRef.current = null;
    resetCallState();
    setError(null);
    log('info', 'Call ended');
  };

  const beginQuickHost = async (codeOverride?: string) => {
    setError(null);
    setEntry('quick');
    setMode('quick-host');
    setSessionState('preparing');
    const code = codeOverride ?? createRoomCode();
    setQuickCode(code);
    log('info', `Creating quick room ${code}`);
    try {
      const session = await startQuickHost(code, {
        onLog: (level, message) => log(level, message),
        onPeerJoined: () => {
          setSessionState('waiting');
          log('info', 'Other tab joined the room');
        },
      });
      const handle: SessionHandle = {
        pc: session.pc,
        localStream: session.localStream,
        channel: session.channel,
        dispose: session.dispose,
      };
      attachSession(handle);
      setSessionState((current) => (current === 'connected' ? current : 'waiting'));
    } catch (cause) {
      fail(cause);
      setEntry('none');
      setMode(null);
      setSessionState('idle');
    }
  };

  const beginQuickGuest = async () => {
    const code = normalizeRoomCode(quickInput);
    if (code.length < 4) {
      setError(t('call.roomCodePlaceholder'));
      return;
    }
    setError(null);
    setEntry('quick');
    setMode('quick-guest');
    setSessionState('preparing');
    log('info', `Joining quick room ${code}`);
    try {
      const session: QuickSession = await startQuickGuest(code, {
        onLog: (level, message) => log(level, message),
      });
      attachSession({
        pc: session.pc,
        localStream: session.localStream,
        channel: session.channel,
        dispose: session.dispose,
      });
      setSessionState('waiting');
    } catch (cause) {
      fail(cause);
      setEntry('none');
      setMode(null);
      setSessionState('idle');
    }
  };

  const beginManualHost = async () => {
    setError(null);
    setEntry('manual');
    setMode('manual');
    setManualStage('host');
    setSessionState('preparing');
    log('info', 'Creating manual offer');
    try {
      const session = await createCallerSession();
      attachSession({
        pc: session.pc,
        localStream: session.localStream,
        channel: session.channel,
        dispose: () => disposeCall(session.pc, session.localStream),
      });
      setOfferCode(session.offerCode);
      setSessionState('waiting');
      log('info', `Offer ready (${session.offerCode.length} chars)`);
    } catch (cause) {
      fail(cause);
      setEntry('none');
      setMode(null);
      setSessionState('idle');
    }
  };

  const beginManualGuest = async () => {
    setError(null);
    setEntry('manual');
    setMode('manual');
    setManualStage('guest');
    setSessionState('preparing');
    log('info', 'Preparing manual answer');
    try {
      const session = await createCalleeSession(pastedCode);
      attachSession({
        pc: session.pc,
        localStream: session.localStream,
        channel: session.channel,
        dispose: () => disposeCall(session.pc, session.localStream),
      });
      setAnswerCode(session.answerCode);
      setManualStage('guest-answer');
      setSessionState('waiting');
      log('info', `Answer ready (${session.answerCode.length} chars)`);
    } catch (cause) {
      fail(cause);
      setManualStage('guest');
    }
  };

  const submitManualAnswer = async () => {
    const pc = pcRef.current;
    if (pc === null) return;
    try {
      await acceptAnswerCode(pc, pastedCode);
      log('info', 'Answer applied, connecting…');
    } catch (cause) {
      fail(cause);
    }
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(quickCode);
      setRoomCopied(true);
      window.setTimeout(() => setRoomCopied(false), 2000);
    } catch {
      setRoomCopied(false);
    }
  };

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs.map(formatLog).join('\n'));
    } catch {
      // Clipboard may be blocked; logs stay available on screen.
    }
  };

  const toggleMute = () => {
    const next = !muted;
    for (const track of localStream?.getAudioTracks() ?? []) track.enabled = !next;
    setMuted(next);
    log('info', next ? 'Microphone muted' : 'Microphone unmuted');
  };

  const toggleCamera = () => {
    const next = !cameraOn;
    for (const track of localStream?.getVideoTracks() ?? []) track.enabled = next;
    setCameraOn(next);
    log('info', next ? 'Camera on' : 'Camera off');
  };

  const latestPeerSubtitle = [...subtitles].reverse().find((item) => item.direction === 'peer');
  const connected = sessionState === 'connected' || remoteStream !== null;
  const effectiveState: SessionState = connected ? 'connected' : sessionState;
  const modeLabel =
    effectiveState === 'connected'
      ? t('call.modeConnected')
      : effectiveState === 'waiting'
        ? t('call.modeWaiting')
        : effectiveState === 'preparing'
          ? t('call.modePreparing')
          : t('translate.idle');
  const modeTone =
    effectiveState === 'connected' ? 'success' : effectiveState === 'idle' ? 'neutral' : 'warning';

  const showStageCall = mode !== null;

  return (
    <div className={styles.layout}>
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>L</span>
            <span>LinguaCall</span>
          </div>
          <div className={styles.topbarMeta}>
            {mode === 'quick-host' && quickCode.length > 0 ? (
              <span className={styles.hint}>#{quickCode}</span>
            ) : null}
            <StatusPill tone={modeTone}>{modeLabel}</StatusPill>
            <Button
              variant="ghost"
              size="sm"
              className={styles.settingsButton}
              onClick={() => go('devices')}
            >
              {t('call.settings')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={styles.panelsButton}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((value) => !value)}
            >
              ☰ {t('call.widgets')}
            </Button>
          </div>
        </header>

        <div className={styles.stage}>
          {remoteStream !== null ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={remoteAudioMixed}
              className={styles.remoteVideo}
            />
          ) : (
            <div className={styles.remotePlaceholder}>
              <span style={{ fontSize: 40 }}>👥</span>
              <strong>{showStageCall ? t('call.waitingForPeer') : t('call.noRemote')}</strong>
              <span className={styles.hint}>{t('call.quickTestHint')}</span>
            </div>
          )}

          {localStream !== null ? (
            <video ref={localVideoRef} autoPlay playsInline muted className={styles.localVideo} />
          ) : null}

          {latestPeerSubtitle !== undefined ? (
            <div className={styles.subtitleOverlay}>
              <span className={styles.subtitleOriginal}>{latestPeerSubtitle.srcText}</span>
              <span className={styles.subtitleTranslation}>{latestPeerSubtitle.dstText}</span>
            </div>
          ) : null}
          {localPartial.length > 0 ? (
            <div className={styles.subtitleOverlay} style={{ bottom: 64 }}>
              <span className={styles.subtitlePartial}>{localPartial}</span>
            </div>
          ) : null}
        </div>

        <div className={styles.controls}>
          <IconButton label={muted ? t('manual.unmute') : t('manual.mute')} onClick={toggleMute}>
            {muted ? '🔇' : '🎙'}
          </IconButton>
          <IconButton
            label={cameraOn ? t('manual.cameraOff') : t('manual.cameraOn')}
            onClick={toggleCamera}
          >
            {cameraOn ? '📷' : '🚫'}
          </IconButton>
          <IconButton label={t('manual.hangup')} danger onClick={hangup}>
            ✕
          </IconButton>
        </div>
      </main>

      {sidebarOpen ? (
        <div
          className={styles.sidebarBackdrop}
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside className={[styles.sidebar, sidebarOpen ? styles.sidebarOpen : ''].join(' ')}>
        <Widget
          id="participants"
          title={t('call.participants')}
          badge={remoteStream !== null ? '2' : '1'}
          defaultOpen
        >
          <div className={styles.participant}>
            <div className={styles.participantHeader}>
              <span className={styles.participantName}>{t('call.self')}</span>
              <StatusPill tone={modeTone}>{modeLabel}</StatusPill>
            </div>
            <div className={styles.participantMeta}>
              <span>
                {t('call.yourLanguage')}: {localLanguage.toUpperCase()}
              </span>
              <span>{muted ? t('call.micOff') : t('call.micOn')}</span>
              <span>
                {cameraOn && (localStream?.getVideoTracks().length ?? 0) > 0
                  ? t('call.cameraOn')
                  : t('call.cameraOff')}
              </span>
            </div>
          </div>
          <div className={styles.participant}>
            <div className={styles.participantHeader}>
              <span className={styles.participantName}>{t('call.peer')}</span>
              <StatusPill tone={remoteStream !== null ? 'success' : 'warning'}>
                {remoteStream !== null ? t('call.modeConnected') : t('call.modeWaiting')}
              </StatusPill>
            </div>
            <div className={styles.participantMeta}>
              <span>
                {t('call.peerLanguage')}: {peerLanguage.toUpperCase()}
              </span>
              <span>
                {t('call.remoteVoice')}: {t(GENDER_LABELS[remoteGender])}
              </span>
              {dubbingActive ? <span>{t('call.dubbingBusy')}</span> : null}
            </div>
          </div>
        </Widget>

        <Widget
          id="connection"
          title={t('call.connection')}
          badge={modeLabel}
          defaultOpen
        >
          {error !== null ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          {restored && mode === null ? (
            <p className={styles.hint}>{t('call.restored')}</p>
          ) : null}

          {restored && mode === null && entry === 'quick' && quickCode.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className={styles.hint}>{t('call.restoredRoom', { code: quickCode })}</p>
              <Button variant="primary" fullWidth onClick={() => void beginQuickHost(quickCode)}>
                {t('call.resumeRoom')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => hangup()}>
                {t('call.cancel')}
              </Button>
            </div>
          ) : null}

          {mode === null && entry === 'none' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button variant="primary" fullWidth onClick={() => setEntry('quick')}>
                {t('call.quickTest')}
              </Button>
              <Button variant="secondary" fullWidth onClick={() => setEntry('manual')}>
                {t('call.manualEntry')}
              </Button>
            </div>
          ) : null}

          {mode === null && entry === 'quick' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className={styles.hint}>{t('call.quickTestHint')}</p>
              <Button variant="primary" fullWidth onClick={() => void beginQuickHost()}>
                {t('call.createQuickRoom')}
              </Button>
              <input
                value={quickInput}
                onChange={(event) => setQuickInput(normalizeRoomCode(event.currentTarget.value))}
                placeholder={t('call.roomCodePlaceholder')}
                aria-label={t('call.roomCode')}
                style={{
                  width: '100%',
                  minWidth: 0,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-elevated)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-lg)',
                  letterSpacing: '0.2em',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                }}
              />
              <Button variant="secondary" fullWidth onClick={() => void beginQuickGuest()}>
                {t('call.joinQuickRoom')}
              </Button>
              <p className={styles.hint}>{t('call.sameBrowserHint')}</p>
              <Button variant="ghost" size="sm" onClick={() => setEntry('none')}>
                {t('call.cancel')}
              </Button>
            </div>
          ) : null}

          {mode === 'quick-host' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={styles.roomCode}>
                <span className={styles.roomCodeValue} data-testid="room-code">{quickCode}</span>
                <Button size="sm" onClick={() => void copyRoomCode()}>
                  {roomCopied ? t('call.copiedRoom') : t('chat.copy')}
                </Button>
              </div>
              <p className={styles.hint}>{t('call.openSecondTab')}</p>
              <StatusPill tone={sessionState === 'connected' ? 'success' : 'warning'}>
                {sessionState === 'connected' ? t('call.modeConnected') : t('call.quickWaiting')}
              </StatusPill>
              <Button variant="ghost" size="sm" onClick={hangup}>
                {t('call.cancel')}
              </Button>
            </div>
          ) : null}

          {mode === 'quick-guest' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <StatusPill tone={sessionState === 'connected' ? 'success' : 'warning'}>
                {sessionState === 'connected' ? t('call.modeConnected') : t('call.modeWaiting')}
              </StatusPill>
              <Button variant="ghost" size="sm" onClick={hangup}>
                {t('call.cancel')}
              </Button>
            </div>
          ) : null}

          {mode === null && entry === 'manual' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className={styles.hint}>{t('call.manualHint')}</p>
              <Button variant="primary" fullWidth onClick={() => void beginManualHost()}>
                {t('manual.createOffer')}
              </Button>
              <TextArea
                label={t('manual.pasteOffer')}
                value={pastedCode}
                onChange={(event) => setPastedCode(event.currentTarget.value)}
                rows={4}
              />
              <Button variant="secondary" fullWidth onClick={() => void beginManualGuest()}>
                {t('manual.generateAnswer')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEntry('none')}>
                {t('call.cancel')}
              </Button>
            </div>
          ) : null}

          {mode === 'manual' && manualStage === 'host' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <TokenField
                label={t('manual.offerCode')}
                value={offerCode}
                copyLabel={t('chat.copy')}
                copiedLabel={t('chat.copied')}
                hint={t('manual.hintOffer')}
              />
              <TextArea
                label={t('manual.pasteAnswer')}
                value={pastedCode}
                onChange={(event) => setPastedCode(event.currentTarget.value)}
                rows={4}
              />
              <Button variant="primary" fullWidth onClick={() => void submitManualAnswer()}>
                {t('manual.connect')}
              </Button>
            </div>
          ) : null}

          {mode === 'manual' && manualStage === 'guest' ? (
            <p className={styles.hint}>{t('call.modePreparing')}</p>
          ) : null}

          {mode === 'manual' && manualStage === 'guest-answer' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <TokenField
                label={t('manual.answerCode')}
                value={answerCode}
                copyLabel={t('chat.copy')}
                copiedLabel={t('chat.copied')}
                hint={t('manual.hintAnswer')}
              />
              <StatusPill tone={sessionState === 'connected' ? 'success' : 'warning'}>
                {sessionState === 'connected' ? t('call.modeConnected') : t('call.modeWaiting')}
              </StatusPill>
            </div>
          ) : null}
        </Widget>

        <Widget id="translation" title={t('call.translationPanel')} defaultOpen>
          <div className={styles.participantMeta}>
            <span>
              {t('call.yourLanguage')}: {localLanguage.toUpperCase()}
            </span>
            <span>
              {t('call.peerLanguage')}: {peerLanguage.toUpperCase()}
            </span>
          </div>
          {!translationSupported ? (
            <p className={styles.hint}>{t('call.translationUnavailable')}</p>
          ) : null}
          {!ttsSupported ? <p className={styles.hint}>{t('translate.unsupportedTts')}</p> : null}
          <Switch
            checked={dubbing}
            onChange={setDubbing}
            label={t('call.dubbing')}
            description={t('call.dubbingHint')}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className={styles.hint}>{t('translate.voice.label')}</span>
            <SegmentedControl
              label={t('translate.voice.label')}
              value={voiceMode}
              options={[
                { value: 'auto', label: t('translate.voice.auto') },
                { value: 'female', label: t('translate.voice.female') },
                { value: 'male', label: t('translate.voice.male') },
              ]}
              onChange={setVoiceMode}
            />
          </div>
          <StatusPill tone={translationState === 'idle' ? 'neutral' : 'success'}>
            {translationState === 'idle' ? t('call.waitingPeerSpeech') : t('call.listeningYou')}
          </StatusPill>
          {translationError !== null ? (
            <p className={styles.error}>
              {t('call.translationError')}: {translationError}
            </p>
          ) : null}
        </Widget>

        <Widget
          id="debug"
          title={t('call.debugConsole')}
          badge={`${logs.length}`}
          defaultOpen={false}
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={() => loggerRef.current.clear()}>
                {t('call.clearLogs')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void copyLogs()}>
                {t('call.copyLogs')}
              </Button>
            </>
          }
        >
          <div className={styles.logList}>
            {logs.length === 0 ? (
              <span className={styles.logLine}>{t('translate.empty')}</span>
            ) : (
              logs.map((entry) => (
                <div key={entry.id} className={`${styles.logLine} ${styles[`log${entry.level[0]?.toUpperCase()}${entry.level.slice(1)}`] ?? ''}`}>
                  <span className={styles.logTime}>{new Date(entry.time).toLocaleTimeString()}</span>
                  {entry.level.toUpperCase()} {entry.message}
                </div>
              ))
            )}
          </div>
        </Widget>
      </aside>
    </div>
  );
}
