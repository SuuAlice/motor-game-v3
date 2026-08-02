// Phase2 UI仮経済のZustand hook。状態遷移ロジック自体はshopEconomy.tsの純関数に
// 委ね、ここでは呼び出しと直近操作結果(エラーメッセージ・直近サルベージ額)の保持のみを行う
// (Fable推奨: 経済規則をhookへ直接埋め込まない)。
//
// P3-0サブステップ3(docs/phase3-p3-0-plan.md v7 8.3節)により、永続化はsaveStore.ts
// (v16:save、inventory/equipmentLoadoutスライス)へ移管した。従来は「意図的に persist
// ミドルウェアを使わない(reloadのたびにcreateInitialShopEconomyState()の固定フィクスチャへ
// 戻る)」仕様だったが、P3-0で店・在庫は本物の永続個体を扱う対象になったため、この非永続
// 方針は終了する。購入・サルベージの実処理・lease事前ゲート・装備保護規則(1.2節)・
// bearing自動生成/自動削除(1.4節)はsaveStore.ts側のaction(brabit_mot3実装)が担う。
// 本ファイルはUI互換のための薄い反応的ビュー+action委譲層として残す。
import { create } from 'zustand';
import { previewSalvage, type ShopEconomyState } from './shopEconomy';
import { useSaveStore } from './saveStore';
import type { InventoryItem } from '../materials/inventoryItem';
import type { MaterialId } from '../materials/materials';
import type { CartLine } from './shopEconomy';

function deriveShopEconomyState(): ShopEconomyState {
  const s = useSaveStore.getState();
  return { ...s.inventory, nextSessionIdCounter: s.idCounters.nextItemCounter };
}

interface ShopEconomyStore {
  state: ShopEconomyState;
  lastErrorJa: string | null;
  lastSalvageAmountG: number | null;
  purchase: (materialId: MaterialId) => void;
  /** 成功/失敗をUIへ返す。呼び出し側(ShopScreen.tsx)はtrueのときだけカートを空にする。 */
  purchaseCart: (cartLines: readonly CartLine[]) => boolean;
  salvage: (itemId: string) => void;
  clearLastError: () => void;
}

export const useShopEconomyStore = create<ShopEconomyStore>()((set) => ({
  state: deriveShopEconomyState(),
  lastErrorJa: null,
  lastSalvageAmountG: null,

  purchase: (materialId) => {
    const result = useSaveStore.getState().purchaseMaterialAction(materialId);
    if (!result.ok) {
      set({ lastErrorJa: result.reason });
      return;
    }
    set({ lastErrorJa: null });
  },

  purchaseCart: (cartLines) => {
    const result = useSaveStore.getState().purchaseCartAction(cartLines);
    if (!result.ok) {
      set({ lastErrorJa: result.reason });
      return false;
    }
    set({ lastErrorJa: null });
    return true;
  },

  salvage: (itemId) => {
    const result = useSaveStore.getState().salvageAction(itemId);
    if (!result.ok) {
      set({ lastErrorJa: result.reason });
      return;
    }
    set({ lastErrorJa: null, lastSalvageAmountG: result.amountG });
  },

  clearLastError: () => set({ lastErrorJa: null }),
}));

useSaveStore.subscribe(() => {
  useShopEconomyStore.setState({ state: deriveShopEconomyState() });
});

/** サルベージ確認ダイアログ表示用。呼び出し側でcomputeSalvageRateのok:falseを事前に検知できる。 */
export function previewSalvageFor(item: InventoryItem) {
  return previewSalvage(item);
}
