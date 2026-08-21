// P3-4 G6(docs/phase3-p3-4-plan.md §16.4、F2・G1・G3是正): notebook 3腕(ExperimentSession /
// CourseRunNotebookRecord / VehicleTestRunNotebookRecord)が持つ`finalDestructionState`と
// `recipeKey`の**交差不変条件**を1箇所に定義する共通validator(alice所有、純関数)。
//
// この2フィールドは同時にP3-4で追加されたため、正当な状態は次の2つだけである:
//  - **current**: 両方が存在する(P3-4以降に書かれた記録)
//  - **legacy**: 両方が存在しない(P3-4以前に永続化された過去の記録)
// 「片方だけ存在する」半状態は、どちらの経路から来ても壊れたデータであり明示的に拒否する
// (F2是正の核心。存在有無の判定を各経路が独自に書くと、この禁止が経路ごとにずれる)。
//
// **呼出し側との契約分離(G1是正)**: 本関数は`legacy`/`current`の**判別結果を返すところまで**を
// 担い、「legacyを受理してよいか」は呼出し側の文脈ごとの契約とする——永続履歴の読取りは
// 両方を受理してよいが、`PendingNotebookRecord`(走行直後の一時データ、常にP3-4以降の
// コードパスで生成される)は`current`のみを受理すべきである。

import { validateDestructionStateShape } from '../engine/destructionOrchestration';
import type { DestructionState } from '../engine/destructionModes';
import type { LegacyExperimentSession, StoredExperimentSession } from './notebookStore';

export type NotebookFinalFieldsValidationResult =
  | { ok: true; kind: 'legacy' }
  | { ok: true; kind: 'current'; finalDestructionState: DestructionState; recipeKey: string }
  | { ok: false; reason: string };

/**
 * recipeKeyのenvelope外形(G3是正)。`computeRecipeKey`は常に`v{n}|...`形式を返すが、
 * raw validatorとしては「到達しないはず」に頼らず明示的に検証する。
 * **`|`以降のopaque payloadは再parseしない**——recipeKeyの構成方法を知るのは
 * `computeRecipeKey`だけ、という契約を守り、外形のみを見る。
 */
const RECIPE_KEY_ENVELOPE_PATTERN = /^v[1-9][0-9]*\|/;

/**
 * `finalDestructionState`/`recipeKey`の存在一致と、存在する場合の中身を検証する。
 *
 * 判定は**プロパティの存在**(`in`)で行い、値が`undefined`であっても「存在する」と扱う——
 * `{finalDestructionState: undefined}`のようなオブジェクトはlegacyではなく、
 * 形状不正(current側のdeep検証で落ちる)として扱う。JSON往復では`undefined`値のキー自体が
 * 消えるため、永続化データがこの形になることはない。
 */
export function validateNotebookFinalFields(raw: Record<string, unknown>): NotebookFinalFieldsValidationResult {
  const hasFinal = 'finalDestructionState' in raw;
  const hasRecipeKey = 'recipeKey' in raw;
  if (hasFinal !== hasRecipeKey) {
    return { ok: false, reason: `finalDestructionStateとrecipeKeyの存在が一致しません(hasFinal=${hasFinal}, hasRecipeKey=${hasRecipeKey})` };
  }
  if (!hasFinal) {
    return { ok: true, kind: 'legacy' };
  }
  if (!validateDestructionStateShape(raw.finalDestructionState)) {
    return { ok: false, reason: 'finalDestructionStateの形状が不正です' };
  }
  if (typeof raw.recipeKey !== 'string' || raw.recipeKey.length === 0) {
    return { ok: false, reason: 'recipeKeyが文字列でないか空文字列です' };
  }
  if (!RECIPE_KEY_ENVELOPE_PATTERN.test(raw.recipeKey)) {
    return { ok: false, reason: 'recipeKeyがenvelope形式(v{n}|...)ではありません' };
  }
  return { ok: true, kind: 'current', finalDestructionState: raw.finalDestructionState, recipeKey: raw.recipeKey };
}

/**
 * 永続履歴(notebook履歴・save restore・JSON v2 import)向けの受理判定。legacy/currentの
 * **両方**を受理する——過去の記録を読めなくしないため。
 */
export function acceptsStoredNotebookFinalFields(raw: Record<string, unknown>): boolean {
  return validateNotebookFinalFields(raw).ok;
}

/**
 * `PendingNotebookRecord`向けの受理判定(G1是正)。**`current`のみ**を受理する——
 * pendingは常にP3-4以降のコードパスで生成されるため、legacyな中間状態は本来存在しえない。
 * その期待をvalidatorレベルでも強制し、静かに欠落したまま適用へ進むことを防ぐ。
 */
export function acceptsPendingNotebookFinalFields(raw: Record<string, unknown>): boolean {
  const result = validateNotebookFinalFields(raw);
  return result.ok && result.kind === 'current';
}

// ---------------------------------------------------------------------------
// 実験ノートJSON export/importのvalidator(§16.2(1) F4・G2是正、人間再承認項目C)
//
// version 1(P3-4以前、legacyのみ)とversion 2(P3-4以降、legacy/current混在union)を
// **別々のvalidator**で受理する——新2フィールドの有無で自動判別する曖昧な設計は採らない。
// 各要素の`finalDestructionState`/`recipeKey`は`validateNotebookFinalFields`が持つ
// 交差不変条件を再利用して検証し、半状態はどちらのversionでも拒否する。
// ---------------------------------------------------------------------------

export type NotebookExportValidationResult =
  | { ok: true; version: 1; sessions: readonly LegacyExperimentSession[] }
  | { ok: true; version: 2; sessions: readonly StoredExperimentSession[] }
  | { ok: false; reason: string };

/**
 * export payloadの外形+各session要素の2フィールド契約を検証する。
 *
 * - **version 1**: 全要素がlegacy(2フィールドとも不在)でなければならない。current要素が
 *   混じったversion 1は、形式とversion宣言が食い違っているため拒否する。
 * - **version 2**: legacy/currentの混在を許容する(履歴を捨てないため)。半状態は拒否。
 *
 * session要素の**基本形状**(id/startedAt/seed/samples/config)の検証は呼出し側が持つ
 * 既存の`isSession`が担い、本関数は2フィールド契約に専念する(責務を重複させない)。
 */
export function validateNotebookExportFinalFields(
  version: unknown,
  sessions: readonly unknown[],
): NotebookExportValidationResult {
  if (version !== 1 && version !== 2) {
    return { ok: false, reason: `対応していない実験ノートのバージョンです: ${String(version)}` };
  }
  const validated: Record<string, unknown>[] = [];
  for (const [index, raw] of sessions.entries()) {
    if (typeof raw !== 'object' || raw === null) {
      return { ok: false, reason: `sessions[${index}]がオブジェクトではありません` };
    }
    const result = validateNotebookFinalFields(raw as Record<string, unknown>);
    if (!result.ok) return { ok: false, reason: `sessions[${index}]: ${result.reason}` };
    if (version === 1 && result.kind === 'current') {
      // version 1はP3-4以前の形式である、という宣言と中身が矛盾している。
      return { ok: false, reason: `sessions[${index}]: version 1にcurrent形式のsessionが含まれています` };
    }
    validated.push(raw as Record<string, unknown>);
  }
  return version === 1
    ? { ok: true, version: 1, sessions: validated as unknown as readonly LegacyExperimentSession[] }
    : { ok: true, version: 2, sessions: validated as unknown as readonly StoredExperimentSession[] };
}
