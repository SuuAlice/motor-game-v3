// カタログ画面(店)の描画本体。状態(素材一覧・スクロール・フォーカス)を受け取って
// 描くだけの関数とし、状態遷移(shopEconomy.ts)とは分離する(Fable推奨事項)。
import { PALETTE } from '../palette';
import { PIXEL_FONT_10, PIXEL_FONT_12 } from '../text/pixelFonts';
import { MATERIAL_ICON_DRAWERS } from './materialIcons';
import { formatPriceLabel, formatRepresentativeProperty } from './formatMaterial';
import { computeRowLayout } from './layout';
import { drawScrollIndicator } from './scrollIndicator';
import { CATALOG_HEADER_HEIGHT_PX, CATALOG_ROW_HEIGHT_PX, ICON_SIZE_PX } from './constants';
import type { Material } from '../../materials/materials';
import { isPurchasableFamily } from '../../store/shopEconomy';

export interface DrawCatalogOptions {
  readonly materials: readonly Material[];
  readonly contentWidthPx: number;
  readonly contentHeightPx: number;
  readonly scrollOffsetPx: number;
  readonly focusedIndex: number | null;
  readonly cashG: number;
}

function drawHeader(ctx: CanvasRenderingContext2D, contentWidthPx: number, cashG: number): void {
  ctx.fillStyle = PALETTE.N1;
  ctx.fillRect(0, 0, contentWidthPx, CATALOG_HEADER_HEIGHT_PX);
  ctx.fillStyle = PALETTE.N7;
  ctx.font = `12px "${PIXEL_FONT_12}", sans-serif`;
  ctx.fillText(`カタログ(試遊仮経済) 所持金 ${cashG} G`, 4, CATALOG_HEADER_HEIGHT_PX - 5);
}

export function drawCatalogScreen(ctx: CanvasRenderingContext2D, options: DrawCatalogOptions): void {
  const { materials, contentWidthPx, contentHeightPx, scrollOffsetPx, focusedIndex, cashG } = options;

  // N6紙面地(art-spec §5.5 パーツ通販カタログ様式)
  ctx.fillStyle = PALETTE.N6;
  ctx.fillRect(0, 0, contentWidthPx, contentHeightPx);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, CATALOG_HEADER_HEIGHT_PX, contentWidthPx, contentHeightPx - CATALOG_HEADER_HEIGHT_PX);
  ctx.clip();

  const rows = computeRowLayout(materials.length, CATALOG_ROW_HEIGHT_PX, CATALOG_HEADER_HEIGHT_PX, contentHeightPx, scrollOffsetPx);
  for (const row of rows) {
    if (!row.visible) continue;
    const material = materials[row.index];
    const rowTop = Math.round(row.yPx);

    if (row.index === focusedIndex) {
      ctx.fillStyle = PALETTE.N5;
      ctx.fillRect(0, rowTop, contentWidthPx, CATALOG_ROW_HEIGHT_PX);
    }

    MATERIAL_ICON_DRAWERS[material.family](ctx, 2, rowTop + 2, ICON_SIZE_PX);

    ctx.fillStyle = PALETTE.N0;
    ctx.font = `10px "${PIXEL_FONT_10}", sans-serif`;
    const textX = ICON_SIZE_PX + 8;
    ctx.fillText(`${material.nameJa}`, textX, rowTop + 11);

    const propertyLine = formatRepresentativeProperty(material);
    if (propertyLine) ctx.fillText(propertyLine, textX, rowTop + 22);

    const purchasable = isPurchasableFamily(material.family);
    ctx.fillStyle = purchasable ? PALETTE.N1 : PALETTE.N3;
    ctx.fillText(formatPriceLabel(material), textX, rowTop + 33);
  }
  ctx.restore();

  drawHeader(ctx, contentWidthPx, cashG);
  drawScrollIndicator(ctx, materials.length, CATALOG_ROW_HEIGHT_PX, CATALOG_HEADER_HEIGHT_PX, contentWidthPx, contentHeightPx, scrollOffsetPx);
}
