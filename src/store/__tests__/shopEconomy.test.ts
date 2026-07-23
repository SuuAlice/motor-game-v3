import { describe, expect, it } from 'vitest';
import {
  FIXTURE_ID_PREFIX,
  INITIAL_CASH_G,
  PURCHASABLE_FAMILIES,
  SESSION_ID_PREFIX,
  buildInventoryRows,
  canAffordPurchase,
  computeSalvageAmountG,
  confirmSalvage,
  createInitialShopEconomyState,
  findMaterialForItem,
  isFiniteNonNegativeInteger,
  isPurchasableFamily,
  previewSalvage,
  previewSalvageForMaterial,
  purchaseMaterial,
  type ShopEconomyState,
} from '../shopEconomy';
import type { InventoryItem, StackableStockEntry } from '../../materials/inventoryItem';
import { ALL_MATERIALS, type Material } from '../../materials/materials';

function materialOf(id: string) {
  const material = ALL_MATERIALS.find((m) => m.id === id);
  if (!material) throw new Error(`fixture material not found: ${id}`);
  return material;
}

describe('createInitialShopEconomyState', () => {
  it('固定フィクスチャの所持金・在庫・IDカウンタを返す', () => {
    const state = createInitialShopEconomyState();
    expect(state.cashG).toBe(INITIAL_CASH_G);
    expect(state.items).toHaveLength(4);
    expect(state.stackableStock).toHaveLength(2);
    expect(state.nextSessionIdCounter).toBe(1);
    for (const item of state.items) {
      expect(item.itemId.startsWith(FIXTURE_ID_PREFIX)).toBe(true);
    }
  });
});

describe('isPurchasableFamily', () => {
  it('6ファミリーのみ購入可能と判定する(Fable必須修正A)', () => {
    expect(PURCHASABLE_FAMILIES).toEqual(['wire', 'coating', 'magnet', 'gear', 'battery', 'brush']);
    expect(isPurchasableFamily('substrate')).toBe(false);
    expect(isPurchasableFamily('roller')).toBe(false);
    expect(isPurchasableFamily('body')).toBe(false);
    expect(isPurchasableFamily('magnet')).toBe(true);
  });
});

describe('purchaseMaterial', () => {
  it('個体パーツ(magnet)を購入すると所持金が減りsession-IDの新規在庫が追加される', () => {
    const state = createInitialShopEconomyState();
    const result = purchaseMaterial(state, 'magnet-ferrite');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.cashG).toBe(INITIAL_CASH_G - 40);
    expect(result.state.items).toHaveLength(5);
    const added = result.state.items[result.state.items.length - 1];
    expect(added.itemId).toBe(`${SESSION_ID_PREFIX}0001`);
    expect(added.family).toBe('magnet');
    expect(result.state.nextSessionIdCounter).toBe(2);
  });

  it('スタック素材(wire)は同一materialIdの既存entryへ数量加算する(重複entryを作らない)', () => {
    const state = createInitialShopEconomyState();
    const result = purchaseMaterial(state, 'wire-copper-standard');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.stackableStock).toHaveLength(2);
    const wireEntry = result.state.stackableStock.find((e) => e.family === 'wire');
    expect(wireEntry).toBeDefined();
    if (wireEntry?.family === 'wire') expect(wireEntry.quantityM).toBe(6);
  });

  it('未所持のスタック素材(異なるtier)は新規entryとして追加される', () => {
    const state = createInitialShopEconomyState();
    const result = purchaseMaterial(state, 'wire-aluminum');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.stackableStock).toHaveLength(3);
  });

  it('残高不足では購入を拒否し状態を変更しない', () => {
    const state: ShopEconomyState = { ...createInitialShopEconomyState(), cashG: 10 };
    const result = purchaseMaterial(state, 'magnet-neodymium');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('不足');
  });

  it('購入不可ファミリー(substrate/roller/body)は購入を拒否する', () => {
    const state = createInitialShopEconomyState();
    for (const id of ['substrate-cardboard', 'roller-pom-fixed', 'body-cardboard-cowl'] as const) {
      const result = purchaseMaterial(state, id);
      expect(result.ok).toBe(false);
    }
  });

  it('存在しないmaterialIdは拒否する', () => {
    const state = createInitialShopEconomyState();
    const result = purchaseMaterial(state, 'not-a-real-material');
    expect(result.ok).toBe(false);
  });

  it('連続購入でIDカウンタが単調増加し、削除後も欠番が再利用されない', () => {
    let state = createInitialShopEconomyState();
    const first = purchaseMaterial(state, 'magnet-ferrite');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.state;
    const firstId = state.items[state.items.length - 1].itemId;

    const salvage = confirmSalvage(state, firstId);
    expect(salvage.ok).toBe(true);
    if (!salvage.ok) return;
    state = salvage.state;

    const second = purchaseMaterial(state, 'magnet-ferrite');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const secondId = second.state.items[second.state.items.length - 1].itemId;
    expect(secondId).toBe(`${SESSION_ID_PREFIX}0002`);
    expect(secondId).not.toBe(firstId);
  });
});

