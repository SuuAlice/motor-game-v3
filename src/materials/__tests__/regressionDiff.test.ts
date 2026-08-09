// P3-2ゲート8(docs/phase3-p3-2-plan.md v17 §4.5、正式Fable Q7裁定)。regressionDiff.tsの
// 純関数単体テスト。production配線(実行タイミング・永続化・UI表示)はP3-4のスコープのため
// ここでは扱わない。
import { describe, expect, it } from 'vitest';
import {
  detectPerformanceRegression,
  directionForMetricKind,
  type RegressionObservation,
} from '../regressionDiff';

function obs(recipeKey: string, metricKind: RegressionObservation['metricKind'], value: number): RegressionObservation {
  return { recipeKey, metricKind, value };
}

describe('directionForMetricKind', () => {
  it('lapTimeSはhigherIsWorse(タイムは短いほうがよい)', () => {
    expect(directionForMetricKind('lapTimeS')).toBe('higherIsWorse');
  });

  it('topSpeedMps・steadyRpmはlowerIsWorse(速度・回転数は高いほうがよい)', () => {
    expect(directionForMetricKind('topSpeedMps')).toBe('lowerIsWorse');
    expect(directionForMetricKind('steadyRpm')).toBe('lowerIsWorse');
  });
});

describe('detectPerformanceRegression: P3-2純関数のテスト契約(4.5節)', () => {
  it('pastObservationsが空ならnullを返す', () => {
    const result = detectPerformanceRegression(obs('r1', 'lapTimeS', 10), []);
    expect(result).toBeNull();
  });

  it('異なるrecipeKeyの観測は比較対象(baselineプール)から除外される(同一recipeKeyの観測が1件もなければnull)', () => {
    const past = [obs('other-recipe', 'lapTimeS', 5), obs('other-recipe', 'lapTimeS', 5.1)];
    const result = detectPerformanceRegression(obs('r1', 'lapTimeS', 10), past);
    expect(result).toBeNull();
  });

  it('異なるrecipeKeyの観測は同一recipeKeyの観測と混在していても、baseline計算(中央値)から除外される', () => {
    // r1の履歴は[100]のみ。other-recipeの[1,1,1]が混入して中央値が引きずられていないことを
    // baselineValue===100(otherを無視した値)で直接確認する。
    const past = [obs('other-recipe', 'topSpeedMps', 1), obs('r1', 'topSpeedMps', 100), obs('other-recipe', 'topSpeedMps', 1)];
    const result = detectPerformanceRegression(obs('r1', 'topSpeedMps', 100), past);
    expect(result).not.toBeNull();
    expect(result?.baselineValue).toBe(100);
  });

  it('metricKindが異なる観測(同一recipeKey)はbaselineプールから除外される(単位が異なる指標を混在させない設計、計画本文明記外の実装判断)', () => {
    const past = [obs('r1', 'steadyRpm', 99999), obs('r1', 'lapTimeS', 10)];
    const result = detectPerformanceRegression(obs('r1', 'lapTimeS', 10.3), past);
    expect(result).not.toBeNull();
    expect(result?.baselineValue).toBe(10); // steadyRpmの99999が混入していない
  });

  it('currentValueが非有限値(NaN/Infinity/-Infinity)の場合、NaN/Infinityを生成せず安全にnullを返す', () => {
    const past = [obs('r1', 'lapTimeS', 10)];
    expect(detectPerformanceRegression(obs('r1', 'lapTimeS', NaN), past)).toBeNull();
    expect(detectPerformanceRegression(obs('r1', 'lapTimeS', Infinity), past)).toBeNull();
    expect(detectPerformanceRegression(obs('r1', 'lapTimeS', -Infinity), past)).toBeNull();
  });

  // Suu_mot3ゲート8レビューR1是正: 「非有限入力はnullを返す」契約は無言修復(不正値だけを
  // 黙って除外して計算を続けること)を許さない。比較候補(同一recipeKey・同一metricKind)に
  // 非有限値が1件でもあれば関数全体でnullを返すこと、比較候補外の非有限値は無視されることを
  // 正負2ケースへ分けて固定する。
  it('同一recipeKey・同一metricKindの過去観測に非有限値(NaN/Infinity)が1件でも含まれる場合、関数全体でnullを返す(無言修復の禁止)', () => {
    const past = [obs('r1', 'lapTimeS', NaN), obs('r1', 'lapTimeS', 10), obs('r1', 'lapTimeS', Infinity)];
    const result = detectPerformanceRegression(obs('r1', 'lapTimeS', 10.3), past);
    expect(result).toBeNull();
  });

  it('異なるrecipeKeyまたはmetricKindの観測にだけ非有限値がある場合は比較候補に含まれないため無視され、有効候補で正常に計算される', () => {
    const past = [
      obs('other-recipe', 'lapTimeS', NaN), // 異なるrecipeKey→比較候補外
      obs('r1', 'steadyRpm', Infinity), // 異なるmetricKind→比較候補外
      obs('r1', 'lapTimeS', 10), // 比較候補(有限値)
    ];
    const result = detectPerformanceRegression(obs('r1', 'lapTimeS', 10.3), past);
    expect(result).not.toBeNull();
    expect(result?.baselineValue).toBe(10);
    expect(Number.isFinite(result!.percentChange)).toBe(true);
  });

  it('baseline(中央値)が0の場合、除算でNaN/Infinityを生まず安全にnullを返す', () => {
    const past = [obs('r1', 'lapTimeS', 0)];
    const result = detectPerformanceRegression(obs('r1', 'lapTimeS', 5), past);
    expect(result).toBeNull();
  });

  // Suu_mot3ゲート8レビューR2是正: currentValue===0・baseline>0(baseline===0とは別の境界)でも
  // 除算がNaN/Infinityを生まず有限値になり、方向に応じた判定になることを固定する。
  it('currentValue===0・baseline>0(lowerIsWorse、topSpeedMps): percentChange=1(100%悪化)でhasAnomaly:true、NaN/Infinityを生まない', () => {
    const result = detectPerformanceRegression(obs('r1', 'topSpeedMps', 0), [obs('r1', 'topSpeedMps', 100)]);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.percentChange)).toBe(true);
    expect(result?.percentChange).toBe(1);
    expect(result?.hasAnomaly).toBe(true);
  });

  it('currentValue===0・baseline>0(higherIsWorse、lapTimeS): percentChange=-1(改善方向)でhasAnomaly:false、NaN/Infinityを生まない', () => {
    const result = detectPerformanceRegression(obs('r1', 'lapTimeS', 0), [obs('r1', 'lapTimeS', 100)]);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.percentChange)).toBe(true);
    expect(result?.percentChange).toBe(-1);
    expect(result?.hasAnomaly).toBe(false);
  });

  it('過去観測1件のみの場合、実質直前値比較になる(中央値=その1件の値)', () => {
    const past = [obs('r1', 'steadyRpm', 8000)];
    const result = detectPerformanceRegression(obs('r1', 'steadyRpm', 7600), past);
    expect(result).not.toBeNull();
    expect(result?.baselineValue).toBe(8000);
    expect(result?.currentValue).toBe(7600);
  });

  it('baselineウィンドウ幅は直近5件(記録順=古い→新しい配列の末尾5件)に限定される。末尾5件だけで中央値が変わる構成で確認する', () => {
    // 先頭2件(1, 2)を含めると中央値が変わるが、直近5件([3,4,5,100,100])だけなら中央値=5のまま。
    const past = [1, 2, 3, 4, 5, 100, 100].map((v) => obs('r1', 'topSpeedMps', v));
    const result = detectPerformanceRegression(obs('r1', 'topSpeedMps', 5), past);
    expect(result).not.toBeNull();
    expect(result?.baselineValue).toBe(5); // sorted[3,4,5,100,100]の中央値
  });

  it('偶数個のbaselineプール(4件)では中央の2値の平均を中央値とする', () => {
    const past = [10, 20, 30, 40].map((v) => obs('r1', 'topSpeedMps', v));
    const result = detectPerformanceRegression(obs('r1', 'topSpeedMps', 25), past);
    expect(result).not.toBeNull();
    expect(result?.baselineValue).toBe(25); // (20+30)/2
  });

  describe('ちょうど3%境界(2.999...%/3.0%/3.000...1%)での判定一貫性', () => {
    it('lowerIsWorse(topSpeedMps): ちょうど3.0%悪化(baseline100→current97)でhasAnomaly:true', () => {
      const result = detectPerformanceRegression(obs('r1', 'topSpeedMps', 97), [obs('r1', 'topSpeedMps', 100)]);
      expect(result?.percentChange).toBeCloseTo(0.03, 12);
      expect(result?.hasAnomaly).toBe(true);
    });

    it('lowerIsWorse(topSpeedMps): 3%未満の悪化(baseline100→current97.01、2.99%)でhasAnomaly:false', () => {
      const result = detectPerformanceRegression(obs('r1', 'topSpeedMps', 97.01), [obs('r1', 'topSpeedMps', 100)]);
      expect(result?.percentChange).toBeLessThan(0.03);
      expect(result?.hasAnomaly).toBe(false);
    });

    it('lowerIsWorse(topSpeedMps): 3%超の悪化(baseline100→current96.99、3.01%)でhasAnomaly:true', () => {
      const result = detectPerformanceRegression(obs('r1', 'topSpeedMps', 96.99), [obs('r1', 'topSpeedMps', 100)]);
      expect(result?.percentChange).toBeGreaterThan(0.03);
      expect(result?.hasAnomaly).toBe(true);
    });

    it('higherIsWorse(lapTimeS): ちょうど3.0%悪化(baseline100→current103)でhasAnomaly:true', () => {
      const result = detectPerformanceRegression(obs('r1', 'lapTimeS', 103), [obs('r1', 'lapTimeS', 100)]);
      expect(result?.percentChange).toBeCloseTo(0.03, 12);
      expect(result?.hasAnomaly).toBe(true);
    });

    it('higherIsWorse(lapTimeS): 3%未満の悪化(baseline100→current102.99、2.99%)でhasAnomaly:false', () => {
      const result = detectPerformanceRegression(obs('r1', 'lapTimeS', 102.99), [obs('r1', 'lapTimeS', 100)]);
      expect(result?.percentChange).toBeLessThan(0.03);
      expect(result?.hasAnomaly).toBe(false);
    });

    it('higherIsWorse(lapTimeS): 3%超の悪化(baseline100→current103.01、3.01%)でhasAnomaly:true', () => {
      const result = detectPerformanceRegression(obs('r1', 'lapTimeS', 103.01), [obs('r1', 'lapTimeS', 100)]);
      expect(result?.percentChange).toBeGreaterThan(0.03);
      expect(result?.hasAnomaly).toBe(true);
    });
  });

  it('改善方向(悪化ではない)の場合、percentChangeは負でhasAnomaly:false(lowerIsWorseでcurrentがbaselineより高い=速くなった)', () => {
    const result = detectPerformanceRegression(obs('r1', 'topSpeedMps', 110), [obs('r1', 'topSpeedMps', 100)]);
    expect(result?.percentChange).toBeLessThan(0);
    expect(result?.hasAnomaly).toBe(false);
  });

  it('改善方向(悪化ではない)の場合、percentChangeは負でhasAnomaly:false(higherIsWorseでcurrentがbaselineより低い=速くなった)', () => {
    const result = detectPerformanceRegression(obs('r1', 'lapTimeS', 90), [obs('r1', 'lapTimeS', 100)]);
    expect(result?.percentChange).toBeLessThan(0);
    expect(result?.hasAnomaly).toBe(false);
  });

  it('currentValue・baselineValueは戻り値へそのまま反映される', () => {
    const result = detectPerformanceRegression(obs('r1', 'steadyRpm', 7000), [obs('r1', 'steadyRpm', 8000), obs('r1', 'steadyRpm', 8000)]);
    expect(result).toEqual({ hasAnomaly: true, currentValue: 7000, baselineValue: 8000, percentChange: 0.125 });
  });
});
