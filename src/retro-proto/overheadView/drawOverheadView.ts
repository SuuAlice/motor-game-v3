// docs/phase1-plan.md §5.3 俯瞰走行ビュー試作: 壁つき周回コース、16方位スナップの
// ダミーマシン、自機追従の整数ピクセルスクロール、接地影、G3高所オブジェクトによる
// 遮蔽1点。パララックスではなく遮蔽と影で奥行きを表現する(art-spec §5.1.1改訂)。
// エンジンには接続しない(ダミーデータのみ、物理固定dtループを新設しない)。
import { PALETTE } from '../../retro/palette';
import { TRACK_HALF_WIDTH, TRACK_STRAIGHT_LENGTH, offsetPerpendicular, snapTo16Directions, type TrackPoint } from './track';

const WALL_HEIGHT_PX = 3;
const CAR_WIDTH_PX = 16;
const CAR_HEIGHT_PX = 10;

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

function drawCar(ctx: CanvasRenderingContext2D, screenX: number, screenY: number, headingRad: number): void {
  // 接地影(不透明N1、色演算許可リスト外のアルファは使わない)
  ctx.fillStyle = PALETTE.N1;
  ctx.beginPath();
  ctx.ellipse(screenX, screenY + CAR_HEIGHT_PX * 0.4, CAR_WIDTH_PX * 0.5, CAR_HEIGHT_PX * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  const dirIndex = snapTo16Directions(headingRad);
  const snappedAngle = (dirIndex * Math.PI * 2) / 16;
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(snappedAngle);
  ctx.fillStyle = PALETTE.R1;
  ctx.fillRect(-CAR_WIDTH_PX / 2, -CAR_HEIGHT_PX / 2, CAR_WIDTH_PX, CAR_HEIGHT_PX);
  ctx.fillStyle = PALETTE.Y1;
  ctx.beginPath();
  ctx.moveTo(CAR_WIDTH_PX / 2, 0);
  ctx.lineTo(CAR_WIDTH_PX / 2 - CAR_WIDTH_PX * 0.28, -CAR_HEIGHT_PX * 0.4);
  ctx.lineTo(CAR_WIDTH_PX / 2 - CAR_WIDTH_PX * 0.28, CAR_HEIGHT_PX * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTallObject(ctx: CanvasRenderingContext2D, obj: TallObject, camX: number, camY: number): void {
  const sx = Math.round(obj.x - camX);
  const sy = Math.round(obj.y - camY);
  ctx.fillStyle = PALETTE.N1;
  ctx.fillRect(sx - obj.widthPx / 2, sy - obj.heightPx * 0.15, obj.widthPx, obj.heightPx * 0.2);
  ctx.fillStyle = PALETTE.G0;
  ctx.fillRect(sx - obj.widthPx / 2, sy - obj.heightPx, obj.widthPx, obj.heightPx);
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
