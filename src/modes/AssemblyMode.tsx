import { useState } from 'react';
import type { MotorConfig } from '../engine/motorPhysics';
import {
  INITIAL_WINDING_STEP_STATE,
  windingStepReducer,
  type WindingStepAction,
  type WindingStepState,
} from '../components/assembly/windingStepState';
import { CoilWindingStep } from '../components/assembly/CoilWindingStep';
import { SandingStep } from '../components/assembly/SandingStep';
import { SlitStep } from '../components/assembly/SlitStep';
import { AxisStep } from '../components/assembly/AxisStep';
import { ClipStep } from '../components/assembly/ClipStep';
import { AssemblyReviewStep } from '../components/assembly/AssemblyReviewStep';
import { StartStep } from '../components/assembly/StartStep';
import { VarnishStep } from '../components/assembly/VarnishStep';

// spec docs/spec.md §2「① 組み立てモードの手順」。手順3(整流子作り)は
// 「やすりがけ」「スリット調整」を別々の工程画面として実装する(ジェスチャーごとに
// 独立して動作確認するため。spec上は1手順だが実装上は分割してよい)。
export interface AssemblyStepProps {
  draft: MotorConfig;
  setDraft: (updater: (prev: MotorConfig) => MotorConfig) => void;
  /**
   * P4-1B B2: 巻線工程の状態。`draft`(MotorConfig)では巻線記録を運べない——
   * `coilTurns`はスカラーであり、位置・腕・方向・張力の列を持たないため。
   */
  winding: WindingStepState;
  dispatchWinding: (action: WindingStepAction) => void;
}

interface StepDef {
  title: string;
  Component: (props: AssemblyStepProps) => React.ReactElement;
}

const STEPS: StepDef[] = [
  { title: '① コイル巻き', Component: CoilWindingStep },
  { title: '② ワニス固め', Component: VarnishStep },
  { title: '③ 軸の固定', Component: AxisStep },
  { title: '③ 整流子作り(やすりがけ)', Component: SandingStep },
  { title: '③ 整流子作り(スリット調整)', Component: SlitStep },
  { title: '④ 台座作り', Component: ClipStep },
  { title: '⑤ 組み立て', Component: AssemblyReviewStep },
  { title: '⑥ 始動', Component: StartStep },
];

// 「まだ何も作っていない」に近い初期値(有効範囲内の最小・未調整寄りの値)。
// 各工程で少しずつ埋めていき、最終工程(始動)でgameStoreへコミットする。
const INITIAL_DRAFT: MotorConfig = {
  coilTurns: 10,
  slitWidthMm: 0,
  sandingQuality: 0,
  brushPressure: 0.3,
  magnetStrength: 0.5,
  magnetDistanceMm: 15,
  batteryVoltage: 3.0,
  axisOffsetMm: 0,
  wireGaugeMm: 0.4,
  parallelStrands: 1,
  varnished: false,
};

export function AssemblyMode() {
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraftState] = useState<MotorConfig>(INITIAL_DRAFT);
  const [winding, setWinding] = useState<WindingStepState>(INITIAL_WINDING_STEP_STATE);

  function dispatchWinding(action: WindingStepAction) {
    setWinding((prev) => windingStepReducer(prev, action));
  }

  function setDraft(updater: (prev: MotorConfig) => MotorConfig) {
    setDraftState((prev) => updater(prev));
  }

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h2 className="text-lg font-bold text-slate-800">組み立てモード</h2>
      <p className="text-sm text-slate-500">
        工程 {stepIndex + 1} / {STEPS.length}: {step.title}
      </p>

      <step.Component draft={draft} setDraft={setDraft} winding={winding} dispatchWinding={dispatchWinding} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className="flex-1 rounded-lg bg-slate-200 px-4 py-2 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          もどる
        </button>
        <button
          type="button"
          onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
          disabled={isLast}
          className="flex-1 rounded-lg bg-amber-600 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          つぎへ
        </button>
      </div>
    </div>
  );
}
