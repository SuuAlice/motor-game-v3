// P3-0(docs/phase3-p3-0-plan.md v7 8.1節)+P3-1(docs/phase3-p3-1-plan.md v7 §2.2・§2.1.2)。
// 附録A.2のP3-0実装対象に加え、stepMotorWithDestruction本体・classifyTerminalModes完全形・
// createRunAccumulator(Q6(a)、単一引数)をテストする。
import { describe, expect, it } from 'vitest';
import type { CarConfig, VehicleSimState } from '../vehiclePhysics';
import { createInitialVehicleState, stepTestRun } from '../vehiclePhysics';
import { CHATTER_BURST_FRAMES, COIL_DEFORM_FRAMES, COIL_DEFORM_OMEGA } from '../constants';
import type { MotorConfig, SimState } from '../motorPhysics';
import type { DestructionEvent, DestructionConfig, DestructionConfigDraft, DestructionRunContext, CaptureRunSnapshotInput, RunAccumulator } from '../destructionOrchestration';
import {
  captureRunSnapshot,
  classifyTerminalModes,
  composeEffectiveMotorConfig,
  computeEnergyBudgetJ,
  createRunAccumulator,
  deriveDegradationDiffs,
  finalizeDestructionRun,
  finalizeRun,
  normalizeOverheatedStatusForD04Hold,
  restoreRunSnapshot,
  stepMotorWithDestruction,
  stepTestRunWithDestruction,
  validateDestructionConfig,
  validateFireExposureProfile,
} from '../destructionOrchestration';
import { computeElectricalState, step } from '../motorPhysics';
import { createInitialDestructionState } from '../destructionModes';
import type { DestructionState } from '../destructionModes';
import type { TrackDefinition } from '../trackPhysics';
import { mulberry32 } from './prng';

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

// profile省略時は既存呼び出し元(P3-0時点)との互換のため既定値'lipo'を維持する。
// P3-1で追加したnonLipoOverrides引数はbattery.profile='nonLipo'のときのみ意味を持つ
// (shortCircuitDurationLimitSの上書き用、既定2秒では実測に時間がかかりすぎるテストのため)。
function goodDestructionConfig(
  profile: 'lipo' | 'nonLipo' = 'lipo',
  nonLipoOverrides: Partial<Extract<DestructionConfig['battery'], { profile: 'nonLipo' }>> = {},
  lipoOverrides: Partial<Extract<DestructionConfig['battery'], { profile: 'lipo' }>> = {},
): DestructionConfig {
  const battery: DestructionConfig['battery'] =
    profile === 'lipo'
      ? { profile: 'lipo', shortCircuitDurationLimitS: 2, runawayHeatThreshold: 0.9, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 1, smokingS: 1 }, internalResistanceDegradationMultiplier: 1.5, ...lipoOverrides }
      : { profile: 'nonLipo', shortCircuitDurationLimitS: 2, ...nonLipoOverrides };
  return {
    battery,
    d01: { decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5 },
    d02: { smokeGaugeThreshold: 0.6, coilOverheatGaugeLimit: 1, conductionScale: 0.1, dissipationCoefficient: 0.1, smokeResistanceMultiplier: 1.2 },
    d04: { bodyScorchDeltaFraction: 0.2, magnetScorchDeltaFraction: 0.15 },
    d05: {
      brushSparkDurationLimitS: 0.15,
      brushSparkCurrentThresholdA: 3,
      brushWearRateRatio: 1,
      highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 8, highCurrentPenaltyMultiplier: 1.5 },
      wearPerAmpSecond: 0.001,
      recoveryFrames: 6,
      recoveryContactResistanceMultiplier: 1.2,
    },
    d06: { breakage: { kind: 'breakable', gearStrengthThresholdNm: 0.5 } },
    d07: {
      thermal: { conductionCoefficient: 0.1, dissipationCoefficient: 0.05 },
      irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 1, reversibleDroopThreshold: 0.7, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 },
    },
    d09: { bearingSeizureGaugeLimit: 1 },
  };
}

function motorRunContext(): DestructionRunContext {
  return { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null };
}

function vehicleRunContext(): DestructionRunContext {
  return { context: 'vehicle', fireExposureProfile: { bodyEquipped: true, adjacentRolesEquipped: ['magnet'] }, gearTotalToothCount: 10 };
}

function initialSimState(): SimState {
  return { theta: 0, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 };
}

function goodTrack(): TrackDefinition {
  return { id: 'track-1', name: 'テストコース', description: '', segments: [{ lengthM: 10, slopeDeg: 0, surfaceGrip: 0.7, roughness: 0.2 }], objectives: [] };
}

function motorSnapshotInput(overrides: Partial<CaptureRunSnapshotInput> = {}): CaptureRunSnapshotInput {
  return {
    motorConfig: goodMotorConfig(),
    carConfig: null,
    destructionConfig: goodDestructionConfig(),
    runContext: motorRunContext(),
    initialMotorState: initialSimState(),
    initialVehicleState: null,
    track: null,
    courseLengthM: null, // ゲート6新規。motor文脈は正式M2検証によりnull必須
    slopeRad: null,
    seed: 1,
    initialDestructionState: createInitialDestructionState('lipo'),
    ...overrides,
  };
}

// ゲート6新規: 既定はtest-run文脈(track===null、courseLengthM/slopeRadが非null)。
// track-run文脈(track非null)を作る場合は、呼び出し側でtrack・courseLengthM: null・
// slopeRad: nullをまとめて上書きすること(正式M2検証の交差条件、5.2節)。
function vehicleSnapshotInput(overrides: Partial<CaptureRunSnapshotInput> = {}): CaptureRunSnapshotInput {
  const motorConfig = goodMotorConfig();
  const carConfig = standardCarConfig();
  const vehicleState: VehicleSimState = createInitialVehicleState(motorConfig, carConfig);
  return {
    motorConfig,
    carConfig,
    destructionConfig: goodDestructionConfig(),
    runContext: vehicleRunContext(),
    initialMotorState: vehicleState.motor,
    initialVehicleState: vehicleState,
    track: null,
    courseLengthM: 10,
    slopeRad: 0,
    seed: 1,
    initialDestructionState: createInitialDestructionState('lipo'),
    ...overrides,
  };
}

function motorEvent(mode: 'D01' | 'D02' | 'D03'): DestructionEvent {
  const causeLogCommon = { currentA: 1, rpm: 100, atT: 1, temperature: { kind: 'unavailable' as const } };
  return {
    mode,
    causeLog: causeLogCommon,
    isFirstThisSession: true,
    physicsSnapshotAtT: { context: 'motor', state: initialSimState() },
  } as DestructionEvent;
}

function d04Event(stage: 'burning' | 'swelling', affectedRoles: readonly ('body' | 'magnet')[] = []): DestructionEvent {
  return {
    mode: 'D04',
    causeLog: {
      currentA: 1, rpm: 100, atT: 1, temperature: { kind: 'uncalibratedGauge', ratio: 1 },
      batteryHeatRatio: 1, shortCircuitDurationS: 0, stage, overDischargeRatio: null,
      initiatingCause: { shortCircuitDurationS: 0, overDischargeRatio: null },
    },
    isFirstThisSession: true,
    affectedRoles,
    bodyScorchDeltaFraction: 0.2,
    magnetScorchDeltaFraction: 0.15,
    physicsSnapshotAtT: { context: 'motor', state: initialSimState() },
  } as DestructionEvent;
}

function d06Event(isTotalLoss: boolean): DestructionEvent {
  return {
    mode: 'D06',
    causeLog: { currentA: 1, rpm: 100, atT: 1, temperature: { kind: 'unavailable' as const }, loadTorqueNm: 1, toothLossCount: 1 },
    isFirstThisSession: true,
    isTotalLoss,
    physicsSnapshotAtT: { context: 'vehicle', state: createInitialVehicleState(goodMotorConfig(), standardCarConfig()) },
  } as DestructionEvent;
}

// P3-1 §2.2: classifyTerminalModesの網羅テスト用。D01/D05/D07はいかなる場合も分類されない
// (正式Fable裁定、Suu指摘)ことを検証するためのfixture。
function d09Event(): DestructionEvent {
  return {
    mode: 'D09',
    causeLog: { currentA: 1, rpm: 100, atT: 1, temperature: { kind: 'uncalibratedGauge', ratio: 1 }, bearingHeatGaugeRatio: 1 },
    isFirstThisSession: true,
    physicsSnapshotAtT: { context: 'motor', state: initialSimState() },
  } as DestructionEvent;
}

function d05Event(): DestructionEvent {
  return {
    mode: 'D05',
    causeLog: { currentA: 1, rpm: 100, atT: 1, temperature: { kind: 'unavailable' as const }, sparkDurationS: 1 },
    isFirstThisSession: true,
    physicsSnapshotAtT: { context: 'motor', state: initialSimState() },
  } as DestructionEvent;
}

function d07Event(): DestructionEvent {
  return {
    mode: 'D07',
    causeLog: { currentA: 1, rpm: 100, atT: 1, temperature: { kind: 'uncalibratedGauge', ratio: 1 }, magnetHeatGaugeRatio: 1 },
    isFirstThisSession: true,
    // P3-2ゲート3: DestructionConfig.d07.irreversible.demagnetizationDeltaFraction由来の
    // 単一出典値(正式Fable P3-2-Q5裁定)。goodDestructionConfig()の既定値0.1に合わせる。
    demagnetizationDeltaFraction: 0.1,
    physicsSnapshotAtT: { context: 'motor', state: initialSimState() },
  } as DestructionEvent;
}

describe('destructionOrchestration.ts: deriveDegradationDiffs(P3-0限定範囲)', () => {
  it('1. D01イベントからrotor collapseのdiffを導出する', () => {
    const diffs = deriveDegradationDiffs([motorEvent('D01')], createInitialDestructionState('nonLipo'));
    expect(diffs).toEqual([{ role: 'rotor', kind: 'collapse' }]);
  });

  it('2. D02イベントからrotor burnoutのdiffを導出する', () => {
    const diffs = deriveDegradationDiffs([motorEvent('D02')], createInitialDestructionState('nonLipo'));
    expect(diffs).toEqual([{ role: 'rotor', kind: 'burnout' }]);
  });

  it('3. D03イベントからbattery consumedのdiffを導出する', () => {
    const diffs = deriveDegradationDiffs([motorEvent('D03')], createInitialDestructionState('nonLipo'));
    expect(diffs).toEqual([{ role: 'battery', kind: 'consumed' }]);
  });

  it('4. D04イベント(stage:burning)からbattery consumedのdiffを導出する(scorchは含まない)', () => {
    const diffs = deriveDegradationDiffs([d04Event('burning')], createInitialDestructionState('lipo'));
    expect(diffs).toEqual([{ role: 'battery', kind: 'consumed' }]);
  });

  it('5. D04イベント(stage:swelling)からはdiffを導出しない(炎上到達していないため)', () => {
    const diffs = deriveDegradationDiffs([d04Event('swelling')], createInitialDestructionState('lipo'));
    expect(diffs).toEqual([]);
  });

  it('6. 複数D06イベントはgear toothLossのdeltaCountへ集約される', () => {
    const diffs = deriveDegradationDiffs([d06Event(false), d06Event(false), d06Event(true)], createInitialDestructionState('lipo'));
    expect(diffs).toEqual([{ role: 'gear', kind: 'toothLoss', deltaCount: 3 }]);
  });

  it('7. D01/D02/D03/D06が同一run内に混在した場合、対応する全diffが集約される', () => {
    const diffs = deriveDegradationDiffs([motorEvent('D01'), motorEvent('D02'), motorEvent('D03'), d06Event(false)], createInitialDestructionState('nonLipo'));
    expect(diffs).toEqual([
      { role: 'rotor', kind: 'collapse' },
      { role: 'rotor', kind: 'burnout' },
      { role: 'battery', kind: 'consumed' },
      { role: 'gear', kind: 'toothLoss', deltaCount: 1 },
    ]);
  });

  it('8. 空のevents配列からは空配列を返す', () => {
    expect(deriveDegradationDiffs([], createInitialDestructionState('lipo'))).toEqual([]);
  });

  // P3-2ゲート3: D04(affectedRoles込み)・D07のdeltaFraction換算(正式Fable P3-2-Q5裁定、
  // event埋め込み済みの単一出典値をそのまま読み取る設計)。
  it('64. D04イベント(stage:burning、affectedRoles=body+magnet)からbattery consumed+body scorch+magnet scorchのdiffを導出する', () => {
    const diffs = deriveDegradationDiffs([d04Event('burning', ['body', 'magnet'])], createInitialDestructionState('lipo'));
    expect(diffs).toEqual([
      { role: 'body', kind: 'scorch', deltaFraction: 0.2 },
      { role: 'magnet', kind: 'scorch', deltaFraction: 0.15 },
      { role: 'battery', kind: 'consumed' },
    ]);
  });

  it('65. D04イベント(stage:burning、affectedRoles=bodyのみ)からmagnet scorchのdiffは導出されない', () => {
    const diffs = deriveDegradationDiffs([d04Event('burning', ['body'])], createInitialDestructionState('lipo'));
    expect(diffs).toEqual([
      { role: 'body', kind: 'scorch', deltaFraction: 0.2 },
      { role: 'battery', kind: 'consumed' },
    ]);
  });

  it('66. D07イベントからmagnet demagnetizationのdiffを導出する', () => {
    const diffs = deriveDegradationDiffs([d07Event()], createInitialDestructionState('lipo'));
    expect(diffs).toEqual([{ role: 'magnet', kind: 'demagnetization', deltaFraction: 0.1 }]);
  });

  it('67. D04(burning、affectedRoles=body+magnet)とD07が同一run内に混在した場合、一気通貫で全diffが集約される', () => {
    const diffs = deriveDegradationDiffs([d04Event('burning', ['body', 'magnet']), d07Event()], createInitialDestructionState('lipo'));
    expect(diffs).toEqual([
      { role: 'body', kind: 'scorch', deltaFraction: 0.2 },
      { role: 'magnet', kind: 'scorch', deltaFraction: 0.15 },
      { role: 'magnet', kind: 'demagnetization', deltaFraction: 0.1 },
      { role: 'battery', kind: 'consumed' },
    ]);
  });

  // P3-3ゲート3: D05(ブラシ摩耗)のdeltaFraction換算(正式Fable P3-3-Q3裁定、確定候補a)。
  // D04/D07とは異なりevent配列からではなくfinalDestructionStateから読む(P37是正、8節)。
  function stateWithD05Wear(cumulativeWearDeltaFraction: number): DestructionState {
    const base = createInitialDestructionState('nonLipo');
    return { ...base, modes: { ...base.modes, D05: { ...base.modes.D05, cumulativeWearDeltaFraction } } };
  }

  it('68. cumulativeWearDeltaFraction>0のfinalDestructionStateからは、events配列が空でもbrush wearのdiffが導出される(P37是正、event0件でも正のdiffが出る必須DoD)', () => {
    const diffs = deriveDegradationDiffs([], stateWithD05Wear(0.03));
    expect(diffs).toEqual([{ role: 'brush', kind: 'wear', deltaFraction: 0.03 }]);
  });

  it('69. cumulativeWearDeltaFraction===0のfinalDestructionStateからはbrush wearのdiffを導出しない(D05Progress初期値、負例)', () => {
    const diffs = deriveDegradationDiffs([], stateWithD05Wear(0));
    expect(diffs).toEqual([]);
  });

  it('70. ホワイトリスト構造テスト(必須DoD、8節): D05由来のevent個数(0件・1件・複数件)を変えても、diff算出結果はfinalDestructionStateのcumulativeWearDeltaFractionのみに一貫して依存する(eventsの中身は一切参照しない)', () => {
    const state = stateWithD05Wear(0.05);
    const diffsWithNoEvents = deriveDegradationDiffs([], state);
    const diffsWithOneEvent = deriveDegradationDiffs([d05Event()], state);
    const diffsWithManyEvents = deriveDegradationDiffs([d05Event(), d05Event(), d05Event()], state);
    expect(diffsWithNoEvents).toEqual([{ role: 'brush', kind: 'wear', deltaFraction: 0.05 }]);
    expect(diffsWithOneEvent).toEqual(diffsWithNoEvents);
    expect(diffsWithManyEvents).toEqual(diffsWithNoEvents);
  });

  it('71. D05のbrush wear diffは他モードのdiffと同一run内で共存する(D01+D05混在)', () => {
    const diffs = deriveDegradationDiffs([motorEvent('D01')], stateWithD05Wear(0.02));
    expect(diffs).toEqual([
      { role: 'rotor', kind: 'collapse' },
      { role: 'brush', kind: 'wear', deltaFraction: 0.02 },
    ]);
  });
});

