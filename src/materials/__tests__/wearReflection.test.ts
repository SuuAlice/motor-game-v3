// P3-4 G6: wearReflection.ts(§14.1 Wear反映純関数 + §14.3 D06 seeding)のテスト。
import { describe, expect, it } from 'vitest';
import {
  applyWearToCarConfig,
  applyWearToMotorConfig,
  seedInitialDestructionStateFromWear,
  BEARING_SEIZURE_FRICTION_PENALTY,
  BRUSH_WEAR_RESISTANCE_PENALTY,
  GEAR_SEIZURE_EFFICIENCY_PENALTY,
  type IndividualDegradationInput,
} from '../wearReflection';
import { createInitialDestructionState } from '../../engine/destructionModes';
import { GEAR_TOTAL_TOOTH_COUNT } from '../inventoryItem';
import type { MotorConfig } from '../../engine/motorPhysics';
import type { CarConfig } from '../../engine/vehiclePhysics';

function baseMotor(overrides: Partial<MotorConfig> = {}): MotorConfig {
  return {
    coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 0.8,
    magnetDistanceMm: 5, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.4, parallelStrands: 1,
    varnished: true, brushContactResistanceRatio: 1.2, ...overrides,
  };
}
function baseCar(overrides: Partial<CarConfig> = {}): CarConfig {
  return {
    massG: 150, gearRatio: 4, gearEfficiency: 0.8, wheelDiameterMm: 30, tireGrip: 0.7,
    axleFriction: 0.1, wheelAlignmentMm: 0, centerOfMassHeightMm: 20, motorMountOffsetMm: 0, ...overrides,
  };
}
function noWear(overrides: Partial<IndividualDegradationInput> = {}): IndividualDegradationInput {
  return { magnetDemagnetizationFraction: 0, gearSeizureFraction: 0, brushWearFraction: 0, bearingSeizureFraction: 0, ...overrides };
}

describe('wearReflection.ts: applyWearToMotorConfig(§14.1)', () => {
  it('劣化0では入力と等しいconfigを返す(0恒等性)', () => {
    const base = baseMotor();
    const r = applyWearToMotorConfig(base, noWear());
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('到達しない');
    expect(r.motorConfig).toEqual(base);
  });

  it('減磁率だけmagnetStrengthが下がる(×(1-減磁率))', () => {
    const r = applyWearToMotorConfig(baseMotor({ magnetStrength: 0.8 }), noWear({ magnetDemagnetizationFraction: 0.25 }));
    if (!r.ok) throw new Error('到達しない');
    expect(r.motorConfig.magnetStrength).toBeCloseTo(0.6, 12);
  });

  it('ブラシ摩耗で接触抵抗比が上がる(×(1+摩耗率×penalty))', () => {
    const r = applyWearToMotorConfig(baseMotor({ brushContactResistanceRatio: 1.2 }), noWear({ brushWearFraction: 0.5 }));
    if (!r.ok) throw new Error('到達しない');
    expect(r.motorConfig.brushContactResistanceRatio).toBeCloseTo(1.2 * (1 + 0.5 * BRUSH_WEAR_RESISTANCE_PENALTY), 12);
  });

  it('brushContactResistanceRatio未設定のbaseは既定1.0を出発点とする(motorPhysicsの既定と一致)', () => {
    const { brushContactResistanceRatio: _omit, ...withoutRatio } = baseMotor();
    const r = applyWearToMotorConfig(withoutRatio as MotorConfig, noWear({ brushWearFraction: 1 }));
    if (!r.ok) throw new Error('到達しない');
    expect(r.motorConfig.brushContactResistanceRatio).toBeCloseTo(1 + BRUSH_WEAR_RESISTANCE_PENALTY, 12);
  });

  it('磁石が完全減磁(1.0)でもmagnetStrengthは0で、負にはならない(境界)', () => {
    const r = applyWearToMotorConfig(baseMotor(), noWear({ magnetDemagnetizationFraction: 1 }));
    if (!r.ok) throw new Error('到達しない');
    expect(r.motorConfig.magnetStrength).toBe(0);
  });

  it('値域外(NaN入力)はok:falseで拒否する(黙って丸めない)', () => {
    const r = applyWearToMotorConfig(baseMotor(), noWear({ magnetDemagnetizationFraction: Number.NaN }));
    expect(r.ok).toBe(false);
  });

  it('減磁率が1超なら負のmagnetStrengthとなるためok:falseで拒否する', () => {
    const r = applyWearToMotorConfig(baseMotor(), noWear({ magnetDemagnetizationFraction: 1.5 }));
    expect(r.ok).toBe(false);
  });

  it('純関数: 入力を破壊せず、同一入力で同値を返す', () => {
    const base = baseMotor();
    const snapshot = structuredClone(base);
    const wear = noWear({ magnetDemagnetizationFraction: 0.3, brushWearFraction: 0.2 });
    const a = applyWearToMotorConfig(base, wear);
    const b = applyWearToMotorConfig(base, wear);
    expect(base).toEqual(snapshot);
    expect(a).toEqual(b);
  });
});

