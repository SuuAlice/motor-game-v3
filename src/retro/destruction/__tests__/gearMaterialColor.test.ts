// P3-4 G7-D(art-spec §6「D06破片は素材色」、2026-08-20人間承認): 有限写像と正典入力。
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../palette';
import { GEAR_MATERIALS } from '../../../materials/materials';
import { GEAR_MATERIAL_PALETTE_KEY, resolveGearMaterialColorKey } from '../gearMaterialColor';
import type { EquipmentIdSnapshot } from '../../../store/runOutcomeApplication';
import type { PlayerInventory } from '../../../materials/inventoryItem';

function inventoryWithGear(itemId: string, materialId: string): PlayerInventory {
  return {
    cashG: 0,
    items: [{ itemId, family: 'gear', materialId, wearState: { kind: 'gear', toothLossCount: 0 } }],
    bearingAssemblies: [],
    rotorAssemblies: [],
    bodyAssemblies: [],
    wireStock: [],
  } as never;
}

function vehicleSnapshot(gearItemId: string): EquipmentIdSnapshot {
  return {
    context: 'vehicle', rotorAssemblyId: 'r1', batteryItemId: 'b1', brushItemId: 'br1',
    magnetItemId: 'm1', gearItemId, bearingAssemblyId: 'a1', bodyAssemblyId: null,
  };
}

describe('有限写像(人間承認済み)', () => {
  it('4素材すべてが承認どおりのPaletteKeyへ写る', () => {
    expect(GEAR_MATERIAL_PALETTE_KEY).toEqual({
      'gear-pom': 'N6',
      'gear-nylon-pa6': 'W3',
      'gear-peek': 'W2',
      'gear-titanium': 'N4',
    });
  });

  it('materials.tsのギヤ素材を漏れなく網羅する(素材追加時に落ちる)', () => {
    const ids = GEAR_MATERIALS.map((material) => material.id).sort();
    expect(Object.keys(GEAR_MATERIAL_PALETTE_KEY).sort()).toEqual(ids);
  });

  it('4色は互いに異なり、すべて実在のパレットキーである', () => {
    const keys = Object.values(GEAR_MATERIAL_PALETTE_KEY);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(PALETTE).toHaveProperty(key);
  });
});

describe('正典入力(候補A: run開始時の装備snapshot)', () => {
  it('snapshotのgearItemIdから在庫個体をたどって色を解決する', () => {
    for (const material of GEAR_MATERIALS) {
      const key = resolveGearMaterialColorKey(vehicleSnapshot('g1'), inventoryWithGear('g1', material.id));
      expect(key).toBe(GEAR_MATERIAL_PALETTE_KEY[material.id]);
    }
  });

  it('run未開始(snapshotなし)では解決しない', () => {
    expect(resolveGearMaterialColorKey(null, inventoryWithGear('g1', 'gear-pom'))).toBeNull();
  });

  it('motor-only文脈では解決しない(D06はmotor-onlyで発生しない、§18)', () => {
    const motor: EquipmentIdSnapshot = {
      context: 'motor', rotorAssemblyId: 'r1', batteryItemId: 'b1', brushItemId: 'br1',
      magnetItemId: 'm1', gearItemId: null, bearingAssemblyId: null, bodyAssemblyId: null,
    };
    expect(resolveGearMaterialColorKey(motor, inventoryWithGear('g1', 'gear-pom'))).toBeNull();
  });

  it('在庫に該当個体が無ければ解決しない(別素材の色で代用しない)', () => {
    expect(resolveGearMaterialColorKey(vehicleSnapshot('missing'), inventoryWithGear('g1', 'gear-peek'))).toBeNull();
  });

  it('参照するのはsnapshotのgearItemIdであって、別個体ではない', () => {
    const inventory = {
      ...inventoryWithGear('g1', 'gear-pom'),
      items: [
        { itemId: 'g1', family: 'gear', materialId: 'gear-pom', wearState: { kind: 'gear', toothLossCount: 0 } },
        { itemId: 'g2', family: 'gear', materialId: 'gear-titanium', wearState: { kind: 'gear', toothLossCount: 0 } },
      ],
    } as never as PlayerInventory;
    expect(resolveGearMaterialColorKey(vehicleSnapshot('g2'), inventory)).toBe('N4');
  });
});
