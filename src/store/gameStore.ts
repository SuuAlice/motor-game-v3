import { create } from 'zustand';
import { computeMaxTurns, type MotorConfig, type SimState } from '../engine/motorPhysics';
import { FLICK_INITIAL_OMEGA, MAX_FLICK_OMEGA } from '../engine/constants';
import {
  createInitialVehicleState,
  type CarConfig,
  type VehicleSimState,
} from '../engine/vehiclePhysics';
import type { BrokenCar } from '../data/brokenCars';
import { TRACK_BY_ID } from '../data/tracks';
import { evaluateObjectives } from '../engine/scoring';
import type { CarRecipe } from '../engine/recipeCode';
import {
  applyGarageBattery,
  resolveGarageBuild,
  resolveGarageSelectionFromRecipe,
  type GarageSelection,
} from '../data/partPresets';
import {
  createExperimentSession,
  type NotebookSample,
} from './notebookStore';
import {
  useSaveStore,
  type ProgressSlice,
  type RunPreparationCallback,
  type RunPreparationResult,
} from './saveStore';

// P1是正(Suu_mot3 G1bレビュー): 人間再承認項目Q・UI計画§6.5.3が承認したsaveStoreの新規
// public型はRunPreparationResultとRunPreparationCallbackの2件のみである。action戻り値は
// inline unionのまま公開面を増やさず、ここでは既存actionの型からReturnTypeで導出する。
type BeginRunWithPreparationResult = ReturnType<
  ReturnType<typeof useSaveStore.getState>['beginRunActionWithPreparation']
>;
// P3-4 G1b(A3、arbiter追加裁定Q10+§8補足裁定、人間再承認項目Q承認済み)。
// いずれもalice所有の既存純関数(engine/materials/store)であり、本ファイルは呼ぶだけで
// 内部ロジックを再実装しない。
// captureRunSnapshotの実呼出しはsaveStore側(永続commit成功後)が行うため、ここでは
// 入力型のみを参照する(A3、Q10 §1)。
import type { CaptureRunSnapshotInput, DestructionRunContext, PhysicsEndStatus, RunAccumulator, RunOutcome, RunSnapshot } from '../engine/destructionOrchestration';
import {
  createRunAccumulator,
  finalizeRun,
  stepMotorWithDestruction,
  stepTestRunWithDestruction,
  stepTrackRunWithDestruction,
} from '../engine/destructionOrchestration';
import { createInitialDestructionState } from '../engine/destructionModes';
import { createRunRng } from '../engine/destructionOrchestration';
import type { TrackDefinition } from '../engine/trackPhysics';
import { assembleDestructionConfig, composeConfigFromMaterials } from '../materials/materialMapping';
import {
  applyWearToMotorConfig,
  applyWearToCarConfig,
  seedInitialDestructionStateFromWear,
  type IndividualDegradationInput,
} from '../materials/wearReflection';
import { computeRecipeKey, validateMaterialComposedBase } from '../materials/recipeKey';
import { GEAR_TOTAL_TOOTH_COUNT } from '../materials/inventoryItem';
import type { PlayerInventory } from '../materials/inventoryItem';
import {
  deriveFireExposureProfileFromLoadout,
  buildExperimentSession,
  buildVehicleTestRunNotebookRecord,
  buildCourseRunNotebookRecord,
  deriveMaterialSelectionFromEquipment,
  resolveProductionMaterialCompositionBaseline,
  type EquipmentIdSnapshot,
  type EquipmentLoadout,
  type PendingNotebookRecord,
} from './runOutcomeApplication';

const REST_STATE: SimState = {
  theta: 0,
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

export const STANDARD_CAR_CONFIG: CarConfig = {
  massG: 150,
  gearRatio: 4,
  gearEfficiency: 0.8,
  wheelDiameterMm: 30,
  tireGrip: 0.7,
  axleFriction: 0,
  wheelAlignmentMm: 0,
  centerOfMassHeightMm: 20,
  motorMountOffsetMm: 0,
};

// P3-0サブステップ3(docs/phase3-p3-0-plan.md v7 8.3節)により、実際の永続化は
// gameStore.ts自身のpersistミドルウェアからsaveStore.ts(v16:save)へ移管した。本関数は
// 「進捗としてミラーする7フィールド」の単一の一覧として引き続き使う(commitWithProgressGate、
// 本ファイル内の各setterから呼ぶ)。'shop'/'inventory'追加後もmodeがこの一覧に
// 含まれない(=永続対象外のまま)ことを検証する既存テストの回帰対象でもある
// (docs/phase2-ui-shop-plan.md v4 §10)。
export function partializeGameStorePersistedState(s: GameStore) {
  return {
    diagnosisProgress: s.diagnosisProgress,
    courseProgress: s.courseProgress,
    selectedTrackId: s.selectedTrackId,
    testRunCompleted: s.testRunCompleted,
    config: s.config,
    carConfig: s.carConfig,
    garageSelection: s.garageSelection,
  };
}

// 必須9(Suuレビュー2026-08-02T16:15)+追補7(2026-08-02T17:00): ユーザーが明示的に
// 操作するsetter(スライダー操作・ガレージ選択・診断操作等)は、saveStore.updateProgress
// の成否を先に確認し、失敗時はgameStore側のローカルstateも一切変更しない(「画面上は
// 変わったが永続化だけ無視された」という乖離を作らない)。高頻度物理ループ
// (stepSim/stepTestRun/stepCourseRun)の毎フレーム実行自体はlease/pending状態で止めない
// (60fps物理ループを永続化層の都合で止めないというCLAUDE.mdの非機能要件を優先する、
// 明示的な設計判断)一方、terminal到達時に一度だけ確定するtestRunCompleted/courseProgress
// は、stepTestRun/stepCourseRun内でset()の外からこのゲートと同じ「先に永続化、成功時のみ
// ローカル反映」の構造をインラインで適用する(追補7、旧実装はfire-and-forgetでローカル
// stateと永続化が乖離しうる欠陥があった)。
function commitWithProgressGate(
  set: (partial: Partial<GameStore>) => void,
  progressPartial: Partial<ProgressSlice>,
  fullPartial: Partial<GameStore>,
): boolean {
  const ok = useSaveStore.getState().updateProgress(progressPartial);
  if (ok) set(fullPartial);
  return ok;
}

export const TEST_RUN_COURSE_LENGTH_M = 10;

export interface TestRunSample {
  t: number;
  positionM: number;
  velocityMps: number;
  rpm: number;
  currentA: number;
  batteryHeat: number;
  slipRatio: number;
  isSlipping: boolean;
}

export type TestRunPhase = 'ready' | 'running' | 'aborted' | 'complete';
export type CourseRunSpeed = 0 | 1 | 2;

// 指定されたparamRangesの範囲へconfigの値をクランプする(startChallenge時に
// 前のモードから持ち越した値がチャレンジの可動域外にならないようにする)
function clampToRanges(
  config: MotorConfig,
  ranges: Partial<Record<keyof MotorConfig, [number, number]>>,
): MotorConfig {
  const clamped = { ...config };
  for (const key of Object.keys(ranges) as (keyof MotorConfig)[]) {
    const range = ranges[key];
    const value = clamped[key];
    if (range && typeof value === 'number') {
      (clamped[key] as number) = Math.min(range[1], Math.max(range[0], value));
    }
  }
  return clamped;
}

function clampToCoilWindow(config: MotorConfig): MotorConfig {
  const wireGaugeMm = config.wireGaugeMm ?? 0.4;
  const parallelStrands = config.parallelStrands ?? 1;
  const maxTurns = computeMaxTurns(wireGaugeMm, parallelStrands);
  return { ...config, coilTurns: Math.min(config.coilTurns, maxTurns) };
}

// history: GraphPanel(サンドボックス/チャレンジ共通)とengine/scoring.tsの☆評価が
// 読む共有サンプル列。spec §3.6の☆2判定(10秒間)より少し長く保持しておく。
const HISTORY_SAMPLE_INTERVAL_SEC = 0.1;
const HISTORY_WINDOW_SEC = 32;
const MAX_HISTORY_SAMPLES = Math.round(HISTORY_WINDOW_SEC / HISTORY_SAMPLE_INTERVAL_SEC);

export interface CourseRunRecord {
  status: VehicleSimState['status'];
  elapsedTimeS: number;
  energyUsedJ: number;
  positionM: number;
  normalAchieved: boolean;
  exAchieved: boolean;
  completedAt: string;
}

export interface CourseProgress {
  attempts: number;
  normalCompleted: boolean;
  exCompleted: boolean;
  achievedObjectiveIds: string[];
  last: CourseRunRecord;
  previous?: CourseRunRecord;
  best?: CourseRunRecord;
}

export type MeasurementSample = NotebookSample;

const MAX_SESSION_SAMPLES = 1200;

function createSessionSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  }
  return (Date.now() >>> 0) || 1;
}

// ---------------------------------------------------------------------------
// P3-4 G1b: config構築(§6.2の8段順のうちG1b対象分)
// docs/phase3-p3-4-ui-plan.md v13 §6.5.3・§6.5.4。arbiter追加裁定Q10 §1〜§7+§8補足裁定、
// 人間再承認項目Q(2026-08-18承認済み)。
// ---------------------------------------------------------------------------

