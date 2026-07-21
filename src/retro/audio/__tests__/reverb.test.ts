import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVERB_PARAMS,
  computeImpulseResponseEnergy,
  computeImpulseResponseEnvelope,
  generateImpulseResponseSamples,
  normalizeImpulseResponseEnergy,
  validateImpulseResponseParams,
} from '../reverb';

describe('computeImpulseResponseEnvelope', () => {
  it('先頭(sampleIndex=0)は1、末尾は0に近い(既知値)', () => {
    expect(computeImpulseResponseEnvelope(0, 1000, 3)).toBe(1);
    expect(computeImpulseResponseEnvelope(999, 1000, 3)).toBeLessThan(0.01);
  });

  it('単調減少する', () => {
    let prev = computeImpulseResponseEnvelope(0, 1000, 2);
    for (let i = 1; i < 1000; i += 50) {
      const cur = computeImpulseResponseEnvelope(i, 1000, 2);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });
});

// Task#AUDIO-REVERB-TAIL(Suu承認): 人間試聴で「BGM停止後の残響尾がすぐ止まる」と
// 指摘され、durationSecを0.6→1.2秒へ延長した。意図しない再短縮の回帰検知として
// 既知値を固定する(尾の長さを確保する試聴候補であり、最終凍結は人間試聴後)。
describe('DEFAULT_REVERB_PARAMS', () => {
  it('durationSecはTask#AUDIO-REVERB-TAILで承認された既知値(1.2)になっている', () => {
    expect(DEFAULT_REVERB_PARAMS.durationSec).toBe(1.2);
  });
});

describe('validateImpulseResponseParams', () => {
  it('妥当なパラメータは例外を投げない', () => {
    expect(() => validateImpulseResponseParams(DEFAULT_REVERB_PARAMS)).not.toThrow();
  });

  it('durationSec/decay/sampleRateが0以下は拒否する', () => {
    expect(() => validateImpulseResponseParams({ ...DEFAULT_REVERB_PARAMS, durationSec: 0 })).toThrow();
    expect(() => validateImpulseResponseParams({ ...DEFAULT_REVERB_PARAMS, decay: 0 })).toThrow();
    expect(() => validateImpulseResponseParams({ ...DEFAULT_REVERB_PARAMS, sampleRate: 0 })).toThrow();
  });
});

describe('generateImpulseResponseSamples', () => {
  it('同じseedなら決定論的に同じサンプル列を生成する', () => {
    const a = generateImpulseResponseSamples(DEFAULT_REVERB_PARAMS);
    const b = generateImpulseResponseSamples(DEFAULT_REVERB_PARAMS);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('異なるseedなら異なるサンプル列になる', () => {
    const a = generateImpulseResponseSamples(DEFAULT_REVERB_PARAMS);
    const b = generateImpulseResponseSamples({ ...DEFAULT_REVERB_PARAMS, seed: DEFAULT_REVERB_PARAMS.seed + 1 });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('サンプル数はdurationSec*sampleRateに一致する', () => {
    const samples = generateImpulseResponseSamples(DEFAULT_REVERB_PARAMS);
    expect(samples.length).toBe(Math.ceil(DEFAULT_REVERB_PARAMS.durationSec * DEFAULT_REVERB_PARAMS.sampleRate));
  });

  it('全サンプルが-1..1の範囲に収まる', () => {
    const samples = generateImpulseResponseSamples(DEFAULT_REVERB_PARAMS);
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

// Task#AUDIO-REVERB-FIX(Suu承認): ConvolverNode.normalize(ブラウザ依存の自動正規化)
// に頼らず、決定論的にIRのエネルギー(sum(h^2))を校正するための純関数。
describe('computeImpulseResponseEnergy', () => {
  it('既知値: [1,1,1]はエネルギー3になる', () => {
    expect(computeImpulseResponseEnergy(new Float32Array([1, 1, 1]))).toBeCloseTo(3, 5);
  });

  it('既知値: [0.5,-0.5]はエネルギー0.5になる', () => {
    expect(computeImpulseResponseEnergy(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5, 5);
  });

  it('全ゼロ配列はエネルギー0になる', () => {
    expect(computeImpulseResponseEnergy(new Float32Array([0, 0, 0]))).toBe(0);
  });
});

describe('normalizeImpulseResponseEnergy', () => {
  it('正規化後のエネルギーが目標値へ許容誤差内で一致する(既知値)', () => {
    const samples = generateImpulseResponseSamples(DEFAULT_REVERB_PARAMS);
    const normalized = normalizeImpulseResponseEnergy(samples, 1);
    expect(computeImpulseResponseEnergy(normalized)).toBeCloseTo(1, 5);
  });

  it('任意の正のtargetEnergyへ校正できる(既知値)', () => {
    const samples = new Float32Array([1, 2, 2]); // energy=1+4+4=9
    const normalized = normalizeImpulseResponseEnergy(samples, 4);
    expect(computeImpulseResponseEnergy(normalized)).toBeCloseTo(4, 5);
    // scale=sqrt(4/9)=2/3(Float32Arrayの精度丸めを許容してtoBeCloseToで比較する)
    expect(normalized[0]).toBeCloseTo(1 * (2 / 3), 5);
    expect(normalized[1]).toBeCloseTo(2 * (2 / 3), 5);
    expect(normalized[2]).toBeCloseTo(2 * (2 / 3), 5);
  });

  it('入力配列を破壊せず新しいFloat32Arrayを返す', () => {
    const samples = new Float32Array([1, 2, 2]);
    const original = Array.from(samples);
    normalizeImpulseResponseEnergy(samples, 1);
    expect(Array.from(samples)).toEqual(original);
  });

  it('targetEnergyが0以下・NaN・Infinityは拒否する', () => {
    const samples = new Float32Array([1, 1]);
    expect(() => normalizeImpulseResponseEnergy(samples, 0)).toThrow();
    expect(() => normalizeImpulseResponseEnergy(samples, -1)).toThrow();
    expect(() => normalizeImpulseResponseEnergy(samples, NaN)).toThrow();
    expect(() => normalizeImpulseResponseEnergy(samples, Infinity)).toThrow();
  });

  it('空配列は拒否する', () => {
    expect(() => normalizeImpulseResponseEnergy(new Float32Array([]), 1)).toThrow();
  });

  it('全サンプルがゼロ(energy=0)の配列は拒否する(スケール不能)', () => {
    expect(() => normalizeImpulseResponseEnergy(new Float32Array([0, 0, 0]), 1)).toThrow();
  });

  // Task#AUDIO-REVERB-FIX-REVIEW指摘対応(追加確認): NaN/Infinityを含むsamplesは
  // energyが非有限になり、実装の`!Number.isFinite(energy)`で既に拒否できていたが、
  // 回帰固定のため明示テストを追加する。
  it('NaNを含むsamplesは拒否する(energyが非有限になるため)', () => {
    expect(() => normalizeImpulseResponseEnergy(new Float32Array([1, NaN, 2]), 1)).toThrow();
  });

  it('Infinityを含むsamplesは拒否する(energyが非有限になるため)', () => {
    expect(() => normalizeImpulseResponseEnergy(new Float32Array([1, Infinity, 2]), 1)).toThrow();
    expect(() => normalizeImpulseResponseEnergy(new Float32Array([1, -Infinity, 2]), 1)).toThrow();
  });
});
