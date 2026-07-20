// art-spec §2.2: 色演算は許可リスト方式(スーファミのカラーマス相当)。許可されるのは
// 加算合成(発光: 火花・炎のコア・ヘッドライト・CRT計測画面のにじみ)と50%平均合成
// (半透明: 煙の希薄化・霧・ガラス・夕景/夜景の空気遠近)の2種類のみ。それ以外の
// 半透明表現は従来どおり市松ディザ(1px checker)で行う。許可リストへの追加は承認事項。
//
// 色はPALETTE参照の#rrggbb文字列を受け取り、演算結果も#rrggbb文字列で返す純関数
// として実装する(globalAlpha/globalCompositeOperationのようなCanvas側の状態に
// 依存しないため、Node環境でも決定論的にユニットテストできる)。呼び出し側は
// 演算結果の色でfillRectする(art-spec §2.2の整数ピクセル規律とも両立する)。

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

// 加算合成: C = min(255, Cs + Cd)。発光表現に使う。
export function blendAdditive(baseHex: string, overlayHex: string): string {
  const [br, bg, bb] = hexToRgb(baseHex);
  const [or_, og, ob] = hexToRgb(overlayHex);
  return rgbToHex(br + or_, bg + og, bb + ob);
}

// 50%平均合成: C = (Cs + Cd) / 2。半透明表現に使う。
export function blend50Average(baseHex: string, overlayHex: string): string {
  const [br, bg, bb] = hexToRgb(baseHex);
  const [or_, og, ob] = hexToRgb(overlayHex);
  return rgbToHex((br + or_) / 2, (bg + og) / 2, (bb + ob) / 2);
}

// 市松ディザ: 許可リスト外の半透明表現の代替。整数ピクセル座標(xPx, yPx)を受け取り、
// そのピクセルでoverlay色を使うか(true)base色を使うか(false)を返す(1pxチェッカー)。
export function isDitherOn(xPx: number, yPx: number): boolean {
  return (Math.trunc(xPx) + Math.trunc(yPx)) % 2 === 0;
}
