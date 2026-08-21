// P3-0サブステップ2(docs/phase3-p3-0-plan.md v7 8.1節)+P3-1サブステップ4(docs/phase3-p3-1-plan.md
// v11 §1.2・§7)。runOutcomeApplication.tsの純粋ロジックをテストする。lease stale判定
// (isLeaseHeartbeatStale)自体はpure関数として本ファイルでテストするが、heartbeat間隔5秒の
// タイマー管理・performApplyRunOutcomeの単一set()・codexRecords配列管理はsaveStore.ts
// (サブステップ3、brabit_mot3実装)側の責務のため、本ファイルでは扱わない。
// P3-1サブステップ4は、stepMotorWithDestructionが実際に生成したRunOutcomeをapplyRunOutcomeへ
// 流し込む統合テストのみを追加する(1.2節)。applyRunOutcome自体のaction契約(P3-0で検証済み)は
// 再検証しない。saveStore.ts・gameStore.tsはいずれも無改修(P3-0-Q2裁定、production配線はP3-4)。
import { describe, expect, it } from 'vitest';
// S-4構造監査(arbiter補足裁定HB-DEC-011ケースA)専用。既存src/engine/__tests__/
// destructionModesImportStructure.test.tsと同型のソーステキスト走査パターン。
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import {
  abandonPendingApplication,
  applyRunOutcome,
  beginRun,
  buildCourseRunNotebookRecord,
  buildExperimentSession,
  buildVehicleTestRunNotebookRecord,
  captureEquipmentIdSnapshot,
  createInitialPlayerInventoryAndLoadout,
  deriveFireExposureProfileFromLoadout,
  deriveMaterialSelectionFromEquipment,
  resolveProductionMaterialCompositionBaseline,
  isLeaseHeartbeatStale,
  LEASE_STALE_THRESHOLD_MS,
  PROVISIONAL_DISCOVERY_REWARD_G,
  resolveBearingForGear,
  retryPendingApplication,
  rebindLeaseForPendingApplication,
  touchLeaseHeartbeat,
  validateEquipmentIdSnapshot,
  validateEquipmentLoadout,
  type DeriveMaterialSelectionResult,
  type EquipmentIdSnapshot,
  type EquipmentLoadout,
  type RunApplicationEnvelope,
  type SaveEnvelopeMeta,
} from '../runOutcomeApplication';
import { DEFAULT_GARAGE_SELECTION, GEAR_PRESETS, resolveGarageBuild, type GarageSelection } from '../../data/partPresets';
import type { PlayerInventory, BodyPartState, RotorAssemblyState } from '../../materials/inventoryItem';
import { GEAR_TOTAL_TOOTH_COUNT } from '../../materials/inventoryItem';
import { INITIAL_CASH_G } from '../shopEconomy';
import {
  captureRunSnapshot,
  createRunAccumulator,
  finalizeRun,
  restoreRunSnapshot,
  stepMotorWithDestruction,
  stepTestRunWithDestruction,
  type CaptureRunSnapshotInput,
  type DestructionConfig,
  type RunAccumulator,
} from '../../engine/destructionOrchestration';
import type { DestructionRunContext, FireExposureProfile, RunOutcome, RunSnapshot } from '../../engine/destructionOrchestration';
import type { DestructionModeId } from '../../engine/destructionModes';
import { validateNotebookFinalFields } from '../notebookValidation';
import type { LegacyExperimentSession, LegacyCourseRunNotebookRecord } from '../notebookStore';
import type { LegacyVehicleTestRunNotebookRecord } from '../runOutcomeApplication';
import { createInitialDestructionState, validateFireExposureProfile } from '../../engine/destructionModes';
import type { MotorConfig, SimState } from '../../engine/motorPhysics';
import { COIL_DEFORM_FRAMES, COIL_DEFORM_OMEGA } from '../../engine/constants';
import type { CarConfig, VehicleSimState } from '../../engine/vehiclePhysics';
import { createInitialVehicleState } from '../../engine/vehiclePhysics';
import type { TrackDefinition } from '../../engine/trackPhysics';
// Suu_mot3ゲート6レビューP62是正: D02 test-run/track-runのproduction-valid性は「一部だけ
// batteryInternalResistanceRatioを足す」のでは不十分(§13.2(3))であり、composeConfigFromMaterials
// (正式素材写像パイプライン)を一度通した結果からplayer-adjustable値のみを変更すること、との
// 指示を受け導入。materialMapping.test.tsのpvMotorCarと同型のfail-closed許可リスト方式。
import {
  composeConfigFromMaterials, mapD07DestructionConfig, mapD05BrushWearConfig, assembleD05Config,
  type MaterialSelection, type MaterialCompositionBaseline,
} from '../../materials/materialMapping';

function baseInventory(): PlayerInventory {
  return createInitialPlayerInventoryAndLoadout().inventory;
}

function baseLoadout(): EquipmentLoadout {
  return createInitialPlayerInventoryAndLoadout().loadout;
}

function motorRunContext(): DestructionRunContext {
  return { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null };
}

function vehicleRunContext(): DestructionRunContext {
  return { context: 'vehicle', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: GEAR_TOTAL_TOOTH_COUNT };
}

function goodSaveMeta(overrides: Partial<SaveEnvelopeMeta> = {}): SaveEnvelopeMeta {
  // nextRunSequence=2: baseEnvelope()の既定runSequence=1が「発行済み・未適用」の範囲(1<2)へ
  // 収まるようにする(runSequence>=nextRunSequenceはinvalidRunSequenceになるため)。
  return { saveId: 'save-1', lastAppliedRunSequence: 0, nextRunSequence: 2, leaseToken: 'lease-a', leaseHeartbeatAt: '2026-08-02T00:00:00.000Z', pendingApplication: null, ...overrides };
}

function nonDestructionOutcome(events: RunOutcome['events'], degradationDiffs: RunOutcome['degradationDiffs'] = []): RunOutcome {
  return {
    endReason: 'manualAbort',
    events,
    destructionState: {} as RunOutcome['destructionState'],
    degradationDiffs,
    replaySnapshot: {} as RunOutcome['replaySnapshot'],
  };
}

function d01Event() {
  return {
    mode: 'D01' as const,
    causeLog: { currentA: 1, rpm: 1, atT: 1, temperature: { kind: 'unavailable' as const } },
    isFirstThisSession: true as const,
    physicsSnapshotAtT: { context: 'motor' as const, state: {} as never },
  };
}

function d09Event() {
  return {
    mode: 'D09' as const,
    causeLog: {
      currentA: 1,
      rpm: 1,
      atT: 1,
      temperature: { kind: 'uncalibratedGauge' as const, ratio: 1 },
      bearingHeatGaugeRatio: 1,
      metalGearContactActive: false,
      highLoadHighSpeedActive: true,
    },
    isFirstThisSession: true as const,
    gearSeizureDeltaFraction: 0.15,
    bearingSeizureDeltaFraction: 0.2,
    physicsSnapshotAtT: { context: 'vehicle' as const, state: {} as never },
  };
}

function baseEnvelope(overrides: Partial<RunApplicationEnvelope> = {}): RunApplicationEnvelope {
  const { loadout } = createInitialPlayerInventoryAndLoadout();
  const snapshot = captureEquipmentIdSnapshot(loadout as EquipmentLoadout & { batteryItemId: string }, 'vehicle');
  return {
    runKey: { saveId: 'save-1', runSequence: 1 },
    leaseToken: 'lease-a',
    outcome: nonDestructionOutcome([]),
    equipmentSnapshot: snapshot,
    notebookRecord: { kind: 'session', record: {} as never },
    ...overrides,
  };
}

describe('runOutcomeApplication.ts: notebook record 3専用builder(P3-4 G6 §16.5)', () => {
  const FINAL_STATE = createInitialDestructionState('lipo');

  function outcomeWith(recipeKey: string): RunOutcome {
    return {
      destructionState: FINAL_STATE,
      replaySnapshot: { recipeKey } as unknown as RunSnapshot,
    } as unknown as RunOutcome;
  }

  const baseSession: LegacyExperimentSession = {
    id: 's1', startedAt: 'a', endedAt: 'b', config: {} as never, seed: 1, steadyRpm: 0,
    averageCurrent: 0, maxCurrent: 0, currentRatio: 0, rpmVariation: 0, maxBatteryHeat: 0,
    events: [], samples: [],
  };
  const baseCourseRun: LegacyCourseRunNotebookRecord = {
    id: 'c1', savedAt: 'a', trackId: 't', motorConfig: {} as never, carConfig: {} as never,
    seed: 1, status: 'finished', elapsedTimeS: 0, positionM: 0, energyUsedJ: 0,
    energyBreakdown: {} as never, samples: [],
  };
  const baseTestRun: LegacyVehicleTestRunNotebookRecord = {
    id: 'v1', savedAt: 'a', motorConfig: {} as never, carConfig: {} as never, seed: 1,
    status: 'finished', elapsedTimeS: 0, positionM: 0, energyUsedJ: 0,
    energyBreakdown: {} as never, samples: [],
  };

  it('G6-B1. 3腕とも、RunOutcomeからfinalDestructionStateとrecipeKeyを一方向複写する', () => {
    const outcome = outcomeWith('v1|abc');
    for (const built of [
      buildExperimentSession(baseSession, outcome),
      buildCourseRunNotebookRecord(baseCourseRun, outcome),
      buildVehicleTestRunNotebookRecord(baseTestRun, outcome),
    ]) {
      expect(built.finalDestructionState).toBe(FINAL_STATE);
      expect(built.recipeKey).toBe('v1|abc');
    }
  });

  it('G6-B2. base recordの他フィールドは一切変更しない(付与のみ)', () => {
    const built = buildExperimentSession(baseSession, outcomeWith('v1|abc'));
    const { finalDestructionState: _f, recipeKey: _r, ...rest } = built;
    expect(rest).toEqual(baseSession);
  });

  it('G6-B3. 入力のbase recordを破壊しない(純関数)', () => {
    const snapshot = structuredClone(baseCourseRun);
    buildCourseRunNotebookRecord(baseCourseRun, outcomeWith('v1|abc'));
    expect(baseCourseRun).toEqual(snapshot);
  });

  it('G6-B4. recipeKeyを呼出し側が指定する引数は存在しない(builderの引数は2つのみ)', () => {
    // 一方向複写契約の構造的固定: 別のrecipeKey値を渡せるAPIがそもそも無いことを引数長で示す。
    expect(buildExperimentSession.length).toBe(2);
    expect(buildCourseRunNotebookRecord.length).toBe(2);
    expect(buildVehicleTestRunNotebookRecord.length).toBe(2);
  });

  it('G6-B5. 生成結果は共通validatorのcurrent判定を通る(§16.4との接続)', () => {
    const built = buildVehicleTestRunNotebookRecord(baseTestRun, outcomeWith('v1|abc'));
    const result = validateNotebookFinalFields(built as unknown as Record<string, unknown>);
    expect(result).toMatchObject({ ok: true, kind: 'current' });
    // base record(builder適用前)はlegacy判定になる——pending経路では拒否される側。
    expect(validateNotebookFinalFields(baseTestRun as unknown as Record<string, unknown>))
      .toEqual({ ok: true, kind: 'legacy' });
  });

  it('G6-B6. 二重適用は型で不能(既に2フィールドを持つ値はLegacy型へ代入できない)', () => {
    const built = buildVehicleTestRunNotebookRecord(baseTestRun, outcomeWith('v1|abc'));
    // @ts-expect-error 既にfinalDestructionState/recipeKeyを持つ値はLegacy型の入力に取れない
    // (D9是正: 既存値の黙った上書きを型システムで構築不能にする)。
    buildVehicleTestRunNotebookRecord(built, outcomeWith('v1|xyz'));
  });
});

describe('runOutcomeApplication.ts: validateEquipmentLoadout', () => {
  it('1. 正常なloadoutはok:trueを返す', () => {
    const result = validateEquipmentLoadout(baseLoadout(), baseInventory());
    expect(result.ok).toBe(true);
  });

  it('2. rotorAssemblyId不在はmissingRole:"rotor"を返す', () => {
    const result = validateEquipmentLoadout({ ...baseLoadout(), rotorAssemblyId: 'missing' }, baseInventory());
    expect(result).toMatchObject({ ok: false, missingRole: 'rotor' });
  });

  it('3. batteryItemId===nullはmissingRole:"battery"を返す', () => {
    const result = validateEquipmentLoadout({ ...baseLoadout(), batteryItemId: null }, baseInventory());
    expect(result).toMatchObject({ ok: false, missingRole: 'battery' });
  });

  it('4. batteryItemIdがfamily不一致(gearのIDを渡す)はmissingRole:"battery"を返す', () => {
    const result = validateEquipmentLoadout({ ...baseLoadout(), batteryItemId: 'initial-gear-01' }, baseInventory());
    expect(result).toMatchObject({ ok: false, missingRole: 'battery' });
  });

  // --- P3-4 G6(§15.2・§15.3): 破壊済み個体の装備拒否 -------------------------
  it('G6-1. collapsed rotorはdestroyedRole:"rotor"で拒否される(missingRoleではない)', () => {
    const inventory = baseInventory();
    const rotor = inventory.rotorAssemblies[0];
    const withCollapsed: PlayerInventory = {
      ...inventory,
      rotorAssemblies: [{ ...rotor, collapsed: true }],
    };
    const result = validateEquipmentLoadout(baseLoadout(), withCollapsed);
    expect(result).toMatchObject({ ok: false, destroyedRole: 'rotor' });
    expect(result.ok ? '' : result.reason).toContain('崩壊済み');
    // 失敗の意味が異なるため、missingRole腕とは混同されない。
    expect(result.ok ? true : 'missingRole' in result).toBe(false);
  });

  it('G6-2. burnedOut rotorはdestroyedRole:"rotor"で拒否される(R17確定)', () => {
    const inventory = baseInventory();
    const rotor = inventory.rotorAssemblies[0];
    const withBurnedOut: PlayerInventory = {
      ...inventory,
      rotorAssemblies: [{ ...rotor, burnedOut: true }],
    };
    const result = validateEquipmentLoadout(baseLoadout(), withBurnedOut);
    expect(result).toMatchObject({ ok: false, destroyedRole: 'rotor' });
    expect(result.ok ? '' : result.reason).toContain('焼損済み');
  });

  it('G6-3. 全損ギヤ(toothLossCount>=GEAR_TOTAL_TOOTH_COUNT)はdestroyedRole:"gear"で拒否される(M-1(v)確定)', () => {
    const inventory = baseInventory();
    const items = inventory.items.map((item) => (
      item.family === 'gear'
        ? { ...item, wearState: { ...item.wearState, toothLossCount: GEAR_TOTAL_TOOTH_COUNT } }
        : item
    ));
    const result = validateEquipmentLoadout(baseLoadout(), { ...inventory, items } as PlayerInventory);
    expect(result).toMatchObject({ ok: false, destroyedRole: 'gear' });
    expect(result.ok ? '' : result.reason).toContain('全損済み');
  });

  it('G6-4. 全損の1本手前(9歯欠け)は装備できる(境界、seedingが受け取る値域0〜9の上端)', () => {
    const inventory = baseInventory();
    const items = inventory.items.map((item) => (
      item.family === 'gear'
        ? { ...item, wearState: { ...item.wearState, toothLossCount: GEAR_TOTAL_TOOTH_COUNT - 1 } }
        : item
    ));
    const result = validateEquipmentLoadout(baseLoadout(), { ...inventory, items } as PlayerInventory);
    expect(result.ok).toBe(true);
  });

  it('G6-5. 破壊済み個体はbeginRunでもdestroyedRole腕として伝わる(腕を潰さない)', () => {
    const inventory = baseInventory();
    const rotor = inventory.rotorAssemblies[0];
    const result = beginRun(
      baseLoadout(),
      { ...inventory, rotorAssemblies: [{ ...rotor, collapsed: true }] },
      'vehicle',
      goodSaveMeta(),
      null,
      true,
    );
    expect(result).toMatchObject({ ok: false, destroyedRole: 'rotor' });
  });

  it('5. brush/magnet/gear不在はそれぞれ対応するmissingRoleを返す', () => {
    expect(validateEquipmentLoadout({ ...baseLoadout(), brushItemId: 'x' }, baseInventory())).toMatchObject({ ok: false, missingRole: 'brush' });
    expect(validateEquipmentLoadout({ ...baseLoadout(), magnetItemId: 'x' }, baseInventory())).toMatchObject({ ok: false, missingRole: 'magnet' });
    expect(validateEquipmentLoadout({ ...baseLoadout(), gearItemId: 'x' }, baseInventory())).toMatchObject({ ok: false, missingRole: 'gear' });
  });

  it('6. bearing-gear不一致(bearingAssembly.gearItemIdとloadout.gearItemIdの食い違い)を検出する', () => {
    const inventory = baseInventory();
    const mismatched: PlayerInventory = { ...inventory, bearingAssemblies: [{ assemblyId: 'initial-bearing-01', gearItemId: 'not-the-gear', seizureFraction: 0 }] };
    const result = validateEquipmentLoadout(baseLoadout(), mismatched);
    expect(result).toMatchObject({ ok: false, missingRole: 'bearing' });
  });

  it('7. bodyAssemblyIdが非nullで不在の場合missingRole:"body"を返す', () => {
    const result = validateEquipmentLoadout({ ...baseLoadout(), bodyAssemblyId: 'missing-body' }, baseInventory());
    expect(result).toMatchObject({ ok: false, missingRole: 'body' });
  });
});

describe('runOutcomeApplication.ts: captureEquipmentIdSnapshot / validateEquipmentIdSnapshot', () => {
  it('8. captureEquipmentIdSnapshotは生きたloadoutを変更しない(finishAssembly規約)', () => {
    const loadout = baseLoadout() as EquipmentLoadout & { batteryItemId: string };
    const loadoutSnapshotBefore = JSON.stringify(loadout);
    captureEquipmentIdSnapshot(loadout, 'motor');
    expect(JSON.stringify(loadout)).toBe(loadoutSnapshotBefore);
  });

  it('9. motor文脈のsnapshotはgear/bearing/bodyをnull化する', () => {
    const loadout = baseLoadout() as EquipmentLoadout & { batteryItemId: string };
    const snapshot = captureEquipmentIdSnapshot(loadout, 'motor');
    expect(snapshot).toMatchObject({ context: 'motor', gearItemId: null, bearingAssemblyId: null, bodyAssemblyId: null });
  });

  it('10. vehicle文脈のsnapshotは全フィールドをコピーする', () => {
    const loadout = baseLoadout() as EquipmentLoadout & { batteryItemId: string };
    const snapshot = captureEquipmentIdSnapshot(loadout, 'vehicle');
    expect(snapshot).toEqual({ context: 'vehicle', ...loadout });
  });

  it('11. snapshot.contextとrunContext.contextの不一致を検出する', () => {
    const snapshot = captureEquipmentIdSnapshot(baseLoadout() as EquipmentLoadout & { batteryItemId: string }, 'motor');
    const result = validateEquipmentIdSnapshot(snapshot, vehicleRunContext());
    expect(result.ok).toBe(false);
  });

  it('12. 正しい組み合わせ(motor×motor snapshot)はok:trueを返す', () => {
    const snapshot = captureEquipmentIdSnapshot(baseLoadout() as EquipmentLoadout & { batteryItemId: string }, 'motor');
    expect(validateEquipmentIdSnapshot(snapshot, motorRunContext())).toEqual({ ok: true });
  });
});

