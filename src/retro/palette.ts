// art-spec §3: マスターパレット(スーファミ級体制: コア32+拡張16+会場サブパレット16/会場)。
// Phase1で凍結対象とするのは共通コア32色+拡張16色(計48色)のみ。会場サブパレット16色・
// 塗装バンク(paints.ts)はPhase1では追加しない(PHASE1-PLAN-01-REV2【3】、Suuレビュー条件)。
// コード内のRGB直値使用はscripts/checkPaletteUsage.ts(Unit B)で検査する。
// 値はart-spec §3の表からの転記であり、Phase1試作での検証・凍結を経てから最終値とする。

export const CORE_PALETTE = {
  // ニュートラル(8色) — 輪郭・鋼・アルミ・煙・UI地
  N0: '#0d0d10',
  N1: '#2a2a33',
  N2: '#4a4a57',
  N3: '#6e6e7d',
  N4: '#9494a3',
  N5: '#bcbcc8',
  N6: '#e0e0e6',
  N7: '#f8f8f4',
  // 金属ウォーム(4色) — 銅線・真鍮・エナメル光沢
  M0: '#7a3b1e',
  M1: '#b5622a',
  M2: '#e08a3c',
  M3: '#f5c96a',
  // 赤(3色) — 危険・アルニコ・車体アクセント
  R0: '#7a1f24',
  R1: '#c73e3a',
  R2: '#f27d6a',
  // 炎ランプ(4色) — パレットサイクル専用(D02/D04)
  F0: '#fff3b0',
  F1: '#f8d148',
  F2: '#ef7d2f',
  F3: '#b3202a',
  // 緑(3色) — 成功・計測CRT
  G0: '#1e4d3b',
  G1: '#3a915f',
  G2: '#4af077',
  // 青(4色) — 空・パララックス遠景・LCD
  B0: '#1b2a52',
  B1: '#2f5da8',
  B2: '#4f9be8',
  B3: '#a8dcf0',
  // 黄(2色) — 火花・注意表示
  Y0: '#8f6a1e',
  Y1: '#ffd23e',
  // 紫(2色) — 最上位ティア・レア表示のアクセント
  P0: '#5a2a6e',
  P1: '#b45ad0',
  // 茶(2色) — 地面・木製小物
  W0: '#4a2f1c',
  W1: '#8a5a33',
} as const;

// 拡張16色 — 中間調・夕景・自然(背景の階調用)。全シーン共通。
export const EXTENDED_PALETTE = {
  M4: '#4d2410',
  R3: '#f5b0a0',
  G3: '#7fd18b',
  G4: '#b8e8a0',
  B4: '#12203d',
  B5: '#d8ecf8',
  Y2: '#ffe98a',
  P2: '#d9a0e8',
  W2: '#b5885a',
  W3: '#e0c090',
  S0: '#6e3050',
  S1: '#c05a6a',
  S2: '#e88a5a',
  S3: '#f8c890',
  T0: '#2a5a68',
  T1: '#78c8d8',
} as const;

export const PALETTE = { ...CORE_PALETTE, ...EXTENDED_PALETTE } as const;

export type PaletteKey = keyof typeof PALETTE;
