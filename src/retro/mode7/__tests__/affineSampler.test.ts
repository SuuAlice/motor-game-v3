import { describe, expect, it } from 'vitest';
import { computePerspectiveRowTransforms, computeZoomRowTransforms, mapDestXToSource, sampleRow } from '../affineSampler';

describe('computeZoomRowTransforms', () => {
  it('zoom=1のとき出力中心はソース中心座標へ写像される(既知値)', () => {
    const transforms = computeZoomRowTransforms(160, 120, 1, 80, 60);
    const centerRow = transforms[60];
    const { srcX, srcY } = mapDestXToSource(centerRow, 80);
    expect(srcX).toBe(80);
    expect(srcY).toBe(60);
  });

  it('zoom=1のとき出力の左上(0,0)は中心から半分オフセットした座標へ写像される(既知値)', () => {
    const transforms = computeZoomRowTransforms(160, 120, 1, 80, 60);
    const { srcX, srcY } = mapDestXToSource(transforms[0], 0);
    expect(srcX).toBe(0);
    expect(srcY).toBe(0);
  });

  it('zoom=2のとき出力全域は元の半分の範囲(ズームイン)にマッピングされる(既知値)', () => {
    const transforms = computeZoomRowTransforms(160, 120, 2, 80, 60);
    const left = mapDestXToSource(transforms[60], 0);
    const right = mapDestXToSource(transforms[60], 159);
    // zoom=2なのでサンプリング幅は160/2=80px程度(中心80を挟んで40〜120)
    expect(left.srcX).toBe(40);
    expect(right.srcX).toBeCloseTo(120, 0);
  });

  it('rowが変化してもaとcは一定(回転なしの単純ズーム)', () => {
    const transforms = computeZoomRowTransforms(160, 120, 1.5, 80, 60);
    expect(transforms[0].a).toBe(transforms[119].a);
    expect(transforms[0].c).toBe(transforms[119].c);
    expect(transforms[0].c).toBe(0);
  });

  it('zoomが0以下の場合は例外を投げる', () => {
    expect(() => computeZoomRowTransforms(160, 120, 0, 80, 60)).toThrow();
    expect(() => computeZoomRowTransforms(160, 120, -1, 80, 60)).toThrow();
  });
});

describe('computePerspectiveRowTransforms', () => {
  it('行によってサンプリング幅(a)が異なる(床面が奥へ傾く透視効果、既知値)', () => {
    const transforms = computePerspectiveRowTransforms(160, 120, { zoom: 1, centerXPx: 80, centerYPx: 60 });
    // 既定horizonOffsetPx=60・referenceRow=119のとき、row0のdepth=60、row119のdepth=179
    expect(transforms[0].a).toBeCloseTo(179 / 60, 5);
    expect(transforms[119].a).toBeCloseTo(1, 5);
    expect(transforms[0].a).not.toBe(transforms[119].a);
    expect(transforms[0].a).toBeGreaterThan(transforms[119].a);
  });

  it('基準行(referenceRow)ではzoom値どおりの倍率で中心座標が正確に写像される(既知値)', () => {
    const transforms = computePerspectiveRowTransforms(160, 120, { zoom: 2, centerXPx: 80, centerYPx: 60 });
    const referenceRow = 119; // 既定値(outputHeightPx - 1)
    expect(transforms[referenceRow].a).toBeCloseTo(0.5, 5);
    const { srcX, srcY } = mapDestXToSource(transforms[referenceRow], 80);
    expect(srcX).toBe(80);
    expect(srcY).toBe(60);
  });

  it('上端(地平線側)ほどサンプリング範囲が横に広がる(遠近感、既知値)', () => {
    const transforms = computePerspectiveRowTransforms(160, 120, { zoom: 1, centerXPx: 80, centerYPx: 60 });
    const topLeft = mapDestXToSource(transforms[0], 0);
    const topRight = mapDestXToSource(transforms[0], 159);
    const bottomLeft = mapDestXToSource(transforms[119], 0);
    const bottomRight = mapDestXToSource(transforms[119], 159);
    const topWidth = topRight.srcX - topLeft.srcX;
    const bottomWidth = bottomRight.srcX - bottomLeft.srcX;
    expect(topWidth).toBeGreaterThan(bottomWidth);
  });

  it('全出力行を通してソース参照座標は常に整数になる(ニアレストネイバー)', () => {
    const transforms = computePerspectiveRowTransforms(160, 120, { zoom: 1.7, centerXPx: 80, centerYPx: 60 });
    const seen: Array<[number, number]> = [];
    const getSourcePixel = (x: number, y: number) => {
      seen.push([x, y]);
      return '#000000';
    };
    for (const transform of transforms) {
      sampleRow(transform, 160, getSourcePixel);
    }
    for (const [x, y] of seen) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
    }
  });

  it('無効なパラメータ(zoom<=0、horizonOffsetPx<=0)は拒否する', () => {
    expect(() => computePerspectiveRowTransforms(160, 120, { zoom: 0, centerXPx: 80, centerYPx: 60 })).toThrow();
    expect(() => computePerspectiveRowTransforms(160, 120, { zoom: -1, centerXPx: 80, centerYPx: 60 })).toThrow();
    expect(() =>
      computePerspectiveRowTransforms(160, 120, { zoom: 1, centerXPx: 80, centerYPx: 60, horizonOffsetPx: 0 }),
    ).toThrow();
    expect(() =>
      computePerspectiveRowTransforms(160, 120, { zoom: 1, centerXPx: 80, centerYPx: 60, horizonOffsetPx: -5 }),
    ).toThrow();
  });
});

describe('sampleRow', () => {
  it('範囲外座標はnullを返す(ソース外を参照しない)', () => {
    const getSourcePixel = (x: number, y: number) => (x >= 0 && x < 10 && y >= 0 && y < 10 ? '#112233' : null);
    const transforms = computeZoomRowTransforms(20, 20, 1, 5, 5);
    const row = sampleRow(transforms[15], 20, getSourcePixel);
    // 出力下端付近はソース範囲(10x10)外になるはず
    expect(row.some((c) => c === null)).toBe(true);
  });

  it('ニアレストネイバーで整数座標のみを参照する', () => {
    const seen: Array<[number, number]> = [];
    const getSourcePixel = (x: number, y: number) => {
      seen.push([x, y]);
      return '#000000';
    };
    const transforms = computeZoomRowTransforms(4, 4, 1.3, 2, 2);
    sampleRow(transforms[0], 4, getSourcePixel);
    for (const [x, y] of seen) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
    }
  });
});
