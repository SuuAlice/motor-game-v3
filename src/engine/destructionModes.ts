// P3-0(docs/phase3-p3-0-plan.md v7、docs/phase3-plan-v12.md)+P3-1(docs/phase3-p3-1-plan.md v7)。
// 破壊モード状態機械の型定義+advanceDestructionState本体(D01/D03のみ、P3-0-Q6裁定範囲)。
// leafモジュール(destructionOrchestration.tsおよびstep実装関数本体への逆依存・循環依存を
// 持たない。基礎leaf=./constantsへの一方向値import、およびmotorPhysics.ts/vehiclePhysics.ts
// からの型のみimportは許す。正式Fable補足裁定P3-1-Q8(a)確定文言、2026-08-03T16:13)。
//
// leaf不変条件(正式Fable補足裁定、2026-08-03T16:13確定): destructionModes.tsの公開シグネチャ
// (advanceDestructionState等)に現れるすべての型はdestructionModes.tsが所有する。本ファイルは
// FireExposureRole(P3-0以来)に加え、DestructionRunContext・FireExposureProfile(正式Fable
// P3-1-Q2(a)裁定)・BatteryDestructionConfig・GearBreakageProfile・DestructionConfig(正式Fable
// P3-1-Q7(a)裁定)を所有する。destructionOrchestration.tsはこれらをimportしre-exportする。

import type { SimState } from './motorPhysics';
import type { VehicleSimState } from './vehiclePhysics';
import { BATTERY_HEAT_LIMIT } from './constants';

export type DestructionModeId = 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D09';
// D08はPhase3のengine型に含めない(Phase5の(e)周回拡張完成後)。

// Phase3で延焼差分(scorch)に対応するroleをこの2つに限定する(v12 1.6節)。
export type FireExposureRole = 'body' | 'magnet';

// 正式Fable P3-1-Q2(a)裁定(2026-08-03T09:05確定、2026-08-03T16:13補足裁定でleaf不変条件の
// 一部として再確認): destructionOrchestration.ts所有だったFireExposureProfile・
// validateFireExposureProfile・DestructionRunContextをここへ移設する。フィールド構成・意味は
// 一切変更しない。destructionOrchestration.tsはここからimportしre-exportする。
export interface FireExposureProfile {
  bodyEquipped: boolean;
  adjacentRolesEquipped: readonly Exclude<FireExposureRole, 'body'>[];
}

export function validateFireExposureProfile(raw: {
  bodyEquipped: boolean;
  adjacentRolesEquipped: readonly Exclude<FireExposureRole, 'body'>[];
}): { ok: true; profile: FireExposureProfile } | { ok: false; reason: string } {
  const validRoles: readonly string[] = ['magnet'];
  const seenRoles = new Set<string>();
  for (const role of raw.adjacentRolesEquipped) {
    if (!validRoles.includes(role as string)) {
      return { ok: false, reason: `adjacentRolesEquippedに不正な値が含まれています: ${String(role)}` };
    }
    // 正式Fable P3-2-Q4-5裁定(確定、案a): 重複要素は受理せず拒否する(「不正状態は検出でなく
    // 構築不能に、修復はしない」という原則。event組み立て時の無言修復=Set化は不採用)。
    // 人間再承認バンドル対象(既存公開validatorの受理契約の狭窄)。
    if (seenRoles.has(role as string)) {
      return { ok: false, reason: `adjacentRolesEquippedに重複した値が含まれています: ${String(role)}` };
    }
    seenRoles.add(role as string);
  }
  return { ok: true, profile: { bodyEquipped: raw.bodyEquipped, adjacentRolesEquipped: raw.adjacentRolesEquipped } };
}

export type DestructionRunContext =
  | { context: 'motor'; fireExposureProfile: FireExposureProfile; gearTotalToothCount: null }
  | { context: 'vehicle'; fireExposureProfile: FireExposureProfile; gearTotalToothCount: number };

