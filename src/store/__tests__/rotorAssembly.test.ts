// P4-1A(承認項目9・11): 巻線完成の純関数。原子境界・失敗非破壊性・負例を固定する。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  resolveRotorAssemblyCompletion,
  resolveWindingTurnLimit,
  resolveWireBreakConsumption,
  type CompleteRotorAssemblyCommand,
  type ResolveRotorAssemblyCompletionInput,
  type RotorAssemblyMotorDraft,
} from '../rotorAssembly';
import type { EquipmentLoadout } from '../runOutcomeApplication';
import { selectEquippedWindingRecord } from '../equippedWinding';
import type { PlayerInventory } from '../../materials/inventoryItem';
import { computeConsumedWireM, computeMaxTurnsByStock } from '../../materials/assumedGeometry';
import { computeMaxTurns } from '../../engine/motorPhysics';
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
    // 30ターン中1ターン逆巻き、左21/右9 → 方向一貫性28/30、balance=12/30。
    // P4-1C C1: 全ターンtension=0.5なので張力占積は0.85+0.15×0.5=0.925。積が実効値になる。
    const fields = deriveWindingMotorFields(record(30, { leftCount: 21, reversedAt: 10 }));
    expect(fields.coilTurns).toBe(30);
    expect(fields.windingTurnsRatio).toBeCloseTo((28 / 30) * 0.925, 12);
    expect(fields.axisOffsetMm).toBeCloseTo((12 / 30) * 3, 12);
  });

  it('全ターン同方向・左右均等なら方向一貫性1・axisOffsetMm=0(実効値は張力占積のみ)', () => {
    const fields = deriveWindingMotorFields(record(30, { leftCount: 15 }));
    expect(fields.windingTurnsRatio).toBeCloseTo(1 * 0.925, 12);
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
    expect(result.config.windingTurnsRatio).toBeCloseTo((28 / 30) * 0.925, 12);
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
    expect(result.config.windingTurnsRatio).toBeCloseTo((28 / 30) * 0.925, 12);
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
    expect(result.config.windingTurnsRatio).toBeCloseTo((1 / 11) * 0.925, 12);
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

// ---------------------------------------------------------------------------
// P4-1C R3(2026-09-01人間再承認): 在庫上限の唯一の権威と、破断時の線材消費。
// ---------------------------------------------------------------------------
describe('P4-1C R3: resolveWindingTurnLimit / computeMaxTurnsByStock', () => {
  const LOT = { wireMaterialId: 'wire-copper-standard', windingWireGaugeMm: 0.4, windingParallelStrands: 1 as const };
  // **在庫は`computeConsumedWireM(n, strands)`で作る**。`1ターン分 × n`で作ると最終ULPの
  // 丸め差でNターン分に届かず、上限がN−1になる(実装側もこの差を吸収する補正を持つ)。
  const stockFor = (turns: number, strands: 1 | 2 = 1) => computeConsumedWireM(turns, strands);

  it('在庫ちょうどNターン分でNを返し、1e-9足りないとN−1になる(切り捨て、fail-closed)', () => {
    expect(computeMaxTurnsByStock(stockFor(40), 1)).toBe(40);
    expect(computeMaxTurnsByStock(stockFor(40) - 1e-9, 1)).toBe(39);
  });

  it('上限と消費関数が厳密に一致する(上限を満たすのに消費で足りない、が起きない)', () => {
    for (const strands of [1, 2] as const) {
      for (const n of [1, 2, 10, 29, 30, 33, 65, 149, 150]) {
        const stock = computeConsumedWireM(n, strands);
        expect(computeMaxTurnsByStock(stock, strands), `n=${n} strands=${strands}`).toBe(n);
        expect(computeConsumedWireM(computeMaxTurnsByStock(stock, strands), strands)).toBeLessThanOrEqual(stock);
      }
    }
  });

  it('在庫が0・負・非有限では0を返す(負の上限やNaNを下流へ流さない)', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(computeMaxTurnsByStock(bad, 1), `availableM=${String(bad)}`).toBe(0);
    }
  });

  it('並列2本では1本の半分のターン数しか巻けない(消費が2倍だから)', () => {
    expect(computeMaxTurnsByStock(stockFor(40), 2)).toBe(20);
  });

  it('物理上限・スキーマ上限・在庫上限の最小値を返す(3項それぞれが最小になる場合を個別に固定)', () => {
    // 在庫が最小になる場合
    expect(resolveWindingTurnLimit(baseInventory(stockFor(12)), LOT)).toBe(12);
    // スキーマ上限(150)が最小になる場合: 在庫も物理も十分
    const physicalMax = computeMaxTurns(LOT.windingWireGaugeMm, LOT.windingParallelStrands);
    expect(physicalMax).toBeGreaterThanOrEqual(MAX_WINDING_TURNS);
    expect(resolveWindingTurnLimit(baseInventory(stockFor(1000)), LOT)).toBe(MAX_WINDING_TURNS);
    // 物理上限が最小になる場合: 太い線ほど巻けるターン数が減る
    const thick = { ...LOT, windingWireGaugeMm: 0.8 };
    expect(resolveWindingTurnLimit(baseInventory(stockFor(1000)), thick)).toBe(computeMaxTurns(0.8, 1));
  });

  it('未所持の線材では上限0(在庫エントリ不在は残量0として扱う)', () => {
    expect(resolveWindingTurnLimit(baseInventory(100), { ...LOT, wireMaterialId: 'wire-silver' })).toBe(0);
  });

  it('**1ターン分の留保を入れない**(R3-D2): 在庫ちょうどNターン分なら上限はNで、N本目の破断消費Nも満たす', () => {
    const inv = baseInventory(stockFor(30));
    expect(resolveWindingTurnLimit(inv, LOT)).toBe(30);
    const r = resolveWireBreakConsumption({ command: { lot: LOT, brokenTurnCount: 30 }, inventory: inv });
    expect(r.ok).toBe(true);
  });
});

