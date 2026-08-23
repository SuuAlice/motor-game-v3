// P3-4 G7(DoD6・DoD10): 図鑑/検死レポートの表示判断。Reactレンダリングなしで固定する
// (既存`saveGateMode.test.ts`と同じ方針。新規テスト依存は追加していない)。
//
// 中核は「**legacy recordを断定的に表示しない**」こと——P3-4以前の記録は
// 「観測したが異常が無かった」のではなく「そもそも記録していない」。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  describeD04Stage, toCodexRecordView, formatDegradationDiff, UNRECORDED_NOTE,
  CODEX_MODE_IDS, buildCodexCells, describeRunContext, formatCauseLogLines,
  formatModeSpecificCauseLines, shouldShowFirstDiscoveryReward,
} from '../encyclopediaView';
import { createInitialDestructionState } from '../../engine/destructionModes';
import type { DegradationDiff } from '../../engine/destructionOrchestration';

describe('DoD6: D04段階表示——legacy recordを「膨張なし」と誤表示しない', () => {
  it('legacy record(finalDestructionStateなし)はunrecordedで、中立文言を持つ', () => {
    const result = describeD04Stage(undefined);

    expect(result.kind).toBe('unrecorded');
    if (result.kind !== 'unrecorded') throw new Error('unreachable');
    expect(result.note).toBe(UNRECORDED_NOTE);
    expect(result.note).toContain('記録なし');
    // 「なし」と断定する表現を含まない(「膨張なし」等)
    expect(result.note).not.toContain('膨張');
  });

  it("legacyは'none'を返さない——'none'(観測して膨張なし)と型で区別される", () => {
    const legacy = describeD04Stage(undefined);
    const observed = describeD04Stage(createInitialDestructionState('lipo'));

    expect(legacy.kind).toBe('unrecorded');
    expect(observed.kind).toBe('recorded');
    if (observed.kind !== 'recorded') throw new Error('unreachable');
    expect(observed.value).toBe('none');
    // 呼出し側がうっかり同一視できないこと(kindが異なる)
    expect(legacy.kind).not.toBe(observed.kind);
  });

  it("nonLipo電池は'none'を観測済みの事実として返す(記録なしではない)", () => {
    const result = describeD04Stage(createInitialDestructionState('nonLipo'));

    expect(result.kind).toBe('recorded');
    if (result.kind !== 'recorded') throw new Error('unreachable');
    expect(result.value).toBe('none'); // この構成では起こりえない、という観測済みの事実
  });
});

describe('DoD10: 図鑑記録の表示——legacy/currentで持てる情報が異なる', () => {
  const replaySnapshot = { dummy: true } as never;
  const discoveryEvent = { mode: 'D01', causeLog: {}, isFirstThisSession: true, physicsSnapshotAtT: {} } as never;
  const diffs: readonly DegradationDiff[] = [{ role: 'gear', kind: 'toothLoss', deltaCount: 3 }];

  it('current record は discoveryEvent と runDegradationDiffs を recorded で返す', () => {
    const view = toCodexRecordView({
      modeId: 'D01', firstDiscoveredAtRunSequence: 5, replaySnapshot,
      discoveryEvent, runDegradationDiffs: diffs,
    } as never);

    expect(view.modeId).toBe('D01');
    expect(view.firstDiscoveredAtRunSequence).toBe(5);
    expect(view.discoveryEvent.kind).toBe('recorded');
    expect(view.runDegradationDiffs.kind).toBe('recorded');
    if (view.runDegradationDiffs.kind !== 'recorded') throw new Error('unreachable');
    expect(view.runDegradationDiffs.value).toEqual(diffs);
  });

  it('legacy record は2フィールドとも unrecorded になり、「劣化なし」と表示されない', () => {
    const view = toCodexRecordView({
      modeId: 'D07', firstDiscoveredAtRunSequence: 2, replaySnapshot,
    } as never);

    expect(view.discoveryEvent.kind).toBe('unrecorded');
    expect(view.runDegradationDiffs.kind).toBe('unrecorded');
    if (view.runDegradationDiffs.kind !== 'unrecorded') throw new Error('unreachable');
    expect(view.runDegradationDiffs.note).toBe(UNRECORDED_NOTE);
    // 空配列(=劣化が無かった)として扱われないこと。ここを取り違えると
    // 「旧バージョンで発見したモードは劣化ゼロだった」と嘘を表示することになる。
    expect(view.runDegradationDiffs).not.toEqual({ kind: 'recorded', value: [] });
  });

  it('legacy でも「発見済みである」事実自体は保持される', () => {
    const view = toCodexRecordView({
      modeId: 'D07', firstDiscoveredAtRunSequence: 2, replaySnapshot,
    } as never);

    expect(view.modeId).toBe('D07');
    expect(view.firstDiscoveredAtRunSequence).toBe(2);
  });
});

