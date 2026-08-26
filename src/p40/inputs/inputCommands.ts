// P4-0 G1b(UI計画§4・engine計画§5.2): 3入力案が共通で出力する**意味コマンド**と、
// それを巻線記録へ適用する純reducer。
//
// **DOM・pointer・touch・keyboard・requestAnimationFrame・fpsは一切扱わない。**
// 各入力案は自前のイベント処理で`WindingCommand`を組み立て、ここへ渡すだけにする——
// そうすることで「3案が同じ記録型へ落ちる」という比較の前提が、
// 入力実装ごとの解釈差に汚されずに保たれる(計画§5.2)。
//
// 記録の型・量子化・検証・置換はalice所有の正典`src/materials/windingRecord.ts`が
// 単一出典であり、**本ファイルは別実装を持たない**。
import {
  MAX_WINDING_TURNS,
  quantizeWindingValue,
  replaceWindingRange,
  type WindingArm,
  type WindingDirection,
  type WindingRecord,
  type WindingTurn,
  type WindingValidationResult,
} from '../../materials/windingRecord';

/**
 * 3入力案が共通して出力する意味コマンド(計画§5.2の正典定義)。
 * DOMイベントをそのまま流さず、必ずこの形へ正規化してからreducerへ渡す。
 */
export type WindingCommand =
  | { readonly kind: 'setGuide'; readonly position: number; readonly arm: WindingArm }
  | { readonly kind: 'setTension'; readonly tension: number }
  | { readonly kind: 'setDirection'; readonly direction: WindingDirection }
  | { readonly kind: 'advanceTurn' }
  | { readonly kind: 'replaceRange'; readonly start: number; readonly deleteCount: number; readonly turns: WindingRecord };

/**
 * 巻線入力の現在状態。`advanceTurn`が来た時点のguide/tension/directionが
 * そのまま1ターンとして確定する(計画§5.2)。
 */
export interface WindingInputState {
  /** 現在のguide位置。0〜1、量子化済み。 */
  readonly position: number;
  readonly arm: WindingArm;
  /** 現在の張力。0〜1、量子化済み。**P4-0では物理へ接続しない**。 */
  readonly tension: number;
  readonly direction: WindingDirection;
  readonly record: WindingRecord;
}

/**
 * 初期状態。中央(0.5)・straddle・張力0.5・順方向・記録なし。
 * **量子化格子上の値だけを初期値に選んでいる**(0.5 = 128/256)。
 */
export const INITIAL_WINDING_INPUT_STATE: WindingInputState = {
  position: 0.5,
  arm: 'straddle',
  tension: 0.5,
  direction: 1,
  record: [],
};

const VALID_ARMS: readonly WindingArm[] = ['left', 'right', 'straddle'];

/**
 * コマンドを1件適用する。
 *
 * **引数は破壊しない**——`state`も`state.record`も変更せず、新しい値を返す。
 * 拒否時は`ok:false`と理由を返し、**stateは一切変更しない**(呼出し側が
 * 直前の状態をそのまま使い続けられる)。
 *
 * `advanceTurn`は上限超過を**黙ってclampしない**。上限で止めて理由を返すことで、
 * 「巻いたはずの本数と記録の本数が食い違う」状態を作らない。
 */
export function applyWindingCommand(
  state: WindingInputState,
  command: WindingCommand,
): WindingValidationResult<WindingInputState> {
  switch (command.kind) {
    case 'setGuide': {
      if (!VALID_ARMS.includes(command.arm)) {
        return { ok: false, reason: `armが不正です: ${String(command.arm)}` };
      }
      const position = quantizeWindingValue(command.position);
      if (position === null) {
        return { ok: false, reason: `positionが0〜1の有限値ではありません: ${String(command.position)}` };
      }
      return { ok: true, value: { ...state, position, arm: command.arm } };
    }
    case 'setTension': {
      const tension = quantizeWindingValue(command.tension);
      if (tension === null) {
        return { ok: false, reason: `tensionが0〜1の有限値ではありません: ${String(command.tension)}` };
      }
      return { ok: true, value: { ...state, tension } };
    }
    case 'setDirection': {
      if (command.direction !== 1 && command.direction !== -1) {
        return { ok: false, reason: `directionが不正です: ${String(command.direction)}` };
      }
      return { ok: true, value: { ...state, direction: command.direction } };
    }
    case 'advanceTurn': {
      if (state.record.length >= MAX_WINDING_TURNS) {
        return { ok: false, reason: `記録は上限${MAX_WINDING_TURNS}ターンです(現在${state.record.length}ターン)` };
      }
      const turn: WindingTurn = {
        position: state.position,
        arm: state.arm,
        direction: state.direction,
        tension: state.tension,
      };
      return { ok: true, value: { ...state, record: [...state.record, turn] } };
    }
    case 'replaceRange': {
      // 半開区間の置換は正典へ委譲する(範囲検査・上限・引数非破壊も正典の責務)。
      const replaced = replaceWindingRange(state.record, command.start, command.deleteCount, command.turns);
      if (!replaced.ok) return { ok: false, reason: replaced.reason };
      return { ok: true, value: { ...state, record: replaced.value } };
    }
  }
}

/**
 * コマンド列をまとめて適用する。**1件でも拒否されたらそこで止めて理由を返す**——
 * 途中まで適用した状態を返すと、呼出し側が「どこまで通ったか」を追えなくなる。
 */
