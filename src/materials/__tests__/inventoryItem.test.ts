import { describe, expect, it } from 'vitest';
import { computeSalvageRate, type InventoryItem, type PlayerInventory, type StackableStockEntry, type WearState } from '../inventoryItem';
import {
  ALL_MATERIALS,
  BATTERY_MATERIALS,
  BODY_MATERIALS,
  BRUSH_MATERIALS,
  COATING_MATERIALS,
  GEAR_MATERIALS,
  MAGNET_MATERIALS,
  ROLLER_MATERIALS,
  SUBSTRATE_MATERIALS,
  WIRE_MATERIALS,
  type Material,
} from '../materials';

const LOW_BAND_MIN = 0.1;
const LOW_BAND_MAX = 0.2;
const HIGH_BAND_MIN = 0.4;
const HIGH_BAND_MAX = 0.6;

describe('inventoryItem.ts: 型契約(コンパイル時)', () => {
  it('1. StackableStockEntryのwireケースはWireMaterialId+quantityMのみ、coatingケースはCoatingMaterialId+quantityMlのみを受理する', () => {
    const wireEntry: StackableStockEntry = { family: 'wire', materialId: 'wire-copper-standard', quantityM: 10 };
    const coatingEntry: StackableStockEntry = { family: 'coating', materialId: 'coating-polyester', quantityMl: 5 };
    expect(wireEntry.family).toBe('wire');
    expect(coatingEntry.family).toBe('coating');

    // @ts-expect-error wireケースにmagnet系materialIdは受理されない
    const badMaterialId: StackableStockEntry = { family: 'wire', materialId: 'magnet-ferrite', quantityM: 1 };
    // @ts-expect-error wireケースはquantityMlではなくquantityMのみを持つ
    const badFieldName: StackableStockEntry = { family: 'wire', materialId: 'wire-copper-standard', quantityMl: 1 };
    // @ts-expect-error coatingケースにwire系materialIdは受理されない
    const badCoatingMaterialId: StackableStockEntry = { family: 'coating', materialId: 'wire-copper-standard', quantityMl: 1 };
    expect([badMaterialId, badFieldName, badCoatingMaterialId].length).toBe(3);
  });

  it('2. InventoryItemの4バリアント(magnet/gear/brush/battery)は対応するmaterialId・wearStateの形のみを受理する', () => {
    const magnetItem: InventoryItem = {
      itemId: 'item-1',
      family: 'magnet',
      materialId: 'magnet-ferrite',
      wearState: { kind: 'magnet', demagnetizationFraction: 0 },
    };
    const gearItem: InventoryItem = {
      itemId: 'item-2',
      family: 'gear',
      materialId: 'gear-pom',
      wearState: { kind: 'gear', toothDamageFraction: 0 },
    };
    const brushItem: InventoryItem = {
      itemId: 'item-3',
      family: 'brush',
      materialId: 'brush-carbon',
      wearState: { kind: 'brush', wearFraction: 0 },
    };
    const batteryItem: InventoryItem = { itemId: 'item-4', family: 'battery', materialId: 'battery-alkaline', wearState: undefined };
    expect(magnetItem.family).toBe('magnet');
    expect(gearItem.family).toBe('gear');
    expect(brushItem.family).toBe('brush');
    expect(batteryItem.wearState).toBeUndefined();

    // @ts-expect-error gearのmaterialIdにmagnetのWearStateは受理されない
    const badWearStateKind: InventoryItem = { itemId: 'item-5', family: 'gear', materialId: 'gear-pom', wearState: { kind: 'magnet', demagnetizationFraction: 0 } };
    // @ts-expect-error magnetのmaterialIdにgear系IDは受理されない
    const badMaterialId: InventoryItem = { itemId: 'item-6', family: 'magnet', materialId: 'gear-pom', wearState: { kind: 'magnet', demagnetizationFraction: 0 } };
    // @ts-expect-error batteryはwearState: undefined固定であり値を持てない
    const badBatteryWearState: InventoryItem = { itemId: 'item-7', family: 'battery', materialId: 'battery-alkaline', wearState: { kind: 'magnet', demagnetizationFraction: 0 } };
    expect([badWearStateKind, badMaterialId, badBatteryWearState].length).toBe(3);
  });

  it('3. InventoryItem・PlayerInventory・StackableStockEntryはbrabit側から読み取り専用(readonly)に消費できる', () => {
    const inventory: PlayerInventory = {
      cashG: 1000,
      items: [{ itemId: 'item-1', family: 'battery', materialId: 'battery-alkaline', wearState: undefined }],
      stackableStock: [{ family: 'wire', materialId: 'wire-copper-standard', quantityM: 10 }],
    };
    expect(inventory.cashG).toBe(1000);
    expect(inventory.items).toHaveLength(1);

    // readonlyはTypeScriptの型検査のみで保証される(JSランタイムでは強制されない)。
    // 以下はビルド時に型エラーとして検出されることの確認であり、@ts-expect-errorが
    // 効かない(=エラーが出ない)場合はnpm run buildが「未使用の@ts-expect-error」で
    // 失敗する。実行後の値の変化はランタイム上の挙動であり本テストの確認対象ではない。
    // @ts-expect-error PlayerInventory.cashGはreadonlyであり代入できない
    inventory.cashG = 2000;
    // @ts-expect-error PlayerInventory.itemsはreadonly配列であり要素を追加できない
    inventory.items.push(inventory.items[0]);
  });
});

