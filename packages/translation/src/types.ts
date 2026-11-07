import type { Language } from '@linguacall/i18n';
import type { VoiceGender } from './voice';

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
  /** Optional preparation (permissions/models) before the first result. */
  warmup?(): Promise<void>;
  /** Starts capture/recognition for the given source language. */
  start(language: Language, onResult: (result: AsrResult) => void, onError: (error: Error) => void): Promise<void>;
  stop(): Promise<void>;
};

export type MtEngine = {
  readonly id: string;
  readonly pairs: ReadonlyArray<readonly [Language, Language]>;
  /** Optional model download/pre-warm to hide first-translation latency. */
  warmup?(): Promise<void>;
  supports(source: Language, target: Language): boolean;
  translate(text: string, source: Language, target: Language): Promise<string>;
};

export type TtsOptions = {
  /** Playback rate multiplier, 1 = normal. */
  rate?: number;
  /** Voice id exposed by the engine, when supported. */
  voice?: string;
  /** Speaker gender so the engine can pick a matching voice. */
  gender?: VoiceGender;
};

export type TtsEngine = {
  readonly id: string;
  readonly languages: readonly Language[];
  /** Optional voice catalog warm-up (voices load asynchronously in browsers). */
  warmup?(): Promise<void>;
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
