import { describe, expect, it } from 'vitest';
import { computeCarSpriteGeometry } from '../carSprite';

describe('computeCarSpriteGeometry', () => {
  it('同じ方位インデックスなら決定論的に同じジオメトリを返す', () => {
    expect(computeCarSpriteGeometry(5)).toEqual(computeCarSpriteGeometry(5));
  });

  it('16方位すべてで描画結果(ジオメトリ)が互いに異なる', () => {
    const results = Array.from({ length: 16 }, (_, i) => JSON.stringify(computeCarSpriteGeometry(i)));
    expect(new Set(results).size).toBe(16);
  });

  it('真横視(方位0・8)は真上/真下視(方位4・12)より側面の幅・高さが大きい(3/4視点で側面が読める)', () => {
    const side = computeCarSpriteGeometry(0);
    const frontBack = computeCarSpriteGeometry(4);
    expect(side.wallWidthPx).toBeGreaterThan(frontBack.wallWidthPx);
    expect(side.wallHeightPx).toBeGreaterThan(frontBack.wallHeightPx);
  });

  it('前部マーカーは進行方向ベクトルに追従する(前後方向が読める)', () => {
    const east = computeCarSpriteGeometry(0); // 角度0 = +x方向
    expect(east.frontMarkerOffsetXPx).toBeGreaterThan(0);
    expect(east.frontMarkerOffsetYPx).toBeCloseTo(0, 5);

    const south = computeCarSpriteGeometry(4); // 角度90° = +y方向
    expect(south.frontMarkerOffsetYPx).toBeGreaterThan(0);
    expect(south.frontMarkerOffsetXPx).toBeCloseTo(0, 5);
  });

  it('左右対称の方位(0と8)は側面サイズが等しく前部マーカーの符号が反転する', () => {
    const east = computeCarSpriteGeometry(0);
    const west = computeCarSpriteGeometry(8);
    expect(west.wallWidthPx).toBeCloseTo(east.wallWidthPx);
    expect(west.wallHeightPx).toBeCloseTo(east.wallHeightPx);
    expect(west.frontMarkerOffsetXPx).toBeCloseTo(-east.frontMarkerOffsetXPx);
  });

  it('art-spec §2.2(整数ピクセル規律): 全16方位の全フィールドが整数になる', () => {
    for (let i = 0; i < 16; i++) {
      const geo = computeCarSpriteGeometry(i);
      for (const [key, value] of Object.entries(geo)) {
        expect(Number.isInteger(value), `方位${i}の${key}が整数ではない: ${value}`).toBe(true);
      }
    }
  });
});
