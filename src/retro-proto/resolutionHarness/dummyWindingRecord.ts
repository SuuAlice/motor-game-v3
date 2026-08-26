// spec §9.1: 巻線記録は{位置, 腕(左/右/中央またぎ), 方向, 張力}×最大150ターン。
// 解像度比較の題材用に、固定seedの決定論的ダミー記録を生成する(Phase4の巻線入力の
// 先取り実装はしない。描画検証専用)。逆巻き区間を意図的に混入させ、単発ノイズでなく
// 「区間」として見えるようにする(実物工作の最頻出失敗の再現、spec §9.2)。

// P4-0 G1b: 型の単一出典は`src/materials/windingRecord.ts`(alice所有の正典)である。
// ここでローカル定義を持つと、prototypeとproductionで意味が静かに分岐する。
import {
  quantizeWindingValue,
  type WindingArm,
  type WindingDirection,
  type WindingTurn,
} from '../../materials/windingRecord';

export type { WindingArm, WindingDirection, WindingTurn };

const DEFAULT_SEED = 20260721;
const DEFAULT_TURN_COUNT = 150;

// scripts/sweep.tsと同じmulberry32実装(決定論的PRNG、新規依存なし)。
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDummyWindingRecord(
  seed: number = DEFAULT_SEED,
  turnCount: number = DEFAULT_TURN_COUNT,
): WindingTurn[] {
  const rand = mulberry32(seed);
  const turns: WindingTurn[] = [];
  let direction: WindingDirection = 1;

  for (let i = 0; i < turnCount; i++) {
    if (i > 0 && i % 23 === 0 && rand() < 0.5) {
      direction = direction === 1 ? -1 : 1;
    }
    const armRoll = rand();
    const arm: WindingArm = armRoll < 0.42 ? 'left' : armRoll < 0.84 ? 'right' : 'straddle';
    // 正典の量子化格子(1/256)へ載せる。生成器は0〜1の値しか作らないため`null`にはならないが、
    // 型として非nullを主張せず、格子外を混ぜないことをここで保証する。
    const position = quantizeWindingValue(rand());
    const tension = quantizeWindingValue(0.3 + rand() * 0.7);
    if (position === null || tension === null) continue;
    turns.push({ position, arm, direction, tension });
  }

  return turns;
}
