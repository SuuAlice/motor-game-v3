// P3-4 G6(UI計画§11.2、人間承認2026-08-20): 回帰差分の純データ配管の単体テスト。
// G6の範囲は観測変換・legacy除外・同一recipeKey baseline抽出まで。
// `detectPerformanceRegression`の実呼出し・結果保持・表示はG7へ繰越のため、ここでは扱わない。
import { describe, expect, it } from 'vitest';
import {
  observeSession, observeCourseRun, observeVehicleTestRun, collectBaselineObservations,
} from '../regressionObservation';
import type { RegressionObservation } from '../../materials/regressionDiff';
import { createInitialDestructionState } from '../../engine/destructionModes';
import { computeRegressionReport } from '../regressionReport';
import { formatRegressionReport } from '../../components/encyclopediaView';

const motorConfig = {
  coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3,
  magnetStrength: 1, magnetDistanceMm: 10, batteryVoltage: 3 as const, axisOffsetMm: 0,
};
const carConfig = {
  massG: 150, gearRatio: 4, gearEfficiency: 0.8, wheelDiameterMm: 30, tireGrip: 0.7,
  axleFriction: 0, wheelAlignmentMm: 0, centerOfMassHeightMm: 20, motorMountOffsetMm: 0,
};
const finalDestructionState = createInitialDestructionState('lipo');

function sessionFixture(over: Record<string, unknown> = {}) {
  return {
    id: 's1', startedAt: new Date(0).toISOString(), endedAt: new Date(0).toISOString(),
    config: motorConfig, seed: 1, steadyRpm: 1200, averageCurrent: 0, maxCurrent: 0,
    currentRatio: 0, rpmVariation: 0, maxBatteryHeat: 0, events: [], samples: [],
    finalDestructionState, recipeKey: 'v1|alpha', ...over,
  } as never;
}
function courseRunFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'c1', savedAt: new Date(0).toISOString(), trackId: 'straight-10m',
    motorConfig, carConfig, seed: 1, status: 'finished' as const,
    elapsedTimeS: 12.5, positionM: 10, energyUsedJ: 1,
    energyBreakdown: { driveJ: 1, gearLossJ: 0, slipLossJ: 0, brushLossJ: 0, heatJ: 0 },
    samples: [], finalDestructionState, recipeKey: 'v1|alpha', ...over,
  } as never;
}
function vehicleTestRunFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'v1', savedAt: new Date(0).toISOString(), motorConfig, carConfig, seed: 1,
    status: 'finished' as const, elapsedTimeS: 5, positionM: 10, energyUsedJ: 1,
    energyBreakdown: { driveJ: 1, gearLossJ: 0, slipLossJ: 0, brushLossJ: 0, heatJ: 0 },
    samples: [
      { t: 0, positionM: 0, velocityMps: 0.5, rpm: 0, currentA: 0, batteryHeat: 0, slipRatio: 0, isSlipping: false },
      { t: 1, positionM: 1, velocityMps: 2.25, rpm: 0, currentA: 0, batteryHeat: 0, slipRatio: 0, isSlipping: false },
      { t: 2, positionM: 2, velocityMps: 1.75, rpm: 0, currentA: 0, batteryHeat: 0, slipRatio: 0, isSlipping: false },
    ],
    finalDestructionState, recipeKey: 'v1|alpha', ...over,
  } as never;
}

describe('観測変換: 腕ごとのmetricKind(人間承認2026-08-20で確定)', () => {
  it("session は steadyRpm を全件観測する(完走の概念がないため状態で絞らない)", () => {
    expect(observeSession(sessionFixture())).toEqual({ recipeKey: 'v1|alpha', metricKind: 'steadyRpm', value: 1200 });
  });

  it("courseRun は lapTimeS(elapsedTimeS)を finished のときだけ観測する", () => {
    expect(observeCourseRun(courseRunFixture())).toEqual({ recipeKey: 'v1|alpha', metricKind: 'lapTimeS', value: 12.5 });
  });

  it.each(['stalled', 'derailed', 'overheated'] as const)(
    'courseRun: %s は観測しない(完走していない走行がbaselineへ混ざらない)', (status) => {
      expect(observeCourseRun(courseRunFixture({ status }))).toBeNull();
    });

  it('vehicleTestRun は samples の velocityMps 最大値を topSpeedMps として観測する', () => {
    expect(observeVehicleTestRun(vehicleTestRunFixture()))
      .toEqual({ recipeKey: 'v1|alpha', metricKind: 'topSpeedMps', value: 2.25 });
  });

  it('vehicleTestRun: samples が空なら観測しない', () => {
    expect(observeVehicleTestRun(vehicleTestRunFixture({ samples: [] }))).toBeNull();
  });

  it('vehicleTestRun: finished 以外は観測しない', () => {
    expect(observeVehicleTestRun(vehicleTestRunFixture({ status: 'stalled' }))).toBeNull();
  });
});

