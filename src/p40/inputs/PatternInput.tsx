// P4-0 G2 案III(パターン設計+自動実行): 先に流れを作り、実行で一気に展開する。
//
// **純関数・型・定数は`inputCommands.ts`にある。**
// 固定4制御点のみ。追加・削除・並べ替え・undo・presetは作らない(G2の比較最小)。
// 展開後の一区間手動置換はG2では実装しない(選定案だけを磨く後半で扱う)。
import { useState } from 'react';
import type { WindingArm } from '../../materials/windingRecord';
import {
  DEFAULT_PATTERN,
  expandPatternToCommands,
  type PatternDesign,
  type PatternPoint,
  type PatternSegment,
  type WindingCommand,
  type WindingInputProps,
} from './inputCommands';

const ARM_LABEL: Record<WindingArm, string> = { left: '左腕', right: '右腕', straddle: '中央またぎ' };

export function PatternInput(props: WindingInputProps & { readonly onExpand: (commands: readonly WindingCommand[]) => void }) {
  const [design, setDesign] = useState<PatternDesign>(DEFAULT_PATTERN);
  const disabled = props.disabledReason !== null;
  const remaining = props.maxTurns - props.turnCount;

  const updatePoint = (index: number, partial: Partial<PatternPoint>) => {
    setDesign((prev) => ({
      ...prev,
      points: prev.points.map((point, i) => (i === index ? { ...point, ...partial } : point)),
    }));
  };
  const updateSegment = (index: number, partial: Partial<PatternSegment>) => {
    setDesign((prev) => ({
      ...prev,
      segments: prev.segments.map((segment, i) => (i === index ? { ...segment, ...partial } : segment)),
    }));
  };

  return (
    <div className="grid gap-3">
      <p className="text-xs text-slate-500">
        4つの制御点で流れを作り、実行すると残り{remaining}ターンへ展開します。追加・削除・取り消しはありません。
      </p>
      {design.points.map((point, index) => (
        <div key={index} className="grid gap-1 rounded-lg border border-slate-200 p-2">
          <p className="text-sm font-bold">制御点 {index + 1}</p>
          <label className="grid gap-1 text-sm">
            <span>位置 {Math.round(point.position * 100)} %</span>
            <input type="range" min={0} max={1} step={1 / 256} value={point.position} disabled={disabled}
              aria-label={`制御点${index + 1}の位置`}
              onChange={(event) => updatePoint(index, { position: Number(event.target.value) })} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>張力 {Math.round(point.tension * 100)} %</span>
            <input type="range" min={0} max={1} step={1 / 256} value={point.tension} disabled={disabled}
              aria-label={`制御点${index + 1}の張力`}
              onChange={(event) => updatePoint(index, { tension: Number(event.target.value) })} />
          </label>
        </div>
      ))}
      {design.segments.map((segment, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
          <span className="font-bold">区間 {index + 1}</span>
          <label className="flex items-center gap-1">
            <span>腕</span>
            <select value={segment.arm} disabled={disabled} aria-label={`区間${index + 1}の腕`}
              onChange={(event) => updateSegment(index, { arm: event.target.value as WindingArm })}
              className="min-h-[44px] rounded border border-slate-300 px-2">
              {(['left', 'straddle', 'right'] as const).map((arm) => <option key={arm} value={arm}>{ARM_LABEL[arm]}</option>)}
            </select>
          </label>
          <button type="button" disabled={disabled}
            onClick={() => updateSegment(index, { direction: segment.direction === 1 ? -1 : 1 })}
            className="min-h-[44px] rounded bg-slate-700 px-3 py-2 font-bold text-white disabled:bg-slate-400">
            方向: {segment.direction === 1 ? '順' : '逆'}
          </button>
        </div>
      ))}
      <button type="button" disabled={disabled || remaining <= 0}
        onClick={() => props.onExpand(expandPatternToCommands(design, remaining))}
        className="min-h-[44px] rounded-lg bg-sky-700 px-4 py-2 font-bold text-white disabled:bg-slate-400">
        {disabled ? props.disabledReason : `実行して${remaining}ターン展開`}
      </button>
    </div>
  );
}
