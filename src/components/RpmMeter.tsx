import { useGameStore } from '../store/gameStore';

export function RpmMeter() {
  const rpm = useGameStore((s) => s.simState.rpm);
  const current = useGameStore((s) => s.simState.current);
  const shorted = useGameStore((s) => s.simState.shorted);

  return (
    <div className="flex items-center gap-4 rounded-lg bg-white p-3 shadow-sm">
      <div>
        <div className="text-xs text-slate-500">回転数</div>
        <div className="text-2xl font-bold tabular-nums">{rpm.toFixed(0)} RPM</div>
      </div>
      <div>
        <div className="text-xs text-slate-500">電流</div>
        <div className="text-2xl font-bold tabular-nums">{current.toFixed(2)} A</div>
      </div>
      {shorted && (
        <div className="flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-sm font-bold text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>ショート!</span>
        </div>
      )}
    </div>
  );
}
