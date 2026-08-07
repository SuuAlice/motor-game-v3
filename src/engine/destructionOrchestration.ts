// P3-0(docs/phase3-p3-0-plan.md v7、docs/phase3-plan-v12.md)+P3-1(docs/phase3-p3-1-plan.md v7)。
// RunAccumulator操作・RunOutcome生成・RunSnapshot capture/restore・DestructionConfig検証・
// stepMotorWithDestruction(motor-onlyラッパー)を担う。`stepTestRunWithDestruction`・
// `stepTrackRunWithDestruction`はP3-2/P3-4以降で追加する。

import { computeElectricalState, didCollapseJustHappen, step } from './motorPhysics';
import type { MotorConfig, SimState } from './motorPhysics';
import type { CarConfig, FailureCode, VehicleSimState } from './vehiclePhysics';
import { createValidatedTrack } from './trackPhysics';
import type { TrackDefinition, ValidatedTrackDefinition } from './trackPhysics';
import { advanceDestructionState, createInitialDestructionState, validateFireExposureProfile } from './destructionModes';
import type {
  BatteryDestructionConfig,
  DestructionConfig,
  DestructionFrameInput,
  DestructionModeId,
  DestructionRunContext,
  DestructionState,
  FireExposureProfile,
  GearBreakageProfile,
  PhysicsSnapshotAtT,
  UnstampedDestructionEvent,
} from './destructionModes';

// 正式Fable P3-1-Q2(a)・P3-1-Q7(a)裁定(2026-08-03T09:05・2026-08-03T16:13確定): 型の所有は
// destructionModes.ts(leaf)。ここでは既存の公開importパスを維持するためre-exportのみ行う
// (公開面不変、契約変更ではない)。
export type { BatteryDestructionConfig, DestructionConfig, DestructionRunContext, FireExposureProfile, GearBreakageProfile };
export { validateFireExposureProfile };

// ---------------------------------------------------------------------------
// DegradationDiff・DestructionEvent(公開型)
// ---------------------------------------------------------------------------

export type DegradationDiff =
  | { role: 'magnet'; kind: 'demagnetization'; deltaFraction: number }
  | { role: 'magnet'; kind: 'scorch'; deltaFraction: number } // 適用先(demagnetizationFraction)はdemagnetizationと共有(v12 1.6節)
  | { role: 'gear'; kind: 'toothLoss'; deltaCount: number }
  | { role: 'gear'; kind: 'seizure'; deltaFraction: number }
  | { role: 'bearing'; kind: 'seizure'; deltaFraction: number }
  | { role: 'brush'; kind: 'wear'; deltaFraction: number }
  | { role: 'rotor'; kind: 'collapse' }
  | { role: 'rotor'; kind: 'burnout' }
  | { role: 'battery'; kind: 'consumed' }
  | { role: 'body'; kind: 'scorch'; deltaFraction: number };

// UnstampedDestructionEvent(destructionModes.ts)にphysicsSnapshotAtTを合成した公開形。
// 判別union `(A|B|...) & {x}` は `(A&{x})|(B&{x})|...` へ分配されるため、
// 各バリアントを手で再列挙せずに済む(意味は完全に同一)。
export type DestructionEvent = UnstampedDestructionEvent & { physicsSnapshotAtT: PhysicsSnapshotAtT };

// ---------------------------------------------------------------------------
// RunAccumulator
// ---------------------------------------------------------------------------

export interface RunAccumulator {
  events: readonly DestructionEvent[]; // このセッションで発生した全物理イベント(発生順、追記のみ)
  destructionState: DestructionState;
  replaySnapshot: RunSnapshot; // 走行開始時に1回だけ捕捉(以後不変)
  terminalModeCandidates: readonly DestructionModeId[]; // D02発火到達・D03・D04炎上到達・D06全損・D09焼付き
}

// 正式Fable P3-1-Q6(a)裁定(2026-08-03T09:05確定、人間再承認済み2026-08-04): batteryProfileを
// 独立引数として受け取らず、replaySnapshot.destructionConfig.battery.profileから一意に導出する。
// 不一致状態(destructionStateとdestructionConfigのbattery.profileの食い違い)を構築不能にする
// (fail-fastではなく構造的に不可能化。P3-0公開シグネチャの変更のため人間再承認対象、済)。
export function createRunAccumulator(replaySnapshot: RunSnapshot): RunAccumulator {
  return {
    events: [],
    destructionState: createInitialDestructionState(replaySnapshot.destructionConfig.battery.profile),
    replaySnapshot,
    terminalModeCandidates: [],
  };
}

// ---------------------------------------------------------------------------
// RunOutcome・finalizeDestructionRun・finalizeRun
// ---------------------------------------------------------------------------

export type PhysicsEndStatus = { status: 'finished' } | { status: 'stalled'; failureCode?: FailureCode } | { status: 'derailed' } | { status: 'overheated' };

export type RunEndSignal = { kind: 'physicsEnded'; physicsEndStatus: PhysicsEndStatus } | { kind: 'manualAbort' };

