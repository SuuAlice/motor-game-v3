// art-spec §2.1: 二層構成では「ワールドn倍のときUIはn/2倍で物理ピクセルが一致」する
// ことが求められる。nが奇数だとUI倍率が非整数になり、整数倍拡大規則(art-spec §2.2)
// と両立しない。このモジュールは整合の判定のみを提供し、破綻時の緩和策(偶数への
// 丸め・UI層の独立拡大等)は実装しない。採否は人間判断であり、ここで既定挙動として
// 固定しない(PHASE1-PLAN-01-REV2 §2 / Suuレビュー条件5)。

export interface TwoLayerAlignment {
  worldScale: number;
  /** worldScaleが偶数か。falseの場合、n/2倍のUI層は整数倍拡大規則と両立しない。 */
  isEven: boolean;
  /** 整合するUI層倍率。isEvenがfalseのときはnull(緩和策はここでは決めない)。 */
  uiScale: number | null;
}

export function checkTwoLayerAlignment(worldScale: number): TwoLayerAlignment {
  if (!Number.isInteger(worldScale) || worldScale < 1) {
    throw new Error(`worldScale must be a positive integer, got ${worldScale}`);
  }
  const isEven = worldScale % 2 === 0;
  return {
    worldScale,
    isEven,
    uiScale: isEven ? worldScale / 2 : null,
  };
}
