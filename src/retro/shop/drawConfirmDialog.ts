// 購入・サルベージ確認ダイアログの視覚(枠+メッセージ)を描く。実際の確定/取消操作は
// DOM側のボタン(アクセシビリティ層)が担い、この関数はCanvas上の見た目のみを描く。
// 矩形はlayout.tsのcomputeDialogRectで横480×270/縦270×480いずれでも画面内に収まる
// ようクランプ済みの値を渡すこと(v4 §14)。
import { PALETTE } from '../palette';
import { PIXEL_FONT_10, PIXEL_FONT_12 } from '../text/pixelFonts';
import type { Rect } from './layout';

export function drawConfirmDialogChrome(ctx: CanvasRenderingContext2D, rect: Rect, titleJa: string, messageLines: readonly string[]): void {
  const { xPx, yPx, widthPx, heightPx } = rect;

  ctx.fillStyle = PALETTE.N1;
  ctx.fillRect(xPx - 1, yPx - 1, widthPx + 2, heightPx + 2);
  ctx.fillStyle = PALETTE.N7;
  ctx.fillRect(xPx, yPx, widthPx, heightPx);

  ctx.fillStyle = PALETTE.N0;
  ctx.font = `12px "${PIXEL_FONT_12}", sans-serif`;
  ctx.fillText(titleJa, xPx + 6, yPx + 16);

  ctx.font = `10px "${PIXEL_FONT_10}", sans-serif`;
  messageLines.forEach((line, i) => {
    ctx.fillText(line, xPx + 6, yPx + 32 + i * 12);
  });
}
