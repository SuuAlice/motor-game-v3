// Phase1解像度確定(2026-07-22人間承認、docs/phase1-resolution-comparison.md §7)の反映:
// 候補bを採用、候補cは比較用として不採用になったことをラベルへ明示する。
// 4案比較機能自体・候補cの計算ロジックは維持し(Suu承認)、既定選択候補のみ採用値(b)にする。
export interface ResolutionCandidateOption {
  id: 'a' | 'b' | 'c' | 'd';
  label: string;
  world: { w: number; h: number };
  ui: { w: number; h: number };
}

export type CandidateId = ResolutionCandidateOption['id'];

export const CANDIDATES: readonly ResolutionCandidateOption[] = [
  { id: 'a', label: '(a) 320×180 単層', world: { w: 320, h: 180 }, ui: { w: 320, h: 180 } },
  { id: 'b', label: '(b) 480×270 単層(採用)', world: { w: 480, h: 270 }, ui: { w: 480, h: 270 } },
  { id: 'c', label: '(c) ワールド480×270+UI960×540(比較用・不採用)', world: { w: 480, h: 270 }, ui: { w: 960, h: 540 } },
  { id: 'd', label: '(d) 640×360 単層', world: { w: 640, h: 360 }, ui: { w: 640, h: 360 } },
] as const;

export const DEFAULT_CANDIDATE_ID: CandidateId = 'b';
