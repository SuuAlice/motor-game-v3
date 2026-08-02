// P3-0(docs/phase3-p3-0-plan.md v7 8.1節)。destructionModes.tsの型のみをテストする。
// advanceDestructionStateの関数本体はP3-1で追加するため、判定ロジックのテストはP3-1以降。
import { describe, expect, it } from 'vitest';
import { createInitialDestructionState } from '../destructionModes';

describe('destructionModes.ts: createInitialDestructionState', () => {
  it('1. batteryProfile="lipo"の場合、battery.profileが"lipo"でd04を持つ判別unionを返す', () => {
    const state = createInitialDestructionState('lipo');
    expect(state.battery.profile).toBe('lipo');
    if (state.battery.profile === 'lipo') {
      expect(state.battery.d04).toEqual({
        triggered: false,
        triggeredAtT: null,
        stage: 'none',
        stageEnteredAtT: null,
        overDischargeActive: false,
        causeLog: null,
      });
    }
  });

  it('2. batteryProfile="nonLipo"の場合、battery.profileが"nonLipo"でd03を持つ判別unionを返す', () => {
    const state = createInitialDestructionState('nonLipo');
    expect(state.battery.profile).toBe('nonLipo');
    if (state.battery.profile === 'nonLipo') {
      expect(state.battery.d03).toEqual({ triggered: false, triggeredAtT: null, causeLog: null });
    }
  });

  it('3. sharedはshortCircuitDurationS=0・elapsedTimeS=0で初期化される', () => {
    const state = createInitialDestructionState('lipo');
    expect(state.shared).toEqual({ shortCircuitDurationS: 0, elapsedTimeS: 0 });
  });

  it('4. modesの全6モード(D01/D02/D05/D06/D07/D09)が初期値で存在する', () => {
    const state = createInitialDestructionState('nonLipo');
    expect(state.modes.D01).toEqual({ triggered: false, triggeredAtT: null, causeLog: null });
    expect(state.modes.D02).toEqual({ triggered: false, triggeredAtT: null, coilHeatGaugeRatio: 0, causeLog: null });
    expect(state.modes.D05).toEqual({
      sparkDurationS: 0,
      episodeTriggered: false,
      episodeCount: 0,
      cumulativeSparkExposure: 0,
      firstEpisodeAtT: null,
      causeLog: null,
    });
    expect(state.modes.D06).toEqual({ toothLossCount: 0, firstLossAtT: null, causeLog: null });
    expect(state.modes.D07).toEqual({
      magnetHeatGaugeRatio: 0,
      reversibleDroopActive: false,
      irreversibleTriggered: false,
      irreversibleTriggeredAtT: null,
      causeLog: null,
    });
    expect(state.modes.D09).toEqual({ triggered: false, triggeredAtT: null, bearingHeatGaugeRatio: 0, causeLog: null });
  });

  it('5. 決定論: 同一batteryProfileへの複数回呼び出しが常に同一の値になる', () => {
    expect(createInitialDestructionState('lipo')).toEqual(createInitialDestructionState('lipo'));
    expect(createInitialDestructionState('nonLipo')).toEqual(createInitialDestructionState('nonLipo'));
  });
});