// 正式Fable P3-1-Q7(a)裁定(2026-08-03T16:13確定): destructionOrchestration.ts所有だった
// BatteryDestructionConfig・GearBreakageProfile・DestructionConfigをここへ移設する。
// フィールド構成・意味は一切変更しない。DestructionConfigDraft・InvalidConfigField・
// ValidateDestructionConfigResult・validateDestructionConfig本体・restore用raw validatorは
// destructionOrchestration.ts側に残る(復元・値域検証はstoreのRunSnapshot責務に属する
// orchestration固有の役割であり、leafに引きずり込むべきでないため)。
export type BatteryDestructionConfig =
  | { profile: 'nonLipo'; shortCircuitDurationLimitS: number }
  | {
      profile: 'lipo';
      shortCircuitDurationLimitS: number;
      runawayHeatThreshold: number;
      unsafeDischargeStartRatio: number;
      stageDurations: { swellingS: number; smokingS: number };
      // 正式Fable P3-2-Q1裁定(確定、2026-08-08): D04 swelling/smoking段階でbatteryInternalResistanceRatio
      // (motorPhysics.ts)へ乗算する単一係数。段階間の差は区別しない(較正根拠がなく、smokingは
      // 滞在時間も短いため)。人間再承認バンドル対象。設計較正値、sweep実測(ゲート5)で最終化する。
      internalResistanceDegradationMultiplier: number;
    };

export type GearBreakageProfile = { kind: 'breakable'; gearStrengthThresholdNm: number } | { kind: 'nonBreakable' };

export interface DestructionConfig {
  battery: BatteryDestructionConfig;
  d02: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
  // 正式Fable P3-2-Q5裁定(確定): D04延焼時にbody/magnetへ加算するdeltaFraction。単一出典として
  // advanceD04が発火時点でUnstampedDestructionEventへ埋め込む。人間再承認バンドル対象。
  d04: { bodyScorchDeltaFraction: number; magnetScorchDeltaFraction: number };
  d05: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06: { breakage: GearBreakageProfile };
  // 正式Fable P3-2-Q11裁定(確定): 熱蓄積(thermal、磁石の種類によらず常に計算する)+
  // 不可逆到達条件(irreversible、判別union)の2部構成。候補(i)の閾値ハック(0-1ゲージ規約違反)は
  // 不採用。人間再承認バンドル対象。
  d07: {
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
  d09: { bearingSeizureGaugeLimit: number };
}

export interface DestructionSharedSignals {
  shortCircuitDurationS: number;
  elapsedTimeS: number;
}

export function createInitialSharedSignals(): DestructionSharedSignals {
  return { shortCircuitDurationS: 0, elapsedTimeS: 0 };
}

export interface D01Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  causeLog: D01CauseLog | null;
}

export interface D02Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  coilHeatGaugeRatio: number;
  causeLog: D02CauseLog | null;
}

export type BatteryDestructionProgress = { profile: 'nonLipo'; d03: D03Progress } | { profile: 'lipo'; d04: D04Progress };

export interface D03Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  causeLog: D03CauseLog | null;
}

export interface D04Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning';
  stageEnteredAtT: number | null;
  overDischargeActive: boolean;
  // 正式Fable P3-2-Q4-3裁定(確定、2026-08-08): 'none'→'swelling'遷移の瞬間に一度だけ
  // 原因を凍結記録する記憶域。burning到達時のD04CauseLog.initiatingCauseへ複写する。
  // 人間再承認バンドル対象。stage/cause交差不変条件(Q4-4): stage==='none' ⟺ null、
  // stage∈{swelling,smoking,burning} ⟹ 非null。
  initiatingCauseLog: { shortCircuitDurationS: number; overDischargeRatio: number | null } | null;
  causeLog: D04CauseLog | null;
}

export interface D05Progress {
  sparkDurationS: number;
  episodeTriggered: boolean;
  episodeCount: number;
  cumulativeSparkExposure: number;
  firstEpisodeAtT: number | null;
  causeLog: D05CauseLog | null;
}

export interface D06Progress {
  toothLossCount: number;
  firstLossAtT: number | null;
  causeLog: D06CauseLog | null;
}

export interface D07Progress {
  magnetHeatGaugeRatio: number;
  reversibleDroopActive: boolean;
  irreversibleTriggered: boolean;
  irreversibleTriggeredAtT: number | null;
  causeLog: D07CauseLog | null;
}

export interface D09Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  bearingHeatGaugeRatio: number;
  causeLog: D09CauseLog | null;
}

