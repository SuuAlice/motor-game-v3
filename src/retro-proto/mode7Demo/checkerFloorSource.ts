// PHASE1-REVIEW-FIX指摘4: Mode7の透視効果を視覚的に明確化するための検証用床。
// 単色矩形の見取り図(floorPlanSource.ts)は遠近感を伝える線が疎だったため、
// 密な2色市松格子を追加する。古典的なMode7デモ(SNES F-ZERO等)が市松床を
// 使うのと同じ理由: タイル境界線の密度が奥(地平線側)ほど画面上で高くなる
// (=タイルが細く見える)ことで、収束・傾きが一目で分かる。
import { PALETTE } from '../../retro/palette';

const TILE_SIZE_PX = 20;
export const CHECKER_WIDTH_PX = 400;
export const CHECKER_HEIGHT_PX = 400;

export function getCheckerFloorPixel(x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= CHECKER_WIDTH_PX || y >= CHECKER_HEIGHT_PX) return null;
  const tileX = Math.floor(x / TILE_SIZE_PX);
  const tileY = Math.floor(y / TILE_SIZE_PX);
  return (tileX + tileY) % 2 === 0 ? PALETTE.N6 : PALETTE.B1;
}
