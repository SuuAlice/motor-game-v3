// docs/phase1-plan.md §5.4/Unit E: 色演算許可リスト検証の表示。3試作(発光・煙・夕景)を
// 演算あり/演算なし/市松ディザの3列で並べ、目視比較できるようにする。
// 座標計算はcolorOpsScenes.tsの純関数に分離済み(整数ピクセル規律、art-spec §2.2)。
import { PALETTE } from '../../retro/palette';
import { PIXEL_FONT_10 } from '../../retro/text/pixelFonts';
import { buildGlowComparison, buildSmokeComparison, buildSunsetComparison, type Cell } from './colorOpsScenes';

function drawCells(ctx: CanvasRenderingContext2D, cells: Cell[]): void {
  for (const cell of cells) {
    ctx.fillStyle = cell.color;
    ctx.fillRect(cell.x, cell.y, cell.widthPx, cell.heightPx);
  }
}

function shiftCells(cells: Cell[], dx: number): Cell[] {
  return cells.map((cell) => ({ ...cell, x: cell.x + dx }));
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = PALETTE.N0;
  ctx.font = `10px "${PIXEL_FONT_10}", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

const ROW_LABELS = ['発光(加算合成)', '煙(50%平均合成)', '夕景(50%平均合成)'] as const;
const COLUMN_LABELS = ['演算あり', '演算なし', '市松ディザ'] as const;
const ROW_HEIGHT = 60;
const COLUMN_WIDTH = 90;
const ORIGIN_X = 90;
const ORIGIN_Y = 24;

export function drawColorOpsDemo(ctx: CanvasRenderingContext2D, contentWidthPx: number, contentHeightPx: number): void {
  ctx.clearRect(0, 0, contentWidthPx, contentHeightPx);
  ctx.fillStyle = PALETTE.N7;
  ctx.fillRect(0, 0, contentWidthPx, contentHeightPx);

  const builders = [buildGlowComparison, buildSmokeComparison, buildSunsetComparison];

  builders.forEach((build, rowIndex) => {
    const rowY = ORIGIN_Y + rowIndex * ROW_HEIGHT;
    drawLabel(ctx, ROW_LABELS[rowIndex], 4, rowY + 16);

    const comparison = build(ORIGIN_X, rowY);
    drawCells(ctx, comparison.withOperation);
    drawCells(ctx, shiftCells(comparison.withoutOperation, COLUMN_WIDTH));
    drawCells(ctx, shiftCells(comparison.dither, COLUMN_WIDTH * 2));
  });

  COLUMN_LABELS.forEach((label, i) => {
    drawLabel(ctx, label, ORIGIN_X + i * COLUMN_WIDTH, 4);
  });
}
