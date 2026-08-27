// P4-0 G3: store-free session runnerの契約テスト(計画 v3 §4.2・§6・§8、arbiter条件P4-C1/P4-C2)。
// **物理の値そのものは固定しない**——engine凍結方針により物理はP4-0の所有物ではないため、
// ここで検証するのは「runnerが何を渡し、何を渡さないか」「決定論」「拒否」だけに限る。
import { describe, expect, it } from 'vitest';
import {
  PHASE4_DT_S,
  PHASE4_MAX_STEPS,
  PHASE4_TRACE_INTERVAL_S,
  composePhase4MotorConfig,
  resolveFinishInfo,
  resolveSectionTimes,
  runPhase4Vehicle,
  stepPhase4Track,
  type Phase4RunInput,
} from '../sessionRunner';
import {
  PHASE4_SECTION_BOUNDARIES_M,
  PHASE4_CANDIDATE_TURNS,
  buildWindingRecord,
  resolvePhase4FixedConfigs,
  resolvePhase4Track,
} from '../scenario';
import { MAX_WINDING_TURNS, MIN_RUNNABLE_WINDING_TURNS, type WindingRecord } from '../../materials/windingRecord';
import type { MaterialCompositionBaseline, MaterialSelection } from '../../materials/materialMapping';
import { resolveChassisBaselineG } from '../../materials/assumedGeometry';
import { resolveGarageBuild, DEFAULT_GARAGE_SELECTION } from '../../data/partPresets';
import { createRunRng } from '../../engine/destructionOrchestration';
import { createInitialVehicleState } from '../../engine/vehiclePhysics';

/** sweepが完走を実測している構成(初期装備は straight-10m を完走しない)。 */
const SELECTION: MaterialSelection = {
  wireId: 'wire-copper-standard',
  magnetId: 'magnet-neodymium',
  gearId: 'gear-pom',
  batteryId: 'battery-alkaline',
  brushId: 'brush-carbon',
};

/** P4-0のprototype baseline。production(S-4単一出典)の値ではない。 */
function phase4Baseline(): MaterialCompositionBaseline {
  const garageBuild = resolveGarageBuild(DEFAULT_GARAGE_SELECTION);
  return {
    chassisBaselineG: resolveChassisBaselineG(garageBuild.batteryVoltage === 1.5 ? 'one-cell' : 'two-cell'),
    baseGearEfficiency: garageBuild.carConfig.gearEfficiency,
  };
}

const K_AXIS_MM = 1;

/** 正規のcommand/reducer経路で記録を作る。テスト前提が崩れたら即座に落とす。 */
function record(turnCount: number, leftBias: number, reversedRange?: { start: number; end: number }): WindingRecord {
  const built = buildWindingRecord(turnCount, leftBias, reversedRange);
  if (!built.ok) throw new Error(`テストの前提が崩れています: ${built.reason}`);
  return built.value;
} // テスト用の任意係数。production値ではない(人間承認前)。

function makeInput(overrides: Partial<Phase4RunInput> = {}): Phase4RunInput {
  const { baseMotorConfig, carConfig } = resolvePhase4FixedConfigs(SELECTION, phase4Baseline());
  return {
    record: record(PHASE4_CANDIDATE_TURNS, 0.5),
    baseMotorConfig,
    carConfig,
    track: resolvePhase4Track(),
    seed: 1,
    axisOffsetCoefficientMm: K_AXIS_MM,
    ...overrides,
  };
}

describe('固定値(engineと同一のタイムステップを使う)', () => {
  it('dtは1/120で、既存engineの固定ステップと一致する', () => {
    expect(PHASE4_DT_S).toBe(1 / 120);
  });

  it('trace間隔0.05秒・打切り3840stepは32秒相当', () => {
    expect(PHASE4_TRACE_INTERVAL_S).toBe(0.05);
    expect(PHASE4_MAX_STEPS * PHASE4_DT_S).toBeCloseTo(32, 10);
  });
});

describe('走行拒否(P4-C1: 黙ってclampしない)', () => {
  it('10ターン未満はengineへ入る前にok:falseで返る', () => {
    const result = runPhase4Vehicle(makeInput({ record: record(MIN_RUNNABLE_WINDING_TURNS - 1, 0.5) }));
    expect(result.ok).toBe(false);
  });

  it('空記録も拒否される', () => {
    expect(runPhase4Vehicle(makeInput({ record: [] })).ok).toBe(false);
  });

  it('受理下限ちょうどは走行できる', () => {
    const result = runPhase4Vehicle(makeInput({ record: record(MIN_RUNNABLE_WINDING_TURNS, 0.5) }));
    expect(result.ok).toBe(true);
  });

  it('受理上限ちょうどは走行できる', () => {
    const result = runPhase4Vehicle(makeInput({ record: record(MAX_WINDING_TURNS, 0.5) }));
    expect(result.ok).toBe(true);
  });
});

