import { TRACKS } from '../data/tracks';
import type { TrackSegment } from '../engine/trackPhysics';
import { useGameStore } from '../store/gameStore';
import { resolveSegmentAt } from '../engine/trackPhysics';
import { CourseRaceCanvas } from '../render/CourseRaceCanvas';
import { CourseMeasurementPanel } from '../components/CourseMeasurementPanel';
import { evaluateObjectives, validateBuildRestrictions, type Objective } from '../engine/scoring';
import type { ValidatedTrackDefinition } from '../engine/trackPhysics';
import type { CarConfig, VehicleSimState } from '../engine/vehiclePhysics';
import type { MotorConfig } from '../engine/motorPhysics';
import type { CourseRunRecord } from '../store/gameStore';

const TRACK_ICONS: Record<string, string> = {
  'straight-10m': '↔',
  'hill-climb': '↗',
  'curve-balance': '⌁',
  'rough-board': '≋',
  'energy-run': '⚡',
};

function featureLabel(segment: TrackSegment): string | null {
  if (segment.slopeDeg > 0) return `上り ${segment.slopeDeg.toFixed(0)}°`;
  if (segment.curveRadiusM !== undefined) return `カーブ半径 ${segment.curveRadiusM.toFixed(3)} m`;
  if (segment.roughness >= 0.5) return `凹凸 ${(segment.roughness * 100).toFixed(0)} %`;
  return null;
}

function objectiveLabel(kind: string, value?: number): string {
  if (kind === 'finish') return '完走';
  if (kind === 'targetTimeS') return `${value?.toFixed(2)}秒以内`;
  if (kind === 'maxEnergyJ') return `${value?.toFixed(2)} J以下`;
  return '制約を守る';
}

