// P4-0 G1b: 共通意味コマンドreducerの決定論と契約。
// **3入力案固有のテストやUIテストはG2まで作らない**(計画のゲート順)。
import { describe, expect, it } from 'vitest';
import {
  applyWindingCommand,
  applyWindingCommands,
  INITIAL_WINDING_INPUT_STATE,
  type WindingCommand,
  type WindingInputState,
} from '../../retro/winding/inputCommands';
import { MAX_WINDING_TURNS, WINDING_QUANTIZATION_STEP, type WindingRecord } from '../../materials/windingRecord';

function ok(result: ReturnType<typeof applyWindingCommands>): WindingInputState {
  expect(result.ok, result.ok ? '' : result.reason).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

/** 代表的なコマンド列。3案いずれもこの意味列へ正規化される想定。 */
const SAMPLE_COMMANDS: readonly WindingCommand[] = [
  { kind: 'setGuide', position: 0.25, arm: 'left' },
  { kind: 'setTension', tension: 0.75 },
  { kind: 'advanceTurn' },
  { kind: 'setDirection', direction: -1 },
  { kind: 'setGuide', position: 0.75, arm: 'right' },
  { kind: 'advanceTurn' },
  { kind: 'setGuide', position: 0.5, arm: 'straddle' },
  { kind: 'setDirection', direction: 1 },
  { kind: 'advanceTurn' },
];

describe('決定論: 同一初期state+同一command列', () => {
  it('2回適用した結果がJSON完全同値になる', () => {
    const a = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, SAMPLE_COMMANDS));
    const b = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, SAMPLE_COMMANDS));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('1件ずつ適用しても一括適用と同値(適用単位に依存しない)', () => {
    const bulk = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, SAMPLE_COMMANDS));
    let step = INITIAL_WINDING_INPUT_STATE;
    for (const command of SAMPLE_COMMANDS) step = ok(applyWindingCommand(step, command));
    expect(JSON.stringify(step)).toBe(JSON.stringify(bulk));
  });

  it('確定したターンは適用時点のguide/tension/directionそのものである', () => {
    const state = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, SAMPLE_COMMANDS));
    expect(state.record).toEqual([
      { position: 0.25, arm: 'left', direction: 1, tension: 0.75 },
      { position: 0.75, arm: 'right', direction: -1, tension: 0.75 },
      { position: 0.5, arm: 'straddle', direction: 1, tension: 0.75 },
    ]);
  });
});

describe('引数非破壊', () => {
  it('元のstateとrecordを変更しない', () => {
    const base = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, SAMPLE_COMMANDS));
    const snapshot = JSON.stringify(base);
    const recordRef = base.record;

    ok(applyWindingCommand(base, { kind: 'advanceTurn' }));
    ok(applyWindingCommand(base, { kind: 'setTension', tension: 0.125 }));

    expect(JSON.stringify(base)).toBe(snapshot);
    expect(base.record).toBe(recordRef); // 配列実体も差し替わっていない
  });

  it('replaceRangeへ渡したturns配列を変更しない', () => {
    const base = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, SAMPLE_COMMANDS));
    const turns: WindingRecord = [{ position: 0.125, arm: 'left', direction: 1, tension: 0.25 }];
    const snapshot = JSON.stringify(turns);

    ok(applyWindingCommand(base, { kind: 'replaceRange', start: 1, deleteCount: 1, turns }));

    expect(JSON.stringify(turns)).toBe(snapshot);
  });
});

describe('量子化境界', () => {
  it('格子上の値はそのまま保たれる', () => {
    const state = ok(applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'setGuide', position: 3 / 256, arm: 'left' }));
    expect(state.position).toBe(3 / 256);
  });

  it('格子外の値は最近傍の格子点へ量子化される', () => {
    const state = ok(applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'setTension', tension: 0.3 }));
    expect(Number.isInteger(state.tension * 256)).toBe(true);
    expect(Math.abs(state.tension - 0.3)).toBeLessThanOrEqual(WINDING_QUANTIZATION_STEP / 2);
  });

  it('両端0と1は受理される', () => {
    expect(ok(applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'setGuide', position: 0, arm: 'left' })).position).toBe(0);
    expect(ok(applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'setTension', tension: 1 })).tension).toBe(1);
  });

  it('範囲外・非有限は理由付きで拒否する(0や1へ丸めない)', () => {
    for (const bad of [-1e-9, 1.0000001, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'setTension', tension: bad });
      expect(result.ok, `tension=${bad}が受理された`).toBe(false);
      if (!result.ok) expect(result.reason).toContain('tension');
    }
  });
});

