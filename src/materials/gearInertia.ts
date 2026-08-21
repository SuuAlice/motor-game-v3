// P3-4 G3(docs/phase3-p3-4-plan.md §10.4)。ギヤの回転慣性Jを共通幾何+密度から導出する
// 純関数群。`assumedGeometry.ts`と同型の設計原則に従う——現行`assumedGeometry.ts`はgearを
// 明示的に除外しており(同ファイル16-18行)、本ファイルが初めてその空白を埋める。
//
// **pending密度を黙って代用しない**: `resolveDensity`(assumedGeometry.ts)と同じ規律で、
// 密度が未検証(pending)の素材については明示的に失敗を返す。数値を発明しない。

import { GEAR_MATERIALS, type GearMaterial } from './materials';
import type { GearMaterialId } from './materialMapping';

/**
 * 密度の出所(assumedGeometry.tsの`DensityProvenance`と同型の規律)。
 * - `catalogVerified`: materials.tsが一次資料確認済み(verified)として持つ値。
 * - `designAssumption`: materials.ts側はpendingのまま、**本写像層が設計仮定として採る値**。
 *   materials.tsのpendingは書き換えない(カタログの真実性を汚さない)。
 */
export type GearDensityProvenance = 'catalogVerified' | 'designAssumption';

/**
 * 写像層でのみ採る設計仮定の密度(kg/m³)。**materials.tsのpendingは書き換えない**
 * (カタログの真実性を汚さない)。`assumedGeometry.ts`の`designAssumption`前例と同じ位置づけ。
 *
 * **現在の対象はPA6のみ**(Ti-6Al-4V・POMはR14(c)の一次資料検証によりmaterials.ts側でverified、
 * PEEKは従来からverified)。
 *
 * **PA6=1130の出所と昇格条件**: BASF公式配布ホストのUltramid B3Sデータシート(ISO 1183)本文表示を
 * Suu_mot3が確認した報告に基づく。同PDFは画像のみ(テキスト層なし・暗号化)でalice_mot3環境では
 * 機械的に本文検証できないため、verifiedとせずdesignAssumptionとして扱うことを人間が承認した
 * (2026-08-19)。**テキスト抽出可能な公式資料が得られた時点でmaterials.tsをverifiedへ昇格させ、
 * 本表から削除する**のが終着点である。経緯の全文はdocs/phase3-p3-4-plan.md §20.11を参照。
 */
const GEAR_DENSITY_DESIGN_ASSUMPTION_KG_M3: Partial<Record<GearMaterialId, number>> = {
  'gear-nylon-pa6': 1130,
};

/**
 * ギヤを一様円板として近似する設計仮定値(§17数値候補、判定文§9(5)で候補承認済み)。
 * 確定はG5較正sweep実測+人間commit承認(Q15-1恒久規則)。実測値ではなく設計仮定である。
 */
export const GEAR_ASSUMED_RADIUS_M = 0.008;
export const GEAR_ASSUMED_THICKNESS_M = 0.003;

/**
 * ギヤの体積 [m³](一様円板近似 π r² t)。**J経路と質量経路の唯一の幾何出典**(DoD-C8-a)。
 * 両経路がこのhelperを共有することで、幾何定数の重複記述と経路間のずれを構造的に排除する。
 */
function gearVolumeM3(): number {
  return Math.PI * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_THICKNESS_M;
}

export type GearInertiaResolution =
  | { ok: true; value: number; provenance: GearDensityProvenance }
  | { ok: false; reason: string };

/** 密度の解決(verified優先、次に設計仮定、いずれも無ければ失敗)。数値を発明しない。 */
function resolveGearDensityKgM3(gear: GearMaterial): { ok: true; value: number; provenance: GearDensityProvenance } | { ok: false; reason: string } {
  if (gear.density.verifiedForPhysics) {
    if (!Number.isFinite(gear.density.value) || gear.density.value <= 0) {
      return { ok: false, reason: `${gear.id}: 密度が有限正の値ではありません: ${gear.density.value}` };
    }
    return { ok: true, value: gear.density.value, provenance: 'catalogVerified' };
  }
  const assumed = GEAR_DENSITY_DESIGN_ASSUMPTION_KG_M3[gear.id as GearMaterialId];
  if (assumed !== undefined) {
    return { ok: true, value: assumed, provenance: 'designAssumption' };
  }
  return { ok: false, reason: `${gear.id}: 密度が未検証(pending)で設計仮定も持たないためJを計算できません(${gear.density.reason})` };
}

/**
 * ギヤ自身の軸上での回転慣性(actual、reflectedではない)。
 *
 * 一様円板の慣性モーメント `J = (1/2) m r²`。質量は密度×体積で、体積は円板 `π r² t`。
 * 密度がpending(未検証)の素材では明示的に`ok:false`を返す(黙って代用しない)。
 */
export function resolveGearActualInertiaKgM2(gear: GearMaterial): GearInertiaResolution {
  const density = resolveGearDensityKgM3(gear);
  if (!density.ok) return density;
  const massKg = density.value * gearVolumeM3(); // 共通の幾何出典(DoD-C8-a)
  return { ok: true, value: 0.5 * massKg * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_RADIUS_M, provenance: density.provenance };
}

