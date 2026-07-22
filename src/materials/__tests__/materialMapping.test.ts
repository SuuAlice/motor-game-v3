import { describe, expect, it } from 'vitest';
import {
  combineGearEfficiency,
  composeConfigFromMaterials,
  computeGearMaterialEfficiencyRatio,
  computeMagnetStrengthCalibration,
  computeWireDensityRatio,
  computeWireResistivityRatio,
  type MaterialCompositionBaseline,
  type MaterialSelection,
  type WireMaterialId,
} from '../materialMapping';
import { GEAR_MATERIALS, MAGNET_MATERIALS, WIRE_MATERIALS, type WireMaterial } from '../materials';
import { step, type MotorConfig, type SimState } from '../../engine/motorPhysics';
import { createInitialVehicleState, type CarConfig } from '../../engine/vehiclePhysics';
import { createValidatedTrack, stepTrackRun, type TrackDefinition, type TrackSegment } from '../../engine/trackPhysics';

// src/data/parameterPresets.ts(V2 UI側)のMAGNET_PRESETSが「弱(フェライト)」「強(ネオジム)」と
// 明示ラベル付けした値。materialMapping.ts(production)からV2 UIモジュールをimportしないため、
// ここでは値のみをコメントで出典を示しつつ再掲する(2026-07-22 Suu指摘3)。
const V2_UI_FERRITE_LABEL_VALUE = 0.2;
const V2_UI_NEODYMIUM_LABEL_VALUE = 0.9;

// V2互換の既存3プリセット(src/data/partPresets.ts GEAR_PRESETS)由来の基準効率。
// gearRatio(減速比)依存であり素材依存ではない。ここでは値のみを固定して再利用する。
const EXISTING_BASE_EFFICIENCIES = [0.9, 0.8, 0.74]; // fast / balanced(V2互換基準) / torque

