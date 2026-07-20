// spec §5.4: ガレージ拠点はクリッカブルな一枚絵(机・棚・本棚・ドア・ラジオ)。
// PHASE1-UNITD-REVIEW追加指摘: art-spec §2.2(整数ピクセル規律)に適合させるため、
// 図形の座標算出をdrawGarageIllustration.ts(canvas依存)から分離した純関数。
// 色はPALETTE参照の文字列であり座標ではないため、そのまま各図形へ含める。
import { PALETTE } from '../../retro/palette';

export interface GarageRect {
  kind: 'rect';
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
  color: string;
}

export interface GarageCircle {
  kind: 'circle';
  cx: number;
  cy: number;
  radiusPx: number;
  color: string;
}

export type GarageShape = GarageRect | GarageCircle;

function rect(x: number, y: number, widthPx: number, heightPx: number, color: string): GarageRect {
  return {
    kind: 'rect',
    x: Math.round(x),
    y: Math.round(y),
    widthPx: Math.max(1, Math.round(widthPx)),
    heightPx: Math.max(1, Math.round(heightPx)),
    color,
  };
}

function circle(cx: number, cy: number, radiusPx: number, color: string): GarageCircle {
  return { kind: 'circle', cx: Math.round(cx), cy: Math.round(cy), radiusPx: Math.max(1, Math.round(radiusPx)), color };
}

export function computeGarageIllustrationGeometry(contentWidthPx: number, contentHeightPx: number): GarageShape[] {
  const w = contentWidthPx;
  const h = contentHeightPx;
  const shapes: GarageShape[] = [];

  // 壁
  shapes.push(rect(0, 0, w, h * 0.72, PALETTE.N6));

  // 床(木目、W2/W3のランプで簡易的に段を付ける)
  shapes.push(rect(0, h * 0.72, w, h * 0.28, PALETTE.W2));
  const grainStep = Math.max(4, Math.round(w * 0.08));
  for (let x = 0; x < w; x += grainStep) {
    shapes.push(rect(x, h * 0.72, w * 0.01, h * 0.28, PALETTE.W3));
  }

  // 机(左)
  const deskX = w * 0.06;
  const deskY = h * 0.5;
  const deskW = w * 0.28;
  const deskH = h * 0.22;
  shapes.push(rect(deskX, deskY, deskW, deskH * 0.18, PALETTE.M1));
  shapes.push(rect(deskX + deskW * 0.06, deskY + deskH * 0.18, deskW * 0.1, deskH * 0.82, PALETTE.M0));
  shapes.push(rect(deskX + deskW * 0.84, deskY + deskH * 0.18, deskW * 0.1, deskH * 0.82, PALETTE.M0));

  // 棚(中央、在庫)
  const shelfX = w * 0.4;
  const shelfY = h * 0.16;
  const shelfW = w * 0.2;
  const shelfH = h * 0.5;
  shapes.push(rect(shelfX, shelfY, shelfW, shelfH, PALETTE.W1));
  for (let i = 1; i < 4; i++) {
    shapes.push(rect(shelfX, shelfY + (shelfH / 4) * i, shelfW, h * 0.01, PALETTE.N4));
  }
  const partColors = [PALETTE.R1, PALETTE.B1, PALETTE.G1, PALETTE.Y1];
  partColors.forEach((color, i) => {
    shapes.push(rect(shelfX + shelfW * 0.15, shelfY + (shelfH / 4) * i + shelfH * 0.05, shelfW * 0.7, shelfH * 0.12, color));
  });

  // 本棚(右、失敗図鑑・実験ノート)
  const bookX = w * 0.68;
  const bookY = h * 0.1;
  const bookW = w * 0.14;
  const bookH = h * 0.56;
  shapes.push(rect(bookX, bookY, bookW, bookH, PALETTE.M0));
  const spineColors = [PALETTE.R0, PALETTE.B0, PALETTE.G0, PALETTE.P0, PALETTE.Y0];
  spineColors.forEach((color, i) => {
    shapes.push(
      rect(bookX + (bookW / spineColors.length) * i, bookY + bookH * 0.08, bookW / spineColors.length - 1, bookH * 0.84, color),
    );
  });

  // ドア(右端、会場選択)
  const doorX = w * 0.86;
  const doorY = h * 0.14;
  const doorW = w * 0.1;
  const doorH = h * 0.58;
  shapes.push(rect(doorX, doorY, doorW, doorH, PALETTE.M0));
  shapes.push(rect(doorX + doorW * 0.8, doorY + doorH * 0.5, doorW * 0.08, doorW * 0.08, PALETTE.M3));

  // 正典機(段ボール台座・爪楊枝軸)を机の上に小さく配置
  const carX = deskX + deskW * 0.15;
  const carY = deskY - deskH * 0.12;
  shapes.push(rect(carX, carY, deskW * 0.55, deskH * 0.12, PALETTE.W1));
  shapes.push(circle(carX + deskW * 0.12, carY + deskH * 0.12, deskW * 0.05, PALETTE.N4));
  shapes.push(circle(carX + deskW * 0.42, carY + deskH * 0.12, deskW * 0.05, PALETTE.N4));

  return shapes;
}
