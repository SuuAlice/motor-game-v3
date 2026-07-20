import {
  evaluateMotorFrame,
  advanceMotorState,
  computeJ,
  didCollapseJustHappen,
  isStaticFrictionClamped,
  computeElectricalState,
  computeMagneticTorque,
  computeCoggingTorque,
  computeCoggingPotential,
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
  BASE_STABILITY,
  K_STABILITY_GRIP,
  K_STABILITY_COM,
  K_STABILITY_MOUNT,
  DERAIL_DETECTION_TIME_S,
  C_ROUGHNESS,
  ROUGHNESS_BUMP_AMPLITUDE_M,
  ROUGHNESS_RIPPLE_DEPTH,
  ROUGHNESS_WAVELENGTH_M,
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
// 表記とすること(積み上げ100%表示をしない)。
//
// 「案B」(Phase3、Fable承認済み): 全バケットとも方向(前進/後退)を問わず常に
// 非負の値として計上する。driveJは「このフレームでE_total(=モーター回転運動
// エネルギー+車体並進運動エネルギー+コギング位置エネルギー+重力位置エネルギー。
// 「PE」はコギング位置エネルギーと重力位置エネルギーの両方を指す)が正味どれだけ
// 増えたか」の正の増分の累積とする(駆動力×速度の絶対値ではない)。重力位置
// エネルギーを含めることで、下り坂で重力PE→KEへ変換された分をdriveJ(駆動
// エネルギー)として誤計上しない(Suu監査で発見・修正)。これは、駆動力の仕事と
// heatJの抵抗散逸項が同一フレームで二重計上されることを避けるための設計
// (Fableレビュー条件2)。heatJ・brushLossJ・gearLossJ・slipLossJは方向に
// 依らず常に正しく計算できるため全フレームで計上する。
export interface EnergyBreakdown {
  driveJ: number; // E_total(コギングPE・重力PEを含む)の正の増分の累積(方向を問わない、常に≥0)
  gearLossJ: number;
  slipLossJ: number;
  brushLossJ: number; // ブラシ摩擦のみ(振動損失は含めない、heatJ側に計上する)
  heatJ: number; // 電気抵抗熱+機械的散逸熱(振動・転がり・空気・車輪ずれ・でこぼこ由来)の合計
}

// Phase2では原因を1つに断定するロジックを持たない(単一時点の観測では因果を
// 証明できないため)。原因分類・断定はPhase4診断モード以降で設計する。
// 'energyExhausted'はPhase3で追加(省エネコースのエネルギー予算超過による停止)。
export type FailureCode = 'failureToStart' | 'energyExhausted';

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
  derailDurationS: number; // コースアウト条件(a_lateral>a_limit)の継続時間
  // (DERAIL_DETECTION_TIME_S判定用、Phase3)。カーブでない区間では0にリセットする
  coilCollapsePenaltyMm: number; // コイル崩壊による軸ずれ相当の恒久ペナルティ(不可逆、0で開始)
  energyUsedJ: number;
  energyBreakdown: EnergyBreakdown;
  elapsedTimeS: number;
  trackSegmentIndex: number;
  status: 'ready' | 'running' | 'finished' | 'stalled' | 'derailed' | 'overheated';
  failureCode?: FailureCode;
  stallObservation?: StallObservation;
}

// Phase3: trackPhysics.tsのTrackSegmentから抽出し、1フレーム分の物理入力として
// stepVehicleへ渡す。全フィールド省略可能で、省略時はPhase2と完全に同じ挙動になる。
export interface TrackFrameInputs {
  surfaceGrip?: number; // 既定1。TrackSegment.surfaceGripをそのまま渡す
  curveRadiusM?: number; // 既定undefined(直線・コースアウト判定なし)
  roughness?: number; // 既定0
  allowReverse?: boolean; // 既定false
  forcePowerOff?: boolean; // 既定false。省エネコースのエネルギー予算超過時にtrue
}

const REUNION_VELOCITY_EPSILON_MPS = 0.01;
const STOP_VELOCITY_THRESHOLD_MPS = 0.005;

