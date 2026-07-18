import type { MotorConfig, SimState } from '../engine/motorPhysics';
import { getCommutationSign, isInDeadZone } from '../engine/commutator';

// 純粋描画関数。React/DOMイベントに依存せず、渡されたCanvasContextに描くだけ。
export function drawMotor(
  ctx: CanvasRenderingContext2D,
  config: MotorConfig,
  state: SimState,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const nailLength = Math.min(width, height) * 0.6;
  const squish = 0.15 + Math.abs(Math.cos(state.theta)) * 0.85; // 疑似3Dの奥行き縮尺

  // 磁石(釘を挟む左右)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(cx - nailLength / 2 - 24, cy - 20, 16, 40);
  ctx.fillRect(cx + nailLength / 2 + 8, cy - 20, 16, 40);

  // 釘(回転軸)
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - nailLength / 2, cy);
  ctx.lineTo(cx + nailLength / 2, cy);
  ctx.stroke();

  // コイル(回転する楕円)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(squish, 1);
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, nailLength / 2, nailLength / 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 整流子(接触点)。色+アイコンの両方で状態を示す(色だけに依存しない、spec §9)
  const contactX = cx;
  const contactY = cy + nailLength / 4 + 34;
  let contactColor = '#facc15'; // 通電=黄
  let contactIcon = '●';
  if (state.shorted) {
    contactColor = '#ef4444'; // ショート=赤
    contactIcon = '⚠';
  } else if (isInDeadZone(state.theta, config.slitWidthMm) || state.current <= 0) {
    contactColor = '#cbd5e1'; // 瞬断/非通電
    contactIcon = '○';
  }

  // ブラシ(整流子に接触する2本)
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(contactX - 30, contactY + 26);
  ctx.lineTo(contactX - 6, contactY + 4);
  ctx.moveTo(contactX + 30, contactY + 26);
  ctx.lineTo(contactX + 6, contactY + 4);
  ctx.stroke();

  ctx.fillStyle = contactColor;
  ctx.beginPath();
  ctx.arc(contactX, contactY, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e293b';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(contactIcon, contactX, contactY + 4);

  // 電流パーティクル(通電中のみ、コイル経路に沿って流す)
  if (state.current > 0 && !state.shorted) {
    const sign = getCommutationSign(state.theta);
    ctx.fillStyle = '#fde047';
    for (let i = 0; i < 6; i++) {
      const t = (((state.theta * sign) / (Math.PI * 2)) * 2 + i / 6) % 1;
      const angle = t * Math.PI * 2;
      const px = cx + Math.cos(angle) * (nailLength / 2) * squish;
      const py = cy + Math.sin(angle) * (nailLength / 4);
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
