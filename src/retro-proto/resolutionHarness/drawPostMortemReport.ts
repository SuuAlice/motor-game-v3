// spec §7.2/art-spec §5.2: 検死レポート(破壊瞬間の物理ログ)。密な日本語+計測値の
// 文字密度題材として、二層構成候補cではUI層(960×540)側で描く想定(art-spec §2.1)。
// 人間承認の追加指示(3): セグメント風数値のモックを含める。
// レイアウト算出はpostMortemLayout.tsの純関数に分離済み(整数ピクセル規律、art-spec §2.2)。
// このファイルはCanvas描画のみを行う。
import { PALETTE } from '../../retro/palette';
import { drawSegmentString } from '../../retro/text/segmentDigits';
import { PIXEL_FONT_10, PIXEL_FONT_12 } from '../../retro/text/pixelFonts';
import { computePostMortemLayout } from './postMortemLayout';

export function drawPostMortemReport(ctx: CanvasRenderingContext2D, contentWidthPx: number, contentHeightPx: number): void {
  ctx.clearRect(0, 0, contentWidthPx, contentHeightPx);

  // 「紙」様式の地(art-spec §5.2): N6地に暗色文字
  ctx.fillStyle = PALETTE.N6;
  ctx.fillRect(0, 0, contentWidthPx, contentHeightPx);

  const layout = computePostMortemLayout(contentWidthPx, contentHeightPx);

  ctx.fillStyle = PALETTE.N0;
  ctx.textBaseline = 'top';
  ctx.font = `${layout.title.sizePx}px "${PIXEL_FONT_12}", sans-serif`;
  ctx.fillText(layout.title.text, layout.title.x, layout.title.y);

  ctx.font = `${layout.bodySizePx}px "${PIXEL_FONT_10}", sans-serif`;
  for (const line of layout.bodyLines) {
    ctx.fillText(line.text, line.x, line.y);
  }

  // 計測値パネル(セグメント風数値、単色CRT様式: G2 on N0)
  ctx.fillStyle = PALETTE.N0;
  ctx.fillRect(layout.panel.x, layout.panel.y, layout.panel.widthPx, layout.panel.heightPx);

  for (const row of layout.digitRows) {
    drawSegmentString(ctx, row.text, row.x, row.y, row.digitWidthPx, row.digitHeightPx, row.gapPx, {
      onColor: PALETTE.G2,
      thicknessPx: row.thicknessPx,
    });
  }
}
