import { describe, expect, it } from 'vitest';
import { evaluateConditions } from '../challengeEvaluation';
import type { MeasurementSample } from '../../store/gameStore';

function samples(seconds: number, rpm = 1000, current = 0.4): MeasurementSample[] {
  return Array.from({ length: seconds * 10 + 1 }, (_, index) => ({
    t: index / 10, rpm, current, backEmf: 1, theta: 0, batteryHeat: 0.2,
    chattering: false, shorted: false, coilCollapsed: false,
  }));
}

describe('チャレンジ複合条件', () => {
  it('時間・RPM・電流・発熱・変動条件をすべて満たすと完了する', () => {
    const result = evaluateConditions(samples(10), {
      targetRpm: 900, durationSec: 10, maxCurrentA: 0.5, maxBatteryHeat: 0.5,
      maxRpmVariation: 0.05, noCoilCollapse: true,
    });
    expect(result.completed).toBe(true);
  });

  it('1サンプルでも目標RPMを下回ると未達成になる', () => {
    const history = samples(10); history[50].rpm = 800;
    expect(evaluateConditions(history, { targetRpm: 900, durationSec: 10 }).completed).toBe(false);
  });

  it('コイル崩壊を検出する', () => {
    const history = samples(10); history[50].coilCollapsed = true;
    expect(evaluateConditions(history, { targetRpm: 900, durationSec: 10, noCoilCollapse: true }).completed).toBe(false);
  });
});
