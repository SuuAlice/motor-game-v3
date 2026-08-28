// Phase 4 P4-1A(2026-08-28人間承認、承認項目8・9): 巻線完成 → ローター個体生成の**純関数**。
//
// **公開store actionとの責務分離**: 本ファイルの関数は`inventory`/`loadout`/`assemblyId`を
// 引数で受け取るが、**UIからは呼ばせない**(構造テストで固定する)。UIが呼ぶのは
// `useSaveStore`の公開actionだけで、そちらが`get()`から在庫・装備・ID採番を読み、
// 採番した`assemblyId`を本関数へ注入する。UIがstore内部状態やIDを供給できる形にすると、
// 「UIが渡した在庫」で消費計算が行われる余地ができ、原子境界が弱くなる。
//
// **失敗時の非破壊性**: 本関数は引数を一切変更しない。`ok:false`のとき呼出し側は
// 状態を更新しない——入力記録・在庫・装備・カウンタはそのまま残り、再試行できる。

import { computeMaxTurns, isValidWindingTurnsRatio, type MotorConfig } from '../engine/motorPhysics';
import { deriveWindingMotorFields } from '../materials/windingMapping';
import type { PlayerInventory, RotorAssemblyState } from '../materials/inventoryItem';
import { computeConsumedWireM } from '../materials/assumedGeometry';
import {
  validateWindingRecord,
  resolveWindingRunnability,
  MAX_WINDING_TURNS,
  MIN_RUNNABLE_WINDING_TURNS,
  type WindingRecord,
} from '../materials/windingRecord';
import { WIRE_MATERIALS } from '../materials/materials';
import type { EquipmentLoadout } from './runOutcomeApplication';

type WireMaterialId = (typeof WIRE_MATERIALS)[number]['id'];

const WIRE_MATERIAL_IDS: ReadonlySet<string> = new Set(WIRE_MATERIALS.map((m) => m.id));

/**
 * UIが渡せるmotor draft(承認項目8)。**巻線記録と固定加工値から導出されるフィールドを
 * 型から除外する**——UIが派生値を供給できると、記録と`MotorConfig`が食い違ったまま
 * 保存される余地ができる。除外した5+1フィールドはstoreが`deriveWindingMotorFields`と
 * 固定加工値から組み立てる。
 *
 * `effectiveTurnsRatio`も除外する: base configでは常に`undefined | 1`であり
 * (P3-3-Q12/Q14・P-Q10-A5)、UIが与える値ではない。
 */
export type RotorAssemblyMotorDraft = Omit<
  MotorConfig,
  'coilTurns' | 'effectiveTurnsRatio' | 'windingTurnsRatio' | 'axisOffsetMm' | 'wireGaugeMm' | 'parallelStrands'
>;

/**
 * UIが渡せる**意思入力**だけ。在庫・装備・ID・制約正典は含まない(承認項目8)。
 * 線径と並列本数は「巻き始めに固定した加工値」であり、記録済みturnの意味を
 * 途中で変えられないようにするため、完成時にもそのまま持ち回る。
 */
export interface CompleteRotorAssemblyCommand {
  readonly record: WindingRecord;
  readonly wireMaterialId: string;
  readonly windingWireGaugeMm: number;
  readonly windingParallelStrands: 1 | 2;
  /** 巻線由来フィールドを除いたmotor draft。派生値は含められない(型で排除)。 */
  readonly motorDraft: RotorAssemblyMotorDraft;
}

/**
 * 失敗理由の判別union。**単一の`reason: string`にしない**——UIが理由ごとに文言を出すのに
 * 文字列の正規表現判定を強いることになるため(P3-3-Q15-4の判別union化と同じ規律)。
 *
 * `persistFailed`は**action層でのみ発生**し、本ファイルの純関数からは決して返らない
 * (永続化は純関数の責務ではない)。
 */
export type CompleteRotorAssemblyFailure =
  | { readonly kind: 'invalidRecord'; readonly detail: string }
  | { readonly kind: 'turnCountOutOfRange'; readonly count: number; readonly min: number; readonly max: number }
  | { readonly kind: 'physicalMaxTurnsExceeded'; readonly count: number; readonly limit: number }
  | { readonly kind: 'insufficientWire'; readonly requiredM: number; readonly availableM: number }
  | { readonly kind: 'unknownWireMaterial'; readonly materialId: string }
  | { readonly kind: 'duplicateAssemblyId'; readonly assemblyId: string }
  | { readonly kind: 'persistFailed'; readonly detail: string };

export interface ResolveRotorAssemblyCompletionInput {
  readonly command: CompleteRotorAssemblyCommand;
  readonly inventory: PlayerInventory;
  readonly loadout: EquipmentLoadout;
  /** storeが採番した値。UIからは供給させない。 */
  readonly assemblyId: string;
}

export type ResolveRotorAssemblyCompletionResult =
  | {
      readonly ok: true;
      readonly inventory: PlayerInventory;
      readonly loadout: EquipmentLoadout;
      readonly rotorAssembly: RotorAssemblyState;
      /**
       * 巻線記録と固定加工値から導出した`MotorConfig`。**UIが渡した派生値は使わない**
       * (`motorDraft`の型から除外済み)。actionはこれを`progress.config`へ入れて、
       * 在庫・ローター・装備・カウンタと同じ1回の書込みで永続化する。
       */
      readonly config: MotorConfig;
    }
  | { readonly ok: false; readonly failure: CompleteRotorAssemblyFailure };

