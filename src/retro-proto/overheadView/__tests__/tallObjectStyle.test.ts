import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../../retro/palette';
import { computeTallObjectRects, getTallObjectColors } from '../tallObjectStyle';

describe('getTallObjectColors', () => {
  it('G3高所オブジェクトの塗り色はPALETTE.G3に固定される(art-spec §5.1.1)', () => {
    expect(getTallObjectColors().base).toBe(PALETTE.G3);
  });

  it('接地帯はPALETTE.N1(1段暗い色)にする', () => {
    expect(getTallObjectColors().groundBand).toBe(PALETTE.N1);
  });
});

describe('computeTallObjectRects', () => {
  const obj = { x: 130, y: 8, widthPx: 20, heightPx: 46 };

  it('camX/camYが整数のとき、返す矩形の全フィールドが整数になる', () => {
    const rects = computeTallObjectRects(obj, 100, -50);
    for (const rect of [rects.groundBand, rects.base]) {
      for (const [key, value] of Object.entries(rect)) {
        expect(Number.isInteger(value), `${key}が整数ではない: ${value}`).toBe(true);
      }
    }
  });

  it('art-spec §2.2(整数ピクセル規律): camX/camYが非整数でも返す矩形は常に整数になる', () => {
    const rects = computeTallObjectRects(obj, 99.7, -50.3);
    for (const rect of [rects.groundBand, rects.base]) {
      for (const [key, value] of Object.entries(rect)) {
        expect(Number.isInteger(value), `${key}が整数ではない: ${value}`).toBe(true);
      }
    }
  });

  it('baseの下端(y+heightPx)が接地点(obj.y-camY相当)に一致する', () => {
    const rects = computeTallObjectRects(obj, 0, 0);
    expect(rects.base.y + rects.base.heightPx).toBe(Math.round(obj.y));
  });
});
