// P4-1A(2026-08-28人間承認、承認項目1・2・11): `windingTurnsRatio`の契約。
//
// **同じ0.9333という値**について、`effectiveTurnsRatio`は既存の4執行点すべてで拒否され、
// `windingTurnsRatio`は受理される——という対比で「既存のbase禁止契約を変更していない」ことを
// 機械的に固定する。ここが崩れると、走行中の破壊状態合成値が保存経路へ漏れる。
import { describe, expect, it } from 'vitest';
import { isValidWindingTurnsRatio, resolveWindingTurnsRatio, type MotorConfig } from '../motorPhysics';
import { encodeRecipe, RecipeCodeError } from '../recipeCode';
import { computeRecipeKey, validateMaterialComposedBase } from '../../materials/recipeKey';
import { captureRunSnapshot, composeEffectiveMotorConfig, restoreRunSnapshot } from '../destructionOrchestration';
import { createInitialDestructionState } from '../destructionModes';
import type { DestructionConfig, DestructionState } from '../destructionModes';
import { assembleDestructionConfig } from '../../materials/materialMapping';
import type { CarConfig } from '../vehiclePhysics';

const WOUND_RATIO = 0.9333;

function motorConfig(overrides: Partial<MotorConfig> = {}): MotorConfig {
  return {
    coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3,
    magnetStrength: 0.5, magnetDistanceMm: 10, batteryVoltage: 1.5, axisOffsetMm: 0,
    wireGaugeMm: 0.4, parallelStrands: 1, varnished: true,
    ...overrides,
  };
}

function carConfig(): CarConfig {
  return {
    massG: 150, gearRatio: 4, gearEfficiency: 0.9, wheelDiameterMm: 25, tireGrip: 1,
    axleFriction: 0.00002, wheelAlignmentMm: 0, centerOfMassHeightMm: 15, motorMountOffsetMm: 0,
    gearReflectedInertiaKgM2: 0,
  };
}

function selection() {
  return {
    wireId: 'wire-copper-standard' as const, magnetId: 'magnet-neodymium' as const,
    gearId: 'gear-pom' as const, batteryId: 'battery-alkaline' as const, brushId: 'brush-carbon' as const,
  };
}

describe('範囲述語(単一出典)', () => {
  it('(0,1]だけを受理する', () => {
    for (const value of [1, 0.9333, 1 / 256, Number.MIN_VALUE]) expect(isValidWindingTurnsRatio(value), `${value}`).toBe(true);
    for (const value of [0, -0, -0.1, 1.0001, Number.NaN, Number.POSITIVE_INFINITY, '1', null, undefined]) {
      expect(isValidWindingTurnsRatio(value), `${String(value)}`).toBe(false);
    }
  });

  it('未指定は1.0として解決される', () => {
    expect(resolveWindingTurnsRatio(motorConfig())).toBe(1);
    expect(resolveWindingTurnsRatio(motorConfig({ windingTurnsRatio: 0.5 }))).toBe(0.5);
  });
});