describe('destructionOrchestration.ts: finalizeDestructionRun / finalizeRun', () => {
  it('9. finalizeDestructionRunは非空terminalModeCandidatesからdestructionTerminalなRunOutcomeを生成する', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const accumulator = { ...createRunAccumulator(snapshot), events: [motorEvent('D03')], terminalModeCandidates: ['D03'] as const };
    const outcome = finalizeDestructionRun(accumulator);
    expect(outcome.endReason).toBe('destructionTerminal');
    if (outcome.endReason === 'destructionTerminal') {
      expect(outcome.terminalModes).toEqual(['D03']);
      expect(outcome.degradationDiffs).toEqual([{ role: 'battery', kind: 'consumed' }]);
    }
  });

  it('10. finalizeDestructionRunは型上、空配列のterminalModeCandidatesを受理しない', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const accumulator = createRunAccumulator(snapshot);
    // @ts-expect-error terminalModeCandidatesが空配列(readonly DestructionModeId[])のRunAccumulatorは
    // finalizeDestructionRunの非空タプル型引数を満たさない
    finalizeDestructionRun(accumulator);
  });

  it('11. finalizeRunはmanualAbortでRunOutcome.endReason="manualAbort"を返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const accumulator = createRunAccumulator(snapshot);
    const outcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(outcome.endReason).toBe('manualAbort');
  });

  it('12. finalizeRunはphysicsEnded(stalled+energyExhausted)で"energyExhausted"を返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const accumulator = createRunAccumulator(snapshot);
    const outcome = finalizeRun(accumulator, { kind: 'physicsEnded', physicsEndStatus: { status: 'stalled', failureCode: 'energyExhausted' } });
    expect(outcome.endReason).toBe('energyExhausted');
  });

  it('13. finalizeRunはphysicsEnded(stalled、failureCodeなし)で"stalled"を返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const accumulator = createRunAccumulator(snapshot);
    const outcome = finalizeRun(accumulator, { kind: 'physicsEnded', physicsEndStatus: { status: 'stalled' } });
    expect(outcome.endReason).toBe('stalled');
  });

  it('14. finalizeRunはphysicsEnded(finished)で"finished"を返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const accumulator = createRunAccumulator(snapshot);
    const outcome = finalizeRun(accumulator, { kind: 'physicsEnded', physicsEndStatus: { status: 'finished' } });
    expect(outcome.endReason).toBe('finished');
  });
});

describe('destructionOrchestration.ts: captureRunSnapshot', () => {
  it('15. contractVersionを常に2として付与する(ゲート6是正: courseLengthM/slopeRad追加により1→2)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    expect(snapshot.contractVersion).toBe(2);
  });

  it('16. deep copy: 呼び出し後にinputを変更してもRunSnapshotへ波及しない', () => {
    const input = motorSnapshotInput();
    const snapshot = captureRunSnapshot(input);
    input.motorConfig.coilTurns = 999;
    input.seed = 999;
    expect(snapshot.motorConfig.coilTurns).not.toBe(999);
    expect(snapshot.seed).toBe(1);
  });

  it('17. vehicle文脈のcarConfig/initialVehicleState/trackも深いコピーされる', () => {
    const track = goodTrack();
    const input = vehicleSnapshotInput({ track, courseLengthM: null, slopeRad: null });
    const snapshot = captureRunSnapshot(input);
    track.segments[0].lengthM = 9999;
    if (input.carConfig) input.carConfig.massG = 9999;
    expect(snapshot.track?.segments[0].lengthM).not.toBe(9999);
    expect(snapshot.carConfig?.massG).not.toBe(9999);
  });
});

describe('destructionOrchestration.ts: restoreRunSnapshot(12段階検証)', () => {
  it('18. 正常なmotor文脈snapshotを復元できる(ok:true)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const result = restoreRunSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(result.ok).toBe(true);
  });

  it('19. 正常なvehicle文脈snapshot(track非null)を復元できる(ok:true)', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({ track: goodTrack(), courseLengthM: null, slopeRad: null }));
    const result = restoreRunSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(result.ok).toBe(true);
  });

  it('20. contractVersion不一致はunsupportedContractVersionを返す(ゲート6是正: 現行バージョンは2、旧バージョン1は非対応)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = { ...JSON.parse(JSON.stringify(snapshot)), contractVersion: 1 };
    const result = restoreRunSnapshot(raw);
    expect(result).toEqual({ ok: false, reason: 'unsupportedContractVersion' });
  });

  it('21. rootがobjectでない場合はinvalidSchemaを返す', () => {
    expect(restoreRunSnapshot(null)).toEqual({ ok: false, reason: 'invalidSchema', details: 'root is not an object' });
    expect(restoreRunSnapshot('string')).toEqual({ ok: false, reason: 'invalidSchema', details: 'root is not an object' });
  });

  it('22. motorConfig.batteryVoltageが1.5/3.0以外のリテラルはinvalidSchema(有限数一般ではない)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.motorConfig.batteryVoltage = 2.4;
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('23. VehicleSimState.statusが不正なリテラルの場合invalidSchema', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.initialVehicleState.status = 'not-a-status';
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('24. energyBreakdownのフィールド欠落はinvalidSchema', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    delete raw.initialVehicleState.energyBreakdown.heatJ;
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('25. 正式M2必須検証: context="motor"なのにtrackが非nullはinvalidSchema', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.track = goodTrack();
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('26. 正式M2必須検証: context="vehicle"なのにgearTotalToothCountがnullはinvalidSchema', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.runContext.gearTotalToothCount = null;
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('27. trackが検証失敗(空segments)の場合invalidTrackを返す', () => {
    const badTrack: TrackDefinition = { id: 't', name: 't', description: '', segments: [], objectives: [] };
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({ track: badTrack as TrackDefinition, courseLengthM: null, slopeRad: null }));
    const raw = JSON.parse(JSON.stringify(snapshot));
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalidTrack');
  });

  it('28. destructionConfigの値域違反(unsafeDischargeStartRatio=0)はinvalidSchema', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.destructionConfig.battery.unsafeDischargeStartRatio = 0;
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('29. seedが非有限数(NaN相当の文字列)はinvalidSchema', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.seed = 'not-a-number';
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });
});

describe('destructionOrchestration.ts: validateFireExposureProfile', () => {
  it('30. 正常な入力はok:trueでprofileを返す', () => {
    const result = validateFireExposureProfile({ bodyEquipped: true, adjacentRolesEquipped: ['magnet'] });
    expect(result).toEqual({ ok: true, profile: { bodyEquipped: true, adjacentRolesEquipped: ['magnet'] } });
  });

  it('31. adjacentRolesEquippedに不正な値(bodyや未知の値)を含むunknown由来の入力を拒否する', () => {
    const raw = { bodyEquipped: false, adjacentRolesEquipped: ['body'] } as unknown as { bodyEquipped: boolean; adjacentRolesEquipped: readonly Exclude<'body' | 'magnet', 'body'>[] };
    const result = validateFireExposureProfile(raw);
    expect(result.ok).toBe(false);
  });

  it('44. 正式Fable P3-2-Q4-5裁定: adjacentRolesEquippedに重複した値("magnet","magnet")を含む入力を拒否する', () => {
    const result = validateFireExposureProfile({ bodyEquipped: false, adjacentRolesEquipped: ['magnet', 'magnet'] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('重複');
    }
  });
});

describe('destructionOrchestration.ts: validateDestructionConfig(判別union対応・値域検証)', () => {
  it('32. 完全なdraftはok:trueでconfigを返す', () => {
    const draft: DestructionConfigDraft = goodDestructionConfig();
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(true);
  });

  it('33. フィールド欠落はmissingFieldsへ列挙される', () => {
    const draft: DestructionConfigDraft = {};
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toEqual(expect.arrayContaining(['battery', 'd02', 'd05', 'd06', 'd07', 'd09']));
    }
  });

  it('34. profile="nonLipo"の場合、lipo専用フィールドの欠落を要求しない', () => {
    const draft: DestructionConfigDraft = { ...goodDestructionConfig(), battery: { profile: 'nonLipo', shortCircuitDurationLimitS: 2 } };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(true);
  });

  it('35. profile="lipo"でunsafeDischargeStartRatioが範囲外(0)の場合、invalidFieldsへ報告される', () => {
    const draft: DestructionConfigDraft = {
      ...goodDestructionConfig(),
      battery: { profile: 'lipo', shortCircuitDurationLimitS: 2, runawayHeatThreshold: 0.9, unsafeDischargeStartRatio: 0, stageDurations: { swellingS: 1, smokingS: 1 }, internalResistanceDegradationMultiplier: 1.5 },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalidFields.some((f) => f.field === 'battery.unsafeDischargeStartRatio')).toBe(true);
    }
  });

  it('36. breakage.kind="nonBreakable"の場合、gearStrengthThresholdNmの欠落を要求しない', () => {
    const draft: DestructionConfigDraft = { ...goodDestructionConfig(), d06: { breakage: { kind: 'nonBreakable' } } };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(true);
  });

  it('37. Suuコード監査#4: unsafeDischargeStartRatio違反はinvalidFieldsへちょうど1件だけ報告される(重複しない)', () => {
    const draft: DestructionConfigDraft = {
      ...goodDestructionConfig(),
      battery: { profile: 'lipo', shortCircuitDurationLimitS: 2, runawayHeatThreshold: 0.9, unsafeDischargeStartRatio: 0, stageDurations: { swellingS: 1, smokingS: 1 }, internalResistanceDegradationMultiplier: 1.5 },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const matches = result.invalidFields.filter((f) => f.field === 'battery.unsafeDischargeStartRatio');
      expect(matches).toHaveLength(1);
    }
  });

  it('45. 正式Fable P3-2-Q1裁定: battery.internalResistanceDegradationMultiplierが非正の場合invalidFieldsへ報告される', () => {
    const draft: DestructionConfigDraft = {
      ...goodDestructionConfig(),
      battery: { profile: 'lipo', shortCircuitDurationLimitS: 2, runawayHeatThreshold: 0.9, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 1, smokingS: 1 }, internalResistanceDegradationMultiplier: 0 },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalidFields.some((f) => f.field === 'battery.internalResistanceDegradationMultiplier')).toBe(true);
    }
  });

  it('60. Suu_mot3ゲート1レビュー: battery.internalResistanceDegradationMultiplierが1未満(0.99、抵抗が改善する逆向き物理)の場合invalidFieldsへ報告される', () => {
    const draft: DestructionConfigDraft = {
      ...goodDestructionConfig(),
      battery: { profile: 'lipo', shortCircuitDurationLimitS: 2, runawayHeatThreshold: 0.9, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 1, smokingS: 1 }, internalResistanceDegradationMultiplier: 0.99 },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalidFields.some((f) => f.field === 'battery.internalResistanceDegradationMultiplier')).toBe(true);
    }
  });

  it('61. Suu_mot3ゲート1レビュー: battery.internalResistanceDegradationMultiplier===1(中立境界)はok:trueを返す', () => {
    const draft: DestructionConfigDraft = {
      ...goodDestructionConfig(),
      battery: { profile: 'lipo', shortCircuitDurationLimitS: 2, runawayHeatThreshold: 0.9, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 1, smokingS: 1 }, internalResistanceDegradationMultiplier: 1 },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(true);
  });

  it('46. 正式Fable P3-2-Q5裁定: d04が欠落した場合missingFieldsへ報告される', () => {
    const draft: DestructionConfigDraft = { ...goodDestructionConfig(), d04: undefined };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingFields).toContain('d04');
    }
  });

  it('47. 正式Fable P3-2-Q5裁定: d04.bodyScorchDeltaFraction/magnetScorchDeltaFractionは0を正当な値として許容する(未装備/nonDemagnetizing磁石)', () => {
    const draft: DestructionConfigDraft = { ...goodDestructionConfig(), d04: { bodyScorchDeltaFraction: 0, magnetScorchDeltaFraction: 0 } };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(true);
  });

  it('48. 正式Fable P3-2-Q5裁定: d04.bodyScorchDeltaFractionが範囲外(負・1超)の場合invalidFieldsへ報告される', () => {
    const draft: DestructionConfigDraft = { ...goodDestructionConfig(), d04: { bodyScorchDeltaFraction: -0.1, magnetScorchDeltaFraction: 1.5 } };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalidFields.some((f) => f.field === 'd04.bodyScorchDeltaFraction')).toBe(true);
      expect(result.invalidFields.some((f) => f.field === 'd04.magnetScorchDeltaFraction')).toBe(true);
    }
  });

  it('49. 正式Fable P3-2-Q11裁定: d07.thermalの係数が非正の場合invalidFieldsへ報告される', () => {
    const draft: DestructionConfigDraft = {
      ...goodDestructionConfig(),
      d07: { thermal: { conductionCoefficient: 0, dissipationCoefficient: -1 }, irreversible: { kind: 'nonDemagnetizing' } },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalidFields.some((f) => f.field === 'd07.thermal.conductionCoefficient')).toBe(true);
      expect(result.invalidFields.some((f) => f.field === 'd07.thermal.dissipationCoefficient')).toBe(true);
    }
  });

  it('50. 正式Fable P3-2-Q11裁定: irreversible.kind==="nonDemagnetizing"の場合、magnetHeatGaugeLimit等の交差検証をスキップしok:trueを返す', () => {
    const draft: DestructionConfigDraft = {
      ...goodDestructionConfig(),
      d07: { thermal: { conductionCoefficient: 0.1, dissipationCoefficient: 0.05 }, irreversible: { kind: 'nonDemagnetizing' } },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(true);
  });

  it('51. 正式Fable P3-2-Q11裁定: irreversible.kind==="demagnetizing"でreversibleDroopThreshold >= magnetHeatGaugeLimitの場合invalidFieldsへ報告される', () => {
    const draft: DestructionConfigDraft = {
      ...goodDestructionConfig(),
      d07: {
        thermal: { conductionCoefficient: 0.1, dissipationCoefficient: 0.05 },
        irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.5, reversibleDroopThreshold: 0.5, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 },
      },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalidFields.some((f) => f.field === 'd07.irreversible.reversibleDroopThreshold')).toBe(true);
    }
  });

  it('52. 正式Fable P3-2-Q11裁定: irreversible.kind==="demagnetizing"でdemagnetizationDeltaFractionが0(退化値)の場合invalidFieldsへ報告される', () => {
    const draft: DestructionConfigDraft = {
      ...goodDestructionConfig(),
      d07: {
        thermal: { conductionCoefficient: 0.1, dissipationCoefficient: 0.05 },
        irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.8, reversibleDroopThreshold: 0.5, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0 },
      },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalidFields.some((f) => f.field === 'd07.irreversible.demagnetizationDeltaFraction')).toBe(true);
    }
  });

  it('62. Suu_mot3ゲート1レビュー: d07.irreversible.reversibleDroopMultiplierが1超(1.01、実効Bが増える逆向き物理)の場合invalidFieldsへ報告される', () => {
    const draft: DestructionConfigDraft = {
      ...goodDestructionConfig(),
      d07: {
        thermal: { conductionCoefficient: 0.1, dissipationCoefficient: 0.05 },
        irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.8, reversibleDroopThreshold: 0.5, reversibleDroopMultiplier: 1.01, demagnetizationDeltaFraction: 0.1 },
      },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalidFields.some((f) => f.field === 'd07.irreversible.reversibleDroopMultiplier')).toBe(true);
    }
  });

  it('63. Suu_mot3ゲート1レビュー: d07.irreversible.reversibleDroopMultiplier===1(中立境界)はok:trueを返す', () => {
    const draft: DestructionConfigDraft = {
      ...goodDestructionConfig(),
      d07: {
        thermal: { conductionCoefficient: 0.1, dissipationCoefficient: 0.05 },
        irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.8, reversibleDroopThreshold: 0.5, reversibleDroopMultiplier: 1, demagnetizationDeltaFraction: 0.1 },
      },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(true);
  });
});

