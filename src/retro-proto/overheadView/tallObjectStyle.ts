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
