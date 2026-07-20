import { describe, expect, it } from 'vitest';
import { evaluateChallenge, evaluateObjectives, validateBuildRestrictions, type HistorySample, type Objective } from '../scoring';
import { step, type MotorConfig, type SimState } from '../motorPhysics';
import { createInitialVehicleState, type CarConfig, type VehicleSimState } from '../vehiclePhysics';
import type { BuildRestrictions } from '../trackPhysics';

function sample(t: number, rpm: number, current: number, backEmf = 0): HistorySample {
  return { t, rpm, current, backEmf };
}

function constantHistory(rpm: number, current: number, durationSec: number, intervalSec = 0.1): HistorySample[] {
  const samples: HistorySample[] = [];
  for (let t = 0; t <= durationSec + 1e-9; t += intervalSec) {
    samples.push(sample(t, rpm, current));
  }
  return samples;
}

describe('evaluateChallenge', () => {
  it('目標RPMに一度も届かない場合は☆0', () => {
    const history = constantHistory(500, 0.5, 12);
    const result = evaluateChallenge(history, 1000, 1.0);
    expect(result).toEqual({ star1: false, star2: false, star3: false, stars: 0 });
  });

  it('目標RPMには届くが安定した10秒間がない場合は☆1', () => {
    const history: HistorySample[] = [];
    for (let t = 0; t <= 12; t += 0.1) {
      // 目標(1000)を跨いで激しく上下動する(振れ幅が±10%を超える)
      const rpm = 1000 + (Math.floor(t * 10) % 2 === 0 ? 300 : -300);
      history.push(sample(t, rpm, 0.5));
    }
    const result = evaluateChallenge(history, 1000, 1.0);
    expect(result.star1).toBe(true);
    expect(result.star2).toBe(false);
    expect(result.stars).toBe(1);
  });

  it('平均RPMが目標未満で安定していても☆1にも☆2にもならない(安定判定はtargetRpm以上でのみ成立)', () => {
    const history = constantHistory(400, 0.2, 12); // 目標1000を大きく下回る
    const result = evaluateChallenge(history, 1000, 1.0);
    expect(result).toEqual({ star1: false, star2: false, star3: false, stars: 0 });
  });

  it('目標RPMで10秒以上安定し、平均電流が閾値以下なら☆3', () => {
    const history = constantHistory(1000, 0.3, 12);
    const result = evaluateChallenge(history, 1000, 0.5);
    expect(result).toEqual({ star1: true, star2: true, star3: true, stars: 3 });
  });

  it('目標RPMで10秒以上安定するが平均電流が閾値超なら☆2止まり', () => {
    const history = constantHistory(1000, 0.8, 12);
    const result = evaluateChallenge(history, 1000, 0.5);
    expect(result).toEqual({ star1: true, star2: true, star3: false, stars: 2 });
  });

  it('安定した窓が10秒未満だと☆2にならない', () => {
    const history = constantHistory(1000, 0.3, 8); // 8秒分しかない
    const result = evaluateChallenge(history, 1000, 0.5);
    expect(result.star1).toBe(true);
    expect(result.star2).toBe(false);
  });
});

describe('evaluateChallenge(実際のstep()出力を使った統合テスト)', () => {
  const DT = 1 / 120;
  const NO_NOISE_RNG = () => 0.5;

  // spec docs/spec.md §3.7の設計目標で使う「適正パラメータ」(motorPhysics.test.tsと同じ)
  function goodConfig(overrides: Partial<MotorConfig> = {}): MotorConfig {
    return {
      coilTurns: 80,
      slitWidthMm: 1.5,
      sandingQuality: 0.9,
      brushPressure: 0.3,
      magnetStrength: 1.0,
      magnetDistanceMm: 10,
      batteryVoltage: 3.0,
      axisOffsetMm: 0,
      ...overrides,
    };
  }

  it('適正パラメータで十分低い目標RPMなら☆3まで到達する(0.1秒間隔でサンプリング)', () => {
    const config = goodConfig();
    let s: SimState = { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 };
    const history: HistorySample[] = [];
    const sampleEverySteps = Math.round(0.1 / DT);
    const totalSteps = 120 * 20; // 20秒分シミュレート
    for (let i = 0; i < totalSteps; i++) {
      s = step(config, s, DT, NO_NOISE_RNG);
      if (i % sampleEverySteps === 0) {
        history.push({ t: i * DT, rpm: s.rpm, current: s.current, backEmf: s.backEmf });
      }
    }
    // 適正パラメータの定常RPMは約1000(spec §3.7の設計目標)。十分低い目標(500)・
    // 十分緩い電流閾値(10A)なら余裕で☆3まで到達するはず
    const result = evaluateChallenge(history, 500, 10);
    expect(result.star1).toBe(true);
    expect(result.star2).toBe(true);
    expect(result.star3).toBe(true);
  });
});

