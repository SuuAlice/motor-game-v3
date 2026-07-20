// PHASE1-UNITD-REVIEW追加指摘: art-spec §2.2(整数ピクセル規律)に適合させるため、
// 乱巻き軌跡の座標算出をdrawWindingTrace.ts(canvas依存)から分離した純関数。
// 曲線(quadraticCurveTo)の始点・制御点・終点も含め、返り値をすべて整数化する
// (静止画・曲線描画も例外にしない、Suu判断)。
import type { WindingTurn } from './dummyWindingRecord';

const ARM_OFFSET_RATIO = 0.018;

export interface IntRect {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
}

export interface TurnStroke {
  recent: boolean; // true=新しいターン(明色)、false=古いターン(1段暗色)
  startX: number;
  startY: number;
  controlX: number;
  controlY: number;
  endX: number;
  endY: number;
}

export interface WindingTraceGeometry {
  stripRect: IntRect;
  axisRect: IntRect;
  strokes: TurnStroke[];
}

export function computeWindingTraceGeometry(
  turns: WindingTurn[],
  contentWidthPx: number,
  contentHeightPx: number,
): WindingTraceGeometry {
  const w = contentWidthPx;
  const h = contentHeightPx;

  const stripHeight = Math.max(2, Math.round(h * 0.05));
  const stripY = Math.round(h * 0.5);
  const stripRect: IntRect = {
    x: 0,
    y: Math.round(stripY - stripHeight / 2),
    widthPx: Math.round(w),
    heightPx: stripHeight,
  };

  const axisX = Math.round(w / 2);
  const axisTop = Math.round(h * 0.1);
  const axisBottom = Math.round(h * 0.9);
  const axisRect: IntRect = {
    x: axisX - 1,
    y: axisTop,
    widthPx: 2,
    heightPx: axisBottom - axisTop,
  };

  const topY = Math.round(h * 0.12);
  const bottomY = Math.round(h * 0.88);
  const n = turns.length;

  const strokes: TurnStroke[] = turns.map((turn, i) => {
    const cx = Math.round(turn.position * w);
    const wobble = Math.round((1 - turn.tension) * w * 0.05);
    const armOffset = Math.round(
      turn.arm === 'left' ? -w * ARM_OFFSET_RATIO : turn.arm === 'right' ? w * ARM_OFFSET_RATIO : 0,
    );

    return {
      recent: i >= n / 2,
      startX: cx - wobble + armOffset,
      startY: bottomY,
      controlX: cx + armOffset,
      controlY: topY,
      endX: cx + wobble + armOffset,
      endY: bottomY,
    };
  });

  return { stripRect, axisRect, strokes };
}
