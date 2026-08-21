// P3-4 G7-D(UI計画§8.1〜§8.3、art-spec §5.2・§6・§7・§8): 破壊モードの提示層。
// 破壊イベント/状態 → HUD表示・パーティクル発生・SE発火 への**純関数の写像**だけを持つ。
// 描画やWeb Audioのノード生成は含まない(描画環境なしでテスト固定するため)。
//
// **新しいパーティクル体系は作らない**——art-spec §6の既存表をそのまま記述に落とし、
// 発生条件の写像だけを担う。数値はart-spec由来であり、ここで新しく決めたものではない。
//
// 三段開示(spec §7.3): この層が出すのは**症状**であって原因ではない。
// 「磁石が弱っています」等の断定はHUDにもパーティクルにも出さない。
import type { DestructionState, UnstampedDestructionEvent } from '../../engine/destructionModes';
import type { PaletteKey } from '../palette';
import {
  findDestructionSeSpec, normalizeActiveVoiceGains as normalizeVoiceGains,
  enqueueD06Event, dequeueD06Event, EMPTY_D06_QUEUE,
  D09_ONSET_TWO_TONE_HZ, D09_ONSET_TONE_SWITCH_SEC,
  type DestructionSeId, type DestructionSeSpec, type D06QueueState,
} from '../audio/destructionSe';

function specOf(id: DestructionSeId): DestructionSeSpec {
  return findDestructionSeSpec(id);
}


// ---------------------------------------------------------------------------
// パーティクル(art-spec §6の既存表をそのまま記述に落とす)
// ---------------------------------------------------------------------------

export type ParticleBurstId = 'D02_smoke' | 'D02_D04_flame' | 'D05_spark' | 'D06_debris' | 'D01_wireLash';

export interface ParticleBurstSpec {
  readonly id: ParticleBurstId;
  /** 色遷移(パレットキー列)。`'materialColor'`は破片が素材色を引き継ぐことを表す。 */
  readonly colors: readonly PaletteKey[] | 'materialColor';
  /** 寿命(フレーム)。継続系はnull(現象が続く限り持続する)。 */
  readonly lifetimeFrames: readonly [number, number] | null;
  readonly behavior: string;
}

/** art-spec §6の表(出典: 同§6)。ここで数値を新設していない。 */
export const PARTICLE_BURST_SPECS: readonly ParticleBurstSpec[] = [
  { id: 'D01_wireLash', colors: ['M1'], lifetimeFrames: null,
    behavior: 'コイルから伸びる折れ線を毎フレーム振動させる(破壊中持続)' },
  { id: 'D02_smoke', colors: ['N5', 'N3', 'N1'], lifetimeFrames: [40, 90],
    behavior: '上昇+横流れ、市松ディザで希薄化' },
  { id: 'D02_D04_flame', colors: ['F1', 'F2', 'F3'], lifetimeFrames: null,
    behavior: 'Fランプパレットサイクル(4フレーム周期)で上方へ揺らぐ(燃焼中持続)' },
  { id: 'D05_spark', colors: ['Y1', 'M3', 'N3'], lifetimeFrames: [8, 20],
    behavior: '重力小、直線飛散、1〜2px' },
  { id: 'D06_debris', colors: 'materialColor', lifetimeFrames: [30, 60],
    behavior: '重力+バウンド1回' },
];

export function findParticleBurstSpec(id: ParticleBurstId): ParticleBurstSpec {
  const spec = PARTICLE_BURST_SPECS.find((s) => s.id === id);
  if (spec === undefined) throw new Error(`particle spec not defined: ${id}`);
  return spec;
}

/**
 * **D07/D09に専用パーティクルは無い**(R18確定)。
 * D09専用の白煙案は却下された——白煙はD02発煙(白→灰→黒)と視覚的に衝突し、
 * 「煙=コイル/電池系」という診断語彙を汚染して誤診断を誘発するため(spec §1.2)。
 * 両モードは§5.2の性能低下アイコンとRPM連動モーター音で表現する。
 */
export const D07_D09_PARTICLE_EXEMPTION_REASON =
  'D09専用白煙はD02発煙と視覚的に衝突し診断語彙を汚染するため、性能低下アイコンで表現する';

// ---------------------------------------------------------------------------
// イベント → 演出/SE の写像(有限switch。汎用rendererは作らない)
// ---------------------------------------------------------------------------

export interface PresentationTrigger {
  readonly particles: readonly ParticleBurstId[];
  readonly ses: readonly DestructionSeId[];
}

const NO_TRIGGER: PresentationTrigger = { particles: [], ses: [] };

/**
 * 発火した破壊イベント1件を、そのフレームで出す演出/SEへ写す。
 * `UnstampedDestructionEvent`の判別unionに対する有限switchであり、
 * モードが増えたらコンパイルエラーで気づけるようにしてある。
 */
