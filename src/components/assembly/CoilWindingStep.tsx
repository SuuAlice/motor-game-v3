import type { AssemblyStepProps } from '../../modes/AssemblyMode';
import { useDragAccumulator } from './useDragAccumulator';
import { computeMaxTurns } from '../../engine/motorPhysics';
import { PresetButtons, SliderRow } from '../ParamPanel';

// spec docs/spec.md §2手順1: 「釘にエナメル線を巻く(ドラッグ/連打で巻き数が増える。
// 50〜100回が適正)」
const MIN_TURNS = 10;
const GOOD_MIN = 50;
const GOOD_MAX = 100;
const PX_PER_TURN = 8; // ドラッグ8pxごとに1回巻く
const CLICK_INCREMENT = 5; // 「+」ボタン1クリックあたりの巻き数(キーボード操作の代替)

export function CoilWindingStep({ draft, setDraft }: AssemblyStepProps) {
  const wireGaugeMm = draft.wireGaugeMm ?? 0.4;
  const parallelStrands = draft.parallelStrands ?? 1;
  const maxTurns = computeMaxTurns(wireGaugeMm, parallelStrands);

  function addTurns(amount: number) {
    setDraft((prev) => ({
      ...prev,
      coilTurns: Math.min(maxTurns, Math.max(MIN_TURNS, prev.coilTurns + amount)),
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
        線径と並列本数を決め、釘にエナメル線を巻く。太線・並列巻きほど巻き数上限が下がる。
      </p>
      <div className="grid w-full gap-3">
        <SliderRow label="線径" value={wireGaugeMm} min={0.2} max={0.8} step={0.1} unit="mm" onChange={(value) => setDraft((prev) => {
          const nextMax = computeMaxTurns(value, prev.parallelStrands ?? 1);
          return { ...prev, wireGaugeMm: value, coilTurns: Math.min(prev.coilTurns, nextMax) };
        })} />
        <PresetButtons label="並列巻き" options={[{ label: 'シングル（1本）', value: 1 }, { label: 'ダブル（2本）', value: 2 }]} value={parallelStrands} onChange={(value) => setDraft((prev) => {
          const strands = value as 1 | 2;
          const nextMax = computeMaxTurns(prev.wireGaugeMm ?? 0.4, strands);
          return { ...prev, parallelStrands: strands, coilTurns: Math.min(prev.coilTurns, nextMax) };
        })} />
      </div>
      <div
        {...dragHandlers}
        role="slider"
        aria-label="コイル巻き数"
        aria-valuemin={MIN_TURNS}
        aria-valuemax={maxTurns}
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
          目安: {GOOD_MIN}〜{Math.min(GOOD_MAX, maxTurns)}回 / 物理上限: {maxTurns}回
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
