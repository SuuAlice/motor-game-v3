// P3-4 G1b: production配線(wrapper置換・motor-only終了ライフサイクル)
// docs/phase3-p3-4-ui-plan.md v13 §6.2・§6.3・§7・§17 G1b・§23 DoD3・15。
//
// production run runtime(accumulator/rng/runSequence)のreset処理はこの専用ファイルへ置く
// (既存gameStore.test.ts〈beforeEachなし〉・testRunStore.test.ts〈部分resetのみ〉には混在させない)。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareDestructionRun, useGameStore } from '../gameStore';
import { FLICK_INITIAL_OMEGA, MAX_FLICK_OMEGA } from '../../engine/constants';
import { computeEnergyBudgetJ } from '../../engine/trackPhysics';
import { GEAR_ASSUMED_RADIUS_M, GEAR_ASSUMED_THICKNESS_M } from '../../materials/gearInertia';
import { BRUSH_WEAR_RESISTANCE_PENALTY, GEAR_SEIZURE_EFFICIENCY_PENALTY, BEARING_SEIZURE_FRICTION_PENALTY } from '../../materials/wearReflection';
import { GEAR_TOTAL_TOOTH_COUNT } from '../../materials/inventoryItem';
import { captureEquipmentIdSnapshot, type EquipmentIdSnapshot } from '../runOutcomeApplication';

/** motor文脈のEquipmentIdSnapshotをテスト用に作る。 */
function captureEquipmentIdSnapshotForTest(loadout: EquipmentLoadout & { batteryItemId: string }): EquipmentIdSnapshot {
  return captureEquipmentIdSnapshot(loadout, 'motor');
}
import { useSaveStore, __testOnly } from '../saveStore';
import * as destructionOrchestration from '../../engine/destructionOrchestration';
import * as motorPhysics from '../../engine/motorPhysics';
import * as vehiclePhysics from '../../engine/vehiclePhysics';
import type { CaptureRunSnapshotInput } from '../../engine/destructionOrchestration';
import { createInitialDestructionState } from '../../engine/destructionModes';
import type { DestructionModeId } from '../../engine/destructionModes';
import {
  createInitialPlayerInventoryAndLoadout,
  deriveMaterialSelectionFromEquipment,
  type EquipmentLoadout,
} from '../runOutcomeApplication';
import { composeConfigFromMaterials, assembleDestructionConfig } from '../../materials/materialMapping';
import type { RunPreparationCallback } from '../saveStore';

/** motor文脈の有効なsnapshotInput(成功経路用、実assemblerを通す)。 */
function motorSnapshotInputFixture(): CaptureRunSnapshotInput {
  const { loadout, inventory } = createInitialPlayerInventoryAndLoadout();
  const resolved = deriveMaterialSelectionFromEquipment(
    loadout as EquipmentLoadout & { batteryItemId: string },
    inventory,
  );
  if (!resolved.ok) throw new Error('テスト前提が崩れています: resolverが失敗しました');
  const destructionConfig = assembleDestructionConfig(resolved.selection, resolved.equipmentContext);
  return {
    motorConfig: useGameStore.getState().config,
    carConfig: null,
    destructionConfig,
    runContext: { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null },
    initialMotorState: useGameStore.getState().simState,
    initialVehicleState: null,
    track: null,
    courseLengthM: null,
    slopeRad: null,
    seed: 1,
    initialDestructionState: createInitialDestructionState(destructionConfig.battery.profile),
    recipeKey: 'v1|wiring-test',
  };
}


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

/** saveStore.test.tsと同じfake storage/lease初期化パターンを再利用する(§7)。 */
function resetSaveStore() {
  fakeStorage = makeFakeLocalStorage();
  // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
  globalThis.localStorage = fakeStorage;
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
  useSaveStore.getState()._evaluateLeaseOnce(new Date(0).toISOString());
}