describe('destructionOrchestration.ts: restoreRunSnapshot 追加負例(Suuコード監査#5/#6/#7)', () => {
  it('38. Suu#5: battery.profile="lipo"でstageDurationsが欠落したunknown入力はthrowせずinvalidSchemaを返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    delete raw.destructionConfig.battery.stageDurations;
    expect(() => restoreRunSnapshot(raw)).not.toThrow();
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('39. Suu#5: battery.profile="lipo"でstageDurationsが非object(文字列)のunknown入力はthrowせずinvalidSchemaを返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.destructionConfig.battery.stageDurations = 'not-an-object';
    expect(() => restoreRunSnapshot(raw)).not.toThrow();
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('40. Suu#6: initialDestructionStateの各Progress/CauseLogフィールド破損を網羅的に拒否する', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const baseRaw = JSON.parse(JSON.stringify(snapshot));
    // 正常系がまず通ることを確認(比較対象)
    expect(restoreRunSnapshot(JSON.parse(JSON.stringify(baseRaw))).ok).toBe(true);

    const corruptions: Array<(raw: typeof baseRaw) => void> = [
      (raw) => {
        raw.initialDestructionState.shared.shortCircuitDurationS = 'not-a-number';
      },
      (raw) => {
        raw.initialDestructionState.modes.D01.triggered = 'not-a-boolean';
      },
      (raw) => {
        raw.initialDestructionState.modes.D02.coilHeatGaugeRatio = 'not-a-number';
      },
      (raw) => {
        raw.initialDestructionState.modes.D05.episodeTriggered = 'not-a-boolean';
      },
      (raw) => {
        raw.initialDestructionState.modes.D06.toothLossCount = 'not-a-number';
      },
      (raw) => {
        raw.initialDestructionState.modes.D07.reversibleDroopActive = 'not-a-boolean';
      },
      (raw) => {
        raw.initialDestructionState.modes.D09.bearingHeatGaugeRatio = 'not-a-number';
      },
      (raw) => {
        raw.initialDestructionState.modes.D01.causeLog = { currentA: 1, rpm: 1, atT: 1, temperature: { kind: 'not-a-valid-kind' } };
      },
      (raw) => {
        raw.initialDestructionState.battery.profile = 'lipo';
        raw.initialDestructionState.battery.d04 = undefined;
      },
    ];

    for (const corrupt of corruptions) {
      const raw = JSON.parse(JSON.stringify(baseRaw));
      corrupt(raw);
      const result = restoreRunSnapshot(raw);
      expect(result.ok, JSON.stringify(raw.initialDestructionState)).toBe(false);
    }
  });

  it('41. Suu#7: runContext.fireExposureProfile.adjacentRolesEquippedに"body"を含む場合invalidSchemaを返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.runContext.fireExposureProfile.adjacentRolesEquipped = ['body'];
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('42. Suu#7: runContext.fireExposureProfile.adjacentRolesEquippedに未知の値を含む場合invalidSchemaを返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.runContext.fireExposureProfile.adjacentRolesEquipped = ['unknown-role'];
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('43. Suu#7: runContext.fireExposureProfile.bodyEquippedが非booleanの場合invalidSchemaを返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.runContext.fireExposureProfile.bodyEquipped = 'not-a-boolean';
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });
});

describe('destructionOrchestration.ts: D04Progress.initiatingCauseLog / D04CauseLog.initiatingCause (正式Fable P3-2-Q4-3・Q4-4裁定)', () => {
  // stage==='burning'まで到達した、交差不変条件を満たす有効なD04Progressのraw表現。
  function burningD04Raw() {
    return {
      triggered: true,
      triggeredAtT: 1,
      stage: 'burning',
      stageEnteredAtT: 1,
      overDischargeActive: false,
      initiatingCauseLog: { shortCircuitDurationS: 2, overDischargeRatio: null },
      causeLog: {
        currentA: 1, rpm: 100, atT: 1, temperature: { kind: 'uncalibratedGauge', ratio: 1 },
        batteryHeatRatio: 1, shortCircuitDurationS: 0, stage: 'burning', overDischargeRatio: null,
        initiatingCause: { shortCircuitDurationS: 2, overDischargeRatio: null },
      },
    };
  }

  function snapshotWithD04(d04: unknown) {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.initialDestructionState.battery.profile = 'lipo';
    raw.initialDestructionState.battery.d04 = d04;
    return raw;
  }

  it('53. burning到達済みの有効なD04Progress(initiatingCauseLog・causeLog.initiatingCause込み)はok:trueを返す(正常系比較対象)', () => {
    const result = restoreRunSnapshot(snapshotWithD04(burningD04Raw()));
    expect(result.ok).toBe(true);
  });

  it('54. stage==="none"なのにinitiatingCauseLogが非nullの場合invalidSchemaを返す(交差不変条件1)', () => {
    const d04 = { triggered: false, triggeredAtT: null, stage: 'none', stageEnteredAtT: null, overDischargeActive: false, initiatingCauseLog: { shortCircuitDurationS: 1, overDischargeRatio: null }, causeLog: null };
    const result = restoreRunSnapshot(snapshotWithD04(d04));
    expect(result.ok).toBe(false);
  });

  it('55. stage==="swelling"なのにinitiatingCauseLogがnullの場合invalidSchemaを返す(交差不変条件2)', () => {
    const d04 = { triggered: false, triggeredAtT: null, stage: 'swelling', stageEnteredAtT: 1, overDischargeActive: false, initiatingCauseLog: null, causeLog: null };
    const result = restoreRunSnapshot(snapshotWithD04(d04));
    expect(result.ok).toBe(false);
  });

  it('56. triggered===trueなのにstage!=="burning"の場合invalidSchemaを返す(交差不変条件3、前半)', () => {
    const d04 = { ...burningD04Raw(), stage: 'smoking' };
    const result = restoreRunSnapshot(snapshotWithD04(d04));
    expect(result.ok).toBe(false);
  });

  it('57. stage==="burning"かつcauseLog非nullなのにtriggered===falseの場合invalidSchemaを返す(交差不変条件3、後半)', () => {
    const d04 = { ...burningD04Raw(), triggered: false };
    const result = restoreRunSnapshot(snapshotWithD04(d04));
    expect(result.ok).toBe(false);
  });

  it('58. initiatingCauseLog.shortCircuitDurationSが非数値の場合invalidSchemaを返す', () => {
    const d04 = { ...burningD04Raw(), initiatingCauseLog: { shortCircuitDurationS: 'not-a-number', overDischargeRatio: null } };
    const result = restoreRunSnapshot(snapshotWithD04(d04));
    expect(result.ok).toBe(false);
  });

  it('59. D04CauseLog.initiatingCauseが欠落(undefined)の場合invalidSchemaを返す', () => {
    const raw = burningD04Raw();
    const causeLog = { ...raw.causeLog } as Record<string, unknown>;
    delete causeLog.initiatingCause;
    const d04 = { ...raw, causeLog };
    const result = restoreRunSnapshot(snapshotWithD04(d04));
    expect(result.ok).toBe(false);
  });
});

describe('destructionOrchestration.ts: P3-3ゲート1 Suuレビュー是正(2026-08-10、validator/cross-validator直接負例)', () => {
  it('60. restoreRunSnapshot: base MotorConfig.effectiveTurnsRatioがundefinedは受理される', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    expect(raw.motorConfig.effectiveTurnsRatio).toBeUndefined();
    expect(restoreRunSnapshot(raw).ok).toBe(true);
  });

  it('61. restoreRunSnapshot: base MotorConfig.effectiveTurnsRatio===1は受理される', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput({ motorConfig: goodMotorConfig({ effectiveTurnsRatio: 1 }) }));
    const raw = JSON.parse(JSON.stringify(snapshot));
    expect(restoreRunSnapshot(raw).ok).toBe(true);
  });

  it.each([0.7, 1.3])('62. restoreRunSnapshot: base MotorConfig.effectiveTurnsRatio===%s(1以外)はinvalidSchemaを返す(P3-3-Q12)', (value) => {
    const snapshot = captureRunSnapshot(motorSnapshotInput({ motorConfig: goodMotorConfig({ effectiveTurnsRatio: value }) }));
    const raw = JSON.parse(JSON.stringify(snapshot));
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('invalidSchema');
  });

  it('63. restoreRunSnapshot: initialDestructionState.modes.D05.recoveryFramesLeftがconfig.d05.recoveryFramesと同値は受理される', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.initialDestructionState.modes.D05.recoveryFramesLeft = raw.destructionConfig.d05.recoveryFrames;
    expect(restoreRunSnapshot(raw).ok).toBe(true);
  });

  it('64. restoreRunSnapshot: initialDestructionState.modes.D05.recoveryFramesLeftがconfig.d05.recoveryFramesを超える場合invalidSchemaを返す(P3-3-Q7 cross-validator)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.initialDestructionState.modes.D05.recoveryFramesLeft = raw.destructionConfig.d05.recoveryFrames + 1;
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('invalidSchema');
  });

  it('65. D02Progress: triggered/triggeredAtT/causeLogの3値整合+smokingStarted/At整合+triggered⟹smokingStartedを網羅的に拒否する', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const baseRaw = JSON.parse(JSON.stringify(snapshot));
    expect(restoreRunSnapshot(JSON.parse(JSON.stringify(baseRaw))).ok).toBe(true);

    const d02CauseLog = { currentA: 1, rpm: 100, atT: 1, temperature: { kind: 'uncalibratedGauge', ratio: 0.5 }, coilHeatGaugeRatio: 0.5 };
    const corruptions: Array<(raw: typeof baseRaw) => void> = [
      // triggered===false ⟺ triggeredAtT===null ⟺ causeLog===null の3値同値
      (raw) => { raw.initialDestructionState.modes.D02.triggeredAtT = 1; }, // triggered=false, triggeredAtT!=null
      (raw) => { raw.initialDestructionState.modes.D02.causeLog = d02CauseLog; }, // triggered=false, causeLog!=null
      (raw) => {
        raw.initialDestructionState.modes.D02.triggered = true;
        raw.initialDestructionState.modes.D02.smokingStarted = true;
        raw.initialDestructionState.modes.D02.smokingStartedAtT = 1;
        // triggeredAtT/causeLogは意図的にnullのまま(triggered=trueなのに非null必須違反)
      },
      // smokingStarted===false ⟺ smokingStartedAtT===null
      (raw) => { raw.initialDestructionState.modes.D02.smokingStartedAtT = 1; }, // smokingStarted=false, At!=null
      (raw) => {
        raw.initialDestructionState.modes.D02.smokingStarted = true;
        // smokingStartedAtTは意図的にnullのまま
      },
      // triggered===true ⟹ smokingStarted===true
      (raw) => {
        raw.initialDestructionState.modes.D02.triggered = true;
        raw.initialDestructionState.modes.D02.triggeredAtT = 1;
        raw.initialDestructionState.modes.D02.causeLog = d02CauseLog;
        // smokingStartedは意図的にfalseのまま(triggered=trueなのにsmokingStarted=false)
      },
    ];

    for (const corrupt of corruptions) {
      const raw = JSON.parse(JSON.stringify(baseRaw));
      corrupt(raw);
      const result = restoreRunSnapshot(raw);
      expect(result.ok, JSON.stringify(raw.initialDestructionState.modes.D02)).toBe(false);
    }
  });

  it('66. D02Progress: coilHeatGaugeRatioが[0,1]の範囲外(負値・1超)の場合invalidSchemaを返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const baseRaw = JSON.parse(JSON.stringify(snapshot));
    for (const value of [-0.1, 1.1]) {
      const raw = JSON.parse(JSON.stringify(baseRaw));
      raw.initialDestructionState.modes.D02.coilHeatGaugeRatio = value;
      const result = restoreRunSnapshot(raw);
      expect(result.ok, `coilHeatGaugeRatio=${value}`).toBe(false);
    }
  });

  it('67. D05Progress: episodeCount/firstEpisodeAtT/causeLogの3値整合+episodeTriggered⟹episodeCount>0+非負整数recovery+非負wearを網羅的に拒否する', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const baseRaw = JSON.parse(JSON.stringify(snapshot));
    expect(restoreRunSnapshot(JSON.parse(JSON.stringify(baseRaw))).ok).toBe(true);

    const d05CauseLog = { currentA: 0, rpm: 100, atT: 1, temperature: { kind: 'unavailable' }, sparkDurationS: 0.2, theoreticalCurrentA: 10 };
    const corruptions: Array<(raw: typeof baseRaw) => void> = [
      // episodeCount===0 ⟺ firstEpisodeAtT===null ⟺ causeLog===null
      (raw) => { raw.initialDestructionState.modes.D05.firstEpisodeAtT = 1; },
      (raw) => { raw.initialDestructionState.modes.D05.causeLog = d05CauseLog; },
      (raw) => {
        raw.initialDestructionState.modes.D05.episodeCount = 1;
        // firstEpisodeAtT/causeLogは意図的にnullのまま(episodeCount>=1なのに3値がnull)
      },
      // episodeTriggered===true ⟹ episodeCount>=1
      (raw) => { raw.initialDestructionState.modes.D05.episodeTriggered = true; }, // episodeCount=0のまま
      // episodeCountは非負整数
      (raw) => { raw.initialDestructionState.modes.D05.episodeCount = -1; },
      (raw) => { raw.initialDestructionState.modes.D05.episodeCount = 1.5; },
      // recoveryFramesLeftは非負整数
      (raw) => { raw.initialDestructionState.modes.D05.recoveryFramesLeft = -1; },
      (raw) => { raw.initialDestructionState.modes.D05.recoveryFramesLeft = 1.5; },
      // cumulativeWearDeltaFraction/cumulativeSparkExposure/sparkDurationSは非負
      (raw) => { raw.initialDestructionState.modes.D05.cumulativeWearDeltaFraction = -0.1; },
      (raw) => { raw.initialDestructionState.modes.D05.cumulativeSparkExposure = -0.1; },
      (raw) => { raw.initialDestructionState.modes.D05.sparkDurationS = -0.1; },
    ];

    for (const corrupt of corruptions) {
      const raw = JSON.parse(JSON.stringify(baseRaw));
      corrupt(raw);
      const result = restoreRunSnapshot(raw);
      expect(result.ok, JSON.stringify(raw.initialDestructionState.modes.D05)).toBe(false);
    }
  });

  it('68. D01Progress: triggered=falseの場合decayExposureRadは0以外だとinvalidSchemaを返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    expect(raw.initialDestructionState.modes.D01.triggered).toBe(false);
    raw.initialDestructionState.modes.D01.decayExposureRad = 1;
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('69. D01Progress: decayExposureRadが負値の場合invalidSchemaを返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.initialDestructionState.modes.D01.decayExposureRad = -0.1;
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('70. validateDestructionConfig: d01の新規値域(decayExposureScaleRad正値・minEffectiveTurnsRatio(0,1])を拒否する', () => {
    const baseDraft: DestructionConfigDraft = goodDestructionConfig();
    expect(validateDestructionConfig(baseDraft).ok).toBe(true);

    for (const bad of [0, -1, NaN, Infinity]) {
      const draft: DestructionConfigDraft = { ...baseDraft, d01: { ...baseDraft.d01!, decayExposureScaleRad: bad } };
      expect(validateDestructionConfig(draft).ok, `decayExposureScaleRad=${bad}`).toBe(false);
    }
    for (const bad of [0, -0.1, 1.1, NaN]) {
      const draft: DestructionConfigDraft = { ...baseDraft, d01: { ...baseDraft.d01!, minEffectiveTurnsRatio: bad } };
      expect(validateDestructionConfig(draft).ok, `minEffectiveTurnsRatio=${bad}`).toBe(false);
    }
    // 境界正例(Suu再照合是正): 上限1.0(中立境界)はgood値0.5とは別に単独で受理されることを固定する。
    expect(validateDestructionConfig({ ...baseDraft, d01: { ...baseDraft.d01!, minEffectiveTurnsRatio: 1 } }).ok).toBe(true);
  });

  it('71. validateDestructionConfig: d02の新規値域(0 < smokeGaugeThreshold < coilOverheatGaugeLimit <= 1、conductionScale/dissipationCoefficient正値、smokeResistanceMultiplier>=1)を拒否する', () => {
    const baseDraft: DestructionConfigDraft = goodDestructionConfig();
    expect(validateDestructionConfig(baseDraft).ok).toBe(true);

    // coilOverheatGaugeLimit > 1(是正前は誤って許容していた穴)
    expect(validateDestructionConfig({ ...baseDraft, d02: { ...baseDraft.d02!, coilOverheatGaugeLimit: 1.5 } }).ok).toBe(false);
    // smokeGaugeThreshold >= coilOverheatGaugeLimit(順序不変条件違反)
    expect(validateDestructionConfig({ ...baseDraft, d02: { ...baseDraft.d02!, smokeGaugeThreshold: 1, coilOverheatGaugeLimit: 1 } }).ok).toBe(false);
    for (const bad of [0, -1, NaN]) {
      expect(validateDestructionConfig({ ...baseDraft, d02: { ...baseDraft.d02!, conductionScale: bad } }).ok, `conductionScale=${bad}`).toBe(false);
      expect(validateDestructionConfig({ ...baseDraft, d02: { ...baseDraft.d02!, dissipationCoefficient: bad } }).ok, `dissipationCoefficient=${bad}`).toBe(false);
    }
    expect(validateDestructionConfig({ ...baseDraft, d02: { ...baseDraft.d02!, smokeResistanceMultiplier: 0.9 } }).ok).toBe(false);
    // 境界値(中立)は許容される
    expect(validateDestructionConfig({ ...baseDraft, d02: { ...baseDraft.d02!, smokeResistanceMultiplier: 1 } }).ok).toBe(true);
    expect(validateDestructionConfig({ ...baseDraft, d02: { ...baseDraft.d02!, coilOverheatGaugeLimit: 1 } }).ok).toBe(true);
  });

  it('72. validateDestructionConfig: d05の新規値域(duration上限CHATTER_BURST_FRAMES/120、非負/正値・整数・recoveryContactResistanceMultiplier>=1)を拒否する', () => {
    const baseDraft: DestructionConfigDraft = goodDestructionConfig();
    expect(validateDestructionConfig(baseDraft).ok).toBe(true);

    // brushSparkDurationLimitS > CHATTER_BURST_FRAMES/120(到達可能性制約違反)
    expect(validateDestructionConfig({ ...baseDraft, d05: { ...baseDraft.d05!, brushSparkDurationLimitS: 0.21 } }).ok).toBe(false);
    // 境界値(ちょうどCHATTER_BURST_FRAMES/120)は許容される(単一出典: リテラル24を複製せずCHATTER_BURST_FRAMESをimportする)
    expect(validateDestructionConfig({ ...baseDraft, d05: { ...baseDraft.d05!, brushSparkDurationLimitS: CHATTER_BURST_FRAMES / 120 } }).ok).toBe(true);
    for (const bad of [0, -1, NaN]) {
      expect(validateDestructionConfig({ ...baseDraft, d05: { ...baseDraft.d05!, brushWearRateRatio: bad } }).ok, `brushWearRateRatio=${bad}`).toBe(false);
      expect(validateDestructionConfig({ ...baseDraft, d05: { ...baseDraft.d05!, wearPerAmpSecond: bad } }).ok, `wearPerAmpSecond=${bad}`).toBe(false);
    }
    expect(validateDestructionConfig({ ...baseDraft, d05: { ...baseDraft.d05!, recoveryContactResistanceMultiplier: 0.9 } }).ok).toBe(false);
    for (const bad of [-1, 1.5, NaN]) {
      expect(validateDestructionConfig({ ...baseDraft, d05: { ...baseDraft.d05!, recoveryFrames: bad } }).ok, `recoveryFrames=${bad}`).toBe(false);
    }
    // 境界値(中立)は許容される
    expect(validateDestructionConfig({ ...baseDraft, d05: { ...baseDraft.d05!, recoveryFrames: 0 } }).ok).toBe(true);
    // 境界正例(Suu再照合是正): recoveryContactResistanceMultiplier===1(中立境界)はgood値1.2とは
    // 別に単独で受理されることを固定する。
    expect(validateDestructionConfig({ ...baseDraft, d05: { ...baseDraft.d05!, recoveryContactResistanceMultiplier: 1 } }).ok).toBe(true);
  });

  it('76. 正式Fable P3-3-Q15-4裁定: highCurrentPenaltyの判別union(noPenalty/thresholdPenalty)をvalidateDestructionConfigが正しく検証する', () => {
    const baseDraft: DestructionConfigDraft = goodDestructionConfig();
    // baseDraftのd05.highCurrentPenaltyはkind:'thresholdPenalty'(thresholdA=8, multiplier=1.5)。
    expect(baseDraft.d05!.highCurrentPenalty.kind).toBe('thresholdPenalty');
    expect(validateDestructionConfig(baseDraft).ok).toBe(true);

    // thresholdPenalty枝: thresholdAの値域負例
    for (const bad of [0, -1, NaN]) {
      expect(
        validateDestructionConfig({
          ...baseDraft,
          d05: { ...baseDraft.d05!, highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: bad, highCurrentPenaltyMultiplier: 1.5 } },
        }).ok,
        `highCurrentPenaltyThresholdA=${bad}`,
      ).toBe(false);
    }

    // thresholdPenalty枝: multiplierは1超が厳密に必須(P3-3-Q15-4裁定、>=1ではない)。
    // multiplier===1のthresholdPenaltyはnoPenaltyの重複表現になるため拒否する。
    for (const bad of [0.9, 1, -1, NaN]) {
      expect(
        validateDestructionConfig({
          ...baseDraft,
          d05: { ...baseDraft.d05!, highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 8, highCurrentPenaltyMultiplier: bad } },
        }).ok,
        `highCurrentPenaltyMultiplier=${bad}`,
      ).toBe(false);
    }
    // 境界超過(1超)は受理される。
    expect(
      validateDestructionConfig({
        ...baseDraft,
        d05: { ...baseDraft.d05!, highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 8, highCurrentPenaltyMultiplier: 1.0001 } },
      }).ok,
    ).toBe(true);

    // noPenalty枝: 数値フィールドを一切持たないため、他のd05値がすべて正常なら常に受理される
    // (このテストが無ければ、noPenalty枝が誤って何らかの数値フィールドを要求していても
    // 検出できない)。
    expect(
      validateDestructionConfig({
        ...baseDraft,
        d05: { ...baseDraft.d05!, highCurrentPenalty: { kind: 'noPenalty' } },
      }).ok,
    ).toBe(true);
  });

  it('80. 正式Fable P3-3-Q15-4裁定(Suu最終照合是正P52): kindがunsafe castで未知の値になった場合、validateDestructionConfigがinvalidFieldsで拒否する(TypeScriptの型検査を迂回した場合の防御)', () => {
    const baseDraft: DestructionConfigDraft = goodDestructionConfig();
    const corruptedD05 = { ...baseDraft.d05!, highCurrentPenalty: { kind: 'unknownKind' } } as unknown as DestructionConfigDraft['d05'];
    const result = validateDestructionConfig({ ...baseDraft, d05: corruptedD05 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.invalidFields.some((f) => f.field === 'd05.highCurrentPenalty.kind')).toBe(true);
  });
});

