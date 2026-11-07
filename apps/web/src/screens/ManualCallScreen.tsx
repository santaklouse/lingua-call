import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranslator } from '@linguacall/i18n';
import type { MessageKey } from '@linguacall/i18n';
import { Button, Card, IconButton, ScreenShell, StatusPill, TextArea, TokenField } from '../ui';
import { useRouter } from '../router/context';
import {
  ManualCallError,
  acceptAnswerCode,
  createCallerSession,
  createCalleeSession,
  disposeCall,
} from '../media/manual-rtc';

type Phase = 'choice' | 'caller' | 'callee' | 'connected';

const ERROR_MESSAGES: Record<'invalid-code' | 'media' | 'connection', MessageKey> = {
  'invalid-code': 'manual.invalidCode',
  media: 'manual.mediaError',
  connection: 'manual.connectionError',
};

export function ManualCallScreen() {
  const { state } = useRouter();
  const t = createTranslator(state.nativeLanguage ?? 'en');

  const [phase, setPhase] = useState<Phase>('choice');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [offerCode, setOfferCode] = useState('');
  const [answerCode, setAnswerCode] = useState('');
  const [pastedCode, setPastedCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

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

  const attachConnectionWatch = useCallback((pc: RTCPeerConnection) => {
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'connected') setPhase('connected');
      if (pc.connectionState === 'failed') setPhase('choice');
    });
    pc.addEventListener('track', (event: RTCTrackEvent) => {
      const [stream] = event.streams;
      if (stream !== undefined) setRemoteStream(stream);
    });
  }, []);

  useEffect(() => {
    if (localVideoRef.current !== null) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current !== null) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Dispose media only when leaving the screen, never when a new session starts.
  useEffect(() => {
    return () => disposeCall(pcRef.current, localStreamRef.current);
  }, []);

  const hangup = () => {
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
    </ScreenShell>
  );
}
