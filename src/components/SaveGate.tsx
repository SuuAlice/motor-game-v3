// P3-0サブステップ3(Suuレビュー2026-08-02T16:15 必須3、2026-08-02T17:00 追補2/3)。
// docs/phase3-ui-autopsy-plan-v5.md 6-D-0節(lease状態3区分)・6-D-1節(保留中結果画面)・
// 8節(文言例)の最低限のUI境界を実装する。破損(bootstrapError)・待機(leaseNotAcquired)・
// 保留中(pendingApplication非null)のいずれかであれば、通常のゲーム画面(App.tsxのmode別
// 描画・用語集・実験ノート)を一切表示せず本画面へ強制する(追補3: utilityPageもApp.tsx側で
// SaveGateの内側に置かれているため、この判定を迂回できない)。表示分岐の優先順位は
// computeSaveGateMode(純関数、テスト対象)に委譲する。
// 音量等の設定操作(MotorAudioControl)はApp.tsx側でこのコンポーネントの外(常時表示の
// ヘッダー)に置かれているため、この画面が表示中でも操作できる(6-D-1節3「設定は例外」)。
import { useState } from 'react';
import { useSaveStore, applyOutcomeErrorReasonJa } from '../store/saveStore';
import { computeSaveGateMode, pendingAbandonMessage, pendingRetryMessage } from './saveGateMode';

function WaitingScreen() {
  return (
    <div role="status" className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <p className="text-lg font-bold text-slate-800">前回セッションの終了確認中です</p>
      <p className="text-sm text-slate-600">他のタブでこのゲームを開いている可能性があります。しばらくお待ちください(自動的に進みます)。</p>
    </div>
  );
}

function CorruptedScreen({ message }: { message: string }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <p className="text-lg font-bold text-red-700">{message}</p>
      <p className="text-sm text-slate-600">セーブデータを安全に保持したまま停止しています。ブラウザのlocalStorageの状態をご確認ください。</p>
    </div>
  );
}

function PendingScreen() {
  const retry = useSaveStore((s) => s.retryPendingApplicationAction);
  const abandon = useSaveStore((s) => s.abandonPendingApplicationAction);
  const pendingApplication = useSaveStore((s) => s.saveMeta.pendingApplication);
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  const [errorJa, setErrorJa] = useState<string | null>(null);

  if (!pendingApplication) return null;

  function handleRetry() {
    const result = retry();
    setErrorJa(pendingRetryMessage(result, applyOutcomeErrorReasonJa));
  }

  function handleAbandonConfirmed() {
    const result = abandon();
    setErrorJa(pendingAbandonMessage(result));
    if (result.ok) setConfirmingAbandon(false);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <h2 className="text-lg font-bold text-slate-800">前回の走行結果を保存できませんでした</h2>
      <p className="text-sm text-slate-600">走行終了理由: {pendingApplication.outcome.endReason}</p>
      {errorJa && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{errorJa}</p>}
      <div className="flex flex-col gap-2">
        <button type="button" onClick={handleRetry} className="rounded bg-sky-700 px-4 py-3 font-bold text-white">
          もう一度保存を試す
        </button>
        <button type="button" onClick={() => setConfirmingAbandon(true)} className="text-sm text-slate-500 underline">
          この記録を破棄する
        </button>
      </div>
      {confirmingAbandon && (
        <div role="alertdialog" aria-modal="true" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          <p>破棄すると当該走行の劣化・発見記録・報酬は永久に失われます。元に戻せません。</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={handleAbandonConfirmed} className="rounded bg-amber-600 px-3 py-2 font-bold text-white">
              破棄する
            </button>
            <button type="button" onClick={() => setConfirmingAbandon(false)} className="underline">
              やめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 破損・待機・保留中のいずれかであればchildren(通常のゲーム画面)の代わりに専用画面を
 * 表示する。優先順位・分岐はcomputeSaveGateMode(純関数)に委譲し、この関数自体は
 * ../components/__tests__/saveGateMode.test.tsで網羅的に検証する。
 */
export function SaveGate({ children }: { children: React.ReactNode }) {
  const bootstrapError = useSaveStore((s) => s.bootstrapError);
  const leaseState = useSaveStore((s) => s.leaseState);
  const hasPendingApplication = useSaveStore((s) => s.saveMeta.pendingApplication !== null);

  const mode = computeSaveGateMode({ bootstrapError, leaseState, hasPendingApplication });

  switch (mode) {
    case 'corrupted': return <CorruptedScreen message={bootstrapError as string} />;
    case 'waiting': return <WaitingScreen />;
    case 'pending': return <PendingScreen />;
    case 'normal': return <>{children}</>;
  }
}