describe('destructionOrchestration.ts: P3-3ゲート1 Suu再照合是正(2026-08-10、非初期stateのrestore正例+Q9負例)', () => {
  it('73. D02Progress: 発火済み(triggered=true・smokingStarted=true・coilHeatGaugeRatio=1)の整合stateがrestore成功する', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.initialDestructionState.modes.D02 = {
      triggered: true,
      triggeredAtT: 1,
      coilHeatGaugeRatio: 1,
      causeLog: { currentA: 2, rpm: 100, atT: 1, temperature: { kind: 'uncalibratedGauge', ratio: 1 }, coilHeatGaugeRatio: 1 },
      smokingStarted: true,
      smokingStartedAtT: 0.5,
    };
    const result = restoreRunSnapshot(raw);
    expect(result.ok, JSON.stringify(raw.initialDestructionState.modes.D02)).toBe(true);
    expect(result.ok && result.snapshot.initialDestructionState.modes.D02.triggered).toBe(true);
  });

  it('74. D05Progress: episode成立済み(episodeCount=1・cumulativeWearDeltaFraction>0・recoveryFramesLeft<=上限)の整合stateがrestore成功する', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    expect(raw.destructionConfig.d05.recoveryFrames).toBeGreaterThanOrEqual(3); // goodDestructionConfig()の既定値(6)を前提にする
    raw.initialDestructionState.modes.D05 = {
      sparkDurationS: 0,
      episodeTriggered: false,
      episodeCount: 1,
      cumulativeSparkExposure: 0.5,
      firstEpisodeAtT: 1,
      causeLog: { currentA: 0, rpm: 100, atT: 1, temperature: { kind: 'unavailable' }, sparkDurationS: 0.15, theoreticalCurrentA: 10 },
      cumulativeWearDeltaFraction: 0.01,
      recoveryFramesLeft: 3,
    };
    const result = restoreRunSnapshot(raw);
    expect(result.ok, JSON.stringify(raw.initialDestructionState.modes.D05)).toBe(true);
    expect(result.ok && result.snapshot.initialDestructionState.modes.D05.episodeCount).toBe(1);
  });

  it('75. D05CauseLog: theoreticalCurrentAが欠落(undefined)の場合invalidSchemaを返す(P3-3-Q9 raw validatorを直接固定)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    const causeLog: Record<string, unknown> = {
      currentA: 0, rpm: 100, atT: 1, temperature: { kind: 'unavailable' }, sparkDurationS: 0.15, theoreticalCurrentA: 10,
    };
    delete causeLog.theoreticalCurrentA;
    raw.initialDestructionState.modes.D05 = {
      sparkDurationS: 0,
      episodeTriggered: false,
      episodeCount: 1,
      cumulativeSparkExposure: 0.5,
      firstEpisodeAtT: 1,
      causeLog,
      cumulativeWearDeltaFraction: 0.01,
      recoveryFramesLeft: 0,
    };
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('77. 正式Fable P3-3-Q15-4裁定: destructionConfig.d05.highCurrentPenalty.kindが不正な文字列・欠落の場合invalidSchemaを返す(raw shape validator直接固定)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const rawInvalidKind = JSON.parse(JSON.stringify(snapshot));
    rawInvalidKind.destructionConfig.d05.highCurrentPenalty = { kind: 'unknownKind' };
    expect(restoreRunSnapshot(rawInvalidKind).ok).toBe(false);

    const rawMissingKind = JSON.parse(JSON.stringify(snapshot));
    delete rawMissingKind.destructionConfig.d05.highCurrentPenalty.kind;
    expect(restoreRunSnapshot(rawMissingKind).ok).toBe(false);

    const rawThresholdMissingFields = JSON.parse(JSON.stringify(snapshot));
    rawThresholdMissingFields.destructionConfig.d05.highCurrentPenalty = { kind: 'thresholdPenalty' };
    expect(restoreRunSnapshot(rawThresholdMissingFields).ok).toBe(false);
  });

  it('78. 正式Fable P3-3-Q15-4裁定: destructionConfig.d05.highCurrentPenalty.kind==="noPenalty"はrestore成功する(数値フィールドを持たない状態のround-trip正例)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = JSON.parse(JSON.stringify(snapshot));
    raw.destructionConfig.d05.highCurrentPenalty = { kind: 'noPenalty' };
    expect(restoreRunSnapshot(raw).ok).toBe(true);
  });

  it('79. 正式Fable P3-3-Q15-4裁定(Suu最終照合是正P52): kind==="noPenalty"へ旧番兵フィールド(highCurrentPenaltyThresholdA/highCurrentPenaltyMultiplier)が残っているrawはinvalidSchemaを返す(削除して救済せず不正状態として拒否する)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());

    const rawWithThreshold = JSON.parse(JSON.stringify(snapshot));
    rawWithThreshold.destructionConfig.d05.highCurrentPenalty = { kind: 'noPenalty', highCurrentPenaltyThresholdA: 999 };
    expect(restoreRunSnapshot(rawWithThreshold).ok).toBe(false);

    const rawWithMultiplier = JSON.parse(JSON.stringify(snapshot));
    rawWithMultiplier.destructionConfig.d05.highCurrentPenalty = { kind: 'noPenalty', highCurrentPenaltyMultiplier: 1 };
    expect(restoreRunSnapshot(rawWithMultiplier).ok).toBe(false);

    const rawWithBoth = JSON.parse(JSON.stringify(snapshot));
    rawWithBoth.destructionConfig.d05.highCurrentPenalty = { kind: 'noPenalty', highCurrentPenaltyThresholdA: 999, highCurrentPenaltyMultiplier: 1 };
    expect(restoreRunSnapshot(rawWithBoth).ok).toBe(false);
  });
});

describe('destructionOrchestration.ts: classifyTerminalModes(v12完全形、正式Fable P3-1-Q5(a)裁定)', () => {
  it('D02イベントは常に終端候補として分類される', () => {
    expect(classifyTerminalModes([motorEvent('D02')])).toEqual(['D02']);
  });

  it('D03イベントは常に終端候補として分類される', () => {
    expect(classifyTerminalModes([motorEvent('D03')])).toEqual(['D03']);
  });

  it('D04イベントはstage="burning"のときのみ終端候補として分類される(正例)', () => {
    expect(classifyTerminalModes([d04Event('burning')])).toEqual(['D04']);
  });

  it('D04イベントはstage="burning"以外(swelling等)では終端候補として分類されない(負例)', () => {
    expect(classifyTerminalModes([d04Event('swelling')])).toEqual([]);
  });

  it('D06イベントはisTotalLoss=trueのときのみ終端候補として分類される(正例)', () => {
    expect(classifyTerminalModes([d06Event(true)])).toEqual(['D06']);
  });

  it('D06イベントはisTotalLoss=falseでは終端候補として分類されない(負例)', () => {
    expect(classifyTerminalModes([d06Event(false)])).toEqual([]);
  });

  it('D09イベントは常に終端候補として分類される', () => {
    expect(classifyTerminalModes([d09Event()])).toEqual(['D09']);
  });

  it('D01イベントはいかなる場合も終端候補として分類されない(負例)', () => {
    expect(classifyTerminalModes([motorEvent('D01')])).toEqual([]);
  });

  it('D05イベントはいかなる場合も終端候補として分類されない(負例)', () => {
    expect(classifyTerminalModes([d05Event()])).toEqual([]);
  });

  it('D07イベントはいかなる場合も終端候補として分類されない(負例)', () => {
    expect(classifyTerminalModes([d07Event()])).toEqual([]);
  });

  it('複数イベントの混在配列は、各要素の分類結果を出現順のまま連結して返す', () => {
    expect(classifyTerminalModes([motorEvent('D01'), motorEvent('D02'), d04Event('swelling'), motorEvent('D03'), d06Event(true), d05Event()])).toEqual(['D02', 'D03', 'D06']);
  });

  it('空配列からは空配列を返す', () => {
    expect(classifyTerminalModes([])).toEqual([]);
  });
});

describe('destructionOrchestration.ts: createRunAccumulator(正式Fable P3-1-Q6(a)裁定、単一引数)', () => {
  it('destructionStateのbattery.profileはreplaySnapshot.destructionConfig.battery.profileから一意に導出される(nonLipo)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput({ destructionConfig: goodDestructionConfig('nonLipo') }));
    const accumulator = createRunAccumulator(snapshot);
    expect(accumulator.destructionState.battery.profile).toBe('nonLipo');
    expect(accumulator.events).toEqual([]);
    expect(accumulator.terminalModeCandidates).toEqual([]);
    expect(accumulator.replaySnapshot).toBe(snapshot);
  });

  it('destructionStateのbattery.profileはreplaySnapshot.destructionConfig.battery.profileから一意に導出される(lipo)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput({ destructionConfig: goodDestructionConfig('lipo') }));
    const accumulator = createRunAccumulator(snapshot);
    expect(accumulator.destructionState.battery.profile).toBe('lipo');
  });

  it('型テスト: 新シグネチャは第2引数(batteryProfile)を独立に指定できない(不一致状態が構築不能であることの型レベル確認)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    // @ts-expect-error createRunAccumulatorは単一引数(replaySnapshot)のみを受け取る。
    // 第2引数でbatteryProfileを独立指定するコードはもはや型上書けない(Q6(a)裁定の構造的保証)。
    createRunAccumulator(snapshot, 'nonLipo');
  });
});

