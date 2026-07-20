import type { BatteryPositionPreset } from '../render/CarSprite';
import type { CarConfig } from '../engine/vehiclePhysics';
import type { MotorConfig } from '../engine/motorPhysics';

export const CHASSIS_PRESETS = [
  { id: 'light', name: '軽量シャーシ', baseMassG: 60, centerOfMassHeightMm: 14 },
  { id: 'standard', name: '標準シャーシ', baseMassG: 110, centerOfMassHeightMm: 22 },
  { id: 'stable', name: '安定シャーシ', baseMassG: 190, centerOfMassHeightMm: 13 },
] as const;

export const GEAR_PRESETS = [
  { id: 'fast', name: '高速ギヤ', gearRatio: 2, gearEfficiency: 0.9 },
  { id: 'balanced', name: '標準ギヤ', gearRatio: 4, gearEfficiency: 0.8 },
  { id: 'torque', name: '登坂ギヤ', gearRatio: 7, gearEfficiency: 0.74 },
] as const;

export const WHEEL_PRESETS = [
  { id: 'small', name: '小径車輪', wheelDiameterMm: 20 },
  { id: 'medium', name: '中径車輪', wheelDiameterMm: 30 },
  { id: 'large', name: '大径車輪', wheelDiameterMm: 45 },
] as const;

export const TIRE_PRESETS = [
  { id: 'smooth', name: 'なめらかタイヤ', tireGrip: 0.55 },
  { id: 'standard', name: '標準タイヤ', tireGrip: 0.7 },
  { id: 'grip', name: '高グリップタイヤ', tireGrip: 1 },
] as const;

export const BATTERY_PRESETS = [
  { id: 'single', name: '乾電池1本', batteryVoltage: 1.5 as const, massG: 25 },
  { id: 'double', name: '乾電池2本', batteryVoltage: 3 as const, massG: 40 },
] as const;

export const BATTERY_POSITION_PRESETS: ReadonlyArray<{ id: BatteryPositionPreset; name: string; heightOffsetMm: number }> = [
  { id: 'rear', name: '後ろ', heightOffsetMm: 2 },
  { id: 'center', name: '中央', heightOffsetMm: -2 },
  { id: 'front', name: '前', heightOffsetMm: 1 },
];

export const BODY_COLORS = [
  { id: 'kraft', name: 'クラフト', value: '#cfa368' },
  { id: 'blue', name: '群青', value: '#2563eb' },
  { id: 'red', name: 'えんじ', value: '#b91c1c' },
  { id: 'green', name: '深緑', value: '#15803d' },
] as const;

export const ACCENT_COLORS = [
  { id: 'teal', name: '青緑', value: '#14b8a6' },
  { id: 'yellow', name: '黄', value: '#eab308' },
  { id: 'orange', name: '橙', value: '#ea580c' },
  { id: 'violet', name: '紫', value: '#7c3aed' },
] as const;

export interface GarageSelection {
  chassisId: string;
  gearId: string;
  wheelId: string;
  tireId: string;
  batteryId: string;
  batteryPosition: BatteryPositionPreset;
  bodyColorId: string;
  accentColorId: string;
}

export const DEFAULT_GARAGE_SELECTION: GarageSelection = {
  chassisId: 'standard', gearId: 'balanced', wheelId: 'medium', tireId: 'standard',
  batteryId: 'double', batteryPosition: 'center', bodyColorId: 'kraft', accentColorId: 'teal',
};

function byId<T extends { id: string }>(items: readonly T[], id: string): T {
  return items.find((item) => item.id === id) ?? items[0];
}

export function resolveGarageBuild(selection: GarageSelection): { carConfig: CarConfig; batteryVoltage: 1.5 | 3 } {
  const chassis = byId(CHASSIS_PRESETS, selection.chassisId);
  const gear = byId(GEAR_PRESETS, selection.gearId);
  const wheel = byId(WHEEL_PRESETS, selection.wheelId);
  const tire = byId(TIRE_PRESETS, selection.tireId);
  const battery = byId(BATTERY_PRESETS, selection.batteryId);
  const position = byId(BATTERY_POSITION_PRESETS, selection.batteryPosition);
  return {
    carConfig: {
      massG: chassis.baseMassG + battery.massG,
      gearRatio: gear.gearRatio,
      gearEfficiency: gear.gearEfficiency,
      wheelDiameterMm: wheel.wheelDiameterMm,
      tireGrip: tire.tireGrip,
      axleFriction: 0,
      wheelAlignmentMm: 0,
      centerOfMassHeightMm: chassis.centerOfMassHeightMm + position.heightOffsetMm,
      motorMountOffsetMm: 0,
    },
    batteryVoltage: battery.batteryVoltage,
  };
}

export function applyGarageBattery(config: MotorConfig, selection: GarageSelection): MotorConfig {
  return { ...config, batteryVoltage: resolveGarageBuild(selection).batteryVoltage };
}

export function resolveGarageColors(selection: GarageSelection): { chassisColor: string; accentColor: string } {
  return {
    chassisColor: byId(BODY_COLORS, selection.bodyColorId).value,
    accentColor: byId(ACCENT_COLORS, selection.accentColorId).value,
  };
}
