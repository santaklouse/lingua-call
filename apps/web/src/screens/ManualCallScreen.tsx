import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTranslator } from '@linguacall/i18n';
import type { Language, MessageKey } from '@linguacall/i18n';
import { TranslationPipeline, decodeCallMessage, encodeCallMessage } from '@linguacall/translation';
import type { PipelineState, Segment, TtsEngine, VoiceGender } from '@linguacall/translation';
import { Button, Card, IconButton, ScreenShell, StatusPill, Switch, TextArea, TokenField } from '../ui';
import { useRouter } from '../router/context';
import {
  ManualCallError,
  acceptAnswerCode,
  createCallerSession,
  createCalleeSession,
  disposeCall,
  waitForChannelOpen,
} from '../media/manual-rtc';
import { createRemoteAudioMixer } from '../media/remote-audio';
import type { RemoteAudioMixer } from '../media/remote-audio';
import { otherLanguage } from '../translation/languages';
import { startStreamPitchTracker } from '../translation/pitch-tracker';
import type { PitchTracker } from '../translation/pitch-tracker';
import {
  createWebSpeechAsr,
  isWebSpeechAsrSupported,
} from '../translation/engines/web-speech-asr';
import {
  createChromeTranslator,
  isChromeTranslatorSupported,
} from '../translation/engines/chrome-translator';
import {
  createWebSpeechTts,
  isWebSpeechTtsSupported,
} from '../translation/engines/web-speech-tts';

type Phase = 'choice' | 'caller' | 'callee' | 'connected';

type CallSessionLike = { channel: Promise<RTCDataChannel> };

type CallSubtitle = {
  key: string;
  direction: 'you' | 'peer';
  srcText: string;
  dstText: string;
};

const ERROR_MESSAGES: Record<'invalid-code' | 'media' | 'connection', MessageKey> = {
  'invalid-code': 'manual.invalidCode',
  media: 'manual.mediaError',
  connection: 'manual.connectionError',
};

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

