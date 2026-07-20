// spec §6.5/docs/phase1-plan.md §5.3: カーブを含む壁つきのダミー周回コース。
// スタジアム形状(直線2本+半円コーナー2つ)の中心線を生成し、各点の進行方向は
// 実際の隣接点からatan2で求める(パラメトリック式の符号ミスに左右されない)。
// エンジン(車両層)には接続しない、描画検証専用のダミーデータ。

export interface TrackPoint {
  x: number;
  y: number;
  headingRad: number;
}

export const TRACK_STRAIGHT_LENGTH = 260;
export const TRACK_CORNER_RADIUS = 70;
export const TRACK_HALF_WIDTH = 42;

const STEPS_PER_STRAIGHT = 40;
const STEPS_PER_CORNER = 32;

interface RawPoint {
  x: number;
  y: number;
}

function buildRawLoop(): RawPoint[] {
  const halfL = TRACK_STRAIGHT_LENGTH / 2;
  const r = TRACK_CORNER_RADIUS;
  const raw: RawPoint[] = [];

  // 下辺: 左→右 (y = +r)
  for (let i = 0; i < STEPS_PER_STRAIGHT; i++) {
    const t = i / STEPS_PER_STRAIGHT;
    raw.push({ x: -halfL + TRACK_STRAIGHT_LENGTH * t, y: r });
  }
  // 右コーナー: 中心(halfL, 0)、角度90°→-90°
  for (let i = 0; i < STEPS_PER_CORNER; i++) {
    const t = i / STEPS_PER_CORNER;
    const angle = Math.PI / 2 - Math.PI * t;
    raw.push({ x: halfL + r * Math.cos(angle), y: r * Math.sin(angle) });
  }
  // 上辺: 右→左 (y = -r)
  for (let i = 0; i < STEPS_PER_STRAIGHT; i++) {
    const t = i / STEPS_PER_STRAIGHT;
    raw.push({ x: halfL - TRACK_STRAIGHT_LENGTH * t, y: -r });
  }
  // 左コーナー: 中心(-halfL, 0)、角度-90°→-270°
  for (let i = 0; i < STEPS_PER_CORNER; i++) {
    const t = i / STEPS_PER_CORNER;
    const angle = -Math.PI / 2 - Math.PI * t;
    raw.push({ x: -halfL + r * Math.cos(angle), y: r * Math.sin(angle) });
  }

  return raw;
}

export function buildDummyTrackLoop(): TrackPoint[] {
  const raw = buildRawLoop();
  const n = raw.length;
  return raw.map((p, i) => {
    const next = raw[(i + 1) % n];
    return { x: p.x, y: p.y, headingRad: Math.atan2(next.y - p.y, next.x - p.x) };
  });
}

// 中心線上の点から垂直方向へdistanceだけオフセットした座標(壁の生成に使う)。
export function offsetPerpendicular(p: TrackPoint, distance: number): { x: number; y: number } {
  const nx = -Math.sin(p.headingRad);
  const ny = Math.cos(p.headingRad);
  return { x: p.x + nx * distance, y: p.y + ny * distance };
}

// art-spec §2.2: 回転は16方位スナップで描く。0〜15のインデックスを返す。
export function snapTo16Directions(headingRad: number): number {
  const step = (Math.PI * 2) / 16;
  const twoPi = Math.PI * 2;
  const normalized = ((headingRad % twoPi) + twoPi) % twoPi;
  return Math.round(normalized / step) % 16;
}
