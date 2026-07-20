// Unit A成果物: viewport×4解像度案の整数倍率・二層倍率整合を一覧出力する。
// ロジック本体はsrc/retro/canvas/viewportReport.tsの純関数(テスト済み)。
// 本スクリプトは結果を人間可読なテーブルとしてstdoutへ出すだけの薄いCLI。
import { buildReportRows } from '../src/retro/canvas/viewportReport';

function fmtScale(fits: boolean, scale: number): string {
  return fits ? `${scale}x` : '不成立';
}

function fmtTwoLayer(alignment: { isEven: boolean; uiScale: number | null } | null): string {
  if (!alignment) return '-';
  return alignment.isEven ? `成立(UI${alignment.uiScale}x)` : '不成立(奇数)';
}

const rows = buildReportRows();

const header = [
  'viewport',
  '候補',
  'content(px)',
  'CSS倍率',
  'CSS二層',
  '物理倍率(DPR)',
  '物理二層',
].join(' | ');
console.log(header);
console.log('-'.repeat(header.length));

for (const row of rows) {
  console.log(
    [
      row.viewportLabel,
      row.candidateLabel,
      `${row.contentWidthPx}x${row.contentHeightPx}`,
      fmtScale(row.css.fits, row.css.scale),
      fmtTwoLayer(row.twoLayerCss),
      fmtScale(row.physical.fits, row.physical.scale),
      fmtTwoLayer(row.twoLayerPhysical),
    ].join(' | '),
  );
}
