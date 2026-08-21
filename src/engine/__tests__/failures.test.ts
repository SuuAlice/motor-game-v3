import { describe, expect, it } from 'vitest';
import { diagnoseFailures } from '../failures';
import { step, type MotorConfig, type SimState } from '../motorPhysics';
import { FLICK_INITIAL_OMEGA } from '../constants';
import type { HistorySample } from '../scoring';
import { mulberry32 } from './prng';

// spec docs/spec.md §3.7の設計目標で使う「適正パラメータ」(他のテストと同じ)
function goodConfig(overrides: Partial<MotorConfig> = {}): MotorConfig {
  return {
    coilTurns: 80,
    slitWidthMm: 1.5,
    sandingQuality: 0.9,
    brushPressure: 0.3,
    magnetStrength: 1.0,
    magnetDistanceMm: 10,
    batteryVoltage: 3.0,
    axisOffsetMm: 0,
    ...overrides,
  };
}

// 「回るがすぐ減速して止まる」用: 直近の窓がほぼ止まっている
// (実測では立ち上がりの一瞬は0.1秒サンプリングにほぼ写らないため、
// isStalledは「動いたことがある」を要求しない。詳細はfailures.tsのコメント参照)
function stalledHistory(): HistorySample[] {
  const history: HistorySample[] = [];
  for (let t = 0; t <= 6; t += 0.1) history.push({ t, rpm: 0, current: 0, backEmf: 0 });
  return history;
}

function intermittentHistory(): HistorySample[] {
  const history: HistorySample[] = [];
  for (let t = 0; t <= 6; t += 0.2) {
    const rpm = Math.floor(t / 0.2) % 2 === 0 ? 100 : 0;
    history.push({ t, rpm, current: rpm > 0 ? 0.3 : 0, backEmf: 0 });
  }
  return history;
}

function weaklySpinningHistory(): HistorySample[] {
  const history: HistorySample[] = [];
  for (let t = 0; t <= 6; t += 0.1) history.push({ t, rpm: 100, current: 0.2, backEmf: 0.05 });
  return history;
}

function wobblingHistory(): HistorySample[] {
  const history: HistorySample[] = [];
  for (let t = 0; t <= 6; t += 0.1) {
    const rpm = 800 + (Math.round(t / 0.1) % 2 === 0 ? 200 : -200);
    history.push({ t, rpm, current: 0.5, backEmf: 0.3 });
  }
  return history;
}

function steadyGoodHistory(): HistorySample[] {
  const history: HistorySample[] = [];
  for (let t = 0; t <= 6; t += 0.1) history.push({ t, rpm: 1000, current: 0.4, backEmf: 2.0 });
  return history;
}

describe('diagnoseFailures', () => {
  it('スリット幅0はショートと判定される(履歴に関係なく)', () => {
    const result = diagnoseFailures(goodConfig({ slitWidthMm: 0 }), []);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('shorted');
    expect(result[0].causeParam).toBe('slitWidthMm');
  });

  it('削り残し: sandingQualityが低く、弱く回り続けている場合に検出される', () => {
    // 実測: このモデルでは接触抵抗の増加は「止まる」ではなく「弱く回り続ける」形で現れる
    const result = diagnoseFailures(goodConfig({ sandingQuality: 0.3 }), weaklySpinningHistory());
    expect(result.some((d) => d.category === 'sandingResidue')).toBe(true);
  });

  it('ブラシ圧過大: brushPressureが高く、止まっている場合に検出される', () => {
    const result = diagnoseFailures(goodConfig({ brushPressure: 0.8 }), stalledHistory());
    expect(result.some((d) => d.category === 'brushTooTight')).toBe(true);
    // sandingQualityは正常範囲なので削り残しは誤検出しない(止まっているので弱く回ってもいない)
    expect(result.some((d) => d.category === 'sandingResidue')).toBe(false);
  });

  it('ブラシ圧不足: brushPressureが低く、回転数のばらつきが大きい場合に検出される', () => {
    const result = diagnoseFailures(goodConfig({ brushPressure: 0.1 }), intermittentHistory());
    expect(result.some((d) => d.category === 'brushTooLoose')).toBe(true);
  });

  it('弱々しく回る: 巻き数不足の場合に検出される', () => {
    const result = diagnoseFailures(goodConfig({ coilTurns: 20 }), weaklySpinningHistory());
    const weak = result.filter((d) => d.category === 'weakField');
    expect(weak.some((d) => d.causeParam === 'coilTurns')).toBe(true);
  });

  it('弱々しく回る: 磁石が弱い場合に検出される', () => {
    const result = diagnoseFailures(goodConfig({ magnetStrength: 0.1 }), weaklySpinningHistory());
    const weak = result.filter((d) => d.category === 'weakField');
    expect(weak.some((d) => d.causeParam === 'magnetStrength')).toBe(true);
  });

  it('弱々しく回る: 磁石が遠い場合に検出される', () => {
    const result = diagnoseFailures(goodConfig({ magnetDistanceMm: 28 }), weaklySpinningHistory());
    const weak = result.filter((d) => d.category === 'weakField');
    expect(weak.some((d) => d.causeParam === 'magnetDistanceMm')).toBe(true);
  });

  it('軸ずれ振動: axisOffsetMmが高く、高速域でブレが大きい場合に検出される', () => {
    const result = diagnoseFailures(goodConfig({ axisOffsetMm: 2 }), wobblingHistory());
    expect(result.some((d) => d.category === 'axisWobble')).toBe(true);
  });

  it('適正パラメータで安定回転している場合は原因候補が空になる', () => {
    const result = diagnoseFailures(goodConfig(), steadyGoodHistory());
    expect(result).toEqual([]);
  });

  it('lockedKeysに含まれるパラメータが原因の診断は除外される(チャレンジで固定中のヒントは出さない)', () => {
    const config = goodConfig({ slitWidthMm: 0 });
    const result = diagnoseFailures(config, [], new Set(['slitWidthMm']));
    expect(result).toEqual([]);
  });
});

