// art-spec §8: 自作JSON譜面。BGM1曲を{bpm, channels:[{instrument, notes}]}形式の
// データとして保持する(PHASE1-PLAN-01-REV2【9】(b))。タイミング計算(拍→秒)は
// 純関数として実装し、実際の再生スケジューリング(sequencer.ts)から分離する。

export type InstrumentName = 'kick' | 'snare' | 'bass' | 'chord' | 'lead';

export interface Note {
  /** 拍単位の開始位置(0始まり)。 */
  time: number;
  /** 音高。打楽器(kick/snare)では無視する。 */
  pitchHz: number;
  /** 拍単位の長さ。 */
  durationBeats: number;
  /** 0..1。 */
  velocity: number;
}

export interface ChannelScore {
  instrument: InstrumentName;
  notes: Note[];
}

export const MAX_CHANNELS = 8;

export interface Score {
  bpm: number;
  channels: ChannelScore[];
}

export interface ScheduledNote {
  channelIndex: number;
  instrument: InstrumentName;
  startTimeSec: number;
  durationSec: number;
  pitchHz: number;
  velocity: number;
}

// PHASE1-UNITG-REVIEW追加指摘6: bpm/時刻/長さ/pitchHz等の有限値もここで拒否する
// (NaN/Infinityが再生計画の純関数(computePlaybackPlan)へ伝播しないようにする)。
export function validateScore(score: Score): void {
  if (!Number.isFinite(score.bpm) || score.bpm <= 0) {
    throw new Error(`bpm must be a positive finite number, got ${score.bpm}`);
  }
  if (score.channels.length > MAX_CHANNELS) {
    throw new Error(`channels must be at most ${MAX_CHANNELS}, got ${score.channels.length}`);
  }
  for (const channel of score.channels) {
    for (const note of channel.notes) {
      if (!Number.isFinite(note.time) || note.time < 0) {
        throw new Error(`note.time must be a non-negative finite number, got ${note.time}`);
      }
      if (!Number.isFinite(note.durationBeats) || note.durationBeats <= 0) {
        throw new Error(`note.durationBeats must be a positive finite number, got ${note.durationBeats}`);
      }
      if (!Number.isFinite(note.pitchHz) || note.pitchHz <= 0) {
        throw new Error(`note.pitchHz must be a positive finite number, got ${note.pitchHz}`);
      }
      if (!Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1) {
        throw new Error(`note.velocity must be a finite number within 0..1, got ${note.velocity}`);
      }
    }
  }
}

// 拍単位の譜面を秒単位の発音スケジュールへ変換する純関数。開始時刻の昇順で返す。
export function computeScheduledNotes(score: Score): ScheduledNote[] {
  validateScore(score);
  const secPerBeat = 60 / score.bpm;
  const scheduled: ScheduledNote[] = [];

  score.channels.forEach((channel, channelIndex) => {
    for (const note of channel.notes) {
      scheduled.push({
        channelIndex,
        instrument: channel.instrument,
        startTimeSec: note.time * secPerBeat,
        durationSec: note.durationBeats * secPerBeat,
        pitchHz: note.pitchHz,
        velocity: note.velocity,
      });
    }
  });

  return scheduled.sort((a, b) => a.startTimeSec - b.startTimeSec);
}

// 譜面全体の長さ(秒)。最後の音の終了時刻を返す(ループ周期には使わない、
// PHASE1-UNITG-REVIEW追加指摘3参照)。
export function computeScoreDurationSec(score: Score): number {
  const scheduled = computeScheduledNotes(score);
  return scheduled.reduce((max, n) => Math.max(max, n.startTimeSec + n.durationSec), 0);
}

// BGMの意図したループ長(拍数指定)を秒に変換する。最後の音の終了時刻ではなく、
// 「8拍ループ」のように作曲時に意図した小節数を明示的に渡すことで、最終ノートが
// 拍の途中で終わっていてもループ境界がずれない。
export function computeLoopDurationSec(score: Score, loopBeats: number): number {
  if (!Number.isFinite(score.bpm) || score.bpm <= 0) {
    throw new Error(`bpm must be a positive finite number, got ${score.bpm}`);
  }
  if (!Number.isFinite(loopBeats) || loopBeats <= 0) {
    throw new Error(`loopBeats must be a positive finite number, got ${loopBeats}`);
  }
  return loopBeats * (60 / score.bpm);
}

interface TimeInterval {
  startSec: number;
  endSec: number;
}

// 時刻(秒)をマイクロ秒精度へ丸める。note.time*secPerBeatのように演算経路が異なる
// 時刻同士は、数学的に同一の値でも浮動小数点誤差でビット単位では一致しないことがある
// (例: 3*0.6 === 1.7999999999999998 だが 2.5*0.6+0.5*0.6 === 1.8。実測でBGM_SCOREの
// kick[time=3]開始とlead[time=2.5,duration=0.5]終了で実際に発生することを確認済み)。
// マイクロ秒精度(1e-6秒)は音声スケジューリング上意味を持つ精度を大きく下回るため、
// これで丸めてから比較・ソートすることで「終了時刻と次の開始時刻が一致する場合は
// 重なりに数えない」という半開区間の意図を浮動小数点誤差に潰されずに実現する。
function roundToMicrosecond(timeSec: number): number {
  return Math.round(timeSec * 1e6) / 1e6;
}

