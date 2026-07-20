// spec §5.4: ガレージ拠点はクリッカブルな一枚絵(机・棚・本棚・ドア・ラジオ)。
// Phase1では解像度4案比較の描き込み密度題材として、構図のみの簡易版を試作する
// (クリック領域・シーン遷移の実装はUnit Dのスコープ外)。
// 座標算出はgarageIllustrationGeometry.tsの純関数に分離済み(整数ピクセル規律、
// art-spec §2.2)。このファイルはCanvas描画のみを行う。
import { computeGarageIllustrationGeometry } from './garageIllustrationGeometry';

export function drawGarageIllustration(ctx: CanvasRenderingContext2D, contentWidthPx: number, contentHeightPx: number): void {
  ctx.clearRect(0, 0, contentWidthPx, contentHeightPx);

  for (const shape of computeGarageIllustrationGeometry(contentWidthPx, contentHeightPx)) {
    ctx.fillStyle = shape.color;
    if (shape.kind === 'rect') {
      ctx.fillRect(shape.x, shape.y, shape.widthPx, shape.heightPx);
    } else {
      ctx.beginPath();
      ctx.arc(shape.cx, shape.cy, shape.radiusPx, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
