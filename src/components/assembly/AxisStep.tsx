import type { AssemblyStepProps } from '../../modes/AssemblyMode';
import { SliderRow } from '../ParamPanel';

// spec docs/spec.md §2手順2: 「爪楊枝と釘を十字に配置してテープ留め
// (位置ずれ=回転バランス悪化)」
export function AxisStep({ draft, setDraft }: AssemblyStepProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">
        爪楊枝と釘を十字に組んでテープで留めよう。中心がずれると高速回転でガタつくよ。
      </p>
      <div className="w-full">
        <SliderRow
          label="軸のずれ"
          value={draft.axisOffsetMm}
          min={0}
          max={3}
          step={0.1}
          unit="mm"
          onChange={(v) => setDraft((prev) => ({ ...prev, axisOffsetMm: v }))}
        />
      </div>
    </div>
  );
}
