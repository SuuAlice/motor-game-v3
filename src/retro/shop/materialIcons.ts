// docs/phase2-ui-shop-plan.md v4 §5・Fable必須修正B: 9ファミリーを識別する最小限の
// 内製手続きドット描画。実在製品のトレードドレスは模倣しない一般的な輪郭とし、色だけに
// 依存せず輪郭差で識別できるようにする(Suu_mot3 v2レビュー確定仕様)。座標はすべて
// Math.roundで整数化し、色はPALETTE参照のみを用いる(spec §14、RGB直値禁止)。
import { PALETTE } from '../palette';
import type { MaterialFamily } from '../../materials/materials';

export type IconDrawer = (ctx: CanvasRenderingContext2D, xPx: number, yPx: number, sizePx: number) => void;

function r(value: number): number {
  return Math.round(value);
}

// 導線: コイル状の線(交互に上下する短い縦線で「巻いた線」を表す)
export function drawWireIcon(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, sizePx: number): void {
  ctx.strokeStyle = PALETTE.M1;
  ctx.lineWidth = 1;
  const loops = 4;
  const stepPx = sizePx / loops;
  ctx.beginPath();
  for (let i = 0; i <= loops; i++) {
    const cx = r(xPx + i * stepPx);
    const topY = r(yPx + sizePx * 0.2);
    const bottomY = r(yPx + sizePx * 0.8);
    ctx.moveTo(cx, i % 2 === 0 ? topY : bottomY);
    ctx.lineTo(cx, i % 2 === 0 ? bottomY : topY);
  }
  ctx.stroke();
}

// 被膜: 一般的な無地ワニス容器の輪郭(本体+首+キャップ)。実在製品ロゴ・意匠は付けない
export function drawCoatingIcon(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, sizePx: number): void {
  const bodyW = r(sizePx * 0.6);
  const bodyH = r(sizePx * 0.55);
  const bodyX = r(xPx + (sizePx - bodyW) / 2);
  const bodyY = r(yPx + sizePx * 0.4);
  const neckW = r(sizePx * 0.25);
  const neckH = r(sizePx * 0.15);
  const neckX = r(xPx + (sizePx - neckW) / 2);
  const neckY = r(bodyY - neckH);
  const capH = r(sizePx * 0.1);

  ctx.strokeStyle = PALETTE.N2;
  ctx.lineWidth = 1;
  ctx.strokeRect(bodyX, bodyY, bodyW, bodyH);
  ctx.strokeRect(neckX, neckY, neckW, neckH);
  ctx.fillStyle = PALETTE.N3;
  ctx.fillRect(neckX - 1, neckY - capH, neckW + 2, capH);
}

// 磁石: N/S二色ブロック
export function drawMagnetIcon(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, sizePx: number): void {
  const w = r(sizePx * 0.35);
  const h = r(sizePx * 0.6);
  const gap = r(sizePx * 0.06);
  const topY = r(yPx + (sizePx - h) / 2);
  const leftX = r(xPx + sizePx / 2 - w - gap / 2);
  const rightX = r(xPx + sizePx / 2 + gap / 2);
  ctx.fillStyle = PALETTE.R1;
  ctx.fillRect(leftX, topY, w, h);
  ctx.fillStyle = PALETTE.B2;
  ctx.fillRect(rightX, topY, w, h);
}

// ギヤ: 円+外周の歯(小矩形)
export function drawGearIcon(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, sizePx: number): void {
  const cx = xPx + sizePx / 2;
  const cy = yPx + sizePx / 2;
  const radius = sizePx * 0.3;
  ctx.strokeStyle = PALETTE.N4;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  const toothCount = 8;
  const toothLenPx = sizePx * 0.12;
  ctx.fillStyle = PALETTE.N4;
  for (let i = 0; i < toothCount; i++) {
    const angle = (i / toothCount) * Math.PI * 2;
    const tx = r(cx + Math.cos(angle) * radius);
    const ty = r(cy + Math.sin(angle) * radius);
    ctx.fillRect(tx - 1, ty - 1, r(toothLenPx / 2) + 1, r(toothLenPx / 2) + 1);
  }
}

// 電池: 円筒(本体+端子の突起)
export function drawBatteryIcon(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, sizePx: number): void {
  const bodyW = r(sizePx * 0.4);
  const bodyH = r(sizePx * 0.65);
  const bodyX = r(xPx + (sizePx - bodyW) / 2);
  const bodyY = r(yPx + sizePx * 0.2);
  ctx.fillStyle = PALETTE.G1;
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
  const nubW = r(bodyW * 0.4);
  const nubH = r(sizePx * 0.08);
  ctx.fillStyle = PALETTE.N3;
  ctx.fillRect(r(xPx + (sizePx - nubW) / 2), bodyY - nubH, nubW, nubH);
}

// ブラシ: 短冊(縦長の矩形)
export function drawBrushIcon(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, sizePx: number): void {
  const w = r(sizePx * 0.22);
  const h = r(sizePx * 0.6);
  ctx.fillStyle = PALETTE.M0;
  ctx.fillRect(r(xPx + (sizePx - w) / 2), r(yPx + (sizePx - h) / 2), w, h);
}

// 台紙: 波形断面(段ボールの中芯を表す折れ線)
export function drawSubstrateIcon(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, sizePx: number): void {
  ctx.strokeStyle = PALETTE.W2;
  ctx.lineWidth = 1;
  const waveCount = 4;
  const stepPx = sizePx / waveCount;
  const midY = yPx + sizePx / 2;
  const ampPx = sizePx * 0.12;
  ctx.beginPath();
  for (let i = 0; i <= waveCount; i++) {
    const x = r(xPx + i * stepPx);
    const y = r(midY + (i % 2 === 0 ? -ampPx : ampPx));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ガイドローラー: 円環(同心円2本)
export function drawRollerIcon(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, sizePx: number): void {
  const cx = xPx + sizePx / 2;
  const cy = yPx + sizePx / 2;
  ctx.strokeStyle = PALETTE.N4;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, sizePx * 0.32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, sizePx * 0.16, 0, Math.PI * 2);
  ctx.stroke();
}

// ボディ: 外形シルエット(車体を思わせる六角形)
export function drawBodyIcon(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, sizePx: number): void {
  const left = r(xPx + sizePx * 0.15);
  const right = r(xPx + sizePx * 0.85);
  const top = r(yPx + sizePx * 0.35);
  const bottom = r(yPx + sizePx * 0.75);
  const noseX = r(xPx + sizePx * 0.5);
  ctx.fillStyle = PALETTE.B1;
  ctx.beginPath();
  ctx.moveTo(noseX, r(yPx + sizePx * 0.25));
  ctx.lineTo(right, top);
  ctx.lineTo(right, bottom);
  ctx.lineTo(left, bottom);
  ctx.lineTo(left, top);
  ctx.closePath();
  ctx.fill();
}

export const MATERIAL_ICON_DRAWERS: Record<MaterialFamily, IconDrawer> = {
  wire: drawWireIcon,
  coating: drawCoatingIcon,
  magnet: drawMagnetIcon,
  gear: drawGearIcon,
  battery: drawBatteryIcon,
  brush: drawBrushIcon,
  substrate: drawSubstrateIcon,
  roller: drawRollerIcon,
  body: drawBodyIcon,
};