export type RunOutcome =
  | {
      endReason: 'destructionTerminal';
      terminalModes: readonly [DestructionModeId, ...DestructionModeId[]];
      events: readonly DestructionEvent[];
      destructionState: DestructionState;
      degradationDiffs: readonly DegradationDiff[];
      replaySnapshot: RunSnapshot;
    }
  | {
      endReason: 'finished' | 'stalled' | 'derailed' | 'overheated' | 'energyExhausted' | 'manualAbort';
      events: readonly DestructionEvent[];
      destructionState: DestructionState;
      degradationDiffs: readonly DegradationDiff[];
      replaySnapshot: RunSnapshot;
    };

// 非空配列型で「terminalModeCandidatesが1件以上ある」ことを引数の型そのもので保証する。
export function finalizeDestructionRun(accumulator: RunAccumulator & { terminalModeCandidates: readonly [DestructionModeId, ...DestructionModeId[]] }): RunOutcome {
  const [first, ...rest] = accumulator.terminalModeCandidates;
  return {
    endReason: 'destructionTerminal',
    terminalModes: [first, ...rest],
    events: accumulator.events,
    destructionState: accumulator.destructionState,
    degradationDiffs: deriveDegradationDiffs(accumulator.events, accumulator.destructionState),
    replaySnapshot: accumulator.replaySnapshot,
  };
}

function convertPhysicsEndStatusToEndReason(status: PhysicsEndStatus): Exclude<RunOutcome['endReason'], 'destructionTerminal' | 'manualAbort'> {
  if (status.status === 'stalled' && status.failureCode === 'energyExhausted') return 'energyExhausted';
  if (status.status === 'stalled') return 'stalled';
  return status.status;
}

// terminalModeCandidatesが空のaccumulatorに対してのみ呼ばれる(呼び出し側の規約)。
export function finalizeRun(accumulator: RunAccumulator, endSignal: RunEndSignal): RunOutcome {
  const degradationDiffs = deriveDegradationDiffs(accumulator.events, accumulator.destructionState);
  const endReason = endSignal.kind === 'manualAbort' ? 'manualAbort' : convertPhysicsEndStatusToEndReason(endSignal.physicsEndStatus);
  return { endReason, events: accumulator.events, destructionState: accumulator.destructionState, degradationDiffs, replaySnapshot: accumulator.replaySnapshot };
}

// ---------------------------------------------------------------------------
// deriveDegradationDiffs(正式Fable P3-0-Q6裁定=案(a)。2値/カウント差分のみP3-0実装。
// 連続量deltaFraction換算(D04のmagnet/body scorch・D05・D07・D09)は較正定数が
// 未確定のためP3-2〜P3-4の各該当ステップで追加する。段階実装の不変条件
// 「advanceDestructionStateは差分換算が実装済みのモードのイベントしか発行してはならない」
// により、P3-0の時点でD05/D07/D09イベントやD04の延焼側が実際にこの関数へ渡されることはない)
// ---------------------------------------------------------------------------

export function deriveDegradationDiffs(events: readonly DestructionEvent[], _finalDestructionState: DestructionState): readonly DegradationDiff[] {
  let rotorCollapse = false;
  let rotorBurnout = false;
  let batteryConsumed = false;
  let gearToothLossCount = 0;

  for (const event of events) {
    switch (event.mode) {
      case 'D01':
        rotorCollapse = true;
        break;
      case 'D02':
        rotorBurnout = true;
        break;
      case 'D03':
        batteryConsumed = true;
        break;
      case 'D04':
        // D04イベントは炎上到達(stage:'burning')時のみ発行される設計(v12 2.4節)。
        // magnet/body延焼のdeltaFraction換算はP3-0-Q6裁定によりP3-2で追加する。
        if (event.causeLog.stage === 'burning') batteryConsumed = true;
        break;
      case 'D06':
        gearToothLossCount += 1;
        break;
      case 'D05':
      case 'D07':
      case 'D09':
        // 連続量deltaFraction換算はP3-0-Q6裁定によりD05→P3-3、D07/D09→P3-4で追加する。
        break;
    }
  }

  const diffs: DegradationDiff[] = [];
  if (rotorCollapse) diffs.push({ role: 'rotor', kind: 'collapse' });
  if (rotorBurnout) diffs.push({ role: 'rotor', kind: 'burnout' });
  if (batteryConsumed) diffs.push({ role: 'battery', kind: 'consumed' });
  if (gearToothLossCount > 0) diffs.push({ role: 'gear', kind: 'toothLoss', deltaCount: gearToothLossCount });
  return diffs;
}

// ---------------------------------------------------------------------------
// DestructionConfigDraft(段階導入対応、Draft/完成版分離)。BatteryDestructionConfig・
// GearBreakageProfile・DestructionConfig自体はdestructionModes.ts所有(正式Fable P3-1-Q7(a)
// 裁定、上記でimport/re-export済み)。ここに残るのはDraft・validator・restore用raw
// validatorのみ——復元・値域検証はstoreのRunSnapshot責務に属するorchestration固有の役割
// であり、leafに引きずり込むべきでないため。
// ---------------------------------------------------------------------------

export interface DestructionConfigDraft {
  battery?: BatteryDestructionConfig;
  d02?: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
  d05?: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06?: { breakage: GearBreakageProfile };
  d07?: { magnetHeatGaugeLimit: number; reversibleDroopThreshold: number };
  d09?: { bearingSeizureGaugeLimit: number };
}

