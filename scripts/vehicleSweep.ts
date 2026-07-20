import { computeMaxTurns, type MotorConfig } from '../src/engine/motorPhysics';
import { createInitialVehicleState, type CarConfig, type VehicleSimState } from '../src/engine/vehiclePhysics';
import { stepTrackRun, type ValidatedTrackDefinition } from '../src/engine/trackPhysics';
import { TRACKS } from '../src/data/tracks';
import { auditUniversalMonotonicity, percentileTarget, type ParameterScoreTable } from '../src/data/trackSweep';
import { validateBuildRestrictions } from '../src/engine/scoring';

const DT = 1 / 120;
const MAX_SECONDS = 40;
const SEED = 0x300_2026;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOTOR_CANDIDATES: MotorConfig[] = [
  { coilTurns: 50, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.25, magnetStrength: 0.8, magnetDistanceMm: 10, batteryVoltage: 1.5, axisOffsetMm: 0, wireGaugeMm: 0.4, parallelStrands: 1, varnished: true },
  { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 1, magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.4, parallelStrands: 1, varnished: true },
  { coilTurns: 110, slitWidthMm: 2.5, sandingQuality: 1, brushPressure: 0.3, magnetStrength: 0.9, magnetDistanceMm: 8, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.4, parallelStrands: 1, varnished: true },
  { coilTurns: 70, slitWidthMm: 1.5, sandingQuality: 1, brushPressure: 0.2, magnetStrength: 0.7, magnetDistanceMm: 15, batteryVoltage: 1.5, axisOffsetMm: 0.5, wireGaugeMm: 0.6, parallelStrands: 1, varnished: true },
  { coilTurns: 40, slitWidthMm: 2.5, sandingQuality: 1, brushPressure: 0.2, magnetStrength: 1, magnetDistanceMm: 5, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.8, parallelStrands: 2, varnished: true },
  { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 1, magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 1.5, wireGaugeMm: 0.4, parallelStrands: 1, varnished: true },
  { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 1, magnetDistanceMm: 5, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.4, parallelStrands: 1, varnished: true },
  { coilTurns: 110, slitWidthMm: 2.5, sandingQuality: 1, brushPressure: 0.25, magnetStrength: 0.9, magnetDistanceMm: 8, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.8, parallelStrands: 1, varnished: true },
  { coilTurns: 110, slitWidthMm: 2.5, sandingQuality: 1, brushPressure: 0.25, magnetStrength: 0.9, magnetDistanceMm: 5, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.8, parallelStrands: 1, varnished: true },
].map((config) => ({ ...config, coilTurns: Math.min(config.coilTurns, computeMaxTurns(config.wireGaugeMm, config.parallelStrands)) }));

const CAR_GRID = {
  gearRatio: [2, 4, 7],
  wheelDiameterMm: [20, 30, 45],
  massG: [100, 150, 240],
  tireGrip: [0.4, 0.7, 1],
  centerOfMassHeightMm: [12, 25, 40],
} as const;

interface SearchConfig extends Record<string, number> {
  motorIndex: number;
  gearRatio: number;
  wheelDiameterMm: number;
  massG: number;
  tireGrip: number;
  centerOfMassHeightMm: number;
}

interface RunResult {
  search: SearchConfig;
  car: CarConfig;
  motor: MotorConfig;
  state: VehicleSimState;
  finished: boolean;
}

function carCandidates(): Array<{ search: SearchConfig; car: CarConfig }> {
  const result: Array<{ search: SearchConfig; car: CarConfig }> = [];
  for (const gearRatio of CAR_GRID.gearRatio) for (const wheelDiameterMm of CAR_GRID.wheelDiameterMm) {
    for (const massG of CAR_GRID.massG) for (const tireGrip of CAR_GRID.tireGrip) {
      for (const centerOfMassHeightMm of CAR_GRID.centerOfMassHeightMm) {
        result.push({
          search: { motorIndex: 0, gearRatio, wheelDiameterMm, massG, tireGrip, centerOfMassHeightMm },
          car: { massG, gearRatio, gearEfficiency: 0.8, wheelDiameterMm, tireGrip, axleFriction: 0, wheelAlignmentMm: 0, centerOfMassHeightMm, motorMountOffsetMm: 0 },
        });
      }
    }
  }
  return result;
}

