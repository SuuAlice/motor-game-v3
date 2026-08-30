import { useEffect, useRef, useState } from 'react';
import type { AssemblyStepProps } from '../../modes/AssemblyMode';
import { useFlickGesture } from './useFlickGesture';
import { useGameStore } from '../../store/gameStore';
import { useSaveStore } from '../../store/saveStore';
import { canRequestCompletion, currentLot, currentRecord, describeCompletionFailure } from './windingStepState';
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

export function StartStep({ draft, winding, dispatchWinding }: AssemblyStepProps) {
  const [started, setStarted] = useState(false);
  const finishAssembly = useGameStore((s) => s.finishAssembly);
  const completeRotorAssemblyAction = useSaveStore((s) => s.completeRotorAssemblyAction);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lot = currentLot(winding);
  const record = currentRecord(winding);
  // **`canRequestCompletion`を迂回しない**——`winding`のまま完成actionを呼べると、
  // 「巻き終える」を経ずに下限未満でも保存を試せてしまう。
  const ready = canRequestCompletion(winding);
  const failure = winding.kind === 'failed' ? winding.failure : null;

  useEffect(() => {
    if (started) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawMotor(ctx, draft, PREVIEW_REST_STATE, canvas.width, canvas.height);
  }, [draft, started]);

  const flickHandlers = useFlickGesture((velocityPxPerMs) => {
    // 順序外(材料未確定・巻線中・下限未満)ではstore actionを呼ばない。
    if (lot === null || !ready) return;
    // P4-1B B2: ローターの生成・線材消費・装備更新は`completeRotorAssemblyAction`が
    // **1回の書込みで**行う。**成功したときだけ**次(始動)へ進む——
    // 旧実装は`finishAssembly`の失敗を握りつぶし、保存できていないのに
    // 回転画面へ進んでいた。
    const completed = completeRotorAssemblyAction({
      record,
      wireMaterialId: lot.wireMaterialId,
      windingWireGaugeMm: lot.windingWireGaugeMm,
      windingParallelStrands: lot.windingParallelStrands,
      motorDraft: {
        slitWidthMm: draft.slitWidthMm,
        sandingQuality: draft.sandingQuality,
        brushPressure: draft.brushPressure,
        magnetStrength: draft.magnetStrength,
        magnetDistanceMm: draft.magnetDistanceMm,
        batteryVoltage: draft.batteryVoltage,
        varnished: draft.varnished,
        wireResistivityRatio: draft.wireResistivityRatio,
        wireDensityRatio: draft.wireDensityRatio,
        batteryInternalResistanceRatio: draft.batteryInternalResistanceRatio,
        batteryCapacityRatio: draft.batteryCapacityRatio,
        brushContactResistanceRatio: draft.brushContactResistanceRatio,
        brushChatterProbabilityRatio: draft.brushChatterProbabilityRatio,
      },
    });
    if (!completed.ok) {
      dispatchWinding({ kind: 'completionFailed', failure: completed.failure });
      return;
    }
    // 始動は別操作。configは完成actionが記録から導出して永続化済みなので、
    // ここではstoreの現configで走行を始める。
    finishAssembly(useGameStore.getState().config, velocityPxPerMs * FLICK_VELOCITY_SCALE);
    setStarted(true);
  });

  if (!started) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          軸受けに軸を乗せ、モーターの準備ができた。指ではじいて回してみよう。
        </p>
        <p className="text-xs text-slate-400">逆向きに弾いてみよう。どっちに回る?</p>
        {/* 失敗理由は常設ノード。記録は保持されたままなので、そのまま弾き直せる。 */}
        <p role="status" className="min-h-[1.25rem] text-sm text-rose-700">
          {failure === null ? '' : describeCompletionFailure(failure)}
        </p>
        {!ready && (
          <p className="text-sm text-slate-600">
            先にコイル巻き工程で「巻き終える」まで進めてください。
          </p>
        )}
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
