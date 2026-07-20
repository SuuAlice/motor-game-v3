// spec §7.3-1/art-spec §8: モーター音のピッチを回転数に直結させる。減磁・劣化の
// 兆候が音程で聞こえるようにする(診断情報としての音)。RPM→playbackRateの写像は
// 純関数として実装し、実際のAudioBufferSourceNode.playbackRate制御(ブラウザ専用)
// から分離する(PHASE1-PLAN-01-REV2【9】(e))。
import { validateInstrumentParams, type InstrumentParams } from './synth';

const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 4;

// rpmをbaseRpmに対する比としてplaybackRateへ変換し、極端な値による破綻(可聴域外
// への逸脱)を避けるため既定範囲(0.25〜4倍)へクランプする。rpm=0でも下限0.25倍の
// ピッチ自体は返す(停止音を鳴らさない無音化はcomputeMotorGainがGainNode側で行う、
// PHASE1-UNITG-REVIEW追加指摘5)。
export function computeMotorPlaybackRate(rpm: number, baseRpm: number): number {
  if (baseRpm <= 0) {
    throw new Error(`baseRpm must be positive, got ${baseRpm}`);
  }
  if (rpm < 0) {
    throw new Error(`rpm must be non-negative, got ${rpm}`);
  }
  const raw = rpm / baseRpm;
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, raw));
}

// rpm<=0(停止中の物理状態)ではモーター音を無音化する。playbackRateの下限
// クランプ(0.25倍)を維持したまま、音量側でミュートすることで「止まっているのに
// 音が鳴り続ける」不整合を避ける。
export function computeMotorGain(rpm: number): number {
  if (rpm < 0) {
    throw new Error(`rpm must be non-negative, got ${rpm}`);
  }
  return rpm > 0 ? 1 : 0;
}

export const MOTOR_SOUND_PARAMS = {
  baseRpm: 8000,
  durationSec: 1.2,
  seed: 20260721,
} as const;

// モーター用短サンプルの合成パラメータ(synth.tsのInstrumentParamsを再利用)。
// ノコギリ波(高調波を含みモーター音らしい鳴りになる)+短いアタックで、
// AudioBufferSourceNode.loop=trueで継続再生しplaybackRateをRPMに連動させる想定。
export const MOTOR_SAMPLE_PARAMS: InstrumentParams = {
  name: 'motorHum',
  waveform: 'sawtooth',
  frequencyHz: 180,
  durationSec: MOTOR_SOUND_PARAMS.durationSec,
  attackSec: 0.05,
  decaySec: 0.1,
  sustainLevel: 0.8,
  releaseSec: 0.05,
  // モーター音は譜面のnote.pitchHzではなく専用のRPM連動ロジックで制御するため、
  // synth.ts側のpitched(譜面駆動)フラグは使わない。
  pitched: false,
};

validateInstrumentParams(MOTOR_SAMPLE_PARAMS);

// ブラウザ専用: モーター用短サンプルのbufferSourceへRPM連動ピッチを適用する。
export function applyMotorPlaybackRate(source: AudioBufferSourceNode, rpm: number, baseRpm: number): void {
  source.playbackRate.value = computeMotorPlaybackRate(rpm, baseRpm);
}

// ブラウザ専用: モーター音のGainNodeへRPM連動の無音化を適用する。
export function applyMotorGain(gainNode: GainNode, rpm: number): void {
  gainNode.gain.value = computeMotorGain(rpm);
}
