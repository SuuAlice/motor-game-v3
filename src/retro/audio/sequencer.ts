// art-spec §8: 自作シーケンサ(最大8ch)。譜面(score.ts)と楽器サンプル
// (synth.ts)を受け取り、AudioContext上で発音をスケジューリングする
// (PHASE1-PLAN-01-REV2【9】(c))。チャンネル数上限の検証・音量配分の算出は
// 純関数として分離し、実際のAudioBufferSourceNode.start呼び出し(ブラウザ専用)
// から切り離す。
import { MAX_CHANNELS, computeScheduledNotes, type Score } from './score';

export interface ChannelMixConfig {
  channelIndex: number;
  gain: number;
}

// 単純な合算クリップ防止として、チャンネル数で等分したゲインを返す。
export function computeChannelMix(channelCount: number, masterGain = 1): ChannelMixConfig[] {
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

export type SampleBank = Partial<Record<string, AudioBuffer>>;

// ブラウザ専用: 譜面をAudioContext上で再生する。サンプルはあらかじめ
// renderInstrumentSample(synth.ts)で生成しSampleBankへ格納しておく。
export function playScore(audioCtx: AudioContext, score: Score, sampleBank: SampleBank, destination: AudioNode, startAtSec = 0): void {
  const scheduled = computeScheduledNotes(score);
  const mix = computeChannelMix(score.channels.length);

  for (const note of scheduled) {
    const buffer = sampleBank[note.instrument];
    if (!buffer) continue;

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = mix[note.channelIndex]?.gain ?? 0;

    source.connect(gainNode).connect(destination);
    source.start(audioCtx.currentTime + startAtSec + note.startTimeSec);
  }
}
