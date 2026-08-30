// P4-0 G2: 選外入力案(案I 生ドラッグ・案III パターン設計)の専用kernel。
//
// **比較証跡として凍結する**——P4-1Bで採用された半自動治具の入力規則は
// `src/retro/winding/inputCommands.ts`へ移設済みで、本ファイルはそこをimportする。
// 選外案の修理・挙動変更・production化は行わない(arbiter技術論点9)。
//
// **componentファイルには純関数を置かない**——`.tsx`が component 以外をexportすると
// Fast Refreshが効かなくなる(oxlint react/only-export-components)。
import type { WindingArm, WindingDirection } from '../../materials/windingRecord';
import {
  KEY_STEP,
  resolveGuideFromX,
  type WindingCommand,
  type WindingCurrentValues,
  type PadPoint,
} from '../../retro/winding/inputCommands';


// --- 案I: 生ドラッグ -------------------------------------------------------

export interface RotationState {
  /** 直前の点の角度(rad)。未接触ならnull。 */
  readonly lastAngle: number | null;
  /** 未確定の累積回転量(rad)。 */
  readonly accumulatedRad: number;
}

export const INITIAL_ROTATION_STATE: RotationState = { lastAngle: null, accumulatedRad: 0 };

const TWO_PI = Math.PI * 2;

/**
 * 1点分の移動を累積し、**一周ぶん溜まったターン数**を返す。
 *
 * 角度差は-π〜πへ正規化する——正規化しないと、±πの境界をまたいだ瞬間に約2πの差が入り、
 * 指を少し動かしただけで1ターン増えてしまう。回転の向きは問わない。
 * **rAF・描画frame数・実時間を使わない**(frame数に依存すると60/30 fpsで
 * 同じ操作が別の記録になり、3案比較の前提が壊れる)。
 */
export function advanceRotation(
  state: RotationState,
  point: PadPoint,
): { readonly next: RotationState; readonly completedTurns: number } {
  const angle = Math.atan2(point.y - 0.5, point.x - 0.5);
  if (state.lastAngle === null) {
    return { next: { lastAngle: angle, accumulatedRad: 0 }, completedTurns: 0 };
  }
  let delta = angle - state.lastAngle;
  while (delta > Math.PI) delta -= TWO_PI;
  while (delta < -Math.PI) delta += TWO_PI;

  const accumulated = state.accumulatedRad + delta;
  const completedTurns = Math.floor(Math.abs(accumulated) / TWO_PI);
  const remainder = accumulated - Math.sign(accumulated) * completedTurns * TWO_PI;
  return { next: { lastAngle: angle, accumulatedRad: remainder }, completedTurns };
}

/** 指を離した/パッド外へ出たら累積を捨てる(半端な回転を持ち越さない)。 */
export function releaseRotation(): RotationState {
  return INITIAL_ROTATION_STATE;
}


/** 案Iのキーボード操作→意味コマンド。pointerと同じ意味列になることをテストで固定する。 */
export function resolveKeyCommand(
  key: string,
  current: WindingCurrentValues,
  step: number = KEY_STEP,
): WindingCommand | null {
  switch (key) {
    case 'ArrowLeft': return { kind: 'setGuide', ...resolveGuideFromX(current.position - step) };
    case 'ArrowRight': return { kind: 'setGuide', ...resolveGuideFromX(current.position + step) };
    case 'ArrowUp': return { kind: 'setTension', tension: Math.min(1, current.tension + step) };
    case 'ArrowDown': return { kind: 'setTension', tension: Math.max(0, current.tension - step) };
    case 'Enter': return { kind: 'advanceTurn' };
    case 'r': case 'R': return { kind: 'setDirection', direction: current.direction === 1 ? -1 : 1 };
    default: return null;
  }
}

// --- 案III: パターン設計 ----------------------------------------------------

/** 制御点は固定4個。追加・削除・並べ替えはしない(G2の比較最小)。 */
export const PATTERN_POINT_COUNT = 4;

export interface PatternPoint {
  readonly position: number;
  readonly tension: number;
}

/** 4分割した各区間のarm/direction。点と同じく固定4個。 */
export interface PatternSegment {
  readonly arm: WindingArm;
  readonly direction: WindingDirection;
}

export interface PatternDesign {
  readonly points: readonly PatternPoint[];
  readonly segments: readonly PatternSegment[];
}

export const DEFAULT_PATTERN: PatternDesign = {
  points: [
    { position: 0.25, tension: 0.5 },
    { position: 0.5, tension: 0.5 },
    { position: 0.5, tension: 0.5 },
    { position: 0.75, tension: 0.5 },
  ],
  segments: [
    { arm: 'left', direction: 1 },
    { arm: 'straddle', direction: 1 },
    { arm: 'straddle', direction: 1 },
    { arm: 'right', direction: 1 },
  ],
};

/**
 * `turnCount`ターンぶんのcommand列へ決定論的に展開する。
 *
 * i番目のターンは、4点を等間隔に置いた折れ線上の`t = i/(turnCount-1)`で線形補間する。
 * 区間は`floor(t * 4)`で割り当て、末尾は最後の区間に含める。
 * **乱数・時刻・frame数を使わないため、同じ設計からは常に同じ列が出る。**
 * **量子化はしない**——1/256格子への写像は共通reducerが唯一の出典である。
 */
export function expandPatternToCommands(design: PatternDesign, turnCount: number): readonly WindingCommand[] {
  if (!Number.isInteger(turnCount) || turnCount <= 0) return [];
  const commands: WindingCommand[] = [];
  let lastArm: WindingArm | null = null;
  let lastDirection: WindingDirection | null = null;
  let lastPosition: number | null = null;
  let lastTension: number | null = null;

  for (let i = 0; i < turnCount; i += 1) {
    const t = turnCount === 1 ? 0 : i / (turnCount - 1);
    const span = design.points.length - 1;
    const scaled = t * span;
    const lower = Math.min(span - 1, Math.floor(scaled));
    const frac = scaled - lower;
    const a = design.points[lower]!;
    const b = design.points[lower + 1]!;
    const position = a.position + (b.position - a.position) * frac;
    const tension = a.tension + (b.tension - a.tension) * frac;

    const segmentIndex = Math.min(design.segments.length - 1, Math.floor(t * design.segments.length));
    const segment = design.segments[segmentIndex]!;

    // 変化したときだけcommandを出す(同値の再設定は記録を変えないが、列を短く保つ)。
    if (position !== lastPosition || segment.arm !== lastArm) {
      commands.push({ kind: 'setGuide', position, arm: segment.arm });
      lastPosition = position;
      lastArm = segment.arm;
    }
    if (tension !== lastTension) {
      commands.push({ kind: 'setTension', tension });
      lastTension = tension;
    }
    if (segment.direction !== lastDirection) {
      commands.push({ kind: 'setDirection', direction: segment.direction });
      lastDirection = segment.direction;
    }
    commands.push({ kind: 'advanceTurn' });
  }
  return commands;
}
