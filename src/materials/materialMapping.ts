// 素材(+個体劣化状態)→既存engine/パラメータへの純関数写像(spec §4.3)。
// engine/本体は素材を知らない。本ファイルはStep3(ギヤ材質の効率比率)・Step4(磁石材質の
// magnetStrength較正値)を実装する。導線・電池等の写像はStep5(engine拡張)・Step7で追加する。
//
// docs/phase2-plan.md §16 Step3・Step4。2026-07-22 Suu承認。

import { GEAR_MATERIALS, MAGNET_MATERIALS, type GearMaterial, type MagnetMaterial } from './materials';

export type GearMaterialId = (typeof GEAR_MATERIALS)[number]['id'];
export type MagnetMaterialId = (typeof MAGNET_MATERIALS)[number]['id'];

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
 * CarConfigへの実接続(既存gearRatioプリセットとの結線)はStep7で行う。本関数は
 * その合成ロジックのみを先行提供する純関数であり、ここではCarConfig/engine/には触れない。
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
 * 磁石材質→magnetStrength較正値のテーブル参照純関数。MotorConfig.magnetStrengthへの実接続
 * (CarRecipe生成)はStep7で行う。ここでは較正値の算出のみを提供する。
 */
export function computeMagnetStrengthCalibration(magnet: MagnetMaterial): MagnetStrengthCalibrationResult {
  const magnetStrength = MAGNET_STRENGTH_CALIBRATION[magnet.id as MagnetMaterialId];
  if (magnetStrength === undefined) {
    return { ok: false, reason: `${magnet.id}: 較正値テーブルに未登録の素材IDです` };
  }
  return { ok: true, magnetStrength };
}
