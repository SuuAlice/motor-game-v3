import { describe, expect, it } from 'vitest';
import { getSegmentPattern } from '../segmentDigits';

describe('getSegmentPattern', () => {
  it('0は上下左右+上下辺(gを除く6セグメント)が点灯する', () => {
    expect(getSegmentPattern('0')).toEqual([true, true, true, true, true, true, false]);
  });

  it('1は右上・右下の2セグメントのみ点灯する', () => {
    expect(getSegmentPattern('1')).toEqual([false, true, true, false, false, false, false]);
  });

  it('8は全セグメント点灯する', () => {
    expect(getSegmentPattern('8')).toEqual([true, true, true, true, true, true, true]);
  });

  it('-は中央セグメントのみ点灯する', () => {
    expect(getSegmentPattern('-')).toEqual([false, false, false, false, false, false, true]);
  });

  it('未対応文字は空白扱い(全消灯)になる', () => {
    expect(getSegmentPattern('X')).toEqual([false, false, false, false, false, false, false]);
    expect(getSegmentPattern(' ')).toEqual([false, false, false, false, false, false, false]);
  });
});
