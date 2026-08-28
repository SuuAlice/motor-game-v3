// P3-4 G6: C-4最終DoD(arbiter補足裁定Q6、engine計画§14.2末尾・§20.6)のalice担当分。
//
// 固定する不変条件: **`prepareDestructionRun`(§14.2の8段が実装されている純関数)の内部で、
// `materialComposedBase`・`DestructionConfig`・`recipeKey`・実効config・`initialDestructionState`が
// すべて同一の`selection`実体・同一の読取り値から派生している**こと。同じ事実を複数経路から
// 入力できる構造(P3-1-Q9が禁じる「静かな不一致」)が持ち込まれていないことを、
// (i)値の再導出による一致assertと、(ii)各段の呼出しがexact 1回であることの構造監査の
// 2方向から機械的に固定する。
//
// **担当境界**: `beginRunAction`(store action本体、brabit所有)側の
// 「loadout・inventory・garageSelection・gameStore.configの読取りが各exact 1回」は、
// store状態への読取り回数モックを要するためbrabit担当分である。本ファイルは
// **純関数側(8段の派生関係)**に閉じる。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prepareDestructionRun } from '../gameStore';
import {
  captureEquipmentIdSnapshot,
  createInitialPlayerInventoryAndLoadout,
  deriveMaterialSelectionFromEquipment,
  resolveProductionMaterialCompositionBaseline,
  validateEquipmentLoadout,
  type EquipmentLoadout,
} from '../runOutcomeApplication';
import { DEFAULT_GARAGE_SELECTION, resolveGarageBuild } from '../../data/partPresets';
import { assembleDestructionConfig, composeConfigFromMaterials } from '../../materials/materialMapping';
import { computeRecipeKey } from '../../materials/recipeKey';
import { applyWearToCarConfig, applyWearToMotorConfig } from '../../materials/wearReflection';
import { createInitialDestructionState } from '../../engine/destructionModes';
import type { MotorConfig } from '../../engine/motorPhysics';
import type { PlayerInventory } from '../../materials/inventoryItem';

const GAME_STORE_PATH = fileURLToPath(new URL('../gameStore.ts', import.meta.url));

function rawPlayerMotorConfig(): MotorConfig {
  return {
    coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 0.5,
    magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.4, parallelStrands: 1, varnished: true,
  };
}

/** 個体劣化を持つinventory(劣化0では「Wear反映前後の同値」と区別できないため、非0を与える)。 */
function inventoryWithWear(): { inventory: PlayerInventory; loadout: EquipmentLoadout & { batteryItemId: string } } {
  const { inventory, loadout } = createInitialPlayerInventoryAndLoadout();
  const items = inventory.items.map((item) => {
    if (item.family === 'magnet') return { ...item, wearState: { ...item.wearState, demagnetizationFraction: 0.2 } };
    if (item.family === 'gear') return { ...item, wearState: { ...item.wearState, seizureFraction: 0.1, toothLossCount: 3 } };
    if (item.family === 'brush') return { ...item, wearState: { ...item.wearState, wearFraction: 0.4 } };
    return item;
  });
  const bearingAssemblies = inventory.bearingAssemblies.map((b) => ({ ...b, seizureFraction: 0.25 }));
  const worn = { ...inventory, items, bearingAssemblies } as PlayerInventory;
  const validated = validateEquipmentLoadout(loadout, worn);
  if (!validated.ok) throw new Error('テスト前提が崩れています: 初期loadoutの検証に失敗しました');
  return { inventory: worn, loadout: validated.loadout };
}

function prepare() {
  const { inventory, loadout } = inventoryWithWear();
  const raw = rawPlayerMotorConfig();
  const snapshot = captureEquipmentIdSnapshot(loadout, 'motor');
  const result = prepareDestructionRun(
    loadout, inventory, raw, DEFAULT_GARAGE_SELECTION, snapshot,
    { kind: 'motorOnly', initialOmega: 15 }, 1234,
  );
  if (!result.ok) throw new Error(`prepareDestructionRunが失敗しました: ${result.reason}`);
  return { result: result.snapshotInput, inventory, loadout, raw };
}

