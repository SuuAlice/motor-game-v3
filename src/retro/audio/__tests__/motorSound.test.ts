import { describe, expect, it } from 'vitest';
import { MOTOR_SOUND_PARAMS, computeMotorGain, computeMotorPlaybackRate } from '../motorSound';

describe('computeMotorPlaybackRate', () => {
  it('rpm===baseRpmならplaybackRate=1になる(既知値)', () => {
    expect(computeMotorPlaybackRate(8000, 8000)).toBe(1);
  });

  it('rpmが半分ならplaybackRateも半分になる(既知値)', () => {
    expect(computeMotorPlaybackRate(4000, 8000)).toBe(0.5);
  });

  it('rpmが2倍ならplaybackRateも2倍になる(既知値)', () => {
    expect(computeMotorPlaybackRate(16000, 8000)).toBe(2);
  });

  it('極端に低いrpmは下限(0.25)でクランプされる', () => {
    expect(computeMotorPlaybackRate(1, 8000)).toBe(0.25);
  });

  it('極端に高いrpmは上限(4)でクランプされる', () => {
    expect(computeMotorPlaybackRate(1_000_000, 8000)).toBe(4);
  });

  it('rpm=0は下限にクランプされ、例外を投げない(停止状態)', () => {
    expect(computeMotorPlaybackRate(0, 8000)).toBe(0.25);
  });

  it('rpmが負、baseRpmが0以下の場合は拒否する', () => {
    expect(() => computeMotorPlaybackRate(-1, 8000)).toThrow();
    expect(() => computeMotorPlaybackRate(8000, 0)).toThrow();
    expect(() => computeMotorPlaybackRate(8000, -1)).toThrow();
  });

  it('MOTOR_SOUND_PARAMS.baseRpmは妥当な正の値', () => {
    expect(MOTOR_SOUND_PARAMS.baseRpm).toBeGreaterThan(0);
  });
});

// PHASE1-UNITG-REVIEW追加指摘5: RPM=0では停止中の物理状態に合わせて
// モーター音をGainNode側で無音化する(playbackRateの下限クランプは維持)。
describe('computeMotorGain', () => {
  it('rpm=0はゲイン0(無音)になる(既知値)', () => {
    expect(computeMotorGain(0)).toBe(0);
  });

  it('rpm>0はゲイン1(可聴)になる(既知値)', () => {
    expect(computeMotorGain(1)).toBe(1);
    expect(computeMotorGain(8000)).toBe(1);
  });

  it('rpmが負の場合は拒否する', () => {
    expect(() => computeMotorGain(-1)).toThrow();
  });
});
