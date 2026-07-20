// docs/phase1-plan.md §5.5/Unit F: Mode7見取り図ズームタブ。ResolutionHarnessと
// 同様にコンテナへ整数拡大表示する。ズーム倍率は実時間ベースで往復させ、
// ズームイン/アウトの見え方を確認できるようにする(物理エンジンには接続しない)。
import { useEffect, useRef, useState } from 'react';
import { computeIntegerScale } from '../../retro/canvas/integerScale';
import { drawMode7Demo } from './drawMode7Demo';

const CONTENT_W = 160;
const CONTENT_H = 120;
const ZOOM_MIN = 1;
const ZOOM_MAX = 2.2;
const ZOOM_PERIOD_SEC = 4;

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

    const offscreen = document.createElement('canvas');
    offscreen.width = CONTENT_W;
    offscreen.height = CONTENT_H;
    const offCtx = offscreen.getContext('2d');
    const ctx = canvas.getContext('2d');
    if (!offCtx || !ctx) return;
    ctx.imageSmoothingEnabled = false;

    canvas.width = scaleResult.contentWidthPx;
    canvas.height = scaleResult.contentHeightPx;

    let raf = 0;
    let startTime = performance.now();

    const loop = (now: number) => {
      const elapsedSec = (now - startTime) / 1000;
      const phase = (Math.sin((elapsedSec / ZOOM_PERIOD_SEC) * Math.PI * 2) + 1) / 2; // 0..1
      const zoom = ZOOM_MIN + (ZOOM_MAX - ZOOM_MIN) * phase;

      drawMode7Demo(offCtx, CONTENT_W, CONTENT_H, zoom);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0, CONTENT_W, CONTENT_H, 0, 0, canvas.width, canvas.height);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scaleResult.fits, scaleResult.contentWidthPx, scaleResult.contentHeightPx]);

  return (
    <div className="flex h-full flex-col gap-3 p-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-600">
          Mode7見取り図ズーム(行単位アフィン/透視ニアレストサンプリング)+通常スプライト重ね合わせ。演出専用、走行ビューには使用しない
        </span>
      </div>
      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-slate-800">
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