/**
 * actual J(ギヤ軸上)をreflected J(モーター軸換算)へ変換する(§10.3、R13確定裁定)。
 *
 * `J_reflected = J_actual / gearRatio²`。既存`jEff`が車体質量を
 * `massKg*wheelRadius²/gearRatio²`としてモーター軸へ反射しているのと同じ位置(車軸側)に
 * ギヤが存在するため、同じ`1/gearRatio²`則で反射する。
 *
 * **etaで除算しない(R13)**: 質量反射項は`/(gearRatio²*eta)`だが、慣性(回転エネルギーの貯蔵)は
 * etaが表す伝達損失(散逸)とは別の物理現象であり、`jMotor`と同じくetaを適用しない。
 * また本値はcapture時固定のスカラーであるため、etaを焼き込むとD06劣化でetaがstep毎に変動する
 * 際に「古いeta」が固定される不整合を生む。
 */
export function resolveGearReflectedInertiaKgM2(gear: GearMaterial, gearRatio: number): GearInertiaResolution {
  if (!Number.isFinite(gearRatio) || gearRatio <= 0) {
    return { ok: false, reason: `${gear.id}: gearRatioが有限正の値ではありません: ${gearRatio}` };
  }
  const actual = resolveGearActualInertiaKgM2(gear);
  if (!actual.ok) return actual;
  return { ok: true, value: actual.value / (gearRatio * gearRatio), provenance: actual.provenance };
}

/**
 * ギヤ族のanchorティア(`isBaselineAnchor === true`)を解決する。
 * `assumedGeometry.ts`の`resolveAnchorWireMaterial`/`resolveAnchorMagnetMaterial`と同型の規律で、
 * **素材IDをハードコードせずmaterials.tsの宣言から解決する**(G-R1指定)。
 */
export function resolveAnchorGearMaterial(): { ok: true; material: GearMaterial } | { ok: false; reason: string } {
  const anchor = GEAR_MATERIALS.find((m) => m.isBaselineAnchor);
  if (!anchor) return { ok: false, reason: 'ギヤファミリーにanchorティアが定義されていません(materials.tsの不整合)' };
  return { ok: true, material: anchor };
}

/**
 * ギヤの実質量 [g](一様円板近似、J経路と**同一の幾何定数を単一出典として**共有する)。
 * mass = 密度 × 体積、体積 = π r² t。単位はkg→gのため×1000。
 */
function resolveGearMassG(gear: GearMaterial): { ok: true; value: number } | { ok: false; reason: string } {
  const density = resolveGearDensityKgM3(gear);
  if (!density.ok) return density;
  return { ok: true, value: density.value * gearVolumeM3() * 1000 }; // 同上、同一helperを共有
}

/**
 * 装備ギヤとanchor(POM)の実質量差 [g](P3-4 G3 G-R1、人間再承認済み2026-08-19)。
 *
 * **なぜ絶対質量ではなく差分か**: V2の`chassisBaselineG`(標準シャーシ110g+電池)は標準ギヤを
 * **暗黙に包含している**——`partPresets.ts`の`GEAR_PRESETS`は質量項を持たず、`massG`は
 * `chassis.baseMassG + battery.massG`のみで合成される(実装事実、alice_mot3実測)。ギヤは走行に
 * 不可欠でありながらどこにも独立計上されていないため、110gが一式(ギヤ込み)の質量である。
 * したがって絶対質量を加算すると二重計上になる。**anchor装備時は差分0**でV2回帰を厳密に保つ。
 *
 * 幾何はJ経路(`resolveGearActualInertiaKgM2`)と同一定数を共有し、同値リテラルを重複させない。
 */
export function resolveGearMassDeltaG(gear: GearMaterial): { ok: true; value: number } | { ok: false; reason: string } {
  const anchor = resolveAnchorGearMaterial();
  if (!anchor.ok) return anchor;
  const equipped = resolveGearMassG(gear);
  if (!equipped.ok) return equipped;
  const base = resolveGearMassG(anchor.material);
  if (!base.ok) return base;
  return { ok: true, value: equipped.value - base.value };
}

/** 素材IDからの質量差分解決。未登録IDは`ok:false`。 */
export function resolveGearMassDeltaGById(gearId: GearMaterialId): { ok: true; value: number } | { ok: false; reason: string } {
  const gear = GEAR_MATERIALS.find((m) => m.id === gearId);
  if (!gear) return { ok: false, reason: `${gearId}: 未登録のギヤ素材IDです` };
  return resolveGearMassDeltaG(gear);
}

/** 素材IDからの解決(呼び出し側の利便のため)。未登録IDは`ok:false`。 */
export function resolveGearReflectedInertiaKgM2ById(gearId: GearMaterialId, gearRatio: number): GearInertiaResolution {
  const gear = GEAR_MATERIALS.find((m) => m.id === gearId);
  if (!gear) return { ok: false, reason: `${gearId}: 未登録のギヤ素材IDです` };
  return resolveGearReflectedInertiaKgM2(gear, gearRatio);
}
