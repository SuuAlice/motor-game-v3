// art-spec §5.3: 巻線ビューはローターの側面図。1ターン=1折れ線、新しいターンほど
// 手前(明色)、古いターンは1段暗色に沈める。逆巻きターンも色では区別しない
// (見た目でほぼ分からないからこそ診断題材になる)。150ターンの交差密度が解像度で
// つぶれず「良い汚さ」に見えるかを検証する題材(PHASE1-PLAN-01-REV2【1】)。
import { PALETTE } from '../../retro/palette';
import type { WindingTurn } from './dummyWindingRecord';

const ARM_OFFSET_RATIO = 0.018;

export function drawWindingTrace(
  ctx: CanvasRenderingContext2D,
  turns: WindingTurn[],
  contentWidthPx: number,
  contentHeightPx: number,
): void {
  ctx.clearRect(0, 0, contentWidthPx, contentHeightPx);
  ctx.fillStyle = PALETTE.N6;
  ctx.fillRect(0, 0, contentWidthPx, contentHeightPx);

  // 台紙(短冊、段ボール想定)
  const stripY = contentHeightPx * 0.5;
  const stripHeight = Math.max(2, Math.round(contentHeightPx * 0.05));
  ctx.fillStyle = PALETTE.W1;
  ctx.fillRect(0, stripY - stripHeight / 2, contentWidthPx, stripHeight);

  // 爪楊枝軸(中央の縦線)
  const axisX = Math.round(contentWidthPx / 2);
  ctx.fillStyle = PALETTE.W2;
  ctx.fillRect(axisX - 1, contentHeightPx * 0.1, 2, contentHeightPx * 0.8);

  const n = turns.length;
  const topY = contentHeightPx * 0.12;
  const bottomY = contentHeightPx * 0.88;

  turns.forEach((turn, i) => {
    const isRecent = i >= n / 2;
    ctx.strokeStyle = isRecent ? PALETTE.M2 : PALETTE.M1;
    ctx.lineWidth = 1;

    const cx = turn.position * contentWidthPx;
    const wobble = (1 - turn.tension) * contentWidthPx * 0.05;
    const armOffset =
      turn.arm === 'left'
        ? -contentWidthPx * ARM_OFFSET_RATIO
        : turn.arm === 'right'
          ? contentWidthPx * ARM_OFFSET_RATIO
          : 0;

    ctx.beginPath();
    ctx.moveTo(cx - wobble + armOffset, bottomY);
    ctx.quadraticCurveTo(cx + armOffset, topY, cx + wobble + armOffset, bottomY);
    ctx.stroke();
  });
}
