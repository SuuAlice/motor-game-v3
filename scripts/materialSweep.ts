// Phase 2 Step 9(docs/phase2-plan.md §16移行順9、docs/phase2-step9-plan.md v9)。
// 素材写像(materialMapping.ts)の物性検証sweep。Phase2ゲート「写像の物性検証sweep」
// (docs/spec.md §12)の提出物(A)。engine/・materialMapping.ts・materials.tsは
// 一切変更しない、独立した読み取り専用スクリプト。
//
// sweep対象は実際に写像が存在する4ファミリー(導線・磁石・ギヤ・電池)の全組合せ
// (4×4×4×3=192)のみ。coating・brush・substrate・roller・bodyの5ファミリーは
// materialMapping.tsが未接続のため対象外・coverage gap(docs/phase2-step9-plan.md §1)。
//
// v7再較正: 当初REPRESENTATIVE_*(materialMapping.test.tsの数値伝播テスト用fixture)を
// トラック走行の土台にしたところ、多くの素材構成でfailureToStart/overheatedになり
// 実走行できないことが判明した(docs/phase2-step9-plan.md §16)。読み取り専用診断
// (§17)で実走行可能なRUNNABLE_BASE_CONFIGを確定し、トラックを走らせる全run(健全性
// 走査・ギヤトレードオフ・破産防止・容量関連)はこちらを土台とする。REPRESENTATIVE_*は
// 起動時自己検証(素材写像テーブルのドリフト検知)専用として独立に維持する。

import {
  composeConfigFromMaterials,
  computeBatteryCapacityRatioCalibration,
  type MaterialCompositionBaseline,
  type MaterialSelection,
} from '../src/materials/materialMapping';
import { BATTERY_MATERIALS, GEAR_MATERIALS, MAGNET_MATERIALS, WIRE_MATERIALS } from '../src/materials/materials';
import { computeCoggingTorque, computeElectricalState, computeMaxTurns, type MotorConfig } from '../src/engine/motorPhysics';
import { createInitialVehicleState, type CarConfig, type VehicleSimState } from '../src/engine/vehiclePhysics';
import { createValidatedTrack, stepTrackRun, type ValidatedTrackDefinition } from '../src/engine/trackPhysics';
import { TRACK_BY_ID } from '../src/data/tracks';

const DT = 1 / 120;
const SEED = 0x900_2026;
const MAX_SIM_SECONDS = 15;
const MAX_SIM_SECONDS_CAPACITY = 120;
const WALL_CLOCK_TARGET_S = 10;

// ---------------------------------------------------------------------------
// 決定論的PRNG(既存scripts/sweep.ts・scripts/vehicleSweep.tsと同型の独立実装、
// docs/phase2-step9-plan.md §3「既存sweepとの再利用境界」により共通化はしない)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 代表構成(docs/phase2-step9-plan.md §2)
// ---------------------------------------------------------------------------
const V2_REGRESSION_ANCHOR_SELECTION: MaterialSelection = {
  wireId: 'wire-copper-standard',
  magnetId: 'magnet-ferrite',
  gearId: 'gear-pom',
  batteryId: 'battery-alkaline',
};

const MINIMUM_TIER_SELECTION: MaterialSelection = {
  wireId: 'wire-aluminum',
  magnetId: 'magnet-ferrite',
  gearId: 'gear-pom',
  batteryId: 'battery-alkaline',
};

const TOP_TIER_SELECTION: MaterialSelection = {
  wireId: 'wire-silver',
  magnetId: 'magnet-neodymium',
  gearId: 'gear-peek',
  batteryId: 'battery-lithium-polymer',
};

// materialMapping.test.tsのbaseMotorConfig/baseCarConfig/CANONICAL_BASELINEと同じ値を
// 根拠コメント付きで再掲する(testファイルは非export・productionからimport不可のため、
// docs/phase2-step9-plan.md §3)。magnetStrength/massG/gearEfficiencyは
// composeConfigFromMaterialsが上書き・無視するプレースホルダ値であり、sweep結果には
// 影響しない。
const REPRESENTATIVE_MOTOR_CONFIG: MotorConfig = {
  coilTurns: 80,
  slitWidthMm: 1.5,
  sandingQuality: 0.9,
  brushPressure: 0.3,
  magnetStrength: 0.5, // composeConfigFromMaterialsが上書きするプレースホルダ
  magnetDistanceMm: 10,
  batteryVoltage: 3,
  axisOffsetMm: 0,
  wireGaugeMm: 0.4,
  parallelStrands: 1,
  varnished: true,
};