export function applyWindingCommands(
  state: WindingInputState,
  commands: readonly WindingCommand[],
): WindingValidationResult<WindingInputState> {
  let current = state;
  for (const [index, command] of commands.entries()) {
    const next = applyWindingCommand(current, command);
    if (!next.ok) return { ok: false, reason: `コマンド${index}(${command.kind}): ${next.reason}` };
    current = next.value;
  }
  return { ok: true, value: current };
}

// ---------------------------------------------------------------------------
// P4-0 G2: 3入力案が共有する型・定数と、各案の純関数kernel。
// **componentファイルには純関数を置かない**——`.tsx`が component 以外をexportすると
// Fast Refreshが効かなくなる(oxlint react/only-export-components)。
// ---------------------------------------------------------------------------

/** 3案のcomponentが共通で受け取るprops。 */
export interface WindingInputProps {
  readonly position: number;
  readonly arm: WindingArm;
  readonly tension: number;
  readonly direction: WindingDirection;
  readonly turnCount: number;
  readonly maxTurns: number;
  readonly onCommand: (command: WindingCommand) => void;
  readonly disabledReason: string | null;
}

/** キーボード操作の1ステップ量(1/32)。3案で共通。 */
export const KEY_STEP = 1 / 32;

// --- 案I: 生ドラッグ -------------------------------------------------------

/** 治具パッドの正規化座標(0〜1)。DOM座標はcomponent側で正規化してから渡す。 */
export interface PadPoint {
  readonly x: number;
  readonly y: number;
}

/** 累積回転の状態。一周(2π)ごとに1ターン確定する。 */
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

/** 横位置0〜1をposition、左1/3・中央1/3・右1/3をarmへ写す。 */
export function resolveGuideFromX(x: number): { readonly position: number; readonly arm: WindingArm } {
  const clamped = Math.min(1, Math.max(0, x));
  const arm: WindingArm = clamped < 1 / 3 ? 'left' : clamped > 2 / 3 ? 'right' : 'straddle';
  return { position: clamped, arm };
}

/** 現在値。keyboard写像の入力。 */
export interface WindingCurrentValues {
  readonly position: number;
  readonly arm: WindingArm;
  readonly tension: number;
  readonly direction: WindingDirection;
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

// --- 案II: 半自動治具 -------------------------------------------------------

/** 1ターンあたりの固定記録tick。30ターンなら30秒。 */
export const SEMI_AUTO_TICK_MS = 1000;

export interface TickState {
  /** これまでに発行済みのターン数。**経過msの累積は持たない**(下記の理由)。 */
  readonly emittedTicks: number;
}

export const INITIAL_TICK_STATE: TickState = { emittedTicks: 0 };

/**
 * **始動からの経過ms**を受け取り、まだ発行していないtick数を返す。
 *
 * 毎フレームの差分を足し込む方式は採らない——`1000/60`のような値を300回加算すると
 * 総和が数e-12だけ不足し、**60fpsでは30秒走っても29ターンにしかならない**
 * (30fpsでは30ターン)という、fpsに依存した記録差が実測で出た。
 * 絶対経過時間から発行済み数を引く形にすれば、加算誤差が入る余地がない。
 *
 * 非有限・負の経過は0として扱う(時計の巻き戻りで記録が減らないようにする)。
 */
export function advanceTicks(
  state: TickState,
  elapsedSinceStartMs: number,
): { readonly next: TickState; readonly ticks: number } {
  const elapsed = Number.isFinite(elapsedSinceStartMs) && elapsedSinceStartMs > 0 ? elapsedSinceStartMs : 0;
  const total = Math.floor(elapsed / SEMI_AUTO_TICK_MS);
  const ticks = Math.max(0, total - state.emittedTicks);
  return { next: { emittedTicks: state.emittedTicks + ticks }, ticks };
}

/**
 * 治具パッド上のpointer座標(正規化0..1)を、guideと張力へ写す(案II-B)。
 *
 * 横 = ガイド位置(既存`resolveGuideFromX`でposition/armへ)、
 * 縦 = 張力(**上端0・下端1**。線を下へ引くほど強く張る、という実物の動きに合わせる)。
 * 範囲外はclampする——パッドの外へ指が出ても値が飛ばないようにする。
 *
 * **速度・加速度・慣性・筆圧は使わない**(1点の位置だけで決まる)。量子化は
 * 共通reducerが唯一の出典なので、ここでは行わない。
 */
export function resolvePadInput(point: PadPoint): {
  readonly position: number;
  readonly arm: WindingArm;
  readonly tension: number;
} {
  const guide = resolveGuideFromX(point.x);
  const y = Number.isFinite(point.y) ? point.y : 0;
  return { ...guide, tension: Math.min(1, Math.max(0, y)) };
}

/** 案IIのキーボード操作→意味コマンド(Space=始動/停止はcomponent側が扱う)。 */
export function resolveJigKeyCommand(
  key: string,
  current: WindingCurrentValues,
  step: number = KEY_STEP,
): WindingCommand | null {
  switch (key) {
    case 'a': case 'A': case 'ArrowLeft': return { kind: 'setGuide', ...resolveGuideFromX(current.position - step) };
    case 'd': case 'D': case 'ArrowRight': return { kind: 'setGuide', ...resolveGuideFromX(current.position + step) };
    case 'w': case 'W': case 'ArrowUp': return { kind: 'setTension', tension: Math.min(1, current.tension + step) };
    case 's': case 'S': case 'ArrowDown': return { kind: 'setTension', tension: Math.max(0, current.tension - step) };
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
