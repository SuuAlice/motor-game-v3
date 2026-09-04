// P4-1B B2(2026-08-30人間承認): production巻線工程の有限状態の検証。
//
// 「材料は1ターン後に固定」「変更時は全破棄で部分切り詰めをしない」
// 「失敗しても記録を捨てない」「UIが上限を単独執行しない」を数値で固定する。
import { describe, expect, it } from 'vitest';
import {
  INITIAL_WINDING_STEP_STATE,
  canRequestCompletion,
  currentLot,
  currentRecord,
  describeCompletionFailure,
  hasRecordedTurns,
  windingStepReducer,
  type WindingLot,
  type WindingStepAction,
  type WindingStepState,
} from '../windingStepState';
import { MIN_RUNNABLE_WINDING_TURNS, type WindingRecord } from '../../../materials/windingRecord';
import {
  INITIAL_TICK_STATE,
  INITIAL_WINDING_INPUT_STATE,
  advanceTicks,
  applyWindingCommand,
  resolvePadInput,
  type WindingCommand,
  type WindingInputState,
} from '../../../retro/winding/inputCommands';

const INITIAL_TICK_STATE_FOR_TEST = INITIAL_TICK_STATE;

const LOT: WindingLot = { wireMaterialId: 'wire-copper-standard', windingWireGaugeMm: 0.4, windingParallelStrands: 1 };
const OTHER_LOT: WindingLot = { wireMaterialId: 'wire-aluminum', windingWireGaugeMm: 0.6, windingParallelStrands: 2 };

const turn = (position: number): WindingRecord[number] => ({
  position, arm: 'straddle', direction: 1, tension: 0.5,
});
const record = (n: number): WindingRecord => Array.from({ length: n }, (_, i) => turn((i % 32) / 32));

function reduceAll(actions: WindingStepAction[]): WindingStepState {
  return actions.reduce(windingStepReducer, INITIAL_WINDING_STEP_STATE);
}

describe('windingStepReducer', () => {
  it('材料未確定では巻けない', () => {
    const state = windingStepReducer(INITIAL_WINDING_STEP_STATE, { kind: 'setRecord', record: record(5) });
    expect(state).toBe(INITIAL_WINDING_STEP_STATE);
    expect(currentLot(state)).toBeNull();
  });

  it('0ターンの間は材料を選び直せる', () => {
    const fixed = reduceAll([{ kind: 'fixLot', lot: LOT }, { kind: 'fixLot', lot: OTHER_LOT }]);
    expect(fixed.kind).toBe('lotFixed');
    expect(currentLot(fixed)).toEqual(OTHER_LOT);
    expect(hasRecordedTurns(fixed)).toBe(false);
  });

  it('1ターン以上あるとfixLotを受理しない(材料固定)', () => {
    const winding = reduceAll([{ kind: 'fixLot', lot: LOT }, { kind: 'setRecord', record: record(1) }]);
    expect(winding.kind).toBe('winding');
    expect(windingStepReducer(winding, { kind: 'fixLot', lot: OTHER_LOT })).toBe(winding);
    expect(currentLot(winding)).toEqual(LOT);
  });

  it('changeLotは記録を全破棄する(部分切り詰めをしない)', () => {
    const winding = reduceAll([{ kind: 'fixLot', lot: LOT }, { kind: 'setRecord', record: record(30) }]);
    const after = windingStepReducer(winding, { kind: 'changeLot' });
    expect(after.kind).toBe('lotPending');
    expect(currentRecord(after)).toEqual([]);
    expect(currentRecord(after)).toHaveLength(0);
  });

  it('完成に失敗しても記録を保持し、再試行できる', () => {
    const review = reduceAll([
      { kind: 'fixLot', lot: LOT },
      { kind: 'setRecord', record: record(30) },
      { kind: 'toReview' },
    ]);
    const failed = windingStepReducer(review, {
      kind: 'completionFailed',
      failure: { kind: 'insufficientWire', requiredM: 5, availableM: 2 },
    });
    expect(failed.kind).toBe('failed');
    expect(currentRecord(failed)).toHaveLength(30);
    expect(currentLot(failed)).toEqual(LOT);
    expect(canRequestCompletion(failed)).toBe(true);
    expect(windingStepReducer(failed, { kind: 'toReview' }).kind).toBe('review');
  });

  it('順序外のactionは状態を変えない', () => {
    expect(windingStepReducer(INITIAL_WINDING_STEP_STATE, { kind: 'toReview' })).toBe(INITIAL_WINDING_STEP_STATE);
    expect(windingStepReducer(INITIAL_WINDING_STEP_STATE, { kind: 'backToWinding' })).toBe(INITIAL_WINDING_STEP_STATE);
    const fixed = windingStepReducer(INITIAL_WINDING_STEP_STATE, { kind: 'fixLot', lot: LOT });
    expect(windingStepReducer(fixed, { kind: 'toReview' })).toBe(fixed);
    expect(windingStepReducer(fixed, {
      kind: 'completionFailed', failure: { kind: 'persistFailed', detail: 'x' },
    })).toBe(fixed);
  });

  it('resetで初期状態へ戻る', () => {
    const winding = reduceAll([{ kind: 'fixLot', lot: LOT }, { kind: 'setRecord', record: record(10) }]);
    expect(windingStepReducer(winding, { kind: 'reset' })).toEqual(INITIAL_WINDING_STEP_STATE);
  });
});

