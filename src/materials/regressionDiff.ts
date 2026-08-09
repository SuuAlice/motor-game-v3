// P3-2ゲート8(docs/phase3-p3-2-plan.md v17 §4.5、正式Fable Q7裁定)。三段開示段階2
// (症状の自動差分検知)の骨格。段階1(HUD、engine/destructionModes.tsのD07Progress等)・
// 段階3(ガウスメーター、P3-4以降)とは別ファイルで、ここは「最近何かが変わった」の統計的
// 検知のみを担う純関数群である。store層のExperimentSession/CourseRunNotebookRecord等の
// 実際の記録型には一切依存しない(層逆転回避、src/materials/はsrc/store/をimportしない)。
// 呼び出し側(store層、P3-4で確定)が該当フィールドをこの最小構造へ変換してから渡す。
// 実行タイミング・永続化・UI表示はP3-4でstore層・UI層が確定する(v12 §5.3のA2裁定)。

export type RegressionMetricKind = 'lapTimeS' | 'topSpeedMps' | 'steadyRpm';
export type RegressionDegradationDirection = 'higherIsWorse' | 'lowerIsWorse';

// lap timeは増加が悪化、top speed/steady RPMは減少が悪化であるため、単一のmetric値だけでは
// 3%判定の方向を正しく扱えない。RegressionObservation自体にはdegradationDirectionフィールドを
// 持たせず(存在しないフィールドは食い違えない)、metricKindから都度導出する(正式Fable Q7裁定、
// 案(a))。
export function directionForMetricKind(kind: RegressionMetricKind): RegressionDegradationDirection {
  switch (kind) {
    case 'lapTimeS':
      return 'higherIsWorse';
    case 'topSpeedMps':
    case 'steadyRpm':
      return 'lowerIsWorse';
  }
}

export interface RegressionObservation {
  recipeKey: string; // 同一レシピ照合キー。キーの構成方法はP3-4実装時に確定する(スコープ外)
  metricKind: RegressionMetricKind;
  value: number;
}

export interface RegressionComparisonResult {
  hasAnomaly: boolean;
  currentValue: number;
  baselineValue: number;
  percentChange: number; // directionForMetricKindに応じ悪化方向を正の値として正規化する
}

// 3%はv12 §5.3で既に確定した契約値であり将来較正対象ではない。
const REGRESSION_ANOMALY_THRESHOLD = 0.03;
// baselineウィンドウ幅は契約定数であり較正値ではない(正式Fable Q7裁定)。
const REGRESSION_BASELINE_WINDOW = 5;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * baseline方式(正式Fable Q7裁定、確定): 同一recipeKeyの直近5回(当該run除く)の中央値とする。
 * 根拠: この機構の目的は「最近何かが変わった」の検知であり、恒久劣化はイベント駆動の段差
 * (D07到達・D04延焼)であって漸進ドリフトではない——段差検知には直近窓の中央値が最適で、
 * 外れ値1回に頑健。最良値基準は通常分散を恒久劣化と誤認する偽陽性製造機になるため不採用。
 *
 * pastObservationsはrecipeKey・metricKind両方が一致するものだけをbaselineプールへ含める
 * (計画本文はrecipeKeyの除外のみ明記するが、metricKindが異なる観測〈例: lapTimeSとsteadyRpm〉を
 * 混在させて中央値を取ることは単位が異なり無意味なため、同一指標内でのみ比較する設計とした)。
 * pastObservationsは記録順(古い→新しい)で渡すこと——直近5件はフィルタ後配列の末尾5件を指す。
 * 当該run自身(current)をpastObservationsへ含めないことは呼び出し側の責務とする(本関数には
 * 「どれが当該runか」を識別する手段がない)。
 *
 * 過去観測1件以上で判定可(1件なら実質直前値比較)、0件でnullを返す。currentValue・baseline
 * (中央値)のいずれかが非有限、またはbaselineが0(除算でNaN/Infinityを生む)の場合もnullを返す。
 *
 * 非有限値の扱い(Suu_mot3ゲート8レビューR1是正): 「非有限入力はnullを返す」契約は無言修復
 * (不正値だけを黙って除外して計算を続けること)を許さない——比較候補(同一recipeKey・同一
 * metricKindの観測)にNaN/Infinityが1件でも含まれていれば関数全体でnullを返す。比較候補に
 * 該当しない観測(異なるrecipeKey/metricKind)の非有限値はbaseline計算に一切関与しないため
 * 無視してよい。
 */
export function detectPerformanceRegression(
  current: RegressionObservation,
  pastObservations: readonly RegressionObservation[],
): RegressionComparisonResult | null {
  if (!Number.isFinite(current.value)) return null;

  const candidates = pastObservations.filter(
    (obs) => obs.recipeKey === current.recipeKey && obs.metricKind === current.metricKind,
  );
  if (candidates.length === 0) return null;
  if (candidates.some((obs) => !Number.isFinite(obs.value))) return null;

  const window = candidates.slice(-REGRESSION_BASELINE_WINDOW);
  const baselineValue = median(window.map((obs) => obs.value));
  if (!Number.isFinite(baselineValue) || baselineValue === 0) return null;

  const direction = directionForMetricKind(current.metricKind);
  const rawChange = direction === 'higherIsWorse'
    ? (current.value - baselineValue) / baselineValue
    : (baselineValue - current.value) / baselineValue;

  return {
    hasAnomaly: rawChange >= REGRESSION_ANOMALY_THRESHOLD,
    currentValue: current.value,
    baselineValue,
    percentChange: rawChange,
  };
}
