import { mulberry32 } from './prng';

// art-spec §8: 短い内製サンプル+エンベロープでBGM/SEを合成する(SPC音源風)。
// Node.js/vite-nodeには標準のWeb Audio APIが存在しないため、実際の音声レンダリング
// (OfflineAudioContext呼び出し)はブラウザでのみ行う(renderInstrumentSample)。
// ADSR包絡線の計算・パラメータ検証は純関数として分離し、Node環境でも
// 決定論的にユニットテストできるようにする(PHASE1-PLAN-01-REV2【9】(a)対応)。

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

export interface InstrumentParams {
  name: string;
  waveform: Waveform;
  frequencyHz: number;
  durationSec: number; // 0.1〜2秒(art-spec §8の短尺サンプル方針)
  attackSec: number;
  decaySec: number;
  sustainLevel: number; // 0..1
  releaseSec: number;
}

export function validateInstrumentParams(params: InstrumentParams): void {
  if (params.durationSec < 0.1 || params.durationSec > 2) {
    throw new Error(`durationSec must be within 0.1-2s, got ${params.durationSec}`);
  }
  if (params.attackSec < 0 || params.decaySec < 0 || params.releaseSec < 0) {
    throw new Error('attack/decay/release must be non-negative');
  }
  if (params.attackSec + params.decaySec + params.releaseSec > params.durationSec) {
    throw new Error('attack+decay+release must not exceed durationSec');
  }
  if (params.sustainLevel < 0 || params.sustainLevel > 1) {
    throw new Error(`sustainLevel must be within 0..1, got ${params.sustainLevel}`);
  }
  if (params.frequencyHz <= 0) {
    throw new Error(`frequencyHz must be positive, got ${params.frequencyHz}`);
  }
}

// ADSR包絡線のゲイン値(0..1)を経過時間tSecから算出する純関数。実際の
// GainNode.gain制御(setValueAtTime等)はブラウザ側(renderInstrumentSample)が行う。
export function computeEnvelopeGain(tSec: number, params: InstrumentParams): number {
  const { attackSec, decaySec, sustainLevel, durationSec, releaseSec } = params;

  if (tSec < 0 || tSec >= durationSec) return 0;
  if (attackSec > 0 && tSec < attackSec) return tSec / attackSec;

  const decayEnd = attackSec + decaySec;
  if (decaySec > 0 && tSec < decayEnd) {
    const decayT = (tSec - attackSec) / decaySec;
    return 1 - decayT * (1 - sustainLevel);
  }

  const releaseStart = durationSec - releaseSec;
  if (tSec < releaseStart) return sustainLevel;

  if (releaseSec > 0) {
    const releaseT = (tSec - releaseStart) / releaseSec;
    return sustainLevel * (1 - releaseT);
  }
  return 0;
}

// art-spec §8の8ch想定を意識した5楽器プリセット(キック・スネア・ベース・コード・
// リード)。BGMのgenerated score(bgmScore.ts)はこの名前をinstrument参照に使う。
export const INSTRUMENT_PRESETS: Record<string, InstrumentParams> = {
  kick: {
    name: 'kick',
    waveform: 'sine',
    frequencyHz: 55,
    durationSec: 0.3,
    attackSec: 0.002,
    decaySec: 0.1,
    sustainLevel: 0.15,
    releaseSec: 0.1,
  },
  snare: {
    name: 'snare',
    waveform: 'noise',
    frequencyHz: 200,
    durationSec: 0.2,
    attackSec: 0.001,
    decaySec: 0.06,
    sustainLevel: 0.1,
    releaseSec: 0.1,
  },
  bass: {
    name: 'bass',
    waveform: 'triangle',
    frequencyHz: 110,
    durationSec: 0.5,
    attackSec: 0.01,
    decaySec: 0.1,
    sustainLevel: 0.6,
    releaseSec: 0.2,
  },
  chord: {
    name: 'chord',
    waveform: 'square',
    frequencyHz: 220,
    durationSec: 0.8,
    attackSec: 0.03,
    decaySec: 0.15,
    sustainLevel: 0.4,
    releaseSec: 0.3,
  },
  lead: {
    name: 'lead',
    waveform: 'sawtooth',
    frequencyHz: 440,
    durationSec: 0.6,
    attackSec: 0.01,
    decaySec: 0.08,
    sustainLevel: 0.5,
    releaseSec: 0.2,
  },
};

for (const params of Object.values(INSTRUMENT_PRESETS)) {
  validateInstrumentParams(params);
}

// ブラウザ専用: OfflineAudioContextで楽器サンプルを1つ書き出す。Node環境では
// OfflineAudioContextが存在しないため呼び出せない(vitestのユニットテスト対象外、
// PHASE1-PLAN-01-REV2【9】のとおりブラウザ実測+人間試聴で評価する)。seedを固定
// することで、ノイズ系サンプル(waveform: 'noise')も再生成可能にする。
export async function renderInstrumentSample(
  offlineCtx: OfflineAudioContext,
  params: InstrumentParams,
  seed: number,
): Promise<AudioBuffer> {
  validateInstrumentParams(params);

  const source: OscillatorNode | AudioBufferSourceNode =
    params.waveform === 'noise' ? createNoiseSource(offlineCtx, params.durationSec, seed) : createOscillatorSource(offlineCtx, params);

  const gainNode = offlineCtx.createGain();
  const sampleCount = Math.ceil(params.durationSec * offlineCtx.sampleRate);
  const stepSec = 1 / offlineCtx.sampleRate;
  for (let i = 0; i < sampleCount; i += Math.max(1, Math.floor(offlineCtx.sampleRate / 200))) {
    gainNode.gain.setValueAtTime(computeEnvelopeGain(i * stepSec, params), i * stepSec);
  }

  source.connect(gainNode).connect(offlineCtx.destination);
  source.start(0);
  if ('stop' in source) source.stop(params.durationSec);

  return offlineCtx.startRendering();
}

function createOscillatorSource(ctx: OfflineAudioContext, params: InstrumentParams): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = params.waveform as OscillatorType;
  osc.frequency.value = params.frequencyHz;
  return osc;
}

function createNoiseSource(ctx: OfflineAudioContext, durationSec: number, seed: number): AudioBufferSourceNode {
  const sampleCount = Math.ceil(durationSec * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rand = mulberry32(seed);
  for (let i = 0; i < sampleCount; i++) {
    data[i] = rand() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  return src;
}
