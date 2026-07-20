// spec §5.4: ガレージ拠点はクリッカブルな一枚絵(机・棚・本棚・ドア・ラジオ)。
// Phase1では解像度4案比較の描き込み密度題材として、構図のみの簡易版を試作する
// (クリック領域・シーン遷移の実装はUnit Dのスコープ外)。
import { PALETTE } from '../../retro/palette';

export function drawGarageIllustration(ctx: CanvasRenderingContext2D, contentWidthPx: number, contentHeightPx: number): void {
  const w = contentWidthPx;
  const h = contentHeightPx;
  ctx.clearRect(0, 0, w, h);

  // 床(木目床、W2/W3のランプで簡易的に段を付ける)
  ctx.fillStyle = PALETTE.W2;
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  ctx.fillStyle = PALETTE.W3;
  for (let x = 0; x < w; x += Math.max(4, Math.round(w * 0.08))) {
    ctx.fillRect(x, h * 0.72, Math.max(1, Math.round(w * 0.01)), h * 0.28);
  }

  // 壁
  ctx.fillStyle = PALETTE.N6;
  ctx.fillRect(0, 0, w, h * 0.72);

  // 机(左)
  const deskX = w * 0.06;
  const deskY = h * 0.5;
  const deskW = w * 0.28;
  const deskH = h * 0.22;
  ctx.fillStyle = PALETTE.M1;
  ctx.fillRect(deskX, deskY, deskW, deskH * 0.18);
  ctx.fillStyle = PALETTE.M0;
  ctx.fillRect(deskX + deskW * 0.06, deskY + deskH * 0.18, deskW * 0.1, deskH * 0.82);
  ctx.fillRect(deskX + deskW * 0.84, deskY + deskH * 0.18, deskW * 0.1, deskH * 0.82);

  // 棚(中央、在庫)
  const shelfX = w * 0.4;
  const shelfY = h * 0.16;
  const shelfW = w * 0.2;
  const shelfH = h * 0.5;
  ctx.fillStyle = PALETTE.W1;
  ctx.fillRect(shelfX, shelfY, shelfW, shelfH);
  ctx.fillStyle = PALETTE.N4;
  for (let i = 1; i < 4; i++) {
    ctx.fillRect(shelfX, shelfY + (shelfH / 4) * i, shelfW, Math.max(1, Math.round(h * 0.01)));
  }
  // 棚の中身(部品を示す小さい四角、色+形で判別できるダミー)
  const partColors = [PALETTE.R1, PALETTE.B1, PALETTE.G1, PALETTE.Y1];
  partColors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(shelfX + shelfW * 0.15, shelfY + (shelfH / 4) * i + shelfH * 0.05, shelfW * 0.7, shelfH * 0.12);
  });

  // 本棚(右、失敗図鑑・実験ノート)
  const bookX = w * 0.68;
  const bookY = h * 0.1;
  const bookW = w * 0.14;
  const bookH = h * 0.56;
  ctx.fillStyle = PALETTE.M0;
  ctx.fillRect(bookX, bookY, bookW, bookH);
  const spineColors = [PALETTE.R0, PALETTE.B0, PALETTE.G0, PALETTE.P0, PALETTE.Y0];
  spineColors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(bookX + (bookW / spineColors.length) * i, bookY + bookH * 0.08, bookW / spineColors.length - 1, bookH * 0.84);
  });

  // ドア(右端、会場選択)
  const doorX = w * 0.86;
  const doorY = h * 0.14;
  const doorW = w * 0.1;
  const doorH = h * 0.58;
  ctx.fillStyle = PALETTE.M0;
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.fillStyle = PALETTE.M3;
  ctx.fillRect(doorX + doorW * 0.8, doorY + doorH * 0.5, Math.max(1, doorW * 0.08), Math.max(1, doorW * 0.08));

  // 正典機(段ボール台座・爪楊枝軸)を机の上に小さく配置
  const carX = deskX + deskW * 0.15;
  const carY = deskY - deskH * 0.12;
  ctx.fillStyle = PALETTE.W1;
  ctx.fillRect(carX, carY, deskW * 0.55, deskH * 0.12);
  ctx.fillStyle = PALETTE.N4;
  ctx.beginPath();
  ctx.arc(carX + deskW * 0.12, carY + deskH * 0.12, deskW * 0.05, 0, Math.PI * 2);
  ctx.arc(carX + deskW * 0.42, carY + deskH * 0.12, deskW * 0.05, 0, Math.PI * 2);
  ctx.fill();
}
