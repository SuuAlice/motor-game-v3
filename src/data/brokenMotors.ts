// spec docs/spec.md §6ディレクトリ構成で指定された「診断モードの故障プリセット」。
// engine/failures.tsが検出する6カテゴリ(shorted / sandingResidue / brushTooTight /
// brushTooLoose / weakField / axisWobble。逆起電力頭打ちは故障ではないため対象外)
// それぞれに1件ずつ、他は適正パラメータ・該当パラメータだけが不健全という
// 「原因が一つに絞れる」プリセットを用意する。
//
// 各パラメータ値は、実際にengine/step()でシミュレーションしfailures.tsの判定結果を
// 確認した上で選んでいる(合成データではなく実挙動で検証済み)。
import type { MotorConfig } from '../engine/motorPhysics';

export interface BrokenMotor {
  id: string;
  title: string;
  config: MotorConfig; // 1箇所だけ壊れた設定(他は適正値)
  repairableParam: keyof MotorConfig; // プレイヤーが唯一操作できるパラメータ
}

// spec §3.7設計目標の「適正パラメータ」
const GOOD: MotorConfig = {
  coilTurns: 80,
  slitWidthMm: 1.5,
  sandingQuality: 0.9,
  brushPressure: 0.3,
  magnetStrength: 1.0,
  magnetDistanceMm: 10,
  batteryVoltage: 3.0,
  axisOffsetMm: 0,
};

export const BROKEN_MOTORS: BrokenMotor[] = [
  {
    id: 'shorted',
    title: 'モーター1号: うんともすんとも言わない',
    config: { ...GOOD, slitWidthMm: 0 },
    repairableParam: 'slitWidthMm',
  },
  {
    id: 'sanding-residue',
    title: 'モーター2号: 弱々しくしか回らない(その1)',
    config: { ...GOOD, sandingQuality: 0.1 },
    repairableParam: 'sandingQuality',
  },
  {
    id: 'brush-too-tight',
    title: 'モーター3号: フリックしても回り出さない',
    config: { ...GOOD, brushPressure: 0.6 },
    repairableParam: 'brushPressure',
  },
  {
    id: 'brush-too-loose',
    title: 'モーター4号: 回転数がずっと不安定',
    config: { ...GOOD, brushPressure: 0.19 },
    repairableParam: 'brushPressure',
  },
  {
    id: 'weak-field',
    title: 'モーター5号: 弱々しくしか回らない(その2)',
    config: { ...GOOD, magnetStrength: 0.3 },
    repairableParam: 'magnetStrength',
  },
  {
    id: 'axis-wobble',
    title: 'モーター6号: 速く回すとガタガタ揺れる',
    config: { ...GOOD, axisOffsetMm: 3 },
    repairableParam: 'axisOffsetMm',
  },
];
