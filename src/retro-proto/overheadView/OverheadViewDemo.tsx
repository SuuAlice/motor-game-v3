// docs/phase1-plan.md §5.3: 俯瞰走行ビュー試作の表示ラッパー。表示アニメーションは
// 実時間ベースの見た目速度で進めるだけで、engine/の固定1/120s物理ループには
// 一切接続しない(性能測定の対象は描画負荷のみ、docs/phase1-plan.md §9.1)。
// PHASE1-UNITD-REVIEW点3: 固定960×540ではなくUnit Aの整数拡大(computeIntegerScale)で
// コンテナに収め、スマホ縦横でも操作不能にならないようにする。等倍でも不成立の場合は
// ResolutionHarnessと同様に明示表示する。
import { useEffect, useRef, useState } from 'react';
import { computeIntegerScale } from '../../retro/canvas/integerScale';
import { buildDummyTrackLoop } from './track';
import { drawOverheadView } from './drawOverheadView';

const TRACK_POINTS = buildDummyTrackLoop();
const CONTENT_W = 480;
const CONTENT_H = 270;
const DUMMY_SPEED_POINTS_PER_SEC = 18;

export function OverheadViewDemo() {
  const [running, setRunning] = useState(true);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

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

    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
      offscreenRef.current.width = CONTENT_W;
      offscreenRef.current.height = CONTENT_H;
    }
    const offscreen = offscreenRef.current;
    const offCtx = offscreen.getContext('2d');
    const ctx = canvas.getContext('2d');
    if (!offCtx || !ctx) return;
    offCtx.imageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;

    canvas.width = scaleResult.contentWidthPx;
    canvas.height = scaleResult.contentHeightPx;

    let raf = 0;
    let progress = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const elapsedSec = Math.min((now - lastTime) / 1000, 0.25);
      lastTime = now;
      if (running) {
        progress += elapsedSec * DUMMY_SPEED_POINTS_PER_SEC;
      }
      const carIndex = Math.floor(progress) % TRACK_POINTS.length;
      drawOverheadView(offCtx, { trackPoints: TRACK_POINTS, carIndex }, CONTENT_W, CONTENT_H);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0, CONTENT_W, CONTENT_H, 0, 0, canvas.width, canvas.height);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, scaleResult.fits, scaleResult.contentWidthPx, scaleResult.contentHeightPx]);

  return (
    <div className="flex h-full flex-col gap-3 p-3 text-sm">
      <div className="flex items-center gap-3">
        <button onClick={() => setRunning((r) => !r)} className="border px-2 py-1">
          {running ? '一時停止' : '再生'}
        </button>
        <span className="text-xs text-slate-600">
          壁つき周回コース・16方位3/4視点車両・自機追従整数スクロール・接地影・G3高所オブジェクト遮蔽の試作(ダミー速度、物理エンジン非接続)
          / content {CONTENT_W}×{CONTENT_H} / 倍率: {scaleResult.fits ? `${scaleResult.scale}x` : '不成立'}
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
