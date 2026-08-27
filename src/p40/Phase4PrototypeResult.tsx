// P4-0 G5: 二段リザルト。
//
// 第一段は勝敗・差・自己改善差だけ(2〜3秒、いつでも飛ばせる)。分析表・巻線・原因候補を
// 混ぜない。第二段で同期ゴースト・4区間差・巻線クローズアップを出す(UI計画§S4/§S5)。
//
// 表示は**観測事実に限る**。「右へ直すと速い」「偏りが原因」のような因果断定はしない——
// 原因を特定するのはプレイヤーの仕事であり、UIが言ってしまうと題材が消える。
import { useEffect, useRef } from 'react';
import { useRetroCanvasFrame } from '../components/useRetroCanvasFrame';
import { drawWindingTrace } from '../retro/winding/drawWindingTrace';
import { computeSectionSplits } from '../retro/race/phase4RaceGeometry';
import { PHASE4_SECTION_BOUNDARIES_M } from './scenario';
import { resolveFinishInfo, resolveSectionTimes, type Phase4RunResult } from './sessionRunner';
import { playerWon, type Phase4RaceOutcome } from './sessionReducer';
import type { WindingRecord } from '../materials/windingRecord';

/** 秒の表示。**未完走をnullのまま出す**——走り切っていないことを数値で埋めない。 */
function formatSeconds(value: number | null): string {
  return value === null ? '—' : value.toFixed(3);
}

