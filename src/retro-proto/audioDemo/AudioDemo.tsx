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
import {
  DEFAULT_REVERB_PARAMS,
  createConvolverFromSamples,
  generateImpulseResponseSamples,
  normalizeImpulseResponseEnergy,
} from '../../retro/audio/reverb';
import {
  MOTOR_SAMPLE_PARAMS,
  MOTOR_SOUND_PARAMS,
  applyMotorGain,
  applyMotorPlaybackRate,
} from '../../retro/audio/motorSound';
import { encodeWavMono } from '../../retro/audio/wavEncoder';
import { INSTRUMENT_PREVIEW_GAIN, REVERB_DRY_MIX, REVERB_IR_TARGET_ENERGY, REVERB_WET_MIX } from '../../retro/audio/mixLevels';
import { computeAudioTabUiState, type GenerationStatus } from './audioTabUiState';

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
  const [genStatus, setGenStatus] = useState<GenerationStatus>('idle');
  const [genDetail, setGenDetail] = useState<string | undefined>(undefined);
  const [reverbOn, setReverbOn] = useState(true);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const [motorPlaying, setMotorPlaying] = useState(false);
  const [rpm, setRpm] = useState<number>(MOTOR_SOUND_PARAMS.baseRpm);

  const uiState = computeAudioTabUiState(genStatus, genDetail);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sampleBankRef = useRef<SampleBank>({});
  const reverbNodeRef = useRef<ConvolverNode | null>(null);
  // Task#AUDIO-REVERB-FIX(Suu承認): 残響ON時、BGM信号はbgmBus(単なる分岐点、
  // gain=1)からdry経路(bgmDryGainRef×REVERB_DRY_MIX→destination)とwet経路
  // (bgmWetGainRef×REVERB_WET_MIX→reverbNode→destination)へ同時に分岐する。
  // これら3ノードはhandleGenerateInstruments内で生成のたびに一度だけ作り直す
  // (BGM再生のたびには作らない)。再生成時は古いノードをdisconnectしてから
  // 新規に作り直すことで、connectが再生成のたびに累積しないようにする。
  const bgmBusRef = useRef<GainNode | null>(null);
  const bgmDryGainRef = useRef<GainNode | null>(null);
  const bgmWetGainRef = useRef<GainNode | null>(null);
  const bgmHandleRef = useRef<PlaybackHandle | null>(null);
  const motorSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const motorGainNodeRef = useRef<GainNode | null>(null);
  const motorBufferRef = useRef<AudioBuffer | null>(null);
  // Task#AUDIO-MIX-FIX(Suu承認): 個別楽器の単独試聴は常にBGM・モーター音を停止して
  // から再生する(排他制御)。このrefは「現在鳴っているpreview」の所有権を表す。
  // 連打・別楽器への切り替え時は先に既存previewをstopしてから新しいsourceに差し替える。
  // 旧sourceのendedイベントは非同期に遅れて発火しうるため、endedハンドラは
  // 「自分がまだ現行refである場合のみ」ref=nullにする(所有権チェック)。
  const instrumentPreviewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isMountedRef = useRef(true);
  // 二重生成防止のガードはRef(同期的・即時反映)で行う。genStatus(state)は
  // Reactの再レンダーを経て初めてボタンのdisabled属性に反映されるため、
  // 同一tick内で複数回呼ばれた場合はstateのクロージャが古い値を読んでしまい
  // 防げない(Task#18)。
  const isGeneratingRef = useRef(false);

  // アンマウント時にBGM・モーター音を停止し、AudioContextを解放する
  // (PHASE1-UNITG-REVIEW追加指摘4)。isMountedRefは生成処理の途中で
  // アンマウントされた場合に、閉じたAudioContextへ触れないためのガード
  // (Task#18修正)。
  useEffect(() => {
    // StrictMode(開発時)はmount→effectクリーンアップ→再mountを合成的に
    // 実行するため、クリーンアップでfalseにした値をここで明示的にtrueへ
    // 戻さないと、実際のマウント後もisMountedRef.currentがfalseのまま
    // 固定され、生成処理が`if (!isMountedRef.current) return`で無限に
    // 「生成中です…」から進まなくなる(実ブラウザ確認で発見)。
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      bgmHandleRef.current?.stop();
      motorSourceRef.current?.stop();
      instrumentPreviewSourceRef.current?.stop();
      // audioCtx.close()がノード・接続をすべて解放するため機能的には必須ではないが、
      // disconnect方針を明示するため個別にも切断しておく。
      bgmBusRef.current?.disconnect();
      bgmDryGainRef.current?.disconnect();
      bgmWetGainRef.current?.disconnect();
      reverbNodeRef.current?.disconnect();
      audioCtxRef.current?.close();
    };
  }, []);

  function getAudioContext(): AudioContext {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  // Task#AUDIO-REVERB-FIX-REVIEW指摘対応: BGM/モーター/個別試聴それぞれの停止処理を
  // 小さなhelperへ集約する。停止のたびにsource/handle停止・ref=null・state更新を
  // 必ずセットで行うことで、どこか一箇所を呼び忘れてref/stateとオーディオグラフの
  // 実体がずれる(例: refはnullだがまだ音が鳴っている、逆に音は止めたがrefが残る)
  // ことを防ぐ。
  function stopInstrumentPreview(): void {
    instrumentPreviewSourceRef.current?.stop();
    instrumentPreviewSourceRef.current = null;
  }

  function stopBgm(): void {
    if (!bgmHandleRef.current) return;
    bgmHandleRef.current.stop();
    bgmHandleRef.current = null;
    setBgmPlaying(false);
  }

  function stopMotor(): void {
    if (!motorSourceRef.current) return;
    motorSourceRef.current.stop();
    motorSourceRef.current = null;
    motorGainNodeRef.current = null;
    setMotorPlaying(false);
  }

  // 個別試聴の開始時・音源の再生成時に使う(BGM・モーターも同時に停止する)。
  // BGM開始時・モーター開始時はstopInstrumentPreview()のみを使い、BGMと
  // モーターは互いに停止しない(製品相当のバランス確認のため相互排他にしない仕様)。
  function stopAllPlayback(): void {
    stopInstrumentPreview();
    stopBgm();
    stopMotor();
  }

  // Task#18修正: 生成完了前に再生系ボタンを押すと`if (!buffer) return`で
  // 完全に無反応・無音のまま何もフィードバックが出ない不具合があった。
  // 生成中の二重生成防止(先頭でgenerating中なら早期return)、失敗時に
  // generatingへ固定されないようのエラー状態への遷移、アンマウント後は
  // 状態更新も閉じたAudioContextへの接続も行わないガードを追加した。
  //
  // Task#AUDIO-REVERB-FIX-REVIEW指摘対応: 「生成」ボタンはready状態でも押せる
  // (再生成)。BGM再生中に再生成すると、bgmHandleは古いbgmBus(このあと
  // disconnectされる)へ接続されたままになり、bgmPlaying=true・refありのまま
  // 実際には無音になってしまう不具合があった。モーター・個別試聴も再生成中は
  // 古いbufferのまま鳴り続けてしまう。生成開始時に必ずstopAllPlayback()で
  // BGM・モーター・個別試聴をすべて停止・ref/state初期化してから、実際の生成と
  // 旧bgmBus/reverbNodeのdisconnect→新規構築を行う。
  async function handleGenerateInstruments() {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    stopAllPlayback();
    setGenStatus('generating');
    setGenDetail(undefined);

    try {
      const audioCtx = getAudioContext();
      const sampleRate = audioCtx.sampleRate;

      for (const [name, params] of Object.entries(INSTRUMENT_PRESETS)) {
        const offlineCtx = new OfflineAudioContext(1, Math.ceil(params.durationSec * sampleRate), sampleRate);
        const buffer = await renderInstrumentSample(offlineCtx, params as InstrumentParams, INSTRUMENT_SEED);
        sampleBankRef.current[name] = buffer;
      }
      if (!isMountedRef.current) return;

      // ConvolverNode/dry-wetバスはここで一度だけ作成・接続する(再生のたびに
      // 重複connectしない)。再生成(「生成」ボタンの再押下)時は、まず古いノードを
      // disconnectしてから新規に作り直す(Task#AUDIO-REVERB-FIX、Suu承認: connectの
      // 累積防止)。
      bgmBusRef.current?.disconnect();
      bgmDryGainRef.current?.disconnect();
      bgmWetGainRef.current?.disconnect();
      reverbNodeRef.current?.disconnect();

      // Task#AUDIO-SR-FIX: IRはAudioContextの実sampleRateで生成する。
      // DEFAULT_REVERB_PARAMS.sampleRate(44100固定)をそのまま使うと、
      // 実行環境のAudioContextが44100Hz以外(例:48000Hz)の場合に
      // ConvolverNode.buffer設定時にサンプルレート不一致で例外になる。
      const reverbParams = { ...DEFAULT_REVERB_PARAMS, sampleRate };
      const irSamples = generateImpulseResponseSamples(reverbParams);
      // Task#AUDIO-REVERB-FIX(Suu承認): ConvolverNode.normalize(既定true、ブラウザ
      // 依存)に頼らず、IRのエネルギーを決定論的にREVERB_IR_TARGET_ENERGYへ校正して
      // からConvolverへ渡す(createConvolverFromSamples側でnormalize=falseも設定)。
      const normalizedIrSamples = normalizeImpulseResponseEnergy(irSamples, REVERB_IR_TARGET_ENERGY);
      const reverbNode = createConvolverFromSamples(audioCtx, normalizedIrSamples, reverbParams.sampleRate);
      reverbNodeRef.current = reverbNode;

      // Task#AUDIO-REVERB-FIX(Suu承認): 残響ONのBGMはdry成分を失わないよう、
      // bgmBus(分岐点)からdry経路とwet経路へ同時に接続する。
      //   bgmBus → dryGain(×REVERB_DRY_MIX) → destination
      //   bgmBus → wetGain(×REVERB_WET_MIX) → reverbNode(Convolver) → destination
      const bgmBus = audioCtx.createGain();
      bgmBus.gain.value = 1;

      const dryGain = audioCtx.createGain();
      dryGain.gain.value = REVERB_DRY_MIX;
      bgmBus.connect(dryGain);
      dryGain.connect(audioCtx.destination);

      const wetGain = audioCtx.createGain();
      wetGain.gain.value = REVERB_WET_MIX;
      bgmBus.connect(wetGain);
      wetGain.connect(reverbNode);
      reverbNode.connect(audioCtx.destination);

      bgmBusRef.current = bgmBus;
      bgmDryGainRef.current = dryGain;
      bgmWetGainRef.current = wetGain;

      const motorOfflineCtx = new OfflineAudioContext(1, Math.ceil(MOTOR_SAMPLE_PARAMS.durationSec * sampleRate), sampleRate);
      motorBufferRef.current = await renderInstrumentSample(motorOfflineCtx, MOTOR_SAMPLE_PARAMS, MOTOR_SOUND_PARAMS.seed);
      if (!isMountedRef.current) return;

      setGenStatus('ready');
      setGenDetail(`生成完了(楽器${Object.keys(INSTRUMENT_PRESETS).length}種+残響IR+モーター音)`);
    } catch (err) {
      if (!isMountedRef.current) return;
      setGenStatus('error');
      setGenDetail(`生成に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isGeneratingRef.current = false;
    }
  }

  // Task#AUDIO-MIX-FIX(Suu承認): 個別楽器の試聴は「単独試聴」として、開始時に
  // 既存preview・BGM・モーター音をすべて停止してから、INSTRUMENT_PREVIEW_GAINの
  // GainNode経由で再生する(直結だと合奏時のミックス予算を無視した生振幅で鳴り、
  // chord/leadなどsustainLevel・durationが長い楽器が実際より大きく聞こえていた)。
  function handlePlayInstrument(name: string) {
    const buffer = sampleBankRef.current[name];
    if (!buffer) return;
    const audioCtx = getAudioContext();

    stopAllPlayback();

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = INSTRUMENT_PREVIEW_GAIN;
    source.connect(gainNode).connect(audioCtx.destination);
    source.addEventListener('ended', () => {
      if (instrumentPreviewSourceRef.current === source) {
        instrumentPreviewSourceRef.current = null;
      }
    });
    source.start();
    instrumentPreviewSourceRef.current = source;
  }

  function handleDownloadInstrument(name: string) {
    const buffer = sampleBankRef.current[name];
    if (!buffer) return;
    downloadWav(buffer, `${name}.wav`);
  }

  function handleToggleBgm() {
    if (bgmHandleRef.current) {
      stopBgm();
      return;
    }
    stopInstrumentPreview();

    const audioCtx = getAudioContext();
    // Task#AUDIO-REVERB-FIX(Suu承認): 残響ONはbgmBus(dry+wet同時分岐)経由、
    // 残響OFFはdestination直結(dryのみ、REVERB_DRY_MIXの影響を受けず既存音量を
    // 完全に維持する)。
    const destination: AudioNode = reverbOn && bgmBusRef.current ? bgmBusRef.current : audioCtx.destination;
    bgmHandleRef.current = playScore(audioCtx, BGM_SCORE, INSTRUMENT_PRESETS, sampleBankRef.current, destination, {
      loopBeats: BGM_LOOP_BEATS,
    });
    setBgmPlaying(true);
  }

  function handleToggleMotor() {
    const audioCtx = getAudioContext();
    if (motorSourceRef.current) {
      stopMotor();
      return;
    }
    const buffer = motorBufferRef.current;
    if (!buffer) return;

    stopInstrumentPreview();

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    applyMotorPlaybackRate(source, rpm, MOTOR_SOUND_PARAMS.baseRpm);

    const gainNode = audioCtx.createGain();
    applyMotorGain(gainNode, rpm, MOTOR_SOUND_PARAMS.baseRpm);

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
      applyMotorGain(motorGainNodeRef.current, next, MOTOR_SOUND_PARAMS.baseRpm);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-sm">
      <p className="text-xs text-slate-600">
        Web Audio API(OfflineAudioContext/AudioContext)のみで内製した音源の生成・試聴。外部サンプル・既存曲は使用しない。ブラウザの自動再生制限のため、まず「生成」ボタンを押してください。
        楽器の個別試聴を開始するとBGM・モーター音は停止します。
      </p>

      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerateInstruments}
          disabled={uiState.generateButtonDisabled}
          className="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-40"
        >
          楽器サンプル+残響IR+モーター音を生成
        </button>
        <span className="text-xs font-bold">{uiState.statusMessage}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.keys(INSTRUMENT_PRESETS).map((name) => (
          <div key={name} className="flex items-center gap-1 rounded border px-2 py-1">
            <span className="text-xs font-bold">{name}</span>
            <button
              onClick={() => handlePlayInstrument(name)}
              disabled={uiState.playbackControlsDisabled}
              className="rounded bg-slate-200 px-2 py-0.5 text-xs disabled:opacity-40"
            >
              再生
            </button>
            <button
              onClick={() => handleDownloadInstrument(name)}
              disabled={uiState.playbackControlsDisabled}
              className="rounded bg-slate-200 px-2 py-0.5 text-xs disabled:opacity-40"
            >
              WAV保存
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleToggleBgm}
          disabled={uiState.playbackControlsDisabled}
          className="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-40"
        >
          {bgmPlaying ? 'BGM停止' : `BGM再生(${BGM_LOOP_BEATS}拍ループ、8ch以内)`}
        </button>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={reverbOn} onChange={(e) => setReverbOn(e.target.checked)} disabled={bgmPlaying} />
          残響(自作IR+ConvolverNode)
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleToggleMotor}
          disabled={uiState.playbackControlsDisabled}
          className="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-40"
        >
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
