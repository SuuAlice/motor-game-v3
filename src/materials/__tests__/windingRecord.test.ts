// Phase 4 P4-0 G1a: 巻線記録契約(src/materials/windingRecord.ts)のテスト。
// 計画v3 §5・§6・§9+arbiter条件P4-C1(0/1/2〜9ターン境界の有限集計と走行拒否)。
import { describe, expect, it } from 'vitest';
import {
  aggregateWindingRecord,
  copyWindingRecord,
  isQuantizedWindingValue,
  quantizeWindingValue,
  replaceWindingRange,
  resolveWindingRunnability,
  validateWindingRecord,
  validateWindingTurn,
  MAX_WINDING_TURNS,
  MIN_RUNNABLE_WINDING_TURNS,
  WINDING_QUANTIZATION_STEP,
  type WindingArm,
  type WindingDirection,
  type WindingRecord,
  type WindingTurn,
} from '../windingRecord';

function turn(overrides: Partial<WindingTurn> = {}): WindingTurn {
  return { position: 0.5, arm: 'left', direction: 1, tension: 0.25, ...overrides };
}
function record(count: number, make: (index: number) => Partial<WindingTurn> = () => ({})): WindingRecord {
  return Array.from({ length: count }, (_, i) => turn(make(i)));
}

describe('windingRecord.ts: 量子化(決定論の土台、§5.1)', () => {
  it('1/256刻みは2の冪であり、量子化値は誤差なく判定できる', () => {
    expect(WINDING_QUANTIZATION_STEP).toBe(1 / 256);
    expect(WINDING_QUANTIZATION_STEP * 256).toBe(1); // 厳密
  });

  it.each([[0, 0], [1, 1], [0.5, 0.5], [0.5001, 0.5], [1 / 3, 85 / 256], [0.00390625, 0.00390625]])(
    'quantizeWindingValue(%s) は格子上の値 %s を返す',
    (input, expected) => {
      expect(quantizeWindingValue(input)).toBe(expected);
    },
  );

  it('量子化結果は必ず格子上にある(往復で不動点になる)', () => {
    for (const v of [0, 0.1, 0.333, 0.777, 0.999, 1]) {
      const q = quantizeWindingValue(v);
      expect(q).not.toBeNull();
      expect(isQuantizedWindingValue(q)).toBe(true);
      expect(quantizeWindingValue(q as number)).toBe(q); // 冪等
    }
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [-0.1], [1.1]])('非有限・範囲外はnullを返す(0へ丸めない): %s', (bad) => {
    expect(quantizeWindingValue(bad)).toBeNull();
  });

  it.each([[0.001], [1 / 3], [Number.NaN], [Number.POSITIVE_INFINITY], [1.5], ['0.5'], [null], [undefined]])(
    'isQuantizedWindingValueは非量子化・非数値を拒否する: %s',
    (bad) => {
      expect(isQuantizedWindingValue(bad)).toBe(false);
    },
  );

  it('-0は0と同値の格子点として受理する(JSON往復で0になり記録差を生まない)', () => {
    expect(isQuantizedWindingValue(-0)).toBe(true);
    expect(JSON.parse(JSON.stringify({ v: -0 })).v).toBe(0);
  });
});

