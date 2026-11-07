/**
 * Speaker voice profiling from raw PCM.
 *
 * We estimate the fundamental frequency (F0) of voiced frames and classify the
 * speaker as male/female by the median pitch. This is intentionally simple and
 * model-free: it runs in the browser on the microphone or remote audio stream and
 * lets TTS pick a voice that matches the speaker's gender.
 *
 * Typical ranges: male ~85–180 Hz, female ~165–255 Hz. The overlap is handled by
 * requiring a minimum number of voiced frames and using the median.
 */

export type VoiceGender = 'male' | 'female' | 'unknown';

export type PitchOptions = {
  minHz?: number;
  maxHz?: number;
  minRms?: number;
  minCorrelation?: number;
};

const PITCH_DEFAULTS = {
  minHz: 70,
  maxHz: 400,
  minRms: 0.01,
  minCorrelation: 0.4,
} as const;

/** Estimates F0 in Hz for a mono PCM frame, or null when it is unvoiced. */
export function estimatePitchHz(
  frame: Float32Array,
  sampleRate: number,
  options: PitchOptions = {},
): number | null {
  const { minHz, maxHz, minRms, minCorrelation } = { ...PITCH_DEFAULTS, ...options };
  if (frame.length < 64 || sampleRate <= 0) return null;

  let mean = 0;
  for (let i = 0; i < frame.length; i += 1) mean += frame[i] ?? 0;
  mean /= frame.length;

  let energy = 0;
  for (let i = 0; i < frame.length; i += 1) {
    const value = (frame[i] ?? 0) - mean;
    energy += value * value;
  }
  const rms = Math.sqrt(energy / frame.length);
  if (rms < minRms) return null;

  const minLag = Math.max(1, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(frame.length - 1, Math.ceil(sampleRate / minHz));
  if (maxLag <= minLag) return null;

  const correlations = new Float64Array(maxLag + 2);
  let bestLag = -1;
  let bestCorrelation = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < frame.length - lag; i += 1) {
      const a = (frame[i] ?? 0) - mean;
      const b = (frame[i + lag] ?? 0) - mean;
      correlation += a * b;
      normA += a * a;
      normB += b * b;
    }
    const denominator = Math.sqrt(normA * normB);
    if (denominator <= 0) continue;
    const normalized = correlation / denominator;
    correlations[lag] = normalized;
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorrelation < minCorrelation) return null;

  // Prefer the earliest strong peak: autocorrelation repeats at multiples of the
  // period, and picking the global maximum can yield an octave (or third) error.
  let chosenLag = bestLag;
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    const value = correlations[lag] ?? 0;
    if (
      value >= bestCorrelation * 0.9 &&
      value >= (correlations[lag - 1] ?? 0) &&
      value >= (correlations[lag + 1] ?? 0)
    ) {
      chosenLag = lag;
      break;
    }
  }

  // Parabolic interpolation around the peak reduces octave/quantization error.
  const left = correlations[chosenLag - 1] ?? bestCorrelation;
  const center = correlations[chosenLag] ?? bestCorrelation;
  const right = correlations[chosenLag + 1] ?? bestCorrelation;
  const denominator = left - 2 * center + right;
  const shift = denominator === 0 ? 0 : (0.5 * (left - right)) / denominator;
  const refinedLag = chosenLag + Math.max(-0.5, Math.min(0.5, shift));
  return sampleRate / refinedLag;
}

export type GenderEstimatorOptions = {
  /** Number of pitch samples used for the median. */
  window?: number;
  /** Minimum voiced samples before a gender is reported. */
  minSamples?: number;
  /** Median F0 at or below this is classified as male. */
  maleMaxHz?: number;
  /** Median F0 at or above this is classified as female. */
  femaleMinHz?: number;
};

const GENDER_DEFAULTS = {
  window: 40,
  minSamples: 8,
  maleMaxHz: 170,
  femaleMinHz: 175,
} as const;

export class GenderEstimator {
  private readonly options: Required<GenderEstimatorOptions>;
  private pitches: number[] = [];

  constructor(options: GenderEstimatorOptions = {}) {
    this.options = { ...GENDER_DEFAULTS, ...options };
  }

  get gender(): VoiceGender {
    if (this.pitches.length < this.options.minSamples) return 'unknown';
    const sorted = [...this.pitches].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    if (median <= this.options.maleMaxHz) return 'male';
    if (median >= this.options.femaleMinHz) return 'female';
    return 'unknown';
  }

  get sampleCount(): number {
    return this.pitches.length;
  }

  /** Feeds one frame; returns the current gender estimate. */
  push(frame: Float32Array, sampleRate: number): VoiceGender {
    const pitch = estimatePitchHz(frame, sampleRate);
    if (pitch !== null) this.addPitch(pitch);
    return this.gender;
  }

  /** Feeds a known pitch value (useful for tests and non-audio sources). */
  addPitch(hz: number): VoiceGender {
    if (Number.isFinite(hz) && hz > 0) {
      this.pitches.push(hz);
      if (this.pitches.length > this.options.window) this.pitches.shift();
    }
    return this.gender;
  }

  reset(): void {
    this.pitches = [];
  }
}
