// 素材(+個体劣化状態)→既存engine/パラメータへの純関数写像(spec §4.3)。
// engine/本体は素材を知らない。本ファイルはStep3(ギヤ材質の効率比率)・Step4(磁石材質の
// magnetStrength較正値)・Step7a(導線ratio・合成写像)を実装する。電池の写像はStep7bで
// 追加する(docs/phase2-plan.md §16、docs/phase2-step7-plan.md v4)。
//
// docs/phase2-plan.md §16 Step3・Step4・Step7。2026-07-22 Suu_mot3承認・Fable技術レビュー承認。

import {
  resolveAnchorWireMaterial,
  resolveWireDensity,
  computeWireMagnetMassAdjustmentG,
  applyMassAdjustmentToBaselineG,
  type WindingParams,
} from './assumedGeometry';
import { GEAR_MATERIALS, MAGNET_MATERIALS, WIRE_MATERIALS, type GearMaterial, type MagnetMaterial, type WireMaterial } from './materials';
import type { MotorConfig } from '../engine/motorPhysics';
import type { CarConfig } from '../engine/vehiclePhysics';

export type GearMaterialId = (typeof GEAR_MATERIALS)[number]['id'];
export type MagnetMaterialId = (typeof MAGNET_MATERIALS)[number]['id'];
export type WireMaterialId = (typeof WIRE_MATERIALS)[number]['id'];

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

// Step7aのMaterialSelectionはbatteryIdを含めない(Suu_mot3最終レビュー指摘、
// docs/phase2-step7-suu-review-v3.md §2、Fable承認済みQ6)。有効な入力を受理しながら
// 結果へ反映しない契約は原子的Result契約と矛盾するため。電池較正値と実装が揃うStep7bで、
// 型追加(batteryId)と実装追加を同時に行う。
export interface MaterialSelection {
  wireId: WireMaterialId;
  magnetId: MagnetMaterialId;
  gearId: GearMaterialId;
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
    },
    carConfig: {
      ...baseCarConfig,
      gearEfficiency: gearEfficiency.efficiency,
      massG: massG.massG,
    },
  };
}