describe('materialMapping.ts Step3(ギヤ材質の効率比率・設計較正値)', () => {
  describe('computeGearMaterialEfficiencyRatio: テーブル参照', () => {
    it('GEAR_MATERIALSの全ティアに対応する比率が存在する(Record<GearMaterialId,...>の型網羅+実行時確認)', () => {
      for (const gear of GEAR_MATERIALS) {
        const result = computeGearMaterialEfficiencyRatio(gear);
        expect(result.ok, `${gear.id}の比率が見つかりません`).toBe(true);
      }
    });

    it('POM=1.00(anchor、自己潤滑)', () => {
      const pom = GEAR_MATERIALS.find((m) => m.id === 'gear-pom')!;
      const result = computeGearMaterialEfficiencyRatio(pom);
      expect(result).toEqual({ ok: true, ratio: 1.0 });
    });

    it('PA6=0.98(吸湿による寸法変化を小ペナルティとして表現)', () => {
      const pa6 = GEAR_MATERIALS.find((m) => m.id === 'gear-nylon-pa6')!;
      const result = computeGearMaterialEfficiencyRatio(pa6);
      expect(result).toEqual({ ok: true, ratio: 0.98 });
    });

    it('PEEK=1.01(耐熱・寸法安定による小さな利点。1%に限定し万能化を避ける)', () => {
      const peek = GEAR_MATERIALS.find((m) => m.id === 'gear-peek')!;
      const result = computeGearMaterialEfficiencyRatio(peek);
      expect(result).toEqual({ ok: true, ratio: 1.01 });
    });

    it('Ti-6Al-4V=0.90(金属同士は無潤滑でかじる明確な損失。高強度とのトレードオフ)', () => {
      const titanium = GEAR_MATERIALS.find((m) => m.id === 'gear-titanium')!;
      const result = computeGearMaterialEfficiencyRatio(titanium);
      expect(result).toEqual({ ok: true, ratio: 0.9 });
    });

    it('未登録の素材IDはok:falseで明示的に失敗する', () => {
      const unknownGear = { ...GEAR_MATERIALS[0], id: 'gear-unknown-fixture' };
      const result = computeGearMaterialEfficiencyRatio(unknownGear);
      expect(result.ok).toBe(false);
    });

    it('本較正表は今回の4ティアに対して比率0.85〜1.05に限定される(sanity範囲。物理的な合成後範囲(0,1]はcombineGearEfficiencyが判定する)', () => {
      for (const gear of GEAR_MATERIALS) {
        const result = computeGearMaterialEfficiencyRatio(gear);
        if (result.ok) {
          expect(result.ratio).toBeGreaterThanOrEqual(0.85);
          expect(result.ratio).toBeLessThanOrEqual(1.05);
        }
      }
    });

    it('総合ティア単調性(PEEK>PA6>POM等)は主張しない——各値は個別の設計理由に基づく設計較正値であり、密度等の未検証物性は参照しない', () => {
      // このテストは意図の記録のみで、順序の断定は行わない。
      const ratios = GEAR_MATERIALS.map((gear) => computeGearMaterialEfficiencyRatio(gear));
      expect(ratios.every((r) => r.ok)).toBe(true);
    });
  });

  describe('combineGearEfficiency: 合成関数(CarConfigへの実接続はStep7)', () => {
    it('既存3基準効率×素材4ティアの全12組合せが有限かつ物理的範囲(0,1]に収まる', () => {
      for (const baseEfficiency of EXISTING_BASE_EFFICIENCIES) {
        for (const gear of GEAR_MATERIALS) {
          const ratioResult = computeGearMaterialEfficiencyRatio(gear);
          expect(ratioResult.ok).toBe(true);
          if (!ratioResult.ok) continue;
          const combined = combineGearEfficiency(baseEfficiency, ratioResult.ratio);
          expect(combined.ok, `base=${baseEfficiency}, gear=${gear.id}: ${!combined.ok ? combined.reason : ''}`).toBe(true);
          if (combined.ok) {
            expect(combined.efficiency).toBeGreaterThan(0);
            expect(combined.efficiency).toBeLessThanOrEqual(1);
          }
        }
      }
    });

    it('POM(ratio=1.0)は既存の基準効率を厳密不変のまま返す(V2回帰確認)', () => {
      const pomRatio = computeGearMaterialEfficiencyRatio(GEAR_MATERIALS.find((m) => m.id === 'gear-pom')!);
      expect(pomRatio.ok).toBe(true);
      if (!pomRatio.ok) return;
      for (const baseEfficiency of EXISTING_BASE_EFFICIENCIES) {
        const combined = combineGearEfficiency(baseEfficiency, pomRatio.ratio);
        expect(combined).toEqual({ ok: true, efficiency: baseEfficiency });
      }
    });

    it('baseEfficiencyが非有限・非正の場合は失敗', () => {
      expect(combineGearEfficiency(0, 1.0).ok).toBe(false);
      expect(combineGearEfficiency(-0.5, 1.0).ok).toBe(false);
      expect(combineGearEfficiency(Number.NaN, 1.0).ok).toBe(false);
    });

    it('ratioが非有限・非正の場合は失敗', () => {
      expect(combineGearEfficiency(0.8, 0).ok).toBe(false);
      expect(combineGearEfficiency(0.8, -1).ok).toBe(false);
      expect(combineGearEfficiency(0.8, Number.POSITIVE_INFINITY).ok).toBe(false);
    });

    it('合成後が1を超える場合はclampせずok:falseを返す', () => {
      const result = combineGearEfficiency(0.99, 1.5);
      expect(result.ok).toBe(false);
    });

    it('境界値: 合成後がちょうど1のときはok:true', () => {
      const result = combineGearEfficiency(0.5, 2.0);
      expect(result).toEqual({ ok: true, efficiency: 1 });
    });
  });
});

