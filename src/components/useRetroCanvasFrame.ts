// 店・在庫画面(docs/phase2-ui-shop-plan.md v4)向けの直接低解像度Canvasマウント共通処理。
// Phase1のOverheadViewDemo(src/retro-proto/overheadView/OverheadViewDemo.tsx)と同じ
// 整数拡大・orientation切替パターンを踏襲する(v4 §10: Phase1承認済み解像度・規律を継承)。
import { useEffect, useRef, useState } from 'react';
import { computeIntegerScale } from '../retro/canvas/integerScale';
import { applyDirectCanvasBackingSize } from '../retro/canvas/directCanvas';
import { selectOrientedResolution, type ContentResolution } from '../retro/canvas/orientation';

const LANDSCAPE_CONTENT: ContentResolution = { w: 480, h: 270 };

export function useRetroCanvasFrame() {
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
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

  const contentRes = selectOrientedResolution(containerSize.w, containerSize.h, LANDSCAPE_CONTENT);
  const scaleResult = computeIntegerScale(containerSize.w, containerSize.h, contentRes.w, contentRes.h);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scaleResult.fits) return;
    applyDirectCanvasBackingSize(canvas, contentRes.w, contentRes.h);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.imageSmoothingEnabled = false;
  }, [contentRes.w, contentRes.h, scaleResult.fits]);

  return { containerRef, canvasRef, contentRes, scaleResult };
}
