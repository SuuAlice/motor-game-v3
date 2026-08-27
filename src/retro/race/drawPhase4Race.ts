// P4-0 G5: 10メートル直線の走行描画。480×270・整数ピクセル・既存palette限定
// (art-spec §2.2/§3)。座標算出は`phase4RaceGeometry.ts`の純関数が持ち、
// このファイルはCanvas描画だけを行う(`drawWindingTrace.ts`と同じ分担)。
//
// ghostは**同じ固定traceの再生**であり、playerへ追従しない。勝敗はタイムが唯一の
// 出典で、この描画は判定に関与しない(UI計画§6)。
import { PALETTE } from '../palette';
import {
  computePhase4RaceGeometry,
  computeVibrationOffsetPx,
  projectPositionToX,
  type Phase4RaceGeometry,
} from './phase4RaceGeometry';

export interface Phase4RaceDrawState {
  readonly trackLengthM: number;
  readonly sectionBoundariesM: readonly number[];
  readonly playerPositionM: number;
  readonly ghostPositionM: number;
  readonly elapsedS: number;
  /** playerの軸ずれ。振動の唯一の入力(UIが巻線から計算し直さない)。 */
  readonly playerAxisOffsetMm: number;
  readonly reducedMotion: boolean;
}

/** 車1台。奥(ghost)は1段暗い色で、色以外に「点線の下線」でも区別する。 */
function drawCar(
  ctx: CanvasRenderingContext2D,
  geo: Phase4RaceGeometry,
  centerX: number,
  centerY: number,
  isGhost: boolean,
): void {
  const { wallWidthPx, wallHeightPx, roofWidthPx, roofHeightPx, frontMarkerOffsetXPx } = geo.carSprite;
  const wallX = centerX - Math.round(wallWidthPx / 2);
  const wallY = centerY - Math.round(wallHeightPx / 2);

  ctx.fillStyle = isGhost ? PALETTE.N3 : PALETTE.R1;
  ctx.fillRect(wallX, wallY, wallWidthPx, wallHeightPx);

  ctx.fillStyle = isGhost ? PALETTE.N4 : PALETTE.R2;
  ctx.fillRect(
    centerX - Math.round(roofWidthPx / 2),
    wallY - Math.round(roofHeightPx / 2),
    roofWidthPx,
    Math.max(1, Math.round(roofHeightPx / 2)),
  );

  // 前部マーカー(進行方向)。1×2pxの点で、丸め後もサブpixelへ落ちない。
  ctx.fillStyle = isGhost ? PALETTE.N5 : PALETTE.Y1;
  ctx.fillRect(centerX + frontMarkerOffsetXPx, centerY - 1, 2, 2);

  // 色以外の識別: ghostだけ車体下に破線を敷く(色覚に依存しない、§8)。
  if (isGhost) {
    ctx.fillStyle = PALETTE.N4;
    for (let x = wallX; x < wallX + wallWidthPx; x += 4) {
      ctx.fillRect(x, wallY + wallHeightPx + 1, 2, 1);
    }
  }
}

export function drawPhase4Race(
  ctx: CanvasRenderingContext2D,
  state: Phase4RaceDrawState,
  contentWidthPx: number,
  contentHeightPx: number,
): void {
  const geo = computePhase4RaceGeometry(
    contentWidthPx,
    contentHeightPx,
    state.trackLengthM,
    state.sectionBoundariesM,
  );

  // 空と地面。パララックスも遠景も持たない(1コース分の最小構成)。
  ctx.fillStyle = PALETTE.B0;
  ctx.fillRect(0, 0, contentWidthPx, geo.trackRect.y);
  ctx.fillStyle = PALETTE.W0;
  ctx.fillRect(0, geo.trackRect.y, contentWidthPx, contentHeightPx - geo.trackRect.y);

  // 走路帯
  ctx.fillStyle = PALETTE.N2;
  ctx.fillRect(geo.trackRect.x, geo.trackRect.y, geo.trackRect.widthPx, geo.trackRect.heightPx);

  // 区間境界。走行中の区間差は出さないが、区間の位置そのものは常に見えてよい。
  ctx.fillStyle = PALETTE.N4;
  for (const x of geo.sectionMarkerXs) {
    ctx.fillRect(x, geo.trackRect.y, 1, geo.trackRect.heightPx);
  }

  // start/finish。finishは市松で、色以外でも判別できる。
  ctx.fillStyle = PALETTE.N5;
  ctx.fillRect(geo.startX, geo.trackRect.y, 1, geo.trackRect.heightPx);
  for (let y = geo.trackRect.y; y < geo.trackRect.y + geo.trackRect.heightPx; y += 4) {
    ctx.fillStyle = ((y / 4) | 0) % 2 === 0 ? PALETTE.N7 : PALETTE.N0;
    ctx.fillRect(geo.finishX - 2, y, 4, 4);
  }

  const ghostX = projectPositionToX(state.ghostPositionM, state.trackLengthM, geo.startX, geo.finishX);
  const playerX = projectPositionToX(state.playerPositionM, state.trackLengthM, geo.startX, geo.finishX);
  const vibration = computeVibrationOffsetPx(state.playerAxisOffsetMm, state.elapsedS, state.reducedMotion);

  // 奥から手前の順に描く(3/4視点の重なり)。
  drawCar(ctx, geo, ghostX, geo.ghostLaneY, true);
  drawCar(ctx, geo, playerX, geo.playerLaneY + vibration, false);
}
