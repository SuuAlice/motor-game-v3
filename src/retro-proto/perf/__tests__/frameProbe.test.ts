import { describe, expect, it } from 'vitest';
import { computeFrameStats, computeMemoryStats } from '../frameProbe';

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
