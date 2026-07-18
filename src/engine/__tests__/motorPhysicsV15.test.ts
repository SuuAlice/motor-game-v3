// spec-v1.5.md §8「Phase A: エンジン拡張」の受け入れ基準テスト。
// 既存41テスト(motorPhysics.test.ts等)はv1.0互換性の回帰確認として維持し、
// ここではv1.5で追加した物理(線径・コギング・電池内部抵抗・ワニス崩壊)固有の
// 受け入れ基準を検証する。
import { describe, expect, it } from 'vitest';
import {
  step,
  computeMaxTurns,
  didCollapseJustHappen,
  didBatteryJustOverheat,
  type MotorConfig,
  type SimState,
} from '../motorPhysics';
import { getCommutationSign } from '../commutator';
import {
  B_FLOOR_RATIO,
  B_MATERIAL_MAX,
  B_MATERIAL_MIN,
  B_REF_DISTANCE_MM,
  K_B_DISTANCE,
  K_T,
  K_E,
  FLICK_INITIAL_OMEGA,
  COIL_DEFORM_OMEGA,
  COIL_DEFORM_FRAMES,
  BATTERY_HEAT_LIMIT,
  D_REF,
} from '../constants';
import { mulberry32 } from './prng';

const DT = 1 / 120;
const NO_NOISE_RNG = () => 0.5;

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

function runSteps(config: MotorConfig, steps: number, initial: SimState, rng: () => number = NO_NOISE_RNG): SimState {
  let s = initial;
  for (let i = 0; i < steps; i++) {
    s = step(config, s, DT, rng);
  }
  return s;
}

// 「始動できた」の判定: フリックの初速を使い切った後も、静止摩擦に負けて
// 停止(omega=0のまま)せず、一定時間後も回転が持続していること
function startsUp(config: MotorConfig, flickOmega: number, seeds: number[] = [1, 2, 3, 4, 5]): boolean {
  return seeds.every((seed) => {
    const rng = mulberry32(seed);
    const s = runSteps(config, 120 * 5, flickState(0, flickOmega), rng);
    return s.omega > 5;
  });
}

function computeB(magnetStrength: number, magnetDistanceMm: number): number {
  const bMaterial = B_MATERIAL_MIN + (B_MATERIAL_MAX - B_MATERIAL_MIN) * magnetStrength;
  const bFloor = bMaterial * B_FLOOR_RATIO;
  return bFloor + (bMaterial - bFloor) * Math.exp(-K_B_DISTANCE * (magnetDistanceMm - B_REF_DISTANCE_MM));
}

describe('Phase A受け入れ基準: T_cog導入後もdistance≥15mmではv1.0挙動との差が許容誤差内', () => {
  it('distance=15mmのネオジムはFLICK_INITIAL_OMEGAで確実に始動する(複数シード)', () => {
    const config = goodConfig({ magnetStrength: 1.0, magnetDistanceMm: 15 });
    expect(startsUp(config, FLICK_INITIAL_OMEGA)).toBe(true);
  });

  it('distance=15mmの定常RPMはT_cogなしのモデル(v1.0)と比べて大きく変わらない', () => {
    // T_cogは保存力なので定常回転(1周で正味仕事ゼロ)への影響は小さいはず。
    // v1.0の同条件での定常RPM(約1000RPM、spec §3.7の設計目標)から
    // 大きく外れないことを確認する
    const config = goodConfig({ magnetDistanceMm: 15 });
    const s = runSteps(config, 120 * 15, restState());
    const rpm = (s.omega * 60) / (2 * Math.PI);
    expect(rpm).toBeGreaterThan(700);
    expect(rpm).toBeLessThan(1300);
  });
});

