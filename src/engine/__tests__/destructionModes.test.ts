// P3-0(docs/phase3-p3-0-plan.md v7 8.1節)+P3-1(docs/phase3-p3-1-plan.md v7 §3・§4・§5・§6)。
// createInitialDestructionStateの型テストに加え、advanceDestructionState本体(D01/D03のみ、
// P3-0-Q6裁定範囲)をテストする。
import { describe, expect, it } from 'vitest';
import {
  advanceDestructionState,
  createInitialDestructionState,
  type DestructionConfig,
  type DestructionFrameInput,
  type DestructionRunContext,
} from '../destructionModes';

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
    ...overrides,
  };
}

// P3-0-Q6不変条件のproduction-valid fixture比較用: d02/d05/d06/d07/d09は有効な値域の値を持つが、
// P3-1のD01/D03分岐からは一切参照されない。
function validDestructionConfig(overrides: Partial<DestructionConfig> = {}): DestructionConfig {
  return {
    battery: { profile: 'nonLipo', shortCircuitDurationLimitS: 3.0 },
    d02: { smokeGaugeThreshold: 0.5, coilOverheatGaugeLimit: 1.0 },
    d05: { brushSparkDurationLimitS: 0.5, brushSparkCurrentThresholdA: 5 },
    d06: { breakage: { kind: 'breakable', gearStrengthThresholdNm: 1.0 } },
    d07: { magnetHeatGaugeLimit: 0.8, reversibleDroopThreshold: 0.5 },
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
    },
    ...overrides,
  });
}

function motorRunContext(): DestructionRunContext {
  return { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null };
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

    // 2回目は全く異なるframe値(currentA/rpm)を与えて再呼出しする
    const secondResult = advanceDestructionState(state, frameInput({ coilCollapsedRisingEdge: true, currentA: 999, rpm: 999999 }), validDestructionConfig(), motorRunContext(), DT);
    expect(secondResult.events).toHaveLength(0);
    expect(secondResult.state.modes.D01).toEqual(snapshotAfterFirstFire); // D01Progress全体(causeLog込み)が初回値のまま
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
  it('極端なframe入力を与えても、発行されるeventのmodeは常にD01またはD03のみである(D04含む禁止集合全体を直接検証)', () => {
    // 正式Q6はP3-1時点で「D01/D03以外を発行不可」(D04も禁止集合に含まれる、Suu指摘)。
    // 禁止リストの列挙ではなく、許可リスト(D01|D03)のみを直接検証する
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
        expect(['D01', 'D03'], `許可リスト(D01|D03)外のmodeが発行されました: ${event.mode}`).toContain(event.mode);
      }
    }
  });

  it('config.d02/d05/d06/d07/d09の値をどれだけ変えてもD01/D03の判定結果は変化しない(production-valid fixture比較)', () => {
    const frame = frameInput({ shorted: true, batteryHeat: 1.0, coilCollapsedRisingEdge: true });
    const state = createInitialDestructionState('nonLipo');

    const configA = validDestructionConfig();
    const configB = validDestructionConfig({
      d02: { smokeGaugeThreshold: 0.99, coilOverheatGaugeLimit: 0.01 },
      d05: { brushSparkDurationLimitS: 9.9, brushSparkCurrentThresholdA: 0.001 },
      d06: { breakage: { kind: 'nonBreakable' } },
      d07: { magnetHeatGaugeLimit: 0.01, reversibleDroopThreshold: 0.99 },
      d09: { bearingSeizureGaugeLimit: 0.001 },
    });

    const resultA = advanceDestructionState(state, frame, configA, motorRunContext(), DT);
    const resultB = advanceDestructionState(state, frame, configB, motorRunContext(), DT);
    expect(resultA.events).toEqual(resultB.events);
    expect(resultA.state).toEqual(resultB.state);
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

describe('destructionModes.ts: advanceDestructionState — dt分割不変性(P3-1 §11・§14.2)', () => {
  it('同一総時間(3.0秒、D03境界+D01同時発火)を1/120秒刻みと1/240秒×2刻みで進めても、発火有無・event件数順序・最終離散stateが一致し、atT差が許容1/120秒以内である', () => {
    const config = validDestructionConfig({ battery: { profile: 'nonLipo', shortCircuitDurationLimitS: 3.0 } });

    function runPath(dt: number, steps: number) {
      let state = createInitialDestructionState('nonLipo');
      const allEvents: { mode: string; atT: number }[] = [];
      for (let i = 1; i <= steps; i++) {
        const isLastStep = i === steps;
        const frame = frameInput({ shorted: true, batteryHeat: 1.0, coilCollapsedRisingEdge: isLastStep });
        const result = advanceDestructionState(state, frame, config, motorRunContext(), dt);
        state = result.state;
        for (const event of result.events) allEvents.push({ mode: event.mode, atT: event.causeLog.atT });
      }
      return { events: allEvents, finalState: state };
    }

    const pathA = runPath(1 / 120, 360); // 1/120秒刻み、360ステップ=3.0秒
    const pathB = runPath(1 / 240, 720); // 1/240秒刻み、720ステップ=同じ3.0秒

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
    const tolerance = 1 / 120;
    const atTA = Object.fromEntries(pathA.events.map((e) => [e.mode, e.atT]));
    const atTB = Object.fromEntries(pathB.events.map((e) => [e.mode, e.atT]));
    expect(Math.abs(atTA.D01 - atTB.D01)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(atTA.D03 - atTB.D03)).toBeLessThanOrEqual(tolerance);
  });
});
