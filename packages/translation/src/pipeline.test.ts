import { describe, expect, it } from 'bun:test';
import { LatencyRecorder } from './latency';
import { TranslationPipeline } from './pipeline';
import type { AsrEngine, AsrResult, MtEngine, Segment, TtsEngine } from './types';

function createEngines(speakImpl?: (text: string) => Promise<void>) {
  let asrResult: ((result: AsrResult) => void) | null = null;
  const translations: string[] = [];
  const spoken: string[] = [];
  const warmups: string[] = [];
  const speakOptions: Array<{ gender?: string }> = [];
  let cancelled = 0;

  const asr: AsrEngine = {
    id: 'test-asr',
    languages: ['ru', 'en'],
    async start(_language, onResult) {
      asrResult = onResult;
    },
    async stop() {
      asrResult = null;
    },
  };

  const mt: MtEngine = {
    id: 'test-mt',
    pairs: [
      ['ru', 'en'],
      ['en', 'ru'],
    ],
    supports: () => true,
    async warmup() {
      warmups.push('mt');
    },
    async translate(text) {
      translations.push(text);
      return `[en] ${text}`;
    },
  };

  const tts: TtsEngine = {
    id: 'test-tts',
    languages: ['ru', 'en'],
    supports: () => true,
    async warmup() {
      warmups.push('tts');
    },
    async speak(text, _language, options) {
      spoken.push(text);
      speakOptions.push({ gender: options?.gender });
      if (speakImpl !== undefined) await speakImpl(text);
    },
    cancel() {
      cancelled += 1;
    },
  };

  return {
    engines: { asr, mt, tts },
    get asrResult() {
      return asrResult;
    },
    translations,
    spoken,
    warmups,
    speakOptions,
    get cancelled() {
      return cancelled;
    },
  };
}

function createPipeline(overrides?: {
  dubbing?: boolean;
  latency?: LatencyRecorder;
  ttsSpeak?: (text: string) => Promise<void>;
  voiceGender?: 'male' | 'female' | 'unknown';
}) {
  const harness = createEngines(overrides?.ttsSpeak);
  let clock = 0;
  const segments: Segment[] = [];
  const partials: string[] = [];
  const errors: Error[] = [];
  const pipeline = new TranslationPipeline({
    engines: harness.engines,
    sourceLanguage: 'ru',
    targetLanguage: 'en',
    dubbing: overrides?.dubbing ?? true,
    latency: overrides?.latency,
    getVoiceGender: () => overrides?.voiceGender ?? 'unknown',
    now: () => {
      clock += 10;
      return clock;
    },
    onPartial: (text) => {
      if (text.length > 0) partials.push(text);
    },
    onSegment: (segment) => segments.push(segment),
    onError: (error) => errors.push(error),
  });
  return { pipeline, harness, segments, partials, errors };
}

describe('TranslationPipeline', () => {
  it('forwards partial results', async () => {
    const { pipeline, harness, partials } = createPipeline();
    await pipeline.start();
    harness.asrResult?.({ segmentId: 1, text: 'privet', final: false, atMs: 100 });
    expect(partials).toEqual(['privet']);
  });

  it('translates final segments, emits subtitles and speaks the translation', async () => {
    const latency = new LatencyRecorder();
    const { pipeline, harness, segments } = createPipeline({ latency });
    await pipeline.start();
    harness.asrResult?.({ segmentId: 1, text: 'privet', final: true, atMs: 100 });
    await pipeline.whenIdle();

    expect(harness.translations).toEqual(['privet']);
    expect(harness.spoken).toEqual(['[en] privet']);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.dstText).toBe('[en] privet');
    expect(segments[0]?.timings.map((timing) => timing.stage)).toEqual(['asr', 'mt']);

    const summary = latency.summary();
    expect(summary.mt?.count).toBe(1);
    expect(summary.tts?.count).toBe(1);
  });

  it('does not speak when dubbing is disabled', async () => {
    const { pipeline, harness } = createPipeline({ dubbing: false });
    await pipeline.start();
    harness.asrResult?.({ segmentId: 1, text: 'privet', final: true, atMs: 100 });
    await pipeline.whenIdle();
    expect(harness.spoken).toEqual([]);
  });

  it('cancels speech and stops the ASR engine', async () => {
    const { pipeline, harness } = createPipeline();
    await pipeline.start();
    await pipeline.stop();
    expect(harness.cancelled).toBeGreaterThan(0);
    expect(harness.asrResult).toBeNull();
  });

  it('warms up engines before listening', async () => {
    const { pipeline, harness } = createPipeline();
    await pipeline.start();
    expect(harness.warmups).toEqual(['mt', 'tts']);
  });

  it('passes the detected speaker gender to TTS', async () => {
    const { pipeline, harness } = createPipeline({ voiceGender: 'female' });
    await pipeline.start();
    harness.asrResult?.({ segmentId: 1, text: 'privet', final: true, atMs: 100 });
    await pipeline.whenIdle();
    expect(harness.speakOptions[0]?.gender).toBe('female');
  });

  it('emits subtitles before speech playback finishes', async () => {
    const speech: { finish: (() => void) | null } = { finish: null };
    const { pipeline, harness, segments } = createPipeline({
      ttsSpeak: () =>
        new Promise<void>((resolve) => {
          speech.finish = resolve;
        }),
    });
    await pipeline.start();
    harness.asrResult?.({ segmentId: 1, text: 'privet', final: true, atMs: 100 });

    // Wait for MT + segment emission while TTS is still pending.
    for (let i = 0; i < 20 && segments.length === 0; i += 1) await new Promise((r) => setTimeout(r, 0));
    expect(segments).toHaveLength(1);
    expect(harness.spoken).toEqual(['[en] privet']);

    speech.finish?.();
    await pipeline.whenIdle();
  });

  it('reports MT errors and keeps running', async () => {
    const { pipeline, harness, errors } = createPipeline();
    harness.engines.mt.translate = async () => {
      throw new Error('mt failed');
    };
    await pipeline.start();
    harness.asrResult?.({ segmentId: 1, text: 'privet', final: true, atMs: 100 });
    await pipeline.whenIdle();
    expect(errors.map((error) => error.message)).toEqual(['mt failed']);
  });
});
