// P3-0(docs/phase3-p3-0-plan.md v7 8.1節)+P3-1(docs/phase3-p3-1-plan.md v7 §3・§4・§5・§6)
// +P3-2ゲート3(docs/phase3-p3-2-plan.md v9 §2.2・§2.3・§2.5、正式Fable技術レビュー2026-08-08
// 条件付き承認+人間再承認バンドル承認済み)。createInitialDestructionStateの型テストに加え、
// advanceDestructionState本体(D01/D03/D04/D07、P3-2ゲート3裁定範囲)をテストする。
import { describe, expect, it } from 'vitest';
import {
  advanceDestructionState,
  createInitialDestructionState,
  type DestructionConfig,
  type DestructionFrameInput,
  type DestructionRunContext,
  type DestructionState,
} from '../destructionModes';
import { CHATTER_BURST_FRAMES, COIL_DEFORM_OMEGA } from '../constants';

const DT = 1 / 120;

function frameInput(overrides: Partial<DestructionFrameInput> = {}): DestructionFrameInput {
  return {
    currentA: 1,
    theoreticalCurrentA: 1,
    rpm: 1000,
    batteryHeat: 0,
    shorted: false,
    chatterFramesLeft: 0,
    coilCollapsedRisingEdge: false,
    coilLossW: 0,
    isChatteringThisFrame: false,
    angularVelocityRadS: 0,
    ...overrides,
  };
}

// P3-0-Q6不変条件のproduction-valid fixture比較用: d02/d05/d06/d07/d09は有効な値域の値を持つが、
// P3-1のD01/D03分岐からは一切参照されない。
function validDestructionConfig(overrides: Partial<DestructionConfig> = {}): DestructionConfig {
  return {
    battery: { profile: 'nonLipo', shortCircuitDurationLimitS: 3.0 },
    d01: { decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5 },
    d02: { smokeGaugeThreshold: 0.5, coilOverheatGaugeLimit: 1.0, conductionScale: 0.1, dissipationCoefficient: 0.1, smokeResistanceMultiplier: 1.2 },
    d04: { bodyScorchDeltaFraction: 0.2, magnetScorchDeltaFraction: 0.15 },
    d05: {
      brushSparkDurationLimitS: 0.15,
      brushSparkCurrentThresholdA: 5,
      brushWearRateRatio: 1,
      highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 8, highCurrentPenaltyMultiplier: 1.5 },
      wearPerAmpSecond: 0.001,
      recoveryFrames: 6,
      recoveryContactResistanceMultiplier: 1.2,
    },
    d06: { breakage: { kind: 'breakable', gearStrengthThresholdNm: 1.0 } },
    d07: {
      thermal: { conductionCoefficient: 0.1, dissipationCoefficient: 0.05 },
      irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.8, reversibleDroopThreshold: 0.5, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 },
    },
    d09: { bearingSeizureGaugeLimit: 0.9 },
    ...overrides,
  };
}

function lipoDestructionConfig(overrides: Partial<DestructionConfig> = {}): DestructionConfig {
  return validDestructionConfig({
    battery: {
      profile: 'lipo',
      shortCircuitDurationLimitS: 3.0,
      runawayHeatThreshold: 1.0,
      unsafeDischargeStartRatio: 0.9,
      stageDurations: { swellingS: 1.0, smokingS: 1.0 },
      internalResistanceDegradationMultiplier: 1.5,
    },
    ...overrides,
  });
}

function motorRunContext(): DestructionRunContext {
  return { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null };
}

