import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { computeMaxTurns, step, type MotorConfig, type SimState } from '../engine/motorPhysics';
import { FLICK_INITIAL_OMEGA, MAX_FLICK_OMEGA } from '../engine/constants';
import type { Challenge } from '../data/challenges';
import type { BrokenMotor } from '../data/brokenMotors';
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
  mode: 'title' | 'sandbox' | 'challenge' | 'diagnosis' | 'assembly';
  activeChallengeId: string | null;
  activeBrokenMotorId: string | null;
  lockedKeys: ReadonlySet<keyof MotorConfig>;
  // Phase3バランス調整で追加。coilTurns最小化のような自由パラメータの極端な振り方を
  // チャレンジごとに制限する(lockedKeysとは別に、可動域だけを狭める仕組み)
  paramRanges: Partial<Record<keyof MotorConfig, [number, number]>>;
  progress: Record<string, ChallengeProgress>;
  diagnosisProgress: Record<string, boolean>;
  recipeSeed: number;

  // 内部の時間管理(UIからは基本参照しない。resetSim/startChallengeで0に戻る)
  _elapsedSec: number;
  _sampleAccumulatorSec: number;
  _sessionSeed: number | null;
  _rngState: number;
  _sessionStartedAt: string | null;
  _sessionConfig: MotorConfig | null;
  _sessionSamples: MeasurementSample[];

  setConfig: (partial: Partial<MotorConfig>) => void;
  loadRecipe: (config: MotorConfig, seed: number) => void;
  randomizeRecipeSeed: () => void;
  stepSim: (dt: number) => void;
  flickStart: () => void;
  resetSim: () => void;
  // トップレベルのモード切替(App.tsxのモード選択画面用)。進行中のチャレンジ状態を破棄する
  setMode: (mode: 'title' | 'sandbox' | 'challenge' | 'diagnosis' | 'assembly') => void;
  startChallenge: (challenge: Challenge) => void;
  // チャレンジのプレイ画面からチャレンジ一覧に戻る(modeは'challenge'のまま)
  stopChallenge: () => void;
  recordChallengeResult: (challengeId: string, rpm: number, averageCurrentA: number) => void;
  // 診断モード: repairableParam以外を全てロックする(ChallengeModeのlockedKeys機構を転用)
  startDiagnosis: (brokenMotor: BrokenMotor) => void;
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
      activeChallengeId: null,
      activeBrokenMotorId: null,
      lockedKeys: new Set(),
      paramRanges: {},
      progress: {},
      diagnosisProgress: {},
      recipeSeed: createSessionSeed(),
      _elapsedSec: 0,
      _sampleAccumulatorSec: 0,
      _sessionSeed: null,
      _rngState: 1,
      _sessionStartedAt: null,
      _sessionConfig: null,
      _sessionSamples: [],

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

      randomizeRecipeSeed: () => set({ recipeSeed: createSessionSeed() }),

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
          lockedKeys: new Set(),
          paramRanges: {},
          simState: { ...REST_STATE },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
          _sessionSeed: null, _sessionStartedAt: null, _sessionConfig: null, _sessionSamples: [],
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

      // repairableParam以外の全キーをロックする(ChallengeModeのlockedKeys機構の転用)
      startDiagnosis: (brokenMotor) =>
        set({
          mode: 'diagnosis',
          activeBrokenMotorId: brokenMotor.id,
          lockedKeys: new Set(
            (Object.keys(brokenMotor.config) as (keyof MotorConfig)[]).filter(
              (key) => key !== brokenMotor.repairableParam,
            ),
          ),
          paramRanges: {},
          config: brokenMotor.config,
          simState: { ...REST_STATE },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
        }),

      stopDiagnosis: () => {
        finishActiveSession(get());
        set({
          activeBrokenMotorId: null,
          lockedKeys: new Set(),
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
      // 「localStorage以外の永続化・外部通信は行わない」に従い、progressのみ保存する
      name: 'v15:progress',
      partialize: (s) => ({ progress: s.progress, diagnosisProgress: s.diagnosisProgress }),
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
