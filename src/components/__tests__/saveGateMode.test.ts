// 追補3(Suuレビュー2026-08-02T17:00「SaveGateのUIテストが0件」)。SaveGate.tsxの
// 表示分岐(破損>待機>保留中>通常の優先順位)を、Reactレンダリングなしで固定する。
import { describe, expect, it } from 'vitest';
import { computeSaveGateMode, pendingAbandonMessage, pendingRetryMessage } from '../saveGateMode';

describe('computeSaveGateMode: 破損>待機>保留中>通常の優先順位', () => {
  it('bootstrapErrorが非nullなら、他の条件に関わらずcorrupted', () => {
    expect(computeSaveGateMode({ bootstrapError: 'io failed', leaseState: 'acquired', hasPendingApplication: false })).toBe('corrupted');
    expect(computeSaveGateMode({ bootstrapError: 'io failed', leaseState: 'leaseNotAcquired', hasPendingApplication: true })).toBe('corrupted');
  });

  it('bootstrapErrorがnullでleaseNotAcquiredなら、pendingApplicationの有無に関わらずwaiting', () => {
    expect(computeSaveGateMode({ bootstrapError: null, leaseState: 'leaseNotAcquired', hasPendingApplication: false })).toBe('waiting');
    expect(computeSaveGateMode({ bootstrapError: null, leaseState: 'leaseNotAcquired', hasPendingApplication: true })).toBe('waiting');
  });

  it('bootstrapErrorがnull・acquired・pendingApplicationありならpending', () => {
    expect(computeSaveGateMode({ bootstrapError: null, leaseState: 'acquired', hasPendingApplication: true })).toBe('pending');
  });

  it('3条件すべて問題なければnormal', () => {
    expect(computeSaveGateMode({ bootstrapError: null, leaseState: 'acquired', hasPendingApplication: false })).toBe('normal');
  });
});

describe('pendingRetryMessage', () => {
  const reasonJa = (kind: string) => `reason:${kind}`;

  it('成功時はnull', () => {
    expect(pendingRetryMessage({ ok: true }, reasonJa)).toBeNull();
  });

  it('leaseNotAcquiredは画面遷移で解決するためnull(エラー表示しない)', () => {
    expect(pendingRetryMessage({ ok: false, error: { kind: 'leaseNotAcquired' } }, reasonJa)).toBeNull();
  });

  it('それ以外のエラーはreasonJaで日本語化した文言を返す', () => {
    expect(pendingRetryMessage({ ok: false, error: { kind: 'staleLease' } }, reasonJa)).toBe('reason:staleLease');
  });
});

describe('pendingAbandonMessage', () => {
  it('成功時はnull', () => {
    expect(pendingAbandonMessage({ ok: true })).toBeNull();
  });

  it('失敗時はreasonをそのまま返す', () => {
    expect(pendingAbandonMessage({ ok: false, reason: '前回セッションの終了を確認しています' })).toBe('前回セッションの終了を確認しています');
  });
});
