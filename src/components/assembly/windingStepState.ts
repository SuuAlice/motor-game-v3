// P4-1B B2(2026-08-30人間承認): production巻線工程の有限状態。
//
// **純関数として`.tsx`の外に置く**——componentに閉じると「材料を固定したか」「記録を保持したか」
// を数値で検証できず、DOM rendererを持たない本リポジトリでは回帰が書けない。
//
// 記録の型・量子化・検証は`src/materials/windingRecord.ts`、入力規則は
// `src/retro/winding/inputCommands.ts`、完成の可否は`src/store/rotorAssembly.ts`が
// それぞれ単一出典であり、**本ファイルはどれも再実装しない**。
import { MAX_WINDING_TURNS, MIN_RUNNABLE_WINDING_TURNS, type WindingRecord } from '../../materials/windingRecord';
import { computeMaxTurns } from '../../engine/motorPhysics';
import type { CompleteRotorAssemblyFailure } from '../../store/rotorAssembly';

/**
 * 巻き始めに固定する加工値。**1ターン記録した後は変更できない**——
 * 線径や並列本数が変わると既に記録したターンの意味(占積・上限)が変わってしまい、
 * 「どのターンが消えたか」を説明できないまま巻数だけが切り詰められる。
 * 旧`CoilWindingStep`はまさにこの黙った切り詰め(`Math.min(prev.coilTurns, nextMax)`)をしていた。
 */
export interface WindingLot {
  readonly wireMaterialId: string;
  readonly windingWireGaugeMm: number;
  readonly windingParallelStrands: 1 | 2;
}

/**
 * 工程の状態。判別unionにするのは、**表現できてはいけない状態を型で消す**ため。
 * 例えば`failed`に理由を持たせず`review`へ混ぜると「理由があるのに成功扱い」が作れてしまう。
 */
export type WindingStepState =
  | { readonly kind: 'lotPending' }
  | { readonly kind: 'lotFixed'; readonly lot: WindingLot }
  | { readonly kind: 'winding'; readonly lot: WindingLot; readonly record: WindingRecord }
  | { readonly kind: 'review'; readonly lot: WindingLot; readonly record: WindingRecord }
  | {
      readonly kind: 'failed';
      readonly lot: WindingLot;
      /** **失敗しても記録は捨てない**。再試行で同じ記録から完成を試せる。 */
      readonly record: WindingRecord;
      readonly failure: CompleteRotorAssemblyFailure;
    };

export const INITIAL_WINDING_STEP_STATE: WindingStepState = { kind: 'lotPending' };

export type WindingStepAction =
  | { readonly kind: 'fixLot'; readonly lot: WindingLot }
  /** 材料を選び直す。1ターン以上あるときは呼出し側が確認を取ってから送る。 */
  | { readonly kind: 'changeLot' }
  | { readonly kind: 'setRecord'; readonly record: WindingRecord }
  | { readonly kind: 'toReview' }
  | { readonly kind: 'backToWinding' }
  | { readonly kind: 'completionFailed'; readonly failure: CompleteRotorAssemblyFailure }
  | { readonly kind: 'reset' };

/** 記録を持つ段階か。`changeLot`で確認が要るかの判断に使う。 */
export function hasRecordedTurns(state: WindingStepState): boolean {
  return (state.kind === 'winding' || state.kind === 'review' || state.kind === 'failed') && state.record.length > 0;
}

/** 現在の記録。まだ巻いていない段階では空配列。 */
export function currentRecord(state: WindingStepState): WindingRecord {
  return state.kind === 'winding' || state.kind === 'review' || state.kind === 'failed' ? state.record : [];
}

export function currentLot(state: WindingStepState): WindingLot | null {
  return state.kind === 'lotPending' ? null : state.lot;
}

/**
 * この工程で巻ける上限。`computeMaxTurns`(物理)と記録スキーマ上限の小さい方。
 * **UIはこの値を表示にしか使わない**——完成の可否は`resolveRotorAssemblyCompletion`が
 * 単独で執行する(UI clampだけの二重契約を作らない、技術論点8)。
 */
export function resolveDisplayTurnLimit(lot: WindingLot): number {
  return Math.min(MAX_WINDING_TURNS, computeMaxTurns(lot.windingWireGaugeMm, lot.windingParallelStrands));
}

/** 完成ボタンを押せる段階か(押した結果の可否はstoreが決める)。 */
export function canRequestCompletion(state: WindingStepState): boolean {
  return (state.kind === 'review' || state.kind === 'failed') && state.record.length >= MIN_RUNNABLE_WINDING_TURNS;
}

/**
 * 状態遷移。**許可された遷移だけを受理**し、それ以外は状態を変えない。
 *
 * `setRecord`で記録が空から1本以上になった瞬間に`lotFixed → winding`へ移り、
 * 以後`fixLot`を受理しなくなる。これが「1ターン後は材料固定」の執行点。
 */
export function windingStepReducer(state: WindingStepState, action: WindingStepAction): WindingStepState {
  switch (action.kind) {
    case 'fixLot': {
      // 材料未確定か、まだ1ターンも巻いていないときだけ受理する。
      if (state.kind !== 'lotPending' && state.kind !== 'lotFixed') return state;
      return { kind: 'lotFixed', lot: action.lot };
    }
    case 'changeLot': {
      if (state.kind === 'lotPending') return state;
      // **記録は全破棄する。部分切り詰めをしない**——残した一部が
      // 「どの材料で巻かれたか」を説明できなくなる。
      return { kind: 'lotPending' };
    }
    case 'setRecord': {
      if (state.kind === 'lotPending') return state;
      if (state.kind === 'review' || state.kind === 'failed') {
        // 確認中・失敗後に巻き足す場合は巻線中へ戻す(理由表示を残したまま記録だけ変えない)。
        return { kind: 'winding', lot: state.lot, record: action.record };
      }
      return { kind: 'winding', lot: state.lot, record: action.record };
    }
    case 'toReview': {
      if (state.kind !== 'winding' && state.kind !== 'failed') return state;
      return { kind: 'review', lot: state.lot, record: state.record };
    }
    case 'backToWinding': {
      if (state.kind !== 'review' && state.kind !== 'failed') return state;
      return { kind: 'winding', lot: state.lot, record: state.record };
    }
    case 'completionFailed': {
      if (state.kind !== 'review' && state.kind !== 'failed') return state;
      return { kind: 'failed', lot: state.lot, record: state.record, failure: action.failure };
    }
    case 'reset':
      return INITIAL_WINDING_STEP_STATE;
  }
}

/**
 * 失敗理由の日本語文言(2026-08-30人間承認の確定文言)。
 * **`kind`で分岐し、文字列判定をしない**。原因断定・推奨修正は含めない。
 */
export function describeCompletionFailure(failure: CompleteRotorAssemblyFailure): string {
  switch (failure.kind) {
    case 'invalidRecord':
      return '巻線の記録が壊れています';
    case 'turnCountOutOfRange':
      return `巻き数が${failure.count}ターンです(${failure.min}〜${failure.max}ターンで完成できます)`;
    case 'physicalMaxTurnsExceeded':
      return `この線径では最大${failure.limit}ターンまでです`;
    case 'insufficientWire':
      return `線材が足りません(必要${failure.requiredM}メートル / 残り${failure.availableM}メートル)`;
    case 'unknownWireMaterial':
      return '選んだ線材が見つかりません';
    case 'duplicateAssemblyId':
      return 'ローターの採番が重複しました';
    case 'persistFailed':
      return '保存できませんでした';
  }
}