beforeEach(() => {
  resetSaveStore();
  // 明示reset(§7): 各テストは必ずfalseから始める
  useGameStore.setState({ _runAccumulator: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  useGameStore.setState({ _runAccumulator: null });
  useSaveStore.getState().stopLeaseLifecycle();
  // @ts-expect-error 後片付け
  delete globalThis.localStorage;
});

describe('§6.3・§7: wrapper置換(二重step防止)', () => {
  it('production経路ではstepMotorWithDestructionのみを呼び、gameStoreは直接stepを呼ばない(二重step防止)', () => {
    useGameStore.setState({});
    useGameStore.getState().flickStart();
    expect(useGameStore.getState()._runAccumulator).not.toBeNull();

    const wrapperSpy = vi.spyOn(destructionOrchestration, 'stepMotorWithDestruction');
    useGameStore.getState().stepSim(1 / 120);
    expect(wrapperSpy).toHaveBeenCalledTimes(1);
  });

  it('production経路のtest-runではstepTestRunWithDestructionのみを呼ぶ', () => {
    useGameStore.setState({});
    useGameStore.getState().startTestRun();
    expect(useGameStore.getState()._runAccumulator).not.toBeNull();

    const wrapperSpy = vi.spyOn(destructionOrchestration, 'stepTestRunWithDestruction');
    useGameStore.getState().stepTestRun(1 / 120);
    expect(wrapperSpy).toHaveBeenCalledTimes(1);
  });

  // P8是正: 旧版はここで「accumulatorが無ければ旧経路を実行する」という
  // 誤った挙動を固定していた。§7の厳密な排他(if true=新経路/else=旧経路)では、
  // flag=trueのときに旧stepへfallbackすることはない。
  it('accumulatorが無い(run未開始)とき、wrapperを呼ばずstateを変更しない', () => {
    useGameStore.setState({ _runAccumulator: null });
    const before = { ...useGameStore.getState() };
    const wrapperSpy = vi.spyOn(destructionOrchestration, 'stepMotorWithDestruction');
    const baseSpy = vi.spyOn(motorPhysics, 'step');

    useGameStore.getState().stepSim(1 / 120);

    expect(wrapperSpy).not.toHaveBeenCalled();
    expect(baseSpy).not.toHaveBeenCalled(); // 旧経路へfallbackしない
    expect(useGameStore.getState().simState).toBe(before.simState);
    expect(useGameStore.getState()._elapsedSec).toBe(before._elapsedSec);
  });

  it('test-runでもrun未開始ならwrapperを呼ばない', () => {
    useGameStore.setState({ _runAccumulator: null, testRunPhase: 'running' });
    const before = { ...useGameStore.getState() };
    const wrapperSpy = vi.spyOn(destructionOrchestration, 'stepTestRunWithDestruction');
    const baseSpy = vi.spyOn(vehiclePhysics, 'stepTestRun');

    useGameStore.getState().stepTestRun(1 / 120);

    expect(wrapperSpy).not.toHaveBeenCalled();
    expect(baseSpy).not.toHaveBeenCalled();
    expect(useGameStore.getState().vehicleState).toBe(before.vehicleState);
  });
});

describe('§6.2・DoD3: motor-only終了ライフサイクル(4入口・二重notebook生成ゼロ)', () => {
  // 4入口のうち、resetSim/setModeは「閉じて終わる」入口、flickStart/finishAssemblyは
  // 「前のrunを閉じてから新しいrunを開始する」入口である(§6.2の(2)(3))。
  // 前者はaccumulatorがnullになり、後者は別実体の新runが立つ——期待値を分けて固定する。
  const closingEntries: readonly [string, () => void][] = [
    ['resetSim', () => useGameStore.getState().resetSim()],
    ['setMode', () => useGameStore.getState().setMode('garage')],
  ];
  const restartingEntries: readonly [string, () => void][] = [
    ['flickStart再呼び出し', () => useGameStore.getState().flickStart()],
    ['finishAssembly再呼び出し', () => useGameStore.getState().finishAssembly(useGameStore.getState().config, 0)],
  ];

  it.each(closingEntries)('%s は進行中runを閉じる', (_label, invoke) => {
    useGameStore.setState({});
    useGameStore.getState().flickStart();
    // 旧経路が記録を作る条件(session sampleあり)を満たしておく
    useGameStore.getState().stepSim(0.2);
    expect(useGameStore.getState()._runAccumulator).not.toBeNull();
    invoke();

    expect(useGameStore.getState()._runAccumulator).toBeNull();
  });

  it.each(restartingEntries)('%s は前のrunを閉じてから新runを開始する', (_label, invoke) => {
    useGameStore.setState({});
    useGameStore.getState().flickStart();
    useGameStore.getState().stepSim(0.2);
    const previous = useGameStore.getState()._runAccumulator;
    expect(previous).not.toBeNull();
    invoke();

    // 新しいrunが立っており、前のrun実体とは別物である(前のrunは確定済み)
    const current = useGameStore.getState()._runAccumulator;
    expect(current).not.toBeNull();
    expect(current).not.toBe(previous);
  });

  it('finalizeMotorOnlyRunIfActiveは進行中runが無ければnullを返し、副作用を持たない', () => {
    useGameStore.setState({ _runAccumulator: null });
    expect(useGameStore.getState().finalizeMotorOnlyRunIfActive()).toBeNull();
    expect(useGameStore.getState()._runAccumulator).toBeNull();
  });

  it('進行中runに対してはmanualAbort相当のRunOutcomeをちょうど1回生成し、accumulatorを解放する', () => {
    useGameStore.setState({});
    useGameStore.getState().flickStart();

    const first = useGameStore.getState().finalizeMotorOnlyRunIfActive();
    expect(first).not.toBeNull();
    expect(first!.endReason).toBe('manualAbort');
    // 2回目は進行中runが無いのでnull(1 runにつきRunOutcome生成は1回)
    expect(useGameStore.getState().finalizeMotorOnlyRunIfActive()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P3-4 G1b: beginRunAction統合(S-5全経路×4不変条件・N-2後半・C-4/DoD20/21/27)
// UI計画v13 §23 DoD20・21・26・27、engine計画v14 §20.8 N-2後半。
//
// P5是正: S-5の4項目のうち「gameStoreローカルruntime state不変」はgameStore側の実stateを
// 指す(saveStoreのcurrentRunSequence/pendingRunSaveIdとは別物)。本describeでは
// (a) gameStoreの実runtime state(_runAccumulator等)のbefore/after、(b) RunSnapshot/capture未生成、
// (c) RunAccumulator未生成 を各経路で直接assertする。
// ---------------------------------------------------------------------------

/** gameStoreローカルruntime stateのうち、run進行に関わるものを丸ごと採取する。 */
function captureGameStoreRuntime() {
  const s = useGameStore.getState();
  return {
    _runAccumulator: s._runAccumulator,
    simState: s.simState,
    vehicleState: s.vehicleState,
    testRunPhase: s.testRunPhase,
    _sessionSeed: s._sessionSeed,
    _rngState: s._rngState,
    _vehicleRngState: s._vehicleRngState,
  };
}

describe('S-5: beginRun失敗時の4不変条件(全経路、P4・P5是正)', () => {
  /**
   * N-2後半(engine計画v14 §20.8): G1a′のN-2前半と同じ範囲外baseline
   * (chassisBaselineG=10 / baseGearEfficiency=0.8)を、beginRunAction統合経路で再現する。
   * 実際のcomposeConfigFromMaterialsへ通し、exact reasonとS-5不変条件を固定する。
   */
  function outOfRangeBaselinePrepare() {
    const { loadout, inventory } = createInitialPlayerInventoryAndLoadout();
    const resolved = deriveMaterialSelectionFromEquipment(
      loadout as EquipmentLoadout & { batteryItemId: string },
      inventory,
    );
    if (!resolved.ok) throw new Error('テスト前提が崩れています: resolverが失敗しました');
    const prepare: RunPreparationCallback = () => {
      // S-3関数(resolveProductionMaterialCompositionBaseline)を経由しない範囲外baselineを
      // 実composeへ注入する——G1a′ N-2前半と同一のfixture。
      const composed = composeConfigFromMaterials(
        useGameStore.getState().config,
        useGameStore.getState().carConfig,
        { chassisBaselineG: 10, baseGearEfficiency: 0.8 },
        resolved.selection,
      );
      if (composed.ok) throw new Error('テスト前提が崩れています: 範囲外baselineでcomposeが成功しました');
      return { ok: false, reason: composed.reason };
    };
    return prepare;
  }

  it('N-2後半: 範囲外baseline(chassisBaselineG=10)を実composeへ通した失敗が、beginRunAction経路でexact reasonのまま返る', () => {
    const result = useSaveStore.getState().beginRunActionWithPreparation('motor', outOfRangeBaselinePrepare());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // G1a′ N-2前半と同一のexact reason(P3是正で固定済みの文言)
      expect(result.reason).toBe('baseline+deltaが既存clamp範囲[80,250]gを外れました: 10');
      expect('missingRole' in result).toBe(false);
    }
  });

  it('N-2後半: 同じ失敗でS-5の4不変条件がすべて成立する', () => {
    const beforeNext = __testOnly.readLatestV16();
    if (beforeNext.kind !== 'ok') throw new Error('テスト前提が崩れています');
    const beforeSeq = beforeNext.state.saveMeta.nextRunSequence;
    const beforeRuntime = captureGameStoreRuntime();
    const captureSpy = vi.spyOn(destructionOrchestration, 'captureRunSnapshot');
    const accumulatorSpy = vi.spyOn(destructionOrchestration, 'createRunAccumulator');

    useSaveStore.getState().beginRunActionWithPreparation('motor', outOfRangeBaselinePrepare());

    const after = __testOnly.readLatestV16();
    if (after.kind !== 'ok') throw new Error('テスト前提が崩れています');
    // (1) nextRunSequence不変
    expect(after.state.saveMeta.nextRunSequence).toBe(beforeSeq);
    // (2) pendingRunEquipmentSnapshot不変
    expect(useSaveStore.getState().pendingRunEquipmentSnapshot).toBeNull();
    // (3) RunSnapshot/RunAccumulator不生成(直接assert)
    expect(captureSpy).not.toHaveBeenCalled();
    expect(accumulatorSpy).not.toHaveBeenCalled();
    // (4) gameStoreローカルruntime state不変
    expect(captureGameStoreRuntime()).toEqual(beforeRuntime);
  });

  // --- 全対象経路×4不変条件(P4: pendingApplicationExistsを追加、P5: 実state比較) ---
  type FailureCase = { label: string; arrange: () => void; prepare: RunPreparationCallback; expectPrepareCalled: boolean };

  const genericPrepare: RunPreparationCallback = () => ({ ok: false, reason: 'config構築に失敗しました' });
  const resolverPrepare: RunPreparationCallback = () => ({ ok: false, reason: '装備が見つかりません', missingRole: 'magnet' });
  const okPrepare: RunPreparationCallback = () => ({ ok: true, snapshotInput: motorSnapshotInputFixture() });

  // 注: gate失敗(pendingApplicationExists)経路は、有効なRunApplicationEnvelope fixtureが
  // 既に揃っているsaveStore.test.ts側で検証する(P4是正、同ファイルのG1b describeを参照)。
  const failureCases: readonly FailureCase[] = [
    { label: 'resolver失敗', arrange: () => {}, prepare: resolverPrepare, expectPrepareCalled: true },
    { label: 'baseline/compose失敗', arrange: () => {}, prepare: genericPrepare, expectPrepareCalled: true },
    { label: '有限性検証失敗', arrange: () => {}, prepare: genericPrepare, expectPrepareCalled: true },
    {
      label: 'gate失敗(leaseNotAcquired)',
      arrange: () => { useSaveStore.setState({ leaseState: 'leaseNotAcquired', runtimeLeaseToken: 'other-tab' }); },
      prepare: okPrepare,
      expectPrepareCalled: false,
    },
    {
      label: 'gate失敗(runInProgress)',
      arrange: () => { useSaveStore.setState({ currentRunSequence: 42 }); },
      prepare: okPrepare,
      expectPrepareCalled: false,
    },
  ];

  it.each(failureCases)('$label のとき、prepare呼出し有無が契約どおりでS-5の4不変条件が成立する', ({ arrange, prepare, expectPrepareCalled }) => {
    arrange();
    const before = __testOnly.readLatestV16();
    if (before.kind !== 'ok') throw new Error('テスト前提が崩れています');
    const beforeSeq = before.state.saveMeta.nextRunSequence;
    const beforeRuntime = captureGameStoreRuntime();
    const beforePendingSnapshot = useSaveStore.getState().pendingRunEquipmentSnapshot;
    const captureSpy = vi.spyOn(destructionOrchestration, 'captureRunSnapshot');
    const accumulatorSpy = vi.spyOn(destructionOrchestration, 'createRunAccumulator');
    const prepareSpy = vi.fn(prepare);

    const result = useSaveStore.getState().beginRunActionWithPreparation('motor', prepareSpy);

    expect(result.ok).toBe(false);
    expect(prepareSpy.mock.calls.length).toBe(expectPrepareCalled ? 1 : 0);
    const after = __testOnly.readLatestV16();
    if (after.kind !== 'ok') throw new Error('テスト前提が崩れています');
    expect(after.state.saveMeta.nextRunSequence).toBe(beforeSeq);
    expect(useSaveStore.getState().pendingRunEquipmentSnapshot).toBe(beforePendingSnapshot);
    expect(captureSpy).not.toHaveBeenCalled();
    expect(accumulatorSpy).not.toHaveBeenCalled();
    expect(captureGameStoreRuntime()).toEqual(beforeRuntime);
  });

  it('storage書込み失敗でも4不変条件が成立する(RunSnapshot/RunAccumulatorとも不生成)', () => {
    const before = __testOnly.readLatestV16();
    if (before.kind !== 'ok') throw new Error('テスト前提が崩れています');
    const beforeSeq = before.state.saveMeta.nextRunSequence;
    const beforeRuntime = captureGameStoreRuntime();
    const captureSpy = vi.spyOn(destructionOrchestration, 'captureRunSnapshot');
    const accumulatorSpy = vi.spyOn(destructionOrchestration, 'createRunAccumulator');
    const setItemSpy = vi.spyOn(fakeStorage, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });

    const result = useSaveStore.getState().beginRunActionWithPreparation('motor', okPrepare);

    expect(result).toMatchObject({ ok: false, reason: 'storageError' });
    setItemSpy.mockRestore();
    const after = __testOnly.readLatestV16();
    if (after.kind !== 'ok') throw new Error('テスト前提が崩れています');
    expect(after.state.saveMeta.nextRunSequence).toBe(beforeSeq);
    expect(captureSpy).not.toHaveBeenCalled();
    expect(accumulatorSpy).not.toHaveBeenCalled();
    expect(captureGameStoreRuntime()).toEqual(beforeRuntime);
  });
});

// ---------------------------------------------------------------------------
// P8-4・P11是正: production入口(flickStart / startTestRun / beginProductionRun)を実際に
// 通して、開始準備失敗時の不変条件を直接検証する。
// saveStore.beginRunActionWithPreparationを直接呼ぶ形では、gameStore.beginProductionRun内の
// createRunAccumulatorが呼ばれないのは当然であり実配線の証明にならない(P11指摘)。
// ---------------------------------------------------------------------------
describe('P8・P11: production入口を通した開始失敗時の不変条件', () => {
  /** gameStore全体のrun関連runtimeを採取する(P5の対象定義に従う)。 */
  function snapshotGameRuntime() {
    const s = useGameStore.getState();
    return {
      _runAccumulator: s._runAccumulator,
      simState: s.simState,
      vehicleState: s.vehicleState,
      testRunPhase: s.testRunPhase,
      _sessionSeed: s._sessionSeed,
      _sessionStartedAt: s._sessionStartedAt,
      _sessionConfig: s._sessionConfig,
      _rngState: s._rngState,
      _vehicleRngState: s._vehicleRngState,
      _elapsedSec: s._elapsedSec,
    };
  }

  type EntryCase = {
    label: string;
    invoke: () => void;
    baseStepModule: typeof motorPhysics | typeof vehiclePhysics;
    baseStepName: 'step' | 'stepTestRun';
  };

  const entries: readonly EntryCase[] = [
    { label: 'flickStart(motor-only)', invoke: () => useGameStore.getState().flickStart(), baseStepModule: motorPhysics, baseStepName: 'step' },
    { label: 'startTestRun(test-run)', invoke: () => useGameStore.getState().startTestRun(), baseStepModule: vehiclePhysics, baseStepName: 'stepTestRun' },
  ];

  /** 各失敗経路のarrange。production入口→beginProductionRun→prepare/gateの実経路で失敗させる。 */
  const failureArrangements: readonly [string, () => void][] = [
    // resolver実失敗: rotor個体を消してderiveMaterialSelectionFromEquipmentをok:falseにする
    ['resolver失敗(実resolver経由)', () => {
      const fresh = __testOnly.readLatestV16();
      if (fresh.kind !== 'ok') throw new Error('テスト前提が崩れています');
      const broken = { ...fresh.state, inventory: { ...fresh.state.inventory, rotorAssemblies: [] } };
      __testOnly.writeV16(broken);
      useSaveStore.setState({ inventory: broken.inventory });
    }],
    // 有限性検証の実失敗: validateMaterialComposedBaseが捕捉するフィールドをNaNにする
    ['有限性検証失敗(実validator経由)', () => {
      useGameStore.setState({ config: { ...useGameStore.getState().config, axisOffsetMm: Number.NaN } });
    }],
    // gate失敗(lease未取得)
    ['gate失敗(leaseNotAcquired)', () => {
      // 実体側のleaseTokenを他タブの値へ書き換える(saveStore.test.tsと同じ再現方法)。
      // readFreshForApplyがfresh.saveMeta.leaseToken !== runtimeLeaseTokenを検出する。
      // 固定文字列は使わない——loseLeaseAndResumeWaitingがruntimeLeaseTokenを実体値へ
      // 同期するため、前テストの残りと偶然一致してlease判定を素通りしうる(実測で発生)。
      const fresh = __testOnly.readLatestV16();
      if (fresh.kind !== 'ok') throw new Error('テスト前提が崩れています');
      const otherTabToken = `${useSaveStore.getState().runtimeLeaseToken}-other-tab`;
      __testOnly.writeV16({ ...fresh.state, saveMeta: { ...fresh.state.saveMeta, leaseToken: otherTabToken } });
    }],
    // storage書込み失敗
    ['storage書込み失敗', () => {
      vi.spyOn(fakeStorage, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    }],
  ];

  for (const entry of entries) {
    for (const [failureLabel, arrange] of failureArrangements) {
      it(`${entry.label} × ${failureLabel}: runを開始せず、gameStore runtime全体が不変で旧stepも呼ばれない`, () => {
        useGameStore.setState({ _runAccumulator: null });
        arrange();
        const before = snapshotGameRuntime();
        const baseStepSpy = vi.spyOn(entry.baseStepModule, entry.baseStepName as never);
        const captureSpy = vi.spyOn(destructionOrchestration, 'captureRunSnapshot');
        const accumulatorSpy = vi.spyOn(destructionOrchestration, 'createRunAccumulator');

        entry.invoke();
        // (1) RunAccumulator未生成(production入口を通した直接assert、P11)
        expect(accumulatorSpy).not.toHaveBeenCalled();
        expect(useGameStore.getState()._runAccumulator).toBeNull();
        // (2) RunSnapshot未生成
        expect(captureSpy).not.toHaveBeenCalled();
        // (3) gameStore runtime全体が不変(session/vehicle runとも未開始、P8-2)
        expect(snapshotGameRuntime()).toEqual(before);
        // (4) 旧経路へのsilent fallbackが起きていない(P8-1/3)
        expect(baseStepSpy).not.toHaveBeenCalled();
        // (5) saveStore側のrunSequenceも消費していない
        expect(useSaveStore.getState().currentRunSequence).toBeNull();
      });
    }
  }

  it('beginProductionRun成功時のみ_runAccumulatorが生成され、createRunAccumulatorがexact1回呼ばれる', () => {
    useGameStore.setState({ _runAccumulator: null });
    const accumulatorSpy = vi.spyOn(destructionOrchestration, 'createRunAccumulator');

    const result = useGameStore.getState().beginProductionRun({ kind: 'motorOnly', initialOmega: 0 }, 1);

    expect(result.ok).toBe(true);
    expect(accumulatorSpy).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState()._runAccumulator).not.toBeNull();
  });

});

// ---------------------------------------------------------------------------
// P10是正: RunOutcomeのexactly-once生成/適用と終了優先順位
// UI計画v13 §6.2・§6.4.2・§12.1・§12.2。要件a〜e。
// ---------------------------------------------------------------------------
describe('P10: RunOutcomeのexactly-once適用と終了優先順位', () => {
  /**
   * P14是正: 実際のdestructionTerminal RunOutcomeを生成する。
   * 旧版はfinalizeRun(..., {kind:'manualAbort'})の戻り値をterminationへ入れており、
   * endReasonがmanualAbortだったため「destructionTerminal優先」を検証できていなかった
   * (manualAbortでもgreenになる偽陽性)。terminalModeCandidatesを非空にしたaccumulatorから
   * finalizeDestructionRunを使い、endReason==='destructionTerminal'の実RunOutcomeを注入する。
   */
  const TERMINAL_MODES = ['D02'] as const;

  function makeDestructionTerminalOutcome(accumulator: destructionOrchestration.RunAccumulator) {
    return destructionOrchestration.finalizeDestructionRun({
      ...accumulator,
      terminalModeCandidates: [...TERMINAL_MODES] as [DestructionModeId, ...DestructionModeId[]],
    });
  }

  /** 次のstepでwrapperが実destructionTerminalを返すよう仕込む。 */
  function stubTerminalMotorStep() {
    const real = destructionOrchestration.stepMotorWithDestruction;
    return vi.spyOn(destructionOrchestration, 'stepMotorWithDestruction').mockImplementation((state, acc, dt, rng) => {
      const result = real(state, acc, dt, rng);
      return { ...result, termination: makeDestructionTerminalOutcome(result.accumulator) };
    });
  }

  it('要件a: motor-only wrapper terminationでperformApplyRunOutcomeがexact1回呼ばれる', () => {
    useGameStore.setState({});
    useGameStore.getState().flickStart();
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    stubTerminalMotorStep();

    useGameStore.getState().stepSim(1 / 120);

    expect(applySpy).toHaveBeenCalledTimes(1); // (b) exact1
    const applied = applySpy.mock.calls[0]![0];
    expect(applied.endReason).toBe('destructionTerminal'); // (c) exact endReason
    if (applied.endReason === 'destructionTerminal') {
      expect(applied.terminalModes).toEqual([...TERMINAL_MODES]); // (d) terminalModesの期待値
    }
    // 終了後はaccumulatorが閉じている
    expect(useGameStore.getState()._runAccumulator).toBeNull();
  });

  it('要件b: termination適用後にmanual入口を呼んでも二重適用されない(destructionTerminalがmanualAbortに上書きされない)', () => {
    useGameStore.setState({});
    useGameStore.getState().flickStart();
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    stubTerminalMotorStep();

    useGameStore.getState().stepSim(1 / 120);
    const appliedOutcome = applySpy.mock.calls[0]![0];
    expect(appliedOutcome.endReason).toBe('destructionTerminal');
    // (a) wrapperが返したterminationと同一参照がapplyへ渡っている
    const wrapperTermination = (destructionOrchestration.stepMotorWithDestruction as unknown as {
      mock: { results: { value: { termination: unknown } }[] };
    }).mock.results[0]!.value.termination;
    expect(appliedOutcome).toBe(wrapperTermination);
    // 同一runに対する後続のmanual終了入口
    useGameStore.getState().resetSim();

    expect(applySpy).toHaveBeenCalledTimes(1); // (e) 二重適用なし
    expect(applySpy.mock.calls[0]![0]).toBe(appliedOutcome);
    expect(applySpy.mock.calls[0]![0].endReason).toBe('destructionTerminal'); // manualAbortへ上書きされていない
  });

  it('要件a: motor-onlyのmanual入口(4種)でRunOutcomeがexact1回生成・適用される', () => {
    const manualEntries: readonly [string, () => void][] = [
      ['resetSim', () => useGameStore.getState().resetSim()],
      ['setMode', () => useGameStore.getState().setMode('garage')],
      ['flickStart', () => useGameStore.getState().flickStart()],
      ['finishAssembly', () => useGameStore.getState().finishAssembly(useGameStore.getState().config, 0)],
    ];
    for (const [, invoke] of manualEntries) {
      useGameStore.setState({ _runAccumulator: null });
      useSaveStore.setState({ currentRunSequence: null });
      useGameStore.getState().flickStart();
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      invoke();

      expect(applySpy).toHaveBeenCalledTimes(1);
      const outcome = applySpy.mock.calls[0]![0];
      expect(outcome.endReason).toBe('manualAbort'); // terminationがnullのときのみmanualAbort(§12.2(2))
      applySpy.mockRestore();
    }
  });

  it('要件a: test-runの物理終端でfinalizeRun経由のRunOutcomeがexact1回適用される', () => {
    useGameStore.setState({});
    useGameStore.getState().startTestRun();
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    // 物理終端(finished)を返すようwrapperを差し替える
    const real = destructionOrchestration.stepTestRunWithDestruction;
    vi.spyOn(destructionOrchestration, 'stepTestRunWithDestruction').mockImplementation((state, acc, dt, rng) => {
      const result = real(state, acc, dt, rng);
      return { ...result, physicsState: { ...result.physicsState, status: 'finished' as const }, termination: null };
    });

    useGameStore.getState().stepTestRun(1 / 120);

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy.mock.calls[0]![0].endReason).toBe('finished');
    expect(useGameStore.getState()._runAccumulator).toBeNull();
  });

  it('要件e: 同一stepでtermination非nullかつ物理終端のとき、destructionTerminalが優先される(§12.2(3))', () => {
    useGameStore.setState({});
    useGameStore.getState().startTestRun();
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    const real = destructionOrchestration.stepTestRunWithDestruction;
    vi.spyOn(destructionOrchestration, 'stepTestRunWithDestruction').mockImplementation((state, acc, dt, rng) => {
      const result = real(state, acc, dt, rng);
      // 物理終端(finished)と実destructionTerminalが同一stepで競合する状況
      return {
        ...result,
        physicsState: { ...result.physicsState, status: 'finished' as const },
        termination: makeDestructionTerminalOutcome(result.accumulator),
      };
    });

    useGameStore.getState().stepTestRun(1 / 120);

    expect(applySpy).toHaveBeenCalledTimes(1);
    // 物理終端(finished)ではなくdestructionTerminalが採用されている(exact値で固定)
    const appliedOutcome = applySpy.mock.calls[0]![0];
    expect(appliedOutcome.endReason).toBe('destructionTerminal');
    if (appliedOutcome.endReason === 'destructionTerminal') {
      expect(appliedOutcome.terminalModes).toEqual([...TERMINAL_MODES]);
    }
  });

  it('要件d: notebook recordはPhase 3経路のexact1件である', () => {
    useGameStore.setState({});
    useGameStore.getState().flickStart();
    useGameStore.getState().stepSim(0.2);
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    useGameStore.getState().resetSim();

    expect(applySpy).toHaveBeenCalledTimes(1);
    // 既存PendingNotebookRecordの既存腕のみを使う(G6の型拡張を先取りしない)
    expect(applySpy.mock.calls[0]![1].kind).toBe('session');
  });

});

// ---------------------------------------------------------------------------
// P15・P16是正の検証
// ---------------------------------------------------------------------------
describe('P15: 走行文脈の判別(vehicle runがsession腕へ入らない)', () => {
  it('進行中がtest-run runのときsetModeで確定してもvehicleTestRun腕になる(session腕へ誤分類しない)', () => {
    useGameStore.setState({ _runAccumulator: null });
    useGameStore.getState().startTestRun();
    expect(useGameStore.getState()._runAccumulator?.replaySnapshot.runContext.context).toBe('vehicle');
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

    useGameStore.getState().setMode('garage'); // 全モード共通の終了入口

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy.mock.calls[0]![1].kind).toBe('vehicleTestRun'); // 誤ってsessionにしない
  });

  it('進行中がmotor-only runのときはsession腕になる', () => {
    useGameStore.setState({ _runAccumulator: null });
    useGameStore.getState().flickStart();
    expect(useGameStore.getState()._runAccumulator?.replaySnapshot.runContext.context).toBe('motor');
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

    useGameStore.getState().setMode('garage');

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy.mock.calls[0]![1].kind).toBe('session');
  });

  const testRunAbortEntries: readonly [string, () => void][] = [
    ['abortTestRun', () => useGameStore.getState().abortTestRun()],
    ['resetTestRun', () => useGameStore.getState().resetTestRun()],
  ];

  it.each(testRunAbortEntries)('test-runの中断入口 %s でmanualAbortがexact1回適用される', (_label, invoke) => {
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    useGameStore.getState().startTestRun();
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

    invoke();

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy.mock.calls[0]![0].endReason).toBe('manualAbort');
    expect(applySpy.mock.calls[0]![1].kind).toBe('vehicleTestRun');
    expect(useGameStore.getState()._runAccumulator).toBeNull();
  });

});

describe('P16: notebook recordのconfig/seedはRunSnapshotが唯一出典', () => {
  it('motor腕のconfig/seedがraw config/別seedではなくreplaySnapshotの値と一致する', () => {
    useGameStore.setState({ _runAccumulator: null });
    useGameStore.getState().flickStart();
    // live側のraw値をsnapshotと異なる値へ動かす(fallbackが起きればここが記録される)
    useGameStore.setState({
      _sessionConfig: { ...useGameStore.getState().config, coilTurns: 999 },
      _sessionSeed: 123456789,
    });
    const snapshot = useGameStore.getState()._runAccumulator!.replaySnapshot;
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

    useGameStore.getState().resetSim();

    expect(applySpy).toHaveBeenCalledTimes(1);
    const record = applySpy.mock.calls[0]![1];
    expect(record.kind).toBe('session');
    if (record.kind === 'session') {
      // 参照/同値の両方で固定する
      expect(record.record.config).toEqual(snapshot.motorConfig);
      expect(record.record.config.coilTurns).not.toBe(999); // raw fallbackしていない
      expect(record.record.seed).toBe(snapshot.seed);
      expect(record.record.seed).not.toBe(123456789);
    }
  });

  it('vehicle腕のmotorConfig/carConfig/seedもreplaySnapshotの値と一致する', () => {
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    useGameStore.getState().startTestRun();
    const snapshot = useGameStore.getState()._runAccumulator!.replaySnapshot;
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

    useGameStore.getState().abortTestRun();

    const record = applySpy.mock.calls[0]![1];
    expect(record.kind).toBe('vehicleTestRun');
    if (record.kind === 'vehicleTestRun') {
      expect(record.record.motorConfig).toBe(snapshot.motorConfig);
      expect(record.record.carConfig).toBe(snapshot.carConfig);
      expect(record.record.seed).toBe(snapshot.seed);
    }
  });
});

// ---------------------------------------------------------------------------
// P18: context固有入口が他contextのrunを閉じないこと(双方向で固定)
// ---------------------------------------------------------------------------
describe('P18: context固有入口の分離', () => {
  it('motor-only run進行中にabortTestRunを呼んでも、motor runは確定されない(apply 0・accumulator同一参照)', () => {
    useGameStore.setState({ _runAccumulator: null });
    useGameStore.getState().flickStart();
    const accumulatorBefore = useGameStore.getState()._runAccumulator;
    expect(accumulatorBefore?.replaySnapshot.runContext.context).toBe('motor');
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

    useGameStore.getState().abortTestRun();

    expect(applySpy).not.toHaveBeenCalled();
    expect(useGameStore.getState()._runAccumulator).toBe(accumulatorBefore); // 同一参照のまま維持
  });

  it('motor-only run進行中にresetTestRunを呼んでも、motor runは確定されない', () => {
    useGameStore.setState({ _runAccumulator: null });
    useGameStore.getState().flickStart();
    const accumulatorBefore = useGameStore.getState()._runAccumulator;
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

    useGameStore.getState().resetTestRun();

    expect(applySpy).not.toHaveBeenCalled();
    expect(useGameStore.getState()._runAccumulator).toBe(accumulatorBefore);
  });

  it('test-run run進行中にfinalizeMotorOnlyRunIfActiveを呼んでもnullを返し副作用がない(公開契約どおりmotor限定)', () => {
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    useGameStore.getState().startTestRun();
    const accumulatorBefore = useGameStore.getState()._runAccumulator;
    expect(accumulatorBefore?.replaySnapshot.runContext.context).toBe('vehicle');
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

    const result = useGameStore.getState().finalizeMotorOnlyRunIfActive();

    expect(result).toBeNull();
    expect(applySpy).not.toHaveBeenCalled();
    expect(useGameStore.getState()._runAccumulator).toBe(accumulatorBefore);
  });

  it('test-run run進行中にmotor専用入口(resetSim)を呼んでもvehicle runは確定されない', () => {
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    useGameStore.getState().startTestRun();
    const accumulatorBefore = useGameStore.getState()._runAccumulator;
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

    useGameStore.getState().resetSim();

    expect(applySpy).not.toHaveBeenCalled();
    expect(useGameStore.getState()._runAccumulator).toBe(accumulatorBefore);
  });

  it('全context共通入口(setMode)はmotor/vehicleどちらの進行中runも閉じる', () => {
    // vehicle
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    useGameStore.getState().startTestRun();
    const vehicleApplySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    useGameStore.getState().setMode('garage');
    expect(vehicleApplySpy).toHaveBeenCalledTimes(1);
    expect(vehicleApplySpy.mock.calls[0]![1].kind).toBe('vehicleTestRun');
    vehicleApplySpy.mockRestore();

    // motor
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    useGameStore.getState().flickStart();
    const motorApplySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    useGameStore.getState().setMode('garage');
    expect(motorApplySpy).toHaveBeenCalledTimes(1);
    expect(motorApplySpy.mock.calls[0]![1].kind).toBe('session');
  });
});

describe('P19: vehicle notebook recordのcarConfigはraw fallbackしない', () => {
  it('通常のvehicle runではsnapshot.carConfigと参照同一である', () => {
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    useGameStore.getState().startTestRun();
    const snapshot = useGameStore.getState()._runAccumulator!.replaySnapshot;
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

    useGameStore.getState().abortTestRun();

    const record = applySpy.mock.calls[0]![1];
    if (record.kind !== 'vehicleTestRun') throw new Error('テスト前提が崩れています');
    expect(record.record.carConfig).toBe(snapshot.carConfig);
  });

  it('契約違反のnull carConfig(vehicle文脈)ではrawへfallbackせず明示的に失敗する', () => {
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    useGameStore.getState().startTestRun();
    // 交差検証契約に違反する不正fixture(vehicle文脈でcarConfig=null)を注入する
    const accumulator = useGameStore.getState()._runAccumulator!;
    useGameStore.setState({
      _runAccumulator: {
        ...accumulator,
        replaySnapshot: { ...accumulator.replaySnapshot, carConfig: null },
      },
    });
    const rawCarConfig = useGameStore.getState().carConfig;

    // rawで静かに埋めるのではなくthrowすること
    expect(() => useGameStore.getState().abortTestRun()).toThrow(/carConfigがnull/);
    expect(rawCarConfig).not.toBeNull(); // rawは存在するがfallbackに使われない
  });
});

// ---------------------------------------------------------------------------
// DoD-Q11-a〜g(arbiter追加裁定Q11、人間再承認Q-R1〜Q-R4済み2026-08-18)
// UI計画v14 §6.5.7・§6.5.8・§23 DoD28〜34。
// ---------------------------------------------------------------------------
describe('DoD-Q11-a: snapshot⇔liveの一致(3入口)', () => {
  // P21是正: 3入口それぞれで (i)初期stateの値一致 (ii)参照非共有(deep copy)
  // (iii)live RNG先頭N値がcreateRunRng(snapshot.seed)と一致 (iv)_sessionSeed一致
  // をすべて固定する。旧版はRNGがnot nullのみ・finishAssemblyはRNG assertなし・
  // deep copy確認がflickStartのみ、と入口ごとに粒度がばらついていた。
  const RNG_SAMPLE_N = 16;

  /** live RNGの先頭N値が正典RNG(snapshot.seed)の系列と一致することを固定する。 */
  function expectLiveRngMatchesCanonical(seed: number) {
    const liveRng = useGameStore.getState()._runRng;
    expect(liveRng).not.toBeNull();
    const liveValues = Array.from({ length: RNG_SAMPLE_N }, () => liveRng!());
    const canonical = destructionOrchestration.createRunRng(seed);
    const canonicalValues = Array.from({ length: RNG_SAMPLE_N }, () => canonical());
    expect(liveValues).toEqual(canonicalValues);
  }

  it('flickStart(production経路): simState値一致・参照非共有・RNG系列一致・_sessionSeed一致', () => {
    useGameStore.setState({ _runAccumulator: null });
    useGameStore.getState().flickStart();

    const snapshot = useGameStore.getState()._runAccumulator!.replaySnapshot;
    expect(useGameStore.getState().simState).toEqual(snapshot.initialMotorState); // (i)
    expect(snapshot.initialMotorState.omega).toBe(FLICK_INITIAL_OMEGA);
    expect(useGameStore.getState().simState).not.toBe(snapshot.initialMotorState); // (ii) deep copy
    expect(useGameStore.getState()._sessionSeed).toBe(snapshot.seed); // (iv)
    expectLiveRngMatchesCanonical(snapshot.seed); // (iii)
  });

  it('finishAssembly(production経路): simState値一致・参照非共有・RNG系列一致・_sessionSeed一致', () => {
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    const config = useGameStore.getState().config;

    useGameStore.getState().finishAssembly(config, 7);

    const snapshot = useGameStore.getState()._runAccumulator!.replaySnapshot;
    expect(useGameStore.getState().simState).toEqual(snapshot.initialMotorState); // (i)
    expect(snapshot.initialMotorState.omega).toBe(7);
    expect(useGameStore.getState().simState).not.toBe(snapshot.initialMotorState); // (ii)
    expect(useGameStore.getState()._sessionSeed).toBe(snapshot.seed); // (iv)
    expectLiveRngMatchesCanonical(snapshot.seed); // (iii)
  });

  it('startTestRun(production経路): vehicleState値一致・参照非共有・RNG系列一致・_sessionSeed一致(raw由来の再生成をしない)', () => {
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    useGameStore.getState().startTestRun();

    const snapshot = useGameStore.getState()._runAccumulator!.replaySnapshot;
    expect(useGameStore.getState().vehicleState).toEqual(snapshot.initialVehicleState); // (i)
    expect(useGameStore.getState().vehicleState).not.toBe(snapshot.initialVehicleState); // (ii)
    expect(useGameStore.getState()._sessionSeed).toBe(snapshot.seed); // (iv) P20是正の直接確認
    expectLiveRngMatchesCanonical(snapshot.seed); // (iii)
  });
});

describe('DoD-Q11-b: 再現性機能の保持(recipeSeed)', () => {
  it('flickStart(production経路)ではrunSnapshot.seedがrecipeSeedと一致する', () => {
    useGameStore.setState({ _runAccumulator: null, recipeSeed: 20260818 });
    useGameStore.getState().flickStart();
    expect(useGameStore.getState()._runAccumulator!.replaySnapshot.seed).toBe(20260818);
  });

  it('同一recipeSeedで再開始すると同一のsnapshot.seedになる(固定初速の再現実行が生きている)', () => {
    useGameStore.setState({ _runAccumulator: null, recipeSeed: 424242 });
    useGameStore.getState().flickStart();
    const first = useGameStore.getState()._runAccumulator!.replaySnapshot.seed;
    useGameStore.getState().flickStart(); // 前runを閉じて再開始
    const second = useGameStore.getState()._runAccumulator!.replaySnapshot.seed;
    expect(second).toBe(first);
  });
});

describe('DoD-Q11-c: finishAssemblyの失敗原子性(案A、3経路)', () => {
  function snapshotAll() {
    const g = useGameStore.getState();
    return {
      config: g.config, recipeSeed: g.recipeSeed, _runAccumulator: g._runAccumulator,
      simState: g.simState, _sessionSeed: g._sessionSeed, _runRng: g._runRng,
    };
  }

  it('(i) config commit失敗 → beginを呼ばず、nextRunSequence不変・accumulator不生成・全state不変', () => {
    useGameStore.setState({ _runAccumulator: null });
    const before = snapshotAll();
    const beforeSeq = __testOnly.readLatestV16();
    if (beforeSeq.kind !== 'ok') throw new Error('テスト前提が崩れています');
    // updateProgressを失敗させる(progress gateの失敗を再現)
    const updateSpy = vi.spyOn(useSaveStore.getState(), 'updateProgress').mockReturnValue(false);
    const accumulatorSpy = vi.spyOn(destructionOrchestration, 'createRunAccumulator');
    const captureSpy = vi.spyOn(destructionOrchestration, 'captureRunSnapshot');

    useGameStore.getState().finishAssembly({ ...before.config, coilTurns: 123 }, 3);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(accumulatorSpy).not.toHaveBeenCalled();
    expect(captureSpy).not.toHaveBeenCalled();
    const after = __testOnly.readLatestV16();
    if (after.kind !== 'ok') throw new Error('テスト前提が崩れています');
    expect(after.state.saveMeta.nextRunSequence).toBe(beforeSeq.state.saveMeta.nextRunSequence);
    expect(snapshotAll()).toEqual(before); // configも含めて全state不変
  });

  it('(ii) config commit成功+begin失敗 → configは保存済みのまま、run runtimeは不変でaccumulator/snapshot不生成', () => {
    useGameStore.setState({ _runAccumulator: null });
    // begin失敗を作る。lease不一致はupdateProgress(config commit)も同時に失敗させてしまい
    // 「commit成功+begin失敗」の再現にならないため(実測で確認)、config commitには影響せず
    // beginだけが失敗するrunInProgressを使う。
    useSaveStore.setState({ currentRunSequence: 42 });
    const beforeRunRuntime = {
      _runAccumulator: useGameStore.getState()._runAccumulator,
      simState: useGameStore.getState().simState,
      _sessionSeed: useGameStore.getState()._sessionSeed,
    };
    const accumulatorSpy = vi.spyOn(destructionOrchestration, 'createRunAccumulator');
    const newConfig = { ...useGameStore.getState().config, coilTurns: 77 };

    useGameStore.getState().finishAssembly(newConfig, 3);

    // configは保存済みのまま保持される(S-5の対象外、Q-R4(c))
    expect(useGameStore.getState().config.coilTurns).toBe(77);
    // run runtimeは不変
    expect(accumulatorSpy).not.toHaveBeenCalled();
    expect(useGameStore.getState()._runAccumulator).toBe(beforeRunRuntime._runAccumulator);
    expect(useGameStore.getState().simState).toBe(beforeRunRuntime.simState);
  });

  it('(iii) 成功時 → snapshotのmotorConfigが新config由来のcomposed値である(旧configではない)', () => {
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    const oldCoilTurns = useGameStore.getState().config.coilTurns;
    const newConfig = { ...useGameStore.getState().config, coilTurns: oldCoilTurns + 13 };

    useGameStore.getState().finishAssembly(newConfig, 2);

    const snapshot = useGameStore.getState()._runAccumulator!.replaySnapshot;
    // composeConfigFromMaterialsはcoilTurnsをそのまま引き継ぐ(素材写像は比率側を変える)ため、
    // 新configのcoilTurnsがsnapshotへ反映されていることで「新config由来」を判定できる
    expect(snapshot.motorConfig.coilTurns).toBe(oldCoilTurns + 13);
    expect(useGameStore.getState().config.coilTurns).toBe(oldCoilTurns + 13);
  });
});

describe('DoD-Q11-d: production経路のリプレイ等価', () => {
  // P22是正: 旧版はtest-run側でliveAccumulator!==nullのときだけevents/destructionStateを比較し、
  // terminationを一切比較していなかった(選んだNで終端した場合に検証が静かに空になる)。
  // 本版は「Nが非終端であること」を前提としてassertし、events・destructionState・terminationを
  // 無条件に比較する。motor側・test-run側で同じ契約が読み取れる形へ揃えた。
  const DT = 1 / 120;

  it('motor-only(非ゼロinitialOmega): live経由Nステップと同一snapshotからの独立再走行が完全一致する', () => {
    useGameStore.setState({ _runAccumulator: null, recipeSeed: 987654 });
    useGameStore.getState().flickStart();
    const snapshot = useGameStore.getState()._runAccumulator!.replaySnapshot;
    expect(snapshot.initialMotorState.omega).not.toBe(0); // 非ゼロ初速であること

    const N = 30;
    for (let i = 0; i < N; i++) useGameStore.getState().stepSim(DT);

    // 前提: Nステップでは終端しない(終端していればaccumulatorがnull化されている)
    const liveAccumulator = useGameStore.getState()._runAccumulator;
    expect(liveAccumulator).not.toBeNull();

    // 同一snapshotから独立に再走行する
    let replayAcc = destructionOrchestration.createRunAccumulator(snapshot);
    let replayState = structuredClone(snapshot.initialMotorState);
    const replayRng = destructionOrchestration.createRunRng(snapshot.seed);
    let replayTermination: destructionOrchestration.RunOutcome | null = null;
    for (let i = 0; i < N; i++) {
      const r = destructionOrchestration.stepMotorWithDestruction(replayState, replayAcc, DT, replayRng);
      replayState = r.physicsState;
      replayAcc = r.accumulator;
      if (r.termination !== null) { replayTermination = r.termination; break; }
    }

    // live側とreplay側の終端有無が一致していること(両者とも非終端)
    expect(replayTermination).toBeNull();
    // physicsState・events・destructionStateを無条件に比較する
    expect(replayState).toEqual(useGameStore.getState().simState);
    expect(replayAcc.events).toEqual(liveAccumulator!.events);
    expect(replayAcc.destructionState).toEqual(liveAccumulator!.destructionState);
  });

  it('test-run: live経由Nステップと同一snapshotからの独立再走行が完全一致する', () => {
    useGameStore.setState({ _runAccumulator: null });
    useSaveStore.setState({ currentRunSequence: null });
    useGameStore.getState().startTestRun();
    const snapshot = useGameStore.getState()._runAccumulator!.replaySnapshot;

    const N = 20;
    for (let i = 0; i < N; i++) useGameStore.getState().stepTestRun(DT);

    // 前提: Nステップでは終端しない(条件付きskipにせず明示assertする)
    const liveAccumulator = useGameStore.getState()._runAccumulator;
    expect(liveAccumulator).not.toBeNull();

    let replayAcc = destructionOrchestration.createRunAccumulator(snapshot);
    let replayState = structuredClone(snapshot.initialVehicleState!);
    const replayRng = destructionOrchestration.createRunRng(snapshot.seed);
    let replayTermination: destructionOrchestration.RunOutcome | null = null;
    for (let i = 0; i < N; i++) {
      const r = destructionOrchestration.stepTestRunWithDestruction(replayState, replayAcc, DT, replayRng);
      replayState = r.physicsState;
      replayAcc = r.accumulator;
      if (r.termination !== null) { replayTermination = r.termination; break; }
    }

    expect(replayTermination).toBeNull();
    expect(replayState).toEqual(useGameStore.getState().vehicleState);
    expect(replayAcc.events).toEqual(liveAccumulator!.events);
    expect(replayAcc.destructionState).toEqual(liveAccumulator!.destructionState);
  });
});

describe('DoD-Q11-e: RNG正典適合(アルゴリズムドリフト検出)', () => {
  it('liveのrng系列の先頭N値が正典RNG(createRunRng(seed))の系列と一致する', () => {
    useGameStore.setState({ _runAccumulator: null, recipeSeed: 13579 });
    useGameStore.getState().flickStart();
    const seed = useGameStore.getState()._runAccumulator!.replaySnapshot.seed;
    const liveRng = useGameStore.getState()._runRng!;
    const canonical = destructionOrchestration.createRunRng(seed);

    const N = 16;
    const liveValues = Array.from({ length: N }, () => liveRng());
    const canonicalValues = Array.from({ length: N }, () => canonical());
    expect(liveValues).toEqual(canonicalValues);
  });

});

describe('DoD-Q11-f: initialOmegaの防御throw負例', () => {
  const invalidOmegas: readonly [string, number][] = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['範囲外(正)', 1e9],
    ['範囲外(負)', -1e9],
  ];

  it.each(invalidOmegas)('initialOmega=%s を渡すとthrowする', (_label, omega) => {
    const { loadout, inventory } = createInitialPlayerInventoryAndLoadout();
    const narrowed = loadout as EquipmentLoadout & { batteryItemId: string };
    const snap = captureEquipmentIdSnapshotForTest(narrowed);
    expect(() => prepareDestructionRun(
      narrowed, inventory, useGameStore.getState().config,
      useGameStore.getState().garageSelection, snap,
      { kind: 'motorOnly', initialOmega: omega }, 1,
    )).toThrow(/initialOmega/);
  });

  it('有効なinitialOmega(境界値±MAX_FLICK_OMEGA・0)はthrowしない', () => {
    const { loadout, inventory } = createInitialPlayerInventoryAndLoadout();
    const narrowed = loadout as EquipmentLoadout & { batteryItemId: string };
    const snap = captureEquipmentIdSnapshotForTest(narrowed);
    for (const omega of [0, MAX_FLICK_OMEGA, -MAX_FLICK_OMEGA]) {
      const result = prepareDestructionRun(
        narrowed, inventory, useGameStore.getState().config,
        useGameStore.getState().garageSelection, snap,
        { kind: 'motorOnly', initialOmega: omega }, 1,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.snapshotInput.initialMotorState.omega).toBe(omega);
    }
  });
});


