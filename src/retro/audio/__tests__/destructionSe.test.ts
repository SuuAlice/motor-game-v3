// P3-4 G7-D(項目M・O、UI計画§8.3): SE表・バス正規化・D06 queue・D01変調。
// **数値はG7初期候補**であり、ここで固定しているのは「候補値がこの値である」ことと
// 予算・方式の不変条件であって、最終値ではない(G8で人間の耳により較正する)。
import { describe, expect, it } from 'vitest';
import { BGM_MASTER_GAIN, MOTOR_MASTER_GAIN, SE_MASTER_GAIN } from '../mixLevels';
import {
  DESTRUCTION_SE_SPECS, D07_SE_EXEMPTION_REASON, findDestructionSeSpec,
  normalizeActiveVoiceGains, computeD01GainModulation,
  D01_GAIN_MODULATION_DEPTH, D06_QUEUE_DEPTH_LIMIT, EMPTY_D06_QUEUE,
  enqueueD06Event, dequeueD06Event, D09_ONSET_TWO_TONE_HZ,
} from '../destructionSe';

describe('項目M: 3チャンネル予算(§8.3、R21)', () => {
  it('BGM+MOTOR+SEの合計が1.0を超えない', () => {
    expect(BGM_MASTER_GAIN + MOTOR_MASTER_GAIN + SE_MASTER_GAIN).toBeLessThanOrEqual(1);
  });

  it('3値とも正である(どれかを0にして予算を作らない)', () => {
    for (const gain of [BGM_MASTER_GAIN, MOTOR_MASTER_GAIN, SE_MASTER_GAIN]) {
      expect(gain).toBeGreaterThan(0);
    }
  });

  it('R21の初期候補値(0.85/0.05/0.10)になっている', () => {
    expect(BGM_MASTER_GAIN).toBe(0.85);
    expect(MOTOR_MASTER_GAIN).toBe(0.05);
    expect(SE_MASTER_GAIN).toBe(0.1);
  });
});

describe('項目O: SE割り当て表(§8.3)', () => {
  it('D01は固有SEを持つ(C-1で新規追加確定、v9までの欠落の是正)', () => {
    const spec = findDestructionSeSpec('D01_wireLash');
    expect(spec.kind).toBe('loop');
    expect(spec.waveform).toBe('noise');
  });

  it('D07だけは専用SEを持たず、免除理由が明記されている', () => {
    expect(DESTRUCTION_SE_SPECS.some((s) => s.id.startsWith('D07'))).toBe(false);
    expect(D07_SE_EXEMPTION_REASON).toContain('二重表現');
  });

  it('D03電池破裂とD09焼付きは他SEをduckする(全muteではない)', () => {
    expect(findDestructionSeSpec('D03_batteryBurst').ducksOthers).toBe(true);
    expect(findDestructionSeSpec('D09_seizureOnset').ducksOthers).toBe(true);
    // duck対象側が「鳴らない」ことにはしない——現象自体は隠さない(spec §1.2)。
    expect(findDestructionSeSpec('D05_spark').baseGain).toBeGreaterThan(0);
  });

  it('D05は最大同時3、他の有限尺イベントは1(§8.3の同時発生規則)', () => {
    expect(findDestructionSeSpec('D05_spark').maxConcurrent).toBe(3);
    expect(findDestructionSeSpec('D02_smoke').maxConcurrent).toBe(1);
  });

  // 許容差1e-12は浮動小数の丸め分のみを吸収する。§8.3の候補値は十進では丁度
  // durationSecに収まる(例: D03の0.001+0.1+0.049=0.15)が、二進表現では
  // 0.15000000000000002となり厳密比較を超える。既存のvalidateInstrumentParamsは
  // 厳密比較(`>`)なので、この表をInstrumentParamsへ変換して実再生へ渡す段では
  // 丸めが要る——G8実装時の申し送り事項として明示する(候補値自体は変更しない)。
  it('ADSRの合計はdurationSecを超えない(既存validateInstrumentParamsと同じ規律)', () => {
    for (const spec of DESTRUCTION_SE_SPECS) {
      expect(spec.attackSec + spec.decaySec + spec.releaseSec).toBeLessThanOrEqual(spec.durationSec + 1e-12);
      expect(spec.sustainLevel).toBeGreaterThanOrEqual(0);
      expect(spec.sustainLevel).toBeLessThanOrEqual(1);
    }
  });

  it('noise波形の行は音高を持たない(§8.3表の「—」)', () => {
    for (const spec of DESTRUCTION_SE_SPECS) {
      if (spec.waveform === 'noise') expect(spec.frequencyHz).toBeNull();
      else expect(spec.frequencyHz).not.toBeNull();
    }
  });

  it('D09焼付きは固定周波数2音の急速切替(周波数sweepは不採用、R20)', () => {
    expect(D09_ONSET_TWO_TONE_HZ).toHaveLength(2);
    expect(D09_ONSET_TWO_TONE_HZ[0]).not.toBe(D09_ONSET_TWO_TONE_HZ[1]);
  });
});

