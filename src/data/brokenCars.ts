import type { MotorConfig } from '../engine/motorPhysics';
import type { CarConfig } from '../engine/vehiclePhysics';

export interface BrokenCar {
  id: string;
  title: string;
  symptom: string;
  motorConfig: MotorConfig;
  carConfig: CarConfig;
  repairableMotorParams: readonly (keyof MotorConfig)[];
  repairableCarParams: readonly (keyof CarConfig)[];
}

const MOTOR: MotorConfig = {
  coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3,
  magnetStrength: 1, magnetDistanceMm: 10, batteryVoltage: 3,
  axisOffsetMm: 0, wireGaugeMm: 0.4, parallelStrands: 1, varnished: true,
};

const CAR: CarConfig = {
  massG: 150, gearRatio: 4, gearEfficiency: 0.8, wheelDiameterMm: 30,
  tireGrip: 0.7, axleFriction: 0, wheelAlignmentMm: 0,
  centerOfMassHeightMm: 20, motorMountOffsetMm: 0,
};

// 原因名はUIへ出さない。タイトルと症状、実測値だけをプレイヤーへ提示する。
export const BROKEN_CARS: BrokenCar[] = [
  {
    id: 'silent-hot',
    title: '故障車 01',
    symptom: '動かず、電池の発熱だけが増えていく。',
    motorConfig: { ...MOTOR, slitWidthMm: 0 },
    carConfig: { ...CAR },
    repairableMotorParams: ['slitWidthMm'], repairableCarParams: [],
  },
  {
    id: 'heavy-drag',
    title: '故障車 02',
    symptom: '押し出しても速度がすぐ落ち、電流が大きい。',
    motorConfig: { ...MOTOR },
    carConfig: { ...CAR, axleFriction: 0.9 },
    repairableMotorParams: [], repairableCarParams: ['axleFriction'],
  },
  {
    id: 'wheel-skew',
    title: '故障車 03',
    symptom: '遅く、走るほど熱として失われる量が増える。',
    motorConfig: { ...MOTOR },
    carConfig: { ...CAR, wheelAlignmentMm: 3 },
    repairableMotorParams: [], repairableCarParams: ['wheelAlignmentMm'],
  },
  {
    id: 'spins-only',
    title: '故障車 04',
    symptom: '発進直後、車輪だけが激しく回って前へ進まない。',
    motorConfig: { ...MOTOR, magnetDistanceMm: 5 },
    carConfig: { ...CAR, tireGrip: 0.05 },
    repairableMotorParams: [], repairableCarParams: ['tireGrip'],
  },
  {
    id: 'mixed-load',
    title: '故障車 05',
    symptom: '速度が伸びず、空転と大きな損失が同時に見える。',
    motorConfig: { ...MOTOR, brushPressure: 0.65 },
    carConfig: { ...CAR, gearRatio: 2, tireGrip: 0.2, axleFriction: 0.55 },
    repairableMotorParams: ['brushPressure'],
    repairableCarParams: ['gearRatio', 'tireGrip', 'axleFriction'],
  },
];
