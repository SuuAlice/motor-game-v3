import { describe, expect, it } from 'vitest';
import { CORE_PALETTE, EXTENDED_PALETTE, PALETTE } from '../palette';

const HEX_RE = /^#[0-9a-f]{6}$/i;

describe('palette', () => {
  it('コア32色を持つ', () => {
    expect(Object.keys(CORE_PALETTE)).toHaveLength(32);
  });

  it('拡張16色を持つ', () => {
    expect(Object.keys(EXTENDED_PALETTE)).toHaveLength(16);
  });

  it('コア+拡張=共通48色になる(Phase1凍結対象)', () => {
    expect(Object.keys(PALETTE)).toHaveLength(48);
  });

  it('コアと拡張でキーの重複がない', () => {
    const coreKeys = new Set(Object.keys(CORE_PALETTE));
    const overlap = Object.keys(EXTENDED_PALETTE).filter((k) => coreKeys.has(k));
    expect(overlap).toEqual([]);
  });

  it('すべての値が#rrggbb形式の16進カラーである', () => {
    for (const [key, value] of Object.entries(PALETTE)) {
      expect(value, `${key}の値が16進カラー形式ではない: ${value}`).toMatch(HEX_RE);
    }
  });
});
