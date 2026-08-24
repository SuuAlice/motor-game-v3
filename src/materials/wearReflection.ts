// P3-4 G6: `WearState`(アイテム個体の永続劣化)を次runの`materialComposedBase`へ反映する
// 純関数群(docs/phase3-p3-4-plan.md §14.1)と、D06 toothLossCountのseeding(同§14.3、M-1(i))。
//
// **層の分離(§12二層命名)**: 素材写像(`composeConfigFromMaterials`)が返す`materialComposedBase`
// が入力で、個体の永続劣化を掛けた「実効config」が出力である。engineは劣化を知らない——
// 走行中に渡るのは常に劣化込みの実効値のみ(spec §4「摩耗・減磁などの恒久状態はアイテム個体に
// 持たせ、エンジンには毎回、劣化込みの実効値を渡す」)。
//
// **呼び出し契機**: §14.2の8段順のステップ4(Wear反映)とステップ7(D06 seeding)。いずれも
// beginRun時に1回のみで、走行中の再評価・再seedingは行わない。

import type { MotorConfig } from '../engine/motorPhysics';
import type { CarConfig } from '../engine/vehiclePhysics';
import type { DestructionState } from '../engine/destructionModes';

/**
 * 個体劣化の入力(§14.1)。**`bodyScorchFraction`・`rotorBurnedOut`・`gearToothLossCount`は
 * 意図的に含まない**:
 * - `bodyScorchFraction`: D04延焼の外観記録専用で、現行物理に反映先が存在しない(D08はPhase5)。
 * - `rotorBurnedOut`: §15.3(R17確定)により`collapsed`と同様に装備検証で拒否されるため、
 *   本関数が呼ばれる時点で「burnedOutな個体は装備されていない」ことが構造的に保証される。
 * - `gearToothLossCount`: 歯欠け由来の効率低下は`composeD06RuntimeEffect`(§9.3)が
 *   seeded `toothLossCount`(§14.3)から一元計算する。ここに含めると**二重計上**になる
 *   (判定文M-1(ii)、M-1(f))。同じ事実を2経路から入力できる状態を作らない(P3-1-Q9)。
 */
export interface IndividualDegradationInput {
  magnetDemagnetizationFraction: number;
  gearSeizureFraction: number;
  brushWearFraction: number;
  bearingSeizureFraction: number;
}

/**
 * §17数値候補(判定文の人間再承認一覧I)。確定はG5較正sweep+人間commit承認(Q15-1恒久規則)。
 * いずれも無次元。
 */
export const BRUSH_WEAR_RESISTANCE_PENALTY = 0.5; // 既存brushContactResistanceRatioレンジに対する規模感
export const GEAR_SEIZURE_EFFICIENCY_PENALTY = 0.3; // 軸受焼付き劣化の重篤度(乗算比率)
export const BEARING_SEIZURE_FRICTION_PENALTY = 0.2; // 次run恒久効果としての軸受摩擦増(補完合成比率)

export type ApplyWearToMotorConfigResult = { ok: true; motorConfig: MotorConfig } | { ok: false; reason: string };

/**
 * 磁石の減磁とブラシ摩耗を`MotorConfig`へ反映する(§14.1)。
 *
 * - `magnetStrength`: 減磁分だけ低下する(`×(1-減磁率)`)。
 * - `brushContactResistanceRatio`: 摩耗分だけ接触抵抗が増える(`×(1+摩耗率×penalty)`)。
 *   同フィールドは`MotorConfig`上optional(既定1.0、motorPhysics.ts:181)であるため、
 *   未設定のbaseに対しては既定値1.0を出発点とする。
 *
 * 値域外(非有限・負)は`ok:false`で返す——ここで黙って丸めると、劣化の会計が壊れたまま
 * 走行へ進んでしまう。
 */
