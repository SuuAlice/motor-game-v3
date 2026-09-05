// Phase2 UI(店・在庫・サルベージ)のセッション内限定・非永続な仮経済ロジック
// (docs/phase2-ui-shop-plan.md v4、docs/phase2-ui-shop-fable-review.md 条件付き承認)。
// Zustand(shopEconomyStore.ts)からは独立した純関数として実装する(Fable推奨事項)。
//
// 境界(Fable/Suu_mot3確定事項、変更しないこと):
// - src/materials/inventoryItem.tsの型(InventoryItem/StackableStockEntry/PlayerInventory/
//   WearState)は変更しない。ここで組み立てるのはこれら既存型のインスタンスのみ
// - 購入可能なのは現行PlayerInventoryが表現できる6ファミリー(wire/coating/magnet/gear/
//   battery/brush)のみ(Fable必須修正A)。substrate/roller/bodyは閲覧専用で、
//   これらを在庫化する独自UI型は作らない
// - itemIdは「不透明な識別子」(Fable回答2)。family判定にitemId文字列を解析しない
//   (familyは常にInventoryItem.familyフィールドから取得する)
// - Phase3で確定する本物のID発行・永続化方式を先取りしない(この仮storeはPhase2試遊限定)

import {
  ALL_MATERIALS,
  BATTERY_MATERIALS,
  BRUSH_MATERIALS,
  COATING_MATERIALS,
  GEAR_MATERIALS,
  MAGNET_MATERIALS,
  WIRE_MATERIALS,
  type BatteryMaterial,
  type BrushMaterial,
  type CoatingMaterial,
  type GearMaterial,
  type Material,
  type MaterialFamily,
  type MaterialId,
  type MagnetMaterial,
  type WireMaterial,
} from '../materials/materials';

// inventoryItem.ts(alice所有)と同様に、materialMapping.tsへ依存させず本ファイル内で
// 直接ID型を導出する(層境界、docs/phase2-plan.md §16 Step8と同じ意図的な重複)。
// ALL_MATERIALSは`readonly Material[]`型注釈のためid:stringへ広がってしまい(MaterialId=string
// 相当)、個体ごとのリテラル型が必要な箇所ではfamily別配列から導出したこれらの型を使う。
type MagnetMaterialId = (typeof MAGNET_MATERIALS)[number]['id'];
type GearMaterialId = (typeof GEAR_MATERIALS)[number]['id'];
type BatteryMaterialId = (typeof BATTERY_MATERIALS)[number]['id'];
type BrushMaterialId = (typeof BRUSH_MATERIALS)[number]['id'];
type WireMaterialId = (typeof WIRE_MATERIALS)[number]['id'];
type CoatingMaterialId = (typeof COATING_MATERIALS)[number]['id'];
import {
  computeSalvageRate,
  GEAR_TOTAL_TOOTH_COUNT,
  type InventoryItem,
  type PlayerInventory,
  type StackableStockEntry,
  type WearState,
} from '../materials/inventoryItem';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** 購入操作を出す6ファミリー(Fable必須修正A)。substrate/roller/bodyは含めない。 */
export const PURCHASABLE_FAMILIES = ['wire', 'coating', 'magnet', 'gear', 'battery', 'brush'] as const;
export type PurchasableFamily = (typeof PURCHASABLE_FAMILIES)[number];

export function isPurchasableFamily(family: MaterialFamily): family is PurchasableFamily {
  return (PURCHASABLE_FAMILIES as readonly MaterialFamily[]).includes(family);
}

const STACKABLE_FAMILIES = ['wire', 'coating'] as const;
type StackableFamily = (typeof STACKABLE_FAMILIES)[number];

function isStackableFamily(family: MaterialFamily): family is StackableFamily {
  return (STACKABLE_FAMILIES as readonly MaterialFamily[]).includes(family);
}

/** セッション内限定の仮PlayerInventory+所持金+ID発行カウンタ。localStorageへは保存しない。 */
export interface ShopEconomyState extends PlayerInventory {
  /** fixtureとは独立した、全family共通の単調カウンタ(Fable必須修正C)。削除後も減らない。 */
  readonly nextSessionIdCounter: number;
}

