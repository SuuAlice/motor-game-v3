// P3-0サブステップ3(docs/phase3-p3-0-plan.md v7、3節・4節・5節・6節・7節)。
// 統合永続store本体。brabit_mot3実装(8.3節)。alice_mot3所有のsrc/engine/・
// src/materials/degradationApplication.ts・src/store/runOutcomeApplication.tsの
// 純粋ロジックをここから呼び出すが、それら自体は変更しない。
//
// Suuレビュー(2026-08-02T16:15)の必須修正10点を反映: 全action(lease評価・heartbeat・
// 購入・サルベージ・装備変更・進捗・実験ノート・原子的適用)は、メモリ内state ではなく
// 「今この瞬間のlocalStorage実体」を読み直してから判定・書き込みする(必須1)。
// production配線(App.tsxからのstartLeaseLifecycle呼び出し、待機/pending/破損UI境界)は
// saveStore.ts外(App.tsx等)で行う——本ファイルはそのために必要なaction/selectorを提供する。
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { MotorConfig } from '../engine/motorPhysics';
import type { CarConfig, EnergyBreakdown, VehicleSimState } from '../engine/vehiclePhysics';
import { restoreRunSnapshot } from '../engine/destructionOrchestration';
import type { DestructionModeId } from '../engine/destructionModes';

// engine/destructionModes.ts(alice所有)はDestructionModeId型のみをexportし、
// 全モードidの配列を持たないため、ここ(saveStore.ts)で列挙を保持する
// (型定義自体は変更しない、layer境界での意図的な重複)。D08はPhase5・D10はPhase4の
// ためこの一覧に含めない(spec §7.1・§12)。
const DESTRUCTION_MODE_IDS: readonly DestructionModeId[] = ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D09'];
import type { DegradationDiff, RunOutcome } from '../engine/destructionOrchestration';
import type { BearingAssemblyState, BodyPartState, EquipmentRole, InventoryItem, PlayerInventory, RotorAssemblyState, StackableStockEntry, WearState } from '../materials/inventoryItem';
import { GEAR_TOTAL_TOOTH_COUNT } from '../materials/inventoryItem';
import { BATTERY_MATERIALS, BODY_MATERIALS, BRUSH_MATERIALS, COATING_MATERIALS, GEAR_MATERIALS, MAGNET_MATERIALS, WIRE_MATERIALS } from '../materials/materials';
import { DEFAULT_GARAGE_SELECTION, type GarageSelection } from '../data/partPresets';
import type { CourseProgress, CourseRunRecord } from './gameStore';
import type { ExperimentSession, CourseRunNotebookRecord, SessionEvent } from './notebookStore';

// 追補5(Suuレビュー2026-08-02T17:00): InventoryItem.materialId等がmaterials.tsの
// family別ID集合に実在することまで検証する(架空materialIdの混入を防ぐ)。
const MAGNET_MATERIAL_ID_SET = new Set<string>(MAGNET_MATERIALS.map((m) => m.id));
const GEAR_MATERIAL_ID_SET = new Set<string>(GEAR_MATERIALS.map((m) => m.id));
const BATTERY_MATERIAL_ID_SET = new Set<string>(BATTERY_MATERIALS.map((m) => m.id));
const BRUSH_MATERIAL_ID_SET = new Set<string>(BRUSH_MATERIALS.map((m) => m.id));
const WIRE_MATERIAL_ID_SET = new Set<string>(WIRE_MATERIALS.map((m) => m.id));
const COATING_MATERIAL_ID_SET = new Set<string>(COATING_MATERIALS.map((m) => m.id));
const BODY_MATERIAL_ID_SET = new Set<string>(BODY_MATERIALS.map((m) => m.id));

// notebookStore.tsが実験ノートJSON書き出し(parseNotebookJson)でも参照するため、
// ここ(saveStore.ts)で定義しnotebookStore.ts側からimportする(saveStore.ts→
// notebookStore.tsの値importを作らないことで、notebookStore.tsがuseSaveStoreを
// importする既存の依存方向との循環importを避ける)。
export const NOTEBOOK_LIMIT = 50;
import {
  applyRunOutcome,
  abandonPendingApplication as pureAbandonPendingApplication,
  beginRun as pureBeginRun,
  createInitialPlayerInventoryAndLoadout,
  isLeaseHeartbeatStale,
  rebindLeaseForPendingApplication,
  retryPendingApplication as pureRetryPendingApplication,
  touchLeaseHeartbeat,
  validateEquipmentLoadout,
  type ApplyRunOutcomeResult,
  type CodexRecordEntry,
  type EquipmentIdSnapshot,
  type EquipmentLoadout,
  type PendingNotebookRecord,
  type RunApplicationEnvelope,
  type SaveEnvelopeMeta,
  type VehicleTestRunNotebookRecord,
} from './runOutcomeApplication';
import {
  confirmSalvage,
  purchaseCart as purchaseCartPure,
  purchaseMaterial,
  type CartLine,
  type PurchaseResult,
  type SalvageConfirmResult,
  type ShopEconomyState,
} from './shopEconomy';
import type { MaterialId } from '../materials/materials';

// ---------------------------------------------------------------------------
// 3.1節: slice構成・既定値
// ---------------------------------------------------------------------------

// 層境界(inventoryItem.ts/shopEconomy.ts等と同じ意図的な重複パターン): saveStore.tsは
// gameStore.ts/notebookStore.tsの値をimportしない(gameStore.tsがsaveStore.tsを
// importするため、逆方向の値importは循環依存になる)。デフォルト値は本ファイル内で
// 独立して保持し、gameStore.ts側の初期値と数値が一致するよう保守する。
// coilTurns等の数値はspec docs/spec.md §3.7 設計目標の「適正パラメータ」(旧gameStore.ts
// DEFAULT_CONFIG、P3-0で本ファイルへ移管)。
const DEFAULT_MOTOR_CONFIG: MotorConfig = {
  coilTurns: 80,
  slitWidthMm: 1.5,
  sandingQuality: 0.9,
  brushPressure: 0.3,
  magnetStrength: 1.0,
  magnetDistanceMm: 10,
  batteryVoltage: 3.0,
  axisOffsetMm: 0,
  wireGaugeMm: 0.4,
  parallelStrands: 1,
  varnished: true,
};

const DEFAULT_CAR_CONFIG: CarConfig = {
  massG: 150,
  gearRatio: 4,
  gearEfficiency: 0.8,
  wheelDiameterMm: 30,
  tireGrip: 0.7,
  axleFriction: 0,
  wheelAlignmentMm: 0,
  centerOfMassHeightMm: 20,
  motorMountOffsetMm: 0,
};

export interface ProgressSlice {
  diagnosisProgress: Record<string, boolean>;
  courseProgress: Record<string, CourseProgress>;
  selectedTrackId: string;
  testRunCompleted: boolean;
  config: MotorConfig;
  carConfig: CarConfig;
  garageSelection: GarageSelection;
}

function defaultProgress(): ProgressSlice {
  return {
    diagnosisProgress: {},
    courseProgress: {},
    selectedTrackId: 'straight-10m',
    testRunCompleted: false,
    config: { ...DEFAULT_MOTOR_CONFIG },
    carConfig: { ...DEFAULT_CAR_CONFIG },
    garageSelection: { ...DEFAULT_GARAGE_SELECTION },
  };
}

export interface NotebookSlice {
  sessions: ExperimentSession[];
  courseRuns: CourseRunNotebookRecord[];
  vehicleTestRuns: VehicleTestRunNotebookRecord[];
}

function defaultNotebook(): NotebookSlice {
  return { sessions: [], courseRuns: [], vehicleTestRuns: [] };
}

export interface EncyclopediaSlice {
  discoveredModes: readonly DestructionModeId[];
  codexRecords: readonly CodexRecordEntry[];
}

function defaultEncyclopedia(): EncyclopediaSlice {
  return { discoveredModes: [], codexRecords: [] };
}

export interface IdCounters {
  nextItemCounter: number;
  nextAssemblyCounter: number;
}

function defaultIdCounters(): IdCounters {
  return { nextItemCounter: 1, nextAssemblyCounter: 1 };
}

// 4.1節: bootstrap直後は常にstale判定される過去日時(leaseToken空文字列と対で「未取得」を表す)
const EPOCH_PAST_ISO = new Date(0).toISOString();

function defaultSaveMeta(saveId: string): SaveEnvelopeMeta {
  return {
    saveId,
    lastAppliedRunSequence: 0,
    nextRunSequence: 1,
    leaseToken: '',
    leaseHeartbeatAt: EPOCH_PAST_ISO,
    pendingApplication: null,
  };
}

export interface PersistedSaveState {
  schemaVersion: number;
  progress: ProgressSlice;
  notebook: NotebookSlice;
  inventory: PlayerInventory;
  equipmentLoadout: EquipmentLoadout;
  encyclopedia: EncyclopediaSlice;
  saveMeta: SaveEnvelopeMeta;
  idCounters: IdCounters;
}

const SCHEMA_VERSION = 1;
const SAVE_KEY = 'v16:save';
const V15_PROGRESS_KEY = 'v15:progress';
const V15_NOTEBOOK_KEY = 'v15:notebook';

function generateRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function freshBootstrap(): PersistedSaveState {
  const { inventory, loadout } = createInitialPlayerInventoryAndLoadout();
  return {
    schemaVersion: SCHEMA_VERSION,
    progress: defaultProgress(),
    notebook: defaultNotebook(),
    inventory,
    equipmentLoadout: loadout,
    encyclopedia: defaultEncyclopedia(),
    saveMeta: defaultSaveMeta(generateRandomId()),
    idCounters: defaultIdCounters(),
  };
}

// ---------------------------------------------------------------------------
// 必須10: localStorage I/Oの成否を明確に区別する。
// 「グローバルlocalStorageが存在しない環境(Node/vitest等、ブラウザ以外)」と
// 「localStorageは存在するがgetItem/setItemが例外を投げる(プライベートブラウズ・
// 容量超過等の実運用上の失敗)」を区別し、後者だけを本物のI/Oエラーとして扱う
// (前者を毎回I/Oエラー扱いするとNode環境のテストが全滅する。本アプリはCLAUDE.md
// により静的ブラウザアプリとして配布されるため、実運用ではlocalStorage自体は常に
// 存在する前提でよい)。
// ---------------------------------------------------------------------------

type RawReadResult = { kind: 'value'; raw: string } | { kind: 'absent' } | { kind: 'unavailableEnvironment' } | { kind: 'ioError' };

function readRaw(key: string): RawReadResult {
  if (typeof localStorage === 'undefined') return { kind: 'unavailableEnvironment' };
  try {
    const v = localStorage.getItem(key);
    return v === null ? { kind: 'absent' } : { kind: 'value', raw: v };
  } catch {
    return { kind: 'ioError' };
  }
}

type RawWriteResult = 'ok' | 'unavailableEnvironment' | 'ioError';

function writeRaw(key: string, value: string): RawWriteResult {
  if (typeof localStorage === 'undefined') return 'unavailableEnvironment';
  try {
    localStorage.setItem(key, value);
    return 'ok';
  } catch {
    return 'ioError';
  }
}

// ---------------------------------------------------------------------------
// 6.2節: zustand persist wrapper形のruntime検証
// ---------------------------------------------------------------------------

interface PersistWrapper<T> {
  state: T;
  version: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonNegativeInteger(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v >= 0;
}

function isValidIsoString(v: unknown): v is string {
  return typeof v === 'string' && Number.isFinite(Date.parse(v));
}

function parseWrapper(raw: string): { ok: true; wrapper: PersistWrapper<unknown> } | { ok: false } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false };
  const candidate = parsed as Record<string, unknown>;
  if (!('state' in candidate) || typeof candidate.state !== 'object' || candidate.state === null) return { ok: false };
  if (typeof candidate.version !== 'number') return { ok: false };
  return { ok: true, wrapper: { state: candidate.state, version: candidate.version } };
}

