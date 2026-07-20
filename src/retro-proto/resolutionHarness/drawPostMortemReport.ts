// spec §7.2/art-spec §5.2: 検死レポート(破壊瞬間の物理ログ)。密な日本語+計測値の
// 文字密度題材として、二層構成候補cではUI層(960×540)側で描く想定(art-spec §2.1)。
// 人間承認の追加指示(3): セグメント風数値のモックを含める。
import { PALETTE } from '../../retro/palette';
import { drawSegmentString } from '../../retro/text/segmentDigits';
import { PIXEL_FONT_10, PIXEL_FONT_12 } from '../../retro/text/pixelFonts';

const BODY_LINES = [
  '破壊モード: D02 エナメル焼損',
  '発生条件: 過電流×放熱不足(HEAT系)',
  'コース: 廊下ストレート(耐久) / ラップ3',
  '',
  '直前10フレームの物理ログ(抜粋):',
  '  t=12.40s 電流 2.35A 温度 187C 回転数 8420rpm',
  '  t=12.42s 電流 2.41A 温度 189C 回転数 8390rpm',
  '  t=12.44s 電流 2.48A 温度 192C 回転数 8355rpm',
  '  t=12.46s 電流 2.55A 温度 196C 回転数 8300rpm(焼損検知)',
  '',
  '所見: 同一構成の過去走行と比較し、記録が3%低下していました。',
  '原因の確定にはガウスメーター等の計測器が必要です(症状→自動差分検知',
  '→計測器での原因確定、三段開示)。',
];

export function drawPostMortemReport(ctx: CanvasRenderingContext2D, contentWidthPx: number, contentHeightPx: number): void {
  const w = contentWidthPx;
  const h = contentHeightPx;
  ctx.clearRect(0, 0, w, h);

  // 「紙」様式の地(art-spec §5.2): N6地に暗色文字
  ctx.fillStyle = PALETTE.N6;
  ctx.fillRect(0, 0, w, h);

  const titleSizePx = Math.max(8, Math.round(h * 0.06));
  const bodySizePx = Math.max(6, Math.round(h * 0.038));
  const marginX = Math.round(w * 0.04);
  let y = Math.round(h * 0.06);

  ctx.fillStyle = PALETTE.N0;
  ctx.font = `${titleSizePx}px "${PIXEL_FONT_12}", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText('検死レポート', marginX, y);
  y += titleSizePx * 1.5;

  ctx.font = `${bodySizePx}px "${PIXEL_FONT_10}", sans-serif`;
  const lineHeight = Math.round(bodySizePx * 1.25);
  for (const line of BODY_LINES) {
    ctx.fillText(line, marginX, y);
    y += lineHeight;
  }

  // 計測値パネル(セグメント風数値、単色CRT様式: G2 on N0)
  const panelX = Math.round(w * 0.55);
  const panelY = Math.round(h * 0.06);
  const panelW = Math.round(w * 0.4);
  const panelH = Math.round(h * 0.24);
  ctx.fillStyle = PALETTE.N0;
  ctx.fillRect(panelX, panelY, panelW, panelH);

  const digitW = Math.max(4, Math.round(panelW * 0.08));
  const digitH = Math.max(8, Math.round(panelH * 0.32));
  const gap = Math.max(1, Math.round(digitW * 0.25));

  drawSegmentString(ctx, '2.55A', panelX + digitW, panelY + panelH * 0.12, digitW, digitH, gap, {
    onColor: PALETTE.G2,
    thicknessPx: Math.max(1, digitW * 0.18),
  });
  drawSegmentString(ctx, '196C', panelX + digitW, panelY + panelH * 0.56, digitW, digitH, gap, {
    onColor: PALETTE.G2,
    thicknessPx: Math.max(1, digitW * 0.18),
  });
}
