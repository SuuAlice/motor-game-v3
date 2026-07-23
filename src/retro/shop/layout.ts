// docs/phase2-ui-shop-plan.md v4 §14: カタログ/在庫一覧のスクロール・フォーカス追従・
// 確認ダイアログの画面内収まりを、横480×270/縦270×480いずれでも保証するための純関数。
// Canvas描画そのものとは分離し(Fable推奨)、テストで座標のみを検証できるようにする。
import { SCROLLBAR_MIN_THUMB_HEIGHT_PX } from './constants';

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

/** Home/Endでのジャンプ先indexを[0, itemCount-1]へクランプする(循環しない固定端)。 */
export function clampRowIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) return 0;
  return Math.min(Math.max(0, index), itemCount - 1);
}

/** ArrowUp/ArrowDownでの行移動。端では循環する(人間確定仕様2026-07-23)。 */
export function wrapRowIndex(index: number, deltaSteps: number, itemCount: number): number {
  if (itemCount <= 0) return 0;
  return ((index + deltaSteps) % itemCount + itemCount) % itemCount;
}

export interface ScrollbarGeometry {
  readonly visible: boolean;
  readonly trackYPx: number;
  readonly trackHeightPx: number;
  readonly thumbYPx: number;
  readonly thumbHeightPx: number;
}

/** スクロール可能表示(スクロールバー)の矩形を算出する。全行が収まる場合はvisible:false。 */
export function computeScrollbarGeometry(
  itemCount: number,
  rowHeightPx: number,
  headerHeightPx: number,
  contentHeightPx: number,
  scrollOffsetPx: number,
): ScrollbarGeometry {
  const trackYPx = headerHeightPx;
  const trackHeightPx = Math.max(0, contentHeightPx - headerHeightPx);
  const totalContentHeightPx = itemCount * rowHeightPx;
  const maxOffsetPx = computeMaxScrollOffsetPx(itemCount, rowHeightPx, headerHeightPx, contentHeightPx);

  if (maxOffsetPx <= 0 || trackHeightPx <= 0) {
    return { visible: false, trackYPx, trackHeightPx, thumbYPx: trackYPx, thumbHeightPx: trackHeightPx };
  }

  const thumbHeightPx = Math.max(
    SCROLLBAR_MIN_THUMB_HEIGHT_PX,
    (trackHeightPx * trackHeightPx) / totalContentHeightPx,
  );
  const scrollRatio = scrollOffsetPx / maxOffsetPx;
  const thumbYPx = trackYPx + scrollRatio * (trackHeightPx - thumbHeightPx);

  return { visible: true, trackYPx, trackHeightPx, thumbYPx, thumbHeightPx };
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