// ---------------------------------------------------------------------------
// G1c: production経路での6モード発火統合テスト
// docs/phase3-p3-4-g1c-fixture-matrix.md(alice_mot3)+brabit production入口実測。
//
// 契約(Suu_mot3 2026-08-18T16:33の必須7点 + 同17:33のG1c-P1〜P5是正):
// 1) 6モードすべてgameStore実入口(flickStart/startTestRun)→stepSim/stepTestRunを通す。
//    wrapper直接呼出しは禁止。
// 2) terminal系(D02/D03/D04)はaccumulatorがnull化された後も検査が空にならないよう、
//    performApplyRunOutcomeへ渡されたRunOutcomeを捕捉してevent・termination・exact1適用を直接assert。
// 3) 非terminal系(D01/D05/D07)は発火時点でaccumulator non-nullをassertしてevent/stateを直接確認。
// 4) 各モードに空虚一致を防ぐ負例を対置する。負例も必ずproduction入口を**1回だけ**通し、
//    十分step数を回したうえで非発火をassertする(G1c-P1/P2)。
// 5) 各正例・負例は入口直後にsnapshot実効値をassertし、`useSaveStore.subscribe`による
//    config巻き戻りを全ケースで検出可能にする(G1c-P4)。
//
// **fixture作成時の必須手順(実測で判明した2つの罠)**:
// (a) 素材の購入・装備は必ずconfig設定より**前**に行う。`useSaveStore.subscribe`
//     (gameStore.ts:1120-1130)がsaveStore更新時に`progress.config`で`gameStore.config`を
//     上書きするため、逆順だと設定が巻き戻される。
// (b) motor-onlyでは`REST_STATE.theta === 0`がデッドゾーン(半幅 = slitWidthMm/R_COMMUTATOR_MM/2)の
//     中心にあたる。既定`slitWidthMm=1.5`(半幅0.15rad)では初速15で脱出できず数stepで停止するため、
//     高電流構成でない限り`slitWidthMm`を小さくする(0にすると短絡=D03/D04経路になるため不可)。
// ---------------------------------------------------------------------------
describe('G1c: production経路での6モード発火', () => {
  /** 素材を購入して装備する。購入・装備の失敗は許容せずthrowする(空虚な成功を防ぐ)。 */
  function buyAndEquip(
    materialId: string,
    family: 'battery' | 'brush' | 'magnet',
    key: 'batteryItemId' | 'brushItemId' | 'magnetItemId',
  ): void {
    const purchased = useSaveStore.getState().purchaseMaterialAction(materialId as never);
    expect(purchased.ok, `${materialId}の購入に失敗しました`).toBe(true);
    const item = useSaveStore.getState().inventory.items
      .filter((i) => i.family === family && i.materialId === materialId).at(-1);
    expect(item, `${materialId}がinventoryに見つかりません`).toBeDefined();
    const equipped = useSaveStore.getState().setEquipmentLoadout({
      ...useSaveStore.getState().equipmentLoadout, [key]: item!.itemId,
    });
    expect(equipped.ok, `${materialId}の装備に失敗しました`).toBe(true);
  }

  /** configを設定する。必ず購入・装備の後に呼ぶこと(上記(a))。永続側にも反映する。 */
  function setPlayerConfig(partial: Partial<Record<string, unknown>>): void {
    const next = { ...useGameStore.getState().config, ...partial };
    const ok = useSaveStore.getState().updateProgress({ config: next as never });
    expect(ok, 'updateProgress(config)に失敗しました').toBe(true);
    useGameStore.setState({ config: next as never });
  }

  type CapturedOutcome = {
    endReason: string;
    terminalModes?: readonly string[];
    events: readonly { mode: string }[];
    destructionState: NonNullable<ReturnType<typeof useGameStore.getState>['_runAccumulator']>['destructionState'];
  } | null;

  type RunResult = {
    /** 判定条件を満たしたstep(1始まり)。満たさずに終えた場合は-1。 */
    hitStep: number;
    /** accumulatorがnull化した(=runが閉じた)step。閉じなければ-1。 */
    closedStep: number;
    /** 走行中の|omega|最大値。負例が「そもそも回っていない」空虚一致でないことの担保に使う。 */
    peakOmega: number;
    applyCalls: number;
    outcome: CapturedOutcome;
    recordKind: string | null;
  };

  type Snapshot = NonNullable<ReturnType<typeof useGameStore.getState>['_runAccumulator']>['replaySnapshot'];

  /**
   * production実入口からrunを開始し、stepSim/stepTestRunだけで回す(wrapper直接呼出しはしない)。
   * 入口は必ず1回だけ呼ぶ(G1c-P1)。terminal時にaccumulatorがnull化されても検査が空にならないよう、
   * performApplyRunOutcomeへ渡されたRunOutcomeを捕捉する。
   *
   * @param assertSnapshot 入口直後に呼ばれ、意図したsnapshot実効値を検証する(G1c-P4、必須)。
   * @param hit 各step後に呼ばれ、trueを返したstepで停止する。負例では常にfalseを返して回し切る。
   */
  function runFromProductionEntry(
    entry: 'flickStart' | 'startTestRun',
    maxStep: number,
    assertSnapshot: (snapshot: Snapshot) => void,
    hit: (accumulator: NonNullable<ReturnType<typeof useGameStore.getState>['_runAccumulator']>) => boolean,
  ): RunResult {
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    if (entry === 'flickStart') useGameStore.getState().flickStart();
    else useGameStore.getState().startTestRun();
    const started = useGameStore.getState()._runAccumulator;
    expect(started, `${entry}でrunが開始されていません`).not.toBeNull();
    assertSnapshot(started!.replaySnapshot);

    let hitStep = -1;
    let closedStep = -1;
    let peakOmega = 0;
    for (let i = 0; i < maxStep; i++) {
      if (entry === 'flickStart') useGameStore.getState().stepSim(1 / 120);
      else useGameStore.getState().stepTestRun(1 / 120);
      const accumulator = useGameStore.getState()._runAccumulator;
      if (accumulator === null) { closedStep = i + 1; break; }
      if (hit(accumulator)) { hitStep = i + 1; break; }
      const w = entry === 'flickStart' ? useGameStore.getState().simState.omega : useGameStore.getState().vehicleState!.motor.omega;
      if (Math.abs(w) > peakOmega) peakOmega = Math.abs(w);
    }
    const calls = applySpy.mock.calls;
    return {
      hitStep, closedStep, peakOmega, applyCalls: calls.length,
      outcome: calls.length > 0 ? (calls[0]![0] as unknown as CapturedOutcome) : null,
      recordKind: calls.length > 0 ? (calls[0]![1] as { kind: string }).kind : null,
    };
  }

  /**
   * 装備素材3種のsnapshot実効値をまとめてassertする。全12ケース(正例6+負例6)で必ず呼び、
   * 意図しない購入差分(正例と負例の間に因果と無関係な素材差が紛れ込むこと)を検出可能にする。
   * 初期装備の実効値は magnet-ferrite=0.2 / battery-alkaline=1.0 / brush-copper-plate=1.3。
   */
  function assertMaterialRatios(
    snapshot: Snapshot,
    expected: { magnetStrength: number; batteryInternalResistanceRatio: number; brushContactResistanceRatio: number },
  ): void {
    expect(snapshot.motorConfig.magnetStrength).toBe(expected.magnetStrength);
    expect(snapshot.motorConfig.batteryInternalResistanceRatio).toBe(expected.batteryInternalResistanceRatio);
    expect(snapshot.motorConfig.brushContactResistanceRatio).toBe(expected.brushContactResistanceRatio);
  }

  /** 初期装備(未購入)の実効値。 */
  const INITIAL_MATERIALS = { magnetStrength: 0.2, batteryInternalResistanceRatio: 1.0, brushContactResistanceRatio: 1.3 };

  /** motor-only入口の共通不変量。全fixtureの入口直後assertで併用する(G1c-P4)。 */
  function assertMotorOnlyEntry(snapshot: Snapshot): void {
    expect(snapshot.seed).toBe(1); // beforeEachのrecipeSeed
    expect(snapshot.initialMotorState.omega).toBe(FLICK_INITIAL_OMEGA);
    expect(snapshot.track).toBeNull();
    expect(snapshot.slopeRad).toBeNull(); // motor-onlyは勾配文脈を持たない
  }

  beforeEach(() => {
    useGameStore.setState({ _runAccumulator: null, _runRng: null, recipeSeed: 1 });
  });

  // --- D01: コイル崩壊(spec §7.1、非終端) ---------------------------------
  describe('D01(コイル崩壊、flickStart、非終端)', () => {
    function arrangeD01(): void {
      buyAndEquip('magnet-alnico', 'magnet', 'magnetItemId');
      buyAndEquip('battery-lithium-polymer', 'battery', 'batteryItemId');
      buyAndEquip('brush-silver-graphite', 'brush', 'brushItemId');
      setPlayerConfig({ varnished: false, coilTurns: 20, magnetDistanceMm: 20, wireGaugeMm: 0.8, sandingQuality: 1.0 });
    }

    /** varnishedだけを差し替えて正例/負例を対置するための共通snapshot検証(G1c-P4)。 */
    function assertD01Snapshot(snapshot: Snapshot, varnished: boolean): void {
      assertMotorOnlyEntry(snapshot);
      expect(snapshot.motorConfig.varnished).toBe(varnished);
      expect(snapshot.motorConfig.coilTurns).toBe(20);
      expect(snapshot.motorConfig.magnetDistanceMm).toBe(20);
      expect(snapshot.motorConfig.wireGaugeMm).toBe(0.8);
      expect(snapshot.motorConfig.sandingQuality).toBe(1.0);
      // alnico / LiPo / silver-graphite。正例・負例で同一(差分はvarnishedだけ)
      assertMaterialRatios(snapshot, { magnetStrength: 0.55, batteryInternalResistanceRatio: 0.15, brushContactResistanceRatio: 0.7 });
    }

    it('production入口(flickStart→stepSim)でD01が発火する(実測step433)', () => {
      arrangeD01();
      const result = runFromProductionEntry(
        'flickStart', 900,
        (s) => assertD01Snapshot(s, false),
        (a) => a.destructionState.modes.D01.triggered,
      );

      expect(result.hitStep, 'D01が発火しませんでした').toBeGreaterThan(0);
      expect(result.hitStep).toBe(433); // production入口実測の回帰値
      // (3) 非終端モード: 発火時点でaccumulatorがnon-nullであることを確認し、state/eventを直接見る
      const accumulator = useGameStore.getState()._runAccumulator;
      expect(accumulator).not.toBeNull();
      expect(accumulator!.destructionState.modes.D01.triggered).toBe(true);
      expect(accumulator!.destructionState.modes.D01.causeLog).not.toBeNull();
      expect(accumulator!.events.map((e) => e.mode)).toContain('D01');
      expect(result.closedStep, 'D01は非終端であり走行が終わらない').toBe(-1);
    });

    it('負例: varnished:true(ワニス済み)では同一構成・同一step数でも発火しない', () => {
      arrangeD01();
      setPlayerConfig({ varnished: true }); // 他条件は同じままワニスのみ有効化
      const result = runFromProductionEntry(
        'flickStart', 900,
        (s) => assertD01Snapshot(s, true),
        () => false, // 回し切って非発火を確認する
      );

      expect(result.hitStep).toBe(-1);
      // 非空虚性: 正例と同じ高回転域(正例peak≈393)まで回り切ったうえで発火していない
      expect(result.peakOmega).toBeGreaterThan(300);
      const accumulator = useGameStore.getState()._runAccumulator;
      expect(accumulator, '負例は終端しない想定').not.toBeNull();
      expect(accumulator!.destructionState.modes.D01.triggered).toBe(false);
      expect(accumulator!.events.map((e) => e.mode)).not.toContain('D01');
    });
  });

  // --- D02: コイル焼損(終端) ----------------------------------------------
  describe('D02(コイル焼損、flickStart、destructionTerminal)', () => {
    function arrangeD02(): void {
      buyAndEquip('battery-lithium-polymer', 'battery', 'batteryItemId');
      buyAndEquip('brush-precious-metal', 'brush', 'brushItemId');
      // slitWidthMm:0.05 はデッドゾーン脱出のため必須(0にすると短絡=D03/D04経路になる)
      setPlayerConfig({ coilTurns: 15, sandingQuality: 1.0, brushPressure: 1.0, slitWidthMm: 0.05 });
    }

    it('production入口(flickStart→stepSim)でD02が発火しdestructionTerminalで終端する(実測step299)', () => {
      arrangeD02();
      const result = runFromProductionEntry(
        'flickStart', 600,
        (s) => {
          assertMotorOnlyEntry(s);
          expect(s.motorConfig.coilTurns).toBe(15);
          expect(s.motorConfig.sandingQuality).toBe(1.0);
          expect(s.motorConfig.brushPressure).toBe(1.0);
          expect(s.motorConfig.slitWidthMm).toBe(0.05);
          expect(s.motorConfig.slitWidthMm).toBeGreaterThan(0); // 短絡していない
          // 磁石は初期ferrite(未購入)、電池LiPo、ブラシ貴金属
          assertMaterialRatios(s, { magnetStrength: 0.2, batteryInternalResistanceRatio: 0.15, brushContactResistanceRatio: 0.5 });
          expect(s.destructionConfig.battery.profile).toBe('lipo');
        },
        () => false, // 終端まで回す
      );

      // D02は「拘束(ストール)状態で最大電流が流れ続けてコイルが焼ける」経路であり、
      // 高圧・低抵抗構成では回転が伸びない(実測peak|omega|≈4.95)。これは症状であって
      // テストの空虚さではない。負例はこの機構が進行しつつ閾値に達しないことを示す。
      expect(result.peakOmega).toBeLessThan(15); // 拘束状態であることの明示
      expect(result.closedStep).toBe(299); // production入口実測の回帰値
      // (2) terminal系: accumulator null化後もRunOutcomeで直接assertする
      expect(result.applyCalls).toBe(1); // exact1適用
      const outcome = result.outcome!;
      expect(outcome.endReason).toBe('destructionTerminal');
      expect(outcome.terminalModes).toEqual(['D02']);
      expect(outcome.events.map((e) => e.mode)).toContain('D02');
      expect(outcome.destructionState.modes.D02.triggered).toBe(true);
      expect(outcome.destructionState.modes.D02.coilHeatGaugeRatio).toBe(1);
      expect(result.recordKind).toBe('session');
      // 短絡経路(D03/D04)へ入っていないこと
      const battery = outcome.destructionState.battery;
      expect(battery.profile === 'lipo' && battery.d04.stage).toBe('none');
    });

    it('負例: 電池をアルカリ(既定)にすると同一step上限でも焼損しない', () => {
      // 正例との差分は電池だけ(LiPoを買わず初期アルカリのまま)。ブラシ・configは正例と同一
      buyAndEquip('brush-precious-metal', 'brush', 'brushItemId');
      setPlayerConfig({ coilTurns: 15, sandingQuality: 1.0, brushPressure: 1.0, slitWidthMm: 0.05 });
      const result = runFromProductionEntry(
        'flickStart', 600,
        (s) => {
          assertMotorOnlyEntry(s);
          expect(s.motorConfig.coilTurns).toBe(15); // 巻数・研磨・圧・ブラシは正例と同一
          expect(s.motorConfig.sandingQuality).toBe(1.0);
          expect(s.motorConfig.brushPressure).toBe(1.0);
          expect(s.motorConfig.slitWidthMm).toBe(0.05);
          // 因果の差分は電池だけ: LiPo(0.15)→初期アルカリ(1.0)の高内部抵抗で電流が下がる。
          // 磁石ferrite・ブラシ貴金属は正例と同一
          assertMaterialRatios(s, { magnetStrength: 0.2, batteryInternalResistanceRatio: 1.0, brushContactResistanceRatio: 0.5 });
          expect(s.destructionConfig.battery.profile).toBe('nonLipo');
        },
        () => false,
      );

      expect(result.hitStep).toBe(-1);
      // 終端していれば捕捉outcome、していなければaccumulatorでD02非発火を確認する
      const d02Fired = result.outcome !== null
        ? result.outcome.destructionState.modes.D02.triggered
        : useGameStore.getState()._runAccumulator!.destructionState.modes.D02.triggered;
      expect(d02Fired).toBe(false);
      // 非空虚性: コイル発熱ゲージは進行している(電流は流れた)が閾値1に達していない
      const gauge = (result.outcome !== null
        ? result.outcome.destructionState
        : useGameStore.getState()._runAccumulator!.destructionState).modes.D02.coilHeatGaugeRatio;
      expect(gauge).toBeGreaterThan(0);
      expect(gauge).toBeLessThan(1);
      const events = result.outcome !== null
        ? result.outcome.events
        : useGameStore.getState()._runAccumulator!.events;
      expect(events.map((e) => e.mode)).not.toContain('D02');
    });
  });

  // --- D03: 電池破裂(終端、nonLipo) ---------------------------------------
  describe('D03(電池破裂、flickStart、destructionTerminal)', () => {
    it('production入口でD03が発火しdestructionTerminalで終端する(実測step360)', () => {
      setPlayerConfig({ slitWidthMm: 0 }); // 短絡(初期電池alkaline=nonLipo)
      const result = runFromProductionEntry(
        'flickStart', 600,
        (s) => {
          assertMotorOnlyEntry(s);
          expect(s.motorConfig.slitWidthMm).toBe(0);
          assertMaterialRatios(s, INITIAL_MATERIALS); // 購入なし
          expect(s.destructionConfig.battery.profile).toBe('nonLipo');
        },
        () => false,
      );

      expect(result.closedStep).toBe(360);
      expect(result.applyCalls).toBe(1);
      const outcome = result.outcome!;
      expect(outcome.endReason).toBe('destructionTerminal');
      expect(outcome.terminalModes).toEqual(['D03']);
      expect(outcome.events.map((e) => e.mode)).toContain('D03');
      const battery = outcome.destructionState.battery;
      expect(battery.profile === 'nonLipo' && battery.d03.triggered).toBe(true);
      expect(result.recordKind).toBe('session');
    });

    it('負例: 短絡しない(slitWidthMm=0.05)なら同一step上限でも破裂しない', () => {
      // 正例(購入なし・初期アルカリ)との差分はslitWidthMmだけ
      setPlayerConfig({ slitWidthMm: 0.05 });
      const result = runFromProductionEntry(
        'flickStart', 600,
        (s) => {
          assertMotorOnlyEntry(s);
          expect(s.motorConfig.slitWidthMm).toBe(0.05); // 正例は0(短絡)、ここが唯一の差分
          assertMaterialRatios(s, INITIAL_MATERIALS); // 購入なし、素材は正例と完全に同一
          expect(s.destructionConfig.battery.profile).toBe('nonLipo');
        },
        () => false,
      );

      expect(result.hitStep).toBe(-1);
      const state = result.outcome !== null
        ? result.outcome.destructionState
        : useGameStore.getState()._runAccumulator!.destructionState;
      expect(state.battery.profile === 'nonLipo' && state.battery.d03.triggered).toBe(false);
      // 非空虚性: 電流は流れている(コイル発熱ゲージが進行)。短絡がないため破裂に至らないだけ
      expect(state.modes.D02.coilHeatGaugeRatio).toBeGreaterThan(0);
      const events = result.outcome !== null ? result.outcome.events : useGameStore.getState()._runAccumulator!.events;
      expect(events.map((e) => e.mode)).not.toContain('D03');
    });
  });

  // --- D04: 電池膨張〜炎上(終端、lipo) ------------------------------------
  describe('D04(電池炎上、flickStart、destructionTerminal)', () => {
    it('production入口でD04がburningへ到達しdestructionTerminalで終端する(実測step91)', () => {
      buyAndEquip('battery-lithium-polymer', 'battery', 'batteryItemId');
      setPlayerConfig({ slitWidthMm: 0 });
      const result = runFromProductionEntry(
        'flickStart', 400,
        (s) => {
          assertMotorOnlyEntry(s);
          expect(s.motorConfig.slitWidthMm).toBe(0);
          // 電池のみLiPo。磁石・ブラシは初期装備のまま(負例との差分は電池だけ)
          assertMaterialRatios(s, { ...INITIAL_MATERIALS, batteryInternalResistanceRatio: 0.15 });
          expect(s.destructionConfig.battery.profile).toBe('lipo');
        },
        () => false,
      );

      expect(result.closedStep).toBe(91);
      expect(result.applyCalls).toBe(1);
      const outcome = result.outcome!;
      expect(outcome.endReason).toBe('destructionTerminal');
      expect(outcome.terminalModes).toEqual(['D04']);
      expect(outcome.events.map((e) => e.mode)).toContain('D04');
      const battery = outcome.destructionState.battery;
      expect(battery.profile === 'lipo' && battery.d04.stage).toBe('burning');
      expect(result.recordKind).toBe('session');
    });

    it('負例: nonLipo電池(初期alkaline)は同一の短絡構成を最後まで回してもD04が発火しない', () => {
      setPlayerConfig({ slitWidthMm: 0 }); // 電池以外はD04正例と同一
      const result = runFromProductionEntry(
        'flickStart', 400,
        (s) => {
          assertMotorOnlyEntry(s);
          expect(s.motorConfig.slitWidthMm).toBe(0);
          assertMaterialRatios(s, INITIAL_MATERIALS); // 正例との差分は電池(LiPo未購入)だけ
          expect(s.destructionConfig.battery.profile).toBe('nonLipo');
        },
        () => false,
      );

      // この構成はD03で終端するため、捕捉したoutcomeでD04非発火を確認する
      expect(result.closedStep).toBe(360);
      expect(result.applyCalls).toBe(1);
      const outcome = result.outcome!;
      expect(outcome.terminalModes).not.toContain('D04');
      expect(outcome.events.filter((e) => e.mode === 'D04')).toHaveLength(0); // D04 event 0件
      expect(outcome.destructionState.battery.profile).toBe('nonLipo'); // lipoのD04 stateが存在しない
    });
  });

  // --- D05: 異常ブラシ火花(非終端) ----------------------------------------
  describe('D05(異常ブラシ火花、flickStart、非終端)', () => {
    function arrangeD05(): void {
      buyAndEquip('battery-lithium-polymer', 'battery', 'batteryItemId');
      buyAndEquip('brush-silver-graphite', 'brush', 'brushItemId');
      setPlayerConfig({ brushPressure: 0.1, coilTurns: 10, magnetDistanceMm: 10, slitWidthMm: 0.2 });
    }

    function assertD05Snapshot(snapshot: Snapshot, brushPressure: number): void {
      assertMotorOnlyEntry(snapshot);
      expect(snapshot.motorConfig.brushPressure).toBe(brushPressure);
      expect(snapshot.motorConfig.coilTurns).toBe(10);
      expect(snapshot.motorConfig.magnetDistanceMm).toBe(10);
      expect(snapshot.motorConfig.slitWidthMm).toBe(0.2);
      // 磁石は初期ferrite。正例・負例で同一(差分はbrushPressureだけ)
      assertMaterialRatios(snapshot, { magnetStrength: 0.2, batteryInternalResistanceRatio: 0.15, brushContactResistanceRatio: 0.7 });
    }

    it('production入口でD05のevent・episode・摩耗が発生する(実測step24)', () => {
      arrangeD05();
      const result = runFromProductionEntry(
        'flickStart', 600,
        (s) => assertD05Snapshot(s, 0.1),
        (a) => a.destructionState.modes.D05.episodeCount > 0
          && a.destructionState.modes.D05.cumulativeWearDeltaFraction > 0,
      );

      expect(result.hitStep).toBe(24);
      const accumulator = useGameStore.getState()._runAccumulator;
      expect(accumulator, 'D05は非終端').not.toBeNull();
      expect(accumulator!.events.map((e) => e.mode)).toContain('D05'); // G1c-P3: event直接assert
      const d05 = accumulator!.destructionState.modes.D05;
      expect(d05.episodeCount).toBeGreaterThan(0);
      expect(d05.cumulativeWearDeltaFraction).toBeGreaterThan(0);
      expect(d05.causeLog).not.toBeNull();
    });

    it('負例: brushPressureが既定(0.3、チャタリング閾値以上)では同一step上限でも発火しない', () => {
      arrangeD05();
      setPlayerConfig({ brushPressure: 0.3 }); // 正例との差分はブラシ圧だけ
      const result = runFromProductionEntry(
        'flickStart', 600,
        (s) => assertD05Snapshot(s, 0.3),
        () => false,
      );

      expect(result.hitStep).toBe(-1);
      const state = result.outcome !== null
        ? result.outcome.destructionState
        : useGameStore.getState()._runAccumulator!.destructionState;
      // 非空虚性: 正例(peak≈13.98)と同じ回転域まで動かしたうえでepisodeが0件
      expect(result.peakOmega).toBeGreaterThan(10);
      expect(state.modes.D02.coilHeatGaugeRatio).toBeGreaterThan(0); // 通電・整流が進行している
      expect(state.modes.D05.episodeCount).toBe(0);
      expect(state.modes.D05.cumulativeWearDeltaFraction).toBe(0);
      const events = result.outcome !== null ? result.outcome.events : useGameStore.getState()._runAccumulator!.events;
      expect(events.map((e) => e.mode)).not.toContain('D05');
    });
  });

  // --- D07: 熱減磁(非終端、test-run) --------------------------------------
  describe('D07(熱減磁、startTestRun、非終端)', () => {
    function assertD07Snapshot(snapshot: Snapshot, irreversibleKind: string): void {
      // startTestRunのseedはrecipeSeedではなく実行時採番。値ではなくlive側との一致を検証する
      expect(Number.isInteger(snapshot.seed)).toBe(true);
      expect(useGameStore.getState()._sessionSeed).toBe(snapshot.seed);
      expect(snapshot.motorConfig.coilTurns).toBe(20);
      expect(snapshot.motorConfig.magnetDistanceMm).toBe(5);
      expect(snapshot.motorConfig.brushPressure).toBe(0.5);
      expect(snapshot.destructionConfig.d07.irreversible.kind).toBe(irreversibleKind);
      // 勾配0のtest-run文脈であること(trackRun=G2を使っていない)
      expect(snapshot.slopeRad).toBe(0);
      expect(snapshot.track).toBeNull();
    }

    it('production入口(startTestRun→stepTestRun)でD07の不可逆減磁に到達する(実測step39)', () => {
      buyAndEquip('magnet-neodymium', 'magnet', 'magnetItemId');
      setPlayerConfig({ coilTurns: 20, magnetDistanceMm: 5, brushPressure: 0.5 });
      const result = runFromProductionEntry(
        'startTestRun', 300,
        (s) => {
          assertD07Snapshot(s, 'demagnetizing');
          // 磁石のみneodymium。電池・ブラシは初期装備(負例との差分は磁石だけ)
          assertMaterialRatios(s, { ...INITIAL_MATERIALS, magnetStrength: 0.9 });
        },
        (a) => a.destructionState.modes.D07.irreversibleTriggered,
      );

      expect(result.hitStep).toBe(39); // production入口実測(alice harnessの参考値は使わない)
      const accumulator = useGameStore.getState()._runAccumulator;
      expect(accumulator, 'step39では終端していない').not.toBeNull();
      const d07 = accumulator!.destructionState.modes.D07;
      expect(d07.irreversibleTriggered).toBe(true);
      expect(d07.causeLog).not.toBeNull();
      expect(accumulator!.events.map((e) => e.mode)).toContain('D07');
    });

    it('負例: 初期磁石(ferrite=nonDemagnetizing)では同一構成・同一step上限で不可逆減磁が起きない', () => {
      setPlayerConfig({ coilTurns: 20, magnetDistanceMm: 5, brushPressure: 0.5 }); // 磁石だけが異なる
      const result = runFromProductionEntry(
        'startTestRun', 300,
        (s) => {
          assertD07Snapshot(s, 'nonDemagnetizing');
          assertMaterialRatios(s, INITIAL_MATERIALS); // 購入なし、磁石だけが正例と異なる
        },
        (a) => a.destructionState.modes.D07.irreversibleTriggered,
      );

      expect(result.hitStep).toBe(-1);
      const state = result.outcome !== null
        ? result.outcome.destructionState
        : useGameStore.getState()._runAccumulator!.destructionState;
      // 非空虚性: 磁石発熱ゲージは上限まで達している。減磁しない材質のため不可逆判定に入らないだけ
      expect(state.modes.D07.magnetHeatGaugeRatio).toBe(1);
      expect(state.modes.D07.irreversibleTriggered).toBe(false);
      const events = result.outcome !== null ? result.outcome.events : useGameStore.getState()._runAccumulator!.events;
      expect(events.map((e) => e.mode)).not.toContain('D07');
    });
  });

  // --- motor-onlyのnotebook契約(共同DoD) ----------------------------------
  it('motor-onlyのPhase3 notebook recordがexact1件である', () => {
    setPlayerConfig({ slitWidthMm: 0 }); // D03で確実に終端させる
    const result = runFromProductionEntry(
      'flickStart', 600,
      (s) => { assertMotorOnlyEntry(s); assertMaterialRatios(s, INITIAL_MATERIALS); },
      () => false,
    );

    expect(result.closedStep).toBe(360);
    expect(result.applyCalls).toBe(1); // Phase3経路exact1件
    expect(result.recordKind).toBe('session');
  });
});

