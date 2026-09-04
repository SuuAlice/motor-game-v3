// P3-0サブステップ3(docs/phase3-p3-0-plan.md v7 8.2節・10節)、Suuレビュー(2026-08-02T16:15
// 必須修正10点+2026-08-02T17:00 追補1〜7)反映後のテスト。全gated actionが「今この瞬間の
// localStorage実体」を読んでから判定・書き込みすることを検証するため、テスト全体で共有
// fake localStorageをglobalThisへ注入する(必須1のクロスタブ検証もこれで行う——同一store
// インスタンスのruntimeLeaseTokenを差し替えることでタブA/タブBを模擬する)。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSaveStore, __testOnly, type NotebookSlice, type PersistedSaveState, type RunPreparationCallback, type RunPreparationResult } from '../saveStore';
import {
  applyRunOutcome,
  captureEquipmentIdSnapshot,
  type EquipmentIdSnapshot,
  type EquipmentLoadout,
  type PendingNotebookRecord,
  type RunApplicationEnvelope,
} from '../runOutcomeApplication';
import { GEAR_TOTAL_TOOTH_COUNT } from '../../materials/inventoryItem';
import { COIL_DEFORM_OMEGA } from '../../engine/constants';
import { useGameStore } from '../gameStore';
import { captureRunSnapshot, restoreRunSnapshot, type CaptureRunSnapshotInput, type DestructionConfig, type DestructionRunContext, type RunOutcome } from '../../engine/destructionOrchestration';
import { createInitialDestructionState } from '../../engine/destructionModes';
import type { DestructionModeId } from '../../engine/destructionModes';
import type { SimState, MotorConfig } from '../../engine/motorPhysics';
import { createInitialVehicleState, type CarConfig } from '../../engine/vehiclePhysics';
import type { ExperimentSession } from '../notebookStore';

// ---------------------------------------------------------------------------
// fixture builders(restoreRunSnapshotの厳密な検証(必須6/追補5)を通す必要があるため、
// engine/__tests__/destructionOrchestration.test.tsと同型の「本物のRunSnapshot」を
// captureRunSnapshotで組み立てる。手構築のダミーsnapshotはisValidRunOutcome/
// isValidPersistedSaveStateの検証で"corrupted"扱いになり、永続化の往復テストが
// 成立しないため使わない)。
// ---------------------------------------------------------------------------

function motorRunContext(): DestructionRunContext {
  return { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null };
}

function goodMotorConfig(): MotorConfig {
  return { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 1.0, magnetDistanceMm: 10, batteryVoltage: 3.0, axisOffsetMm: 0 };
}

function goodDestructionConfig(): DestructionConfig {
  return {
    battery: { profile: 'lipo', shortCircuitDurationLimitS: 2, runawayHeatThreshold: 0.9, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 1, smokingS: 1 }, internalResistanceDegradationMultiplier: 1.5 },
    d01: { decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5, coilDeformOmegaRadS: COIL_DEFORM_OMEGA },
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
    d06: { breakage: { kind: 'breakable', gearStrengthThresholdNm: 0.5 }, toothFatigueExposureNmS: 0.5 },
    d07: {
      thermal: { conductionCoefficient: 0.1, dissipationCoefficient: 0.05 },
      irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 1, reversibleDroopThreshold: 0.7, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 },
    },
    d09: {
        thermal: { conductionCoefficient: 0.25, dissipationCoefficient: 0.5 },
        bearingSeizureGaugeLimit: 1,
        metalGearContactAlways: false,
        highLoadHighSpeed: { loadTorqueThresholdNm: 0.2, rpmThreshold: 3000 },
        gearSeizureDeltaFraction: 0.15,
        bearingSeizureDeltaFraction: 0.2,
      },
  };
}

function initialSimState(): SimState {
  return { theta: 0, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 };
}

function motorSnapshotInput(): CaptureRunSnapshotInput {
  return {
    motorConfig: goodMotorConfig(), carConfig: null, destructionConfig: goodDestructionConfig(),
    runContext: motorRunContext(), initialMotorState: initialSimState(), initialVehicleState: null,
    track: null, courseLengthM: null, slopeRad: null, // ゲート6新規。motor文脈はnull必須
    seed: 1, initialDestructionState: createInitialDestructionState('lipo'),
    recipeKey: 'v1|test-motor',
  };
}

function validReplaySnapshot() {
  return captureRunSnapshot(motorSnapshotInput());
}

// P3-2ゲート7(§9): test-run文脈(track===null、courseLengthM/slopeRadが非null)のRunSnapshot
// round-trip検証専用。既存のvalidCarConfig(4.4節以降で使用中)と同型のCarConfigを使う。
function vehicleTestRunContext(): DestructionRunContext {
  return { context: 'vehicle', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: GEAR_TOTAL_TOOTH_COUNT };
}

function vehicleTestRunSnapshotInput(): CaptureRunSnapshotInput {
  const motorConfig = goodMotorConfig();
  const carConfig: CarConfig = validCarConfig;
  const vehicleState = createInitialVehicleState(motorConfig, carConfig);
  return {
    motorConfig, carConfig, destructionConfig: goodDestructionConfig(),
    runContext: vehicleTestRunContext(), initialMotorState: vehicleState.motor, initialVehicleState: vehicleState,
    track: null, courseLengthM: 10, slopeRad: 0.3, // ゲート6新規。test-run文脈は両方非null必須
    seed: 1, initialDestructionState: createInitialDestructionState('lipo'),
    recipeKey: 'v1|test-vehicle',
  };
}

function nonDestructionOutcome(events: RunOutcome['events'] = [], degradationDiffs: RunOutcome['degradationDiffs'] = []): RunOutcome {
  return {
    endReason: 'manualAbort',
    events,
    destructionState: createInitialDestructionState('lipo'),
    degradationDiffs,
    replaySnapshot: validReplaySnapshot(),
  };
}

// 追補5(Suuレビュー2026-08-02T17:00「実際、saveStore.test.tsのeventOf()はphysicsSnapshotAtT.state={}
// という無効値なのにvalidatorを通っていた」): causeLog/physicsSnapshotAtT.stateを本物の
// 有効値まで組み立て、deep validatorの検証対象として意味のあるfixtureにする。
function eventOf(mode: DestructionModeId): RunOutcome['events'][number] {
  const causeLog: Record<string, unknown> = { currentA: 1, rpm: 1, atT: 1, temperature: { kind: 'unavailable' as const } };
  if (mode === 'D02') causeLog.coilHeatGaugeRatio = 0.5;
  if (mode === 'D03') { causeLog.batteryHeatRatio = 0.5; causeLog.shortCircuitDurationS = 1; }
  if (mode === 'D04') { causeLog.batteryHeatRatio = 0.5; causeLog.shortCircuitDurationS = 1; causeLog.stage = 'burning'; causeLog.overDischargeRatio = null; }
  if (mode === 'D05') causeLog.sparkDurationS = 0.5;
  if (mode === 'D06') { causeLog.loadTorqueNm = 1; causeLog.toothLossCount = 1; }
  if (mode === 'D07') causeLog.magnetHeatGaugeRatio = 0.5;
  if (mode === 'D09') causeLog.bearingHeatGaugeRatio = 0.5;
  const base = {
    mode,
    causeLog,
    isFirstThisSession: true as const,
    physicsSnapshotAtT: { context: 'motor' as const, state: initialSimState() },
  };
  if (mode === 'D04') return { ...base, affectedRoles: [] } as unknown as RunOutcome['events'][number];
  if (mode === 'D06') return { ...base, isTotalLoss: false } as unknown as RunOutcome['events'][number];
  return base as unknown as RunOutcome['events'][number];
}

function batteryConsumedDiff(): RunOutcome['degradationDiffs'][number] {
  return { role: 'battery', kind: 'consumed' };
}

function sessionFixture(id: string): ExperimentSession {
  return {
    id, startedAt: new Date(0).toISOString(), endedAt: new Date(0).toISOString(),
    config: { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 1, magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 0 },
    seed: 1, steadyRpm: 0, averageCurrent: 0, maxCurrent: 0, currentRatio: 0, rpmVariation: 0, maxBatteryHeat: 0, events: [], samples: [],
    // G6(§16.1・§16.2): 3腕とも2フィールドが必須。書き込み系actionは非legacy型のみ受理する。
    finalDestructionState: createInitialDestructionState('lipo'), recipeKey: 'v1|fixture',
  };
}

function sessionRecord(id: string): PendingNotebookRecord {
  return { kind: 'session', record: sessionFixture(id) };
}

const validCarConfig = { massG: 150, gearRatio: 4, gearEfficiency: 0.8, wheelDiameterMm: 30, tireGrip: 0.7, axleFriction: 0, wheelAlignmentMm: 0, centerOfMassHeightMm: 20, motorMountOffsetMm: 0 };

function courseRunRecordFixture(id: string) {
  return {
    id, savedAt: new Date(0).toISOString(), trackId: 'straight-10m',
    motorConfig: sessionFixture('x').config, carConfig: validCarConfig,
    seed: 1, status: 'finished' as const, elapsedTimeS: 1, positionM: 10, energyUsedJ: 1,
    energyBreakdown: { driveJ: 1, gearLossJ: 0, slipLossJ: 0, brushLossJ: 0, heatJ: 0 },
    samples: [],
    finalDestructionState: createInitialDestructionState('lipo'), recipeKey: 'v1|fixture',
  };
}

/**
 * G6-R2: `addCourseRunRecord`(legacy形状の直接書込み専用)へ渡すfixture。
 * 現存する呼出し元はCourseMode手動保存の1系統のみで(retro UI置換まで存続する)、
 * `RunOutcome`を持たないため2フィールドの出典がない。
 */
function legacyCourseRunRecordFixture(id: string) {
  const { finalDestructionState: _f, recipeKey: _r, ...rest } = courseRunRecordFixture(id);
  return rest;
}

function vehicleTestRunRecordFixture(id: string) {
  return {
    id, savedAt: new Date(0).toISOString(),
    motorConfig: sessionFixture('x').config, carConfig: validCarConfig,
    seed: 1, status: 'finished' as const, elapsedTimeS: 1, positionM: 10, energyUsedJ: 1,
    energyBreakdown: { driveJ: 1, gearLossJ: 0, slipLossJ: 0, brushLossJ: 0, heatJ: 0 },
    samples: [],
    finalDestructionState: createInitialDestructionState('lipo'), recipeKey: 'v1|fixture',
  };
}

// ---------------------------------------------------------------------------
// 共有fake localStorage(必須1: 全actionが実体を読み書きすることを検証するための基盤)
// ---------------------------------------------------------------------------

function makeFakeLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    _map: map,
  };
}

let fakeStorage: ReturnType<typeof makeFakeLocalStorage>;

function installFakeStorage() {
  fakeStorage = makeFakeLocalStorage();
  // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
  globalThis.localStorage = fakeStorage;
}

function uninstallFakeStorage() {
  // @ts-expect-error 後片付け
  delete globalThis.localStorage;
}

/** fake storageへ有効なv16:saveを書き込み、in-memory storeのruntime fieldも初期化する。 */
function resetStore() {
  installFakeStorage();
  const fresh = __testOnly.freshBootstrap();
  __testOnly.writeV16(fresh);
  useSaveStore.setState({
    ...fresh,
    currentRunSequence: null,
    leaseState: 'leaseNotAcquired',
    pendingRunEquipmentSnapshot: null,
    pendingRunSaveId: null,
    bootstrapError: null,
  });
}

function acquireLease(nowIso = new Date(0).toISOString()) {
  useSaveStore.getState()._evaluateLeaseOnce(nowIso);
}

function readPersisted(): PersistedSaveState {
  const result = __testOnly.readLatestV16();
  if (result.kind !== 'ok') throw new Error(`fake storageの読み取りに失敗: ${result.kind}`);
  return result.state;
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  useSaveStore.getState().stopLeaseLifecycle();
  uninstallFakeStorage();
});

// ---------------------------------------------------------------------------
// bootstrap・migration
// ---------------------------------------------------------------------------

// P3-2ゲート7(§9末尾): captureRunSnapshot/restoreRunSnapshotのcourseLengthM/slopeRad
// round-trip(ゲート6でRUN_SNAPSHOT_CONTRACT_VERSION 1→2として追加された2フィールド)を、
// saveStore.test.tsのfixture(fake localStorage不要、engineレベルの純粋な往復)で確認する。
describe('RunSnapshot round-trip: courseLengthM/slopeRad(ゲート6新規フィールド、P3-2ゲート7 §9)', () => {
  it('test-run文脈(track===null)のRunSnapshotをJSON round-tripしても、courseLengthM/slopeRadの実値がrestoreRunSnapshotの復元結果に完全一致する', () => {
    const snapshot = captureRunSnapshot(vehicleTestRunSnapshotInput());
    expect(snapshot.courseLengthM).toBe(10);
    expect(snapshot.slopeRad).toBe(0.3);

    const restored = restoreRunSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.snapshot.courseLengthM).toBe(10);
      expect(restored.snapshot.slopeRad).toBe(0.3);
    }
  });

  it('motor文脈のRunSnapshotをJSON round-tripしても、courseLengthM/slopeRadは両方nullのまま保たれる', () => {
    const snapshot = validReplaySnapshot();
    expect(snapshot.courseLengthM).toBeNull();
    expect(snapshot.slopeRad).toBeNull();

    const restored = restoreRunSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.snapshot.courseLengthM).toBeNull();
      expect(restored.snapshot.slopeRad).toBeNull();
    }
  });
});