describe('inventoryItem.ts: computeSalvageRateの実行時契約', () => {
  it('4. 9ファミリー全種(anchor tier含む)について、wearState=undefinedでok:trueを返す', () => {
    for (const material of ALL_MATERIALS) {
      const result = computeSalvageRate(material, undefined);
      expect(result.ok, `${material.id}`).toBe(true);
    }
  });

  it('5. 導線tier0-1・磁石tier0-1・ブラシtier0-2・全ギヤは低帯域[0.10,0.20]に収まる(Fable Q3反映)', () => {
    const lowBandMaterials: Material[] = [
      ...WIRE_MATERIALS.filter((m) => m.tierIndex <= 1),
      ...MAGNET_MATERIALS.filter((m) => m.tierIndex <= 1),
      ...BRUSH_MATERIALS.filter((m) => m.tierIndex <= 2),
      ...GEAR_MATERIALS,
    ];
    for (const material of lowBandMaterials) {
      const result = computeSalvageRate(material, undefined);
      expect(result.ok, material.id).toBe(true);
      if (result.ok) {
        expect(result.rate, material.id).toBeGreaterThanOrEqual(LOW_BAND_MIN);
        expect(result.rate, material.id).toBeLessThanOrEqual(LOW_BAND_MAX);
      }
    }
  });

  it('6. 導線tier2-3・磁石tier2-3・ブラシtier3(貴金属ブラシ)は高帯域[0.40,0.60]に収まる(Fable Q3反映)', () => {
    const highBandMaterials: Material[] = [
      ...WIRE_MATERIALS.filter((m) => m.tierIndex >= 2),
      ...MAGNET_MATERIALS.filter((m) => m.tierIndex >= 2),
      ...BRUSH_MATERIALS.filter((m) => m.tierIndex === 3),
    ];
    for (const material of highBandMaterials) {
      const result = computeSalvageRate(material, undefined);
      expect(result.ok, material.id).toBe(true);
      if (result.ok) {
        expect(result.rate, material.id).toBeGreaterThanOrEqual(HIGH_BAND_MIN);
        expect(result.rate, material.id).toBeLessThanOrEqual(HIGH_BAND_MAX);
      }
    }
  });

  it('7. 電池・substrate・roller・body・coatingは(全tier)低帯域[0.10,0.20]に収まる', () => {
    const alwaysLowBandMaterials: Material[] = [...BATTERY_MATERIALS, ...SUBSTRATE_MATERIALS, ...ROLLER_MATERIALS, ...BODY_MATERIALS, ...COATING_MATERIALS];
    for (const material of alwaysLowBandMaterials) {
      const result = computeSalvageRate(material, undefined);
      expect(result.ok, material.id).toBe(true);
      if (result.ok) {
        expect(result.rate, material.id).toBeGreaterThanOrEqual(LOW_BAND_MIN);
        expect(result.rate, material.id).toBeLessThanOrEqual(LOW_BAND_MAX);
      }
    }
  });

  it('8. wearState=undefinedは各帯域のbandMax(低帯域0.20/高帯域0.60)を返す', () => {
    const ferrite = MAGNET_MATERIALS.find((m) => m.id === 'magnet-ferrite')!;
    const neodymium = MAGNET_MATERIALS.find((m) => m.id === 'magnet-neodymium')!;
    expect(computeSalvageRate(ferrite, undefined)).toEqual({ ok: true, rate: LOW_BAND_MAX });
    expect(computeSalvageRate(neodymium, undefined)).toEqual({ ok: true, rate: HIGH_BAND_MAX });
  });

  it('9. fraction=0(新品)はwearState=undefinedと同じ結果になる', () => {
    const ferrite = MAGNET_MATERIALS.find((m) => m.id === 'magnet-ferrite')!;
    const wearState: WearState = { kind: 'magnet', demagnetizationFraction: 0 };
    expect(computeSalvageRate(ferrite, wearState)).toEqual(computeSalvageRate(ferrite, undefined));
  });

  it('10. fraction=1(限界)は各帯域のbandMin(低帯域0.10/高帯域0.40)を返す(spec §5.4残骸0禁止の境界値)', () => {
    const ferrite = MAGNET_MATERIALS.find((m) => m.id === 'magnet-ferrite')!;
    const neodymium = MAGNET_MATERIALS.find((m) => m.id === 'magnet-neodymium')!;
    expect(computeSalvageRate(ferrite, { kind: 'magnet', demagnetizationFraction: 1 })).toEqual({ ok: true, rate: LOW_BAND_MIN });
    expect(computeSalvageRate(neodymium, { kind: 'magnet', demagnetizationFraction: 1 })).toEqual({ ok: true, rate: HIGH_BAND_MIN });
    expect(LOW_BAND_MIN).toBeGreaterThan(0);
    expect(HIGH_BAND_MIN).toBeGreaterThan(0);
  });

  it('11. fraction=0.5(中間点)が補間式どおりの値(低帯域0.15・高帯域0.50)になる(浮動小数点誤差はtoBeCloseToで許容)', () => {
    const pom = GEAR_MATERIALS.find((m) => m.id === 'gear-pom')!;
    const preciousBrush = BRUSH_MATERIALS.find((m) => m.id === 'brush-precious-metal')!;
    const gearResult = computeSalvageRate(pom, { kind: 'gear', toothDamageFraction: 0.5 });
    const brushResult = computeSalvageRate(preciousBrush, { kind: 'brush', wearFraction: 0.5 });
    expect(gearResult.ok).toBe(true);
    expect(brushResult.ok).toBe(true);
    if (gearResult.ok) expect(gearResult.rate).toBeCloseTo(0.15, 10);
    if (brushResult.ok) expect(brushResult.rate).toBeCloseTo(0.5, 10);
  });

  it('12. wearState.kindとmaterial.familyが不一致の場合、ok:falseで拒否する', () => {
    const gear = GEAR_MATERIALS.find((m) => m.id === 'gear-pom')!;
    const mismatched: WearState = { kind: 'magnet', demagnetizationFraction: 0.3 };
    const result = computeSalvageRate(gear, mismatched);
    expect(result.ok).toBe(false);
  });

  it('13. fractionがNaN・Infinity・負値・1超過の場合、それぞれok:falseで拒否する', () => {
    const magnet = MAGNET_MATERIALS.find((m) => m.id === 'magnet-ferrite')!;
    expect(computeSalvageRate(magnet, { kind: 'magnet', demagnetizationFraction: Number.NaN }).ok).toBe(false);
    expect(computeSalvageRate(magnet, { kind: 'magnet', demagnetizationFraction: Number.POSITIVE_INFINITY }).ok).toBe(false);
    expect(computeSalvageRate(magnet, { kind: 'magnet', demagnetizationFraction: -0.1 }).ok).toBe(false);
    expect(computeSalvageRate(magnet, { kind: 'magnet', demagnetizationFraction: 1.1 }).ok).toBe(false);
  });

  it('14. 決定論: 同一入力への複数回呼び出しが常に同一の値になる', () => {
    const gear = GEAR_MATERIALS.find((m) => m.id === 'gear-titanium')!;
    const wearState: WearState = { kind: 'gear', toothDamageFraction: 0.4 };
    expect(computeSalvageRate(gear, wearState)).toEqual(computeSalvageRate(gear, wearState));
  });

  it('15. 入力material・wearStateオブジェクト自体を変更しない(非破壊)', () => {
    const magnet = MAGNET_MATERIALS.find((m) => m.id === 'magnet-neodymium')!;
    const wearState: WearState = { kind: 'magnet', demagnetizationFraction: 0.6 };
    const magnetSnapshot = { ...magnet };
    const wearStateSnapshot = { ...wearState };
    computeSalvageRate(magnet, wearState);
    expect(magnet).toEqual(magnetSnapshot);
    expect(wearState).toEqual(wearStateSnapshot);
  });

  it('16. 出力が常に有限であり、判定された帯域の範囲を超えない(全9ファミリー×代表fraction値[0,0.5,1]の網羅ループ)', () => {
    const representativeFractions = [0, 0.5, 1];
    for (const material of ALL_MATERIALS) {
      const wearStates: (WearState | undefined)[] =
        material.family === 'magnet'
          ? representativeFractions.map((f): WearState => ({ kind: 'magnet', demagnetizationFraction: f }))
          : material.family === 'gear'
            ? representativeFractions.map((f): WearState => ({ kind: 'gear', toothDamageFraction: f }))
            : material.family === 'brush'
              ? representativeFractions.map((f): WearState => ({ kind: 'brush', wearFraction: f }))
              : [undefined];

      for (const wearState of wearStates) {
        const result = computeSalvageRate(material, wearState);
        expect(result.ok, `${material.id}: ${JSON.stringify(wearState)}`).toBe(true);
        if (!result.ok) continue;
        expect(Number.isFinite(result.rate), material.id).toBe(true);
        const isHigh = (material.family === 'wire' || material.family === 'magnet') && material.tierIndex >= 2;
        const isHighBrush = material.family === 'brush' && material.tierIndex === 3;
        const [bandMin, bandMax] = isHigh || isHighBrush ? [HIGH_BAND_MIN, HIGH_BAND_MAX] : [LOW_BAND_MIN, LOW_BAND_MAX];
        expect(result.rate, material.id).toBeGreaterThanOrEqual(bandMin);
        expect(result.rate, material.id).toBeLessThanOrEqual(bandMax);
      }
    }
  });
});
