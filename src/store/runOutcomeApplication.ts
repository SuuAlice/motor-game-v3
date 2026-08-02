// P3-0サブステップ2(docs/phase3-p3-0-plan.md v7、附録A.4+1節・4.4節・5節・6.4節)。
// Zustand非依存の純粋ロジックのみ(Phase2のsrc/store/shopEconomy.ts/shopEconomyStore.ts分離
// パターンを踏襲)。`set()`を呼ぶstore action本体・saveStore.ts自体・既存store adapter・
// UI selector・ExperimentNotebook.tsxはbrabit_mot3所有(サブステップ3)であり、本ファイルには
// 含めない。production配線(gameStore.ts等からの実際の呼び出し)も含めない。

import type { MotorConfig } from '../engine/motorPhysics';
import type { CarConfig, EnergyBreakdown, VehicleSimState } from '../engine/vehiclePhysics';
import type { DegradationDiff, DestructionEvent, DestructionRunContext, RunOutcome, RunSnapshot } from '../engine/destructionOrchestration';
import type { DestructionModeId } from '../engine/destructionModes';
import type { BearingAssemblyState, BodyPartState, EquipmentRole, InventoryItem, PlayerInventory, RotorAssemblyState } from '../materials/inventoryItem';
import { GEAR_TOTAL_TOOTH_COUNT } from '../materials/inventoryItem';
import { applyBearingDiff, applyBodyDiff, applyBrushDiff, applyGearDiff, applyMagnetDiff, applyRotorDiff } from '../materials/degradationApplication';
// 型のみの参照(brabit_mot3所有ファイルを一切変更しない、import typeは実行時の依存を持たない)
import type { ExperimentSession, CourseRunNotebookRecord } from './notebookStore';
import type { TestRunSample } from './gameStore';
import { INITIAL_CASH_G } from './shopEconomy';

// ---------------------------------------------------------------------------
// 1節: EquipmentLoadout / EquipmentIdSnapshot
// ---------------------------------------------------------------------------

// 生きたEquipmentLoadout(store所有の「現在装備」永続状態)。contextを持たない。
// batteryItemIdのみstring|null(1.3節: battery消費後の整合性)。
export interface EquipmentLoadout {
  rotorAssemblyId: string;
  batteryItemId: string | null;
  brushItemId: string;
  magnetItemId: string;
  gearItemId: string;
  bearingAssemblyId: string;
  bodyAssemblyId: string | null;
}

// RunApplicationEnvelopeに埋め込まれる、走行開始時点のコピー。context判別union。
export type EquipmentIdSnapshot =
  | { context: 'motor'; rotorAssemblyId: string; batteryItemId: string; brushItemId: string; magnetItemId: string; gearItemId: null; bearingAssemblyId: null; bodyAssemblyId: null }
  | { context: 'vehicle'; rotorAssemblyId: string; batteryItemId: string; brushItemId: string; magnetItemId: string; gearItemId: string; bearingAssemblyId: string; bodyAssemblyId: string | null };

function findInventoryItemById(inventory: PlayerInventory, itemId: string, family: InventoryItem['family']): InventoryItem | undefined {
  return inventory.items.find((item) => item.itemId === itemId && item.family === family);
}

export type ValidateEquipmentLoadoutResult =
  | { ok: true; loadout: EquipmentLoadout & { batteryItemId: string } }
  | { ok: false; reason: string; missingRole: EquipmentRole };

