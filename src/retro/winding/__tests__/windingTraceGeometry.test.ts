import { describe, expect, it } from 'vitest';
// 記録fixtureはPhase 1試作の決定論的生成器を引き続き使う(見た目の回帰を保つため)。
// 型の単一出典はalice正典`src/materials/windingRecord.ts`側にある。
import { generateDummyWindingRecord } from '../../../retro-proto/resolutionHarness/dummyWindingRecord';
import {
  WINDING_AGE_STEPS,
  computeWindingAgeStep,
  computeWindingEnvelopeScale,
  computeWindingTraceGeometry,
  WINDING_OUTLINE_EXAGGERATION,
  computeWindingOutlineThicknessRatios,
  type WindingJigState,
} from '../windingTraceGeometry';

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
          if (key === 'ageStep') continue;
          expect(Number.isInteger(value), `stroke.${key}が整数ではない: ${value}`).toBe(true);
        }
      }
    },
  );

  it('150ターン分のstrokeを生成する', () => {
    expect(computeWindingTraceGeometry(turns, 480, 270).strokes).toHaveLength(150);
  });

  it('最古が最も暗い段、最新が最も明るい段になる(新しいターンほど明色)', () => {
    const geo = computeWindingTraceGeometry(turns, 480, 270);
    expect(geo.strokes[0].ageStep).toBe(0);
    expect(geo.strokes[geo.strokes.length - 1].ageStep).toBe(WINDING_AGE_STEPS - 1);
  });
});

