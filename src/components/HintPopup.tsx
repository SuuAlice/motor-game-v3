import { useEffect, useRef, useState } from 'react';
import type { FailureDiagnosis } from '../engine/failures';

interface HintPopupProps {
  // engine/failures.tsの診断結果のうち、最優先の1件(ない場合はnull)。
  // diagnoseFailures自体はChallengeMode側で呼び出し、結果だけをここに渡す。
  diagnosis: FailureDiagnosis | null;
}

// spec docs/spec.md §4: 「失敗時は原因のヒントを段階表示(すぐ答えを出さない。
// 「電池が熱いよ…?」→「整流子を見てみよう」)」
export function HintPopup({ diagnosis }: HintPopupProps) {
  const [stage, setStage] = useState<1 | 2>(1);
  const prevCategoryRef = useRef<string | null>(null);

  useEffect(() => {
    const category = diagnosis?.category ?? null;
    if (category !== prevCategoryRef.current) {
      setStage(1);
      prevCategoryRef.current = category;
    }
  }, [diagnosis?.category]);

  if (!diagnosis) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <p className="flex items-center gap-1 font-bold">
        <span aria-hidden="true">💡</span>
        <span>{diagnosis.symptom}</span>
      </p>
      <p className="mt-1">{stage === 1 ? diagnosis.hintStage1 : diagnosis.hintStage2}</p>
      {stage === 1 && (
        <button
          type="button"
          onClick={() => setStage(2)}
          className="mt-2 rounded bg-amber-200 px-2 py-1 text-xs font-bold text-amber-900"
        >
          もっとヒントを見る
        </button>
      )}
    </div>
  );
}
