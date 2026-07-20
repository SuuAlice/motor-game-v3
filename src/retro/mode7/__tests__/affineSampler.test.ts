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

  // PHASE1-UNITF-REVIEW追加指摘: 縦方向(srcY=d)が退化していないことを検査する。
  it('上端(row0)と基準行(referenceRow)のsrcY差は有意な範囲になる(退化しない、既知値)', () => {
    const transforms = computePerspectiveRowTransforms(160, 120, {
      zoom: 1,
      centerXPx: 80,
      centerYPx: 119,
      sourceDepthSpanPx: 60,
    });
    const topD = transforms[0].d;
    const referenceD = transforms[119].d;
    // 修正前の実装では差が約2pxに潰れていた。修正後は出力縦解像度(120)に見合う
    // 有意な範囲(半分の60px以上)を確保することを検査する。centerYPx=119は
    // floorPlanSourceの有効y範囲(0..119)内の最大値に合わせた値(off-by-one回避)。
    expect(Math.abs(referenceD - topD)).toBeGreaterThan(60);
    expect(topD).toBe(0);
    expect(referenceD).toBe(119);
  });

  it('sourceDepthSpanPxを指定しない場合も既定値により有意なsrcY範囲になる', () => {
    const transforms = computePerspectiveRowTransforms(160, 120, { zoom: 1, centerXPx: 80, centerYPx: 120 });
    const range = Math.abs(transforms[119].d - transforms[0].d);
    expect(range).toBeGreaterThan(60);
  });

  it('zoomを変えてもsrcYは全行で有限値になり、範囲(最大-最小)は正のまま変わらない', () => {
    const ranges: number[] = [];
    for (const zoom of [0.5, 1, 2, 3]) {
      const transforms = computePerspectiveRowTransforms(160, 120, {
        zoom,
        centerXPx: 80,
        centerYPx: 119,
        sourceDepthSpanPx: 60,
      });
      const dValues = transforms.map((t) => t.d);
      expect(dValues.every((d) => Number.isFinite(d))).toBe(true);
      ranges.push(Math.max(...dValues) - Math.min(...dValues));
    }
    for (const range of ranges) {
      expect(range).toBeGreaterThan(0);
    }
  });

  it('srcYは基準行から地平線側へ向けて単調に変化する(往復・振動しない)', () => {
    const transforms = computePerspectiveRowTransforms(160, 120, {
      zoom: 1,
      centerXPx: 80,
      centerYPx: 119,
      sourceDepthSpanPx: 60,
    });
    for (let row = 1; row < transforms.length; row++) {
      expect(transforms[row].d).toBeGreaterThanOrEqual(transforms[row - 1].d);
    }
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