// ---------------------------------------------------------------------------
// P3-4 G2: track-run(course run)のproduction配線
// 計画§8(`stepTrackRunWithDestruction`、alice_mot3 handoff 2026-08-18T18:48:33Z)、
// §8.3(責務分離・destructionTerminal優先)、§8.4(全経路のテスト表)。
// F1確定契約(Suu_mot3 2026-08-18T18:44:23Z): manualAbort adapterの許可種別を
// motor/testRun/trackRun/anyへ細分化し、`replaySnapshot.track`のnull性を唯一の出典とする。
//
// 全fixtureはG1cと同じ手順に従う——素材の購入・装備をconfig設定より**前**に行い、
// 入口直後にsnapshot実効値をassertする(`useSaveStore.subscribe`によるconfig巻き戻しの検出)。
// ---------------------------------------------------------------------------
describe('G2: track-run production配線', () => {
  type Snapshot2 = NonNullable<ReturnType<typeof useGameStore.getState>['_runAccumulator']>['replaySnapshot'];

  function buyAndEquip2(materialId: string, family: 'battery' | 'brush' | 'magnet', key: 'batteryItemId' | 'brushItemId' | 'magnetItemId'): void {
    const purchased = useSaveStore.getState().purchaseMaterialAction(materialId as never);
    expect(purchased.ok, `${materialId}の購入に失敗しました`).toBe(true);
    const item = useSaveStore.getState().inventory.items.filter((i) => i.family === family && i.materialId === materialId).at(-1);
    expect(item, `${materialId}がinventoryに見つかりません`).toBeDefined();
    const equipped = useSaveStore.getState().setEquipmentLoadout({ ...useSaveStore.getState().equipmentLoadout, [key]: item!.itemId });
    expect(equipped.ok, `${materialId}の装備に失敗しました`).toBe(true);
  }

  /** 必ず購入・装備の後に呼ぶ(G1cで判明したsubscribe巻き戻し対策)。 */
  function setPlayerConfig2(partial: Partial<Record<string, unknown>>): void {
    const next = { ...useGameStore.getState().config, ...partial };
    expect(useSaveStore.getState().updateProgress({ config: next as never }), 'updateProgressに失敗').toBe(true);
    useGameStore.setState({ config: next as never });
  }

  type CourseResult = {
    closedStep: number;
    applyCalls: number;
    endReason: string | null;
    terminalModes: readonly string[] | null;
    finalStatus: string;
    coursePhase: string;
    /** G-R2: 捕捉したRunOutcome上のD06 event件数と歯欠け数(意味の単離を固定するため)。 */
    d06EventCount: number;
    toothLossCount: number;
  };

  /**
   * G-R2: このfixtureでD06が一切発火していないことを固定する。
   * `classifyTerminalModes`はD06全損もterminal候補に入れるため、歯欠けが混ざると
   * 「D04だけが終端要因」という主張自体が崩れる。D06の検証はG3の専用fixtureが担い、
   * 既存fixtureへ相乗りさせない。
   */
  function expectNoD06(result: CourseResult): void {
    expect(result.d06EventCount).toBe(0);
    expect(result.toothLossCount).toBe(0);
    expect(result.terminalModes ?? []).not.toContain('D06');
  }

  /**
   * course runのproduction実入口(startCourseRun→stepCourseRun)だけで走り切る。
   * wrapper直接呼出しは行わない。terminal時にaccumulatorがnull化されても検査が空に
   * ならないよう、performApplyRunOutcomeへ渡されたRunOutcomeを捕捉する。
   */
  function runCourseFromProductionEntry(
    trackId: string,
    maxStep: number,
    assertSnapshot: (snapshot: Snapshot2) => void,
  ): CourseResult {
    useGameStore.getState().selectTrack(trackId);
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    useGameStore.getState().startCourseRun();
    const started = useGameStore.getState()._runAccumulator;
    expect(started, 'startCourseRunでrunが開始されていません').not.toBeNull();
    assertSnapshot(started!.replaySnapshot);

    let closedStep = -1;
    for (let i = 0; i < maxStep; i++) {
      useGameStore.getState().stepCourseRun(1 / 120);
      if (useGameStore.getState()._runAccumulator === null) { closedStep = i + 1; break; }
    }
    const calls = applySpy.mock.calls;
    const outcome = calls.length > 0
      ? (calls[0]![0] as unknown as {
          endReason: string;
          terminalModes?: readonly string[];
          events: readonly { mode: string }[];
          destructionState: { modes: { D06: { toothLossCount: number } } };
        })
      : null;
    const liveAccumulator = useGameStore.getState()._runAccumulator;
    return {
      closedStep,
      applyCalls: calls.length,
      endReason: outcome?.endReason ?? null,
      terminalModes: outcome?.terminalModes ?? null,
      finalStatus: useGameStore.getState().vehicleState.status,
      coursePhase: useGameStore.getState().courseRunPhase,
      // 終端済みなら捕捉outcome、未終端ならliveのaccumulatorから読む(検査が空にならないように)
      d06EventCount: (outcome?.events ?? liveAccumulator?.events ?? []).filter((e) => e.mode === 'D06').length,
      toothLossCount: outcome?.destructionState.modes.D06.toothLossCount
        ?? liveAccumulator?.destructionState.modes.D06.toothLossCount
        ?? 0,
    };
  }

  /** track-run入口の共通不変量。RunSnapshotがtrack-run文脈であることを固定する。 */
  function assertTrackRunEntry(snapshot: Snapshot2, trackId: string): void {
    expect(snapshot.track, 'track-runのsnapshotはtrack非null').not.toBeNull();
    expect(snapshot.track!.id).toBe(trackId);
    // 交差検証契約: track非nullならcourseLengthM/slopeRadはnull(track側の曲率・勾配が担う)
    expect(snapshot.courseLengthM).toBeNull();
    expect(snapshot.slopeRad).toBeNull();
    expect(snapshot.runContext.context).toBe('vehicle');
    expect(snapshot.carConfig).not.toBeNull();
    // F3: seedの単一出典。_sessionSeed・live rngはsnapshot.seedから導かれる
    expect(useGameStore.getState()._sessionSeed).toBe(snapshot.seed);
    expect(useGameStore.getState()._runRng).not.toBeNull();
  }

  /** 完走fixtureのproduction入口実測step(G-R2、実装後の実測値)。 */
  const FINISHED_FIXTURE_STEP = 1785;

  beforeEach(() => {
    useGameStore.setState({ _runAccumulator: null, _runRng: null });
  });

  // --- run未開始時の不変条件 -----------------------------------------------
  describe('run未開始時の不変条件', () => {
    it('run未開始(accumulator null)ならstepCourseRunは物理を進めない', () => {
      useGameStore.getState().selectTrack('straight-10m');
      useGameStore.setState({ courseRunPhase: 'running', _runAccumulator: null, _runRng: null });
      const before = useGameStore.getState().vehicleState;

      useGameStore.getState().stepCourseRun(1 / 120);

      expect(useGameStore.getState().vehicleState).toBe(before); // 参照ごと不変
    });

    it('正典run RNGのみを使い、残置フィールド_vehicleRngStateを進めない', () => {
      useGameStore.getState().selectTrack('straight-10m');
      useGameStore.getState().startCourseRun();
      const rngStateBefore = useGameStore.getState()._vehicleRngState;

      for (let i = 0; i < 20; i++) useGameStore.getState().stepCourseRun(1 / 120);

      expect(useGameStore.getState()._vehicleRngState).toBe(rngStateBefore);
    });
  });

  // --- §8.4 全経路 ---------------------------------------------------------
  describe('§8.4 全終端経路', () => {
    /**
     * G-R2(人間再承認 2026-08-19、Suu_mot3中継): 旧fixture(coilTurns=20)は15 mコースを
     * 到達距離15.002 m=**余裕2 mm**で完走する限界構成であり、jEffが0.0075%増えるだけで
     * finished↔stalledが二値的に反転した(ギヤ慣性J接続で実際に反転し、step数も+13.3%動いた)。
     *
     * 対処としてcoilTurns=35へ変更し、**余裕そのものをassertする**。エネルギー予算の消費率に
     * 上限を課すことで、将来の物理変更が「結末が黙って反転する」のではなく
     * 「余裕が縮んだ」段階で検出できる。閾値0.75は実測0.7131に対する上限で、
     * 消費が相対5%増えるまでは緑、40%増で完走が危うくなるより十分手前で赤になる。
     *
     * 余裕の基準にエネルギー予算を選んだのは、energy-runが`hasEnergyBudget: true`で
     * **予算が実際に走行を止める唯一のトラック**だからである(他トラックでは同じ比率を
     * 測っても走行を止める保証にならない)。
     */
    it('完走(finished): 予算に余裕を持って15 mを走り切りendReason=finished', () => {
      buyAndEquip2('magnet-samarium-cobalt', 'magnet', 'magnetItemId');
      buyAndEquip2('battery-nickel-metal-hydride', 'battery', 'batteryItemId');
      setPlayerConfig2({ coilTurns: 35, magnetDistanceMm: 5, brushPressure: 0.2 });
      let energyBudgetJ = 0;
      const result = runCourseFromProductionEntry('energy-run', 2600, (s) => {
        assertTrackRunEntry(s, 'energy-run');
        expect(s.motorConfig.coilTurns).toBe(35);
        expect(s.motorConfig.magnetStrength).toBe(0.65); // samarium-cobalt
        expect(s.motorConfig.batteryInternalResistanceRatio).toBe(0.3); // NiMH
        // 予算はsnapshotの実効motorConfigから導く(live configではない、単一出典)
        energyBudgetJ = computeEnergyBudgetJ(s.motorConfig);
      });

      expect(result.closedStep).toBe(FINISHED_FIXTURE_STEP);
      expect(result.endReason).toBe('finished');
      expect(result.finalStatus).toBe('finished');
      expect(result.applyCalls).toBe(1);
      expect(result.coursePhase).toBe('complete');
      const finalState = useGameStore.getState().vehicleState;
      expect(finalState.positionM).toBeGreaterThanOrEqual(15);
      // 余裕下限の固定: 完走が反転する前に「余裕が縮んだ」段階で赤くする
      expect(energyBudgetJ).toBeGreaterThan(0);
      expect(finalState.energyUsedJ / energyBudgetJ).toBeLessThanOrEqual(0.75);
    });

    it('失速・電力不足(stalled+failureToStart): endReason=stalled(実測step179)', () => {
      const result = runCourseFromProductionEntry('straight-10m', 600, (s) => assertTrackRunEntry(s, 'straight-10m'));

      expect(result.closedStep).toBe(179);
      expect(result.endReason).toBe('stalled');
      expect(result.finalStatus).toBe('stalled');
      expect(useGameStore.getState().vehicleState.failureCode).toBe('failureToStart');
      expect(result.applyCalls).toBe(1);
    });

    it('予算超過(stalled+energyExhausted): endReason=energyExhausted(実測step1117)', () => {
      buyAndEquip2('magnet-samarium-cobalt', 'magnet', 'magnetItemId');
      buyAndEquip2('battery-nickel-metal-hydride', 'battery', 'batteryItemId');
      // 完走fixtureとの差分はcoilTurnsだけ(20→12)。同一素材・同一トラックで
      // 「巻数が少なく効率が悪いと予算を使い切る」ことを示す。
      setPlayerConfig2({ coilTurns: 12, magnetDistanceMm: 5, brushPressure: 0.2 });
      const result = runCourseFromProductionEntry('energy-run', 2000, (s) => {
        assertTrackRunEntry(s, 'energy-run');
        expect(s.motorConfig.coilTurns).toBe(12);
      });

      expect(result.closedStep).toBe(1117);
      // F4: gameStoreはendReasonを再導出せず、status+failureCodeをengineの写像へ渡す。
      // stalledのままではなくenergyExhaustedへ写像されることがこの契約の核心。
      expect(result.endReason).toBe('energyExhausted');
      expect(result.finalStatus).toBe('stalled');
      expect(useGameStore.getState().vehicleState.failureCode).toBe('energyExhausted');
      expect(result.applyCalls).toBe(1);
      expect(useGameStore.getState().vehicleState.positionM).toBeLessThan(15); // 完走していない
    });

    it('コースアウト(derailed): endReason=derailed(実測step504)', () => {
      buyAndEquip2('magnet-samarium-cobalt', 'magnet', 'magnetItemId');
      buyAndEquip2('battery-lithium-polymer', 'battery', 'batteryItemId');
      setPlayerConfig2({ coilTurns: 12, magnetDistanceMm: 5, brushPressure: 0.2 });
      const result = runCourseFromProductionEntry('curve-balance', 900, (s) => assertTrackRunEntry(s, 'curve-balance'));

      expect(result.closedStep).toBe(504);
      expect(result.endReason).toBe('derailed');
      expect(result.finalStatus).toBe('derailed');
      expect(result.applyCalls).toBe(1);
      expectNoD06(result); // G-R2: D06はこのfixtureでは発火しない(意味の単離)
    });

    it('熱暴走(overheated、非lipo): endReason=overheated(実測step20)', () => {
      setPlayerConfig2({ slitWidthMm: 0 }); // 短絡、初期alkaline=nonLipo
      const result = runCourseFromProductionEntry('straight-10m', 300, (s) => {
        assertTrackRunEntry(s, 'straight-10m');
        expect(s.destructionConfig.battery.profile).toBe('nonLipo');
      });

      expect(result.closedStep).toBe(20);
      expect(result.endReason).toBe('overheated');
      expect(result.finalStatus).toBe('overheated');
      expect(result.terminalModes).toBeNull(); // 破壊終端ではない
      expect(result.applyCalls).toBe(1);
    });

    it('手動中断(manualAbort): abortCourseRunでendReason=manualAbort', () => {
      const result = (() => {
        useGameStore.getState().selectTrack('straight-10m');
        const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
        useGameStore.getState().startCourseRun();
        assertTrackRunEntry(useGameStore.getState()._runAccumulator!.replaySnapshot, 'straight-10m');
        for (let i = 0; i < 30; i++) useGameStore.getState().stepCourseRun(1 / 120);
        expect(useGameStore.getState()._runAccumulator, '中断前はrunが生きている').not.toBeNull();
        useGameStore.getState().abortCourseRun();
        return applySpy;
      })();

      expect(result).toHaveBeenCalledTimes(1);
      expect(result.mock.calls[0]![0].endReason).toBe('manualAbort');
      expect(useGameStore.getState()._runAccumulator).toBeNull();
      expect(useGameStore.getState().courseRunPhase).toBe('aborted');
    });
  });

  // --- §8.3 destructionTerminal優先 ---------------------------------------
  describe('§8.3 destructionTerminal優先', () => {
    it('同一stepで物理終端(overheated)と破壊終端が両立する場合、destructionTerminalが勝つ(実測step91)', () => {
      buyAndEquip2('battery-lithium-polymer', 'battery', 'batteryItemId');
      setPlayerConfig2({ slitWidthMm: 0 });
      const result = runCourseFromProductionEntry('straight-10m', 300, (s) => {
        assertTrackRunEntry(s, 'straight-10m');
        expect(s.destructionConfig.battery.profile).toBe('lipo');
      });

      expect(result.closedStep).toBe(91);
      // 物理statusはoverheatedに達しているが、endReasonはdestructionTerminalが優先される
      expect(result.finalStatus).toBe('overheated');
      expect(result.endReason).toBe('destructionTerminal');
      expect(result.terminalModes).toEqual(['D04']);
      expect(result.applyCalls).toBe(1); // 二重適用しない
      expect(result.coursePhase).toBe('complete');
      expectNoD06(result); // G-R2: terminalModesへのD06混入がないことを直接固定する
    });

    it('物理statusがrunningのままでも破壊終端で走行が閉じる(実測step1024)', () => {
      buyAndEquip2('magnet-samarium-cobalt', 'magnet', 'magnetItemId');
      buyAndEquip2('battery-lithium-polymer', 'battery', 'batteryItemId');
      setPlayerConfig2({ coilTurns: 12, magnetDistanceMm: 5, brushPressure: 0.2 });
      const result = runCourseFromProductionEntry('energy-run', 1500, (s) => assertTrackRunEntry(s, 'energy-run'));

      expect(result.closedStep).toBe(1024);
      // statusを見るだけの終端判定では検出できない経路。wrapperのterminationが唯一の出典
      expect(result.finalStatus).toBe('running');
      expect(result.endReason).toBe('destructionTerminal');
      expect(result.terminalModes).toEqual(['D04']);
      expect(result.coursePhase).toBe('complete');
      expect(result.applyCalls).toBe(1);
      expectNoD06(result);
    });
  });

  // --- F1: manualAbort許可種別の細分化(双方向negative) --------------------
  describe('F1: run種別の細分化(testRun/trackRun/motorの相互不干渉)', () => {
    /** track-runを開始して数step進めた状態を作る。 */
    function startActiveTrackRun(): void {
      useGameStore.getState().selectTrack('straight-10m');
      useGameStore.getState().startCourseRun();
      for (let i = 0; i < 5; i++) useGameStore.getState().stepCourseRun(1 / 120);
      expect(useGameStore.getState()._runAccumulator).not.toBeNull();
      expect(useGameStore.getState()._runAccumulator!.replaySnapshot.track).not.toBeNull();
    }

    /** test-runを開始して数step進めた状態を作る。 */
    function startActiveTestRun(): void {
      useGameStore.getState().startTestRun();
      for (let i = 0; i < 5; i++) useGameStore.getState().stepTestRun(1 / 120);
      expect(useGameStore.getState()._runAccumulator).not.toBeNull();
      expect(useGameStore.getState()._runAccumulator!.replaySnapshot.track).toBeNull();
    }

    /**
     * P1是正(Suu_mot3 2026-08-18T19:04:02Z): 対象外入口を呼んでも、live runtimeが
     * **1つも**変わらないことを確認する。accumulator参照とapply回数だけでは、後続の
     * `set`が共有`vehicleState`・history・sample accumulatorを初期化する欠陥を見逃す。
     *
     * 対象外入口側のUI phaseは意図的に'running'へ置く。ガードが効いていなければ
     * 後続の`set`が走ってphaseが'aborted'/'ready'へ変わるため、
     * 「phaseが'running'のまま」であること自体がsetの不実行の証明になる。
     */
    function captureLiveRuntime() {
      const s = useGameStore.getState();
      return {
        accumulator: s._runAccumulator,
        vehicleState: s.vehicleState,
        simState: s.simState,
        testRunPhase: s.testRunPhase,
        courseRunPhase: s.courseRunPhase,
        testRunHistory: s.testRunHistory,
        courseRunHistory: s.courseRunHistory,
        sampleAccumulator: s._vehicleSampleAccumulatorSec,
        runRng: s._runRng,
        sessionSeed: s._sessionSeed,
      };
    }

    function expectLiveRuntimeUnchanged(before: ReturnType<typeof captureLiveRuntime>): void {
      const after = captureLiveRuntime();
      expect(after.accumulator).toBe(before.accumulator); // 参照ごと不変
      expect(after.vehicleState).toBe(before.vehicleState); // 共有vehicleStateが初期化されていない
      expect(after.simState).toBe(before.simState);
      expect(after.testRunPhase).toBe(before.testRunPhase);
      expect(after.courseRunPhase).toBe(before.courseRunPhase);
      expect(after.testRunHistory).toBe(before.testRunHistory);
      expect(after.courseRunHistory).toBe(before.courseRunHistory);
      expect(after.sampleAccumulator).toBe(before.sampleAccumulator);
      expect(after.runRng).toBe(before.runRng);
      expect(after.sessionSeed).toBe(before.sessionSeed);
    }

    it('abortTestRunは進行中のtrack-runへ一切副作用を与えない', () => {
      startActiveTrackRun();
      useGameStore.setState({ testRunPhase: 'running' }); // 境界: 後続setが走れば'aborted'になる
      const before = captureLiveRuntime();
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      useGameStore.getState().abortTestRun();

      expect(applySpy).not.toHaveBeenCalled();
      expectLiveRuntimeUnchanged(before);
      expect(useGameStore.getState().testRunPhase).toBe('running'); // setが実行されていない証明
    });

    it('resetTestRunは進行中のtrack-runへ一切副作用を与えない(共有vehicleStateを初期化しない)', () => {
      startActiveTrackRun();
      useGameStore.setState({ testRunPhase: 'running' });
      const before = captureLiveRuntime();
      expect(before.vehicleState.elapsedTimeS, '前提: track-runは既に進んでいる').toBeGreaterThan(0);
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      useGameStore.getState().resetTestRun();

      expect(applySpy).not.toHaveBeenCalled();
      expectLiveRuntimeUnchanged(before);
      expect(useGameStore.getState().vehicleState.elapsedTimeS).toBe(before.vehicleState.elapsedTimeS);
      expect(useGameStore.getState().testRunPhase).toBe('running');
    });

    it('abortCourseRunは進行中のtest-runへ一切副作用を与えない', () => {
      startActiveTestRun();
      useGameStore.setState({ courseRunPhase: 'running' }); // 境界: 後続setが走れば'aborted'になる
      const before = captureLiveRuntime();
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      useGameStore.getState().abortCourseRun();

      expect(applySpy).not.toHaveBeenCalled();
      expectLiveRuntimeUnchanged(before);
      expect(useGameStore.getState().courseRunPhase).toBe('running');
    });

    it('resetCourseRunは進行中のtest-runへ一切副作用を与えない(共有vehicleStateを初期化しない)', () => {
      startActiveTestRun();
      useGameStore.setState({ courseRunPhase: 'running' });
      const before = captureLiveRuntime();
      expect(before.vehicleState.elapsedTimeS, '前提: test-runは既に進んでいる').toBeGreaterThan(0);
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      useGameStore.getState().resetCourseRun();

      expect(applySpy).not.toHaveBeenCalled();
      expectLiveRuntimeUnchanged(before);
      expect(useGameStore.getState().vehicleState.elapsedTimeS).toBe(before.vehicleState.elapsedTimeS);
      expect(useGameStore.getState().courseRunPhase).toBe('running');
    });

    it('abortCourseRunは進行中のmotor-only runへ一切副作用を与えない', () => {
      useGameStore.getState().flickStart();
      for (let i = 0; i < 5; i++) useGameStore.getState().stepSim(1 / 120);
      expect(useGameStore.getState()._runAccumulator).not.toBeNull();
      useGameStore.setState({ courseRunPhase: 'running' });
      const before = captureLiveRuntime();
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      useGameStore.getState().abortCourseRun();

      expect(applySpy).not.toHaveBeenCalled();
      expectLiveRuntimeUnchanged(before);
    });

    it('resetCourseRunは進行中のmotor-only runへ一切副作用を与えない', () => {
      useGameStore.getState().flickStart();
      for (let i = 0; i < 5; i++) useGameStore.getState().stepSim(1 / 120);
      useGameStore.setState({ courseRunPhase: 'running' });
      const before = captureLiveRuntime();
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      useGameStore.getState().resetCourseRun();

      expect(applySpy).not.toHaveBeenCalled();
      expectLiveRuntimeUnchanged(before);
    });

    it('finalizeMotorOnlyRunIfActiveは進行中のtrack-runを閉じない', () => {
      startActiveTrackRun();
      const before = captureLiveRuntime();
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      const outcome = useGameStore.getState().finalizeMotorOnlyRunIfActive();

      expect(outcome).toBeNull();
      expect(applySpy).not.toHaveBeenCalled();
      expectLiveRuntimeUnchanged(before);
    });

    // --- no-active回帰: active runがなければ従来どおりreset/abortできる ---
    it('回帰: active runがなければresetCourseRunは従来どおりcourse runtimeを初期化する', () => {
      useGameStore.setState({ courseRunPhase: 'running', _runAccumulator: null, _runRng: null });

      useGameStore.getState().resetCourseRun();

      expect(useGameStore.getState().courseRunPhase).toBe('ready');
      expect(useGameStore.getState().vehicleState.elapsedTimeS).toBe(0);
    });

    it('回帰: active runがなければresetTestRunは従来どおりtest runtimeを初期化する', () => {
      useGameStore.setState({ testRunPhase: 'running', _runAccumulator: null, _runRng: null });

      useGameStore.getState().resetTestRun();

      expect(useGameStore.getState().testRunPhase).toBe('ready');
      expect(useGameStore.getState().vehicleState.elapsedTimeS).toBe(0);
    });

    // --- 正例(同種): manualAbort exact1回のあとUI reset/abortが行われる ---
    it('正例: resetCourseRunは同種(track-run)ならmanualAbort exact1回の後にUIを初期化する', () => {
      startActiveTrackRun();
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      useGameStore.getState().resetCourseRun();

      expect(applySpy).toHaveBeenCalledTimes(1);
      expect(applySpy.mock.calls[0]![0].endReason).toBe('manualAbort');
      expect(useGameStore.getState()._runAccumulator).toBeNull();
      expect(useGameStore.getState().courseRunPhase).toBe('ready');
      expect(useGameStore.getState().vehicleState.elapsedTimeS).toBe(0);
    });

    it('正例: resetTestRunは同種(test-run)ならmanualAbort exact1回の後にUIを初期化する', () => {
      startActiveTestRun();
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      useGameStore.getState().resetTestRun();

      expect(applySpy).toHaveBeenCalledTimes(1);
      expect(applySpy.mock.calls[0]![0].endReason).toBe('manualAbort');
      expect(useGameStore.getState()._runAccumulator).toBeNull();
      expect(useGameStore.getState().testRunPhase).toBe('ready');
    });

    it('正例: abortCourseRunは進行中のtrack-runを閉じる(上記の負例が空虚でないことの担保)', () => {
      startActiveTrackRun();
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      useGameStore.getState().abortCourseRun();

      expect(useGameStore.getState()._runAccumulator).toBeNull();
      expect(applySpy).toHaveBeenCalledTimes(1);
      expect(applySpy.mock.calls[0]![0].endReason).toBe('manualAbort');
    });

    it('正例: abortTestRunは進行中のtest-runを閉じる(上記の負例が空虚でないことの担保)', () => {
      startActiveTestRun();
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      useGameStore.getState().abortTestRun();

      expect(useGameStore.getState()._runAccumulator).toBeNull();
      expect(applySpy).toHaveBeenCalledTimes(1);
      expect(applySpy.mock.calls[0]![0].endReason).toBe('manualAbort');
    });

    it("setMode('any')は種別を問わずtrack-runも閉じる", () => {
      startActiveTrackRun();
      const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');

      useGameStore.getState().setMode('assembly');

      expect(useGameStore.getState()._runAccumulator).toBeNull();
      expect(applySpy).toHaveBeenCalledTimes(1);
      expect(applySpy.mock.calls[0]![0].endReason).toBe('manualAbort');
    });
  });

  // --- F5: courseProgress永続化とRunOutcome適用の共存 ----------------------
  describe('F5: 永続書き込みの共存', () => {
    /**
     * G-R2: 本テストの目的は「courseProgress更新とRunOutcome適用がそれぞれexact1回」であり、
     * 終端種別ではない。旧fixture(完走)は境界をまたぐか否かの二値判定に依存しており、
     * 物理側の微小変更で終端種別が反転して目的と無関係に赤くなった。
     *
     * straight-10m・購入なし・既定configは**そもそも発進できない**ことによる失速で、
     * 予算消費率2.29%・到達距離0.032 mといずれの閾値からも大きく離れており、
     * 終端種別が反転しない。目的を保ったまま反転リスクだけを除いた形。
     *
     * `record.last.status`は実測exactで固定し、「何らかの終端」へは緩めない。
     */
    it('終端時にcourseProgressの更新とRunOutcome適用がそれぞれexact1回ずつ行われる', () => {
      const progressSpy = vi.spyOn(useSaveStore.getState(), 'updateProgress');
      const callsBeforeRun = progressSpy.mock.calls.length;
      const result = runCourseFromProductionEntry('straight-10m', 600, (s) => {
        assertTrackRunEntry(s, 'straight-10m');
        // 購入なし=初期装備のまま(ferrite / alkaline / copper-plate)
        expect(s.motorConfig.magnetStrength).toBe(0.2);
        expect(s.motorConfig.batteryInternalResistanceRatio).toBe(1.0);
        expect(s.motorConfig.brushContactResistanceRatio).toBe(1.3);
      });

      expect(result.closedStep).toBe(179);
      expect(result.endReason).toBe('stalled');
      expect(result.finalStatus).toBe('stalled');
      expect(useGameStore.getState().vehicleState.failureCode).toBe('failureToStart');
      expect(result.applyCalls).toBe(1);
      const courseProgressCalls = progressSpy.mock.calls
        .slice(callsBeforeRun)
        .filter((c) => (c[0] as Record<string, unknown>).courseProgress !== undefined);
      expect(courseProgressCalls).toHaveLength(1);
      const record = useGameStore.getState().courseProgress['straight-10m'];
      expect(record).toBeDefined();
      expect(record!.attempts).toBe(1);
      expect(record!.last.status).toBe('stalled'); // exact、「何らかの終端」へ緩めない
      expectNoD06(result);
    });

    it('走行中にgameStore.configを書き換えても目標評価はsnapshotの実効値で行われる', () => {
      buyAndEquip2('magnet-samarium-cobalt', 'magnet', 'magnetItemId');
      buyAndEquip2('battery-nickel-metal-hydride', 'battery', 'batteryItemId');
      // energy-runのEX目標はwireGaugeMm=0.8のcompliance。0.8で開始する
      setPlayerConfig2({ coilTurns: 20, magnetDistanceMm: 5, brushPressure: 0.2, wireGaugeMm: 0.8 });
      useGameStore.getState().selectTrack('energy-run');
      useGameStore.getState().startCourseRun();
      expect(useGameStore.getState()._runAccumulator!.replaySnapshot.motorConfig.wireGaugeMm).toBe(0.8);

      // 走行の途中でlive configだけを制限違反の値へ書き換える(snapshotは不変)
      useGameStore.setState({ config: { ...useGameStore.getState().config, wireGaugeMm: 0.5 } });
      expect(useGameStore.getState().config.wireGaugeMm, '前提: live configを書き換えた').toBe(0.5);
      for (let i = 0; i < 2000; i++) {
        useGameStore.getState().stepCourseRun(1 / 120);
        if (useGameStore.getState()._runAccumulator === null) break;
        // 目標評価が走るterminal stepの直前まで、live configは違反値のままである
        expect(useGameStore.getState().config.wireGaugeMm).toBe(0.5);
      }

      // F5の実挙動の記録: 終端時のupdateProgress({courseProgress})がuseSaveStore.subscribeを
      // 発火させ、永続側のprogress.config(0.8)でlive configが巻き戻る。目標評価は
      // 巻き戻りより前(set()内)に行われるため、評価時点のlive configは0.5であった。
      expect(useGameStore.getState().config.wireGaugeMm).toBe(0.8);
      const record = useGameStore.getState().courseProgress['energy-run'];
      expect(record).toBeDefined();
      expect(record!.last.status).toBe('finished');
      // live configを見ていればcomplianceは達成にならない。snapshotを見ているので達成する
      expect(record!.achievedObjectiveIds).toContain('energy-ex-wire');
    });

    it('負例: 制限違反の太さで開始した場合はcomplianceが達成にならない(上記が空虚でないことの担保)', () => {
      buyAndEquip2('magnet-samarium-cobalt', 'magnet', 'magnetItemId');
      buyAndEquip2('battery-nickel-metal-hydride', 'battery', 'batteryItemId');
      setPlayerConfig2({ coilTurns: 20, magnetDistanceMm: 5, brushPressure: 0.2, wireGaugeMm: 0.5 });
      const result = runCourseFromProductionEntry('energy-run', 2500, (s) => {
        assertTrackRunEntry(s, 'energy-run');
        expect(s.motorConfig.wireGaugeMm).toBe(0.5); // 開始時点から制限違反
      });

      expect(result.applyCalls).toBe(1);
      const record = useGameStore.getState().courseProgress['energy-run'];
      expect(record).toBeDefined();
      expect(record!.achievedObjectiveIds).not.toContain('energy-ex-wire');
    });
  });
});

