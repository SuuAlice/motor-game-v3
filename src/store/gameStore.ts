import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { computeMaxTurns, step, type MotorConfig, type SimState } from '../engine/motorPhysics';
import { FLICK_INITIAL_OMEGA, MAX_FLICK_OMEGA } from '../engine/constants';
import {
  createInitialVehicleState,
  stepTestRun as stepVehicleTestRun,
  type CarConfig,
  type VehicleSimState,
} from '../engine/vehiclePhysics';
import type { Challenge } from '../data/challenges';
import type { BrokenCar } from '../data/brokenCars';
import { TRACK_BY_ID } from '../data/tracks';
import { stepTrackRun } from '../engine/trackPhysics';
import { evaluateObjectives } from '../engine/scoring';
import type { CarRecipe } from '../engine/recipeCode';
import {
  DEFAULT_GARAGE_SELECTION,
  applyGarageBattery,
  resolveGarageBuild,
  resolveGarageSelectionFromRecipe,
  type GarageSelection,
} from '../data/partPresets';
import {
  createExperimentSession,
  useNotebookStore,
  type NotebookSample,
} from './notebookStore';

// spec docs/spec.md §3.7 設計目標の「適正パラメータ」を初期値とする
const DEFAULT_CONFIG: MotorConfig = {
  coilTurns: 80,
  slitWidthMm: 1.5,
  sandingQuality: 0.9,
  brushPressure: 0.3,
  magnetStrength: 1.0,
  magnetDistanceMm: 10,
  batteryVoltage: 3.0,
  axisOffsetMm: 0,
  wireGaugeMm: 0.4,
  parallelStrands: 1,
  varnished: true,
};

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

interface ChallengeProgress {
  completed: boolean;
  bestRpm: number;
  bestAverageCurrentA: number;
}

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

function nextRandom(state: number): [number, number] {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return [next / 0x1_0000_0000, next || 1];
}

interface GameStore {
  config: MotorConfig;
  simState: SimState;
  history: MeasurementSample[];
  mode: 'title' | 'garage' | 'testRun' | 'course' | 'sandbox' | 'challenge' | 'diagnosis' | 'assembly';
  garageSelection: GarageSelection;
  selectedTrackId: string;
  carConfig: CarConfig;
  vehicleState: VehicleSimState;
  testRunPhase: TestRunPhase;
  testRunHistory: TestRunSample[];
  testRunCompleted: boolean;
  courseRunPhase: TestRunPhase;
  courseRunHistory: TestRunSample[];
  courseRunSpeed: CourseRunSpeed;
  courseProgress: Record<string, CourseProgress>;
  activeChallengeId: string | null;
  activeBrokenMotorId: string | null;
  lockedKeys: ReadonlySet<keyof MotorConfig>;
  // Phase3バランス調整で追加。coilTurns最小化のような自由パラメータの極端な振り方を
  // チャレンジごとに制限する(lockedKeysとは別に、可動域だけを狭める仕組み)
  paramRanges: Partial<Record<keyof MotorConfig, [number, number]>>;
  progress: Record<string, ChallengeProgress>;
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
  setMode: (mode: 'title' | 'garage' | 'testRun' | 'course' | 'sandbox' | 'challenge' | 'diagnosis' | 'assembly') => void;
  setGarageSelection: (partial: Partial<GarageSelection>) => void;
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
  startChallenge: (challenge: Challenge) => void;
  // チャレンジのプレイ画面からチャレンジ一覧に戻る(modeは'challenge'のまま)
  stopChallenge: () => void;
  recordChallengeResult: (challengeId: string, rpm: number, averageCurrentA: number) => void;
  // 診断モード: repairableParam以外を全てロックする(ChallengeModeのlockedKeys機構を転用)
  startDiagnosis: (brokenCar: BrokenCar) => void;
  setDiagnosisCarConfig: (partial: Partial<CarConfig>) => void;
  stopDiagnosis: () => void;
  recordDiagnosisSolved: (brokenMotorId: string) => void;
  // 組み立てモード: ドラフトconfigをコミットしつつ、フリックジェスチャーから
  // 算出した初速(負値=逆回転も許可)を適用する。MAX_FLICK_OMEGAでクランプする
  finishAssembly: (config: MotorConfig, initialOmega: number) => void;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      simState: REST_STATE,
      history: [],
      mode: 'title',
      garageSelection: DEFAULT_GARAGE_SELECTION,
      selectedTrackId: 'straight-10m',
      carConfig: STANDARD_CAR_CONFIG,
      vehicleState: createInitialVehicleState(DEFAULT_CONFIG, STANDARD_CAR_CONFIG),
      testRunPhase: 'ready',
      testRunHistory: [],
      testRunCompleted: false,
      courseRunPhase: 'ready',
      courseRunHistory: [],
      courseRunSpeed: 1,
      courseProgress: {},
      activeChallengeId: null,
      activeBrokenMotorId: null,
      lockedKeys: new Set(),
      paramRanges: {},
      progress: {},
      diagnosisProgress: {},
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
      setConfig: (partial) =>
        set((s) => {
          const filtered: Partial<MotorConfig> = { ...partial };
          for (const key of Object.keys(filtered) as (keyof MotorConfig)[]) {
            if (s.lockedKeys.has(key)) delete filtered[key];
          }
          const ranged = clampToRanges({ ...s.config, ...filtered }, s.paramRanges);
          return { config: clampToCoilWindow(ranged) };
        }),