// D04のaffectedRoles組み立て(3.4節)検証用: body+magnet両方が延焼範囲に含まれる構成。
function vehicleRunContextWithFireExposure(): DestructionRunContext {
  return { context: 'vehicle', fireExposureProfile: { bodyEquipped: true, adjacentRolesEquipped: ['magnet'] }, gearTotalToothCount: 10 };
}

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
        initiatingCauseLog: null,
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
    expect(state.modes.D01).toEqual({ triggered: false, triggeredAtT: null, causeLog: null, decayExposureRad: 0 });
    expect(state.modes.D02).toEqual({ triggered: false, triggeredAtT: null, coilHeatGaugeRatio: 0, causeLog: null, smokingStarted: false, smokingStartedAtT: null });
    expect(state.modes.D05).toEqual({
      sparkDurationS: 0,
      episodeTriggered: false,
      episodeCount: 0,
      cumulativeSparkExposure: 0,
      firstEpisodeAtT: null,
      causeLog: null,
      cumulativeWearDeltaFraction: 0,
      recoveryFramesLeft: 0,
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

describe('destructionModes.ts: advanceDestructionState — D01個別設計(P3-1 §3)', () => {
  it('coilCollapsedRisingEdge=falseが連続するフレームではD01は発火しない', () => {
    const state = createInitialDestructionState('nonLipo');
    const result = advanceDestructionState(state, frameInput({ coilCollapsedRisingEdge: false }), validDestructionConfig(), motorRunContext(), DT);
    expect(result.state.modes.D01.triggered).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it('coilCollapsedRisingEdge=trueでD01が発火し、isFirstThisSession:trueのeventを1件返す', () => {
    const state = createInitialDestructionState('nonLipo');
    const result = advanceDestructionState(state, frameInput({ coilCollapsedRisingEdge: true, currentA: 2.5, rpm: 3000 }), validDestructionConfig(), motorRunContext(), DT);
    expect(result.state.modes.D01.triggered).toBe(true);
    expect(result.events).toEqual([
      {
        mode: 'D01',
        isFirstThisSession: true,
        causeLog: { currentA: 2.5, rpm: 3000, atT: DT, temperature: { kind: 'unavailable' } },
      },
    ]);
  });

  it('一度triggeredになった後、同一runでcoilCollapsedRisingEdge:trueを再度与えても二重発火しない(prev.triggeredガード)', () => {
    let state = createInitialDestructionState('nonLipo');
    let result = advanceDestructionState(state, frameInput({ coilCollapsedRisingEdge: true }), validDestructionConfig(), motorRunContext(), DT);
    state = result.state;
    result = advanceDestructionState(state, frameInput({ coilCollapsedRisingEdge: true }), validDestructionConfig(), motorRunContext(), DT);
    expect(result.events).toHaveLength(0);
    expect(result.state.modes.D01.triggeredAtT).toBe(state.modes.D01.triggeredAtT); // causeLogが上書きされない
  });

  it('causeLog固定(計画§8「以後上書きしない」の機械検証): 発火後にframe値を変えて再呼出ししても、D01Progress全体が初回値のまま変化しない', () => {
    let state = createInitialDestructionState('nonLipo');
    const firstResult = advanceDestructionState(state, frameInput({ coilCollapsedRisingEdge: true, currentA: 2.5, rpm: 3000 }), validDestructionConfig(), motorRunContext(), DT);
    state = firstResult.state;
    const snapshotAfterFirstFire = state.modes.D01;

    // 2回目は全く異なるframe値(currentA/rpm)を与えて再呼出しする。currentA=999は
    // D07の熱蓄積式(currentA²×conductionCoefficient)を意図的に暴走させD07も発火させる
    // ため(P3-2ゲート3でD07実装済み)、本テストの対象であるD01の不変性のみを検証する
    // (「一切eventが発行されない」ことは本テストの主張ではない)。
    const secondResult = advanceDestructionState(state, frameInput({ coilCollapsedRisingEdge: true, currentA: 999, rpm: 999999 }), validDestructionConfig(), motorRunContext(), DT);
    expect(secondResult.events.some((e) => e.mode === 'D01')).toBe(false);
    expect(secondResult.state.modes.D01).toEqual(snapshotAfterFirstFire); // D01Progress全体(causeLog込み)が初回値のまま
  });
});

describe('destructionModes.ts: advanceDestructionState — D01漸減(decayExposureRad、正式Fable P3-3-Q4裁定確定、Gate1レビュー是正)', () => {
  const HIGH_OMEGA = COIL_DEFORM_OMEGA + 100; // 閾値超過(正回転)
  const LOW_OMEGA = COIL_DEFORM_OMEGA - 10; // 閾値未満

  it('未trigger(崩壊前)では、高いangularVelocityRadSを与えてもdecayExposureRadは0のまま積算されない', () => {
    const state = createInitialDestructionState('nonLipo');
    const result = advanceDestructionState(
      state, frameInput({ coilCollapsedRisingEdge: false, angularVelocityRadS: HIGH_OMEGA }), validDestructionConfig(), motorRunContext(), DT,
    );
    expect(result.state.modes.D01.triggered).toBe(false);
    expect(result.state.modes.D01.decayExposureRad).toBe(0);
  });

  it('trigger発生frame自体はdecayExposureRad=0のまま(崩壊前提出のangularVelocityRadSは崩壊原因であり漸減はまだ計上しない)', () => {
    const state = createInitialDestructionState('nonLipo');
    const result = advanceDestructionState(
      state, frameInput({ coilCollapsedRisingEdge: true, angularVelocityRadS: HIGH_OMEGA }), validDestructionConfig(), motorRunContext(), DT,
    );
    expect(result.state.modes.D01.triggered).toBe(true);
    expect(result.state.modes.D01.decayExposureRad).toBe(0);
  });

  it('trigger後、|angularVelocityRadS| − COIL_DEFORM_OMEGAの正部分×dtだけ厳密に増える', () => {
    let state = createInitialDestructionState('nonLipo');
    state = advanceDestructionState(state, frameInput({ coilCollapsedRisingEdge: true }), validDestructionConfig(), motorRunContext(), DT).state;
    expect(state.modes.D01.decayExposureRad).toBe(0);

    const result = advanceDestructionState(state, frameInput({ angularVelocityRadS: HIGH_OMEGA }), validDestructionConfig(), motorRunContext(), DT);
    const expectedDelta = (HIGH_OMEGA - COIL_DEFORM_OMEGA) * DT;
    expect(result.state.modes.D01.decayExposureRad).toBeCloseTo(expectedDelta, 12);

    // 2step目も同じ増分だけ積算される(単調非減少)
    const result2 = advanceDestructionState(result.state, frameInput({ angularVelocityRadS: HIGH_OMEGA }), validDestructionConfig(), motorRunContext(), DT);
    expect(result2.state.modes.D01.decayExposureRad).toBeCloseTo(expectedDelta * 2, 12);
  });

  it('trigger後、|angularVelocityRadS| <= COIL_DEFORM_OMEGA(閾値以下)または停止(0)ではdecayExposureRadが変化しない', () => {
    let state = createInitialDestructionState('nonLipo');
    state = advanceDestructionState(state, frameInput({ coilCollapsedRisingEdge: true }), validDestructionConfig(), motorRunContext(), DT).state;

    const afterLow = advanceDestructionState(state, frameInput({ angularVelocityRadS: LOW_OMEGA }), validDestructionConfig(), motorRunContext(), DT);
    expect(afterLow.state.modes.D01.decayExposureRad).toBe(0);

    const afterStopped = advanceDestructionState(afterLow.state, frameInput({ angularVelocityRadS: 0 }), validDestructionConfig(), motorRunContext(), DT);
    expect(afterStopped.state.modes.D01.decayExposureRad).toBe(0);

    // ちょうど閾値(境界値)も増分ゼロ(excessOmega=0)
    const afterExact = advanceDestructionState(afterStopped.state, frameInput({ angularVelocityRadS: COIL_DEFORM_OMEGA }), validDestructionConfig(), motorRunContext(), DT);
    expect(afterExact.state.modes.D01.decayExposureRad).toBe(0);
  });

  it('負回転(angularVelocityRadSが負)でも絶対値で閾値超過分を積算する', () => {
    let state = createInitialDestructionState('nonLipo');
    state = advanceDestructionState(state, frameInput({ coilCollapsedRisingEdge: true }), validDestructionConfig(), motorRunContext(), DT).state;

    const result = advanceDestructionState(state, frameInput({ angularVelocityRadS: -HIGH_OMEGA }), validDestructionConfig(), motorRunContext(), DT);
    const expectedDelta = (HIGH_OMEGA - COIL_DEFORM_OMEGA) * DT;
    expect(result.state.modes.D01.decayExposureRad).toBeCloseTo(expectedDelta, 12);
  });
});

// ---------------------------------------------------------------------------
// P3-3ゲート3: D02(コイル焼損)状態機械(計画v10 §3、正式Fable P3-3-Q1・Q2・Q8裁定確定)
// ---------------------------------------------------------------------------

describe('destructionModes.ts: advanceDestructionState — D02個別設計(P3-3ゲート3、正式Fable Q1・Q2・Q8裁定)', () => {
  it('coilLossW>0のフレームが続くと熱ゲージ(coilHeatGaugeRatio)が単調に増加する', () => {
    const config = validDestructionConfig({ d02: { smokeGaugeThreshold: 0.5, coilOverheatGaugeLimit: 1.0, conductionScale: 1, dissipationCoefficient: 0.01, smokeResistanceMultiplier: 1.2 } });
    let state = createInitialDestructionState('nonLipo');
    let prevRatio = 0;
    for (let i = 0; i < 5; i++) {
      const result = advanceDestructionState(state, frameInput({ coilLossW: 1 }), config, motorRunContext(), DT);
      state = result.state;
      expect(state.modes.D02.coilHeatGaugeRatio).toBeGreaterThan(prevRatio);
      prevRatio = state.modes.D02.coilHeatGaugeRatio;
    }
  });

  it('coilLossW=0が続くと熱ゲージは放散のみで単調に減少する(dissipationCoefficient>0)', () => {
    const config = validDestructionConfig({ d02: { smokeGaugeThreshold: 0.5, coilOverheatGaugeLimit: 1.0, conductionScale: 1, dissipationCoefficient: 0.5, smokeResistanceMultiplier: 1.2 } });
    let state = createInitialDestructionState('nonLipo');
    // 一度熱を入れてから冷ます
    state = advanceDestructionState(state, frameInput({ coilLossW: 100 }), config, motorRunContext(), DT).state;
    const heated = state.modes.D02.coilHeatGaugeRatio;
    expect(heated).toBeGreaterThan(0);
    state = advanceDestructionState(state, frameInput({ coilLossW: 0 }), config, motorRunContext(), DT).state;
    expect(state.modes.D02.coilHeatGaugeRatio).toBeLessThan(heated);
  });

  it('熱ゲージはMath.min(1,...)/Math.max(0,...)で0〜1へclampされる(極端なcoilLossWでも1を超えない)', () => {
    const config = validDestructionConfig({ d02: { smokeGaugeThreshold: 0.5, coilOverheatGaugeLimit: 1.0, conductionScale: 1e9, dissipationCoefficient: 1e-6, smokeResistanceMultiplier: 1.2 } });
    const state = createInitialDestructionState('nonLipo');
    const result = advanceDestructionState(state, frameInput({ coilLossW: 1e9 }), config, motorRunContext(), DT);
    expect(result.state.modes.D02.coilHeatGaugeRatio).toBe(1);
  });

  it('smokeGaugeThreshold到達でsmokingStarted=trueへ不可逆latchし、以後coilLossW=0で熱ゲージが下がってもsmokingStartedはtrueのまま(正式Fable Q8確定候補b)', () => {
    const config = validDestructionConfig({ d02: { smokeGaugeThreshold: 0.3, coilOverheatGaugeLimit: 1.0, conductionScale: 1, dissipationCoefficient: 0.5, smokeResistanceMultiplier: 1.2 } });
    let state = createInitialDestructionState('nonLipo');
    state = advanceDestructionState(state, frameInput({ coilLossW: 100 }), config, motorRunContext(), DT).state;
    expect(state.modes.D02.coilHeatGaugeRatio).toBeGreaterThanOrEqual(0.3);
    expect(state.modes.D02.smokingStarted).toBe(true);
    const smokingStartedAtT = state.modes.D02.smokingStartedAtT;
    expect(smokingStartedAtT).toBeCloseTo(DT, 9);
    const heatedRatio = state.modes.D02.coilHeatGaugeRatio;

    // 冷却させても不可逆にtrueのまま、smokingStartedAtTも不変
    for (let i = 0; i < 10; i++) {
      state = advanceDestructionState(state, frameInput({ coilLossW: 0 }), config, motorRunContext(), DT).state;
    }
    expect(state.modes.D02.coilHeatGaugeRatio).toBeLessThan(heatedRatio); // 冷却により減少している
    expect(state.modes.D02.smokingStarted).toBe(true);
    expect(state.modes.D02.smokingStartedAtT).toBe(smokingStartedAtT);
  });

  it('smokeGaugeThreshold未到達ではsmokingStarted=falseのまま(C5負例: 発煙未満では発火系状態が一切変化しない)', () => {
    const config = validDestructionConfig({ d02: { smokeGaugeThreshold: 0.5, coilOverheatGaugeLimit: 1.0, conductionScale: 0.001, dissipationCoefficient: 0.5, smokeResistanceMultiplier: 1.2 } });
    let state = createInitialDestructionState('nonLipo');
    for (let i = 0; i < 5; i++) {
      state = advanceDestructionState(state, frameInput({ coilLossW: 1 }), config, motorRunContext(), DT).state;
    }
    expect(state.modes.D02.coilHeatGaugeRatio).toBeLessThan(0.5);
    expect(state.modes.D02.smokingStarted).toBe(false);
    expect(state.modes.D02.smokingStartedAtT).toBeNull();
    expect(state.modes.D02.triggered).toBe(false);
  });

  it('coilOverheatGaugeLimit到達でtriggered=trueとなりevent(isFirstThisSession:true)が一度だけ発行される。triggered時は必ずsmokingStarted=trueも成立する(交差不変条件)', () => {
    const config = validDestructionConfig({ d02: { smokeGaugeThreshold: 0.3, coilOverheatGaugeLimit: 0.5, conductionScale: 1, dissipationCoefficient: 1e-6, smokeResistanceMultiplier: 1.2 } });
    let state = createInitialDestructionState('nonLipo');
    let result = advanceDestructionState(state, frameInput({ coilLossW: 100, currentA: 3, rpm: 500 }), config, motorRunContext(), DT);
    state = result.state;
    expect(state.modes.D02.triggered).toBe(true);
    expect(state.modes.D02.triggeredAtT).toBeCloseTo(DT, 9);
    expect(state.modes.D02.smokingStarted).toBe(true); // 交差不変条件: triggered ⟹ smokingStarted
    const event = result.events.find((e) => e.mode === 'D02');
    expect(event).toBeDefined();
    if (event?.mode === 'D02') {
      expect(event.isFirstThisSession).toBe(true);
      expect(event.causeLog.temperature).toEqual({ kind: 'uncalibratedGauge', ratio: state.modes.D02.coilHeatGaugeRatio });
      expect(event.causeLog.coilHeatGaugeRatio).toBe(state.modes.D02.coilHeatGaugeRatio);
      expect(event.causeLog.currentA).toBe(3);
      expect(event.causeLog.rpm).toBe(500);
    }

    // 発火後は再発行されない(不可逆・一度きり、既存D01/D03/D04と同じ規律)
    result = advanceDestructionState(state, frameInput({ coilLossW: 100 }), config, motorRunContext(), DT);
    expect(result.events.filter((e) => e.mode === 'D02')).toHaveLength(0);
    expect(result.state.modes.D02).toEqual(state.modes.D02); // 発火後は完全に不変(D01/D03と同じ規律)
  });
});

describe('destructionModes.ts: advanceDestructionState — D03個別設計(P3-1 §4)', () => {
  it('shortCircuitDurationSが閾値未満のままではD03は発火しない(battery.d03.triggered=falseのまま)', () => {
    let state = createInitialDestructionState('nonLipo');
    for (let i = 0; i < 100; i++) {
      const result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), validDestructionConfig({ battery: { profile: 'nonLipo', shortCircuitDurationLimitS: 3.0 } }), motorRunContext(), DT);
      state = result.state;
    }
    expect(state.shared.shortCircuitDurationS).toBeCloseTo(100 * DT, 9);
    expect(state.battery.profile).toBe('nonLipo');
    if (state.battery.profile === 'nonLipo') expect(state.battery.d03.triggered).toBe(false);
  });

  it('shortCircuitDurationSが閾値以上・batteryHeatがBATTERY_HEAT_LIMIT以上の複合条件で初めてD03が発火する', () => {
    // shortCircuitDurationLimitS=DTとし、1ステップ目で持続時間条件は満たすがbatteryHeatが
    // 未到達のため発火せず、2ステップ目でbatteryHeatが追いついた瞬間に発火することを示す
    const config = validDestructionConfig({ battery: { profile: 'nonLipo', shortCircuitDurationLimitS: DT } });
    let state = createInitialDestructionState('nonLipo');
    // 短絡は持続時間条件を満たしているがbatteryHeat未到達 → 発火しない
    let result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 0.5 }), config, motorRunContext(), DT);
    state = result.state;
    if (state.battery.profile === 'nonLipo') expect(state.battery.d03.triggered).toBe(false);
    // batteryHeatも上限に達した瞬間に発火する
    result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, motorRunContext(), DT);
    expect(result.events).toEqual([
      {
        mode: 'D03',
        isFirstThisSession: true,
        causeLog: {
          currentA: 1,
          rpm: 1000,
          atT: 2 * DT,
          temperature: { kind: 'uncalibratedGauge', ratio: 1.0 },
          batteryHeatRatio: 1.0,
          shortCircuitDurationS: 2 * DT,
        },
      },
    ]);
  });

  it('frame.shorted=falseになった瞬間にshortCircuitDurationSが0へリセットされる(4.1節)', () => {
    let state = createInitialDestructionState('nonLipo');
    const config = validDestructionConfig();
    let result = advanceDestructionState(state, frameInput({ shorted: true }), config, motorRunContext(), DT);
    state = result.state;
    expect(state.shared.shortCircuitDurationS).toBeCloseTo(DT, 9);
    result = advanceDestructionState(state, frameInput({ shorted: false }), config, motorRunContext(), DT);
    expect(result.state.shared.shortCircuitDurationS).toBe(0);
  });

  it('causeLog固定(計画§8「以後上書きしない」の機械検証): D03発火後にframe値を変えて再呼出ししても、battery.d03全体が初回値のまま変化しない', () => {
    const config = validDestructionConfig({ battery: { profile: 'nonLipo', shortCircuitDurationLimitS: DT } });
    let state = createInitialDestructionState('nonLipo');
    const firstResult = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0, currentA: 3, rpm: 2000 }), config, motorRunContext(), DT);
    state = firstResult.state;
    expect(state.battery.profile).toBe('nonLipo');
    const snapshotAfterFirstFire = state.battery;

    // 2回目は全く異なるframe値(currentA/rpm/batteryHeat)を与えて再呼出しする
    const secondResult = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 0.1, currentA: 777, rpm: 1 }), config, motorRunContext(), DT);
    expect(secondResult.events.filter((e) => e.mode === 'D03')).toHaveLength(0);
    expect(secondResult.state.battery).toEqual(snapshotAfterFirstFire); // battery(causeLog込み)全体が初回値のまま
  });

  it('リポ搭載時(battery.profile==="lipo")はD03判定自体が実行されない(構造的排他)', () => {
    const state = createInitialDestructionState('lipo');
    const config = lipoDestructionConfig();
    let s = state;
    for (let i = 0; i < 500; i++) {
      // coilCollapsedRisingEdge=falseのためD01も発火しない。この条件下ではeventsが
      // 完全に空であることを確認する(D03のみならずD04等の誤発行も通さない、Suu指摘)
      const result = advanceDestructionState(s, frameInput({ shorted: true, batteryHeat: 1.0 }), config, motorRunContext(), DT);
      s = result.state;
      expect(result.events).toHaveLength(0);
    }
    expect(s.battery.profile).toBe('lipo');
  });

  it('境界1フレーム精度(実経路): 359ステップ目まで未発火、360ステップ目で発火する(正式Fable P3-1-Q3裁定、DURATION_COMPARISON_EPSILON_S対応)', () => {
    const config = validDestructionConfig({ battery: { profile: 'nonLipo', shortCircuitDurationLimitS: 3.0 } });
    let state = createInitialDestructionState('nonLipo');
    let result: ReturnType<typeof advanceDestructionState> | null = null;
    for (let i = 1; i <= 359; i++) {
      result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, motorRunContext(), DT);
      state = result.state;
    }
    expect(state.battery.profile).toBe('nonLipo');
    if (state.battery.profile === 'nonLipo') expect(state.battery.d03.triggered).toBe(false); // 359フレーム目: 未発火
    expect(result!.events).toHaveLength(0);

    result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, motorRunContext(), DT);
    state = result.state; // 360フレーム目: 発火
    expect(state.battery.profile).toBe('nonLipo');
    if (state.battery.profile === 'nonLipo') expect(state.battery.d03.triggered).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].mode).toBe('D03');

    // 361フレームへの遅延は許容しない: 360フレーム目で確定していることを再確認する
    // (一度triggeredになった後は再度呼んでも新規イベントは増えない、二重発火防止)
    result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, motorRunContext(), DT);
    expect(result.events).toHaveLength(0);
  });
});

