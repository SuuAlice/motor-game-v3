import { describe, expect, it } from 'vitest';
import { MOTOR_SAMPLE_PARAMS, MOTOR_SOUND_PARAMS, computeMotorGain, computeMotorPlaybackRate } from '../motorSound';
import { MOTOR_MASTER_GAIN } from '../mixLevels';
import { computeEnvelopeGain } from '../synth';

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
// Task#19修正: 旧実装は二値(0/1)だったが、BGMとの合算クリップ防止のため
// MOTOR_MASTER_GAINを上限としてrpmに比例する連続値へ変更した。
describe('computeMotorGain', () => {
  it('rpm=0は厳密にゲイン0(無音)になる(既知値)', () => {
    expect(computeMotorGain(0, 8000)).toBe(0);
  });

  it('rpm>=baseRpmはMOTOR_MASTER_GAINちょうどにクランプされる(既知値)', () => {
    expect(computeMotorGain(8000, 8000)).toBe(MOTOR_MASTER_GAIN);
    expect(computeMotorGain(16000, 8000)).toBe(MOTOR_MASTER_GAIN);
  });

  it('0<rpm<baseRpmはrpmに比例した中間ゲインになる(既知値)', () => {
    expect(computeMotorGain(4000, 8000)).toBeCloseTo(MOTOR_MASTER_GAIN * 0.5, 5);
  });

  it('rpmについて単調非減少である', () => {
    const values = [0, 1000, 2000, 4000, 6000, 8000, 12000].map((rpm) => computeMotorGain(rpm, 8000));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it('MOTOR_MASTER_GAINを超えない', () => {
    for (const rpm of [1, 100, 8000, 100000]) {
      expect(computeMotorGain(rpm, 8000)).toBeLessThanOrEqual(MOTOR_MASTER_GAIN);
    }
  });

  it('rpmが負、baseRpmが0以下の場合は拒否する', () => {
    expect(() => computeMotorGain(-1, 8000)).toThrow();
    expect(() => computeMotorGain(8000, 0)).toThrow();
    expect(() => computeMotorGain(8000, -1)).toThrow();
  });
});

// Task#AUDIO-FINAL-AUDIT(Suu承認、Bクリック/継ぎ目監査の補強): モーター音は
// source.loop=trueで連続ループ再生されるため、synth.test.tsの5プリセットと同様に
// 実際の最終サンプル時刻(durationSecちょうどではなく1サンプル手前)でのgainが
// クリック安全閾値以下であることを検証する(根拠はsynth.test.ts側のコメント参照)。
describe('モーター音ループ境界のクリック安全性(Task#AUDIO-FINAL-AUDIT)', () => {
  const CLICK_SAFE_THRESHOLD = 0.01;
  const SAMPLE_RATES = [44100, 48000];

  for (const sampleRate of SAMPLE_RATES) {
    it(`sampleRate=${sampleRate}: 実際の最終サンプル時刻でのgainがクリック安全閾値以下、かつ解析式と一致する`, () => {
      const params = MOTOR_SAMPLE_PARAMS;
      const sampleCount = Math.ceil(params.durationSec * sampleRate);
      const lastSampleT = (sampleCount - 1) / sampleRate;

      const firstGain = computeEnvelopeGain(0, params);
      const lastGain = computeEnvelopeGain(lastSampleT, params);
      const loopBoundaryDiff = Math.abs(lastGain - firstGain);

      expect(firstGain).toBe(0);

      const analyticLastGain = params.sustainLevel / (params.releaseSec * sampleRate);
      expect(lastGain).toBeCloseTo(analyticLastGain, 6);

      expect(lastGain).toBeLessThanOrEqual(CLICK_SAFE_THRESHOLD);
      expect(loopBoundaryDiff).toBeLessThanOrEqual(CLICK_SAFE_THRESHOLD);
    });
  }
});
