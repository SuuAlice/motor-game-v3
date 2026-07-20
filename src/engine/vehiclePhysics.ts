import {
  evaluateMotorFrame,
  advanceMotorState,
  computeJ,
  didCollapseJustHappen,
  isStaticFrictionClamped,
  type MotorConfig,
  type MotorFrameEvaluation,
  type SimState,
} from './motorPhysics';
import {
  G,
  C_ROLL,
  C_AIR,
  C_ALIGN,
  MU_TIRE_MIN,
  MU_TIRE_MAX,
  MU_BRUSH,
  C_DRAG,
  OMEGA_EPS,
  START_PUSH_VELOCITY_MPS,
  STALL_DETECTION_TIME_S,
  K_VIB_DRAG,
  BATTERY_HEAT_LIMIT,
  COIL_DEFORM_PENALTY_MM,
} from './constants';

type Rng = () => number;

// spec docs/spec.md §3.3のまま
export interface CarConfig {
  massG: number; // 80–250
  gearRatio: number; // 1.0–12.0
  gearEfficiency: number; // 0.60–0.95
  wheelDiameterMm: number; // 20–50
  tireGrip: number; // 0–1
  axleFriction: number; // 0–1
  wheelAlignmentMm: number; // 0–3
  centerOfMassHeightMm: number; // 10–40
  motorMountOffsetMm: number; // 0–10
}

// spec §6.2のリザルト画面「エネルギー内訳」表示用。Fableレビューにより、
// energyUsedJ(spec §4.8、電気的消費エネルギーの唯一の正)との厳密な代数的収支
// (Σ=energyUsedJ)は保証しない「表示用近似」として扱うことが承認されている。
// UI側はenergyUsedJを唯一の正式合計として別表示し、この5分類は「内訳(概算)」
// 表記とすること(積み上げ100%表示をしない)。gearLossJはモーター軸出力のうち
// 運動エネルギー蓄積に使われた分も含めて計上するため、実際のギヤ損失より
// 過大側に近似する。逆回転(ω_motor<0)フレームでは、gearLossJ・slipLossJ・driveJ
// の増分は0とする(該当する仕事がそのフレームに存在しないという意味の0であり、
// 未記録ではない。Fableレビューにより「案A」として承認済み。Phase3のallowReverse
// 設計時に再設計する)。heatJ・brushLossJは方向に依らず常に正しく計算できるため
// 全フレームで計上する。
export interface EnergyBreakdown {
  driveJ: number;
  gearLossJ: number;
  slipLossJ: number;
  brushLossJ: number; // ブラシ摩擦のみ(振動損失は含めない、heatJ側に計上する)
  heatJ: number; // 電気抵抗熱(I²R)+機械的散逸熱(振動由来)の合計
}

// Phase2では原因を1つに断定するロジックを持たない(単一時点の観測では因果を
// 証明できないため)。原因分類・断定はPhase4診断モード以降で設計する。
export type FailureCode = 'failureToStart';

// status==='stalled'になった時点の生の観測値。因果を断定しない参考情報。
export interface StallObservation {
  wasSlippingAtStall: boolean;
  coilCollapsePenaltyMmAtStall: number;
  deadZoneAtStall: boolean;
}