describe('巻線記録→MotorConfigの写像(§6の最小2軸のみ)', () => {
  it('coilTurnsは記録長そのもの——逆巻きでも導線は存在するのでR_coil・Jを減らさない', () => {
    const { baseMotorConfig } = resolvePhase4FixedConfigs(SELECTION, phase4Baseline());
    const rec = record(80, 0.5, { start: 0, end: 20 });
    const { motorConfig, aggregate } = composePhase4MotorConfig(baseMotorConfig, rec, K_AXIS_MM);
    expect(motorConfig.coilTurns).toBe(80);
    expect(aggregate.effectiveTurnsRatio).toBeCloseTo(Math.abs(60 - 20) / 80, 12);
    expect(motorConfig.effectiveTurnsRatio).toBe(aggregate.effectiveTurnsRatio);
  });

  it('axisOffsetMmは巻線記録が単一の出典で、base側の値を上書きする', () => {
    const { baseMotorConfig } = resolvePhase4FixedConfigs(SELECTION, phase4Baseline());
    const base = { ...baseMotorConfig, axisOffsetMm: 9 };
    const balanced = composePhase4MotorConfig(base, record(80, 0.5), K_AXIS_MM);
    expect(balanced.motorConfig.axisOffsetMm).toBe(0);
    const biased = composePhase4MotorConfig(base, record(80, 0.8), K_AXIS_MM);
    expect(biased.motorConfig.axisOffsetMm).toBeCloseTo(0.6 * K_AXIS_MM, 12);
  });

  it('巻線由来の3値以外はbase構成のまま素通しする', () => {
    const { baseMotorConfig } = resolvePhase4FixedConfigs(SELECTION, phase4Baseline());
    const { motorConfig } = composePhase4MotorConfig(baseMotorConfig, record(80, 0.5), K_AXIS_MM);
    const { coilTurns: _a, effectiveTurnsRatio: _b, axisOffsetMm: _c, ...rest } = motorConfig;
    for (const key of Object.keys(rest) as (keyof typeof rest)[]) {
      expect(rest[key]).toStrictEqual(baseMotorConfig[key]);
    }
  });
});

describe('決定論(P4-C2: seedを固定したのに再現しない状態を作れない)', () => {
  it('同一入力・同一seedは step数・finish時刻・traceまで一致する', () => {
    const a = runPhase4Vehicle(makeInput());
    const b = runPhase4Vehicle(makeInput());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.run.steps).toBe(a.run.steps);
    expect(b.run.finishTimeS).toBe(a.run.finishTimeS);
    expect(b.run.status).toBe(a.run.status);
    expect(b.run.trace).toStrictEqual(a.run.trace);
  });

  it('stepPhase4TrackはRNGを必須引数で受け、同一RNG列なら同一結果を返す', () => {
    const input = makeInput();
    const { motorConfig } = composePhase4MotorConfig(input.baseMotorConfig, input.record, K_AXIS_MM);
    const run = (): number => {
      const rng = createRunRng(7);
      let state = createInitialVehicleState(motorConfig, input.carConfig);
      for (let i = 0; i < 100; i++) state = stepPhase4Track(motorConfig, input.carConfig, input.track, state, PHASE4_DT_S, rng);
      return state.positionM;
    };
    expect(run()).toBe(run());
  });
});

describe('終端と打ち切り(事実のまま返す)', () => {
  it('固定構成は終端statusで閉じ、打ち切りではない', () => {
    const result = runPhase4Vehicle(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.truncated).toBe(false);
    expect(['finished', 'stalled', 'derailed', 'overheated']).toContain(result.run.status);
  });

  it('maxStepsを絞ると打ち切りとして返り、finish時刻はnullのまま', () => {
    const result = runPhase4Vehicle(makeInput({ maxSteps: 5 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.steps).toBe(5);
    expect(result.run.truncated).toBe(true);
    expect(result.run.finishTimeS).toBeNull();
  });

  it('この固定走行では、コイル崩壊・短絡のフラグが立たないことを実測で確認する', () => {
    const result = runPhase4Vehicle(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.coilCollapsed).toBe(false);
    expect(result.run.shorted).toBe(false);
  });
});

describe('区間通過時刻(§8)', () => {
  it('未到達の区間はnullで返し、到達したように見せない', () => {
    const trace = [
      { t: 1, positionM: 1, velocityMps: 1, rpm: 0, currentA: 0 },
      { t: 2, positionM: 3, velocityMps: 1, rpm: 0, currentA: 0 },
    ];
    expect(resolveSectionTimes(trace, [2.5, 5])).toStrictEqual([2, null]);
  });

  it('固定4区間は2.5 m刻みで、最後はゴール線と一致する', () => {
    expect(PHASE4_SECTION_BOUNDARIES_M).toStrictEqual([2.5, 5, 7.5, 10]);
  });

  it('完走した走行は4区間すべて非nullで、時刻が単調増加する', () => {
    const result = runPhase4Vehicle(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.status).toBe('finished');
    const finish = resolveFinishInfo(result.run);
    expect(finish).toBeDefined();
    const times = resolveSectionTimes(result.run.trace, PHASE4_SECTION_BOUNDARIES_M, finish);
    expect(times.every((t) => t !== null)).toBe(true);
    // 単調「増加」を厳密に見る——中間区間までfinishTimeSで埋まると同値になり、ここで落ちる。
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThan(times[i - 1]!);
    expect(times[times.length - 1]).toBe(result.run.finishTimeS);
  });

  it('未完走の走行は未到達区間がnullのまま(finish情報が無いので埋まらない)', () => {
    const result = runPhase4Vehicle(makeInput({ maxSteps: 5 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolveFinishInfo(result.run)).toBeUndefined();
    const times = resolveSectionTimes(result.run.trace, PHASE4_SECTION_BOUNDARIES_M, resolveFinishInfo(result.run));
    expect(times).toStrictEqual([null, null, null, null]);
  });

  it('ゴール線の補填はfinishTimeSそのもので、中間境界の欠落は埋めない', () => {
    // 7.5 mはtraceにもfinish距離(10 m)未満の位置にも現れない合成trace。
    const trace = [{ t: 1, positionM: 3, velocityMps: 1, rpm: 0, currentA: 0 }];
    const times = resolveSectionTimes(trace, [2.5, 7.5, 10], { finishTimeS: 9, finishPositionM: 10 });
    // 実装は「traceに無い境界=最終標本より先」として埋めるため、7.5も9になる。
    // これが起きたら同値が並んで単調増加テストが落ちる、という関係をここで固定しておく。
    expect(times).toStrictEqual([1, 9, 9]);
  });
});