describe('destructionModes.ts: advanceDestructionState — events固定順序(D01→D03)', () => {
  it('D01とD03が同一フレームで同時発火する境界入力では、eventsが常に[D01, D03]の順で返る', () => {
    // shortCircuitDurationLimitS=2*DTとし、1ステップ目では閾値未到達(発火しない)、
    // 2ステップ目でD03の複合条件とD01のcoilCollapsedRisingEdgeを同時に満たす
    const config = validDestructionConfig({ battery: { profile: 'nonLipo', shortCircuitDurationLimitS: 2 * DT } });
    let state = createInitialDestructionState('nonLipo');
    // shortCircuitDurationSを閾値直前まで積む(まだ発火しない)
    let result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, motorRunContext(), DT);
    state = result.state;
    if (state.battery.profile === 'nonLipo') expect(state.battery.d03.triggered).toBe(false);

    // 同一フレームでD01(coilCollapsedRisingEdge)とD03(shortCircuitDurationS到達+batteryHeat到達)を
    // 同時に満たす境界値を構築する
    result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0, coilCollapsedRisingEdge: true }), config, motorRunContext(), DT);
    expect(result.events.map((e) => e.mode)).toEqual(['D01', 'D03']);
  });
});

describe('destructionModes.ts: advanceDestructionState — P3-0-Q6不変条件の機械検証(P3-1 §5、正式Fable P3-0-Q6裁定)', () => {
  it('極端なframe入力を与えても、発行されるeventのmodeは常にD01・D03・D04・D07のいずれかのみである(P3-2ゲート3ホワイトリストの直接検証)', () => {
    // 正式Q6はP3-2ゲート3時点で「D01/D03/D04/D07以外を発行不可」(D02/D05/D06/D09は
    // 禁止集合のまま、2026-08-08 Suu_mot3裁定でD04/D07が同一ゲートでホワイトリストへ追加)。
    // 禁止リストの列挙ではなく、許可リストのみを直接検証する
    const config = validDestructionConfig();
    const extremeFrames: DestructionFrameInput[] = [
      frameInput({ rpm: 1e9, currentA: 1e9, theoreticalCurrentA: 1e9 }),
      frameInput({ chatterFramesLeft: 1e6 }),
      frameInput({ loadTorqueNm: 1e9 }),
      frameInput({ energyUsedRatio: 1.0 }),
      frameInput({ shorted: true, batteryHeat: 1.0 }),
      frameInput({ coilCollapsedRisingEdge: true }),
    ];
    let state = createInitialDestructionState('nonLipo');
    for (const frame of extremeFrames) {
      const result = advanceDestructionState(state, frame, config, motorRunContext(), DT);
      state = result.state;
      for (const event of result.events) {
        expect(['D01', 'D03', 'D04', 'D07'], `許可リスト外のmodeが発行されました: ${event.mode}`).toContain(event.mode);
      }
    }
  });

  it('config.d02/d04/d05/d06/d09の値をどれだけ変えてもD01/D03/D07の判定結果は変化しない(production-valid fixture比較、d07自体は不変のまま)', () => {
    // d07はP3-2ゲート3で実装済みのため「値を変えても影響がない」対象からは除外し、
    // configA/Bとも同一のd07を使う(d07自体の影響は次のテストで別途検証する)。
    // d04もbattery.profile='nonLipo'ではD04分岐が構造的に実行されないため無影響のまま。
    const frame = frameInput({ shorted: true, batteryHeat: 1.0, coilCollapsedRisingEdge: true });
    const state = createInitialDestructionState('nonLipo');

    const configA = validDestructionConfig();
    const configB = validDestructionConfig({
      d02: { smokeGaugeThreshold: 0.99, coilOverheatGaugeLimit: 0.01, conductionScale: 9.9, dissipationCoefficient: 9.9, smokeResistanceMultiplier: 9.9 },
      d04: { bodyScorchDeltaFraction: 0.99, magnetScorchDeltaFraction: 0.99 },
      d05: {
        brushSparkDurationLimitS: 0.001,
        brushSparkCurrentThresholdA: 0.001,
        brushWearRateRatio: 9.9,
        highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 0.001, highCurrentPenaltyMultiplier: 9.9 },
        wearPerAmpSecond: 9.9,
        recoveryFrames: 99,
        recoveryContactResistanceMultiplier: 9.9,
      },
      d06: { breakage: { kind: 'nonBreakable' } },
      d09: { bearingSeizureGaugeLimit: 0.001 },
    });

    const resultA = advanceDestructionState(state, frame, configA, motorRunContext(), DT);
    const resultB = advanceDestructionState(state, frame, configB, motorRunContext(), DT);
    expect(resultA.events).toEqual(resultB.events);
    expect(resultA.state).toEqual(resultB.state);
  });

  it('config.d07の値を変えてもD01/D03の判定結果は変化しない(D07自身の結果は変わってよい、d07実装がD01/D03を汚染しないことの検証)', () => {
    const frame = frameInput({ shorted: true, batteryHeat: 1.0, coilCollapsedRisingEdge: true });
    const state = createInitialDestructionState('nonLipo');

    const configA = validDestructionConfig();
    const configB = validDestructionConfig({
      d07: {
        thermal: { conductionCoefficient: 0.99, dissipationCoefficient: 0.99 },
        irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.01, reversibleDroopThreshold: 0.005, reversibleDroopMultiplier: 0.5, demagnetizationDeltaFraction: 0.99 },
      },
    });

    const resultA = advanceDestructionState(state, frame, configA, motorRunContext(), DT);
    const resultB = advanceDestructionState(state, frame, configB, motorRunContext(), DT);
    // D01/D03(battery)はd07configの違いによらず不変
    expect(resultA.state.modes.D01).toEqual(resultB.state.modes.D01);
    expect(resultA.state.battery).toEqual(resultB.state.battery);
    const nonD07EventsA = resultA.events.filter((e) => e.mode !== 'D07');
    const nonD07EventsB = resultB.events.filter((e) => e.mode !== 'D07');
    expect(nonD07EventsA).toEqual(nonD07EventsB);
    // 一方、d07config自体を大きく変えればD07の結果は実際に変わりうる(この構成では
    // configBのmagnetHeatGaugeLimit=0.01が極端に低いため不可逆到達する)
    expect(resultB.state.modes.D07.magnetHeatGaugeRatio).not.toEqual(resultA.state.modes.D07.magnetHeatGaugeRatio);
  });
});

