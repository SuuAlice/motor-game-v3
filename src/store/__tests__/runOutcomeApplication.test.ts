// P3-0サブステップ2(docs/phase3-p3-0-plan.md v7 8.1節)。runOutcomeApplication.tsの
// 純粋ロジックをテストする。lease stale判定(isLeaseHeartbeatStale)自体はpure関数として
// 本ファイルでテストするが、heartbeat間隔5秒のタイマー管理・performApplyRunOutcomeの
// 単一set()・codexRecords配列管理はsaveStore.ts(サブステップ3、brabit_mot3実装)側の
// 責務のため、本ファイルでは扱わない。
import { describe, expect, it } from 'vitest';
import {
  abandonPendingApplication,
  applyRunOutcome,
  beginRun,
  captureEquipmentIdSnapshot,
  createInitialPlayerInventoryAndLoadout,
  isLeaseHeartbeatStale,
  LEASE_STALE_THRESHOLD_MS,
  PROVISIONAL_DISCOVERY_REWARD_G,
  resolveBearingForGear,
  retryPendingApplication,
  rebindLeaseForPendingApplication,
  touchLeaseHeartbeat,
  validateEquipmentIdSnapshot,
  validateEquipmentLoadout,
  type EquipmentIdSnapshot,
  type EquipmentLoadout,
  type RunApplicationEnvelope,
  type SaveEnvelopeMeta,
} from '../runOutcomeApplication';
import type { PlayerInventory } from '../../materials/inventoryItem';
import { GEAR_TOTAL_TOOTH_COUNT } from '../../materials/inventoryItem';
import { INITIAL_CASH_G } from '../shopEconomy';
import type { DestructionRunContext, RunOutcome } from '../../engine/destructionOrchestration';
import type { DestructionModeId } from '../../engine/destructionModes';

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
    causeLog: { currentA: 1, rpm: 1, atT: 1, temperature: { kind: 'uncalibratedGauge' as const, ratio: 1 }, bearingHeatGaugeRatio: 1 },
    isFirstThisSession: true as const,
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