// 生きたloadoutがinventoryに対して実在・family一致することを検証する。
// bearingAssembly.gearItemId===loadout.gearItemId の一致も必須検証する(1.2節)。
export function validateEquipmentLoadout(loadout: EquipmentLoadout, inventory: PlayerInventory): ValidateEquipmentLoadoutResult {
  const rotor = inventory.rotorAssemblies.find((r) => r.assemblyId === loadout.rotorAssemblyId);
  if (!rotor) return { ok: false, reason: `rotorAssemblyId(${loadout.rotorAssemblyId})が見つかりません`, missingRole: 'rotor' };

  if (loadout.batteryItemId === null) {
    return { ok: false, reason: '電池が未装備です', missingRole: 'battery' };
  }
  if (!findInventoryItemById(inventory, loadout.batteryItemId, 'battery')) {
    return { ok: false, reason: `batteryItemId(${loadout.batteryItemId})が見つかりません`, missingRole: 'battery' };
  }
  if (!findInventoryItemById(inventory, loadout.brushItemId, 'brush')) {
    return { ok: false, reason: `brushItemId(${loadout.brushItemId})が見つかりません`, missingRole: 'brush' };
  }
  if (!findInventoryItemById(inventory, loadout.magnetItemId, 'magnet')) {
    return { ok: false, reason: `magnetItemId(${loadout.magnetItemId})が見つかりません`, missingRole: 'magnet' };
  }
  if (!findInventoryItemById(inventory, loadout.gearItemId, 'gear')) {
    return { ok: false, reason: `gearItemId(${loadout.gearItemId})が見つかりません`, missingRole: 'gear' };
  }
  const bearing = inventory.bearingAssemblies.find((b) => b.assemblyId === loadout.bearingAssemblyId);
  if (!bearing) return { ok: false, reason: `bearingAssemblyId(${loadout.bearingAssemblyId})が見つかりません`, missingRole: 'bearing' };
  if (bearing.gearItemId !== loadout.gearItemId) {
    return { ok: false, reason: `bearingAssembly.gearItemId(${bearing.gearItemId})がloadout.gearItemId(${loadout.gearItemId})と一致しません`, missingRole: 'bearing' };
  }
  if (loadout.bodyAssemblyId !== null && !inventory.bodyParts.some((b) => b.assemblyId === loadout.bodyAssemblyId)) {
    return { ok: false, reason: `bodyAssemblyId(${loadout.bodyAssemblyId})が見つかりません`, missingRole: 'body' };
  }

  return { ok: true, loadout: { ...loadout, batteryItemId: loadout.batteryItemId } };
}

export type ValidateEquipmentIdSnapshotResult = { ok: true } | { ok: false; reason: string };

// EquipmentIdSnapshotのcontext/null性が、対応するRunSnapshot.runContext.contextと一致することを検証する。
export function validateEquipmentIdSnapshot(snapshot: EquipmentIdSnapshot, runContext: DestructionRunContext): ValidateEquipmentIdSnapshotResult {
  if (snapshot.context !== runContext.context) {
    return { ok: false, reason: `snapshot.context(${snapshot.context})とrunContext.context(${runContext.context})が一致しません` };
  }
  if (snapshot.context === 'motor') {
    if (snapshot.gearItemId !== null || snapshot.bearingAssemblyId !== null || snapshot.bodyAssemblyId !== null) {
      return { ok: false, reason: 'motor文脈ではgearItemId/bearingAssemblyId/bodyAssemblyIdはnullである必要があります' };
    }
  } else if (snapshot.gearItemId === null || snapshot.bearingAssemblyId === null) {
    return { ok: false, reason: 'vehicle文脈ではgearItemId/bearingAssemblyIdは非nullである必要があります' };
  }
  return { ok: true };
}

// 検証済み(batteryItemId非null確定済み)のloadoutから、走行文脈に応じたEquipmentIdSnapshotを
// 導出する。生きたloadout自体は一切変更しない(finishAssemblyの規約)。
export function captureEquipmentIdSnapshot(loadout: EquipmentLoadout & { batteryItemId: string }, context: 'motor' | 'vehicle'): EquipmentIdSnapshot {
  const common = { rotorAssemblyId: loadout.rotorAssemblyId, batteryItemId: loadout.batteryItemId, brushItemId: loadout.brushItemId, magnetItemId: loadout.magnetItemId };
  return context === 'motor'
    ? { context: 'motor', ...common, gearItemId: null, bearingAssemblyId: null, bodyAssemblyId: null }
    : { context: 'vehicle', ...common, gearItemId: loadout.gearItemId, bearingAssemblyId: loadout.bearingAssemblyId, bodyAssemblyId: loadout.bodyAssemblyId };
}

