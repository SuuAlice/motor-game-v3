import { getCommutationSign, isInDeadZone } from './commutator';
import {
  J_NAIL,
  K_J,
  K_T,
  K_E,
  R_COIL_PER_TURN,
  MU_BRUSH,
  C_DRAG,
  OMEGA_EPS,
  K_VIB,
  B_MATERIAL_MIN,
  B_MATERIAL_MAX,
  B_REF_DISTANCE_MM,
  K_B_DISTANCE,
  B_FLOOR_RATIO,
  R_CONTACT_FLOOR,
  R_CONTACT_SCALE,
  K_SANDING,
  K_PRESSURE,
  CHATTER_PRESSURE_THRESHOLD,
  CHATTER_MAX_PROB,
  RPM_SMOOTHING_ALPHA,
} from './constants';

// spec docs/spec.md §3.7の調整可能パラメータ(データモデル)
export interface MotorConfig {
  coilTurns: number; // 10–150
  slitWidthMm: number; // 0–5
  sandingQuality: number; // 0–1(削り具合)
  brushPressure: number; // 0–1
  magnetStrength: number; // 弱/中/強(フェライト/ネオジム)、0–1の連続値(spec §3.7.1)
  magnetDistanceMm: number; // 5–30
  batteryVoltage: 1.5 | 3.0;
  axisOffsetMm: number; // 軸の固定ずれ 0–3
}

export interface SimState {
  theta: number; // rad
  omega: number; // rad/s
  current: number; // A
  backEmf: number; // V(表示・グラフ用)
  shorted: boolean;
  running: boolean;
  rpm: number; // 表示用(移動平均)
}

type Rng = () => number;

function sign(x: number): -1 | 0 | 1 {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}

// spec §3.7.1: T_magとe_backで共有する磁束密度B。プリセット(材質)と距離減衰を
// 指数減衰+floorで合成する(R_contactと同じパターン)。
function computeB(magnetStrength: number, magnetDistanceMm: number): number {
  const bMaterial = B_MATERIAL_MIN + (B_MATERIAL_MAX - B_MATERIAL_MIN) * magnetStrength;
  const bFloor = bMaterial * B_FLOOR_RATIO;
  const decay = Math.exp(-K_B_DISTANCE * (magnetDistanceMm - B_REF_DISTANCE_MM));
  return bFloor + (bMaterial - bFloor) * decay;
}

// spec §3.3: 「削り残し度」と「ブラシ圧」から算出(圧が弱いほど・削り残しが多いほど大)。
// 指数減衰+floorで実装(spec表にない追加定数、constants.ts参照)。
function contactResistance(sandingQuality: number, brushPressure: number): number {
  return (
    R_CONTACT_FLOOR +
    R_CONTACT_SCALE * Math.exp(-K_SANDING * sandingQuality) * Math.exp(-K_PRESSURE * brushPressure)
  );
}

// spec §3.5: ブラシ圧が閾値未満のとき、フレームごとに確率で瞬断を発生させる。
function isChatteringFrame(brushPressure: number, rng: Rng): boolean {
  if (brushPressure >= CHATTER_PRESSURE_THRESHOLD) return false;
  const prob =
    (CHATTER_MAX_PROB * (CHATTER_PRESSURE_THRESHOLD - brushPressure)) / CHATTER_PRESSURE_THRESHOLD;
  return rng() < prob;
}

// spec §3.5: 軸ずれによる振動はω²に比例し、ωにノイズを注入する。
function vibrationNoise(vibration: number, rng: Rng): number {
  return (rng() * 2 - 1) * vibration;
}

function updateRpm(prevRpm: number, omega: number): number {
  const instantaneousRpm = (omega * 60) / (2 * Math.PI);
  return prevRpm + RPM_SMOOTHING_ALPHA * (instantaneousRpm - prevRpm);
}

// spec docs/spec.md §3: 固定タイムステップdtで1ステップ積分する純関数。
// React/DOMに依存しない。rngは注入可能(テストでは決定的なモックを渡す)。
export function step(config: MotorConfig, state: SimState, dt: number, rng: Rng = Math.random): SimState {
  const { theta, omega } = state;

  // 0. 整流・デッドゾーン・ショート・磁束密度(T_magとe_backで共有)
  const s = getCommutationSign(theta);
  const sinTheta = Math.sin(theta);
  const deadZone = isInDeadZone(theta, config.slitWidthMm);
  const shorted = config.slitWidthMm <= 0;
  const B = computeB(config.magnetStrength, config.magnetDistanceMm);

  // 1. 逆起電力(spec §3.3、v2修正: T_magと同じsin(θ)・整流符号を掛ける)
  const backEmf = K_E * B * config.coilTurns * omega * sinTheta * s;

  // 2. 電流(spec §3.3)
  const rCoil = R_COIL_PER_TURN * config.coilTurns;
  const rContact = contactResistance(config.sandingQuality, config.brushPressure);
  const iRaw = shorted || deadZone ? 0 : (config.batteryVoltage - backEmf) / (rCoil + rContact);
  let current = Math.max(0, iRaw);

  // 3. チャタリング判定(rng消費①)。T_magの計算前に電流へ反映させることで、
  //    瞬断フレームでは磁気トルクもゼロになる(ブラシ圧弱すぎ→不安定、を物理的に再現)。
  const isChattering = isChatteringFrame(config.brushPressure, rng);
  if (isChattering) {
    current = 0;
  }

  // 4. 磁気トルク(spec §3.2、v2修正: sin(θ)を含める)
  const tMag = shorted || deadZone ? 0 : K_T * B * current * config.coilTurns * sinTheta * s;

  // 5. 静止摩擦クランプ(spec §3.4 要件1)。早期リターンでもRPM表示は更新する。
  const staticFrictionLimit = MU_BRUSH * config.brushPressure;
  if (Math.abs(omega) < OMEGA_EPS && Math.abs(tMag) <= staticFrictionLimit) {
    return {
      theta,
      omega: 0,
      current,
      backEmf,
      shorted,
      running: state.running,
      rpm: updateRpm(state.rpm, 0),
    };
  }

  // 6. 摩擦・抵抗(spec §3.4)とJ(spec §3.1)から角速度を積分(semi-implicit Euler)
  const tFric = -sign(omega) * staticFrictionLimit;
  const tDrag = -C_DRAG * omega;
  const j = J_NAIL + K_J * config.coilTurns;
  const omegaDynamics = omega + ((tMag + tFric + tDrag) / j) * dt;

  // 7. 軸ずれ振動(spec §3.5、ω²比例)をωに注入(rng消費②)
  const vibration = K_VIB * config.axisOffsetMm * omegaDynamics * omegaDynamics;
  const omegaNoisy = omegaDynamics + vibrationNoise(vibration, rng);

  // 8. ゼロ交差クランプ(spec §3.4 要件2)。ノイズ注入後の最終ωに対して、
  //    フレーム開始時のωと符号比較する(注入によるクランプ無効化を防ぐ)。
  const omegaNew = sign(omegaNoisy) !== sign(omega) && omega !== 0 ? 0 : omegaNoisy;

  // 9. θ更新(semi-implicit: 更新後のωを使う)
  const thetaNew = theta + omegaNew * dt;

  return {
    theta: thetaNew,
    omega: omegaNew,
    current,
    backEmf,
    shorted,
    running: state.running,
    rpm: updateRpm(state.rpm, omegaNew),
  };
}