describe('runOutcomeApplication.ts: resolveBearingForGear', () => {
  it('13. 対応するbearingが存在すればbearingAssemblyIdを返す', () => {
    const result = resolveBearingForGear('initial-gear-01', baseInventory());
    expect(result).toEqual({ ok: true, bearingAssemblyId: 'initial-bearing-01' });
  });

  it('14. 対応するbearingが存在しなければok:falseを返す', () => {
    const result = resolveBearingForGear('no-such-gear', baseInventory());
    expect(result.ok).toBe(false);
  });
});

describe('runOutcomeApplication.ts: createInitialPlayerInventoryAndLoadout', () => {
  it('15. 決定論: 複数回呼び出しても同一の構造を返す', () => {
    expect(createInitialPlayerInventoryAndLoadout()).toEqual(createInitialPlayerInventoryAndLoadout());
  });

  it('16. initial-固定IDとitem-/assembly-発行prefixは名前空間が異なる(衝突しない)', () => {
    const { inventory } = createInitialPlayerInventoryAndLoadout();
    const allIds = [...inventory.items.map((i) => i.itemId), ...inventory.rotorAssemblies.map((r) => r.assemblyId), ...inventory.bearingAssemblies.map((b) => b.assemblyId)];
    for (const id of allIds) {
      expect(id.startsWith('initial-')).toBe(true);
      expect(id.startsWith('item-')).toBe(false);
      expect(id.startsWith('assembly-')).toBe(false);
    }
  });

  it('17. bearingAssembly.gearItemIdは初期gearのitemIdと一致する(validateEquipmentLoadoutを通過する)', () => {
    const { inventory, loadout } = createInitialPlayerInventoryAndLoadout();
    expect(validateEquipmentLoadout(loadout, inventory).ok).toBe(true);
  });
});

describe('runOutcomeApplication.ts: beginRun', () => {
  it('18. lease未取得(leaseAcquired=false)はleaseNotAcquiredを返す', () => {
    const result = beginRun(baseLoadout(), baseInventory(), 'vehicle', goodSaveMeta(), null, false);
    expect(result).toEqual({ ok: false, reason: 'leaseNotAcquired' });
  });

  it('19. currentRunSequenceが非nullはrunInProgressを返す(多重開始拒否)', () => {
    const result = beginRun(baseLoadout(), baseInventory(), 'vehicle', goodSaveMeta(), 5, true);
    expect(result).toEqual({ ok: false, reason: 'runInProgress' });
  });

  it('20. pendingApplicationが非nullはpendingApplicationExistsを返す(多重開始拒否)', () => {
    const saveMeta = goodSaveMeta({ pendingApplication: baseEnvelope() });
    const result = beginRun(baseLoadout(), baseInventory(), 'vehicle', saveMeta, null, true);
    expect(result).toEqual({ ok: false, reason: 'pendingApplicationExists' });
  });

  it('21. 前提を満たす場合、runSequence=nextRunSequenceを発行しnextSaveMeta.nextRunSequenceを進める', () => {
    const saveMeta = goodSaveMeta({ nextRunSequence: 7 });
    const result = beginRun(baseLoadout(), baseInventory(), 'vehicle', saveMeta, null, true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.runSequence).toBe(7);
      expect(result.nextSaveMeta.nextRunSequence).toBe(8);
      expect(result.equipmentSnapshot.context).toBe('vehicle');
    }
  });

  it('22. 放棄・未完走のrunでも番号は再利用されない(beginRun成功後にnextRunSequenceが既に進んでいる)', () => {
    let saveMeta = goodSaveMeta({ nextRunSequence: 1 });
    const first = beginRun(baseLoadout(), baseInventory(), 'vehicle', saveMeta, null, true);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    saveMeta = first.nextSaveMeta; // このrunは放棄され、currentRunSequenceだけがnullへ戻ったと仮定
    const second = beginRun(baseLoadout(), baseInventory(), 'vehicle', saveMeta, null, true);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.runSequence).toBe(2); // 1番は再利用されない
  });

  it('23. reload後もnextRunSequenceが維持される(nextSaveMetaが即時永続化される想定)', () => {
    const saveMeta = goodSaveMeta({ nextRunSequence: 3 });
    const result = beginRun(baseLoadout(), baseInventory(), 'vehicle', saveMeta, null, true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nextSaveMeta.nextRunSequence).toBe(4);
  });

  it('24. validateEquipmentLoadout失敗時はmissingRoleを伴って失敗する', () => {
    const result = beginRun({ ...baseLoadout(), batteryItemId: null }, baseInventory(), 'vehicle', goodSaveMeta(), null, true);
    expect(result).toMatchObject({ ok: false, missingRole: 'battery' });
  });
});

describe('runOutcomeApplication.ts: applyRunOutcome(検証順序・原子性)', () => {
  it('25. saveId不一致はsaveIdMismatchを返す', () => {
    const result = applyRunOutcome(baseEnvelope({ runKey: { saveId: 'other-save', runSequence: 1 } }), baseInventory(), new Set(), goodSaveMeta());
    expect(result).toEqual({ ok: false, error: { kind: 'saveIdMismatch' } });
  });

  it('26. leaseToken不一致はstaleLeaseを返す', () => {
    const result = applyRunOutcome(baseEnvelope({ leaseToken: 'old-lease' }), baseInventory(), new Set(), goodSaveMeta());
    expect(result).toEqual({ ok: false, error: { kind: 'staleLease' } });
  });

  it('27. runSequence>=nextRunSequenceはinvalidRunSequenceを返す', () => {
    const result = applyRunOutcome(baseEnvelope({ runKey: { saveId: 'save-1', runSequence: 5 } }), baseInventory(), new Set(), goodSaveMeta({ nextRunSequence: 5 }));
    expect(result).toEqual({ ok: false, error: { kind: 'invalidRunSequence' } });
  });

  it('28. runSequence<=lastAppliedRunSequenceは正常な冪等skip(エラーではない、状態不変)', () => {
    const inventory = baseInventory();
    const discovered = new Set<DestructionModeId>();
    const saveMeta = goodSaveMeta({ lastAppliedRunSequence: 3, nextRunSequence: 10 });
    const result = applyRunOutcome(baseEnvelope({ runKey: { saveId: 'save-1', runSequence: 2 } }), inventory, discovered, saveMeta);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.applied).toBe(false);
      expect(result.nextInventory).toBe(inventory);
      expect(result.nextSaveMeta).toBe(saveMeta);
    }
  });

  it('29. 中間(既発行・未適用)の穴番号はエラーにせず通常適用される', () => {
    const saveMeta = goodSaveMeta({ lastAppliedRunSequence: 1, nextRunSequence: 5 });
    const result = applyRunOutcome(baseEnvelope({ runKey: { saveId: 'save-1', runSequence: 3 } }), baseInventory(), new Set(), saveMeta);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.applied).toBe(true);
  });

  it('30. 検証順序: rebindにより所有権を失ったタブが既適用済みrunSequenceのenvelopeを再送しても、冪等skipではなくstaleLeaseが返る', () => {
    const saveMeta = goodSaveMeta({ leaseToken: 'lease-new', lastAppliedRunSequence: 10, nextRunSequence: 20 });
    // 旧タブは古いleaseTokenのまま、既適用済み(<=lastApplied)のrunSequenceを再送する
    const result = applyRunOutcome(baseEnvelope({ leaseToken: 'lease-old', runKey: { saveId: 'save-1', runSequence: 5 } }), baseInventory(), new Set(), saveMeta);
    expect(result).toEqual({ ok: false, error: { kind: 'staleLease' } });
  });

  it('31. 装備が欠落している場合missingEquipmentを返し、inventoryが一切変化しない(原子性)', () => {
    const inventory = baseInventory();
    const brokenSnapshot = { ...captureEquipmentIdSnapshot(baseLoadout() as EquipmentLoadout & { batteryItemId: string }, 'vehicle'), magnetItemId: 'no-such-item' };
    const outcome = nonDestructionOutcome([], [
      { role: 'magnet', kind: 'demagnetization', deltaFraction: 0.1 },
      { role: 'brush', kind: 'wear', deltaFraction: 0.2 },
    ]);
    const result = applyRunOutcome(baseEnvelope({ equipmentSnapshot: brokenSnapshot, outcome }), inventory, new Set(), goodSaveMeta());
    expect(result).toEqual({ ok: false, error: { kind: 'missingEquipment', role: 'magnet' } });
  });

  it('32. bodyAssemblyId===nullでbody scorch diffが来た場合missingEquipmentを返す', () => {
    const snapshot = captureEquipmentIdSnapshot(baseLoadout() as EquipmentLoadout & { batteryItemId: string }, 'vehicle');
    expect(snapshot.bodyAssemblyId).toBeNull();
    const outcome = nonDestructionOutcome([], [{ role: 'body', kind: 'scorch', deltaFraction: 0.1 }]);
    const result = applyRunOutcome(baseEnvelope({ equipmentSnapshot: snapshot, outcome }), baseInventory(), new Set(), goodSaveMeta());
    expect(result).toEqual({ ok: false, error: { kind: 'missingEquipment', role: 'body' } });
  });

  it('33. 正常適用: magnetのdemagnetization diffが正しい個体だけに反映され、lastAppliedRunSequenceが更新される', () => {
    const inventory = baseInventory();
    const outcome = nonDestructionOutcome([], [{ role: 'magnet', kind: 'demagnetization', deltaFraction: 0.3 }]);
    const result = applyRunOutcome(baseEnvelope({ outcome }), inventory, new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const magnetItem = result.nextInventory.items.find((i) => i.itemId === 'initial-magnet-01');
    expect(magnetItem?.wearState).toEqual({ kind: 'magnet', demagnetizationFraction: 0.3 });
    // 他の個体(gear等)は変化しない
    const gearItem = result.nextInventory.items.find((i) => i.itemId === 'initial-gear-01');
    expect(gearItem?.wearState).toEqual(inventory.items.find((i) => i.itemId === 'initial-gear-01')?.wearState);
    expect(result.nextSaveMeta.lastAppliedRunSequence).toBe(1);
    expect(result.nextSaveMeta.pendingApplication).toBeNull();
  });

  it('34. battery consumed diffはinventory.itemsから除去され、consumedEquipmentIdsへ記録される', () => {
    const inventory = baseInventory();
    const outcome = nonDestructionOutcome([], [{ role: 'battery', kind: 'consumed' }]);
    const result = applyRunOutcome(baseEnvelope({ outcome }), inventory, new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextInventory.items.some((i) => i.itemId === 'initial-battery-01')).toBe(false);
    expect(result.result.consumedEquipmentIds).toEqual([{ role: 'battery', id: 'initial-battery-01' }]);
  });

  it('35. codexRecords生成元: 非terminal(manualAbort)のRunOutcomeでもD01イベントからnewlyDiscoveredModesが算出される', () => {
    const outcome = nonDestructionOutcome([d01Event()]);
    const result = applyRunOutcome(baseEnvelope({ outcome }), baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.newlyDiscoveredModes).toEqual(['D01']);
  });

  it('36. 既にdiscoveredModesに含まれるmodeはnewlyDiscoveredModesへ含まれない', () => {
    const outcome = nonDestructionOutcome([d01Event()]);
    const result = applyRunOutcome(baseEnvelope({ outcome }), baseInventory(), new Set(['D01']), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.newlyDiscoveredModes).toEqual([]);
  });

  it('37. 冪等skip時はnewlyDiscoveredModes等が空で、discoveredModesが変化しない', () => {
    const outcome = nonDestructionOutcome([d01Event()]);
    const discovered = new Set<DestructionModeId>();
    const result = applyRunOutcome(baseEnvelope({ outcome, runKey: { saveId: 'save-1', runSequence: 1 } }), baseInventory(), discovered, goodSaveMeta({ lastAppliedRunSequence: 1 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.applied).toBe(false);
      expect(result.result.newlyDiscoveredModes).toEqual([]);
      expect(result.nextDiscoveredModes).toBe(discovered);
    }
  });
});

describe('runOutcomeApplication.ts: retryPendingApplication', () => {
  it('38. pendingApplicationを対象にapplyRunOutcomeと同じ処理を行い、成功時はpendingApplicationが解放される(呼び出し側の責務、ここではnextSaveMetaに反映されることを確認)', () => {
    const envelope = baseEnvelope();
    const saveMeta = goodSaveMeta({ pendingApplication: envelope });
    const result = retryPendingApplication(saveMeta, baseInventory(), new Set());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nextSaveMeta.pendingApplication).toBeNull();
  });

  it('39. 失敗(staleLease)時はsaveMetaが変化しない(pendingApplicationは保持されたまま)', () => {
    const envelope = baseEnvelope({ leaseToken: 'old-lease' });
    const saveMeta = goodSaveMeta({ pendingApplication: envelope, leaseToken: 'new-lease' });
    const result = retryPendingApplication(saveMeta, baseInventory(), new Set());
    expect(result).toEqual({ ok: false, error: { kind: 'staleLease' } });
  });
});

describe('runOutcomeApplication.ts: abandonPendingApplication', () => {
  it('40. pendingApplicationをnullへ戻すだけで、lastAppliedRunSequenceには触れない', () => {
    const saveMeta = goodSaveMeta({ pendingApplication: baseEnvelope(), lastAppliedRunSequence: 3 });
    const result = abandonPendingApplication(saveMeta);
    expect(result.pendingApplication).toBeNull();
    expect(result.lastAppliedRunSequence).toBe(3);
  });

  it('41. 放棄後、後続の(より大きい番号の)runが正常適用されると高水位が放棄番号を飛び越える', () => {
    let saveMeta = goodSaveMeta({ pendingApplication: baseEnvelope({ runKey: { saveId: 'save-1', runSequence: 1 } } ), lastAppliedRunSequence: 0, nextRunSequence: 3 });
    saveMeta = abandonPendingApplication(saveMeta); // runSequence=1は放棄、lastAppliedRunSequenceは0のまま
    expect(saveMeta.lastAppliedRunSequence).toBe(0);
    const result = applyRunOutcome(baseEnvelope({ runKey: { saveId: 'save-1', runSequence: 2 } }), baseInventory(), new Set(), saveMeta);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nextSaveMeta.lastAppliedRunSequence).toBe(2); // 1を飛び越える
  });
});

describe('runOutcomeApplication.ts: rebindLeaseForPendingApplication / touchLeaseHeartbeat', () => {
  it('42. rebindはleaseToken・leaseHeartbeatAtのみ更新し、saveId・runSequence等は変更しない', () => {
    const saveMeta = goodSaveMeta({ saveId: 'save-1', nextRunSequence: 5, lastAppliedRunSequence: 2 });
    const result = rebindLeaseForPendingApplication(saveMeta, 'lease-b', '2026-08-02T01:00:00.000Z');
    expect(result.leaseToken).toBe('lease-b');
    expect(result.leaseHeartbeatAt).toBe('2026-08-02T01:00:00.000Z');
    expect(result.saveId).toBe('save-1');
    expect(result.nextRunSequence).toBe(5);
    expect(result.lastAppliedRunSequence).toBe(2);
  });

  it('43. rebind時、pendingApplicationが非nullならそのleaseTokenも同時に更新される', () => {
    const saveMeta = goodSaveMeta({ pendingApplication: baseEnvelope({ leaseToken: 'lease-old' }) });
    const result = rebindLeaseForPendingApplication(saveMeta, 'lease-new', '2026-08-02T01:00:00.000Z');
    expect(result.pendingApplication?.leaseToken).toBe('lease-new');
  });

  it('44. touchLeaseHeartbeatは所有権一致時のみheartbeatを更新する', () => {
    const saveMeta = goodSaveMeta({ leaseToken: 'lease-a' });
    const result = touchLeaseHeartbeat(saveMeta, 'lease-a', '2026-08-02T02:00:00.000Z');
    expect(result?.leaseHeartbeatAt).toBe('2026-08-02T02:00:00.000Z');
  });

  it('45. touchLeaseHeartbeatは所有権不一致(rebind後の旧タブ)でno-op(null)を返す', () => {
    const saveMeta = goodSaveMeta({ leaseToken: 'lease-new' }); // 別タブがrebind済み
    const result = touchLeaseHeartbeat(saveMeta, 'lease-old', '2026-08-02T02:00:00.000Z'); // 旧タブの呼び出し
    expect(result).toBeNull();
  });
});

