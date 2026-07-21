// Task#17(Suu承認・全demo展開指示): 合成blit(オフスクリーンcanvas+毎フレーム
// ctx.drawImageによる拡大コピー)を廃止し、visible canvasのbacking store
// (canvas.width/height)を常にcontent解像度に保ったまま直接描画し、拡大自体は
// CSS(width/height + imageRendering:'pixelated')をブラウザcompositorへ委ねる
// 「直接低解像度Canvas方式」の共通ヘルパー。
//
// CSS基準(表示寸法=content×整数scale)はcomputeIntegerScale(integerScale.ts)を
// そのまま使えばよい(contentWidthPx/contentHeightPxが既にCSS表示寸法)。
// 物理ピクセル基準は本ファイルのcomputeDirectCanvasPhysicalCssSizeを使う。

export interface DirectCanvasPhysicalResult {
  /** 物理ピクセル基準でcontentが整数倍以上で収まるか。 */
  fits: boolean;
  /** 物理ピクセル基準での整数倍率。fits=falseのときは0。 */
  physicalScale: number;
  /** CSS表示寸法(px)。cssWidthPx×devicePixelRatio === contentWidthPx×physicalScale
   *  が常に成立する(理論上の物理表示寸法がcontent×整数physicalScaleになる保証)。 */
  cssWidthPx: number;
  cssHeightPx: number;
  /** cssWidthPx/cssHeightPxが整数CSSピクセルかどうか。devicePixelRatioが1/2/3等の
   *  整数でなければ(1.25・1.5等)非整数CSS pxになりうる。非整数のまま返し、
   *  勝手に丸めない(ごまかしの非整数縮小を避ける)。falseの場合、ブラウザの実
   *  レイアウトでの丸めにより物理ピクセル境界がずれる可能性がある既知の制約として
   *  呼び出し側・人間へ報告すること。 */
  cssWidthIsIntegerPx: boolean;
  cssHeightIsIntegerPx: boolean;
  devicePixelRatio: number;
}

const INTEGER_EPSILON = 1e-6;

function isIntegerWithinEpsilon(value: number): boolean {
  return Math.abs(value - Math.round(value)) < INTEGER_EPSILON;
}

export function computeDirectCanvasPhysicalCssSize(
  cssContainerWidthPx: number,
  cssContainerHeightPx: number,
  devicePixelRatio: number,
  contentWidthPx: number,
  contentHeightPx: number,
): DirectCanvasPhysicalResult {
  if (devicePixelRatio <= 0) {
    throw new Error(`devicePixelRatio must be positive, got ${devicePixelRatio}`);
  }

  const physicalContainerWidthPx = cssContainerWidthPx * devicePixelRatio;
  const physicalContainerHeightPx = cssContainerHeightPx * devicePixelRatio;
  const maxScaleX = Math.floor(physicalContainerWidthPx / contentWidthPx);
  const maxScaleY = Math.floor(physicalContainerHeightPx / contentHeightPx);
  const physicalScale = Math.min(maxScaleX, maxScaleY);
  const fits = physicalScale >= 1;

  if (!fits) {
    return {
      fits: false,
      physicalScale: 0,
      cssWidthPx: 0,
      cssHeightPx: 0,
      cssWidthIsIntegerPx: false,
      cssHeightIsIntegerPx: false,
      devicePixelRatio,
    };
  }

  // cssWidthPx×devicePixelRatio === contentWidthPx×physicalScale が実数演算上
  // 常に厳密成立するよう、この式(逆算)で求める。
  const cssWidthPx = (contentWidthPx * physicalScale) / devicePixelRatio;
  const cssHeightPx = (contentHeightPx * physicalScale) / devicePixelRatio;

  return {
    fits: true,
    physicalScale,
    cssWidthPx,
    cssHeightPx,
    cssWidthIsIntegerPx: isIntegerWithinEpsilon(cssWidthPx),
    cssHeightIsIntegerPx: isIntegerWithinEpsilon(cssHeightPx),
    devicePixelRatio,
  };
}

// 実際のcanvas要素へ直接Canvas方式の寸法を適用する。backing store
// (canvas.width/height)は常にcontentWidthPx/contentHeightPxのみを受け取り、
// 拡大後のCSS表示寸法を渡す引数は存在しない(型シグネチャ自体でResizeObserver
// によるscale変更時にbacking storeを表示寸法へ拡大し直せないようにする)。
export function applyDirectCanvasSize(
  canvas: HTMLCanvasElement,
  contentWidthPx: number,
  contentHeightPx: number,
  cssWidthPx: number,
  cssHeightPx: number,
): void {
  canvas.width = contentWidthPx;
  canvas.height = contentHeightPx;
  canvas.style.width = `${cssWidthPx}px`;
  canvas.style.height = `${cssHeightPx}px`;
}
