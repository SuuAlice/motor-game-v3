// P4-0 G5: 10メートル直線1コース・player 1台・ghost 1台だけの走行幾何。
//
// Phase 1で承認済みの俯瞰斜め3/4試作(`src/retro-proto/overheadView/`)から、P4-0に
// 必要な分だけをproduction helperへ引き上げたもの。**Mode 7・任意track・N台対応は
// 持ち込まない**(UI計画§6)。汎用化の要求が出たらPhase 5の周回コース側で扱う。
//
// 座標はすべて整数ピクセル(art-spec §2.2)。canvas依存を持たない純関数に閉じており、
// 描画は`drawPhase4Race.ts`が行う。
import { computeCarSpriteGeometry, type CarSpriteGeometry } from '../../retro-proto/overheadView/carSprite';

/** 走路の左右余白。start/finishの旗と車体幅が画面端で切れない値。 */
const TRACK_MARGIN_X_RATIO = 0.08;

/** 走路帯の上端・下端(content高さ比)。上に空、下にHUD余地を残す。 */
const TRACK_TOP_RATIO = 0.42;
const TRACK_BOTTOM_RATIO = 0.78;

/** 3/4視点で真横を向いた車=方位index 0。P4-0は直線のみで、車は常に右を向く。 */
const STRAIGHT_DIRECTION_INDEX = 0;

/** 軸ずれ由来の上下振動の最大振幅(ピクセル)。 */
export const MAX_VIBRATION_PX = 2;

/**
 * `axisOffsetMm`が何ミリで振動が最大になるか。**UI独自に巻線から振動を計算せず**、
 * engineが返した`axisOffsetMm`だけを入力にする(UI計画§6)。
 */
export const VIBRATION_FULL_SCALE_MM = 1;

export interface IntRect {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
}

export interface Phase4RaceGeometry {
  /** 走路帯。 */
  readonly trackRect: IntRect;
  /** 0メートル・10メートルのx座標。 */
  readonly startX: number;
  readonly finishX: number;
  /** playerとghostのレーン中心y。ghostは奥(上)側。 */
  readonly playerLaneY: number;
  readonly ghostLaneY: number;
  /** 区間境界のx座標(区間差表示と同じ粒度に揃える)。 */
  readonly sectionMarkerXs: readonly number[];
  readonly carSprite: CarSpriteGeometry;
}

/**
 * 距離(メートル)→x座標。**コース長を跨いで外挿しない**——完走後もtraceは
 * finish位置で止まるため、画面外へ走り抜けたように見せない。
 */
export function projectPositionToX(
  positionM: number,
  trackLengthM: number,
  startX: number,
  finishX: number,
): number {
  if (!(trackLengthM > 0)) return startX;
  const clamped = Math.min(Math.max(positionM, 0), trackLengthM);
  return Math.round(startX + ((finishX - startX) * clamped) / trackLengthM);
}

/**
 * 軸ずれ由来の上下振動(ピクセル)。整数を返し、サブピクセルへ逃がさない。
 * `reducedMotion`では常に0——振動は情報ではなく演出であり、止めても事実は失われない。
 */
export function computeVibrationOffsetPx(
  axisOffsetMm: number,
  elapsedS: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0;
  const ratio = Math.min(1, Math.max(0, Math.abs(axisOffsetMm) / VIBRATION_FULL_SCALE_MM));
  // 12Hz相当。整数丸めの結果、振幅0.5px未満の軸ずれでは静止して見える(嘘の揺れを足さない)。
  // `+ 0`は-0を0へ正規化するため(Math.roundは負の微小値に-0を返し、比較で紛れる)。
  return Math.round(Math.sin(elapsedS * 12 * Math.PI * 2) * MAX_VIBRATION_PX * ratio) + 0;
}

export function computePhase4RaceGeometry(
  contentWidthPx: number,
  contentHeightPx: number,
  trackLengthM: number,
  sectionBoundariesM: readonly number[],
): Phase4RaceGeometry {
  const marginX = Math.round(contentWidthPx * TRACK_MARGIN_X_RATIO);
  const startX = marginX;
  const finishX = contentWidthPx - marginX;
  const top = Math.round(contentHeightPx * TRACK_TOP_RATIO);
  const bottom = Math.round(contentHeightPx * TRACK_BOTTOM_RATIO);

  return {
    trackRect: { x: 0, y: top, widthPx: contentWidthPx, heightPx: bottom - top },
    startX,
    finishX,
    // 奥(上)がghost、手前(下)がplayer。3/4視点で手前ほど大きく見える配置に合わせる。
    ghostLaneY: Math.round(top + (bottom - top) * 0.32),
    playerLaneY: Math.round(top + (bottom - top) * 0.72),
    sectionMarkerXs: sectionBoundariesM.map((m) => projectPositionToX(m, trackLengthM, startX, finishX)),
    carSprite: computeCarSpriteGeometry(STRAIGHT_DIRECTION_INDEX),
  };
}

/**
 * trace上の時刻`tSec`における距離。**線形補間**で、標本間に無い山谷を作らない。
 * traceが空なら0、最終標本より後ろは最終値で止める(外挿しない)。
 */
export function samplePositionAtTime(
  trace: readonly { readonly t: number; readonly positionM: number }[],
  tSec: number,
): number {
  if (trace.length === 0) return 0;
  if (tSec <= trace[0].t) return trace[0].positionM;
  const last = trace[trace.length - 1];
  if (tSec >= last.t) return last.positionM;
  // 標本は時刻昇順。二分探索を持ち込むほどの長さではない(10秒×20Hz程度)。
  for (let i = 1; i < trace.length; i++) {
    const b = trace[i];
    if (b.t < tSec) continue;
    const a = trace[i - 1];
    const span = b.t - a.t;
    if (span <= 0) return b.positionM;
    return a.positionM + ((b.positionM - a.positionM) * (tSec - a.t)) / span;
  }
  return last.positionM;
}

/**
 * 区間ごとの所要時間(通過時刻の差)。未通過は`null`のまま伝える——
 * 走っていない区間を0秒として集計に混ぜない。
 */
export function computeSectionSplits(
  sectionTimes: readonly (number | null)[],
): readonly (number | null)[] {
  return sectionTimes.map((time, index) => {
    if (time === null) return null;
    if (index === 0) return time;
    const previous = sectionTimes[index - 1];
    return previous === null ? null : time - previous;
  });
}