/**
 * 走行文脈の判別union(Q10 §4〈P16是正〉)。motor-only/test-run/track-runを型で区別することで、
 * 「track非nullかつcourseLengthM非null」のようなRunSnapshot交差検証契約に違反する組合せを
 * 構築不能にする(P3-1-Q6「fail-fastより構築不能」の適用)。
 */
export type RunPreparationRunKind =
  // Q-R1(arbiter追加裁定Q11-1、人間再承認済み2026-08-18): motorOnly腕へinitialOmegaを必須追加。
  // 初速は「走行開始時に確定する構成情報」でありP3-1-Q9によりRunSnapshotが唯一の出典で
  // なければならない(REST_STATE固定では同一snapshotから初速を再現できず、リプレイ契約が
  // 第1stepから破れる)。SimState全体ではなくomegaのみを持たせるのは、前runの過渡状態
  // (batteryHeat/theta/chatterFramesLeft/coilCollapsed等)が新runへ漏れる第二の伝搬チャネルを
  // 作らないため——run間の恒久効果はapplyRunOutcome→WearState/個体状態の単一経路に限る
  // (P3-0以来の契約)。特にcoilCollapsedの持ち越しはRotorAssemblyState.collapsedとの二重表現になる。
  | { kind: 'motorOnly'; initialOmega: number }
  | { kind: 'testRun' }
  | { kind: 'trackRun'; track: TrackDefinition };

/**
 * P3-4 G6(§14.2の4段・7段): 装備個体の永続`WearState`から、Wear反映の入力
 * (`IndividualDegradationInput`)と**装備ギヤ個体の歯欠け数**を導出する。
 *
 * `IndividualDegradationInput`は4フィールドのみで、`gearToothLossCount`を**意図的に持たない**
 * (alice_mot3設計、渡す口を作らない)。D06 seedingは装備ギヤ個体の`WearState.toothLossCount`を
 * **単一出典**とするため(§14.3、P3-1-Q9)、本関数が両方を同じ1回の読取りから返す。
 *
 * 存在・family・bearing一致は1c(resolver)が既に検証済みであり、ここでの不一致は契約違反である。
 * ただし例外を投げずに`{ok:false}`で合流させる——beginRun経路はプレイヤー操作起点であり、
 * 未捕捉例外の伝播はQ10 §1(A3)が排除した設計だからである。
 */
function resolveIndividualDegradation(
  loadout: EquipmentLoadout & { batteryItemId: string },
  inventory: PlayerInventory,
): { ok: true; wear: IndividualDegradationInput; equippedGearToothLossCount: number } | { ok: false; reason: string } {
  const magnet = inventory.items.find((item) => item.itemId === loadout.magnetItemId);
  const gear = inventory.items.find((item) => item.itemId === loadout.gearItemId);
  const brush = inventory.items.find((item) => item.itemId === loadout.brushItemId);
  const bearing = inventory.bearingAssemblies.find((assembly) => assembly.assemblyId === loadout.bearingAssemblyId);
  const magnetWear = magnet?.wearState;
  const gearWear = gear?.wearState;
  const brushWear = brush?.wearState;
  if (magnetWear === undefined || magnetWear.kind !== 'magnet') return { ok: false, reason: '装備磁石の個体状態を解決できません' };
  if (gearWear === undefined || gearWear.kind !== 'gear') return { ok: false, reason: '装備ギヤの個体状態を解決できません' };
  if (brushWear === undefined || brushWear.kind !== 'brush') return { ok: false, reason: '装備ブラシの個体状態を解決できません' };
  if (bearing === undefined) return { ok: false, reason: '装備軸受アセンブリを解決できません' };
  return {
    ok: true,
    wear: {
      magnetDemagnetizationFraction: magnetWear.demagnetizationFraction,
      gearSeizureFraction: gearWear.seizureFraction,
      brushWearFraction: brushWear.wearFraction,
      bearingSeizureFraction: bearing.seizureFraction,
    },
    equippedGearToothLossCount: gearWear.toothLossCount,
  };
}

/**
 * materialComposedBase確定〜captureRunSnapshot入力構築までを行う純関数(G1b対象は
 * §6.2 8段順の1a〜1e・2・3・5・6・8。4〈Wear反映〉・7〈D06 seeding〉はG6で追加する)。
 *
 * **純関数であること**: 引数以外(store・localStorage・時刻・乱数・グローバル状態)を一切読まず、
 * 書き込まない。呼び出し元がexact1回捕捉した値のみを明示引数として受け取る。この性質は
 * DoD23の構造検査(G1a′と同一パターン)+入力非破壊+決定性テストで機械的に固定する。
 *
 * **captureRunSnapshotを呼ばない理由(A3の核心、Q10 §1)**: 本関数は検証済みの
 * `CaptureRunSnapshotInput`までを返し、実際の`captureRunSnapshot`呼出しは
 * `beginRunActionWithPreparation`が永続commit成功後に行う。これによりcommit前の全失敗経路で
 * `RunSnapshot`が一度も構築されず、UI計画§6.4.1の既承認契約(a)を完全に満たす。
 */
export function prepareDestructionRun(
  loadout: EquipmentLoadout & { batteryItemId: string },
  inventory: PlayerInventory,
  rawPlayerMotorConfig: MotorConfig,
  garageSelection: GarageSelection,
  equipmentSnapshot: EquipmentIdSnapshot,
  runKind: RunPreparationRunKind,
  seed: number,
): RunPreparationResult {
  // Q10 §5必須条件: runKindとequipmentSnapshot.contextは同じ事実を表す2つの独立入力であり、
  // 型だけでは不整合な組合せを構築可能である(P3-1-Q6が排除対象とした「静かな不一致」構造)。
  // 本関数はexportされる公開純関数で将来別の呼び出し元から呼ばれうるため、呼び出し元の規律に
  // 依存せず内部で明示的に検証しthrowする(無効入力へのthrowは参照透過性を損なわない)。
  if ((runKind.kind === 'motorOnly') !== (equipmentSnapshot.context === 'motor')) {
    throw new Error(
      `prepareDestructionRun: runKind(${runKind.kind})とequipmentSnapshot.context(${equipmentSnapshot.context})が不整合です`,
    );
  }

  // Q-R1(Q11-1)の防御検証: clampの実施主体は呼出し側(gameStore各入口)であり、ここへ範囲外・
  // 非有限値が来ることは呼出し側のプログラミングエラー(プレイヤー到達経路ではない)。
  // したがってResult腕ではなくthrowで扱う——Q10 §5のcontext不整合と同じ様式。
  if (runKind.kind === 'motorOnly') {
    if (!Number.isFinite(runKind.initialOmega) || Math.abs(runKind.initialOmega) > MAX_FLICK_OMEGA) {
      throw new Error(`prepareDestructionRun: initialOmegaが不正です: ${runKind.initialOmega}`);
    }
  }

  // 1c: resolver(alice所有)。存在・family・bearing一致の検証は再実装しない(S-1)。
  const resolved = deriveMaterialSelectionFromEquipment(loadout, inventory);
  if (!resolved.ok) return { ok: false, reason: resolved.reason, missingRole: resolved.missingRole };

  // 1d〜1e: resolveGarageBuildをexact1回だけ呼び、その戻り値(同一実体)を
  // rawPlayerCarConfigとbaseline関数の両方へ渡す(S-3、C-4)。
  const garageBuild = resolveGarageBuild(garageSelection);
  const baseline = resolveProductionMaterialCompositionBaseline(rawPlayerMotorConfig, garageBuild);
  const composed = composeConfigFromMaterials(rawPlayerMotorConfig, garageBuild.carConfig, baseline, resolved.selection);
  if (!composed.ok) return { ok: false, reason: composed.reason };

  // 2: 有限性検証(C-3)。alice所有・§8補足裁定で確定した単一validator。
  // computeRecipeKey呼出しより前に実行する(DoD20の順序要件)。失敗時はmissingRoleを持たない
  // generic腕へ合流し、computeRecipeKeyを呼ばない。
  const baseCheck = validateMaterialComposedBase(composed.motorConfig, composed.carConfig);
  if (!baseCheck.ok) return { ok: false, reason: baseCheck.reason };

  // 3・5・6: recipeKey(exact1回)→ assembler → 初期DestructionState。
  // recipeKeyはWear反映**前**のmaterialComposedBaseから計算する(§14.2の3、レシピ同一性は
  // 個体の劣化状態に依存しない)。
  // P4-1A(承認項目7): 装備中ローターの巻線記録をrecipeKeyへ含める。legacy個体はnull。
  // 記録の出典はローター個体1つだけで、ここで別途組み立てない(単一出典)。
  const equippedRotor = inventory.rotorAssemblies.find((r) => r.assemblyId === loadout.rotorAssemblyId);
  const windingRecord = equippedRotor?.winding.kind === 'recorded' ? equippedRotor.winding.record : null;
  const recipeKey = computeRecipeKey(resolved.selection, composed.motorConfig, composed.carConfig, windingRecord);

  // 4: Wear反映(§14.1)。materialComposedBaseへ適用して実効configを得る。
  // 走行中の再評価は行わない(1回のみ)。歯欠け由来の効率因子はここでは掛からない——
  // composeD06RuntimeEffectがseeded toothLossCountから一元計算するため(二重計上防止、M-1(ii))。
  const degradation = resolveIndividualDegradation(loadout, inventory);
  if (!degradation.ok) return { ok: false, reason: degradation.reason };
  const wornMotorConfig = applyWearToMotorConfig(composed.motorConfig, degradation.wear);
  if (!wornMotorConfig.ok) return { ok: false, reason: wornMotorConfig.reason };
  const wornCarConfig = applyWearToCarConfig(composed.carConfig, degradation.wear);
  if (!wornCarConfig.ok) return { ok: false, reason: wornCarConfig.reason };
  const effectiveMotorConfig = wornMotorConfig.motorConfig;
  const effectiveCarConfig = wornCarConfig.carConfig;

  const destructionConfig = assembleDestructionConfig(resolved.selection, resolved.equipmentContext);
  // 6→7: 初期DestructionStateを作り、装備ギヤ個体の歯欠け数でseedする(§14.3)。
  // 引数は`WearState.toothLossCount`の単一出典であり、IndividualDegradationInput経由の
  // 間接値は使わない(P3-1-Q9)。
  const initialDestructionState = seedInitialDestructionStateFromWear(
    createInitialDestructionState(destructionConfig.battery.profile),
    degradation.equippedGearToothLossCount,
  );
  const fireExposureProfile = deriveFireExposureProfileFromLoadout(equipmentSnapshot);

  // 8: captureRunSnapshotの入力構築(実呼出しはcommit後、saveStore側、A3)。
  if (runKind.kind === 'motorOnly') {
    const runContext: DestructionRunContext = { context: 'motor', fireExposureProfile, gearTotalToothCount: null };
    const snapshotInput: CaptureRunSnapshotInput = {
      motorConfig: effectiveMotorConfig,
      carConfig: null,
      destructionConfig,
      runContext,
      // Q-R1(Q11-1): 静止状態+omegaのみをclamp済み初速で置換する(SimState全体の捕捉はしない)。
      initialMotorState: { ...REST_STATE, omega: runKind.initialOmega },
      initialVehicleState: null,
      track: null,
      courseLengthM: null,
      slopeRad: null,
      seed,
      initialDestructionState,
      recipeKey,
    };
    return { ok: true, snapshotInput };
  }

  // vehicle文脈: initialVehicleStateはcomposed値(rawではない)からexact1回導出し、
  // initialMotorStateはその内部から取り出す(独立入力にしない、P3-1-Q9のRunSnapshot唯一出典)。
  const initialVehicleState = createInitialVehicleState(effectiveMotorConfig, effectiveCarConfig);
  const runContext: DestructionRunContext = {
    context: 'vehicle',
    fireExposureProfile,
    gearTotalToothCount: GEAR_TOTAL_TOOTH_COUNT,
  };
  const snapshotInput: CaptureRunSnapshotInput = {
    motorConfig: effectiveMotorConfig,
    carConfig: effectiveCarConfig,
    destructionConfig,
    runContext,
    initialMotorState: initialVehicleState.motor,
    initialVehicleState,
    track: runKind.kind === 'trackRun' ? runKind.track : null,
    courseLengthM: runKind.kind === 'testRun' ? TEST_RUN_COURSE_LENGTH_M : null,
    slopeRad: runKind.kind === 'testRun' ? 0 : null,
    seed,
    initialDestructionState,
    recipeKey,
  };
  return { ok: true, snapshotInput };
}

