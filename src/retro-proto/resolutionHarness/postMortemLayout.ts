// spec §7.2/art-spec §5.2: 検死レポート(破壊瞬間の物理ログ)。密な日本語+計測値の
// 文字密度題材。PHASE1-UNITD-REVIEW追加指摘: art-spec §2.2(整数ピクセル規律)に
// 適合させるため、文字位置・パネル・セグメント数値の座標算出をdrawPostMortemReport.ts
// (canvas依存)から分離した純関数。fillTextへ渡す座標も整数化する。
//
// PHASE1-REVIEW-FIX指摘2: PixelMplus10/12はビットマップ内蔵TTF(10px/12pxの
// ネイティブ解像度でのみシャープに表示される設計)のため、フォントサイズは常に
// 固定10px/12pxとする(候補ごとに動的スケールしない)。低解像度候補では全行が
// 収まらない場合があり、その場合は完全に収まる行だけを描画し、末尾に「残りN行」を
// 付与する(収まる場合のみ)。これにより「同一文字サイズでどれだけ情報量が入るか」
// という二層構成比較の本来の目的を可視化する。

export const FONT_TITLE_SIZE_PX = 12;
export const FONT_BODY_SIZE_PX = 10;
const LINE_HEIGHT_PX = Math.round(FONT_BODY_SIZE_PX * 1.25); // 13

export const BODY_LINES: readonly string[] = [
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

export interface TextLine {
  x: number;
  y: number;
  text: string;
}

export interface IntRect {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
}

export interface DigitRow {
  x: number;
  y: number;
  digitWidthPx: number;
  digitHeightPx: number;
  gapPx: number;
  thicknessPx: number;
  text: string;
}

export interface PostMortemLayout {
  title: TextLine & { sizePx: number };
  bodySizePx: number;
  bodyLines: TextLine[];
  /** 表示しきれなかった行数。0なら省略なし。 */
  omittedLineCount: number;
  panel: IntRect;
  digitRows: DigitRow[];
}

export function computePostMortemLayout(contentWidthPx: number, contentHeightPx: number): PostMortemLayout {
  const w = contentWidthPx;
  const h = contentHeightPx;

  const marginX = Math.round(w * 0.04);
  const titleY = Math.round(h * 0.06);
  const title = { x: marginX, y: titleY, text: '検死レポート', sizePx: FONT_TITLE_SIZE_PX };

  const bodyStartY = titleY + Math.round(FONT_TITLE_SIZE_PX * 1.5);
  const bodyBottomMarginPx = Math.round(h * 0.04);
  const availableHeightPx = Math.max(0, h - bodyStartY - bodyBottomMarginPx);
  const maxFullLines = Math.floor(availableHeightPx / LINE_HEIGHT_PX);

  const totalLines = BODY_LINES.length;
  let includedCount: number;
  let omittedLineCount = 0;

  if (maxFullLines >= totalLines) {
    includedCount = totalLines;
  } else if (maxFullLines >= 1) {
    // 最後の1行分を「残りN行」表示に使うため、収まる行数-1行だけ本文を描く。
    includedCount = maxFullLines - 1;
    omittedLineCount = totalLines - includedCount;
  } else {
    includedCount = 0;
  }

  const bodyLines: TextLine[] = [];
  let y = bodyStartY;
  for (let i = 0; i < includedCount; i++) {
    bodyLines.push({ x: marginX, y, text: BODY_LINES[i] });
    y += LINE_HEIGHT_PX;
  }
  if (omittedLineCount > 0) {
    bodyLines.push({ x: marginX, y, text: `…残り${omittedLineCount}行` });
  }

  const panelX = Math.round(w * 0.55);
  const panelY = Math.round(h * 0.06);
  const panelW = Math.round(w * 0.4);
  const panelH = Math.round(h * 0.24);
  const panel: IntRect = { x: panelX, y: panelY, widthPx: panelW, heightPx: panelH };

  const digitW = Math.max(4, Math.round(panelW * 0.08));
  const digitH = Math.max(8, Math.round(panelH * 0.32));
  const gap = Math.max(1, Math.round(digitW * 0.25));
  const thickness = Math.max(1, Math.round(digitW * 0.18));

  const digitRows: DigitRow[] = [
    {
      x: panelX + digitW,
      y: Math.round(panelY + panelH * 0.12),
      digitWidthPx: digitW,
      digitHeightPx: digitH,
      gapPx: gap,
      thicknessPx: thickness,
      text: '2.55A',
    },
    {
      x: panelX + digitW,
      y: Math.round(panelY + panelH * 0.56),
      digitWidthPx: digitW,
      digitHeightPx: digitH,
      gapPx: gap,
      thicknessPx: thickness,
      text: '196C',
    },
  ];

  return { title, bodySizePx: FONT_BODY_SIZE_PX, bodyLines, omittedLineCount, panel, digitRows };
}
