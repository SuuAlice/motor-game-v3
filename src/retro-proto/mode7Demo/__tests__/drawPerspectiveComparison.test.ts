import { describe, expect, it } from 'vitest';
import {
  PANEL_H_PX,
  computeComparisonIsotropicTransforms,
  computeComparisonPerspectiveTransforms,
} from '../drawPerspectiveComparison';

// PHASE1-REVIEW-FIX指摘4: 「密な格子の行間隔が奥側と手前側で画面上明瞭に異なる
// こと」「等方版と透視版の出力が既知点で異なること」をテストで固定する。
describe('透視ズーム比較(市松床)', () => {
  it('透視版: 奥側(row=0付近)の隣接行間ワールドY差は、手前側(参照行付近)より明瞭に大きい', () => {
    const transforms = computeComparisonPerspectiveTransforms();
    const farDelta = Math.abs(transforms[1].d - transforms[0].d);
    const nearDelta = Math.abs(transforms[PANEL_H_PX - 1].d - transforms[PANEL_H_PX - 2].d);

    expect(nearDelta).toBeGreaterThan(0);
    // 奥側の行間ワールドY差は手前側の少なくとも2倍以上(タイル境界線が奥ほど
    // 画面上で密=細く見えることに対応する)。
    expect(farDelta).toBeGreaterThan(nearDelta * 2);
  });

  it('透視版: 行ごとのサンプリング幅(a)は手前(参照行)から奥(row=0)へ向けて増加する(遠いほど1行が広い範囲を覆う)', () => {
    const transforms = computeComparisonPerspectiveTransforms();
    const referenceA = transforms[PANEL_H_PX - 1].a;
    const farA = transforms[0].a;
    expect(farA).toBeGreaterThan(referenceA);
  });

  it('等方版: 行ごとのサンプリング幅(a)は全行で一定になる(透視版との対比の基準点)', () => {
    const transforms = computeComparisonIsotropicTransforms();
    const values = new Set(transforms.map((t) => t.a));
    expect(values.size).toBe(1);
  });

  it('等方版と透視版は同一zoom/中心/校正値でも、奥側(row=0)の出力が既知点で明瞭に異なる', () => {
    const iso = computeComparisonIsotropicTransforms();
    const persp = computeComparisonPerspectiveTransforms();

    expect(iso[0].a).not.toBeCloseTo(persp[0].a, 2);
    expect(Math.abs(iso[0].d - persp[0].d)).toBeGreaterThan(50);
  });

  it('等方版は全行で同一のaを使うため、手前(参照行)と奥(row=0)のワールドY差が透視版より小さい(往復アニメだけでは差が出にくかった原因の裏付け)', () => {
    const iso = computeComparisonIsotropicTransforms();
    const persp = computeComparisonPerspectiveTransforms();

    const isoSpan = Math.abs(iso[PANEL_H_PX - 1].d - iso[0].d);
    const perspSpan = Math.abs(persp[PANEL_H_PX - 1].d - persp[0].d);
    expect(perspSpan).toBeGreaterThan(isoSpan);
  });
});
