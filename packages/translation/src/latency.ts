import type { PipelineStage } from './types';

export type LatencyStage = PipelineStage | 'e2e';

export type StageLatency = {
  last: number;
  p50: number;
  p90: number;
  count: number;
};

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  return sorted[index] ?? 0;
}

/** In-memory latency collector for the dashboard (no network telemetry). */
export class LatencyRecorder {
  private readonly samples = new Map<LatencyStage, number[]>();
  private readonly limit: number;

  constructor(limit = 200) {
    this.limit = limit;
  }

  add(stage: LatencyStage, ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    const list = this.samples.get(stage) ?? [];
    list.push(ms);
    if (list.length > this.limit) list.shift();
    this.samples.set(stage, list);
  }

  summary(): Partial<Record<LatencyStage, StageLatency>> {
    const result: Partial<Record<LatencyStage, StageLatency>> = {};
    for (const [stage, values] of this.samples) {
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      result[stage] = {
        last: values[values.length - 1] ?? 0,
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        count: values.length,
      };
    }
    return result;
  }

  reset(): void {
    this.samples.clear();
  }
}