describe('runOutcomeApplication.ts: 図鑑初回登録報酬(Suu指摘#1)', () => {
  it('46. cashG:1000リテラルではなくINITIAL_CASH_Gを参照する(Suu指摘#5)', () => {
    const { inventory } = createInitialPlayerInventoryAndLoadout();
    expect(inventory.cashG).toBe(INITIAL_CASH_G);
  });

  it('47. 新規発見1件でPROVISIONAL_DISCOVERY_REWARD_G分cashGが加算される', () => {
    const inventory = baseInventory();
    const outcome = nonDestructionOutcome([d01Event()]);
    const result = applyRunOutcome(baseEnvelope({ outcome }), inventory, new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.rewardsGrantedG).toBe(PROVISIONAL_DISCOVERY_REWARD_G);
      expect(result.nextInventory.cashG).toBe(inventory.cashG + PROVISIONAL_DISCOVERY_REWARD_G);
    }
  });

  it('48. 新規発見複数件(D01+D09)では件数分のcashGが加算される', () => {
    const inventory = baseInventory();
    const outcome = nonDestructionOutcome([d01Event(), d09Event()]);
    const result = applyRunOutcome(baseEnvelope({ outcome }), inventory, new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.newlyDiscoveredModes).toEqual(['D01', 'D09']);
      expect(result.result.rewardsGrantedG).toBe(PROVISIONAL_DISCOVERY_REWARD_G * 2);
      expect(result.nextInventory.cashG).toBe(inventory.cashG + PROVISIONAL_DISCOVERY_REWARD_G * 2);
    }
  });

  it('49. 既発見モードのみ(newlyDiscoveredModesが空)ではcashGが加算されない', () => {
    const inventory = baseInventory();
    const outcome = nonDestructionOutcome([d01Event()]);
    const result = applyRunOutcome(baseEnvelope({ outcome }), inventory, new Set(['D01']), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.rewardsGrantedG).toBe(0);
      expect(result.nextInventory.cashG).toBe(inventory.cashG);
    }
  });

  it('50. 冪等skip時はcashGが加算されない(二重付与なし)', () => {
    const inventory = baseInventory();
    const outcome = nonDestructionOutcome([d01Event()]);
    const result = applyRunOutcome(baseEnvelope({ outcome, runKey: { saveId: 'save-1', runSequence: 1 } }), inventory, new Set(), goodSaveMeta({ lastAppliedRunSequence: 1 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.applied).toBe(false);
      expect(result.result.rewardsGrantedG).toBe(0);
      expect(result.nextInventory).toBe(inventory);
    }
  });

  it('51. retryPendingApplicationで同一envelopeを再適用しても、既にlastAppliedRunSequenceが進んでいれば冪等skipとなり二重付与されない', () => {
    const inventory = baseInventory();
    const outcome = nonDestructionOutcome([d01Event()]);
    const envelope = baseEnvelope({ outcome, runKey: { saveId: 'save-1', runSequence: 1 } });
    // 1回目: 通常適用(報酬付与)
    const first = applyRunOutcome(envelope, inventory, new Set(), goodSaveMeta());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.result.rewardsGrantedG).toBe(PROVISIONAL_DISCOVERY_REWARD_G);
    // 2回目: retryPendingApplication経由で同じenvelopeを再送(pendingとして保持されていた想定)
    const saveMetaAfterFirst = { ...first.nextSaveMeta, pendingApplication: envelope };
    const retryResult = retryPendingApplication(saveMetaAfterFirst, first.nextInventory, first.nextDiscoveredModes);
    expect(retryResult.ok).toBe(true);
    if (retryResult.ok) {
      expect(retryResult.result.applied).toBe(false); // 冪等skip
      expect(retryResult.result.rewardsGrantedG).toBe(0); // 二重付与なし
      expect(retryResult.nextInventory.cashG).toBe(first.nextInventory.cashG); // 変化なし
    }
  });
});

describe('runOutcomeApplication.ts: isLeaseHeartbeatStale(Suu指摘#3)', () => {
  it('52. 不正ISO文字列はstale扱い', () => {
    expect(isLeaseHeartbeatStale('not-a-valid-iso', '2026-08-02T00:00:20.000Z')).toBe(true);
  });

  it('53. 経過19999msはfresh', () => {
    expect(isLeaseHeartbeatStale('2026-08-02T00:00:00.000Z', '2026-08-02T00:00:19.999Z')).toBe(false);
  });

  it('54. 経過ちょうどLEASE_STALE_THRESHOLD_MS(20000ms)はstale', () => {
    expect(LEASE_STALE_THRESHOLD_MS).toBe(20_000);
    expect(isLeaseHeartbeatStale('2026-08-02T00:00:00.000Z', '2026-08-02T00:00:20.000Z')).toBe(true);
  });

  it('55. 未来時刻(leaseHeartbeatAtがnowより後)は安全側でstale扱い', () => {
    expect(isLeaseHeartbeatStale('2026-08-02T00:01:00.000Z', '2026-08-02T00:00:00.000Z')).toBe(true);
  });

  it('56. nowが不正ISOの場合もstale扱い', () => {
    expect(isLeaseHeartbeatStale('2026-08-02T00:00:00.000Z', 'also-not-valid')).toBe(true);
  });
});

describe('runOutcomeApplication.ts: validator負例の補強(Suu指摘#6)', () => {
  it('57. validateEquipmentIdSnapshot: vehicle文脈でgearItemId/bearingAssemblyIdがnull(unknown由来のcast入力)を拒否する', () => {
    const badSnapshot = {
      context: 'vehicle',
      rotorAssemblyId: 'initial-rotor-01',
      batteryItemId: 'initial-battery-01',
      brushItemId: 'initial-brush-01',
      magnetItemId: 'initial-magnet-01',
      gearItemId: null,
      bearingAssemblyId: null,
      bodyAssemblyId: null,
    } as unknown as EquipmentIdSnapshot;
    const result = validateEquipmentIdSnapshot(badSnapshot, vehicleRunContext());
    expect(result.ok).toBe(false);
  });

  it('58. validateEquipmentIdSnapshot: motor文脈でgearItemId/bearingAssemblyId/bodyAssemblyIdが非null(unknown由来のcast入力)を拒否する', () => {
    const badSnapshot = {
      context: 'motor',
      rotorAssemblyId: 'initial-rotor-01',
      batteryItemId: 'initial-battery-01',
      brushItemId: 'initial-brush-01',
      magnetItemId: 'initial-magnet-01',
      gearItemId: 'initial-gear-01',
      bearingAssemblyId: 'initial-bearing-01',
      bodyAssemblyId: 'some-body',
    } as unknown as EquipmentIdSnapshot;
    const result = validateEquipmentIdSnapshot(badSnapshot, motorRunContext());
    expect(result.ok).toBe(false);
  });

  it('59. validateEquipmentLoadout: magnetItemIdがfamily不一致(gearの個体を指す)を検出する(battery以外の代表例)', () => {
    const result = validateEquipmentLoadout({ ...baseLoadout(), magnetItemId: 'initial-gear-01' }, baseInventory());
    expect(result).toMatchObject({ ok: false, missingRole: 'magnet' });
  });
});

// P3-2ゲート7(docs/phase3-p3-2-plan.md v17 §3.4、正式Fable Q4-5裁定): 単一のEquipmentIdSnapshot
// からFireExposureProfileを導出する純関数。adjacentRolesEquippedの重複はmagnetItemIdが
// 両contextで必須の単一string(配列でもnullでもない)であるため構造的に不可能——本節はその
// 構造的性質を実行時にも確認する。
describe('deriveFireExposureProfileFromLoadout(P3-2ゲート7)', () => {
  it('motor文脈: bodyAssemblyIdが常にnullのためbodyEquipped:falseを返す', () => {
    const snapshot = captureEquipmentIdSnapshot(baseLoadout() as EquipmentLoadout & { batteryItemId: string }, 'motor');
    const profile = deriveFireExposureProfileFromLoadout(snapshot);
    expect(profile.bodyEquipped).toBe(false);
    expect(profile.adjacentRolesEquipped).toEqual(['magnet']);
  });

  it('vehicle文脈・bodyAssemblyId===null(既定fixture、未装備): bodyEquipped:falseを返す', () => {
    const loadout = baseLoadout();
    expect(loadout.bodyAssemblyId).toBeNull(); // 前提: 既定fixtureはボディ未装備
    const snapshot = captureEquipmentIdSnapshot(loadout as EquipmentLoadout & { batteryItemId: string }, 'vehicle');
    const profile = deriveFireExposureProfileFromLoadout(snapshot);
    expect(profile.bodyEquipped).toBe(false);
    expect(profile.adjacentRolesEquipped).toEqual(['magnet']);
  });

  it('vehicle文脈・bodyAssemblyId非null(装備済み): bodyEquipped:trueを返す', () => {
    const loadout = { ...baseLoadout(), bodyAssemblyId: 'some-body-assembly' };
    const snapshot = captureEquipmentIdSnapshot(loadout as EquipmentLoadout & { batteryItemId: string }, 'vehicle');
    const profile = deriveFireExposureProfileFromLoadout(snapshot);
    expect(profile.bodyEquipped).toBe(true);
    expect(profile.adjacentRolesEquipped).toEqual(['magnet']);
  });

  it('adjacentRolesEquippedは重複を含まない(構造的性質の実行時確認)+validateFireExposureProfileに受理される(production構築確認)', () => {
    const snapshot = captureEquipmentIdSnapshot(baseLoadout() as EquipmentLoadout & { batteryItemId: string }, 'vehicle');
    const profile: FireExposureProfile = deriveFireExposureProfileFromLoadout(snapshot);
    expect(new Set(profile.adjacentRolesEquipped).size).toBe(profile.adjacentRolesEquipped.length);

    const validated = validateFireExposureProfile(profile);
    expect(validated.ok).toBe(true);
  });
});

