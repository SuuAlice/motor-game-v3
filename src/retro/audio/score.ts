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
