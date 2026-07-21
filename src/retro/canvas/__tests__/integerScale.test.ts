import { describe, expect, it } from 'vitest';
import { computeIntegerScale, computeIntegerScalePhysical } from '../integerScale';

describe('computeIntegerScale', () => {
  it('収まる場合は最大整数倍率を返す', () => {
    const result = computeIntegerScale(1280, 720, 480, 270);
    expect(result.fits).toBe(true);
    expect(result.scale).toBe(2);
    expect(result.contentWidthPx).toBe(960);
    expect(result.contentHeightPx).toBe(540);
    expect(result.offsetXPx).toBe((1280 - 960) / 2);
    expect(result.offsetYPx).toBe((720 - 540) / 2);
  });

  it('ちょうど整数倍で埋まる場合はレターボックスが0になる', () => {
    const result = computeIntegerScale(960, 540, 480, 270);
    expect(result.scale).toBe(2);
    expect(result.offsetXPx).toBe(0);
    expect(result.offsetYPx).toBe(0);
  });

  it('等倍でも収まらない場合はfits=false・scale=0を返す(独自に1倍へ補正しない)', () => {
    const result = computeIntegerScale(360, 640, 480, 270);
    expect(result.fits).toBe(false);
    expect(result.scale).toBe(0);
    expect(result.contentWidthPx).toBe(0);
    expect(result.contentHeightPx).toBe(0);
  });

  it('縦横で律速する辺が異なる場合は小さい方の整数倍率を採用する', () => {
    // 幅方向は6倍まで収まるが高さ方向は4倍までしか収まらない
    const result = computeIntegerScale(1920, 1080, 320, 270);
    expect(result.scale).toBe(4);
  });
});

describe('computeIntegerScalePhysical', () => {
  it('devicePixelRatioを反映した物理ピクセル基準で整数倍率を算出する', () => {
    // CSS基準では360/270=1倍・640/480=1倍だが、DPR2で物理720×1280になり2倍が成立する
    const css = computeIntegerScale(360, 640, 270, 480);
    const physical = computeIntegerScalePhysical(360, 640, 2, 270, 480);
    expect(css.scale).toBe(1);
    expect(physical.scale).toBe(2);
    expect(physical.physicalContainerWidthPx).toBe(720);
    expect(physical.physicalContainerHeightPx).toBe(1280);
    expect(physical.devicePixelRatio).toBe(2);
  });

  it('非整数devicePixelRatioでも例外を投げず物理ピクセル寸法を計算する', () => {
    const physical = computeIntegerScalePhysical(412, 915, 2.625, 270, 480);
    expect(physical.physicalContainerWidthPx).toBeCloseTo(412 * 2.625);
    expect(physical.physicalContainerHeightPx).toBeCloseTo(915 * 2.625);
    expect(Number.isFinite(physical.scale)).toBe(true);
  });

  it('DPR=1のときCSS基準と一致する', () => {
    const css = computeIntegerScale(1280, 800, 480, 270);
    const physical = computeIntegerScalePhysical(1280, 800, 1, 480, 270);
    expect(physical.scale).toBe(css.scale);
    expect(physical.contentWidthPx).toBe(css.contentWidthPx);
  });

  // PHASE1-REVIEW-FIX指摘1: 解像度比較の候補c(UI層960×540)がCSS基準では
  // 表示不能でも、DPRを反映した物理ピクセル基準では成立しうることを示す回帰テスト。
  it('候補cのUI層(960×540)はCSS 480×270コンテナでは収まらないが、DPR=2の物理基準では1倍で成立する(既知値)', () => {
    const css = computeIntegerScale(480, 270, 960, 540);
    const physical = computeIntegerScalePhysical(480, 270, 2, 960, 540);
    expect(css.fits).toBe(false);
    expect(physical.fits).toBe(true);
    expect(physical.scale).toBe(1);
    expect(physical.physicalContainerWidthPx).toBe(960);
    expect(physical.physicalContainerHeightPx).toBe(540);
  });

  it('候補cのUI層(960×540)はDPR=1(等倍ディスプレイ)では、CSS基準と同じくCSS 480×270コンテナで収まらない(既知値)', () => {
    const physical = computeIntegerScalePhysical(480, 270, 1, 960, 540);
    expect(physical.fits).toBe(false);
  });
});