// spec §4.4: 車体に働く抵抗。F_vibrationはPhase2で新規追加(コイル崩壊由来の
// 走行抵抗、8節)。F_roughnessはPhase3で新規追加(でこぼこ道、spec §2.3)。
// すべて積分前(フレーム開始時点)のvelocityMps・omegaMotor・positionMを使う。
// exportする理由: テスト(axisOffsetMm>0のE_mech上界検証等)がstepVehicle内部と
// 全く同じ抵抗式を外部から再現する必要があるため(式を重複させず、この関数を
// 単一の正として共有する)。
export function computeResistances(
  carConfig: CarConfig,
  massKg: number,
  velocityMps: number,
  slopeRad: number,
  effectiveAxisOffsetMm: number,
  omegaMotor: number,
  roughness: number = 0,
  positionM: number = 0,
): { slope: number; roll: number; air: number; align: number; vibration: number; roughness: number; total: number } {
  const slope = -massKg * G * Math.sin(slopeRad);
  const roll = -Math.sign(velocityMps) * C_ROLL * massKg * G * (1 + carConfig.axleFriction);
  const air = -C_AIR * velocityMps * Math.abs(velocityMps);
  const align = -Math.sign(velocityMps) * C_ALIGN * carConfig.wheelAlignmentMm * Math.abs(velocityMps);
  // 常に運動方向に逆らう符号(velocityMps===0のときsign(0)=0でvibration=0)
  const vibration = -Math.sign(velocityMps) * K_VIB_DRAG * effectiveAxisOffsetMm * Math.abs(omegaMotor);

  // でこぼこ道(spec §2.3、Phase3新規): 車輪径が小さいほど同じ物理的な凹凸を
  // 乗り越えにくい(roughnessFactor、車輪径に対する凹凸の相対的な高さ)。
  // positionMベースの決定的な波動(ripple)で「デコボコを乗り越える」体感を
  // 表現する(乱数不使用、固定シードでの決定性を壊さない)。ROUGHNESS_RIPPLE_DEPTH
  // <1のため、rippleは常に正(1-depth>0)。roughness=0では0(既存Phase2の式と
  // 完全一致)。
  const wheelRadiusM = carConfig.wheelDiameterMm / 2000;
  const bumpAmplitudeM = ROUGHNESS_BUMP_AMPLITUDE_M * roughness;
  const roughnessFactor = bumpAmplitudeM / wheelRadiusM;
  const ripple = 1 + ROUGHNESS_RIPPLE_DEPTH * Math.sin((2 * Math.PI * positionM) / ROUGHNESS_WAVELENGTH_M);
  const roughnessResist = -Math.sign(velocityMps) * C_ROUGHNESS * roughnessFactor * massKg * G * ripple;

  return {
    slope,
    roll,
    air,
    align,
    vibration,
    roughness: roughnessResist,
    total: slope + roll + air + align + vibration + roughnessResist,
  };
}