export interface VehicleSimState {
  motor: SimState; // motorPhysics.tsのSimStateをそのまま内包
  positionM: number;
  velocityMps: number;
  accelerationMps2: number;
  axleOmega: number;
  driveForceN: number;
  loadTorqueNm: number;
  slipRatio: number;
  isSlipping: boolean; // 空転(2自由度)中かどうか。stepVehicleはこの値を状態機械の
  // 入力として使う(前フレームがtrueなら、このフレームのdriveForceRequiredに
  // 依らず必ず空転側の2自由度更新を継続する)
  reunionDeferralStreak: number; // 再結合トリガー成立かつグリップ回復済みだが
  // keBefore>=keAfterを満たせず再結合を延期した連続フレーム数。再結合が成立する
  // か、トリガー不成立/グリップ未回復に戻ると0にリセットされる
  stalledDurationS: number; // 完全停止継続時間(STALL_DETECTION_TIME_S判定用)
  coilCollapsePenaltyMm: number; // コイル崩壊による軸ずれ相当の恒久ペナルティ(不可逆、0で開始)
  energyUsedJ: number;
  energyBreakdown: EnergyBreakdown;
  elapsedTimeS: number;
  trackSegmentIndex: number;
  status: 'ready' | 'running' | 'finished' | 'stalled' | 'derailed' | 'overheated';
  failureCode?: FailureCode;
  stallObservation?: StallObservation;
}

const REUNION_VELOCITY_EPSILON_MPS = 0.01;
const STOP_VELOCITY_THRESHOLD_MPS = 0.005;

// spec §4.4: 車体に働く抵抗。F_vibrationはPhase2で新規追加(コイル崩壊由来の
// 走行抵抗、8節)。すべて積分前(フレーム開始時点)のvelocityMps・omegaMotorを使う。
// exportする理由: テスト(axisOffsetMm>0のE_mech上界検証、修正方針4)が
// stepVehicle内部と全く同じ抵抗式を使ってloadTorque・jEffを外部から再現する
// 必要があるため(式を重複させず、この関数を単一の正として共有する)。
export function computeResistances(
  carConfig: CarConfig,
  massKg: number,
  velocityMps: number,
  slopeRad: number,
  effectiveAxisOffsetMm: number,
  omegaMotor: number,
): { slope: number; roll: number; air: number; align: number; vibration: number; total: number } {
  const slope = -massKg * G * Math.sin(slopeRad);
  const roll = -Math.sign(velocityMps) * C_ROLL * massKg * G * (1 + carConfig.axleFriction);
  const air = -C_AIR * velocityMps * Math.abs(velocityMps);
  const align = -Math.sign(velocityMps) * C_ALIGN * carConfig.wheelAlignmentMm * Math.abs(velocityMps);
  // 常に運動方向に逆らう符号(velocityMps===0のときsign(0)=0でvibration=0)
  const vibration = -Math.sign(velocityMps) * K_VIB_DRAG * effectiveAxisOffsetMm * Math.abs(omegaMotor);
  return { slope, roll, air, align, vibration, total: slope + roll + air + align + vibration };
}

// spec §4.5: 非空転を仮定した拘束系の角加速度から必要駆動力を逆算する
// (F_drive_required)。advanceMotorStateの静止摩擦クランプ判定式と完全に同一の
// 式でクランプ判定を行う(予測と本更新の判定が構造的に一致することを保証する)。
function computeDriveForceRequired(
  tMag: number,
  tCog: number,
  omegaMotor: number,
  brushPressure: number,
  resistTotal: number,
  wheelRadius: number,
  gearRatio: number,
  gearEfficiency: number,
  jEff: number,
): number {
  const staticFrictionLimit = MU_BRUSH * brushPressure;
  const tFric = -Math.sign(omegaMotor) * staticFrictionLimit;
  const tDrag = -C_DRAG * omegaMotor;
  const tMotor = tMag + tCog + tFric + tDrag;
  const tResistReflected = (wheelRadius / (gearRatio * gearEfficiency)) * resistTotal;
  const loadTorqueCandidate = -tResistReflected;
  // advanceMotorStateの静止摩擦クランプ判定と同一の関数を使う(予測と本更新の
  // 判定が構造的に一致することを保証する。単純化のため引数のomegaMotorをそのまま渡す)
  const isClamped = isStaticFrictionClamped(omegaMotor, tMag, tCog, loadTorqueCandidate, brushPressure);
  const alpha = isClamped ? 0 : (tMotor + tResistReflected) / jEff;
  const a = (wheelRadius / gearRatio) * alpha;
  return a; // 呼び出し側でmassKg*a-resistTotalを計算する(tResistReflectedの再計算を避けるためaのみ返す)
}

