export interface SweepCandidate<T> {
  config: T;
  value: number;
}

export function percentileTarget(bestValue: number, direction: 'min' | 'max', ratio: number): number {
  if (!(ratio >= 0.95 && ratio <= 0.99)) throw new RangeError('ratio must be between 0.95 and 0.99');
  return direction === 'max' ? bestValue * ratio : bestValue / ratio;
}

export interface ExtremeAudit {
  parameter: string;
  direction: 'min' | 'max';
  trackIds: string[];
}

export type ParameterScoreTable = ReadonlyMap<string, ReadonlyMap<number, number>>;

export function auditUniversalMonotonicity(
  parameter: string,
  values: readonly number[],
  scoresByTrack: ParameterScoreTable,
  epsilon = 1e-9,
): ExtremeAudit[] {
  const ordered = [...values].sort((a, b) => a - b);
  if (ordered.length < 2 || scoresByTrack.size === 0) return [];
  const tracks = [...scoresByTrack.entries()];
  const improvesTowardMin = tracks.every(([, scores]) => ordered.slice(1).every((value, index) => {
    const low = scores.get(ordered[index]) ?? Number.POSITIVE_INFINITY;
    const high = scores.get(value) ?? Number.POSITIVE_INFINITY;
    return low + epsilon < high;
  }));
  const improvesTowardMax = tracks.every(([, scores]) => ordered.slice(1).every((value, index) => {
    const low = scores.get(ordered[index]) ?? Number.POSITIVE_INFINITY;
    const high = scores.get(value) ?? Number.POSITIVE_INFINITY;
    return high + epsilon < low;
  }));
  if (improvesTowardMin) return [{ parameter, direction: 'min', trackIds: tracks.map(([id]) => id) }];
  if (improvesTowardMax) return [{ parameter, direction: 'max', trackIds: tracks.map(([id]) => id) }];
  return [];
}

// 各コースの最良構成が、同じパラメータの同じ端にそろっていないかを調べる。
// これは縮退戦略の必要条件を機械的に検出する監査であり、発見時は目標値で
// 隠さずコース値または探索範囲を再検討する。
export function auditUniversalExtremes<T extends Record<string, number>>(
  bestByTrack: ReadonlyMap<string, T>,
  ranges: Readonly<Record<string, readonly number[]>>,
): ExtremeAudit[] {
  const audits: ExtremeAudit[] = [];
  for (const [parameter, values] of Object.entries(ranges)) {
    if (values.length < 2 || bestByTrack.size === 0) continue;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const entries = [...bestByTrack.entries()];
    if (entries.every(([, config]) => config[parameter] === min)) {
      audits.push({ parameter, direction: 'min', trackIds: entries.map(([id]) => id) });
    }
    if (entries.every(([, config]) => config[parameter] === max)) {
      audits.push({ parameter, direction: 'max', trackIds: entries.map(([id]) => id) });
    }
  }
  return audits;
}
