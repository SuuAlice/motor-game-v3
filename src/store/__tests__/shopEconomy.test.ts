import { describe, expect, it } from 'vitest';
import {
  FIXTURE_ID_PREFIX,
  INITIAL_CASH_G,
  MAX_CART_LINE_QUANTITY,
  PURCHASABLE_FAMILIES,
  SESSION_ID_PREFIX,
  buildInventoryRows,
  canAffordCartPurchase,
  canAffordPurchase,
  computeCartTotalG,
  computeSalvageAmountG,
  confirmSalvage,
  createInitialShopEconomyState,
  findMaterialForItem,
  isFiniteNonNegativeInteger,
  isPurchasableFamily,
  previewSalvage,
  previewSalvageForMaterial,
  purchaseCart,
  purchaseMaterial,
  type ShopEconomyState,
} from '../shopEconomy';
import { resolveRotorAssemblyCompletion, resolveWireBreakConsumption } from '../rotorAssembly';
import { createInitialPlayerInventoryAndLoadout } from '../runOutcomeApplication';
import { __testOnly, type PersistedSaveState } from '../saveStore';
import type { PlayerInventory } from '../../materials/inventoryItem';
import type { WindingRecord } from '../../materials/windingRecord';
import { GEAR_TOTAL_TOOTH_COUNT } from '../../materials/inventoryItem';
import type { InventoryItem, StackableStockEntry } from '../../materials/inventoryItem';
import { ALL_MATERIALS, type Material, type MaterialId } from '../../materials/materials';

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

