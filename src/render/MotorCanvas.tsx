import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { drawMotor } from './drawMotor';

// spec docs/spec.md §3: 固定タイムステップ。描画は60fps、物理ステップは1フレーム最大2回。
const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 2;
const MAX_FRAME_SECONDS = 0.25; // タブ非表示からの復帰時などの巨大dtを吸収する

export function MotorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;
    let lastTime = performance.now();
    let accumulator = 0;

    const loop = (now: number) => {
      const elapsed = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
      lastTime = now;
      accumulator += elapsed;

      const { stepSim } = useGameStore.getState();
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        stepSim(FIXED_DT);
        accumulator -= FIXED_DT;
        steps++;
      }

      const { config, simState } = useGameStore.getState();
      drawMotor(ctx, config, simState, canvas.width, canvas.height);

      animationFrame = requestAnimationFrame(loop);
    };

    animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={240}
      className="w-full max-w-md rounded-lg bg-slate-100"
    />
  );
}