describe('destructionOrchestration.ts: stepMotorWithDestruction(P3-1、D01は非終端・D03は終端)', () => {
  // P3-1-Q9(b確定): config・destructionConfigはaccumulator.replaySnapshot経由のみで供給する。
  // stepMotorWithDestruction自体はもはやconfig/destructionConfigを引数に取らない。
  function runAccumulatorFor(motorConfig: MotorConfig, destructionConfig: DestructionConfig): RunAccumulator {
    const snapshot = captureRunSnapshot(motorSnapshotInput({ motorConfig, destructionConfig }));
    return createRunAccumulator(snapshot);
  }

  it('D01(実物理、既存motorPhysicsV15.test.tsと同型のcoilCollapse条件): 発火しても非終端(termination===null)で、physicsSnapshotAtTが同一step内で一貫する', () => {
    const config: MotorConfig = goodMotorConfig({ varnished: false, brushPressure: 0.05, magnetDistanceMm: 5 });
    let motorState: SimState = { ...initialSimState(), omega: COIL_DEFORM_OMEGA * 3 };
    let accumulator = runAccumulatorFor(config, goodDestructionConfig('nonLipo'));
    let sawD01 = false;

    for (let i = 0; i < COIL_DEFORM_FRAMES + 60 && !sawD01; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull(); // D01は非終端。この構成でD03(短絡)条件は満たされない

      const d01Event = accumulator.events.find((e) => e.mode === 'D01');
      if (d01Event) {
        sawD01 = true;
        expect(d01Event.physicsSnapshotAtT.context).toBe('motor');
        if (d01Event.physicsSnapshotAtT.context === 'motor') {
          expect(d01Event.physicsSnapshotAtT.state).toEqual(result.physicsState); // 同一step内で一貫する(このstepで初めて発火したイベント)
        }
      }
    }
    expect(sawD01).toBe(true);
  });

  it('D03(実物理、短絡): 発火するとtermination!==null・endReason="destructionTerminal"・terminalModesに"D03"を含む', () => {
    const config: MotorConfig = goodMotorConfig({ slitWidthMm: 0 }); // 持続短絡
    let motorState: SimState = { ...initialSimState() };
    const destructionConfig = goodDestructionConfig('nonLipo', { shortCircuitDurationLimitS: 1 / 120 });
    let accumulator = runAccumulatorFor(config, destructionConfig);
    let termination: ReturnType<typeof stepMotorWithDestruction>['termination'] = null;

    for (let i = 0; i < 30 && termination === null; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }

    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    if (termination!.endReason === 'destructionTerminal') {
      expect(termination!.terminalModes).toContain('D03');
    }
    expect(accumulator.terminalModeCandidates).toContain('D03');
    expect(accumulator.events.some((e) => e.mode === 'D03')).toBe(true);
  });

  it('events・terminalModeCandidatesはstep間で単調に蓄積される(追記のみ、既存要素は変更されない)', () => {
    const config: MotorConfig = goodMotorConfig({ slitWidthMm: 0 });
    const destructionConfig = goodDestructionConfig('nonLipo', { shortCircuitDurationLimitS: 1 });
    let motorState: SimState = { ...initialSimState() };
    let accumulator = runAccumulatorFor(config, destructionConfig);

    const result1 = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
    motorState = result1.physicsState;
    const eventsAfterStep1 = result1.accumulator.events;
    accumulator = result1.accumulator;

    const result2 = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
    expect(result2.accumulator.events.slice(0, eventsAfterStep1.length)).toEqual(eventsAfterStep1); // 追記のみ
    expect(result2.accumulator.events.length).toBeGreaterThanOrEqual(eventsAfterStep1.length);
  });

  // 正式Fable補足裁定P3-1-Q9付帯条件(i): リプレイ等価テスト。「accumulator.replaySnapshotが
  // 唯一の入力である」ことを実挙動として固定する(v11 §2.2.1)。destructionConfigだけでなく
  // motorConfigもheld-short(slitWidthMm:0)に固定し、D03が実際に発火・終端することを比較前に
  // assertすることで、空走行同士の自明な一致でテストが通ってしまうことを防ぐ。
  it('同一のRunSnapshotから独立に2回run(createRunAccumulator→stepMotorWithDestruction連続呼び出し)を行うと、結果(events・destructionState・termination)が完全一致する(非自明な破壊経路で検証)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig: goodMotorConfig({ slitWidthMm: 0 }), // 持続短絡。通常値のままだとD03へ到達せず空走行同士の自明一致になる
      destructionConfig: goodDestructionConfig('nonLipo', { shortCircuitDurationLimitS: 1 / 120 }),
    }));

    function runOnce() {
      let accumulator = createRunAccumulator(snapshot);
      let motorState: SimState = initialSimState();
      let termination: ReturnType<typeof stepMotorWithDestruction>['termination'] = null;
      const rng = mulberry32(snapshot.seed); // RunSnapshot唯一出典の意図をrng生成の面でも固定する。各run独立に新規生成
      for (let i = 0; i < 30 && termination === null; i++) {
        const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120, rng);
        motorState = result.physicsState;
        accumulator = result.accumulator;
        termination = result.termination;
      }
      return { events: accumulator.events, destructionState: accumulator.destructionState, termination };
    }

    const runA = runOnce();
    const runB = runOnce();

    // 空走行同士の自明な一致を禁止する: D03が実際に発火し終端していることを先に確認する
    expect(runA.events.some((e) => e.mode === 'D03')).toBe(true);
    expect(runA.termination?.endReason).toBe('destructionTerminal');

    expect(runB.events).toEqual(runA.events);
    expect(runB.destructionState).toEqual(runA.destructionState);
    expect(runB.termination).toEqual(runA.termination);
  });

  // P3-2ゲート3: D04(短絡+暴走経路、motor-only)・D07(熱蓄積、motor-only)を実物理で発火させ、
  // physicsSnapshotAtTが同一step内で一貫することを検証する(計画v9 11.3節)。
  it('D04(実物理、短絡+暴走、motor-only): 発火するとtermination!==null・endReason="destructionTerminal"・terminalModesに"D04"を含み、physicsSnapshotAtTが同一step内で一貫する', () => {
    const config: MotorConfig = goodMotorConfig({ slitWidthMm: 0 }); // 持続短絡
    let motorState: SimState = { ...initialSimState() };
    // shortCircuitDurationLimitS/runawayHeatThreshold/stageDurationsを極小化し、短時間でswelling→smoking→burningへ到達させる。
    const destructionConfig = goodDestructionConfig('lipo', {}, {
      shortCircuitDurationLimitS: 1 / 120,
      runawayHeatThreshold: 0.01,
      stageDurations: { swellingS: 1 / 120, smokingS: 1 / 120 },
    });
    let accumulator = runAccumulatorFor(config, destructionConfig);
    let termination: ReturnType<typeof stepMotorWithDestruction>['termination'] = null;
    let sawD04 = false;

    for (let i = 0; i < 60 && termination === null; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;

      const d04Event = accumulator.events.find((e) => e.mode === 'D04');
      if (d04Event && !sawD04) {
        sawD04 = true;
        expect(d04Event.physicsSnapshotAtT.context).toBe('motor');
        if (d04Event.physicsSnapshotAtT.context === 'motor') {
          expect(d04Event.physicsSnapshotAtT.state).toEqual(result.physicsState); // 同一step内で一貫する
        }
      }
    }

    expect(sawD04).toBe(true);
    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    if (termination!.endReason === 'destructionTerminal') {
      expect(termination!.terminalModes).toContain('D04');
    }
  });

  it('D07(実物理、通電電流のI²R蓄積、motor-only): D07は終端候補に分類されない(termination===null)まま、eventのphysicsSnapshotAtTが同一step内で一貫する', () => {
    // shorted(slitWidthMm<=0)ではcurrentAが常に0になる(motorPhysics.tsのdeadZone/shorted分岐)
    // ため、D03/D04のような短絡経路ではD07の熱蓄積を検証できない。D07は通常通電時の電流I²Rで
    // 蓄積するモードであるため、theta/omegaを初期デッドゾーン外に設定し通常回転させる。
    const config: MotorConfig = goodMotorConfig();
    let motorState: SimState = { ...initialSimState(), theta: 0.01, omega: 50 };
    const destructionConfig: DestructionConfig = {
      ...goodDestructionConfig('lipo'), // shortCircuitDurationLimitS=2(既定)のままでよい: 短絡させないためD04も発火しない
      d07: {
        thermal: { conductionCoefficient: 1, dissipationCoefficient: 1e-6 }, // dissipationCoefficient=0はvalidateDestructionConfigの正の有限数契約に違反するため十分小さい正値を使う
        irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.05, reversibleDroopThreshold: 0.02, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 },
      },
    };
    let accumulator = runAccumulatorFor(config, destructionConfig);
    let sawD07 = false;

    for (let i = 0; i < 60 && !sawD07; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull(); // D07は終端候補に分類されない(classifyTerminalModes負例と整合)

      const d07Event = accumulator.events.find((e) => e.mode === 'D07');
      if (d07Event) {
        sawD07 = true;
        expect(d07Event.physicsSnapshotAtT.context).toBe('motor');
        if (d07Event.physicsSnapshotAtT.context === 'motor') {
          expect(d07Event.physicsSnapshotAtT.state).toEqual(result.physicsState); // 同一step内で一貫する
        }
      }
    }

    expect(sawD07).toBe(true);
  });
});

describe('destructionOrchestration.ts: composeEffectiveMotorConfig(P3-2ゲート4、v12 §3.2実効config合成、docs/phase3-p3-2-plan.md v11 §2.0)', () => {
  function lipoStateWithD04Stage(stage: 'none' | 'swelling' | 'smoking' | 'burning'): DestructionState {
    const base = createInitialDestructionState('lipo');
    if (base.battery.profile !== 'lipo') throw new Error('unreachable');
    return { ...base, battery: { profile: 'lipo', d04: { ...base.battery.d04, stage } } };
  }

  function stateWithD07(overrides: Partial<DestructionState['modes']['D07']>): DestructionState {
    const base = createInitialDestructionState('nonLipo');
    return { ...base, modes: { ...base.modes, D07: { ...base.modes.D07, ...overrides } } };
  }

  function stateWithD01(overrides: Partial<DestructionState['modes']['D01']>): DestructionState {
    const base = createInitialDestructionState('nonLipo');
    return { ...base, modes: { ...base.modes, D01: { ...base.modes.D01, ...overrides } } };
  }

  function stateWithD02(overrides: Partial<DestructionState['modes']['D02']>): DestructionState {
    const base = createInitialDestructionState('nonLipo');
    return { ...base, modes: { ...base.modes, D02: { ...base.modes.D02, ...overrides } } };
  }

  function stateWithD05(overrides: Partial<DestructionState['modes']['D05']>): DestructionState {
    const base = createInitialDestructionState('nonLipo');
    return { ...base, modes: { ...base.modes, D05: { ...base.modes.D05, ...overrides } } };
  }

  describe('D04分岐(内部抵抗悪化)', () => {
    it('stage="none"ではbatteryInternalResistanceRatioを変更しない(base維持)', () => {
      const base = goodMotorConfig({ batteryInternalResistanceRatio: 1.2 });
      const config = goodDestructionConfig('lipo');
      const effective = composeEffectiveMotorConfig(base, lipoStateWithD04Stage('none'), config);
      expect(effective).toEqual(base);
    });

    it('stage="swelling"ではbatteryInternalResistanceRatioにinternalResistanceDegradationMultiplierを乗算する', () => {
      const base = goodMotorConfig({ batteryInternalResistanceRatio: 1.2 });
      const config = goodDestructionConfig('lipo'); // internalResistanceDegradationMultiplier=1.5(既定)
      const effective = composeEffectiveMotorConfig(base, lipoStateWithD04Stage('swelling'), config);
      expect(effective.batteryInternalResistanceRatio).toBeCloseTo(1.2 * 1.5, 12);
      expect(effective.magnetStrength).toBe(base.magnetStrength); // D07非活性のため不変
    });

    it('stage="smoking"でも同一係数を乗算する(段階差を区別しない、正式Fable Q1裁定)', () => {
      const base = goodMotorConfig({ batteryInternalResistanceRatio: 1.2 });
      const config = goodDestructionConfig('lipo');
      const swelling = composeEffectiveMotorConfig(base, lipoStateWithD04Stage('swelling'), config);
      const smoking = composeEffectiveMotorConfig(base, lipoStateWithD04Stage('smoking'), config);
      expect(smoking.batteryInternalResistanceRatio).toBe(swelling.batteryInternalResistanceRatio);
    });

    it('stage="burning"ではbatteryInternalResistanceRatioを変更しない(swelling/smoking限定)', () => {
      const base = goodMotorConfig({ batteryInternalResistanceRatio: 1.2 });
      const config = goodDestructionConfig('lipo');
      const effective = composeEffectiveMotorConfig(base, lipoStateWithD04Stage('burning'), config);
      expect(effective.batteryInternalResistanceRatio).toBe(1.2);
    });

    it('battery.profile="nonLipo"(構造的排他)ではD04分岐自体が評価されずbase維持', () => {
      const base = goodMotorConfig({ batteryInternalResistanceRatio: 1.2 });
      const nonLipoState = createInitialDestructionState('nonLipo');
      const config = goodDestructionConfig('nonLipo');
      const effective = composeEffectiveMotorConfig(base, nonLipoState, config);
      expect(effective).toEqual(base);
    });
  });

  describe('D01分岐(実効巻数・占積率、正式Fable P3-3-Q4・Q5裁定、checkpoint4)', () => {
    it('decayExposureRad=0(未崩壊、初期値)ではeffectiveTurnsRatioを追加しない(base維持)', () => {
      const base = goodMotorConfig();
      const config = goodDestructionConfig('nonLipo'); // d01.minEffectiveTurnsRatio=0.5・decayExposureScaleRad=1000(既定)
      const effective = composeEffectiveMotorConfig(base, stateWithD01({ decayExposureRad: 0 }), config);
      expect(effective).toEqual(base);
    });

    it('decayExposureRad>0では1-decayExposureRad/decayExposureScaleRadをeffectiveTurnsRatioへ設定する', () => {
      const base = goodMotorConfig();
      const config = goodDestructionConfig('nonLipo'); // decayExposureScaleRad=1000
      const effective = composeEffectiveMotorConfig(base, stateWithD01({ decayExposureRad: 300, triggered: true }), config);
      expect(effective.effectiveTurnsRatio).toBeCloseTo(1 - 300 / 1000, 12);
      expect(effective.wireResistivityRatio).toBe(base.wireResistivityRatio); // D02非活性のため不変
    });

    it('decayExposureRadが極端に大きい場合、effectiveTurnsRatioはminEffectiveTurnsRatioで頭打ちになる(clamp DoD、5.3節)', () => {
      const base = goodMotorConfig();
      const config = goodDestructionConfig('nonLipo'); // minEffectiveTurnsRatio=0.5
      const effective = composeEffectiveMotorConfig(base, stateWithD01({ decayExposureRad: 999999, triggered: true }), config);
      expect(effective.effectiveTurnsRatio).toBe(0.5);
    });

    it('二重計上防止(必須DoD、5.3節): effectiveTurnsRatioの値がaxisOffsetMm系のいかなる計算にも混入しない(axisOffsetMmはbaseのまま不変)', () => {
      const base = goodMotorConfig({ axisOffsetMm: 3 });
      const config = goodDestructionConfig('nonLipo');
      const effective = composeEffectiveMotorConfig(base, stateWithD01({ decayExposureRad: 500, triggered: true }), config);
      expect(effective.axisOffsetMm).toBe(3);
    });
  });

  describe('D02分岐(発煙R_coil重ね掛け、正式Fable P3-3-Q1・Q2・Q8裁定、checkpoint4)', () => {
    it('smokingStarted=false(初期値)ではwireResistivityRatioを変更しない(base維持)', () => {
      const base = goodMotorConfig({ wireResistivityRatio: 1.1 });
      const config = goodDestructionConfig('nonLipo');
      const effective = composeEffectiveMotorConfig(base, stateWithD02({ smokingStarted: false }), config);
      expect(effective).toEqual(base);
    });

    it('smokingStarted=trueではwireResistivityRatioにsmokeResistanceMultiplierを乗算する', () => {
      const base = goodMotorConfig({ wireResistivityRatio: 1.1 });
      const config = goodDestructionConfig('nonLipo'); // smokeResistanceMultiplier=1.2(既定)
      const effective = composeEffectiveMotorConfig(base, stateWithD02({ smokingStarted: true, smokingStartedAtT: 1 }), config);
      expect(effective.wireResistivityRatio).toBeCloseTo(1.1 * 1.2, 12);
      expect(effective.magnetStrength).toBe(base.magnetStrength); // D07非活性のため不変
    });

    it('wireResistivityRatio未指定(base省略時の既定1.0)でもsmokingStarted=trueで正しく乗算される', () => {
      const base = goodMotorConfig();
      const config = goodDestructionConfig('nonLipo');
      const effective = composeEffectiveMotorConfig(base, stateWithD02({ smokingStarted: true, smokingStartedAtT: 1 }), config);
      expect(effective.wireResistivityRatio).toBeCloseTo(1 * 1.2, 12);
    });
  });

  describe('D05分岐(一時接触抵抗悪化、正式Fable P3-3-Q7裁定確定候補a、checkpoint4)', () => {
    it('recoveryFramesLeft=0(初期値・非アクティブ)ではbrushContactResistanceRatioを変更しない(base維持)', () => {
      const base = goodMotorConfig({ brushContactResistanceRatio: 1.1 });
      const config = goodDestructionConfig('nonLipo');
      const effective = composeEffectiveMotorConfig(base, stateWithD05({ recoveryFramesLeft: 0 }), config);
      expect(effective).toEqual(base);
    });

    it('recoveryFramesLeft>0ではbrushContactResistanceRatioにrecoveryContactResistanceMultiplierを乗算する', () => {
      const base = goodMotorConfig({ brushContactResistanceRatio: 1.1 });
      const config = goodDestructionConfig('nonLipo'); // recoveryContactResistanceMultiplier=1.2(既定)
      const effective = composeEffectiveMotorConfig(base, stateWithD05({ recoveryFramesLeft: 3 }), config);
      expect(effective.brushContactResistanceRatio).toBeCloseTo(1.1 * 1.2, 12);
      expect(effective.wireResistivityRatio).toBe(base.wireResistivityRatio); // D02非活性のため不変
    });
  });

  describe('D07分岐(磁力低下、可逆ダレ+不可逆減磁の重畳)', () => {
    it('reversibleDroopActiveのみtrueならmagnetStrengthにreversibleDroopMultiplierだけを乗算する', () => {
      const base = goodMotorConfig();
      const config = goodDestructionConfig(); // d07.irreversible.reversibleDroopMultiplier=0.95(既定)
      const effective = composeEffectiveMotorConfig(base, stateWithD07({ reversibleDroopActive: true, irreversibleTriggered: false }), config);
      expect(effective.magnetStrength).toBeCloseTo(base.magnetStrength * 0.95, 12);
    });

    it('irreversibleTriggeredのみtrueならmagnetStrengthに(1-demagnetizationDeltaFraction)だけを乗算する', () => {
      const base = goodMotorConfig();
      const config = goodDestructionConfig(); // demagnetizationDeltaFraction=0.1(既定)
      const effective = composeEffectiveMotorConfig(base, stateWithD07({ reversibleDroopActive: false, irreversibleTriggered: true }), config);
      expect(effective.magnetStrength).toBeCloseTo(base.magnetStrength * 0.9, 12);
    });

    it('reversibleDroopActive・irreversibleTriggeredが両方trueなら両係数が重畳適用される(不可逆到達後もダレは重畳する、正式Fable Q2・Q3裁定)', () => {
      const base = goodMotorConfig();
      const config = goodDestructionConfig();
      const effective = composeEffectiveMotorConfig(base, stateWithD07({ reversibleDroopActive: true, irreversibleTriggered: true }), config);
      expect(effective.magnetStrength).toBeCloseTo(base.magnetStrength * 0.95 * 0.9, 12);
    });

    it('reversibleDroopActive・irreversibleTriggeredが両方falseならmagnetStrengthを変更しない', () => {
      const base = goodMotorConfig();
      const config = goodDestructionConfig();
      const effective = composeEffectiveMotorConfig(base, stateWithD07({ reversibleDroopActive: false, irreversibleTriggered: false }), config);
      expect(effective.magnetStrength).toBe(base.magnetStrength);
    });

    it('irreversible.kind="nonDemagnetizing"ならstateの値によらずmagnetStrengthを変更しない', () => {
      const base = goodMotorConfig();
      const config: DestructionConfig = { ...goodDestructionConfig(), d07: { thermal: { conductionCoefficient: 0.1, dissipationCoefficient: 0.05 }, irreversible: { kind: 'nonDemagnetizing' } } };
      const effective = composeEffectiveMotorConfig(base, stateWithD07({ reversibleDroopActive: true, irreversibleTriggered: true }), config);
      expect(effective.magnetStrength).toBe(base.magnetStrength);
    });
  });

  it('合成順序に依存しない(乗算の可換性): D04+D07が同時に活性化しても、可逆×不可逆の適用順を入れ替えた独立計算と一致する', () => {
    const base = goodMotorConfig({ batteryInternalResistanceRatio: 1.2 });
    const config = goodDestructionConfig('lipo'); // internalResistanceDegradationMultiplier=1.5, reversibleDroopMultiplier=0.95, demagnetizationDeltaFraction=0.1
    const lipoState = lipoStateWithD04Stage('swelling');
    const state: DestructionState = { ...lipoState, modes: { ...lipoState.modes, D07: { ...lipoState.modes.D07, reversibleDroopActive: true, irreversibleTriggered: true } } };
    const effective = composeEffectiveMotorConfig(base, state, config);
    expect(effective.batteryInternalResistanceRatio).toBeCloseTo(1.2 * 1.5, 12);
    expect(effective.magnetStrength).toBeCloseTo(base.magnetStrength * 0.95 * 0.9, 12);
    // D07内部の可逆×不可逆の乗算順序を入れ替えても同じ値になる(可換性そのものの直接確認)
    const reorderedD07 = base.magnetStrength * 0.9 * 0.95;
    expect(effective.magnetStrength).toBe(reorderedD07);
  });

  it('決定論: 同一入力から常に同一出力を返す', () => {
    const base = goodMotorConfig({ batteryInternalResistanceRatio: 1.2 });
    const config = goodDestructionConfig('lipo');
    const lipoState = lipoStateWithD04Stage('swelling');
    const state: DestructionState = { ...lipoState, modes: { ...lipoState.modes, D07: { ...lipoState.modes.D07, reversibleDroopActive: true, irreversibleTriggered: true } } };
    const resultA = composeEffectiveMotorConfig(base, state, config);
    const resultB = composeEffectiveMotorConfig(base, state, config);
    expect(resultB).toEqual(resultA);
  });

  it('合成直交性テスト(必須DoD、checkpoint4、3.2節): D01(effectiveTurnsRatio)・D02(wireResistivityRatio)・D04(batteryInternalResistanceRatio)・D07(magnetStrength)の4分岐が同時に活性化しても、各baseフィールドは自分の担当分岐からのみ変更され、他分岐の入力を取り違えない', () => {
    const base = goodMotorConfig({ batteryInternalResistanceRatio: 1.2, wireResistivityRatio: 1.1 });
    const config = goodDestructionConfig('lipo'); // d01.decayExposureScaleRad=1000・minEffectiveTurnsRatio=0.5、d02.smokeResistanceMultiplier=1.2、internalResistanceDegradationMultiplier=1.5、reversibleDroopMultiplier=0.95、demagnetizationDeltaFraction=0.1(いずれも既定)
    const lipoState = lipoStateWithD04Stage('swelling');
    const state: DestructionState = {
      ...lipoState,
      modes: {
        ...lipoState.modes,
        D01: { ...lipoState.modes.D01, triggered: true, decayExposureRad: 300 },
        D02: { ...lipoState.modes.D02, smokingStarted: true, smokingStartedAtT: 1 },
        D07: { ...lipoState.modes.D07, reversibleDroopActive: true, irreversibleTriggered: true },
      },
    };
    const effective = composeEffectiveMotorConfig(base, state, config);

    // 各フィールドが「自分の担当分岐だけから」算出した独立計算結果と一致する(取り違えなし)
    expect(effective.effectiveTurnsRatio).toBeCloseTo(1 - 300 / 1000, 12); // D01のみから算出
    expect(effective.wireResistivityRatio).toBeCloseTo(1.1 * 1.2, 12); // D02のみから算出(D01のeffectiveTurnsRatioが混入していない)
    expect(effective.batteryInternalResistanceRatio).toBeCloseTo(1.2 * 1.5, 12); // D04のみから算出
    expect(effective.magnetStrength).toBeCloseTo(base.magnetStrength * 0.95 * 0.9, 12); // D07のみから算出
    // D05非活性(brushContactResistanceRatio)・axisOffsetMm(二重計上防止)はbaseのまま不変
    expect(effective.brushContactResistanceRatio).toBe(base.brushContactResistanceRatio);
    expect(effective.axisOffsetMm).toBe(base.axisOffsetMm);
  });

  it('予算不変性(付帯条件1): 合成前後でbatteryVoltage/batteryCapacityRatio自体が不変であり、computeEnergyBudgetJの値が実測52Jで一致する', () => {
    const base = goodMotorConfig({ batteryVoltage: 1.5, batteryCapacityRatio: 1.3, batteryInternalResistanceRatio: 1.2 });
    const config = goodDestructionConfig('lipo');
    const lipoState = lipoStateWithD04Stage('swelling');
    const state: DestructionState = { ...lipoState, modes: { ...lipoState.modes, D07: { ...lipoState.modes.D07, reversibleDroopActive: true, irreversibleTriggered: true } } };
    const effective = composeEffectiveMotorConfig(base, state, config);
    // 合成が実際にconfigを変えていることを先に確認する(空虚な一致を禁止)
    expect(effective).not.toEqual(base);
    // computeEnergyBudgetJが消費するフィールド自体が不変であることを直接固定する
    expect(effective.batteryVoltage).toBe(base.batteryVoltage);
    expect(effective.batteryCapacityRatio).toBe(base.batteryCapacityRatio);
    // BATTERY_CAPACITY_J_1_5V(40J、src/engine/constants.ts)×batteryCapacityRatio(1.3)=52Jを実測固定する
    expect(computeEnergyBudgetJ(base)).toBe(52);
    expect(computeEnergyBudgetJ(effective)).toBe(52);
  });

  it('予算不変性再実行(checkpoint4、必須DoD、5.4節): D01(effectiveTurnsRatio)・D02(wireResistivityRatio)分岐が同時に活性化していても、computeEnergyBudgetJの値は合成前後で一致する(D01/D02の合成対象フィールドはいずれもcomputeEnergyBudgetJの入力に含まれない)', () => {
    const base = goodMotorConfig({ batteryVoltage: 1.5, batteryCapacityRatio: 1.3, wireResistivityRatio: 1.1 });
    const config = goodDestructionConfig('nonLipo');
    const state: DestructionState = {
      ...createInitialDestructionState('nonLipo'),
      modes: {
        ...createInitialDestructionState('nonLipo').modes,
        D01: { ...createInitialDestructionState('nonLipo').modes.D01, triggered: true, decayExposureRad: 500 },
        D02: { ...createInitialDestructionState('nonLipo').modes.D02, smokingStarted: true, smokingStartedAtT: 1 },
      },
    };
    const effective = composeEffectiveMotorConfig(base, state, config);
    // 合成が実際にeffectiveTurnsRatio/wireResistivityRatioを変えていることを先に確認する
    expect(effective.effectiveTurnsRatio).not.toBe(base.effectiveTurnsRatio);
    expect(effective.wireResistivityRatio).not.toBe(base.wireResistivityRatio);
    expect(computeEnergyBudgetJ(base)).toBe(computeEnergyBudgetJ(effective));
  });
});