describe('materialMapping.ts Step4(磁石材質のmagnetStrength較正値・設計較正値)', () => {
  it('MAGNET_MATERIALSの全ティアに対応する較正値が存在する(Record<MagnetMaterialId,...>の型網羅+実行時確認)', () => {
    for (const magnet of MAGNET_MATERIALS) {
      const result = computeMagnetStrengthCalibration(magnet);
      expect(result.ok, `${magnet.id}の較正値が見つかりません`).toBe(true);
    }
  });

  it('フェライト=0.20はV2 UI(parameterPresets.ts MAGNET_PRESETS)の「弱(フェライト)」ラベル値と一致する', () => {
    const ferrite = MAGNET_MATERIALS.find((m) => m.id === 'magnet-ferrite')!;
    const result = computeMagnetStrengthCalibration(ferrite);
    expect(result).toEqual({ ok: true, magnetStrength: V2_UI_FERRITE_LABEL_VALUE });
  });

  it('ネオジム=0.90はV2 UI(parameterPresets.ts MAGNET_PRESETS)の「強(ネオジム)」ラベル値と一致する', () => {
    const neodymium = MAGNET_MATERIALS.find((m) => m.id === 'magnet-neodymium')!;
    const result = computeMagnetStrengthCalibration(neodymium);
    expect(result).toEqual({ ok: true, magnetStrength: V2_UI_NEODYMIUM_LABEL_VALUE });
  });

  it('アルニコ=0.55', () => {
    const alnico = MAGNET_MATERIALS.find((m) => m.id === 'magnet-alnico')!;
    const result = computeMagnetStrengthCalibration(alnico);
    expect(result).toEqual({ ok: true, magnetStrength: 0.55 });
  });

  it('サマリウムコバルト=0.65', () => {
    const smco = MAGNET_MATERIALS.find((m) => m.id === 'magnet-samarium-cobalt')!;
    const result = computeMagnetStrengthCalibration(smco);
    expect(result).toEqual({ ok: true, magnetStrength: 0.65 });
  });

  it('4値すべてが有限かつ既存magnetStrengthドメイン[0,1]に収まる', () => {
    for (const magnet of MAGNET_MATERIALS) {
      const result = computeMagnetStrengthCalibration(magnet);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Number.isFinite(result.magnetStrength)).toBe(true);
        expect(result.magnetStrength).toBeGreaterThanOrEqual(0);
        expect(result.magnetStrength).toBeLessThanOrEqual(1);
      }
    }
  });

  it('アルニコ(0.55)<サマリウムコバルト(0.65): 実Br順位(アルニコ1.2T>サマリウムコバルト1.0T)を意図的に逆転させた較正順序', () => {
    const alnico = computeMagnetStrengthCalibration(MAGNET_MATERIALS.find((m) => m.id === 'magnet-alnico')!);
    const smco = computeMagnetStrengthCalibration(MAGNET_MATERIALS.find((m) => m.id === 'magnet-samarium-cobalt')!);
    expect(alnico.ok && smco.ok).toBe(true);
    if (alnico.ok && smco.ok) {
      expect(alnico.magnetStrength).toBeLessThan(smco.magnetStrength);
    }
  });

  it('較正値の順序はフェライト<アルニコ<サマリウムコバルト<ネオジムである', () => {
    const values = MAGNET_MATERIALS.map((m) => {
      const result = computeMagnetStrengthCalibration(m);
      return result.ok ? result.magnetStrength : Number.NaN;
    });
    const [ferrite, alnico, smco, neodymium] = values;
    expect(ferrite).toBeLessThan(alnico);
    expect(alnico).toBeLessThan(smco);
    expect(smco).toBeLessThan(neodymium);
  });

  it('未登録の素材IDはok:falseで明示的に失敗する', () => {
    const unknownMagnet = { ...MAGNET_MATERIALS[0], id: 'magnet-unknown-fixture' };
    const result = computeMagnetStrengthCalibration(unknownMagnet);
    expect(result.ok).toBe(false);
  });
});

