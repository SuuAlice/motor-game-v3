// 素材(+個体劣化状態)→既存engine/パラメータへの純関数写像(spec §4.3)。
// engine/本体は素材を知らない。本ファイルはStep3(ギヤ材質の効率比率)・Step4(磁石材質の
// magnetStrength較正値)・Step7a(導線ratio・合成写像)・Step7b(電池ratio較正値・合成写像)を
// 実装する。
//
// docs/phase2-plan.md §16 Step3・Step4・Step7。2026-07-22 Suu_mot3承認・Fable技術レビュー承認。

import {
  resolveAnchorWireMaterial,
  resolveWireDensity,
  computeWireMagnetMassAdjustmentG,
  applyMassAdjustmentToBaselineG,
  type WindingParams,
} from './assumedGeometry';
import { BATTERY_MATERIALS, BODY_MATERIALS, GEAR_MATERIALS, MAGNET_MATERIALS, WIRE_MATERIALS, type BatteryMaterial, type GearMaterial, type MagnetMaterial, type WireMaterial } from './materials';
import type { MotorConfig } from '../engine/motorPhysics';
import type { CarConfig } from '../engine/vehiclePhysics';
import type { BatteryDestructionConfig, DestructionConfig } from '../engine/destructionOrchestration';

export type GearMaterialId = (typeof GEAR_MATERIALS)[number]['id'];
export type MagnetMaterialId = (typeof MAGNET_MATERIALS)[number]['id'];
export type WireMaterialId = (typeof WIRE_MATERIALS)[number]['id'];
export type BatteryMaterialId = (typeof BATTERY_MATERIALS)[number]['id'];
// 正式Fable P3-2裁定(0.2節): 既存Gear/Magnet/Wire/Batteryと同じexportパターンを踏襲する新規export。
export type BodyMaterialId = (typeof BODY_MATERIALS)[number]['id'];

/**
 * ギヤ材質の効率比率(設計較正値、カタログ物性ではない)。
 * POM=1.00(anchor、自己潤滑・軽量・安価。spec標準)
 * PA6=0.98(粘りはあるが吸湿による寸法変化を効率面の小ペナルティとして表現)
 * PEEK=1.01(耐熱・寸法安定による小さな利点。1%に限定し万能化を避ける)
 * Ti-6Al-4V=0.90(金属同士は無潤滑でかじる、明確な損失。高強度とのトレードオフ)
 *
 * 2026-07-22 Suu提案・承認値。spec §4.2の定性記述(自己潤滑性・吸湿・耐熱・無潤滑かじり)に
 * 基づく設計判断であり、materials.ts上の未検証(pending)密度等の物性値は一切参照しない。
 * sweep(Step9)での再調整対象だが、物性カタログ値として扱わない。総合ティア単調性
 * (PEEK>PA6>POMのような)は主張しない——各値は個別の設計理由に基づく。
 *
 * Record<GearMaterialId, number>により、GEAR_MATERIALSへ新規ティアが追加された場合に
 * このテーブルの更新漏れをTypeScriptの型検査で検出する(全キー網羅が要求される)。
 */
const GEAR_MATERIAL_EFFICIENCY_RATIO: Record<GearMaterialId, number> = {
  'gear-pom': 1.0,
  'gear-nylon-pa6': 0.98,
  'gear-peek': 1.01,
  'gear-titanium': 0.9,
};

export type EfficiencyRatioResult = { ok: true; ratio: number } | { ok: false; reason: string };

/**
 * ギヤ材質→効率比率のテーブル参照純関数。GEAR_MATERIAL_EFFICIENCY_RATIOは
 * Record<GearMaterialId, number>として全既知IDを網羅済みのため、実データに対しては
 * 常にok:trueを返す。gear.idの実行時不整合(materials.tsとの非同期等)への防御として
 * Resultで表現する。
 */
export function computeGearMaterialEfficiencyRatio(gear: GearMaterial): EfficiencyRatioResult {
  const ratio = GEAR_MATERIAL_EFFICIENCY_RATIO[gear.id as GearMaterialId];
  if (ratio === undefined) {
    return { ok: false, reason: `${gear.id}: 効率比率テーブルに未登録の素材IDです` };
  }
  return { ok: true, ratio };
}

export type CombinedEfficiencyResult = { ok: true; efficiency: number } | { ok: false; reason: string };

/**
 * 既存(gearRatio依存、V2互換)の基準効率と、素材由来の効率比率を合成する純関数。
 * finalGearEfficiency = baseEfficiency × ratio。
 *
 * base/ratioが有限正であること、合成後が物理的範囲 0 < efficiency <= 1 であることを
 * 実行時に検証する。範囲外はclampせず明示的に失敗を返す。
 *
 * CarConfig.gearEfficiencyへの実接続はStep7a(composeConfigFromMaterials、本ファイル末尾)で
 * 行う。本関数自体は合成ロジックのみを提供する純関数であり、CarConfig/engine/には触れない。
 */
export function combineGearEfficiency(baseEfficiency: number, ratio: number): CombinedEfficiencyResult {
  if (!Number.isFinite(baseEfficiency) || baseEfficiency <= 0) {
    return { ok: false, reason: `baseEfficiencyは有限正である必要があります: ${baseEfficiency}` };
  }
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { ok: false, reason: `ratioは有限正である必要があります: ${ratio}` };
  }
  const efficiency = baseEfficiency * ratio;
  if (!Number.isFinite(efficiency) || efficiency <= 0 || efficiency > 1) {
    return { ok: false, reason: `合成後の効率が物理的範囲(0,1]を外れました: ${efficiency}` };
  }
  return { ok: true, efficiency };
}