describe('bootstrap(3.2/3.3節)', () => {
  it('localStorage不在時はfresh bootstrapを返す(kind:"ok")', () => {
    uninstallFakeStorage();
    const result = __testOnly.computeBootstrapResult();
    expect(result.kind).toBe('ok');
    installFakeStorage(); // afterEachの二重delete回避
  });

  it('v16:save相当のJSONが壊れている場合はcorruptedを返す', () => {
    fakeStorage.setItem('v16:save', 'not json{{{');
    expect(__testOnly.computeBootstrapResult().kind).toBe('corrupted');
  });

  it('v16:saveの一部sliceが型不正な場合もcorrupted(部分的な信頼をしない)', () => {
    const fresh = __testOnly.freshBootstrap();
    const broken = { ...fresh, saveMeta: { ...fresh.saveMeta, saveId: 123 } };
    fakeStorage.setItem('v16:save', JSON.stringify({ state: broken, version: 1 }));
    expect(__testOnly.computeBootstrapResult().kind).toBe('corrupted');
  });

  it('wrapper.versionがSCHEMA_VERSIONと不一致の場合もcorrupted(追補5)', () => {
    const fresh = __testOnly.freshBootstrap();
    fakeStorage.setItem('v16:save', JSON.stringify({ state: fresh, version: 999 }));
    expect(__testOnly.computeBootstrapResult().kind).toBe('corrupted');
  });

  it('localStorage.getItemが例外を投げる場合はstorageError(必須10、absentと区別する)', () => {
    fakeStorage.getItem = () => { throw new Error('quota'); };
    expect(__testOnly.computeBootstrapResult().kind).toBe('storageError');
  });

  it('追補2 必須修正2: v16absent後にv15:progressの読み取り自体がioErrorの場合、fresh初期化で握り潰さずstorageError', () => {
    fakeStorage.removeItem('v16:save');
    const originalGetItem = fakeStorage.getItem;
    fakeStorage.getItem = (k: string) => { if (k === 'v15:progress') throw new Error('io'); return originalGetItem(k); };
    expect(__testOnly.computeBootstrapResult().kind).toBe('storageError');
  });

  it('追補2 必須修正2: v16absent後にv15:notebookの読み取り自体がioErrorの場合もstorageError', () => {
    fakeStorage.removeItem('v16:save');
    const originalGetItem = fakeStorage.getItem;
    fakeStorage.getItem = (k: string) => { if (k === 'v15:notebook') throw new Error('io'); return originalGetItem(k); };
    expect(__testOnly.computeBootstrapResult().kind).toBe('storageError');
  });

  it('v15:progressからのフィールド単位移行: 不正な1フィールドだけ既定値に差し替え、他は移行する', () => {
    fakeStorage.removeItem('v16:save'); // beforeEachのresetStore()が書いた既定v16:saveを除去し、v15移行経路を通す
    const v15Progress = {
      diagnosisProgress: { x: true },
      courseProgress: {},
      selectedTrackId: 'straight-10m',
      testRunCompleted: true,
      config: 'broken', // 不正
      carConfig: validCarConfig,
      garageSelection: { chassisId: 'standard', gearId: 'balanced', wheelId: 'medium', tireId: 'standard', batteryId: 'double', batteryPosition: 'center', bodyColorId: 'kraft', accentColorId: 'teal' },
    };
    fakeStorage.setItem('v15:progress', JSON.stringify({ state: v15Progress, version: 0 }));
    const result = __testOnly.computeBootstrapResult();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.state.progress.testRunCompleted).toBe(true);
      expect(result.state.progress.diagnosisProgress).toEqual({ x: true });
      expect(result.state.progress.config.coilTurns).toBe(80); // 不正だったため既定値
    }
  });

  it('v15:progress・v15:notebookが両方存在する場合、両方を移行してv16:saveへ書き出す', () => {
    fakeStorage.removeItem('v16:save');
    const v15Progress = {
      diagnosisProgress: {}, courseProgress: {}, selectedTrackId: 'straight-10m', testRunCompleted: false,
      config: { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 1, magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 0 },
      carConfig: validCarConfig,
      garageSelection: { chassisId: 'standard', gearId: 'balanced', wheelId: 'medium', tireId: 'standard', batteryId: 'double', batteryPosition: 'center', bodyColorId: 'kraft', accentColorId: 'teal' },
    };
    const v15Notebook = { sessions: [sessionFixture('legacy-1')], courseRuns: [] };
    fakeStorage.setItem('v15:progress', JSON.stringify({ state: v15Progress, version: 0 }));
    fakeStorage.setItem('v15:notebook', JSON.stringify({ state: v15Notebook, version: 0 }));
    const result = __testOnly.computeBootstrapResult();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.state.notebook.sessions).toHaveLength(1);
      expect(result.state.notebook.sessions[0].id).toBe('legacy-1');
      expect(result.state.progress.selectedTrackId).toBe('straight-10m');
    }
    expect(fakeStorage.getItem('v16:save')).not.toBeNull(); // 初回永続化(手順3.e)
    expect(fakeStorage.getItem('v15:progress')).not.toBeNull(); // 旧keyは削除しない(手順4)
  });

  it('追補5: v15:notebookのsessionsに不正な要素が1件でもあれば、要素単位filterではなくフィールド全体を既定値(空配列)へ戻す', () => {
    fakeStorage.removeItem('v16:save');
    const v15Notebook = { sessions: [sessionFixture('ok-1'), { broken: true }], courseRuns: [] };
    fakeStorage.setItem('v15:notebook', JSON.stringify({ state: v15Notebook, version: 0 }));
    const result = __testOnly.computeBootstrapResult();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      // 旧実装は要素単位filterで1件(ok-1)だけ残していたが、6.2節手順4の文言どおり
      // フィールド全体を空配列へ戻すのが正しい挙動(Suuレビュー2026-08-02T17:00 追補5)。
      expect(result.state.notebook.sessions).toHaveLength(0);
    }
  });

  it('全フィールドが有効なv15:notebookはそのまま移行する', () => {
    fakeStorage.removeItem('v16:save');
    const v15Notebook = { sessions: [sessionFixture('ok-1'), sessionFixture('ok-2')], courseRuns: [] };
    fakeStorage.setItem('v15:notebook', JSON.stringify({ state: v15Notebook, version: 0 }));
    const result = __testOnly.computeBootstrapResult();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.state.notebook.sessions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 追補5: runtime validator(判別union)の深い検証
// ---------------------------------------------------------------------------

describe('追補5: runtime validatorは判別unionを深く検証する', () => {
  it('eventOf()フィクスチャ自体が有効なRunOutcomeとして通る(回帰: 以前はphysicsSnapshotAtT.state={}が誤って通過していた)', () => {
    expect(__testOnly.isValidRunOutcome(nonDestructionOutcome([eventOf('D01')]))).toBe(true);
  });

  it('physicsSnapshotAtT.stateが空オブジェクトのイベントはRunOutcome全体を無効にする', () => {
    const badEvent = { ...eventOf('D01'), physicsSnapshotAtT: { context: 'motor' as const, state: {} as never } };
    expect(__testOnly.isValidRunOutcome(nonDestructionOutcome([badEvent]))).toBe(false);
  });

  it('causeLogがモード別必須フィールドを欠く場合は無効(D02のcoilHeatGaugeRatio欠落)', () => {
    const badEvent = {
      ...eventOf('D02'),
      causeLog: { currentA: 1, rpm: 1, atT: 1, temperature: { kind: 'unavailable' as const } },
    } as unknown as RunOutcome['events'][number];
    expect(__testOnly.isValidRunOutcome(nonDestructionOutcome([badEvent]))).toBe(false);
  });

  it('非terminalなendReasonにterminalModesが存在すると無効', () => {
    const outcome = { ...nonDestructionOutcome([]), terminalModes: ['D01'] } as unknown as RunOutcome;
    expect(__testOnly.isValidRunOutcome(outcome)).toBe(false);
  });

  it('destructionStateが空オブジェクトだけのものは無効(以前は"objectなら通す"だった)', () => {
    const outcome = { ...nonDestructionOutcome([]), destructionState: {} };
    expect(__testOnly.isValidRunOutcome(outcome)).toBe(false);
  });

  it('DegradationDiff: role×kindの不正な組合せ(rotor+bogus)は無効', () => {
    expect(__testOnly.isValidDegradationDiff({ role: 'rotor', kind: 'bogus' })).toBe(false);
    expect(__testOnly.isValidDegradationDiff({ role: 'rotor', kind: 'collapse' })).toBe(true);
  });

  it('DegradationDiff: magnet+deltaFraction欠落は無効', () => {
    expect(__testOnly.isValidDegradationDiff({ role: 'magnet', kind: 'demagnetization' })).toBe(false);
  });

  it('InventoryItem: familyとwearState.kindが不一致(magnet family + gear wearState)は無効', () => {
    const bad = { itemId: 'x', family: 'magnet', materialId: 'magnet-ferrite', wearState: { kind: 'gear', totalToothCount: 10, toothLossCount: 0, seizureFraction: 0 } };
    expect(__testOnly.isValidInventoryItem(bad)).toBe(false);
  });

  it('InventoryItem: materials.tsに存在しないmaterialIdは無効', () => {
    const bad = { itemId: 'x', family: 'magnet', materialId: 'magnet-unobtainium', wearState: { kind: 'magnet', demagnetizationFraction: 0 } };
    expect(__testOnly.isValidInventoryItem(bad)).toBe(false);
  });

  it('WearState: fractionが[0,1]の範囲外は無効', () => {
    expect(__testOnly.isValidWearState({ kind: 'magnet', demagnetizationFraction: 1.5 })).toBe(false);
    expect(__testOnly.isValidWearState({ kind: 'magnet', demagnetizationFraction: -0.1 })).toBe(false);
  });

  it('WearState: gearのtoothLossCountがtotalToothCountを超える場合は無効', () => {
    expect(__testOnly.isValidWearState({ kind: 'gear', totalToothCount: 10, toothLossCount: 11, seizureFraction: 0 })).toBe(false);
  });

  it('PlayerInventory: itemId重複は無効', () => {
    const inv = readPersisted().inventory;
    const dup = { ...inv, items: [...inv.items, { ...inv.items[0] }] };
    expect(__testOnly.isValidPlayerInventory(dup)).toBe(false);
  });

  it('PlayerInventory: bearingAssemblies[].gearItemIdが実在しないgear個体を指す場合は無効(参照整合)', () => {
    const inv = readPersisted().inventory;
    const bad = { ...inv, bearingAssemblies: [...inv.bearingAssemblies, { assemblyId: 'ghost', gearItemId: 'no-such-gear', seizureFraction: 0 }] };
    expect(__testOnly.isValidPlayerInventory(bad)).toBe(false);
  });

  it('ExperimentSession: samplesの要素が不正(必須フィールド欠落)なら無効', () => {
    const bad = { ...sessionFixture('s1'), samples: [{ t: 0 }] };
    expect(__testOnly.isValidExperimentSession(bad)).toBe(false);
  });

  it('ExperimentSession: eventsのtypeが未知の値なら無効', () => {
    const bad = { ...sessionFixture('s1'), events: [{ type: 'unknownEvent', t: 0 }] };
    expect(__testOnly.isValidExperimentSession(bad)).toBe(false);
  });

  it('EquipmentLoadoutの参照整合: 実在しないrotorAssemblyIdを指す場合は無効', () => {
    const state = readPersisted();
    const bad = { ...state.equipmentLoadout, rotorAssemblyId: 'ghost-rotor' };
    expect(__testOnly.isEquipmentLoadoutReferentiallyValid(bad, state.inventory)).toBe(false);
  });

  it('EquipmentLoadoutの参照整合: batteryItemId===nullは(1.3節、battery消費後の正常状態として)有効', () => {
    const state = readPersisted();
    const nulled = { ...state.equipmentLoadout, batteryItemId: null };
    expect(__testOnly.isEquipmentLoadoutReferentiallyValid(nulled, state.inventory)).toBe(true);
  });

  it('discoveredModesとcodexRecordsのmodeId集合が不一致な永続stateはcorrupted扱い', () => {
    acquireLease();
    useSaveStore.getState().beginRunAction('motor');
    useSaveStore.getState().performApplyRunOutcome(nonDestructionOutcome([eventOf('D01')]), sessionRecord('s1'));
    const fresh = readPersisted();
    const tampered = { ...fresh, encyclopedia: { ...fresh.encyclopedia, discoveredModes: [...fresh.encyclopedia.discoveredModes, 'D02'] as DestructionModeId[] } };
    expect(__testOnly.isValidPersistedSaveState(tampered)).toBe(false);
  });

  it('追補2 必須修正4: discoveredModes配列自体の重複は無効(codexとの突合せに頼らない)', () => {
    acquireLease();
    useSaveStore.getState().beginRunAction('motor');
    useSaveStore.getState().performApplyRunOutcome(nonDestructionOutcome([eventOf('D01')]), sessionRecord('s1'));
    const fresh = readPersisted();
    const tampered = { ...fresh, encyclopedia: { ...fresh.encyclopedia, discoveredModes: [...fresh.encyclopedia.discoveredModes, 'D01'] as DestructionModeId[] } };
    expect(__testOnly.isValidPersistedSaveState(tampered)).toBe(false);
  });

  it('追補2 必須修正4: DegradationDiffの負のdeltaFraction/deltaCountは無効(恒久損傷を回復できる値を拒否する)', () => {
    expect(__testOnly.isValidDegradationDiff({ role: 'magnet', kind: 'demagnetization', deltaFraction: -0.1 })).toBe(false);
    expect(__testOnly.isValidDegradationDiff({ role: 'gear', kind: 'toothLoss', deltaCount: -1 })).toBe(false);
    expect(__testOnly.isValidDegradationDiff({ role: 'gear', kind: 'toothLoss', deltaCount: 1.5 })).toBe(false);
    expect(__testOnly.isValidDegradationDiff({ role: 'magnet', kind: 'demagnetization', deltaFraction: 0.1 })).toBe(true);
  });

  it('追補2 必須修正4: WearState(gear)のtotalToothCountはGEAR_TOTAL_TOOTH_COUNTと完全一致しなければ無効(0を含む任意の非負整数を許さない)', () => {
    expect(__testOnly.isValidWearState({ kind: 'gear', totalToothCount: 0, toothLossCount: 0, seizureFraction: 0 })).toBe(false);
    expect(__testOnly.isValidWearState({ kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT + 1, toothLossCount: 0, seizureFraction: 0 })).toBe(false);
    expect(__testOnly.isValidWearState({ kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 0, seizureFraction: 0 })).toBe(true);
  });

  it('追補2 必須修正4: CodexRecordEntry.firstDiscoveredAtRunSequenceは1未満なら無効', () => {
    acquireLease();
    useSaveStore.getState().beginRunAction('motor');
    useSaveStore.getState().performApplyRunOutcome(nonDestructionOutcome([eventOf('D01')]), sessionRecord('s1'));
    const fresh = readPersisted();
    const tampered = {
      ...fresh,
      encyclopedia: {
        ...fresh.encyclopedia,
        codexRecords: fresh.encyclopedia.codexRecords.map((r) => ({ ...r, firstDiscoveredAtRunSequence: 0 })),
      },
    };
    expect(__testOnly.isValidPersistedSaveState(tampered)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// lease状態機械(クロスタブ、必須1)
// ---------------------------------------------------------------------------

describe('lease状態機械: クロスタブ(必須1、共有fake localStorageで検証)', () => {
  it('leaseToken空文字列(bootstrap直後)は即座にacquiredへ遷移し、実体へ書き込まれる', () => {
    acquireLease();
    expect(useSaveStore.getState().leaseState).toBe('acquired');
    expect(readPersisted().saveMeta.leaseToken).toBe(useSaveStore.getState().runtimeLeaseToken);
  });

  it('タブAがheartbeatを継続している間、タブBは20秒超経過に見えても奪取しない', () => {
    const t0 = new Date('2026-08-02T00:00:00.000Z');
    useSaveStore.setState({ runtimeLeaseToken: 'tab-A' });
    useSaveStore.getState()._evaluateLeaseOnce(t0.toISOString());
    expect(readPersisted().saveMeta.leaseToken).toBe('tab-A');

    // タブAがt0+15sにheartbeatを更新(実体へ書き込む)
    const t15 = new Date(t0.getTime() + 15_000);
    useSaveStore.getState().touchHeartbeatOnce(t15.toISOString());
    expect(readPersisted().saveMeta.leaseHeartbeatAt).toBe(t15.toISOString());

    // タブBがt0+21sに評価する(Aの最終heartbeatからは6秒しか経っていないため実体はfresh)
    const t21 = new Date(t0.getTime() + 21_000);
    useSaveStore.setState({ runtimeLeaseToken: 'tab-B', leaseState: 'leaseNotAcquired' });
    useSaveStore.getState()._evaluateLeaseOnce(t21.toISOString());
    expect(useSaveStore.getState().leaseState).toBe('leaseNotAcquired'); // 奪取しない
    expect(readPersisted().saveMeta.leaseToken).toBe('tab-A'); // 実体もAのまま
  });

  it('タブAのheartbeatが本当に20秒以上止まった場合、タブBが正当にrebindし、以後Aは拒否される', () => {
    const t0 = new Date('2026-08-02T00:00:00.000Z');
    useSaveStore.setState({ runtimeLeaseToken: 'tab-A' });
    useSaveStore.getState()._evaluateLeaseOnce(t0.toISOString());

    // Aのheartbeatをt0のまま放置(更新しない)。Bがt0+20sに評価する
    const t20 = new Date(t0.getTime() + 20_000);
    useSaveStore.setState({ runtimeLeaseToken: 'tab-B', leaseState: 'leaseNotAcquired' });
    useSaveStore.getState()._evaluateLeaseOnce(t20.toISOString());
    expect(useSaveStore.getState().leaseState).toBe('acquired');
    expect(readPersisted().saveMeta.leaseToken).toBe('tab-B');

    // Aに戻って(rebindを知らないまま)heartbeatを打とうとすると、実体のleaseTokenと
    // 一致しないため拒否され、Aはwaitingへ戻る
    useSaveStore.setState({ runtimeLeaseToken: 'tab-A', leaseState: 'acquired' });
    useSaveStore.getState().touchHeartbeatOnce(new Date(t0.getTime() + 21_000).toISOString());
    expect(useSaveStore.getState().leaseState).toBe('leaseNotAcquired');
    expect(readPersisted().saveMeta.leaseToken).toBe('tab-B'); // Bの所有権が保たれる
  });

  it('タブAが書き込みactionを試みても、実体のleaseTokenが既にタブBのものならleaseNotAcquiredで拒否される', () => {
    acquireLease(); // このstoreインスタンス(token X)がまず取得
    const originalToken = useSaveStore.getState().runtimeLeaseToken;
    // 別タブが実体を奪取した状態を模擬する(実体を直接書き換える)
    const fresh = readPersisted();
    __testOnly.writeV16({ ...fresh, saveMeta: { ...fresh.saveMeta, leaseToken: 'other-tab', leaseHeartbeatAt: new Date().toISOString() } });

    const result = useSaveStore.getState().purchaseMaterialAction('magnet-ferrite');
    expect(result).toMatchObject({ ok: false });
    expect(useSaveStore.getState().runtimeLeaseToken).toBe(originalToken); // 自タブのtoken自体は不変
    // 追補2: 読み直しにより自タブのUI状態もleaseNotAcquiredへ同期される
    expect(useSaveStore.getState().leaseState).toBe('leaseNotAcquired');
  });

  it('touchHeartbeatOnceは所有権不一致でno-opになりleaseNotAcquiredへ戻る(4.3節)', () => {
    acquireLease();
    expect(useSaveStore.getState().leaseState).toBe('acquired');
    const fresh = readPersisted();
    __testOnly.writeV16({ ...fresh, saveMeta: { ...fresh.saveMeta, leaseToken: 'someone-else' } });
    useSaveStore.getState().touchHeartbeatOnce(new Date().toISOString());
    expect(useSaveStore.getState().leaseState).toBe('leaseNotAcquired');
  });

  it('lease未取得の間はisLeaseAcquired()がfalseを返す', () => {
    expect(useSaveStore.getState().isLeaseAcquired()).toBe(false);
    acquireLease();
    expect(useSaveStore.getState().isLeaseAcquired()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 必須10: localStorage I/O失敗
// ---------------------------------------------------------------------------

describe('必須10: localStorage I/O失敗を成功扱いしない', () => {
  it('書き込み失敗時はpurchaseMaterialActionが失敗を返し、in-memory stateも変化しない', () => {
    acquireLease();
    const before = useSaveStore.getState().inventory;
    fakeStorage.setItem = () => { throw new Error('quota'); };
    const result = useSaveStore.getState().purchaseMaterialAction('magnet-ferrite');
    expect(result).toMatchObject({ ok: false });
    expect(useSaveStore.getState().inventory).toBe(before);
  });

  it('読み取り失敗時はupdateProgressがfalseを返しfalse以外に成功しない', () => {
    acquireLease();
    fakeStorage.getItem = () => { throw new Error('io'); };
    const result = useSaveStore.getState().updateProgress({ testRunCompleted: true });
    expect(result).toBe(false);
  });

  it('追補2: 読み取り失敗を検知するとbootstrapErrorが立ちlease lifecycleが停止する', () => {
    acquireLease();
    fakeStorage.getItem = () => { throw new Error('io'); };
    useSaveStore.getState().updateProgress({ testRunCompleted: true });
    expect(useSaveStore.getState().bootstrapError).not.toBeNull();
  });

  it('追補2 必須修正2: 書き込み失敗を検知した全gated action(purchase/updateProgress/notebook/装備/beginRun)がbootstrapErrorを立てる', () => {
    const actions: Array<[string, () => unknown]> = [
      ['purchaseMaterialAction', () => useSaveStore.getState().purchaseMaterialAction('magnet-ferrite')],
      ['purchaseCartAction', () => useSaveStore.getState().purchaseCartAction([{ materialId: 'gear-pom', quantity: 1 }])],
      ['setEquipmentLoadout', () => useSaveStore.getState().setEquipmentLoadout(useSaveStore.getState().equipmentLoadout)],
      ['updateProgress', () => useSaveStore.getState().updateProgress({ testRunCompleted: true })],
      ['beginRunAction', () => useSaveStore.getState().beginRunAction('motor')],
    ];
    for (const [, run] of actions) {
      resetStore();
      acquireLease();
      fakeStorage.setItem = () => { throw new Error('quota'); };
      run();
      expect(useSaveStore.getState().bootstrapError).not.toBeNull();
    }
  });

  it('追補2 必須修正2: salvageActionの書き込み失敗もbootstrapErrorを立てる(未装備個体を対象にする)', () => {
    resetStore();
    acquireLease();
    useSaveStore.getState().purchaseMaterialAction('gear-pom'); // 未装備の新規個体を用意する
    const newGear = readPersisted().inventory.items.filter((i) => i.family === 'gear').at(-1);
    fakeStorage.setItem = () => { throw new Error('quota'); };
    useSaveStore.getState().salvageAction(newGear!.itemId);
    expect(useSaveStore.getState().bootstrapError).not.toBeNull();
  });

  it('追補2 必須修正2: bootstrap後にv16キー自体が消失した場合、_evaluateLeaseOnce/touchHeartbeatOnceがbootstrapErrorを立てる', () => {
    acquireLease();
    fakeStorage.removeItem('v16:save');
    useSaveStore.getState().touchHeartbeatOnce(new Date().toISOString());
    expect(useSaveStore.getState().bootstrapError).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 必須4/追補6: pendingApplication・lease未取得時の共通書き込みブロック(全action表)
// ---------------------------------------------------------------------------

function forcePendingViaMissingEquipment() {
  acquireLease();
  useSaveStore.getState().beginRunAction('motor');
  useSaveStore.setState({ pendingRunEquipmentSnapshot: { ...(useSaveStore.getState().pendingRunEquipmentSnapshot as EquipmentIdSnapshot), magnetItemId: 'missing-magnet' } });
  useSaveStore.getState().performApplyRunOutcome(nonDestructionOutcome([]), sessionRecord('s1'));
  if (readPersisted().saveMeta.pendingApplication === null) throw new Error('pending生成に失敗');
}

describe('必須4: pendingApplication中は閲覧以外の全saveStore書き込みをブロックする', () => {
  it('pending中はpurchase/salvage/setEquipmentLoadout/updateProgress/notebook追加がすべて拒否される', () => {
    forcePendingViaMissingEquipment();
    expect(useSaveStore.getState().purchaseMaterialAction('magnet-ferrite')).toMatchObject({ ok: false });
    expect(useSaveStore.getState().salvageAction('initial-brush-01')).toMatchObject({ ok: false });
    expect(useSaveStore.getState().setEquipmentLoadout(useSaveStore.getState().equipmentLoadout)).toMatchObject({ ok: false });
    expect(useSaveStore.getState().updateProgress({ testRunCompleted: true })).toBe(false);
  });

  it('pending中でもretryPendingApplicationAction/abandonPendingApplicationActionは実行できる', () => {
    forcePendingViaMissingEquipment();
    const abandonResult = useSaveStore.getState().abandonPendingApplicationAction();
    expect(abandonResult).toMatchObject({ ok: true });
  });
});

describe('追補6: pending/lease未取得を全書き込みactionについてtable-driven検証する', () => {
  // retry/abandon/beginRunAction(pureBeginRun自身がpendingApplicationExistsを検証する)を
  // 除く全書き込みactionを列挙する。
  const pendingBlockedActions: Array<[string, () => unknown]> = [
    ['purchaseMaterialAction', () => useSaveStore.getState().purchaseMaterialAction('magnet-ferrite')],
    ['purchaseCartAction', () => useSaveStore.getState().purchaseCartAction([{ materialId: 'gear-pom', quantity: 1 }])],
    ['salvageAction', () => useSaveStore.getState().salvageAction('initial-brush-01')],
    ['setEquipmentLoadout', () => useSaveStore.getState().setEquipmentLoadout(useSaveStore.getState().equipmentLoadout)],
    ['updateProgress', () => useSaveStore.getState().updateProgress({ testRunCompleted: true })],
    ['addCourseRunRecord', () => useSaveStore.getState().addCourseRunRecord(legacyCourseRunRecordFixture('x'))],
    ['addVehicleTestRunRecord', () => useSaveStore.getState().addVehicleTestRunRecord(vehicleTestRunRecordFixture('x'))],
    ['clearNotebook', () => useSaveStore.getState().clearNotebook()],
    ['replaceSessionsRecord', () => useSaveStore.getState().replaceSessionsRecord([])],
  ];

  it.each(pendingBlockedActions)('pending中は%sが拒否される', (_name, run) => {
    forcePendingViaMissingEquipment();
    const result = run();
    expect(result === false || (typeof result === 'object' && result !== null && (result as { ok: boolean }).ok === false)).toBe(true);
  });

  it.each(pendingBlockedActions)('lease未取得(bootstrap直後、まだacquireLease前)では%sが拒否される', (_name, run) => {
    // beforeEachのresetStore()直後はleaseState==='leaseNotAcquired'のまま
    const result = run();
    expect(result === false || (typeof result === 'object' && result !== null && (result as { ok: boolean }).ok === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 必須9: lease/pending拒否時、gameStore的adapterがローカルstateを先に変えない
// (saveStore層としてはupdateProgressが明示的なboolean結果を返すことで検証する。
// gameStore.ts自体の呼び出し側ガードはgameStore.test.ts側で検証する)
// ---------------------------------------------------------------------------

describe('必須9: updateProgressは明示的な成否を返す', () => {
  it('lease未取得時はfalseを返し、指定したpartialをprogressスライスへ反映しない', () => {
    const before = useSaveStore.getState().progress;
    const result = useSaveStore.getState().updateProgress({ testRunCompleted: true });
    expect(result).toBe(false);
    // 追補2: lease不一致の検知自体がloseLeaseAndResumeWaiting経由で最新実体を
    // メモリへ同期する(leaseState等のUI状態を正しく保つため)ため、progressの
    // オブジェクト参照自体は変わりうる。ただし内容(値)はbeforeと同一のまま
    // (updateProgressに渡したtestRunCompleted:trueは反映されない)であることを検証する。
    expect(useSaveStore.getState().progress).toEqual(before);
    expect(useSaveStore.getState().progress.testRunCompleted).toBe(false);
  });

  it('lease取得済みならtrueを返し、progressスライスを更新する', () => {
    acquireLease();
    const result = useSaveStore.getState().updateProgress({ testRunCompleted: true });
    expect(result).toBe(true);
    expect(useSaveStore.getState().progress.testRunCompleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// beginRunAction(4.4節)
// ---------------------------------------------------------------------------

describe('beginRunAction(4.4節)', () => {
  it('lease取得済み・正当なloadoutならrunSequence=1を発行し、実体のnextRunSequenceを2へ進める', () => {
    acquireLease();
    const result = useSaveStore.getState().beginRunAction('motor');
    expect(result).toMatchObject({ ok: true, runSequence: 1 });
    expect(readPersisted().saveMeta.nextRunSequence).toBe(2);
    expect(useSaveStore.getState().currentRunSequence).toBe(1);
  });

  it('lease未取得ならleaseNotAcquiredを返し実体を変更しない', () => {
    const before = readPersisted().saveMeta.nextRunSequence;
    const result = useSaveStore.getState().beginRunAction('motor');
    expect(result).toMatchObject({ ok: false, reason: 'leaseNotAcquired' });
    expect(readPersisted().saveMeta.nextRunSequence).toBe(before);
  });

  it('追補2: storageError/corruptedはleaseNotAcquiredへ丸めず区別して返す', () => {
    acquireLease();
    fakeStorage.getItem = () => { throw new Error('io'); };
    const result = useSaveStore.getState().beginRunAction('motor');
    expect(result).toMatchObject({ ok: false, reason: 'storageError' });
  });

  it('多重開始はrunInProgressで拒否する', () => {
    acquireLease();
    useSaveStore.getState().beginRunAction('motor');
    const second = useSaveStore.getState().beginRunAction('motor');
    expect(second).toMatchObject({ ok: false, reason: 'runInProgress' });
  });

  it('放棄・未完走のrunでもnextRunSequenceが戻らない(番号再利用なし)', () => {
    acquireLease();
    useSaveStore.getState().beginRunAction('motor');
    expect(readPersisted().saveMeta.nextRunSequence).toBe(2);
    useSaveStore.setState({ currentRunSequence: null, pendingRunEquipmentSnapshot: null });
    const second = useSaveStore.getState().beginRunAction('motor');
    expect(second).toMatchObject({ ok: true, runSequence: 2 });
  });
});

// ---------------------------------------------------------------------------
// performApplyRunOutcome/retry: 5.3節「14ケース」表と1:1対応
// (追補1: 初回7行×retry7行=14行。staleLease/saveIdMismatch/invalidRunSequenceは
// 同期action経由では自然発生しない組合せがあるため、Suu指示どおりcommitApplyResultへ
// fixture結果を直接注入して検証する。leaseNotAcquiredの2行だけは実際のstore action
// (readFreshForApply/readGatedFreshStateのゲート)を通す。abandon関連はここに含めない
// (別describeへ分離、追補1))。
// ---------------------------------------------------------------------------

describe('performApplyRunOutcome/retry: 5.3節14ケース表(初回7行+retry7行)', () => {
  function freshWithLease(overrides: Partial<PersistedSaveState['saveMeta']> = {}): PersistedSaveState {
    const base = readPersisted();
    return { ...base, saveMeta: { ...base.saveMeta, leaseToken: 'lease-x', nextRunSequence: 2, lastAppliedRunSequence: 0, pendingApplication: null, ...overrides } };
  }

  function envelopeFor(fresh: PersistedSaveState, overrides: Partial<RunApplicationEnvelope> = {}): RunApplicationEnvelope {
    return {
      runKey: { saveId: fresh.saveMeta.saveId, runSequence: 1 },
      leaseToken: fresh.saveMeta.leaseToken,
      outcome: nonDestructionOutcome([eventOf('D01')]),
      equipmentSnapshot: captureEquipmentIdSnapshot(fresh.equipmentLoadout as EquipmentLoadout & { batteryItemId: string }, 'motor'),
      notebookRecord: sessionRecord('s1'),
      ...overrides,
    };
  }

  function fakeSet() {
    const calls: Array<Record<string, unknown>> = [];
    return { set: (partial: Record<string, unknown>) => calls.push(partial), calls };
  }

  function mergedFinalState(calls: Array<Record<string, unknown>>): Record<string, unknown> {
    return calls.reduce((acc, c) => ({ ...acc, ...c }), {} as Record<string, unknown>);
  }

  // 追補2(2026-08-02T17:43再レビュー、必須修正5): 「pendingApplicationだけ見て他は見ない」
  // 状態にならないよう、表の不変条件(inventory/loadout/notebook/codex不変・
  // lastAppliedRunSequence不変・heartbeat不変)を共通ヘルパーとして各行から呼ぶ。
  // set()が一度も呼ばれない行(retryのmissingEquipment)は引数calls=[]で呼び、
  // 「何も変更されていない」ことを自明としてスキップする。
  function expectPersistedInvariantsPreserved(calls: Array<Record<string, unknown>>, fresh: PersistedSaveState): void {
    const final = mergedFinalState(calls);
    if (Object.keys(final).length === 0) return; // set()が一度も呼ばれていない=全て自明に不変
    expect(final.inventory).toBe(fresh.inventory);
    expect(final.equipmentLoadout).toBe(fresh.equipmentLoadout);
    expect(final.notebook).toBe(fresh.notebook);
    expect(final.encyclopedia).toBe(fresh.encyclopedia);
    const saveMeta = final.saveMeta as PersistedSaveState['saveMeta'] | undefined;
    if (saveMeta) {
      expect(saveMeta.lastAppliedRunSequence).toBe(fresh.saveMeta.lastAppliedRunSequence);
      expect(saveMeta.leaseHeartbeatAt).toBe(fresh.saveMeta.leaseHeartbeatAt);
    }
  }

  /** currentRunSequence(runtimeのみ)がこのcommitApplyResult呼び出しでは一切触れられていないことを確認する。 */
  function expectCurrentRunSequenceUntouched(calls: Array<Record<string, unknown>>): void {
    expect('currentRunSequence' in mergedFinalState(calls)).toBe(false);
  }

  it('1. 初回apply 成功(新規適用): 全slice単一set反映・pendingApplication維持null・currentRunSequence null化', () => {
    const fresh = freshWithLease();
    const envelope = envelopeFor(fresh);
    const result = applyRunOutcome(envelope, fresh.inventory, new Set(fresh.encyclopedia.discoveredModes), fresh.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, fresh, result, envelope, 'initial');
    expect(outcome).toMatchObject({ ok: true, result: { applied: true } });
    const final = mergedFinalState(calls);
    const finalSaveMeta = final.saveMeta as PersistedSaveState['saveMeta'];
    expect(finalSaveMeta.pendingApplication).toBeNull();
    expect(final.currentRunSequence).toBeNull();
    // 適用された(applied:true)ため、実際にinventory/notebook/encyclopedia/lastAppliedが変化する
    expect(final.inventory).not.toBe(fresh.inventory);
    expect(final.notebook).not.toBe(fresh.notebook);
    expect(final.encyclopedia).not.toBe(fresh.encyclopedia);
    expect(finalSaveMeta.lastAppliedRunSequence).toBe(1);
    expect(finalSaveMeta.leaseHeartbeatAt).toBe(fresh.saveMeta.leaseHeartbeatAt); // heartbeatは触れない
  });

  it('2. 初回apply 冪等skip: inventory/loadout/notebook/codex/lastApplied/heartbeatは全て不変、currentRunSequence null化', () => {
    const fresh = freshWithLease({ lastAppliedRunSequence: 1 });
    const envelope = envelopeFor(fresh);
    const result = applyRunOutcome(envelope, fresh.inventory, new Set(fresh.encyclopedia.discoveredModes), fresh.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, fresh, result, envelope, 'initial');
    expect(outcome).toMatchObject({ ok: true, result: { applied: false } });
    expectPersistedInvariantsPreserved(calls, fresh);
    expect(mergedFinalState(calls).currentRunSequence).toBeNull();
  });

  it('3. 初回apply missingEquipment: pendingApplicationへenvelopeを新規保存、currentRunSequenceは未着手(このcommitApplyResult呼び出しでは触れない)、他slice不変', () => {
    const fresh = freshWithLease();
    const envelope = envelopeFor(fresh, { equipmentSnapshot: { ...envelopeFor(fresh).equipmentSnapshot, magnetItemId: 'missing-magnet' } as EquipmentIdSnapshot });
    const result = applyRunOutcome(envelope, fresh.inventory, new Set(fresh.encyclopedia.discoveredModes), fresh.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, fresh, result, envelope, 'initial');
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'missingEquipment' } });
    const final = mergedFinalState(calls);
    expect((final.saveMeta as PersistedSaveState['saveMeta']).pendingApplication).not.toBeNull();
    expect(final.inventory).toBe(fresh.inventory);
    expect(final.notebook).toBe(fresh.notebook);
    expect(final.encyclopedia).toBe(fresh.encyclopedia);
    expect((final.saveMeta as PersistedSaveState['saveMeta']).lastAppliedRunSequence).toBe(fresh.saveMeta.lastAppliedRunSequence);
    expectCurrentRunSequenceUntouched(calls);
  });

  it('4. 初回apply saveIdMismatch: pendingApplicationは書き込まない、他sliceも一切変更しない(fresh同期のみ)', () => {
    const fresh = freshWithLease();
    const envelope = envelopeFor(fresh, { runKey: { saveId: 'different-save', runSequence: 1 } });
    const result = applyRunOutcome(envelope, fresh.inventory, new Set(fresh.encyclopedia.discoveredModes), fresh.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, fresh, result, envelope, 'initial');
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'saveIdMismatch' } });
    expect((mergedFinalState(calls).saveMeta as PersistedSaveState['saveMeta']).pendingApplication).toBeNull();
    expectPersistedInvariantsPreserved(calls, fresh);
    expectCurrentRunSequenceUntouched(calls);
  });

  it('5. 初回apply staleLease: pendingApplicationは書き込まない、他sliceも一切変更しない', () => {
    const fresh = freshWithLease();
    const envelope = envelopeFor(fresh, { leaseToken: 'stale-token' });
    const result = applyRunOutcome(envelope, fresh.inventory, new Set(fresh.encyclopedia.discoveredModes), fresh.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, fresh, result, envelope, 'initial');
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'staleLease' } });
    expect((mergedFinalState(calls).saveMeta as PersistedSaveState['saveMeta']).pendingApplication).toBeNull();
    expectPersistedInvariantsPreserved(calls, fresh);
    expectCurrentRunSequenceUntouched(calls);
  });

  it('6. 初回apply invalidRunSequence: pendingApplicationは書き込まない、他sliceも一切変更しない', () => {
    const fresh = freshWithLease();
    const envelope = envelopeFor(fresh, { runKey: { saveId: fresh.saveMeta.saveId, runSequence: 99 } });
    const result = applyRunOutcome(envelope, fresh.inventory, new Set(fresh.encyclopedia.discoveredModes), fresh.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, fresh, result, envelope, 'initial');
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'invalidRunSequence' } });
    expect((mergedFinalState(calls).saveMeta as PersistedSaveState['saveMeta']).pendingApplication).toBeNull();
    expectPersistedInvariantsPreserved(calls, fresh);
    expectCurrentRunSequenceUntouched(calls);
  });

  it('7. 初回apply leaseNotAcquired: 実際のstore action(performApplyRunOutcome)がpendingApplicationを一切生成せず、currentRunSequenceも維持する', () => {
    acquireLease();
    useSaveStore.getState().beginRunAction('motor');
    const runSeqBefore = useSaveStore.getState().currentRunSequence;
    const fresh = readPersisted();
    __testOnly.writeV16({ ...fresh, saveMeta: { ...fresh.saveMeta, leaseToken: 'other-tab' } });
    const result = useSaveStore.getState().performApplyRunOutcome(nonDestructionOutcome([]), sessionRecord('s1'));
    expect(result).toMatchObject({ ok: false, error: { kind: 'leaseNotAcquired' } });
    expect(readPersisted().saveMeta.pendingApplication).toBeNull();
    // leaseNotAcquiredはpure関数へ到達する前の早期returnであり、currentRunSequence(runtime)は
    // このタブが以前beginRunActionで発行したものが維持される(run自体は放棄されていない)。
    expect(useSaveStore.getState().currentRunSequence).toBe(runSeqBefore);
  });

  it('8. retry 成功(新規適用): pendingApplication null化・結果反映', () => {
    const fresh = freshWithLease();
    const envelope = envelopeFor(fresh);
    const freshWithPending = { ...fresh, saveMeta: { ...fresh.saveMeta, pendingApplication: envelope } };
    const result = applyRunOutcome(envelope, freshWithPending.inventory, new Set(freshWithPending.encyclopedia.discoveredModes), freshWithPending.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, freshWithPending, result, envelope, 'retry');
    expect(outcome).toMatchObject({ ok: true, result: { applied: true } });
    const final = mergedFinalState(calls);
    const finalSaveMeta = final.saveMeta as PersistedSaveState['saveMeta'];
    expect(finalSaveMeta.pendingApplication).toBeNull();
    expect(final.currentRunSequence).toBeNull();
    expect(final.inventory).not.toBe(freshWithPending.inventory);
    expect(finalSaveMeta.lastAppliedRunSequence).toBe(1);
    expect(finalSaveMeta.leaseHeartbeatAt).toBe(fresh.saveMeta.leaseHeartbeatAt);
  });

  it('9. retry 冪等skip: pendingApplicationを明示的にnull化(解放)し、inventory等は不変', () => {
    const fresh = freshWithLease({ lastAppliedRunSequence: 1 });
    const envelope = envelopeFor(fresh);
    const freshWithPending = { ...fresh, saveMeta: { ...fresh.saveMeta, pendingApplication: envelope } };
    const result = applyRunOutcome(envelope, freshWithPending.inventory, new Set(freshWithPending.encyclopedia.discoveredModes), freshWithPending.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, freshWithPending, result, envelope, 'retry');
    expect(outcome).toMatchObject({ ok: true, result: { applied: false } });
    const final = mergedFinalState(calls);
    expect((final.saveMeta as PersistedSaveState['saveMeta']).pendingApplication).toBeNull();
    expect(final.currentRunSequence).toBeNull();
    expect(final.inventory).toBe(freshWithPending.inventory);
    expect(final.notebook).toBe(freshWithPending.notebook);
    expect(final.encyclopedia).toBe(freshWithPending.encyclopedia);
    expect((final.saveMeta as PersistedSaveState['saveMeta']).lastAppliedRunSequence).toBe(fresh.saveMeta.lastAppliedRunSequence);
  });

  it('10. retry missingEquipmentのまま: pendingApplicationを一切書き換えない(set呼び出しなし、全slice自明に不変)', () => {
    const fresh = freshWithLease();
    const badEnvelope = envelopeFor(fresh, { equipmentSnapshot: { ...envelopeFor(fresh).equipmentSnapshot, magnetItemId: 'missing-magnet' } as EquipmentIdSnapshot });
    const freshWithPending = { ...fresh, saveMeta: { ...fresh.saveMeta, pendingApplication: badEnvelope } };
    const result = applyRunOutcome(badEnvelope, freshWithPending.inventory, new Set(freshWithPending.encyclopedia.discoveredModes), freshWithPending.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, freshWithPending, result, badEnvelope, 'retry');
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'missingEquipment' } });
    expect(calls).toHaveLength(0); // retryのmissingEquipmentは何もしない(既存pendingをそのまま保持)
    expectPersistedInvariantsPreserved(calls, freshWithPending);
    expectCurrentRunSequenceUntouched(calls);
  });

  it('11. retry saveIdMismatch: pendingApplicationを変更しない(fresh同期のみ)、他sliceも不変', () => {
    const fresh = freshWithLease();
    const envelope = envelopeFor(fresh, { runKey: { saveId: 'different-save', runSequence: 1 } });
    const freshWithPending = { ...fresh, saveMeta: { ...fresh.saveMeta, pendingApplication: envelope } };
    const result = applyRunOutcome(envelope, freshWithPending.inventory, new Set(freshWithPending.encyclopedia.discoveredModes), freshWithPending.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, freshWithPending, result, envelope, 'retry');
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'saveIdMismatch' } });
    const final = mergedFinalState(calls);
    expect((final.saveMeta as PersistedSaveState['saveMeta']).pendingApplication).toBe(envelope);
    expect(final.inventory).toBe(freshWithPending.inventory);
    expect(final.notebook).toBe(freshWithPending.notebook);
    expect(final.encyclopedia).toBe(freshWithPending.encyclopedia);
    expect((final.saveMeta as PersistedSaveState['saveMeta']).lastAppliedRunSequence).toBe(fresh.saveMeta.lastAppliedRunSequence);
    expectCurrentRunSequenceUntouched(calls);
  });

  it('12. retry staleLease: pendingApplicationを変更しない、他sliceも不変', () => {
    const fresh = freshWithLease();
    const envelope = envelopeFor(fresh, { leaseToken: 'stale-token' });
    const freshWithPending = { ...fresh, saveMeta: { ...fresh.saveMeta, pendingApplication: envelope } };
    const result = applyRunOutcome(envelope, freshWithPending.inventory, new Set(freshWithPending.encyclopedia.discoveredModes), freshWithPending.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, freshWithPending, result, envelope, 'retry');
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'staleLease' } });
    const final = mergedFinalState(calls);
    expect((final.saveMeta as PersistedSaveState['saveMeta']).pendingApplication).toBe(envelope);
    expect(final.inventory).toBe(freshWithPending.inventory);
    expect(final.notebook).toBe(freshWithPending.notebook);
    expect(final.encyclopedia).toBe(freshWithPending.encyclopedia);
    expect((final.saveMeta as PersistedSaveState['saveMeta']).lastAppliedRunSequence).toBe(fresh.saveMeta.lastAppliedRunSequence);
    expectCurrentRunSequenceUntouched(calls);
  });

  it('13. retry invalidRunSequence: pendingApplicationを変更しない、他sliceも不変', () => {
    const fresh = freshWithLease();
    const envelope = envelopeFor(fresh, { runKey: { saveId: fresh.saveMeta.saveId, runSequence: 99 } });
    const freshWithPending = { ...fresh, saveMeta: { ...fresh.saveMeta, pendingApplication: envelope } };
    const result = applyRunOutcome(envelope, freshWithPending.inventory, new Set(freshWithPending.encyclopedia.discoveredModes), freshWithPending.saveMeta);
    const { set, calls } = fakeSet();
    const outcome = __testOnly.commitApplyResult(set, freshWithPending, result, envelope, 'retry');
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'invalidRunSequence' } });
    const final = mergedFinalState(calls);
    expect((final.saveMeta as PersistedSaveState['saveMeta']).pendingApplication).toBe(envelope);
    expect(final.inventory).toBe(freshWithPending.inventory);
    expect(final.notebook).toBe(freshWithPending.notebook);
    expect(final.encyclopedia).toBe(freshWithPending.encyclopedia);
    expect((final.saveMeta as PersistedSaveState['saveMeta']).lastAppliedRunSequence).toBe(fresh.saveMeta.lastAppliedRunSequence);
    expectCurrentRunSequenceUntouched(calls);
  });

  it('14. retry leaseNotAcquired: 実際のstore action(retryPendingApplicationAction)がleaseState待機へ同期し、currentRunSequenceは維持する(追補2)', () => {
    acquireLease();
    useSaveStore.getState().beginRunAction('motor');
    useSaveStore.setState({ pendingRunEquipmentSnapshot: { ...(useSaveStore.getState().pendingRunEquipmentSnapshot as EquipmentIdSnapshot), magnetItemId: 'missing-magnet' } });
    useSaveStore.getState().performApplyRunOutcome(nonDestructionOutcome([]), sessionRecord('s1'));
    const runSeqBefore = useSaveStore.getState().currentRunSequence;
    const fresh = readPersisted();
    __testOnly.writeV16({ ...fresh, saveMeta: { ...fresh.saveMeta, leaseToken: 'other-tab' } });
    const result = useSaveStore.getState().retryPendingApplicationAction();
    expect(result).toMatchObject({ ok: false, error: { kind: 'leaseNotAcquired' } });
    expect(readPersisted().saveMeta.pendingApplication).not.toBeNull();
    // 追補2 bullet4: 「保存失敗」ではなく待機画面(WaitingScreen)へ遷移する契機として、
    // leaseStateがwaitingへ同期されている(SaveGateはbootstrapError→lease→pendingの順に
    // 優先するため、leaseNotAcquiredの間はPendingScreenの代わりにWaitingScreenが表示される)。
    expect(useSaveStore.getState().leaseState).toBe('leaseNotAcquired');
    expect(useSaveStore.getState().currentRunSequence).toBe(runSeqBefore);
  });

  it('battery消費は一致ケースでnull化される(基準確認)', () => {
    acquireLease();
    const originalBatteryId = useSaveStore.getState().equipmentLoadout.batteryItemId;
    useSaveStore.getState().beginRunAction('motor'); // snapshotはoriginalBatteryIdを捕捉
    useSaveStore.getState().performApplyRunOutcome(nonDestructionOutcome([], [batteryConsumedDiff()]), sessionRecord('s1'));
    expect(readPersisted().equipmentLoadout.batteryItemId).toBeNull();
    expect(readPersisted().inventory.items.some((i) => i.itemId === originalBatteryId)).toBe(false);
  });

  it('battery消費は不一致(begin後に装備を差し替えた)場合、現在のloadoutを変更しない(負例)', () => {
    acquireLease();
    const originalBatteryId = useSaveStore.getState().equipmentLoadout.batteryItemId as string;
    useSaveStore.getState().beginRunAction('motor'); // snapshotはoriginalBatteryIdを捕捉して固定する(1回のみ)
    // run実行中(currentRunSequence!==null)に2本目を購入し、装備をそちらへ差し替える
    // (lease/pendingゲートは装備変更自体を禁止しないため、この操作は成功する)
    useSaveStore.getState().purchaseMaterialAction('battery-alkaline');
    const secondBattery = useSaveStore.getState().inventory.items.filter((i) => i.family === 'battery' && i.itemId !== originalBatteryId).at(-1);
    expect(secondBattery).toBeTruthy();
    const loadoutBeforeApply = useSaveStore.getState().equipmentLoadout;
    useSaveStore.getState().setEquipmentLoadout({ ...loadoutBeforeApply, batteryItemId: secondBattery!.itemId });

    // 適用: consumedEquipmentIdsはsnapshot捕捉時のoriginalBatteryIdを指すが、現在のloadoutは
    // 既にsecondBatteryを指しているため一致せず、loadoutは変更されない
    const result = useSaveStore.getState().performApplyRunOutcome(nonDestructionOutcome([], [batteryConsumedDiff()]), sessionRecord('s1'));
    expect(result).toMatchObject({ ok: true, result: { applied: true } });
    expect(readPersisted().equipmentLoadout.batteryItemId).toBe(secondBattery!.itemId); // 変更されない
    expect(readPersisted().inventory.items.some((i) => i.itemId === originalBatteryId)).toBe(false); // 個体自体は消滅する
  });
});

// ---------------------------------------------------------------------------
// abandonPendingApplicationAction(軽微条件3)。追補1: 14ケース表の外側の別describeへ分離。
// ---------------------------------------------------------------------------

describe('abandonPendingApplicationAction(軽微条件3、14ケース表の対象外)', () => {
  it('pendingApplication・currentRunSequenceを同じ単一setでnull化し、lastAppliedRunSequenceは進めない', () => {
    forcePendingViaMissingEquipment();
    const lastAppliedBefore = readPersisted().saveMeta.lastAppliedRunSequence;
    const result = useSaveStore.getState().abandonPendingApplicationAction();
    expect(result).toMatchObject({ ok: true });
    expect(readPersisted().saveMeta.pendingApplication).toBeNull();
    expect(useSaveStore.getState().currentRunSequence).toBeNull();
    expect(readPersisted().saveMeta.lastAppliedRunSequence).toBe(lastAppliedBefore);
  });

  it('放棄後の次runは正常発行され、高水位が放棄番号を飛び越える', () => {
    forcePendingViaMissingEquipment();
    useSaveStore.getState().abandonPendingApplicationAction();
    const second = useSaveStore.getState().beginRunAction('motor');
    expect(second).toMatchObject({ ok: true, runSequence: 2 });
  });

  it('lease未取得時はabandonが拒否される', () => {
    forcePendingViaMissingEquipment();
    const fresh = readPersisted();
    __testOnly.writeV16({ ...fresh, saveMeta: { ...fresh.saveMeta, leaseToken: 'other-tab' } });
    const result = useSaveStore.getState().abandonPendingApplicationAction();
    expect(result).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// 実験ノート3腕の自動trim(6.4節、確認UIなし)+ codexRecords配列管理
// ---------------------------------------------------------------------------

describe('実験ノート3腕の自動trim(6.4節、各腕55件投入)', () => {
  it('courseRunsは55件投入で50件にtrimされる', () => {
    acquireLease();
    for (let i = 0; i < 55; i += 1) useSaveStore.getState().addCourseRunRecord(legacyCourseRunRecordFixture(`c${i}`));
    expect(readPersisted().notebook.courseRuns).toHaveLength(50);
  });

  it('vehicleTestRunsは55件投入で50件にtrimされる', () => {
    acquireLease();
    for (let i = 0; i < 55; i += 1) useSaveStore.getState().addVehicleTestRunRecord(vehicleTestRunRecordFixture(`v${i}`));
    expect(readPersisted().notebook.vehicleTestRuns).toHaveLength(50);
  });

  it('clearNotebookは3腕すべてを空にする', () => {
    acquireLease();
    useSaveStore.getState().addCourseRunRecord(legacyCourseRunRecordFixture('c1'));
    useSaveStore.getState().clearNotebook();
    const notebook: NotebookSlice = readPersisted().notebook;
    expect(notebook.sessions).toHaveLength(0);
    expect(notebook.courseRuns).toHaveLength(0);
    expect(notebook.vehicleTestRuns).toHaveLength(0);
  });
});

describe('codexRecords配列管理(5.2節: 最大8件・modeId一意・追記のみ、D01〜D07/D09全8件)', () => {
  it('D01〜D07・D09を1件ずつ発見すると8件まで積み上がり、重複追加は起きない', () => {
    acquireLease();
    const modes: DestructionModeId[] = ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D09'];
    for (const mode of modes) {
      useSaveStore.getState().beginRunAction('motor');
      useSaveStore.getState().performApplyRunOutcome(nonDestructionOutcome([eventOf(mode)]), sessionRecord(`s-${mode}`));
    }
    const codexRecords = readPersisted().encyclopedia.codexRecords;
    expect(codexRecords).toHaveLength(8);
    expect(new Set(codexRecords.map((r) => r.modeId)).size).toBe(8);

    // 既発見モードを再度発生させても追記されない
    useSaveStore.getState().beginRunAction('motor');
    useSaveStore.getState().performApplyRunOutcome(nonDestructionOutcome([eventOf('D01')]), sessionRecord('s-dup'));
    expect(readPersisted().encyclopedia.codexRecords).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// lease lifecycle timers(4.1〜4.3節、追補2)
// ---------------------------------------------------------------------------

describe('lease lifecycle timers(heartbeat 5秒間隔・待機ポーリング1秒間隔)', () => {
  afterEach(() => {
    useSaveStore.getState().stopLeaseLifecycle();
    vi.useRealTimers();
  });

  it('startLeaseLifecycleはlease取得済みならheartbeatタイマーを起動し、5秒ごとに実体のheartbeatを更新する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T00:00:00.000Z'));
    useSaveStore.getState().startLeaseLifecycle();
    expect(useSaveStore.getState().leaseState).toBe('acquired');
    const heartbeatAtAfterAcquire = readPersisted().saveMeta.leaseHeartbeatAt;

    vi.setSystemTime(new Date('2026-08-02T00:00:05.000Z'));
    vi.advanceTimersByTime(5_000);
    expect(readPersisted().saveMeta.leaseHeartbeatAt).not.toBe(heartbeatAtAfterAcquire);
    expect(useSaveStore.getState().leaseState).toBe('acquired');
  });

  it('待機中は1秒ごとに再判定し、staleに達すると自動的にacquiredへ遷移してheartbeatタイマーへ切り替わる', () => {
    vi.useFakeTimers();
    const start = new Date('2026-08-02T00:00:00.000Z');
    vi.setSystemTime(start);
    const fresh = readPersisted();
    __testOnly.writeV16({ ...fresh, saveMeta: { ...fresh.saveMeta, leaseToken: 'other-tab', leaseHeartbeatAt: start.toISOString() } });
    useSaveStore.getState().startLeaseLifecycle();
    expect(useSaveStore.getState().leaseState).toBe('leaseNotAcquired');

    vi.setSystemTime(new Date(start.getTime() + 21_000));
    vi.advanceTimersByTime(21_000);
    expect(useSaveStore.getState().leaseState).toBe('acquired');
  });

  it('stopLeaseLifecycleはheartbeat/待機ポーリングいずれのタイマーも停止する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T00:00:00.000Z'));
    useSaveStore.getState().startLeaseLifecycle();
    const heartbeatAtBefore = readPersisted().saveMeta.leaseHeartbeatAt;
    useSaveStore.getState().stopLeaseLifecycle();
    vi.setSystemTime(new Date('2026-08-02T00:00:30.000Z'));
    vi.advanceTimersByTime(30_000);
    expect(readPersisted().saveMeta.leaseHeartbeatAt).toBe(heartbeatAtBefore);
  });

  it('必須2: startLeaseLifecycleを連続で2回呼んでも(React StrictMode/HMRの二重effect発火を模擬)heartbeatタイマーが二重化しない', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T00:00:00.000Z'));
    useSaveStore.getState().startLeaseLifecycle();
    useSaveStore.getState().startLeaseLifecycle(); // 2回目(StrictMode/HMR再mountを模擬)
    let heartbeatCount = 0;
    const original = useSaveStore.getState().touchHeartbeatOnce;
    useSaveStore.setState({ touchHeartbeatOnce: (now) => { heartbeatCount += 1; original(now); } });
    vi.setSystemTime(new Date('2026-08-02T00:00:05.000Z'));
    vi.advanceTimersByTime(5_000);
    // タイマーが二重化していれば5秒間隔のtickが2回同時に発火するはずだが、1回しか発火しない
    expect(heartbeatCount).toBe(1);
  });

  it('追補2 bullet5: heartbeatで所有権喪失を検知すると待機ポーリングへ自動的に切り替わり、B解消後にAが再取得する', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-08-02T00:00:00.000Z');
    vi.setSystemTime(t0);
    // タブA視点でlifecycleを起動する(rebindしてacquired・heartbeatタイマー起動)
    useSaveStore.setState({ runtimeLeaseToken: 'tab-A' });
    useSaveStore.getState().startLeaseLifecycle();
    expect(useSaveStore.getState().leaseState).toBe('acquired');

    // タブBが実体を奪取する(直接rebind、t0+1sの時点)
    const t1 = new Date(t0.getTime() + 1_000);
    const freshAfterA = readPersisted();
    __testOnly.writeV16({ ...freshAfterA, saveMeta: { ...freshAfterA.saveMeta, leaseToken: 'tab-B', leaseHeartbeatAt: t1.toISOString() } });

    // Aのheartbeatタイマーがt0+5sに発火し、所有権喪失を検知して待機ポーリングへ切り替わる
    vi.setSystemTime(new Date(t0.getTime() + 5_000));
    vi.advanceTimersByTime(5_000);
    expect(useSaveStore.getState().leaseState).toBe('leaseNotAcquired');

    // Bのheartbeatはt1で止まったまま。t1+20s(=t0+21s)を過ぎるとBはstaleになり、
    // Aの待機ポーリング(1秒間隔)が自動的にrebindしてacquiredへ戻る。
    vi.setSystemTime(new Date(t1.getTime() + 21_000));
    vi.advanceTimersByTime(17_000); // t0+5s → t0+22s(=t1+21s)まで進める
    expect(useSaveStore.getState().leaseState).toBe('acquired');
    expect(readPersisted().saveMeta.leaseToken).toBe('tab-A');
  });
});

// ---------------------------------------------------------------------------
// persist設定(必須5/追補「stderr警告」)
// ---------------------------------------------------------------------------

describe('persist設定: skipHydration/versionが実際に反映されている', () => {
  it('zustand persistの実オプションにskipHydration:trueとversion:SCHEMA_VERSIONが設定されている', () => {
    const options = useSaveStore.persist.getOptions();
    expect(options.skipHydration).toBe(true);
    expect(options.version).toBe(__testOnly.SCHEMA_VERSION);
    expect(options.name).toBe(__testOnly.SAVE_KEY);
  });

  it('zustand persistミドルウェア自身のstorage.setItemはno-op化されており、書き込みはwriteV16のみが担う(stderr警告の発生源を断つ)', () => {
    const setItemSpy = vi.spyOn(fakeStorage, 'setItem');
    acquireLease();
    setItemSpy.mockClear();
    useSaveStore.getState().updateProgress({ testRunCompleted: true });
    // writeV16による1回だけの書き込みのみが実際にlocalStorage.setItemへ到達する
    // (zustand persist自身の内部setItem呼び出しはno-op storageのため、fakeStorageには届かない)
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith('v16:save', expect.any(String));
  });

  it('追補2 必須修正3: persist.rehydrate()を手動で呼んでもruntime validatorを迂回してmergeされない(getItemは常にnull)', () => {
    acquireLease();
    const before = useSaveStore.getState().progress;
    // fake storageへ意図的に壊れたrawを置く(saveIdが数値、必須10テストと同じ壊れ方)
    const fresh = readPersisted();
    fakeStorage.setItem('v16:save', JSON.stringify({ state: { ...fresh, saveMeta: { ...fresh.saveMeta, saveId: 123 } }, version: 1 }));
    useSaveStore.persist.rehydrate();
    // zustand persist自身のstorage.getItemは常にnullを返すため、rehydrate()は
    // 「永続値なし」としてno-opになり、in-memory stateは変化しない(壊れたrawが混入しない)。
    expect(useSaveStore.getState().progress).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 必須7: カート購入時のgear→bearing 1:1生成
// ---------------------------------------------------------------------------

describe('必須7: 購入時のgear→bearing自動生成(単発・カート・複数・中間行・重複行)', () => {
  it('単発購入(purchaseMaterialAction)は1件のbearingを生成する', () => {
    acquireLease();
    const before = readPersisted().inventory.bearingAssemblies.length;
    useSaveStore.getState().purchaseMaterialAction('gear-pom');
    expect(readPersisted().inventory.bearingAssemblies.length).toBe(before + 1);
  });

  it('カートでgearが中間行にあってもbearingが生成される', () => {
    acquireLease();
    const before = readPersisted().inventory.bearingAssemblies.length;
    const result = useSaveStore.getState().purchaseCartAction([
      { materialId: 'wire-copper-standard', quantity: 1 },
      { materialId: 'gear-pom', quantity: 1 },
      { materialId: 'coating-polyester', quantity: 1 },
    ]);
    expect(result.ok).toBe(true);
    expect(readPersisted().inventory.bearingAssemblies.length).toBe(before + 1);
  });

  it('カートでgearをquantity>1購入すると、その個数分だけbearingが生成される', () => {
    acquireLease();
    const before = readPersisted().inventory.bearingAssemblies.length;
    const result = useSaveStore.getState().purchaseCartAction([{ materialId: 'gear-pom', quantity: 3 }]);
    expect(result.ok).toBe(true);
    const persisted = readPersisted();
    expect(persisted.inventory.bearingAssemblies.length).toBe(before + 3);
    const newGearIds = persisted.inventory.items.filter((i) => i.family === 'gear').map((i) => i.itemId);
    for (const gearId of newGearIds) {
      expect(persisted.inventory.bearingAssemblies.filter((b) => b.gearItemId === gearId)).toHaveLength(1);
    }
  });

  it('カートで重複行(同一materialId2回)として渡されても正しく合算されbearing数が一致する', () => {
    acquireLease();
    const before = readPersisted().inventory.bearingAssemblies.length;
    const result = useSaveStore.getState().purchaseCartAction([
      { materialId: 'gear-pom', quantity: 1 },
      { materialId: 'gear-pom', quantity: 2 },
    ]);
    expect(result.ok).toBe(true);
    expect(readPersisted().inventory.bearingAssemblies.length).toBe(before + 3);
  });

  it('gearが末尾ではない・非gear素材のみのカートではbearingが増えない', () => {
    acquireLease();
    const before = readPersisted().inventory.bearingAssemblies.length;
    useSaveStore.getState().purchaseCartAction([{ materialId: 'wire-copper-standard', quantity: 2 }]);
    expect(readPersisted().inventory.bearingAssemblies.length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 装備保護規則(1.2節)
// ---------------------------------------------------------------------------

describe('店の装備保護規則(1.2節)', () => {
  it('装備中の個体はサルベージを拒否される(明示的unequipなし)', () => {
    acquireLease();
    const loadout = useSaveStore.getState().equipmentLoadout;
    const result = useSaveStore.getState().salvageAction(loadout.magnetItemId);
    expect(result).toMatchObject({ ok: false });
  });

  it('未装備の個体はサルベージでき、ギヤの場合は対応するbearingも同時に削除される', () => {
    acquireLease();
    useSaveStore.getState().purchaseMaterialAction('gear-pom');
    const newGear = readPersisted().inventory.items.filter((i) => i.family === 'gear').at(-1);
    expect(newGear).toBeTruthy();
    const bearingCountBefore = readPersisted().inventory.bearingAssemblies.length;
    const result = useSaveStore.getState().salvageAction(newGear!.itemId);
    expect(result.ok).toBe(true);
    expect(readPersisted().inventory.bearingAssemblies.length).toBe(bearingCountBefore - 1);
  });
});

// motorRunContext/GEAR_TOTAL_TOOTH_COUNTは今後のvehicle文脈テスト拡張用に保持する
void motorRunContext;
void GEAR_TOTAL_TOOTH_COUNT;

// ---------------------------------------------------------------------------
// P3-4 G1b: beginRunActionWithPreparation(A3、arbiter追加裁定Q10 §1〜§7+§8補足裁定、
// 人間再承認項目Q〈2026-08-18承認済み〉)。docs/phase3-p3-4-ui-plan.md v13 §6.5・§23 DoD25〜27。
//
// A3の核心は「config構築(prepare)の成功が確定するまでrunSequenceを消費しない」ことと、
// 「commit後のcaptureRunSnapshot例外でruntime stateを取り残さない」ことの2点である。
// ---------------------------------------------------------------------------

/** prepareが成功する場合のcallback(motor文脈のsnapshotInputを返す)。 */
function okPrepare(): RunPreparationCallback {
  return () => ({ ok: true, snapshotInput: motorSnapshotInput() });
}

describe('P3-4 G1b beginRunActionWithPreparation(A3、Q10)', () => {
  // --- DoD26: S-5の全失敗経路×4不変条件 -----------------------------------
  // prepareの3失敗経路(resolver/compose/有限性)+gate失敗+storage書込み失敗のいずれでも、
  // nextRunSequence不変・pendingRunEquipmentSnapshot不変・RunSnapshot不生成・
  // gameStoreローカルruntime state不変(currentRunSequence/pendingRunSaveId)が成立する。
  describe('DoD26: S-5の失敗経路×4不変条件', () => {
    type PreparationFailure = Extract<RunPreparationResult, { ok: false }>;
    const preparationFailures: readonly [string, PreparationFailure][] = [
      ['resolver失敗(missingRoleあり)', { ok: false, reason: 'ローター個体の導線素材が特定できません', missingRole: 'rotor' }],
      ['compose失敗(missingRoleなし)', { ok: false, reason: 'wire-copper: 未登録の導線素材IDです' }],
      ['有限性検証失敗(missingRoleなし)', { ok: false, reason: 'motorConfig.coilTurnsが非有限値です: NaN' }],
    ];

    it.each(preparationFailures)('%s のとき、runSequenceを消費せずruntime stateも変更しない', (_label, failure) => {
      acquireLease();
      const beforeNext = readPersisted().saveMeta.nextRunSequence;

      const result = useSaveStore.getState().beginRunActionWithPreparation('motor', () => failure);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(failure.reason);
      // (1) nextRunSequence不変(永続実体・in-memoryとも)
      expect(readPersisted().saveMeta.nextRunSequence).toBe(beforeNext);
      expect(useSaveStore.getState().saveMeta.nextRunSequence).toBe(beforeNext);
      // (2) pendingRunEquipmentSnapshot不変(null のまま)
      expect(useSaveStore.getState().pendingRunEquipmentSnapshot).toBeNull();
      // (3)(4) runtime state不変
      expect(useSaveStore.getState().currentRunSequence).toBeNull();
      expect(useSaveStore.getState().pendingRunSaveId).toBeNull();
    });

    it('resolver失敗腕はmissingRoleを保持し、generic腕はmissingRoleキー自体を持たない(P19、型のnarrowingを壊さない)', () => {
      acquireLease();
      const withRole = useSaveStore.getState().beginRunActionWithPreparation('motor', () => ({
        ok: false, reason: '装備が見つかりません', missingRole: 'magnet',
      }));
      expect(withRole).toMatchObject({ ok: false, missingRole: 'magnet' });

      const generic = useSaveStore.getState().beginRunActionWithPreparation('motor', () => ({
        ok: false, reason: 'config構築に失敗しました',
      }));
      expect(generic.ok).toBe(false);
      // undefinedが入っているのではなく、キー自体が存在しないこと
      expect('missingRole' in generic).toBe(false);
    });

    it('gate失敗(lease未取得)のとき、prepareは一度も呼ばれず4不変条件も成立する', () => {
      // acquireLeaseを呼ばない=leaseNotAcquired
      const beforeNext = readPersisted().saveMeta.nextRunSequence;
      const prepare = vi.fn(okPrepare());

      const result = useSaveStore.getState().beginRunActionWithPreparation('motor', prepare);

      expect(result).toMatchObject({ ok: false, reason: 'leaseNotAcquired' });
      expect(prepare).not.toHaveBeenCalled(); // RunSnapshotが構築される余地すらない
      expect(readPersisted().saveMeta.nextRunSequence).toBe(beforeNext);
      expect(useSaveStore.getState().currentRunSequence).toBeNull();
      expect(useSaveStore.getState().pendingRunEquipmentSnapshot).toBeNull();
      expect(useSaveStore.getState().pendingRunSaveId).toBeNull();
    });

    it('gate失敗(runInProgress)のとき、prepareは一度も呼ばれない', () => {
      acquireLease();
      const first = useSaveStore.getState().beginRunActionWithPreparation('motor', okPrepare());
      expect(first.ok).toBe(true);

      const prepare = vi.fn(okPrepare());
      const second = useSaveStore.getState().beginRunActionWithPreparation('motor', prepare);
      expect(second).toMatchObject({ ok: false, reason: 'runInProgress' });
      expect(prepare).not.toHaveBeenCalled();
    });

    it('storage書込み失敗のとき、runtime stateを変更せずstorageErrorを返す(RunSnapshotも作らない)', () => {
      acquireLease();
      const beforeNext = readPersisted().saveMeta.nextRunSequence;
      const setItemSpy = vi.spyOn(fakeStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });

      const result = useSaveStore.getState().beginRunActionWithPreparation('motor', okPrepare());

      expect(result).toMatchObject({ ok: false, reason: 'storageError' });
      setItemSpy.mockRestore();
      expect(readPersisted().saveMeta.nextRunSequence).toBe(beforeNext);
      expect(useSaveStore.getState().currentRunSequence).toBeNull();
      expect(useSaveStore.getState().pendingRunEquipmentSnapshot).toBeNull();
      expect(useSaveStore.getState().pendingRunSaveId).toBeNull();
    });
  });

  // --- DoD25: snapshotCaptureFailed(A3必須修正2点の検証) --------------------
  describe('DoD25: snapshotCaptureFailed(commit後のcaptureRunSnapshot例外)', () => {
    /** structuredCloneが投げる状況を、cloneできない値(関数)をsnapshotInputへ混ぜて再現する。 */
    function throwingPrepare(): RunPreparationCallback {
      return () => ({
        ok: true,
        snapshotInput: {
          ...motorSnapshotInput(),
          // structuredCloneは関数をDataCloneErrorで拒否する(captureRunSnapshotは
          // destructionConfigをstructuredCloneするため、ここで例外が発生する)
          destructionConfig: { ...goodDestructionConfig(), notCloneable: () => 1 } as unknown as DestructionConfig,
        },
      });
    }

    it('(i) 例外を未捕捉で伝播させず {ok:false, reason:"snapshotCaptureFailed"} を返す', () => {
      acquireLease();
      const result = useSaveStore.getState().beginRunActionWithPreparation('motor', throwingPrepare());
      expect(result).toEqual({ ok: false, reason: 'snapshotCaptureFailed' });
    });

    it('(ii) runtime専用3フィールドがすべてnullへ明示リセットされる', () => {
      acquireLease();
      useSaveStore.getState().beginRunActionWithPreparation('motor', throwingPrepare());
      expect(useSaveStore.getState().currentRunSequence).toBeNull();
      expect(useSaveStore.getState().pendingRunEquipmentSnapshot).toBeNull();
      expect(useSaveStore.getState().pendingRunSaveId).toBeNull();
    });

    it('(iii) 直後の再呼出しがrunInProgressで拒否されない(ソフトロックが発生しない)', () => {
      acquireLease();
      const failed = useSaveStore.getState().beginRunActionWithPreparation('motor', throwingPrepare());
      expect(failed).toMatchObject({ ok: false, reason: 'snapshotCaptureFailed' });

      // ページリロードなしで再挑戦できること(arbiter裁定Q10 §1の具体的負例の直接確認)
      const retry = useSaveStore.getState().beginRunActionWithPreparation('motor', okPrepare());
      expect(retry.ok).toBe(true);
    });

    it('(iv) nextRunSequenceはcommit済みのままロールバックされず、孤立runSequenceが1件残る', () => {
      acquireLease();
      const beforeNext = readPersisted().saveMeta.nextRunSequence;

      useSaveStore.getState().beginRunActionWithPreparation('motor', throwingPrepare());

      // 孤立runSequence1件を許容する(P3-0-Q1の高水位意味論が冪等skipとして吸収する)
      expect(readPersisted().saveMeta.nextRunSequence).toBe(beforeNext + 1);
      expect(useSaveStore.getState().saveMeta.nextRunSequence).toBe(beforeNext + 1);
    });
  });

  // --- DoD27: success pathの順序と単一出典 ---------------------------------
  describe('DoD27: success path(永続commit→captureRunSnapshotの順、同一selection/sequence)', () => {
    it('prepareはpureBeginRunのゲート通過後・永続commit前にexact1回だけ呼ばれる', () => {
      acquireLease();
      const beforeNext = readPersisted().saveMeta.nextRunSequence;
      let nextRunSequenceAtPrepareTime: number | null = null;
      const prepare = vi.fn<RunPreparationCallback>(() => {
        // prepare実行時点では、まだ永続側のnextRunSequenceが進んでいないこと
        nextRunSequenceAtPrepareTime = readPersisted().saveMeta.nextRunSequence;
        return { ok: true, snapshotInput: motorSnapshotInput() };
      });

      const result = useSaveStore.getState().beginRunActionWithPreparation('motor', prepare);

      expect(prepare).toHaveBeenCalledTimes(1);
      expect(nextRunSequenceAtPrepareTime).toBe(beforeNext); // commit前に呼ばれた
      expect(result.ok).toBe(true);
      expect(readPersisted().saveMeta.nextRunSequence).toBe(beforeNext + 1); // commitは後
    });

    it('prepareへ渡されるequipmentSnapshotは、成功時の戻り値equipmentSnapshotと同一実体である(単一出典、P3-1-Q9)', () => {
      acquireLease();
      let passedSnapshot: EquipmentIdSnapshot | null = null;
      const result = useSaveStore.getState().beginRunActionWithPreparation('motor', (_l, _i, equipmentSnapshot) => {
        passedSnapshot = equipmentSnapshot;
        return { ok: true, snapshotInput: motorSnapshotInput() };
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(passedSnapshot).not.toBeNull();
        expect(result.equipmentSnapshot).toBe(passedSnapshot); // 参照同一(再計算していない)
        expect(useSaveStore.getState().pendingRunEquipmentSnapshot).toBe(result.equipmentSnapshot);
      }
    });

    it('prepareへ渡されるloadoutはbatteryItemId非nullで、fresh実体と一致する(trusted narrowing、Q10 §2)', () => {
      acquireLease();
      const freshLoadout = readPersisted().equipmentLoadout;
      let passedBatteryItemId: string | null = null;
      useSaveStore.getState().beginRunActionWithPreparation('motor', (loadout) => {
        passedBatteryItemId = loadout.batteryItemId;
        return { ok: true, snapshotInput: motorSnapshotInput() };
      });
      expect(passedBatteryItemId).toBe(freshLoadout.batteryItemId);
      expect(passedBatteryItemId).not.toBeNull();
    });

    it('成功時、runSequence・runtime state・RunSnapshotが整合して確定する', () => {
      acquireLease();
      const beforeNext = readPersisted().saveMeta.nextRunSequence;

      const result = useSaveStore.getState().beginRunActionWithPreparation('motor', okPrepare());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.runSequence).toBe(beforeNext);
        expect(useSaveStore.getState().currentRunSequence).toBe(result.runSequence);
        expect(useSaveStore.getState().pendingRunSaveId).toBe(readPersisted().saveMeta.saveId);
        // captureRunSnapshotの戻り値(contractVersion 3・recipeKeyを含む本物のRunSnapshot)
        expect(result.runSnapshot.contractVersion).toBe(3);
        expect(result.runSnapshot.recipeKey).toBe(motorSnapshotInput().recipeKey);
        expect(restoreRunSnapshot(JSON.parse(JSON.stringify(result.runSnapshot))).ok).toBe(true);
      }
    });
  });

  // --- P4是正: gate失敗(pendingApplicationExists)経路 -----------------------
  it('gate失敗(pendingApplicationExists)のとき、prepareは呼ばれずS-5の4不変条件が成立する', () => {
    acquireLease();
    const fresh = readPersisted();
    const envelope: RunApplicationEnvelope = {
      runKey: { saveId: fresh.saveMeta.saveId, runSequence: 1 },
      leaseToken: fresh.saveMeta.leaseToken,
      outcome: nonDestructionOutcome([eventOf('D01')]),
      equipmentSnapshot: captureEquipmentIdSnapshot(fresh.equipmentLoadout as EquipmentLoadout & { batteryItemId: string }, 'motor'),
      notebookRecord: sessionRecord('pending-1'),
    };
    __testOnly.writeV16({ ...fresh, saveMeta: { ...fresh.saveMeta, pendingApplication: envelope } });
    const beforeSeq = readPersisted().saveMeta.nextRunSequence;
    const beforeGameRuntime = { ...useGameStore.getState() }._runAccumulator;
    const prepare = vi.fn(okPrepare());

    const result = useSaveStore.getState().beginRunActionWithPreparation('motor', prepare);

    expect(result).toMatchObject({ ok: false, reason: 'pendingApplicationExists' });
    expect(prepare).not.toHaveBeenCalled(); // RunSnapshot/RunAccumulatorとも不生成
    expect(readPersisted().saveMeta.nextRunSequence).toBe(beforeSeq);
    expect(useSaveStore.getState().pendingRunEquipmentSnapshot).toBeNull();
    expect(useSaveStore.getState().currentRunSequence).toBeNull();
    expect(useGameStore.getState()._runAccumulator).toBe(beforeGameRuntime); // gameStoreローカルruntime state不変
  });

  // --- 既存beginRunActionへの非干渉(Q10 §1の「無改修のまま並存」) -----------
  it('既存beginRunActionは無改修のまま動作し、新regressionを生まない', () => {
    acquireLease();
    const beforeNext = readPersisted().saveMeta.nextRunSequence;
    const legacy = useSaveStore.getState().beginRunAction('motor');
    expect(legacy.ok).toBe(true);
    expect(readPersisted().saveMeta.nextRunSequence).toBe(beforeNext + 1);
  });
});

// ---------------------------------------------------------------------------
// P3-4 G7(項目J・K、人間承認2026-08-20): SCHEMA_VERSION 1→2 migration。
// J(`InstrumentOwnership`追加)とK(`CodexRecordEntry`拡張)は**同一migrationへ同梱**する
// (分割禁止、arbiter申し送り1)。失敗分類は次のとおり——
//   旧/新validator失敗 = corrupted / I/O失敗 = storageError /
//   書戻し失敗時にメモリ上だけ成功扱いにせず、次回起動で再試行できる冪等設計。
// ---------------------------------------------------------------------------
describe('P3-4 G7: SCHEMA_VERSION 1→2 migration(項目J・K同梱)', () => {
  /**
   * v1形状のstateをSAVE_KEYへ直接書き込む。
   * v1は`instrumentOwnership`(v2で追加)も、ローターの`winding`/`coatingDamageFraction`
   * (P4-1Aのv3で追加)も持たない——現在のfreshBootstrapから両方を取り除いて再現する。
   */
  function writeV1Save(mutate: (state: Record<string, unknown>) => void = () => {}): void {
    const fresh = __testOnly.freshBootstrap() as unknown as Record<string, unknown>;
    const { instrumentOwnership: _omitted, ...v1State } = fresh;
    v1State.schemaVersion = 1;
    v1State.inventory = stripV3RotorFields(v1State.inventory);
    mutate(v1State);
    fakeStorage.setItem('v16:save', JSON.stringify({ state: v1State, version: 1 }));
  }

  /** v3で追加したローターfieldを取り除き、v1/v2時点の形へ戻す。 */
  function stripV3RotorFields(inventory: unknown): unknown {
    const inv = inventory as Record<string, unknown>;
    if (!Array.isArray(inv.rotorAssemblies)) return inventory;
    return {
      ...inv,
      rotorAssemblies: (inv.rotorAssemblies as Record<string, unknown>[]).map((r) => {
        const { winding: _w, coatingDamageFraction: _c, ...rest } = r;
        return rest;
      }),
    };
  }

  /** v2形状(instrumentOwnershipはあるが、v3のローターfieldは無い)。 */
  function writeV2Save(mutate: (state: Record<string, unknown>) => void = () => {}): void {
    const fresh = __testOnly.freshBootstrap() as unknown as Record<string, unknown>;
    const v2State = { ...fresh, schemaVersion: 2, inventory: stripV3RotorFields(fresh.inventory) };
    mutate(v2State);
    fakeStorage.setItem('v16:save', JSON.stringify({ state: v2State, version: 2 }));
  }

  beforeEach(() => {
    fakeStorage = makeFakeLocalStorage();
    // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
    globalThis.localStorage = fakeStorage;
  });

  it('v1セーブはcorruptedにならず、instrumentOwnershipが空で補完されて読める(既存データの救済)', () => {
    writeV1Save();

    const result = __testOnly.readLatestV16();

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.state.schemaVersion).toBe(3);
    expect(result.state.instrumentOwnership).toEqual({ ownedInstrumentIds: [] });
  });

  it('migration結果はその場で書き戻される(次回起動でv2として読める=冪等に収束する)', () => {
    writeV1Save();
    __testOnly.readLatestV16();

    // 書き戻し後の生データは最新版(v3)になっている
    const raw = JSON.parse(fakeStorage.getItem('v16:save')!) as { version: number; state: { schemaVersion: number } };
    expect(raw.version).toBe(3);
    expect(raw.state.schemaVersion).toBe(3);
    // 2回目の読み取りはmigrationを経ずそのまま成功する
    expect(__testOnly.readLatestV16().kind).toBe('ok');
  });

  it('既存フィールドはmigrationで書き換えられない(追加のみ)', () => {
    writeV1Save((state) => {
      (state.progress as Record<string, unknown>).selectedTrackId = 'hill-climb';
    });

    const result = __testOnly.readLatestV16();

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.state.progress.selectedTrackId).toBe('hill-climb');
  });

  it('v1データ自体が壊れている場合はcorrupted(migrationのせいで壊れたように見せない)', () => {
    writeV1Save((state) => { state.inventory = { cashG: -1 }; });

    expect(__testOnly.readLatestV16().kind).toBe('corrupted');
  });

  it('v1が新フィールドを持っている場合は不整合としてcorrupted', () => {
    writeV1Save((state) => { state.instrumentOwnership = { ownedInstrumentIds: [] }; });

    expect(__testOnly.readLatestV16().kind).toBe('corrupted');
  });

  it('書戻しのI/O失敗はstorageError——メモリ上だけ成功扱いにしない', () => {
    writeV1Save();
    const originalSetItem = fakeStorage.setItem;
    fakeStorage.setItem = () => { throw new Error('quota exceeded'); };

    const result = __testOnly.readLatestV16();

    expect(result.kind).toBe('storageError');
    fakeStorage.setItem = originalSetItem;
    // 書けなかったのでストレージはv1のまま。次回起動で再試行され、成功すればv3へ収束する。
    const raw = JSON.parse(fakeStorage.getItem('v16:save')!) as { version: number };
    expect(raw.version).toBe(1);
    expect(__testOnly.readLatestV16().kind).toBe('ok');
  });

  it('項目K: legacy codexRecord(2フィールド不在)を持つv1セーブも読める', () => {
    writeV1Save((state) => {
      const enc = state.encyclopedia as Record<string, unknown>;
      enc.discoveredModes = ['D01'];
      enc.codexRecords = [{
        modeId: 'D01',
        firstDiscoveredAtRunSequence: 1,
        replaySnapshot: validReplaySnapshot(),
      }];
    });

    const result = __testOnly.readLatestV16();

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    const record = result.state.encyclopedia.codexRecords[0]!;
    expect(record.modeId).toBe('D01');
    expect('discoveryEvent' in record).toBe(false);
    expect('runDegradationDiffs' in record).toBe(false);
  });

  it('項目K: 片方のフィールドだけ持つcodexRecordは交差不変条件違反としてcorrupted', () => {
    writeV1Save((state) => {
      const enc = state.encyclopedia as Record<string, unknown>;
      enc.discoveredModes = ['D01'];
      enc.codexRecords = [{
        modeId: 'D01',
        firstDiscoveredAtRunSequence: 1,
        replaySnapshot: validReplaySnapshot(),
        runDegradationDiffs: [], // discoveryEventが無いのに片方だけ存在する
      }];
    });

    expect(__testOnly.readLatestV16().kind).toBe('corrupted');
  });

  // -------------------------------------------------------------------------
  // P4-1A(2026-08-28人間承認): SCHEMA_VERSION 2→3 migration。
  // 旧ローターは winding:{kind:'legacy'} / coatingDamageFraction:0 とし、
  // **存在しなかった巻線記録を捏造しない**。
  // -------------------------------------------------------------------------

  it('v2セーブはcorruptedにならず、旧ローターがlegacy由来として補完される', () => {
    writeV2Save();

    const result = __testOnly.readLatestV16();

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.state.schemaVersion).toBe(3);
    for (const rotor of result.state.inventory.rotorAssemblies) {
      expect(rotor.winding).toStrictEqual({ kind: 'legacy' });
      expect(rotor.coatingDamageFraction).toBe(0);
    }
  });

  it('v2→v3は追加のみで既存フィールドを書き換えない', () => {
    writeV2Save((state) => {
      (state.progress as Record<string, unknown>).selectedTrackId = 'hill-climb';
    });

    const result = __testOnly.readLatestV16();

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.state.progress.selectedTrackId).toBe('hill-climb');
    const rotor = result.state.inventory.rotorAssemblies[0]!;
    expect(rotor.assemblyId).toBe('initial-rotor-01');
    expect(rotor.consumedWireM).toBe(1);
  });

  it('v1セーブはv2を経てv3まで一度に収束する', () => {
    writeV1Save();

    const result = __testOnly.readLatestV16();

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.state.schemaVersion).toBe(3);
    expect(result.state.instrumentOwnership).toEqual({ ownedInstrumentIds: [] });
    expect(result.state.inventory.rotorAssemblies[0]!.winding).toStrictEqual({ kind: 'legacy' });
  });

  it('v2が新フィールドを持っている場合は不整合としてcorrupted', () => {
    writeV2Save((state) => {
      const inv = state.inventory as Record<string, unknown>;
      const rotors = inv.rotorAssemblies as Record<string, unknown>[];
      rotors[0] = { ...rotors[0]!, coatingDamageFraction: 0 };
    });

    expect(__testOnly.readLatestV16().kind).toBe('corrupted');
  });

  it('v2→v3の書戻しI/O失敗はstorageError——メモリ上だけ成功扱いにしない', () => {
    writeV2Save();
    const originalSetItem = fakeStorage.setItem;
    fakeStorage.setItem = () => { throw new Error('quota exceeded'); };

    expect(__testOnly.readLatestV16().kind).toBe('storageError');

    fakeStorage.setItem = originalSetItem;
    const raw = JSON.parse(fakeStorage.getItem('v16:save')!) as { version: number };
    expect(raw.version).toBe(2);
    expect(__testOnly.readLatestV16().kind).toBe('ok');
  });

  it('v3のローターfieldが壊れているセーブはfail-closed(部分救済しない)', () => {
    const cases: { readonly label: string; readonly winding: unknown; readonly damage: unknown }[] = [
      { label: 'coatingDamageFraction=-0.01', winding: { kind: 'legacy' }, damage: -0.01 },
      { label: 'coatingDamageFraction=1.01', winding: { kind: 'legacy' }, damage: 1.01 },
      { label: 'legacy枝が余分なフィールドを持つ', winding: { kind: 'legacy', record: [] }, damage: 0 },
      { label: '未知のkind', winding: { kind: 'wound' }, damage: 0 },
      { label: 'recordedなのに記録が非量子化', winding: { kind: 'recorded', record: [{ position: 0.3, arm: 'left', direction: 1, tension: 0.5 }], wireGaugeMm: 0.4, parallelStrands: 1 }, damage: 0 },
      { label: 'recordedなのにparallelStrandsが3', winding: { kind: 'recorded', record: [], wireGaugeMm: 0.4, parallelStrands: 3 }, damage: 0 },
      { label: 'recordedが余分なfieldを持つ(coatingMaterialId注入)', winding: { kind: 'recorded', record: Array.from({ length: 30 }, () => ({ position: 0.5, arm: 'left', direction: 1, tension: 0.5 })), wireGaugeMm: 0.4, parallelStrands: 1, coatingMaterialId: 'coating-polyester' }, damage: 0 },
      { label: 'recordedがfieldを欠く(parallelStrands不在)', winding: { kind: 'recorded', record: Array.from({ length: 30 }, () => ({ position: 0.5, arm: 'left', direction: 1, tension: 0.5 })), wireGaugeMm: 0.4 }, damage: 0 },
      { label: 'recordedなのに記録が151ターン', winding: { kind: 'recorded', record: Array.from({ length: 151 }, () => ({ position: 0.5, arm: 'left', direction: 1, tension: 0.5 })), wireGaugeMm: 0.4, parallelStrands: 1 }, damage: 0 },
    ];
    for (const testCase of cases) {
      fakeStorage = makeFakeLocalStorage();
      // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
      globalThis.localStorage = fakeStorage;
      const fresh = __testOnly.freshBootstrap() as unknown as Record<string, unknown>;
      const inv = fresh.inventory as Record<string, unknown>;
      const rotors = inv.rotorAssemblies as Record<string, unknown>[];
      const broken = {
        ...fresh,
        inventory: { ...inv, rotorAssemblies: [{ ...rotors[0]!, winding: testCase.winding, coatingDamageFraction: testCase.damage }] },
      };
      fakeStorage.setItem('v16:save', JSON.stringify({ state: broken, version: 3 }));
      expect(__testOnly.readLatestV16().kind, testCase.label).toBe('corrupted');
    }
  });

  it('v3 saveのprogress.config.windingTurnsRatioは(0,1]だけを受理する', () => {
    const rejected: unknown[] = [0, -0.1, 1.0001, '0.5', null, Number.NaN, Number.POSITIVE_INFINITY];
    for (const value of rejected) {
      fakeStorage = makeFakeLocalStorage();
      // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
      globalThis.localStorage = fakeStorage;
      const fresh = __testOnly.freshBootstrap() as unknown as Record<string, unknown>;
      const progress = fresh.progress as Record<string, unknown>;
      const state = { ...fresh, progress: { ...progress, config: { ...(progress.config as object), windingTurnsRatio: value } } };
      fakeStorage.setItem('v16:save', JSON.stringify({ state, version: 3 }));
      expect(__testOnly.readLatestV16().kind, `value=${String(value)}`).toBe('corrupted');
    }

    const accepted: (number | undefined)[] = [undefined, 1, 0.9333, 1 / 256];
    for (const value of accepted) {
      fakeStorage = makeFakeLocalStorage();
      // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
      globalThis.localStorage = fakeStorage;
      const fresh = __testOnly.freshBootstrap() as unknown as Record<string, unknown>;
      const progress = fresh.progress as Record<string, unknown>;
      const config = { ...(progress.config as object) } as Record<string, unknown>;
      if (value === undefined) delete config.windingTurnsRatio; else config.windingTurnsRatio = value;
      const state = { ...fresh, progress: { ...progress, config } };
      fakeStorage.setItem('v16:save', JSON.stringify({ state, version: 3 }));
      expect(__testOnly.readLatestV16().kind, `value=${String(value)}`).toBe('ok');
    }
  });

  it('recorded個体は復元境界でも10〜150ターン・物理上限以下だけを受理する', () => {
    function writeRecordedSave(turnCount: number, wireGaugeMm: number, parallelStrands: 1 | 2): void {
      fakeStorage = makeFakeLocalStorage();
      // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
      globalThis.localStorage = fakeStorage;
      const fresh = __testOnly.freshBootstrap() as unknown as Record<string, unknown>;
      const inv = fresh.inventory as Record<string, unknown>;
      const rotors = inv.rotorAssemblies as Record<string, unknown>[];
      const record = Array.from({ length: turnCount }, () => ({ position: 0.5, arm: 'left', direction: 1, tension: 0.5 }));
      const state = {
        ...fresh,
        inventory: {
          ...inv,
          rotorAssemblies: [{ ...rotors[0]!, winding: { kind: 'recorded', record, wireGaugeMm, parallelStrands }, coatingDamageFraction: 0 }],
        },
      };
      fakeStorage.setItem('v16:save', JSON.stringify({ state, version: 3 }));
    }

    // 走行不可のターン数は復元境界でも拒否する(生成境界を迂回させない)
    for (const turnCount of [0, 1, 9]) {
      writeRecordedSave(turnCount, 0.4, 1);
      expect(__testOnly.readLatestV16().kind, `turns=${turnCount}`).toBe('corrupted');
    }

    // 受理境界(物理上限内)
    for (const turnCount of [10, 150]) {
      writeRecordedSave(turnCount, 0.4, 1);
      expect(__testOnly.readLatestV16().kind, `turns=${turnCount}`).toBe('ok');
    }

    // 物理上限超過(線径0.8mmでは150ターン巻けない)
    writeRecordedSave(150, 0.8, 1);
    expect(__testOnly.readLatestV16().kind).toBe('corrupted');
  });

  it('recordedなローターを持つv3セーブはそのまま読める(往復)', () => {
    const fresh = __testOnly.freshBootstrap() as unknown as Record<string, unknown>;
    const inv = fresh.inventory as Record<string, unknown>;
    const rotors = inv.rotorAssemblies as Record<string, unknown>[];
    const record = Array.from({ length: 30 }, (_, i) => ({ position: 0.25, arm: 'left', direction: i === 10 ? -1 : 1, tension: 0.5 }));
    const state = {
      ...fresh,
      inventory: {
        ...inv,
        rotorAssemblies: [{ ...rotors[0]!, winding: { kind: 'recorded', record, wireGaugeMm: 0.4, parallelStrands: 1 }, coatingDamageFraction: 0 }],
      },
    };
    fakeStorage.setItem('v16:save', JSON.stringify({ state, version: 3 }));

    const result = __testOnly.readLatestV16();

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    const winding = result.state.inventory.rotorAssemblies[0]!.winding;
    expect(winding.kind).toBe('recorded');
    if (winding.kind !== 'recorded') throw new Error('unreachable');
    expect(winding.record).toHaveLength(30);
    expect(winding.record[10]!.direction).toBe(-1);
  });

});

// ---------------------------------------------------------------------------
// P3-4 G7(項目L): 計測器購入action。既存のlease/pending gateを通り、
// 買い切り・非消耗(spec §10)として二重購入を拒否する。
// ---------------------------------------------------------------------------
describe('P3-4 G7: purchaseInstrumentAction', () => {
  function seedDiscoveredD07AndCash(cashG: number): void {
    fakeStorage = makeFakeLocalStorage();
    // @ts-expect-error テスト用
    globalThis.localStorage = fakeStorage;
    const fresh = __testOnly.freshBootstrap();
    const seeded = {
      ...fresh,
      inventory: { ...fresh.inventory, cashG },
      // discoveredModesとcodexRecordsのmodeId集合は一致していなければならない(既存不変条件)。
      // 片方だけ立てるとvalidatorがcorruptedにし、gateで弾かれて購入自体に到達しない。
      encyclopedia: {
        discoveredModes: ['D07' as const],
        codexRecords: [{
          modeId: 'D07' as const,
          firstDiscoveredAtRunSequence: 1,
          replaySnapshot: validReplaySnapshot(),
        }],
      },
    };
    __testOnly.writeV16(seeded);
    useSaveStore.setState({
      ...seeded, currentRunSequence: null, leaseState: 'leaseNotAcquired',
      pendingRunEquipmentSnapshot: null, pendingRunSaveId: null, bootstrapError: null,
    });
    useSaveStore.getState()._evaluateLeaseOnce(new Date(0).toISOString());
  }

  it('D07発見後・所持金十分なら購入でき、所持状態と残金が永続化される', () => {
    seedDiscoveredD07AndCash(1000);

    const result = useSaveStore.getState().purchaseInstrumentAction('gaussMeter');

    expect(result.ok).toBe(true);
    expect(useSaveStore.getState().instrumentOwnership.ownedInstrumentIds).toEqual(['gaussMeter']);
    expect(useSaveStore.getState().inventory.cashG).toBe(200); // 1000 - 800
    // メモリ上だけでなく永続実体にも反映されている
    const persisted = readPersisted();
    expect(persisted.instrumentOwnership.ownedInstrumentIds).toEqual(['gaussMeter']);
    expect(persisted.inventory.cashG).toBe(200);
  });

  it('二重購入は拒否され、残金が二重に引かれない(買い切り・非消耗)', () => {
    seedDiscoveredD07AndCash(2000);
    useSaveStore.getState().purchaseInstrumentAction('gaussMeter');

    const second = useSaveStore.getState().purchaseInstrumentAction('gaussMeter');

    expect(second.ok).toBe(false);
    expect(useSaveStore.getState().inventory.cashG).toBe(1200); // 1回分だけ
    expect(useSaveStore.getState().instrumentOwnership.ownedInstrumentIds).toEqual(['gaussMeter']);
  });

  it('未解禁(D07未発見)では購入できず、所持金も減らない', () => {
    fakeStorage = makeFakeLocalStorage();
    // @ts-expect-error テスト用
    globalThis.localStorage = fakeStorage;
    const fresh = __testOnly.freshBootstrap();
    const seeded = { ...fresh, inventory: { ...fresh.inventory, cashG: 5000 } };
    __testOnly.writeV16(seeded);
    useSaveStore.setState({
      ...seeded, currentRunSequence: null, leaseState: 'leaseNotAcquired',
      pendingRunEquipmentSnapshot: null, pendingRunSaveId: null, bootstrapError: null,
    });
    useSaveStore.getState()._evaluateLeaseOnce(new Date(0).toISOString());

    const result = useSaveStore.getState().purchaseInstrumentAction('gaussMeter');

    expect(result.ok).toBe(false);
    expect(useSaveStore.getState().inventory.cashG).toBe(5000);
    expect(useSaveStore.getState().instrumentOwnership.ownedInstrumentIds).toEqual([]);
  });

  it('所持金不足では購入できず、残金が負にならない', () => {
    seedDiscoveredD07AndCash(799);

    const result = useSaveStore.getState().purchaseInstrumentAction('gaussMeter');

    expect(result.ok).toBe(false);
    expect(useSaveStore.getState().inventory.cashG).toBe(799);
  });
});

// ---------------------------------------------------------------------------
// P4-1A(2026-08-28人間承認、承認項目9): completeRotorAssemblyActionの原子境界。
// 在庫消費・ローター生成・装備更新・カウンタ更新を1回の書込みで行い、失敗時は
// 何も変えない。
// ---------------------------------------------------------------------------
describe('P4-1A: completeRotorAssemblyActionの原子境界', () => {
  function command(turnCount = 30) {
    return {
      record: Array.from({ length: turnCount }, (_, i) => ({
        position: i < 21 ? 0.25 : 0.75,
        arm: (i < 21 ? 'left' : 'right') as 'left' | 'right',
        direction: (i === 10 ? -1 : 1) as 1 | -1,
        tension: 0.5,
      })),
      wireMaterialId: 'wire-copper-standard',
      windingWireGaugeMm: 0.4,
      windingParallelStrands: 1 as const,
      motorDraft: {
        slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 0.5,
        magnetDistanceMm: 10, batteryVoltage: 1.5 as const, varnished: true,
      },
    };
  }

  it('成功時: 在庫消費・ローター生成・装備更新・カウンタ更新が一度に永続化される', () => {
    acquireLease();
    const before = useSaveStore.getState();
    const beforeWireM = before.inventory.stackableStock.find((e) => e.family === 'wire')!;
    const beforeCounter = before.idCounters.nextAssemblyCounter;

    const result = useSaveStore.getState().completeRotorAssemblyAction(command());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = useSaveStore.getState();
    const afterWire = after.inventory.stackableStock.find((e) => e.family === 'wire')!;
    expect(afterWire.family === 'wire' && beforeWireM.family === 'wire' && afterWire.quantityM < beforeWireM.quantityM).toBe(true);
    expect(after.inventory.rotorAssemblies.some((r) => r.assemblyId === result.rotorAssemblyId)).toBe(true);
    expect(after.equipmentLoadout.rotorAssemblyId).toBe(result.rotorAssemblyId);
    expect(after.idCounters.nextAssemblyCounter).toBe(beforeCounter + 1);
    // 永続実体にも同じ内容が入っている(メモリだけの更新ではない)
    const persisted = readPersisted();
    expect(persisted.equipmentLoadout.rotorAssemblyId).toBe(result.rotorAssemblyId);
    expect(persisted.inventory.rotorAssemblies.some((r) => r.assemblyId === result.rotorAssemblyId)).toBe(true);
  });

  it('承認項目9: progress.configも同じ書込み境界で更新される', () => {
    acquireLease();
    const before = useSaveStore.getState().progress.config;

    const result = useSaveStore.getState().completeRotorAssemblyAction(command());

    expect(result.ok).toBe(true);
    const after = useSaveStore.getState().progress.config;
    expect(after.coilTurns).toBe(30);
    expect(after.windingTurnsRatio).toBeCloseTo((28 / 30) * 0.925, 12);
    expect(after.wireGaugeMm).toBe(0.4);
    expect(after.parallelStrands).toBe(1);
    expect(after).not.toBe(before);
    // 永続実体にも同じconfigが入っている
    const persisted = readPersisted();
    expect(persisted.progress.config.coilTurns).toBe(30);
    expect(persisted.progress.config.windingTurnsRatio).toBeCloseTo((28 / 30) * 0.925, 12);
  });

  it('生成されたローターはrecorded由来で、記録がそのまま保存される', () => {
    acquireLease();
    const result = useSaveStore.getState().completeRotorAssemblyAction(command());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rotor = readPersisted().inventory.rotorAssemblies.find((r) => r.assemblyId === result.rotorAssemblyId)!;
    expect(rotor.winding.kind).toBe('recorded');
    if (rotor.winding.kind !== 'recorded') return;
    expect(rotor.winding.record).toHaveLength(30);
    expect(rotor.winding.record[10]!.direction).toBe(-1);
    expect(rotor.coatingDamageFraction).toBe(0);
  });

  it('失敗時(9ターン)は在庫・装備・カウンタのいずれも変化しない', () => {
    acquireLease();
    const before = useSaveStore.getState();
    const beforeSnapshot = JSON.parse(JSON.stringify({
      inventory: before.inventory, loadout: before.equipmentLoadout, counters: before.idCounters,
    }));

    const result = useSaveStore.getState().completeRotorAssemblyAction(command(9));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('turnCountOutOfRange');
    const after = useSaveStore.getState();
    expect({ inventory: after.inventory, loadout: after.equipmentLoadout, counters: after.idCounters }).toStrictEqual(beforeSnapshot);
  });

  it('書込み失敗はpersistFailedで、in-memory stateも変化しない(configを含む)', () => {
    acquireLease();
    const beforeInventory = useSaveStore.getState().inventory;
    const beforeProgress = useSaveStore.getState().progress;
    const beforeConfig = beforeProgress.config;
    fakeStorage.setItem = () => { throw new Error('quota'); };

    const result = useSaveStore.getState().completeRotorAssemblyAction(command());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('persistFailed');
    expect(useSaveStore.getState().inventory).toBe(beforeInventory);
    expect(useSaveStore.getState().progress).toBe(beforeProgress);
    expect(useSaveStore.getState().progress.config).toBe(beforeConfig);
  });

  it('順逆同数の記録はinvalidRecordで拒否され、config/在庫/装備/カウンタが不変のまま書込みへ進まない', () => {
    acquireLease();
    const before = useSaveStore.getState();
    const beforeSnapshot = JSON.parse(JSON.stringify({
      inventory: before.inventory, loadout: before.equipmentLoadout,
      counters: before.idCounters, config: before.progress.config,
    }));
    let wrote = false;
    const originalSetItem = fakeStorage.setItem;
    fakeStorage.setItem = (...args: Parameters<typeof originalSetItem>) => { wrote = true; return originalSetItem(...args); };

    const result = useSaveStore.getState().completeRotorAssemblyAction({
      ...command(),
      record: Array.from({ length: 30 }, (_, i) => ({
        position: 0.5, arm: 'straddle' as const, direction: (i < 15 ? 1 : -1) as 1 | -1, tension: 0.5,
      })),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('invalidRecord');
    // 書込みへ進んでいない(persistFailedではなく、生成境界で止まっている)
    expect(wrote).toBe(false);
    fakeStorage.setItem = originalSetItem;
    const after = useSaveStore.getState();
    expect({
      inventory: after.inventory, loadout: after.equipmentLoadout,
      counters: after.idCounters, config: after.progress.config,
    }).toStrictEqual(beforeSnapshot);
  });

  it('連続して完成させるとassemblyIdが重複しない', () => {
    acquireLease();
    const first = useSaveStore.getState().completeRotorAssemblyAction(command());
    const second = useSaveStore.getState().completeRotorAssemblyAction(command());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.rotorAssemblyId).not.toBe(first.rotorAssemblyId);
    const ids = readPersisted().inventory.rotorAssemblies.map((r) => r.assemblyId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
