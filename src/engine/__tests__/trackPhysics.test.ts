// spec docs/spec.md §10「Phase 3: コースと条件セット」の受け入れ基準(5項目)に
// 対応するテスト。既存のmotorPhysics系・vehiclePhysics系テスト(135件)は無編集。
import { describe, expect, it } from 'vitest';
import {
  computeElevationAt,
  createValidatedTrack,
  resolveSegmentAt,
  stepTrackRun,
  validateTrackDefinition,
  type TrackDefinition,
  type TrackSegment,
} from '../trackPhysics';
import {
  computeDriveForceRequired,
  computeResistances,
  createInitialVehicleState,
  type CarConfig,
  type VehicleSimState,
} from '../vehiclePhysics';
import { computeCoggingPotential, computeJ, type MotorConfig, type SimState } from '../motorPhysics';
import { BATTERY_CAPACITY_J_1_5V, BATTERY_CAPACITY_J_3_0V } from '../constants';
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

function seg(overrides: Partial<TrackSegment> = {}): TrackSegment {
  return { lengthM: 10, slopeDeg: 0, surfaceGrip: 1, roughness: 0, ...overrides };
}

function track(overrides: Partial<TrackDefinition> = {}): TrackDefinition {
  return {
    id: 'test-track',
    name: 'テストコース',
    description: '',
    segments: [seg()],
    objectives: [],
    ...overrides,
  };
}

describe('Phase3受け入れ基準#1: 同一設定+固定シードで結果が一致する', () => {
  it('複数区間(勾配・カーブ・でこぼこ混在)+固定シードで、2系統の独立計算が完全一致する', () => {
    const motorConfig = goodMotorConfig();
    const carConfig = standardCarConfig();
    const t = createValidatedTrack(
      track({
        segments: [seg({ lengthM: 3, slopeDeg: 5 }), seg({ lengthM: 3, curveRadiusM: 5 }), seg({ lengthM: 3, roughness: 0.5 })],
      }),
    );

    const run = () => {
      let state = createInitialVehicleState(motorConfig, carConfig);
      const rng = mulberry32(1);
      for (let i = 0; i < 120 * 3; i++) {
        state = stepTrackRun(motorConfig, carConfig, t, state, DT, rng);
        if (state.status !== 'running') break;
      }
      return state;
    };

    expect(run()).toEqual(run());
  });

  it('省エネコース(hasEnergyBudget)+惰性走行の決定性も維持される', () => {
    const motorConfig = goodMotorConfig();
    const carConfig = standardCarConfig();
    const t = createValidatedTrack(track({ segments: [seg({ lengthM: 5 })], hasEnergyBudget: true }));

    const run = () => {
      let state = createInitialVehicleState(motorConfig, carConfig);
      const rng = mulberry32(2);
      for (let i = 0; i < 120 * 5; i++) {
        state = stepTrackRun(motorConfig, carConfig, t, state, DT, rng);
        if (state.status !== 'running') break;
      }
      return state;
    };

    expect(run()).toEqual(run());
  });
});

