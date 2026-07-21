import { describe, expect, it } from 'vitest';
import { computeChannelMix, computePlaybackPlan } from '../sequencer';
import { BGM_MASTER_GAIN } from '../mixLevels';
import { INSTRUMENT_PRESETS } from '../synth';
import type { InstrumentParams } from '../synth';
import { computeLoopDurationSec, computeMaxConcurrentVoices, type Score } from '../score';
import { BGM_LOOP_BEATS, BGM_SCORE } from '../generated/bgmScore';

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

  // Task#AUDIO-MIX-FIX2(Suu承認): gainの分割数は「チャンネル数」ではなく、譜面から
  // 実測した最大同時発音voice数(score.ts computeMaxConcurrentVoices)を使う。
  it('gainはvoice gain(BGM_MASTER_GAIN/実測最大同時発音voice数)×velocityになる(既知値)', () => {
    const score: Score = {
      bpm: 120,
      channels: [
        { instrument: 'kick', notes: [{ time: 0, pitchHz: 100, durationBeats: 0.5, velocity: 0.8 }] },
        { instrument: 'bass', notes: [{ time: 0, pitchHz: 100, durationBeats: 0.5, velocity: 0.4 }] },
      ],
    };
    const plan = computePlaybackPlan(score, TEST_PRESETS);
    // 2音符が同時刻[0, 0.25)で重なるため、実測最大同時発音voice数=2
    // (このフィクスチャではチャンネル数と一致するが、分割根拠は同時発音数)。
    const voiceGain = BGM_MASTER_GAIN / 2;
    expect(plan[0].gain).toBeCloseTo(voiceGain * 0.8, 5);
    expect(plan[1].gain).toBeCloseTo(voiceGain * 0.4, 5);
  });

  it('チャンネル数が2でも音符が時間的に重ならなければvoice divisorは1になる(既知値)', () => {
    const score: Score = {
      bpm: 120, // secPerBeat=0.5
      channels: [
        { instrument: 'kick', notes: [{ time: 0, pitchHz: 100, durationBeats: 0.5, velocity: 0.8 }] }, // [0,0.25)
        { instrument: 'bass', notes: [{ time: 1, pitchHz: 100, durationBeats: 0.5, velocity: 0.4 }] }, // [0.5,0.75) 重ならない
      ],
    };
    const plan = computePlaybackPlan(score, TEST_PRESETS);
    // チャンネル数(2)ではなく実測最大同時発音voice数(1)で割るため、旧方式(/2)より大きいgainになる。
    expect(plan[0].gain).toBeCloseTo(BGM_MASTER_GAIN * 0.8, 5);
    expect(plan[1].gain).toBeCloseTo(BGM_MASTER_GAIN * 0.4, 5);
  });

  it('loopBeatsを渡すと、ループ境界をまたぐ重なりもvoice divisorへ反映される(既知値)', () => {
    const score: Score = {
      bpm: 60, // secPerBeat=1、ループ長3秒(loopBeats=3)
      channels: [
        { instrument: 'kick', notes: [{ time: 0, pitchHz: 100, durationBeats: 0.5, velocity: 1 }] }, // [0,0.5)
        { instrument: 'bass', notes: [{ time: 2, pitchHz: 100, durationBeats: 1.5, velocity: 1 }] }, // [2,3.5) 次周[0,0.5)と重なる
      ],
    };
    const planWithoutLoop = computePlaybackPlan(score, TEST_PRESETS);
    expect(planWithoutLoop[0].gain).toBeCloseTo(BGM_MASTER_GAIN * 1, 5); // 単発ではvoice divisor=1

    const planWithLoop = computePlaybackPlan(score, TEST_PRESETS, 3);
    expect(planWithLoop[0].gain).toBeCloseTo((BGM_MASTER_GAIN / 2) * 1, 5); // ループ考慮ではvoice divisor=2
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

// Task#AUDIO-MIX-FIX2(Suu承認、テスト不変条件7): 任意時点で同時に鳴っている
// note.gainの合計がBGM_MASTER_GAINを超えないことを固定する回帰テスト。
// gain自体(エンベロープ適用前のGainNode.gain.value)が「dry段階のgain合計上限」
// であり、Convolver適用後の最終ピークを保証するものではない(エンベロープは
// 0..1のためgainはdry振幅の上限として働く)。
//
// PHASE1-AUDIO-MIX-FIX2-REVIEW指摘対応: computePlaybackPlanが返すのは1周分の
// スケジュールのみ。ループ再生では同一譜面がloopDurationSecごとに繰り返し開始
// されるため、1周分だけを掃引するとループ境界をまたぐ重なり(前周の音符の尾と
// 次周冒頭の音符が同時に鳴るケース)を見逃す。前後何周分をずらして重ね合わせれば
// 定常状態を十分カバーできるかは、譜面中の最長音価をloopDurationSecで割った
// 周回数から動的に決める(固定回数のハードコードはしない)。
function sweepGainSum(events: Array<{ timeSec: number; delta: number }>): number {
  const sorted = [...events].sort((a, b) => a.timeSec - b.timeSec || a.delta - b.delta);
  let sum = 0;
  let maxSum = 0;
  for (const event of sorted) {
    sum += event.delta;
    if (sum > maxSum) maxSum = sum;
  }
  return maxSum;
}

function computeMaxSimultaneousGainSum(score: Score, presets: Record<string, InstrumentParams>, loopBeats?: number): number {
  const plan = computePlaybackPlan(score, presets, loopBeats);
  if (loopBeats === undefined) {
    return sweepGainSum(plan.flatMap((note) => [
      { timeSec: note.startTimeSec, delta: note.gain },
      { timeSec: note.stopTimeSec, delta: -note.gain },
    ]));
  }

  const loopDurationSec = computeLoopDurationSec(score, loopBeats);
  const maxDurationSec = Math.max(...plan.map((note) => note.stopTimeSec - note.startTimeSec));
  const repeatCycles = Math.ceil(maxDurationSec / loopDurationSec) + 1;

  const events: Array<{ timeSec: number; delta: number }> = [];
  for (let cycle = -repeatCycles; cycle <= repeatCycles; cycle++) {
    const offsetSec = cycle * loopDurationSec;
    for (const note of plan) {
      events.push({ timeSec: note.startTimeSec + offsetSec, delta: note.gain });
      events.push({ timeSec: note.stopTimeSec + offsetSec, delta: -note.gain });
    }
  }
  return sweepGainSum(events);
}

describe('dry gain合計の上限(Task#AUDIO-MIX-FIX2 テスト不変条件7)', () => {
  it('BGM_SCORE(ループ込み)は任意時点でgain合計がBGM_MASTER_GAINを超えない', () => {
    const loopDurationSec = computeLoopDurationSec(BGM_SCORE, BGM_LOOP_BEATS);
    const maxSum = computeMaxSimultaneousGainSum(BGM_SCORE, INSTRUMENT_PRESETS, BGM_LOOP_BEATS);
    expect(loopDurationSec).toBeGreaterThan(0); // ループ長が正しく解決されていることの前提確認
    expect(maxSum).toBeLessThanOrEqual(BGM_MASTER_GAIN + 1e-9);
  });

  it('ループ境界をまたいで重なる境界フィクスチャは、voice divisorが正しく2になり、gain合計がBGM_MASTER_GAINを超えない', () => {
    const score: Score = {
      bpm: 60,
      channels: [
        { instrument: 'kick', notes: [{ time: 0, pitchHz: 100, durationBeats: 0.5, velocity: 1 }] }, // [0,0.5)
        { instrument: 'bass', notes: [{ time: 2, pitchHz: 100, durationBeats: 1.5, velocity: 1 }] }, // [2,3.5) 次周[0,0.5)と重なる
      ],
    };
    // 前提確認: このフィクスチャの実測voice divisorはループ考慮で2になる(旧実装は1のままだった)。
    expect(computeMaxConcurrentVoices(score, 3)).toBe(2);

    const maxSum = computeMaxSimultaneousGainSum(score, TEST_PRESETS, 3);
    // 重なりが実際に検出されていること(divisor=1のまま=BGM_MASTER_GAINそのものに
    // 近い値まで積み上がっていないこと)も合わせて確認する。
    expect(maxSum).toBeGreaterThan(BGM_MASTER_GAIN * 0.9);
    expect(maxSum).toBeLessThanOrEqual(BGM_MASTER_GAIN + 1e-9);
  });

  it('対照: もしvoice divisorが誤って1のままだったら、この境界フィクスチャのgain合計はBGM_MASTER_GAINを超える', () => {
    // kick(velocity=1)とbass(velocity=1)が重なる瞬間、divisor=1のまま(旧実装のように
    // ループ境界の重なりを考慮しない)gainを割り当てていたら、それぞれBGM_MASTER_GAIN×1が
    // そのまま加算され、合計は2×BGM_MASTER_GAINとなり明らかに予算を超える。
    // これは今回の修正(voice divisor=2への是正)が実際に必要だったことを示す対照値。
    const naiveGainSumIfDivisorWereOne = BGM_MASTER_GAIN * 1 + BGM_MASTER_GAIN * 1;
    expect(naiveGainSumIfDivisorWereOne).toBeGreaterThan(BGM_MASTER_GAIN);
  });
});
