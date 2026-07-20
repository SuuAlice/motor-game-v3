import { describe, expect, it } from 'vitest';
import { generateDummyWindingRecord } from '../dummyWindingRecord';

describe('generateDummyWindingRecord', () => {
  it('既定で150ターンを生成する', () => {
    expect(generateDummyWindingRecord()).toHaveLength(150);
  });

  it('同じseedなら決定論的に同じ記録を生成する', () => {
    const a = generateDummyWindingRecord(123);
    const b = generateDummyWindingRecord(123);
    expect(a).toEqual(b);
  });

  it('異なるseedなら異なる記録になる', () => {
    const a = generateDummyWindingRecord(1);
    const b = generateDummyWindingRecord(2);
    expect(a).not.toEqual(b);
  });

  it('position/tensionは0〜1の範囲に収まる', () => {
    for (const turn of generateDummyWindingRecord()) {
      expect(turn.position).toBeGreaterThanOrEqual(0);
      expect(turn.position).toBeLessThanOrEqual(1);
      expect(turn.tension).toBeGreaterThanOrEqual(0.3);
      expect(turn.tension).toBeLessThanOrEqual(1);
    }
  });

  it('逆巻き区間(方向反転)を少なくとも1回は含む', () => {
    const turns = generateDummyWindingRecord();
    const directions = new Set(turns.map((t) => t.direction));
    expect(directions.size).toBe(2);
  });
});
