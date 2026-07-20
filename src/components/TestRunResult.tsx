import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';

export function TestRunResult() {
  const state = useGameStore((s) => s.vehicleState);
  const history = useGameStore((s) => s.testRunHistory);

  const metrics = useMemo(() => {
    const maxSpeed = Math.max(0, ...history.map((sample) => sample.velocityMps));
    const maxRpm = Math.max(0, ...history.map((sample) => Math.abs(sample.rpm)));
    const maxCurrent = Math.max(0, ...history.map((sample) => sample.currentA));
    const averageCurrent = history.length
      ? history.reduce((sum, sample) => sum + sample.currentA, 0) / history.length
      : 0;
    const averageSpeed = state.elapsedTimeS > 0 ? state.positionM / state.elapsedTimeS : 0;
    const slipTime = history.filter((sample) => sample.isSlipping).length * 0.05;
    return { maxSpeed, maxRpm, maxCurrent, averageCurrent, averageSpeed, slipTime };
  }, [history, state.elapsedTimeS, state.positionM]);

  const energy = state.energyBreakdown;
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm" aria-labelledby="test-result-title">
      <h2 id="test-result-title" className="text-lg font-bold text-slate-900">簡易リザルト</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Metric label="タイム" value={`${state.elapsedTimeS.toFixed(2)} s`} />
        <Metric label="最高速度" value={`${metrics.maxSpeed.toFixed(2)} m/s`} />
        <Metric label="平均速度" value={`${metrics.averageSpeed.toFixed(2)} m/s`} />
        <Metric label="最高回転数" value={`${metrics.maxRpm.toFixed(0)} RPM`} />
        <Metric label="平均電流" value={`${metrics.averageCurrent.toFixed(2)} A`} />
        <Metric label="最大電流" value={`${metrics.maxCurrent.toFixed(2)} A`} />
        <Metric label="発熱ピーク" value={`${(Math.max(0, ...history.map((sample) => sample.batteryHeat)) * 100).toFixed(1)} %`} />
        <Metric label="空転時間" value={`${metrics.slipTime.toFixed(2)} s`} />
      </dl>
      <div className="mt-5 rounded-xl bg-sky-50 p-4">
        <p className="text-xs font-bold text-sky-700">使用エネルギー（正式値）</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-sky-950">{state.energyUsedJ.toFixed(2)} J</p>
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-bold text-slate-700">エネルギー内訳（概算）</h3>
        <p className="mt-1 text-xs text-slate-500">正式合計とは一致しません。各値を100%比率として扱わないでください。</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          <Metric label="駆動" value={`${energy.driveJ.toFixed(2)} J`} />
          <Metric label="ギヤ損" value={`${energy.gearLossJ.toFixed(2)} J`} />
          <Metric label="空転損" value={`${energy.slipLossJ.toFixed(2)} J`} />
          <Metric label="ブラシ損" value={`${energy.brushLossJ.toFixed(2)} J`} />
          <Metric label="熱" value={`${energy.heatJ.toFixed(2)} J`} />
        </dl>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold tabular-nums text-slate-800">{value}</dd></div>;
}