/** 差の表示。符号を明示し、遅い側を勝手に丸めない。 */
function formatDiff(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(3)}`;
}

function diffSeconds(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

function sectionSplitsOf(run: Phase4RunResult): readonly (number | null)[] {
  return computeSectionSplits(resolveSectionTimes(run.trace, PHASE4_SECTION_BOUNDARIES_M, resolveFinishInfo(run)));
}

/**
 * 巻線クローズアップ。走行ビューと同じ480×270・整数拡大規律。
 *
 * **`drawWindingTrace`へ治具(jig)を渡さない**——ここは巻き終えた記録の観察であり、
 * 「いまの保持状態」は存在しない。既定値で中立位置の治具を描くと、実際には誰も
 * 操作していないのに操作中に見えてしまう。
 */
export function WindingCloseUp({ record, label }: { record: WindingRecord; label: string }) {
  const { containerRef, canvasRef, contentRes, scaleResult } = useRetroCanvasFrame();
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d') ?? null;
    if (context === null || !scaleResult.fits) return;
    context.imageSmoothingEnabled = false;
    drawWindingTrace(context, record, contentRes.w, contentRes.h); // jigは渡さない(上記コメント)
  }, [record, canvasRef, contentRes.w, contentRes.h, scaleResult.fits]);

  return (
    <div ref={containerRef} className="relative h-[480px] sm:h-[270px] overflow-hidden rounded-xl bg-slate-900">
      {!scaleResult.fits && (
        <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white">
          現在の画面では巻線ビュー(content {contentRes.w}×{contentRes.h})が等倍でも収まりません。
        </div>
      )}
      {scaleResult.fits && (
        <canvas ref={canvasRef} aria-label={label}
          style={{
            imageRendering: 'pixelated',
            width: `${scaleResult.contentWidthPx}px`,
            height: `${scaleResult.contentHeightPx}px`,
            position: 'absolute',
            left: `${scaleResult.offsetXPx}px`,
            top: `${scaleResult.offsetYPx}px`,
          }} />
      )}
    </div>
  );
}

/**
 * 第一段を表示する時間。この間は写真判定・勝敗・差だけを出し、経過後に自動で第二段へ進む
 * (UI計画§S4「2〜3秒」)。ボタンでいつでも即時に飛ばせる。
 */
export const CELEBRATION_DURATION_MS = 2500;

/**
 * 第一段。写真判定の静止画と、勝敗・相手との差・前走との差だけを出す。
 * 分析表・巻線・原因候補は混ぜない(§S4)。
 *
 * reduced motionでも**表示・時間・順序は同じ**——写真判定は元から静止画で、この段には
 * 動くものが無い。そのため`reducedMotion`を受け取らない(分岐が無いことを型で示す)。
 */
export function Phase4ResultCelebration({
  outcome,
  previousOutcome,
  onShowFacts,
  children,
}: {
  outcome: Phase4RaceOutcome;
  previousOutcome: Phase4RaceOutcome | null;
  onShowFacts: () => void;
  /** 写真判定の静止画。走行描画をここへ差し込む。 */
  children?: React.ReactNode;
}) {
  const won = playerWon(outcome);
  // 自動遷移は1回だけ。ボタンで先に飛ばした後にtimerが遅れて発火しても二重に進めない。
  const advancedRef = useRef(false);
  const onShowFactsRef = useRef(onShowFacts);
  useEffect(() => {
    onShowFactsRef.current = onShowFacts;
  }, [onShowFacts]);

  useEffect(() => {
    advancedRef.current = false;
    const id = window.setTimeout(() => {
      if (advancedRef.current) return;
      advancedRef.current = true;
      onShowFactsRef.current();
    }, CELEBRATION_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [outcome]);

  const skip = () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onShowFacts();
  };
  const vsRival = diffSeconds(outcome.player.finishTimeS, outcome.rival.finishTimeS);
  const vsPrevious = previousOutcome === null
    ? null
    : diffSeconds(outcome.player.finishTimeS, previousOutcome.player.finishTimeS);

  return (
    <section className="grid gap-3 rounded-xl bg-white p-5 shadow-sm" aria-label="結果">
      {/* 写真判定: finish時点の静止画。動かないので、reduced motionでも同じものを出す。 */}
      {children}
      {/* 勝敗は文字で出す。色だけに依存しない(§8)。 */}
      <p className="text-2xl font-black">{won ? '勝ち' : '負け'}</p>
      <p className="text-sm">
        自分のタイム <span className="font-black tabular-nums">{formatSeconds(outcome.player.finishTimeS)}</span> 秒
      </p>
      <p className="text-sm">
        相手との差 <span className="font-black tabular-nums">{formatDiff(vsRival)}</span> 秒
      </p>
      {/* 初走では前走が無いため常設ノードのまま「—」を出す(条件でノードごと消さない)。 */}
      <p className="text-sm">
        前の走行との差 <span className="font-black tabular-nums">{formatDiff(vsPrevious)}</span> 秒
      </p>
      <button type="button" onClick={skip}
        className="min-h-[44px] rounded-xl bg-sky-700 px-4 py-2 font-black text-white">
        くわしく見る
      </button>
    </section>
  );
}

/** 1走分の生データ。差分の色分け・勝敗語・原因断定はしない。 */
function RunDataTable({ label, run }: { label: string; run: Phase4RunResult }) {
  return (
    <div className="grid content-start gap-1">
      <p className="text-sm font-black">{label}</p>
      <p className="text-sm">完走タイム <span className="font-black tabular-nums">{formatSeconds(run.finishTimeS)}</span> 秒</p>
      <p className="text-sm">到達距離 <span className="font-black tabular-nums">{run.positionM.toFixed(3)}</span> メートル</p>
      <p className="text-sm">コイル崩壊 <span className="font-black">{run.coilCollapsed ? 'あり' : 'なし'}</span></p>
      <p className="text-sm">短絡 <span className="font-black">{run.shorted ? 'あり' : 'なし'}</span></p>
      <p className="text-sm">実効巻数比 <span className="font-black tabular-nums">{run.aggregate.effectiveTurnsRatio.toFixed(4)}</span></p>
      <p className="text-sm">軸ずれ <span className="font-black tabular-nums">{run.motorConfig.axisOffsetMm.toFixed(3)}</span> ミリメートル</p>
    </div>
  );
}

/**
 * 第二段。区間差は**4区間固定**(汎用N区間editorは作らない)。
 * ゴーストの再生は`replayKey`を増やして親が同じcomponentを作り直す形で行い、
 * 停止・シーク・任意速度のplayerは作らない(§S5)。
 */
export function Phase4ResultFacts({
  outcome,
  record,
  onReplay,
  children,
}: {
  outcome: Phase4RaceOutcome;
  record: WindingRecord;
  onReplay: () => void;
  children?: React.ReactNode;
}) {
  const playerSplits = sectionSplitsOf(outcome.player);
  const rivalSplits = sectionSplitsOf(outcome.rival);

  return (
    <section className="grid gap-4" aria-label="くわしい結果">
      <div className="grid gap-2 rounded-xl bg-white p-4 shadow-sm">
        <h3 className="text-sm font-black">同期ゴースト</h3>
        {children}
        <button type="button" onClick={onReplay}
          className="min-h-[44px] rounded-xl bg-slate-700 px-4 py-2 font-black text-white">
          もう一度見る
        </button>
      </div>

      <div className="grid gap-2 rounded-xl bg-white p-4 shadow-sm">
        <h3 className="text-sm font-black">区間ごとの所要時間</h3>
        <table className="text-sm">
          <thead>
            <tr>
              <th scope="col" className="pr-3 text-left font-normal text-slate-600">区間</th>
              <th scope="col" className="pr-3 text-right font-normal text-slate-600">自分(秒)</th>
              <th scope="col" className="pr-3 text-right font-normal text-slate-600">相手(秒)</th>
              <th scope="col" className="text-right font-normal text-slate-600">差(秒)</th>
            </tr>
          </thead>
          <tbody>
            {PHASE4_SECTION_BOUNDARIES_M.map((boundary, index) => {
              const from = index === 0 ? 0 : PHASE4_SECTION_BOUNDARIES_M[index - 1];
              return (
                <tr key={boundary}>
                  <th scope="row" className="pr-3 text-left font-normal tabular-nums">
                    第{index + 1}区間({from.toFixed(1)}〜{boundary.toFixed(1)} メートル)
                  </th>
                  <td className="pr-3 text-right font-black tabular-nums">{formatSeconds(playerSplits[index] ?? null)}</td>
                  <td className="pr-3 text-right font-black tabular-nums">{formatSeconds(rivalSplits[index] ?? null)}</td>
                  <td className="text-right font-black tabular-nums">
                    {formatDiff(diffSeconds(playerSplits[index] ?? null, rivalSplits[index] ?? null))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-slate-600">差は正が自分の遅れ、負が自分の速さです。</p>
      </div>

      <div className="grid gap-2 rounded-xl bg-white p-4 shadow-sm">
        <h3 className="text-sm font-black">この走行の巻線</h3>
        <WindingCloseUp record={record} label="この走行に使った巻線の軌跡" />
        {/* 凡例。良否・原因・推奨は書かず、tension→足の開きの生対応だけを述べる。 */}
        <p className="text-sm">見方: 細く立つ軌跡は高い張力、広く寝る軌跡は低い張力の記録です。</p>
      </div>

      <div className="grid gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-2">
        <RunDataTable label="自分" run={outcome.player} />
        <RunDataTable label="相手" run={outcome.rival} />
      </div>
    </section>
  );
}
