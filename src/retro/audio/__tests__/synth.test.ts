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

// Task#AUDIO-FINAL-AUDIT(Suu承認、Bクリック/継ぎ目監査の補強): computeEnvelopeGainを
// t=0とt=durationSecだけで検査すると、durationSec側は`tSec>=durationSec`のガード節に
// 一致して常に厳密0を返すため、実際にAudioBufferSourceNode.loop=trueでループ再生
// される「実際の最終サンプル」(インデックス sampleCount-1、時刻(sampleCount-1)/
// sampleRate。sampleCount=Math.ceil(durationSec*sampleRate)は`AudioDemo.tsx`の
// OfflineAudioContext呼び出しと同じ式)を検証したことにはならない(常に真になる
// 無意味な検査だった)。実際の最終サンプル時刻はdurationSecよりちょうど1サンプル分
// 手前になるため、release区間の一次関数から解析的に「1サンプル分の傾き」相当の
// 微小な非ゼロ値になるはずで、その値を明示的に検証する。
//
// 波形自体(sine/square/sawtooth/triangle/noiseいずれも振幅±1に正規化)によらず、
// 実サンプル値 = envelope(t) × waveform(t) であり |waveform(t)| <= 1 なので、
// 実サンプルの絶対値は envelope(t) を上界として持つ(これは公理的に成立し、
// OscillatorNodeの内部実装詳細に依存しない)。よってenvelope(t)がクリックを
// 生じにくい閾値以下であることを示せば、波形の種類によらず実サンプルの
// 境界振幅もその閾値以下であることを保証できる。
//
// 閾値の根拠: release区間は sustainLevel*(1 - releaseT) の一次関数であり、
// 1サンプル分(1/sampleRate秒)進むごとに releaseT は 1/(releaseSec*sampleRate) だけ
// 増加する。よって最終サンプルの時刻(durationSec方向にちょうど1サンプル手前)での
// gainは、release開始からの経過が「release区間の残り1サンプル分」であるため、
// 解析的に sustainLevel/(releaseSec*sampleRate) に一致する(丸め誤差を除く)。
// CLICK_SAFE_THRESHOLD=0.01(-40dB相当)は、単一サンプルの不連続量として一般に
// 聴感上ほぼ知覚されないとされる目安であり、下記の実測値(最大でも約3.6e-4、
// -68.8dB相当)に対して十分な安全マージン(約28倍以上)を持つ、恣意的な大値では
// ない閾値として採用する。
describe('ループ境界のクリック安全性(全5プリセット、Task#AUDIO-FINAL-AUDIT)', () => {
  const CLICK_SAFE_THRESHOLD = 0.01;
  const SAMPLE_RATES = [44100, 48000]; // Task#AUDIO-SR-FIXで扱う実ブラウザの代表的な値

  for (const sampleRate of SAMPLE_RATES) {
    for (const [name, params] of Object.entries(INSTRUMENT_PRESETS)) {
      it(`${name}(sampleRate=${sampleRate}): 実際の最終サンプル時刻でのgainがクリック安全閾値以下、かつ解析式と一致する`, () => {
        const sampleCount = Math.ceil(params.durationSec * sampleRate);
        const lastSampleT = (sampleCount - 1) / sampleRate;

        const firstGain = computeEnvelopeGain(0, params);
        const lastGain = computeEnvelopeGain(lastSampleT, params);
        const loopBoundaryDiff = Math.abs(lastGain - firstGain);

        // 先頭(index 0)はattackSec>0のためgain=0(既存アタック規約どおり)。
        expect(firstGain).toBe(0);

        // release区間の一次関数から導いた解析式との一致(丸め誤差許容)。
        const analyticLastGain = params.sustainLevel / (params.releaseSec * sampleRate);
        expect(lastGain).toBeCloseTo(analyticLastGain, 6);

        expect(lastGain).toBeLessThanOrEqual(CLICK_SAFE_THRESHOLD);
        expect(loopBoundaryDiff).toBeLessThanOrEqual(CLICK_SAFE_THRESHOLD);
      });
    }
  }
});
