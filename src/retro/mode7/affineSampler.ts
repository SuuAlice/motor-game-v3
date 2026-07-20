// art-spec §7.5: Mode7層(疑似回転拡縮)。平面テクスチャの回転・拡縮・透視変形を
// 行単位のアフィン/透視サンプリングで実装する。用途は演出専用(会場紹介の俯瞰、
// リザルトのリプレイ、会場選択の見取り図ズーム)に限定し、走行ビューには使わない。
// ピクセル規律(整数座標・16方位スナップ、art-spec §2.2)の例外層であるため、
// 出力座標(destX/row)は整数だが、ソース側のサンプリングはニアレストネイバーで
// 最終的に整数座標へ丸めて参照する。

// 出力の1行(row)ごとの写像: srcX = a*destX + b, srcY = c*destX + d。
// aとcが行ごとに変化しない場合はズーム/平行移動のみ、cを行ごとに変えると
// 疑似回転・透視(床が奥へ傾いて見える表現)を作れる(将来拡張、Phase1では未使用)。
export interface AffineRowTransform {
  a: number;
  b: number;
  c: number;
  d: number;
}

// ズーム演出用: 全行で同一のa(拡大率)・c(=0、回転なし)を使い、
// bとdだけを行/中心座標から算出する単純な等方ズームの行列を生成する。
export function computeZoomRowTransforms(
  outputWidthPx: number,
  outputHeightPx: number,
  zoom: number,
  centerXPx: number,
  centerYPx: number,
): AffineRowTransform[] {
  if (zoom <= 0) {
    throw new Error(`zoom must be positive, got ${zoom}`);
  }
  const scale = 1 / zoom;
  const transforms: AffineRowTransform[] = [];
  for (let row = 0; row < outputHeightPx; row++) {
    transforms.push({
      a: scale,
      b: centerXPx - scale * (outputWidthPx / 2),
      c: 0,
      d: centerYPx + scale * (row - outputHeightPx / 2),
    });
  }
  return transforms;
}

// destX(出力行内のx)から、その行の変換を使ってソース座標(ニアレストネイバー、
// 整数)を算出する純関数。
export function mapDestXToSource(transform: AffineRowTransform, destX: number): { srcX: number; srcY: number } {
  return {
    srcX: Math.round(transform.a * destX + transform.b),
    srcY: Math.round(transform.c * destX + transform.d),
  };
}

export type SourcePixelFn = (srcX: number, srcY: number) => string | null;

// 1行分をニアレストネイバーでサンプリングし、色の配列(範囲外はnull)を返す。
export function sampleRow(transform: AffineRowTransform, outputWidthPx: number, getSourcePixel: SourcePixelFn): (string | null)[] {
  const pixels: (string | null)[] = [];
  for (let destX = 0; destX < outputWidthPx; destX++) {
    const { srcX, srcY } = mapDestXToSource(transform, destX);
    pixels.push(getSourcePixel(srcX, srcY));
  }
  return pixels;
}