describe('windingRecord.ts: validator(§5.1)', () => {
  it('正当なターンを受理し、値をそのまま返す', () => {
    const result = validateWindingTurn(turn({ position: 0.25, arm: 'straddle', direction: -1, tension: 0 }));
    expect(result).toEqual({ ok: true, value: { position: 0.25, arm: 'straddle', direction: -1, tension: 0 } });
  });

  it.each([
    ['position非量子化', { position: 0.001 }],
    ['positionがNaN', { position: Number.NaN }],
    ['position範囲外', { position: 1.5 }],
    ['tension非量子化', { tension: 1 / 3 }],
    ['tensionがInfinity', { tension: Number.POSITIVE_INFINITY }],
    ['arm未知', { arm: 'center' as unknown as WindingArm }],
    ['direction 0', { direction: 0 as unknown as WindingDirection }],
    ['direction 2', { direction: 2 as unknown as WindingDirection }],
  ])('%s を拒否する', (_label, bad) => {
    expect(validateWindingTurn({ ...turn(), ...bad }).ok).toBe(false);
  });

  it('オブジェクトでない入力を拒否する', () => {
    for (const bad of [null, undefined, 42, 'turn', []]) {
      expect(validateWindingTurn(bad).ok).toBe(false);
    }
  });

  it('記録の失敗理由はどのindexが不正かを含む', () => {
    const result = validateWindingRecord([turn(), turn({ position: 0.001 })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('turns[1]');
  });

  it('空記録を受理する(入力途中として正当、P4-C1)', () => {
    expect(validateWindingRecord([])).toEqual({ ok: true, value: [] });
  });

  it(`上限${MAX_WINDING_TURNS}ターンを受理し、超過を拒否する`, () => {
    expect(validateWindingRecord(record(MAX_WINDING_TURNS)).ok).toBe(true);
    const over = validateWindingRecord(record(MAX_WINDING_TURNS + 1));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toContain('151');
  });

  it('配列でない入力を拒否する', () => {
    expect(validateWindingRecord({ 0: turn() }).ok).toBe(false);
  });
});

describe('windingRecord.ts: 走行可否(§6.2、P4-C1、既存coilTurns範囲10〜150に由来)', () => {
  it.each([[0], [1], [2], [9]])('%iターンは記録できるが走行不可(黙ってclampしない)', (n) => {
    const result = resolveWindingRunnability(record(n));
    expect(result.runnable).toBe(false);
    if (!result.runnable) expect(result.reason).toContain(`${MIN_RUNNABLE_WINDING_TURNS}ターン以上`);
  });

  it.each([[10], [11], [150]])('%iターンは走行可', (n) => {
    expect(resolveWindingRunnability(record(n))).toEqual({ runnable: true });
  });

  it('151ターン(上限超過)は走行不可', () => {
    expect(resolveWindingRunnability(record(MAX_WINDING_TURNS + 1)).runnable).toBe(false);
  });
});

/** K_axisは未確定のため、テストでは計算の検証用に明示値を与える(production較正値ではない)。 */
const K_AXIS_FOR_TEST = 2;
const OPTIONS = { axisOffsetCoefficientMm: K_AXIS_FOR_TEST };

describe('windingRecord.ts: 集計(§6.2・§6.3、P4-C1の全域有限性)', () => {
  it('空記録は coilTurns=0・effectiveTurnsRatio=1・balanceErrorRatio=0(0除算でNaNを作らない)', () => {
    const a = aggregateWindingRecord([], OPTIONS);
    expect(a.coilTurns).toBe(0);
    expect(a.effectiveTurnsRatio).toBe(1);
    expect(a.balanceErrorRatio).toBe(0);
    expect(a.axisOffsetMm).toBe(0);
  });

  it.each([[1], [2], [5], [9], [10], [150]])('%iターンの集計は全フィールドが有限(NaN/Infinityを漏らさない)', (n) => {
    const a = aggregateWindingRecord(record(n, (i) => ({ arm: i % 3 === 0 ? 'straddle' : i % 2 === 0 ? 'left' : 'right', direction: i % 4 === 0 ? -1 : 1 })), OPTIONS);
    for (const [key, value] of Object.entries(a)) {
      expect(Number.isFinite(value), `${key}=${value}`).toBe(true);
    }
    expect(a.effectiveTurnsRatio).toBeGreaterThanOrEqual(0);
    expect(a.effectiveTurnsRatio).toBeLessThanOrEqual(1);
    expect(a.balanceErrorRatio).toBeGreaterThanOrEqual(0);
    expect(a.balanceErrorRatio).toBeLessThanOrEqual(1);
    expect(a.axisOffsetMm).toBeGreaterThanOrEqual(0);
    expect(a.axisOffsetMm).toBeLessThanOrEqual(K_AXIS_FOR_TEST);
  });

  it('1ターンは方向にかかわらずratio=1(P4-C1)', () => {
    expect(aggregateWindingRecord([turn({ direction: 1 })], OPTIONS).effectiveTurnsRatio).toBe(1);
    expect(aggregateWindingRecord([turn({ direction: -1 })], OPTIONS).effectiveTurnsRatio).toBe(1);
  });

  it('**実在coilTurnsは記録長のまま**(逆巻きでも減らない=抵抗・慣性を減らさない)', () => {
    const mixed = record(10, (i) => ({ direction: i < 5 ? 1 : -1 }));
    const a = aggregateWindingRecord(mixed, OPTIONS);
    expect(a.coilTurns).toBe(10); // 逆巻き5本を含んでも実在量は10
    expect(a.woundTurnCount).toBe(10);
    expect(a.effectiveTurnsRatio).toBe(0); // 磁気だけ完全に打ち消される
  });

  it.each([[0], [1], [3], [5]])('逆巻き%i本のとき ratio = abs(sum)/length になる', (reversed) => {
    const a = aggregateWindingRecord(record(10, (i) => ({ direction: i < reversed ? -1 : 1 })), OPTIONS);
    expect(a.effectiveTurnsRatio).toBeCloseTo(Math.abs(10 - 2 * reversed) / 10, 12);
    expect(a.coilTurns).toBe(10); // どの本数でも実在量は不変
  });

  it('全ターン同一方向なら向きが+1でも-1でもratio=1(回転極性を新設しない)', () => {
    expect(aggregateWindingRecord(record(20, () => ({ direction: 1 })), OPTIONS).effectiveTurnsRatio).toBe(1);
    expect(aggregateWindingRecord(record(20, () => ({ direction: -1 })), OPTIONS).effectiveTurnsRatio).toBe(1);
  });

  it('左右対称な記録はbalanceErrorRatio=0、片寄り切りは1', () => {
    const symmetric = aggregateWindingRecord(record(10, (i) => ({ arm: i % 2 === 0 ? 'left' : 'right' })), OPTIONS);
    expect(symmetric.balanceErrorRatio).toBe(0);
    expect(symmetric.axisOffsetMm).toBe(0);
    const skewed = aggregateWindingRecord(record(10, () => ({ arm: 'left' })), OPTIONS);
    expect(skewed.balanceErrorRatio).toBe(1);
    expect(skewed.axisOffsetMm).toBe(K_AXIS_FOR_TEST);
  });

  it('左右反転で同じbalanceErrorRatioになる(左偏りと右偏りを区別しない)', () => {
    const leftHeavy = record(10, (i) => ({ arm: i < 7 ? 'left' : 'right' }));
    const rightHeavy = record(10, (i) => ({ arm: i < 7 ? 'right' : 'left' }));
    expect(aggregateWindingRecord(leftHeavy, OPTIONS).balanceErrorRatio)
      .toBe(aggregateWindingRecord(rightHeavy, OPTIONS).balanceErrorRatio);
  });

  it('straddleは左右へ0.5ずつ配分される(分子に現れず分母には効く)', () => {
    const a = aggregateWindingRecord(record(10, (i) => ({ arm: i < 6 ? 'left' : i < 8 ? 'right' : 'straddle' })), OPTIONS);
    expect(a.leftTurnCount).toBe(6);
    expect(a.rightTurnCount).toBe(2);
    expect(a.straddleTurnCount).toBe(2);
    expect(a.balanceErrorRatio).toBeCloseTo(0.4, 12);
    expect(aggregateWindingRecord(record(10, () => ({ arm: 'straddle' })), OPTIONS).balanceErrorRatio).toBe(0);
  });

  it('K_axis=0では常にaxisOffsetMm=0(0恒等性、係数を切っても集計は壊れない)', () => {
    const skewed = record(10, () => ({ arm: 'left' }));
    const a = aggregateWindingRecord(skewed, { axisOffsetCoefficientMm: 0 });
    expect(a.balanceErrorRatio).toBe(1); // 生集計は偏りを示したまま
    expect(a.axisOffsetMm).toBe(0);      // 物理入力だけが0
  });

  it('axisOffsetMmは balanceErrorRatio × 係数 であり、係数は呼出し側が与える(既定値を持たない)', () => {
    const rec = record(10, (i) => ({ arm: i < 8 ? 'left' : 'right' })); // ratio = 0.6
    expect(aggregateWindingRecord(rec, { axisOffsetCoefficientMm: 1 }).axisOffsetMm).toBeCloseTo(0.6, 12);
    expect(aggregateWindingRecord(rec, { axisOffsetCoefficientMm: 3 }).axisOffsetMm).toBeCloseTo(1.8, 12);
  });

  it('position・tensionは集計結果に影響しない(P4-0では物理へ接続しない、§6.4)', () => {
    const base = record(12, (i) => ({ arm: i % 2 === 0 ? 'left' : 'right', direction: i < 3 ? -1 : 1 }));
    const varied = base.map((t, i) => ({ ...t, position: (i * 7 % 256) / 256, tension: (i * 13 % 256) / 256 }));
    expect(aggregateWindingRecord(varied, OPTIONS)).toEqual(aggregateWindingRecord(base, OPTIONS));
  });

  it('純関数: 引数を破壊せず、同一入力で同値を返す', () => {
    const rec = record(20, (i) => ({ arm: i % 3 === 0 ? 'straddle' : 'left', direction: i % 5 === 0 ? -1 : 1 }));
    const snapshot = JSON.parse(JSON.stringify(rec));
    const a = aggregateWindingRecord(rec, OPTIONS);
    const b = aggregateWindingRecord(rec, OPTIONS);
    expect(rec).toEqual(snapshot);
    expect(a).toEqual(b);
  });
});

describe('windingRecord.ts: 型紙複製(spec §9.6)', () => {
  it('値コピーであり、内容が完全に一致する(補間・平滑化・自動改善をしない)', () => {
    const rec = record(30, (i) => ({ position: (i * 3 % 256) / 256, tension: (i * 5 % 256) / 256, direction: i % 7 === 0 ? -1 : 1 }));
    const copy = copyWindingRecord(rec);
    expect(copy).toEqual(rec);
    expect(JSON.stringify(copy)).toBe(JSON.stringify(rec));
  });

  it('複製は元と別実体であり、各ターンも別実体である(複製後の編集が元へ波及しない)', () => {
    const rec = record(15, (i) => ({ arm: i < 9 ? 'left' : 'right', direction: i % 4 === 0 ? -1 : 1 }));
    const copy = copyWindingRecord(rec);
    expect(copy).not.toBe(rec);
    expect(copy[0]).not.toBe(rec[0]);
    // 値としては完全に同一——「複製元より良い巻きが自動で得られることはない」(spec §9.6)。
    expect(copy).toEqual(rec);
  });
});

describe('windingRecord.ts: 部分修正(spec §9.6、半開区間)', () => {
  const base = record(20, (i) => ({ position: (i % 256) / 256, arm: i % 2 === 0 ? 'left' : 'right' }));

  it('[start, start+deleteCount) だけを置換する', () => {
    const result = replaceWindingRange(base, 5, 3, record(2, () => ({ arm: 'straddle' })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(19); // 20 - 3 + 2
    expect(result.value.slice(5, 7).every((t) => t.arm === 'straddle')).toBe(true);
  });

  it('置換区間外はJSON上まったく同一である(一箇所だけ直すの保証)', () => {
    const result = replaceWindingRange(base, 8, 4, record(4, () => ({ arm: 'straddle' })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.value.slice(0, 8))).toBe(JSON.stringify(base.slice(0, 8)));
    expect(JSON.stringify(result.value.slice(12))).toBe(JSON.stringify(base.slice(12)));
  });

  it('deleteCount=0は挿入、置換turns=[]は削除として働く(半開区間の自然な帰結)', () => {
    const inserted = replaceWindingRange(base, 4, 0, record(2));
    expect(inserted.ok && inserted.value).toHaveLength(22);
    const deleted = replaceWindingRange(base, 4, 2, []);
    expect(deleted.ok && deleted.value).toHaveLength(18);
  });

  it('末尾への追記(start=length, deleteCount=0)を受理する', () => {
    const result = replaceWindingRange(base, base.length, 0, record(1));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(21);
  });

  it.each([
    ['startが負', -1, 1],
    ['startが記録長超過', 21, 0],
    ['startが非整数', 1.5, 1],
    ['deleteCountが負', 0, -1],
    ['deleteCountが範囲外', 18, 5],
    ['deleteCountが非整数', 0, 2.5],
  ])('%s は拒否する', (_label, start, deleteCount) => {
    expect(replaceWindingRange(base, start, deleteCount, record(1)).ok).toBe(false);
  });

  it('不正なturnを含む置換を拒否する', () => {
    const result = replaceWindingRange(base, 0, 1, [{ ...turn(), position: 0.001 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('置換区間');
  });

  it(`置換後に上限${MAX_WINDING_TURNS}ターンを超える場合は拒否する`, () => {
    const full = record(MAX_WINDING_TURNS);
    expect(replaceWindingRange(full, 0, 0, record(1)).ok).toBe(false);
    expect(replaceWindingRange(full, 0, 1, record(1)).ok).toBe(true); // 同数置換は通る
  });

  it('拒否時も成功時も元の記録を破壊しない(引数非破壊)', () => {
    const snapshot = JSON.parse(JSON.stringify(base));
    replaceWindingRange(base, 3, 2, record(2, () => ({ arm: 'straddle' })));
    replaceWindingRange(base, -1, 1, record(1));
    expect(base).toEqual(snapshot);
  });

  it('置換結果は入力turnsと別実体である(後からの書換えが記録へ波及しない)', () => {
    const turns = record(2, () => ({ arm: 'straddle' }));
    const result = replaceWindingRange(base, 0, 2, turns);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).not.toBe(turns[0]);
  });
});
