// カート内訳オーバーレイの視覚(枠+内訳+合計/残高)を描く。数量±/削除・まとめて購入・閉じるの
// 実操作はDOM側ボタン(アクセシビリティ層)が担い、この関数はCanvas上の見た目のみを描く。
import { PALETTE } from '../palette';
import { PIXEL_FONT_10, PIXEL_FONT_12 } from '../text/pixelFonts';
import { computeRowLayout, type Rect } from './layout';
import { drawScrollIndicator } from './scrollIndicator';
import { CART_CONTROLS_WIDTH_PX, CART_FOOTER_HEIGHT_PX, CART_HEADER_HEIGHT_PX, CART_ROW_HEIGHT_PX } from './constants';
import type { CartTotalLine } from '../../store/shopEconomy';
import { ALL_MATERIALS } from '../../materials/materials';

export interface DrawCartOverlayOptions {
  readonly rect: Rect;
  readonly lines: readonly CartTotalLine[];
  readonly scrollOffsetPx: number;
  readonly totalG: number | null;
  readonly cashG: number;
  readonly errorJa: string | null;
}

function nameOf(materialId: string): string {
  return ALL_MATERIALS.find((m) => m.id === materialId)?.nameJa ?? materialId;
}

export function drawCartOverlay(ctx: CanvasRenderingContext2D, options: DrawCartOverlayOptions): void {
  const { rect, lines, scrollOffsetPx, totalG, cashG, errorJa } = options;
  const { xPx, yPx, widthPx, heightPx } = rect;

  // 整数拡大後の丸め誤差で背景と枠の境目に1px隙間ができ、下のCanvas(カタログ一覧)の色が
  // 縁だけ透けて見えることがあるため、背景も枠と同じだけ外側へ広げて確実に覆う。
  ctx.fillStyle = PALETTE.N1;
  ctx.fillRect(xPx - 1, yPx - 1, widthPx + 2, heightPx + 2);
  ctx.fillStyle = PALETTE.N6;
  ctx.fillRect(xPx - 1, yPx - 1, widthPx + 2, heightPx + 2);

  ctx.save();
  ctx.translate(xPx, yPx);

  ctx.fillStyle = PALETTE.N1;
  ctx.fillRect(-1, -1, widthPx + 2, CART_HEADER_HEIGHT_PX + 1);
  ctx.fillStyle = PALETTE.N7;
  ctx.font = `12px "${PIXEL_FONT_12}", sans-serif`;
  ctx.fillText('カート内訳', 6, CART_HEADER_HEIGHT_PX - 5);

  const rowsAreaBottomPx = Math.max(CART_HEADER_HEIGHT_PX, heightPx - CART_FOOTER_HEIGHT_PX);
  const textMaxWidthPx = Math.max(0, widthPx - CART_CONTROLS_WIDTH_PX);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, CART_HEADER_HEIGHT_PX, widthPx, Math.max(0, rowsAreaBottomPx - CART_HEADER_HEIGHT_PX));
  ctx.clip();

  if (lines.length === 0) {
    ctx.fillStyle = PALETTE.N2;
    ctx.font = `10px "${PIXEL_FONT_10}", sans-serif`;
    ctx.fillText('カートは空です', 6, CART_HEADER_HEIGHT_PX + 16);
  } else {
    const rows = computeRowLayout(lines.length, CART_ROW_HEIGHT_PX, CART_HEADER_HEIGHT_PX, rowsAreaBottomPx, scrollOffsetPx);
    for (const row of rows) {
      if (!row.visible) continue;
      const line = lines[row.index];
      const rowTop = Math.round(row.yPx);
      ctx.fillStyle = PALETTE.N0;
      ctx.font = `10px "${PIXEL_FONT_10}", sans-serif`;
      ctx.fillText(nameOf(line.materialId), 6, rowTop + 13, textMaxWidthPx - 6);
      ctx.fillStyle = PALETTE.N2;
      ctx.fillText(`${line.unitPriceG} G × ${line.quantity} = ${line.subtotalG} G`, 6, rowTop + 26, textMaxWidthPx - 6);
    }
    drawScrollIndicator(ctx, lines.length, CART_ROW_HEIGHT_PX, CART_HEADER_HEIGHT_PX, textMaxWidthPx, rowsAreaBottomPx, scrollOffsetPx);
  }
  ctx.restore();

  ctx.fillStyle = PALETTE.N5;
  ctx.fillRect(0, rowsAreaBottomPx, widthPx, heightPx - rowsAreaBottomPx);
  ctx.fillStyle = PALETTE.N0;
  ctx.font = `10px "${PIXEL_FONT_10}", sans-serif`;
  if (errorJa) {
    ctx.fillText(errorJa, 6, rowsAreaBottomPx + 14);
  } else if (totalG !== null) {
    ctx.fillText(`合計 ${totalG} G`, 6, rowsAreaBottomPx + 14);
    const afterG = cashG - totalG;
    const balanceLabel = afterG >= 0 ? `購入後残高 ${afterG} G` : '購入後残高 —(所持金不足)';
    ctx.fillText(balanceLabel, 6, rowsAreaBottomPx + 28);
  }

  ctx.restore();
}