describe('destructionOrchestration.ts: stepMotorWithDestruction(P3-3ゲート3、D02/D05実物理境界DoD)', () => {
  function runAccumulatorFor(motorConfig: MotorConfig, destructionConfig: DestructionConfig): RunAccumulator {
    const snapshot = captureRunSnapshot(motorSnapshotInput({ motorConfig, destructionConfig }));
    return createRunAccumulator(snapshot);
  }

  it('4.2節必須DoD: isChatteringThisFrame(prev.chatterFramesLeft>0||next.chatterFramesLeft>0)は実物理のCHATTER_BURST_FRAMES境界(バースト最終フレームprev===1→next===0を含む)を正しく判定する(step()公開API経由の実物理)', () => {
    // brushPressure=0(<CHATTER_PRESSURE_THRESHOLD)でチャタリング確率prob>0にし、rngの最初の
    // 呼び出しだけ0(必ずトリガー)、以後は1(再トリガーしない)を返すことで単一の24フレーム
    // バースト(CHATTER_BURST_FRAMES=24)を決定論的に作る。buildXxxFrameInputの内部関数自体は
    // 非公開のため、その式(prev.chatterFramesLeft>0||next.chatterFramesLeft>0、
    // destructionOrchestration.tsのbuildMotorOnlyFrameInput/buildVehicleFrameInputに実装済み)を
    // 本テストでも同一に適用し、step()の実出力に対して直接検証する——current/dead zone等
    // D05側の物理に一切依存しない、信号そのものの正しさの検証。
    let rngCallCount = 0;
    const rng = () => (rngCallCount++ === 0 ? 0 : 1);
    const config = goodMotorConfig({ brushPressure: 0 });

    let state: SimState = initialSimState();
    const isChatteringPerFrame: boolean[] = [];
    for (let i = 0; i < CHATTER_BURST_FRAMES + 1; i++) {
      const next = step(config, state, 1 / 120, rng);
      isChatteringPerFrame.push(state.chatterFramesLeft > 0 || next.chatterFramesLeft > 0);
      state = next;
    }

    // 最初のCHATTER_BURST_FRAMES(24)フレームすべてがtrue(最終フレームprev=1→next=0を含む)
    expect(isChatteringPerFrame.slice(0, CHATTER_BURST_FRAMES)).toEqual(new Array(CHATTER_BURST_FRAMES).fill(true));
    // バースト終了翌フレームではfalseに戻る(新規バーストがrng=1により再トリガーされない)
    expect(isChatteringPerFrame[CHATTER_BURST_FRAMES]).toBe(false);
  });

  it('C5負例(10節・12.4節): D02が発煙(smokingStarted=true)するが焼損(coilOverheatGaugeLimit)には未到達の入力では、D02 eventが発行されずterminalModeCandidatesも増えない', () => {
    const motorConfig = goodMotorConfig();
    // smokeGaugeThresholdへは到達するがcoilOverheatGaugeLimitには遠く届かない値域にする。
    const destructionConfig = goodDestructionConfig('nonLipo');
    const config: DestructionConfig = { ...destructionConfig, d02: { smokeGaugeThreshold: 0.001, coilOverheatGaugeLimit: 1, conductionScale: 0.05, dissipationCoefficient: 0.01, smokeResistanceMultiplier: 1.2 } };
    let motorState: SimState = { ...initialSimState(), theta: Math.PI / 4 };
    let accumulator = runAccumulatorFor(motorConfig, config);

    for (let i = 0; i < 10; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
      motorState = result.physicsState;
      accumulator = result.accumulator;
    }
    expect(accumulator.destructionState.modes.D02.smokingStarted).toBe(true); // 発煙自体はしている
    expect(accumulator.destructionState.modes.D02.triggered).toBe(false); // しかし焼損には未到達
    expect(accumulator.events.filter((e) => e.mode === 'D02')).toHaveLength(0);
    expect(accumulator.terminalModeCandidates).toEqual([]);
  });
});

