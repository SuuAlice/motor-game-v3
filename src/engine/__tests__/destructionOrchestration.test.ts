// P3-0(docs/phase3-p3-0-plan.md v7 8.1節)+P3-1(docs/phase3-p3-1-plan.md v7 §2.2・§2.1.2)。
// 附録A.2のP3-0実装対象に加え、stepMotorWithDestruction本体・classifyTerminalModes完全形・
// createRunAccumulator(Q6(a)、単一引数)をテストする。
import { describe, expect, it } from 'vitest';
import type { CarConfig, VehicleSimState } from '../vehiclePhysics';
import { createInitialVehicleState } from '../vehiclePhysics';
import { COIL_DEFORM_FRAMES, COIL_DEFORM_OMEGA } from '../constants';
import type { MotorConfig, SimState } from '../motorPhysics';
import type { DestructionEvent, DestructionConfig, DestructionConfigDraft, DestructionRunContext, CaptureRunSnapshotInput, RunAccumulator } from '../destructionOrchestration';
import {
  captureRunSnapshot,
  classifyTerminalModes,
  createRunAccumulator,
  deriveDegradationDiffs,
  finalizeDestructionRun,
  finalizeRun,
  restoreRunSnapshot,
  stepMotorWithDestruction,
  validateDestructionConfig,
  validateFireExposureProfile,
} from '../destructionOrchestration';
import { createInitialDestructionState } from '../destructionModes';
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
): DestructionConfig {
  const battery: DestructionConfig['battery'] =
    profile === 'lipo'
      ? { profile: 'lipo', shortCircuitDurationLimitS: 2, runawayHeatThreshold: 0.9, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 1, smokingS: 1 } }
      : { profile: 'nonLipo', shortCircuitDurationLimitS: 2, ...nonLipoOverrides };
  return {
    battery,
    d02: { smokeGaugeThreshold: 0.6, coilOverheatGaugeLimit: 1 },
    d05: { brushSparkDurationLimitS: 0.5, brushSparkCurrentThresholdA: 3 },
    d06: { breakage: { kind: 'breakable', gearStrengthThresholdNm: 0.5 } },
    d07: { magnetHeatGaugeLimit: 1, reversibleDroopThreshold: 0.7 },
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
    seed: 1,
    initialDestructionState: createInitialDestructionState('lipo'),
    ...overrides,
  };
}

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

function d04Event(stage: 'burning' | 'swelling'): DestructionEvent {
  return {
    mode: 'D04',
    causeLog: { currentA: 1, rpm: 100, atT: 1, temperature: { kind: 'uncalibratedGauge', ratio: 1 }, batteryHeatRatio: 1, shortCircuitDurationS: 0, stage, overDischargeRatio: null },
    isFirstThisSession: true,
    affectedRoles: [],
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
  it('15. contractVersionを常に1として付与する', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    expect(snapshot.contractVersion).toBe(1);
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
    const input = vehicleSnapshotInput({ track });
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
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({ track: goodTrack() }));
    const result = restoreRunSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(result.ok).toBe(true);
  });

  it('20. contractVersion不一致はunsupportedContractVersionを返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const raw = { ...JSON.parse(JSON.stringify(snapshot)), contractVersion: 2 };
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
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({ track: badTrack as TrackDefinition }));
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
      battery: { profile: 'lipo', shortCircuitDurationLimitS: 2, runawayHeatThreshold: 0.9, unsafeDischargeStartRatio: 0, stageDurations: { swellingS: 1, smokingS: 1 } },
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
      battery: { profile: 'lipo', shortCircuitDurationLimitS: 2, runawayHeatThreshold: 0.9, unsafeDischargeStartRatio: 0, stageDurations: { swellingS: 1, smokingS: 1 } },
    };
    const result = validateDestructionConfig(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const matches = result.invalidFields.filter((f) => f.field === 'battery.unsafeDischargeStartRatio');
      expect(matches).toHaveLength(1);
    }
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
});
