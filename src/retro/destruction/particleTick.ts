// P3-4 G7-D: 粒子の時間進行。**rAFの呼び出し回数ではなく走行時刻から60fps tickを導く**
// ——60Hz/120Hz・フレーム落ちのいずれでも、同じ走行なら同じ絵・同じ寿命になるようにする
// (art-spec §7「ロジックは60fps」)。新しいclockもpublic run keyも追加しない。

/** 論理フレームレート(art-spec §7)。 */
export const LOGIC_TICKS_PER_SECOND = 60;

/**
 * 1回の更新で追いつく最大tick数。長時間タブが止まっていた場合に数千tickを
 * 一気に回して固まらせないための上限で、飛んだ分は捨てて現在時刻へ合わせる。
 */
export const MAX_CATCH_UP_TICKS = 4;

export function tickAt(elapsedTimeS: number): number {
  if (!Number.isFinite(elapsedTimeS) || elapsedTimeS < 0) return 0;
  return Math.floor(elapsedTimeS * LOGIC_TICKS_PER_SECOND);
}

/**
 * 演出tickの走行時刻。motor-onlyは`_elapsedSec`、車体走行は`vehicleState.elapsedTimeS`。
 * 公開のrun keyは増やさない。run終了後は、動いていた側の時計を残す。
 */
export function presentationElapsedSeconds(input: {
  runContext: 'motor' | 'vehicle' | null;
  motorElapsedS: number;
  vehicleElapsedS: number;
}): number {
  if (input.runContext === 'motor') return input.motorElapsedS;
  if (input.runContext === 'vehicle') return input.vehicleElapsedS;
  if (input.vehicleElapsedS === 0 && input.motorElapsedS > 0) return input.motorElapsedS;
  return input.vehicleElapsedS;
}

/**
 * `lastTick`から`currentTick`までに進めるべきステップ数。
 * 同じtickでは0を返す——同一tickを二度進めない(rAFが同じ論理フレーム内で
 * 複数回呼ばれても状態が余計に進まない)。
 */
export function ticksToAdvance(lastTick: number, currentTick: number): number {
  if (currentTick <= lastTick) return 0;
  return Math.min(MAX_CATCH_UP_TICKS, currentTick - lastTick);
}
