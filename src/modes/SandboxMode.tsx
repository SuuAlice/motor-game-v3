import { MotorCanvas } from '../render/MotorCanvas';
import { RpmMeter } from '../components/RpmMeter';
import { ParamPanel } from '../components/ParamPanel';
import { ControlBar } from '../components/ControlBar';
import { GraphPanel } from '../components/GraphPanel';

// spec docs/spec.md §4のレイアウト順: Canvas → RPM/電流 → パラメータ → 始動/リセット → グラフ
export function SandboxMode() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-4">
      <MotorCanvas />
      <RpmMeter />
      <ParamPanel />
      <ControlBar />
      <GraphPanel />
    </div>
  );
}
