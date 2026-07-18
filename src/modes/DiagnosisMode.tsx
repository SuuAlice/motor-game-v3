import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { BROKEN_MOTORS, type BrokenMotor } from '../data/brokenMotors';
import { diagnoseFailures } from '../engine/failures';
import { DIAGNOSIS_HEALTHY_RPM } from '../engine/constants';
import { MotorCanvas } from '../render/MotorCanvas';
import { RpmMeter } from '../components/RpmMeter';
import { ParamPanel } from '../components/ParamPanel';
import { ControlBar } from '../components/ControlBar';
import { ObservationPanel } from '../components/ObservationPanel';

function BrokenMotorList({ onSelect }: { onSelect: (brokenMotor: BrokenMotor) => void }) {
  const diagnosisProgress = useGameStore((s) => s.diagnosisProgress);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h2 className="text-lg font-bold text-slate-800">トラブル診断</h2>
      <p className="text-sm text-slate-600">
        「回らないモーター」が渡されます。原因を観察して、動かせるパラメータを直そう。
      </p>
      {BROKEN_MOTORS.map((brokenMotor) => {
        const solved = diagnosisProgress[brokenMotor.id] ?? false;
        return (
          <button
            key={brokenMotor.id}
            type="button"
            onClick={() => onSelect(brokenMotor)}
            className="flex items-center justify-between rounded-lg bg-white p-3 text-left shadow-sm"
          >
            <span className="font-bold text-slate-800">{brokenMotor.title}</span>
            {solved ? (
              <span className="flex items-center gap-1 text-sm font-bold text-emerald-600">
                <span aria-hidden="true">✅</span>なおった
              </span>
            ) : (
              <span className="text-sm text-slate-400">未診断</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DiagnosisPlay({ brokenMotor, onExit }: { brokenMotor: BrokenMotor; onExit: () => void }) {
  const startDiagnosis = useGameStore((s) => s.startDiagnosis);
  const config = useGameStore((s) => s.config);
  const simState = useGameStore((s) => s.simState);
  const history = useGameStore((s) => s.history);
  const lockedKeys = useGameStore((s) => s.lockedKeys);
  const recordDiagnosisSolved = useGameStore((s) => s.recordDiagnosisSolved);

  useEffect(() => {
    startDiagnosis(brokenMotor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokenMotor.id]);

  const diagnosis = useMemo(
    () => diagnoseFailures(config, history, lockedKeys)[0] ?? null,
    [config, history, lockedKeys],
  );
  const fixed = diagnosis === null && simState.rpm >= DIAGNOSIS_HEALTHY_RPM;

  useEffect(() => {
    if (fixed) recordDiagnosisSolved(brokenMotor.id);
  }, [fixed, brokenMotor.id, recordDiagnosisSolved]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-4">
      <div className="flex w-full items-center justify-between">
        <button type="button" onClick={onExit} className="text-sm text-slate-500 underline">
          ← 診断一覧
        </button>
      </div>
      <h2 className="text-lg font-bold text-slate-800">{brokenMotor.title}</h2>
      <p className="text-sm text-slate-600">「始動」して症状を観察し、動かせるパラメータを直してみよう。</p>
      {fixed && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-100 px-4 py-2 font-bold text-emerald-700">
          <span aria-hidden="true">✅</span>
          <span>なおった!</span>
        </div>
      )}
      <MotorCanvas />
      <RpmMeter />
      <ParamPanel />
      <ControlBar />
      <ObservationPanel />
    </div>
  );
}

export function DiagnosisMode() {
  const [selected, setSelected] = useState<BrokenMotor | null>(null);
  const stopDiagnosis = useGameStore((s) => s.stopDiagnosis);

  if (!selected) {
    return <BrokenMotorList onSelect={setSelected} />;
  }

  return (
    <DiagnosisPlay
      brokenMotor={selected}
      onExit={() => {
        stopDiagnosis();
        setSelected(null);
      }}
    />
  );
}
