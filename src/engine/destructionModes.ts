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
  // 正式Fable P3-3-Q4・Q5裁定(確定、2026-08-09): D01漸減(spec §7.1.1「実効巻数・占積が
  // 漸減」、P3-1-Q1返済)の較正値。decayExposureScaleRadは進行量(rad単位の累積曝露)から
  // effectiveTurnsRatioへの写像スケール定数、minEffectiveTurnsRatioは劣化の下限
  // (0を除く——0だと磁気結合が消滅する退化値になるため)。人間再承認バンドル対象。
  // P4-1C R2-A(2026-08-31人間再承認): D01のコイル崩壊しきい角速度をここへ**単一出典化**する。
  // 発火判定(motorPhysics.nextDeformState)と発火後の超過回転曝露(advanceD01)は
  // **必ず同じこのfield**を読む。二つの閾値へ分裂させない(P41-R5条件3)。
  // 既定値は`constants.ts`の`COIL_DEFORM_OMEGA`と厳密同値で、移設段階の挙動変更は0。
  d01: { decayExposureScaleRad: number; minEffectiveTurnsRatio: number; coilDeformOmegaRadS: number };
  // 正式Fable P3-3-Q1・Q2裁定(確定): conductionScale/dissipationCoefficientはcoilLossW
  // (I²R)から0-1熱ゲージへの伝導・放散係数。smokeResistanceMultiplierは発煙後の
  // wireResistivityRatio悪化倍率(単一固定値、段階内比例則は較正根拠のない発明として不採用)。
  // 人間再承認バンドル対象。
  d02: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number; conductionScale: number; dissipationCoefficient: number; smokeResistanceMultiplier: number };
  // 正式Fable P3-2-Q5裁定(確定): D04延焼時にbody/magnetへ加算するdeltaFraction。単一出典として
  // advanceD04が発火時点でUnstampedDestructionEventへ埋め込む。人間再承認バンドル対象。
  d04: { bodyScorchDeltaFraction: number; magnetScorchDeltaFraction: number };
  // 正式Fable P3-3-Q3・Q6・Q7裁定(確定): brushWearRateRatio/highCurrentPenaltyは素材ごとの
  // 摩耗率写像先(DestructionConfig.d05層、6.2節)。wearPerAmpSecondはA·s→wearFraction
  // 変換係数(素材非依存の単一較正値、4.4節)。recoveryFrames/recoveryContactResistanceMultiplier
  // はQ7確定(候補a回復区間モデル)の較正値——チャタリングバースト終了直後、アーク放電後の
  // 接触面荒れによる一時的な接触抵抗悪化を表す(7.2節、スパーク中〈瞬断〉自体の悪化は既存の
  // 完全瞬断が包含済み)。人間再承認バンドル対象。
  //
  // 正式Fable P3-3-Q15-4裁定(確定、2026-08-10、人間再承認対象): highCurrentPenaltyThresholdA/
  // highCurrentPenaltyMultiplierの2フィールドをフラットに持つ設計は、「ペナルティが存在しない」
  // 状態(素材の大半)を表すために意味のない番兵値(閾値999A等)を発明する必要があり、D07の
  // irreversible判別unionと同じ「不正状態を構築不能にする」原則に違反していた。判別unionへ
  // 変更し、`{ kind: 'noPenalty' }`はペナルティ関連フィールドを一切持たず、
  // `{ kind: 'thresholdPenalty' }`のみが閾値・倍率を持つ。thresholdPenalty枝の
  // highCurrentPenaltyMultiplierは`> 1`厳密(`>= 1`ではない)——multiplier===1の
  // thresholdPenaltyはnoPenaltyの重複表現になるため、同一状態の二重表現を型・validator両方で
  // 排除する。
  d05: {
    brushSparkDurationLimitS: number;
    brushSparkCurrentThresholdA: number;
    brushWearRateRatio: number;
    highCurrentPenalty: { kind: 'noPenalty' } | { kind: 'thresholdPenalty'; highCurrentPenaltyThresholdA: number; highCurrentPenaltyMultiplier: number };
    wearPerAmpSecond: number;
    recoveryFrames: number;
    recoveryContactResistanceMultiplier: number;
  };
  // P3-4 G3(計画§9.1 R6確定裁定): toothFatigueExposureNmSは歯1本を失うのに必要な累積曝露
  // (N·m·s)。この単一の較正閾値で崩壊速度を直接制御する(候補b採用の理由そのもの)。
  d06: { breakage: GearBreakageProfile; toothFatigueExposureNmS: number };
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
  // P3-4 G4(計画§7.2、E7是正でdeltaFraction2件を追加)。
  d09: {
    thermal: { conductionCoefficient: number; dissipationCoefficient: number };
    bearingSeizureGaugeLimit: number;
    // gear素材由来のconfig profile値。**engineは素材IDを一切読まない**(leaf規則)——
    // advanceD09はこのbooleanをconfig経由で受け取るのみで、gearIdそのものを見ない。
    metalGearContactAlways: boolean;
    highLoadHighSpeed: { loadTorqueThresholdNm: number; rpmThreshold: number };
    // D07のdemagnetizationDeltaFractionと同型のパターン(E7是正): config→event→
    // deriveDegradationDiffsという一方向契約の起点。deriveDegradationDiffsはevent側のみ読む。
    gearSeizureDeltaFraction: number;
    bearingSeizureDeltaFraction: number;
  };
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
  // 正式Fable P3-3-Q4裁定(確定、P3-1-Q1返済): 崩壊後の回転曝露累積(rad単位、
  // `max(0, |angularVelocityRadS| − d01.coilDeformOmegaRadS) × dt`の積分)。`triggered===false`の
  // 間は0固定(崩壊前は漸減しない)。単調非減少。
  decayExposureRad: number;
}

