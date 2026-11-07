import { describe, expect, it } from 'bun:test';
import { GenderEstimator, estimatePitchHz } from './voice';

const SAMPLE_RATE = 16_000;
const FRAME = 2048;

function sine(hz: number, amplitude = 0.3): Float32Array {
  const frame = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i += 1) frame[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE);
  return frame;
}

describe('estimatePitchHz', () => {
  it('estimates a male-range fundamental frequency', () => {
    expect(estimatePitchHz(sine(110), SAMPLE_RATE)).toBeCloseTo(110, 0);
  });

  it('estimates a female-range fundamental frequency', () => {
    expect(estimatePitchHz(sine(220), SAMPLE_RATE)).toBeCloseTo(220, 0);
  });

  it('returns null for silence', () => {
    expect(estimatePitchHz(new Float32Array(FRAME), SAMPLE_RATE)).toBeNull();
  });

  it('returns null for frames that are too short', () => {
    expect(estimatePitchHz(new Float32Array(10), SAMPLE_RATE)).toBeNull();
  });
});

describe('GenderEstimator', () => {
  it('classifies a low-pitch speaker as male', () => {
    const estimator = new GenderEstimator();
    for (let i = 0; i < 12; i += 1) estimator.addPitch(110);
    expect(estimator.gender).toBe('male');
  });

  it('classifies a high-pitch speaker as female', () => {
    const estimator = new GenderEstimator();
    for (let i = 0; i < 12; i += 1) estimator.addPitch(220);
    expect(estimator.gender).toBe('female');
  });

  it('stays unknown before enough samples', () => {
    const estimator = new GenderEstimator({ minSamples: 8 });
    estimator.addPitch(110);
    expect(estimator.gender).toBe('unknown');
  });

  it('uses frames and resets', () => {
    const estimator = new GenderEstimator();
    for (let i = 0; i < 12; i += 1) estimator.push(sine(120), SAMPLE_RATE);
    expect(estimator.gender).toBe('male');
    estimator.reset();
    expect(estimator.gender).toBe('unknown');
    expect(estimator.sampleCount).toBe(0);
  });
});
