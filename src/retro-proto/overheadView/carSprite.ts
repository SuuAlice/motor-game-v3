// docs/phase1-plan.md §5.3 修正(PHASE1-UNITD-REVIEW点2): 16方位の車体ジオメトリを
// 純関数として決定論的に算出する。ctx.rotateによる自由角回転には依存しない
// (art-spec §2.2「回転体は方位ごとに手続き再描画」)。
// 側面(wall)の幅・高さは方位に応じて連続的に変化させ、真横視で最大(側面が
// もっとも見える3/4視点)、真上/真下視で最小(前後面寄りの見た目)にする。
// 上面(roof)はwallより一段小さく重ね、前部マーカーは進行方向ベクトルを
// そのままオフセットに使うことで前後方向を示す(art-spec §2.3の3/4視点外形)。

// PHASE1-REVIEW-FIX指摘3(人間レビュー「車が小さすぎる」への対応、承認済み寸法):
// 全長16→28px・幅9→16px・側面高最大6→10px・前部マーカー半径5→8pxへ拡大。
// トラック全幅84px(TRACK_HALF_WIDTH×2)に対し車体最大幅28pxは約33%で、
// トラック幅に対して過大にならない範囲に収まる。
const BODY_LENGTH_PX = 28;
const BODY_WIDTH_PX = 16;
const WALL_HEIGHT_MIN_PX = 3;
const WALL_HEIGHT_MAX_PX = 10;
const FRONT_MARKER_RADIUS_PX = 8;

export interface CarSpriteGeometry {
  wallWidthPx: number;
  wallHeightPx: number;
  roofWidthPx: number;
  roofHeightPx: number;
  frontMarkerOffsetXPx: number;
  frontMarkerOffsetYPx: number;
}

// PHASE1-UNITD-REVIEW追加指摘: art-spec §2.2「描画座標は常に整数ピクセル。
// サブピクセル描画禁止」に適合させるため、返り値はすべて整数へ丸める。
// 丸め後も16方位の(frontMarkerOffsetXPx, frontMarkerOffsetYPx)の組は互いに
// 異なる(単位円上の等間隔16点を半径5pxへ丸めた結果、重複しないことをテストで確認)。
export function computeCarSpriteGeometry(dirIndex: number): CarSpriteGeometry {
  const angle = (dirIndex * Math.PI * 2) / 16;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const profileAmount = Math.abs(dx); // 1=真横(側面最大), 0=真上/真下(前後面寄り)

  const wallWidthPx = Math.round(BODY_WIDTH_PX + (BODY_LENGTH_PX - BODY_WIDTH_PX) * profileAmount);
  const wallHeightPx = Math.round(WALL_HEIGHT_MIN_PX + (WALL_HEIGHT_MAX_PX - WALL_HEIGHT_MIN_PX) * profileAmount);

  return {
    wallWidthPx,
    wallHeightPx,
    roofWidthPx: Math.round(wallWidthPx * 0.68),
    roofHeightPx: Math.round(wallWidthPx * 0.5),
    frontMarkerOffsetXPx: Math.round(dx * FRONT_MARKER_RADIUS_PX),
    frontMarkerOffsetYPx: Math.round(dy * FRONT_MARKER_RADIUS_PX),
  };
}
