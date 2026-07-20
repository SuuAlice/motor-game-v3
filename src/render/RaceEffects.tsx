import type { VehicleSimState } from '../engine/vehiclePhysics';

export function RaceEffects({ vehicle, active = true }: { vehicle: VehicleSimState; active?: boolean }) {
  const heat = Math.min(1, vehicle.motor.batteryHeat);
  return <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true" style={{ animationPlayState: active ? 'running' : 'paused' }}>
    {vehicle.isSlipping && <div className="absolute bottom-[18%] left-[17%] flex gap-1">
      {[0, 1, 2, 3].map((index) => <span key={index} className="slip-smoke block h-4 w-4 rounded-full bg-slate-400/60" style={{ animationDelay: `${index * 0.12}s`, animationPlayState: active ? 'running' : 'paused' }} />)}
    </div>}
    {heat >= 0.45 && <div className="absolute bottom-[20%] left-[38%] h-28 w-48 rounded-full bg-red-500/20 blur-xl" style={{ opacity: heat }} />}
    {vehicle.status === 'derailed' && <div className="absolute inset-x-0 top-1/3 flex justify-center"><div className="rounded-2xl border-4 border-rose-700 bg-white/95 px-6 py-3 text-center text-3xl font-black text-rose-800 shadow-xl">⚠ コースアウト</div></div>}
  </div>;
}
