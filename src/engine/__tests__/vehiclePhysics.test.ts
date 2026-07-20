// spec docs/spec.md §10「Phase 2: 車体物理+テスト走行MVP」の受け入れ基準(14項目)
// に対応するテスト。既存のmotorPhysics系テスト(71件)・motorPhysicsSplitApi.test.ts
// (8件)は無編集。
import { describe, expect, it } from 'vitest';
import {
  computeResistances,
  createInitialVehicleState,
  evaluateCourseCompletion,
  stepTestRun,
  stepVehicle,
  type CarConfig,
  type VehicleSimState,
} from '../vehiclePhysics';
import {
  computeCoggingPotential,
  computeJ,
  computeOmegaDynamics,
  didCollapseJustHappen,
  evaluateMotorFrame,
  isStaticFrictionClamped,
  type MotorConfig,
  type SimState,
} from '../motorPhysics';
import { BATTERY_HEAT_LIMIT, COIL_DEFORM_FRAMES, COIL_DEFORM_OMEGA, G, K_VIB, MU_TIRE_MAX, MU_TIRE_MIN } from '../constants';
import { mulberry32 } from './prng';

const DT = 1 / 120;

function goodMotorConfig(overrides: Partial<MotorConfig> = {}): MotorConfig {
  return {
    coilTurns: 80,
    slitWidthMm: 1.5,
    sandingQuality: 0.9,
    brushPressure: 0.3,
    magnetStrength: 1.0,
    magnetDistanceMm: 10,
    batteryVoltage: 3.0,
    axisOffsetMm: 0,
    ...overrides,
  };
}

function standardCarConfig(overrides: Partial<CarConfig> = {}): CarConfig {
  return {
    massG: 150,
    gearRatio: 4,
    gearEfficiency: 0.8,
    wheelDiameterMm: 30,
    tireGrip: 0.7,
    axleFriction: 0,
    wheelAlignmentMm: 0,
    centerOfMassHeightMm: 20,
    motorMountOffsetMm: 0,
    ...overrides,
  };
}

function runSteps(
  motorConfig: MotorConfig,
  carConfig: CarConfig,
  state: VehicleSimState,
  steps: number,
  rng: () => number,
): VehicleSimState {
  let s = state;
  for (let i = 0; i < steps; i++) {
    s = stepVehicle(motorConfig, carConfig, s, DT, rng);
  }
  return s;
}

describe('Phase2受け入れ基準#1: 適正モーター+標準車体で10mを完走する', () => {
  it('30秒以内にstatusがfinishedになる', () => {
    const motorConfig = goodMotorConfig();
    const carConfig = standardCarConfig();
    const rng = mulberry32(1);
    let state = createInitialVehicleState(motorConfig, carConfig);
    const maxSteps = 120 * 30;
    let steps = 0;
    while (state.status !== 'finished' && state.status !== 'stalled' && state.status !== 'overheated' && steps < maxSteps) {
      state = stepTestRun(motorConfig, carConfig, state, DT, 10, rng);
      steps += 1;
    }
    expect(state.status).toBe('finished');
    expect(state.positionM).toBeGreaterThanOrEqual(10);
  });
});

