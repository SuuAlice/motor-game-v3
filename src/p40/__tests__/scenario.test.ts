// P4-0 G4: **人間承認済みexact値(2026-08-26)を固定する**テスト。
//
// ここが落ちたら「承認された固定シナリオが別物になった」ことを意味する。値を書き換えて
// 通すのではなく、再承認を取ること。承認対象は記録hash・30ターン・aggregate・3走結果。
// 正式sweep script SHA-256=3982b0a34a68163f552b32e5eeb7e2d7bd89cfd813fbdba6db35c0c7d31ebea8
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PHASE4_AXIS_OFFSET_COEFFICIENT_MM,
  PHASE4_CANDIDATE_TURNS,
  PHASE4_MATERIAL_SELECTION,
  PHASE4_PLAYER_LEFT_TURNS,
  PHASE4_PLAYER_REVERSED_RANGE,
  PHASE4_RIVAL_LEFT_TURNS,
  PHASE4_SECTION_BOUNDARIES_M,
  PHASE4_SEED,
  buildPhase4PlayerFirstRecord,
  buildPhase4PlayerFixedRecord,
  buildPhase4RivalRecord,
  resolvePhase4BaselineInputs,
  resolvePhase4FixedConfigs,
  resolvePhase4Track,
} from '../scenario';
import { PHASE4_DT_S, resolveFinishInfo, resolveSectionTimes, runPhase4Vehicle } from '../sessionRunner';
import type { WindingRecord } from '../../materials/windingRecord';
import type { MaterialCompositionBaseline } from '../../materials/materialMapping';
import { resolveProductionMaterialCompositionBaseline } from '../../store/runOutcomeApplication';

/**
 * baselineは**呼出し側(App)と同じ経路**で作る(2026-08-26裁定・案C)。
 * `resolvePhase4BaselineInputs()`の戻り値をS-3関数へ渡すだけで、テストが独自の
 * baselineを組み立てないようにする——独自に組むと、実際の配線がずれても気づけない。
 */
function phase4Baseline(): MaterialCompositionBaseline {
  const { rawPlayerMotorConfig, garageBuild } = resolvePhase4BaselineInputs();
  return resolveProductionMaterialCompositionBaseline(rawPlayerMotorConfig, garageBuild);
}

