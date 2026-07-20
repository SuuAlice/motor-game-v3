import { describe, expect, it } from 'vitest';
import { auditUniversalExtremes, auditUniversalMonotonicity, percentileTarget } from '../trackSweep';

describe('車体込みsweep集計', () => {
  it('上限の95〜99%を方向に応じて目標値へ変換する', () => {
    expect(percentileTarget(10, 'max', 0.97)).toBeCloseTo(9.7);
    expect(percentileTarget(10, 'min', 0.97)).toBeCloseTo(10 / 0.97);
    expect(() => percentileTarget(10, 'min', 0.9)).toThrow(RangeError);
  });

  it('全コースの最良構成が同じ極端値にそろう縮退を検出する', () => {
    const best = new Map([
      ['straight', { gearRatio: 8, wheelDiameterMm: 20 }],
      ['hill', { gearRatio: 8, wheelDiameterMm: 40 }],
    ]);
    expect(auditUniversalExtremes(best, { gearRatio: [2, 4, 8], wheelDiameterMm: [20, 30, 40] })).toEqual([
      { parameter: 'gearRatio', direction: 'max', trackIds: ['straight', 'hill'] },
    ]);
  });

  it('同点を一方向操作の縮退と誤判定せず、全コースで厳密に単調な場合だけ検出する', () => {
    const scores = new Map([
      ['straight', new Map([[1, 10], [2, 10], [3, 10]])],
      ['hill', new Map([[1, 8], [2, 9], [3, 10]])],
    ]);
    expect(auditUniversalMonotonicity('massG', [1, 2, 3], scores)).toEqual([]);
    scores.set('straight', new Map([[1, 7], [2, 8], [3, 9]]));
    expect(auditUniversalMonotonicity('massG', [1, 2, 3], scores)).toEqual([
      { parameter: 'massG', direction: 'min', trackIds: ['straight', 'hill'] },
    ]);
  });
});