describe('Phase2受け入れ基準#2: ギヤ比を上げると初期加速度が増え、無負荷最高速が下がる', () => {
  it('gearRatio=3はgearRatio=1より初期加速度が大きく、定常速度は小さい', () => {
    // 反射慣性J_eff=J_motor+massKg・r²/(G²・η)の「massKg・r²/(G²・η)」項が
    // モーター自身の慣性(J_motor)に対して有意な大きさを持つ場合にのみ、ギヤ比を
    // 上げる(=反射慣性を減らす)ことで角加速度が増え、初期加速度が増すという
    // spec §11の設計目標が成立する(J_motorが支配的な軽量構成では、ギヤ比を
    // 上げてもv=ω/G・rの分母が大きくなる効果の方が勝り、逆に加速度が下がる
    // 場合があることを数値実験で確認した)。標準構成より重く車輪の大きい構成で検証する
    const motorConfig = goodMotorConfig();
    const carLow = standardCarConfig({ gearRatio: 1, massG: 250, wheelDiameterMm: 50 });
    const carHigh = standardCarConfig({ gearRatio: 3, massG: 250, wheelDiameterMm: 50 });
    const rngLow = mulberry32(2);
    const rngHigh = mulberry32(2);

    // 押し出し初速(START_PUSH_VELOCITY_MPS)はgearRatioに応じて初期motor.omegaが
    // 変わってしまい(motorOmega=v・gearRatio/wheelRadius)、両条件の比較の土台が
    // 揃わない。代わりに同一のmotor.omega(低回転域、後輪起電力の影響が小さい状態)
    // から出発させ、初期加速度を比較する
    const motorOmega = 5; // rad/s
    const motor: SimState = {
      theta: Math.PI / 4, omega: motorOmega, current: 0, backEmf: 0, shorted: false,
      running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0,
    };
    let stateLow: VehicleSimState = {
      ...createInitialVehicleState(motorConfig, carLow),
      motor,
      velocityMps: (motorOmega / carLow.gearRatio) * (carLow.wheelDiameterMm / 2000),
    };
    let stateHigh: VehicleSimState = {
      ...createInitialVehicleState(motorConfig, carHigh),
      motor,
      velocityMps: (motorOmega / carHigh.gearRatio) * (carHigh.wheelDiameterMm / 2000),
    };

    stateLow = stepVehicle(motorConfig, carLow, stateLow, DT, rngLow);
    stateHigh = stepVehicle(motorConfig, carHigh, stateHigh, DT, rngHigh);
    expect(stateHigh.accelerationMps2).toBeGreaterThan(stateLow.accelerationMps2);

    // 無負荷最高速(定常走行速度)の比較は、同条件で十分長く走らせて確認する
    let steadyLow = createInitialVehicleState(motorConfig, carLow);
    let steadyHigh = createInitialVehicleState(motorConfig, carHigh);
    const rngSteadyLow = mulberry32(20);
    const rngSteadyHigh = mulberry32(20);
    steadyLow = runSteps(motorConfig, carLow, steadyLow, 120 * 20, rngSteadyLow);
    steadyHigh = runSteps(motorConfig, carHigh, steadyHigh, 120 * 20, rngSteadyHigh);
    expect(steadyHigh.velocityMps).toBeLessThan(steadyLow.velocityMps);
  });
});

describe('Phase2受け入れ基準#3: 車輪径を上げると同じ車軸回転数で速度が増え、駆動力が下がる', () => {
  it('wheelDiameterMm=40はwheelDiameterMm=20より同一motor.omega条件下でvelocityMpsが大きい', () => {
    const motorConfig = goodMotorConfig();
    const carSmallWheel = standardCarConfig({ wheelDiameterMm: 20 });
    const carLargeWheel = standardCarConfig({ wheelDiameterMm: 40 });
    const motorOmega = 200; // rad/s、代表的な回転数を直接与える(シミュレーション経由の同期に依存しない)
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
    const baseState: VehicleSimState = {
      ...createInitialVehicleState(motorConfig, carSmallWheel),
      motor,
      velocityMps: (motorOmega / carSmallWheel.gearRatio) * (carSmallWheel.wheelDiameterMm / 2000),
    };

    const rngSmall = mulberry32(3);
    const rngLarge = mulberry32(3);
    const smallWheelState = stepVehicle(motorConfig, carSmallWheel, baseState, DT, rngSmall);
    const largeWheelBaseState: VehicleSimState = {
      ...baseState,
      velocityMps: (motorOmega / carLargeWheel.gearRatio) * (carLargeWheel.wheelDiameterMm / 2000),
    };
    const largeWheelState = stepVehicle(motorConfig, carLargeWheel, largeWheelBaseState, DT, rngLarge);

    // 同一のmotor.omegaから出発しているため、axleOmega=motor.omega/gearRatioは
    // ほぼ同一(1ステップの積分による微小差のみ)。v=axleOmega・wheelRadiusにより
    // 車輪径が大きいほどvelocityMpsが大きくなることを確認する
    expect(largeWheelState.velocityMps).toBeGreaterThan(smallWheelState.velocityMps);
    // 同一トルク源から見て、車輪径が大きいほど地面を押す力(駆動力)は下がる
    expect(largeWheelState.driveForceN).toBeLessThan(smallWheelState.driveForceN);
  });
});

