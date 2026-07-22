import { describe, expect, it } from 'vitest';
import { step, computeElectricalState, computeJ, computeRCoil, type MotorConfig, type SimState } from '../motorPhysics';
import { getCommutationSign } from '../commutator';
import {
  B_FLOOR_RATIO,
  B_MATERIAL_MAX,
  B_MATERIAL_MIN,
  B_REF_DISTANCE_MM,
  K_B_DISTANCE,
  K_E,
  K_T,
  J_NAIL,
  CHATTER_BURST_FRAMES,
  CHATTER_PRESSURE_THRESHOLD,
} from '../constants';
import { mulberry32 } from './prng';

const DT = 1 / 120;
const NO_NOISE_RNG = () => 0.5;

// spec docs/spec.md §3.7の設計目標で使う「適正パラメータ」
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
  return { theta, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 };
}

function runSteps(config: MotorConfig, steps: number, rng: () => number = NO_NOISE_RNG, initial = restState()) {
  let s = initial;
  for (let i = 0; i < steps; i++) {
    s = step(config, s, DT, rng);
  }
  return s;
}

// §3.7.1のB算出式をテスト側で独立に再実装(T_mag・e_backの実装が同じ関数を
// 使っているかを検証するために使用)
function computeB(magnetStrength: number, magnetDistanceMm: number): number {
  const bMaterial = B_MATERIAL_MIN + (B_MATERIAL_MAX - B_MATERIAL_MIN) * magnetStrength;
  const bFloor = bMaterial * B_FLOOR_RATIO;
  return bFloor + (bMaterial - bFloor) * Math.exp(-K_B_DISTANCE * (magnetDistanceMm - B_REF_DISTANCE_MM));
}

describe('受け入れ基準1: 適正パラメータでの定常回転', () => {
  it('RPMが収束し、収束後の平均電流が始動電流の40〜60%程度になる(逆起電力の効果)', () => {
    const config = goodConfig();
    let s = restState();

    // 始動電流: ω=0の瞬間はbackEmfが必ず0になるため、理論上のI=V/Rと一致する
    const first = step(config, s, DT, NO_NOISE_RNG);
    const iStart = first.current;
    expect(iStart).toBeGreaterThan(0);

    s = first;
    const totalSteps = 120 * 15;
    const endWindow = 120;
    const endCurrents: number[] = [];
    for (let i = 1; i < totalSteps; i++) {
      s = step(config, s, DT, NO_NOISE_RNG);
      if (i >= totalSteps - endWindow) endCurrents.push(s.current);
    }
    const iEnd = endCurrents.reduce((a, b) => a + b, 0) / endCurrents.length;

    expect(s.omega).toBeGreaterThan(0); // 回転が持続している
    expect(iEnd).toBeLessThan(iStart); // 逆起電力により電流が下がる
    const ratio = iEnd / iStart;
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.7); // 設計目標(§3.7)は40〜60%
  });
});

describe('受け入れ基準2: スリット0(ショート)', () => {
  it('全フレームでトルクゼロ相当(電流0)・shortedフラグが立つ', () => {
    const config = goodConfig({ slitWidthMm: 0 });
    let s = restState();
    for (let i = 0; i < 240; i++) {
      s = step(config, s, DT, NO_NOISE_RNG);
      expect(s.shorted).toBe(true);
      expect(s.current).toBe(0);
    }
    expect(s.omega).toBe(0); // 駆動トルクが常にゼロなので回転しない
  });
});

describe('受け入れ基準3: ブラシ圧による静止摩擦クランプ', () => {
  it('brushPressure=1.0では停止し、停止後に逆回転しない', () => {
    const config = goodConfig({ brushPressure: 1.0 });
    let s = restState();
    let sawNonNegative = true;
    for (let i = 0; i < 240; i++) {
      s = step(config, s, DT, NO_NOISE_RNG);
      if (s.omega < 0) sawNonNegative = false;
    }
    expect(sawNonNegative).toBe(true);
    expect(s.omega).toBe(0);
  });

  it('brushPressure=0.3では正常に回転する', () => {
    const config = goodConfig({ brushPressure: 0.3 });
    const s = runSteps(config, 240);
    expect(s.omega).toBeGreaterThan(10);
  });
});

