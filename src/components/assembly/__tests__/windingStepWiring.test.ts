// P4-1B B-F1/B-F2(2026-08-30 Suuレビュー是正): 承認済み契約が**実UI経路**へ繋がっていることの固定。
//
// 状態機械の純関数は`windingStepState.test.ts`が押さえている。ここで見るのは
// 「その関数がUIから実際に呼ばれているか」——純関数が正しくても、componentが
// 迂回して直接dispatchすれば契約は空文化する(実際にそうなっていた)。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** コメントを落とす。説明文中の語をimplementationと数えない。 */
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const winding = strip(readFileSync(new URL('../CoilWindingStep.tsx', import.meta.url), 'utf8'));
const start = strip(readFileSync(new URL('../StartStep.tsx', import.meta.url), 'utf8'));
const mode = strip(readFileSync(new URL('../../../modes/AssemblyMode.tsx', import.meta.url), 'utf8'));

describe('B-F1: 記録の破棄は必ず確認を経る', () => {
  it('changeLotのdispatchは1箇所だけ', () => {
    // 破棄の入口が増えると、確認を通らない経路が紛れ込む。
    expect(winding.match(/kind:\s*'changeLot'/g)).toHaveLength(1);
  });

  it('その1箇所は確認関数の内側にある', () => {
    const discard = winding.slice(winding.indexOf('const discardLot'), winding.indexOf('const fixLot'));
    expect(discard).toContain('window.confirm');
    expect(discard).toContain("kind: 'changeLot'");
    // 記録があるときだけ確認する(0ターンは自由)。
    expect(discard).toContain('hasRecordedTurns(winding)');
    // cancelしたらdispatchへ到達せずに抜ける。
    expect(discard).toMatch(/return false;/);
  });

  it('材料選び直しボタンは確認関数を呼ぶ(直接dispatchしない)', () => {
    expect(winding).toContain('onClick={discardLot}');
    expect(winding).not.toMatch(/onClick=\{\(\)\s*=>\s*dispatchWinding\(\{\s*kind:\s*'changeLot'/);
  });

  it('材料の確定も同じ確認経路を通る', () => {
    const start = winding.indexOf('const fixLot');
    const fixLot = winding.slice(start, winding.indexOf('};', start));
    expect(fixLot).toContain('if (!discardLot()) return;');
  });
});

describe('B-F2: 有限unionの遷移がUIへ接続されている', () => {
  it('巻き終える/巻き足すがdispatchされる', () => {
    expect(winding).toContain("dispatchWinding({ kind: 'toReview' })");
    expect(winding).toContain("dispatchWinding({ kind: 'backToWinding' })");
  });

  it('巻き終えるは下限未満で押せない', () => {
    const button = winding.slice(winding.indexOf("winding.kind === 'winding' && ("), winding.indexOf('巻き終える\n'));
    expect(button).toContain('disabled={record.length < MIN_RUNNABLE_WINDING_TURNS}');
  });

  it('完成要求の可否はcanRequestCompletionだけが決める(迂回しない)', () => {
    expect(start).toContain('const ready = canRequestCompletion(winding);');
    // record.length > 0 のような別条件でorしていない。
    expect(start).not.toMatch(/canRequestCompletion\([^)]*\)\s*\|\|/);
  });

  it('順序外ではstore actionを呼ばない', () => {
    const handler = start.slice(start.indexOf('useFlickGesture'), start.indexOf('completeRotorAssemblyAction({'));
    expect(handler).toContain('if (lot === null || !ready) return;');
  });

  it('完成actionが成功したときだけ次へ進む', () => {
    expect(start).toContain('if (!completed.ok) {');
    expect(start).toContain("dispatchWinding({ kind: 'completionFailed', failure: completed.failure });");
    // 失敗した直後にsetStarted(true)へ落ちない。
    const failureBranch = start.slice(start.indexOf('if (!completed.ok) {'), start.indexOf('finishAssembly('));
    expect(failureBranch).toContain('return;');
    expect(failureBranch).not.toContain('setStarted(true)');
  });

  it('完成actionはこの1箇所からだけ呼ぶ', () => {
    expect(start.match(/completeRotorAssemblyAction\(\{/g)).toHaveLength(1);
  });
});

describe('B-F5: componentがrefを起点に列をまとめて適用する', () => {
  it('closureのinput/recordからではなくworkingRefから始める', () => {
    const body = winding.slice(winding.indexOf('const runCommands'), winding.indexOf('const runCommand ='));
    expect(body).toContain('let state = workingRef.current;');
    // renderのclosureを起点にしない(旧欠陥の再発防止)。
    expect(body).not.toContain('applyWindingCommand({ ...input, record }');
  });

  it('padの2値は1回の適用で反映する', () => {
    const handler = winding.slice(winding.indexOf('const handlePad'), winding.indexOf('const resetJig'));
    expect(handler).toContain('runCommands([');
    // 2回に分けて呼んでいない。
    expect(handler.match(/runCommand\(/g)).toBeNull();
  });

  it('catch-upはticks本をまとめて適用する', () => {
    expect(winding).toContain('Array.from({ length: ticks }');
    // 1本ずつのループで古いstateを共有しない。
    expect(winding).not.toMatch(/for \(let i = 0; i < ticks;[^)]*\)\s*onCommand/);
  });
});

describe('B-F8: 治具リセットで時計が完全に0へ戻る', () => {
  const body = winding.slice(winding.indexOf('const resetJig'), winding.indexOf('const discardLot'));

  it('稼働中の起点(runStartMsRef)もnullへ戻す', () => {
    expect(body).toContain('runStartMsRef.current = null;');
  });

  it('tick・offset・入力状態も同時に初期化する', () => {
    expect(body).toContain('tickRef.current = INITIAL_TICK_STATE;');
    expect(body).toContain('runningOffsetMsRef.current = 0;');
    expect(body).toContain('workingRef.current = INITIAL_WINDING_INPUT_STATE;');
  });

  it('起点のnull化は停止分岐より先に効くよう、resetJig内で行う', () => {
    // effectの停止分岐は`start !== null`のときだけoffsetへ足す。resetJigで先に
    // nullにしておけば、setRunning(false)由来のcleanupは何も足さない。
    expect(body.indexOf('runStartMsRef.current = null;'))
      .toBeLessThan(body.indexOf('runningOffsetMsRef.current = 0;'));
  });
});

describe('B-F6: 記録が変わったときだけ有限状態を動かす', () => {
  it('setRecordのdispatchはrecord参照の変化を条件にする', () => {
    expect(winding).toContain("if (state.record !== before) dispatchWinding({ kind: 'setRecord', record: state.record });");
  });

  it('無条件のsetRecord dispatchが残っていない', () => {
    expect(winding.match(/kind:\s*'setRecord'/g)).toHaveLength(1);
  });
});

describe('production巻線UIはcoilTurnsを独立編集しない', () => {
  it('巻数スライダーもcoilTurns代入も持たない', () => {
    expect(winding).not.toMatch(/coilTurns\s*[:=]/);
    expect(winding).not.toContain('SliderRow');
  });

  it('上限は表示だけに使い、独自の上限式を持たない', () => {
    expect(winding).toContain('resolveDisplayTurnLimit');
    expect(winding).not.toContain('computeMaxTurns(');
    expect(winding).not.toContain('Math.min(prev.coilTurns');
  });
});

// P4-1B U2表示是正(2026-08-30人間承認、A改): 巻線ビューを持つ工程だけ容器を広げる。
//
// 既定の max-w-md(448px)では 480×270 が等倍でも収まらず、PC横長・スマホ横で
// 「収まりません」が出続けていた(実測)。他工程はスライダー中心なので既定のまま。
describe('U2: 巻線ビューを持つ工程だけ広幅', () => {
  it('広幅にするのは工程0(コイル巻き)と工程6(組立確認)だけ', () => {
    const steps = mode.slice(mode.indexOf('const STEPS'), mode.indexOf('const INITIAL_DRAFT'));
    const lines = steps.split('\n').filter((line) => line.includes('Component:'));
    expect(lines).toHaveLength(8);
    lines.forEach((line, index) => {
      const isWide = line.includes('wide: true');
      expect(isWide, `工程${index}: ${line.trim()}`).toBe(index === 0 || index === 6);
    });
  });

  it('広幅な工程はCoilWindingStepとAssemblyReviewStep(WindingTraceViewを持つ2つ)', () => {
    const steps = mode.slice(mode.indexOf('const STEPS'), mode.indexOf('const INITIAL_DRAFT'));
    for (const line of steps.split('\n')) {
      if (!line.includes('wide: true')) continue;
      expect(line).toMatch(/CoilWindingStep|AssemblyReviewStep/);
    }
    // その2componentだけがWindingTraceViewを使う。
    const review = strip(readFileSync(new URL('../AssemblyReviewStep.tsx', import.meta.url), 'utf8'));
    expect(winding).toContain('<WindingTraceView');
    expect(review).toContain('<WindingTraceView');
    expect(start).not.toContain('<WindingTraceView');
  });

  it('容器幅はwideで切り替え、他工程はmax-w-mdのまま', () => {
    expect(mode).toContain("step.wide === true ? 'max-w-3xl' : 'max-w-md'");
    // 固定のmax-w-mdが残っていない(切替を迂回する経路を作らない)。
    expect(mode).not.toMatch(/className="mx-auto flex max-w-md/);
  });
});
