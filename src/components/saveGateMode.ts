// 追補3(Suuレビュー2026-08-02T17:00「SaveGateのUIテストが0件」)。SaveGate.tsxの
// 表示分岐を純関数として切り出し、Reactレンダリングなしでテストできるようにする
// (新規テスト依存を増やさない方針、vitestのみで完結させる)。
// 優先順位はSaveGate.tsx本体と1:1: 破損(bootstrapError) > 待機(lease未取得) > 保留中。
export type SaveGateMode = 'corrupted' | 'waiting' | 'pending' | 'normal';

export interface SaveGateInput {
  bootstrapError: string | null;
  leaseState: 'acquired' | 'leaseNotAcquired';
  hasPendingApplication: boolean;
}

export function computeSaveGateMode(input: SaveGateInput): SaveGateMode {
  if (input.bootstrapError !== null) return 'corrupted';
  if (input.leaseState === 'leaseNotAcquired') return 'waiting';
  if (input.hasPendingApplication) return 'pending';
  return 'normal';
}

/**
 * PendingScreenのretryボタン結果からエラー表示文を導出する。leaseNotAcquiredは
 * 「保存失敗」ではなく、computeSaveGateModeがそのまま'waiting'へ切り替えて
 * WaitingScreenへ自動遷移するため、ここではエラー文を出さない(追補2 bullet4)。
 */
export function pendingRetryMessage(
  result: { ok: true } | { ok: false; error: { kind: string } },
  reasonJa: (kind: string) => string,
): string | null {
  if (result.ok) return null;
  if (result.error.kind === 'leaseNotAcquired') return null;
  return reasonJa(result.error.kind);
}

/** PendingScreenの破棄ボタン結果からエラー表示文を導出する。 */
export function pendingAbandonMessage(result: { ok: true } | { ok: false; reason: string }): string | null {
  return result.ok ? null : result.reason;
}
