// P3-4 G7-D(art-spec §6): パーティクルの手続き生成と描画。
// art-spec §6の「色遷移」「寿命」「挙動」列を、コメントではなく状態/描画のassertで固定する。
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../palette';
import {
  PARTICLE_MAX, PARTICLE_GROUND_Y, spawnParticles, stepParticles, clearBurst,
  particleColor, drawParticles, type Particle, type ParticleDrawTarget,
} from '../particleField';

const ORIGIN = { x: 60, y: 40 };

function spawn(burstId: Parameters<typeof spawnParticles>[1], count: number, seed = 1) {
  // D06のみ素材色を要する(art-spec §6「素材色」)。ここではPOM相当のN6を渡す。
  return spawnParticles([], burstId, count, seed, ORIGIN, 'N6');
}

function stepN(particles: readonly Particle[], frames: number): readonly Particle[] {
  let current = particles;
  for (let index = 0; index < frames; index += 1) current = stepParticles(current);
  return current;
}

/** 描画呼び出しを記録する面。実Canvasなしで描画内容をassertする。 */
function recordingTarget() {
  const calls: { color: string; x: number; y: number; w: number; h: number }[] = [];
  let fillStyle = '';
  const target: ParticleDrawTarget = {
    get fillStyle() { return fillStyle; },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) { fillStyle = String(value); },
    fillRect: (x, y, w, h) => { calls.push({ color: fillStyle, x, y, w, h }); },
  };
  return { target, calls };
}

describe('生成と上限', () => {
  it('同じseedなら同じ粒子になる(Math.randomを使わない=再生で同じ絵になる)', () => {
    expect(spawn('D05_spark', 4, 7)).toEqual(spawn('D05_spark', 4, 7));
  });

  it('上限を超えた分は古いものから捨てる(いま起きている症状を捨てない)', () => {
    let particles = spawn('D05_spark', PARTICLE_MAX, 1);
    particles = spawnParticles(particles, 'D06_debris', 8, 2, ORIGIN, 'N6');
    expect(particles).toHaveLength(PARTICLE_MAX);
    expect(particles.slice(-8).every((p) => p.burstId === 'D06_debris')).toBe(true);
    expect(particles.filter((p) => p.burstId === 'D05_spark')).toHaveLength(PARTICLE_MAX - 8);
  });

  it('有限尺の寿命はart-spec §6の範囲(D05は8〜20フレーム)に収まる', () => {
    for (const p of spawn('D05_spark', 20, 5)) {
      expect(p.lifetimeFrames).toBeGreaterThanOrEqual(8);
      expect(p.lifetimeFrames).toBeLessThanOrEqual(20);
    }
  });

  it('継続系の寿命はInfinity(現象が続く限り生きる)', () => {
    expect(spawn('D02_D04_flame', 2)[0].lifetimeFrames).toBe(Number.POSITIVE_INFINITY);
    expect(spawn('D01_wireLash', 1)[0].lifetimeFrames).toBe(Number.POSITIVE_INFINITY);
  });

  it('現象が止まった継続系だけを落とせる', () => {
    let particles = spawn('D02_D04_flame', 3);
    particles = spawnParticles(particles, 'D05_spark', 2, 2, ORIGIN);
    expect(clearBurst(particles, 'D02_D04_flame').every((p) => p.burstId === 'D05_spark')).toBe(true);
  });
});