describe('legacy record(recipeKeyを持たない)は構造的にbaseline候補から外れる', () => {
  it.each([
    ['session', () => observeSession({ ...(sessionFixture() as Record<string, unknown>), recipeKey: undefined } as never)],
    ['courseRun', () => observeCourseRun({ ...(courseRunFixture() as Record<string, unknown>), recipeKey: undefined } as never)],
    ['vehicleTestRun', () => observeVehicleTestRun({ ...(vehicleTestRunFixture() as Record<string, unknown>), recipeKey: undefined } as never)],
  ] as const)('%s のlegacy recordは観測へ変換されない', (_name, observe) => {
    expect(observe()).toBeNull();
  });
});

describe('baseline抽出: 同一recipeKey・同一metricKindのみ', () => {
  const current: RegressionObservation = { recipeKey: 'v1|alpha', metricKind: 'lapTimeS', value: 12.5 };

  it('同一recipeKey・同一metricKindの観測だけを集める', () => {
    const past: (RegressionObservation | null)[] = [
      { recipeKey: 'v1|alpha', metricKind: 'lapTimeS', value: 11.0 },
      { recipeKey: 'v1|beta', metricKind: 'lapTimeS', value: 9.0 },      // 別レシピ
      { recipeKey: 'v1|alpha', metricKind: 'topSpeedMps', value: 3.0 },  // 別指標
      null,                                                              // legacy由来
      { recipeKey: 'v1|alpha', metricKind: 'lapTimeS', value: 13.0 },
    ];
    expect(collectBaselineObservations(current, past)).toEqual([
      { recipeKey: 'v1|alpha', metricKind: 'lapTimeS', value: 11.0 },
      { recipeKey: 'v1|alpha', metricKind: 'lapTimeS', value: 13.0 },
    ]);
  });

  it('current自身はbaselineに含めない(自分との比較は常に差0で無意味)', () => {
    expect(collectBaselineObservations(current, [current])).toEqual([]);
  });

  it('baselineが1件も無い場合は空配列(「比較対象が無い」ことを呼出し側が判別できる)', () => {
    expect(collectBaselineObservations(current, [null, { recipeKey: 'v1|beta', metricKind: 'lapTimeS', value: 9 }]))
      .toEqual([]);
  });
});

