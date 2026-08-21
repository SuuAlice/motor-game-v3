// P3-4 G7(項目L、UI計画§11.3): 計測器の棚。表示判断は`instrumentShopView.ts`の純関数へ委ね、
// 本コンポーネントは結果を並べるだけにする(Reactレンダリング環境なしでテスト固定するため)。
import { useState } from 'react';
import { useSaveStore } from '../store/saveStore';
import { resolveInstrumentShelfState, computeGaussMeterReading, toGaussMeterInput } from '../store/instrumentShop';
import { describeInstrumentShelf, formatGaussMeterReading, PROVISIONAL_PRICE_NOTE } from './instrumentShopView';

export function InstrumentShopPanel() {
  const discoveredModes = useSaveStore((s) => s.encyclopedia.discoveredModes);
  const ownership = useSaveStore((s) => s.instrumentOwnership);
  const cashG = useSaveStore((s) => s.inventory.cashG);
  const items = useSaveStore((s) => s.inventory.items);
  const magnetItemId = useSaveStore((s) => s.equipmentLoadout.magnetItemId);
  const purchaseInstrumentAction = useSaveStore((s) => s.purchaseInstrumentAction);
  const [errorJa, setErrorJa] = useState<string | null>(null);

  const shelf = resolveInstrumentShelfState({ instrumentId: 'gaussMeter', discoveredModes, ownership, cashG });
  const view = describeInstrumentShelf(shelf);
  const equippedMagnet = items.find((item) => item.itemId === magnetItemId);
  const reading = computeGaussMeterReading(toGaussMeterInput(equippedMagnet?.wearState));

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="instrument-shelf-heading">
      <h3 id="instrument-shelf-heading" className="text-sm font-black text-slate-900">計測器</h3>
      <p className="mt-1 font-bold text-slate-800">{view.heading}</p>
      {view.priceLine !== null && (
        <p className="text-sm text-slate-700">
          {view.priceLine}
          {/* 仮価格である旨は省略しない(§11.3、L8)。 */}
          <span className="ml-2 text-xs text-slate-500">{PROVISIONAL_PRICE_NOTE}</span>
        </p>
      )}
      <p className="mt-1 text-sm text-slate-600">{view.note}</p>
      <button
        type="button"
        disabled={!view.canPurchase}
        onClick={() => {
          const result = purchaseInstrumentAction('gaussMeter');
          setErrorJa(result.ok ? null : result.reason);
        }}
        // a11y項目9: タッチ操作の最小寸法44px相当を確保する。
        className="mt-2 min-h-[44px] min-w-[44px] rounded bg-amber-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        購入する
      </button>
      {/* a11y項目6(J7): statusノードは常設し、文言だけを差し替える。
          条件付きでノードごと出し入れすると、支援技術が変更を検知できないことがある。 */}
      <p role="status" className="mt-1 min-h-[1.25rem] text-sm text-rose-700">{errorJa ?? ''}</p>

      {shelf === 'owned' && (
        <p className="mt-3 text-sm text-slate-700">{formatGaussMeterReading(reading)}</p>
      )}
    </section>
  );
}