// ---------------------------------------------------------------------------
// P3-4 G3 (6): 装備ギヤ素材差がproduction snapshot/carConfigへ反映されること
// Suu_mot3の部分先行許可(2026-08-19T05:28:02Z)。D06閾値問題(発火不能)とは独立の項目。
//
// 期待値は**式由来**で導く(実測値のコピーではない):
//   V              = π r² t                  (gearInertia.tsの唯一の幾何出典を共有、DoD-C8-a)
//   J_actual       = 0.5 ρ V r²
//   J_reflected    = J_actual / gearRatio²    (R13: etaで除算しない)
//   massDelta [g]  = (ρ_equipped − ρ_anchor) V × 1000   (anchor=POM、G-R1の差分方式)
//
// 密度はmaterials.tsの実値: POM 1410(verified・anchor)/PEEK 1300(verified)/
// Ti-6Al-4V 4430(verified)/PA6 1130(designAssumption)。
// ---------------------------------------------------------------------------
describe('G3(6): 装備ギヤ素材差のproduction snapshot反映', () => {
  const GEAR_DENSITY_KG_M3 = {
    'gear-pom': 1410,
    'gear-nylon-pa6': 1130,
    'gear-peek': 1300,
    'gear-titanium': 4430,
  } as const;
  const ANCHOR_GEAR_ID = 'gear-pom'; // materials.tsでisBaselineAnchor=trueのティア

  /** ギヤ体積 [m³]。gearInertia.tsと同一の幾何定数から導く(定数の二重定義をしない)。 */
  const gearVolumeM3 = Math.PI * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_THICKNESS_M;

  function expectedReflectedInertia(gearId: keyof typeof GEAR_DENSITY_KG_M3, gearRatio: number): number {
    const massKg = GEAR_DENSITY_KG_M3[gearId] * gearVolumeM3;
    const actual = 0.5 * massKg * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_RADIUS_M;
    return actual / (gearRatio * gearRatio);
  }

  function expectedMassDeltaG(gearId: keyof typeof GEAR_DENSITY_KG_M3): number {
    return (GEAR_DENSITY_KG_M3[gearId] - GEAR_DENSITY_KG_M3[ANCHOR_GEAR_ID]) * gearVolumeM3 * 1000;
  }

  /**
   * ギヤ購入用に所持金を積んだ状態でsaveStoreを初期化する(Suu_mot3承認済みのtest専用bootstrap)。
   * 本番価格(gear-titanium=1200G > INITIAL_CASH_G=1000)を変更せずに購入経路を通すための手当て。
   * 購入・装備は本番のpurchaseMaterialAction/setEquipmentLoadoutのみを使い、
   * inventoryへの直接注入で購入経路を迂回することはしない。
   */
  function resetSaveStoreWithCash(cashG: number): void {
    fakeStorage = makeFakeLocalStorage();
    // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
    globalThis.localStorage = fakeStorage;
    const fresh = __testOnly.freshBootstrap();
    const seeded = { ...fresh, inventory: { ...fresh.inventory, cashG } };
    __testOnly.writeV16(seeded);
    useSaveStore.setState({
      ...seeded,
      currentRunSequence: null,
      leaseState: 'leaseNotAcquired',
      pendingRunEquipmentSnapshot: null,
      pendingRunSaveId: null,
      bootstrapError: null,
    });
    useSaveStore.getState()._evaluateLeaseOnce(new Date(0).toISOString());
  }

  /**
   * 本番経路でギヤを購入し装備する。ギヤ購入時にbearingアセンブリが自動生成される
   * (saveStore.tsのautogenBearingsForNewGears)ため、loadoutのbearingAssemblyIdも
   * 同じギヤ個体に紐づくものへ更新する(そうしないとvalidateEquipmentLoadoutが弾く)。
   */
  function buyAndEquipGear(gearId: keyof typeof GEAR_DENSITY_KG_M3): void {
    const purchased = useSaveStore.getState().purchaseMaterialAction(gearId as never);
    expect(purchased.ok, `${gearId}の購入に失敗しました`).toBe(true);
    const item = useSaveStore.getState().inventory.items
      .filter((i) => i.family === 'gear' && i.materialId === gearId).at(-1);
    expect(item, `${gearId}がinventoryに見つかりません`).toBeDefined();
    const bearing = useSaveStore.getState().inventory.bearingAssemblies.find((b) => b.gearItemId === item!.itemId);
    expect(bearing, `${gearId}に対応するbearingアセンブリが自動生成されていません`).toBeDefined();
    const equipped = useSaveStore.getState().setEquipmentLoadout({
      ...useSaveStore.getState().equipmentLoadout,
      gearItemId: item!.itemId,
      bearingAssemblyId: bearing!.assemblyId,
    });
    expect(equipped.ok, `${gearId}の装備に失敗しました`).toBe(true);
  }

  /** production入口(startCourseRun)を1回だけ通し、確定したRunSnapshotを返す。 */
  function captureTrackRunSnapshot(): NonNullable<ReturnType<typeof useGameStore.getState>['_runAccumulator']>['replaySnapshot'] {
    useGameStore.getState().selectTrack('straight-10m');
    useGameStore.getState().startCourseRun();
    const accumulator = useGameStore.getState()._runAccumulator;
    expect(accumulator, 'startCourseRunでrunが開始されていません').not.toBeNull();
    return accumulator!.replaySnapshot;
  }

  beforeEach(() => {
    resetSaveStoreWithCash(100_000); // 全ティアを本番価格で購入できる額
    useGameStore.setState({ _runAccumulator: null, _runRng: null });
  });

  it('初期装備(POM=anchor)ではJが式どおりに載り、POMを買い直してもmassGが変わらない(anchor差分0)', () => {
    const initial = captureTrackRunSnapshot().carConfig!;

    expect(initial.gearReflectedInertiaKgM2).toBeCloseTo(
      expectedReflectedInertia('gear-pom', initial.gearRatio), 15,
    );
    expect(expectedMassDeltaG('gear-pom')).toBe(0); // anchorとの差分は定義上0

    // 本番経路で別個体のPOMを購入・装備しても、anchorと同素材なのでmassG・Jとも不変であること。
    // 「差分0」を、値を読み比べるのではなく**経路を通した前後比較**で確認する。
    useGameStore.getState().abortCourseRun();
    buyAndEquipGear('gear-pom');
    const reequipped = captureTrackRunSnapshot().carConfig!;

    expect(reequipped.massG).toBe(initial.massG);
    expect(reequipped.gearReflectedInertiaKgM2).toBe(initial.gearReflectedInertiaKgM2);
  });

  it.each([
    ['gear-peek'],
    ['gear-titanium'],
    ['gear-nylon-pa6'],
  ] as const)('%s を本番経路で装備するとJ・massGが式どおりsnapshotへ反映される', (gearId) => {
    // 基準(POM装備)のmassGを先に確定させる
    const baseCarConfig = captureTrackRunSnapshot().carConfig!;
    const baseMassG = baseCarConfig.massG;
    useGameStore.getState().abortCourseRun(); // 前のrunを閉じてから次を開始する

    buyAndEquipGear(gearId);
    const snapshot = captureTrackRunSnapshot();
    const carConfig = snapshot.carConfig!;

    // 装備ギヤがsnapshotのselectionへ反映されていること(purchase/equip経路が効いた証拠)
    expect(carConfig.gearRatio).toBe(baseCarConfig.gearRatio); // ギヤ比は車体プリセット由来で不変
    expect(carConfig.gearReflectedInertiaKgM2).toBeCloseTo(
      expectedReflectedInertia(gearId, carConfig.gearRatio), 15,
    );
    expect(carConfig.massG - baseMassG).toBeCloseTo(expectedMassDeltaG(gearId), 9);
    // 密度の大小関係がそのままJ・massGの大小関係になる(POM 1410 が基準)
    if (GEAR_DENSITY_KG_M3[gearId] > GEAR_DENSITY_KG_M3[ANCHOR_GEAR_ID]) {
      expect(carConfig.gearReflectedInertiaKgM2!).toBeGreaterThan(baseCarConfig.gearReflectedInertiaKgM2!);
      expect(carConfig.massG).toBeGreaterThan(baseMassG);
    } else {
      expect(carConfig.gearReflectedInertiaKgM2!).toBeLessThan(baseCarConfig.gearReflectedInertiaKgM2!);
      expect(carConfig.massG).toBeLessThan(baseMassG);
    }
  });

  it('チタンはPOMに対しJが密度比(4430/1410)倍、実質量差が式どおりになる', () => {
    const baseCarConfig = captureTrackRunSnapshot().carConfig!;
    const baseMassG = baseCarConfig.massG;
    useGameStore.getState().abortCourseRun();

    buyAndEquipGear('gear-titanium');
    const carConfig = captureTrackRunSnapshot().carConfig!;

    // spec §4.2「チタンは砕けない代わりに重い」がJ・質量の両経路へ実反映されていること
    const densityRatio = GEAR_DENSITY_KG_M3['gear-titanium'] / GEAR_DENSITY_KG_M3['gear-pom'];
    expect(carConfig.gearReflectedInertiaKgM2! / baseCarConfig.gearReflectedInertiaKgM2!).toBeCloseTo(densityRatio, 12);
    expect(carConfig.massG - baseMassG).toBeCloseTo(expectedMassDeltaG('gear-titanium'), 9);
    expect(carConfig.massG - baseMassG).toBeGreaterThan(1.8); // 約+1.82 g(arbiter裁定の効果量記述と一致)
    expect(carConfig.massG - baseMassG).toBeLessThan(1.9);
  });

  it('Jはギヤ比の2乗に反比例する(R13の反射式、etaは関与しない)', () => {
    const base = captureTrackRunSnapshot().carConfig!;
    useGameStore.getState().abortCourseRun();
    // 車体プリセットでギヤ比を変更する(素材は変えない)
    useGameStore.getState().setGarageSelection({ gearId: 'torque' } as never);
    const changed = captureTrackRunSnapshot().carConfig!;

    expect(changed.gearRatio).not.toBe(base.gearRatio);
    expect(changed.gearReflectedInertiaKgM2).toBeCloseTo(
      expectedReflectedInertia('gear-pom', changed.gearRatio), 15,
    );
    // 反射式はJ_actual/gearRatio²。etaが関与するならgearEfficiencyの違いで比が崩れる
    const ratio = base.gearReflectedInertiaKgM2! / changed.gearReflectedInertiaKgM2!;
    expect(ratio).toBeCloseTo((changed.gearRatio * changed.gearRatio) / (base.gearRatio * base.gearRatio), 10);
    expect(changed.gearEfficiency).not.toBe(base.gearEfficiency); // etaは実際に異なる(比が崩れないことの前提)
  });

});

