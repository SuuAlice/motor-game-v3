import { useState } from 'react';
import type { AssemblyStepProps } from '../../modes/AssemblyMode';

export function VarnishStep({ draft, setDraft }: AssemblyStepProps) {
  const [drying, setDrying] = useState(false);

  function applyVarnish() {
    setDraft((previous) => ({ ...previous, varnished: true }));
    setDrying(true);
    window.setTimeout(() => setDrying(false), 1200);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow-sm">
      <div><h3 className="font-bold text-slate-800">コイルをワニスで固定する</h3><p className="mt-1 text-sm text-slate-600">高回転時の遠心力によるコイル崩壊を防ぐ。省略すると2,000 RPM超の連続運転に耐えにくい。</p></div>
      <div className={`rounded-lg p-6 text-center transition-colors ${drying ? 'bg-sky-100' : (draft.varnished ?? false) ? 'bg-emerald-100' : 'bg-slate-100'}`}>
        <span className="text-3xl" aria-hidden="true">{drying ? '💧' : (draft.varnished ?? false) ? '✅' : '🌀'}</span>
        <p className="mt-2 font-bold">{drying ? '乾燥中…' : (draft.varnished ?? false) ? 'ワニス固め済み' : '未処理'}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={applyVarnish} disabled={drying} className="rounded bg-sky-700 px-3 py-2 font-bold text-white disabled:opacity-50">ワニスを塗る</button>
        <button type="button" onClick={() => { setDrying(false); setDraft((previous) => ({ ...previous, varnished: false })); }} className="rounded border border-slate-300 px-3 py-2 font-bold text-slate-700">省略する</button>
      </div>
    </div>
  );
}
