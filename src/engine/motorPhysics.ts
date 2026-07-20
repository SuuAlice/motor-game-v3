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

// spec docs/spec.md §4.1: モーター単体の電気状態(整流・デッドゾーン・ショート・
// 磁束密度・逆起電力・理論電流)を計算する純関数。rngを使わず、チャタリングを
// 考慮しない理論電流を返す(既存step()の手順0〜2の抽出、振る舞い不変)。
export interface MotorElectricalState {
  B: number;
  commutationSign: 1 | -1;
  sinTheta: number;
  shorted: boolean;
  deadZone: boolean;
  backEmf: number;
  current: number; // チャタリングを含まない理論電流
}

export function computeElectricalState(config: MotorConfig, theta: number, omega: number): MotorElectricalState {
  const wireGaugeMm = resolveWireGaugeMm(config);
  const parallelStrands = resolveParallelStrands(config);
  const s = getCommutationSign(theta);
  const sinTheta = Math.sin(theta);
  const deadZone = isInDeadZone(theta, config.slitWidthMm);
  const shorted = config.slitWidthMm <= 0;
  const B = computeB(config.magnetStrength, config.magnetDistanceMm);
  const backEmf = K_E * B * config.coilTurns * omega * sinTheta * s;
  const rBatteryInternal = computeBatteryInternalResistance(config.batteryVoltage);
  const rCoil = computeRCoilPerTurn(wireGaugeMm, parallelStrands) * config.coilTurns;
  const rContact = computeContactResistance(config);
  const iRaw = shorted || deadZone ? 0 : (config.batteryVoltage - backEmf) / (rCoil + rContact + rBatteryInternal);
  const current = Math.max(0, iRaw);
  return { B, commutationSign: s, sinTheta, shorted, deadZone, backEmf, current };
}

// spec §3.2: 磁気トルク(v2修正: sin(θ)を含める)。既存step()の手順4の抽出。
// currentを引数に取ることで、チャタリング確定後の電流でも呼び直せる。
export function computeMagneticTorque(config: MotorConfig, electrical: MotorElectricalState, current: number): number {
  return electrical.shorted || electrical.deadZone
    ? 0
    : K_T * electrical.B * current * config.coilTurns * electrical.sinTheta * electrical.commutationSign;
}

// spec-v1.5.md §3.1: コギングは「近いと強く効くが、中距離〜遠距離では無視できる」
// という、T_mag/e_backのB(下限floorあり)より急峻な減衰を必要とする(実測で
// computeB()共有では設計目標を両立できないと判明したための構造変更)。
function coggingFieldSquared(config: MotorConfig): number {
  const bCog = computeCoggingB(config.magnetStrength, config.magnetDistanceMm);
  return bCog * bCog;
}

// spec-v1.5.md §3: コギングトルク。保存力(位置エネルギーの勾配)なので、1回転で
// 正味仕事はゼロ。T_mag/e_backのエネルギー整合性には影響しない。
export function computeCoggingTorque(config: MotorConfig, theta: number): number {
  return -K_COG * coggingFieldSquared(config) * Math.sin(2 * theta);
}

// Phase2(spec §4.5・§6.2)向けに追加。T_cog = -dU/dθ となるよう定義した位置
// エネルギー(検算済み: dU/dθ = K_COG・bCog²・sin(2θ) = -T_cog)。コギングは
// 保存力であるため、力学的エネルギー不変条件のテストにこの位置エネルギーを
// 含めないと、電池入力なしでU_cog→KE変換だけで見かけ上KEが増加し偽陽性になる。
export function computeCoggingPotential(config: MotorConfig, theta: number): number {
  return -((K_COG * coggingFieldSquared(config)) / 2) * Math.cos(2 * theta);
}