describe('劣化差分の整形——観測された事実のみを書き、原因を断定しない', () => {
  it.each([
    [{ role: 'magnet', kind: 'demagnetization', deltaFraction: 0.1 }, '磁石: 減磁 10.0 %'],
    [{ role: 'gear', kind: 'toothLoss', deltaCount: 3 }, 'ギヤ: 歯欠け 3 本'],
    [{ role: 'bearing', kind: 'seizure', deltaFraction: 0.2 }, '軸受: 焼付き 20.0 %'],
    [{ role: 'brush', kind: 'wear', deltaFraction: 0.005 }, 'ブラシ: 摩耗 0.5 %'],
    [{ role: 'rotor', kind: 'collapse' }, 'ローター: 崩壊'],
    [{ role: 'rotor', kind: 'burnout' }, 'ローター: 焼損'],
    [{ role: 'battery', kind: 'consumed' }, '電池: 消耗(消滅)'],
    [{ role: 'body', kind: 'scorch', deltaFraction: 0.03 }, 'ボディ: 焦げ 3.0 %'],
  ] as [DegradationDiff, string][])('%j → %s', (diff, expected) => {
    expect(formatDegradationDiff(diff)).toBe(expected);
  });

  it('原因を断定する語(「〜のせい」「原因は」等)を含まない', () => {
    const texts = ([
      { role: 'magnet', kind: 'demagnetization', deltaFraction: 0.1 },
      { role: 'gear', kind: 'toothLoss', deltaCount: 3 },
    ] as DegradationDiff[]).map(formatDegradationDiff);

    for (const text of texts) {
      expect(text).not.toMatch(/原因|せい|ため|べき/);
    }
  });

  it('単位を省略しない(UIテキスト規約)', () => {
    expect(formatDegradationDiff({ role: 'magnet', kind: 'demagnetization', deltaFraction: 0.1 })).toContain('%');
    expect(formatDegradationDiff({ role: 'gear', kind: 'toothLoss', deltaCount: 3 })).toContain('本');
  });
});

// ---------------------------------------------------------------------------
// 実画面への配線を構造テストで固定する。純関数を作っただけで画面から呼ばれていなければ、
// legacy中立表示はruntimeで一度も効かない——「テスト専用の未使用コード」になる。
// (本リポジトリはReactレンダリング環境を持たないため、呼出しの存在を構造で確認する)
// ---------------------------------------------------------------------------
describe('実画面への配線(未使用コードでないことの担保)', () => {
  const componentsDir = fileURLToPath(new URL('../', import.meta.url));

  it('describeD04Stageは実験ノート詳細画面から呼ばれている(§10.4のlegacy中立表示)', () => {
    const source = readFileSync(join(componentsDir, 'ExperimentNotebook.tsx'), 'utf-8');
    // import文の完全一致では、同じモジュールから別の関数を併せてimportしただけで壊れる。
    // 担保したいのは「実際に呼ばれていること」なので、記号のimportと呼出しの両方を見る。
    expect(source).toMatch(/import \{[^}]*\bdescribeD04Stage\b[^}]*\} from '\.\/encyclopediaView'/);
    expect(source).toContain('describeD04Stage(session.finalDestructionState)');
    // unrecorded腕が実際に分岐として使われている(recorded側だけ表示して終わらない)
    expect(source).toContain("d04.kind === 'unrecorded'");
    expect(source).toContain('d04.note');
  });

  it('図鑑画面はdiscoveryEvent(causeLog)を実際に消費している', () => {
    const source = readFileSync(join(componentsDir, 'EncyclopediaScreen.tsx'), 'utf-8');
    expect(source).toContain('formatCauseLogLines');
    expect(source).toContain('discoveryEvent.value.causeLog');
    // legacy(unrecorded)側の分岐も存在する
    expect(source).toContain("discoveryEvent.kind === 'unrecorded'");
  });

  it('図鑑画面は8マス固定の一覧(buildCodexCells)とシルエットを使っている', () => {
    const source = readFileSync(join(componentsDir, 'EncyclopediaScreen.tsx'), 'utf-8');
    expect(source).toContain('buildCodexCells');
    expect(source).toContain("cell.kind === 'silhouette'");
  });

  it('recipeKeyは図鑑画面のコードに現れない(§3.5: 内部識別子を表示しない)', () => {
    // コメントは除去して数える——コメント本文の言及("recipeKeyは画面に出さない")を
    // 実コードとして誤検出しないため(G6のC-4構造テストと同じ規律)。
    const source = readFileSync(join(componentsDir, 'EncyclopediaScreen.tsx'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(source).not.toContain('recipeKey');
  });
});

