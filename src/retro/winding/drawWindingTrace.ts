// art-spec §5.3: 巻線ビューはローターの側面図。1ターン=1折れ線、新しいターンほど
// 手前(明色)、古いターンは1段暗色に沈める。逆巻きターンも色では区別しない
// (見た目でほぼ分からないからこそ診断題材になる)。150ターンの交差密度が解像度で
// つぶれず「良い汚さ」に見えるかを検証する題材(PHASE1-PLAN-01-REV2【1】)。
// 座標算出はwindingTraceGeometry.tsの純関数に分離済み(整数ピクセル規律、art-spec §2.2)。
// このファイルはCanvas描画のみを行う。
import { PALETTE } from '../palette';
import { computeWindingTraceGeometry } from './windingTraceGeometry';
import type { WindingTurn } from '../../materials/windingRecord';

export function drawWindingTrace(
  ctx: CanvasRenderingContext2D,
  turns: readonly WindingTurn[],
  contentWidthPx: number,
  contentHeightPx: number,
): void {
  ctx.clearRect(0, 0, contentWidthPx, contentHeightPx);
  ctx.fillStyle = PALETTE.N6;
  ctx.fillRect(0, 0, contentWidthPx, contentHeightPx);

  const geo = computeWindingTraceGeometry(turns, contentWidthPx, contentHeightPx);

  // 台紙(短冊、段ボール想定)
  ctx.fillStyle = PALETTE.W1;
  ctx.fillRect(geo.stripRect.x, geo.stripRect.y, geo.stripRect.widthPx, geo.stripRect.heightPx);

  // 爪楊枝軸(中央の縦線)
  ctx.fillStyle = PALETTE.W2;
  ctx.fillRect(geo.axisRect.x, geo.axisRect.y, geo.axisRect.widthPx, geo.axisRect.heightPx);

  ctx.lineWidth = 1;
  for (const stroke of geo.strokes) {
    ctx.strokeStyle = stroke.recent ? PALETTE.M2 : PALETTE.M1;
    ctx.beginPath();
    ctx.moveTo(stroke.startX, stroke.startY);
    ctx.quadraticCurveTo(stroke.controlX, stroke.controlY, stroke.endX, stroke.endY);
    ctx.stroke();
  }
}