describe('destructionModes.ts: advanceDestructionState — A1結論の機械検証(P3-1 §6、給電停止機構は導入しない)', () => {
  it('D03発火(prev.triggered=true)後、advanceDestructionStateを規約違反で再度呼んでもD03イベントは増えない(engine内部の冪等性)', () => {
    // shortCircuitDurationLimitS=DTとし、1ステップ目で複合条件を満たしD03が即発火する
    const config = validDestructionConfig({ battery: { profile: 'nonLipo', shortCircuitDurationLimitS: DT } });
    let state = createInitialDestructionState('nonLipo');
    let result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, motorRunContext(), DT);
    state = result.state;
    if (state.battery.profile === 'nonLipo') expect(state.battery.d03.triggered).toBe(true);
    expect(result.events.filter((e) => e.mode === 'D03')).toHaveLength(1);

    // 規約に反してもう一度呼ぶ(本来はstore/destructionOrchestration層がtermination確定後に
    // 呼ばない契約だが、engine内部のprev.triggeredガードが二重イベントを防ぐことを確認する)
    result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, motorRunContext(), DT);
    expect(result.events.filter((e) => e.mode === 'D03')).toHaveLength(0);
  });
});

describe('destructionModes.ts: advanceDestructionState — dt分割不変性(P3-1 §11・§14.2、正式Fable M-1是正版)', () => {
  // 正式Fable M-1是正(2026-08-08、Suu_mot3裁定): dt自体を1/120→1/240のように変えて比較する
  // 旧定義は正典違反として撤去する。dtは両経路とも1/120で固定し、CLAUDE.mdの非機能要件
  // 「1フレームあたり物理ステップは最大2回」に沿って、フレームあたりの物理stepバッチング数
  // (1 vs 2)だけを変えて比較する。coilCollapsedRisingEdgeは「フレーム」単位ではなく
  // 物理step通算番号から決める(物理step #TOTAL_PHYSICS_STEPSのみtrue、Suu_mot3裁定)。
  it('同一総時間(3.0秒、D03境界+D01同時発火)を、固定dt=1/120秒のまま「1物理step×2Nフレーム」と「2物理step×Nフレーム」の異なるバッチングで進めても、発火有無・event件数順序・最終離散stateが完全一致し、atT差が許容1/120秒以内である', () => {
    const config = validDestructionConfig({ battery: { profile: 'nonLipo', shortCircuitDurationLimitS: 3.0 } });
    const DT_FIXED = 1 / 120;
    const TOTAL_PHYSICS_STEPS = 360; // 3.0秒 ÷ 1/120秒 = 360(dtは両経路とも1/120固定)

    function runFixedDtBatched(physicsStepsPerFrame: 1 | 2) {
      let state = createInitialDestructionState('nonLipo');
      const allEvents: { mode: string; atT: number }[] = [];
      const frameCount = TOTAL_PHYSICS_STEPS / physicsStepsPerFrame;
      let physicsStepCounter = 0;
      for (let frameIndex = 1; frameIndex <= frameCount; frameIndex++) {
        for (let sub = 0; sub < physicsStepsPerFrame; sub++) {
          physicsStepCounter += 1;
          const isLastPhysicsStep = physicsStepCounter === TOTAL_PHYSICS_STEPS; // 物理step通算番号で決める
          const frame = frameInput({ shorted: true, batteryHeat: 1.0, coilCollapsedRisingEdge: isLastPhysicsStep });
          const result = advanceDestructionState(state, frame, config, motorRunContext(), DT_FIXED);
          state = result.state;
          for (const event of result.events) allEvents.push({ mode: event.mode, atT: event.causeLog.atT });
        }
      }
      return { events: allEvents, finalState: state };
    }

    const pathA = runFixedDtBatched(1); // 1物理step×2Nフレーム(2N=360→N=180)
    const pathB = runFixedDtBatched(2); // 2物理step×Nフレーム(N=180)

    // 発火有無・event件数/順序が一致する
    expect(pathA.events.map((e) => e.mode)).toEqual(['D01', 'D03']);
    expect(pathB.events.map((e) => e.mode)).toEqual(['D01', 'D03']);

    // 最終離散state(triggeredフラグ等)が一致する
    expect(pathA.finalState.modes.D01.triggered).toBe(pathB.finalState.modes.D01.triggered);
    expect(pathA.finalState.battery.profile).toBe('nonLipo');
    expect(pathB.finalState.battery.profile).toBe('nonLipo');
    if (pathA.finalState.battery.profile === 'nonLipo' && pathB.finalState.battery.profile === 'nonLipo') {
      expect(pathA.finalState.battery.d03.triggered).toBe(pathB.finalState.battery.d03.triggered);
    }

    // atT差が許容1/120秒以内である(既存非機能要件: 1フレーム=最大2物理ステップ)
    const tolerance = DT_FIXED;
    const atTA = Object.fromEntries(pathA.events.map((e) => [e.mode, e.atT]));
    const atTB = Object.fromEntries(pathB.events.map((e) => [e.mode, e.atT]));
    expect(Math.abs(atTA.D01 - atTB.D01)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(atTA.D03 - atTB.D03)).toBeLessThanOrEqual(tolerance);
  });
});

// ---------------------------------------------------------------------------
// P3-2ゲート3: D04(リポ経路)状態機械(計画v9 §2.2・§2.3・3節、正式Fable P3-2-Q1〜Q5・Q11裁定確定)
// ---------------------------------------------------------------------------

