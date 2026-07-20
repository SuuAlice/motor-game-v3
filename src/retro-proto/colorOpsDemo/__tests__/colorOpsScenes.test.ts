import { describe, expect, it } from 'vitest';
import { buildGlowComparison, buildSmokeComparison, buildSunsetComparison, type SceneComparison } from '../colorOpsScenes';

function expectAllCellsInteger(cells: SceneComparison[keyof SceneComparison]) {
  for (const cell of cells) {
    for (const key of ['x', 'y', 'widthPx', 'heightPx'] as const) {
      expect(Number.isInteger(cell[key]), `${key}が整数ではない: ${cell[key]}`).toBe(true);
    }
  }
}

describe.each([
  ['buildGlowComparison', buildGlowComparison],
  ['buildSmokeComparison', buildSmokeComparison],
  ['buildSunsetComparison', buildSunsetComparison],
] as const)('%s', (_name, build) => {
  const result = build(0, 0);

  it('art-spec §2.2(整数ピクセル規律): 全セルの座標・寸法が整数になる', () => {
    expectAllCellsInteger(result.withOperation);
    expectAllCellsInteger(result.withoutOperation);
    expectAllCellsInteger(result.dither);
  });

  it('演算あり(withOperation)は重ねるごとに色が変化する(演算なしは変化しない)', () => {
    const opColors = result.withOperation.map((c) => c.color);
    expect(new Set(opColors).size).toBe(opColors.length);

    const flatColors = result.withoutOperation.map((c) => c.color);
    expect(new Set(flatColors).size).toBe(1);
  });

  it('市松ディザは1px単位のセルで、2色を交互に使う', () => {
    for (const cell of result.dither) {
      expect(cell.widthPx).toBe(1);
      expect(cell.heightPx).toBe(1);
    }
    const colors = new Set(result.dither.map((c) => c.color));
    expect(colors.size).toBe(2);
  });
});
