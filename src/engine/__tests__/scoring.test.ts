import { describe, expect, it } from 'vitest';
import { evaluateChallenge, type HistorySample } from '../scoring';
import { step, type MotorConfig, type SimState } from '../motorPhysics';

function sample(t: number, rpm: number, current: number, backEmf = 0): HistorySample {
  return { t, rpm, current, backEmf };
}

function constantHistory(rpm: number, current: number, durationSec: number, intervalSec = 0.1): HistorySample[] {
  const samples: HistorySample[] = [];
  for (let t = 0; t <= durationSec + 1e-9; t += intervalSec) {
    samples.push(sample(t, rpm, current));
  }
  return samples;
}

describe('evaluateChallenge', () => {
  it('目標RPMに一度も届かない場合は☆0', () => {
    const history = constantHistory(500, 0.5, 12);
    const result = evaluateChallenge(history, 1000, 1.0);
    expect(result).toEqual({ star1: false, star2: false, star3: false, stars: 0 });
  });

  it('目標RPMには届くが安定した10秒間がない場合は☆1', () => {
    const history: HistorySample[] = [];
    for (let t = 0; t <= 12; t += 0.1) {
      // 目標(1000)を跨いで激しく上下動する(振れ幅が±10%を超える)
      const rpm = 1000 + (Math.floor(t * 10) % 2 === 0 ? 300 : -300);
      history.push(sample(t, rpm, 0.5));
    }
    const result = evaluateChallenge(history, 1000, 1.0);
    expect(result.star1).toBe(true);
    expect(result.star2).toBe(false);
    expect(result.stars).toBe(1);
  });

  it('平均RPMが目標未満で安定していても☆1にも☆2にもならない(安定判定はtargetRpm以上でのみ成立)', () => {
    const history = constantHistory(400, 0.2, 12); // 目標1000を大きく下回る
    const result = evaluateChallenge(history, 1000, 1.0);
    expect(result).toEqual({ star1: false, star2: false, star3: false, stars: 0 });
  });

  it('目標RPMで10秒以上安定し、平均電流が閾値以下なら☆3', () => {
    const history = constantHistory(1000, 0.3, 12);
    const result = evaluateChallenge(history, 1000, 0.5);
    expect(result).toEqual({ star1: true, star2: true, star3: true, stars: 3 });
  });

  it('目標RPMで10秒以上安定するが平均電流が閾値超なら☆2止まり', () => {
    const history = constantHistory(1000, 0.8, 12);
    const result = evaluateChallenge(history, 1000, 0.5);
    expect(result).toEqual({ star1: true, star2: true, star3: false, stars: 2 });
  });

  it('安定した窓が10秒未満だと☆2にならない', () => {
    const history = constantHistory(1000, 0.3, 8); // 8秒分しかない
    const result = evaluateChallenge(history, 1000, 0.5);
    expect(result.star1).toBe(true);
    expect(result.star2).toBe(false);
  });
});

describe('evaluateChallenge(実際のstep()出力を使った統合テスト)', () => {
  const DT = 1 / 120;
  const NO_NOISE_RNG = () => 0.5;

  // spec docs/spec.md §3.7の設計目標で使う「適正パラメータ」(motorPhysics.test.tsと同じ)
  function goodConfig(overrides: Partial<MotorConfig> = {}): MotorConfig {
    return {
      coilTurns: 80,
      slitWidthMm: 1.5,
      sandingQuality: 0.9,
      brushPressure: 0.3,
      magnetStrength: 1.0,
      magnetDistanceMm: 10,
      batteryVoltage: 3.0,
      axisOffsetMm: 0,
      ...overrides,
    };
  }

  it('適正パラメータで十分低い目標RPMなら☆3まで到達する(0.1秒間隔でサンプリング)', () => {
    const config = goodConfig();
    let s: SimState = { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0 };
    const history: HistorySample[] = [];
    const sampleEverySteps = Math.round(0.1 / DT);
    const totalSteps = 120 * 20; // 20秒分シミュレート
    for (let i = 0; i < totalSteps; i++) {
      s = step(config, s, DT, NO_NOISE_RNG);
      if (i % sampleEverySteps === 0) {
        history.push({ t: i * DT, rpm: s.rpm, current: s.current, backEmf: s.backEmf });
      }
    }
    // 適正パラメータの定常RPMは約1000(spec §3.7の設計目標)。十分低い目標(500)・
    // 十分緩い電流閾値(10A)なら余裕で☆3まで到達するはず
    const result = evaluateChallenge(history, 500, 10);
    expect(result.star1).toBe(true);
    expect(result.star2).toBe(true);
    expect(result.star3).toBe(true);
  });
});
