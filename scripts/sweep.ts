// Phase 2チャレンジ設計用の開発ツール(UIには含めない)。
// engine/のstep()を凍結利用し、縛り条件ごとにパラメータをグリッド探索して、
// 「安定を保てる中での最大RPM(上限)」と、そのときの平均電流を出力する。
// この結果を見て data/challenges.ts の targetRpm / star3MaxAvgCurrentA を決める。
//
// 実行: npm run sweep (= vite-node scripts/sweep.ts)
// engine/側の相対importが拡張子なし(Vite/bundler解決前提)のため、Node標準ESM
// ローダーでは解決できない。vite-nodeはVite同様の解決をするため、engine/を
// 一切変更せずに実行できる。
import { step, type MotorConfig, type SimState } from '../src/engine/motorPhysics';
import { FLICK_INITIAL_OMEGA, OMEGA_EPS } from '../src/engine/constants';

// __tests__/prng.ts と同じmulberry32アルゴリズム(テスト専用ディレクトリなのでimportせず複製)
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIXED_DT = 1 / 120;
const WARMUP_STEPS = 5 * 120; // 5秒: 収束待ち
const EVAL_STEPS = 10 * 120; // 10秒: spec §3.6の☆2安定判定と同じ窓
const SEED = 42;

type FreeGrid = { [K in keyof MotorConfig]: number[] };

// 各シナリオで縛られていないパラメータを振る既定グリッド(3〜4値程度に抑え、
// 1シナリオあたりの探索数を実用的な範囲に収める)
const DEFAULT_FREE_GRID: FreeGrid = {
  coilTurns: [40, 80, 120],
  slitWidthMm: [1, 1.5, 2.5],
  sandingQuality: [0.7, 0.9, 1.0],
  brushPressure: [0.15, 0.3, 0.5],
  magnetStrength: [0.2, 0.5, 0.9],
  magnetDistanceMm: [5, 12, 20],
  batteryVoltage: [1.5, 3.0],
  axisOffsetMm: [0, 1, 2],
};

interface Scenario {
  name: string;
  locked: Partial<MotorConfig>;
  // Phase3バランス調整で追加。特定の自由パラメータだけ既定グリッドを差し替える
  // (data/challenges.tsのparamRangesと対応させ、実際にプレイヤーが選べる範囲を反映する)
  freeGridOverrides?: Partial<FreeGrid>;
}

// 試遊の知見(壊れない・ブレない範囲で最大速度を探すのが楽しさの核)に基づく候補。
// 実行結果を見て5〜8個に絞り込む(このスクリプト自体は絞り込みをしない)。
//
// Phase3バランス調整: coilTurnsを固定していない6シナリオには、data/challenges.tsの
// paramRangesと合わせてcoilTurnsの下限を50に引き上げたグリッドを使う
// (「巻き数を減らすほど有利」という縮退戦略を選択肢から外すため。§7受け入れ基準5が
// 保証する物理挙動自体は正しいので、engine側ではなくここで可動域を絞る)。
const COIL_TURNS_FLOOR_OVERRIDE: Partial<FreeGrid> = { coilTurns: [50, 80, 120] };

const SCENARIOS: Scenario[] = [
  { name: '軸ずれ固定(高め)', locked: { axisOffsetMm: 2.5 }, freeGridOverrides: COIL_TURNS_FLOOR_OVERRIDE },
  { name: '弱磁石縛り', locked: { magnetStrength: 0.2 }, freeGridOverrides: COIL_TURNS_FLOOR_OVERRIDE },
  { name: '巻き数少なめ固定', locked: { coilTurns: 30 } },
  { name: '低電圧縛り(1.5V)', locked: { batteryVoltage: 1.5 }, freeGridOverrides: COIL_TURNS_FLOOR_OVERRIDE },
  { name: 'ブラシ圧やや高め固定', locked: { brushPressure: 0.45 }, freeGridOverrides: COIL_TURNS_FLOOR_OVERRIDE },
  { name: 'スリット幅狭め固定', locked: { slitWidthMm: 0.8 }, freeGridOverrides: COIL_TURNS_FLOOR_OVERRIDE },
  { name: '磁石距離固定(遠め)', locked: { magnetDistanceMm: 25 }, freeGridOverrides: COIL_TURNS_FLOOR_OVERRIDE },
];