// P3-1サブステップ4(docs/phase3-p3-1-plan.md v11 §1.2・§7): stepMotorWithDestructionが実際に
// 生成したRunOutcomeをapplyRunOutcomeへ流し込む統合テスト。applyRunOutcome自体のaction契約
// (lease/runSequence/原子性、P3-0で検証済み)は再検証しない。saveStore.ts・gameStore.tsは無改修
// (P3-0-Q2裁定、production配線はP3-4)。
describe('P3-1サブステップ4: stepMotorWithDestruction → applyRunOutcome統合(fixtureベース)', () => {
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

  function goodDestructionConfig(shortCircuitDurationLimitS: number): DestructionConfig {
    return {
      battery: { profile: 'nonLipo', shortCircuitDurationLimitS },
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

  function initialSimState(overrides: Partial<SimState> = {}): SimState {
    return { theta: 0, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0, ...overrides };
  }

  function motorSnapshotInput(overrides: Partial<CaptureRunSnapshotInput> = {}): CaptureRunSnapshotInput {
    return {
      motorConfig: goodMotorConfig(),
      carConfig: null,
      destructionConfig: goodDestructionConfig(2),
      runContext: motorRunContext(),
      initialMotorState: initialSimState(),
      initialVehicleState: null,
      track: null,
      courseLengthM: null, // ゲート6新規。motor文脈は正式M2検証によりnull必須
      slopeRad: null,
      seed: 1,
      initialDestructionState: createInitialDestructionState('nonLipo'),
      recipeKey: 'v1|test-motor',
      ...overrides,
    };
  }

  // destructionOrchestration.test.tsのstandardCarConfig/vehicleSnapshotInput/goodTrackと
  // 同型のvehicle文脈fixture(63番のtest-run/track-run文脈で使用)。
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

  function goodTrack(): TrackDefinition {
    return { id: 'track-1', name: 'テストコース', description: '', segments: [{ lengthM: 10, slopeDeg: 0, surfaceGrip: 0.7, roughness: 0.2 }], objectives: [] };
  }

  // ゲート6新規: 既定はtest-run文脈(track===null、courseLengthM/slopeRadが非null)。
  // track-run文脈(track非null)を作る場合は、呼び出し側でtrack・courseLengthM: null・
  // slopeRad: nullをまとめて上書きすること(正式M2検証の交差条件、5.2節)。
  // Suu_mot3ゲート6レビューP60-2是正: 従来はmotorConfig/carConfigの既定値からinitialVehicleState
  // を導出した「後」でoverridesをspreadしていたため、overrides.motorConfig/carConfigを渡しても
  // 返り値のmotorConfig/carConfigフィールドだけが差し替わり、initialVehicleState/initialMotorState
  // は既定値から導出されたままという出典分裂(single-source-of-truth違反)があった。
  // 最終的なmotorConfig/carConfig(overrides優先)を先に確定し、その2値からinitialVehicleStateを
  // 導出し、initialMotorStateも同じvehicleState.motorから設定する構造へ修正する。
  function vehicleSnapshotInput(overrides: Partial<CaptureRunSnapshotInput> = {}): CaptureRunSnapshotInput {
    const motorConfig = (overrides.motorConfig as MotorConfig | undefined) ?? goodMotorConfig();
    const carConfig = (overrides.carConfig as CarConfig | undefined) ?? standardCarConfig();
    const vehicleState: VehicleSimState = createInitialVehicleState(motorConfig, carConfig);
    return {
      motorConfig,
      carConfig,
      destructionConfig: goodDestructionConfig(2),
      runContext: vehicleRunContext(),
      initialMotorState: vehicleState.motor,
      initialVehicleState: vehicleState,
      track: null,
      courseLengthM: 10,
      slopeRad: 0,
      seed: 1,
      initialDestructionState: createInitialDestructionState('nonLipo'),
      recipeKey: 'v1|test-vehicle',
      ...overrides,
    };
  }

  // envelope組み立て用: captureEquipmentIdSnapshotを実際に経由し、production配線を模倣しない
  // 範囲でテストコード内のみでRunApplicationEnvelopeを構築する。equipmentSnapshotのcontextは
  // outcome.replaySnapshot.runContext.contextから一意に導出する(63番のcontext非依存性テストが
  // motor/vehicle双方の文脈を独立に構築できるようにするため、別引数として渡さず単一の出典に従う)。
  function envelopeFor(outcome: RunOutcome, runSequence: number): RunApplicationEnvelope {
    const { loadout } = createInitialPlayerInventoryAndLoadout();
    const snapshot = captureEquipmentIdSnapshot(loadout as EquipmentLoadout & { batteryItemId: string }, outcome.replaySnapshot.runContext.context);
    return {
      runKey: { saveId: 'save-1', runSequence },
      leaseToken: 'lease-a',
      outcome,
      equipmentSnapshot: snapshot,
      notebookRecord: { kind: 'session', record: {} as never },
    };
  }

  // ゲート7(Suu_mot3レビューR1是正、R4是正: 明示列挙〈allow-list〉はcontractVersionの
  // 欠落を招いた——将来RunSnapshotへフィールドが追加された場合も同種の穴が再発するため、
  // track・courseLengthM・slopeRad〈差し替えの対象そのもの〉の3項目だけをrest構文で除外し、
  // 残りは型構造のまま自動的に返す〈deny-list〉方式にする)。
  function runSnapshotConfigFingerprint(snapshot: RunSnapshot) {
    const { track: _track, courseLengthM: _courseLengthM, slopeRad: _slopeRad, ...fingerprint } = snapshot;
    return fingerprint;
  }

  // ゲート7: envelopeForと同型だが、呼び出し側が構築したloadout(ボディ装備込み等)を使う版。
  function envelopeForWithLoadout(outcome: RunOutcome, runSequence: number, loadout: EquipmentLoadout & { batteryItemId: string }): RunApplicationEnvelope {
    const snapshot = captureEquipmentIdSnapshot(loadout, outcome.replaySnapshot.runContext.context);
    return {
      runKey: { saveId: 'save-1', runSequence },
      leaseToken: 'lease-a',
      outcome,
      equipmentSnapshot: snapshot,
      notebookRecord: { kind: 'session', record: {} as never },
    };
  }

  // ゲート7: D04(body/magnet延焼)・D07(磁石熱蓄積・不可逆減磁)を実物理で発火させるためのlipo
  // destructionConfig。既存goodDestructionConfigはprofile:'nonLipo'固定のため別関数として追加する
  // (既存61/62番のnonLipo D03テストへの影響を避ける)。d04/d07の較正値は既存goodDestructionConfig
  // と同一(設計候補値、production写像値ではないテスト専用schema-valid値)。
  function goodLipoDestructionConfig(overrides: {
    shortCircuitDurationLimitS?: number;
    runawayHeatThreshold?: number;
    stageDurations?: { swellingS: number; smokingS: number };
    d07?: DestructionConfig['d07'];
  } = {}): DestructionConfig {
    return {
      battery: {
        profile: 'lipo',
        shortCircuitDurationLimitS: overrides.shortCircuitDurationLimitS ?? 1 / 120,
        runawayHeatThreshold: overrides.runawayHeatThreshold ?? 0.01,
        unsafeDischargeStartRatio: 0.9,
        stageDurations: overrides.stageDurations ?? { swellingS: 1 / 120, smokingS: 1 / 120 },
        internalResistanceDegradationMultiplier: 1.5,
      },
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
      d06: { breakage: { kind: 'breakable', gearStrengthThresholdNm: 0.5 }, toothFatigueExposureNmS: 0.5 },
      d07: overrides.d07 ?? {
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

  // ゲート7: D04のaffectedRoles(body/magnet)を実際に発火させるためのfireExposureProfile込み文脈。
  // 既存motorRunContext/vehicleRunContextはbodyEquipped:false・adjacentRolesEquipped:[]のため
  // D04が発火してもaffectedRolesが空になりbody/magnet scorch diffsが一切生成されない
  // (destructionModes.tsのadvanceD04、424-428行目参照)。motor-only文脈はbodyEquipped:falseに
  // 固定する: EquipmentIdSnapshotのmotor判別branchはbodyAssemblyId:null構造で固定されており
  // (captureEquipmentIdSnapshot)、ボディ個体を伴わない台上試験という物理的実態と一致する
  // (bodyEquipped:trueにすると、resolveDegradationDiffsのbody分岐がbodyAssemblyId===nullを
  // 理由に必ずok:falseを返す——motor-onlyでbody延焼を主張するのはschema-validだが
  // production-validではない構成であることが判明したため、意図的にこの構成を避ける)。
  function fireExposedMotorRunContext(): DestructionRunContext {
    return { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: ['magnet'] }, gearTotalToothCount: null };
  }

  function fireExposedVehicleRunContext(): DestructionRunContext {
    return { context: 'vehicle', fireExposureProfile: { bodyEquipped: true, adjacentRolesEquipped: ['magnet'] }, gearTotalToothCount: GEAR_TOTAL_TOOTH_COUNT };
  }

  // ゲート7: bodyScorchのdegradationDiffs適用を検証するには、bodyAssemblyId非nullかつ
  // inventory.bodyPartsに対応する個体が実在する構成が必要(既定fixtureはbodyParts:[]・
  // bodyAssemblyId:nullのため、そのままではvalidateEquipmentSnapshotIntegrityのbody分岐を
  // 経由できない)。
  function inventoryAndLoadoutWithBody(): { inventory: PlayerInventory; loadout: EquipmentLoadout & { batteryItemId: string } } {
    const base = createInitialPlayerInventoryAndLoadout();
    const bodyPart: BodyPartState = { assemblyId: 'body-assembly-01', materialId: 'body-ps-cowl', scorchFraction: 0 };
    const inventory: PlayerInventory = { ...base.inventory, bodyParts: [bodyPart] };
    const loadout = { ...base.loadout, bodyAssemblyId: bodyPart.assemblyId } as EquipmentLoadout & { batteryItemId: string };
    return { inventory, loadout };
  }

  it('60. motor-only、manualAbort終了: D01の恒久劣化(rotorAssemblies.collapsed)がapplyRunOutcomeで正しく反映される', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig: goodMotorConfig({ varnished: false, brushPressure: 0.05, magnetDistanceMm: 5 }),
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let motorState: SimState = initialSimState({ omega: COIL_DEFORM_OMEGA * 3 });
    let sawD01 = false;

    for (let i = 0; i < COIL_DEFORM_FRAMES + 60 && !sawD01; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull(); // D01は非終端。この構成でD03(短絡)条件は満たされない
      sawD01 = accumulator.events.some((e) => e.mode === 'D01');
    }
    expect(sawD01).toBe(true);

    const outcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(outcome.endReason).toBe('manualAbort');
    expect(outcome.degradationDiffs).toContainEqual({ role: 'rotor', kind: 'collapse' });

    const envelope = envelopeFor(outcome, 1);
    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rotor = result.nextInventory.rotorAssemblies.find((r) => r.assemblyId === envelope.equipmentSnapshot.rotorAssemblyId);
      expect(rotor?.collapsed).toBe(true);
      expect(result.result.applied).toBe(true);
    }
  });

  it('61. motor-only、D03発火: battery個体消滅+destructionTerminal終了がapplyRunOutcomeで正しく反映される', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig: goodMotorConfig({ slitWidthMm: 0 }), // 持続短絡
      destructionConfig: goodDestructionConfig(1 / 120),
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let motorState: SimState = initialSimState();
    let termination: RunOutcome | null = null;

    for (let i = 0; i < 30 && termination === null; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    expect(termination!.degradationDiffs).toContainEqual({ role: 'battery', kind: 'consumed' });

    const envelope = envelopeFor(termination!, 1);
    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextInventory.items.some((item) => item.itemId === envelope.equipmentSnapshot.batteryItemId)).toBe(false);
      expect(result.result.consumedEquipmentIds).toContainEqual({ role: 'battery', id: envelope.equipmentSnapshot.batteryItemId });
    }
  });

  it('62. 同一run内でD01(非終端)発火後にD03(終端)が発火した場合、両方のdegradationDiffsが単一のRunOutcomeへ集約され、単一のapplyRunOutcome呼び出しで両方反映される', () => {
    // 実測(scratch script、npx tsx)で確認済み: この構成ではD01がframe 359で発火する。
    // shortCircuitDurationLimitSをそれより十分後(3.2s=frame 384相当)に設定し、D01が先に、
    // D03がその後に同一run内で発火する順序を固定する。
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig: goodMotorConfig({ varnished: false, brushPressure: 0.05, magnetDistanceMm: 5, slitWidthMm: 0 }),
      destructionConfig: goodDestructionConfig(3.2),
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let motorState: SimState = initialSimState({ omega: COIL_DEFORM_OMEGA * 3 });
    let termination: RunOutcome | null = null;

    for (let i = 0; i < 400 && termination === null; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    // D01が先・D03が後という順序を、コメント上の実測時刻だけでなくevents配列そのもので機械検証する。
    // P3-1はD01/D03の2分岐のみを実装しているため、mode列は['D01','D03']に一意に定まる。
    expect(termination!.events.map((e) => e.mode)).toEqual(['D01', 'D03']);
    const d01Index = termination!.events.findIndex((e) => e.mode === 'D01');
    const d03Index = termination!.events.findIndex((e) => e.mode === 'D03');
    expect(d01Index).toBeGreaterThanOrEqual(0);
    expect(d03Index).toBeGreaterThan(d01Index);
    expect(termination!.degradationDiffs).toContainEqual({ role: 'rotor', kind: 'collapse' });
    expect(termination!.degradationDiffs).toContainEqual({ role: 'battery', kind: 'consumed' });

    const envelope = envelopeFor(termination!, 1);
    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rotor = result.nextInventory.rotorAssemblies.find((r) => r.assemblyId === envelope.equipmentSnapshot.rotorAssemblyId);
      expect(rotor?.collapsed).toBe(true);
      expect(result.nextInventory.items.some((item) => item.itemId === envelope.equipmentSnapshot.batteryItemId)).toBe(false);
      expect(result.result.resolvedDegradations).toHaveLength(2); // rotor collapse + battery consumed、単一呼び出しで両方反映
    }
  });

  // 63. context非依存性(正式Fable P3-1-Q4(a)裁定、計画v11 §7.2・§7.3): motor-only/test-run/
  // track-runの3文脈それぞれで、手構築RunOutcomeが有効なRunSnapshot(空castではなくcaptureRunSnapshot
  // が実際に生成した値)を積んでいてもapplyRunOutcomeへ正しく到達することをtable-drivenで検証する。
  // test-run/track-runは実wrapper未導入(P3-2/P3-4)のため手構築RunOutcome fixtureでよいという
  // 正式Fable裁定どおりだが、中のRunSnapshotはrestoreRunSnapshot(実行時validator契約)を
  // 満たす有効値でなければならない。
  const contextCases: Array<{
    label: 'motor-only' | 'test-run' | 'track-run';
    expectedContext: 'motor' | 'vehicle';
    expectedTrackNonNull: boolean;
    buildSnapshot: () => RunSnapshot;
  }> = [
    {
      label: 'motor-only',
      expectedContext: 'motor',
      expectedTrackNonNull: false,
      buildSnapshot: () => captureRunSnapshot(motorSnapshotInput()),
    },
    {
      label: 'test-run',
      expectedContext: 'vehicle',
      expectedTrackNonNull: false,
      buildSnapshot: () => captureRunSnapshot(vehicleSnapshotInput({ track: null })),
    },
    {
      label: 'track-run',
      expectedContext: 'vehicle',
      expectedTrackNonNull: true,
      buildSnapshot: () => captureRunSnapshot(vehicleSnapshotInput({ track: goodTrack(), courseLengthM: null, slopeRad: null })),
    },
  ];

  it.each(contextCases)('63-$label. context非依存性(正式Fable P3-1-Q4(a)裁定): $label文脈の手構築RunOutcome(有効なRunSnapshot込み)fixtureもapplyRunOutcomeへ正しく到達する', ({ expectedContext, expectedTrackNonNull, buildSnapshot }) => {
    const snapshot = buildSnapshot();

    // fixtureが本当に意図した文脈であることを先に確認する(track null/non-nullを含む)。
    expect(snapshot.runContext.context).toBe(expectedContext);
    expect(snapshot.track !== null).toBe(expectedTrackNonNull);

    // 実行時validator契約(restoreRunSnapshot)を満たす有効値であることを確認する
    // (captureRunSnapshotの出力をJSON round-tripしても壊れない、production同型の経路)。
    const restored = restoreRunSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(restored.ok).toBe(true);

    const outcome: RunOutcome = {
      endReason: 'manualAbort',
      events: [],
      destructionState: createInitialDestructionState('nonLipo'), // 空castではなく有効値
      degradationDiffs: [{ role: 'rotor', kind: 'collapse' }],
      replaySnapshot: snapshot,
    };
    const envelope = envelopeFor(outcome, 1);
    expect(envelope.equipmentSnapshot.context).toBe(expectedContext); // envelopeForのcontext自動導出を確認

    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rotor = result.nextInventory.rotorAssemblies.find((r) => r.assemblyId === envelope.equipmentSnapshot.rotorAssemblyId);
      expect(rotor?.collapsed).toBe(true);
    }
  });

  // 64〜68. P3-2ゲート7(docs/phase3-p3-2-plan.md v17 §11.7・§9・§10.3): D04/D07劣化の3文脈
  // (motor-only/test-run/track-run)原子的適用。degradationApplication.ts・applyRunOutcomeの
  // magnet/body分岐自体はP3-0で既に汎用実装済みのため、ここでは実wrapper(motor-only/test-run)・
  // 手構築RunOutcome(track-run)がそれぞれ実際にD04/D07由来のdegradationDiffsを生成し、
  // applyRunOutcomeへ単一呼び出しで正しく到達することを検証する。

  it('64. motor-only、D04発火(実wrapper、fireExposure=magnetのみ。bodyEquipped:falseは台上試験にボディがない物理的実態と一致): battery消滅+magnet scorchのdegradationDiffsが単一呼び出しでapplyRunOutcomeへ反映される(bodyのdegradationDiffは一切生成されない)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig: goodMotorConfig({ slitWidthMm: 0 }), // 持続短絡
      destructionConfig: goodLipoDestructionConfig(),
      runContext: fireExposedMotorRunContext(),
      initialDestructionState: createInitialDestructionState('lipo'),
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let motorState: SimState = initialSimState();
    let termination: RunOutcome | null = null;

    for (let i = 0; i < 60 && termination === null; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    if (termination!.endReason === 'destructionTerminal') expect(termination!.terminalModes).toContain('D04');
    expect(termination!.degradationDiffs).toContainEqual({ role: 'battery', kind: 'consumed' });
    expect(termination!.degradationDiffs).toContainEqual({ role: 'magnet', kind: 'scorch', deltaFraction: 0.15 });
    expect(termination!.degradationDiffs.some((d) => d.role === 'body')).toBe(false); // bodyEquipped:falseのため生成されない

    const envelope = envelopeFor(termination!, 1);
    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextInventory.items.some((item) => item.itemId === envelope.equipmentSnapshot.batteryItemId)).toBe(false);
      const magnet = result.nextInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.magnetItemId);
      expect(magnet?.wearState).toMatchObject({ demagnetizationFraction: 0.15 });
      expect(result.result.resolvedDegradations.length).toBeGreaterThanOrEqual(2); // battery+magnetが単一呼び出しで反映
    }
  });

  it('65. test-run、D04発火(実wrapper stepTestRunWithDestruction、fireExposure=body+magnet): battery消滅+body/magnet scorchが単一呼び出しでapplyRunOutcomeへ反映される', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: goodMotorConfig({ slitWidthMm: 0 }), // 持続短絡
      destructionConfig: goodLipoDestructionConfig(),
      runContext: fireExposedVehicleRunContext(),
      initialDestructionState: createInitialDestructionState('lipo'),
      track: null,
      courseLengthM: 10,
      slopeRad: 0,
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let vehicleState: VehicleSimState = snapshot.initialVehicleState!;
    let termination: RunOutcome | null = null;

    for (let i = 0; i < 60 && termination === null; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    if (termination!.endReason === 'destructionTerminal') expect(termination!.terminalModes).toContain('D04');
    expect(termination!.degradationDiffs).toContainEqual({ role: 'battery', kind: 'consumed' });
    expect(termination!.degradationDiffs).toContainEqual({ role: 'body', kind: 'scorch', deltaFraction: 0.2 });
    expect(termination!.degradationDiffs).toContainEqual({ role: 'magnet', kind: 'scorch', deltaFraction: 0.15 });

    const { inventory, loadout } = inventoryAndLoadoutWithBody();
    const envelope = envelopeForWithLoadout(termination!, 1, loadout);
    const result = applyRunOutcome(envelope, inventory, new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextInventory.items.some((item) => item.itemId === envelope.equipmentSnapshot.batteryItemId)).toBe(false);
      const magnet = result.nextInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.magnetItemId);
      expect(magnet?.wearState).toMatchObject({ demagnetizationFraction: 0.15 });
      const body = result.nextInventory.bodyParts.find((b) => b.assemblyId === envelope.equipmentSnapshot.bodyAssemblyId);
      expect(body?.scorchFraction).toBe(0.2);
    }
  });

  it('66. track-run、D04(実wrapperで生成した一貫RunOutcomeのevents/state/diffsをそのまま使い、replaySnapshotだけ有効なtrack-run snapshotへ置換〈実wrapper未導入のtrack-runに対する正式Fable P3-1-Q4(a)裁定と同型の扱い〉): body/magnet scorch+battery消滅が単一呼び出しでapplyRunOutcomeへ反映され、newlyDiscoveredModesにD04が入る。stepTestRunWithDestructionはtrack-run accumulatorへは一切呼ばれないことを構築それ自体で示す(§10.4)', () => {
    // Suu_mot3ゲート7レビューP1是正: 手構築RunOutcome(events:[]・destructionState=stage:'none')は
    // terminalModes=['D04']と物理的・契約的に矛盾し(D04発見がevents経由〈computeNewlyDiscoveredModes〉
    // のためnewlyDiscoveredModesが常に空になる等)、production的に存在しないRunOutcomeだった。
    // 是正: test-run実wrapper(stepTestRunWithDestruction、65番と同一構成)でevents/destructionState/
    // degradationDiffsすべて内部一貫性のある本物のD04 termination RunOutcomeを生成し、
    // replaySnapshotのみ有効なtrack-run snapshot(track非null・courseLengthM/slopeRad両方null)へ
    // 差し替える。track-run用の実wrapperがまだ存在しない(P3-2/P3-4)ことへの対応であり、
    // events/state/diffs自体は本物のため二重定義(手で書いたcauseLog等)を避けられる。
    // Suu_mot3ゲート7是正レビュー2 R1是正: events/state/diffsを生んだ走行config(motorConfig等)と
    // 差し替え先snapshotのconfigが食い違うと「リプレイの唯一出典」契約に反するため、
    // 両snapshotへ同一のmotorConfig/destructionConfig/runContext/initialDestructionStateを使う。
    const sharedMotorConfig = goodMotorConfig({ slitWidthMm: 0 }); // 持続短絡
    const sharedDestructionConfig = goodLipoDestructionConfig();
    const sharedRunContext = fireExposedVehicleRunContext();

    const testRunSnapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: sharedMotorConfig,
      destructionConfig: sharedDestructionConfig,
      runContext: sharedRunContext,
      initialDestructionState: createInitialDestructionState('lipo'),
      track: null,
      courseLengthM: 10,
      slopeRad: 0,
    }));
    let accumulator: RunAccumulator = createRunAccumulator(testRunSnapshot);
    let vehicleState: VehicleSimState = testRunSnapshot.initialVehicleState!;
    let termination: RunOutcome | null = null;
    for (let i = 0; i < 60 && termination === null; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    if (termination!.endReason === 'destructionTerminal') expect(termination!.terminalModes).toContain('D04');
    expect(termination!.events.some((e) => e.mode === 'D04')).toBe(true); // 発見経路(computeNewlyDiscoveredModes)がevents由来であることの前提確認

    const trackRunSnapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: sharedMotorConfig,
      destructionConfig: sharedDestructionConfig,
      runContext: sharedRunContext,
      initialDestructionState: createInitialDestructionState('lipo'),
      track: goodTrack(),
      courseLengthM: null,
      slopeRad: null,
    }));
    const restored = restoreRunSnapshot(JSON.parse(JSON.stringify(trackRunSnapshot)));
    expect(restored.ok).toBe(true); // 差し替え先が実際に有効なtrack-run RunSnapshotであることを確認
    expect(trackRunSnapshot.track).not.toBeNull();
    // R1是正: track・courseLengthM・slopeRad(差し替えの対象そのもの)以外の全フィールドが
    // events/state/diffsを生んだtestRunSnapshotと完全一致することを確認する。
    expect(runSnapshotConfigFingerprint(trackRunSnapshot)).toEqual(runSnapshotConfigFingerprint(testRunSnapshot));

    // replaySnapshotのみtrack-run snapshotへ差し替える(events/destructionState/degradationDiffsは
    // test-run実wrapperが生成した本物の値のまま、内部一貫性を保つ)。
    const outcome: RunOutcome = { ...termination!, replaySnapshot: trackRunSnapshot };

    const { inventory, loadout } = inventoryAndLoadoutWithBody();
    const envelope = envelopeForWithLoadout(outcome, 1, loadout);
    expect(envelope.equipmentSnapshot.context).toBe('vehicle');

    const result = applyRunOutcome(envelope, inventory, new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.newlyDiscoveredModes).toContain('D04');
      expect(result.nextInventory.items.some((item) => item.itemId === envelope.equipmentSnapshot.batteryItemId)).toBe(false);
      const magnet = result.nextInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.magnetItemId);
      expect(magnet?.wearState).toMatchObject({ demagnetizationFraction: 0.15 });
      const body = result.nextInventory.bodyParts.find((b) => b.assemblyId === envelope.equipmentSnapshot.bodyAssemblyId);
      expect(body?.scorchFraction).toBe(0.2);
    }
  });

  it('67. motor-only、D07発火(実wrapper、通電電流のI²R蓄積による不可逆減磁): magnetのdemagnetizationDeltaFractionがapplyRunOutcomeで正しく反映される(termination===nullのまま非終端で進行、rotor collapse等と混同しない)', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig: goodMotorConfig(),
      destructionConfig: goodLipoDestructionConfig({
        d07: {
          thermal: { conductionCoefficient: 1, dissipationCoefficient: 1e-6 },
          irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.05, reversibleDroopThreshold: 0.02, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 },
        },
      }),
      runContext: fireExposedMotorRunContext(),
      initialDestructionState: createInitialDestructionState('lipo'),
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let motorState: SimState = { ...initialSimState(), theta: 0.01, omega: 50 }; // 通常通電(shortedではない)
    let sawD07 = false;

    for (let i = 0; i < 60 && !sawD07; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull(); // D07は終端候補に分類されない
      sawD07 = accumulator.events.some((e) => e.mode === 'D07');
    }
    expect(sawD07).toBe(true);

    const outcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(outcome.degradationDiffs).toContainEqual({ role: 'magnet', kind: 'demagnetization', deltaFraction: 0.1 });

    const envelope = envelopeFor(outcome, 1);
    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const magnet = result.nextInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.magnetItemId);
      expect(magnet?.wearState).toMatchObject({ demagnetizationFraction: 0.1 });
    }
  });

  it('68. test-run、D07発火(実wrapper stepTestRunWithDestruction、通電電流のI²R蓄積による不可逆減磁): magnetのdemagnetizationDeltaFractionがapplyRunOutcomeで正しく反映される', () => {
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({
      destructionConfig: goodLipoDestructionConfig({
        d07: {
          thermal: { conductionCoefficient: 1, dissipationCoefficient: 1e-6 },
          irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.05, reversibleDroopThreshold: 0.02, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 },
        },
      }),
      runContext: fireExposedVehicleRunContext(),
      initialDestructionState: createInitialDestructionState('lipo'),
      track: null,
      courseLengthM: 10,
      slopeRad: 0,
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let vehicleState: VehicleSimState = snapshot.initialVehicleState!;
    let sawD07 = false;

    for (let i = 0; i < 120 && !sawD07; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull();
      sawD07 = accumulator.events.some((e) => e.mode === 'D07');
    }
    expect(sawD07).toBe(true);

    const outcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(outcome.degradationDiffs).toContainEqual({ role: 'magnet', kind: 'demagnetization', deltaFraction: 0.1 });

    const envelope = envelopeFor(outcome, 1);
    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const magnet = result.nextInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.magnetItemId);
      expect(magnet?.wearState).toMatchObject({ demagnetizationFraction: 0.1 });
    }
  });

  it('68b. track-run、D07(実wrapperで生成した一貫RunOutcomeのevents/state/diffsをそのまま使い、replaySnapshotだけ有効なtrack-run snapshotへ置換。66番と同型の扱い、Suu_mot3ゲート7レビューP2是正): magnetのdemagnetizationDeltaFractionが単一呼び出しでapplyRunOutcomeへ反映され、newlyDiscoveredModesにD07が入る。stepTestRunWithDestructionはtrack-run accumulatorへは一切呼ばれないことを構築それ自体で示す(§10.4)', () => {
    // Suu_mot3ゲート7レビューP2是正: 「D04/D07を3文脈で統合検証」と主張しながら実際は
    // D07がmotor/testの2文脈のみでtrack-runが欠落していた。66番と同一の手法(実wrapperで
    // 内部一貫性のあるRunOutcomeを生成し、replaySnapshotだけtrack-run snapshotへ差し替える)
    // で、D07のtrack-run文脈を追加する。
    // Suu_mot3ゲート7是正レビュー2 R1/R2是正: 両snapshotへ同一のmotorConfig/destructionConfig/
    // runContextを使い(R1)、runContext.fireExposureProfile.bodyEquipped=trueと整合する
    // body装備済みloadoutからequipment snapshotを捕捉する(R2、bodyEquippedとbodyAssemblyIdの
    // 不一致はequipment snapshotから導出されるrunContextという契約上production構築不能なため)。
    const sharedMotorConfig = goodMotorConfig();
    const sharedDestructionConfig = goodLipoDestructionConfig({
      d07: {
        thermal: { conductionCoefficient: 1, dissipationCoefficient: 1e-6 },
        irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.05, reversibleDroopThreshold: 0.02, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 },
      },
    });
    const sharedRunContext = fireExposedVehicleRunContext();

    const testRunSnapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: sharedMotorConfig,
      destructionConfig: sharedDestructionConfig,
      runContext: sharedRunContext,
      initialDestructionState: createInitialDestructionState('lipo'),
      track: null,
      courseLengthM: 10,
      slopeRad: 0,
    }));
    let accumulator: RunAccumulator = createRunAccumulator(testRunSnapshot);
    let vehicleState: VehicleSimState = testRunSnapshot.initialVehicleState!;
    let sawD07 = false;
    for (let i = 0; i < 120 && !sawD07; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull();
      sawD07 = accumulator.events.some((e) => e.mode === 'D07');
    }
    expect(sawD07).toBe(true);

    const realOutcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(realOutcome.degradationDiffs).toContainEqual({ role: 'magnet', kind: 'demagnetization', deltaFraction: 0.1 });
    expect(realOutcome.events.some((e) => e.mode === 'D07')).toBe(true);

    const trackRunSnapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: sharedMotorConfig,
      destructionConfig: sharedDestructionConfig,
      runContext: sharedRunContext,
      initialDestructionState: createInitialDestructionState('lipo'),
      track: goodTrack(),
      courseLengthM: null,
      slopeRad: null,
    }));
    const restored = restoreRunSnapshot(JSON.parse(JSON.stringify(trackRunSnapshot)));
    expect(restored.ok).toBe(true);
    expect(trackRunSnapshot.track).not.toBeNull();
    expect(runSnapshotConfigFingerprint(trackRunSnapshot)).toEqual(runSnapshotConfigFingerprint(testRunSnapshot));

    const outcome: RunOutcome = { ...realOutcome, replaySnapshot: trackRunSnapshot };
    // R2是正: bodyEquipped:trueなrunContextと整合するよう、body装備済みloadoutからsnapshotを捕捉する。
    const { inventory, loadout } = inventoryAndLoadoutWithBody();
    const envelope = envelopeForWithLoadout(outcome, 1, loadout);
    const result = applyRunOutcome(envelope, inventory, new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.newlyDiscoveredModes).toContain('D07');
      const magnet = result.nextInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.magnetItemId);
      expect(magnet?.wearState).toMatchObject({ demagnetizationFraction: 0.1 });
      // D07はbody/battery diffsを一切生成しないため、body個体は不変のままであることも確認する。
      const body = result.nextInventory.bodyParts.find((b) => b.assemblyId === envelope.equipmentSnapshot.bodyAssemblyId);
      expect(body?.scorchFraction).toBe(0);
      expect(result.nextInventory.items.some((item) => item.itemId === envelope.equipmentSnapshot.batteryItemId)).toBe(true);
    }
  });

  it('69. runSequence冪等性(§10.3): D04由来のdegradationDiffsを含むenvelopeを同一runSequenceで2回適用すると、2回目はapplied:falseでスキップされ、劣化が二重適用されない', () => {
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig: goodMotorConfig({ slitWidthMm: 0 }),
      destructionConfig: goodLipoDestructionConfig(),
      runContext: fireExposedMotorRunContext(),
      initialDestructionState: createInitialDestructionState('lipo'),
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let motorState: SimState = initialSimState();
    let termination: RunOutcome | null = null;
    for (let i = 0; i < 60 && termination === null; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();

    const envelope = envelopeFor(termination!, 1);

    const first = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.result.applied).toBe(true);
    const magnetAfterFirst = first.nextInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.magnetItemId);
    expect(magnetAfterFirst?.wearState).toMatchObject({ demagnetizationFraction: 0.15 });

    // 同一envelope・同一runSequence(1)を、1回目の適用後のnextInventory/nextSaveMetaへ再送する
    // (lastAppliedRunSequenceが1へ進んでいるため、5.2節の分岐によりok:true・applied:falseで
    // スキップされるはず)。
    const second = applyRunOutcome(envelope, first.nextInventory, first.nextDiscoveredModes, first.nextSaveMeta);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.result.applied).toBe(false);
    expect(second.result.resolvedDegradations).toEqual([]);
    const magnetAfterSecond = second.nextInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.magnetItemId);
    expect(magnetAfterSecond?.wearState).toMatchObject({ demagnetizationFraction: 0.15 }); // 二重適用されていない(0.30ではない)
  });

  it('70. 原子性(§10.3、D04複合diff負例、Suu_mot3ゲート7レビューP3是正): body未装備の状態でbattery consumed+magnet scorch+body scorchを含むD04 RunOutcomeを適用しようとするとmissingEquipment(role:body)で失敗し、入力inventoryが一切変異しない(検証→適用の2段階原則がD04複合diffでも守られる)', () => {
    // 既存の汎用原子性テスト(#31、戻りエラーのみをassertするもの)はD04固有の複合diff
    // (battery+magnet+body)では代替にならないというご指摘どおり、D04実wrapperが生成した
    // 本物の複合diffを使い、かつ入力inventoryオブジェクト自体の非変異を直接確認する。
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: goodMotorConfig({ slitWidthMm: 0 }), // 持続短絡
      destructionConfig: goodLipoDestructionConfig(),
      runContext: fireExposedVehicleRunContext(),
      initialDestructionState: createInitialDestructionState('lipo'),
      track: null,
      courseLengthM: 10,
      slopeRad: 0,
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let vehicleState: VehicleSimState = snapshot.initialVehicleState!;
    let termination: RunOutcome | null = null;
    for (let i = 0; i < 60 && termination === null; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();
    expect(termination!.degradationDiffs).toContainEqual({ role: 'battery', kind: 'consumed' });
    expect(termination!.degradationDiffs).toContainEqual({ role: 'body', kind: 'scorch', deltaFraction: 0.2 });
    expect(termination!.degradationDiffs).toContainEqual({ role: 'magnet', kind: 'scorch', deltaFraction: 0.15 });

    // Suu_mot3ゲート7是正レビュー2 R3是正: このoutcomeのrunContext.fireExposureProfile.
    // bodyEquipped=trueはbody装備済みloadoutから捕捉したequipment snapshotとのみ整合する
    // (bodyAssemblyId:nullのbase loadoutを使うとrunContextとequipment snapshotが食い違い、
    // beginRun時点から自己矛盾したproduction構築不能な状態になってしまう)。正当な
    // missingEquipment負例は「run開始時にはbodyが装備されていたが、適用時のinventoryでは
    // 当該body個体が欠落している」(走行後・適用前にbodyを売却/分解した等)という状況であるべき
    // なので、body装備済みloadoutからsnapshotを捕捉したうえで、適用時のinputInventoryからのみ
    // 当該body個体を除去する。
    const { inventory: inventoryWithBody, loadout: loadoutWithBody } = inventoryAndLoadoutWithBody();
    const envelope = envelopeForWithLoadout(termination!, 1, loadoutWithBody);
    expect(envelope.equipmentSnapshot.bodyAssemblyId).toBe(loadoutWithBody.bodyAssemblyId); // 前提: run開始時点ではbody装備済み

    const inputInventory: PlayerInventory = {
      ...inventoryWithBody,
      bodyParts: inventoryWithBody.bodyParts.filter((b) => b.assemblyId !== envelope.equipmentSnapshot.bodyAssemblyId),
    };
    const inputInventorySnapshotForComparison: PlayerInventory = JSON.parse(JSON.stringify(inputInventory));

    const result = applyRunOutcome(envelope, inputInventory, new Set(), goodSaveMeta());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'missingEquipment', role: 'body' });
    }

    // 入力inventoryオブジェクト自体が一切変異していないこと(部分適用の禁止)。deep equalで
    // 全体を確認したうえで、batteryが消えていない・magnetが変化していないことを個別にも確認する。
    expect(inputInventory).toEqual(inputInventorySnapshotForComparison);
    expect(inputInventory.items.some((item) => item.itemId === envelope.equipmentSnapshot.batteryItemId)).toBe(true);
    const magnet = inputInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.magnetItemId);
    const magnetBefore = inputInventorySnapshotForComparison.items.find((item) => item.itemId === envelope.equipmentSnapshot.magnetItemId);
    expect(magnet?.wearState).toEqual(magnetBefore?.wearState);
  });



  // 71〜80. P3-3ゲート6(docs/phase3-p3-3-plan.md §13.2、Suu_mot3承認6条件、2026-08-11)。
  // Suu_mot3独立レビューP60/P61/P62/P63是正を反映済み: 較正値そのものを緩めるのではなく、
  // 確定較正値(docs/phase3-p3-3-plan.md 13.1.3節、正式Fable最終レビュー2026-08-10)を
  // そのまま使い、トリガの到達可否はmotor/car/course/初期動的状態/実行時間/rngの探索のみで
  // 解決する(P60-1是正)。さらにP63是正により、#71〜78すべてのMotorConfig/CarConfigは
  // `composeConfigFromMaterials`(正式素材写像パイプライン)を一度通した結果を出発点にし、
  // player-adjustable値のみをその上で変更する構成へ統一した(「一部だけ正式写像」を禁止)。
  // D01/D02/D05劣化の3文脈(motor-only/test-run/track-run)原子的適用+原子性負例2件。
  // store層(runOutcomeApplication.ts・saveStore.ts・degradationApplication.ts)はP3-0で
  // 全モード汎用対応済みのため、ここでは実wrapperが生成した本物のD01/D02/D05由来
  // degradationDiffsが単一呼び出しでapplyRunOutcomeへ正しく反映されることのみを検証する
  // (新規productionコードなし、条件5)。track-run(#72/#75/#78)は66番/68b番と同型(実test-run
  // wrapperが生成した一貫RunOutcomeのreplaySnapshotのみ有効なtrack-run snapshotへ差し替え、
  // 条件1)。P63是正: track-run対を構築する際はVehicleSimStateを`createInitialVehicleState`で
  // 1回だけ生成し、test-run/track-run両snapshotのinitialMotorState/initialVehicleStateとして
  // 同一オブジェクトを共有する(2回individually呼び出さない)。

  function makeDeterministicRng(seed: number) {
    // src/materials/__tests__/materialMapping.test.tsの付帯条件3(checkpoint5較正レビュー、
    // 2026-08-10)で確立した決定論的PRNG(mulberry32相当)と同一パターン。D05はbrushPressureに
    // 応じた確率的チャタリングに依存するため、rngを固定しないとテストが非決定的になる。
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Suu_mot3ゲート6レビューP62/P63是正: materialMapping.test.tsのpvMotorCarと同型の
  // production-valid fixture builder(P56是正で確立済みの既存パターンをGate6へ横展開)。
  // composeConfigFromMaterialsの実出力を出発点にし、motorOverrides/carOverridesには
  // player-adjustable値だけを渡すfail-closed許可リスト方式。MaterialSelectionを明示入力
  // できる汎用版とし、Gate6の#71〜78すべてがこの関数を経由する(P63要求1)。
  const GATE6_MATERIAL_BASELINE: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 0.8 };
  function pvMotorCarGate6(
    selection: MaterialSelection,
    motorOverrides: Partial<Pick<MotorConfig, 'coilTurns' | 'magnetDistanceMm' | 'brushPressure' | 'slitWidthMm' | 'wireGaugeMm' | 'parallelStrands' | 'varnished'>> = {},
    carOverrides: Partial<Pick<CarConfig, 'gearRatio' | 'tireGrip' | 'axleFriction'>> = {},
  ): { motorConfig: MotorConfig; carConfig: CarConfig } {
    const baseMotor: MotorConfig = { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 0.5, magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.4, parallelStrands: 1, varnished: true, ...motorOverrides };
    const baseCar: CarConfig = { massG: 150, gearEfficiency: 0.8, gearRatio: 4, wheelDiameterMm: 30, tireGrip: 0.7, axleFriction: 0, wheelAlignmentMm: 0, centerOfMassHeightMm: 20, motorMountOffsetMm: 0, ...carOverrides };
    const result = composeConfigFromMaterials(baseMotor, baseCar, GATE6_MATERIAL_BASELINE, selection);
    if (!result.ok) throw new Error(`テスト前提が崩れています: composeConfigFromMaterials失敗(${result.reason})`);
    return { motorConfig: result.motorConfig, carConfig: result.carConfig };
  }

  // 確定較正値(P60-1是正)。docs/phase3-p3-3-plan.md 13.1.3節「全較正値の確定申請表」、
  // 正式Fable最終レビュー(2026-08-10)により確定。d02はDestructionConfig自体の較正値
  // (素材写像の対象外)のためリテラルのまま保持する。d05・d07は素材選択と対応する実関数
  // (mapD05BrushWearConfig/assembleD05Config・mapD07DestructionConfig)から導出し、
  // 「同じ素材事実を二経路から手入力する穴」(P63是正2・3)を構造的に防ぐ。
  function confirmedD02(): DestructionConfig['d02'] {
    return { smokeGaugeThreshold: 0.6, coilOverheatGaugeLimit: 1, conductionScale: 0.04, dissipationCoefficient: 0.5, smokeResistanceMultiplier: 1.2 };
  }
  function d05CommonPart() {
    return { brushSparkDurationLimitS: 0.15, brushSparkCurrentThresholdA: 3, wearPerAmpSecond: 0.001, recoveryFrames: 6, recoveryContactResistanceMultiplier: 1.2 };
  }
  // Gate6の3モードすべてで共有するdestructionConfig構築(P63是正7: 監査可能性のため、
  // magnetId/brushIdをテスト側で明示的に選択し、対応するd07/d05をそこから導出する経路を
  // 一箇所に集約する)。
  function gate6DestructionConfig(magnetId: MaterialSelection['magnetId'], brushId: MaterialSelection['brushId'], shortCircuitDurationLimitS: number): DestructionConfig {
    return {
      battery: { profile: 'nonLipo', shortCircuitDurationLimitS },
      d01: { decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5 },
      d02: confirmedD02(),
      d04: { bodyScorchDeltaFraction: 0.2, magnetScorchDeltaFraction: 0.15 },
      d05: assembleD05Config(mapD05BrushWearConfig(brushId), d05CommonPart()),
      d06: { breakage: { kind: 'breakable', gearStrengthThresholdNm: 0.5 }, toothFatigueExposureNmS: 0.5 },
      d07: mapD07DestructionConfig(magnetId),
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

  // D01(非終端)がCOIL_DEFORM_OMEGA(2000RPM相当)を360フレーム連続で超えるための構成。
  // 素材選択: battery-nickel-metal-hydride(nonLipo)・magnet-samarium-cobalt(実在
  // nonDemagnetizing磁石、strength=0.65)・wire-silver・gear-titanium・brush-precious-metal。
  // magnetIdがnonDemagnetizingなため、gate6DestructionConfigが導出するd07は自動的に
  // {kind:'nonDemagnetizing'}になり(mapD07DestructionConfig)、motorConfigの磁石強度と
  // d07分岐が同一素材事実から一致する(P63是正2: neodymium motorConfigとnonDemagnetizing
  // configの混在を禁止する指示への対応)。player-adjustable値(coilTurns・wireGaugeMm・
  // parallelStrands・gearRatio)の調整のみで到達し、この構成でD02/D07が先着しないことを実測
  // 済み(magnetDistanceMmは既定10のまま)。
  const D01_MATERIAL_SELECTION: MaterialSelection = {
    wireId: 'wire-silver', magnetId: 'magnet-samarium-cobalt', gearId: 'gear-titanium',
    batteryId: 'battery-nickel-metal-hydride', brushId: 'brush-precious-metal',
  };
  function d01TriggerConfigs() {
    const { motorConfig, carConfig } = pvMotorCarGate6(
      D01_MATERIAL_SELECTION,
      { varnished: false, coilTurns: 50, wireGaugeMm: 0.8, parallelStrands: 2 },
      { gearRatio: 4, axleFriction: 0 },
    );
    const destructionConfig = gate6DestructionConfig(D01_MATERIAL_SELECTION.magnetId, D01_MATERIAL_SELECTION.brushId, 2);
    return { motorConfig, carConfig, destructionConfig };
  }

  it('71. test-run、D01発火(実wrapper stepTestRunWithDestruction、非終端、正式素材写像〈NiMH+samarium-cobalt+silver+precious-metal+titanium〉+確定較正値0.04/0.5/1.2): rotor collapse diffが単一呼び出しでapplyRunOutcomeへ反映され、newlyDiscoveredModesにD01が入る', () => {
    const { motorConfig, carConfig, destructionConfig } = d01TriggerConfigs();
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({ motorConfig, carConfig, destructionConfig, courseLengthM: 3000 }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let vehicleState: VehicleSimState = snapshot.initialVehicleState!;
    let sawD01 = false;
    for (let i = 0; i < 700 && !sawD01; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull(); // D01は非終端。この構成でD02/D07/D03条件は満たされない
      sawD01 = accumulator.events.some((e) => e.mode === 'D01');
    }
    expect(sawD01).toBe(true);

    const outcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(outcome.endReason).toBe('manualAbort');
    expect(outcome.degradationDiffs).toContainEqual({ role: 'rotor', kind: 'collapse' });

    const envelope = envelopeFor(outcome, 1);
    expect(envelope.equipmentSnapshot.context).toBe('vehicle');
    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rotor = result.nextInventory.rotorAssemblies.find((r) => r.assemblyId === envelope.equipmentSnapshot.rotorAssemblyId);
      expect(rotor?.collapsed).toBe(true);
      expect(result.result.newlyDiscoveredModes).toContain('D01');
    }
  });

  it('72. track-run、D01(実wrapperで生成した一貫RunOutcomeのevents/state/diffsをそのまま使い、replaySnapshotだけ有効なtrack-run snapshotへ置換、66番/68b番と同型): rotor collapse diffが単一呼び出しでapplyRunOutcomeへ反映され、newlyDiscoveredModesにD01が入る。stepTestRunWithDestructionはtrack-run accumulatorへは一切呼ばれないことを構築それ自体で示す(§10.4)。VehicleSimStateは1回だけ生成しtest-run/track-run両snapshotで共有する(P63是正6)', () => {
    const { motorConfig: sharedMotorConfig, carConfig: sharedCarConfig, destructionConfig: sharedDestructionConfig } = d01TriggerConfigs();
    const sharedRunContext = vehicleRunContext();
    const sharedVehicleState = createInitialVehicleState(sharedMotorConfig, sharedCarConfig);

    const testRunSnapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: sharedMotorConfig, carConfig: sharedCarConfig, destructionConfig: sharedDestructionConfig, runContext: sharedRunContext,
      initialMotorState: sharedVehicleState.motor, initialVehicleState: sharedVehicleState,
      track: null, courseLengthM: 3000, slopeRad: 0,
    }));
    let accumulator: RunAccumulator = createRunAccumulator(testRunSnapshot);
    let vehicleState: VehicleSimState = testRunSnapshot.initialVehicleState!;
    let sawD01 = false;
    for (let i = 0; i < 700 && !sawD01; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull();
      sawD01 = accumulator.events.some((e) => e.mode === 'D01');
    }
    expect(sawD01).toBe(true);

    const realOutcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(realOutcome.degradationDiffs).toContainEqual({ role: 'rotor', kind: 'collapse' });
    expect(realOutcome.events.some((e) => e.mode === 'D01')).toBe(true); // 発見経路(computeNewlyDiscoveredModes)がevents由来であることの前提確認

    const trackRunSnapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: sharedMotorConfig, carConfig: sharedCarConfig, destructionConfig: sharedDestructionConfig, runContext: sharedRunContext,
      initialMotorState: sharedVehicleState.motor, initialVehicleState: sharedVehicleState,
      track: goodTrack(), courseLengthM: null, slopeRad: null,
    }));
    const restored = restoreRunSnapshot(JSON.parse(JSON.stringify(trackRunSnapshot)));
    expect(restored.ok).toBe(true); // 差し替え先が実際に有効なtrack-run RunSnapshotであることを確認
    expect(trackRunSnapshot.track).not.toBeNull();
    expect(runSnapshotConfigFingerprint(trackRunSnapshot)).toEqual(runSnapshotConfigFingerprint(testRunSnapshot));

    // replaySnapshotのみtrack-run snapshotへ差し替える(events/destructionState/degradationDiffsは
    // test-run実wrapperが生成した本物の値のまま、内部一貫性を保つ)。
    const outcome: RunOutcome = { ...realOutcome, replaySnapshot: trackRunSnapshot };
    const envelope = envelopeFor(outcome, 1);
    expect(envelope.equipmentSnapshot.context).toBe('vehicle');

    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.newlyDiscoveredModes).toContain('D01');
      const rotor = result.nextInventory.rotorAssemblies.find((r) => r.assemblyId === envelope.equipmentSnapshot.rotorAssemblyId);
      expect(rotor?.collapsed).toBe(true);
    }
  });

  // D02(終端)発火用の素材選択(motor-only/test-run/track-run共通、P63是正1): battery-
  // nickel-metal-hydride(nonLipo、ratio=0.3)・magnet-neodymium(実在最大0.9)・wire-silver・
  // gear-titanium・brush-precious-metal(接触抵抗ratio=0.5)。gate6DestructionConfigが
  // magnetIdからmapD07DestructionConfigを導出するため、d07はneodymiumの実在demagnetizing
  // 分岐になる(nonDemagnetizingとの混在なし)。
  const D02_MATERIAL_SELECTION: MaterialSelection = {
    wireId: 'wire-silver', magnetId: 'magnet-neodymium', gearId: 'gear-titanium',
    batteryId: 'battery-nickel-metal-hydride', brushId: 'brush-precious-metal',
  };
  function d02MotorOnlyConfigs() {
    const { motorConfig } = pvMotorCarGate6(D02_MATERIAL_SELECTION, { coilTurns: 80 });
    const destructionConfig = gate6DestructionConfig(D02_MATERIAL_SELECTION.magnetId, D02_MATERIAL_SELECTION.brushId, 2);
    return { motorConfig, destructionConfig };
  }
  function d02MotorOnlyLoadTorque() {
    return 0.05;
  }
  function d02VehicleConfigs() {
    const { motorConfig, carConfig } = pvMotorCarGate6(
      D02_MATERIAL_SELECTION,
      { coilTurns: 20, magnetDistanceMm: 2 },
      { gearRatio: 1, axleFriction: 0 },
    );
    const destructionConfig = gate6DestructionConfig(D02_MATERIAL_SELECTION.magnetId, D02_MATERIAL_SELECTION.brushId, 2);
    return { motorConfig, carConfig, destructionConfig };
  }

  it('73. motor-only、D02発火(実wrapper、正式素材写像〈NiMH+neodymium+silver+precious-metal+titanium〉+確定較正値0.04/0.5/1.2、外部負荷トルクによる近stall高電流〈モーター単体ベンチ試験、motor/初期動的状態の探索範囲〉): rotor burnout diffが単一呼び出しでapplyRunOutcomeへ反映され、newlyDiscoveredModesにD02が入る。同一過負荷でD07(magnet demagnetization)も物理的に相関して発火しうるが、D02はterminalModesの一員として明確に区別できることを直接assertする', () => {
    const { motorConfig, destructionConfig } = d02MotorOnlyConfigs();
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig, destructionConfig, initialMotorState: initialSimState({ theta: 0.5, omega: 5 }),
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let motorState: SimState = snapshot.initialMotorState!;
    let termination: RunOutcome | null = null;
    for (let i = 0; i < 300 && termination === null; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120, undefined, d02MotorOnlyLoadTorque());
      motorState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    if (termination!.endReason === 'destructionTerminal') expect(termination!.terminalModes).toContain('D02');
    expect(termination!.events.some((e) => e.mode === 'D02')).toBe(true); // Suu_mot3ゲート6レビューP60-3是正: 適用前の実event直接assert
    expect(termination!.degradationDiffs).toContainEqual({ role: 'rotor', kind: 'burnout' });

    const envelope = envelopeFor(termination!, 1);
    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rotor = result.nextInventory.rotorAssemblies.find((r) => r.assemblyId === envelope.equipmentSnapshot.rotorAssemblyId);
      expect(rotor?.burnedOut).toBe(true);
      expect(result.result.newlyDiscoveredModes).toContain('D02');
    }
  });

  it('74. test-run、D02発火(実wrapper stepTestRunWithDestruction、正式素材写像〈NiMH+neodymium+silver+precious-metal+titanium〉+確定較正値0.04/0.5/1.2、player-adjustable値〈magnetDistanceMm=2・coilTurns=20・gearRatio=1〉による登坂高電流): rotor burnout diffが単一呼び出しでapplyRunOutcomeへ反映され、newlyDiscoveredModesにD02が入る', () => {
    const { motorConfig, carConfig, destructionConfig } = d02VehicleConfigs();
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig, carConfig, destructionConfig, courseLengthM: 1000, slopeRad: 0.3,
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let vehicleState: VehicleSimState = snapshot.initialVehicleState!;
    let termination: RunOutcome | null = null;
    for (let i = 0; i < 2000 && termination === null; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    if (termination!.endReason === 'destructionTerminal') expect(termination!.terminalModes).toContain('D02');
    expect(termination!.events.some((e) => e.mode === 'D02')).toBe(true);
    expect(termination!.degradationDiffs).toContainEqual({ role: 'rotor', kind: 'burnout' });
    expect(vehicleState.motor.batteryHeat).toBeLessThan(1); // 空虚な一致を禁止する: 電池側熱制約が先着していないことを確認

    const envelope = envelopeFor(termination!, 1);
    expect(envelope.equipmentSnapshot.context).toBe('vehicle');
    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rotor = result.nextInventory.rotorAssemblies.find((r) => r.assemblyId === envelope.equipmentSnapshot.rotorAssemblyId);
      expect(rotor?.burnedOut).toBe(true);
      expect(result.result.newlyDiscoveredModes).toContain('D02');
    }
  });

  it('75. track-run、D02(実wrapperで生成した一貫RunOutcomeのevents/state/diffsをそのまま使い、replaySnapshotだけ有効なtrack-run snapshotへ置換、66番/68b番と同型): rotor burnout diffが単一呼び出しでapplyRunOutcomeへ反映され、newlyDiscoveredModesにD02が入る。stepTestRunWithDestructionはtrack-run accumulatorへは一切呼ばれないことを構築それ自体で示す(§10.4)。VehicleSimStateは1回だけ生成しtest-run/track-run両snapshotで共有する(P63是正6)', () => {
    const { motorConfig: sharedMotorConfig, carConfig: sharedCarConfig, destructionConfig: sharedDestructionConfig } = d02VehicleConfigs();
    const sharedRunContext = vehicleRunContext();
    const sharedVehicleState = createInitialVehicleState(sharedMotorConfig, sharedCarConfig);

    const testRunSnapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: sharedMotorConfig, carConfig: sharedCarConfig, destructionConfig: sharedDestructionConfig, runContext: sharedRunContext,
      initialMotorState: sharedVehicleState.motor, initialVehicleState: sharedVehicleState,
      track: null, courseLengthM: 1000, slopeRad: 0.3,
    }));
    let accumulator: RunAccumulator = createRunAccumulator(testRunSnapshot);
    let vehicleState: VehicleSimState = testRunSnapshot.initialVehicleState!;
    let termination: RunOutcome | null = null;
    for (let i = 0; i < 2000 && termination === null; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();
    expect(termination!.endReason).toBe('destructionTerminal');
    if (termination!.endReason === 'destructionTerminal') expect(termination!.terminalModes).toContain('D02');
    expect(termination!.events.some((e) => e.mode === 'D02')).toBe(true);

    const trackRunSnapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: sharedMotorConfig, carConfig: sharedCarConfig, destructionConfig: sharedDestructionConfig, runContext: sharedRunContext,
      initialMotorState: sharedVehicleState.motor, initialVehicleState: sharedVehicleState,
      track: goodTrack(), courseLengthM: null, slopeRad: null,
    }));
    const restored = restoreRunSnapshot(JSON.parse(JSON.stringify(trackRunSnapshot)));
    expect(restored.ok).toBe(true);
    expect(trackRunSnapshot.track).not.toBeNull();
    expect(runSnapshotConfigFingerprint(trackRunSnapshot)).toEqual(runSnapshotConfigFingerprint(testRunSnapshot));

    const outcome: RunOutcome = { ...termination!, replaySnapshot: trackRunSnapshot };
    const envelope = envelopeFor(outcome, 1);
    expect(envelope.equipmentSnapshot.context).toBe('vehicle');

    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.newlyDiscoveredModes).toContain('D02');
      const rotor = result.nextInventory.rotorAssemblies.find((r) => r.assemblyId === envelope.equipmentSnapshot.rotorAssemblyId);
      expect(rotor?.burnedOut).toBe(true);
    }
  });

  // D05(非終端)発火用の素材選択(motor-only/test-run/track-run共通): battery-nickel-metal-
  // hydride(nonLipo)・magnet-neodymium・wire-silver・gear-titanium・**brush-carbon**
  // (anchor)。d05はgate6DestructionConfigがmapD05BrushWearConfig('brush-carbon')→
  // assembleD05Configで導出する実写像値(brushWearRateRatio=1・highCurrentPenalty:
  // {kind:'noPenalty'})であり、リテラル複製ではない(P63是正3)。coilTurns/wireGaugeMm/
  // parallelStrands(motor探索)でtheoreticalCurrentAがbrushSparkCurrentThresholdA=3Aを
  // 超えるまでR_coilを下げる。この構成ではD07(magnet demagnetization、neodymiumの実在
  // demagnetizing分岐)も過負荷の相関効果として発火しうるが非終端であり、D05固有のassert
  // (event直接確認・cumulativeWearDeltaFraction>0)を妨げない。
  const D05_MATERIAL_SELECTION: MaterialSelection = {
    wireId: 'wire-silver', magnetId: 'magnet-neodymium', gearId: 'gear-titanium',
    batteryId: 'battery-nickel-metal-hydride', brushId: 'brush-carbon',
  };
  function d05MotorOnlyConfigs() {
    const { motorConfig } = pvMotorCarGate6(D05_MATERIAL_SELECTION, { brushPressure: 0.05, wireGaugeMm: 0.8, parallelStrands: 2, coilTurns: 25 });
    const destructionConfig = gate6DestructionConfig(D05_MATERIAL_SELECTION.magnetId, D05_MATERIAL_SELECTION.brushId, 2);
    return { motorConfig, destructionConfig };
  }
  function d05VehicleConfigs() {
    const { motorConfig, carConfig } = pvMotorCarGate6(D05_MATERIAL_SELECTION, { brushPressure: 0.05, wireGaugeMm: 0.8, parallelStrands: 2, coilTurns: 25 });
    const destructionConfig = gate6DestructionConfig(D05_MATERIAL_SELECTION.magnetId, D05_MATERIAL_SELECTION.brushId, 2);
    return { motorConfig, carConfig, destructionConfig };
  }

  it('76. motor-only、D05発火(実wrapper、正式素材写像〈NiMH+neodymium+silver+brush-carbon+titanium〉+確定較正値threshold=3・共通値+brush-carbon実写像値、決定論的rngでチャタリングを固定): brush wear diffが単一呼び出しでapplyRunOutcomeへ反映され、newlyDiscoveredModesにD05が入る。D05はfinal state由来diffのため、event個数からdiff量を手で結び直さず、accumulatorの最終destructionStateから直接検証する', () => {
    const { motorConfig, destructionConfig } = d05MotorOnlyConfigs();
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig, destructionConfig, initialMotorState: initialSimState({ theta: 0.01, omega: 50 }), // デッドゾーン回避(67番と同型)
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let motorState: SimState = snapshot.initialMotorState!;
    const rng = makeDeterministicRng(42);
    let sawD05 = false;
    for (let i = 0; i < 300 && !sawD05; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120, rng);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull(); // D05は終端候補に分類されない(Suu_mot3ゲート6レビューP64是正: D07の相関発火があっても非終端のまま)
      sawD05 = accumulator.events.some((e) => e.mode === 'D05');
    }
    expect(sawD05).toBe(true);
    const finalWearDeltaFraction = accumulator.destructionState.modes.D05.cumulativeWearDeltaFraction;
    expect(finalWearDeltaFraction).toBeGreaterThan(0); // 空虚な一致を禁止する: 実際に摩耗が蓄積していること

    const outcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(outcome.degradationDiffs).toContainEqual({ role: 'brush', kind: 'wear', deltaFraction: finalWearDeltaFraction }); // 手で再計算せず最終stateの値をそのまま比較

    const envelope = envelopeFor(outcome, 1);
    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const brush = result.nextInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.brushItemId);
      expect(brush?.wearState).toMatchObject({ kind: 'brush', wearFraction: finalWearDeltaFraction });
      expect(result.result.newlyDiscoveredModes).toContain('D05');
    }
  });

  it('77. test-run、D05発火(実wrapper stepTestRunWithDestruction、正式素材写像〈NiMH+neodymium+silver+brush-carbon+titanium〉+確定較正値threshold=3・共通値+brush-carbon実写像値、決定論的rngでチャタリングを固定): brush wear diffが単一呼び出しでapplyRunOutcomeへ反映され、newlyDiscoveredModesにD05が入る。D05はfinal state由来diffのため、event個数からdiff量を手で結び直さず、accumulatorの最終destructionStateから直接検証する', () => {
    const { motorConfig, carConfig, destructionConfig } = d05VehicleConfigs();
    const snapshot = captureRunSnapshot(vehicleSnapshotInput({ motorConfig, carConfig, destructionConfig, courseLengthM: 500 }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let vehicleState: VehicleSimState = snapshot.initialVehicleState!;
    const rng = makeDeterministicRng(42);
    let sawD05 = false;
    for (let i = 0; i < 700 && !sawD05; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120, rng);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull(); // D05は終端候補に分類されない(P64是正: D07の相関発火があっても非終端のまま)
      sawD05 = accumulator.events.some((e) => e.mode === 'D05');
    }
    expect(sawD05).toBe(true);
    const finalWearDeltaFraction = accumulator.destructionState.modes.D05.cumulativeWearDeltaFraction;
    expect(finalWearDeltaFraction).toBeGreaterThan(0);

    const outcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(outcome.degradationDiffs).toContainEqual({ role: 'brush', kind: 'wear', deltaFraction: finalWearDeltaFraction });

    const envelope = envelopeFor(outcome, 1);
    expect(envelope.equipmentSnapshot.context).toBe('vehicle');
    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const brush = result.nextInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.brushItemId);
      expect(brush?.wearState).toMatchObject({ kind: 'brush', wearFraction: finalWearDeltaFraction });
      expect(result.result.newlyDiscoveredModes).toContain('D05');
    }
  });

  it('78. track-run、D05(実wrapperで生成した一貫RunOutcomeのevents/state/diffsをそのまま使い、replaySnapshotだけ有効なtrack-run snapshotへ置換、66番/68b番と同型): brush wear diffが単一呼び出しでapplyRunOutcomeへ反映され、newlyDiscoveredModesにD05が入る。stepTestRunWithDestructionはtrack-run accumulatorへは一切呼ばれないことを構築それ自体で示す(§10.4)。D05はfinal state由来diffのため、event個数からdiff量を手で結び直さない。VehicleSimStateは1回だけ生成しtest-run/track-run両snapshotで共有する(P63是正6)', () => {
    const { motorConfig: sharedMotorConfig, carConfig: sharedCarConfig, destructionConfig: sharedDestructionConfig } = d05VehicleConfigs();
    const sharedRunContext = vehicleRunContext();
    const sharedVehicleState = createInitialVehicleState(sharedMotorConfig, sharedCarConfig);

    const testRunSnapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: sharedMotorConfig, carConfig: sharedCarConfig, destructionConfig: sharedDestructionConfig, runContext: sharedRunContext,
      initialMotorState: sharedVehicleState.motor, initialVehicleState: sharedVehicleState,
      track: null, courseLengthM: 500, slopeRad: 0,
    }));
    let accumulator: RunAccumulator = createRunAccumulator(testRunSnapshot);
    let vehicleState: VehicleSimState = testRunSnapshot.initialVehicleState!;
    const rng = makeDeterministicRng(42);
    let sawD05 = false;
    for (let i = 0; i < 700 && !sawD05; i++) {
      const result = stepTestRunWithDestruction(vehicleState, accumulator, 1 / 120, rng);
      vehicleState = result.physicsState;
      accumulator = result.accumulator;
      expect(result.termination).toBeNull(); // D05は終端候補に分類されない(P64是正: D07の相関発火があっても非終端のまま)
      sawD05 = accumulator.events.some((e) => e.mode === 'D05');
    }
    expect(sawD05).toBe(true);
    const finalWearDeltaFraction = accumulator.destructionState.modes.D05.cumulativeWearDeltaFraction;
    expect(finalWearDeltaFraction).toBeGreaterThan(0);

    const realOutcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(realOutcome.degradationDiffs).toContainEqual({ role: 'brush', kind: 'wear', deltaFraction: finalWearDeltaFraction });
    expect(realOutcome.events.some((e) => e.mode === 'D05')).toBe(true);

    const trackRunSnapshot = captureRunSnapshot(vehicleSnapshotInput({
      motorConfig: sharedMotorConfig, carConfig: sharedCarConfig, destructionConfig: sharedDestructionConfig, runContext: sharedRunContext,
      initialMotorState: sharedVehicleState.motor, initialVehicleState: sharedVehicleState,
      track: goodTrack(), courseLengthM: null, slopeRad: null,
    }));
    const restored = restoreRunSnapshot(JSON.parse(JSON.stringify(trackRunSnapshot)));
    expect(restored.ok).toBe(true);
    expect(trackRunSnapshot.track).not.toBeNull();
    expect(runSnapshotConfigFingerprint(trackRunSnapshot)).toEqual(runSnapshotConfigFingerprint(testRunSnapshot));

    const outcome: RunOutcome = { ...realOutcome, replaySnapshot: trackRunSnapshot };
    const envelope = envelopeFor(outcome, 1);
    expect(envelope.equipmentSnapshot.context).toBe('vehicle');

    const result = applyRunOutcome(envelope, baseInventory(), new Set(), goodSaveMeta());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.newlyDiscoveredModes).toContain('D05');
      const brush = result.nextInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.brushItemId);
      expect(brush?.wearState).toMatchObject({ kind: 'brush', wearFraction: finalWearDeltaFraction });
    }
  });

  it('79. 原子性(§10.3、D02負例、ゲート6、70番のbody除去と同型手法をrotorへ転用、73番と同一構築関数を使用〈P63是正5〉): rotor未装備(run後・適用前に売却/分解した想定)の状態でrotor burnout diffを含むD02 RunOutcomeを適用しようとするとmissingEquipment(role:rotor)で失敗し、入力inventoryが一切変異しない', () => {
    const { motorConfig, destructionConfig } = d02MotorOnlyConfigs();
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig, destructionConfig, initialMotorState: initialSimState({ theta: 0.5, omega: 5 }),
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let motorState: SimState = snapshot.initialMotorState!;
    let termination: RunOutcome | null = null;
    for (let i = 0; i < 300 && termination === null; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120, undefined, d02MotorOnlyLoadTorque());
      motorState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    expect(termination).not.toBeNull();
    expect(termination!.degradationDiffs).toContainEqual({ role: 'rotor', kind: 'burnout' });

    const envelope = envelopeFor(termination!, 1);
    expect(envelope.equipmentSnapshot.rotorAssemblyId).toBe(baseLoadout().rotorAssemblyId); // 前提: run開始時点ではrotor装備済み

    const preApplyInventory = baseInventory();
    const inputInventory: PlayerInventory = {
      ...preApplyInventory,
      rotorAssemblies: preApplyInventory.rotorAssemblies.filter((r) => r.assemblyId !== envelope.equipmentSnapshot.rotorAssemblyId),
    };
    const inputInventorySnapshotForComparison: PlayerInventory = JSON.parse(JSON.stringify(inputInventory));

    const result = applyRunOutcome(envelope, inputInventory, new Set(), goodSaveMeta());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'missingEquipment', role: 'rotor' });
    }

    // 入力inventoryオブジェクト自体が一切変異していないこと(部分適用の禁止)。deep equalで
    // 全体を確認したうえで、battery/brush/magnetが変化していないことを個別にも確認する(70番と同型)。
    expect(inputInventory).toEqual(inputInventorySnapshotForComparison);
    expect(inputInventory.items.some((item) => item.itemId === envelope.equipmentSnapshot.batteryItemId)).toBe(true);
    const brush = inputInventory.items.find((item) => item.itemId === envelope.equipmentSnapshot.brushItemId);
    const brushBefore = inputInventorySnapshotForComparison.items.find((item) => item.itemId === envelope.equipmentSnapshot.brushItemId);
    expect(brush?.wearState).toEqual(brushBefore?.wearState);
  });

  it('80. 原子性(§10.3、D05負例、ゲート6、70番のbody除去と同型手法をbrushへ転用、76番と同一構築関数を使用〈P63是正5〉): brush未装備(run後・適用前に売却/分解した想定)の状態でbrush wear diffを含むD05 RunOutcomeを適用しようとするとmissingEquipment(role:brush)で失敗し、入力inventoryが一切変異しない', () => {
    const { motorConfig, destructionConfig } = d05MotorOnlyConfigs();
    const snapshot = captureRunSnapshot(motorSnapshotInput({
      motorConfig, destructionConfig, initialMotorState: initialSimState({ theta: 0.01, omega: 50 }),
    }));
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let motorState: SimState = snapshot.initialMotorState!;
    const rng = makeDeterministicRng(42);
    let sawD05 = false;
    for (let i = 0; i < 300 && !sawD05; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120, rng);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      sawD05 = accumulator.events.some((e) => e.mode === 'D05');
    }
    expect(sawD05).toBe(true);

    const outcome = finalizeRun(accumulator, { kind: 'manualAbort' });
    expect(outcome.degradationDiffs.some((d) => d.role === 'brush' && d.kind === 'wear')).toBe(true);

    const envelope = envelopeFor(outcome, 1);
    expect(envelope.equipmentSnapshot.brushItemId).toBe(baseLoadout().brushItemId); // 前提: run開始時点ではbrush装備済み

    const preApplyInventory = baseInventory();
    const inputInventory: PlayerInventory = {
      ...preApplyInventory,
      items: preApplyInventory.items.filter((item) => item.itemId !== envelope.equipmentSnapshot.brushItemId),
    };
    const inputInventorySnapshotForComparison: PlayerInventory = JSON.parse(JSON.stringify(inputInventory));

    const result = applyRunOutcome(envelope, inputInventory, new Set(), goodSaveMeta());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'missingEquipment', role: 'brush' });
    }

    // 入力inventoryオブジェクト自体が一切変異していないこと(部分適用の禁止)。deep equalで
    // 全体を確認したうえで、rotorが変化していないことも個別に確認する(70番と同型)。
    expect(inputInventory).toEqual(inputInventorySnapshotForComparison);
    const rotor = inputInventory.rotorAssemblies.find((r) => r.assemblyId === envelope.equipmentSnapshot.rotorAssemblyId);
    const rotorBefore = inputInventorySnapshotForComparison.rotorAssemblies.find((r) => r.assemblyId === envelope.equipmentSnapshot.rotorAssemblyId);
    expect(rotor).toEqual(rotorBefore);
  });
});

