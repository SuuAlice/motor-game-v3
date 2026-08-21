// P3-4 G1a: D01/D02/D05共通部の確定較正値をproduction定数として集約する(docs/phase3-p3-4-plan.md
// v12 §5.2)。値はここで新規に決定するのではなく、既に人間commit承認済みの確定値
// (docs/phase3-p3-3-implementation-report.md §6、checkpoint5較正レビュー2026-08-10+D01較正確定
// 2026-08-11)をtest fixtureの複製からproduction単一出典へ集約するのみ(数値そのものの変更ではない)。
// 下記全フィールドは同報告書§6の表と1対1で照合済み。
//
// D04・D07の確定較正値は既にmaterialMapping.ts内のmodule-private constとして存在するため
// (mapD04BatteryDestructionConfig・mapD07DestructionConfigが内部で参照)、本ファイルには含めない。

import type { DestructionConfig } from '../engine/destructionOrchestration';

export const D01_CALIBRATION: DestructionConfig['d01'] = {
  decayExposureScaleRad: 1000, // 確定。人間再承認不要(P3-3-D01較正確定、2026-08-11)
  minEffectiveTurnsRatio: 0.5, // 確定。人間再承認不要(同上)
};

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
