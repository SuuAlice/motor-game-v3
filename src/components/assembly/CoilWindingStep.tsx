import type { AssemblyStepProps } from '../../modes/AssemblyMode';
import { useDragAccumulator } from './useDragAccumulator';

// spec docs/spec.md §2手順1: 「釘にエナメル線を巻く(ドラッグ/連打で巻き数が増える。
// 50〜100回が適正)」
const MIN_TURNS = 10;
const MAX_TURNS = 150;
const GOOD_MIN = 50;
const GOOD_MAX = 100;
const PX_PER_TURN = 8; // ドラッグ8pxごとに1回巻く
const CLICK_INCREMENT = 5; // 「+」ボタン1クリックあたりの巻き数(キーボード操作の代替)

export function CoilWindingStep({ draft, setDraft }: AssemblyStepProps) {
  function addTurns(amount: number) {
    setDraft((prev) => ({
      ...prev,
      coilTurns: Math.min(MAX_TURNS, Math.max(MIN_TURNS, prev.coilTurns + amount)),
    }));
  }

  const dragHandlers = useDragAccumulator((distancePx) => {
    const turns = distancePx / PX_PER_TURN;
    if (turns >= 1) addTurns(Math.floor(turns));
  });

  const isGood = draft.coilTurns >= GOOD_MIN && draft.coilTurns <= GOOD_MAX;

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">
        釘にエナメル線を巻きつけよう。下のエリアを指でこすると巻き数が増えるよ。
      </p>
      <div
        {...dragHandlers}
        role="slider"
        aria-label="コイル巻き数"
        aria-valuemin={MIN_TURNS}
        aria-valuemax={MAX_TURNS}
        aria-valuenow={draft.coilTurns}
        className="flex h-32 w-full touch-none select-none items-center justify-center rounded-lg bg-amber-100 text-amber-700 active:bg-amber-200"
      >
        <span aria-hidden="true" className="text-sm">
          ここをドラッグ↔
        </span>
      </div>

      <div className="text-3xl font-bold tabular-nums text-slate-800">{draft.coilTurns}回</div>

      <div className={`flex items-center gap-1 text-sm font-bold ${isGood ? 'text-emerald-600' : 'text-slate-400'}`}>
        {isGood && <span aria-hidden="true">✅</span>}
        <span>
          適正範囲: {GOOD_MIN}〜{GOOD_MAX}回
        </span>
      </div>

      <button
        type="button"
        onClick={() => addTurns(CLICK_INCREMENT)}
        className="rounded-lg bg-amber-600 px-6 py-2 font-bold text-white"
      >
        +{CLICK_INCREMENT}回 巻く
      </button>
    </div>
  );
}