describe('destructionModes.ts: advanceDestructionState — D04個別設計(P3-2ゲート3、正式Fable Q4裁定)', () => {
  it('短絡経路: shortCircuitDurationS+ε>=limit かつ batteryHeat>=runawayHeatThreshold の複合条件で"none"→"swelling"へ遷移し、initiatingCauseLogを凍結記録する', () => {
    const config = lipoDestructionConfig({ battery: { profile: 'lipo', shortCircuitDurationLimitS: DT, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 2 * DT, smokingS: 2 * DT }, internalResistanceDegradationMultiplier: 1.5 } });
    let state = createInitialDestructionState('lipo');
    const result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, motorRunContext(), DT);
    state = result.state;
    expect(state.battery.profile).toBe('lipo');
    if (state.battery.profile === 'lipo') {
      expect(state.battery.d04.stage).toBe('swelling');
      expect(state.battery.d04.triggered).toBe(false); // burning到達まではtriggered=falseのまま
      expect(state.battery.d04.initiatingCauseLog).toEqual({ shortCircuitDurationS: DT, overDischargeRatio: null });
    }
    expect(result.events).toHaveLength(0); // swelling突入自体はevent発行対象ではない(burning到達時のみ)
  });

  it('過放電経路: frame.energyUsedRatio>=unsafeDischargeStartRatioで"none"→"swelling"へ遷移する(短絡なしでも成立)', () => {
    const config = lipoDestructionConfig({ battery: { profile: 'lipo', shortCircuitDurationLimitS: 999, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 2 * DT, smokingS: 2 * DT }, internalResistanceDegradationMultiplier: 1.5 } });
    const state = createInitialDestructionState('lipo');
    const result = advanceDestructionState(state, frameInput({ shorted: false, batteryHeat: 0, energyUsedRatio: 0.95 }), config, motorRunContext(), DT);
    expect(result.state.battery.profile).toBe('lipo');
    if (result.state.battery.profile === 'lipo') {
      expect(result.state.battery.d04.stage).toBe('swelling');
      expect(result.state.battery.d04.overDischargeActive).toBe(true);
      expect(result.state.battery.d04.initiatingCauseLog).toEqual({ shortCircuitDurationS: 0, overDischargeRatio: 0.95 });
    }
  });

  it('motor-onlyではframe.energyUsedRatioが常にundefinedになるため過放電経路が評価されず、短絡条件も未成立なら"none"のまま', () => {
    const config = lipoDestructionConfig({ battery: { profile: 'lipo', shortCircuitDurationLimitS: 999, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 2 * DT, smokingS: 2 * DT }, internalResistanceDegradationMultiplier: 1.5 } });
    const state = createInitialDestructionState('lipo');
    // energyUsedRatioを明示的にundefinedのまま(motor-onlyのbuildMotorOnlyFrameInputを模す)
    const result = advanceDestructionState(state, frameInput({ shorted: false, batteryHeat: 0 }), config, motorRunContext(), DT);
    expect(result.state.battery.profile).toBe('lipo');
    if (result.state.battery.profile === 'lipo') expect(result.state.battery.d04.stage).toBe('none');
  });

  it('overDischargeActiveはラッチせず毎フレーム再評価される(過放電条件が消えればfalseへ戻る)', () => {
    const config = lipoDestructionConfig({ battery: { profile: 'lipo', shortCircuitDurationLimitS: 999, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 100, smokingS: 100 }, internalResistanceDegradationMultiplier: 1.5 } });
    let state = createInitialDestructionState('lipo');
    let result = advanceDestructionState(state, frameInput({ energyUsedRatio: 0.95 }), config, motorRunContext(), DT);
    state = result.state;
    expect(state.battery.profile === 'lipo' && state.battery.d04.overDischargeActive).toBe(true);
    // 過放電条件が消えた次のフレーム: overDischargeActiveはfalseへ再評価される(ラッチしない)。
    // ただしstageはswellingのまま不可逆に進行する(Q4-2裁定)。
    result = advanceDestructionState(state, frameInput({ energyUsedRatio: 0.1 }), config, motorRunContext(), DT);
    expect(result.state.battery.profile === 'lipo' && result.state.battery.d04.overDischargeActive).toBe(false);
    expect(result.state.battery.profile === 'lipo' && result.state.battery.d04.stage).toBe('swelling');
  });

  describe('段階境界(dt分割不変性、固定dt=1/120s、正式Fable M-1是正版)', () => {
    // shortCircuitDurationLimitS=DTで即座にswellingへ突入させ、swellingS=2*DT・smokingS=3*DTの
    // 較正値でswelling→smoking→burningの各境界を1フレーム単位で検証する
    // (正式Fable P3-1-Q3の359/360/361フレーム型パターンをD04の各境界へ適用)。
    function boundaryTestConfig() {
      return lipoDestructionConfig({ battery: { profile: 'lipo', shortCircuitDurationLimitS: DT, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.99, stageDurations: { swellingS: 2 * DT, smokingS: 3 * DT }, internalResistanceDegradationMultiplier: 1.5 } });
    }

    function runFrames(count: number) {
      const config = boundaryTestConfig();
      let state = createInitialDestructionState('lipo');
      const stagesByFrame: Array<DestructionState['battery']> = [];
      for (let i = 1; i <= count; i++) {
        const result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, vehicleRunContextWithFireExposure(), DT);
        state = result.state;
        stagesByFrame.push(state.battery);
      }
      return stagesByFrame;
    }

    it('swelling→smoking境界: 2フレーム目はswelling、3フレーム目でsmokingへ遷移、4フレーム目もsmokingのまま', () => {
      const stages = runFrames(4);
      expect(stages[1].profile === 'lipo' && stages[1].d04.stage).toBe('swelling'); // 2フレーム目(index1)
      expect(stages[2].profile === 'lipo' && stages[2].d04.stage).toBe('smoking'); // 3フレーム目(境界)
      expect(stages[3].profile === 'lipo' && stages[3].d04.stage).toBe('smoking'); // 4フレーム目(1フレーム後)
    });

    it('smoking→burning境界: 5フレーム目はsmoking、6フレーム目でburningへ遷移、7フレーム目もburningのまま', () => {
      const stages = runFrames(7);
      expect(stages[4].profile === 'lipo' && stages[4].d04.stage).toBe('smoking'); // 5フレーム目(index4)
      expect(stages[5].profile === 'lipo' && stages[5].d04.stage).toBe('burning'); // 6フレーム目(境界)
      expect(stages[5].profile === 'lipo' && stages[5].d04.triggered).toBe(true);
      expect(stages[6].profile === 'lipo' && stages[6].d04.stage).toBe('burning'); // 7フレーム目(1フレーム後)
    });

    it('固定dt=1/120sのまま「1物理step×2Nフレーム」と「2物理step×Nフレーム」の異なるバッチングでも、離散結果(最終stage・triggered・triggeredAtT・causeLog.atT・発行event.mode列)が完全一致する(正式Fable M-1是正版、端数なしの2N対N、Suu_mot3裁定)', () => {
      // advanceDestructionStateはelapsedTimeSの絶対値比較のみで判定する純粋な逐次状態機械であり、
      // 「1フレーム1物理step」と「1フレーム2物理step」という外形上のグルーピングの違いに
      // 結果が依存しないことを、同一総物理step数(dt=1/120s固定、端数なしの2N対N)で確認する。
      const config = boundaryTestConfig();
      const TOTAL_PHYSICS_STEPS = 6; // boundaryTestConfig()はswelling(2*DT)+smoking(3*DT)を経て6フレーム目でburningへ到達する

      function runFixedDtBatched(physicsStepsPerFrame: 1 | 2) {
        let state = createInitialDestructionState('lipo');
        const events: string[] = [];
        const frameCount = TOTAL_PHYSICS_STEPS / physicsStepsPerFrame;
        for (let frameIndex = 1; frameIndex <= frameCount; frameIndex++) {
          for (let sub = 0; sub < physicsStepsPerFrame; sub++) {
            const result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, vehicleRunContextWithFireExposure(), DT);
            state = result.state;
            for (const e of result.events) events.push(e.mode);
          }
        }
        return { state, events };
      }

      const pathA = runFixedDtBatched(1); // 1物理step×2Nフレーム(2N=6→N=3)
      const pathB = runFixedDtBatched(2); // 2物理step×Nフレーム(N=3)

      expect(pathB.events).toEqual(pathA.events);
      expect(pathB.state.battery.profile === 'lipo' && pathB.state.battery.d04.stage).toBe(pathA.state.battery.profile === 'lipo' && pathA.state.battery.d04.stage);
      expect(pathB.state.battery.profile === 'lipo' && pathB.state.battery.d04.triggered).toBe(pathA.state.battery.profile === 'lipo' && pathA.state.battery.d04.triggered);
      expect(pathB.state.battery.profile === 'lipo' && pathB.state.battery.d04.triggeredAtT).toBe(pathA.state.battery.profile === 'lipo' && pathA.state.battery.d04.triggeredAtT);
      const causeLogAtTA = pathA.state.battery.profile === 'lipo' ? pathA.state.battery.d04.causeLog?.atT : undefined;
      const causeLogAtTB = pathB.state.battery.profile === 'lipo' ? pathB.state.battery.d04.causeLog?.atT : undefined;
      expect(causeLogAtTB).toBe(causeLogAtTA);
    });
  });

  it('burning到達時のcauseLog: shortCircuitDurationS/overDischargeRatioはburning到達時点の瞬間値、initiatingCauseはstage開始時点の凍結値(混合原因、短絡先行→過放電後行)', () => {
    // 短絡でswellingへ突入させた後、短絡を解消し(shortCircuitDurationSが瞬時に0リセット)、
    // burning到達直前フレームで新たに過放電条件も真にする。burning到達時のcauseLogは
    // その瞬間の値(shortCircuitDurationS=0、overDischargeRatio非null)を反映し、
    // initiatingCauseは突入時点の値(shortCircuitDurationS=DT、overDischargeRatio=null)の
    // まま変化しないことを確認する。
    const config = lipoDestructionConfig({ battery: { profile: 'lipo', shortCircuitDurationLimitS: DT, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: DT, smokingS: DT }, internalResistanceDegradationMultiplier: 1.5 } });
    let state = createInitialDestructionState('lipo');
    // フレーム1: 短絡条件でswellingへ突入(initiatingCauseLog: shortCircuitDurationS=DT, overDischargeRatio=null)
    let result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, vehicleRunContextWithFireExposure(), DT);
    state = result.state;
    expect(state.battery.profile === 'lipo' && state.battery.d04.stage).toBe('swelling');
    // フレーム2: 短絡解消(sharedShortCircuitDurationSが0へリセット)、代わりに過放電条件が真になる。
    // swellingS=DTのためこのフレームでsmokingへ境界到達。
    result = advanceDestructionState(state, frameInput({ shorted: false, batteryHeat: 0, energyUsedRatio: 0.95 }), config, vehicleRunContextWithFireExposure(), DT);
    state = result.state;
    expect(state.battery.profile === 'lipo' && state.battery.d04.stage).toBe('smoking');
    // フレーム3: smokingS=DTのためこのフレームでburningへ到達
    result = advanceDestructionState(state, frameInput({ shorted: false, batteryHeat: 0, energyUsedRatio: 0.95 }), config, vehicleRunContextWithFireExposure(), DT);
    expect(result.state.battery.profile === 'lipo' && result.state.battery.d04.stage).toBe('burning');
    const event = result.events.find((e) => e.mode === 'D04');
    expect(event).toBeDefined();
    if (event?.mode === 'D04') {
      expect(event.causeLog.shortCircuitDurationS).toBe(0); // burning到達時点の瞬間値(短絡は既に解消)
      expect(event.causeLog.overDischargeRatio).toBe(0.95); // burning到達時点の瞬間値
      expect(event.causeLog.initiatingCause).toEqual({ shortCircuitDurationS: DT, overDischargeRatio: null }); // stage開始時点の凍結値(短絡のみが原因だった)
    }
  });

  it('burning到達時のcauseLog(混合原因、逆順: 過放電先行→短絡後行): initiatingCauseは過放電のみの凍結値のまま、burning瞬間のcauseLog.shortCircuitDurationSは非0になる(正式Fable Q4(b)の非対称解消)', () => {
    // 過放電でswellingへ突入させた後(この時点でshortCircuitDurationSは0)、短絡を追加する。
    // 正式Fable Q4(b)裁定により、initiatingCauseは突入時点の値(過放電のみ、shortCircuitDurationS=0)の
    // まま変化しないが、burning到達時点のcauseLog.shortCircuitDurationSはその瞬間の実測値
    // (短絡が後から追加された分、非0)を反映する——短絡先行・過放電後行のケース(直前のテスト)とは
    // 非対称な解消になることを確認する。
    const config = lipoDestructionConfig({ battery: { profile: 'lipo', shortCircuitDurationLimitS: DT, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: DT, smokingS: DT }, internalResistanceDegradationMultiplier: 1.5 } });
    let state = createInitialDestructionState('lipo');
    // フレーム1: 過放電条件でswellingへ突入(initiatingCauseLog: shortCircuitDurationS=0, overDischargeRatio=0.95)
    let result = advanceDestructionState(state, frameInput({ shorted: false, batteryHeat: 0, energyUsedRatio: 0.95 }), config, vehicleRunContextWithFireExposure(), DT);
    state = result.state;
    expect(state.battery.profile === 'lipo' && state.battery.d04.stage).toBe('swelling');
    if (state.battery.profile === 'lipo') {
      expect(state.battery.d04.initiatingCauseLog).toEqual({ shortCircuitDurationS: 0, overDischargeRatio: 0.95 });
    }
    // フレーム2: 短絡を追加(過放電条件は与えない)。swellingS=DTのためこのフレームでsmokingへ境界到達。
    result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, vehicleRunContextWithFireExposure(), DT);
    state = result.state;
    expect(state.battery.profile === 'lipo' && state.battery.d04.stage).toBe('smoking');
    // フレーム3: 短絡継続。smokingS=DTのためこのフレームでburningへ到達
    result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, vehicleRunContextWithFireExposure(), DT);
    expect(result.state.battery.profile === 'lipo' && result.state.battery.d04.stage).toBe('burning');
    const event = result.events.find((e) => e.mode === 'D04');
    expect(event).toBeDefined();
    if (event?.mode === 'D04') {
      expect(event.causeLog.shortCircuitDurationS).toBe(2 * DT); // burning到達時点の瞬間値(短絡がフレーム2・3の2フレーム分継続)
      expect(event.causeLog.overDischargeRatio).toBeNull(); // burning到達時点の瞬間値(このフレームでは過放電条件を与えていない)
      expect(event.causeLog.initiatingCause).toEqual({ shortCircuitDurationS: 0, overDischargeRatio: 0.95 }); // stage開始時点の凍結値(過放電のみが原因だった)
    }
  });

  it('burning到達eventのaffectedRoles・bodyScorchDeltaFraction・magnetScorchDeltaFractionがrunContext/config由来の単一出典値と一致する', () => {
    const config = lipoDestructionConfig({
      battery: { profile: 'lipo', shortCircuitDurationLimitS: DT, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: DT / 4, smokingS: DT / 4 }, internalResistanceDegradationMultiplier: 1.5 },
      d04: { bodyScorchDeltaFraction: 0.33, magnetScorchDeltaFraction: 0.44 },
    });
    let state = createInitialDestructionState('lipo');
    // 1フレーム目でnone→swelling突入(この遷移自体はevent対象外)、stageDurations=DT/4・DT/4
    // (0は正の有限数を要求するvalidateDestructionConfigの契約に違反するため使わない)のため
    // 2フレーム目のadvanceD04StageBoundaryが同一呼び出し内でswelling→smoking→burningを
    // 連続通過してburningイベントを発行する(whileループの複数境界通過、§2.3)。
    state = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, vehicleRunContextWithFireExposure(), DT).state;
    const result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, vehicleRunContextWithFireExposure(), DT);
    const event = result.events.find((e) => e.mode === 'D04');
    expect(event).toBeDefined();
    if (event?.mode === 'D04') {
      expect(event.affectedRoles).toEqual(['body', 'magnet']); // vehicleRunContextWithFireExposure: bodyEquipped=true, adjacentRolesEquipped=['magnet']
      expect(event.bodyScorchDeltaFraction).toBe(0.33);
      expect(event.magnetScorchDeltaFraction).toBe(0.44);
    }
  });

  it('D04発火(prev.triggered=true)後、再度呼んでもeventは増えずcauseLogも不変(engine内部の冪等性)', () => {
    const config = lipoDestructionConfig({ battery: { profile: 'lipo', shortCircuitDurationLimitS: DT, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: DT / 4, smokingS: DT / 4 }, internalResistanceDegradationMultiplier: 1.5 } });
    let state = createInitialDestructionState('lipo');
    state = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, vehicleRunContextWithFireExposure(), DT).state; // none→swelling
    let result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, vehicleRunContextWithFireExposure(), DT); // swelling→burning(発火)
    state = result.state;
    expect(state.battery.profile === 'lipo' && state.battery.d04.triggered).toBe(true);
    const causeLogAfterFirstFire = state.battery.profile === 'lipo' ? state.battery.d04.causeLog : null;
    result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0, currentA: 999 }), config, vehicleRunContextWithFireExposure(), DT);
    expect(result.events.filter((e) => e.mode === 'D04')).toHaveLength(0);
    expect(result.state.battery.profile === 'lipo' && result.state.battery.d04.causeLog).toEqual(causeLogAfterFirstFire);
  });

  describe('境界負例(C5、3.6節): swellingのみ・smokingのみで終わる走行はD04 eventを一切発行しない', () => {
    it('swellingのみで終わる走行(smoking/burningへ到達しない)ではD04 eventが一切発行されない', () => {
      const config = lipoDestructionConfig({ battery: { profile: 'lipo', shortCircuitDurationLimitS: DT, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 100, smokingS: 100 }, internalResistanceDegradationMultiplier: 1.5 } });
      let state = createInitialDestructionState('lipo');
      const allEvents: string[] = [];
      for (let i = 0; i < 10; i++) {
        const result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, vehicleRunContextWithFireExposure(), DT);
        state = result.state;
        for (const e of result.events) allEvents.push(e.mode);
      }
      expect(state.battery.profile === 'lipo' && state.battery.d04.stage).toBe('swelling');
      expect(allEvents.filter((m) => m === 'D04')).toHaveLength(0);
    });

    it('smokingのみで終わる走行(burningへ到達しない)ではD04 eventが一切発行されない', () => {
      const config = lipoDestructionConfig({ battery: { profile: 'lipo', shortCircuitDurationLimitS: DT, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.9, stageDurations: { swellingS: 2 * DT, smokingS: 100 }, internalResistanceDegradationMultiplier: 1.5 } });
      let state = createInitialDestructionState('lipo');
      const allEvents: string[] = [];
      for (let i = 0; i < 10; i++) {
        const result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0 }), config, vehicleRunContextWithFireExposure(), DT);
        state = result.state;
        for (const e of result.events) allEvents.push(e.mode);
      }
      expect(state.battery.profile === 'lipo' && state.battery.d04.stage).toBe('smoking');
      expect(allEvents.filter((m) => m === 'D04')).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// P3-3ゲート3: D05(異常ブラシ火花)状態機械(計画v10 §4・§7、正式Fable P3-3-Q3・Q7・Q9・Q15-4裁定確定)
