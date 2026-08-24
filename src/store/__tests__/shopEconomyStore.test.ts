// P3-4 G8: 通常の棚UIから既存EquipmentLoadoutを更新する薄いfaçadeの検証。
// 装備規則自体はsaveStore/runOutcomeApplicationの既存検証を単一出典とし、ここでは
// 4ファミリーの有限写像・gear/bearing同時更新・失敗理由の中継だけを固定する。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GEAR_TOTAL_TOOTH_COUNT, type InventoryItem, type PlayerInventory } from '../../materials/inventoryItem';
import type { MaterialId } from '../../materials/materials';
import { __testOnly, useSaveStore, type PersistedSaveState } from '../saveStore';
import { useShopEconomyStore } from '../shopEconomyStore';

function makeFakeLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => map.clear(),
  };
}

const originalSetEquipmentLoadout = useSaveStore.getState().setEquipmentLoadout;

function resetStores(): void {
  // saveStore.test.tsと同じ共有storage手順。新しいfixture基盤は作らない。
  // @ts-expect-error テスト用fake localStorage
  globalThis.localStorage = makeFakeLocalStorage();
  const fresh = __testOnly.freshBootstrap();
  __testOnly.writeV16(fresh);
  useSaveStore.setState({
    ...fresh,
    setEquipmentLoadout: originalSetEquipmentLoadout,
    currentRunSequence: null,
    leaseState: 'leaseNotAcquired',
    pendingRunEquipmentSnapshot: null,
    pendingRunSaveId: null,
    bootstrapError: null,
  });
  useShopEconomyStore.setState({
    state: { ...fresh.inventory, nextSessionIdCounter: fresh.idCounters.nextItemCounter },
    equipmentLoadout: fresh.equipmentLoadout,
    lastErrorJa: null,
    lastSalvageAmountG: null,
  });
  useSaveStore.getState()._evaluateLeaseOnce(new Date(0).toISOString());
}

function readPersisted(): PersistedSaveState {
  const result = __testOnly.readLatestV16();
  if (result.kind !== 'ok') throw new Error(`fake storageの読み取りに失敗: ${result.kind}`);
  return result.state;
}

function replaceInventory(inventory: PlayerInventory): void {
  const next = { ...readPersisted(), inventory };
  __testOnly.writeV16(next);
  useSaveStore.setState({ inventory });
}

function purchaseItem(materialId: MaterialId, family: InventoryItem['family']): InventoryItem {
  const result = useSaveStore.getState().purchaseMaterialAction(materialId);
  expect(result.ok, `${materialId}の購入に失敗`).toBe(true);
  const item = useSaveStore.getState().inventory.items
    .filter((candidate) => candidate.family === family && candidate.materialId === materialId)
    .at(-1);
  expect(item, `${materialId}の購入個体が見つからない`).toBeDefined();
  return item!;
}

beforeEach(resetStores);

afterEach(() => {
  useSaveStore.getState().stopLeaseLifecycle();
  // @ts-expect-error fake localStorageの後片付け
  delete globalThis.localStorage;
});

