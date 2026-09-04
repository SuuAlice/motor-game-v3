// spec docs/spec.md §10「Phase 1: 負荷入力の追加」の受け入れ基準テスト。
// 既存の66テスト(motorPhysics.test.ts / motorPhysicsV15.test.ts等)は無改修のまま
// 維持し(loadTorque省略時の後方互換はそれらの無改修通過そのものが証明する)、
// ここではloadTorque固有の受け入れ基準を検証する。
import { describe, expect, it } from 'vitest';
import { step, computeB, computeRCoil, computeContactResistance, computeBatteryInternalResistance, type MotorConfig, type SimState } from '../motorPhysics';
import { isInDeadZone } from '../commutator';
import { BATTERY_HEAT_LIMIT, COIL_DEFORM_OMEGA, FLICK_INITIAL_OMEGA, K_T } from '../constants';
import { mulberry32 } from './prng';

const DT = 1 / 120;

function goodConfig(overrides: Partial<MotorConfig> = {}): MotorConfig {
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

function restState(theta = Math.PI / 4): SimState {
  return {
    theta,
    omega: 0,
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
}

function flickState(theta: number, omega: number): SimState {
  return { ...restState(theta), omega };
}

function runSteps(
  config: MotorConfig,
  steps: number,
  initial: SimState,
  rng: () => number,
  loadTorque = 0,
): SimState {
  let s = initial;
  for (let i = 0; i < steps; i++) {
    s = step(config, s, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: rng, loadTorque: loadTorque });
  }
  return s;
}

describe('Phase1受け入れ基準: 後方互換(loadTorque省略 === loadTorque=0)', () => {
  it('4引数呼び出しと5引数loadTorque=0呼び出しは同一の結果になる', () => {
    const config = goodConfig();
    const rng1 = mulberry32(1);
    const rng2 = mulberry32(1);
    const s0 = flickState(0, FLICK_INITIAL_OMEGA);
    const withoutArg = step(config, s0, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: rng1 });
    const withZero = step(config, s0, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: rng2, loadTorque: 0 });
    expect(withZero).toEqual(withoutArg);
  });
});

describe('loadTorqueの符号規約: 前進方向(ω>0)基準に固定された符号(現在の回転方向基準ではない)', () => {
  it('ω>0(前進)では、正のloadTorqueは減速、負のloadTorqueは加速する', () => {
    const config = goodConfig();
    const s0 = flickState(Math.PI / 3, 5);
    const sNoLoad = step(config, s0, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: mulberry32(9), loadTorque: 0 });
    const sPosLoad = step(config, s0, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: mulberry32(9), loadTorque: 0.01 });
    const sNegLoad = step(config, s0, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: mulberry32(9), loadTorque: -0.01 });
    expect(sPosLoad.omega).toBeLessThan(sNoLoad.omega);
    expect(sNegLoad.omega).toBeGreaterThan(sNoLoad.omega);
  });

  it('ω<0(後退)では、正のloadTorqueは後退を加速し、負のloadTorqueは後退を減速する(座標系固定の符号であることの確認)', () => {
    const config = goodConfig();
    // デッドゾーン内の角度(tMag=0を保証し、逆起電力による強い復元トルクの影響を
    // 排除する。slitWidthMm=1.5 → デッドゾーン半幅0.15radなのでこの範囲内)
    const deadZoneTheta = 0.05;
    const s0 = flickState(deadZoneTheta, -5);
    const sNoLoad = step(config, s0, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: mulberry32(9), loadTorque: 0 });
    const sPosLoad = step(config, s0, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: mulberry32(9), loadTorque: 0.01 });
    const sNegLoad = step(config, s0, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: mulberry32(9), loadTorque: -0.01 });
    // 正のloadTorqueは常にωを減少させる向きに働くため、ω<0では絶対値が増える(後退が加速する)
    expect(sPosLoad.omega).toBeLessThan(sNoLoad.omega);
    // 負のloadTorqueは常にωを増加させる向きに働くため、ω<0では0に近づく(後退が減速する)
    expect(sNegLoad.omega).toBeGreaterThan(sNoLoad.omega);
    expect(Math.abs(sNegLoad.omega)).toBeLessThan(Math.abs(sNoLoad.omega));
  });
});

