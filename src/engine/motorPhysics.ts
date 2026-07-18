import { getCommutationSign, isInDeadZone } from './commutator';
import {
  J_NAIL,
  K_T,
  K_E,
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
  CHATTER_BURST_FRAMES,
  RPM_SMOOTHING_ALPHA,
  D_REF,
  R_REF,
  K_J_REF,
  COIL_WINDOW,
  K_COG,
  K_COG_B_DISTANCE,
  COIL_DEFORM_OMEGA,
  COIL_DEFORM_FRAMES,
  R_BATTERY_INTERNAL_1_5V,
  R_BATTERY_INTERNAL_3V,
  HEAT_DISSIPATION,
  BATTERY_HEAT_LIMIT,
} from './constants';

// spec docs/spec.md §3.7の調整可能パラメータ(データモデル)
export interface MotorConfig {
  coilTurns: number; // 10–150
  slitWidthMm: number; // 0–5
  sandingQuality: number; // 0–1(削り具合)
  brushPressure: number; // 0–1
  magnetStrength: number; // 弱/中/強(フェライト/ネオジム)、0–1の連続値(spec §3.7.1)
  magnetDistanceMm: number; // 2–30(spec-v1.5.md §2で下限を5→2に拡張)
  batteryVoltage: 1.5 | 3.0;
  axisOffsetMm: number; // 軸の固定ずれ 0–3
  // spec-v1.5.md §2で追加。省略時はv1.0互換のデフォルト値を使う(既存コードは無改修で動く)
  wireGaugeMm?: number; // 0.2–0.8mm、エナメル線の直径。省略時 D_REF(0.4mm)
  parallelStrands?: 1 | 2; // シングル巻き/ダブル巻き。省略時 1
  varnished?: boolean; // ワニス固め済みか。省略時 true(崩壊なし、v1.0と同じ挙動)
}

export interface SimState {
  theta: number; // rad
  omega: number; // rad/s
  current: number; // A
  backEmf: number; // V(表示・グラフ用)
  shorted: boolean;
  running: boolean;
  rpm: number; // 表示用(移動平均)
  chatterFramesLeft: number; // 内部状態: 接触不良バーストの残りフレーム数(spec §3.5、Phase3バランス調整で追加)
  // spec-v1.5.md §2.2・§4で追加
  batteryHeat: number; // 0–1 電池発熱ゲージ(spec-v1.5.md §4)
  coilCollapsed: boolean; // ワニス崩壊が発生済みか(セッション中は不可逆。spec-v1.5.md §2.2)
  highSpeedFrameCount: number; // 内部状態: ワニス崩壊判定用の連続高速フレーム数
}

// spec-v1.5.md §6.1「崩壊/失敗イベント」に対応する物理イベントの種類。
// engineが唯一の正とする(SimStateの各フラグと1:1対応)。イベントの発生時刻・
// 実験ノートへの記録形式はapp層(store)の責務であり、engineは持たない。
export type SessionEventType = 'coilCollapse' | 'batteryOverheat' | 'shortCircuit';

type Rng = () => number;

function sign(x: number): -1 | 0 | 1 {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}

// spec §3.7.1: T_magとe_backで共有する磁束密度B。プリセット(材質)と距離減衰を
// 指数減衰+floorで合成する(R_contactと同じパターン)。
export function computeB(magnetStrength: number, magnetDistanceMm: number): number {
  const bMaterial = B_MATERIAL_MIN + (B_MATERIAL_MAX - B_MATERIAL_MIN) * magnetStrength;
  const bFloor = bMaterial * B_FLOOR_RATIO;
  const decay = Math.exp(-K_B_DISTANCE * (magnetDistanceMm - B_REF_DISTANCE_MM));
  return bFloor + (bMaterial - bFloor) * decay;
}

// spec-v1.5.md §3.1: コギングは「近いと強く効くが、中距離〜遠距離では無視できる」
// という、T_mag/e_backのB(下限floorあり)より急峻な減衰を必要とする(コメント参照:
// 実測でcomputeB()共有では設計目標を両立できないと判明したための構造変更)。
// 下限を持たないため、遠距離ではB_cog→0に近づく。
function computeCoggingB(magnetStrength: number, magnetDistanceMm: number): number {
  const bMaterial = B_MATERIAL_MIN + (B_MATERIAL_MAX - B_MATERIAL_MIN) * magnetStrength;
  return bMaterial * Math.exp(-K_COG_B_DISTANCE * (magnetDistanceMm - B_REF_DISTANCE_MM));
}

