import { afterEach, describe, expect, it, vi } from 'vitest';
import * as recipeKeyModule from '../../materials/recipeKey';
import * as materialMapping from '../../materials/materialMapping';
import * as destructionModes from '../../engine/destructionModes';
import * as runOutcomeApplication from '../runOutcomeApplication';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { partializeGameStorePersistedState, prepareDestructionRun, TEST_RUN_COURSE_LENGTH_M, useGameStore } from '../gameStore';
import { useSaveStore } from '../saveStore';
import { captureEquipmentIdSnapshot, createInitialPlayerInventoryAndLoadout, type EquipmentIdSnapshot, type EquipmentLoadout } from '../runOutcomeApplication';
import type { PlayerInventory } from '../../materials/inventoryItem';
import type { MotorConfig } from '../../engine/motorPhysics';
import { captureRunSnapshot, restoreRunSnapshot } from '../../engine/destructionOrchestration';

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

// ---------------------------------------------------------------------------
// P3-4 G1b: prepareDestructionRun / beginProductionRun(A3、arbiter追加裁定Q10、
// 人間再承認項目Q〈2026-08-18承認済み〉)。UI計画v13 §6.5.5・§23 DoD23・24。
// ---------------------------------------------------------------------------

const G1B_SRC_DIR = fileURLToPath(new URL('../', import.meta.url)); // src/store/__tests__/ → src/store/

/**
 * G1a′純関数性テスト(runOutcomeApplication.test.ts)と同一パターンの本体抽出。
 * 引数リストの対応する')'を括弧の対応関係で先に特定し、その後で最初の'{'を本体開始とする
 * (型注釈中のインライン交差型オブジェクトを本体開始と誤判定しないため)。
 */
function extractNamedFunctionBody(source: string, functionName: string): string {
  const headerMatch = new RegExp(`export function ${functionName}\\b`).exec(source);
  if (!headerMatch) throw new Error(`テスト前提が崩れています: ${functionName}の定義が見つかりません`);
  const parenStart = source.indexOf('(', headerMatch.index);
  let parenDepth = 0;
  let parenEnd = parenStart;
  for (; parenEnd < source.length; parenEnd++) {
    if (source[parenEnd] === '(') parenDepth++;
    else if (source[parenEnd] === ')') {
      parenDepth--;
      if (parenDepth === 0) { parenEnd++; break; }
    }
  }
  if (parenDepth !== 0) throw new Error(`テスト前提が崩れています: ${functionName}の引数リスト終端を検出できません`);
  const braceStart = source.indexOf('{', parenEnd);
  let depth = 0;
  let i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  if (depth !== 0) throw new Error(`テスト前提が崩れています: ${functionName}の終端波括弧を検出できません`);
  return source.slice(braceStart, i);
}