describe('Phase1受け入れ基準: 一定負荷を与えると回転数が単調に下がる', () => {
  it('定常回転に達したのち負荷を加えると、平滑化RPM(state.rpm)がε許容で単調に下がる', () => {
    const config = goodConfig();
    const rng = mulberry32(3);
    // 助走: 無負荷で定常回転まで回す
    let s = runSteps(config, 120 * 15, restState(), rng, 0);
    const steadyRpm = s.rpm;
    expect(steadyRpm).toBeGreaterThan(700);

    const loadTorque = 0.015; // staticFrictionLimit(MU_BRUSH*0.3=0.0075)の2倍程度。減速はするが即座には停動しない値
    const EPS = 1e-6;
    const sampleStride = 6; // コギングリップル等の短周期振動による誤検出を避けるため間引く
    let prevRpm = s.rpm;
    for (let i = 0; i < 120 * 6; i++) {
      s = step(config, s, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: rng, loadTorque: loadTorque });
      if (i % sampleStride === 0) {
        expect(s.rpm).toBeLessThanOrEqual(prevRpm + EPS);
        prevRpm = s.rpm;
      }
    }
    expect(s.rpm).toBeLessThan(steadyRpm);
  });
});

describe('Phase1受け入れ基準: 停動時の電流が内部抵抗込みの理論値と一致する', () => {
  it('静止摩擦限界を上回る負荷で停止すると、電流がV/(R_coil+R_contact+R_BATTERY_INTERNAL)に一致する(早期returnパスで安定停止)', () => {
    // slitWidthMm小: デッドゾーン幅(slitWidthMm/R_COMMUTATOR_MM)を小さく保ち、
    // 停止角がデッドゾーンに入って電流0になる事故を避ける
    const config = goodConfig({ slitWidthMm: 0.5 });
    const rng = mulberry32(11);

    const expectedStallCurrent =
      config.batteryVoltage /
      (computeRCoil(config) + computeContactResistance(config) + computeBatteryInternalResistance(config.batteryVoltage));
    const bAtStall = computeB(config.magnetStrength, config.magnetDistanceMm);
    // sinθ・commutationSignの積の最大値は1(θ=π/2付近)なので、これがtMagの理論上限
    const maxPossibleTMag = K_T * bAtStall * expectedStallCurrent * config.coilTurns;
    // 上限よりわずかに小さい負荷にすることで、tMag(θ)=loadTorqueとなる角度が
    // 必ず存在し(中間値の定理)、動的に減速して安定停止する
    const loadTorque = maxPossibleTMag * 0.95;

    const s = runSteps(config, 120 * 5, flickState(0, FLICK_INITIAL_OMEGA), rng, loadTorque);

    expect(s.omega).toBe(0); // 静止摩擦クランプ(早期returnパス)で停止
    expect(isInDeadZone(s.theta, config.slitWidthMm)).toBe(false); // デッドゾーン外で停止
    expect(s.batteryHeat).toBeLessThan(BATTERY_HEAT_LIMIT); // 短絡・過熱ではなく機械的な停動であることの確認
    expect(s.current).toBeCloseTo(expectedStallCurrent, 6);

    // 早期returnパスの安定性確認: 停止後さらに1ステップ進めても、omegaとthetaは固定され、
    // 計算済み停動電流が維持される(batteryHeat等は早期returnパスでも更新されるため、
    // 状態全体が不変とは限らない)
    const sNext = step(config, s, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: rng, loadTorque: loadTorque });
    expect(sNext.omega).toBe(0);
    expect(sNext.theta).toBe(s.theta);
    expect(sNext.current).toBeCloseTo(expectedStallCurrent, 6);
  });
});
