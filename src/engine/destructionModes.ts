// P3-0(docs/phase3-p3-0-plan.md v7、docs/phase3-plan-v12.md)。破壊モード状態機械の
// 型定義。leafモジュール(motorPhysics.ts/vehiclePhysics.ts/trackPhysics.tsをimportしない、
// SimState/VehicleSimStateは型としてのみ参照する)。`advanceDestructionState`の関数本体は
// P3-1で追加する。P3-0では型のみを確定し、export自体を行わない。

import type { SimState } from './motorPhysics';
import type { VehicleSimState } from './vehiclePhysics';

export type DestructionModeId = 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D09';
// D08はPhase3のengine型に含めない(Phase5の(e)周回拡張完成後)。

// Phase3で延焼差分(scorch)に対応するroleをこの2つに限定する(v12 1.6節)。
export type FireExposureRole = 'body' | 'magnet';

export interface DestructionSharedSignals {
  shortCircuitDurationS: number;
  elapsedTimeS: number;
}

export function createInitialSharedSignals(): DestructionSharedSignals {
  return { shortCircuitDurationS: 0, elapsedTimeS: 0 };
}

export interface D01Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  causeLog: D01CauseLog | null;
}

export interface D02Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  coilHeatGaugeRatio: number;
  causeLog: D02CauseLog | null;
}

export type BatteryDestructionProgress = { profile: 'nonLipo'; d03: D03Progress } | { profile: 'lipo'; d04: D04Progress };

export interface D03Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  causeLog: D03CauseLog | null;
}

export interface D04Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning';
  stageEnteredAtT: number | null;
  overDischargeActive: boolean;
  causeLog: D04CauseLog | null;
}

export interface D05Progress {
  sparkDurationS: number;
  episodeTriggered: boolean;
  episodeCount: number;
  cumulativeSparkExposure: number;
  firstEpisodeAtT: number | null;
  causeLog: D05CauseLog | null;
}

export interface D06Progress {
  toothLossCount: number;
  firstLossAtT: number | null;
  causeLog: D06CauseLog | null;
}

export interface D07Progress {
  magnetHeatGaugeRatio: number;
  reversibleDroopActive: boolean;
  irreversibleTriggered: boolean;
  irreversibleTriggeredAtT: number | null;
  causeLog: D07CauseLog | null;
}

export interface D09Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  bearingHeatGaugeRatio: number;
  causeLog: D09CauseLog | null;
}

export interface DestructionState {
  shared: DestructionSharedSignals;
  battery: BatteryDestructionProgress;
  modes: {
    D01: D01Progress;
    D02: D02Progress;
    D05: D05Progress;
    D06: D06Progress;
    D07: D07Progress;
    D09: D09Progress;
  };
}

export function createInitialDestructionState(batteryProfile: 'lipo' | 'nonLipo'): DestructionState {
  return {
    shared: createInitialSharedSignals(),
    battery:
      batteryProfile === 'lipo'
        ? { profile: 'lipo', d04: { triggered: false, triggeredAtT: null, stage: 'none', stageEnteredAtT: null, overDischargeActive: false, causeLog: null } }
        : { profile: 'nonLipo', d03: { triggered: false, triggeredAtT: null, causeLog: null } },
    modes: {
      D01: { triggered: false, triggeredAtT: null, causeLog: null },
      D02: { triggered: false, triggeredAtT: null, coilHeatGaugeRatio: 0, causeLog: null },
      D05: { sparkDurationS: 0, episodeTriggered: false, episodeCount: 0, cumulativeSparkExposure: 0, firstEpisodeAtT: null, causeLog: null },
      D06: { toothLossCount: 0, firstLossAtT: null, causeLog: null },
      D07: { magnetHeatGaugeRatio: 0, reversibleDroopActive: false, irreversibleTriggered: false, irreversibleTriggeredAtT: null, causeLog: null },
      D09: { triggered: false, triggeredAtT: null, bearingHeatGaugeRatio: 0, causeLog: null },
    },
  };
}

// advanceDestructionStateの入力(P3-1本体実装時に使用する型のみP3-0で確定する)。
export interface DestructionFrameInput {
  currentA: number;
  theoreticalCurrentA: number;
  rpm: number;
  batteryHeat: number;
  shorted: boolean;
  chatterFramesLeft: number;
  coilCollapsedRisingEdge: boolean;
  loadTorqueNm?: number;
  energyUsedRatio?: number;
}

export type TemperatureReading = { kind: 'measured'; temperatureC: number } | { kind: 'uncalibratedGauge'; ratio: number } | { kind: 'unavailable' };

export interface CauseLogCommon {
  currentA: number;
  rpm: number;
  atT: number;
  temperature: TemperatureReading;
}

export interface D01CauseLog extends CauseLogCommon {}
export interface D02CauseLog extends CauseLogCommon {
  coilHeatGaugeRatio: number;
}
export interface D03CauseLog extends CauseLogCommon {
  batteryHeatRatio: number;
  shortCircuitDurationS: number;
}
export interface D04CauseLog extends CauseLogCommon {
  batteryHeatRatio: number;
  shortCircuitDurationS: number;
  stage: D04Progress['stage'];
  overDischargeRatio: number | null;
}
export interface D05CauseLog extends CauseLogCommon {
  sparkDurationS: number;
}
export interface D06CauseLog extends CauseLogCommon {
  loadTorqueNm: number;
  toothLossCount: number;
}
export interface D07CauseLog extends CauseLogCommon {
  magnetHeatGaugeRatio: number;
}
export interface D09CauseLog extends CauseLogCommon {
  bearingHeatGaugeRatio: number;
}

export type PhysicsSnapshotAtT = { context: 'motor'; state: SimState } | { context: 'vehicle'; state: VehicleSimState };

// physicsSnapshotAtTを持たない、destructionModes.ts内部の生イベント形。
// destructionOrchestration.ts(P3-1でadvanceDestructionStateを実装する際)が
// physicsSnapshotAtTを後付けして公開DestructionEvent型へ変換する。
export type UnstampedDestructionEvent =
  | { mode: 'D01'; causeLog: D01CauseLog; isFirstThisSession: true }
  | { mode: 'D02'; causeLog: D02CauseLog; isFirstThisSession: true }
  | { mode: 'D03'; causeLog: D03CauseLog; isFirstThisSession: true }
  | { mode: 'D04'; causeLog: D04CauseLog; isFirstThisSession: true; affectedRoles: readonly FireExposureRole[] }
  | { mode: 'D05'; causeLog: D05CauseLog; isFirstThisSession: boolean }
  | { mode: 'D06'; causeLog: D06CauseLog; isFirstThisSession: boolean; isTotalLoss: boolean }
  | { mode: 'D07'; causeLog: D07CauseLog; isFirstThisSession: true }
  | { mode: 'D09'; causeLog: D09CauseLog; isFirstThisSession: true };