export function CourseMode() {
  const selectedTrackId = useGameStore((state) => state.selectedTrackId);
  const selectTrack = useGameStore((state) => state.selectTrack);
  const phase = useGameStore((state) => state.courseRunPhase);
  const vehicle = useGameStore((state) => state.vehicleState);
  const start = useGameStore((state) => state.startCourseRun);
  const abort = useGameStore((state) => state.abortCourseRun);
  const reset = useGameStore((state) => state.resetCourseRun);
  const courseProgress = useGameStore((state) => state.courseProgress);
  const motorConfig = useGameStore((state) => state.config);
  const carConfig = useGameStore((state) => state.carConfig);
  const selectedTrack = TRACKS.find((track) => track.id === selectedTrackId) ?? TRACKS[0];
  const lengthM = selectedTrack.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
  const features = selectedTrack.segments.map(featureLabel).filter((label): label is string => label !== null);
  const resolved = resolveSegmentAt(selectedTrack, vehicle.positionM);
  const terminalLabel = vehicle.status === 'finished' ? '完走' : vehicle.status === 'stalled' ? '停止'
    : vehicle.status === 'derailed' ? 'コースアウト' : vehicle.status === 'overheated' ? '過熱停止'
      : phase === 'running' ? '走行中' : phase === 'aborted' ? '中止' : '待機中';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 pb-12">
      <header className="overflow-hidden rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
        <p className="text-xs font-black tracking-[0.24em] text-amber-300">HANDMADE COURSE SELECT</p>
        <h2 className="mt-2 text-3xl font-black">工作コースを選ぶ</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
          速さだけでは勝てません。坂、カーブ、凹凸、使える電気に合わせて、モーターと車体の釣り合いを変えます。
        </p>
      </header>

      {phase !== 'ready' && (
        <>
          <div className="flex items-center justify-between rounded-2xl bg-slate-800 px-4 py-3 text-white">
            <div><p className="text-xs font-bold text-slate-400">走行コース</p><p className="font-black">{selectedTrack.name}</p></div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-black" aria-live="polite">{terminalLabel}</span>
          </div>
          <CourseRaceCanvas />
          <CourseMeasurementPanel resolved={resolved} />
          {phase === 'complete' && (
            <CourseResult
              track={selectedTrack}
              vehicle={vehicle}
              motorConfig={motorConfig}
              carConfig={carConfig}
              previous={courseProgress[selectedTrack.id]?.previous}
              best={courseProgress[selectedTrack.id]?.best}
            />
          )}
          <div className="flex gap-3">
            {phase === 'running' ? (
              <button type="button" onClick={abort} className="flex-1 rounded-xl bg-rose-700 px-5 py-3 font-bold text-white">走行を中止</button>
            ) : (
              <button type="button" onClick={reset} className="flex-1 rounded-xl bg-slate-700 px-5 py-3 font-bold text-white">コース選択へ戻る</button>
            )}
          </div>
        </>
      )}

      {phase === 'ready' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="コース一覧">
        {TRACKS.map((track, index) => {
          const active = track.id === selectedTrack.id;
          const progress = courseProgress[track.id];
          return (
            <button
              key={track.id}
              type="button"
              onClick={() => selectTrack(track.id)}
              aria-pressed={active}
              className={`group min-h-40 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-sky-300 ${active ? 'border-sky-600 bg-sky-700 text-white shadow-lg' : 'border-slate-200 bg-white text-slate-800 hover:border-sky-300'}`}
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-2xl font-black ${active ? 'bg-white/15' : 'bg-slate-100 text-slate-700'}`} aria-hidden="true">
                {TRACK_ICONS[track.id]}
              </span>
              <span className={`mt-4 block text-[10px] font-black tracking-[0.18em] ${active ? 'text-sky-100' : 'text-slate-400'}`}>COURSE {index + 1}</span>
              <strong className="mt-1 block leading-tight">{track.name}</strong>
              {progress?.exCompleted ? <span className="mt-3 inline-block rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-800">EX達成</span>
                : progress?.normalCompleted ? <span className="mt-3 inline-block rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800">達成済み</span>
                  : progress ? <span className="mt-3 inline-block rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">挑戦中</span> : null}
            </button>
          );
        })}
      </div>}

      {phase === 'ready' && <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[1.35fr_1fr]" aria-live="polite">
        <div>
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-3xl font-black text-amber-800" aria-hidden="true">{TRACK_ICONS[selectedTrack.id]}</span>
            <div>
              <p className="text-xs font-black tracking-[0.2em] text-slate-400">SELECTED COURSE</p>
              <h3 className="mt-1 text-2xl font-black text-slate-900">{selectedTrack.name}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{selectedTrack.description}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
            <span className="rounded-full bg-slate-100 px-3 py-1.5">全長 {lengthM.toFixed(0)} m</span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5">{selectedTrack.segments.length} 区間</span>
            {features.map((feature) => <span key={feature} className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-900">{feature}</span>)}
            {selectedTrack.hasEnergyBudget && <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">使える電気に上限あり</span>}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <h4 className="text-sm font-black text-slate-800">通常条件</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {selectedTrack.objectives.map((objective) => (
              <li key={objective.id} className="flex items-center gap-2"><span aria-hidden="true">□</span>{objectiveLabel(objective.kind, objective.value)}</li>
            ))}
          </ul>
          <h4 className="mt-5 text-sm font-black text-violet-800">EX条件</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {selectedTrack.exObjectives?.map((objective) => (
              <li key={objective.id} className="flex items-center gap-2"><span aria-hidden="true">◇</span>{objectiveLabel(objective.kind, objective.value)}</li>
            ))}
          </ul>
          <button type="button" onClick={start} className="mt-5 w-full rounded-xl bg-emerald-700 px-4 py-3 font-black text-white focus:outline-none focus:ring-4 focus:ring-emerald-300">
            手で押してスタート
          </button>
        </div>
      </section>}
    </div>
  );
}

function CourseResult({
  track,
  vehicle,
  motorConfig,
  carConfig,
  previous,
  best,
}: {
  track: ValidatedTrackDefinition;
  vehicle: VehicleSimState;
  motorConfig: MotorConfig;
  carConfig: CarConfig;
  previous?: CourseRunRecord;
  best?: CourseRunRecord;
}) {
  const context = { finalState: vehicle, motorConfig, carConfig, restrictions: track.restrictions };
  const normal = evaluateObjectives(track.objectives, context);
  const ex = track.exObjectives ? evaluateObjectives(track.exObjectives, context) : null;
  const energy = vehicle.energyBreakdown;
  const energyItems = [
    ['駆動', energy.driveJ],
    ['ギヤ損', energy.gearLossJ],
    ['空転損', energy.slipLossJ],
    ['ブラシ損', energy.brushLossJ],
    ['熱', energy.heatJ],
  ] as const;
  const resultTitle = vehicle.status === 'finished' ? '完走しました' : vehicle.status === 'derailed' ? 'コースアウト'
    : vehicle.status === 'overheated' ? '過熱停止' : '途中で停止';

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="走行リザルト">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-black tracking-[0.2em] text-slate-400">RESULT</p><h3 className="mt-1 text-2xl font-black text-slate-950">{resultTitle}</h3></div>
        <div className="flex gap-5 text-right"><ResultNumber label="タイム" value={vehicle.elapsedTimeS.toFixed(2)} unit="秒" /><ResultNumber label="走行距離" value={vehicle.positionM.toFixed(2)} unit="m" /></div>
      </div>

      <div className="mt-5 rounded-2xl bg-slate-900 p-4 text-white">
        <p className="text-xs font-bold text-slate-300">正式な使用電気合計</p>
        <p className="mt-1 text-3xl font-black tabular-nums">{vehicle.energyUsedJ.toFixed(2)} <span className="text-base">J</span></p>
      </div>
      <div className="mt-3 rounded-2xl border border-dashed border-slate-300 p-4">
        <div><p className="font-black text-slate-800">エネルギー内訳（概算）</p><p className="text-xs text-slate-500">各項目の合計は、正式な使用電気合計とは一致しません。</p></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {energyItems.map(([label, value]) => <ResultNumber key={label} label={label} value={value.toFixed(2)} unit="J" compact />)}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ObjectiveResult title="通常条件" objectives={track.objectives} evaluations={normal.results} track={track} vehicle={vehicle} motorConfig={motorConfig} carConfig={carConfig} />
        {track.exObjectives && ex && <ObjectiveResult title="EX条件" objectives={track.exObjectives} evaluations={ex.results} track={track} vehicle={vehicle} motorConfig={motorConfig} carConfig={carConfig} ex />}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <ComparisonCard title="前回との比較" record={previous} current={vehicle} />
        <ComparisonCard title="このコースのベスト" record={best} />
      </div>
    </section>
  );
}

function ObjectiveResult({ title, objectives, evaluations, track, vehicle, motorConfig, carConfig, ex = false }: {
  title: string;
  objectives: readonly Objective[];
  evaluations: { id: string; achieved: boolean }[];
  track: ValidatedTrackDefinition;
  vehicle: VehicleSimState;
  motorConfig: MotorConfig;
  carConfig: CarConfig;
  ex?: boolean;
}) {
  return <div className={`rounded-2xl p-4 ${ex ? 'bg-violet-50' : 'bg-emerald-50'}`}><h4 className={`font-black ${ex ? 'text-violet-900' : 'text-emerald-900'}`}>{title}</h4><ul className="mt-3 space-y-2">{objectives.map((objective) => {
    const achieved = evaluations.find((item) => item.id === objective.id)?.achieved ?? false;
    const validation = objective.kind === 'compliance' && vehicle.status === 'finished' && track.restrictions
      ? validateBuildRestrictions(motorConfig, carConfig, track.restrictions)
      : null;
    const unevaluable = validation !== null && !validation.evaluable;
    return <li key={objective.id} className="flex items-center justify-between gap-3 text-sm"><span>{objectiveLabel(objective.kind, objective.value)}</span><span className={`rounded-full px-2 py-1 text-xs font-black ${unevaluable ? 'bg-slate-200 text-slate-700' : achieved ? 'bg-emerald-700 text-white' : 'bg-rose-100 text-rose-800'}`}>{unevaluable ? '判定不能' : achieved ? '達成' : '未達成'}</span></li>;
  })}</ul></div>;
}

function ComparisonCard({ title, record, current }: { title: string; record?: CourseRunRecord; current?: VehicleSimState }) {
  if (!record) return <div className="rounded-2xl bg-slate-50 p-4"><h4 className="font-black text-slate-800">{title}</h4><p className="mt-2 text-sm text-slate-500">比較できる記録はまだありません。</p></div>;
  const timeDiff = current ? current.elapsedTimeS - record.elapsedTimeS : null;
  return <div className="rounded-2xl bg-slate-50 p-4"><h4 className="font-black text-slate-800">{title}</h4><div className="mt-3 flex gap-5"><ResultNumber label="タイム" value={record.elapsedTimeS.toFixed(2)} unit="秒" compact /><ResultNumber label="使用電気" value={record.energyUsedJ.toFixed(2)} unit="J" compact /></div>{timeDiff !== null && <p className={`mt-3 text-xs font-bold ${timeDiff <= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>前回より {Math.abs(timeDiff).toFixed(2)} 秒 {timeDiff <= 0 ? '速い' : '遅い'}</p>}</div>;
}

function ResultNumber({ label, value, unit, compact = false }: { label: string; value: string; unit: string; compact?: boolean }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className={`${compact ? 'text-base' : 'text-xl'} font-black tabular-nums`}>{value} <span className="text-xs font-bold">{unit}</span></p></div>;
}