// ---------------------------------------------------------------------------
// G1a′(arbiter補足裁定HB-DEC-011ケースA、docs/phase3-p3-4-plan.md v13 §4.4・§12・§20.8)。
// production配線(gameStore.ts等からの実際の呼び出し)・beginRunActionへの統合は含まない
// (G1b以降)。resolver・baseline構築純関数とその構造監査・負例のみを対象とする。
// ---------------------------------------------------------------------------

describe('runOutcomeApplication.ts: deriveMaterialSelectionFromEquipment(G1a′ resolver、Q1・Q2)', () => {
  function validatedInitialLoadout(): EquipmentLoadout & { batteryItemId: string } {
    const validated = validateEquipmentLoadout(baseLoadout(), baseInventory());
    if (!validated.ok) throw new Error('テスト前提が崩れています: 初期loadoutの検証に失敗しました');
    return validated.loadout;
  }

  it('検証済みloadout+inventoryから、素材5ID(MaterialSelection)+equipmentContext(bodyId)を単一経路で導出する', () => {
    const result = deriveMaterialSelectionFromEquipment(validatedInitialLoadout(), baseInventory());
    expect(result).toEqual<DeriveMaterialSelectionResult>({
      ok: true,
      selection: {
        wireId: 'wire-copper-standard',
        magnetId: 'magnet-ferrite',
        gearId: 'gear-pom',
        batteryId: 'battery-alkaline',
        brushId: 'brush-copper-plate',
      },
      equipmentContext: { bodyId: 'body-none' },
    });
  });

  it('bodyAssemblyIdが非nullの場合、equipmentContext.bodyIdをinventory.bodyPartsのmaterialIdから解決する(Q1: bodyId解決の統合)', () => {
    const inventory = baseInventory();
    const bodyPart: BodyPartState = { assemblyId: 'body-01', materialId: 'body-cardboard-cowl', scorchFraction: 0 };
    const inventoryWithBody: PlayerInventory = { ...inventory, bodyParts: [bodyPart] };
    const loadout = { ...validatedInitialLoadout(), bodyAssemblyId: 'body-01' };
    const result = deriveMaterialSelectionFromEquipment(loadout, inventoryWithBody);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.equipmentContext).toEqual({ bodyId: 'body-cardboard-cowl' });
  });

  it('N-1(arbiter補足裁定負例仕様): sourceWireMaterialIdがnullのローター個体を防御的に拒否する(missingRole: rotor)。P6是正: 失敗分岐でも引数非破壊+同一入力同一出力を固定する', () => {
    const inventory = baseInventory();
    const rotorWithNullWire: RotorAssemblyState = { assemblyId: 'r1', sourceWireMaterialId: null, consumedWireM: 1, collapsed: false, burnedOut: false };
    const inventoryWithBrokenRotor: PlayerInventory = { ...inventory, rotorAssemblies: [rotorWithNullWire] };
    const loadout = { ...validatedInitialLoadout(), rotorAssemblyId: 'r1' };
    const loadoutSnapshot: typeof loadout = JSON.parse(JSON.stringify(loadout));
    const inventorySnapshot: typeof inventoryWithBrokenRotor = JSON.parse(JSON.stringify(inventoryWithBrokenRotor));

    const result = deriveMaterialSelectionFromEquipment(loadout, inventoryWithBrokenRotor);
    expect(result).toEqual<DeriveMaterialSelectionResult>({
      ok: false,
      reason: 'ローター個体の導線素材が特定できません(sourceWireMaterialIdが未設定です)',
      missingRole: 'rotor',
    });

    // P6(純関数性、失敗分岐): 引数非破壊。
    expect(loadout).toEqual(loadoutSnapshot);
    expect(inventoryWithBrokenRotor).toEqual(inventorySnapshot);

    // P6(純関数性、失敗分岐): 同一内容・別実体の引数で再呼出しし、同一の失敗出力を返すこと。
    const result2 = deriveMaterialSelectionFromEquipment(
      JSON.parse(JSON.stringify(loadoutSnapshot)),
      JSON.parse(JSON.stringify(inventorySnapshot)),
    );
    expect(result2).toEqual(result);
  });
});

