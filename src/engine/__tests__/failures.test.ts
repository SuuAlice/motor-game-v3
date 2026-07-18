import { describe, expect, it } from 'vitest';
import { diagnoseFailures } from '../failures';
import type { MotorConfig } from '../motorPhysics';
import type { HistorySample } from '../scoring';

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

function movedThenStoppedHistory(): HistorySample[] {
  const history: HistorySample[] = [];
  for (let t = 0; t <= 2; t += 0.1) history.push({ t, rpm: 100, current: 0.5, backEmf: 0.1 });
  for (let t = 2.1; t <= 6; t += 0.1) history.push({ t, rpm: 0, current: 0, backEmf: 0 });
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

  it('削り残し: sandingQualityが低く、動いてから止まった場合に検出される', () => {
    const result = diagnoseFailures(goodConfig({ sandingQuality: 0.3 }), movedThenStoppedHistory());
    expect(result.some((d) => d.category === 'sandingResidue')).toBe(true);
  });

  it('ブラシ圧過大: brushPressureが高く、動いてから止まった場合に検出される', () => {
    const result = diagnoseFailures(goodConfig({ brushPressure: 0.8 }), movedThenStoppedHistory());
    expect(result.some((d) => d.category === 'brushTooTight')).toBe(true);
    // sandingQualityは正常範囲なので削り残しは誤検出しない
    expect(result.some((d) => d.category === 'sandingResidue')).toBe(false);
  });

  it('ブラシ圧不足: brushPressureが低く、間欠的な回転がある場合に検出される', () => {
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