describe('方向とarm', () => {
  it('方向は1と-1のみ受理する', () => {
    expect(ok(applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'setDirection', direction: -1 })).direction).toBe(-1);
    const bad = applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'setDirection', direction: 0 as never });
    expect(bad.ok).toBe(false);
  });

  it('armはleft/right/straddleのみ受理する', () => {
    for (const arm of ['left', 'right', 'straddle'] as const) {
      expect(ok(applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'setGuide', position: 0.5, arm })).arm).toBe(arm);
    }
    const bad = applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'setGuide', position: 0.5, arm: 'center' as never });
    expect(bad.ok).toBe(false);
  });

  it('方向反転は明示コマンドでのみ起こる(guide/tension操作では変わらない)', () => {
    let state = ok(applyWindingCommand(INITIAL_WINDING_INPUT_STATE, { kind: 'setDirection', direction: -1 }));
    state = ok(applyWindingCommand(state, { kind: 'setGuide', position: 0.9, arm: 'right' }));
    state = ok(applyWindingCommand(state, { kind: 'setTension', tension: 0.1 }));
    expect(state.direction).toBe(-1);
  });
});

describe('150ターン上限', () => {
  function fill(count: number): WindingInputState {
    return ok(applyWindingCommands(
      INITIAL_WINDING_INPUT_STATE,
      Array.from({ length: count }, () => ({ kind: 'advanceTurn' as const })),
    ));
  }

  it('上限ちょうどまでは受理する', () => {
    expect(fill(MAX_WINDING_TURNS).record).toHaveLength(MAX_WINDING_TURNS);
  });

  it('上限を超えるadvanceTurnは黙ってclampせず理由付きで拒否する', () => {
    const full = fill(MAX_WINDING_TURNS);
    const result = applyWindingCommand(full, { kind: 'advanceTurn' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(String(MAX_WINDING_TURNS));
    // 拒否時にstateは変わらない
    expect(full.record).toHaveLength(MAX_WINDING_TURNS);
  });

  it('コマンド列の途中で拒否されたら、その位置を理由に含めて停止する', () => {
    const full = fill(MAX_WINDING_TURNS);
    const result = applyWindingCommands(full, [
      { kind: 'setTension', tension: 0.25 },
      { kind: 'advanceTurn' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('コマンド1(advanceTurn)');
  });
});

describe('replaceRangeの局所性', () => {
  const base = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, SAMPLE_COMMANDS));
  const replacement: WindingRecord = [{ position: 0.125, arm: 'left', direction: -1, tension: 0.25 }];

  it('指定区間だけが置換され、区間外はJSON上同一である', () => {
    const next = ok(applyWindingCommand(base, { kind: 'replaceRange', start: 1, deleteCount: 1, turns: replacement }));
    expect(next.record).toHaveLength(base.record.length);
    expect(JSON.stringify(next.record[0])).toBe(JSON.stringify(base.record[0]));
    expect(JSON.stringify(next.record[2])).toBe(JSON.stringify(base.record[2]));
    expect(next.record[1]).toEqual(replacement[0]);
  });

  it('guide/tension/directionの現在値は置換で変わらない', () => {
    const next = ok(applyWindingCommand(base, { kind: 'replaceRange', start: 0, deleteCount: 1, turns: replacement }));
    expect(next.position).toBe(base.position);
    expect(next.arm).toBe(base.arm);
    expect(next.tension).toBe(base.tension);
    expect(next.direction).toBe(base.direction);
  });

  it('範囲外・不正turnは拒否し、元記録を変更しない', () => {
    const snapshot = JSON.stringify(base);
    for (const command of [
      { kind: 'replaceRange' as const, start: -1, deleteCount: 0, turns: replacement },
      { kind: 'replaceRange' as const, start: 0, deleteCount: 99, turns: replacement },
      { kind: 'replaceRange' as const, start: 0, deleteCount: 1, turns: [{ position: 2, arm: 'left', direction: 1, tension: 0 }] as never },
    ]) {
      const result = applyWindingCommand(base, command);
      expect(result.ok, `${JSON.stringify(command)}が受理された`).toBe(false);
    }
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe('拒否時のstate不変', () => {
  it('どの拒否経路でも元stateがJSON上同一のまま残る', () => {
    const base = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, SAMPLE_COMMANDS));
    const snapshot = JSON.stringify(base);
    const rejects: WindingCommand[] = [
      { kind: 'setGuide', position: 5, arm: 'left' },
      { kind: 'setGuide', position: 0.5, arm: 'middle' as never },
      { kind: 'setTension', tension: Number.NaN },
      { kind: 'setDirection', direction: 2 as never },
      { kind: 'replaceRange', start: 99, deleteCount: 0, turns: [] },
    ];
    for (const command of rejects) {
      expect(applyWindingCommand(base, command).ok, `${command.kind}が受理された`).toBe(false);
    }
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// P4-0 G2: 3入力案の純関数境界と、共通commandだけを出力する構造。
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import {
  advanceRotation, INITIAL_ROTATION_STATE, releaseRotation, resolveKeyCommand,
  DEFAULT_PATTERN, expandPatternToCommands, PATTERN_POINT_COUNT,
} from '../inputs/inputCommands';
import {
  resolveGuideFromX,
  advanceTicks, INITIAL_TICK_STATE, resolveJigKeyCommand, resolvePadInput, SEMI_AUTO_TICK_MS,
} from '../../retro/winding/inputCommands';
import { PROTOTYPE_TURN_COUNT } from '../Phase4PrototypeScreen';

/** 円周上の点。角度から正規化座標へ。 */
function pointAt(rad: number): { x: number; y: number } {
  return { x: 0.5 + 0.4 * Math.cos(rad), y: 0.5 + 0.4 * Math.sin(rad) };
}

describe('案I: 一周判定(純関数、frame数に依存しない)', () => {
  it('一周でちょうど1ターン、二周で2ターン確定する', () => {
    for (const [turns, steps] of [[1, 8], [2, 16]] as const) {
      let state = INITIAL_ROTATION_STATE;
      let total = 0;
      for (let i = 0; i <= steps; i += 1) {
        const result = advanceRotation(state, pointAt((i / 8) * Math.PI * 2));
        state = result.next;
        total += result.completedTurns;
      }
      expect(total).toBe(turns);
    }
  });

  it('サンプリング密度(=frame数)を変えても同じ周回数なら同じターン数になる', () => {
    const countTurns = (steps: number) => {
      let state = INITIAL_ROTATION_STATE;
      let total = 0;
      for (let i = 0; i <= steps; i += 1) {
        const result = advanceRotation(state, pointAt((i / steps) * Math.PI * 2));
        state = result.next;
        total += result.completedTurns;
      }
      return total;
    };
    expect(countTurns(8)).toBe(countTurns(64));
  });

  it('±πの境界をまたいでも余計なターンが増えない', () => {
    let state = INITIAL_ROTATION_STATE;
    let total = 0;
    for (const rad of [Math.PI - 0.01, Math.PI + 0.01, Math.PI + 0.02]) {
      const result = advanceRotation(state, pointAt(rad));
      state = result.next;
      total += result.completedTurns;
    }
    expect(total).toBe(0);
  });

  it('逆回りでも1ターンとして数える(向きは問わない)', () => {
    let state = INITIAL_ROTATION_STATE;
    let total = 0;
    for (let i = 0; i <= 8; i += 1) {
      const result = advanceRotation(state, pointAt(-(i / 8) * Math.PI * 2));
      state = result.next;
      total += result.completedTurns;
    }
    expect(total).toBe(1);
  });

  it('離すと半端な累積を捨てる', () => {
    let state = INITIAL_ROTATION_STATE;
    state = advanceRotation(state, pointAt(0)).next;
    state = advanceRotation(state, pointAt(Math.PI)).next;
    expect(releaseRotation()).toEqual(INITIAL_ROTATION_STATE);
  });

  it('横位置がposition/armへ写る(左1/3・中央・右1/3)', () => {
    expect(resolveGuideFromX(0.1).arm).toBe('left');
    expect(resolveGuideFromX(0.5).arm).toBe('straddle');
    expect(resolveGuideFromX(0.9).arm).toBe('right');
    expect(resolveGuideFromX(-1).position).toBe(0);
    expect(resolveGuideFromX(2).position).toBe(1);
  });

  it('keyboardはpointerと同じ意味commandを出す', () => {
    const current = { position: 0.5, arm: 'straddle' as const, tension: 0.5, direction: 1 as const };
    expect(resolveKeyCommand('Enter', current)).toEqual({ kind: 'advanceTurn' });
    expect(resolveKeyCommand('R', current)).toEqual({ kind: 'setDirection', direction: -1 });
    expect(resolveKeyCommand('ArrowRight', current)?.kind).toBe('setGuide');
    expect(resolveKeyCommand('ArrowUp', current)?.kind).toBe('setTension');
    expect(resolveKeyCommand('x', current)).toBeNull();
  });
});

describe('案II: 固定record tick(fpsに依存しない)', () => {
  /**
   * 始動からの経過を`frames`回に分けてサンプリングし、発行された総ターン数を返す。
   * **サンプリング回数(=fps)を変えても、同じ経過時間なら同じ結果**でなければならない。
   */
  function ticksFor(frames: number, totalMs: number): number {
    let state = INITIAL_TICK_STATE;
    let ticks = 0;
    for (let i = 1; i <= frames; i += 1) {
      const result = advanceTicks(state, (totalMs * i) / frames);
      state = result.next;
      ticks += result.ticks;
    }
    return ticks;
  }

  it('60/30/15 fps相当で同じ経過時間なら同じターン数になる', () => {
    for (const seconds of [5, 30]) {
      const totalMs = seconds * 1000;
      // 1秒=1ターンの契約そのもの。fpsに依らずこの値になる。
      expect(ticksFor(60 * seconds, totalMs)).toBe(seconds);
      expect(ticksFor(30 * seconds, totalMs)).toBe(seconds);
      expect(ticksFor(15 * seconds, totalMs)).toBe(seconds);
    }
  });

  it('1000ms境界: 999msでは0、1000msでちょうど1', () => {
    expect(advanceTicks(INITIAL_TICK_STATE, SEMI_AUTO_TICK_MS - 1).ticks).toBe(0);
    expect(advanceTicks(INITIAL_TICK_STATE, SEMI_AUTO_TICK_MS).ticks).toBe(1);
  });

  it('同じ経過を二度渡しても二重に発行しない(発行済みを引く)', () => {
    const first = advanceTicks(INITIAL_TICK_STATE, 3000);
    expect(first.ticks).toBe(3);
    const second = advanceTicks(first.next, 3000);
    expect(second.ticks).toBe(0);
  });

  it('負・非有限の経過は0として扱う(記録が減らない)', () => {
    expect(advanceTicks(INITIAL_TICK_STATE, -5000).ticks).toBe(0);
    expect(advanceTicks(INITIAL_TICK_STATE, Number.NaN).ticks).toBe(0);
    // 既に発行済みの状態で巻き戻っても、発行数は減らない。
    const after = advanceTicks(INITIAL_TICK_STATE, 5000).next;
    expect(advanceTicks(after, 1000).ticks).toBe(0);
  });

  it('keyboardは同じ意味commandを出す', () => {
    const current = { position: 0.5, arm: 'straddle' as const, tension: 0.5, direction: 1 as const };
    expect(resolveJigKeyCommand('a', current)?.kind).toBe('setGuide');
    expect(resolveJigKeyCommand('w', current)?.kind).toBe('setTension');
    expect(resolveJigKeyCommand('R', current)).toEqual({ kind: 'setDirection', direction: -1 });
    expect(resolveJigKeyCommand('z', current)).toBeNull();
  });
});

describe('案III: 固定4点の決定論的展開', () => {
  it('制御点は固定4個である', () => {
    expect(PATTERN_POINT_COUNT).toBe(4);
    expect(DEFAULT_PATTERN.points).toHaveLength(4);
    expect(DEFAULT_PATTERN.segments).toHaveLength(4);
  });

  it('指定ターン数ぶんのadvanceTurnを出す', () => {
    const commands = expandPatternToCommands(DEFAULT_PATTERN, PROTOTYPE_TURN_COUNT);
    expect(commands.filter((c) => c.kind === 'advanceTurn')).toHaveLength(PROTOTYPE_TURN_COUNT);
  });

  it('同じ設計からは常に同じ列が出る(乱数・時刻・frame数を使わない)', () => {
    const a = expandPatternToCommands(DEFAULT_PATTERN, PROTOTYPE_TURN_COUNT);
    const b = expandPatternToCommands(DEFAULT_PATTERN, PROTOTYPE_TURN_COUNT);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('展開結果を共通reducerへ通すと30ターンの記録になり、150上限以下である', () => {
    const commands = expandPatternToCommands(DEFAULT_PATTERN, PROTOTYPE_TURN_COUNT);
    const state = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, commands));
    expect(state.record).toHaveLength(PROTOTYPE_TURN_COUNT);
    expect(state.record.length).toBeLessThanOrEqual(MAX_WINDING_TURNS);
  });

  it('展開器は量子化しない(量子化は共通reducerの唯一の出典)', () => {
    const design = {
      points: [
        { position: 0.1, tension: 0.1 },
        { position: 0.2, tension: 0.2 },
        { position: 0.3, tension: 0.3 },
        { position: 0.4, tension: 0.4 },
      ],
      segments: DEFAULT_PATTERN.segments,
    };
    const commands = expandPatternToCommands(design, 7);
    const guides = commands.filter((c): c is Extract<typeof c, { kind: 'setGuide' }> => c.kind === 'setGuide');
    // 格子外の値がそのまま出ている(reducerを通して初めて格子へ載る)。
    expect(guides.some((c) => !Number.isInteger(c.position * 256))).toBe(true);
    const state = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, commands));
    for (const turn of state.record) {
      expect(Number.isInteger(turn.position * 256)).toBe(true);
      expect(Number.isInteger(turn.tension * 256)).toBe(true);
    }
  });

  it('turnCountが0以下や非整数なら空列(黙って埋めない)', () => {
    expect(expandPatternToCommands(DEFAULT_PATTERN, 0)).toEqual([]);
    expect(expandPatternToCommands(DEFAULT_PATTERN, -1)).toEqual([]);
    expect(expandPatternToCommands(DEFAULT_PATTERN, 1.5)).toEqual([]);
  });
});

describe('3案が共通commandだけを出力する構造', () => {
  const sources = {
    raw: readFileSync(new URL('../inputs/RawDragInput.tsx', import.meta.url), 'utf8'),
    semi: readFileSync(new URL('../inputs/SemiAutoJigInput.tsx', import.meta.url), 'utf8'),
    pattern: readFileSync(new URL('../inputs/PatternInput.tsx', import.meta.url), 'utf8'),
  };

  it('どの案もWindingRecordを直接生成・保持しない', () => {
    for (const [name, source] of Object.entries(sources)) {
      // 記録の組み立て(turnオブジェクトの生成)がUI側に無いこと。
      expect(source, name).not.toMatch(/WindingRecord\s*[=:]/);
      expect(source, name).not.toMatch(/record\.push|\.\.\.record/);
      // 量子化を各案が自前で行っていないこと(共通reducerが唯一の出典)。
      expect(source, name).not.toContain('quantizeWindingValue');
      expect(source, name).not.toContain('/ 256)');
    }
  });

  it('どの案も親へはWindingCommandだけを渡す', () => {
    for (const [name, source] of Object.entries(sources)) {
      // 親へはonCommand(=WindingCommand)経由でのみ渡す。
      expect(source, name).toMatch(/onCommand|onExpand/);
      // P4-1B B1: 半自動治具の入力規則は`src/retro/winding/inputCommands.ts`へ移設した。
      // 選外案専用kernelは`./inputCommands`に残るため、どちらの経路でもよい
      // (意図は「componentが入力規則を自前で持たない」ことであり、path自体ではない)。
      expect(source, name).toMatch(/from '(\.\/|\.\.\/\.\.\/retro\/winding\/)inputCommands'/);
      // storeや永続化へ触れていないこと。
      expect(source, name).not.toContain('useGameStore');
      expect(source, name).not.toContain('useSaveStore');
      expect(source, name).not.toContain('localStorage');
    }
  });

  it('同一commandなら案が違っても最終recordがJSON同値になる', () => {
    // 「案IIIの展開列」を、案I/IIが同じ意味操作を行った場合の列とみなして通す。
    const commands = expandPatternToCommands(DEFAULT_PATTERN, PROTOTYPE_TURN_COUNT);
    const viaOne = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, commands));
    let viaStep = INITIAL_WINDING_INPUT_STATE;
    for (const command of commands) viaStep = ok(applyWindingCommand(viaStep, command));
    expect(JSON.stringify(viaStep.record)).toBe(JSON.stringify(viaOne.record));
  });
});

describe('共通画面の規約', () => {
  const screenRaw = readFileSync(new URL('../Phase4PrototypeScreen.tsx', import.meta.url), 'utf8');
  // 規律を説明しているコメント自体を実装と数えない(禁止語はコメントにも現れる)。
  const screen = screenRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('比較は30ターン固定である', () => {
    expect(PROTOTYPE_TURN_COUNT).toBe(30);
  });

  it('保存経路へ一切書き込まない', () => {
    for (const forbidden of ['localStorage', 'useSaveStore', 'useGameStore', 'notebook', 'codex', 'courseProgress']) {
      expect(screen, forbidden).not.toContain(forbidden);
    }
  });

  it('評価語・品質ゲージ・推奨・原因断定を出さない', () => {
    for (const word of ['おすすめ', '推奨', '品質', '上手', '正解', '改善案', '原因は']) {
      expect(screen, word).not.toContain(word);
    }
  });

  it('案の選択へ戻るときは未確定記録の破棄を確認する', () => {
    expect(screenRaw).toContain('記録中の巻線は破棄されます');
  });

  it('実時間は表示専用で、記録・tick・判定へ使わない', () => {
    // performance.nowの用途が経過秒の表示に限られていること。
    expect(screenRaw).toContain('経過');
    expect(screen).not.toMatch(/advanceTurn[^\n]*performance\.now/);
  });
});

// ---------------------------------------------------------------------------
// P4-0 G2-R1: Suu独立レビュー是正4件の構造固定。
// Reactレンダリング環境が無いため、componentの配線はソース検査で固定する。
// ---------------------------------------------------------------------------
describe('G2-R1 是正の構造固定', () => {
  const semi = readFileSync(new URL('../inputs/SemiAutoJigInput.tsx', import.meta.url), 'utf8');
  const screenSource = readFileSync(new URL('../Phase4PrototypeScreen.tsx', import.meta.url), 'utf8');
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const semiCode = stripComments(semi);
  const screenCode = stripComments(screenSource);

  it('(1) rAF effectの依存はrunningとdisabledだけで、props全体を含めない', () => {
    // 親が経過表示で再描画するたびにpropsのidentityが変わるため、依存に入れると
    // cleanup→再起動で始動時刻が上書きされ、1000ms tickへ到達しなくなる。
    expect(semiCode).toContain('}, [running, disabled]);');
    expect(semiCode).not.toMatch(/\}, \[running, disabled, props\]\)/);
    // rAF effectの依存配列に`props`そのものが入っていないこと(onCommandのref同期
    // effectは`[props.onCommand]`で正しいので、そちらは対象外)。
    expect(semiCode).not.toMatch(/\[[^\]]*(?<!props\.)\bprops\b\s*\]\);/);
  });

  it('(1) onCommandはrefへ同期してrAFループから呼ぶ', () => {
    expect(semiCode).toContain('onCommandRef.current = props.onCommand;');
    expect(semiCode).toContain('onCommandRef.current({ kind: \'advanceTurn\' })');
  });

  it('(2) resetと案選択で入力componentをremountし、内部stateを残さない', () => {
    expect(screenCode).toContain('setInputEpoch((value) => value + 1)');
    // 3案すべてにkeyが付いている(付け忘れるとその案だけ内部stateが残る)。
    expect((screenCode.match(/key=\{inputEpoch\}/g) ?? [])).toHaveLength(3);
  });

  it('(3) 計測起点は案を選んだ瞬間で、resetは即時再開・案選択へ戻る時だけ停止する', () => {
    expect(screenSource).toContain('setStartedAtMs(performance.now()); // 起点は案を選んだ瞬間');
    expect(screenSource).toContain('setStartedAtMs(null); // 案選択へ戻るときだけ計測を止める');
    // commandの発行時点では計測を開始しない(案IIIの設計時間が抜け落ちるため)。
    expect(screenCode).not.toMatch(/runCommands?\s*=\s*\([^)]*\)\s*=>\s*\{\s*if \(startedAtMs === null\)/);
  });

  it('(3) 30ターン到達時に最終経過を1回確定する(表示tickの端数を残さない)', () => {
    expect(screenCode).toContain('if (complete) {');
    expect(screenCode).toMatch(/setElapsedSec\(\(performance\.now\(\) - startedAtMs\) \/ 1000\);/);
  });

  it('(4) 整数拡大の既存規律(useRetroCanvasFrame)を使い、非整数拡大しない', () => {
    expect(screenCode).toContain('useRetroCanvasFrame()');
    expect(screenCode).toContain('scaleResult.contentWidthPx');
    expect(screenCode).toContain('scaleResult.offsetXPx');
    // 任意幅へ引き伸ばすclassが残っていないこと。
    expect(screenCode).not.toMatch(/<canvas[^>]*className="w-full/);
    expect(screenCode.includes('h-[480px] sm:h-[270px]') && !screenCode.includes('h-[40vh]')).toBe(true);
  });

  it('(4) fits=falseのときは日本語で収まらない旨を表示する', () => {
    expect(screenSource).toContain('等倍でも収まりません');
  });

  it('componentファイルはcomponentだけをexportする(Fast Refresh警告0の根拠)', () => {
    for (const [name, source] of Object.entries({
      raw: readFileSync(new URL('../inputs/RawDragInput.tsx', import.meta.url), 'utf8'),
      semi,
      pattern: readFileSync(new URL('../inputs/PatternInput.tsx', import.meta.url), 'utf8'),
    })) {
      const exported = stripComments(source).match(/^export (?:function|const|interface|type)\s+(\w+)/gm) ?? [];
      expect(exported.length, name).toBe(1);
      expect(exported[0], name).toMatch(/^export function [A-Z]/);
    }
  });
});

// ---------------------------------------------------------------------------
// P4-0 G2再試作: D1(mount順)と案II-B(pointer操作面)。
// ---------------------------------------------------------------------------
describe('D1: 巻線ビューは子componentでmountされ、hookがcontainerと同時に走る', () => {
  const screen = readFileSync(new URL('../Phase4PrototypeScreen.tsx', import.meta.url), 'utf8');
  const code = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('hook呼出しとcontainerRefは同一の子component内にある', () => {
    const child = code.slice(code.indexOf('function WindingTraceView'), code.indexOf('export function Phase4PrototypeScreen'));
    expect(child).toContain('useRetroCanvasFrame()');
    expect(child).toContain('ref={containerRef}');
    // 親側にはhook呼出しもcontainerも無い(条件付きmountでobserverが張られない構造を封じる)。
    const parent = code.slice(code.indexOf('export function Phase4PrototypeScreen'));
    expect(parent).not.toContain('useRetroCanvasFrame()');
    expect(parent).not.toContain('ref={containerRef}');
  });

  it('親は案選択後にだけ子をmountし、recordを渡す', () => {
    expect(code).toContain('<WindingTraceView record={previewRecord} jig={jigState} />');
  });

  it('共有hookは変更していない', () => {
    const hook = readFileSync(new URL('../../components/useRetroCanvasFrame.ts', import.meta.url), 'utf8');
    expect(hook).not.toContain('measured');
  });
});

describe('案II-B: pointer座標→guide/張力の写像', () => {
  it('四隅と中央が規約どおりに写る(上端0・下端1)', () => {
    expect(resolvePadInput({ x: 0, y: 0 })).toEqual({ position: 0, arm: 'left', tension: 0 });
    expect(resolvePadInput({ x: 1, y: 0 })).toEqual({ position: 1, arm: 'right', tension: 0 });
    expect(resolvePadInput({ x: 0, y: 1 })).toEqual({ position: 0, arm: 'left', tension: 1 });
    expect(resolvePadInput({ x: 1, y: 1 })).toEqual({ position: 1, arm: 'right', tension: 1 });
    expect(resolvePadInput({ x: 0.5, y: 0.5 })).toEqual({ position: 0.5, arm: 'straddle', tension: 0.5 });
  });

  it('範囲外はclampする(パッド外へ出ても値が飛ばない)', () => {
    expect(resolvePadInput({ x: -5, y: -5 })).toEqual({ position: 0, arm: 'left', tension: 0 });
    expect(resolvePadInput({ x: 9, y: 9 })).toEqual({ position: 1, arm: 'right', tension: 1 });
  });

  it('xはposition/armへ、yは張力へ独立に効く', () => {
    expect(resolvePadInput({ x: 0.2, y: 0.9 }).arm).toBe('left');
    expect(resolvePadInput({ x: 0.8, y: 0.1 }).arm).toBe('right');
    expect(resolvePadInput({ x: 0.2, y: 0.9 }).tension).toBeCloseTo(0.9, 12);
  });

  it('下へ引くほど張力が単調に増える', () => {
    const ys = [0, 0.25, 0.5, 0.75, 1];
    const tensions = ys.map((y) => resolvePadInput({ x: 0.5, y }).tension);
    for (let i = 1; i < tensions.length; i += 1) expect(tensions[i]).toBeGreaterThan(tensions[i - 1]!);
  });

  it('写像結果を共通reducerへ通すと1/256格子へ載る', () => {
    const resolved = resolvePadInput({ x: 0.3, y: 0.7 });
    const state = ok(applyWindingCommands(INITIAL_WINDING_INPUT_STATE, [
      { kind: 'setGuide', position: resolved.position, arm: resolved.arm },
      { kind: 'setTension', tension: resolved.tension },
      { kind: 'advanceTurn' },
    ]));
    expect(Number.isInteger(state.record[0]!.position * 256)).toBe(true);
    expect(Number.isInteger(state.record[0]!.tension * 256)).toBe(true);
  });
});

describe('案II-B: componentの操作面と既存経路の維持', () => {
  const semi = readFileSync(new URL('../inputs/SemiAutoJigInput.tsx', import.meta.url), 'utf8');
  const code = semi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('治具padがpointer操作面になり、pointer captureを取得・解放する', () => {
    expect(code).toContain('onPointerDown');
    expect(code).toContain('setPointerCapture(event.pointerId)');
    expect(code).toContain('onPointerMove');
    expect(code).toContain('releasePointerCapture(event.pointerId)');
    expect(code).toContain('onPointerCancel');
  });

  it('2本のrange sliderが消えている', () => {
    expect(code).not.toContain("type=\"range\"");
  });

  it('速度・加速度・慣性・筆圧を使わない', () => {
    for (const forbidden of ['velocity', 'acceleration', 'inertia', 'pressure', 'movementX', 'movementY']) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('keyboard経路と始動/停止・方向反転が残っている', () => {
    expect(code).toContain('resolveJigKeyCommand');
    expect(code).toContain("event.key === ' '");
    expect(code).toContain("kind: 'setDirection'");
  });

  it('生成するのは既存のsetGuide/setTensionだけ(新規commandなし)', () => {
    const kinds = [...code.matchAll(/kind: '(\w+)'/g)].map((m) => m[1]);
    for (const kind of kinds) expect(['setGuide', 'setTension', 'setDirection', 'advanceTurn']).toContain(kind);
  });
});