interface GameStore {
  config: MotorConfig;
  simState: SimState;
  history: MeasurementSample[];
  mode: 'title' | 'garage' | 'testRun' | 'course' | 'lab' | 'diagnosis' | 'assembly' | 'shop' | 'inventory' | 'encyclopedia';
  garageSelection: GarageSelection;
  selectedTrackId: string;
  // P3-4 G1b(A3): production配線されたrun開始。戻り値はUI計画§6.4.1の失敗表に従って扱う。
  // Q-R2(Q11-3修正(i)): seedは呼出し側が供給する。内部生成のままだとflickStartのrecipeSeedに
  // よる再現実行(プレイヤー可視の既存機能)がproduction経路で静かに死ぬため。
  beginProductionRun: (runKind: RunPreparationRunKind, seed: number) => BeginRunWithPreparationResult;
  // P3-4 G1b(Q-R3): liveが使う正典run RNG(mulberry32、alice所有のcreateRunRngを
  // runSnapshot.seedで初期化したもの)。非永続runtime state。
  _runRng: (() => number) | null;
  // P3-4 G1b: 進行中Phase 3 runのaccumulator(非永続runtime state)。run未開始時はnull。
  _runAccumulator: RunAccumulator | null;
  /**
   * P3-4 G8: `destructionTerminal`の最終stepのaccumulatorを**表示専用**に保持する
   * (非永続runtime state)。D04のburningのように、終端stepでしか成立しない状態・eventは
   * `_runAccumulator`が同stepでnull化されるためUIへ一度も公開されない。ここへ退避することで
   * HUD・粒子・SEが既存の単一出典(events + destructionState + replaySnapshot)から
   * 停止画面中も観測できる。
   *
   * **二重適用防止の判定には使わない**——`canOperateRunEntry`/
   * `finalizeActiveRunAsManualAbort`/`beginProductionRun`/outcome適用は
   * 従来どおり`_runAccumulator`のnull性だけを見る。
   */
  _terminalPresentationAccumulator: RunAccumulator | null;
  // P3-4 G1b(§6.2、motor-only終了ライフサイクル): 現行productionに実在する4つの終了入口
  // (resetSim / setMode / flickStart再呼び出し / finishAssembly再呼び出し)すべてがこの
  // 単一アダプタを経由し、1 runにつきRunOutcome生成がちょうど1回になるようにする。
  // 戻り値は生成したRunOutcome(進行中runが無ければnull)。
  finalizeMotorOnlyRunIfActive: () => RunOutcome | null;
  carConfig: CarConfig;
  vehicleState: VehicleSimState;
  testRunPhase: TestRunPhase;
  testRunHistory: TestRunSample[];
  testRunCompleted: boolean;
  courseRunPhase: TestRunPhase;
  courseRunHistory: TestRunSample[];
  courseRunSpeed: CourseRunSpeed;
  courseProgress: Record<string, CourseProgress>;
  activeBrokenMotorId: string | null;
  lockedKeys: ReadonlySet<keyof MotorConfig>;
  // Phase3バランス調整で追加。coilTurns最小化のような自由パラメータの極端な振り方を
  // チャレンジごとに制限する(lockedKeysとは別に、可動域だけを狭める仕組み)
  paramRanges: Partial<Record<keyof MotorConfig, [number, number]>>;
  diagnosisProgress: Record<string, boolean>;
  diagnosisRepairableCarKeys: ReadonlySet<keyof CarConfig>;
  recipeSeed: number;

  // 内部の時間管理(UIからは基本参照しない。resetSim/startChallengeで0に戻る)
  _elapsedSec: number;
  _sampleAccumulatorSec: number;
  _sessionSeed: number | null;
  _rngState: number;
  _sessionStartedAt: string | null;
  _sessionConfig: MotorConfig | null;
  _sessionSamples: MeasurementSample[];
  _vehicleRngState: number;
  _courseRunSeed: number;
  _vehicleSampleAccumulatorSec: number;

  setConfig: (partial: Partial<MotorConfig>) => void;
  loadRecipe: (config: MotorConfig, seed: number) => void;
  loadCarRecipe: (recipe: CarRecipe) => void;
  randomizeRecipeSeed: () => void;
  stepSim: (dt: number) => void;
  flickStart: () => void;
  resetSim: () => void;
  // トップレベルのモード切替(App.tsxのモード選択画面用)。進行中のチャレンジ状態を破棄する
  setMode: (mode: 'title' | 'garage' | 'testRun' | 'course' | 'lab' | 'diagnosis' | 'assembly' | 'shop' | 'inventory' | 'encyclopedia') => void;
  setGarageSelection: (partial: Partial<GarageSelection>) => void;
  setLabCarConfig: (partial: Partial<CarConfig>) => void;
  selectTrack: (trackId: string) => void;
  startTestRun: () => void;
  stepTestRun: (dt: number) => void;
  abortTestRun: () => void;
  resetTestRun: () => void;
  startCourseRun: () => void;
  stepCourseRun: (dt: number) => void;
  abortCourseRun: () => void;
  resetCourseRun: () => void;
  setCourseRunSpeed: (speed: CourseRunSpeed) => void;
  // 診断モード: 故障車データで許可された項目以外をロックする
  startDiagnosis: (brokenCar: BrokenCar) => void;
  setDiagnosisCarConfig: (partial: Partial<CarConfig>) => void;
  stopDiagnosis: () => void;
  recordDiagnosisSolved: (brokenMotorId: string) => void;
  // 組み立てモード: ドラフトconfigをコミットしつつ、フリックジェスチャーから
  // 算出した初速(負値=逆回転も許可)を適用する。MAX_FLICK_OMEGAでクランプする
  finishAssembly: (config: MotorConfig, initialOmega: number) => void;
}

