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
  for (const role of raw.adjacentRolesEquipped) {
    if (!validRoles.includes(role as string)) {
      return { ok: false, reason: `adjacentRolesEquippedに不正な値が含まれています: ${String(role)}` };
    }
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
    };

export type GearBreakageProfile = { kind: 'breakable'; gearStrengthThresholdNm: number } | { kind: 'nonBreakable' };

export interface DestructionConfig {
  battery: BatteryDestructionConfig;
  d02: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
  d05: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06: { breakage: GearBreakageProfile };
  d07: { magnetHeatGaugeLimit: number; reversibleDroopThreshold: number };
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
        ? { profile: 'lipo', d04: { triggered: false, triggeredAtT: null, stage: 'none', stageEnteredAtT: null, overDischargeActive: false, causeLog: null } }
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
  shortCircuitDurationS: number;
  stage: D04Progress['stage'];
  overDischargeRatio: number | null;
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
  | { mode: 'D04'; causeLog: D04CauseLog; isFirstThisSession: true; affectedRoles: readonly FireExposureRole[] }
  | { mode: 'D05'; causeLog: D05CauseLog; isFirstThisSession: boolean }
  | { mode: 'D06'; causeLog: D06CauseLog; isFirstThisSession: boolean; isTotalLoss: boolean }
  | { mode: 'D07'; causeLog: D07CauseLog; isFirstThisSession: true }
  | { mode: 'D09'; causeLog: D09CauseLog; isFirstThisSession: true };

// ---------------------------------------------------------------------------
// advanceDestructionState本体(P3-1、docs/phase3-p3-1-plan.md v7 §2.1)。
// P3-0-Q6不変条件(正式Fable裁定): D01・D03(differ換算実装済みのモード)のイベントしか発行しない。
// D02/D05/D06/D07/D09の判定関数はP3-1に存在しない(後続ステップで追加する)。
// ---------------------------------------------------------------------------

// 物理較正値ではなく、固定dt累積の浮動小数点誤差だけを吸収する数値許容差(サブステップ1の
// materialMapping.test.tsでの実測発見、Suu裁定でP3-1本体へ反映。dt=1/120sを360回加算した
// 実測値は2.999999999999992であり厳密な3.0にはならない。この誤差を吸収しないと、本来
// 到達すべきフレームで判定が1フレーム遅れる。正式Fable補足裁定(2026-08-03T16:13)で異議なく
// 承認済み: 蓄積誤差は約8e-15、epsilon=1e-9は吸収に十分かつdt=1/120秒より6桁小さく、境界を
// 誤った方向へ1フレームずらすことは構造的に不可能)。
// 単一出典: 後続ステップ(P3-2のD04 stageDurations、P3-3のD05 brushSparkDurationLimitS)が
// 同種のduration比較を導入する際、別のepsilonを発明せずこの定数の共通化・再利用を検討すること。
const DURATION_COMPARISON_EPSILON_S = 1e-9;

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

export function advanceDestructionState(
  prev: DestructionState,
  frame: DestructionFrameInput,
  config: DestructionConfig,
  runContext: DestructionRunContext,
  dt: number,
): { state: DestructionState; events: readonly UnstampedDestructionEvent[] } {
  // tsconfig.app.json noUnusedParameters:true対策。P3-1のD01/D03分岐はrunContextの
  // いかなるフィールド(fireExposureProfile・gearTotalToothCount)も参照しないが、
  // v12が定める将来共通シグネチャ(D04/D06実装時にrunContextを使う)を維持するため、
  // 引数自体は削除しない。
  void runContext;

  // 状態更新順(判定用、公開eventsの整列順とは独立): ①shared→②battery→③others
  const nextShared: DestructionSharedSignals = {
    elapsedTimeS: prev.shared.elapsedTimeS + dt,
    shortCircuitDurationS: frame.shorted ? prev.shared.shortCircuitDurationS + dt : 0,
  };

  let nextBattery = prev.battery;
  let d03Event: UnstampedDestructionEvent | null = null;
  // 正式Fable P3-1-Q6(a)裁定確定後、この二重条件は不一致ガードではなく型narrowingである。
  // 両者はcreateRunAccumulator(replaySnapshot)の時点で同一のdestructionConfig.battery.profile
  // に由来するため実行時には常に一致する(destructionOrchestration.ts側の契約、削除しないこと)。
  if (prev.battery.profile === 'nonLipo' && config.battery.profile === 'nonLipo') {
    const d03Result = advanceD03(
      prev.battery.d03, frame, config.battery, nextShared.shortCircuitDurationS, nextShared.elapsedTimeS,
    );
    nextBattery = { profile: 'nonLipo', d03: d03Result.next };
    d03Event = d03Result.event;
  }
  // lipo分岐(D04)はP3-1に存在しない。prev.battery.profile==='lipo'の場合は素通しする。

  const d01Result = advanceD01(prev.modes.D01, frame, nextShared.elapsedTimeS);

  // 公開eventsは判定順ではなく、v12 2.1節が定める固定順序(D01→D02→[D03またはD04]→
  // D05→D06→D07→D09)に厳密に従って組み立てる。
  const events: UnstampedDestructionEvent[] = [];
  if (d01Result.event) events.push(d01Result.event);
  if (d03Event) events.push(d03Event);

  return {
    state: {
      shared: nextShared,
      battery: nextBattery,
      modes: { ...prev.modes, D01: d01Result.next },
    },
    events,
  };
}
