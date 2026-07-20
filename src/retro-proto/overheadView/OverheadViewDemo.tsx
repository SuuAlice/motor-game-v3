// docs/phase1-plan.md §5.3: 俯瞰走行ビュー試作の表示ラッパー。表示アニメーションは
// 実時間ベースの見た目速度で進めるだけで、engine/の固定1/120s物理ループには
// 一切接続しない(性能測定の対象は描画負荷のみ、docs/phase1-plan.md §9.1)。
import { useEffect, useRef, useState } from 'react';
import { buildDummyTrackLoop } from './track';
import { drawOverheadView } from './drawOverheadView';

const TRACK_POINTS = buildDummyTrackLoop();
const CONTENT_W = 480;
const CONTENT_H = 270;
const DUMMY_SPEED_POINTS_PER_SEC = 18;

export function OverheadViewDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CONTENT_W;
    canvas.height = CONTENT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

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
      drawOverheadView(ctx, { trackPoints: TRACK_POINTS, carIndex }, CONTENT_W, CONTENT_H);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  return (
    <div className="flex h-full flex-col gap-3 p-3 text-sm">
      <div className="flex items-center gap-3">
        <button onClick={() => setRunning((r) => !r)} className="border px-2 py-1">
          {running ? '一時停止' : '再生'}
        </button>
        <span className="text-xs text-slate-600">
          壁つき周回コース・16方位スナップ車両・自機追従整数スクロール・接地影・G3高所オブジェクト遮蔽の試作(ダミー速度、物理エンジン非接続)
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-slate-800">
        <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', width: '960px', height: '540px' }} />
      </div>
    </div>
  );
}