export const FIXTURE_ID_PREFIX = 'fixture-';
export const SESSION_ID_PREFIX = 'session-';

export const INITIAL_CASH_G = 1000;

function findMaterial(materialId: string): Material | undefined {
  return ALL_MATERIALS.find((m) => m.id === materialId);
}

export function findMaterialForItem(item: InventoryItem): Material | undefined {
  return findMaterial(item.materialId);
}

export function findMaterialForStock(entry: StackableStockEntry): Material | undefined {
  return findMaterial(entry.materialId);
}

// ---------------------------------------------------------------------------
// 初期フィクスチャ(セッション開始時に固定。reloadで常にこの状態へ戻る)
// ---------------------------------------------------------------------------

function freshWearState(family: 'magnet'): Extract<WearState, { kind: 'magnet' }>;
function freshWearState(family: 'gear'): Extract<WearState, { kind: 'gear' }>;
function freshWearState(family: 'brush'): Extract<WearState, { kind: 'brush' }>;
function freshWearState(family: 'magnet' | 'gear' | 'brush'): WearState {
  switch (family) {
    case 'magnet':
      return { kind: 'magnet', demagnetizationFraction: 0 };
    case 'gear':
      return { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 0, seizureFraction: 0 };
    case 'brush':
      return { kind: 'brush', wearFraction: 0 };
  }
}

export function createInitialShopEconomyState(): ShopEconomyState {
  const items: InventoryItem[] = [
    { itemId: `${FIXTURE_ID_PREFIX}magnet-01`, family: 'magnet', materialId: 'magnet-ferrite' satisfies MagnetMaterialId, wearState: freshWearState('magnet') },
    { itemId: `${FIXTURE_ID_PREFIX}gear-01`, family: 'gear', materialId: 'gear-pom' satisfies GearMaterialId, wearState: freshWearState('gear') },
    { itemId: `${FIXTURE_ID_PREFIX}brush-01`, family: 'brush', materialId: 'brush-copper-plate' satisfies BrushMaterialId, wearState: freshWearState('brush') },
    { itemId: `${FIXTURE_ID_PREFIX}battery-01`, family: 'battery', materialId: 'battery-alkaline' satisfies BatteryMaterialId, wearState: undefined },
  ];
  const stackableStock: StackableStockEntry[] = [
    { family: 'wire', materialId: 'wire-copper-standard' satisfies WireMaterialId, quantityM: 5 },
    { family: 'coating', materialId: 'coating-polyester' satisfies CoatingMaterialId, quantityMl: 10 },
  ];
  return {
    cashG: INITIAL_CASH_G,
    items,
    stackableStock,
    rotorAssemblies: [],
    bodyParts: [],
    bearingAssemblies: [],
    nextSessionIdCounter: 1,
  };
}

// ---------------------------------------------------------------------------
// 数値検証(Fable推奨: 状態遷移境界で有限・非負の整数を検証する)
// ---------------------------------------------------------------------------

export function isFiniteNonNegativeInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

/**
 * isFiniteNonNegativeIntegerの日本語reason付き版(Suu_mot3コードレビュー指摘: 購入・
 * サルベージの状態遷移前後で価格・残高・数量のすべてを検証し、異常があれば入力stateを
 * 変更せずok:falseで拒否する)。呼び出し側は`if (error) return { ok: false, reason: error };`
 * の形でガード節として使う。
 */
function invalidNumberReason(value: number, labelJa: string): string | null {
  return isFiniteNonNegativeInteger(value) ? null : `${labelJa}が有限の非負整数ではありません`;
}

/**
 * **在庫数量**の検証(2026-09-05人間承認、管理メモ§7)。P4-1A以降、線材在庫はメートルの
 * 連続量であり、完成・破断のあとは整数になりません(1ターン = 2π × WINDING_MEAN_RADIUS_M)。
 * `StackableStockEntry`の宣言(src/materials/inventoryItem.ts)が
 * 「quantityM/quantityMlは有限・0以上であることを呼び出し元が保証すること」と定めており、
 * 本述語はその契約そのものです——**緩和ではなく、宣言済み契約への復帰**です。
 * saveのvalidator(saveStore.ts の isValidStackableStockEntry)も同じ契約で受理しています。
 *
 * **金額・個数・IDカウンタには使わないこと。** そちらは整数であることが正しく、
 * `isFiniteNonNegativeInteger`/`invalidNumberReason`を引き続き使います。
 */