describe('art-spec §6の挙動: D01 コイルから伸びる折れ線を毎フレーム振動', () => {
  it('折れ線として2節点以上を持ち、点1つではない', () => {
    const [particle] = spawn('D01_wireLash', 1);
    expect(particle.kind).toBe('wireLash');
    if (particle.kind !== 'wireLash') return;
    expect(particle.jointCount).toBeGreaterThanOrEqual(2);
  });

  it('tickごとに形が振動する(同じ位置でも描画点が変わる)', () => {
    const particles = spawn('D01_wireLash', 1);
    const a = recordingTarget();
    const b = recordingTarget();
    drawParticles(a.target, particles, 0);
    drawParticles(b.target, particles, 1);
    expect(a.calls.length).toBeGreaterThan(1);   // 節点数ぶん描かれる
    expect(a.calls).not.toEqual(b.calls);         // tickで揺れている
  });

  it('同じtickなら同じ描画になる(揺れは決定論)', () => {
    const particles = spawn('D01_wireLash', 1);
    const a = recordingTarget();
    const b = recordingTarget();
    drawParticles(a.target, particles, 5);
    drawParticles(b.target, particles, 5);
    expect(a.calls).toEqual(b.calls);
  });

  it('粒子自体は移動しない(折れ線が振れるのであって飛んでいかない)', () => {
    const particles = stepN(spawn('D01_wireLash', 1), 30);
    expect(particles[0].x).toBe(ORIGIN.x);
    expect(particles[0].y).toBe(ORIGIN.y);
  });
});

describe('art-spec §6の挙動: D02 上昇+横流れ、市松ディザで希薄化', () => {
  it('上昇する', () => {
    const particles = stepN(spawn('D02_smoke', 1, 4), 5);
    expect(particles[0].y).toBeLessThan(ORIGIN.y);
  });

  it('寿命が進むほど描かれるセルが減る(希薄化が実際に起きる)', () => {
    const young = spawn('D02_smoke', 24, 3);
    const old = stepN(young, 30);
    const a = recordingTarget();
    const b = recordingTarget();
    drawParticles(a.target, young, 0);
    drawParticles(b.target, old, 30);
    expect(old.length).toBeGreaterThan(0); // 空になって「減った」ように見えるのを排除
    const drawnRatioYoung = a.calls.length / young.length;
    const drawnRatioOld = b.calls.length / old.length;
    expect(drawnRatioOld).toBeLessThan(drawnRatioYoung);
  });

  it('色は白→灰→黒へ遷移する(art-spec §6)', () => {
    let particles = spawn('D02_smoke', 1, 11);
    const first = particleColor(particles[0]);
    const seen = new Set([first.kind === 'palette' ? first.key : '']);
    for (let frame = 0; frame < 90 && particles.length > 0; frame += 1) {
      particles = stepParticles(particles);
      if (particles.length > 0) {
        const color = particleColor(particles[0]);
        if (color.kind === 'palette') seen.add(color.key);
      }
    }
    expect(first).toEqual({ kind: 'palette', key: 'N5' });
    expect(seen.has('N1')).toBe(true);
  });
});