function sha256Of(record: WindingRecord): string {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

function armCounts(record: WindingRecord): { left: number; right: number; straddle: number } {
  return {
    left: record.filter((t) => t.arm === 'left').length,
    right: record.filter((t) => t.arm === 'right').length,
    straddle: record.filter((t) => t.arm === 'straddle').length,
  };
}

function run(record: WindingRecord) {
  const { baseMotorConfig, carConfig } = resolvePhase4FixedConfigs(PHASE4_MATERIAL_SELECTION, phase4Baseline());
  const result = runPhase4Vehicle({
    record,
    baseMotorConfig,
    carConfig,
    track: resolvePhase4Track(),
    seed: PHASE4_SEED,
    axisOffsetCoefficientMm: PHASE4_AXIS_OFFSET_COEFFICIENT_MM,
  });
  expect(result.ok, result.ok ? '' : result.reason).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.run;
}

describe('承認済みexact定数', () => {
  it('素材構成・K_axis・seed・ターン数・腕本数・逆巻き区間が承認値のまま', () => {
    expect(PHASE4_MATERIAL_SELECTION).toStrictEqual({
      wireId: 'wire-copper-standard',
      magnetId: 'magnet-neodymium',
      gearId: 'gear-pom',
      batteryId: 'battery-alkaline',
      brushId: 'brush-carbon',
    });
    expect(PHASE4_AXIS_OFFSET_COEFFICIENT_MM).toBe(3);
    expect(PHASE4_SEED).toBe(1);
    expect(PHASE4_CANDIDATE_TURNS).toBe(30);
    expect(PHASE4_PLAYER_LEFT_TURNS).toBe(21);
    expect(PHASE4_RIVAL_LEFT_TURNS).toBe(23);
    expect(PHASE4_PLAYER_REVERSED_RANGE).toStrictEqual({ start: 10, end: 11 });
  });
});

describe('承認済み巻線記録(正規command/reducer経路で生成)', () => {
  it('player初走: 30ターン・左21/右9・turn10だけ逆巻き・hash一致', () => {
    const record = buildPhase4PlayerFirstRecord();
    expect(record).toHaveLength(30);
    expect(armCounts(record)).toStrictEqual({ left: 21, right: 9, straddle: 0 });
    expect(record.filter((t) => t.direction === -1)).toHaveLength(1);
    expect(record[10]!.direction).toBe(-1);
    expect(sha256Of(record)).toBe('57987dce48b93e4418c493221a934463c27746149fa98b3fbdc1daa476d15c54');
  });

  it('player修正後: 腕構成は初走のまま全ターン正転・hash一致', () => {
    const record = buildPhase4PlayerFixedRecord();
    expect(record).toHaveLength(30);
    expect(armCounts(record)).toStrictEqual({ left: 21, right: 9, straddle: 0 });
    expect(record.every((t) => t.direction === 1)).toBe(true);
    expect(sha256Of(record)).toBe('c9f982aa3d63e55312afc1468db953644f6d868c37fbaab65733cd2c0ab86b22');
  });

  it('rival: 30ターン・左23/右7・全正転・hash一致', () => {
    const record = buildPhase4RivalRecord();
    expect(record).toHaveLength(30);
    expect(armCounts(record)).toStrictEqual({ left: 23, right: 7, straddle: 0 });
    expect(record.every((t) => t.direction === 1)).toBe(true);
    expect(sha256Of(record)).toBe('0ea5c0afd299d5d83056f9cfd238188881bde8b882a9efbe6badad78762d54a0');
  });

  it('修正で動くのはdirectionだけで、腕構成は1ターンも動かない', () => {
    const first = buildPhase4PlayerFirstRecord();
    const fixed = buildPhase4PlayerFixedRecord();
    expect(fixed.map((t) => t.arm)).toStrictEqual(first.map((t) => t.arm));
    expect(fixed.map((t) => t.position)).toStrictEqual(first.map((t) => t.position));
    expect(fixed.map((t) => t.tension)).toStrictEqual(first.map((t) => t.tension));
  });
});

describe('承認済みaggregate', () => {
  it('player初走: effectiveTurnsRatio=28/30、balanceErrorRatio=0.4、axisOffsetMm=1.2', () => {
    const { aggregate } = run(buildPhase4PlayerFirstRecord());
    expect(aggregate.coilTurns).toBe(30);
    expect(aggregate.effectiveTurnsRatio).toBeCloseTo(28 / 30, 12);
    expect(aggregate.balanceErrorRatio).toBeCloseTo(0.4, 12);
    expect(aggregate.axisOffsetMm).toBeCloseTo(1.2, 12);
  });

  it('player修正後: 磁気だけが戻り、balanceErrorRatio・axisOffsetMmは初走と同一', () => {
    const first = run(buildPhase4PlayerFirstRecord()).aggregate;
    const fixed = run(buildPhase4PlayerFixedRecord()).aggregate;
    expect(fixed.effectiveTurnsRatio).toBe(1);
    expect(fixed.balanceErrorRatio).toBe(first.balanceErrorRatio);
    expect(fixed.axisOffsetMm).toBe(first.axisOffsetMm);
    expect(fixed.coilTurns).toBe(first.coilTurns);
  });

  it('rival: effectiveTurnsRatio=1、balanceErrorRatio=16/30、axisOffsetMm=1.6', () => {
    const { aggregate } = run(buildPhase4RivalRecord());
    expect(aggregate.effectiveTurnsRatio).toBe(1);
    expect(aggregate.balanceErrorRatio).toBeCloseTo(16 / 30, 12);
    expect(aggregate.axisOffsetMm).toBeCloseTo(1.6, 12);
  });
});

describe('承認済み3走の走行結果', () => {
  const CASES = [
    { name: 'player初走', record: buildPhase4PlayerFirstRecord, steps: 2690, sections: [6.4083, 11.6583, 17.2083, 22.4167] },
    { name: 'player修正後', record: buildPhase4PlayerFixedRecord, steps: 2429, sections: [5.6583, 10.4083, 15.2083, 20.2417] },
    { name: 'rival', record: buildPhase4RivalRecord, steps: 2561, sections: [5.8583, 10.8083, 16.1083, 21.3417] },
  ];

  for (const testCase of CASES) {
    it(`${testCase.name}: step=${testCase.steps}・finished・発火なし・4区間が承認値`, () => {
      const result = run(testCase.record());
      expect(result.status).toBe('finished');
      expect(result.steps).toBe(testCase.steps);
      expect(result.truncated).toBe(false);
      expect(result.coilCollapsed).toBe(false);
      expect(result.shorted).toBe(false);
      // elapsedTimeSはdtの逐次加算なので、2000step超では1e-13程度の丸めが乗る。
      expect(result.finishTimeS).toBeCloseTo(testCase.steps * PHASE4_DT_S, 9);
      const times = resolveSectionTimes(result.trace, PHASE4_SECTION_BOUNDARIES_M, resolveFinishInfo(result));
      expect(times).toHaveLength(4);
      times.forEach((t, i) => expect(t!).toBeCloseTo(testCase.sections[i]!, 4));
    });
  }

  it('「僅差で負ける→一箇所直す→僅差で勝つ」が成立している', () => {
    const first = run(buildPhase4PlayerFirstRecord()).finishTimeS!;
    const fixed = run(buildPhase4PlayerFixedRecord()).finishTimeS!;
    const rival = run(buildPhase4RivalRecord()).finishTimeS!;
    expect(first).toBeGreaterThan(rival); // 初走は負け
    expect(fixed).toBeLessThan(rival); // 修正後は勝ち
    expect(fixed).toBeLessThan(first); // 修正で速くなる
    expect(first - rival).toBeCloseTo(1.075, 3);
    expect(rival - fixed).toBeCloseTo(1.1, 3);
    // 両走とも20〜30秒帯に収まる(§7.3)。
    for (const t of [first, fixed]) {
      expect(t).toBeGreaterThanOrEqual(20);
      expect(t).toBeLessThanOrEqual(30);
    }
  });
});

describe('baseline入力helper(2026-08-26裁定・案C)', () => {
  it('baselineそのものは作らず、入力事実だけを返す', () => {
    const inputs = resolvePhase4BaselineInputs();
    expect(inputs.rawPlayerMotorConfig.batteryVoltage).toBe(inputs.garageBuild.batteryVoltage);
    expect(inputs).not.toHaveProperty('chassisBaselineG');
    expect(inputs).not.toHaveProperty('baseGearEfficiency');
  });

  it('決定論: 何度呼んでも同じ値を返す', () => {
    expect(resolvePhase4BaselineInputs()).toStrictEqual(resolvePhase4BaselineInputs());
  });

  it('resolvePhase4FixedConfigsはhelperと同一の入力を使う(二重定義がない)', () => {
    // helperのbatteryVoltageを変えた入力でbaselineを作ると構成も変わる、という関係を
    // 使って「FixedConfigsが別の入力を内部で作り直していない」ことを見る。
    const { rawPlayerMotorConfig, garageBuild } = resolvePhase4BaselineInputs();
    const real = resolvePhase4FixedConfigs(
      PHASE4_MATERIAL_SELECTION,
      resolveProductionMaterialCompositionBaseline(rawPlayerMotorConfig, garageBuild),
    );
    const shifted = resolvePhase4FixedConfigs(
      PHASE4_MATERIAL_SELECTION,
      // cellSelectionが反転する側の電圧を選ぶ(S-3は1.5でone-cell、それ以外でtwo-cell)。
      resolveProductionMaterialCompositionBaseline(
        { ...rawPlayerMotorConfig, batteryVoltage: rawPlayerMotorConfig.batteryVoltage === 1.5 ? 3 : 1.5 },
        garageBuild,
      ),
    );
    expect(real.baseMotorConfig.batteryVoltage).toBe(rawPlayerMotorConfig.batteryVoltage);
    expect(shifted.carConfig.massG).not.toBe(real.carConfig.massG);
  });

  it('呼出し側が組んだbaselineで承認済み3走の結果が再現する', () => {
    expect(run(buildPhase4PlayerFirstRecord()).steps).toBe(2690);
    expect(run(buildPhase4PlayerFixedRecord()).steps).toBe(2429);
    expect(run(buildPhase4RivalRecord()).steps).toBe(2561);
  });
});
