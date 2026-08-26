import { describe, expect, it } from 'vitest';
// 記録fixtureはPhase 1試作の決定論的生成器を引き続き使う(見た目の回帰を保つため)。
// 型の単一出典はalice正典`src/materials/windingRecord.ts`側にある。
import { generateDummyWindingRecord } from '../../../retro-proto/resolutionHarness/dummyWindingRecord';
import { computeWindingEnvelopeScale, computeWindingTraceGeometry } from '../windingTraceGeometry';

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

// Task#WINDING-AGE-RADIUS(Suu承認): 新旧ターンの明度差が、同じ包絡(topY/bottomY固定)への
// 重なりで視認できなくなっていた問題の修正。armOffset(x方向)ではなく半径方向(stripYから
// controlY/startY・endYまでの上下距離)をターンindexに応じて連続的・単調に拡大する。
describe('computeWindingEnvelopeScale', () => {
  it('境界値: index=0で0.4倍(内層下限)、index=totalTurns-1で1.0倍(現行最大包絡)になる(既知値)', () => {
    expect(computeWindingEnvelopeScale(0, 150)).toBeCloseTo(0.4, 5);
    expect(computeWindingEnvelopeScale(149, 150)).toBeCloseTo(1, 5);
  });

  it('indexの増加に対して単調非減少になる', () => {
    let prev = computeWindingEnvelopeScale(0, 150);
    for (let i = 1; i < 150; i++) {
      const cur = computeWindingEnvelopeScale(i, 150);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it('totalTurns<=1のときは1を返す(境界値、0除算を避ける)', () => {
    expect(computeWindingEnvelopeScale(0, 1)).toBe(1);
    expect(computeWindingEnvelopeScale(0, 0)).toBe(1);
  });
});

describe('computeWindingTraceGeometryの半径方向包絡(Task#WINDING-AGE-RADIUS)', () => {
  // arm/tension/positionを固定し、indexのみ変化させた合成turnsで包絡の拡大を検証する
  // (x方向のcx・wobble・armOffsetは無変更であることの間接確認も兼ねる)。
  const syntheticTurns = Array.from({ length: 150 }, () => ({
    position: 0.5,
    arm: 'straddle' as const,
    direction: 1 as const,
    tension: 0.5,
  }));

  it('stripYからcontrolY/startYまでの絶対距離がindex増加に対し非減少、最新>最古', () => {
    const h = 270;
    const geo = computeWindingTraceGeometry(syntheticTurns, 480, h);
    const stripY = Math.round(h * 0.5);
    const distances = geo.strokes.map((s) => Math.abs(s.startY - stripY));

    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
    expect(distances[distances.length - 1]).toBeGreaterThan(distances[0]);

    // controlYはstripYから見て逆方向(上)に同じ絶対距離になる
    geo.strokes.forEach((stroke, i) => {
      expect(Math.abs(stroke.controlY - stripY)).toBe(distances[i]);
    });
  });

  it('同一arm条件ではx方向(startX/controlX/endX)がindexによらず一定になる(半径方向のみ変化する回帰確認)', () => {
    const geo = computeWindingTraceGeometry(syntheticTurns, 480, 270);
    const first = geo.strokes[0];
    for (const stroke of geo.strokes) {
      expect(stroke.startX).toBe(first.startX);
      expect(stroke.controlX).toBe(first.controlX);
      expect(stroke.endX).toBe(first.endX);
    }
  });

  it('包絡の外形がcontent範囲内に収まる(既存の最大包絡を超えない)', () => {
    const h = 270;
    const geo = computeWindingTraceGeometry(syntheticTurns, 480, h);
    for (const stroke of geo.strokes) {
      expect(stroke.controlY).toBeGreaterThanOrEqual(0);
      expect(stroke.startY).toBeLessThanOrEqual(h);
      expect(stroke.endY).toBeLessThanOrEqual(h);
    }
  });
});
