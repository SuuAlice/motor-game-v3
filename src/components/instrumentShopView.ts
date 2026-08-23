// P3-4 G7(項目L、UI計画§11.3): 計測器店の表示判断。Reactレンダリング環境が無いため、
// 表示文言・操作可否の判断はすべてmodule-level純関数へ出してテストで固定する。
//
// **仮価格の明示**(§11.3、L8): 価格は仮値であり、表示には必ずその旨を併記する。
// プレイヤーが「この価格を前提に貯金計画を立てる」ことを防ぐため、注記を省略しない。
import { GAUSS_METER_PRICE_G, type InstrumentShelfState } from '../store/instrumentShop';

/** 仮価格である旨の注記。表示から省略してはならない(§11.3、L8)。 */
export const PROVISIONAL_PRICE_NOTE = '※価格は仮の値です。調整により変わることがあります。';

export interface InstrumentShelfView {
  /** シルエット時はモード名も用途も出さない(spec §1.2「答えを教えない」)。 */
  readonly heading: string;
  /** 価格行。シルエット時は価格も伏せる。 */
  readonly priceLine: string | null;
  /** 状態説明。購入できない理由はここに書く。 */
  readonly note: string;
  readonly canPurchase: boolean;
}

export function describeInstrumentShelf(shelf: InstrumentShelfState): InstrumentShelfView {
  const priceLine = `${GAUSS_METER_PRICE_G} G`;
  switch (shelf) {
    case 'silhouette':
      // 何であるかも、いくらかも、何をすれば並ぶかも明かさない。存在だけを見せる。
      return { heading: '？？？', priceLine: null, note: 'まだ取り扱いがありません。', canPurchase: false };
    case 'purchasable':
      return { heading: 'ガウスメーター', priceLine, note: '磁石の磁力を定格比(%)で測ります。', canPurchase: true };
    case 'insufficientFunds':
      return { heading: 'ガウスメーター', priceLine, note: '所持金が足りません。', canPurchase: false };
    case 'owned':
      return { heading: 'ガウスメーター', priceLine: null, note: '所持しています(買い切り)。', canPurchase: false };
  }
}

/**
 * 計測器の測定結果の表示文言。
 * 未装備を「0 %」や「100 %」と書かない——測っていないことと測った結果は別物である。
 */
export function formatGaussMeterReading(
  result: { ok: true; displayPercent: number } | { ok: false; reason: 'notEquipped' },
): string {
  if (!result.ok) return '磁石が装備されていないため、測定できません。';
  return `磁力: 定格比 ${result.displayPercent} %`;
}