// P3-0サブステップ3: 進捗7フィールドの初期値はsaveStore.tsの起動時bootstrap結果
// (v16:save、または v15:progressからの移行)から読み取る(gameStore.ts自身は
// これらのフィールドをもう永続化しない)。
const _initialProgress = useSaveStore.getState().progress;

export const useGameStore = create<GameStore>()(
  (set, get) => ({
      config: _initialProgress.config,
      simState: REST_STATE,
      history: [],
      mode: 'title',
      garageSelection: _initialProgress.garageSelection,
      selectedTrackId: _initialProgress.selectedTrackId,
      _runAccumulator: null,
      _terminalPresentationAccumulator: null,
      _runRng: null,
      carConfig: _initialProgress.carConfig,
      vehicleState: createInitialVehicleState(_initialProgress.config, _initialProgress.carConfig),
      testRunPhase: 'ready',
      testRunHistory: [],
      testRunCompleted: _initialProgress.testRunCompleted,
      courseRunPhase: 'ready',
      courseRunHistory: [],
      courseRunSpeed: 1,
      courseProgress: _initialProgress.courseProgress,
      activeBrokenMotorId: null,
      lockedKeys: new Set(),
      paramRanges: {},
      diagnosisProgress: _initialProgress.diagnosisProgress,
      diagnosisRepairableCarKeys: new Set(),
      recipeSeed: createSessionSeed(),
      _elapsedSec: 0,
      _sampleAccumulatorSec: 0,
      _sessionSeed: null,
      _rngState: 1,
      _sessionStartedAt: null,
      _sessionConfig: null,
      _sessionSamples: [],
      _vehicleRngState: 1,
      _courseRunSeed: 1,
      _vehicleSampleAccumulatorSec: 0,

      // チャレンジ中はlockedKeysに含まれるパラメータへの変更を無視し、
      // paramRangesに含まれるパラメータはその範囲へクランプする
      // (UI側のスライダーmin/max・disabled表示と二重に防御する)
      setConfig: (partial) => {
        const s = get();
        const filtered: Partial<MotorConfig> = { ...partial };
        for (const key of Object.keys(filtered) as (keyof MotorConfig)[]) {
          if (s.lockedKeys.has(key)) delete filtered[key];
        }
        const ranged = clampToRanges({ ...s.config, ...filtered }, s.paramRanges);
        const config = clampToCoilWindow(ranged);
        commitWithProgressGate(set, { config }, { config });
      },

      setGarageSelection: (partial) => {
        const s = get();
        const garageSelection = { ...s.garageSelection, ...partial };
        const { carConfig } = resolveGarageBuild(garageSelection);
        const config = applyGarageBattery(s.config, garageSelection);
        const vehicleState = createInitialVehicleState(config, carConfig);
        commitWithProgressGate(set, { garageSelection, config, carConfig }, { garageSelection, carConfig, config, vehicleState });
      },

      setLabCarConfig: (partial) => {
        const s = get();
        const carConfig = { ...s.carConfig, ...partial };
        const vehicleState = createInitialVehicleState(s.config, carConfig);
        commitWithProgressGate(set, { carConfig }, { carConfig, vehicleState, testRunPhase: 'ready', testRunHistory: [] });
      },

      loadRecipe: (config, seed) => {
        const nextConfig = clampToCoilWindow(config);
        commitWithProgressGate(set, { config: nextConfig }, {
          config: nextConfig,
          recipeSeed: seed >>> 0,
          simState: { ...REST_STATE },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
          _sessionSeed: null,
          _sessionStartedAt: null,
          _sessionConfig: null,
          _sessionSamples: [],
        });
      },

      loadCarRecipe: (recipe) => {
        const config = clampToCoilWindow({ ...recipe.motorConfig });
        const carConfig = { ...recipe.carConfig };
        const garageSelection = resolveGarageSelectionFromRecipe(
          carConfig,
          config.batteryVoltage,
          recipe.appearance,
        );
        commitWithProgressGate(set, { config, carConfig, garageSelection, testRunCompleted: false }, {
          config,
          carConfig,
          garageSelection,
          recipeSeed: recipe.seed >>> 0,
          simState: { ...REST_STATE },
          vehicleState: createInitialVehicleState(config, carConfig),
          history: [],
          testRunPhase: 'ready',
          testRunHistory: [],
          testRunCompleted: false,
          courseRunPhase: 'ready',
          courseRunHistory: [],
          courseRunSpeed: 0,
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
          _sessionSeed: null,
          _sessionStartedAt: null,
          _sessionConfig: null,
          _sessionSamples: [],
        });
      },

      randomizeRecipeSeed: () => set({ recipeSeed: createSessionSeed() }),

      selectTrack: (trackId) => {
        const s = get();
        const vehicleState = createInitialVehicleState(s.config, s.carConfig);
        commitWithProgressGate(set, { selectedTrackId: trackId }, {
          selectedTrackId: trackId,
          vehicleState,
          courseRunPhase: 'ready',
          courseRunSpeed: 0,
          courseRunHistory: [],
        });
      },

      stepSim: (dt) => {
        let pendingTermination: RunOutcome | null = null;
        // G8: destructionTerminal時のみ非nullになる表示専用の退避先。
        let terminalPresentation: RunAccumulator | null = null;
        set((s) => {
          // run未開始(accumulator/rngがnull)なら物理を進めない(state不変)。
          if (s._runAccumulator === null || s._runRng === null) return s;
          // Q-R3: liveは正典run RNG(createRunRng(snapshot.seed))のみを使う。
          let nextAccumulator: RunAccumulator | null = s._runAccumulator;
          const result = stepMotorWithDestruction(s.simState, s._runAccumulator, dt, s._runRng);
          const nextSimState: SimState = result.physicsState;
          // P10是正(§12.1・§12.2): terminationが非null=destructionTerminal確定。set()の外で
          // 即時適用するためここで拾い、accumulatorはnull化して閉じる(以後のmanual入口が
          // 二重適用しない=destructionTerminalがmanualAbortに上書きされない)。
          if (result.termination !== null) {
            pendingTermination = result.termination;
            // G8: 終端stepのaccumulatorは表示専用に退避する(二重適用判定には使わない)。
            terminalPresentation = result.accumulator;
            nextAccumulator = null;
          } else {
            nextAccumulator = result.accumulator;
          }
          const elapsedSec = s._elapsedSec + dt;
          let sampleAccumulatorSec = s._sampleAccumulatorSec + dt;
          let history = s.history;
          let sessionSamples = s._sessionSamples;

          if (sampleAccumulatorSec >= HISTORY_SAMPLE_INTERVAL_SEC) {
            sampleAccumulatorSec -= HISTORY_SAMPLE_INTERVAL_SEC;
            const sample: MeasurementSample = {
                t: elapsedSec,
                rpm: nextSimState.rpm,
                current: nextSimState.current,
                backEmf: nextSimState.backEmf,
                theta: nextSimState.theta,
                batteryHeat: nextSimState.batteryHeat,
                chattering: nextSimState.chatterFramesLeft > 0,
                shorted: nextSimState.shorted,
                coilCollapsed: nextSimState.coilCollapsed,
              };
            const nextHistory = [...s.history, sample];
            history =
              nextHistory.length > MAX_HISTORY_SAMPLES
                ? nextHistory.slice(nextHistory.length - MAX_HISTORY_SAMPLES)
                : nextHistory;
            if (s._sessionSeed !== null) {
              const nextSessionSamples = [...s._sessionSamples, sample];
              sessionSamples = nextSessionSamples.length > MAX_SESSION_SAMPLES
                ? nextSessionSamples.filter((_, index) => index % 2 === 0)
                : nextSessionSamples;
            }
          }

          return {
            simState: nextSimState,
            _elapsedSec: elapsedSec,
            _sampleAccumulatorSec: sampleAccumulatorSec,
            _sessionSamples: sessionSamples,
            history,
            _runAccumulator: nextAccumulator,
            ...(terminalPresentation === null ? {} : { _terminalPresentationAccumulator: terminalPresentation }),
          };
        });
        // set()の外で適用する(既存のstepTestRun→updateProgressと同じ作法)。
        if (pendingTermination !== null) applyPhase3RunOutcome(get(), pendingTermination);
      },

      // サンドボックス/調整チャレンジ専用の「始動」ボタン。固定初速で再現性を保つ
      // (組み立てモードのフリックジェスチャーとは別方式。spec §4末尾参照)
      // P3-4 G1b(A3、UI計画v13 §6.5.4)。config構築に必要なgameStore側の値を
      // exact1回だけ捕捉し、prepareDestructionRunへ明示引数として渡す。
      // callbackはprepareDestructionRunを1回呼ぶだけの薄いラッパーであり、
      // 捕捉済みimmutable値のみを閉じる(store自体をクロージャに含めない)。
      beginProductionRun: (runKind, seed) => {
        // C-4: get()呼出しはこの1回のみ。config/garageSelectionは同一state実体から読む。
        const state = get();
        const rawPlayerMotorConfig = state.config;
        const garageSelection = state.garageSelection;
        const context: 'motor' | 'vehicle' = runKind.kind === 'motorOnly' ? 'motor' : 'vehicle';
        const prepare: RunPreparationCallback = (loadout, inventory, equipmentSnapshot) =>
          prepareDestructionRun(loadout, inventory, rawPlayerMotorConfig, garageSelection, equipmentSnapshot, runKind, seed);
        const result = useSaveStore.getState().beginRunActionWithPreparation(context, prepare);
        // 成功時のみPhase 3 runを進行中にする。失敗時は_runAccumulatorを変更しない
        // (S-5: RunAccumulator不生成、gameStoreローカルruntime state不変)。
        if (result.ok) set({ _runAccumulator: createRunAccumulator(result.runSnapshot) });
        return result;
      },

      // P3-4 G1b(§6.2、motor-only終了ライフサイクル)。resetSim/setMode/flickStart再呼び出し/
      // finishAssembly再呼び出しの4入口すべてがここを通る。いずれもユーザー操作/画面遷移が
      // 契機のためmanualAbort相当として扱う(destructionTerminalが既にwrapperのterminationとして
      // 確定している場合はstep側で先に確定済みであり、ここへは到達しない)。
      // P18是正: 名称・承認済み公開契約どおり**motor-only runのみ**を確定する。
      // 進行中がvehicle(test-run)runの場合は副作用なしでnullを返す。
      // 全context共通入口(setMode)はmodule-privateのfinalizeActiveRunAsManualAbort(...,'any')を使う。
      finalizeMotorOnlyRunIfActive: () => finalizeActiveRunAsManualAbort(get(), set, get, 'motor'),

      flickStart: () => {
        // 終了入口(3): flickStartの再呼び出し。前のrunを終わらせずに次を始めない(§6.2)。
        get().finalizeMotorOnlyRunIfActive();
        const seed = get().recipeSeed;
        // P8是正(§6.4.1・§7): **開始準備が成功するまでgameStoreのrun runtimeを一切変更しない**。
        // beginProductionRunが失敗した場合はrunを開始しない(失敗表示はG7のUI実装で扱う)。
        // Q-R2: seedは呼出し側供給。ここではrecipeSeedを渡すことで「固定初速で再現性を保つ」
        // というプレイヤー可視の既存機能を保持する(DoD-Q11-b)。
        // Q-R1: 初速をsnapshotの唯一出典にするためinitialOmegaを渡す。
        const started = get().beginProductionRun({ kind: 'motorOnly', initialOmega: FLICK_INITIAL_OMEGA }, seed);
        if (!started.ok) return; // runtime不変のまま終了
        // Q-R4(a): live runtimeは返されたrunSnapshotのdeep copyを唯一の出典として初期化する。
        // Q-R3: live rngは正典run RNG(mulberry32)をsnapshot.seedで初期化した系列を使う。
        set((s) => ({
          simState: structuredClone(started.runSnapshot.initialMotorState),
          _sessionSeed: started.runSnapshot.seed,
          _runRng: createRunRng(started.runSnapshot.seed),
          _terminalPresentationAccumulator: null, // G8: 新runの開始で前runの停止画面演出を消す
          _sessionStartedAt: new Date().toISOString(),
          _sessionConfig: { ...s.config },
          _sessionSamples: [],
        }));
      },

      resetSim: () => {
        // 終了入口(1): resetSim。
        get().finalizeMotorOnlyRunIfActive();
        set({
          simState: { ...REST_STATE }, history: [], _elapsedSec: 0, _sampleAccumulatorSec: 0,
          _sessionSeed: null, _sessionStartedAt: null, _sessionConfig: null, _sessionSamples: [],
          _terminalPresentationAccumulator: null, // G8: 停止画面演出を消す
        });
      },

      setMode: (mode) =>
        // 終了入口(2): setMode(他モードへの画面遷移)。**全context共通入口**のため、
        // motor/vehicleどちらの進行中runも閉じる(P18是正、判別はrunContext.context)。
        (finalizeActiveRunAsManualAbort(get(), set, get, 'any'), set({
          mode,
          _terminalPresentationAccumulator: null, // G8: 画面遷移で停止画面演出を消す
          activeBrokenMotorId: null,
          diagnosisRepairableCarKeys: new Set(),
          lockedKeys: new Set(),
          paramRanges: {},
          simState: { ...REST_STATE },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
          _sessionSeed: null, _sessionStartedAt: null, _sessionConfig: null, _sessionSamples: [],
          vehicleState: createInitialVehicleState(get().config, get().carConfig),
          testRunPhase: 'ready',
          testRunHistory: [],
          courseRunPhase: 'ready',
          courseRunSpeed: 0,
          courseRunHistory: [],
          _vehicleSampleAccumulatorSec: 0,
        })),

      startTestRun: () => {
        const seed = createSessionSeed();
        // P8是正: 開始準備成功後にのみvehicle runtimeを変更する(§6.4.1・§7)。
        const started = get().beginProductionRun({ kind: 'testRun' }, seed); // Q-R2: seedは呼出し側供給(exact1回生成)
        if (!started.ok) return; // runtime不変のまま終了(testRunPhaseも'ready'のまま)
        // Q-R4(a): live vehicleStateはrunSnapshot.initialVehicleStateのdeep copyから開始する。
        // raw configからのcreateInitialVehicleState再生成は行わない(Q11-2)。
        // Q-R3: live rngは正典run RNGをsnapshot.seedで初期化した系列。
        set({
          vehicleState: structuredClone(started.runSnapshot.initialVehicleState as VehicleSimState),
          testRunPhase: 'running',
          testRunHistory: [],
          // P20是正: DoD-Q11-a(iv)は3入口すべてで_sessionSeed === runSnapshot.seedを要求する。
          _sessionSeed: started.runSnapshot.seed,
          _runRng: createRunRng(started.runSnapshot.seed),
          _terminalPresentationAccumulator: null, // G8: 新runの開始で前runの停止画面演出を消す
          _vehicleSampleAccumulatorSec: 0,
        });
      },

      stepTestRun: (dt) => {
        let justCompleted = false;
        let pendingOutcome: RunOutcome | null = null;
        // G8: destructionTerminal時のみ非nullになる表示専用の退避先。
        let terminalPresentation: RunAccumulator | null = null;
        set((s) => {
          if (s.testRunPhase !== 'running') return s;
          // run未開始(accumulator/rngがnull)なら物理を進めない(state不変)。
          if (s._runAccumulator === null || s._runRng === null) return s;
          // Q-R3: liveは正典run RNGのみを使う。
          let nextAccumulator: RunAccumulator | null = s._runAccumulator;
          const result = stepTestRunWithDestruction(s.vehicleState, s._runAccumulator, dt, s._runRng);
          const nextVehicleState: VehicleSimState = result.physicsState;
          if (result.termination !== null) {
            // destructionTerminal優先(§12.2(3))。同stepで物理終端も成立していても、
            // terminationが非nullならこちらを適用する。
            pendingOutcome = result.termination;
            // G8: 終端stepのaccumulatorは表示専用に退避する(二重適用判定には使わない)。
            terminalPresentation = result.accumulator;
            nextAccumulator = null;
          } else {
            const status = result.physicsState.status;
            if (status === 'finished' || status === 'stalled' || status === 'derailed' || status === 'overheated') {
              // 物理終端(§12.1): wrapperはdestructionTerminal以外を返さないため、
              // 呼出側がfinalizeRunでRunOutcomeを生成する責務を持つ。
              const physicsEndStatus: PhysicsEndStatus = status === 'stalled'
                ? { status: 'stalled', failureCode: result.physicsState.failureCode }
                : { status };
              pendingOutcome = finalizeRun(result.accumulator, { kind: 'physicsEnded', physicsEndStatus });
              nextAccumulator = null;
            } else {
              nextAccumulator = result.accumulator;
            }
          }
          let sampleAccumulator = s._vehicleSampleAccumulatorSec + dt;
          let testRunHistory = s.testRunHistory;
          if (sampleAccumulator >= 0.05) {
            sampleAccumulator -= 0.05;
            testRunHistory = [...testRunHistory, {
              t: nextVehicleState.elapsedTimeS,
              positionM: nextVehicleState.positionM,
              velocityMps: nextVehicleState.velocityMps,
              rpm: nextVehicleState.motor.rpm,
              currentA: nextVehicleState.motor.current,
              batteryHeat: nextVehicleState.motor.batteryHeat,
              slipRatio: nextVehicleState.slipRatio,
              isSlipping: nextVehicleState.isSlipping,
            }];
          }
          const terminal = nextVehicleState.status === 'finished'
            || nextVehicleState.status === 'stalled'
            || nextVehicleState.status === 'overheated'
            || nextVehicleState.status === 'derailed';
          // testRunCompletedがfalse→trueへ初めて切り替わる瞬間だけ検知する
          // (mirrorProgressを毎フレーム呼ばないようにするため)
          if (!s.testRunCompleted && nextVehicleState.status === 'finished') justCompleted = true;
          // 追補7(Suuレビュー2026-08-02T17:00): 物理phase(testRunPhase/vehicleState/history)は
          // 60fps物理ループを止めないため無条件で進める一方、永続progressフィールド
          // (testRunCompleted)はここでは確定せず、set()の外でupdateProgress成功時にのみ
          // 反映する(下記)。失敗時は物理は'complete'のまま、testRunCompletedだけ旧値を
          // 維持する(gameStoreのローカルstateが永続化結果と乖離しない、必須9の精神を
          // 高頻度ループにも適用する)。
          return {
            vehicleState: nextVehicleState,
            testRunPhase: terminal ? 'complete' : 'running',
            testRunHistory,
            _vehicleSampleAccumulatorSec: sampleAccumulator,
            _runAccumulator: nextAccumulator,
            ...(terminalPresentation === null ? {} : { _terminalPresentationAccumulator: terminalPresentation }),
          };
        });
        if (justCompleted) {
          const ok = useSaveStore.getState().updateProgress({ testRunCompleted: true });
          if (ok) set({ testRunCompleted: true });
        }
        // P10是正: set()の外でRunOutcomeを即時適用する(exact 1回)。
        if (pendingOutcome !== null) applyPhase3RunOutcome(get(), pendingOutcome);
      },

      // P15是正: test-runの中断入口。進行中のPhase 3 runをmanualAbortでexact1回
      // 確定させる(§12.1のmanualAbort行、§6.4.2)。
      abortTestRun: () => {
        // P18是正+G2 F1/P1: test-run専用入口はtest-run(track===null)のみを扱う。
        // motor run・course runが進行中ならaction全体を副作用なしで中断する。
        if (!canOperateRunEntry(get(), 'testRun')) return;
        finalizeActiveRunAsManualAbort(get(), set, get, 'testRun');
        set((s) => (s.testRunPhase === 'running' ? { testRunPhase: 'aborted' } : s));
      },

      resetTestRun: () => {
        // P1是正: 別種runが進行中なら共有vehicleStateを初期化しない。
        if (!canOperateRunEntry(get(), 'testRun')) return;
        finalizeActiveRunAsManualAbort(get(), set, get, 'testRun');
        set((s) => ({
          vehicleState: createInitialVehicleState(s.config, s.carConfig),
          testRunPhase: 'ready',
          testRunHistory: [],
          _terminalPresentationAccumulator: null, // G8: 停止画面演出を消す
          _vehicleSampleAccumulatorSec: 0,
        }));
      },

      startCourseRun: () => {
        const seed = createSessionSeed();
        // P3-4 G2(§8、F2): test-run入口と同型に、開始準備が成功した場合にのみ
        // course run runtimeを変更する。失敗時はrunを開始しない。
        const track = TRACK_BY_ID.get(get().selectedTrackId);
        if (track === undefined) return; // runtime不変(courseRunPhaseも'ready'のまま)
        const started = get().beginProductionRun({ kind: 'trackRun', track }, seed);
        if (!started.ok) return;
        // Q-R4(a): live vehicleStateはrunSnapshot.initialVehicleStateのdeep copyから開始する。
        // Q-R3: live rngは正典run RNGをsnapshot.seedで初期化した系列(F3: seedの単一出典化)。
        set({
          vehicleState: structuredClone(started.runSnapshot.initialVehicleState as VehicleSimState),
          courseRunPhase: 'running',
          courseRunSpeed: 1,
          courseRunHistory: [],
          // DoD-Q11-a(iv)と同じ規約を4入口目にも適用する(P20是正の一般化)。
          _sessionSeed: started.runSnapshot.seed,
          _runRng: createRunRng(started.runSnapshot.seed),
          _courseRunSeed: started.runSnapshot.seed,
          _terminalPresentationAccumulator: null, // G8: 新runの開始で前runの停止画面演出を消す
          _vehicleSampleAccumulatorSec: 0,
        });
      },

      stepCourseRun: (dt) => {
        let pendingCourseProgress: GameStore['courseProgress'] | null = null;
        let pendingOutcome: RunOutcome | null = null;
        // G8: destructionTerminal時のみ非nullになる表示専用の退避先。
        let terminalPresentation: RunAccumulator | null = null;
        set((s) => {
        if (s.courseRunPhase !== 'running') return s;
        const track = TRACK_BY_ID.get(s.selectedTrackId);
        if (!track) return { courseRunPhase: 'aborted' };
        // run未開始(accumulator/rngがnull)なら物理を進めない。
        if (s._runAccumulator === null || s._runRng === null) return s;
        // Q-R3: liveは正典run RNGのみを使う。
        let nextAccumulator: RunAccumulator | null = s._runAccumulator;
        const result = stepTrackRunWithDestruction(s.vehicleState, s._runAccumulator, dt, s._runRng);
        const nextVehicleState: VehicleSimState = result.physicsState;
        if (result.termination !== null) {
            // §8.3: 同一stepでdestructionTerminalと物理終端が両方成立した場合は
            // destructionTerminalを優先する(terminationのnullチェックを先に行う実装順序)。
            pendingOutcome = result.termination;
            // G8: 終端stepのaccumulatorは表示専用に退避する(二重適用判定には使わない)。
            terminalPresentation = result.accumulator;
            nextAccumulator = null;
          } else {
            const status = result.physicsState.status;
            if (status === 'finished' || status === 'stalled' || status === 'derailed' || status === 'overheated') {
              // §8.3: destructionTerminal以外の物理終端をRunOutcome化する責務は呼出側にある。
              // F4: endReasonをここで再導出せず、statusとfailureCodeをengineの写像へ渡す
              // (stalled+energyExhaustedの区別はconvertPhysicsEndStatusToEndReasonが行う)。
              const physicsEndStatus: PhysicsEndStatus = status === 'stalled'
                ? { status: 'stalled', failureCode: result.physicsState.failureCode }
                : { status };
              pendingOutcome = finalizeRun(result.accumulator, { kind: 'physicsEnded', physicsEndStatus });
              nextAccumulator = null;
            } else {
              nextAccumulator = result.accumulator;
            }
          }
        let sampleAccumulator = s._vehicleSampleAccumulatorSec + dt;
        let courseRunHistory = s.courseRunHistory;
        if (sampleAccumulator >= 0.05) {
          sampleAccumulator -= 0.05;
          courseRunHistory = [...courseRunHistory, {
            t: nextVehicleState.elapsedTimeS,
            positionM: nextVehicleState.positionM,
            velocityMps: nextVehicleState.velocityMps,
            rpm: nextVehicleState.motor.rpm,
            currentA: nextVehicleState.motor.current,
            batteryHeat: nextVehicleState.motor.batteryHeat,
            slipRatio: nextVehicleState.slipRatio,
            isSlipping: nextVehicleState.isSlipping,
          }];
        }
        // 終端はwrapperの判定(destructionTerminal or 物理終端)を唯一の出典とする。
        // 破壊終端はstatusが'running'のまま成立しうるため、statusだけを見てはならない。
        const terminal = pendingOutcome !== null;
        // 追補7: 永続progressフィールド(courseProgress)の確定候補はここでは計算するだけに
        // 留め、set()の外でupdateProgress成功時にのみgameStoreへ反映する(下記)。terminal
        // 到達時の物理phase自体(courseRunPhase:'complete')は常に確定させ、報酬・達成状態
        // (courseProgress)だけがlease未取得/pending中は旧値を維持する。
        if (terminal) {
          // P16/P19と同じ規約: 走行に使われた実効configの唯一出典である
          // replaySnapshotを参照する(gameStoreのraw configへfallbackしない)。
          const snapshot = s._runAccumulator?.replaySnapshot ?? null;
          const objectiveContext = snapshot !== null
            ? {
                finalState: nextVehicleState,
                motorConfig: snapshot.motorConfig,
                carConfig: assertVehicleCarConfig(snapshot.carConfig),
                restrictions: track.restrictions,
              }
            : {
                finalState: nextVehicleState,
                motorConfig: s.config,
                carConfig: s.carConfig,
                restrictions: track.restrictions,
              };
          const normalResult = evaluateObjectives(track.objectives, objectiveContext);
          const exResult = track.exObjectives ? evaluateObjectives(track.exObjectives, objectiveContext) : null;
          const normalAchieved = normalResult.allAchieved;
          const exAchieved = exResult?.allAchieved ?? false;
          const previousProgress = s.courseProgress[track.id];
          const record: CourseRunRecord = {
            status: nextVehicleState.status,
            elapsedTimeS: nextVehicleState.elapsedTimeS,
            energyUsedJ: nextVehicleState.energyUsedJ,
            positionM: nextVehicleState.positionM,
            normalAchieved,
            exAchieved,
            completedAt: new Date().toISOString(),
          };
          const best = nextVehicleState.status === 'finished'
            && (!previousProgress?.best || record.elapsedTimeS < previousProgress.best.elapsedTimeS)
            ? record
            : previousProgress?.best;
          pendingCourseProgress = {
            ...s.courseProgress,
            [track.id]: {
              attempts: (previousProgress?.attempts ?? 0) + 1,
              normalCompleted: (previousProgress?.normalCompleted ?? false) || normalAchieved,
              exCompleted: (previousProgress?.exCompleted ?? false) || exAchieved,
              achievedObjectiveIds: [...new Set([
                ...(previousProgress?.achievedObjectiveIds ?? []),
                ...normalResult.results.filter((result) => result.achieved).map((result) => result.id),
                ...(exResult?.results.filter((result) => result.achieved).map((result) => result.id) ?? []),
              ])],
              last: record,
              previous: previousProgress?.last,
              best,
            },
          };
        }
        return {
          vehicleState: nextVehicleState,
          courseRunPhase: terminal ? 'complete' : 'running',
          courseRunHistory,
          _vehicleSampleAccumulatorSec: sampleAccumulator,
          _runAccumulator: nextAccumulator,
          ...(terminalPresentation === null ? {} : { _terminalPresentationAccumulator: terminalPresentation }),
        };
        });
        // F5: 同一runで永続書き込みが2回発生する(courseProgress→RunOutcome適用)。
        // stepTestRunのtestRunCompleted→applyPhase3RunOutcomeと同じ順序に揃える。
        // どちらもprogress.configを変更しないため、useSaveStore.subscribeによる
        // gameStore.configの巻き戻しは発生しない(値が同一)。
        if (pendingCourseProgress) {
          const ok = useSaveStore.getState().updateProgress({ courseProgress: pendingCourseProgress });
          if (ok) set({ courseProgress: pendingCourseProgress });
        }
        // set()の外でRunOutcomeを即時適用する(exact 1回、P10是正と同じ規約)。
        if (pendingOutcome !== null) applyPhase3RunOutcome(get(), pendingOutcome);
      },

      // G2 F1: course-run専用入口はtrack-run(track非null)のみを閉じる。
      // motor runにもtest runにも触れない。
      abortCourseRun: () => {
        if (!canOperateRunEntry(get(), 'trackRun')) return;
        finalizeActiveRunAsManualAbort(get(), set, get, 'trackRun');
        set((s) => (s.courseRunPhase === 'running' ? { courseRunPhase: 'aborted' } : s));
      },

      setCourseRunSpeed: (courseRunSpeed) => set({ courseRunSpeed }),

      resetCourseRun: () => {
        // P1是正: 別種runが進行中なら共有vehicleStateを初期化しない。
        if (!canOperateRunEntry(get(), 'trackRun')) return;
        finalizeActiveRunAsManualAbort(get(), set, get, 'trackRun');
        set((s) => ({
          vehicleState: createInitialVehicleState(s.config, s.carConfig),
          courseRunPhase: 'ready',
          courseRunSpeed: 0,
          courseRunHistory: [],
          _terminalPresentationAccumulator: null, // G8: 停止画面演出を消す
          _vehicleSampleAccumulatorSec: 0,
        }));
      },

      // 診断データが許可した項目だけを調整可能にする。
      startDiagnosis: (brokenCar) => {
        commitWithProgressGate(set, { config: { ...brokenCar.motorConfig }, carConfig: { ...brokenCar.carConfig } }, {
          mode: 'diagnosis',
          activeBrokenMotorId: brokenCar.id,
          lockedKeys: new Set(
            (Object.keys(brokenCar.motorConfig) as (keyof MotorConfig)[]).filter(
              (key) => !brokenCar.repairableMotorParams.includes(key),
            ),
          ),
          diagnosisRepairableCarKeys: new Set(brokenCar.repairableCarParams),
          paramRanges: {},
          config: { ...brokenCar.motorConfig },
          carConfig: { ...brokenCar.carConfig },
          simState: { ...REST_STATE },
          history: [],
          vehicleState: createInitialVehicleState(brokenCar.motorConfig, brokenCar.carConfig),
          testRunPhase: 'ready',
          testRunHistory: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
        });
      },

      setDiagnosisCarConfig: (partial) => {
        const s = get();
        const allowed = Object.fromEntries(
          Object.entries(partial).filter(([key]) => s.diagnosisRepairableCarKeys.has(key as keyof CarConfig)),
        ) as Partial<CarConfig>;
        const carConfig = { ...s.carConfig, ...allowed };
        const vehicleState = createInitialVehicleState(s.config, carConfig);
        commitWithProgressGate(set, { carConfig }, { carConfig, vehicleState, testRunPhase: 'ready', testRunHistory: [] });
      },

      stopDiagnosis: () => {
        set({
          activeBrokenMotorId: null,
          lockedKeys: new Set(),
          diagnosisRepairableCarKeys: new Set(),
          simState: { ...REST_STATE },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
          _sessionSeed: null, _sessionStartedAt: null, _sessionConfig: null, _sessionSamples: [],
        });
      },

      recordDiagnosisSolved: (brokenMotorId) => {
        const diagnosisProgress = { ...get().diagnosisProgress, [brokenMotorId]: true };
        commitWithProgressGate(set, { diagnosisProgress }, { diagnosisProgress });
      },

      finishAssembly: (config, initialOmega) => {
        // 終了入口(4): finishAssemblyの再呼び出し。
        get().finalizeMotorOnlyRunIfActive();
        const clampedOmega = Math.min(MAX_FLICK_OMEGA, Math.max(-MAX_FLICK_OMEGA, initialOmega));
        const seed = createSessionSeed();

        // Q-R4(b)/Q11-4案A: (3)config永続commit → 成功時のみ(4)begin → 成功時のみ
        // (5)live runtime初期化、の順序とする。v13までのbegin先行はsnapshotが**旧config**で
        // 作られる欠陥があり、かつ「begin成功→config commit失敗で旧config snapshotのrunだけが
        // 進行中に残る」経路を持っていた。案Aの順序ではこの経路自体が消滅する。
        // なおS-5の「gameStoreローカルruntime不変」はrun runtimeのみを指し、プレイヤー確定構成
        // (config/carConfig/garageSelection/recipeSeed)は対象外である(Q-R4(c))。
        // (3) config永続commit(progress gate、recipeSeed込み)。run runtimeはまだ変更しない。
        const committed = commitWithProgressGate(set, { config }, { config, recipeSeed: seed });
        if (!committed) return; // 永続失敗: beginを呼ばない・全state不変

        // (4) この時点でstate.configは新config——snapshotが新config由来のcomposed値になる。
        const started = get().beginProductionRun({ kind: 'motorOnly', initialOmega: clampedOmega }, seed);
        if (!started.ok) return; // configは保存済みのまま保持、run runtimeは不変

        // (5) live runtimeをrunSnapshot由来で初期化する(Q-R4(a)・Q-R3)。
        set({
          simState: structuredClone(started.runSnapshot.initialMotorState),
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
          _sessionSeed: started.runSnapshot.seed,
          _runRng: createRunRng(started.runSnapshot.seed),
          _terminalPresentationAccumulator: null, // G8: 新runの開始で前runの停止画面演出を消す
          _sessionStartedAt: new Date().toISOString(),
          _sessionConfig: { ...config },
          _sessionSamples: [],
        });
      },
    }),
);

