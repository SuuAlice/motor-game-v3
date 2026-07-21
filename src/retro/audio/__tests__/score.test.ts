import { describe, expect, it } from 'vitest';
import {
  computeLoopDurationSec,
  computeMaxConcurrentVoices,
  computeScheduledNotes,
  computeScoreDurationSec,
  validateScore,
  type Score,
} from '../score';
import { BGM_LOOP_BEATS, BGM_SCORE } from '../generated/bgmScore';

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

  // PHASE1-UNITG-REVIEW追加指摘6: 有限値検証(NaN/Infinityの伝播を防ぐ)
  it('bpmがNaN/Infinityは拒否する', () => {
    expect(() => validateScore({ ...SIMPLE_SCORE, bpm: NaN })).toThrow();
    expect(() => validateScore({ ...SIMPLE_SCORE, bpm: Infinity })).toThrow();
  });

  it('note.pitchHzが0以下・NaN・Infinityは拒否する', () => {
    const mk = (pitchHz: number): Score => ({
      bpm: 120,
      channels: [{ instrument: 'bass', notes: [{ time: 0, pitchHz, durationBeats: 1, velocity: 1 }] }],
    });
    expect(() => validateScore(mk(0))).toThrow();
    expect(() => validateScore(mk(-1))).toThrow();
    expect(() => validateScore(mk(NaN))).toThrow();
    expect(() => validateScore(mk(Infinity))).toThrow();
  });

  it('note.time/durationBeatsがNaN/Infinityは拒否する', () => {
    const mkTime = (time: number): Score => ({
      bpm: 120,
      channels: [{ instrument: 'kick', notes: [{ time, pitchHz: 55, durationBeats: 1, velocity: 1 }] }],
    });
    expect(() => validateScore(mkTime(NaN))).toThrow();
    expect(() => validateScore(mkTime(Infinity))).toThrow();
    const mkDuration = (durationBeats: number): Score => ({
      bpm: 120,
      channels: [{ instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats, velocity: 1 }] }],
    });
    expect(() => validateScore(mkDuration(NaN))).toThrow();
    expect(() => validateScore(mkDuration(Infinity))).toThrow();
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

describe('computeLoopDurationSec', () => {
  it('bpm=100・8拍なら4.8秒になる(既知値、BGM_SCOREの設計値)', () => {
    expect(computeLoopDurationSec({ bpm: 100, channels: [] }, 8)).toBeCloseTo(4.8, 5);
  });

  it('bpm=120・4拍なら2秒になる(既知値)', () => {
    expect(computeLoopDurationSec({ bpm: 120, channels: [] }, 4)).toBeCloseTo(2, 5);
  });

  it('loopBeatsが0以下・NaN・Infinityは拒否する', () => {
    expect(() => computeLoopDurationSec({ bpm: 120, channels: [] }, 0)).toThrow();
    expect(() => computeLoopDurationSec({ bpm: 120, channels: [] }, -1)).toThrow();
    expect(() => computeLoopDurationSec({ bpm: 120, channels: [] }, NaN)).toThrow();
  });

  it('bpmが不正な場合も拒否する', () => {
    expect(() => computeLoopDurationSec({ bpm: 0, channels: [] }, 8)).toThrow();
  });
});