// ---------------------------------------------------------------------------
// P3-4 G3 (1)〜(5): D06(ギヤ歯欠け)のproduction入口統合検証
// arbiter裁定Q4(2026-08-19人間承認)が要求する5項目——(1)反復歯欠けevent、(2)効率低下、
// (3)決定論的ripple、(4)全損destructionTerminal、(5)Ti非発火——をすべてG3で固定する。
//
// 前提となる較正値はG-R3(人間再承認2026-08-19): POM 0.00500 / PA6 0.00726 / PEEK 0.00790 N·m、
// `toothFatigueExposureNmS` 0.0100 N·m·s。旧値(0.4等)はグリップ上限capにより構造的に
// 到達不能だった(実測: production攻め構成の上限は0.013544 N·m)。
//
// **発火構成の要点**: `loadTorqueNm`はモーター軸換算(`(fContact × wheelRadius)/(gearRatio × eta)`)
// であり、**ギヤ比は分母**である。したがって高トルクを得るには「登坂ギヤ(高gearRatio)」ではなく
// **低gearRatio + 大径車輪**を選ぶ。上限はタイヤのグリップ(μmg)でcapされ、モーター側を
// いくら強化しても超えられない。この方向を取り違えると発火構成に到達できない。
//
// G5に残された最終時間・体感較正(1本目0.5〜10秒の作り込み、9歯最悪ケースの到達時間)は
// 先取りしない。ここで固定するのは「発火可能な桁で5項目の意味論が成立すること」に限る。
// ---------------------------------------------------------------------------
describe('G3(1)〜(5): D06のproduction入口統合検証', () => {
  type D06Event = {
    mode: string;
    isFirstThisSession: boolean;
    isTotalLoss: boolean;
    causeLog: { toothLossCount: number; loadTorqueNm: number };
  };

  type D06RunResult = {
    closedStep: number;
    endReason: string | null;
    terminalModes: readonly string[] | null;
    finalStatus: string;
    finalPositionM: number;
    applyCalls: number;
    d06Events: readonly D06Event[];
    /** 歯を失ったstep(1始まり)。終端stepで失った最後の1本はaccumulator null化後のため含まれない。 */
    lossSteps: readonly number[];
    toothLossCount: number;
    baseGearEfficiency: number;
    gearBreakageKind: string;
  };

  function resetSaveStoreWithCashForD06(cashG: number): void {
    fakeStorage = makeFakeLocalStorage();
    // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
    globalThis.localStorage = fakeStorage;
    const fresh = __testOnly.freshBootstrap();
    const seeded = { ...fresh, inventory: { ...fresh.inventory, cashG } };
    __testOnly.writeV16(seeded);
    useSaveStore.setState({
      ...seeded,
      currentRunSequence: null,
      leaseState: 'leaseNotAcquired',
      pendingRunEquipmentSnapshot: null,
      pendingRunSaveId: null,
      bootstrapError: null,
    });
    useSaveStore.getState()._evaluateLeaseOnce(new Date(0).toISOString());
  }

  function buyAndEquipForD06(materialId: string, family: 'battery' | 'brush' | 'magnet' | 'gear'): void {
    const purchased = useSaveStore.getState().purchaseMaterialAction(materialId as never);
    expect(purchased.ok, `${materialId}の購入に失敗しました`).toBe(true);
    const item = useSaveStore.getState().inventory.items
      .filter((i) => i.family === family && i.materialId === materialId).at(-1);
    expect(item, `${materialId}がinventoryに見つかりません`).toBeDefined();
    const loadout = useSaveStore.getState().equipmentLoadout;
    const next = family === 'gear'
      // ギヤ買い替え時はbearingも同じ個体へ紐づけ直す(validateEquipmentLoadoutの1:1対応制約)
      ? {
          ...loadout,
          gearItemId: item!.itemId,
          bearingAssemblyId: useSaveStore.getState().inventory.bearingAssemblies
            .find((b) => b.gearItemId === item!.itemId)!.assemblyId,
        }
      : { ...loadout, [`${family}ItemId`]: item!.itemId };
    const equipped = useSaveStore.getState().setEquipmentLoadout(next);
    expect(equipped.ok, `${materialId}の装備に失敗しました`).toBe(true);
  }

  /**
   * D06が発火する高トルク構成をproduction入口で走らせる。
   * hill-climb(勾配25度)+低gearRatio(2)+大径車輪(45mm)でグリップ上限近くの
   * 負荷トルクを持続させる。ギヤ未指定なら初期装備のPOM(最弱、閾値0.00500 N·m)。
   */
  function runD06Fixture(options: { gearMaterialId?: string; maxStep: number }): D06RunResult {
    buyAndEquipForD06('magnet-neodymium', 'magnet');
    buyAndEquipForD06('battery-lithium-polymer', 'battery');
    buyAndEquipForD06('brush-precious-metal', 'brush');
    if (options.gearMaterialId !== undefined) buyAndEquipForD06(options.gearMaterialId, 'gear');
    useGameStore.getState().setGarageSelection({ gearId: 'fast', wheelId: 'large' } as never);
    useGameStore.getState().selectTrack('hill-climb');
    const config = {
      ...useGameStore.getState().config,
      coilTurns: 150, magnetDistanceMm: 3, brushPressure: 0.2, sandingQuality: 1.0,
    };
    expect(useSaveStore.getState().updateProgress({ config: config as never })).toBe(true);
    useGameStore.setState({ config: config as never });

    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    useGameStore.getState().startCourseRun();
    const started = useGameStore.getState()._runAccumulator;
    expect(started, 'startCourseRunでrunが開始されていません').not.toBeNull();
    const snapshot = started!.replaySnapshot;
    expect(snapshot.track).not.toBeNull(); // track-run文脈

    const lossSteps: number[] = [];
    let seenTeeth = 0;
    let closedStep = -1;
    for (let i = 0; i < options.maxStep; i++) {
      useGameStore.getState().stepCourseRun(1 / 120);
      const accumulator = useGameStore.getState()._runAccumulator;
      if (accumulator === null) { closedStep = i + 1; break; }
      const toothLossCount = accumulator.destructionState.modes.D06.toothLossCount;
      while (seenTeeth < toothLossCount) { seenTeeth += 1; lossSteps.push(i + 1); }
    }

    const calls = applySpy.mock.calls;
    const outcome = calls.length > 0
      ? (calls[0]![0] as unknown as {
          endReason: string;
          terminalModes?: readonly string[];
          events: readonly { mode: string }[];
          destructionState: { modes: { D06: { toothLossCount: number } } };
        })
      : null;
    const live = useGameStore.getState()._runAccumulator;
    const events = (outcome?.events ?? live?.events ?? []) as readonly { mode: string }[];
    return {
      closedStep,
      endReason: outcome?.endReason ?? null,
      terminalModes: outcome?.terminalModes ?? null,
      finalStatus: useGameStore.getState().vehicleState.status,
      finalPositionM: useGameStore.getState().vehicleState.positionM,
      applyCalls: calls.length,
      d06Events: events.filter((e) => e.mode === 'D06') as unknown as readonly D06Event[],
      lossSteps,
      toothLossCount: outcome?.destructionState.modes.D06.toothLossCount
        ?? live?.destructionState.modes.D06.toothLossCount ?? 0,
      baseGearEfficiency: snapshot.carConfig!.gearEfficiency,
      gearBreakageKind: snapshot.destructionConfig.d06.breakage.kind,
    };
  }

  beforeEach(() => {
    resetSaveStoreWithCashForD06(100_000);
    useGameStore.setState({ _runAccumulator: null, _runRng: null });
  });

  // --- (1) 反復歯欠けevent + (4) 全損destructionTerminal ---------------------
  it('(1)(4) POM装備で歯が反復的に欠け、10本目の全損でdestructionTerminalに至る(実測step1433)', () => {
    const result = runD06Fixture({ maxStep: 2000 });

    expect(result.gearBreakageKind).toBe('breakable'); // POM=初期装備
    // (1) 反復発火: 歯単位で10回のeventが出る
    expect(result.d06Events).toHaveLength(10);
    expect(result.toothLossCount).toBe(10);
    expect(result.lossSteps).toEqual([548, 743, 902, 1033, 1141, 1241, 1323, 1380, 1416]);
    // 最後の1本は終端stepで失われるためlossStepsには現れない(accumulatorがnull化されるため)
    expect(result.closedStep).toBe(1433);

    // isFirstThisSessionは初回のみtrue、以降false(図鑑の初回登録に使われる区別)
    expect(result.d06Events[0]!.isFirstThisSession).toBe(true);
    expect(result.d06Events.slice(1).every((e) => e.isFirstThisSession === false)).toBe(true);
    // isTotalLossは10本目のみtrue
    expect(result.d06Events.slice(0, 9).every((e) => e.isTotalLoss === false)).toBe(true);
    expect(result.d06Events[9]!.isTotalLoss).toBe(true);
    // causeLogの歯数が1,2,…,10と単調に積み上がる
    expect(result.d06Events.map((e) => e.causeLog.toothLossCount)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // 各発火時の負荷トルクは閾値0.005を超えている(絶対値。符号は走行状況で反転しうる)
    for (const event of result.d06Events) {
      expect(Math.abs(event.causeLog.loadTorqueNm)).toBeGreaterThan(0.005);
    }

    // (4) 全損はdestructionTerminal。物理statusはrunningのままであり、
    //     「statusを見るだけの終端判定」では検出できない経路である
    expect(result.endReason).toBe('destructionTerminal');
    expect(result.terminalModes).toEqual(['D06']);
    expect(result.finalStatus).toBe('running');
    expect(result.applyCalls).toBe(1); // exact1回適用
    expect(useGameStore.getState().courseRunPhase).toBe('complete');
  });

  // --- (2) 効率低下 ---------------------------------------------------------
  it('(2) 歯欠けが進むほど次の1本までの間隔が単調に縮む(伝達効率低下の直接の帰結)', () => {
    const result = runD06Fixture({ maxStep: 2000 });
    const steps = [...result.lossSteps, result.closedStep]; // 10本目=終端step
    const intervals = steps.slice(1).map((s, i) => s - steps[i]!);

    expect(intervals).toHaveLength(9);
    // 効率は(1 - toothLossCount/10)で単調に下がる。効率が下がるほど同じ坂を登るのに
    // 必要な負荷トルクが増え、疲労曝露の蓄積が速くなるため、間隔は単調に縮む。
    // 効率低下が反映されていなければ間隔はほぼ一定になり、この単調性は成立しない。
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]!, `間隔が単調減少していません: ${JSON.stringify(intervals)}`)
        .toBeLessThan(intervals[i - 1]!);
    }
    expect(intervals[0]).toBe(195); // 実測: 195,159,131,108,100,82,57,36,17
    expect(intervals[intervals.length - 1]).toBe(17);
  });

  it('(2) 非破断ギヤ(チタン)は同一構成で完走し、破断するPOMは走行不能に終わる', () => {
    const pom = runD06Fixture({ maxStep: 2000 });
    resetSaveStoreWithCashForD06(100_000); // 2本目のrunのため状態を作り直す
    useGameStore.setState({ _runAccumulator: null, _runRng: null });
    const titanium = runD06Fixture({ gearMaterialId: 'gear-titanium', maxStep: 3000 });

    // チタンは**基礎効率がPOMより低い**(0.81 < 0.9)にもかかわらず完走する。
    // すなわち到達距離の差は基礎効率ではなく、歯欠けによる効率低下が原因である。
    expect(titanium.baseGearEfficiency).toBeLessThan(pom.baseGearEfficiency);
    expect(titanium.endReason).toBe('finished');
    expect(titanium.finalPositionM).toBeGreaterThanOrEqual(10);
    expect(pom.endReason).toBe('destructionTerminal');
    expect(pom.finalPositionM).toBeLessThan(5); // 実測4.246 m、坂の途中で空転
  });

  // --- (3) 決定論(ripple含む) -----------------------------------------------
  it('(3) 同一seedのsnapshotから2回走らせると歯欠けstep・event・終端が完全一致する', () => {
    // startCourseRunのseedはcrypto由来で毎回異なるため、同一snapshotの再走行を
    // 検証できるようseed源を固定する(ripple項はmeshPhase由来で決定論的だが、
    // 「同一snapshotで完全一致」を主張するには入力を揃える必要がある)。
    const fixedSeed = 0x5eed1234;
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((array: Uint32Array) => {
      array[0] = fixedSeed;
      return array;
    }) as typeof globalThis.crypto.getRandomValues);

    const first = runD06Fixture({ maxStep: 2000 });
    resetSaveStoreWithCashForD06(100_000);
    useGameStore.setState({ _runAccumulator: null, _runRng: null });
    const second = runD06Fixture({ maxStep: 2000 });

    expect(second.closedStep).toBe(first.closedStep);
    expect(second.lossSteps).toEqual(first.lossSteps);
    expect(second.endReason).toBe(first.endReason);
    expect(second.terminalModes).toEqual(first.terminalModes);
    expect(second.finalPositionM).toBe(first.finalPositionM); // 完全一致(丸め許容なし)
    expect(second.d06Events.map((e) => e.causeLog.loadTorqueNm))
      .toEqual(first.d06Events.map((e) => e.causeLog.loadTorqueNm));
    expect(second.d06Events.map((e) => e.causeLog.toothLossCount))
      .toEqual(first.d06Events.map((e) => e.causeLog.toothLossCount));
  });

  // --- (5) チタン非発火 -----------------------------------------------------
  it('(5) チタンはnonBreakable構造腕により、同一の高トルク構成でも歯が1本も欠けない', () => {
    const result = runD06Fixture({ gearMaterialId: 'gear-titanium', maxStep: 3000 });

    // 数値閾値ではなく型の構造腕で非発火が保証されている(spec §7.1「チタンは発火しない」)
    expect(result.gearBreakageKind).toBe('nonBreakable');
    expect(result.d06Events).toHaveLength(0);
    expect(result.toothLossCount).toBe(0);
    expect(result.lossSteps).toEqual([]);
    expect(result.terminalModes ?? []).not.toContain('D06');
    // 非空虚性: POMなら10本欠ける同一構成である(トルクは確かに閾値を超えている)
    expect(result.endReason).toBe('finished');
    // G4のD09 runtime効果(bearingHeatGaugeRatio由来のaxleFriction増加)により2675→2685へ
    // 再基準化(人間承認済みD09較正値の反映後に実測、2026-08-19)。チタンは
    // metalGearContactAlways=trueのため熱ゲージが上がり軸摩擦がわずかに増えて完走が10step遅れる。
    // D06の意味assert(nonBreakable・event 0件・toothLossCount 0・finished)はいずれも不変。
    expect(result.closedStep).toBe(2685);
  });

  // --- 素材差の負例(閾値の順序が実際に効いていること) ----------------------
  it('負例: PEEK(閾値0.00790)はPOM(0.00500)より歯欠けが遅く、全損に至らない', () => {
    const peek = runD06Fixture({ gearMaterialId: 'gear-peek', maxStep: 3000 });

    expect(peek.gearBreakageKind).toBe('breakable');
    // 閾値が高いぶん1本目が遅く、本数も少ない(POMは548で1本目・計10本)
    expect(peek.lossSteps[0]).toBe(866);
    expect(peek.lossSteps[0]!).toBeGreaterThan(548);
    expect(peek.d06Events).toHaveLength(5);
    expect(peek.toothLossCount).toBe(5);
    // 全損に達しないため破壊終端ではなく物理終端(失速)で終わる
    expect(peek.endReason).toBe('stalled');
    expect(peek.terminalModes ?? []).not.toContain('D06');
    expect(peek.d06Events.every((e) => e.isTotalLoss === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P3-4 G4: D09(軸受焼付き)のproduction配線 最小統合fixture
// Suu_mot3のG4最小fixture確定+POM差替え(2026-08-19T09:26:23Z、計画§17.1/§17.2・§22照合済み)。
// 要件はD09 track-run正例・production-valid有限到達・exactly-onceであり、
// NORMAL_OPERATION非発火・広範sweepはalice側の較正証跡で固定済みのため重複追加しない。
//
// **発火経路**: spec §7.1「無潤滑相当=金属ギヤ接触**または**高負荷軸受×高速継続」のうち、
// **樹脂ギヤ(POM)での高負荷×高速のAND経路単独**での発火。`metalGearContactActive`はfalseで
// あり、金属接触の寄与なしにゲージが上限へ達することを示す。
//
// 較正値(G4人間承認済み): `loadTorqueThresholdNm` 0.005 N·m / `rpmThreshold` 400 rpm(車軸側)/
// `bearingSeizureGaugeLimit` 0.15。`gearSeizureDeltaFraction` 0.15・`bearingSeizureDeltaFraction` 0.2。
// ---------------------------------------------------------------------------
describe('G4: D09(軸受焼付き)のproduction入口統合検証', () => {
  function resetSaveStoreWithCashForD09(cashG: number): void {
    fakeStorage = makeFakeLocalStorage();
    // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
    globalThis.localStorage = fakeStorage;
    const fresh = __testOnly.freshBootstrap();
    const seeded = { ...fresh, inventory: { ...fresh.inventory, cashG } };
    __testOnly.writeV16(seeded);
    useSaveStore.setState({
      ...seeded,
      currentRunSequence: null,
      leaseState: 'leaseNotAcquired',
      pendingRunEquipmentSnapshot: null,
      pendingRunSaveId: null,
      bootstrapError: null,
    });
    useSaveStore.getState()._evaluateLeaseOnce(new Date(0).toISOString());
  }

  /** 本番のpurchase/equip経路のみで装備する(inventoryへの直接注入はしない)。 */
  function buyAndEquipForD09(materialId: string, family: 'battery' | 'magnet' | 'brush'): void {
    const purchased = useSaveStore.getState().purchaseMaterialAction(materialId as never);
    expect(purchased.ok, `${materialId}の購入に失敗しました`).toBe(true);
    const item = useSaveStore.getState().inventory.items
      .filter((i) => i.family === family && i.materialId === materialId).at(-1);
    expect(item, `${materialId}がinventoryに見つかりません`).toBeDefined();
    const next = { ...useSaveStore.getState().equipmentLoadout, [`${family}ItemId`]: item!.itemId };
    expect(useSaveStore.getState().setEquipmentLoadout(next).ok, `${materialId}の装備に失敗しました`).toBe(true);
  }

  beforeEach(() => {
    resetSaveStoreWithCashForD09(100_000);
    useGameStore.setState({ _runAccumulator: null, _runRng: null });
  });

  it('樹脂ギヤ(POM)でも高負荷×高速のAND経路単独でD09が発火し、destructionTerminalで終わる(実測step333)', () => {
    // ギヤは初期装備のgear-pom(購入しない)。導線もcopper-standard(初期)のまま。
    buyAndEquipForD09('magnet-neodymium', 'magnet');
    buyAndEquipForD09('battery-lithium-polymer', 'battery');
    buyAndEquipForD09('brush-precious-metal', 'brush');
    useGameStore.getState().setGarageSelection({
      chassisId: 'standard', gearId: 'fast', wheelId: 'large', tireId: 'standard',
    } as never);
    useGameStore.getState().selectTrack('hill-climb');
    const config = {
      ...useGameStore.getState().config,
      coilTurns: 15, magnetDistanceMm: 2, brushPressure: 0.2, sandingQuality: 0.9,
    };
    expect(useSaveStore.getState().updateProgress({ config: config as never })).toBe(true);
    useGameStore.setState({ config: config as never });

    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    useGameStore.getState().startCourseRun();
    const started = useGameStore.getState()._runAccumulator;
    expect(started, 'startCourseRunでrunが開始されていません').not.toBeNull();
    const snapshot = started!.replaySnapshot;
    // 入口直後のsnapshot実効値: 樹脂ギヤ(金属接触なし)で承認済み較正値が載っていること
    expect(snapshot.track).not.toBeNull();
    expect(snapshot.destructionConfig.d09.metalGearContactAlways).toBe(false); // POM=樹脂
    expect(snapshot.destructionConfig.d09.bearingSeizureGaugeLimit).toBe(0.15);
    expect(snapshot.destructionConfig.d09.highLoadHighSpeed).toEqual({ loadTorqueThresholdNm: 0.005, rpmThreshold: 400 });
    expect(snapshot.destructionConfig.d09.gearSeizureDeltaFraction).toBe(0.15);
    expect(snapshot.destructionConfig.d09.bearingSeizureDeltaFraction).toBe(0.2);

    // 終端stepを取りこぼさないよう、_runAccumulatorのnull化を毎step監視する
    let closedStep = -1;
    for (let i = 0; i < 2000; i++) {
      useGameStore.getState().stepCourseRun(1 / 120);
      if (useGameStore.getState()._runAccumulator === null) { closedStep = i + 1; break; }
    }

    expect(closedStep).toBe(333);
    expect(applySpy).toHaveBeenCalledTimes(1); // exactly-once
    // accumulatorはnull化済みのため、捕捉したRunOutcomeを唯一の検査対象にする
    const outcome = applySpy.mock.calls[0]![0];

    expect(outcome.endReason).toBe('destructionTerminal');
    if (outcome.endReason === 'destructionTerminal') expect(outcome.terminalModes).toEqual(['D09']);
    expect(useGameStore.getState().vehicleState.status).toBe('running'); // 物理終端ではない
    expect(useGameStore.getState().courseRunPhase).toBe('complete');

    // D09 eventはexact1件(D07は別モードとして併発するため、D09だけを数える)
    expect(outcome.events.filter((e) => e.mode === 'D09')).toHaveLength(1);

    const d09 = outcome.destructionState.modes.D09;
    expect(d09.triggered).toBe(true);
    expect(d09.causeLog).not.toBeNull();
    // AND経路単独での発火——金属接触の寄与なしにゲージが上限へ達している
    expect(d09.causeLog!.metalGearContactActive).toBe(false);
    expect(d09.causeLog!.highLoadHighSpeedActive).toBe(true);
    expect(d09.causeLog!.bearingHeatGaugeRatio).toBeCloseTo(0.15030281668535994, 12);
    expect(d09.causeLog!.temperature).toEqual({
      kind: 'uncalibratedGauge',
      ratio: d09.causeLog!.bearingHeatGaugeRatio,
    });

    // 劣化差分: D09はgear seizureとbearing seizureの両方を発行する(計画§7.7、候補A)
    expect(outcome.degradationDiffs).toContainEqual({ role: 'gear', kind: 'seizure', deltaFraction: 0.15 });
    expect(outcome.degradationDiffs).toContainEqual({ role: 'bearing', kind: 'seizure', deltaFraction: 0.2 });
  });
});

// ---------------------------------------------------------------------------
// P3-4 G6-A: notebook recordのkind・samples出典がRunSnapshot単一出典で決まること
// arbiter追加裁定A(2026-08-19、承認済み契約内の欠陥是正のため即解禁)。
//
// 旧実装は`applyPhase3RunOutcome`が`context: 'motor' | 'vehicle'`の2値しか持たず、
// **track-runをtest-run扱い**(`kind:'vehicleTestRun'`+`testRunHistory`出典)で記録して
// いた——`kind`・samples出典の両方が承認済み契約(PendingNotebookRecord 3腕〈P3-0-Q3〉、
// §16.5 builderのcourseRun腕)に対して誤っていた。
//
// 是正後は判別の出典を`replaySnapshot`のみとし(`resolveRunKindFromSnapshot`)、
// 呼出し側がkindを渡せる第二経路を設けていない(P3-1-Q9の単一出典)。
// 必須assert(a)(b)(c)(f)をここで固定する((d)(e)(g)はG6-R2承認後)。
// ---------------------------------------------------------------------------
describe('G6-A: notebook recordのkindとsamples出典', () => {
  /** performApplyRunOutcomeへ渡されたPendingNotebookRecordを捕捉する。 */
  function captureNotebookRecord() {
    return vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
  }

  beforeEach(() => {
    useGameStore.setState({ _runAccumulator: null, _runRng: null, recipeSeed: 1 });
  });

  it("(a) track-runは kind:'courseRun' で記録され、samplesはcourseRunHistory由来になる", () => {
    const applySpy = captureNotebookRecord();
    useGameStore.getState().selectTrack('straight-10m');
    useGameStore.getState().startCourseRun();
    for (let i = 0; i < 600; i++) {
      useGameStore.getState().stepCourseRun(1 / 120);
      if (useGameStore.getState()._runAccumulator === null) break;
    }

    expect(applySpy).toHaveBeenCalledTimes(1); // (f) 1走行につき記録はちょうど1件
    const record = applySpy.mock.calls[0]![1] as unknown as { kind: string; record: Record<string, unknown> };
    expect(record.kind).toBe('courseRun');
    // trackIdはsnapshot由来(live selectedTrackIdではない)
    expect(record.record.trackId).toBe('straight-10m');
    // samples出典: courseRunHistoryと同一参照であること(testRunHistoryではない)
    expect(record.record.samples).toBe(useGameStore.getState().courseRunHistory);
    expect(record.record.samples).not.toBe(useGameStore.getState().testRunHistory);
    // §16.5 builder経由で2フィールドが載る
    expect(record.record.finalDestructionState).toBeDefined();
    expect(typeof record.record.recipeKey).toBe('string');
  });

  it("(b) 回帰: test-runは kind:'vehicleTestRun' のままで、samplesはtestRunHistory由来", () => {
    const applySpy = captureNotebookRecord();
    useGameStore.getState().startTestRun();
    for (let i = 0; i < 600; i++) {
      useGameStore.getState().stepTestRun(1 / 120);
      if (useGameStore.getState()._runAccumulator === null) break;
    }

    expect(applySpy).toHaveBeenCalledTimes(1); // (f)
    const record = applySpy.mock.calls[0]![1] as unknown as { kind: string; record: Record<string, unknown> };
    expect(record.kind).toBe('vehicleTestRun');
    expect(record.record.samples).toBe(useGameStore.getState().testRunHistory);
    expect(record.record).not.toHaveProperty('trackId'); // test-runはtrackを持たない
  });

  it("(c) 回帰: motor-onlyは kind:'session' のまま", () => {
    const next = { ...useGameStore.getState().config, slitWidthMm: 0 }; // D03で確実に終端させる
    expect(useSaveStore.getState().updateProgress({ config: next as never })).toBe(true);
    useGameStore.setState({ config: next as never });
    const applySpy = captureNotebookRecord();
    useGameStore.getState().flickStart();
    for (let i = 0; i < 600; i++) {
      useGameStore.getState().stepSim(1 / 120);
      if (useGameStore.getState()._runAccumulator === null) break;
    }

    expect(applySpy).toHaveBeenCalledTimes(1); // (f)
    expect((applySpy.mock.calls[0]![1] as { kind: string }).kind).toBe('session');
  });

  it('判別の第二経路が存在しない: 同一走行文脈なら常に同じkindになる', () => {
    // 呼出し側がkindを渡せる第二経路があると、同じsnapshotから別のkindが出うる。
    // ここでは同一構成のtrack-runを2回走らせ、kindが常にcourseRunであることを固定する
    // (P3-1-Q9の単一出典。判別はresolveRunKindFromSnapshotのみが行う)。
    const kinds: string[] = [];
    for (let run = 0; run < 2; run++) {
      const applySpy = captureNotebookRecord();
      useGameStore.getState().selectTrack('straight-10m');
      useGameStore.getState().startCourseRun();
      for (let i = 0; i < 600; i++) {
        useGameStore.getState().stepCourseRun(1 / 120);
        if (useGameStore.getState()._runAccumulator === null) break;
      }
      kinds.push((applySpy.mock.calls[0]![1] as { kind: string }).kind);
      vi.restoreAllMocks();
    }
    expect(kinds).toEqual(['courseRun', 'courseRun']);
  });
});

// ---------------------------------------------------------------------------
// P3-4 G6-R2(人間承認2026-08-19): CourseMode手動保存のgate条件付き無効化
// 必須assert(d)(e)。本リポジトリにReactレンダリング環境がない(既存UIテストも
// `saveGateMode.test.ts`のように「Reactレンダリングなしで固定する」方針)ため、
// ボタン自体のdisabled配線は`legacyCourseRunWriteAudit.test.ts`の構造テストで固定し、
// ここでは**書込みが実際に起きる/起きない**という挙動側を固定する。
// ---------------------------------------------------------------------------
describe('G6-R2: 手動保存の二重記録防止(挙動側)', () => {
  beforeEach(() => {
    useGameStore.setState({ _runAccumulator: null, _runRng: null, recipeSeed: 1 });
  });

  it('(d) production経路のtrack-run走行では、legacy直接書込み(addCourseRunRecord)が一度も起きない', () => {
    const legacyWriteSpy = vi.spyOn(useSaveStore.getState(), 'addCourseRunRecord');
    const applySpy = vi.spyOn(useSaveStore.getState(), 'performApplyRunOutcome');
    useGameStore.getState().selectTrack('straight-10m');
    useGameStore.getState().startCourseRun();
    for (let i = 0; i < 600; i++) {
      useGameStore.getState().stepCourseRun(1 / 120);
      if (useGameStore.getState()._runAccumulator === null) break;
    }

    // Phase 3の原子経路が1件だけ記録し、legacy経路は一切走らない(=二重記録なし)
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(legacyWriteSpy).not.toHaveBeenCalled();
  });

  it('(e) legacy直接書込みactionはretro CourseMode置換まで存続する(既存契約の回帰)', () => {
    useGameStore.setState({});
    const before = useSaveStore.getState().notebook.courseRuns.length;

    const result = useSaveStore.getState().addCourseRunRecord({
      id: 'legacy-course-1',
      savedAt: new Date(0).toISOString(),
      trackId: 'straight-10m',
      motorConfig: useGameStore.getState().config,
      carConfig: useGameStore.getState().carConfig,
      seed: 1,
      status: 'finished',
      elapsedTimeS: 1,
      positionM: 10,
      energyUsedJ: 1,
      energyBreakdown: { driveJ: 1, gearLossJ: 0, slipLossJ: 0, brushLossJ: 0, heatJ: 0 },
      samples: [],
    });

    expect(result.ok).toBe(true);
    const courseRuns = useSaveStore.getState().notebook.courseRuns;
    expect(courseRuns).toHaveLength(before + 1);
    const written = courseRuns.at(-1)!;
    expect(written.id).toBe('legacy-course-1');
    // legacy形状: 2フィールドを持たないまま永続化される(§16.2の読取りunionが受理する)
    expect('finalDestructionState' in written).toBe(false);
    expect('recipeKey' in written).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P3-4 G6: §14.2の4段(Wear反映)・7段(D06 seeding)配線
// 装備個体の永続WearStateがRunSnapshotの実効configとinitialDestructionStateへ
// 1回だけ反映されることを固定する。走行中の再評価は行わない。
// ---------------------------------------------------------------------------
describe('G6: WearState反映(4段)とD06 seeding(7段)', () => {
  /** 装備中の個体へ永続的な劣化を仕込んだ状態でsaveStoreを初期化する(test専用bootstrap)。 */
  function resetSaveStoreWithWear(wear: {
    magnetDemagnetizationFraction?: number;
    gearSeizureFraction?: number;
    gearToothLossCount?: number;
    brushWearFraction?: number;
    bearingSeizureFraction?: number;
  }): void {
    fakeStorage = makeFakeLocalStorage();
    // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
    globalThis.localStorage = fakeStorage;
    const fresh = __testOnly.freshBootstrap();
    const items = fresh.inventory.items.map((item) => {
      if (item.family === 'magnet' && wear.magnetDemagnetizationFraction !== undefined) {
        return { ...item, wearState: { ...item.wearState, demagnetizationFraction: wear.magnetDemagnetizationFraction } };
      }
      if (item.family === 'gear') {
        return {
          ...item,
          wearState: {
            ...item.wearState,
            seizureFraction: wear.gearSeizureFraction ?? (item.wearState as { seizureFraction: number }).seizureFraction,
            toothLossCount: wear.gearToothLossCount ?? (item.wearState as { toothLossCount: number }).toothLossCount,
          },
        };
      }
      if (item.family === 'brush' && wear.brushWearFraction !== undefined) {
        return { ...item, wearState: { ...item.wearState, wearFraction: wear.brushWearFraction } };
      }
      return item;
    });
    const bearingAssemblies = fresh.inventory.bearingAssemblies.map((assembly) => (
      wear.bearingSeizureFraction === undefined ? assembly : { ...assembly, seizureFraction: wear.bearingSeizureFraction }
    ));
    const seeded = { ...fresh, inventory: { ...fresh.inventory, items, bearingAssemblies } } as typeof fresh;
    __testOnly.writeV16(seeded);
    useSaveStore.setState({
      ...seeded,
      currentRunSequence: null,
      leaseState: 'leaseNotAcquired',
      pendingRunEquipmentSnapshot: null,
      pendingRunSaveId: null,
      bootstrapError: null,
    });
    useSaveStore.getState()._evaluateLeaseOnce(new Date(0).toISOString());
  }

  /** track-runを開始してRunSnapshotだけ取り出す(走らせない)。 */
  function captureSnapshotForWear() {
    useGameStore.getState().selectTrack('straight-10m');
    useGameStore.getState().startCourseRun();
    const accumulator = useGameStore.getState()._runAccumulator;
    expect(accumulator, 'startCourseRunでrunが開始されていません').not.toBeNull();
    return accumulator!.replaySnapshot;
  }

  beforeEach(() => {
    useGameStore.setState({ _runAccumulator: null, _runRng: null });
  });

  it('4段: 磁石の減磁とブラシ摩耗が実効MotorConfigへ反映される', () => {
    resetSaveStoreWithWear({});
    const clean = captureSnapshotForWear();
    const baseMagnetStrength = clean.motorConfig.magnetStrength;
    const baseBrushRatio = clean.motorConfig.brushContactResistanceRatio ?? 1;
    useGameStore.getState().abortCourseRun();

    resetSaveStoreWithWear({ magnetDemagnetizationFraction: 0.25, brushWearFraction: 0.4 });
    useGameStore.setState({ _runAccumulator: null, _runRng: null });
    const worn = captureSnapshotForWear();

    // magnetStrength = base × (1 - 減磁率)
    expect(worn.motorConfig.magnetStrength).toBeCloseTo(baseMagnetStrength * (1 - 0.25), 12);
    // brushContactResistanceRatio = base × (1 + 摩耗率 × BRUSH_WEAR_RESISTANCE_PENALTY)
    expect(worn.motorConfig.brushContactResistanceRatio)
      .toBeCloseTo(baseBrushRatio * (1 + 0.4 * BRUSH_WEAR_RESISTANCE_PENALTY), 12);
  });

  it('4段: ギヤ焼付きと軸受焼付きが実効CarConfigへ反映される', () => {
    resetSaveStoreWithWear({});
    const clean = captureSnapshotForWear();
    const baseGearEfficiency = clean.carConfig!.gearEfficiency;
    const baseAxleFriction = clean.carConfig!.axleFriction;
    useGameStore.getState().abortCourseRun();

    resetSaveStoreWithWear({ gearSeizureFraction: 0.5, bearingSeizureFraction: 0.6 });
    useGameStore.setState({ _runAccumulator: null, _runRng: null });
    const worn = captureSnapshotForWear();

    expect(worn.carConfig!.gearEfficiency)
      .toBeCloseTo(baseGearEfficiency * (1 - 0.5 * GEAR_SEIZURE_EFFICIENCY_PENALTY), 12);
    expect(worn.carConfig!.axleFriction)
      .toBeCloseTo(1 - (1 - baseAxleFriction) * (1 - 0.6 * BEARING_SEIZURE_FRICTION_PENALTY), 12);
  });

  it('7段: 装備ギヤ個体の歯欠け数がinitialDestructionStateへseedされる', () => {
    resetSaveStoreWithWear({ gearToothLossCount: 4 });
    const snapshot = captureSnapshotForWear();

    // 走行内D06は0からではなく永続損傷数から始まる(M-1(i))。
    // ここで固定するのは**RunSnapshotへのseeding**(§14.2の7段、brabit配線の責務)。
    expect(snapshot.initialDestructionState.modes.D06.toothLossCount).toBe(4);

    // liveのaccumulatorにもseedが載る(engine側`createRunAccumulator`が
    // `replaySnapshot.initialDestructionState`のD06 toothLossCountを起点に取る、2026-08-19是正)。
    // これがないと、snapshotにはseedingが載っているのにliveでは0から始まり、
    // 「走行のたびに歯数が回復する」というM-1(i)が防ごうとした会計破綻が残る。
    expect(useGameStore.getState()._runAccumulator!.destructionState.modes.D06.toothLossCount).toBe(4);
  });

  it('7段: 歯欠けのない個体ではseedingが0のまま(回帰)', () => {
    resetSaveStoreWithWear({});
    const snapshot = captureSnapshotForWear();
    expect(snapshot.initialDestructionState.modes.D06.toothLossCount).toBe(0);
  });

  it('3段はWear反映の前: recipeKeyは個体の劣化状態に依存しない', () => {
    resetSaveStoreWithWear({});
    const clean = captureSnapshotForWear();
    useGameStore.getState().abortCourseRun();

    resetSaveStoreWithWear({ magnetDemagnetizationFraction: 0.25, gearSeizureFraction: 0.5, brushWearFraction: 0.4, bearingSeizureFraction: 0.6, gearToothLossCount: 4 });
    useGameStore.setState({ _runAccumulator: null, _runRng: null });
    const worn = captureSnapshotForWear();

    // レシピ同一性は素材選択とbase configで決まる(§14.2の3はWear反映前に実行される)
    expect(worn.recipeKey).toBe(clean.recipeKey);
    // 非空虚性: 実効configは実際に変わっている
    expect(worn.motorConfig.magnetStrength).not.toBe(clean.motorConfig.magnetStrength);
  });
});

// ---------------------------------------------------------------------------
// P3-4 G6(§15.2): 破壊済み個体の装備拒否理由がstore境界を越えて伝わること
// `missingRole`(実在しない)と`destroyedRole`(実在するが破壊済み)は失敗の意味が異なり、
// UI側の提示も変わる(前者は装備の選び直し、後者は個体の入れ替え)。
// 旧`setEquipmentLoadout`の宣言型は`missingRole?`のみだったため、
// `validateEquipmentLoadout`が返す`destroyedRole`腕が呼出し側の型から落ちていた。
// ---------------------------------------------------------------------------
describe('G6(§15.2): destroyedRoleの伝播', () => {
  /** 装備中の個体を破壊済みにした状態でsaveStoreを初期化する(test専用bootstrap)。 */
  function resetSaveStoreWithDestroyed(kind: 'collapsed' | 'burnedOut' | 'gearTotalLoss'): void {
    fakeStorage = makeFakeLocalStorage();
    // @ts-expect-error テスト用にglobalThis.localStorageを差し替える
    globalThis.localStorage = fakeStorage;
    const fresh = __testOnly.freshBootstrap();
    const rotorAssemblies = fresh.inventory.rotorAssemblies.map((rotor) => (
      kind === 'collapsed' ? { ...rotor, collapsed: true }
        : kind === 'burnedOut' ? { ...rotor, burnedOut: true }
          : rotor
    ));
    const items = fresh.inventory.items.map((item) => (
      kind === 'gearTotalLoss' && item.family === 'gear'
        ? { ...item, wearState: { ...item.wearState, toothLossCount: GEAR_TOTAL_TOOTH_COUNT } }
        : item
    ));
    const seeded = { ...fresh, inventory: { ...fresh.inventory, rotorAssemblies, items } } as typeof fresh;
    __testOnly.writeV16(seeded);
    useSaveStore.setState({
      ...seeded,
      currentRunSequence: null,
      leaseState: 'leaseNotAcquired',
      pendingRunEquipmentSnapshot: null,
      pendingRunSaveId: null,
      bootstrapError: null,
    });
    useSaveStore.getState()._evaluateLeaseOnce(new Date(0).toISOString());
  }

  it.each([
    ['collapsed', 'rotor', '崩壊済み'],
    ['burnedOut', 'rotor', '焼損済み'],
    ['gearTotalLoss', 'gear', '全損済み'],
  ] as const)('%s の個体は装備できず、destroyedRoleと日本語の理由が呼出し側へ届く', (kind, role, phrase) => {
    resetSaveStoreWithDestroyed(kind);

    const result = useSaveStore.getState().setEquipmentLoadout(useSaveStore.getState().equipmentLoadout);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    // 失敗腕が潰れずに届く(missingRoleではなくdestroyedRole)
    expect('destroyedRole' in result).toBe(true);
    expect('missingRole' in result).toBe(false);
    if (!('destroyedRole' in result)) throw new Error('unreachable');
    expect(result.destroyedRole).toBe(role);
    // reasonは日本語文言として構築済みで、UI側はそのまま表示できる
    expect(result.reason).toContain(phrase);
  });

  it('負例: 破壊されていない個体は従来どおり装備できる(拒否が過剰でない)', () => {
    fakeStorage = makeFakeLocalStorage();
    // @ts-expect-error テスト用
    globalThis.localStorage = fakeStorage;
    const fresh = __testOnly.freshBootstrap();
    __testOnly.writeV16(fresh);
    useSaveStore.setState({
      ...fresh, currentRunSequence: null, leaseState: 'leaseNotAcquired',
      pendingRunEquipmentSnapshot: null, pendingRunSaveId: null, bootstrapError: null,
    });
    useSaveStore.getState()._evaluateLeaseOnce(new Date(0).toISOString());

    const result = useSaveStore.getState().setEquipmentLoadout(useSaveStore.getState().equipmentLoadout);

    expect(result.ok).toBe(true);
  });
});