function isValidMotorConfig(v: unknown): v is MotorConfig {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  const requiredFinite = ['coilTurns', 'slitWidthMm', 'sandingQuality', 'brushPressure', 'magnetStrength', 'magnetDistanceMm', 'axisOffsetMm'];
  if (!requiredFinite.every((key) => isFiniteNumber(c[key]))) return false;
  if (c.batteryVoltage !== 1.5 && c.batteryVoltage !== 3 && c.batteryVoltage !== 3.0) return false;
  const optionalFinite = ['wireGaugeMm', 'wireResistivityRatio', 'wireDensityRatio', 'batteryInternalResistanceRatio', 'batteryCapacityRatio'];
  if (!optionalFinite.every((key) => c[key] === undefined || isFiniteNumber(c[key]))) return false;
  if (c.parallelStrands !== undefined && c.parallelStrands !== 1 && c.parallelStrands !== 2) return false;
  if (c.varnished !== undefined && typeof c.varnished !== 'boolean') return false;
  return true;
}

function isValidCarConfig(v: unknown): v is CarConfig {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  const required = ['massG', 'gearRatio', 'gearEfficiency', 'wheelDiameterMm', 'tireGrip', 'axleFriction', 'wheelAlignmentMm', 'centerOfMassHeightMm', 'motorMountOffsetMm'];
  return required.every((key) => isFiniteNumber(c[key]));
}

function isValidGarageSelection(v: unknown): v is GarageSelection {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  const required = ['chassisId', 'gearId', 'wheelId', 'tireId', 'batteryId', 'batteryPosition', 'bodyColorId', 'accentColorId'];
  return required.every((key) => typeof c[key] === 'string');
}

function isValidCourseRunRecord(v: unknown): v is CourseRunRecord {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  const statuses: VehicleSimState['status'][] = ['ready', 'running', 'finished', 'stalled', 'derailed', 'overheated'];
  if (!statuses.includes(c.status as VehicleSimState['status'])) return false;
  if (!isFiniteNumber(c.elapsedTimeS) || !isFiniteNumber(c.energyUsedJ) || !isFiniteNumber(c.positionM)) return false;
  if (typeof c.normalAchieved !== 'boolean' || typeof c.exAchieved !== 'boolean') return false;
  if (!isValidIsoString(c.completedAt)) return false;
  return true;
}

function isValidCourseProgressEntry(v: unknown): v is CourseProgress {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (!isNonNegativeInteger(c.attempts)) return false;
  if (typeof c.normalCompleted !== 'boolean' || typeof c.exCompleted !== 'boolean') return false;
  if (!Array.isArray(c.achievedObjectiveIds) || !c.achievedObjectiveIds.every((id) => typeof id === 'string')) return false;
  if (!isValidCourseRunRecord(c.last)) return false;
  if (c.previous !== undefined && !isValidCourseRunRecord(c.previous)) return false;
  if (c.best !== undefined && !isValidCourseRunRecord(c.best)) return false;
  return true;
}

function isValidCourseProgressRecord(v: unknown): v is Record<string, CourseProgress> {
  if (!v || typeof v !== 'object') return false;
  return Object.values(v as Record<string, unknown>).every(isValidCourseProgressEntry);
}

function isValidDiagnosisProgress(v: unknown): v is Record<string, boolean> {
  if (!v || typeof v !== 'object') return false;
  return Object.values(v as Record<string, unknown>).every((value) => typeof value === 'boolean');
}

// ---------------------------------------------------------------------------
// 必須6: PlayerInventory/装備/実験ノート/図鑑/RunApplicationEnvelopeの深い検証
// ---------------------------------------------------------------------------

// 追補5: 各fractionが設計上の抽象スカラー[0,1]の範囲内にあることまで検証する
// (docs/spec.md §5.2、src/materials/inventoryItem.tsのWearStateコメント参照)。
function isValidFraction(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0 && v <= 1;
}

function isValidWearState(v: unknown): v is WearState {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (c.kind === 'magnet') return isValidFraction(c.demagnetizationFraction);
  if (c.kind === 'gear') {
    // 追補2(2026-08-02T17:43再レビュー、必須修正4): gear総歯数は単一の設計較正値定数
    // GEAR_TOTAL_TOOTH_COUNT(=10、inventoryItem.ts「軽微条件1」)からのみ取り得る。
    // 任意の非負整数(0を含む)を許容すると経済合成が0/0になり得るため、完全一致を要求する。
    if (c.totalToothCount !== GEAR_TOTAL_TOOTH_COUNT) return false;
    if (!isNonNegativeInteger(c.toothLossCount)) return false;
    if ((c.toothLossCount as number) > (c.totalToothCount as number)) return false;
    return isValidFraction(c.seizureFraction);
  }
  if (c.kind === 'brush') return isValidFraction(c.wearFraction);
  return false;
}

// 追補5: familyとwearState.kindの対応(magnet+gear wear等の不一致を拒否)、および
// materialIdがmaterials.tsの対応familyの集合に実在することまで検証する。
function isValidInventoryItem(v: unknown): v is InventoryItem {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (typeof c.itemId !== 'string' || typeof c.materialId !== 'string') return false;
  if (c.family === 'battery') return c.wearState === undefined && BATTERY_MATERIAL_ID_SET.has(c.materialId);
  if (c.family === 'magnet') return MAGNET_MATERIAL_ID_SET.has(c.materialId) && isValidWearState(c.wearState) && (c.wearState as Record<string, unknown>).kind === 'magnet';
  if (c.family === 'gear') return GEAR_MATERIAL_ID_SET.has(c.materialId) && isValidWearState(c.wearState) && (c.wearState as Record<string, unknown>).kind === 'gear';
  if (c.family === 'brush') return BRUSH_MATERIAL_ID_SET.has(c.materialId) && isValidWearState(c.wearState) && (c.wearState as Record<string, unknown>).kind === 'brush';
  return false;
}

function isValidStackableStockEntry(v: unknown): v is StackableStockEntry {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (typeof c.materialId !== 'string') return false;
  if (c.family === 'wire') return WIRE_MATERIAL_ID_SET.has(c.materialId) && isFiniteNumber(c.quantityM) && (c.quantityM as number) >= 0;
  if (c.family === 'coating') return COATING_MATERIAL_ID_SET.has(c.materialId) && isFiniteNumber(c.quantityMl) && (c.quantityMl as number) >= 0;
  return false;
}

function isValidPlayerInventory(v: unknown): v is PlayerInventory {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (!isFiniteNumber(c.cashG) || c.cashG < 0) return false;
  if (!Array.isArray(c.items) || !c.items.every(isValidInventoryItem)) return false;
  const items = c.items as InventoryItem[];
  const itemIds = items.map((i) => i.itemId);
  if (new Set(itemIds).size !== itemIds.length) return false; // 追補5: itemId一意性
  if (!Array.isArray(c.stackableStock) || !c.stackableStock.every(isValidStackableStockEntry)) return false;
  if (!Array.isArray(c.rotorAssemblies) || !c.rotorAssemblies.every((r) => {
    if (!r || typeof r !== 'object') return false;
    const rr = r as Record<string, unknown>;
    if (typeof rr.assemblyId !== 'string') return false;
    if (rr.sourceWireMaterialId !== null && !(typeof rr.sourceWireMaterialId === 'string' && WIRE_MATERIAL_ID_SET.has(rr.sourceWireMaterialId))) return false;
    if (!isFiniteNumber(rr.consumedWireM) || (rr.consumedWireM as number) < 0) return false;
    return typeof rr.collapsed === 'boolean' && typeof rr.burnedOut === 'boolean';
  })) return false;
  const rotorIds = (c.rotorAssemblies as RotorAssemblyState[]).map((r) => r.assemblyId);
  if (new Set(rotorIds).size !== rotorIds.length) return false;
  if (!Array.isArray(c.bodyParts) || !c.bodyParts.every((b) => {
    if (!b || typeof b !== 'object') return false;
    const bb = b as Record<string, unknown>;
    return typeof bb.assemblyId === 'string' && typeof bb.materialId === 'string' && BODY_MATERIAL_ID_SET.has(bb.materialId) && isValidFraction(bb.scorchFraction);
  })) return false;
  const bodyIds = (c.bodyParts as BodyPartState[]).map((b) => b.assemblyId);
  if (new Set(bodyIds).size !== bodyIds.length) return false;
  if (!Array.isArray(c.bearingAssemblies) || !c.bearingAssemblies.every((b) => {
    if (!b || typeof b !== 'object') return false;
    const bb = b as Record<string, unknown>;
    if (typeof bb.assemblyId !== 'string' || typeof bb.gearItemId !== 'string') return false;
    if (!isValidFraction(bb.seizureFraction)) return false;
    // 追補5: gearItemIdは実在するgear個体のitemIdを指す(参照整合)
    return items.some((i) => i.itemId === bb.gearItemId && i.family === 'gear');
  })) return false;
  const bearingIds = (c.bearingAssemblies as BearingAssemblyState[]).map((b) => b.assemblyId);
  if (new Set(bearingIds).size !== bearingIds.length) return false;
  return true;
}

function isValidEquipmentLoadout(v: unknown): v is EquipmentLoadout {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  const requiredString = ['rotorAssemblyId', 'brushItemId', 'magnetItemId', 'gearItemId', 'bearingAssemblyId'];
  if (!requiredString.every((key) => typeof c[key] === 'string')) return false;
  if (c.batteryItemId !== null && typeof c.batteryItemId !== 'string') return false;
  if (c.bodyAssemblyId !== null && typeof c.bodyAssemblyId !== 'string') return false;
  return true;
}

// 追補5: EquipmentLoadoutの各IDがinventoryに実在することまで検証する(参照整合)。
// runOutcomeApplication.tsのvalidateEquipmentLoadoutはbatteryItemId===nullを
// エラー扱いするため直接は再利用できない(battery消費後のnullは正常な永続状態、1.3節)。
// ここではその null 許容版として、同じ参照整合ロジックを意図的に重複させる。
function isEquipmentLoadoutReferentiallyValid(loadout: EquipmentLoadout, inventory: PlayerInventory): boolean {
  if (!inventory.rotorAssemblies.some((r) => r.assemblyId === loadout.rotorAssemblyId)) return false;
  if (loadout.batteryItemId !== null && !inventory.items.some((i) => i.itemId === loadout.batteryItemId && i.family === 'battery')) return false;
  if (!inventory.items.some((i) => i.itemId === loadout.brushItemId && i.family === 'brush')) return false;
  if (!inventory.items.some((i) => i.itemId === loadout.magnetItemId && i.family === 'magnet')) return false;
  if (!inventory.items.some((i) => i.itemId === loadout.gearItemId && i.family === 'gear')) return false;
  const bearing = inventory.bearingAssemblies.find((b) => b.assemblyId === loadout.bearingAssemblyId);
  if (!bearing || bearing.gearItemId !== loadout.gearItemId) return false;
  if (loadout.bodyAssemblyId !== null && !inventory.bodyParts.some((b) => b.assemblyId === loadout.bodyAssemblyId)) return false;
  return true;
}

function isValidEquipmentIdSnapshot(v: unknown): v is EquipmentIdSnapshot {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  const common = ['rotorAssemblyId', 'batteryItemId', 'brushItemId', 'magnetItemId'];
  if (!common.every((key) => typeof c[key] === 'string')) return false;
  if (c.context === 'motor') return c.gearItemId === null && c.bearingAssemblyId === null && c.bodyAssemblyId === null;
  if (c.context === 'vehicle') {
    return typeof c.gearItemId === 'string' && typeof c.bearingAssemblyId === 'string'
      && (c.bodyAssemblyId === null || typeof c.bodyAssemblyId === 'string');
  }
  return false;
}