// Phase3: 条件セット(Objective)。既存の☆評価(v1.5由来)とは別のexport。
function goodMotorConfig(overrides: Partial<MotorConfig> = {}): MotorConfig {
  return {
    coilTurns: 80,
    slitWidthMm: 1.5,
    sandingQuality: 0.9,
    brushPressure: 0.3,
    magnetStrength: 1.0,
    magnetDistanceMm: 10,
    batteryVoltage: 3.0,
    axisOffsetMm: 0,
    ...overrides,
  };
}

function standardCarConfig(overrides: Partial<CarConfig> = {}): CarConfig {
  return {
    massG: 150,
    gearRatio: 4,
    gearEfficiency: 0.8,
    wheelDiameterMm: 30,
    tireGrip: 0.7,
    axleFriction: 0,
    wheelAlignmentMm: 0,
    centerOfMassHeightMm: 20,
    motorMountOffsetMm: 0,
    ...overrides,
  };
}

function finishedState(overrides: Partial<VehicleSimState> = {}): VehicleSimState {
  const base = createInitialVehicleState(goodMotorConfig(), standardCarConfig());
  return { ...base, status: 'finished', ...overrides };
}

describe('Phase3受け入れ基準: evaluateObjectives(条件セットの境界値)', () => {
  it('未完走(status!==finished)はkindによらずachieved=falseになる', () => {
    const state: VehicleSimState = { ...finishedState(), status: 'running' };
    const objectives: Objective[] = [
      { id: 'a', kind: 'finish' },
      { id: 'b', kind: 'targetTimeS', value: 100 },
      { id: 'c', kind: 'maxEnergyJ', value: 100 },
    ];
    const result = evaluateObjectives(objectives, { finalState: state });
    expect(result.allAchieved).toBe(false);
    expect(result.results.every((r) => r.achieved === false)).toBe(true);
  });

  it('finish: 完走していれば無条件で達成', () => {
    const result = evaluateObjectives([{ id: 'a', kind: 'finish' }], { finalState: finishedState() });
    expect(result.results[0]).toEqual({ id: 'a', achieved: true });
  });

  it('targetTimeS: ちょうど境界(elapsedTimeS===value)は達成、僅かに超えると未達成', () => {
    const atBoundary = finishedState({ elapsedTimeS: 10 });
    const overBoundary = finishedState({ elapsedTimeS: 10.001 });
    const objective: Objective = { id: 'a', kind: 'targetTimeS', value: 10 };
    expect(evaluateObjectives([objective], { finalState: atBoundary }).results[0].achieved).toBe(true);
    expect(evaluateObjectives([objective], { finalState: overBoundary }).results[0].achieved).toBe(false);
  });

  it('maxEnergyJ: ちょうど境界(energyUsedJ===value)は達成、僅かに超えると未達成', () => {
    const atBoundary = finishedState({ energyUsedJ: 40 });
    const overBoundary = finishedState({ energyUsedJ: 40.001 });
    const objective: Objective = { id: 'a', kind: 'maxEnergyJ', value: 40 };
    expect(evaluateObjectives([objective], { finalState: atBoundary }).results[0].achieved).toBe(true);
    expect(evaluateObjectives([objective], { finalState: overBoundary }).results[0].achieved).toBe(false);
  });

  it('compliance: motorConfig/carConfig/restrictionsが未指定なら判定不能としてachieved=false', () => {
    const objective: Objective = { id: 'a', kind: 'compliance' };
    const result = evaluateObjectives([objective], { finalState: finishedState() });
    expect(result.results[0].achieved).toBe(false);
  });

  it('compliance: 制約を満たす構成ではachieved=true、破る構成ではachieved=false', () => {
    const motorConfig = goodMotorConfig();
    const carConfig = standardCarConfig();
    const restrictions: Partial<BuildRestrictions> = { maxBatteryVoltage: 3.0 };
    const objective: Objective = { id: 'a', kind: 'compliance' };
    const ok = evaluateObjectives([objective], { finalState: finishedState(), motorConfig, carConfig, restrictions });
    expect(ok.results[0].achieved).toBe(true);

    const violating: Partial<BuildRestrictions> = { maxBatteryVoltage: 1.5 }; // motorConfig.batteryVoltage=3.0が超過
    const bad = evaluateObjectives([objective], { finalState: finishedState(), motorConfig, carConfig, restrictions: violating });
    expect(bad.results[0].achieved).toBe(false);
  });

  it('allAchieved: 全目標が達成された場合のみtrue', () => {
    const state = finishedState({ elapsedTimeS: 5, energyUsedJ: 10 });
    const objectives: Objective[] = [
      { id: 'a', kind: 'finish' },
      { id: 'b', kind: 'targetTimeS', value: 10 },
      { id: 'c', kind: 'maxEnergyJ', value: 5 }, // energyUsedJ=10 > 5、未達成
    ];
    const result = evaluateObjectives(objectives, { finalState: state });
    expect(result.allAchieved).toBe(false);
    expect(result.results.map((r) => r.achieved)).toEqual([true, true, false]);
  });
});

