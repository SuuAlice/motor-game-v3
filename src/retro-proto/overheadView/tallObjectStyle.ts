// PHASE1-UNITD-REVIEW点1: G3高所オブジェクトの塗り色をdocs/phase1-plan.md §5.3・
// art-spec §5.1.1の規約(G3高所レイヤ)へ固定する。drawTallObject本体はcanvas依存の
// ためテスト対象外とし、色指定だけをこの純関数へ切り出して回帰テストする。
import { PALETTE } from '../../retro/palette';

export interface TallObjectColors {
  base: string;
  groundBand: string;
}

export function getTallObjectColors(): TallObjectColors {
  return { base: PALETTE.G3, groundBand: PALETTE.N1 };
}

// PHASE1-UNITD-REVIEW追加指摘: 高所オブジェクトの描画矩形もart-spec §2.2の
// 整数ピクセル規律に適合させる。drawTallObject本体(canvas依存)から矩形計算を
// 切り出し、camX/camYが非整数でも常に整数矩形を返すことをテストで保証する。
export interface TallObjectInput {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
}

export interface TallObjectRect {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
}

export interface TallObjectRects {
  groundBand: TallObjectRect;
  base: TallObjectRect;
}

export function computeTallObjectRects(obj: TallObjectInput, camX: number, camY: number): TallObjectRects {
  const sx = Math.round(obj.x - camX);
  const sy = Math.round(obj.y - camY);
  const widthPx = Math.round(obj.widthPx);
  const heightPx = Math.round(obj.heightPx);
  const leftX = Math.round(sx - obj.widthPx / 2);
  const groundBandHeightPx = Math.round(obj.heightPx * 0.2);
  const groundBandY = Math.round(sy - obj.heightPx * 0.15);

  return {
    groundBand: { x: leftX, y: groundBandY, widthPx, heightPx: groundBandHeightPx },
    base: { x: leftX, y: sy - heightPx, widthPx, heightPx },
  };
}
