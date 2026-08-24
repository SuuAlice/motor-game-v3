import { useEffect, useRef } from 'react';
import type { VehicleSimState } from '../engine/vehiclePhysics';
import { useGameStore } from '../store/gameStore';
import {
  toPresentationTrigger, deriveDestructionHudState, type ParticleBurstId,
} from '../retro/destruction/destructionPresentation';
import {
  spawnParticles, stepParticles, clearBurst, drawParticles,
  PARTICLE_FIELD_WIDTH, PARTICLE_FIELD_HEIGHT, type Particle,
} from '../retro/destruction/particleField';
import { presentationElapsedSeconds, tickAt, ticksToAdvance } from '../retro/destruction/particleTick';
import { resolveGearMaterialColorKey } from '../retro/destruction/gearMaterialColor';
import { prefersReducedMotion } from '../retro/destruction/reducedMotion';
import { useSaveStore } from '../store/saveStore';

/** 発生源のおおよその位置(論理座標)。車体まわりに出す。 */
const BURST_ORIGIN: Record<ParticleBurstId, { x: number; y: number }> = {
  D01_wireLash: { x: 60, y: 58 },
  D02_smoke: { x: 64, y: 56 },
  D02_D04_flame: { x: 64, y: 58 },
  D05_spark: { x: 58, y: 60 },
  D06_debris: { x: 70, y: 64 },
};

/** 1回の発生で出す粒子数(art-spec §6に個数の規定はないため、見え方の初期候補)。 */
const BURST_COUNT: Record<ParticleBurstId, number> = {
  D01_wireLash: 1, D02_smoke: 3, D02_D04_flame: 3, D05_spark: 6, D06_debris: 8,
};

const LOOP_BURSTS = ['D01_wireLash', 'D02_smoke', 'D02_D04_flame'] as const;

interface FieldState {
  particles: readonly Particle[];
  processedEventCount: number;
  runRef: object | null;
  lastTick: number;
  seed: number;
}

const EMPTY_FIELD: FieldState = { particles: [], processedEventCount: 0, runRef: null, lastTick: -1, seed: 0 };

/**
 * P3-4 G7-D(§8.2のparticle層): 破壊モードのパーティクル。
 * art-spec §6の既存5種のみを出し、D07/D09専用パーティクルは追加しない(R18)。
 *
 * 描画は**単一の低解像度overlay Canvas**で行う——DOM要素を毎フレーム作り直す方式は
 * V3の低解像度Canvasネイティブ描画方針とミッドレンジ端末60fpsの目標から外れる。

 */
