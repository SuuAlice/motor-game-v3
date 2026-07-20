import { describe, expect, it } from 'vitest';
import { computeTabButtonState } from '../tabState';

describe('computeTabButtonState', () => {
  it('選択中はaria-selected=trueかつ記号付きラベルになる(既知値)', () => {
    const state = computeTabButtonState('解像度比較', true);
    expect(state.ariaSelected).toBe(true);
    expect(state.displayLabel).toBe('▶ 解像度比較');
  });

  it('非選択はaria-selected=falseかつ元のラベルのままになる(既知値)', () => {
    const state = computeTabButtonState('解像度比較', false);
    expect(state.ariaSelected).toBe(false);
    expect(state.displayLabel).toBe('解像度比較');
  });

  it('選択状態は表示ラベル(記号)にも反映され、色以外の手段で判別できる', () => {
    const selected = computeTabButtonState('Mode 7', true);
    const notSelected = computeTabButtonState('Mode 7', false);
    expect(selected.displayLabel).not.toBe(notSelected.displayLabel);
  });
});
