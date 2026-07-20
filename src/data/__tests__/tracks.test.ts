import { describe, expect, it } from 'vitest';
import { validateTrackDefinition } from '../../engine/trackPhysics';
import { TRACK_BY_ID, TRACKS } from '../tracks';

describe('Phase3 コースデータ', () => {
  it('5種類のコースを重複しないIDで定義する', () => {
    expect(TRACKS).toHaveLength(5);
    expect(new Set(TRACKS.map((track) => track.id)).size).toBe(TRACKS.length);
    expect(TRACK_BY_ID.size).toBe(TRACKS.length);
  });

  it('全コースがデータ契約を満たす', () => {
    for (const track of TRACKS) expect(validateTrackDefinition(track)).toEqual([]);
  });

  it('全コースに通常条件とEX条件がある', () => {
    for (const track of TRACKS) {
      expect(track.objectives.length).toBeGreaterThan(0);
      expect(track.exObjectives?.length).toBeGreaterThan(0);
      expect(track.objectives.some((objective) => objective.kind === 'finish')).toBe(true);
      expect(track.exObjectives?.some((objective) => objective.kind === 'finish')).toBe(true);
    }
  });

  it('各コースが異なる物理課題を持つ', () => {
    expect(TRACK_BY_ID.get('hill-climb')?.segments.some((segment) => segment.slopeDeg > 0)).toBe(true);
    expect(TRACK_BY_ID.get('curve-balance')?.segments.some((segment) => segment.curveRadiusM !== undefined)).toBe(true);
    expect(Math.max(...(TRACK_BY_ID.get('rough-board')?.segments.map((segment) => segment.roughness) ?? []))).toBeGreaterThan(0.5);
    expect(TRACK_BY_ID.get('energy-run')?.hasEnergyBudget).toBe(true);
  });
});
