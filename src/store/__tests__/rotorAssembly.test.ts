// P4-1A(承認項目9・11): 巻線完成の純関数。原子境界・失敗非破壊性・負例を固定する。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  resolveRotorAssemblyCompletion,
  type CompleteRotorAssemblyCommand,
  type ResolveRotorAssemblyCompletionInput,
  type RotorAssemblyMotorDraft,
} from '../rotorAssembly';
import type { EquipmentLoadout } from '../runOutcomeApplication';
import { selectEquippedWindingRecord } from '../equippedWinding';
import type { PlayerInventory } from '../../materials/inventoryItem';
import { computeConsumedWireM } from '../../materials/assumedGeometry';
import { MAX_WINDING_TURNS, MIN_RUNNABLE_WINDING_TURNS, type WindingRecord } from '../../materials/windingRecord';
import { deriveWindingMotorFields, PRODUCTION_AXIS_OFFSET_COEFFICIENT_MM } from '../../materials/windingMapping';

function record(turnCount: number, options: { leftCount?: number; reversedAt?: number } = {}): WindingRecord {
  const leftCount = options.leftCount ?? turnCount;
  return Array.from({ length: turnCount }, (_, i) => ({
    position: i < leftCount ? 0.25 : 0.75,
    arm: (i < leftCount ? 'left' : 'right') as 'left' | 'right',
    direction: (i === options.reversedAt ? -1 : 1) as 1 | -1,
    tension: 0.5,
  }));
}

/** 順巻きと逆巻きが同数の記録(magneticに完全に打ち消し合う)。 */
function balancedDirectionRecord(turnCount: number): WindingRecord {
  return Array.from({ length: turnCount }, (_, i) => ({
    position: 0.5,
    arm: 'straddle' as const,
    direction: (i < turnCount / 2 ? 1 : -1) as 1 | -1,
    tension: 0.5,
  }));
}

function baseInventory(wireM = 100): PlayerInventory {
  return {
    cashG: 1000,
    items: [],
    stackableStock: [
      { family: 'wire', materialId: 'wire-copper-standard', quantityM: wireM },
      { family: 'coating', materialId: 'coating-polyester', quantityMl: 10 },
    ],
    rotorAssemblies: [
      { assemblyId: 'rotor-old', sourceWireMaterialId: 'wire-copper-standard', consumedWireM: 1, collapsed: false, burnedOut: false, winding: { kind: 'legacy' }, coatingDamageFraction: 0 },
    ],
    bodyParts: [],
    bearingAssemblies: [],
  };
}

function baseLoadout(): EquipmentLoadout {
  return {
    rotorAssemblyId: 'rotor-old',
    batteryItemId: 'battery-01',
    brushItemId: 'brush-01',
    magnetItemId: 'magnet-01',
    gearItemId: 'gear-01',
    bearingAssemblyId: 'bearing-01',
    bodyAssemblyId: null,
  };
}

/** 巻線由来フィールドを持たないmotor draft(型がそれらを排除している)。 */
function motorDraft(): RotorAssemblyMotorDraft {
  return {
    slitWidthMm: 1.5,
    sandingQuality: 0.9,
    brushPressure: 0.3,
    magnetStrength: 0.5,
    magnetDistanceMm: 10,
    batteryVoltage: 1.5,
    varnished: true,
  };
}

function makeInput(overrides: Partial<CompleteRotorAssemblyCommand> = {}, inventory = baseInventory()): ResolveRotorAssemblyCompletionInput {
  return {
    command: {
      record: record(30, { leftCount: 21, reversedAt: 10 }),
      wireMaterialId: 'wire-copper-standard',
      windingWireGaugeMm: 0.4,
      windingParallelStrands: 1,
      motorDraft: motorDraft(),
      ...overrides,
    },
    inventory,
    loadout: baseLoadout(),
    assemblyId: 'rotor-new',
  };
}

