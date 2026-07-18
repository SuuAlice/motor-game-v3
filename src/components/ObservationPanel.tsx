import { useMemo } from 'react';
import { useGameStore, type MeasurementSample } from '../store/gameStore';

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (Math.abs(mean) < 1e-9) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

function countChatterStarts(samples: MeasurementSample[]): number {
  let starts = 0;
  for (let i = 0; i < samples.length; i += 1) {
    if (samples[i].chattering && (i === 0 || !samples[i - 1].chattering)) starts += 1;
  }
  return starts;
}

function stopHistogram(samples: MeasurementSample[]): number[] {
  const bins = Array<number>(8).fill(0);
  for (const sample of samples) {
    if (Math.abs(sample.rpm) >= 5) continue;
    const normalized = ((sample.theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    bins[Math.min(7, Math.floor((normalized / (2 * Math.PI)) * 8))] += 1;
  }
  return bins;
}

export function ObservationPanel() {
  const history = useGameStore((s) => s.history);
  const simState = useGameStore((s) => s.simState);

  const metrics = useMemo(() => {
    const duration = history.length > 1 ? history[history.length - 1].t - history[0].t : 0;
    const currentCv = coefficientOfVariation(history.map((sample) => sample.current));
    const rpmCv = coefficientOfVariation(history.map((sample) => Math.abs(sample.rpm)));
    const chatterRate = duration > 0 ? countChatterStarts(history) / duration : 0;
    const heatRate = duration > 0
      ? (history[history.length - 1].batteryHeat - history[0].batteryHeat) / duration
      : 0;
    return { currentCv, rpmCv, chatterRate, heatRate, histogram: stopHistogram(history) };
  }, [history]);

  const maxBin = Math.max(1, ...metrics.histogram);

  return (
    <section className="w-full rounded-lg bg-white p-4 shadow-sm" aria-labelledby="observation-title">
      <h2 id="observation-title" className="font-bold text-slate-800">計測パネル</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-slate-500">電流波形の乱れ率</dt><dd className="tabular-nums text-slate-800">{(metrics.currentCv * 100).toFixed(1)} %</dd></div>
        <div><dt className="text-slate-500">瞬断回数</dt><dd className="tabular-nums text-slate-800">{metrics.chatterRate.toFixed(2)} 回/秒</dd></div>
        <div><dt className="text-slate-500">RPM変動係数</dt><dd className="tabular-nums text-slate-800">{(metrics.rpmCv * 100).toFixed(1)} %</dd></div>
        <div><dt className="text-slate-500">発熱レート</dt><dd className="tabular-nums text-slate-800">{metrics.heatRate.toFixed(3)} /秒</dd></div>
        <div><dt className="text-slate-500">電池発熱ゲージ</dt><dd className="tabular-nums text-slate-800">{(simState.batteryHeat * 100).toFixed(1)} %</dd></div>
        <div><dt className="text-slate-500">コイル状態</dt><dd className="text-slate-800">{simState.coilCollapsed ? '崩壊' : '正常'}</dd></div>
      </dl>
      <div className="mt-4">
        <h3 className="text-xs font-bold text-slate-600">θ停止位置ヒストグラム（45°刻み）</h3>
        <div className="mt-2 flex h-16 items-end gap-1" aria-label={`停止位置の度数: ${metrics.histogram.join(', ')}`}>
          {metrics.histogram.map((count, index) => (
            <div key={index} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="w-full bg-sky-500" style={{ height: `${Math.max(2, (count / maxBin) * 44)}px` }} />
              <span className="text-[9px] text-slate-400">{index * 45}°</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">直近12秒間の計測値。原因の推定は表示しません。</p>
    </section>
  );
}
