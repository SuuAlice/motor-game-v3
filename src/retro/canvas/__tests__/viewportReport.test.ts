import { describe, expect, it } from 'vitest';
import { RESOLUTION_CANDIDATES, VIEWPORTS, buildReportRows } from '../viewportReport';

describe('buildReportRows', () => {
  it('viewport×候補の全組み合わせを生成する', () => {
    const rows = buildReportRows();
    expect(rows.length).toBe(VIEWPORTS.length * RESOLUTION_CANDIDATES.length);
  });

  it('縦持ちviewportではワールド寸法を転置する', () => {
    const rows = buildReportRows(
      [VIEWPORTS.find((v) => v.id === 'phone-360x640')!],
      [RESOLUTION_CANDIDATES.find((c) => c.id === 'c')!],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].contentWidthPx).toBe(270);
    expect(rows[0].contentHeightPx).toBe(480);
  });

  it('横持ちviewportではワールド寸法をそのまま使う', () => {
    const rows = buildReportRows(
      [VIEWPORTS.find((v) => v.id === 'phone-640x360')!],
      [RESOLUTION_CANDIDATES.find((c) => c.id === 'c')!],
    );
    expect(rows[0].contentWidthPx).toBe(480);
    expect(rows[0].contentHeightPx).toBe(270);
  });

  it('候補cでCSS基準が奇数倍率のとき、物理ピクセル基準で偶数に解消する実例を含む(phone-360x640)', () => {
    const rows = buildReportRows(
      [VIEWPORTS.find((v) => v.id === 'phone-360x640')!],
      [RESOLUTION_CANDIDATES.find((c) => c.id === 'c')!],
    );
    const row = rows[0];
    expect(row.css.scale).toBe(1);
    expect(row.twoLayerCss?.isEven).toBe(false);
    expect(row.physical.scale).toBe(2);
    expect(row.twoLayerPhysical?.isEven).toBe(true);
  });

  it('物理ピクセル基準でも解消しない実例を含む(phone-414x896、万能ではないことの確認)', () => {
    const rows = buildReportRows(
      [VIEWPORTS.find((v) => v.id === 'phone-414x896')!],
      [RESOLUTION_CANDIDATES.find((c) => c.id === 'c')!],
    );
    const row = rows[0];
    expect(row.twoLayerCss?.isEven ?? false).toBe(false);
    expect(row.twoLayerPhysical?.isEven ?? false).toBe(false);
  });

  it('単層候補(a/b/d)はtwoLayerCss/twoLayerPhysicalがnull', () => {
    const rows = buildReportRows(
      [VIEWPORTS[0]],
      [RESOLUTION_CANDIDATES.find((c) => c.id === 'a')!],
    );
    expect(rows[0].twoLayerCss).toBeNull();
    expect(rows[0].twoLayerPhysical).toBeNull();
  });
});
