// P4-0 G2/G4/G5: 3入力案の比較試作(S0入口 / S1案選択 / S2巻線)と、採用案II-B
// (半自動治具)だけを伸ばした垂直スライス(S3走行 / S4第一段 / S5第二段 / S6一区間の
// 巻き直し / S7二走目 / S8銘板)。
//
// **保存しない**——localStorage・gameStore・saveStore・inventory・notebook・codex・
// courseProgressへ一切読み書きしない。session限定であることを画面にも明示する。
//
// 走行以降はG2の3案比較を壊さないよう**採用案II-Bでのみ**開く。残る2案はG2当時のまま
// 巻線までで、比較の証跡が後から動かない。
//
// 評価語・品質ゲージ・推奨値・原因断定・自動補正は出さない。表示するのは生の数値だけ
// (計画の共通規約)。音はまだ鳴らさない(人間確認待ちのため、呼出し口も置いていない)。
import { useEffect, useMemo, useState } from 'react';
import {
  applyWindingCommand,
  applyWindingCommands,
  INITIAL_WINDING_INPUT_STATE,
  type WindingCommand,
  type WindingInputState,
} from './inputs/inputCommands';
import { RawDragInput } from './inputs/RawDragInput';
import { SemiAutoJigInput } from './inputs/SemiAutoJigInput';
import { PatternInput } from './inputs/PatternInput';
import { drawWindingTrace } from '../retro/winding/drawWindingTrace';
import type { WindingRecord } from '../materials/windingRecord';
import { useRetroCanvasFrame } from '../components/useRetroCanvasFrame';
import {
  INITIAL_PHASE4_SESSION,
  phase4SessionReducer,
  type Phase4SessionAction,
  type Phase4SessionState,
} from './sessionReducer';
import { createPhase4RaceRunner, computeRepairSections, playerWon } from './sessionReducer';
import type { MaterialCompositionBaseline } from '../materials/materialMapping';
import { Phase4PrototypeRaceCanvas } from './Phase4PrototypeRaceCanvas';
import { Phase4ResultCelebration, Phase4ResultFacts } from './Phase4PrototypeResult';
import { prefersReducedMotion } from '../retro/destruction/reducedMotion';

/** G2の比較は全案とも同じ30ターンで行う。 */
export const PROTOTYPE_TURN_COUNT = 30;

/**
 * 銘板の愛称の上限。既存フォント幅で銘板の1行に収まる長さから決めた(UI計画§S8)。
 * 保存はしないので、長さ制限は表示崩れを防ぐためだけのもの。
 */
export const NICKNAME_MAX_LENGTH = 12;

/** 3案は常に同じ順で並べる。推奨ラベルは付けない。 */
const INPUT_KINDS = [
  { id: 'raw', label: '生ドラッグ' },
  { id: 'semi', label: '半自動治具' },
  { id: 'pattern', label: 'パターン設計' },
] as const;

type InputKind = (typeof INPUT_KINDS)[number]['id'];

const ARM_LABEL = { left: '左腕', right: '右腕', straddle: '中央またぎ' } as const;

/**
 * 巻線ビュー(表示専用)。**containerと`useRetroCanvasFrame`をこの子componentへ閉じる。**
 *
 * 親が条件分岐でcontainerだけを出し入れすると、hookのResizeObserver effectは
 * 依存`[]`のためmount時にしか`containerRef.current`を読まず、そのときcontainerが
 * 無ければ**observerが張られないまま**になる(再入場のたびに`containerSize`が
 * `{0,0}`のまま=fits=falseで警告が出続ける)。子ごとmountすれば、effectは必ず
 * containerが存在する状態で走る。
 */
