// P3-4 G7(UI計画§11.2、人間承認2026-08-20): 回帰差分(三段開示 段階2)の**実呼出し層**。
// G6の純データ配管(`regressionObservation.ts`)の上に載り、`detectPerformanceRegression`を
// 実際に呼んで結果を返すところまでを担う。
//
// **当該run自身をbaselineへ混ぜない**(G6申し送り): `collectBaselineObservations`の除外は
// 参照同一性であり、値が等しい別実体は落ちない。ここでは**変換前にrecord idで当該runを
// 除外**する——保存済み記録を全件変換してから比較すると、当該runの記録も変換対象に含まれ、
// 変換のたびに新しいオブジェクトが生成されるため除外されず、自分自身が中央値計算へ混入して
// **本来検出すべき悪化を見逃す**。
import { detectPerformanceRegression, type RegressionComparisonResult } from '../materials/regressionDiff';
import { collectBaselineObservations, observeSession, observeCourseRun, observeVehicleTestRun } from './regressionObservation';
import type { StoredExperimentSession, StoredCourseRunNotebookRecord } from './notebookStore';
import type { StoredVehicleTestRunNotebookRecord } from './runOutcomeApplication';

/** 3腕いずれかの永続記録。idで当該runを特定するため、腕をまたいで扱う。 */
export type NotebookRecordForRegression =
  | { kind: 'session'; record: StoredExperimentSession }
  | { kind: 'courseRun'; record: StoredCourseRunNotebookRecord }
  | { kind: 'vehicleTestRun'; record: StoredVehicleTestRunNotebookRecord };

function observe(entry: NotebookRecordForRegression) {
  switch (entry.kind) {
    case 'session': return observeSession(entry.record);
    case 'courseRun': return observeCourseRun(entry.record);
    case 'vehicleTestRun': return observeVehicleTestRun(entry.record);
  }
}

/**
 * 直近走行の記録(`current`)を、同一レシピの過去記録と比較する。
 *
 * `pastRecords`には当該runの記録が**含まれていてよい**——本関数が`current.record.id`で
 * 除外するためである(呼出し側が「保存済み全件」をそのまま渡せる形にしてある。
 * 除外を呼出し側の注意深さに委ねると、G6申し送りの落とし穴を毎回踏みうる)。
 *
 * 戻り値`null`は「比較できなかった」であり「差が無い」ではない——currentが観測対象外
 * (未完走等)か、同一レシピのbaselineが1件も無い場合。呼出し側はこれを
 * 「悪化なし」と表示してはならない。
 */
export function computeRegressionReport(
  current: NotebookRecordForRegression,
  pastRecords: readonly NotebookRecordForRegression[],
): RegressionComparisonResult | null {
  const currentObservation = observe(current);
  if (currentObservation === null) return null;

  // **変換前に**record idで当該runを除外する(G6申し送り)。
  const pastObservations = pastRecords
    .filter((entry) => entry.record.id !== current.record.id)
    .map(observe);
  const baseline = collectBaselineObservations(currentObservation, pastObservations);
  if (baseline.length === 0) return null;

  return detectPerformanceRegression(currentObservation, baseline);
}