describe('canRequestCompletion', () => {
  it('確認段階に達し、走行可能な下限を満たすときだけ真', () => {
    const to = (n: number) => reduceAll([
      { kind: 'fixLot', lot: LOT }, { kind: 'setRecord', record: record(n) }, { kind: 'toReview' },
    ]);
    expect(canRequestCompletion(to(MIN_RUNNABLE_WINDING_TURNS - 1))).toBe(false);
    expect(canRequestCompletion(to(MIN_RUNNABLE_WINDING_TURNS))).toBe(true);
    const winding = reduceAll([{ kind: 'fixLot', lot: LOT }, { kind: 'setRecord', record: record(30) }]);
    expect(canRequestCompletion(winding)).toBe(false);
  });
});

describe('describeCompletionFailure', () => {
  it('7枝すべてに確定文言を返す', () => {
    expect(describeCompletionFailure({ kind: 'invalidRecord', detail: 'x' }))
      .toBe('巻線の記録が壊れています');
    expect(describeCompletionFailure({ kind: 'turnCountOutOfRange', count: 3, min: 10, max: 150 }))
      .toBe('巻き数が3ターンです(10〜150ターンで完成できます)');
    expect(describeCompletionFailure({ kind: 'physicalMaxTurnsExceeded', count: 90, limit: 62 }))
      .toBe('この線径では最大62ターンまでです');
    expect(describeCompletionFailure({ kind: 'insufficientWire', requiredM: 5, availableM: 2 }))
      .toBe('線材が足りません(必要5メートル / 残り2メートル)');
    expect(describeCompletionFailure({ kind: 'unknownWireMaterial', materialId: 'x' }))
      .toBe('選んだ線材が見つかりません');
    expect(describeCompletionFailure({ kind: 'duplicateAssemblyId', assemblyId: 'a' }))
      .toBe('ローターの採番が重複しました');
    expect(describeCompletionFailure({ kind: 'persistFailed', detail: 'x' }))
      .toBe('保存できませんでした');
  });

  it('原因断定・推奨修正・評価語を含まない', () => {
    const all = [
      describeCompletionFailure({ kind: 'invalidRecord', detail: 'x' }),
      describeCompletionFailure({ kind: 'turnCountOutOfRange', count: 3, min: 10, max: 150 }),
      describeCompletionFailure({ kind: 'physicalMaxTurnsExceeded', count: 90, limit: 62 }),
      describeCompletionFailure({ kind: 'insufficientWire', requiredM: 5, availableM: 2 }),
    ].join(' ');
    for (const banned of ['原因', 'おすすめ', '推奨', '良い', '悪い', 'べきです']) {
      expect(all, banned).not.toContain(banned);
    }
  });
});

