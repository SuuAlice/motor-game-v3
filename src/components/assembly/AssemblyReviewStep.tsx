import type { AssemblyStepProps } from '../../modes/AssemblyMode';
import { PresetButtons, SliderRow, MAGNET_PRESETS, BATTERY_PRESETS } from '../ParamPanel';

// spec docs/spec.md §2手順5: 「軸受けに軸を乗せ、磁石を釘の下に置き、電池を接続」
export function AssemblyReviewStep({ draft, setDraft }: AssemblyStepProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">
        軸受けに軸を乗せ、磁石を釘の下に置いて、電池をつなごう。
      </p>

      <PresetButtons
        label="磁石の強さ"
        options={MAGNET_PRESETS}
        value={draft.magnetStrength}
        onChange={(v) => setDraft((prev) => ({ ...prev, magnetStrength: v }))}
      />
      <SliderRow
        label="磁石との距離"
        value={draft.magnetDistanceMm}
        min={5}
        max={30}
        step={1}
        unit="mm"
        onChange={(v) => setDraft((prev) => ({ ...prev, magnetDistanceMm: v }))}
      />
      <PresetButtons
        label="電池"
        options={BATTERY_PRESETS}
        value={draft.batteryVoltage}
        onChange={(v) => setDraft((prev) => ({ ...prev, batteryVoltage: v }))}
      />

      <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        <p className="mb-1 font-bold text-slate-700">できあがったモーター</p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
          <li>巻き数: {draft.coilTurns}回</li>
          <li>スリット幅: {draft.slitWidthMm.toFixed(1)}mm</li>
          <li>削り具合: {Math.round(draft.sandingQuality * 100)}%</li>
          <li>ブラシ圧: {draft.brushPressure.toFixed(2)}</li>
          <li>磁石の強さ: {draft.magnetStrength.toFixed(2)}</li>
          <li>磁石との距離: {draft.magnetDistanceMm}mm</li>
          <li>電池: {draft.batteryVoltage}V</li>
          <li>軸のずれ: {draft.axisOffsetMm.toFixed(1)}mm</li>
        </ul>
      </div>
    </div>
  );
}