export interface D02Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  coilHeatGaugeRatio: number;
  causeLog: D02CauseLog | null;
  // 正式Fable P3-3-Q8裁定(確定、候補b不可逆latch): 一度`coilHeatGaugeRatio`が
  // `smokeGaugeThreshold`に到達したら、そのセッション中不可逆にtrueのまま
  // (D04の`stage`が後退しない設計と同じ規律、3.5節)。
  smokingStarted: boolean;
  smokingStartedAtT: number | null;
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
  // 正式Fable P3-3-Q3裁定(確定、候補a): 無次元の恒久摩耗差分蓄積値。`advanceD05`が
  // 素材由来係数(`brushWearRateRatio`・`wearPerAmpSecond`等)まで畳み込み済みの値を
  // 毎frame積算する。`cumulativeSparkExposure`(A·s、診断用の単一出典)とは別出典であり、
  // 一方から他方を事後導出しない(4.4節)。
  cumulativeWearDeltaFraction: number;
  // 正式Fable P3-3-Q7裁定(確定、候補a回復区間モデル): チャタリングバースト終了直後の
  // 接触抵抗悪化が残る残余フレーム数(0で非アクティブ、7.2節)。
  recoveryFramesLeft: number;
}

export interface D06Progress {
  toothLossCount: number;
  firstLossAtT: number | null;
  causeLog: D06CauseLog | null;
  // P3-4 G3(計画§9.1 R6確定裁定、候補b「累積曝露」)。過負荷トルクの超過分を時間積分した
  // 曝露量(N·m·s)。D05のcumulativeSparkExposureと同型。config.d06.toothFatigueExposureNmSを
  // 超えるたびに歯を1本失い、この値を0へリセットする。
  cumulativeOverloadExposure: number;
  // P3-4 G3(計画§9.4 R7確定裁定)。トルクリップル変調の位相源。車軸1回転で歯数ぶんの
  // 噛み合わせが起きるという幾何関係から、|axleAngularVelocityRadS|*歯数*dt/(2π)を積算する。
  // **トリガ判定(候補b)とは完全に独立**であり、D06の発火可否・崩壊速度には一切影響しない
  // (純粋にリップル変調の位相源としてのみ機能する)。rngを使わないため決定論的。
  meshPhaseAccumulator: number;
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
      D01: { triggered: false, triggeredAtT: null, causeLog: null, decayExposureRad: 0 },
      D02: { triggered: false, triggeredAtT: null, coilHeatGaugeRatio: 0, causeLog: null, smokingStarted: false, smokingStartedAtT: null },
      D05: { sparkDurationS: 0, episodeTriggered: false, episodeCount: 0, cumulativeSparkExposure: 0, firstEpisodeAtT: null, causeLog: null, cumulativeWearDeltaFraction: 0, recoveryFramesLeft: 0 },
      D06: { toothLossCount: 0, firstLossAtT: null, causeLog: null, cumulativeOverloadExposure: 0, meshPhaseAccumulator: 0 },
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
  // 正式Fable P3-3-Q1裁定(確定): `computeRCoil(effectiveConfig)`と実電流から算出した
  // コイル損失電力(W、I²R)。D02熱ゲージの駆動入力(3.1節)。
  coilLossW: number;
  // 正式Fable P3-3-Q4裁定に伴うP1是正(確定): `prev.chatterFramesLeft > 0 || next.chatterFramesLeft > 0`
  // で導出する、バースト最終stepの取りこぼしを解消した正しいチャタリング判定(4.2節)。
  // 既存`chatterFramesLeft`(残りフレーム数)自体の意味は変えない。
  isChatteringThisFrame: boolean;
  // 正式Fable P3-3-Q4裁定(確定): 平滑化前の生角速度(rad/s、`next.omega`)。表示用移動平均の
  // `rpm`とは単位・時定数が異なるため、D01進行量の駆動には本フィールドを使う(5.2節)。
  angularVelocityRadS: number;
  // P3-4 G4(計画§7.3、候補b「wrapperでの事前計算」)。ギヤ噛合の散逸パワー(W)。
  // motor-onlyではundefined。wrapper側で `|loadTorqueNm × ω| × (1 - carConfig.gearEfficiency)` として
  // 事前計算する——R8確定裁定により、これは既存反射式(vehiclePhysics.tsのtResistReflected)の下での
  // ギヤ噛合散逸パワーそのものであることが代数的に証明されている(P_out = eta×P_in が恒等的に
  // 成立するため P_loss = P_in − P_out = |loadTorqueNm×ω|×(1−eta))。二重計上ではない。
  // leafはCarConfigの構造を知らずにこの数値だけを受け取る。D09のゲージ入力(§7.5)が消費する。
  gearFrictionLossW?: number;
  // P3-4 G3(計画§7.3、候補b「wrapperでの事前計算」)。車軸(ギヤ・軸受)の角速度(rad/s)。
  // motor-onlyではundefined(loadTorqueNm/energyUsedRatioと同じ規約)。**値の計算は
  // destructionModes.ts内では行わない**——CarConfigの構造を知るのはframe builder
  // (destructionOrchestration.tsのbuildVehicleFrameInput)側の責務であり、leaf規則
  // 「他engineモジュールへの逆依存を持たない」を維持する。D06のリップル位相(§9.4)が消費する。
  axleAngularVelocityRadS?: number;
}

