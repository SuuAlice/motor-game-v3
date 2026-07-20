import { describe, expect, it } from 'vitest';
import { computeInsetLayout, type InsetLayoutSizes } from '../insetLayout';

const SIZES: InsetLayoutSizes = {
  colorOpsWidthPx: 140,
  colorOpsHeightPx: 60,
  mode7WidthPx: 120,
  mode7HeightPx: 90,
  marginPx: 4,
};

describe('computeInsetLayout', () => {
  it('横長コンテンツ(480px幅)では横並びになる(既知値)', () => {
    const layout = computeInsetLayout(480, SIZES);
    expect(layout.colorOps).toEqual({ x: 4, y: 4 });
    expect(layout.mode7).toEqual({ x: 480 - 120 - 4, y: 4 });
    // 横並びで重ならないことも確認する
    expect(layout.colorOps.x + SIZES.colorOpsWidthPx).toBeLessThanOrEqual(layout.mode7.x);
  });

  it('縦持ち転置後の幅(270px)では縦積みになる(既知値)', () => {
    const layout = computeInsetLayout(270, SIZES);
    expect(layout.colorOps).toEqual({ x: 4, y: 4 });
    expect(layout.mode7).toEqual({ x: 4, y: 4 + 60 + 4 });
    // 縦積みで重ならないことも確認する
    expect(layout.colorOps.y + SIZES.colorOpsHeightPx).toBeLessThanOrEqual(layout.mode7.y);
  });

  it('横並びに必要な幅ちょうどでは横並びになる(境界値)', () => {
    const needed = SIZES.colorOpsWidthPx + SIZES.mode7WidthPx + SIZES.marginPx * 3;
    const layout = computeInsetLayout(needed, SIZES);
    expect(layout.mode7.x).toBe(needed - SIZES.mode7WidthPx - SIZES.marginPx);
  });

  it('全フィールドが整数になる(art-spec §2.2)', () => {
    for (const w of [270, 320, 480, 640, 960]) {
      const layout = computeInsetLayout(w, SIZES);
      for (const pos of [layout.colorOps, layout.mode7]) {
        expect(Number.isInteger(pos.x)).toBe(true);
        expect(Number.isInteger(pos.y)).toBe(true);
      }
    }
  });
});
