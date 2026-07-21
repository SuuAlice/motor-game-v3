import { describe, expect, it } from 'vitest';
import { computeFrameStats, computeGcIndicator, computeMemoryStats, computeVsyncAwareStats } from '../frameProbe';

describe('computeFrameStats', () => {
  it('空配列は全項目0を返す', () => {
    const stats = computeFrameStats([]);
    expect(stats).toMatchObject({ count: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, droppedFrameCount: 0 });
  });

  it('既知の等間隔データでp50/最大値が正しく算出される(既知値)', () => {
    // 1..100msの整数列(100件)
    const durations = Array.from({ length: 100 }, (_, i) => i + 1);
    const stats = computeFrameStats(durations);
    expect(stats.count).toBe(100);
    expect(stats.maxMs).toBe(100);
    expect(stats.p50Ms).toBe(51); // sorted[floor(0.5*100)]=sorted[50]=51
    expect(stats.p95Ms).toBe(96); // sorted[floor(0.95*100)]=sorted[95]=96
    expect(stats.p99Ms).toBe(100); // sorted[floor(0.99*100)]=sorted[99]=100
  });

  it('16.7ms超過フレーム数を既定しきい値で数える(既知値)', () => {
    const stats = computeFrameStats([10, 16.7, 16.8, 20, 33]);
    // 16.7ms超過は16.8・20・33の3件(16.7ちょうどは超過に含めない)
    expect(stats.droppedFrameCount).toBe(3);
    expect(stats.droppedFrameThresholdMs).toBe(16.7);
  });

  it('しきい値を明示指定できる', () => {
    const stats = computeFrameStats([10, 20, 30], 25);
    expect(stats.droppedFrameCount).toBe(1);
    expect(stats.droppedFrameThresholdMs).toBe(25);
  });

  it('入力配列の順序に関わらず結果は同じになる(内部でソートする)', () => {
    const a = computeFrameStats([30, 10, 20]);
    const b = computeFrameStats([10, 20, 30]);
    expect(a).toEqual(b);
  });
});

describe('computeMemoryStats', () => {
  it('空配列はavailable=falseを返す', () => {
    expect(computeMemoryStats([])).toMatchObject({ available: false });
  });

  it('開始/終了/ピーク/差分を既知値どおりに算出する', () => {
    const stats = computeMemoryStats([
      { atMs: 0, usedJsHeapSizeBytes: 1000 },
      { atMs: 200, usedJsHeapSizeBytes: 3000 },
      { atMs: 400, usedJsHeapSizeBytes: 2000 },
    ]);
    expect(stats).toMatchObject({ available: true, startBytes: 1000, endBytes: 2000, peakBytes: 3000, deltaBytes: 1000 });
  });

  it('単調減少するメモリでもピークは開始時点になる(既知値)', () => {
    const stats = computeMemoryStats([
      { atMs: 0, usedJsHeapSizeBytes: 5000 },
      { atMs: 200, usedJsHeapSizeBytes: 4000 },
    ]);
    expect(stats.peakBytes).toBe(5000);
    expect(stats.deltaBytes).toBe(-1000);
  });
});

// PHASE1-UNITH-REVIEW指摘3: GCらしき下降の検出(GC発生の断定はしない)。
describe('computeGcIndicator', () => {
  it('サンプルが2件未満はavailable=falseを返す', () => {
    expect(computeGcIndicator([])).toMatchObject({ available: false });
    expect(computeGcIndicator([{ atMs: 0, usedJsHeapSizeBytes: 1000 }])).toMatchObject({ available: false });
  });

  it('しきい値以上の下降を1回だけ含む場合、既定しきい値(1MB)で既知値どおり検出する', () => {
    const samples = [
      { atMs: 0, usedJsHeapSizeBytes: 5_000_000 },
      { atMs: 200, usedJsHeapSizeBytes: 5_500_000 }, // 上昇(GCではない)
      { atMs: 400, usedJsHeapSizeBytes: 2_000_000 }, // 3.5MB下降 → GCらしき下降
      { atMs: 600, usedJsHeapSizeBytes: 2_100_000 }, // 上昇
    ];
    const indicator = computeGcIndicator(samples);
    expect(indicator).toMatchObject({ available: true, gcLikeDropCount: 1, maxDropBytes: 3_500_000 });
  });

  it('しきい値未満の下降はgcLikeDropCountへ数えないが、maxDropBytesには反映する', () => {
    const samples = [
      { atMs: 0, usedJsHeapSizeBytes: 1_000_000 },
      { atMs: 200, usedJsHeapSizeBytes: 900_000 }, // 10万byte下降(1MB未満)
    ];
    const indicator = computeGcIndicator(samples, 1_000_000);
    expect(indicator.gcLikeDropCount).toBe(0);
    expect(indicator.maxDropBytes).toBe(100_000);
  });

  it('しきい値を明示指定できる', () => {
    const samples = [
      { atMs: 0, usedJsHeapSizeBytes: 1_000_000 },
      { atMs: 200, usedJsHeapSizeBytes: 800_000 }, // 20万byte下降
    ];
    expect(computeGcIndicator(samples, 100_000).gcLikeDropCount).toBe(1);
    expect(computeGcIndicator(samples, 500_000).gcLikeDropCount).toBe(0);
  });

  it('単調増加するメモリはgcLikeDropCount=0・maxDropBytes=0になる', () => {
    const samples = [
      { atMs: 0, usedJsHeapSizeBytes: 1_000_000 },
      { atMs: 200, usedJsHeapSizeBytes: 2_000_000 },
      { atMs: 400, usedJsHeapSizeBytes: 3_000_000 },
    ];
    const indicator = computeGcIndicator(samples);
    expect(indicator.gcLikeDropCount).toBe(0);
    expect(indicator.maxDropBytes).toBe(0);
  });
});

