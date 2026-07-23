// native <dialog>はtop layerへ昇格するため、通常のposition:absolute相対配置(containerRef基準)を
// そのまま使うと位置がずれる可能性がある(Suu_mot3コードレビュー指摘)。position:fixedを維持した
// まま、containerRef自身のgetBoundingClientRect()からviewport座標を都度計算し、ウィンドウの
// スクロール・リサイズにも追従する。
import { useLayoutEffect, useState, type RefObject } from 'react';

export function useElementViewportRect(ref: RefObject<HTMLElement | null>, active: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }
    const update = () => setRect(ref.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [active, ref]);

  return rect;
}
