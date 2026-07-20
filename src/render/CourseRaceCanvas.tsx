import { useEffect, useRef } from 'react';
import { TRACK_BY_ID } from '../data/tracks';
import { useGameStore } from '../store/gameStore';
import { CarSprite } from './CarSprite';
import { drawRace } from './drawRace';
import { IndoorCourseDecor } from './IndoorCourseDecor';
import { resolveSegmentAt } from '../engine/trackPhysics';

const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 2;

export function CourseRaceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedTrackId = useGameStore((state) => state.selectedTrackId);
  const vehicleState = useGameStore((state) => state.vehicleState);
  const carConfig = useGameStore((state) => state.carConfig);
  const config = useGameStore((state) => state.config);
  const track = TRACK_BY_ID.get(selectedTrackId);
  const courseLengthM = track?.segments.reduce((sum, segment) => sum + segment.lengthM, 0) ?? 10;
  const currentSegment = track ? resolveSegmentAt(track, vehicleState.positionM)?.segment : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    const loop = () => {
      const requestedSteps = useGameStore.getState().courseRunSpeed;
      const stepsThisFrame = Math.min(requestedSteps, MAX_STEPS_PER_FRAME);
      for (let steps = 0; steps < stepsThisFrame; steps += 1) {
        useGameStore.getState().stepCourseRun(FIXED_DT);
      }
      const state = useGameStore.getState().vehicleState;
      const activeTrack = TRACK_BY_ID.get(useGameStore.getState().selectedTrackId);
      const activeSegment = activeTrack ? resolveSegmentAt(activeTrack, state.positionM)?.segment : undefined;
      const activeVisualSegment = activeSegment
        ? activeTrack?.id === 'rough-board'
          ? { ...activeSegment, roughness: Math.max(0.75, activeSegment.roughness), hasEnergyBudget: activeTrack.hasEnergyBudget }
          : { ...activeSegment, hasEnergyBudget: activeTrack?.hasEnergyBudget }
        : undefined;
      drawRace(ctx, state, courseLengthM, canvas.width, canvas.height, activeVisualSegment, false);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [courseLengthM]);

  const launchTravel = Math.min(1, Math.max(0, vehicleState.positionM / 0.8));
  const bumpPitchDeg = currentSegment && currentSegment.roughness >= 0.5
      ? Math.sin(vehicleState.positionM * 18) * 1.2
      : 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-sky-50 shadow-sm">
      <canvas ref={canvasRef} width={720} height={360} className="block w-full" />
      <div className="pointer-events-none absolute inset-0"><IndoorCourseDecor positionM={vehicleState.positionM} /></div>
      <div className="pointer-events-none absolute left-3 top-[4.2rem] z-20 flex flex-col items-start gap-2">
        <div className="rounded-lg bg-slate-900/80 px-3 py-1.5 text-xs font-black text-white">
          {currentSegment?.curveRadiusM !== undefined ? '⌁ カーブ区間' : currentSegment && currentSegment.slopeDeg > 0 ? `↗ 上り ${currentSegment.slopeDeg.toFixed(0)}°` : currentSegment && currentSegment.roughness >= 0.5 ? '≋ 波板区間' : track?.hasEnergyBudget ? '⚡ 省エネ区間' : '↔ 直線区間'}
        </div>
        {vehicleState.motor.batteryHeat >= 0.65 && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-black text-red-800">⚠ 発熱</div>}
      </div>
      <div
        className="pointer-events-none absolute w-[48%] max-w-[350px] transition-transform duration-300"
        style={{ left: `${5 + launchTravel * 18}%`, bottom: '18%', transform: `rotate(${bumpPitchDeg}deg)` }}
      >
        <CarSprite
          wheelDiameterMm={carConfig.wheelDiameterMm}
          batteryPositionPreset="center"
          appearance={{ chassisColor: '#cfa368', accentColor: '#14b8a6' }}
          wheelAngleRad={vehicleState.motor.theta / carConfig.gearRatio}
          motorAngleRad={vehicleState.motor.theta}
          isSlipping={vehicleState.isSlipping}
          vibrationOffset={Math.sin(vehicleState.elapsedTimeS * 48) * (config.axisOffsetMm + vehicleState.coilCollapsePenaltyMm) * 0.7}
        />
      </div>
    </div>
  );
}
