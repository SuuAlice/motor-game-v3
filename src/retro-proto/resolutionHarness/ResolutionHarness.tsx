// PHASE1-PLAN-01-REV2【1】/docs/phase1-plan.md Unit D: 解像度4案×3題材の
// 試作ハーネス。CSSピクセル基準・物理ピクセル(DPR考慮)基準を切り替えて比較できる。
// Task#17(Suu承認)により、可視canvasのbacking storeを拡大後サイズ(物理ピクセル
// 基準では巨大になりうる)にする方式から、常にcontent解像度に保つ「直接低解像度
// Canvas方式」へ変更した(docs/phase1-report.md §10.3)。物理ピクセル基準は
// computeDirectCanvasPhysicalCssSize(directCanvas.ts)で、CSS表示寸法=
// content×整数physicalScale/DPRとして算出する(backing storeはcontent解像度の
// まま拡大しない)。候補c(UI層960×540)がCSSコンテナに収まるかという比較目的
// (PHASE1-REVIEW-FIX指摘1)自体は、backing store方式の変更による影響を受けない。
import { useEffect, useRef, useState } from 'react';
import { computeIntegerScale } from '../../retro/canvas/integerScale';
import { applyDirectCanvasBackingSize, computeDirectCanvasPhysicalCssSize } from '../../retro/canvas/directCanvas';
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
  const cssScaleResult = computeIntegerScale(containerSize.w, containerSize.h, contentRes.w, contentRes.h);
  const physicalScaleResult = computeDirectCanvasPhysicalCssSize(containerSize.w, containerSize.h, dpr, contentRes.w, contentRes.h);

  const fits = usePhysical ? physicalScaleResult.fits : cssScaleResult.fits;
  const displayWidthCss = usePhysical ? physicalScaleResult.cssWidthPx : cssScaleResult.contentWidthPx;
  const displayHeightCss = usePhysical ? physicalScaleResult.cssHeightPx : cssScaleResult.contentHeightPx;
  const scaleLabel = usePhysical ? `${physicalScaleResult.physicalScale}x(物理)` : `${cssScaleResult.scale}x`;

  useEffect(() => {
    if (fontStatus === 'loading' || !fits) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    applyDirectCanvasBackingSize(canvas, contentRes.w, contentRes.h);

    if (materialId === 'winding') drawWindingTrace(ctx, WINDING_RECORD, contentRes.w, contentRes.h);
    else if (materialId === 'garage') drawGarageIllustration(ctx, contentRes.w, contentRes.h);
    else drawPostMortemReport(ctx, contentRes.w, contentRes.h);
  }, [materialId, contentRes.w, contentRes.h, fontStatus, fits]);

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
          content: {contentRes.w}×{contentRes.h} / 倍率: {fits ? scaleLabel : '不成立'} / フォント: {fontStatus}
        </span>
        {usePhysical && fits && (!physicalScaleResult.cssWidthIsIntegerPx || !physicalScaleResult.cssHeightIsIntegerPx) && (
          <span className="text-xs text-yellow-700">
            注意: このDPR({dpr})とcontentの組み合わせではCSS表示寸法が非整数ピクセル({displayWidthCss.toFixed(3)}×
            {displayHeightCss.toFixed(3)}px)になります。ブラウザの実レイアウトでの丸めにより物理ピクセル境界がずれる可能性があります(既知の制約)。
          </span>
        )}
      </div>
      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-slate-800">
        {fits ? (
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
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-xs text-white">
            {/* PHASE1-REVIEW-FIX指摘1: 必要サイズ・現在のCSS寸法・DPR・利用可能な
                物理サイズを明示し、なぜ収まらないかを人間が即座に判断できるようにする。
                未承認の非整数縮小(独自のfits=false救済)は行わない。 */}
            <p className="text-sm font-bold">現在の条件ではcontent {contentRes.w}×{contentRes.h}が等倍でも収まりません(fits=false)</p>
            <p>基準: {usePhysical ? '物理ピクセル(DPR考慮)' : 'CSSピクセル'}</p>
            <p>
              現在のコンテナ(CSS): {containerSize.w}×{containerSize.h}px / devicePixelRatio: {dpr}
            </p>
            <p>
              利用可能な物理ピクセル(コンテナ×DPR): {Math.round(containerSize.w * dpr)}×{Math.round(containerSize.h * dpr)}px
            </p>
            {!usePhysical && (
              <p className="text-yellow-300">
                「物理ピクセル(DPR{dpr})基準」を有効にすると、DPR&gt;1の環境ではより小さいCSSコンテナでも成立する場合があります。
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
