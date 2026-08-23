// テスト用の決定的PRNG(mulberry32)。性質ベーステストで再現可能な乱数列を得るために使う。
//
// P3-4-Q11 A-Q11-1(Suu_mot3照合により確定、2026-08-18): 本ファイルはローカル実装を持たず、
// production の正典run RNG `createRunRng`(`src/engine/destructionOrchestration.ts`)へ委譲する
// 薄い互換wrapperである。engine配下にmulberry32の実装が複数並存すると、片方だけが書き換わっても
// リプレイ等価の前提が静かに崩れる(Q10 §8で排除した「二重管理」と同型の構造的リスク)ため、
// 実装を1箇所へ一元化した。export名`mulberry32`は既存consumer(motorPhysics・motorPhysicsLoad・
// motorPhysicsSplitApi・motorPhysicsV15・vehiclePhysics・trackPhysics・destructionOrchestration
// の各テスト)の無改修を保つために維持している。
//
// なお brabit 所有の `src/retro/audio/prng.ts` は audio 用途の意図的な別実装であり、
// 所有境界を越えて共有しない(裁定明示)。
export { createRunRng as mulberry32 } from '../destructionOrchestration';