describe('成功時', () => {
  it('線材消費・ローター生成・装備差し替えを1つのResultで返す', () => {
    const input = makeInput();
    const result = resolveRotorAssemblyCompletion(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const requiredM = computeConsumedWireM(30, 1);
    const stock = result.inventory.stackableStock.find((e) => e.family === 'wire');
    expect(stock?.family === 'wire' && stock.quantityM).toBeCloseTo(100 - requiredM, 12);
    expect(result.inventory.rotorAssemblies).toHaveLength(2);
    expect(result.rotorAssembly.consumedWireM).toBeCloseTo(requiredM, 12);
    expect(result.loadout.rotorAssemblyId).toBe('rotor-new');
  });

  it('生成されたローターはrecorded由来で、記録・線径・並列本数を保持する', () => {
    const result = resolveRotorAssemblyCompletion(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const winding = result.rotorAssembly.winding;
    expect(winding.kind).toBe('recorded');
    if (winding.kind !== 'recorded') return;
    expect(winding.record).toHaveLength(30);
    expect(winding.record[10]!.direction).toBe(-1);
    expect(winding.wireGaugeMm).toBe(0.4);
    expect(winding.parallelStrands).toBe(1);
    expect(result.rotorAssembly.coatingDamageFraction).toBe(0);
  });

  it('引数を変更しない(成功時も非破壊)', () => {
    const input = makeInput();
    const before = JSON.parse(JSON.stringify({ inventory: input.inventory, loadout: input.loadout, record: input.command.record }));
    resolveRotorAssemblyCompletion(input);
    expect({ inventory: input.inventory, loadout: input.loadout, record: input.command.record }).toStrictEqual(before);
  });

  it('受理境界(10ターン・150ターン)は成功する', () => {
    for (const count of [MIN_RUNNABLE_WINDING_TURNS, MAX_WINDING_TURNS]) {
      const result = resolveRotorAssemblyCompletion(makeInput({ record: record(count) }, baseInventory(1000)));
      expect(result.ok, `count=${count}`).toBe(true);
    }
  });
});

describe('失敗時(判別unionのtaxonomy)', () => {
  const cases: { readonly label: string; readonly input: ResolveRotorAssemblyCompletionInput; readonly kind: string }[] = [
    { label: '0ターン', input: makeInput({ record: [] }), kind: 'turnCountOutOfRange' },
    { label: '1ターン', input: makeInput({ record: record(1) }), kind: 'turnCountOutOfRange' },
    { label: '9ターン', input: makeInput({ record: record(9) }), kind: 'turnCountOutOfRange' },
    { label: '151ターン', input: makeInput({ record: record(151) }, baseInventory(1000)), kind: 'invalidRecord' },
    { label: '非量子化値', input: makeInput({ record: [{ position: 0.3, arm: 'left', direction: 1, tension: 0.5 }, ...record(29)] }), kind: 'invalidRecord' },
    { label: '未知の線材', input: makeInput({ wireMaterialId: 'wire-unobtainium' }), kind: 'unknownWireMaterial' },
    { label: '在庫不足', input: makeInput({}, baseInventory(0.1)), kind: 'insufficientWire' },
    { label: '物理上限超過', input: makeInput({ record: record(150), windingWireGaugeMm: 0.8 }, baseInventory(1000)), kind: 'physicalMaxTurnsExceeded' },
  ];

  for (const testCase of cases) {
    it(`${testCase.label} → ${testCase.kind}`, () => {
      const result = resolveRotorAssemblyCompletion(testCase.input);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.kind).toBe(testCase.kind);
    });
  }

  it('assemblyId重複はduplicateAssemblyId', () => {
    const result = resolveRotorAssemblyCompletion({ ...makeInput(), assemblyId: 'rotor-old' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('duplicateAssemblyId');
  });

  it('失敗時は在庫・装備・記録を一切変更しない(再試行可能)', () => {
    const input = makeInput({}, baseInventory(0.1));
    const before = JSON.parse(JSON.stringify({ inventory: input.inventory, loadout: input.loadout, record: input.command.record }));
    const result = resolveRotorAssemblyCompletion(input);
    expect(result.ok).toBe(false);
    expect({ inventory: input.inventory, loadout: input.loadout, record: input.command.record }).toStrictEqual(before);
  });

  it('記録が壊れている場合、在庫不足より先にinvalidRecordを返す(根本的な失敗を優先)', () => {
    const input = makeInput({ record: [{ position: 0.3, arm: 'left', direction: 1, tension: 0.5 }] }, baseInventory(0));
    const result = resolveRotorAssemblyCompletion(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('invalidRecord');
  });
});

describe('巻線→MotorConfigフィールドの写像(承認項目8)', () => {
  it('K_axisは3.0(2026-08-28人間承認値)', () => {
    expect(PRODUCTION_AXIS_OFFSET_COEFFICIENT_MM).toBe(3);
  });

  it('coilTurnsは記録長、windingTurnsRatioは方向一貫性、axisOffsetMmはbalance×K_axis', () => {
    // 30ターン中1ターン逆巻き、左21/右9 → ratio=28/30、balance=12/30
    const fields = deriveWindingMotorFields(record(30, { leftCount: 21, reversedAt: 10 }));
    expect(fields.coilTurns).toBe(30);
    expect(fields.windingTurnsRatio).toBeCloseTo(28 / 30, 12);
    expect(fields.axisOffsetMm).toBeCloseTo((12 / 30) * 3, 12);
  });

  it('全ターン同方向・左右均等ならratio=1・axisOffsetMm=0', () => {
    const fields = deriveWindingMotorFields(record(30, { leftCount: 15 }));
    expect(fields.windingTurnsRatio).toBe(1);
    expect(fields.axisOffsetMm).toBe(0);
  });

  it('導出値はbase契約(0,1]を満たす', () => {
    for (const reversed of [0, 5, 14]) {
      const fields = deriveWindingMotorFields(record(30, { leftCount: 15, reversedAt: reversed }));
      expect(fields.windingTurnsRatio).toBeGreaterThan(0);
      expect(fields.windingTurnsRatio).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// P4-1A(承認項目9): 構造監査。原子境界がUI側から迂回されないことを機械的に固定する。
// ---------------------------------------------------------------------------
describe('構造監査: 原子境界の迂回禁止', () => {
  const SRC_DIR = fileURLToPath(new URL('../../', import.meta.url)); // src/store/__tests__/ → src/

  function listUiSourceFiles(dirPath: string): string[] {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name === '__tests__') continue;
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) files.push(...listUiSourceFiles(fullPath));
      else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) files.push(fullPath);
    }
    return files;
  }

  /** コメント行は実コードではないため除外する(説明文中の関数名を誤検知しない)。 */
  function nonCommentSource(path: string): string {
    return readFileSync(path, 'utf-8')
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
      })
      .join('\n');
  }

  const uiFiles = [
    ...listUiSourceFiles(join(SRC_DIR, 'components')),
    ...listUiSourceFiles(join(SRC_DIR, 'modes')),
  ];

  it('監査対象のUIファイルを取りこぼしていない', () => {
    expect(uiFiles.length).toBeGreaterThan(10);
  });

  it('UIは内部純関数resolveRotorAssemblyCompletionをimportしない', () => {
    for (const path of uiFiles) {
      expect(nonCommentSource(path), `${path}`).not.toMatch(/\bresolveRotorAssemblyCompletion\b/);
    }
  });

  it('UIはrotorAssembliesを直接組み立てない', () => {
    for (const path of uiFiles) {
      expect(nonCommentSource(path), `${path}`).not.toMatch(/rotorAssemblies\s*:/);
    }
  });

  it('検出器そのものが働く(陰性対照)', () => {
    const sample = "import { resolveRotorAssemblyCompletion } from '../store/rotorAssembly';";
    expect(sample).toMatch(/\bresolveRotorAssemblyCompletion\b/);
    expect('// resolveRotorAssemblyCompletionは呼ばない').toMatch(/\bresolveRotorAssemblyCompletion\b/);
  });
});

describe('config同時導出(承認項目8・9)', () => {
  it('派生5フィールドは記録と固定加工値から構築され、draftの値では上書きされない', () => {
    const result = resolveRotorAssemblyCompletion(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.coilTurns).toBe(30);
    expect(result.config.windingTurnsRatio).toBeCloseTo(28 / 30, 12);
    expect(result.config.axisOffsetMm).toBeCloseTo((12 / 30) * PRODUCTION_AXIS_OFFSET_COEFFICIENT_MM, 12);
    expect(result.config.wireGaugeMm).toBe(0.4);
    expect(result.config.parallelStrands).toBe(1);
  });

  it('draftの非派生フィールドはそのまま反映される', () => {
    const result = resolveRotorAssemblyCompletion(makeInput({ motorDraft: { ...motorDraft(), slitWidthMm: 2.5, varnished: false } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.slitWidthMm).toBe(2.5);
    expect(result.config.varnished).toBe(false);
  });

  it('UIが派生値を混ぜても採用されない(runtime境界でも上書き不能)', () => {
    // 型では持てないが、any経由で混入させた場合でも導出値が勝つことを実測する。
    const contaminated = {
      ...motorDraft(),
      coilTurns: 999, windingTurnsRatio: 0.1, axisOffsetMm: 3, wireGaugeMm: 0.8, parallelStrands: 2,
    } as unknown as RotorAssemblyMotorDraft;
    const result = resolveRotorAssemblyCompletion(makeInput({ motorDraft: contaminated }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.coilTurns).toBe(30);
    expect(result.config.windingTurnsRatio).toBeCloseTo(28 / 30, 12);
    expect(result.config.wireGaugeMm).toBe(0.4);
    expect(result.config.parallelStrands).toBe(1);
  });

  it('導出されたconfigのwindingTurnsRatioはbase契約(0,1]を満たす', () => {
    const result = resolveRotorAssemblyCompletion(makeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.windingTurnsRatio!).toBeGreaterThan(0);
    expect(result.config.windingTurnsRatio!).toBeLessThanOrEqual(1);
    expect(result.config.effectiveTurnsRatio).toBeUndefined();
  });
});

describe('順逆同数の記録は生成境界で拒否する(windingTurnsRatio=0はbase契約の外)', () => {
  it('10ターン5順5逆はinvalidRecordになる', () => {
    const result = resolveRotorAssemblyCompletion(makeInput({ record: balancedDirectionRecord(10) }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('invalidRecord');
  });

  it('30ターン15順15逆もinvalidRecordになる', () => {
    const result = resolveRotorAssemblyCompletion(makeInput({ record: balancedDirectionRecord(30) }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('invalidRecord');
  });

  it('拒否は在庫が足りていても起きる(在庫不足より先に契約違反を返す)', () => {
    const result = resolveRotorAssemblyCompletion(makeInput({ record: balancedDirectionRecord(30) }, baseInventory(10000)));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('invalidRecord');
  });

  it('正の最小不均衡(奇数ターンで1本差)は従来どおり受理される', () => {
    // 11ターン中6順5逆 → ratio = 1/11 > 0
    const record: WindingRecord = Array.from({ length: 11 }, (_, i) => ({
      position: 0.5, arm: 'straddle' as const, direction: (i < 6 ? 1 : -1) as 1 | -1, tension: 0.5,
    }));
    const result = resolveRotorAssemblyCompletion(makeInput({ record }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.windingTurnsRatio).toBeCloseTo(1 / 11, 12);
  });

  it('拒否時は引数を一切変更しない', () => {
    const input = makeInput({ record: balancedDirectionRecord(30) });
    const before = JSON.parse(JSON.stringify({ inventory: input.inventory, loadout: input.loadout, record: input.command.record }));
    resolveRotorAssemblyCompletion(input);
    expect({ inventory: input.inventory, loadout: input.loadout, record: input.command.record }).toStrictEqual(before);
  });
});

// ---------------------------------------------------------------------------
// P4-1B(2026-08-30人間承認、担当A2-2): 完成configの`record.length === coilTurns`を
// **selectorと同じ出典**で固定する。ここが崩れると、レシピ共有・recipeKey・走行構築が
// それぞれ別の巻数を見ることになる。
// ---------------------------------------------------------------------------
describe('P4-1B: 完成configとselectorの単一出典', () => {
  it('生成したローターをselectorで引くと、その記録長がconfig.coilTurnsと一致する', () => {
    const input = makeInput();
    const result = resolveRotorAssemblyCompletion(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const selected = selectEquippedWindingRecord(result.inventory, result.loadout);
    expect(selected).not.toBeNull();
    expect(selected).toHaveLength(result.config.coilTurns);
    expect(result.config.coilTurns).toBe(input.command.record.length);
  });

  it('別のターン数で完成させても一致は保たれる', () => {
    for (const turnCount of [10, 30, 100]) {
      const input = makeInput({ record: record(turnCount) }, baseInventory(1000));
      const result = resolveRotorAssemblyCompletion(input);
      expect(result.ok, `turns=${turnCount}`).toBe(true);
      if (!result.ok) continue;
      expect(selectEquippedWindingRecord(result.inventory, result.loadout)).toHaveLength(result.config.coilTurns);
    }
  });
});
