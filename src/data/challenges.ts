// spec docs/spec.md §6ディレクトリ構成で指定された「チャレンジ定義(目標RPM・固定パラメータ)」。
// targetRpm・star3MaxAvgCurrentAは scripts/sweep.ts の実行結果を元に、各縛り条件で
// 「☆2条件(10秒間±10%)を保てる中での最大RPM」の90%をtargetRpmに、そのときの
// 平均電流に約1.1倍の余裕を持たせた値をstar3の閾値にした。
//
// 試遊の知見(壊れない・ブレない範囲で最大速度を探すのが楽しい)に基づき、
// 7つの縛りはいずれも「1つのパラメータを不利な側に固定し、残りで上限に迫る」設計。
//
// Phase3バランス調整(2026-07-18再計算): 「巻き数とブラシ圧をとにかく減らす」構成が
// ほぼ全チャレンジの最適解になる縮退戦略が試遊で見つかったため、
// (1) engine/constants.tsのチャタリングモデルを強化し、brushPressure<0.2は
//     ☆2の安定条件を確実に破るようにした(motorPhysics.ts参照)
// (2) coilTurnsを固定していない6チャレンジにparamRanges({coilTurns:[50,150]})を
//     追加し、「巻き数最小化」自体を選択肢から外した
// この2つの結果、sweep.tsの各シナリオの上位候補はbrushPressure=0.3
// (spec設計目標の適正値)・coilTurns=50以上に収束するようになった。
// 数値は再計算後のものに更新済み。
import type { MotorConfig } from '../engine/motorPhysics';

// Phase3バランス調整で追加。coilTurns最小化のような「自由パラメータを極端に振る」
// 縮退戦略を防ぐため、チャレンジごとに自由パラメータの可動域を狭められるようにする。
// batteryVoltageは連続値ではなく離散選択なので対象外。
type ContinuousParam = Exclude<keyof MotorConfig, 'batteryVoltage'>;

// coilTurnsを固定していないチャレンジに共通で使う下限(sweep.tsのCOIL_TURNS_FLOOR_OVERRIDEと対応)
const COIL_TURNS_FLOOR: [number, number] = [50, 150];

export interface Challenge {
  id: string;
  title: string;
  description: string;
  lockedParams: Partial<MotorConfig>; // ユーザーが動かせない固定パラメータ
  paramRanges?: Partial<Record<ContinuousParam, [number, number]>>; // 自由パラメータの可動域制限(省略時はMotorConfigの全体範囲)
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
    paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    targetRpm: 791,
    star3MaxAvgCurrentA: 0.73,
  },
  {
    id: 'weak-magnet',
    title: '弱い磁石でどこまで出せるか',
    description: 'フェライト磁石(弱い磁石)しか使えません。他のパラメータを工夫して速さを稼ごう。',
    lockedParams: { magnetStrength: 0.2 },
    paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    targetRpm: 556,
    star3MaxAvgCurrentA: 1.56,
  },
  {
    id: 'few-turns',
    title: '巻き数ひかえめチャレンジ',
    description: 'コイルの巻き数が30回に固定されています。トルクの弱さを他のパラメータで補おう。',
    lockedParams: { coilTurns: 30 },
    targetRpm: 2650,
    star3MaxAvgCurrentA: 2.37,
  },
  {
    id: 'low-voltage',
    title: '1.5Vだけで走らせる',
    description: '電池は1.5V固定です。低い電圧でもしっかり回る組み合わせを探そう。',
    lockedParams: { batteryVoltage: 1.5 },
    paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    targetRpm: 372,
    star3MaxAvgCurrentA: 1.01,
  },
  {
    id: 'firm-brush',
    title: 'ブラシを強めに押し当てたまま',
    description: 'ブラシの押し付け圧が高めに固定されています。摩擦に負けない設定を見つけよう。',
    lockedParams: { brushPressure: 0.45 },
    paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    targetRpm: 545,
    star3MaxAvgCurrentA: 0.67,
  },
  {
    id: 'narrow-slit',
    title: '狭いスリットで整流する',
    description: '整流子のすき間が0.8mmに固定されています。デッドゾーンの影響を抑える工夫をしよう。',
    lockedParams: { slitWidthMm: 0.8 },
    paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    targetRpm: 1744,
    star3MaxAvgCurrentA: 1.49,
  },
  {
    id: 'far-magnet',
    title: '磁石を遠ざけたまま挑戦',
    description: '磁石とコイルの距離が25mmに固定されています。磁力の弱まりを他の工夫で補おう。',
    lockedParams: { magnetDistanceMm: 25 },
    paramRanges: { coilTurns: COIL_TURNS_FLOOR },
    targetRpm: 1534,
    star3MaxAvgCurrentA: 1.95,
  },
];
