import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { syncSeVoiceHandles } from '../retro/destruction/seVoiceHandles';
import {
  advanceDestructionSeScheduler, computeD09OnsetToneHz, smokingOnsetOneShots,
  EMPTY_SE_SCHEDULER_STATE, type DestructionSeSchedulerState,
} from '../retro/destruction/destructionPresentation';
import {
  computeD01GainModulation, findDestructionSeSpec, D09_ONSET_TONE_SWITCH_SEC,
  type DestructionSeId,
} from '../retro/audio/destructionSe';

interface AudioNodes {
  context: AudioContext;
  master: GainNode;
  motor: OscillatorNode;
  motorGain: GainNode;
  slip: AudioBufferSourceNode;
  slipGain: GainNode;
  /** P3-4 G7-D: 破壊モードSE専用のバス。全D0xのvoiceがここへ合流する(§8.3)。 */
  seBus: GainNode;
  /**
   * 鳴っているSE voiceの実handle。**キーはvoice key**(idではない)——D05は同時3本
   * 鳴るため、idで引くとhandleを取り違えて片方が止まらなくなる。
   */
  seVoices: Map<number, SeVoiceHandle>;
  noiseBuffer: AudioBuffer;
}

function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < channel.length; index += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.82 + white * 0.18;
    channel[index] = previous;
  }
  return buffer;
}

function startAudio(): AudioNodes {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.4;
  master.connect(context.destination);

  const motor = context.createOscillator();
  motor.type = 'sawtooth';
  const motorFilter = context.createBiquadFilter();
  motorFilter.type = 'lowpass';
  motorFilter.frequency.value = 1100;
  const motorGain = context.createGain();
  motorGain.gain.value = 0;
  motor.connect(motorFilter).connect(motorGain).connect(master);

  const noiseBuffer = createNoiseBuffer(context);
  const slip = context.createBufferSource();
  slip.buffer = noiseBuffer;
  slip.loop = true;
  const slipFilter = context.createBiquadFilter();
  slipFilter.type = 'bandpass';
  slipFilter.frequency.value = 900;
  slipFilter.Q.value = 0.7;
  const slipGain = context.createGain();
  slipGain.gain.value = 0;
  slip.connect(slipFilter).connect(slipGain).connect(master);
  // P3-4 G7-D(§8.3): 破壊モードSEは単一のSEバスへ合流させる。voiceごとの実効gainは
  // advanceDestructionSeScheduler(ducking → 全体正規化)が決めるため、ここでは合流点だけを作る。
  const seBus = context.createGain();
  seBus.gain.value = 1;
  seBus.connect(master);

  motor.start();
  slip.start();
  return { context, master, motor, motorGain, slip, slipGain, seBus, seVoices: new Map(), noiseBuffer };
}

/**
 * 有限尺SEを1回鳴らす。波形・ADSRは§8.3の初期候補表から引く(この関数で数値を決めない)。
 * G8の人間の耳による較正でこの音が変わるのは**表の数値が変わる**ためであり、
 * ここのロジックを書き換える必要はない。
 */
/**
 * SE voice1本の実handle。**gainを2段に分ける**——
 * `envelopeGain`は0..1のADSRを開始時に一度だけ予約し、以後触らない。
 * `mixGain`はschedulerの正規化後gainを毎フレーム反映する。
 * 1本のAudioParamへADSRと動的gainを混載すると、後から挿入したautomation eventが
 * 既存ramp列の軌跡へ介入し、将来予約済みの絶対値sustain/releaseが新しい正規化倍率で
 * 再スケールされないまま残る。
 */
interface SeVoiceHandle {
  readonly source: AudioScheduledSourceNode;
  readonly envelopeGain: GainNode;
  readonly mixGain: GainNode;
}

/** voice1本を止めて切り離す(自然終了・run終了・run切替のいずれでも同じ後始末をする)。 */
function stopSeVoice(handle: SeVoiceHandle): void {
  try {
    handle.source.stop();
  } catch {
    // 既に停止済みのsourceへのstopは例外になる。後始末としては成功なので無視する。
  }
  handle.source.disconnect();
  handle.envelopeGain.disconnect();
  handle.mixGain.disconnect();
}

