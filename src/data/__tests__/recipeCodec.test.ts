import { describe, expect, it } from 'vitest';
import { decodeRecipe, encodeRecipe, RecipeCodeError } from '../recipeCodec';
import type { MotorConfig } from '../../engine/motorPhysics';

const config: MotorConfig = {
  coilTurns: 80,
  slitWidthMm: 1.5,
  sandingQuality: 0.9,
  brushPressure: 0.3,
  magnetStrength: 0.9,
  magnetDistanceMm: 10,
  batteryVoltage: 3,
  axisOffsetMm: 0,
  wireGaugeMm: 0.4,
  parallelStrands: 1,
  varnished: true,
};

describe('レシピコード', () => {
  it('MotorConfigとシードを同一値で往復できる', () => {
    const decoded = decodeRecipe(encodeRecipe({ config, seed: 0x12345678 }));
    expect(decoded).toEqual({ config, seed: 0x12345678 });
  });

  it('1文字の改竄をチェックサムで検出する', () => {
    const code = encodeRecipe({ config, seed: 1 });
    const index = code.indexOf('.') - 1;
    const tampered = `${code.slice(0, index)}${code[index] === 'A' ? 'B' : 'A'}${code.slice(index + 1)}`;
    expect(() => decodeRecipe(tampered)).toThrow(RecipeCodeError);
    expect(() => decodeRecipe(tampered)).toThrow('チェックサム');
  });

  it('範囲外の値を物理範囲と巻き数上限へクランプする', () => {
    const unsafe = { ...config, coilTurns: 999, wireGaugeMm: 0.8, parallelStrands: 2 as const, magnetDistanceMm: -10 };
    const decoded = decodeRecipe(encodeRecipe({ config: unsafe, seed: 2 }));
    expect(decoded.config.coilTurns).toBe(18);
    expect(decoded.config.magnetDistanceMm).toBe(2);
  });

  it('別プレフィックスを拒否する', () => {
    expect(() => decodeRecipe('M10-invalid')).toThrow('M15-');
  });
});