// Suu_mot3コードレビュー指摘: 購入・サルベージ双方で価格・残高・数量が有限かつ非負整数で
// あることを、状態遷移の入力・出力の両方で検証する。現実のALL_MATERIALS/初期フィクスチャは
// 常に正常値のため、異常系は「壊れたstate」を明示的に組み立てて模擬する。
describe('数値検証(壊れたstate/fixtureを模擬した異常系)', () => {
  it('wireの既存在庫quantityが不正(NaN)な場合、購入を拒否し状態不変', () => {
    const state = createInitialShopEconomyState();
    const brokenStock: StackableStockEntry[] = state.stackableStock.map((entry) =>
      entry.family === 'wire' ? { ...entry, quantityM: Number.NaN } : entry,
    );
    const brokenState: ShopEconomyState = { ...state, stackableStock: brokenStock };

    const result = purchaseMaterial(brokenState, 'wire-copper-standard');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('数量');
    expect(brokenState.stackableStock).toEqual(brokenStock);
    expect(brokenState.cashG).toBe(INITIAL_CASH_G);
  });

  it('coatingの既存在庫quantityが不正(負値)な場合、購入を拒否し状態不変', () => {
    const state = createInitialShopEconomyState();
    const brokenStock: StackableStockEntry[] = state.stackableStock.map((entry) =>
      entry.family === 'coating' ? { ...entry, quantityMl: -1 } : entry,
    );
    const brokenState: ShopEconomyState = { ...state, stackableStock: brokenStock };

    const result = purchaseMaterial(brokenState, 'coating-polyester');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('数量');
  });

  it('個体購入時にnextSessionIdCounterが不正(非整数)な場合、購入を拒否し状態不変', () => {
    const state = createInitialShopEconomyState();
    const brokenState: ShopEconomyState = { ...state, nextSessionIdCounter: 1.5 };

    const result = purchaseMaterial(brokenState, 'magnet-ferrite');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('ID発行カウンタ');
    expect(brokenState.items).toEqual(state.items);
  });

  it('個体購入時にnextSessionIdCounterが負値の場合も購入を拒否する', () => {
    const state = createInitialShopEconomyState();
    const brokenState: ShopEconomyState = { ...state, nextSessionIdCounter: -1 };
    const result = purchaseMaterial(brokenState, 'gear-pom');
    expect(result.ok).toBe(false);
  });

  it('サルベージ確定時にcashGが不正(Infinity)な場合、確定を拒否し状態不変', () => {
    const state = createInitialShopEconomyState();
    const item = state.items.find((i) => i.family === 'brush');
    if (!item) throw new Error('fixture brush not found');
    const brokenState: ShopEconomyState = { ...state, cashG: Number.POSITIVE_INFINITY };

    const result = confirmSalvage(brokenState, item.itemId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('所持金');
    expect(brokenState.items).toEqual(state.items);
  });

  it('サルベージ確定時にcashGが不正(非整数)な場合も確定を拒否する', () => {
    const state = createInitialShopEconomyState();
    const item = state.items.find((i) => i.family === 'magnet');
    if (!item) throw new Error('fixture magnet not found');
    const brokenState: ShopEconomyState = { ...state, cashG: 999.9 };
    const result = confirmSalvage(brokenState, item.itemId);
    expect(result.ok).toBe(false);
  });

  it('価格(priceProvisionalG)が不正(NaN)な素材はサルベージのプレビューを拒否する(壊れたfixtureを模擬)', () => {
    const brokenMaterial: Material = { ...materialOf('magnet-ferrite'), priceProvisionalG: Number.NaN };
    const preview = previewSalvageForMaterial(brokenMaterial, { kind: 'magnet', demagnetizationFraction: 0 });
    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    expect(preview.reason).toContain('価格');
  });

  it('価格(priceProvisionalG)が負値の素材もサルベージのプレビューを拒否する', () => {
    const brokenMaterial: Material = { ...materialOf('gear-pom'), priceProvisionalG: -10 };
    const preview = previewSalvageForMaterial(brokenMaterial, { kind: 'gear', toothDamageFraction: 0 });
    expect(preview.ok).toBe(false);
  });
});

describe('全ID(fixture+session)の一意性', () => {
  it('fixture名前空間とsession名前空間は衝突しない', () => {
    let state = createInitialShopEconomyState();
    for (const id of ['magnet-ferrite', 'gear-pom', 'brush-carbon', 'battery-alkaline'] as const) {
      const result = purchaseMaterial(state, id);
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }
    const ids = state.items.map((item) => item.itemId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith(FIXTURE_ID_PREFIX)).length).toBe(4);
    expect(ids.filter((id) => id.startsWith(SESSION_ID_PREFIX)).length).toBe(4);
  });
});

describe('computeSalvageAmountG', () => {
  it('小数点以下を切り捨てる', () => {
    expect(computeSalvageAmountG(100, 0.15)).toBe(15);
  });

  it('切り捨て結果が0になる場合は最低1Gを保証する(spec §5.4底値保証)', () => {
    expect(computeSalvageAmountG(5, 0.1)).toBe(1);
    expect(computeSalvageAmountG(0, 0.6)).toBe(1);
  });
});

