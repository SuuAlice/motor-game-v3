// P3-4 G6(§16.4、F2・G1・G3是正): finalDestructionState/recipeKeyの交差不変条件validatorのテスト。
import { describe, expect, it } from 'vitest';
import {
  acceptsPendingNotebookFinalFields,
  acceptsStoredNotebookFinalFields,
  validateNotebookExportFinalFields,
  validateNotebookFinalFields,
} from '../notebookValidation';
import { parseNotebookJson, stringifyNotebook, type StoredExperimentSession } from '../notebookStore';
import { createInitialDestructionState } from '../../engine/destructionModes';

const VALID_STATE = createInitialDestructionState('lipo');
const VALID_KEY = 'v1|gear-pom|magnet-neodymium';

/** legacy形状(両フィールドとも持たない、P3-4以前の記録相当)。 */
function legacyRaw(): Record<string, unknown> {
  return { id: 'rec-1', savedAt: '2026-08-19T00:00:00.000Z' };
}
function currentRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...legacyRaw(), finalDestructionState: VALID_STATE, recipeKey: VALID_KEY, ...overrides };
}

describe('notebookValidation.ts: validateNotebookFinalFields(§16.4)', () => {
  it('両方なし=legacyと判定する', () => {
    expect(validateNotebookFinalFields(legacyRaw())).toEqual({ ok: true, kind: 'legacy' });
  });

  it('両方あり=currentと判定し、検証済みの値を返す', () => {
    const result = validateNotebookFinalFields(currentRaw());
    expect(result).toMatchObject({ ok: true, kind: 'current', recipeKey: VALID_KEY });
    if (result.ok && result.kind === 'current') expect(result.finalDestructionState).toEqual(VALID_STATE);
  });

  it('finalDestructionStateだけ存在する半状態を拒否する(F2是正の核心)', () => {
    const raw = { ...legacyRaw(), finalDestructionState: VALID_STATE };
    const result = validateNotebookFinalFields(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('存在が一致しません');
  });

  it('recipeKeyだけ存在する半状態を拒否する', () => {
    const result = validateNotebookFinalFields({ ...legacyRaw(), recipeKey: VALID_KEY });
    expect(result.ok).toBe(false);
  });

  it('finalDestructionStateの形状が不正なら拒否する(deep検証)', () => {
    expect(validateNotebookFinalFields(currentRaw({ finalDestructionState: { modes: {} } })).ok).toBe(false);
    expect(validateNotebookFinalFields(currentRaw({ finalDestructionState: null })).ok).toBe(false);
  });

  it('recipeKeyが空文字列なら拒否する(G3是正)', () => {
    const result = validateNotebookFinalFields(currentRaw({ recipeKey: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('空文字列');
  });

  it('recipeKeyが文字列でなければ拒否する', () => {
    expect(validateNotebookFinalFields(currentRaw({ recipeKey: 123 })).ok).toBe(false);
  });

  it.each([
    ['not-an-envelope'],
    ['v|payload'], // version番号なし
    ['v0|payload'], // 0始まりは不可([1-9]で始まる)
    ['v1payload'], // パイプ区切りなし
    ['|v1|payload'], // 先頭一致でない
  ])('recipeKeyがenvelope形式(v{n}|...)でなければ拒否する: %s', (key) => {
    const result = validateNotebookFinalFields(currentRaw({ recipeKey: key }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('envelope形式');
  });

  it.each([['v1|x'], ['v3|x'], ['v10|x'], ['v42|payload|with|pipes']])('正当なenvelope形式は受理する: %s', (key) => {
    expect(validateNotebookFinalFields(currentRaw({ recipeKey: key })).ok).toBe(true);
  });

  it('envelopeの`|`以降のpayloadは再parseしない(opaque契約)', () => {
    // payloadが空でも、区切り以降が何であっても外形が合っていれば受理する。
    expect(validateNotebookFinalFields(currentRaw({ recipeKey: 'v1|' })).ok).toBe(true);
  });

  it('値がundefinedのキーが存在する場合はlegacyではなく形状不正として拒否する', () => {
    // JSON往復ではこの形にならないが、in演算子による存在判定の意味を固定する。
    const result = validateNotebookFinalFields({ ...legacyRaw(), finalDestructionState: undefined, recipeKey: undefined });
    expect(result.ok).toBe(false);
  });
});

describe('notebookValidation.ts: 呼出し側の契約分離(G1是正)', () => {
  it('永続履歴向けはlegacy・currentの両方を受理する', () => {
    expect(acceptsStoredNotebookFinalFields(legacyRaw())).toBe(true);
    expect(acceptsStoredNotebookFinalFields(currentRaw())).toBe(true);
  });

  it('pending向けはcurrentのみ受理し、legacyを明示的に拒否する', () => {
    expect(acceptsPendingNotebookFinalFields(currentRaw())).toBe(true);
    expect(acceptsPendingNotebookFinalFields(legacyRaw())).toBe(false);
  });

  it('半状態はどちらの経路でも一貫して拒否される', () => {
    const halfA = { ...legacyRaw(), finalDestructionState: VALID_STATE };
    const halfB = { ...legacyRaw(), recipeKey: VALID_KEY };
    for (const raw of [halfA, halfB]) {
      expect(acceptsStoredNotebookFinalFields(raw)).toBe(false);
      expect(acceptsPendingNotebookFinalFields(raw)).toBe(false);
    }
  });

  it('recipeKeyの形式不正はどちらの経路でも一貫して拒否される(G3是正)', () => {
    for (const key of ['', 'not-an-envelope']) {
      const raw = currentRaw({ recipeKey: key });
      expect(acceptsStoredNotebookFinalFields(raw)).toBe(false);
      expect(acceptsPendingNotebookFinalFields(raw)).toBe(false);
    }
  });
});

describe('notebookValidation.ts: JSON export/importのversion 1/2運用(§16.2(1)、項目C)', () => {
  it('version 1はlegacyのみを受理する', () => {
    expect(validateNotebookExportFinalFields(1, [legacyRaw(), legacyRaw()])).toMatchObject({ ok: true, version: 1 });
  });

  it('version 1にcurrent要素が混じっていれば拒否する(version宣言と中身の食い違い)', () => {
    const result = validateNotebookExportFinalFields(1, [legacyRaw(), currentRaw()]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('version 1にcurrent形式');
  });

  it('version 2はlegacy/currentの混在を受理する(履歴を捨てない)', () => {
    expect(validateNotebookExportFinalFields(2, [legacyRaw(), currentRaw()])).toMatchObject({ ok: true, version: 2 });
  });

  it('半状態はversion 1・2のどちらでも拒否する', () => {
    const half = { ...legacyRaw(), recipeKey: VALID_KEY };
    for (const version of [1, 2]) {
      const result = validateNotebookExportFinalFields(version, [half]);
      expect(result.ok, `version=${version}`).toBe(false);
    }
  });

  it.each([[0], [3], ['2'], [undefined], [null]])('未知のversionは拒否する: %s', (version) => {
    const result = validateNotebookExportFinalFields(version, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('対応していない');
  });

  it('要素がオブジェクトでなければ位置付きで拒否する', () => {
    const result = validateNotebookExportFinalFields(2, [legacyRaw(), 'not-an-object']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('sessions[1]');
  });
});

describe('notebookStore.ts: export→importの往復(G2是正、legacy/current混在を欠落なく復元)', () => {
  /** parse側の基本形状検証(isSession)を通る最小のsession。 */
  function sessionBase(id: string) {
    return {
      id, startedAt: 'a', endedAt: 'b', config: { coilTurns: 80 }, seed: 1, steadyRpm: 0,
      averageCurrent: 0, maxCurrent: 0, currentRatio: 0, rpmVariation: 0, maxBatteryHeat: 0,
      events: [], samples: [],
    };
  }

  it('新規exportは常にversion 2で、legacy要素をcurrentへ捏造変換しない', () => {
    const legacy = sessionBase('s-legacy') as unknown as StoredExperimentSession;
    const current = { ...sessionBase('s-current'), finalDestructionState: VALID_STATE, recipeKey: VALID_KEY } as unknown as StoredExperimentSession;
    const json = JSON.parse(stringifyNotebook([legacy, current])) as { version: number; sessions: Record<string, unknown>[] };
    expect(json.version).toBe(2);
    expect('finalDestructionState' in json.sessions[0]).toBe(false); // legacyはlegacyのまま
    expect(json.sessions[1].recipeKey).toBe(VALID_KEY);
  });

  it('legacy/current混在のversion 2 exportは、往復で全件が欠落なく復元される', () => {
    const legacy = sessionBase('s-legacy') as unknown as StoredExperimentSession;
    const current = { ...sessionBase('s-current'), finalDestructionState: VALID_STATE, recipeKey: VALID_KEY } as unknown as StoredExperimentSession;
    const restored = parseNotebookJson(stringifyNotebook([legacy, current]));
    expect(restored).toHaveLength(2);
    expect(restored.map((s) => s.id)).toEqual(['s-legacy', 's-current']);
    expect(restored[1].recipeKey).toBe(VALID_KEY);
    expect('finalDestructionState' in restored[0]).toBe(false);
  });

  it('既存のversion 1エクスポート(legacyのみ)は引き続きimportできる(後方互換)', () => {
    const v1 = JSON.stringify({ version: 1, exportedAt: 'x', sessions: [sessionBase('old-1')] });
    const restored = parseNotebookJson(v1);
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe('old-1');
  });

  it('version 1にcurrent形式が混じったJSONはimportで拒否される', () => {
    const bad = JSON.stringify({
      version: 1, exportedAt: 'x',
      sessions: [{ ...sessionBase('x'), finalDestructionState: VALID_STATE, recipeKey: VALID_KEY }],
    });
    expect(() => parseNotebookJson(bad)).toThrow('セッションデータが正しくありません');
  });

  it('半状態を含むJSONはimportで拒否される(往復経路でも交差不変条件が効く)', () => {
    const bad = JSON.stringify({ version: 2, exportedAt: 'x', sessions: [{ ...sessionBase('x'), recipeKey: VALID_KEY }] });
    expect(() => parseNotebookJson(bad)).toThrow('セッションデータが正しくありません');
  });
});
