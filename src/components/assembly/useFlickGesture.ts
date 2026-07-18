import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface Sample {
  x: number;
  t: number;
}

// 組み立てモード始動工程専用: ポインターを離した瞬間の速度(直近の移動量/経過時間)を
// 算出する。useDragAccumulator(累積距離)とは異なり、フリックの「勢い」を見る。
export function useFlickGesture(onRelease: (velocityPxPerMs: number) => void) {
  const last = useRef<Sample | null>(null);
  const prev = useRef<Sample | null>(null);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    const sample = { x: e.clientX, t: performance.now() };
    last.current = sample;
    prev.current = sample;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!last.current) return;
    prev.current = last.current;
    last.current = { x: e.clientX, t: performance.now() };
  }, []);

  const onPointerUp = useCallback(() => {
    if (last.current && prev.current) {
      const dt = last.current.t - prev.current.t;
      const dx = last.current.x - prev.current.x;
      if (dt > 0) onRelease(dx / dt);
    }
    last.current = null;
    prev.current = null;
  }, [onRelease]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}