export interface DestructionState {
  shared: DestructionSharedSignals;
  battery: BatteryDestructionProgress;
  modes: {
    D01: D01Progress;
    D02: D02Progress;
    D05: D05Progress;
    D06: D06Progress;
    D07: D07Progress;
    D09: D09Progress;
  };
}

export function createInitialDestructionState(batteryProfile: 'lipo' | 'nonLipo'): DestructionState {
  return {
    shared: createInitialSharedSignals(),
    battery:
      batteryProfile === 'lipo'
        ? { profile: 'lipo', d04: { triggered: false, triggeredAtT: null, stage: 'none', stageEnteredAtT: null, overDischargeActive: false, initiatingCauseLog: null, causeLog: null } }
        : { profile: 'nonLipo', d03: { triggered: false, triggeredAtT: null, causeLog: null } },
    modes: {
      D01: { triggered: false, triggeredAtT: null, causeLog: null },
      D02: { triggered: false, triggeredAtT: null, coilHeatGaugeRatio: 0, causeLog: null },
      D05: { sparkDurationS: 0, episodeTriggered: false, episodeCount: 0, cumulativeSparkExposure: 0, firstEpisodeAtT: null, causeLog: null },
      D06: { toothLossCount: 0, firstLossAtT: null, causeLog: null },
      D07: { magnetHeatGaugeRatio: 0, reversibleDroopActive: false, irreversibleTriggered: false, irreversibleTriggeredAtT: null, causeLog: null },
      D09: { triggered: false, triggeredAtT: null, bearingHeatGaugeRatio: 0, causeLog: null },
    },
  };
}

// advanceDestructionStateの入力(P3-1本体実装時に使用する型のみP3-0で確定する)。
export interface DestructionFrameInput {
  currentA: number;
  theoreticalCurrentA: number;
  rpm: number;
  batteryHeat: number;
  shorted: boolean;
  chatterFramesLeft: number;
  coilCollapsedRisingEdge: boolean;
  loadTorqueNm?: number;
  energyUsedRatio?: number;
}

export type TemperatureReading = { kind: 'measured'; temperatureC: number } | { kind: 'uncalibratedGauge'; ratio: number } | { kind: 'unavailable' };

export interface CauseLogCommon {
  currentA: number;
  rpm: number;
  atT: number;
  temperature: TemperatureReading;
}

export interface D01CauseLog extends CauseLogCommon {}
export interface D02CauseLog extends CauseLogCommon {
  coilHeatGaugeRatio: number;
}
export interface D03CauseLog extends CauseLogCommon {
  batteryHeatRatio: number;
  shortCircuitDurationS: number;
}
export interface D04CauseLog extends CauseLogCommon {
  batteryHeatRatio: number;
  shortCircuitDurationS: number; // burning到達時点の瞬間値(正式Fable P3-2-Q4-3裁定)
  stage: D04Progress['stage'];
  overDischargeRatio: number | null; // burning到達時点の瞬間値(正式Fable P3-2-Q4-3裁定)
  // 正式Fable P3-2-Q4-3裁定(確定): stage開始原因の凍結値(D04Progress.initiatingCauseLogから複写)。
  // 人間再承認バンドル対象。
  initiatingCause: { shortCircuitDurationS: number; overDischargeRatio: number | null };
}
export interface D05CauseLog extends CauseLogCommon {
  sparkDurationS: number;
}
export interface D06CauseLog extends CauseLogCommon {
  loadTorqueNm: number;
  toothLossCount: number;
}
export interface D07CauseLog extends CauseLogCommon {
  magnetHeatGaugeRatio: number;
}
export interface D09CauseLog extends CauseLogCommon {
  bearingHeatGaugeRatio: number;
}

export type PhysicsSnapshotAtT = { context: 'motor'; state: SimState } | { context: 'vehicle'; state: VehicleSimState };