function WindingTraceView({ record }: { record: WindingRecord }) {
  const { containerRef, canvasRef, contentRes, scaleResult } = useRetroCanvasFrame();

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d') ?? null;
    if (context === null || !scaleResult.fits) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, contentRes.w, contentRes.h);
    drawWindingTrace(context, record, contentRes.w, contentRes.h);
  }, [record, canvasRef, contentRes.w, contentRes.h, scaleResult.fits]);

  return (
    /* 480×270(縦向きは270×480)を**整数倍**で拡大し、余白はletterboxにする
       (art-spec §2.1: 非整数拡大は禁止)。canvasは表示専用でDOM controlを重ねない。 */
    <div ref={containerRef} className="relative h-[480px] sm:h-[270px] overflow-hidden rounded-xl bg-slate-900">
      {!scaleResult.fits && (
        <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white">
          現在の画面では巻線ビュー(content {contentRes.w}×{contentRes.h})が等倍でも収まりません。
        </div>
      )}
      {scaleResult.fits && (
        <canvas ref={canvasRef} aria-label="巻線の軌跡"
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
 * `baseline`は**呼出し側(App)から受け取るだけ**で、この画面もsessionReducerも組み立てない——
 * `MaterialCompositionBaseline`の出典はS-3の`resolveProductionMaterialCompositionBaseline`
 * 1つに限られており、p40側で作り直すとその単一出典が二重化する。
 */
export function Phase4PrototypeScreen({ onExit, baseline }: { onExit: () => void; baseline: MaterialCompositionBaseline }) {
  const [kind, setKind] = useState<InputKind | null>(null);
  const [state, setState] = useState<WindingInputState>(INITIAL_WINDING_INPUT_STATE);
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  // resetで入力案componentをremountし、内部state(半自動の回転・案Iの累積・案IIIの設計)も
  // 初期化する。これが無いと、リセット後も半自動が回り続けうる。
  const [inputEpoch, setInputEpoch] = useState(0);
  // 走行セッション。**メモリ内のみ**で、退出・リロードで消える。
  const [session, setSession] = useState<Phase4SessionState>(INITIAL_PHASE4_SESSION);
  // ゴーストを見直すたびに再生componentを作り直す。停止・シーク・任意速度は作らない(§S5)。
  const [replayEpoch, setReplayEpoch] = useState(0);
  const [nickname, setNickname] = useState('');

  const runRace = useMemo(() => createPhase4RaceRunner(baseline), [baseline]);
  const dispatch = (action: Phase4SessionAction) => setSession((prev) => phase4SessionReducer(prev, action, runRace));
  const reducedMotion = useMemo(
    () => prefersReducedMotion(typeof window === 'undefined' ? undefined : (q) => window.matchMedia(q)),
    [],
  );

  const section = session.selectedSection;
  // 巻き直し中は「その区間のターン数」が上限になる。区間外のturn indexがずれないよう、
  // 区間長と同じターン数を巻き終えてはじめて確定できる。
  const turnLimit = session.stage === 'repairing' && section !== null ? section.end - section.start : PROTOTYPE_TURN_COUNT;
  const complete = state.record.length >= turnLimit;
  // 比較時間の表示にだけ実時間を使う。**記録値・tick・判定には使わない**。
  // 起点は**入力案を選択した瞬間**に統一する——案IIIは設計の時間が長く、実行ボタンを
  // 起点にすると設計時間が計測から抜け落ちて他案と比較できない。
  useEffect(() => {
    if (startedAtMs === null) return;
    if (complete) {
      // 上限到達時に一度だけ最終値を確定する(200ms表示tickの端数を残さない)。
      setElapsedSec((performance.now() - startedAtMs) / 1000);
      return;
    }
    const id = window.setInterval(() => setElapsedSec((performance.now() - startedAtMs) / 1000), 200);
    return () => window.clearInterval(id);
  }, [startedAtMs, complete]);

  const runCommand = (command: WindingCommand) => {
    setState((prev) => {
      // 30ターンに達したらadvanceTurnを受け付けない(親側で上限を扱う)。
      if (command.kind === 'advanceTurn' && prev.record.length >= turnLimit) {
        setRejectReason(`ここでは${turnLimit}ターンまでです`);
        return prev;
      }
      const next = applyWindingCommand(prev, command);
      if (!next.ok) { setRejectReason(next.reason); return prev; }
      setRejectReason(null);
      return next.value;
    });
  };

  const runCommands = (commands: readonly WindingCommand[]) => {
    setState((prev) => {
      const room = turnLimit - prev.record.length;
      const turnsInBatch = commands.filter((c) => c.kind === 'advanceTurn').length;
      if (turnsInBatch > room) {
        setRejectReason(`残り${room}ターンに対して${turnsInBatch}ターンを展開しようとしました`);
        return prev;
      }
      const next = applyWindingCommands(prev, commands);
      if (!next.ok) { setRejectReason(next.reason); return prev; }
      setRejectReason(null);
      return next.value;
    });
  };

  const reset = () => {
    setState(INITIAL_WINDING_INPUT_STATE);
    setRejectReason(null);
    setElapsedSec(0);
    // 同じ案のまま新しい計測を即時開始する。
    setStartedAtMs(performance.now());
    setInputEpoch((value) => value + 1);
    setSession(INITIAL_PHASE4_SESSION);
    setNickname('');
  };

  const selectKind = (next: InputKind) => {
    setState(INITIAL_WINDING_INPUT_STATE);
    setRejectReason(null);
    setElapsedSec(0);
    setStartedAtMs(performance.now()); // 起点は案を選んだ瞬間
    setInputEpoch((value) => value + 1);
    setSession(INITIAL_PHASE4_SESSION);
    setNickname('');
    setKind(next);
  };

  const backToSelect = () => {
    if (state.record.length > 0 && !window.confirm('記録中の巻線は破棄されます。案の選択へ戻りますか。')) return;
    setState(INITIAL_WINDING_INPUT_STATE);
    setRejectReason(null);
    setElapsedSec(0);
    setStartedAtMs(null); // 案選択へ戻るときだけ計測を止める
    setInputEpoch((value) => value + 1);
    setSession(INITIAL_PHASE4_SESSION);
    setNickname('');
    setKind(null);
  };

  /** 区間を選んだら巻線入力を空にして作り直す——前の区間の途中経過が混ざらないように。 */
  const selectSection = (index: number) => {
    setState(INITIAL_WINDING_INPUT_STATE);
    setRejectReason(null);
    setInputEpoch((value) => value + 1);
    dispatch({ kind: 'selectSection', index });
  };

  const reselectSection = () => {
    setState(INITIAL_WINDING_INPUT_STATE);
    setRejectReason(null);
    setInputEpoch((value) => value + 1);
    dispatch({ kind: 'reselectSection' });
  };

  // 段階から表示の出典を1本ずつ決める。JSX側で条件を重ねると、どのoutcomeを見ているかが
  // 追えなくなる——「表示は常に1つのoutcomeから来る」ことをここで固定する。
  const windingStage = session.stage === 'winding' || session.stage === 'repairing';
  const racingOutcome =
    session.stage === 'racingFirst' ? session.firstOutcome
    : session.stage === 'racingSecond' ? session.secondOutcome
    : null;
  const celebrationOutcome =
    session.stage === 'celebrationFirst' ? session.firstOutcome
    : session.stage === 'celebrationSecond' ? session.secondOutcome
    : null;
  const factsOutcome =
    session.stage === 'factsFirst' ? session.firstOutcome
    : session.stage === 'factsSecond' ? session.secondOutcome
    : null;
  const factsRecord =
    session.stage === 'factsFirst' ? session.firstRecord
    : session.stage === 'factsSecond' ? session.repairedRecord
    : null;
  const sessionReject = session.rejectReason ?? '';

  /**
   * 巻き直し中の表示用記録。区間外は`repairedRecord`の値をそのまま、区間内だけを
   * 入力中の記録に差し替える。**ロックされている範囲が見た目にも動かない**ことを示す。
   */
  const previewRecord: WindingRecord =
    session.stage === 'repairing' && section !== null && session.repairedRecord !== null
      ? [...session.repairedRecord.slice(0, section.start), ...state.record, ...session.repairedRecord.slice(section.end)]
      : state.record;

  const inputProps = {
    position: state.position,
    arm: state.arm,
    tension: state.tension,
    direction: state.direction,
    turnCount: state.record.length,
    maxTurns: turnLimit,
    onCommand: runCommand,
    disabledReason: complete ? `${turnLimit}ターンに達しました` : null,
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 pb-10">
      <header className="rounded-2xl bg-slate-900 p-5 text-white">
        <p className="text-xs font-black tracking-[0.2em] text-violet-300">WINDING PROTOTYPE</p>
        <h2 className="mt-2 text-2xl font-black">巻線プロトタイプ</h2>
        <p className="mt-2 text-sm text-slate-300">
          この画面の内容は保存されません。固定部品・固定{PROTOTYPE_TURN_COUNT}ターンで、入力方式だけを比べます。
        </p>
        <button type="button" onClick={onExit} className="mt-3 min-h-[44px] rounded-xl bg-slate-700 px-4 py-2 font-black">
          タイトルへ戻る
        </button>
      </header>

      {kind === null ? (
        <section className="grid gap-3" aria-label="入力方式の選択">
          {INPUT_KINDS.map((item) => (
            <button key={item.id} type="button" onClick={() => selectKind(item.id)}
              className="min-h-[44px] rounded-xl bg-sky-700 px-4 py-3 text-left font-black text-white">
              {item.label}
            </button>
          ))}
        </section>
      ) : windingStage ? (
        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-3">
            {/* 巻き直し中は区間外のturnを値のまま重ねて見せる(ロック表示)。 */}
            <WindingTraceView record={previewRecord} />
            {section !== null && (
              <p className="rounded-xl bg-white p-3 text-sm shadow-sm">
                第{section.index + 1}区間(第{section.start + 1}〜{section.end}ターン)を巻き直しています。
                ほかの{previewRecord.length - (section.end - section.start)}ターンは値そのままで変わりません。
              </p>
            )}
            {kind === 'raw' && <RawDragInput key={inputEpoch} {...inputProps} />}
            {kind === 'semi' && <SemiAutoJigInput key={inputEpoch} {...inputProps} />}
            {kind === 'pattern' && <PatternInput key={inputEpoch} {...inputProps} onExpand={runCommands} />}
          </div>
          <aside className="grid content-start gap-2 rounded-xl bg-white p-4 shadow-sm" aria-label="生データ">
            <p className="text-sm">巻数 <span className="font-black tabular-nums">{state.record.length}</span> / {turnLimit}</p>
            <p className="text-sm">現在の方向 <span className="font-black">{state.direction === 1 ? '順' : '逆'}</span></p>
            <p className="text-sm">張力 <span className="font-black tabular-nums">{Math.round(state.tension * 100)}</span> %</p>
            <p className="text-sm">腕 <span className="font-black">{ARM_LABEL[state.arm]}</span></p>
            <p className="text-sm">経過 <span className="font-black tabular-nums">{elapsedSec.toFixed(1)}</span> 秒</p>
            {/* 拒否理由は常設ノードで、条件でノードごと出し入れしない(a11y項目6)。 */}
            <p role="status" className="min-h-[1.25rem] text-sm text-rose-700">{rejectReason ?? sessionReject}</p>
            {/* 走行以降は採用案II-Bでのみ開く。他2案はG2の比較のまま巻線で終わる。 */}
            {kind === 'semi' && session.stage === 'winding' && (
              <button type="button" onClick={() => dispatch({ kind: 'runFirst', record: state.record })}
                disabled={!complete}
                className="min-h-[44px] rounded-xl bg-emerald-700 px-4 py-2 font-black text-white disabled:bg-slate-300 disabled:text-slate-600">
                {complete ? 'この巻線で走る' : `あと${turnLimit - state.record.length}ターンで走れます`}
              </button>
            )}
            {session.stage === 'repairing' && (
              <>
                <button type="button" onClick={() => dispatch({ kind: 'commitRepair', turns: state.record })}
                  disabled={!complete}
                  className="min-h-[44px] rounded-xl bg-emerald-700 px-4 py-2 font-black text-white disabled:bg-slate-300 disabled:text-slate-600">
                  {complete ? 'この区間を確定する' : `あと${turnLimit - state.record.length}ターンで確定できます`}
                </button>
                <button type="button" onClick={reselectSection}
                  className="min-h-[44px] rounded-lg bg-slate-200 px-3 py-2 font-bold text-slate-700">
                  区間を選び直す
                </button>
              </>
            )}
            <button type="button" onClick={reset} className="min-h-[44px] rounded-lg bg-slate-200 px-3 py-2 font-bold text-slate-700">
              リセット
            </button>
            <button type="button" onClick={backToSelect} className="min-h-[44px] rounded-lg bg-slate-200 px-3 py-2 font-bold text-slate-700">
              案の選択へ戻る
            </button>
          </aside>
        </section>
      ) : (
        <section className="grid gap-4" aria-label="走行と結果">
          {racingOutcome !== null && (
            <Phase4PrototypeRaceCanvas key={`${session.stage}-${replayEpoch}`} outcome={racingOutcome}
              reducedMotion={reducedMotion} onFinish={() => dispatch({ kind: 'finishRace' })} />
          )}

          {celebrationOutcome !== null && (
            <Phase4ResultCelebration outcome={celebrationOutcome}
              previousOutcome={session.stage === 'celebrationSecond' ? session.firstOutcome : null}
              onShowFacts={() => dispatch({ kind: 'showFacts' })}>
              {/* 写真判定はfinish時点の静止画。再生も終了通知もしない。 */}
              <Phase4PrototypeRaceCanvas outcome={celebrationOutcome} reducedMotion={reducedMotion}
                mode="still" showAdvanceButton={false} />
            </Phase4ResultCelebration>
          )}

          {factsOutcome !== null && factsRecord !== null && (
            <Phase4ResultFacts outcome={factsOutcome} record={factsRecord}
              onReplay={() => setReplayEpoch((value) => value + 1)}>
              {/* 進行先が無い再生なので「結果へ進む」は出さない。外側の「もう一度見る」だけ。 */}
              <Phase4PrototypeRaceCanvas key={`facts-${session.stage}-${replayEpoch}`} outcome={factsOutcome}
                reducedMotion={reducedMotion} showAdvanceButton={false} />
            </Phase4ResultFacts>
          )}

          {session.stage === 'factsFirst' && (
            <button type="button" onClick={() => dispatch({ kind: 'beginRepair' })}
              className="min-h-[44px] rounded-xl bg-sky-700 px-4 py-2 font-black text-white">
              前の巻線を複製して一区間を巻き直す
            </button>
          )}

          {session.stage === 'selectRepairSection' && session.repairedRecord !== null && (
            <section className="grid gap-2 rounded-xl bg-white p-4 shadow-sm" aria-label="巻き直す区間の選択">
              <h3 className="text-sm font-black">巻き直す区間を1つ選びます</h3>
              <p className="text-sm">選んだ区間だけを巻き直します。ほかの区間は値そのままで変わりません。</p>
              {computeRepairSections(session.repairedRecord.length).map((item) => (
                <button key={item.index} type="button" onClick={() => selectSection(item.index)}
                  className="min-h-[44px] rounded-xl bg-sky-700 px-4 py-2 text-left font-black text-white">
                  第{item.index + 1}区間(第{item.start + 1}〜{item.end}ターン、{item.end - item.start}ターン)
                </button>
              ))}
            </section>
          )}

          {session.stage === 'repaired' && (
            <button type="button" onClick={() => dispatch({ kind: 'runSecond' })}
              className="min-h-[44px] rounded-xl bg-emerald-700 px-4 py-2 font-black text-white">
              2走目を走らせる
            </button>
          )}

          {session.stage === 'factsSecond' && (
            <div className="grid gap-2">
              {/* 銘板は勝利時だけ。負けたまま進める導線は置かない。 */}
              {session.secondOutcome !== null && playerWon(session.secondOutcome) && (
                <button type="button" onClick={() => dispatch({ kind: 'toNameplate' })}
                  className="min-h-[44px] rounded-xl bg-sky-700 px-4 py-2 font-black text-white">
                  銘板をつくる
                </button>
              )}
              <button type="button" onClick={() => dispatch({ kind: 'finish' })}
                className="min-h-[44px] rounded-lg bg-slate-200 px-3 py-2 font-bold text-slate-700">
                おわりにする
              </button>
            </div>
          )}

          {session.stage === 'nameplate' && session.secondOutcome !== null && session.repairedRecord !== null && (
            <section className="grid gap-3 rounded-xl bg-white p-4 shadow-sm" aria-label="セッション銘板">
              <h3 className="text-sm font-black">銘板</h3>
              <label className="text-sm" htmlFor="nameplate-nickname">
                愛称(全角{NICKNAME_MAX_LENGTH}文字まで)
                <input id="nameplate-nickname" type="text" maxLength={NICKNAME_MAX_LENGTH}
                  value={nickname} onChange={(event) => setNickname(event.target.value)}
                  className="ml-2 min-h-[44px] w-48 rounded-lg border border-slate-400 px-2" />
              </label>
              <p className="text-sm">愛称 <span className="font-black">{nickname === '' ? '(未入力)' : nickname}</span></p>
              <p className="text-sm">
                最終タイム <span className="font-black tabular-nums">
                  {session.secondOutcome.player.finishTimeS === null ? '—' : session.secondOutcome.player.finishTimeS.toFixed(3)}
                </span> 秒
              </p>
              <p className="text-sm">
                相手との差 <span className="font-black tabular-nums">
                  {session.secondOutcome.player.finishTimeS === null || session.secondOutcome.rival.finishTimeS === null
                    ? '—'
                    : (session.secondOutcome.player.finishTimeS - session.secondOutcome.rival.finishTimeS).toFixed(3)}
                </span> 秒
              </p>
              <WindingTraceView record={session.repairedRecord} />
              <p className="text-sm text-rose-700">この銘板は保存されません。画面を離れるか再読み込みすると消えます。</p>
              <button type="button" onClick={() => dispatch({ kind: 'finish' })}
                className="min-h-[44px] rounded-lg bg-slate-200 px-3 py-2 font-bold text-slate-700">
                おわりにする
              </button>
            </section>
          )}

          {session.stage === 'complete' && (
            <section className="grid gap-2 rounded-xl bg-white p-4 shadow-sm" aria-label="おわり">
              <p className="text-sm">この回はここまでです。結果は保存されません。</p>
              <button type="button" onClick={reset}
                className="min-h-[44px] rounded-xl bg-sky-700 px-4 py-2 font-black text-white">
                もう一度巻く
              </button>
            </section>
          )}

          {/* 拒否理由は常設ノードで、条件でノードごと出し入れしない(a11y項目6)。 */}
          <p role="status" className="min-h-[1.25rem] text-sm text-rose-700">{sessionReject}</p>
          <button type="button" onClick={backToSelect}
            className="min-h-[44px] rounded-lg bg-slate-200 px-3 py-2 font-bold text-slate-700">
            案の選択へ戻る
          </button>
        </section>
      )}
    </div>
  );
}
