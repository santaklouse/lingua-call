import { describe, expect, it } from 'bun:test';
import { LatencyRecorder } from './latency';

describe('LatencyRecorder', () => {
  it('computes last, p50 and p90 per stage', () => {
    const recorder = new LatencyRecorder();
    for (const value of [100, 200, 300, 400, 500]) recorder.add('asr', value);
    recorder.add('mt', 50);

    const summary = recorder.summary();
    expect(summary.asr).toEqual({ last: 500, p50: 300, p90: 500, count: 5 });
    expect(summary.mt?.last).toBe(50);
  });

  it('ignores invalid samples and keeps a bounded window', () => {
    const recorder = new LatencyRecorder(3);
    recorder.add('tts', Number.NaN);
    recorder.add('tts', -1);
    for (const value of [10, 20, 30, 40]) recorder.add('tts', value);
    expect(recorder.summary().tts?.count).toBe(3);
    expect(recorder.summary().tts?.last).toBe(40);
  });

  it('resets all samples', () => {
    const recorder = new LatencyRecorder();
    recorder.add('e2e', 1200);
    recorder.reset();
    expect(recorder.summary()).toEqual({});
  });
});
