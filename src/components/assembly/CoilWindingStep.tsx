// spec docs/spec.md §9.1 / P4-1B B2(2026-08-30人間承認): 半自動巻線治具による①コイル巻き工程。
//
// P4-0で採用が確定した入力方式をproductionへ接続したもの。旧実装は
// 「ドラッグ8pxごとに`coilTurns`を1増やす」スカラー入力で、位置・腕・方向・張力を
// 記録できなかった。**巻数はここで独立編集せず、巻線記録の長さから導出される**
// (`RotorAssemblyMotorDraft`が型で派生値を排除している)。
//
// 純関数・型・定数は`windingStepState.ts`と`src/retro/winding/inputCommands.ts`にある。
import { useEffect, useRef, useState } from 'react';
import type { AssemblyStepProps } from '../../modes/AssemblyMode';
import {
  applyWindingCommand,
  INITIAL_WINDING_INPUT_STATE,
  advanceTicks,
  INITIAL_TICK_STATE,
  resolvePadInput,
  resolveJigKeyCommand,
  type PadPoint,
  type TickState,
  type WindingCommand,
  type WindingInputState,
} from '../../retro/winding/inputCommands';
import {
  canRequestCompletion,
  currentLot,
  currentRecord,
  hasRecordedTurns,
  resolveDisplayTurnLimit,
  type WindingLot,
} from './windingStepState';
import { MIN_RUNNABLE_WINDING_TURNS } from '../../materials/windingRecord';
import { WIRE_MATERIALS } from '../../materials/materials';
import { WindingTraceView } from './WindingTraceView';

/** 選べる線径。既存の①工程が持っていた範囲(0.2〜0.8mm)をそのまま離散化した。 */
const WIRE_GAUGES_MM = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] as const;

const ARM_LABEL = { left: '左腕', right: '右腕', straddle: '中央またぎ' } as const;