describe('既存4執行点は変更されていない(同じ0.9333で挙動が分かれる)', () => {
  it('執行点1: encodeRecipeはeffectiveTurnsRatioでthrowし、windingTurnsRatioではthrowしない', () => {
    // P4-1B: MC4は巻線記録を要求するため、coilTurnsと同じ長さの記録を添える。
    const record = Array.from({ length: 80 }, () => ({ position: 0.25, arm: 'left' as const, direction: 1 as const, tension: 0.5 }));
    expect(() => encodeRecipe({
      motorConfig: motorConfig({ effectiveTurnsRatio: WOUND_RATIO }), carConfig: carConfig(),
      appearance: { bodyColorId: 'b', accentColorId: 'a' }, seed: 1, windingRecord: record,
    })).toThrow(RecipeCodeError);
    expect(() => encodeRecipe({
      motorConfig: motorConfig({ windingTurnsRatio: WOUND_RATIO }), carConfig: carConfig(),
      appearance: { bodyColorId: 'b', accentColorId: 'a' }, seed: 1, windingRecord: record,
    })).not.toThrow();
  });

  it('執行点2/3: validateMaterialComposedBaseはeffectiveTurnsRatioを拒否しwindingTurnsRatioを受理する', () => {
    expect(validateMaterialComposedBase(motorConfig({ effectiveTurnsRatio: WOUND_RATIO }), carConfig()).ok).toBe(false);
    expect(validateMaterialComposedBase(motorConfig({ windingTurnsRatio: WOUND_RATIO }), carConfig()).ok).toBe(true);
  });

  it('執行点4: restoreRunSnapshotはeffectiveTurnsRatioを拒否しwindingTurnsRatioを受理する', () => {
    const destructionConfig = assembleDestructionConfig(selection(), { bodyId: 'body-none' });
    const base = {
      carConfig: null, destructionConfig,
      runContext: { context: 'motor' as const, fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null },
      initialMotorState: { theta: 0, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 },
      initialVehicleState: null, track: null, courseLengthM: null, slopeRad: null, seed: 1,
      initialDestructionState: createInitialDestructionState('nonLipo'),
      recipeKey: computeRecipeKey(selection(), motorConfig(), carConfig(), null),
    };
    const withEffective = captureRunSnapshot({ ...base, motorConfig: motorConfig({ effectiveTurnsRatio: WOUND_RATIO }) });
    const withWinding = captureRunSnapshot({ ...base, motorConfig: motorConfig({ windingTurnsRatio: WOUND_RATIO }) });
    expect(restoreRunSnapshot(JSON.parse(JSON.stringify(withEffective))).ok).toBe(false);
    const restored = restoreRunSnapshot(JSON.parse(JSON.stringify(withWinding)));
    expect(restored.ok, restored.ok ? '' : `${restored.reason}: ${String((restored as { details?: string }).details)}`).toBe(true);
  });

  it('執行点4: windingTurnsRatioが(0,1]の外ならrestoreRunSnapshotも拒否する', () => {
    const destructionConfig = assembleDestructionConfig(selection(), { bodyId: 'body-none' });
    const snapshot = captureRunSnapshot({
      motorConfig: motorConfig({ windingTurnsRatio: 0 }), carConfig: null, destructionConfig,
      runContext: { context: 'motor' as const, fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null }, initialMotorState: { theta: 0, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 },
      initialVehicleState: null, track: null, courseLengthM: null, slopeRad: null, seed: 1,
      initialDestructionState: createInitialDestructionState('nonLipo'),
      recipeKey: computeRecipeKey(selection(), motorConfig(), carConfig(), null),
    });
    expect(restoreRunSnapshot(JSON.parse(JSON.stringify(snapshot))).ok).toBe(false);
  });
});

describe('compose単一乗算点(承認項目2)', () => {
  const destructionConfig: DestructionConfig = assembleDestructionConfig(selection(), { bodyId: 'body-none' });
  const pristine: DestructionState = createInitialDestructionState('nonLipo');

  function damaged(decayExposureRad: number): DestructionState {
    return { ...pristine, modes: { ...pristine.modes, D01: { ...pristine.modes.D01, triggered: true, decayExposureRad } } };
  }

  it('巻線ratioなし・未崩壊ではeffectiveTurnsRatioを付けない(既存no-opは不変)', () => {
    const composed = composeEffectiveMotorConfig(motorConfig(), pristine, destructionConfig);
    expect(composed.effectiveTurnsRatio).toBeUndefined();
  });

  it('巻線ratioのみ(未崩壊)は巻線ratioがそのまま実効値になる', () => {
    const composed = composeEffectiveMotorConfig(motorConfig({ windingTurnsRatio: 0.8 }), pristine, destructionConfig);
    expect(composed.effectiveTurnsRatio).toBe(0.8);
  });

  it('巻線ratio × D01漸減ratio の積になる(第2経路がない)', () => {
    const exposure = destructionConfig.d01.decayExposureScaleRad * 0.25; // D01因子=0.75
    const withD01 = composeEffectiveMotorConfig(motorConfig(), damaged(exposure), destructionConfig);
    const both = composeEffectiveMotorConfig(motorConfig({ windingTurnsRatio: 0.8 }), damaged(exposure), destructionConfig);
    expect(both.effectiveTurnsRatio).toBeCloseTo(0.8 * (withD01.effectiveTurnsRatio ?? 1), 12);
  });

  it('下限clampはD01因子だけに掛かり、積へは掛からない(雑な巻きが救済されない)', () => {
    // D01を下限まで進める。巻線ratioが下限より小さい積になっても、下限で引き上げられない。
    const exposure = destructionConfig.d01.decayExposureScaleRad * 10;
    const floor = destructionConfig.d01.minEffectiveTurnsRatio;
    const composed = composeEffectiveMotorConfig(motorConfig({ windingTurnsRatio: 0.5 }), damaged(exposure), destructionConfig);
    expect(composed.effectiveTurnsRatio).toBeCloseTo(0.5 * floor, 12);
    expect(composed.effectiveTurnsRatio!).toBeLessThan(floor);
  });

  it('baseのwindingTurnsRatioは合成後も残る(消さない)', () => {
    const composed = composeEffectiveMotorConfig(motorConfig({ windingTurnsRatio: 0.8 }), pristine, destructionConfig);
    expect(composed.windingTurnsRatio).toBe(0.8);
  });
});
