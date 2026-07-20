// docs/phase1-plan.md §8: retro-proto.htmlのタブ切替シェル。Unit D時点では
// 「解像度比較」「俯瞰走行ビュー」の2タブのみ実装する。色演算(Unit E)・Mode 7
// (Unit F)・音源(Unit G)・最悪ケース性能測定(Unit H)は後続Unitで追加する。
import { useState } from 'react';
import { ResolutionHarness } from './resolutionHarness/ResolutionHarness';
import { OverheadViewDemo } from './overheadView/OverheadViewDemo';

const TABS = [
  { id: 'resolution', label: '解像度比較', component: ResolutionHarness },
  { id: 'overhead', label: '俯瞰走行ビュー', component: OverheadViewDemo },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function App() {
  const [tabId, setTabId] = useState<TabId>('resolution');
  const ActiveComponent = TABS.find((t) => t.id === tabId)?.component ?? TABS[0].component;

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center gap-2 border-b border-slate-300 bg-white px-3 py-2">
        <span className="text-xs font-bold text-slate-500">V3試作(Phase1限定・開発専用)</span>
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTabId(tab.id)}
              className={`rounded px-3 py-1 text-sm ${tabId === tab.id ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-hidden">
        <ActiveComponent />
      </main>
    </div>
  );
}
