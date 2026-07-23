import { describe, expect, it } from 'vitest';
import { partializeGameStorePersistedState, useGameStore } from '../gameStore';

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