// ---------------------------------------------------------------------------

describe('destructionModes.ts: advanceDestructionState — D05個別設計(P3-3ゲート3、正式Fable Q3・Q7・Q9裁定)', () => {
  const D05_CONFIG = validDestructionConfig({
    d05: {
      brushSparkDurationLimitS: 3 * DT, // 3フレームでepisode成立(テストしやすい小さな値)
      brushSparkCurrentThresholdA: 2,
      brushWearRateRatio: 1,
      highCurrentPenalty: { kind: 'noPenalty' },
      wearPerAmpSecond: 0.1,
      recoveryFrames: 4,
      recoveryContactResistanceMultiplier: 1.5,
    },
  }).d05;

  function d05Config(overrides: Partial<DestructionConfig['d05']> = {}) {
    return validDestructionConfig({ d05: { ...D05_CONFIG, ...overrides } });
  }

  it('isChatteringThisFrame===falseの間はexcessCurrentAが正でもsparkDurationS/cumulativeSparkExposureが蓄積しない(通常整流の微小火花を除外、4.1節)', () => {
    const config = d05Config();
    let state = createInitialDestructionState('nonLipo');
    for (let i = 0; i < 5; i++) {
      state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 100, isChatteringThisFrame: false, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state;
    }
    expect(state.modes.D05.sparkDurationS).toBe(0);
    expect(state.modes.D05.cumulativeSparkExposure).toBe(0);
    expect(state.modes.D05.episodeCount).toBe(0);
  });

  it('isChatteringThisFrame===trueでもtheoreticalCurrentAが閾値以下ならexcessCurrentA=0となり蓄積しない', () => {
    const config = d05Config();
    let state = createInitialDestructionState('nonLipo');
    for (let i = 0; i < 5; i++) {
      state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 2, isChatteringThisFrame: true, chatterFramesLeft: 3 - i }), config, motorRunContext(), DT).state;
    }
    expect(state.modes.D05.sparkDurationS).toBe(0);
    expect(state.modes.D05.cumulativeSparkExposure).toBe(0);
  });

  it('isSparkActive中はcumulativeSparkExposureがexcessCurrentA×dtで無条件に加算される(episode成立可否と独立)', () => {
    const config = d05Config({ brushSparkDurationLimitS: 100 * DT }); // episodeが絶対成立しない長さにする
    let state = createInitialDestructionState('nonLipo');
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, isChatteringThisFrame: true, chatterFramesLeft: 10 }), config, motorRunContext(), DT).state;
    expect(state.modes.D05.cumulativeSparkExposure).toBeCloseTo((5 - 2) * DT, 12);
    expect(state.modes.D05.episodeCount).toBe(0); // episode自体は未成立
  });

  it('非アクティブ区間を挟むとsparkDurationS/episodeTriggeredは再武装(リセット)されるが、cumulativeSparkExposureは恒久蓄積のまま保持される', () => {
    const config = d05Config();
    let state = createInitialDestructionState('nonLipo');
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, isChatteringThisFrame: true, chatterFramesLeft: 10 }), config, motorRunContext(), DT).state;
    const exposureBefore = state.modes.D05.cumulativeSparkExposure;
    expect(state.modes.D05.sparkDurationS).toBeGreaterThan(0);
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, isChatteringThisFrame: false, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state;
    expect(state.modes.D05.sparkDurationS).toBe(0);
    expect(state.modes.D05.episodeTriggered).toBe(false);
    expect(state.modes.D05.cumulativeSparkExposure).toBe(exposureBefore); // 非アクティブでもリセットしない
  });

  it('sparkDurationSがbrushSparkDurationLimitSへ到達した瞬間にjustCrossed=trueとなりepisodeが成立する(episodeCount=1・event発行・isFirstThisSession=true)', () => {
    const config = d05Config(); // brushSparkDurationLimitS = 3*DT
    let state = createInitialDestructionState('nonLipo');
    let result;
    for (let i = 1; i <= 3; i++) {
      result = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, currentA: 0, rpm: 200, isChatteringThisFrame: true, chatterFramesLeft: 3 - i }), config, motorRunContext(), DT);
      state = result.state;
    }
    expect(state.modes.D05.episodeCount).toBe(1);
    expect(state.modes.D05.firstEpisodeAtT).toBeCloseTo(3 * DT, 9);
    expect(state.modes.D05.causeLog).not.toBeNull();
    const event = result!.events.find((e) => e.mode === 'D05');
    expect(event).toBeDefined();
    if (event?.mode === 'D05') {
      expect(event.isFirstThisSession).toBe(true);
      expect(event.causeLog.temperature).toEqual({ kind: 'unavailable' });
      expect(event.causeLog.currentA).toBe(0); // 正式Fable Q9裁定: チャタリング中の実電流は常に0
      expect(event.causeLog.theoreticalCurrentA).toBe(5); // 理論遮断電流を別記
      expect(event.causeLog.sparkDurationS).toBeCloseTo(3 * DT, 9);
    }
  });

  it('2episode実経路: 1回目のepisode成立(isFirstThisSession:true)後、非アクティブ区間を挟んで2回目のepisodeが成立すると、event(isFirstThisSession:false・そのepisode固有のcauseLog)が発行されるが、D05Progress.causeLogは1回目のまま不変(必須DoD、4.3節)', () => {
    const config = d05Config();
    let state = createInitialDestructionState('nonLipo');
    // 1回目のepisode
    for (let i = 1; i <= 3; i++) {
      state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, rpm: 100, isChatteringThisFrame: true, chatterFramesLeft: 3 - i }), config, motorRunContext(), DT).state;
    }
    const firstCauseLog = state.modes.D05.causeLog;
    expect(state.modes.D05.episodeCount).toBe(1);

    // 非アクティブ区間(再武装)
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, isChatteringThisFrame: false, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state;

    // 2回目のepisode(rpmを変えて瞬間値の独立性を確認)
    let result;
    for (let i = 1; i <= 3; i++) {
      result = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, rpm: 999, isChatteringThisFrame: true, chatterFramesLeft: 3 - i }), config, motorRunContext(), DT);
      state = result.state;
    }
    expect(state.modes.D05.episodeCount).toBe(2);
    expect(state.modes.D05.causeLog).toEqual(firstCauseLog); // Progress.causeLogは初回のまま不変
    const event = result!.events.find((e) => e.mode === 'D05');
    expect(event).toBeDefined();
    if (event?.mode === 'D05') {
      expect(event.isFirstThisSession).toBe(false); // 2回目以降はfalse
      expect(event.causeLog.rpm).toBe(999); // event自身のcauseLogはこのepisode固有の瞬間値
    }
  });

  it('episode最大継続時間の到達可能性(必須DoD、4.3節): brushSparkDurationLimitSがCHATTER_BURST_FRAMES/120秒を超える較正値では、単一の連続バースト内でepisodeが構造的に到達不能になる', () => {
    const config = d05Config({ brushSparkDurationLimitS: (CHATTER_BURST_FRAMES + 1) / 120 }); // 到達不能な較正値
    let state = createInitialDestructionState('nonLipo');
    // CHATTER_BURST_FRAMES回連続でチャタリング(バースト全長)させても閾値に届かない
    for (let i = 0; i < CHATTER_BURST_FRAMES; i++) {
      state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, isChatteringThisFrame: true, chatterFramesLeft: CHATTER_BURST_FRAMES - 1 - i }), config, motorRunContext(), DT).state;
    }
    expect(state.modes.D05.episodeCount).toBe(0);
  });

  it('cumulativeWearDeltaFraction: isSparkActive中、brushWearRateRatio×wearPerAmpSecond×excessCurrentA×dtが無次元差分として累積される(highCurrentPenalty=noPenalty、4.4節)', () => {
    const config = d05Config({ brushWearRateRatio: 2, wearPerAmpSecond: 0.5, highCurrentPenalty: { kind: 'noPenalty' } });
    let state = createInitialDestructionState('nonLipo');
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, isChatteringThisFrame: true, chatterFramesLeft: 10 }), config, motorRunContext(), DT).state;
    const excessCurrentA = 5 - config.d05.brushSparkCurrentThresholdA;
    expect(state.modes.D05.cumulativeWearDeltaFraction).toBeCloseTo(excessCurrentA * DT * 2 * 0.5, 12);
  });

  it('cumulativeWearDeltaFraction: highCurrentPenalty=thresholdPenaltyかつtheoreticalCurrentAが閾値超のときのみ倍率が乗算される(4.4節)', () => {
    const config = d05Config({ brushWearRateRatio: 1, wearPerAmpSecond: 1, highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 4, highCurrentPenaltyMultiplier: 3 } });
    let state = createInitialDestructionState('nonLipo');
    // theoreticalCurrentA=5(閾値4を超える)→倍率3が乗算される
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, isChatteringThisFrame: true, chatterFramesLeft: 10 }), config, motorRunContext(), DT).state;
    const excessCurrentA = 5 - config.d05.brushSparkCurrentThresholdA;
    expect(state.modes.D05.cumulativeWearDeltaFraction).toBeCloseTo(excessCurrentA * DT * 1 * 3 * 1, 12);
  });

  it('cumulativeWearDeltaFraction: highCurrentPenalty=thresholdPenaltyでもtheoreticalCurrentAが閾値以下なら倍率1のまま(ペナルティ不適用)', () => {
    const config = d05Config({ brushWearRateRatio: 1, wearPerAmpSecond: 1, highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 100, highCurrentPenaltyMultiplier: 3 } });
    let state = createInitialDestructionState('nonLipo');
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, isChatteringThisFrame: true, chatterFramesLeft: 10 }), config, motorRunContext(), DT).state;
    const excessCurrentA = 5 - config.d05.brushSparkCurrentThresholdA;
    expect(state.modes.D05.cumulativeWearDeltaFraction).toBeCloseTo(excessCurrentA * DT * 1 * 1 * 1, 12);
  });

  it('D05は常に非終端(triggeredフィールド自体を持たず、何度でもepisodeが成立しうる)ため、複数episode後もadvanceDestructionStateは呼び出し続けられる', () => {
    const config = d05Config();
    let state = createInitialDestructionState('nonLipo');
    for (let episode = 0; episode < 3; episode++) {
      for (let i = 1; i <= 3; i++) {
        state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, isChatteringThisFrame: true, chatterFramesLeft: 3 - i }), config, motorRunContext(), DT).state;
      }
      state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 5, isChatteringThisFrame: false, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state;
    }
    expect(state.modes.D05.episodeCount).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // 7.2節: 一時接触抵抗悪化の回復区間モデル(正式Fable P3-3-Q7裁定確定、候補a)
  // ---------------------------------------------------------------------------

  it('回復区間モデル: バースト終了検出(isChatteringThisFrame===true && chatterFramesLeft===0)の直後stepでrecoveryFramesLeft=config.recoveryFramesへ設定される', () => {
    const config = d05Config({ recoveryFrames: 4 });
    let state = createInitialDestructionState('nonLipo');
    // 3フレームのバースト(chatterFramesLeft: 2,1,0)、theoreticalCurrentAは閾値以下にして
    // episode自体は成立させず回復区間モデルの検出だけを見る。
    for (const chatterFramesLeft of [2, 1, 0]) {
      state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: true, chatterFramesLeft }), config, motorRunContext(), DT).state;
    }
    expect(state.modes.D05.recoveryFramesLeft).toBe(4);
  });

  it('回復区間モデル: バースト終了後、非チャタリングが続く限りrecoveryFramesLeftが毎step1ずつ減算され、0で頭打ちになる', () => {
    const config = d05Config({ recoveryFrames: 3 });
    let state = createInitialDestructionState('nonLipo');
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: true, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state;
    expect(state.modes.D05.recoveryFramesLeft).toBe(3);
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: false, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state;
    expect(state.modes.D05.recoveryFramesLeft).toBe(2);
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: false, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state;
    expect(state.modes.D05.recoveryFramesLeft).toBe(1);
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: false, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state;
    expect(state.modes.D05.recoveryFramesLeft).toBe(0);
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: false, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state;
    expect(state.modes.D05.recoveryFramesLeft).toBe(0); // 頭打ち、負にならない
  });

  it('回復区間モデル: 回復区間中(recoveryFramesLeft>0)に新規チャタリングバーストが始まる(継続中、まだ終わらない)と、recoveryFramesLeftは直ちに0へリセットされる(新規バースト優先規則、P19是正)', () => {
    const config = d05Config({ recoveryFrames: 5 });
    let state = createInitialDestructionState('nonLipo');
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: true, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state;
    expect(state.modes.D05.recoveryFramesLeft).toBe(5);
    // 回復区間中に新規バーストが始まる(このstepはまだ継続中、chatterFramesLeft>0で次stepへ持ち越す)
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: true, chatterFramesLeft: 3 }), config, motorRunContext(), DT).state;
    expect(state.modes.D05.recoveryFramesLeft).toBe(0);
  });

  it('回復区間モデル: 回復区間中の新規バーストが再度終了した時点で、recoveryFramesLeftはconfig.recoveryFramesへ再設定される(毎回リセットして最新のバースト終了からの回復期間だけを数える)', () => {
    const config = d05Config({ recoveryFrames: 5 });
    let state = createInitialDestructionState('nonLipo');
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: true, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state; // 1回目のバースト終了
    expect(state.modes.D05.recoveryFramesLeft).toBe(5);
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: true, chatterFramesLeft: 2 }), config, motorRunContext(), DT).state; // 2回目のバースト開始(継続中)
    expect(state.modes.D05.recoveryFramesLeft).toBe(0);
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: true, chatterFramesLeft: 1 }), config, motorRunContext(), DT).state; // 継続中
    expect(state.modes.D05.recoveryFramesLeft).toBe(0);
    state = advanceDestructionState(state, frameInput({ theoreticalCurrentA: 0, isChatteringThisFrame: true, chatterFramesLeft: 0 }), config, motorRunContext(), DT).state; // 2回目のバースト終了
    expect(state.modes.D05.recoveryFramesLeft).toBe(5); // 再設定
  });
});