// 追補2(2026-08-02T17:43再レビュー、必須修正1): saveStore.progressのクロスタブ最新化を
// gameStoreへ反応同期する(notebookStore.ts/shopEconomyStore.tsと同じ「薄い反応的ビュー」
// パターン)。旧実装はモジュール生成時の_initialProgressを読むだけでこの購読がなく、
// 待機中に他タブが進捗を更新→このタブがstale後にlease取得しても、gameStore側の
// 計算元(courseProgress等)は旧値のままだった(特にstepCourseRunは自分のローカル
// courseProgress全体から次値を作ってupdateProgressするため、他タブの更新を上書き
// しかねなかった)。物理runtime(simState/vehicleState/testRunPhase/courseRunPhase/
// history等)はここでは一切変更しない(進捗7フィールドのみを同期する境界を固定する)。
useSaveStore.subscribe((state) => {
  const p = state.progress;
  useGameStore.setState({
    diagnosisProgress: p.diagnosisProgress,
    courseProgress: p.courseProgress,
    selectedTrackId: p.selectedTrackId,
    testRunCompleted: p.testRunCompleted,
    config: p.config,
    carConfig: p.carConfig,
    garageSelection: p.garageSelection,
  });
});

/**
 * P3-4 G1b(P10是正、§6.2・§6.4.2・§12.1): 確定したRunOutcomeをその場で1回だけ適用する。
 *
 * **即時消費**: terminationが確定したstep、またはmanual終了入口でfinalizeRunを呼んだ直後に、
 * 同じ呼び出し内で`performApplyRunOutcome`へ渡す。保持用のruntime stateを新設しないため、
 * 「保持したまま二重適用される」経路が構造的に生じない(P10要件f)。呼び出し側は本関数を
 * 呼ぶ前に`_runAccumulator`をnull化しておくこと(要件b: 以後のmanual入口が二重適用しない)。
 *
 * notebook recordは既存`PendingNotebookRecord`の既存腕のみを使う(G6の型拡張を先取りしない)。
 * 旧`addSession`直接経路はG9で削除済みであり、呼ばれる余地がない(要件d)。
 */
