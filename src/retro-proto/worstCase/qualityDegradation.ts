// Task#17性能ボトルネック対応(Suu承認済み仕様): 非機能要件「遅延時は時間を
// 飛ばさず描画品質を下げる」に沿い、Mode7インセットの描画負荷が高い状態が
// 続いたらサンプリング粒度を1px→2pxへ下げ、canvas API呼び出し回数を減らす。
//
// 瞬間のフレーム時間ではなく移動平均(指数移動平均、EMA)を使い、さらに
// 「一定フレーム数連続で閾値を超えた/下回った」場合のみ品質を切り替える
// (ヒステリシス: 低下側の閾値・連続フレーム数より、復帰側を厳しく・長く
// することで、境界付近での頻繁な切り替え=ちらつきを防ぐ)。
//
// この状態はFrameProbe(frameProbe.ts、p50/p95/p99等のDoD計測用)の
// サンプル窓とは完全に独立させる。品質判定にはFrameProbeの収集配列を
// 参照・流用しない(計測対象と品質判定対象を混同しない)。
export type Mode7Quality = 'full' | 'reduced';

export const MODE7_STEP_PX: Record<Mode7Quality, number> = {
  full: 1,
  reduced: 2,
};

export interface QualityMonitorState {
  quality: Mode7Quality;
  /** nullは「まだ1フレームも観測していない」ことを表す(0との混同を避ける)。 */
  emaMs: number | null;
  /** quality==='full'のとき、閾値超過が連続した回数。 */
  overStreak: number;
  /** quality==='reduced'のとき、閾値未満が連続した回数。 */
  underStreak: number;
}

export interface QualityMonitorConfig {
  /** EMAの平滑化係数(0<alpha<=1、大きいほど直近フレームの影響が強い)。 */
  emaAlpha: number;
  /** この値をEMAが超える状態が続くと品質を下げる(既定16.7ms、フレーム予算)。 */
  degradeThresholdMs: number;
  /** この値をEMAが下回る状態が続くと品質を戻す。degradeThresholdMsより
   *  小さい値にすることで、閾値ちょうど付近での往復(ちらつき)を防ぐ。 */
  recoverThresholdMs: number;
  /** quality==='full'のとき、品質を下げるまでに要する連続フレーム数。 */
  degradeAfterFrames: number;
  /** quality==='reduced'のとき、品質を戻すまでに要する連続フレーム数。
   *  degradeAfterFramesより大きくすることで、下げるより戻すほうを慎重にする。 */
  recoverAfterFrames: number;
}

export const DEFAULT_QUALITY_MONITOR_CONFIG: QualityMonitorConfig = {
  emaAlpha: 0.1,
  degradeThresholdMs: 16.7,
  recoverThresholdMs: 12,
  degradeAfterFrames: 30,
  recoverAfterFrames: 90,
};

export function createInitialQualityMonitorState(): QualityMonitorState {
  return { quality: 'full', emaMs: null, overStreak: 0, underStreak: 0 };
}

// 1フレーム分のdrawPhaseMs(描画処理のみの所要時間、FrameProbeの計測対象
// =rAF間隔全体とは別物)を受け取り、次の状態を返す純関数。
export function updateQualityMonitor(
  prev: QualityMonitorState,
  frameTimeMs: number,
  config: QualityMonitorConfig = DEFAULT_QUALITY_MONITOR_CONFIG,
): QualityMonitorState {
  if (!Number.isFinite(frameTimeMs) || frameTimeMs < 0) {
    throw new Error(`frameTimeMs must be a non-negative finite number, got ${frameTimeMs}`);
  }

  // 初回フレームはEMAを直接frameTimeMsで初期化する(0からの立ち上がりで
  // 過小評価しないため)。
  const emaMs = prev.emaMs === null ? frameTimeMs : prev.emaMs + config.emaAlpha * (frameTimeMs - prev.emaMs);

  if (prev.quality === 'full') {
    const overStreak = emaMs > config.degradeThresholdMs ? prev.overStreak + 1 : 0;
    if (overStreak >= config.degradeAfterFrames) {
      return { quality: 'reduced', emaMs, overStreak: 0, underStreak: 0 };
    }
    return { quality: 'full', emaMs, overStreak, underStreak: 0 };
  }

  const underStreak = emaMs < config.recoverThresholdMs ? prev.underStreak + 1 : 0;
  if (underStreak >= config.recoverAfterFrames) {
    return { quality: 'full', emaMs, overStreak: 0, underStreak: 0 };
  }
  return { quality: 'reduced', emaMs, overStreak: 0, underStreak };
}