describe('C-4(alice担当分): prepareDestructionRunの8段が単一の読取り値から派生している', () => {
  it('DestructionConfigは、同一loadout/inventoryから導出したselectionのassembler出力と一致する', () => {
    const { result, inventory, loadout } = prepare();
    const resolved = deriveMaterialSelectionFromEquipment(loadout, inventory);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(result.destructionConfig).toEqual(assembleDestructionConfig(resolved.selection, resolved.equipmentContext));
  });

  it('recipeKeyはWear反映**前**のmaterialComposedBaseから計算されている(§14.2の3段が4段より前)', () => {
    const { result, inventory, loadout, raw } = prepare();
    const resolved = deriveMaterialSelectionFromEquipment(loadout, inventory);
    if (!resolved.ok) throw new Error('到達しない');
    const garageBuild = resolveGarageBuild(DEFAULT_GARAGE_SELECTION);
    const baseline = resolveProductionMaterialCompositionBaseline(raw, garageBuild);
    const composed = composeConfigFromMaterials(raw, garageBuild.carConfig, baseline, resolved.selection);
    if (!composed.ok) throw new Error('到達しない');
    expect(result.recipeKey).toBe(computeRecipeKey(resolved.selection, composed.motorConfig, composed.carConfig, null));

    // 非空虚性: Wear反映**後**のconfigから計算したkeyとは異なる(順序が逆なら落ちる)。
    const wornMotor = applyWearToMotorConfig(composed.motorConfig, {
      magnetDemagnetizationFraction: 0.2, gearSeizureFraction: 0.1, brushWearFraction: 0.4, bearingSeizureFraction: 0.25,
    });
    const wornCar = applyWearToCarConfig(composed.carConfig, {
      magnetDemagnetizationFraction: 0.2, gearSeizureFraction: 0.1, brushWearFraction: 0.4, bearingSeizureFraction: 0.25,
    });
    if (!wornMotor.ok || !wornCar.ok) throw new Error('到達しない');
    expect(result.recipeKey).not.toBe(computeRecipeKey(resolved.selection, wornMotor.motorConfig, wornCar.carConfig, null));
  });

  it('snapshotへ載る実効configはWear反映**後**の値である(4段が効いている)', () => {
    const { result, inventory, loadout, raw } = prepare();
    const resolved = deriveMaterialSelectionFromEquipment(loadout, inventory);
    if (!resolved.ok) throw new Error('到達しない');
    const garageBuild = resolveGarageBuild(DEFAULT_GARAGE_SELECTION);
    const composed = composeConfigFromMaterials(
      raw, garageBuild.carConfig, resolveProductionMaterialCompositionBaseline(raw, garageBuild), resolved.selection,
    );
    if (!composed.ok) throw new Error('到達しない');
    const wear = {
      magnetDemagnetizationFraction: 0.2, gearSeizureFraction: 0.1, brushWearFraction: 0.4, bearingSeizureFraction: 0.25,
    };
    const wornMotor = applyWearToMotorConfig(composed.motorConfig, wear);
    if (!wornMotor.ok) throw new Error('到達しない');
    expect(result.motorConfig).toEqual(wornMotor.motorConfig);
    // 非空虚性: Wear反映前とは異なる(劣化が実際に効いている)。
    expect(result.motorConfig.magnetStrength).not.toBe(composed.motorConfig.magnetStrength);
  });

  it('initialDestructionStateは装備ギヤ個体のtoothLossCountでseedされ、profileはDestructionConfig由来である(7段)', () => {
    const { result } = prepare();
    expect(result.initialDestructionState.modes.D06.toothLossCount).toBe(3); // 装備個体の永続値
    const fresh = createInitialDestructionState(result.destructionConfig.battery.profile);
    expect(result.initialDestructionState.battery).toEqual(fresh.battery);
    // D06のtoothLossCount以外はfresh初期値のまま(seedingの対象を広げない)。
    expect({ ...result.initialDestructionState.modes.D06, toothLossCount: 0 })
      .toEqual({ ...fresh.modes.D06, toothLossCount: 0 });
  });

  it('同一入力の2回呼出しが同値の結果を返す(純関数性、隠れた読取り元がない)', () => {
    const a = prepare().result;
    const b = prepare().result;
    expect(a.recipeKey).toBe(b.recipeKey);
    expect(a.motorConfig).toEqual(b.motorConfig);
    expect(a.destructionConfig).toEqual(b.destructionConfig);
    expect(a.initialDestructionState).toEqual(b.initialDestructionState);
  });
});