// P4-1B B-F5/B-F6(2026-08-30 Suu受入レビュー是正): 逐次適用の原子性と、
// 制御値変更で有限状態を動かさないこと。
//
// componentが持つのは「refを起点に列をまとめて適用する」規則だけなので、
// **同じ規則をここで再現して数値で検証する**(DOM rendererを持たないため)。
describe('B-F5: 1操作列を最新stateへ原子的に適用する', () => {
  const apply = (state: WindingInputState, commands: readonly WindingCommand[]) => {
    let next = state;
    for (const command of commands) {
      const result = applyWindingCommand(next, command);
      if (!result.ok) break;
      next = result.value;
    }
    return next;
  };

  it('1回のpad入力でposition/armとtensionが両方反映される', () => {
    // 旧実装は2回に分けて同じ旧stateから計算していたため、後者が前者を打ち消していた。
    const resolved = resolvePadInput({ x: 0.1, y: 0.8 });
    const after = apply(INITIAL_WINDING_INPUT_STATE, [
      { kind: 'setGuide', position: resolved.position, arm: resolved.arm },
      { kind: 'setTension', tension: resolved.tension },
    ]);
    expect(after.arm).toBe('left');
    expect(after.position).toBeCloseTo(0.1, 2);
    expect(after.tension).toBeCloseTo(0.8, 2);
  });

  it('分けて古いstateへ適用すると片方が失われる(旧実装の再現)', () => {
    const resolved = resolvePadInput({ x: 0.1, y: 0.8 });
    const a = applyWindingCommand(INITIAL_WINDING_INPUT_STATE, {
      kind: 'setGuide', position: resolved.position, arm: resolved.arm,
    });
    const b = applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'setTension', tension: resolved.tension });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // 2回目(b)を採用すると、1回目のguide/armが消える。
    expect(b.value.arm).toBe(INITIAL_WINDING_INPUT_STATE.arm);
    expect(b.value.arm).not.toBe(a.value.arm);
  });

  it('catch-upでticks本ちょうど増える(2以上でも欠落しない)', () => {
    for (const ticks of [1, 2, 5, 12]) {
      const after = apply(INITIAL_WINDING_INPUT_STATE,
        Array.from({ length: ticks }, () => ({ kind: 'advanceTurn' as const })));
      expect(after.record, `ticks=${ticks}`).toHaveLength(ticks);
    }
  });

  it('上限に達したら超過せず、そこで止まる', () => {
    const limit = 5;
    let state = INITIAL_WINDING_INPUT_STATE;
    // componentと同じ規則: 上限に達したらそのコマンドを適用せず打ち切る。
    for (let i = 0; i < 12; i += 1) {
      if (state.record.length >= limit) break;
      const next = applyWindingCommand(state, { kind: 'advanceTurn' });
      if (!next.ok) break;
      state = next.value;
    }
    expect(state.record).toHaveLength(limit);
  });
});

describe('B-F6: 制御値の変更ではrecordが変わらない', () => {
  it('setGuide/setTension/setDirectionはrecordの参照ごと不変', () => {
    const base = applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'advanceTurn' });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    for (const command of [
      { kind: 'setGuide', position: 0.25, arm: 'left' } as const,
      { kind: 'setTension', tension: 0.75 } as const,
      { kind: 'setDirection', direction: -1 } as const,
    ]) {
      const next = applyWindingCommand(base.value, command);
      expect(next.ok, command.kind).toBe(true);
      if (!next.ok) continue;
      // 参照が同一なら、componentは`setRecord`をdispatchしない。
      expect(next.value.record, command.kind).toBe(base.value.record);
    }
  });

  it('advanceTurnだけがrecordの参照を変える', () => {
    const next = applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'advanceTurn' });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.value.record).not.toBe(INITIAL_WINDING_INPUT_STATE.record);
  });

  it('制御値だけを触ってもlotFixedのまま(windingへ入らない)', () => {
    // componentは「recordの参照が変わったときだけsetRecordをdispatchする」。
    // dispatchが無ければ有限状態は動かない。
    const fixed = windingStepReducer(INITIAL_WINDING_STEP_STATE, { kind: 'fixLot', lot: LOT });
    expect(fixed.kind).toBe('lotFixed');
    // setRecordを送らない限り、何度制御値を変えてもlotFixedのまま。
    expect(windingStepReducer(fixed, { kind: 'fixLot', lot: LOT }).kind).toBe('lotFixed');
  });
});

// P4-1B B-F8(2026-08-30 Suu受入レビュー是正): 材料破棄で治具の時計が完全に0へ戻る。
//
// componentが持つ規則は「停止時に `offset += now - start`(startが非nullなら)」。
// 破棄で`start`をnullにしないと、破棄前の経過が次の材料へ持ち越される。
describe('B-F8: 材料破棄で経過時間が持ち越されない', () => {
  /** componentのeffect停止分岐と同じ規則。 */
  function stop(refs: { start: number | null; offset: number }, nowMs: number) {
    if (refs.start !== null) {
      refs.offset += nowMs - refs.start;
      refs.start = null;
    }
  }

  it('破棄でstartをnullにすれば、次の始動でticksが湧かない', () => {
    // 回転中に12秒経過したところで材料を捨てる。
    const refs: { start: number | null; offset: number } = { start: 1_000, offset: 0 };
    // 是正後のresetJig: startを先にnullへ、offsetとtickも0へ。
    refs.start = null;
    refs.offset = 0;
    let tick = INITIAL_TICK_STATE_FOR_TEST;
    // setRunning(false)由来の停止分岐が走っても、startがnullなので何も足されない。
    stop(refs, 13_000);
    expect(refs.offset).toBe(0);
    // 次の材料で始動した直後(経過0)はticksが出ない。
    const advanced = advanceTicks(tick, refs.offset);
    tick = advanced.next;
    expect(advanced.ticks).toBe(0);
  });

  it('新しい材料で始動後、999ミリ秒は0ターン、1000ミリ秒で1ターン', () => {
    // 破棄で時計が0へ戻っているので、次の始動は素の経過時間だけで進む。
    const refs: { start: number | null; offset: number } = { start: null, offset: 0 };
    const startedAt = 5_000;
    refs.start = startedAt;
    const elapsedAt = (nowMs: number) => refs.offset + (nowMs - (refs.start ?? nowMs));

    let tick = INITIAL_TICK_STATE_FOR_TEST;
    const at999 = advanceTicks(tick, elapsedAt(startedAt + 999));
    expect(at999.ticks).toBe(0);
    tick = at999.next;

    const at1000 = advanceTicks(tick, elapsedAt(startedAt + 1_000));
    expect(at1000.ticks).toBe(1);
  });

  it('startを残すと破棄前の経過が復活し、始動直後にturnが湧く(旧欠陥の再現)', () => {
    const refs: { start: number | null; offset: number } = { start: 1_000, offset: 0 };
    // 旧resetJig: offsetとtickは0へ戻すが、startはそのまま。
    refs.offset = 0;
    stop(refs, 13_000); // setRunning(false)のeffectで12秒が足し戻される
    expect(refs.offset).toBe(12_000);
    // 次の材料で始動した瞬間、12本のturnがcatch-upで湧く。
    expect(advanceTicks(INITIAL_TICK_STATE_FOR_TEST, refs.offset).ticks).toBe(12);
  });
});

