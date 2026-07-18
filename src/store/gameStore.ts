import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { step, type MotorConfig, type SimState } from '../engine/motorPhysics';
import { FLICK_INITIAL_OMEGA, MAX_FLICK_OMEGA } from '../engine/constants';
import type { HistorySample } from '../engine/scoring';
import type { Challenge } from '../data/challenges';
import type { BrokenMotor } from '../data/brokenMotors';

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

// history: GraphPanel(サンドボックス/チャレンジ共通)とengine/scoring.tsの☆評価が
// 読む共有サンプル列。spec §3.6の☆2判定(10秒間)より少し長く保持しておく。
const HISTORY_SAMPLE_INTERVAL_SEC = 0.1;
const HISTORY_WINDOW_SEC = 12;
const MAX_HISTORY_SAMPLES = Math.round(HISTORY_WINDOW_SEC / HISTORY_SAMPLE_INTERVAL_SEC);

interface ChallengeProgress {
  bestStars: 0 | 1 | 2 | 3;
}

interface GameStore {
  config: MotorConfig;
  simState: SimState;
  history: HistorySample[];
  mode: 'title' | 'sandbox' | 'challenge' | 'diagnosis' | 'assembly';
  activeChallengeId: string | null;
  activeBrokenMotorId: string | null;
  lockedKeys: ReadonlySet<keyof MotorConfig>;
  // Phase3バランス調整で追加。coilTurns最小化のような自由パラメータの極端な振り方を
  // チャレンジごとに制限する(lockedKeysとは別に、可動域だけを狭める仕組み)
  paramRanges: Partial<Record<keyof MotorConfig, [number, number]>>;
  progress: Record<string, ChallengeProgress>;
  diagnosisProgress: Record<string, boolean>;

  // 内部の時間管理(UIからは基本参照しない。resetSim/startChallengeで0に戻る)
  _elapsedSec: number;
  _sampleAccumulatorSec: number;

  setConfig: (partial: Partial<MotorConfig>) => void;
  stepSim: (dt: number) => void;
  flickStart: () => void;
  resetSim: () => void;
  // トップレベルのモード切替(App.tsxのモード選択画面用)。進行中のチャレンジ状態を破棄する
  setMode: (mode: 'title' | 'sandbox' | 'challenge' | 'diagnosis' | 'assembly') => void;
  startChallenge: (challenge: Challenge) => void;
  // チャレンジのプレイ画面からチャレンジ一覧に戻る(modeは'challenge'のまま)
  stopChallenge: () => void;
  recordChallengeResult: (challengeId: string, stars: 0 | 1 | 2 | 3) => void;
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
      _elapsedSec: 0,
      _sampleAccumulatorSec: 0,

      // チャレンジ中はlockedKeysに含まれるパラメータへの変更を無視し、
      // paramRangesに含まれるパラメータはその範囲へクランプする
      // (UI側のスライダーmin/max・disabled表示と二重に防御する)
      setConfig: (partial) =>
        set((s) => {
          const filtered: Partial<MotorConfig> = { ...partial };
          for (const key of Object.keys(filtered) as (keyof MotorConfig)[]) {
            if (s.lockedKeys.has(key)) delete filtered[key];
          }
          return { config: clampToRanges({ ...s.config, ...filtered }, s.paramRanges) };
        }),

      stepSim: (dt) =>
        set((s) => {
          const nextSimState = step(s.config, s.simState, dt);
          const elapsedSec = s._elapsedSec + dt;
          let sampleAccumulatorSec = s._sampleAccumulatorSec + dt;
          let history = s.history;

          if (sampleAccumulatorSec >= HISTORY_SAMPLE_INTERVAL_SEC) {
            sampleAccumulatorSec -= HISTORY_SAMPLE_INTERVAL_SEC;
            const nextHistory = [
              ...s.history,
              { t: elapsedSec, rpm: nextSimState.rpm, current: nextSimState.current, backEmf: nextSimState.backEmf },
            ];
            history =
              nextHistory.length > MAX_HISTORY_SAMPLES
                ? nextHistory.slice(nextHistory.length - MAX_HISTORY_SAMPLES)
                : nextHistory;
          }

          return { simState: nextSimState, _elapsedSec: elapsedSec, _sampleAccumulatorSec: sampleAccumulatorSec, history };
        }),

      // サンドボックス/調整チャレンジ専用の「始動」ボタン。固定初速で再現性を保つ
      // (組み立てモードのフリックジェスチャーとは別方式。spec §4末尾参照)
      flickStart: () => set((s) => ({ simState: { ...s.simState, omega: FLICK_INITIAL_OMEGA } })),

      resetSim: () =>
        set({ simState: { ...REST_STATE }, history: [], _elapsedSec: 0, _sampleAccumulatorSec: 0 }),

      setMode: (mode) =>
        set({
          mode,
          activeChallengeId: null,
          activeBrokenMotorId: null,
          lockedKeys: new Set(),
          paramRanges: {},
          simState: { ...REST_STATE },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
        }),

      startChallenge: (challenge) =>
        set((s) => {
          const paramRanges = challenge.paramRanges ?? {};
          const config = clampToRanges({ ...s.config, ...challenge.lockedParams }, paramRanges);
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

      stopChallenge: () =>
        set({
          activeChallengeId: null,
          lockedKeys: new Set(),
          paramRanges: {},
          simState: { ...REST_STATE },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
        }),

      recordChallengeResult: (challengeId, stars) => {
        const existing = get().progress[challengeId]?.bestStars ?? 0;
        if (stars <= existing) return;
        set((s) => ({ progress: { ...s.progress, [challengeId]: { bestStars: stars } } }));
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

      stopDiagnosis: () =>
        set({
          activeBrokenMotorId: null,
          lockedKeys: new Set(),
          simState: { ...REST_STATE },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
        }),

      recordDiagnosisSolved: (brokenMotorId) =>
        set((s) => ({ diagnosisProgress: { ...s.diagnosisProgress, [brokenMotorId]: true } })),

      finishAssembly: (config, initialOmega) => {
        const clampedOmega = Math.min(MAX_FLICK_OMEGA, Math.max(-MAX_FLICK_OMEGA, initialOmega));
        set({
          config,
          simState: { ...REST_STATE, omega: clampedOmega },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
        });
      },
    }),
    {
      // spec docs/spec.md §7タスク6「進捗のlocalStorage保存」。CLAUDE.mdの
      // 「localStorage以外の永続化・外部通信は行わない」に従い、progressのみ保存する
      name: 'motor-game:progress',
      partialize: (s) => ({ progress: s.progress, diagnosisProgress: s.diagnosisProgress }),
    },
  ),
);
