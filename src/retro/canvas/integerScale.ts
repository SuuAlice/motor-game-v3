// art-spec §2.1/§2.2: 表示はニアレストネイバーで整数倍拡大のみ。非整数倍は禁止し、
// 端数はレターボックスで埋める。ここでは「収まらない(scale=0)」場合も独自に1倍へ
// 補正せず、fits=falseとしてそのまま返す(呼び出し側・人間判断に委ねるため)。

export interface ScaleResult {
  /** 収まる最大整数倍率。fitsがfalseのときは0。 */
  scale: number;
  /** containerの中に等倍以上で収まるか。 */
  fits: boolean;
  /** 拡大後のコンテンツ寸法(px)。fitsがfalseのときは0。 */
  contentWidthPx: number;
  contentHeightPx: number;
  /** レターボックスの片側オフセット(px)。中央寄せ前提。 */
  offsetXPx: number;
  offsetYPx: number;
}

export function computeIntegerScale(
  containerWidthPx: number,
  containerHeightPx: number,
  contentWidthPx: number,
  contentHeightPx: number,
): ScaleResult {
  const maxScaleX = Math.floor(containerWidthPx / contentWidthPx);
  const maxScaleY = Math.floor(containerHeightPx / contentHeightPx);
  const rawScale = Math.min(maxScaleX, maxScaleY);
  const fits = rawScale >= 1;
  const scale = fits ? rawScale : 0;
  const scaledWidth = contentWidthPx * scale;
  const scaledHeight = contentHeightPx * scale;

  return {
    scale,
    fits,
    contentWidthPx: scaledWidth,
    contentHeightPx: scaledHeight,
    offsetXPx: Math.floor((containerWidthPx - scaledWidth) / 2),
    offsetYPx: Math.floor((containerHeightPx - scaledHeight) / 2),
  };
}

export interface PhysicalScaleResult extends ScaleResult {
  devicePixelRatio: number;
  cssContainerWidthPx: number;
  cssContainerHeightPx: number;
  /** cssContainer×devicePixelRatio。非整数devicePixelRatioでは非整数になりうる。 */
  physicalContainerWidthPx: number;
  physicalContainerHeightPx: number;
}

// 人間承認の追加指示(2): 整数拡大をCSSピクセル基準ではなくdevicePixelRatioを
// 反映した物理ピクセル基準でも計算できるようにし、両者を比較検証する。
// canvas.widthを物理ピクセル数で確保しニアレストネイバー拡大すれば、
// ブラウザ自身のCSS→物理ピクセルの補間(ぼやけ)を経由しない分、
// 高DPR端末で画質が上がる可能性がある一方、描画負荷はDPR^2倍程度に増える。
export function computeIntegerScalePhysical(
  cssContainerWidthPx: number,
  cssContainerHeightPx: number,
  devicePixelRatio: number,
  contentWidthPx: number,
  contentHeightPx: number,
): PhysicalScaleResult {
  const physicalContainerWidthPx = cssContainerWidthPx * devicePixelRatio;
  const physicalContainerHeightPx = cssContainerHeightPx * devicePixelRatio;
  const base = computeIntegerScale(
    physicalContainerWidthPx,
    physicalContainerHeightPx,
    contentWidthPx,
    contentHeightPx,
  );

  return {
    ...base,
    devicePixelRatio,
    cssContainerWidthPx,
    cssContainerHeightPx,
    physicalContainerWidthPx,
    physicalContainerHeightPx,
  };
}