// spec §3.3: 「削り残し度」と「ブラシ圧」から算出(圧が弱いほど・削り残しが多いほど大)。
// 指数減衰+floorで実装(spec表にない追加定数、constants.ts参照)。
export function computeContactResistance(config: MotorConfig): number {
  return (
    R_CONTACT_FLOOR +
    R_CONTACT_SCALE * Math.exp(-K_SANDING * config.sandingQuality) * Math.exp(-K_PRESSURE * config.brushPressure)
  );
}

// spec-v1.5.md §2.1: 線径・並列巻きに依存する抵抗・慣性・巻ける上限。
// d=D_REF・S=1のとき、これらはv1.0の定数(R_REF・K_J_REF)と完全に一致する。
function resolveWireGaugeMm(config: MotorConfig): number {
  return config.wireGaugeMm ?? D_REF;
}

function resolveParallelStrands(config: MotorConfig): 1 | 2 {
  return config.parallelStrands ?? 1;
}

function resolveVarnished(config: MotorConfig): boolean {
  return config.varnished ?? true;
}

function computeRCoilPerTurn(wireGaugeMm: number, parallelStrands: number): number {
  return (R_REF * (D_REF / wireGaugeMm) ** 2) / parallelStrands;
}

function computeKJPerTurn(wireGaugeMm: number, parallelStrands: number): number {
  return K_J_REF * (wireGaugeMm / D_REF) ** 2 * parallelStrands;
}

// spec-v1.5.md §2.1: 巻きスペースの物理制約。「太くすると巻いた線が入らなくなる」
export function computeMaxTurns(wireGaugeMm: number, parallelStrands: number): number {
  // +1e-9: d=D_REF(浮動小数点演算で0.4*0.4=0.16000000000000003になる)のような、
  // 本来割り切れるはずの境界値がfloorで1小さくなるのを防ぐ
  return Math.floor(COIL_WINDOW / (wireGaugeMm * wireGaugeMm * parallelStrands) + 1e-9);
}

// R_coil = computeRCoilPerTurn(線径依存) · coilTurns
export function computeRCoil(config: MotorConfig): number {
  const wireGaugeMm = resolveWireGaugeMm(config);
  const parallelStrands = resolveParallelStrands(config);
  return computeRCoilPerTurn(wireGaugeMm, parallelStrands) * config.coilTurns;
}

// J = J_NAIL + computeKJPerTurn(線径依存) · coilTurns
export function computeJ(config: MotorConfig): number {
  const wireGaugeMm = resolveWireGaugeMm(config);
  const parallelStrands = resolveParallelStrands(config);
  return J_NAIL + computeKJPerTurn(wireGaugeMm, parallelStrands) * config.coilTurns;
}

// spec-v1.5.md §4: アルカリ単3相当。3.0V(2本直列)は内部抵抗も直列で2倍になる。
export function computeBatteryInternalResistance(batteryVoltage: 1.5 | 3.0): number {
  return batteryVoltage === 1.5 ? R_BATTERY_INTERNAL_1_5V : R_BATTERY_INTERNAL_3V;
}

// spec §3.5: ブラシ圧が閾値未満のとき、接触不良の瞬断が起こる。1フレーム単発では
// 慣性JとRPM表示の移動平均(RPM_SMOOTHING_ALPHA)に埋もれてしまい効果が出ないため、
// 発生した瞬断はCHATTER_BURST_FRAMES分だけ持続するバーストとしてモデル化する
// (Phase3バランス調整で追加。spec §3.5の「瞬断」の実装詳細)。
function nextChatterState(
  brushPressure: number,
  framesLeft: number,
  rng: Rng,
): { chattering: boolean; framesLeft: number } {
  if (framesLeft > 0) {
    return { chattering: true, framesLeft: framesLeft - 1 };
  }
  if (brushPressure >= CHATTER_PRESSURE_THRESHOLD) {
    return { chattering: false, framesLeft: 0 };
  }
  const prob =
    (CHATTER_MAX_PROB * (CHATTER_PRESSURE_THRESHOLD - brushPressure)) / CHATTER_PRESSURE_THRESHOLD;
  if (rng() < prob) {
    return { chattering: true, framesLeft: CHATTER_BURST_FRAMES - 1 };
  }
  return { chattering: false, framesLeft: 0 };
}

// spec §3.5: 軸ずれによる振動はω²に比例し、ωにノイズを注入する。
function vibrationNoise(vibration: number, rng: Rng): number {
  return (rng() * 2 - 1) * vibration;
}