// physicsSnapshotAtTを持たない、destructionModes.ts内部の生イベント形。
// destructionOrchestration.ts(P3-1でadvanceDestructionStateを実装する際)が
// physicsSnapshotAtTを後付けして公開DestructionEvent型へ変換する。
export type UnstampedDestructionEvent =
  | { mode: 'D01'; causeLog: D01CauseLog; isFirstThisSession: true }
  | { mode: 'D02'; causeLog: D02CauseLog; isFirstThisSession: true }
  | { mode: 'D03'; causeLog: D03CauseLog; isFirstThisSession: true }
  | {
      mode: 'D04';
      causeLog: D04CauseLog;
      isFirstThisSession: true;
      affectedRoles: readonly FireExposureRole[];
      // 正式Fable P3-2-Q5裁定(確定): DestructionConfig.d04由来の単一出典値。人間再承認バンドル対象。
      bodyScorchDeltaFraction: number;
      magnetScorchDeltaFraction: number;
    }
  | { mode: 'D05'; causeLog: D05CauseLog; isFirstThisSession: boolean }
  | { mode: 'D06'; causeLog: D06CauseLog; isFirstThisSession: boolean; isTotalLoss: boolean }
  | {
      mode: 'D07';
      causeLog: D07CauseLog;
      isFirstThisSession: true;
      // 正式Fable P3-2-Q5裁定(確定): DestructionConfig.d07.irreversible由来の単一出典値
      // (kind==='demagnetizing'のときのみ発火するため、常に非0。人間再承認バンドル対象)。
      demagnetizationDeltaFraction: number;
    }
  | { mode: 'D09'; causeLog: D09CauseLog; isFirstThisSession: true };

// ---------------------------------------------------------------------------
// advanceDestructionState本体(P3-1、docs/phase3-p3-1-plan.md v7 §2.1。P3-2ゲート3で
// D04/D07を追加、docs/phase3-p3-2-plan.md v9 §2.2・§2.5)。
// P3-0-Q6不変条件(正式Fable裁定): 差分換算(deriveDegradationDiffs)実装済みのモードの
// イベントしか発行しない。P3-2ゲート3時点でホワイトリストはD01・D03・D04・D07(いずれも
// destructionOrchestration.tsのderiveDegradationDiffsが同一ゲートで対応済み)。
// D02/D05/D06/D09の判定関数はP3-2に存在しない(P3-3以降で追加する)。
// ---------------------------------------------------------------------------

// 物理較正値ではなく、固定dt累積の浮動小数点誤差だけを吸収する数値許容差(サブステップ1の
// materialMapping.test.tsでの実測発見、Suu裁定でP3-1本体へ反映。dt=1/120sを360回加算した
// 実測値は2.999999999999992であり厳密な3.0にはならない。この誤差を吸収しないと、本来
// 到達すべきフレームで判定が1フレーム遅れる。正式Fable補足裁定(2026-08-03T16:13)で異議なく
// 承認済み: 蓄積誤差は約8e-15、epsilon=1e-9は吸収に十分かつdt=1/120秒より6桁小さく、境界を
// 誤った方向へ1フレームずらすことは構造的に不可能)。
// 単一出典: 後続ステップ(P3-2のD04 stageDurations、P3-3のD05 brushSparkDurationLimitS)が
// 同種のduration比較を導入する際、別のepsilonを発明せずこの定数の共通化・再利用を検討すること。
// P3-2ゲート5是正(2026-08-09、Suu_mot3裁定)でexport化: テストコード側が同種のduration比較を
// 独立検証する際、この値を複製せず直接importして単一出典を保つ。
export const DURATION_COMPARISON_EPSILON_S = 1e-9;

function advanceD01(
  prev: D01Progress,
  frame: DestructionFrameInput,
  elapsedTimeS: number,
): { next: D01Progress; event: UnstampedDestructionEvent | null } {
  if (prev.triggered) return { next: prev, event: null }; // 崩壊は不可逆・一度きり(spec §7.1.1)
  if (!frame.coilCollapsedRisingEdge) return { next: prev, event: null };
  const causeLog: D01CauseLog = {
    currentA: frame.currentA,
    rpm: frame.rpm,
    atT: elapsedTimeS,
    temperature: { kind: 'unavailable' },
  };
  return {
    next: { triggered: true, triggeredAtT: elapsedTimeS, causeLog },
    event: { mode: 'D01', causeLog, isFirstThisSession: true },
  };
}

