// docs/phase1-plan.md §8: retro-proto.htmlのタブ切替シェル。Unit D「解像度比較」
// 「俯瞰走行ビュー」、Unit E「色演算」、Unit F「Mode 7」、Unit G「音源」、
// Unit H「最悪ケース性能測定」を実装済み。
// PHASE1-UNITH-REVIEW指摘5: 選択中タブを色だけで示さない(role=tab/aria-selected+
// 記号付きラベル、computeTabButtonState)。6タブがスマホ縦幅で操作不能にならない
// よう折り返す(flex-wrap)。フォーカスリングは除去していない。
import { useState } from 'react';
import { ResolutionHarness } from './resolutionHarness/ResolutionHarness';
import { OverheadViewDemo } from './overheadView/OverheadViewDemo';
import { ColorOpsDemo } from './colorOpsDemo/ColorOpsDemo';
import { Mode7Demo } from './mode7Demo/Mode7Demo';
import { AudioDemo } from './audioDemo/AudioDemo';
import { WorstCaseDemo } from './worstCase/WorstCaseDemo';
import { computeTabButtonState } from './tabState';

const TABS = [
  { id: 'resolution', label: '解像度比較', component: ResolutionHarness },
  { id: 'overhead', label: '俯瞰走行ビュー', component: OverheadViewDemo },
  { id: 'colorOps', label: '色演算', component: ColorOpsDemo },
  { id: 'mode7', label: 'Mode 7', component: Mode7Demo },
  { id: 'audio', label: '音源', component: AudioDemo },
  { id: 'worstCase', label: '最悪ケース性能測定', component: WorstCaseDemo },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function App() {
  const [tabId, setTabId] = useState<TabId>('resolution');
  const ActiveComponent = TABS.find((t) => t.id === tabId)?.component ?? TABS[0].component;

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-3 py-2">
        <span className="text-xs font-bold text-slate-500">V3試作(Phase1限定・開発専用)</span>
        <nav role="tablist" aria-label="Phase1試作タブ" className="flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const isSelected = tabId === tab.id;
            const { ariaSelected, displayLabel } = computeTabButtonState(tab.label, isSelected);
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                role="tab"
                aria-selected={ariaSelected}
                aria-controls={`tabpanel-${tab.id}`}
                onClick={() => setTabId(tab.id)}
                className={`rounded px-3 py-1 text-sm ${isSelected ? 'bg-slate-800 font-bold text-white' : 'bg-slate-200 text-slate-700'}`}
              >
                {displayLabel}
              </button>
            );
          })}
        </nav>
      </header>
      <main role="tabpanel" id={`tabpanel-${tabId}`} aria-labelledby={`tab-${tabId}`} className="flex-1 overflow-hidden">
        <ActiveComponent />
      </main>
    </div>
  );
}