const REPRESENTATIVE_CAR_CONFIG: CarConfig = {
  massG: 999, // composeConfigFromMaterialsが無視するプレースホルダ
  gearEfficiency: 0.123, // 同上
  gearRatio: 4,
  wheelDiameterMm: 30,
  tireGrip: 0.7,
  axleFriction: 0,
  wheelAlignmentMm: 0,
  centerOfMassHeightMm: 20,
  motorMountOffsetMm: 0,
};

const REPRESENTATIVE_BASELINE: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 0.8 };

// ---------------------------------------------------------------------------
// RUNNABLE_BASE_CONFIG(docs/phase2-step9-plan.md §2、v7で確定)。トラック走行を
// 伴う全run(健全性走査・ギヤトレードオフ・破産防止・容量関連)の共通土台。
// scripts/vehicleSweep.tsのMOTOR_CANDIDATES[7]相当+CAR_GRIDのコーナー点
// (低gearRatio寄り・高grip・低重心)+baseGearEfficiency=0.9(V2互換基準のfast)。
// 読み取り専用bounded診断(§17、リポジトリ外スクリプト)で、minimum-tierが
// straight-10mを完走できることを確認済み。素材較正値・engine定数は変更していない。
// ---------------------------------------------------------------------------
// coilTurnsは呼び出し側で明示的にcomputeMaxTurnsへクランプする契約(computeRCoil/computeJ/
// backEmf計算はconfig.coilTurnsをそのまま使い、engine側の自動クランプは存在しない)。
// scripts/vehicleSweep.tsのMOTOR_CANDIDATESと同型の明示クランプを適用する
// (18節、(A)再実装後のゲート反転の原因診断・限定修正)。
const RUNNABLE_MOTOR_CONFIG_TEMPLATE: MotorConfig = {
  coilTurns: Math.min(110, computeMaxTurns(0.8, 1)),
  slitWidthMm: 2.5,
  sandingQuality: 1,
  brushPressure: 0.25,
  magnetStrength: 0.5, // composeConfigFromMaterialsが上書きするプレースホルダ
  magnetDistanceMm: 8,
  batteryVoltage: 3,
  axisOffsetMm: 0,
  wireGaugeMm: 0.8,
  parallelStrands: 1,
  varnished: true,
};

const RUNNABLE_CAR_CONFIG_TEMPLATE: CarConfig = {
  massG: 999, // composeConfigFromMaterialsが無視するプレースホルダ
  gearEfficiency: 0.123, // 同上
  gearRatio: 4,
  wheelDiameterMm: 30,
  tireGrip: 1,
  axleFriction: 0,
  wheelAlignmentMm: 0,
  centerOfMassHeightMm: 12,
  motorMountOffsetMm: 0,
};

const RUNNABLE_BASELINE: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 0.9 };

