// P3-0(docs/phase3-p3-0-plan.md v7、docs/phase3-plan-v12.md)+P3-1(docs/phase3-p3-1-plan.md v7)
// +P3-2ゲート6(docs/phase3-p3-2-plan.md v17 §11.6)。
// RunAccumulator操作・RunOutcome生成・RunSnapshot capture/restore・DestructionConfig検証・
// stepMotorWithDestruction(motor-onlyラッパー)・stepTestRunWithDestruction(vehicle+test-run
// ラッパー)を担う。`stepTrackRunWithDestruction`(track-run版)はP3-4以降で追加する(P3-0-Q2)。

import { computeElectricalState, computeRCoil, didCollapseJustHappen, step } from './motorPhysics';
import type { MotorConfig, SimState } from './motorPhysics';
import { CHATTER_BURST_FRAMES } from './constants';
import { stepTestRun } from './vehiclePhysics';
import type { CarConfig, FailureCode, VehicleSimState } from './vehiclePhysics';
import { computeEnergyBudgetJ, createValidatedTrack } from './trackPhysics';
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
// P3-2ゲート4: computeEnergyBudgetJはtrackPhysics.ts所有(本体はP3-2で無改修、exportキーワードのみ
// 追加)。stepMotorWithDestruction経由の呼び出しはないが、composeEffectiveMotorConfigの予算不変性
// (付帯条件1)を単体テストが直接検証できるよう、既存の公開importパス維持のためre-exportする。
export { computeEnergyBudgetJ };

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
// P3-2ゲート3でD04(body/magnet scorch)・D07(demagnetization)のdeltaFraction換算を追加した
// (正式Fable P3-2-Q5裁定=event埋め込み設計。destructionModes.tsのadvanceD04/advanceD07が
// DestructionConfig.d04/.d07由来の単一出典値をevent発行時点で埋め込み済みのため、本関数の
// シグネチャは無改修のまま`event.bodyScorchDeltaFraction`等を直接読み取ればよい)。
// D04/D07をこのゲートで同時に追加したのは、advanceD04/advanceD07をadvanceDestructionStateへ
// 接続してeventを発行可能にするのと同一ゲートで対応する差分換算を実装しないと、正式
// P3-0-Q6不変条件「advanceDestructionStateは差分換算が実装済みのモードのイベントしか
// 発行してはならない」の中間状態違反になるため(2026-08-08 Suu_mot3裁定)。
// 連続量deltaFraction換算のうちD09は較正定数が未確定のためP3-4の該当ステップで追加する
// (段階実装の不変条件により、現時点でD09イベントが実際にこの関数へ渡されることはない)。
// D05(ブラシ摩耗)はP3-3ゲート3で追加した(正式Fable P3-3-Q3裁定=確定候補a、計画v10 4.4節・
// 8節)。D04/D07とは異なりD05はevents配列からではなくfinalDestructionState引数(これまで
// 未使用でアンダースコア接頭だった)から読む——D05のcumulativeWearDeltaFractionは
// episode閾値を一度も超えなかった軽微なスパーク活動でも蓄積されうる連続量であり、event
// 0件のrunでも正の摩耗を生みうるため、eventへの値埋め込みという他モードの統一パターンに
// 従えない(P3-0-Q6ホワイトリスト不変条件は「diffがeventの個数に比例する」ことを要求しない、
// 8節で確認済み)。
// ---------------------------------------------------------------------------

export function deriveDegradationDiffs(events: readonly DestructionEvent[], finalDestructionState: DestructionState): readonly DegradationDiff[] {
  let rotorCollapse = false;
  let rotorBurnout = false;
  let batteryConsumed = false;
  let gearToothLossCount = 0;
  const diffs: DegradationDiff[] = [];

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
        if (event.causeLog.stage === 'burning') {
          batteryConsumed = true;
          if (event.affectedRoles.includes('body')) diffs.push({ role: 'body', kind: 'scorch', deltaFraction: event.bodyScorchDeltaFraction });
          if (event.affectedRoles.includes('magnet')) diffs.push({ role: 'magnet', kind: 'scorch', deltaFraction: event.magnetScorchDeltaFraction });
        }
        break;
      case 'D06':
        gearToothLossCount += 1;
        break;
      case 'D07':
        // D07イベントは不可逆到達(irreversibleTriggered)時のみ、isFirstThisSession:trueで
        // 一度だけ発行される(destructionModes.tsのadvanceD07が保証)。
        diffs.push({ role: 'magnet', kind: 'demagnetization', deltaFraction: event.demagnetizationDeltaFraction });
        break;
      case 'D05':
        // D05のdiff換算はevent自体からではなくfinalDestructionStateから読む(下記参照)。
        // eventはepisode演出・図鑑登録専用であり、diff換算には使わない。
        break;
      case 'D09':
        // 連続量deltaFraction換算はP3-0-Q6裁定によりD09→P3-4で追加する。
        break;
    }
  }

  if (rotorCollapse) diffs.push({ role: 'rotor', kind: 'collapse' });
  if (rotorBurnout) diffs.push({ role: 'rotor', kind: 'burnout' });
  if (batteryConsumed) diffs.push({ role: 'battery', kind: 'consumed' });
  if (gearToothLossCount > 0) diffs.push({ role: 'gear', kind: 'toothLoss', deltaCount: gearToothLossCount });
  // 正式Fable P3-3-Q3裁定(確定候補a): cumulativeWearDeltaFractionは既にadvanceD05側で
  // 素材係数(brushWearRateRatio・highCurrentPenalty・wearPerAmpSecond)まで畳み込み済みの
  // 無次元差分量であり、ここで追加の変換係数を掛けない。MotorConfigへのアクセスは不要。
  if (finalDestructionState.modes.D05.cumulativeWearDeltaFraction > 0) {
    diffs.push({ role: 'brush', kind: 'wear', deltaFraction: finalDestructionState.modes.D05.cumulativeWearDeltaFraction });
  }
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
  d01?: { decayExposureScaleRad: number; minEffectiveTurnsRatio: number };
  d02?: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number; conductionScale: number; dissipationCoefficient: number; smokeResistanceMultiplier: number };
  d04?: { bodyScorchDeltaFraction: number; magnetScorchDeltaFraction: number };
  d05?: {
    brushSparkDurationLimitS: number;
    brushSparkCurrentThresholdA: number;
    brushWearRateRatio: number;
    highCurrentPenalty: { kind: 'noPenalty' } | { kind: 'thresholdPenalty'; highCurrentPenaltyThresholdA: number; highCurrentPenaltyMultiplier: number };
    wearPerAmpSecond: number;
    recoveryFrames: number;
    recoveryContactResistanceMultiplier: number;
  };
  d06?: { breakage: GearBreakageProfile };
  d07?: {
    thermal: { conductionCoefficient: number; dissipationCoefficient: number };
    irreversible:
      | {
          kind: 'demagnetizing';
          magnetHeatGaugeLimit: number;
          reversibleDroopThreshold: number;
          reversibleDroopMultiplier: number;
          demagnetizationDeltaFraction: number;
        }
      | { kind: 'nonDemagnetizing' };
  };
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

