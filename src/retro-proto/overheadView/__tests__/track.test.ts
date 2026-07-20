import { describe, expect, it } from 'vitest';
import {
  TRACK_CORNER_RADIUS,
  TRACK_STRAIGHT_LENGTH,
  buildDummyTrackLoop,
  offsetPerpendicular,
  snapTo16Directions,
} from '../track';

describe('buildDummyTrackLoop', () => {
  const loop = buildDummyTrackLoop();

  it('直線+コーナーの合計点数を生成する', () => {
    expect(loop.length).toBe(40 * 2 + 32 * 2);
  });

  it('全点のheadingRadが有限値である', () => {
    for (const p of loop) {
      expect(Number.isFinite(p.headingRad)).toBe(true);
    }
  });

  it('ループが閉じている(始点と終点が近い)', () => {
    const first = loop[0];
    const last = loop[loop.length - 1];
    const dist = Math.hypot(first.x - last.x, first.y - last.y);
    // 1ステップ分の間隔程度の誤差に収まる(コーナー半径×2π/32ステップ程度が目安)
    expect(dist).toBeLessThan((2 * Math.PI * TRACK_CORNER_RADIUS) / 32 + 5);
  });

  it('コースの外形がおおよそ直線長+コーナー半径×2の範囲に収まる', () => {
    const xs = loop.map((p) => p.x);
    const ys = loop.map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width).toBeGreaterThan(TRACK_STRAIGHT_LENGTH);
    expect(height).toBeGreaterThan(TRACK_CORNER_RADIUS);
  });
});

describe('offsetPerpendicular', () => {
  it('進行方向+x(heading=0)のとき、+distanceは+y方向へオフセットする', () => {
    const p = { x: 0, y: 0, headingRad: 0 };
    const offset = offsetPerpendicular(p, 10);
    expect(offset.x).toBeCloseTo(0);
    expect(offset.y).toBeCloseTo(10);
  });
});

describe('snapTo16Directions', () => {
  it('0radは方位0になる', () => {
    expect(snapTo16Directions(0)).toBe(0);
  });

  it('負の角度も0〜15の範囲に正規化する', () => {
    const idx = snapTo16Directions(-0.01);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThanOrEqual(15);
  });

  it('2πを超える角度も正しく折り返す', () => {
    expect(snapTo16Directions(Math.PI * 2 + 0.01)).toBe(snapTo16Directions(0.01));
  });

  it('隣接する16方位境界付近で単調に変化する', () => {
    const step = (Math.PI * 2) / 16;
    expect(snapTo16Directions(step * 3)).toBe(3);
    expect(snapTo16Directions(step * 3 + 0.001)).toBe(3);
  });
});
