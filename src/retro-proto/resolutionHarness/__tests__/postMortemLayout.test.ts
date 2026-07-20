import { describe, expect, it } from 'vitest';
import { computePostMortemLayout } from '../postMortemLayout';

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
});