// ---------------------------------------------------------------------------
// 起動時の自己検証(Fable条件1、docs/phase2-step9-plan.md §3)。V2回帰anchorの
// 合成結果が既知の厳密値と一致しない場合、sweep全体が誤った基準点を測り続ける
// 事故を防ぐため即座に異常終了する。
// ---------------------------------------------------------------------------
function runSelfCheck(): void {
  const v2AnchorCheck = composeConfigFromMaterials(REPRESENTATIVE_MOTOR_CONFIG, REPRESENTATIVE_CAR_CONFIG, REPRESENTATIVE_BASELINE, V2_REGRESSION_ANCHOR_SELECTION);
  if (!v2AnchorCheck.ok) {
    console.error(`起動時自己検証に失敗(compose自体が失敗): ${v2AnchorCheck.reason}`);
    process.exit(1);
  }
  const { motorConfig: mc, carConfig: cc } = v2AnchorCheck;
  const failures: string[] = [];
  if (mc.wireResistivityRatio !== 1.0) failures.push(`wireResistivityRatio=${mc.wireResistivityRatio}(期待値1.0)`);
  if (mc.wireDensityRatio !== 1.0) failures.push(`wireDensityRatio=${mc.wireDensityRatio}(期待値1.0)`);
  if (mc.batteryInternalResistanceRatio !== 1.0) failures.push(`batteryInternalResistanceRatio=${mc.batteryInternalResistanceRatio}(期待値1.0)`);
  if (mc.batteryCapacityRatio !== 1.0) failures.push(`batteryCapacityRatio=${mc.batteryCapacityRatio}(期待値1.0)`);
  if (mc.magnetStrength !== 0.2) failures.push(`magnetStrength=${mc.magnetStrength}(期待値0.2、フェライト較正値)`);
  if (cc.gearEfficiency !== REPRESENTATIVE_BASELINE.baseGearEfficiency) {
    failures.push(`gearEfficiency=${cc.gearEfficiency}(期待値${REPRESENTATIVE_BASELINE.baseGearEfficiency}、POM=1.00のため合成後もbaseline値のまま)`);
  }
  if (failures.length > 0) {
    console.error(`起動時自己検証に失敗: ${failures.join(', ')}`);
    console.error('3節のREPRESENTATIVE_*値がproductionの較正値と乖離している可能性があります。sweepを中断します。');
    process.exit(1);
  }
  console.log('起動時自己検証: PASS(V2回帰anchorの合成結果が既知の厳密値と一致)');
}

// ---------------------------------------------------------------------------
// トラック(docs/phase2-step9-plan.md §4)
// ---------------------------------------------------------------------------
const STRAIGHT_10M = TRACK_BY_ID.get('straight-10m')!;
const ENERGY_RUN = TRACK_BY_ID.get('energy-run')!;

// sweep専用の電池容量検証コース。既存BATTERY_CAPACITY_J_3_0V=80Jに対し、既存energy-run
// (15m)のmaxEnergy目標が28J程度であることから、大まかに数十m相当でも予算超過に
// 達しうると見積れるが、安全側に長く300mを起点とする。実測して最も大きい容量
// (80J×1.3=104J)構成でもenergyExhaustedへ到達しない場合は距離を増やす。
const CAPACITY_CHECK_TRACK: ValidatedTrackDefinition = createValidatedTrack({
  id: 'material-sweep-capacity-check',
  name: '(sweep専用)電池容量検証コース',
  description: '電池容量ratioの効果を確実に観測するための長距離直線(sweep専用、TRACKSには追加しない)',
  segments: [{ lengthM: 300, slopeDeg: 0, surfaceGrip: 1, roughness: 0 }],
  hasEnergyBudget: true,
  objectives: [],
});

// ---------------------------------------------------------------------------
// run実行ヘルパー
// ---------------------------------------------------------------------------
type RunTag = 'health-scan' | 'capacity-only' | 'battery-species' | 'gear-tradeoff' | 'tier-comparison' | 'energy-run-reference' | 'v2-anchor-reference';

function runUntilTerminal(motorConfig: MotorConfig, carConfig: CarConfig, track: ValidatedTrackDefinition, seed: number, maxSimSeconds: number): { state: VehicleSimState; allFinite: boolean } {
  let state = createInitialVehicleState(motorConfig, carConfig);
  const rng = mulberry32(seed);
  const maxSteps = Math.ceil(maxSimSeconds / DT);
  let allFinite = true;
  for (let i = 0; i < maxSteps; i++) {
    if (state.status !== 'ready' && state.status !== 'running') break;
    state = stepTrackRun(motorConfig, carConfig, track, state, DT, rng);
    if (!isStateFinite(state)) {
      allFinite = false;
      break;
    }
  }
  return { state, allFinite };
}

function isStateFinite(state: VehicleSimState): boolean {
  return (
    Number.isFinite(state.positionM) &&
    Number.isFinite(state.velocityMps) &&
    Number.isFinite(state.energyUsedJ) &&
    Number.isFinite(state.elapsedTimeS) &&
    Number.isFinite(state.motor.theta) &&
    Number.isFinite(state.motor.omega) &&
    Number.isFinite(state.motor.current) &&
    Number.isFinite(state.motor.rpm)
  );
}

function logRun(tag: RunTag, seed: number, label: string, detail: string): void {
  console.log(`[${tag} seed=0x${seed.toString(16)}] ${label}: ${detail}`);
}

