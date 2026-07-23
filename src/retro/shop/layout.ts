// docs/phase2-ui-shop-plan.md v4 §14: カタログ/在庫一覧のスクロール・フォーカス追従・
// 確認ダイアログの画面内収まりを、横480×270/縦270×480いずれでも保証するための純関数。
// Canvas描画そのものとは分離し(Fable推奨)、テストで座標のみを検証できるようにする。

export interface RowLayout {
  readonly index: number;
  readonly yPx: number;
  readonly visible: boolean;
}

export function computeRowLayout(
  itemCount: number,
  rowHeightPx: number,
  headerHeightPx: number,
  contentHeightPx: number,
  scrollOffsetPx: number,
): RowLayout[] {
  const rows: RowLayout[] = [];
  for (let index = 0; index < itemCount; index++) {
    const yPx = headerHeightPx + index * rowHeightPx - scrollOffsetPx;
    const visible = yPx + rowHeightPx > headerHeightPx && yPx < contentHeightPx;
    rows.push({ index, yPx, visible });
  }
  return rows;
}

export function computeMaxScrollOffsetPx(
  itemCount: number,
  rowHeightPx: number,
  headerHeightPx: number,
  contentHeightPx: number,
): number {
  const totalContentHeightPx = itemCount * rowHeightPx;
  const visibleHeightPx = Math.max(0, contentHeightPx - headerHeightPx);
  return Math.max(0, totalContentHeightPx - visibleHeightPx);
}

export function clampScrollOffsetPx(offsetPx: number, maxOffsetPx: number): number {
  return Math.min(Math.max(0, offsetPx), maxOffsetPx);
}

/** フォーカス中の行が可視範囲外なら、その行が見える最小限のスクロール量へ補正する。 */
export function computeScrollToRevealRow(
  focusedIndex: number,
  currentScrollOffsetPx: number,
  rowHeightPx: number,
  headerHeightPx: number,
  contentHeightPx: number,
  itemCount: number,
): number {
  const maxOffsetPx = computeMaxScrollOffsetPx(itemCount, rowHeightPx, headerHeightPx, contentHeightPx);
  const rowTopPx = focusedIndex * rowHeightPx;
  const rowBottomPx = rowTopPx + rowHeightPx;
  const visibleHeightPx = Math.max(0, contentHeightPx - headerHeightPx);

  let offsetPx = currentScrollOffsetPx;
  if (rowTopPx < offsetPx) offsetPx = rowTopPx;
  else if (rowBottomPx > offsetPx + visibleHeightPx) offsetPx = rowBottomPx - visibleHeightPx;

  return clampScrollOffsetPx(offsetPx, maxOffsetPx);
}

export interface Rect {
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** 確認ダイアログの矩形をcontent解像度内に収まるよう中央寄せ・クランプする。 */
export function computeDialogRect(
  contentWidthPx: number,
  contentHeightPx: number,
  preferredWidthPx: number,
  preferredHeightPx: number,
): Rect {
  const widthPx = Math.min(preferredWidthPx, contentWidthPx);
  const heightPx = Math.min(preferredHeightPx, contentHeightPx);
  return {
    xPx: Math.floor((contentWidthPx - widthPx) / 2),
    yPx: Math.floor((contentHeightPx - heightPx) / 2),
    widthPx,
    heightPx,
  };
}