function advanceD03(
  prev: D03Progress,
  frame: DestructionFrameInput,
  config: Extract<BatteryDestructionConfig, { profile: 'nonLipo' }>,
  sharedShortCircuitDurationS: number,
  elapsedTimeS: number,
): { next: D03Progress; event: UnstampedDestructionEvent | null } {
  if (prev.triggered) return { next: prev, event: null };
  // DURATION_COMPARISON_EPSILON_Sは浮動小数点誤差吸収のみが目的で、新しい物理式・較正値
  // ではない(正式Fable P3-1-Q3「境界1フレーム精度」を満たす数値実装)。361フレームへの遅延は
  // 許容仕様にしない——359フレーム未発火・360フレーム発火をテストで固定する。
  const fired = sharedShortCircuitDurationS + DURATION_COMPARISON_EPSILON_S >= config.shortCircuitDurationLimitS
    && frame.batteryHeat >= BATTERY_HEAT_LIMIT;
  if (!fired) return { next: prev, event: null };
  const causeLog: D03CauseLog = {
    currentA: frame.currentA,
    rpm: frame.rpm,
    atT: elapsedTimeS,
    temperature: { kind: 'uncalibratedGauge', ratio: frame.batteryHeat },
    batteryHeatRatio: frame.batteryHeat,
    shortCircuitDurationS: sharedShortCircuitDurationS,
  };
  return {
    next: { triggered: true, triggeredAtT: elapsedTimeS, causeLog },
    event: { mode: 'D03', causeLog, isFirstThisSession: true },
  };
}

// 段階境界判定(dt分割不変性、固定物理dt=1/120sのバッチング比較。正式Fable P3-2 M-1是正、
// 計画v9 §2.3)。境界時刻ちょうど(stageEnteredAtT + limit)を次段階の起点とすることで、
// dtの余剰時間を切り捨てずに次の段階へ正しく繰り越す。1step内で複数境界
// (swelling→smoking→burning)を連続通過しうる場合(stageDurationsがdtより短い極端な
// 較正値の場合)に対応するため、whileループで最大2回まで進行させる。
function advanceD04StageBoundary(
  prev: D04Progress,
  config: Extract<BatteryDestructionConfig, { profile: 'lipo' }>,
  elapsedTimeS: number,
): D04Progress {
  let stage = prev.stage;
  let stageEnteredAtT = prev.stageEnteredAtT ?? elapsedTimeS;
  while (stage !== 'burning' && stage !== 'none') {
    const elapsedInStage = elapsedTimeS - stageEnteredAtT;
    const limit = stage === 'swelling' ? config.stageDurations.swellingS : config.stageDurations.smokingS;
    if (elapsedInStage + DURATION_COMPARISON_EPSILON_S < limit) break; // まだ境界未到達
    stageEnteredAtT = stageEnteredAtT + limit;
    stage = stage === 'swelling' ? 'smoking' : 'burning';
  }
  return { ...prev, stage, stageEnteredAtT };
}

