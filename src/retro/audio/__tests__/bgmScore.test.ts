import { describe, expect, it } from 'vitest';
import { BGM_LOOP_BEATS, BGM_SCORE } from '../generated/bgmScore';
import { computeLoopDurationSec, computeScheduledNotes, computeScoreDurationSec, validateScore } from '../score';

describe('BGM_SCORE', () => {
  it('妥当な譜面である(8ch以内、bpm>0、全ノートが範囲内)', () => {
    expect(() => validateScore(BGM_SCORE)).not.toThrow();
    expect(BGM_SCORE.channels.length).toBeLessThanOrEqual(8);
  });

  it('5楽器(kick/snare/bass/chord/lead)を使用する', () => {
    const instruments = BGM_SCORE.channels.map((c) => c.instrument).sort();
    expect(instruments).toEqual(['bass', 'chord', 'kick', 'lead', 'snare']);
  });

  it('スケジュール変換・譜面長算出が例外なく完了する', () => {
    const scheduled = computeScheduledNotes(BGM_SCORE);
    expect(scheduled.length).toBeGreaterThan(0);
    const duration = computeScoreDurationSec(BGM_SCORE);
    expect(duration).toBeGreaterThan(0);
    expect(Number.isFinite(duration)).toBe(true);
  });

  it('ループ長は8拍(bpm100で4.8秒)になり、譜面の最終ノート終了時刻以上になる', () => {
    const loopDurationSec = computeLoopDurationSec(BGM_SCORE, BGM_LOOP_BEATS);
    expect(loopDurationSec).toBeCloseTo(4.8, 5);
    expect(loopDurationSec).toBeGreaterThanOrEqual(computeScoreDurationSec(BGM_SCORE));
  });
});