describe('destructionOrchestration.ts: stepMotorWithDestruction(P3-2ゲート4、composeEffectiveMotorConfig配線後の既存回帰・非自明経路リプレイ等価性)', () => {
  function runAccumulatorFor(motorConfig: MotorConfig, destructionConfig: DestructionConfig): RunAccumulator {
    const snapshot = captureRunSnapshot(motorSnapshotInput({ motorConfig, destructionConfig }));
    return createRunAccumulator(snapshot);
  }

  it('P3-1既存回帰: D04/D07がいずれも初期値のまま(未活性)の1step目では、composeEffectiveMotorConfigはbaseConfigをそのまま返すため、physicsStateは直接step()を呼んだ場合と完全一致する', () => {
    const config: MotorConfig = goodMotorConfig({ varnished: false, brushPressure: 0.05, magnetDistanceMm: 5 });
    const motorState: SimState = { ...initialSimState(), omega: COIL_DEFORM_OMEGA * 3 };
    const accumulator = runAccumulatorFor(config, goodDestructionConfig('nonLipo'));
    // omega=COIL_DEFORM_OMEGA*3はコイル変形(チャタリング、rng消費)を誘発する構成のため、
    // rngを明示的に固定しないとwrapped/directが独立にMath.random()を消費し非決定的に食い違う。
    const wrapped = stepMotorWithDestruction(motorState, accumulator, 1 / 120, mulberry32(1));
    const direct = step(config, motorState, 1 / 120, mulberry32(1));
    expect(wrapped.physicsState).toEqual(direct);
  });

  // P3-2ゲート4レビュー是正(Suu_mot3、2026-08-08): 上記回帰テストはD04/D07未活性のため
  // base===effectiveとなり、wrapperがeffective configを実際にstep/frameへ渡す配線自体を
  // 機械固定できていなかった。以下2件は、production-validなcompose分岐活性状態を直接
  // fixtureとしてseedし(実走行での到達を待たず、交差不変条件を満たす状態を直接構築する)、
  // shortedではない(電流が実際に流れ内部抵抗・磁力の変更が物理へ効く)motorState/configを
  // 用いて、wrapperの出力がbase configではなくeffective configに基づくことを直接固定する。
  it('D04活性時(swelling)のwrapper配線: physicsStateがeffective configによるstep()結果と一致し、baseによる結果とは一致しないことを直接固定する(shortedではない実物理経路)', () => {
    const baseConfig = goodMotorConfig({ magnetDistanceMm: 8 }); // shortedにならない通常構成
    const destructionConfig = goodDestructionConfig('lipo'); // internalResistanceDegradationMultiplier=1.5(既定)
    // デッドゾーン外・通電状態(実測: computeElectricalState(baseConfig,1.2,80).current≈0.714、
    // batteryInternalResistanceRatio=1.5適用後は≈0.666と明確に異なる、chatter/collapseなし)。
    const motorState: SimState = { ...initialSimState(), theta: 1.2, omega: 80 };
    const snapshot = captureRunSnapshot(motorSnapshotInput({ motorConfig: baseConfig, destructionConfig }));
    let accumulator = createRunAccumulator(snapshot);
    // production-validなlipo swelling状態を直接seedする(交差不変条件: stage!=='none' ⟹
    // initiatingCauseLog非null、triggered=false ⟹ stage!=='burning'。いずれも満たす)。
    accumulator = {
      ...accumulator,
      destructionState: {
        ...accumulator.destructionState,
        battery: {
          profile: 'lipo',
          d04: {
            triggered: false, triggeredAtT: null, stage: 'swelling', stageEnteredAtT: 0,
            overDischargeActive: false,
            initiatingCauseLog: { shortCircuitDurationS: 0, overDischargeRatio: null },
            causeLog: null,
          },
        },
      },
    };

    const effective = composeEffectiveMotorConfig(baseConfig, accumulator.destructionState, destructionConfig);
    expect(effective.batteryInternalResistanceRatio).toBeCloseTo((baseConfig.batteryInternalResistanceRatio ?? 1) * 1.5, 12); // 前提確認

    const wrapped = stepMotorWithDestruction(motorState, accumulator, 1 / 120, mulberry32(1));
    const expectedFromEffective = step(effective, motorState, 1 / 120, mulberry32(1));
    const expectedFromBase = step(baseConfig, motorState, 1 / 120, mulberry32(1));
    expect(expectedFromEffective).not.toEqual(expectedFromBase); // 前提確認: 内部抵抗変更が実際に物理へ効く構成であること

    expect(wrapped.physicsState).toEqual(expectedFromEffective);
    expect(wrapped.physicsState).not.toEqual(expectedFromBase);

    // buildMotorOnlyFrameInputも同一のeffective configを使ったことを、D07熱ゲージ増分
    // (公開computeElectricalStateの電流とdestructionConfig.d07の正式I²R式による1step期待値)で
    // 独立に確認する(private helperの式を複製せず、公開関数+正式契約式のみを用いる)。
    const dt = 1 / 120;
    const currentFromEffective = computeElectricalState(effective, motorState.theta, motorState.omega).current;
    const currentFromBase = computeElectricalState(baseConfig, motorState.theta, motorState.omega).current;
    expect(currentFromEffective).not.toBe(currentFromBase); // 前提確認
    const { conductionCoefficient } = destructionConfig.d07.thermal; // prevGauge=0のためdissipation項は寄与しない(初期state)
    const expectedGaugeFromEffective = Math.min(1, Math.max(0, currentFromEffective ** 2 * conductionCoefficient * dt));
    const expectedGaugeFromBase = Math.min(1, Math.max(0, currentFromBase ** 2 * conductionCoefficient * dt));
    expect(wrapped.accumulator.destructionState.modes.D07.magnetHeatGaugeRatio).toBeCloseTo(expectedGaugeFromEffective, 12);
    expect(wrapped.accumulator.destructionState.modes.D07.magnetHeatGaugeRatio).not.toBeCloseTo(expectedGaugeFromBase, 6);
  });

  it('D07活性時(可逆ダレ+不可逆減磁)のwrapper配線: physicsStateがeffective configによるstep()結果と一致し、baseによる結果とは一致しないことを直接固定する(shortedではない実物理経路)', () => {
    const baseConfig = goodMotorConfig({ magnetDistanceMm: 8 });
    const destructionConfig = goodDestructionConfig(); // reversibleDroopMultiplier=0.95・demagnetizationDeltaFraction=0.1(既定)
    const motorState: SimState = { ...initialSimState(), theta: 1.2, omega: 80 };
    const snapshot = captureRunSnapshot(motorSnapshotInput({ motorConfig: baseConfig, destructionConfig }));
    let accumulator = createRunAccumulator(snapshot);
    // production-validなD07 state(reversibleDroopActive・irreversibleTriggeredともにtrue)を直接seedする。
    accumulator = {
      ...accumulator,
      destructionState: {
        ...accumulator.destructionState,
        modes: {
          ...accumulator.destructionState.modes,
          D07: {
            magnetHeatGaugeRatio: 0.9, reversibleDroopActive: true, irreversibleTriggered: true, irreversibleTriggeredAtT: 0,
            causeLog: { currentA: 1, rpm: 100, atT: 0, temperature: { kind: 'uncalibratedGauge', ratio: 0.9 }, magnetHeatGaugeRatio: 0.9 },
          },
        },
      },
    };

    const effective = composeEffectiveMotorConfig(baseConfig, accumulator.destructionState, destructionConfig);
    expect(effective.magnetStrength).toBeCloseTo(baseConfig.magnetStrength * 0.95 * 0.9, 12); // 前提確認: 磁力低下が実際に合成されていること

    const wrapped = stepMotorWithDestruction(motorState, accumulator, 1 / 120, mulberry32(1));
    const expectedFromEffective = step(effective, motorState, 1 / 120, mulberry32(1));
    const expectedFromBase = step(baseConfig, motorState, 1 / 120, mulberry32(1));
    expect(expectedFromEffective).not.toEqual(expectedFromBase); // 前提確認: 磁力低下が実際に物理へ効く構成であること

    expect(wrapped.physicsState).toEqual(expectedFromEffective);
    expect(wrapped.physicsState).not.toEqual(expectedFromBase);
  });

  // 注意(正確な役割の限定、Suu_mot3 2026-08-08指摘): このテストはheld-short(slitWidthMm=0)
  // 経路で「compose分岐(D04 stage='none'→'swelling')が実際に活性化する状態への到達」の
  // 決定論(2回runの完全一致)のみを検証する。held-short経路はcurrentA=0(motorPhysics.tsの
  // deadZone/shorted分岐)であり、batteryInternalResistanceRatioの変更は電流=0×抵抗という
  // 式の性質上、物理結果(physicsState)へは影響しない。「内部抵抗変更が物理結果へ実際に効く」
  // ことの検証は、上記の実物理wrapper配線テスト(D04活性時・D07活性時、非shorted構成)が別途
  // 直接固定する。
  it('held-short(非自明経路、D04がswellingへ到達する決定論): 同一RunSnapshotから独立2回runした結果(events・destructionState・termination)が完全一致する(compose分岐活性化状態への到達自体の決定論を検証。内部抵抗変更の物理影響は別テストで検証)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig: goodMotorConfig({ slitWidthMm: 0 }), // 持続短絡
      destructionConfig: goodDestructionConfig('lipo', {}, {
        shortCircuitDurationLimitS: 1 / 120,
        runawayHeatThreshold: 0.01,
        stageDurations: { swellingS: 1, smokingS: 1 }, // 30step(0.25秒)の走行時間内はswellingに留まる
      }),
    }));

    function runOnce() {
      let accumulator = createRunAccumulator(snapshot);
      let motorState: SimState = initialSimState();
      let termination: ReturnType<typeof stepMotorWithDestruction>['termination'] = null;
      const rng = mulberry32(snapshot.seed); // RunSnapshot唯一出典の意図をrng生成の面でも固定する。各run独立に新規生成
      for (let i = 0; i < 30 && termination === null; i++) {
        const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120, rng);
        motorState = result.physicsState;
        accumulator = result.accumulator;
        termination = result.termination;
      }
      return { events: accumulator.events, destructionState: accumulator.destructionState, termination };
    }

    const runA = runOnce();
    const runB = runOnce();

    // 空虚な一致を禁止する: D04が実際にswellingへ到達し(compose分岐の条件式自体は
    // 活性化する状態に達したこと)を先に確認する。held-shortはcurrentA=0の経路のため、
    // この到達がbatteryInternalResistanceRatioの物理的な効果まで検証するものではない
    // (物理的な効果は別テストで直接固定する、上記コメント参照)。
    expect(runA.destructionState.battery.profile).toBe('lipo');
    if (runA.destructionState.battery.profile === 'lipo') {
      expect(runA.destructionState.battery.d04.stage).not.toBe('none');
    }

    expect(runB.events).toEqual(runA.events);
    expect(runB.destructionState).toEqual(runA.destructionState);
    expect(runB.termination).toEqual(runA.termination);
  });
});

// 正式Fable補足裁定(P3-2ゲート5 Q13-1、2026-08-09、人間再承認済み2026-08-09T06:20)。
// docs/phase3-p3-2-plan.md 14.2節(v15)の同一step境界4ケースを直接テストする。
describe('normalizeOverheatedStatusForD04Hold(overheated保留規則、P3-2ゲート5 Q13-1)', () => {
  function lipoDestructionStateWithStage(stage: 'none' | 'swelling' | 'smoking' | 'burning'): DestructionState {
    const base = createInitialDestructionState('lipo');
    if (base.battery.profile !== 'lipo') throw new Error('テスト前提が崩れています');
    return { ...base, battery: { ...base.battery, d04: { ...base.battery.d04, stage } } };
  }

  function nonLipoDestructionState(): DestructionState {
    return createInitialDestructionState('nonLipo');
  }

  function overheatedVehicleState(): VehicleSimState {
    return { ...createInitialVehicleState(goodMotorConfig(), standardCarConfig()), status: 'overheated' };
  }

  // ケース(a): lipo・stage∈{swelling,smoking} → statusをrunningへ書き換える(保留発動)。
  it('ケース(a): lipo・stage=swellingではoverheatedをrunningへ正規化する', () => {
    const state = overheatedVehicleState();
    const destructionState = lipoDestructionStateWithStage('swelling');
    const result = normalizeOverheatedStatusForD04Hold(state, destructionState);
    expect(result.status).toBe('running');
    // 入力非破壊: statusを除く全フィールドは不変(batteryHeat等の物理量を書き換えない)。
    expect({ ...result, status: state.status }).toEqual(state);
  });

  it('ケース(a): lipo・stage=smokingでもoverheatedをrunningへ正規化する', () => {
    const state = overheatedVehicleState();
    const destructionState = lipoDestructionStateWithStage('smoking');
    const result = normalizeOverheatedStatusForD04Hold(state, destructionState);
    expect(result.status).toBe('running');
    expect({ ...result, status: state.status }).toEqual(state);
  });

  // ケース(b): lipo・stage=burning → 正規化しない(素通し、destructionTerminal優先)。
  it('ケース(b): lipo・stage=burningでは正規化しない(素通し)', () => {
    const state = overheatedVehicleState();
    const destructionState = lipoDestructionStateWithStage('burning');
    const result = normalizeOverheatedStatusForD04Hold(state, destructionState);
    expect(result.status).toBe('overheated');
    expect(result).toBe(state); // 参照そのものを返す(コピーすら発生しない)
  });

  // ケース(c): nonLipo → 正規化しない(素通し、D03の既存同一frame優先規則は不変)。
  it('ケース(c): nonLipoでは正規化しない(素通し)', () => {
    const state = overheatedVehicleState();
    const destructionState = nonLipoDestructionState();
    const result = normalizeOverheatedStatusForD04Hold(state, destructionState);
    expect(result.status).toBe('overheated');
    expect(result).toBe(state);
  });

  // ケース(d): lipoだがstage=none(D04未発動) → 正規化しない(素通し、既存終端挙動は不変)。
  it('ケース(d): lipo・stage=noneでは正規化しない(素通し)', () => {
    const state = overheatedVehicleState();
    const destructionState = lipoDestructionStateWithStage('none');
    const result = normalizeOverheatedStatusForD04Hold(state, destructionState);
    expect(result.status).toBe('overheated');
    expect(result).toBe(state);
  });

  // ケース(d)続き: finished/stalled/derailed等、status自体がoverheatedでない終端は無関係
  // (D04 stageに関わらず一切変更しない)。
  it.each(['finished', 'stalled', 'derailed', 'running', 'ready'] as const)(
    'status===%sの場合、lipo・stage=swellingであっても正規化しない(overheated以外は対象外)',
    (status) => {
      const state: VehicleSimState = { ...createInitialVehicleState(goodMotorConfig(), standardCarConfig()), status };
      const destructionState = lipoDestructionStateWithStage('swelling');
      const result = normalizeOverheatedStatusForD04Hold(state, destructionState);
      expect(result.status).toBe(status);
      expect(result).toBe(state);
    },
  );

  it('入力非破壊: 正規化が発生しても元のstateオブジェクト自体は変更されない', () => {
    const state = overheatedVehicleState();
    const snapshotBefore = { ...state };
    const destructionState = lipoDestructionStateWithStage('swelling');
    normalizeOverheatedStatusForD04Hold(state, destructionState);
    expect(state).toEqual(snapshotBefore); // 呼び出し後も元オブジェクトは無変化
    expect(state.status).toBe('overheated'); // 特にstatusフィールド自体が書き換わっていないこと
  });
});

