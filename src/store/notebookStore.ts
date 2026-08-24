import { create } from 'zustand';
import type { MotorConfig, SessionEventType } from '../engine/motorPhysics';
import type { DestructionState } from '../engine/destructionModes';
import type { HistorySample } from '../engine/scoring';
import type { CarConfig, EnergyBreakdown, VehicleSimState } from '../engine/vehiclePhysics';
import { NOTEBOOK_LIMIT, useSaveStore } from './saveStore';
import { validateNotebookExportFinalFields } from './notebookValidation';

export { NOTEBOOK_LIMIT };

export interface NotebookSample extends HistorySample {
  theta: number;
  batteryHeat: number;
  chattering: boolean;
  shorted: boolean;
  coilCollapsed: boolean;
}

export interface SessionEvent {
  type: SessionEventType;
  t: number;
}

export interface ExperimentSession {
  id: string;
  startedAt: string;
  endedAt: string;
  config: MotorConfig;
  seed: number;
  steadyRpm: number;
  averageCurrent: number;
  maxCurrent: number;
  currentRatio: number;
  rpmVariation: number;
  maxBatteryHeat: number;
  events: SessionEvent[];
  samples: NotebookSample[];
  // P3-4 G6(§16.1、人間再承認項目B): 走行**終了時点**のDestructionStateと、その走行の
  // recipeKey。いずれも必須——検死レポート・図鑑の三段開示(P3-2-Q9裁定)に必要である。
  // 値は§16.5の専用builderが`RunOutcome`から一方向に複写する(呼出し側が別の値を
  // 渡せるAPIは提供しない)。
  finalDestructionState: DestructionState;
  recipeKey: string;
}

/**
 * P3-4以前に永続化された過去の記録(§16.1、F2是正)。`?: never`により**両フィールドとも
 * 値を持てない**ことを型で強制する——`Omit`だけでは、構造的部分型により「片方だけ余剰で
 * 持つ」半状態がlegacy型として通ってしまう抜け穴が残る。
 */
export type LegacyExperimentSession = Omit<ExperimentSession, 'finalDestructionState' | 'recipeKey'> & {
  finalDestructionState?: never;
  recipeKey?: never;
};

/** 永続履歴の読取り側が受理する型(legacy/currentのunion)。書込み側はcurrentのみを受理する。 */
export type StoredExperimentSession = ExperimentSession | LegacyExperimentSession;

export interface CourseNotebookSample {
  t: number;
  positionM: number;
  velocityMps: number;
  rpm: number;
  currentA: number;
  batteryHeat: number;
  slipRatio: number;
  isSlipping: boolean;
}

export interface CourseRunNotebookRecord {
  id: string;
  savedAt: string;
  trackId: string;
  motorConfig: MotorConfig;
  carConfig: CarConfig;
  seed: number;
  status: VehicleSimState['status'];
  elapsedTimeS: number;
  positionM: number;
  energyUsedJ: number;
  energyBreakdown: EnergyBreakdown;
  samples: CourseNotebookSample[];
  // P3-4 G6(§16.1、項目B)。ExperimentSessionと同型。
  finalDestructionState: DestructionState;
  recipeKey: string;
}

export type LegacyCourseRunNotebookRecord = Omit<CourseRunNotebookRecord, 'finalDestructionState' | 'recipeKey'> & {
  finalDestructionState?: never;
  recipeKey?: never;
};

export type StoredCourseRunNotebookRecord = CourseRunNotebookRecord | LegacyCourseRunNotebookRecord;

/**
 * 既存のexport形式(version 1)。**P3-4以前の形式**であり、`finalDestructionState`/`recipeKey`を
 * 持たない。importでは引き続きこの形式を受理する(後方互換、§16.2 F4是正)。
 */
export interface NotebookExportV1 {
  version: 1;
  exportedAt: string;
  sessions: LegacyExperimentSession[];
  courseRuns?: CourseRunNotebookRecord[];
}