export interface InvalidConfigField {
  field: string;
  reason: string;
}

// Q5(正式Fable裁定、承認済み): missingFieldsだけでは値域違反を表現できないため、
// invalidFieldsを追加した拡張版。人間再承認対象。
export type ValidateDestructionConfigResult =
  | { ok: true; config: DestructionConfig }
  | { ok: false; missingFields: readonly string[]; invalidFields: readonly InvalidConfigField[] };

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

// 判別union対応(Fable指摘): profile==='nonLipo'ならlipo専用フィールドを要求せず、
// breakage.kind==='nonBreakable'ならgearStrengthThresholdNmを要求しない。
export function validateDestructionConfig(draft: DestructionConfigDraft): ValidateDestructionConfigResult {
  const missingFields: string[] = [];
  const invalidFields: InvalidConfigField[] = [];

  if (draft.battery === undefined) {
    missingFields.push('battery');
  } else {
    if (!isPositiveFinite(draft.battery.shortCircuitDurationLimitS)) {
      invalidFields.push({ field: 'battery.shortCircuitDurationLimitS', reason: '正の有限数である必要があります' });
    }
    if (draft.battery.profile === 'lipo') {
      const lipo = draft.battery;
      if (!(lipo.unsafeDischargeStartRatio > 0 && lipo.unsafeDischargeStartRatio < 1)) {
        invalidFields.push({ field: 'battery.unsafeDischargeStartRatio', reason: '(0,1)の開区間である必要があります' });
      }
      if (!isPositiveFinite(lipo.runawayHeatThreshold)) {
        invalidFields.push({ field: 'battery.runawayHeatThreshold', reason: '正の有限数である必要があります' });
      }
      if (!isPositiveFinite(lipo.stageDurations.swellingS)) {
        invalidFields.push({ field: 'battery.stageDurations.swellingS', reason: '正の有限数である必要があります' });
      }
      if (!isPositiveFinite(lipo.stageDurations.smokingS)) {
        invalidFields.push({ field: 'battery.stageDurations.smokingS', reason: '正の有限数である必要があります' });
      }
    }
  }

  if (draft.d02 === undefined) {
    missingFields.push('d02');
  } else {
    if (!isPositiveFinite(draft.d02.smokeGaugeThreshold)) invalidFields.push({ field: 'd02.smokeGaugeThreshold', reason: '正の有限数である必要があります' });
    if (!isPositiveFinite(draft.d02.coilOverheatGaugeLimit)) invalidFields.push({ field: 'd02.coilOverheatGaugeLimit', reason: '正の有限数である必要があります' });
  }

  if (draft.d05 === undefined) {
    missingFields.push('d05');
  } else {
    if (!isPositiveFinite(draft.d05.brushSparkDurationLimitS)) invalidFields.push({ field: 'd05.brushSparkDurationLimitS', reason: '正の有限数である必要があります' });
    if (!isPositiveFinite(draft.d05.brushSparkCurrentThresholdA)) invalidFields.push({ field: 'd05.brushSparkCurrentThresholdA', reason: '正の有限数である必要があります' });
  }

  if (draft.d06 === undefined) {
    missingFields.push('d06');
  } else if (draft.d06.breakage.kind === 'breakable' && !isPositiveFinite(draft.d06.breakage.gearStrengthThresholdNm)) {
    invalidFields.push({ field: 'd06.breakage.gearStrengthThresholdNm', reason: '正の有限数である必要があります' });
  }

  if (draft.d07 === undefined) {
    missingFields.push('d07');
  } else {
    if (!isPositiveFinite(draft.d07.magnetHeatGaugeLimit)) invalidFields.push({ field: 'd07.magnetHeatGaugeLimit', reason: '正の有限数である必要があります' });
    if (!isPositiveFinite(draft.d07.reversibleDroopThreshold)) invalidFields.push({ field: 'd07.reversibleDroopThreshold', reason: '正の有限数である必要があります' });
  }

  if (draft.d09 === undefined) {
    missingFields.push('d09');
  } else if (!isPositiveFinite(draft.d09.bearingSeizureGaugeLimit)) {
    invalidFields.push({ field: 'd09.bearingSeizureGaugeLimit', reason: '正の有限数である必要があります' });
  }

  if (missingFields.length > 0 || invalidFields.length > 0 || draft.battery === undefined || draft.d02 === undefined || draft.d05 === undefined || draft.d06 === undefined || draft.d07 === undefined || draft.d09 === undefined) {
    return { ok: false, missingFields, invalidFields };
  }

  return { ok: true, config: { battery: draft.battery, d02: draft.d02, d05: draft.d05, d06: draft.d06, d07: draft.d07, d09: draft.d09 } };
}

// ---------------------------------------------------------------------------
// RunSnapshot・captureRunSnapshot
// ---------------------------------------------------------------------------

export interface RunSnapshot {
  contractVersion: number;
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  runContext: DestructionRunContext;
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: TrackDefinition | null;
  seed: number;
  initialDestructionState: DestructionState;
}

const RUN_SNAPSHOT_CONTRACT_VERSION = 1;

export interface CaptureRunSnapshotInput {
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  runContext: DestructionRunContext;
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: TrackDefinition | null;
  seed: number;
  initialDestructionState: DestructionState;
}

