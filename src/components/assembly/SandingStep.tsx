import type { AssemblyStepProps } from '../../modes/AssemblyMode';
import { useDragAccumulator } from './useDragAccumulator';

// spec docs/spec.md §2手順3: 「線の両端を紙やすりで削る(こすり操作。削り残し=接触不良)」
const MIN_QUALITY = 0;
const MAX_QUALITY = 1;
const GOOD_MIN = 0.7; // engine/failures.tsのSANDING_RESIDUE_THRESHOLD(0.5)より少し余裕を持たせた目安
const PX_PER_FULL = 400; // 400pxこすると削り具合が0→1まで到達する
const CLICK_INCREMENT = 0.15; // 「しっかり削る」ボタン1クリックあたりの増分(キーボード操作の代替)

export function SandingStep({ draft, setDraft }: AssemblyStepProps) {
  function addQuality(amount: number) {
    setDraft((prev) => ({
      ...prev,
      sandingQuality: Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, prev.sandingQuality + amount)),
    }));
  }

  const dragHandlers = useDragAccumulator((distancePx) => {
    addQuality(distancePx / PX_PER_FULL);
  });

  const isGood = draft.sandingQuality >= GOOD_MIN;

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">
        エナメル線の両端を紙やすりで削ろう。雑にやると後で接触不良になるよ。
      </p>
      <div
        {...dragHandlers}
        role="slider"
        aria-label="削り具合"
        aria-valuemin={MIN_QUALITY}
        aria-valuemax={MAX_QUALITY}
        aria-valuenow={draft.sandingQuality}
        className="flex h-32 w-full touch-none select-none items-center justify-center rounded-lg bg-stone-200 text-stone-600 active:bg-stone-300"
      >
        <span aria-hidden="true" className="text-sm">
          ここをこする↔
        </span>
      </div>

      <div className="text-3xl font-bold tabular-nums text-slate-800">
        {Math.round(draft.sandingQuality * 100)}%
      </div>

      <div className={`flex items-center gap-1 text-sm font-bold ${isGood ? 'text-emerald-600' : 'text-slate-400'}`}>
        {isGood && <span aria-hidden="true">✅</span>}
        <span>目安: {Math.round(GOOD_MIN * 100)}%以上</span>
      </div>

      <button
        type="button"
        onClick={() => addQuality(CLICK_INCREMENT)}
        className="rounded-lg bg-stone-600 px-6 py-2 font-bold text-white"
      >
        しっかり削る
      </button>
    </div>
  );
}