describe('Phase3受け入れ基準#2: 坂を急にすると必要駆動力が単調に増える', () => {
  it('代数的: computeDriveForceRequiredから逆算した必要駆動力の絶対値がslopeRadに対して単調増加する', () => {
    const motorConfig = goodMotorConfig();
    const carConfig = standardCarConfig();
    const wheelRadius = carConfig.wheelDiameterMm / 2000;
    const massKg = carConfig.massG / 1000;
    const gearRatio = carConfig.gearRatio;
    const eta = carConfig.gearEfficiency;
    const jMotor = computeJ(motorConfig);
    const jEff = jMotor + (massKg * wheelRadius * wheelRadius) / (gearRatio * gearRatio * eta);
    const omega = 20;
    const tMag = 0.01;
    const tCog = 0;

    let prevAbs = -1;
    for (const slopeDeg of [0, 5, 10, 15, 20]) {
      const slopeRad = (slopeDeg * Math.PI) / 180;
      // velocityMps=0で呼ぶことで、roll/air/align/vibration項をすべて0にし
      // (sign(0)=0)、坂の効果(F_slope)だけを純粋に取り出す
      const resist = computeResistances(carConfig, massKg, 0, slopeRad, 0, omega);
      const a = computeDriveForceRequired(tMag, tCog, omega, motorConfig.brushPressure, resist.total, wheelRadius, gearRatio, eta, jEff);
      const driveForceRequired = massKg * a - resist.total;
      expect(Math.abs(driveForceRequired)).toBeGreaterThan(prevAbs);
      prevAbs = Math.abs(driveForceRequired);
    }
  });

  it('統合: 坂を急にするほど完走可否・タイムが単調に悪化する(slopeDeg={0,10,20}、Fable条件3で粗い刻みを採用)', () => {
    // 適正モーターでは20°でも登りきってしまうため、あえて弱めのモーターを使う
    const motorConfig = goodMotorConfig({ coilTurns: 50, magnetStrength: 0.7 });
    const carConfig = standardCarConfig();
    const results: { finished: boolean; time: number }[] = [];
    for (const slopeDeg of [0, 10, 20]) {
      const t = createValidatedTrack(track({ segments: [seg({ lengthM: 3, slopeDeg })] }));
      let state = createInitialVehicleState(motorConfig, carConfig);
      const rng = mulberry32(1);
      let steps = 0;
      const maxSteps = 120 * 15;
      while ((state.status === 'ready' || state.status === 'running') && steps < maxSteps) {
        state = stepTrackRun(motorConfig, carConfig, t, state, DT, rng);
        steps += 1;
      }
      results.push({ finished: state.status === 'finished', time: steps * DT });
    }
    // 緩い坂は完走し、急な坂になるほど完走できなくなる、または完走タイムが悪化する
    expect(results[0].finished).toBe(true);
    expect(results[2].finished).toBe(false);
  });
});

describe('Phase3受け入れ基準: resolveSegmentAtの境界仕様', () => {
  const t = track({ segments: [seg({ lengthM: 3 }), seg({ lengthM: 5 }), seg({ lengthM: 2 })] });

  it('ちょうど区間境界上のpositionMは次の区間に属する(半開区間、指摘3で統一)', () => {
    expect(resolveSegmentAt(t, 3)?.index).toBe(1);
    expect(resolveSegmentAt(t, 8)?.index).toBe(2);
  });

  it('区間内部のpositionMは正しい区間・segmentStartMを返す', () => {
    expect(resolveSegmentAt(t, 1)).toEqual({ segment: t.segments[0], index: 0, segmentStartM: 0 });
    expect(resolveSegmentAt(t, 4)).toEqual({ segment: t.segments[1], index: 1, segmentStartM: 3 });
  });

  it('positionM<0は区間0を返す', () => {
    expect(resolveSegmentAt(t, -5)?.index).toBe(0);
  });

  it('全区間長ちょうど、またはそれ以上は常にnullを返す(第2版の「最終区間だけinclusive」という矛盾を解消)', () => {
    expect(resolveSegmentAt(t, 10)).toBeNull();
    expect(resolveSegmentAt(t, 10.5)).toBeNull();
    expect(resolveSegmentAt(t, 1000)).toBeNull();
  });

  it('複数の短い区間を1回のpositionMジャンプでまたいでも正しい最終区間が解決される', () => {
    const manyShort = track({ segments: [seg({ lengthM: 0.01 }), seg({ lengthM: 0.01 }), seg({ lengthM: 0.01 }), seg({ lengthM: 10 })] });
    // 3区間×0.01mの合計長は0.03mのため、0.035は4番目の区間(index 3)に属する
    expect(resolveSegmentAt(manyShort, 0.035)?.index).toBe(3);
  });

  it('空segmentsのTrackDefinitionではpositionMの値によらず常にnullを返す(空配列アクセスの防御)', () => {
    const empty = track({ segments: [] });
    expect(resolveSegmentAt(empty, 0)).toBeNull();
    expect(resolveSegmentAt(empty, -5)).toBeNull();
    expect(resolveSegmentAt(empty, 100)).toBeNull();
  });
});

