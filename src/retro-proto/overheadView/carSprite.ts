// docs/phase1-plan.md §5.3 修正(PHASE1-UNITD-REVIEW点2): 16方位の車体ジオメトリを
// 純関数として決定論的に算出する。ctx.rotateによる自由角回転には依存しない
// (art-spec §2.2「回転体は方位ごとに手続き再描画」)。
// 側面(wall)の幅・高さは方位に応じて連続的に変化させ、真横視で最大(側面が
// もっとも見える3/4視点)、真上/真下視で最小(前後面寄りの見た目)にする。
// 上面(roof)はwallより一段小さく重ね、前部マーカーは進行方向ベクトルを
// そのままオフセットに使うことで前後方向を示す(art-spec §2.3の3/4視点外形)。

const BODY_LENGTH_PX = 16;
const BODY_WIDTH_PX = 9;
const WALL_HEIGHT_MIN_PX = 2;
const WALL_HEIGHT_MAX_PX = 6;
const FRONT_MARKER_RADIUS_PX = 5;

export interface CarSpriteGeometry {
  wallWidthPx: number;
  wallHeightPx: number;
  roofWidthPx: number;
  roofHeightPx: number;
  frontMarkerOffsetXPx: number;
  frontMarkerOffsetYPx: number;
}

export function computeCarSpriteGeometry(dirIndex: number): CarSpriteGeometry {
  const angle = (dirIndex * Math.PI * 2) / 16;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const profileAmount = Math.abs(dx); // 1=真横(側面最大), 0=真上/真下(前後面寄り)

  const wallWidthPx = BODY_WIDTH_PX + (BODY_LENGTH_PX - BODY_WIDTH_PX) * profileAmount;
  const wallHeightPx = WALL_HEIGHT_MIN_PX + (WALL_HEIGHT_MAX_PX - WALL_HEIGHT_MIN_PX) * profileAmount;

  return {
    wallWidthPx,
    wallHeightPx,
    roofWidthPx: wallWidthPx * 0.68,
    roofHeightPx: wallWidthPx * 0.5,
    frontMarkerOffsetXPx: dx * FRONT_MARKER_RADIUS_PX,
    frontMarkerOffsetYPx: dy * FRONT_MARKER_RADIUS_PX,
  };
}
