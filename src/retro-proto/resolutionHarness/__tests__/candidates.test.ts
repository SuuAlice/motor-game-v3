import { describe, expect, it } from 'vitest';
import { CANDIDATES, DEFAULT_CANDIDATE_ID } from '../candidates';

// Phase1解像度確定(2026-07-22人間承認)の回帰固定: 既定候補が採用値(b)であること、
// 候補b/cのラベルが採否を明示し「本命」が残っていないことを検証する。
describe('candidates(Phase1解像度確定の反映)', () => {
  it('既定候補は採用済みのb', () => {
    expect(DEFAULT_CANDIDATE_ID).toBe('b');
  });

  it('候補bのラベルは採用を明示する', () => {
    const b = CANDIDATES.find((c) => c.id === 'b');
    expect(b?.label).toContain('採用');
  });

  it('候補cのラベルは不採用を明示する', () => {
    const c = CANDIDATES.find((c) => c.id === 'c');
    expect(c?.label).toContain('不採用');
  });

  it('どの候補ラベルにも「本命」が残っていない', () => {
    for (const candidate of CANDIDATES) {
      expect(candidate.label).not.toContain('本命');
    }
  });
});
