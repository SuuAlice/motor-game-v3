import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CHALLENGES, type Challenge } from '../data/challenges';
import { evaluateChallenge } from '../engine/scoring';
import { diagnoseFailures } from '../engine/failures';
import { MotorCanvas } from '../render/MotorCanvas';
import { RpmMeter } from '../components/RpmMeter';
import { ParamPanel } from '../components/ParamPanel';
import { ControlBar } from '../components/ControlBar';
import { GraphPanel } from '../components/GraphPanel';
import { HintPopup } from '../components/HintPopup';

function StarDisplay({ stars }: { stars: 0 | 1 | 2 | 3 }) {
  return (
    <span aria-label={`星${stars}個`} className="text-lg leading-none">
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= stars ? 'text-amber-500' : 'text-slate-300'}>
          ★
        </span>
      ))}
    </span>
  );
}

function ChallengeList({ onSelect }: { onSelect: (challenge: Challenge) => void }) {
  const progress = useGameStore((s) => s.progress);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h2 className="text-lg font-bold text-slate-800">調整チャレンジ</h2>
      <p className="text-sm text-slate-600">
        いくつかのパラメータが固定されています。壊れない・ブレない範囲で目標の回転数を目指そう。
      </p>
      {CHALLENGES.map((challenge) => {
        const bestStars = progress[challenge.id]?.bestStars ?? 0;
        return (
          <button
            key={challenge.id}
            type="button"
            onClick={() => onSelect(challenge)}
            className="rounded-lg bg-white p-3 text-left shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">{challenge.title}</span>
              <StarDisplay stars={bestStars} />
            </div>
            <p className="mt-1 text-sm text-slate-600">{challenge.description}</p>
            <p className="mt-1 text-xs text-slate-400">目標: {challenge.targetRpm} RPM 以上を10秒間キープ</p>
          </button>
        );
      })}
    </div>
  );
}

function ChallengePlay({ challenge, onExit }: { challenge: Challenge; onExit: () => void }) {
  const startChallenge = useGameStore((s) => s.startChallenge);
  const config = useGameStore((s) => s.config);
  const history = useGameStore((s) => s.history);
  const lockedKeys = useGameStore((s) => s.lockedKeys);
  const recordChallengeResult = useGameStore((s) => s.recordChallengeResult);

  // チャレンジを選んだ瞬間に一度だけlockedParamsを適用し、simStateをリセットする
  useEffect(() => {
    startChallenge(challenge);
    // challenge.idが変わったときだけ再実行すればよい(startChallenge自体は毎回同じ参照ではない)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.id]);

  const result = useMemo(
    () => evaluateChallenge(history, challenge.targetRpm, challenge.star3MaxAvgCurrentA),
    [history, challenge],
  );

  useEffect(() => {
    if (result.stars > 0) recordChallengeResult(challenge.id, result.stars);
  }, [result.stars, challenge.id, recordChallengeResult]);

  const diagnosis = useMemo(
    () => diagnoseFailures(config, history, lockedKeys)[0] ?? null,
    [config, history, lockedKeys],
  );

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-4">
      <div className="flex w-full items-center justify-between">
        <button type="button" onClick={onExit} className="text-sm text-slate-500 underline">
          ← チャレンジ一覧
        </button>
        <StarDisplay stars={result.stars} />
      </div>
      <h2 className="text-lg font-bold text-slate-800">{challenge.title}</h2>
      <p className="text-center text-sm text-slate-600">{challenge.description}</p>
      <p className="text-sm text-slate-700">目標: {challenge.targetRpm} RPM 以上を10秒間キープ</p>
      <MotorCanvas />
      <RpmMeter />
      <ParamPanel />
      <ControlBar />
      <HintPopup diagnosis={diagnosis} />
      <GraphPanel />
    </div>
  );
}

export function ChallengeMode() {
  const [selected, setSelected] = useState<Challenge | null>(null);
  const stopChallenge = useGameStore((s) => s.stopChallenge);

  if (!selected) {
    return <ChallengeList onSelect={setSelected} />;
  }

  return (
    <ChallengePlay
      challenge={selected}
      onExit={() => {
        stopChallenge();
        setSelected(null);
      }}
    />
  );
}
