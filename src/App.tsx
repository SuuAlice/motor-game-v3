import { useState } from 'react'
import { useGameStore } from './store/gameStore'
import { LabMode } from './modes/LabMode'
import { DiagnosisMode } from './modes/DiagnosisMode'
import { AssemblyMode } from './modes/AssemblyMode'
import { TestRunMode } from './modes/TestRunMode'
import { CourseMode } from './modes/CourseMode'
import { GarageMode } from './modes/GarageMode'
import { Glossary } from './components/Glossary'
import { LegacyDataNotice } from './components/LegacyDataNotice'
import { ExperimentNotebook } from './components/ExperimentNotebook'
import { MotorAudioControl } from './components/MotorAudioControl'
import { ShopScreen } from './components/ShopScreen'
import { InventoryScreen } from './components/InventoryScreen'

// spec docs/spec.md §4: 「[タイトル] → [モード選択]」
function TitleScreen({ onOpenGlossary, onOpenNotebook }: { onOpenGlossary: () => void; onOpenNotebook: () => void }) {
  const setMode = useGameStore((s) => s.setMode)

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-8">
      <p className="text-center text-sm text-slate-600">
        手巻きDCモーターと車体の釣り合いを追い込み、10 m直線で負荷性能を測るチューニングシミュレーター。
      </p>
      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={() => setMode('garage')}
          className="rounded-lg bg-amber-600 px-4 py-3 font-bold text-white"
        >
          ガレージで車を組む
        </button>
        <button
          type="button"
          onClick={() => setMode('course')}
          className="rounded-lg bg-emerald-700 px-4 py-3 font-bold text-white"
        >
          工作コースに挑戦
        </button>
        <button
          type="button"
          onClick={() => setMode('testRun')}
          className="rounded-lg bg-sky-700 px-4 py-3 font-bold text-white"
        >
          標準車体でテスト走行
        </button>
        <button
          type="button"
          onClick={onOpenNotebook}
          className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 font-bold text-violet-800"
        >
          実験ノート
        </button>
        <button
          type="button"
          onClick={() => setMode('lab')}
          className="rounded-lg bg-amber-600 px-4 py-3 font-bold text-white"
        >
          実験室
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
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <h1 className="text-lg font-bold text-slate-800 sm:text-xl">走れ!手作りモーターカー</h1>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2"><MotorAudioControl />{!utilityPage && mode !== 'title' && (
          <button type="button" onClick={() => setMode('title')} className="text-sm text-slate-500 underline">モード選択</button>
        )}</div>
      </div>
      <LegacyDataNotice />
      {utilityPage === 'glossary' ? (
        <Glossary onClose={() => setUtilityPage(null)} />
      ) : utilityPage === 'notebook' ? (
        <ExperimentNotebook onClose={() => setUtilityPage(null)} />
      ) : (
        <>
          {mode === 'title' && <TitleScreen onOpenGlossary={() => setUtilityPage('glossary')} onOpenNotebook={() => setUtilityPage('notebook')} />}
          {mode === 'garage' && <GarageMode />}
          {mode === 'lab' && <LabMode />}
          {mode === 'diagnosis' && <DiagnosisMode />}
          {mode === 'assembly' && <AssemblyMode />}
          {mode === 'testRun' && <TestRunMode />}
          {mode === 'course' && <CourseMode />}
          {mode === 'shop' && <ShopScreen />}
          {mode === 'inventory' && <InventoryScreen />}
        </>
      )}
    </main>
  )
}

export default App
