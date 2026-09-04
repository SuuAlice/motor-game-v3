// P4-1B B-F1/B-F2(2026-08-30 Suuレビュー是正): 承認済み契約が**実UI経路**へ繋がっていることの固定。
//
// 状態機械の純関数は`windingStepState.test.ts`が押さえている。ここで見るのは
// 「その関数がUIから実際に呼ばれているか」——純関数が正しくても、componentが
// 迂回して直接dispatchすれば契約は空文化する(実際にそうなっていた)。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeBreakConsumptionFailure } from '../windingStepState';

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

  it('上限はstore権威を受け取るだけで、独自の上限式を持たない(R3-D3)', () => {
    // 旧`resolveDisplayTurnLimit`(UI独自計算)は廃止し、propsで受け取る形へ移した。
    expect(winding).not.toContain('resolveDisplayTurnLimit');
    expect(winding).toContain('resolveTurnLimit');
    expect(winding).not.toContain('computeMaxTurns(');
    expect(winding).not.toContain('Math.min(prev.coilTurns');
  });

  it('UIは在庫を直接読まない(R3-D3)', () => {
    // storeへの参照は破断消費actionの1点だけ。在庫そのものは読まない。
    // (上限はprops経由の権威値、消費はaction。どちらもUIが在庫を触らない形。)
    expect(winding).not.toContain('stackableStock');
    expect(winding).not.toContain('state.inventory');
    expect(winding).not.toContain('resolveWindingTurnLimitQuery');
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

// P4-1B U2巻き数常設(2026-08-30人間承認): 巻きながら現在ターン数が読めること。
//
// 指摘は「何ターン巻いているか分からない」。下部のdlはスマホ縦では操作領域より
// 約380px下へ押し出され、巻きながら見えなかった。
describe('U2: 巻き数を操作パッド内に常設する', () => {
  /** role="application"のパッド要素の中身だけを切り出す。 */
  const pad = winding.slice(
    winding.indexOf('role="application"'),
    winding.indexOf('キーボード: A/D'),
  );

  it('パッド内にrecord.lengthとlimitの巻き数表示がある', () => {
    expect(pad).toContain('巻き数');
    expect(pad).toContain('{record.length} / {limit}');
    expect(pad).toContain('ターン');
  });

  it('数値だけを太字・等幅数字にする', () => {
    expect(pad).toContain('font-bold tabular-nums');
  });

  it('巻き数と状態文が同じ入れ子に同居する(パッド外へ出さない)', () => {
    const stack = pad.slice(pad.indexOf('flex flex-col items-center'));
    expect(stack).toContain('巻き数');
    expect(stack).toContain('回転中。導線を動かしてください');
    expect(stack).toContain('停止中。始動すると軸が回ります');
    expect(stack).toContain('これ以上巻けません');
  });

  it('パッドの高さとaria-labelは変えない', () => {
    expect(pad).toContain('h-56');
    expect(pad).toContain('aria-label="巻線治具。');
  });

  it('パッド外の既存dlの巻き数行も残す(方向・ガイド位置・張力の置き場)', () => {
    const below = winding.slice(winding.indexOf('キーボード: A/D'));
    expect(below).toContain('巻き数 ');
    expect(below).toContain('現在の方向');
    expect(below).toContain('ガイド位置');
    expect(below).toContain('張力');
  });

  it('role="status"を増やさない(1秒ごとの読み上げ割り込みを避ける)', () => {
    // 既存は拒否理由と段階表示の2つだけ。
    expect(winding.match(/role="status"/g)).toHaveLength(2);
  });

  it('新規state・派生値を増やしていない', () => {
    // CoilWindingStep本体: useStateはinput/rejectReason/runningの3つ、
    // useRefはtick/runStart/offset/working/onCommandsの5つ。
    const body = winding.slice(0, winding.indexOf('function LotChooser'));
    expect(body.match(/useState[<(]/g)).toHaveLength(3);
    expect(body.match(/useRef[<(]/g)).toHaveLength(5);
    // LotChooser(材料選択)は従来どおり3つ。巻き数表示のためにstateを足していない。
    const chooser = winding.slice(winding.indexOf('function LotChooser'));
    expect(chooser.match(/useState[<(]/g)).toHaveLength(3);
    expect(chooser.match(/useRef[<(]/g)).toBeNull();
  });
});

// P4-1C R3(2026-09-01人間承認): 破断表示と再開導線がUI経路へ繋がっていること。
describe('R3: 破断後の再開は確認dialogを出さない', () => {
  const start = winding.indexOf('const restartAfterBreak');
  const restart = winding.slice(start, winding.indexOf('};', start));

  it('restartAfterBreakはconfirmを通さず、既存resetだけを使う', () => {
    expect(restart).not.toContain('window.confirm');
    expect(restart).toContain("dispatchWinding({ kind: 'reset' })");
    // 専用の消去actionを増やしていない。
    expect(winding).not.toContain('discardBroken');
  });

  it('任意破棄の確認dialogは維持する', () => {
    const discard = winding.slice(winding.indexOf('const discardLot'), winding.indexOf('const fixLot'));
    expect(discard).toContain('window.confirm');
    expect(discard).toContain("kind: 'changeLot'");
  });

  it('reset dispatchは破断後の再開1箇所だけ', () => {
    expect(winding.match(/kind: 'reset'/g)).toHaveLength(1);
  });
});

describe('R3: 破断時の表示', () => {
  it('状態文・ボタン・消費事実が確定文言どおり', () => {
    expect(winding).toContain('線材が切れました。この巻線は完成できません。');
    expect(winding).toContain('新しい線材で巻き直す');
    expect(winding).toContain('切れるまでに${record.length + 1}ターン分の線材を使いました。');
  });

  it('原因断定・助言・評価語を出さない', () => {
    for (const banned of ['引きすぎ', '緩すぎ', '原因', 'おすすめ', '推奨', '注意してください']) {
      expect(winding, banned).not.toContain(banned);
    }
  });

  it('破断中は治具操作を受け付けない', () => {
    const pad = winding.slice(winding.indexOf('role="application"'), winding.indexOf('キーボード: A/D'));
    expect(pad).toContain('if (broken) return;');
  });

  it('破断中は巻き操作のボタンを出さず、再開ボタンだけを出す', () => {
    expect(winding).toContain('{broken && (');
    expect(winding).toContain('{!broken && (');
  });

  it('破断専用の描画・色・記号を足していない(既存巻線図がprefixを描く)', () => {
    // WindingTraceViewの呼び出しは1箇所のまま。破断用の別ビューを作らない。
    expect(winding.match(/<WindingTraceView/g)).toHaveLength(1);
    expect(winding).not.toMatch(/broken.*(PALETTE|fillStyle|strokeStyle)/);
  });

  it('role="status"を増やさない', () => {
    expect(winding.match(/role="status"/g)).toHaveLength(2);
  });
});

// P4-1C R3-D6: 破断判定→store消費→dispatchの順序と、失敗時の非dispatch。
describe('R3: store成功時だけwireBrokeをdispatchする', () => {
  const body = winding.slice(winding.indexOf('const runCommands'), winding.indexOf('const runCommand ='));

  it('判定はalice側の純関数と較正値を使い、UIで式や定数を複製しない', () => {
    expect(body).toContain('willWindingBreak(state.record, state.tension, PRODUCTION_WINDING_BREAK)');
    // 較正値のリテラル複製がない。
    expect(winding).not.toContain('224');
    expect(winding).not.toContain('breakExposure');
    expect(winding).not.toContain('safeTension');
    // 累積をUIが保持していない。
    expect(winding).not.toContain('exposure');
  });

  it('記録へ追加する前に判定する(破断ターンはrecordに入らない)', () => {
    const judge = body.indexOf('willWindingBreak');
    const apply = body.indexOf('applyWindingCommand(state, command)');
    expect(judge).toBeGreaterThan(-1);
    expect(apply).toBeGreaterThan(judge);
  });

  it('消費ターン数はprefix+1でstoreへ渡す', () => {
    expect(body).toContain('brokenTurnCount: state.record.length + 1');
  });

  it('lotは入れ子のまま渡す(平坦化しない)', () => {
    // storeが線径込みで物理上限・在庫上限を再検証できる形。UIでfieldを組み直さない。
    expect(body).toContain('consumeWireOnBreak({ lot, brokenTurnCount:');
    expect(body).not.toContain('wireMaterialId: lot.wireMaterialId');
    expect(body).not.toContain('windingParallelStrands: lot.windingParallelStrands');
  });

  it('ok:falseではdispatchせず、理由だけを出す', () => {
    const failure = body.slice(body.indexOf('if (!consumed.ok)'), body.indexOf("dispatchWinding({ kind: 'wireBroke' })"));
    expect(failure).toContain('describeBreakConsumptionFailure');
    expect(failure).toContain('return;');
    expect(failure).not.toContain('wireBroke');
  });

  it('wireBrokeのdispatchは消費成功後の1箇所だけ', () => {
    expect(winding.match(/kind: 'wireBroke'/g)).toHaveLength(1);
    const dispatchAt = body.indexOf("dispatchWinding({ kind: 'wireBroke' })");
    expect(body.indexOf('consumeWireOnBreak({')).toBeLessThan(dispatchAt);
  });

  it('書込みactionは破断消費の1つだけ(UIが在庫を読まない)', () => {
    expect(winding.match(/useSaveStore\(/g)).toHaveLength(1);
    expect(winding).toContain('state.consumeWireOnBreakAction');
    expect(winding).not.toContain('stackableStock');
  });
});

// P4-1C R3 store境界是正(2026-09-02人間再承認): failure unionへinvalidTurnCountが加わった。
// 承認済み7ファイル閉包を保つため、この2件はwiring側へ置く。
describe('describeBreakConsumptionFailure', () => {
  it('4枝すべてに文言を返す', () => {
    expect(describeBreakConsumptionFailure({ kind: 'unknownWireMaterial', materialId: 'x' }))
      .toBe('選んだ線材が見つかりません');
    expect(describeBreakConsumptionFailure({ kind: 'invalidTurnCount', count: 151, limit: 62 }))
      .toBe('巻き数が正しくありません(151ターン / この工程の上限は62ターン)');
    expect(describeBreakConsumptionFailure({ kind: 'insufficientWire', requiredM: 5, availableM: 2 }))
      .toBe('線材が足りません(必要5メートル / 残り2メートル)');
    expect(describeBreakConsumptionFailure({ kind: 'persistFailed', detail: 'x' }))
      .toBe('保存できませんでした');
  });

  it('原因断定・推奨修正を含まず、単位を省かない', () => {
    const all = [
      describeBreakConsumptionFailure({ kind: 'invalidTurnCount', count: 0, limit: 30 }),
      describeBreakConsumptionFailure({ kind: 'insufficientWire', requiredM: 5, availableM: 2 }),
    ].join(' ');
    for (const banned of ['原因', '推奨', 'おすすめ', '引きすぎ', 'べきです']) {
      expect(all, banned).not.toContain(banned);
    }
    expect(all).toContain('ターン');
    expect(all).toContain('メートル');
  });
});
