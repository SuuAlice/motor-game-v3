import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../../retro/palette';
import { getTallObjectColors } from '../tallObjectStyle';

describe('getTallObjectColors', () => {
  it('G3高所オブジェクトの塗り色はPALETTE.G3に固定される(art-spec §5.1.1)', () => {
    expect(getTallObjectColors().base).toBe(PALETTE.G3);
  });

  it('接地帯はPALETTE.N1(1段暗い色)にする', () => {
    expect(getTallObjectColors().groundBand).toBe(PALETTE.N1);
  });
});
