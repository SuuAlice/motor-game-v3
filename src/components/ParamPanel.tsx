import { useGameStore } from '../store/gameStore';
import type { MotorConfig } from '../engine/motorPhysics';

export interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  locked?: boolean;
  onChange: (value: number) => void;
}

// spec §9アクセシビリティ: ロック状態も色だけに頼らず🔒アイコン+「(固定)」で示す
// AssemblyMode(組み立てモード)のスリット調整工程でも再利用する
export function SliderRow({ label, value, min, max, step, unit, locked, onChange }: SliderRowProps) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${locked ? 'text-slate-400' : 'text-slate-700'}`}>
      <span className="flex justify-between">
        <span className="flex items-center gap-1">
          {label}
          {locked && (
            <span aria-hidden="true" title="このチャレンジでは固定されています">
              🔒
            </span>
          )}
        </span>
        <span className="tabular-nums text-slate-500">
          {value.toFixed(step < 1 ? 2 : 0)}
          {unit}
          {locked && '(固定)'}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={locked}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-600 disabled:accent-slate-300"
      />
    </label>
  );
}

export interface PresetOption<T extends string | number> {
  label: string;
  value: T;
}

export interface PresetButtonsProps<T extends string | number> {
  label: string;
  options: PresetOption<T>[];
  value: T;
  locked?: boolean;
  onChange: (value: T) => void;
}

// spec §9アクセシビリティ: ロック状態も色だけに頼らず🔒アイコンで示す。
// AssemblyMode(組み立てモード)の台座作り・組み立て工程でも再利用する
export function PresetButtons<T extends string | number>({
  label,
  options,
  value,
  locked,
  onChange,
}: PresetButtonsProps<T>) {
  return (
    <div className={`flex flex-col gap-1 text-sm ${locked ? 'text-slate-400' : 'text-slate-700'}`}>
      <span className="flex items-center gap-1">
        {label}
        {locked && <span aria-hidden="true">🔒</span>}
      </span>
      <div className="flex gap-2" role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            disabled={locked}
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={`flex-1 rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
              value === opt.value ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// spec §3.7.1: 「弱/中/強」ボタンはmagnetStrength(0–1連続値)の代表値プリセット
export const MAGNET_PRESETS: PresetOption<number>[] = [
  { label: '弱(フェライト)', value: 0.2 },
  { label: '中', value: 0.5 },
  { label: '強(ネオジム)', value: 0.9 },
];

export const BATTERY_PRESETS: PresetOption<1.5 | 3.0>[] = [
  { label: '1.5V', value: 1.5 },
  { label: '3V', value: 3.0 },
];

export function ParamPanel() {
  const config = useGameStore((s) => s.config);
  const setConfig = useGameStore((s) => s.setConfig);
  const lockedKeys = useGameStore((s) => s.lockedKeys);
  const paramRanges = useGameStore((s) => s.paramRanges);

  function update<K extends keyof MotorConfig>(key: K, value: MotorConfig[K]) {
    setConfig({ [key]: value } as Partial<MotorConfig>);
  }

  const isLocked = (key: keyof MotorConfig) => lockedKeys.has(key);
  // チャレンジのparamRangesがあればスライダー自体の可動域をそちらに合わせる
  // (範囲外へドラッグできないようにする。store側のクランプは二重防御)
  function rangeFor(key: keyof MotorConfig, defaultMin: number, defaultMax: number): [number, number] {
    return paramRanges[key] ?? [defaultMin, defaultMax];
  }

  const [coilTurnsMin, coilTurnsMax] = rangeFor('coilTurns', 10, 150);
  const [slitWidthMmMin, slitWidthMmMax] = rangeFor('slitWidthMm', 0, 5);
  const [sandingQualityMin, sandingQualityMax] = rangeFor('sandingQuality', 0, 1);
  const [brushPressureMin, brushPressureMax] = rangeFor('brushPressure', 0, 1);
  const [magnetDistanceMmMin, magnetDistanceMmMax] = rangeFor('magnetDistanceMm', 5, 30);
  const [axisOffsetMmMin, axisOffsetMmMax] = rangeFor('axisOffsetMm', 0, 3);

  return (
    <div className="grid gap-3 rounded-lg bg-white p-4 shadow-sm">
      <SliderRow
        label="巻き数"
        value={config.coilTurns}
        min={coilTurnsMin}
        max={coilTurnsMax}
        step={1}
        unit="回"
        locked={isLocked('coilTurns')}
        onChange={(v) => update('coilTurns', v)}
      />
      <SliderRow
        label="スリット幅"
        value={config.slitWidthMm}
        min={slitWidthMmMin}
        max={slitWidthMmMax}
        step={0.1}
        unit="mm"
        locked={isLocked('slitWidthMm')}
        onChange={(v) => update('slitWidthMm', v)}
      />
      <SliderRow
        label="削り具合"
        value={config.sandingQuality}
        min={sandingQualityMin}
        max={sandingQualityMax}
        step={0.01}
        locked={isLocked('sandingQuality')}
        onChange={(v) => update('sandingQuality', v)}
      />
      <SliderRow
        label="ブラシ圧"
        value={config.brushPressure}
        min={brushPressureMin}
        max={brushPressureMax}
        step={0.01}
        locked={isLocked('brushPressure')}
        onChange={(v) => update('brushPressure', v)}
      />
      <SliderRow
        label="磁石との距離"
        value={config.magnetDistanceMm}
        min={magnetDistanceMmMin}
        max={magnetDistanceMmMax}
        step={1}
        unit="mm"
        locked={isLocked('magnetDistanceMm')}
        onChange={(v) => update('magnetDistanceMm', v)}
      />
      <SliderRow
        label="軸のずれ"
        value={config.axisOffsetMm}
        min={axisOffsetMmMin}
        max={axisOffsetMmMax}
        step={0.1}
        unit="mm"
        locked={isLocked('axisOffsetMm')}
        onChange={(v) => update('axisOffsetMm', v)}
      />

      <PresetButtons
        label="磁石の強さ"
        options={MAGNET_PRESETS}
        value={config.magnetStrength}
        locked={isLocked('magnetStrength')}
        onChange={(v) => update('magnetStrength', v)}
      />

      <PresetButtons
        label="電池"
        options={BATTERY_PRESETS}
        value={config.batteryVoltage}
        locked={isLocked('batteryVoltage')}
        onChange={(v) => update('batteryVoltage', v)}
      />
    </div>
  );
}