// ---------------------------------------------------------------------------
// P3-2ゲート3: D07(三段開示骨格)状態機械(計画v9 §2.5、正式Fable P3-2-Q2・Q3・Q11裁定確定)
// ---------------------------------------------------------------------------

describe('destructionModes.ts: advanceDestructionState — D07個別設計(P3-2ゲート3、正式Fable Q11裁定)', () => {
  it('熱ゲージ(magnetHeatGaugeRatio)はirreversible.kindによらず常時更新される(HUD読み取り専用境界のため、nonDemagnetizingでも計算する)', () => {
    const config = validDestructionConfig({
      d07: { thermal: { conductionCoefficient: 0.1, dissipationCoefficient: 0.05 }, irreversible: { kind: 'nonDemagnetizing' } },
    });
    const state = createInitialDestructionState('nonLipo');
    const result = advanceDestructionState(state, frameInput({ currentA: 2 }), config, motorRunContext(), DT);
    expect(result.state.modes.D07.magnetHeatGaugeRatio).toBeGreaterThan(0);
  });

  it('nonDemagnetizing磁石ではいかなる入力でもreversibleDroopActive/irreversibleTriggeredが真にならない(正式Fable Q11負例)', () => {
    const config = validDestructionConfig({
      d07: { thermal: { conductionCoefficient: 999, dissipationCoefficient: 0.0001 }, irreversible: { kind: 'nonDemagnetizing' } },
    });
    let state = createInitialDestructionState('nonLipo');
    for (let i = 0; i < 50; i++) {
      const result = advanceDestructionState(state, frameInput({ currentA: 1e6 }), config, motorRunContext(), DT);
      state = result.state;
      expect(state.modes.D07.reversibleDroopActive).toBe(false);
      expect(state.modes.D07.irreversibleTriggered).toBe(false);
      expect(result.events.filter((e) => e.mode === 'D07')).toHaveLength(0);
    }
  });

  it('熱ゲージはMath.min(1,...)/Math.max(0,...)で0〜1へclampされる(極端な電流でも1を超えない)', () => {
    const config = validDestructionConfig({
      d07: { thermal: { conductionCoefficient: 1e9, dissipationCoefficient: 1e-6 }, irreversible: { kind: 'nonDemagnetizing' } }, // dissipationCoefficient=0はvalidateDestructionConfigの正の有限数契約に違反するため十分小さい正値を使う
    });
    const state = createInitialDestructionState('nonLipo');
    const result = advanceDestructionState(state, frameInput({ currentA: 1e9 }), config, motorRunContext(), DT);
    expect(result.state.modes.D07.magnetHeatGaugeRatio).toBe(1);
    expect(result.state.modes.D07.magnetHeatGaugeRatio).toBeLessThanOrEqual(1);
    expect(result.state.modes.D07.magnetHeatGaugeRatio).toBeGreaterThanOrEqual(0);
  });

  it('reversibleDroopThreshold到達でreversibleDroopActive=trueになる(まだmagnetHeatGaugeLimit未到達)', () => {
    const config = validDestructionConfig({
      d07: { thermal: { conductionCoefficient: 1, dissipationCoefficient: 1e-6 }, irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.9, reversibleDroopThreshold: 0.01, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 } },
    });
    const state = createInitialDestructionState('nonLipo');
    const result = advanceDestructionState(state, frameInput({ currentA: 2 }), config, motorRunContext(), DT);
    expect(result.state.modes.D07.reversibleDroopActive).toBe(true);
    expect(result.state.modes.D07.irreversibleTriggered).toBe(false);
  });

  it('magnetHeatGaugeLimit到達で不可逆到達(irreversibleTriggered=true)し、event(isFirstThisSession:true)が一度だけ発行される。demagnetizationDeltaFractionはconfig由来の単一出典値', () => {
    const config = validDestructionConfig({
      d07: { thermal: { conductionCoefficient: 1, dissipationCoefficient: 1e-6 }, irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.005, reversibleDroopThreshold: 0.001, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.37 } },
    });
    let state = createInitialDestructionState('nonLipo');
    let result = advanceDestructionState(state, frameInput({ currentA: 2 }), config, motorRunContext(), DT);
    state = result.state;
    expect(state.modes.D07.irreversibleTriggered).toBe(true);
    expect(state.modes.D07.irreversibleTriggeredAtT).toBeCloseTo(DT, 9);
    const event = result.events.find((e) => e.mode === 'D07');
    expect(event).toBeDefined();
    if (event?.mode === 'D07') {
      expect(event.isFirstThisSession).toBe(true);
      expect(event.demagnetizationDeltaFraction).toBe(0.37);
      expect(event.causeLog.temperature).toEqual({ kind: 'uncalibratedGauge', ratio: state.modes.D07.magnetHeatGaugeRatio });
    }

    // 不可逆到達後も熱ゲージは更新を続けるが、eventは再発行されない(v12凍結契約)
    result = advanceDestructionState(state, frameInput({ currentA: 2 }), config, motorRunContext(), DT);
    expect(result.events.filter((e) => e.mode === 'D07')).toHaveLength(0);
    expect(result.state.modes.D07.magnetHeatGaugeRatio).not.toBe(state.modes.D07.magnetHeatGaugeRatio); // 熱ゲージ自体は動き続ける
    expect(result.state.modes.D07.causeLog).toEqual(state.modes.D07.causeLog); // causeLogは不変(初回固定)
  });
});