describe('Phase3受け入れ基準: computeElevationAtの連続性・決定性', () => {
  it('区間境界で標高が不連続にならない(異なる勾配の隣接区間)', () => {
    const t = track({ segments: [seg({ lengthM: 10, slopeDeg: 10 }), seg({ lengthM: 10, slopeDeg: -5 }), seg({ lengthM: 10, slopeDeg: 20 })] });
    // 各境界のごく直前・直後で標高がほぼ一致することを確認する
    for (const boundary of [10, 20]) {
      const before = computeElevationAt(t, boundary - 1e-6);
      const at = computeElevationAt(t, boundary);
      const after = computeElevationAt(t, boundary + 1e-6);
      expect(Math.abs(before - at)).toBeLessThan(1e-4);
      expect(Math.abs(after - at)).toBeLessThan(1e-4);
    }
  });

  it('positionM<0でも決定的(同一入力で同一出力)であり、区間0の勾配で外挿される', () => {
    const t = track({ segments: [seg({ lengthM: 10, slopeDeg: 10 })] });
    const a = computeElevationAt(t, -3);
    const b = computeElevationAt(t, -3);
    expect(a).toBe(b);
    expect(a).toBeCloseTo(-3 * Math.sin((10 * Math.PI) / 180), 9);
  });

  it('空segmentsでは常に0を返す(防御)', () => {
    const empty = track({ segments: [] });
    expect(computeElevationAt(empty, 5)).toBe(0);
    expect(computeElevationAt(empty, -5)).toBe(0);
  });

  it('全区間長を超えるpositionMは最終区間の勾配で外挿される', () => {
    const t = track({ segments: [seg({ lengthM: 10, slopeDeg: 15 })] });
    const atEnd = computeElevationAt(t, 10);
    const beyond = computeElevationAt(t, 15);
    expect(beyond - atEnd).toBeCloseTo(5 * Math.sin((15 * Math.PI) / 180), 9);
  });
});

describe('Phase3受け入れ基準: 区間境界をまたぐフレームでのE_total不変条件(指摘4のboundaryToleranceJ)', () => {
  it('異なる勾配の隣接区間の境界をまたぐフレームでも、解析的な境界誤差許容内でE_totalが電池入力を超えて増加しない', () => {
    const motorConfig = goodMotorConfig();
    const carConfig = standardCarConfig();
    const massKg = carConfig.massG / 1000;
    const jMotor = computeJ(motorConfig);
    const slopeADeg = 8;
    const slopeBDeg = -4;
    const t = createValidatedTrack(
      track({ segments: [seg({ lengthM: 0.3, slopeDeg: slopeADeg }), seg({ lengthM: 10, slopeDeg: slopeBDeg })] }),
    );

    let state = createInitialVehicleState(motorConfig, carConfig);
    const rng = mulberry32(3);

    // E_total = モーター回転運動エネルギー + 車体並進運動エネルギー +
    // コギング位置エネルギー(computeCoggingPotential) + 重力位置エネルギー
    // (computeElevationAt)。承認済み計画の式どおり、コギング位置エネルギーを
    // 省略しない(goodMotorConfig()の既定magnetDistanceMm=10は弱コギングのため、
    // 既知の半陰的Euler離散化誤差[docs/handoff.md §6.5(2)]は無視できる)
    const eTotal = (s: VehicleSimState) => {
      const keRot = 0.5 * jMotor * s.motor.omega * s.motor.omega;
      const keLin = 0.5 * massKg * s.velocityMps * s.velocityMps;
      const peCogging = computeCoggingPotential(motorConfig, s.motor.theta);
      const peGravity = massKg * 9.8 * computeElevationAt(t, s.positionM);
      return keRot + keLin + peCogging + peGravity;
    };

    let prevETotal = eTotal(state);
    let crossedBoundary = false;
    for (let i = 0; i < 120 * 10; i++) {
      const beforeIndex = resolveSegmentAt(t, state.positionM)?.index;
      const beforeSlopeRad = (slopeADeg * Math.PI) / 180;
      state = stepTrackRun(motorConfig, carConfig, t, state, DT, rng);
      const afterIndex = resolveSegmentAt(t, state.positionM)?.index;

      const batteryInputThisStep = motorConfig.batteryVoltage * state.motor.current * DT;
      // 境界をまたいだフレームのみ、5.6節(3)で導出した解析的上界を加算する
      // (安易に緩めた固定値は使わない)。境界をまたがないフレームは通常の
      // 数値誤差余裕(1e-6)のみ
      let boundaryToleranceJ = 0;
      if (beforeIndex !== undefined && afterIndex !== undefined && beforeIndex !== afterIndex) {
        crossedBoundary = true;
        const afterSlopeRad = (slopeBDeg * Math.PI) / 180;
        boundaryToleranceJ =
          massKg * 9.8 * Math.abs(Math.sin(afterSlopeRad) - Math.sin(beforeSlopeRad)) * Math.abs(state.velocityMps) * DT;
      }

      const current = eTotal(state);
      expect(current).toBeLessThanOrEqual(prevETotal + batteryInputThisStep + boundaryToleranceJ + 1e-6);
      prevETotal = current;
      if (state.status !== 'running') break;
    }
    expect(crossedBoundary).toBe(true);
  });
});

