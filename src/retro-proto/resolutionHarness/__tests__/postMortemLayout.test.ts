import { describe, expect, it } from 'vitest';
import { BODY_LINES, FONT_BODY_SIZE_PX, FONT_TITLE_SIZE_PX, computePostMortemLayout } from '../postMortemLayout';

const CONTENT_RESOLUTIONS: Array<[number, number]> = [
  [320, 180],
  [480, 270],
  [640, 360],
  [960, 540],
];

describe('computePostMortemLayout', () => {
  it.each(CONTENT_RESOLUTIONS)(
    'art-spec §2.2(整数ピクセル規律): %ix%i で全出力値が整数になる(fillText座標を含む)',
    (w, h) => {
      const layout = computePostMortemLayout(w, h);

      const { text: _titleText, ...titleNumeric } = layout.title;
      for (const [key, value] of Object.entries(titleNumeric)) {
        expect(Number.isInteger(value), `title.${key}が整数ではない: ${value}`).toBe(true);
      }
      expect(Number.isInteger(layout.bodySizePx)).toBe(true);

      for (const line of layout.bodyLines) {
        expect(Number.isInteger(line.x), `bodyLine.x`).toBe(true);
        expect(Number.isInteger(line.y), `bodyLine.y`).toBe(true);
      }

      for (const [key, value] of Object.entries(layout.panel)) {
        expect(Number.isInteger(value), `panel.${key}が整数ではない: ${value}`).toBe(true);
      }

      for (const row of layout.digitRows) {
        const { text: _rowText, ...rowNumeric } = row;
        for (const [key, value] of Object.entries(rowNumeric)) {
          expect(Number.isInteger(value), `digitRow.${key}が整数ではない: ${value}`).toBe(true);
        }
      }
    },
  );

  it('本文行の縦位置は単調増加する(重なりなし)', () => {
    const layout = computePostMortemLayout(480, 270);
    for (let i = 1; i < layout.bodyLines.length; i++) {
      expect(layout.bodyLines[i].y).toBeGreaterThan(layout.bodyLines[i - 1].y);
    }
  });

  // PHASE1-REVIEW-FIX指摘2: フォントサイズは候補によらず常に固定(ネイティブ
  // 10px/12px)。解像度に応じて動的スケールしない(ビットマップ内蔵フォントの
  // ぼやけを避けるため)。
  it.each(CONTENT_RESOLUTIONS)('%ix%i でもフォントサイズはtitle=12px・body=10pxで固定される(既知値)', (w, h) => {
    const layout = computePostMortemLayout(w, h);
    expect(layout.title.sizePx).toBe(FONT_TITLE_SIZE_PX);
    expect(layout.title.sizePx).toBe(12);
    expect(layout.bodySizePx).toBe(FONT_BODY_SIZE_PX);
    expect(layout.bodySizePx).toBe(10);
  });

  // フォントサイズを固定したことで、低解像度候補では全行が入りきらず、
  // 高解像度候補ほど多くの行が表示できる(情報量の違いが可視化される)。
  it('低解像度(320×180)は全13行が入りきらず、省略+「残りN行」表示になる(既知値)', () => {
    const layout = computePostMortemLayout(320, 180);
    expect(layout.omittedLineCount).toBeGreaterThan(0);
    const lastLine = layout.bodyLines[layout.bodyLines.length - 1];
    expect(lastLine.text).toBe(`…残り${layout.omittedLineCount}行`);
    // 「残り」表示を除いた本文行は、すべて元のBODY_LINESの先頭からの完全な行であり
    // 途中で切れていない
    const contentLines = layout.bodyLines.slice(0, -1);
    for (let i = 0; i < contentLines.length; i++) {
      expect(contentLines[i].text).toBe(BODY_LINES[i]);
    }
  });

  it.each([
    [480, 270],
    [640, 360],
    [960, 540],
  ])('%ix%i以上では全13行が省略なく表示される(既知値)', (w, h) => {
    const layout = computePostMortemLayout(w, h);
    expect(layout.omittedLineCount).toBe(0);
    expect(layout.bodyLines).toHaveLength(BODY_LINES.length);
    expect(layout.bodyLines.map((l) => l.text)).toEqual([...BODY_LINES]);
  });

  it('解像度が上がるほど表示できる行数(情報量)が増えるか同じになる(単調性)', () => {
    let previousCount = 0;
    for (const [w, h] of CONTENT_RESOLUTIONS) {
      const layout = computePostMortemLayout(w, h);
      expect(layout.bodyLines.length).toBeGreaterThanOrEqual(previousCount);
      previousCount = layout.bodyLines.length;
    }
  });

  it('1行も収まらないほど小さい場合は本文行を描画せず、「残り」表示も付けない(境界値)', () => {
    const layout = computePostMortemLayout(100, 10);
    expect(layout.bodyLines).toHaveLength(0);
    expect(layout.omittedLineCount).toBe(0);
  });

  it('途中で切れた行(部分文字列)は描画しない', () => {
    for (const [w, h] of CONTENT_RESOLUTIONS) {
      const layout = computePostMortemLayout(w, h);
      for (const line of layout.bodyLines) {
        const isOmittedIndicator = /^…残り\d+行$/.test(line.text);
        const isCompleteOriginalLine = (BODY_LINES as readonly string[]).includes(line.text);
        expect(isOmittedIndicator || isCompleteOriginalLine, `不完全な行が描画されている: "${line.text}"`).toBe(true);
      }
    }
  });
});
