import { describe, expect, it } from 'vitest';
import { computeCarIndex } from '../carIndex';

// Task#17: WorstCaseDemoの初回フレームクラッシュ(headless ChromiumでrequestAnimationFrame
// のタイムスタンプが直前のperformance.now()よりわずかに小さくなり、progressが負転して
// TRACK_POINTS[-1]がundefinedになっていた)の再発防止。carIndexは常に0以上
// trackLength未満の有限整数であるという不変条件を固定する。
describe('computeCarIndex', () => {
  it('progress=0はindex 0になる(既知値)', () => {
    expect(computeCarIndex(0, 144)).toBe(0);
  });

  it('progressがtrackLengthちょうどなら0へ折り返す(既知値)', () => {
    expect(computeCarIndex(144, 144)).toBe(0);
  });

  it('progressの整数部がそのままindexになる(端数は切り捨て)', () => {
    expect(computeCarIndex(5.9, 144)).toBe(5);
  });

  it('小さな負のprogress(rAFタイムスタンプ逆転相当)でも範囲内の有限整数を返す', () => {
    const result = computeCarIndex(-0.2178, 144);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(144);
    expect(result).toBe(143); // -1を144の数学的moduloで折り返した値
  });

  it('大きな負のprogressでも範囲内に折り返す', () => {
    const result = computeCarIndex(-289, 144); // -289 = -2*144 - 1
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(144);
    expect(result).toBe(143);
  });

  it('progressが非常に大きくても範囲内の有限整数を返す', () => {
    const result = computeCarIndex(1_000_000.5, 144);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(144);
  });

  it('trackLengthが0以下、非整数の場合は拒否する', () => {
    expect(() => computeCarIndex(0, 0)).toThrow();
    expect(() => computeCarIndex(0, -1)).toThrow();
    expect(() => computeCarIndex(0, 1.5)).toThrow();
  });

  it('progressがNaN/Infinityの場合は拒否する', () => {
    expect(() => computeCarIndex(NaN, 144)).toThrow();
    expect(() => computeCarIndex(Infinity, 144)).toThrow();
    expect(() => computeCarIndex(-Infinity, 144)).toThrow();
  });
});
