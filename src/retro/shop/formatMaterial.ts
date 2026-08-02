// カタログ・在庫表示の文言を組み立てる純関数(docs/phase2-ui-shop-plan.md v4 §5)。
// PendingNumericValueは数値を確定値のように見せず「未検証」と単位のみを表示し、
// VerifiedNumericValueのみ数値を表示する(art-spec §5.5・v3で確定)。
import type { Material, NumericProperty } from '../../materials/materials';
import { isPurchasableFamily, type InventoryRow } from '../../store/shopEconomy';
import type { InventoryItem, WearState } from '../../materials/inventoryItem';

export function formatNumericProperty(labelJa: string, unit: string, property: NumericProperty): string {
  if (property.verifiedForPhysics) return `${labelJa} ${property.value}${unit}`;
  return `${labelJa} 未検証(単位: ${unit})`;
}

/** ファミリーごとの代表物性1点を抜粋する(art-spec §5.5「物性抜粋」、行高制約のため1点に限定)。 */
export function formatRepresentativeProperty(material: Material): string | null {
  switch (material.family) {
    case 'wire':
      return formatNumericProperty('抵抗率', ' nΩ·m', material.resistivity);
    case 'coating':
      return formatNumericProperty('耐熱クラス', ' ℃', material.heatTolerance);
    case 'magnet':
      return formatNumericProperty('残留磁束密度Br', ' T', material.remanenceBr);
    case 'gear':
      return formatNumericProperty('密度', ' kg/m³', material.density);
    case 'substrate':
      return formatNumericProperty('密度', ' kg/m³', material.density);
    case 'body':
      return material.hasPhysicalMaterial ? formatNumericProperty('密度', ' kg/m³', material.density) : null;
    case 'battery':
    case 'brush':
    case 'roller':
      return null;
  }
}

/** 購入単位(docs/phase2-ui-shop-plan.md v4 §5): 個体パーツ1個/線材1 m/ワニス1 ml。 */
export function formatPurchaseUnit(material: Material): string {
  if (material.family === 'wire') return '1 m';
  if (material.family === 'coating') return '1 ml';
  return '1個';
}

export function formatPriceLabel(material: Material): string {
  if (!isPurchasableFamily(material.family)) return '試遊版では閲覧のみ';
  return `${material.priceProvisionalG} G / ${formatPurchaseUnit(material)}`;
}

const WEAR_LABEL: Record<WearState['kind'], string> = {
  magnet: '減磁度',
  gear: '歯欠け度',
  brush: '摩耗度',
};

function wearFraction(wearState: WearState): number {
  switch (wearState.kind) {
    case 'magnet':
      return wearState.demagnetizationFraction;
    case 'gear':
      return wearState.toothLossCount / wearState.totalToothCount;
    case 'brush':
      return wearState.wearFraction;
  }
}

/** 個体劣化表示(v4 §6確定: 警告色・強調色・新規アイコンなし、日本語ラベル+数値+単位のみ)。 */
export function formatWearState(item: InventoryItem): string | null {
  if (!item.wearState) return null;
  const percent = Math.round(wearFraction(item.wearState) * 100);
  return `${WEAR_LABEL[item.wearState.kind]} ${percent}%`;
}

/**
 * カタログ行のアクセシブルネーム。9ファミリー全てにフォーカス可能な行を用意するため
 * (Suu_mot3コードレビュー指摘: フォーカス追従だけではキーボードで末尾3ファミリーへ
 * 到達できない不具合)、購入不可ファミリーも「試遊版では閲覧のみ」を含めて返す。
 */
export function formatCatalogRowAriaLabel(material: Material): string {
  const propertyLine = formatRepresentativeProperty(material) ?? '';
  if (!isPurchasableFamily(material.family)) {
    return `${material.nameJa}、${propertyLine}、試遊版では閲覧のみ`.replace('、、', '、');
  }
  return `${material.nameJa}、${propertyLine}、${formatPriceLabel(material)}(購入単位 ${formatPurchaseUnit(material)})を選択`.replace('、、', '、');
}

function formatStockQuantity(stack: NonNullable<InventoryRow['stack']>): string {
  return stack.family === 'wire' ? `${stack.quantityM} m` : `${stack.quantityMl} ml`;
}

/** 在庫行のアクセシブルネーム。stackable行も閲覧のみとしてフォーカス可能にする(同上指摘)。 */
export function formatInventoryRowAriaLabel(row: InventoryRow): string {
  if (row.kind === 'stack' && row.stack) {
    return `${row.material.nameJa}、在庫 ${formatStockQuantity(row.stack)}(閲覧のみ)`;
  }
  if (row.kind === 'item' && row.item) {
    const wearLine = formatWearState(row.item);
    return `${row.material.nameJa}${wearLine ? `、${wearLine}` : ''}を選択(サルベージ可能)`;
  }
  return row.material.nameJa;
}
