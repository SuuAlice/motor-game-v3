import { describe, expect, it } from 'vitest';
import { BGM_MASTER_GAIN, MOTOR_MASTER_GAIN } from '../mixLevels';

// Task#19: BGM・モーター音が同時に鳴る画面(最悪ケースタブ・音源タブ)で
// 合算がクリップ(絶対値1.0)を超えないことを固定する。
describe('mixLevels', () => {
  it('BGM_MASTER_GAINとMOTOR_MASTER_GAINの合計は1.0を超えない', () => {
    expect(BGM_MASTER_GAIN + MOTOR_MASTER_GAIN).toBeLessThanOrEqual(1);
  });

  it('両者とも正の値である', () => {
    expect(BGM_MASTER_GAIN).toBeGreaterThan(0);
    expect(MOTOR_MASTER_GAIN).toBeGreaterThan(0);
  });
});