// ---------------------------------------------------------------------------
// 1.4節: gear購入時のbearing自動生成・gear切替時のbearing自動解決
// ---------------------------------------------------------------------------

export type SetGearEquipmentResult = { ok: true; bearingAssemblyId: string } | { ok: false; reason: string };

// gearItemIdとbearingAssemblyIdは常にペアで更新する(片方だけを更新するAPIは提供しない)。
export function resolveBearingForGear(gearItemId: string, inventory: PlayerInventory): SetGearEquipmentResult {
  const bearing = inventory.bearingAssemblies.find((b) => b.gearItemId === gearItemId);
  return bearing ? { ok: true, bearingAssemblyId: bearing.assemblyId } : { ok: false, reason: `${gearItemId}に対応するBearingAssemblyStateが見つかりません` };
}

// ---------------------------------------------------------------------------
// 2.2節: legacy初期データの完全確定
// ---------------------------------------------------------------------------

export function createInitialPlayerInventoryAndLoadout(): { inventory: PlayerInventory; loadout: EquipmentLoadout } {
  return {
    inventory: {
      cashG: INITIAL_CASH_G,
      items: [
        { itemId: 'initial-magnet-01', family: 'magnet', materialId: 'magnet-ferrite', wearState: { kind: 'magnet', demagnetizationFraction: 0 } },
        { itemId: 'initial-gear-01', family: 'gear', materialId: 'gear-pom', wearState: { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 0, seizureFraction: 0 } },
        { itemId: 'initial-brush-01', family: 'brush', materialId: 'brush-copper-plate', wearState: { kind: 'brush', wearFraction: 0 } },
        { itemId: 'initial-battery-01', family: 'battery', materialId: 'battery-alkaline', wearState: undefined },
      ],
      stackableStock: [
        { family: 'wire', materialId: 'wire-copper-standard', quantityM: 5 },
        { family: 'coating', materialId: 'coating-polyester', quantityMl: 10 },
      ],
      rotorAssemblies: [{ assemblyId: 'initial-rotor-01', sourceWireMaterialId: 'wire-copper-standard', consumedWireM: 1, collapsed: false, burnedOut: false }],
      bodyParts: [],
      bearingAssemblies: [{ assemblyId: 'initial-bearing-01', gearItemId: 'initial-gear-01', seizureFraction: 0 }],
    },
    loadout: {
      rotorAssemblyId: 'initial-rotor-01',
      batteryItemId: 'initial-battery-01',
      brushItemId: 'initial-brush-01',
      magnetItemId: 'initial-magnet-01',
      gearItemId: 'initial-gear-01',
      bearingAssemblyId: 'initial-bearing-01',
      bodyAssemblyId: null,
    },
  };
}

// ---------------------------------------------------------------------------
// 4.4節: runSequence発行action(beginRun)
// ---------------------------------------------------------------------------

export type BeginRunResult =
  | { ok: true; runSequence: number; nextSaveMeta: SaveEnvelopeMeta; equipmentSnapshot: EquipmentIdSnapshot }
  | { ok: false; reason: 'leaseNotAcquired' }
  | { ok: false; reason: 'runInProgress' }
  | { ok: false; reason: 'pendingApplicationExists' }
  | { ok: false; reason: string; missingRole: EquipmentRole };

// 前提: lease取得済み・pending=null・current=null・validateEquipmentLoadout成功。
// leaseAcquiredは呼び出し元(store action)が4.2節の状態機械から判定した現在値を渡す。
export function beginRun(
  loadout: EquipmentLoadout,
  inventory: PlayerInventory,
  context: 'motor' | 'vehicle',
  saveMeta: SaveEnvelopeMeta,
  currentRunSequence: number | null,
  leaseAcquired: boolean,
): BeginRunResult {
  if (!leaseAcquired) return { ok: false, reason: 'leaseNotAcquired' };
  if (currentRunSequence !== null) return { ok: false, reason: 'runInProgress' };
  if (saveMeta.pendingApplication !== null) return { ok: false, reason: 'pendingApplicationExists' };
  const validated = validateEquipmentLoadout(loadout, inventory);
  if (!validated.ok) return { ok: false, reason: validated.reason, missingRole: validated.missingRole };
  const equipmentSnapshot = captureEquipmentIdSnapshot(validated.loadout, context);
  const runSequence = saveMeta.nextRunSequence;
  return { ok: true, runSequence, nextSaveMeta: { ...saveMeta, nextRunSequence: runSequence + 1 }, equipmentSnapshot };
}

