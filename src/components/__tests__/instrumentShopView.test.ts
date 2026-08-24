// P3-4 G7(項目L、UI計画§11.3): 計測器店の表示判断と、画面への実配線。
// Reactレンダリング環境(jsdom)が無いため、描画側は構造テスト(ソース検査)で固定する。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeInstrumentShelf, formatGaussMeterReading, PROVISIONAL_PRICE_NOTE } from '../instrumentShopView';
import { GAUSS_METER_PRICE_G } from '../../store/instrumentShop';

describe('陳列表示(§11.3、L8)', () => {
  it('シルエットでは名称も価格も伏せる——存在だけを見せる', () => {
    const view = describeInstrumentShelf('silhouette');
    expect(view.heading).not.toContain('ガウス');
    expect(view.priceLine).toBeNull();
    expect(view.canPurchase).toBe(false);
  });

  it('シルエットでは解禁条件(D07・熱減磁)を明かさない——答えを教えない(spec §1.2)', () => {
    const view = describeInstrumentShelf('silhouette');
    const text = `${view.heading}${view.note}`;
    expect(text).not.toMatch(/D07|減磁|磁力|磁石/);
  });

  it('購入可のときだけcanPurchaseがtrueになる', () => {
    expect(describeInstrumentShelf('purchasable').canPurchase).toBe(true);
    expect(describeInstrumentShelf('insufficientFunds').canPurchase).toBe(false);
    expect(describeInstrumentShelf('owned').canPurchase).toBe(false);
  });

  it('所持金不足と所持済みは別の文言で区別できる', () => {
    expect(describeInstrumentShelf('insufficientFunds').note)
      .not.toBe(describeInstrumentShelf('owned').note);
  });

  it('価格表示は仮価格定数と一致する(表示だけ別値を書かない)', () => {
    expect(describeInstrumentShelf('purchasable').priceLine).toBe(`${GAUSS_METER_PRICE_G} G`);
  });
});

describe('測定結果の文言(§11.3)', () => {
  it('未装備は「測定できません」であり、0 %や100 %と書かない', () => {
    const text = formatGaussMeterReading({ ok: false, reason: 'notEquipped' });
    expect(text).toContain('測定できません');
    expect(text).not.toMatch(/\d+\s*%/);
  });

  it('測定値は定格比(%)を出すだけで、原因を断定しない(spec §1.2)', () => {
    const text = formatGaussMeterReading({ ok: true, displayPercent: 62 });
    expect(text).toContain('62 %');
    expect(text).not.toMatch(/弱って|交換|べき|原因|劣化してい/);
  });
});

describe('画面への実配線(テスト専用の未使用コードにしない)', () => {
  const panel = readFileSync(new URL('../InstrumentShopPanel.tsx', import.meta.url), 'utf8');
  const shop = readFileSync(new URL('../ShopScreen.tsx', import.meta.url), 'utf8');

  it('計測器棚は店(ShopScreen)に実際にマウントされている', () => {
    expect(shop).toContain('<InstrumentShopPanel />');
    expect(shop).toContain("from './InstrumentShopPanel'");
  });

  it('棚は純関数の判定結果を使い、条件を画面側で再実装しない', () => {
    expect(panel).toContain('resolveInstrumentShelfState');
    expect(panel).toContain('describeInstrumentShelf');
    // 画面側にcashG比較や解禁判定が独自に書かれていないこと(乖離の温床)。
    expect(panel).not.toMatch(/cashG\s*[<>]=?/);
    expect(panel).not.toContain("'D07'");
  });

  it('仮価格の注記が画面に出る(§11.3、L8で必須)', () => {
    expect(panel).toContain('PROVISIONAL_PRICE_NOTE');
    expect(PROVISIONAL_PRICE_NOTE).toMatch(/仮/);
  });

  it('購入不可の状態ではボタンが操作できない', () => {
    expect(panel).toContain('disabled={!view.canPurchase}');
  });
});

describe('回帰差分の実配線(§11.2、G6追加裁定の3腕×metric契約)', () => {
  const notebook = readFileSync(new URL('../ExperimentNotebook.tsx', import.meta.url), 'utf8');
  // コメント文中の記述を実装と数えないよう、比較前にコメントを落とす。
  const code = notebook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('3腕すべてでcomputeRegressionReportを実際に呼ぶ(session腕だけで済ませない)', () => {
    expect(code).toContain("computeRegressionReport({ kind: 'session', record: detail }");
    expect(code).toContain("computeRegressionReport({ kind: 'courseRun', record }");
    expect(code).toContain("computeRegressionReport({ kind: 'vehicleTestRun', record }");
  });

  it('比較対象には同じ腕の保存済み全件を渡す——当該runの除外は呼出し側で自作しない', () => {
    expect(code).toContain(', sessionRecords)');
    expect(code).toContain(', courseRunRecords)');
    expect(code).toContain(', vehicleTestRunRecords)');
    // record.idやfilterによる除外を画面側で再実装していないこと(G6申し送りの二重実装防止)。
    expect(code).not.toMatch(/filter\([^)]*record\.id\s*!==/);
  });

  it('車体テスト走行の記録は保持元(saveStore)から読み、表示されている', () => {
    expect(code).toContain('s.notebook.vehicleTestRuns');
    expect(code).toContain('vehicleTestRuns.map(');
  });

  it('腕ごとのmetric条件は画面側で再実装しない(regressionObservationが持つ)', () => {
    // status==='finished'やrecord.samplesによる成立判定が画面へ漏れ出していないこと。
    // (session.samplesを見るグラフ描画のガードは回帰判定とは無関係なので対象外。)
    expect(code).not.toMatch(/status\s*===\s*'finished'/);
    expect(code).not.toMatch(/record\.samples/);
  });

  it('結果はformatRegressionReportで文言化する——画面側でnullを言い換えない', () => {
    expect(code).toContain('formatRegressionReport(report)');
    // 「比較できなかった」を「悪化なし」へ潰す三項演算子が画面側に無いこと。
    expect(code).not.toMatch(/report\s*(===|!==)\s*null\s*\?[^\n]*低下/);
  });
});
