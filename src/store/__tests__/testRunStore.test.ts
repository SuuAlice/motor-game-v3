import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_RUN_COURSE_LENGTH_M, useGameStore } from '../gameStore';
import { DEFAULT_GARAGE_SELECTION } from '../../data/partPresets';
import { decodeRecipe, encodeRecipe } from '../../engine/recipeCode';
import { encodeRecipe as encodeLegacyRecipe } from '../../data/recipeCodec';
import { BROKEN_CARS } from '../../data/brokenCars';

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
    useGameStore.setState({ courseProgress: {}, testRunCompleted: false, courseRunSpeed: 1 });
    useGameStore.getState().setGarageSelection(DEFAULT_GARAGE_SELECTION);
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
    expect(completed.testRunCompleted).toBe(true);

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

  it('選択したPhase3コースをstepTrackRun経由で進める', () => {
    useGameStore.getState().setMode('course');
    useGameStore.getState().selectTrack('straight-10m');
    useGameStore.getState().startCourseRun();
    for (let i = 0; i < 120; i += 1) useGameStore.getState().stepCourseRun(DT);
    const state = useGameStore.getState();
    expect(state.courseRunPhase).toBe('running');
    expect(state.vehicleState.elapsedTimeS).toBeCloseTo(1);
    expect(state.vehicleState.positionM).toBeGreaterThan(0);
    expect(state.courseRunHistory.length).toBeGreaterThan(0);
  });

  it('走行速度を一時停止・1倍・2倍から選べる', () => {
    useGameStore.getState().setCourseRunSpeed(0);
    expect(useGameStore.getState().courseRunSpeed).toBe(0);
    useGameStore.getState().setCourseRunSpeed(2);
    expect(useGameStore.getState().courseRunSpeed).toBe(2);
  });

  it('ガレージ選択を車体・電池・走行初期状態へ反映する', () => {
    useGameStore.getState().setGarageSelection({
      chassisId: 'light',
      gearId: 'torque',
      wheelId: 'large',
      tireId: 'grip',
      batteryId: 'single',
      batteryPosition: 'rear',
      bodyColorId: 'blue',
      accentColorId: 'orange',
    });
    const state = useGameStore.getState();
    expect(state.config.batteryVoltage).toBe(1.5);
    expect(state.carConfig).toMatchObject({
      massG: 85,
      gearRatio: 7,
      wheelDiameterMm: 45,
      tireGrip: 1,
      centerOfMassHeightMm: 16,
    });
    expect(state.vehicleState.positionM).toBe(0);
    expect(state.garageSelection.bodyColorId).toBe('blue');
  });

  it('車体込みレシピはプリセット表示へ丸めても走行用CarConfig原値を保持する', () => {
    const motorConfig = { ...useGameStore.getState().config, batteryVoltage: 1.5 as const };
    const carConfig = {
      massG: 123,
      gearRatio: 5.25,
      gearEfficiency: 0.83,
      wheelDiameterMm: 37,
      tireGrip: 0.63,
      axleFriction: 0.17,
      wheelAlignmentMm: 1.2,
      centerOfMassHeightMm: 19,
      motorMountOffsetMm: 2.5,
    };
    useGameStore.getState().loadCarRecipe({
      motorConfig,
      carConfig,
      appearance: { bodyColorId: 'unknown-body', accentColorId: 'unknown-accent' },
      seed: 123,
    });
    const state = useGameStore.getState();
    expect(state.carConfig).toEqual(carConfig);
    expect(state.garageSelection.gearId).toBe('balanced');
    expect(state.garageSelection.wheelId).toBe('medium');
    expect(state.garageSelection.bodyColorId).toBe('unknown-body');
    expect(state.vehicleState.motor.omega).toBeGreaterThan(0);
  });

  it('M15互換レシピの磁石距離3 mmを読み込み・MC2再出力しても引き戻さない', () => {
    const legacyConfig = { ...useGameStore.getState().config, magnetDistanceMm: 3 };
    const legacyCode = encodeLegacyRecipe({ config: legacyConfig, seed: 77 });
    const decoded = decodeRecipe(legacyCode);
    useGameStore.getState().loadCarRecipe(decoded);
    const loaded = useGameStore.getState();
    expect(loaded.config.magnetDistanceMm).toBe(3);
    const rewritten = encodeRecipe({
      motorConfig: loaded.config,
      carConfig: loaded.carConfig,
      appearance: {
        bodyColorId: loaded.garageSelection.bodyColorId,
        accentColorId: loaded.garageSelection.accentColorId,
      },
      seed: loaded.recipeSeed,
    });
    expect(decodeRecipe(rewritten).motorConfig.magnetDistanceMm).toBe(3);
  });

  it('診断では許可された車体項目だけを変更できる', () => {
    const brokenCar = BROKEN_CARS.find((item) => item.id === 'heavy-drag')!;
    useGameStore.getState().startDiagnosis(brokenCar);
    useGameStore.getState().setDiagnosisCarConfig({ axleFriction: 0.1, gearRatio: 12 });
    const state = useGameStore.getState();
    expect(state.carConfig.axleFriction).toBe(0.1);
    expect(state.carConfig.gearRatio).toBe(brokenCar.carConfig.gearRatio);
    expect(state.testRunPhase).toBe('ready');
  });

  it('テスト走行中にモードを移動してもコース走行を自動開始しない', () => {
    useGameStore.getState().startTestRun();
    useGameStore.getState().stepTestRun(DT);
    useGameStore.getState().setMode('title');
    useGameStore.getState().setMode('course');
    useGameStore.getState().selectTrack('straight-10m');
    const before = useGameStore.getState().vehicleState.elapsedTimeS;
    useGameStore.getState().stepCourseRun(DT);
    const state = useGameStore.getState();
    expect(state.courseRunPhase).toBe('ready');
    expect(state.courseRunSpeed).toBe(0);
    expect(state.vehicleState.elapsedTimeS).toBe(before);
  });

  it('コース変更時に走行状態と履歴を待機状態へ戻す', () => {
    useGameStore.getState().setMode('course');
    useGameStore.getState().startCourseRun();
    for (let i = 0; i < 30; i += 1) useGameStore.getState().stepCourseRun(DT);
    useGameStore.getState().selectTrack('hill-climb');
    const state = useGameStore.getState();
    expect(state.selectedTrackId).toBe('hill-climb');
    expect(state.courseRunPhase).toBe('ready');
    expect(state.courseRunHistory).toEqual([]);
    expect(state.vehicleState.positionM).toBe(0);
  });

  it('完走記録・前回記録・ベストをコース別に保存する', () => {
    useGameStore.getState().setMode('course');
    useGameStore.getState().selectTrack('straight-10m');
    for (let run = 0; run < 2; run += 1) {
      useGameStore.getState().startCourseRun();
      let steps = 0;
      while (useGameStore.getState().courseRunPhase === 'running' && steps < 120 * 30) {
        useGameStore.getState().stepCourseRun(DT);
        steps += 1;
      }
      expect(useGameStore.getState().courseRunPhase).toBe('complete');
    }
    const progress = useGameStore.getState().courseProgress['straight-10m'];
    expect(progress.attempts).toBe(2);
    expect(progress.last.status).toBe('finished');
    expect(progress.previous?.status).toBe('finished');
    expect(progress.best?.status).toBe('finished');
    expect(typeof progress.normalCompleted).toBe('boolean');
    expect(progress.achievedObjectiveIds).toContain('straight-finish');
  });
});
