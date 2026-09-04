// P4-1C C1(2026-08-31人間承認、JST): 平均張力 → 占積 → windingTurnsRatio の写像。
//
// 較正値そのもの(0.85 / 1.0)はsweep実測で確定した承認値なので、ここでは**契約**
// (単調非減少・正の下限・(0,1]・決定論・張力以外を混ぜない)を固定する。
import { describe, expect, it } from 'vitest';
import {
  computeMeanTension,
  computeTensionPackingRatio,
  deriveWindingMotorFields,
  PRODUCTION_AXIS_OFFSET_COEFFICIENT_MM,
  PRODUCTION_TENSION_PACKING,
  type TensionPackingCalibration,
} from '../windingMapping';
import { WINDING_QUANTIZATION_STEP, type WindingRecord } from '../windingRecord';

function record(turnCount: number, options: { tension?: number; leftCount?: number; reversedAt?: number } = {}): WindingRecord {
  const leftCount = options.leftCount ?? turnCount;
  return Array.from({ length: turnCount }, (_, i) => ({
    position: i < leftCount ? 0.25 : 0.75,
    arm: (i < leftCount ? 'left' : 'right') as 'left' | 'right',
    direction: (i === options.reversedAt ? -1 : 1) as 1 | -1,
    tension: options.tension ?? 0.5,
  }));
}

describe('承認済み較正値', () => {
  it('minPackingRatio=0.85 / referenceTension=1.0(2026-08-31人間承認、JST)', () => {
    expect(PRODUCTION_TENSION_PACKING).toStrictEqual({ minPackingRatio: 0.85, referenceTension: 1 });
  });

  it('minPackingRatioは0より大きい(緩い巻きは「作れない」ではなく「弱い」)', () => {
    expect(PRODUCTION_TENSION_PACKING.minPackingRatio).toBeGreaterThan(0);
  });
});

describe('computeMeanTension', () => {
  it('算術平均だけを使う', () => {
    expect(computeMeanTension(record(4, { tension: 0.25 }))).toBe(0.25);
    const mixed: WindingRecord = [
      { position: 0.5, arm: 'left', direction: 1, tension: 0 },
      { position: 0.5, arm: 'left', direction: 1, tension: 1 },
    ];
    expect(computeMeanTension(mixed)).toBe(0.5);
  });

  it('空記録は0(0除算を作らない)', () => {
    expect(computeMeanTension([])).toBe(0);
  });

  it('分散が違っても平均が同じなら同値(分散を混ぜていないことの固定)', () => {
    const flat: WindingRecord = [
      { position: 0.5, arm: 'left', direction: 1, tension: 0.5 },
      { position: 0.5, arm: 'left', direction: 1, tension: 0.5 },
    ];
    const spread: WindingRecord = [
      { position: 0.5, arm: 'left', direction: 1, tension: 0 },
      { position: 0.5, arm: 'left', direction: 1, tension: 1 },
    ];
    expect(computeMeanTension(spread)).toBe(computeMeanTension(flat));
  });
});