// P4-0 G7視覚是正V2(人間承認済み有限差分): 年代の階調を2段から4段へ広げる。
describe('computeWindingAgeStep', () => {
  it('0..3の整数を返し、indexに対し単調非減少', () => {
    for (const total of [2, 3, 30, 150]) {
      let previous = -1;
      for (let i = 0; i < total; i++) {
        const step = computeWindingAgeStep(i, total);
        expect(Number.isInteger(step)).toBe(true);
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThanOrEqual(WINDING_AGE_STEPS - 1);
        expect(step).toBeGreaterThanOrEqual(previous);
        previous = step;
      }
    }
  });

  it('最古は0段、最新は3段になる', () => {
    for (const total of [2, 30, 150]) {
      expect(computeWindingAgeStep(0, total)).toBe(0);
      expect(computeWindingAgeStep(total - 1, total)).toBe(WINDING_AGE_STEPS - 1);
    }
  });

  it('0ターン・1ターンでも有限で、唯一のターンは最新段', () => {
    expect(computeWindingAgeStep(0, 1)).toBe(WINDING_AGE_STEPS - 1);
    expect(computeWindingAgeStep(0, 0)).toBe(WINDING_AGE_STEPS - 1);
  });

  it('30ターンで4段すべてが使われる(2段に潰れない)', () => {
    const steps = new Set(Array.from({ length: 30 }, (_, i) => computeWindingAgeStep(i, 30)));
    expect(steps.size).toBe(WINDING_AGE_STEPS);
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

// P4-0 G7視覚是正V1/V3(人間承認済み): 巻線治具の最小描画。
// 「いまの保持状態」は記録から導けないため、optionalな`jig`で明示的に渡す。
describe('巻線治具の幾何(WindingJigState)', () => {
  const record = generateDummyWindingRecord();
  const jig = (over: Partial<WindingJigState> = {}): WindingJigState => ({
    position: 0.5, arm: 'straddle', tension: 0.5, direction: 1, ...over,
  });

  it('jigを渡さないと治具の座標は存在しない(既存の絵が変わらない)', () => {
    const geo = computeWindingTraceGeometry(record, 480, 270);
    expect(geo.jig).toBeUndefined();
  });

  it('jigの有無でstrip・axis・strokeは1つも変わらない', () => {
    const without = computeWindingTraceGeometry(record, 480, 270);
    const with_ = computeWindingTraceGeometry(record, 480, 270, jig());
    expect(with_.stripRect).toEqual(without.stripRect);
    expect(with_.axisRect).toEqual(without.axisRect);
    expect(with_.strokes).toEqual(without.strokes);
  });

  it.each(CONTENT_RESOLUTIONS)('%ix%i: 治具の全座標が整数でcontent内に収まる', (w, h) => {
    for (const state of [jig({ position: 0, tension: 0, direction: -1, arm: 'left' }), jig(), jig({ position: 1, tension: 1, arm: 'right' })]) {
      const g = computeWindingTraceGeometry(record, w, h, state).jig;
      expect(g).toBeDefined();
      if (g === undefined) return;
      const rects = [g.boardRect, ...g.slotRects, g.guideRect, g.rubberBandRect, g.switchBaseRect, g.switchLeverRect];
      for (const rect of rects) {
        for (const [key, value] of Object.entries(rect)) {
          expect(Number.isInteger(value), `${key}が整数ではない: ${value}`).toBe(true);
        }
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.widthPx).toBeLessThanOrEqual(w);
        expect(rect.y + rect.heightPx).toBeLessThanOrEqual(h);
        expect(rect.widthPx).toBeGreaterThan(0);
        expect(rect.heightPx).toBeGreaterThan(0);
      }
    }
  });

  it('導線ガイドのxはpositionに対し単調非減少', () => {
    let previous = -Infinity;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const g = computeWindingTraceGeometry(record, 480, 270, jig({ position: Math.min(1, p) })).jig;
      const x = g?.guideRect.x ?? 0;
      expect(x).toBeGreaterThanOrEqual(previous);
      previous = x;
    }
  });

  it('スロットは3つで、縁がposition 1/3・2/3に対応する', () => {
    const w = 480;
    const g = computeWindingTraceGeometry(record, w, 270, jig()).jig;
    expect(g?.slotRects).toHaveLength(3);
    if (g === undefined) return;
    // スロット間の隙間の中心が 1/3・2/3 に一致する(縁としてのみ境界を示す)。
    expect((g.slotRects[0].x + g.slotRects[0].widthPx + g.slotRects[1].x) / 2).toBe(Math.round(w / 3));
    expect((g.slotRects[1].x + g.slotRects[1].widthPx + g.slotRects[2].x) / 2).toBe(Math.round((w * 2) / 3));
  });

  it('armごとに使用中スロットが変わる', () => {
    expect(computeWindingTraceGeometry(record, 480, 270, jig({ arm: 'left' })).jig?.activeSlotIndex).toBe(0);
    expect(computeWindingTraceGeometry(record, 480, 270, jig({ arm: 'straddle' })).jig?.activeSlotIndex).toBe(1);
    expect(computeWindingTraceGeometry(record, 480, 270, jig({ arm: 'right' })).jig?.activeSlotIndex).toBe(2);
  });

  it('輪ゴムの伸びはtensionに対し単調非増加で、0/1の両端でも有限', () => {
    let previous = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const g = computeWindingTraceGeometry(record, 480, 270, jig({ tension: Math.min(1, t) })).jig;
      const height = g?.rubberBandRect.heightPx ?? 0;
      expect(Number.isFinite(height)).toBe(true);
      expect(height).toBeGreaterThan(0);
      expect(height).toBeLessThanOrEqual(previous);
      previous = height;
    }
    // 締めた側とたるませた側で実際に差が出る(段の中で潰れない)。
    const taut = computeWindingTraceGeometry(record, 480, 270, jig({ tension: 1 })).jig;
    const slack = computeWindingTraceGeometry(record, 480, 270, jig({ tension: 0 })).jig;
    expect((slack?.rubberBandRect.heightPx ?? 0)).toBeGreaterThan(taut?.rubberBandRect.heightPx ?? 0);
  });

  it('スイッチのレバーはdirectionで別の座標になる(色に頼らない)', () => {
    const forward = computeWindingTraceGeometry(record, 480, 270, jig({ direction: 1 })).jig;
    const reverse = computeWindingTraceGeometry(record, 480, 270, jig({ direction: -1 })).jig;
    expect(forward?.switchLeverRect.x).not.toBe(reverse?.switchLeverRect.x);
    // 台座は動かない。動くのはレバーだけ。
    expect(forward?.switchBaseRect).toEqual(reverse?.switchBaseRect);
  });
});

// 年代→半径(縦)と張力→足の開き(横)の直交性。片方を変えても他方の軸が動かないことを固定する。
describe('年代と張力の出典が二重化していない', () => {
  const base = { position: 0.5, arm: 'straddle' as const, direction: 1 as const };

  it('同一index・同一positionでtensionだけ変えてもY座標は変わらない', () => {
    const of = (tension: number) =>
      computeWindingTraceGeometry(Array.from({ length: 30 }, () => ({ ...base, tension })), 480, 270).strokes;
    const taut = of(1);
    const slack = of(0);
    taut.forEach((stroke, i) => {
      expect(stroke.startY).toBe(slack[i].startY);
      expect(stroke.controlY).toBe(slack[i].controlY);
      expect(stroke.endY).toBe(slack[i].endY);
    });
    // 横方向(足の開き)だけが変わる。締めたほうが狭い。
    expect(taut[0].endX - taut[0].startX).toBeLessThan(slack[0].endX - slack[0].startX);
  });
});

// P4-1B B3(2026-08-30人間承認): W1外形輪郭・中央またぎ・W2同縮尺比較。
describe('W1 外形輪郭', () => {
  const at = (position: number) => ({ position, arm: 'straddle' as const, direction: 1 as const, tension: 0.5 });

  it('空記録では輪郭を描かない(存在しない形を作らない)', () => {
    expect(computeWindingTraceGeometry([], 480, 270).outline).toEqual([]);
  });

  it('座標はすべて整数で、content内に収まる', () => {
    const geo = computeWindingTraceGeometry(generateDummyWindingRecord(), 480, 270);
    expect(geo.outline.length).toBeGreaterThan(1);
    for (const point of geo.outline) {
      expect(Number.isInteger(point.x)).toBe(true);
      expect(Number.isInteger(point.topY)).toBe(true);
      expect(Number.isInteger(point.bottomY)).toBe(true);
      expect(point.topY).toBeGreaterThanOrEqual(0);
      expect(point.bottomY).toBeLessThanOrEqual(270);
    }
  });

  it('短冊中心に対して上下対称', () => {
    const h = 270;
    const stripY = Math.round(h * 0.5);
    for (const point of computeWindingTraceGeometry(generateDummyWindingRecord(), 480, h).outline) {
      expect(stripY - point.topY).toBe(point.bottomY - stripY);
    }
  });

  it('密集した区間は外へ、空いた区間は内へ凹む', () => {
    // 左端へ20ターン、右端へ2ターン。中央は空。
    const record = [
      ...Array.from({ length: 20 }, () => at(0.02)),
      ...Array.from({ length: 2 }, () => at(0.98)),
    ];
    const geo = computeWindingTraceGeometry(record, 480, 270);
    const thickness = geo.outline.map((p) => p.bottomY - p.topY);
    const left = thickness[0];
    const middle = thickness[Math.floor(thickness.length / 2)];
    const right = thickness[thickness.length - 1];
    expect(left).toBeGreaterThan(right);
    expect(right).toBeGreaterThan(middle);
  });

  it('均一に巻けば輪郭は平ら(巻数が多いだけでは膨らまない)', () => {
    const even = Array.from({ length: 128 }, (_, i) => at((i % 32) / 32 + 1 / 64));
    const thickness = computeWindingTraceGeometry(even, 480, 270).outline.map((p) => p.bottomY - p.topY);
    expect(Math.max(...thickness) - Math.min(...thickness)).toBeLessThanOrEqual(1);
  });

  it('最大包絡を超えない', () => {
    const h = 270;
    const maxRadius = Math.round(h * 0.5) - Math.round(h * 0.12);
    const dense = Array.from({ length: 50 }, () => at(0.5));
    for (const point of computeWindingTraceGeometry(dense, 480, h).outline) {
      expect(Math.round(h * 0.5) - point.topY).toBeLessThanOrEqual(maxRadius);
    }
  });
});

// 誇張倍率が**実際に座標へ効く**ことの検証。定数値を見るだけでは、式の上で
// 相殺されていても気づけない(実際に一度そうなっていた)。
describe('W1 誇張倍率のふるまい', () => {
  const at = (position: number) => ({ position, arm: 'straddle' as const, direction: 1 as const, tension: 0.5 });
  // 平均より上の区間・平均ちょうど・平均より下、が混ざる分布。
  const counts = [8, 4, 4, 4];

  it('平均どおりの区間と密集区間のコントラストが、倍率とともに強くなる', () => {
    const contrast = (ex: number) => {
      const r = computeWindingOutlineThicknessRatios(counts, ex);
      return Math.max(...r) - r[1];
    };
    // 倍率1(誇張なし)より、承認済み初期値3のほうが差が読める。
    expect(contrast(WINDING_OUTLINE_EXAGGERATION)).toBeGreaterThan(contrast(1));
    // 単調に強まる。
    expect(contrast(2)).toBeGreaterThan(contrast(1));
    expect(contrast(3)).toBeGreaterThan(contrast(2));
    expect(contrast(5)).toBeGreaterThan(contrast(3));
  });

  it('倍率が変わっても最大は1のまま(最大包絡を超えない)', () => {
    for (const ex of [1, 2, 3, 5, 10]) {
      const r = computeWindingOutlineThicknessRatios(counts, ex);
      expect(Math.max(...r)).toBeCloseTo(1, 10);
      for (const value of r) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('均一な分布は倍率をいくつにしても平ら(巻数が多いだけでは膨らまない)', () => {
    for (const ex of [1, 3, 10]) {
      const r = computeWindingOutlineThicknessRatios([4, 4, 4, 4], ex);
      expect(Math.max(...r) - Math.min(...r)).toBeCloseTo(0, 10);
    }
  });

  it('倍率の違いが実際の描画座標の差になる', () => {
    // 幾何側は既定倍率を使う。倍率1の比と比べて、平均区間の厚みが薄くなる。
    const record = [
      ...Array.from({ length: 16 }, () => at(0.02)),
      ...Array.from({ length: 8 }, () => at(0.52)),
    ];
    const geo = computeWindingTraceGeometry(record, 480, 270);
    const thickness = geo.outline.map((p) => p.bottomY - p.topY);
    // 密集側が最大、空き側が最小、その差が実座標として現れる。
    expect(Math.max(...thickness)).toBeGreaterThan(Math.min(...thickness) + 4);
  });

  it('空記録では比も0で、NaNを出さない', () => {
    for (const value of computeWindingOutlineThicknessRatios([0, 0, 0], 3)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBe(0);
    }
    expect(computeWindingOutlineThicknessRatios([], 3)).toEqual([]);
  });
});

describe('中央またぎの渡り線', () => {
  const turn = (arm: 'left' | 'right' | 'straddle') => ({ position: 0.5, arm, direction: 1 as const, tension: 0.5 });

  it('straddleが無ければ空', () => {
    const geo = computeWindingTraceGeometry([turn('left'), turn('right')], 480, 270);
    expect(geo.crossovers).toEqual([]);
  });

  it('straddleの本数だけ生成し、軸を左右に跨ぐ', () => {
    const record = [turn('left'), turn('straddle'), turn('right'), turn('straddle')];
    const geo = computeWindingTraceGeometry(record, 480, 270);
    expect(geo.crossovers).toHaveLength(2);
    const axisX = Math.round(480 / 2);
    for (const segment of geo.crossovers) {
      expect(segment.startX).toBeLessThan(axisX);
      expect(segment.endX).toBeGreaterThan(axisX);
      expect(Number.isInteger(segment.startX)).toBe(true);
      expect(Number.isInteger(segment.endX)).toBe(true);
      expect(Number.isInteger(segment.y)).toBe(true);
    }
  });
});

describe('W2 修正前後の同縮尺比較', () => {
  const base = Array.from({ length: 30 }, (_, i) => ({
    position: i / 30, arm: 'straddle' as const, direction: 1 as const, tension: 0.5,
  }));

  it('同じ記録長・同じcontentなら、区間外のstrokeは1つも動かない', () => {
    // 第2区間(index 8〜14)だけを別の値へ置き換える。
    const edited = base.map((turn, i) => (i >= 8 && i < 15 ? { ...turn, tension: 0 } : turn));
    const before = computeWindingTraceGeometry(base, 480, 270);
    const after = computeWindingTraceGeometry(edited, 480, 270);
    expect(after.strokes).toHaveLength(before.strokes.length);
    before.strokes.forEach((stroke, i) => {
      if (i >= 8 && i < 15) return;
      expect(after.strokes[i], `index ${i}`).toEqual(stroke);
    });
  });

  it('縮尺の基準(strip・axis)は前後で同一', () => {
    const edited = base.map((turn, i) => (i === 10 ? { ...turn, direction: -1 as const } : turn));
    const before = computeWindingTraceGeometry(base, 480, 270);
    const after = computeWindingTraceGeometry(edited, 480, 270);
    expect(after.stripRect).toEqual(before.stripRect);
    expect(after.axisRect).toEqual(before.axisRect);
  });
});