// Task#AUDIO-MIX-FIX2(Suu承認): BGM合算ゲインの分割数を、譜面から実測した
// 最大同時発音voice数で決める。以下は承認された安全条件(半開区間・境界の非重複・
// ループ境界をまたぐ重なり・空譜面の明示的拒否)を固定する回帰テスト。
describe('computeMaxConcurrentVoices', () => {
  it('異なるchannelの音符が時間的に重なれば2voiceになる', () => {
    const score: Score = {
      bpm: 60, // secPerBeat=1
      channels: [
        { instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats: 2, velocity: 1 }] }, // [0,2)
        { instrument: 'bass', notes: [{ time: 1, pitchHz: 110, durationBeats: 2, velocity: 1 }] }, // [1,3) 1で重なる
      ],
    };
    expect(computeMaxConcurrentVoices(score)).toBe(2);
  });

  it('同一channel内で音符が重なっていても別voiceとして数える', () => {
    const score: Score = {
      bpm: 60,
      channels: [
        {
          instrument: 'kick',
          notes: [
            { time: 0, pitchHz: 55, durationBeats: 2, velocity: 1 }, // [0,2)
            { time: 1, pitchHz: 55, durationBeats: 2, velocity: 1 }, // [1,3) 同一channel内だが重なる
          ],
        },
      ],
    };
    expect(computeMaxConcurrentVoices(score)).toBe(2);
  });

  it('ある音符の終了時刻と次の音符の開始時刻がちょうど一致する場合は重なりに数えない(半開区間)', () => {
    const score: Score = {
      bpm: 60,
      channels: [
        { instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats: 1, velocity: 1 }] }, // [0,1)
        { instrument: 'bass', notes: [{ time: 1, pitchHz: 110, durationBeats: 1, velocity: 1 }] }, // [1,2) 境界が一致するだけ
      ],
    };
    expect(computeMaxConcurrentVoices(score)).toBe(1);
  });

  it('loopDurationSecを渡すと、ループ境界をまたぐ前ループ末尾の音符と次ループ冒頭の音符の重なりを検出する', () => {
    const score: Score = {
      bpm: 60, // secPerBeat=1、ループ長を3秒とする
      channels: [
        { instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats: 0.5, velocity: 1 }] }, // [0,0.5)
        { instrument: 'bass', notes: [{ time: 2, pitchHz: 110, durationBeats: 1.5, velocity: 1 }] }, // [2,3.5) ループ長3を超えて次ループの[0,0.5)と重なる(3.5>3)
      ],
    };
    // ループ非考慮では単発区間として重ならない(kick[0,0.5) と bass[2,3.5)は同一周内で重ならない)
    expect(computeMaxConcurrentVoices(score)).toBe(1);
    // ループ考慮では、bassの尾([2,3.5))が次周のkick([3,3.5)、+3秒シフト後)と重なる
    expect(computeMaxConcurrentVoices(score, 3)).toBe(2);
  });

  // PHASE1-AUDIO-MIX-FIX2-REVIEW指摘対応: 固定回数(前後1周分)の周回展開では
  // duration>=2*loopDurationSecの音符を検出できない不足があった。周期正規化方式
  // (fullCycles=floor(D/L)のbaseline + remainder=D-fullCycles*Lの円環区間掃引)へ
  // 修正し、以下の4テストで固定する。
  it('durationが1周期を超える単一noteは、周期的な自己反復により最大2voiceになる', () => {
    const score: Score = {
      bpm: 60, // secPerBeat=1、ループ長1秒
      channels: [{ instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats: 1.5, velocity: 1 }] }], // duration=1.5秒=1.5周期
    };
    expect(computeMaxConcurrentVoices(score, 1)).toBe(2);
  });

  it('durationが2周期を超える単一noteは、周期的な自己反復により最大3voiceになる', () => {
    const score: Score = {
      bpm: 60,
      channels: [{ instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats: 2.5, velocity: 1 }] }], // duration=2.5秒=2.5周期
    };
    expect(computeMaxConcurrentVoices(score, 1)).toBe(3);
  });

  it('開始時刻が1周期より後でも、mod正規化した位置で正しく重なりを検出する', () => {
    const score: Score = {
      bpm: 60, // secPerBeat=1、ループ長1秒
      channels: [
        // startSec=2.2 → mod 1 = 0.2、interval[0.2,0.5)
        { instrument: 'kick', notes: [{ time: 2.2, pitchHz: 55, durationBeats: 0.3, velocity: 1 }] },
        // interval[0.1,0.4)、上のmod後区間[0.2,0.5)と[0.2,0.4)で重なる
        { instrument: 'bass', notes: [{ time: 0.1, pitchHz: 110, durationBeats: 0.3, velocity: 1 }] },
      ],
    };
    expect(computeMaxConcurrentVoices(score, 1)).toBe(2);
  });

  it('durationが周期ちょうど(半開区間境界)の単一noteは、自己反復と重ならず1voiceのまま', () => {
    const score: Score = {
      bpm: 60,
      channels: [{ instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats: 1, velocity: 1 }] }], // duration=1秒=ちょうど1周期
    };
    // 次周の同一音符の開始([1,2))とこの音符の終了(1)がちょうど一致するため半開区間で重ならない
    expect(computeMaxConcurrentVoices(score, 1)).toBe(1);
  });

  it('5channelでもどの音符も時間的に重ならなければdivisorは1になる', () => {
    const score: Score = {
      bpm: 60,
      channels: [
        { instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats: 1, velocity: 1 }] },
        { instrument: 'snare', notes: [{ time: 1, pitchHz: 200, durationBeats: 1, velocity: 1 }] },
        { instrument: 'bass', notes: [{ time: 2, pitchHz: 110, durationBeats: 1, velocity: 1 }] },
        { instrument: 'chord', notes: [{ time: 3, pitchHz: 220, durationBeats: 1, velocity: 1 }] },
        { instrument: 'lead', notes: [{ time: 4, pitchHz: 440, durationBeats: 1, velocity: 1 }] },
      ],
    };
    expect(computeMaxConcurrentVoices(score)).toBe(1);
  });

  it('BGM_SCORE(BGM_LOOP_BEATSループ込み)の実測divisorは既知値4になる', () => {
    const loopDurationSec = computeLoopDurationSec(BGM_SCORE, BGM_LOOP_BEATS);
    expect(computeMaxConcurrentVoices(BGM_SCORE, loopDurationSec)).toBe(4);
    // ループを考慮しなくても(単発区間として見ても)このスコアでは同じ4になる
    // (最大重なりがループ境界をまたがずに発生するため、既知値として固定する)。
    expect(computeMaxConcurrentVoices(BGM_SCORE)).toBe(4);
  });

  it('空譜面(音符0件)は黙ってdivisor 0にせず明示的に拒否する', () => {
    expect(() => computeMaxConcurrentVoices({ bpm: 120, channels: [] })).toThrow();
    expect(() => computeMaxConcurrentVoices({ bpm: 120, channels: [{ instrument: 'kick', notes: [] }] })).toThrow();
  });

  it('loopDurationSecが0以下・NaN・Infinityは拒否する', () => {
    const score: Score = { bpm: 120, channels: [{ instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats: 1, velocity: 1 }] }] };
    expect(() => computeMaxConcurrentVoices(score, 0)).toThrow();
    expect(() => computeMaxConcurrentVoices(score, -1)).toThrow();
    expect(() => computeMaxConcurrentVoices(score, NaN)).toThrow();
  });

  it('不正な譜面(validateScore違反)は拒否する', () => {
    const bad: Score = { bpm: 0, channels: [{ instrument: 'kick', notes: [{ time: 0, pitchHz: 55, durationBeats: 1, velocity: 1 }] }] };
    expect(() => computeMaxConcurrentVoices(bad)).toThrow();
  });
});