// contractVersionは呼び出し側から受け取らず、この関数が常に1を付与する。
// 全フィールドを深いコピーで複写する(呼び出し後にinputを変更してもRunSnapshotへ波及しない)。
export function captureRunSnapshot(input: CaptureRunSnapshotInput): RunSnapshot {
  return {
    contractVersion: RUN_SNAPSHOT_CONTRACT_VERSION,
    motorConfig: structuredClone(input.motorConfig),
    carConfig: input.carConfig === null ? null : structuredClone(input.carConfig),
    destructionConfig: structuredClone(input.destructionConfig),
    runContext: structuredClone(input.runContext),
    initialMotorState: structuredClone(input.initialMotorState),
    initialVehicleState: input.initialVehicleState === null ? null : structuredClone(input.initialVehicleState),
    track: input.track === null ? null : structuredClone(input.track),
    seed: input.seed,
    initialDestructionState: structuredClone(input.initialDestructionState),
  };
}

// ---------------------------------------------------------------------------
// restoreRunSnapshot(unknownからのruntime検証、6.1節の12段階)
// ---------------------------------------------------------------------------

export interface RestoredRunSnapshot {
  contractVersion: number;
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  runContext: DestructionRunContext;
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: ValidatedTrackDefinition | null;
  seed: number;
  initialDestructionState: DestructionState;
}

export type RestoreRunSnapshotResult =
  | { ok: true; snapshot: RestoredRunSnapshot }
  | { ok: false; reason: 'unsupportedContractVersion' }
  | { ok: false; reason: 'invalidSchema'; details: string }
  | { ok: false; reason: 'invalidTrack'; details: string };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateMotorConfigShape(raw: unknown): raw is MotorConfig {
  if (!isPlainObject(raw)) return false;
  const requiredNumberFields = ['coilTurns', 'slitWidthMm', 'sandingQuality', 'brushPressure', 'magnetStrength', 'magnetDistanceMm', 'axisOffsetMm'];
  if (!requiredNumberFields.every((field) => isFiniteNumber(raw[field]))) return false;
  if (raw.batteryVoltage !== 1.5 && raw.batteryVoltage !== 3) return false;
  const optionalNumberFields = ['wireGaugeMm', 'wireResistivityRatio', 'wireDensityRatio', 'batteryInternalResistanceRatio', 'batteryCapacityRatio'];
  for (const field of optionalNumberFields) {
    if (raw[field] !== undefined && !isFiniteNumber(raw[field])) return false;
  }
  if (raw.parallelStrands !== undefined && raw.parallelStrands !== 1 && raw.parallelStrands !== 2) return false;
  if (raw.varnished !== undefined && typeof raw.varnished !== 'boolean') return false;
  return true;
}

function validateCarConfigShape(raw: unknown): raw is CarConfig {
  if (!isPlainObject(raw)) return false;
  const fields = ['massG', 'gearRatio', 'gearEfficiency', 'wheelDiameterMm', 'tireGrip', 'axleFriction', 'wheelAlignmentMm', 'centerOfMassHeightMm', 'motorMountOffsetMm'];
  return fields.every((field) => isFiniteNumber(raw[field]));
}

function validateSimStateShape(raw: unknown): raw is SimState {
  if (!isPlainObject(raw)) return false;
  const numberFields = ['theta', 'omega', 'current', 'backEmf', 'rpm', 'chatterFramesLeft', 'batteryHeat', 'highSpeedFrameCount'];
  if (!numberFields.every((field) => isFiniteNumber(raw[field]))) return false;
  const boolFields = ['shorted', 'running', 'coilCollapsed'];
  return boolFields.every((field) => typeof raw[field] === 'boolean');
}

const VEHICLE_STATUS_VALUES = ['ready', 'running', 'finished', 'stalled', 'derailed', 'overheated'] as const;
const FAILURE_CODE_VALUES = ['failureToStart', 'energyExhausted'] as const;

function validateEnergyBreakdownShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  const fields = ['driveJ', 'gearLossJ', 'slipLossJ', 'brushLossJ', 'heatJ'];
  return fields.every((field) => isFiniteNumber(raw[field]));
}

function validateVehicleSimStateShape(raw: unknown): raw is VehicleSimState {
  if (!isPlainObject(raw)) return false;
  if (!validateSimStateShape(raw.motor)) return false;
  const numberFields = [
    'positionM',
    'velocityMps',
    'accelerationMps2',
    'axleOmega',
    'driveForceN',
    'loadTorqueNm',
    'slipRatio',
    'reunionDeferralStreak',
    'stalledDurationS',
    'derailDurationS',
    'coilCollapsePenaltyMm',
    'energyUsedJ',
    'elapsedTimeS',
    'trackSegmentIndex',
  ];
  if (!numberFields.every((field) => isFiniteNumber(raw[field]))) return false;
  if (typeof raw.isSlipping !== 'boolean') return false;
  if (!(VEHICLE_STATUS_VALUES as readonly string[]).includes(raw.status as string)) return false;
  if (raw.failureCode !== undefined && !(FAILURE_CODE_VALUES as readonly string[]).includes(raw.failureCode as string)) return false;
  if (raw.stallObservation !== undefined) {
    const stallObservation = raw.stallObservation;
    if (!isPlainObject(stallObservation)) return false;
    if (typeof stallObservation.wasSlippingAtStall !== 'boolean') return false;
    if (!isFiniteNumber(stallObservation.coilCollapsePenaltyMmAtStall)) return false;
    if (typeof stallObservation.deadZoneAtStall !== 'boolean') return false;
  }
  if (!validateEnergyBreakdownShape(raw.energyBreakdown)) return false;
  return true;
}