describe('受け入れ基準4: ω=0付近での符号チャタリング防止', () => {
  it('ゼロ交差クランプにより、符号が反転する瞬間は必ずω=0を経由する', () => {
    // ブラシ圧を強めにして、加減速・停止が繰り返し起こりやすい状況を作る
    const config = goodConfig({ brushPressure: 0.6, coilTurns: 60 });
    const rng = mulberry32(1);
    let s = restState(0.3);
    let prevOmega = s.omega;
    for (let i = 0; i < 2000; i++) {
      s = step(config, s, DT, rng);
      const signFlipped = (prevOmega > 0 && s.omega < 0) || (prevOmega < 0 && s.omega > 0);
      expect(signFlipped).toBe(false);
      prevOmega = s.omega;
    }
  });
});

describe('受け入れ基準5: Jの巻き数依存(§3.1)', () => {
  it('単体プロパティ: 同一のθ・ωから1ステップ進めたとき、coilTurnsが大きい(Jが大きい)方がΔωが小さい', () => {
    const base: SimState = { theta: Math.PI / 2, omega: 10, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 };
    const low = step(goodConfig({ coilTurns: 80 }), base, DT, NO_NOISE_RNG);
    const high = step(goodConfig({ coilTurns: 140 }), base, DT, NO_NOISE_RNG);
    expect(high.omega - base.omega).toBeLessThan(low.omega - base.omega);
  });

  it('統合: 逆起電力支配域(適正パラメータ相当)では、coilTurnsが多いほど定常RPMが低い(トルク型↔回転数型のトレードオフ)', () => {
    const steps = 120 * 15;
    const omega40 = runSteps(goodConfig({ coilTurns: 40 }), steps).omega;
    const omega80 = runSteps(goodConfig({ coilTurns: 80 }), steps).omega;
    const omega140 = runSteps(goodConfig({ coilTurns: 140 }), steps).omega;
    expect(omega140).toBeLessThan(omega80);
    expect(omega80).toBeLessThan(omega40);
  });
});

