import { describe, expect, it } from 'vitest';
import { CHECKER_HEIGHT_PX, CHECKER_WIDTH_PX, getCheckerFloorPixel } from '../checkerFloorSource';

describe('getCheckerFloorPixel', () => {
  it('範囲外はnullを返す', () => {
    expect(getCheckerFloorPixel(-1, 0)).toBeNull();
    expect(getCheckerFloorPixel(0, -1)).toBeNull();
    expect(getCheckerFloorPixel(CHECKER_WIDTH_PX, 0)).toBeNull();
    expect(getCheckerFloorPixel(0, CHECKER_HEIGHT_PX)).toBeNull();
  });

  it('タイル境界を跨ぐと色が反転する(市松模様)', () => {
    const a = getCheckerFloorPixel(0, 0);
    const b = getCheckerFloorPixel(20, 0);
    const c = getCheckerFloorPixel(0, 20);
    const d = getCheckerFloorPixel(20, 20);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe(d);
  });

  it('同一タイル内は同じ色を返す', () => {
    expect(getCheckerFloorPixel(1, 1)).toBe(getCheckerFloorPixel(19, 19));
  });
});