interface SlipStepResult {
  motor: SimState;
  velocityMps: number;
  isSlipping: boolean;
  fContact: number; // 符号付き接地摩擦力(N)。案X: sign(slipVelocity)・F_grip_max
  loadTorqueUsed: number;
  slipLossJOngoing: number;
  slipLossJReunion: number;
  reunionDeferralStreak: number;
}

// 空転(2自由度)の1フレーム分の更新+再結合判定。「空転を継続する」経路と
// 「このフレームで新たに空転へ入る」経路の両方から呼ばれる、唯一の空転積分ロジック
// (重複を避けるための共通化。9節の再結合条件・22.5節追加条件1のトリガー・延期
// ガードをここに集約する)。
//
// 案X(Fable承認済み・接地摩擦符号方式): 接地摩擦F_contactは相対すべり
// slipVelocity=wheelSurfaceSpeed−velocityMpsの符号に従い、常に相対すべりを
// 減らす向きに作用する(sign(slipVelocity)・F_grip_max)。符号を固定していた
// 旧実装は、モーターが常にホイールより速く回るオーバードライブ空転のみを想定
// しており、反射慣性込みの連成の結果すべりが逆転した場合(車体側がホイール
// 表面速度を追い越す)に、車体を無条件に加速し続け非物理的に発散するバグが
// あった(2026-07-19エスカレーション、Fable承認の修正方針)。
//
// forcedSign: このフレームで新たに空転へ突入する場合に呼び出し側が渡す。突入
// 判定(computeDriveForceRequiredによるdriveForceRequired>F_grip_max)は、
// 定義上モーターがホイールを車体より速く回そうとしている状態でのみ成立する
// (Phase2は前進のみを扱うため、slipVelocityPreは突入直前ちょうど0付近になり、
// 浮動小数点誤差でsignが不定になり得る)。よって突入フレームはforcedSign=1を
// 明示的に使い、継続フレーム(forcedSign省略)ではそのフレーム開始時点の実際の
// slipVelocityPreの符号を使う。
function runSlipStep(
  effectiveMotorConfig: MotorConfig,
  motorConfig: MotorConfig,
  motorState: SimState,
  evaluation: MotorFrameEvaluation,
  dt: number,
  rng: Rng,
  velocityMpsPre: number,
  gripMax: number,
  resistTotal: number,
  wheelRadius: number,
  gearRatio: number,
  eta: number,
  jMotor: number,
  jEff: number,
  massKg: number,
  reunionDeferralStreak: number,
  forcedSign?: 1 | -1,
): SlipStepResult {
  const omegaMotorPre = motorState.omega;
  const wheelSurfaceSpeedPre = (omegaMotorPre / gearRatio) * wheelRadius;
  const slipVelocityPre = wheelSurfaceSpeedPre - velocityMpsPre;
  // Math.sign(0)は0になるため、突入直後でslipVelocityPreがちょうど0(またはその
  // 極小誤差)の場合に備えて`|| 1`でオーバードライブ方向にフォールバックする
  // (Phase2の唯一の突入経路がオーバードライブのため、この既定値は物理的に妥当)
  const contactSign = forcedSign ?? ((Math.sign(slipVelocityPre) || 1) as 1 | -1);
  const fContact = contactSign * gripMax;

  const loadTorqueUsed = (fContact * wheelRadius) / (gearRatio * eta);
  const nextMotorRaw = advanceMotorState(effectiveMotorConfig, motorState, evaluation, dt, rng, loadTorqueUsed);
  const carAccel = (fContact + resistTotal) / massKg;
  const nextVelocity = velocityMpsPre + carAccel * dt;

  // 空転損失(このフレーム分): |F_contact|・|slipVelocity|・dt(フレーム開始時点の
  // 値を使う。摩擦は常に相対すべりを減らす向きに働くため常に≥0)
  const slipLossJOngoing = gripMax * Math.abs(slipVelocityPre) * dt;

  let nextMotor = nextMotorRaw;
  let isSlipping = true;
  let slipLossJReunion = 0;
  let nextReunionDeferralStreak = 0;

  // 再結合トリガー: 相対すべりがゼロ交差した、またはεバンド内に入ったフレームで
  // 再結合を試行する(片側εバンドの「トンネリング」防止に加え、符号交差そのものも
  // 検出する)。このフレームの積分自体はcontactSign(跨ぐ前の符号)で計算済みであり、
  // 交差を検出した後にF_contactの符号を反転させて再積分することはしない
  // (跨いだ直後のフレームでいきなり符号を反転させ続けると往復振動しうるため、
  // 「跨ぐ前の接近イベント」として1回だけ再結合を試行し、成立しなければ次フレーム
  // 以降はそのフレーム自身のslipVelocityPreから符号を再評価する)
  const nextWheelSurfaceSpeed = (nextMotorRaw.omega / gearRatio) * wheelRadius;
  const slipVelocityNext = nextWheelSurfaceSpeed - nextVelocity;
  const crossedOrNearZero = Math.sign(slipVelocityNext) !== contactSign || Math.abs(slipVelocityNext) <= REUNION_VELOCITY_EPSILON_MPS;
  if (crossedOrNearZero) {
    // グリップが回復するかどうかを、このフレームのevaluation(tMag/tCog)と
    // 新しいω_motorで再確認する(rngを追加消費しない、代数的な再計算のみ)
    const aNext = computeDriveForceRequired(
      evaluation.tMag,
      evaluation.tCog,
      nextMotorRaw.omega,
      motorConfig.brushPressure,
      resistTotal,
      wheelRadius,
      gearRatio,
      eta,
      jEff,
    );
    const driveForceRequiredNext = massKg * aNext - resistTotal;

    if (driveForceRequiredNext <= gripMax) {
      const omegaAfter = (nextVelocity * gearRatio) / wheelRadius;
      const keBefore = 0.5 * jMotor * nextMotorRaw.omega * nextMotorRaw.omega;
      const keAfter = 0.5 * jMotor * omegaAfter * omegaAfter;
      if (keBefore >= keAfter) {
        nextMotor = { ...nextMotorRaw, omega: omegaAfter };
        isSlipping = false;
        slipLossJReunion = keBefore - keAfter; // 非負をこの分岐条件自体が保証する
      } else {
        // エネルギー非増加条件を満たさないため再結合を延期する(空転継続)
        nextReunionDeferralStreak = reunionDeferralStreak + 1;
      }
    }
    // グリップがまだ回復していない場合は延期扱いにしない(トリガー自体が
    // 本来の再結合境界ではないため、ストリークはリセットする)
  }

  return {
    motor: nextMotor,
    velocityMps: nextVelocity,
    isSlipping,
    fContact,
    loadTorqueUsed,
    slipLossJOngoing,
    slipLossJReunion,
    reunionDeferralStreak: nextReunionDeferralStreak,
  };
}

