// art-spec §5.3: 巻線ビューはローターの側面図。1ターン=1折れ線、新しいターンほど
// 手前(明色)、古いターンは1段暗色に沈める。逆巻きターンも色では区別しない
// (見た目でほぼ分からないからこそ診断題材になる)。150ターンの交差密度が解像度で
// つぶれず「良い汚さ」に見えるかを検証する題材(PHASE1-PLAN-01-REV2【1】)。
// 座標算出はwindingTraceGeometry.tsの純関数に分離済み(整数ピクセル規律、art-spec §2.2)。
// このファイルはCanvas描画のみを行う。
import { PALETTE } from '../palette';
import { computeWindingTraceGeometry, type WindingJigGeometry, type WindingJigState } from './windingTraceGeometry';
import type { WindingTurn } from '../../materials/windingRecord';

/**
 * 年代の階調(古い層→新しい層)。金属ウォーム系4色をそのまま段に使う。**新色は足さない**。
 * art-spec §5.3「新しいターンほど手前(明色)、古いターンは1段暗色に沈める」の規則どおり、
 * indexが大きいほど明るい。
 */
const AGE_COLORS = [PALETTE.M0, PALETTE.M1, PALETTE.M2, PALETTE.M3] as const;

/**
 * 巻線治具を描く。段ボール板・スロット・木の駒・輪ゴム・スイッチだけで、
 * 目盛りも数値も評価語も出さない(art-spec §5.3の手作り質感)。
 */
function drawJig(ctx: CanvasRenderingContext2D, jig: WindingJigGeometry): void {
  // 段ボール板
  ctx.fillStyle = PALETTE.W1;
  ctx.fillRect(jig.boardRect.x, jig.boardRect.y, jig.boardRect.widthPx, jig.boardRect.heightPx);

  // 導線ガイドのスロット3つ。いま使っているスロットだけ一段暗く沈め、色以外に
  // 「駒がそこに入っている」形でも分かるようにする。
  jig.slotRects.forEach((slot, index) => {
    ctx.fillStyle = index === jig.activeSlotIndex ? PALETTE.W0 : PALETTE.M4;
    ctx.fillRect(slot.x, slot.y, slot.widthPx, slot.heightPx);
  });

  // 輪ゴム(張力の保持状態)。高い張力ほど短く張る。
  ctx.fillStyle = PALETTE.N5;
  ctx.fillRect(jig.rubberBandRect.x, jig.rubberBandRect.y, jig.rubberBandRect.widthPx, jig.rubberBandRect.heightPx);

  // 導線ガイドの駒(木)
  ctx.fillStyle = PALETTE.W2;
  ctx.fillRect(jig.guideRect.x, jig.guideRect.y, jig.guideRect.widthPx, jig.guideRect.heightPx);
  ctx.fillStyle = PALETTE.W3;
  ctx.fillRect(jig.guideRect.x, jig.guideRect.y, jig.guideRect.widthPx, 1);

  // 正転/逆転スイッチ。レバーの寄る向きがdirectionを表す(色に頼らない)。
  ctx.fillStyle = PALETTE.N2;
  ctx.fillRect(jig.switchBaseRect.x, jig.switchBaseRect.y, jig.switchBaseRect.widthPx, jig.switchBaseRect.heightPx);
  ctx.fillStyle = PALETTE.N6;
  ctx.fillRect(jig.switchLeverRect.x, jig.switchLeverRect.y, jig.switchLeverRect.widthPx, jig.switchLeverRect.heightPx);
}

export function drawWindingTrace(
  ctx: CanvasRenderingContext2D,
  turns: readonly WindingTurn[],
  contentWidthPx: number,
  contentHeightPx: number,
  /** いまの保持状態。**省略時は治具を一切描かない**(巻き終えた記録の観察・静的比較題材)。 */
  jig?: WindingJigState,
): void {
  ctx.clearRect(0, 0, contentWidthPx, contentHeightPx);
  ctx.fillStyle = PALETTE.N6;
  ctx.fillRect(0, 0, contentWidthPx, contentHeightPx);

  const geo = computeWindingTraceGeometry(turns, contentWidthPx, contentHeightPx, jig);

  // 台紙(短冊、段ボール想定)
  ctx.fillStyle = PALETTE.W1;
  ctx.fillRect(geo.stripRect.x, geo.stripRect.y, geo.stripRect.widthPx, geo.stripRect.heightPx);

  // 爪楊枝軸(中央の縦線)
  ctx.fillStyle = PALETTE.W2;
  ctx.fillRect(geo.axisRect.x, geo.axisRect.y, geo.axisRect.widthPx, geo.axisRect.heightPx);

  // 治具は軌跡より先に描く(軌跡が手前に積まれる)。
  if (geo.jig !== undefined) drawJig(ctx, geo.jig);

  // P4-1B B3: 外形輪郭。軌跡より先に、最も暗い段で敷く——輪郭は「全体の膨らみ」を
  // 示す下地であり、個々のターンより手前に出ると軌跡そのものを読めなくする。
  if (geo.outline.length > 1) {
    ctx.strokeStyle = PALETTE.M0;
    ctx.beginPath();
    ctx.moveTo(geo.outline[0].x, geo.outline[0].topY);
    for (const point of geo.outline) ctx.lineTo(point.x, point.topY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(geo.outline[0].x, geo.outline[0].bottomY);
    for (const point of geo.outline) ctx.lineTo(point.x, point.bottomY);
    ctx.stroke();
  }

  ctx.lineWidth = 1;
  for (const stroke of geo.strokes) {
    ctx.strokeStyle = AGE_COLORS[stroke.ageStep];
    ctx.beginPath();
    ctx.moveTo(stroke.startX, stroke.startY);
    ctx.quadraticCurveTo(stroke.controlX, stroke.controlY, stroke.endX, stroke.endY);
    ctx.stroke();
  }

  // 中央またぎの渡り線。軸を横切る短い水平線で示す(色ではなく形で判別する)。
  ctx.strokeStyle = PALETTE.M3;
  for (const segment of geo.crossovers) {
    ctx.beginPath();
    ctx.moveTo(segment.startX, segment.y);
    ctx.lineTo(segment.endX, segment.y);
    ctx.stroke();
  }
}
