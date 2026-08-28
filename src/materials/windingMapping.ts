// Phase 4 P4-1A(2026-08-28人間承認): 巻線記録 → production `MotorConfig`フィールドの写像。
//
// spec §2(a)の写像層に属する純関数であり、engine本体は巻線記録を知らない。P4-0の
// `src/p40/scenario.ts`は**比較試作の凍結証跡**なので、production側はここを単一出典にする
// (p40をimportしない)。
//
// **P4-0との違い**: P4-0はセッション限定で`effectiveTurnsRatio`へ直接入れていたが、
// productionでは`windingTurnsRatio`(base契約`(0,1]`)へ入れる。走行中の実効値は
// `composeEffectiveMotorConfig`の単一乗算点がD01因子と掛け合わせて作る。

import { aggregateWindingRecord, type WindingRecord } from './windingRecord';

/**
 * `balanceErrorRatio` → `axisOffsetMm`の係数 [mm](承認項目8、K_axis=3.0)。
 *
 * P4-0 G3のread-only有限sweepが、到達可能な離散`balanceErrorRatio`(30ターンで
 * 0 / 0.0667 / … / 0.6)と既存`axisOffsetMm`の体感可能域(0〜3 mm)から逆算し、
 * 2026-08-28の人間承認で確定した値である(`1 mm ÷ ratio 0.3333`として導出)。
 */
export const PRODUCTION_AXIS_OFFSET_COEFFICIENT_MM = 3;

/** 巻線記録から決まる`MotorConfig`フィールド。**これ以外を巻線記録から導出しない**。 */
export interface WindingDerivedMotorFields {
  /** 実在巻数=記録長。逆巻きでも導線は実在するのでR_coil・Jは減らさない(P3-3-Q5)。 */
  readonly coilTurns: number;
  /** 磁気的な方向一貫性。`(0,1]`。全ターン同方向なら1。 */
  readonly windingTurnsRatio: number;
  /** 左右バランス由来の軸ずれ [mm]。 */
  readonly axisOffsetMm: number;
}

/**
 * 巻線記録から`MotorConfig`の3フィールドを導出する(純関数)。
 *
 * **空記録では`windingTurnsRatio`が1**になる(`aggregateWindingRecord`の0除算回避)。
 * 空記録はそもそも走行不可(`resolveWindingRunnability`)なので、この値が走行へ届くことはない。
 */
export function deriveWindingMotorFields(record: WindingRecord): WindingDerivedMotorFields {
  const aggregate = aggregateWindingRecord(record, { axisOffsetCoefficientMm: PRODUCTION_AXIS_OFFSET_COEFFICIENT_MM });
  return {
    coilTurns: aggregate.coilTurns,
    windingTurnsRatio: aggregate.effectiveTurnsRatio,
    axisOffsetMm: aggregate.axisOffsetMm,
  };
}