describe('Phase A受け入れ基準: distance=2mm・ネオジムはFLICK_INITIAL_OMEGAでは始動せず、2倍では始動する', () => {
  it('FLICK_INITIAL_OMEGAでは始動しない(コギングトルクに負ける)', () => {
    const config = goodConfig({ magnetStrength: 1.0, magnetDistanceMm: 2 });
    expect(startsUp(config, FLICK_INITIAL_OMEGA)).toBe(false);
  });

  it('2倍の初速なら始動する', () => {
    const config = goodConfig({ magnetStrength: 1.0, magnetDistanceMm: 2 });
    expect(startsUp(config, FLICK_INITIAL_OMEGA * 2)).toBe(true);
  });
});

describe('コギング項の数値安定性(構造変更の副作用に対する回帰テスト)', () => {
  // K_COG・K_COG_B_DISTANCEのチューニング中、値を大きくしすぎるとdt=1/120の
  // semi-implicit Euler積分が発散し、omegaが数万rad/s(RPM換算で数十万)まで
  // 吹き飛ぶ不具合を実際に踏んだ(コギングの「バネ定数」2·K_COG·B_cog²/Jが
  // 大きすぎるとタイムステップに対して硬すぎる振動子になるため)。将来値を
  // 変更した際にこれを検出できるよう、磁石距離・巻き数の代表的な組み合わせで
  // omegaが有限かつ現実的な範囲に収まることを確認する
  it('magnetDistanceMm=2mm(最もコギングが強い設定)でomegaが発散しない', () => {
    const config = goodConfig({ magnetStrength: 1.0, magnetDistanceMm: 2 });
    for (const flickOmega of [FLICK_INITIAL_OMEGA, FLICK_INITIAL_OMEGA * 2, FLICK_INITIAL_OMEGA * 4]) {
      const rng = mulberry32(1);
      let s = flickState(0, flickOmega);
      for (let i = 0; i < 120 * 5; i++) {
        s = step(config, s, DT, rng);
        expect(Number.isFinite(s.omega)).toBe(true);
        expect(Math.abs(s.omega)).toBeLessThan(2000); // spec上のRPM上限(数千RPM)を大きく超えない
      }
    }
  });

  it('magnetDistanceMm=2〜30mm・coilTurns=10〜150の代表点でomegaが発散しない', () => {
    const distances = [2, 5, 8, 10, 15, 20, 30];
    const turns = [10, 40, 80, 150];
    for (const magnetDistanceMm of distances) {
      for (const coilTurns of turns) {
        const config = goodConfig({ magnetStrength: 1.0, magnetDistanceMm, coilTurns });
        const s = runSteps(config, 120 * 5, flickState(0, FLICK_INITIAL_OMEGA), mulberry32(2));
        expect(Number.isFinite(s.omega)).toBe(true);
        expect(Math.abs(s.omega)).toBeLessThan(2000);
      }
    }
  });
});

describe('Phase A受け入れ基準: i²発熱(短絡時にbatteryHeatが単調増加し上限で失敗になる)', () => {
  it('短絡(slitWidthMm=0)を維持するとbatteryHeatが単調増加し、BATTERY_HEAT_LIMITに到達する', () => {
    const config = goodConfig({ slitWidthMm: 0 });
    let s = restState();
    let prevHeat = s.batteryHeat;
    let reachedLimit = false;
    for (let i = 0; i < 600; i++) {
      const prev = s;
      s = step(config, s, DT, NO_NOISE_RNG);
      expect(s.batteryHeat).toBeGreaterThanOrEqual(prevHeat); // 単調増加(非減少)
      prevHeat = s.batteryHeat;
      if (didBatteryJustOverheat(prev, s)) reachedLimit = true;
    }
    expect(s.batteryHeat).toBe(BATTERY_HEAT_LIMIT);
    expect(reachedLimit).toBe(true);
  });

  it('適正パラメータ(短絡していない)ではbatteryHeatは上がらない', () => {
    const config = goodConfig();
    const s = runSteps(config, 120 * 15, restState());
    expect(s.batteryHeat).toBe(0);
  });
});

