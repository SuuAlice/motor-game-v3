import { useEffect, useMemo, useState } from 'react';
import { BROKEN_CARS, type BrokenCar } from '../data/brokenCars';
import type { MotorConfig } from '../engine/motorPhysics';
import type { CarConfig } from '../engine/vehiclePhysics';
import { RaceCanvas } from '../render/RaceCanvas';
import { useGameStore } from '../store/gameStore';

const MOTOR_CONTROLS: Partial<Record<keyof MotorConfig, { label: string; min: number; max: number; step: number; unit: string }>> = {
  slitWidthMm: { label: '整流子のすき間', min: 0, max: 5, step: 0.1, unit: 'mm' },
  brushPressure: { label: 'ブラシ圧', min: 0, max: 1, step: 0.01, unit: '' },
};
const CAR_CONTROLS: Partial<Record<keyof CarConfig, { label: string; min: number; max: number; step: number; unit: string }>> = {
  axleFriction: { label: '車軸摩擦', min: 0, max: 1, step: 0.01, unit: '' },
  wheelAlignmentMm: { label: '車輪ずれ', min: 0, max: 3, step: 0.1, unit: 'mm' },
  tireGrip: { label: 'タイヤグリップ', min: 0, max: 1, step: 0.01, unit: '' },
  gearRatio: { label: '総減速比', min: 1, max: 12, step: 0.1, unit: ': 1' },
};

export function DiagnosisMode() {
  const [selected, setSelected] = useState<BrokenCar | null>(null);
  return selected
    ? <DiagnosisPlay brokenCar={selected} onExit={() => setSelected(null)} />
    : <BrokenCarList onSelect={setSelected} />;
}