describe('runOutcomeApplication.ts: resolveProductionMaterialCompositionBaseline(G1a′ baseline単一出典、Q4・P1是正)', () => {
  function motorConfigWithVoltage(batteryVoltage: 1.5 | 3.0): MotorConfig {
    return { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 0.5, magnetDistanceMm: 10, batteryVoltage, axisOffsetMm: 0 };
  }

  it('batteryVoltage=1.5(one-cell)のとき、chassisBaselineGはresolveChassisBaselineGの凍結契約どおり135になる', () => {
    const garageBuild = resolveGarageBuild(DEFAULT_GARAGE_SELECTION);
    const baseline = resolveProductionMaterialCompositionBaseline(motorConfigWithVoltage(1.5), garageBuild);
    expect(baseline.chassisBaselineG).toBe(135);
  });

  it('batteryVoltage=3.0(two-cell)のとき、chassisBaselineGは凍結契約どおり150になる', () => {
    const garageBuild = resolveGarageBuild(DEFAULT_GARAGE_SELECTION);
    const baseline = resolveProductionMaterialCompositionBaseline(motorConfigWithVoltage(3.0), garageBuild);
    expect(baseline.chassisBaselineG).toBe(150);
  });

  it.each(GEAR_PRESETS.map((g) => [g.id, g.gearEfficiency] as const))(
    'garageSelection.gearId=%s のとき、baseGearEfficiencyはgarageBuild.carConfig.gearEfficiency(%f)をそのまま返す(resolveGarageBuild再呼出しなし)',
    (gearId, expectedEfficiency) => {
      const garageSelection: GarageSelection = { ...DEFAULT_GARAGE_SELECTION, gearId };
      const garageBuild = resolveGarageBuild(garageSelection);
      const baseline = resolveProductionMaterialCompositionBaseline(motorConfigWithVoltage(3.0), garageBuild);
      expect(baseline.baseGearEfficiency).toBe(expectedEfficiency);
    },
  );

  it('P1是正(Suu_mot3指摘): baseGearEfficiencyとgearRatioが同一のresolveGarageBuild呼び出し結果(同一オブジェクト実体)から導出される——baseline関数がresolveGarageBuildを再呼出ししないことを、単一呼び出しの戻り値をそのまま2箇所(rawPlayerCarConfig相当・baseline)へ渡す形で固定する', () => {
    const garageSelection: GarageSelection = { ...DEFAULT_GARAGE_SELECTION, gearId: 'torque' };
    // G1bが行う「exact 1回」の呼び出しを模す。この1回の戻り値のみを以後使い回す。
    const garageBuild = resolveGarageBuild(garageSelection);
    const rawPlayerCarConfig = garageBuild.carConfig; // G1bがrawPlayerCarConfigとして使う実体
    const baseline = resolveProductionMaterialCompositionBaseline(motorConfigWithVoltage(3.0), garageBuild);
    // 同一実体(garageBuild.carConfig)からgearRatio・baseGearEfficiencyの両方が一貫して導出される
    expect(rawPlayerCarConfig.gearRatio).toBe(GEAR_PRESETS.find((g) => g.id === 'torque')!.gearRatio);
    expect(baseline.baseGearEfficiency).toBe(rawPlayerCarConfig.gearEfficiency);
    expect(baseline.baseGearEfficiency).toBe(GEAR_PRESETS.find((g) => g.id === 'torque')!.gearEfficiency);
  });

  it('N-2(arbiter補足裁定負例仕様、compose直接部分): S-3関数を経由しない範囲外baseline(chassisBaselineG=10)をcomposeConfigFromMaterialsへ直接注入するとmassG下限80g未満のreasonでok:falseを返す(P3是正: exact reason固定、P6是正: 失敗分岐でも純関数性を固定)', () => {
    const outOfRangeBaseline: MaterialCompositionBaseline = { chassisBaselineG: 10, baseGearEfficiency: 0.8 };
    const motorConfig = motorConfigWithVoltage(3.0);
    const carConfig: CarConfig = { massG: 150, gearEfficiency: 0.8, gearRatio: 4, wheelDiameterMm: 30, tireGrip: 0.7, axleFriction: 0, wheelAlignmentMm: 0, centerOfMassHeightMm: 20, motorMountOffsetMm: 0 };
    const selection: MaterialSelection = { wireId: 'wire-copper-standard', magnetId: 'magnet-ferrite', gearId: 'gear-pom', batteryId: 'battery-alkaline', brushId: 'brush-copper-plate' };
    const motorSnapshot: MotorConfig = JSON.parse(JSON.stringify(motorConfig));
    const carSnapshot: CarConfig = JSON.parse(JSON.stringify(carConfig));
    const baselineSnapshot: MaterialCompositionBaseline = JSON.parse(JSON.stringify(outOfRangeBaseline));
    const selectionSnapshot: MaterialSelection = JSON.parse(JSON.stringify(selection));

    const result = composeConfigFromMaterials(motorConfig, carConfig, outOfRangeBaseline, selection);
    // 期待パス: massG計算(applyMassAdjustmentToBaselineG)のclamp範囲外reasonへ入ること。
    // 部分成功値(ok:trueで一部だけ範囲外)・throwのいずれにも入らないことを、
    // Result型の判別(ok:false固定)+reason文言(既存assumedGeometry.tsの実装文言と一致)で固定する。
    expect(result).toEqual({
      ok: false,
      reason: 'baseline+deltaが既存clamp範囲[80,250]gを外れました: 10',
    });

    // P6(純関数性、失敗分岐): 引数非破壊。
    expect(motorConfig).toEqual(motorSnapshot);
    expect(carConfig).toEqual(carSnapshot);
    expect(outOfRangeBaseline).toEqual(baselineSnapshot);
    expect(selection).toEqual(selectionSnapshot);

    // P6(純関数性、失敗分岐): 同一内容・別実体の引数で再呼出しし、同一の失敗出力を返すこと。
    const result2 = composeConfigFromMaterials(
      JSON.parse(JSON.stringify(motorSnapshot)),
      JSON.parse(JSON.stringify(carSnapshot)),
      JSON.parse(JSON.stringify(baselineSnapshot)),
      JSON.parse(JSON.stringify(selectionSnapshot)),
    );
    expect(result2).toEqual(result);
    // beginRunAction統合(nextRunSequence不変・RunSnapshot不生成、S-5の完全な不変条件)は
    // G1a′の対象外——arbiter追加裁定Q9(2026-08-16、人間承認済み・発効済み)により、S-5と
    // 本負例の後半(beginRunAction統合テストでの再現)はG1bの必須DoDへ正式に移管された
    // (契約内容は不変、検証時期のみ変更)。G1a′ではresolver・baseline構築関数・composeの
    // 純関数性(store/localStorage等非参照+引数非破壊+同一入力同一出力)を代替保証として
    // テスト固定する(下記「G1a′純関数性」describe参照)。8段全体の再固定はG6で行う。
  });
});

