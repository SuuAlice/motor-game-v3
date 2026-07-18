import { describe, expect, it } from 'vitest';
import { createExperimentSession, parseNotebookJson, stringifyNotebook } from '../notebookStore';
import type { MotorConfig } from '../../engine/motorPhysics';
import type { NotebookSample } from '../notebookStore';

const config: MotorConfig = {
  coilTurns: 80,
  slitWidthMm: 1.5,
  sandingQuality: 0.9,
  brushPressure: 0.3,
  magnetStrength: 0.9,
  magnetDistanceMm: 10,
  batteryVoltage: 3,
  axisOffsetMm: 0,
};

function sample(overrides: Partial<NotebookSample>): NotebookSample {
  return {
    t: 0,
    rpm: 1000,
    current: 0.5,
    backEmf: 1,
    theta: 0,
    batteryHeat: 0,
    chattering: false,
    shorted: false,
    coilCollapsed: false,
    ...overrides,
  };
}

describe('実験ノート', () => {
  it('統計値と境界イベントを生成する', () => {
    const session = createExperimentSession(config, 123, [
      sample({ t: 0, rpm: 500, current: 1 }),
      sample({ t: 1, rpm: 1000, current: 0.5, coilCollapsed: true }),
      sample({ t: 2, rpm: 1000, current: 0.5, coilCollapsed: true, batteryHeat: 1 }),
    ]);
    expect(session.seed).toBe(123);
    expect(session.maxCurrent).toBe(1);
    expect(session.events.map((event) => event.type)).toEqual(['coilCollapse', 'batteryOverheat']);
  });

  it('JSONを書き出して読み戻せる', () => {
    const session = createExperimentSession(config, 456, [sample({})]);
    expect(parseNotebookJson(stringifyNotebook([session]))[0].seed).toBe(456);
  });

  it('未知のバージョンを拒否する', () => {
    expect(() => parseNotebookJson('{"version":2,"sessions":[]}')).toThrow('対応していない');
  });
});
