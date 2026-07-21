// art-spec §8: 自作シーケンサ(最大8ch)。譜面(score.ts)と楽器サンプル
// (synth.ts)を受け取り、AudioContext上で発音をスケジューリングする
// (PHASE1-PLAN-01-REV2【9】(c))。
//
// PHASE1-UNITG-REVIEW追加指摘: 初版のplayScoreはScheduledNoteのpitchHz・
// velocity・durationSecを無視し、各楽器の基準周波数・エンベロープのまま
// 固定長で鳴らすだけだった。譜面→再生パラメータ(playbackRate・gain・
// 発音/停止時刻)への変換をcomputePlaybackPlan純関数として分離し、
// playScoreはその結果をAudioBufferSourceNode/GainNodeへ適用するだけにする。
import { MAX_CHANNELS, computeLoopDurationSec, computeMaxConcurrentVoices, computeScheduledNotes, type Score } from './score';
import { BGM_MASTER_GAIN } from './mixLevels';
import type { InstrumentParams } from './synth';

export interface ChannelMixConfig {
  channelIndex: number;
  gain: number;
}

// 単純な合算クリップ防止として、チャンネル数で等分したゲインを返す汎用API。
// 既定のmasterGainはBGM_MASTER_GAIN(mixLevels.ts)を使う。
//
// Task#AUDIO-MIX-FIX2(Suu承認): computePlaybackPlanは「チャンネル数で均等分割」
// (全chが同時に最大velocityで鳴るという実測ではほぼ起きない最悪ケース想定)ではなく、
// 譜面から実測した最大同時発音voice数(computeMaxConcurrentVoices、score.ts)で
// 分割するよう変更した。この関数自体は汎用の等分割APIとして意味を変えずに残す
// (BGM譜面固有のvoice divisorをこの関数のchannelCount引数へ渡すような偽装はしない)。
export function computeChannelMix(channelCount: number, masterGain = BGM_MASTER_GAIN): ChannelMixConfig[] {
  if (channelCount < 1) {
    throw new Error(`channelCount must be at least 1, got ${channelCount}`);
  }
  if (channelCount > MAX_CHANNELS) {
    throw new Error(`channelCount must be at most ${MAX_CHANNELS}, got ${channelCount}`);
  }
  if (masterGain < 0) {
    throw new Error(`masterGain must be non-negative, got ${masterGain}`);
  }
  const perChannelGain = masterGain / channelCount;
  return Array.from({ length: channelCount }, (_, channelIndex) => ({ channelIndex, gain: perChannelGain }));
}

export interface NotePlaybackPlan {
  channelIndex: number;
  instrument: string;
  /** 1ループ内での発音/停止時刻(秒)。 */
  startTimeSec: number;
  stopTimeSec: number;
  /** pitched楽器はnote.pitchHz/preset.frequencyHz、打楽器は1(基準rate維持)。 */
  playbackRate: number;
  /** voice gain(BGM_MASTER_GAIN / 実測最大同時発音voice数) × note.velocity。 */
  gain: number;
  /** durationSecがpresetのサンプル長を超える場合、サンプルをループ再生して
   *  stopTimeSecちょうどで打ち切る必要があることを示す。 */
  loopSample: boolean;
}

