import type { MotorConfig } from '../engine/motorPhysics';

export interface ChallengeConditions {
  targetRpm: number;
  durationSec: number;
  maxCurrentA?: number;
  maxBatteryHeat?: number;
  maxRpmVariation?: number;
  noCoilCollapse?: boolean;
}

export interface Challenge {
  id: string;
  kind: 'classic' | 'ex';
  title: string;
  description: string;
  lockedParams: Partial<MotorConfig>;
  paramRanges?: Partial<Record<keyof MotorConfig, [number, number]>>;
  conditions: ChallengeConditions;
}

const COIL_TURNS_FLOOR: [number, number] = [50, 150];
const CLASSIC_BASE: Partial<MotorConfig> = { wireGaugeMm: 0.4, parallelStrands: 1, varnished: true };

export const CHALLENGES: Challenge[] = [
  {
    id: 'axis-offset', kind: 'classic', title: '軸ずれモーターで攻める',
    description: '軸ずれ2.5 mm固定。振動を抑えながら上限回転数へ迫る。',
    lockedParams: { ...CLASSIC_BASE, axisOffsetMm: 2.5 }, paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    conditions: { targetRpm: 1493, durationSec: 10, noCoilCollapse: true },
  },
  {
    id: 'weak-magnet', kind: 'classic', title: '弱磁石の最高速',
    description: '磁石強度0.2固定。線径と巻き数の組み合わせで磁束不足を補う。',
    lockedParams: { ...CLASSIC_BASE, magnetStrength: 0.2 }, paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    conditions: { targetRpm: 1522, durationSec: 10, maxBatteryHeat: 0.99, noCoilCollapse: true },
  },
  {
    id: 'few-turns', kind: 'classic', title: '30回巻きの最高速',
    description: '巻き数30回固定。低インダクタンス側のレシピを追い込む。',
    lockedParams: { ...CLASSIC_BASE, coilTurns: 30 }, conditions: { targetRpm: 2886, durationSec: 10, noCoilCollapse: true },
  },
  {
    id: 'low-voltage', kind: 'classic', title: '1.5 Vチューニング',
    description: '電池電圧1.5 V固定。内部抵抗の天井まで使い切る。',
    lockedParams: { ...CLASSIC_BASE, batteryVoltage: 1.5 }, paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    conditions: { targetRpm: 575, durationSec: 10, noCoilCollapse: true },
  },
  {
    id: 'firm-brush', kind: 'classic', title: '高ブラシ圧で回す',
    description: 'ブラシ圧0.40固定。接触抵抗と摩擦の損失を他のパラメータで補う。',
    lockedParams: { ...CLASSIC_BASE, brushPressure: 0.4 }, paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    conditions: { targetRpm: 627, durationSec: 10, maxBatteryHeat: 0.99, noCoilCollapse: true },
  },
  {
    id: 'narrow-slit', kind: 'classic', title: 'スリット0.8 mm',
    description: 'スリット幅0.8 mm固定。整流デューティを活かして最高速を狙う。',
    lockedParams: { ...CLASSIC_BASE, slitWidthMm: 0.8 }, paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    conditions: { targetRpm: 2915, durationSec: 10, noCoilCollapse: true },
  },
  {
    id: 'far-magnet', kind: 'classic', title: '磁石距離25 mm',
    description: '磁石距離25 mm固定。弱い磁束で回転数を稼ぐ。',
    lockedParams: { ...CLASSIC_BASE, magnetDistanceMm: 25 }, paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    conditions: { targetRpm: 2262, durationSec: 10, noCoilCollapse: true },
  },
  {
    id: 'ex-current-limit', kind: 'ex', title: 'EX: 電流0.5 A制限',
    description: '最大電流0.5 A、発熱ゲージ50%以下で30秒間維持する。',
    lockedParams: {},
    conditions: { targetRpm: 460, durationSec: 30, maxCurrentA: 0.5, maxBatteryHeat: 0.5, noCoilCollapse: true },
  },
  {
    id: 'ex-close-magnet', kind: 'ex', title: 'EX: 強コギング帯',
    description: '磁石距離2〜5 mmで始動し、シミュレーション上の限界回転域でRPM変動係数5%以下を維持する。',
    lockedParams: {}, paramRanges: { magnetDistanceMm: [2, 5] },
    conditions: { targetRpm: 5123, durationSec: 10, maxRpmVariation: 0.05, maxBatteryHeat: 0.99, noCoilCollapse: true },
  },
  {
    id: 'ex-no-varnish', kind: 'ex', title: 'EX: ワニス禁止',
    description: 'ワニスなしでコイルを崩壊させずに回転数を維持する。',
    lockedParams: { varnished: false },
    conditions: { targetRpm: 2162, durationSec: 10, noCoilCollapse: true },
  },
  {
    id: 'ex-thick-wire', kind: 'ex', title: 'EX: 太線・低電圧',
    description: '線径0.8 mm、電池1.5 V固定。電池内部抵抗との最適点を探す。',
    lockedParams: { wireGaugeMm: 0.8, batteryVoltage: 1.5 },
    conditions: { targetRpm: 2072, durationSec: 10, maxBatteryHeat: 0.99, noCoilCollapse: true },
  },
];