      setGarageSelection: (partial) => set((s) => {
        const garageSelection = { ...s.garageSelection, ...partial };
        const { carConfig } = resolveGarageBuild(garageSelection);
        return {
          garageSelection,
          carConfig,
          config: applyGarageBattery(s.config, garageSelection),
          vehicleState: createInitialVehicleState(applyGarageBattery(s.config, garageSelection), carConfig),
        };
      }),

      loadRecipe: (config, seed) => {
        finishActiveSession(get());
        set({
          config: clampToCoilWindow(config),
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
        finishActiveSession(get());
        const config = clampToCoilWindow({ ...recipe.motorConfig });
        const carConfig = { ...recipe.carConfig };
        const garageSelection = resolveGarageSelectionFromRecipe(
          carConfig,
          config.batteryVoltage,
          recipe.appearance,
        );
        set({
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

      selectTrack: (trackId) => set((s) => ({
        selectedTrackId: trackId,
        vehicleState: createInitialVehicleState(s.config, s.carConfig),
        courseRunPhase: 'ready',
        courseRunSpeed: 0,
        courseRunHistory: [],
      })),

      stepSim: (dt) =>
        set((s) => {
          let rngState = s._rngState;
          const nextSimState = step(s.config, s.simState, dt, () => {
            const [value, nextState] = nextRandom(rngState);
            rngState = nextState;
            return value;
          });
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
            _rngState: rngState,
            _sessionSamples: sessionSamples,
            history,
          };
        }),

      // サンドボックス/調整チャレンジ専用の「始動」ボタン。固定初速で再現性を保つ
      // (組み立てモードのフリックジェスチャーとは別方式。spec §4末尾参照)
      flickStart: () => {
        finishActiveSession(get());
        const seed = get().recipeSeed;
        set((s) => ({
          simState: { ...s.simState, omega: FLICK_INITIAL_OMEGA },
          _sessionSeed: seed,
          _rngState: seed,
          _sessionStartedAt: new Date().toISOString(),
          _sessionConfig: { ...s.config },
          _sessionSamples: [],
        }));
      },

      resetSim: () => {
        finishActiveSession(get());
        set({
          simState: { ...REST_STATE }, history: [], _elapsedSec: 0, _sampleAccumulatorSec: 0,
          _sessionSeed: null, _sessionStartedAt: null, _sessionConfig: null, _sessionSamples: [],
        });
      },

      setMode: (mode) =>
        (finishActiveSession(get()), set({
          mode,
          activeChallengeId: null,
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
        set((s) => ({
          vehicleState: createInitialVehicleState(s.config, s.carConfig),
          testRunPhase: 'running',
          testRunHistory: [],
          _vehicleRngState: seed,
          _vehicleSampleAccumulatorSec: 0,
        }));
      },

      stepTestRun: (dt) =>
        set((s) => {
          if (s.testRunPhase !== 'running') return s;
          let rngState = s._vehicleRngState;
          const nextVehicleState = stepVehicleTestRun(
            s.config,
            s.carConfig,
            s.vehicleState,
            dt,
            TEST_RUN_COURSE_LENGTH_M,
            () => {
              const [value, nextState] = nextRandom(rngState);
              rngState = nextState;
              return value;
            },
          );
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
          return {
            vehicleState: nextVehicleState,
            testRunPhase: terminal ? 'complete' : 'running',
            testRunHistory,
            testRunCompleted: s.testRunCompleted || nextVehicleState.status === 'finished',
            _vehicleRngState: rngState,
            _vehicleSampleAccumulatorSec: sampleAccumulator,
          };
        }),

      abortTestRun: () => set((s) => s.testRunPhase === 'running' ? { testRunPhase: 'aborted' } : s),

      resetTestRun: () => set((s) => ({
        vehicleState: createInitialVehicleState(s.config, s.carConfig),
        testRunPhase: 'ready',
        testRunHistory: [],
        _vehicleSampleAccumulatorSec: 0,
      })),

      startCourseRun: () => {
        const seed = createSessionSeed();
        set((s) => ({
          vehicleState: createInitialVehicleState(s.config, s.carConfig),
          courseRunPhase: 'running',
          courseRunSpeed: 1,
          courseRunHistory: [],
          _vehicleRngState: seed,
          _courseRunSeed: seed,
          _vehicleSampleAccumulatorSec: 0,
        }));
      },

      stepCourseRun: (dt) => set((s) => {
        if (s.courseRunPhase !== 'running') return s;
        const track = TRACK_BY_ID.get(s.selectedTrackId);
        if (!track) return { courseRunPhase: 'aborted' };
        let rngState = s._vehicleRngState;
        const nextVehicleState = stepTrackRun(s.config, s.carConfig, track, s.vehicleState, dt, () => {
          const [value, nextState] = nextRandom(rngState);
          rngState = nextState;
          return value;
        });
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
        const terminal = nextVehicleState.status === 'finished' || nextVehicleState.status === 'stalled'
          || nextVehicleState.status === 'overheated' || nextVehicleState.status === 'derailed';
        let courseProgress = s.courseProgress;
        if (terminal) {
          const objectiveContext = {
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
          courseProgress = {
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
          courseProgress,
          _vehicleRngState: rngState,
          _vehicleSampleAccumulatorSec: sampleAccumulator,
        };
      }),

      abortCourseRun: () => set((s) => s.courseRunPhase === 'running' ? { courseRunPhase: 'aborted' } : s),

      setCourseRunSpeed: (courseRunSpeed) => set({ courseRunSpeed }),

      resetCourseRun: () => set((s) => ({
        vehicleState: createInitialVehicleState(s.config, s.carConfig),
        courseRunPhase: 'ready',
        courseRunSpeed: 0,
        courseRunHistory: [],
        _vehicleSampleAccumulatorSec: 0,
      })),

      startChallenge: (challenge) =>
        set((s) => {
          const paramRanges = challenge.paramRanges ?? {};
          const config = clampToCoilWindow(
            clampToRanges({ ...s.config, ...challenge.lockedParams }, paramRanges),
          );
          return {
            mode: 'challenge',
            activeChallengeId: challenge.id,
            lockedKeys: new Set(Object.keys(challenge.lockedParams) as (keyof MotorConfig)[]),
            paramRanges,
            config,
            simState: { ...REST_STATE },
            history: [],
            _elapsedSec: 0,
            _sampleAccumulatorSec: 0,
          };
        }),

      stopChallenge: () => {
        finishActiveSession(get());
        set({
          activeChallengeId: null,
          lockedKeys: new Set(),
          paramRanges: {},
          simState: { ...REST_STATE },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
          _sessionSeed: null, _sessionStartedAt: null, _sessionConfig: null, _sessionSamples: [],
        });
      },

      recordChallengeResult: (challengeId, rpm, averageCurrentA) => {
        const existing = get().progress[challengeId];
        if (existing && rpm <= existing.bestRpm) return;
        set((s) => ({
          progress: {
            ...s.progress,
            [challengeId]: { completed: true, bestRpm: rpm, bestAverageCurrentA: averageCurrentA },
          },
        }));
      },

      // 診断データが許可した項目だけを調整可能にする。
      startDiagnosis: (brokenCar) =>
        set({
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
        }),

      setDiagnosisCarConfig: (partial) => set((s) => {
        const allowed = Object.fromEntries(
          Object.entries(partial).filter(([key]) => s.diagnosisRepairableCarKeys.has(key as keyof CarConfig)),
        ) as Partial<CarConfig>;
        const carConfig = { ...s.carConfig, ...allowed };
        return { carConfig, vehicleState: createInitialVehicleState(s.config, carConfig), testRunPhase: 'ready', testRunHistory: [] };
      }),

      stopDiagnosis: () => {
        finishActiveSession(get());
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

      recordDiagnosisSolved: (brokenMotorId) =>
        set((s) => ({ diagnosisProgress: { ...s.diagnosisProgress, [brokenMotorId]: true } })),

      finishAssembly: (config, initialOmega) => {
        finishActiveSession(get());
        const clampedOmega = Math.min(MAX_FLICK_OMEGA, Math.max(-MAX_FLICK_OMEGA, initialOmega));
        const seed = createSessionSeed();
        set({
          config,
          recipeSeed: seed,
          simState: { ...REST_STATE, omega: clampedOmega },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
          _sessionSeed: seed,
          _rngState: seed,
          _sessionStartedAt: new Date().toISOString(),
          _sessionConfig: { ...config },
          _sessionSamples: [],
        });
      },
    }),
    {
      // spec docs/spec.md §7タスク6「進捗のlocalStorage保存」。CLAUDE.mdの
      // 「localStorage以外の永続化・外部通信は行わない」に従い、進捗のみ保存する。
      name: 'v15:progress',
      partialize: (s) => ({
        progress: s.progress,
        diagnosisProgress: s.diagnosisProgress,
        courseProgress: s.courseProgress,
        selectedTrackId: s.selectedTrackId,
        testRunCompleted: s.testRunCompleted,
        config: s.config,
        carConfig: s.carConfig,
        garageSelection: s.garageSelection,
      }),
    },
  ),
);

function finishActiveSession(state: GameStore): void {
  if (
    state._sessionSeed === null
    || state._sessionStartedAt === null
    || state._sessionConfig === null
    || state._sessionSamples.length === 0
  ) return;
  useNotebookStore.getState().addSession(createExperimentSession(
    state._sessionConfig,
    state._sessionSeed,
    state._sessionSamples,
    new Date(state._sessionStartedAt),
    new Date(),
  ));
}