// 譜面→秒スケジュール(score.ts)の結果を、実際にAudioBufferSourceNode/GainNodeへ
// 適用するためのパラメータへ変換する純関数。Web Audio APIには依存しない。
//
// Task#AUDIO-MIX-FIX2(Suu承認): gainの分割数は「チャンネル数」ではなく、譜面から
// 実測した最大同時発音voice数(computeMaxConcurrentVoices)を使う。loopBeatsを渡すと
// ループ境界をまたぐ重なり(前ループ末尾の音符と次ループ冒頭の音符の同時発音)も
// 考慮した分割数になる。省略時は単発(ループなし)区間として算出する。
// 注意: ここで保証するのはConvolver適用前のdry段階のgain合計上限であり、
// reverb後の最終出力ピークを保証するものではない。
export function computePlaybackPlan(
  score: Score,
  presets: Record<string, InstrumentParams>,
  loopBeats?: number,
): NotePlaybackPlan[] {
  const scheduled = computeScheduledNotes(score);
  const loopDurationSec = loopBeats !== undefined ? computeLoopDurationSec(score, loopBeats) : undefined;
  const voiceDivisor = computeMaxConcurrentVoices(score, loopDurationSec);
  const perVoiceGain = BGM_MASTER_GAIN / voiceDivisor;

  return scheduled.map((note) => {
    const preset = presets[note.instrument];
    if (!preset) {
      throw new Error(`unknown instrument preset: ${note.instrument}`);
    }
    const playbackRate = preset.pitched ? note.pitchHz / preset.frequencyHz : 1;
    if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
      throw new Error(`invalid playbackRate computed for ${note.instrument}: ${playbackRate}`);
    }

    return {
      channelIndex: note.channelIndex,
      instrument: note.instrument,
      startTimeSec: note.startTimeSec,
      stopTimeSec: note.startTimeSec + note.durationSec,
      playbackRate,
      gain: perVoiceGain * note.velocity,
      // ループはpitched(持続音)楽器のみに適用する。打楽器(kick/snare)は
      // 一撃のサンプルであり、ループ再生すると音色が破綻するため対象外とする。
      loopSample: preset.pitched && note.durationSec > preset.durationSec,
    };
  });
}

export type SampleBank = Partial<Record<string, AudioBuffer>>;

export interface PlaybackHandle {
  stop: () => void;
}

export interface PlayScoreOptions {
  /** ループ再生の周期(拍数)。省略時はループせず1回だけ再生する。 */
  loopBeats?: number;
  /** 次ループのスケジュールを何秒先行して行うか(既定0.1秒)。 */
  lookaheadSec?: number;
}

// ブラウザ専用: 譜面をAudioContext上で再生する。サンプルはあらかじめ
// renderInstrumentSample(synth.ts)で生成しSampleBankへ格納しておく。
// 返り値のstop()で、ループ中の予約・鳴っている音を確実に止められる
// (PHASE1-UNITG-REVIEW追加指摘3: 多重押下で無制限に重複しないためのハンドル)。
export function playScore(
  audioCtx: AudioContext,
  score: Score,
  presets: Record<string, InstrumentParams>,
  sampleBank: SampleBank,
  destination: AudioNode,
  options: PlayScoreOptions = {},
): PlaybackHandle {
  const plans = computePlaybackPlan(score, presets, options.loopBeats);
  const loopDurationSec = options.loopBeats !== undefined ? computeLoopDurationSec(score, options.loopBeats) : null;
  const lookaheadSec = options.lookaheadSec ?? 0.1;

  const activeSources = new Set<AudioBufferSourceNode>();
  let stopped = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  function scheduleIteration(iterationStartSec: number): void {
    for (const plan of plans) {
      const buffer = sampleBank[plan.instrument];
      if (!buffer) continue;

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = plan.playbackRate;
      if (plan.loopSample) source.loop = true;

      const gainNode = audioCtx.createGain();
      gainNode.gain.value = plan.gain;
      source.connect(gainNode).connect(destination);

      const when = iterationStartSec + plan.startTimeSec;
      const stopAt = iterationStartSec + plan.stopTimeSec;
      source.start(when);
      source.stop(stopAt);

      activeSources.add(source);
      source.addEventListener('ended', () => activeSources.delete(source));
    }
  }

  function loop(): void {
    if (stopped) return;
    scheduleIteration(audioCtx.currentTime + lookaheadSec);
    if (loopDurationSec !== null) {
      timerId = setTimeout(loop, Math.max(0, loopDurationSec - lookaheadSec) * 1000);
    }
  }

  loop();

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      for (const source of activeSources) {
        try {
          source.stop();
        } catch {
          // 既に停止済みの場合は無視する
        }
      }
      activeSources.clear();
    },
  };
}
