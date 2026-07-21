import { describe, expect, it } from 'vitest';
import { computeChannelMix, computePlaybackPlan } from '../sequencer';
import { BGM_MASTER_GAIN } from '../mixLevels';
import type { InstrumentParams } from '../synth';
import type { Score } from '../score';

// テスト用に実在のInstrumentName('kick'=打楽器・'bass'=pitched楽器)をキーとして
// 差し替えたプリセットを使う(Score.channels[].instrumentの型はInstrumentNameの
// 厳密なUnionのため、架空の楽器名は使わない)。
const TEST_PRESETS: Record<string, InstrumentParams> = {
  kick: {
    name: 'kick',
    waveform: 'sine',
    frequencyHz: 100,
    durationSec: 0.3,
    attackSec: 0,
    decaySec: 0,
    sustainLevel: 1,
    releaseSec: 0,
    pitched: false,
  },
  bass: {
    name: 'bass',
    waveform: 'sine',
    frequencyHz: 100,
    durationSec: 0.5,
    attackSec: 0,
    decaySec: 0,
    sustainLevel: 1,
    releaseSec: 0,
    pitched: true,
  },
};

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

  // Task#19: BGMとモーター音の合算クリップ防止のため、既定のmasterGainは
  // 1ではなくBGM_MASTER_GAIN(mixLevels.ts)を使う。
  it('masterGainを省略した場合はBGM_MASTER_GAINを使う(既知値)', () => {
    const mix = computeChannelMix(4);
    for (const c of mix) {
      expect(c.gain).toBeCloseTo(BGM_MASTER_GAIN / 4, 5);
    }
  });
});

// PHASE1-UNITG-REVIEW追加指摘: playScoreがpitchHz/velocity/durationSecを
// 無視していた不具合の修正。譜面→再生パラメータへの変換を検証する。
describe('computePlaybackPlan', () => {
  it('pitched楽器はplaybackRate=note.pitchHz/preset.frequencyHzになる(既知値)', () => {
    const score: Score = {
      bpm: 120, // secPerBeat=0.5
      channels: [{ instrument: 'bass', notes: [{ time: 0, pitchHz: 200, durationBeats: 0.5, velocity: 1 }] }],
    };
    const plan = computePlaybackPlan(score, TEST_PRESETS);
    expect(plan[0].playbackRate).toBeCloseTo(200 / 100, 5); // preset.frequencyHz=100
  });

  it('打楽器はnote.pitchHzを無視しplaybackRate=1を維持する(既知値)', () => {
    const score: Score = {
      bpm: 120,
      channels: [{ instrument: 'kick', notes: [{ time: 0, pitchHz: 9999, durationBeats: 0.5, velocity: 1 }] }],
    };
    const plan = computePlaybackPlan(score, TEST_PRESETS);
    expect(plan[0].playbackRate).toBe(1);
  });

  it('gainはchannel gain×velocityになる(既知値)', () => {
    const score: Score = {
      bpm: 120,
      channels: [
        { instrument: 'kick', notes: [{ time: 0, pitchHz: 100, durationBeats: 0.5, velocity: 0.8 }] },
        { instrument: 'bass', notes: [{ time: 0, pitchHz: 100, durationBeats: 0.5, velocity: 0.4 }] },
      ],
    };
    const plan = computePlaybackPlan(score, TEST_PRESETS);
    // channelCount=2 → channel gain=BGM_MASTER_GAIN/2ずつ(Task#19以降の既定予算)
    const channelGain = BGM_MASTER_GAIN / 2;
    expect(plan[0].gain).toBeCloseTo(channelGain * 0.8, 5);
    expect(plan[1].gain).toBeCloseTo(channelGain * 0.4, 5);
  });

  it('stopTimeSecはstartTimeSec+durationSec(拍→秒換算後)になる(既知値)', () => {
    const score: Score = {
      bpm: 120, // secPerBeat=0.5
      channels: [{ instrument: 'bass', notes: [{ time: 1, pitchHz: 100, durationBeats: 2, velocity: 1 }] }],
    };
    const plan = computePlaybackPlan(score, TEST_PRESETS);
    expect(plan[0].startTimeSec).toBeCloseTo(0.5, 5);
    expect(plan[0].stopTimeSec).toBeCloseTo(0.5 + 1.0, 5); // 2拍=1.0秒
  });

  it('pitched楽器でnote.durationSecがpreset.durationSecを超えるとloopSample=trueになる', () => {
    const score: Score = {
      bpm: 60, // secPerBeat=1
      channels: [{ instrument: 'bass', notes: [{ time: 0, pitchHz: 100, durationBeats: 2, velocity: 1 }] }], // 2秒 > preset 0.5秒
    };
    const plan = computePlaybackPlan(score, TEST_PRESETS);
    expect(plan[0].loopSample).toBe(true);
  });

  it('durationSecがpreset.durationSec以下ならloopSample=falseになる', () => {
    const score: Score = {
      bpm: 120,
      channels: [{ instrument: 'bass', notes: [{ time: 0, pitchHz: 100, durationBeats: 0.5, velocity: 1 }] }], // 0.25秒 < 0.5秒
    };
    const plan = computePlaybackPlan(score, TEST_PRESETS);
    expect(plan[0].loopSample).toBe(false);
  });

  it('打楽器は長い音価でもloopSample=falseのまま(ループで音色が破綻しない)', () => {
    const score: Score = {
      bpm: 60,
      channels: [{ instrument: 'kick', notes: [{ time: 0, pitchHz: 100, durationBeats: 5, velocity: 1 }] }], // 5秒 >> preset 0.3秒
    };
    const plan = computePlaybackPlan(score, TEST_PRESETS);
    expect(plan[0].loopSample).toBe(false);
  });

  it('未知の楽器名を参照する譜面は拒否する', () => {
    const score: Score = {
      bpm: 120,
      channels: [{ instrument: 'unknown' as never, notes: [{ time: 0, pitchHz: 100, durationBeats: 1, velocity: 1 }] }],
    };
    expect(() => computePlaybackPlan(score, TEST_PRESETS)).toThrow();
  });
});
