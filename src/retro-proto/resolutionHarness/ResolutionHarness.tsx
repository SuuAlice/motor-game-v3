// PHASE1-PLAN-01-REV2【1】/docs/phase1-plan.md Unit D: 解像度4案×3題材の
// 試作ハーネス。CSSピクセル基準・物理ピクセル(DPR考慮)基準を切り替えて比較できる。
// オフスクリーンに内部解像度のまま描画し、可視canvasへニアレストネイバーで
// ブリット拡大する(整数拡大の実装方針、Unit A)。
import { useEffect, useRef, useState } from 'react';
import { computeIntegerScale, computeIntegerScalePhysical } from '../../retro/canvas/integerScale';
import { selectOrientedResolution } from '../../retro/canvas/orientation';
import { loadPixelFonts } from '../../retro/text/pixelFonts';
import { generateDummyWindingRecord } from './dummyWindingRecord';
import { drawWindingTrace } from './drawWindingTrace';
import { drawGarageIllustration } from './drawGarageIllustration';
import { drawPostMortemReport } from './drawPostMortemReport';

const CANDIDATES = [
  { id: 'a', label: '(a) 320×180 単層', world: { w: 320, h: 180 }, ui: { w: 320, h: 180 } },
  { id: 'b', label: '(b) 480×270 単層', world: { w: 480, h: 270 }, ui: { w: 480, h: 270 } },
  { id: 'c', label: '(c) ワールド480×270+UI960×540(本命)', world: { w: 480, h: 270 }, ui: { w: 960, h: 540 } },
  { id: 'd', label: '(d) 640×360 単層', world: { w: 640, h: 360 }, ui: { w: 640, h: 360 } },
] as const;

type CandidateId = (typeof CANDIDATES)[number]['id'];

const MATERIALS = [
  { id: 'winding', label: '乱巻き軌跡(ワールド層)', layer: 'world' },
  { id: 'garage', label: 'ガレージ一枚絵(ワールド層)', layer: 'world' },
  { id: 'postmortem', label: '検死レポート(UI層)', layer: 'ui' },
] as const;

type MaterialId = (typeof MATERIALS)[number]['id'];

const WINDING_RECORD = generateDummyWindingRecord();

export function ResolutionHarness() {
  const [candidateId, setCandidateId] = useState<CandidateId>('c');
  const [materialId, setMaterialId] = useState<MaterialId>('winding');
  const [usePhysical, setUsePhysical] = useState(false);
  const [fontStatus, setFontStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

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

  const candidate = CANDIDATES.find((c) => c.id === candidateId) ?? CANDIDATES[2];
  const material = MATERIALS.find((m) => m.id === materialId) ?? MATERIALS[0];
  const landscapeRes = material.layer === 'ui' ? candidate.ui : candidate.world;
  // art-spec §2.1: スマホ縦画面は内部解像度を縦持ち用に転置する(PHASE1-UNITH-REVIEW指摘)。
  const contentRes = selectOrientedResolution(containerSize.w, containerSize.h, landscapeRes);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const scaleResult = usePhysical
    ? computeIntegerScalePhysical(containerSize.w, containerSize.h, dpr, contentRes.w, contentRes.h)
    : computeIntegerScale(containerSize.w, containerSize.h, contentRes.w, contentRes.h);

  useEffect(() => {
    if (fontStatus === 'loading' || !scaleResult.fits) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = contentRes.w;
    offscreen.height = contentRes.h;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    if (materialId === 'winding') drawWindingTrace(offCtx, WINDING_RECORD, contentRes.w, contentRes.h);
    else if (materialId === 'garage') drawGarageIllustration(offCtx, contentRes.w, contentRes.h);
    else drawPostMortemReport(offCtx, contentRes.w, contentRes.h);

    const scaledW = scaleResult.contentWidthPx;
    const scaledH = scaleResult.contentHeightPx;
    canvas.width = scaledW;
    canvas.height = scaledH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, scaledW, scaledH);
    ctx.drawImage(offscreen, 0, 0, contentRes.w, contentRes.h, 0, 0, scaledW, scaledH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId, contentRes.w, contentRes.h, fontStatus, scaleResult.fits, scaleResult.contentWidthPx, scaleResult.contentHeightPx]);

  const displayWidthCss = scaleResult.fits ? scaleResult.contentWidthPx / (usePhysical ? dpr : 1) : 0;
  const displayHeightCss = scaleResult.fits ? scaleResult.contentHeightPx / (usePhysical ? dpr : 1) : 0;

  return (
    <div className="flex h-full flex-col gap-3 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">
          解像度案:
          <select
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value as CandidateId)}
            className="border px-1"
          >
            {CANDIDATES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          題材:
          <select
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value as MaterialId)}
            className="border px-1"
          >
            {MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={usePhysical} onChange={(e) => setUsePhysical(e.target.checked)} />
          物理ピクセル(DPR{dpr})基準
        </label>
        <span className="text-xs text-slate-600">
          content: {contentRes.w}×{contentRes.h} / 倍率: {scaleResult.fits ? `${scaleResult.scale}x` : '不成立'} / フォント: {fontStatus}
        </span>
      </div>
      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-slate-800">
        {scaleResult.fits ? (
          <canvas
            ref={canvasRef}
            style={{
              imageRendering: 'pixelated',
              width: `${displayWidthCss}px`,
              height: `${displayHeightCss}px`,
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-white">
            現在のviewportではcontent {contentRes.w}×{contentRes.h}が等倍でも収まりません(fits=false)。
          </div>
        )}
      </div>
    </div>
  );
}
