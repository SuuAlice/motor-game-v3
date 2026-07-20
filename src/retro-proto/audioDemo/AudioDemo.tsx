// docs/phase1-plan.md §7/Unit G: サンプルベース音源の生成・試聴タブ。
// ブラウザ標準のOfflineAudioContext/AudioContextのみを使用し、新規依存は
// 追加しない。生成パラメータ・固定seed・譜面JSONはsrc/retro/audio/配下に
// リポジトリ保存済みで、このタブを開けば同じ条件で再生成できる
// (PHASE1-PLAN-01-REV2【9】(f))。
//
// PHASE1-UNITG-REVIEW追加指摘対応: BGM再生はcomputePlaybackPlan経由(音高比・
// velocity・duration・ループを反映)のPlaybackHandleで多重押下を防ぎ、
// ConvolverNodeは生成時に一度だけconnectする。モーター音はGainNodeで
// RPM=0時に無音化する。コンポーネントのアンマウント時に音源・接続・
// AudioContextを解放する。
import { useEffect, useRef, useState } from 'react';
import { INSTRUMENT_PRESETS, renderInstrumentSample, type InstrumentParams } from '../../retro/audio/synth';
import { BGM_LOOP_BEATS, BGM_SCORE } from '../../retro/audio/generated/bgmScore';
import { playScore, type PlaybackHandle, type SampleBank } from '../../retro/audio/sequencer';
import { DEFAULT_REVERB_PARAMS, createConvolverFromSamples, generateImpulseResponseSamples } from '../../retro/audio/reverb';
import {
  MOTOR_SAMPLE_PARAMS,
  MOTOR_SOUND_PARAMS,
  applyMotorGain,
  applyMotorPlaybackRate,
} from '../../retro/audio/motorSound';
import { encodeWavMono } from '../../retro/audio/wavEncoder';

const INSTRUMENT_SEED = 20260721;

