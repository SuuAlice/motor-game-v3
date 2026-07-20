// docs/phase1-plan.md §9.1/Unit H: 性能測定。requestAnimationFrame間隔から
// p50/p95/p99/最大値・16.7ms超過フレーム数を算出する。統計計算は純関数
// (computeFrameStats)として分離しNode環境でもテストできるようにする。
// rAFフックとメモリサンプリング(FrameProbeクラス)はブラウザ専用。
// 物理エンジンへは接続せず、描画負荷のみを計測する(React内へ固定dt物理
// ループを新設しない、docs/phase1-plan.md §9.1)。

export interface FrameStats {
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  droppedFrameCount: number;
  droppedFrameThresholdMs: number;
}

const DEFAULT_DROPPED_FRAME_THRESHOLD_MS = 16.7;

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(sortedMs.length - 1, Math.floor(p * sortedMs.length));
  return sortedMs[idx];
}

// フレーム時間(ms)の配列からp50/p95/p99/最大値・欠落フレーム数を算出する純関数。
export function computeFrameStats(
  frameDurationsMs: number[],
  droppedFrameThresholdMs: number = DEFAULT_DROPPED_FRAME_THRESHOLD_MS,
): FrameStats {
  if (frameDurationsMs.length === 0) {
    return { count: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, droppedFrameCount: 0, droppedFrameThresholdMs };
  }
  const sorted = [...frameDurationsMs].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted[sorted.length - 1],
    droppedFrameCount: sorted.filter((ms) => ms > droppedFrameThresholdMs).length,
    droppedFrameThresholdMs,
  };
}

export interface MemorySample {
  atMs: number;
  usedJsHeapSizeBytes: number;
}

export interface MemoryStats {
  available: boolean;
  startBytes: number;
  endBytes: number;
  peakBytes: number;
  deltaBytes: number;
}

// メモリサンプル列から開始/終了/ピーク/差分を算出する純関数。
// performance.memoryが取得できない環境(Chrome以外)ではavailable=falseになる。
export function computeMemoryStats(samples: MemorySample[]): MemoryStats {
  if (samples.length === 0) {
    return { available: false, startBytes: 0, endBytes: 0, peakBytes: 0, deltaBytes: 0 };
  }
  const startBytes = samples[0].usedJsHeapSizeBytes;
  const endBytes = samples[samples.length - 1].usedJsHeapSizeBytes;
  const peakBytes = samples.reduce((max, s) => Math.max(max, s.usedJsHeapSizeBytes), 0);
  return { available: true, startBytes, endBytes, peakBytes, deltaBytes: endBytes - startBytes };
}

export interface FrameProbeResult {
  frameStats: FrameStats;
  memoryStats: MemoryStats;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
}

function readUsedJsHeapSizeBytes(): number | null {
  const perf = performance as Performance & { memory?: PerformanceMemory };
  return perf.memory ? perf.memory.usedJSHeapSize : null;
}

// ブラウザ専用: 指定したウォームアップ時間の後、指定した計測時間だけ
// requestAnimationFrameの間隔とメモリ使用量をサンプリングする。
export class FrameProbe {
  private durationsMs: number[] = [];
  private memorySamples: MemorySample[] = [];
  private lastFrameTime: number | null = null;
  private rafId = 0;
  private memoryIntervalId: ReturnType<typeof setInterval> | null = null;

  start(warmupMs: number, collectMs: number, onComplete: (result: FrameProbeResult) => void): void {
    this.durationsMs = [];
    this.memorySamples = [];
    this.lastFrameTime = null;
    const startTime = performance.now();

    this.memoryIntervalId = setInterval(() => {
      const bytes = readUsedJsHeapSizeBytes();
      if (bytes !== null) {
        this.memorySamples.push({ atMs: performance.now() - startTime, usedJsHeapSizeBytes: bytes });
      }
    }, 200);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      if (this.lastFrameTime !== null && elapsed >= warmupMs) {
        this.durationsMs.push(now - this.lastFrameTime);
      }
      this.lastFrameTime = now;

      if (elapsed >= warmupMs + collectMs) {
        this.stop();
        onComplete({
          frameStats: computeFrameStats(this.durationsMs),
          memoryStats: computeMemoryStats(this.memorySamples),
        });
        return;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    if (this.memoryIntervalId !== null) {
      clearInterval(this.memoryIntervalId);
      this.memoryIntervalId = null;
    }
  }
}
