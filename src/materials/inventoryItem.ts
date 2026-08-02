// 個体恒久状態スキーマ+決定論的サルベージ回収率(docs/phase2-plan.md §16 Step8、
// docs/phase2-step8-plan.md v5)。engine/・materialMapping.tsのいずれにも依存しない
// 在庫データ層(Suu_mot3レビューv3、層境界)。恒久状態はデータとして保持するのみで、
// engineへの反映(composeConfigFromMaterials等への接続)はPhase3で行う(Phase2の境界)。
//
// P3-0(docs/phase3-p3-0-plan.md v7、附録A.3)でrotor/body/bearingアセンブリ・
// gear WearStateの拡張を追加した。computeCompositeGearDamageFractionは
// src/materials/degradationApplication.tsに定義し、本ファイルからimportする
// (適用関数群と同じ場所に置く、2.2節ファイル配置表)。

import { BATTERY_MATERIALS, BODY_MATERIALS, BRUSH_MATERIALS, COATING_MATERIALS, GEAR_MATERIALS, MAGNET_MATERIALS, WIRE_MATERIALS } from './materials';
import type { Material } from './materials';
import { computeCompositeGearDamageFraction } from './degradationApplication';

// materialMapping.tsが同型のID型(MagnetMaterialId等)を独自にexportしているが、
// inventoryItem.tsは写像層へ依存させないため意図的に重複させる(層境界、v3レビュー)。
type MagnetMaterialId = (typeof MAGNET_MATERIALS)[number]['id'];
type GearMaterialId = (typeof GEAR_MATERIALS)[number]['id'];
type BatteryMaterialId = (typeof BATTERY_MATERIALS)[number]['id'];
type BrushMaterialId = (typeof BRUSH_MATERIALS)[number]['id'];
type WireMaterialId = (typeof WIRE_MATERIALS)[number]['id'];
type CoatingMaterialId = (typeof COATING_MATERIALS)[number]['id'];
type BodyMaterialId = (typeof BODY_MATERIALS)[number]['id'];

// 軽微条件1(正式Fable指摘): gear総歯数はこの単一の設計較正値定数からのみ参照する
// (v12 3.4節確定値=10、Phase3全ギヤ共通)。リテラル散在を禁じる。
export const GEAR_TOTAL_TOOTH_COUNT = 10;

/**
 * 恒久劣化状態(spec §5.2)。Phase2で個体劣化を追跡するのは磁石・ギヤ・ブラシの3ファミリーのみ。
 * 電池はspec §5.2の劣化例(実効Br・摩耗・歯欠け・被膜ダメージ)に含まれず、Phase2時点で
 * 追跡対象外(個体管理はするが劣化なし)。線材はPhase4の巻線記録方式で個体化されるローター
 * 組立物に帰属する概念であり、本Stepでは公開しない(docs/phase2-step8-plan.md v5 §5)。
 * `kind`で判別する(InventoryItem側の`family`とは独立したタグとし、両者の不一致を
 * computeSalvageRateが実行時に検証する設計、同§4)。各fractionは0(新品)〜1(限界)の
 * 設計上の抽象スカラーであり、実測物理量(実効T等)そのものではない。
 */
export type WearState =
  | { readonly kind: 'magnet'; readonly demagnetizationFraction: number }
  | { readonly kind: 'gear'; readonly totalToothCount: number; readonly toothLossCount: number; readonly seizureFraction: number }
  | { readonly kind: 'brush'; readonly wearFraction: number };

// EquipmentRole: 装備・恒久劣化を横断する役割の全体集合(v12 1.2節、P3-0附録A.3)。
export type EquipmentRole = 'rotor' | 'battery' | 'gear' | 'brush' | 'magnet' | 'bearing' | 'body';

/**
 * 損壊可能アセンブリ(v12 1.2節、P3-0附録A.3)。実在素材カタログ(WearState)とは別の、
 * ローター組立物・ボディ個体・軸受部の恒久損壊状態を表すスキーマ。Q7(正式Fable必須修正P2、
 * 遡及申告・承認済み): `sourceWireMaterialId`は既存StackableStockEntry(wire)がmaterialId+
 * quantityMのスタック在庫であり個体IDを持たないため、線材素材IDを保持する(個体IDではない)。
 */