// 正式Fable P3-2-Q1裁定+Suu_mot3ゲート1レビュー(確定): internalResistanceDegradationMultiplierは
// batteryInternalResistanceRatioへの乗数であり、「内部抵抗悪化」段階で抵抗を下げる(<1)ことは
// 損傷で抵抗が改善するという逆向き物理になるため許されない。区間[1,∞)(1は中立境界として許容)。
function isResistanceDegradationMultiplier(value: number): boolean {
  return Number.isFinite(value) && value >= 1;
}

// 正式Fable P3-2-Q2裁定+Suu_mot3ゲート1レビュー(確定): reversibleDroopMultiplierは熱ダレ時に
// magnetStrengthへ乗算する係数であり、1を超える値(実効Bを増やす)は熱ダレで磁力が強まるという
// 逆向き物理になるため許されない。半開区間(0,1](1は中立境界として許容、0は実効Bをゼロにする
// 退化値のため除く)。
function isDroopMultiplier(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1;
}

// D04のdeltaFraction系フィールドは「未装備/nonDemagnetizing磁石」でequippedFallback値0を
// 正当に取りうる(8節assembleD04Config)ため0を許容する閉区間[0,1]とする。
function isFractionInRange01(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

// D07のゲージ閾値・不可逆deltaFractionは常に非0の量(0だと即座に発火する/効果を持たない
// 退化値になる)であるため、0を除く半開区間(0,1]とする。
function isFractionInOpenRange01(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1;
}

// 正式Fable P3-3-Q5裁定(確定): minEffectiveTurnsRatioは磁気結合率の下限。0だと磁気結合が
// 消滅する退化値になるため、0を除く半開区間(0,1]とする(isFractionInOpenRange01と同じ規律)。
function isEffectiveTurnsRatioFloor(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1;
}

// 正式Fable P3-3-Q1/Q7裁定(確定): smokeResistanceMultiplier(発煙で抵抗が改善する逆向き
// 物理を拒否)・recoveryContactResistanceMultiplier(回復区間中に接触抵抗が改善する逆向き
// 物理を拒否)はいずれも[1,∞)——isResistanceDegradationMultiplierと同じ規律を再利用する。

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
      // 正式Fable P3-2-Q1裁定(確定): swelling/smoking区別なしの単一係数。
      if (!isResistanceDegradationMultiplier(lipo.internalResistanceDegradationMultiplier)) {
        invalidFields.push({ field: 'battery.internalResistanceDegradationMultiplier', reason: '[1,∞)の範囲の有限数である必要があります(1未満は抵抗が改善する逆向き物理になるため不可)' });
      }
    }
  }

  // 正式Fable P3-3-Q4・Q5裁定(確定): D01漸減較正値。
  if (draft.d01 === undefined) {
    missingFields.push('d01');
  } else {
    if (!isPositiveFinite(draft.d01.decayExposureScaleRad)) {
      invalidFields.push({ field: 'd01.decayExposureScaleRad', reason: '正の有限数である必要があります' });
    }
    if (!isEffectiveTurnsRatioFloor(draft.d01.minEffectiveTurnsRatio)) {
      invalidFields.push({ field: 'd01.minEffectiveTurnsRatio', reason: '(0,1]の範囲の有限数である必要があります' });
    }
  }

  if (draft.d02 === undefined) {
    missingFields.push('d02');
  } else {
    // 正式Fable Gate1レビュー是正(確定、計画11.2節「0 < smokeGaugeThreshold < coilOverheatGaugeLimit <= 1」
    // を完全実装。v1のisPositiveFinite単独チェックはcoilOverheatGaugeLimit>1を誤って許容していた)。
    if (!isPositiveFinite(draft.d02.smokeGaugeThreshold)) invalidFields.push({ field: 'd02.smokeGaugeThreshold', reason: '正の有限数である必要があります' });
    if (!isFractionInOpenRange01(draft.d02.coilOverheatGaugeLimit)) {
      invalidFields.push({ field: 'd02.coilOverheatGaugeLimit', reason: '(0,1]の範囲の有限数である必要があります' });
    }
    // 正式Fable P3-3-Q1・Q2裁定(確定): smokeGaugeThreshold < coilOverheatGaugeLimitの
    // 順序不変条件(発煙閾値が焼損閾値を超えると発火が発煙を経由しなくなる)。
    if (
      isPositiveFinite(draft.d02.smokeGaugeThreshold) && isFractionInOpenRange01(draft.d02.coilOverheatGaugeLimit)
      && !(draft.d02.smokeGaugeThreshold < draft.d02.coilOverheatGaugeLimit)
    ) {
      invalidFields.push({ field: 'd02.smokeGaugeThreshold', reason: 'coilOverheatGaugeLimit未満である必要があります' });
    }
    if (!isPositiveFinite(draft.d02.conductionScale)) invalidFields.push({ field: 'd02.conductionScale', reason: '正の有限数である必要があります' });
    if (!isPositiveFinite(draft.d02.dissipationCoefficient)) invalidFields.push({ field: 'd02.dissipationCoefficient', reason: '正の有限数である必要があります' });
    if (!isResistanceDegradationMultiplier(draft.d02.smokeResistanceMultiplier)) {
      invalidFields.push({ field: 'd02.smokeResistanceMultiplier', reason: '[1,∞)の範囲の有限数である必要があります(1未満は発煙で抵抗が改善する逆向き物理になるため不可)' });
    }
  }

  // 正式Fable P3-2-Q5裁定(確定): 未装備/nonDemagnetizing磁石の場合は0を正当な値として許容する。
  if (draft.d04 === undefined) {
    missingFields.push('d04');
  } else {
    if (!isFractionInRange01(draft.d04.bodyScorchDeltaFraction)) {
      invalidFields.push({ field: 'd04.bodyScorchDeltaFraction', reason: '[0,1]の範囲の有限数である必要があります' });
    }
    if (!isFractionInRange01(draft.d04.magnetScorchDeltaFraction)) {
      invalidFields.push({ field: 'd04.magnetScorchDeltaFraction', reason: '[0,1]の範囲の有限数である必要があります' });
    }
  }

  if (draft.d05 === undefined) {
    missingFields.push('d05');
  } else {
    if (!isPositiveFinite(draft.d05.brushSparkDurationLimitS)) {
      invalidFields.push({ field: 'd05.brushSparkDurationLimitS', reason: '正の有限数である必要があります' });
    } else if (draft.d05.brushSparkDurationLimitS > CHATTER_BURST_FRAMES / 120) {
      // 正式Fable P3-3-Q7裁定に伴う到達可能性制約(確定): チャタリングバーストの最大継続
      // フレーム数(CHATTER_BURST_FRAMES=24、dt=1/120s)を超えるdurationLimitは、D05
      // episodeが構造的に成立し得ない値になる(4.3節)。
      invalidFields.push({ field: 'd05.brushSparkDurationLimitS', reason: `CHATTER_BURST_FRAMES/120秒(${(CHATTER_BURST_FRAMES / 120).toFixed(6)}秒)以下である必要があります(episodeが構造的に到達不能になるため)` });
    }
    if (!isPositiveFinite(draft.d05.brushSparkCurrentThresholdA)) invalidFields.push({ field: 'd05.brushSparkCurrentThresholdA', reason: '正の有限数である必要があります' });
    if (!isPositiveFinite(draft.d05.brushWearRateRatio)) invalidFields.push({ field: 'd05.brushWearRateRatio', reason: '正の有限数である必要があります' });
    // 正式Fable P3-3-Q15-4裁定(確定): thresholdPenalty枝のみ数値2フィールドを検証する。
    // noPenalty枝はペナルティ関連フィールドを型上持たないため検証不要(D07のnonDemagnetizing
    // 枝がirreversible詳細フィールドを検証しないのと同じ規律)。
    if (draft.d05.highCurrentPenalty.kind === 'thresholdPenalty') {
      const penalty = draft.d05.highCurrentPenalty;
      if (!isPositiveFinite(penalty.highCurrentPenaltyThresholdA)) {
        invalidFields.push({ field: 'd05.highCurrentPenalty.highCurrentPenaltyThresholdA', reason: '正の有限数である必要があります' });
      }
      if (!Number.isFinite(penalty.highCurrentPenaltyMultiplier) || !(penalty.highCurrentPenaltyMultiplier > 1)) {
        invalidFields.push({
          field: 'd05.highCurrentPenalty.highCurrentPenaltyMultiplier',
          reason: '1より大きい有限数である必要があります(multiplier===1はnoPenaltyと同一状態の二重表現になるため不可、正式Fable P3-3-Q15-4裁定)',
        });
      }
    } else if ((draft.d05.highCurrentPenalty as { kind: string }).kind !== 'noPenalty') {
      // Suu_mot3最終照合是正(P52): TypeScriptの型はkindを'noPenalty'|'thresholdPenalty'に
      // 限定するが、実行時にunsafeなcast(`as DestructionConfigDraft`等)を経由した場合は
      // 型検査を迂回できるため、値そのものを検証する防御を残す(D07にはない追加防御——
      // Q15-4がここまで機械固定するようSuu_mot3レビューで指摘された)。
      invalidFields.push({ field: 'd05.highCurrentPenalty.kind', reason: "'noPenalty'または'thresholdPenalty'である必要があります" });
    }
    if (!isPositiveFinite(draft.d05.wearPerAmpSecond)) invalidFields.push({ field: 'd05.wearPerAmpSecond', reason: '正の有限数である必要があります' });
    if (!Number.isFinite(draft.d05.recoveryFrames) || draft.d05.recoveryFrames < 0 || !Number.isInteger(draft.d05.recoveryFrames)) {
      invalidFields.push({ field: 'd05.recoveryFrames', reason: '0以上の整数である必要があります' });
    }
    if (!isResistanceDegradationMultiplier(draft.d05.recoveryContactResistanceMultiplier)) {
      invalidFields.push({ field: 'd05.recoveryContactResistanceMultiplier', reason: '[1,∞)の範囲の有限数である必要があります(1未満は回復区間中に接触抵抗が改善する逆向き物理になるため不可)' });
    }
  }

  if (draft.d06 === undefined) {
    missingFields.push('d06');
  } else if (draft.d06.breakage.kind === 'breakable' && !isPositiveFinite(draft.d06.breakage.gearStrengthThresholdNm)) {
    invalidFields.push({ field: 'd06.breakage.gearStrengthThresholdNm', reason: '正の有限数である必要があります' });
  }

  // 正式Fable P3-2-Q11裁定(確定): thermalは磁石の種類によらず常に必須(HUD熱ゲージのため)。
  // irreversibleの交差検証(reversibleDroopThreshold < magnetHeatGaugeLimit・0-1範囲)は
  // kind==='demagnetizing'の枝でのみ行い、kind==='nonDemagnetizing'では検証自体をスキップする。
  if (draft.d07 === undefined) {
    missingFields.push('d07');
  } else {
    if (!isPositiveFinite(draft.d07.thermal.conductionCoefficient)) {
      invalidFields.push({ field: 'd07.thermal.conductionCoefficient', reason: '正の有限数である必要があります' });
    }
    if (!isPositiveFinite(draft.d07.thermal.dissipationCoefficient)) {
      invalidFields.push({ field: 'd07.thermal.dissipationCoefficient', reason: '正の有限数である必要があります' });
    }
    if (draft.d07.irreversible.kind === 'demagnetizing') {
      const irreversible = draft.d07.irreversible;
      const limitValid = isFractionInOpenRange01(irreversible.magnetHeatGaugeLimit);
      const thresholdValid = isFractionInOpenRange01(irreversible.reversibleDroopThreshold);
      if (!limitValid) invalidFields.push({ field: 'd07.irreversible.magnetHeatGaugeLimit', reason: '(0,1]の範囲の有限数である必要があります' });
      if (!thresholdValid) invalidFields.push({ field: 'd07.irreversible.reversibleDroopThreshold', reason: '(0,1]の範囲の有限数である必要があります' });
      if (limitValid && thresholdValid && !(irreversible.reversibleDroopThreshold < irreversible.magnetHeatGaugeLimit)) {
        invalidFields.push({ field: 'd07.irreversible.reversibleDroopThreshold', reason: 'magnetHeatGaugeLimit未満である必要があります' });
      }
      if (!isDroopMultiplier(irreversible.reversibleDroopMultiplier)) {
        invalidFields.push({ field: 'd07.irreversible.reversibleDroopMultiplier', reason: '(0,1]の範囲の有限数である必要があります(1超は実効Bが増える逆向き物理になるため不可)' });
      }
      if (!isFractionInOpenRange01(irreversible.demagnetizationDeltaFraction)) {
        invalidFields.push({ field: 'd07.irreversible.demagnetizationDeltaFraction', reason: '(0,1]の範囲の有限数である必要があります' });
      }
    }
  }

  if (draft.d09 === undefined) {
    missingFields.push('d09');
  } else if (!isPositiveFinite(draft.d09.bearingSeizureGaugeLimit)) {
    invalidFields.push({ field: 'd09.bearingSeizureGaugeLimit', reason: '正の有限数である必要があります' });
  }

  if (
    missingFields.length > 0 || invalidFields.length > 0 ||
    draft.battery === undefined || draft.d01 === undefined || draft.d02 === undefined || draft.d04 === undefined ||
    draft.d05 === undefined || draft.d06 === undefined || draft.d07 === undefined || draft.d09 === undefined
  ) {
    return { ok: false, missingFields, invalidFields };
  }

  return { ok: true, config: { battery: draft.battery, d01: draft.d01, d02: draft.d02, d04: draft.d04, d05: draft.d05, d06: draft.d06, d07: draft.d07, d09: draft.d09 } };
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
  courseLengthM: number | null; // ゲート6新規。test-run文脈(vehicle+track===null)でのみ非null
  slopeRad: number | null; // ゲート6新規。test-run文脈でのみ非null。M-2是正によりstepTestRun
  // (vehiclePhysics.ts)の7番目の引数として実際に消費される(stepTestRunWithDestruction参照)
  seed: number;
  initialDestructionState: DestructionState;
}

