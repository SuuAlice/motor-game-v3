import { describe, expect, it } from 'vitest';
import { COIL_DEFORM_OMEGA } from '../../engine/constants';
import { BROKEN_CARS } from '../brokenCars';
import { createInitialVehicleState, stepTestRun } from '../../engine/vehiclePhysics';

describe('故障車プリセット', () => {
  it('導入用単一原因と複数調整の故障車を含む', () => {
    expect(BROKEN_CARS.length).toBeGreaterThanOrEqual(5);
    expect(BROKEN_CARS.some((item) => item.repairableMotorParams.length + item.repairableCarParams.length === 1)).toBe(true);
    expect(BROKEN_CARS.some((item) => item.repairableMotorParams.length + item.repairableCarParams.length > 1)).toBe(true);
  });

  it('IDが重複せず、原因名を症状文に露出しない', () => {
    expect(new Set(BROKEN_CARS.map((item) => item.id)).size).toBe(BROKEN_CARS.length);
    for (const item of BROKEN_CARS) expect(item.symptom).not.toMatch(/短絡|車軸摩擦|車輪ずれ|グリップ不足/u);
  });

  it('全ケースが許可された調整だけで10 mを完走できる', () => {
    for (const item of BROKEN_CARS) {
      const motorConfig = { ...item.motorConfig };
      const carConfig = { ...item.carConfig };
      for (const key of item.repairableMotorParams) {
        if (key === 'slitWidthMm') motorConfig.slitWidthMm = 1.5;
        if (key === 'brushPressure') motorConfig.brushPressure = 0.3;
      }
      for (const key of item.repairableCarParams) {
        if (key === 'axleFriction') carConfig.axleFriction = 0;
        if (key === 'wheelAlignmentMm') carConfig.wheelAlignmentMm = 0;
        if (key === 'tireGrip') carConfig.tireGrip = 0.7;
        if (key === 'gearRatio') carConfig.gearRatio = 4;
      }
      let state = createInitialVehicleState(motorConfig, carConfig);
      for (let step = 0; step < 120 * 30 && (state.status === 'ready' || state.status === 'running'); step += 1) {
        state = stepTestRun(motorConfig, carConfig, state, 1 / 120, 10, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: () => 0.5 });
      }
      expect(state.status, item.id).toBe('finished');
    }
  });
});
