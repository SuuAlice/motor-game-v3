import { describe, expect, it } from 'vitest';
import { generateDummyWindingRecord } from '../dummyWindingRecord';
import { computeWindingTraceGeometry } from '../windingTraceGeometry';

// Unit D試作で実際に使用する4解像度案の内部解像度(worldまたはUI層)。
const CONTENT_RESOLUTIONS: Array<[number, number]> = [
  [320, 180],
  [480, 270],
  [640, 360],
  [960, 540],
];

describe('computeWindingTraceGeometry', () => {
  const turns = generateDummyWindingRecord();

  it.each(CONTENT_RESOLUTIONS)(
    'art-spec §2.2(整数ピクセル規律): %ix%i で全出力値が整数になる',
    (w, h) => {
      const geo = computeWindingTraceGeometry(turns, w, h);
      for (const [key, value] of Object.entries(geo.stripRect)) {
        expect(Number.isInteger(value), `stripRect.${key}が整数ではない: ${value}`).toBe(true);
      }
      for (const [key, value] of Object.entries(geo.axisRect)) {
        expect(Number.isInteger(value), `axisRect.${key}が整数ではない: ${value}`).toBe(true);
      }
      for (const stroke of geo.strokes) {
        for (const [key, value] of Object.entries(stroke)) {
          if (key === 'recent') continue;
          expect(Number.isInteger(value), `stroke.${key}が整数ではない: ${value}`).toBe(true);
        }
      }
    },
  );

  it('150ターン分のstrokeを生成する', () => {
    expect(computeWindingTraceGeometry(turns, 480, 270).strokes).toHaveLength(150);
  });

  it('後半のターンはrecent=trueになる(新しいターンほど明色)', () => {
    const geo = computeWindingTraceGeometry(turns, 480, 270);
    expect(geo.strokes[0].recent).toBe(false);
    expect(geo.strokes[geo.strokes.length - 1].recent).toBe(true);
  });
});