/**
 * P3-4のexport形式(version 2、人間再承認項目C、2026-08-15承認済み)。
 *
 * **なぜversionを上げるか(F4是正)**: 「同じversion 1の意味を後から拡張する」のではなく、
 * 「形式変更をversionで正直に示す」。importはversion 1とversion 2を**別々のvalidator**で
 * 受理し、新2フィールドの有無で自動判別する曖昧な設計を採らない。
 *
 * **なぜsessionsがunionか(G2是正)**: `NotebookSlice.sessions`にはP3-4以前のlegacy sessionが
 * 実在する。新規exportで「新2フィールド必須」を強制すると、legacyを含む既存ユーザーの履歴が
 * **まるごとexportできなくなる**。欠落フィールドを捏造して補完することも禁止であるため、
 * **exportは履歴を一切捨てず**union配列をそのまま格納する。各要素は§16.4の交差不変条件
 * (`hasFinal===hasRecipeKey`)により「両方あり」「両方なし」のいずれかのみが正当で、
 * 半状態は禁止のままである。
 */
export interface NotebookExportV2 {
  version: 2;
  exportedAt: string;
  sessions: StoredExperimentSession[];
}

/** import側が受理するexport形式の全体(version 1/2の2形式運用)。 */
export type NotebookExport = NotebookExportV1 | NotebookExportV2;

interface NotebookStore {
  // P3-4 G6-R1(2026-08-19人間承認、§16.2執行点の精密化): **読み取りはStored union**を受理する
  // ——永続履歴にはP3-4以前のlegacy record(2フィールドを持たない)が実在するため、
  // 読取り側でcurrent限定にすると過去の記録が読めなくなる。
  sessions: StoredExperimentSession[];
  courseRuns: StoredCourseRunNotebookRecord[];
  // 追補3(Suuレビュー2026-08-02T17:00): 書き込み結果を呼び出し元(ExperimentNotebook.tsx)へ
  // 伝える。以前はsaveStore.replaceSessionsRecordの戻り値(lease/pending拒否等)を
  // 握りつぶしており、UI側は常に成功したものとして扱っていた。
  // JSON import等の復元経路。legacy/current混在の履歴をそのまま復元できるようStored unionを受理する
  // (G6-R1の「import=StoredXxx union」、G2裁定の帰結)。
  replaceSessions: (sessions: StoredExperimentSession[]) => { ok: true } | { ok: false; reason: string };
  clear: () => void;
  /**
   * **V2 CourseMode画面の手動「A/B比較用に実験ノートへ保存」専用のlegacy書込み**
   * (P3-4 G6-R2、2026-08-19人間承認)。引数型が`LegacyCourseRunNotebookRecord`に固定されて
   * いるため、この口からcurrent形状を書くことは型として不能である——新規のproductionレコードは
   * §16.5のbuilderで生成され、envelope原子経路(`performApplyRunOutcome`)を通る
   * (`kind:'courseRun'`腕、arbiter追加裁定A)。
   *
   * **削除マイルストーンはV2 CourseModeのretro UIへの置換**(G6-R2 taxonomy訂正)。
   * G9で削除済みの`addSession`(旧経路)とは寿命が異なる点に注意すること。
   *
   * 呼出し箇所は`src/store/__tests__/legacySessionWriteAudit.test.ts`の構造監査が件数込みで
   * 固定している。
   */
  addCourseRun: (record: LegacyCourseRunNotebookRecord) => void;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function coefficientOfVariation(values: number[]): number {
  const average = mean(values);
  if (values.length < 2 || Math.abs(average) < 1e-9) return 0;
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance) / Math.abs(average);
}

function detectEvents(samples: NotebookSample[]): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const previous = samples[index - 1];
    if (current.shorted && !previous?.shorted) events.push({ type: 'shortCircuit', t: current.t });
    if (current.coilCollapsed && !previous?.coilCollapsed) events.push({ type: 'coilCollapse', t: current.t });
    if (current.batteryHeat >= 1 && (previous?.batteryHeat ?? 0) < 1) {
      events.push({ type: 'batteryOverheat', t: current.t });
    }
  }
  return events;
}

