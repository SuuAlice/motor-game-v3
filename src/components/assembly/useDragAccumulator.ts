import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

// 組み立てモードのジェスチャー系工程(コイル巻き・やすりがけ)で共有する、
// ポインターのドラッグ移動距離を累積するフック。1本の指/マウスの往復運動を
// 「作業量」として素朴に合計する(円運動かどうかは判定しない、MVPの割り切り)。
export function useDragAccumulator(onAccumulate: (distancePx: number) => void) {
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!lastPos.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      lastPos.current = { x: e.clientX, y: e.clientY };
      if (distance > 0) onAccumulate(distance);
    },
    [onAccumulate],
  );

  const onPointerUp = useCallback(() => {
    lastPos.current = null;
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}