const DESTRUCTION_MODE_ID_SET = new Set<string>(DESTRUCTION_MODE_IDS);

// 追補5: role×kindの組合せをDegradationDiff判別unionの実バリアントどおりに固定する
// (「rotor+bogus」のような不正な組合せを拒否する。engine/destructionOrchestration.tsの
// DegradationDiff型定義と1:1で同期させること)。
// 追補2(2026-08-02T17:43再レビュー、必須修正4): deltaFraction/deltaCountは
// finiteだけでなく非負であることまで要求する。負の値をpending envelope経由で注入すると
// applyXxxDiff(alice所有、clampする側)を通じて既存の恒久損傷を「回復」できてしまうため。
function isValidNonNegativeFinite(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0;
}

function isValidDegradationDiff(v: unknown): v is DegradationDiff {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  switch (c.role) {
    case 'magnet':
      return (c.kind === 'demagnetization' || c.kind === 'scorch') && isValidNonNegativeFinite(c.deltaFraction);
    case 'gear':
      if (c.kind === 'toothLoss') return isNonNegativeInteger(c.deltaCount);
      if (c.kind === 'seizure') return isValidNonNegativeFinite(c.deltaFraction);
      return false;
    case 'bearing':
      return c.kind === 'seizure' && isValidNonNegativeFinite(c.deltaFraction);
    case 'brush':
      return c.kind === 'wear' && isValidNonNegativeFinite(c.deltaFraction);
    case 'rotor':
      return c.kind === 'collapse' || c.kind === 'burnout';
    case 'battery':
      return c.kind === 'consumed';
    case 'body':
      return c.kind === 'scorch' && isValidNonNegativeFinite(c.deltaFraction);
    default:
      return false;
  }
}

// 追補5: TemperatureReading/CauseLogCommon/モード別CauseLogの形状検証。
// engine/destructionModes.ts・destructionOrchestration.tsのprivate validatorは
// importできない(alice所有ファイルを変更しない)ため、型定義(export済み)に合わせて
// 意図的に重複させる(既存の層境界重複パターンと同じ、ファイル冒頭コメント参照)。
function isValidTemperatureReading(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (c.kind === 'measured') return isFiniteNumber(c.temperatureC);
  if (c.kind === 'uncalibratedGauge') return isFiniteNumber(c.ratio);
  return c.kind === 'unavailable';
}

function isValidCauseLogCommon(c: Record<string, unknown>): boolean {
  return isFiniteNumber(c.currentA) && isFiniteNumber(c.rpm) && isFiniteNumber(c.atT) && isValidTemperatureReading(c.temperature);
}

function isValidCauseLogForMode(mode: DestructionModeId, v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (!isValidCauseLogCommon(c)) return false;
  switch (mode) {
    case 'D01': return true;
    case 'D02': return isFiniteNumber(c.coilHeatGaugeRatio);
    case 'D03': return isFiniteNumber(c.batteryHeatRatio) && isFiniteNumber(c.shortCircuitDurationS);
    case 'D04':
      if (!isFiniteNumber(c.batteryHeatRatio) || !isFiniteNumber(c.shortCircuitDurationS)) return false;
      if (c.stage !== 'none' && c.stage !== 'swelling' && c.stage !== 'smoking' && c.stage !== 'burning') return false;
      return c.overDischargeRatio === null || isFiniteNumber(c.overDischargeRatio);
    case 'D05': return isFiniteNumber(c.sparkDurationS);
    case 'D06': return isFiniteNumber(c.loadTorqueNm) && isFiniteNumber(c.toothLossCount);
    case 'D07': return isFiniteNumber(c.magnetHeatGaugeRatio);
    case 'D09': return isFiniteNumber(c.bearingHeatGaugeRatio);
  }
}

// 追補5: physicsSnapshotAtT.stateは、有効と分かっているreplaySnapshot(template)の
// initialMotorState/initialVehicleStateを候補値で差し替えてrestoreRunSnapshotへ通す
// ことで検証する(Suu提案の「有効replaySnapshotのinitial stateを差し替えて検査する」
// 手法、alice所有の12段階検証をprivate関数importなしに再利用できる)。
function isValidPhysicsSnapshotAtT(v: unknown, template: Record<string, unknown>): boolean {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  const templateContext = (template.runContext as Record<string, unknown> | undefined)?.context;
  if (c.context !== templateContext) return false;
  if (c.context === 'motor') {
    return restoreRunSnapshot({ ...template, initialMotorState: c.state }).ok === true;
  }
  if (c.context === 'vehicle') {
    return restoreRunSnapshot({ ...template, initialVehicleState: c.state }).ok === true;
  }
  return false;
}

function isValidDestructionStateViaProbe(candidate: unknown, template: Record<string, unknown>): boolean {
  return restoreRunSnapshot({ ...template, initialDestructionState: candidate }).ok === true;
}

/**
 * RunOutcome.eventsは全モード共通でmode/causeLog/physicsSnapshotAtT/isFirstThisSessionを持ち、
 * D04はaffectedRoles、D06はisTotalLossを追加で持つ(UnstampedDestructionEvent判別union、
 * engine/destructionModes.ts)。templateは検証済みreplaySnapshot(生オブジェクト)。
 */
function isValidDestructionEventShape(v: unknown, template: Record<string, unknown>): boolean {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  const mode = c.mode;
  if (typeof mode !== 'string' || !DESTRUCTION_MODE_ID_SET.has(mode)) return false;
  if (!isValidCauseLogForMode(mode as DestructionModeId, c.causeLog)) return false;
  if (!isValidPhysicsSnapshotAtT(c.physicsSnapshotAtT, template)) return false;
  if (typeof c.isFirstThisSession !== 'boolean') return false;
  if (mode !== 'D05' && mode !== 'D06' && c.isFirstThisSession !== true) return false;
  if (mode === 'D04') {
    if (!Array.isArray(c.affectedRoles) || !c.affectedRoles.every((r) => r === 'body' || r === 'magnet')) return false;
  } else if (c.affectedRoles !== undefined) {
    return false;
  }
  if (mode === 'D06') {
    if (typeof c.isTotalLoss !== 'boolean') return false;
  } else if (c.isTotalLoss !== undefined) {
    return false;
  }
  return true;
}

const RUN_OUTCOME_END_REASONS = ['destructionTerminal', 'finished', 'stalled', 'derailed', 'overheated', 'energyExhausted', 'manualAbort'];

/**
 * RunOutcome全体の検証。replaySnapshotを先に検証し(既存restoreRunSnapshot、engine契約の
 * 実コード再利用)、それをtemplateとしてevents/destructionStateの深い検証に流用する。
 */
function isValidRunOutcome(v: unknown): v is RunOutcome {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (restoreRunSnapshot(c.replaySnapshot).ok !== true) return false;
  const template = c.replaySnapshot as Record<string, unknown>;
  if (typeof c.endReason !== 'string' || !RUN_OUTCOME_END_REASONS.includes(c.endReason)) return false;
  if (c.endReason === 'destructionTerminal') {
    if (!Array.isArray(c.terminalModes) || c.terminalModes.length === 0) return false;
    if (!c.terminalModes.every((m) => typeof m === 'string' && DESTRUCTION_MODE_ID_SET.has(m))) return false;
  } else if (c.terminalModes !== undefined) {
    return false; // 追補5: 非terminalなendReasonにterminalModesが存在してはならない
  }
  if (!Array.isArray(c.events) || !c.events.every((e) => isValidDestructionEventShape(e, template))) return false;
  if (!Array.isArray(c.degradationDiffs) || !c.degradationDiffs.every(isValidDegradationDiff)) return false;
  if (!isValidDestructionStateViaProbe(c.destructionState, template)) return false;
  return true;
}

function isValidEnergyBreakdown(v: unknown): v is EnergyBreakdown {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return ['driveJ', 'gearLossJ', 'slipLossJ', 'brushLossJ', 'heatJ'].every((key) => isFiniteNumber(c[key]));
}

const VEHICLE_STATUSES: readonly string[] = ['ready', 'running', 'finished', 'stalled', 'derailed', 'overheated'];
// 追補5: src/engine/motorPhysics.ts SessionEventType('coilCollapse'|'batteryOverheat'|'shortCircuit')の
// リテラル集合。engine/を変更しないため型のみimportし、値の一覧はここで意図的に重複させる。
const SESSION_EVENT_TYPES: readonly string[] = ['coilCollapse', 'batteryOverheat', 'shortCircuit'];

function isValidSessionEvent(v: unknown): v is SessionEvent {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return typeof c.type === 'string' && SESSION_EVENT_TYPES.includes(c.type) && isFiniteNumber(c.t);
}

// 追補5: NotebookSample(HistorySample+theta/batteryHeat/chattering/shorted/coilCollapsed)。
function isValidNotebookSample(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  const numFields = ['t', 'rpm', 'current', 'backEmf', 'theta', 'batteryHeat'];
  if (!numFields.every((f) => isFiniteNumber(c[f]))) return false;
  return typeof c.chattering === 'boolean' && typeof c.shorted === 'boolean' && typeof c.coilCollapsed === 'boolean';
}

// 追補5: CourseNotebookSample/TestRunSampleは構造上同一のフィールド集合を持つ
// (t/positionM/velocityMps/rpm/currentA/batteryHeat/slipRatio/isSlipping)。
function isValidVehicleRunSample(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  const numFields = ['t', 'positionM', 'velocityMps', 'rpm', 'currentA', 'batteryHeat', 'slipRatio'];
  if (!numFields.every((f) => isFiniteNumber(c[f]))) return false;
  return typeof c.isSlipping === 'boolean';
}

function isValidExperimentSession(v: unknown): v is ExperimentSession {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (typeof c.id !== 'string' || !isValidIsoString(c.startedAt) || !isValidIsoString(c.endedAt)) return false;
  if (!isValidMotorConfig(c.config)) return false;
  if (!isFiniteNumber(c.seed)) return false;
  const finiteFields = ['steadyRpm', 'averageCurrent', 'maxCurrent', 'currentRatio', 'rpmVariation', 'maxBatteryHeat'];
  if (!finiteFields.every((key) => isFiniteNumber(c[key]))) return false;
  if (!Array.isArray(c.events) || !c.events.every(isValidSessionEvent)) return false;
  if (!Array.isArray(c.samples) || !c.samples.every(isValidNotebookSample)) return false;
  return true;
}

function isValidCourseRunNotebookRecord(v: unknown): v is CourseRunNotebookRecord {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (typeof c.id !== 'string' || !isValidIsoString(c.savedAt) || typeof c.trackId !== 'string') return false;
  if (!isValidMotorConfig(c.motorConfig) || !isValidCarConfig(c.carConfig)) return false;
  if (!isFiniteNumber(c.seed) || !VEHICLE_STATUSES.includes(c.status as string)) return false;
  if (!isFiniteNumber(c.elapsedTimeS) || !isFiniteNumber(c.positionM) || !isFiniteNumber(c.energyUsedJ)) return false;
  if (!isValidEnergyBreakdown(c.energyBreakdown)) return false;
  if (!Array.isArray(c.samples) || !c.samples.every(isValidVehicleRunSample)) return false;
  return true;
}

