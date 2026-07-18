import { computeMaxTurns, step, type MotorConfig, type SimState } from '../src/engine/motorPhysics';
import { FLICK_INITIAL_OMEGA, OMEGA_EPS } from '../src/engine/constants';

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

const DT = 1 / 120;
const WARMUP_SECONDS = 5;
const SAMPLE_COUNT = 1200;
const GRID = {
  coilTurns: [30, 50, 80, 110, 150],
  slitWidthMm: [0.8, 1.5, 2.5],
  sandingQuality: [0.7, 0.9, 1],
  brushPressure: [0.2, 0.3, 0.45],
  magnetStrength: [0.2, 0.5, 0.9],
  magnetDistanceMm: [2, 5, 10, 15, 25],
  batteryVoltage: [1.5, 3] as const,
  axisOffsetMm: [0, 0.5, 2],
  wireGaugeMm: [0.2, 0.4, 0.6, 0.8],
  parallelStrands: [1, 2] as const,
  varnished: [true, false],
};

interface SimResult {
  steadyRpm: number;
  avgCurrentA: number;
  maxCurrentA: number;
  rpmCv: number;
  maxHeat: number;
  shorted: boolean;
  stalled: boolean;
  collapsed: boolean;
}

interface Scenario {
  id: string;
  name: string;
  kind: 'classic' | 'ex';
  locked: Partial<MotorConfig>;
  evalSeconds?: number;
  overrides?: Partial<typeof GRID>;
  accepts?: (result: SimResult) => boolean;
}

const CLASSIC: Scenario[] = [
  { id: 'axis-offset', name: '軸ずれ固定', kind: 'classic', locked: { axisOffsetMm: 2.5 } },
  { id: 'weak-magnet', name: '弱磁石', kind: 'classic', locked: { magnetStrength: 0.2 } },
  { id: 'few-turns', name: '30回巻き', kind: 'classic', locked: { coilTurns: 30 } },
  { id: 'low-voltage', name: '1.5 V', kind: 'classic', locked: { batteryVoltage: 1.5 } },
  { id: 'firm-brush', name: 'ブラシ圧0.40', kind: 'classic', locked: { brushPressure: 0.4 } },
  { id: 'narrow-slit', name: 'スリット0.8 mm', kind: 'classic', locked: { slitWidthMm: 0.8 } },
  { id: 'far-magnet', name: '磁石距離25 mm', kind: 'classic', locked: { magnetDistanceMm: 25 } },
];

const CLASSIC_BASE: Partial<MotorConfig> = {
  wireGaugeMm: 0.4,
  parallelStrands: 1,
  varnished: true,
};

for (const scenario of CLASSIC) {
  scenario.locked = { ...CLASSIC_BASE, ...scenario.locked };
}

const EX: Scenario[] = [
  {
    id: 'ex-current-limit', name: '電流・発熱制限', kind: 'ex', locked: {}, evalSeconds: 30,
    accepts: (result) => result.maxCurrentA <= 0.5 && result.maxHeat <= 0.5,
  },
  {
    id: 'ex-close-magnet', name: '近接磁石・低変動', kind: 'ex', locked: {},
    overrides: { magnetDistanceMm: [2, 3, 5] },
    accepts: (result) => result.rpmCv <= 0.05,
  },
  {
    id: 'ex-no-varnish', name: 'ワニス禁止', kind: 'ex', locked: { varnished: false },
    accepts: (result) => !result.collapsed,
  },
  {
    id: 'ex-thick-wire', name: '線径0.8 mm・1.5 V', kind: 'ex', locked: { wireGaugeMm: 0.8, batteryVoltage: 1.5 } },
];

function pick<T>(values: readonly T[], rng: () => number): T {
  return values[Math.floor(rng() * values.length)];
}

