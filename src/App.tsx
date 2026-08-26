import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { useSaveStore } from './store/saveStore'
import { SaveGate } from './components/SaveGate'
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
import { EncyclopediaScreen } from './components/EncyclopediaScreen'
import { Phase4PrototypeScreen } from './p40/Phase4PrototypeScreen'
import { resolvePhase4BaselineInputs } from './p40/scenario'
import { resolveProductionMaterialCompositionBaseline } from './store/runOutcomeApplication'

/**
 * P4-0巻線プロトタイプへ渡す`MaterialCompositionBaseline`の**唯一の橋渡し**。
 *
 * baselineを構築してよいのはS-3の`resolveProductionMaterialCompositionBaseline`だけであり、
 * `src/p40/**`はstore-freeに保つ(store importも生値からの再構築も持たせない)。その両立のため、
 * 既にstore hostであるApp側でaliceの入力helperの戻り値をS-3関数へ渡し、結果をpropsで降ろす。
 *
 * store状態・inventory・saveは読まず、書き込みも行わない純関数の合成である。
 */
function resolvePhase4Baseline() {
  const { rawPlayerMotorConfig, garageBuild } = resolvePhase4BaselineInputs()
  return resolveProductionMaterialCompositionBaseline(rawPlayerMotorConfig, garageBuild)
}

// spec docs/spec.md §4: 「[タイトル] → [モード選択]」
function TitleScreen({ onOpenGlossary, onOpenNotebook, onOpenWindingPrototype }: { onOpenGlossary: () => void; onOpenNotebook: () => void; onOpenWindingPrototype: () => void }) {
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
        {/* P4-0 G2: 巻線入力3案の比較試作。gameStore.modeは使わず、App内のlocal stateで
            出し分ける(P4-1で統合する際にmode unionから値を削る作業が要らない)。 */}
        <button
          type="button"
          onClick={onOpenWindingPrototype}
          className="rounded-lg bg-violet-700 px-4 py-3 font-bold text-white"
        >
          巻線プロトタイプ(保存されません)
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
  // P4-0 G2: session限定の比較試作。保存もstore書込みも行わないためlocal stateで足りる。
  const [windingPrototypeOpen, setWindingPrototypeOpen] = useState(false)
  // 固定入力の純関数なので一度だけ解決する。毎renderで作り直すと、同値のまま
  // 参照だけが変わって画面側のmemoが無意味に落ちる。
  const phase4Baseline = useMemo(() => resolvePhase4Baseline(), [])

  // 必須2(Suuレビュー2026-08-02T16:15): lease lifecycle(heartbeat・待機ポーリング)を
  // アプリのmount/unmountへ配線する。startLeaseLifecycle自体が内部でタイマーを
  // 止めてから起動し直すため、React StrictMode(開発時のeffect二重発火)やHMRでの
  // 再mountでもタイマーが二重化しない。pagehideではbest-effortでタイマーだけ止める
  // (v12 4.3節「pagehideは補助であって正しさの根拠にしない」との整合、heartbeat時刻
  // 自体は書き換えない)。
  // 追補4(Suuレビュー2026-08-02T17:00): BFCache(back/forward cache)からの復帰は
  // unmount/remountを伴わないため、pagehideだけではheartbeatが永久停止する
  // (leaseStateはacquiredのままタイマーだけ止まる)。pageshowで必ずstartLeaseLifecycle
  // を再開する(startLeaseLifecycleは冪等なため、通常のmount経路と重複しても安全)。
  useEffect(() => {
    useSaveStore.getState().startLeaseLifecycle()
    const onPageHide = () => useSaveStore.getState().stopLeaseLifecycle()
    const onPageShow = () => useSaveStore.getState().startLeaseLifecycle()
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      useSaveStore.getState().stopLeaseLifecycle()
    }
  }, [])

  return (
    <main className="min-h-svh bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <h1 className="text-lg font-bold text-slate-800 sm:text-xl">走れ!手作りモーターカー</h1>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2"><MotorAudioControl />{!utilityPage && mode !== 'title' && (
          <button type="button" onClick={() => setMode('title')} className="text-sm text-slate-500 underline">モード選択</button>
        )}</div>
      </div>
      <LegacyDataNotice />
      {/* 追補3(Suuレビュー2026-08-02T17:00): utilityPage(用語集・実験ノート)を
          SaveGateより先に分岐させていた旧実装は、破損(bootstrapError)発生時に
          utilityPage表示中だと専用エラー画面へ遷移できない欠陥と、実験ノートの
          JSON読み込み(=replaceSessions、書き込み入口)がlease/pending中でも
          実行できてしまう欠陥の二つを持っていた。両方ともutilityPageをSaveGateの
          内側へ置くことで解消する(bootstrapError/lease/pendingいずれの場合も
          実験ノート・用語集を含め通常画面への到達を一切許可しない)。 */}
      <SaveGate>
        {windingPrototypeOpen ? (
          <Phase4PrototypeScreen onExit={() => setWindingPrototypeOpen(false)} baseline={phase4Baseline} />
        ) : utilityPage === 'glossary' ? (
          <Glossary onClose={() => setUtilityPage(null)} />
        ) : utilityPage === 'notebook' ? (
          <ExperimentNotebook onClose={() => setUtilityPage(null)} />
        ) : (
          <>
            {mode === 'title' && <TitleScreen onOpenGlossary={() => setUtilityPage('glossary')} onOpenNotebook={() => setUtilityPage('notebook')} onOpenWindingPrototype={() => setWindingPrototypeOpen(true)} />}
            {mode === 'garage' && <GarageMode />}
            {mode === 'lab' && <LabMode />}
            {mode === 'diagnosis' && <DiagnosisMode />}
            {mode === 'assembly' && <AssemblyMode />}
            {mode === 'testRun' && <TestRunMode />}
            {mode === 'course' && <CourseMode />}
            {mode === 'shop' && <ShopScreen />}
            {mode === 'inventory' && <InventoryScreen />}
            {mode === 'encyclopedia' && <EncyclopediaScreen onOpenNotebook={() => setUtilityPage('notebook')} />}
          </>
        )}
      </SaveGate>
    </main>
  )
}

export default App