export function RaceEffects({ vehicle, active = true, legacyOverlays = true }: {
  vehicle: VehicleSimState;
  active?: boolean;
  /**
   * V2から続くlegacy overlay(スリップ煙・熱ムラ・コースアウト表示)を出すか。
   * motor-only文脈では`vehicle`が前走行の残骸であり、これらを出すと現象と無関係な
   * 誤情報になるため`false`にする。**破壊パーティクルは抑止しない。**
   */
  legacyOverlays?: boolean;
}) {
  const heat = Math.min(1, vehicle.motor.batteryHeat);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<FieldState>(EMPTY_FIELD);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    // 非activeでも、凍結した粒子をDOM/Canvas上に残さないよう明示的に消す。
    const clearField = () => {
      fieldRef.current = EMPTY_FIELD;
      context?.clearRect(0, 0, PARTICLE_FIELD_WIDTH, PARTICLE_FIELD_HEIGHT);
    };
    if (!active) {
      clearField();
      return;
    }

    let frame = 0;
    const update = () => {
      const state = useGameStore.getState();
      // a11y項目10: 動きを減らす設定では粒子を動かさない(発生・消滅の契機は変えない)。
      const reducedMotion = prefersReducedMotion(
        typeof window === 'undefined' ? undefined : window.matchMedia.bind(window),
      );
      // G8: 停止画面中は終端stepのaccumulatorを表示専用に使う。runRef(replaySnapshot参照)と
      // processedEventCountがそのまま継続するため、terminal eventはexactly-onceで処理される。
      const accumulator = state._runAccumulator ?? state._terminalPresentationAccumulator;
      if (accumulator === null) {
        // run終了かつ退避も無い: 粒子もcursorも捨てる(走行後まで画面に残さない)。
        if (fieldRef.current !== EMPTY_FIELD) clearField();
        frame = requestAnimationFrame(update);
        return;
      }

      // run切替はschedulerと同じくreplaySnapshotの参照同一性で検知する。
      const field = fieldRef.current.runRef === accumulator.replaySnapshot ? fieldRef.current : EMPTY_FIELD;
      const currentTick = tickAt(presentationElapsedSeconds({
        runContext: accumulator.replaySnapshot.runContext.context,
        motorElapsedS: state._elapsedSec,
        vehicleElapsedS: state.vehicleState.elapsedTimeS,
      }));
      const steps = field.lastTick < 0 ? 1 : ticksToAdvance(field.lastTick, currentTick);

      let particles = field.particles;
      let seed = field.seed;
      if (steps > 0) {
        for (let step = 0; step < steps; step += 1) particles = stepParticles(particles, reducedMotion);

        // D06破片の素材色。正典入力はrun開始時に固定される装備snapshotで、
        // 生きたequipmentLoadoutではない(2026-08-20人間承認の候補A)。
        // 解決した色はspawn時に粒子へ焼き付ける。
        const saveState = useSaveStore.getState();
        const gearColorKey = resolveGearMaterialColorKey(saveState.pendingRunEquipmentSnapshot, saveState.inventory);

        // 新規イベント分だけ発生させる(毎フレーム出し直さない)。
        for (const event of accumulator.events.slice(field.processedEventCount)) {
          for (const burstId of toPresentationTrigger(event).particles) {
            seed += 1;
            particles = spawnParticles(particles, burstId, BURST_COUNT[burstId], seed, BURST_ORIGIN[burstId], gearColorKey);
          }
        }
        // 継続系は現象が続く限り出しつづけ、止まったら残りを落とす。
        const loops = new Set(deriveDestructionHudState(accumulator.destructionState).activeLoops);
        for (const burstId of LOOP_BURSTS) {
          if (loops.has(burstId)) {
            seed += 1;
            particles = spawnParticles(particles, burstId, BURST_COUNT[burstId], seed, BURST_ORIGIN[burstId]);
          } else {
            particles = clearBurst(particles, burstId);
          }
        }
        fieldRef.current = {
          particles,
          processedEventCount: accumulator.events.length,
          runRef: accumulator.replaySnapshot,
          lastTick: currentTick,
          seed,
        };
      }

      if (context !== null) {
        context.clearRect(0, 0, PARTICLE_FIELD_WIDTH, PARTICLE_FIELD_HEIGHT);
        drawParticles(context, fieldRef.current.particles, currentTick, reducedMotion);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      clearField();
    };
  }, [active]);

  return <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true" style={{ animationPlayState: active ? 'running' : 'paused' }}>
    {legacyOverlays && vehicle.isSlipping && <div className="absolute bottom-[18%] left-[17%] flex gap-1">
      {[0, 1, 2, 3].map((index) => <span key={index} className="slip-smoke block h-4 w-4 rounded-full bg-slate-400/60" style={{ animationDelay: `${index * 0.12}s`, animationPlayState: active ? 'running' : 'paused' }} />)}
    </div>}
    {legacyOverlays && heat >= 0.45 && <div className="absolute bottom-[20%] left-[38%] h-28 w-48 rounded-full bg-red-500/20 blur-xl" style={{ opacity: heat }} />}
    <canvas
      ref={canvasRef}
      width={PARTICLE_FIELD_WIDTH}
      height={PARTICLE_FIELD_HEIGHT}
      className="absolute inset-0 h-full w-full"
      style={{ imageRendering: 'pixelated' }}
    />
    {legacyOverlays && vehicle.status === 'derailed' && <div className="absolute inset-x-0 top-1/3 flex justify-center"><div className="rounded-2xl border-4 border-rose-700 bg-white/95 px-6 py-3 text-center text-3xl font-black text-rose-800 shadow-xl">⚠ コースアウト</div></div>}
  </div>;
}