function isValidVehicleTestRunNotebookRecord(v: unknown): v is VehicleTestRunNotebookRecord {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (typeof c.id !== 'string' || !isValidIsoString(c.savedAt)) return false;
  if (!isValidMotorConfig(c.motorConfig) || !isValidCarConfig(c.carConfig)) return false;
  if (!isFiniteNumber(c.seed) || !VEHICLE_STATUSES.includes(c.status as string)) return false;
  if (!isFiniteNumber(c.elapsedTimeS) || !isFiniteNumber(c.positionM) || !isFiniteNumber(c.energyUsedJ)) return false;
  if (!isValidEnergyBreakdown(c.energyBreakdown)) return false;
  if (!Array.isArray(c.samples) || !c.samples.every(isValidVehicleRunSample)) return false;
  return true;
}

function isValidPendingNotebookRecord(v: unknown): v is PendingNotebookRecord {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (c.kind === 'session') return isValidExperimentSession(c.record);
  if (c.kind === 'vehicleTestRun') return isValidVehicleTestRunNotebookRecord(c.record);
  if (c.kind === 'courseRun') return isValidCourseRunNotebookRecord(c.record);
  return false;
}

function isValidCodexRecordEntry(v: unknown): v is CodexRecordEntry {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (typeof c.modeId !== 'string' || !DESTRUCTION_MODE_ID_SET.has(c.modeId)) return false;
  // 追補2 必須修正4: runSequenceは1始まり(4.4節、saveMeta.nextRunSequenceの初期値も1)。
  if (!isNonNegativeInteger(c.firstDiscoveredAtRunSequence) || (c.firstDiscoveredAtRunSequence as number) < 1) return false;
  if (restoreRunSnapshot(c.replaySnapshot).ok !== true) return false;
  return true;
}

function isValidRunApplicationEnvelope(v: unknown): v is RunApplicationEnvelope {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (!c.runKey || typeof c.runKey !== 'object') return false;
  const runKey = c.runKey as Record<string, unknown>;
  if (typeof runKey.saveId !== 'string' || !isNonNegativeInteger(runKey.runSequence) || runKey.runSequence < 1) return false;
  if (typeof c.leaseToken !== 'string') return false;
  if (!isValidRunOutcome(c.outcome)) return false;
  if (!isValidEquipmentIdSnapshot(c.equipmentSnapshot)) return false;
  if (!isValidPendingNotebookRecord(c.notebookRecord)) return false;
  return true;
}

function isValidSaveEnvelopeMeta(v: unknown): v is SaveEnvelopeMeta {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (typeof c.saveId !== 'string' || c.saveId.length === 0) return false;
  if (!isNonNegativeInteger(c.lastAppliedRunSequence) || !isNonNegativeInteger(c.nextRunSequence)) return false;
  if ((c.nextRunSequence as number) < 1) return false;
  if ((c.lastAppliedRunSequence as number) >= (c.nextRunSequence as number)) return false;
  if (typeof c.leaseToken !== 'string') return false;
  if (!isValidIsoString(c.leaseHeartbeatAt)) return false;
  if (c.pendingApplication !== null && !isValidRunApplicationEnvelope(c.pendingApplication)) return false;
  return true;
}

function isValidIdCounters(v: unknown): v is IdCounters {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return isNonNegativeInteger(c.nextItemCounter) && c.nextItemCounter >= 1 && isNonNegativeInteger(c.nextAssemblyCounter) && c.nextAssemblyCounter >= 1;
}

/** v15:progressの各フィールドをそれぞれ独立に検証し、不正なフィールドだけ既定値へ差し替える(6.2節手順4)。 */
function migrateProgressFromV15(raw: unknown): ProgressSlice {
  const fallback = defaultProgress();
  if (!raw || typeof raw !== 'object') return fallback;
  const c = raw as Record<string, unknown>;
  return {
    diagnosisProgress: isValidDiagnosisProgress(c.diagnosisProgress) ? c.diagnosisProgress : fallback.diagnosisProgress,
    courseProgress: isValidCourseProgressRecord(c.courseProgress) ? (c.courseProgress as Record<string, CourseProgress>) : fallback.courseProgress,
    selectedTrackId: typeof c.selectedTrackId === 'string' ? c.selectedTrackId : fallback.selectedTrackId,
    testRunCompleted: typeof c.testRunCompleted === 'boolean' ? c.testRunCompleted : fallback.testRunCompleted,
    config: isValidMotorConfig(c.config) ? c.config : fallback.config,
    carConfig: isValidCarConfig(c.carConfig) ? c.carConfig : fallback.carConfig,
    garageSelection: isValidGarageSelection(c.garageSelection) ? c.garageSelection : fallback.garageSelection,
  };
}

/**
 * v15:notebookの各フィールドを検証する。追補5(Suuレビュー2026-08-02T17:00): 「フィールド単位
 * fallback」は配列内の不正要素だけを除外して部分採用する意味ではなく、フィールド全体が
 * 有効(=配列であり、かつ全要素が有効)である場合のみ採用し、1件でも不正要素があれば
 * フィールド全体を既定値(空配列)へ戻す(6.2節手順4の文言どおり)。
 */
function migrateNotebookFromV15(raw: unknown): { sessions: ExperimentSession[]; courseRuns: CourseRunNotebookRecord[] } {
  const fallback = { sessions: [] as ExperimentSession[], courseRuns: [] as CourseRunNotebookRecord[] };
  if (!raw || typeof raw !== 'object') return fallback;
  const c = raw as Record<string, unknown>;
  return {
    sessions: Array.isArray(c.sessions) && c.sessions.every(isValidExperimentSession) ? c.sessions : fallback.sessions,
    courseRuns: Array.isArray(c.courseRuns) && c.courseRuns.every(isValidCourseRunNotebookRecord) ? c.courseRuns : fallback.courseRuns,
  };
}

/** v16:save全体の検証(全slice)。1つでも不正なら全体を不採用とする(6.2節手順4、v16は部分信頼しない)。 */
function isValidPersistedSaveState(v: unknown): v is PersistedSaveState {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (c.schemaVersion !== SCHEMA_VERSION) return false;
  if (!c.progress || typeof c.progress !== 'object') return false;
  const p = c.progress as Record<string, unknown>;
  if (!isValidDiagnosisProgress(p.diagnosisProgress)) return false;
  if (!isValidCourseProgressRecord(p.courseProgress)) return false;
  if (typeof p.selectedTrackId !== 'string') return false;
  if (typeof p.testRunCompleted !== 'boolean') return false;
  if (!isValidMotorConfig(p.config)) return false;
  if (!isValidCarConfig(p.carConfig)) return false;
  if (!isValidGarageSelection(p.garageSelection)) return false;

  if (!c.notebook || typeof c.notebook !== 'object') return false;
  const n = c.notebook as Record<string, unknown>;
  if (!Array.isArray(n.sessions) || !n.sessions.every(isValidExperimentSession)) return false;
  if (!Array.isArray(n.courseRuns) || !n.courseRuns.every(isValidCourseRunNotebookRecord)) return false;
  if (!Array.isArray(n.vehicleTestRuns) || !n.vehicleTestRuns.every(isValidVehicleTestRunNotebookRecord)) return false;

  if (!isValidPlayerInventory(c.inventory)) return false;
  if (!isValidEquipmentLoadout(c.equipmentLoadout)) return false;
  // 追補5: EquipmentLoadoutの各IDがinventoryに実在することまで検証する(参照整合)。
  if (!isEquipmentLoadoutReferentiallyValid(c.equipmentLoadout as EquipmentLoadout, c.inventory as PlayerInventory)) return false;

  if (!c.encyclopedia || typeof c.encyclopedia !== 'object') return false;
  const enc = c.encyclopedia as Record<string, unknown>;
  if (!Array.isArray(enc.discoveredModes) || !enc.discoveredModes.every((m) => typeof m === 'string' && DESTRUCTION_MODE_ID_SET.has(m))) return false;
  if (!Array.isArray(enc.codexRecords) || !enc.codexRecords.every(isValidCodexRecordEntry)) return false;
  // modeId一意性(5.2節)
  const modeIds = enc.codexRecords.map((r: CodexRecordEntry) => r.modeId);
  if (new Set(modeIds).size !== modeIds.length) return false;
  if (enc.codexRecords.length > DESTRUCTION_MODE_IDS.length) return false;
  // 追補5: discoveredModesとcodexRecordsのmodeId集合は常に一致する(commitApplyResultが
  // nextDiscoveredModes/codexRecordsを同一setから同時に更新するため、5.2節の不変条件)。
  const discoveredSet = new Set(enc.discoveredModes as string[]);
  // 追補2 必須修正4: discoveredModes配列自体の重複も明示的に拒否する(codexとの
  // 突合せに頼らない、配列そのものの一意性)。
  if (discoveredSet.size !== enc.discoveredModes.length) return false;
  const codexModeSet = new Set<string>(modeIds);
  if (discoveredSet.size !== codexModeSet.size) return false;
  for (const m of discoveredSet) if (!codexModeSet.has(m)) return false;

  if (!isValidSaveEnvelopeMeta(c.saveMeta)) return false;
  if (!isValidIdCounters(c.idCounters)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// 必須1/必須10: v16:saveの読み取り・書き込みを一本化する(bootstrap・全gated actionが
// これを経由する。メモリ内stateではなく常にこの関数でlocalStorageの実体を読む)。
// ---------------------------------------------------------------------------

export type ReadLatestResult =
  | { kind: 'ok'; state: PersistedSaveState }
  | { kind: 'absent' }
  | { kind: 'corrupted' }
  | { kind: 'storageError' };

function readLatestV16(): ReadLatestResult {
  const r = readRaw(SAVE_KEY);
  if (r.kind === 'ioError') return { kind: 'storageError' };
  if (r.kind === 'unavailableEnvironment' || r.kind === 'absent') return { kind: 'absent' };
  const parsed = parseWrapper(r.raw);
  if (!parsed.ok) return { kind: 'corrupted' };
  // 追補5: parseWrapperはversionが数値であることしか見ないため、ここでSCHEMA_VERSION
  // との一致まで確認する(v15移行用の別バージョン番号の混入を拒否する)。
  if (parsed.wrapper.version !== SCHEMA_VERSION) return { kind: 'corrupted' };
  if (!isValidPersistedSaveState(parsed.wrapper.state)) return { kind: 'corrupted' };
  return { kind: 'ok', state: parsed.wrapper.state };
}

function writeV16(state: PersistedSaveState): RawWriteResult {
  return writeRaw(SAVE_KEY, JSON.stringify({ state, version: SCHEMA_VERSION }));
}

// ---------------------------------------------------------------------------
// 3.3節: bootstrap・migration手順
// ---------------------------------------------------------------------------

export type BootstrapResult =
  | { kind: 'ok'; state: PersistedSaveState }
  | { kind: 'corrupted' }
  | { kind: 'storageError' };

export function computeBootstrapResult(): BootstrapResult {
  const v16 = readLatestV16();
  if (v16.kind === 'ok') return { kind: 'ok', state: v16.state };
  if (v16.kind === 'corrupted') return { kind: 'corrupted' };
  if (v16.kind === 'storageError') return { kind: 'storageError' };

  // absent: v15からの移行、または新規初期化。
  const fresh = freshBootstrap();
  const v15Progress = readRaw(V15_PROGRESS_KEY);
  // 追補2(2026-08-02T17:43再レビュー、必須修正2): v15キーの読み取り自体がioErrorの場合、
  // 「存在しない」と区別できずfresh初期化で握り潰すと本物のstorage異常を隠してしまう。
  if (v15Progress.kind === 'ioError') return { kind: 'storageError' };
  if (v15Progress.kind === 'value') {
    const parsed = parseWrapper(v15Progress.raw);
    if (parsed.ok) fresh.progress = migrateProgressFromV15(parsed.wrapper.state);
  }
  const v15Notebook = readRaw(V15_NOTEBOOK_KEY);
  if (v15Notebook.kind === 'ioError') return { kind: 'storageError' };
  if (v15Notebook.kind === 'value') {
    const parsed = parseWrapper(v15Notebook.raw);
    if (parsed.ok) {
      const migrated = migrateNotebookFromV15(parsed.wrapper.state);
      fresh.notebook = { ...migrated, vehicleTestRuns: [] };
    }
  }
  // 3.3節手順3.e: 初回のv16:save永続化。v15:progress/v15:notebookキー自体は削除しない(手順4)。
  const writeResult = writeV16(fresh);
  if (writeResult === 'ioError') return { kind: 'storageError' };
  return { kind: 'ok', state: fresh };
}

// ---------------------------------------------------------------------------
// 4節: lease/runSequence状態機械
// ---------------------------------------------------------------------------

export type LeaseUiState = 'acquired' | 'leaseNotAcquired';

const HEARTBEAT_INTERVAL_MS = 5_000;
const WAITING_POLL_INTERVAL_MS = 1_000;

// ---------------------------------------------------------------------------
// 必須1/必須4/必須9共通: gated action基盤。全書き込みactionはここを経由し、
// 「今この瞬間のlocalStorage実体」に対してlease一致・(必要なら)pending非存在を検証してから
// 変換関数を適用し、書き込み成功後にのみメモリ上のreactive stateへ反映する
// (拒否時はメモリ上のstateを一切変更しない=必須9)。
// ---------------------------------------------------------------------------

export type GateError =
  | { kind: 'leaseNotAcquired' }
  | { kind: 'pendingApplicationExists' }
  | { kind: 'storageError' }
  | { kind: 'corrupted' };

/**
 * ブラウザ以外(Node/SSR/vitest等、グローバルlocalStorage自体が存在しない環境)かどうか。
 * この場合、複数タブ間で共有されるstorageという概念自体が成立しないため、lease機構
 * (4.1〜4.5節)は「このプロセス単独が常に所有者」という自明形へ縮退させる——読み直し・
 * 書き戻しの往復を行わず、現在のin-memory state(get())をそのまま「最新実体」とみなす。
 * 実運用のブラウザ環境(本アプリはCLAUDE.mdにより静的ブラウザアプリとして配布される)では
 * 常にlocalStorageが存在するため、この分岐は通らない。
 */
function hasBrowserStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/** SaveStoreの現在値からpersisted 8sliceだけを取り出す(このプロセスの「最新実体」代替)。 */
function snapshotFromMemory(s: SaveStore): PersistedSaveState {
  return {
    schemaVersion: s.schemaVersion,
    progress: s.progress,
    notebook: s.notebook,
    inventory: s.inventory,
    equipmentLoadout: s.equipmentLoadout,
    encyclopedia: s.encyclopedia,
    saveMeta: s.saveMeta,
    idCounters: s.idCounters,
  };
}

// ---------------------------------------------------------------------------
// 追補2(Suuレビュー2026-08-02T17:00): lease/heartbeatタイマーのライフサイクル管理を
// 一本化する。旧実装はstopLeaseLifecycle()自体を「所有権喪失時の後始末」に流用しており、
// これがlifecycleActive相当の状態も一緒に殺してしまうため、heartbeatで所有権を失っても
// 待機ポーリングが二度と始まらずUIが永久待機になる欠陥があった。ここでは
// 「lifecycleが起動中かどうか」を明示的なフラグとして持ち、所有権喪失時は
// heartbeatタイマーだけを止めて待機ポーリングへ切り替える(lifecycle自体は止めない)。
// ---------------------------------------------------------------------------

let lifecycleActive = false;

function stopTimers(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (waitingPollTimer) clearInterval(waitingPollTimer);
  heartbeatTimer = null;
  waitingPollTimer = null;
}

function startHeartbeatTimer(get: () => SaveStore): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => get().touchHeartbeatOnce(new Date().toISOString()), HEARTBEAT_INTERVAL_MS);
}