// Suuコード監査#6: 「modesがobjectなら通す」という代表1件だけの浅い検証では不足。
// 計画6.1節9のとおり、各Progressバリアントの全フィールド(有限数・boolean・null許可・
// CauseLog形状)まで検証する。

function validateTemperatureReadingShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (raw.kind === 'measured') return isFiniteNumber(raw.temperatureC);
  if (raw.kind === 'uncalibratedGauge') return isFiniteNumber(raw.ratio);
  if (raw.kind === 'unavailable') return true;
  return false;
}

function validateCauseLogCommonShape(raw: unknown): raw is Record<string, unknown> {
  if (!isPlainObject(raw)) return false;
  if (!isFiniteNumber(raw.currentA) || !isFiniteNumber(raw.rpm) || !isFiniteNumber(raw.atT)) return false;
  return validateTemperatureReadingShape(raw.temperature);
}

function validateD01CauseLogShape(raw: unknown): boolean {
  return validateCauseLogCommonShape(raw);
}
function validateD02CauseLogShape(raw: unknown): boolean {
  return validateCauseLogCommonShape(raw) && isFiniteNumber(raw.coilHeatGaugeRatio);
}
function validateD03CauseLogShape(raw: unknown): boolean {
  return validateCauseLogCommonShape(raw) && isFiniteNumber(raw.batteryHeatRatio) && isFiniteNumber(raw.shortCircuitDurationS);
}
function validateD04CauseLogShape(raw: unknown): boolean {
  if (!validateCauseLogCommonShape(raw)) return false;
  if (!isFiniteNumber(raw.batteryHeatRatio) || !isFiniteNumber(raw.shortCircuitDurationS)) return false;
  if (raw.stage !== 'none' && raw.stage !== 'swelling' && raw.stage !== 'smoking' && raw.stage !== 'burning') return false;
  if (raw.overDischargeRatio !== null && !isFiniteNumber(raw.overDischargeRatio)) return false;
  return true;
}
function validateD05CauseLogShape(raw: unknown): boolean {
  return validateCauseLogCommonShape(raw) && isFiniteNumber(raw.sparkDurationS);
}
function validateD06CauseLogShape(raw: unknown): boolean {
  return validateCauseLogCommonShape(raw) && isFiniteNumber(raw.loadTorqueNm) && isFiniteNumber(raw.toothLossCount);
}
function validateD07CauseLogShape(raw: unknown): boolean {
  return validateCauseLogCommonShape(raw) && isFiniteNumber(raw.magnetHeatGaugeRatio);
}
function validateD09CauseLogShape(raw: unknown): boolean {
  return validateCauseLogCommonShape(raw) && isFiniteNumber(raw.bearingHeatGaugeRatio);
}

function validateD01ProgressShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (typeof raw.triggered !== 'boolean') return false;
  if (raw.triggeredAtT !== null && !isFiniteNumber(raw.triggeredAtT)) return false;
  if (raw.causeLog !== null && !validateD01CauseLogShape(raw.causeLog)) return false;
  return true;
}
function validateD02ProgressShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (typeof raw.triggered !== 'boolean') return false;
  if (raw.triggeredAtT !== null && !isFiniteNumber(raw.triggeredAtT)) return false;
  if (!isFiniteNumber(raw.coilHeatGaugeRatio)) return false;
  if (raw.causeLog !== null && !validateD02CauseLogShape(raw.causeLog)) return false;
  return true;
}
function validateD03ProgressShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (typeof raw.triggered !== 'boolean') return false;
  if (raw.triggeredAtT !== null && !isFiniteNumber(raw.triggeredAtT)) return false;
  if (raw.causeLog !== null && !validateD03CauseLogShape(raw.causeLog)) return false;
  return true;
}
function validateD04ProgressShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (typeof raw.triggered !== 'boolean') return false;
  if (raw.triggeredAtT !== null && !isFiniteNumber(raw.triggeredAtT)) return false;
  if (raw.stage !== 'none' && raw.stage !== 'swelling' && raw.stage !== 'smoking' && raw.stage !== 'burning') return false;
  if (raw.stageEnteredAtT !== null && !isFiniteNumber(raw.stageEnteredAtT)) return false;
  if (typeof raw.overDischargeActive !== 'boolean') return false;
  if (raw.causeLog !== null && !validateD04CauseLogShape(raw.causeLog)) return false;
  return true;
}
function validateD05ProgressShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (!isFiniteNumber(raw.sparkDurationS)) return false;
  if (typeof raw.episodeTriggered !== 'boolean') return false;
  if (!isFiniteNumber(raw.episodeCount)) return false;
  if (!isFiniteNumber(raw.cumulativeSparkExposure)) return false;
  if (raw.firstEpisodeAtT !== null && !isFiniteNumber(raw.firstEpisodeAtT)) return false;
  if (raw.causeLog !== null && !validateD05CauseLogShape(raw.causeLog)) return false;
  return true;
}
function validateD06ProgressShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (!isFiniteNumber(raw.toothLossCount)) return false;
  if (raw.firstLossAtT !== null && !isFiniteNumber(raw.firstLossAtT)) return false;
  if (raw.causeLog !== null && !validateD06CauseLogShape(raw.causeLog)) return false;
  return true;
}
function validateD07ProgressShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (!isFiniteNumber(raw.magnetHeatGaugeRatio)) return false;
  if (typeof raw.reversibleDroopActive !== 'boolean') return false;
  if (typeof raw.irreversibleTriggered !== 'boolean') return false;
  if (raw.irreversibleTriggeredAtT !== null && !isFiniteNumber(raw.irreversibleTriggeredAtT)) return false;
  if (raw.causeLog !== null && !validateD07CauseLogShape(raw.causeLog)) return false;
  return true;
}
function validateD09ProgressShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (typeof raw.triggered !== 'boolean') return false;
  if (raw.triggeredAtT !== null && !isFiniteNumber(raw.triggeredAtT)) return false;
  if (!isFiniteNumber(raw.bearingHeatGaugeRatio)) return false;
  if (raw.causeLog !== null && !validateD09CauseLogShape(raw.causeLog)) return false;
  return true;
}