describe('diagnoseFailures(実際のstep()出力を使った統合テスト)', () => {
  // Phase3で追加。上記の合成データによるテストは検出ロジックの単体検証には十分だが、
  // しきい値自体が実際のシミュレーション挙動と乖離していないかは別途確認が必要
  // (これが原因で一度しきい値の全面見直しが必要になった)。ここでは実際の
  // step()出力を使い、各カテゴリが期待通り検出されることを確認する。
  const DT = 1 / 120;

  // P3-4-Q11 A-Q11-1: ローカルのmulberry32実装は削除し、正典run RNG(createRunRng)へ委譲する
  // 互換wrapper(./prng)を使う。engine配下のmulberry32実装を1箇所へ一元化するため。
  // アルゴリズムは同一のため、本テスト群の乱数系列・判定結果は変わらない。

  function simulateHistory(config: MotorConfig, seed: number, seconds = 15): HistorySample[] {
    const rng = mulberry32(seed);
    let s: SimState = {
      theta: 0,
      omega: FLICK_INITIAL_OMEGA,
      current: 0,
      backEmf: 0,
      shorted: false,
      running: true,
      rpm: 0,
      chatterFramesLeft: 0,
      batteryHeat: 0,
      coilCollapsed: false,
      highSpeedFrameCount: 0,
    };
    const history: HistorySample[] = [];
    const sampleEvery = Math.round(0.1 / DT);
    for (let i = 0; i < seconds * 120; i++) {
      s = step(config, s, DT, rng);
      if (i % sampleEvery === 0) history.push({ t: i * DT, rpm: s.rpm, current: s.current, backEmf: s.backEmf });
    }
    return history;
  }

  it('適正パラメータでは何も誤検出しない', () => {
    const history = simulateHistory(goodConfig(), 1);
    expect(diagnoseFailures(goodConfig(), history, new Set())).toEqual([]);
  });

  it('brushPressure=0.43(静止摩擦を振り切れない)はbrushTooTightとして検出される', () => {
    const config = goodConfig({ brushPressure: 0.43 });
    const history = simulateHistory(config, 1);
    expect(diagnoseFailures(config, history, new Set()).some((d) => d.category === 'brushTooTight')).toBe(true);
  });

  it('magnetStrength=0.42(弱磁石で回転数が半減)はweakFieldとして検出される', () => {
    // spec-v1.5.md §4の電池内部抵抗導入で静止摩擦を振り切れる境界が0.3から0.42付近へ
    // シフトした(0.3は完全停止になった)。WEAK_MAGNET_STRENGTH_THRESHOLDも合わせて調整済み。
    const config = goodConfig({ magnetStrength: 0.42 });
    const history = simulateHistory(config, 1);
    expect(diagnoseFailures(config, history, new Set()).some((d) => d.category === 'weakField')).toBe(true);
  });
});