describe('materialMapping.ts Step7a(導線ratio: 実測値からの単一出典写像)', () => {
  describe('computeWireResistivityRatio', () => {
    it('WIRE_MATERIALSの全ティアに対応する比率が存在する', () => {
      for (const wire of WIRE_MATERIALS) {
        const result = computeWireResistivityRatio(wire);
        expect(result.ok, `${wire.id}の抵抗率ratioが計算できません`).toBe(true);
      }
    });

    it('anchor(wire-copper-standard)は厳密に1.0になる', () => {
      const copper = WIRE_MATERIALS.find((m) => m.id === 'wire-copper-standard')!;
      expect(computeWireResistivityRatio(copper)).toEqual({ ok: true, ratio: 1.0 });
    });

    it('tier方向性: 実測抵抗率の大小関係と一致する(アルミ>銅>銀メッキ銅線>銀)', () => {
      const aluminum = computeWireResistivityRatio(WIRE_MATERIALS.find((m) => m.id === 'wire-aluminum')!);
      const copper = computeWireResistivityRatio(WIRE_MATERIALS.find((m) => m.id === 'wire-copper-standard')!);
      const silverPlated = computeWireResistivityRatio(WIRE_MATERIALS.find((m) => m.id === 'wire-silver-plated-copper')!);
      const silver = computeWireResistivityRatio(WIRE_MATERIALS.find((m) => m.id === 'wire-silver')!);
      expect(aluminum.ok && copper.ok && silverPlated.ok && silver.ok).toBe(true);
      if (aluminum.ok && copper.ok && silverPlated.ok && silver.ok) {
        expect(aluminum.ratio).toBeGreaterThan(copper.ratio);
        expect(copper.ratio).toBeGreaterThan(silverPlated.ratio);
        expect(silverPlated.ratio).toBeGreaterThan(silver.ratio);
      }
    });

    it('決定論: 同一素材への複数回呼び出しで常に同一の値になる', () => {
      const silver = WIRE_MATERIALS.find((m) => m.id === 'wire-silver')!;
      expect(computeWireResistivityRatio(silver)).toEqual(computeWireResistivityRatio(silver));
    });

    it('全ティアがStep6のクランプ範囲[0.5, 2.0]内に収まる(範囲外に出た場合はクランプ範囲側の再レビューが必要)', () => {
      for (const wire of WIRE_MATERIALS) {
        const result = computeWireResistivityRatio(wire);
        if (result.ok) {
          expect(result.ratio, `${wire.id}`).toBeGreaterThanOrEqual(0.5);
          expect(result.ratio, `${wire.id}`).toBeLessThanOrEqual(2.0);
        }
      }
    });

    // Fable承認済みQ1: resistivityがpending・非有限のガードはStep5 trusted preconditionの
    // 最後の砦。production配列(WIRE_MATERIALS)は全tier verifiedのため、成功経路だけでは
    // ガード自体の回帰を検出できない。既存WireMaterialをspreadしたfixtureで直接固定する。
    it('resistivityがpending(verifiedForPhysics:false)の場合はok:falseになる', () => {
      const copper = WIRE_MATERIALS.find((m) => m.id === 'wire-copper-standard')!;
      const pendingWire: WireMaterial = {
        ...copper,
        resistivity: { verifiedForPhysics: false, status: 'pending', reason: 'テスト用fixture' },
      };
      const result = computeWireResistivityRatio(pendingWire);
      expect(result.ok).toBe(false);
    });

    it('resistivityがverifiedForPhysics:trueだがvalueが非有限・非正の場合はok:falseになる(型は満たすが実行時ガードで検出)', () => {
      const copper = WIRE_MATERIALS.find((m) => m.id === 'wire-copper-standard')!;
      const nanWire: WireMaterial = {
        ...copper,
        resistivity: { verifiedForPhysics: true, value: Number.NaN, origin: 'projectSpec', citation: copper.resistivity.verifiedForPhysics ? copper.resistivity.citation : { literatureName: 'x', publisher: 'x', sourceKind: 'x' } },
      };
      expect(computeWireResistivityRatio(nanWire).ok).toBe(false);

      const zeroWire: WireMaterial = {
        ...copper,
        resistivity: { verifiedForPhysics: true, value: 0, origin: 'projectSpec', citation: copper.resistivity.verifiedForPhysics ? copper.resistivity.citation : { literatureName: 'x', publisher: 'x', sourceKind: 'x' } },
      };
      expect(computeWireResistivityRatio(zeroWire).ok).toBe(false);

      const negativeWire: WireMaterial = {
        ...copper,
        resistivity: { verifiedForPhysics: true, value: -5, origin: 'projectSpec', citation: copper.resistivity.verifiedForPhysics ? copper.resistivity.citation : { literatureName: 'x', publisher: 'x', sourceKind: 'x' } },
      };
      expect(computeWireResistivityRatio(negativeWire).ok).toBe(false);
    });
  });

  describe('computeWireDensityRatio', () => {
    it('WIRE_MATERIALSの全ティアに対応する比率が存在する(銀メッキ銅線もresolveWireDensityの設計仮定経由で解決される)', () => {
      for (const wire of WIRE_MATERIALS) {
        const result = computeWireDensityRatio(wire);
        expect(result.ok, `${wire.id}の密度ratioが計算できません`).toBe(true);
      }
    });

    it('anchor(wire-copper-standard)は厳密に1.0になる', () => {
      const copper = WIRE_MATERIALS.find((m) => m.id === 'wire-copper-standard')!;
      expect(computeWireDensityRatio(copper)).toEqual({ ok: true, ratio: 1.0 });
    });

    it('銀メッキ銅線は銅密度代用の設計仮定により、anchorと同じく1.0になる', () => {
      const silverPlated = WIRE_MATERIALS.find((m) => m.id === 'wire-silver-plated-copper')!;
      expect(computeWireDensityRatio(silverPlated)).toEqual({ ok: true, ratio: 1.0 });
    });

    it('tier方向性: 実測密度の大小関係と一致する(銀>銅=銀メッキ銅線>アルミ)', () => {
      const aluminum = computeWireDensityRatio(WIRE_MATERIALS.find((m) => m.id === 'wire-aluminum')!);
      const copper = computeWireDensityRatio(WIRE_MATERIALS.find((m) => m.id === 'wire-copper-standard')!);
      const silver = computeWireDensityRatio(WIRE_MATERIALS.find((m) => m.id === 'wire-silver')!);
      expect(aluminum.ok && copper.ok && silver.ok).toBe(true);
      if (aluminum.ok && copper.ok && silver.ok) {
        expect(silver.ratio).toBeGreaterThan(copper.ratio);
        expect(copper.ratio).toBeGreaterThan(aluminum.ratio);
      }
    });

    it('決定論: 同一素材への複数回呼び出しで常に同一の値になる', () => {
      const aluminum = WIRE_MATERIALS.find((m) => m.id === 'wire-aluminum')!;
      expect(computeWireDensityRatio(aluminum)).toEqual(computeWireDensityRatio(aluminum));
    });

    it('全ティアがStep6のクランプ範囲[0.2, 1.5]内に収まる', () => {
      for (const wire of WIRE_MATERIALS) {
        const result = computeWireDensityRatio(wire);
        if (result.ok) {
          expect(result.ratio, `${wire.id}`).toBeGreaterThanOrEqual(0.2);
          expect(result.ratio, `${wire.id}`).toBeLessThanOrEqual(1.5);
        }
      }
    });
  });
});