describe('P4-1C R3: resolveWireBreakConsumption', () => {
  const LOT = { wireMaterialId: 'wire-copper-standard', windingWireGaugeMm: 0.4, windingParallelStrands: 1 as const };
  const CMD = { lot: LOT, brokenTurnCount: 33 };

  it('破断ターンを含む本数分を消費し、線材在庫だけが減る', () => {
    const inv = baseInventory(100);
    const r = resolveWireBreakConsumption({ command: CMD, inventory: inv });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expected = computeConsumedWireM(33, 1);
    expect(r.consumedM).toBe(expected);
    const wire = r.inventory.stackableStock.find((e) => e.family === 'wire' && e.materialId === 'wire-copper-standard');
    expect(wire?.family === 'wire' ? wire.quantityM : null).toBe(100 - expected);
  });

  it('保持prefixがN−1なら消費はN(prefix長+1ターン分)である', () => {
    const prefixLength = 32;
    const r = resolveWireBreakConsumption({ command: { ...CMD, brokenTurnCount: prefixLength + 1 }, inventory: baseInventory(100) });
    expect(r.ok && r.consumedM).toBe(computeConsumedWireM(prefixLength + 1, 1));
  });

  it('並列2本の消費は1本の厳密に2倍', () => {
    const a = resolveWireBreakConsumption({ command: CMD, inventory: baseInventory(100) });
    const b = resolveWireBreakConsumption({ command: { ...CMD, lot: { ...LOT, windingParallelStrands: 2 } }, inventory: baseInventory(100) });
    expect(a.ok && b.ok && b.consumedM === a.consumedM * 2).toBe(true);
  });

  // 2026-09-02補足裁定(案B): 在庫上限は`resolveWindingTurnLimit`が含むため、在庫不足は
  // `invalidTurnCount`側で落ちる。`insufficientWire`は上限resolverと消費関数が将来ずれた場合の
  // fail-closed backstopとしてunionに残す(現契約では到達不能)。
  it('在庫が足りないターン数はinvalidTurnCountで落ち、在庫を一切変えない(0 clampも部分消費もしない)', () => {
    const inv = baseInventory(0.1);
    const snapshot = JSON.parse(JSON.stringify(inv));
    const r = resolveWireBreakConsumption({ command: CMD, inventory: inv });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('invalidTurnCount');
    if (r.failure.kind === 'invalidTurnCount') {
      expect(r.failure.count).toBe(33);
      expect(r.failure.limit).toBe(resolveWindingTurnLimit(inv, LOT));
      expect(r.failure.limit).toBeLessThan(33);
    }
    expect(inv).toEqual(snapshot);
  });

  // -------------------------------------------------------------------------
  // 定義域の負例(2026-09-02人間再承認)。**消費計算より前**に閉じる。
  // 回帰の対象は「負値で在庫が増える」「NaNが在庫へ書き込まれる」という実際に通っていた欠陥。
  // -------------------------------------------------------------------------
  it.each([-1, -100, 0, 1.5, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'brokenTurnCount=%p はinvalidTurnCountで拒否し、在庫を一切変えない',
    (count) => {
      const inv = baseInventory(100);
      const snapshot = JSON.parse(JSON.stringify(inv));
      const r = resolveWireBreakConsumption({ command: { lot: LOT, brokenTurnCount: count }, inventory: inv });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.failure.kind).toBe('invalidTurnCount');
      expect(inv).toEqual(snapshot);
    },
  );

  it('負値で在庫が増えない(消費が負になる経路が閉じていること)', () => {
    const inv = baseInventory(10);
    for (const count of [-1, -100]) {
      const r = resolveWireBreakConsumption({ command: { lot: LOT, brokenTurnCount: count }, inventory: inv });
      expect(r.ok, `count=${count}`).toBe(false);
      // 仮に成功していれば在庫が10を超える。okでないこと自体がその経路の不存在を示す。
    }
    const wire = inv.stackableStock.find((e) => e.family === 'wire')!;
    expect(wire.family === 'wire' ? wire.quantityM : null).toBe(10);
  });

  it('NaNが在庫へ書き込まれない(保存が壊れる経路が閉じていること)', () => {
    const inv = baseInventory(10);
    const r = resolveWireBreakConsumption({ command: { lot: LOT, brokenTurnCount: Number.NaN }, inventory: inv });
    expect(r.ok).toBe(false);
    const wire = inv.stackableStock.find((e) => e.family === 'wire')!;
    expect(Number.isFinite(wire.family === 'wire' ? wire.quantityM : Number.NaN)).toBe(true);
  });

  // Suu独立レビュー是正(A、2026-09-02): 承認式をド・モルガン展開すると、limitがNaNのとき
  // `count > limit`がfalseになって受理側へ抜ける。承認式のexact否定で書くことの回帰。
  it('limitがNaNになるlot(線径NaN)は、正しいターン数でもinvalidTurnCountで拒否する', () => {
    const nanLot = { ...LOT, windingWireGaugeMm: Number.NaN };
    const inv = baseInventory(100);
    const snapshot = JSON.parse(JSON.stringify(inv));
    expect(Number.isNaN(resolveWindingTurnLimit(inv, nanLot))).toBe(true);
    const r = resolveWireBreakConsumption({ command: { lot: nanLot, brokenTurnCount: 1 }, inventory: inv });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('invalidTurnCount');
    expect(inv).toEqual(snapshot);
  });

  it('スキーマ上限超過(151)は在庫が十分でもinvalidTurnCount', () => {
    const inv = baseInventory(1000);
    expect(resolveWindingTurnLimit(inv, LOT)).toBe(MAX_WINDING_TURNS);
    const r = resolveWireBreakConsumption({ command: { lot: LOT, brokenTurnCount: MAX_WINDING_TURNS + 1 }, inventory: inv });
    expect(r.ok === false && r.failure.kind).toBe('invalidTurnCount');
    if (!r.ok && r.failure.kind === 'invalidTurnCount') expect(r.failure.limit).toBe(MAX_WINDING_TURNS);
  });

  it('物理上限超過は在庫が十分でもinvalidTurnCount(太線ほど巻ける本数が減る)', () => {
    const thickLot = { ...LOT, windingWireGaugeMm: 0.8 };
    const inv = baseInventory(1000);
    const physicalLimit = resolveWindingTurnLimit(inv, thickLot);
    expect(physicalLimit).toBeLessThan(MAX_WINDING_TURNS);
    const r = resolveWireBreakConsumption({ command: { lot: thickLot, brokenTurnCount: physicalLimit + 1 }, inventory: inv });
    expect(r.ok === false && r.failure.kind).toBe('invalidTurnCount');
    if (!r.ok && r.failure.kind === 'invalidTurnCount') expect(r.failure.limit).toBe(physicalLimit);
  });

  it('正例の境界: count=1 と count=上限ちょうど は成功し、在庫が必ず減る', () => {
    const inv = baseInventory(100);
    const limit = resolveWindingTurnLimit(inv, LOT);
    for (const count of [1, limit]) {
      const r = resolveWireBreakConsumption({ command: { lot: LOT, brokenTurnCount: count }, inventory: inv });
      expect(r.ok, `count=${count}`).toBe(true);
      if (!r.ok) continue;
      expect(Number.isFinite(r.consumedM) && r.consumedM > 0, `count=${count}`).toBe(true);
      const wire = r.inventory.stackableStock.find((e) => e.family === 'wire')!;
      expect(wire.family === 'wire' ? wire.quantityM : Number.NaN).toBeLessThan(100);
    }
  });

  it('ok:trueなら常にconsumedMが有限かつ正で、在庫が減る(不変条件)', () => {
    const inv = baseInventory(100);
    for (const count of [1, 2, 10, 33, 65]) {
      const r = resolveWireBreakConsumption({ command: { lot: LOT, brokenTurnCount: count }, inventory: inv });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(Number.isFinite(r.consumedM)).toBe(true);
      expect(r.consumedM).toBeGreaterThan(0);
    }
  });

  it('未知素材はunknownWireMaterial。既知だが未所持(=残量0で上限0)のinvalidTurnCountと区別する', () => {
    const unknown = resolveWireBreakConsumption({ command: { ...CMD, lot: { ...LOT, wireMaterialId: 'wire-unobtanium' } }, inventory: baseInventory(100) });
    expect(unknown.ok === false && unknown.failure.kind).toBe('unknownWireMaterial');
    // 既知素材だが在庫エントリが無い → 上限0なので、どのターン数でもinvalidTurnCountになる
    const notStocked = resolveWireBreakConsumption({ command: { ...CMD, lot: { ...LOT, wireMaterialId: 'wire-silver' } }, inventory: baseInventory(100) });
    expect(notStocked.ok === false && notStocked.failure.kind).toBe('invalidTurnCount');
    if (!notStocked.ok && notStocked.failure.kind === 'invalidTurnCount') expect(notStocked.failure.limit).toBe(0);
  });

  it('破断はローターを生成せず、他の資産を遡及変更しない', () => {
    const inv = baseInventory(100);
    const r = resolveWireBreakConsumption({ command: CMD, inventory: inv });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inventory.rotorAssemblies).toEqual(inv.rotorAssemblies);
    expect(r.inventory.cashG).toBe(inv.cashG);
    expect(r.inventory.items).toEqual(inv.items);
    expect(r.inventory.bodyParts).toEqual(inv.bodyParts);
    expect(r.inventory.bearingAssemblies).toEqual(inv.bearingAssemblies);
    // 他素材の在庫(被膜)は不変
    expect(r.inventory.stackableStock.find((e) => e.family === 'coating')).toEqual(
      inv.stackableStock.find((e) => e.family === 'coating'),
    );
  });

  it('入力を変更しない(失敗・成功いずれでも引数のinventoryは不変)', () => {
    const inv = baseInventory(100);
    const snapshot = JSON.parse(JSON.stringify(inv));
    resolveWireBreakConsumption({ command: CMD, inventory: inv });
    resolveWireBreakConsumption({ command: { ...CMD, brokenTurnCount: 100000 }, inventory: inv });
    expect(inv).toEqual(snapshot);
  });
});