// ---------------------------------------------------------------------------
// Step4: 磁石材質のmagnetStrength較正値(設計較正値、docs/phase2-plan.md §10)
// ---------------------------------------------------------------------------

/**
 * 磁石材質→magnetStrength(既存engine、0〜1)の設計較正値テーブル(カタログ物性ではない)。
 *
 * フェライト0.20とネオジム0.90は、src/data/parameterPresets.ts(V2 UI側凍結参考実装)の
 * MAGNET_PRESETS(「弱(フェライト)」=0.2、「強(ネオジム)」=0.9)がフェライト/ネオジムと
 * 明示的にラベル付けした**意味的anchor・既存較正点**である(2026-07-22コード実査)。
 *
 * 重要: pre-Phase2に単一の「暗黙デフォルト値」は存在しない。src/modes/AssemblyMode.tsxの
 * 初期値は0.5、gameStoreの初期値は1.0、scripts/vehicleSweep.tsは0.7〜1.0の各種値を使用して
 * おり、V2全体の既定挙動を厳密に再現する値ではない。フェライト0.2/ネオジム0.9は
 * 「V2 UIで当該素材と明示ラベルされた値」という限定的な意味でのみ根拠を持つ
 * (2026-07-22 Suuレビューによりdocs/phase2-plan.md §10のFable判断の前提を精密化)。
 *
 * アルニコ0.55<サマリウムコバルト0.65は、spec.md §4.2の実Br順位(アルニコ1.2T>
 * サマリウムコバルト1.0T)をあえて逆転させた設計較正である。理由: アルニコは高Brだが
 * 保磁力が低く、開磁路構成で逆磁界により自己減磁しやすい(spec §4.2「逆磁界で減磁する
 * 固有の癖」)ため、実効性は生Brランキングより劣後すると判断した(Fableレビュー
 * docs/phase2-plan.md §10)。この2値は設計裁量であり確たる出典はない。
 *
 * 較正値の算出にmaterials.ts側の実Br・使用上限温度(NumericProperty)は一切参照しない
 * (このコメント内で説明上の根拠として引用するのみ。2026-07-22 Suu指摘5)。
 *
 * Record<MagnetMaterialId, number>により、MAGNET_MATERIALSへ新規ティアが追加された場合の
 * 更新漏れをTypeScriptの型検査で検出する。
 */
const MAGNET_STRENGTH_CALIBRATION: Record<MagnetMaterialId, number> = {
  'magnet-ferrite': 0.2,
  'magnet-alnico': 0.55,
  'magnet-samarium-cobalt': 0.65,
  'magnet-neodymium': 0.9,
};

export type MagnetStrengthCalibrationResult = { ok: true; magnetStrength: number } | { ok: false; reason: string };

/**
 * 磁石材質→magnetStrength較正値のテーブル参照純関数。MotorConfig.magnetStrengthへの実接続は
 * Step7a(composeConfigFromMaterials、本ファイル末尾)で行う。ここでは較正値の算出のみを提供する。
 */
export function computeMagnetStrengthCalibration(magnet: MagnetMaterial): MagnetStrengthCalibrationResult {
  const magnetStrength = MAGNET_STRENGTH_CALIBRATION[magnet.id as MagnetMaterialId];
  if (magnetStrength === undefined) {
    return { ok: false, reason: `${magnet.id}: 較正値テーブルに未登録の素材IDです` };
  }
  return { ok: true, magnetStrength };
}

// ---------------------------------------------------------------------------
// Step7a: 導線ratio(materials.tsの実測値からの単一出典写像、docs/phase2-plan.md §7)
// ---------------------------------------------------------------------------

type NumericResolution = { ok: true; value: number } | { ok: false; reason: string };

/**
 * 導線の抵抗率(NumericProperty)を有限正の数値へ解決する。assumedGeometry.tsの
 * resolveDensity(private)と同型の検証パターンを、抵抗率向けに独立実装する
 * (資産構造上、密度のような設計仮定オーバーライドが必要な導線tierは現状存在しないため、
 * resolveWireDensityほど複雑な分岐は持たない)。
 */
function resolveWireResistivity(wire: WireMaterial): NumericResolution {
  const property = wire.resistivity;
  if (!property.verifiedForPhysics) {
    return { ok: false, reason: `${wire.id}: resistivityが未検証(pending)のためratioを計算できません(${property.reason})` };
  }
  if (!Number.isFinite(property.value) || property.value <= 0) {
    return { ok: false, reason: `${wire.id}: resistivityが有限正の値ではありません: ${property.value}` };
  }
  return { ok: true, value: property.value };
}

export type WireRatioResult = { ok: true; ratio: number } | { ok: false; reason: string };

/**
 * 導線材質→wireResistivityRatio(engine motorPhysics.tsのwireResistivityRatio、既定1.0)への
 * 単一出典写像。anchor(wire-copper-standard)はassumedGeometry.tsのresolveAnchorWireMaterial()
 * を通して解決し、密度解決(resolveWireDensity)・質量差分計算と同一のanchor選択規則を共有する
 * (Fable承認済みQ1・Q7)。
 */