function playOneShotSe(nodes: AudioNodes, id: DestructionSeId, gain: number): SeVoiceHandle {
  const spec = findDestructionSeSpec(id);
  const now = nodes.context.currentTime;
  const mixGain = nodes.context.createGain();
  mixGain.gain.value = gain;
  mixGain.connect(nodes.seBus);
  const envelopeGain = nodes.context.createGain();
  envelopeGain.connect(mixGain);

  let source: AudioScheduledSourceNode;
  if (spec.waveform === 'noise') {
    const noise = nodes.context.createBufferSource();
    noise.buffer = nodes.noiseBuffer;
    source = noise;
  } else {
    const osc = nodes.context.createOscillator();
    osc.type = spec.waveform === 'square' ? 'square' : 'sawtooth';
    osc.frequency.value = spec.frequencyHz ?? 440;
    if (id === 'D09_seizureOnset') {
      // R20: 固定周波数2音の急速切替。既存APIのままsetValueAtTimeを時刻列へ並べるだけで、
      // frequencyHzを単一値しか持たないInstrumentParamsを拡張しない。
      for (let t = 0; t < spec.durationSec; t += D09_ONSET_TONE_SWITCH_SEC) {
        osc.frequency.setValueAtTime(computeD09OnsetToneHz(t), now + t);
      }
    }
    source = osc;
  }
  source.connect(envelopeGain);

  // ADSRは0..1の正規化された包絡としてenvelopeGainへ一度だけ予約する。
  // 実際の音量はmixGain側が持つため、正規化倍率が変わってもここは再予約しない。
  envelopeGain.gain.setValueAtTime(0, now);
  envelopeGain.gain.linearRampToValueAtTime(1, now + spec.attackSec);
  envelopeGain.gain.linearRampToValueAtTime(spec.sustainLevel, now + spec.attackSec + spec.decaySec);
  envelopeGain.gain.linearRampToValueAtTime(0, now + spec.durationSec);
  source.start(now);
  source.stop(now + spec.durationSec);
  return { source, envelopeGain, mixGain };
}

/** 継続音(loop)のvoiceを1本起こす。one-shotと同じ2段gainの形に揃える。 */
function startLoopSe(nodes: AudioNodes): SeVoiceHandle {
  const mixGain = nodes.context.createGain();
  mixGain.gain.value = 0;
  mixGain.connect(nodes.seBus);
  // 継続音は包絡を持たないので、envelopeGainは常時1で素通しする(handle形を揃えるため)。
  const envelopeGain = nodes.context.createGain();
  envelopeGain.gain.value = 1;
  envelopeGain.connect(mixGain);
  const source = nodes.context.createBufferSource();
  source.buffer = nodes.noiseBuffer;
  source.loop = true;
  source.connect(envelopeGain);
  source.start();
  return { source, envelopeGain, mixGain };
}

