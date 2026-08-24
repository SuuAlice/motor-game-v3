import { TestRunResult } from '../components/TestRunResult';
import { RaceCanvas } from '../render/RaceCanvas';
import { TEST_RUN_COURSE_LENGTH_M, useGameStore } from '../store/gameStore';
import { DestructionHud } from '../components/DestructionHud';

const STATUS_LABELS = {
  ready: '待機中',
  running: '走行中',
  aborted: '中止',
  complete: '走行終了',
} as const;

export function TestRunMode() {
  const vehicle = useGameStore((s) => s.vehicleState);
  const phase = useGameStore((s) => s.testRunPhase);
  const start = useGameStore((s) => s.startTestRun);
  const abort = useGameStore((s) => s.abortTestRun);
  const reset = useGameStore((s) => s.resetTestRun);
  const setMode = useGameStore((s) => s.setMode);
  const returnToGarage = () => {
    if (phase === 'running') abort();
    setMode('garage');
  };
  const progress = Math.min(100, (vehicle.positionM / TEST_RUN_COURSE_LENGTH_M) * 100);

  const terminalLabel = vehicle.status === 'finished' ? '完走'
    : vehicle.status === 'stalled' ? '停止'
      : vehicle.status === 'overheated' ? '過熱停止'
        : vehicle.status === 'derailed' ? 'コースアウト'
          : STATUS_LABELS[phase];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-10">
      {/* G7-D: 走行中の破壊症状HUD。run未開始の間は何も描かない(コンポーネント内で判定)。 */}
      <DestructionHud />
      <header className="rounded-2xl bg-slate-900 p-5 text-white">
        <p className="text-xs font-bold tracking-[0.2em] text-sky-300">10 m STRAIGHT TEST</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-2xl font-black">標準車体テスト走行</h2><p className="mt-1 text-sm text-slate-300">手でそっと押し出し、現在のモーターを負荷ありで測定します。</p></div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold" aria-live="polite">{terminalLabel}</span>
            <button type="button" onClick={returnToGarage} className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-bold hover:bg-white/10">
              ← ガレージへ戻る
            </button>
          </div>
        </div>
      </header>

      <RaceCanvas />

      <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="走行計測値">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Meter label="速度" value={`${vehicle.velocityMps.toFixed(2)} m/s`} />
          <Meter label="モーター" value={`${vehicle.motor.rpm.toFixed(0)} RPM`} />
          <Meter label="電流" value={`${vehicle.motor.current.toFixed(2)} A`} />
          <Meter label="進行距離" value={`${Math.max(0, vehicle.positionM).toFixed(2)} m`} />
          <Meter label="空転率" value={`${(vehicle.slipRatio * 100).toFixed(1)} %`} />
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500"><span>進行度</span><span>{progress.toFixed(0)} %</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-sky-600 transition-[width]" style={{ width: `${progress}%` }} /></div>
        </div>
        <strong aria-live="polite" className={`mt-3 block min-h-5 text-right text-sm ${vehicle.isSlipping ? 'text-amber-700' : 'text-slate-500'}`}>
          {vehicle.isSlipping ? '〰 車輪空転中' : '● タイヤ接地中'}
        </strong>
      </section>

      <div className="flex gap-3">
        {phase !== 'running' ? (
          <button type="button" onClick={start} className="flex-1 rounded-xl bg-sky-700 px-5 py-3 font-bold text-white focus:outline-none focus:ring-4 focus:ring-sky-300">手で押してスタート</button>
        ) : (
          <button type="button" onClick={abort} className="flex-1 rounded-xl bg-rose-700 px-5 py-3 font-bold text-white focus:outline-none focus:ring-4 focus:ring-rose-300">走行を中止</button>
        )}
        {phase !== 'running' && phase !== 'ready' && <button type="button" onClick={reset} className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-bold text-slate-700">待機状態へ戻す</button>}
      </div>

      {(phase === 'complete' || phase === 'aborted') && <TestRunResult />}
      <p className="text-center text-xs text-slate-500">安全注意: 実物の電池や導線を短絡させないでください。発熱した場合はすぐに接続を外してください。</p>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-black tabular-nums text-slate-900">{value}</p></div>;
}
