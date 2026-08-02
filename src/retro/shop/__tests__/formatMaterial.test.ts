import { describe, expect, it } from 'vitest';
import {
  formatCatalogRowAriaLabel,
  formatInventoryRowAriaLabel,
  formatPriceLabel,
  formatPurchaseUnit,
  formatRepresentativeProperty,
  formatWearState,
} from '../formatMaterial';
import type { InventoryRow } from '../../../store/shopEconomy';
import { ALL_MATERIALS } from '../../../materials/materials';
import { GEAR_TOTAL_TOOTH_COUNT, type InventoryItem } from '../../../materials/inventoryItem';

function materialOf(id: string) {
  const material = ALL_MATERIALS.find((m) => m.id === id);
  if (!material) throw new Error(`fixture not found: ${id}`);
  return material;
}

describe('formatRepresentativeProperty', () => {
  it('VerifiedNumericValueは数値をそのまま表示する', () => {
    const wire = materialOf('wire-copper-standard');
    expect(formatRepresentativeProperty(wire)).toBe('抵抗率 16.8 nΩ·m');
  });

  it('PendingNumericValueは数値を出さず「未検証」と単位のみ表示する', () => {
    const gear = materialOf('gear-pom'); // density: pending
    const line = formatRepresentativeProperty(gear);
    expect(line).toContain('未検証');
    expect(line).not.toMatch(/\d/);
  });

  it('body-noneのように物性フィールドを持たない場合はnull', () => {
    const bodyNone = materialOf('body-none');
    expect(formatRepresentativeProperty(bodyNone)).toBeNull();
  });

  it('battery/brush/rollerはnull(数値フィールドなし)', () => {
    expect(formatRepresentativeProperty(materialOf('battery-alkaline'))).toBeNull();
    expect(formatRepresentativeProperty(materialOf('brush-carbon'))).toBeNull();
    expect(formatRepresentativeProperty(materialOf('roller-pom-fixed'))).toBeNull();
  });
});

describe('formatPurchaseUnit / formatPriceLabel', () => {
  it('線材は1 m、ワニスは1 ml、それ以外は1個', () => {
    expect(formatPurchaseUnit(materialOf('wire-copper-standard'))).toBe('1 m');
    expect(formatPurchaseUnit(materialOf('coating-polyester'))).toBe('1 ml');
    expect(formatPurchaseUnit(materialOf('magnet-ferrite'))).toBe('1個');
  });

  it('購入可能な6ファミリーは価格を表示する', () => {
    expect(formatPriceLabel(materialOf('magnet-ferrite'))).toBe('40 G / 1個');
  });

  it('購入不可な3ファミリー(substrate/roller/body)は閲覧のみ表示になる(Fable必須修正A)', () => {
    expect(formatPriceLabel(materialOf('substrate-cardboard'))).toBe('試遊版では閲覧のみ');
    expect(formatPriceLabel(materialOf('roller-none'))).toBe('試遊版では閲覧のみ');
    expect(formatPriceLabel(materialOf('body-cardboard-cowl'))).toBe('試遊版では閲覧のみ');
  });
});

describe('formatWearState', () => {
  it('磁石・ギヤ・ブラシは日本語ラベル+パーセント+単位で表示する', () => {
    const magnetItem: InventoryItem = {
      itemId: 'fixture-magnet-01',
      family: 'magnet',
      materialId: 'magnet-ferrite',
      wearState: { kind: 'magnet', demagnetizationFraction: 0.12 },
    };
    expect(formatWearState(magnetItem)).toBe('減磁度 12%');
  });

  it('ギヤは歯欠け数/総歯数の比率を「歯欠け度」として表示する(P3-0新型WearState.gear)', () => {
    const gearItem: InventoryItem = {
      itemId: 'fixture-gear-01',
      family: 'gear',
      materialId: 'gear-pom',
      wearState: { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 3, seizureFraction: 0.4 },
    };
    // 表示はtoothLossCount/totalToothCountのみを反映する。seizureFraction(サルベージ等の
    // 経済評価専用、Fable裁定の補完乗算入力)はこの表示に一切流用しない。
    expect(formatWearState(gearItem)).toBe(`歯欠け度 ${Math.round((3 / GEAR_TOTAL_TOOTH_COUNT) * 100)}%`);
  });

  it('電池はwearState未追跡のためnullを返す', () => {
    const batteryItem: InventoryItem = {
      itemId: 'fixture-battery-01',
      family: 'battery',
      materialId: 'battery-alkaline',
      wearState: undefined,
    };
    expect(formatWearState(batteryItem)).toBeNull();
  });
});

// Suu_mot3コードレビュー指摘: 購入不可3ファミリー(substrate/roller/body)もフォーカス可能な
// 行として必ず提示できるよう、aria-labelに「閲覧のみ」を含める設計になっているかを検証する。
describe('formatCatalogRowAriaLabel', () => {
  it('購入可能ファミリーは価格・購入単位を含む', () => {
    const label = formatCatalogRowAriaLabel(materialOf('magnet-ferrite'));
    expect(label).toContain('購入');
    expect(label).toContain('40 G');
  });

  it('購入不可ファミリー(substrate/roller/body)は「試遊版では閲覧のみ」を含む', () => {
    for (const id of ['substrate-cardboard', 'roller-none', 'body-none'] as const) {
      const label = formatCatalogRowAriaLabel(materialOf(id));
      expect(label).toContain('試遊版では閲覧のみ');
    }
  });
});

describe('formatInventoryRowAriaLabel', () => {
  it('個体行はサルベージ操作の説明を含む', () => {
    const row: InventoryRow = {
      key: 'fixture-magnet-01',
      kind: 'item',
      material: materialOf('magnet-ferrite'),
      item: { itemId: 'fixture-magnet-01', family: 'magnet', materialId: 'magnet-ferrite', wearState: { kind: 'magnet', demagnetizationFraction: 0 } },
    };
    expect(formatInventoryRowAriaLabel(row)).toContain('サルベージ');
  });

  it('stackable行は閲覧のみと数量を含む(サルベージ非対応)', () => {
    const row: InventoryRow = {
      key: 'wire:wire-copper-standard',
      kind: 'stack',
      material: materialOf('wire-copper-standard'),
      stack: { family: 'wire', materialId: 'wire-copper-standard', quantityM: 5 },
    };
    const label = formatInventoryRowAriaLabel(row);
    expect(label).toContain('閲覧のみ');
    expect(label).toContain('5 m');
  });
});
