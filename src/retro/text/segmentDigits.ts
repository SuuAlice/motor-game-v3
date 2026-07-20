// art-spec §4: 計測数値は英数専用のセグメント風表示(7セグ/14セグを手続き描画で自作)。
// 人間承認の追加指示(3)(検死レポート題材にセグメント風数値のモックを含める)に対応する
// ため、Unit Dで前倒し実装する。フォントファイルは追加しない(手続き描画のみ)。
// セグメント割当はa(上)b(右上)c(右下)d(下)e(左下)f(左上)g(中央)の古典7セグ配列。
//
// PHASE1-UNITD-REVIEW追加指摘: art-spec §2.2(整数ピクセル規律)に適合させるため、
// セグメント矩形の座標算出をcomputeSegmentRects純関数へ分離し、返り値をすべて
// 整数化する。描画側(drawSegmentDigit/drawSegmentString)はこの結果をfillRectへ
// 渡すのみで、内部で追加の非整数演算を行わない。

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

export interface SegmentRect {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
}

function pushIntRect(rects: SegmentRect[], x: number, y: number, widthPx: number, heightPx: number): void {
  rects.push({
    x: Math.round(x),
    y: Math.round(y),
    widthPx: Math.max(1, Math.round(widthPx)),
    heightPx: Math.max(1, Math.round(heightPx)),
  });
}

// 1桁分の点灯セグメントを矩形リストとして返す純関数。全フィールドを整数化する
// (art-spec §2.2)。widthPx/heightPxが奇数でも内部のhalfH等の非整数中間値は
// 各矩形の生成時にMath.roundするため、返り値は常に整数になる。
export function computeSegmentRects(
  char: string,
  x: number,
  y: number,
  widthPx: number,
  heightPx: number,
  thicknessPx: number,
): SegmentRect[] {
  const [a, b, c, d, e, f, g] = getSegmentPattern(char);
  const t = Math.max(1, Math.round(thicknessPx));
  const halfH = heightPx / 2;
  const rects: SegmentRect[] = [];

  if (a) pushIntRect(rects, x + t, y, widthPx - 2 * t, t);
  if (b) pushIntRect(rects, x + widthPx - t, y + t, t, halfH - 1.5 * t);
  if (c) pushIntRect(rects, x + widthPx - t, y + halfH + 0.5 * t, t, halfH - 1.5 * t);
  if (d) pushIntRect(rects, x + t, y + heightPx - t, widthPx - 2 * t, t);
  if (e) pushIntRect(rects, x, y + halfH + 0.5 * t, t, halfH - 1.5 * t);
  if (f) pushIntRect(rects, x, y + t, t, halfH - 1.5 * t);
  if (g) pushIntRect(rects, x + t, y + halfH - t / 2, widthPx - 2 * t, t);

  return rects;
}

export interface SegmentStyle {
  onColor: string;
  thicknessPx: number;
}

// 1桁分のセグメントを塗りつぶし矩形で描画する(副作用あり、canvas依存のためテスト対象外。
// ロジックはgetSegmentPattern/computeSegmentRectsに集約しそちらをユニットテストする)。
export function drawSegmentDigit(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  widthPx: number,
  heightPx: number,
  style: SegmentStyle,
): void {
  ctx.fillStyle = style.onColor;
  for (const rect of computeSegmentRects(char, x, y, widthPx, heightPx, style.thicknessPx)) {
    ctx.fillRect(rect.x, rect.y, rect.widthPx, rect.heightPx);
  }
}

// 文字列(数字・'-'・空白)を横に並べて描画する。開始位置・桁送り幅も整数化する。
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
  let cx = Math.round(x);
  const roundedY = Math.round(y);
  const stepPx = Math.round(digitWidthPx + gapPx);
  for (const char of text) {
    drawSegmentDigit(ctx, char, cx, roundedY, digitWidthPx, digitHeightPx, style);
    cx += stepPx;
  }
}
