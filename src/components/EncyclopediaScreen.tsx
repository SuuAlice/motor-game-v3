// P3-4 G7(UI計画§3.2・§11.3、人間承認2026-08-20): 失敗図鑑(D0x一覧)と検死レポート。
// 表示判断はすべて`encyclopediaView.ts`のmodule-level純関数へ委ね、本コンポーネントは
// その結果を並べるだけにする(Reactレンダリングなしでテスト固定するため)。
//
// 契約(§3.2):
// - 一覧は**D01〜D07・D09の8マス固定**。D08はPhase 5の(e)拡張後であり一覧に含めない
// - **未発見はシルエット**——モードIDを伏せ、発見情報・構成情報・原因情報を出さない
// - `recipeKey`は内部識別子であり**画面に出さない**(§3.5)
// - legacy record(P3-4以前の発見)は「劣化なし」と断定せず中立文言(§10.4)
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useSaveStore } from '../store/saveStore';
import {
  buildCodexCells, formatDegradationDiff, formatCauseLogLines, describeRunContext,
  formatModeSpecificCauseLines, shouldShowFirstDiscoveryReward,
} from './encyclopediaView';

export function EncyclopediaScreen({ onOpenNotebook }: { onOpenNotebook?: () => void } = {}) {
  const setMode = useGameStore((state) => state.setMode);
  const codexRecords = useSaveStore((state) => state.encyclopedia.codexRecords);
  // 報酬表示の判定に使う(§3.2の5: 初回発見時のみ表示する)。
  const lastAppliedRunSequence = useSaveStore((state) => state.saveMeta.lastAppliedRunSequence);
  const cells = buildCodexCells(codexRecords);
  const [selectedModeId, setSelectedModeId] = useState<string | null>(null);
  const selected = cells.find((cell) => cell.kind === 'discovered' && cell.modeId === selectedModeId);

  return (
    <section className="rounded-2xl bg-slate-900 p-5 text-slate-100">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black">失敗図鑑</h2>
          <p className="mt-2 text-sm text-slate-300">壊れ方を見つけるたびに記録が増えます。</p>
        </div>
        <button type="button" onClick={() => setMode('garage')} className="min-h-[44px] rounded-xl bg-slate-700 px-4 py-2 font-black">
          ガレージへ戻る
        </button>
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map((cell, index) => (
          <li key={cell.kind === 'discovered' ? cell.modeId : `silhouette-${index}`}>
            {cell.kind === 'silhouette' ? (
              <div className="rounded-xl bg-slate-800 p-4 text-center text-slate-500">
                <span className="text-2xl" aria-hidden="true">？</span>
                <p className="mt-1 text-sm">{cell.heading}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedModeId(cell.modeId)}
                aria-pressed={selectedModeId === cell.modeId}
                className="min-h-[44px] w-full rounded-xl bg-rose-900 p-4 text-left font-bold"
              >
                {cell.heading}
              </button>
            )}
          </li>
        ))}
      </ul>

      {selected?.kind === 'discovered' && (
        <article className="mt-5 rounded-xl bg-slate-800 p-4">
          <h3 className="text-xl font-black">{selected.heading}</h3>
          <p className="mt-1 text-xs text-slate-400">
            初回発見: {selected.record.firstDiscoveredAtRunSequence} 回目の走行 / 走行文脈:{' '}
            {describeRunContext(selected.record.replaySnapshot)}
          </p>

          <h4 className="mt-3 text-sm font-bold text-slate-200">そのとき観測された値</h4>
          {selected.record.discoveryEvent.kind === 'unrecorded' ? (
            <p className="mt-1 text-sm text-slate-400">{selected.record.discoveryEvent.note}</p>
          ) : (
            <ul className="mt-1 grid gap-1 text-sm text-slate-300">
              {[
                ...formatCauseLogLines(
                  selected.record.discoveryEvent.value.causeLog as unknown as Record<string, unknown>,
                ),
                // モード固有値(D04の延焼部位、D05の理論電流、D06の負荷トルク等)。
                ...formatModeSpecificCauseLines(selected.record.discoveryEvent.value),
              ].map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}

          {shouldShowFirstDiscoveryReward(selected.record, lastAppliedRunSequence) && (
            <p className="mt-3 rounded-lg bg-emerald-900 p-2 text-sm">
              初回発見の報酬は付与済みです。
            </p>
          )}

          <button
            type="button"
            // 既存のutilityPageは**背後のmodeを保持したまま**開閉する設計。ここでmodeを
            // 変えると、ノートを閉じたあと図鑑ではなく別画面へ戻る副作用が生じる。
            onClick={() => onOpenNotebook?.()}
            className="mt-3 min-h-[44px] text-sm underline"
          >
            実験ノートを開く
          </button>

          <h4 className="mt-3 text-sm font-bold text-slate-200">この走行で進んだ劣化</h4>
          {selected.record.runDegradationDiffs.kind === 'unrecorded' ? (
            <p className="mt-1 text-sm text-slate-400">{selected.record.runDegradationDiffs.note}</p>
          ) : selected.record.runDegradationDiffs.value.length === 0 ? (
            <p className="mt-1 text-sm text-slate-300">この走行では劣化の記録はありません。</p>
          ) : (
            <ul className="mt-1 grid gap-1 text-sm text-slate-300">
              {selected.record.runDegradationDiffs.value.map((diff, index) => (
                <li key={`${diff.role}-${diff.kind}-${index}`}>{formatDegradationDiff(diff)}</li>
              ))}
            </ul>
          )}
        </article>
      )}
    </section>
  );
}
