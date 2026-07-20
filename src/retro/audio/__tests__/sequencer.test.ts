import { describe, expect, it } from 'vitest';
import { computeChannelMix } from '../sequencer';

describe('computeChannelMix', () => {
  it('チャンネル数で等分したゲインを返す(既知値)', () => {
    const mix = computeChannelMix(4, 1);
    expect(mix).toHaveLength(4);
    for (const c of mix) {
      expect(c.gain).toBeCloseTo(0.25, 5);
    }
    expect(mix.map((c) => c.channelIndex)).toEqual([0, 1, 2, 3]);
  });

  it('1chなら全ゲインを1chへ割り当てる', () => {
    const mix = computeChannelMix(1, 1);
    expect(mix[0].gain).toBe(1);
  });

  it('channelCountが8を超える、または1未満は拒否する(最大8ch)', () => {
    expect(() => computeChannelMix(9)).toThrow();
    expect(() => computeChannelMix(0)).toThrow();
  });

  it('ちょうど8chは許容する', () => {
    expect(() => computeChannelMix(8)).not.toThrow();
  });

  it('masterGainが負の場合は拒否する', () => {
    expect(() => computeChannelMix(2, -1)).toThrow();
  });
});
