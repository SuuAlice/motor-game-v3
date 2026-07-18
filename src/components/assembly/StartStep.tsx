import { useEffect, useRef, useState } from 'react';
import type { AssemblyStepProps } from '../../modes/AssemblyMode';
import { useFlickGesture } from './useFlickGesture';
import { useGameStore } from '../../store/gameStore';
import { drawMotor } from '../../render/drawMotor';
import type { SimState } from '../../engine/motorPhysics';
import { MotorCanvas } from '../../render/MotorCanvas';
import { RpmMeter } from '../RpmMeter';
import { ObservationPanel } from '../ObservationPanel';

// px/msの速度をrad/sの初期omegaへ変換する係数。MAX_FLICK_OMEGA付近まで
// 出せる強めのフリックを想定して選んだ(engine/constants.tsのMAX_FLICK_OMEGAで
// 最終的にクランプされる)
const FLICK_VELOCITY_SCALE = 15;

const PREVIEW_REST_STATE: SimState = {
  theta: 0,
  omega: 0,
  current: 0,
  backEmf: 0,
  shorted: false,
  running: true,
  rpm: 0,
  chatterFramesLeft: 0,
  batteryHeat: 0,
  coilCollapsed: false,
  highSpeedFrameCount: 0,
};

export function StartStep({ draft }: AssemblyStepProps) {
  const [started, setStarted] = useState(false);
  const finishAssembly = useGameStore((s) => s.finishAssembly);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (started) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawMotor(ctx, draft, PREVIEW_REST_STATE, canvas.width, canvas.height);
  }, [draft, started]);

  const flickHandlers = useFlickGesture((velocityPxPerMs) => {
    finishAssembly(draft, velocityPxPerMs * FLICK_VELOCITY_SCALE);
    setStarted(true);
  });

  if (!started) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          軸受けに軸を乗せ、モーターの準備ができた。指ではじいて回してみよう。
        </p>
        <p className="text-xs text-slate-400">逆向きに弾いてみよう。どっちに回る?</p>
        <canvas
          ref={canvasRef}
          width={320}
          height={240}
          {...flickHandlers}
          className="w-full max-w-md touch-none select-none rounded-lg bg-slate-100"
        />
      </div>
    );
  }

  return <StartedMotor />;
}

function StartedMotor() {
  return (
    <div className="flex flex-col items-center gap-3">
      <MotorCanvas />
      <RpmMeter />
      <ObservationPanel />
    </div>
  );
}
