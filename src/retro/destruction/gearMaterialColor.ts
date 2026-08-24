// P3-4 G7-D(art-spec §6「D06破片は素材色」): ギヤ素材→PaletteKeyの有限写像と、
// その正典入力の解決。**2026-08-20 人間承認済み**(写像4件+正典入力候補A+spawn時焼き付け)。
//
// 既定色での代用はしない——「素材色」と定めた契約に対し、どの素材でも同じ色を出すのは
// 症状の取り違えを誘発する(spec §1.2)。
import type { GearMaterialId } from '../../materials/materialMapping';
import type { PaletteKey } from '../palette';
import type { EquipmentIdSnapshot } from '../../store/runOutcomeApplication';
import type { InventoryItem, PlayerInventory } from '../../materials/inventoryItem';

/**
 * 4素材→PaletteKeyの有限表(人間承認済み)。
 * 明度が単調に下がる並びなので、色覚特性によらず階調だけでも区別できる。
 */
export const GEAR_MATERIAL_PALETTE_KEY: Record<GearMaterialId, PaletteKey> = {
  'gear-pom': 'N6',          // 乳白色の樹脂
  'gear-nylon-pa6': 'W3',    // 生成り(象牙色)
  'gear-peek': 'W2',         // 琥珀〜タン
  'gear-titanium': 'N4',     // 金属灰
};

/**
 * 走行中に使うギヤ素材色を解決する(正典入力=候補A、人間承認済み)。
 *
 * 出典は**run開始時に固定される**`pendingRunEquipmentSnapshot`であり、生きた
 * `equipmentLoadout`ではない——走行中の装備変更で破片の色が変わらないようにするため。
 * `RunSnapshot`の拡張も`recipeKey`のparseも行わない。
 *
 * motor-only文脈は`gearItemId`がnullだが、D06はmotor-onlyでは構造的に発生しない
 * (UI計画§18)ため、この経路で色が欠けることはない。
 */
export function resolveGearMaterialColorKey(
  snapshot: EquipmentIdSnapshot | null,
  inventory: PlayerInventory,
): PaletteKey | null {
  if (snapshot === null || snapshot.context !== 'vehicle') return null;
  // findの述語を型ガードにしておく——family判定だけでは戻り値がunionのままで、
  // materialIdがgear以外のIDも含む型になる。
  const gear = inventory.items.find(
    (item): item is Extract<InventoryItem, { family: 'gear' }> =>
      item.itemId === snapshot.gearItemId && item.family === 'gear',
  );
  if (gear === undefined) return null;
  return GEAR_MATERIAL_PALETTE_KEY[gear.materialId];
}