function cartesianConfigs(scenario: Scenario): MotorConfig[] {
  const grid: FreeGrid = { ...DEFAULT_FREE_GRID, ...(scenario.freeGridOverrides ?? {}) };
  const freeKeys = (Object.keys(grid) as (keyof MotorConfig)[]).filter((key) => !(key in scenario.locked));

  let combos: Partial<MotorConfig>[] = [{}];
  for (const key of freeKeys) {
    const values = grid[key];
    const next: Partial<MotorConfig>[] = [];
    for (const combo of combos) {
      for (const value of values) {
        next.push({ ...combo, [key]: value });
      }
    }
    combos = next;
  }
  return combos.map((combo) => ({ ...combo, ...scenario.locked }) as MotorConfig);
}

interface SimResult {
  steadyRpm: number;
  stable: boolean; // spec §3.6の☆2条件と同じ基準(評価窓の±10%以内)
  avgCurrentA: number;
  shorted: boolean;
  stalled: boolean; // 評価窓終了時点で静止摩擦により停止
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function simulate(config: MotorConfig): SimResult {
  const rng = mulberry32(SEED);
  let state: SimState = {
    theta: 0,
    omega: FLICK_INITIAL_OMEGA,
    current: 0,
    backEmf: 0,
    shorted: false,
    running: true,
    rpm: 0,
    chatterFramesLeft: 0,
  };

  for (let i = 0; i < WARMUP_STEPS; i++) {
    state = step(config, state, FIXED_DT, rng);
  }

  const rpmSamples: number[] = [];
  const currentSamples: number[] = [];
  let shorted = state.shorted;
  for (let i = 0; i < EVAL_STEPS; i++) {
    state = step(config, state, FIXED_DT, rng);
    rpmSamples.push(state.rpm);
    currentSamples.push(state.current);
    shorted = shorted || state.shorted;
  }

  const steadyRpm = average(rpmSamples);
  const maxDeviation = Math.max(...rpmSamples.map((r) => Math.abs(r - steadyRpm)));
  const stable = steadyRpm > 0 && maxDeviation <= steadyRpm * 0.1;
  const avgCurrentA = average(currentSamples);
  const stalled = Math.abs(state.omega) < OMEGA_EPS;

  return { steadyRpm, stable, avgCurrentA, shorted, stalled };
}

function runScenario(scenario: Scenario): void {
  const configs = cartesianConfigs(scenario);
  const results = configs.map((config) => ({ config, result: simulate(config) }));
  const viable = results.filter(
    ({ result }) => !result.shorted && !result.stalled && result.stable,
  );
  viable.sort((a, b) => b.result.steadyRpm - a.result.steadyRpm);

  console.log(`\n=== ${scenario.name} (locked: ${JSON.stringify(scenario.locked)}) ===`);
  console.log(`探索組み合わせ数: ${configs.length} / 安定に到達: ${viable.length}`);

  if (viable.length === 0) {
    console.log('☆2条件(安定)を満たす組み合わせが見つかりませんでした。free gridの見直しが必要です。');
    return;
  }

  const ceiling = viable[0];
  console.log(
    `安定を保てる上限: ${ceiling.result.steadyRpm.toFixed(0)} RPM (平均電流 ${ceiling.result.avgCurrentA.toFixed(3)} A)`,
  );
  console.log(`  config: ${JSON.stringify(ceiling.config)}`);
  console.log(`  targetRpm目安(上限の85〜95%): ${(ceiling.result.steadyRpm * 0.85).toFixed(0)} 〜 ${(ceiling.result.steadyRpm * 0.95).toFixed(0)}`);

  console.log('上位候補(RPM降順、最大5件):');
  for (const { config, result } of viable.slice(0, 5)) {
    console.log(
      `  RPM=${result.steadyRpm.toFixed(0)} avgCurrent=${result.avgCurrentA.toFixed(3)}A  ${JSON.stringify(config)}`,
    );
  }
}

for (const scenario of SCENARIOS) {
  runScenario(scenario);
}
