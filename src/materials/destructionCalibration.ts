// P3-4 G1a: D01/D02/D05共通部の確定較正値をproduction定数として集約する(docs/phase3-p3-4-plan.md
// v12 §5.2)。値はここで新規に決定するのではなく、既に人間commit承認済みの確定値
// (docs/phase3-p3-3-implementation-report.md §6、checkpoint5較正レビュー2026-08-10+D01較正確定
// 2026-08-11)をtest fixtureの複製からproduction単一出典へ集約するのみ(数値そのものの変更ではない)。
// 下記全フィールドは同報告書§6の表と1対1で照合済み。
//
// D04・D07の確定較正値は既にmaterialMapping.ts内のmodule-private constとして存在するため
// (mapD04BatteryDestructionConfig・mapD07DestructionConfigが内部で参照)、本ファイルには含めない。

import type { DestructionConfig } from '../engine/destructionOrchestration';
import { COIL_DEFORM_OMEGA } from '../engine/constants';
import { computeMeanTension } from './windingMapping';
import type { WindingRecord } from './windingRecord';

export const D01_CALIBRATION: DestructionConfig['d01'] = {
  decayExposureScaleRad: 1000, // 確定。人間再承認不要(P3-3-D01較正確定、2026-08-11)
  minEffectiveTurnsRatio: 0.5, // 確定。人間再承認不要(同上)
  // P4-1C R2-A(2026-08-31人間再承認): 移設のみで挙動変更0。**`constants.ts`の
  // `COIL_DEFORM_OMEGA`が唯一の出典**で、同値の定数を別に作らない(bare caller・
  // 旧snapshot補完値もこの1定数を参照する)。張力からの供給はR2-SWEEP以降。
  // **このfieldの値は`assembleDestructionConfig`が`resolveCoilDeformOmegaRadS`で上書きする**。
  // ここに残す`COIL_DEFORM_OMEGA`は、記録を持たないlegacy個体へ与える値と一致する。
  coilDeformOmegaRadS: COIL_DEFORM_OMEGA,
};

/**
 * P41C-R2-C2改(2026-08-31人間再承認)で確定したD01緩み係数。**承認済み格子{0.1,0.2,0.3,0.4,0.5}の端**
 * である。選定根拠と全証跡はdocs/phase4-p4-1-plan.md §5.3とR2-SWEEP第1〜3回の報告書を参照。
 * 変更・格子拡張には人間再承認を要する。
 */
export const PRODUCTION_D01_LOOSENESS_K = 0.5;

/**
 * 巻線記録の平均張力からD01のコイル崩壊しきい角速度を解決する(純関数)。
 *
 * 式は `COIL_DEFORM_OMEGA × (1 − K × (1 − meanTension))`。緩く巻くほど閾値が下がり、高回転で
 * 崩れやすくなる(正典§9.2「緩み→高回転で崩れやすい」)。**meanTension=1では閾値を下げない**
 * ——高張力側の危険は被膜損傷・破断という別現象が担うため、D01へ二重に背負わせない。
 *
 * **legacy個体(`record === null`)は`COIL_DEFORM_OMEGA`をそのまま返す**。記録を持たない個体へ
 * 張力を推定して与えることは記録の捏造であり、移設前の挙動を変えないためでもある。
 */
export function resolveCoilDeformOmegaRadS(record: WindingRecord | null): number {
  if (record === null) return COIL_DEFORM_OMEGA;
  return COIL_DEFORM_OMEGA * (1 - PRODUCTION_D01_LOOSENESS_K * (1 - computeMeanTension(record)));
}

export const D02_CALIBRATION: DestructionConfig['d02'] = {
  smokeGaugeThreshold: 0.6, // ゲート1裁定値(較正対象外)
  coilOverheatGaugeLimit: 1, // 契約値(較正対象外)
  conductionScale: 0.04, // checkpoint5でgrid実測により新規較正、確定
  dissipationCoefficient: 0.5, // 同上
  smokeResistanceMultiplier: 1.2, // ゲート1裁定値、確定
};

// assembleD05Config(mapD05BrushWearConfig(brushId), D05_COMMON_CALIBRATION)のcommonPart引数
// (materialMapping.tsのassembleD05Config型と完全一致する5フィールド)。ブラシ素材非依存の共通部。
export const D05_COMMON_CALIBRATION = {
  brushSparkDurationLimitS: 0.15, // ゲート1裁定値、確定
  brushSparkCurrentThresholdA: 3, // 同上
  wearPerAmpSecond: 0.001, // 同上
  recoveryFrames: 6, // 同上
  recoveryContactResistanceMultiplier: 1.2, // 同上
};
