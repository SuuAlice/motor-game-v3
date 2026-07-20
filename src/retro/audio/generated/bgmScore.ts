// PHASE1-PLAN-01-REV2【9】(b)(f): Phase1試作用BGM1曲分の譜面データ。
// オリジナル作曲(既存曲の耳コピ・参照は行っていない、spec §15.1内製主義)。
// 8拍(2小節)ループ、5楽器(kick/snare/bass/chord/lead、最大8ch以内)を使用する。
// 生成条件(この譜面データ+src/retro/audio/synth.tsの楽器プリセット+固定seed)を
// リポジトリへ保存することで、ブラウザでの再生・WAV書き出しを再現可能にする。
// 人間試遊レビュー時に既視感のある旋律でないことの確認を依頼する。
import type { Score } from '../score';

// ループ再生時の周期(拍数)。最後の音の終了時刻ではなくこの拍数を明示的に使う
// ことで、最終ノートが拍の途中で終わっていてもループ境界がずれない
// (PHASE1-UNITG-REVIEW追加指摘3、score.tsのcomputeLoopDurationSecで秒に変換する)。
export const BGM_LOOP_BEATS = 8;

export const BGM_SCORE: Score = {
  bpm: 100,
  channels: [
    {
      instrument: 'kick',
      notes: [0, 1, 2, 3, 4, 5, 6, 7].map((time) => ({ time, pitchHz: 55, durationBeats: 0.25, velocity: 0.9 })),
    },
    {
      instrument: 'snare',
      notes: [1, 3, 5, 7].map((time) => ({ time, pitchHz: 200, durationBeats: 0.25, velocity: 0.8 })),
    },
    {
      instrument: 'bass',
      notes: [
        { time: 0, pitchHz: 110, durationBeats: 1.5, velocity: 0.7 },
        { time: 2, pitchHz: 110, durationBeats: 1.5, velocity: 0.7 },
        { time: 4, pitchHz: 146.83, durationBeats: 1.5, velocity: 0.7 },
        { time: 6, pitchHz: 130.81, durationBeats: 1.5, velocity: 0.7 },
      ],
    },
    {
      instrument: 'chord',
      notes: [
        { time: 0, pitchHz: 220, durationBeats: 4, velocity: 0.4 },
        { time: 4, pitchHz: 246.94, durationBeats: 4, velocity: 0.4 },
      ],
    },
    {
      instrument: 'lead',
      notes: [
        { time: 0.5, pitchHz: 440, durationBeats: 0.5, velocity: 0.5 },
        { time: 1.5, pitchHz: 523.25, durationBeats: 0.5, velocity: 0.5 },
        { time: 2.5, pitchHz: 493.88, durationBeats: 0.5, velocity: 0.5 },
        { time: 3.5, pitchHz: 440, durationBeats: 0.5, velocity: 0.5 },
        { time: 4.5, pitchHz: 587.33, durationBeats: 0.5, velocity: 0.5 },
        { time: 5.5, pitchHz: 523.25, durationBeats: 0.5, velocity: 0.5 },
        { time: 6.5, pitchHz: 493.88, durationBeats: 0.5, velocity: 0.5 },
        { time: 7.5, pitchHz: 440, durationBeats: 0.5, velocity: 0.5 },
      ],
    },
  ],
};
