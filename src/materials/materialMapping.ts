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
import { BATTERY_MATERIALS, BODY_MATERIALS, BRUSH_MATERIALS, GEAR_MATERIALS, MAGNET_MATERIALS, WIRE_MATERIALS, type BatteryMaterial, type GearMaterial, type MagnetMaterial, type WireMaterial } from './materials';
import type { MotorConfig } from '../engine/motorPhysics';
import type { CarConfig } from '../engine/vehiclePhysics';
import type { BatteryDestructionConfig, DestructionConfig, GearBreakageProfile } from '../engine/destructionOrchestration';
import { D01_CALIBRATION, D02_CALIBRATION, D05_COMMON_CALIBRATION } from './destructionCalibration';
import { resolveGearMassDeltaGById, resolveGearReflectedInertiaKgM2ById } from './gearInertia';

export type GearMaterialId = (typeof GEAR_MATERIALS)[number]['id'];
export type MagnetMaterialId = (typeof MAGNET_MATERIALS)[number]['id'];
export type WireMaterialId = (typeof WIRE_MATERIALS)[number]['id'];
export type BatteryMaterialId = (typeof BATTERY_MATERIALS)[number]['id'];
// 正式Fable P3-2裁定(0.2節): 既存Gear/Magnet/Wire/Batteryと同じexportパターンを踏襲する新規export。
export type BodyMaterialId = (typeof BODY_MATERIALS)[number]['id'];
// P3-3 Gate2(合意事項): Gate1計画表の「BrushMaterialId型宣言のみ本ゲートに残す」という文言と
// §14.1「materialMapping.tsでexport」という文言が計画v8内で競合していたが、Gear/Magnet/Wire/
// Battery/Bodyと同じくmaterialMapping.ts側でのexportが正である合意に基づき、ここでexportする。
export type BrushMaterialId = (typeof BRUSH_MATERIALS)[number]['id'];

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
  // P3-3 Gate2で追加(必須フィールド、Q10確定)。batteryIdと同じ規律で型追加と
  // composeConfigFromMaterialsへの反映を同時に行う。
  brushId: BrushMaterialId;
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
  const brush = BRUSH_MATERIALS.find((m) => m.id === selection.brushId);
  if (!brush) return { ok: false, reason: `${selection.brushId}: 未登録のブラシ素材IDです` };

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
  // P3-4 G3 G-R1(人間再承認済み2026-08-19): ギヤ実質量のanchor差分をmassGへ加算する。
  // V2のchassisBaselineGは標準ギヤを暗黙包含するため絶対質量ではなく差分方式(anchor=POM装備時は
  // 差分0でmassG不変、V2回帰を厳密に保つ)。幾何はJ経路と同一の単一出典を共有する(gearInertia.ts)。
  const gearMassDelta = resolveGearMassDeltaGById(selection.gearId);
  if (!gearMassDelta.ok) return { ok: false, reason: gearMassDelta.reason };
  const massG = applyMassAdjustmentToBaselineG(baseline.chassisBaselineG, massDelta.deltaG + gearMassDelta.value);
  if (!massG.ok) return massG;

  const brushRatios = mapBrushRatios(selection.brushId);

  // P3-4 G3(§10.3・§10.4、Suu_mot3 G3-P2「gameStore後付けを作らない」): ギヤの反射慣性を
  // **同一のselection.gearIdと合成後のgearRatioから**ここで決める。carConfigの単一出典を
  // composeConfigFromMaterialsに保ち、store側の後付けによる第二の出典を作らない。
  // 解決できない素材(密度が未検証かつ設計仮定も持たない)ではフィールドを設定せず、
  // 既定0扱い(V2回帰と同一)とする——黙って0を書き込むのではなく「載せない」ことで、
  // 「値が未確認」と「慣性が0」を区別する。
  const gearInertia = resolveGearReflectedInertiaKgM2ById(selection.gearId, baseCarConfig.gearRatio);

  return {
    ok: true,
    motorConfig: {
      ...baseMotorConfig,
      wireResistivityRatio: wireResistivityRatio.ratio,
      wireDensityRatio: wireDensityRatio.ratio,
      magnetStrength: magnetStrength.magnetStrength,
      batteryInternalResistanceRatio: batteryInternalResistanceRatio.ratio,
      batteryCapacityRatio: batteryCapacityRatio.ratio,
      brushContactResistanceRatio: brushRatios.brushContactResistanceRatio,
      brushChatterProbabilityRatio: brushRatios.brushChatterProbabilityRatio,
    },
    carConfig: {
      ...baseCarConfig,
      gearEfficiency: gearEfficiency.efficiency,
      massG: massG.massG,
      ...(gearInertia.ok ? { gearReflectedInertiaKgM2: gearInertia.value } : {}),
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

// ---------------------------------------------------------------------------
// P3-3 Gate2: ブラシ素材(D05摩耗+MotorConfig接触抵抗/チャタリング確率比較正)
// ---------------------------------------------------------------------------

// 正式Fable P3-3-Q10裁定(確定、6.2〜6.3節): ブラシ素材はMotorConfig層(接触抵抗・
// チャタリング確率の比率、motorPhysics.tsへの式配線自体はGate4)とDestructionConfig.d05層
// (摩耗率・高電流ペナルティ、6.2節「Layer2」)の2層にまたがって影響する。本テーブルは
// MotorConfig層のみを扱う。brush-carbon(標準・自己潤滑)を比率1.0のanchorとし、他素材は
// 定性記述(materials.ts BRUSH_MATERIALS各descriptionJa)に基づく設計較正値とする:
// - brush-copper-plate(「V1以来の原点。摩耗大」): 接触抵抗のみ悪化(摩耗はD05層の責務)。
//   素の銅は良導体だが、実物の銅板ブラシは使用中に酸化被膜(半導体的な酸化銅)が形成され
//   接触抵抗が急速に悪化・不安定化する——これがcontactResistanceRatio>1(悪化)の物理的根拠
//   であり、導電率の高さと矛盾しない(正式Fable P3-3-Q15-2裁定、酸化被膜所見)。
// - brush-silver-graphite(「低接触抵抗」): 接触抵抗のみ改善。チャタリング確率・摩耗は
//   anchorから変更しない(6.3節の非線形性表〈正式Fable P3-3-Q15-5裁定で精密化済み〉:
//   銀黒鉛は高電流域でも低接触抵抗の優位を保つが、摩耗率はカーボンと同値という設計方針
//   のため、摩耗側の変更はmapD05BrushWearConfig側でも行わない)。
// - brush-precious-metal(「低電流で抜群、大電流で急速に荒れる」): 接触抵抗・チャタリング
//   確率の双方を改善(低電流域での性能の良さをここで表現)。大電流域での急速な荒れは
//   mapD05BrushWearConfigのhighCurrentPenaltyで別途表現する(このテーブルでは表現しない)。
// 最小較正自由度の方針(6.3節)により、記述に根拠のない比率変更は行わない。
//
// 正式Fable P3-3-Q15-2裁定(確定、2026-08-10): 接触抵抗ratioの順位(銅板1.3>カーボン1.0>
// 銀黒鉛0.7>貴金属0.5)を含む6値すべてを暫定候補値として承認する(6.3節の受け入れ表と
// 実物のブラシ産業の双方に整合)。確定はゲート5のsweepで以下を満たすことによる:
// (i)少なくとも銅板・貴金属の両極間で、接触抵抗ratio差が定常計測で観測可能であること
// (D07 Q2 sweepと同型の観測可能性確認)。(ii)6.3節既定の受け入れ条件(両電流域での
// 順位実証・prob clamp・NORMAL_OPERATION拡張列)はすべて維持する。値の確定経路は
// 11.1節末尾の「Fable候補裁定→sweep→確定申請→人間commit承認」に従う。
const BRUSH_MOTOR_CONFIG_RATIO_CANDIDATE: Record<BrushMaterialId, { brushContactResistanceRatio: number; brushChatterProbabilityRatio: number }> = {
  'brush-carbon': { brushContactResistanceRatio: 1, brushChatterProbabilityRatio: 1 },
  'brush-copper-plate': { brushContactResistanceRatio: 1.3, brushChatterProbabilityRatio: 1 },
  'brush-silver-graphite': { brushContactResistanceRatio: 0.7, brushChatterProbabilityRatio: 1 },
  'brush-precious-metal': { brushContactResistanceRatio: 0.5, brushChatterProbabilityRatio: 0.7 },
};

/**
 * ブラシ素材→MotorConfig層(brushContactResistanceRatio・brushChatterProbabilityRatio)の
 * 写像純関数(Record全網羅、BrushMaterialIdへ新規ティア追加時はTypeScriptの型検査で
 * 更新漏れを検出する)。物理式(motorPhysics.ts)への実配線はGate4で行う——本関数はGate2
 * 時点では比率値の算出のみを担い、composeConfigFromMaterials経由でMotorConfigへ格納する。
 */
export function mapBrushRatios(brushId: BrushMaterialId): { brushContactResistanceRatio: number; brushChatterProbabilityRatio: number } {
  return { ...BRUSH_MOTOR_CONFIG_RATIO_CANDIDATE[brushId] };
}

// 正式Fable P3-3-Q10裁定(確定、6.2〜6.3節): DestructionConfig.d05層(摩耗率・高電流
// ペナルティ)。brush-carbonをbrushWearRateRatio=1.0のanchorとし、高電流ペナルティなし。
// - brush-copper-plate: 摩耗率のみ悪化(「摩耗大」)。高電流ペナルティなし(既存の摩耗率
//   悪化で「大電流に弱い」全般傾向は既に表現されており、二重にペナルティを課さない)。
// - brush-silver-graphite: 摩耗率はanchorから変更しない(MotorConfig層コメント参照。
//   低接触抵抗という利点はMotorConfig層のみで表現する)。高電流ペナルティなし(正式Fable
//   P3-3-Q15-5裁定、確定案i: 6.3節の受け入れ表「銀黒鉛は高電流域でも摩耗率がカーボンより
//   有利」という記述は物性の発明にあたるため、表を「摩耗率はカーボンと同値、優位は
//   低接触抵抗のみ」へ精密化する側で確定した。spec/materials.ts原文が摩耗優位を
//   記述していない以上、wearRateRatio<1を写像する設計〈案ii〉は不採用)。
// - brush-precious-metal: 低電流域の摩耗率はanchorより良い値とし、6.3節の非線形性
//   (「大電流で急速に荒れる」)を高電流ペナルティとして表現する唯一の素材とする。他3素材は
//   該当描写がなくペナルティを発明しないため、ペナルティなしとする。
//
// 正式Fable P3-3-Q15-4裁定(確定、2026-08-10、人間再承認対象): 「ペナルティなし」を
// `highCurrentPenaltyThresholdA`の番兵値(999、根拠のない捏造値)で表現していた設計は、
// P3-2-Q11で同型の番兵値(閾値1000)を却下した先例と矛盾するため撤回する。D07の
// irreversible判別unionと同じ「不正状態を構築不能にする」原則に従い、
// `{ kind: 'noPenalty' }`(ペナルティ関連フィールドを一切持たない)と
// `{ kind: 'thresholdPenalty' }`(閾値・倍率を持つ、multiplier>1厳密)の判別unionへ変更した。
//
// 正式Fable P3-3-Q15-3裁定(確定): brush-precious-metalの高電流ペナルティ具体値
// (threshold=3A・multiplier=2.5)を暫定候補値として承認する。本エンジンの電流域
// (通常運用1〜2A級、held-short/失速域で数A超)に対し3Aは「通常域の上端〜虐待域の入口」に
// 座る妥当な出発点。確定はゲート5のsweepで以下3条件を満たすことによる: (i)NORMAL_OPERATION
// 構成では理論電流が閾値を超えず、貴金属が通常域で全軸最良のままであること。(ii)高負荷構成
// (M4条件2型)のスパークepisode中に理論電流が閾値を超え、貴金属の実効摩耗率(0.7×2.5=1.75)が
// カーボン・銀黒鉛(1.0)を上回る順位逆転が実測されること。(iii)副次的帰結として貴金属(1.75)が
// 銅板(1.5)をも上回り高電流域の最下位になることは承認済み表と矛盾しないが、実測時に明示的に
// 観測・報告し確定申請に記載すること(実物の貴金属接点がアーク下で破滅的に荒れるという物理と
// 整合)。不充足時の調整順は倍率より先に閾値を動かす(閾値がレジーム境界を支配するため)。
const D05_BRUSH_WEAR_CANDIDATE: Record<
  BrushMaterialId,
  { brushWearRateRatio: number; highCurrentPenalty: { kind: 'noPenalty' } | { kind: 'thresholdPenalty'; highCurrentPenaltyThresholdA: number; highCurrentPenaltyMultiplier: number } }
> = {
  'brush-carbon': { brushWearRateRatio: 1, highCurrentPenalty: { kind: 'noPenalty' } },
  'brush-copper-plate': { brushWearRateRatio: 1.5, highCurrentPenalty: { kind: 'noPenalty' } },
  'brush-silver-graphite': { brushWearRateRatio: 1, highCurrentPenalty: { kind: 'noPenalty' } },
  'brush-precious-metal': { brushWearRateRatio: 0.7, highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 3, highCurrentPenaltyMultiplier: 2.5 } },
};

/**
 * ブラシ素材→DestructionConfig.d05層(素材ごとに変わる部分のみ)の写像純関数(Record全網羅)。
 * wearPerAmpSecond等のd05共通部(素材非依存)は含まない——共通部との合成はassembleD05Configが
 * 担う(責務分離。本関数は素材依存の2フィールドのみを返す)。
 */
export function mapD05BrushWearConfig(
  brushId: BrushMaterialId,
): { brushWearRateRatio: number; highCurrentPenalty: { kind: 'noPenalty' } | { kind: 'thresholdPenalty'; highCurrentPenaltyThresholdA: number; highCurrentPenaltyMultiplier: number } } {
  return { ...D05_BRUSH_WEAR_CANDIDATE[brushId] };
}

/**
 * mapD05BrushWearConfigの素材依存部と、d05共通部(brushSparkDurationLimitS等、
 * 素材によらない較正値)を合成し、完成したDestructionConfig['d05']を返す純関数
 * (正式Fable P3-3-Q13裁定、確定候補b)。戻り値型を明示的にDestructionConfig['d05']へ
 * 注釈することで、d05に将来フィールドが追加された際、本関数がその新規フィールドを
 * 埋め忘れるとTypeScriptの型検査(戻り値の構造的部分型チェック)がコンパイル時に
 * 検出する——「共通部の埋め忘れ不能性」をテストではなく型システムで保証する設計。
 */
export function assembleD05Config(
  materialPart: { brushWearRateRatio: number; highCurrentPenalty: { kind: 'noPenalty' } | { kind: 'thresholdPenalty'; highCurrentPenaltyThresholdA: number; highCurrentPenaltyMultiplier: number } },
  commonPart: {
    brushSparkDurationLimitS: number;
    brushSparkCurrentThresholdA: number;
    wearPerAmpSecond: number;
    recoveryFrames: number;
    recoveryContactResistanceMultiplier: number;
  },
): DestructionConfig['d05'] {
  return { ...commonPart, ...materialPart };
}

// ---------------------------------------------------------------------------
// P3-4 G1a: production DestructionConfig assembler(docs/phase3-p3-4-plan.md v12 §4、
// 人間再承認一覧A/D/E該当分〈確定裁定分のみ、G1a時点でD06/D09は現行の最小形〉)。
// 人間再承認2026-08-15(A〜O、15件)。engine v12 §20.5参照。
// ---------------------------------------------------------------------------

/**
 * battery: batteryId自身のswitchでnarrowingする。各map関数は既にprofile込みの
 * 完全なBatteryDestructionConfig variantを返すため{profile,...}の再構築は不要。
 */
function resolveBatteryDestructionConfig(batteryId: BatteryMaterialId): BatteryDestructionConfig {
  switch (batteryId) {
    case 'battery-alkaline':
    case 'battery-nickel-metal-hydride':
      return mapD03DestructionConfig(batteryId);
    case 'battery-lithium-polymer':
      return mapD04BatteryDestructionConfig(batteryId);
  }
}

/**
 * d04(延焼側): bodyIdはnull非許容。G1a′ resolver(runOutcomeApplication.ts所有)が
 * EquipmentLoadout.bodyAssemblyId===nullの場合に'body-none'(実在するBodyMaterialId、
 * BODY_SCORCH_DELTA_FRACTION_CANDIDATE['body-none']===0)へ明示的に正規化してから渡す
 * 契約(§4.4、arbiter補足裁定Q1・Q2)。本関数自体はEquipmentDestructionContext.bodyIdが
 * 既に解決済みの前提で読むのみ。
 */
function resolveD04Config(equipmentContext: EquipmentDestructionContext, magnetId: MagnetMaterialId): DestructionConfig['d04'] {
  return {
    bodyScorchDeltaFraction: mapBodyScorchDeltaFraction(equipmentContext.bodyId),
    magnetScorchDeltaFraction: mapMagnetScorchDeltaFraction(magnetId),
  };
}

// D06較正値(G-R3、2026-08-19人間再承認済み)。titaniumはnonBreakableのため値を持たない
// (Record<Exclude<...>,number>により型で保証。spec §7.1「チタンは発火しない」の構造的執行)。
//
// **旧値(0.4 / 0.55 / 0.7 N·m)は構造的に到達不能だった**: engineが比較する`frame.loadTorqueNm`は
// モーター軸換算(`vehiclePhysics.ts`の`loadTorqueUsed = fContact * wheelRadius /(gearRatio * eta)`)で
// あり、`fContact`はタイヤのグリップ上限(μ×m×g)でcapされる。したがってどれほど強いモーターでも
// タイヤが伝えられる力以上の負荷はギヤを通らない。実測の両側拘束は
// **下限(NORMAL_OPERATION 15組合せ最大)=0.003080 N·m / 上限(production-valid攻め構成)=0.013544 N·m**で、
// 旧値0.4はこの上限の約30倍だった。
//
// **相対比は実素材の一次資料にアンカーする(裁定■1条件1)**: 指標は3素材で揃う**引張降伏応力**
// (曲げ強度はPOM公式資料に記載がなく揃わない)。
//   - POM  62 MPa   : Celanese公式 Hostaform POM Product Manual、ISO 527、23°C、標準未充填
//   - PA6  90 MPa   : BASF公式 Ultramid B3S Product Datasheet、ISO 527-1/-2、23°C、50 mm/min、未充填
//                     (**dry値**。conditioned 45 MPaは採用しない——現行モデルは湿度状態を持たず、
//                      吸湿差をランタイムへ持ち込むとスコープを拡大するため。実機では吸湿により
//                      大幅に低下しうる点を承知のうえでの設計上の割り切り〈designAssumption〉。
//                      なお本値はSuu_mot3が公式資料本文で確認した値であり、alice_mot3側は当該PDFが
//                      画像のみ〈テキスト層なし・暗号化〉のため独立確認できていない)
//   - PEEK 98.0 MPa : Victrex公式 PEEK 450G Datasheet、ISO 527-2、23°C、未充填
//   比 62 : 90 : 98 = 1 : 1.4516… : 1.5806…(採用値の比率誤差 PA6 0.027% / PEEK 0.041%)
//
// **絶対スケールは衝撃・疲労換算係数80のdesignAssumption(裁定■1条件2)**:
//   実効閾値 = 静的強度相当値(POM 0.4 N·m) ÷ 80。
//   実世界の歯欠けは定常トルクではなく、ジャム・衝突・急停止でミリ秒に集中する**過渡衝撃**と疲労で
//   起こる。simの`loadTorqueNm`は定常量なので、これを実物の静的強度と直接比較する限りD06は物理的に
//   正しく「発火しない」。係数80はその過渡増幅を1つの明示的な数値へ抽象化したものであり、
//   **「POMの歯が静的0.005 N·mで折れる」という主張ではない**。値自体はP3-3-Q15-1の較正値
//   ディシプリンに従い、体感の最終較正はG5で行う。
const GEAR_STRENGTH_THRESHOLD_NM: Record<Exclude<GearMaterialId, 'gear-titanium'>, number> = {
  'gear-pom': 0.005,
  'gear-nylon-pa6': 0.00726,
  'gear-peek': 0.0079,
};

/**
 * ギヤ材質→DestructionConfig.d06(G1a時点の現行最小形{breakage}のみ、docs v12 §6.3)の
 * 写像純関数。他のmapD0X…関数(mapD03・mapD04Battery・mapD07)と同じ規律で、対応する
 * 状態機械(advanceD06)の実装より先に書く——advanceD06はP3-4 G3で追加される(現状fixture・
 * gameStore配線いずれも無し、本関数はG1a時点では未消費)。G3でDestructionConfig.d06が
 * toothFatigueExposureNmS等へ拡張される際(人間再承認一覧D)、本関数も合わせて改訂する。
 */
// P3-4 G3較正値(計画§9.1 R6確定裁定の候補b、G-R3で再較正、2026-08-19人間再承認済み)。
// 歯1本を失うのに必要な累積曝露(N·m·s)。この単一の閾値で崩壊速度を直接制御する。
//
// **旧値0.5はGEAR_STRENGTH_THRESHOLD_NMと同じスケール誤りを共有していた**: 閾値が0.005級へ
// 下がると超過分も同スケール(最大0.0085程度)になるため、旧値0.5では1本目まで約59秒を要し、
// 計画§9(2)の「1本目まで0.5〜10秒」を大きく外れる。G-R3で同一デルタ内の再較正対象とした。
//
// **0.0100での理論1本目時間**(上限0.013544 N·m持続時、alice_mot3実測・Suu_mot3照合済み):
//   POM 約1.170秒(140 step)/ PA6 約1.591秒(191 step)/ PEEK 約1.772秒(213 step)
//   ——いずれも0.5〜10秒内で、強い素材ほど遅く壊れる順序も保たれる。**体感の最終較正はG5**。
const TOOTH_FATIGUE_EXPOSURE_NM_S_CANDIDATE = 0.01;

export function mapD06DestructionConfig(gearId: GearMaterialId): { breakage: GearBreakageProfile; toothFatigueExposureNmS: number } {
  const toothFatigueExposureNmS = TOOTH_FATIGUE_EXPOSURE_NM_S_CANDIDATE;
  // チタンはspec §7.1.1「チタンは発火しない」によりnonBreakable。曝露閾値自体は型の全域性の
  // ため常に持たせるが、advanceD06はnonBreakableの時点で発火判定へ進まないため消費されない。
  if (gearId === 'gear-titanium') return { breakage: { kind: 'nonBreakable' }, toothFatigueExposureNmS };
  return { breakage: { kind: 'breakable', gearStrengthThresholdNm: GEAR_STRENGTH_THRESHOLD_NM[gearId] }, toothFatigueExposureNmS };
}

// D09較正値(§17.3、判定文§9(3)で候補承認済み、確定はG5較正sweep+人間commit承認)。
// P3-4 G4再較正(2026-08-19人間承認、承認原文は下記)。到達可能性の両側拘束sweepにより、
// 旧候補値(limit 1.0 / 0.2 N·m / 3000 rpm)は**構造的に到達不能**であることが実測で判明したため、
// **production素材写像経路での構成組み立て**(resolveGarageBuild→
// resolveProductionMaterialCompositionBaseline→composeConfigFromMaterials)による実測に
// 基づく値へ再較正した。**この「経路」は構成の組み立て経路であり、走行入口
// (startCourseRun→stepCourseRun)を意味しない。**
//
// 人間承認原文: 「D09 G4再較正の有限バンドルを承認します。loadTorqueThresholdNm=0.005 N·m、
// rpmThreshold=400 rpm、bearingSeizureGaugeLimit=0.15をproductionへ反映してください。
// 熱係数・入力式・公開契約は変更せず、feature gate=falseを維持し、G5以降・commit・tag・push・
// default true化は禁止します。」
//
// 実測根拠(両側拘束):
//  - 下限: NORMAL_OPERATION基準構成×実在5コース×全3電池=15組合せで到達ゲージは厳密に0
//    (通常運用の包絡線は最大|loadTorqueNm| 0.003464 N·m・最大車軸rpm 309.6であり、閾値の
//    下余裕はトルク1.44倍・rpm 1.29倍)。金属接触経路(チタン)15組合せの最大ゲージは
//    0.059694で、limit 0.15に対する安全余裕は2.51倍。
//  - 上限: 攻めたproduction-valid構成288組合せ中66件がtriggered到達(62件はfinished終端)。
//    到達ゲージ上限はPOM 0.252160(上余裕1.68倍)・チタン 0.570387(3.80倍)。
//
// **上記数値の測定条件(証跡区分、台帳改訂24-補)**: いずれもengine層のno-noise harness
// (wrapper非経由・RNG=`()=>0.5`固定)での測定であり、production入口の測定ではない。
// 正典run RNG(mulberry32)での再測定では、NORMAL_OPERATIONはPOM 45走行・チタン45走行とも
// 発火0件(最大ゲージ0 / 0.059694)、攻め構成はPOM 6/576・チタン 87/576が発火し、
// **両側拘束は維持されている**。production入口でのPOM正例はclosedStep 333・
// terminalModes ["D09"]・ratio 0.15030281668535994(詳細は台帳改訂24-補)。
//
// **D06との同値は偶然の一致である**: 本閾値0.005 N·mはD06のPOM閾値
// (`GEAR_STRENGTH_THRESHOLD_NM['gear-pom']`)と同値だが、共通のloadTorqueNmスケール上で
// 独立に較正した結果であり、D06値を参照していない(D09側は通常運用包絡線0.003464 N·mに対する
// 下余裕1.44倍から決めた)。**将来どちらか一方だけを変更してよい。**
//
// **これはG4暫定較正であり、G5最終較正を先取りするものではない**(Q15-1恒久規則により
// 最終確定はG5較正sweep+人間commit承認を要する)。
const BEARING_SEIZURE_GAUGE_LIMIT_CANDIDATE = 0.15;
// P3-4 G4較正値(§17.3、判定文§9(3)で候補承認済み。確定はG5較正sweep+人間commit承認)。
const D09_THERMAL_CONDUCTION_COEFFICIENT_CANDIDATE = 0.25; // 無次元/秒、D07確定値と同オーダー
const D09_THERMAL_DISSIPATION_COEFFICIENT_CANDIDATE = 0.5; // 同上
const D09_LOAD_TORQUE_THRESHOLD_NM_CANDIDATE = 0.005; // N·m(モーター軸換算、frame.loadTorqueNmと同軸。G4再較正)
const D09_RPM_THRESHOLD_CANDIDATE = 400; // rpm(車軸換算、§7.4 R15規約は不変。G4再較正)
const D09_GEAR_SEIZURE_DELTA_FRACTION = 0.15; // 無次元(0-1)、1回の終端でgearのseizureFractionを進める量
const D09_BEARING_SEIZURE_DELTA_FRACTION = 0.2; // 同上(軸受はgearより直接的被害を受ける設計意図)

/**
 * 金属ギヤか否か(D09の金属接触経路、spec §7.1「金属ギヤかじり含む」)。
 * **engineは素材IDを知らない**ため、ここでbooleanへ写像してconfigへ載せる(leaf規則の維持)。
 * 現行4素材のうち金属はチタンのみで、他3種は樹脂(POM/PA6/PEEK)である。
 */
const METAL_GEAR_IDS: ReadonlySet<GearMaterialId> = new Set<GearMaterialId>(['gear-titanium']);

/**
 * DestructionConfig.d09(P3-4 G4で§7.2の最終形へ拡張)の写像純関数。
 * G1a時点はbearingSeizureGaugeLimitのみの最小形で、gearIdは未消費だった(シグネチャを先に
 * 固定し破壊的変更を避ける設計)。G4で metalGearContactAlways 等へ拡張し、gearIdを実際に消費する。
 */
export function mapD09DestructionConfig(gearId: GearMaterialId): DestructionConfig['d09'] {
  return {
    thermal: {
      conductionCoefficient: D09_THERMAL_CONDUCTION_COEFFICIENT_CANDIDATE,
      dissipationCoefficient: D09_THERMAL_DISSIPATION_COEFFICIENT_CANDIDATE,
    },
    bearingSeizureGaugeLimit: BEARING_SEIZURE_GAUGE_LIMIT_CANDIDATE,
    // gearIdはここで初めて消費される(G1a時点は未消費のままシグネチャのみ固定していた)。
    metalGearContactAlways: METAL_GEAR_IDS.has(gearId),
    highLoadHighSpeed: {
      loadTorqueThresholdNm: D09_LOAD_TORQUE_THRESHOLD_NM_CANDIDATE,
      rpmThreshold: D09_RPM_THRESHOLD_CANDIDATE,
    },
    gearSeizureDeltaFraction: D09_GEAR_SEIZURE_DELTA_FRACTION,
    bearingSeizureDeltaFraction: D09_BEARING_SEIZURE_DELTA_FRACTION,
  };
}

/**
 * EquipmentDestructionContext: assembleDestructionConfigが必要とする、MaterialSelection
 * (5フィールド、素材購入選択)に含まれない装備由来の追加コンテキスト(docs v12 §4.4)。
 */
export interface EquipmentDestructionContext {
  /**
   * null不可。alice提供のG1a′ resolver(`deriveMaterialSelectionFromEquipment`相当、
   * src/store/runOutcomeApplication.ts所有)が未装備時に'body-none'へ正規化してから渡す
   * (arbiter補足裁定HB-DEC-011ケースA Q1・Q2により精密化。旧v12までの
   * 「呼び出し側〈brabit〉が正規化」という記述は、独立resolverの新設に伴い訂正した——
   * interface自体の型・フィールドは無変更、正規化の実施主体のみの変更)。
   */
  bodyId: BodyMaterialId;
}

/**
 * production DestructionConfig全体のassembler(docs v12 §4.2、確定-2でalice/materials-store
 * 境界所有と裁定済み)。total pure function(Result型なし)——全入力(MaterialSelection・
 * EquipmentDestructionContext)は既に型システムで閉じた合法な値であることが保証されている
 * (各IDはunion型)。composeConfigFromMaterialsがResult型を持つ理由はbaseMotorConfig/
 * baseCarConfigという「任意の数値」を受け取り範囲外を検出する必要があるためだが、本関数は
 * 数値レンジの外部入力を一切受け取らない(全フィールドが列挙型IDからの決定的な写像)。
 *
 * G1a時点の注記: d06/d09は現行のDestructionConfig最小形(§6.3・§7.2、mapD06/mapD09
 * DestructionConfig参照)を返す——G3/G4での型拡張(人間再承認一覧D/E)に伴い、本関数の
 * 戻り値もそれぞれのゲートで追従する。UI側からの呼び出し契機・呼び出し禁止事項(確定-2:
 * UI/gameStoreが個別mapXxx…を独自再構成することは禁止)はG1b以降の配線時に適用される。
 */
export function assembleDestructionConfig(selection: MaterialSelection, equipmentContext: EquipmentDestructionContext): DestructionConfig {
  return {
    battery: resolveBatteryDestructionConfig(selection.batteryId),
    d01: D01_CALIBRATION,
    d02: D02_CALIBRATION,
    d04: resolveD04Config(equipmentContext, selection.magnetId),
    d05: assembleD05Config(mapD05BrushWearConfig(selection.brushId), D05_COMMON_CALIBRATION),
    d06: mapD06DestructionConfig(selection.gearId),
    d07: mapD07DestructionConfig(selection.magnetId),
    d09: mapD09DestructionConfig(selection.gearId),
  };
}
