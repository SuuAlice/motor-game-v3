// P4-1B B3/B4(2026-08-30人間承認): 巻線の軌跡ビュー(production)。
//
// 480×270を整数倍で拡大しletterboxする既存規律に従う(art-spec §2.1)。
// **未測定のうちは「収まりません」を出さない**——`useRetroCanvasFrame`が返す`display`が
// `measuring`のときは案内文だけを出す。初回表示・メニュー往復・再入場のたびに
// 警告が点滅していた欠陥(D2)の恒久是正。
import { useEffect } from 'react';
import { useRetroCanvasFrame } from '../useRetroCanvasFrame';
import { drawWindingTrace } from '../../retro/winding/drawWindingTrace';
import type { WindingJigState } from '../../retro/winding/windingTraceGeometry';
import type { WindingRecord } from '../../materials/windingRecord';

export function WindingTraceView({ record, jig }: { record: WindingRecord; jig?: WindingJigState }) {
  const { containerRef, canvasRef, contentRes, scaleResult, display } = useRetroCanvasFrame();

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d') ?? null;
    if (context === null || display !== 'ready') return;
    context.imageSmoothingEnabled = false;
    drawWindingTrace(context, record, contentRes.w, contentRes.h, jig);
  }, [record, jig, canvasRef, contentRes.w, contentRes.h, display]);

  return (
    <div ref={containerRef} className="relative h-[480px] overflow-hidden rounded-xl bg-slate-900 sm:h-[270px]">
      {display === 'measuring' && (
        <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-300">
          巻線ビューを準備しています。
        </div>
      )}
      {display === 'tooSmall' && (
        <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white">
          現在の画面では巻線ビュー(content {contentRes.w}×{contentRes.h})が等倍でも収まりません。
        </div>
      )}
      {display === 'ready' && (
        <canvas ref={canvasRef} aria-label="巻線の軌跡"
          style={{
            imageRendering: 'pixelated',
            width: `${scaleResult.contentWidthPx}px`,
            height: `${scaleResult.contentHeightPx}px`,
            position: 'absolute',
            left: `${scaleResult.offsetXPx}px`,
            top: `${scaleResult.offsetYPx}px`,
          }} />
      )}
    </div>
  );
}