// Task#17(Suu指示): 固定16.7ms閾値の境界問題(60Hz実周期16.666...ms・タイマー
// 揺れ)を避けるため、生データの中央値から実際のリフレッシュ周期を推定し、
// その1.5倍を超えたフレームを「実質的なmissed-vsync」として数える。
describe('computeVsyncAwareStats', () => {
  it('空配列は全項目0を返す', () => {
    expect(computeVsyncAwareStats([])).toMatchObject({
      estimatedRefreshIntervalMs: 0,
      missedVsyncCount: 0,
      missedVsyncThresholdMs: 0,
    });
  });

  it('ほぼ全フレームが16.666ms(60Hz)なら推定周期も16.666ms付近になり、超過は数えない(既知値)', () => {
    const durations = Array.from({ length: 100 }, () => 16.666);
    const stats = computeVsyncAwareStats(durations);
    expect(stats.estimatedRefreshIntervalMs).toBeCloseTo(16.666, 5);
    expect(stats.missedVsyncThresholdMs).toBeCloseTo(16.666 * 1.5, 5);
    expect(stats.missedVsyncCount).toBe(0);
  });

  it('推定周期の1.5倍を超えたフレームだけをmissedVsyncCountへ数える(既知値)', () => {
    // 中央値が16.666msになるよう大半を16.666msにし、一部だけ33.3ms(2vsync分、
    // 1.5倍の閾値25msを超える)・20ms(1.5倍未満、超過に数えない)を混ぜる。
    const durations = [
      ...Array.from({ length: 20 }, () => 16.666),
      20, // 16.666*1.5≈25ms未満なので超過に数えない
      33.3, // 25ms超なので超過に数える
      50, // 25ms超なので超過に数える
    ];
    const stats = computeVsyncAwareStats(durations);
    expect(stats.missedVsyncCount).toBe(2);
  });

  it('固定16.7ms閾値のcomputeFrameStats.droppedFrameCountとは独立した値になりうる(60Hzより遅い環境の例)', () => {
    // 実際の周期が30fps(約33.3ms)相当の環境では、フレーム自体は正常でも
    // 固定16.7ms閾値だと全フレームが「超過」に見えてしまう。vsync対応版は
    // 実際の周期(33.3ms)を基準にするため、正常なフレームは超過に数えない。
    const durations = Array.from({ length: 50 }, () => 33.3);
    const frameStats = computeFrameStats(durations);
    const vsyncStats = computeVsyncAwareStats(durations);
    expect(frameStats.droppedFrameCount).toBe(50); // 固定16.7ms基準では全件「超過」
    expect(vsyncStats.missedVsyncCount).toBe(0); // 実周期基準では正常(欠落なし)
  });

  it('中央値は外れ値(1件だけの巨大値)に強い(既知値)', () => {
    const durations = [...Array.from({ length: 99 }, () => 16.666), 500];
    const stats = computeVsyncAwareStats(durations);
    expect(stats.estimatedRefreshIntervalMs).toBeCloseTo(16.666, 5);
    expect(stats.missedVsyncCount).toBe(1); // 500msの1件だけが超過
  });
});
