// PHASE1-REVIEW-FIX指摘4: 人間レビューで「等方ズームの往復にしか見えず、傾いて
// 見えない」と指摘された。数値上の透視サンプリング自体は既存テストで正しいと
// 確認済みだが、(a)アニメーションが一様zoomの往復である点と(b)床材(floorPlanSource)
// が疎で収束の手がかりに乏しい点が原因と判定した(Suu承認済み仮説)。
// 対策として、密な市松床(checkerFloorSource)を使い、等方ズーム版・透視版を
// 「同一の固定zoom比」で静止画として左右に並べる比較を追加する。往復アニメーションに
// 頼らず、行ごとのタイル境界線密度の違い(奥=画面上方ほど密=細く見える)を
// 静止状態で読めることを目的とする。ラベルは色以外(テキスト)でも区別できるようにする。
import { PALETTE } from '../../retro/palette';
import { PIXEL_FONT_10 } from '../../retro/text/pixelFonts';
import {
  type AffineRowTransform,
  computePerspectiveRowTransforms,
  computeZoomRowTransforms,
  sampleRow,
} from '../../retro/mode7/affineSampler';
import { CHECKER_HEIGHT_PX, CHECKER_WIDTH_PX, getCheckerFloorPixel } from './checkerFloorSource';

export const COMPARISON_CONTENT_W = 320;
export const COMPARISON_CONTENT_H = 160;

const MARGIN_X_PX = 5;
const LABEL_Y_PX = 4;
const LABEL_SIZE_PX = 10;
const PANEL_Y_PX = 20;
export const PANEL_W_PX = 150;
export const PANEL_H_PX = 140;
const PANEL_GAP_PX = 10;

const LEFT_PANEL_X_PX = MARGIN_X_PX;
const RIGHT_PANEL_X_PX = MARGIN_X_PX + PANEL_W_PX + PANEL_GAP_PX;

const LEFT_LABEL = 'A:等方(比較用)';
const RIGHT_LABEL = 'B:透視(採用版)';

// 固定(非アニメーション)の透視比率。等方版・透視版で同一のzoom/中心/奥行き校正を
// 使うことで、行ごとのサンプリング幅(a)が変化するかどうかだけが両者の差になる。
export const COMPARISON_ZOOM = 1.6;
export const COMPARISON_CENTER_X_PX = CHECKER_WIDTH_PX / 2;
export const COMPARISON_CENTER_Y_PX = CHECKER_HEIGHT_PX - 1;
export const COMPARISON_SOURCE_DEPTH_SPAN_PX = CHECKER_HEIGHT_PX / 2;

export function computeComparisonIsotropicTransforms(): AffineRowTransform[] {
  return computeZoomRowTransforms(PANEL_W_PX, PANEL_H_PX, COMPARISON_ZOOM, COMPARISON_CENTER_X_PX, COMPARISON_CENTER_Y_PX);
}

export function computeComparisonPerspectiveTransforms(): AffineRowTransform[] {
  return computePerspectiveRowTransforms(PANEL_W_PX, PANEL_H_PX, {
    zoom: COMPARISON_ZOOM,
    centerXPx: COMPARISON_CENTER_X_PX,
    centerYPx: COMPARISON_CENTER_Y_PX,
    sourceDepthSpanPx: COMPARISON_SOURCE_DEPTH_SPAN_PX,
  });
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  originXPx: number,
  originYPx: number,
  transforms: AffineRowTransform[],
): void {
  for (let row = 0; row < PANEL_H_PX; row++) {
    const pixels = sampleRow(transforms[row], PANEL_W_PX, getCheckerFloorPixel);
    for (let x = 0; x < PANEL_W_PX; x++) {
      const color = pixels[x];
      ctx.fillStyle = color ?? PALETTE.N0;
      ctx.fillRect(originXPx + x, originYPx + row, 1, 1);
    }
  }
}

export function drawPerspectiveComparison(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, COMPARISON_CONTENT_W, COMPARISON_CONTENT_H);

  drawPanel(ctx, LEFT_PANEL_X_PX, PANEL_Y_PX, computeComparisonIsotropicTransforms());
  drawPanel(ctx, RIGHT_PANEL_X_PX, PANEL_Y_PX, computeComparisonPerspectiveTransforms());

  // ラベルは色以外(テキスト内容そのもの)で左右を区別できるようにする。
  ctx.fillStyle = PALETTE.N7;
  ctx.textBaseline = 'top';
  ctx.font = `${LABEL_SIZE_PX}px "${PIXEL_FONT_10}", sans-serif`;
  ctx.fillText(LEFT_LABEL, LEFT_PANEL_X_PX, LABEL_Y_PX);
  ctx.fillText(RIGHT_LABEL, RIGHT_PANEL_X_PX, LABEL_Y_PX);
}
