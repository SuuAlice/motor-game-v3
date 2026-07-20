// PHASE1-PLAN-01-REV2【1】【2】の検証データ。CSSピクセル基準と物理ピクセル
// (devicePixelRatio考慮)基準の両方で、4解像度案×代表viewportの整数倍率と
// 二層構成の倍率整合(偶数成立)を機械的に算出し、比較表として出力する。
// 仕様(art-spec)の緩和策は決めず、成立/不成立の事実のみを返す。

import { computeIntegerScale, computeIntegerScalePhysical, type PhysicalScaleResult, type ScaleResult } from './integerScale';
import { checkTwoLayerAlignment, type TwoLayerAlignment } from './layeredCanvasConstraint';

export interface ResolutionCandidate {
  id: 'a' | 'b' | 'c' | 'd';
  label: string;
  /** 横画面基準のワールド内部解像度。 */
  worldWidthPx: number;
  worldHeightPx: number;
  /** 候補cのみ二層構成(UI層はワールド×2固定)。 */
  hasUiLayer: boolean;
}

export const RESOLUTION_CANDIDATES: ResolutionCandidate[] = [
  { id: 'a', label: '320×180単層', worldWidthPx: 320, worldHeightPx: 180, hasUiLayer: false },
  { id: 'b', label: '480×270単層', worldWidthPx: 480, worldHeightPx: 270, hasUiLayer: false },
  { id: 'c', label: 'ワールド480×270+UI960×540(本命)', worldWidthPx: 480, worldHeightPx: 270, hasUiLayer: true },
  { id: 'd', label: '640×360単層', worldWidthPx: 640, worldHeightPx: 360, hasUiLayer: false },
];

export interface ViewportSpec {
  id: string;
  label: string;
  orientation: 'portrait' | 'landscape';
  /** CSS viewport(幅×高さ、px)。 */
  widthPx: number;
  heightPx: number;
  /** 代表devicePixelRatio。実機の非整数DPR(例: 2.625)も含む。 */
  devicePixelRatio: number;
}

// Suuレビュー(PHASE1-PLAN-01-REV2-REVIEW点3)により縦横を訂正済み:
// 縦持ちは幅<高さ、横持ちは幅>高さ(CSS viewport width×height)。
export const VIEWPORTS: ViewportSpec[] = [
  { id: 'phone-360x640', label: 'スマホ縦 360×640 @DPR2', orientation: 'portrait', widthPx: 360, heightPx: 640, devicePixelRatio: 2 },
  { id: 'phone-390x844', label: 'スマホ縦 390×844 @DPR3', orientation: 'portrait', widthPx: 390, heightPx: 844, devicePixelRatio: 3 },
  { id: 'phone-414x896', label: 'スマホ縦 414×896 @DPR2', orientation: 'portrait', widthPx: 414, heightPx: 896, devicePixelRatio: 2 },
  { id: 'phone-412x915', label: 'スマホ縦 412×915 @DPR2.625(非整数DPR例)', orientation: 'portrait', widthPx: 412, heightPx: 915, devicePixelRatio: 2.625 },
  { id: 'phone-640x360', label: 'スマホ横 640×360 @DPR2', orientation: 'landscape', widthPx: 640, heightPx: 360, devicePixelRatio: 2 },
  { id: 'phone-844x390', label: 'スマホ横 844×390 @DPR3', orientation: 'landscape', widthPx: 844, heightPx: 390, devicePixelRatio: 3 },
  { id: 'phone-896x414', label: 'スマホ横 896×414 @DPR2', orientation: 'landscape', widthPx: 896, heightPx: 414, devicePixelRatio: 2 },
  { id: 'tablet-768x1024', label: 'タブレット縦 768×1024 @DPR2', orientation: 'portrait', widthPx: 768, heightPx: 1024, devicePixelRatio: 2 },
  { id: 'tablet-1024x768', label: 'タブレット横 1024×768 @DPR2', orientation: 'landscape', widthPx: 1024, heightPx: 768, devicePixelRatio: 2 },
  { id: 'desktop-1280x800', label: 'デスクトップ 1280×800 @DPR1', orientation: 'landscape', widthPx: 1280, heightPx: 800, devicePixelRatio: 1 },
  { id: 'desktop-1920x1080', label: 'デスクトップ 1920×1080 @DPR1', orientation: 'landscape', widthPx: 1920, heightPx: 1080, devicePixelRatio: 1 },
];

export interface ReportRow {
  viewportId: string;
  viewportLabel: string;
  candidateId: ResolutionCandidate['id'];
  candidateLabel: string;
  /** 縦持ちviewportではワールド寸法を転置(art-spec §2.1のスマホ縦画面転置に対応)。 */
  contentWidthPx: number;
  contentHeightPx: number;
  css: ScaleResult;
  physical: PhysicalScaleResult;
  /** 候補cかつ収まる場合のみ非null。 */
  twoLayerCss: TwoLayerAlignment | null;
  twoLayerPhysical: TwoLayerAlignment | null;
}

export function buildReportRows(
  viewports: ViewportSpec[] = VIEWPORTS,
  candidates: ResolutionCandidate[] = RESOLUTION_CANDIDATES,
): ReportRow[] {
  const rows: ReportRow[] = [];

  for (const viewport of viewports) {
    for (const candidate of candidates) {
      const [contentWidthPx, contentHeightPx] =
        viewport.orientation === 'portrait'
          ? [candidate.worldHeightPx, candidate.worldWidthPx]
          : [candidate.worldWidthPx, candidate.worldHeightPx];

      const css = computeIntegerScale(viewport.widthPx, viewport.heightPx, contentWidthPx, contentHeightPx);
      const physical = computeIntegerScalePhysical(
        viewport.widthPx,
        viewport.heightPx,
        viewport.devicePixelRatio,
        contentWidthPx,
        contentHeightPx,
      );

      rows.push({
        viewportId: viewport.id,
        viewportLabel: viewport.label,
        candidateId: candidate.id,
        candidateLabel: candidate.label,
        contentWidthPx,
        contentHeightPx,
        css,
        physical,
        twoLayerCss: candidate.hasUiLayer && css.fits ? checkTwoLayerAlignment(css.scale) : null,
        twoLayerPhysical: candidate.hasUiLayer && physical.fits ? checkTwoLayerAlignment(physical.scale) : null,
      });
    }
  }

  return rows;
}