function validateDestructionStateShape(raw: unknown): raw is DestructionState {
  if (!isPlainObject(raw)) return false;
  if (!isPlainObject(raw.shared)) return false;
  if (!isFiniteNumber(raw.shared.shortCircuitDurationS) || !isFiniteNumber(raw.shared.elapsedTimeS)) return false;

  if (!isPlainObject(raw.battery)) return false;
  if (raw.battery.profile === 'lipo') {
    if (!validateD04ProgressShape(raw.battery.d04)) return false;
  } else if (raw.battery.profile === 'nonLipo') {
    if (!validateD03ProgressShape(raw.battery.d03)) return false;
  } else {
    return false;
  }

  if (!isPlainObject(raw.modes)) return false;
  if (!validateD01ProgressShape(raw.modes.D01)) return false;
  if (!validateD02ProgressShape(raw.modes.D02)) return false;
  if (!validateD05ProgressShape(raw.modes.D05)) return false;
  if (!validateD06ProgressShape(raw.modes.D06)) return false;
  if (!validateD07ProgressShape(raw.modes.D07)) return false;
  if (!validateD09ProgressShape(raw.modes.D09)) return false;

  return true;
}

// Suuコード監査#5: battery.profile==='lipo'のstageDurationsが欠落・非objectの場合、
// validateDestructionConfig側は既にDestructionConfigDraft型を信頼して`.swellingS`等へ
// 直接dot-accessするため、raw(unknown由来)の時点でこの形状を保証しないとTypeErrorで
// throwする。数値フィールドはtypeof==='number'まで確認する(finite性・値域は
// validateDestructionConfigのisPositiveFinite等が安全に判定する、ここでは型のみ保証する)。
function validateBatteryDestructionConfigRawShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (raw.profile !== 'lipo' && raw.profile !== 'nonLipo') return false;
  if (typeof raw.shortCircuitDurationLimitS !== 'number') return false;
  if (raw.profile === 'lipo') {
    if (typeof raw.runawayHeatThreshold !== 'number') return false;
    if (typeof raw.unsafeDischargeStartRatio !== 'number') return false;
    if (!isPlainObject(raw.stageDurations)) return false;
    if (typeof raw.stageDurations.swellingS !== 'number') return false;
    if (typeof raw.stageDurations.smokingS !== 'number') return false;
  }
  return true;
}

function validateDestructionConfigRawShape(raw: unknown): raw is DestructionConfigDraft {
  if (!isPlainObject(raw)) return false;
  if (raw.battery !== undefined && !validateBatteryDestructionConfigRawShape(raw.battery)) return false;
  if (raw.d02 !== undefined) {
    if (!isPlainObject(raw.d02)) return false;
    if (typeof raw.d02.smokeGaugeThreshold !== 'number' || typeof raw.d02.coilOverheatGaugeLimit !== 'number') return false;
  }
  if (raw.d05 !== undefined) {
    if (!isPlainObject(raw.d05)) return false;
    if (typeof raw.d05.brushSparkDurationLimitS !== 'number' || typeof raw.d05.brushSparkCurrentThresholdA !== 'number') return false;
  }
  if (raw.d06 !== undefined) {
    if (!isPlainObject(raw.d06) || !isPlainObject(raw.d06.breakage)) return false;
    if (raw.d06.breakage.kind !== 'breakable' && raw.d06.breakage.kind !== 'nonBreakable') return false;
    if (raw.d06.breakage.kind === 'breakable' && typeof raw.d06.breakage.gearStrengthThresholdNm !== 'number') return false;
  }
  if (raw.d07 !== undefined) {
    if (!isPlainObject(raw.d07)) return false;
    if (typeof raw.d07.magnetHeatGaugeLimit !== 'number' || typeof raw.d07.reversibleDroopThreshold !== 'number') return false;
  }
  if (raw.d09 !== undefined) {
    if (!isPlainObject(raw.d09)) return false;
    if (typeof raw.d09.bearingSeizureGaugeLimit !== 'number') return false;
  }
  return true;
}