describe('Phase A受け入れ基準: 無ワニス+高ωで崩壊する。ワニス有りでは崩壊しない', () => {
  it('varnished=falseでCOIL_DEFORM_OMEGAを超える速度をCOIL_DEFORM_FRAMES以上維持すると崩壊する', () => {
    const config = goodConfig({ varnished: false, brushPressure: 0.05, magnetDistanceMm: 5 });
    const s = runSteps(config, COIL_DEFORM_FRAMES + 60, flickState(0, COIL_DEFORM_OMEGA * 3));
    expect(s.coilCollapsed).toBe(true);
  });

  it('崩壊はdidCollapseJustHappen()で1回だけ検出できる(境界検出ヘルパー)', () => {
    const config = goodConfig({ varnished: false, brushPressure: 0.05, magnetDistanceMm: 5 });
    let s = flickState(0, COIL_DEFORM_OMEGA * 3);
    let collapseEvents = 0;
    for (let i = 0; i < COIL_DEFORM_FRAMES + 60; i++) {
      const prev = s;
      s = step(config, s, DT, NO_NOISE_RNG);
      if (didCollapseJustHappen(prev, s)) collapseEvents += 1;
    }
    expect(collapseEvents).toBe(1);
  });

  it('varnished=true(既定値)では同条件でも崩壊しない', () => {
    const config = goodConfig({ varnished: true, brushPressure: 0.05, magnetDistanceMm: 5 });
    const s = runSteps(config, COIL_DEFORM_FRAMES + 60, flickState(0, COIL_DEFORM_OMEGA * 3));
    expect(s.coilCollapsed).toBe(false);
  });

  it('varnishedを省略した場合もtrue相当(崩壊しない、v1.0互換のデフォルト)', () => {
    const config: MotorConfig = {
      coilTurns: 80,
      slitWidthMm: 1.5,
      sandingQuality: 0.9,
      brushPressure: 0.05,
      magnetStrength: 1.0,
      magnetDistanceMm: 5,
      batteryVoltage: 3.0,
      axisOffsetMm: 0,
      // varnished省略
    };
    const s = runSteps(config, COIL_DEFORM_FRAMES + 60, flickState(0, COIL_DEFORM_OMEGA * 3));
    expect(s.coilCollapsed).toBe(false);
  });
});

describe('Phase A受け入れ基準: エネルギー整合性テストがコギング込みでも成立(T_cog除外で)', () => {
  it('T_mag・ωとe_back・iの整合性は、T_cog導入後も変わらず成り立つ(T_cogは保存力で別枠のため)', () => {
    expect(K_T).toBe(K_E);
    const config = goodConfig({ magnetDistanceMm: 8 }); // コギングの影響が出やすい距離
    let s = restState();
    const rng = mulberry32(7);
    for (let i = 0; i < 300; i++) {
      const before = s;
      s = step(config, s, DT, rng);

      const sign = getCommutationSign(before.theta);
      const sinTheta = Math.sin(before.theta);
      const B = computeB(config.magnetStrength, config.magnetDistanceMm);
      const tMag = K_T * B * s.current * config.coilTurns * sinTheta * sign;

      const mechanicalPower = tMag * before.omega;
      const electricalPower = s.backEmf * s.current;
      expect(Math.abs(mechanicalPower - electricalPower)).toBeLessThan(1e-9);
    }
  });
});

describe('Phase A受け入れ基準: 後方互換(新パラメータのデフォルト値)', () => {
  it('wireGaugeMm/parallelStrandsを省略すると、v1.0の巻ける上限(150)と一致する', () => {
    expect(computeMaxTurns(D_REF, 1)).toBe(150);
  });

  it('新パラメータを一切指定しないconfigでも既存41テストと同じ定常挙動になる(適正パラメータ)', () => {
    const config: MotorConfig = goodConfig();
    const s = runSteps(config, 120 * 15, restState());
    const rpm = (s.omega * 60) / (2 * Math.PI);
    expect(rpm).toBeGreaterThan(700);
    expect(rpm).toBeLessThan(1300);
  });
});
