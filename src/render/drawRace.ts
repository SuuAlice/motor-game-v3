import type { VehicleSimState } from '../engine/vehiclePhysics';
import type { TrackSegment } from '../engine/trackPhysics';

type RaceVisualSegment = TrackSegment & { hasEnergyBudget?: boolean };

export function drawRace(
  ctx: CanvasRenderingContext2D,
  state: VehicleSimState,
  courseLengthM: number,
  width: number,
  height: number,
  segment?: RaceVisualSegment,
  showHeatWarning = true,
): void {
  ctx.clearRect(0, 0, width, height);

  const roadTop = height * 0.6;
  const roadBottom = height * 0.91;

  // far層(係数0.2): 室内の壁・窓・本棚。近景の移動量180px/mに対し36px/m。
  drawRoomFarLayer(ctx, width, roadTop, state.positionM * 36);

  // near層(係数1.0): Phase3では現在のTrackSegmentから傾き・素材・凹凸を導出する。
  drawStraightCraftCourse(ctx, width, height, roadTop, roadBottom, state.positionM * 180);
  if (segment) drawSegmentSurface(ctx, width, roadTop, roadBottom, state.positionM * 180, segment);

  const progress = Math.min(1, Math.max(0, state.positionM / courseLengthM));
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.fillRect(12, 10, width - 24, 44);
  ctx.fillStyle = '#334155';
  ctx.fillRect(22, 19, width - 44, 13);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(22, 19, (width - 44) * progress, 13);
  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(22, 19, width - 44, 13);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('走行距離', 22, 47);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.max(0, state.positionM).toFixed(2)} / ${courseLengthM.toFixed(0)} m  (${(progress * 100).toFixed(0)} %)`, width - 22, 47);

  if (showHeatWarning && state.motor.batteryHeat >= 0.65) {
    ctx.fillStyle = 'rgba(254, 226, 226, 0.96)';
    ctx.fillRect(12, 62, 84, 28);
    ctx.fillStyle = '#b91c1c';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('⚠ 発熱', 20, 81);
  }

  if (state.status === 'running' && Math.abs(state.velocityMps) > 0.02) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fillRect(12, height - 38, 142, 27);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`走行中  ${state.velocityMps.toFixed(2)} m/s`, 20, height - 19);
  }
}

function drawSegmentSurface(
  ctx: CanvasRenderingContext2D,
  width: number,
  courseTop: number,
  courseBottom: number,
  scroll: number,
  segment: RaceVisualSegment,
): void {
  const innerTop = courseTop + 16;
  const innerBottom = courseBottom - 11;
  // 路面グリップが低いほど、つるつるした半透明フィルムの青みを強くする。
  if (segment.surfaceGrip < 0.9) {
    ctx.fillStyle = `rgba(186, 230, 253, ${(0.9 - segment.surfaceGrip) * 0.9})`;
    ctx.fillRect(0, innerTop, width, innerBottom - innerTop);
    ctx.strokeStyle = 'rgba(255,255,255,0.48)';
    ctx.lineWidth = 2;
    for (let x = -(scroll % 90); x < width + 90; x += 90) {
      ctx.beginPath(); ctx.moveTo(x, innerTop + 8); ctx.lineTo(x + 54, innerBottom - 8); ctx.stroke();
    }
  }

  // 細線では見落としやすいため、roughnessが高い区間は不揃いな石畳として描く。
  if (segment.roughness >= 0.5) {
    ctx.fillStyle = '#b8aa94';
    ctx.fillRect(0, innerTop, width, innerBottom - innerTop);
    const stoneWidth = 58;
    const stoneHeight = 26;
    // 近景路面として車速相当で左へ流す。各石の形状はworldColumnから決め、
    // スクロール中も石そのものが変形・点滅しないようにする。
    const offset = scroll % stoneWidth;
    const firstWorldColumn = Math.floor(scroll / stoneWidth);
    for (let row = 0; row < 3; row += 1) {
      const maxColumn = Math.ceil(width / stoneWidth) + 2;
      for (let column = -2; column <= maxColumn; column += 1) {
        const x = column * stoneWidth - offset + (row % 2) * 25;
        // 画面上の列ではなく、コース全体の通し番号で形と高さを固定する。
        // offsetが0へ戻る境界でも同じ石の属性が別の石へ飛び移らない。
        const worldColumn = firstWorldColumn + column;
        const wobble = (((worldColumn + row * 3) % 5 + 5) % 5) - 2;
        drawWornCobblestone(
          ctx,
          x + 2,
          innerTop + row * stoneHeight + wobble,
          stoneWidth - 6,
          stoneHeight - 4,
          worldColumn * 17 + row * 41,
          row % 2 === 0 ? '#c9bda8' : '#a99b85',
        );
      }
    }
  } else if (segment.roughness > 0.08) {
    ctx.strokeStyle = 'rgba(120, 83, 52, 0.35)';
    ctx.lineWidth = 2;
    for (let x = -40 - (scroll % 40); x < width + 40; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, innerTop); ctx.lineTo(x + 18, innerBottom); ctx.stroke();
    }
  }

  // サイドビューで偽の立体形状を作らず、大きな矢印で上り区間を示す。
  if (segment.slopeDeg > 0) {
    const spacing = 150;
    const offset = scroll % spacing;
    for (let x = -spacing - offset; x < width + spacing; x += spacing) {
      ctx.fillStyle = 'rgba(180, 83, 9, 0.56)';
      ctx.beginPath();
      ctx.moveTo(x + 25, innerBottom - 14);
      ctx.lineTo(x + 88, innerTop + 16);
      ctx.lineTo(x + 75, innerTop + 10);
      ctx.lineTo(x + 112, innerTop + 8);
      ctx.lineTo(x + 94, innerTop + 37);
      ctx.lineTo(x + 94, innerTop + 23);
      ctx.lineTo(x + 31, innerBottom - 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  // カーブは標識そのものではなく、前へ進みながら曲がる赤い路面矢印で示す。
  if (segment.curveRadiusM !== undefined) {
    const spacing = 190;
    const offset = scroll % spacing;
    for (let x = -spacing - offset; x < width + spacing; x += spacing) {
      const startX = x + 35;
      const startY = innerBottom - 18;
      const endX = x + 116;
      const endY = innerTop + 13;
      ctx.strokeStyle = 'rgba(220, 38, 38, 0.82)';
      ctx.fillStyle = 'rgba(220, 38, 38, 0.82)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(x + 70, startY + 5, x + 100, startY - 4, endX, endY);
      ctx.stroke();
      // 最後の制御点→終点の接線から矢じりを組み、曲線と同じ角度へ向ける。
      const tangentX = endX - (x + 100);
      const tangentY = endY - (startY - 4);
      const tangentLength = Math.hypot(tangentX, tangentY);
      const directionX = tangentX / tangentLength;
      const directionY = tangentY / tangentLength;
      const normalX = -directionY;
      const normalY = directionX;
      const baseX = endX - directionX * 15;
      const baseY = endY - directionY * 15;
      ctx.beginPath();
      ctx.moveTo(baseX + normalX * 7, baseY + normalY * 7);
      ctx.lineTo(endX, endY);
      ctx.lineTo(baseX - normalX * 7, baseY - normalY * 7);
      ctx.stroke();
    }
  }

  // 省エネ区間は銅色の電池と稲妻で、通常路面との差を即座に示す。
  if (segment.hasEnergyBudget) {
    const spacing = 145;
    const offset = scroll % spacing;
    ctx.strokeStyle = 'rgba(180, 83, 9, 0.58)';
    ctx.fillStyle = 'rgba(180, 83, 9, 0.2)';
    ctx.lineWidth = 3;
    for (let x = -spacing - offset; x < width + spacing; x += spacing) {
      ctx.fillRect(x + 35, innerTop + 19, 65, 34);
      ctx.strokeRect(x + 35, innerTop + 19, 65, 34);
      ctx.fillStyle = 'rgba(180, 83, 9, 0.58)';
      ctx.fillRect(x + 100, innerTop + 29, 7, 14);
      ctx.beginPath();
      ctx.moveTo(x + 70, innerTop + 23);
      ctx.lineTo(x + 60, innerTop + 38);
      ctx.lineTo(x + 70, innerTop + 38);
      ctx.lineTo(x + 63, innerTop + 50);
      ctx.lineTo(x + 82, innerTop + 33);
      ctx.lineTo(x + 72, innerTop + 33);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(180, 83, 9, 0.2)';
    }
  }
}

/** 欠けなし1種・角欠け2種を、走行中に変形しない固定形状で描く。 */
function drawWornCobblestone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  color: string,
): void {
  const variant = ((seed % 3) + 3) % 3;

  ctx.fillStyle = color;
  ctx.strokeStyle = '#756b5d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (variant === 0) {
    // 欠けていない石。均一すぎないよう、横長の丸石に留める。
    ctx.roundRect(x, y, width, height, 7);
  } else if (variant === 1) {
    // 左上だけが丸く欠けた石。
    ctx.moveTo(x + 16, y);
    ctx.lineTo(x + width - 7, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + 7);
    ctx.lineTo(x + width, y + height - 7);
    ctx.quadraticCurveTo(x + width, y + height, x + width - 7, y + height);
    ctx.lineTo(x + 7, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - 7);
    ctx.lineTo(x, y + 12);
    ctx.quadraticCurveTo(x + 5, y + 10, x + 7, y + 6);
    ctx.quadraticCurveTo(x + 10, y + 2, x + 16, y);
    ctx.closePath();
  } else {
    // 右下だけが丸く欠けた石。
    ctx.moveTo(x + 7, y);
    ctx.lineTo(x + width - 7, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + 7);
    ctx.lineTo(x + width, y + height - 12);
    ctx.quadraticCurveTo(x + width - 5, y + height - 10, x + width - 7, y + height - 6);
    ctx.quadraticCurveTo(x + width - 10, y + height - 2, x + width - 16, y + height);
    ctx.lineTo(x + 7, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - 7);
    ctx.lineTo(x, y + 7);
    ctx.quadraticCurveTo(x, y, x + 7, y);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();

  if (variant === 0) return;

  // 欠けた角から内側へ伸びる短い割れ目。
  ctx.strokeStyle = 'rgba(91, 78, 63, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (variant === 1) {
    ctx.moveTo(x + 7, y + 6);
    ctx.lineTo(x + 13, y + 9);
    ctx.lineTo(x + 16, y + 14);
  } else {
    ctx.moveTo(x + width - 7, y + height - 6);
    ctx.lineTo(x + width - 13, y + height - 9);
    ctx.lineTo(x + width - 16, y + height - 14);
  }
  ctx.stroke();
}

function drawStraightCraftCourse(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  courseTop: number,
  courseBottom: number,
  scroll: number,
): void {
  // 木の机。コースの外側だけに見せる。
  ctx.fillStyle = '#b98252';
  ctx.fillRect(0, courseTop - 18, width, height - courseTop + 18);
  ctx.strokeStyle = 'rgba(92, 55, 29, 0.22)';
  ctx.lineWidth = 2;
  for (let y = courseTop - 10; y < height; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(width * 0.28, y + 3, width * 0.65, y - 3, width, y + 1);
    ctx.stroke();
  }

  // 無地の画用紙をテープでつないだ水平な走路。
  ctx.fillStyle = '#ede7d7';
  ctx.fillRect(0, courseTop + 9, width, courseBottom - courseTop - 12);
  ctx.fillStyle = '#f8f3e7';
  ctx.fillRect(0, courseTop + 16, width, courseBottom - courseTop - 27);

  const courseScroll = scroll % 180;
  for (let x = -180 - courseScroll; x < width + 180; x += 180) {
    // 紙の継ぎ目と、両端を手で切った半透明の水色テープ。
    ctx.fillStyle = 'rgba(125, 211, 252, 0.48)';
    ctx.beginPath();
    ctx.moveTo(x + 159, courseTop + 12);
    ctx.lineTo(x + 163, courseTop + 16);
    ctx.lineTo(x + 159, courseTop + 20);
    ctx.lineTo(x + 163, courseTop + 24);
    ctx.lineTo(x + 159, courseTop + 28);
    ctx.lineTo(x + 163, courseBottom - 10);
    ctx.lineTo(x + 177, courseBottom - 10);
    ctx.lineTo(x + 173, courseBottom - 14);
    ctx.lineTo(x + 177, courseBottom - 18);
    ctx.lineTo(x + 173, courseTop + 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 113, 108, 0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 168, courseTop + 11);
    ctx.lineTo(x + 168, courseBottom - 7);
    ctx.stroke();

    // 手描きの距離目盛り。公道の中央線には見えない短い横線。
    ctx.fillStyle = '#475569';
    ctx.fillRect(x + 20, courseBottom - 26, 2, 11);
    ctx.fillRect(x + 50, courseBottom - 22, 2, 7);
    ctx.fillRect(x + 80, courseBottom - 22, 2, 7);
    ctx.fillRect(x + 110, courseBottom - 22, 2, 7);
    ctx.fillRect(x + 140, courseBottom - 22, 2, 7);
  }

  // 奥側の低い段ボール壁。車体を隠さない高さに抑える。
  ctx.fillStyle = '#96785c';
  ctx.fillRect(0, courseTop - 4, width, 18);
  ctx.fillStyle = '#b39a7d';
  ctx.fillRect(0, courseTop - 4, width, 7);
  // 切断面の波形。段ボールの中芯が見える表現。
  ctx.strokeStyle = '#6f5945';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -8; x <= width + 8; x += 8) {
    ctx.moveTo(x, courseTop + 1);
    ctx.quadraticCurveTo(x + 4, courseTop - 3, x + 8, courseTop + 1);
  }
  ctx.stroke();
  ctx.strokeStyle = '#66513f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, courseTop + 13);
  ctx.lineTo(width, courseTop + 13);
  ctx.stroke();

  // ロゴを使わない、かすれた梱包印刷。
  const printScroll = scroll % 260;
  ctx.fillStyle = 'rgba(66, 52, 40, 0.48)';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'left';
  for (let x = -260 - printScroll; x < width + 260; x += 260) {
    ctx.fillText('↑  ↑  工作用', x + 64, courseTop + 11);
    ctx.strokeRect(x + 132, courseTop + 4, 13, 7);
  }

  // 手前側の段ボール縁と、机へ固定する紙テープ。
  ctx.fillStyle = '#80664e';
  ctx.fillRect(0, courseBottom - 4, width, 15);
  ctx.fillStyle = '#a58a6c';
  ctx.fillRect(0, courseBottom - 4, width, 5);
  ctx.strokeStyle = '#5f4c3b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -8; x <= width + 8; x += 8) {
    ctx.moveTo(x, courseBottom);
    ctx.quadraticCurveTo(x + 4, courseBottom - 4, x + 8, courseBottom);
  }
  ctx.stroke();
  const tapeScroll = scroll % 220;
  for (let x = -220 - tapeScroll; x < width + 220; x += 220) {
    ctx.fillStyle = 'rgba(125, 211, 252, 0.5)';
    ctx.beginPath();
    ctx.moveTo(x + 48, courseBottom + 7);
    ctx.lineTo(x + 53, courseBottom + 10);
    ctx.lineTo(x + 48, courseBottom + 13);
    ctx.lineTo(x + 53, courseBottom + 17);
    ctx.lineTo(x + 90, courseBottom + 17);
    ctx.lineTo(x + 86, courseBottom + 14);
    ctx.lineTo(x + 90, courseBottom + 11);
    ctx.lineTo(x + 86, courseBottom + 7);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRoomFarLayer(ctx: CanvasRenderingContext2D, width: number, roadTop: number, scroll: number): void {
  ctx.fillStyle = '#f1eadc';
  ctx.fillRect(0, 0, width, roadTop);
  ctx.fillStyle = '#d6c7ad';
  ctx.fillRect(0, roadTop - 15, width, 15);

  const offset = scroll % 640;
  for (let x = -660 - offset; x < width + 660; x += 640) {
    // 窓。外景は抽象色のみで、屋外コースには見せない。
    ctx.fillStyle = '#a16207';
    ctx.fillRect(x + 45, 35, 190, 112);
    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(x + 53, 43, 174, 96);
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + 140, 43);
    ctx.lineTo(x + 140, 139);
    ctx.moveTo(x + 53, 91);
    ctx.lineTo(x + 227, 91);
    ctx.stroke();

    // 本棚と無地の本。実在名・ロゴは使わない。
    ctx.fillStyle = '#8a6a3d';
    ctx.fillRect(x + 350, 24, 210, roadTop - 39);
    ctx.fillStyle = '#e7d3ad';
    ctx.fillRect(x + 360, 35, 190, roadTop - 60);
    ctx.fillStyle = '#8a6a3d';
    ctx.fillRect(x + 360, 92, 190, 8);
    ctx.fillRect(x + 360, 153, 190, 8);
    const colors = ['#64748b', '#0f766e', '#b45309', '#7c3aed', '#be123c'];
    for (let shelf = 0; shelf < 3; shelf += 1) {
      for (let book = 0; book < 7; book += 1) {
        ctx.fillStyle = colors[(shelf + book) % colors.length];
        ctx.fillRect(x + 370 + book * 23, 47 + shelf * 61, 15, 42);
      }
    }
  }
}