// Suuコード監査#7: adjacentRolesEquippedの各要素をvalidateFireExposureProfile相当まで
// 検証する(body・未知値を拒否する)。単に配列であることの確認だけでは、unknown由来の
// 入力(localStorage等)から不正なroleが混入することを防げない。
const ALLOWED_ADJACENT_FIRE_EXPOSURE_ROLES: readonly string[] = ['magnet'];

function validateRunContextShape(raw: unknown): raw is DestructionRunContext {
  if (!isPlainObject(raw)) return false;
  if (!isPlainObject(raw.fireExposureProfile)) return false;
  if (typeof raw.fireExposureProfile.bodyEquipped !== 'boolean') return false;
  if (!Array.isArray(raw.fireExposureProfile.adjacentRolesEquipped)) return false;
  if (!raw.fireExposureProfile.adjacentRolesEquipped.every((role: unknown) => typeof role === 'string' && ALLOWED_ADJACENT_FIRE_EXPOSURE_ROLES.includes(role))) {
    return false;
  }
  if (raw.context === 'motor') return raw.gearTotalToothCount === null;
  if (raw.context === 'vehicle') return isFiniteNumber(raw.gearTotalToothCount) && raw.gearTotalToothCount > 0 && Number.isInteger(raw.gearTotalToothCount);
  return false;
}