describe('previewSalvage / confirmSalvage', () => {
  it('正常な個体はcomputeSalvageRateの帯域内の額を返す', () => {
    const state = createInitialShopEconomyState();
    const item = state.items.find((i) => i.family === 'magnet');
    if (!item) throw new Error('fixture magnet not found');
    const preview = previewSalvage(item);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.amountG).toBeGreaterThanOrEqual(1);
  });

  it('存在しないitemIdでは状態不変のまま失敗する', () => {
    const state = createInitialShopEconomyState();
    const result = confirmSalvage(state, 'session-9999');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('見つかりません');
  });

  it('確定操作で対象が削除され所持金へ回収額が加算される', () => {
    const state = createInitialShopEconomyState();
    const item = state.items.find((i) => i.family === 'brush');
    if (!item) throw new Error('fixture brush not found');
    const result = confirmSalvage(state, item.itemId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.items.find((i) => i.itemId === item.itemId)).toBeUndefined();
    expect(result.state.cashG).toBe(INITIAL_CASH_G + result.amountG);
  });

  it('computeSalvageRateがok:falseを返す個体は確定を拒否し状態不変・日本語エラーとなる(Fable必須修正D)', () => {
    const state = createInitialShopEconomyState();
    // wearState.kindとmaterial.familyを意図的に不一致させ、computeSalvageRateのok:false経路を発火させる。
    // InventoryItemの判別共用体はこの組み合わせを型で正しく排除するため、実行時の防御を試験する
    // 目的でのみ`as unknown as`を用いる(壊れたデータが渡った場合を模擬)。
    const brokenItem = {
      itemId: `${FIXTURE_ID_PREFIX}broken-01`,
      family: 'magnet',
      materialId: 'magnet-ferrite',
      wearState: { kind: 'gear', toothDamageFraction: 0.5 },
    } as unknown as InventoryItem;
    const brokenState: ShopEconomyState = { ...state, items: [...state.items, brokenItem] };

    const preview = previewSalvage(brokenItem);
    expect(preview.ok).toBe(false);

    const result = confirmSalvage(brokenState, brokenItem.itemId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('この個体はサルベージできません');
    expect(brokenState.items).toContain(brokenItem);
    expect(brokenState.cashG).toBe(INITIAL_CASH_G);
  });
});

describe('findMaterialForItem', () => {
  it('在庫個体のmaterialIdからMaterialを解決できる', () => {
    const state = createInitialShopEconomyState();
    const item = state.items[0];
    const material = findMaterialForItem(item);
    expect(material?.id).toBe(item.materialId);
  });
});

// Suu_mot3コードレビュー指摘: 残高不足時は購入ダイアログの確定操作自体を事前に無効化する
// 必要がある(確定操作を送信してから失敗させるのではなく)。その判定に使う純関数のテスト。
describe('canAffordPurchase', () => {
  it('所持金が価格以上なら購入可能と判定する', () => {
    expect(canAffordPurchase(100, 100)).toBe(true);
    expect(canAffordPurchase(150, 100)).toBe(true);
  });

  it('所持金が価格未満なら購入不可と判定する(状態は変更しない、純関数)', () => {
    expect(canAffordPurchase(99, 100)).toBe(false);
  });

  it('非有限・非整数・負値の入力は購入不可と判定する', () => {
    expect(canAffordPurchase(Number.NaN, 100)).toBe(false);
    expect(canAffordPurchase(100, Number.POSITIVE_INFINITY)).toBe(false);
    expect(canAffordPurchase(-1, 100)).toBe(false);
    expect(canAffordPurchase(100, 1.5)).toBe(false);
  });
});

describe('isFiniteNonNegativeInteger', () => {
  it('有限・非負・整数のみtrueを返す', () => {
    expect(isFiniteNonNegativeInteger(0)).toBe(true);
    expect(isFiniteNonNegativeInteger(42)).toBe(true);
    expect(isFiniteNonNegativeInteger(-1)).toBe(false);
    expect(isFiniteNonNegativeInteger(1.5)).toBe(false);
    expect(isFiniteNonNegativeInteger(Number.NaN)).toBe(false);
    expect(isFiniteNonNegativeInteger(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('buildInventoryRows', () => {
  it('個体4件+スタック2件=6行を返し、それぞれMaterialを解決する', () => {
    const state = createInitialShopEconomyState();
    const rows = buildInventoryRows(state);
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.kind === 'item')).toHaveLength(4);
    expect(rows.filter((r) => r.kind === 'stack')).toHaveLength(2);
    for (const row of rows) expect(row.material).toBeDefined();
  });
});

// materialOf: ALL_MATERIALSに実データが存在することの前提確認(fixtureのID誤記を早期検出)
describe('fixture整合性', () => {
  it('createInitialShopEconomyStateが参照する全materialIdがALL_MATERIALSに存在する', () => {
    const state = createInitialShopEconomyState();
    for (const item of state.items) expect(() => materialOf(item.materialId)).not.toThrow();
    for (const entry of state.stackableStock) expect(() => materialOf(entry.materialId)).not.toThrow();
  });
});
