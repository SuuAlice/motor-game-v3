import { describe, expect, it } from 'vitest';
import { MATERIAL_ICON_DRAWERS } from '../materialIcons';
import { MATERIAL_FAMILIES } from '../../../materials/materials';

function createMockCtx() {
  const calls: string[] = [];
  const ctx = {
    get strokeStyle() { return ''; },
    set strokeStyle(_v: string) { calls.push('strokeStyle'); },
    get fillStyle() { return ''; },
    set fillStyle(_v: string) { calls.push('fillStyle'); },
    lineWidth: 1,
    beginPath: () => calls.push('beginPath'),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    closePath: () => calls.push('closePath'),
    stroke: () => calls.push('stroke'),
    fill: () => calls.push('fill'),
    fillRect: () => calls.push('fillRect'),
    strokeRect: () => calls.push('strokeRect'),
    arc: () => calls.push('arc'),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('MATERIAL_ICON_DRAWERS', () => {
  it('9ファミリー全てに固有の描画関数が割り当てられている(Fable必須修正B: coating含む)', () => {
    expect(MATERIAL_FAMILIES).toHaveLength(9);
    for (const family of MATERIAL_FAMILIES) {
      expect(MATERIAL_ICON_DRAWERS[family]).toBeTypeOf('function');
    }
    const uniqueFns = new Set(MATERIAL_FAMILIES.map((f) => MATERIAL_ICON_DRAWERS[f]));
    expect(uniqueFns.size).toBe(9);
  });

  it('coatingの識別形状が定義されている(Fable必須修正B)', () => {
    expect(MATERIAL_ICON_DRAWERS.coating).toBeDefined();
    expect(MATERIAL_ICON_DRAWERS.coating).not.toBe(MATERIAL_ICON_DRAWERS.wire);
  });

  it.each(MATERIAL_FAMILIES)('%sの描画関数はエラーなく実行され、Canvas描画命令を発行する', (family) => {
    const { ctx, calls } = createMockCtx();
    expect(() => MATERIAL_ICON_DRAWERS[family](ctx, 0, 0, 24)).not.toThrow();
    expect(calls.length).toBeGreaterThan(0);
  });
});
