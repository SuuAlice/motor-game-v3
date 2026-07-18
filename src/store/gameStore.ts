import { create } from 'zustand';
import { step, type MotorConfig, type SimState } from '../engine/motorPhysics';
import { FLICK_INITIAL_OMEGA } from '../engine/constants';

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

interface GameStore {
  config: MotorConfig;
  simState: SimState;
  setConfig: (partial: Partial<MotorConfig>) => void;
  stepSim: (dt: number) => void;
  flickStart: () => void;
  resetSim: () => void;
}

export const useGameStore = create<GameStore>()((set, get) => ({
  config: DEFAULT_CONFIG,
  simState: REST_STATE,
  setConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),
  stepSim: (dt) => {
    const { config, simState } = get();
    set({ simState: step(config, simState, dt) });
  },
  // サンドボックス/調整チャレンジ専用の「始動」ボタン。固定初速で再現性を保つ
  // (組み立てモードのフリックジェスチャーとは別方式。spec §4末尾参照)
  flickStart: () => set((s) => ({ simState: { ...s.simState, omega: FLICK_INITIAL_OMEGA } })),
  resetSim: () => set({ simState: { ...REST_STATE } }),
}));
