// PHASE1-UNITH-REVIEW指摘1: 最悪ケース試作のMode7/色演算インセット配置。
// 横並び(色演算を左上・Mode7を右上)が収まらない幅(縦持ち転置時など)では
// 縦積みへ切り替える。常に整数座標を返す(WorstCaseDemo.tsxから分離しテスト可能にする)。

export interface InsetPosition {
  x: number;
  y: number;
}

export interface InsetLayout {
  colorOps: InsetPosition;
  mode7: InsetPosition;
}

export interface InsetLayoutSizes {
  colorOpsWidthPx: number;
  colorOpsHeightPx: number;
  mode7WidthPx: number;
  mode7HeightPx: number;
  marginPx: number;
}

export function computeInsetLayout(contentWidthPx: number, sizes: InsetLayoutSizes): InsetLayout {
  const { colorOpsWidthPx, colorOpsHeightPx, mode7WidthPx, marginPx } = sizes;
  const sideBySideNeeded = colorOpsWidthPx + mode7WidthPx + marginPx * 3;

  if (contentWidthPx >= sideBySideNeeded) {
    return {
      colorOps: { x: marginPx, y: marginPx },
      mode7: { x: contentWidthPx - mode7WidthPx - marginPx, y: marginPx },
    };
  }
  return {
    colorOps: { x: marginPx, y: marginPx },
    mode7: { x: marginPx, y: marginPx + colorOpsHeightPx + marginPx },
  };
}
