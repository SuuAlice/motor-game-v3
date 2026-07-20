// spec §7.3-1/art-spec §8: モーター音のピッチを回転数に直結させる。減磁・劣化の
// 兆候が音程で聞こえるようにする(診断情報としての音)。RPM→playbackRateの写像は
// 純関数として実装し、実際のAudioBufferSourceNode.playbackRate制御(ブラウザ専用)
// から分離する(PHASE1-PLAN-01-REV2【9】(e))。
import { validateInstrumentParams, type InstrumentParams } from './synth';

const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 4;

// rpmをbaseRpmに対する比としてplaybackRateへ変換し、極端な値による破綻(無音化・
// 可聴域外への逸脱)を避けるため既定範囲(0.25〜4倍)へクランプする。
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
};

validateInstrumentParams(MOTOR_SAMPLE_PARAMS);

// ブラウザ専用: モーター用短サンプルのbufferSourceへRPM連動ピッチを適用する。
export function applyMotorPlaybackRate(source: AudioBufferSourceNode, rpm: number, baseRpm: number): void {
  source.playbackRate.value = computeMotorPlaybackRate(rpm, baseRpm);
}
