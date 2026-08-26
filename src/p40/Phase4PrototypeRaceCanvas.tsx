// P4-0 G5: 走行とゴーストの再生。**両者とも確定済みtraceの再生**であり、ここで
// 物理を進めたり勝敗を決めたりはしない——結果はreducerが持つ`Phase4RunResult`が
// 唯一の出典で、この画面はそれを時間軸に沿って見せるだけ(UI計画§6)。
//
// 480×270・整数拡大・letterboxは`useRetroCanvasFrame`の既存規律に従う。
import { useEffect, useRef, useState } from 'react';
import { useRetroCanvasFrame } from '../components/useRetroCanvasFrame';
import { drawPhase4Race } from '../retro/race/drawPhase4Race';
import { samplePositionAtTime } from '../retro/race/phase4RaceGeometry';
import { PHASE4_SECTION_BOUNDARIES_M } from './scenario';
import type { Phase4RaceOutcome } from './sessionReducer';

/** コース長。区間境界の最後がそのままゴール距離。 */
const TRACK_LENGTH_M = PHASE4_SECTION_BOUNDARIES_M[PHASE4_SECTION_BOUNDARIES_M.length - 1];

/** 再生を終える時刻。両者が止まったあと少しだけ余韻を残す。 */
function resolvePlaybackEndS(outcome: Phase4RaceOutcome): number {
  return Math.max(outcome.player.elapsedTimeS, outcome.rival.elapsedTimeS) + 0.4;
}

/**
 * `playback`は先頭から再生する。`still`はfinish時点の静止画だけを出す(第一段の写真判定)。
 * `still`ではrAFを起動せず`onFinish`も呼ばない——進行はその段の持ち主が決める。
 */
export type Phase4RacePlaybackMode = 'playback' | 'still';

export function Phase4PrototypeRaceCanvas({
  outcome,
  reducedMotion,
  onFinish,
  mode = 'playback',
  showAdvanceButton = true,
}: {
  outcome: Phase4RaceOutcome;
  reducedMotion: boolean;
  /** 再生が終わった通知。省略時は通知しない(押しても何も起きないcontrolを作らないため)。 */
  onFinish?: () => void;
  mode?: Phase4RacePlaybackMode;
  showAdvanceButton?: boolean;
}) {
  const { containerRef, canvasRef, contentRes, scaleResult } = useRetroCanvasFrame();
  const [elapsedS, setElapsedS] = useState(0);
  // 終了通知は再生ごとに1回だけ。rAFの最終フレームが二重に発火しても増えない。
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const endS = resolvePlaybackEndS(outcome);

  useEffect(() => {
    finishedRef.current = false;
    setElapsedS(0);
    // 静止表示。finish時点を出すだけで、再生も終了通知もしない。
    if (mode === 'still') {
      setElapsedS(endS);
      return;
    }
    // reduced motionでは自動再生しない(a11y項目10)。最終状態を静止表示し、
    // 事実(位置・タイム)は同じものが読める。
    if (reducedMotion) {
      setElapsedS(endS);
      finishedRef.current = true;
      onFinishRef.current?.();
      return;
    }
    let raf = 0;
    let startMs: number | null = null;
    const tick = (nowMs: number) => {
      if (startMs === null) startMs = nowMs;
      const t = (nowMs - startMs) / 1000;
      setElapsedS(Math.min(t, endS));
      if (t >= endS) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          onFinishRef.current?.();
        }
        return; // terminal後に同じloopを二重起動しない(UI計画§9)
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [outcome, reducedMotion, endS, mode]);

  const playerPositionM = samplePositionAtTime(outcome.player.trace, elapsedS);
  const ghostPositionM = samplePositionAtTime(outcome.rival.trace, elapsedS);

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d') ?? null;
    if (context === null || !scaleResult.fits) return;
    context.imageSmoothingEnabled = false;
    drawPhase4Race(
      context,
      {
        trackLengthM: TRACK_LENGTH_M,
        sectionBoundariesM: PHASE4_SECTION_BOUNDARIES_M,
        playerPositionM,
        ghostPositionM,
        elapsedS,
        playerAxisOffsetMm: outcome.player.motorConfig.axisOffsetMm,
        reducedMotion,
      },
      contentRes.w,
      contentRes.h,
    );
  }, [
    canvasRef, scaleResult.fits, contentRes.w, contentRes.h,
    playerPositionM, ghostPositionM, elapsedS, outcome, reducedMotion,
  ]);

  // 走行中はタイム差分析を出さない。現在位置・経過時間・playerのrpm/電流だけ(§S3)。
  // `findLast`はlib設定に依存するため使わず、後ろから明示的に走査する。
  let sample = outcome.player.trace[0];
  for (let i = outcome.player.trace.length - 1; i >= 0; i--) {
    if (outcome.player.trace[i].t <= elapsedS) { sample = outcome.player.trace[i]; break; }
  }

  return (
    <div className="grid gap-2">
      <div ref={containerRef} className="relative h-[480px] sm:h-[270px] overflow-hidden rounded-xl bg-slate-900">
        {!scaleResult.fits && (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white">
            現在の画面では走行ビュー(content {contentRes.w}×{contentRes.h})が等倍でも収まりません。
          </div>
        )}
        {scaleResult.fits && (
          <canvas ref={canvasRef} aria-label="走行のようす。手前が自分、奥が相手。"
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
      {/* canvasは表示専用。走行中の生値はDOM側で読めるようにする(§8)。 */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-white p-3 text-sm shadow-sm sm:grid-cols-4">
        <div><dt className="text-slate-600">経過</dt><dd className="font-black tabular-nums">{elapsedS.toFixed(2)} 秒</dd></div>
        <div><dt className="text-slate-600">自分の位置</dt><dd className="font-black tabular-nums">{playerPositionM.toFixed(2)} メートル</dd></div>
        <div><dt className="text-slate-600">自分の回転数</dt><dd className="font-black tabular-nums">{Math.round(sample?.rpm ?? 0)} 回毎分</dd></div>
        <div><dt className="text-slate-600">自分の電流</dt><dd className="font-black tabular-nums">{(sample?.currentA ?? 0).toFixed(2)} アンペア</dd></div>
      </dl>
      {/* 押しても何も起きないcontrolは置かない。通知先がある再生のときだけ出す。 */}
      {showAdvanceButton && onFinish !== undefined && (
        <button type="button" onClick={onFinish}
          className="min-h-[44px] rounded-xl bg-slate-700 px-4 py-2 font-black text-white">
          結果へ進む
        </button>
      )}
    </div>
  );
}
