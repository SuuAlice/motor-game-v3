// P4-0 G4/G5: session状態機械の検証。
//
// 「保存しない」「順序が混ざらない」「巻き直しは選んだ1区間だけ」「走行はalice側の契約へ
// 委譲するだけ」を固定する。
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INITIAL_PHASE4_SESSION,
  PHASE4_REPAIR_SECTION_COUNT,
  computeRepairSections,
  createPhase4RaceRunner,
  phase4SessionReducer,
  playerWon,
  runPhase4Race,
  type Phase4RaceRunner,
  type Phase4SessionAction,
  type Phase4SessionState,
} from '../sessionReducer';
import {
  PHASE4_PLAYER_REVERSED_RANGE,
  buildPhase4PlayerFirstRecord,
  buildPhase4PlayerFixedRecord,
  resolvePhase4BaselineInputs,
} from '../scenario';
import { resolveProductionMaterialCompositionBaseline } from '../../store/runOutcomeApplication';
import { CELEBRATION_DURATION_MS } from '../Phase4PrototypeResult';
import type { WindingRecord } from '../../materials/windingRecord';

/**
 * production(S-3)の唯一のbaseline構築関数を、alice側の入力helper経由で呼ぶ。
 * 本番ではAppが同じ2行を担う——テストが独自にbaselineを組み立てると出典が二重化する。
 */
function baseline() {
  const { rawPlayerMotorConfig, garageBuild } = resolvePhase4BaselineInputs();
  return resolveProductionMaterialCompositionBaseline(rawPlayerMotorConfig, garageBuild);
}

const FIRST = buildPhase4PlayerFirstRecord();

/** 走行を差し替えたrunner。reducer単体の遷移だけを見るために物理は走らせない。 */
function stubRunner(): { runner: Phase4RaceRunner; calls: WindingRecord[] } {
  const calls: WindingRecord[] = [];
  const run = { finishTimeS: 1, positionM: 10 } as never;
  const runner: Phase4RaceRunner = (record) => {
    calls.push(record);
    return { ok: true, outcome: { player: run, rival: run } };
  };
  return { runner, calls };
}

function reduceAll(actions: Phase4SessionAction[], runner: Phase4RaceRunner): Phase4SessionState {
  return actions.reduce((state, action) => phase4SessionReducer(state, action, runner), INITIAL_PHASE4_SESSION);
}

/** 承認済み代表経路(区間2を選び、逆巻きの1ターンだけを正転へ戻す)の再入力turn列。 */
function canonicalSectionTurns(): WindingRecord {
  const section = computeRepairSections(FIRST.length)[1];
  return FIRST.slice(section.start, section.end).map((turn) =>
    turn.direction === -1 ? { ...turn, direction: 1 as const } : turn,
  );
}

const TO_FACTS_FIRST: Phase4SessionAction[] = [
  { kind: 'runFirst', record: FIRST },
  { kind: 'finishRace' },
  { kind: 'showFacts' },
];

describe('computeRepairSections', () => {
  it('4区間へ隙間なく分割し、境界が重ならない', () => {
    const sections = computeRepairSections(30);
    expect(sections).toHaveLength(PHASE4_REPAIR_SECTION_COUNT);
    expect(sections[0].start).toBe(0);
    expect(sections[sections.length - 1].end).toBe(30);
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i].start).toBe(sections[i - 1].end);
    }
  });

  it('どの区間も非空で、長さの差は最大1ターン', () => {
    for (const turnCount of [10, 13, 30, 47, 150]) {
      const lengths = computeRepairSections(turnCount).map((s) => s.end - s.start);
      expect(Math.min(...lengths)).toBeGreaterThan(0);
      expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1);
      expect(lengths.reduce((a, b) => a + b, 0)).toBe(turnCount);
    }
  });

  it('承認済みの逆巻きターンは第2区間に入る(代表経路の前提)', () => {
    const sections = computeRepairSections(FIRST.length);
    expect(PHASE4_PLAYER_REVERSED_RANGE.start).toBeGreaterThanOrEqual(sections[1].start);
    expect(PHASE4_PLAYER_REVERSED_RANGE.start).toBeLessThan(sections[1].end);
  });
});

