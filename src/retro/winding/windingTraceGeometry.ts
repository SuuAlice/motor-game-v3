// PHASE1-UNITD-REVIEW追加指摘: art-spec §2.2(整数ピクセル規律)に適合させるため、
// 乱巻き軌跡の座標算出をdrawWindingTrace.ts(canvas依存)から分離した純関数。
// 曲線(quadraticCurveTo)の始点・制御点・終点も含め、返り値をすべて整数化する
// (静止画・曲線描画も例外にしない、Suu判断)。
import type { WindingTurn } from '../../materials/windingRecord';

const ARM_OFFSET_RATIO = 0.018;

// Task#WINDING-AGE-RADIUS(Suu承認): 新旧ターンの明度差(recent: M2明色/M1暗色)が
// 色分けとしては実装済みでも、全ターンが同じ上下の包絡(topY/bottomY固定)を通るため
// 空間的にほぼ完全に重なり、後から描かれる新しいターン(M2)が古いターン(M1)を
// ほとんどの領域で覆い隠してしまう問題があった。armOffset(x方向、arm='left'/'right'/
// 'straddle'の左右偏り)を古さで変えると左右バランス表現が壊れるため使わず、
// 半径方向(stripY中心からcontrolY/startY・endYまでの上下距離)をターンindexに応じて
// 連続的・単調に拡大する(古いターン=内層・小さい包絡、新しいターン=外層・現行最大
// 包絡)。position/tension由来のcx・wobble(x方向の乱れ)は無変更のため、整然とした
// 同心円にはならず、右巻き/左巻きの乱雑さは維持される。
// WINDING_INNER_RADIUS_RATIO=0.4は「最古のターンでも内層として十分視認できる大きさ」
// を確保しつつ(0だと点に潰れる)、最新のターン(i=n-1)では厳密に1.0倍=現行の最大
// 包絡(topY/bottomYそのもの)に一致させ、既存の外形を超えないようにする値。
const WINDING_INNER_RADIUS_RATIO = 0.4;

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

// ターンindex(0始まり)における半径方向包絡のスケール(WINDING_INNER_RADIUS_RATIO〜1.0、
// index増加に対し単調非減少)。totalTurns<=1のときは1(該当ターンが最新かつ最古を兼ねる)。
export function computeWindingEnvelopeScale(index: number, totalTurns: number): number {
  if (totalTurns <= 1) return 1;
  const t = index / (totalTurns - 1);
  return WINDING_INNER_RADIUS_RATIO + (1 - WINDING_INNER_RADIUS_RATIO) * t;
}

export function computeWindingTraceGeometry(
  turns: readonly WindingTurn[],
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

  const maxRadius = stripY - Math.round(h * 0.12); // 現行の最大包絡(旧topY基準の半径)
  const n = turns.length;

  const strokes: TurnStroke[] = turns.map((turn, i) => {
    const cx = Math.round(turn.position * w);
    const wobble = Math.round((1 - turn.tension) * w * 0.05);
    const armOffset = Math.round(
      turn.arm === 'left' ? -w * ARM_OFFSET_RATIO : turn.arm === 'right' ? w * ARM_OFFSET_RATIO : 0,
    );
    const radius = Math.round(maxRadius * computeWindingEnvelopeScale(i, n));
    const startY = stripY + radius;
    const controlY = stripY - radius;
    const endY = stripY + radius;

    return {
      recent: i >= n / 2,
      startX: cx - wobble + armOffset,
      startY,
      controlX: cx + armOffset,
      controlY,
      endX: cx + wobble + armOffset,
      endY,
    };
  });

  return { stripRect, axisRect, strokes };
}