export type TemperatureReading = { kind: 'measured'; temperatureC: number } | { kind: 'uncalibratedGauge'; ratio: number } | { kind: 'unavailable' };

export interface CauseLogCommon {
  currentA: number;
  rpm: number;
  atT: number;
  temperature: TemperatureReading;
}

export interface D01CauseLog extends CauseLogCommon {}
// 正式Fable付帯条件(P3-3、2026-08-09確定): temperatureは{kind:'uncalibratedGauge',
// ratio: coilHeatGaugeRatio}(専用の較正済み温度計を持たないコイル熱ゲージの生値、
// P3-1のD01/D03と同じ規律——捏造しない)。
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
// 正式Fable付帯条件(P3-3、2026-08-09確定): temperatureは{kind:'unavailable'}固定
// (ブラシ温度ゲージは存在しないため捏造しない、P3-1のD01/D03と同じ規律)。
// 正式Fable P3-3-Q9裁定(確定、候補b): 既存`CauseLogCommon.currentA`はチャタリング中の
// 実電流(常に0)という事実を正直に保持したまま、理論遮断電流を`theoreticalCurrentA`で
// 別記する(「二つの真実を両方記録し、フィールドの意味をモード別に読み替えない」)。
// 人間再承認バンドル対象。
export interface D05CauseLog extends CauseLogCommon {
  sparkDurationS: number;
  theoreticalCurrentA: number;
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
  // P3-4 G4(R4確定、候補A): 終端瞬間の**生の入力値**をそのまま記録する。`originKind`のような
  // 解釈済みラベルは追加しない——終端瞬間の値だけでは進行全体の寄与(途中で原因が入れ替わった
  // 場合等)を復元できず、「主に〜が原因」という断定は嘘になりうるため。UIは事実の提示
  // (「終端の瞬間、金属接触状態: あり/なし」)としてのみ表示してよい(spec §1.2)。
  metalGearContactActive: boolean;
  highLoadHighSpeedActive: boolean;
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
  | {
      mode: 'D09';
      causeLog: D09CauseLog;
      isFirstThisSession: true;
      // P3-4 G4(E7是正): configから複写する単一出典値。deriveDegradationDiffsはevent側のみ読む
      // (D07のdemagnetizationDeltaFractionと同一パターン)。ここで新しい値を発明しない。
      gearSeizureDeltaFraction: number;
      bearingSeizureDeltaFraction: number;
    };

// ---------------------------------------------------------------------------
// advanceDestructionState本体(P3-1、docs/phase3-p3-1-plan.md v7 §2.1。P3-2ゲート3で
// D04/D07を追加、docs/phase3-p3-2-plan.md v9 §2.2・§2.5。P3-3ゲート3でD02/D05を追加、
// docs/phase3-p3-3-plan.md v10 §3・§4・§8)。
// P3-0-Q6不変条件(正式Fable裁定): 差分換算(deriveDegradationDiffs)実装済みのモードの
// イベントしか発行しない。P3-3ゲート3時点でホワイトリストはD01・D02・D03・D04・D05・D07
// (いずれもdestructionOrchestration.tsのderiveDegradationDiffsが同一ゲートで対応済み)。
// D06/D09の判定関数はまだ存在しない(P3-4以降で追加する)。
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

// 正式Fable P3-3-Q4裁定(確定、候補b): 崩壊は不可逆・一度きり(spec §7.1.1)だが、崩壊後は
// 「実効巻数・占積が漸減、走行継続」という返済対象(P3-1-Q1)が進行する。進行量は崩壊トリガと
// 同じ閾値(d01.coilDeformOmegaRadS)を超えた回転曝露の時間積分——原因と進行が同じ物理機構である
// ことの正直な表現(Fable評)。
function advanceD01(
  prev: D01Progress,
  frame: DestructionFrameInput,
  elapsedTimeS: number,
  dt: number,
  d01Config: DestructionConfig['d01'],
): { next: D01Progress; event: UnstampedDestructionEvent | null } {
  if (prev.triggered) {
    const excessOmega = Math.max(0, Math.abs(frame.angularVelocityRadS) - d01Config.coilDeformOmegaRadS);
    if (excessOmega === 0) return { next: prev, event: null }; // 停止時ゼロ(必須DoD)
    return { next: { ...prev, decayExposureRad: prev.decayExposureRad + excessOmega * dt }, event: null };
  }
  if (!frame.coilCollapsedRisingEdge) return { next: prev, event: null };
  const causeLog: D01CauseLog = {
    currentA: frame.currentA,
    rpm: frame.rpm,
    atT: elapsedTimeS,
    temperature: { kind: 'unavailable' },
  };
  return {
    next: { triggered: true, triggeredAtT: elapsedTimeS, causeLog, decayExposureRad: 0 },
    event: { mode: 'D01', causeLog, isFirstThisSession: true },
  };
}

// D02本体(計画v10 §3、正式Fable P3-3-Q1・Q2・Q8裁定確定)。frame.coilLossWは
// buildXxxFrameInput側でcomputeRCoil(effectiveConfig)×実電流²として毎step独立に
// 再計算済み(3.1節)。R_coil自体の合成(発煙後の悪化倍率)はcomposeEffectiveMotorConfig
// (Gate4)の責務であり、本関数は熱ゲージの状態機械のみを担う。
function advanceD02(
  prev: D02Progress,
  frame: DestructionFrameInput,
  config: DestructionConfig['d02'],
  elapsedTimeS: number,
  dt: number,
): { next: D02Progress; event: UnstampedDestructionEvent | null } {
  if (prev.triggered) return { next: prev, event: null };

  const nextCoilHeatGaugeRatio = Math.min(
    1,
    Math.max(0, prev.coilHeatGaugeRatio + (frame.coilLossW * config.conductionScale - prev.coilHeatGaugeRatio * config.dissipationCoefficient) * dt),
  );

  // 正式Fable P3-3-Q8裁定(確定、候補b不可逆latch): 一度でもsmokeGaugeThresholdへ到達したら
  // そのセッション中不可逆にtrueのまま(3.5節)。
  let smokingStarted = prev.smokingStarted;
  let smokingStartedAtT = prev.smokingStartedAtT;
  if (!smokingStarted && nextCoilHeatGaugeRatio >= config.smokeGaugeThreshold) {
    smokingStarted = true;
    smokingStartedAtT = elapsedTimeS;
  }

  if (nextCoilHeatGaugeRatio >= config.coilOverheatGaugeLimit) {
    // 値域制約smokeGaugeThreshold < coilOverheatGaugeLimit(11.2節)により、発火に到達する
    // フレームでは必ずsmokingStarted===trueが成立済み(D02Progress交差不変条件と整合)。
    const causeLog: D02CauseLog = {
      currentA: frame.currentA,
      rpm: frame.rpm,
      atT: elapsedTimeS,
      temperature: { kind: 'uncalibratedGauge', ratio: nextCoilHeatGaugeRatio },
      coilHeatGaugeRatio: nextCoilHeatGaugeRatio,
    };
    return {
      next: {
        triggered: true,
        triggeredAtT: elapsedTimeS,
        coilHeatGaugeRatio: nextCoilHeatGaugeRatio,
        causeLog,
        smokingStarted: true,
        smokingStartedAtT: smokingStartedAtT ?? elapsedTimeS,
      },
      event: { mode: 'D02', causeLog, isFirstThisSession: true },
    };
  }

  return { next: { ...prev, coilHeatGaugeRatio: nextCoilHeatGaugeRatio, smokingStarted, smokingStartedAtT }, event: null };
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

// D05本体(計画v10 §4・§7、正式Fable P3-3-Q3・Q7・Q9・Q15-4裁定確定)。D05は常に非終端
// (classifyTerminalModesに分岐を持たない、10節C5)であり、`triggered`フィールド自体を
// D05Progressに持たない——1セッション中に反復発火しうるepisode駆動モードである。
function advanceD05(
  prev: D05Progress,
  frame: DestructionFrameInput,
  config: DestructionConfig['d05'],
  elapsedTimeS: number,
  dt: number,
): { next: D05Progress; event: UnstampedDestructionEvent | null } {
  const excessCurrentA = Math.max(0, frame.theoreticalCurrentA - config.brushSparkCurrentThresholdA);
  const isSparkActive = frame.isChatteringThisFrame && excessCurrentA > 0;

  let sparkDurationS: number;
  let episodeTriggered: boolean;
  let cumulativeSparkExposure = prev.cumulativeSparkExposure;
  let cumulativeWearDeltaFraction = prev.cumulativeWearDeltaFraction;

  if (isSparkActive) {
    sparkDurationS = prev.sparkDurationS + dt;
    cumulativeSparkExposure = prev.cumulativeSparkExposure + excessCurrentA * dt; // アクティブ中は無条件で加算(episode成立可否と独立、4.1節)
    episodeTriggered = prev.episodeTriggered;

    // 正式Fable P3-3-Q15-4裁定(確定): highCurrentPenaltyは判別union。thresholdPenalty枝
    // のみ、理論電流が閾値を超えた場合に倍率を適用する(4.4節)。
    const penalty = config.highCurrentPenalty;
    const penaltyMultiplier =
      penalty.kind === 'thresholdPenalty' && frame.theoreticalCurrentA > penalty.highCurrentPenaltyThresholdA
        ? penalty.highCurrentPenaltyMultiplier
        : 1;
    const wearDelta = excessCurrentA * dt * config.brushWearRateRatio * penaltyMultiplier * config.wearPerAmpSecond; // 無次元(4.4節)
    cumulativeWearDeltaFraction = prev.cumulativeWearDeltaFraction + wearDelta;
  } else {
    sparkDurationS = 0; // 再武装(4.1節)
    episodeTriggered = false; // 再武装(次のアクティブ区間で新規episodeとして検出可能にする)
  }

  const justCrossed = isSparkActive && !episodeTriggered && sparkDurationS + DURATION_COMPARISON_EPSILON_S >= config.brushSparkDurationLimitS;
  if (justCrossed) {
    episodeTriggered = true;
  }

  // 正式Fable P3-3-Q7裁定(確定、候補a回復区間モデル、7.2節): バースト終了検出は
  // 「このstepはチャタリングだった(isChatteringThisFrame)かつ次stepへ持ち越すバースト残り
  // フレームが0(chatterFramesLeft===0)」の組合せのみで判定する(新規フィールドは追加しない)。
  // 回復区間中に新しいバーストが始まった(=このstepもチャタリング継続中)場合は、新規バーストを
  // 優先して0へリセットする——バーストが終了した場合のみrecoveryFramesへ再設定する。
  let recoveryFramesLeft: number;
  if (frame.isChatteringThisFrame && frame.chatterFramesLeft === 0) {
    recoveryFramesLeft = config.recoveryFrames;
  } else if (frame.isChatteringThisFrame) {
    recoveryFramesLeft = 0;
  } else if (prev.recoveryFramesLeft > 0) {
    recoveryFramesLeft = prev.recoveryFramesLeft - 1;
  } else {
    recoveryFramesLeft = 0;
  }

  if (!justCrossed) {
    return {
      next: {
        sparkDurationS,
        episodeTriggered,
        episodeCount: prev.episodeCount,
        cumulativeSparkExposure,
        firstEpisodeAtT: prev.firstEpisodeAtT,
        causeLog: prev.causeLog,
        cumulativeWearDeltaFraction,
        recoveryFramesLeft,
      },
      event: null,
    };
  }

  // 正式Fable P3-3-Q9裁定(確定、候補b): currentA(実電流、チャタリング中は常に0)と
  // theoreticalCurrentA(理論遮断電流)を両方正直に記録する(「二つの真実」)。temperatureは
  // {kind:'unavailable'}固定(ブラシ専用の較正済み温度計が存在しないため捏造しない)。
  const eventCauseLog: D05CauseLog = {
    currentA: frame.currentA,
    rpm: frame.rpm,
    atT: elapsedTimeS,
    temperature: { kind: 'unavailable' },
    sparkDurationS,
    theoreticalCurrentA: frame.theoreticalCurrentA,
  };
  const isFirstThisSession = prev.episodeCount === 0;

  return {
    next: {
      sparkDurationS,
      episodeTriggered,
      episodeCount: prev.episodeCount + 1,
      cumulativeSparkExposure,
      firstEpisodeAtT: prev.firstEpisodeAtT ?? elapsedTimeS,
      causeLog: prev.causeLog ?? eventCauseLog, // Progress.causeLogは最初のepisodeのみ固定(4.3節)
      cumulativeWearDeltaFraction,
      recoveryFramesLeft,
    },
    event: { mode: 'D05', causeLog: eventCauseLog, isFirstThisSession }, // event自身のcauseLogは都度このepisode固有の瞬間値
  };
}

// D07本体(計画v9 §2.5、正式Fable P3-2-Q2・Q3・Q11裁定確定)。熱ゲージ(thermal)は
// irreversible.kindによらず常に更新する(v12凍結契約「熱ゲージは常時更新」「不可逆到達後も
// 走行は継続する」)。止めてよいのはevent/causeLogの再発行だけである。
/** 金属接触時の摩擦損失増倍(無次元、§17.3数値候補)。確定はG5較正sweep+人間commit承認。 */
const METAL_CONTACT_MULTIPLIER = 1.5;

/**
 * D09のゲージ入力パワー(W)を計算する(計画§7.5、R8確定裁定により物理的妥当性を代数的に証明済み)。
 *
 * **CarConfigの構造を一切知らない**——frame経由で事前計算済みスカラーのみを使う(leaf規則)。
 * motor-onlyでは`gearFrictionLossW`・`loadTorqueNm`・`axleAngularVelocityRadS`がいずれもundefinedの
 * ため入力0となり、D09は構造的に発火しない(ギヤ・軸受が存在しない文脈であるため正しい)。
 *
 * 2経路の和(spec §7.1「無潤滑相当=金属ギヤ接触**または**高負荷軸受×高速継続の簡約判定」):
 * - 金属接触経路: ギヤ噛合散逸を`METAL_CONTACT_MULTIPLIER`倍して常時計上(金属ギヤ装備時のみ)
 * - 高負荷高速経路: 車軸が高速回転している間、閾値超過分の力学的パワー(固定値ではない実量)
 *
 * `Math.abs`・`Math.max(0,...)`により前進/後退いずれの符号でも非負。
 */
function computeD09GaugeInputW(frame: DestructionFrameInput, config: DestructionConfig['d09']): number {
  const frictionLossW = frame.gearFrictionLossW ?? 0;
  const metalContactInputW = config.metalGearContactAlways ? frictionLossW * METAL_CONTACT_MULTIPLIER : 0;
  const loadTorqueNm = frame.loadTorqueNm ?? 0;
  const excessTorqueNm = Math.max(0, Math.abs(loadTorqueNm) - config.highLoadHighSpeed.loadTorqueThresholdNm);
  const axleOmega = frame.axleAngularVelocityRadS ?? 0;
  const isHighSpeed = Math.abs(axleOmega) > (config.highLoadHighSpeed.rpmThreshold * 2 * Math.PI) / 60; // rpm→rad/s
  const highLoadInputW = isHighSpeed ? excessTorqueNm * Math.abs(axleOmega) : 0;
  return metalContactInputW + highLoadInputW;
}

/**
 * D09の熱ゲージ更新(計画§7.6)。D07の`advanceD07`と同型のconduction/dissipation積分で、0-1へclampする。
 * 閾値到達判定は瞬時の数値比較で足りるため、D05のような時間比較epsilonは不要(D02/D07と同型)。
 */
function computeNextBearingHeatGaugeRatio(
  prevRatio: number,
  gaugeInputW: number,
  config: DestructionConfig['d09'],
  dt: number,
): number {
  const next = prevRatio + (gaugeInputW * config.thermal.conductionCoefficient - prevRatio * config.thermal.dissipationCoefficient) * dt;
  return Math.min(1, Math.max(0, next));
}

// D09本体(P3-4 G4、計画§7)。spec §7.1「軸受焼付き/高速×無潤滑(金属ギヤかじり含む)/急減速+異音」、
// §7.1.1「進行(摩擦増)→終端(焼付き)」。bearingはギヤと同じ車軸側にある軸受として確定(§7.4、R15)。
function advanceD09(
  prev: D09Progress,
  frame: DestructionFrameInput,
  config: DestructionConfig['d09'],
  elapsedTimeS: number,
  dt: number,
): { next: D09Progress; event: UnstampedDestructionEvent | null } {
  const gaugeInputW = computeD09GaugeInputW(frame, config);
  const bearingHeatGaugeRatio = computeNextBearingHeatGaugeRatio(prev.bearingHeatGaugeRatio, gaugeInputW, config, dt);

  // 発火済みならゲージのみ更新し、eventは再発行しない(D07の不可逆到達後と同型)。
  if (prev.triggered) {
    return { next: { ...prev, bearingHeatGaugeRatio }, event: null };
  }

  if (bearingHeatGaugeRatio >= config.bearingSeizureGaugeLimit) {
    // R4確定(候補A): 終端瞬間の生の入力値のみを記録する(解釈済みラベルは持たない)。
    const loadTorqueNm = frame.loadTorqueNm ?? 0;
    const axleOmega = frame.axleAngularVelocityRadS ?? 0;
    const isHighSpeed = Math.abs(axleOmega) > (config.highLoadHighSpeed.rpmThreshold * 2 * Math.PI) / 60;
    const causeLog: D09CauseLog = {
      currentA: frame.currentA,
      rpm: frame.rpm,
      atT: elapsedTimeS,
      // 軸受専用の温度計は持たない(D02/D07と同じ規律——捏造しない。ゲージの生値を出す)。
      temperature: { kind: 'uncalibratedGauge', ratio: bearingHeatGaugeRatio },
      bearingHeatGaugeRatio,
      metalGearContactActive: config.metalGearContactAlways,
      highLoadHighSpeedActive: isHighSpeed && Math.abs(loadTorqueNm) > config.highLoadHighSpeed.loadTorqueThresholdNm,
    };
    return {
      next: { triggered: true, triggeredAtT: elapsedTimeS, bearingHeatGaugeRatio, causeLog },
      event: {
        mode: 'D09',
        causeLog,
        isFirstThisSession: true,
        // configの単一出典値をそのまま複写する(E7是正、D07と同一パターン。ここで発明しない)。
        gearSeizureDeltaFraction: config.gearSeizureDeltaFraction,
        bearingSeizureDeltaFraction: config.bearingSeizureDeltaFraction,
      },
    };
  }
  return { next: { ...prev, bearingHeatGaugeRatio }, event: null };
}

// D06本体(P3-4 G3、計画§9.1 R6確定裁定「候補b: 累積曝露」+§9.4 R7「専用meshPhaseAccumulator」)。
// spec §7.1.1「反復イベント(歯単位)/歯欠けごとに伝達効率低下・トルクリップル増/全損で空転
// =走行不能/チタンは発火しない」。
//
// 二つの独立した状態を進める:
//  (1) cumulativeOverloadExposure: 過負荷トルクの超過分の時間積分。閾値超過ごとに歯を1本失い
//      リセットする。**発火判定はこちらのみが担う**。
//  (2) meshPhaseAccumulator: 噛み合わせ位相。リップル変調(composeD06RuntimeEffect)の位相源で
//      あり、**発火可否・崩壊速度には一切影響しない**。nonBreakable(チタン)でも進行する
//      ——リップル自体はtoothLossRatio=0で恒等(1倍)になるため健全時の挙動は変わらない。
function advanceD06(
  prev: D06Progress,
  frame: DestructionFrameInput,
  config: DestructionConfig['d06'],
  runContext: DestructionRunContext,
  elapsedTimeS: number,
  dt: number,
): { next: D06Progress; event: UnstampedDestructionEvent | null } {
  // 噛み合わせ位相(トリガと独立、決定論的)。motor-onlyではaxleAngularVelocityRadSが
  // undefinedのため位相は進まない(ギヤが存在しない文脈であり、車軸の回転が定義できない)。
  const axleOmega = frame.axleAngularVelocityRadS;
  const totalToothCount = runContext.gearTotalToothCount;
  const meshPhaseAccumulator =
    axleOmega !== undefined && totalToothCount !== null
      ? prev.meshPhaseAccumulator + (Math.abs(axleOmega) * totalToothCount * dt) / (2 * Math.PI)
      : prev.meshPhaseAccumulator;

  // チタン(nonBreakable)は歯欠けが発火しない(spec §7.1.1)。位相のみ更新して返す。
  if (config.breakage.kind === 'nonBreakable') {
    return { next: { ...prev, meshPhaseAccumulator }, event: null };
  }
  // 全損済みなら以降の進行はない(全損eventは同一stepでdestructionTerminalとなり、
  // wrapperのループがそのstepで停止するため、実運用ではこの分岐へ到達しない防御的コード)。
  if (totalToothCount !== null && prev.toothLossCount >= totalToothCount) {
    return { next: { ...prev, meshPhaseAccumulator }, event: null };
  }

  // motor-onlyではloadTorqueNmがundefined(ギヤ負荷が存在しない)。曝露は進まない。
  const loadTorqueNm = frame.loadTorqueNm;
  if (loadTorqueNm === undefined || totalToothCount === null) {
    return { next: { ...prev, meshPhaseAccumulator }, event: null };
  }

  const excessNm = Math.max(0, Math.abs(loadTorqueNm) - config.breakage.gearStrengthThresholdNm);
  const cumulativeOverloadExposure = prev.cumulativeOverloadExposure + excessNm * dt;
  if (cumulativeOverloadExposure < config.toothFatigueExposureNmS) {
    return { next: { ...prev, cumulativeOverloadExposure, meshPhaseAccumulator }, event: null };
  }

  // 歯を1本失う。曝露カウンタは0へリセットする(D05のepisode成立と同型)。
  // 1stepで失うのは常に1本まで——advanceD06は1物理stepに1回しか呼ばれないため、
  // 「同一frameで複数歯を失う」経路は構造的に存在しない。
  const toothLossCount = prev.toothLossCount + 1;
  const isTotalLoss = toothLossCount >= totalToothCount;
  const causeLog: D06CauseLog = {
    currentA: frame.currentA,
    rpm: frame.rpm,
    atT: elapsedTimeS,
    // D06は専用の温度計を持たない(D01/D05と同じ規律——捏造しない)。
    temperature: { kind: 'unavailable' },
    loadTorqueNm,
    toothLossCount,
  };
  return {
    next: {
      toothLossCount,
      firstLossAtT: prev.firstLossAtT ?? elapsedTimeS,
      causeLog,
      cumulativeOverloadExposure: 0,
      meshPhaseAccumulator,
    },
    event: { mode: 'D06', causeLog, isFirstThisSession: prev.toothLossCount === 0, isTotalLoss },
  };
}

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

  const d01Result = advanceD01(prev.modes.D01, frame, nextShared.elapsedTimeS, dt, config.d01);
  const d02Result = advanceD02(prev.modes.D02, frame, config.d02, nextShared.elapsedTimeS, dt);
  const d05Result = advanceD05(prev.modes.D05, frame, config.d05, nextShared.elapsedTimeS, dt);
  const d06Result = advanceD06(prev.modes.D06, frame, config.d06, runContext, nextShared.elapsedTimeS, dt);
  const d07Result = advanceD07(prev.modes.D07, frame, config.d07, nextShared.elapsedTimeS, dt);
  const d09Result = advanceD09(prev.modes.D09, frame, config.d09, nextShared.elapsedTimeS, dt);

  // 公開eventsは判定順ではなく、v12 2.1節が定める固定順序(D01→D02→[D03またはD04]→
  // D05→D06→D07→D09)に厳密に従って組み立てる。P3-3時点で実際に発火しうるのは
  // D01→D02→[D03またはD04]→D05→D07の部分列(8節)。
  const events: UnstampedDestructionEvent[] = [];
  if (d01Result.event) events.push(d01Result.event);
  if (d02Result.event) events.push(d02Result.event);
  if (batteryEvent) events.push(batteryEvent);
  if (d05Result.event) events.push(d05Result.event);
  if (d06Result.event) events.push(d06Result.event);
  if (d07Result.event) events.push(d07Result.event);
  if (d09Result.event) events.push(d09Result.event);

  return {
    state: {
      shared: nextShared,
      battery: nextBattery,
      modes: { ...prev.modes, D01: d01Result.next, D02: d02Result.next, D05: d05Result.next, D06: d06Result.next, D07: d07Result.next, D09: d09Result.next },
    },
    events,
  };
}