const RUN_SNAPSHOT_CONTRACT_VERSION = 2; // ゲート6でcourseLengthM/slopeRad追加のため1→2(正式Fable Q6裁定)

export interface CaptureRunSnapshotInput {
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  runContext: DestructionRunContext;
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: TrackDefinition | null;
  courseLengthM: number | null;
  slopeRad: number | null;
  seed: number;
  initialDestructionState: DestructionState;
}

// contractVersionは呼び出し側から受け取らず、この関数が常に2を付与する。
// 全フィールドを深いコピーで複写する(呼び出し後にinputを変更してもRunSnapshotへ波及しない)。
// courseLengthM/slopeRadはプリミティブ(number|null)のためstructuredCloneは不要。
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
    courseLengthM: input.courseLengthM,
    slopeRad: input.slopeRad,
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
  courseLengthM: number | null;
  slopeRad: number | null;
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
  // 正式Fable P3-3-Q5・Q6・Q12裁定(確定): effectiveTurnsRatio・brushContactResistanceRatio・
  // brushChatterProbabilityRatioを追加。effectiveTurnsRatioは`composeEffectiveMotorConfig`の
  // 戻り値型がMotorConfigである以上、型としては通常のMotorConfigフィールドであり除外できない
  // (base config限定の追加制約はrestoreRunSnapshot側、下記参照)。
  const optionalNumberFields = [
    'wireGaugeMm', 'wireResistivityRatio', 'wireDensityRatio', 'batteryInternalResistanceRatio', 'batteryCapacityRatio',
    'effectiveTurnsRatio', 'brushContactResistanceRatio', 'brushChatterProbabilityRatio',
  ];
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
function validateInitiatingCauseShape(raw: unknown): raw is { shortCircuitDurationS: number; overDischargeRatio: number | null } {
  if (!isPlainObject(raw)) return false;
  if (!isFiniteNumber(raw.shortCircuitDurationS)) return false;
  if (raw.overDischargeRatio !== null && !isFiniteNumber(raw.overDischargeRatio)) return false;
  return true;
}