describe('phase4SessionReducer', () => {
  it('巻線→走行→第一段→第二段→区間選択→巻き直し→二走目 の順で進む', () => {
    const { runner, calls } = stubRunner();
    const state = reduceAll(
      [
        ...TO_FACTS_FIRST,
        { kind: 'beginRepair' },
        { kind: 'selectSection', index: 1 },
        { kind: 'commitRepair', turns: canonicalSectionTurns() },
        { kind: 'runSecond' },
        { kind: 'finishRace' },
        { kind: 'showFacts' },
      ],
      runner,
    );
    expect(state.stage).toBe('factsSecond');
    expect(state.firstRecord).toEqual(FIRST);
    // 代表経路の再入力は、承認済みの修正後記録と一致する。
    expect(state.repairedRecord).toEqual(buildPhase4PlayerFixedRecord());
    expect(calls).toEqual([FIRST, buildPhase4PlayerFixedRecord()]);
  });

  it('第一段を飛ばして事実へ進むことはできるが、事実が自動で先に出ることはない', () => {
    const { runner } = stubRunner();
    const racing = reduceAll([{ kind: 'runFirst', record: FIRST }], runner);
    expect(racing.stage).toBe('racingFirst');
    // 走行中にshowFactsは受理しない(第一段を飛ばして良いのは第一段に居るときだけ)。
    expect(phase4SessionReducer(racing, { kind: 'showFacts' }, runner)).toBe(racing);
    const celebration = phase4SessionReducer(racing, { kind: 'finishRace' }, runner);
    expect(celebration.stage).toBe('celebrationFirst');
    expect(phase4SessionReducer(celebration, { kind: 'showFacts' }, runner).stage).toBe('factsFirst');
  });

  it('順序外のactionは状態を変えない', () => {
    const { runner, calls } = stubRunner();
    expect(phase4SessionReducer(INITIAL_PHASE4_SESSION, { kind: 'runSecond' }, runner)).toBe(INITIAL_PHASE4_SESSION);
    expect(phase4SessionReducer(INITIAL_PHASE4_SESSION, { kind: 'beginRepair' }, runner)).toBe(INITIAL_PHASE4_SESSION);
    const afterFirst = phase4SessionReducer(INITIAL_PHASE4_SESSION, { kind: 'runFirst', record: FIRST }, runner);
    expect(phase4SessionReducer(afterFirst, { kind: 'runFirst', record: FIRST }, runner)).toBe(afterFirst);
    expect(calls).toHaveLength(1);
  });

  it('走行を拒否されたら理由だけを持ち、段階は進まない', () => {
    const runner: Phase4RaceRunner = () => ({ ok: false, reason: '巻数が足りません' });
    const state = phase4SessionReducer(INITIAL_PHASE4_SESSION, { kind: 'runFirst', record: FIRST }, runner);
    expect(state.stage).toBe('winding');
    expect(state.firstOutcome).toBeNull();
    expect(state.rejectReason).toBe('巻数が足りません');
  });

  it('巻き直し0件のままでは2走目を実行できない', () => {
    const { runner, calls } = stubRunner();
    const repairing = reduceAll([...TO_FACTS_FIRST, { kind: 'beginRepair' }, { kind: 'selectSection', index: 1 }], runner);
    expect(repairing.stage).toBe('repairing');
    expect(phase4SessionReducer(repairing, { kind: 'runSecond' }, runner)).toBe(repairing);
    expect(calls).toHaveLength(1);
  });

  it('巻き直しは1区間だけ受理し、2回目は状態を変えない', () => {
    const { runner } = stubRunner();
    const repaired = reduceAll(
      [...TO_FACTS_FIRST, { kind: 'beginRepair' }, { kind: 'selectSection', index: 1 },
       { kind: 'commitRepair', turns: canonicalSectionTurns() }],
      runner,
    );
    expect(repaired.stage).toBe('repaired');
    expect(phase4SessionReducer(repaired, { kind: 'commitRepair', turns: canonicalSectionTurns() }, runner)).toBe(repaired);
  });

  it('選択区間外のturnは値そのままで動かない', () => {
    const { runner } = stubRunner();
    const section = computeRepairSections(FIRST.length)[2];
    // 第3区間を、全ターン逆巻き・張力0の別物へ入れ替える(区間内は自由に4値を再入力できる)。
    const replacement: WindingRecord = FIRST.slice(section.start, section.end).map((turn) => ({
      ...turn, direction: -1 as const, tension: 0,
    }));
    const repaired = reduceAll(
      [...TO_FACTS_FIRST, { kind: 'beginRepair' }, { kind: 'selectSection', index: 2 },
       { kind: 'commitRepair', turns: replacement }],
      runner,
    );
    const after = repaired.repairedRecord;
    expect(after).not.toBeNull();
    if (after === null) return;
    expect(after).toHaveLength(FIRST.length);
    const same = (a: WindingRecord[number], b: WindingRecord[number]) =>
      a.position === b.position && a.arm === b.arm && a.direction === b.direction && a.tension === b.tension;
    const differing = after.flatMap((turn, index) => (same(turn, FIRST[index]) ? [] : [index]));
    expect(Math.min(...differing)).toBeGreaterThanOrEqual(section.start);
    expect(Math.max(...differing)).toBeLessThan(section.end);
  });

  it('区間長と違うターン数は拒否し、記録を壊さない', () => {
    const { runner } = stubRunner();
    const repairing = reduceAll([...TO_FACTS_FIRST, { kind: 'beginRepair' }, { kind: 'selectSection', index: 1 }], runner);
    const state = phase4SessionReducer(repairing, { kind: 'commitRepair', turns: [FIRST[0]] }, runner);
    expect(state.stage).toBe('repairing');
    expect(state.repairedRecord).toEqual(FIRST);
    expect(state.rejectReason).not.toBeNull();
  });

  it('確定前なら区間を選び直せる', () => {
    const { runner } = stubRunner();
    const repairing = reduceAll([...TO_FACTS_FIRST, { kind: 'beginRepair' }, { kind: 'selectSection', index: 0 }], runner);
    const back = phase4SessionReducer(repairing, { kind: 'reselectSection' }, runner);
    expect(back.stage).toBe('selectRepairSection');
    expect(back.selectedSection).toBeNull();
    expect(back.repairedRecord).toEqual(FIRST);
  });

  it('負けたままでは銘板へ進めない', () => {
    // playerの方が遅い(9秒 > 5秒)。
    const slowPlayer = { finishTimeS: 9, positionM: 10 } as never;
    const fastRival = { finishTimeS: 5, positionM: 10 } as never;
    const runner: Phase4RaceRunner = () => ({ ok: true, outcome: { player: slowPlayer, rival: fastRival } });
    const state = reduceAll(
      [...TO_FACTS_FIRST, { kind: 'beginRepair' }, { kind: 'selectSection', index: 1 },
       { kind: 'commitRepair', turns: canonicalSectionTurns() }, { kind: 'runSecond' },
       { kind: 'finishRace' }, { kind: 'showFacts' }],
      runner,
    );
    expect(state.stage).toBe('factsSecond');
    // playerの方が遅いので勝ちではない。
    expect(playerWon(state.secondOutcome!)).toBe(false);
    expect(phase4SessionReducer(state, { kind: 'toNameplate' }, runner)).toBe(state);
    expect(phase4SessionReducer(state, { kind: 'finish' }, runner).stage).toBe('complete');
  });

  it('resetで初期状態へ戻る', () => {
    const { runner } = stubRunner();
    const afterFirst = phase4SessionReducer(INITIAL_PHASE4_SESSION, { kind: 'runFirst', record: FIRST }, runner);
    expect(phase4SessionReducer(afterFirst, { kind: 'reset' }, runner)).toEqual(INITIAL_PHASE4_SESSION);
  });
});

