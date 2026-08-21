// P3-4 G7-E(a11y項目10、UI計画§13): prefers-reduced-motionで動きを止める。
// 「物理・判定結果自体は不変」——止めるのは見た目の動きだけで、粒子の発生・消滅は変えない。
import { describe, expect, it } from 'vitest';
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from '../reducedMotion';
import { spawnParticles, stepParticles, drawParticles, type ParticleDrawTarget } from '../particleField';

const ORIGIN = { x: 60, y: 40 };

function matcher(matches: boolean, seen: string[] = []) {
  return (query: string) => { seen.push(query); return { matches }; };
}

function recordingTarget() {
  const calls: string[] = [];
  let fillStyle = '';
  const target: ParticleDrawTarget = {
    get fillStyle() { return fillStyle; },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) { fillStyle = String(value); },
    fillRect: (x, y, w, h) => { calls.push(`${fillStyle}@${x},${y},${w},${h}`); },
  };
  return { target, calls };
}

describe('判定', () => {
  it('reduce指定を読み取る', () => {
    const seen: string[] = [];
    expect(prefersReducedMotion(matcher(true, seen))).toBe(true);
    expect(seen).toEqual([REDUCED_MOTION_QUERY]);
  });

  it('指定なしでは動かす', () => {
    expect(prefersReducedMotion(matcher(false))).toBe(false);
  });

  it('matchMediaが無い環境では動かす側へ倒す(演出を止めて症状を隠さない)', () => {
    expect(prefersReducedMotion(undefined)).toBe(false);
  });
});

describe('粒子の動き', () => {
  it('位置と速度が変わらない(静止表示になる)', () => {
    const spawned = spawnParticles([], 'D05_spark', 4, 3, ORIGIN);
    let particles = spawned;
    for (let frame = 0; frame < 5; frame += 1) particles = stepParticles(particles, true);
    for (const [index, p] of particles.entries()) {
      expect(p.x).toBe(spawned[index].x);
      expect(p.y).toBe(spawned[index].y);
      expect(p.vy).toBe(spawned[index].vy);
    }
  });

  it('寿命は進み、通常時と同じフレームで消える(発生・消滅の契機は変えない)', () => {
    const spawned = spawnParticles([], 'D05_spark', 6, 3, ORIGIN);
    let moving = spawned;
    let still = spawned;
    for (let frame = 0; frame < 30; frame += 1) {
      moving = stepParticles(moving, false);
      still = stepParticles(still, true);
      expect(still.length).toBe(moving.length);
    }
  });

  it('破片は跳ねない(バウンドも動きなので止める)', () => {
    const spawned = spawnParticles([], 'D06_debris', 3, 5, ORIGIN, 'N6');
    let particles = spawned;
    for (let frame = 0; frame < 40; frame += 1) particles = stepParticles(particles, true);
    for (const p of particles) {
      if (p.kind !== 'debris') continue;
      expect(p.bounceCount).toBe(0);
    }
  });
});

describe('描画', () => {
  it('D01の折れ線が振動しない(tickが変わっても同じ絵)', () => {
    const particles = spawnParticles([], 'D01_wireLash', 1, 2, ORIGIN);
    const a = recordingTarget();
    const b = recordingTarget();
    drawParticles(a.target, particles, 0, true);
    drawParticles(b.target, particles, 37, true);
    expect(a.calls).toEqual(b.calls);
    // 通常時は振動する(この差が消えていないことの担保)。
    const c = recordingTarget();
    drawParticles(c.target, particles, 37, false);
    expect(c.calls).not.toEqual(a.calls);
  });

  it('粒子自体は描かれ続ける(現象を見えなくしない)', () => {
    const { target, calls } = recordingTarget();
    drawParticles(target, spawnParticles([], 'D05_spark', 5, 1, ORIGIN), 0, true);
    expect(calls).toHaveLength(5);
  });
});
