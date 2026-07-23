import { describe, expect, it } from 'vitest';
import {
  clampScrollOffsetPx,
  computeDialogRect,
  computeMaxScrollOffsetPx,
  computeRowLayout,
  computeScrollToRevealRow,
} from '../layout';
import { CATALOG_HEADER_HEIGHT_PX, CATALOG_ROW_HEIGHT_PX } from '../constants';
import { ALL_MATERIALS } from '../../../materials/materials';

describe('computeRowLayout', () => {
  it('スクロールオフセット0では先頭行がヘッダー直後に配置される', () => {
    const rows = computeRowLayout(5, 20, 10, 270, 0);
    expect(rows[0].yPx).toBe(10);
    expect(rows[0].visible).toBe(true);
  });

  it('画面外の行はvisible=falseになる', () => {
    const rows = computeRowLayout(20, 20, 10, 100, 0);
    const lastRow = rows[rows.length - 1];
    expect(lastRow.visible).toBe(false);
  });

  it('スクロールオフセット分だけ行が上へ移動する', () => {
    const withoutScroll = computeRowLayout(5, 20, 10, 270, 0);
    const withScroll = computeRowLayout(5, 20, 10, 270, 40);
    expect(withScroll[0].yPx).toBe(withoutScroll[0].yPx - 40);
  });
});

describe('computeMaxScrollOffsetPx / clampScrollOffsetPx', () => {
  it('全行が収まる場合は最大オフセット0', () => {
    expect(computeMaxScrollOffsetPx(3, 20, 10, 270)).toBe(0);
  });

  it('収まらない場合は超過分がオフセット上限になる', () => {
    const max = computeMaxScrollOffsetPx(20, 20, 10, 100);
    expect(max).toBe(20 * 20 - (100 - 10));
  });

  it('範囲外のオフセットは[0,max]へクランプされる', () => {
    expect(clampScrollOffsetPx(-50, 100)).toBe(0);
    expect(clampScrollOffsetPx(500, 100)).toBe(100);
    expect(clampScrollOffsetPx(50, 100)).toBe(50);
  });
});

describe('computeScrollToRevealRow', () => {
  it('可視範囲より下の行にフォーカスすると、その行が見えるまでスクロールする', () => {
    const offset = computeScrollToRevealRow(15, 0, 20, 10, 100, 20);
    // 行15の下端 (16*20=320) が可視領域(90px)に収まる位置まで下げる
    expect(offset).toBeGreaterThan(0);
    const rows = computeRowLayout(20, 20, 10, 100, offset);
    expect(rows[15].visible).toBe(true);
  });

  it('既に見えている行ではオフセットを変更しない', () => {
    const offset = computeScrollToRevealRow(0, 0, 20, 10, 270, 5);
    expect(offset).toBe(0);
  });

  it('可視範囲より上の行にフォーカスすると、その行が見える位置まで戻す', () => {
    const offset = computeScrollToRevealRow(0, 200, 20, 10, 100, 20);
    expect(offset).toBe(0);
  });
});

// Suu_mot3コードレビュー指摘: フォーカス追従スクロールが唯一のキーボード到達手段である場合、
// 9ファミリー全34素材(ALL_MATERIALS)の末尾行(index = length-1)まで、横480×270・縦270×480
// いずれの画面サイズでもフォーカス移動だけで到達できる必要がある。実際のカタログ画面ジオメトリ
// 定数(constants.ts)を使って検証する。
describe('末尾行までのフォーカス到達(横480×270・縦270×480)', () => {
  it.each([
    ['横480×270', 480, 270],
    ['縦270×480', 270, 480],
  ])('%s で最終行(index=%i)がフォーカス追従スクロールで可視になる', (_label, _w, contentHeightPx) => {
    const lastIndex = ALL_MATERIALS.length - 1;
    let scrollOffsetPx = 0;
    for (let index = 0; index <= lastIndex; index++) {
      scrollOffsetPx = computeScrollToRevealRow(
        index,
        scrollOffsetPx,
        CATALOG_ROW_HEIGHT_PX,
        CATALOG_HEADER_HEIGHT_PX,
        contentHeightPx,
        ALL_MATERIALS.length,
      );
    }
    const rows = computeRowLayout(ALL_MATERIALS.length, CATALOG_ROW_HEIGHT_PX, CATALOG_HEADER_HEIGHT_PX, contentHeightPx, scrollOffsetPx);
    expect(rows[lastIndex].visible).toBe(true);
  });
});

describe('computeDialogRect', () => {
  it('横480×270でダイアログが画面内に収まる', () => {
    const rect = computeDialogRect(480, 270, 200, 120);
    expect(rect.xPx).toBeGreaterThanOrEqual(0);
    expect(rect.yPx).toBeGreaterThanOrEqual(0);
    expect(rect.xPx + rect.widthPx).toBeLessThanOrEqual(480);
    expect(rect.yPx + rect.heightPx).toBeLessThanOrEqual(270);
  });

  it('縦270×480でもダイアログが画面内に収まる', () => {
    const rect = computeDialogRect(270, 480, 200, 120);
    expect(rect.xPx).toBeGreaterThanOrEqual(0);
    expect(rect.yPx).toBeGreaterThanOrEqual(0);
    expect(rect.xPx + rect.widthPx).toBeLessThanOrEqual(270);
    expect(rect.yPx + rect.heightPx).toBeLessThanOrEqual(480);
  });

  it('希望サイズがcontentより大きい場合はcontentサイズへ縮小する', () => {
    const rect = computeDialogRect(270, 480, 400, 600);
    expect(rect.widthPx).toBe(270);
    expect(rect.heightPx).toBe(480);
    expect(rect.xPx).toBe(0);
    expect(rect.yPx).toBe(0);
  });
});
