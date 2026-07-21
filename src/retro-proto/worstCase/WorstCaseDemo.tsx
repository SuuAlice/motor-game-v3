// docs/phase1-plan.md §9.1/Unit H: 最悪ケース試作。俯瞰走行ビュー(壁つき周回
// コース・16方位マシン・自機追従整数スクロール・接地影・G3高所遮蔽)+Mode 7+
// 煙/発光(色演算)+BGM+RPM変化するモーター音を同時に動作させ、frameProbeで
// 描画負荷を計測する。物理エンジンへは接続しない(ダミーデータのみ)。
//
// 重要: ここで測定できるのはこのブラウザ・この端末での結果のみ。Chrome
// DevToolsのCPU 4倍スロットリングは人間が手動で有効化する必要があり、実際の
// p50/p95/p99・欠落フレーム数・メモリ推移は「人間実測待ち」として記録する
// (推測値で埋めない、docs/phase1-plan.md §9.1)。
//
// PHASE1-UNITH-REVIEW指摘対応: 縦持ち(コンテナが縦長)では内部解像度を270×480へ
// 転置し、Mode7/色演算インセットは横並びが入らない幅のとき縦積みへ切り替える
// (常に整数座標で成立させる)。停止ボタンで計測(FrameProbe)も確実に止める。
import { useEffect, useRef, useState } from 'react';
import { computeIntegerScale } from '../../retro/canvas/integerScale';
import { selectOrientedResolution } from '../../retro/canvas/orientation';
import { buildDummyTrackLoop } from '../overheadView/track';
import { drawOverheadView } from '../overheadView/drawOverheadView';
import { computePerspectiveRowTransforms, sampleRow } from '../../retro/mode7/affineSampler';
import { getFloorPlanPixel, FLOOR_PLAN_HEIGHT_PX, FLOOR_PLAN_WIDTH_PX } from '../mode7Demo/floorPlanSource';
import { buildGlowComparison, buildSmokeComparison } from '../colorOpsDemo/colorOpsScenes';
import { PALETTE } from '../../retro/palette';
import { FrameProbe, type FrameProbeResult } from '../perf/frameProbe';
import { INSTRUMENT_PRESETS, renderInstrumentSample, type InstrumentParams } from '../../retro/audio/synth';
import { BGM_LOOP_BEATS, BGM_SCORE } from '../../retro/audio/generated/bgmScore';
import { playScore, type PlaybackHandle, type SampleBank } from '../../retro/audio/sequencer';
import { MOTOR_SAMPLE_PARAMS, MOTOR_SOUND_PARAMS, applyMotorGain, applyMotorPlaybackRate } from '../../retro/audio/motorSound';
import { computeInsetLayout } from './insetLayout';

const TRACK_POINTS = buildDummyTrackLoop();
const LANDSCAPE_CONTENT = { w: 480, h: 270 };
const MODE7_INSET_W = 120;
const MODE7_INSET_H = 90;
const COLOROPS_INSET_W = 140;
const COLOROPS_INSET_H = 60;
const INSET_MARGIN = 4;
const INSET_SIZES = {
  colorOpsWidthPx: COLOROPS_INSET_W,
  colorOpsHeightPx: COLOROPS_INSET_H,
  mode7WidthPx: MODE7_INSET_W,
  mode7HeightPx: MODE7_INSET_H,
  marginPx: INSET_MARGIN,
};
const DUMMY_SPEED_POINTS_PER_SEC = 18;
const INSTRUMENT_SEED = 20260721;
const WARMUP_MS = 2000;
const COLLECT_MS = 10000;