// Q10が要求する純関数性: 引数以外(store/localStorage/時刻/乱数/グローバル状態)を読まない。
// G1a′(runOutcomeApplication.test.ts)の禁止集合をそのまま転用する。
const FORBIDDEN_GLOBAL_PATTERNS: readonly RegExp[] = [
  /\buse[A-Za-z0-9_]*Store\b/,
  /\.getState\s*\(/,
  /\.setState\s*\(/,
  /\.subscribe\s*\(/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bglobalThis\b/,
  /\bprocess\b/,
  /\bDate\.now\s*\(/,
  /\bMath\.random\s*\(/,
  /\bperformance\.now\s*\(/,
  /\bcrypto\b/,
];

function loadoutFixture(): EquipmentLoadout & { batteryItemId: string } {
  const { loadout } = createInitialPlayerInventoryAndLoadout();
  if (loadout.batteryItemId === null) throw new Error('テスト前提が崩れています: 初期loadoutのbatteryItemIdがnullです');
  return loadout as EquipmentLoadout & { batteryItemId: string };
}

function inventoryFixture(): PlayerInventory {
  return createInitialPlayerInventoryAndLoadout().inventory;
}

function motorSnapshotFixture(): EquipmentIdSnapshot {
  return captureEquipmentIdSnapshot(loadoutFixture(), 'motor');
}

function vehicleSnapshotFixture(): EquipmentIdSnapshot {
  return captureEquipmentIdSnapshot(loadoutFixture(), 'vehicle');
}

function motorConfigFixture(): MotorConfig {
  return useGameStore.getState().config;
}

describe('P3-4 G1b prepareDestructionRun(DoD23・24、Q10)', () => {
  // --- DoD24: runKind/equipmentSnapshot.context不整合の負例(両方向) ---------
  describe('DoD24: runKindとequipmentSnapshot.contextの整合(Q10 §5必須条件)', () => {
    it('motorOnly × vehicle snapshot はthrowする', () => {
      expect(() => prepareDestructionRun(
        loadoutFixture(), inventoryFixture(), motorConfigFixture(),
        useGameStore.getState().garageSelection, vehicleSnapshotFixture(),
        { kind: 'motorOnly', initialOmega: 0 }, 1,
      )).toThrow(/不整合/);
    });

    it('testRun × motor snapshot はthrowする', () => {
      expect(() => prepareDestructionRun(
        loadoutFixture(), inventoryFixture(), motorConfigFixture(),
        useGameStore.getState().garageSelection, motorSnapshotFixture(),
        { kind: 'testRun' }, 1,
      )).toThrow(/不整合/);
    });

    it('整合する組合せ(motorOnly × motor)は正常に構築できる', () => {
      const result = prepareDestructionRun(
        loadoutFixture(), inventoryFixture(), motorConfigFixture(),
        useGameStore.getState().garageSelection, motorSnapshotFixture(),
        { kind: 'motorOnly', initialOmega: 0 }, 1,
      );
      expect(result.ok).toBe(true);
    });
  });

  // --- DoD23: 純関数性・入力非破壊・決定性 ----------------------------------
  describe('DoD23: 純関数性(G1a′と同一パターンの構造検査)', () => {
    it('prepareDestructionRunの本体が禁止グローバルパターンを一切含まない', () => {
      const source = readFileSync(join(G1B_SRC_DIR, 'gameStore.ts'), 'utf-8');
      const body = extractNamedFunctionBody(source, 'prepareDestructionRun');
      // 抽出範囲自体が正しいことの回帰(既知トークンを含むこと)
      expect(body).toContain('deriveMaterialSelectionFromEquipment');
      expect(body).toContain('validateMaterialComposedBase');
      expect(body).toContain('recipeKey');
      for (const pattern of FORBIDDEN_GLOBAL_PATTERNS) {
        expect(body).not.toMatch(pattern);
      }
    });

    it('引数を破壊しない(loadout/inventory/motorConfig/garageSelectionがdeep-equalのまま)', () => {
      const loadout = loadoutFixture();
      const inventory = inventoryFixture();
      const motorConfig = motorConfigFixture();
      const garageSelection = useGameStore.getState().garageSelection;
      const before = JSON.parse(JSON.stringify({ loadout, inventory, motorConfig, garageSelection }));

      prepareDestructionRun(loadout, inventory, motorConfig, garageSelection, motorSnapshotFixture(), { kind: 'motorOnly', initialOmega: 0 }, 1);

      expect(JSON.parse(JSON.stringify({ loadout, inventory, motorConfig, garageSelection }))).toEqual(before);
    });

    it('同一入力に対し同一出力を返す(決定性)', () => {
      const args = [
        loadoutFixture(), inventoryFixture(), motorConfigFixture(),
        useGameStore.getState().garageSelection, motorSnapshotFixture(),
        { kind: 'motorOnly', initialOmega: 0 } as const, 1,
      ] as const;
      const first = prepareDestructionRun(...args);
      const second = prepareDestructionRun(...args);
      expect(second).toEqual(first);
    });
  });

  // --- 順序契約(DoD20同型)+2つの失敗経路の区別 ----------------------------
  // composeが検証するのは自身が計算する中間比率のみで、baseからスプレッドで引き継がれる
  // フィールドは検証しない(alice設計回答v2 §10)。そのため同じ「非有限値」でも、
  // フィールドによってcompose失敗経路とvalidator(C-3)失敗経路に分かれる——実測で確認済み。
  // いずれもmissingRoleを持たないgeneric腕であり、§6.4.1の「config構築失敗」行へ合流する。
  it('validator(C-3)が捕捉する非有限フィールドでmissingRoleなしのgeneric腕を返す', () => {
    for (const field of ['axisOffsetMm', 'slitWidthMm', 'sandingQuality', 'brushPressure', 'magnetDistanceMm'] as const) {
      const brokenConfig = { ...motorConfigFixture(), [field]: Number.NaN };
      const result = prepareDestructionRun(
        loadoutFixture(), inventoryFixture(), brokenConfig,
        useGameStore.getState().garageSelection, motorSnapshotFixture(),
        { kind: 'motorOnly', initialOmega: 0 }, 1,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect('missingRole' in result).toBe(false);
        // validateMaterialComposedBase由来の文言(alice所有、27エントリの有限性検査)
        expect(result.reason).toBe(`motorConfig.${field}が非有限値です: NaN`);
      }
    }
  });

  it('compose自身が捕捉する非有限フィールド(coilTurns)でもmissingRoleなしのgeneric腕を返す', () => {
    const brokenConfig = { ...motorConfigFixture(), coilTurns: Number.NaN };
    const result = prepareDestructionRun(
      loadoutFixture(), inventoryFixture(), brokenConfig,
      useGameStore.getState().garageSelection, motorSnapshotFixture(),
      { kind: 'motorOnly', initialOmega: 0 }, 1,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect('missingRole' in result).toBe(false);
      expect(result.reason).toMatch(/coilTurns/);
    }
  });

  // --- 文脈別のRunSnapshot交差検証契約(P16判別unionの帰結) ------------------
  it('motorOnly文脈ではcarConfig/initialVehicleState/track/courseLengthM/slopeRadがすべてnull', () => {
    const result = prepareDestructionRun(
      loadoutFixture(), inventoryFixture(), motorConfigFixture(),
      useGameStore.getState().garageSelection, motorSnapshotFixture(),
      { kind: 'motorOnly', initialOmega: 0 }, 1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const input = result.snapshotInput;
      expect(input.carConfig).toBeNull();
      expect(input.initialVehicleState).toBeNull();
      expect(input.track).toBeNull();
      expect(input.courseLengthM).toBeNull();
      expect(input.slopeRad).toBeNull();
      expect(input.runContext.context).toBe('motor');
    }
  });

  it('testRun文脈ではcourseLengthM/slopeRadが非nullでtrackはnull、initialMotorStateはinitialVehicleState.motorから導出される(P17)', () => {
    const result = prepareDestructionRun(
      loadoutFixture(), inventoryFixture(), motorConfigFixture(),
      useGameStore.getState().garageSelection, vehicleSnapshotFixture(),
      { kind: 'testRun' }, 1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const input = result.snapshotInput;
      expect(input.track).toBeNull();
      expect(input.courseLengthM).toBe(TEST_RUN_COURSE_LENGTH_M);
      expect(input.slopeRad).toBe(0);
      expect(input.initialVehicleState).not.toBeNull();
      expect(input.initialMotorState).toBe(input.initialVehicleState!.motor); // 独立入力ではない
      expect(input.runContext.context).toBe('vehicle');
    }
  });

  it('構築されたsnapshotInputはcaptureRunSnapshot→restoreRunSnapshotの往復検証を通る', () => {
    const result = prepareDestructionRun(
      loadoutFixture(), inventoryFixture(), motorConfigFixture(),
      useGameStore.getState().garageSelection, motorSnapshotFixture(),
      { kind: 'motorOnly', initialOmega: 0 }, 1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const snapshot = captureRunSnapshot(result.snapshotInput);
      expect(restoreRunSnapshot(JSON.parse(JSON.stringify(snapshot))).ok).toBe(true);
    }
  });
});

describe('P3-4 G1b beginProductionRun(DoD23、C-4 exact1)', () => {
  it('本体がprepareDestructionRun以外のalice所有関数を直接呼ばない(構造検査)', () => {
    const source = readFileSync(join(G1B_SRC_DIR, 'gameStore.ts'), 'utf-8');
    const start = source.indexOf('beginProductionRun: (runKind, seed) => {');
    expect(start).toBeGreaterThan(0);
    let depth = 0;
    let i = source.indexOf('{', start);
    const bodyStart = i;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    const body = source.slice(bodyStart, i);
    expect(body).toContain('prepareDestructionRun');
    // alice所有の素材写像・engine関数をorchestratorから直接呼ばない(prepare経由に限る)
    for (const forbidden of [
      'deriveMaterialSelectionFromEquipment',
      'resolveProductionMaterialCompositionBaseline',
      'composeConfigFromMaterials',
      'computeRecipeKey',
      'assembleDestructionConfig',
      'createInitialDestructionState',
      'captureRunSnapshot',
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('get()呼出しがexact1回である(C-4、config/garageSelectionを同一state実体から読む)', () => {
    const source = readFileSync(join(G1B_SRC_DIR, 'gameStore.ts'), 'utf-8');
    const start = source.indexOf('beginProductionRun: (runKind, seed) => {');
    let depth = 0;
    let i = source.indexOf('{', start);
    const bodyStart = i;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    const body = source.slice(bodyStart, i);
    // 行コメント内の言及(「get()呼出しはこの1回のみ」等)は実呼出しではないため除外する
    const code = body.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
    expect(code.match(/\bget\(\)/g) ?? []).toHaveLength(1);
  });

});

// ---------------------------------------------------------------------------
// P6是正: DoD20/21/27のC-4 G1b段階を機械固定する。
// source textの目視やreason文言の確認ではなく、実モジュールをspyして
// (a) 呼出し順序、(b) exact call counts、(c) 同一selection実体がcomputeRecipeKeyと
// assembleDestructionConfigの両方へ渡ること、(d) 失敗時のcomputeRecipeKey未呼出し、
// を直接assertする。production公開面は増やさない(vi.spyOnによるモジュールseamのみ)。
// ---------------------------------------------------------------------------
describe('P3-4 G1b C-4/DoD20・21・27の機械固定(呼出し順序・call count・同一selection)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  /**
   * 実装を差し替えず「呼ばれた順序」だけを記録するspyを張る。元実装はspyOn前に退避し、
   * mockImplementation内からはその退避済み参照を呼ぶ(モジュール名前空間経由で呼ぶと
   * spy自身を再帰的に呼び出してしまうため)。
   */
  function spyAll() {
    const order: string[] = [];
    const realComputeRecipeKey = recipeKeyModule.computeRecipeKey;
    const realValidate = recipeKeyModule.validateMaterialComposedBase;
    const realAssembler = materialMapping.assembleDestructionConfig;
    const realCompose = materialMapping.composeConfigFromMaterials;
    const realInitialState = destructionModes.createInitialDestructionState;
    const realResolver = runOutcomeApplication.deriveMaterialSelectionFromEquipment;

    const recipeSpy = vi.spyOn(recipeKeyModule, 'computeRecipeKey').mockImplementation((...args) => {
      order.push('computeRecipeKey');
      return realComputeRecipeKey(...args);
    });
    const validatorSpy = vi.spyOn(recipeKeyModule, 'validateMaterialComposedBase').mockImplementation((...args) => {
      order.push('validateMaterialComposedBase');
      return realValidate(...args);
    });
    const assemblerSpy = vi.spyOn(materialMapping, 'assembleDestructionConfig').mockImplementation((...args) => {
      order.push('assembleDestructionConfig');
      return realAssembler(...args);
    });
    const composeSpy = vi.spyOn(materialMapping, 'composeConfigFromMaterials').mockImplementation((...args) => {
      order.push('composeConfigFromMaterials');
      return realCompose(...args);
    });
    const initialStateSpy = vi.spyOn(destructionModes, 'createInitialDestructionState').mockImplementation((...args) => {
      order.push('createInitialDestructionState');
      return realInitialState(...args);
    });
    const resolverSpy = vi.spyOn(runOutcomeApplication, 'deriveMaterialSelectionFromEquipment').mockImplementation((...args) => {
      order.push('deriveMaterialSelectionFromEquipment');
      return realResolver(...args);
    });
    return { order, recipeSpy, validatorSpy, assemblerSpy, composeSpy, initialStateSpy, resolverSpy };
  }

  it('DoD20/21: 成功経路の呼出し順序がresolver→compose→validator→computeRecipeKey→assembler→initial stateである', () => {
    const spies = spyAll();
    const result = prepareDestructionRun(
      loadoutFixture(), inventoryFixture(), motorConfigFixture(),
      useGameStore.getState().garageSelection, motorSnapshotFixture(),
      { kind: 'motorOnly', initialOmega: 0 }, 1,
    );
    expect(result.ok).toBe(true);
    expect(spies.order).toEqual([
      'deriveMaterialSelectionFromEquipment',
      'composeConfigFromMaterials',
      'validateMaterialComposedBase',
      'computeRecipeKey',
      'assembleDestructionConfig',
      'createInitialDestructionState',
    ]);
  });

  it('DoD21: 各関数のcall countがexact 1である(重複呼出しなし)', () => {
    const spies = spyAll();
    prepareDestructionRun(
      loadoutFixture(), inventoryFixture(), motorConfigFixture(),
      useGameStore.getState().garageSelection, motorSnapshotFixture(),
      { kind: 'motorOnly', initialOmega: 0 }, 1,
    );
    expect(spies.resolverSpy).toHaveBeenCalledTimes(1);
    expect(spies.composeSpy).toHaveBeenCalledTimes(1);
    expect(spies.validatorSpy).toHaveBeenCalledTimes(1);
    expect(spies.recipeSpy).toHaveBeenCalledTimes(1);
    expect(spies.assemblerSpy).toHaveBeenCalledTimes(1);
    expect(spies.initialStateSpy).toHaveBeenCalledTimes(1);
  });

  it('DoD21(C-4): 同一のselection実体がcomputeRecipeKeyとassembleDestructionConfigの両方へ渡る(参照同一)', () => {
    const spies = spyAll();
    prepareDestructionRun(
      loadoutFixture(), inventoryFixture(), motorConfigFixture(),
      useGameStore.getState().garageSelection, motorSnapshotFixture(),
      { kind: 'motorOnly', initialOmega: 0 }, 1,
    );
    const resolverResult = spies.resolverSpy.mock.results[0]!.value as { ok: true; selection: unknown; equipmentContext: unknown };
    const selectionPassedToRecipeKey = spies.recipeSpy.mock.calls[0]![0];
    const selectionPassedToAssembler = spies.assemblerSpy.mock.calls[0]![0];
    // resolverが返した実体そのものが両方へ渡っている(複数のMaterialSelection実体が並立しない)
    expect(selectionPassedToRecipeKey).toBe(resolverResult.selection);
    expect(selectionPassedToAssembler).toBe(resolverResult.selection);
    // equipmentContextも同一実体
    expect(spies.assemblerSpy.mock.calls[0]![1]).toBe(resolverResult.equipmentContext);
  });

  it('DoD21: composeが返したmotorConfig/carConfigの実体がそのままvalidatorとcomputeRecipeKeyへ渡る(同一読取り値からの導出)', () => {
    const spies = spyAll();
    prepareDestructionRun(
      loadoutFixture(), inventoryFixture(), motorConfigFixture(),
      useGameStore.getState().garageSelection, motorSnapshotFixture(),
      { kind: 'motorOnly', initialOmega: 0 }, 1,
    );
    const composed = spies.composeSpy.mock.results[0]!.value as { ok: true; motorConfig: unknown; carConfig: unknown };
    expect(spies.validatorSpy.mock.calls[0]![0]).toBe(composed.motorConfig);
    expect(spies.validatorSpy.mock.calls[0]![1]).toBe(composed.carConfig);
    expect(spies.recipeSpy.mock.calls[0]![1]).toBe(composed.motorConfig);
    expect(spies.recipeSpy.mock.calls[0]![2]).toBe(composed.carConfig);
  });

  it('DoD20: validator失敗時はcomputeRecipeKey・assembler・initial stateがいずれも呼ばれない(直接assert)', () => {
    const spies = spyAll();
    const brokenConfig = { ...motorConfigFixture(), axisOffsetMm: Number.NaN };
    const result = prepareDestructionRun(
      loadoutFixture(), inventoryFixture(), brokenConfig,
      useGameStore.getState().garageSelection, motorSnapshotFixture(),
      { kind: 'motorOnly', initialOmega: 0 }, 1,
    );
    expect(result.ok).toBe(false);
    expect(spies.validatorSpy).toHaveBeenCalledTimes(1);
    expect(spies.recipeSpy).not.toHaveBeenCalled();
    expect(spies.assemblerSpy).not.toHaveBeenCalled();
    expect(spies.initialStateSpy).not.toHaveBeenCalled();
  });

  it('resolver失敗時はcompose以降が一切呼ばれない', () => {
    const spies = spyAll();
    const emptyInventory = { ...inventoryFixture(), rotorAssemblies: [] };
    const result = prepareDestructionRun(
      loadoutFixture(), emptyInventory, motorConfigFixture(),
      useGameStore.getState().garageSelection, motorSnapshotFixture(),
      { kind: 'motorOnly', initialOmega: 0 }, 1,
    );
    expect(result.ok).toBe(false);
    expect(spies.composeSpy).not.toHaveBeenCalled();
    expect(spies.validatorSpy).not.toHaveBeenCalled();
    expect(spies.recipeSpy).not.toHaveBeenCalled();
  });
});

// P1是正の回帰: saveStoreの公開export集合に、承認外の型が増えていないことを固定する。
describe('P1: saveStoreの公開面(承認済み新規public型は2件のみ)', () => {
  it('BeginRunWithPreparationResultのような3件目のpublic型をexportしていない', () => {
    const source = readFileSync(join(G1B_SRC_DIR, 'saveStore.ts'), 'utf-8');
    expect(source).not.toMatch(/export\s+type\s+BeginRunWithPreparationResult\b/);
    // 承認済み2件は存在すること
    expect(source).toMatch(/export\s+type\s+RunPreparationResult\b/);
    expect(source).toMatch(/export\s+type\s+RunPreparationCallback\b/);
  });

  it('RunPreparationResultのgeneric失敗腕は承認exact型 {ok:false; reason:string} である(missingRole?:neverを持たない)', () => {
    const source = readFileSync(join(G1B_SRC_DIR, 'saveStore.ts'), 'utf-8');
    const match = /export type RunPreparationResult =([\s\S]*?);\n/.exec(source);
    expect(match).not.toBeNull();
    expect(match![1]).not.toContain('missingRole?: never');
  });
});

// ---------------------------------------------------------------------------
// P3-4 G6: C-4最終DoD(arbiter補足裁定Q6、§14.2末尾・§20.6)の**store読取り側**。
// 純関数側(materialComposedBase・DestructionConfig・recipeKey・実効config・
// initialDestructionStateが同一selection実体/同一読取り値から派生すること)は
// `beginRunSingleSourceAudit.test.ts`(alice_mot3所有、15件)が固定しており、
// ここでは重複させない。本ブロックが固定するのは
// **「loadout・inventory・garageSelection・gameStore.configの読取りが各exact 1回」**である。
//
// 読取り回数は実行時のspyでは数えられない——zustandの`get`はstore生成時に捕捉された
// `getState`参照であり、後からのspyOnでは差し替わらないため。したがって既存の
// G1a′/G1b構造検査と同じ規律で、**関数本体を波括弧の対応で抽出して数える**。
// ---------------------------------------------------------------------------
describe('P3-4 G6 C-4: beginRunAction経路のstore読取りが各exact 1回', () => {
  /** `name: (args) => {` 形式のstore action本体を、波括弧の対応で抽出する。 */
  function extractActionBody(source: string, header: string): string {
    const headerIndex = source.indexOf(header);
    if (headerIndex < 0) throw new Error(`テスト前提が崩れています: ${header}が見つかりません`);
    const braceStart = source.indexOf('{', headerIndex + header.length - 1);
    let depth = 0;
    let i = braceStart;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    if (depth !== 0) throw new Error(`テスト前提が崩れています: ${header}の終端波括弧を検出できません`);
    return source.slice(braceStart, i);
  }

  /** コメントを除去する。コメント本文に書かれた識別子を実コードとして数えないため。 */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }

  function countOccurrences(source: string, needle: string): number {
    return stripComments(source).split(needle).length - 1;
  }

  const gameStoreSource = readFileSync(join(G1B_SRC_DIR, 'gameStore.ts'), 'utf-8');
  const saveStoreSource = readFileSync(join(G1B_SRC_DIR, 'saveStore.ts'), 'utf-8');

  it('前提: 抽出が空振りしていない(既知トークンを含む)', () => {
    const body = extractActionBody(gameStoreSource, 'beginProductionRun: (runKind, seed) => {');
    expect(body).toContain('prepareDestructionRun');
    expect(body).toContain('beginRunActionWithPreparation');
  });

  it('beginProductionRunのgameStore読取りはget()のexact 1回のみ(config/garageSelectionは同一state実体から)', () => {
    const body = extractActionBody(gameStoreSource, 'beginProductionRun: (runKind, seed) => {');
    // get()呼出しは1回だけ。2回読むと、config/garageSelectionが別スナップショット由来に
    // なりうる(C-4が防ぐ出典分裂)。
    expect(countOccurrences(body, 'get()')).toBe(1);
    // configとgarageSelectionはその1回で得たstate実体からのみ読む
    expect(countOccurrences(body, 'state.config')).toBe(1);
    expect(countOccurrences(body, 'state.garageSelection')).toBe(1);
    // storeを跨いだ再読取り(useGameStore.getState())を本体内で行わない
    expect(countOccurrences(body, 'useGameStore.getState()')).toBe(0);
  });

  it('beginRunActionWithPreparationのfresh読取りはreadGatedFreshStateのexact 1回のみ', () => {
    const body = extractActionBody(saveStoreSource, 'beginRunActionWithPreparation: (context, prepare) => {');
    expect(body).toContain('prepare(');
    // 永続stateのfresh読取りは1回。loadout・inventoryはこの1回のfreshからのみ取り出す。
    expect(countOccurrences(body, 'readGatedFreshState(')).toBe(1);
    expect(countOccurrences(body, '__testOnly')).toBe(0);
  });

  it('loadout・inventoryはprepareへ渡る単一のfresh実体から取られる(別経路の再読取りがない)', () => {
    const body = extractActionBody(saveStoreSource, 'beginRunActionWithPreparation: (context, prepare) => {');
    // fresh以外からloadout/inventoryを読む経路がないこと。
    // (get().equipmentLoadout / get().inventory のような第二経路を禁止する)
    expect(countOccurrences(body, 'get().equipmentLoadout')).toBe(0);
    expect(countOccurrences(body, 'get().inventory')).toBe(0);
    // freshからの取り出しはprepareへの受け渡しに集約されている
    expect(body).toContain('fresh.inventory');
  });
});
