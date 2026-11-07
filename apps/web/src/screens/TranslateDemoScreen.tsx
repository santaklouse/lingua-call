import { useEffect, useMemo, useRef, useState } from 'react';
import { createTranslator } from '@linguacall/i18n';
import type { Language, MessageKey } from '@linguacall/i18n';
import {
  LatencyRecorder,
  TranslationPipeline,
} from '@linguacall/translation';
import type { PipelineState, Segment, TtsEngine } from '@linguacall/translation';
import { Button, Card, ScreenShell, StatusPill, Switch } from '../ui';
import { useRouter } from '../router/context';
import { UnsupportedEngineError } from '../translation/engines/errors';
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

const STAGES = ['asr', 'mt', 'tts', 'e2e'] as const;
const STAGE_LABELS: Record<(typeof STAGES)[number], MessageKey> = {
  asr: 'translate.stage.asr',
  mt: 'translate.stage.mt',
  tts: 'translate.stage.tts',
  e2e: 'translate.stage.e2e',
};

const STATE_LABELS: Record<PipelineState, MessageKey> = {
  idle: 'translate.idle',
  listening: 'translate.listening',
  translating: 'translate.translating',
  speaking: 'translate.speaking',
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

function otherLanguage(language: Language): Language {
  return language === 'ru' ? 'en' : 'ru';
}

export function TranslateDemoScreen() {
  const { state, go } = useRouter();
  const nativeLanguage = state.nativeLanguage ?? 'en';
  const t = createTranslator(nativeLanguage);

  const asrSupported = useMemo(() => isWebSpeechAsrSupported(), []);
  const mtSupported = useMemo(() => isChromeTranslatorSupported(), []);
  const ttsSupported = useMemo(() => isWebSpeechTtsSupported(), []);
  const canStart = asrSupported && mtSupported;

  const [source, setSource] = useState<Language>(otherLanguage(nativeLanguage));
  const [target, setTarget] = useState<Language>(nativeLanguage);
  const [dubbing, setDubbing] = useState(true);
  const [status, setStatus] = useState<PipelineState>('idle');
  const [partial, setPartial] = useState('');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [latencyVersion, setLatencyVersion] = useState(0);

  const pipelineRef = useRef<TranslationPipeline | null>(null);
  const latencyRef = useRef<LatencyRecorder>(new LatencyRecorder());
  const running = status !== 'idle';

  useEffect(() => {
    return () => {
      void pipelineRef.current?.stop();
      pipelineRef.current = null;
    };
  }, []);

  const start = async () => {
    setError(null);
    setPartial('');
    try {
      const engines = {
        asr: createWebSpeechAsr(),
        mt: createChromeTranslator(),
        tts: ttsSupported ? createWebSpeechTts() : createNoopTts(),
      };
      const pipeline = new TranslationPipeline({
        engines,
        sourceLanguage: source,
        targetLanguage: target,
        dubbing: dubbing && ttsSupported,
        latency: latencyRef.current,
        onPartial: (text) => setPartial(text),
        onSegment: (segment) => {
          setPartial('');
          setSegments((current) => [...current.slice(-19), segment]);
          setLatencyVersion((value) => value + 1);
        },
        onState: (next) => {
          setStatus(next);
          setLatencyVersion((value) => value + 1);
        },
        onError: (cause) => setError(cause.message),
      });
      pipelineRef.current = pipeline;
      await pipeline.start();
    } catch (cause) {
      setStatus('idle');
      setError(
        cause instanceof UnsupportedEngineError
          ? t(cause.engine.includes('Translator') ? 'translate.unsupportedMt' : 'translate.unsupportedAsr')
          : cause instanceof Error
            ? cause.message
            : String(cause),
      );
    }
  };

  const stop = async () => {
    await pipelineRef.current?.stop();
    pipelineRef.current = null;
    setStatus('idle');
    setPartial('');
    setLatencyVersion((value) => value + 1);
  };

  const clear = () => {
    setSegments([]);
    setPartial('');
    latencyRef.current.reset();
    setLatencyVersion((value) => value + 1);
  };

  const swap = () => {
    const nextSource = target;
    setSource(nextSource);
    setTarget(source);
  };

  const latency = latencyRef.current.summary();
  void latencyVersion;

  const tone =
    status === 'listening'
      ? ('success' as const)
      : status === 'translating' || status === 'speaking'
        ? ('warning' as const)
        : ('neutral' as const);

  return (
    <ScreenShell
      title={t('translate.title')}
      subtitle={t('translate.subtitle')}
      footer={
        <Button variant="ghost" fullWidth onClick={() => (running ? void stop() : go('lobby'))}>
          {t('translate.back')}
        </Button>
      }
    >
      <Card>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          {t('translate.prototype')}
        </p>
        {!asrSupported ? (
          <p role="alert" style={{ color: 'var(--color-danger)', marginTop: 8 }}>
            {t('translate.unsupportedAsr')}
          </p>
        ) : null}
        {!mtSupported ? (
          <p role="alert" style={{ color: 'var(--color-danger)', marginTop: 8 }}>
            {t('translate.unsupportedMt')}
          </p>
        ) : null}
        {!ttsSupported ? (
          <p style={{ color: 'var(--color-warning)', marginTop: 8 }}>
            {t('translate.unsupportedTts')}
          </p>
        ) : null}
        {error !== null ? (
          <p role="alert" style={{ color: 'var(--color-danger)', marginTop: 8 }}>
            {error}
          </p>
        ) : null}
      </Card>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{t('translate.source')}</span>
            <strong>{source.toUpperCase()}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{t('translate.target')}</span>
            <strong>{target.toUpperCase()}</strong>
          </div>
          <Button variant="secondary" size="sm" fullWidth disabled={running} onClick={swap}>
            {t('translate.swap')}
          </Button>
          <Switch checked={dubbing} onChange={setDubbing} label={t('translate.dubbing')} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusPill tone={tone}>{t(STATE_LABELS[status])}</StatusPill>
            {running ? (
              <Button variant="danger" size="sm" onClick={() => void stop()}>
                {t('translate.stop')}
              </Button>
            ) : (
              <Button variant="primary" size="sm" disabled={!canStart} onClick={() => void start()}>
                {t('translate.start')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={clear}>
              {t('translate.clear')}
            </Button>
          </div>
          <p style={{ color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>
            {t('translate.micHint')}
          </p>
        </div>
      </Card>

      <Card>
        <strong>{t('translate.partial')}</strong>
        <p style={{ color: 'var(--color-text-muted)', minHeight: 24, marginTop: 8 }}>
          {partial.length > 0 ? partial : ' '}
        </p>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{t('translate.transcript')}</strong>
          <Button variant="ghost" size="sm" onClick={clear}>
            {t('translate.clear')}
          </Button>
        </div>
        {segments.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', marginTop: 8 }}>{t('translate.empty')}</p>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 10 }}>
            {segments.map((segment) => {
              const mt = segment.timings.find((timing) => timing.stage === 'mt');
              const mtMs = mt === undefined ? null : Math.round(mt.endMs - mt.startMs);
              return (
                <li key={segment.id}>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                    {segment.srcText}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span>{segment.dstText}</span>
                    {mtMs !== null ? (
                      <span style={{ color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>
                        MT {mtMs} ms
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card>
        <strong>{t('translate.latency')}</strong>
        <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ color: 'var(--color-text-muted)', textAlign: 'left' }}>
              <th style={{ fontWeight: 500, padding: '4px 0' }} />
              <th style={{ fontWeight: 500 }}>{t('translate.metric.last')}</th>
              <th style={{ fontWeight: 500 }}>{t('translate.metric.p50')}</th>
              <th style={{ fontWeight: 500 }}>{t('translate.metric.p90')}</th>
              <th style={{ fontWeight: 500 }}>{t('translate.metric.count')}</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((stage) => {
              const value = latency[stage];
              return (
                <tr key={stage}>
                  <td style={{ padding: '4px 0', color: 'var(--color-text-muted)' }}>
                    {t(STAGE_LABELS[stage])}
                  </td>
                  <td>{value ? Math.round(value.last) : '—'}</td>
                  <td>{value ? Math.round(value.p50) : '—'}</td>
                  <td>{value ? Math.round(value.p90) : '—'}</td>
                  <td>{value ? value.count : 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </ScreenShell>
  );
}