describe('Phase2受け入れ基準#4: 質量を増やすと同じ駆動力で加速度が下がる', () => {
  it('massG=250はmassG=100より初期加速度が小さい', () => {
    const motorConfig = goodMotorConfig();
    const carLight = standardCarConfig({ massG: 100 });
    const carHeavy = standardCarConfig({ massG: 250 });
    const rngLight = mulberry32(4);
    const rngHeavy = mulberry32(4);

    const stateLight = stepVehicle(motorConfig, carLight, createInitialVehicleState(motorConfig, carLight), DT, rngLight);
    const stateHeavy = stepVehicle(motorConfig, carHeavy, createInitialVehicleState(motorConfig, carHeavy), DT, rngHeavy);

    expect(stateHeavy.accelerationMps2).toBeLessThan(stateLight.accelerationMps2);
  });
});

describe('Phase2受け入れ基準#5: グリップ限界を超えると空転率が増え、駆動力は上限を超えない', () => {
  it('低グリップ構成でisSlippingが発生し、driveForceNの大きさがF_grip_maxを超えない', () => {
    // 標準構成では反射慣性(J_eff)が支配的でグリップ限界に達しないため、強トルク
    // (coilTurns最大・磁石最接近)×グリップ下限(tireGrip=0)の組み合わせで空転を誘発する
    const motorConfig = goodMotorConfig({ coilTurns: 150, magnetDistanceMm: 2 });
    const carConfig = standardCarConfig({ tireGrip: 0 });
    const rng = mulberry32(5);
    let state = createInitialVehicleState(motorConfig, carConfig);
    const massKg = carConfig.massG / 1000;
    const normalForce = massKg * G;
    const gripMax = (MU_TIRE_MIN + carConfig.tireGrip * (MU_TIRE_MAX - MU_TIRE_MIN)) * normalForce;

    let sawSlip = false;
    for (let i = 0; i < 120 * 3; i++) {
      state = stepVehicle(motorConfig, carConfig, state, DT, rng);
      if (state.isSlipping) sawSlip = true;
      // 案X(接地摩擦の符号付き方式)導入後、driveForceNは符号付き(車体側が
      // ホイールを追い越した場合は負)になり得る。上限は大きさ(絶対値)で判定する
      expect(Math.abs(state.driveForceN)).toBeLessThanOrEqual(gripMax + 1e-6);
    }
    expect(sawSlip).toBe(true);
  });
});

describe('Phase2受け入れ基準#6: 非空転中は全ステップでv=(ω_motor/gearRatio)・wheelRadiusが成立する', () => {
  it('拘束式が許容誤差内で成立する', () => {
    const motorConfig = goodMotorConfig();
    const carConfig = standardCarConfig();
    const rng = mulberry32(1);
    let state = createInitialVehicleState(motorConfig, carConfig);
    const wheelRadius = carConfig.wheelDiameterMm / 2000;
    for (let i = 0; i < 120 * 5; i++) {
      state = stepVehicle(motorConfig, carConfig, state, DT, rng);
      if (!state.isSlipping) {
        const expectedV = (state.motor.omega / carConfig.gearRatio) * wheelRadius;
        expect(state.velocityMps).toBeCloseTo(expectedV, 6);
      }
    }
  });
});

describe('Phase2受け入れ基準#7: 非空転の定常走行でモーター角速度と車速の数値振動が発生しない', () => {
  it('コギングリップル(spec §4.6で許容される脈動)を超える発散・破綻が起きない', () => {
    // spec §4.6はコギングによる速度脈動の存在自体を許容している(「坂道の低速域では、
    // コギングによる速度脈動が計測パネルの速度波形に見える」)。したがって本テストは
    // 「揺らぎがゼロ」ではなく「発散・不安定振動(数値的破綻)が起きない」ことを、
    // 移動平均からの乖離が一定範囲に収まることで確認する
    const motorConfig = goodMotorConfig();
    const carConfig = standardCarConfig();
    const rng = mulberry32(1);
    let state = createInitialVehicleState(motorConfig, carConfig);
    state = runSteps(motorConfig, carConfig, state, 120 * 20, rng); // 十分に加速させた区間で確認する

    const windowSize = 12;
    const velocities: number[] = [];
    for (let i = 0; i < 120 * 5; i++) {
      state = stepVehicle(motorConfig, carConfig, state, DT, rng);
      expect(Number.isFinite(state.velocityMps)).toBe(true);
      expect(Number.isFinite(state.motor.omega)).toBe(true);
      velocities.push(state.velocityMps);
    }

    for (let i = windowSize; i < velocities.length; i++) {
      const window = velocities.slice(i - windowSize, i);
      const mean = window.reduce((a, b) => a + b, 0) / windowSize;
      // 移動平均からの乖離が平均値の30%(コギングリップルの範囲)を超えない
      expect(Math.abs(velocities[i] - mean)).toBeLessThan(Math.max(0.3 * Math.abs(mean), 0.02));
    }
  });
});

