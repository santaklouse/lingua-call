import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranslator } from '@linguacall/i18n';
import type { MessageKey } from '@linguacall/i18n';
import { Button, Card, ScreenShell, Switch } from '../ui';
import { useRouter } from '../router/context';
import { loadMediaPreferences, saveMediaPreferences } from '../storage/preferences';

type Status = 'requesting' | 'ready' | 'error';

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function errorKey(error: unknown): MessageKey {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'devices.permissionDenied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'devices.notFound';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'devices.busy';
  if (name === 'OverconstrainedError') return 'devices.deviceUnavailable';
  return 'devices.error';
}

export function DevicesScreen() {
  const { state, goWith, go } = useRouter();
  const t = createTranslator(state.nativeLanguage ?? 'en');

  const [status, setStatus] = useState<Status>('requesting');
  const [error, setError] = useState<MessageKey | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState('');
  const [microphoneId, setMicrophoneId] = useState('');
  const [level, setLevel] = useState(0);
  const [loopback, setLoopback] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopbackRef = useRef(false);

  useEffect(() => {
    loopbackRef.current = loopback;
    if (gainRef.current !== null && audioContextRef.current !== null) {
      gainRef.current.gain.setTargetAtTime(loopback ? 1 : 0, audioContextRef.current.currentTime, 0.05);
    }
  }, [loopback]);

  const teardownMedia = useCallback(() => {
    if (levelTimerRef.current !== null) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
    gainRef.current?.disconnect();
    gainRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    if (streamRef.current !== null) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  const setupMeter = useCallback((stream: MediaStream) => {
    const AudioContextCtor =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor === undefined) return;
    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const gain = context.createGain();
    gain.gain.value = loopbackRef.current ? 1 : 0;
    source.connect(analyser);
    source.connect(gain);
    gain.connect(context.destination);
    audioContextRef.current = context;
    gainRef.current = gain;

    const samples = new Uint8Array(analyser.fftSize);
    levelTimerRef.current = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const value = (sample - 128) / 128;
        sum += value * value;
      }
      setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 3));
    }, 80);
  }, []);

  const start = useCallback(
    async (ids?: { cameraId?: string; microphoneId?: string }) => {
      teardownMedia();
      setStatus('requesting');
      setError(null);
      if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
        setStatus('error');
        setError('devices.permissionDenied');
        return;
      }
      try {
        const video: MediaTrackConstraints = { ...VIDEO_CONSTRAINTS };
        if (ids?.cameraId) video.deviceId = { exact: ids.cameraId };
        const audio: MediaTrackConstraints = { ...AUDIO_CONSTRAINTS };
        if (ids?.microphoneId) audio.deviceId = { exact: ids.microphoneId };

        const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
        streamRef.current = stream;
        if (videoRef.current !== null) videoRef.current.srcObject = stream;
        setupMeter(stream);

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === 'videoinput');
        const audioDevices = devices.filter((device) => device.kind === 'audioinput');
        setCameras(videoDevices);
        setMicrophones(audioDevices);
        if (!ids?.cameraId) {
          setCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? videoDevices[0]?.deviceId ?? '');
        }
        if (!ids?.microphoneId) {
          setMicrophoneId(
            stream.getAudioTracks()[0]?.getSettings().deviceId ?? audioDevices[0]?.deviceId ?? '',
          );
        }
        setStatus('ready');
      } catch (cause) {
        setStatus('error');
        setError(errorKey(cause));
      }
    },
    [setupMeter, teardownMedia],
  );

  useEffect(() => {
    const saved = loadMediaPreferences();
    setCameraId(saved.cameraId ?? '');
    setMicrophoneId(saved.microphoneId ?? '');
    void start(saved);
    const onDeviceChange = () => {
      void navigator.mediaDevices.enumerateDevices().then((devices) => {
        setCameras(devices.filter((device) => device.kind === 'videoinput'));
        setMicrophones(devices.filter((device) => device.kind === 'audioinput'));
      });
    };
    navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange);
      teardownMedia();
    };
  }, [start, teardownMedia]);

  const changeCamera = (deviceId: string) => {
    setCameraId(deviceId);
    void start({ cameraId: deviceId, microphoneId });
  };

  const changeMicrophone = (deviceId: string) => {
    setMicrophoneId(deviceId);
    void start({ cameraId, microphoneId: deviceId });
  };

  const proceed = () => {
    saveMediaPreferences({ cameraId, microphoneId });
    goWith({ type: 'setDevicesReady', ready: true }, 'call');
  };

  return (
    <ScreenShell
      title={t('devices.title')}
      subtitle={t('devices.subtitle')}
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={status !== 'ready'}
            onClick={proceed}
          >
            {t('devices.continue')}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => go('lobby')}>
            {t('common.back')}
          </Button>
        </div>
      }
    >
      <Card>
        <div
          style={{
            position: 'relative',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            background: '#000',
            aspectRatio: '16 / 9',
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {status === 'requesting' ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-muted)',
                background: 'rgba(0,0,0,0.45)',
              }}
            >
              {t('devices.requesting')}
            </div>
          ) : null}
        </div>

        {error !== null ? (
          <div style={{ marginTop: 12 }}>
            <p role="alert" style={{ color: 'var(--color-danger)' }}>
              {t(error)}
            </p>
            <Button size="sm" variant="secondary" onClick={() => void start({ cameraId, microphoneId })}>
              {t('devices.retry')}
            </Button>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              {t('devices.camera')}
            </span>
            <select
              value={cameraId}
              onChange={(event) => changeCamera(event.currentTarget.value)}
              style={selectStyle}
            >
              {cameras.length === 0 ? <option value="">—</option> : null}
              {cameras.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `${t('devices.camera')} ${index + 1}`}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              {t('devices.microphone')}
            </span>
            <select
              value={microphoneId}
              onChange={(event) => changeMicrophone(event.currentTarget.value)}
              style={selectStyle}
            >
              {microphones.length === 0 ? <option value="">—</option> : null}
              {microphones.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `${t('devices.microphone')} ${index + 1}`}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)',
              }}
            >
              <span>{t('devices.micLevel')}</span>
              <span>{Math.round(level * 100)}%</span>
            </div>
            <div
              style={{
                height: 8,
                marginTop: 6,
                borderRadius: 999,
                background: 'var(--color-surface-3)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.round(level * 100)}%`,
                  background: level > 0.7 ? 'var(--color-warning)' : 'var(--color-success)',
                  transition: 'width 80ms linear',
                }}
              />
            </div>
          </div>

          <Switch
            checked={loopback}
            onChange={setLoopback}
            label={t('devices.loopback')}
            description={t('devices.loopbackHint')}
          />
        </div>
      </Card>
    </ScreenShell>
  );
}

const selectStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-elevated)',
  color: 'var(--color-text)',
} as const;
