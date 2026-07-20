import { describe, expect, it } from 'vitest';
import { computePerspectiveRowTransforms, mapDestXToSource } from '../../../retro/mode7/affineSampler';
import { FLOOR_PLAN_HEIGHT_PX, FLOOR_PLAN_WIDTH_PX } from '../floorPlanSource';

// PHASE1-UNITF-REVIEW追加指摘3: drawMode7Demo.tsのdrawMode7Perspectiveと同じ
// 校正値(centerYPx=FLOOR_PLAN_HEIGHT_PX-1、sourceDepthSpanPx=FLOOR_PLAN_HEIGHT_PX/2)
// を用いて、実際のデモ条件でsrcYが常に見取り図の有効範囲(0<=y<FLOOR_PLAN_HEIGHT_PX)
// に収まることを検査する(手前基準がFLOOR_PLAN_HEIGHT_PXそのものだと最下段が
// 常にoff-by-oneでN0になっていた不具合の回帰テスト)。
const OUTPUT_W = 160;
const OUTPUT_H = 120;

function demoTransforms(zoom: number) {
  return computePerspectiveRowTransforms(OUTPUT_W, OUTPUT_H, {
    zoom,
    centerXPx: FLOOR_PLAN_WIDTH_PX / 2,
    centerYPx: FLOOR_PLAN_HEIGHT_PX - 1,
    sourceDepthSpanPx: FLOOR_PLAN_HEIGHT_PX / 2,
  });
}

describe('drawMode7Demoの校正値(実際のデモ条件)', () => {
  it.each([0.5, 1, 1.5, 2.2])('zoom=%sで全出力行の中心サンプルsrcYが有効範囲(0..FLOOR_PLAN_HEIGHT_PX-1)に収まる', (zoom) => {
    const transforms = demoTransforms(zoom);
    for (const transform of transforms) {
      const { srcY } = mapDestXToSource(transform, OUTPUT_W / 2);
      expect(srcY).toBeGreaterThanOrEqual(0);
      expect(srcY).toBeLessThanOrEqual(FLOOR_PLAN_HEIGHT_PX - 1);
    }
  });

  it('手前基準(referenceRow=画面最下段)のsrcYは有効範囲内の最大値(FLOOR_PLAN_HEIGHT_PX-1)になる', () => {
    const transforms = demoTransforms(1);
    const referenceRow = OUTPUT_H - 1;
    const { srcY } = mapDestXToSource(transforms[referenceRow], OUTPUT_W / 2);
    expect(srcY).toBe(FLOOR_PLAN_HEIGHT_PX - 1);
  });

  it('地平線側(row0)のsrcYは見取り図の上端(0)になる', () => {
    const transforms = demoTransforms(1);
    const { srcY } = mapDestXToSource(transforms[0], OUTPUT_W / 2);
    expect(srcY).toBe(0);
  });
});