export function applyWearToMotorConfig(base: MotorConfig, wear: IndividualDegradationInput): ApplyWearToMotorConfigResult {
  const magnetStrength = base.magnetStrength * (1 - wear.magnetDemagnetizationFraction);
  const baseBrushRatio = base.brushContactResistanceRatio ?? 1;
  const brushContactResistanceRatio = baseBrushRatio * (1 + wear.brushWearFraction * BRUSH_WEAR_RESISTANCE_PENALTY);
  if (!Number.isFinite(magnetStrength) || magnetStrength < 0 || !Number.isFinite(brushContactResistanceRatio) || brushContactResistanceRatio < 0) {
    return { ok: false, reason: 'WearState反映後のMotorConfigが範囲外です' };
  }
  return { ok: true, motorConfig: { ...base, magnetStrength, brushContactResistanceRatio } };
}

export type ApplyWearToCarConfigResult = { ok: true; carConfig: CarConfig } | { ok: false; reason: string };

/**
 * ギヤ焼付き・軸受焼付きを`CarConfig`へ反映する(§14.1、M-1(ii)是正後)。
 *
 * **歯欠け由来の効率因子`(1-toothLossRatio)`はここでは計算しない**——それは
 * `composeD06RuntimeEffect`(§9.3)がseeded `toothLossCount`(§14.3)から一元計算する。
 * ここでも掛けると二重計上になる(M-1(f)、seedingと必ず対で実施すること)。
 * `gearSeizureFraction`/`bearingSeizureFraction`由来の因子はD06と無関係のため、ここで扱う。
 *
 * `axleFriction`は独立した摩擦源の合成に既存パターン`1-(1-a)(1-b)`を用いる
 * (a,b∈[0,1]なら結果も[0,1]に収まることが数学的に保証される、§7.8と同型)。
 */
export function applyWearToCarConfig(base: CarConfig, wear: IndividualDegradationInput): ApplyWearToCarConfigResult {
  const gearEfficiency = base.gearEfficiency * (1 - wear.gearSeizureFraction * GEAR_SEIZURE_EFFICIENCY_PENALTY);
  const axleFriction = 1 - (1 - base.axleFriction) * (1 - wear.bearingSeizureFraction * BEARING_SEIZURE_FRICTION_PENALTY);
  if (!Number.isFinite(gearEfficiency) || gearEfficiency <= 0 || gearEfficiency > 1 || !Number.isFinite(axleFriction) || axleFriction < 0 || axleFriction > 1) {
    return { ok: false, reason: 'WearState反映後のCarConfigが範囲外です' };
  }
  return { ok: true, carConfig: { ...base, gearEfficiency, axleFriction } };
}

/**
 * D06 `toothLossCount`のseeding(§14.3、M-1(i)確定裁定)。
 *
 * 部分損傷ギヤ(例: 9歯欠け)を再装備した次走行で、走行内`D06Progress.toothLossCount`を
 * 0からではなく装備個体の永続損傷数から開始させる。これがないと、走行のたびに歯数が
 * 回復したかのように振る舞う会計破綻(判定文M-1の帰結1〜4)が生じる。
 *
 * **単一出典**: `equippedGearToothLossCount`は装備中ギヤ個体の永続`WearState`(gear variant)の
 * `toothLossCount`から`RunSnapshot` capture時に1回だけ読む——`IndividualDegradationInput`経由の
 * 間接値は使わない(同じ事実を2経路から入力できる状態を作らない)。
 *
 * **全損個体**: `equippedGearToothLossCount >= GEAR_TOTAL_TOOTH_COUNT`の個体は§15の装備拒否
 * (M-1(v))により本関数へ到達する前に排除される——実際に呼ばれる時点では常に
 * `0`以上`GEAR_TOTAL_TOOTH_COUNT`未満の整数である。この不変条件は装備拒否・本seeding・
 * `restoreRunSnapshot`検証(M-1(iv))の3箇所が互いに支え合う一体の設計である。
 *
 * `base`(= `createInitialDestructionState()`の戻り値)は改変せず、新しいstateを返す。
 */
export function seedInitialDestructionStateFromWear(
  base: DestructionState,
  equippedGearToothLossCount: number,
): DestructionState {
  return {
    ...base,
    modes: {
      ...base.modes,
      D06: { ...base.modes.D06, toothLossCount: equippedGearToothLossCount },
    },
  };
}
