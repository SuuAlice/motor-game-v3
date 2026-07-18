import { useState } from 'react';

const LEGACY_KEY = 'motor-game:progress';
const DISMISSED_KEY = 'v15:legacy-notice-dismissed';

export function LegacyDataNotice() {
  const [visible, setVisible] = useState(() =>
    typeof window !== 'undefined'
      && window.localStorage.getItem(LEGACY_KEY) !== null
      && window.localStorage.getItem(DISMISSED_KEY) !== 'true',
  );

  if (!visible) return null;

  return (
    <div role="status" className="mx-auto mt-4 flex max-w-md items-start gap-3 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950">
      <p className="flex-1">v1.0の記録はv1.5へ引き継がれません。旧データは削除せず端末内に保持しています。</p>
      <button
        type="button"
        className="font-bold underline"
        onClick={() => {
          window.localStorage.setItem(DISMISSED_KEY, 'true');
          setVisible(false);
        }}
      >
        閉じる
      </button>
    </div>
  );
}
