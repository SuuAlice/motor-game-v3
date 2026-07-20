import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_RUN_COURSE_LENGTH_M, useGameStore } from '../gameStore';

const DT = 1 / 120;

describe('テスト走行store', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    // Nodeテスト環境にはlocalStorageがないため、zustand persistの既知の通知だけ抑制する。
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  beforeEach(() => {
    useGameStore.getState().setMode('testRun');
    useGameStore.getState().resetTestRun();
  });

  it('開始時に標準車体と押し出し初速を初期化する', () => {
    useGameStore.getState().startTestRun();
    const state = useGameStore.getState();
    expect(state.testRunPhase).toBe('running');
    expect(state.vehicleState.velocityMps).toBeGreaterThan(0);
    expect(state.vehicleState.positionM).toBe(0);
    expect(state.testRunHistory).toEqual([]);
  });

  it('10 m完走後にcompleteとなり、それ以上stepしても状態が変わらない', () => {
    useGameStore.getState().startTestRun();
    let steps = 0;
    while (useGameStore.getState().testRunPhase === 'running' && steps < 120 * 30) {
      useGameStore.getState().stepTestRun(DT);
      steps += 1;
    }
    const completed = useGameStore.getState();
    expect(completed.testRunPhase).toBe('complete');
    expect(completed.vehicleState.status).toBe('finished');
    expect(completed.vehicleState.positionM).toBeGreaterThanOrEqual(TEST_RUN_COURSE_LENGTH_M);
    expect(completed.testRunHistory.length).toBeGreaterThan(0);

    const snapshot = completed.vehicleState;
    useGameStore.getState().stepTestRun(DT);
    expect(useGameStore.getState().vehicleState).toBe(snapshot);
  });

  it('中止後は物理ステップを進めず、再スタートで履歴を消去する', () => {
    useGameStore.getState().startTestRun();
    for (let i = 0; i < 30; i += 1) useGameStore.getState().stepTestRun(DT);
    expect(useGameStore.getState().testRunHistory.length).toBeGreaterThan(0);

    useGameStore.getState().abortTestRun();
    const stoppedAt = useGameStore.getState().vehicleState.elapsedTimeS;
    useGameStore.getState().stepTestRun(DT);
    expect(useGameStore.getState().vehicleState.elapsedTimeS).toBe(stoppedAt);

    useGameStore.getState().startTestRun();
    expect(useGameStore.getState().testRunHistory).toEqual([]);
    expect(useGameStore.getState().vehicleState.elapsedTimeS).toBe(0);
  });
});