// ---------------------------------------------------------------------------
// 主軸: 192通り全組合せの健全性走査(straight-10m、7.1節)
// ---------------------------------------------------------------------------
interface HealthScanResult {
  selection: MaterialSelection;
  ok: boolean;
  reason?: string;
  finalStatus?: VehicleSimState['status'];
}

function runHealthScan(): HealthScanResult[] {
  const results: HealthScanResult[] = [];
  let comboIndex = 0;
  for (const wire of WIRE_MATERIALS) {
    for (const magnet of MAGNET_MATERIALS) {
      for (const gear of GEAR_MATERIALS) {
        for (const battery of BATTERY_MATERIALS) {
          const selection: MaterialSelection = { wireId: wire.id, magnetId: magnet.id, gearId: gear.id, batteryId: battery.id };
          const composed = composeConfigFromMaterials(RUNNABLE_MOTOR_CONFIG_TEMPLATE, RUNNABLE_CAR_CONFIG_TEMPLATE, RUNNABLE_BASELINE, selection);
          const seed = SEED + comboIndex;
          if (!composed.ok) {
            logRun('health-scan', seed, `${wire.id}×${magnet.id}×${gear.id}×${battery.id}`, `compose失敗: ${composed.reason}`);
            results.push({ selection, ok: false, reason: composed.reason });
            comboIndex++;
            continue;
          }
          // 写像後の全数値フィールドが有限であることを確認する(7.1節)
          const mc = composed.motorConfig;
          const cc = composed.carConfig;
          const mappedFinite =
            Number.isFinite(mc.wireResistivityRatio) &&
            Number.isFinite(mc.wireDensityRatio) &&
            Number.isFinite(mc.magnetStrength) &&
            Number.isFinite(mc.batteryInternalResistanceRatio) &&
            Number.isFinite(mc.batteryCapacityRatio) &&
            Number.isFinite(cc.gearEfficiency) &&
            Number.isFinite(cc.massG) &&
            cc.massG >= 80 &&
            cc.massG <= 250;
          if (!mappedFinite) {
            logRun('health-scan', seed, `${wire.id}×${magnet.id}×${gear.id}×${battery.id}`, '写像後の数値が非有限または既存clamp帯域[80,250]gの範囲外');
            results.push({ selection, ok: false, reason: 'mapped-config-invalid' });
            comboIndex++;
            continue;
          }
          const { state, allFinite } = runUntilTerminal(mc, cc, STRAIGHT_10M, seed, MAX_SIM_SECONDS);
          const nonNegativeOk = state.energyUsedJ >= 0 && state.elapsedTimeS >= 0;
          const ok = allFinite && nonNegativeOk;
          logRun('health-scan', seed, `${wire.id}×${magnet.id}×${gear.id}×${battery.id}`, `status=${state.status} finite=${allFinite} energyUsedJ=${state.energyUsedJ.toFixed(3)} elapsedTimeS=${state.elapsedTimeS.toFixed(3)}`);
          results.push({ selection, ok, finalStatus: state.status, reason: ok ? undefined : 'non-finite-or-negative' });
          comboIndex++;
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 7.2節: 写像パラメータレベルの単調性(乱数非依存、seed不要)
// ---------------------------------------------------------------------------
const LOCK_THETA = Math.PI / 4;

function checkWireMonotonicity(): boolean {
  const currents = WIRE_MATERIALS.map((wire) => {
    const selection: MaterialSelection = { ...V2_REGRESSION_ANCHOR_SELECTION, wireId: wire.id };
    const composed = composeConfigFromMaterials(RUNNABLE_MOTOR_CONFIG_TEMPLATE, RUNNABLE_CAR_CONFIG_TEMPLATE, RUNNABLE_BASELINE, selection);
    if (!composed.ok) throw new Error(`wire monotonicity check: compose失敗 ${wire.id}: ${composed.reason}`);
    return computeElectricalState(composed.motorConfig, LOCK_THETA, 0).current;
  });
  // WIRE_MATERIALSはtierIndex順(アルミ→銅→銀メッキ銅線→銀、抵抗率降順)なので、
  // 電流は単調増加する必要がある
  return currents.every((c, i) => i === 0 || c > currents[i - 1]);
}

function checkMagnetMonotonicity(): boolean {
  const coggingMagnitudes = MAGNET_MATERIALS.map((magnet) => {
    const selection: MaterialSelection = { ...V2_REGRESSION_ANCHOR_SELECTION, magnetId: magnet.id };
    const composed = composeConfigFromMaterials(RUNNABLE_MOTOR_CONFIG_TEMPLATE, RUNNABLE_CAR_CONFIG_TEMPLATE, RUNNABLE_BASELINE, selection);
    if (!composed.ok) throw new Error(`magnet monotonicity check: compose失敗 ${magnet.id}: ${composed.reason}`);
    return Math.abs(computeCoggingTorque(composed.motorConfig, LOCK_THETA));
  });
  return coggingMagnitudes.every((v, i) => i === 0 || v > coggingMagnitudes[i - 1]);
}

function checkBatteryMonotonicity(): boolean {
  const currents = BATTERY_MATERIALS.map((battery) => {
    const selection: MaterialSelection = { ...V2_REGRESSION_ANCHOR_SELECTION, batteryId: battery.id };
    const composed = composeConfigFromMaterials(RUNNABLE_MOTOR_CONFIG_TEMPLATE, RUNNABLE_CAR_CONFIG_TEMPLATE, RUNNABLE_BASELINE, selection);
    if (!composed.ok) throw new Error(`battery monotonicity check: compose失敗 ${battery.id}: ${composed.reason}`);
    return computeElectricalState(composed.motorConfig, LOCK_THETA, 0).current;
  });
  // BATTERY_MATERIALSはtierIndex順(アルカリ→NiMH→LiPo、内部抵抗ratio降順)なので、
  // 電流は単調増加する必要がある
  return currents.every((c, i) => i === 0 || c > currents[i - 1]);
}

// ---------------------------------------------------------------------------
// 比較専用run(単一変数の因果比較、グループ内は同一seed。docs/phase2-step9-plan.md §5)
// ---------------------------------------------------------------------------
const SEED_GEAR_TRADEOFF = SEED + 100_000;
const SEED_TIER_COMPARISON = SEED + 200_000;
const SEED_CAPACITY_ONLY = SEED + 300_000;
const SEED_BATTERY_SPECIES = SEED + 400_000;
const SEED_ENERGY_RUN_REFERENCE = SEED + 500_000;
const SEED_V2_ANCHOR_REFERENCE = SEED + 600_000;

function composeOrThrow(selection: MaterialSelection): { motorConfig: MotorConfig; carConfig: CarConfig } {
  const composed = composeConfigFromMaterials(RUNNABLE_MOTOR_CONFIG_TEMPLATE, RUNNABLE_CAR_CONFIG_TEMPLATE, RUNNABLE_BASELINE, selection);
  if (!composed.ok) throw new Error(`compose失敗: ${composed.reason}`);
  return { motorConfig: composed.motorConfig, carConfig: composed.carConfig };
}

// ギヤトレードオフ比較(POM vs チタン、7.3節)。v7: 固定材質をV2回帰anchor(銅線+
// フェライトはRUNNABLE_BASE_CONFIG下でも過熱しやすい)からminimum-tierと同じ
// アルミ線/フェライト/アルカリへ変更した。
function runGearTradeoffComparison(): { pomOk: boolean; titaniumWorse: boolean } {
  const pom = composeOrThrow(MINIMUM_TIER_SELECTION);
  const titanium = composeOrThrow({ ...MINIMUM_TIER_SELECTION, gearId: 'gear-titanium' });
  const pomRun = runUntilTerminal(pom.motorConfig, pom.carConfig, STRAIGHT_10M, SEED_GEAR_TRADEOFF, MAX_SIM_SECONDS);
  const tiRun = runUntilTerminal(titanium.motorConfig, titanium.carConfig, STRAIGHT_10M, SEED_GEAR_TRADEOFF, MAX_SIM_SECONDS);
  logRun('gear-tradeoff', SEED_GEAR_TRADEOFF, 'gear-pom', `status=${pomRun.state.status} elapsedTimeS=${pomRun.state.elapsedTimeS.toFixed(3)} energyUsedJ=${pomRun.state.energyUsedJ.toFixed(3)}`);
  logRun('gear-tradeoff', SEED_GEAR_TRADEOFF, 'gear-titanium', `status=${tiRun.state.status} elapsedTimeS=${tiRun.state.elapsedTimeS.toFixed(3)} energyUsedJ=${tiRun.state.energyUsedJ.toFixed(3)}`);
  const pomOk = pomRun.state.status === 'finished' && tiRun.state.status === 'finished';
  const titaniumWorse = pomOk && (tiRun.state.elapsedTimeS > pomRun.state.elapsedTimeS || tiRun.state.energyUsedJ > pomRun.state.energyUsedJ);
  return { pomOk, titaniumWorse };
}

// minimum-tier対最上位構成の参考比較(7.4節)
function runTierComparison(): { minimumTierFinished: boolean; topTierFinished: boolean; ratio: number | null } {
  const minTier = composeOrThrow(MINIMUM_TIER_SELECTION);
  const topTier = composeOrThrow(TOP_TIER_SELECTION);
  const minRun = runUntilTerminal(minTier.motorConfig, minTier.carConfig, STRAIGHT_10M, SEED_TIER_COMPARISON, MAX_SIM_SECONDS);
  const topRun = runUntilTerminal(topTier.motorConfig, topTier.carConfig, STRAIGHT_10M, SEED_TIER_COMPARISON, MAX_SIM_SECONDS);
  logRun('tier-comparison', SEED_TIER_COMPARISON, 'minimum-tier(aluminum/ferrite/pom/alkaline)', `status=${minRun.state.status} elapsedTimeS=${minRun.state.elapsedTimeS.toFixed(3)}`);
  logRun('tier-comparison', SEED_TIER_COMPARISON, 'top-tier(silver/neodymium/peek/lipo)', `status=${topRun.state.status} elapsedTimeS=${topRun.state.elapsedTimeS.toFixed(3)}`);
  const minimumTierFinished = minRun.state.status === 'finished';
  const topTierFinished = topRun.state.status === 'finished';
  const ratio = minimumTierFinished && topTierFinished ? minRun.state.elapsedTimeS / topRun.state.elapsedTimeS : null;
  return { minimumTierFinished, topTierFinished, ratio };
}

// 容量ratio単独ゲート(4節(i))。v7: 土台をminimum-tier(アルミ線/フェライト/POM/
// アルカリ)+RUNNABLE_BASE_CONFIGへ変更(旧V2回帰anchorはfailureToStartになるため)。
function runCapacityOnlyGate(): { bothReachedExhaustion: boolean; highFartherThanBaseline: boolean } {
  const alkalineComposed = composeOrThrow(MINIMUM_TIER_SELECTION);
  const capacityOnlyBaseline: MotorConfig = { ...alkalineComposed.motorConfig, batteryCapacityRatio: 1.0 };
  const capacityOnlyHigh: MotorConfig = { ...alkalineComposed.motorConfig, batteryCapacityRatio: 1.3 };
  const baselineRun = runUntilTerminal(capacityOnlyBaseline, alkalineComposed.carConfig, CAPACITY_CHECK_TRACK, SEED_CAPACITY_ONLY, MAX_SIM_SECONDS_CAPACITY);
  const highRun = runUntilTerminal(capacityOnlyHigh, alkalineComposed.carConfig, CAPACITY_CHECK_TRACK, SEED_CAPACITY_ONLY, MAX_SIM_SECONDS_CAPACITY);
  logRun('capacity-only', SEED_CAPACITY_ONLY, 'capacityRatio=1.0', `status=${baselineRun.state.status} failureCode=${baselineRun.state.failureCode ?? 'なし'} positionM=${baselineRun.state.positionM.toFixed(2)}`);
  logRun('capacity-only', SEED_CAPACITY_ONLY, 'capacityRatio=1.3', `status=${highRun.state.status} failureCode=${highRun.state.failureCode ?? 'なし'} positionM=${highRun.state.positionM.toFixed(2)}`);
  const baselineExhausted = baselineRun.state.status === 'stalled' && baselineRun.state.failureCode === 'energyExhausted';
  const highExhausted = highRun.state.status === 'stalled' && highRun.state.failureCode === 'energyExhausted';
  const bothReachedExhaustion = baselineExhausted && highExhausted;
  const highFartherThanBaseline = bothReachedExhaustion && highRun.state.positionM > baselineRun.state.positionM;
  // 追加の健全性確認(4節(c)): アルカリ・NiMHの容量ratioがともに厳密1.0であること
  const alkalineCapacity = computeBatteryCapacityRatioCalibration(BATTERY_MATERIALS.find((m) => m.id === 'battery-alkaline')!);
  const nimhCapacity = computeBatteryCapacityRatioCalibration(BATTERY_MATERIALS.find((m) => m.id === 'battery-nickel-metal-hydride')!);
  const capacityTableOk = alkalineCapacity.ok && nimhCapacity.ok && alkalineCapacity.ratio === 1.0 && nimhCapacity.ratio === 1.0;
  console.log(`capacity-only: アルカリ/NiMH容量ratioテーブル確認 = ${capacityTableOk ? 'PASS' : 'FAIL'}`);
  return { bothReachedExhaustion, highFartherThanBaseline };
}

// 実素材電池3種の総合結果(参考情報、4節(ii))。v7: 導線/磁石/ギヤをminimum-tier
// (アルミ線/フェライト/POM)へ固定。
function runBatterySpeciesReference(): void {
  for (const battery of BATTERY_MATERIALS) {
    const composed = composeOrThrow({ ...MINIMUM_TIER_SELECTION, batteryId: battery.id });
    const run = runUntilTerminal(composed.motorConfig, composed.carConfig, CAPACITY_CHECK_TRACK, SEED_BATTERY_SPECIES, MAX_SIM_SECONDS_CAPACITY);
    logRun('battery-species', SEED_BATTERY_SPECIES, battery.id, `status=${run.state.status} failureCode=${run.state.failureCode ?? 'なし'} positionM=${run.state.positionM.toFixed(2)}(参考情報、容量ratio単独の証明ではない)`);
  }
}

// energy-run参考走行(4節)。v7: 導線/磁石/ギヤをminimum-tier(アルミ線/フェライト/
// POM)へ固定。
function runEnergyRunReference(): void {
  for (const battery of BATTERY_MATERIALS) {
    const composed = composeOrThrow({ ...MINIMUM_TIER_SELECTION, batteryId: battery.id });
    const run = runUntilTerminal(composed.motorConfig, composed.carConfig, ENERGY_RUN, SEED_ENERGY_RUN_REFERENCE, MAX_SIM_SECONDS);
    logRun('energy-run-reference', SEED_ENERGY_RUN_REFERENCE, battery.id, `status=${run.state.status} energyUsedJ=${run.state.energyUsedJ.toFixed(3)} elapsedTimeS=${run.state.elapsedTimeS.toFixed(3)}(参考情報、ゲート対象外)`);
  }
}

// V2回帰anchor参考run(v8新設、Fable条件2(i))。RUNNABLE_BASE_CONFIG上でV2回帰anchor
// (銅線/フェライト/POM/アルカリ)を1回走らせ、完走可否・過熱の有無を参考記録する。
// ゲート対象外(合否判定には使わない)。
function runV2AnchorReference(): { status: VehicleSimState['status']; overheated: boolean } {
  const composed = composeOrThrow(V2_REGRESSION_ANCHOR_SELECTION);
  const run = runUntilTerminal(composed.motorConfig, composed.carConfig, STRAIGHT_10M, SEED_V2_ANCHOR_REFERENCE, MAX_SIM_SECONDS);
  logRun(
    'v2-anchor-reference',
    SEED_V2_ANCHOR_REFERENCE,
    'v2-regression-anchor(copper-standard/ferrite/pom/alkaline)',
    `status=${run.state.status} elapsedTimeS=${run.state.elapsedTimeS.toFixed(3)}(参考情報、ゲート対象外。銅線+フェライトの過熱レジーム所見)`,
  );
  return { status: run.state.status, overheated: run.state.status === 'overheated' };
}

// ---------------------------------------------------------------------------
// 実行本体
// ---------------------------------------------------------------------------
const wallClockStart = Date.now();

runSelfCheck();

console.log('\n=== 主軸: 192通り全組合せ健全性走査(straight-10m) ===');
const healthScanResults = runHealthScan();
const healthScanAllOk = healthScanResults.every((r) => r.ok);
console.log(`健全性走査: ${healthScanResults.length}件中${healthScanResults.filter((r) => r.ok).length}件がPASS`);

console.log('\n=== 7.2節: 写像パラメータレベルの単調性(乱数非依存) ===');
const wireMonotonic = checkWireMonotonicity();
const magnetMonotonic = checkMagnetMonotonicity();
const batteryMonotonic = checkBatteryMonotonicity();
console.log(`導線(ロック電流)単調性: ${wireMonotonic ? 'PASS' : 'FAIL'}`);
console.log(`磁石(コギング振幅)単調性: ${magnetMonotonic ? 'PASS' : 'FAIL'}`);
console.log(`電池(ロック電流)単調性: ${batteryMonotonic ? 'PASS' : 'FAIL'}`);

console.log('\n=== 7.3節: 上位ティアの実在トレードオフ ===');
const magnetTradeoffConfirmed = magnetMonotonic; // フェライト<ネオジムのコギング増加は単調性チェックと同一指標
const gearTradeoff = runGearTradeoffComparison();
console.log(`磁石トレードオフ(ネオジムのコギング増加): ${magnetTradeoffConfirmed ? 'PASS' : 'FAIL'}`);
console.log(`ギヤトレードオフ(チタンのgearEfficiency低下が実走行で劣る): ${gearTradeoff.pomOk && gearTradeoff.titaniumWorse ? 'PASS' : 'FAIL'}`);

console.log('\n=== 7.4節: 破産防止設計の物理的前提(参考: minimum-tier対最上位構成) ===');
const tierComparison = runTierComparison();
console.log(`minimum-tier完走: ${tierComparison.minimumTierFinished ? 'PASS' : 'FAIL'}`);
if (tierComparison.ratio !== null) {
  console.log(`参考: minimum-tier/最上位構成のelapsedTimeS比 = ${tierComparison.ratio.toFixed(3)}`);
}

console.log('\n=== 4節: 容量ratio単独ゲート・参考情報 ===');
const capacityOnly = runCapacityOnlyGate();
console.log(`容量ratio単独ゲート: ${capacityOnly.bothReachedExhaustion && capacityOnly.highFartherThanBaseline ? 'PASS' : 'FAIL'}`);
runBatterySpeciesReference();
runEnergyRunReference();

console.log('\n=== 9節: V2回帰anchor参考run(ゲート対象外、過熱レジーム所見) ===');
const v2AnchorReference = runV2AnchorReference();
if (v2AnchorReference.overheated) {
  console.log('所見: 銅線+フェライトはRUNNABLE_BASE_CONFIG下でもoverheatedになった(中位ティアが最低ティアより脆い動作点、spec §4.1のピーキーさに直結する実測知見)');
}

const wallClockElapsedS = (Date.now() - wallClockStart) / 1000;

console.log('\n=== 4ゲートPASS/FAILサマリ(Fable推奨、alice裁量で採用) ===');
const gateNanSafety = healthScanAllOk;
const gateMonotonicity = wireMonotonic && magnetMonotonic && batteryMonotonic;
const gateTradeoff = magnetTradeoffConfirmed && gearTradeoff.pomOk && gearTradeoff.titaniumWorse;
const gateBankruptcyPrevention = tierComparison.minimumTierFinished;
console.log(`GATE nan-safety: ${gateNanSafety ? 'PASS' : 'FAIL'}`);
console.log(`GATE monotonicity: ${gateMonotonicity ? 'PASS' : 'FAIL'}`);
console.log(`GATE tradeoff: ${gateTradeoff ? 'PASS' : 'FAIL'}`);
console.log(`GATE bankruptcy-prevention: ${gateBankruptcyPrevention ? 'PASS' : 'FAIL'}`);
console.log(`GATE capacity-ratio-only: ${capacityOnly.bothReachedExhaustion && capacityOnly.highFartherThanBaseline ? 'PASS' : 'FAIL'}`);
console.log(`wall-clock: ${wallClockElapsedS.toFixed(2)}s(目標${WALL_CLOCK_TARGET_S}s)`);

const allGatesPass = gateNanSafety && gateMonotonicity && gateTradeoff && gateBankruptcyPrevention && capacityOnly.bothReachedExhaustion && capacityOnly.highFartherThanBaseline;
if (!allGatesPass) {
  console.error('\n1件以上のゲートがFAILしました。docs/phase2-step9-plan.md §13の停止条件に従ってください。');
  process.exit(1);
}
