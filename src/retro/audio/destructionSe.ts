// P3-4 G7-D(項目M・O、UI計画§8.3): 破壊モードSEの割り当て表・SEバス正規化・
// D06のqueue/coalescing。すべて純関数で、Web Audioのノード生成は含まない
// (再生環境なしでテスト固定するため。実再生への接続はG8の実ブラウザ試遊で確認する)。
//
// **確定しているのは3点だけ**(R19・R20・R21・R26・C-1): どのモードにSEを割り当てるか /
// queue・coalescing方式 / SE_MASTER_GAIN予算の新設と正規化方式。
// **波形・周波数・ADSR・gain・queue深さの数値はいずれもG7初期候補**であり、
// G8の人間の耳による較正で確定する。この値を根拠に他の音量を調整しないこと(§19)。
import { SE_MASTER_GAIN } from './mixLevels';
import type { Waveform } from './synth';

/** SEを割り当てる破壊モード。**D07は専用SEを持たない**(下記の免除根拠)。 */
export type DestructionSeId =
  | 'D01_wireLash' | 'D02_smoke' | 'D02_D04_flame' | 'D03_batteryBurst'
  | 'D05_spark' | 'D06_toothChip' | 'D09_seizureLoop' | 'D09_seizureOnset';

/**
 * **D07(熱ダレ/減磁)の固有SE免除の根拠**(R19確定、C-1で明記):
 * art-spec §8は「D01〜D09それぞれに固有SE」と包括的に述べるが、spec §7.1の
 * 「三段開示に従う」がこれに優先する。加えてD07の劣化は`composeEffectiveMotorConfig`が
 * 書き換えた実効`MotorConfig`由来のRPM低下として**既存のRPM連動モーター音に現れて
 * いる**ため、専用SEの追加は二重表現になり、物理由来の音という診断情報の正直さを損なう。
 * よってD07だけは意図的に専用SEを持たない——表の抜け漏れではない。
 */
export const D07_SE_EXEMPTION_REASON =
  'D07の劣化は実効MotorConfig経由でRPM連動モーター音に既に現れており、専用SEは二重表現になるため';

export interface DestructionSeSpec {
  readonly id: DestructionSeId;
  /** 継続音(loop)か有限尺イベント音か。同時発音規則の分岐に使う。 */
  readonly kind: 'loop' | 'oneShot';
  readonly waveform: Waveform;
  /** noise波形は音高を持たないためnull(§8.3の表で「—」の行)。 */
  readonly frequencyHz: number | null;
  readonly durationSec: number;
  readonly attackSec: number;
  readonly decaySec: number;
  readonly sustainLevel: number;
  readonly releaseSec: number;
  /** 正規化**前**の基準gain候補。実効gainは`normalizeActiveVoiceGains`が決める。 */
  readonly baseGain: number;
  /** 同時発音の上限(§8.3「同時発生規則」列)。 */
  readonly maxConcurrent: number;
  /** 発音中、他SEのgainを下げる(全muteはしない——現象自体を隠さない)。 */
  readonly ducksOthers: boolean;
}

/**
 * §8.3の初期候補値表。**数値はすべてG7候補**(G8で耳較正)。
 *
 * **実再生への変換時の注意**: 表のADSR候補は十進では丁度`durationSec`に収まるが
 * (例: D03の0.001+0.1+0.049=0.15)、二進表現では0.15000000000000002となる。
 * 既存の`validateInstrumentParams`はattack+decay+releaseを`durationSec`と厳密比較
 * (`>`)して例外を投げるため、この表を`InstrumentParams`へ変換する段では丸めが要る。
 * 候補値は人間再承認を経ているため、ここでは値を書き換えずG8への申し送りとする。
 */
export const DESTRUCTION_SE_SPECS: readonly DestructionSeSpec[] = [
  { id: 'D01_wireLash', kind: 'loop', waveform: 'noise', frequencyHz: null, durationSec: 1.0,
    attackSec: 0, decaySec: 0, sustainLevel: 1, releaseSec: 0, baseGain: 0.2, maxConcurrent: 1, ducksOthers: false },
  { id: 'D02_smoke', kind: 'oneShot', waveform: 'noise', frequencyHz: null, durationSec: 0.5,
    attackSec: 0.01, decaySec: 0.2, sustainLevel: 0.3, releaseSec: 0.29, baseGain: 0.5, maxConcurrent: 1, ducksOthers: false },
  { id: 'D02_D04_flame', kind: 'loop', waveform: 'noise', frequencyHz: null, durationSec: 1.2,
    attackSec: 0, decaySec: 0, sustainLevel: 1, releaseSec: 0, baseGain: 0.3, maxConcurrent: 1, ducksOthers: true },
  { id: 'D03_batteryBurst', kind: 'oneShot', waveform: 'square', frequencyHz: 1500, durationSec: 0.15,
    attackSec: 0.001, decaySec: 0.1, sustainLevel: 0, releaseSec: 0.049, baseGain: 0.8, maxConcurrent: 1, ducksOthers: true },
  { id: 'D05_spark', kind: 'oneShot', waveform: 'square', frequencyHz: 2500, durationSec: 0.15,
    attackSec: 0.001, decaySec: 0.05, sustainLevel: 0.2, releaseSec: 0.099, baseGain: 0.4, maxConcurrent: 3, ducksOthers: false },
  { id: 'D06_toothChip', kind: 'oneShot', waveform: 'noise', frequencyHz: null, durationSec: 0.5,
    attackSec: 0.001, decaySec: 0.15, sustainLevel: 0.1, releaseSec: 0.349, baseGain: 0.6, maxConcurrent: 1, ducksOthers: false },
  { id: 'D09_seizureLoop', kind: 'loop', waveform: 'noise', frequencyHz: null, durationSec: 1.0,
    attackSec: 0, decaySec: 0, sustainLevel: 1, releaseSec: 0, baseGain: 0.2, maxConcurrent: 1, ducksOthers: false },
  // 焼付きの瞬間は**固定周波数2音の急速切替**で表す(R20確定)。周波数sweepは
  // InstrumentParams.frequencyHzが単一固定値でありAPI拡張を要するためP3-4スコープ外。
  { id: 'D09_seizureOnset', kind: 'oneShot', waveform: 'square', frequencyHz: 900, durationSec: 0.3,
    attackSec: 0.01, decaySec: 0.2, sustainLevel: 0, releaseSec: 0.09, baseGain: 0.7, maxConcurrent: 1, ducksOthers: true },
];

