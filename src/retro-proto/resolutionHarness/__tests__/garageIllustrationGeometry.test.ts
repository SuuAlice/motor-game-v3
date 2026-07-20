import { describe, expect, it } from 'vitest';
import { computeGarageIllustrationGeometry } from '../garageIllustrationGeometry';

const CONTENT_RESOLUTIONS: Array<[number, number]> = [
  [320, 180],
  [480, 270],
  [640, 360],
  [960, 540],
];

describe('computeGarageIllustrationGeometry', () => {
  it.each(CONTENT_RESOLUTIONS)(
    'art-spec §2.2(整数ピクセル規律): %ix%i で全図形の全数値が整数になる',
    (w, h) => {
      const shapes = computeGarageIllustrationGeometry(w, h);
      expect(shapes.length).toBeGreaterThan(0);
      for (const shape of shapes) {
        for (const [key, value] of Object.entries(shape)) {
          if (key === 'kind' || key === 'color') continue;
          expect(Number.isInteger(value), `${shape.kind} ${key}が整数ではない: ${value}`).toBe(true);
        }
      }
    },
  );

  it('机・棚・本棚・ドア・正典機の要素を含む(机上の車輪2個を含め矩形+円の混在)', () => {
    const shapes = computeGarageIllustrationGeometry(480, 270);
    expect(shapes.some((s) => s.kind === 'circle')).toBe(true);
    expect(shapes.some((s) => s.kind === 'rect')).toBe(true);
  });
});
