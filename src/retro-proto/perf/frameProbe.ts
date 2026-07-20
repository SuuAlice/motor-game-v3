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

export interface GcIndicator {
  available: boolean;
  /** 隣接サンプル間でdropThresholdBytes以上ヒープが減少した回数。GCの断定はしない。 */
  gcLikeDropCount: number;
  /** 観測された最大の下降量(bytes)。 */
  maxDropBytes: number;
  dropThresholdBytes: number;
}

const DEFAULT_GC_DROP_THRESHOLD_BYTES = 1_000_000; // 1MB以上の下降をGCらしき挙動の目安とする

// PHASE1-UNITH-REVIEW指摘3: 計画§9.1「GCの有無」を出すため、隣接メモリサンプル間の
// 有意な下降をGCらしき挙動として検出する純関数。performance.memory自体が非標準の
// 推定値であるため、GC発生を断定はせず「らしき下降」として報告する。
export function computeGcIndicator(
  samples: MemorySample[],
  dropThresholdBytes: number = DEFAULT_GC_DROP_THRESHOLD_BYTES,
): GcIndicator {
  if (samples.length < 2) {
    return { available: false, gcLikeDropCount: 0, maxDropBytes: 0, dropThresholdBytes };
  }
  let gcLikeDropCount = 0;
  let maxDropBytes = 0;
  for (let i = 1; i < samples.length; i++) {
    const drop = samples[i - 1].usedJsHeapSizeBytes - samples[i].usedJsHeapSizeBytes;
    if (drop > 0) {
      maxDropBytes = Math.max(maxDropBytes, drop);
      if (drop >= dropThresholdBytes) gcLikeDropCount++;
    }
  }
  return { available: true, gcLikeDropCount, maxDropBytes, dropThresholdBytes };
}

export interface FrameProbeResult {
  frameStats: FrameStats;
  memoryStats: MemoryStats;
  gcIndicator: GcIndicator;
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
//
// PHASE1-UNITH-REVIEW指摘2・4への対応:
// - メモリサンプリングはwarmupMs経過後にのみ開始し(計測開始/終了の瞬間を
//   確実にサンプリングする)、ウォームアップ中は収集しない
// - フレーム間隔も、ウォームアップ境界をまたいだ最初の post-warmup フレームでは
//   区間を記録せず(直前がウォームアップ中の時刻のため)、そのフレームを新たな
//   基準点として以降の間隔だけを収集する
// - 二重start・stop後は既存のrAF/intervalを確実に止め、古いonCompleteを呼ばない
export class FrameProbe {
  private durationsMs: number[] = [];
  private memorySamples: MemorySample[] = [];
  private lastFrameTime: number | null = null;
  private hasCrossedWarmup = false;
  private rafId = 0;
  private memoryIntervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(warmupMs: number, collectMs: number, onComplete: (result: FrameProbeResult) => void): void {
    if (this.running) {
      this.stop();
    }
    this.running = true;
    this.durationsMs = [];
    this.memorySamples = [];
    this.lastFrameTime = null;
    this.hasCrossedWarmup = false;

    const startTime = performance.now();
    let memoryIntervalStarted = false;

    const sampleMemoryNow = () => {
      const bytes = readUsedJsHeapSizeBytes();
      if (bytes !== null) {
        this.memorySamples.push({ atMs: performance.now() - startTime, usedJsHeapSizeBytes: bytes });
      }
    };

    const tick = (now: number) => {
      if (!this.running) return;
      const elapsed = now - startTime;
      const inWarmup = elapsed < warmupMs;

      if (!inWarmup) {
        if (!this.hasCrossedWarmup) {
          // ウォームアップ境界をまたいだ最初のフレーム: 直前(ウォームアップ中)の
          // 時刻との差分はフレーム間隔として使わず、ここを新たな基準点にする。
          this.hasCrossedWarmup = true;
          this.lastFrameTime = now;
        } else if (this.lastFrameTime !== null) {
          this.durationsMs.push(now - this.lastFrameTime);
          this.lastFrameTime = now;
        }

        if (!memoryIntervalStarted) {
          memoryIntervalStarted = true;
          sampleMemoryNow(); // 計測開始時点のサンプルを確実に含める
          this.memoryIntervalId = setInterval(sampleMemoryNow, 200);
        }
      }

      if (elapsed >= warmupMs + collectMs) {
        sampleMemoryNow(); // 計測終了時点のサンプルを確実に含める
        const result: FrameProbeResult = {
          frameStats: computeFrameStats(this.durationsMs),
          memoryStats: computeMemoryStats(this.memorySamples),
          gcIndicator: computeGcIndicator(this.memorySamples),
        };
        this.stop();
        onComplete(result);
        return;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    if (this.memoryIntervalId !== null) {
      clearInterval(this.memoryIntervalId);
      this.memoryIntervalId = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
