// art-spec §8: 自作インパルス応答(IR)+ConvolverNodeによる軽い残響1例
// (PHASE1-PLAN-01-REV2【9】(d))。IRは減衰ノイズ(白色ノイズ×指数減衰包絡線)として
// 生成する。サンプル値の計算は決定論的な純関数(固定seed)とし、Node環境でも
// テストできる。AudioBuffer/ConvolverNodeへの実際の書き込みはブラウザ専用。
import { mulberry32 } from './prng';

export interface ImpulseResponseParams {
  durationSec: number;
  /** 減衰カーブの指数。大きいほど早く減衰する。 */
  decay: number;
  sampleRate: number;
  seed: number;
}

export function validateImpulseResponseParams(params: ImpulseResponseParams): void {
  if (params.durationSec <= 0) {
    throw new Error(`durationSec must be positive, got ${params.durationSec}`);
  }
  if (params.decay <= 0) {
    throw new Error(`decay must be positive, got ${params.decay}`);
  }
  if (params.sampleRate <= 0) {
    throw new Error(`sampleRate must be positive, got ${params.sampleRate}`);
  }
}

// サンプルindexにおける減衰包絡線(0..1、単調減少)を返す純関数。
export function computeImpulseResponseEnvelope(sampleIndex: number, totalSamples: number, decay: number): number {
  const t = Math.min(1, Math.max(0, sampleIndex / totalSamples));
  return Math.pow(1 - t, decay);
}

// 白色ノイズ×減衰包絡線のIRサンプル列を生成する(固定seedで再生成可能)。
export function generateImpulseResponseSamples(params: ImpulseResponseParams): Float32Array {
  validateImpulseResponseParams(params);
  const totalSamples = Math.ceil(params.durationSec * params.sampleRate);
  const rand = mulberry32(params.seed);
  const samples = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const noise = rand() * 2 - 1;
    samples[i] = noise * computeImpulseResponseEnvelope(i, totalSamples, params.decay);
  }
  return samples;
}

// art-spec §8: 会場ごとに残響特性を変えてよいが、Phase1では1例のみとする。
//
// Task#AUDIO-REVERB-TAIL(Suu承認): durationSecは元0.6秒だったが、人間試聴で
// 「BGM停止後の残響尾がすぐ止まる」と指摘された。数値検証の結果、0.6秒では
// wet tail(REVERB_WET_MIX適用後)がノート終了+400ms後にはほぼ聞こえなくなり、
// 尾を引く感触を得る前にIR自体が終了していた。1.2秒への延長は、ノート再生中の
// dry+wet合成音量(REVERB_DRY_MIX/REVERB_WET_MIXで担保、item2相当)にはほぼ
// 影響を与えず(数値検証でOFF比82.8%→83.5%と誤差程度)、停止後の尾の長さのみを
// 確保する。尾の長さを確保する試聴候補であり、最終凍結は人間試聴後に行う。
export const DEFAULT_REVERB_PARAMS: ImpulseResponseParams = {
  durationSec: 1.2,
  decay: 3,
  sampleRate: 44100,
  seed: 20260721,
};

// IRサンプル列のエネルギー(sum of squares)を返す純関数。
export function computeImpulseResponseEnergy(samples: Float32Array): number {
  let energy = 0;
  for (const value of samples) {
    energy += value * value;
  }
  return energy;
}

// Task#AUDIO-REVERB-FIX(Suu承認): IRのエネルギー(sum(h^2))を指定した目標値へ
// 校正する純関数。入力は破壊せず新しいFloat32Arrayを返す。
//
// 位置づけ: これは「白色雑音相当の入力に対するエネルギー校正」であり、任意波形
// (実際の楽器サンプル)に対する畳み込み出力の瞬間ピークを数学的に保証するもの
// ではない。ConvolverNode.normalize(既定true)はブラウザの内部アルゴリズムに
// 依存し出力ゲインが予測不能だったため、normalize=falseと組み合わせて使うことで
// 「dry予算を維持しつつ、wetを決定論的な基準へ校正する」工学的な配分を実現する。
export function normalizeImpulseResponseEnergy(samples: Float32Array, targetEnergy: number): Float32Array {
  if (!Number.isFinite(targetEnergy) || targetEnergy <= 0) {
    throw new Error(`targetEnergy must be a positive finite number, got ${targetEnergy}`);
  }
  if (samples.length === 0) {
    throw new Error('samples must not be empty');
  }
  const energy = computeImpulseResponseEnergy(samples);
  if (!Number.isFinite(energy) || energy <= 0) {
    throw new Error(`samples energy must be a positive finite number, got ${energy}`);
  }
  const scale = Math.sqrt(targetEnergy / energy);
  if (!Number.isFinite(scale)) {
    throw new Error(`computed scale must be finite, got ${scale}`);
  }
  const normalized = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    normalized[i] = samples[i] * scale;
  }
  return normalized;
}

// ブラウザ専用: 生成済みサンプル列からAudioBufferを作り、ConvolverNodeへ適用する。
// Task#AUDIO-REVERB-FIX(Suu承認): convolver.normalize=falseをbuffer代入前に明示する。
// ConvolverNodeの既定(normalize=true)はブラウザ内部アルゴリズムでIRを自動再スケールし
// 出力ゲインが実装依存・予測不能になる。呼び出し側でnormalizeImpulseResponseEnergyに
// より決定論的にエネルギー校正したsamplesを渡す前提のため、ブラウザ側の自動正規化は
// 無効化し、校正結果がそのままConvolverNodeの挙動になるようにする。
export function createConvolverFromSamples(audioCtx: BaseAudioContext, samples: Float32Array, sampleRate: number): ConvolverNode {
  const buffer = audioCtx.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  const convolver = audioCtx.createConvolver();
  convolver.normalize = false;
  convolver.buffer = buffer;
  return convolver;
}