function simulate(track: ValidatedTrackDefinition, motor: MotorConfig, car: CarConfig, seed: number): VehicleSimState {
  let state = createInitialVehicleState(motor, car);
  const rng = mulberry32(seed);
  for (let step = 0; step < MAX_SECONDS / DT; step++) {
    if (state.status === 'finished' || state.status === 'stalled' || state.status === 'derailed' || state.status === 'overheated') break;
    state = stepTrackRun(motor, car, track, state, DT, rng);
  }
  return state;
}

function score(track: ValidatedTrackDefinition, state: VehicleSimState): number {
  if (state.status !== 'finished') return Number.POSITIVE_INFINITY;
  return track.id === 'energy-run' ? state.energyUsedJ : state.elapsedTimeS;
}

const scoreTables = new Map<string, Map<string, Map<number, number>>>();
const cars = carCandidates();

for (const track of TRACKS) {
  const runs: RunResult[] = [];
  MOTOR_CANDIDATES.forEach((motor, motorIndex) => {
    cars.forEach(({ search, car }, carIndex) => {
      const state = simulate(track, motor, car, SEED + motorIndex * 10_000 + carIndex);
      runs.push({ search: { ...search, motorIndex }, car, motor, state, finished: state.status === 'finished' });
    });
  });
  const viable = runs.filter((run) => run.finished).sort((a, b) => score(track, a.state) - score(track, b.state));
  const perParameter = new Map<string, Map<number, number>>();
  for (const parameter of Object.keys(CAR_GRID)) {
    const grouped = new Map<number, number>();
    for (const run of viable) {
      const value = run.search[parameter];
      grouped.set(value, Math.min(grouped.get(value) ?? Number.POSITIVE_INFINITY, score(track, run.state)));
    }
    perParameter.set(parameter, grouped);
  }
  scoreTables.set(track.id, perParameter);
  const best = viable[0];
  console.log(`\n=== ${track.id}: ${track.name} ===`);
  console.log(`探索 ${runs.length}件 / 完走 ${viable.length}件`);
  if (!best) {
    console.log('完走構成なし');
    continue;
  }
  const bestMetric = score(track, best.state);
  const target = percentileTarget(bestMetric, 'min', 0.97);
  console.log(`${track.id === 'energy-run' ? '最小使用電気' : '最短時間'} ${bestMetric.toFixed(3)} / 97%目標 ${target.toFixed(3)}`);
  console.log(`status=${best.state.status} time=${best.state.elapsedTimeS.toFixed(3)}s energy=${best.state.energyUsedJ.toFixed(3)}J slip=${best.state.slipRatio.toFixed(3)}`);
  console.log(`motor=${JSON.stringify(best.motor)}`);
  console.log(`car=${JSON.stringify(best.car)}`);
  if (track.id === 'hill-climb') {
    const gearScores = perParameter.get('gearRatio');
    console.log(`ギヤ別最良 ${[2, 4, 7].map((ratio) => `${ratio}:1=${gearScores?.get(ratio)?.toFixed(3) ?? '完走なし'}`).join(' / ')}`);
  }
  if (track.restrictions) {
    const exViable = viable.filter((run) => validateBuildRestrictions(run.motor, run.car, track.restrictions ?? {}).valid);
    const exBest = exViable[0];
    console.log(`EX制約適合完走 ${exViable.length}件`);
    if (exBest) {
      const exMetric = score(track, exBest.state);
      console.log(`EX最良 ${exMetric.toFixed(3)} / 97%目標 ${percentileTarget(exMetric, 'min', 0.97).toFixed(3)}`);
      console.log(`EX motor=${JSON.stringify(exBest.motor)}`);
      console.log(`EX car=${JSON.stringify(exBest.car)}`);
    } else {
      console.log('EX制約適合完走構成なし');
    }
  }
}

const degeneracies = Object.entries(CAR_GRID).flatMap(([parameter, values]) => {
  const byTrack: ParameterScoreTable = new Map(
    [...scoreTables.entries()].map(([trackId, tables]) => [trackId, tables.get(parameter) ?? new Map()]),
  );
  return auditUniversalMonotonicity(parameter, values, byTrack, 1e-6);
});
console.log('\n=== 縮退戦略監査 ===');
if (degeneracies.length === 0) console.log('全コースで共通する単一パラメータ極端値なし');
else degeneracies.forEach((item) => console.log(`要再検討: ${item.parameter}を${item.direction}へ固定すると全コース最良`));
