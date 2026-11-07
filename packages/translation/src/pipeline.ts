import type { AsrEngine, AsrResult, MtEngine, Segment, TtsEngine } from './types';
import type { LatencyRecorder } from './latency';
import type { VoiceGender } from './voice';

export type PipelineEngines = {
  asr: AsrEngine;
  mt: MtEngine;
  tts: TtsEngine;
};

export type PipelineOptions = {
  engines: PipelineEngines;
  sourceLanguage: Segment['srcLang'];
  targetLanguage: Segment['dstLang'];
  dubbing?: boolean;
  now?: () => number;
  latency?: LatencyRecorder;
  /** Speaker gender used to pick a matching TTS voice. */
  getVoiceGender?: () => VoiceGender;
  onPartial?: (text: string) => void;
  onSegment?: (segment: Segment) => void;
  onError?: (error: Error) => void;
  onState?: (state: PipelineState) => void;
};

export type PipelineState = 'idle' | 'listening' | 'translating' | 'speaking';

const WARMUP_TIMEOUT_MS = 2_500;
const PREFETCH_STABILITY_MS = 450;
const PREFETCH_MIN_CHARS = 3;
const PREFETCH_CACHE_LIMIT = 16;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Orchestrates the main feature: microphone → ASR → MT → subtitles → spoken
 * translation. Engines are injected, so the pipeline is fully unit-testable and
 * the same orchestration works with prototype browser engines or local WASM ones.
 *
 * Latency design:
 * - engines are warmed up before listening (model/voice loading hidden);
 * - stable partial hypotheses are translated in the background, so a final
 *   segment often reuses a cached translation;
 * - subtitles are emitted as soon as MT finishes, independently of TTS playback;
 * - speech is played by a single-slot queue: if the previous translation is still
 *   speaking, only the newest one is kept, so audio catches up instead of lagging.
 */
export class TranslationPipeline {
  private readonly options: PipelineOptions;
  private readonly now: () => number;
  private readonly latency?: LatencyRecorder;
  private nextSegmentId = 1;
  private running = false;
  private inflight = new Set<Promise<void>>();
  private speechBusy = false;
  private pendingSpeech: { text: string; target: Segment['dstLang'] } | null = null;
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPartialText = '';
  private readonly translationCache = new Map<string, string>();
  private sourceLanguage: Segment['srcLang'];
  private targetLanguage: Segment['dstLang'];
  private dubbing: boolean;

  constructor(options: PipelineOptions) {
    this.options = options;
    this.now = options.now ?? (() => (typeof performance === 'undefined' ? Date.now() : performance.now()));
    this.latency = options.latency;
    this.sourceLanguage = options.sourceLanguage;
    this.targetLanguage = options.targetLanguage;
    this.dubbing = options.dubbing ?? true;
  }

  get isRunning(): boolean {
    return this.running;
  }

  setLanguages(source: Segment['srcLang'], target: Segment['dstLang']): void {
    this.sourceLanguage = source;
    this.targetLanguage = target;
    this.translationCache.clear();
  }