export function CoilWindingStep({ winding, dispatchWinding }: AssemblyStepProps) {
  const lot = currentLot(winding);
  const record = currentRecord(winding);
  // 治具の保持状態(位置・腕・張力・方向)。記録からは導けないので入力state側で持つ。
  const [input, setInput] = useState<WindingInputState>(INITIAL_WINDING_INPUT_STATE);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const tickRef = useRef<TickState>(INITIAL_TICK_STATE);
  const runStartMsRef = useRef<number | null>(null);
  const runningOffsetMsRef = useRef(0);

  const limit = lot === null ? 0 : resolveDisplayTurnLimit(lot);
  // 上限は**表示のためだけ**に使う。完成の可否はstoreのvalidatorが単独で執行する。
  const atLimit = lot !== null && record.length >= limit;

  /**
   * 作業中の入力状態。**renderのclosureではなくrefを唯一の起点にする**——
   * 1つのイベント内で`setGuide → setTension`のように連続適用するとき、closureの`input`は
   * まだ更新されていないので、2回目が1回目の結果を上書きしてしまう。rAFのcatch-up
   * (ticks≧2)でも同じことが起き、記録が1本しか増えないのにtickだけ複数進む。
   */
  const workingRef = useRef<WindingInputState>(INITIAL_WINDING_INPUT_STATE);

  // 親の記録が外から変わったとき(材料の破棄など)にrefを合わせる。
  // 自分のdispatch由来なら参照が一致するので何も起きない。
  if (workingRef.current.record !== record) {
    workingRef.current = { ...workingRef.current, record };
  }

  /**
   * コマンド列を**最新状態へ原子的に**適用する。1件でも拒否されたらそこで止め、
   * それまでの適用結果は保持する(治具の操作は取り消せない)。
   *
   * 記録が実際に変わったときだけ親の有限状態へ`setRecord`を送る——
   * ガイド位置や張力を動かしただけで`lotFixed → winding`へ入ってしまうと、
   * 「1ターンも巻いていないのに材料が固定される」ことになる。
   */
  const runCommands = (commands: readonly WindingCommand[]) => {
    if (lot === null) return;
    let state = workingRef.current;
    const before = state.record;
    let reason: string | null = null;
    for (const command of commands) {
      if (command.kind === 'advanceTurn' && state.record.length >= limit) {
        reason = `この線径では最大${limit}ターンまでです`;
        break;
      }
      const next = applyWindingCommand(state, command);
      if (!next.ok) { reason = next.reason; break; }
      state = next.value;
    }
    workingRef.current = state;
    setInput(state);
    setRejectReason(reason);
    if (state.record !== before) dispatchWinding({ kind: 'setRecord', record: state.record });
  };

  const runCommand = (command: WindingCommand) => runCommands([command]);

  const onCommandsRef = useRef(runCommands);
  useEffect(() => { onCommandsRef.current = runCommands; });

  // 依存は running と 材料確定の有無だけ(props全体を入れない)。propsのobject identityが
  // 変わるたびにcleanup→再起動すると、始動時刻が上書きされて1000ms tickへ届かない。
  useEffect(() => {
    if (!running || lot === null) {
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
        // catch-upで複数tick分たまっても、**まとめて1回**で正確にticks本追加する。
        if (ticks > 0) {
          onCommandsRef.current(Array.from({ length: ticks }, () => ({ kind: 'advanceTurn' as const })));
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, lot]);

  const handlePad = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point: PadPoint = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    const resolved = resolvePadInput(point);
    // 位置・腕・張力を**1回の適用**で反映する。2回に分けると後者が前者を上書きする。
    runCommands([
      { kind: 'setGuide', position: resolved.position, arm: resolved.arm },
      { kind: 'setTension', tension: resolved.tension },
    ]);
  };

  /** 治具の入力状態と回転を初期化する。材料を捨てる経路が必ずここを通る。 */
  const resetJig = () => {
    setRunning(false);
    // **稼働中の起点を先に捨てる**——nullへ戻さないまま停止すると、`running`のeffectの
    // 停止分岐が「破棄前の経過時間」を`runningOffsetMsRef`へ足し戻してしまい、
    // 次の材料で始動した瞬間にcatch-upのturnが湧く。
    runStartMsRef.current = null;
    tickRef.current = INITIAL_TICK_STATE;
    runningOffsetMsRef.current = 0;
    workingRef.current = INITIAL_WINDING_INPUT_STATE;
    setInput(INITIAL_WINDING_INPUT_STATE);
    setRejectReason(null);
  };

  /**
   * 材料を捨てる唯一の入口。**0ターンなら確認なし、1ターン以上なら確認後だけ全破棄**。
   * 破棄経路を1本に絞らないと、確認を通らないボタンが増えて契約が空文化する。
   * cancelしたときは`dispatchWinding`を1度も呼ばないので、状態も記録も変わらない。
   */
  const discardLot = (): boolean => {
    if (hasRecordedTurns(winding)
      && !window.confirm('巻いた記録をすべて捨てて、材料を選び直しますか。')) return false;
    resetJig();
    dispatchWinding({ kind: 'changeLot' });
    return true;
  };

  const fixLot = (next: WindingLot) => {
    if (!discardLot()) return;
    dispatchWinding({ kind: 'fixLot', lot: next });
  };

  if (lot === null) {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          巻き始める前に、線材・線径・並列本数を決めます。巻き始めたあとは変えられません。
        </p>
        <LotChooser onFix={fixLot} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white p-6 shadow-sm">
      <WindingTraceView record={record} jig={input} />

      <div
        role="application"
        aria-label="巻線治具。軸は自動で回ります。指やマウスで導線を左右へ動かすとガイド位置、下へ引くほど張力が強くなります"
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          handlePad(event);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          handlePad(event);
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        onKeyDown={(event) => {
          if (event.key === ' ') { event.preventDefault(); setRunning((value) => !value); return; }
          const command = resolveJigKeyCommand(event.key, input);
          if (command === null) return;
          event.preventDefault();
          runCommand(command);
        }}
        className="relative flex h-56 touch-none items-center justify-center rounded-xl border-2 border-slate-400 bg-slate-50 text-center text-sm text-slate-600"
      >
        {/* 巻き数は**操作パッドの中**に置く。下部のdlはスマホ縦では操作領域より
            約380px下へ押し出され、巻きながら現在ターン数を確認できなかった
            (U2人間視認の指摘)。role="status"は付けない——1秒ごとに読み上げが
            割り込み、操作そのものを妨げるため。 */}
        <div className="flex flex-col items-center gap-1">
          <span>
            巻き数 <span className="font-bold tabular-nums">{record.length} / {limit}</span> ターン
          </span>
          <span>
            {atLimit
              ? `これ以上巻けません(上限${limit}ターン)`
              : running ? '回転中。導線を動かしてください(1秒=1ターン)' : '停止中。始動すると軸が回ります'}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        キーボード: A/D または ←→ ガイド / W/S または ↑↓ 張力 / Space 始動・停止 / R 方向反転
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setRunning((value) => !value)}
          className="min-h-[44px] rounded-lg bg-sky-700 px-4 py-2 font-bold text-white">
          {running ? '一時停止' : '始動'}
        </button>
        <button type="button"
          onClick={() => runCommand({ kind: 'setDirection', direction: input.direction === 1 ? -1 : 1 })}
          className="min-h-[44px] rounded-lg bg-slate-700 px-4 py-2 font-bold text-white">
          方向を反転
        </button>
        {/* 巻き終える/巻き足す。`review`段階に入らないと完成要求できない。 */}
        {winding.kind === 'winding' && (
          <button type="button" disabled={record.length < MIN_RUNNABLE_WINDING_TURNS}
            onClick={() => { setRunning(false); dispatchWinding({ kind: 'toReview' }); }}
            className="min-h-[44px] rounded-lg bg-amber-600 px-4 py-2 font-bold text-white disabled:bg-slate-400">
            巻き終える
          </button>
        )}
        {(winding.kind === 'review' || winding.kind === 'failed') && (
          <button type="button" onClick={() => dispatchWinding({ kind: 'backToWinding' })}
            className="min-h-[44px] rounded-lg bg-slate-700 px-4 py-2 font-bold text-white">
            巻き足す
          </button>
        )}
      </div>

      {/* 段階は常設ノードで示す。条件でノードごと出し入れしない。 */}
      <p role="status" className="min-h-[1.25rem] text-sm text-slate-700">
        {winding.kind === 'winding'
          ? (record.length < MIN_RUNNABLE_WINDING_TURNS
            ? `あと${MIN_RUNNABLE_WINDING_TURNS - record.length}ターンで巻き終えられます`
            : '巻き終えると、確認のうえ完成できます')
          : canRequestCompletion(winding) ? '巻き終えました。工程を進めると完成できます' : ''}
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
        <div><dt className="inline text-slate-600">巻き数 </dt><dd className="inline font-bold">{record.length} / {limit} ターン</dd></div>
        <div><dt className="inline text-slate-600">現在の方向 </dt><dd className="inline font-bold">{input.direction === 1 ? '順' : '逆'}</dd></div>
        <div><dt className="inline text-slate-600">ガイド位置 </dt><dd className="inline font-bold">{Math.round(input.position * 100)} %({ARM_LABEL[input.arm]})</dd></div>
        <div><dt className="inline text-slate-600">張力 </dt><dd className="inline font-bold">{Math.round(input.tension * 100)} %</dd></div>
      </dl>

      {/* 拒否理由は常設ノードで、条件でノードごと出し入れしない。 */}
      <p role="status" className="min-h-[1.25rem] text-sm text-rose-700">{rejectReason ?? ''}</p>

      <p className="text-sm text-slate-600">
        見方: 細く立つ軌跡は高い張力、広く寝る軌跡は低い張力の記録です。
      </p>

      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        <p>線材 {WIRE_MATERIALS.find((m) => m.id === lot.wireMaterialId)?.nameJa ?? lot.wireMaterialId}
          {' / '}線径 {lot.windingWireGaugeMm} ミリメートル
          {' / '}並列 {lot.windingParallelStrands} 本</p>
        <button type="button" onClick={discardLot}
          className="mt-2 min-h-[44px] rounded-lg bg-slate-200 px-3 py-2 font-bold text-slate-700">
          材料を選び直す(巻いた記録は捨てられます)
        </button>
      </div>
    </div>
  );
}

