import { describe, expect, it } from 'vitest';
import { computeSegmentRects, getSegmentPattern } from '../segmentDigits';

describe('getSegmentPattern', () => {
  it('0は上下左右+上下辺(gを除く6セグメント)が点灯する', () => {
    expect(getSegmentPattern('0')).toEqual([true, true, true, true, true, true, false]);
  });

  it('1は右上・右下の2セグメントのみ点灯する', () => {
    expect(getSegmentPattern('1')).toEqual([false, true, true, false, false, false, false]);
  });

  it('8は全セグメント点灯する', () => {
    expect(getSegmentPattern('8')).toEqual([true, true, true, true, true, true, true]);
  });

  it('-は中央セグメントのみ点灯する', () => {
    expect(getSegmentPattern('-')).toEqual([false, false, false, false, false, false, true]);
  });

  it('未対応文字は空白扱い(全消灯)になる', () => {
    expect(getSegmentPattern('X')).toEqual([false, false, false, false, false, false, false]);
    expect(getSegmentPattern(' ')).toEqual([false, false, false, false, false, false, false]);
  });
});

describe('computeSegmentRects', () => {
  it('art-spec §2.2(整数ピクセル規律): 偶数寸法でも奇数寸法でも全フィールドが整数になる', () => {
    const cases: Array<[number, number, number, number, number]> = [
      [0, 0, 10, 20, 2],
      [3, 5, 11, 21, 3],
      [0.4, 0.6, 9, 15, 1.7],
    ];
    for (const [x, y, w, h, t] of cases) {
      for (const char of '0123456789- ') {
        const rects = computeSegmentRects(char, x, y, w, h, t);
        for (const rect of rects) {
          for (const [key, value] of Object.entries(rect)) {
            expect(Number.isInteger(value), `${char}(${x},${y},${w},${h},${t})の${key}が整数ではない: ${value}`).toBe(true);
          }
        }
      }
    }
  });

  it('8は7セグメントすべて分の矩形を返す', () => {
    expect(computeSegmentRects('8', 0, 0, 10, 20, 2)).toHaveLength(7);
  });

  it('空白は矩形を返さない', () => {
    expect(computeSegmentRects(' ', 0, 0, 10, 20, 2)).toHaveLength(0);
  });
});
