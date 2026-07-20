// art-spec §4: 計測数値は英数専用のセグメント風表示(7セグ/14セグを手続き描画で自作)。
// 人間承認の追加指示(3)(検死レポート題材にセグメント風数値のモックを含める)に対応する
// ため、Unit Dで前倒し実装する。フォントファイルは追加しない(手続き描画のみ)。
// セグメント割当はa(上)b(右上)c(右下)d(下)e(左下)f(左上)g(中央)の古典7セグ配列。

export type SegmentPattern = readonly [boolean, boolean, boolean, boolean, boolean, boolean, boolean];

const DIGIT_SEGMENTS: Record<string, SegmentPattern> = {
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
  '-': [false, false, false, false, false, false, true],
  ' ': [false, false, false, false, false, false, false],
};

// 文字ごとのセグメント点灯パターンを返す純関数。未対応文字は空欄(全消灯)。
export function getSegmentPattern(char: string): SegmentPattern {
  return DIGIT_SEGMENTS[char] ?? DIGIT_SEGMENTS[' '];
}

export interface SegmentStyle {
  onColor: string;
  thicknessPx: number;
}

// 1桁分のセグメントを塗りつぶし矩形で描画する(副作用あり、canvas依存のためテスト対象外。
// ロジックはgetSegmentPatternに集約しそちらをユニットテストする)。
export function drawSegmentDigit(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  widthPx: number,
  heightPx: number,
  style: SegmentStyle,
): void {
  const [a, b, c, d, e, f, g] = getSegmentPattern(char);
  const t = Math.max(1, Math.round(style.thicknessPx));
  const halfH = heightPx / 2;
  ctx.fillStyle = style.onColor;

  if (a) ctx.fillRect(x + t, y, widthPx - 2 * t, t);
  if (b) ctx.fillRect(x + widthPx - t, y + t, t, halfH - 1.5 * t);
  if (c) ctx.fillRect(x + widthPx - t, y + halfH + 0.5 * t, t, halfH - 1.5 * t);
  if (d) ctx.fillRect(x + t, y + heightPx - t, widthPx - 2 * t, t);
  if (e) ctx.fillRect(x, y + halfH + 0.5 * t, t, halfH - 1.5 * t);
  if (f) ctx.fillRect(x, y + t, t, halfH - 1.5 * t);
  if (g) ctx.fillRect(x + t, y + halfH - t / 2, widthPx - 2 * t, t);
}

// 文字列(数字・'-'・空白)を横に並べて描画する。
export function drawSegmentString(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  digitWidthPx: number,
  digitHeightPx: number,
  gapPx: number,
  style: SegmentStyle,
): void {
  let cx = x;
  for (const char of text) {
    drawSegmentDigit(ctx, char, cx, y, digitWidthPx, digitHeightPx, style);
    cx += digitWidthPx + gapPx;
  }
}