// 半開区間の集合を掃引し、同時に重なっている区間数の最大値を返す。
// 区間は[startSec, endSec)として扱うため、ある区間の終了時刻と次の区間の開始時刻が
// ちょうど一致する場合は重なりに数えない(終了イベントを同時刻の開始イベントより先に処理する)。
function computeMaxOverlap(intervals: TimeInterval[]): number {
  const events: Array<{ timeSec: number; delta: 1 | -1 }> = [];
  for (const interval of intervals) {
    events.push({ timeSec: roundToMicrosecond(interval.startSec), delta: 1 });
    events.push({ timeSec: roundToMicrosecond(interval.endSec), delta: -1 });
  }
  events.sort((a, b) => a.timeSec - b.timeSec || a.delta - b.delta);

  let concurrent = 0;
  let maxConcurrent = 0;
  for (const event of events) {
    concurrent += event.delta;
    if (concurrent > maxConcurrent) maxConcurrent = concurrent;
  }
  return maxConcurrent;
}

// Task#AUDIO-MIX-FIX2(Suu承認): 譜面の「最大同時発音voice数」を実測する純関数。
// BGM合算ゲインの分割数を、固定のチャンネル数(旧computeChannelMix方式)ではなく、
// 実際に同時に鳴りうる最大voice数で割ることで、実測ではほぼ発生しない最悪ケース
// (全chが同時に最大velocityで鳴る)を前提にした過剰な保守的減衰を避ける。
//
// - 各音符はnote.time〜note.time+durationBeatsの半開区間[start,end)として扱う。
//   終了時刻と次の開始時刻が一致するだけでは重なりに数えない。
// - 同一channel内で音符が重なっていても(通常のBGM譜面では起きないが)別voiceとして数える。
// - 空譜面(音符0件)はdivisor=0による無音・NaN化を避けるため、黙ってフォールバック
//   せず明示的にエラーを投げる(validateScoreと同様の明示的失敗方針)。
//
// loopDurationSecを渡した場合(PHASE1-AUDIO-MIX-FIX2-REVIEW指摘対応):
// 固定回数(前後1周分)だけずらして重ね合わせる方式は、duration>=2*loopDurationSecの
// 音符や開始時刻が複数周期先にある譜面で検出漏れが起こる(Score型にduration<=1周期の
// 制約が無いため)。そのため周期L=loopDurationSecへ正規化する方式にする:
// - 各音符のduration DについてfullCycles=floor(D/L)は、ループが定常的に繰り返される
//   限り「常にどこかのタイミングでこの音符自身の別ループ由来のコピーと同時に鳴っている」
//   一定数のvoiceを表す(全位相で常時寄与するbaseline voice数)。
// - remainder=D-fullCycles*Lは、start mod Lを起点とする円環([0,L)上)の半開区間として
//   扱う。Lをまたぐ場合は[startMod,L)と[0,endMod-L)の2つに分割する。
// - 全音符のbaseline合計 + 円環区間(全音符ぶん)の最大重なり、が最終的な最大同時発音数。
export function computeMaxConcurrentVoices(score: Score, loopDurationSec?: number): number {
  validateScore(score);
  const scheduled = computeScheduledNotes(score);
  if (scheduled.length === 0) {
    throw new Error('score must contain at least one note to compute concurrent voice count');
  }

  const baseIntervals: TimeInterval[] = scheduled.map((note) => ({
    startSec: note.startTimeSec,
    endSec: note.startTimeSec + note.durationSec,
  }));

  if (loopDurationSec === undefined) {
    return computeMaxOverlap(baseIntervals);
  }
  if (!Number.isFinite(loopDurationSec) || loopDurationSec <= 0) {
    throw new Error(`loopDurationSec must be a positive finite number, got ${loopDurationSec}`);
  }

  // duration/loopDurationSecが数学的にちょうど整数のはずでも、浮動小数点の除算誤差で
  // わずかに下回ることがある(例: 2周期ちょうどのdurationが1.9999999999998周期と計算され
  // floorで1に切り捨てられる)。マイクロ秒精度未満の誤差を吸収する微小epsilonを加える。
  const EPSILON_SEC = 1e-6;

  let baselineVoices = 0;
  const remainderIntervals: TimeInterval[] = [];

  for (const interval of baseIntervals) {
    const duration = interval.endSec - interval.startSec;
    const fullCycles = Math.floor(duration / loopDurationSec + EPSILON_SEC / loopDurationSec);
    baselineVoices += fullCycles;

    const remainder = roundToMicrosecond(duration - fullCycles * loopDurationSec);
    if (remainder <= 0) continue; // durationが周期の整数倍ちょうどなら円環部分は無い

    // note.time(延いてはstartSec)は0以上(validateScore済み)のため、JSの%演算子で
    // 負の結果になることはない。
    const startMod = roundToMicrosecond(interval.startSec % loopDurationSec);
    const endMod = startMod + remainder;

    if (endMod <= loopDurationSec) {
      remainderIntervals.push({ startSec: startMod, endSec: endMod });
    } else {
      remainderIntervals.push({ startSec: startMod, endSec: loopDurationSec });
      remainderIntervals.push({ startSec: 0, endSec: endMod - loopDurationSec });
    }
  }

  if (remainderIntervals.length === 0) {
    return baselineVoices;
  }
  return baselineVoices + computeMaxOverlap(remainderIntervals);
}