describe('Phase2受け入れ基準#8: 空転開始・再結合境界で速度不連続なし・総エネルギー非増加', () => {
  // 修正方針2(2026-07-19承認): E_mech厳密不変条件はactualな空転→再結合境界で
  // 検証しなければならず、「離散化誤差があるので別の緩いテストに置き換える」ことは
  // 許されない。そこで本テストは、離散化誤差が無視できる弱コギング構成
  // (magnetDistanceMm=10、既定値)のまま、isSlipping===trueかつ実際にホイールが
  // 車体より速く回っている(=物理的に整合した)空転状態を直接構築し、そこから
  // 自然に発生する再結合の瞬間を含めてE_mechを毎ステップ検証する。
  //
  // 案X(接地摩擦の符号付き方式、2026-07-20承認)適用後は、tireGrip=0でも
  // gripMaxが有限(MU_TIRE_MIN由来)なため、この構成では数ステップで自然に
  // 再結合に至る(強制的なtireGrip切り替えを要しない)。
  it('弱コギング構成で直接構築した空転状態から、再結合境界を含め速度連続性・E_mech非増加・slipLossJ非負性が成立する', () => {
    const motorConfig = goodMotorConfig({ axisOffsetMm: 0, coilTurns: 150 }); // magnetDistanceMm=10(既定、弱コギング)
    const carConfig = standardCarConfig({ tireGrip: 0 });
    const jMotor = computeJ(motorConfig);
    const massKg = carConfig.massG / 1000;
    const wheelRadius = carConfig.wheelDiameterMm / 2000;

    // 物理的に整合した空転状態を直接構築する: モーターがホイール表面速度換算で
    // 車体よりはるかに速く回っている(古典的なオーバードライブ空転の状態)
    const motorOmega = 150; // rad/s
    const motor: SimState = {
      theta: Math.PI / 4, omega: motorOmega, current: 0, backEmf: 0, shorted: false,
      running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0,
    };
    let state: VehicleSimState = {
      ...createInitialVehicleState(motorConfig, carConfig),
      motor,
      velocityMps: 0.02,
      isSlipping: true,
    };

    const rng = mulberry32(8);
    let prevEMech =
      0.5 * jMotor * state.motor.omega * state.motor.omega +
      0.5 * massKg * state.velocityMps * state.velocityMps +
      computeCoggingPotential(motorConfig, state.motor.theta);
    let prevV = state.velocityMps;
    let wasSlipping = false;
    let sawReunion = false;
    let maxDeferralStreak = 0;

    for (let i = 0; i < 120 * 3; i++) {
      const before = state;
      if (before.isSlipping) wasSlipping = true;
      state = stepVehicle(motorConfig, carConfig, state, DT, rng);

      // E_mech厳密不変条件(コギング位置エネルギー込み)。弱コギングのため
      // 離散化誤差は無視できる
      const eMech =
        0.5 * jMotor * state.motor.omega * state.motor.omega +
        0.5 * massKg * state.velocityMps * state.velocityMps +
        computeCoggingPotential(motorConfig, state.motor.theta);
      const batteryInputThisStep = motorConfig.batteryVoltage * state.motor.current * DT;
      expect(eMech).toBeLessThanOrEqual(prevEMech + batteryInputThisStep + 1e-6);

      // 速度連続性: 承認済み計画どおり、再結合境界(before.isSlipping&&!isSlipping)
      // で|ΔvelocityMps|<0.05m/sを厳密にassertする。加えて、拘束式
      // v=(ω_motor/gearRatio)・wheelRadiusが再結合直後に成立し、モーター角速度が
      // 車体速度と矛盾しない値へ揃えられていることを確認する
      expect(Number.isFinite(state.velocityMps)).toBe(true);
      if (before.isSlipping && !state.isSlipping) {
        sawReunion = true;
        expect(Math.abs(state.velocityMps - prevV)).toBeLessThan(0.05);
        const expectedV = (state.motor.omega / carConfig.gearRatio) * wheelRadius;
        expect(state.velocityMps).toBeCloseTo(expectedV, 6);
      }

      expect(state.energyBreakdown.slipLossJ).toBeGreaterThanOrEqual(0);
      maxDeferralStreak = Math.max(maxDeferralStreak, state.reunionDeferralStreak); // 内部フィールドを直接観測する(修正方針3)

      prevEMech = eMech;
      prevV = state.velocityMps;
    }

    expect(wasSlipping).toBe(true);
    expect(sawReunion).toBe(true);
    expect(maxDeferralStreak).toBeLessThan(120); // 発火時は実装を止めて報告する対象
  });

  // 強コギング構成(magnetDistanceMm=2)は、既知の半陰的Euler離散化誤差
  // (docs/handoff.md参照、電池入力0・非空転・減速中でもE_mechが最大約0.8%
  // 超過しうる)があるため、上記のE_mech厳密検証の代替にはしない
  // (修正方針6)。この構成は速度連続性・slipLossJ非負性・120フレーム延期
  // ガードの回帰確認のみに用いる
  it('(強コギング構成・既知の離散化誤差を含む)グリップ回復による再結合でも速度連続性・slipLossJ非負性・延期ガードは成立する', () => {
    const motorConfig = goodMotorConfig({ axisOffsetMm: 0, coilTurns: 150, magnetDistanceMm: 2 });
    const rng = mulberry32(8);

    let carConfig = standardCarConfig({ tireGrip: 0 });
    let state = createInitialVehicleState(motorConfig, carConfig);
    let wasSlipping = false;
    let steps = 0;
    while (!state.isSlipping && steps < 120) {
      state = stepVehicle(motorConfig, carConfig, state, DT, rng);
      steps += 1;
    }
    wasSlipping = state.isSlipping;

    let sawReunion = false;
    let maxDeferralStreak = 0;
    let prevV = state.velocityMps;

    // 空転中にグリップを回復させ再結合を誘発する。tireGrip=0.8では
    // F_grip_max由来の1フレームあたりの車体加速度(massKg=0.15kgに対し
    // 約7.6m/s²、Δv=carAccel・dt≈0.064m/s)がそれ自体で0.05m/sを上回り、
    // 再結合境界かどうかに関わらずどのフレームでも閾値を超えてしまうため、
    // 境界でのΔvが0.05m/s未満に収まるtireGrip=0.4を使う(閾値は緩めず、
    // 閾値を満たせる回復グリップ値を選定した)
    carConfig = standardCarConfig({ tireGrip: 0.4 });
    for (let i = 0; i < 120 * 3; i++) {
      const before = state;
      state = stepVehicle(motorConfig, carConfig, state, DT, rng);

      expect(Number.isFinite(state.velocityMps)).toBe(true);
      expect(state.energyBreakdown.slipLossJ).toBeGreaterThanOrEqual(0);

      if (before.isSlipping && !state.isSlipping) {
        sawReunion = true;
        expect(Math.abs(state.velocityMps - prevV)).toBeLessThan(0.05);
      }
      maxDeferralStreak = Math.max(maxDeferralStreak, state.reunionDeferralStreak); // 内部フィールドを直接観測する(修正方針3)
      prevV = state.velocityMps;
    }

    expect(wasSlipping).toBe(true);
    expect(sawReunion).toBe(true);
    expect(maxDeferralStreak).toBeLessThan(120); // 発火時は実装を止めて報告する対象
  });
});

