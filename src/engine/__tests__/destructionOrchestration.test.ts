// P3-0(docs/phase3-p3-0-plan.md v7 8.1節)。附録A.2のP3-0実装対象をテストする。
import { describe, expect, it } from 'vitest';
import type { CarConfig, VehicleSimState } from '../vehiclePhysics';
import { createInitialVehicleState } from '../vehiclePhysics';
import type { MotorConfig, SimState } from '../motorPhysics';
import type { DestructionEvent, DestructionConfig, DestructionConfigDraft, DestructionRunContext, CaptureRunSnapshotInput } from '../destructionOrchestration';
import {
  captureRunSnapshot,
  createRunAccumulator,
  deriveDegradationDiffs,
  finalizeDestructionRun,
  finalizeRun,
  restoreRunSnapshot,
  validateDestructionConfig,
  validateFireExposureProfile,
} from '../destructionOrchestration';
import { createInitialDestructionState } from '../destructionModes';
import type { TrackDefinition } from '../trackPhysics';

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

function goodDestructionConfig(): DestructionConfig {
  return {
    battery: { profile: 'lipo', shortCircuitDurationLimitS: 2, runawayHeatThreshold: 0.9, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 1, smokingS: 1 } },
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
    const accumulator = { ...createRunAccumulator(snapshot, 'nonLipo'), events: [motorEvent('D03')], terminalModeCandidates: ['D03'] as const };
    const outcome = finalizeDestructionRun(accumulator);
    expect(outcome.endReason).toBe('destructionTerminal');
    if (outcome.endReason === 'destructionTerminal') {
      expect(outcome.terminalModes).toEqual(['D03']);
      expect(outcome.degradationDiffs).toEqual([{ role: 'battery', kind: 'consumed' }]);
    }
  });

  it('10. finalizeDestructionRunは型上、空配列のterminalModeCandidatesを受理しない', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const accumulator = createRunAccumulator(snapshot, 'nonLipo');
    // @ts-expect-error terminalModeCandidatesが空配列(readonly DestructionModeId[])のRunAccumulatorは
    // finalizeDestructionRunの非空タプル型引数を満たさない
    finalizeDestructionRun(accumulator);
  });

  it('11. finalizeRunはmanualAbortでRunOutcome.endReason="manualAbort"を返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const accumulator = createRunAccumulator(snapshot, 'lipo');
    const outcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(outcome.endReason).toBe('manualAbort');
  });

  it('12. finalizeRunはphysicsEnded(stalled+energyExhausted)で"energyExhausted"を返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const accumulator = createRunAccumulator(snapshot, 'lipo');
    const outcome = finalizeRun(accumulator, { kind: 'physicsEnded', physicsEndStatus: { status: 'stalled', failureCode: 'energyExhausted' } });
    expect(outcome.endReason).toBe('energyExhausted');
  });

  it('13. finalizeRunはphysicsEnded(stalled、failureCodeなし)で"stalled"を返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const accumulator = createRunAccumulator(snapshot, 'lipo');
    const outcome = finalizeRun(accumulator, { kind: 'physicsEnded', physicsEndStatus: { status: 'stalled' } });
    expect(outcome.endReason).toBe('stalled');
  });

  it('14. finalizeRunはphysicsEnded(finished)で"finished"を返す', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput());
    const accumulator = createRunAccumulator(snapshot, 'lipo');
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
