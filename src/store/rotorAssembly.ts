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
import { computeConsumedWireM, computeMaxTurnsByStock } from '../materials/assumedGeometry';
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

// ---------------------------------------------------------------------------
// P4-1C R3(2026-09-01人間再承認、R3-D3/D6): 在庫上限の唯一の権威と、破断時の線材消費。
// ---------------------------------------------------------------------------

/**
 * 在庫上限の判定に要る固定加工値。`WindingLot`(UI層)はこの形へ**構造的に代入可能**なので、
 * store層がcomponents層をimportせずに済む。**在庫量はここに持たせない**(R3-D3)——
 * lotへ在庫を焼き込むと、在庫が変わったのにlotが古い値を持ち続ける状態が構築できる。
 */
export interface WindingTurnLimitLot {
  readonly wireMaterialId: string;
  readonly windingWireGaugeMm: number;
  readonly windingParallelStrands: 1 | 2;
}

/** 在庫から当該線材の残量[m]を読む。未所持・未知素材はいずれも0(呼出し側が理由を分ける)。 */
function readWireStockM(inventory: PlayerInventory, wireMaterialId: string): number {
  const entry = inventory.stackableStock.find((e) => e.family === 'wire' && e.materialId === wireMaterialId);
  return entry !== undefined && entry.family === 'wire' ? entry.quantityM : 0;
}

/**
 * この工程で巻ける上限ターン数。**在庫上限の唯一の権威**(R3-D3)。
 * 物理(`computeMaxTurns`)・記録スキーマ(`MAX_WINDING_TURNS`)・在庫(`computeMaxTurnsByStock`)の最小値。
 *
 * **1ターン分の留保を入れない**(R3-D2確定)。破断ターンが`N`なら保持prefixは`N−1`・消費は`N`で、
 * 在庫がちょうど`N`ターン分あれば`N`本目の試行で破断しても消費`N`を満たす。上限`N`到達後は
 * `N+1`本目を試行させないため、正常経路で「prefix=Nの後にN+1本目が破断」は構築されない。
 * 常時1ターン留保すると、破断しない通常の完成でも利用可能在庫より1ターン少なくなる。
 */
export function resolveWindingTurnLimit(inventory: PlayerInventory, lot: WindingTurnLimitLot): number {
  return Math.min(
    MAX_WINDING_TURNS,
    computeMaxTurns(lot.windingWireGaugeMm, lot.windingParallelStrands),
    computeMaxTurnsByStock(readWireStockM(inventory, lot.wireMaterialId), lot.windingParallelStrands),
  );
}

/**
 * UIが渡せるのは固定加工値(`lot`)と破断ターン数だけ(R3-D6、2026-09-02補足裁定で案B確定)。
 * 現在在庫はstoreが読む。
 *
 * **`lot`を平坦化せず入れ子で持つ**——`resolveWindingTurnLimit`が受ける`WindingTurnLimitLot`と
 * 同一実体をそのまま渡せるため、「上限判定に使ったlotと消費に使った素材が食い違う」状態が
 * 構造的に作れない。平坦化すると3fieldを個別に組み直せてしまい、その食い違いが構築可能になる。
 */
export interface ConsumeWireOnBreakCommand {
  readonly lot: WindingTurnLimitLot;
  /** 破断したターンの通し番号(1始まり)。保持prefix長 + 1 と一致する。 */
  readonly brokenTurnCount: number;
}

/**
 * 破断消費の失敗理由。**4 kindだけ**とし`CompleteRotorAssemblyFailure`を流用しない——
 * `duplicateAssemblyId`等は破断経路で構造的に起こり得ず、流用すると到達不能な分岐を
 * UI文言側にも増やす。
 */
export type ConsumeWireOnBreakFailure =
  | { readonly kind: 'unknownWireMaterial'; readonly materialId: string }
  /**
   * 破断ターン数が`1..resolveWindingTurnLimit`の整数でない。下限は常に1なので`limit`だけを返す。
   * 負値・0・非整数・NaN・Infinity・スキーマ上限超過・物理上限超過・在庫上限超過を**この1kindで表す**
   * (2026-09-02補足裁定・案B)。
   */
  | { readonly kind: 'invalidTurnCount'; readonly count: number; readonly limit: number }
  | { readonly kind: 'insufficientWire'; readonly requiredM: number; readonly availableM: number }
  | { readonly kind: 'persistFailed'; readonly detail: string };

export type ResolveWireBreakConsumptionResult =
  | { readonly ok: true; readonly inventory: PlayerInventory; readonly consumedM: number }
  | { readonly ok: false; readonly failure: ConsumeWireOnBreakFailure };

