// P3-4 G7-E(a11y項目10、UI計画§13): `prefers-reduced-motion`の判定。
// 判定だけを純関数側へ出し、画面はこの結果を使うだけにする(テストで固定するため)。

/** メディアクエリの最小面。実`window.matchMedia`をそのまま渡せる。 */
export interface MediaQueryMatcher {
  (query: string): { matches: boolean };
}

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 動きを減らすべきかを判定する。
 * `matchMedia`が無い環境(SSR・テスト)では**動かす側**を既定にする——
 * 判定できないことを理由に演出を止めると、症状が見えなくなる方向へ倒れるため。
 */
export function prefersReducedMotion(matchMedia: MediaQueryMatcher | undefined): boolean {
  if (matchMedia === undefined) return false;
  return matchMedia(REDUCED_MOTION_QUERY).matches;
}
