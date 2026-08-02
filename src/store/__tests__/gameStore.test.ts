import { describe, expect, it } from 'vitest';
import { partializeGameStorePersistedState, useGameStore } from '../gameStore';
import { useSaveStore } from '../saveStore';

// Fable技術レビュー指摘(docs/phase2-ui-shop-fable-review.md 確認事項1回答)の回帰テスト:
// gameStoreはpersistミドルウェアを使うが、partializeは元々modeを対象に含めていない。
// 'shop'/'inventory'追加後もこの非永続境界を維持し、reload時に常に初期modeへ戻ることを保証する
// (docs/phase2-ui-shop-plan.md v4 §10)。
//
// テスト環境(vitest、jsdomなし)ではlocalStorageが存在せず、zustand persistミドルウェアが
// api.persistを公開しないため、`useGameStore.persist`経由では検証できない。partializeを
// 名前付きexportとして直接呼び出すことで、ブラウザ環境に依存せず検証する。
describe('gameStore persistのmode非永続境界', () => {
  it('partializeの結果にmodeが含まれない(初期状態)', () => {
    const persisted = partializeGameStorePersistedState(useGameStore.getState());
    expect(persisted).not.toHaveProperty('mode');
  });

  it('shop/inventoryへ切り替えてもpartialize結果にmodeが現れない', () => {
    useGameStore.getState().setMode('shop');
    expect(partializeGameStorePersistedState(useGameStore.getState())).not.toHaveProperty('mode');

    useGameStore.getState().setMode('inventory');
    expect(partializeGameStorePersistedState(useGameStore.getState())).not.toHaveProperty('mode');

    useGameStore.getState().setMode('title');
  });

  it('partializeが返すキーは既存の進捗系フィールドのみ(mode以外の対象範囲は不変)', () => {
    const persisted = partializeGameStorePersistedState(useGameStore.getState());
    expect(Object.keys(persisted).sort()).toEqual(
      ['carConfig', 'config', 'courseProgress', 'diagnosisProgress', 'garageSelection', 'selectedTrackId', 'testRunCompleted'].sort(),
    );
  });
});

// 追補2(Suuレビュー2026-08-02T17:43、必須修正1): saveStore.progressのクロスタブ最新化を
// gameStoreへ反応同期する購読の検証。待機中に他タブが進捗を更新→このタブがlease再取得
// した場合でも、gameStore側の計算元(courseProgress等)が旧値のまま残らないこと、
// かつ物理runtime(vehicleState等)がこの同期で不用意に初期化されないことを固定する。
describe('gameStoreはsaveStore.progressへ反応同期する(追補2 必須修正1)', () => {
  it('saveStore.updateProgressで書き込まれた進捗が、gameStoreの操作を介さずに反映される(他タブの更新を模擬)', () => {
    useSaveStore.setState((s) => ({ progress: { ...s.progress, testRunCompleted: false, diagnosisProgress: {} } }));
    useSaveStore.getState().updateProgress({ diagnosisProgress: { 'other-tab-diagnosis': true } });
    expect(useGameStore.getState().diagnosisProgress).toEqual({ 'other-tab-diagnosis': true });
  });

  it('進捗同期は物理runtime(vehicleState/simState/testRunPhase等)を初期化しない', () => {
    const vehicleStateBefore = useGameStore.getState().vehicleState;
    const simStateBefore = useGameStore.getState().simState;
    useGameStore.setState({ testRunPhase: 'running' });
    useSaveStore.getState().updateProgress({ diagnosisProgress: { 'sync-should-not-reset-runtime': true } });
    expect(useGameStore.getState().vehicleState).toBe(vehicleStateBefore);
    expect(useGameStore.getState().simState).toBe(simStateBefore);
    expect(useGameStore.getState().testRunPhase).toBe('running');
    useGameStore.getState().resetTestRun();
  });

  it('他タブが書き込んだcourseProgressを、その後のgameStore側の部分操作(setGarageSelection)が巻き戻さない', () => {
    useSaveStore.setState((s) => ({ progress: { ...s.progress, courseProgress: {} } }));
    useSaveStore.getState().updateProgress({
      courseProgress: {
        'other-track': { attempts: 1, normalCompleted: true, exCompleted: false, achievedObjectiveIds: [], last: { status: 'finished', elapsedTimeS: 1, energyUsedJ: 1, positionM: 10, normalAchieved: true, exAchieved: false, completedAt: new Date(0).toISOString() } },
      },
    });
    expect(useGameStore.getState().courseProgress['other-track']).toBeDefined();

    // このタブ自身の部分操作(courseProgressに触れないsetter)を実行しても、
    // 他タブ由来のcourseProgressが消えない(commitWithProgressGateの成功パスは
    // 常にsaveStore側の最新progressをそのまま反映するため、上書き競合が起きない)。
    useGameStore.getState().setLabCarConfig({ massG: 200 });
    expect(useGameStore.getState().courseProgress['other-track']).toBeDefined();
  });
});