// ショッピングカート方式(人間確定仕様2026-07-23、Suu_mot3コードレビュー指摘反映)。
describe('computeCartTotalG', () => {
  it('空カートはok:falseを返す', () => {
    const result = computeCartTotalG([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('空');
  });

  it('個体品+スタック品混在の合計を正しく計算する', () => {
    const result = computeCartTotalG([
      { materialId: 'magnet-ferrite', quantity: 2 },
      { materialId: 'wire-aluminum', quantity: 3 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ferrite = materialOf('magnet-ferrite');
    const aluminum = materialOf('wire-aluminum');
    expect(result.totalG).toBe(ferrite.priceProvisionalG * 2 + aluminum.priceProvisionalG * 3);
    expect(result.lines).toHaveLength(2);
  });

  it('同一materialIdの複数行は数量を合算して1行にする', () => {
    const result = computeCartTotalG([
      { materialId: 'magnet-ferrite', quantity: 1 },
      { materialId: 'magnet-ferrite', quantity: 2 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].quantity).toBe(3);
  });

  it('存在しないmaterialIdはok:falseを返す', () => {
    const result = computeCartTotalG([{ materialId: 'not-a-real-material' as never, quantity: 1 }]);
    expect(result.ok).toBe(false);
  });

  it('購入不可ファミリー(substrate等)はok:falseを返す', () => {
    const result = computeCartTotalG([{ materialId: 'substrate-cardboard' as never, quantity: 1 }]);
    expect(result.ok).toBe(false);
  });

  it('数量が上限(MAX_CART_LINE_QUANTITY)を超えるとok:falseを返す', () => {
    const result = computeCartTotalG([{ materialId: 'magnet-ferrite', quantity: MAX_CART_LINE_QUANTITY + 1 }]);
    expect(result.ok).toBe(false);
  });

  it('合算後にMAX_CART_LINE_QUANTITYを超える場合もok:falseを返す', () => {
    const result = computeCartTotalG([
      { materialId: 'magnet-ferrite', quantity: MAX_CART_LINE_QUANTITY },
      { materialId: 'magnet-ferrite', quantity: 1 },
    ]);
    expect(result.ok).toBe(false);
  });

  it('数量が非正整数(0・負・NaN)はok:falseを返す', () => {
    expect(computeCartTotalG([{ materialId: 'magnet-ferrite', quantity: 0 }]).ok).toBe(false);
    expect(computeCartTotalG([{ materialId: 'magnet-ferrite', quantity: -1 }]).ok).toBe(false);
    expect(computeCartTotalG([{ materialId: 'magnet-ferrite', quantity: Number.NaN }]).ok).toBe(false);
  });
});

describe('canAffordCartPurchase', () => {
  it('所持金が合計以上ならtrue、未満ならfalse', () => {
    expect(canAffordCartPurchase(100, 100)).toBe(true);
    expect(canAffordCartPurchase(100, 101)).toBe(false);
  });
});

describe('purchaseCart', () => {
  it('複数行を一括購入し、所持金が合計分だけ減り在庫が反映される', () => {
    const state = createInitialShopEconomyState();
    const result = purchaseCart(state, [
      { materialId: 'magnet-ferrite', quantity: 2 },
      { materialId: 'wire-aluminum', quantity: 3 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ferrite = materialOf('magnet-ferrite');
    const aluminum = materialOf('wire-aluminum');
    const expectedTotal = ferrite.priceProvisionalG * 2 + aluminum.priceProvisionalG * 3;
    expect(result.state.cashG).toBe(INITIAL_CASH_G - expectedTotal);
    // 初期フィクスチャに既存のmagnet-ferrite個体が1件あるため、購入2件+1で計3件になる。
    expect(result.state.items.filter((i) => i.materialId === 'magnet-ferrite')).toHaveLength(3);
    const aluminumStock = result.state.stackableStock.find((e) => e.materialId === 'wire-aluminum');
    expect(aluminumStock?.family === 'wire' ? aluminumStock.quantityM : undefined).toBe(3);
  });

  it('原子性: 残高不足で一部だけ購入できる構成では全体を拒否し状態を不変に保つ', () => {
    // 1行目は購入できるが、2行目まで到達すると残高が尽きる数量を用意する。
    const cheap = materialOf('wire-aluminum'); // 50G
    const state: ShopEconomyState = { ...createInitialShopEconomyState(), cashG: cheap.priceProvisionalG * 2 };
    const result = purchaseCart(state, [{ materialId: 'wire-aluminum', quantity: 3 }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('不足');
  });

  it('空カートは拒否し状態不変', () => {
    const state = createInitialShopEconomyState();
    const result = purchaseCart(state, []);
    expect(result.ok).toBe(false);
  });

  it('存在しないmaterialIdを含む場合は全体を拒否する(1行目が正常でも購入しない)', () => {
    const state = createInitialShopEconomyState();
    const result = purchaseCart(state, [
      { materialId: 'magnet-ferrite', quantity: 1 },
      { materialId: 'not-a-real-material' as never, quantity: 1 },
    ]);
    expect(result.ok).toBe(false);
  });

  it('同一materialIdの複数行は合算した数量ぶん購入する', () => {
    const state = createInitialShopEconomyState();
    const result = purchaseCart(state, [
      { materialId: 'magnet-ferrite', quantity: 1 },
      { materialId: 'magnet-ferrite', quantity: 2 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 初期フィクスチャの既存1件+合算購入3件で計4件になる。
    expect(result.state.items.filter((i) => i.materialId === 'magnet-ferrite')).toHaveLength(4);
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
    const preview = previewSalvageForMaterial(brokenMaterial, { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 0, seizureFraction: 0 });
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
      wearState: { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 5, seizureFraction: 0 },
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

// ---------------------------------------------------------------------------
// 補充導線の是正(2026-09-05人間承認、管理メモ§7)。
//
// P4-1A以降、線材在庫はメートルの**連続量**であり、完成・破断のあとは整数になりません
// (1ターン = 2π × WINDING_MEAN_RADIUS_M)。`StackableStockEntry`の宣言
// (src/materials/inventoryItem.ts)は「quantityM/quantityMlは有限・0以上」を契約とし、
// saveのvalidatorもその契約どおり小数を受理します。購入側だけが整数を要求していたため、
// 小数残量になった素材の再購入が拒否されていました。
//
// **小数残量は消費関数から作ります**——期待値へ消費量を直書きすると、消費式が変わった
// ときにテストだけが古い前提で通り続けます。
// ---------------------------------------------------------------------------

const WIRE_ID = 'wire-copper-standard';
const COATING_ID = 'coating-polyester';
const LOT = { wireMaterialId: WIRE_ID, windingWireGaugeMm: 0.4, windingParallelStrands: 1 as const };

function windingRecord(turnCount: number): WindingRecord {
  return Array.from({ length: turnCount }, () => ({
    position: 0.25,
    arm: 'left' as const,
    direction: 1 as const,
    tension: 0.5,
  }));
}

/** 実際の完成経路を通して小数残量を作る(手書きの小数を置かない)。 */
function completeOneRotor(turnCount: number) {
  const { inventory, loadout } = createInitialPlayerInventoryAndLoadout();
  const result = resolveRotorAssemblyCompletion({
    command: {
      record: windingRecord(turnCount),
      wireMaterialId: WIRE_ID,
      windingWireGaugeMm: LOT.windingWireGaugeMm,
      windingParallelStrands: LOT.windingParallelStrands,
      motorDraft: {
        slitWidthMm: 1.5,
        sandingQuality: 0.9,
        brushPressure: 0.3,
        magnetStrength: 0.5,
        magnetDistanceMm: 10,
        batteryVoltage: 1.5,
        varnished: true,
      },
    },
    inventory,
    loadout,
    assemblyId: 'assembly-0001',
  });
  if (!result.ok) throw new Error(`完成が失敗した: ${JSON.stringify(result.failure)}`);
  return result;
}

function wireStockM(inventory: PlayerInventory): number {
  const entry = inventory.stackableStock.find((s) => s.family === 'wire' && s.materialId === WIRE_ID);
  return entry !== undefined && entry.family === 'wire' ? entry.quantityM : Number.NaN;
}

function coatingStockMl(inventory: PlayerInventory): number {
  const entry = inventory.stackableStock.find((s) => s.family === 'coating' && s.materialId === COATING_ID);
  return entry !== undefined && entry.family === 'coating' ? entry.quantityMl : Number.NaN;
}

function toShopState(inventory: PlayerInventory): ShopEconomyState {
  return { ...inventory, nextSessionIdCounter: 1 };
}

function withWireStock(inventory: PlayerInventory, quantityM: number): PlayerInventory {
  return {
    ...inventory,
    stackableStock: inventory.stackableStock.map((e) =>
      e.family === 'wire' && e.materialId === WIRE_ID ? { ...e, quantityM } : e,
    ),
  };
}

describe('在庫数量の検証(P4-1A以降の連続量)', () => {
  it('R1: 完成で生じた小数残量から同じ線材を単品購入できる', () => {
    const completed = completeOneRotor(80);
    const before = wireStockM(completed.inventory);
    // 前提そのものの確認: 完成後の残量は整数ではない
    expect(Number.isInteger(before)).toBe(false);

    const result = purchaseMaterial(toShopState(completed.inventory), WIRE_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(wireStockM(result.state)).toBeCloseTo(before + 1, 12);
  });

  it('R2: 破断消費で生じた小数残量からも同じ線材を単品購入できる', () => {
    const { inventory } = createInitialPlayerInventoryAndLoadout();
    const broken = resolveWireBreakConsumption({ command: { lot: LOT, brokenTurnCount: 12 }, inventory });
    expect(broken.ok).toBe(true);
    if (!broken.ok) return;
    const before = wireStockM(broken.inventory);
    expect(Number.isInteger(before)).toBe(false);

    const result = purchaseMaterial(toShopState(broken.inventory), WIRE_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(wireStockM(result.state)).toBeCloseTo(before + 1, 12);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'R3: 在庫が%pのときは拒否し、入力状態を一切変更しない',
    (bad) => {
      const { inventory } = createInitialPlayerInventoryAndLoadout();
      const state = toShopState(withWireStock(inventory, bad));
      const snapshot = structuredClone(state);

      const result = purchaseMaterial(state, WIRE_ID);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('既存在庫の数量が有限の非負の数値ではありません');
      expect(state).toEqual(snapshot);
    },
  );

  it('R4-a: 所持金が小数なら拒否する(金額の整数制約は緩んでいない)', () => {
    const { inventory } = createInitialPlayerInventoryAndLoadout();
    const result = purchaseMaterial({ ...toShopState(inventory), cashG: 1.5 }, WIRE_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('所持金が有限の非負整数ではありません');
  });

  it('R4-b: IDカウンタが小数なら拒否する(カウンタの整数制約は緩んでいない)', () => {
    const { inventory } = createInitialPlayerInventoryAndLoadout();
    const result = purchaseMaterial({ ...inventory, nextSessionIdCounter: 1.5 }, WIRE_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('ID発行カウンタが有限の非負整数ではありません');
  });

  it('R4-c: カート個数が小数なら拒否する(既存文言をそのまま維持する)', () => {
    const { inventory } = createInitialPlayerInventoryAndLoadout();
    const lines = [{ materialId: WIRE_ID as MaterialId, quantity: 1.5 }];
    const total = computeCartTotalG(lines);
    expect(total.ok).toBe(false);
    if (total.ok) return;
    expect(total.reason).toBe(`${WIRE_ID}の数量が正しくありません`);
    expect(purchaseCart(toShopState(inventory), lines).ok).toBe(false);
  });

  it('R5: 完成で生じた小数残量からカート購入できる', () => {
    const completed = completeOneRotor(80);
    const before = wireStockM(completed.inventory);
    const result = purchaseCart(toShopState(completed.inventory), [{ materialId: WIRE_ID as MaterialId, quantity: 2 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(wireStockM(result.state)).toBeCloseTo(before + 2, 12);
  });

  it('R6: 同じ小数在庫を既存のsave validatorも受理する(片側だけ厳しい状態を作らない)', () => {
    const completed = completeOneRotor(80);
    const candidate: PersistedSaveState = {
      ...__testOnly.freshBootstrap(),
      inventory: completed.inventory,
      equipmentLoadout: completed.loadout,
    };
    expect(__testOnly.isValidPersistedSaveState(candidate)).toBe(true);
    expect(purchaseMaterial(toShopState(completed.inventory), WIRE_ID).ok).toBe(true);
  });

  it('R7: ワニスの小数在庫も同じ数量契約で受理する(線材だけ整数を要求する非対称を作らない)', () => {
    // ワニスには消費経路がまだ無いため、検証用の小数入力で試す(管理メモ§7の条件4)。
    const { inventory } = createInitialPlayerInventoryAndLoadout();
    const fractional: PlayerInventory = {
      ...inventory,
      stackableStock: inventory.stackableStock.map((e) =>
        e.family === 'coating' && e.materialId === COATING_ID ? { ...e, quantityMl: 2.5 } : e,
      ),
    };
    const result = purchaseMaterial(toShopState(fractional), COATING_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(coatingStockMl(result.state)).toBeCloseTo(3.5, 12);
  });
});