describe('SEバス正規化(J3是正・R21)', () => {
  it('合計が予算以内なら基準gainをそのまま使う(常時縮小しない)', () => {
    const voices = [{ baseGain: 0.04 }, { baseGain: 0.05 }];
    expect(normalizeActiveVoiceGains(voices)).toEqual([0.04, 0.05]);
  });

  it('予算を超える場合のみ一律縮小し、正規化後の合計が予算に一致する', () => {
    const voices = [{ baseGain: 0.2 }, { baseGain: 0.5 }, { baseGain: 0.3 }];
    const gains = normalizeActiveVoiceGains(voices);
    expect(gains.reduce((a, b) => a + b, 0)).toBeCloseTo(SE_MASTER_GAIN, 12);
    // 一律縮小なので、元の大小関係は保たれる(大きい音だけ潰さない)。
    expect(gains[1]).toBeGreaterThan(gains[2]);
    expect(gains[2]).toBeGreaterThan(gains[0]);
  });

  it('active voiceが無ければ空配列(0除算にならない)', () => {
    expect(normalizeActiveVoiceGains([])).toEqual([]);
  });

  // §8.3のclipping負例テスト: モード横断で同時に鳴りうる最悪ケースを列挙し、
  // 正規化後の全チャンネル合計が1.0を超えないことを数値で固定する。
  it('モード横断の最悪ケースでもBGM+motor+SE合計が1.0を超えない', () => {
    const loops = DESTRUCTION_SE_SPECS.filter((s) => s.kind === 'loop');
    const oneShots = DESTRUCTION_SE_SPECS.filter((s) => s.kind === 'oneShot');
    // 継続音は全種同時、有限尺は各モードの同時上限まで同時、という上限構成。
    const worstCase = [
      ...loops.map((s) => ({ baseGain: s.baseGain })),
      ...oneShots.flatMap((s) => Array.from({ length: s.maxConcurrent }, () => ({ baseGain: s.baseGain }))),
    ];
    // 正規化前は予算を明確に超えている(=このテストが空虚な一致でないことの担保)。
    const rawTotal = worstCase.reduce((sum, v) => sum + v.baseGain, 0);
    expect(rawTotal).toBeGreaterThan(SE_MASTER_GAIN);

    const seTotal = normalizeActiveVoiceGains(worstCase).reduce((a, b) => a + b, 0);

    expect(seTotal).toBeLessThanOrEqual(SE_MASTER_GAIN + 1e-12);
    expect(BGM_MASTER_GAIN + MOTOR_MASTER_GAIN + seTotal).toBeLessThanOrEqual(1 + 1e-12);
  });
});

describe('D01専用SEの決定論的gain変調(C-1)', () => {
  it('同じelapsedTimeSなら常に同じ値(rngを使わない=再生で同じ音になる)', () => {
    expect(computeD01GainModulation(1.234)).toBe(computeD01GainModulation(1.234));
  });

  it('時間とともに実際に揺れる(変調が効いていないことの空虚な合格を防ぐ)', () => {
    const samples = [0, 0.05, 0.1, 0.15, 0.2].map(computeD01GainModulation);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.1);
  });

  it('変調係数は非負に収まる(位相が谷でも音が反転しない)', () => {
    expect(D01_GAIN_MODULATION_DEPTH).toBeLessThan(1);
    for (let t = 0; t < 2; t += 0.01) {
      expect(computeD01GainModulation(t)).toBeGreaterThan(0);
    }
  });

  it('非有限な経過秒数では変調しない(NaNのgainを作らない)', () => {
    expect(computeD01GainModulation(Number.NaN)).toBe(1);
    expect(computeD01GainModulation(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('D06 queue + coalescing(R26・C-6)', () => {
  it('上限までは積まれる', () => {
    let state = EMPTY_D06_QUEUE;
    for (let i = 0; i < D06_QUEUE_DEPTH_LIMIT; i += 1) state = enqueueD06Event(state);
    expect(state.queuedCount).toBe(D06_QUEUE_DEPTH_LIMIT);
    expect(state.coalescedCount).toBe(0);
  });

  it('上限超過分は破棄されずcoalesceされる(症状の欠落にしない)', () => {
    let state = EMPTY_D06_QUEUE;
    for (let i = 0; i < D06_QUEUE_DEPTH_LIMIT + 4; i += 1) state = enqueueD06Event(state);
    expect(state.queuedCount).toBe(D06_QUEUE_DEPTH_LIMIT);
    expect(state.coalescedCount).toBe(4);
  });

  it('queueを出し切った時点でcoalesce分も解放される(終端後まで鳴り続けない)', () => {
    let state = EMPTY_D06_QUEUE;
    for (let i = 0; i < D06_QUEUE_DEPTH_LIMIT + 2; i += 1) state = enqueueD06Event(state);
    for (let i = 0; i < D06_QUEUE_DEPTH_LIMIT; i += 1) state = dequeueD06Event(state);
    expect(state).toEqual(EMPTY_D06_QUEUE);
  });

  it('空queueからのdequeueは何も起こらない(負のcountを作らない)', () => {
    expect(dequeueD06Event(EMPTY_D06_QUEUE)).toEqual(EMPTY_D06_QUEUE);
  });
});
