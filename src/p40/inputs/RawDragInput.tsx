// P4-0 G2 案I(生ドラッグ): r2方式の比較対照。一周=1ターンの身体感覚を最小実装で確認する。
//
// **純関数・型・定数は`inputCommands.ts`にある**(componentファイルがcomponent以外を
// exportするとFast Refreshが効かないため)。ここはDOMイベントを意味コマンドへ
// 正規化するだけで、記録の生成・量子化は共通reducerが行う。
import { useRef, useState } from 'react';
import {
  advanceRotation,
  INITIAL_ROTATION_STATE,
  releaseRotation,
  resolveKeyCommand,
  type RotationState,
} from './inputCommands';
import {
  resolveGuideFromX,
  type PadPoint,
  type WindingInputProps,
} from '../../retro/winding/inputCommands';

export function RawDragInput(props: WindingInputProps) {
  const rotationRef = useRef<RotationState>(INITIAL_ROTATION_STATE);
  const [dragging, setDragging] = useState(false);
  const disabled = props.disabledReason !== null;

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !dragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point: PadPoint = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    const guide = resolveGuideFromX(point.x);
    props.onCommand({ kind: 'setGuide', position: guide.position, arm: guide.arm });
    const { next, completedTurns } = advanceRotation(rotationRef.current, point);
    rotationRef.current = next;
    for (let i = 0; i < completedTurns; i += 1) props.onCommand({ kind: 'advanceTurn' });
  };

  return (
    <div className="grid gap-3">
      <div
        role="application"
        aria-label="巻線パッド。ドラッグで治具のまわりを一周すると1ターン記録します"
        onPointerDown={(event) => { if (!disabled) { setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); } }}
        onPointerMove={handlePointer}
        onPointerUp={() => { setDragging(false); rotationRef.current = releaseRotation(); }}
        onPointerLeave={() => { setDragging(false); rotationRef.current = releaseRotation(); }}
        onKeyDown={(event) => {
          if (disabled) return;
          const command = resolveKeyCommand(event.key, props);
          if (command === null) return;
          event.preventDefault();
          props.onCommand(command);
        }}
        tabIndex={0}
        className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-slate-400 bg-slate-50 text-sm text-slate-600"
      >
        {disabled ? props.disabledReason : 'ここをドラッグして一周させると1ターン'}
      </div>
      <p className="text-xs text-slate-500">
        キーボード: ←→ ガイド / ↑↓ 張力 / Enter 1ターン / R 方向反転
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled} onClick={() => props.onCommand({ kind: 'advanceTurn' })}
          className="min-h-[44px] rounded-lg bg-sky-700 px-4 py-2 font-bold text-white disabled:bg-slate-400">
          1ターン記録
        </button>
        <button type="button" disabled={disabled}
          onClick={() => props.onCommand({ kind: 'setDirection', direction: props.direction === 1 ? -1 : 1 })}
          className="min-h-[44px] rounded-lg bg-slate-700 px-4 py-2 font-bold text-white disabled:bg-slate-400">
          方向を反転
        </button>
      </div>
      <label className="grid gap-1 text-sm">
        <span>張力 {Math.round(props.tension * 100)} %</span>
        <input type="range" min={0} max={1} step={1 / 256} value={props.tension} disabled={disabled}
          aria-label="張力" aria-valuemin={0} aria-valuemax={1} aria-valuenow={props.tension}
          onChange={(event) => props.onCommand({ kind: 'setTension', tension: Number(event.target.value) })} />
      </label>
    </div>
  );
}