/**
 * vehicle文脈のRunSnapshot.carConfigは非nullが契約(restoreRunSnapshotの交差検証)。
 * trusted invariantとして扱い、違反時はraw値で埋めずthrowする(P19是正)。
 */
function assertVehicleCarConfig(carConfig: CarConfig | null): CarConfig {
  if (carConfig === null) {
    throw new Error('applyPhase3RunOutcome: vehicle文脈のRunSnapshot.carConfigがnullです(交差検証契約違反)');
  }
  return carConfig;
}

/**
 * P3-4 G6(arbiter追加裁定A、2026-08-19): notebook recordのkindとsamples出典は
 * **`replaySnapshot`のみ**から決める。呼出し側がkindを渡せる第二経路は設けない
 * (P3-1-Q9の単一出典)。旧実装は`context: 'motor' | 'vehicle'`の2値しか持たず、
 * track-runをtest-run扱い(`kind:'vehicleTestRun'`+`testRunHistory`出典)で記録して
 * いた——`kind`・samples出典の両方が承認済み契約(PendingNotebookRecord 3腕、§16.5
 * builderのcourseRun腕)に対して誤っていた。
 */
function assertTrackRunTrack(track: RunSnapshot['track']): NonNullable<RunSnapshot['track']> {
  if (track === null) {
    throw new Error('applyPhase3RunOutcome: track-run文脈のRunSnapshot.trackがnullです(交差検証契約違反)');
  }
  return track;
}