/**
 * 破断時の線材消費の解決(純関数)。**破断ターンを含む本数分**を消費する(R3-D5)。
 *
 * 線長は`computeConsumedWireM`が単一出典で、ここで式を書き直さない。
 * 在庫不足では**0 clampも部分消費もしない**——`insufficientWire`で拒否し在庫を一切変えない。
 * 正常経路では`resolveWindingTurnLimit`が`brokenTurnCount`を上限内に抑えるため到達しないが、
 * 改竄入力・古い表示・他タブ競合・破損saveに対するfail-closedとして残す(R3-D2)。
 */
export function resolveWireBreakConsumption(input: {
  readonly command: ConsumeWireOnBreakCommand;
  readonly inventory: PlayerInventory;
}): ResolveWireBreakConsumptionResult {
  const { command, inventory } = input;
  const { lot, brokenTurnCount } = command;
  if (!WIRE_MATERIAL_IDS.has(lot.wireMaterialId)) {
    return { ok: false, failure: { kind: 'unknownWireMaterial', materialId: lot.wireMaterialId } };
  }

  // **消費計算より前に定義域を閉じる**(2026-09-02補足裁定・案B)。`computeConsumedWireM`は
  // 線長規約の単一出典であって入力の定義域を守る責務を持たないため、生の`brokenTurnCount`を
  // そのまま渡すと負値で消費が負になり**在庫が増え**、NaNで**在庫がNaNになって保存が壊れる**。
  // 完成経路では`validateWindingRecord`済みの`record.length`しか渡らないので露出しなかった穴で、
  // UI由来の生値が初めて届く本経路で閉じる必要がある。
  // 整数性と上限を1つのゲートで見る——負値・0・非整数・NaN・Infinity・スキーマ上限超過・
  // 物理上限超過・在庫上限超過がすべてここで落ちる。
  const limit = resolveWindingTurnLimit(inventory, lot);
  // **承認式をそのまま否定する形で書く**。`!isInteger || count < 1 || count > limit`という
  // ド・モルガン展開は等価ではない——`limit`がNaN(例: `lot.windingWireGaugeMm`がNaNで
  // `computeMaxTurns`がNaNを返す)のとき`count > limit`はfalseになり、**受理側へ抜ける**。
  // 承認式`isInteger(count) && 1 <= count && count <= limit`は`count <= NaN`がfalseなので
  // 全体がfalseになり、否定して正しく拒否できる。比較のNaN伝播を跨ぐ書き換えをしない。
  if (!(Number.isInteger(brokenTurnCount) && brokenTurnCount >= 1 && brokenTurnCount <= limit)) {
    return { ok: false, failure: { kind: 'invalidTurnCount', count: brokenTurnCount, limit } };
  }

  const requiredM = computeConsumedWireM(brokenTurnCount, lot.windingParallelStrands);
  const availableM = readWireStockM(inventory, lot.wireMaterialId);
  // `resolveWindingTurnLimit`は在庫項(`computeMaxTurnsByStock`)を含むため、上のゲートを
  // 通った時点で`availableM >= requiredM`が保証される。**到達不能だが残す**——上限resolverと
  // 消費関数が将来ずれた場合に、在庫を負値へ落とす前に止まる最後の砦であり、
  // 不足メートル数という上のkindでは出せない情報も持つ。
  if (availableM < requiredM) {
    return { ok: false, failure: { kind: 'insufficientWire', requiredM, availableM } };
  }
  return {
    ok: true,
    consumedM: requiredM,
    // **線材在庫だけを動かす**。ローター個体・装備・config・採番・所持金・図鑑・ノートは
    // 触らない——破断はローターを生成しないため(R3凍結契約)。
    inventory: {
      ...inventory,
      stackableStock: inventory.stackableStock.map((entry) =>
        entry.family === 'wire' && entry.materialId === lot.wireMaterialId
          ? { ...entry, quantityM: entry.quantityM - requiredM }
          : entry,
      ),
    },
  };
}

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
  const availableM = readWireStockM(inventory, command.wireMaterialId);
  if (availableM < requiredM) {
    return { ok: false, failure: { kind: 'insufficientWire', requiredM, availableM } };
  }

  // P4-1C R3(R3-D3): 在庫上限は`resolveWindingTurnLimit`が唯一の権威。完成側もここで
  // 同じ純関数を通し、表示・破断消費と判断が割れないようにする。**上の在庫判定を
  // これに置き換えない**——`insufficientWire`は「あと何メートル足りないか」を返せるが、
  // 上限の再検証は本数しか言えず、失敗理由の情報量が落ちるため両方を通す。
  const turnLimit = resolveWindingTurnLimit(inventory, {
    wireMaterialId: command.wireMaterialId,
    windingWireGaugeMm: command.windingWireGaugeMm,
    windingParallelStrands: command.windingParallelStrands,
  });
  if (record.length > turnLimit) {
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
