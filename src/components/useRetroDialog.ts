// カート内訳(店)・サルベージ確認(在庫)で共有するnative <dialog>+showModal()のライフサイクル管理。
// 人間確定仕様2026-07-23: 背面(戻るボタン・音オフ・モード選択含む)のpointer操作・プログラム的
// フォーカスは、ブラウザ標準のinert機構(showModal())に委ねる。ただしTab/Shift+Tabについては、
// inertだけに任せると最後/最初の要素の次でdocument.bodyを経由する一瞬の中間状態が生じ
// (Suu_mot3コードレビュー指摘: 「一瞬でも無害ではない」)、これを避けるため有効な要素間を
// 明示的に循環させるkeydownハンドラをこのhook側に集約する(カート・サルベージ両方で再発しない
// 構造にする、計画v7の「共通化」要件)。
import { useEffect, useLayoutEffect, useRef } from 'react';

export interface UseRetroDialogOptions {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function useRetroDialog({ open, onClose }: UseRetroDialogOptions) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // openの変化にdialog.openを追従させる。useLayoutEffectでペイント前に確定させ、開いた瞬間に
  // 未対応(フォーカス未設定)の状態が一度でも描画されないようにする(Suu_mot3コードレビュー
  // 指摘)。StrictMode等で同じopen値のまま2回実行されても、dialog.openを見てから呼ぶため
  // showModal()の二重呼び出し例外(InvalidStateError)を起こさない。
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Escapeによるネイティブの自動close(cancelイベント)を止め、onClose経由でReact state更新に
  // 一本化する。これによりdialog.openとReactのopen propが常に一致する(呼び出し元がstateを
  // falseにした結果として上のeffectがdialog.close()を呼ぶ、という単一方向のみにする)。
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  // Tab/Shift+Tabを、ダイアログ内の有効(disabledでない)button要素間だけで明示的に循環させる。
  // 背面はinertで既に到達不能だが、Tabキー自体はブラウザの既定フォーカス移動アルゴリズムに
  // 任せるとdocument.bodyを一瞬経由する(空カート/ボタン1個/disabled混在いずれでも起こり得る)。
  // ここでpreventDefaultして自前で次/前を計算するため、その中間状態自体をなくす。
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      if (focusable.length === 0) return;
      e.preventDefault();
      const currentIndex = focusable.indexOf(document.activeElement as HTMLButtonElement);
      if (e.shiftKey) {
        const prevIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
        focusable[prevIndex]?.focus();
      } else {
        const nextIndex = currentIndex === -1 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
        focusable[nextIndex]?.focus();
      }
    };
    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return dialogRef;
}
