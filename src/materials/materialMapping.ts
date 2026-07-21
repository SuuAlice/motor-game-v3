// 素材(+個体劣化状態)→既存engine/パラメータへの純関数写像(spec §4.3)。
// engine/本体は素材を知らない。本ファイルはStep3として、ギヤ材質の効率比率(設計較正値)
// のみを実装する。導線・電池等の写像はStep5(engine拡張)・Step7で追加する。
//
// docs/phase2-plan.md §16 Step3。2026-07-22 Suu承認。

import { GEAR_MATERIALS, type GearMaterial } from './materials';

export type GearMaterialId = (typeof GEAR_MATERIALS)[number]['id'];

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
