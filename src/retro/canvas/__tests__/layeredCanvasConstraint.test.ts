import { describe, expect, it } from 'vitest';
import { checkTwoLayerAlignment } from '../layeredCanvasConstraint';

describe('checkTwoLayerAlignment', () => {
  it('偶数倍率ならUI層倍率(n/2)が整数として成立する', () => {
    const result = checkTwoLayerAlignment(4);
    expect(result.isEven).toBe(true);
    expect(result.uiScale).toBe(2);
  });

  it('奇数倍率(3倍)はUI層が非整数になり不成立', () => {
    const result = checkTwoLayerAlignment(3);
    expect(result.isEven).toBe(false);
    expect(result.uiScale).toBeNull();
  });

  it('n=1(狭小viewportで起きやすい)は必ず不成立', () => {
    const result = checkTwoLayerAlignment(1);
    expect(result.isEven).toBe(false);
    expect(result.uiScale).toBeNull();
  });

  it('0以下や非整数の入力は例外を投げる(独自に丸めて解釈しない)', () => {
    expect(() => checkTwoLayerAlignment(0)).toThrow();
    expect(() => checkTwoLayerAlignment(-2)).toThrow();
    expect(() => checkTwoLayerAlignment(2.5)).toThrow();
  });
});
