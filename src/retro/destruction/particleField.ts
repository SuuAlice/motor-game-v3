// P3-4 G7-D(UI計画§8.2のparticle層、art-spec §6): 既存パーティクル表のproduction consumer。
// **新しいパーティクル体系は作らない**——art-spec §6の5種だけを、各行の「挙動」列どおりに
// 手続き生成する。D07/D09専用パーティクルは追加しない(R18)。
//
// 表現は5種に閉じた有限unionで持つ。点粒子へ一般化すると、D01の折れ線・D02の市松希薄化・
// 炎の揺らぎ・D06のバウンドという契約ごとの表現が失われる。
//
// 時間はrAFの呼び出し回数ではなく**60fps tick**で進む(art-spec §7「ロジックは60fps」)。
// 同じ走行なら同じ絵になるよう、乱数は使わずtickとseedから決定論的に導く。
import { PALETTE, type PaletteKey } from '../palette';
import { findParticleBurstSpec, type ParticleBurstId } from './destructionPresentation';

/** 同時に保持する粒子の上限。超えたら**古いものから**捨てる。 */
export const PARTICLE_MAX = 256;

/** 論理描画解像度(art-spec: 低解像度Canvasネイティブ)。位置はこの座標系で持つ。 */
export const PARTICLE_FIELD_WIDTH = 160;
export const PARTICLE_FIELD_HEIGHT = 90;

/** D06破片が跳ねる床の高さ(論理座標)。 */
export const PARTICLE_GROUND_Y = 78;

interface ParticleBase {
  readonly burstId: ParticleBurstId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly ageFrames: number;
  /** 継続系はInfinity(現象が続く限り生きる)。 */
  readonly lifetimeFrames: number;
  /** 決定論的な揺れ・散りの位相。粒子ごとに固定。 */
  readonly seed: number;
}

/** D01: コイルから伸びる折れ線。毎フレーム振動する(art-spec §6)。 */
export interface WireLashParticle extends ParticleBase {
  readonly kind: 'wireLash';
  readonly burstId: 'D01_wireLash';
  /** 折れ線の節点数。線が「折れて」見えるために2以上を持つ。 */
  readonly jointCount: number;
  readonly lengthPx: number;
}

/** D02: 煙。市松ディザで希薄化する。 */
export interface SmokeParticle extends ParticleBase {
  readonly kind: 'smoke';
  readonly burstId: 'D02_smoke';
}

/** D02/D04: 炎。上方へ揺らぐ。 */
export interface FlameParticle extends ParticleBase {
  readonly kind: 'flame';
  readonly burstId: 'D02_D04_flame';
}

/** D05: 火花。重力小、直線飛散、1〜2px。 */
export interface SparkParticle extends ParticleBase {
  readonly kind: 'spark';
  readonly burstId: 'D05_spark';
  readonly sizePx: 1 | 2;
}

/** D06: 破片。重力+**バウンド1回**。色は素材色(spawn時に焼き付ける)。 */
export interface DebrisParticle extends ParticleBase {
  readonly kind: 'debris';
  readonly burstId: 'D06_debris';
  readonly bounceCount: number;
  /**
   * ギヤ素材から解決した色(人間承認済みの有限写像)。**spawn時に焼き付ける**——
   * 正典入力の`pendingRunEquipmentSnapshot`はrun終了でnullへ戻るため、参照を持ち越すと
   * 走行終端をまたいだ破片の色が消える。
   */
  readonly materialColorKey: PaletteKey;
}

export type Particle = WireLashParticle | SmokeParticle | FlameParticle | SparkParticle | DebrisParticle;

/** 決定論的な擬似乱数(0..1)。`Math.random`を使わない——再生で同じ絵になるようにするため。 */
export function deterministicUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function makeParticle(
  burstId: ParticleBurstId,
  seed: number,
  origin: { x: number; y: number },
  materialColorKey: PaletteKey | null,
): Particle | null {
  const spec = findParticleBurstSpec(burstId);
  const a = deterministicUnit(seed);
  const b = deterministicUnit(seed + 1);
  const lifetimeFrames = spec.lifetimeFrames === null
    ? Number.POSITIVE_INFINITY
    : spec.lifetimeFrames[0] + deterministicUnit(seed + 2) * (spec.lifetimeFrames[1] - spec.lifetimeFrames[0]);
  const base = { burstId, x: origin.x, y: origin.y, ageFrames: 0, lifetimeFrames, seed };

  switch (burstId) {
    case 'D01_wireLash':
      return { ...base, burstId, kind: 'wireLash', vx: 0, vy: 0, jointCount: 3 + Math.floor(a * 2), lengthPx: 6 + b * 6 };
    case 'D02_smoke':
      return { ...base, burstId, kind: 'smoke', vx: (a - 0.5) * 0.35, vy: -0.35 - b * 0.2 };
    case 'D02_D04_flame':
      return { ...base, burstId, kind: 'flame', vx: 0, vy: -0.5 - b * 0.3 };
    case 'D05_spark':
      return { ...base, burstId, kind: 'spark', vx: (a - 0.5) * 3, vy: (b - 0.5) * 3, sizePx: a < 0.5 ? 1 : 2 };
    case 'D06_debris':
      // 素材色が解けない場合は**既定色で代用せず**発生させない。art-spec §6が
      // 「素材色」と定めている以上、別の色で出すのは違う情報を見せることになる。
      // (正典入力はvehicle文脈のrun開始時装備。D06はmotor-onlyでは発生しない。)
      if (materialColorKey === null) return null;
      return { ...base, burstId, kind: 'debris', vx: (a - 0.5) * 2, vy: -1 - b, bounceCount: 0, materialColorKey };
  }
}

