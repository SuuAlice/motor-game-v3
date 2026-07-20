import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVERB_PARAMS,
  computeImpulseResponseEnvelope,
  generateImpulseResponseSamples,
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