function startWaitingPollTimer(get: () => SaveStore): void {
  if (waitingPollTimer) return;
  waitingPollTimer = setInterval(() => {
    get()._evaluateLeaseOnce(new Date().toISOString());
    if (get().leaseState === 'acquired') {
      if (waitingPollTimer) clearInterval(waitingPollTimer);
      waitingPollTimer = null;
      startHeartbeatTimer(get);
    }
  }, WAITING_POLL_INTERVAL_MS);
}

/**
 * lease所有権の喪失を検知した箇所すべてから呼ぶ共通処理(追補2 bullet4/5)。
 * heartbeatタイマーだけを止めてleaseStateをwaitingへ同期し、lifecycleが起動中
 * (startLeaseLifecycle呼び出し後、stopLeaseLifecycle前)であれば待機ポーリングを
 * 開始する。stopLeaseLifecycle自体は呼ばない(lifecycleActiveをfalseにしてしまうと
 * 待機ポーリングが二度と始まらなくなるため)。
 */
function loseLeaseAndResumeWaiting(set: (partial: Partial<SaveStore>) => void, get: () => SaveStore, fresh: PersistedSaveState): void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  applyFreshStateToStore(set, fresh, { leaseState: 'leaseNotAcquired' });
  if (lifecycleActive) startWaitingPollTimer(get);
}

/** storage自体の読み書き失敗・破損を検知した箇所すべてから呼ぶ共通処理(追補2 bullet1/3)。 */
function markStorageFailure(set: (partial: Partial<SaveStore>) => void, kind: 'corrupted' | 'storageError'): void {
  set({ bootstrapError: bootstrapErrorMessage(kind) });
  stopTimers();
  lifecycleActive = false;
}

/**
 * 追補2(2026-08-02T17:43再レビュー、必須修正2): writeV16の呼び出し・失敗時の
 * markStorageFailure呼び出しをこの一箇所へ集約する。全gated actionはwriteV16を直接
 * 呼ばず、必ずこの関数を経由すること(構造的に「書き込み失敗時にbootstrapErrorが
 * 立たない経路」を作れなくする)。
 */
function writeOrFail(set: (partial: Partial<SaveStore>) => void, nextState: PersistedSaveState): boolean {
  const writeResult = writeV16(nextState);
  if (writeResult === 'ioError') {
    markStorageFailure(set, 'storageError');
    return false;
  }
  return true;
}

/**
 * v16:save実体を読み、storage失敗/破損/lease不一致を区別したまま返す(必須1/追補2)。
 * ブラウザ外環境ではin-memory stateを「最新実体」として扱う(既存の縮退規則)。
 * lease不一致・storage失敗を検知した時点でメモリ上のUI状態(leaseState/bootstrapError)も
 * ここで同期する(呼び出し元ごとにばらばらに変換しない、追補2の核心)。
 */
// 追補2の型注記: 戻り値のerrorは「一つのオブジェクト内でkindがunion」ではなく、
// 「ok:falseの形自体がkindごとに異なるunionメンバー」として定義する。前者(単一オブジェクト
// 型のプロパティがunion)はTypeScriptの代入互換性チェックが自動分配しないため、呼び出し元で
// 個別のkind別戻り値型(SaveStore.performApplyRunOutcome等)へ素通しできなくなる。
type ReadFreshForApplyResult =
  | { ok: true; fresh: PersistedSaveState }
  | { ok: false; error: { kind: 'storageError' } }
  | { ok: false; error: { kind: 'corrupted' } }
  | { ok: false; error: { kind: 'leaseNotAcquired' } };

function readFreshForApply(
  set: (partial: Partial<SaveStore>) => void,
  get: () => SaveStore,
): ReadFreshForApplyResult {
  if (!hasBrowserStorage()) return { ok: true, fresh: snapshotFromMemory(get()) };
  const latest = readLatestV16();
  if (latest.kind === 'storageError') {
    markStorageFailure(set, 'storageError');
    return { ok: false, error: { kind: 'storageError' } };
  }
  if (latest.kind === 'corrupted') {
    markStorageFailure(set, 'corrupted');
    return { ok: false, error: { kind: 'corrupted' } };
  }
  if (latest.kind === 'absent') {
    // 追補2: bootstrap後はここに来ないはずの整合性異常(実行中のv16キー消失)。
    // 黙って一時的なstorageErrorを返すだけでは3.2節の停止契約と不一致になるため、
    // 他の異常系と同じくbootstrapErrorを立ててlifecycleを止める。
    markStorageFailure(set, 'storageError');
    return { ok: false, error: { kind: 'storageError' } };
  }
  const fresh = latest.state;
  if (fresh.saveMeta.leaseToken !== get().runtimeLeaseToken) {
    loseLeaseAndResumeWaiting(set, get, fresh);
    return { ok: false, error: { kind: 'leaseNotAcquired' } };
  }
  return { ok: true, fresh };
}

function readGatedFreshState(
  set: (partial: Partial<SaveStore>) => void,
  get: () => SaveStore,
  requirePendingNull: boolean,
): { ok: true; fresh: PersistedSaveState } | { ok: false; error: GateError } {
  const base = readFreshForApply(set, get);
  if (!base.ok) return base;
  const fresh = base.fresh;
  if (requirePendingNull && fresh.saveMeta.pendingApplication !== null) {
    if (hasBrowserStorage()) applyFreshStateToStore(set, fresh); // 他タブ発の新規pendingを表示へ反映する
    return { ok: false, error: { kind: 'pendingApplicationExists' } };
  }
  return { ok: true, fresh };
}

function gateErrorToReasonJa(error: GateError): string {
  switch (error.kind) {
    case 'leaseNotAcquired': return '前回セッションの終了を確認しています(lease未取得)';
    case 'pendingApplicationExists': return '前回の走行結果が保留中のため操作できません';
    case 'storageError': return 'セーブデータへのアクセスに失敗しました';
    case 'corrupted': return 'セーブデータの読み込みに失敗しました';
  }
}

/** performApplyRunOutcome/retryPendingApplicationAction/commitApplyResultが返す拒否理由を日本語化する(SaveGate.tsx等が使う)。 */
export function applyOutcomeErrorReasonJa(kind: string): string {
  switch (kind) {
    case 'staleLease': return 'この端末の保存権限が失われました。他のタブで開いている可能性があります。';
    case 'saveIdMismatch': return 'セーブデータが別のものに切り替わったため、この記録は適用できません。';
    case 'invalidRunSequence': return '走行記録の順序が不正です。';
    case 'missingEquipment': return '該当する装備が見つからないため保存できません。装備を確認してください。';
    case 'storageError': return 'セーブデータへの書き込みに失敗しました。';
    case 'corrupted': return 'セーブデータの読み込みに失敗しました。';
    case 'noPendingApplication': return '保留中の結果がありません。';
    case 'leaseNotAcquired': return '前回セッションの終了を確認しています。';
    default: return '保存にまだ失敗しています。もう一度お試しください。';
  }
}

// 追補2: commitApplyResultの書き込み失敗(writeV16のioError)は、ApplyRunOutcomeError
// (alice所有・frozen)にはない`storageError`として返す(旧実装のstaleLeaseへの
// 誤変換を修正する)。
export type CommitApplyOutcome = ApplyRunOutcomeResult | { ok: false; error: { kind: 'storageError' } };

// ---------------------------------------------------------------------------
// store本体
// ---------------------------------------------------------------------------

export interface SaveStore {
  // persisted(PersistedSaveStateの各slice、readGatedFreshState経由の書き込み成功後にのみ更新される)
  schemaVersion: number;
  progress: ProgressSlice;
  notebook: NotebookSlice;
  inventory: PlayerInventory;
  equipmentLoadout: EquipmentLoadout;
  encyclopedia: EncyclopediaSlice;
  saveMeta: SaveEnvelopeMeta;
  idCounters: IdCounters;