/**
 * 1回の発生分を追加する。上限を超えた分は**古いものから**捨てる
 * (新しい症状を捨てると、いま起きている現象が見えなくなる)。
 */
export function spawnParticles(
  particles: readonly Particle[],
  burstId: ParticleBurstId,
  count: number,
  seed: number,
  origin: { x: number; y: number },
  /** D06破片の素材色(§6)。他のburstでは使わない。 */
  materialColorKey: PaletteKey | null = null,
): readonly Particle[] {
  const spawned = Array.from({ length: count }, (_, index) =>
    makeParticle(burstId, seed * 97 + index * 31, origin, materialColorKey),
  ).filter((particle): particle is Particle => particle !== null);
  const next = [...particles, ...spawned];
  return next.length <= PARTICLE_MAX ? next : next.slice(next.length - PARTICLE_MAX);
}

/** 火花の重力(小)と破片の重力。art-spec §6の「重力小」「重力+バウンド1回」に対応。 */
const SPARK_GRAVITY = 0.03;
const DEBRIS_GRAVITY = 0.12;
/** バウンドの反発係数。1回だけ跳ねたあとは跳ねない。 */
const DEBRIS_BOUNCE_RESTITUTION = 0.45;
/** 炎の横揺れ(振幅px・周期frame)。上方へ揺らぐ表現。 */
const FLAME_SWAY_AMPLITUDE = 1.6;
const FLAME_SWAY_PERIOD_FRAMES = 9;

/**
 * 1粒子を1tick進める。
 *
 * `reducedMotion`(a11y項目10)では**位置を動かさず、寿命だけ進める**——
 * art-spec §6の色遷移・希薄化は残しつつ、動きだけを止めた静止表示になる。
 * 粒子の発生・消滅の契機そのものは変えないため、症状が見えなくなることはない
 * (物理・判定結果はそもそもこの層に無い)。
 */
function stepOne(p: Particle, reducedMotion: boolean): Particle | null {
  const ageFrames = p.ageFrames + 1;
  if (ageFrames >= p.lifetimeFrames) return null;
  if (reducedMotion) return { ...p, ageFrames };

  switch (p.kind) {
    case 'wireLash':
      // 位置は動かさない——折れ線そのものが毎フレーム振動する(描画側がtickで振らせる)。
      return { ...p, ageFrames };
    case 'smoke':
      return { ...p, ageFrames, x: p.x + p.vx, y: p.y + p.vy };
    case 'flame': {
      // 上方へ揺らぐ: 縦は上昇、横はsinで往復する(固定vxで直進させない)。
      const sway = Math.sin((ageFrames / FLAME_SWAY_PERIOD_FRAMES + p.seed) * 2 * Math.PI) * FLAME_SWAY_AMPLITUDE;
      return { ...p, ageFrames, x: p.x + sway * 0.25, y: p.y + p.vy };
    }
    case 'spark': {
      const vy = p.vy + SPARK_GRAVITY;
      return { ...p, ageFrames, vy, x: p.x + p.vx, y: p.y + vy };
    }
    case 'debris': {
      const vy = p.vy + DEBRIS_GRAVITY;
      const y = p.y + vy;
      // バウンドは**ちょうど1回**。2回目以降は床で止まり、そのまま寿命まで残る。
      if (y >= PARTICLE_GROUND_Y && p.bounceCount === 0) {
        return { ...p, ageFrames, x: p.x + p.vx, y: PARTICLE_GROUND_Y, vy: -vy * DEBRIS_BOUNCE_RESTITUTION, bounceCount: 1 };
      }
      if (y >= PARTICLE_GROUND_Y) {
        return { ...p, ageFrames, x: p.x + p.vx * 0.2, y: PARTICLE_GROUND_Y, vy: 0 };
      }
      return { ...p, ageFrames, vy, x: p.x + p.vx, y };
    }
  }
}