function updateRpm(prevRpm: number, omega: number): number {
  const instantaneousRpm = (omega * 60) / (2 * Math.PI);
  return prevRpm + RPM_SMOOTHING_ALPHA * (instantaneousRpm - prevRpm);
}

// spec-v1.5.md §2.2: ワニス固め工程と高回転崩壊。崩壊は一度発生したらセッション中
// 不可逆(coilCollapsed=trueはそのまま維持)。ワニス済み(varnished=true)では
// 崩壊しない。axisOffsetMmへの反映(COIL_DEFORM_PENALTY_MM加算)はconfigが
// engineの外(呼び出し側)にある値のため、ここでは行わない。didCollapseJustHappen()
// でcoilCollapsedの立ち上がりを検出し、呼び出し側が次回以降のconfigに反映すること。
function nextDeformState(
  omega: number,
  varnished: boolean,
  highSpeedFrameCount: number,
  alreadyCollapsed: boolean,
): { highSpeedFrameCount: number; coilCollapsed: boolean } {
  if (alreadyCollapsed) return { highSpeedFrameCount, coilCollapsed: true };
  if (varnished) return { highSpeedFrameCount: 0, coilCollapsed: false };
  if (Math.abs(omega) > COIL_DEFORM_OMEGA) {
    const nextCount = highSpeedFrameCount + 1;
    return { highSpeedFrameCount: nextCount, coilCollapsed: nextCount >= COIL_DEFORM_FRAMES };
  }
  return { highSpeedFrameCount: 0, coilCollapsed: false };
}

// spec-v1.5.md §4: 電池内部抵抗による発熱。短絡時はコイルを迂回する短絡電流
// (torque用のcurrentとは別)が電池側に流れるため、発熱専用に算出する。
function nextBatteryHeat(
  prevHeat: number,
  current: number,
  shorted: boolean,
  batteryVoltage: number,
  rContact: number,
  rBatteryInternal: number,
  dt: number,
): number {
  const lossCurrent = shorted ? batteryVoltage / (rContact + rBatteryInternal) : current;
  const lossWatts = lossCurrent * lossCurrent * rBatteryInternal;
  return Math.min(BATTERY_HEAT_LIMIT, Math.max(0, prevHeat + (lossWatts - HEAT_DISSIPATION) * dt));
}

// spec-v1.5.md §6.1向けの境界検出ヘルパー。呼び出し側(store)は1ステップごとに
// これらでprev/nextを比較し、trueが返った回だけSessionEventを1件記録する。
export function didCollapseJustHappen(prev: SimState, next: SimState): boolean {
  return !prev.coilCollapsed && next.coilCollapsed;
}

export function didBatteryJustOverheat(prev: SimState, next: SimState): boolean {
  return prev.batteryHeat < BATTERY_HEAT_LIMIT && next.batteryHeat >= BATTERY_HEAT_LIMIT;
}

export function didShortJustHappen(prev: SimState, next: SimState): boolean {
  return !prev.shorted && next.shorted;
}