describe('computeTensionPackingRatio', () => {
  const cal = PRODUCTION_TENSION_PACKING;

  it('平均張力0でも下限を返す(0にならない)', () => {
    expect(computeTensionPackingRatio(0, cal)).toBe(cal.minPackingRatio);
    expect(computeTensionPackingRatio(0, cal)).toBeGreaterThan(0);
  });

  it('referenceTensionで1.0に達し、それ以上は飽和する(上限を超えない)', () => {
    expect(computeTensionPackingRatio(cal.referenceTension, cal)).toBe(1);
    // production較正はreferenceTension=1なので、飽和はrefを1未満にした較正で確かめる
    // (meanTensionは0〜1が事前条件のため、ref=1では飽和域を作れない)。
    const early: TensionPackingCalibration = { minPackingRatio: 0.85, referenceTension: 0.5 };
    expect(computeTensionPackingRatio(0.5, early)).toBe(1);
    expect(computeTensionPackingRatio(1, early)).toBe(1);
  });

  it('1/256格子の257点すべてで単調非減少かつ(0,1]', () => {
    let prev = -Infinity;
    for (let k = 0; k <= 256; k += 1) {
      const value = computeTensionPackingRatio(k * WINDING_QUANTIZATION_STEP, cal);
      expect(value, `k=${k}`).toBeGreaterThan(0);
      expect(value, `k=${k}`).toBeLessThanOrEqual(1);
      expect(value, `k=${k}`).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });

  it('高張力側に罰を置かない(最大値は上限で、山型にならない)', () => {
    const values = Array.from({ length: 257 }, (_, k) => computeTensionPackingRatio(k / 256, cal));
    expect(Math.max(...values)).toBe(values[values.length - 1]);
  });

  it('決定論: 同じ入力は常に同じ値', () => {
    expect(computeTensionPackingRatio(0.3, cal)).toBe(computeTensionPackingRatio(0.3, cal));
  });

  it('別の較正値でも契約は保たれる(下限・上限・単調)', () => {
    const other: TensionPackingCalibration = { minPackingRatio: 0.5, referenceTension: 0.25 };
    expect(computeTensionPackingRatio(0, other)).toBe(0.5);
    expect(computeTensionPackingRatio(0.25, other)).toBe(1);
    expect(computeTensionPackingRatio(1, other)).toBe(1);
  });
});

describe('deriveWindingMotorFields(方向一貫性 × 張力占積)', () => {
  it('積になっている(30ターン中1逆巻き・tension=0.5)', () => {
    const fields = deriveWindingMotorFields(record(30, { leftCount: 21, reversedAt: 10 }));
    expect(fields.windingTurnsRatio).toBeCloseTo((28 / 30) * 0.925, 12);
  });

  it('張力だけを変えると実効値が変わる(張力が物理へ接続されたことの実測)', () => {
    const slack = deriveWindingMotorFields(record(30, { tension: 0 }));
    const tight = deriveWindingMotorFields(record(30, { tension: 1 }));
    expect(slack.windingTurnsRatio).toBeCloseTo(0.85, 12);
    expect(tight.windingTurnsRatio).toBeCloseTo(1, 12);
    expect(tight.windingTurnsRatio).toBeGreaterThan(slack.windingTurnsRatio);
  });

  it('張力を変えてもcoilTurnsとaxisOffsetMmは動かない(張力は磁気側だけに効く)', () => {
    const slack = deriveWindingMotorFields(record(30, { tension: 0, leftCount: 21 }));
    const tight = deriveWindingMotorFields(record(30, { tension: 1, leftCount: 21 }));
    expect(tight.coilTurns).toBe(slack.coilTurns);
    expect(tight.axisOffsetMm).toBe(slack.axisOffsetMm);
    expect(slack.axisOffsetMm).toBeCloseTo((12 / 30) * PRODUCTION_AXIS_OFFSET_COEFFICIENT_MM, 12);
  });

  it('順逆同数は張力によらず0(生成境界の拒否条件は方向由来のまま)', () => {
    for (const tension of [0, 0.5, 1]) {
      const balanced: WindingRecord = Array.from({ length: 10 }, (_, i) => ({
        position: 0.5, arm: 'straddle' as const, direction: (i < 5 ? 1 : -1) as 1 | -1, tension,
      }));
      expect(deriveWindingMotorFields(balanced).windingTurnsRatio, `tension=${tension}`).toBe(0);
    }
  });

  it('257点すべてでbase契約(0,1]を満たす', () => {
    for (let k = 0; k <= 256; k += 1) {
      const fields = deriveWindingMotorFields(record(30, { tension: k * WINDING_QUANTIZATION_STEP }));
      expect(fields.windingTurnsRatio, `k=${k}`).toBeGreaterThan(0);
      expect(fields.windingTurnsRatio, `k=${k}`).toBeLessThanOrEqual(1);
    }
  });

  it('決定論: 同じ記録は常に同じ導出値', () => {
    const rec = record(30, { leftCount: 21, reversedAt: 10 });
    expect(deriveWindingMotorFields(rec)).toStrictEqual(deriveWindingMotorFields(rec));
  });
});

describe('事前条件のfail-closed(clampせずthrowする)', () => {
  const cal = PRODUCTION_TENSION_PACKING;

  it('computeMeanTensionは非有限tensionを伝播させずthrowする', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const broken = [{ position: 0.5, arm: 'left' as const, direction: 1 as const, tension: bad }] as unknown as WindingRecord;
      expect(() => computeMeanTension(broken), `tension=${String(bad)}`).toThrow(/非有限値/);
    }
  });

  it('computeMeanTensionは0〜1の範囲外のtensionをthrowする', () => {
    for (const bad of [-0.1, 1.1]) {
      const broken = [{ position: 0.5, arm: 'left' as const, direction: 1 as const, tension: bad }] as unknown as WindingRecord;
      expect(() => computeMeanTension(broken), `tension=${bad}`).toThrow(/範囲外/);
    }
  });

  it('meanTensionが非有限・負・1超ならthrowする', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1]) {
      expect(() => computeTensionPackingRatio(bad, cal), `mean=${String(bad)}`).toThrow(/meanTension/);
    }
  });

  it('minPackingRatioが0以下・1超・非有限ならthrowする', () => {
    for (const bad of [0, -0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => computeTensionPackingRatio(0.5, { minPackingRatio: bad, referenceTension: 1 }), `minP=${String(bad)}`)
        .toThrow(/minPackingRatio/);
    }
  });

  it('referenceTensionが0以下・非有限ならthrowする', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => computeTensionPackingRatio(0.5, { minPackingRatio: 0.85, referenceTension: bad }), `ref=${String(bad)}`)
        .toThrow(/referenceTension/);
    }
  });

  it('壊れた入力でもNaN・負・1超を返さない(throwするので値が出ない)', () => {
    // 「返り値がNaNでないこと」ではなく「そもそも値を返さないこと」を固定する。
    expect(() => computeTensionPackingRatio(Number.NaN, cal)).toThrow();
    expect(() => computeTensionPackingRatio(0.5, { minPackingRatio: 1.5, referenceTension: 1 })).toThrow();
    expect(() => computeTensionPackingRatio(0.5, { minPackingRatio: 0.85, referenceTension: -1 })).toThrow();
  });

  it('正規経路の値は検証追加後も不変', () => {
    expect(computeTensionPackingRatio(0, cal)).toBe(0.85);
    expect(computeTensionPackingRatio(0.5, cal)).toBe(0.925);
    expect(computeTensionPackingRatio(1, cal)).toBe(1);
    expect(deriveWindingMotorFields(record(30, { leftCount: 21, reversedAt: 10 })).windingTurnsRatio)
      .toBeCloseTo((28 / 30) * 0.925, 12);
  });
});