// ---------------------------------------------------------------------------
// 6.4節: 実験ノート記録の型(既存ExperimentSession/CourseRunNotebookRecordを踏襲、
// test-run用にVehicleTestRunNotebookRecordを新設。3腕判別union)
// ---------------------------------------------------------------------------

export interface VehicleTestRunNotebookRecord {
  id: string;
  savedAt: string;
  motorConfig: MotorConfig;
  carConfig: CarConfig;
  seed: number;
  status: VehicleSimState['status'];
  elapsedTimeS: number;
  positionM: number;
  energyUsedJ: number;
  energyBreakdown: EnergyBreakdown;
  samples: TestRunSample[];
}

export type PendingNotebookRecord =
  | { kind: 'session'; record: ExperimentSession }
  | { kind: 'vehicleTestRun'; record: VehicleTestRunNotebookRecord }
  | { kind: 'courseRun'; record: CourseRunNotebookRecord };

// ---------------------------------------------------------------------------
// 5.2節: 図鑑記録の型(codexRecords、trim対象外)
// ---------------------------------------------------------------------------

export interface CodexRecordEntry {
  modeId: DestructionModeId;
  firstDiscoveredAtRunSequence: number; // envelope.runKey.runSequenceから取得する
  replaySnapshot: RunSnapshot;
}

// ---------------------------------------------------------------------------
// 附録A.4: SaveEnvelopeMeta・TabRuntimeState・RunApplicationEnvelope
// ---------------------------------------------------------------------------

export interface SaveEnvelopeMeta {
  saveId: string;
  lastAppliedRunSequence: number;
  nextRunSequence: number;
  leaseToken: string;
  leaseHeartbeatAt: string;
  pendingApplication: RunApplicationEnvelope | null;
}

export interface TabRuntimeState {
  currentRunSequence: number | null;
}

// ※ notebookRecordはQ3(人間再承認対象、v12契約への追加)により追加。
export interface RunApplicationEnvelope {
  runKey: { saveId: string; runSequence: number };
  leaseToken: string;
  outcome: RunOutcome;
  equipmentSnapshot: EquipmentIdSnapshot;
  notebookRecord: PendingNotebookRecord;
}

// ---------------------------------------------------------------------------
// 5.2節: 図鑑初回登録報酬(spec §5.1/§7.5、Phase3計画v7 DoD)
// ---------------------------------------------------------------------------

// 正の整数の仮額。Phase5経済結線までの機構実証用provisional値であり、較正値ではない。
// 既存の別用途経済定数(INITIAL_CASH_G等)を意味を偽って流用しない、専用の新規定数とする。
export const PROVISIONAL_DISCOVERY_REWARD_G = 500;

// ---------------------------------------------------------------------------
// 5.1節: 検証順序(二層構造)・ApplyRunOutcomeError
// ---------------------------------------------------------------------------

export type ApplyRunOutcomeError =
  | { kind: 'saveIdMismatch' }
  | { kind: 'staleLease' }
  | { kind: 'leaseNotAcquired' } // pure関数自身はこの値を生成しない(store action層の事前ゲート専用)
  | { kind: 'invalidRunSequence' } // Q1(人間再承認対象)
  | { kind: 'missingEquipment'; role: EquipmentRole };

// ※ consumedEquipmentIdsはQ4b(人間再承認対象、v12契約への追加)により追加。
export interface AppliedRunResult {
  runKey: { saveId: string; runSequence: number };
  applied: boolean;
  newlyDiscoveredModes: readonly DestructionModeId[];
  rewardsGrantedG: number;
  resolvedDegradations: ReadonlyArray<{ role: EquipmentRole; resolvedAssemblyOrItemId: string }>;
  consumedEquipmentIds: readonly { role: EquipmentRole; id: string }[];
}