// P4-1C R3(2026-09-01人間承認): 線材破断。R3-D1/D4/D5の契約を固定する。
describe('R3: 線材破断', () => {
  const toWinding = (n: number) => reduceAll([
    { kind: 'fixLot', lot: LOT }, { kind: 'setRecord', record: record(n) },
  ]);

  it('wireBrokeはwindingからのみ受理し、prefixを保持してbrokenへ移る', () => {
    const winding = toWinding(20);
    const broken = windingStepReducer(winding, { kind: 'wireBroke' });
    expect(broken.kind).toBe('broken');
    // 破断turnはrecordに含まれない。巻けたぶんだけが残る。
    expect(currentRecord(broken)).toHaveLength(20);
    expect(currentLot(broken)).toEqual(LOT);
  });

  it('winding以外ではwireBrokeを受理しない', () => {
    const fixed = windingStepReducer(INITIAL_WINDING_STEP_STATE, { kind: 'fixLot', lot: LOT });
    expect(windingStepReducer(fixed, { kind: 'wireBroke' })).toBe(fixed);
    expect(windingStepReducer(INITIAL_WINDING_STEP_STATE, { kind: 'wireBroke' })).toBe(INITIAL_WINDING_STEP_STATE);
    const review = reduceAll([
      { kind: 'fixLot', lot: LOT }, { kind: 'setRecord', record: record(30) }, { kind: 'toReview' },
    ]);
    expect(windingStepReducer(review, { kind: 'wireBroke' })).toBe(review);
  });

  it('brokenでは完成を要求できない', () => {
    const broken = windingStepReducer(toWinding(30), { kind: 'wireBroke' });
    expect(canRequestCompletion(broken)).toBe(false);
  });

  it('brokenから受理するのはresetだけ', () => {
    const broken = windingStepReducer(toWinding(20), { kind: 'wireBroke' });
    for (const action of [
      { kind: 'fixLot', lot: OTHER_LOT } as const,
      { kind: 'changeLot' } as const,
      { kind: 'setRecord', record: record(25) } as const,
      { kind: 'toReview' } as const,
      { kind: 'backToWinding' } as const,
      { kind: 'wireBroke' } as const,
      { kind: 'completionFailed', failure: { kind: 'persistFailed', detail: 'x' } } as const,
    ]) {
      expect(windingStepReducer(broken, action), action.kind).toBe(broken);
    }
    // resetだけが通り、lotPendingへ戻る。
    expect(windingStepReducer(broken, { kind: 'reset' })).toEqual(INITIAL_WINDING_STEP_STATE);
  });

  it('resetで記録が消え、材料未確定へ戻る', () => {
    const broken = windingStepReducer(toWinding(40), { kind: 'wireBroke' });
    const after = windingStepReducer(broken, { kind: 'reset' });
    expect(after.kind).toBe('lotPending');
    expect(currentRecord(after)).toEqual([]);
    expect(currentLot(after)).toBeNull();
  });

  it('消費ターン数はprefix+1で、破断契約と一致する', () => {
    for (const n of [0, 1, 10, 30, 149]) {
      const broken = windingStepReducer(toWinding(n), { kind: 'wireBroke' });
      // 0ターンでもwindingへ入っていれば破断しうる(1本目で切れる)。
      if (broken.kind !== 'broken') continue;
      expect(currentRecord(broken).length + 1, `n=${n}`).toBe(n + 1);
    }
  });
});
