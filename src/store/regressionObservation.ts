// P3-4 G6(UI計画§11.2、arbiter追加裁定+人間承認2026-08-20): 回帰差分(三段開示 段階2)の
// **純データ配管**。notebook recordから`RegressionObservation`を作り、同一`recipeKey`の
// 過去記録をbaseline候補として抽出するところまでを担う。
//
// **G6の範囲(候補A、承認済み)**: module-levelの純関数による観測変換・legacy除外・
// 同一recipeKey baseline抽出まで。`detectPerformanceRegression`の実呼出し・結果保持・表示は
// **G7へ繰越**——ここでは呼ばない。
//
// **recipeKeyは再計算しない**(§11.2): `computeRecipeKey`はbeginRun経路で1回だけ呼ばれ、
// その値が`RunSnapshot`→notebook recordへ一方向に複写される(§13.1 exact transport契約3)。
// ここでは永続化済みrecordの`recipeKey`を**そのまま読む**。
//
// **legacy recordの除外**: legacy record(P3-4以前の記録)は型の上で`recipeKey`を持たない
// (`?: never`)ため、**観測を組み立てる側では値を取り出せない**——ここが型による第一の防壁である。
// 加えて、永続層から読んだ値はStored union(legacy|current)として入ってくるため、
// 各observe関数は`recipeKey`の不在を実行時にも確認して`null`を返す。
// 「値が空文字だったら除外する」のような**値の中身**による判定はしない(不在と空文字を混同しない)。
import type { RegressionObservation } from '../materials/regressionDiff';
import type { StoredExperimentSession, StoredCourseRunNotebookRecord } from './notebookStore';
import type { StoredVehicleTestRunNotebookRecord } from './runOutcomeApplication';

/**
 * 腕ごとの観測指標(人間承認2026-08-20で確定):
 * - `session`(motor-only) = `steadyRpm`、**全件**を観測対象にする
 * - `courseRun` = `lapTimeS`(`elapsedTimeS`)、**`status === 'finished'`のみ**
 * - `vehicleTestRun` = `topSpeedMps`(samplesの`velocityMps`最大値)、
 *   **`status === 'finished'`かつsamplesが非空のみ**
 *
 * 完走していない走行を含めると「タイムが落ちた」ではなく「そもそも完走していない」データが
 * baselineへ混ざるため、course/test-runは完走に限定する。motor-onlyは走破距離の概念がなく
 * `steadyRpm`が常に意味を持つため全件を採る。
 */
export function observeSession(record: StoredExperimentSession): RegressionObservation | null {
  if (!('recipeKey' in record) || record.recipeKey === undefined) return null; // legacy
  if (!Number.isFinite(record.steadyRpm)) return null;
  return { recipeKey: record.recipeKey, metricKind: 'steadyRpm', value: record.steadyRpm };
}

export function observeCourseRun(record: StoredCourseRunNotebookRecord): RegressionObservation | null {
  if (!('recipeKey' in record) || record.recipeKey === undefined) return null; // legacy
  if (record.status !== 'finished') return null;
  if (!Number.isFinite(record.elapsedTimeS)) return null;
  return { recipeKey: record.recipeKey, metricKind: 'lapTimeS', value: record.elapsedTimeS };
}

export function observeVehicleTestRun(record: StoredVehicleTestRunNotebookRecord): RegressionObservation | null {
  if (!('recipeKey' in record) || record.recipeKey === undefined) return null; // legacy
  if (record.status !== 'finished') return null;
  if (record.samples.length === 0) return null;
  let topSpeedMps = -Infinity;
  for (const sample of record.samples) {
    if (Number.isFinite(sample.velocityMps) && sample.velocityMps > topSpeedMps) topSpeedMps = sample.velocityMps;
  }
  if (!Number.isFinite(topSpeedMps)) return null;
  return { recipeKey: record.recipeKey, metricKind: 'topSpeedMps', value: topSpeedMps };
}

/**
 * 過去記録から、`current`と同一`recipeKey`・同一`metricKind`のbaseline候補だけを抽出する。
 *
 * `detectPerformanceRegression`自身も同条件で絞り込むが、ここで先に絞るのは
 * **「baselineが何件あるか」を呼出し側が知れるようにする**ためである(G7の表示は
 * 「比較対象が無い」と「比較した結果差が無い」を区別する必要がある)。
 *
 * **当該run自身の除外は呼出し側の責務である(重要)**。本関数の`observation !== current`は
 * **参照同一性**による除外であり、**同じ値を持つ別実体は落ちない**。したがってG7で
 * 「保存済み記録を全件`observe*`で変換してから比較する」実装にすると、当該runの記録も
 * 変換対象に含まれ、**変換のたびに新しいオブジェクトが生成されるため除外されず**、
 * 自分自身がbaselineの中央値計算へ混入する——中央値がcurrent側へ引き寄せられ、
 * **本来検出すべき悪化を見逃す**方向に働く(窓幅が小さいほど影響が大きい)。
 * `detectPerformanceRegression`のJSDocが「当該runをpastObservationsへ含めないことは
 * 呼び出し側の責務」と明記しているのはこの点であり、engine側には「どれが当該runか」を
 * 識別する手段がない。
 *
 * **正しい使い方**: 呼出し側が**変換前にrecord id等で当該runの記録を除外**する。
 * 本関数の参照比較は二次的な保険と位置づける。
 *
 * 除外条件を値ベース(recipeKey+metricKind+valueの一致)にする案は採らない——
 * **たまたま同値だった正当な過去走行まで落とす**ため、かえって精度を損なう。
 */
export function collectBaselineObservations(
  current: RegressionObservation,
  pastObservations: readonly (RegressionObservation | null)[],
): readonly RegressionObservation[] {
  return pastObservations.filter((observation): observation is RegressionObservation => (
    observation !== null
    && observation !== current
    && observation.recipeKey === current.recipeKey
    && observation.metricKind === current.metricKind
  ));
}
