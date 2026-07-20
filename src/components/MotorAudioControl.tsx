import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';

interface AudioNodes {
  context: AudioContext;
  master: GainNode;
  motor: OscillatorNode;
  motorGain: GainNode;
  slip: AudioBufferSourceNode;
  slipGain: GainNode;
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

  const slip = context.createBufferSource();
  slip.buffer = createNoiseBuffer(context);
  slip.loop = true;
  const slipFilter = context.createBiquadFilter();
  slipFilter.type = 'bandpass';
  slipFilter.frequency.value = 900;
  slipFilter.Q.value = 0.7;
  const slipGain = context.createGain();
  slipGain.gain.value = 0;
  slip.connect(slipFilter).connect(slipGain).connect(master);
  motor.start();
  slip.start();
  return { context, master, motor, motorGain, slip, slipGain };
}

export function MotorAudioControl() {
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(40);
  const nodesRef = useRef<AudioNodes | null>(null);

  useEffect(() => {
    if (!enabled || !nodesRef.current) return;
    let frame = 0;
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
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
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