export function toPresentationTrigger(event: UnstampedDestructionEvent): PresentationTrigger {
  switch (event.mode) {
    case 'D01':
      return { particles: ['D01_wireLash'], ses: ['D01_wireLash'] };
    case 'D02':
      return { particles: ['D02_smoke'], ses: ['D02_smoke'] };
    case 'D03':
      // 電池破裂は瞬時・終端。他SEはduckするが全muteはしない(§8.3)。
      return { particles: [], ses: ['D03_batteryBurst'] };
    case 'D04':
      return { particles: ['D02_D04_flame'], ses: ['D02_D04_flame'] };
    case 'D05':
      return { particles: ['D05_spark'], ses: ['D05_spark'] };
    case 'D06':
      return { particles: ['D06_debris'], ses: ['D06_toothChip'] };
    case 'D07':
      // 専用SE・専用パーティクルとも持たない(R18・R19)。既存のRPM連動モーター音と
      // 性能低下アイコンで表現するため、ここで何も返さないのは欠落ではない。
      return NO_TRIGGER;
    case 'D09':
      return { particles: [], ses: ['D09_seizureOnset'] };
  }
}

// ---------------------------------------------------------------------------
// HUD(art-spec §5.2、spec §7.3-1)
// ---------------------------------------------------------------------------

/** 性能低下アイコン。色Y1・4フレーム周期点滅(art-spec §5.2)。 */
export const PERFORMANCE_DROP_ICON = { paletteKey: 'Y1' as PaletteKey, blinkPeriodFrames: 4 };

export interface DestructionHudState {
  /** 性能低下アイコンを出すか(D07熱ダレ/D09摩擦増の症状表示)。 */
  readonly showPerformanceDropIcon: boolean;
  /** 継続中の演出(loop)。走行中ずっと出しつづけるもの。 */
  readonly activeLoops: readonly ParticleBurstId[];
  /** 継続中のSE(loop)。 */
  readonly activeLoopSes: readonly DestructionSeId[];
}

/**
 * その時点の`DestructionState`から、継続表示すべきHUD/演出を導く。
 *
 * **原因は出さない**——「磁石が弱っています」ではなく「性能が落ちている」という
 * 症状だけを示す(spec §1.2・§7.3の三段開示)。原因の確定は計測器の役目である。
 */
export function deriveDestructionHudState(state: DestructionState): DestructionHudState {
  const loops: ParticleBurstId[] = [];
  const loopSes: DestructionSeId[] = [];

  if (state.modes.D01.triggered) {
    loops.push('D01_wireLash');
    loopSes.push('D01_wireLash');
  }
  // D02のengine eventは焼損終端stepでしか出ない。発煙latch中は有限尺の煙粒子を
  // 継続発生させ、停止前に白→灰→黒が見えるようにする。SEはoneShotのまま
  // (`smokingOnsetOneShots`)で、ここには継続音を足さない。
  if (state.modes.D02.smokingStarted) {
    loops.push('D02_smoke');
  }
  // 炎はD04(LiPo)経路のみが継続燃焼を持つ。
  if (state.battery.profile === 'lipo' && state.battery.d04.stage === 'burning') {
    loops.push('D02_D04_flame');
    loopSes.push('D02_D04_flame');
  }
  if (state.modes.D09.triggered) {
    loopSes.push('D09_seizureLoop');
  }

  return {
    // D07(熱ダレ/減磁)とD09(摩擦増)はいずれも「遅くなる」という同じ症状として出す
    // ——アイコンを分けると、どちらが起きているかを画面が教えてしまう。
    // D07は可逆のダレ(reversibleDroopActive)と不可逆の減磁(irreversibleTriggered)の
    // どちらでも「遅くなる」症状が出る。可逆側を除くと、走行中に体感できる低下が
    // アイコンに現れない取りこぼしになる。
    showPerformanceDropIcon:
      state.modes.D07.reversibleDroopActive
      || state.modes.D07.irreversibleTriggered
      || state.modes.D09.triggered,
    activeLoops: loops,
    activeLoopSes: loopSes,
  };
}


// ---------------------------------------------------------------------------
// SE scheduler(§8.3)——状態を持つ有限スケジューラ
// ---------------------------------------------------------------------------
//
// 無状態の「そのフレームのイベントを鳴らすだけ」の実装では、
// (a) 前フレームから鳴り続けている有限尺SEが正規化の分母から漏れて予算超過しうる
// (b) maxConcurrentが表に書いてあるだけで実行時に効かない
// (c) D06のqueue深さ・coalesceが効かず、burstが同フレームに全件鳴る
// (d) run切替でevent cursorが戻らず、新runの序盤のイベントを取りこぼす
// という4つの取りこぼしが起きる。ここでは**鳴っている音の集合そのもの**を状態として持つ。
//
// 新しい汎用sequencerは作らない——D0xの有限な集合に閉じた最小の管理だけを行う。