/**
 * 巻線完成の解決(純関数)。線材在庫の消費・ローター個体の生成・装備の差し替えを
 * **1つのResultとして**返す。途中保存・二段commitはしない。
 *
 * 判定順は「記録の妥当性 → ターン数 → 物理上限 → 素材 → 在庫 → ID重複」。
 * 記録が壊れている場合に在庫不足を理由として返さないよう、より根本的な失敗から先に見る。
 */
export function resolveRotorAssemblyCompletion(
  input: ResolveRotorAssemblyCompletionInput,
): ResolveRotorAssemblyCompletionResult {
  const { command, inventory, loadout, assemblyId } = input;

  const validated = validateWindingRecord(command.record);
  if (!validated.ok) return { ok: false, failure: { kind: 'invalidRecord', detail: validated.reason } };
  const record = validated.value;

  const runnability = resolveWindingRunnability(record);
  if (!runnability.runnable) {
    return {
      ok: false,
      failure: { kind: 'turnCountOutOfRange', count: record.length, min: MIN_RUNNABLE_WINDING_TURNS, max: MAX_WINDING_TURNS },
    };
  }

  // 巻きスペースの物理制約(既存`computeMaxTurns`)。**clampしない**——巻いた本数と
  // 記録の本数が食い違ったまま完成させないため、拒否して理由を返す。
  const physicalMax = computeMaxTurns(command.windingWireGaugeMm, command.windingParallelStrands);
  if (record.length > physicalMax) {
    return { ok: false, failure: { kind: 'physicalMaxTurnsExceeded', count: record.length, limit: physicalMax } };
  }

  // 派生5フィールドはここでのみ構築する。`motorDraft`は型の上でこれらを持てないため、
  // スプレッド順による「UI値が後勝ちする」事故が構造的に起きない。
  const derived = deriveWindingMotorFields(record);

  // 順巻きと逆巻きが同数の記録は`windingTurnsRatio = 0`になる(磁気的に完全に打ち消し合う)。
  // 0はbase契約`(0,1]`の外であり、**個体を作る前にここで拒否する**——
  // 通すと、構造としては妥当な記録が保存境界のvalidatorで`persistFailed`として弾かれ、
  // 「なぜ保存できないのか」がプレイヤーにも呼出し側にも分からない失敗になる。
  // [0,1]へ広げたり0を正数へclampしたりはしない(打ち消し切った巻線は実際に回らない)。
  if (!isValidWindingTurnsRatio(derived.windingTurnsRatio)) {
    return {
      ok: false,
      failure: {
        kind: 'invalidRecord',
        detail: `巻線由来の実効巻数比が(0, 1]の範囲外です: ${derived.windingTurnsRatio}(順巻きと逆巻きが打ち消し合っています)`,
      },
    };
  }

  if (!WIRE_MATERIAL_IDS.has(command.wireMaterialId)) {
    return { ok: false, failure: { kind: 'unknownWireMaterial', materialId: command.wireMaterialId } };
  }

  const requiredM = computeConsumedWireM(record.length, command.windingParallelStrands);
  const stockEntry = inventory.stackableStock.find(
    (entry) => entry.family === 'wire' && entry.materialId === command.wireMaterialId,
  );
  const availableM = stockEntry !== undefined && stockEntry.family === 'wire' ? stockEntry.quantityM : 0;
  if (availableM < requiredM) {
    return { ok: false, failure: { kind: 'insufficientWire', requiredM, availableM } };
  }

  if (inventory.rotorAssemblies.some((r) => r.assemblyId === assemblyId)) {
    return { ok: false, failure: { kind: 'duplicateAssemblyId', assemblyId } };
  }

  const rotorAssembly: RotorAssemblyState = {
    assemblyId,
    sourceWireMaterialId: command.wireMaterialId as WireMaterialId,
    consumedWireM: requiredM,
    collapsed: false,
    burnedOut: false,
    winding: {
      kind: 'recorded',
      record,
      wireGaugeMm: command.windingWireGaugeMm,
      parallelStrands: command.windingParallelStrands,
    },
    // P4-1Aでは工程由来の被膜損傷を適用しない(増分の算出はP4-1C/Fの別delta)。
    coatingDamageFraction: 0,
  };

  const config: MotorConfig = {
    ...command.motorDraft,
    coilTurns: derived.coilTurns,
    windingTurnsRatio: derived.windingTurnsRatio,
    axisOffsetMm: derived.axisOffsetMm,
    wireGaugeMm: command.windingWireGaugeMm,
    parallelStrands: command.windingParallelStrands,
  };

  return {
    ok: true,
    config,
    inventory: {
      ...inventory,
      stackableStock: inventory.stackableStock.map((entry) =>
        entry.family === 'wire' && entry.materialId === command.wireMaterialId
          ? { ...entry, quantityM: entry.quantityM - requiredM }
          : entry,
      ),
      rotorAssemblies: [...inventory.rotorAssemblies, rotorAssembly],
    },
    loadout: { ...loadout, rotorAssemblyId: assemblyId },
    rotorAssembly,
  };
}
