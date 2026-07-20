// 決定論的PRNG(scripts/sweep.ts・src/retro-proto/resolutionHarness/dummyWindingRecord.ts
// と同じmulberry32実装)。ノイズ生成(synth.ts)・IR生成(reverb.ts)で共有し、
// 固定seedによる再生成可能性(spec §8.6「生成スクリプトを同梱し再生成可能に保つ」)を
// 満たす。新規依存を追加しないための自前実装。
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