function validateD04CauseLogShape(raw: unknown): boolean {
  if (!validateCauseLogCommonShape(raw)) return false;
  if (!isFiniteNumber(raw.batteryHeatRatio) || !isFiniteNumber(raw.shortCircuitDurationS)) return false;
  if (raw.stage !== 'none' && raw.stage !== 'swelling' && raw.stage !== 'smoking' && raw.stage !== 'burning') return false;
  if (raw.overDischargeRatio !== null && !isFiniteNumber(raw.overDischargeRatio)) return false;
  // 正式Fable P3-2-Q4-3裁定(確定): initiatingCauseは非null必須(stage開始原因の凍結値)。
  if (!validateInitiatingCauseShape(raw.initiatingCause)) return false;
  return true;
}
function validateD05CauseLogShape(raw: unknown): boolean {
  // 正式Fable P3-3-Q9裁定(確定): theoreticalCurrentAを追加(チャタリング中の実電流=0という
  // 既存currentAの事実は維持したまま、理論遮断電流を別記する)。
  return validateCauseLogCommonShape(raw) && isFiniteNumber(raw.sparkDurationS) && isFiniteNumber(raw.theoreticalCurrentA);
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
  // 正式Fable P3-3-Q4裁定(確定): decayExposureRadは有限非負。triggered===falseの間は
  // 0固定(崩壊前は漸減しない)。
  if (!isFiniteNumber(raw.decayExposureRad) || raw.decayExposureRad < 0) return false;
  if (raw.triggered === false && raw.decayExposureRad !== 0) return false;
  return true;
}
function validateD02ProgressShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (typeof raw.triggered !== 'boolean') return false;
  if (raw.triggeredAtT !== null && !isFiniteNumber(raw.triggeredAtT)) return false;
  // 正式Fable Gate1レビュー是正(確定、計画11.2節「state側coilHeatGaugeRatioは常に[0,1]clamp」):
  // finiteだけでなく[0,1]の閉区間を必須にする(D07のmagnetHeatGaugeRatioと同じ構造的保証)。
  if (!isFiniteNumber(raw.coilHeatGaugeRatio) || raw.coilHeatGaugeRatio < 0 || raw.coilHeatGaugeRatio > 1) return false;
  if (raw.causeLog !== null && !validateD02CauseLogShape(raw.causeLog)) return false;
  // 正式Fable P30是正(確定、D02の既存不変条件が未実装だった箇所を完全形にする): 未発火3値の
  // null同値(triggered===false ⟺ triggeredAtT===null ⟺ causeLog===null)。
  if (raw.triggered === false && (raw.triggeredAtT !== null || raw.causeLog !== null)) return false;
  if (raw.triggered === true && (raw.triggeredAtT === null || raw.causeLog === null)) return false;
  // 正式Fable P3-3-Q8裁定(確定、候補b不可逆latch): smokingStarted/smokingStartedAtTの
  // 同値関係+発火は必ず発煙を経由する片方向含意(3.5節)。
  if (typeof raw.smokingStarted !== 'boolean') return false;
  if (raw.smokingStartedAtT !== null && !isFiniteNumber(raw.smokingStartedAtT)) return false;
  if (raw.smokingStarted === false && raw.smokingStartedAtT !== null) return false;
  if (raw.smokingStarted === true && raw.smokingStartedAtT === null) return false;
  if (raw.triggered === true && raw.smokingStarted !== true) return false;
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
  // 正式Fable P3-2-Q4-4裁定(確定): initiatingCauseLogの形状+stage/cause交差不変条件3条を
  // すべてvalidatorで拒否する(unknown由来の復元であるため型宣言だけでは不正値を防げない)。
  if (raw.initiatingCauseLog !== null && !validateInitiatingCauseShape(raw.initiatingCauseLog)) return false;
  if (raw.stage === 'none' && raw.initiatingCauseLog !== null) return false; // stage==='none' ⟺ initiatingCauseLog===null
  if (raw.stage !== 'none' && raw.initiatingCauseLog === null) return false; // stage∈{swelling,smoking,burning} ⟹ 非null
  if (raw.causeLog !== null && !validateD04CauseLogShape(raw.causeLog)) return false;
  // triggered===true ⟺ stage==='burning' ∧ causeLog非null
  if (raw.triggered !== (raw.stage === 'burning' && raw.causeLog !== null)) return false;
  return true;
}
function validateD05ProgressShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (!isFiniteNumber(raw.sparkDurationS) || raw.sparkDurationS < 0) return false;
  if (typeof raw.episodeTriggered !== 'boolean') return false;
  if (!isFiniteNumber(raw.episodeCount) || raw.episodeCount < 0 || !Number.isInteger(raw.episodeCount)) return false;
  if (!isFiniteNumber(raw.cumulativeSparkExposure) || raw.cumulativeSparkExposure < 0) return false;
  if (raw.firstEpisodeAtT !== null && !isFiniteNumber(raw.firstEpisodeAtT)) return false;
  if (raw.causeLog !== null && !validateD05CauseLogShape(raw.causeLog)) return false;
  // 正式Fable裁定(確定、4.3節・11.2節): 3値の同値関係(セッション中一度もepisodeが
  // 成立していない状態の表現)+片方向含意(episodeTriggeredは非アクティブ区間で再武装
  // するため単純iffにできない)。
  const noEpisodeYet = raw.episodeCount === 0;
  if (noEpisodeYet !== (raw.firstEpisodeAtT === null) || noEpisodeYet !== (raw.causeLog === null)) return false;
  if (raw.episodeTriggered === true && raw.episodeCount === 0) return false;
  // 正式Fable P3-3-Q3裁定(確定): cumulativeWearDeltaFractionは無次元の恒久蓄積値、有限非負
  // (run中はclampしない、4.4節)。
  if (!isFiniteNumber(raw.cumulativeWearDeltaFraction) || raw.cumulativeWearDeltaFraction < 0) return false;
  // 正式Fable P3-3-Q7裁定(確定): recoveryFramesLeftは非負整数。
  if (!isFiniteNumber(raw.recoveryFramesLeft) || raw.recoveryFramesLeft < 0 || !Number.isInteger(raw.recoveryFramesLeft)) return false;
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
    // 正式Fable P3-2-Q1裁定(確定)。
    if (typeof raw.internalResistanceDegradationMultiplier !== 'number') return false;
  }
  return true;
}