// D04本体(計画v9 §2.2、正式Fable P3-2-Q4裁定5項目すべて確定)。dtは本関数のいかなる分岐でも
// 使わない(段階境界判定はelapsedTimeSの絶対値比較のみで行う)ため、D01/D03の既存
// advanceD01/advanceD03と同じくdtを受け取らない。
function advanceD04(
  prev: D04Progress,
  frame: DestructionFrameInput,
  config: Extract<BatteryDestructionConfig, { profile: 'lipo' }>,
  d04Config: DestructionConfig['d04'],
  sharedShortCircuitDurationS: number,
  elapsedTimeS: number,
  runContext: DestructionRunContext,
): { next: D04Progress; event: UnstampedDestructionEvent | null } {
  if (prev.triggered) return { next: prev, event: null };

  // (Q4-1) motor-onlyでは過放電経路を評価できない。frame.energyUsedRatioはvehicle文脈
  // (走行距離・エネルギー予算の概念を持つ)でのみ供給される値であり、motor-onlyの
  // DestructionFrameInputでは常にundefinedになる(buildMotorOnlyFrameInputの実装)。
  // motor-onlyで評価可能なのは短絡経路のみである、と一意に扱う。
  const overDischargeActiveNow = frame.energyUsedRatio !== undefined && frame.energyUsedRatio >= config.unsafeDischargeStartRatio;

  if (prev.stage === 'none') {
    const shortCircuitFired =
      sharedShortCircuitDurationS + DURATION_COMPARISON_EPSILON_S >= config.shortCircuitDurationLimitS
      && frame.batteryHeat >= config.runawayHeatThreshold;
    if (!shortCircuitFired && !overDischargeActiveNow) return { next: prev, event: null };
    return {
      next: {
        ...prev, stage: 'swelling', stageEnteredAtT: elapsedTimeS, overDischargeActive: overDischargeActiveNow,
        // (Q4-3+Q4-4) 'none'→'swelling'遷移の瞬間に一度だけ原因を凍結記録する。
        initiatingCauseLog: { shortCircuitDurationS: sharedShortCircuitDurationS, overDischargeRatio: overDischargeActiveNow ? (frame.energyUsedRatio ?? null) : null },
      },
      event: null,
    };
  }

  // (Q4-2) 段階タイマーはstage突入後、駆動条件の瞬間的な成立・不成立に関わらず不可逆に
  // 進行する。物理的正当化: 膨張は発生済みガスの存在であり、駆動条件の瞬断で巻き戻らない。
  // 熱慣性下の暴走進行は瞬間条件でなく段階で表現する。
  const advanced = advanceD04StageBoundary(prev, config, elapsedTimeS);

  if (advanced.stage === 'burning' && prev.stage !== 'burning') {
    const affectedRoles: FireExposureRole[] = [];
    if (runContext.fireExposureProfile.bodyEquipped) affectedRoles.push('body');
    // adjacentRolesEquippedの重複はvalidateFireExposureProfileが構築時に拒否済み(正式
    // Fable Q4-5裁定)であるため、ここでの追加のSet化・重複排除は行わない。
    affectedRoles.push(...runContext.fireExposureProfile.adjacentRolesEquipped);

    // stage∈{swelling,smoking,burning}ならinitiatingCauseLogは非null(交差不変条件、
    // Q4-4裁定)。非nullアクセスはこの不変条件により安全である。
    const initiatingCause = prev.initiatingCauseLog!;
    const causeLog: D04CauseLog = {
      currentA: frame.currentA, rpm: frame.rpm, atT: elapsedTimeS,
      temperature: { kind: 'uncalibratedGauge', ratio: frame.batteryHeat },
      batteryHeatRatio: frame.batteryHeat,
      shortCircuitDurationS: sharedShortCircuitDurationS, // burning到達時点の瞬間値(Q4-3裁定)
      stage: 'burning',
      overDischargeRatio: overDischargeActiveNow ? (frame.energyUsedRatio ?? null) : null, // burning到達時点の瞬間値(Q4-3裁定)
      initiatingCause, // stage開始原因の凍結値(Q4-3裁定)
    };
    return {
      next: { ...advanced, triggered: true, triggeredAtT: elapsedTimeS, causeLog },
      event: {
        mode: 'D04', causeLog, isFirstThisSession: true, affectedRoles,
        // 正式Fable P3-2-Q5裁定: DestructionConfig.d04由来の単一出典値をそのまま埋め込む
        // (ここで新しい値を発明しない)。
        bodyScorchDeltaFraction: d04Config.bodyScorchDeltaFraction,
        magnetScorchDeltaFraction: d04Config.magnetScorchDeltaFraction,
      },
    };
  }
  return { next: { ...advanced, overDischargeActive: overDischargeActiveNow }, event: null };
}