describe('エネルギー整合性(K_T = K_E のとき T_mag・ω ≈ e_back・i)', () => {
  it('駆動中の任意のフレームでT_magとe_backの間にエネルギー整合性が成り立つ', () => {
    expect(K_T).toBe(K_E); // このテストの前提

    const config = goodConfig();
    let s = restState();
    const rng = mulberry32(3);
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

describe('性質ベーステスト(ランダムパラメータ)', () => {
  const rng = mulberry32(12345);

  function randomConfig(): MotorConfig {
    return {
      coilTurns: 10 + rng() * 140,
      slitWidthMm: rng() * 5,
      sandingQuality: rng(),
      brushPressure: rng(),
      magnetStrength: rng(),
      magnetDistanceMm: 5 + rng() * 25,
      batteryVoltage: rng() < 0.5 ? 1.5 : 3.0,
      axisOffsetMm: rng() * 3,
    };
  }

  it('状態が常に有限で、電流は非負、ショート時はトルク相当(電流)が常にゼロ、符号は0を経由せず反転しない', () => {
    for (let trial = 0; trial < 50; trial++) {
      const config = randomConfig();
      let s = restState(rng() * Math.PI * 2);
      let prevOmega = s.omega;
      for (let i = 0; i < 200; i++) {
        s = step(config, s, DT, rng);

        expect(Number.isFinite(s.theta)).toBe(true);
        expect(Number.isFinite(s.omega)).toBe(true);
        expect(Number.isFinite(s.current)).toBe(true);
        expect(Number.isFinite(s.backEmf)).toBe(true);
        expect(s.current).toBeGreaterThanOrEqual(0);

        if (config.slitWidthMm <= 0) {
          expect(s.shorted).toBe(true);
          expect(s.current).toBe(0);
        }

        const signFlipped = (prevOmega > 0 && s.omega < 0) || (prevOmega < 0 && s.omega > 0);
        expect(signFlipped).toBe(false);
        prevOmega = s.omega;
      }
    }
  });
});

describe('Phase3バランス調整: 持続的チャタリングバースト(§3.5)', () => {
  it('瞬断が発生するとCHATTER_BURST_FRAMES分だけ連続してcurrent=0が続き、その後は復帰する', () => {
    const config = goodConfig({ brushPressure: 0.1, axisOffsetMm: 0 });
    let callCount = 0;
    // 最初の乱数呼び出し(=最初のチャタリング判定)だけ発火させ、以降は発火させない
    const rng = () => {
      callCount += 1;
      return callCount === 1 ? 0 : 0.999999;
    };
    // 静止摩擦クランプに引っかからないよう、十分に回転している状態から始める
    let s: SimState = { theta: Math.PI / 2, omega: 10, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 };

    const currents: number[] = [];
    for (let i = 0; i < 30; i++) {
      s = step(config, s, DT, rng);
      currents.push(s.current);
    }

    for (let i = 0; i < CHATTER_BURST_FRAMES; i++) {
      expect(currents[i]).toBe(0);
    }
    expect(currents[CHATTER_BURST_FRAMES]).toBeGreaterThan(0);
  });

  it('brushPressureが閾値以上のときはチャタリングが一切発火しない(乱数が常に発火条件を満たしても)', () => {
    const config = goodConfig({ brushPressure: CHATTER_PRESSURE_THRESHOLD, axisOffsetMm: 0 });
    const ALWAYS_TRIGGER_RNG = () => 0; // 発火条件を満たす側の乱数を常に返す
    let s: SimState = { theta: Math.PI / 2, omega: 10, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 };

    for (let i = 0; i < 60; i++) {
      s = step(config, s, DT, ALWAYS_TRIGGER_RNG);
      expect(s.chatterFramesLeft).toBe(0);
    }
  });
});

describe('Phase3: 組み立てモードの逆方向フリック', () => {
  // 検証の結果、整流子の符号ロジック(commutator.ts)は電流が正である限り
  // 角度によらず常に正方向のトルクを生む(実物の2線整流子と同じく、回転方向は
  // 弾いた向きではなく電池の極性で決まるという仕様)。そのため、負の初期omegaを
  // 与えても最終的には正方向の定常回転に収束する。これは仕様として固定する
  // (逆に弾くと減速→停止→正方向に回り直す様子が見えること自体に教材価値がある)。
  it('負の初期omegaを与えても、最終的には正方向の定常回転に収束する(回転方向は極性で決まる)', () => {
    const config = goodConfig();
    const initial: SimState = { ...restState(), omega: -15 };
    const s = runSteps(config, 120 * 15, NO_NOISE_RNG, initial);
    expect(s.omega).toBeGreaterThan(0);
  });
});

// Phase2 Step5a(docs/phase2-plan.md §7、Fable承認済み): 導線ratio(抵抗率・密度)の
// engine拡張。goodConfig()はbrushPressure=0.3(>=CHATTER_PRESSURE_THRESHOLD=0.2)
// かつaxisOffsetMm=0のため、チャタリング判定は常にfalse分岐、軸ずれ振動は振幅0倍
// (vibrationNoiseの戻り値が常に0)となり、NO_NOISE_RNGの下で完全に決定論的に振る舞う
// (rngの値そのものは結果に影響しない)。以下のテストで選ぶtheta(π/6・π/4・π/3)は
// いずれもスリット(slitWidthMm=1.5)のデッドゾーン境界(θ=0/π近傍)から十分離れた点。
describe('Phase2 Step5a: 導線ratio(抵抗率・密度)のengine拡張', () => {
  describe('後方互換(省略時・明示的ratio=1.0の同値性、利用経路ごとに個別固定)', () => {
    it('120ステップ統合: wireResistivityRatio/wireDensityRatioを省略した場合と明示的に1.0を指定した場合で状態が完全一致する', () => {
      const omitted = runSteps(goodConfig(), 120);
      const explicit = runSteps(goodConfig({ wireResistivityRatio: 1.0, wireDensityRatio: 1.0 }), 120);
      expect(explicit.omega).toBe(omitted.omega);
      expect(explicit.theta).toBe(omitted.theta);
      expect(explicit.current).toBe(omitted.current);
    });

    it('computeRCoil: wireResistivityRatioを省略した場合と明示的に1.0を指定した場合でR_coilが完全一致する', () => {
      const omitted = computeRCoil(goodConfig());
      const explicit = computeRCoil(goodConfig({ wireResistivityRatio: 1.0 }));
      expect(explicit).toBe(omitted);
    });

    it('computeJ: wireDensityRatioを省略した場合と明示的に1.0を指定した場合でJが完全一致する', () => {
      const omitted = computeJ(goodConfig());
      const explicit = computeJ(goodConfig({ wireDensityRatio: 1.0 }));
      expect(explicit).toBe(omitted);
    });

    it('computeElectricalState経路(rCoil算出)もratio省略と明示的1.0で電流が一致する', () => {
      const es1 = computeElectricalState(goodConfig(), Math.PI / 4, 50);
      const es2 = computeElectricalState(goodConfig({ wireResistivityRatio: 1.0 }), Math.PI / 4, 50);
      expect(es2.current).toBe(es1.current);
    });

    it('effectiveInertia未指定のstep()経路(内部でcomputeOmegaDynamicsがJを再計算する経路)もwireDensityRatio省略と明示的1.0で一致する', () => {
      // effectiveInertiaを渡さないため、computeOmegaDynamics内部のJ計算(J_NAIL+コイル寄与×densityRatio)を
      // 直接経由する。120ステップ統合テストとは別に、この経路単体を数ステップで固定する。
      const s1 = step(goodConfig(), restState(), DT, NO_NOISE_RNG);
      const s2 = step(goodConfig({ wireDensityRatio: 1.0 }), restState(), DT, NO_NOISE_RNG);
      expect(s2.omega).toBe(s1.omega);
      expect(s2.theta).toBe(s1.theta);
    });

    it('effectiveInertia指定のadvanceMotorState経路(computeOmegaDynamicsの内部J計算を経由しない経路)もratio省略と明示的1.0で一致する(Q2契約)', () => {
      const s1 = step(goodConfig(), restState(), DT, NO_NOISE_RNG, 0, 3e-4);
      const s2 = step(goodConfig({ wireDensityRatio: 1.0 }), restState(), DT, NO_NOISE_RNG, 0, 3e-4);
      expect(s2.omega).toBe(s1.omega);
    });
  });

  describe('R_coil・Jのスケーリング式(比例 vs アフィン)', () => {
    it('computeRCoilはwireResistivityRatioに厳密に比例する(オフセットなし)', () => {
      const base = computeRCoil(goodConfig({ wireResistivityRatio: 1 }));
      const doubled = computeRCoil(goodConfig({ wireResistivityRatio: 2 }));
      const halved = computeRCoil(goodConfig({ wireResistivityRatio: 0.5 }));
      expect(doubled).toBeCloseTo(base * 2, 12);
      expect(halved).toBeCloseTo(base * 0.5, 12);
    });

    it('computeJはwireDensityRatioに対してアフィン(J_NAILの固定オフセット分だけ比例から外れる)であり、コイル寄与分のみが比例する', () => {
      const j1 = computeJ(goodConfig({ wireDensityRatio: 1 }));
      const j2 = computeJ(goodConfig({ wireDensityRatio: 2 }));
      const jHalf = computeJ(goodConfig({ wireDensityRatio: 0.5 }));

      // コイル寄与分(J_NAILを除いた部分)はratioに厳密比例する
      expect(j2 - J_NAIL).toBeCloseTo((j1 - J_NAIL) * 2, 12);
      expect(jHalf - J_NAIL).toBeCloseTo((j1 - J_NAIL) * 0.5, 12);

      // しかしJ_total自体はJ_NAILの固定オフセットがあるためratioに比例しない
      expect(j2 / j1).not.toBeCloseTo(2, 2);
    });
  });

  describe('方向性の性質テスト: ストール電流(ω=0)はwireResistivityRatioに対して単調に減少する', () => {
    it('ω=0では、theta(整流状態)によらずcurrentがratio∈{0.5,1,2}で厳密に単調減少する(ω=0でbackEmf=0のため、currentの大きさはthetaに依存しないことも合わせて確認)', () => {
      for (const theta of [Math.PI / 6, Math.PI / 4, Math.PI / 3]) {
        const currents = [0.5, 1, 2].map(
          (r) => computeElectricalState(goodConfig({ wireResistivityRatio: r }), theta, 0).current,
        );
        expect(currents[0]).toBeGreaterThan(currents[1]);
        expect(currents[1]).toBeGreaterThan(currents[2]);
      }
    });
  });

  describe('方向性の性質テスト: 3レジーム×2時間点でのomega応答(Fable指摘Q4)', () => {
    // R1 静止からの立ち上がり: theta=π/3, omega=0, loadTorque=0
    // R2 負荷下の中速域: theta=π/6, omega=60rad/s, loadTorque=3e-4N·m
    //    (加速度を鈍らせるが、駆動トルクの符号を反転させるほど大きくはない値を選定)
    // R3 無負荷高速域: theta=π/4, omega=110rad/s
    //    (定常回転域に近いが未収束の値。収束点そのものだと差分が数値誤差に埋もれるため避けた)
    // いずれもデッドゾーン境界・チャタリング閾値から意図的に離した代表点。
    interface Regime {
      label: string;
      theta: number;
      omega: number;
      loadTorque: number;
    }
    const regimes: Regime[] = [
      { label: '静止からの立ち上がり', theta: Math.PI / 3, omega: 0, loadTorque: 0 },
      { label: '負荷下の中速域', theta: Math.PI / 6, omega: 60, loadTorque: 3e-4 },
      { label: '無負荷高速域', theta: Math.PI / 4, omega: 110, loadTorque: 0 },
    ];

    function stateAt(theta: number, omega: number): SimState {
      return {
        theta,
        omega,
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

    function omegaAfterSteps(config: MotorConfig, regime: Regime, steps: number): number {
      let s = stateAt(regime.theta, regime.omega);
      for (let i = 0; i < steps; i++) {
        s = step(config, s, DT, NO_NOISE_RNG, regime.loadTorque);
      }
      return s.omega;
    }

    for (const regime of regimes) {
      for (const steps of [1, 5]) {
        it(`[${regime.label}] ${steps}ステップ後: wireResistivityRatio∈{0.5,1,2}でomegaが単調減少する(ストール電流減の帰結)`, () => {
          const omegas = [0.5, 1, 2].map((r) => omegaAfterSteps(goodConfig({ wireResistivityRatio: r }), regime, steps));
          expect(omegas[0]).toBeGreaterThan(omegas[1]);
          expect(omegas[1]).toBeGreaterThan(omegas[2]);
        });

        it(`[${regime.label}] ${steps}ステップ後: wireDensityRatio∈{0.5,1,2}でomegaが単調減少する(立ち上がり鈍化)`, () => {
          const omegas = [0.5, 1, 2].map((r) => omegaAfterSteps(goodConfig({ wireDensityRatio: r }), regime, steps));
          expect(omegas[0]).toBeGreaterThan(omegas[1]);
          expect(omegas[1]).toBeGreaterThan(omegas[2]);
        });
      }
    }
  });

  describe('方向性の性質テスト: 定常回転収束後(最高回転数相当)はwireResistivityRatioに対して単調に減少する', () => {
    it('15秒間の定常回転収束後、wireResistivityRatio∈{0.5,1,2}でomegaが単調減少する', () => {
      const steps = 120 * 15;
      const omegas = [0.5, 1, 2].map((r) => runSteps(goodConfig({ wireResistivityRatio: r }), steps).omega);
      expect(omegas[0]).toBeGreaterThan(omegas[1]);
      expect(omegas[1]).toBeGreaterThan(omegas[2]);
    });
  });

  describe('effectiveInertia契約(Fable承認済み、Q2): 外部指定時はwireDensityRatioが無効、省略時は相補的に有効', () => {
    it('effectiveInertiaを外部指定した場合、wireDensityRatioを変えても出力が完全一致する(二重適用なし)', () => {
      const EFFECTIVE_INERTIA = 3e-4;
      const results = [0.5, 1, 2].map(
        (r) => step(goodConfig({ wireDensityRatio: r }), restState(Math.PI / 3), DT, NO_NOISE_RNG, 0, EFFECTIVE_INERTIA).omega,
      );
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });

    it('effectiveInertiaを省略した場合、wireDensityRatioを変えると出力が変化する(相補経路: 内部J計算にratioが反映される)', () => {
      const results = [0.5, 1, 2].map(
        (r) => step(goodConfig({ wireDensityRatio: r }), restState(Math.PI / 3), DT, NO_NOISE_RNG, 0).omega,
      );
      expect(results[0]).not.toBe(results[1]);
      expect(results[1]).not.toBe(results[2]);
    });
  });
});