function sampleConfig(scenario: Scenario, rng: () => number): MotorConfig {
  const grid = { ...GRID, ...(scenario.overrides ?? {}) };
  const wireGaugeMm = scenario.locked.wireGaugeMm ?? pick(grid.wireGaugeMm, rng);
  const parallelStrands = scenario.locked.parallelStrands ?? pick(grid.parallelStrands, rng);
  const maxTurns = computeMaxTurns(wireGaugeMm, parallelStrands);
  const requestedTurns = scenario.locked.coilTurns ?? pick(grid.coilTurns, rng);
  return {
    coilTurns: Math.min(requestedTurns, maxTurns),
    slitWidthMm: scenario.locked.slitWidthMm ?? pick(grid.slitWidthMm, rng),
    sandingQuality: scenario.locked.sandingQuality ?? pick(grid.sandingQuality, rng),
    brushPressure: scenario.locked.brushPressure ?? pick(grid.brushPressure, rng),
    magnetStrength: scenario.locked.magnetStrength ?? pick(grid.magnetStrength, rng),
    magnetDistanceMm: scenario.locked.magnetDistanceMm ?? pick(grid.magnetDistanceMm, rng),
    batteryVoltage: scenario.locked.batteryVoltage ?? pick(grid.batteryVoltage, rng),
    axisOffsetMm: scenario.locked.axisOffsetMm ?? pick(grid.axisOffsetMm, rng),
    wireGaugeMm,
    parallelStrands,
    varnished: scenario.locked.varnished ?? pick(grid.varnished, rng),
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function simulate(config: MotorConfig, evalSeconds: number, seed: number): SimResult {
  const rng = mulberry32(seed);
  let state: SimState = {
    theta: 0, omega: FLICK_INITIAL_OMEGA, current: 0, backEmf: 0, shorted: false,
    running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false,
    highSpeedFrameCount: 0,
  };
  for (let index = 0; index < WARMUP_SECONDS / DT; index += 1) state = step(config, state, DT, rng);
  const rpms: number[] = [];
  const currents: number[] = [];
  let maxHeat = state.batteryHeat;
  let shorted = state.shorted;
  for (let index = 0; index < evalSeconds / DT; index += 1) {
    state = step(config, state, DT, rng);
    rpms.push(Math.abs(state.rpm)); currents.push(state.current);
    maxHeat = Math.max(maxHeat, state.batteryHeat); shorted ||= state.shorted;
  }
  const steadyRpm = average(rpms);
  const variance = average(rpms.map((rpm) => (rpm - steadyRpm) ** 2));
  return {
    steadyRpm,
    avgCurrentA: average(currents),
    maxCurrentA: Math.max(0, ...currents),
    rpmCv: steadyRpm > 0 ? Math.sqrt(variance) / steadyRpm : 1,
    maxHeat,
    shorted,
    stalled: Math.abs(state.omega) < OMEGA_EPS,
    collapsed: state.coilCollapsed,
  };
}

function runScenario(scenario: Scenario): void {
  const configRng = mulberry32(0x15_0000 + scenario.id.length);
  const seen = new Set<string>();
  const viable: { config: MotorConfig; result: SimResult }[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const config = sampleConfig(scenario, configRng);
    const key = JSON.stringify(config);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = simulate(config, scenario.evalSeconds ?? 10, 42 + index);
    const baseAccepts = !result.shorted
      && !result.stalled
      && !result.collapsed
      && result.maxHeat < 1
      && result.rpmCv <= 0.1;
    if (baseAccepts && (scenario.accepts?.(result) ?? true)) viable.push({ config, result });
  }
  viable.sort((a, b) => b.result.steadyRpm - a.result.steadyRpm);
  const ceiling = viable[0];
  console.log(`\n=== ${scenario.kind.toUpperCase()} ${scenario.id}: ${scenario.name} ===`);
  console.log(`探索 ${seen.size}件 / 条件達成 ${viable.length}件`);
  if (!ceiling) { console.log('条件達成レシピなし'); return; }
  const ratio = scenario.kind === 'classic' ? 0.97 : 0.96;
  console.log(`上限 ${ceiling.result.steadyRpm.toFixed(0)} RPM / 推奨目標 ${Math.floor(ceiling.result.steadyRpm * ratio)} RPM`);
  console.log(`平均 ${ceiling.result.avgCurrentA.toFixed(3)} A / 最大 ${ceiling.result.maxCurrentA.toFixed(3)} A / CV ${(ceiling.result.rpmCv * 100).toFixed(2)} % / 発熱 ${ceiling.result.maxHeat.toFixed(3)}`);
  console.log(JSON.stringify(ceiling.config));
}

for (const scenario of [...CLASSIC, ...EX]) runScenario(scenario);