// 正式Fable P3-3-Q15-4裁定(確定): d05.highCurrentPenaltyの判別union raw shape検証。
// D07のvalidateD07ConfigRawShapeと同じ規律——kindの値自体を検証し、thresholdPenaltyの
// ときのみ詳細2フィールドの型を検証する。
//
// Suu_mot3最終照合是正(P52、2026-08-10): kind==='noPenalty'のときに
// highCurrentPenaltyThresholdA/highCurrentPenaltyMultiplierが(値によらず)存在すること
// 自体を拒否する。旧番兵値(999/1等)を残したrawが「削除して救済」ではなく「不正状態として
// 拒否」されることを保証する——Q15-4が判別unionへ変更した目的(意味のない数値をペナルティ
// なし状態から排除する)は、復元境界(restoreRunSnapshot)でも同じ強さで執行しなければ、
// 旧番兵値がnoPenalty枝へ温存されたまま静かに受理されてしまう。
function validateD05HighCurrentPenaltyRawShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (raw.kind !== 'noPenalty' && raw.kind !== 'thresholdPenalty') return false;
  if (raw.kind === 'noPenalty') {
    if ('highCurrentPenaltyThresholdA' in raw || 'highCurrentPenaltyMultiplier' in raw) return false;
  }
  if (raw.kind === 'thresholdPenalty') {
    if (typeof raw.highCurrentPenaltyThresholdA !== 'number') return false;
    if (typeof raw.highCurrentPenaltyMultiplier !== 'number') return false;
  }
  return true;
}

// 正式Fable P3-2-Q11裁定(確定): {thermal, irreversible}の2部構成。thermalは磁石の種類に
// よらず常に必須、irreversibleの詳細フィールドはkind==='demagnetizing'のときのみ必須。
function validateD07ConfigRawShape(raw: unknown): boolean {
  if (!isPlainObject(raw)) return false;
  if (!isPlainObject(raw.thermal)) return false;
  if (typeof raw.thermal.conductionCoefficient !== 'number') return false;
  if (typeof raw.thermal.dissipationCoefficient !== 'number') return false;
  if (!isPlainObject(raw.irreversible)) return false;
  if (raw.irreversible.kind !== 'demagnetizing' && raw.irreversible.kind !== 'nonDemagnetizing') return false;
  if (raw.irreversible.kind === 'demagnetizing') {
    if (typeof raw.irreversible.magnetHeatGaugeLimit !== 'number') return false;
    if (typeof raw.irreversible.reversibleDroopThreshold !== 'number') return false;
    if (typeof raw.irreversible.reversibleDroopMultiplier !== 'number') return false;
    if (typeof raw.irreversible.demagnetizationDeltaFraction !== 'number') return false;
  }
  return true;
}