export function createInitialVehicleState(_motorConfig: MotorConfig, carConfig: CarConfig): VehicleSimState {
  const wheelRadius = carConfig.wheelDiameterMm / 2000;
  const velocityMps = START_PUSH_VELOCITY_MPS;
  const axleOmega = velocityMps / wheelRadius;
  const motorOmega = axleOmega * carConfig.gearRatio;

  const motor: SimState = {
    theta: Math.PI / 4,
    omega: motorOmega,
    current: 0,
    backEmf: 0,
    shorted: false,
    running: true,
    rpm: 0,
    chatterFramesLeft: 0,
    batteryHeat: 0,
    coilCollapsed: false,
    highSpeedFrameCount: 0,
  };

  return {
    motor,
    positionM: 0,
    velocityMps,
    accelerationMps2: 0,
    axleOmega,
    driveForceN: 0,
    loadTorqueNm: 0,
    slipRatio: 0,
    isSlipping: false,
    reunionDeferralStreak: 0,
    stalledDurationS: 0,
    coilCollapsePenaltyMm: 0,
    energyUsedJ: 0,
    energyBreakdown: { driveJ: 0, gearLossJ: 0, slipLossJ: 0, brushLossJ: 0, heatJ: 0 },
    elapsedTimeS: 0,
    trackSegmentIndex: 0,
    status: 'ready',
  };
}