describe('一覧8マス: D01〜D07・D09固定、D08は含めない', () => {
  it('CODEX_MODE_IDSは8件で、D08を含まない', () => {
    expect(CODEX_MODE_IDS).toEqual(['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D09']);
    expect(CODEX_MODE_IDS).not.toContain('D08');
  });

  it('未発見マスはモードIDを伏せ、発見情報を一切持たない(シルエット契約)', () => {
    const cells = buildCodexCells([]);

    expect(cells).toHaveLength(8);
    expect(cells.every((cell) => cell.kind === 'silhouette')).toBe(true);
    for (const cell of cells) {
      expect(cell.heading).toBe('未発見');
      // どのモードが未発見かを漏らさない(「答えを教えない」spec §1.2)
      expect(cell.heading).not.toMatch(/D0[1-9]/);
      expect('record' in cell).toBe(false);
    }
  });

  it('発見済みマスは見出しにモードIDと症状名を持ち、位置は固定される', () => {
    const cells = buildCodexCells([
      { modeId: 'D03', firstDiscoveredAtRunSequence: 1, replaySnapshot: { runContext: { context: 'motor' }, track: null } },
    ] as never);

    expect(cells[2]!.kind).toBe('discovered'); // D03は3番目の固定枠
    expect(cells[2]!.heading).toBe('D03 電池破裂');
    expect(cells[0]!.kind).toBe('silhouette'); // D01は未発見のまま
  });
});

describe('走行文脈の表示(§3.2の3)', () => {
  it.each([
    [{ runContext: { context: 'motor' }, track: null }, 'モーター単体'],
    [{ runContext: { context: 'vehicle' }, track: null }, 'テスト走行'],
    [{ runContext: { context: 'vehicle' }, track: { id: 'straight-10m' } }, 'コース走行'],
  ])('%j → %s', (snapshot, expected) => {
    expect(describeRunContext(snapshot as never)).toBe(expected);
  });
});

describe('causeLogの整形——未較正であることを必ず併記する(§3.2 熱ゲージ表示)', () => {
  it('uncalibratedGaugeは「温度モデル未較正」を併記する(生の比率を温度として読ませない)', () => {
    const lines = formatCauseLogLines({
      atT: 2.05, rpm: 1176.62, currentA: 2.2627,
      temperature: { kind: 'uncalibratedGauge', ratio: 0.15083 },
    });

    const gaugeLine = lines.find((line) => line.includes('熱ゲージ'))!;
    expect(gaugeLine).toContain('15.1 %');
    expect(gaugeLine).toContain('温度モデル未較正');
    // 「℃」等の温度単位を使わない
    expect(gaugeLine).not.toContain('℃');
  });

  it('unavailableは計測できない旨を出す(0や「正常」と誤読させない)', () => {
    const lines = formatCauseLogLines({ temperature: { kind: 'unavailable' } });

    expect(lines).toContain('熱ゲージ: 計測できません');
  });

  it('単位を省略しない', () => {
    const lines = formatCauseLogLines({ atT: 1, rpm: 100, currentA: 0.5 });
    expect(lines.join('\n')).toContain('秒');
    expect(lines.join('\n')).toContain('rpm');
    expect(lines.join('\n')).toContain('A');
  });
});

