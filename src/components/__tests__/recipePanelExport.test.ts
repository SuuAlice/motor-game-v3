// P4-1B B-F7(2026-08-30 Suu受入レビュー是正): MC4生成の到達可能な例外を外へ漏らさない。
//
// LabModeのParamPanelはP4-1Bでも維持され、装備ローターの記録とは独立に
// `coilTurns`・線径・並列本数を動かせる。そのため`encodeRecipe`のfail-closed契約
// (記録長との不一致・巻きスペース超過など)は**実際に到達する**。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encodeRecipe, RecipeCodeError, type CarRecipe } from '../../engine/recipeCode';
import { DEFAULT_GARAGE_SELECTION, resolveGarageBuild } from '../../data/partPresets';
import type { MotorConfig } from '../../engine/motorPhysics';
import type { WindingRecord } from '../../materials/windingRecord';

const build = resolveGarageBuild(DEFAULT_GARAGE_SELECTION);

/** 無傷のbase config。`effectiveTurnsRatio`は既定(undefined=1)のまま渡す。 */
const BASE_MOTOR: MotorConfig = {
  coilTurns: 30,
  slitWidthMm: 1.5,
  sandingQuality: 0.9,
  brushPressure: 0.3,
  magnetStrength: 0.9,
  magnetDistanceMm: 10,
  batteryVoltage: 3,
  axisOffsetMm: 0,
  wireGaugeMm: 0.4,
  parallelStrands: 1,
  varnished: true,
  wireResistivityRatio: 1,
  wireDensityRatio: 1,
  batteryInternalResistanceRatio: 1,
  batteryCapacityRatio: 1,
  brushContactResistanceRatio: 1,
  brushChatterProbabilityRatio: 1,
};
const record = (n: number): WindingRecord =>
  Array.from({ length: n }, (_, i) => ({
    position: (i % 32) / 32, arm: 'straddle' as const, direction: 1 as const, tension: 0.5,
  }));

function recipeWith(coilTurns: number, windingRecord: WindingRecord | null): CarRecipe {
  return {
    motorConfig: { ...BASE_MOTOR, coilTurns },
    carConfig: build.carConfig,
    appearance: {
      bodyColorId: DEFAULT_GARAGE_SELECTION.bodyColorId,
      accentColorId: DEFAULT_GARAGE_SELECTION.accentColorId,
    },
    seed: 1,
    windingRecord,
  };
}

describe('encodeRecipeのfail-closedは到達可能', () => {
  it('装備recordとconfig.coilTurnsが不一致ならthrowする', () => {
    // LabModeで巻数だけを動かした状況。記録は30ターンのまま。
    expect(() => encodeRecipe(recipeWith(31, record(30)))).toThrow(RecipeCodeError);
  });

  it('記録が無ければthrowする(逆生成しない)', () => {
    expect(() => encodeRecipe(recipeWith(30, null))).toThrow(RecipeCodeError);
  });

  it('一致していれば生成できる', () => {
    const encoded = encodeRecipe(recipeWith(30, record(30)));
    expect(encoded.startsWith('MC4-')).toBe(true);
  });
});

describe('RecipePanelは例外をUI外へ漏らさない', () => {
  const source = readFileSync(new URL('../RecipePanel.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('encodeRecipeの呼出しがtryの内側にある', () => {
    const copy = source.slice(source.indexOf('async function copyRecipe'), source.indexOf('function inspectRecipe'));
    const tryStart = copy.indexOf('try {');
    const encodeAt = copy.indexOf('encodeRecipe(currentRecipe)');
    expect(tryStart).toBeGreaterThanOrEqual(0);
    expect(encodeAt).toBeGreaterThan(tryStart);
    // 生成の直後にcatchがあり、理由を表示して抜ける。
    expect(copy).toContain('catch (error)');
    expect(copy).toContain('この構成ではレシピを共有できません');
    expect(copy).toContain('error instanceof RecipeCodeError');
  });

  it('記録が無い機体では生成を試みない(ボタンは残す)', () => {
    expect(source).toContain('if (!canExport) return;');
    expect(source).toContain('disabled={!canExport}');
  });

  it('encodeRecipeの呼出しはこの1箇所だけ', () => {
    expect(source.match(/encodeRecipe\(/g)).toHaveLength(1);
  });
});
