// Task#17調査で発見したクラッシュの修正: WorstCaseDemoの描画ループで
// `Math.floor(progress) % TRACK_POINTS.length`を直接使っていたところ、
// headless Chromium(Playwright)実行時にrequestAnimationFrameの初回コール
// バックタイムスタンプ(now)が、直前に同期的に取得したperformance.now()
// (lastTime)よりわずかに(実測約12ms)小さくなる事象を確認した。これにより
// elapsedSecが負になりprogressも負転し、JSの`%`演算子は負数に対して
// 数学的な剰余ではなく符号を保持した値を返す(例: -1 % 144 === -1)ため、
// carIndex=-1のような範囲外インデックスが生じ、TRACK_POINTS[-1]が
// undefinedになって描画が例外で停止していた。
//
// 実ブラウザ(人間の手元環境)ではrAFのタイムスタンプは通常の垂直同期に
// 基づき、effect内で直前に取得したperformance.now()より前になることは
// 実質的に起こらないため再現しなかったと考えられる(プロジェクトリード
// 環境で754フレームの計測が成功している事実と整合する)。ただし将来
// 別の環境・別の原因で同種のprogress不整合が起きても描画が落ちないよう、
// carIndexの算出を「trackLengthは正の整数」「返り値は常に0以上
// trackLength未満の有限整数」という不変条件を持つ純関数として切り出し、
// テストで固定する(配列アクセスをoptional chainingで隠す対症療法はしない)。
export function computeCarIndex(progress: number, trackLength: number): number {
  if (!Number.isInteger(trackLength) || trackLength <= 0) {
    throw new Error(`trackLength must be a positive integer, got ${trackLength}`);
  }
  if (!Number.isFinite(progress)) {
    throw new Error(`progress must be finite, got ${progress}`);
  }
  // JSの`%`は負数に対して符号を保持するため、+trackLengthしてから
  // 再度%trackLengthを取ることで数学的modulo(常に0以上)にする。
  const wrapped = ((Math.floor(progress) % trackLength) + trackLength) % trackLength;
  return wrapped;
}
