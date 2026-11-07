import { describe, expect, it } from 'bun:test';
import { EnergyVadSegmenter, frameRms } from './vad';

const SAMPLE_RATE = 16_000;
const FRAME = 320; // 20 ms

function frame(amplitude: number): Float32Array {
  const value = amplitude; // constant signal: RMS equals the sample value
  return new Float32Array(FRAME).fill(value);
}

function silence(): Float32Array {
  return frame(0);
}

function speech(): Float32Array {
  return frame(0.2);
}

function noise(): Float32Array {
  return frame(0.001);
}

describe('frameRms', () => {
  it('computes the RMS of a frame', () => {
    expect(frameRms(frame(0.2))).toBeCloseTo(0.2, 3);
    expect(frameRms(silence())).toBe(0);
    expect(frameRms(new Float32Array())).toBe(0);
  });
});

describe('EnergyVadSegmenter', () => {
  it('opens and closes an utterance around speech', () => {
    const vad = new EnergyVadSegmenter({ sampleRate: SAMPLE_RATE });
    const events: string[] = [];
    let ended: { durationMs: number; pcm: Float32Array } | null = null;

    for (let i = 0; i < 10; i += 1) events.push(...vad.push(noise()).map((e) => e.type));
    for (let i = 0; i < 25; i += 1) events.push(...vad.push(speech()).map((e) => e.type));
    for (let i = 0; i < 40; i += 1) {
      for (const event of vad.push(silence())) {
        events.push(event.type);
        if (event.type === 'speech-end') ended = { durationMs: event.durationMs, pcm: event.pcm };
      }
    }

    expect(events).toContain('speech-start');
    expect(events).toContain('speech-end');
    expect(ended).not.toBeNull();
    expect(ended!.durationMs).toBeGreaterThan(500);
    expect(ended!.pcm.length).toBeGreaterThan(0);
  });

  it('drops utterances shorter than minSpeechMs', () => {
    const vad = new EnergyVadSegmenter({
      sampleRate: SAMPLE_RATE,
      minSpeechMs: 500,
      silenceMs: 100,
    });
    const events = [...vad.push(speech()), ...vad.push(speech()), ...vad.push(silence())];
    for (let i = 0; i < 10; i += 1) events.push(...vad.push(silence()));
    expect(events.some((event) => event.type === 'speech-end')).toBe(false);
  });

  it('ignores a single speech frame below speechFramesToStart', () => {
    const vad = new EnergyVadSegmenter({ sampleRate: SAMPLE_RATE });
    vad.push(speech());
    expect(vad.utteranceOpen).toBe(false);
  });

  it('cuts utterances at maxUtteranceMs', () => {
    const vad = new EnergyVadSegmenter({
      sampleRate: SAMPLE_RATE,
      maxUtteranceMs: 500,
      minSpeechMs: 100,
    });
    let ends = 0;
    for (let i = 0; i < 60; i += 1) {
      for (const event of vad.push(speech())) if (event.type === 'speech-end') ends += 1;
    }
    expect(ends).toBeGreaterThan(0);
  });

  it('flushes an open utterance', () => {
    const vad = new EnergyVadSegmenter({ sampleRate: SAMPLE_RATE, minSpeechMs: 100 });
    for (let i = 0; i < 20; i += 1) vad.push(speech());
    const event = vad.flush();
    expect(event?.type).toBe('speech-end');
    expect(vad.utteranceOpen).toBe(false);
  });

  it('detects speech above an adaptive noise floor', () => {
    const vad = new EnergyVadSegmenter({ sampleRate: SAMPLE_RATE, minThreshold: 0.005 });
    for (let i = 0; i < 50; i += 1) vad.push(noise());
    const events = [...vad.push(speech()), ...vad.push(speech())];
    expect(events.some((event) => event.type === 'speech-start')).toBe(true);
  });

  it('resets its state', () => {
    const vad = new EnergyVadSegmenter({ sampleRate: SAMPLE_RATE });
    for (let i = 0; i < 5; i += 1) vad.push(speech());
    vad.reset();
    expect(vad.utteranceOpen).toBe(false);
    expect(vad.flush()).toBeNull();
  });

  it('rejects invalid sample rates', () => {
    expect(() => new EnergyVadSegmenter({ sampleRate: 0 })).toThrow(RangeError);
  });
});
