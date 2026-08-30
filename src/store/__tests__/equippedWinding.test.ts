// P4-1B(2026-08-30人間承認、担当A2・A3): 装備中巻線記録の単一出典selector。
import { describe, expect, it } from 'vitest';
import { selectEquippedWindingRecord } from '../equippedWinding';
import type { EquipmentLoadout } from '../runOutcomeApplication';
import type { PlayerInventory, RotorAssemblyState } from '../../materials/inventoryItem';
import type { WindingRecord } from '../../materials/windingRecord';

function record(turnCount: number): WindingRecord {
  return Array.from({ length: turnCount }, () => ({
    position: 0.25, arm: 'left' as const, direction: 1 as const, tension: 0.5,
  }));
}

function rotor(assemblyId: string, winding: RotorAssemblyState['winding']): RotorAssemblyState {
  return {
    assemblyId,
    sourceWireMaterialId: 'wire-copper-standard',
    consumedWireM: 1,
    collapsed: false,
    burnedOut: false,
    winding,
    coatingDamageFraction: 0,
  };
}

function inventory(rotors: RotorAssemblyState[]): PlayerInventory {
  return { cashG: 0, items: [], stackableStock: [], rotorAssemblies: rotors, bodyParts: [], bearingAssemblies: [] };
}

function loadout(rotorAssemblyId: string): EquipmentLoadout {
  return {
    rotorAssemblyId, batteryItemId: 'b', brushItemId: 'br', magnetItemId: 'm',
    gearItemId: 'g', bearingAssemblyId: 'be', bodyAssemblyId: null,
  };
}

describe('selectEquippedWindingRecord', () => {
  it('装備中のrecordedローターの記録だけを返す', () => {
    const target = record(30);
    const inv = inventory([
      rotor('other', { kind: 'recorded', record: record(50), wireGaugeMm: 0.4, parallelStrands: 1 }),
      rotor('equipped', { kind: 'recorded', record: target, wireGaugeMm: 0.4, parallelStrands: 1 }),
    ]);
    expect(selectEquippedWindingRecord(inv, loadout('equipped'))).toBe(target);
  });

  it('legacy個体はnullを返す(記録を捏造しない)', () => {
    const inv = inventory([rotor('equipped', { kind: 'legacy' })]);
    expect(selectEquippedWindingRecord(inv, loadout('equipped'))).toBeNull();
  });

  it('装備IDに対応する個体が無ければnull(他の個体で代用しない)', () => {
    const inv = inventory([rotor('other', { kind: 'recorded', record: record(30), wireGaugeMm: 0.4, parallelStrands: 1 })]);
    expect(selectEquippedWindingRecord(inv, loadout('missing'))).toBeNull();
  });

  it('ローターが1つも無い在庫でもnullを返す(例外にしない)', () => {
    expect(selectEquippedWindingRecord(inventory([]), loadout('any'))).toBeNull();
  });
});