// ---------------------------------------------------------------------------
// §3.2の4: モード固有causeLog値。DestructionEvent判別unionに対する有限switchであり、
// 汎用スキーマ駆動rendererではない——モードごとに意味の異なる値を一律ラベルで並べると
// プレイヤーに誤った読み方をさせるため。
// ---------------------------------------------------------------------------
describe('モード固有causeLog値の整形(§3.2の4)', () => {
  const common = { atT: 1, rpm: 100, currentA: 0.5, temperature: { kind: 'unavailable' as const } };

  it('D04: affectedRolesを唯一の入力として延焼部位を表示する(装備状況から推測しない)', () => {
    const lines = formatModeSpecificCauseLines({
      mode: 'D04', isFirstThisSession: true, affectedRoles: ['body', 'magnet'],
      causeLog: { ...common, stage: 'burning', batteryHeatRatio: 0.9, shortCircuitDurationS: 1.5, overDischargeRatio: 0.95 },
    } as never);

    expect(lines).toContain('延焼: ボディ・磁石');
    expect(lines).toContain('段階: 炎上');
  });

  it('D04: 延焼なし・過放電なしを「0」と混同させない', () => {
    const lines = formatModeSpecificCauseLines({
      mode: 'D04', isFirstThisSession: true, affectedRoles: [],
      causeLog: { ...common, stage: 'swelling', batteryHeatRatio: 0.5, shortCircuitDurationS: 0, overDischargeRatio: null },
    } as never);

    expect(lines).toContain('延焼: なし');
    expect(lines).toContain('過放電: なし'); // nullを0.0 %と表示しない
    expect(lines.join('\n')).not.toContain('過放電: 0.0 %');
  });

  it('D05: 理論電流を出す(実電流との差が瞬断の度合いを示す)', () => {
    const lines = formatModeSpecificCauseLines({
      mode: 'D05', isFirstThisSession: true,
      causeLog: { ...common, sparkDurationS: 0.025, theoreticalCurrentA: 3.125 },
    } as never);

    expect(lines).toContain('理論電流: 3.125 A');
    expect(lines).toContain('火花の継続: 0.025 秒');
  });

  it('D06: 負荷トルクと歯欠け数、全損時は空転を明示する', () => {
    const partial = formatModeSpecificCauseLines({
      mode: 'D06', isFirstThisSession: true, isTotalLoss: false,
      causeLog: { ...common, loadTorqueNm: 0.01084, toothLossCount: 3 },
    } as never);
    const total = formatModeSpecificCauseLines({
      mode: 'D06', isFirstThisSession: true, isTotalLoss: true,
      causeLog: { ...common, loadTorqueNm: 0.07663, toothLossCount: 10 },
    } as never);

    expect(partial).toContain('負荷トルク: 0.01084 N·m');
    expect(partial).toContain('歯欠け: 3 本');
    expect(partial).not.toContain('ギヤ全損(空転)');
    expect(total).toContain('ギヤ全損(空転)');
  });

  it('D09: OR条件のどちらが成立したかを両方示す', () => {
    const lines = formatModeSpecificCauseLines({
      mode: 'D09', isFirstThisSession: true,
      causeLog: { ...common, bearingHeatGaugeRatio: 0.1503, metalGearContactActive: false, highLoadHighSpeedActive: true },
    } as never);

    expect(lines).toContain('金属ギヤ接触: なし');
    expect(lines).toContain('高負荷×高速: あり');
  });

  it.each([
    ['D02', { coilHeatGaugeRatio: 0.5 }, 'コイル発熱ゲージ'],
    ['D03', { batteryHeatRatio: 0.8, shortCircuitDurationS: 3 }, '電池発熱'],
    ['D07', { magnetHeatGaugeRatio: 0.9 }, '磁石発熱ゲージ'],
  ] as [string, Record<string, unknown>, string][])(
    '%s: ゲージ表示は必ず「温度モデル未較正」を併記する', (mode, extra, label) => {
      const lines = formatModeSpecificCauseLines({
        mode, isFirstThisSession: true, causeLog: { ...common, ...extra },
      } as never);

      const gaugeLine = lines.find((line) => line.includes(label))!;
      expect(gaugeLine).toContain('温度モデル未較正');
      expect(gaugeLine).not.toContain('℃');
    });

  it('D01は固有値を持たない(空配列。共通行だけが出る)', () => {
    expect(formatModeSpecificCauseLines({ mode: 'D01', isFirstThisSession: true, causeLog: common } as never)).toEqual([]);
  });
});

describe('§3.2の5: 初回発見の報酬表示は初回のみ', () => {
  const view = { modeId: 'D01', firstDiscoveredAtRunSequence: 7 } as never;

  it('当該走行で初めて発見したときだけ表示する', () => {
    expect(shouldShowFirstDiscoveryReward(view, 7)).toBe(true);
  });

  it('既発見(過去の走行で発見済み)では表示しない', () => {
    expect(shouldShowFirstDiscoveryReward(view, 12)).toBe(false);
  });

  it('走行が未適用(null)なら表示しない', () => {
    expect(shouldShowFirstDiscoveryReward(view, null)).toBe(false);
  });
});

describe('モード固有値・報酬・ノート導線が実画面へ配線されている', () => {
  it('図鑑画面がformatModeSpecificCauseLines/報酬表示/ノート導線を使っている', () => {
    const source = readFileSync(fileURLToPath(new URL('../EncyclopediaScreen.tsx', import.meta.url)), 'utf-8');
    expect(source).toContain('formatModeSpecificCauseLines(selected.record.discoveryEvent.value)');
    expect(source).toContain('shouldShowFirstDiscoveryReward');
    expect(source).toContain('onOpenNotebook');
    // ノートボタンはmodeを変えない——utilityPageは背後のmodeを保持して開閉する設計であり、
    // ここでmodeを変えるとノートを閉じたあと図鑑へ戻れなくなる。
    const buttonRegion = source.slice(source.indexOf('onOpenNotebook?.()') - 400, source.indexOf('実験ノートを開く'));
    expect(buttonRegion).not.toContain("setMode('title')");
  });
});
