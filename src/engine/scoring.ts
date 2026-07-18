// spec docs/spec.md §3.6: 調整チャレンジの☆評価。config/simStateそのものではなく、
// 時系列サンプル列(store.historyと同じ形)を受け取って判定する純関数。
export interface HistorySample {
  t: number; // 秒(サンプリング開始からの経過時間)
  rpm: number;
  current: number;
  backEmf: number;
}

export interface ScoreResult {
  star1: boolean; // 目標RPM到達
  star2: boolean; // 安定持続(10秒間RPM変動±10%以内)
  star3: boolean; // 消費電流の少なさ(効率)
  stars: 0 | 1 | 2 | 3;
}

const STABILITY_WINDOW_SEC = 10;
const STABILITY_TOLERANCE = 0.1; // ±10%

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// 末尾側から10秒分のトレーリングウィンドウを走査し、「平均RPMが目標以上」かつ
// 「窓内のRPMが平均の±10%以内」の窓が(過去のどの時点でも)一度でも成立していれば
// その窓を返す。☆1(到達)の上に☆2(その状態を10秒維持)が積み上がる設計にするため、
// 窓の平均RPMがtargetRpmを下回る場合は候補としない。
function findStableWindow(history: HistorySample[], targetRpm: number): HistorySample[] | null {
  for (let end = history.length - 1; end >= 0; end--) {
    const endTime = history[end].t;
    const startIndex = history.findIndex((s) => s.t >= endTime - STABILITY_WINDOW_SEC);
    if (startIndex < 0 || startIndex > end) continue;
    if (history[startIndex].t > endTime - STABILITY_WINDOW_SEC + 1e-9) continue; // 窓が10秒に満たない

    const window = history.slice(startIndex, end + 1);
    const meanRpm = average(window.map((s) => s.rpm));
    if (meanRpm < targetRpm) continue;

    const maxDeviation = Math.max(...window.map((s) => Math.abs(s.rpm - meanRpm)));
    if (maxDeviation <= meanRpm * STABILITY_TOLERANCE) {
      return window;
    }
  }
  return null;
}

// spec §3.6: ☆1(目標RPM到達)→☆2(10秒間の安定持続)→☆3(効率)の順に積み上がる。
// star3MaxAvgCurrentAは各チャレンジのデータ(data/challenges.ts)側で、
// scripts/sweep.tsの探索結果から個別に決める。
export function evaluateChallenge(
  history: HistorySample[],
  targetRpm: number,
  star3MaxAvgCurrentA: number,
): ScoreResult {
  const star1 = history.some((sample) => sample.rpm >= targetRpm);

  const stableWindow = findStableWindow(history, targetRpm);
  const star2 = stableWindow !== null;

  const star3 = star2 && average(stableWindow!.map((s) => s.current)) <= star3MaxAvgCurrentA;

  const stars = star3 ? 3 : star2 ? 2 : star1 ? 1 : 0;
  return { star1, star2, star3, stars };
}