  // runtimeのみ(3.1節「非persist state」)
  currentRunSequence: number | null;
  runtimeLeaseToken: string;
  leaseState: LeaseUiState;
  pendingRunEquipmentSnapshot: EquipmentIdSnapshot | null;
  // beginRunAction時点のsaveMeta.saveIdを固定保持する。performApplyRunOutcomeが
  // 適用直前に読み直す「最新の」saveIdではなくこちらを使うことで、run実行中にセーブ全体が
  // 別物へ差し替わった(saveIdが変わった)場合をsaveIdMismatchとして検出できるようにする
  // (5.1節の意図: 所有権を失った/別セーブへ切り替わったタブの古いrunを弾く)。
  pendingRunSaveId: string | null;
  bootstrapError: string | null;

  // 4節: lease状態機械(いずれも最新のv16:save実体を読んで判定する、必須1)
  _evaluateLeaseOnce: (nowIso: string) => void;
  touchHeartbeatOnce: (nowIso: string) => void;
  startLeaseLifecycle: () => void;
  stopLeaseLifecycle: () => void;

  // 4.5節P1: 全saveStore書き込みactionの共通事前ゲート(表示用の粗い判定。実際のゲートは
  // 各actionがreadGatedFreshStateで最新実体に対して行う)
  isLeaseAcquired: () => boolean;

  // 進捗(gameStore.tsからミラーされる、3節)。拒否時はfalseを返しgameStore側がローカル
  // stateを変更しないようにする(必須9)
  updateProgress: (partial: Partial<ProgressSlice>) => boolean;

  // 実験ノート(6.4節、3腕自動trim)
  addSessionRecord: (session: ExperimentSession) => { ok: true } | { ok: false; reason: string };
  addCourseRunRecord: (record: CourseRunNotebookRecord) => { ok: true } | { ok: false; reason: string };
  addVehicleTestRunRecord: (record: VehicleTestRunNotebookRecord) => { ok: true } | { ok: false; reason: string };
  clearNotebook: () => { ok: true } | { ok: false; reason: string };
  replaceSessionsRecord: (sessions: ExperimentSession[]) => { ok: true } | { ok: false; reason: string };

  // 4.4節: runSequence発行。追補2: storage失敗/破損をleaseNotAcquiredへ偽変換しない。
  beginRunAction: (context: 'motor' | 'vehicle') => ReturnType<typeof pureBeginRun> | { ok: false; reason: 'storageError' } | { ok: false; reason: 'corrupted' };

  // 5節: 原子的適用
  performApplyRunOutcome: (outcome: RunOutcome, notebookRecord: PendingNotebookRecord) => CommitApplyOutcome | { ok: false; error: { kind: 'leaseNotAcquired' } } | { ok: false; error: { kind: 'noActiveRun' } } | { ok: false; error: { kind: 'corrupted' } };
  retryPendingApplicationAction: () => CommitApplyOutcome | { ok: false; error: { kind: 'leaseNotAcquired' } } | { ok: false; error: { kind: 'noPendingApplication' } } | { ok: false; error: { kind: 'corrupted' } };
  abandonPendingApplicationAction: () => { ok: true } | { ok: false; reason: string };

  // 1節: 装備
  setEquipmentLoadout: (loadout: EquipmentLoadout) => { ok: true } | { ok: false; reason: string; missingRole?: EquipmentRole };

  // 1.4節/店(brabit実装、alice提供ロジックを呼ぶ)
  purchaseMaterialAction: (materialId: MaterialId) => PurchaseResult;
  purchaseCartAction: (cartLines: readonly CartLine[]) => PurchaseResult;
  salvageAction: (itemId: string) => SalvageConfirmResult;
}

function toShopEconomyState(inventory: PlayerInventory, nextItemCounter: number): ShopEconomyState {
  return { ...inventory, nextSessionIdCounter: nextItemCounter };
}

function fromShopEconomyState(state: ShopEconomyState): { inventory: PlayerInventory; nextItemCounter: number } {
  const { nextSessionIdCounter, ...inventory } = state;
  return { inventory, nextItemCounter: nextSessionIdCounter };
}

function isEquipped(loadout: EquipmentLoadout, id: string): boolean {
  return (
    loadout.rotorAssemblyId === id
    || loadout.batteryItemId === id
    || loadout.brushItemId === id
    || loadout.magnetItemId === id
    || loadout.gearItemId === id
    || loadout.bearingAssemblyId === id
    || loadout.bodyAssemblyId === id
  );
}

/** 単一のsetでpersisted全sliceを最新実体へ同期する(必須1)。runtime専用fieldはextraで個別に指定する。 */
function applyFreshStateToStore(set: (partial: Partial<SaveStore>) => void, next: PersistedSaveState, extra: Partial<SaveStore> = {}): void {
  set({
    schemaVersion: next.schemaVersion,
    progress: next.progress,
    notebook: next.notebook,
    inventory: next.inventory,
    equipmentLoadout: next.equipmentLoadout,
    encyclopedia: next.encyclopedia,
    saveMeta: next.saveMeta,
    idCounters: next.idCounters,
    ...extra,
  });
}

