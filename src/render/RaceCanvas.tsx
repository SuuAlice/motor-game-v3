import { useEffect, useRef } from 'react';
import { TEST_RUN_COURSE_LENGTH_M, useGameStore } from '../store/gameStore';
import { drawRace } from './drawRace';
import { CarSprite } from './CarSprite';
import { IndoorCourseDecor } from './IndoorCourseDecor';
import { resolveGarageColors } from '../data/partPresets';
import { RaceEffects } from './RaceEffects';

const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 2;

export function RaceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let frame = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    const loop = (now: number) => {
      accumulator += Math.min((now - lastTime) / 1000, 0.25);
      lastTime = now;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        useGameStore.getState().stepTestRun(FIXED_DT);
        accumulator -= FIXED_DT;
        steps += 1;
      }
      const { vehicleState } = useGameStore.getState();
      drawRace(ctx, vehicleState, TEST_RUN_COURSE_LENGTH_M, canvas.width, canvas.height);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const vehicleState = useGameStore((s) => s.vehicleState);
  const testRunPhase = useGameStore((s) => s.testRunPhase);
  const carConfig = useGameStore((s) => s.carConfig);
  const config = useGameStore((s) => s.config);
  const garageSelection = useGameStore((s) => s.garageSelection);
  const colors = resolveGarageColors(garageSelection);
  const launchTravel = Math.min(1, Math.max(0, vehicleState.positionM / 0.8));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-sky-50 shadow-sm">
      <canvas ref={canvasRef} width={720} height={360} className="block w-full" aria-label="走行画面" />
      <div className="pointer-events-none absolute inset-0">
        <IndoorCourseDecor positionM={vehicleState.positionM} />
      </div>
      <RaceEffects vehicle={vehicleState} active={testRunPhase === 'running'} />
      {vehicleState.motor.batteryHeat >= 0.65 && (
        <div className="pointer-events-none absolute left-3 top-[4.2rem] z-20 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-black text-red-800">
          ⚠ 発熱
        </div>
      )}
      <div
        className="pointer-events-none absolute w-[48%] max-w-[350px]"
        style={{ left: `${5 + launchTravel * 18}%`, bottom: '8%', transform: vehicleState.status === 'derailed' ? 'translateY(30px) rotate(18deg)' : undefined }}
      >
        <CarSprite
          wheelDiameterMm={carConfig.wheelDiameterMm}
          batteryPositionPreset={garageSelection.batteryPosition}
          appearance={colors}
          wheelAngleRad={vehicleState.motor.theta / carConfig.gearRatio}
          motorAngleRad={vehicleState.motor.theta}
          isSlipping={vehicleState.isSlipping}
          vibrationOffset={Math.sin(vehicleState.elapsedTimeS * 48) * (config.axisOffsetMm + vehicleState.coilCollapsePenaltyMm) * 0.7}
          currentIntensity={testRunPhase === 'running' ? Math.min(1, vehicleState.motor.current / 2) : 0}
        />
      </div>
    </div>
  );
}