/** 現在鳴っているvoice1本。`endsAtSec`がInfinityなら継続音。 */
export interface ActiveSeVoice {
  /**
   * voice1本を一意に指すキー。**idを鍵にしてはならない**——D05は同時3本鳴るため、
   * idで引くと同じ音のAudioNode handleを取り違えて片方が止まらなくなる。
   */
  readonly key: number;
  readonly id: DestructionSeId;
  readonly startedAtSec: number;
  readonly endsAtSec: number;
}

export interface DestructionSeSchedulerState {
  /**
   * 現在のrunの識別に使う`replaySnapshot`の参照。**公開のrunKeyを増やさない**ため
   * 参照同一性で見る。新しい走行は必ず新しいsnapshot実体を持ち、同一走行の間は
   * 同じ実体が使い回されるので、この用途では参照比較が正しい判定になる
   * (値が等しい別実体を取りこぼす、という回帰差分側の限界とは向きが逆)。
   */
  readonly runRef: object | null;
  /** 処理済みイベント数(eventsは追記のみ)。runが変われば0へ戻す。 */
  readonly processedEventCount: number;
  readonly d06Queue: D06QueueState;
  readonly active: readonly ActiveSeVoice[];
  /**
   * 次に払い出すvoiceキー。**run切替でも0へ戻さない**——戻すと新runの1本目が
   * 前runの止め損ねたhandleと同じキーになり、古いhandleを生き残らせたまま
   * 新しい音のhandleとして取り違える。runをまたいで単調増加させる。
   */
  readonly nextVoiceKey: number;
}

export const EMPTY_SE_SCHEDULER_STATE: DestructionSeSchedulerState = {
  runRef: null, processedEventCount: 0, d06Queue: EMPTY_D06_QUEUE, active: [], nextVoiceKey: 0,
};

export interface ScheduledSeVoice {
  /** `ActiveSeVoice.key`と同じ。再生側はこれでAudioNode handleを引く。 */
  readonly key: number;
  readonly id: DestructionSeId;
  /** 正規化後の実効gain。継続中のvoiceも毎フレームこの値へ更新する。 */
  readonly gain: number;
  /** このフレームで新たに鳴り始めたか(再生側はtrueのときだけ発音する)。 */
  readonly isNew: boolean;
}

export interface DestructionSeSchedulerResult {
  readonly next: DestructionSeSchedulerState;
  readonly voices: readonly ScheduledSeVoice[];
}

export interface SeSchedulerInput {
  readonly events: readonly { readonly mode: string }[];
  readonly destructionState: DestructionState;
  readonly replaySnapshot: object;
  /** engine event以外のoneShot(発煙latchの立ち上がりなど)。公開契約ではない。 */
  readonly extraOneShotSes?: readonly DestructionSeId[];
}

/** 発煙latchの立ち上がりだけD02発煙SEを1回出す。焼損eventの有無とは独立。 */
export function smokingOnsetOneShots(wasSmoking: boolean, isSmoking: boolean): readonly DestructionSeId[] {
  return !wasSmoking && isSmoking ? ['D02_smoke'] : [];
}

/**
 * D09焼付き瞬間の周波数(R20: 固定周波数2音の急速切替。周波数sweepは不採用)。
 * voice開始からの経過秒数だけで決まるので、再生側は時刻列に対してこの値を並べればよい。
 */
export function computeD09OnsetToneHz(elapsedSec: number): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) return D09_ONSET_TWO_TONE_HZ[0];
  // 0.15/0.05は二進では2.9999999999999996になりfloorが1つ手前へ落ちる。
  // 切替時刻ちょうどのフレームで音が変わらない取りこぼしになるため、丸め誤差を吸収する。
  const step = Math.floor(elapsedSec / D09_ONSET_TONE_SWITCH_SEC + 1e-9);
  return D09_ONSET_TWO_TONE_HZ[step % 2];
}

function countActive(active: readonly ActiveSeVoice[], id: DestructionSeId): number {
  return active.filter((v) => v.id === id).length;
}

/**
 * 1フレーム進める。`nowSec`は再生側の時刻(AudioContext.currentTime)。
 *
 * 適用順序は§8.3のとおり**個別ducking → SEバス全体正規化**で、正規化の分母は
 * 「その時点で鳴っている全voice」——継続音・前フレームから鳴り続けている有限尺SE・
 * 今フレーム鳴り始めたSEをすべて含む。
 */