export type ApplyRunOutcomeResult =
  | { ok: true; result: AppliedRunResult; nextInventory: PlayerInventory; nextDiscoveredModes: ReadonlySet<DestructionModeId>; nextSaveMeta: SaveEnvelopeMeta }
  | { ok: false; error: ApplyRunOutcomeError };

// ---------------------------------------------------------------------------
// 5.2節: 原子的適用の内部ヘルパー(preflight→適用の2段階、部分適用の禁止)
// ---------------------------------------------------------------------------

function validateEquipmentSnapshotIntegrity(snapshot: EquipmentIdSnapshot, inventory: PlayerInventory): { ok: true } | { ok: false; role: EquipmentRole } {
  if (!inventory.rotorAssemblies.some((r) => r.assemblyId === snapshot.rotorAssemblyId)) return { ok: false, role: 'rotor' };
  if (!findInventoryItemById(inventory, snapshot.batteryItemId, 'battery')) return { ok: false, role: 'battery' };
  if (!findInventoryItemById(inventory, snapshot.brushItemId, 'brush')) return { ok: false, role: 'brush' };
  if (!findInventoryItemById(inventory, snapshot.magnetItemId, 'magnet')) return { ok: false, role: 'magnet' };
  if (snapshot.context === 'vehicle') {
    if (!findInventoryItemById(inventory, snapshot.gearItemId, 'gear')) return { ok: false, role: 'gear' };
    if (!inventory.bearingAssemblies.some((b) => b.assemblyId === snapshot.bearingAssemblyId)) return { ok: false, role: 'bearing' };
    if (snapshot.bodyAssemblyId !== null && !inventory.bodyParts.some((b) => b.assemblyId === snapshot.bodyAssemblyId)) return { ok: false, role: 'body' };
  }
  return { ok: true };
}

interface ResolvedDegradation {
  role: EquipmentRole;
  resolvedId: string;
  diff: DegradationDiff;
}

// degradationDiffsの各roleをequipmentSnapshot経由で実個体/アセンブリIDへ解決する。
// いずれか解決不能ならok:falseを返す(適用は一切行わない、部分適用の禁止)。
function resolveDegradationDiffs(
  diffs: readonly DegradationDiff[],
  snapshot: EquipmentIdSnapshot,
  inventory: PlayerInventory,
): { ok: true; resolved: readonly ResolvedDegradation[] } | { ok: false; role: EquipmentRole } {
  const resolved: ResolvedDegradation[] = [];
  for (const diff of diffs) {
    switch (diff.role) {
      case 'magnet': {
        const item = findInventoryItemById(inventory, snapshot.magnetItemId, 'magnet');
        if (!item) return { ok: false, role: 'magnet' };
        resolved.push({ role: 'magnet', resolvedId: item.itemId, diff });
        break;
      }
      case 'gear': {
        const item = snapshot.gearItemId === null ? undefined : findInventoryItemById(inventory, snapshot.gearItemId, 'gear');
        if (!item) return { ok: false, role: 'gear' };
        resolved.push({ role: 'gear', resolvedId: item.itemId, diff });
        break;
      }
      case 'bearing': {
        const bearing = snapshot.bearingAssemblyId === null ? undefined : inventory.bearingAssemblies.find((b) => b.assemblyId === snapshot.bearingAssemblyId);
        if (!bearing) return { ok: false, role: 'bearing' };
        resolved.push({ role: 'bearing', resolvedId: bearing.assemblyId, diff });
        break;
      }
      case 'brush': {
        const item = findInventoryItemById(inventory, snapshot.brushItemId, 'brush');
        if (!item) return { ok: false, role: 'brush' };
        resolved.push({ role: 'brush', resolvedId: item.itemId, diff });
        break;
      }
      case 'rotor': {
        const rotor = inventory.rotorAssemblies.find((r) => r.assemblyId === snapshot.rotorAssemblyId);
        if (!rotor) return { ok: false, role: 'rotor' };
        resolved.push({ role: 'rotor', resolvedId: rotor.assemblyId, diff });
        break;
      }
      case 'battery': {
        const item = findInventoryItemById(inventory, snapshot.batteryItemId, 'battery');
        if (!item) return { ok: false, role: 'battery' };
        resolved.push({ role: 'battery', resolvedId: item.itemId, diff });
        break;
      }
      case 'body': {
        const body = snapshot.bodyAssemblyId === null ? undefined : inventory.bodyParts.find((b) => b.assemblyId === snapshot.bodyAssemblyId);
        if (!body) return { ok: false, role: 'body' };
        resolved.push({ role: 'body', resolvedId: body.assemblyId, diff });
        break;
      }
    }
  }
  return { ok: true, resolved };
}

