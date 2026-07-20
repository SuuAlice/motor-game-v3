import { describe, expect, it } from 'vitest';
import { INSTRUMENT_PRESETS, computeEnvelopeGain, validateInstrumentParams, type InstrumentParams } from '../synth';

const BASE: InstrumentParams = {
  name: 'test',
  waveform: 'sine',
  frequencyHz: 440,
  durationSec: 1,
  attackSec: 0.1,
  decaySec: 0.2,
  sustainLevel: 0.5,
  releaseSec: 0.2,
  pitched: true,
};

describe('validateInstrumentParams', () => {
  it('妥当なパラメータは例外を投げない', () => {
    expect(() => validateInstrumentParams(BASE)).not.toThrow();
  });

  it('durationSecが0.1未満または2超は拒否する', () => {
    expect(() => validateInstrumentParams({ ...BASE, durationSec: 0.05 })).toThrow();
    expect(() => validateInstrumentParams({ ...BASE, durationSec: 2.5 })).toThrow();
  });

  it('attack+decay+releaseがdurationSecを超えると拒否する', () => {
    expect(() => validateInstrumentParams({ ...BASE, attackSec: 0.9, decaySec: 0.9, releaseSec: 0.9 })).toThrow();
  });

  it('sustainLevelが範囲外(0..1)は拒否する', () => {
    expect(() => validateInstrumentParams({ ...BASE, sustainLevel: 1.5 })).toThrow();
    expect(() => validateInstrumentParams({ ...BASE, sustainLevel: -0.1 })).toThrow();
  });

  it('frequencyHzが0以下は拒否する', () => {
    expect(() => validateInstrumentParams({ ...BASE, frequencyHz: 0 })).toThrow();
  });

  it('5楽器プリセット(kick/snare/bass/chord/lead)はすべて妥当', () => {
    for (const [name, params] of Object.entries(INSTRUMENT_PRESETS)) {
      expect(() => validateInstrumentParams(params), name).not.toThrow();
    }
    expect(Object.keys(INSTRUMENT_PRESETS)).toEqual(['kick', 'snare', 'bass', 'chord', 'lead']);
  });
});

describe('computeEnvelopeGain', () => {
  it('アタック開始直後は0に近く、アタック終了時に1になる', () => {
    expect(computeEnvelopeGain(0, BASE)).toBeCloseTo(0, 5);
    expect(computeEnvelopeGain(BASE.attackSec, BASE)).toBeCloseTo(1, 5);
  });

  it('ディケイ終了後はsustainLevelを維持する', () => {
    const sustainStart = BASE.attackSec + BASE.decaySec;
    const releaseStart = BASE.durationSec - BASE.releaseSec;
    const midSustain = (sustainStart + releaseStart) / 2;
    expect(computeEnvelopeGain(midSustain, BASE)).toBeCloseTo(BASE.sustainLevel, 5);
  });

  it('リリース終了間際は0に近づく', () => {
    expect(computeEnvelopeGain(BASE.durationSec - 0.001, BASE)).toBeLessThan(BASE.sustainLevel);
  });

  it('durationSec以降・0未満は0を返す', () => {
    expect(computeEnvelopeGain(-1, BASE)).toBe(0);
    expect(computeEnvelopeGain(BASE.durationSec + 1, BASE)).toBe(0);
  });

  it('attackSec=0でも例外を投げず先頭からsustain/decay側の計算に入る', () => {
    const noAttack = { ...BASE, attackSec: 0 };
    expect(() => computeEnvelopeGain(0, noAttack)).not.toThrow();
  });
});
