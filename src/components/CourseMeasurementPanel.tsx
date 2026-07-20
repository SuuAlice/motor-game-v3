import {
  BATTERY_CAPACITY_J_1_5V,
  BATTERY_CAPACITY_J_3_0V,
  BATTERY_HEAT_LIMIT,
  C_ROUGHNESS,
  G,
  ROUGHNESS_BUMP_AMPLITUDE_M,
  ROUGHNESS_RIPPLE_DEPTH,
  ROUGHNESS_WAVELENGTH_M,
} from '../engine/constants';
import type { ResolvedSegment } from '../engine/trackPhysics';
import { useGameStore } from '../store/gameStore';

export function CourseMeasurementPanel({ resolved }: { resolved: ResolvedSegment | null }) {
  const vehicle = useGameStore((state) => state.vehicleState);
  const carConfig = useGameStore((state) => state.carConfig);
  const motorConfig = useGameStore((state) => state.config);
  const selectedTrackId = useGameStore((state) => state.selectedTrackId);
  const heatPercent = vehicle.motor.batteryHeat / BATTERY_HEAT_LIMIT * 100;
  const primary = getPrimaryMeasurement(selectedTrackId, resolved, vehicle, carConfig, motorConfig.batteryVoltage);
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="コース走行計測値">
      <div className="mb-4 flex items-center justify-between rounded-xl border-2 border-sky-300 bg-sky-50 px-4 py-3">
        <div><p className="text-xs font-black text-sky-700">このコースの注目値</p><p className="text-sm font-bold text-slate-700">{primary.label}</p></div>
        <p className="text-2xl font-black tabular-nums text-slate-950">{primary.value} <span className="text-sm text-slate-600">{primary.unit}</span></p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Meter label="現在区間" value={resolved ? `${resolved.index + 1}` : 'ゴール'} unit="区間" />
        <Meter label="速度" value={vehicle.velocityMps.toFixed(2)} unit="m/s" />
        <Meter label="モーター" value={vehicle.motor.rpm.toFixed(0)} unit="RPM" />
        <Meter label="電流" value={vehicle.motor.current.toFixed(2)} unit="A" />
        <Meter label="空転率" value={(vehicle.slipRatio * 100).toFixed(1)} unit="%" />
        <Meter label="使用電気" value={vehicle.energyUsedJ.toFixed(2)} unit="J" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Status label="路面" value={resolved ? `グリップ ${(resolved.segment.surfaceGrip * 100).toFixed(0)} % / 凹凸 ${(resolved.segment.roughness * 100).toFixed(0)} %` : '走行終了'} icon="▰" />
        <Status label="勾配・カーブ" value={resolved ? `${resolved.segment.slopeDeg.toFixed(0)}°${resolved.segment.curveRadiusM ? ` / 半径 ${resolved.segment.curveRadiusM.toFixed(3)} m` : ' / 直線'}` : '—'} icon="⌁" />
        <Status label="電池発熱" value={`${heatPercent.toFixed(1)} %${heatPercent >= 65 ? '（注意）' : ''}`} icon={heatPercent >= 65 ? '⚠' : '♨'} />
      </div>
      {vehicle.isSlipping && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-800">〰 車輪が空転しています</p>}
    </section>
  );
}

function getPrimaryMeasurement(
  trackId: string,
  resolved: ResolvedSegment | null,
  vehicle: ReturnType<typeof useGameStore.getState>['vehicleState'],
  carConfig: ReturnType<typeof useGameStore.getState>['carConfig'],
  batteryVoltage: 1.5 | 3.0,
): { label: string; value: string; unit: string } {
  const segment = resolved?.segment;
  if (trackId === 'hill-climb') {
    return { label: '坂を押し上げる駆動力', value: Math.abs(vehicle.driveForceN).toFixed(2), unit: 'N' };
  }
  if (trackId === 'curve-balance') {
    const lateralAcceleration = segment?.curveRadiusM
      ? vehicle.velocityMps ** 2 / segment.curveRadiusM
      : 0;
    return { label: 'カーブで受ける横加速度', value: lateralAcceleration.toFixed(2), unit: 'm/s²' };
  }
  if (trackId === 'rough-board') {
    const wheelRadiusM = carConfig.wheelDiameterMm / 2000;
    const roughness = segment?.roughness ?? 0;
    const ripple = 1 + ROUGHNESS_RIPPLE_DEPTH * Math.sin(2 * Math.PI * vehicle.positionM / ROUGHNESS_WAVELENGTH_M);
    const roughnessForce = C_ROUGHNESS * (ROUGHNESS_BUMP_AMPLITUDE_M * roughness / wheelRadiusM) * (carConfig.massG / 1000) * G * ripple;
    return { label: '石畳による走行抵抗', value: roughnessForce.toFixed(3), unit: 'N' };
  }
  if (trackId === 'energy-run') {
    const capacity = batteryVoltage === 1.5 ? BATTERY_CAPACITY_J_1_5V : BATTERY_CAPACITY_J_3_0V;
    return { label: '残りの電気エネルギー', value: Math.max(0, capacity - vehicle.energyUsedJ).toFixed(1), unit: 'J' };
  }
  return { label: '現在の走行速度', value: vehicle.velocityMps.toFixed(2), unit: 'm/s' };
}

function Meter({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-black tabular-nums text-slate-900">{value} <span className="text-xs font-bold text-slate-500">{unit}</span></p></div>;
}

function Status({ label, value, icon }: { label: string; value: string; icon: string }) {
  return <div className="flex items-start gap-2 rounded-xl border border-slate-200 p-3"><span aria-hidden="true">{icon}</span><div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value}</p></div></div>;
}