describe('wearReflection.ts: applyWearToCarConfig(§14.1、M-1(ii)是正後)', () => {
  it('劣化0ではaxleFriction以外が厳密に一致し、axleFrictionは浮動小数点の丸め幅内で一致する', () => {
    // **実測の記録**: 補完合成`1-(1-a)(1-b)`はb=0でも代数的には`a`だが、浮動小数点では
    // `1-(1-0.1)*(1-0)` = 0.09999999999999998 となり厳密一致しない(計画§14.1の式どおり)。
    // 本関数は毎runのmaterialComposedBase(素材写像の出力)へ1回だけ適用され、前runの出力へ
    // 積み上げないため、この誤差がrun間で累積することはない。式は計画の確定契約であり
    // 変更しない——挙動を丸めて隠すのではなく、ここに事実として固定する。
    const base = baseCar();
    const r = applyWearToCarConfig(base, noWear());
    if (!r.ok) throw new Error('到達しない');
    expect({ ...r.carConfig, axleFriction: base.axleFriction }).toEqual(base);
    expect(r.carConfig.axleFriction).toBeCloseTo(base.axleFriction, 15);
  });

  it('base.axleFriction=0では劣化0で厳密に恒等となる(丸め幅が生じない境界)', () => {
    const base = baseCar({ axleFriction: 0 });
    const r = applyWearToCarConfig(base, noWear());
    if (!r.ok) throw new Error('到達しない');
    expect(r.carConfig).toEqual(base);
  });

  it('ギヤ焼付き率だけgearEfficiencyが下がる(×(1-焼付き率×penalty))', () => {
    const r = applyWearToCarConfig(baseCar({ gearEfficiency: 0.8 }), noWear({ gearSeizureFraction: 0.5 }));
    if (!r.ok) throw new Error('到達しない');
    expect(r.carConfig.gearEfficiency).toBeCloseTo(0.8 * (1 - 0.5 * GEAR_SEIZURE_EFFICIENCY_PENALTY), 12);
  });

  it('軸受焼付きは補完合成1-(1-a)(1-b)でaxleFrictionへ効く', () => {
    const r = applyWearToCarConfig(baseCar({ axleFriction: 0.1 }), noWear({ bearingSeizureFraction: 1 }));
    if (!r.ok) throw new Error('到達しない');
    expect(r.carConfig.axleFriction).toBeCloseTo(1 - (1 - 0.1) * (1 - BEARING_SEIZURE_FRICTION_PENALTY), 12);
    expect(r.carConfig.axleFriction).toBeLessThan(1); // 1へ張り付かない(補完合成の性質)
  });

  it('**歯欠け由来の効率因子はここでは掛からない**(M-1(ii)、二重計上の防止)', () => {
    // IndividualDegradationInputはgearToothLossCountを持たない——型として渡す口が存在しない。
    // 歯欠けは composeD06RuntimeEffect が seeded toothLossCount から一元計算する。
    const wear = noWear();
    expect('gearToothLossCount' in wear).toBe(false);
    const r = applyWearToCarConfig(baseCar({ gearEfficiency: 0.8 }), wear);
    if (!r.ok) throw new Error('到達しない');
    expect(r.carConfig.gearEfficiency).toBe(0.8); // 歯欠けを想定した低下は一切起きない
  });

  it('単調性: 焼付き率の増加でgearEfficiencyは単調減少、axleFrictionは単調増加', () => {
    const effs: number[] = []; const fricts: number[] = [];
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const r = applyWearToCarConfig(baseCar(), noWear({ gearSeizureFraction: f, bearingSeizureFraction: f }));
      if (!r.ok) throw new Error('到達しない');
      effs.push(r.carConfig.gearEfficiency); fricts.push(r.carConfig.axleFriction);
    }
    for (let i = 1; i < effs.length; i++) {
      expect(effs[i]).toBeLessThan(effs[i - 1]);
      expect(fricts[i]).toBeGreaterThan(fricts[i - 1]);
    }
  });

  it('gearEfficiencyが0以下になる入力はok:falseで拒否する', () => {
    const r = applyWearToCarConfig(baseCar({ gearEfficiency: 0.8 }), noWear({ gearSeizureFraction: 1 / GEAR_SEIZURE_EFFICIENCY_PENALTY }));
    expect(r.ok).toBe(false);
  });

  it('純関数: 入力を破壊せず、同一入力で同値を返す', () => {
    const base = baseCar();
    const snapshot = structuredClone(base);
    const wear = noWear({ gearSeizureFraction: 0.3, bearingSeizureFraction: 0.4 });
    const a = applyWearToCarConfig(base, wear);
    const b = applyWearToCarConfig(base, wear);
    expect(base).toEqual(snapshot);
    expect(a).toEqual(b);
  });
});