describe('C-4(alice担当分): 8段の各手順がprepareDestructionRun本体でexact 1回だけ呼ばれる', () => {
  // 呼出し回数モックではなく構造監査で固定する——`prepareDestructionRun`は各段を直接importして
  // 呼ぶ純関数であり、ESMのimport bindingはspyで差し替えられない(既存S-4監査と同じ手法を採る)。
  // 「同じ事実を2回読む」経路が増えれば件数が2になって落ちる。
  function functionBody(source: string, functionName: string): string {
    const headerMatch = new RegExp(`export function ${functionName}\\b`).exec(source);
    if (!headerMatch) throw new Error(`監査テストの前提が崩れています: ${functionName}の定義が見つかりません`);
    const parenStart = source.indexOf('(', headerMatch.index);
    let depth = 0;
    let parenEnd = -1;
    for (let i = parenStart; i < source.length; i++) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')') { depth -= 1; if (depth === 0) { parenEnd = i; break; } }
    }
    const bodyStart = source.indexOf('{', parenEnd);
    let braceDepth = 0;
    for (let i = bodyStart; i < source.length; i++) {
      if (source[i] === '{') braceDepth += 1;
      else if (source[i] === '}') { braceDepth -= 1; if (braceDepth === 0) return source.slice(bodyStart, i + 1); }
    }
    throw new Error(`監査テストの前提が崩れています: ${functionName}の本体終端が見つかりません`);
  }

  /** コメント行を除いた本体(JSDoc・行コメント中の関数名言及を誤検知しないため)。 */
  function bodyWithoutComments(): string {
    const body = functionBody(readFileSync(GAME_STORE_PATH, 'utf-8'), 'prepareDestructionRun');
    return body.split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/**');
      })
      .join('\n');
  }

  it.each([
    ['resolveGarageBuild('], // 1d〜1e: garageSelectionの解決は1回だけ(結果を両用途へ渡す、S-3・C-4)
    ['deriveMaterialSelectionFromEquipment('], // 1c: selectionの導出は1回だけ
    ['composeConfigFromMaterials('], // 1e: materialComposedBaseの構築は1回だけ
    ['validateMaterialComposedBase('], // 2: 有限性検証(computeRecipeKeyより前)
    ['computeRecipeKey('], // 3: Wear反映前のbaseから1回だけ
    ['applyWearToMotorConfig('], // 4: Wear反映は走行前1回のみ
    ['applyWearToCarConfig('], // 4
    ['assembleDestructionConfig('], // 5
    ['seedInitialDestructionStateFromWear('], // 7: 再seedingは行わない
  ])('%s の呼出しはprepareDestructionRun本体でちょうど1回', (needle) => {
    expect(bodyWithoutComments().split(needle).length - 1).toBe(1);
  });

  it('非空虚性: 監査対象の本体抽出が実際に機能している(既知トークンを含む)', () => {
    const body = bodyWithoutComments();
    expect(body).toContain('snapshotInput');
    expect(body.length).toBeGreaterThan(500);
  });
});