describe('4ファミリーの有限装備写像', () => {
  it.each([
    ['magnet-alnico', 'magnet', 'magnetItemId'],
    ['brush-silver-graphite', 'brush', 'brushItemId'],
    ['battery-lithium-polymer', 'battery', 'batteryItemId'],
  ] as const)('%sは%sの対象フィールドだけを置換する', (materialId, family, field) => {
    const item = purchaseItem(materialId, family);
    const before = useSaveStore.getState().equipmentLoadout;
    useShopEconomyStore.setState({ lastSalvageAmountG: 100 });

    expect(useShopEconomyStore.getState().equip(item.itemId)).toBe(true);

    const expected = { ...before, [field]: item.itemId };
    expect(useSaveStore.getState().equipmentLoadout).toEqual(expected);
    expect(readPersisted().equipmentLoadout).toEqual(expected);
    expect(useShopEconomyStore.getState().equipmentLoadout).toEqual(expected);
    expect(useShopEconomyStore.getState().lastErrorJa).toBeNull();
    expect(useShopEconomyStore.getState().lastSalvageAmountG).toBeNull();
  });

  it('gearは購入時に生成済みのbearingと必ず同時に置換する', () => {
    const item = purchaseItem('gear-nylon-pa6', 'gear');
    const inventory = useSaveStore.getState().inventory;
    const bearing = inventory.bearingAssemblies.find((candidate) => candidate.gearItemId === item.itemId);
    expect(bearing).toBeDefined();
    const before = useSaveStore.getState().equipmentLoadout;

    expect(useShopEconomyStore.getState().equip(item.itemId)).toBe(true);

    const expected = {
      ...before,
      gearItemId: item.itemId,
      bearingAssemblyId: bearing!.assemblyId,
    };
    expect(useSaveStore.getState().equipmentLoadout).toEqual(expected);
    expect(readPersisted().equipmentLoadout).toEqual(expected);
  });
});

describe('拒否時はloadoutを変えず日本語理由を中継する', () => {
  it('存在しないitemIdを拒否する', () => {
    const before = useSaveStore.getState().equipmentLoadout;
    expect(useShopEconomyStore.getState().equip('missing-item')).toBe(false);
    expect(useShopEconomyStore.getState().lastErrorJa).toContain('見つかりません');
    expect(useSaveStore.getState().equipmentLoadout).toEqual(before);
    expect(readPersisted().equipmentLoadout).toEqual(before);
  });

  it('対応bearingが無いgearを推測で補わず拒否する', () => {
    const item = purchaseItem('gear-nylon-pa6', 'gear');
    const current = useSaveStore.getState().inventory;
    replaceInventory({
      ...current,
      bearingAssemblies: current.bearingAssemblies.filter((bearing) => bearing.gearItemId !== item.itemId),
    });
    const before = useSaveStore.getState().equipmentLoadout;

    expect(useShopEconomyStore.getState().equip(item.itemId)).toBe(false);
    expect(useShopEconomyStore.getState().lastErrorJa).toContain('BearingAssemblyState');
    expect(useSaveStore.getState().equipmentLoadout).toEqual(before);
    expect(readPersisted().equipmentLoadout).toEqual(before);
  });

  it('全損gearは既存validatorのdestroyedRole判定を通して拒否する', () => {
    const item = purchaseItem('gear-nylon-pa6', 'gear');
    const current = useSaveStore.getState().inventory;
    const items = current.items.map((candidate): InventoryItem => {
      if (candidate.itemId !== item.itemId || candidate.family !== 'gear') return candidate;
      return {
        ...candidate,
        wearState: { ...candidate.wearState, toothLossCount: GEAR_TOTAL_TOOTH_COUNT },
      };
    });
    replaceInventory({ ...current, items });
    const before = useSaveStore.getState().equipmentLoadout;

    expect(useShopEconomyStore.getState().equip(item.itemId)).toBe(false);
    expect(useShopEconomyStore.getState().lastErrorJa).toContain('全損済み');
    expect(useSaveStore.getState().equipmentLoadout).toEqual(before);
    expect(readPersisted().equipmentLoadout).toEqual(before);
  });

  it.each(['保存の所有権を取得できません', '保留中の走行結果があります'])('%sをUI façadeで潰さない', (reason) => {
    const blocked = vi.fn(() => ({ ok: false as const, reason }));
    useSaveStore.setState({ setEquipmentLoadout: blocked });
    const before = useSaveStore.getState().equipmentLoadout;

    expect(useShopEconomyStore.getState().equip('initial-magnet-01')).toBe(false);
    expect(blocked).toHaveBeenCalledOnce();
    expect(useShopEconomyStore.getState().lastErrorJa).toBe(reason);
    expect(useSaveStore.getState().equipmentLoadout).toEqual(before);
  });
});