function isFiniteNonNegativeQuantity(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** `isFiniteNonNegativeQuantity`の日本語reason付き版。文言に「整数」を含めない。 */
function invalidQuantityReason(value: number, labelJa: string): string | null {
  return isFiniteNonNegativeQuantity(value) ? null : `${labelJa}が有限の非負の数値ではありません`;
}

/**
 * 購入ダイアログの確定操作を事前に無効化できるかの判定(Suu_mot3コードレビュー指摘)。
 * purchaseMaterial内の残高不足チェックと同じ条件をダイアログ表示前に使えるよう公開する。
 */
export function canAffordPurchase(cashG: number, priceProvisionalG: number): boolean {
  return isFiniteNonNegativeInteger(cashG) && isFiniteNonNegativeInteger(priceProvisionalG) && cashG >= priceProvisionalG;
}

// ---------------------------------------------------------------------------
// 購入
// ---------------------------------------------------------------------------

export type PurchaseResult =
  | { readonly ok: true; readonly state: ShopEconomyState }
  | { readonly ok: false; readonly reason: string };

function issueSessionItemId(counter: number): string {
  return `${SESSION_ID_PREFIX}${String(counter).padStart(4, '0')}`;
}

// material.idはMaterialTierBaseでstringと宣言されているため、familyで narrowingしても
// リテラル型は自動復元されない。findMaterial()が対応するfamily別配列(MAGNET_MATERIALS等)
// から見つけた値である不変条件に基づき、ここでのみ明示キャストする。
function buildPurchasedItem(itemId: string, material: MagnetMaterial | GearMaterial | BatteryMaterial | BrushMaterial): InventoryItem {
  switch (material.family) {
    case 'magnet':
      return { itemId, family: 'magnet', materialId: material.id as MagnetMaterialId, wearState: freshWearState('magnet') };
    case 'gear':
      return { itemId, family: 'gear', materialId: material.id as GearMaterialId, wearState: freshWearState('gear') };
    case 'brush':
      return { itemId, family: 'brush', materialId: material.id as BrushMaterialId, wearState: freshWearState('brush') };
    case 'battery':
      return { itemId, family: 'battery', materialId: material.id as BatteryMaterialId, wearState: undefined };
  }
}

type MergeStackableResult =
  | { readonly ok: true; readonly stock: StackableStockEntry[] }
  | { readonly ok: false; readonly reason: string };

/** 既存entryの現在数量・加算後数量の双方を検証する(Suu_mot3コードレビュー指摘)。 */
function mergeStackablePurchase(
  stock: readonly StackableStockEntry[],
  material: WireMaterial | CoatingMaterial,
): MergeStackableResult {
  const index = stock.findIndex((entry) => entry.family === material.family && entry.materialId === material.id);
  if (index < 0) {
    const fresh: StackableStockEntry =
      material.family === 'wire'
        ? { family: 'wire', materialId: material.id as WireMaterialId, quantityM: 1 }
        : { family: 'coating', materialId: material.id as CoatingMaterialId, quantityMl: 1 };
    return { ok: true, stock: [...stock, fresh] };
  }

  const entry = stock[index];
  const currentQuantity = entry.family === 'wire' ? entry.quantityM : entry.quantityMl;
  const currentError = invalidQuantityReason(currentQuantity, '既存在庫の数量');
  if (currentError) return { ok: false, reason: currentError };

  const nextQuantity = currentQuantity + 1;
  const nextError = invalidQuantityReason(nextQuantity, '在庫数量の更新結果');
  if (nextError) return { ok: false, reason: nextError };

  const updatedStock = stock.map((e, i) => {
    if (i !== index) return e;
    return e.family === 'wire' ? { ...e, quantityM: nextQuantity } : { ...e, quantityMl: nextQuantity };
  });
  return { ok: true, stock: updatedStock };
}

/**
 * 素材1単位(個体パーツ1個/線材1 m/ワニス1 ml、docs/phase2-ui-shop-plan.md v4 §5)を購入する。
 * 購入可能なのはPURCHASABLE_FAMILIESの6ファミリーのみ(Fable必須修正A)。
 * 価格・残高・(スタックの場合)既存数量・(個体の場合)ID発行カウンタと、それぞれの
 * 演算結果を状態遷移前後で検証する(Fable推奨・Suu_mot3コードレビュー指摘)。
 */
export function purchaseMaterial(state: ShopEconomyState, materialId: MaterialId): PurchaseResult {
  const material = findMaterial(materialId);
  if (!material) return { ok: false, reason: '該当する素材が見つかりません' };
  if (!isPurchasableFamily(material.family)) {
    return { ok: false, reason: 'この素材ファミリーは試遊版では閲覧のみで、購入できません' };
  }

  const priceError = invalidNumberReason(material.priceProvisionalG, '価格');
  if (priceError) return { ok: false, reason: priceError };
  const cashError = invalidNumberReason(state.cashG, '所持金');
  if (cashError) return { ok: false, reason: cashError };
  const counterError = invalidNumberReason(state.nextSessionIdCounter, 'ID発行カウンタ');
  if (counterError) return { ok: false, reason: counterError };

  if (state.cashG < material.priceProvisionalG) {
    return { ok: false, reason: '所持金が不足しています' };
  }

  const cashG = state.cashG - material.priceProvisionalG;
  const cashResultError = invalidNumberReason(cashG, '購入後の所持金');
  if (cashResultError) return { ok: false, reason: cashResultError };

  if (isStackableFamily(material.family)) {
    const mergeResult = mergeStackablePurchase(state.stackableStock, material as WireMaterial | CoatingMaterial);
    if (!mergeResult.ok) return mergeResult;
    return { ok: true, state: { ...state, cashG, stackableStock: mergeResult.stock } };
  }

  const nextSessionIdCounter = state.nextSessionIdCounter + 1;
  const counterResultError = invalidNumberReason(nextSessionIdCounter, 'ID発行カウンタの更新結果');
  if (counterResultError) return { ok: false, reason: counterResultError };

  const itemId = issueSessionItemId(state.nextSessionIdCounter);
  const item = buildPurchasedItem(itemId, material as MagnetMaterial | GearMaterial | BatteryMaterial | BrushMaterial);
  return {
    ok: true,
    state: { ...state, cashG, items: [...state.items, item], nextSessionIdCounter },
  };
}

// ---------------------------------------------------------------------------
// カート(ショッピングカート方式、人間確定仕様2026-07-23)
// ---------------------------------------------------------------------------

export interface CartLine {
  readonly materialId: MaterialId;
  readonly quantity: number;
}

/** カート1行あたりの数量上限(Suu_mot3レビュー指摘: 巨大数量によるループ暴走の防止)。 */
export const MAX_CART_LINE_QUANTITY = 99;

interface NormalizedCartLine {
  readonly materialId: MaterialId;
  readonly quantity: number;
}

type ValidateCartLinesResult =
  | { readonly ok: true; readonly lines: readonly NormalizedCartLine[] }
  | { readonly ok: false; readonly reason: string };

/**
 * カート行を一括検証する(Suu_mot3コードレビュー指摘)。重複materialIdはquantityを合算して
 * 正規化し、合算後の数量にも上限・安全整数チェックを再適用する。materialId解決可否・
 * 購入可能ファミリー・価格の健全性・小計のsafe integer性まで、purchaseMaterialのループへ
 * 入る前にすべて検証する。1件でも不正ならok:falseを返し、呼び出し側は状態を一切変更しない。
 */
function validateCartLines(cartLines: readonly CartLine[]): ValidateCartLinesResult {
  if (cartLines.length === 0) return { ok: false, reason: 'カートが空です' };

  const mergedQuantities = new Map<string, number>();
  for (const line of cartLines) {
    if (!isFiniteNonNegativeInteger(line.quantity) || line.quantity <= 0) {
      return { ok: false, reason: `${line.materialId}の数量が正しくありません` };
    }
    const current = mergedQuantities.get(line.materialId) ?? 0;
    const merged = current + line.quantity;
    if (!Number.isSafeInteger(merged)) {
      return { ok: false, reason: `${line.materialId}の数量の合算結果が安全な範囲を超えています` };
    }
    mergedQuantities.set(line.materialId, merged);
  }

  const lines: NormalizedCartLine[] = [];
  for (const [materialId, quantity] of mergedQuantities) {
    if (quantity > MAX_CART_LINE_QUANTITY) {
      return { ok: false, reason: `${materialId}の数量が上限(${MAX_CART_LINE_QUANTITY})を超えています` };
    }
    const material = findMaterial(materialId);
    if (!material) return { ok: false, reason: '該当する素材が見つかりません' };
    if (!isPurchasableFamily(material.family)) {
      return { ok: false, reason: 'この素材ファミリーは試遊版では閲覧のみで、購入できません' };
    }
    const priceError = invalidNumberReason(material.priceProvisionalG, '価格');
    if (priceError) return { ok: false, reason: priceError };
    const subtotalG = material.priceProvisionalG * quantity;
    if (!Number.isSafeInteger(subtotalG)) {
      return { ok: false, reason: `${materialId}の小計の計算が安全な範囲を超えています` };
    }
    lines.push({ materialId: materialId as MaterialId, quantity });
  }

  return { ok: true, lines };
}

export interface CartTotalLine {
  readonly materialId: MaterialId;
  readonly quantity: number;
  readonly unitPriceG: number;
  readonly subtotalG: number;
}

export type CartTotalResult =
  | { readonly ok: true; readonly totalG: number; readonly lines: readonly CartTotalLine[] }
  | { readonly ok: false; readonly reason: string };

/**
 * カート内訳オーバーレイの表示・まとめて購入の事前判定に使う。不正なcartLinesを
 * 成功値として返さない(Suu_mot3コードレビュー指摘: UI側だけを信用しない)。
 */
export function computeCartTotalG(cartLines: readonly CartLine[]): CartTotalResult {
  const validated = validateCartLines(cartLines);
  if (!validated.ok) return validated;

  const lines: CartTotalLine[] = [];
  let totalG = 0;
  for (const line of validated.lines) {
    const material = findMaterial(line.materialId);
    if (!material) return { ok: false, reason: '該当する素材が見つかりません' };
    const subtotalG = material.priceProvisionalG * line.quantity;
    if (!Number.isSafeInteger(subtotalG)) return { ok: false, reason: '小計の計算が安全な範囲を超えています' };
    const nextTotalG = totalG + subtotalG;
    if (!Number.isSafeInteger(nextTotalG)) return { ok: false, reason: '合計の計算が安全な範囲を超えています' };
    totalG = nextTotalG;
    lines.push({ materialId: line.materialId, quantity: line.quantity, unitPriceG: material.priceProvisionalG, subtotalG });
  }

  return { ok: true, totalG, lines };
}

/** 購入ダイアログのcanAffordPurchaseと同じ形の、カート合計版の事前判定。 */
export function canAffordCartPurchase(cashG: number, totalG: number): boolean {
  return isFiniteNonNegativeInteger(cashG) && isFiniteNonNegativeInteger(totalG) && cashG >= totalG;
}

/**
 * カートを一括購入する(原子的更新)。全行を先にvalidateCartLinesで検証してから、
 * 既存purchaseMaterialをローカルdraftへ繰り返し適用する。途中で1回でも失敗したら
 * その理由を返して終了し、呼び出し元のstateはdraftへ一切反映しない(全件成功か全件不変)。
 */
export function purchaseCart(state: ShopEconomyState, cartLines: readonly CartLine[]): PurchaseResult {
  const validated = validateCartLines(cartLines);
  if (!validated.ok) return { ok: false, reason: validated.reason };

  const cashError = invalidNumberReason(state.cashG, '所持金');
  if (cashError) return { ok: false, reason: cashError };

  let draft = state;
  for (const line of validated.lines) {
    for (let i = 0; i < line.quantity; i++) {
      const result = purchaseMaterial(draft, line.materialId);
      if (!result.ok) return { ok: false, reason: result.reason };
      draft = result.state;
    }
  }

  return { ok: true, state: draft };
}

// ---------------------------------------------------------------------------
// サルベージ
// ---------------------------------------------------------------------------

export type SalvagePreview =
  | { readonly ok: true; readonly rate: number; readonly amountG: number }
  | { readonly ok: false; readonly reason: string };

/** spec §5.4「どんな残骸でも0にはならない」の底値保証(Suu_mot3確定、v4 §8)。 */
export function computeSalvageAmountG(priceProvisionalG: number, rate: number): number {
  return Math.max(1, Math.floor(priceProvisionalG * rate));
}

/**
 * Material+WearStateを直接受け取る版(Suu_mot3コードレビュー指摘への対応: 実在の
 * ALL_MATERIALSは価格が常に正常なため、価格異常を単体テストするにはMaterialを
 * 直接差し込める入口が要る)。previewSalvageはこれをitemId経由のMaterial解決で包む薄い層。
 */
export function previewSalvageForMaterial(material: Material, wearState: WearState | undefined): SalvagePreview {
  const priceError = invalidNumberReason(material.priceProvisionalG, '価格');
  if (priceError) return { ok: false, reason: priceError };

  const result = computeSalvageRate(material, wearState);
  if (!result.ok) return { ok: false, reason: 'この個体はサルベージできません' };
  if (!Number.isFinite(result.rate) || result.rate < 0) {
    return { ok: false, reason: '回収率データが不正です' };
  }

  const amountG = computeSalvageAmountG(material.priceProvisionalG, result.rate);
  const amountError = invalidNumberReason(amountG, '回収額の計算結果');
  if (amountError) return { ok: false, reason: amountError };

  return { ok: true, rate: result.rate, amountG };
}

export function previewSalvage(item: InventoryItem): SalvagePreview {
  const material = findMaterialForItem(item);
  if (!material) return { ok: false, reason: '対象の素材データが見つかりません' };
  return previewSalvageForMaterial(material, item.wearState);
}

// ---------------------------------------------------------------------------
// 在庫画面向け表示行(個体+スタックを統合、Material解決込み)
// ---------------------------------------------------------------------------

export interface InventoryRow {
  readonly key: string;
  readonly kind: 'item' | 'stack';
  readonly material: Material;
  readonly item?: InventoryItem;
  readonly stack?: StackableStockEntry;
}

export function buildInventoryRows(state: ShopEconomyState): InventoryRow[] {
  const itemRows: InventoryRow[] = state.items.flatMap((item) => {
    const material = findMaterialForItem(item);
    return material ? [{ key: item.itemId, kind: 'item' as const, material, item }] : [];
  });
  const stackRows: InventoryRow[] = state.stackableStock.flatMap((entry) => {
    const material = findMaterialForStock(entry);
    return material ? [{ key: `${entry.family}:${entry.materialId}`, kind: 'stack' as const, material, stack: entry }] : [];
  });
  return [...itemRows, ...stackRows];
}

export type SalvageConfirmResult =
  | { readonly ok: true; readonly state: ShopEconomyState; readonly amountG: number }
  | { readonly ok: false; readonly reason: string };

/**
 * サルベージを確定する。確認ダイアログ表示から確定までの間に対象が消えている
 * 可能性を考慮し、itemIdを再検索してから処理する(Fable推奨事項)。
 * computeSalvageRateがok:falseの場合は確定を拒否し状態を不変に保つ(Fable必須修正D)。
 */
export function confirmSalvage(state: ShopEconomyState, itemId: string): SalvageConfirmResult {
  const index = state.items.findIndex((item) => item.itemId === itemId);
  if (index < 0) {
    return { ok: false, reason: '対象が見つかりません(すでに処理された可能性があります)' };
  }

  const cashError = invalidNumberReason(state.cashG, '所持金');
  if (cashError) return { ok: false, reason: cashError };

  const preview = previewSalvage(state.items[index]);
  if (!preview.ok) {
    return { ok: false, reason: preview.reason };
  }

  const cashG = state.cashG + preview.amountG;
  const cashResultError = invalidNumberReason(cashG, 'サルベージ後の所持金');
  if (cashResultError) return { ok: false, reason: cashResultError };

  const items = state.items.filter((_, i) => i !== index);
  return { ok: true, state: { ...state, items, cashG }, amountG: preview.amountG };
}
