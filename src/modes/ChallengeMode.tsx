import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CHALLENGES, type Challenge } from '../data/challenges';
import { evaluateConditions } from '../data/challengeEvaluation';
import { MotorCanvas } from '../render/MotorCanvas';
import { RpmMeter } from '../components/RpmMeter';
import { ParamPanel } from '../components/ParamPanel';
import { ControlBar } from '../components/ControlBar';
import { GraphPanel } from '../components/GraphPanel';
import { ObservationPanel } from '../components/ObservationPanel';

function conditionSummary(challenge: Challenge): string {
  const condition = challenge.conditions;
  const parts = [`${condition.targetRpm} RPM以上を${condition.durationSec}秒`];
  if (condition.maxCurrentA !== undefined) parts.push(`最大${condition.maxCurrentA} A`);
  if (condition.maxBatteryHeat !== undefined) parts.push(`発熱${condition.maxBatteryHeat * 100}%以下`);
  if (condition.maxRpmVariation !== undefined) parts.push(`変動係数${condition.maxRpmVariation * 100}%以下`);
  if (condition.noCoilCollapse) parts.push('コイル崩壊なし');
  return parts.join(' / ');
}

function ChallengeList({ onSelect }: { onSelect: (challenge: Challenge) => void }) {
  const progress = useGameStore((s) => s.progress);
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-4">
      {(['classic', 'ex'] as const).map((kind) => (
        <section key={kind} className="grid gap-3">
          <div><h2 className="text-lg font-bold text-slate-800">{kind === 'classic' ? 'クラシック' : 'EXチャレンジ'}</h2><p className="text-xs text-slate-500">{kind === 'classic' ? 'v1.0の縛りを新物理で再計算' : '複合条件をすべて満たす設計課題'}</p></div>
          {CHALLENGES.filter((challenge) => challenge.kind === kind).map((challenge) => {
            const record = progress[challenge.id];
            return <button key={challenge.id} type="button" onClick={() => onSelect(challenge)} className="rounded-lg bg-white p-3 text-left shadow-sm"><div className="flex justify-between gap-3"><span className="font-bold text-slate-800">{challenge.title}</span><span className={record?.completed ? 'text-emerald-600' : 'text-slate-400'}>{record?.completed ? '達成済み' : '未達成'}</span></div><p className="mt-1 text-sm text-slate-600">{challenge.description}</p><p className="mt-2 text-xs text-slate-500">{conditionSummary(challenge)}</p>{record && <p className="mt-1 text-xs text-violet-700">自己ベスト {record.bestRpm.toFixed(0)} RPM / {record.bestAverageCurrentA.toFixed(3)} A</p>}</button>;
          })}
        </section>
      ))}
    </div>
  );
}

function ChallengePlay({ challenge, onExit }: { challenge: Challenge; onExit: () => void }) {
  const startChallenge = useGameStore((s) => s.startChallenge);
  const history = useGameStore((s) => s.history);
  const recordResult = useGameStore((s) => s.recordChallengeResult);
  useEffect(() => { startChallenge(challenge); }, [challenge.id, startChallenge, challenge]);
  const result = useMemo(() => evaluateConditions(history, challenge.conditions), [history, challenge.conditions]);
  useEffect(() => { if (result.completed) recordResult(challenge.id, result.averageRpm, result.averageCurrentA); }, [result.completed, result.averageRpm, result.averageCurrentA, challenge.id, recordResult]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-4">
      <div className="flex w-full justify-between"><button onClick={onExit} className="text-sm underline">← 一覧</button><span className={result.completed ? 'font-bold text-emerald-600' : 'text-slate-500'}>{result.completed ? '全条件達成' : '計測中／未達成'}</span></div>
      <h2 className="text-lg font-bold">{challenge.title}</h2><p className="text-sm text-slate-600">{challenge.description}</p>
      <div className="w-full rounded bg-slate-100 p-3 text-xs text-slate-700"><p>{conditionSummary(challenge)}</p><p className="mt-1">計測: 最低 {result.minimumRpm.toFixed(0)} RPM / 最大 {result.maximumCurrentA.toFixed(3)} A / 発熱 {(result.maximumBatteryHeat * 100).toFixed(1)}% / 変動 {(result.rpmVariation * 100).toFixed(2)}%</p></div>
      <MotorCanvas /><RpmMeter /><ParamPanel /><ControlBar /><ObservationPanel /><GraphPanel />
    </div>
  );
}

export function ChallengeMode() {
  const [selected, setSelected] = useState<Challenge | null>(null);
  const stopChallenge = useGameStore((s) => s.stopChallenge);
  if (!selected) return <ChallengeList onSelect={setSelected} />;
  return <ChallengePlay challenge={selected} onExit={() => { stopChallenge(); setSelected(null); }} />;
}