function applyPhase3RunOutcome(state: GameStore, outcome: RunOutcome): void {
  const runKind = resolveRunKindFromSnapshot(outcome.replaySnapshot);
  const record: PendingNotebookRecord = runKind === 'motor'
    ? {
        kind: 'session',
        // P16是正: Phase 3 wrapperが実際に使った構成の唯一出典はRunSnapshotである。
        // config/seedはoutcome.replaySnapshot.motorConfig/seedを無条件に使う
        // (raw config〈_sessionConfig/state.config〉や別seed〈_sessionSeed〉へfallbackしない)。
        // samples・時刻だけはlive runの動的実績を使う。
        // G6(§16.5): finalDestructionState・recipeKeyの複写は3専用builderのみが行う
        // (§13.1 exact transport契約3の一方向複写)。呼出し側で値を組み立てない。
        record: buildExperimentSession(
          createExperimentSession(
            outcome.replaySnapshot.motorConfig,
            outcome.replaySnapshot.seed,
            state._sessionSamples,
            state._sessionStartedAt === null ? new Date() : new Date(state._sessionStartedAt),
            new Date(),
          ),
          outcome,
        ),
      }
    : runKind === 'trackRun'
    ? {
        kind: 'courseRun',
        record: buildCourseRunNotebookRecord({
          id: `crun-${outcome.replaySnapshot.seed}-${state.vehicleState.elapsedTimeS}`,
          savedAt: new Date().toISOString(),
          // trackIdもsnapshot由来(live selectedTrackIdは走行中に変わりうるため使わない)
          trackId: assertTrackRunTrack(outcome.replaySnapshot.track).id,
          motorConfig: outcome.replaySnapshot.motorConfig,
          carConfig: assertVehicleCarConfig(outcome.replaySnapshot.carConfig),
          seed: outcome.replaySnapshot.seed,
          status: state.vehicleState.status,
          elapsedTimeS: state.vehicleState.elapsedTimeS,
          positionM: state.vehicleState.positionM,
          energyUsedJ: state.vehicleState.energyUsedJ,
          energyBreakdown: state.vehicleState.energyBreakdown,
          // track-runのサンプルはcourseRunHistoryに蓄積される(testRunHistoryではない)
          samples: state.courseRunHistory,
        }, outcome),
      }
    : {
        kind: 'vehicleTestRun',
        record: buildVehicleTestRunNotebookRecord({
          id: `vtr-${outcome.replaySnapshot.seed}-${state.vehicleState.elapsedTimeS}`,
          savedAt: new Date().toISOString(),
          motorConfig: outcome.replaySnapshot.motorConfig,
          // P19是正: raw state.carConfigへのsilent fallbackを完全に除去する。
          // vehicle文脈のRunSnapshotはcarConfig非nullがrestoreRunSnapshotの交差検証契約
          // (「vehicle context requires carConfig/initialVehicleState to be non-null」)であり、
          // ここでのnullは契約違反=バグである。rawで埋めて隠さず、明示的に失敗させる。
          carConfig: assertVehicleCarConfig(outcome.replaySnapshot.carConfig),
          seed: outcome.replaySnapshot.seed,
          status: state.vehicleState.status,
          elapsedTimeS: state.vehicleState.elapsedTimeS,
          positionM: state.vehicleState.positionM,
          energyUsedJ: state.vehicleState.energyUsedJ,
          energyBreakdown: state.vehicleState.energyBreakdown,
          samples: state.testRunHistory,
        }, outcome),
      };
  // 成功/失敗(pending化を含む)の扱いは既存saveStore契約をそのまま使う(要件c)。
  useSaveStore.getState().performApplyRunOutcome(outcome, record);
}

