import {
  createValidatedTrack,
  type BuildRestrictions,
  type TrackDefinition,
  type ValidatedTrackDefinition,
} from '../engine/trackPhysics';

const finish = (id: string) => ({ id, kind: 'finish' as const });
const targetTime = (id: string, value: number) => ({ id, kind: 'targetTimeS' as const, value });
const maxEnergy = (id: string, value: number) => ({ id, kind: 'maxEnergyJ' as const, value });
const compliance = (id: string) => ({ id, kind: 'compliance' as const });

const ONE_POINT_FIVE_VOLT: Partial<BuildRestrictions> = {
  maxBatteryVoltage: 1.5,
};

const OFFSET_MOTOR: Partial<BuildRestrictions> = {
  lockedMotorParams: { axisOffsetMm: 1.5 },
};

const THICK_WIRE: Partial<BuildRestrictions> = {
  lockedMotorParams: { wireGaugeMm: 0.8 },
};

// 目標値はscripts/sweep.tsの車体込み探索結果から校正する。
// UIに渡す値は必ずcreateValidatedTrackを経由したブランド型に限定する。
const RAW_TRACKS: TrackDefinition[] = [
  {
    id: 'straight-10m',
    name: '10 m タイムトライアル',
    description: '水平な工作コース。ギヤ比と車輪径の釣り合いで10 mの最短時間を狙う。',
    segments: [{ lengthM: 10, slopeDeg: 0, surfaceGrip: 1, roughness: 0 }],
    objectives: [finish('straight-finish'), targetTime('straight-time', 4.2)],
    exObjectives: [finish('straight-ex-finish'), targetTime('straight-ex-time', 11.98), compliance('straight-ex-voltage')],
    restrictions: ONE_POINT_FIVE_VOLT,
  },
  {
    id: 'hill-climb',
    name: 'ダンボール坂のぼり',
    description: '助走のあとに長い上り坂が続く。低速トルクと車体質量が効く。',
    segments: [
      { lengthM: 2, slopeDeg: 0, surfaceGrip: 0.95, roughness: 0 },
      { lengthM: 6, slopeDeg: 25, surfaceGrip: 0.9, roughness: 0.05 },
      { lengthM: 2, slopeDeg: 0, surfaceGrip: 0.95, roughness: 0 },
    ],
    allowReverse: true,
    objectives: [finish('hill-finish'), targetTime('hill-time', 12)],
    exObjectives: [finish('hill-ex-finish'), targetTime('hill-ex-time', 4.5), maxEnergy('hill-ex-energy', 30)],
  },
  {
    id: 'curve-balance',
    name: '机上カーブ',
    description: '速度を保ちながら緩い連続カーブを抜ける。重心と搭載位置が安定性を左右する。',
    segments: [
      { lengthM: 2, slopeDeg: 0, surfaceGrip: 0.9, roughness: 0 },
      { lengthM: 3, slopeDeg: 0, curveRadiusM: 0.1, surfaceGrip: 0.75, roughness: 0 },
      { lengthM: 3, slopeDeg: 0, curveRadiusM: 0.05, surfaceGrip: 0.75, roughness: 0 },
      { lengthM: 2, slopeDeg: 0, surfaceGrip: 0.9, roughness: 0 },
    ],
    objectives: [finish('curve-finish'), targetTime('curve-time', 15)],
    exObjectives: [finish('curve-ex-finish'), targetTime('curve-ex-time', 14.84), compliance('curve-ex-offset')],
    restrictions: OFFSET_MOTOR,
  },
  {
    id: 'rough-board',
    name: '波板でこぼこ道',
    description: '画用紙の波板を模した路面。大きな車輪と十分な駆動力で止まらず走り切る。',
    segments: [
      { lengthM: 2, slopeDeg: 0, surfaceGrip: 0.9, roughness: 0.1 },
      { lengthM: 6, slopeDeg: 0, surfaceGrip: 0.78, roughness: 0.75 },
      { lengthM: 2, slopeDeg: 0, surfaceGrip: 0.88, roughness: 0.25 },
    ],
    objectives: [finish('rough-finish'), targetTime('rough-time', 4.25)],
    exObjectives: [finish('rough-ex-finish'), targetTime('rough-ex-time', 4.99), compliance('rough-ex-wheel')],
    restrictions: {
      carParamRanges: { wheelDiameterMm: { min: 20, max: 30 } },
    },
  },
  {
    id: 'energy-run',
    name: '省エネロングラン',
    description: 'このコースで使える電気の範囲で15 mを走る。損失を減らす調整が重要になる。',
    segments: [{ lengthM: 15, slopeDeg: 0, surfaceGrip: 0.92, roughness: 0.08 }],
    hasEnergyBudget: true,
    objectives: [finish('energy-finish'), maxEnergy('energy-budget', 28)],
    exObjectives: [finish('energy-ex-finish'), maxEnergy('energy-ex-budget', 24.73), compliance('energy-ex-wire')],
    restrictions: THICK_WIRE,
  },
];

export const TRACKS: readonly ValidatedTrackDefinition[] = RAW_TRACKS.map(createValidatedTrack);

export const TRACK_BY_ID: ReadonlyMap<string, ValidatedTrackDefinition> = new Map(
  TRACKS.map((track) => [track.id, track]),
);
