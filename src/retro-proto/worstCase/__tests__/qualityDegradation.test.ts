import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUALITY_MONITOR_CONFIG,
  MODE7_STEP_PX,
  createInitialQualityMonitorState,
  updateQualityMonitor,
  type QualityMonitorConfig,
  type QualityMonitorState,
} from '../qualityDegradation';

const CONFIG: QualityMonitorConfig = {
  emaAlpha: 1, // テストではEMAを毎回frameTimeMsそのものにして挙動を追いやすくする
  degradeThresholdMs: 16.7,
  recoverThresholdMs: 12,
  degradeAfterFrames: 3,
  recoverAfterFrames: 5,
};

function runFrames(state: QualityMonitorState, frameTimeMs: number, count: number, config = CONFIG): QualityMonitorState {
  let s = state;
  for (let i = 0; i < count; i++) {
    s = updateQualityMonitor(s, frameTimeMs, config);
  }
  return s;
}

describe('MODE7_STEP_PX', () => {
  it('fullは1px、reducedは2px', () => {
    expect(MODE7_STEP_PX.full).toBe(1);
    expect(MODE7_STEP_PX.reduced).toBe(2);
  });
});

describe('updateQualityMonitor', () => {
  it('初期状態はfull品質', () => {
    expect(createInitialQualityMonitorState().quality).toBe('full');
  });

  it('閾値以下のフレームが続く限りfullのまま', () => {
    const s = runFrames(createInitialQualityMonitorState(), 10, 1000);
    expect(s.quality).toBe('full');
  });

  it('閾値超過が連続degradeAfterFrames回未満ではfullのまま(境界のちらつき防止)', () => {
    const s = runFrames(createInitialQualityMonitorState(), 20, CONFIG.degradeAfterFrames - 1);
    expect(s.quality).toBe('full');
  });

  it('閾値超過が連続degradeAfterFrames回続くとreducedへ切り替わる', () => {
    const s = runFrames(createInitialQualityMonitorState(), 20, CONFIG.degradeAfterFrames);
    expect(s.quality).toBe('reduced');
  });

  it('閾値超過の途中で1回だけ良フレームが挟まるとストリークがリセットされ、degradeしない', () => {
    let s = createInitialQualityMonitorState();
    s = runFrames(s, 20, CONFIG.degradeAfterFrames - 1); // あと1回でdegradeする直前
    expect(s.quality).toBe('full');
    s = updateQualityMonitor(s, 5, CONFIG); // 良フレームが1回挟まる
    expect(s.overStreak).toBe(0);
    s = runFrames(s, 20, CONFIG.degradeAfterFrames - 1); // 再度あと1回の状態
    expect(s.quality).toBe('full'); // まだdegradeしていない(ストリークがリセットされた証拠)
  });

  it('reduced中、閾値未満が連続recoverAfterFrames回未満ではreducedのまま(復帰側もちらつき防止)', () => {
    let s = runFrames(createInitialQualityMonitorState(), 20, CONFIG.degradeAfterFrames);
    expect(s.quality).toBe('reduced');
    s = runFrames(s, 5, CONFIG.recoverAfterFrames - 1);
    expect(s.quality).toBe('reduced');
  });

  it('reduced中、閾値未満が連続recoverAfterFrames回続くとfullへ復帰する', () => {
    let s = runFrames(createInitialQualityMonitorState(), 20, CONFIG.degradeAfterFrames);
    expect(s.quality).toBe('reduced');
    s = runFrames(s, 5, CONFIG.recoverAfterFrames);
    expect(s.quality).toBe('full');
  });

  it('degradeThresholdMsとrecoverThresholdMsの間の値(ヒステリシス帯)ではfull側もreduced側も状態を維持する', () => {
    const between = (CONFIG.degradeThresholdMs + CONFIG.recoverThresholdMs) / 2; // 14.35
    // full側: 超過判定(> degradeThresholdMs)されないため維持
    const full = runFrames(createInitialQualityMonitorState(), between, 1000);
    expect(full.quality).toBe('full');

    // reduced側: 未満判定(< recoverThresholdMs)されないため維持
    let reduced = runFrames(createInitialQualityMonitorState(), 20, CONFIG.degradeAfterFrames);
    reduced = runFrames(reduced, between, 1000);
    expect(reduced.quality).toBe('reduced');
  });

  it('degradeAfterFramesはrecoverAfterFramesより小さい(下げる方を速く、戻す方を慎重にする既定値の関係)', () => {
    expect(DEFAULT_QUALITY_MONITOR_CONFIG.degradeAfterFrames).toBeLessThan(DEFAULT_QUALITY_MONITOR_CONFIG.recoverAfterFrames);
  });

  it('recoverThresholdMsはdegradeThresholdMsより小さい(ヒステリシス帯が空でない)', () => {
    expect(DEFAULT_QUALITY_MONITOR_CONFIG.recoverThresholdMs).toBeLessThan(DEFAULT_QUALITY_MONITOR_CONFIG.degradeThresholdMs);
  });

  it('EMAは指数移動平均として直近フレームに追従する(既定alpha)', () => {
    let s = createInitialQualityMonitorState();
    s = updateQualityMonitor(s, 10, DEFAULT_QUALITY_MONITOR_CONFIG);
    expect(s.emaMs).toBe(10); // 初回はそのまま
    s = updateQualityMonitor(s, 20, DEFAULT_QUALITY_MONITOR_CONFIG);
    expect(s.emaMs).toBeCloseTo(10 + 0.1 * (20 - 10), 5); // 11
  });

  it('負のframeTimeMs・非有限値は拒否する', () => {
    expect(() => updateQualityMonitor(createInitialQualityMonitorState(), -1, CONFIG)).toThrow();
    expect(() => updateQualityMonitor(createInitialQualityMonitorState(), NaN, CONFIG)).toThrow();
    expect(() => updateQualityMonitor(createInitialQualityMonitorState(), Infinity, CONFIG)).toThrow();
  });
});