export function computeWireResistivityRatio(wire: WireMaterial): WireRatioResult {
  const resolved = resolveWireResistivity(wire);
  if (!resolved.ok) return resolved;
  const anchor = resolveAnchorWireMaterial();
  if (!anchor.ok) return anchor;
  const anchorResolved = resolveWireResistivity(anchor.material);
  if (!anchorResolved.ok) return anchorResolved;
  return { ok: true, ratio: resolved.value / anchorResolved.value };
}

/**
 * 導線材質→wireDensityRatio(engine motorPhysics.tsのwireDensityRatio、既定1.0)への単一出典
 * 写像。resolveWireDensity(assumedGeometry.ts)をそのまま再利用するため、銀メッキ銅線の
 * 「銅密度代用」設計仮定を重複実装しない。
 *
 * 質量の二重適用に関する契約(Fable承認済みQ5・Q8): wireDensityRatio(モーター回転側の
 * コイル慣性寄与)と、massG差分(車両並進質量・反射慣性、computeWireMagnetMassAdjustmentG)は、
 * 同じ密度を異なる物理量へ反映するものであり、両方が適用されること自体は二重適用ではない。
 * 禁止されるのは、(a) wireDensityRatioから計算した回転慣性をさらにmassGへ加算すること、
 * (b) massG用の質量差分を再度wireDensityRatioへ掛けること、(c) 出力configを再びbaselineとして
 * 再利用し、素材効果を累積させること、の3つのみ。下記composeConfigFromMaterialsは出力を
 * 再びbaseMotorConfig/baseCarConfigとして渡すこと自体は許容する設計(massG・gearEfficiencyは
 * 常に独立したbaseline引数から再計算されるため、出力の再入力では累積しない。真の冪等性、
 * 3.1節参照)。ここで禁止しているのは、出力の一部(計算済みratio・較正値・質量差分)を
 * 次回計算のbaseline値として誤って再利用することである。
 */
export function computeWireDensityRatio(wire: WireMaterial): WireRatioResult {
  const resolved = resolveWireDensity(wire);
  if (!resolved.ok) return resolved;
  const anchor = resolveAnchorWireMaterial();
  if (!anchor.ok) return anchor;
  const anchorResolved = resolveWireDensity(anchor.material);
  if (!anchorResolved.ok) return anchorResolved;
  return { ok: true, ratio: resolved.value.value / anchorResolved.value.value };
}

// ---------------------------------------------------------------------------
// Step7b: 電池材質の内部抵抗ratio・容量ratio(設計較正値、docs/phase2-step7b-plan.md v3)
// ---------------------------------------------------------------------------

// Phase2 Step7b(Fable確定値、docs/phase2-step7-fable-review.md §Q3・Q4)。設計較正値
// (カタログ物性ではない)。決定基準・圧縮理由・電圧直交・省略事項はmaterials.tsの
// BATTERY_MATERIALS直前コメントに転記済み(数値の正は本ファイル、変更時は両方更新すること)。
const BATTERY_INTERNAL_RESISTANCE_RATIO_CALIBRATION: Record<BatteryMaterialId, number> = {
  'battery-alkaline': 1.0,
  'battery-nickel-metal-hydride': 0.3,
  'battery-lithium-polymer': 0.15,
};

const BATTERY_CAPACITY_RATIO_CALIBRATION: Record<BatteryMaterialId, number> = {
  'battery-alkaline': 1.0,
  'battery-nickel-metal-hydride': 1.0,
  'battery-lithium-polymer': 1.3,
};

export type BatteryRatioResult = { ok: true; ratio: number } | { ok: false; reason: string };

// Step5a/5bで確定したtrusted precondition契約(有限正保証)の履行者として、写像層
// (materialMapping.ts)が最終防衛線になる。Record<BatteryMaterialId, number>は「全tier
// 網羅」をTypeScriptの型検査で保証するが、値自体がNaN・Infinity・0・負値でないことは
// 型レベルでは保証できないため、テーブル参照後に実行時検査を行う(Suu_mot3レビュー
// 必須修正1、Fable Q5承認)。不正時はclamp・fallbackせず理由付きok:falseを返す
// (素材写像の設定不備を黙って補正しない)。
const BATTERY_RATIO_MIN = 0.01; // Step6 MC3クランプ範囲[0.01,10]と同じ下限
const BATTERY_RATIO_MAX = 10; // 同上限

function validateBatteryRatio(ratio: number, batteryId: string, label: string): BatteryRatioResult {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { ok: false, reason: `${batteryId}: ${label}較正値が有限正の値ではありません: ${ratio}` };
  }
  if (ratio < BATTERY_RATIO_MIN || ratio > BATTERY_RATIO_MAX) {
    return { ok: false, reason: `${batteryId}: ${label}較正値がMC3クランプ範囲[${BATTERY_RATIO_MIN},${BATTERY_RATIO_MAX}]を外れています: ${ratio}` };
  }
  return { ok: true, ratio };
}

