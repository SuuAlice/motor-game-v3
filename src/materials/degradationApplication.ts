// P3-0(docs/phase3-p3-0-plan.md v7、附録A.3)。個体単位の小さな適用変換のみを持つ。
// RunOutcome全体・save meta・実個体の集合は一切知らない(v12 1.6節)。
//
// clamp規則(v12 1.1節): engineは個体の現在値(絶対値)を知らないためDegradationDiffは
// delta(増分)のみを返す。絶対値への反映・範囲clampは本ファイル(store側)の責務。

import type { WearState, RotorAssemblyState, BodyPartState, BearingAssemblyState } from './inventoryItem';
import type { DegradationDiff } from '../engine/destructionOrchestration';

function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// magnet: demagnetization(D07不可逆到達)・scorch(D04延焼)の両kindとも、適用先
// (demagnetizationFraction)を共有する(v12 1.6節)。原因kindは呼び出し元のdegradationDiffs
// 配列上で別々に残るため、ここでは合算後の絶対値のみを返せばよい。
export function applyMagnetDiff(diff: Extract<DegradationDiff, { role: 'magnet' }>, current: Extract<WearState, { kind: 'magnet' }>): Extract<WearState, { kind: 'magnet' }> {
  return { kind: 'magnet', demagnetizationFraction: clampFraction(current.demagnetizationFraction + diff.deltaFraction) };
}

export function applyGearDiff(diff: Extract<DegradationDiff, { role: 'gear' }>, current: Extract<WearState, { kind: 'gear' }>): Extract<WearState, { kind: 'gear' }> {
  if (diff.kind === 'toothLoss') {
    const nextToothLossCount = Math.min(current.totalToothCount, Math.max(0, current.toothLossCount + diff.deltaCount));
    return { ...current, toothLossCount: nextToothLossCount };
  }
  return { ...current, seizureFraction: clampFraction(current.seizureFraction + diff.deltaFraction) };
}

export function applyBrushDiff(diff: Extract<DegradationDiff, { role: 'brush' }>, current: Extract<WearState, { kind: 'brush' }>): Extract<WearState, { kind: 'brush' }> {
  return { kind: 'brush', wearFraction: clampFraction(current.wearFraction + diff.deltaFraction) };
}

export function applyRotorDiff(diff: Extract<DegradationDiff, { role: 'rotor' }>, current: RotorAssemblyState): RotorAssemblyState {
  if (diff.kind === 'collapse') return { ...current, collapsed: true };
  return { ...current, burnedOut: true };
}

export function applyBodyDiff(diff: Extract<DegradationDiff, { role: 'body' }>, current: BodyPartState): BodyPartState {
  return { ...current, scorchFraction: clampFraction(current.scorchFraction + diff.deltaFraction) };
}

export function applyBearingDiff(diff: Extract<DegradationDiff, { role: 'bearing' }>, current: BearingAssemblyState): BearingAssemblyState {
  return { ...current, seizureFraction: clampFraction(current.seizureFraction + diff.deltaFraction) };
}

// batteryは状態更新ではなく消滅(配列からの除去)のため、変換関数を持たない
// (store層のrunOutcomeApplication.tsがInventoryItemを配列から直接除去する、v12 1.6節)。

/**
 * gear damage合成式(正式Fable確定裁定、v12 1.2節): 補完乗算合成。
 * サルベージ等の経済評価専用であり、物理には一切使わない(伝達効率・摩擦はそれぞれ
 * toothLossCount・seizureFractionから独立に算出する)。
 */
export function computeCompositeGearDamageFraction(wearState: Extract<WearState, { kind: 'gear' }>): number {
  const toothLossFraction = Math.min(1, wearState.toothLossCount / wearState.totalToothCount);
  return 1 - (1 - toothLossFraction) * (1 - wearState.seizureFraction);
}
