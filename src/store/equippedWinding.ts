// Phase 4 P4-1B(2026-08-30人間承認、担当A2): 装備中ローターの巻線記録を引く**単一出典**。
//
// 同じ突合せ(`equipmentLoadout.rotorAssemblyId` × `inventory.rotorAssemblies`)が
// recipeKey構築・走行構築・レシピ共有UIの3箇所で必要になる。引き方が分かれると、
// **recipeKeyと共有レシピが別の記録を参照する**という静かな不整合が起きうるため、
// ここへ閉じて全員が同じ関数を見る。
//
// 新規store state・公開action・公開型は追加しない(承認項目A2-1)。既存の
// `PlayerInventory`/`EquipmentLoadout`を受け取る純関数1本だけを置く。

import type { PlayerInventory } from '../materials/inventoryItem';
import type { WindingRecord } from '../materials/windingRecord';
import type { EquipmentLoadout } from './runOutcomeApplication';

/**
 * 装備中ローターの巻線記録を返す。**記録が無い場合は正直に`null`**を返す:
 * - 装備IDに対応するローター個体が見つからない(壊れたloadout)
 * - 個体がlegacy由来(旧セーブ。記録が存在しなかった事実をそのまま表す)
 *
 * 見つからない場合に既定の記録を返したり、他の個体で代用したりはしない——
 * 代用すると、実際には装備していないローターの記録でレシピやrecipeKeyが作られる。
 */
export function selectEquippedWindingRecord(
  inventory: PlayerInventory,
  loadout: EquipmentLoadout,
): WindingRecord | null {
  const rotor = inventory.rotorAssemblies.find((r) => r.assemblyId === loadout.rotorAssemblyId);
  if (rotor === undefined) return null;
  return rotor.winding.kind === 'recorded' ? rotor.winding.record : null;
}
