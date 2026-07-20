import { useState, type ReactNode } from 'react';
import { K_E } from '../engine/constants';
import { computeB, computeElectricalState, computeJ, computeMagneticTorque } from '../engine/motorPhysics';
import {
  ACCENT_COLORS,
  BATTERY_POSITION_PRESETS,
  BATTERY_PRESETS,
  BODY_COLORS,
  CHASSIS_PRESETS,
  GEAR_PRESETS,
  TIRE_PRESETS,
  WHEEL_PRESETS,
  resolveGarageColors,
} from '../data/partPresets';
import { CarSprite } from '../render/CarSprite';
import { useGameStore } from '../store/gameStore';

type GarageTab = 'motor' | 'gear' | 'wheel' | 'chassis' | 'color';

const TABS: Array<{ id: GarageTab; label: string }> = [
  { id: 'motor', label: 'モーター' }, { id: 'gear', label: 'ギヤ' }, { id: 'wheel', label: '車輪' },
  { id: 'chassis', label: 'シャーシ・電池' }, { id: 'color', label: 'カラー' },
];

export function GarageMode() {
  const [tab, setTab] = useState<GarageTab>('motor');
  const config = useGameStore((state) => state.config);
  const car = useGameStore((state) => state.carConfig);
  const selection = useGameStore((state) => state.garageSelection);
  const setSelection = useGameStore((state) => state.setGarageSelection);
  const setMode = useGameStore((state) => state.setMode);
  const colors = resolveGarageColors(selection);

  const fieldB = computeB(config.magnetStrength, config.magnetDistanceMm);
  const noLoadOmega = K_E * fieldB * config.coilTurns > 0 ? config.batteryVoltage / (K_E * fieldB * config.coilTurns) : 0;
  const theoreticalSpeedMps = noLoadOmega / car.gearRatio * (car.wheelDiameterMm / 2000);
  const stallElectrical = computeElectricalState(config, Math.PI / 2, 0);
  const stallMotorTorque = computeMagneticTorque(config, stallElectrical, stallElectrical.current);
  const axleTorque = stallMotorTorque * car.gearRatio * car.gearEfficiency;
  const wheelRadiusM = car.wheelDiameterMm / 2000;
  const reflectedInertia = computeJ(config) + (car.massG / 1000) * wheelRadiusM ** 2 / (car.gearRatio ** 2 * car.gearEfficiency);

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 pb-12">
    <header className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
      <p className="text-xs font-black tracking-[0.22em] text-amber-300">HANDMADE CAR GARAGE</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-3xl font-black">手作りカー・ガレージ</h2><p className="mt-2 text-sm text-slate-300">部品の実数値を見ながら、コースに合わせて組み替えます。</p></div><div className="flex gap-2"><button onClick={() => setMode('testRun')} className="rounded-xl bg-sky-700 px-4 py-2 font-black">テスト走行</button><button onClick={() => setMode('course')} className="rounded-xl bg-emerald-700 px-4 py-2 font-black">コース選択</button></div></div>
    </header>

    <section className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[1.4fr_1fr]">
      <div className="flex min-h-64 items-center rounded-2xl bg-gradient-to-b from-sky-50 to-stone-100 p-4"><CarSprite wheelDiameterMm={car.wheelDiameterMm} batteryPositionPreset={selection.batteryPosition} appearance={colors} wheelAngleRad={0} motorAngleRad={0.55} isSlipping={false} vibrationOffset={0} /></div>
      <div><h3 className="font-black text-slate-900">理論諸元</h3><p className="text-xs text-slate-500">損失を単純化した設計比較用の計算値です。</p><dl className="mt-4 grid grid-cols-2 gap-3">
        <Spec label="総減速比" value={`${car.gearRatio.toFixed(1)} : 1`} />
        <Spec label="無負荷理論最高速" value={`${theoreticalSpeedMps.toFixed(2)} m/s`} />
        <Spec label="停動時車軸トルク" value={`${axleTorque.toFixed(3)} N·m`} />
        <Spec label="反射慣性 J_eff" value={`${reflectedInertia.toExponential(2)} kg·m²`} />
        <Spec label="推定総質量" value={`${car.massG.toFixed(0)} g`} />
        <Spec label="停動電流" value={`${stallElectrical.current.toFixed(2)} A`} />
      </dl></div>
    </section>

    <nav className="flex overflow-x-auto rounded-2xl bg-slate-200 p-1" aria-label="ガレージ調整項目">{TABS.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-pressed={tab === item.id} className={`min-w-max flex-1 rounded-xl px-4 py-3 text-sm font-black ${tab === item.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}>{item.label}</button>)}</nav>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      {tab === 'motor' && <div><h3 className="text-xl font-black">現在のモーター</h3><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Spec label="巻き数" value={`${config.coilTurns} 回`} /><Spec label="線径" value={`${config.wireGaugeMm ?? 0.4} mm`} /><Spec label="磁石距離" value={`${config.magnetDistanceMm} mm`} /><Spec label="電池" value={`${config.batteryVoltage} V`} /></div><button onClick={() => setMode('assembly')} className="mt-5 rounded-xl bg-amber-600 px-5 py-3 font-black text-white">モーター工作台を開く</button></div>}
      {tab === 'gear' && <PresetGrid title="ギヤを選ぶ">{GEAR_PRESETS.map((item) => <PresetButton key={item.id} active={selection.gearId === item.id} title={item.name} detail={`${item.gearRatio.toFixed(1)} : 1 / 効率 ${(item.gearEfficiency * 100).toFixed(0)} %`} onClick={() => setSelection({ gearId: item.id })} />)}</PresetGrid>}
      {tab === 'wheel' && <div className="grid gap-6"><PresetGrid title="車輪径">{WHEEL_PRESETS.map((item) => <PresetButton key={item.id} active={selection.wheelId === item.id} title={item.name} detail={`${item.wheelDiameterMm} mm`} onClick={() => setSelection({ wheelId: item.id })} />)}</PresetGrid><PresetGrid title="タイヤ">{TIRE_PRESETS.map((item) => <PresetButton key={item.id} active={selection.tireId === item.id} title={item.name} detail={`グリップ ${(item.tireGrip * 100).toFixed(0)} %`} onClick={() => setSelection({ tireId: item.id })} />)}</PresetGrid></div>}
      {tab === 'chassis' && <div className="grid gap-6"><PresetGrid title="シャーシ">{CHASSIS_PRESETS.map((item) => <PresetButton key={item.id} active={selection.chassisId === item.id} title={item.name} detail={`本体 ${item.baseMassG} g / 重心 ${item.centerOfMassHeightMm} mm`} onClick={() => setSelection({ chassisId: item.id })} />)}</PresetGrid><PresetGrid title="電池">{BATTERY_PRESETS.map((item) => <PresetButton key={item.id} active={selection.batteryId === item.id} title={item.name} detail={`${item.batteryVoltage} V / ${item.massG} g`} onClick={() => setSelection({ batteryId: item.id })} />)}</PresetGrid><PresetGrid title="電池位置">{BATTERY_POSITION_PRESETS.map((item) => <PresetButton key={item.id} active={selection.batteryPosition === item.id} title={item.name} detail={`重心補正 ${item.heightOffsetMm >= 0 ? '+' : ''}${item.heightOffsetMm} mm`} onClick={() => setSelection({ batteryPosition: item.id })} />)}</PresetGrid></div>}
      {tab === 'color' && <div className="grid gap-6"><ColorGrid title="車体色" items={BODY_COLORS} selectedId={selection.bodyColorId} onSelect={(bodyColorId) => setSelection({ bodyColorId })} /><ColorGrid title="アクセント色" items={ACCENT_COLORS} selectedId={selection.accentColorId} onSelect={(accentColorId) => setSelection({ accentColorId })} /></div>}
    </section>
  </div>;
}

function Spec({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-black tabular-nums text-slate-900">{value}</dd></div>; }
function PresetGrid({ title, children }: { title: string; children: ReactNode }) { return <div><h3 className="font-black text-slate-900">{title}</h3><div className="mt-3 grid gap-3 sm:grid-cols-3">{children}</div></div>; }
function PresetButton({ active, title, detail, onClick }: { active: boolean; title: string; detail: string; onClick: () => void }) { return <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-2xl border-2 p-4 text-left ${active ? 'border-sky-600 bg-sky-50' : 'border-slate-200'}`}><strong className="block">{active ? '✓ ' : ''}{title}</strong><span className="mt-1 block text-sm text-slate-600">{detail}</span></button>; }
function ColorGrid({ title, items, selectedId, onSelect }: { title: string; items: readonly { id: string; name: string; value: string }[]; selectedId: string; onSelect: (id: string) => void }) { return <div><h3 className="font-black">{title}</h3><div className="mt-3 flex flex-wrap gap-3">{items.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} aria-pressed={selectedId === item.id} className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 font-bold ${selectedId === item.id ? 'border-sky-600 bg-sky-50' : 'border-slate-200'}`}><span className="h-6 w-6 rounded-full border border-black/20" style={{ backgroundColor: item.value }} />{selectedId === item.id ? '✓ ' : ''}{item.name}</button>)}</div></div>; }