/** 電池材質→内部抵抗ratio較正値のテーブル参照純関数(有限正・MC3範囲内を実行時検査)。 */
export function computeBatteryInternalResistanceRatioCalibration(battery: BatteryMaterial): BatteryRatioResult {
  const ratio = BATTERY_INTERNAL_RESISTANCE_RATIO_CALIBRATION[battery.id as BatteryMaterialId];
  if (ratio === undefined) return { ok: false, reason: `${battery.id}: 内部抵抗較正値テーブルに未登録の素材IDです` };
  return validateBatteryRatio(ratio, battery.id, '内部抵抗ratio');
}

/** 電池材質→容量ratio較正値のテーブル参照純関数(有限正・MC3範囲内を実行時検査)。 */
export function computeBatteryCapacityRatioCalibration(battery: BatteryMaterial): BatteryRatioResult {
  const ratio = BATTERY_CAPACITY_RATIO_CALIBRATION[battery.id as BatteryMaterialId];
  if (ratio === undefined) return { ok: false, reason: `${battery.id}: 容量較正値テーブルに未登録の素材IDです` };
  return validateBatteryRatio(ratio, battery.id, '容量ratio');
}

// ---------------------------------------------------------------------------
// Step7a: 合成純関数(素材選択→MotorConfig/CarConfigへの接続、docs/phase2-plan.md §1・§3)
// ---------------------------------------------------------------------------

/**
 * engine既定値(motorPhysics.tsのD_REF=0.4mm・既定parallelStrands=1)と同期が必要な
 * ローカル既定値。recipeCode.ts(motorConfigToFields)も同様の独立フォールバックを持つ
 * (3箇所目の重複、Suu_mot3最終レビュー指摘)。engine側の既定値が変わった場合はここも
 * 合わせて更新すること。共通定数化(engineへの公開定数新設)は本Step7の対象外とする。
 */
const DEFAULT_WIRE_GAUGE_MM = 0.4;
const DEFAULT_PARALLEL_STRANDS: 1 | 2 = 1;

export interface MaterialCompositionBaseline {
  /** 素材未反映のchassis基準massG [g]。assumedGeometry.tsのresolveChassisBaselineG()の結果を渡す。 */
  chassisBaselineG: number;
  /** 素材未反映の基準gearEfficiency(既存gearRatio階層のみに基づく値。例: V2互換0.9/0.8/0.74)。 */
  baseGearEfficiency: number;
}

export interface MaterialSelection {
  wireId: WireMaterialId;
  magnetId: MagnetMaterialId;
  gearId: GearMaterialId;
  // Step7bで追加(必須フィールド)。Step7aのSuu_mot3最終レビュー指摘どおり、型追加と
  // 実装追加(下記composeConfigFromMaterials)を同時に行い、有効な入力を受理しながら
  // 結果へ反映しない「受理するが無視する」状態を作らない。
  batteryId: BatteryMaterialId;
}

export type ComposeConfigResult =
  | { ok: true; motorConfig: MotorConfig; carConfig: CarConfig }
  | { ok: false; reason: string };

/**
 * 素材選択(導線・磁石・ギヤ)から、実際にwireResistivityRatio・wireDensityRatio・
 * magnetStrength・gearEfficiency・massGを反映した新しいMotorConfig/CarConfigを返す合成
 * 純関数(docs/phase2-plan.md §1「materialMappingは素材から既存MotorConfig/CarConfigへの
 * 写像」・§3「CarRecipeの外側で素材選択からconfig値を計算する純関数」の実装)。
 *
 * 入力契約(重要、Fable承認済みQ5・Q8):
 * - baseMotorConfig・baseCarConfigは他の非素材依存フィールド(wheelDiameterMm等)を
 *   引き継ぐためだけに使う。baseCarConfig.massGとbaseCarConfig.gearEfficiencyの値は
 *   **この関数の出力には一切使われない**(意図的に無視する)。massG・gearEfficiencyは
 *   常にbaseline引数(chassisBaselineG・baseGearEfficiency)から計算する。
 * - この設計により、この関数の出力を再びbaseMotorConfig/baseCarConfigとして渡しても
 *   (baseline・selectionが同じ限り)常に同一の出力になる、という真の冪等性が構造的に
 *   保証される(検査ではなく構造による保証)。
 *
 * 原子的Result契約: いずれかの写像ステップが失敗した場合、部分適用されたconfigを返さず
 * 全体をok:falseにする(即時打ち切り)。
 *
 * 電圧直交契約(Fable承認Q4条件2): 本関数はbatteryVoltageを変更しない。化学系(batteryId)と
 * パック電圧は独立軸である。LiPoを選んでも電圧はbaseMotorConfig.batteryVoltageのまま。
 */
