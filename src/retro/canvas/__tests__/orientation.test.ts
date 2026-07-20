import { describe, expect, it } from 'vitest';
import { computeIntegerScale } from '../integerScale';
import { selectOrientedResolution } from '../orientation';

const LANDSCAPE = { w: 480, h: 270 };

describe('selectOrientedResolution', () => {
  it('縦長コンテナ(390×844)では横高さを転置する(既知値)', () => {
    expect(selectOrientedResolution(390, 844, LANDSCAPE)).toEqual({ w: 270, h: 480 });
  });

  it('横長コンテナ(844×390)ではそのまま返す(既知値)', () => {
    expect(selectOrientedResolution(844, 390, LANDSCAPE)).toEqual({ w: 480, h: 270 });
  });

  it('デスクトップ(1920×1080)ではそのまま返す(既知値)', () => {
    expect(selectOrientedResolution(1920, 1080, LANDSCAPE)).toEqual({ w: 480, h: 270 });
  });

  it('正方形コンテナは横長扱いにする(境界値)', () => {
    expect(selectOrientedResolution(500, 500, LANDSCAPE)).toEqual({ w: 480, h: 270 });
  });
});

// PHASE1-UNITH-REVIEW指摘1: OverheadViewDemo/WorstCaseDemo(480×270基準)が
// 対象viewport(縦390×844・横844×390・デスクトップ1920×1080)すべてで
// fits=trueになることを検証する(単なるfits=false表示は対象viewport対応の
// 代替にならない、という指摘への回帰テスト)。
describe('selectOrientedResolution + computeIntegerScale(480×270基準)の対象viewport成立', () => {
  const TARGET_VIEWPORTS: Array<[number, number, string]> = [
    [390, 844, '縦390×844'],
    [844, 390, '横844×390'],
    [1920, 1080, 'デスクトップ1920×1080'],
  ];

  it.each(TARGET_VIEWPORTS)('%i×%i(%s)でfits=trueになる', (w, h) => {
    const content = selectOrientedResolution(w, h, LANDSCAPE);
    const scale = computeIntegerScale(w, h, content.w, content.h);
    expect(scale.fits).toBe(true);
    expect(scale.scale).toBeGreaterThanOrEqual(1);
  });
});