// 解決済みdiffを実際に適用する。battery(role:'battery')はinventory.itemsから除去し、
// consumedEquipmentIdsへ記録する(1.3節、store action層がこれを見てEquipmentLoadout.
// batteryItemIdをnull化する)。
function applyResolvedDegradations(
  inventory: PlayerInventory,
  resolved: readonly ResolvedDegradation[],
): {
  nextInventory: PlayerInventory;
  resolvedDegradations: ReadonlyArray<{ role: EquipmentRole; resolvedAssemblyOrItemId: string }>;
  consumedEquipmentIds: readonly { role: EquipmentRole; id: string }[];
} {
  let items = inventory.items;
  let rotorAssemblies: readonly RotorAssemblyState[] = inventory.rotorAssemblies;
  let bodyParts: readonly BodyPartState[] = inventory.bodyParts;
  let bearingAssemblies: readonly BearingAssemblyState[] = inventory.bearingAssemblies;
  const consumedEquipmentIds: { role: EquipmentRole; id: string }[] = [];
  const resolvedDegradations: { role: EquipmentRole; resolvedAssemblyOrItemId: string }[] = [];

  for (const { role, resolvedId, diff } of resolved) {
    resolvedDegradations.push({ role, resolvedAssemblyOrItemId: resolvedId });
    switch (role) {
      case 'magnet':
        items = items.map((item) =>
          item.itemId === resolvedId && item.family === 'magnet' ? { ...item, wearState: applyMagnetDiff(diff as Extract<DegradationDiff, { role: 'magnet' }>, item.wearState) } : item,
        );
        break;
      case 'gear':
        items = items.map((item) =>
          item.itemId === resolvedId && item.family === 'gear' ? { ...item, wearState: applyGearDiff(diff as Extract<DegradationDiff, { role: 'gear' }>, item.wearState) } : item,
        );
        break;
      case 'brush':
        items = items.map((item) =>
          item.itemId === resolvedId && item.family === 'brush' ? { ...item, wearState: applyBrushDiff(diff as Extract<DegradationDiff, { role: 'brush' }>, item.wearState) } : item,
        );
        break;
      case 'rotor':
        rotorAssemblies = rotorAssemblies.map((r) => (r.assemblyId === resolvedId ? applyRotorDiff(diff as Extract<DegradationDiff, { role: 'rotor' }>, r) : r));
        break;
      case 'body':
        bodyParts = bodyParts.map((b) => (b.assemblyId === resolvedId ? applyBodyDiff(diff as Extract<DegradationDiff, { role: 'body' }>, b) : b));
        break;
      case 'bearing':
        bearingAssemblies = bearingAssemblies.map((b) => (b.assemblyId === resolvedId ? applyBearingDiff(diff as Extract<DegradationDiff, { role: 'bearing' }>, b) : b));
        break;
      case 'battery':
        items = items.filter((item) => item.itemId !== resolvedId);
        consumedEquipmentIds.push({ role: 'battery', id: resolvedId });
        break;
    }
  }

  return { nextInventory: { ...inventory, items, rotorAssemblies, bodyParts, bearingAssemblies }, resolvedDegradations, consumedEquipmentIds };
}