export function composeConfigFromMaterials(
  baseMotorConfig: MotorConfig,
  baseCarConfig: CarConfig,
  baseline: MaterialCompositionBaseline,
  selection: MaterialSelection,
): ComposeConfigResult {
  const wire = WIRE_MATERIALS.find((m) => m.id === selection.wireId);
  if (!wire) return { ok: false, reason: `${selection.wireId}: 未登録の導線素材IDです` };
  const magnet = MAGNET_MATERIALS.find((m) => m.id === selection.magnetId);
  if (!magnet) return { ok: false, reason: `${selection.magnetId}: 未登録の磁石素材IDです` };
  const gear = GEAR_MATERIALS.find((m) => m.id === selection.gearId);
  if (!gear) return { ok: false, reason: `${selection.gearId}: 未登録のギヤ素材IDです` };
  const battery = BATTERY_MATERIALS.find((m) => m.id === selection.batteryId);
  if (!battery) return { ok: false, reason: `${selection.batteryId}: 未登録の電池素材IDです` };

  const wireResistivityRatio = computeWireResistivityRatio(wire);
  if (!wireResistivityRatio.ok) return wireResistivityRatio;
  const wireDensityRatio = computeWireDensityRatio(wire);
  if (!wireDensityRatio.ok) return wireDensityRatio;
  const magnetStrength = computeMagnetStrengthCalibration(magnet);
  if (!magnetStrength.ok) return magnetStrength;
  const gearRatio = computeGearMaterialEfficiencyRatio(gear);
  if (!gearRatio.ok) return gearRatio;
  const gearEfficiency = combineGearEfficiency(baseline.baseGearEfficiency, gearRatio.ratio);
  if (!gearEfficiency.ok) return gearEfficiency;
  const batteryInternalResistanceRatio = computeBatteryInternalResistanceRatioCalibration(battery);
  if (!batteryInternalResistanceRatio.ok) return batteryInternalResistanceRatio;
  const batteryCapacityRatio = computeBatteryCapacityRatioCalibration(battery);
  if (!batteryCapacityRatio.ok) return batteryCapacityRatio;

  const windingParams: WindingParams = {
    coilTurns: baseMotorConfig.coilTurns,
    wireGaugeMm: baseMotorConfig.wireGaugeMm ?? DEFAULT_WIRE_GAUGE_MM,
    parallelStrands: baseMotorConfig.parallelStrands ?? DEFAULT_PARALLEL_STRANDS,
  };
  const massDelta = computeWireMagnetMassAdjustmentG(wire, magnet, windingParams);
  if (!massDelta.ok) return massDelta;
  const massG = applyMassAdjustmentToBaselineG(baseline.chassisBaselineG, massDelta.deltaG);
  if (!massG.ok) return massG;

  return {
    ok: true,
    motorConfig: {
      ...baseMotorConfig,
      wireResistivityRatio: wireResistivityRatio.ratio,
      wireDensityRatio: wireDensityRatio.ratio,
      magnetStrength: magnetStrength.magnetStrength,
      batteryInternalResistanceRatio: batteryInternalResistanceRatio.ratio,
      batteryCapacityRatio: batteryCapacityRatio.ratio,
    },
    carConfig: {
      ...baseCarConfig,
      gearEfficiency: gearEfficiency.efficiency,
      massG: massG.massG,
    },
  };
}

// ---------------------------------------------------------------------------
// P3-1: 電池profile写像+D03較正値(docs/phase3-p3-1-plan.md v4 §2.3、正式Fable P3-1-Q3裁定)
// ---------------------------------------------------------------------------

const BATTERY_DESTRUCTION_PROFILE: Record<BatteryMaterialId, 'lipo' | 'nonLipo'> = {
  'battery-alkaline': 'nonLipo',
  'battery-nickel-metal-hydride': 'nonLipo',
  'battery-lithium-polymer': 'lipo',
};

/** 電池素材→destruction profile(D03/D04どちらの経路が有効か)の写像純関数。 */
export function mapBatteryDestructionProfile(batteryId: BatteryMaterialId): 'lipo' | 'nonLipo' {
  return BATTERY_DESTRUCTION_PROFILE[batteryId];
}

// D03較正値: 短絡「開始」からの連続継続時間の下限(秒)。実際の判定式は
// destructionModes.tsのadvanceD03の
//   sharedShortCircuitDurationS >= config.shortCircuitDurationLimitS && frame.batteryHeat >= BATTERY_HEAT_LIMIT
// であり、「batteryHeatがBATTERY_HEAT_LIMITへ到達した後さらにこの秒数だけ待つ」という意味では
// ない。両条件は同一フレームで同時に満たされて初めて発火する(短絡が閾値秒数以上連続し、
// かつそのフレームで発熱ゲージも上限に達している、という単一の複合条件)。
//
// この定数はP3-1(Phase3のD03物理較正)の対象であり、Phase5(経済結線・数値保証)の対象では
// ない。値自体は実測較正ではなく設計値である。
//
// 正式Fable裁定(2026-08-03T09:05、P3-1-Q3、確定): 候補値3.0秒での実装開始を承認する。確定は
// sweep実測をもって行う。物理所見(Fable原文の要旨): 実物の乾電池短絡破裂は分単位の現象であり
// 3.0秒は実時間として短いが、この値は単独の破裂タイマーではなく「既存発熱物理でheatゲージが
// 上限に達していること」との複合条件の持続下限であり、実効的な到達時間は既存nextBatteryHeatの
// 物理が支配する。ゲーム時間スケール(数十秒〜数分の走行)に対する設計較正値として妥当な出発点
// である。アルカリ/NiMHの単一値も正しい——一次資料なしに差を発明するのは捏造側であり、差が
// 必要になる根拠が出るまで単一値が正直である。
//
// 受け入れ条件(sweepテストで満たすこと、__tests__/materialMapping.test.tsに実装):
//   - アルカリ・NiMHそれぞれについて、既存nextBatteryHeatの発熱式(motorPhysics.ts)を用いた
//     sweepで、通常運用(短絡なし)ではBATTERY_HEAT_LIMIT到達前にD03が発火しないこと
//   - 意図的に持続短絡(shorted=trueを固定してdt刻みで進める)させた場合、有限のシミュレーション
//     時間内にD03が発火すること(held-short到達性テスト)
//   - dt境界(shortCircuitDurationLimitSちょうどの直前/直後)でのオン・オフが1フレーム単位で
//     正確に切り替わること
//
// 確定手順(Fable指定): 実装報告に、上記3条件のsweep実測データ全文と、短絡構成でのheatゲージ
// 上限到達時間と3.0秒の関係の実測を含める(4種の証跡)。実測が受け入れ条件を満たせばFable
// 再裁定不要でこの値を確定してよい。満たさず値の変更が必要な場合のみ、変更値と実測をSuu_mot3
// 経由で報告する。
const BATTERY_SHORT_CIRCUIT_DURATION_LIMIT_S_CANDIDATE: Record<Extract<BatteryMaterialId, 'battery-alkaline' | 'battery-nickel-metal-hydride'>, number> = {
  'battery-alkaline': 3.0,
  'battery-nickel-metal-hydride': 3.0, // 内部抵抗差を反映する一次資料が現時点でなく単一値とする
};