/** 60fps tickを1つ進める。寿命切れは落とす。 */
export function stepParticles(particles: readonly Particle[], reducedMotion = false): readonly Particle[] {
  const next: Particle[] = [];
  for (const p of particles) {
    const stepped = stepOne(p, reducedMotion);
    if (stepped !== null) next.push(stepped);
  }
  return next;
}

/** 継続系の粒子だけを落とす(現象が止まったとき用)。 */
export function clearBurst(particles: readonly Particle[], burstId: ParticleBurstId): readonly Particle[] {
  return particles.filter((p) => p.burstId !== burstId);
}

// ---------------------------------------------------------------------------
// 色
// ---------------------------------------------------------------------------

export type ParticleColor = { readonly kind: 'palette'; readonly key: PaletteKey };

export function particleColor(particle: Particle): ParticleColor {
  const spec = findParticleBurstSpec(particle.burstId);
  // 「素材色」の行(D06)は、spawn時に焼き付けた素材色をそのまま使う
  // (2026-08-20人間承認の有限写像。既定色での代用はしない)。
  if (spec.colors === 'materialColor') {
    return { kind: 'palette', key: (particle as DebrisParticle).materialColorKey };
  }
  const ratio = Number.isFinite(particle.lifetimeFrames)
    ? Math.min(0.999, particle.ageFrames / particle.lifetimeFrames)
    // 継続系は色遷移ではなくパレットサイクル(art-spec §6「4フレーム周期」)。
    : (Math.floor(particle.ageFrames / 4) % spec.colors.length) / spec.colors.length;
  return { kind: 'palette', key: spec.colors[Math.min(spec.colors.length - 1, Math.floor(ratio * spec.colors.length))] };
}

// ---------------------------------------------------------------------------
// 描画(5種に閉じた有限のprimitive。汎用rendererは作らない)
// ---------------------------------------------------------------------------

/** 描画先の最小面。CanvasRenderingContext2Dがそのまま渡せる。 */
export interface ParticleDrawTarget {
  // CanvasRenderingContext2Dのfillstyleはgradient/patternも取りうるため、
  // ここを`string`に狭めると実contextを渡せない。書き込むのは色文字列だけ。
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, width: number, height: number): void;
}

/** D02の煙は市松ディザで希薄化する: 寿命が進むほど描くセルを間引く。 */
function isDitherVisible(x: number, y: number, ageRatio: number): boolean {
  const parity = (Math.floor(x) + Math.floor(y)) % 2 === 0;
  if (ageRatio < 0.34) return true;        // 濃い: 全セル
  if (ageRatio < 0.67) return parity;      // 市松: 半分
  return parity && Math.floor(x) % 2 === 0; // さらに希薄
}

/**
 * 粒子を描く。`tick`はD01の振動位相に使う(位置ではなく形が揺れるため)。
 * D06破片は色が未承認のため描かない——既定色で代用すると「素材色」の契約に反する。
 */
export function drawParticles(
  target: ParticleDrawTarget,
  particles: readonly Particle[],
  tick: number,
  reducedMotion = false,
): void {
  // a11y項目10: 動きを止める。D01の折れ線は振動させず固定形状で描く。
  const drawTick = reducedMotion ? 0 : tick;
  for (const particle of particles) {
    target.fillStyle = PALETTE[particleColor(particle).key];

    switch (particle.kind) {
      case 'wireLash': {
        // コイルから伸びる折れ線。節点ごとにtick依存の振動を与える。
        const segments = particle.jointCount;
        for (let index = 0; index < segments; index += 1) {
          const t = (index + 1) / segments;
          const wobble = Math.sin((drawTick + particle.seed + index * 2) * 0.9) * 2;
          target.fillRect(Math.round(particle.x + particle.lengthPx * t), Math.round(particle.y + wobble), 1, 1);
        }
        break;
      }
      case 'smoke': {
        const ageRatio = Math.min(0.999, particle.ageFrames / particle.lifetimeFrames);
        if (!isDitherVisible(particle.x, particle.y, ageRatio)) break;
        target.fillRect(Math.round(particle.x), Math.round(particle.y), 2, 2);
        break;
      }
      case 'flame':
        target.fillRect(Math.round(particle.x), Math.round(particle.y), 2, 2);
        break;
      case 'spark':
        target.fillRect(Math.round(particle.x), Math.round(particle.y), particle.sizePx, particle.sizePx);
        break;
      case 'debris':
        // 素材色(spawn時に焼き付け済み)で描く。歯の欠片なので2px角。
        target.fillRect(Math.round(particle.x), Math.round(particle.y), 2, 2);
        break;
    }
  }
}