// 必須7: 購入前後のgear itemId集合を比較し、新規に増えたgear個体1件につき1件のbearingを
// 生成する(末尾要素だけを見る旧実装の欠陥を修正。カート購入・複数個購入・中間行/非末尾gear・
// quantity>1いずれにも対応する)。
function autogenBearingsForNewGears(
  beforeInventory: PlayerInventory,
  afterInventory: PlayerInventory,
  idCounters: IdCounters,
): { inventory: PlayerInventory; idCounters: IdCounters } {
  const beforeIds = new Set(beforeInventory.items.filter((i) => i.family === 'gear').map((i) => i.itemId));
  const newGearItemIds = afterInventory.items.filter((i) => i.family === 'gear' && !beforeIds.has(i.itemId)).map((i) => i.itemId);
  let bearingAssemblies = afterInventory.bearingAssemblies;
  let nextAssemblyCounter = idCounters.nextAssemblyCounter;
  for (const gearItemId of newGearItemIds) {
    if (bearingAssemblies.some((b) => b.gearItemId === gearItemId)) continue; // 冪等性
    const assemblyId = `assembly-${String(nextAssemblyCounter).padStart(4, '0')}`;
    bearingAssemblies = [...bearingAssemblies, { assemblyId, gearItemId, seizureFraction: 0 }];
    nextAssemblyCounter += 1;
  }
  return { inventory: { ...afterInventory, bearingAssemblies }, idCounters: { ...idCounters, nextAssemblyCounter } };
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let waitingPollTimer: ReturnType<typeof setInterval> | null = null;

const bootstrap = computeBootstrapResult();
const runtimeLeaseToken = generateRandomId();

function bootstrapErrorMessage(kind: 'corrupted' | 'storageError'): string {
  return kind === 'corrupted' ? 'セーブデータの読み込みに失敗しました' : 'セーブデータへのアクセスに失敗しました';
}

export const useSaveStore = create<SaveStore>()(
  persist(
    (set, get) => ({
      schemaVersion: bootstrap.kind === 'ok' ? bootstrap.state.schemaVersion : SCHEMA_VERSION,
      progress: bootstrap.kind === 'ok' ? bootstrap.state.progress : defaultProgress(),
      notebook: bootstrap.kind === 'ok' ? bootstrap.state.notebook : defaultNotebook(),
      inventory: bootstrap.kind === 'ok' ? bootstrap.state.inventory : createInitialPlayerInventoryAndLoadout().inventory,
      equipmentLoadout: bootstrap.kind === 'ok' ? bootstrap.state.equipmentLoadout : createInitialPlayerInventoryAndLoadout().loadout,
      encyclopedia: bootstrap.kind === 'ok' ? bootstrap.state.encyclopedia : defaultEncyclopedia(),
      saveMeta: bootstrap.kind === 'ok' ? bootstrap.state.saveMeta : defaultSaveMeta(generateRandomId()),
      idCounters: bootstrap.kind === 'ok' ? bootstrap.state.idCounters : defaultIdCounters(),

      currentRunSequence: null,
      runtimeLeaseToken,
      leaseState: 'leaseNotAcquired',
      pendingRunEquipmentSnapshot: null,
      pendingRunSaveId: null,
      bootstrapError: bootstrap.kind === 'ok' ? null : bootstrapErrorMessage(bootstrap.kind),

      // 4.2節: 状態遷移(ケース1〜3)。必須1: 常に最新のlocalStorage実体を読んで判定する。
      _evaluateLeaseOnce: (nowIso) => {
        if (get().bootstrapError) return; // 3.2節: 破損時はゲームプレイ状態を一切書き換えない
        if (!hasBrowserStorage()) {
          // ブラウザ外(Node/SSR/テスト等): 共有storageが存在せずクロスタブ調整が
          // そもそも成立しないため、このプロセスを常にlease所有者として扱う。
          // saveMeta.leaseTokenもruntimeLeaseTokenへ同期しておく(readGatedFreshState等の
          // 「fresh.saveMeta.leaseToken===runtimeLeaseToken」判定と整合させるため)。
          set((s) => ({ leaseState: 'acquired', saveMeta: { ...s.saveMeta, leaseToken: s.runtimeLeaseToken } }));
          return;
        }
        const latest = readLatestV16();
        if (latest.kind === 'storageError' || latest.kind === 'corrupted') {
          markStorageFailure(set, latest.kind);
          return;
        }
        // 追補2(2026-08-02T17:43再レビュー、必須修正2): bootstrap後にv16キー自体が消失する
        // (実行中の外部操作等)のは3.2節の想定外異常系であり、黙って何もしない旧実装では
        // このタブが通常画面に残り続けてしまう。storageErrorと同じ停止扱いにする。
        if (latest.kind === 'absent') {
          markStorageFailure(set, 'storageError');
          return;
        }
        const fresh = latest.state;
        const token = get().runtimeLeaseToken;
        if (fresh.saveMeta.leaseToken === token) {
          applyFreshStateToStore(set, fresh, { leaseState: 'acquired' });
          return;
        }
        const stale = fresh.saveMeta.leaseToken === '' || isLeaseHeartbeatStale(fresh.saveMeta.leaseHeartbeatAt, nowIso);
        if (!stale) {
          applyFreshStateToStore(set, fresh, { leaseState: 'leaseNotAcquired' });
          return;
        }
        const rebound = rebindLeaseForPendingApplication(fresh.saveMeta, token, nowIso);
        const nextState: PersistedSaveState = { ...fresh, saveMeta: rebound };
        if (!writeOrFail(set, nextState)) return;
        applyFreshStateToStore(set, nextState, { leaseState: 'acquired' });
        if (rebound.pendingApplication !== null) get().retryPendingApplicationAction();
      },

      // 追補2 bullet3: latestがcorrupted/storageErrorの場合はbootstrapErrorへ正しく反映し
      // (旧実装はleaseNotAcquiredへ丸めていた)、heartbeat write自体の失敗も無視せず
      // 同様に扱う。所有権喪失時はloseLeaseAndResumeWaitingでheartbeatだけを止めて
      // 待機ポーリングへ切り替える(旧実装のstopLeaseLifecycle呼び出しは待機ポーリングも
      // 道連れに止めてしまい、UIが永久待機になる欠陥があった)。
      touchHeartbeatOnce: (nowIso) => {
        if (!hasBrowserStorage()) return; // 共有storageがなければheartbeatに意味がない
        const latest = readLatestV16();
        if (latest.kind === 'storageError' || latest.kind === 'corrupted') {
          markStorageFailure(set, latest.kind);
          return;
        }
        if (latest.kind === 'absent') {
          markStorageFailure(set, 'storageError');
          return;
        }
        const fresh = latest.state;
        const result = touchLeaseHeartbeat(fresh.saveMeta, get().runtimeLeaseToken, nowIso);
        if (result === null) {
          loseLeaseAndResumeWaiting(set, get, fresh);
          return;
        }
        const nextState: PersistedSaveState = { ...fresh, saveMeta: result };
        if (!writeOrFail(set, nextState)) return;
        applyFreshStateToStore(set, nextState);
      },

      startLeaseLifecycle: () => {
        lifecycleActive = true;
        stopTimers();
        get()._evaluateLeaseOnce(new Date().toISOString());
        if (get().bootstrapError !== null) return;
        if (get().leaseState === 'acquired') {
          startHeartbeatTimer(get);
        } else {
          startWaitingPollTimer(get);
        }
      },

      stopLeaseLifecycle: () => {
        lifecycleActive = false;
        stopTimers();
      },

      isLeaseAcquired: () => get().leaseState === 'acquired' && get().bootstrapError === null,

      // ---------------------------------------------------------------------
      // 3節: 進捗ミラー(gameStore.ts経由、4.5節P1のlease事前ゲート対象)
      // ---------------------------------------------------------------------
      updateProgress: (partial) => {
        const gate = readGatedFreshState(set, get, true);
        if (!gate.ok) return false;
        const nextState: PersistedSaveState = { ...gate.fresh, progress: { ...gate.fresh.progress, ...partial } };
        if (!writeOrFail(set, nextState)) return false;
        applyFreshStateToStore(set, nextState);
        return true;
      },

      // ---------------------------------------------------------------------
      // 6.4節: 実験ノート3腕、自動trim(確認UIなし)
      // ---------------------------------------------------------------------
      addSessionRecord: (session) => {
        const gate = readGatedFreshState(set, get, true);
        if (!gate.ok) return { ok: false, reason: gateErrorToReasonJa(gate.error) };
        const nextState: PersistedSaveState = { ...gate.fresh, notebook: { ...gate.fresh.notebook, sessions: [session, ...gate.fresh.notebook.sessions].slice(0, NOTEBOOK_LIMIT) } };
        if (!writeOrFail(set, nextState)) return { ok: false, reason: gateErrorToReasonJa({ kind: 'storageError' }) };
        applyFreshStateToStore(set, nextState);
        return { ok: true };
      },
      addCourseRunRecord: (record) => {
        const gate = readGatedFreshState(set, get, true);
        if (!gate.ok) return { ok: false, reason: gateErrorToReasonJa(gate.error) };
        const nextState: PersistedSaveState = { ...gate.fresh, notebook: { ...gate.fresh.notebook, courseRuns: [record, ...gate.fresh.notebook.courseRuns].slice(0, NOTEBOOK_LIMIT) } };
        if (!writeOrFail(set, nextState)) return { ok: false, reason: gateErrorToReasonJa({ kind: 'storageError' }) };
        applyFreshStateToStore(set, nextState);
        return { ok: true };
      },
      addVehicleTestRunRecord: (record) => {
        const gate = readGatedFreshState(set, get, true);
        if (!gate.ok) return { ok: false, reason: gateErrorToReasonJa(gate.error) };
        const nextState: PersistedSaveState = { ...gate.fresh, notebook: { ...gate.fresh.notebook, vehicleTestRuns: [record, ...gate.fresh.notebook.vehicleTestRuns].slice(0, NOTEBOOK_LIMIT) } };
        if (!writeOrFail(set, nextState)) return { ok: false, reason: gateErrorToReasonJa({ kind: 'storageError' }) };
        applyFreshStateToStore(set, nextState);
        return { ok: true };
      },
      clearNotebook: () => {
        const gate = readGatedFreshState(set, get, true);
        if (!gate.ok) return { ok: false, reason: gateErrorToReasonJa(gate.error) };
        const nextState: PersistedSaveState = { ...gate.fresh, notebook: defaultNotebook() };
        if (!writeOrFail(set, nextState)) return { ok: false, reason: gateErrorToReasonJa({ kind: 'storageError' }) };
        applyFreshStateToStore(set, nextState);
        return { ok: true };
      },
      replaceSessionsRecord: (sessions) => {
        const gate = readGatedFreshState(set, get, true);
        if (!gate.ok) return { ok: false, reason: gateErrorToReasonJa(gate.error) };
        const nextState: PersistedSaveState = { ...gate.fresh, notebook: { ...gate.fresh.notebook, sessions: sessions.slice(0, NOTEBOOK_LIMIT) } };
        if (!writeOrFail(set, nextState)) return { ok: false, reason: gateErrorToReasonJa({ kind: 'storageError' }) };
        applyFreshStateToStore(set, nextState);
        return { ok: true };
      },

      // ---------------------------------------------------------------------
      // 4.4節: runSequence発行(pure beginRunがpendingApplication!==nullを既に検証するため、
      // ここではlease一致だけを最新実体から取り、requirePendingNullはfalseにする)
      // ---------------------------------------------------------------------
      beginRunAction: (context) => {
        // 追補2 bullet1: storageError/corrupted/write失敗をleaseNotAcquiredへ丸めず、
        // それぞれ区別して返す(旧実装は全てleaseNotAcquired扱いだった)。
        const gate = readGatedFreshState(set, get, false);
        if (!gate.ok) {
          if (gate.error.kind === 'storageError') return { ok: false, reason: 'storageError' };
          if (gate.error.kind === 'corrupted') return { ok: false, reason: 'corrupted' };
          return { ok: false, reason: 'leaseNotAcquired' };
        }
        const fresh = gate.fresh;
        const result = pureBeginRun(fresh.equipmentLoadout, fresh.inventory, context, fresh.saveMeta, get().currentRunSequence, true);
        if (result.ok) {
          const nextState: PersistedSaveState = { ...fresh, saveMeta: result.nextSaveMeta };
          if (!writeOrFail(set, nextState)) return { ok: false, reason: 'storageError' };
          applyFreshStateToStore(set, nextState, { currentRunSequence: result.runSequence, pendingRunEquipmentSnapshot: result.equipmentSnapshot, pendingRunSaveId: fresh.saveMeta.saveId });
        }
        return result;
      },

      // ---------------------------------------------------------------------
      // 5.1/5.2/5.3節: applyRunOutcomeの原子的適用(単一set、14ケース)。lease一致のみを
      // 最新実体から確認する(pendingApplicationの生成・解決自体がこのactionの役割のため
      // requirePendingNullは使わない)。
      // ---------------------------------------------------------------------
      performApplyRunOutcome: (outcome, notebookRecord) => {
        // 追補2: storage失敗/破損/lease不一致の判定・UI状態同期をreadFreshForApplyへ
        // 一本化する(旧実装はここで個別に判定していた)。
        const latest = readFreshForApply(set, get);
        if (!latest.ok) return latest;
        const fresh = latest.fresh;
        if (get().currentRunSequence === null || get().pendingRunEquipmentSnapshot === null || get().pendingRunSaveId === null) {
          return { ok: false, error: { kind: 'noActiveRun' } };
        }
        const envelope: RunApplicationEnvelope = {
          // beginRunAction時点のsaveId(pendingRunSaveId)を使う。ここで最新実体のsaveIdを
          // 使うと、run実行中にセーブ全体が差し替わっても常に一致してしまいsaveIdMismatchが
          // 構造的に検出不能になる(必須の不変条件、上記フィールド定義のコメント参照)。
          runKey: { saveId: get().pendingRunSaveId as string, runSequence: get().currentRunSequence as number },
          leaseToken: get().runtimeLeaseToken,
          outcome,
          equipmentSnapshot: get().pendingRunEquipmentSnapshot as EquipmentIdSnapshot,
          notebookRecord,
        };
        const result = applyRunOutcome(envelope, fresh.inventory, new Set(fresh.encyclopedia.discoveredModes), fresh.saveMeta);
        return commitApplyResult(set, fresh, result, envelope, 'initial');
      },

      retryPendingApplicationAction: () => {
        // 追補2: 「retryボタン押下直前にleaseを失った」ケースもここでleaseNotAcquiredを
        // 検知し、readFreshForApply内部でleaseStateをwaitingへ同期する(SaveGateが
        // PendingScreenの代わりにWaitingScreenへ自動的に切り替わる)。
        const latest = readFreshForApply(set, get);
        if (!latest.ok) return latest;
        const fresh = latest.fresh;
        if (fresh.saveMeta.pendingApplication === null) return { ok: false, error: { kind: 'noPendingApplication' } };
        const envelope = fresh.saveMeta.pendingApplication;
        const result = pureRetryPendingApplication(fresh.saveMeta, fresh.inventory, new Set(fresh.encyclopedia.discoveredModes));
        return commitApplyResult(set, fresh, result, envelope, 'retry');
      },

      abandonPendingApplicationAction: () => {
        const gate = readGatedFreshState(set, get, false);
        if (!gate.ok) return { ok: false, reason: gateErrorToReasonJa(gate.error) };
        if (gate.fresh.saveMeta.pendingApplication === null) return { ok: false, reason: '保留中の結果がありません' };
        const nextSaveMeta = pureAbandonPendingApplication(gate.fresh.saveMeta);
        const nextState: PersistedSaveState = { ...gate.fresh, saveMeta: nextSaveMeta };
        if (!writeOrFail(set, nextState)) return { ok: false, reason: gateErrorToReasonJa({ kind: 'storageError' }) };
        // 軽微条件3: 同一セッション内放棄時はcurrentRunSequenceも同じ単一setでnull化する
        applyFreshStateToStore(set, nextState, { currentRunSequence: null, pendingRunEquipmentSnapshot: null, pendingRunSaveId: null });
        return { ok: true };
      },

      // ---------------------------------------------------------------------
      // 1節: 装備(EquipmentLoadout)
      // ---------------------------------------------------------------------
      setEquipmentLoadout: (loadout) => {
        const gate = readGatedFreshState(set, get, true);
        if (!gate.ok) return { ok: false, reason: gateErrorToReasonJa(gate.error) };
        const validated = validateEquipmentLoadout(loadout, gate.fresh.inventory);
        if (!validated.ok) return validated;
        const nextState: PersistedSaveState = { ...gate.fresh, equipmentLoadout: loadout };
        if (!writeOrFail(set, nextState)) return { ok: false, reason: gateErrorToReasonJa({ kind: 'storageError' }) };
        applyFreshStateToStore(set, nextState);
        return { ok: true };
      },

      // ---------------------------------------------------------------------
      // 店(purchaseMaterial/purchaseCart/confirmSalvage、alice提供ロジック+
      // 1.2節保護規則+1.4節bearing自動生成/自動削除、brabit実装)
      // ---------------------------------------------------------------------
      purchaseMaterialAction: (materialId) => {
        const gate = readGatedFreshState(set, get, true);
        if (!gate.ok) return { ok: false, reason: gateErrorToReasonJa(gate.error) };
        const fresh = gate.fresh;
        const shopState = toShopEconomyState(fresh.inventory, fresh.idCounters.nextItemCounter);
        const result = purchaseMaterial(shopState, materialId);
        if (!result.ok) return result;
        const { inventory: purchasedInventory, nextItemCounter } = fromShopEconomyState(result.state);
        const { inventory: nextInventory, idCounters: nextIdCounters } = autogenBearingsForNewGears(fresh.inventory, purchasedInventory, { ...fresh.idCounters, nextItemCounter });
        const nextState: PersistedSaveState = { ...fresh, inventory: nextInventory, idCounters: nextIdCounters };
        if (!writeOrFail(set, nextState)) return { ok: false, reason: gateErrorToReasonJa({ kind: 'storageError' }) };
        applyFreshStateToStore(set, nextState);
        return { ok: true, state: toShopEconomyState(nextInventory, nextIdCounters.nextItemCounter) };
      },

      purchaseCartAction: (cartLines) => {
        const gate = readGatedFreshState(set, get, true);
        if (!gate.ok) return { ok: false, reason: gateErrorToReasonJa(gate.error) };
        const fresh = gate.fresh;
        const shopState = toShopEconomyState(fresh.inventory, fresh.idCounters.nextItemCounter);
        const result = purchaseCartPure(shopState, cartLines);
        if (!result.ok) return result;
        const { inventory: purchasedInventory, nextItemCounter } = fromShopEconomyState(result.state);
        // 必須7: cartLines回数のループではなく、購入前後のgear itemId集合の差分から
        // 新規gear個体を確定し、各1件につき1件のbearingを生成する(重複行・quantity>1・
        // 非末尾gear・gearが複数種混在してもすべて正しく1:1になる)。
        const { inventory: nextInventory, idCounters: nextIdCounters } = autogenBearingsForNewGears(fresh.inventory, purchasedInventory, { ...fresh.idCounters, nextItemCounter });
        const nextState: PersistedSaveState = { ...fresh, inventory: nextInventory, idCounters: nextIdCounters };
        if (!writeOrFail(set, nextState)) return { ok: false, reason: gateErrorToReasonJa({ kind: 'storageError' }) };
        applyFreshStateToStore(set, nextState);
        return { ok: true, state: toShopEconomyState(nextInventory, nextIdCounters.nextItemCounter) };
      },

      salvageAction: (itemId) => {
        const gate = readGatedFreshState(set, get, true);
        if (!gate.ok) return { ok: false, reason: gateErrorToReasonJa(gate.error) };
        const fresh = gate.fresh;
        // 1.2節: 装備中個体のサルベージは明示的unequipを経ない限り拒否する
        if (isEquipped(fresh.equipmentLoadout, itemId)) {
          return { ok: false, reason: 'この個体は現在装備中のため、サルベージする前に装備を外してください' };
        }
        const shopState = toShopEconomyState(fresh.inventory, fresh.idCounters.nextItemCounter);
        const result = confirmSalvage(shopState, itemId);
        if (!result.ok) return result;
        const { inventory: salvagedInventory, nextItemCounter } = fromShopEconomyState(result.state);
        // 1.4節: ギヤのサルベージは対応するBearingAssemblyStateも同時に削除する
        const nextInventory: PlayerInventory = {
          ...salvagedInventory,
          bearingAssemblies: salvagedInventory.bearingAssemblies.filter((b) => salvagedInventory.items.some((item) => item.itemId === b.gearItemId)),
        };
        const nextState: PersistedSaveState = { ...fresh, inventory: nextInventory, idCounters: { ...fresh.idCounters, nextItemCounter } };
        if (!writeOrFail(set, nextState)) return { ok: false, reason: gateErrorToReasonJa({ kind: 'storageError' }) };
        applyFreshStateToStore(set, nextState);
        return { ok: true, state: toShopEconomyState(nextInventory, nextItemCounter), amountG: result.amountG };
      },
    }),
    {
      name: SAVE_KEY,
      version: SCHEMA_VERSION,
      // 必須5: zustand自身の起動時自動hydrate/mergeを無効化する。初期stateはモジュール
      // 読み込み時に既に計算済みのcomputeBootstrapResult()(runtime検証込み)から与えており、
      // zustandが未検証のlocalStorage内容で再mergeして検証を迂回することを防ぐ。
      skipHydration: true,
      // 追補2(stderr解消): 実際の永続化はwriteV16(本ファイル独自の検証・原子的I/O層)が
      // 単独で担う。zustand persistミドルウェア自身の自動書き込み(setごとのstorage.setItem)
      // をno-opにし、二重書き込みとブラウザ外環境での`Unable to update item`警告の両方を
      // 発生源から断つ(skipHydration自体は起動時の自動読み込みしか抑止しないため別途必要)。
      // 追補2(2026-08-02T17:43再レビュー、必須修正3): getItemが未検証のraw文字列を
      // 返してしまうと、誰かがuseSaveStore.persist.rehydrate()を手動で呼んだ場合に
      // runtime validator(isValidPersistedSaveState等)を一切経由せずmergeされてしまう
      // (skipHydration:trueは起動時の自動hydrateしか止めない)。本ミドルウェアは
      // 永続I/OをwriteV16/computeBootstrapResultへ完全に移譲する設計であるため、
      // getItemは常にnullを返し、手動rehydrate経路自体を閉じる(rehydrate()を呼んでも
      // 「永続値なし」としてno-opになり、in-memory stateは変化しない)。
      storage: createJSONStorage(() => ({
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      } satisfies StateStorage)),
      partialize: (s): PersistedSaveState => ({
        schemaVersion: s.schemaVersion,
        progress: s.progress,
        notebook: s.notebook,
        inventory: s.inventory,
        equipmentLoadout: s.equipmentLoadout,
        encyclopedia: s.encyclopedia,
        saveMeta: s.saveMeta,
        idCounters: s.idCounters,
      }),
    },
  ),
);

// 起動時に1回だけlease状態を評価する(4.2節)。単一タブの通常ケースでは
// saveMeta.leaseToken===''のためケース2に該当し、即座にacquiredへ遷移する。
// heartbeat/待機ポーリングの定期実行自体はstartLeaseLifecycle()(App.tsxのmountで呼ぶ、
// 必須2)を呼ぶまで開始しない(テスト環境でタイマーが残留することを避けるため、
// 単発評価とは分離する)。
if (useSaveStore.getState().bootstrapError === null) {
  useSaveStore.getState()._evaluateLeaseOnce(new Date().toISOString());
}

// ---------------------------------------------------------------------------
// applyRunOutcome/retryPendingApplicationの戻り値を、5.3節14ケース表どおりに単一setへ
// 反映する。initial/retryで解放条件が異なる箇所(表の「初回apply」列/「retry」列)を分岐させる。
// fresh(読み取り直後のPersistedSaveState)を土台に次stateを構築し、書き込み成功後にのみ
// メモリへ反映する(必須1・必須9)。
// ---------------------------------------------------------------------------
/**
 * 追補2 bullet2: writeV16の失敗(ioError)は「保存できなかった」という事実そのものであり、
 * staleLease(=他タブに所有権を奪われた)へ誤変換しない。専用のstorageErrorとして返し、
 * markStorageFailureでbootstrapError/lifecycleへも反映する。
 */
function commitApplyResult(
  set: (partial: Partial<SaveStore>) => void,
  fresh: PersistedSaveState,
  result: ApplyRunOutcomeResult,
  envelope: RunApplicationEnvelope,
  kind: 'initial' | 'retry',
): CommitApplyOutcome {
  if (result.ok) {
    if (result.result.applied) {
      const nextCodexRecords: CodexRecordEntry[] = [
        ...fresh.encyclopedia.codexRecords,
        ...result.result.newlyDiscoveredModes.map((modeId) => ({
          modeId,
          firstDiscoveredAtRunSequence: envelope.runKey.runSequence,
          replaySnapshot: envelope.outcome.replaySnapshot,
        })),
      ];
      const batteryConsumed = result.result.consumedEquipmentIds.some(
        (c) => c.role === 'battery' && c.id === fresh.equipmentLoadout.batteryItemId,
      );
      const nextEquipmentLoadout: EquipmentLoadout = batteryConsumed
        ? { ...fresh.equipmentLoadout, batteryItemId: null }
        : fresh.equipmentLoadout;
      const nextNotebook = appendNotebookRecord(fresh.notebook, envelope.notebookRecord);
      const nextState: PersistedSaveState = {
        ...fresh,
        inventory: result.nextInventory,
        equipmentLoadout: nextEquipmentLoadout,
        encyclopedia: { discoveredModes: [...result.nextDiscoveredModes], codexRecords: nextCodexRecords },
        notebook: nextNotebook,
        saveMeta: result.nextSaveMeta,
      };
      if (!writeOrFail(set, nextState)) return { ok: false, error: { kind: 'storageError' } };
      applyFreshStateToStore(set, nextState, { currentRunSequence: null, pendingRunEquipmentSnapshot: null, pendingRunSaveId: null });
      return result;
    }
    // 冪等skip: inventory等は更新しない。currentRunSequenceのみnull化。pendingApplicationはretryなら解放。
    const nextSaveMeta = kind === 'retry' ? { ...fresh.saveMeta, pendingApplication: null } : fresh.saveMeta;
    const nextState: PersistedSaveState = { ...fresh, saveMeta: nextSaveMeta };
    if (kind === 'retry' && !writeOrFail(set, nextState)) return { ok: false, error: { kind: 'storageError' } };
    applyFreshStateToStore(set, nextState, { currentRunSequence: null, pendingRunEquipmentSnapshot: null, pendingRunSaveId: null });
    return result;
  }

  // result.ok === false: 5.3節の条件表
  switch (result.error.kind) {
    case 'missingEquipment': {
      if (kind === 'initial') {
        const nextState: PersistedSaveState = { ...fresh, saveMeta: { ...fresh.saveMeta, pendingApplication: envelope } };
        if (!writeOrFail(set, nextState)) return { ok: false, error: { kind: 'storageError' } };
        applyFreshStateToStore(set, nextState);
      }
      // retryのmissingEquipmentはpendingApplicationをそのまま保持(何もしない)
      return result;
    }
    case 'saveIdMismatch':
    case 'staleLease':
    case 'invalidRunSequence':
      // pendingApplication・currentRunSequenceとも変更しない(表のとおり)。ただし最新実体との
      // 乖離を解消するため、メモリ上のreactive stateはfreshへ同期しておく(実害なし、必須1)。
      applyFreshStateToStore(set, fresh);
      return result;
    case 'leaseNotAcquired':
      // pure関数はこの値を生成しない。呼び出し元のperformApplyRunOutcome/
      // retryPendingApplicationAction自体が最新実体を見て早期returnする(ここへは到達しない)。
      return result;
  }
}

function appendNotebookRecord(notebook: NotebookSlice, record: PendingNotebookRecord): NotebookSlice {
  switch (record.kind) {
    case 'session':
      return { ...notebook, sessions: [record.record, ...notebook.sessions].slice(0, NOTEBOOK_LIMIT) };
    case 'vehicleTestRun':
      return { ...notebook, vehicleTestRuns: [record.record, ...notebook.vehicleTestRuns].slice(0, NOTEBOOK_LIMIT) };
    case 'courseRun':
      return { ...notebook, courseRuns: [record.record, ...notebook.courseRuns].slice(0, NOTEBOOK_LIMIT) };
  }
}

// テスト専用: モジュール読み込み時に1回だけ計算されるbootstrap結果と、実行中に生成された
// runtimeLeaseTokenをテストから参照できるようにする(偽時計・共有fake localStorageで
// 複数タブを模擬する等)。
export const __testOnly = {
  computeBootstrapResult,
  isValidPersistedSaveState,
  generateRandomId,
  freshBootstrap,
  readLatestV16,
  writeV16,
  GEAR_TOTAL_TOOTH_COUNT_REEXPORT: GEAR_TOTAL_TOOTH_COUNT,
  // 追補1: 14ケース表の各行(初回staleLease/saveIdMismatch等、performApplyRunOutcome経由では
  // 自然発生しない組合せを含む)をfixture結果からcommitApplyResultへ直接注入して検証できるようにする。
  commitApplyResult,
  // 追補5: 判別unionの深い検証を単体テストできるようにする。
  isValidRunOutcome,
  isValidDegradationDiff,
  isValidInventoryItem,
  isValidWearState,
  isValidPlayerInventory,
  isValidExperimentSession,
  isEquipmentLoadoutReferentiallyValid,
  SAVE_KEY,
  SCHEMA_VERSION,
};