function validateDestructionConfigRawShape(raw: unknown): raw is DestructionConfigDraft {
  if (!isPlainObject(raw)) return false;
  if (raw.battery !== undefined && !validateBatteryDestructionConfigRawShape(raw.battery)) return false;
  // 正式Fable P3-3-Q4・Q5裁定(確定)。
  if (raw.d01 !== undefined) {
    if (!isPlainObject(raw.d01)) return false;
    if (typeof raw.d01.decayExposureScaleRad !== 'number' || typeof raw.d01.minEffectiveTurnsRatio !== 'number') return false;
  }
  if (raw.d02 !== undefined) {
    if (!isPlainObject(raw.d02)) return false;
    if (typeof raw.d02.smokeGaugeThreshold !== 'number' || typeof raw.d02.coilOverheatGaugeLimit !== 'number') return false;
    // 正式Fable P3-3-Q1・Q2裁定(確定)。
    if (typeof raw.d02.conductionScale !== 'number' || typeof raw.d02.dissipationCoefficient !== 'number' || typeof raw.d02.smokeResistanceMultiplier !== 'number') return false;
  }
  // 正式Fable P3-2-Q5裁定(確定)。
  if (raw.d04 !== undefined) {
    if (!isPlainObject(raw.d04)) return false;
    if (typeof raw.d04.bodyScorchDeltaFraction !== 'number' || typeof raw.d04.magnetScorchDeltaFraction !== 'number') return false;
  }
  if (raw.d05 !== undefined) {
    if (!isPlainObject(raw.d05)) return false;
    if (typeof raw.d05.brushSparkDurationLimitS !== 'number' || typeof raw.d05.brushSparkCurrentThresholdA !== 'number') return false;
    // 正式Fable P3-3-Q3・Q6・Q7・Q15-4裁定(確定)。
    if (
      typeof raw.d05.brushWearRateRatio !== 'number' || !validateD05HighCurrentPenaltyRawShape(raw.d05.highCurrentPenalty)
      || typeof raw.d05.wearPerAmpSecond !== 'number'
      || typeof raw.d05.recoveryFrames !== 'number' || typeof raw.d05.recoveryContactResistanceMultiplier !== 'number'
    ) {
      return false;
    }
  }
  if (raw.d06 !== undefined) {
    if (!isPlainObject(raw.d06) || !isPlainObject(raw.d06.breakage)) return false;
    if (raw.d06.breakage.kind !== 'breakable' && raw.d06.breakage.kind !== 'nonBreakable') return false;
    if (raw.d06.breakage.kind === 'breakable' && typeof raw.d06.breakage.gearStrengthThresholdNm !== 'number') return false;
  }
  if (raw.d07 !== undefined && !validateD07ConfigRawShape(raw.d07)) return false;
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
  // 正式Fable P3-3-Q12裁定(確定): effectiveTurnsRatioはどの素材を選んでも新品時は必ず1.0
  // (D04/D07の合成対象フィールドと異なり、base値が素材選択によって正当に1.0以外を取ることは
  // ない)。RunSnapshotが保持するbase(無傷)configに限ってこの追加値制約を課す
  // (`composeEffectiveMotorConfig`の出力=実行時のみ・保存されないものには適用しない)。
  if (motorConfigRaw.effectiveTurnsRatio !== undefined && motorConfigRaw.effectiveTurnsRatio !== 1) {
    return { ok: false, reason: 'invalidSchema', details: 'motorConfig.effectiveTurnsRatio must be undefined or 1 in a base (unmodified) config' };
  }

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

  const courseLengthMRaw = raw.courseLengthM;
  if (courseLengthMRaw !== null && !isFiniteNumber(courseLengthMRaw)) {
    return { ok: false, reason: 'invalidSchema', details: 'courseLengthM' };
  }
  const slopeRadRaw = raw.slopeRad;
  if (slopeRadRaw !== null && !isFiniteNumber(slopeRadRaw)) {
    return { ok: false, reason: 'invalidSchema', details: 'slopeRad' };
  }

  // 正式M2必須検証(ゲート6拡張、正式Fable Q6裁定): context⟺各フィールドのnull性一致。
  // courseLengthM/slopeRadはtest-run文脈(vehicle+track===null)でのみ非nullを許す
  // (track-runはstepTrackRunがtrackのセグメントデータから区間ごとに勾配を導出するため、
  // 単一のflat値を持たない)。
  if (runContextRaw.context === 'motor') {
    if (carConfigRaw !== null || initialVehicleStateRaw !== null || trackRaw !== null) {
      return { ok: false, reason: 'invalidSchema', details: 'motor context requires carConfig/initialVehicleState/track to be null' };
    }
    if (courseLengthMRaw !== null || slopeRadRaw !== null) {
      return { ok: false, reason: 'invalidSchema', details: 'motor context requires courseLengthM/slopeRad to be null' };
    }
  } else {
    if (carConfigRaw === null || initialVehicleStateRaw === null) {
      return { ok: false, reason: 'invalidSchema', details: 'vehicle context requires carConfig/initialVehicleState to be non-null' };
    }
    if (trackRaw === null) {
      // test-run文脈: courseLengthMは正の有限数、slopeRadは0/負値を許す有限数(人間再承認バンドル訂正済み)
      if (courseLengthMRaw === null || !isPositiveFinite(courseLengthMRaw)) {
        return { ok: false, reason: 'invalidSchema', details: 'test-run context requires courseLengthM to be a positive finite number' };
      }
      if (slopeRadRaw === null) {
        return { ok: false, reason: 'invalidSchema', details: 'test-run context requires slopeRad to be a finite number' };
      }
    } else if (courseLengthMRaw !== null || slopeRadRaw !== null) {
      return { ok: false, reason: 'invalidSchema', details: 'track-run context requires courseLengthM/slopeRad to be null' };
    }
  }

  const seedRaw = raw.seed;
  if (!isFiniteNumber(seedRaw)) return { ok: false, reason: 'invalidSchema', details: 'seed' };

  const initialDestructionStateRaw = raw.initialDestructionState;
  if (!validateDestructionStateShape(initialDestructionStateRaw)) return { ok: false, reason: 'invalidSchema', details: 'initialDestructionState' };
  // 正式Fable P3-3-Q7裁定に伴うcross-validator(確定): 復元されたrecoveryFramesLeftが
  // 対応するconfigの上限(recoveryFrames)を超えないことを保証する。これがないと、破損・
  // 改竄されたlocalStorageデータから任意に大きなrecoveryFramesLeftを持つsnapshotを復元でき、
  // configの較正値によらない任意長の接触抵抗悪化が発生しうる(P41是正)。
  if (initialDestructionStateRaw.modes.D05.recoveryFramesLeft > destructionConfigResult.config.d05.recoveryFrames) {
    return { ok: false, reason: 'invalidSchema', details: 'initialDestructionState.modes.D05.recoveryFramesLeft must not exceed destructionConfig.d05.recoveryFrames' };
  }

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
      courseLengthM: courseLengthMRaw,
      slopeRad: slopeRadRaw,
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
    // 正式Fable P3-3-Q1裁定(確定): 実効config(発煙悪化込みのR)と実電流の毎step独立
    // 再計算による、捏造のないI²R結合(3.1節)。
    coilLossW: next.current * next.current * computeRCoil(config),
    // 正式Fable P3-3-Q4裁定に伴うP1是正(確定): バースト最終stepの取りこぼしを解消する
    // 復元式(4.2節)。
    isChatteringThisFrame: prev.chatterFramesLeft > 0 || next.chatterFramesLeft > 0,
    // 正式Fable P3-3-Q4裁定(確定): 平滑化前の生角速度(5.2節)。
    angularVelocityRadS: next.omega,
  };
}

// P3-2ゲート5(v11 §5.3、Suu_mot3裁定によるゲート6→5前倒し、計画v13)。
/**
 * vehicle文脈(test-run/track-run共通)のDestructionFrameInput組み立て純関数。単体テストから
 * 直接呼び出せるようexportする: ゲート5のM4/D07 test-only harness(materialMapping.test.ts)が
 * `stepTrackRun`と本関数の両方へ同一の実効config(`composeEffectiveMotorConfig`)を渡す
 * 単一出典契約を、frame組み立て式を複製せず実関数を直接importして検証するため。新設純関数の
 * 可視性追加であり、既存公開契約の変更ではない(`composeEffectiveMotorConfig`のexport化と同型)。
 */
export function buildVehicleFrameInput(config: MotorConfig, prev: VehicleSimState, next: VehicleSimState): DestructionFrameInput {
  const theoreticalCurrentA = computeElectricalState(config, prev.motor.theta, prev.motor.omega).current;
  return {
    currentA: next.motor.current,
    theoreticalCurrentA,
    rpm: next.motor.rpm,
    batteryHeat: next.motor.batteryHeat,
    shorted: next.motor.shorted,
    chatterFramesLeft: next.motor.chatterFramesLeft,
    coilCollapsedRisingEdge: didCollapseJustHappen(prev.motor, next.motor),
    loadTorqueNm: next.loadTorqueNm,
    // energyUsedRatio: test-runは走行距離無制限のフリー走行であり、courseLengthMを
    // 完走すれば終わるがそれ以前は事実上の耐久走行になる。長時間走行すれば
    // energyUsedRatioがunsafeDischargeStartRatioへ到達しD04過放電経路が発火しうるが、
    // これはフリー走行の正直な帰結であり隠すべき挙動ではない、意図仕様である
    // (付帯条件6、正式P3-1確定裁定の適用、計画v11 5.3節)。
    energyUsedRatio: next.energyUsedJ / computeEnergyBudgetJ(config),
    // 正式Fable P3-3-Q1裁定(確定、3.1節)。
    coilLossW: next.motor.current * next.motor.current * computeRCoil(config),
    // 正式Fable P3-3-Q4裁定に伴うP1是正(確定、4.2節)。
    isChatteringThisFrame: prev.motor.chatterFramesLeft > 0 || next.motor.chatterFramesLeft > 0,
    // 正式Fable P3-3-Q4裁定(確定、5.2節)。
    angularVelocityRadS: next.motor.omega,
  };
}

