// art-spec §8: 自作シーケンサ(最大8ch)。譜面(score.ts)と楽器サンプル
// (synth.ts)を受け取り、AudioContext上で発音をスケジューリングする
// (PHASE1-PLAN-01-REV2【9】(c))。
//
// PHASE1-UNITG-REVIEW追加指摘: 初版のplayScoreはScheduledNoteのpitchHz・
// velocity・durationSecを無視し、各楽器の基準周波数・エンベロープのまま
// 固定長で鳴らすだけだった。譜面→再生パラメータ(playbackRate・gain・
// 発音/停止時刻)への変換をcomputePlaybackPlan純関数として分離し、
// playScoreはその結果をAudioBufferSourceNode/GainNodeへ適用するだけにする。
import { MAX_CHANNELS, computeLoopDurationSec, computeScheduledNotes, type Score } from './score';
import { BGM_MASTER_GAIN } from './mixLevels';
import type { InstrumentParams } from './synth';

export interface ChannelMixConfig {
  channelIndex: number;
  gain: number;
}

// 単純な合算クリップ防止として、チャンネル数で等分したゲインを返す。
// 既定のmasterGainはBGM_MASTER_GAIN(mixLevels.ts)を使う。BGMとモーター音が
// 同時に鳴る画面(最悪ケースタブ・音源タブ)でも合算がクリップ(絶対値1.0)を
// 超えないよう、モーター側の予算(MOTOR_MASTER_GAIN)と合計して1.0以下になる
// よう校正されている(Task#19)。
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
  /** channel gain × note.velocity。 */
  gain: number;
  /** durationSecがpresetのサンプル長を超える場合、サンプルをループ再生して
   *  stopTimeSecちょうどで打ち切る必要があることを示す。 */
  loopSample: boolean;
}

// 譜面→秒スケジュール(score.ts)の結果を、実際にAudioBufferSourceNode/GainNodeへ
// 適用するためのパラメータへ変換する純関数。Web Audio APIには依存しない。
export function computePlaybackPlan(score: Score, presets: Record<string, InstrumentParams>): NotePlaybackPlan[] {
  const scheduled = computeScheduledNotes(score);
  const channelMix = computeChannelMix(score.channels.length);

  return scheduled.map((note) => {
    const preset = presets[note.instrument];
    if (!preset) {
      throw new Error(`unknown instrument preset: ${note.instrument}`);
    }
    const playbackRate = preset.pitched ? note.pitchHz / preset.frequencyHz : 1;
    if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
      throw new Error(`invalid playbackRate computed for ${note.instrument}: ${playbackRate}`);
    }
    const channelGain = channelMix[note.channelIndex]?.gain ?? 0;

    return {
      channelIndex: note.channelIndex,
      instrument: note.instrument,
      startTimeSec: note.startTimeSec,
      stopTimeSec: note.startTimeSec + note.durationSec,
      playbackRate,
      gain: channelGain * note.velocity,
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
  const plans = computePlaybackPlan(score, presets);
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
