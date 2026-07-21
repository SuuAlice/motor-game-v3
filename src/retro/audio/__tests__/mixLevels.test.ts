import { describe, expect, it } from 'vitest';
import {
  BGM_MASTER_GAIN,
  INSTRUMENT_PREVIEW_GAIN,
  MOTOR_MASTER_GAIN,
  REVERB_DRY_MIX,
  REVERB_IR_TARGET_ENERGY,
  REVERB_WET_MIX,
} from '../mixLevels';

// Task#19: BGM・モーター音が同時に鳴る画面(最悪ケースタブ・音源タブ)で
// 合算がクリップ(絶対値1.0)を超えないことを固定する。
// Task#AUDIO-MIX-FIX: 0.8/0.2から0.9/0.1へ再配分(Suu承認)。
// Task#AUDIO-MIX-FIX2: 0.9/0.1から0.93/0.07へ再配分(Suu承認)。
describe('mixLevels', () => {
  it('BGM_MASTER_GAINとMOTOR_MASTER_GAINの合計は1.0を超えない', () => {
    expect(BGM_MASTER_GAIN + MOTOR_MASTER_GAIN).toBeLessThanOrEqual(1);
  });

  it('両者とも正の値である', () => {
    expect(BGM_MASTER_GAIN).toBeGreaterThan(0);
    expect(MOTOR_MASTER_GAIN).toBeGreaterThan(0);
  });

  it('Task#AUDIO-MIX-FIX2で承認された既知値(0.93/0.07)になっている', () => {
    expect(BGM_MASTER_GAIN).toBe(0.93);
    expect(MOTOR_MASTER_GAIN).toBe(0.07);
  });

  // Task#AUDIO-MIX-FIX: INSTRUMENT_PREVIEW_GAINは単独試聴専用で、AudioDemo.tsx側の
  // 排他制御により常に単独再生される前提のため、BGM/モーターの同時ミックス予算
  // (BGM_MASTER_GAIN + MOTOR_MASTER_GAIN <= 1.0)には含めない。0より大きく1以下の
  // 単独ゲインであることのみを検査する。
  it('INSTRUMENT_PREVIEW_GAINは0より大きく1.0以下である(単独試聴専用、同時ミックス予算の対象外)', () => {
    expect(INSTRUMENT_PREVIEW_GAIN).toBeGreaterThan(0);
    expect(INSTRUMENT_PREVIEW_GAIN).toBeLessThanOrEqual(1);
  });

  it('INSTRUMENT_PREVIEW_GAINはTask#AUDIO-MIX-FIXで承認された既知値(0.16)になっている', () => {
    expect(INSTRUMENT_PREVIEW_GAIN).toBe(0.16);
  });

  // Task#AUDIO-REVERB-FIX(Suu承認): REVERB_DRY_MIX/REVERB_WET_MIXは「dry予算を
  // 維持しつつwetを決定論的な基準へ校正する」配分係数の予算規律。dry+wet<=1.0を
  // 固定するが、これはConvolver適用後の瞬間振幅を数学的に保証するものではない
  // (畳み込みは時間的にエネルギーが拡散するため)。あくまで配分の予算規律として
  // 固定する。
  it('REVERB_DRY_MIXとREVERB_WET_MIXは共に有限・非負で、配分係数の合計は1.0を超えない', () => {
    expect(Number.isFinite(REVERB_DRY_MIX)).toBe(true);
    expect(Number.isFinite(REVERB_WET_MIX)).toBe(true);
    expect(REVERB_DRY_MIX).toBeGreaterThanOrEqual(0);
    expect(REVERB_WET_MIX).toBeGreaterThanOrEqual(0);
    expect(REVERB_DRY_MIX + REVERB_WET_MIX).toBeLessThanOrEqual(1);
  });

  it('REVERB_DRY_MIX/REVERB_WET_MIXはTask#AUDIO-REVERB-MIX-AESTHETICで承認された既知値(0.50/0.50)になっている', () => {
    expect(REVERB_DRY_MIX).toBe(0.5);
    expect(REVERB_WET_MIX).toBe(0.5);
  });

  it('REVERB_IR_TARGET_ENERGYは正の有限値である', () => {
    expect(Number.isFinite(REVERB_IR_TARGET_ENERGY)).toBe(true);
    expect(REVERB_IR_TARGET_ENERGY).toBeGreaterThan(0);
  });
});