describe('Phase3受け入れ基準: trackSegmentIndexはフレーム終了時点の位置から解決される', () => {
  it('区間境界を跨いだフレームで、報告されるtrackSegmentIndexが1フレーム遅れずに更新される', () => {
    const motorConfig = goodMotorConfig();
    const carConfig = standardCarConfig();
    const t = createValidatedTrack(track({ segments: [seg({ lengthM: 0.05 }), seg({ lengthM: 10 })] }));
    let state = createInitialVehicleState(motorConfig, carConfig);
    const rng = mulberry32(1);
    let crossedFrame = -1;
    for (let i = 0; i < 30; i++) {
      state = stepTrackRun(motorConfig, carConfig, t, state, DT, rng);
      if (state.trackSegmentIndex === 1) {
        crossedFrame = i;
        break;
      }
    }
    expect(crossedFrame).toBeGreaterThanOrEqual(0);
    // 境界を跨いだそのフレームの結果自体がindex=1を報告していること(1フレーム遅れない)
    expect(state.trackSegmentIndex).toBe(1);
    expect(state.positionM).toBeGreaterThanOrEqual(0.05);
  });
});

describe('Phase3受け入れ基準: 省エネコースのエネルギー予算(spec §4.8)', () => {
  it('hasEnergyBudget=falseでは予算停止が一切適用されない(通常コースの既定動作)', () => {
    const motorConfig = goodMotorConfig({ batteryVoltage: 1.5 });
    const carConfig = standardCarConfig();
    const t = createValidatedTrack(track({ segments: [seg({ lengthM: 50 })] })); // hasEnergyBudget省略=false
    let state = createInitialVehicleState(motorConfig, carConfig);
    const rng = mulberry32(1);
    for (let i = 0; i < 120 * 60; i++) {
      state = stepTrackRun(motorConfig, carConfig, t, state, DT, rng);
      expect(state.failureCode).not.toBe('energyExhausted');
      if (state.status !== 'running') break;
    }
    // 予算(BATTERY_CAPACITY_J_1_5V)を超過していてもforcePowerOffが働かないことを確認
    expect(state.energyUsedJ).toBeGreaterThan(BATTERY_CAPACITY_J_1_5V);
  });

  it('hasEnergyBudget=trueで予算到達後はforcePowerOffが有効になり、自然減速の末にstalled+failureCode=energyExhaustedになる', () => {
    const motorConfig = goodMotorConfig({ batteryVoltage: 1.5 });
    const carConfig = standardCarConfig();
    const t = createValidatedTrack(track({ segments: [seg({ lengthM: 50 })], hasEnergyBudget: true }));
    let state = createInitialVehicleState(motorConfig, carConfig);
    const rng = mulberry32(1);
    let steps = 0;
    while (state.status === 'ready' || state.status === 'running') {
      state = stepTrackRun(motorConfig, carConfig, t, state, DT, rng);
      steps += 1;
      if (steps > 120 * 60) break;
    }
    expect(state.status).toBe('stalled');
    expect(state.failureCode).toBe('energyExhausted');
    // 予算のわずかな超過(1フレーム分)は許容するが、際限なく増え続けてはいない
    expect(state.energyUsedJ).toBeLessThan(BATTERY_CAPACITY_J_1_5V * 1.5);
  });

  it('予算到達前の通常の失速(energyExhaustedと無関係)はfailureCode=failureToStartのまま(指摘6)', () => {
    // 発進不能な弱いモーター構成+潤沢なエネルギー予算(3.0V+大きい予算)を使い、
    // 予算を使い切るよりずっと前にfailureToStartでstalledになることを確認する
    const motorConfig = goodMotorConfig({ magnetDistanceMm: 2, coilTurns: 10, magnetStrength: 1.0, brushPressure: 0.5, sandingQuality: 0.1, batteryVoltage: 3.0 });
    const carConfig = standardCarConfig();
    const t = createValidatedTrack(track({ segments: [seg({ lengthM: 50 })], hasEnergyBudget: true }));
    let state = createInitialVehicleState(motorConfig, carConfig);
    const rng = mulberry32(11);
    let steps = 0;
    while (state.status === 'ready' || state.status === 'running') {
      state = stepTrackRun(motorConfig, carConfig, t, state, DT, rng);
      steps += 1;
      if (steps > 120 * 10) break;
    }
    expect(state.status).toBe('stalled');
    expect(state.failureCode).toBe('failureToStart');
    expect(state.energyUsedJ).toBeLessThan(BATTERY_CAPACITY_J_3_0V);
  });

  it('境界フレームは通常給電される(1フレーム分の予算超過を許容する契約、指摘7の案甲)', () => {
    const motorConfig = goodMotorConfig({ batteryVoltage: 1.5 });
    const carConfig = standardCarConfig();
    const t = createValidatedTrack(track({ segments: [seg({ lengthM: 50 })], hasEnergyBudget: true }));
    let state = createInitialVehicleState(motorConfig, carConfig);
    const rng = mulberry32(1);
    let crossedFrame = -1;
    for (let i = 0; i < 120 * 60; i++) {
      const before = state;
      state = stepTrackRun(motorConfig, carConfig, t, state, DT, rng);
      if (before.energyUsedJ < BATTERY_CAPACITY_J_1_5V && state.energyUsedJ >= BATTERY_CAPACITY_J_1_5V) {
        crossedFrame = i;
        // このフレーム自体はフル給電されているため、増分はforcePowerOff後の
        // フレームに比べ明確に大きい(current=0にはなっていない)
        expect(state.motor.current).toBeGreaterThan(0);
        break;
      }
      if (state.status !== 'running') break;
    }
    expect(crossedFrame).toBeGreaterThanOrEqual(0);
  });

  it('惰性走行だけで完走した場合はfinishedとして成功扱いになる(1.4節手順8)', () => {
    // 自然な巡航速度では予算を使い切る頃には速度が低く惰性距離が乏しいため、
    // 「energyUsedJがちょうど予算に達した直後、十分な速度が残っている」状態を
    // 直接構築し、ゴール直前に置いて惰性だけで滑り込めることを確認する
    const motorConfig = goodMotorConfig({ batteryVoltage: 1.5 });
    const carConfig = standardCarConfig();
    const velocity = 1.0; // 十分な惰性距離を持たせるための速度
    const wheelRadius = carConfig.wheelDiameterMm / 2000;
    const motorOmega = (velocity / wheelRadius) * carConfig.gearRatio;
    const motor: SimState = {
      theta: Math.PI / 4, omega: motorOmega, current: 0, backEmf: 0, shorted: false,
      running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0,
    };
    const nearFinishPositionM = 5;
    const state: VehicleSimState = {
      ...createInitialVehicleState(motorConfig, carConfig),
      motor,
      velocityMps: velocity,
      positionM: nearFinishPositionM,
      energyUsedJ: BATTERY_CAPACITY_J_1_5V, // ちょうど予算に到達済み(次フレームからforcePowerOff)
    };
    const shortTrack = createValidatedTrack(track({ segments: [seg({ lengthM: nearFinishPositionM + 0.05 })], hasEnergyBudget: true }));
    let state2 = state;
    const rng2 = mulberry32(1);
    for (let i = 0; i < 120; i++) {
      state2 = stepTrackRun(motorConfig, carConfig, shortTrack, state2, DT, rng2);
      if (state2.status !== 'running') break;
    }
    expect(state2.status).toBe('finished');
  });
});