function BrokenCarList({ onSelect }: { onSelect: (brokenCar: BrokenCar) => void }) {
  const progress = useGameStore((state) => state.diagnosisProgress);
  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-12">
    <header className="rounded-3xl bg-slate-900 p-6 text-white">
      <p className="text-xs font-black tracking-[0.22em] text-rose-300">TROUBLE DIAGNOSIS</p>
      <h2 className="mt-2 text-3xl font-black">トラブル診断</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-300">症状と走行計測を観察し、許可された調整だけで車を完走させます。原因や正解のヒントは表示されません。</p>
    </header>
    <section className="grid gap-3 sm:grid-cols-2">
      {BROKEN_CARS.map((brokenCar, index) => {
        const solved = progress[brokenCar.id] ?? false;
        return <button key={brokenCar.id} type="button" onClick={() => onSelect(brokenCar)} className="rounded-2xl border-2 border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-200">
          <span className="text-xs font-black text-rose-700">CASE {String(index + 1).padStart(2, '0')}</span>
          <span className="mt-1 flex items-center justify-between gap-3"><strong className="text-lg text-slate-900">{brokenCar.title}</strong><span className={`rounded-full px-2 py-1 text-xs font-black ${solved ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{solved ? '✓ 修理済み' : '未診断'}</span></span>
          <span className="mt-3 block text-sm leading-relaxed text-slate-600">観察記録: {brokenCar.symptom}</span>
        </button>;
      })}
    </section>
  </div>;
}

function DiagnosisPlay({ brokenCar, onExit }: { brokenCar: BrokenCar; onExit: () => void }) {
  const startDiagnosis = useGameStore((state) => state.startDiagnosis);
  const stopDiagnosis = useGameStore((state) => state.stopDiagnosis);
  const config = useGameStore((state) => state.config);
  const car = useGameStore((state) => state.carConfig);
  const vehicle = useGameStore((state) => state.vehicleState);
  const phase = useGameStore((state) => state.testRunPhase);
  const history = useGameStore((state) => state.testRunHistory);
  const setConfig = useGameStore((state) => state.setConfig);
  const setCar = useGameStore((state) => state.setDiagnosisCarConfig);
  const startRun = useGameStore((state) => state.startTestRun);
  const abortRun = useGameStore((state) => state.abortTestRun);
  const resetRun = useGameStore((state) => state.resetTestRun);
  const recordSolved = useGameStore((state) => state.recordDiagnosisSolved);

  useEffect(() => { startDiagnosis(brokenCar); return () => stopDiagnosis(); }, [brokenCar, startDiagnosis, stopDiagnosis]);
  const solved = phase === 'complete' && vehicle.status === 'finished';
  useEffect(() => { if (solved) recordSolved(brokenCar.id); }, [solved, brokenCar.id, recordSolved]);
  const summary = useMemo(() => {
    const maxCurrent = history.reduce((max, sample) => Math.max(max, sample.currentA), 0);
    const slipFrames = history.filter((sample) => sample.isSlipping).length;
    return { maxCurrent, slipPercent: history.length ? slipFrames / history.length * 100 : 0 };
  }, [history]);

  const changeMotor = (key: keyof MotorConfig, value: number) => { setConfig({ [key]: value }); resetRun(); };
  const changeCar = (key: keyof CarConfig, value: number) => setCar({ [key]: value });
  const leave = () => { if (phase === 'running') abortRun(); onExit(); };

  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 pb-12">
    <header className="rounded-2xl bg-slate-900 p-5 text-white"><button type="button" onClick={leave} className="text-sm font-bold text-slate-300 underline">← 診断一覧</button><h2 className="mt-3 text-2xl font-black">{brokenCar.title}</h2><p className="mt-2 text-sm text-slate-300">観察記録: {brokenCar.symptom}</p></header>
    {solved && <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4 text-center text-xl font-black text-emerald-800">✓ なおった！ 10 mを完走しました</div>}
    <RaceCanvas />
    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="診断計測値"><div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
      <Meter label="速度" value={vehicle.velocityMps.toFixed(2)} unit="m/s" /><Meter label="回転数" value={vehicle.motor.rpm.toFixed(0)} unit="RPM" /><Meter label="電流" value={vehicle.motor.current.toFixed(2)} unit="A" /><Meter label="最大電流" value={summary.maxCurrent.toFixed(2)} unit="A" /><Meter label="空転区間" value={summary.slipPercent.toFixed(1)} unit="%" /><Meter label="発熱" value={(vehicle.motor.batteryHeat * 100).toFixed(0)} unit="%" />
    </div><div className="mt-3 grid grid-cols-2 gap-3"><Meter label="停止・現在位置" value={vehicle.positionM.toFixed(2)} unit="m" /><Meter label="熱への累積損失" value={vehicle.energyBreakdown.heatJ.toFixed(2)} unit="J" /></div></section>
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-black text-slate-900">調整可能な箇所</h3><p className="mt-1 text-xs text-slate-600">値を変えたら再走行し、計測の変化を比較してください。</p><div className="mt-4 grid gap-4 sm:grid-cols-2">
      {brokenCar.repairableMotorParams.map((key) => { const control = MOTOR_CONTROLS[key]; const value = config[key]; return control && typeof value === 'number' ? <Slider key={key} {...control} value={value} onChange={(next) => changeMotor(key, next)} /> : null; })}
      {brokenCar.repairableCarParams.map((key) => { const control = CAR_CONTROLS[key]; const value = car[key]; return control && typeof value === 'number' ? <Slider key={key} {...control} value={value} onChange={(next) => changeCar(key, next)} /> : null; })}
    </div></section>
    <div className="flex gap-3">{phase === 'running' ? <button type="button" onClick={abortRun} className="flex-1 rounded-xl bg-rose-700 px-5 py-3 font-black text-white">走行を中止</button> : <button type="button" onClick={startRun} className="flex-1 rounded-xl bg-sky-700 px-5 py-3 font-black text-white">手で押して診断走行</button>}{phase !== 'ready' && phase !== 'running' && <button type="button" onClick={resetRun} className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-black">待機状態へ戻す</button>}</div>
    <p className="text-center text-xs text-slate-500">安全注意: 実物の電池や導線を短絡させないでください。発熱した場合はすぐに接続を外してください。</p>
  </div>;
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) {
  return <label className="rounded-xl bg-white p-3"><span className="flex justify-between text-sm font-bold"><span>{label}</span><span className="tabular-nums">{value.toFixed(step < 0.1 ? 2 : 1)} {unit}</span></span><input className="mt-3 w-full accent-amber-600" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
function Meter({ label, value, unit }: { label: string; value: string; unit: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-black tabular-nums">{value} <span className="text-xs text-slate-500">{unit}</span></p></div>; }