describe('playerWon', () => {
  it('未完走は勝ちにしない。相手も未完走なら完走した側が勝ち', () => {
    const of = (player: number | null, rival: number | null) =>
      ({ player: { finishTimeS: player }, rival: { finishTimeS: rival } }) as never;
    expect(playerWon(of(1, 2))).toBe(true);
    expect(playerWon(of(2, 1))).toBe(false);
    expect(playerWon(of(null, 5))).toBe(false);
    expect(playerWon(of(null, null))).toBe(false);
    expect(playerWon(of(5, null))).toBe(true);
  });
});

describe('runPhase4Race', () => {
  it('storeへ触れずに走り、代表経路では実効巻数比が上がる', () => {
    const first = runPhase4Race(FIRST, baseline());
    const second = runPhase4Race(buildPhase4PlayerFixedRecord(), baseline());
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.outcome.player.aggregate.effectiveTurnsRatio)
      .toBeGreaterThan(first.outcome.player.aggregate.effectiveTurnsRatio);
    // 巻線以外は同一構成なので、rivalは1走目と2走目で完全に一致する(追従補正が無いことの実測)。
    expect(second.outcome.rival.finishTimeS).toBe(first.outcome.rival.finishTimeS);
    expect(second.outcome.rival.positionM).toBe(first.outcome.rival.positionM);
    // 腕構成を動かさない修正なので、軸ずれは初走から変わらない。
    expect(second.outcome.player.motorConfig.axisOffsetMm).toBe(first.outcome.player.motorConfig.axisOffsetMm);
  });

  it('createPhase4RaceRunnerはbaselineを束ねるだけで結果を変えない', () => {
    const direct = runPhase4Race(FIRST, baseline());
    const viaRunner = createPhase4RaceRunner(baseline())(FIRST);
    expect(direct.ok && viaRunner.ok).toBe(true);
    if (!direct.ok || !viaRunner.ok) return;
    expect(viaRunner.outcome.player.finishTimeS).toBe(direct.outcome.player.finishTimeS);
  });

  it('第一段は2.5秒で1回だけ第二段へ進み、写真判定の静止画を出す', () => {
    const strip = (path: string) =>
      readFileSync(new URL(path, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    const result = strip('../Phase4PrototypeResult.tsx');
    // 2〜3秒(UI計画§S4)の範囲内。
    expect(CELEBRATION_DURATION_MS).toBeGreaterThanOrEqual(2000);
    expect(CELEBRATION_DURATION_MS).toBeLessThanOrEqual(3000);
    expect(CELEBRATION_DURATION_MS).toBe(2500);
    // timerは張って必ず片付ける。二重発火はrefで止める。
    expect(result).toMatch(/window\.setTimeout\(/);
    expect(result).toMatch(/return \(\) => window\.clearTimeout\(id\);/);
    expect(result).toMatch(/if \(advancedRef\.current\) return;/);
    // 第一段には分析表・巻線を混ぜない。componentの範囲だけを切り出して見る
    // (file全体への正規表現だと、後続componentの記述まで拾ってしまう)。
    const celebrationStart = result.indexOf('export function Phase4ResultCelebration');
    const celebrationEnd = result.indexOf('function RunDataTable');
    expect(celebrationStart).toBeGreaterThan(-1);
    expect(celebrationEnd).toBeGreaterThan(celebrationStart);
    const celebration = result.slice(celebrationStart, celebrationEnd);
    expect(celebration).not.toMatch(/WindingCloseUp|RunDataTable|computeSectionSplits/);
    // 写真判定の静止画は静止モードで、進行buttonを出さない。
    const screen = strip('../Phase4PrototypeScreen.tsx');
    expect(screen).toMatch(/mode="still" showAdvanceButton=\{false\}/);
  });

  it('進行先の無い再生には「結果へ進む」を出さない', () => {
    const strip = (path: string) =>
      readFileSync(new URL(path, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    // buttonはshowAdvanceButtonとonFinishの両方が揃ったときだけ描く。
    expect(strip('../Phase4PrototypeRaceCanvas.tsx'))
      .toMatch(/\{showAdvanceButton && onFinish !== undefined && \(/);
    // 第二段のゴースト再生はbuttonなし。onFinishのno-op渡しも残っていない。
    const screen = strip('../Phase4PrototypeScreen.tsx');
    expect(screen).toMatch(/Phase4ResultFacts[\s\S]*?showAdvanceButton=\{false\}/);
    expect(screen).not.toMatch(/onFinish=\{\(\) => undefined\}/);
  });

  it('P4-0では音を一切追加しない(2026-08-26人間承認の案B、UI計画§7.3)', () => {
    // G5のUIコードに音の呼出し口が入り込んでいないことを、file走査で固定する。
    // 音はPhase 6へ繰り越しであり、「あとで足す」つもりの死蔵importも置かない。
    const roots = [new URL('../', import.meta.url), new URL('../../retro/race/', import.meta.url)];
    const sources: string[] = [];
    const walk = (dir: URL) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
        // 本test自身が禁止語を含むため、testは走査対象から外す(出荷されるのは実装コード)。
        if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(child); }
        else if (/\.tsx?$/.test(entry.name)) sources.push(readFileSync(child, 'utf8'));
      }
    };
    for (const root of roots) walk(root);
    // 走査が両rootへ届いていることの陽性対照。届いていなければ「音0件」は空虚に通る。
    expect(sources.some((source) => source.includes('Phase4PrototypeScreen'))).toBe(true);
    expect(sources.some((source) => source.includes('drawPhase4Race'))).toBe(true);
    for (const source of sources) {
      const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(stripped).not.toMatch(/AudioContext|SampleBank|playScore|seBus|renderInstrumentSample/);
      expect(stripped).not.toMatch(/from '.*retro\/audio/);
    }
  });

  it('session層はstore・localStorage・baseline構築のいずれにも触れない', () => {
    // コメントを先に落とす——説明文の中の語をimplementationと数えない。
    const strip = (path: string) =>
      readFileSync(new URL(path, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    for (const path of [
      '../sessionReducer.ts',
      '../Phase4PrototypeScreen.tsx',
      '../Phase4PrototypeRaceCanvas.tsx',
      '../Phase4PrototypeResult.tsx',
    ]) {
      const source = strip(path);
      expect(source).not.toMatch(/localStorage|sessionStorage/);
      expect(source).not.toMatch(/from '\.\.\/store\//);
      expect(source).not.toMatch(/useGameStore|useSaveStore/);
      // baselineは注入されるだけで、p40側では組み立てない(S-4単一出典)。
      expect(source).not.toMatch(/resolveChassisBaselineG|chassisBaselineG:/);
    }
    // 走行以降は採用案II-B(semi)でのみ開く。他2案はG2の比較のまま巻線で終わる。
    expect(strip('../Phase4PrototypeScreen.tsx')).toMatch(/kind === 'semi' && session\.stage === 'winding'/);
    // 巻き直し中の「ほかのNターン」は区間外ターン数(30-7=23)で、入力の進み具合に依存しない。
    // previewRecordは既に区間外を含むため、区間長ではなく入力中のぶんを引く(旧式は二重減算)。
    const screenSource = strip('../Phase4PrototypeScreen.tsx');
    expect(screenSource).toMatch(/\{previewRecord\.length - state\.record\.length\}ターンは値そのままで変わりません。/);
    expect(screenSource).not.toMatch(/previewRecord\.length - \(section\.end - section\.start\)/);
  });
});
