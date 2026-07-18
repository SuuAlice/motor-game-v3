// spec docs/spec.md §6ディレクトリ構成で指定された「チャレンジ定義(目標RPM・固定パラメータ)」。
// targetRpm・star3MaxAvgCurrentAは scripts/sweep.ts の実行結果(2026-07-18実行)を
// 元に、各縛り条件で「☆2条件(10秒間±10%)を保てる中での最大RPM」の85〜95%を
// targetRpmに、そのときの平均電流に約1.1倍の余裕を持たせた値をstar3の閾値にした。
//
// 試遊の知見(壊れない・ブレない範囲で最大速度を探すのが楽しい)に基づき、
// 7つの縛りはいずれも「1つのパラメータを不利な側に固定し、残りで上限に迫る」設計。
import type { MotorConfig } from '../engine/motorPhysics';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  lockedParams: Partial<MotorConfig>; // ユーザーが動かせない固定パラメータ
  targetRpm: number; // ☆1: 到達目標RPM
  star3MaxAvgCurrentA: number; // ☆3: この値以下の平均電流で効率評価クリア
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'axis-offset',
    title: '軸ずれモーターで攻める',
    description:
      '軸が少しずれたモーターです。速く回しすぎるとガタガタ振動して外れてしまうかも。壊れるギリギリの速さを狙おう。',
    lockedParams: { axisOffsetMm: 2.5 },
    targetRpm: 1020,
    star3MaxAvgCurrentA: 0.37,
  },
  {
    id: 'weak-magnet',
    title: '弱い磁石でどこまで出せるか',
    description: 'フェライト磁石(弱い磁石)しか使えません。他のパラメータを工夫して速さを稼ごう。',
    lockedParams: { magnetStrength: 0.2 },
    targetRpm: 3210,
    star3MaxAvgCurrentA: 1.9,
  },
  {
    id: 'few-turns',
    title: '巻き数ひかえめチャレンジ',
    description: 'コイルの巻き数が30回に固定されています。トルクの弱さを他のパラメータで補おう。',
    lockedParams: { coilTurns: 30 },
    targetRpm: 4110,
    star3MaxAvgCurrentA: 1.97,
  },
  {
    id: 'low-voltage',
    title: '1.5Vだけで走らせる',
    description: '電池は1.5V固定です。低い電圧でもしっかり回る組み合わせを探そう。',
    lockedParams: { batteryVoltage: 1.5 },
    targetRpm: 920,
    star3MaxAvgCurrentA: 0.86,
  },
  {
    id: 'firm-brush',
    title: 'ブラシを強めに押し当てたまま',
    description: 'ブラシの押し付け圧が高めに固定されています。摩擦に負けない設定を見つけよう。',
    lockedParams: { brushPressure: 0.45 },
    targetRpm: 545,
    star3MaxAvgCurrentA: 0.67,
  },
  {
    id: 'narrow-slit',
    title: '狭いスリットで整流する',
    description: '整流子のすき間が0.8mmに固定されています。デッドゾーンの影響を抑える工夫をしよう。',
    lockedParams: { slitWidthMm: 0.8 },
    targetRpm: 3400,
    star3MaxAvgCurrentA: 1.53,
  },
  {
    id: 'far-magnet',
    title: '磁石を遠ざけたまま挑戦',
    description: '磁石とコイルの距離が25mmに固定されています。磁力の弱まりを他の工夫で補おう。',
    lockedParams: { magnetDistanceMm: 25 },
    targetRpm: 3285,
    star3MaxAvgCurrentA: 1.48,
  },
];