// 正式Fable補足裁定(P3-2ゲート5 Q13-1、2026-08-09、人間プロジェクトリード直接提示・人間再承認済み
// 2026-08-09T06:20)。docs/phase3-p3-2-plan.md 14.1節・14.2節(v15)参照。
//
// D04が既存物理終了後に継続stepしないというPhase3-Q2の確定裁定と、production-valid構成での
// feasibility実測(D04段階時間とUI識別可能性の構造的対立、同文書v4)から、V2由来のoverheated
// 終端(batteryHeat>=BATTERY_HEAT_LIMIT)とD04熱暴走進行(runawayHeatThreshold到達→膨張→
// 発煙→炎上)が同一物理過程の二重表現になっていたことが判明した。電池がlipoでD04のstageが
// {swelling, smoking}にある間は、overheatedという物理終了条件そのものを保留し(=物理終了の
// 定義から重複表現を除く)、D04状態機械がburning到達まで熱暴走の表現を専有する。
//
// 保留はwrapper層(本ファイル)が所有する。凍結済みvehiclePhysics.ts/trackPhysics.tsは無改修
// のまま、この純関数をbase stepの前後(pre/post)で適用することで実現する(14.2節)。
// - (pre) base stepへ渡す直前に、prev vehicle state・prev destruction stateへ適用し、
//   base step内部の早期returnガード(state.status==='overheated'なら入力をそのまま返す
//   既存パターン)を回避する。
// - (post) base step実行後、advanceDestructionStateでnext destruction stateを得てから、
//   base stepが返した生のnext vehicle stateとこのnext destruction stateへ再適用し、
//   physics end判定/RunOutcome分類へ渡す。これによりnone→swelling同一step境界
//   (このstep開始時点ではまだstage==='none'だがadvanceDestructionState後にswellingへ
//   遷移した場合)でも正しく保留される(pre適用だけでは捕捉できない、v14→v15是正)。
//
// 有界性: 保留は無限延命ではない。D04段階タイマーは不可逆進行(正式P3-2-Q4(ii)裁定)のため、
// swelling突入からswellingS+smokingS後に必ずburningへ到達し、以後は保留せず
// destructionTerminalが優先する(下記b)。
//
// 将来のstepTestRunWithDestruction(ゲート6)・stepTrackRunWithDestruction(P3-4)は、
// 必ずこの同じ関数を直接importして同一のpre/post契約で適用し、独自の正規化ロジックを
// 複製してはならない(14.2節「台帳送り」)。
//
// 同一step境界4ケース(14.2節、いずれもテストで固定する):
//   (a) lipo・next D04 stage∈{swelling,smoking} → statusをrunningへ書き換える(保留発動)
//   (b) lipo・next D04 stage==='burning'        → 正規化しない(素通し、destructionTerminal優先)
//   (c) nonLipo(D03経路等)                      → 正規化しない(素通し、D03の既存規則は不変)
//   (d) 上記以外(D04 stage==='none'等)          → 正規化しない(素通し、既存終端挙動は不変)
export function normalizeOverheatedStatusForD04Hold(state: VehicleSimState, destructionState: DestructionState): VehicleSimState {
  if (state.status !== 'overheated') return state;
  if (destructionState.battery.profile !== 'lipo') return state;
  const stage = destructionState.battery.d04.stage;
  if (stage !== 'swelling' && stage !== 'smoking') return state;
  return { ...state, status: 'running' };
}

// motorPhysics.tsの`type Rng = () => number`は非exportのため、destructionOrchestration.ts側から
// 直接参照できない。motorPhysics.tsは無改修のまま、既存`step`の公開シグネチャから型を導出する。
type MotorStepRng = NonNullable<Parameters<typeof step>[3]>;

// P3-2ゲート4(v12 §3.2「D02/D04/D07の実効config合成」、docs/phase3-p3-2-plan.md v11 §2.0)。
/**
 * config合成純関数。production wrapperは内部で使用する。合成結果は保存・表示・wrapper外の
 * 走行入力へ二重供給しない(リプレイは元configから毎回再計算する)。決定論的純関数である。
 *
 * 単体テスト(付帯条件1の予算不変性テスト等)から直接呼び出せるようexportする: 新設純関数の
 * 可視性追加であり、既存公開契約の変更ではない(`classifyTerminalModes`のexport化と同型)。
 */