describe('current自身の除外は参照同一性による——値が等しい別実体は落ちない(呼出し側の責務)', () => {
  const current: RegressionObservation = { recipeKey: 'v1|alpha', metricKind: 'lapTimeS', value: 12.5 };

  it('値が完全に等しくても別実体ならbaselineに残る(この限界を明示的に固定する)', () => {
    // G7で「保存済み記録を全件observe*で変換してから比較する」実装にすると、当該runの記録も
    // 変換対象に含まれ、変換のたびに新しいオブジェクトが生成されるためここで落ちない。
    // 結果として自分自身が中央値計算へ混入し、本来検出すべき悪化を見逃す方向に働く。
    // したがって**呼出し側が変換前にrecord id等で当該runを除外する**必要がある。
    const equalButDifferentInstance: RegressionObservation = { recipeKey: 'v1|alpha', metricKind: 'lapTimeS', value: 12.5 };
    expect(equalButDifferentInstance).not.toBe(current); // 前提: 別実体である
    expect(equalButDifferentInstance).toEqual(current);  // 前提: 値は等しい

    const result = collectBaselineObservations(current, [equalButDifferentInstance]);

    // 落ちない。これは仕様であり、値ベースの除外にすると「たまたま同値だった正当な過去走行」
    // まで落としてしまうため、そちらは採らない。
    expect(result).toEqual([equalButDifferentInstance]);
  });

  it('同一実体なら落ちる(参照比較が保険として機能していることの担保)', () => {
    expect(collectBaselineObservations(current, [current, current])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// P3-4 G7(§11.2): 実呼出し層。**変換前にrecord idで当該runを除外する**ことを固定する
// ——G6申し送りの落とし穴(参照同一性では同値別実体が落ちず、自分自身がbaselineへ混入して
// 本来検出すべき悪化を見逃す)を、実呼出し側で構造的に塞げているかの検証。
// ---------------------------------------------------------------------------
describe('G7: computeRegressionReport——当該run自身をbaselineへ混ぜない', () => {
  function courseRun(id: string, elapsedTimeS: number, recipeKey = 'v1|alpha') {
    return { kind: 'courseRun' as const, record: courseRunFixture({ id, elapsedTimeS, recipeKey }) };
  }

  it('pastRecordsに当該runが含まれていても、idで除外される', () => {
    const current = courseRun('c-now', 20);
    // 過去は10秒台。currentの20秒は明確な悪化。
    const past = [courseRun('c-1', 10), courseRun('c-2', 10.2), current];

    const report = computeRegressionReport(current, past);

    expect(report).not.toBeNull();
    expect(report!.hasAnomaly).toBe(true);
    // baselineに20秒(自分自身)が混ざっていれば中央値がcurrent側へ引き寄せられる。
    // 10秒台のみで中央値が取られていることを確認する。
    expect(report!.baselineValue).toBeLessThan(11);
  });

  it('別レシピの記録はbaselineに入らない', () => {
    const current = courseRun('c-now', 20);
    const past = [courseRun('c-1', 10, 'v1|beta'), courseRun('c-2', 10, 'v1|gamma')];

    // 同一レシピのbaselineが0件 → 「比較できなかった」を意味するnull
    expect(computeRegressionReport(current, past)).toBeNull();
  });

  it('baselineが無い場合のnullは「悪化なし」ではない(表示文で区別する)', () => {
    const current = courseRun('c-now', 20);

    expect(computeRegressionReport(current, [])).toBeNull();
    expect(formatRegressionReport(null)).toContain('比較できません');
    expect(formatRegressionReport(null)).not.toContain('低下');
  });

  it('未完走の走行はcurrentとして観測されない(null)', () => {
    const current = { kind: 'courseRun' as const, record: courseRunFixture({ id: 'c-now', status: 'stalled' }) };

    expect(computeRegressionReport(current, [courseRun('c-1', 10)])).toBeNull();
  });

  it('悪化がない場合はhasAnomaly:falseで、表示文も「低下」と言わない', () => {
    const current = courseRun('c-now', 10.05);
    const past = [courseRun('c-1', 10), courseRun('c-2', 10.1)];

    const report = computeRegressionReport(current, past);

    expect(report).not.toBeNull();
    expect(report!.hasAnomaly).toBe(false);
    expect(formatRegressionReport(report)).toContain('目立った低下はありません');
  });

  it('悪化時の表示文は事実のみで、原因を特定しない(spec §1.2)', () => {
    const current = courseRun('c-now', 20);
    const report = computeRegressionReport(current, [courseRun('c-1', 10), courseRun('c-2', 10)]);

    const text = formatRegressionReport(report);
    expect(text).toContain('低下');
    expect(text).toContain('%');
    expect(text).not.toMatch(/原因|磁石|ブラシ|ギヤ|交換|べき/);
  });
});

// UI(実験ノート)は3腕すべてでcomputeRegressionReportを呼ぶ(§11.2・G6追加裁定)。
// courseRun腕は上のdescribeで固定済みなので、残る2腕を同じ規律で固定する。
describe('G7: computeRegressionReport——session腕・vehicleTestRun腕', () => {
  function session(id: string, steadyRpm: number, recipeKey = 'v1|alpha') {
    return { kind: 'session' as const, record: sessionFixture({ id, steadyRpm, recipeKey }) };
  }
  function testRun(id: string, topSpeedMps: number, over: Record<string, unknown> = {}) {
    return {
      kind: 'vehicleTestRun' as const,
      record: vehicleTestRunFixture({ id, samples: [{ timeS: 0, velocityMps: topSpeedMps, positionM: 0 }], ...over }),
    };
  }

  it('session腕: 当該runはidで除外され、回転数の低下を検出する', () => {
    const current = session('s-now', 600);
    const past = [session('s-1', 1200), session('s-2', 1180), current];

    const report = computeRegressionReport(current, past);

    expect(report).not.toBeNull();
    expect(report!.hasAnomaly).toBe(true);
  });

  it('session腕は完走概念が無いため全件が観測対象になる(状態で絞らない)', () => {
    // 過去1件でもbaselineが成立し、nullにならない。
    expect(computeRegressionReport(session('s-now', 1200), [session('s-1', 1200)])).not.toBeNull();
  });

  it('vehicleTestRun腕: 当該runはidで除外され、最高速の低下を検出する', () => {
    const current = testRun('v-now', 1.0);
    const past = [testRun('v-1', 3.0), testRun('v-2', 2.9), current];

    const report = computeRegressionReport(current, past);

    expect(report).not.toBeNull();
    expect(report!.hasAnomaly).toBe(true);
  });

  it('vehicleTestRun腕: samplesが空だと観測できずnull(最高速が存在しない)', () => {
    const current = { kind: 'vehicleTestRun' as const, record: vehicleTestRunFixture({ id: 'v-now', samples: [] }) };
    expect(computeRegressionReport(current, [testRun('v-1', 3.0)])).toBeNull();
  });

  it('vehicleTestRun腕: 未完走はcurrentとして観測されない', () => {
    const current = testRun('v-now', 1.0, { status: 'derailed' });
    expect(computeRegressionReport(current, [testRun('v-1', 3.0), testRun('v-2', 2.9)])).toBeNull();
  });

  it('腕をまたいだ記録はbaselineに入らない(metricKindが異なる)', () => {
    const current = testRun('v-now', 1.0);
    // 同じrecipeKeyのsession記録しか無い場合、比較は成立しない。
    expect(computeRegressionReport(current, [session('s-1', 1200), session('s-2', 1180)])).toBeNull();
  });
});
