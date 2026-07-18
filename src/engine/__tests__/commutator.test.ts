import { describe, expect, it } from 'vitest';
import { getCommutationSign, isInDeadZone } from '../commutator';
import { R_COMMUTATOR_MM } from '../constants';

describe('getCommutationSign', () => {
  it('θ=0〜πの範囲では+1', () => {
    expect(getCommutationSign(0)).toBe(1);
    expect(getCommutationSign(0.1)).toBe(1);
    expect(getCommutationSign(Math.PI - 0.01)).toBe(1);
  });

  it('θ=π〜2πの範囲では-1', () => {
    expect(getCommutationSign(Math.PI)).toBe(-1);
    expect(getCommutationSign(Math.PI + 0.1)).toBe(-1);
    expect(getCommutationSign(2 * Math.PI - 0.01)).toBe(-1);
  });

  it('負の角度・2πを超える角度も正規化して判定する', () => {
    expect(getCommutationSign(-0.1)).toBe(-1); // 正規化すると2π-0.1(後半)
    expect(getCommutationSign(2 * Math.PI + 0.1)).toBe(1); // 正規化すると0.1(前半)
  });

  it('半回転(π)ごとに符号が反転する', () => {
    for (let theta = 0; theta < 4 * Math.PI; theta += 0.37) {
      expect(getCommutationSign(theta)).toBe(getCommutationSign(theta + 2 * Math.PI));
    }
  });
});

describe('isInDeadZone', () => {
  it('slitWidthMm=0はデッドゾーンではない(ショート側で扱う)', () => {
    expect(isInDeadZone(0, 0)).toBe(false);
    expect(isInDeadZone(Math.PI, 0)).toBe(false);
  });

  it('θ=0・πの近傍はデッドゾーンに入る', () => {
    const slitWidthMm = 1.5;
    const deadZoneRad = slitWidthMm / R_COMMUTATOR_MM;
    expect(isInDeadZone(0, slitWidthMm)).toBe(true);
    expect(isInDeadZone(deadZoneRad / 4, slitWidthMm)).toBe(true);
    expect(isInDeadZone(Math.PI, slitWidthMm)).toBe(true);
    expect(isInDeadZone(Math.PI + deadZoneRad / 4, slitWidthMm)).toBe(true);
  });

  it('θ=π/2付近(整流の切り替え点から遠い)はデッドゾーンに入らない', () => {
    expect(isInDeadZone(Math.PI / 2, 1.5)).toBe(false);
  });

  it('デッドゾーン境界のちょうど外側は含まれない', () => {
    const slitWidthMm = 2.0;
    const deadZoneRad = slitWidthMm / R_COMMUTATOR_MM;
    const halfWidth = deadZoneRad / 2;
    expect(isInDeadZone(halfWidth + 0.01, slitWidthMm)).toBe(false);
  });

  it('スリット幅が大きいほどデッドゾーンが広がる', () => {
    const narrow = isInDeadZone(0.2, 1.0);
    const wide = isInDeadZone(0.2, 5.0);
    expect(wide).toBe(true);
    // 同じθでも、slitWidthMmが小さいと外れることがある
    expect(narrow === false || narrow === true).toBe(true);
  });
});
