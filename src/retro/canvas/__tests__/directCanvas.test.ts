import { describe, expect, it } from 'vitest';
import { computeDirectCanvasPhysicalCssSize } from '../directCanvas';

// Task#17(Suu指示): DPR=1/2/3の整数だけでなく1.25/1.5のfractional DPRでも
// 計算値・fits判定を検証する。cssWidthPx×devicePixelRatio===contentWidthPx×
// physicalScaleは常に厳密成立するはずだが、cssWidthPx自体が非整数CSSピクセルに
// なりうることを隠さず報告する(勝手に丸めない)。
describe('computeDirectCanvasPhysicalCssSize', () => {
  it('DPR=1: 物理ピクセル=CSSピクセルなので、通常のcomputeIntegerScaleと同じ倍率になる(既知値)', () => {
    const r = computeDirectCanvasPhysicalCssSize(960, 540, 1, 480, 270);
    expect(r.fits).toBe(true);
    expect(r.physicalScale).toBe(2);
    expect(r.cssWidthPx).toBe(960);
    expect(r.cssHeightPx).toBe(540);
    expect(r.cssWidthIsIntegerPx).toBe(true);
    expect(r.cssHeightIsIntegerPx).toBe(true);
  });

  it('DPR=2: 物理ピクセルが2倍になるため、同じCSSコンテナでもより大きなphysicalScaleが得られる(既知値)', () => {
    const r = computeDirectCanvasPhysicalCssSize(960, 540, 2, 480, 270);
    // 物理コンテナ1920×1080に対しcontent480×270は整数4倍で収まる
    expect(r.physicalScale).toBe(4);
    expect(r.cssWidthPx).toBe(960); // 480*4/2
    expect(r.cssHeightPx).toBe(540);
    expect(r.cssWidthIsIntegerPx).toBe(true);
  });

  it('DPR=3でも整数CSSピクセルになる組み合わせでは、cssWidthIsIntegerPx=trueになる', () => {
    const r = computeDirectCanvasPhysicalCssSize(1440, 810, 3, 480, 270);
    // 物理コンテナ4320×2430、content480×270で整数9倍
    expect(r.physicalScale).toBe(9);
    expect(r.cssWidthPx).toBe(1440); // 480*9/3
    expect(r.cssWidthIsIntegerPx).toBe(true);
  });

  it('理論上の物理表示寸法(cssWidthPx×DPR)は常にcontentWidthPx×physicalScaleと厳密一致する(DPR=1.25)', () => {
    const r = computeDirectCanvasPhysicalCssSize(1000, 600, 1.25, 480, 270);
    expect(r.fits).toBe(true);
    expect(r.cssWidthPx * r.devicePixelRatio).toBeCloseTo(480 * r.physicalScale, 9);
    expect(r.cssHeightPx * r.devicePixelRatio).toBeCloseTo(270 * r.physicalScale, 9);
  });

  it('fractional DPR(1.5)でcontent×physicalScaleがDPRで割り切れない場合、cssWidthPxは非整数CSSピクセルになる(既知の制約、cssWidthIsIntegerPx=falseで検出・非整数のまま報告し勝手に丸めない)', () => {
    const r = computeDirectCanvasPhysicalCssSize(200, 200, 1.5, 101, 101);
    // 物理コンテナ300×300、physicalScale=floor(300/101)=2 -> cssWidthPx=101*2/1.5=134.666...
    expect(r.fits).toBe(true);
    expect(r.physicalScale).toBe(2);
    expect(r.cssWidthIsIntegerPx).toBe(false);
    expect(r.cssWidthPx).toBeCloseTo(134.6667, 3);
    // それでも理論上の物理表示寸法の厳密一致(実数演算)は保たれる
    expect(r.cssWidthPx * 1.5).toBeCloseTo(101 * 2, 9);
  });

  it('コンテナが小さすぎてcontentが等倍でも収まらない場合はfits=falseを返す', () => {
    const r = computeDirectCanvasPhysicalCssSize(10, 10, 1, 480, 270);
    expect(r.fits).toBe(false);
    expect(r.physicalScale).toBe(0);
    expect(r.cssWidthPx).toBe(0);
  });

  it('縦持ち転置後のcontent寸法(270×480)でも同様に成立する(向き非依存)', () => {
    const r = computeDirectCanvasPhysicalCssSize(540, 960, 1, 270, 480);
    expect(r.fits).toBe(true);
    expect(r.physicalScale).toBe(2);
    expect(r.cssWidthPx).toBe(540);
    expect(r.cssHeightPx).toBe(960);
  });

  it('devicePixelRatioが0以下の場合は拒否する', () => {
    expect(() => computeDirectCanvasPhysicalCssSize(500, 500, 0, 100, 100)).toThrow();
    expect(() => computeDirectCanvasPhysicalCssSize(500, 500, -1, 100, 100)).toThrow();
  });
});
