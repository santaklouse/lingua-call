import type { AsrEngine, AsrResult, MtEngine, Segment, TtsEngine } from './types';
import type { LatencyRecorder } from './latency';

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
  onPartial?: (text: string) => void;
  onSegment?: (segment: Segment) => void;
  onError?: (error: Error) => void;
  onState?: (state: PipelineState) => void;
};

export type PipelineState = 'idle' | 'listening' | 'translating' | 'speaking';

/**
 * Orchestrates the main feature: microphone → ASR → MT → subtitles → spoken
 * translation. Engines are injected, so the pipeline is fully unit-testable and
 * the same orchestration works with prototype browser engines or local WASM ones.
 *
 * Final segments are processed sequentially to avoid overlapping speech; the
 * UI receives the segment as soon as MT finishes, before TTS playback starts.
 */
export class TranslationPipeline {
  private readonly options: PipelineOptions;
  private readonly now: () => number;
  private readonly latency?: LatencyRecorder;
  private nextSegmentId = 1;
  private running = false;
  private queue: Promise<void> = Promise.resolve();
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

  /** Resolves when all queued final segments have been processed. */
  whenIdle(): Promise<void> {
    return this.queue.catch(() => {});
  }

  setLanguages(source: Segment['srcLang'], target: Segment['dstLang']): void {
    this.sourceLanguage = source;
    this.targetLanguage = target;
  }

  setDubbing(enabled: boolean): void {
    this.dubbing = enabled;
    if (!enabled) this.options.engines.tts.cancel();
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.emitState('listening');
    try {
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

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.emitState('idle');
    this.options.engines.tts.cancel();
    try {
      await this.options.engines.asr.stop();
    } catch {
      // Stopping an already closed engine must not break shutdown.
    }
    await this.queue.catch(() => {});
  }

  private handleAsrResult(result: AsrResult): void {
    if (!this.running) return;
    if (!result.final) {
      this.options.onPartial?.(result.text);
      return;
    }
    this.options.onPartial?.('');
    this.queue = this.queue.then(() => this.processFinal(result)).catch((error) => this.fail(error));
  }

  private async processFinal(result: AsrResult): Promise<void> {
    if (!this.running) return;
    const source = this.sourceLanguage;
    const target = this.targetLanguage;
    const mtStart = this.now();
    this.emitState('translating');

    let dstText: string;
    try {
      dstText = await this.options.engines.mt.translate(result.text, source, target);
    } catch (error) {
      this.latency?.add('mt', this.now() - mtStart);
      this.fail(error instanceof Error ? error : new Error(String(error)));
      this.emitState('listening');
      return;
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

    if (!this.dubbing || dstText.trim().length === 0) {
      this.emitState('listening');
      return;
    }

    const ttsStart = this.now();
    this.emitState('speaking');
    try {
      await this.options.engines.tts.speak(dstText, target);
      const ttsEnd = this.now();
      this.latency?.add('tts', ttsEnd - ttsStart);
      this.latency?.add('e2e', ttsEnd - segment.startedAtMs);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (this.running) this.emitState('listening');
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
