// art-spec §2.1: スマホ縦画面では内部解像度を縦持ち用に転置する(横画面と同一
// パレット・同一部品描画を使う)。PHASE1-UNITH-REVIEW指摘: ResolutionHarness・
// OverheadViewDemo・WorstCaseDemoが横長の内部解像度に固定されており、縦持ち
// viewport(例: 390×844)でcomputeIntegerScaleが常にfits=falseになっていた。
// コンテナの縦横比から横長解像度を転置するかどうかを決める純関数を共有する。

export interface ContentResolution {
  w: number;
  h: number;
}

// containerHeightPxがcontainerWidthPxより大きい(縦長)場合、landscapeの
// 幅高さを入れ替えて返す。等しい場合は横長のまま(landscape)を返す。
export function selectOrientedResolution(
  containerWidthPx: number,
  containerHeightPx: number,
  landscape: ContentResolution,
): ContentResolution {
  const isPortrait = containerHeightPx > containerWidthPx;
  return isPortrait ? { w: landscape.h, h: landscape.w } : { w: landscape.w, h: landscape.h };
}
