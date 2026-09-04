// spec docs/spec.md §10「Phase 2」向けにmotorPhysics.tsへ導入した二段API
// (evaluateMotorFrame→advanceMotorState)が、既存step()(5引数版)と完全に同じ
// 結果・同じRNG消費回数/順序になることを検証する。vehiclePhysics.tsはこの二段API
// を直接呼び出すため、step()経由のテスト(motorPhysics.test.ts等)だけでは
// 分割APIの契約(唯一の正・RNG消費順序が一致すること)を証明できない。
import { describe, expect, it } from 'vitest';
import { COIL_DEFORM_OMEGA } from '../constants';
import { step, evaluateMotorFrame, advanceMotorState, type MotorConfig, type SimState } from '../motorPhysics';
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

function restState(theta = Math.PI / 4, overrides: Partial<SimState> = {}): SimState {
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
    ...overrides,
  };
}

function flickState(theta: number, omega: number, overrides: Partial<SimState> = {}): SimState {
  return { ...restState(theta), omega, ...overrides };
}

// rngの消費回数を数えるラッパー
function countingRng(seed: number): { rng: () => number; count: () => number } {
  const inner = mulberry32(seed);
  let calls = 0;
  return {
    rng: () => {
      calls += 1;
      return inner();
    },
    count: () => calls,
  };
}

interface Scenario {
  name: string;
  config: MotorConfig;
  state: SimState;
  seed: number;
}

const scenarios: Scenario[] = [
  {
    name: '通常回転中(チャタリングなし・クランプなし)',
    config: goodConfig({ brushPressure: 0.05 }), // 閾値未満、framesLeft=0からrng()でチャタリング判定される
    state: flickState(0, 20),
    seed: 1,
  },
  {
    name: 'チャタリングバースト継続中(framesLeft>0)',
    config: goodConfig({ brushPressure: 0.05 }),
    state: flickState(0, 20, { chatterFramesLeft: 5 }),
    seed: 2,
  },
  {
    name: 'brushPressure高値でチャタリング条件を満たさない',
    config: goodConfig({ brushPressure: 0.3 }), // CHATTER_PRESSURE_THRESHOLD(0.2)以上、rng()を呼ばない
    state: flickState(0, 20),
    seed: 3,
  },
  {
    name: '静止摩擦クランプが発動する状態',
    config: goodConfig({ magnetDistanceMm: 30, coilTurns: 10 }), // 弱いトルクで静止を維持しやすい構成
    state: restState(0.05), // デッドゾーン外、omega=0
    seed: 4,
  },
];

describe('Phase2受け入れ基準: 分割API(evaluateMotorFrame/advanceMotorState)とstep()の同値性', () => {
  for (const scenario of scenarios) {
    it(`${scenario.name}: step()の結果と分割API連結結果が完全一致する`, () => {
      const viaStep = countingRng(scenario.seed);
      const resultViaStep = step(scenario.config, scenario.state, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: viaStep.rng });

      const viaSplit = countingRng(scenario.seed);
      const evaluation = evaluateMotorFrame(scenario.config, scenario.state, viaSplit.rng);
      const resultViaSplit = advanceMotorState(scenario.config, scenario.state, evaluation, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: viaSplit.rng });

      expect(resultViaSplit).toEqual(resultViaStep);
      expect(viaSplit.count()).toBe(viaStep.count());
    });

    it(`${scenario.name}: loadTorque・effectiveInertiaを指定してもstep()と分割API連結結果が一致する`, () => {
      const loadTorque = 0.01;
      const effectiveInertia = 5e-5;

      const viaStep = countingRng(scenario.seed + 100);
      const resultViaStep = step(scenario.config, scenario.state, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: viaStep.rng, loadTorque: loadTorque, effectiveInertia: effectiveInertia });

      const viaSplit = countingRng(scenario.seed + 100);
      const evaluation = evaluateMotorFrame(scenario.config, scenario.state, viaSplit.rng);
      const resultViaSplit = advanceMotorState(scenario.config, scenario.state, evaluation, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: viaSplit.rng, loadTorque: loadTorque, effectiveInertia: effectiveInertia });

      expect(resultViaSplit).toEqual(resultViaStep);
      expect(viaSplit.count()).toBe(viaStep.count());
    });
  }
});

describe('Phase3受け入れ基準: evaluateMotorFrameのpowerOff引数', () => {
  it('powerOff省略時(既定false)はPhase2の既存コードパスを一切通らず無影響', () => {
    // powerOffが新規追加された引数であること自体の確認(既存呼び出しは無改修)
    const config = goodConfig({ brushPressure: 0.05 });
    const state = flickState(0, 20);
    const rng1 = countingRng(1);
    const rng2 = countingRng(1);
    const withoutArg = evaluateMotorFrame(config, state, rng1.rng);
    const withFalseArg = evaluateMotorFrame(config, state, rng2.rng, false);
    expect(withFalseArg).toEqual(withoutArg);
    expect(rng2.count()).toBe(rng1.count());
  });

  it('powerOff=trueのrng消費は常に0回(チャタリング判定を行わないため)', () => {
    const scenarios2: SimState[] = [flickState(0, 20), flickState(0, 20, { chatterFramesLeft: 5 }), restState(0.05)];
    for (const state of scenarios2) {
      const counting = countingRng(1);
      evaluateMotorFrame(goodConfig({ brushPressure: 0.05 }), state, counting.rng, true);
      expect(counting.count()).toBe(0);
    }
  });

  it('powerOff=trueはcurrent・tMagを0、shortedをfalseにする。backEmf・deadZoneは実値を保持する', () => {
    const config = goodConfig();
    const state = flickState(Math.PI / 4, 20); // theta=0はデッドゾーンでbackEmfが0になるため避ける
    const evaluation = evaluateMotorFrame(config, state, () => 0, true);
    expect(evaluation.current).toBe(0);
    expect(evaluation.tMag).toBe(0);
    expect(evaluation.shorted).toBe(false);
    expect(evaluation.chatterFramesLeft).toBe(0);
    // backEmfは実際のomegaに応じた非零値のはず(電源offでも回転そのものに起因する観測値)
    expect(evaluation.backEmf).not.toBe(0);
  });

  it('powerOff=trueかつshortedになり得る構成(slitWidthMm=0)でも新規発熱が生じない', () => {
    // shortedをfalseにすることで、advanceMotorState→nextBatteryHeatのshorted分岐
    // (currentを無視してbatteryVoltage/(rContact+rBatteryInternal)を使う式)を
    // 回避できていることを確認する
    const config = goodConfig({ slitWidthMm: 0 });
    let state = flickState(0, 20, { batteryHeat: 0.1 });
    const rng = mulberry32(1);
    for (let i = 0; i < 60; i++) {
      const evaluation = evaluateMotorFrame(config, state, rng, true);
      state = advanceMotorState(config, state, evaluation, DT, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: rng });
    }
    // HEAT_DISSIPATIONによる自然冷却のみのため、発熱は初期値を上回らない
    expect(state.batteryHeat).toBeLessThanOrEqual(0.1);
  });
});
