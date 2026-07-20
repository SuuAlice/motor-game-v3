import { describe, expect, it } from 'vitest';
import { computeScheduledNotes, computeScoreDurationSec, validateScore, type Score } from '../score';

const SIMPLE_SCORE: Score = {
  bpm: 120,
  channels: [
    { instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats: 1, velocity: 1 }] },
    { instrument: 'bass', notes: [{ time: 2, pitchHz: 110, durationBeats: 1, velocity: 0.8 }] },
  ],
};

describe('validateScore', () => {
  it('妥当な譜面は例外を投げない', () => {
    expect(() => validateScore(SIMPLE_SCORE)).not.toThrow();
  });

  it('bpmが0以下は拒否する', () => {
    expect(() => validateScore({ ...SIMPLE_SCORE, bpm: 0 })).toThrow();
  });

  it('channelsが8を超えると拒否する(最大8ch)', () => {
    const channels = Array.from({ length: 9 }, () => ({ instrument: 'kick' as const, notes: [] }));
    expect(() => validateScore({ bpm: 120, channels })).toThrow();
  });

  it('channelsがちょうど8chなら許容する', () => {
    const channels = Array.from({ length: 8 }, () => ({ instrument: 'kick' as const, notes: [] }));
    expect(() => validateScore({ bpm: 120, channels })).not.toThrow();
  });

  it('velocityが範囲外(0..1)は拒否する', () => {
    const bad: Score = { bpm: 120, channels: [{ instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats: 1, velocity: 1.5 }] }] };
    expect(() => validateScore(bad)).toThrow();
  });
});

describe('computeScheduledNotes', () => {
  it('bpm=120(1拍=0.5秒)で拍から秒への変換が既知値どおりになる', () => {
    const scheduled = computeScheduledNotes(SIMPLE_SCORE);
    expect(scheduled).toHaveLength(2);
    expect(scheduled[0]).toMatchObject({ channelIndex: 0, instrument: 'kick', startTimeSec: 0, durationSec: 0.5 });
    expect(scheduled[1]).toMatchObject({ channelIndex: 1, instrument: 'bass', startTimeSec: 1, durationSec: 0.5 });
  });

  it('開始時刻の昇順にソートして返す', () => {
    const outOfOrder: Score = {
      bpm: 60,
      channels: [{ instrument: 'lead', notes: [{ time: 3, pitchHz: 440, durationBeats: 1, velocity: 1 }, { time: 1, pitchHz: 440, durationBeats: 1, velocity: 1 }] }],
    };
    const scheduled = computeScheduledNotes(outOfOrder);
    expect(scheduled.map((n) => n.startTimeSec)).toEqual([1, 3]);
  });
});

describe('computeScoreDurationSec', () => {
  it('最後の音の終了時刻を譜面長として返す(既知値)', () => {
    // kick: 0〜0.5秒、bass: 1〜1.5秒 → 譜面長1.5秒
    expect(computeScoreDurationSec(SIMPLE_SCORE)).toBeCloseTo(1.5, 5);
  });

  it('空の譜面は長さ0を返す', () => {
    expect(computeScoreDurationSec({ bpm: 120, channels: [] })).toBe(0);
  });
});