export interface RotorAssemblyState {
  assemblyId: string;
  sourceWireMaterialId: WireMaterialId | null;
  consumedWireM: number;
  collapsed: boolean;
  burnedOut: boolean;
}

export interface BodyPartState {
  assemblyId: string;
  materialId: BodyMaterialId;
  scorchFraction: number;
}

export interface BearingAssemblyState {
  assemblyId: string;
  gearItemId: string;
  seizureFraction: number;
}

/**
 * 個体管理アイテム(spec §5.2「個体管理するパーツ=磁石・ギヤ・電池・ブラシ」)。
 * family別の判別共用体にすることで、不整合なmaterialId/wearStateの組合せを
 * TypeScriptの型検査で構造的に排除する(docs/phase2-step8-plan.md v5 §4)。
 * batteryはwearState: undefined固定(劣化非追跡)。itemIdは生成方法を問わない
 * 不透明な識別子として型のみ提供する(生成はPhase2責務外)。
 */
export type InventoryItem =
  | { readonly itemId: string; readonly family: 'magnet'; readonly materialId: MagnetMaterialId; readonly wearState: Extract<WearState, { kind: 'magnet' }> }
  | { readonly itemId: string; readonly family: 'gear'; readonly materialId: GearMaterialId; readonly wearState: Extract<WearState, { kind: 'gear' }> }
  | { readonly itemId: string; readonly family: 'brush'; readonly materialId: BrushMaterialId; readonly wearState: Extract<WearState, { kind: 'brush' }> }
  | { readonly itemId: string; readonly family: 'battery'; readonly materialId: BatteryMaterialId; readonly wearState: undefined };

/**
 * スタック可能な消耗材(spec §5.2「線材[m単位]・ワニス[ml単位]」)。family別の判別共用体にし、
 * 対象外の素材が紛れ込むこと・quantityの単位混同を型で排除する。
 *
 * 数量契約: quantityM/quantityMlは有限・0以上であることを呼び出し元が保証すること。
 * TypeScriptのnumber型だけではNaN・Infinity・負値を排除できない(この限界は型システムの
 * 一般的制約であり、本Stepではこれを消費する経済ロジックが存在しないため検証関数を今回は
 * 設けない。Phase5で経済結線する際に、消費側で有限・非負の実行時検証を追加すること)。
 */
export type StackableStockEntry =
  | { readonly family: 'wire'; readonly materialId: WireMaterialId; readonly quantityM: number }
  | { readonly family: 'coating'; readonly materialId: CoatingMaterialId; readonly quantityMl: number };

/**
 * brabitの店UI・インベントリ表示が読み取り専用で消費する公開集約型
 * (docs/phase2-plan.md §17)。全プロパティをreadonlyにし、brabit側での直接変更ではなく
 * 将来のstore層(Phase3以降所有確定)経由での更新を型で示す。cashGは経済仮値。
 * 個体ID生成・永続化は含まない。
 */
export interface PlayerInventory {
  readonly cashG: number;
  readonly items: readonly InventoryItem[];
  readonly stackableStock: readonly StackableStockEntry[];
  readonly rotorAssemblies: readonly RotorAssemblyState[];
  readonly bodyParts: readonly BodyPartState[];
  readonly bearingAssemblies: readonly BearingAssemblyState[];
}

// ---------------------------------------------------------------------------
// computeSalvageRate: サルベージ回収率(spec §5.3)の決定論的計算
// ---------------------------------------------------------------------------

export type SalvageRateResult = { ok: true; rate: number } | { ok: false; reason: string };