describe('art-spec §6の挙動: D02/D04 上方へ揺らぐ', () => {
  it('上昇しながら横へ往復する(固定vxの直進ではない)', () => {
    let particles = spawn('D02_D04_flame', 1, 6);
    const xs: number[] = [];
    for (let frame = 0; frame < 20; frame += 1) {
      particles = stepParticles(particles);
      xs.push(particles[0].x);
    }
    // 横方向の差分が符号を変える=往復している。
    const deltas = xs.slice(1).map((x, index) => x - xs[index]);
    expect(deltas.some((d) => d > 0)).toBe(true);
    expect(deltas.some((d) => d < 0)).toBe(true);
    expect(particles[0].y).toBeLessThan(ORIGIN.y);
  });

  it('色はパレットサイクルで回る(固定色にならない)', () => {
    let particles = spawn('D02_D04_flame', 1);
    const seen = new Set<string>();
    for (let frame = 0; frame < 16; frame += 1) {
      const color = particleColor(particles[0]);
      if (color.kind === 'palette') seen.add(color.key);
      particles = stepParticles(particles);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('art-spec §6の挙動: D05 重力小・直線飛散・1〜2px', () => {
  it('サイズは1pxか2px', () => {
    for (const p of spawn('D05_spark', 12, 8)) {
      if (p.kind !== 'spark') continue;
      expect([1, 2]).toContain(p.sizePx);
    }
  });

  it('重力は「小」——同じフレーム数での下向き加速が破片より小さい', () => {
    // 初速は粒子ごとに異なるので、絶対値ではなく**重力による増分**で比べる。
    const sparkStart = spawn('D05_spark', 1, 2)[0];
    const debrisStart = spawn('D06_debris', 1, 2)[0];
    const sparkGain = stepN([sparkStart], 5)[0].vy - sparkStart.vy;
    const debrisGain = stepN([debrisStart], 5)[0].vy - debrisStart.vy;
    expect(sparkGain).toBeGreaterThan(0);
    expect(sparkGain).toBeLessThan(debrisGain);
  });

  it('寿命を過ぎたら消える', () => {
    expect(stepN(spawn('D05_spark', 5, 9), 25)).toHaveLength(0);
  });
});

describe('art-spec §6の挙動: D06 重力+バウンド1回', () => {
  it('床でちょうど1回だけ跳ね、2回目は跳ねない', () => {
    let particles = spawn('D06_debris', 1, 3);
    let bounceObserved = 0;
    let previousVy = particles[0].vy;
    for (let frame = 0; frame < 60 && particles.length > 0; frame += 1) {
      particles = stepParticles(particles);
      if (particles.length === 0) break;
      // 下向き速度が上向きへ反転した瞬間をバウンドとみなす。
      if (previousVy > 0 && particles[0].vy < 0) bounceObserved += 1;
      previousVy = particles[0].vy;
    }
    expect(bounceObserved).toBe(1);
  });

  it('跳ねたあとは床に留まり、床をすり抜けない', () => {
    const particles = stepN(spawn('D06_debris', 4, 5), 45);
    for (const p of particles) expect(p.y).toBeLessThanOrEqual(PARTICLE_GROUND_Y);
  });

  it('バウンド回数は1で止まる(状態としても2にならない)', () => {
    const particles = stepN(spawn('D06_debris', 4, 5), 50);
    for (const p of particles) {
      if (p.kind !== 'debris') continue;
      expect(p.bounceCount).toBeLessThanOrEqual(1);
    }
  });
});

describe('色の契約', () => {
  it('D06の色はspawn時に焼き付けた素材色になる(2026-08-20人間承認)', () => {
    const [pom] = spawnParticles([], 'D06_debris', 1, 1, ORIGIN, 'N6');
    const [titanium] = spawnParticles([], 'D06_debris', 1, 1, ORIGIN, 'N4');
    expect(particleColor(pom)).toEqual({ kind: 'palette', key: 'N6' });
    expect(particleColor(titanium)).toEqual({ kind: 'palette', key: 'N4' });
  });

  it('焼き付けた色は寿命が進んでも変わらない(素材色は経時変化しない)', () => {
    const spawned = spawnParticles([], 'D06_debris', 1, 2, ORIGIN, 'W2');
    const aged = stepN(spawned, 20);
    expect(aged.length).toBeGreaterThan(0);
    expect(particleColor(aged[0])).toEqual({ kind: 'palette', key: 'W2' });
  });

  it('D06は素材色で実際に描画される', () => {
    const { target, calls } = recordingTarget();
    drawParticles(target, spawnParticles([], 'D06_debris', 4, 4, ORIGIN, 'W3'), 0);
    expect(calls).toHaveLength(4);
    for (const call of calls) expect(call.color).toBe(PALETTE.W3);
  });

  it('素材色が解けない場合は既定色で代用せず発生させない', () => {
    expect(spawnParticles([], 'D06_debris', 8, 4, ORIGIN, null)).toEqual([]);
    // 他のburstは素材色を要さないため、nullでも通常どおり発生する。
    expect(spawnParticles([], 'D05_spark', 3, 4, ORIGIN, null)).toHaveLength(3);
  });

  it('D06以外はパレット色だけで描かれる(生の色指定を持ち込まない)', () => {
    const paletteValues = new Set<string>(Object.values(PALETTE));
    const { target, calls } = recordingTarget();
    const particles = [
      ...spawn('D02_smoke', 3), ...spawn('D05_spark', 3), ...spawn('D02_D04_flame', 3),
    ];
    drawParticles(target, particles, 0);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(paletteValues.has(call.color)).toBe(true);
  });
});
