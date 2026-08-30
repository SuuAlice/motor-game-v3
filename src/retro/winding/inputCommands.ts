// P4-1B B1(2026-08-30人間承認): P4-0で採用が確定した半自動巻線治具の**入力規則**を、
// production(通常の組み立て工程)からも使えるようにここへ移した。挙動は1つも変えていない。
//
// 移動元は`src/p40/inputs/inputCommands.ts`で、re-export shimは置かず全importerを明示更新した
// ——shimを残すと「どちらが正典か」が曖昧になり、P4-0の凍結範囲も広がってしまう。
// 生ドラッグ・パターン設計の専用kernelは選外案の比較証跡として移動元へ残している。
//
// **DOM・pointer・touch・keyboard・requestAnimationFrame・fpsは一切扱わない。**
// 各入力実装は自前のイベント処理で`WindingCommand`を組み立て、ここへ渡すだけにする——
// そうすることで「入力が同じ記録型へ落ちる」という前提が、実装ごとの解釈差に汚されずに保たれる。
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
// 入力実装が共有する型・定数。
// **componentファイルには純関数を置かない**——`.tsx`が component 以外をexportすると
// Fast Refreshが効かなくなる(oxlint react/only-export-components)。
// ---------------------------------------------------------------------------

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

/** 治具パッドの正規化座標(0〜1)。DOM座標はcomponent側で正規化してから渡す。 */
export interface PadPoint {
  readonly x: number;
  readonly y: number;
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