function downloadWav(buffer: AudioBuffer, filename: string): void {
  const bytes = encodeWavMono(buffer.getChannelData(0), buffer.sampleRate);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AudioDemo() {
  const [status, setStatus] = useState('未生成');
  const [reverbOn, setReverbOn] = useState(true);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const [motorPlaying, setMotorPlaying] = useState(false);
  const [rpm, setRpm] = useState<number>(MOTOR_SOUND_PARAMS.baseRpm);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sampleBankRef = useRef<SampleBank>({});
  const reverbNodeRef = useRef<ConvolverNode | null>(null);
  const bgmHandleRef = useRef<PlaybackHandle | null>(null);
  const motorSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const motorGainNodeRef = useRef<GainNode | null>(null);
  const motorBufferRef = useRef<AudioBuffer | null>(null);

  // アンマウント時にBGM・モーター音を停止し、AudioContextを解放する
  // (PHASE1-UNITG-REVIEW追加指摘4)。
  useEffect(() => {
    return () => {
      bgmHandleRef.current?.stop();
      motorSourceRef.current?.stop();
      audioCtxRef.current?.close();
    };
  }, []);

  function getAudioContext(): AudioContext {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  async function handleGenerateInstruments() {
    setStatus('生成中...');
    const audioCtx = getAudioContext();
    const sampleRate = audioCtx.sampleRate;

    for (const [name, params] of Object.entries(INSTRUMENT_PRESETS)) {
      const offlineCtx = new OfflineAudioContext(1, Math.ceil(params.durationSec * sampleRate), sampleRate);
      const buffer = await renderInstrumentSample(offlineCtx, params as InstrumentParams, INSTRUMENT_SEED);
      sampleBankRef.current[name] = buffer;
    }

    // ConvolverNodeはここで一度だけ作成・接続する(再生のたびに重複connectしない)。
    const irSamples = generateImpulseResponseSamples(DEFAULT_REVERB_PARAMS);
    const reverbNode = createConvolverFromSamples(audioCtx, irSamples, DEFAULT_REVERB_PARAMS.sampleRate);
    reverbNode.connect(audioCtx.destination);
    reverbNodeRef.current = reverbNode;

    const motorOfflineCtx = new OfflineAudioContext(1, Math.ceil(MOTOR_SAMPLE_PARAMS.durationSec * sampleRate), sampleRate);
    motorBufferRef.current = await renderInstrumentSample(motorOfflineCtx, MOTOR_SAMPLE_PARAMS, MOTOR_SOUND_PARAMS.seed);

    setStatus(`生成完了(楽器${Object.keys(INSTRUMENT_PRESETS).length}種+残響IR+モーター音)`);
  }

  function handlePlayInstrument(name: string) {
    const buffer = sampleBankRef.current[name];
    if (!buffer) return;
    const audioCtx = getAudioContext();
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
  }

  function handleDownloadInstrument(name: string) {
    const buffer = sampleBankRef.current[name];
    if (!buffer) return;
    downloadWav(buffer, `${name}.wav`);
  }

  function handleToggleBgm() {
    if (bgmHandleRef.current) {
      bgmHandleRef.current.stop();
      bgmHandleRef.current = null;
      setBgmPlaying(false);
      return;
    }
    const audioCtx = getAudioContext();
    const destination: AudioNode = reverbOn && reverbNodeRef.current ? reverbNodeRef.current : audioCtx.destination;
    bgmHandleRef.current = playScore(audioCtx, BGM_SCORE, INSTRUMENT_PRESETS, sampleBankRef.current, destination, {
      loopBeats: BGM_LOOP_BEATS,
    });
    setBgmPlaying(true);
  }

  function handleToggleMotor() {
    const audioCtx = getAudioContext();
    if (motorSourceRef.current) {
      motorSourceRef.current.stop();
      motorSourceRef.current = null;
      motorGainNodeRef.current = null;
      setMotorPlaying(false);
      return;
    }
    const buffer = motorBufferRef.current;
    if (!buffer) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    applyMotorPlaybackRate(source, rpm, MOTOR_SOUND_PARAMS.baseRpm);

    const gainNode = audioCtx.createGain();
    applyMotorGain(gainNode, rpm);

    source.connect(gainNode).connect(audioCtx.destination);
    source.start();
    motorSourceRef.current = source;
    motorGainNodeRef.current = gainNode;
    setMotorPlaying(true);
  }

  function handleRpmChange(next: number) {
    setRpm(next);
    if (motorSourceRef.current) {
      applyMotorPlaybackRate(motorSourceRef.current, next, MOTOR_SOUND_PARAMS.baseRpm);
    }
    if (motorGainNodeRef.current) {
      applyMotorGain(motorGainNodeRef.current, next);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-sm">
      <p className="text-xs text-slate-600">
        Web Audio API(OfflineAudioContext/AudioContext)のみで内製した音源の生成・試聴。外部サンプル・既存曲は使用しない。ブラウザの自動再生制限のため、まず「生成」ボタンを押してください。
      </p>

      <div className="flex items-center gap-3">
        <button onClick={handleGenerateInstruments} className="rounded bg-slate-800 px-3 py-1 text-white">
          楽器サンプル+残響IR+モーター音を生成
        </button>
        <span className="text-xs">{status}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.keys(INSTRUMENT_PRESETS).map((name) => (
          <div key={name} className="flex items-center gap-1 rounded border px-2 py-1">
            <span className="text-xs font-bold">{name}</span>
            <button onClick={() => handlePlayInstrument(name)} className="rounded bg-slate-200 px-2 py-0.5 text-xs">
              再生
            </button>
            <button onClick={() => handleDownloadInstrument(name)} className="rounded bg-slate-200 px-2 py-0.5 text-xs">
              WAV保存
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleToggleBgm} className="rounded bg-slate-800 px-3 py-1 text-white">
          {bgmPlaying ? 'BGM停止' : `BGM再生(${BGM_LOOP_BEATS}拍ループ、8ch以内)`}
        </button>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={reverbOn} onChange={(e) => setReverbOn(e.target.checked)} disabled={bgmPlaying} />
          残響(自作IR+ConvolverNode)
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleToggleMotor} className="rounded bg-slate-800 px-3 py-1 text-white">
          {motorPlaying ? 'モーター音停止' : 'モーター音再生'}
        </button>
        <label className="flex items-center gap-2 text-xs">
          RPM: {rpm}(0で無音化)
          <input
            type="range"
            min={0}
            max={16000}
            step={100}
            value={rpm}
            onChange={(e) => handleRpmChange(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
}
