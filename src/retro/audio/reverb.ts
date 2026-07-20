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
export const DEFAULT_REVERB_PARAMS: ImpulseResponseParams = {
  durationSec: 0.6,
  decay: 3,
  sampleRate: 44100,
  seed: 20260721,
};

// ブラウザ専用: 生成済みサンプル列からAudioBufferを作り、ConvolverNodeへ適用する。
export function createConvolverFromSamples(audioCtx: BaseAudioContext, samples: Float32Array, sampleRate: number): ConvolverNode {
  const buffer = audioCtx.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  const convolver = audioCtx.createConvolver();
  convolver.buffer = buffer;
  return convolver;
}