// spec docs/spec.md §4.1: 固定タイムステップdtで1ステップ積分する二段API。
// React/DOMに依存しない。rngは注入可能(テストでは決定的なモックを渡す)。
//
// 段階1(evaluateMotorFrame): このフレームで実際に使われる電流・トルクを
// チャタリングまで含めて確定する。θ・ωは更新しない。rngは条件付きで0回または
// 1回消費する(nextChatterStateはバースト継続中またはbrushPressureが閾値以上の
// ときrngを呼ばない)。
//
// 段階2(advanceMotorState): 段階1の確定済み評価を使って積分する(電池発熱・
// 静止摩擦クランプ・角速度積分・ゼロ交差クランプ・θ更新・ワニス崩壊判定・
// RPM平滑化)。rngは軸ずれ振動のため条件付きで0回または1回消費する(静止摩擦
// クランプで早期returnする経路では呼ばれない)。
//
// Phase2の車体連成(vehiclePhysics.ts)は、段階1の評価(tMag/tCog/current)を
// 読み取ってグリップ判定(spec §4.5の拘束系ベースの必要駆動力)を行い、同じ
// evaluationを段階2に渡す。これにより車体層はモーター層の内部式(電流・トルクの
// 評価式)を一切複製せず、かつRNGの消費回数・順序はstep()単体呼び出しと完全に
// 一致する(投機的な呼び出し・二重消費は発生しない)。
//
// loadTorque(N·m、省略時0): 外部負荷トルク。前進方向(ω>0)を基準に固定された
// 符号付きトルクで、式は常に "-loadTorque" として加わる(spec §4.1の-T_load項)。
// 正の値は常にωを減少させる向きに働くため、ω>0(前進)では減速だが、ω<0(後退)
// では逆に後退を加速する点に注意(「現在の回転方向を減速」ではない、座標系固定の
// 符号)。後退運動に抵抗する負荷(後退を減速させたい場合)を表すには、車体層は
// 負のloadTorqueを渡すこと。
//
// effectiveInertia(kg·m²、省略時は内部計算のモーター慣性J_NAIL+線径依存項):
// spec §4.5の反射慣性J_eff(=J_motor+massKg·r²/(G²·η))を車体層から注入するための
// 引数。静止摩擦クランプの判定式はJに依存しないため、effectiveInertiaの有無で
// クランプの発動判定自体は変わらない。
export interface MotorFrameEvaluation {
  current: number; // チャタリング確定後の電流
  backEmf: number;
  tMag: number; // チャタリング確定後の磁気トルク
  tCog: number;
  shorted: boolean;
  deadZone: boolean;
  chatterFramesLeft: number; // 次状態用、そのままSimStateへ転記する
}

export function evaluateMotorFrame(
  config: MotorConfig,
  state: SimState,
  rng: Rng = Math.random,
  powerOff: boolean = false,
): MotorFrameEvaluation {
  const electrical = computeElectricalState(config, state.theta, state.omega);

  if (powerOff) {
    // 電力供給off(Phase3、省エネコースのエネルギー予算超過)。current・tMag・
    // shortedをすべて0/falseにする。shortedをfalseにすることで、
    // advanceMotorState→nextBatteryHeatのshorted分岐(currentを無視して
    // batteryVoltage/(rContact+rBatteryInternal)を使う式)を通らなくなり、
    // 電池発熱が正しく「新規発熱なし、HEAT_DISSIPATIONによる自然冷却のみ」になる。
    // backEmf・deadZoneは、モーターの回転そのものに起因する観測値として実値を
    // 保持する(診断表示専用。積分・発熱・エネルギー計算のいずれからも参照されない)。
    // チャタリングは電流が存在しない場合意味を持たないため判定自体を行わず、
    // rngを一切消費しない。
    return {
      current: 0,
      backEmf: electrical.backEmf,
      tMag: 0,
      tCog: computeCoggingTorque(config, state.theta),
      shorted: false,
      deadZone: electrical.deadZone,
      chatterFramesLeft: 0,
    };
  }

  let current = electrical.current;

  // チャタリング判定(rng消費①、条件付き)。T_magの計算前に電流へ反映させることで、
  // 瞬断フレームでは磁気トルクもゼロになる(ブラシ圧弱すぎ→不安定、を物理的に再現)。
  const chatterState = nextChatterState(config.brushPressure, state.chatterFramesLeft, rng);
  if (chatterState.chattering) {
    current = 0;
  }

  const tMag = computeMagneticTorque(config, electrical, current);
  const tCog = computeCoggingTorque(config, state.theta);

  return {
    current,
    backEmf: electrical.backEmf,
    tMag,
    tCog,
    shorted: electrical.shorted,
    deadZone: electrical.deadZone,
    chatterFramesLeft: chatterState.framesLeft,
  };
}

// spec §3.4 要件1: 静止摩擦クランプの判定式。vehiclePhysics.tsのグリップ判定
// (拘束系の予測)と`advanceMotorState`の本更新が同一の式でクランプを判定できる
// よう、単独の純関数として公開する(Phase2、Fableレビュー)。
export function isStaticFrictionClamped(
  omega: number,
  tMag: number,
  tCog: number,
  loadTorque: number,
  brushPressure: number,
): boolean {
  const staticFrictionLimit = MU_BRUSH * brushPressure;
  return Math.abs(omega) < OMEGA_EPS && Math.abs(tMag + tCog - loadTorque) <= staticFrictionLimit;
}

