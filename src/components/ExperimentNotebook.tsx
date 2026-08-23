import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  parseNotebookJson,
  stringifyNotebook,
  useNotebookStore,
  type CourseRunNotebookRecord,
  type StoredExperimentSession,
} from '../store/notebookStore';
import type { MotorConfig, SimState } from '../engine/motorPhysics';
import { drawMotor } from '../render/drawMotor';
import { TRACK_BY_ID } from '../data/tracks';
import { describeD04Stage, formatRegressionReport } from './encyclopediaView';
import { computeRegressionReport, type NotebookRecordForRegression } from '../store/regressionReport';
import { useSaveStore } from '../store/saveStore';
import type { RegressionComparisonResult } from '../materials/regressionDiff';

/** §10.4: D04段階の日本語表示。'none'は「観測して膨張なし」であり、legacyの「記録なし」とは別物。 */
const D04_STAGE_LABEL: Record<'none' | 'swelling' | 'smoking' | 'burning', string> = {
  none: '膨張なし', swelling: '膨張', smoking: '発煙', burning: '炎上',
};

interface ExperimentNotebookProps {
  onClose: () => void;
}

const CONFIG_LABELS: Record<keyof MotorConfig, [string, string]> = {
  coilTurns: ['巻き数', '回'],
  slitWidthMm: ['スリット幅', 'mm'],
  sandingQuality: ['削り具合', '比'],
  brushPressure: ['ブラシ圧', '比'],
  magnetStrength: ['磁石強度', '比'],
  magnetDistanceMm: ['磁石距離', 'mm'],
  batteryVoltage: ['電池電圧', 'V'],
  axisOffsetMm: ['軸ずれ', 'mm'],
  wireGaugeMm: ['線径', 'mm'],
  parallelStrands: ['並列本数', '本'],
  varnished: ['ワニス', ''],
  wireResistivityRatio: ['導線抵抗率', '比'],
  wireDensityRatio: ['導線密度', '比'],
  batteryInternalResistanceRatio: ['電池内部抵抗', '比'],
  batteryCapacityRatio: ['電池容量', '比'],
  effectiveTurnsRatio: ['実効巻数(磁気結合率)', '比'],
  brushContactResistanceRatio: ['ブラシ接触抵抗', '比'],
  brushChatterProbabilityRatio: ['ブラシ接触不良確率', '比'],
};

function displayConfigValue(config: MotorConfig, key: keyof MotorConfig): string {
  const value = config[key];
  if (key === 'varnished') return (value ?? true) ? 'あり' : 'なし';
  return String(value ?? (key === 'wireGaugeMm' ? 0.4 : key === 'parallelStrands' ? 1 : '—'));
}

function SessionMetrics({ session }: { session: StoredExperimentSession }) {
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <div><dt className="text-slate-500">定常回転数</dt><dd>{session.steadyRpm.toFixed(0)} RPM</dd></div>
      <div><dt className="text-slate-500">平均電流</dt><dd>{session.averageCurrent.toFixed(3)} A</dd></div>
      <div><dt className="text-slate-500">最大電流</dt><dd>{session.maxCurrent.toFixed(3)} A</dd></div>
      <div><dt className="text-slate-500">電流比</dt><dd>{session.currentRatio.toFixed(3)}</dd></div>
      <div><dt className="text-slate-500">RPM変動係数</dt><dd>{(session.rpmVariation * 100).toFixed(2)} %</dd></div>
      <div><dt className="text-slate-500">最大発熱</dt><dd>{(session.maxBatteryHeat * 100).toFixed(1)} %</dd></div>
    </dl>
  );
}

function SessionMotorReplay({ session }: { session: StoredExperimentSession }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || session.samples.length === 0) return;
    const firstT = session.samples[0].t;
    const duration = Math.max(0.1, session.samples[session.samples.length - 1].t - firstT);
    const started = performance.now();
    let frameId = 0;

    function render(now: number) {
      const replayT = firstT + ((now - started) / 1000) % duration;
      let sample = session.samples[0];
      for (const candidate of session.samples) {
        if (candidate.t > replayT) break;
        sample = candidate;
      }
      const state: SimState = {
        theta: sample.theta,
        omega: (sample.rpm * 2 * Math.PI) / 60,
        current: sample.current,
        backEmf: sample.backEmf,
        shorted: sample.shorted,
        running: true,
        rpm: sample.rpm,
        chatterFramesLeft: sample.chattering ? 1 : 0,
        batteryHeat: sample.batteryHeat,
        coilCollapsed: sample.coilCollapsed,
        highSpeedFrameCount: 0,
      };
      drawMotor(context!, session.config, state, canvas!.width, canvas!.height);
      frameId = requestAnimationFrame(render);
    }
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [session]);

  return (
    <div>
      <canvas ref={canvasRef} width={320} height={240} className="w-full rounded-lg bg-slate-100" />
      <p className="mt-1 text-center text-xs text-slate-400">記録した時系列をループ再生</p>
    </div>
  );
}