/** D09焼付き瞬間の2音(候補)。急速に切り替えて鳴らす(API変更なしで実現できる方式)。 */
export const D09_ONSET_TWO_TONE_HZ: readonly [number, number] = [900, 620];
/** 2音の切替周期(秒、候補)。 */
export const D09_ONSET_TONE_SWITCH_SEC = 0.05;

export function findDestructionSeSpec(id: DestructionSeId): DestructionSeSpec {
  const spec = DESTRUCTION_SE_SPECS.find((s) => s.id === id);
  // 有限なunionに対する全件定義なので、実行時に見つからないのは表の記述漏れを意味する。
  if (spec === undefined) throw new Error(`SE spec not defined: ${id}`);
  return spec;
}

// ---------------------------------------------------------------------------
// D01専用SEの決定論的gain変調(C-1確定)
// ---------------------------------------------------------------------------

/** 変調の深さ(候補)。0なら変調なし。 */
export const D01_GAIN_MODULATION_DEPTH = 0.35;
/** 変調の周期(Hz、候補)。 */
export const D01_GAIN_MODULATION_HZ = 3;

/**
 * D01専用SEのgain変調係数。`elapsedTimeS`(RunSnapshot起点の経過秒数)だけを入力に取り、
 * **rngを一切使わない**——同じ走行を再生すれば同じ音になる(決定論)。
 *
 * 揺らすのは**D01専用SE自身のgain**であって、モーター音のpitchではない
 * (却下されたD01/D07 pitch jitter候補とは別物、§8.3)。
 */
export function computeD01GainModulation(elapsedTimeS: number): number {
  if (!Number.isFinite(elapsedTimeS)) return 1;
  const sin = Math.sin(2 * Math.PI * D01_GAIN_MODULATION_HZ * elapsedTimeS);
  return 1 + D01_GAIN_MODULATION_DEPTH * sin;
}

// ---------------------------------------------------------------------------
// SEバス正規化(J3是正・R21承認)
// ---------------------------------------------------------------------------

/**
 * その時点で再生中の**全active voice**(継続音+イベント音、全モード横断)の基準gain
 * 合計が`SE_MASTER_GAIN`を超える場合にのみ、一律の縮小係数を掛けて実効gainへ落とす。
 * 超えない場合は基準gainをそのまま使う——**常時縮小はしない**(小音量化の常態化を避ける)。
 *
 * ducking(D03電池破裂・D09焼付き・D02/D04燃焼中)は**別レイヤー**であり、
 * ducking適用後のbaseGainをここへ渡す(適用順序: 個別ducking → 全体正規化)。
 */
export function normalizeActiveVoiceGains(
  activeVoices: readonly { readonly baseGain: number }[],
): readonly number[] {
  const total = activeVoices.reduce((sum, v) => sum + v.baseGain, 0);
  const scale = total > SE_MASTER_GAIN ? SE_MASTER_GAIN / total : 1;
  return activeVoices.map((v) => v.baseGain * scale);
}

// ---------------------------------------------------------------------------
// D06のqueue + coalescing(R26・C-6、ハイブリッド方式)
// ---------------------------------------------------------------------------

/**
 * D06 queueの深さ上限(候補3)。
 * 無制限queueは走行終端後も鳴り続ける**時間的不正直**を生むため上限を設ける。
 * 一方、超過分を無音で捨てると症状の欠落になるため、下記のとおりcoalesceする。
 */
export const D06_QUEUE_DEPTH_LIMIT = 3;

export interface D06QueueState {
  /** 待機中の発音数(上限まで)。 */
  readonly queuedCount: number;
  /** 上限超過によりまとめられた回数。**捨てたのではなく1本へ畳んだ**ことを表す。 */
  readonly coalescedCount: number;
}

export const EMPTY_D06_QUEUE: D06QueueState = { queuedCount: 0, coalescedCount: 0 };

/**
 * 歯欠けイベントを1件受け取る。上限未満ならqueueへ積み、上限に達していれば
 * **破棄せずcoalescedCountへ畳む**(症状が起きた事実は失わせない)。
 */
export function enqueueD06Event(state: D06QueueState): D06QueueState {
  if (state.queuedCount < D06_QUEUE_DEPTH_LIMIT) {
    return { ...state, queuedCount: state.queuedCount + 1 };
  }
  return { ...state, coalescedCount: state.coalescedCount + 1 };
}

/** 1本再生し終えたときのqueue更新。coalesce分は最後の1本へまとめて解放する。 */
export function dequeueD06Event(state: D06QueueState): D06QueueState {
  if (state.queuedCount === 0) return state;
  const nextQueued = state.queuedCount - 1;
  // 最後の1本を出し終える時点でcoalesce分を解放する——畳んだ回数を持ち越して
  // 走行終端後まで鳴らし続けない。
  if (nextQueued === 0) return { queuedCount: 0, coalescedCount: 0 };
  return { ...state, queuedCount: nextQueued };
}