export function stepVehicle(
  motorConfig: MotorConfig,
  carConfig: CarConfig,
  state: VehicleSimState,
  dt: number,
  rng: Rng = Math.random,
  slopeRad: number = 0,
): VehicleSimState {
  // 終端状態の安定性: motorPhysics.step()の静止摩擦クランプと同じ早期returnパターン。
  // 自動再始動を構造的に禁止する。
  if (state.status === 'finished' || state.status === 'stalled' || state.status === 'derailed' || state.status === 'overheated') {
    return state;
  }

  // コイル崩壊ペナルティを内部的に注入する(呼び出し元のmotorConfigは変更しない)
  const effectiveAxisOffsetMm = motorConfig.axisOffsetMm + state.coilCollapsePenaltyMm;
  const effectiveMotorConfig: MotorConfig = { ...motorConfig, axisOffsetMm: effectiveAxisOffsetMm };

  // 段階1: チャタリング確定済みの評価をこのフレームで1回だけ取得する(rng消費①)。
  // グリップ判定(下記)と本更新(advanceMotorState)の両方でこの同じevaluationを使う。
  const evaluation = evaluateMotorFrame(effectiveMotorConfig, state.motor, rng);

  const wheelRadius = carConfig.wheelDiameterMm / 2000; // mm→m、直径→半径
  const massKg = carConfig.massG / 1000;
  const gearRatio = carConfig.gearRatio;
  const eta = carConfig.gearEfficiency;
  const omegaMotorPre = state.motor.omega;
  const velocityMpsPre = state.velocityMps;

  const normalForce = massKg * G * Math.cos(slopeRad);
  const gripMax = (MU_TIRE_MIN + carConfig.tireGrip * (MU_TIRE_MAX - MU_TIRE_MIN)) * normalForce;

  const resist = computeResistances(carConfig, massKg, velocityMpsPre, slopeRad, effectiveAxisOffsetMm, omegaMotorPre);

  const jMotor = computeJ(motorConfig);
  const jEff = jMotor + (massKg * wheelRadius * wheelRadius) / (gearRatio * gearRatio * eta);
  const tResistReflected = (wheelRadius / (gearRatio * eta)) * resist.total;

  let nextMotor: SimState;
  let nextVelocity: number;
  let isSlipping: boolean;
  let driveForceActual: number;
  let loadTorqueUsed: number;
  let slipLossJReunion = 0;
  let slipLossJOngoing = 0;
  let nextReunionDeferralStreak = 0;

  if (state.isSlipping) {
    // 空転を継続する: このフレームのdriveForceRequiredの値に関わらず、前フレームで
    // isSlipping===trueだった限り必ず2自由度更新を継続する(修正方針1)。
    // 空転からの離脱は下記runSlipStep内の再結合トリガー+エネルギー非増加条件
    // (keBefore>=keAfter)を満たした場合のみ発生する。
    const result = runSlipStep(
      effectiveMotorConfig,
      motorConfig,
      state.motor,
      evaluation,
      dt,
      rng,
      velocityMpsPre,
      gripMax,
      resist.total,
      wheelRadius,
      gearRatio,
      eta,
      jMotor,
      jEff,
      massKg,
      state.reunionDeferralStreak,
      // forcedSign省略: 継続フレームはこのフレーム開始時点の実際のslipVelocityの
      // 符号を使う(案X)
    );
    nextMotor = result.motor;
    nextVelocity = result.velocityMps;
    isSlipping = result.isSlipping;
    driveForceActual = result.fContact;
    loadTorqueUsed = result.loadTorqueUsed;
    slipLossJOngoing = result.slipLossJOngoing;
    slipLossJReunion = result.slipLossJReunion;
    nextReunionDeferralStreak = result.reunionDeferralStreak;
  } else {
    const aPredicted = computeDriveForceRequired(
      evaluation.tMag,
      evaluation.tCog,
      omegaMotorPre,
      motorConfig.brushPressure,
      resist.total,
      wheelRadius,
      gearRatio,
      eta,
      jEff,
    );
    const driveForceRequired = massKg * aPredicted - resist.total;

    if (driveForceRequired <= gripMax) {
      // 非空転: 反射慣性J_effを注入し、反射抵抗をloadTorqueとして1自由度で更新する
      loadTorqueUsed = -tResistReflected;
      nextMotor = advanceMotorState(effectiveMotorConfig, state.motor, evaluation, dt, rng, loadTorqueUsed, jEff);
      const nextAxleOmega = nextMotor.omega / gearRatio;
      nextVelocity = nextAxleOmega * wheelRadius;
      isSlipping = false;
      driveForceActual = driveForceRequired;
    } else {
      // このフレームで新たに空転へ入る。継続時と同一のrunSlipStepを使う
      // (空転積分ロジックの重複を避ける)。
      const result = runSlipStep(
        effectiveMotorConfig,
        motorConfig,
        state.motor,
        evaluation,
        dt,
        rng,
        velocityMpsPre,
        gripMax,
        resist.total,
        wheelRadius,
        gearRatio,
        eta,
        jMotor,
        jEff,
        massKg,
        state.reunionDeferralStreak,
        1, // forcedSign: 突入はdriveForceRequired>gripMaxのオーバードライブでのみ発生する
      );
      nextMotor = result.motor;
      nextVelocity = result.velocityMps;
      isSlipping = result.isSlipping;
      driveForceActual = result.fContact;
      loadTorqueUsed = result.loadTorqueUsed;
      slipLossJOngoing = result.slipLossJOngoing;
      slipLossJReunion = result.slipLossJReunion;
      nextReunionDeferralStreak = result.reunionDeferralStreak;
    }
  }

  // コイル崩壊: 不可逆ペナルティをVehicleSimState内部で保持する(呼び出し元の
  // MotorConfigは変更しない、spec §4.1「崩壊した瞬間に振動抵抗として現れる」を
  // stepVehicle単体で満たす)
  const justCollapsed = didCollapseJustHappen(state.motor, nextMotor);
  const nextCoilCollapsePenaltyMm = justCollapsed ? state.coilCollapsePenaltyMm + COIL_DEFORM_PENALTY_MM : state.coilCollapsePenaltyMm;

  // energyBreakdown(5分類、表示用近似。Fableレビュー承認済みの設計)
  const energyUsedJIncrement = motorConfig.batteryVoltage * evaluation.current * dt;
  const heatJIncrement =
    (motorConfig.batteryVoltage - evaluation.backEmf) * evaluation.current * dt + Math.abs(resist.vibration * velocityMpsPre) * dt;
  const brushLossJIncrement = MU_BRUSH * motorConfig.brushPressure * Math.abs(omegaMotorPre) * dt;

  let gearLossJIncrement = 0;
  let driveJIncrement = 0;
  let slipLossJIncrement = slipLossJOngoing + slipLossJReunion;
  if (omegaMotorPre >= 0) {
    const pMech = evaluation.backEmf * evaluation.current;
    gearLossJIncrement = pMech * (1 - eta) * dt;
    driveJIncrement = Math.max(0, driveForceActual * velocityMpsPre) * dt;
  } else {
    // 逆回転フレームではgearLossJ/driveJの増分を0とする(該当する仕事がこの
    // フレームに存在しないという意味の0。Fableレビューにより「案A」として承認済み)
    slipLossJIncrement = slipLossJReunion; // 空転中の逆回転は想定しないため通常項は付与しない
  }

  const nextPositionM = state.positionM + nextVelocity * dt;
  const nextAccelerationMps2 = (nextVelocity - velocityMpsPre) / dt;
  const nextAxleOmegaField = nextMotor.omega / gearRatio;
  const finalWheelSurfaceSpeed = (nextMotor.omega / gearRatio) * wheelRadius;
  const nextSlipRatio = isSlipping
    ? Math.min(1, Math.max(0, (finalWheelSurfaceSpeed - nextVelocity) / Math.max(Math.abs(finalWheelSurfaceSpeed), 1e-6)))
    : 0;

  // 完全停止検出とstalled遷移(spec §7.2)
  const stopped = Math.abs(nextVelocity) < STOP_VELOCITY_THRESHOLD_MPS && Math.abs(nextMotor.omega) < OMEGA_EPS;
  const nextStalledDurationS = stopped ? state.stalledDurationS + dt : 0;

  let status: VehicleSimState['status'] = 'running';
  let failureCode: FailureCode | undefined;
  let stallObservation: StallObservation | undefined;

  if (nextMotor.batteryHeat >= BATTERY_HEAT_LIMIT) {
    status = 'overheated';
  } else if (nextStalledDurationS >= STALL_DETECTION_TIME_S) {
    status = 'stalled';
    failureCode = 'failureToStart';
    stallObservation = {
      wasSlippingAtStall: isSlipping,
      coilCollapsePenaltyMmAtStall: nextCoilCollapsePenaltyMm,
      deadZoneAtStall: evaluation.deadZone,
    };
  }

  return {
    motor: nextMotor,
    positionM: nextPositionM,
    velocityMps: nextVelocity,
    accelerationMps2: nextAccelerationMps2,
    axleOmega: nextAxleOmegaField,
    driveForceN: driveForceActual,
    loadTorqueNm: loadTorqueUsed,
    slipRatio: nextSlipRatio,
    isSlipping,
    reunionDeferralStreak: nextReunionDeferralStreak,
    stalledDurationS: nextStalledDurationS,
    coilCollapsePenaltyMm: nextCoilCollapsePenaltyMm,
    energyUsedJ: state.energyUsedJ + energyUsedJIncrement,
    energyBreakdown: {
      driveJ: state.energyBreakdown.driveJ + driveJIncrement,
      gearLossJ: state.energyBreakdown.gearLossJ + gearLossJIncrement,
      slipLossJ: state.energyBreakdown.slipLossJ + slipLossJIncrement,
      brushLossJ: state.energyBreakdown.brushLossJ + brushLossJIncrement,
      heatJ: state.energyBreakdown.heatJ + heatJIncrement,
    },
    elapsedTimeS: state.elapsedTimeS + dt,
    trackSegmentIndex: state.trackSegmentIndex,
    status,
    failureCode,
    stallObservation,
  };
}

export function evaluateCourseCompletion(state: VehicleSimState, courseLengthM: number): VehicleSimState {
  if (state.status === 'running' && state.positionM >= courseLengthM) {
    return { ...state, status: 'finished' };
  }
  return state;
}

// Phase2 MVP専用の高レベルAPI。UIは毎フレームこれを1回呼ぶだけでよく、
// stepVehicle→evaluateCourseCompletionの呼び出し順を自前で組み立てる必要がない。
export function stepTestRun(
  motorConfig: MotorConfig,
  carConfig: CarConfig,
  state: VehicleSimState,
  dt: number,
  courseLengthM: number,
  rng: Rng = Math.random,
  slopeRad: number = 0,
): VehicleSimState {
  const next = stepVehicle(motorConfig, carConfig, state, dt, rng, slopeRad);
  return evaluateCourseCompletion(next, courseLengthM);
}
