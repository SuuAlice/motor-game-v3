// Task#19(最悪ケースタブでモーター音がBGMより大きすぎる)の根本原因は、
// BGM側(sequencer.ts computeChannelMix)がチャンネル数で等分する形で
// 合算クリップ防止の予算を持つのに対し、モーター側(motorSound.ts
// computeMotorGain)には同種の予算がなく常時ゲイン1.0固定だったこと。
// BGM・モーター音が同時に鳴る画面(最悪ケースタブ・音源タブ)で合算が
// クリップ(絶対値1.0)を超えないよう、両者の最大予算をここで一元管理する。
// BGM_MASTER_GAIN + MOTOR_MASTER_GAIN <= 1.0 を保つこと(テストで固定)。
export const BGM_MASTER_GAIN = 0.8;
export const MOTOR_MASTER_GAIN = 0.2;
