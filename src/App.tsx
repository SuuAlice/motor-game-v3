import { useGameStore } from './store/gameStore'
import { SandboxMode } from './modes/SandboxMode'
import { ChallengeMode } from './modes/ChallengeMode'
import { DiagnosisMode } from './modes/DiagnosisMode'

// spec docs/spec.md §4: 「[タイトル] → [モード選択]」
function TitleScreen() {
  const setMode = useGameStore((s) => s.setMode)

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-8">
      <p className="text-center text-sm text-slate-600">
        エナメル線・釘・ダンボールで作る手作りモーターを、ブラウザで試してみよう。
      </p>
      <div className="flex w-full flex-col gap-3">
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
      </div>
    </div>
  )
}

function App() {
  const mode = useGameStore((s) => s.mode)
  const setMode = useGameStore((s) => s.setMode)

  return (
    <main className="min-h-svh bg-slate-50">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 pt-4">
        <h1 className="text-xl font-bold text-slate-800">回れ!手作りモーター</h1>
        {mode !== 'title' && (
          <button type="button" onClick={() => setMode('title')} className="text-sm text-slate-500 underline">
            モード選択
          </button>
        )}
      </div>
      {mode === 'title' && <TitleScreen />}
      {mode === 'sandbox' && <SandboxMode />}
      {mode === 'challenge' && <ChallengeMode />}
      {mode === 'diagnosis' && <DiagnosisMode />}
    </main>
  )
}

export default App
