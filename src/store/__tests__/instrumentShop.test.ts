// P3-4 G7(項目L、UI計画§11.3): 計測器(ガウスメーター)の経済接続と測定式。
// 価格・解禁条件・測定式は§11.3で確定済み。**価格は仮値**であり、この値を根拠に
// 他の経済数値を調整しない(G8の人間試遊で確定)。
import { describe, expect, it } from 'vitest';
import {
  GAUSS_METER_PRICE_G, GAUSS_METER_UNLOCK_MODE_ID,
  resolveInstrumentShelfState, computeGaussMeterReading, toGaussMeterInput,
} from '../instrumentShop';

describe('陳列状態(§11.3、L8)', () => {
  const base = { instrumentId: 'gaussMeter' as const, ownership: { ownedInstrumentIds: [] }, cashG: 10_000 };

  it('D07未発見ならシルエット——存在は見せるが何であるかは明かさない', () => {
    expect(resolveInstrumentShelfState({ ...base, discoveredModes: [] })).toBe('silhouette');
    expect(resolveInstrumentShelfState({ ...base, discoveredModes: ['D01', 'D03'] })).toBe('silhouette');
  });

  it('D07発見後かつ所持金が足りれば購入可', () => {
    expect(resolveInstrumentShelfState({ ...base, discoveredModes: ['D07'] })).toBe('purchasable');
  });

  it('D07発見後でも所持金不足なら購入不可(シルエットには戻らない)', () => {
    const state = resolveInstrumentShelfState({ ...base, discoveredModes: ['D07'], cashG: GAUSS_METER_PRICE_G - 1 });
    expect(state).toBe('insufficientFunds');
  });

  it('価格ちょうどなら購入可(境界)', () => {
    expect(resolveInstrumentShelfState({ ...base, discoveredModes: ['D07'], cashG: GAUSS_METER_PRICE_G })).toBe('purchasable');
  });

  it('所持済みは所持金・解禁状態に関わらずowned(買い切り・非消耗)', () => {
    const owned = { ownedInstrumentIds: ['gaussMeter' as const] };
    expect(resolveInstrumentShelfState({ ...base, ownership: owned, discoveredModes: [], cashG: 0 })).toBe('owned');
  });

  it('解禁条件はD07(熱減磁)である——減磁を測る道具なので現象を見る前には並ばない', () => {
    expect(GAUSS_METER_UNLOCK_MODE_ID).toBe('D07');
  });
});

describe('測定式(§11.3、J7是正で確定)', () => {
  it('未装備は測定不能(0 %や100 %と答えない)', () => {
    const result = computeGaussMeterReading(null);
    expect(result).toEqual({ ok: false, reason: 'notEquipped' });
  });

  it('劣化なしは100 %、半減は50 %(定格比)', () => {
    expect(computeGaussMeterReading({ kind: 'magnet', demagnetizationFraction: 0 }))
      .toEqual({ ok: true, displayPercent: 100 });
    expect(computeGaussMeterReading({ kind: 'magnet', demagnetizationFraction: 0.5 }))
      .toEqual({ ok: true, displayPercent: 50 });
  });

  it('整数%へ四捨五入する', () => {
    expect(computeGaussMeterReading({ kind: 'magnet', demagnetizationFraction: 0.234 }))
      .toEqual({ ok: true, displayPercent: 77 }); // 76.6 → 77
    expect(computeGaussMeterReading({ kind: 'magnet', demagnetizationFraction: 0.235 }))
      .toEqual({ ok: true, displayPercent: 77 }); // 76.5 → 77(半数切り上げ)
  });

  it('magnet以外のWearStateは測定対象外(nullへ落ちる)', () => {
    expect(toGaussMeterInput({ kind: 'brush', wearFraction: 0.1 } as never)).toBeNull();
    expect(toGaussMeterInput(undefined)).toBeNull();
    expect(toGaussMeterInput({ kind: 'magnet', demagnetizationFraction: 0.2 } as never))
      .toEqual({ kind: 'magnet', demagnetizationFraction: 0.2 });
  });
});
