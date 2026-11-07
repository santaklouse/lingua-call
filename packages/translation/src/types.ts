import type { Language } from '@linguacall/i18n';

/** Timestamped result from an ASR engine. */
export type AsrResult = {
  /** Stable id of the utterance segment. */
  segmentId: number;
  /** Recognized text (partial or final). */
  text: string;
  /** True when the engine considers the segment complete. */
  final: boolean;
  /** `performance.now()` when the result was produced. */
  atMs: number;
};

export type AsrEngine = {
  readonly id: string;
  readonly languages: readonly Language[];
  /** Starts capture/recognition for the given source language. */
  start(language: Language, onResult: (result: AsrResult) => void, onError: (error: Error) => void): Promise<void>;
  stop(): Promise<void>;
};

export type MtEngine = {
  readonly id: string;
  readonly pairs: ReadonlyArray<readonly [Language, Language]>;
  supports(source: Language, target: Language): boolean;
  translate(text: string, source: Language, target: Language): Promise<string>;
};

export type TtsOptions = {
  /** Playback rate multiplier, 1 = normal. */
  rate?: number;
  /** Voice id exposed by the engine, when supported. */
  voice?: string;
};

export type TtsEngine = {
  readonly id: string;
  readonly languages: readonly Language[];
  supports(language: Language): boolean;
  /** Resolves when playback finishes (or is cancelled). */
  speak(text: string, language: Language, options?: TtsOptions): Promise<void>;
  cancel(): void;
};

export type PipelineStage = 'vad' | 'asr' | 'mt' | 'tts';

export type StageTiming = {
  stage: PipelineStage;
  startMs: number;
  endMs: number;
};

/** A subtitle/dubbing segment as shown in the UI and sent to the peer. */
export type Segment = {
  id: number;
  final: boolean;
  srcLang: Language;
  dstLang: Language;
  srcText: string;
  dstText: string;
  /** Monotonic start/end timestamps of the source phrase (`performance.now()`). */
  startedAtMs: number;
  endedAtMs: number;
  timings: readonly StageTiming[];
};
