// docs/phase1-plan.md §5.3 俯瞰走行ビュー試作: 壁つき周回コース、16方位スナップの
// ダミーマシン、自機追従の整数ピクセルスクロール、接地影、G3高所オブジェクトによる
// 遮蔽1点。パララックスではなく遮蔽と影で奥行きを表現する(art-spec §5.1.1改訂)。
// エンジンには接続しない(ダミーデータのみ、物理固定dtループを新設しない)。
import { PALETTE } from '../../retro/palette';
import { computeCarSpriteGeometry } from './carSprite';
import { computeTallObjectRects, getTallObjectColors } from './tallObjectStyle';
import { TRACK_HALF_WIDTH, TRACK_STRAIGHT_LENGTH, offsetPerpendicular, snapTo16Directions, type TrackPoint } from './track';

const WALL_HEIGHT_PX = 3;
const SHADOW_RADIUS_X_PX = 8;
const SHADOW_RADIUS_Y_PX = 3;

export interface TallObject {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
}

// 右コーナー付近(y=+70〜-70の間を車がスイープする区間)に置き、車が奥/手前へ
// 入れ替わる様子(遮蔽の発生と解除)を実際に観察できるようにする。
export const DUMMY_TALL_OBJECT: TallObject = {
  x: TRACK_STRAIGHT_LENGTH / 2,
  y: 8,
  widthPx: 20,
  heightPx: 46,
};

function drawFloor(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = PALETTE.W2;
  ctx.fillRect(0, 0, w, h);
}

function strokeOffsetPath(ctx: CanvasRenderingContext2D, points: TrackPoint[], side: 1 | -1, dy: number, camX: number, camY: number): void {
  ctx.beginPath();
  points.forEach((p, i) => {
    const o = offsetPerpendicular(p, TRACK_HALF_WIDTH * side);
    const sx = Math.round(o.x - camX);
    const sy = Math.round(o.y - camY) + dy;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.closePath();
  ctx.stroke();
}

function drawWalls(ctx: CanvasRenderingContext2D, points: TrackPoint[], camX: number, camY: number): void {
  ctx.lineWidth = 1;
  // 壁上端(3/4視点の立ち上がり)
  ctx.strokeStyle = PALETTE.W0;
  strokeOffsetPath(ctx, points, 1, -WALL_HEIGHT_PX, camX, camY);
  strokeOffsetPath(ctx, points, -1, -WALL_HEIGHT_PX, camX, camY);
  // 壁下端(接地線、1段暗い色)
  ctx.strokeStyle = PALETTE.N1;
  strokeOffsetPath(ctx, points, 1, 0, camX, camY);
  strokeOffsetPath(ctx, points, -1, 0, camX, camY);
}

// PHASE1-UNITD-REVIEW点2: ctx.rotateによる自由角回転(真上視点の矩形を回すだけ)を
// 廃し、16方位インデックスから車体上面(roof)・側面(wall)・前後方向(front marker)を
// 手続き的に描き分ける(computeCarSpriteGeometry、art-spec §2.2/§2.3)。
function drawCar(ctx: CanvasRenderingContext2D, screenX: number, screenY: number, headingRad: number): void {
  // 接地影(不透明N1、色演算許可リスト外のアルファは使わない)
  ctx.fillStyle = PALETTE.N1;
  ctx.beginPath();
  ctx.ellipse(screenX, screenY + 2, SHADOW_RADIUS_X_PX, SHADOW_RADIUS_Y_PX, 0, 0, Math.PI * 2);
  ctx.fill();

  const dirIndex = snapTo16Directions(headingRad);
  const geo = computeCarSpriteGeometry(dirIndex);

  // 側面(wall): 3/4視点の立ち上がり。真横視で最大幅・最大高になる
  // geoの各フィールドは既に整数(carSprite.ts)。ここでの追加演算(/2, *0.4, *0.6)は
  // 最終座標をMath.roundで丸め、fillRectへ渡す全引数を整数に保つ(art-spec §2.2)。
  ctx.fillStyle = PALETTE.R0;
  ctx.fillRect(
    Math.round(screenX - geo.wallWidthPx / 2),
    Math.round(screenY - geo.wallHeightPx),
    geo.wallWidthPx,
    geo.wallHeightPx,
  );

  // 上面(roof): wallより明るい色で一段小さく重ね、車体上面を示す
  ctx.fillStyle = PALETTE.R1;
  ctx.fillRect(
    Math.round(screenX - geo.roofWidthPx / 2),
    Math.round(screenY - geo.wallHeightPx - geo.roofHeightPx * 0.4),
    geo.roofWidthPx,
    geo.roofHeightPx,
  );

  // 前部マーカー: 進行方向ベクトルのオフセットをそのまま使い、前後方向を示す
  ctx.fillStyle = PALETTE.Y1;
  ctx.fillRect(
    Math.round(screenX + geo.frontMarkerOffsetXPx - 1),
    Math.round(screenY + geo.frontMarkerOffsetYPx - geo.wallHeightPx * 0.6 - 1),
    2,
    2,
  );
}

function drawTallObject(ctx: CanvasRenderingContext2D, obj: TallObject, camX: number, camY: number): void {
  const colors = getTallObjectColors();
  const rects = computeTallObjectRects(obj, camX, camY);
  ctx.fillStyle = colors.groundBand;
  ctx.fillRect(rects.groundBand.x, rects.groundBand.y, rects.groundBand.widthPx, rects.groundBand.heightPx);
  ctx.fillStyle = colors.base;
  ctx.fillRect(rects.base.x, rects.base.y, rects.base.widthPx, rects.base.heightPx);
}

export interface OverheadViewState {
  trackPoints: TrackPoint[];
  carIndex: number;
}

export function drawOverheadView(
  ctx: CanvasRenderingContext2D,
  state: OverheadViewState,
  contentWidthPx: number,
  contentHeightPx: number,
): void {
  const car = state.trackPoints[state.carIndex];
  // 自機追従スクロール(整数ピクセル、art-spec §2.2のサブピクセルスクロール禁止)
  const camX = Math.round(car.x - contentWidthPx / 2);
  const camY = Math.round(car.y - contentHeightPx / 2);

  ctx.clearRect(0, 0, contentWidthPx, contentHeightPx);
  drawFloor(ctx, contentWidthPx, contentHeightPx);
  drawWalls(ctx, state.trackPoints, camX, camY);

  const carScreenX = Math.round(car.x - camX);
  const carScreenY = Math.round(car.y - camY);

  // world-y(奥行き)が大きいほど手前として後に描く(遮蔽の発生/解除、G3規約)
  const objectIsFurther = DUMMY_TALL_OBJECT.y < car.y;
  if (objectIsFurther) {
    drawTallObject(ctx, DUMMY_TALL_OBJECT, camX, camY);
    drawCar(ctx, carScreenX, carScreenY, car.headingRad);
  } else {
    drawCar(ctx, carScreenX, carScreenY, car.headingRad);
    drawTallObject(ctx, DUMMY_TALL_OBJECT, camX, camY);
  }
}
