// docs/phase1-plan.md §5.5/Unit F: Mode7見取り図ズーム試作。行単位のアフィン/
// 透視ニアレストサンプリング(src/retro/mode7/affineSampler.ts、
// computePerspectiveRowTransforms)で見取り図を表示する。行によってサンプリング
// 幅(a)が変わるため、床面が奥(画面上方)へ向かって傾いて見える透視効果が実際に
// 生じる(等方ズームではなく透視ズームを使用、PHASE1-UNITF-REVIEW追加指摘対応)。
// その上に通常スプライト(会場アイコン、Mode7変形を受けない)を重ねることで
// 「Mode7層の上へ通常スプライトを重ねられる」ことを確認する。
import { PALETTE } from '../../retro/palette';
import { computePerspectiveRowTransforms, sampleRow } from '../../retro/mode7/affineSampler';
import { FLOOR_PLAN_HEIGHT_PX, FLOOR_PLAN_WIDTH_PX, getFloorPlanPixel } from './floorPlanSource';

export function drawMode7Perspective(
  ctx: CanvasRenderingContext2D,
  outputWidthPx: number,
  outputHeightPx: number,
  zoom: number,
): void {
  ctx.clearRect(0, 0, outputWidthPx, outputHeightPx);

  // 手前(referenceRow=画面最下段)は見取り図の下端付近を、奥(row=0=地平線側)は
  // 見取り図の上端付近をサンプリングするよう校正する(縦方向のスイープが数px分に
  // 潰れる退化を避け、複数の部屋配置を読めるだけの奥行き範囲を確保する)。
  const transforms = computePerspectiveRowTransforms(outputWidthPx, outputHeightPx, {
    zoom,
    centerXPx: FLOOR_PLAN_WIDTH_PX / 2,
    centerYPx: FLOOR_PLAN_HEIGHT_PX,
    sourceDepthSpanPx: FLOOR_PLAN_HEIGHT_PX / 2,
  });

  for (let row = 0; row < outputHeightPx; row++) {
    const pixels = sampleRow(transforms[row], outputWidthPx, getFloorPlanPixel);
    for (let x = 0; x < outputWidthPx; x++) {
      const color = pixels[x];
      ctx.fillStyle = color ?? PALETTE.N0; // 範囲外はレターボックス相当のN0
      ctx.fillRect(x, row, 1, 1);
    }
  }
}

// 通常スプライト(会場アイコン、Mode7変形を受けない固定サイズ描画)を
// Mode7層の上に重ねる。ここでは中央に会場選択カーソルを模した印を描く。
export function drawNormalSpriteOverlay(ctx: CanvasRenderingContext2D, outputWidthPx: number, outputHeightPx: number): void {
  const cx = Math.round(outputWidthPx / 2);
  const cy = Math.round(outputHeightPx / 2);
  const markerSize = 6;

  ctx.fillStyle = PALETTE.Y1;
  ctx.fillRect(cx - markerSize / 2, cy - 1, markerSize, 2);
  ctx.fillRect(cx - 1, cy - markerSize / 2, 2, markerSize);

  ctx.fillStyle = PALETTE.N0;
  ctx.fillRect(4, 4, 40, 10);
}

export function drawMode7Demo(
  ctx: CanvasRenderingContext2D,
  outputWidthPx: number,
  outputHeightPx: number,
  zoom: number,
): void {
  drawMode7Perspective(ctx, outputWidthPx, outputHeightPx, zoom);
  drawNormalSpriteOverlay(ctx, outputWidthPx, outputHeightPx);
}
