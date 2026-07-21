// docs/phase1-plan.md §5.4/Unit E: 色演算許可リスト検証タブ。Task#17(Suu承認)に
// より、オフスクリーン+drawImageブリット拡大を廃止し、visible canvasの
// backing storeをcontent解像度のまま保って直接描画する「直接低解像度Canvas
// 方式」を採用した(合成blitのコストを削減、docs/phase1-report.md §10.3)。
import { useEffect, useRef, useState } from 'react';
import { computeIntegerScale } from '../../retro/canvas/integerScale';
import { applyDirectCanvasBackingSize } from '../../retro/canvas/directCanvas';
import { loadPixelFonts } from '../../retro/text/pixelFonts';
import { drawColorOpsDemo } from './drawColorOpsDemo';

const CONTENT_W = 320;
const CONTENT_H = 200;

export function ColorOpsDemo() {
  const [fontStatus, setFontStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const scaleResult = computeIntegerScale(containerSize.w, containerSize.h, CONTENT_W, CONTENT_H);

  useEffect(() => {
    if (fontStatus === 'loading' || !scaleResult.fits) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    applyDirectCanvasBackingSize(canvas, CONTENT_W, CONTENT_H);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawColorOpsDemo(ctx, CONTENT_W, CONTENT_H);
  }, [fontStatus, scaleResult.fits, scaleResult.contentWidthPx, scaleResult.contentHeightPx]);

  return (
    <div className="flex h-full flex-col gap-3 p-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-600">
          色演算許可リスト(加算合成・50%平均合成)と市松ディザの比較。発光/煙/夕景の3行×(演算あり/演算なし/市松ディザ)3列
          / フォント: {fontStatus}
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