/** 非リポ電池素材→D03用DestructionConfig(battery枝)の写像純関数。P3-1はfixtureのみが直接呼ぶ(gameStore配線なし)。 */
export function mapD03DestructionConfig(
  batteryId: Extract<BatteryMaterialId, 'battery-alkaline' | 'battery-nickel-metal-hydride'>,
): Extract<BatteryDestructionConfig, { profile: 'nonLipo' }> {
  return {
    profile: 'nonLipo',
    shortCircuitDurationLimitS: BATTERY_SHORT_CIRCUIT_DURATION_LIMIT_S_CANDIDATE[batteryId],
  };
}

// ---------------------------------------------------------------------------
// P3-2ゲート2: D04(リポ経路)+D07(三段開示骨格)較正値の写像(docs/phase3-p3-2-plan.md v9 §8、
// 正式Fable技術レビュー2026-08-08条件付き承認+人間再承認バンドル承認済み)。
// 本ゲートは純関数の実装+単体テストまでを行う。advanceD04/advanceD07・composeEffectiveMotorConfig
// への接続、物理到達sweepによる係数確定はゲート3〜5のスコープであり本ゲートには含まない。
// ---------------------------------------------------------------------------

// D04較正値(P3-2ゲート5)。正式Fable補足裁定(P3-2ゲート5 Q13-1、2026-08-09、
// 人間再承認済み2026-08-09T06:20)により確定。docs/phase3-p3-2-plan.md 14.1節参照。
//
// 経緯: ゲート2の設計初期候補(3.0秒・0.9・2.0+2.0)のままではM4到達可能性条件(3)
// 「短絡構成がoverheated終端より先にburningへ到達できること」を満たせないことが
// ゲート5のsweep実測(production-valid構成)で判明し、いったんstageDurations={0.05,0.05}
// (各3描画フレーム@60fps)へ短縮したが、これはart-spec §7「アニメーション時間規律」の
// 12fps格子(5描画フレーム=0.0833秒)単位を下回り、膨張→発煙を人間が識別可能な症状として
// 提示できなかった(Suu_mot3レビューP2指摘)。production-valid held-short構成での
// feasibility実測(`docs/phase3-p3-2-gate5-calibration-review-request.md`表1〜3)により、
// 離散時間シミュレーションとして達成可能な真に最速のentryでも、overheated到達までの
// 残り時間窓は最大19〜21フレーム(0.158〜0.175秒)しかなく、1段階あたり12fps格子1個
// (0.0833秒)を満たそうとすると2段階合計0.1667秒が必要になり、この窓に収まらない——
// 「M4条件(3)を満たす」ことと「各段階をUIで識別可能にする」ことが、V2由来のoverheated
// 終端とD04熱暴走進行という同一物理過程の二重表現のせいで両立不可能だった構造的対立が、
// Q13-1裁定(overheated保留規則、`src/engine/destructionOrchestration.ts`の
// `normalizeOverheatedStatusForD04Hold`)により解消された。電池がlipoでD04 stageが
// {swelling,smoking}の間はoverheated終端が保留されるため、時間予算の制約が消え、
// 段階を可視の長さへ戻せる。
const D04_SHORT_CIRCUIT_DURATION_LIMIT_S_CANDIDATE = 0.05; // Q13-1裁定はentry timing自体を変更対象にしていないため現状維持(段階時間の可視化はstageDurationsとoverheated保留規則が担う)
const D04_RUNAWAY_HEAT_THRESHOLD_CANDIDATE = 0.3; // 同上、現状維持
const D04_STAGE_DURATIONS_CANDIDATE = { swellingS: 0.35, smokingS: 0.25 }; // Q13-1裁定で確定(12fps格子4個+3個、合計0.6秒)。過放電経路M4条件(2)とのマージンは新M4条件系sweepで再実証する
const D04_INTERNAL_RESISTANCE_DEGRADATION_MULTIPLIER = 1.5; // 正式Fable P3-2-Q1裁定、人間再承認済みの初期候補値(バンドルで値として提示・承認済み、変更なし)

