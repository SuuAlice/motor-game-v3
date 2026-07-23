// Phase2 UI仮経済のZustand hook。状態遷移ロジック自体はshopEconomy.tsの純関数に
// 委ね、ここでは呼び出しと直近操作結果(エラーメッセージ・直近サルベージ額)の保持のみを行う
// (Fable推奨: 経済規則をhookへ直接埋め込まない)。
//
// 意図的に`persist`ミドルウェアを使わない(docs/phase2-ui-shop-plan.md v4 §7・
// Fable回答1)。ページreloadのたびにcreateInitialShopEconomyState()の固定
// フィクスチャへ戻る。既存gameStore.tsの`v15:`永続化慣例にも乗らない。
import { create } from 'zustand';
import {
  confirmSalvage,
  createInitialShopEconomyState,
  previewSalvage,
  purchaseCart,
  purchaseMaterial,
  type CartLine,
  type ShopEconomyState,
} from './shopEconomy';
import type { InventoryItem } from '../materials/inventoryItem';
import type { MaterialId } from '../materials/materials';

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
  state: createInitialShopEconomyState(),
  lastErrorJa: null,
  lastSalvageAmountG: null,

  purchase: (materialId) =>
    set((s) => {
      const result = purchaseMaterial(s.state, materialId);
      if (!result.ok) return { lastErrorJa: result.reason };
      return { state: result.state, lastErrorJa: null };
    }),

  purchaseCart: (cartLines) => {
    let succeeded = false;
    set((s) => {
      const result = purchaseCart(s.state, cartLines);
      if (!result.ok) return { lastErrorJa: result.reason };
      succeeded = true;
      return { state: result.state, lastErrorJa: null };
    });
    return succeeded;
  },

  salvage: (itemId) =>
    set((s) => {
      const result = confirmSalvage(s.state, itemId);
      if (!result.ok) return { lastErrorJa: result.reason };
      return { state: result.state, lastErrorJa: null, lastSalvageAmountG: result.amountG };
    }),

  clearLastError: () => set({ lastErrorJa: null }),
}));

/** サルベージ確認ダイアログ表示用。呼び出し側でcomputeSalvageRateのok:falseを事前に検知できる。 */
export function previewSalvageFor(item: InventoryItem) {
  return previewSalvage(item);
}
