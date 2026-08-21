// P3-4 G7-D: 粒子の時間進行が**rAFの呼び出し回数に依存しない**ことを固定する。
// 60Hz/120Hz・フレーム落ちのいずれでも、同じ走行時刻なら同じ状態になる。
import { describe, expect, it } from 'vitest';
import { tickAt, ticksToAdvance, LOGIC_TICKS_PER_SECOND, MAX_CATCH_UP_TICKS } from '../particleTick';
import { spawnParticles, stepParticles, type Particle } from '../particleField';

describe('60fps tickの導出', () => {
  it('走行時刻から論理フレーム番号を導く', () => {
    expect(tickAt(0)).toBe(0);
    expect(tickAt(1)).toBe(LOGIC_TICKS_PER_SECOND);
    expect(tickAt(0.5)).toBe(30);
  });

  it('負や非有限の時刻でも0へ落ちる(NaN tickを作らない)', () => {
    expect(tickAt(-1)).toBe(0);
    expect(tickAt(Number.NaN)).toBe(0);
  });

  it('同じtickでは進めない(rAFが同一論理フレーム内で複数回呼ばれても余計に進まない)', () => {
    expect(ticksToAdvance(10, 10)).toBe(0);
    expect(ticksToAdvance(10, 9)).toBe(0);
  });

  it('1tick進めば1回だけ進む', () => {
    expect(ticksToAdvance(10, 11)).toBe(1);
  });

  it('飛んだtickは有限に追従する(長時間停止後に数千tickを回して固まらせない)', () => {
    expect(ticksToAdvance(0, 100000)).toBe(MAX_CATCH_UP_TICKS);
  });
});

describe('rAF頻度が違っても同じ走行時刻なら同じ状態になる', () => {
  const ORIGIN = { x: 60, y: 40 };

  /** 与えられた走行時刻の列でtickを進め、最終状態を返す。 */
  function simulate(elapsedTimes: readonly number[]): readonly Particle[] {
    let particles = spawnParticles([], 'D05_spark', 6, 3, ORIGIN);
    let lastTick = tickAt(elapsedTimes[0]);
    for (const elapsed of elapsedTimes.slice(1)) {
      const currentTick = tickAt(elapsed);
      const steps = ticksToAdvance(lastTick, currentTick);
      for (let step = 0; step < steps; step += 1) particles = stepParticles(particles);
      lastTick = currentTick;
    }
    return particles;
  }

  it('120Hz(倍の呼び出し回数)でも60Hzと同じ最終状態になる', () => {
    const at60 = Array.from({ length: 7 }, (_, i) => i / 60);
    const at120 = Array.from({ length: 13 }, (_, i) => i / 120);
    expect(at120[at120.length - 1]).toBeCloseTo(at60[at60.length - 1], 12);

    expect(simulate(at120)).toEqual(simulate(at60));
  });

  it('フレーム落ちしても、同じ到達時刻なら同じ状態になる(追いつき上限内)', () => {
    const smooth = Array.from({ length: 5 }, (_, i) => i / 60);
    const dropped = [0, 2 / 60, 4 / 60]; // 1フレームおきに落ちた
    expect(simulate(dropped)).toEqual(simulate(smooth));
  });
});