/**
 * リポ電池素材→D04用BatteryDestructionConfig(lipo枝)の写像純関数。P3-2はfixtureのみが
 * 直接呼ぶ(gameStore配線はP3-4)。internalResistanceDegradationMultiplier(1.5)は
 * 人間再承認バンドルで値として提示・承認された初期候補値。stageDurationsは正式Fable
 * P3-2ゲート5 Q13-1裁定(2026-08-09、人間再承認済み)で確定した設計較正値
 * ({swellingS:0.35, smokingS:0.25})。shortCircuitDurationLimitS・runawayHeatThresholdは
 * Q13-1裁定の対象外のためゲート2時点の値を維持している。
 * stageDurationsは呼び出しごとに新規オブジェクトを構築する(写像純関数の契約——戻り値の
 * ネストオブジェクトを呼び出し元が変更しても、他の呼び出しの結果を汚染してはならない)。
 */
export function mapD04BatteryDestructionConfig(
  batteryId: Extract<BatteryMaterialId, 'battery-lithium-polymer'>,
): Extract<BatteryDestructionConfig, { profile: 'lipo' }> {
  // batteryIdは現状'battery-lithium-polymer'の1値のみ(型で保証済み)。将来lipo系素材が
  // 増えた場合はRecord化して網羅チェックをTypeScriptに委ねること(他のmapXxxと同じ規律)。
  void batteryId;
  return {
    profile: 'lipo',
    shortCircuitDurationLimitS: D04_SHORT_CIRCUIT_DURATION_LIMIT_S_CANDIDATE,
    runawayHeatThreshold: D04_RUNAWAY_HEAT_THRESHOLD_CANDIDATE,
    unsafeDischargeStartRatio: 0.9, // 正式P3-0裁定で確定済みの値(P3-0-Q2文脈)
    stageDurations: { ...D04_STAGE_DURATIONS_CANDIDATE },
    internalResistanceDegradationMultiplier: D04_INTERNAL_RESISTANCE_DEGRADATION_MULTIPLIER,
  };
}

// ボディ素材の延焼deltaFraction(設計候補値)。'body-none'(hasPhysicalMaterial:false、
// spec.md「なし〈むき出し〉」)は燃える実体自体が存在しないため0で正しい。他3素材は
// いずれも可燃性の物理素材だが、素材間の焼損しやすさの差を裏付ける一次資料がないため、
// D03のアルカリ/NiMH単一値と同じ規律で単一の候補値とする(差の発明を避ける)。
const BODY_SCORCH_DELTA_FRACTION_CANDIDATE: Record<BodyMaterialId, number> = {
  'body-none': 0,
  'body-cardboard-cowl': 0.2,
  'body-ps-cowl': 0.2,
  'body-polycarbonate-clear': 0.2,
};

/** ボディ素材→D04延焼時のbodyScorchDeltaFraction較正値の写像純関数(Record全網羅、設計候補値)。 */
export function mapBodyScorchDeltaFraction(bodyId: BodyMaterialId): number {
  return BODY_SCORCH_DELTA_FRACTION_CANDIDATE[bodyId];
}

// 正式Fable P3-2-Q5裁定(確定): magnetScorchDeltaFractionはD07のdemagnetizationDeltaFractionの
// 再利用ではなく独立フィールドとして維持する(火災は数百℃の急性熱曝露、D07不可逆到達は
// 動作限界の踏み越えで熱量が桁で異なるため)。ただし全磁石素材でmagnetScorchDeltaFraction >=
// demagnetizationDeltaFractionを満たす制約があり(火災が閾値踏み越えより軽いことは決してない)、
// nonDemagnetizing磁石には0を返す(8節)。
const MAGNET_SCORCH_DELTA_FRACTION_CANDIDATE: Record<MagnetMaterialId, number> = {
  'magnet-ferrite': 0, // nonDemagnetizing(spec.md 558行目「他は事実上安全」)
  'magnet-alnico': 0, // nonDemagnetizing(同上。逆磁界減磁はV3本編対象外、spec.md 119・544行目)
  'magnet-samarium-cobalt': 0, // nonDemagnetizing(同上)
  'magnet-neodymium': 0.15, // demagnetizing。人間再承認済みの初期候補値。demagnetizationDeltaFraction(0.10)以上を満たす
};

/**
 * 磁石素材→D04延焼時のmagnetScorchDeltaFraction較正値の写像純関数(Record全網羅)。
 * nonDemagnetizing磁石(mapD07DestructionConfigのirreversible.kind==='nonDemagnetizing')には
 * 常に0を返す。全磁石素材でこの値がmapD07DestructionConfig(m).irreversible.kind==='demagnetizing'
 * の場合のdemagnetizationDeltaFraction以上であることを単体テストで固定する(付帯条件4)。
 */
export function mapMagnetScorchDeltaFraction(magnetId: MagnetMaterialId): number {
  return MAGNET_SCORCH_DELTA_FRACTION_CANDIDATE[magnetId];
}

