import { useGameStore } from '../store/gameStore';
import type { MotorConfig } from '../engine/motorPhysics';

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}

function SliderRow({ label, value, min, max, step, unit, onChange }: SliderRowProps) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-slate-500">
          {value.toFixed(step < 1 ? 2 : 0)}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-600"
      />
    </label>
  );
}

// spec §3.7.1: 「弱/中/強」ボタンはmagnetStrength(0–1連続値)の代表値プリセット
const MAGNET_PRESETS: { label: string; value: number }[] = [
  { label: '弱(フェライト)', value: 0.2 },
  { label: '中', value: 0.5 },
  { label: '強(ネオジム)', value: 0.9 },
];

const BATTERY_OPTIONS = [1.5, 3.0] as const;

export function ParamPanel() {
  const config = useGameStore((s) => s.config);
  const setConfig = useGameStore((s) => s.setConfig);

  function update<K extends keyof MotorConfig>(key: K, value: MotorConfig[K]) {
    setConfig({ [key]: value } as Partial<MotorConfig>);
  }

  return (
    <div className="grid gap-3 rounded-lg bg-white p-4 shadow-sm">
      <SliderRow
        label="巻き数"
        value={config.coilTurns}
        min={10}
        max={150}
        step={1}
        unit="回"
        onChange={(v) => update('coilTurns', v)}
      />
      <SliderRow
        label="スリット幅"
        value={config.slitWidthMm}
        min={0}
        max={5}
        step={0.1}
        unit="mm"
        onChange={(v) => update('slitWidthMm', v)}
      />
      <SliderRow
        label="削り具合"
        value={config.sandingQuality}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => update('sandingQuality', v)}
      />
      <SliderRow
        label="ブラシ圧"
        value={config.brushPressure}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => update('brushPressure', v)}
      />
      <SliderRow
        label="磁石との距離"
        value={config.magnetDistanceMm}
        min={5}
        max={30}
        step={1}
        unit="mm"
        onChange={(v) => update('magnetDistanceMm', v)}
      />
      <SliderRow
        label="軸のずれ"
        value={config.axisOffsetMm}
        min={0}
        max={3}
        step={0.1}
        unit="mm"
        onChange={(v) => update('axisOffsetMm', v)}
      />

      <div className="flex flex-col gap-1 text-sm text-slate-700">
        <span>磁石の強さ</span>
        <div className="flex gap-2" role="group" aria-label="磁石の強さ">
          {MAGNET_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => update('magnetStrength', preset.value)}
              aria-pressed={config.magnetStrength === preset.value}
              className={`flex-1 rounded px-2 py-1 text-xs ${
                config.magnetStrength === preset.value
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1 text-sm text-slate-700">
        <span>電池</span>
        <div className="flex gap-2" role="group" aria-label="電池電圧">
          {BATTERY_OPTIONS.map((voltage) => (
            <button
              key={voltage}
              type="button"
              onClick={() => update('batteryVoltage', voltage)}
              aria-pressed={config.batteryVoltage === voltage}
              className={`flex-1 rounded px-2 py-1 text-xs ${
                config.batteryVoltage === voltage
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {voltage}V
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
