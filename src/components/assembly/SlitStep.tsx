import type { AssemblyStepProps } from '../../modes/AssemblyMode';
import { SliderRow } from '../ParamPanel';

// spec docs/spec.md §2手順3: 「2本の線をダンボールに巻き、すき間(スリット)を
// 1〜2mmあけて配置(スライダー操作。0mm=ショート)」
export function SlitStep({ draft, setDraft }: AssemblyStepProps) {
  const isShorted = draft.slitWidthMm <= 0;

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">
        整流子の2本の線の間にすき間をあけよう。くっついたままだとショートするよ。
      </p>
      <div className="w-full">
        <SliderRow
          label="スリット幅"
          value={draft.slitWidthMm}
          min={0}
          max={5}
          step={0.1}
          unit="mm"
          onChange={(v) => setDraft((prev) => ({ ...prev, slitWidthMm: v }))}
        />
      </div>
      {isShorted && (
        <div className="flex items-center gap-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-bold text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>すき間が0だとショートしちゃうよ!</span>
        </div>
      )}
    </div>
  );
}
