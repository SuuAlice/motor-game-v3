// 在庫・サルベージ画面(棚)の描画本体。個体劣化は警告色・強調色・新規アイコンを
// 追加せず、N6紙面上の日本語ラベル+数値+単位のみで表示する(v4 §6確定仕様)。
import { PALETTE } from '../palette';
import { PIXEL_FONT_10, PIXEL_FONT_12 } from '../text/pixelFonts';
import { MATERIAL_ICON_DRAWERS } from './materialIcons';
import { formatWearState } from './formatMaterial';
import { computeRowLayout } from './layout';
import { drawScrollIndicator } from './scrollIndicator';
import { INVENTORY_HEADER_HEIGHT_PX, INVENTORY_ROW_HEIGHT_PX, ICON_SIZE_PX } from './constants';
import type { InventoryRow } from '../../store/shopEconomy';

export interface DrawInventoryOptions {
  readonly rows: readonly InventoryRow[];
  readonly contentWidthPx: number;
  readonly contentHeightPx: number;
  readonly scrollOffsetPx: number;
  readonly focusedIndex: number | null;
  readonly cashG: number;
}

function drawHeader(ctx: CanvasRenderingContext2D, contentWidthPx: number, cashG: number): void {
  ctx.fillStyle = PALETTE.N1;
  ctx.fillRect(0, 0, contentWidthPx, INVENTORY_HEADER_HEIGHT_PX);
  ctx.fillStyle = PALETTE.N7;
  ctx.font = `12px "${PIXEL_FONT_12}", sans-serif`;
  ctx.fillText(`棚(在庫・サルベージ、試遊仮経済) 所持金 ${cashG} G`, 4, INVENTORY_HEADER_HEIGHT_PX - 5);
}

export function drawInventoryScreen(ctx: CanvasRenderingContext2D, options: DrawInventoryOptions): void {
  const { rows, contentWidthPx, contentHeightPx, scrollOffsetPx, focusedIndex, cashG } = options;

  ctx.fillStyle = PALETTE.N6;
  ctx.fillRect(0, 0, contentWidthPx, contentHeightPx);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, INVENTORY_HEADER_HEIGHT_PX, contentWidthPx, contentHeightPx - INVENTORY_HEADER_HEIGHT_PX);
  ctx.clip();

  const layout = computeRowLayout(rows.length, INVENTORY_ROW_HEIGHT_PX, INVENTORY_HEADER_HEIGHT_PX, contentHeightPx, scrollOffsetPx);
  for (const rowLayout of layout) {
    if (!rowLayout.visible) continue;
    const row = rows[rowLayout.index];
    const rowTop = Math.round(rowLayout.yPx);

    if (rowLayout.index === focusedIndex) {
      ctx.fillStyle = PALETTE.N5;
      ctx.fillRect(0, rowTop, contentWidthPx, INVENTORY_ROW_HEIGHT_PX);
    }

    MATERIAL_ICON_DRAWERS[row.material.family](ctx, 2, rowTop + 2, ICON_SIZE_PX);

    ctx.fillStyle = PALETTE.N0;
    ctx.font = `10px "${PIXEL_FONT_10}", sans-serif`;
    const textX = ICON_SIZE_PX + 8;
    ctx.fillText(row.material.nameJa, textX, rowTop + 11);

    const detailLine =
      row.kind === 'item'
        ? (row.item ? formatWearState(row.item) ?? '劣化データなし' : '')
        : row.stack
          ? row.stack.family === 'wire'
            ? `在庫 ${row.stack.quantityM} m`
            : `在庫 ${row.stack.quantityMl} ml`
          : '';
    ctx.fillStyle = PALETTE.N2;
    ctx.fillText(detailLine, textX, rowTop + 22);

    if (row.kind === 'item') {
      ctx.fillStyle = PALETTE.N1;
      ctx.fillText('サルベージ操作可能', textX, rowTop + 33);
    }
  }
  ctx.restore();

  drawHeader(ctx, contentWidthPx, cashG);
  drawScrollIndicator(ctx, rows.length, INVENTORY_ROW_HEIGHT_PX, INVENTORY_HEADER_HEIGHT_PX, contentWidthPx, contentHeightPx, scrollOffsetPx);
}
