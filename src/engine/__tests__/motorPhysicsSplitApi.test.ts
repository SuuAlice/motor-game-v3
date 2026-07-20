// spec docs/spec.md §10「Phase 2」向けにmotorPhysics.tsへ導入した二段API
// (evaluateMotorFrame→advanceMotorState)が、既存step()(5引数版)と完全に同じ
// 結果・同じRNG消費回数/順序になることを検証する。vehiclePhysics.tsはこの二段API
// を直接呼び出すため、step()経由のテスト(motorPhysics.test.ts等)だけでは
// 分割APIの契約(唯一の正・RNG消費順序が一致すること)を証明できない。
import { describe, expect, it } from 'vitest';
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
      const resultViaStep = step(scenario.config, scenario.state, DT, viaStep.rng);

      const viaSplit = countingRng(scenario.seed);
      const evaluation = evaluateMotorFrame(scenario.config, scenario.state, viaSplit.rng);
      const resultViaSplit = advanceMotorState(scenario.config, scenario.state, evaluation, DT, viaSplit.rng);

      expect(resultViaSplit).toEqual(resultViaStep);
      expect(viaSplit.count()).toBe(viaStep.count());
    });

    it(`${scenario.name}: loadTorque・effectiveInertiaを指定してもstep()と分割API連結結果が一致する`, () => {
      const loadTorque = 0.01;
      const effectiveInertia = 5e-5;

      const viaStep = countingRng(scenario.seed + 100);
      const resultViaStep = step(scenario.config, scenario.state, DT, viaStep.rng, loadTorque, effectiveInertia);

      const viaSplit = countingRng(scenario.seed + 100);
      const evaluation = evaluateMotorFrame(scenario.config, scenario.state, viaSplit.rng);
      const resultViaSplit = advanceMotorState(
        scenario.config,
        scenario.state,
        evaluation,
        DT,
        viaSplit.rng,
        loadTorque,
        effectiveInertia,
      );

      expect(resultViaSplit).toEqual(resultViaStep);
      expect(viaSplit.count()).toBe(viaStep.count());
    });
  }
});