// spec §4.5: 非空転を仮定した拘束系の角加速度から必要駆動力を逆算する
// (F_drive_required)。advanceMotorStateの静止摩擦クランプ判定式と完全に同一の
// 式でクランプ判定を行う(予測と本更新の判定が構造的に一致することを保証する)。
// exportする理由: 坂勾配の単調性テスト(Phase3)が、この関数を直接呼んで
// 代数的にF_drive_requiredの単調性を検証するため。
export function computeDriveForceRequired(
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
// 減らす向きに作用する(sign(slipVelocity)・F_grip_max)。この式は前進・後退を
// 問わず符号非依存に設計されている(Phase3でも無改修)。
//
// forcedSign: このフレームで新たに空転へ突入する場合に呼び出し側が渡す。突入
// 判定の直前はslipVelocityPreがちょうど0付近になり、浮動小数点誤差でsignが
// 不定になり得るため、突入の原因になったdriveForceRequired自体の符号
// (呼び出し側で算出)をそのまま使う。
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

    if (Math.abs(driveForceRequiredNext) <= gripMax) {
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
    derailDurationS: 0,
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
  trackInputs: TrackFrameInputs = {},
): VehicleSimState {
  // 終端状態の安定性: motorPhysics.step()の静止摩擦クランプと同じ早期returnパターン。
  // 自動再始動を構造的に禁止する。
  if (state.status === 'finished' || state.status === 'stalled' || state.status === 'derailed' || state.status === 'overheated') {
    return state;
  }

  const allowReverse = trackInputs.allowReverse ?? false;
  const surfaceGrip = trackInputs.surfaceGrip ?? 1;
  const roughness = trackInputs.roughness ?? 0;

  // コイル崩壊ペナルティを内部的に注入する(呼び出し元のmotorConfigは変更しない)
  const effectiveAxisOffsetMm = motorConfig.axisOffsetMm + state.coilCollapsePenaltyMm;
  const effectiveMotorConfig: MotorConfig = { ...motorConfig, axisOffsetMm: effectiveAxisOffsetMm };

  // 段階1: チャタリング確定済みの評価をこのフレームで1回だけ取得する(rng消費①)。
  // グリップ判定(下記)と本更新(advanceMotorState)の両方でこの同じevaluationを使う。
  // forcePowerOff(Phase3、省エネコースのエネルギー予算超過)はevaluateMotorFrame内で
  // current・tMag・shortedを一貫して0/falseにする(motorPhysics.ts側の単一の正)。
  const evaluation = evaluateMotorFrame(effectiveMotorConfig, state.motor, rng, trackInputs.forcePowerOff ?? false);

  const wheelRadius = carConfig.wheelDiameterMm / 2000; // mm→m、直径→半径
  const massKg = carConfig.massG / 1000;
  const gearRatio = carConfig.gearRatio;
  const eta = carConfig.gearEfficiency;
  const omegaMotorPre = state.motor.omega;
  const velocityMpsPre = state.velocityMps;

  const normalForce = massKg * G * Math.cos(slopeRad);
  const gripMax = (MU_TIRE_MIN + carConfig.tireGrip * (MU_TIRE_MAX - MU_TIRE_MIN)) * normalForce * surfaceGrip;

  const resist = computeResistances(carConfig, massKg, velocityMpsPre, slopeRad, effectiveAxisOffsetMm, omegaMotorPre, roughness, state.positionM);

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
  let evaluationForEnergyBreakdown: MotorFrameEvaluation = evaluation;
  let floorHeatJ = 0;

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

    // 空転中のv<0クランプは車体のみ(Fable条件1)。モーターとホイールは元々
    // 2自由度で車体と切り離されているため、車体速度だけを0へクランプしても
    // 拘束式を破らない。isSlipping・reunionDeferralStreak・モーター側は無変更。
    if (!allowReverse && nextVelocity < 0) {
      floorHeatJ = 0.5 * massKg * nextVelocity * nextVelocity;
      nextVelocity = 0;
    }
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

    if (Math.abs(driveForceRequired) <= gripMax) {
      // 非空転: 反射慣性J_effを注入し、反射抵抗をloadTorqueとして1自由度で更新する。
      // 絶対値比較(前進のオーバードライブだけでなく、後退方向のロックアップも
      // 同じ式で判定できるよう一般化。driveForceRequired>=0の既存Phase2構成では
      // |x|<=g ⟺ x<=g のため既存挙動は無変更)
      loadTorqueUsed = -tResistReflected;
      const nextMotorRaw = advanceMotorState(effectiveMotorConfig, state.motor, evaluation, dt, rng, loadTorqueUsed, jEff);
      const nextAxleOmegaRaw = nextMotorRaw.omega / gearRatio;
      const nextVelocityRaw = nextAxleOmegaRaw * wheelRadius;

      if (!allowReverse && nextVelocityRaw < 0) {
        // ラチェット保持(Fable条件1、5.7節): 車輪が外部機構(コース定義の
        // allowReverse=false)でω=0に固定されつつ電源には繋がったままの状態を、
        // 既存のexport関数だけで表現する(新規exportは不要)。
        // computeElectricalStateでω=0時の電気的状態(停動電流相当)を直接計算する
        const heldElectrical = computeElectricalState(effectiveMotorConfig, state.motor.theta, 0);
        const heldTMag = computeMagneticTorque(effectiveMotorConfig, heldElectrical, heldElectrical.current);
        const heldTCog = computeCoggingTorque(effectiveMotorConfig, state.motor.theta);
        const heldEvaluation: MotorFrameEvaluation = {
          current: heldElectrical.current,
          backEmf: heldElectrical.backEmf,
          tMag: heldTMag,
          tCog: heldTCog,
          shorted: heldElectrical.shorted,
          deadZone: heldElectrical.deadZone,
          chatterFramesLeft: 0,
        };
        // loadTorque=tMag+tCogとすることで、advanceMotorState内部の
        // isStaticFrictionClamped(|tMag+tCog-loadTorque|<=staticFrictionLimit)が
        // 差=0により構造的に必ず真になり、advanceMotorState自身の静止摩擦
        // クランプ経路(電池発熱・ワニス崩壊判定・rpm平滑化を含む既存ロジック)を
        // 確実に通る(新規ロジックの重複実装を避ける)
        nextMotor = advanceMotorState(effectiveMotorConfig, { ...state.motor, omega: 0 }, heldEvaluation, dt, rng, heldTMag + heldTCog);
        nextVelocity = 0;
        isSlipping = false;
        driveForceActual = 0;
        loadTorqueUsed = 0;
        evaluationForEnergyBreakdown = heldEvaluation; // このフレームで実際に起きたこと
        // (ラチェットに保持され停動電流が流れた)をenergyBreakdownへ反映する
        // ラチェット発動直前(=通常どおり積分していたら得られたはずの)力学的
        // エネルギーの消失分。定常状態(前フレームも保持中でnextMotorRawの
        // omegaが既に0近傍)では自然に0近くなり、二重計上しない
        floorHeatJ = 0.5 * jMotor * nextMotorRaw.omega * nextMotorRaw.omega + 0.5 * massKg * nextVelocityRaw * nextVelocityRaw;
      } else {
        nextMotor = nextMotorRaw;
        nextVelocity = nextVelocityRaw;
        isSlipping = false;
        driveForceActual = driveForceRequired;
      }
    } else {
      // このフレームで新たに空転へ入る。継続時と同一のrunSlipStepを使う
      // (空転積分ロジックの重複を避ける)。forcedSignは突入の原因になった
      // driveForceRequired自体の符号から決める(前進オーバードライブなら+1、
      // 後退方向のロックアップなら-1。slipVelocityPreがちょうど0付近で
      // 符号不定になるため、この判定式の符号を代わりに使う)。
      const forcedSign = (Math.sign(driveForceRequired) || 1) as 1 | -1;
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
        forcedSign,
      );
      nextMotor = result.motor;
      nextVelocity = result.velocityMps;
      isSlipping = result.isSlipping;
      driveForceActual = result.fContact;
      loadTorqueUsed = result.loadTorqueUsed;
      slipLossJOngoing = result.slipLossJOngoing;
      slipLossJReunion = result.slipLossJReunion;
      nextReunionDeferralStreak = result.reunionDeferralStreak;

      // 空転中のv<0クランプは車体のみ(Fable条件1、上記と同じ扱い)
      if (!allowReverse && nextVelocity < 0) {
        floorHeatJ = 0.5 * massKg * nextVelocity * nextVelocity;
        nextVelocity = 0;
      }
    }
  }

  // コイル崩壊: 不可逆ペナルティをVehicleSimState内部で保持する(呼び出し元の
  // MotorConfigは変更しない、spec §4.1「崩壊した瞬間に振動抵抗として現れる」を
  // stepVehicle単体で満たす)
  const justCollapsed = didCollapseJustHappen(state.motor, nextMotor);
  const nextCoilCollapsePenaltyMm = justCollapsed ? state.coilCollapsePenaltyMm + COIL_DEFORM_PENALTY_MM : state.coilCollapsePenaltyMm;

  // energyBreakdown(5分類、表示用近似。「案B」Fableレビュー条件2で承認済みの設計)
  const energyUsedJIncrement = motorConfig.batteryVoltage * evaluationForEnergyBreakdown.current * dt;

  // driveJ: E_total(モーター回転運動エネルギー+車体並進運動エネルギー+コギング
  // 位置エネルギー+重力位置エネルギー)の正の増分の累積。フレーム終了時点の
  // 最終確定値(ラチェット保持・空転クランプの結果を含む)を使うため、held状態
  // (ω・v・θとも不変)では自動的に0になる(特別扱い不要)。
  //
  // 重力位置エネルギー項(指摘1、Suu監査で発見): 当初E_mechにこの項を含めておらず、
  // 下り坂で重力PE→KEへの変換をdriveJ(駆動エネルギー)として誤計上していた
  // (motorが仕事をしていないのに、重力による加速をdriveJとして計上するバグ)。
  // stepVehicleはslopeRadを1フレーム分の局所的な勾配として受け取るため、
  // このフレームの変位(nextVelocity・dt)とslopeRadだけから、
  // trackPhysics.tsのcomputeElevationAtを介さずにこのフレーム分の重力PE増分を
  // 直接計算できる(複数区間をまたぐフレームでも、既存のF_slope計算と同じ
  // 「フレーム開始区間の勾配をこのフレーム全体へ適用する」という規約と整合する)
  const peGravityIncrement = massKg * G * (nextVelocity * dt) * Math.sin(slopeRad);
  const eMechBefore =
    0.5 * jMotor * omegaMotorPre * omegaMotorPre +
    0.5 * massKg * velocityMpsPre * velocityMpsPre +
    computeCoggingPotential(effectiveMotorConfig, state.motor.theta);
  const eMechAfter =
    0.5 * jMotor * nextMotor.omega * nextMotor.omega +
    0.5 * massKg * nextVelocity * nextVelocity +
    computeCoggingPotential(effectiveMotorConfig, nextMotor.theta);
  const driveJIncrement = Math.max(0, eMechAfter + peGravityIncrement - eMechBefore);

  const pMech = evaluationForEnergyBreakdown.backEmf * evaluationForEnergyBreakdown.current;
  const gearLossJIncrement = Math.abs(pMech) * (1 - eta) * dt;

  const heatJIncrement =
    (motorConfig.batteryVoltage - evaluationForEnergyBreakdown.backEmf) * evaluationForEnergyBreakdown.current * dt +
    Math.abs(resist.roll * velocityMpsPre) * dt +
    Math.abs(resist.air * velocityMpsPre) * dt +
    Math.abs(resist.align * velocityMpsPre) * dt +
    Math.abs(resist.roughness * velocityMpsPre) * dt +
    Math.abs(resist.vibration * velocityMpsPre) * dt +
    floorHeatJ;

  const brushLossJIncrement = MU_BRUSH * motorConfig.brushPressure * Math.abs(omegaMotorPre) * dt;
  const slipLossJIncrement = slipLossJOngoing + slipLossJReunion;

  const nextPositionM = state.positionM + nextVelocity * dt;
  const nextAccelerationMps2 = (nextVelocity - velocityMpsPre) / dt;
  const nextAxleOmegaField = nextMotor.omega / gearRatio;
  const finalWheelSurfaceSpeed = (nextMotor.omega / gearRatio) * wheelRadius;
  // slipRatioは方向非依存(絶対値ベース)。前進・後退どちらの空転でも正しく
  // 非零の値を計上する(Phase3、修正前は後退方向のロックアップ空転が常に0表示になる
  // 不整合があった)
  const nextSlipRatio = isSlipping
    ? Math.min(1, Math.max(0, Math.abs(finalWheelSurfaceSpeed - nextVelocity) / Math.max(Math.abs(finalWheelSurfaceSpeed), 1e-6)))
    : 0;

  // 完全停止検出とstalled遷移(spec §7.2)
  const stopped = Math.abs(nextVelocity) < STOP_VELOCITY_THRESHOLD_MPS && Math.abs(nextMotor.omega) < OMEGA_EPS;
  const nextStalledDurationS = stopped ? state.stalledDurationS + dt : 0;

  // カーブ・コースアウト判定(spec §4.7、Phase3新規)。curveRadiusMが未指定または
  // 非正の区間は「カーブなし」として判定自体をスキップする(0除算・符号反転を防ぐ)
  const hasCurve = trackInputs.curveRadiusM !== undefined && trackInputs.curveRadiusM > 0;
  let nextDerailDurationS = 0;
  if (hasCurve) {
    const normalForceFactor = Math.cos(slopeRad);
    const gripBonus = K_STABILITY_GRIP * carConfig.tireGrip * surfaceGrip;
    const centerOfMassPenalty = K_STABILITY_COM * carConfig.centerOfMassHeightMm;
    const mountOffsetPenalty = K_STABILITY_MOUNT * carConfig.motorMountOffsetMm;
    const aLimit = Math.max(0, G * normalForceFactor * (BASE_STABILITY + gripBonus - centerOfMassPenalty - mountOffsetPenalty));
    const aLateral = (nextVelocity * nextVelocity) / trackInputs.curveRadiusM!;
    nextDerailDurationS = aLateral > aLimit ? state.derailDurationS + dt : 0;
  }

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
  } else if (hasCurve && nextDerailDurationS >= DERAIL_DETECTION_TIME_S) {
    status = 'derailed';
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
    derailDurationS: nextDerailDurationS,
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