export function restoreRunSnapshot(raw: unknown): RestoreRunSnapshotResult {
  if (!isPlainObject(raw)) return { ok: false, reason: 'invalidSchema', details: 'root is not an object' };
  if (raw.contractVersion !== RUN_SNAPSHOT_CONTRACT_VERSION) return { ok: false, reason: 'unsupportedContractVersion' };

  const motorConfigRaw = raw.motorConfig;
  if (!validateMotorConfigShape(motorConfigRaw)) return { ok: false, reason: 'invalidSchema', details: 'motorConfig' };

  const carConfigRaw = raw.carConfig;
  if (carConfigRaw !== null && !validateCarConfigShape(carConfigRaw)) return { ok: false, reason: 'invalidSchema', details: 'carConfig' };

  const destructionConfigRaw = raw.destructionConfig;
  if (!validateDestructionConfigRawShape(destructionConfigRaw)) return { ok: false, reason: 'invalidSchema', details: 'destructionConfig' };
  const destructionConfigResult = validateDestructionConfig(destructionConfigRaw);
  if (!destructionConfigResult.ok) {
    return {
      ok: false,
      reason: 'invalidSchema',
      details: `destructionConfig invalid: missing=${destructionConfigResult.missingFields.join(',')} invalid=${destructionConfigResult.invalidFields.map((f) => f.field).join(',')}`,
    };
  }

  const runContextRaw = raw.runContext;
  if (!validateRunContextShape(runContextRaw)) return { ok: false, reason: 'invalidSchema', details: 'runContext' };

  const initialMotorStateRaw = raw.initialMotorState;
  if (!validateSimStateShape(initialMotorStateRaw)) return { ok: false, reason: 'invalidSchema', details: 'initialMotorState' };

  const initialVehicleStateRaw = raw.initialVehicleState;
  if (initialVehicleStateRaw !== null && !validateVehicleSimStateShape(initialVehicleStateRaw)) {
    return { ok: false, reason: 'invalidSchema', details: 'initialVehicleState' };
  }

  const trackRaw = raw.track;

  // 正式M2必須検証: context⟺各フィールドのnull性一致
  if (runContextRaw.context === 'motor') {
    if (carConfigRaw !== null || initialVehicleStateRaw !== null || trackRaw !== null) {
      return { ok: false, reason: 'invalidSchema', details: 'motor context requires carConfig/initialVehicleState/track to be null' };
    }
  } else if (carConfigRaw === null || initialVehicleStateRaw === null) {
    return { ok: false, reason: 'invalidSchema', details: 'vehicle context requires carConfig/initialVehicleState to be non-null' };
  }

  const seedRaw = raw.seed;
  if (!isFiniteNumber(seedRaw)) return { ok: false, reason: 'invalidSchema', details: 'seed' };

  const initialDestructionStateRaw = raw.initialDestructionState;
  if (!validateDestructionStateShape(initialDestructionStateRaw)) return { ok: false, reason: 'invalidSchema', details: 'initialDestructionState' };

  let validatedTrack: ValidatedTrackDefinition | null = null;
  if (trackRaw !== null) {
    if (!isPlainObject(trackRaw)) return { ok: false, reason: 'invalidTrack', details: 'track is not an object' };
    try {
      validatedTrack = createValidatedTrack(trackRaw as unknown as TrackDefinition);
    } catch (error) {
      return { ok: false, reason: 'invalidTrack', details: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    ok: true,
    snapshot: {
      contractVersion: RUN_SNAPSHOT_CONTRACT_VERSION,
      motorConfig: motorConfigRaw,
      carConfig: carConfigRaw === null ? null : carConfigRaw,
      destructionConfig: destructionConfigResult.config,
      runContext: runContextRaw,
      initialMotorState: initialMotorStateRaw,
      initialVehicleState: initialVehicleStateRaw === null ? null : initialVehicleStateRaw,
      track: validatedTrack,
      seed: seedRaw,
      initialDestructionState: initialDestructionStateRaw,
    },
  };
}

// ---------------------------------------------------------------------------
// DestructionStepResult・stepMotorWithDestruction(P3-1)。stepTestRunWithDestruction・
// stepTrackRunWithDestruction(vehicle/track版)はP3-2/P3-4以降で追加する。
// ---------------------------------------------------------------------------

export interface DestructionStepResult<TPhysicsState> {
  physicsState: TPhysicsState;
  accumulator: RunAccumulator;
  termination: RunOutcome | null;
}

/**
 * 本関数は分類規則のみを定める。各モードのイベントが実際に発行可能かは正式Fable P3-0-Q6
 * 不変条件(deriveDegradationDiffsの段階実装、`createRunAccumulator`に関するP3-1-Q6とは別物)が
 * 別途統制する。
 */
export function classifyTerminalModes(events: readonly UnstampedDestructionEvent[]): readonly DestructionModeId[] {
  const result: DestructionModeId[] = [];
  for (const event of events) {
    if (event.mode === 'D02') result.push('D02');
    if (event.mode === 'D03') result.push('D03');
    if (event.mode === 'D04' && event.causeLog.stage === 'burning') result.push('D04');
    if (event.mode === 'D06' && event.isTotalLoss) result.push('D06');
    if (event.mode === 'D09') result.push('D09');
  }
  return result;
}

function stampPhysicsSnapshot(
  events: readonly UnstampedDestructionEvent[],
  snapshot: PhysicsSnapshotAtT,
): readonly DestructionEvent[] {
  return events.map((e) => ({ ...e, physicsSnapshotAtT: snapshot }));
}

function asNonEmpty<T>(arr: readonly T[]): readonly [T, ...T[]] | null {
  return arr.length > 0 ? (arr as readonly [T, ...T[]]) : null;
}

function buildMotorOnlyFrameInput(config: MotorConfig, prev: SimState, next: SimState): DestructionFrameInput {
  const theoreticalCurrentA = computeElectricalState(config, prev.theta, prev.omega).current;
  return {
    currentA: next.current,
    theoreticalCurrentA,
    rpm: next.rpm,
    batteryHeat: next.batteryHeat,
    shorted: next.shorted,
    chatterFramesLeft: next.chatterFramesLeft,
    coilCollapsedRisingEdge: didCollapseJustHappen(prev, next),
    loadTorqueNm: undefined,
    energyUsedRatio: undefined,
  };
}

// motorPhysics.tsの`type Rng = () => number`は非exportのため、destructionOrchestration.ts側から
// 直接参照できない。motorPhysics.tsは無改修のまま、既存`step`の公開シグネチャから型を導出する。
type MotorStepRng = NonNullable<Parameters<typeof step>[3]>;

/**
 * Phase 3 wrapper共通不変条件(正式Fable裁定P3-1-Q9-2確定): 走行開始時に確定する構成情報
 * (config・destructionConfig)は`accumulator.replaySnapshot`を唯一の出典とし、引数として
 * 独立に受け取らない。引数はフレームごとに変わりうる動的入力(motorState・dt・rng・
 * loadTorque・effectiveInertia)に限る。同一の`RunSnapshot`から生成した`accumulator`を使う限り、
 * config・destructionConfigの不一致は型上構築不能である(P3-1-Q6(a)と同じ「fail-fastではなく
 * 構築不能」の原則を全base configへ一貫適用する、P3-1-Q9確定)。
 */
export function stepMotorWithDestruction(
  motorState: SimState,
  accumulator: RunAccumulator,
  dt: number,
  rng?: MotorStepRng,
  loadTorque?: number,
  effectiveInertia?: number,
): DestructionStepResult<SimState> {
  const config = accumulator.replaySnapshot.motorConfig; // 唯一の出典(P3-1-Q9-2)
  const destructionConfig = accumulator.replaySnapshot.destructionConfig; // 唯一の出典(P3-1-Q9-2)
  const physicsState = step(config, motorState, dt, rng, loadTorque, effectiveInertia); // 既存、無改修
  const frame = buildMotorOnlyFrameInput(config, motorState, physicsState); // 同一のconfigを使用(P3-1-Q9-2)
  const { state, events } = advanceDestructionState(
    accumulator.destructionState, frame, destructionConfig, accumulator.replaySnapshot.runContext, dt,
  );
  const snapshot: PhysicsSnapshotAtT = { context: 'motor', state: physicsState };
  const stampedEvents = stampPhysicsSnapshot(events, snapshot);
  const nextTerminalModeCandidates = [...accumulator.terminalModeCandidates, ...classifyTerminalModes(events)];
  const nextAccumulator: RunAccumulator = {
    ...accumulator,
    destructionState: state,
    events: [...accumulator.events, ...stampedEvents],
    terminalModeCandidates: nextTerminalModeCandidates,
  };
  const nonEmptyTerminalModes = asNonEmpty(nextTerminalModeCandidates);
  const termination = nonEmptyTerminalModes
    ? finalizeDestructionRun({ ...nextAccumulator, terminalModeCandidates: nonEmptyTerminalModes })
    : null;
  return { physicsState, accumulator: nextAccumulator, termination };
}