// 正式Fable指摘(codexRecords生成元の訂正): outcome.eventsの全mode(terminal/非terminal問わず)
// からdiscoveredModesにまだ含まれないものを算出する。outcome.terminalModesは使わない
// (非terminal RunOutcomeにはterminalModesフィールド自体が存在しないため)。
function computeNewlyDiscoveredModes(events: readonly DestructionEvent[], discoveredModes: ReadonlySet<DestructionModeId>): readonly DestructionModeId[] {
  const seen = new Set<DestructionModeId>();
  const result: DestructionModeId[] = [];
  for (const event of events) {
    if (!discoveredModes.has(event.mode) && !seen.has(event.mode)) {
      seen.add(event.mode);
      result.push(event.mode);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// applyRunOutcome(5.1節・5.2節)
// ---------------------------------------------------------------------------

// 検証順序(二層構造、固定): ①store action層がpure関数呼び出し前にlease取得状態を検証する
// (未取得ならpure関数を呼ばずleaseNotAcquiredを返す、本ファイルのスコープ外)。
// ②pure関数内部(本関数)はsaveId→lease→runSequence→全装備preflight→適用の順で固定する。
// rebindにより所有権を失った古いタブが、既適用済みのrunSequenceを持つenvelopeを再送しても、
// 先にstaleLeaseで拒否される(runSequenceを先に見ると「旧タブ拒否」契約が崩れるため)。
export function applyRunOutcome(
  envelope: RunApplicationEnvelope,
  currentInventory: PlayerInventory,
  discoveredModes: ReadonlySet<DestructionModeId>,
  saveMeta: SaveEnvelopeMeta,
): ApplyRunOutcomeResult {
  if (envelope.runKey.saveId !== saveMeta.saveId) return { ok: false, error: { kind: 'saveIdMismatch' } };
  if (envelope.leaseToken !== saveMeta.leaseToken) return { ok: false, error: { kind: 'staleLease' } };

  const { runSequence } = envelope.runKey;
  if (runSequence >= saveMeta.nextRunSequence) return { ok: false, error: { kind: 'invalidRunSequence' } };
  if (runSequence <= saveMeta.lastAppliedRunSequence) {
    // 正常な冪等skip(エラーではない)。inventory/discoveredModes/saveMetaは一切更新しない。
    return {
      ok: true,
      result: { runKey: envelope.runKey, applied: false, newlyDiscoveredModes: [], rewardsGrantedG: 0, resolvedDegradations: [], consumedEquipmentIds: [] },
      nextInventory: currentInventory,
      nextDiscoveredModes: discoveredModes,
      nextSaveMeta: saveMeta,
    };
  }

  const integrity = validateEquipmentSnapshotIntegrity(envelope.equipmentSnapshot, currentInventory);
  if (!integrity.ok) return { ok: false, error: { kind: 'missingEquipment', role: integrity.role } };

  const resolution = resolveDegradationDiffs(envelope.outcome.degradationDiffs, envelope.equipmentSnapshot, currentInventory);
  if (!resolution.ok) return { ok: false, error: { kind: 'missingEquipment', role: resolution.role } };

  const { nextInventory: inventoryAfterDegradation, resolvedDegradations, consumedEquipmentIds } = applyResolvedDegradations(currentInventory, resolution.resolved);
  const newlyDiscoveredModes = computeNewlyDiscoveredModes(envelope.outcome.events, discoveredModes);
  const nextDiscoveredModes = new Set([...discoveredModes, ...newlyDiscoveredModes]);

  // 図鑑初回登録報酬(spec §5.1/§7.5)。PROVISIONAL_DISCOVERY_REWARD_GはPhase5経済結線までの
  // 機構実証用provisional値であり較正値ではない(実額はPhase5バランス調整で確定する)。
  // 新規発見モード数に比例して原子的に付与する(単一setで反映されるnextInventoryへ含める)。
  const rewardsGrantedG = PROVISIONAL_DISCOVERY_REWARD_G * newlyDiscoveredModes.length;
  const nextInventory: PlayerInventory = { ...inventoryAfterDegradation, cashG: inventoryAfterDegradation.cashG + rewardsGrantedG };

  const nextSaveMeta: SaveEnvelopeMeta = { ...saveMeta, lastAppliedRunSequence: runSequence, pendingApplication: null };

  return {
    ok: true,
    result: { runKey: envelope.runKey, applied: true, newlyDiscoveredModes, rewardsGrantedG, resolvedDegradations, consumedEquipmentIds },
    nextInventory,
    nextDiscoveredModes,
    nextSaveMeta,
  };
}

// 呼び出し前提: saveMeta.pendingApplication !== null(呼び出し側=store action層が保証する)。
// この関数自体はpendingApplication===nullの場合の呼び出しを想定しない(precondition)。
export function retryPendingApplication(saveMeta: SaveEnvelopeMeta, currentInventory: PlayerInventory, discoveredModes: ReadonlySet<DestructionModeId>): ApplyRunOutcomeResult {
  const envelope = saveMeta.pendingApplication as RunApplicationEnvelope;
  return applyRunOutcome(envelope, currentInventory, discoveredModes, saveMeta);
}

// pendingApplicationをnullへ戻すだけで、lastAppliedRunSequenceには触れない(高水位が自然に飛び越える)。
// 同一セッション内で放棄する場合、呼び出し側(store action)がcurrentRunSequenceも同じ単一setで
// nullへ更新する(軽微条件3)。
export function abandonPendingApplication(saveMeta: SaveEnvelopeMeta): SaveEnvelopeMeta {
  return { ...saveMeta, pendingApplication: null };
}

// leaseを新所有者へ原子的に引き継ぐ。saveId・runSequence・RunOutcome・equipmentSnapshotは
// 一切変更せず、leaseToken・leaseHeartbeatAtだけを更新する単一の変換として実装する。
// pendingApplicationの有無に関わらず、lease取得/再取得の唯一の経路として使う(pendingが
// nullの場合はleaseToken/heartbeatの更新のみ行う)。nowは依存注入(4.4節の方針、touchLeaseHeartbeat
// と同様にテストで偽時計を注入できるようにする)。
export function rebindLeaseForPendingApplication(saveMeta: SaveEnvelopeMeta, newLeaseToken: string, now: string): SaveEnvelopeMeta {
  return {
    ...saveMeta,
    leaseToken: newLeaseToken,
    leaseHeartbeatAt: now,
    pendingApplication: saveMeta.pendingApplication === null ? null : { ...saveMeta.pendingApplication, leaseToken: newLeaseToken },
  };
}

// ---------------------------------------------------------------------------
// 4.1節: lease stale判定(境界規則: 20000ms以上でstale、不正ISO・未来時刻は安全側でstale)
// ---------------------------------------------------------------------------

export const LEASE_STALE_THRESHOLD_MS = 20_000;

// 偽時計を注入できる純粋関数(4.4節の依存注入方針)。heartbeat間隔5秒のタイマー管理自体は
// saveStore.ts(サブステップ3)側の責務であり、本関数は「与えられた2時刻からstale/freshを
// 判定する」ことだけを行う。
// 安全側の規則: leaseHeartbeatAt・nowのいずれかがパース不能な場合、および経過時間が負
// (leaseHeartbeatAtがnowより未来=時計スキュー等)の場合は、いずれもstale扱いとする
// (「新鮮」と誤判定して所有権を永久に奪えなくなることを避ける)。
export function isLeaseHeartbeatStale(leaseHeartbeatAt: string, now: string): boolean {
  const heartbeatMs = Date.parse(leaseHeartbeatAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(heartbeatMs) || !Number.isFinite(nowMs)) return true;
  const elapsedMs = nowMs - heartbeatMs;
  if (elapsedMs < 0) return true;
  return elapsedMs >= LEASE_STALE_THRESHOLD_MS;
}

// ---------------------------------------------------------------------------
// 4.3節: heartbeat所有権guard
// ---------------------------------------------------------------------------

// 呼ぶたびに所有権を再確認し、既に他タブへ所有権が移っていれば書き込まず、呼び出し側が
// タイマーを停止する(no-op、null)。
export function touchLeaseHeartbeat(saveMeta: SaveEnvelopeMeta, runtimeLeaseToken: string, now: string): SaveEnvelopeMeta | null {
  if (saveMeta.leaseToken !== runtimeLeaseToken) return null;
  return { ...saveMeta, leaseHeartbeatAt: now };
}