// P3-2ゲート6(docs/phase3-p3-2-plan.md v17 §5.1、正式Fable Q8裁定)。
// 正式Fable Q8裁定「到達可能6種(running/finished/stalled/overheated/destructionTerminal/
// manualAbort)の正例テストで足りる」に従い、derailed/energyExhaustedの長時間不在テストは
// 実装しない(5.1節の実コード根拠の引用で充足済み——stepTestRunはtrackInputsを渡さないため
// hasCurveが常にfalseでderailedは構造的に不可能、energyExhaustedはstepTrackRun内部のみで
// 判定されstepTestRunは経由しない)。
describe('destructionOrchestration.ts: stepTestRunWithDestruction(P3-2ゲート6、test-run文脈ラッパー)', () => {
  function runVehicleAccumulatorFor(
    motorConfig: MotorConfig, destructionConfig: DestructionConfig, overrides: Partial<CaptureRunSnapshotInput> = {},
  ): RunAccumulator {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({ motorConfig, destructionConfig, ...overrides }));
    return createRunAccumulator(snapshot);
  }

  it('running: 通常構成では1step後もstatus="running"のままtermination===null', () => {
    const motorConfig = goodMotorConfig();
    let accumulator = runVehicleAccumulatorFor(motorConfig, goodDestructionConfig('nonLipo'));
    let vehicleState = accumulator.replaySnapshot.initialVehicleState!;
    const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
    expect(result.termination).toBeNull();
    expect(result.physicsState.status).toBe('running');
  });

  it('finished: courseLengthMを極小値にすると、evaluateCourseCompletion経由でstatus="finished"になる(termination===null、destructionTerminalではない)', () => {
    const motorConfig = goodMotorConfig();
    let accumulator = runVehicleAccumulatorFor(motorConfig, goodDestructionConfig('nonLipo'), { courseLengthM: 1e-6 });
    let vehicleState = accumulator.replaySnapshot.initialVehicleState!;
    let sawFinished = false;
    for (let i = 0; i < 30 && !sawFinished; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull(); // finishedはdestruction eventではないためtermination非発生
      if (vehicleState.status === 'finished') sawFinished = true;
    }
    expect(sawFinished).toBe(true);
  });

  it('stalled(実物理、既存vehiclePhysics.test.tsと同型の起動不能構成): status="stalled"・failureCode="failureToStart"になる(termination===null)', () => {
    // vehiclePhysics.test.tsの「起動不能」再現構成と同型(磁力弱・巻数少・ヤスリ弱で起動トルク不足)
    const motorConfig = goodMotorConfig({ magnetDistanceMm: 2, coilTurns: 10, magnetStrength: 1.0, brushPressure: 0.5, sandingQuality: 0.1 });
    let accumulator = runVehicleAccumulatorFor(motorConfig, goodDestructionConfig('nonLipo'));
    let vehicleState = accumulator.replaySnapshot.initialVehicleState!;
    const rng = mulberry32(11);
    let sawStalled = false;
    for (let i = 0; i < 120 * 5 && !sawStalled; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120, rng);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull();
      if (vehicleState.status === 'stalled') sawStalled = true;
    }
    expect(sawStalled).toBe(true);
    expect(vehicleState.failureCode).toBe('failureToStart');
  });

  it('overheated(実物理、held-short+shortCircuitDurationLimitSを到達不能に設定してD03と分離): status="overheated"になる(termination===null、destructionTerminalではない)', () => {
    // shortCircuitDurationLimitS:999によりD03の時間条件を到達不能にし、batteryHeatが
    // BATTERY_HEAT_LIMITへ到達する物理現象(overheated)だけを、D03発火から分離して観測する。
    const motorConfig = goodMotorConfig({ slitWidthMm: 0 }); // held-short
    const destructionConfig = goodDestructionConfig('nonLipo', { shortCircuitDurationLimitS: 999 });
    let accumulator = runVehicleAccumulatorFor(motorConfig, destructionConfig);
    let vehicleState = accumulator.replaySnapshot.initialVehicleState!;
    let sawOverheated = false;
    for (let i = 0; i < 60 && !sawOverheated; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull(); // D03の時間条件が到達不能なためdestructionTerminalは発生しない
      if (vehicleState.status === 'overheated') sawOverheated = true;
    }
    expect(sawOverheated).toBe(true);
    expect(accumulator.events.some((e) => e.mode === 'D03')).toBe(false); // D03は発火していないことを確認(空虚な一致の禁止)
  });

  it('destructionTerminal(実物理、held-short+短いshortCircuitDurationLimitS): D03が発火しtermination.endReason="destructionTerminal"・terminalModesに"D03"を含む', () => {
    const motorConfig = goodMotorConfig({ slitWidthMm: 0 }); // held-short
    const destructionConfig = goodDestructionConfig('nonLipo', { shortCircuitDurationLimitS: 1 / 120 });
    let accumulator = runVehicleAccumulatorFor(motorConfig, destructionConfig);
    let vehicleState = accumulator.replaySnapshot.initialVehicleState!;
    let termination: ReturnType<typeof stepTestRunWithDestruction>['termination'] = null;
    for (let i = 0; i < 30 && termination === null; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    if (termination!.endReason === 'destructionTerminal') {
      expect(termination!.terminalModes).toContain('D03');
    }
    expect(accumulator.events.some((e) => e.mode === 'D03')).toBe(true);
  });

  it('manualAbort: 呼び出し側がループを止めてfinalizeRun(accumulator, {kind:"manualAbort"})を呼ぶと、endReason="manualAbort"のRunOutcomeが得られる', () => {
    const motorConfig = goodMotorConfig();
    let accumulator = runVehicleAccumulatorFor(motorConfig, goodDestructionConfig('nonLipo'));
    let vehicleState = accumulator.replaySnapshot.initialVehicleState!;
    const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
    vehicleState = result.physicsState;
    accumulator = result.accumulator;
    expect(result.termination).toBeNull(); // 途中で呼び出し側が能動的に打ち切る想定(destructionTerminalではない)

    const outcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(outcome.endReason).toBe('manualAbort');
    expect(outcome.replaySnapshot).toBe(accumulator.replaySnapshot);
  });

  // 必須是正P2(Suu_mot3レビュー、2026-08-09、計画10.4節・M-2是正): RunSnapshot.slopeRadが
  // stepTestRunの7番目の引数として実際に消費されることを、restoreでの値保持テストだけでなく
  // 物理結果への実効果として直接検証する。「死にフィールド」でないことの証明。
  it('slopeRad配線(M-2是正、DoD10.4節): stepTestRunWithDestructionはslopeRadを実際にstepTestRunの7番目の引数へ渡す(slopeRad=0の対照と物理結果が異なることを先に確認し、空虚な一致を禁止する)', () => {
    const motorConfig = goodMotorConfig();
    const destructionConfig = goodDestructionConfig('nonLipo');
    const nonZeroSlopeRad = 0.3;

    function runOneStep(slopeRad: number) {
      const accumulator = runVehicleAccumulatorFor(motorConfig, destructionConfig, { slopeRad });
      const vehicleState = accumulator.replaySnapshot.initialVehicleState!;
      const rng = mulberry32(1);
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120, rng);
      return { result, accumulator, vehicleState };
    }

    const nonZero = runOneStep(nonZeroSlopeRad);
    const zero = runOneStep(0);

    // 空虚な一致を禁止する: slopeRadが実際に物理結果へ影響することを先に確認する。
    expect(nonZero.result.physicsState).not.toEqual(zero.result.physicsState);

    // wrapperの出力が、同一入力・同一rngで直接stepTestRunをslopeRad付きで呼んだ場合の
    // 期待stateと一致することを確認する(死にフィールドでないことの直接証明)。
    const effectiveConfig = composeEffectiveMotorConfig(
      nonZero.accumulator.replaySnapshot.motorConfig,
      nonZero.accumulator.destructionState,
      nonZero.accumulator.replaySnapshot.destructionConfig,
    );
    const expectedPhysicsState = stepTestRun(
      effectiveConfig,
      nonZero.accumulator.replaySnapshot.carConfig!,
      nonZero.vehicleState,
      1 / 120,
      nonZero.accumulator.replaySnapshot.courseLengthM!,
      mulberry32(1),
      nonZeroSlopeRad,
    );
    expect(nonZero.result.physicsState).toEqual(expectedPhysicsState);
  });

  it('events・terminalModeCandidatesはstep間で単調に蓄積される(stepMotorWithDestructionと同型の契約)', () => {
    const motorConfig = goodMotorConfig({ slitWidthMm: 0 });
    const destructionConfig = goodDestructionConfig('nonLipo', { shortCircuitDurationLimitS: 1 });
    let accumulator = runVehicleAccumulatorFor(motorConfig, destructionConfig);
    let vehicleState = accumulator.replaySnapshot.initialVehicleState!;

    const result1 = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
    vehicleState = result1.physicsState;
    const eventsAfterStep1 = result1.accumulator.events;
    accumulator = result1.accumulator;

    const result2 = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
    expect(result2.accumulator.events.slice(0, eventsAfterStep1.length)).toEqual(eventsAfterStep1);
    expect(result2.accumulator.events.length).toBeGreaterThanOrEqual(eventsAfterStep1.length);
  });

  // 正式Fable P3-1-Q9付帯条件(i)のvehicle版リプレイ等価テスト。
  it('同一のRunSnapshotから独立に2回run(createRunAccumulator→stepTestRunWithDestruction連続呼び出し)を行うと、結果(events・destructionState・termination)が完全一致する(非自明な破壊経路で検証)', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: goodMotorConfig({ slitWidthMm: 0 }),
      destructionConfig: goodDestructionConfig('nonLipo', { shortCircuitDurationLimitS: 1 / 120 }),
    }));

    function runOnce() {
      let accumulator = createRunAccumulator(snapshot);
      let vehicleState = snapshot.initialVehicleState!;
      let termination: ReturnType<typeof stepTestRunWithDestruction>['termination'] = null;
      const rng = mulberry32(snapshot.seed);
      for (let i = 0; i < 30 && termination === null; i++) {
        const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120, rng);
        vehicleState = result.physicsState;
        accumulator = result.accumulator;
        termination = result.termination;
      }
      return { events: accumulator.events, destructionState: accumulator.destructionState, termination };
    }

    const runA = runOnce();
    const runB = runOnce();

    expect(runA.events.some((e) => e.mode === 'D03')).toBe(true); // 空虚な一致の禁止
    expect(runB.events).toEqual(runA.events);
    expect(runB.destructionState).toEqual(runA.destructionState);
    expect(runB.termination).toEqual(runA.termination);
  });

  // 必須是正P3(Suu_mot3レビュー、2026-08-09): P1是正後、実stepTestRunWithDestruction経路で
  // overheated保留規則(Q13-1)が実際に守られることを固定する。D03リプレイ等価(上記)は
  // 保留を一切通らないためQ13の代替証跡にはならない——lipo held-shortでswelling/smoking
  // 進行中は保留が発動し、burningでdestructionTerminalへ到達する非自明な経路が必要。
  function lipoHeldShortSnapshot() {
    return captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: goodMotorConfig({ slitWidthMm: 0 }), // held-short
      destructionConfig: goodDestructionConfig('lipo', {}, {
        shortCircuitDurationLimitS: 1 / 120, runawayHeatThreshold: 0.01,
        stageDurations: { swellingS: 20 / 120, smokingS: 20 / 120 }, // batteryHeatがBATTERY_HEAT_LIMIT(1.0)へ実際に到達するまでの十分な段階時間(schema-valid test-only値、production較正値ではない)
      }),
    }));
  }

  it('Q13保留込み正例: lipo held-shortでswelling/smoking進行中はstatus="running"のまま保留され(batteryHeatはBATTERY_HEAT_LIMIT以上でも)、burningでdestructionTerminal・D04へ到達する', () => {
    const snapshot = lipoHeldShortSnapshot();
    let accumulator = createRunAccumulator(snapshot);
    let vehicleState = snapshot.initialVehicleState!;
    let termination: ReturnType<typeof stepTestRunWithDestruction>['termination'] = null;
    let firstSwellingStep: number | null = null;
    let heldWhileSwellingOrSmoking = false; // post適用の証跡(none→swelling同一step境界を含む)
    let observedOverLimitWhileHeld = false; // 保留が実際に必要だった(batteryHeatが限界以上だった)ことの証跡

    for (let i = 0; i < 60 && termination === null; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;

      const stage = accumulator.destructionState.battery.profile === 'lipo' ? accumulator.destructionState.battery.d04.stage : 'none';
      if (stage === 'swelling' && firstSwellingStep === null) firstSwellingStep = i; // post適用がnone→swelling同一stepを捉えた最初のstep
      if (stage === 'swelling' || stage === 'smoking') {
        // 保留規則が正しく機能していれば、この間はstatusが'overheated'になることはない。
        // 是正(Suu_mot3 Gate6是正レビュー2): このループはpost正規化後のstatus(常に'running')を
        // 次stepの入力として使うため、post適用(none→swelling同一step境界を含む)のみを
        // 実際に経由する——pre適用の入力が'overheated'になることは構造的に一度もなく、
        // pre分岐は常に無意味なno-opとして通過するだけである。pre適用がwrapper内で実際に
        // 機能することは、下記の専用テスト「Q13保留pre適用の直接検証」で別途固定する。
        expect(vehicleState.status, `step=${i}, stage=${stage}`).toBe('running');
        heldWhileSwellingOrSmoking = true;
        if (vehicleState.motor.batteryHeat >= 1.0) observedOverLimitWhileHeld = true; // BATTERY_HEAT_LIMIT
      }
    }

    // 空虚な一致を禁止する: 保留が実際に発動する非自明な状況(swelling/smoking進行+
    // batteryHeatが限界以上)を経由したことを先に確認する。
    expect(firstSwellingStep, 'swellingへ実際に突入したこと').not.toBeNull();
    expect(heldWhileSwellingOrSmoking, 'swelling/smoking中に実際に保留判定を経由したこと').toBe(true);
    expect(observedOverLimitWhileHeld, '保留中にbatteryHeatが実際にBATTERY_HEAT_LIMIT以上だったこと(保留が本当に必要だった証跡)').toBe(true);

    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    if (termination!.endReason === 'destructionTerminal') {
      expect(termination!.terminalModes).toContain('D04');
    }
    expect(accumulator.events.some((e) => e.mode === 'D04' && e.causeLog.stage === 'burning')).toBe(true);
  });

  // 保留込みの同一RunSnapshot独立2runでのリプレイ等価(Q13-1、上記D03版とは別に必須)。
  it('Q13保留込みリプレイ等価: 同一RunSnapshotから独立に2回run(lipo held-short)すると、events・destructionState・termination・返却physicsStateが完全一致する', () => {
    const snapshot = lipoHeldShortSnapshot();

    function runOnce() {
      let accumulator = createRunAccumulator(snapshot);
      let vehicleState = snapshot.initialVehicleState!;
      let termination: ReturnType<typeof stepTestRunWithDestruction>['termination'] = null;
      const rng = mulberry32(snapshot.seed);
      for (let i = 0; i < 60 && termination === null; i++) {
        const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120, rng);
        vehicleState = result.physicsState;
        accumulator = result.accumulator;
        termination = result.termination;
      }
      return { events: accumulator.events, destructionState: accumulator.destructionState, termination, physicsState: vehicleState };
    }

    const runA = runOnce();
    const runB = runOnce();

    // 空虚な一致の禁止: D04燃焼到達(保留経路を経由した非自明な終端)を先に確認する。
    expect(runA.events.some((e) => e.mode === 'D04' && e.causeLog.stage === 'burning')).toBe(true);
    expect(runB.events).toEqual(runA.events);
    expect(runB.destructionState).toEqual(runA.destructionState);
    expect(runB.termination).toEqual(runA.termination);
    expect(runB.physicsState).toEqual(runA.physicsState);
  });

  // 必須是正(Suu_mot3 Gate6是正レビュー2、2026-08-09): 上記「Q13保留込み正例」のループは
  // 毎stepでpost正規化後のstatus='running'を次stepの入力として使うため、preの入力が
  // 'overheated'になることが構造的に一度もない——normalizeのpre分岐(state.status===
  // 'overheated'の場合だけ書き換える処理)が実際には一度も作動せず、「pre適用も確認」という
  // 旧コメントは空虚だった。pre適用がwrapper内で実際に呼ばれている(純関数単体テストだけでは
  // wrapperがpre位置で呼ぶ保証にならない)ことを、destructionStateをswellingへ直接seedし、
  // 入力VehicleSimStateをstatus='overheated'にした1step単独呼び出しで直接固定する。
  it('Q13保留pre適用の直接検証: destructionStateがswelling・入力VehicleSimStateがstatus="overheated"の場合、preでrunningへ正規化されbase stepの早期returnを回避する(1step単独)', () => {
    const snapshot = lipoHeldShortSnapshot();
    const baseAccumulator = createRunAccumulator(snapshot);
    // destructionStateをswellingへ直接seedする(schema-valid、正式Fable P3-2-Q4-3裁定の
    // initiatingCauseLog契約に合わせcauseLogも非nullにする)。
    const swellingDestructionState: DestructionState = baseAccumulator.destructionState.battery.profile === 'lipo'
      ? {
        ...baseAccumulator.destructionState,
        battery: {
          ...baseAccumulator.destructionState.battery,
          d04: {
            ...baseAccumulator.destructionState.battery.d04,
            stage: 'swelling',
            stageEnteredAtT: 0,
            initiatingCauseLog: { shortCircuitDurationS: 1 / 120, overDischargeRatio: null },
          },
        },
      }
      : baseAccumulator.destructionState;
    const accumulator: RunAccumulator = { ...baseAccumulator, destructionState: swellingDestructionState };

    // 入力VehicleSimStateをstatus='overheated'にする(batteryHeat等は有効値、実際に回転中の状態)。
    const inputVehicleState: VehicleSimState = {
      ...snapshot.initialVehicleState!,
      status: 'overheated',
      motor: { ...snapshot.initialVehicleState!.motor, omega: 50, batteryHeat: 1.0 },
    };

    const result = stepTestRunWithDestruction(inputVehicleState, accumulator, 1 / 120);

    // (a) 返却statusが'running'であること(preで'overheated'→'running'へ正規化された証跡)。
    expect(result.physicsState.status).toBe('running');
    // (b) 物理状態が入力から実際に進んだこと(preがなければbase stepの早期return
    // 〈state.status==='overheated'なら入力をそのまま返す〉により、theta・elapsedTimeSが
    // 一切変化しないはずである)。
    expect(result.physicsState.elapsedTimeS).toBeGreaterThan(inputVehicleState.elapsedTimeS);
    expect(result.physicsState.motor.theta).not.toBe(inputVehicleState.motor.theta);
    // (c) このstep単独ではburningへ到達しないためtermination===null。
    expect(result.termination).toBeNull();
  });
});

// P3-2ゲート6(5.2節)。RunSnapshotへ新設したcourseLengthM/slopeRadの正式M2交差検証拡張。
describe('destructionOrchestration.ts: restoreRunSnapshot courseLengthM/slopeRad交差検証(ゲート6、正式Fable Q6裁定)', () => {
  it('motor文脈でcourseLengthMが非nullはinvalidSchema', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = { ...JSON.parse(JSON.stringify(snapshot)), courseLengthM: 10 };
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('motor文脈でslopeRadが非nullはinvalidSchema', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = { ...JSON.parse(JSON.stringify(snapshot)), slopeRad: 0 };
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('test-run文脈(track===null)でcourseLengthMがnullはinvalidSchema', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput());
    const raw = { ...JSON.parse(JSON.stringify(snapshot)), courseLengthM: null };
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('test-run文脈でcourseLengthMが0はinvalidSchema(正の有限数のみ許可)', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput());
    const raw = { ...JSON.parse(JSON.stringify(snapshot)), courseLengthM: 0 };
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('test-run文脈でcourseLengthMが負値はinvalidSchema', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput());
    const raw = { ...JSON.parse(JSON.stringify(snapshot)), courseLengthM: -1 };
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('test-run文脈でslopeRadがnullはinvalidSchema', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput());
    const raw = { ...JSON.parse(JSON.stringify(snapshot)), slopeRad: null };
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('test-run文脈でslopeRadが0/負値は許可される(正式M2訂正: slopeRadは正の有限数に限定しない)', () => {
    const snapshotZero = captureRunSnapshot(vehicleSnapshotInput({ slopeRad: 0 }));
    expect(restoreRunSnapshot(JSON.parse(JSON.stringify(snapshotZero))).ok).toBe(true);
    const snapshotNegative = captureRunSnapshot(vehicleSnapshotInput({ slopeRad: -0.1 }));
    expect(restoreRunSnapshot(JSON.parse(JSON.stringify(snapshotNegative))).ok).toBe(true);
  });

  it('track-run文脈(track非null)でcourseLengthMが非nullはinvalidSchema(track-runは区間ごとに勾配を導出するため単一のflat値を持たない)', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({ track: goodTrack(), courseLengthM: null, slopeRad: null }));
    const raw = { ...JSON.parse(JSON.stringify(snapshot)), courseLengthM: 10 };
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('track-run文脈でslopeRadが非nullはinvalidSchema', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({ track: goodTrack(), courseLengthM: null, slopeRad: null }));
    const raw = { ...JSON.parse(JSON.stringify(snapshot)), slopeRad: 0 };
    const result = restoreRunSnapshot(raw);
    expect(result.ok).toBe(false);
  });

  it('正常なtest-run文脈snapshot(courseLengthM/slopeRad両方非null)はok:trueで復元でき、値も保持される', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({ courseLengthM: 15, slopeRad: 0.05 }));
    const result = restoreRunSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.courseLengthM).toBe(15);
      expect(result.snapshot.slopeRad).toBeCloseTo(0.05, 10);
    }
  });
});