function ConfigTable({ config }: { config: MotorConfig }) {
  return (
    <dl className="grid gap-1 text-sm">
      {(Object.keys(CONFIG_LABELS) as (keyof MotorConfig)[]).map((key) => {
        const [label, unit] = CONFIG_LABELS[key];
        return <div key={key} className="flex justify-between gap-3"><dt>{label}</dt><dd className="tabular-nums">{displayConfigValue(config, key)} {unit}</dd></div>;
      })}
    </dl>
  );
}

function SessionDetail({ session }: { session: StoredExperimentSession }) {
  // P3-4 G7(§10.4): D04段階は**当該セッションの記録としてのみ**表示する。
  // legacy record(finalDestructionStateを持たない)は「膨張なし」と断定せず中立文言にする
  // ——記録していないことと、観測して膨張が無かったことは別の事実である。
  const d04 = describeD04Stage(session.finalDestructionState);
  return (
    <div className="grid gap-4">
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <span className="font-bold">電池の状態(この走行の記録)</span>{' '}
        {d04.kind === 'unrecorded' ? (
          <span className="text-slate-500">{d04.note}</span>
        ) : (
          <span>{D04_STAGE_LABEL[d04.value]}</span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SessionMotorReplay session={session} />
        <div>
          <h4 className="mb-2 text-sm font-bold text-slate-700">モーターパラメータ</h4>
          <ConfigTable config={session.config} />
        </div>
      </div>
      <SessionMetrics session={session} />
      <div className="h-52 w-full" aria-label="セッション時系列グラフ">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={session.samples}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tickFormatter={(value) => `${Number(value).toFixed(0)}秒`} />
            <YAxis yAxisId="rpm" />
            <YAxis yAxisId="current" orientation="right" />
            <Tooltip />
            <Legend />
            <Line yAxisId="rpm" type="monotone" dataKey="rpm" name="RPM" stroke="#d97706" dot={false} />
            <Line yAxisId="current" type="monotone" dataKey="current" name="電流(A)" stroke="#0284c7" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div>
        <h4 className="text-sm font-bold">イベント</h4>
        {session.events.length === 0 ? <p className="text-sm text-slate-500">記録なし</p> : (
          <ul className="text-sm text-slate-700">
            {session.events.map((event, index) => <li key={`${event.type}-${index}`}>{event.t.toFixed(1)}秒: {event.type}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

function Comparison({ first, second }: { first: StoredExperimentSession; second: StoredExperimentSession }) {
  const chartData = useMemo(() => {
    const length = Math.max(first.samples.length, second.samples.length);
    return Array.from({ length }, (_, index) => ({
      t: first.samples[index]?.t ?? second.samples[index]?.t ?? index,
      A: first.samples[index]?.rpm,
      B: second.samples[index]?.rpm,
    }));
  }, [first, second]);

  return (
    <section className="grid gap-4 rounded-lg border border-violet-200 bg-violet-50 p-4">
      <h3 className="font-bold text-violet-950">A/B比較</h3>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="t" /><YAxis /><Tooltip /><Legend />
            <Line type="monotone" dataKey="A" name="A: RPM" stroke="#7c3aed" dot={false} />
            <Line type="monotone" dataKey="B" name="B: RPM" stroke="#059669" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr><th className="text-left">項目</th><th>A</th><th>B</th><th>差(B−A)</th></tr></thead>
          <tbody>
            {[
              ['定常RPM', first.steadyRpm, second.steadyRpm, 'RPM'],
              ['平均電流', first.averageCurrent, second.averageCurrent, 'A'],
              ['最大発熱', first.maxBatteryHeat, second.maxBatteryHeat, ''],
              ['RPM変動係数', first.rpmVariation, second.rpmVariation, ''],
            ].map(([label, a, b, unit]) => (
              <tr key={String(label)} className="border-t border-violet-200">
                <th className="py-1 text-left font-normal">{label}</th><td className="text-center">{Number(a).toFixed(3)}</td>
                <td className="text-center">{Number(b).toFixed(3)}</td><td className="text-center">{(Number(b) - Number(a)).toFixed(3)} {unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CourseComparison({ first, second }: { first: CourseRunNotebookRecord; second: CourseRunNotebookRecord }) {
  const chartData = useMemo(() => {
    const length = Math.max(first.samples.length, second.samples.length);
    return Array.from({ length }, (_, index) => ({
      t: first.samples[index]?.t ?? second.samples[index]?.t ?? index,
      speedA: first.samples[index]?.velocityMps,
      speedB: second.samples[index]?.velocityMps,
    }));
  }, [first, second]);
  return <section className="rounded-lg border border-sky-200 bg-sky-50 p-4">
    <h3 className="font-bold text-sky-950">コース走行 A/B比較</h3>
    <div className="mt-3 h-52 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}>
      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="t" /><YAxis /><Tooltip /><Legend />
      <Line dataKey="speedA" name="A: 速度 (m/s)" stroke="#7c3aed" dot={false} />
      <Line dataKey="speedB" name="B: 速度 (m/s)" stroke="#059669" dot={false} />
    </LineChart></ResponsiveContainer></div>
    <div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><b>A</b> {first.elapsedTimeS.toFixed(2)} 秒 / {first.energyUsedJ.toFixed(2)} J</div><div><b>B</b> {second.elapsedTimeS.toFixed(2)} 秒 / {second.energyUsedJ.toFixed(2)} J</div></div>
  </section>;
}

/**
 * 同一構成の過去記録との比較を1行で示す(§11.2)。3腕で同じ規律を使うため共通化する。
 * `null`は「比較できなかった」であり「悪化なし」ではない——言い換えは
 * `formatRegressionReport`側に閉じており、ここで三項演算子により潰さないこと。
 */
function RegressionLine({ report }: { report: RegressionComparisonResult | null }) {
  return <p className="mt-1 text-xs text-slate-600">{formatRegressionReport(report)}</p>;
}

export function ExperimentNotebook({ onClose }: ExperimentNotebookProps) {
  const sessions = useNotebookStore((s) => s.sessions);
  const courseRuns = useNotebookStore((s) => s.courseRuns);
  // 車体テスト走行はnotebookStoreの鏡像対象外のため、保持元のsaveStoreから直接読む
  // (読み取り専用。新規actionや新規契約は追加していない)。
  const vehicleTestRuns = useSaveStore((s) => s.notebook.vehicleTestRuns);
  const replaceSessions = useNotebookStore((s) => s.replaceSessions);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [courseCompareIds, setCourseCompareIds] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const detail = sessions.find((session) => session.id === detailId) ?? null;
  // §11.2(三段開示 段階2): 同一構成の過去記録と比べた低下を**事実だけ**提示する。
  // 全件をそのまま渡してよい——当該run自身の除外はcomputeRegressionReport側がrecord idで行う。
  //
  // **3腕すべてで呼ぶ**(§11.2・G6追加裁定の3腕×metric契約)。腕ごとのmetricと成立条件
  // (session=steadyRpm全件 / courseRun=lapTimeS・finishedのみ / vehicleTestRun=topSpeedMps・
  // finishedかつsamples非空)は`regressionObservation.ts`が持つ。ここで条件を再実装しない。
  const sessionRecords = sessions.map((session): NotebookRecordForRegression => ({ kind: 'session', record: session }));
  const courseRunRecords = courseRuns.map((record): NotebookRecordForRegression => ({ kind: 'courseRun', record }));
  const vehicleTestRunRecords = vehicleTestRuns.map((record): NotebookRecordForRegression => ({ kind: 'vehicleTestRun', record }));
  const regressionReport = detail === null
    ? null
    : computeRegressionReport({ kind: 'session', record: detail }, sessionRecords);
  const comparison = compareIds.map((id) => sessions.find((session) => session.id === id)).filter(Boolean) as StoredExperimentSession[];
  const courseComparison = courseCompareIds.map((id) => courseRuns.find((record) => record.id === id)).filter(Boolean) as CourseRunNotebookRecord[];

  function exportJson() {
    const blob = new Blob([stringifyNotebook(sessions)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `motor-notebook-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mx-auto grid max-w-2xl gap-4 p-4" aria-labelledby="notebook-title">
      <div className="flex items-center justify-between"><h2 id="notebook-title" className="text-xl font-bold">実験ノート</h2><button onClick={onClose} className="text-sm underline">閉じる</button></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={exportJson} className="rounded bg-slate-700 px-3 py-2 text-sm font-bold text-white">JSON書き出し</button>
        <label className="cursor-pointer rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold">
          JSON読み込み<input type="file" accept="application/json" className="sr-only" onChange={async (event) => {
            const file = event.target.files?.[0]; if (!file) return;
            try {
              const parsed = parseNotebookJson(await file.text());
              const result = replaceSessions(parsed);
              setImportError(result.ok ? null : result.reason);
            } catch (error) { setImportError(error instanceof Error ? error.message : '読み込みに失敗しました。'); }
            event.target.value = '';
          }} />
        </label>
      </div>
      {importError && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{importError}</p>}
      <section className="grid gap-2">
        <h3 className="font-bold text-slate-900">車体付きコース走行</h3>
        {courseComparison.length === 2 && <CourseComparison first={courseComparison[0]} second={courseComparison[1]} />}
        {courseRuns.length === 0 && <p className="rounded bg-white p-4 text-sm text-slate-500">コース走行の保存記録はまだありません。</p>}
        {courseRuns.map((record) => {
          const selected = courseCompareIds.includes(record.id);
          const trackName = TRACK_BY_ID.get(record.trackId)?.name ?? record.trackId;
          return <article key={record.id} className="rounded-lg border border-sky-100 bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h4 className="font-bold">{trackName}</h4><p className="text-sm text-slate-600">{record.elapsedTimeS.toFixed(2)} 秒 / {record.energyUsedJ.toFixed(2)} J / {record.positionM.toFixed(2)} m</p><p className="text-xs text-slate-400">{new Date(record.savedAt).toLocaleString('ja-JP')} / seed {record.seed}</p></div><label className="text-sm"><input type="checkbox" checked={selected} onChange={() => setCourseCompareIds((ids) => selected ? ids.filter((id) => id !== record.id) : ids.length < 2 ? [...ids, record.id] : [ids[1], record.id])} /> 比較</label></div>
            <RegressionLine report={computeRegressionReport({ kind: 'courseRun', record }, courseRunRecords)} />
          </article>;
        })}
      </section>
      <section className="grid gap-2">
        <h3 className="font-bold text-slate-900">車体テスト走行</h3>
        {vehicleTestRuns.length === 0 && <p className="rounded bg-white p-4 text-sm text-slate-500">車体テスト走行の保存記録はまだありません。</p>}
        {vehicleTestRuns.map((record) => (
          <article key={record.id} className="rounded-lg border border-emerald-100 bg-white p-3 shadow-sm">
            <p className="text-sm text-slate-600">{record.elapsedTimeS.toFixed(2)} 秒 / {record.positionM.toFixed(2)} m / {record.energyUsedJ.toFixed(2)} J</p>
            <p className="text-xs text-slate-400">{new Date(record.savedAt).toLocaleString('ja-JP')} / seed {record.seed}</p>
            <RegressionLine report={computeRegressionReport({ kind: 'vehicleTestRun', record }, vehicleTestRunRecords)} />
          </article>
        ))}
      </section>
      {comparison.length === 2 && <Comparison first={comparison[0]} second={comparison[1]} />}
      {detail && <section className="rounded-lg bg-white p-4 shadow-sm"><div className="mb-3 flex justify-between"><h3 className="font-bold">詳細: {new Date(detail.startedAt).toLocaleString('ja-JP')}</h3><button onClick={() => setDetailId(null)} className="text-sm underline">閉じる</button></div><SessionDetail session={detail} />
        <h4 className="mt-3 text-sm font-bold text-slate-700">同じ構成の過去記録との比較</h4>
        <RegressionLine report={regressionReport} />
      </section>}
      <div className="grid gap-2">
        {sessions.length === 0 && <p className="rounded bg-white p-4 text-sm text-slate-500">まだ記録がありません。モーターを始動し、リセットすると保存されます。</p>}
        {sessions.map((session) => {
          const selected = compareIds.includes(session.id);
          const config = session.config;
          return <article key={session.id} className="rounded-lg bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{new Date(session.startedAt).toLocaleString('ja-JP')}</h3><p className="text-sm text-slate-500">{session.steadyRpm.toFixed(0)} RPM / {session.averageCurrent.toFixed(3)} A / seed {session.seed}</p><p className="mt-1 text-xs text-slate-500">{config.coilTurns}回・線径{config.wireGaugeMm ?? 0.4} mm・{config.parallelStrands ?? 1}本・磁石{config.magnetStrength.toFixed(2)}・距離{config.magnetDistanceMm} mm・{config.batteryVoltage} V・ワニス{(config.varnished ?? true) ? 'あり' : 'なし'}</p></div><div className="flex gap-2"><button onClick={() => setDetailId(session.id)} className="text-sm underline">詳細</button><label className="text-sm"><input type="checkbox" checked={selected} onChange={() => setCompareIds((ids) => selected ? ids.filter((id) => id !== session.id) : ids.length < 2 ? [...ids, session.id] : [ids[1], session.id])} /> 比較</label></div></div></article>;
        })}
      </div>
    </section>
  );
}