// spec docs/spec.md §3: 固定タイムステップdtで1ステップ積分する純関数。
// React/DOMに依存しない。rngは注入可能(テストでは決定的なモックを渡す)。
export function step(config: MotorConfig, state: SimState, dt: number, rng: Rng = Math.random): SimState {
  const { theta, omega } = state;
  const wireGaugeMm = resolveWireGaugeMm(config);
  const parallelStrands = resolveParallelStrands(config);
  const varnished = resolveVarnished(config);

  // 0. 整流・デッドゾーン・ショート・磁束密度(T_magとe_backで共有)
  const s = getCommutationSign(theta);
  const sinTheta = Math.sin(theta);
  const deadZone = isInDeadZone(theta, config.slitWidthMm);
  const shorted = config.slitWidthMm <= 0;
  const B = computeB(config.magnetStrength, config.magnetDistanceMm);

  // 1. 逆起電力(spec §3.3、v2修正: T_magと同じsin(θ)・整流符号を掛ける)
  const backEmf = K_E * B * config.coilTurns * omega * sinTheta * s;

  // 2. 電流(spec §3.3 + spec-v1.5.md §4: 電池内部抵抗をR_coil+R_contactに直列で追加)
  const rBatteryInternal = computeBatteryInternalResistance(config.batteryVoltage);
  const rCoil = computeRCoilPerTurn(wireGaugeMm, parallelStrands) * config.coilTurns;
  const rContact = computeContactResistance(config);
  const iRaw = shorted || deadZone ? 0 : (config.batteryVoltage - backEmf) / (rCoil + rContact + rBatteryInternal);
  let current = Math.max(0, iRaw);

  // 3. チャタリング判定(rng消費①)。T_magの計算前に電流へ反映させることで、
  //    瞬断フレームでは磁気トルクもゼロになる(ブラシ圧弱すぎ→不安定、を物理的に再現)。
  const chatterState = nextChatterState(config.brushPressure, state.chatterFramesLeft, rng);
  if (chatterState.chattering) {
    current = 0;
  }

  // 4. 磁気トルク(spec §3.2、v2修正: sin(θ)を含める)
  const tMag = shorted || deadZone ? 0 : K_T * B * current * config.coilTurns * sinTheta * s;

  // 4.5 コギングトルク(spec-v1.5.md §3)。保存力(位置エネルギーの勾配)なので、
  //     1回転で正味仕事はゼロ。T_mag/e_backのエネルギー整合性には影響しない。
  //     T_mag/e_backと共有するBではなく、専用の急峻な距離減衰(computeCoggingB)
  //     を使う(§3.1「遠距離では無視できる」を満たすための構造変更、上記コメント参照)。
  const bCog = computeCoggingB(config.magnetStrength, config.magnetDistanceMm);
  const tCog = -K_COG * bCog * bCog * Math.sin(2 * theta);

  // 5. 電池発熱(spec-v1.5.md §4)。静止摩擦クランプの有無によらず毎ステップ更新する。
  const batteryHeat = nextBatteryHeat(
    state.batteryHeat,
    current,
    shorted,
    config.batteryVoltage,
    rContact,
    rBatteryInternal,
    dt,
  );

  // 6. 静止摩擦クランプ(spec §3.4 要件1、spec-v1.5.md §3でT_cogを合算するよう拡張)。
  //    早期リターンでもRPM表示・発熱・崩壊判定は更新する。
  const staticFrictionLimit = MU_BRUSH * config.brushPressure;
  if (Math.abs(omega) < OMEGA_EPS && Math.abs(tMag + tCog) <= staticFrictionLimit) {
    const deform = nextDeformState(0, varnished, state.highSpeedFrameCount, state.coilCollapsed);
    return {
      theta,
      omega: 0,
      current,
      backEmf,
      shorted,
      running: state.running,
      rpm: updateRpm(state.rpm, 0),
      chatterFramesLeft: chatterState.framesLeft,
      batteryHeat,
      coilCollapsed: deform.coilCollapsed,
      highSpeedFrameCount: deform.highSpeedFrameCount,
    };
  }

  // 7. 摩擦・抵抗(spec §3.4)とJ(spec §3.1、spec-v1.5.md §2.1で線径依存に拡張)から
  //    角速度を積分(semi-implicit Euler)。T_cogをトルク和に合算する(spec-v1.5.md §3)。
  const tFric = -sign(omega) * staticFrictionLimit;
  const tDrag = -C_DRAG * omega;
  const j = J_NAIL + computeKJPerTurn(wireGaugeMm, parallelStrands) * config.coilTurns;
  const omegaDynamics = omega + ((tMag + tCog + tFric + tDrag) / j) * dt;

  // 8. 軸ずれ振動(spec §3.5、ω²比例)をωに注入(rng消費②)
  const vibration = K_VIB * config.axisOffsetMm * omegaDynamics * omegaDynamics;
  const omegaNoisy = omegaDynamics + vibrationNoise(vibration, rng);

  // 9. ゼロ交差クランプ(spec §3.4 要件2)。ノイズ注入後の最終ωに対して、
  //    フレーム開始時のωと符号比較する(注入によるクランプ無効化を防ぐ)。
  const omegaNew = sign(omegaNoisy) !== sign(omega) && omega !== 0 ? 0 : omegaNoisy;

  // 10. θ更新(semi-implicit: 更新後のωを使う)
  const thetaNew = theta + omegaNew * dt;

  // 11. ワニス崩壊判定(spec-v1.5.md §2.2)
  const deform = nextDeformState(omegaNew, varnished, state.highSpeedFrameCount, state.coilCollapsed);

  return {
    theta: thetaNew,
    omega: omegaNew,
    current,
    backEmf,
    shorted,
    running: state.running,
    rpm: updateRpm(state.rpm, omegaNew),
    chatterFramesLeft: chatterState.framesLeft,
    batteryHeat,
    coilCollapsed: deform.coilCollapsed,
    highSpeedFrameCount: deform.highSpeedFrameCount,
  };
}