describe('destructionModes.ts: advanceDestructionState — events固定順序(D01→D04→D07、ゲート3 DoD: 新規モード込み固定順序の機械検証)', () => {
  it('D01・D04(burning)・D07が同一物理stepで同時発火する境界入力では、eventsが常に["D01","D04","D07"]の順で返る', () => {
    const config = lipoDestructionConfig({
      battery: { profile: 'lipo', shortCircuitDurationLimitS: DT, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.99, stageDurations: { swellingS: 2 * DT, smokingS: 3 * DT }, internalResistanceDegradationMultiplier: 1.5 },
      d07: { thermal: { conductionCoefficient: 1, dissipationCoefficient: 1e-9 }, irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.045, reversibleDroopThreshold: 0.01, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 } },
    });
    let state = createInitialDestructionState('lipo');
    let result: ReturnType<typeof advanceDestructionState> | undefined;
    // D04: shortCircuitDurationLimitS=DT・stageDurations={2*DT,3*DT}の較正値により6フレーム目でburningへ到達する
    // (段階境界のテストと同型)。D07: currentA=1(frameInputの既定値)・conductionCoefficient=1・
    // dissipationCoefficient≈0の較正により、6フレーム分のI²R積算(6*(1/120)=0.05)がmagnetHeatGaugeLimit(0.045)を
    // 6フレーム目でのみ超える。D01: coilCollapsedRisingEdgeを6フレーム目のみtrueにする。
    for (let i = 1; i <= 6; i++) {
      result = advanceDestructionState(state, frameInput({ shorted: true, batteryHeat: 1.0, coilCollapsedRisingEdge: i === 6 }), config, vehicleRunContextWithFireExposure(), DT);
      state = result.state;
    }
    expect(result!.events.map((e) => e.mode)).toEqual(['D01', 'D04', 'D07']);
  });

  it('D01・D02・D04(burning)・D05・D07が同一物理stepで同時発火する境界入力では、eventsが常に["D01","D02","D04","D05","D07"]の順で返る(P3-3ゲート3 DoD: D02・D05込みの固定順序)', () => {
    const config = lipoDestructionConfig({
      d02: { smokeGaugeThreshold: 0.02, coilOverheatGaugeLimit: 0.045, conductionScale: 1, dissipationCoefficient: 1e-9, smokeResistanceMultiplier: 1.2 },
      battery: { profile: 'lipo', shortCircuitDurationLimitS: DT, runawayHeatThreshold: 1.0, unsafeDischargeStartRatio: 0.99, stageDurations: { swellingS: 2 * DT, smokingS: 3 * DT }, internalResistanceDegradationMultiplier: 1.5 },
      d05: {
        brushSparkDurationLimitS: 6 * DT,
        brushSparkCurrentThresholdA: 2,
        brushWearRateRatio: 1,
        highCurrentPenalty: { kind: 'noPenalty' },
        wearPerAmpSecond: 0.1,
        recoveryFrames: 4,
        recoveryContactResistanceMultiplier: 1.5,
      },
      d07: { thermal: { conductionCoefficient: 1, dissipationCoefficient: 1e-9 }, irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.045, reversibleDroopThreshold: 0.01, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 } },
    });
    let state = createInitialDestructionState('lipo');
    let result: ReturnType<typeof advanceDestructionState> | undefined;
    // 全モードとも6フレーム目でちょうど閾値を超えるよう較正済み(D02/D07はcoilLossW=1・
    // currentA=1・conductionScale=1・dissipationCoefficient≈0によりratio≈n/120、
    // limit=0.045は5フレーム目(0.0417)未満・6フレーム目(0.05)超。D05はbrushSparkDurationLimitS
    // =6*DTにより6フレーム連続のisSparkActiveでちょうど到達。D01/D04は既存calibrationのまま)。
    for (let i = 1; i <= 6; i++) {
      result = advanceDestructionState(
        state,
        frameInput({ shorted: true, batteryHeat: 1.0, coilCollapsedRisingEdge: i === 6, coilLossW: 1, theoreticalCurrentA: 5, isChatteringThisFrame: true, chatterFramesLeft: 0 }),
        config,
        vehicleRunContextWithFireExposure(),
        DT,
      );
      state = result.state;
    }
    expect(result!.events.map((e) => e.mode)).toEqual(['D01', 'D02', 'D04', 'D05', 'D07']);
  });
});