describe('wearReflection.ts: seedInitialDestructionStateFromWear(§14.3、M-1(i))', () => {
  it('装備個体のtoothLossCountでD06を初期化する(0からではなく損傷数から開始)', () => {
    const base = createInitialDestructionState('lipo');
    expect(base.modes.D06.toothLossCount).toBe(0);
    const seeded = seedInitialDestructionStateFromWear(base, 9);
    expect(seeded.modes.D06.toothLossCount).toBe(9);
  });

  it('D06以外のモード・batteryは一切変更しない', () => {
    const base = createInitialDestructionState('lipo');
    const seeded = seedInitialDestructionStateFromWear(base, 3);
    expect(seeded.battery).toEqual(base.battery);
    expect(seeded.modes.D01).toEqual(base.modes.D01);
    expect(seeded.modes.D09).toEqual(base.modes.D09);
    // D06もtoothLossCount以外は不変(cumulativeOverloadExposure・meshPhaseAccumulator等)
    expect({ ...seeded.modes.D06, toothLossCount: 0 }).toEqual({ ...base.modes.D06, toothLossCount: 0 });
  });

  it('引数のbaseを破壊しない(新しいstateを返す)', () => {
    const base = createInitialDestructionState('nonLipo');
    const snapshot = structuredClone(base);
    seedInitialDestructionStateFromWear(base, 5);
    expect(base).toEqual(snapshot);
  });

  it('seeding値0は恒等(健全なギヤを装備した場合、既存挙動を変えない)', () => {
    const base = createInitialDestructionState('nonLipo');
    expect(seedInitialDestructionStateFromWear(base, 0)).toEqual(base);
  });

  it('全損個体(=GEAR_TOTAL_TOOTH_COUNT)は装備拒否で到達しない前提だが、値としては素通しする', () => {
    // §15の装備拒否がこの値域を保証する。本関数側で黙って丸めると、拒否の不備が隠れてしまう。
    const seeded = seedInitialDestructionStateFromWear(createInitialDestructionState('lipo'), GEAR_TOTAL_TOOTH_COUNT);
    expect(seeded.modes.D06.toothLossCount).toBe(GEAR_TOTAL_TOOTH_COUNT);
  });
});
