// art-spec §7.5: Mode7層(疑似回転拡縮)。平面テクスチャの回転・拡縮・透視変形を
// 行単位のアフィン/透視サンプリングで実装する。用途は演出専用(会場紹介の俯瞰、
// リザルトのリプレイ、会場選択の見取り図ズーム)に限定し、走行ビューには使わない。
// ピクセル規律(整数座標・16方位スナップ、art-spec §2.2)の例外層であるため、
// 出力座標(destX/row)は整数だが、ソース側のサンプリングはニアレストネイバーで
// 最終的に整数座標へ丸めて参照する。

// 出力の1行(row)ごとの写像: srcX = a*destX + b, srcY = c*destX + d。
// aとcが行ごとに変化しない場合はズーム/平行移動のみ、cを行ごとに変えると
// 疑似回転を作れる(将来拡張、Phase1では未使用)。透視(床が奥へ傾いて見える表現、
// aが行ごとに変化する形)はcomputePerspectiveRowTransformsでPhase1から実使用する。
export interface AffineRowTransform {
  a: number;
  b: number;
  c: number;
  d: number;
}

// 基礎API: 全行で同一のa(拡大率)・c(=0、回転なし)を使う単純な等方ズーム行列。
// Phase1の見取り図デモ自体はcomputePerspectiveRowTransforms(下記)を使う。
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

export interface PerspectiveRowTransformOptions {
  /** 基準行(referenceRow)でのズーム倍率。 */
  zoom: number;
  /** 基準行での水平サンプリング中心(ソース座標)。 */
  centerXPx: number;
  /** 基準行(referenceRow、既定=画面最下段=手前)でサンプリングする奥行き(srcY)の基準値。 */
  centerYPx: number;
  /** ズーム値がそのまま適用される基準行(既定: 画面最下段=手前)。 */
  referenceRow?: number;
  /** 地平線オフセット(正の値必須)。大きいほど遠近効果が緩やかになる。 */
  horizonOffsetPx?: number;
  /**
   * referenceRow(手前)からrow=0(地平線側)までにソース側で進む奥行き(srcY)の量。
   * 正の値を渡すとrow=0側でcenterYPxより小さいsrcYへ、負の値を渡すと大きいsrcYへ
   * スイープする(画面奥行き方向の走査方向・範囲を制御する)。
   * 既定はoutputHeightPx * 0.5(縦方向のスイープが数px未満に潰れる退化を防ぐため、
   * 出力縦解像度に比例した十分な既定値を持たせている)。
   */
  sourceDepthSpanPx?: number;
}

// 透視ズーム: 出力行ごとにサンプリング幅(a)とソースの奥行き位置(d)が変化する、
// 床面が奥へ傾いて見える古典的なMode7透視変換。
//
// 横方向(a): 行の「奥行きdepth = row + horizonOffsetPx」が地平線(depth→0の方向)に
// 近づくほどaが大きくなり(1行が広い世界範囲を覆う=粗く見える)、手前ほどaが小さくなる
// (細かく見える)。depthConstant = baseScale * referenceDepth により、referenceRowで
// a === baseScale(=1/zoom)となるよう校正している。
//
// 縦方向(d): 「行の奥行き比 referenceDepth/depth」を横方向のスケール変化と同じ量として
// 使うが、これをそのままcenterYPxへ加算するとreferenceDepth/depthが1に近い値同士の差に
// なり(例: depth 60〜179の範囲では比は1〜約3で、そのままでは数px分しかsrcYが動かない)、
// 「見取り図がほぼ2〜3行しか読めない」退化が起きる(PHASE1-UNITF-REVIEW追加指摘)。
// これを避けるため、比の変化量(referenceDepth/depth - 1、referenceRowで0)に対して
// 明示的なsourceDepthSpanPxを掛けることで、出力の縦解像度に見合ったsrcY範囲を
// 独立に校正できるようにしている。cは0のまま(回転は今回使わない、将来拡張)。
//
// Task#MODE7-ZOOM-FIX(Suu承認): 当初はsourceDepthSpanPxの偏差にzoomを掛けていなかった
// ため、zoomを時間で往復させるアニメーション(見取り図ズーム、Mode7Demo補助表示)で
// 横方向(a)だけがzoomに応じて伸縮し、縦方向(d)は完全に固定されたままになっていた。
// 結果、画面各行が指す奥行き位置(どのsrcYを見るか)が毎フレーム不変のまま横幅だけが
// 伸縮するため、「カメラが近づく」のではなく「床が横方向にだけ歪んで見える」不具合になった
// (人間レビュー指摘)。修正として、横方向と同じbaseScale=1/zoomをsourceDepthSpanPxの
// 偏差にも掛け、水平・垂直の変化率を同期させる。referenceRowではdepthRatio-1===0のため
// zoomによらずd===centerYPxが維持される(基準行の中心座標は不変)。zoom<1(ズームアウト)
// 側でsrcYが有効範囲外に出ることはあるが、これは通常のズームアウト(より広い範囲が
// 見える)として許容し、本関数内ではクランプしない(クランプは行ごとの写像を潰し、
// 透視歪みを生むため禁止)。
export function computePerspectiveRowTransforms(
  outputWidthPx: number,
  outputHeightPx: number,
  options: PerspectiveRowTransformOptions,
): AffineRowTransform[] {
  const {
    zoom,
    centerXPx,
    centerYPx,
    referenceRow = outputHeightPx - 1,
    horizonOffsetPx = outputHeightPx * 0.5,
    sourceDepthSpanPx = outputHeightPx * 0.5,
  } = options;

  if (zoom <= 0) {
    throw new Error(`zoom must be positive, got ${zoom}`);
  }
  if (horizonOffsetPx <= 0) {
    throw new Error(`horizonOffsetPx must be positive, got ${horizonOffsetPx}`);
  }

  const baseScale = 1 / zoom;
  const referenceDepth = referenceRow + horizonOffsetPx;
  if (referenceDepth <= 0) {
    throw new Error(`referenceRow + horizonOffsetPx must be positive, got ${referenceDepth}`);
  }
  // referenceRowでrowScale===baseScaleとなるよう校正する定数(横方向)。
  const depthConstant = baseScale * referenceDepth;

  const transforms: AffineRowTransform[] = [];
  for (let row = 0; row < outputHeightPx; row++) {
    const depth = row + horizonOffsetPx;
    const rowScale = depthConstant / depth;
    const depthRatio = referenceDepth / depth; // referenceRowで1、地平線側で1より大きい
    transforms.push({
      a: rowScale,
      b: centerXPx - rowScale * (outputWidthPx / 2),
      c: 0,
      d: centerYPx - sourceDepthSpanPx * baseScale * (depthRatio - 1),
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
