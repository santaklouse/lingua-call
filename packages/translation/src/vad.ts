/**
 * Energy-based voice activity detection and utterance segmentation.
 *
 * Deliberately model-free and pure: it receives mono PCM frames and returns
 * speech-start / speech-end events with the collected utterance. This keeps the
 * segmenter unit-testable; the browser capture adapter (P5P-02b) feeds it.
 *
 * It is a prototype VAD for the lowest-latency path. The final pipeline replaces
 * it with Silero VAD (deferred phase P5A).
 */

export type VadOptions = {
  sampleRate: number;
  /** Absolute RMS floor for speech. */
  minThreshold?: number;
  /** Consecutive speech frames needed to open an utterance. */
  speechFramesToStart?: number;
  /** Silence duration that closes an utterance. */
  silenceMs?: number;
  /** Utterances shorter than this are discarded. */
  minSpeechMs?: number;
  /** Hard limit; longer utterances are cut and emitted. */
  maxUtteranceMs?: number;
};

export type VadEvent =
  | { type: 'speech-start'; atMs: number }
  | { type: 'speech-end'; atMs: number; durationMs: number; pcm: Float32Array };

type ResolvedOptions = Required<VadOptions>;

const DEFAULTS = {
  minThreshold: 0.01,
  speechFramesToStart: 2,
  silenceMs: 600,
  minSpeechMs: 250,
  maxUtteranceMs: 15_000,
} as const;

function resolveOptions(options: VadOptions): ResolvedOptions {
  if (!Number.isFinite(options.sampleRate) || options.sampleRate <= 0) {
    throw new RangeError('sampleRate must be a positive number');
  }
  return {
    sampleRate: options.sampleRate,
    minThreshold: options.minThreshold ?? DEFAULTS.minThreshold,
    speechFramesToStart: Math.max(1, options.speechFramesToStart ?? DEFAULTS.speechFramesToStart),
    silenceMs: options.silenceMs ?? DEFAULTS.silenceMs,
    minSpeechMs: options.minSpeechMs ?? DEFAULTS.minSpeechMs,
    maxUtteranceMs: options.maxUtteranceMs ?? DEFAULTS.maxUtteranceMs,
  };
}

export function frameRms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) {
    const value = frame[i] ?? 0;
    sum += value * value;
  }
  return Math.sqrt(sum / frame.length);
}

function concat(chunks: Float32Array[], total: number): Float32Array {
  if (chunks.length === 1 && chunks[0] !== undefined) return chunks[0];
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export class EnergyVadSegmenter {
  private readonly options: ResolvedOptions;
  private events: VadEvent[] = [];
  private recent: Float32Array[] = [];
  private chunks: Float32Array[] = [];
  private chunksSamples = 0;
  private totalSamples = 0;
  private speechFrames = 0;
  private silenceFrames = 0;
  private open = false;
  private utteranceStartMs = 0;
  private noiseFloor = 0;

  constructor(options: VadOptions) {
    this.options = resolveOptions(options);
  }

  get utteranceOpen(): boolean {
    return this.open;
  }

  /** Pushes one mono PCM frame and returns all events produced by it. */
  push(frame: Float32Array): VadEvent[] {
    this.events = [];
    const frameStartSample = this.totalSamples;
    this.totalSamples += frame.length;
    const frameMs = (frame.length / this.options.sampleRate) * 1000;
    const rms = frameRms(frame);
    const threshold = Math.max(this.options.minThreshold, this.noiseFloor * 3);
    const isSpeech = rms >= threshold;

    if (this.open) {
      this.chunks.push(frame.slice());
      this.chunksSamples += frame.length;
      if (isSpeech) {
        this.silenceFrames = 0;
      } else {
        this.silenceFrames += 1;
      }

      const utteranceMs = (this.chunksSamples / this.options.sampleRate) * 1000;
      const silenceMs = (this.silenceFrames * frame.length * 1000) / this.options.sampleRate;
      if (utteranceMs >= this.options.maxUtteranceMs || silenceMs >= this.options.silenceMs) {
        this.closeUtterance(this.totalSamples);
      }
      return this.events;
    }

    if (!isSpeech) {
      this.speechFrames = 0;
      this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05;
      this.pushRecent(frame);
      return this.events;
    }

    this.pushRecent(frame);
    this.speechFrames += 1;
    if (this.speechFrames >= this.options.speechFramesToStart) {
      const startSample = frameStartSample - (this.speechFrames - 1) * frame.length;
      this.open = true;
      this.silenceFrames = 0;
      this.utteranceStartMs = (startSample / this.options.sampleRate) * 1000;
      this.chunks = this.recent.slice();
      this.chunksSamples = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      this.events.push({ type: 'speech-start', atMs: this.utteranceStartMs });
    }

    void frameMs;
    return this.events;
  }

  /** Closes an open utterance (e.g. on stop) and returns its event, if any. */
  flush(): VadEvent | null {
    this.events = [];
    if (!this.open) return null;
    this.closeUtterance(this.totalSamples);
    return this.events[0] ?? null;
  }

  reset(): void {
    this.events = [];
    this.recent = [];
    this.chunks = [];
    this.chunksSamples = 0;
    this.totalSamples = 0;
    this.speechFrames = 0;
    this.silenceFrames = 0;
    this.open = false;
    this.utteranceStartMs = 0;
    this.noiseFloor = 0;
  }

  private pushRecent(frame: Float32Array): void {
    this.recent.push(frame.slice());
    const maxFrames = this.options.speechFramesToStart;
    while (this.recent.length > maxFrames) this.recent.shift();
  }

  private closeUtterance(endSample: number): void {
    const durationMs = (endSample / this.options.sampleRate) * 1000 - this.utteranceStartMs;
    const pcm = concat(this.chunks, this.chunksSamples);
    this.open = false;
    this.chunks = [];
    this.chunksSamples = 0;
    this.speechFrames = 0;
    this.silenceFrames = 0;
    this.recent = [];

    if (durationMs < this.options.minSpeechMs) return;
    this.events.push({
      type: 'speech-end',
      atMs: (endSample / this.options.sampleRate) * 1000,
      durationMs,
      pcm,
    });
  }
}