// D07本体(計画v9 §2.5、正式Fable P3-2-Q2・Q3・Q11裁定確定)。熱ゲージ(thermal)は
// irreversible.kindによらず常に更新する(v12凍結契約「熱ゲージは常時更新」「不可逆到達後も
// 走行は継続する」)。止めてよいのはevent/causeLogの再発行だけである。
function advanceD07(
  prev: D07Progress,
  frame: DestructionFrameInput,
  config: DestructionConfig['d07'],
  elapsedTimeS: number,
  dt: number, // 熱蓄積式が×dtの積分項を持つため使用する
): { next: D07Progress; event: UnstampedDestructionEvent | null } {
  // thermalはirreversible.kindによらず常に計算する(候補(ii)の構造)。0-1へclampする。
  const nextRatio = Math.min(1, Math.max(0, prev.magnetHeatGaugeRatio + (frame.currentA * frame.currentA * config.thermal.conductionCoefficient - prev.magnetHeatGaugeRatio * config.thermal.dissipationCoefficient) * dt));

  if (config.irreversible.kind === 'nonDemagnetizing') {
    // 熱ゲージ自体はHUD表示のため更新するが、不可逆到達判定自体を行わない。
    return { next: { ...prev, magnetHeatGaugeRatio: nextRatio, reversibleDroopActive: false }, event: null };
  }

  const reversibleDroopActive = nextRatio >= config.irreversible.reversibleDroopThreshold;

  if (prev.irreversibleTriggered) {
    // 熱ゲージ・可逆ダレは不可逆到達後も更新を続ける。eventは再発行しない。
    return { next: { ...prev, magnetHeatGaugeRatio: nextRatio, reversibleDroopActive }, event: null };
  }

  if (nextRatio >= config.irreversible.magnetHeatGaugeLimit) {
    const causeLog: D07CauseLog = {
      currentA: frame.currentA, rpm: frame.rpm, atT: elapsedTimeS,
      temperature: { kind: 'uncalibratedGauge', ratio: nextRatio },
      magnetHeatGaugeRatio: nextRatio,
    };
    return {
      next: { magnetHeatGaugeRatio: nextRatio, reversibleDroopActive, irreversibleTriggered: true, irreversibleTriggeredAtT: elapsedTimeS, causeLog },
      // demagnetizationDeltaFractionはconfig.irreversible.demagnetizationDeltaFractionを
      // そのまま埋め込む(単一出典原則。ここで新しい値を発明しない)。
      event: { mode: 'D07', causeLog, isFirstThisSession: true, demagnetizationDeltaFraction: config.irreversible.demagnetizationDeltaFraction },
    };
  }
  return { next: { ...prev, magnetHeatGaugeRatio: nextRatio, reversibleDroopActive }, event: null };
}

export function advanceDestructionState(
  prev: DestructionState,
  frame: DestructionFrameInput,
  config: DestructionConfig,
  runContext: DestructionRunContext,
  dt: number,
): { state: DestructionState; events: readonly UnstampedDestructionEvent[] } {
  // 状態更新順(判定用、公開eventsの整列順とは独立): ①shared→②battery→③others
  const nextShared: DestructionSharedSignals = {
    elapsedTimeS: prev.shared.elapsedTimeS + dt,
    shortCircuitDurationS: frame.shorted ? prev.shared.shortCircuitDurationS + dt : 0,
  };

  let nextBattery = prev.battery;
  let batteryEvent: UnstampedDestructionEvent | null = null;
  // 正式Fable P3-1-Q6(a)裁定確定後、この二重条件は不一致ガードではなく型narrowingである。
  // 両者はcreateRunAccumulator(replaySnapshot)の時点で同一のdestructionConfig.battery.profile
  // に由来するため実行時には常に一致する(destructionOrchestration.ts側の契約、削除しないこと)。
  if (prev.battery.profile === 'nonLipo' && config.battery.profile === 'nonLipo') {
    const d03Result = advanceD03(
      prev.battery.d03, frame, config.battery, nextShared.shortCircuitDurationS, nextShared.elapsedTimeS,
    );
    nextBattery = { profile: 'nonLipo', d03: d03Result.next };
    batteryEvent = d03Result.event;
  } else if (prev.battery.profile === 'lipo' && config.battery.profile === 'lipo') {
    const d04Result = advanceD04(
      prev.battery.d04, frame, config.battery, config.d04, nextShared.shortCircuitDurationS, nextShared.elapsedTimeS, runContext,
    );
    nextBattery = { profile: 'lipo', d04: d04Result.next };
    batteryEvent = d04Result.event;
  }

  const d01Result = advanceD01(prev.modes.D01, frame, nextShared.elapsedTimeS);
  const d07Result = advanceD07(prev.modes.D07, frame, config.d07, nextShared.elapsedTimeS, dt);

  // 公開eventsは判定順ではなく、v12 2.1節が定める固定順序(D01→D02→[D03またはD04]→
  // D05→D06→D07→D09)に厳密に従って組み立てる。P3-2時点で実際に発火しうるのは
  // D01→[D03またはD04]→D07の部分列。
  const events: UnstampedDestructionEvent[] = [];
  if (d01Result.event) events.push(d01Result.event);
  if (batteryEvent) events.push(batteryEvent);
  if (d07Result.event) events.push(d07Result.event);

  return {
    state: {
      shared: nextShared,
      battery: nextBattery,
      modes: { ...prev.modes, D01: d01Result.next, D07: d07Result.next },
    },
    events,
  };
}