  setDubbing(enabled: boolean): void {
    this.dubbing = enabled;
    if (!enabled) {
      this.pendingSpeech = null;
      this.options.engines.tts.cancel();
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.emitState('listening');
    try {
      await this.warmup();
      if (!this.running) return;
      await this.options.engines.asr.start(
        this.sourceLanguage,
        (result) => this.handleAsrResult(result),
        (error) => this.fail(error),
      );
    } catch (error) {
      this.running = false;
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Resolves when all queued translations and speech playback are finished. */
  async whenIdle(): Promise<void> {
    for (let i = 0; i < 10_000; i += 1) {
      const tasks = [...this.inflight];
      if (tasks.length > 0) await Promise.allSettled(tasks);
      if (!this.speechBusy && this.pendingSpeech === null && this.inflight.size === 0) return;
      await sleep(0);
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.emitState('idle');
    this.clearPrefetch();
    this.pendingSpeech = null;
    this.options.engines.tts.cancel();
    try {
      await this.options.engines.asr.stop();
    } catch {
      // Stopping an already closed engine must not break shutdown.
    }
    await this.whenIdle();
  }

  private async warmup(): Promise<void> {
    const { asr, mt, tts } = this.options.engines;
    const tasks: Array<Promise<unknown>> = [];
    if (asr.warmup) tasks.push(asr.warmup());
    if (mt.warmup) tasks.push(mt.warmup());
    if (tts.warmup) tasks.push(tts.warmup());
    if (tasks.length === 0) return;
    await Promise.race([Promise.allSettled(tasks), sleep(WARMUP_TIMEOUT_MS)]);
  }

  private handleAsrResult(result: AsrResult): void {
    if (!this.running) return;
    if (!result.final) {
      this.options.onPartial?.(result.text);
      this.schedulePrefetch(result.text);
      return;
    }
    this.clearPrefetch();
    this.options.onPartial?.('');
    const task = this.processFinal(result).catch((error) => {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    });
    this.inflight.add(task);
    void task.finally(() => this.inflight.delete(task));
  }

  private schedulePrefetch(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length < PREFETCH_MIN_CHARS) return;
    if (trimmed === this.lastPartialText) return;
    this.lastPartialText = trimmed;
    this.clearPrefetch();
    if (this.translationCache.has(trimmed)) return;
    this.prefetchTimer = setTimeout(() => {
      this.prefetchTimer = null;
      void this.prefetch(trimmed);
    }, PREFETCH_STABILITY_MS);
  }

  private clearPrefetch(): void {
    if (this.prefetchTimer !== null) {
      clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
    }
  }

  private async prefetch(text: string): Promise<void> {
    if (!this.running || this.translationCache.has(text)) return;
    const source = this.sourceLanguage;
    const target = this.targetLanguage;
    try {
      const translated = await this.options.engines.mt.translate(text, source, target);
      if (!this.running) return;
      this.translationCache.set(text, translated);
      if (this.translationCache.size > PREFETCH_CACHE_LIMIT) {
        const oldest = this.translationCache.keys().next().value;
        if (oldest !== undefined) this.translationCache.delete(oldest);
      }
    } catch {
      // Prefetch is best-effort; the final segment translates synchronously.
    }
  }

  private async processFinal(result: AsrResult): Promise<void> {
    if (!this.running) return;
    const source = this.sourceLanguage;
    const target = this.targetLanguage;
    this.emitState('translating');

    let dstText: string;
    const cached = this.translationCache.get(result.text);
    const mtStart = this.now();
    if (cached !== undefined) {
      dstText = cached;
      this.translationCache.delete(result.text);
    } else {
      try {
        dstText = await this.options.engines.mt.translate(result.text, source, target);
      } catch (error) {
        this.latency?.add('mt', this.now() - mtStart);
        this.fail(error instanceof Error ? error : new Error(String(error)));
        if (!this.speechBusy) this.emitState('listening');
        return;
      }
    }
    const mtEnd = this.now();
    this.latency?.add('mt', mtEnd - mtStart);

    const segment: Segment = {
      id: this.nextSegmentId,
      final: true,
      srcLang: source,
      dstLang: target,
      srcText: result.text,
      dstText,
      startedAtMs: result.atMs,
      endedAtMs: mtEnd,
      timings: [
        { stage: 'asr', startMs: result.atMs, endMs: result.atMs },
        { stage: 'mt', startMs: mtStart, endMs: mtEnd },
      ],
    };
    this.nextSegmentId += 1;
    this.options.onSegment?.(segment);

    this.enqueueSpeech(dstText, target);
    if (!this.speechBusy) this.emitState('listening');
  }

  private enqueueSpeech(text: string, target: Segment['dstLang']): void {
    if (!this.dubbing || text.trim().length === 0) return;
    if (this.speechBusy) {
      // Keep only the newest pending translation: speaking stale phrases would
      // make the dubbing fall further behind the conversation.
      this.pendingSpeech = { text, target };
      return;
    }
    void this.playSpeech(text, target);
  }

  private async playSpeech(text: string, target: Segment['dstLang']): Promise<void> {
    this.speechBusy = true;
    this.emitState('speaking');
    const ttsStart = this.now();
    try {
      await this.options.engines.tts.speak(text, target, {
        gender: this.options.getVoiceGender?.(),
      });
      const ttsEnd = this.now();
      this.latency?.add('tts', ttsEnd - ttsStart);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.speechBusy = false;
      const next = this.pendingSpeech;
      this.pendingSpeech = null;
      if (this.running && next !== null) {
        void this.playSpeech(next.text, next.target);
      } else if (this.running) {
        this.emitState('listening');
      }
    }
  }

  private fail(error: Error): void {
    this.emitState('idle');
    this.options.onError?.(error);
  }

  private emitState(state: PipelineState): void {
    this.options.onState?.(state);
  }
}
