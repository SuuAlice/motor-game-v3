import { useGameStore } from '../store/gameStore';
import {
  computeB,
  computeContactResistance,
  computeJ,
  computeMaxTurns,
  computeRCoil,
  type MotorConfig,
} from '../engine/motorPhysics';
import { BATTERY_PRESETS, MAGNET_PRESETS } from '../data/parameterPresets';

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
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1">
          {label}
          {locked && (
            <span aria-hidden="true" title="このチャレンジでは固定されています">
              🔒
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 tabular-nums text-slate-500">
          <input
            type="number"
            aria-label={`${label}の数値`}
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={locked}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
            }}
            className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-right disabled:bg-slate-100"
          />
          <span>{unit}</span>
          {locked && <span>(固定)</span>}
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
  options: readonly PresetOption<T>[];
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

  const wireGaugeMm = config.wireGaugeMm ?? 0.4;
  const parallelStrands = config.parallelStrands ?? 1;
  const physicalMaxTurns = computeMaxTurns(wireGaugeMm, parallelStrands);
  const [coilTurnsMin, configuredCoilTurnsMax] = rangeFor('coilTurns', 10, 150);
  const coilTurnsMax = Math.min(configuredCoilTurnsMax, physicalMaxTurns);
  const [slitWidthMmMin, slitWidthMmMax] = rangeFor('slitWidthMm', 0, 5);
  const [sandingQualityMin, sandingQualityMax] = rangeFor('sandingQuality', 0, 1);
  const [brushPressureMin, brushPressureMax] = rangeFor('brushPressure', 0, 1);
  const [magnetDistanceMmMin, magnetDistanceMmMax] = rangeFor('magnetDistanceMm', 2, 30);
  const [axisOffsetMmMin, axisOffsetMmMax] = rangeFor('axisOffsetMm', 0, 3);
  const magnetOptions = MAGNET_PRESETS.map((preset) => ({
    ...preset,
    label: `${preset.label} ${computeB(preset.value, config.magnetDistanceMm).toFixed(3)} T`,
  }));
  const derivedValues = [
    ['コイル抵抗', computeRCoil(config).toFixed(3), 'Ω'],
    ['接触抵抗（推定）', computeContactResistance(config).toFixed(3), 'Ω'],
    ['慣性モーメント', computeJ(config).toExponential(3), 'kg·m²'],
    ['巻き数上限', String(physicalMaxTurns), '回'],
    ['巻き数残量', String(Math.max(0, physicalMaxTurns - config.coilTurns)), '回'],
  ] as const;

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
        label="線径"
        value={wireGaugeMm}
        min={0.2}
        max={0.8}
        step={0.1}
        unit="mm"
        locked={isLocked('wireGaugeMm')}
        onChange={(v) => update('wireGaugeMm', v)}
      />
      <PresetButtons
        label="並列巻き"
        options={[
          { label: 'シングル（1本）', value: 1 },
          { label: 'ダブル（2本）', value: 2 },
        ]}
        value={parallelStrands}
        locked={isLocked('parallelStrands')}
        onChange={(v) => update('parallelStrands', v as 1 | 2)}
      />
      <PresetButtons
        label="ワニス固め"
        options={[
          { label: 'あり', value: 'yes' },
          { label: 'なし', value: 'no' },
        ]}
        value={(config.varnished ?? true) ? 'yes' : 'no'}
        locked={isLocked('varnished')}
        onChange={(v) => update('varnished', v === 'yes')}
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
        unit="比"
        locked={isLocked('sandingQuality')}
        onChange={(v) => update('sandingQuality', v)}
      />
      <SliderRow
        label="ブラシ圧"
        value={config.brushPressure}
        min={brushPressureMin}
        max={brushPressureMax}
        step={0.01}
        unit="比"
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
        options={magnetOptions}
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

      <section className="rounded-lg bg-slate-100 p-3" aria-labelledby="derived-values-title">
        <h3 id="derived-values-title" className="text-sm font-bold text-slate-700">導出量</h3>
        <dl className="mt-2 grid gap-1 text-xs text-slate-600">
          {derivedValues.map(([label, value, unit]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt>{label}</dt>
              <dd className="tabular-nums text-slate-800">{value} {unit}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
