import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { step, type MotorConfig, type SimState } from '../engine/motorPhysics';
import { FLICK_INITIAL_OMEGA } from '../engine/constants';
import type { HistorySample } from '../engine/scoring';
import type { Challenge } from '../data/challenges';

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
};

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
  mode: 'title' | 'sandbox' | 'challenge';
  activeChallengeId: string | null;
  lockedKeys: ReadonlySet<keyof MotorConfig>;
  progress: Record<string, ChallengeProgress>;

  // 内部の時間管理(UIからは基本参照しない。resetSim/startChallengeで0に戻る)
  _elapsedSec: number;
  _sampleAccumulatorSec: number;

  setConfig: (partial: Partial<MotorConfig>) => void;
  stepSim: (dt: number) => void;
  flickStart: () => void;
  resetSim: () => void;
  // トップレベルのモード切替(App.tsxのモード選択画面用)。進行中のチャレンジ状態を破棄する
  setMode: (mode: 'title' | 'sandbox' | 'challenge') => void;
  startChallenge: (challenge: Challenge) => void;
  // チャレンジのプレイ画面からチャレンジ一覧に戻る(modeは'challenge'のまま)
  stopChallenge: () => void;
  recordChallengeResult: (challengeId: string, stars: 0 | 1 | 2 | 3) => void;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      simState: REST_STATE,
      history: [],
      mode: 'title',
      activeChallengeId: null,
      lockedKeys: new Set(),
      progress: {},
      _elapsedSec: 0,
      _sampleAccumulatorSec: 0,

      // チャレンジ中はlockedKeysに含まれるパラメータへの変更を無視する
      // (UIの鍵アイコン表示と二重に防御する)
      setConfig: (partial) =>
        set((s) => {
          const filtered: Partial<MotorConfig> = { ...partial };
          for (const key of Object.keys(filtered) as (keyof MotorConfig)[]) {
            if (s.lockedKeys.has(key)) delete filtered[key];
          }
          return { config: { ...s.config, ...filtered } };
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
          lockedKeys: new Set(),
          simState: { ...REST_STATE },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
        }),

      startChallenge: (challenge) =>
        set((s) => ({
          mode: 'challenge',
          activeChallengeId: challenge.id,
          lockedKeys: new Set(Object.keys(challenge.lockedParams) as (keyof MotorConfig)[]),
          config: { ...s.config, ...challenge.lockedParams },
          simState: { ...REST_STATE },
          history: [],
          _elapsedSec: 0,
          _sampleAccumulatorSec: 0,
        })),

      stopChallenge: () =>
        set({
          activeChallengeId: null,
          lockedKeys: new Set(),
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
    }),
    {
      // spec docs/spec.md §7タスク6「進捗のlocalStorage保存」。CLAUDE.mdの
      // 「localStorage以外の永続化・外部通信は行わない」に従い、progressのみ保存する
      name: 'motor-game:progress',
      partialize: (s) => ({ progress: s.progress }),
    },
  ),
);