export function WorstCaseDemo() {
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });
  const [running, setRunning] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [result, setResult] = useState<FrameProbeResult | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const probeRef = useRef<FrameProbe | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sampleBankRef = useRef<SampleBank>({});
  const bgmHandleRef = useRef<PlaybackHandle | null>(null);
  const motorSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const motorGainRef = useRef<GainNode | null>(null);

  const contentRes = selectOrientedResolution(containerSize.w, containerSize.h, LANDSCAPE_CONTENT);
  const scaleResult = computeIntegerScale(containerSize.w, containerSize.h, contentRes.w, contentRes.h);
  const insetLayout = computeInsetLayout(contentRes.w, INSET_SIZES);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      probeRef.current?.stop();
      bgmHandleRef.current?.stop();
      motorSourceRef.current?.stop();
      audioCtxRef.current?.close();
    };
  }, []);

  async function ensureAudioStarted() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const audioCtx = audioCtxRef.current;
    const sampleRate = audioCtx.sampleRate;

    if (Object.keys(sampleBankRef.current).length === 0) {
      for (const [name, params] of Object.entries(INSTRUMENT_PRESETS)) {
        const offlineCtx = new OfflineAudioContext(1, Math.ceil(params.durationSec * sampleRate), sampleRate);
        sampleBankRef.current[name] = await renderInstrumentSample(offlineCtx, params as InstrumentParams, INSTRUMENT_SEED);
      }
    }
    if (!bgmHandleRef.current) {
      bgmHandleRef.current = playScore(audioCtx, BGM_SCORE, INSTRUMENT_PRESETS, sampleBankRef.current, audioCtx.destination, {
        loopBeats: BGM_LOOP_BEATS,
      });
    }
    if (!motorSourceRef.current) {
      const motorOfflineCtx = new OfflineAudioContext(1, Math.ceil(MOTOR_SAMPLE_PARAMS.durationSec * sampleRate), sampleRate);
      const motorBuffer = await renderInstrumentSample(motorOfflineCtx, MOTOR_SAMPLE_PARAMS, MOTOR_SOUND_PARAMS.seed);
      const source = audioCtx.createBufferSource();
      source.buffer = motorBuffer;
      source.loop = true;
      const gainNode = audioCtx.createGain();
      // GainNodeの既定値(1.0)のまま最初のrAFフレームを待つと、RPM連動の
      // ゲインが適用されるまでの一瞬だけ最大音量で鳴ってしまう(Task#19)。
      // 描画ループが最初の値を設定するまでは無音にしておく。
      applyMotorGain(gainNode, 0, MOTOR_SOUND_PARAMS.baseRpm);
      source.connect(gainNode).connect(audioCtx.destination);
      source.start();
      motorSourceRef.current = source;
      motorGainRef.current = gainNode;
    }
  }

  function stopAudio() {
    bgmHandleRef.current?.stop();
    bgmHandleRef.current = null;
    motorSourceRef.current?.stop();
    motorSourceRef.current = null;
    motorGainRef.current = null;
  }

  function stopMeasurement() {
    probeRef.current?.stop();
    probeRef.current = null;
    setMeasuring(false);
  }

  useEffect(() => {
    if (!running || !scaleResult.fits) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = contentRes.w;
    offscreen.height = contentRes.h;
    const offCtx = offscreen.getContext('2d');
    const ctx = canvas.getContext('2d');
    if (!offCtx || !ctx) return;
    ctx.imageSmoothingEnabled = false;

    canvas.width = scaleResult.contentWidthPx;
    canvas.height = scaleResult.contentHeightPx;

    let raf = 0;
    let progress = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const elapsedSec = Math.min((now - lastTime) / 1000, 0.25);
      lastTime = now;
      progress += elapsedSec * DUMMY_SPEED_POINTS_PER_SEC;

      // 1) 俯瞰走行ビュー(全面)
      const carIndex = Math.floor(progress) % TRACK_POINTS.length;
      drawOverheadView(offCtx, { trackPoints: TRACK_POINTS, carIndex }, contentRes.w, contentRes.h);

      // 2) Mode7透視(インセット、横並び/縦積みはcomputeInsetLayoutが決める)
      const zoomPhase = (Math.sin(now / 2000) + 1) / 2;
      const zoom = 1 + zoomPhase * 1.2;
      const mode7Transforms = computePerspectiveRowTransforms(MODE7_INSET_W, MODE7_INSET_H, {
        zoom,
        centerXPx: FLOOR_PLAN_WIDTH_PX / 2,
        centerYPx: FLOOR_PLAN_HEIGHT_PX - 1,
        sourceDepthSpanPx: FLOOR_PLAN_HEIGHT_PX / 2,
      });
      const { x: mode7X, y: mode7Y } = insetLayout.mode7;
      offCtx.fillStyle = PALETTE.N0;
      offCtx.fillRect(mode7X - 1, mode7Y - 1, MODE7_INSET_W + 2, MODE7_INSET_H + 2);
      for (let row = 0; row < MODE7_INSET_H; row++) {
        const pixels = sampleRow(mode7Transforms[row], MODE7_INSET_W, getFloorPlanPixel);
        for (let x = 0; x < MODE7_INSET_W; x++) {
          offCtx.fillStyle = pixels[x] ?? PALETTE.N0;
          offCtx.fillRect(mode7X + x, mode7Y + row, 1, 1);
        }
      }

      // 3) 色演算(煙+発光、インセット)
      const { x: colorOpsX, y: colorOpsY } = insetLayout.colorOps;
      offCtx.fillStyle = PALETTE.N7;
      offCtx.fillRect(colorOpsX - 1, colorOpsY - 1, COLOROPS_INSET_W + 2, COLOROPS_INSET_H + 2);
      for (const cell of buildGlowComparison(colorOpsX, colorOpsY).withOperation) {
        offCtx.fillStyle = cell.color;
        offCtx.fillRect(cell.x, cell.y, cell.widthPx, cell.heightPx);
      }
      for (const cell of buildSmokeComparison(colorOpsX, colorOpsY + 30).withOperation) {
        offCtx.fillStyle = cell.color;
        offCtx.fillRect(cell.x, cell.y, cell.widthPx, cell.heightPx);
      }

      // 4) モーター音のRPMをダミーで連続変化させる(物理エンジン非接続)
      if (motorSourceRef.current && motorGainRef.current) {
        const rpm = MOTOR_SOUND_PARAMS.baseRpm * (0.4 + 0.6 * ((Math.sin(now / 1500) + 1) / 2));
        applyMotorPlaybackRate(motorSourceRef.current, rpm, MOTOR_SOUND_PARAMS.baseRpm);
        applyMotorGain(motorGainRef.current, rpm, MOTOR_SOUND_PARAMS.baseRpm);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0, contentRes.w, contentRes.h, 0, 0, canvas.width, canvas.height);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, contentRes.w, contentRes.h, scaleResult.fits, scaleResult.contentWidthPx, scaleResult.contentHeightPx, insetLayout]);

  async function handleStart() {
    await ensureAudioStarted();
    setRunning(true);
  }

  function handleStop() {
    setRunning(false);
    stopAudio();
    // 描画を止めたら、進行中の計測もアイドル時間を含めないよう確実に止める
    // (PHASE1-UNITH-REVIEW指摘4)。
    stopMeasurement();
  }

  function handleMeasure() {
    if (!running) return;
    stopMeasurement(); // 既存の計測が万一残っていれば先に止める
    setMeasuring(true);
    setResult(null);
    const probe = new FrameProbe();
    probeRef.current = probe;
    probe.start(WARMUP_MS, COLLECT_MS, (r) => {
      setResult(r);
      setMeasuring(false);
      probeRef.current = null;
    });
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-sm">
      <p className="text-xs text-slate-600">
        俯瞰走行ビュー+Mode 7+色演算(煙/発光)+BGM+RPM変化モーター音を同時稼働させ、描画負荷を計測する。物理エンジンには接続しない。
        <br />
        計測前にChrome DevToolsでCPU 4倍スロットリングを有効化してください(このページからは操作できません、人間の手動設定が必要です)。
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={running ? handleStop : handleStart} className="rounded bg-slate-800 px-3 py-1 text-white">
          {running ? '停止' : '開始(BGM+モーター音も再生)'}
        </button>
        <button onClick={handleMeasure} disabled={!running || measuring} className="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-40">
          {measuring ? `計測中(ウォームアップ${WARMUP_MS / 1000}秒+計測${COLLECT_MS / 1000}秒)...` : '計測開始'}
        </button>
        <span className="text-xs text-slate-600">
          content: {contentRes.w}×{contentRes.h} / 倍率: {scaleResult.fits ? `${scaleResult.scale}x` : '不成立'}
        </span>
      </div>

      <div ref={containerRef} className="relative min-h-[500px] flex-1 overflow-hidden bg-slate-800">
        {scaleResult.fits ? (
          <canvas
            ref={canvasRef}
            style={{
              imageRendering: 'pixelated',
              width: `${scaleResult.contentWidthPx}px`,
              height: `${scaleResult.contentHeightPx}px`,
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-white">
            現在のviewportではcontent {contentRes.w}×{contentRes.h}が等倍でも収まりません(fits=false)。
          </div>
        )}
      </div>

      <div className="rounded border p-2 text-xs">
        <p className="font-bold">計測結果(このブラウザ・この端末のみ。人間による対象viewport切替・CPU 4倍スロットリング適用が別途必要)</p>
        {result ? (
          <ul className="mt-1 space-y-0.5">
            <li>フレーム数: {result.frameStats.count}</li>
            <li>p50: {result.frameStats.p50Ms.toFixed(2)}ms</li>
            <li>p95: {result.frameStats.p95Ms.toFixed(2)}ms</li>
            <li>p99: {result.frameStats.p99Ms.toFixed(2)}ms</li>
            <li>最大: {result.frameStats.maxMs.toFixed(2)}ms</li>
            <li>
              16.7ms超過フレーム数: {result.frameStats.droppedFrameCount} / {result.frameStats.count}
            </li>
            <li>
              メモリ:{' '}
              {result.memoryStats.available
                ? `開始${(result.memoryStats.startBytes / 1e6).toFixed(1)}MB → 終了${(result.memoryStats.endBytes / 1e6).toFixed(1)}MB(ピーク${(result.memoryStats.peakBytes / 1e6).toFixed(1)}MB、差分${(result.memoryStats.deltaBytes / 1e6).toFixed(1)}MB)`
                : '取得不可(performance.memoryはChrome限定の非標準APIです)'}
            </li>
            <li>
              GCらしき下降(performance.memoryからの推定、発生の断定はしません):{' '}
              {result.gcIndicator.available
                ? result.gcIndicator.gcLikeDropCount > 0
                  ? `あり(${result.gcIndicator.gcLikeDropCount}回、しきい値${(result.gcIndicator.dropThresholdBytes / 1e6).toFixed(1)}MB、最大下降${(result.gcIndicator.maxDropBytes / 1e6).toFixed(2)}MB)`
                  : 'なし'
                : '取得不可'}
            </li>
          </ul>
        ) : (
          <p className="mt-1">未計測。「開始」→「計測開始」の順に押してください。対象viewport(縦390×844/横844×390/1920×1080)とCPU 4倍スロットリングは人間が手動で切り替えて個別に計測してください。</p>
        )}
      </div>
    </div>
  );
}