export function MotorAudioControl() {
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(40);
  const nodesRef = useRef<AudioNodes | null>(null);

  useEffect(() => {
    if (!enabled || !nodesRef.current) return;
    let frame = 0;
    // SE schedulerの状態(event cursor・D06 queue・鳴っているvoice集合)。
    // 走行の切替はscheduler側がreplaySnapshotの参照変化で検知してresetする。
    let schedulerState: DestructionSeSchedulerState = EMPTY_SE_SCHEDULER_STATE;
    let wasSmoking = false;
    const update = () => {
      const nodes = nodesRef.current;
      if (!nodes) return;
      const state = useGameStore.getState();
      const vehicleActive = state.testRunPhase === 'running' || state.courseRunPhase === 'running';
      const motorState = vehicleActive ? state.vehicleState.motor : state.simState;
      const rpm = Math.abs(motorState.rpm);
      const now = nodes.context.currentTime;
      const frequency = Math.min(1000, 38 + rpm / 60 * 2.4);
      const coggingPulse = 0.74 + Math.abs(Math.sin(motorState.theta * 2)) * 0.26;
      const runningGain = rpm > 2 ? Math.min(0.32, 0.035 + rpm / 14000) * coggingPulse : 0;
      nodes.motor.frequency.setTargetAtTime(frequency, now, 0.025);
      nodes.motorGain.gain.setTargetAtTime(runningGain, now, 0.035);
      const slipGain = vehicleActive && state.vehicleState.isSlipping
        ? 0.08 + state.vehicleState.slipRatio * 0.16
        : 0;
      nodes.slipGain.gain.setTargetAtTime(slipGain, now, 0.025);

      // P3-4 G7-D(§8.3): 破壊モードSE。run未開始のときは_runAccumulatorがnullで
      // schedulerが空を返し、production run中はPhase 3のSEを扱う。
      // G8: 停止画面中も終端stepのSE(有限尺event音・継続loop)を扱う。schedulerのrunRefと
      // processedEventCountはreplaySnapshotが同一参照のまま継続するため、exactly-onceは保たれる。
      const accumulator = state._runAccumulator ?? state._terminalPresentationAccumulator;
      const isSmoking = accumulator?.destructionState.modes.D02.smokingStarted === true;
      const result = advanceDestructionSeScheduler(
        schedulerState,
        accumulator === null ? null : {
          events: accumulator.events,
          destructionState: accumulator.destructionState,
          replaySnapshot: accumulator.replaySnapshot,
          extraOneShotSes: smokingOnsetOneShots(wasSmoking, isSmoking),
        },
        now,
      );
      wasSmoking = isSmoking;
      schedulerState = result.next;

      // handle集合の同期(起こす/gain追従/止めて捨てる)は純関数側に閉じている。
      syncSeVoiceHandles(nodes.seVoices, result.voices, {
        start: (voice) => findDestructionSeSpec(voice.id).kind === 'oneShot'
          ? playOneShotSe(nodes, voice.id, voice.gain)
          : startLoopSe(nodes),
        updateGain: (handle, voice) => {
          // D01専用SEだけは決定論的なsin変調をgainへ掛ける(C-1、rngを使わない)。
          const modulation = voice.id === 'D01_wireLash'
            ? computeD01GainModulation(state.vehicleState.elapsedTimeS)
            : 1;
          // 有限尺SEはADSRのscheduleを壊さないよう、実gainの水準だけ追従させる。
          // 正規化後gainはmixGainだけへ入れる——envelopeGainのADSRには触らない。
          handle.mixGain.gain.setTargetAtTime(voice.gain * modulation, now, 0.03);
        },
        stop: (handle) => stopSeVoice(handle),
      });

      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      // rAFを止めるだけではAudioNodeは鳴り続ける。音声OFF・unmountでは実handleごと
      // 止めてmapを空にする——残したままだと、再enable時にschedulerのvoice keyが
      // 0から振り直されて古いhandleと衝突し、別の音のhandleを更新してしまう。
      const nodes = nodesRef.current;
      if (nodes === null) return;
      for (const [key, handle] of nodes.seVoices) {
        stopSeVoice(handle);
        nodes.seVoices.delete(key);
      }
    };
  }, [enabled]);

  async function toggle() {
    if (!enabled) {
      const nodes = nodesRef.current ?? startAudio();
      nodesRef.current = nodes;
      await nodes.context.resume();
      setEnabled(true);
      return;
    }
    const nodes = nodesRef.current;
    if (nodes) {
      nodes.motorGain.gain.setTargetAtTime(0, nodes.context.currentTime, 0.02);
      nodes.slipGain.gain.setTargetAtTime(0, nodes.context.currentTime, 0.02);
      await nodes.context.suspend();
    }
    setEnabled(false);
  }

  function changeVolume(nextVolume: number) {
    setVolume(nextVolume);
    const nodes = nodesRef.current;
    if (nodes) nodes.master.gain.setTargetAtTime(nextVolume / 100, nodes.context.currentTime, 0.025);
  }

  return <div className="flex items-center gap-2">
    <button type="button" onClick={toggle} aria-pressed={enabled} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm">
      {enabled ? '🔊 音オン' : '🔇 音オフ'}
    </button>
    {enabled && <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600"><span className="sr-only">音量</span><input type="range" min="0" max="100" step="5" value={volume} onChange={(event) => changeVolume(Number(event.target.value))} aria-label="音量" className="w-20 accent-violet-600" /><span className="w-7 tabular-nums">{volume}%</span></label>}
  </div>;
}
