// 項目3・6・8修正(Suu_mot3承認2026-07-23)で追加: カタログ/在庫共通の「スクロール可能表示」
// (スクロールバー)と「現在位置表示」(可視行レンジ/総数)。drawCatalog.ts/drawInventory.tsで
// ロジックが重複しないよう共通関数化する。
import { PALETTE } from '../palette';
import { PIXEL_FONT_10 } from '../text/pixelFonts';
import { computeRowLayout, computeScrollbarGeometry } from './layout';
import { SCROLLBAR_MARGIN_PX, SCROLLBAR_WIDTH_PX } from './constants';

export function drawScrollIndicator(
  ctx: CanvasRenderingContext2D,
  itemCount: number,
  rowHeightPx: number,
  headerHeightPx: number,
  contentWidthPx: number,
  contentHeightPx: number,
  scrollOffsetPx: number,
): void {
  const scrollbar = computeScrollbarGeometry(itemCount, rowHeightPx, headerHeightPx, contentHeightPx, scrollOffsetPx);
  if (!scrollbar.visible) return;

  const trackXPx = contentWidthPx - SCROLLBAR_WIDTH_PX - SCROLLBAR_MARGIN_PX;
  ctx.fillStyle = PALETTE.N4;
  ctx.fillRect(trackXPx, scrollbar.trackYPx, SCROLLBAR_WIDTH_PX, scrollbar.trackHeightPx);
  ctx.fillStyle = PALETTE.N1;
  ctx.fillRect(trackXPx, Math.round(scrollbar.thumbYPx), SCROLLBAR_WIDTH_PX, Math.round(scrollbar.thumbHeightPx));

  const rows = computeRowLayout(itemCount, rowHeightPx, headerHeightPx, contentHeightPx, scrollOffsetPx);
  const visibleRows = rows.filter((row) => row.visible);
  const firstIndex = visibleRows[0]?.index ?? 0;
  const lastIndex = visibleRows[visibleRows.length - 1]?.index ?? 0;
  const label = `${firstIndex + 1}-${lastIndex + 1}/${itemCount}`;

  ctx.font = `10px "${PIXEL_FONT_10}", sans-serif`;
  const labelWidthPx = ctx.measureText(label).width;
  const chipXPx = contentWidthPx - labelWidthPx - 8;
  const chipYPx = contentHeightPx - 12;

  ctx.fillStyle = PALETTE.N1;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(chipXPx - 2, chipYPx, labelWidthPx + 6, 10);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.N7;
  ctx.fillText(label, chipXPx, chipYPx + 8);
}