export function ManualCallScreen() {
  const { state } = useRouter();
  const t = createTranslator(state.nativeLanguage ?? 'en');
  const localLanguage: Language = state.nativeLanguage ?? 'en';

  const translationSupported = useMemo(
    () => isWebSpeechAsrSupported() && isChromeTranslatorSupported(),
    [],
  );
  const ttsSupported = useMemo(() => isWebSpeechTtsSupported(), []);

  const [phase, setPhase] = useState<Phase>('choice');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [offerCode, setOfferCode] = useState('');
  const [answerCode, setAnswerCode] = useState('');
  const [pastedCode, setPastedCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);

  const [peerLanguage, setPeerLanguage] = useState<Language>(otherLanguage(localLanguage));
  const [subtitles, setSubtitles] = useState<CallSubtitle[]>([]);
  const [localPartial, setLocalPartial] = useState('');
  const [translationState, setTranslationState] = useState<PipelineState>('idle');
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [dubbing, setDubbing] = useState(true);
  const [remoteGender, setRemoteGender] = useState<VoiceGender>('unknown');
  const [remoteAudioMixed, setRemoteAudioMixed] = useState(false);

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

  const fail = useCallback(
    (cause: unknown) => {
      if (cause instanceof ManualCallError) {
        setError(t(ERROR_MESSAGES[cause.code]));
      } else {
        setError(cause instanceof Error ? cause.message : t('manual.connectionError'));
      }
    },
    [t],
  );

  useEffect(() => {
    peerLanguageRef.current = peerLanguage;
  }, [peerLanguage]);

  useEffect(() => {
    dubbingRef.current = dubbing;
    if (!dubbing) {
      pendingSpeechRef.current = null;
      ttsRef.current?.cancel();
      mixerRef.current?.duck(false);
    }
  }, [dubbing]);

  const pushSubtitle = useCallback((direction: 'you' | 'peer', srcText: string, dstText: string) => {
    subtitleKeyRef.current += 1;
    const entry: CallSubtitle = {
      key: `sub-${subtitleKeyRef.current}`,
      direction,
      srcText,
      dstText,
    };
    setSubtitles((current) => [...current.slice(-11), entry]);
  }, []);

  const playSpeech = useCallback(
    async (text: string) => {
      const tts = ttsRef.current;
      if (tts === null) return;
      speechBusyRef.current = true;
      mixerRef.current?.duck(true);
      try {
        await tts.speak(text, localLanguage, { gender: remoteGenderRef.current });
      } catch {
        // Dubbing failures must not break the call.
      } finally {
        mixerRef.current?.duck(false);
        speechBusyRef.current = false;
        const next = pendingSpeechRef.current;
        pendingSpeechRef.current = null;
        if (next !== null) void playSpeech(next);
      }
    },
    [localLanguage],
  );

  const enqueueSpeech = useCallback(
    (text: string) => {
      if (!dubbingRef.current || ttsRef.current === null) return;
      // Keep only the newest pending phrase so dubbing catches up with the call.
      if (speechBusyRef.current) {
        pendingSpeechRef.current = text;
        return;
      }
      void playSpeech(text);
    },
    [playSpeech],
  );

  const handleIncomingSubtitle = useCallback(
    (message: {
      id: number;
      srcText: string;
      dstText: string;
    }) => {
      pushSubtitle('peer', message.srcText, message.dstText);
      enqueueSpeech(message.dstText);
    },
    [enqueueSpeech, pushSubtitle],
  );

  const setupTranslation = useCallback(
    async (session: CallSessionLike) => {
      try {
        const channel = await session.channel;
        await waitForChannelOpen(channel);
        if (pcRef.current === null) return;
        channelRef.current = channel;
        channel.send(encodeCallMessage({ type: 'hello', lang: localLanguage }));
        channel.onmessage = (event: MessageEvent) => {
          const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '');
          const message = decodeCallMessage(raw);
          if (message === null) return;
          if (message.type === 'hello') {
            setPeerLanguage(message.lang);
            peerLanguageRef.current = message.lang;
            pipelineRef.current?.setLanguages(localLanguage, message.lang);
            return;
          }
          handleIncomingSubtitle(message);
        };

        if (!translationSupported) return;

        if (ttsSupported) {
          const tts = createWebSpeechTts();
          ttsRef.current = tts;
          void tts.warmup?.().catch(() => {});
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
          onError: (cause) => setTranslationError(cause.message),
          onState: (next) => setTranslationState(next),
        });
        pipelineRef.current = pipeline;
        await pipeline.start();
      } catch (cause) {
        setTranslationError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [
      handleIncomingSubtitle,
      localLanguage,
      pushSubtitle,
      translationSupported,
      ttsSupported,
    ],
  );

  const attachConnectionWatch = useCallback(
    (pc: RTCPeerConnection) => {
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'connected') setPhase('connected');
        if (pc.connectionState === 'failed') setPhase('choice');
      });
      pc.addEventListener('track', (event: RTCTrackEvent) => {
        const [stream] = event.streams;
        if (stream !== undefined) setRemoteStream(stream);
      });
    },
    [],
  );

  useEffect(() => {
    localStreamRef.current = localStream;
    if (localVideoRef.current !== null) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current !== null) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  // Analyze the peer's voice so dubbing can pick a matching TTS voice.
  useEffect(() => {
    if (remoteStream === null) return;
    let disposed = false;
    void startStreamPitchTracker(remoteStream, (gender) => {
      remoteGenderRef.current = gender;
      setRemoteGender(gender);
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
  }, [remoteStream]);

  // Route the remote audio through WebAudio to duck the original during dubbing.
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
      })
      .catch(() => setRemoteAudioMixed(false));
    return () => {
      disposed = true;
      mixerRef.current?.dispose();
      mixerRef.current = null;
      setRemoteAudioMixed(false);
    };
  }, [remoteStream]);

  useEffect(() => {
    return () => {
      remoteTrackerRef.current?.stop();
      remoteTrackerRef.current = null;
      mixerRef.current?.dispose();
      mixerRef.current = null;
      ttsRef.current?.cancel();
      ttsRef.current = null;
      void pipelineRef.current?.stop();
      pipelineRef.current = null;
      channelRef.current = null;
      disposeCall(pcRef.current, localStreamRef.current);
    };
  }, []);

  const hangup = () => {
    remoteTrackerRef.current?.stop();
    remoteTrackerRef.current = null;
    mixerRef.current?.dispose();
    mixerRef.current = null;
    ttsRef.current?.cancel();
    ttsRef.current = null;
    void pipelineRef.current?.stop();
    pipelineRef.current = null;
    channelRef.current = null;
    disposeCall(pcRef.current, localStream);
    pcRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setPhase('choice');
    setOfferCode('');
    setAnswerCode('');
    setPastedCode('');
    setError(null);
    setMuted(false);
    setCameraOn(true);
    setSubtitles([]);
    setLocalPartial('');
    setTranslationError(null);
    setTranslationState('idle');
    setRemoteAudioMixed(false);
    setRemoteGender('unknown');
    remoteGenderRef.current = 'unknown';
  };

  const startCaller = async () => {
    setError(null);
    setPhase('caller');
    try {
      const session = await createCallerSession();
      pcRef.current = session.pc;
      attachConnectionWatch(session.pc);
      setLocalStream(session.localStream);
      setOfferCode(session.offerCode);
      void setupTranslation(session);
    } catch (cause) {
      fail(cause);
      setPhase('choice');
    }
  };

  const startCallee = () => {
    setError(null);
    setPastedCode('');
    setPhase('callee');
  };

  const submitOffer = async () => {
    setError(null);
    try {
      const session = await createCalleeSession(pastedCode);
      pcRef.current = session.pc;
      attachConnectionWatch(session.pc);
      setLocalStream(session.localStream);
      setAnswerCode(session.answerCode);
      void setupTranslation(session);
    } catch (cause) {
      fail(cause);
    }
  };

  const submitAnswer = async () => {
    setError(null);
    const pc = pcRef.current;
    if (pc === null) return;
    try {
      await acceptAnswerCode(pc, pastedCode);
    } catch (cause) {
      fail(cause);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    for (const track of localStream?.getAudioTracks() ?? []) track.enabled = !next;
    setMuted(next);
  };

  const toggleCamera = () => {
    const next = !cameraOn;
    for (const track of localStream?.getVideoTracks() ?? []) track.enabled = next;
    setCameraOn(next);
  };

  const footer =
    phase === 'connected' ? (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
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
    ) : undefined;

  return (
    <ScreenShell title={t('manual.title')} subtitle={t('manual.subtitle')} footer={footer}>
      {error !== null ? (
        <Card>
          <p role="alert" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        </Card>
      ) : null}

      {phase === 'choice' ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Button variant="primary" size="lg" fullWidth onClick={() => void startCaller()}>
              {t('manual.createOffer')}
            </Button>
            <Button variant="secondary" size="lg" fullWidth onClick={startCallee}>
              {t('manual.join')}
            </Button>
          </div>
        </Card>
      ) : null}

      {phase === 'caller' ? (
        <>
          <Card>
            <TokenField
              label={t('manual.offerCode')}
              value={offerCode}
              copyLabel={t('chat.copy')}
              copiedLabel={t('chat.copied')}
              hint={t('manual.hintOffer')}
            />
          </Card>
          <Card>
            <TextArea
              label={t('manual.pasteAnswer')}
              value={pastedCode}
              onChange={(event) => setPastedCode(event.currentTarget.value)}
              rows={4}
            />
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" fullWidth onClick={() => void submitAnswer()}>
                {t('manual.connect')}
              </Button>
            </div>
          </Card>
        </>
      ) : null}

      {phase === 'callee' ? (
        <>
          {answerCode.length === 0 ? (
            <Card>
              <TextArea
                label={t('manual.pasteOffer')}
                value={pastedCode}
                onChange={(event) => setPastedCode(event.currentTarget.value)}
                hint={t('manual.hintPasteOffer')}
                rows={4}
              />
              <div style={{ marginTop: 12 }}>
                <Button variant="primary" fullWidth onClick={() => void submitOffer()}>
                  {t('manual.generateAnswer')}
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <TokenField
                label={t('manual.answerCode')}
                value={answerCode}
                copyLabel={t('chat.copy')}
                copiedLabel={t('chat.copied')}
                hint={t('manual.hintAnswer')}
              />
            </Card>
          )}
        </>
      ) : null}

      {phase !== 'choice' ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <StatusPill tone={phase === 'connected' ? 'success' : 'warning'}>
              {phase === 'connected' ? t('manual.connected') : t('manual.waiting')}
            </StatusPill>
            {remoteStream !== null ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted={remoteAudioMixed}
                style={{ width: '100%', borderRadius: 12, background: '#000' }}
              />
            ) : null}
            {localStream !== null ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', maxWidth: 240, borderRadius: 12, background: '#000' }}
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      {phase === 'connected' ? (
        <>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{t('call.liveTranslation')}</strong>
              <StatusPill tone={translationState === 'idle' ? 'neutral' : 'success'}>
                {translationState === 'idle' ? t('call.waitingPeerSpeech') : t('call.listeningYou')}
              </StatusPill>
            </div>
            {!translationSupported ? (
              <p style={{ color: 'var(--color-warning)', marginTop: 8 }}>
                {t('call.translationUnavailable')}
              </p>
            ) : null}
            {!ttsSupported ? (
              <p style={{ color: 'var(--color-warning)', marginTop: 8 }}>
                {t('translate.unsupportedTts')}
              </p>
            ) : null}
            <div style={{ marginTop: 12 }}>
              <Switch
                checked={dubbing}
                onChange={setDubbing}
                label={t('call.dubbing')}
                description={t('call.dubbingHint')}
              />
            </div>
            <p style={{ color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)', marginTop: 8 }}>
              {t('call.remoteVoice')}: {t(GENDER_LABELS[remoteGender])}
            </p>
            {translationError !== null ? (
              <p role="alert" style={{ color: 'var(--color-danger)', marginTop: 8 }}>
                {t('call.translationError')}: {translationError}
              </p>
            ) : null}
          </Card>

          <Card>
            {subtitles.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)' }}>{t('call.subtitlesEmpty')}</p>
            ) : (
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                {subtitles.map((subtitle) => (
                  <li key={subtitle.key}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>
                      {subtitle.direction === 'you' ? t('call.you') : t('call.peer')}
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                      {subtitle.srcText}
                    </div>
                    <div>{subtitle.dstText}</div>
                  </li>
                ))}
              </ol>
            )}
            {localPartial.length > 0 ? (
              <p style={{ color: 'var(--color-text-faint)', marginTop: 8 }}>{localPartial}</p>
            ) : null}
          </Card>
        </>
      ) : null}
    </ScreenShell>
  );
}