export function advanceDestructionSeScheduler(
  state: DestructionSeSchedulerState,
  input: SeSchedulerInput | null,
  nowSec: number,
): DestructionSeSchedulerResult {
  // run未開始/終了: 鳴っている音ごと捨てる(走行が終わった後まで鳴り続けさせない)。
  if (input === null) return { next: EMPTY_SE_SCHEDULER_STATE, voices: [] };

  // run境界: cursor・queue・鳴っている音をすべてresetする。
  const isSameRun = state.runRef === input.replaySnapshot;
  const base: DestructionSeSchedulerState = isSameRun
    ? state
    : { ...EMPTY_SE_SCHEDULER_STATE, runRef: input.replaySnapshot, nextVoiceKey: state.nextVoiceKey };

  // 1) 鳴り終わった有限尺voiceを落とす。D06は1本終わるごとにqueueを1つ進める。
  let d06Queue = base.d06Queue;
  const survived: ActiveSeVoice[] = [];
  for (const voice of base.active) {
    if (voice.endsAtSec > nowSec) survived.push(voice);
    else if (voice.id === 'D06_toothChip') d06Queue = dequeueD06Event(d06Queue);
  }

  // 2) 継続音は状態から導く(HUD表示と同じ出典を使い、音と絵がずれないようにする)。
  const loopIds = deriveDestructionHudState(input.destructionState).activeLoopSes;
  const nextActive: ActiveSeVoice[] = survived.filter((v) => v.endsAtSec !== Infinity);
  const newKeys = new Set<number>();
  let nextVoiceKey = base.nextVoiceKey;
  const takeKey = (): number => {
    const key = nextVoiceKey;
    nextVoiceKey += 1;
    newKeys.add(key);
    return key;
  };
  for (const id of loopIds) {
    const existing = survived.find((v) => v.id === id && v.endsAtSec === Infinity);
    if (existing !== undefined) nextActive.push(existing);
    else nextActive.push({ key: takeKey(), id, startedAtSec: nowSec, endsAtSec: Infinity });
  }

  // 3) 新規イベント。D06だけはqueueへ積み、他は同時発音上限の範囲で即発音する。
  const fresh = input.events.slice(Math.max(0, base.processedEventCount));
  const extraOneShots = input.extraOneShotSes ?? [];
  for (const event of fresh) {
    for (const id of toPresentationTrigger(event as UnstampedDestructionEvent).ses) {
      const spec = specOf(id);
      if (spec.kind !== 'oneShot') continue;
      if (id === 'D06_toothChip') {
        // 深さ上限を超えた分は破棄せずcoalesceされる(症状の欠落にしない)。
        d06Queue = enqueueD06Event(d06Queue);
        continue;
      }
      // maxConcurrentを**実行時に**執行する。超過分は鳴らさない(表の値を効かせる)。
      if (countActive(nextActive, id) >= spec.maxConcurrent) continue;
      nextActive.push({ key: takeKey(), id, startedAtSec: nowSec, endsAtSec: nowSec + spec.durationSec });
    }
  }
  for (const id of extraOneShots) {
    const spec = specOf(id);
    if (spec.kind !== 'oneShot' || id === 'D06_toothChip') continue;
    if (countActive(nextActive, id) >= spec.maxConcurrent) continue;
    nextActive.push({ key: takeKey(), id, startedAtSec: nowSec, endsAtSec: nowSec + spec.durationSec });
  }

  // 4) D06は同時1本。前の1本が鳴り終わっていて待機があるときだけ次を出す。
  const d06Spec = specOf('D06_toothChip');
  if (d06Queue.queuedCount > 0 && countActive(nextActive, 'D06_toothChip') < d06Spec.maxConcurrent) {
    nextActive.push({ key: takeKey(), id: 'D06_toothChip', startedAtSec: nowSec, endsAtSec: nowSec + d06Spec.durationSec });
  }

  // 5) ducking → 全体正規化。分母は今鳴っている全voice。
  const duckingIds = new Set(nextActive.map((v) => v.id).filter((id) => specOf(id).ducksOthers));
  const baseGains = nextActive.map((v) => ({
    baseGain: specOf(v.id).baseGain * (duckingIds.size > 0 && !duckingIds.has(v.id) ? SE_DUCK_FACTOR : 1),
  }));
  const gains = normalizeVoiceGains(baseGains);

  return {
    next: {
      runRef: input.replaySnapshot,
      processedEventCount: input.events.length,
      d06Queue,
      active: nextActive,
      nextVoiceKey,
    },
    voices: nextActive.map((v, index) => ({ key: v.key, id: v.id, gain: gains[index], isNew: newKeys.has(v.key) })),
  };
}

/** ducking時の減衰率(候補)。0にはしない——現象自体を隠さない(全mute禁止、§8.3)。 */
export const SE_DUCK_FACTOR = 0.35;
