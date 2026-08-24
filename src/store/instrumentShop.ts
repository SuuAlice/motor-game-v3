// P3-4 G7(項目L、UI計画§11.3、人間承認済み): 計測器(ガウスメーター)の経済接続。
// 価格・解禁条件・測定式はすべて§11.3で確定済みであり、ここでは実装のみを行う。
//
// **価格は仮値**(800 G)であり、UI側は必ず仮値であることを併記する(§11.3、L8)。
// G8の人間試遊を経て確定させるため、この値を根拠に他の経済数値を調整しない。
import type { DestructionModeId } from '../engine/destructionModes';
import type { InstrumentId, InstrumentOwnership } from './runOutcomeApplication';
import type { WearState } from '../materials/inventoryItem';

/** ガウスメーターの仮価格(§11.3、L8で確定。**仮値**であることを表示に必ず併記する)。 */
export const GAUSS_METER_PRICE_G = 800;

/** 解禁条件: D07(熱減磁)の初回発見後(§11.3)。減磁を測る道具なので、現象を見る前には並ばない。 */
export const GAUSS_METER_UNLOCK_MODE_ID: DestructionModeId = 'D07';

/**
 * 計測器の陳列状態(§11.3、L8「シルエット掲載」)。
 * 未解禁でも**存在は見せる**(シルエット)——「まだ何かある」ことは隠さず、
 * 何であるかは明かさない(spec §1.2「答えを教えない」)。
 */
export type InstrumentShelfState = 'silhouette' | 'purchasable' | 'insufficientFunds' | 'owned';

export function resolveInstrumentShelfState(input: {
  instrumentId: InstrumentId;
  discoveredModes: readonly DestructionModeId[];
  ownership: InstrumentOwnership;
  cashG: number;
}): InstrumentShelfState {
  if (input.ownership.ownedInstrumentIds.includes(input.instrumentId)) return 'owned';
  if (!input.discoveredModes.includes(GAUSS_METER_UNLOCK_MODE_ID)) return 'silhouette';
  return input.cashG >= GAUSS_METER_PRICE_G ? 'purchasable' : 'insufficientFunds';
}

export type GaussMeterReadingResult =
  | { ok: true; displayPercent: number }
  | { ok: false; reason: 'notEquipped' };

/**
 * ガウスメーターの表示値(§11.3、J7是正で確定)。**定格比(%)表示**(spec §10原文)。
 *
 * 式の簡略化: 「劣化後の実効磁力(`baseStrength × (1 - demagnetizationFraction)`)÷
 * `baseStrength`(素材カタログ値、劣化前基準)」という定格比の定義上、分子・分母の
 * `baseStrength`は代数的に約分される——よって`baseStrength`を引数に取らない。
 *
 * 整数%へ四捨五入する(§11.3確定)。**原因は表示しない**——「磁石が弱っています」等の
 * 断定はせず、測った値だけを出す(spec §1.2)。
 */
export function computeGaussMeterReading(
  wear: { readonly kind: 'magnet'; readonly demagnetizationFraction: number } | null,
): GaussMeterReadingResult {
  if (wear === null) return { ok: false, reason: 'notEquipped' };
  return { ok: true, displayPercent: Math.round((1 - wear.demagnetizationFraction) * 100) };
}

/** 装備中の磁石個体のWearStateを、計測器の入力形へ絞る。magnet以外は測定対象外。 */
export function toGaussMeterInput(wearState: WearState | undefined): { readonly kind: 'magnet'; readonly demagnetizationFraction: number } | null {
  if (wearState === undefined || wearState.kind !== 'magnet') return null;
  return wearState;
}