/** 巻き始め前の材料選択。ここでだけ線径・並列本数を決められる。 */
function LotChooser({ onFix }: { onFix: (lot: WindingLot) => void }) {
  const [wireMaterialId, setWireMaterialId] = useState<string>(WIRE_MATERIALS[0].id);
  const [windingWireGaugeMm, setGauge] = useState<number>(0.4);
  const [windingParallelStrands, setStrands] = useState<1 | 2>(1);

  return (
    <div className="grid gap-3">
      <label className="text-sm">線材
        <select value={wireMaterialId} onChange={(e) => setWireMaterialId(e.target.value)}
          className="ml-2 min-h-[44px] rounded-lg border border-slate-400 px-2">
          {WIRE_MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.nameJa}</option>)}
        </select>
      </label>
      <label className="text-sm">線径
        <select value={windingWireGaugeMm} onChange={(e) => setGauge(Number(e.target.value))}
          className="ml-2 min-h-[44px] rounded-lg border border-slate-400 px-2">
          {WIRE_GAUGES_MM.map((g) => <option key={g} value={g}>{g} ミリメートル</option>)}
        </select>
      </label>
      <fieldset className="text-sm">
        <legend>並列本数</legend>
        <div className="mt-1 flex gap-2">
          {([1, 2] as const).map((n) => (
            <button key={n} type="button" onClick={() => setStrands(n)} aria-pressed={windingParallelStrands === n}
              className={`min-h-[44px] rounded-lg border-2 px-4 py-2 font-bold ${windingParallelStrands === n ? 'border-sky-600 bg-sky-50' : 'border-slate-200'}`}>
              {windingParallelStrands === n ? '✓ ' : ''}{n} 本
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-sm text-slate-600">
        この線径・並列本数では最大 {resolveDisplayTurnLimit({ wireMaterialId, windingWireGaugeMm, windingParallelStrands })} ターンまで巻けます。
      </p>
      <button type="button" onClick={() => onFix({ wireMaterialId, windingWireGaugeMm, windingParallelStrands })}
        className="min-h-[44px] rounded-xl bg-amber-600 px-4 py-2 font-black text-white">
        この材料で巻き始める
      </button>
    </div>
  );
}
