import type { MeasurementSample } from '../store/gameStore';
import type { ChallengeConditions } from './challenges';

export interface ChallengeEvaluation {
  completed: boolean;
  durationMet: boolean;
  averageRpm: number;
  minimumRpm: number;
  averageCurrentA: number;
  maximumCurrentA: number;
  maximumBatteryHeat: number;
  rpmVariation: number;
  noCollapse: boolean;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function evaluateConditions(history: MeasurementSample[], conditions: ChallengeConditions): ChallengeEvaluation {
  const lastT = history.at(-1)?.t ?? 0;
  const window = history.filter((sample) => sample.t > lastT - conditions.durationSec);
  const duration = window.length > 1 ? window.at(-1)!.t - window[0].t : 0;
  const durationMet = duration >= conditions.durationSec - 0.15;
  const rpms = window.map((sample) => Math.abs(sample.rpm));
  const currents = window.map((sample) => sample.current);
  const averageRpm = average(rpms);
  const minimumRpm = rpms.length > 0 ? Math.min(...rpms) : 0;
  const averageCurrentA = average(currents);
  const maximumCurrentA = currents.length > 0 ? Math.max(...currents) : 0;
  const maximumBatteryHeat = window.length > 0 ? Math.max(...window.map((sample) => sample.batteryHeat)) : 0;
  const variance = average(rpms.map((rpm) => (rpm - averageRpm) ** 2));
  const rpmVariation = averageRpm > 0 ? Math.sqrt(variance) / averageRpm : 0;
  const noCollapse = !window.some((sample) => sample.coilCollapsed);
  const completed = durationMet
    && minimumRpm >= conditions.targetRpm
    && (conditions.maxCurrentA === undefined || maximumCurrentA <= conditions.maxCurrentA)
    && (conditions.maxBatteryHeat === undefined || maximumBatteryHeat <= conditions.maxBatteryHeat)
    && (conditions.maxRpmVariation === undefined || rpmVariation <= conditions.maxRpmVariation)
    && (conditions.noCoilCollapse !== true || noCollapse);
  return { completed, durationMet, averageRpm, minimumRpm, averageCurrentA, maximumCurrentA, maximumBatteryHeat, rpmVariation, noCollapse };
}