// 帯域定数(spec §5.3のレンジをそのまま採用、経済仮値。Phase2ゲートのmaterialSweep.ts・
// Phase5バランス調整の対象。materialMapping.tsの設計較正値とは性質が異なる)。
const LOW_BAND_MIN = 0.1; // 下位素材の下限(spec §5.3「下位素材 回収率10〜20%」)
const LOW_BAND_MAX = 0.2;
const HIGH_BAND_MIN = 0.4; // 貴金属・レア磁石の下限(spec §5.3「貴金属・レア磁石 40〜60%」)
const HIGH_BAND_MAX = 0.6;

/**
 * 「貴金属・レア系」高帯域の判定(Fable Q3確定、docs/phase2-step8-fable-review.md)。
 * 導線tierIndex>=2(銀メッキ銅線・純銀)・磁石tierIndex>=2(サマリウムコバルト・ネオジム)・
 * ブラシtierIndex==3(貴金属ブラシ)のみが高帯域。銀黒鉛ブラシ(tier2)は黒鉛混合でくず価値が
 * 下がるため低帯域のまま。ギヤは全tier(チタン含む)が低帯域のまま(チタンは高価な加工材だが
 * スクラップとしては貴金属ではなく、壊れにくさ・重量ペナルティが既にチタンの個性として
 * 実装済みであるため)。それ以外の全ファミリー(電池・substrate・roller・body・coating)は
 * 低帯域のみ。
 */
function isHighSalvageBand(material: Material): boolean {
  if (material.family === 'wire' || material.family === 'magnet') return material.tierIndex >= 2;
  if (material.family === 'brush') return material.tierIndex === 3;
  return false;
}

function resolveBand(material: Material): { bandMin: number; bandMax: number } {
  return isHighSalvageBand(material) ? { bandMin: HIGH_BAND_MIN, bandMax: HIGH_BAND_MAX } : { bandMin: LOW_BAND_MIN, bandMax: LOW_BAND_MAX };
}

function resolveFraction(wearState: WearState): number {
  switch (wearState.kind) {
    case 'magnet':
      return wearState.demagnetizationFraction;
    case 'gear':
      return computeCompositeGearDamageFraction(wearState);
    case 'brush':
      return wearState.wearFraction;
  }
}

/**
 * 個体のサルベージ回収率(spec §5.3)を決定論的に計算する純関数。乱数を使わない。
 * rateは判定された帯域(低帯域[0.10,0.20]・高帯域[0.40,0.60])内のスカラー(在庫額に
 * 乗じる係数。実際の払い出し額計算は本関数の責務外、drawSalvageAmountは今回実装しない
 * (docs/phase2-step8-plan.md v5 §10))。
 *
 * 補間式(新品=帯域上限、限界=帯域下限。線形補間):
 *   rate = bandMax - fraction × (bandMax - bandMin)
 * fraction=0またはwearState=undefined(劣化未追跡)はbandMaxを返す。fraction∈[0,1]である限り、
 * 算術的にrateは[bandMin, bandMax]の外に出ない(clamp不要)。bandMin自体が0を大きく上回るため、
 * spec §5.4「残骸0禁止」を別枠floorなしに満たす。
 *
 * 実行時検証(上から順にチェックし最初の失敗でok:falseを返す。不正時はclamp・fallbackしない):
 * 1. wearStateが指定されている場合、material.familyとwearState.kindが一致しない場合は失敗
 * 2. wearStateのfractionフィールドがNumber.isFinite(...)かつ0以上1以下でない場合は失敗
 */
export function computeSalvageRate(material: Material, wearState: WearState | undefined): SalvageRateResult {
  const { bandMin, bandMax } = resolveBand(material);

  if (wearState === undefined) {
    return { ok: true, rate: bandMax };
  }

  if (wearState.kind !== material.family) {
    return { ok: false, reason: `${material.id}: wearState.kind(${wearState.kind})がmaterial.family(${material.family})と一致しません` };
  }

  const fraction = resolveFraction(wearState);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    return { ok: false, reason: `${material.id}: 劣化度が有限かつ[0,1]の範囲ではありません: ${fraction}` };
  }

  return { ok: true, rate: bandMax - fraction * (bandMax - bandMin) };
}
