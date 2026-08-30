// P4-0 G2 案II(半自動治具): spec §9.1の本命候補。
// ローターが自動で回り、プレイヤーはguide・張力・方向を保持する。
//
// **純関数・型・定数は`inputCommands.ts`にある。**
// 記録は固定1000msのrecord tickで進み、rAFの呼び出し回数は記録に使わない。
import { useEffect, useRef, useState } from 'react';
import {
  advanceTicks,
  INITIAL_TICK_STATE,
  resolvePadInput,
  resolveJigKeyCommand,
  type PadPoint,
  type TickState,
  type WindingCommand,
  type WindingInputProps,
} from '../../retro/winding/inputCommands';

export function SemiAutoJigInput(props: WindingInputProps) {
  const [running, setRunning] = useState(false);
  const tickRef = useRef<TickState>(INITIAL_TICK_STATE);
  // 始動からの経過(一時停止中は進まない)。再開時は稼働済み時間をoffsetとして持ち越す。
  const runStartMsRef = useRef<number | null>(null);
  const runningOffsetMsRef = useRef(0);
  const disabled = props.disabledReason !== null;

  const handlePad = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point: PadPoint = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    const resolved = resolvePadInput(point);
    props.onCommand({ kind: 'setGuide', position: resolved.position, arm: resolved.arm });
    props.onCommand({ kind: 'setTension', tension: resolved.tension });
  };

  // **onCommandはrefへ同期する**——親が経過表示で再描画するたびにpropsのobject identityが
  // 変わるため、これをrAF effectの依存に含めるとcleanup→再起動が繰り返され、
  // 始動時刻が上書きされて1000ms tickへ到達しなくなる。
  const onCommandRef = useRef<(command: WindingCommand) => void>(props.onCommand);
  useEffect(() => { onCommandRef.current = props.onCommand; }, [props.onCommand]);

  // 依存は running と disabled だけに限定する(props全体を入れない)。
  useEffect(() => {
    if (!running || disabled) {
      if (runStartMsRef.current !== null) {
        runningOffsetMsRef.current += performance.now() - runStartMsRef.current;
        runStartMsRef.current = null;
      }
      return;
    }
    runStartMsRef.current = performance.now();
    let frame = 0;
    const loop = () => {
      const start = runStartMsRef.current;
      if (start !== null) {
        const elapsed = runningOffsetMsRef.current + (performance.now() - start);
        const { next, ticks } = advanceTicks(tickRef.current, elapsed);
        tickRef.current = next;
        for (let i = 0; i < ticks; i += 1) onCommandRef.current({ kind: 'advanceTurn' });
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, disabled]);

  return (
    <div className="grid gap-3">
      <div
        role="application"
        aria-label="巻線治具。軸は自動で回ります。指やマウスで導線を左右へ動かすとガイド位置、下へ引くほど張力が強くなります"
        tabIndex={0}
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          handlePad(event);
        }}
        onPointerMove={(event) => {
          if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          handlePad(event);
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === ' ') { event.preventDefault(); setRunning((value) => !value); return; }
          const command = resolveJigKeyCommand(event.key, props);
          if (command === null) return;
          event.preventDefault();
          props.onCommand(command);
        }}
        className="relative flex h-56 touch-none items-center justify-center rounded-xl border-2 border-slate-400 bg-slate-50 text-sm text-slate-600"
      >
        {disabled ? props.disabledReason : running ? '回転中。導線を動かしてください(1秒=1ターン)' : '停止中。始動すると軸が回ります'}
      </div>
      <p className="text-xs text-slate-500">
        キーボード: A/D または ←→ ガイド / W/S または ↑↓ 張力 / Space 始動・停止 / R 方向反転
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled} onClick={() => setRunning((value) => !value)}
          className="min-h-[44px] rounded-lg bg-sky-700 px-4 py-2 font-bold text-white disabled:bg-slate-400">
          {running ? '一時停止' : '始動'}
        </button>
        <button type="button" disabled={disabled}
          onClick={() => props.onCommand({ kind: 'setDirection', direction: props.direction === 1 ? -1 : 1 })}
          className="min-h-[44px] rounded-lg bg-slate-700 px-4 py-2 font-bold text-white disabled:bg-slate-400">
          方向を反転
        </button>
      </div>
      <p className="text-sm text-slate-600">
        ガイド位置 {Math.round(props.position * 100)} %({props.arm === 'left' ? '左腕' : props.arm === 'right' ? '右腕' : '中央またぎ'})
        {' / '}張力 {Math.round(props.tension * 100)} %
      </p>
    </div>
  );
}