describe('materialMapping.ts Step7a(composeConfigFromMaterials: 合成純関数)', () => {
  function baseMotorConfig(overrides: Partial<MotorConfig> = {}): MotorConfig {
    return {
      coilTurns: 80,
      slitWidthMm: 1.5,
      sandingQuality: 0.9,
      brushPressure: 0.3,
      // 素材未反映の任意値。合成後にmagnetStrengthが較正値で上書きされることを確認する対象
      magnetStrength: 0.5,
      magnetDistanceMm: 10,
      batteryVoltage: 3,
      axisOffsetMm: 0,
      wireGaugeMm: 0.4,
      parallelStrands: 1,
      varnished: true,
      ...overrides,
    };
  }

  function baseCarConfig(overrides: Partial<CarConfig> = {}): CarConfig {
    return {
      // 意図的にbaselineと異なる値。合成写像の出力には一切使われない(無視される)ことを
      // 確認する対象(§3.1の入力契約)
      massG: 999,
      gearEfficiency: 0.123,
      gearRatio: 4,
      wheelDiameterMm: 30,
      tireGrip: 0.7,
      axleFriction: 0,
      wheelAlignmentMm: 0,
      centerOfMassHeightMm: 20,
      motorMountOffsetMm: 0,
      ...overrides,
    };
  }

  const CANONICAL_BASELINE: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 0.8 };
  const CANONICAL_SELECTION: MaterialSelection = { wireId: 'wire-copper-standard', magnetId: 'magnet-ferrite', gearId: 'gear-pom' };

  function restState(): SimState {
    return {
      theta: Math.PI / 4,
      omega: 0,
      current: 0,
      backEmf: 0,
      shorted: false,
      running: true,
      rpm: 0,
      chatterFramesLeft: 0,
      batteryHeat: 0,
      coilCollapsed: false,
      highSpeedFrameCount: 0,
    };
  }

  it('1. canonical anchor base(baseline=150g/0.8, selection=全anchor素材)で厳密な具体値になる', () => {
    const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, CANONICAL_SELECTION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.motorConfig.wireResistivityRatio).toBe(1.0);
    expect(result.motorConfig.wireDensityRatio).toBe(1.0);
    expect(result.motorConfig.magnetStrength).toBe(0.2);
    expect(result.carConfig.gearEfficiency).toBe(0.8);
    expect(result.carConfig.massG).toBe(150);
  });

  it('2. 入力baseMotorConfig/baseCarConfig/baselineオブジェクト自体を変更しない', () => {
    const motor = baseMotorConfig();
    const car = baseCarConfig();
    const baseline: MaterialCompositionBaseline = { ...CANONICAL_BASELINE };
    const motorSnapshot = { ...motor };
    const carSnapshot = { ...car };
    const baselineSnapshot = { ...baseline };
    composeConfigFromMaterials(motor, car, baseline, CANONICAL_SELECTION);
    expect(motor).toEqual(motorSnapshot);
    expect(car).toEqual(carSnapshot);
    expect(baseline).toEqual(baselineSnapshot);
  });

  it('3. 同一入力で複数回呼び出しても常に同一出力になる(決定論)', () => {
    const r1 = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, CANONICAL_SELECTION);
    const r2 = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, CANONICAL_SELECTION);
    expect(r2).toEqual(r1);
  });

  it('4. 出力を再びbaseMotorConfig/baseCarConfigとして入力しても、同じbaseline・selectionなら結果が累積しない(真の冪等性)', () => {
    const nonAnchorSelection: MaterialSelection = { wireId: 'wire-silver', magnetId: 'magnet-neodymium', gearId: 'gear-titanium' };
    const first = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, nonAnchorSelection);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = composeConfigFromMaterials(first.motorConfig, first.carConfig, CANONICAL_BASELINE, nonAnchorSelection);
    expect(second).toEqual(first);
  });

  it('5. 導線の個別ratio関数(computeWireResistivityRatio/computeWireDensityRatio)の結果が、合成写像後の値と一致する', () => {
    const wire = WIRE_MATERIALS.find((m) => m.id === 'wire-silver')!;
    const selection: MaterialSelection = { ...CANONICAL_SELECTION, wireId: 'wire-silver' };
    const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, selection);
    const resistivity = computeWireResistivityRatio(wire);
    const density = computeWireDensityRatio(wire);
    expect(result.ok && resistivity.ok && density.ok).toBe(true);
    if (result.ok && resistivity.ok && density.ok) {
      expect(result.motorConfig.wireResistivityRatio).toBe(resistivity.ratio);
      expect(result.motorConfig.wireDensityRatio).toBe(density.ratio);
    }
  });

  it('6. ギヤ・磁石の既存個別関数(Step3・Step4)の結果が、合成写像後の値と一致する', () => {
    const magnet = MAGNET_MATERIALS.find((m) => m.id === 'magnet-neodymium')!;
    const gear = GEAR_MATERIALS.find((m) => m.id === 'gear-titanium')!;
    const selection: MaterialSelection = { wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-titanium' };
    const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, selection);
    const magnetCalib = computeMagnetStrengthCalibration(magnet);
    const gearRatio = computeGearMaterialEfficiencyRatio(gear);
    expect(result.ok && magnetCalib.ok && gearRatio.ok).toBe(true);
    if (result.ok && magnetCalib.ok && gearRatio.ok) {
      expect(result.motorConfig.magnetStrength).toBe(magnetCalib.magnetStrength);
      const combined = combineGearEfficiency(CANONICAL_BASELINE.baseGearEfficiency, gearRatio.ratio);
      expect(combined.ok).toBe(true);
      if (combined.ok) expect(result.carConfig.gearEfficiency).toBe(combined.efficiency);
    }
  });

  it('7. selection中の1素材が未登録IDの場合、部分更新されたconfigを返さず全体がok:falseになる', () => {
    const badSelection: MaterialSelection = {
      wireId: 'wire-unknown-fixture' as WireMaterialId,
      magnetId: 'magnet-ferrite',
      gearId: 'gear-pom',
    };
    const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, badSelection);
    expect(result.ok).toBe(false);
  });

  it('8. 導線×磁石×ギヤの全64組合せで出力が有限正かつ各configの既存許容範囲内に収まる', () => {
    for (const wire of WIRE_MATERIALS) {
      for (const magnet of MAGNET_MATERIALS) {
        for (const gear of GEAR_MATERIALS) {
          const selection: MaterialSelection = { wireId: wire.id, magnetId: magnet.id, gearId: gear.id };
          const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, selection);
          expect(result.ok, `${wire.id}×${magnet.id}×${gear.id}: ${!result.ok ? result.reason : ''}`).toBe(true);
          if (!result.ok) continue;
          expect(Number.isFinite(result.motorConfig.wireResistivityRatio)).toBe(true);
          expect(result.motorConfig.wireResistivityRatio!).toBeGreaterThan(0);
          expect(Number.isFinite(result.motorConfig.wireDensityRatio)).toBe(true);
          expect(result.motorConfig.wireDensityRatio!).toBeGreaterThan(0);
          expect(result.motorConfig.magnetStrength).toBeGreaterThanOrEqual(0);
          expect(result.motorConfig.magnetStrength).toBeLessThanOrEqual(1);
          expect(result.carConfig.gearEfficiency).toBeGreaterThan(0);
          expect(result.carConfig.gearEfficiency).toBeLessThanOrEqual(1);
          expect(result.carConfig.massG).toBeGreaterThanOrEqual(80);
          expect(result.carConfig.massG).toBeLessThanOrEqual(250);
        }
      }
    }
  });

  it('9a. 合成写像の出力motorConfigをmotorPhysics.stepで実行してもNaN/Infinityが発生しない(engine側は無変更のsmokeテスト)', () => {
    const selection: MaterialSelection = { wireId: 'wire-silver', magnetId: 'magnet-neodymium', gearId: 'gear-titanium' };
    const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, selection);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    let s = restState();
    const rng = () => 0.5;
    for (let i = 0; i < 120; i++) {
      s = step(result.motorConfig, s, 1 / 120, rng);
      expect(Number.isFinite(s.theta)).toBe(true);
      expect(Number.isFinite(s.omega)).toBe(true);
      expect(Number.isFinite(s.current)).toBe(true);
      expect(Number.isFinite(s.backEmf)).toBe(true);
    }
  });

  it('9b. 合成写像の出力motorConfig・carConfigの両方をstepTrackRunで実行してもNaN/Infinityが発生しない(gearEfficiency・massG込みのsmokeテスト、engine側は無変更)', () => {
    const selection: MaterialSelection = { wireId: 'wire-silver', magnetId: 'magnet-neodymium', gearId: 'gear-titanium' };
    const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, selection);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const segment: TrackSegment = { lengthM: 10, slopeDeg: 0, surfaceGrip: 1, roughness: 0 };
    const track: TrackDefinition = { id: 'step7a-smoke', name: 'smoke', description: '', segments: [segment], objectives: [] };
    const validated = createValidatedTrack(track);
    let state = createInitialVehicleState(result.motorConfig, result.carConfig);
    const rng = () => 0.5;
    for (let i = 0; i < 120; i++) {
      state = stepTrackRun(result.motorConfig, result.carConfig, validated, state, 1 / 120, rng);
      expect(Number.isFinite(state.positionM)).toBe(true);
      expect(Number.isFinite(state.velocityMps)).toBe(true);
      expect(Number.isFinite(state.energyUsedJ)).toBe(true);
      if (state.status !== 'running' && state.status !== 'ready') break;
    }
  });

  it('10. wireGaugeMm/parallelStrands省略時と明示的な0.4/1指定時とで、出力(massGの導線体積寄与を含む)が完全一致する', () => {
    // wireGaugeMm/parallelStrandsそのものはbaseMotorConfigから素通しでコピーされるため、
    // 省略(undefined)/明示(0.4・1)の違いがmotorConfig上には残る(これは仕様どおりで、
    // motorPhysics.ts側のresolveWireGaugeMm等が`?? D_REF`で解決する既存の設計)。ここで
    // 一致を主張するのは、DEFAULT_WIRE_GAUGE_MM/DEFAULT_PARALLEL_STRANDSのフォールバックが
    // 正しく効き、massGへの導線体積寄与が同じ値になることのみ。
    const omittedMotor = baseMotorConfig({ wireGaugeMm: undefined, parallelStrands: undefined });
    const explicitMotor = baseMotorConfig({ wireGaugeMm: 0.4, parallelStrands: 1 });
    const r1 = composeConfigFromMaterials(omittedMotor, baseCarConfig(), CANONICAL_BASELINE, CANONICAL_SELECTION);
    const r2 = composeConfigFromMaterials(explicitMotor, baseCarConfig(), CANONICAL_BASELINE, CANONICAL_SELECTION);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.carConfig.massG).toBe(r2.carConfig.massG);
      expect(r1.motorConfig.wireResistivityRatio).toBe(r2.motorConfig.wireResistivityRatio);
      expect(r1.motorConfig.wireDensityRatio).toBe(r2.motorConfig.wireDensityRatio);
      expect(r1.motorConfig.magnetStrength).toBe(r2.motorConfig.magnetStrength);
      expect(r1.carConfig.gearEfficiency).toBe(r2.carConfig.gearEfficiency);
    }
  });

  // 推奨(Suu_mot3コードレビュー): 原子的Resultをlookup失敗だけでなく下流失敗でも固定する。
  describe('11. 下流失敗(無効baseline)でもok:falseかつconfigを返さない', () => {
    it('chassisBaselineGがNaNの場合、applyMassAdjustmentToBaselineG側の失敗が伝播しok:falseになる', () => {
      const invalidBaseline: MaterialCompositionBaseline = { chassisBaselineG: Number.NaN, baseGearEfficiency: 0.8 };
      const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), invalidBaseline, CANONICAL_SELECTION);
      expect(result.ok).toBe(false);
      expect((result as { motorConfig?: unknown }).motorConfig).toBeUndefined();
      expect((result as { carConfig?: unknown }).carConfig).toBeUndefined();
    });

    it('baseGearEfficiencyが大きすぎて合成後1を超える場合、combineGearEfficiency側の失敗が伝播しok:falseになる', () => {
      const invalidBaseline: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 2.0 };
      // gear-peekのratio(1.01)と組み合わせると2.0×1.01>1となりcombineGearEfficiencyが失敗する
      const selection: MaterialSelection = { wireId: 'wire-copper-standard', magnetId: 'magnet-ferrite', gearId: 'gear-peek' };
      const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), invalidBaseline, selection);
      expect(result.ok).toBe(false);
      expect((result as { motorConfig?: unknown }).motorConfig).toBeUndefined();
      expect((result as { carConfig?: unknown }).carConfig).toBeUndefined();
    });
  });
});
