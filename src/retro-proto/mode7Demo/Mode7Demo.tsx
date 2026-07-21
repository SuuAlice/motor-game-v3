// docs/phase1-plan.md §5.5/Unit F: Mode7見取り図ズームタブ。ResolutionHarnessと
// 同様にコンテナへ整数拡大表示する。ズーム倍率は実時間ベースで往復させ、
// 行ごとにサンプリング幅が変わる透視ズーム(床面が奥へ傾いて見える)の
// 見え方を確認できるようにする(物理エンジンには接続しない)。
// Task#17(Suu承認): オフスクリーン+drawImageブリット拡大を廃止し、visible
// canvasのbacking storeをcontent解像度のまま保つ直接低解像度Canvas方式を採用
// (docs/phase1-report.md §10.3)。静止比較(等方vs透視)の2枚並び自体は
// drawPerspectiveComparison内部のレイアウトなので、backing store方式の変更は
// 比較目的(同一画面上での並び)に影響しない。
import { useEffect, useRef, useState } from 'react';
import { computeIntegerScale } from '../../retro/canvas/integerScale';
import { applyDirectCanvasBackingSize } from '../../retro/canvas/directCanvas';
import { loadPixelFonts } from '../../retro/text/pixelFonts';
import { drawMode7Demo } from './drawMode7Demo';
import { COMPARISON_CONTENT_H, COMPARISON_CONTENT_W, drawPerspectiveComparison } from './drawPerspectiveComparison';

const CONTENT_W = 160;
const CONTENT_H = 120;
const ZOOM_MIN = 1;
const ZOOM_MAX = 2.2;
const ZOOM_PERIOD_SEC = 4;

// PHASE1-REVIEW-FIX指摘4: 静止比較(等方版vs透視版、市松床)を主表示にする。
// 一様zoom往復のアニメーションは「ただのズームに見える」という人間レビュー指摘を
// 受け、傍証・補助表示に格下げする(見取り図デモ自体は残す)。
function PerspectiveComparisonPanel() {
  const [fontStatus, setFontStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 200 });

  useEffect(() => {
    loadPixelFonts().then((result) => setFontStatus(result.ok ? 'ok' : 'error'));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scaleResult = computeIntegerScale(containerSize.w, containerSize.h, COMPARISON_CONTENT_W, COMPARISON_CONTENT_H);

  useEffect(() => {
    if (fontStatus === 'loading' || !scaleResult.fits) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    applyDirectCanvasBackingSize(canvas, COMPARISON_CONTENT_W, COMPARISON_CONTENT_H);
    drawPerspectiveComparison(ctx);
  }, [fontStatus, scaleResult.fits, scaleResult.contentWidthPx, scaleResult.contentHeightPx]);

  return (
    <div ref={containerRef} className="relative h-[220px] overflow-hidden bg-slate-800">
      {scaleResult.fits ? (
        <canvas
          ref={canvasRef}
          style={{
            imageRendering: 'pixelated',
            width: `${scaleResult.contentWidthPx}px`,
            height: `${scaleResult.contentHeightPx}px`,
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ) : (
        <div className="flex h-full items-center justify-center px-4 text-center text-white">
          現在のviewportではcontent {COMPARISON_CONTENT_W}×{COMPARISON_CONTENT_H}が等倍でも収まりません(fits=false)。
        </div>
      )}
    </div>
  );
}

export function Mode7Demo() {
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scaleResult = computeIntegerScale(containerSize.w, containerSize.h, CONTENT_W, CONTENT_H);

  useEffect(() => {
    if (!scaleResult.fits) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    applyDirectCanvasBackingSize(canvas, CONTENT_W, CONTENT_H);

    let raf = 0;
    let startTime = performance.now();

    const loop = (now: number) => {
      const elapsedSec = (now - startTime) / 1000;
      const phase = (Math.sin((elapsedSec / ZOOM_PERIOD_SEC) * Math.PI * 2) + 1) / 2; // 0..1
      const zoom = ZOOM_MIN + (ZOOM_MAX - ZOOM_MIN) * phase;

      drawMode7Demo(ctx, CONTENT_W, CONTENT_H, zoom);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scaleResult.fits, scaleResult.contentWidthPx, scaleResult.contentHeightPx]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-sm">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold text-slate-800">主表示: 静止比較(等方ズーム vs 透視ズーム、密な市松床)</span>
        <span className="text-xs text-slate-600">
          同一zoom比・同一中心・同一奥行き校正で、行ごとのサンプリング幅を固定した等方ズーム(A)と、行ごとに変化させる透視ズーム(B)を並べる。透視版はタイル境界線が奥(画面上方)ほど密に見える
        </span>
      </div>
      <PerspectiveComparisonPanel />

      <div className="flex flex-col gap-1 border-t border-slate-300 pt-2">
        <span className="text-xs font-bold text-slate-500">補助表示: 見取り図の透視ズームアニメーション(演出専用、走行ビューには使用しない)</span>
        <span className="text-xs text-slate-500">
          ズーム倍率を時間で往復させ、行ごとにサンプリング幅が変わる透視ズーム+通常スプライト重ね合わせを確認する
        </span>
      </div>
      <div ref={containerRef} className="relative h-[260px] overflow-hidden bg-slate-800">
        {scaleResult.fits ? (
          <canvas
            ref={canvasRef}
            style={{
              imageRendering: 'pixelated',
              width: `${scaleResult.contentWidthPx}px`,
              height: `${scaleResult.contentHeightPx}px`,
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-white">
            現在のviewportではcontent {CONTENT_W}×{CONTENT_H}が等倍でも収まりません(fits=false)。
          </div>
        )}
      </div>
    </div>
  );
}
