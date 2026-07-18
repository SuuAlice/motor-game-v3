import type { AssemblyStepProps } from '../../modes/AssemblyMode';
import { PresetButtons, type PresetOption } from '../ParamPanel';

// spec docs/spec.md §2手順4: 「クリップ2本をU字軸受けに、2本をブラシに曲げる
// (プリセット選択でよい)」。押し付け具合(brushPressure)を3段階プリセットにする
const BRUSH_PRESETS: PresetOption<number>[] = [
  { label: '弱め', value: 0.15 },
  { label: 'ふつう', value: 0.3 },
  { label: '強め', value: 0.6 },
];

export function ClipStep({ draft, setDraft }: AssemblyStepProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">
        クリップを曲げてU字の軸受けとブラシを作ろう。ブラシは押し付け具合が大事だよ。
      </p>
      <div className="w-full">
        <PresetButtons
          label="ブラシの押し付け具合"
          options={BRUSH_PRESETS}
          value={draft.brushPressure}
          onChange={(v) => setDraft((prev) => ({ ...prev, brushPressure: v }))}
        />
      </div>
    </div>
  );
}
