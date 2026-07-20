import { describe, expect, it } from 'vitest';
import { blend50Average, blendAdditive, isDitherOn } from '../blend';

describe('blendAdditive', () => {
  it('各チャンネルを加算する', () => {
    expect(blendAdditive('#100000', '#200000')).toBe('#300000');
  });

  it('255を超える場合は255でクランプする', () => {
    expect(blendAdditive('#ff0000', '#100000')).toBe('#ff0000');
  });

  it('黒(#000000)との加算は変化しない', () => {
    expect(blendAdditive('#123456', '#000000')).toBe('#123456');
  });

  it('可換(base/overlayを入れ替えても同じ結果)', () => {
    expect(blendAdditive('#334455', '#112233')).toBe(blendAdditive('#112233', '#334455'));
  });
});

describe('blend50Average', () => {
  it('各チャンネルの平均を返す', () => {
    expect(blend50Average('#000000', '#ffffff')).toBe('#808080');
  });

  it('同色同士は変化しない', () => {
    expect(blend50Average('#4a4a57', '#4a4a57')).toBe('#4a4a57');
  });

  it('可換(base/overlayを入れ替えても同じ結果)', () => {
    expect(blend50Average('#334455', '#112233')).toBe(blend50Average('#112233', '#334455'));
  });
});

describe('isDitherOn', () => {
  it('(0,0)はtrue、隣接ピクセルはfalseになる(市松模様)', () => {
    expect(isDitherOn(0, 0)).toBe(true);
    expect(isDitherOn(1, 0)).toBe(false);
    expect(isDitherOn(0, 1)).toBe(false);
    expect(isDitherOn(1, 1)).toBe(true);
  });

  it('負の座標でも一貫した市松模様になる', () => {
    expect(isDitherOn(-1, 0)).toBe(false);
    expect(isDitherOn(-1, -1)).toBe(true);
  });
});