/**
 * P18是正: 進行中Phase 3 runをmanualAbortで確定する共通adapter(module-private)。
 *
 * `allowedContext`で「この入口が閉じてよい走行文脈」を制限する——context固有入口
 * (test-run専用のabortTestRun/resetTestRun、motor専用のresetSim/flickStart/finishAssembly)が
 * 別contextのrunを誤って終了させないため。判別の単一出典は
 * `accumulator.replaySnapshot.runContext.context`。制限に合致しない場合は
 * **accumulatorを一切変更せずnullを返す**(副作用なし)。
 *
 * `'any'`はsetModeのような全context共通入口専用。
 */
/**
 * P3-4 G2(F1、Suu_mot3 2026-08-18T18:44:23Z承認): 実行中runの種別を判定する。
 *
 * engineの`DestructionRunContext`は`'motor' | 'vehicle'`の2値しか持たず、test-runと
 * track-runがどちらも`'vehicle'`になる。そのままではtest-run専用の中断入口がcourse runを
 * 閉じてしまう(P18と同じクラスの欠陥)。engine公開型は変更せず、**`replaySnapshot.track`の
 * null性を唯一の出典**としてstore側で3種へ細分化する。track非nullはtrack-run文脈でのみ
 * 成立する(`prepareDestructionRun`が`runKind.kind === 'trackRun'`のときだけ非nullを入れる)。
 */
function resolveRunKindFromSnapshot(snapshot: RunSnapshot): 'motor' | 'testRun' | 'trackRun' {
  if (snapshot.runContext.context === 'motor') return 'motor';
  return snapshot.track === null ? 'testRun' : 'trackRun';
}

function resolveActiveRunKind(accumulator: RunAccumulator): 'motor' | 'testRun' | 'trackRun' {
  return resolveRunKindFromSnapshot(accumulator.replaySnapshot);
}

/**
 * P3-4 G2 P1是正(Suu_mot3 2026-08-18T19:04:02Z): run種別つきの中断・リセット入口は、
 * **別種のrunが進行中ならaction全体を副作用なしで中断する**。
 *
 * `finalizeActiveRunAsManualAbort`がnullを返しても後続の`set`が走ると、test-runと
 * track-runが共有する`vehicleState`・history・sample accumulatorが初期化され、
 * 対象外runのlive物理状態が破壊される(accumulatorとRunOutcome適用が不変でもF1契約未達)。
 * 判定はaction本体に入る前に行い、trueのときだけ以降の処理へ進む。
 *
 * - active runがない場合も従来どおりreset/abortできる
 * - 同種runがactiveな場合のみmanualAbort exact1回のあとUI reset/abortを行う
 */
function canOperateRunEntry(state: GameStore, allowedKind: 'motor' | 'testRun' | 'trackRun'): boolean {
  const accumulator = state._runAccumulator;
  if (accumulator === null) return true;
  return resolveActiveRunKind(accumulator) === allowedKind;
}

function finalizeActiveRunAsManualAbort(
  state: GameStore,
  set: (partial: Partial<GameStore>) => void,
  getState: () => GameStore,
  allowedKind: 'motor' | 'testRun' | 'trackRun' | 'any',
): RunOutcome | null {
  const accumulator = state._runAccumulator;
  if (accumulator === null) return null;
  // 種別不一致時は副作用ゼロでnullを返す。呼出側は`canOperateRunEntry`で事前に
  // 中断しているため、通常この分岐には到達しない(多重防御として残す)。
  if (allowedKind !== 'any' && resolveActiveRunKind(accumulator) !== allowedKind) return null;
  const outcome = finalizeRun(accumulator, { kind: 'manualAbort' });
  // 先にaccumulatorを閉じてから適用する(以後の入口が二重適用しない)。
  set({ _runAccumulator: null });
  applyPhase3RunOutcome(getState(), outcome);
  return outcome;
}