export function composeEffectiveMotorConfig(
  baseMotorConfig: MotorConfig,
  destructionState: DestructionState,
  destructionConfig: DestructionConfig,
): MotorConfig {
  let effective = baseMotorConfig;

  // D01(正式Fable Q4・Q5裁定、確定): 実効巻数・占積の単一磁気結合率(5.3節)。
  // decayExposureRadはtriggered===falseの間0固定(advanceD01)であるため、この式は
  // 未崩壊時には常にeffectiveTurnsRatio===1へ評価され、composeは実質no-opになる。
  // backEmf/tMagへ同一係数を適用するのはエネルギー整合の要請(K_E=K_T相反性、
  // motorPhysics.ts側のコメント参照)。R_coil/Jは実coilTurnsのまま据え置く。
  const effectiveTurnsRatio = Math.max(
    destructionConfig.d01.minEffectiveTurnsRatio,
    1 - destructionState.modes.D01.decayExposureRad / destructionConfig.d01.decayExposureScaleRad,
  );
  if (effectiveTurnsRatio !== 1) {
    effective = { ...effective, effectiveTurnsRatio };
  }

  // D02(正式Fable Q1・Q2・Q8裁定、確定): 発煙段階のR_coil重ね掛け(3.2節)。判定条件は
  // smokingStarted(不可逆latch、候補b確定)を使う——生のcoilHeatGaugeRatioを毎frame
  // 再判定しない(3.5節)。
  if (destructionState.modes.D02.smokingStarted) {
    effective = { ...effective, wireResistivityRatio: (baseMotorConfig.wireResistivityRatio ?? 1) * destructionConfig.d02.smokeResistanceMultiplier };
  }

  // D04(正式Fable Q1裁定、確定): swelling/smokingで係数を区別しない(段階差は物理的に
  // 実在するが、区別を支える較正根拠がなく、smokingは滞在時間も短い)。単一係数
  // internalResistanceDegradationMultiplier(既存batteryInternalResistanceRatioへの
  // 乗数であることを名前で示す、「Ratio」の重複を避ける)を掛ける。
  if (destructionState.battery.profile === 'lipo' && destructionConfig.battery.profile === 'lipo') {
    const stage = destructionState.battery.d04.stage;
    if (stage === 'swelling' || stage === 'smoking') {
      const degradedRatio = (baseMotorConfig.batteryInternalResistanceRatio ?? 1) * destructionConfig.battery.internalResistanceDegradationMultiplier;
      effective = { ...effective, batteryInternalResistanceRatio: degradedRatio };
    }
  }

  // D05(正式Fable Q7裁定、確定候補a回復区間モデル): チャタリングバースト終了直後、
  // アーク放電後の接触面荒れによる一時的な接触抵抗悪化(7.2節)。recoveryFramesLeftは
  // advanceD05が既に前stepの値として管理済みであり、ここでは読むだけ(消費はしない)。
  if (destructionState.modes.D05.recoveryFramesLeft > 0) {
    effective = { ...effective, brushContactResistanceRatio: (baseMotorConfig.brushContactResistanceRatio ?? 1) * destructionConfig.d05.recoveryContactResistanceMultiplier };
  }

  // D07(正式Fable Q2・Q3裁定、確定): 合成順序は乗算の可換性により意味を持たない
  // (「順序に意味があるかのようなコメント」は残さない)。実効B = base × (1−不可逆分) ×
  // 可逆分の単一式で書く。不可逆到達後もダレ係数は重畳適用する(熱い磁石は恒久損傷後も
  // 熱い)。翌セッションの恒久分はWearState.demagnetizationFraction経由でbase
  // (materialMapping.tsのmagnetStrength較正)へ既に織り込み済みという層分離は現設計どおり
  // (このcomposeは同一セッション内で新たに不可逆到達した瞬間からの即時反映のみを担う)。
  if (destructionConfig.d07.irreversible.kind === 'demagnetizing') {
    const d07 = destructionState.modes.D07;
    const irreversibleMultiplier = d07.irreversibleTriggered ? (1 - destructionConfig.d07.irreversible.demagnetizationDeltaFraction) : 1;
    const reversibleMultiplier = d07.reversibleDroopActive ? destructionConfig.d07.irreversible.reversibleDroopMultiplier : 1;
    if (irreversibleMultiplier !== 1 || reversibleMultiplier !== 1) {
      effective = { ...effective, magnetStrength: baseMotorConfig.magnetStrength * irreversibleMultiplier * reversibleMultiplier };
    }
  }

  return effective;
}

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
  const baseConfig = accumulator.replaySnapshot.motorConfig; // 唯一の出典(P3-1-Q9-2、不変)
  const destructionConfig = accumulator.replaySnapshot.destructionConfig; // 唯一の出典(P3-1-Q9-2、不変)
  const config = composeEffectiveMotorConfig(baseConfig, accumulator.destructionState, destructionConfig); // 新規(ゲート4)
  const physicsState = step(config, motorState, dt, rng, loadTorque, effectiveInertia); // 実効configを使用
  const frame = buildMotorOnlyFrameInput(config, motorState, physicsState); // 同じ実効configを使用(既存規約を維持)
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

// vehiclePhysics.tsの`type Rng = () => number`は非exportのため、destructionOrchestration.ts側から
// 直接参照できない。vehiclePhysics.tsは無改修のまま、既存`stepTestRun`の公開シグネチャから
// 型を導出する(MotorStepRngと同型のパターン)。
type VehicleStepRng = NonNullable<Parameters<typeof stepTestRun>[5]>;

// P3-2ゲート6(docs/phase3-p3-2-plan.md v17 §5.1、正式Fable Q8裁定)。
/**
 * vehicle文脈(test-run)のsnapshotを持つaccumulator専用。motor文脈のaccumulatorを
 * 渡した場合の挙動は未定義(trusted precondition、付帯条件2)。
 */
export function stepTestRunWithDestruction(
  vehicleState: VehicleSimState,
  accumulator: RunAccumulator,
  dt: number,
  rng?: VehicleStepRng,
): DestructionStepResult<VehicleSimState> {
  const baseMotorConfig = accumulator.replaySnapshot.motorConfig; // 唯一の出典(P3-1-Q9-2、不変)
  const destructionConfig = accumulator.replaySnapshot.destructionConfig; // 唯一の出典(P3-1-Q9-2、不変)
  const motorConfig = composeEffectiveMotorConfig(baseMotorConfig, accumulator.destructionState, destructionConfig); // ゲート4
  const carConfig = accumulator.replaySnapshot.carConfig!; // vehicle文脈、正式M2検証により非null
  const courseLengthM = accumulator.replaySnapshot.courseLengthM!; // ゲート6(5.2節)、vehicle+track===null文脈で非null
  const slopeRad = accumulator.replaySnapshot.slopeRad!; // ゲート6(5.2節)、M-2是正。vehicle+track===null文脈で非null

  // overheated保留規則(正式Fable P3-2ゲート5 Q13-1裁定、docs/phase3-p3-2-plan.md 14.2節)。
  // wrapper共通契約のpre面: base step(stepTestRun)へ渡す直前に、prev vehicle state・
  // prev destruction stateへnormalizeOverheatedStatusForD04Holdを適用し、base step内部の
  // 早期returnガード(state.status==='overheated'なら入力をそのまま返す)を回避する。
  const prevPhysicsState = normalizeOverheatedStatusForD04Hold(vehicleState, accumulator.destructionState);

  // stepTestRunの実シグネチャ(vehiclePhysics.ts)は
  // (motorConfig, carConfig, state, dt, courseLengthM, rng, slopeRad)であり、slopeRadは
  // 実際にstepVehicleへ渡される引数である。省略すると既定値0で走行し、RunSnapshotが
  // 保持するslopeRadが実際の物理へ反映されない「死にフィールド」になるため、M-2是正として
  // 最後の引数まで明示的に渡す。
  const rawNextPhysicsState = stepTestRun(motorConfig, carConfig, prevPhysicsState, dt, courseLengthM, rng, slopeRad);
  const frame = buildVehicleFrameInput(motorConfig, prevPhysicsState, rawNextPhysicsState); // 5.3節、ゲート5で新設済みの実関数をそのまま使用
  const { state, events } = advanceDestructionState(
    accumulator.destructionState, frame, destructionConfig, accumulator.replaySnapshot.runContext, dt,
  );
  // wrapper共通契約のpost面: advanceDestructionState実行後のnext destruction stateと、
  // base stepが返した生のnext physics stateへ再適用してからphysics end判定/RunOutcome分類へ
  // 渡す。これによりnone→swelling同一step境界でも正しく保留される(14.2節)。
  const physicsState = normalizeOverheatedStatusForD04Hold(rawNextPhysicsState, state);
  // PhysicsSnapshotAtTはDestructionStepResult.physicsStateと同じ正規化後stateを保存する
  // (このstepの実際の返却値と一致させる、Suu_mot3レビュー指摘)。
  const snapshot: PhysicsSnapshotAtT = { context: 'vehicle', state: physicsState };
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