describe('Phase2受け入れ基準#9: モーター停止時に前進・逆走しない(走行→停止境界を含む)', () => {
  it('弱いモーター構成で自然減速して停止した後、velocityMpsが変化しない', () => {
    const motorConfig = goodMotorConfig({ coilTurns: 15, magnetStrength: 0.2 });
    const carConfig = standardCarConfig();
    const rng = mulberry32(9);
    let state = createInitialVehicleState(motorConfig, carConfig);
    state = runSteps(motorConfig, carConfig, state, 120 * 10, rng);

    // 自然減速により停止していることを確認したうえで、さらに継続して逆走しないことを検証する
    expect(Math.abs(state.velocityMps)).toBeLessThan(0.01);

    for (let i = 0; i < 120 * 3; i++) {
      state = stepVehicle(motorConfig, carConfig, state, DT, rng);
      expect(Math.abs(state.velocityMps)).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('Phase2受け入れ基準#10: 磁石標準距離では押し出しでデッドポイントから発進できる', () => {
  it('magnetDistanceMm=15で押し出し後、positionMが明確に前進する', () => {
    const motorConfig = goodMotorConfig({ magnetDistanceMm: 15 });
    const carConfig = standardCarConfig();
    const rng = mulberry32(10);
    let state = createInitialVehicleState(motorConfig, carConfig);
    const startPosition = state.positionM;
    state = runSteps(motorConfig, carConfig, state, 120 * 5, rng);

    expect(state.status).not.toBe('stalled');
    expect(state.positionM - startPosition > 0.05 || state.velocityMps > 0.01).toBe(true);
  });
});

describe('Phase2受け入れ基準#11・#12: 磁石近接帯での発進失敗とstalled後の自動再始動なし', () => {
  it('近接帯+弱トルク+削り残しでstalledになりfailureCode=failureToStartが記録され、以後変化しない', () => {
    // 強コギング帯(magnetDistanceMm最小)×弱トルク(coilTurns最小)×高い接触抵抗
    // (sandingQuality低)の組み合わせで、発進不能かつ過熱もしない「純粋な発進失敗」
    // を再現する(brushPressureを高くすると停動電流が増え先にoverheatedになるため
    // 中程度の値にとどめる)
    const motorConfig = goodMotorConfig({ magnetDistanceMm: 2, coilTurns: 10, magnetStrength: 1.0, brushPressure: 0.5, sandingQuality: 0.1 });
    const carConfig = standardCarConfig();
    const rng = mulberry32(11);
    let state = createInitialVehicleState(motorConfig, carConfig);

    const maxSteps = 120 * 5; // 押し出しからの自然減速+STALL_DETECTION_TIME_Sの猶予を含む
    let steps = 0;
    while (state.status !== 'stalled' && steps < maxSteps) {
      state = stepVehicle(motorConfig, carConfig, state, DT, rng);
      steps += 1;
    }
    expect(state.status).toBe('stalled');
    expect(state.failureCode).toBe('failureToStart');

    const velocityAtStall = state.velocityMps;
    const omegaAtStall = state.motor.omega;
    for (let i = 0; i < 120 * 3; i++) {
      state = stepVehicle(motorConfig, carConfig, state, DT, rng);
    }
    expect(state.status).toBe('stalled');
    expect(state.velocityMps).toBe(velocityAtStall);
    expect(state.motor.omega).toBe(omegaAtStall);
  });
});

describe('Phase2受け入れ基準#13: 短絡時は完走せず、発熱でoverheatedになる', () => {
  it('slitWidthMm=0でbatteryHeatが上限に到達しoverheatedになる', () => {
    const motorConfig = goodMotorConfig({ slitWidthMm: 0 });
    const carConfig = standardCarConfig();
    const rng = mulberry32(13);
    let state = createInitialVehicleState(motorConfig, carConfig);
    let steps = 0;
    while (state.status !== 'overheated' && steps < 600) {
      state = stepVehicle(motorConfig, carConfig, state, DT, rng);
      steps += 1;
    }
    expect(state.status).toBe('overheated');
    expect(state.motor.batteryHeat).toBe(BATTERY_HEAT_LIMIT);
  });
});

describe('Phase2受け入れ基準#14: 無ワニス構成が高回転域でコイル崩壊し、走行中の振動抵抗が増える', () => {
  it('崩壊後、varnished:falseの走行速度がvarnished:true基準より明確に低くなる', () => {
    // 標準的な駆動条件では、反射慣性のもとでの定常回転数がCOIL_DEFORM_OMEGA(約束
    // 2000RPM相当)に達しない(motorPhysicsV15.test.tsのモーター単体基準と同じ
    // 目安)。既存のモーター単体コイル崩壊テストと同じ考え方で、押し出し直後に
    // 高回転から開始する構成で検証する。brushPressure=0.3・初期axisOffsetMm=0は
    // 承認済み計画どおりの値を使う(修正方針5: brushPressureを緩めて0.05にする
    // 代替は不承認)。brushPressure=0.3はブラシ摩擦制動が強く減速が速いため、
    // COIL_DEFORM_FRAMES=360フレームの間閾値を上回り続けられるよう、初期回転数の
    // 倍率をCOIL_DEFORM_OMEGA×3から×5へ引き上げて検証した(数値実験により
    // ×3・×4では360フレーム未満で閾値を下回り崩壊しないことを確認済み。
    // brushPressure・初期axisOffsetMm以外の、承認範囲外に固定されていないパラメータ
    // のみを調整しており、要求そのものを緩めてはいない)
    const motorConfigCollapsing = goodMotorConfig({ varnished: false, brushPressure: 0.3, magnetDistanceMm: 5, axisOffsetMm: 0 });
    const motorConfigBaseline = goodMotorConfig({ varnished: true, brushPressure: 0.3, magnetDistanceMm: 5, axisOffsetMm: 0 });
    const carConfig = standardCarConfig({ massG: 80, tireGrip: 1.0, gearRatio: 1.0 });
    const wheelRadius = carConfig.wheelDiameterMm / 2000;
    const highOmega = COIL_DEFORM_OMEGA * 5;

    const rngCollapsing = mulberry32(14);
    const rngBaseline = mulberry32(14);
    const initialFor = (motorConfig: MotorConfig): VehicleSimState => ({
      ...createInitialVehicleState(motorConfig, carConfig),
      motor: {
        theta: Math.PI / 4, omega: highOmega, current: 0, backEmf: 0, shorted: false,
        running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0,
      },
      velocityMps: (highOmega / carConfig.gearRatio) * wheelRadius,
    });
    let stateCollapsing = initialFor(motorConfigCollapsing);
    let stateBaseline = initialFor(motorConfigBaseline);

    let collapsedAt = -1;
    const totalSteps = COIL_DEFORM_FRAMES + 180;
    for (let i = 0; i < totalSteps; i++) {
      const prevMotor = stateCollapsing.motor;
      stateCollapsing = stepVehicle(motorConfigCollapsing, carConfig, stateCollapsing, DT, rngCollapsing);
      stateBaseline = stepVehicle(motorConfigBaseline, carConfig, stateBaseline, DT, rngBaseline);
      if (collapsedAt < 0 && didCollapseJustHappen(prevMotor, stateCollapsing.motor)) {
        collapsedAt = i;
      }
    }

    expect(collapsedAt).toBeGreaterThanOrEqual(0);
    expect(stateCollapsing.coilCollapsePenaltyMm).toBeGreaterThan(0);
    expect(stateCollapsing.velocityMps).toBeLessThan(stateBaseline.velocityMps * 0.9);
  });
});

describe('Phase2受け入れ基準: axisOffsetMm>0構成でのE_mech増加率が解析的上界以下である(Fableレビュー条件(e)、修正方針4)', () => {
  it('近似omegaPreではなくcomputeOmegaDynamics由来の真の値からE_mech上界を導出し、各ステップで超えない', () => {
    // 上界の導出: vibrationNoiseは(rng()*2-1)*vibrationを注入し、|注入値|<=vibration=
    // K_VIB・axisOffsetMm・omegaDynamics²(omegaDynamicsは軸ずれ振動注入前、
    // 摩擦・抵抗・loadTorqueで積分した後の値。積分前のomega(=omegaPre)そのものでは
    // ない)。KE=0.5・J・ω²の変化は、ω_new=omegaDynamics+δ(|δ|<=vibration)のとき
    // ΔKE=0.5・J・((omegaDynamics+δ)²-omegaDynamics²)=0.5・J・(2・omegaDynamics・δ+δ²)
    // <=0.5・J・(2|omegaDynamics|・vibration+vibration²)
    //  = J・|omegaDynamics|・vibration + 0.5・J・vibration²
    //
    // omegaDynamicsはmotorPhysics.tsのadvanceMotorState内部でのみ計算される値なので、
    // 近似(omegaPreで代用)ではなく、同じ入力(loadTorque・effectiveInertia)で
    // stepVehicleの非空転分岐と全く同じ式を外部から再現し、公開関数
    // computeOmegaDynamics(修正方針4で新規export、advanceMotorStateも内部でこれを
    // 呼ぶ「唯一の正」)を直接呼んで真の値を得る。carConfig=standardCarConfig()
    // (tireGrip=0.7)は空転しない構成であることを毎ステップisSlippingで確認し、
    // 非空転分岐の式(loadTorque=-tResistReflected、effectiveInertia=jEff)が
    // 常に妥当であることを担保する。
    //
    // evaluateMotorFrameのチャタリング判定・advanceMotorStateの振動ノイズは
    // それぞれ条件付きでrngを1回消費する。stepVehicle呼び出しに使うrngと全く同じ
    // シードから複製した別インスタンス(shadowRng)を使い、stepVehicle呼び出しの
    // 「直前」に同じ(config,state)でevaluateMotorFrameを呼ぶことで、rng消費回数・
    // 順序をstepVehicle内部の呼び出しと一致させ、2つのrng列を同期させ続ける。
    const motorConfig = goodMotorConfig({ axisOffsetMm: 1.0 });
    const carConfig = standardCarConfig();
    const jMotor = computeJ(motorConfig);
    const massKg = carConfig.massG / 1000;
    const wheelRadius = carConfig.wheelDiameterMm / 2000;
    const gearRatio = carConfig.gearRatio;
    const eta = carConfig.gearEfficiency;
    const jEff = jMotor + (massKg * wheelRadius * wheelRadius) / (gearRatio * gearRatio * eta);

    const realRng = mulberry32(15);
    const shadowRng = mulberry32(15);
    let state = createInitialVehicleState(motorConfig, carConfig);

    let prevEMech =
      0.5 * jMotor * state.motor.omega * state.motor.omega +
      0.5 * massKg * state.velocityMps * state.velocityMps +
      computeCoggingPotential(motorConfig, state.motor.theta);

    for (let i = 0; i < 120 * 3; i++) {
      // シャドウ計算: stepVehicleの非空転分岐と全く同じ式でloadTorque・jEffを再現し、
      // 同一のrng消費パターンでevaluateMotorFrameを呼んで真のomegaDynamicsを得る
      const resist = computeResistances(carConfig, massKg, state.velocityMps, 0, motorConfig.axisOffsetMm, state.motor.omega);
      const tResistReflected = (wheelRadius / (gearRatio * eta)) * resist.total;
      const loadTorqueUsed = -tResistReflected;
      const evaluation = evaluateMotorFrame(motorConfig, state.motor, shadowRng);
      const isClamped = isStaticFrictionClamped(state.motor.omega, evaluation.tMag, evaluation.tCog, loadTorqueUsed, motorConfig.brushPressure);
      let omegaDynamics = 0;
      if (!isClamped) {
        omegaDynamics = computeOmegaDynamics(motorConfig, state.motor.omega, evaluation, DT, loadTorqueUsed, jEff);
        shadowRng(); // advanceMotorStateが軸ずれ振動用に消費する1回分をシャドウでも消費し、rng列を同期させ続ける
      }

      state = stepVehicle(motorConfig, carConfig, state, DT, realRng);
      // 上界導出は非空転分岐の式(loadTorque=-tResistReflected、effectiveInertia=jEff)
      // に依存するため、この構成が常に非空転であることを確認する
      expect(state.isSlipping).toBe(false);

      const eMech =
        0.5 * jMotor * state.motor.omega * state.motor.omega +
        0.5 * massKg * state.velocityMps * state.velocityMps +
        computeCoggingPotential(motorConfig, state.motor.theta);
      const batteryInputThisStep = motorConfig.batteryVoltage * state.motor.current * DT;

      const vibration = K_VIB * motorConfig.axisOffsetMm * omegaDynamics * omegaDynamics;
      const keUpperBoundFromVibration = jMotor * Math.abs(omegaDynamics) * vibration + 0.5 * jMotor * vibration * vibration;

      expect(eMech).toBeLessThanOrEqual(prevEMech + batteryInputThisStep + keUpperBoundFromVibration + 1e-9);
      prevEMech = eMech;
    }
  });
});

describe('Phase2受け入れ基準: 完走判定の呼び出し契約(evaluateCourseCompletion)', () => {
  it('positionMがcourseLengthMに到達した時点でstatusがfinishedになる', () => {
    const motorConfig = goodMotorConfig();
    const carConfig = standardCarConfig();
    let state = createInitialVehicleState(motorConfig, carConfig);
    state = { ...state, positionM: 10, status: 'running' };
    const result = evaluateCourseCompletion(state, 10);
    expect(result.status).toBe('finished');
  });
});