describe('Phase3受け入れ基準: validateTrackDefinition(データ契約)', () => {
  it('正常なTrackDefinitionでは空配列を返す', () => {
    expect(validateTrackDefinition(track())).toEqual([]);
  });

  it('空segmentsはemptySegments違反', () => {
    expect(validateTrackDefinition(track({ segments: [] }))).toEqual([{ reason: 'emptySegments' }]);
  });

  it('lengthM<=0はnonPositiveLength違反', () => {
    const issues = validateTrackDefinition(track({ segments: [seg({ lengthM: 0 })] }));
    expect(issues).toContainEqual({ segmentIndex: 0, field: 'lengthM', reason: 'nonPositiveLength' });
  });

  it('surfaceGrip・roughnessの範囲外はoutOfRange違反', () => {
    const issues = validateTrackDefinition(track({ segments: [seg({ surfaceGrip: 1.5, roughness: -0.1 })] }));
    expect(issues).toContainEqual({ segmentIndex: 0, field: 'surfaceGrip', reason: 'outOfRange' });
    expect(issues).toContainEqual({ segmentIndex: 0, field: 'roughness', reason: 'outOfRange' });
  });

  it('curveRadiusM<=0はnonPositiveCurveRadius違反', () => {
    const issues = validateTrackDefinition(track({ segments: [seg({ curveRadiusM: 0 })] }));
    expect(issues).toContainEqual({ segmentIndex: 0, field: 'curveRadiusM', reason: 'nonPositiveCurveRadius' });
  });

  it('NaNは各数値フィールドでnonFinite違反として検出される(比較演算では検出できないため独立検査、追補)', () => {
    const issues = validateTrackDefinition(track({ segments: [seg({ lengthM: NaN, slopeDeg: NaN, curveRadiusM: NaN })] }));
    expect(issues).toContainEqual({ segmentIndex: 0, field: 'lengthM', reason: 'nonFinite' });
    expect(issues).toContainEqual({ segmentIndex: 0, field: 'slopeDeg', reason: 'nonFinite' });
    expect(issues).toContainEqual({ segmentIndex: 0, field: 'curveRadiusM', reason: 'nonFinite' });
  });

  it('InfinityもnonFinite違反として検出される', () => {
    const issues = validateTrackDefinition(track({ segments: [seg({ slopeDeg: Infinity })] }));
    expect(issues).toContainEqual({ segmentIndex: 0, field: 'slopeDeg', reason: 'nonFinite' });
  });
});

describe('Phase3受け入れ基準: createValidatedTrack(fail-fast契約)', () => {
  it('不正なTrackDefinitionを渡すとRangeErrorを投げる', () => {
    expect(() => createValidatedTrack(track({ segments: [] }))).toThrow(RangeError);
    expect(() => createValidatedTrack(track({ segments: [seg({ lengthM: -1 })] }))).toThrow(RangeError);
  });

  it('正常なTrackDefinitionはValidatedTrackDefinitionを返し、stepTrackRunへそのまま渡せる', () => {
    const motorConfig = goodMotorConfig();
    const carConfig = standardCarConfig();
    const validated = createValidatedTrack(track());
    let state = createInitialVehicleState(motorConfig, carConfig);
    const rng = mulberry32(1);
    // 型エラーなくstepTrackRunへ渡せること自体がこのテストの主眼(コンパイルが通ること)
    state = stepTrackRun(motorConfig, carConfig, validated, state, DT, rng);
    expect(Number.isFinite(state.positionM)).toBe(true);
  });
});