export function createExperimentSession(
  config: MotorConfig,
  seed: number,
  samples: NotebookSample[],
  startedAt = new Date(),
  endedAt = new Date(),
  // P3-4 G6(§16.5): 本factoryは`finalDestructionState`/`recipeKey`を**持たない**base recordを
  // 組み立てるところまでを担う。2フィールドの付与は`buildExperimentSession`(専用builder)が
  // `RunOutcome`から一方向複写して行う——同じ事実を複数経路から入力できる状態を作らない
  // (P3-1-Q9)。したがって戻り値型はLegacyExperimentSession(=2フィールド不在を型で明示)。
): LegacyExperimentSession {
  const currents = samples.map((sample) => sample.current);
  const rpms = samples.map((sample) => Math.abs(sample.rpm));
  const steadySamples = samples.slice(Math.floor(samples.length * 0.75));
  const steadyRpm = mean(steadySamples.map((sample) => Math.abs(sample.rpm)));
  const averageCurrent = mean(currents);
  const maxCurrent = Math.max(0, ...currents);
  const initialCurrent = mean(currents.slice(0, Math.min(10, currents.length)));

  return {
    id: `${startedAt.getTime()}-${seed.toString(16)}`,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    config: { ...config },
    seed,
    steadyRpm,
    averageCurrent,
    maxCurrent,
    currentRatio: initialCurrent > 0 ? averageCurrent / initialCurrent : 0,
    rpmVariation: coefficientOfVariation(rpms),
    maxBatteryHeat: Math.max(0, ...samples.map((sample) => sample.batteryHeat)),
    events: detectEvents(samples),
    samples: samples.map((sample) => ({ ...sample })),
  };
}

function isSession(value: unknown): value is ExperimentSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<ExperimentSession>;
  return typeof session.id === 'string'
    && typeof session.startedAt === 'string'
    && typeof session.seed === 'number'
    && Array.isArray(session.samples)
    && !!session.config;
}

/**
 * 実験ノートJSONのimport(§16.2(1)、人間再承認項目C)。version 1(legacyのみ)と
 * version 2(legacy/current混在union)を**別々に**受理する。要素の2フィールド契約は
 * `validateNotebookExportFinalFields`(notebookValidation.ts、共通validator)が検証し、
 * 基本形状は既存の`isSession`が検証する——責務を重複させない。
 *
 * **legacy/current混在のversion 2は混在のまま復元する**(履歴を捨てない、捏造補完もしない)。
 */
export function parseNotebookJson(json: string): StoredExperimentSession[] {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') throw new Error('JSONの形式が正しくありません。');
  const notebook = parsed as { version?: unknown; sessions?: unknown };
  if (!Array.isArray(notebook.sessions) || !notebook.sessions.every(isSession)) {
    if (notebook.version !== 1 && notebook.version !== 2) throw new Error('対応していない実験ノートのバージョンです。');
    throw new Error('セッションデータが正しくありません。');
  }
  const result = validateNotebookExportFinalFields(notebook.version, notebook.sessions);
  if (!result.ok) {
    if (notebook.version !== 1 && notebook.version !== 2) throw new Error('対応していない実験ノートのバージョンです。');
    throw new Error(`セッションデータが正しくありません。(${result.reason})`);
  }
  return result.sessions.slice(0, NOTEBOOK_LIMIT);
}

/**
 * 実験ノートJSONのexport。**新規exportは常にversion 2**で、`NotebookSlice.sessions`の
 * union配列をそのまま格納する——legacy要素をcurrent形式へ強制変換しない(架空の
 * finalDestructionState/recipeKeyを補完しない、G2是正)。
 */
export function stringifyNotebook(sessions: StoredExperimentSession[]): string {
  const value: NotebookExportV2 = { version: 2, exportedAt: new Date().toISOString(), sessions };
  return JSON.stringify(value, null, 2);
}

// P3-0サブステップ3(docs/phase3-p3-0-plan.md v7 8.3節): 永続化はsaveStore.ts(v16:save)
// へ移管した。本storeはsaveStore.notebookスライスへの薄い反応的ビュー+action委譲のみを
// 担う(単一の正はsaveStore側)。上限到達時の確認バナー(pendingSession/confirmEviction/
// cancelEviction)は正式Fable Q3裁定により撤去し、3腕とも自動trimへ統一する
// (src/components/ExperimentNotebook.tsx側のUIも同時に撤去済み)。
export const useNotebookStore = create<NotebookStore>()(() => ({
  sessions: useSaveStore.getState().notebook.sessions,
  courseRuns: useSaveStore.getState().notebook.courseRuns,
  replaceSessions: (sessions) => useSaveStore.getState().replaceSessionsRecord(sessions),
  clear: () => {
    useSaveStore.getState().clearNotebook();
  },
  addCourseRun: (record) => {
    useSaveStore.getState().addCourseRunRecord(record);
  },
}));

useSaveStore.subscribe((state) => {
  useNotebookStore.setState({ sessions: state.notebook.sessions, courseRuns: state.notebook.courseRuns });
});