describe('Phase3受け入れ基準: validateBuildRestrictions', () => {
  const motorConfig = goodMotorConfig();
  const carConfig = standardCarConfig();

  it('制約が空なら常にvalid', () => {
    const result = validateBuildRestrictions(motorConfig, carConfig, {});
    expect(result).toEqual({ valid: true, evaluable: true, violations: [] });
  });

  it('lockedMotorParams: 一致しない値はlocked違反', () => {
    const result = validateBuildRestrictions(motorConfig, carConfig, { lockedMotorParams: { coilTurns: 999 } });
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([{ path: 'motor', key: 'coilTurns', reason: 'locked' }]);
  });

  it('motorParamRanges: 範囲外はoutOfRange違反、範囲内はvalid', () => {
    const outOfRange = validateBuildRestrictions(motorConfig, carConfig, {
      motorParamRanges: { coilTurns: { min: 100, max: 150 } },
    });
    expect(outOfRange.valid).toBe(false);
    expect(outOfRange.violations).toEqual([{ path: 'motor', key: 'coilTurns', reason: 'outOfRange' }]);

    const inRange = validateBuildRestrictions(motorConfig, carConfig, {
      motorParamRanges: { coilTurns: { min: 10, max: 150 } },
    });
    expect(inRange.valid).toBe(true);
  });

  it('lockedCarParams・carParamRanges: 車体側も同様に判定する', () => {
    const result = validateBuildRestrictions(motorConfig, carConfig, {
      lockedCarParams: { gearRatio: 8 },
      carParamRanges: { massG: { min: 200, max: 250 } },
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        { path: 'car', key: 'gearRatio', reason: 'locked' },
        { path: 'car', key: 'massG', reason: 'outOfRange' },
      ]),
    );
  });

  it('maxBatteryVoltage: 超過するとbatteryVoltageExceeded違反', () => {
    const result = validateBuildRestrictions(motorConfig, carConfig, { maxBatteryVoltage: 1.5 });
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([{ path: 'batteryVoltage', reason: 'batteryVoltageExceeded' }]);
  });

  it('allowedPartPresetIds: usedPartPresetIds未指定は判定不能(evaluable=false)であり、valid=falseに帰着する', () => {
    const result = validateBuildRestrictions(motorConfig, carConfig, { allowedPartPresetIds: ['preset-a'] });
    expect(result.evaluable).toBe(false);
    expect(result.valid).toBe(false);
  });

  it('allowedPartPresetIds: usedPartPresetIdsが許可リスト内なら合格、リスト外を含むとpartPresetNotAllowed違反', () => {
    const restrictions: Partial<BuildRestrictions> = { allowedPartPresetIds: ['preset-a', 'preset-b'] };
    const ok = validateBuildRestrictions(motorConfig, carConfig, restrictions, ['preset-a']);
    expect(ok).toEqual({ valid: true, evaluable: true, violations: [] });

    const bad = validateBuildRestrictions(motorConfig, carConfig, restrictions, ['preset-c']);
    expect(bad.evaluable).toBe(true);
    expect(bad.valid).toBe(false);
    expect(bad.violations).toEqual([{ path: 'partPreset', reason: 'partPresetNotAllowed' }]);
  });

  it('allowedPartPresetIdsが空配列(制限なし)ならusedPartPresetIds未指定でもevaluable=true', () => {
    const result = validateBuildRestrictions(motorConfig, carConfig, { allowedPartPresetIds: [] });
    expect(result).toEqual({ valid: true, evaluable: true, violations: [] });
  });
});
