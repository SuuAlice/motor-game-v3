import { useState } from 'react';
import { CourseResultGraph } from '../components/CourseResultGraph';
import { ControlBar } from '../components/ControlBar';
import { GraphPanel } from '../components/GraphPanel';
import { ObservationPanel } from '../components/ObservationPanel';
import { ParamPanel, SliderRow } from '../components/ParamPanel';
import { RpmMeter } from '../components/RpmMeter';
import { TRACK_BY_ID } from '../data/tracks';
import type { CarConfig } from '../engine/vehiclePhysics';
import { MotorCanvas } from '../render/MotorCanvas';
import { RaceCanvas } from '../render/RaceCanvas';
import { useGameStore } from '../store/gameStore';

const CAR_CONTROLS: Array<{ key: keyof CarConfig; label: string; min: number; max: number; step: number; unit: string }> = [
  { key: 'massG', label: '車体質量', min: 80, max: 250, step: 1, unit: 'g' },
  { key: 'gearRatio', label: '総減速比', min: 1, max: 12, step: 0.1, unit: ': 1' },
  { key: 'gearEfficiency', label: 'ギヤ効率', min: 0.6, max: 0.95, step: 0.01, unit: '' },
  { key: 'wheelDiameterMm', label: '車輪径', min: 20, max: 50, step: 1, unit: 'mm' },
  { key: 'tireGrip', label: 'タイヤグリップ', min: 0, max: 1, step: 0.01, unit: '' },
  { key: 'axleFriction', label: '車軸摩擦', min: 0, max: 1, step: 0.01, unit: '' },
  { key: 'wheelAlignmentMm', label: '車輪ずれ', min: 0, max: 3, step: 0.1, unit: 'mm' },
  { key: 'centerOfMassHeightMm', label: '重心高さ', min: 10, max: 40, step: 1, unit: 'mm' },
  { key: 'motorMountOffsetMm', label: 'モーター搭載ずれ', min: 0, max: 10, step: 0.1, unit: 'mm' },
];

export function LabMode() {
  const [contact, setContact] = useState<'lifted' | 'grounded'>('lifted');
  const car = useGameStore((state) => state.carConfig);
  const setCar = useGameStore((state) => state.setLabCarConfig);
  const phase = useGameStore((state) => state.testRunPhase);
  const vehicle = useGameStore((state) => state.vehicleState);
  const history = useGameStore((state) => state.testRunHistory);
  const start = useGameStore((state) => state.startTestRun);
  const abort = useGameStore((state) => state.abortTestRun);
  const reset = useGameStore((state) => state.resetTestRun);
  const track = TRACK_BY_ID.get('straight-10m')!;

  const switchContact = (next: 'lifted' | 'grounded') => {
    if (phase === 'running') abort();
    reset();
    setContact(next);
  };

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 pb-12">
    <header className="rounded-3xl bg-slate-900 p-6 text-white"><p className="text-xs font-black tracking-[0.22em] text-violet-300">MOTOR &amp; CAR LAB</p><h2 className="mt-2 text-3xl font-black">実験室</h2><p className="mt-2 text-sm text-slate-300">車輪を浮かせた無負荷状態と、接地した車体負荷状態を同じ設定で比較します。</p></header>
    <div className="grid grid-cols-2 rounded-2xl bg-slate-200 p-1" role="group" aria-label="車輪の状態">
      <button type="button" onClick={() => switchContact('lifted')} aria-pressed={contact === 'lifted'} className={`rounded-xl px-4 py-3 font-black ${contact === 'lifted' ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-600'}`}>車輪を浮かせる</button>
      <button type="button" onClick={() => switchContact('grounded')} aria-pressed={contact === 'grounded'} className={`rounded-xl px-4 py-3 font-black ${contact === 'grounded' ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-600'}`}>車輪を接地する</button>
    </div>

    {contact === 'lifted'
      ? <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]"><div className="grid gap-4"><MotorCanvas /><RpmMeter /><ControlBar /><ObservationPanel /><GraphPanel /></div><ParamPanel /></section>
      : <section className="grid gap-4"><RaceCanvas /><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Meter label="速度" value={vehicle.velocityMps.toFixed(2)} unit="m/s" /><Meter label="回転数" value={vehicle.motor.rpm.toFixed(0)} unit="RPM" /><Meter label="電流" value={vehicle.motor.current.toFixed(2)} unit="A" /><Meter label="空転率" value={(vehicle.slipRatio * 100).toFixed(1)} unit="%" /><Meter label="発熱" value={(vehicle.motor.batteryHeat * 100).toFixed(0)} unit="%" /></div><div className="flex gap-3">{phase === 'running' ? <button type="button" onClick={abort} className="flex-1 rounded-xl bg-rose-700 px-4 py-3 font-black text-white">走行を中止</button> : <button type="button" onClick={start} className="flex-1 rounded-xl bg-sky-700 px-4 py-3 font-black text-white">手で押して走行</button>}<button type="button" onClick={reset} className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-black">リセット</button></div><CourseResultGraph history={history} track={track} /></section>}

    <section className="rounded-2xl bg-white p-5 shadow-sm"><h3 className="text-xl font-black">車体パラメータ</h3><p className="mt-1 text-xs text-slate-500">単位付きの数値入力とスライダーはキーボードでも操作できます。</p><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{CAR_CONTROLS.map((control) => <SliderRow key={control.key} label={control.label} value={car[control.key]} min={control.min} max={control.max} step={control.step} unit={control.unit} onChange={(value) => setCar({ [control.key]: value })} />)}</div></section>
  </div>;
}

function Meter({ label, value, unit }: { label: string; value: string; unit: string }) { return <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-black tabular-nums">{value} <span className="text-xs text-slate-500">{unit}</span></p></div>; }