// D07較正値(P3-2ゲート5、2026-08-08計測。production-valid構成での再sweepで裏付け済み、
// ただしSuu_mot3ゲート5レビューを経て正式にはまだ未確定)。thermalは磁石の種類によらず常に
// 必要(HUD熱ゲージ、候補(ii)の構造)。一次資料なく磁石種別の熱容量差を発明しないため、
// D03のアルカリ/NiMH単一値と同じ規律で全磁石共通の単一候補値とする。
// conductionCoefficient(旧候補0.001)はゲート2で設定した設計初期候補のままではQ11受け入れ条件
// (1)〜(3)を満たせないことがゲート5のsweep実測で判明したため改訂した(Suu_mot3の事前許可に
// 基づく)。dissipationCoefficient(0.5)は人間再承認バンドルに個別値の記載がなく、ゲート2で
// 新たに設定した設計初期候補のまま(変更なし)。
//
// 実測根拠(vehicle文脈stepTrackRun経由、production-valid素材写像config——
// composeConfigFromMaterialsの実出力を主経路に使い、player-adjustable値〈coilTurns・
// magnetDistanceMm・brushPressure・gearRatio・tireGrip・slopeDeg〉のみを変更、2026-08-09再計測):
// 熱ゲージの定常平衡値≈電流²×k(k=conduction/dissipation)という式に基づきk=0.5
// (conduction=0.25, dissipation=0.5)を採用。磁石=neodymium(magnetStrength=0.9、
// mapMagnetStrengthCalibration実測上限)固定で、通常負荷(battery-alkaline+gear-pom+
// wire-copper-standard、既定player値、30秒間)でmaxGauge=0.327(droop非到達、条件1)、
// 高負荷(battery-alkaline+gear-titanium+wire-silver、coilTurns=20・magnetDistanceMm=5・
// brushPressure=0.5・gearRatio=8・tireGrip=0.9、平坦)でdroopAtStep=21(到達可能、条件2。
// 最終的にstep147でoverheated終端に達するがdroop到達自体は先に成立)、意図的な持続過負荷
// (同素材選択、coilTurns=15・magnetDistanceMm=3・brushPressure=0.5・gearRatio=10・
// tireGrip=1.0・slopeDeg=20)でdroopAtStep=17・irreversibleAtStep=28・overheatedAtStep=72
// (不可逆到達がoverheated終端より先、条件3)をそれぞれ実測した。旧測定(P1指摘で無効化、
// magnetStrength=2.0/6.0等の実在写像範囲外の値を使用)より弱いmagnetStrength上限(0.9)でも
// player-adjustable値側の調整で同等の受け入れ条件到達を再現できることを確認済み。
const D07_THERMAL_CANDIDATE = { conductionCoefficient: 0.25, dissipationCoefficient: 0.5 };

// irreversible.kind: spec.md(§14相当データ表、558行目)「ネオジムのみ実用域で発生、他は
// 事実上安全」という確定済みの正典記述に基づく(独自の物理判断の発明ではなく正典の転記)。
// アルニコの既知の弱点(逆磁界減磁)はV3本編のD07(熱減磁のみ)の対象外であるため
// nonDemagnetizingに含めて矛盾しない(spec.md 119・544行目)。
const MAGNET_IS_DEMAGNETIZING: Record<MagnetMaterialId, boolean> = {
  'magnet-ferrite': false,
  'magnet-alnico': false,
  'magnet-samarium-cobalt': false,
  'magnet-neodymium': true,
};

// demagnetizing磁石(現状neodymiumのみ)向けの候補値。magnetHeatGaugeLimit(0.8)>
// reversibleDroopThreshold(0.5)を満たす。人間再承認バンドルで値として提示・承認された
// 初期候補はreversibleDroopMultiplier(0.95)・demagnetizationDeltaFraction(0.10)の2値のみ。
// magnetHeatGaugeLimit(0.8)・reversibleDroopThreshold(0.5)はバンドル上個別値の記載がなく、
// ゲート2で新たに設定した設計初期候補である(Suu_mot3ゲート2追補レビュー指摘の是正)。
// いずれもゲート5 sweep前で未確定という点は共通。
const D07_DEMAGNETIZING_CANDIDATE = {
  magnetHeatGaugeLimit: 0.8,
  reversibleDroopThreshold: 0.5,
  reversibleDroopMultiplier: 0.95,
  demagnetizationDeltaFraction: 0.1,
};

/**
 * 磁石素材→D07用DestructionConfig['d07'](候補(ii)の{thermal,irreversible}2部構成)の
 * 写像純関数。P3-2はfixtureのみが直接呼ぶ(gameStore配線はP3-4)。reversibleDroopMultiplier
 * (0.95)・demagnetizationDeltaFraction(0.10)は人間再承認バンドルで値として提示・承認された
 * 初期候補値。thermal係数・magnetHeatGaugeLimit・reversibleDroopThresholdはバンドル上
 * 個別値の記載がなくゲート2で設定した設計初期候補値である。いずれもゲート5のsweep実測で
 * 最終確定する(未確定という点は共通)。thermal・irreversibleとも呼び出しごとに新規
 * オブジェクトを構築する(写像純関数の契約——戻り値のネストオブジェクトを呼び出し元が
 * 変更しても、他の呼び出しの結果を汚染してはならない)。
 */
export function mapD07DestructionConfig(magnetId: MagnetMaterialId): DestructionConfig['d07'] {
  const thermal = { ...D07_THERMAL_CANDIDATE };
  if (!MAGNET_IS_DEMAGNETIZING[magnetId]) {
    return { thermal, irreversible: { kind: 'nonDemagnetizing' } };
  }
  return { thermal, irreversible: { kind: 'demagnetizing', ...D07_DEMAGNETIZING_CANDIDATE } };
}
