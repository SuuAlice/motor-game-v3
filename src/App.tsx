import { useState } from 'react'
import { useGameStore } from './store/gameStore'
import { SandboxMode } from './modes/SandboxMode'
import { ChallengeMode } from './modes/ChallengeMode'
import { DiagnosisMode } from './modes/DiagnosisMode'
import { AssemblyMode } from './modes/AssemblyMode'
import { Glossary } from './components/Glossary'
import { LegacyDataNotice } from './components/LegacyDataNotice'
import { ExperimentNotebook } from './components/ExperimentNotebook'

// spec docs/spec.md §4: 「[タイトル] → [モード選択]」
function TitleScreen({ onOpenGlossary, onOpenNotebook }: { onOpenGlossary: () => void; onOpenNotebook: () => void }) {
  const setMode = useGameStore((s) => s.setMode)

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-8">
      <p className="text-center text-sm text-slate-600">
        線径、巻き方、整流子、ブラシ圧を追い込み、手巻きDCモーターの性能を測定するチューニングシミュレーター。
      </p>
      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={onOpenNotebook}
          className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 font-bold text-violet-800"
        >
          実験ノート
        </button>
        <button
          type="button"
          onClick={() => setMode('sandbox')}
          className="rounded-lg bg-amber-600 px-4 py-3 font-bold text-white"
        >
          実験室(サンドボックス)
        </button>
        <button
          type="button"
          onClick={() => setMode('challenge')}
          className="rounded-lg bg-slate-700 px-4 py-3 font-bold text-white"
        >
          調整チャレンジ
        </button>
        <button
          type="button"
          onClick={() => setMode('diagnosis')}
          className="rounded-lg bg-emerald-700 px-4 py-3 font-bold text-white"
        >
          トラブル診断
        </button>
        <button
          type="button"
          onClick={() => setMode('assembly')}
          className="rounded-lg bg-sky-700 px-4 py-3 font-bold text-white"
        >
          組み立てモード
        </button>
        <button
          type="button"
          onClick={onOpenGlossary}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700"
        >
          用語集
        </button>
      </div>
    </div>
  )
}

function App() {
  const mode = useGameStore((s) => s.mode)
  const setMode = useGameStore((s) => s.setMode)
  const [utilityPage, setUtilityPage] = useState<'glossary' | 'notebook' | null>(null)

  return (
    <main className="min-h-svh bg-slate-50">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 pt-4">
        <h1 className="text-xl font-bold text-slate-800">回れ!手作りモーター EX</h1>
        {!utilityPage && mode !== 'title' && (
          <button type="button" onClick={() => setMode('title')} className="text-sm text-slate-500 underline">
            モード選択
          </button>
        )}
      </div>
      <LegacyDataNotice />
      {utilityPage === 'glossary' ? (
        <Glossary onClose={() => setUtilityPage(null)} />
      ) : utilityPage === 'notebook' ? (
        <ExperimentNotebook onClose={() => setUtilityPage(null)} />
      ) : (
        <>
          {mode === 'title' && <TitleScreen onOpenGlossary={() => setUtilityPage('glossary')} onOpenNotebook={() => setUtilityPage('notebook')} />}
          {mode === 'sandbox' && <SandboxMode />}
          {mode === 'challenge' && <ChallengeMode />}
          {mode === 'diagnosis' && <DiagnosisMode />}
          {mode === 'assembly' && <AssemblyMode />}
        </>
      )}
    </main>
  )
}

export default App
