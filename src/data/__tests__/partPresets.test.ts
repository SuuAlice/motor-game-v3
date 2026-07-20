import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GARAGE_SELECTION,
  applyGarageBattery,
  resolveGarageBuild,
  resolveGarageColors,
} from '../partPresets';
import { useGameStore } from '../../store/gameStore';

describe('ガレージ部品プリセット', () => {
  it('初期選択が従来の標準車体と一致する', () => {
    const result = resolveGarageBuild(DEFAULT_GARAGE_SELECTION);
    expect(result.carConfig).toEqual({
      massG: 150,
      gearRatio: 4,
      gearEfficiency: 0.8,
      wheelDiameterMm: 30,
      tireGrip: 0.7,
      axleFriction: 0,
      wheelAlignmentMm: 0,
      centerOfMassHeightMm: 20,
      motorMountOffsetMm: 0,
    });
    expect(result.batteryVoltage).toBe(3);
  });

  it('部品選択から車体・電池・外観を一意に解決する', () => {
    const selection = {
      ...DEFAULT_GARAGE_SELECTION,
      chassisId: 'light',
      gearId: 'torque',
      wheelId: 'large',
      tireId: 'grip',
      batteryId: 'single',
      batteryPosition: 'rear' as const,
      bodyColorId: 'blue',
      accentColorId: 'orange',
    };
    const result = resolveGarageBuild(selection);
    expect(result.carConfig.massG).toBe(85);
    expect(result.carConfig.gearRatio).toBe(7);
    expect(result.carConfig.wheelDiameterMm).toBe(45);
    expect(result.carConfig.centerOfMassHeightMm).toBe(16);
    expect(applyGarageBattery(useGameStore.getState().config, selection).batteryVoltage).toBe(1.5);
    expect(resolveGarageColors(selection)).toEqual({ chassisColor: '#2563eb', accentColor: '#ea580c' });
  });
});
