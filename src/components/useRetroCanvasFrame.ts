// 店・在庫画面(docs/phase2-ui-shop-plan.md v4)向けの直接低解像度Canvasマウント共通処理。
// Phase1のOverheadViewDemo(src/retro-proto/overheadView/OverheadViewDemo.tsx)と同じ
// 整数拡大・orientation切替パターンを踏襲する(v4 §10: Phase1承認済み解像度・規律を継承)。
import { useEffect, useRef, useState } from 'react';
import { computeIntegerScale } from '../retro/canvas/integerScale';
import { applyDirectCanvasBackingSize } from '../retro/canvas/directCanvas';
import { selectOrientedResolution, type ContentResolution } from '../retro/canvas/orientation';

const LANDSCAPE_CONTENT: ContentResolution = { w: 480, h: 270 };

/**
 * 表示の3状態。`measuring`と`tooSmall`を分けるためだけの型で、描画規則には関与しない。
 *
 * 純関数として切り出すのは、**「初回表示・再入場で警告が出ない」ことを数値で回帰固定する**ため
 * (DOM renderer を持たない本リポジトリでは、hookの内部stateを直接検証できない)。
 */
export type RetroFrameDisplay = 'measuring' | 'tooSmall' | 'ready';

/**
 * 測定済みかどうかと収まるかどうかから表示状態を決める。
 * **未測定なら決して`tooSmall`にしない**——測る前に「収まりません」と言わないための唯一の判断点。
 */
export function resolveRetroFrameDisplay(measured: boolean, fits: boolean): RetroFrameDisplay {
  if (!measured) return 'measuring';
  return fits ? 'ready' : 'tooSmall';
}

/**
 * P4-1B B4(2026-08-30人間承認): 「まだ測っていない」と「測った結果が収まらない」を区別する。
 *
 * `containerSize`の初期値`{0,0}`は`computeIntegerScale`から見れば`fits=false`と同じであり、
 * ResizeObserverの初回発火までの一瞬と、本当に狭すぎる画面とが**同じ表示になっていた**。
 * production必須画面(組み立て工程)では、初回表示・メニュー往復・再入場のたびに
 * 「収まりません」が出うることになる。測定済みかどうかを別のフラグで持てば、
 * 呼び出し側は「未測定なら何も言わない/測定済みで収まらないときだけ告げる」を選べる。
 *
 * 内部解像度・整数拡大・letterboxの規則は一切変えていない。
 */
export function useRetroCanvasFrame() {
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [measured, setMeasured] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) });
        // 実測が1度でも届いたら測定済みにする。0×0が返る状況(display:none等)も
        // 「測った結果」であり、未測定と混同しない。
        setMeasured(true);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const contentRes = selectOrientedResolution(containerSize.w, containerSize.h, LANDSCAPE_CONTENT);
  const scaleResult = computeIntegerScale(containerSize.w, containerSize.h, contentRes.w, contentRes.h);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scaleResult.fits) return;
    applyDirectCanvasBackingSize(canvas, contentRes.w, contentRes.h);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.imageSmoothingEnabled = false;
  }, [contentRes.w, contentRes.h, scaleResult.fits]);

  return {
    containerRef,
    canvasRef,
    contentRes,
    scaleResult,
    measured,
    display: resolveRetroFrameDisplay(measured, scaleResult.fits),
  };
}