describe('runOutcomeApplication.ts: S-4構造監査(MaterialCompositionBaseline単一出典、arbiter補足裁定HB-DEC-011ケースA、P2是正)', () => {
  const SRC_DIR = fileURLToPath(new URL('../../', import.meta.url)); // src/store/__tests__/ → src/
  // 唯一の許可呼び出し元(S-3関数の定義ファイル)。'/'区切りへ正規化して比較する。
  const ALLOWED_CALLER = 'store/runOutcomeApplication.ts';
  // resolveChassisBaselineGの定義ファイル自体(呼び出しではなく宣言のため除外)。
  const DEFINITION_FILE = 'materials/assumedGeometry.ts';
  // S-3関数(resolveProductionMaterialCompositionBaseline)自体の名前。ALLOWED_CALLERファイル内でも
  // この関数の本体範囲**外**は検査対象に含める(P2是正: ファイル単位の一律除外は、同一ファイル内・
  // 関数外への不正呼出し混入を見逃す偽陰性を生むことがN-3で実際に確認された)。
  const S3_FUNCTION_NAME = 'resolveProductionMaterialCompositionBaseline';

  // P2是正: .tsxもproductionコードとして走査対象に含める(旧実装は.tsのみだった)。
  function listProductionSourceFiles(dirPath: string): string[] {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name === '__tests__') continue;
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...listProductionSourceFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  function relSrcPath(fullPath: string): string {
    return relative(SRC_DIR, fullPath).split(/[\\/]/).join('/');
  }

  // コメント行(トリム後 '//'・'*'・'/**' で始まる行、JSDoc本文を含む)は実コードではないため
  // 走査対象から除外する——doc comment中の関数名言及(例:
  // 「assumedGeometry.tsのresolveChassisBaselineG()の結果を渡す」)を誤検知しないための措置。
  function nonCommentLines(source: string): string[] {
    return source.split('\n').filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/**');
    });
  }

  // 宣言行(`function resolveChassisBaselineG(`)は呼出しではないため除外する。
  function isDeclarationLine(line: string): boolean {
    return /\bfunction\s+resolveChassisBaselineG\s*\(/.test(line);
  }

  // P2是正(Suu_mot3指摘): ALLOWED_CALLERファイルであっても、S-3関数の本体範囲**外**は
  // 検査対象に含める。波括弧の対応関係を数えて関数本体だけを抽出し、ALLOWED_CALLERファイルの
  // 走査対象からその本体部分のみを除外する(ファイル丸ごと除外はしない)。
  //
  // 実装上の注意(Q9純関数性テスト実装時に発見・是正した不具合): 関数名直後の最初の'{'を
  // 本体開始とみなす単純な実装は、引数の型注釈がインライン交差型オブジェクト
  // (例: `EquipmentLoadout & { batteryItemId: string }`)を含む場合、その型注釈内の'{'を
  // 誤って本体開始と判定してしまう(本関数の対象resolveProductionMaterialCompositionBaseline
  // 自体は該当しないため実害はなかったが、同型の抽出関数がQ9純関数性テストで実際に
  // 誤検出を起こしたため、両実装を統一して是正する)。引数リストの対応する')'を先に
  // 括弧の対応関係で特定し、その**後**で最初に現れる'{'を本体開始とする。
  function extractFunctionBody(source: string, functionName: string): string {
    const headerPattern = new RegExp(`export function ${functionName}\\b`);
    const headerMatch = headerPattern.exec(source);
    if (!headerMatch) throw new Error(`監査テストの前提が崩れています: ${functionName}の定義が見つかりません`);
    const parenStart = source.indexOf('(', headerMatch.index);
    if (parenStart === -1) throw new Error(`監査テストの前提が崩れています: ${functionName}の開始丸括弧が見つかりません`);
    let parenDepth = 0;
    let parenEnd = parenStart;
    for (; parenEnd < source.length; parenEnd++) {
      if (source[parenEnd] === '(') parenDepth++;
      else if (source[parenEnd] === ')') {
        parenDepth--;
        if (parenDepth === 0) { parenEnd++; break; }
      }
    }
    if (parenDepth !== 0) throw new Error(`監査テストの前提が崩れています: ${functionName}の引数リストの終了丸括弧を検出できませんでした`);
    const braceStart = source.indexOf('{', parenEnd);
    if (braceStart === -1) throw new Error(`監査テストの前提が崩れています: ${functionName}の開始波括弧が見つかりません`);
    let depth = 0;
    let i = braceStart;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    if (depth !== 0) throw new Error(`監査テストの前提が崩れています: ${functionName}の終了波括弧を検出できませんでした`);
    return source.slice(braceStart, i);
  }

  // 検査対象テキストを返す: ALLOWED_CALLERファイルはS-3関数の本体を除いた残り全文、
  // 他ファイルは全文そのまま。
  function scanTargetText(relPath: string, source: string): string {
    if (relPath !== ALLOWED_CALLER) return source;
    const body = extractFunctionBody(source, S3_FUNCTION_NAME);
    return source.replace(body, '');
  }

  it('resolveChassisBaselineGの直接呼出しがS-3関数(resolveProductionMaterialCompositionBaseline)本体以外のproductionコードに存在しない', () => {
    const files = listProductionSourceFiles(SRC_DIR);
    const violations: string[] = [];
    for (const filePath of files) {
      const relPath = relSrcPath(filePath);
      const source = readFileSync(filePath, 'utf-8');
      // DEFINITION_FILE(assumedGeometry.ts)は宣言行のみisDeclarationLineで除外し、
      // それ以外(同一ファイル内への不正呼出し混入等)は走査を継続する——ファイル単位の
      // 一律除外(旧実装)は行わない(P2是正、N-3で検出漏れを実際に確認済み)。
      const target = scanTargetText(relPath, source);
      const hasCall = nonCommentLines(target).some((line) => /resolveChassisBaselineG\(/.test(line) && !isDeclarationLine(line));
      if (hasCall) violations.push(relPath);
    }
    expect(violations, `想定外のresolveChassisBaselineG直接呼出し(S-3単一出典契約違反): ${violations.join(', ')}`).toEqual([]);
  });

  it('MaterialCompositionBaselineのリテラル構築(chassisBaselineG: <数値>)がS-3関数(resolveProductionMaterialCompositionBaseline)本体以外のproductionコードに存在しない', () => {
    const files = listProductionSourceFiles(SRC_DIR);
    const violations: string[] = [];
    for (const filePath of files) {
      const relPath = relSrcPath(filePath);
      const source = readFileSync(filePath, 'utf-8');
      const target = scanTargetText(relPath, source);
      if (nonCommentLines(target).some((line) => /chassisBaselineG:\s*\d/.test(line))) violations.push(relPath);
    }
    expect(violations, `想定外のMaterialCompositionBaselineリテラル構築(S-3単一出典契約違反): ${violations.join(', ')}`).toEqual([]);
  });

  it('監査対象ファイル一覧が空でない・.tsxを含む(正規表現の不備・パス解決の誤りによる偽陰性を防ぐ)', () => {
    const files = listProductionSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => relSrcPath(f) === ALLOWED_CALLER)).toBe(true);
    expect(files.some((f) => relSrcPath(f) === DEFINITION_FILE)).toBe(true);
    expect(files.some((f) => f.endsWith('.tsx'))).toBe(true);
  });

  it('extractFunctionBodyがS-3関数の本体を正しく抽出する(監査ロジック自体の健全性、除外範囲が広すぎ/狭すぎないことの固定)', () => {
    const source = readFileSync(join(SRC_DIR, 'store', 'runOutcomeApplication.ts'), 'utf-8');
    const body = extractFunctionBody(source, S3_FUNCTION_NAME);
    expect(body).toContain('resolveChassisBaselineG(cellSelection)');
    expect(body).toContain('chassisBaselineG: resolveChassisBaselineG(cellSelection)');
    // 本体は該当関数の閉じ括弧までで止まり、後続の無関係なコードを含まないこと。
    expect(body).not.toContain(S3_FUNCTION_NAME + '__NEVER_PRESENT__');
  });
});

// ---------------------------------------------------------------------------
// G1a′純関数性(arbiter追加裁定Q9、docs/phase3-p3-4-plan.md v14 §3.1・§20.9・§22)。
// S-5不変条件(nextRunSequence不変等)のうち純関数側で成立しうる唯一の部分——
// 「関数自身が副作用を持たない」ことをG1a′で先取り固定する。beginRunAction統合後の
// 完全なS-5不変条件はG1b必須DoDへ移管済み(G1a′の対象外)。
// ---------------------------------------------------------------------------

describe('G1a′純関数性(arbiter追加裁定Q9、resolver・baseline構築関数・compose)', () => {
  const PURITY_SRC_DIR = fileURLToPath(new URL('../../', import.meta.url)); // src/store/__tests__/ → src/

  // 引数リストの対応する')'を先に括弧の対応関係で特定し、その後で最初に現れる'{'を本体開始と
  // する(型注釈中のインライン交差型オブジェクト、例: `EquipmentLoadout & { batteryItemId: string }`、
  // を誤って本体開始と判定しないため——実装時に実際に発生したバグの是正、下記デバッグログ参照)。
  function extractNamedFunctionBody(source: string, functionName: string): string {
    const headerPattern = new RegExp(`export function ${functionName}\\b`);
    const headerMatch = headerPattern.exec(source);
    if (!headerMatch) throw new Error(`テスト前提が崩れています: ${functionName}の定義が見つかりません`);
    const parenStart = source.indexOf('(', headerMatch.index);
    if (parenStart === -1) throw new Error(`テスト前提が崩れています: ${functionName}の開始丸括弧が見つかりません`);
    let parenDepth = 0;
    let parenEnd = parenStart;
    for (; parenEnd < source.length; parenEnd++) {
      if (source[parenEnd] === '(') parenDepth++;
      else if (source[parenEnd] === ')') {
        parenDepth--;
        if (parenDepth === 0) { parenEnd++; break; }
      }
    }
    if (parenDepth !== 0) throw new Error(`テスト前提が崩れています: ${functionName}の引数リストの終了丸括弧を検出できませんでした`);
    const braceStart = source.indexOf('{', parenEnd);
    if (braceStart === -1) throw new Error(`テスト前提が崩れています: ${functionName}の開始波括弧が見つかりません`);
    let depth = 0;
    let i = braceStart;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    if (depth !== 0) throw new Error(`テスト前提が崩れています: ${functionName}の終了波括弧を検出できませんでした`);
    return source.slice(braceStart, i);
  }

  // Q9裁定が禁じる対象: store/localStorage/sessionStorage/グローバル状態への一切のアクセス。
  // P7是正(Suu_mot3指摘): 個別store名の列挙(useGameStore等)だけでは将来の別store名への
  // 差替えを見逃すため、use*Store一般形+.getState/.setState/subscribeの汎用アクセスパターンを
  // 追加。時刻・乱数・crypto(非決定・環境依存の副作用源、純関数の同一入力同一出力性を壊す)、
  // processの一般形(env限定ではなくprocess全体)も追加する。
  const FORBIDDEN_GLOBAL_PATTERNS: RegExp[] = [
    /\buse[A-Za-z0-9_]*Store\b/, // use*Store一般形(useGameStore/useSaveStore/useNotebookStore等を包含)
    /\.getState\s*\(/,
    /\.setState\s*\(/,
    /\.subscribe\s*\(/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bwindow\b/,
    /\bdocument\b/,
    /\bglobalThis\b/,
    /\bprocess\b/, // process.envに限らずprocess全体(process.argv等の環境依存も含む)
    /\bDate\.now\s*\(/,
    /\bMath\.random\s*\(/,
    /\bperformance\.now\s*\(/,
    /\bcrypto\b/,
  ];

  const PURITY_TARGETS: Array<[string, string]> = [
    ['deriveMaterialSelectionFromEquipment', join(PURITY_SRC_DIR, 'store', 'runOutcomeApplication.ts')],
    ['resolveProductionMaterialCompositionBaseline', join(PURITY_SRC_DIR, 'store', 'runOutcomeApplication.ts')],
    ['composeConfigFromMaterials', join(PURITY_SRC_DIR, 'materials', 'materialMapping.ts')],
  ];

  // P7是正(Suu_mot3指摘): extractNamedFunctionBodyの抽出範囲自体が正しいことを恒久的に固定する
  // (今回発見した「型注釈内の{を本体開始と誤認」の回帰防止)。各対象関数の本体に必ず含まれる
  // 既知のトークンを直接assertし、空/過小抽出(誤って別関数やコメントのみを抽出してしまう偽陰性)
  // を防ぐ。
  const PURITY_TARGET_KNOWN_TOKENS: Record<string, string[]> = {
    deriveMaterialSelectionFromEquipment: ['sourceWireMaterialId', 'findNarrowedInventoryItemById'],
    resolveProductionMaterialCompositionBaseline: ['resolveChassisBaselineG'],
    composeConfigFromMaterials: ['computeWireMagnetMassAdjustmentG'],
  };

  it.each(PURITY_TARGETS)('%sの抽出本体が既知トークンを含む(extractNamedFunctionBodyの抽出範囲自体の恒久回帰テスト)', (functionName, filePath) => {
    const source = readFileSync(filePath, 'utf-8');
    const body = extractNamedFunctionBody(source, functionName);
    const knownTokens = PURITY_TARGET_KNOWN_TOKENS[functionName];
    expect(knownTokens, `テスト前提が崩れています: ${functionName}の既知トークン一覧が未定義です`).toBeDefined();
    for (const token of knownTokens) {
      expect(body, `${functionName}の抽出本体が既知トークン"${token}"を含んでいません——本体抽出が過小/誤った範囲になっている可能性があります(空/過小抽出の偽陰性防止)`).toContain(token);
    }
  });

  it.each(PURITY_TARGETS)('%sの本体がstore/localStorage/sessionStorage/グローバル状態/時刻・乱数・crypto/processを一切参照しない(構造検査)', (functionName, filePath) => {
    const source = readFileSync(filePath, 'utf-8');
    const body = extractNamedFunctionBody(source, functionName);
    for (const pattern of FORBIDDEN_GLOBAL_PATTERNS) {
      expect(body, `${functionName}が禁止パターン${pattern}を含んでいます(Q9純関数性違反)`).not.toMatch(pattern);
    }
  });

  it('deriveMaterialSelectionFromEquipmentは引数(loadout/inventory)を変更せず、同一入力で同一出力を返す', () => {
    const validated = validateEquipmentLoadout(baseLoadout(), baseInventory());
    if (!validated.ok) throw new Error('テスト前提が崩れています: 初期loadoutの検証に失敗しました');
    const loadout = validated.loadout;
    const inventory = baseInventory();
    const loadoutSnapshot: typeof loadout = JSON.parse(JSON.stringify(loadout));
    const inventorySnapshot: typeof inventory = JSON.parse(JSON.stringify(inventory));

    const result1 = deriveMaterialSelectionFromEquipment(loadout, inventory);
    // 引数非破壊(呼出し後も入力オブジェクトが変異していないこと)。
    expect(loadout).toEqual(loadoutSnapshot);
    expect(inventory).toEqual(inventorySnapshot);

    // 同一内容だが別実体の引数で再呼出しし、同一出力を返すこと(参照透過性)。
    const result2 = deriveMaterialSelectionFromEquipment(
      JSON.parse(JSON.stringify(loadoutSnapshot)),
      JSON.parse(JSON.stringify(inventorySnapshot)),
    );
    expect(result2).toEqual(result1);
  });

  it('resolveProductionMaterialCompositionBaselineは引数を変更せず、同一入力で同一出力を返す', () => {
    const rawPlayerMotorConfig: MotorConfig = { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 0.5, magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 0 };
    const garageBuild = resolveGarageBuild({ ...DEFAULT_GARAGE_SELECTION, gearId: 'torque' });
    const motorConfigSnapshot: MotorConfig = JSON.parse(JSON.stringify(rawPlayerMotorConfig));
    const garageBuildSnapshot: typeof garageBuild = JSON.parse(JSON.stringify(garageBuild));

    const result1 = resolveProductionMaterialCompositionBaseline(rawPlayerMotorConfig, garageBuild);
    expect(rawPlayerMotorConfig).toEqual(motorConfigSnapshot);
    expect(garageBuild).toEqual(garageBuildSnapshot);

    const result2 = resolveProductionMaterialCompositionBaseline(
      JSON.parse(JSON.stringify(motorConfigSnapshot)),
      JSON.parse(JSON.stringify(garageBuildSnapshot)),
    );
    expect(result2).toEqual(result1);
  });

  it('composeConfigFromMaterialsは引数(baseMotorConfig/baseCarConfig/baseline/selection)を変更せず、同一入力で同一出力を返す(成功系)', () => {
    const baseMotorConfig: MotorConfig = { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 0.5, magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 0 };
    const baseCarConfig: CarConfig = { massG: 150, gearEfficiency: 0.8, gearRatio: 4, wheelDiameterMm: 30, tireGrip: 0.7, axleFriction: 0, wheelAlignmentMm: 0, centerOfMassHeightMm: 20, motorMountOffsetMm: 0 };
    const baseline: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 0.8 };
    const selection: MaterialSelection = { wireId: 'wire-copper-standard', magnetId: 'magnet-ferrite', gearId: 'gear-pom', batteryId: 'battery-alkaline', brushId: 'brush-copper-plate' };

    const motorSnapshot: MotorConfig = JSON.parse(JSON.stringify(baseMotorConfig));
    const carSnapshot: CarConfig = JSON.parse(JSON.stringify(baseCarConfig));
    const baselineSnapshot: MaterialCompositionBaseline = JSON.parse(JSON.stringify(baseline));
    const selectionSnapshot: MaterialSelection = JSON.parse(JSON.stringify(selection));

    const result1 = composeConfigFromMaterials(baseMotorConfig, baseCarConfig, baseline, selection);
    expect(baseMotorConfig).toEqual(motorSnapshot);
    expect(baseCarConfig).toEqual(carSnapshot);
    expect(baseline).toEqual(baselineSnapshot);
    expect(selection).toEqual(selectionSnapshot);

    const result2 = composeConfigFromMaterials(
      JSON.parse(JSON.stringify(motorSnapshot)),
      JSON.parse(JSON.stringify(carSnapshot)),
      JSON.parse(JSON.stringify(baselineSnapshot)),
      JSON.parse(JSON.stringify(selectionSnapshot)),
    );
    expect(result2).toEqual(result1);
  });
});