// 摩擦・抵抗(spec §3.4)とJ(spec §3.1、spec-v1.5.md §2.1で線径依存に拡張、
// Phase2でeffectiveInertiaによる上書きに対応)から角速度を積分(semi-implicit
// Euler)した、軸ずれ振動を注入する前の値。`advanceMotorState`と、Phase2の
// 軸ずれノイズ上界テストの両方が同じ式を使うよう、単独の純関数として公開する
// (Phase2、Fableレビュー: 「omegaDynamics/振動振幅を取得できる純関数」)。
// 静止摩擦クランプが発動する場合はこの関数を呼ばないこと(呼び出し側で
// isStaticFrictionClampedを先に確認する)。
export function computeOmegaDynamics(
  config: MotorConfig,
  omega: number,
  evaluation: MotorFrameEvaluation,
  dt: number,
  loadTorque: number = 0,
  effectiveInertia?: number,
): number {
  const wireGaugeMm = resolveWireGaugeMm(config);
  const parallelStrands = resolveParallelStrands(config);
  const staticFrictionLimit = MU_BRUSH * config.brushPressure;
  const tFric = -sign(omega) * staticFrictionLimit;
  const tDrag = -C_DRAG * omega;
  const j = effectiveInertia ?? J_NAIL + computeKJPerTurn(wireGaugeMm, parallelStrands) * config.coilTurns;
  return omega + ((evaluation.tMag + evaluation.tCog + tFric + tDrag - loadTorque) / j) * dt;
}

export function advanceMotorState(
  config: MotorConfig,
  state: SimState,
  evaluation: MotorFrameEvaluation,
  dt: number,
  rng: Rng = Math.random,
  loadTorque: number = 0,
  effectiveInertia?: number,
): SimState {
  const { theta, omega } = state;
  const varnished = resolveVarnished(config);
  const { current, backEmf, tMag, tCog, shorted } = evaluation;

  // 電池発熱(spec-v1.5.md §4)。静止摩擦クランプの有無によらず毎ステップ更新する。
  const rBatteryInternal = computeBatteryInternalResistance(config.batteryVoltage);
  const rContact = computeContactResistance(config);
  const batteryHeat = nextBatteryHeat(state.batteryHeat, current, shorted, config.batteryVoltage, rContact, rBatteryInternal, dt);

  // 静止摩擦クランプ(spec §3.4 要件1、spec-v1.5.md §3でT_cogを合算するよう拡張)。
  // 早期リターンでもRPM表示・発熱・崩壊判定は更新する。
  if (isStaticFrictionClamped(omega, tMag, tCog, loadTorque, config.brushPressure)) {
    const deform = nextDeformState(0, varnished, state.highSpeedFrameCount, state.coilCollapsed);
    return {
      theta,
      omega: 0,
      current,
      backEmf,
      shorted,
      running: state.running,
      rpm: updateRpm(state.rpm, 0),
      chatterFramesLeft: evaluation.chatterFramesLeft,
      batteryHeat,
      coilCollapsed: deform.coilCollapsed,
      highSpeedFrameCount: deform.highSpeedFrameCount,
    };
  }

  const omegaDynamics = computeOmegaDynamics(config, omega, evaluation, dt, loadTorque, effectiveInertia);

  // 軸ずれ振動(spec §3.5、ω²比例)をωに注入(rng消費②、条件付き)
  const vibration = K_VIB * config.axisOffsetMm * omegaDynamics * omegaDynamics;
  const omegaNoisy = omegaDynamics + vibrationNoise(vibration, rng);

  // ゼロ交差クランプ(spec §3.4 要件2)。ノイズ注入後の最終ωに対して、
  // フレーム開始時のωと符号比較する(注入によるクランプ無効化を防ぐ)。
  const omegaNew = sign(omegaNoisy) !== sign(omega) && omega !== 0 ? 0 : omegaNoisy;

  // θ更新(semi-implicit: 更新後のωを使う)
  const thetaNew = theta + omegaNew * dt;

  // ワニス崩壊判定(spec-v1.5.md §2.2)
  const deform = nextDeformState(omegaNew, varnished, state.highSpeedFrameCount, state.coilCollapsed);

  return {
    theta: thetaNew,
    omega: omegaNew,
    current,
    backEmf,
    shorted,
    running: state.running,
    rpm: updateRpm(state.rpm, omegaNew),
    chatterFramesLeft: evaluation.chatterFramesLeft,
    batteryHeat,
    coilCollapsed: deform.coilCollapsed,
    highSpeedFrameCount: deform.highSpeedFrameCount,
  };
}

// 既存互換のラッパー。evaluateMotorFrame→advanceMotorStateを内部で連結する。
// シグネチャ・挙動はPhase1完了時点から完全に維持され、既存呼び出し元は無改修。
export function step(
  config: MotorConfig,
  state: SimState,
  dt: number,
  rng: Rng = Math.random,
  loadTorque: number = 0,
  effectiveInertia?: number,
): SimState {
  const evaluation = evaluateMotorFrame(config, state, rng);
  return advanceMotorState(config, state, evaluation, dt, rng, loadTorque, effectiveInertia);
}
