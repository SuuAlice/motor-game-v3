import { describe, expect, it } from 'vitest';
import {
  combineGearEfficiency,
  composeConfigFromMaterials,
  computeBatteryCapacityRatioCalibration,
  computeBatteryInternalResistanceRatioCalibration,
  computeGearMaterialEfficiencyRatio,
  computeMagnetStrengthCalibration,
  computeWireDensityRatio,
  computeWireResistivityRatio,
  assembleD05Config,
  assembleDestructionConfig,
  mapBatteryDestructionProfile,
  mapBodyScorchDeltaFraction,
  mapBrushRatios,
  mapD03DestructionConfig,
  mapD04BatteryDestructionConfig,
  mapD05BrushWearConfig,
  mapD06DestructionConfig,
  mapD07DestructionConfig,
  mapD09DestructionConfig,
  mapMagnetScorchDeltaFraction,
  type BodyMaterialId,
  type BrushMaterialId,
  type EquipmentDestructionContext,
  type GearMaterialId,
  type MaterialCompositionBaseline,
  type MaterialSelection,
  type WireMaterialId,
} from '../materialMapping';
import {
  captureRunSnapshot,
  classifyTerminalModes,
  composeEffectiveMotorConfig,
  buildVehicleFrameInput,
  createRunAccumulator,
  finalizeDestructionRun,
  finalizeRun,
  normalizeOverheatedStatusForD04Hold,
  stepMotorWithDestruction,
  validateDestructionConfig,
  type CaptureRunSnapshotInput,
  type DestructionConfig,
  type DestructionConfigDraft,
  type DestructionEvent,
  type DestructionRunContext,
  type RunAccumulator,
  type RunOutcome,
} from '../../engine/destructionOrchestration';
import { advanceDestructionState, createInitialDestructionState, DURATION_COMPARISON_EPSILON_S } from '../../engine/destructionModes';
import { CHATTER_BURST_FRAMES, COIL_DEFORM_OMEGA } from '../../engine/constants';
import type { PhysicsSnapshotAtT } from '../../engine/destructionModes';
import { BATTERY_MATERIALS, BODY_MATERIALS, BRUSH_MATERIALS, GEAR_MATERIALS, MAGNET_MATERIALS, WIRE_MATERIALS, type BatteryMaterial, type WireMaterial } from '../materials';
import { computeElectricalState, step, type MotorConfig, type SimState } from '../../engine/motorPhysics';
import { BATTERY_HEAT_LIMIT } from '../../engine/constants';
import { createInitialVehicleState, type CarConfig, type VehicleSimState } from '../../engine/vehiclePhysics';
import { createValidatedTrack, stepTrackRun, type TrackDefinition, type TrackSegment } from '../../engine/trackPhysics';
import { TRACK_BY_ID, TRACKS } from '../../data/tracks';

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
  const CANONICAL_SELECTION: MaterialSelection = {
    wireId: 'wire-copper-standard',
    magnetId: 'magnet-ferrite',
    gearId: 'gear-pom',
    batteryId: 'battery-alkaline',
    brushId: 'brush-carbon',
  };

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
    expect(result.motorConfig.batteryInternalResistanceRatio).toBe(1.0);
    expect(result.motorConfig.batteryCapacityRatio).toBe(1.0);
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

  it('4. 出力を再びbaseMotorConfig/baseCarConfigとして入力しても、同じbaseline・selectionなら結果が累積しない(真の冪等性。電池ratioはbaselineを介さない絶対値上書きのため構造的に自明だが、非anchor電池で明示確認する)', () => {
    const nonAnchorSelection: MaterialSelection = {
      wireId: 'wire-silver',
      magnetId: 'magnet-neodymium',
      gearId: 'gear-titanium',
      batteryId: 'battery-lithium-polymer',
      brushId: 'brush-carbon', // P3-3-Q15是正(補足): このテストの主題は電池、ブラシ差は不要のためanchorへ統一
    };
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
    const selection: MaterialSelection = {
      wireId: 'wire-copper-standard',
      magnetId: 'magnet-neodymium',
      gearId: 'gear-titanium',
      batteryId: 'battery-alkaline',
      brushId: 'brush-carbon',
    };
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
      batteryId: 'battery-alkaline',
      brushId: 'brush-carbon',
    };
    const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, badSelection);
    expect(result.ok).toBe(false);
  });

  it('8/9(Step7b拡張). 導線×磁石×ギヤ×電池の全192組合せ(4×4×4×3)で出力が有限正かつ各configの既存許容範囲内に収まる(Step7aの64組合せから拡張)', () => {
    for (const wire of WIRE_MATERIALS) {
      for (const magnet of MAGNET_MATERIALS) {
        for (const gear of GEAR_MATERIALS) {
          for (const battery of BATTERY_MATERIALS) {
            const selection: MaterialSelection = { wireId: wire.id, magnetId: magnet.id, gearId: gear.id, batteryId: battery.id, brushId: 'brush-carbon' };
            const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, selection);
            expect(result.ok, `${wire.id}×${magnet.id}×${gear.id}×${battery.id}: ${!result.ok ? result.reason : ''}`).toBe(true);
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
            expect(Number.isFinite(result.motorConfig.batteryInternalResistanceRatio)).toBe(true);
            expect(result.motorConfig.batteryInternalResistanceRatio!).toBeGreaterThan(0);
            expect(Number.isFinite(result.motorConfig.batteryCapacityRatio)).toBe(true);
            expect(result.motorConfig.batteryCapacityRatio!).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('9a. 合成写像の出力motorConfigをmotorPhysics.stepで実行してもNaN/Infinityが発生しない(engine側は無変更のsmokeテスト)', () => {
    const selection: MaterialSelection = {
      wireId: 'wire-silver',
      magnetId: 'magnet-neodymium',
      gearId: 'gear-titanium',
      batteryId: 'battery-lithium-polymer',
      brushId: 'brush-precious-metal',
    };
    const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, selection);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    let s = restState();
    const rng = () => 0.5;
    for (let i = 0; i < 120; i++) {
      s = step(result.motorConfig, s, 1 / 120, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: rng });
      expect(Number.isFinite(s.theta)).toBe(true);
      expect(Number.isFinite(s.omega)).toBe(true);
      expect(Number.isFinite(s.current)).toBe(true);
      expect(Number.isFinite(s.backEmf)).toBe(true);
    }
  });

  it('9b. 合成写像の出力motorConfig・carConfigの両方をstepTrackRunで実行してもNaN/Infinityが発生しない(gearEfficiency・massG込みのsmokeテスト、engine側は無変更)', () => {
    const selection: MaterialSelection = {
      wireId: 'wire-silver',
      magnetId: 'magnet-neodymium',
      gearId: 'gear-titanium',
      batteryId: 'battery-lithium-polymer',
      brushId: 'brush-precious-metal',
    };
    const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, selection);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const segment: TrackSegment = { lengthM: 10, slopeDeg: 0, surfaceGrip: 1, roughness: 0 };
    const track: TrackDefinition = { id: 'step7a-smoke', name: 'smoke', description: '', segments: [segment], objectives: [] };
    const validated = createValidatedTrack(track);
    let state = createInitialVehicleState(result.motorConfig, result.carConfig);
    const rng = () => 0.5;
    for (let i = 0; i < 120; i++) {
      state = stepTrackRun(result.motorConfig, result.carConfig, validated, state, 1 / 120, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: rng });
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
      const selection: MaterialSelection = {
        wireId: 'wire-copper-standard',
        magnetId: 'magnet-ferrite',
        gearId: 'gear-peek',
        batteryId: 'battery-alkaline',
        brushId: 'brush-carbon',
      };
      const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), invalidBaseline, selection);
      expect(result.ok).toBe(false);
      expect((result as { motorConfig?: unknown }).motorConfig).toBeUndefined();
      expect((result as { carConfig?: unknown }).carConfig).toBeUndefined();
    });
  });

  describe('Step7b(電池材質の内部抵抗ratio・容量ratio較正値)', () => {
    it('1. BATTERY_MATERIALSの全3tierに対応する内部抵抗ratio・容量ratioが存在する(Record型網羅+実行時確認)', () => {
      for (const battery of BATTERY_MATERIALS) {
        expect(computeBatteryInternalResistanceRatioCalibration(battery).ok, `${battery.id}の内部抵抗ratioが見つかりません`).toBe(true);
        expect(computeBatteryCapacityRatioCalibration(battery).ok, `${battery.id}の容量ratioが見つかりません`).toBe(true);
      }
    });

    it('2. anchor(battery-alkaline)は内部抵抗ratio・容量ratioともに厳密1.0になる', () => {
      const alkaline = BATTERY_MATERIALS.find((m) => m.id === 'battery-alkaline')!;
      expect(computeBatteryInternalResistanceRatioCalibration(alkaline)).toEqual({ ok: true, ratio: 1.0 });
      expect(computeBatteryCapacityRatioCalibration(alkaline)).toEqual({ ok: true, ratio: 1.0 });
    });

    it('3. NiMH=0.30/1.00、LiPo=0.15/1.30が確定値と一致する', () => {
      const nimh = BATTERY_MATERIALS.find((m) => m.id === 'battery-nickel-metal-hydride')!;
      const lipo = BATTERY_MATERIALS.find((m) => m.id === 'battery-lithium-polymer')!;
      expect(computeBatteryInternalResistanceRatioCalibration(nimh)).toEqual({ ok: true, ratio: 0.3 });
      expect(computeBatteryCapacityRatioCalibration(nimh)).toEqual({ ok: true, ratio: 1.0 });
      expect(computeBatteryInternalResistanceRatioCalibration(lipo)).toEqual({ ok: true, ratio: 0.15 });
      expect(computeBatteryCapacityRatioCalibration(lipo)).toEqual({ ok: true, ratio: 1.3 });
    });

    it('4. 全tierが有限正であり、Step6のクランプ範囲[0.01,10]内に収まる', () => {
      for (const battery of BATTERY_MATERIALS) {
        const internal = computeBatteryInternalResistanceRatioCalibration(battery);
        const capacity = computeBatteryCapacityRatioCalibration(battery);
        expect(internal.ok, battery.id).toBe(true);
        expect(capacity.ok, battery.id).toBe(true);
        if (internal.ok) {
          expect(Number.isFinite(internal.ratio)).toBe(true);
          expect(internal.ratio).toBeGreaterThanOrEqual(0.01);
          expect(internal.ratio).toBeLessThanOrEqual(10);
        }
        if (capacity.ok) {
          expect(Number.isFinite(capacity.ratio)).toBe(true);
          expect(capacity.ratio).toBeGreaterThanOrEqual(0.01);
          expect(capacity.ratio).toBeLessThanOrEqual(10);
        }
      }
    });

    it('5. 未登録の素材IDはok:falseで明示的に失敗する', () => {
      const unknownBattery = { ...BATTERY_MATERIALS[0], id: 'battery-unknown-fixture' };
      expect(computeBatteryInternalResistanceRatioCalibration(unknownBattery).ok).toBe(false);
      expect(computeBatteryCapacityRatioCalibration(unknownBattery).ok).toBe(false);
    });

    it('7. 電池個別較正関数の結果が、合成写像後の値と一致する(Step7aのテスト5・6と同型)', () => {
      const battery = BATTERY_MATERIALS.find((m) => m.id === 'battery-lithium-polymer')!;
      const selection: MaterialSelection = { ...CANONICAL_SELECTION, batteryId: 'battery-lithium-polymer' };
      const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, selection);
      const internal = computeBatteryInternalResistanceRatioCalibration(battery);
      const capacity = computeBatteryCapacityRatioCalibration(battery);
      expect(result.ok && internal.ok && capacity.ok).toBe(true);
      if (result.ok && internal.ok && capacity.ok) {
        expect(result.motorConfig.batteryInternalResistanceRatio).toBe(internal.ratio);
        expect(result.motorConfig.batteryCapacityRatio).toBe(capacity.ratio);
      }
    });

    it('8. selection中のbatteryIdが未登録の場合、部分更新されたconfigを返さず全体がok:falseになる(Step7aのテスト7の電池版)', () => {
      const badSelection: MaterialSelection = { ...CANONICAL_SELECTION, batteryId: 'battery-unknown-fixture' as MaterialSelection['batteryId'] };
      const result = composeConfigFromMaterials(baseMotorConfig(), baseCarConfig(), CANONICAL_BASELINE, badSelection);
      expect(result.ok).toBe(false);
      expect((result as { motorConfig?: unknown }).motorConfig).toBeUndefined();
      expect((result as { carConfig?: unknown }).carConfig).toBeUndefined();
    });

    // (必須修正1、Suu_mot3レビュー)較正関数の実行時検証(有限正・MC3範囲内)を、productionの
    // BATTERY_*_RATIO_CALIBRATIONテーブル(3tier、いずれも有限正かつ範囲内)への通常呼び出しで
    // 固定する。テーブル自体は正しい値のため、validateBatteryRatioの失敗分岐(NaN・0・負値・
    // 範囲外)を、private定数を改変せずに通常テストから到達させる方法がない
    // (Step7aの「anchor欠落テストが通常テストから作れない」docs/phase2-step7-suu-review-v3.md
    // §3と同型の限界、Fable Q5承認済みの結論: 型・コードレビュー上の防御として残す)。
    it('13. 3tierそれぞれについて実行時検査ロジックが「通れば安全な値である」ことを間接的に確認する(明示アサート)', () => {
      for (const battery of BATTERY_MATERIALS) {
        const internal = computeBatteryInternalResistanceRatioCalibration(battery);
        const capacity = computeBatteryCapacityRatioCalibration(battery);
        expect(internal.ok, battery.id).toBe(true);
        expect(capacity.ok, battery.id).toBe(true);
        if (internal.ok) {
          expect(Number.isFinite(internal.ratio)).toBe(true);
          expect(internal.ratio).toBeGreaterThan(0);
        }
        if (capacity.ok) {
          expect(Number.isFinite(capacity.ratio)).toBe(true);
          expect(capacity.ratio).toBeGreaterThan(0);
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// P3-1: 電池profile写像+D03較正値(docs/phase3-p3-1-plan.md v4 §2.3、正式Fable P3-1-Q3裁定)
// ---------------------------------------------------------------------------

const DT_P3_1 = 1 / 120;
const NO_NOISE_RNG_P3_1 = () => 0.5;

function p31BaseMotorConfig(overrides: Partial<MotorConfig> = {}): MotorConfig {
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

function p31RestState(): SimState {
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

// held-short(slitWidthMm=0固定)でBATTERY_HEAT_LIMITへ到達するまでのフレーム数を測定する
// (sweep証跡)。到達しなければnullを返す。
function measureHeatCapReachFrames(internalResistanceRatio: number, maxFrames = 3600): number | null {
  const config = p31BaseMotorConfig({ slitWidthMm: 0, batteryInternalResistanceRatio: internalResistanceRatio });
  let s = p31RestState();
  for (let i = 1; i <= maxFrames; i++) {
    s = step(config, s, DT_P3_1, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: NO_NOISE_RNG_P3_1 });
    if (s.batteryHeat >= BATTERY_HEAT_LIMIT) return i;
  }
  return null;
}

// アルカリ/NiMHの内部抵抗ratioを、裸の数値ではなくBATTERY_MATERIALS実データ+既存較正関数
// (computeBatteryInternalResistanceRatioCalibration)から導出する(Suu指摘、素材写像が
// 将来変わった場合にsweep証跡が乖離しないようにするため)。
function findBatteryMaterial(id: 'battery-alkaline' | 'battery-nickel-metal-hydride'): BatteryMaterial {
  const material = BATTERY_MATERIALS.find((b) => b.id === id);
  if (!material) throw new Error(`テスト前提が崩れています: ${id}がBATTERY_MATERIALSに存在しません`);
  return material;
}

function resolveInternalResistanceRatio(id: 'battery-alkaline' | 'battery-nickel-metal-hydride'): number {
  const result = computeBatteryInternalResistanceRatioCalibration(findBatteryMaterial(id));
  if (!result.ok) throw new Error(`テスト前提が崩れています: ${id}の内部抵抗較正値取得に失敗: ${result.reason}`);
  return result.ratio;
}

describe('P3-1: 電池destruction profile写像とD03較正値のsweep証跡', () => {
  it('mapBatteryDestructionProfileがBATTERY_MATERIALS実データどおりprofileを写像する', () => {
    expect(mapBatteryDestructionProfile('battery-alkaline')).toBe('nonLipo');
    expect(mapBatteryDestructionProfile('battery-nickel-metal-hydride')).toBe('nonLipo');
    expect(mapBatteryDestructionProfile('battery-lithium-polymer')).toBe('lipo');
  });

  it('mapD03DestructionConfigが候補値3.0秒(profile: nonLipo)を返す(アルカリ・NiMH)', () => {
    expect(mapD03DestructionConfig('battery-alkaline')).toEqual({ profile: 'nonLipo', shortCircuitDurationLimitS: 3.0 });
    expect(mapD03DestructionConfig('battery-nickel-metal-hydride')).toEqual({ profile: 'nonLipo', shortCircuitDurationLimitS: 3.0 });
  });

  describe('sweep証跡(正式Fable P3-1-Q3確定手順: 受け入れ条件3点+heat上限到達時間との関係)', () => {
    // 実測値(2026-08-04計測、npx tsxによる直接実行、本テストと同一の物理式・DT=1/120s):
    //   アルカリ(内部抵抗ratio=computeBatteryInternalResistanceRatioCalibration経由=1.0):
    //     held-short時、15フレーム(0.125秒)でBATTERY_HEAT_LIMIT到達
    //   NiMH(同ratio=0.3): held-short時、16フレーム(0.1333秒)でBATTERY_HEAT_LIMIT到達
    //   通常運用(短絡なし、120秒間): batteryHeatはアルカリ・NiMHとも終始0のまま。
    //     訂正(Suu指摘): nextBatteryHeatは非短絡時もlossCurrent=currentとしてI²R発熱項を
    //     計算しており、「短絡時のみ発熱を生む」設計ではない。この通常構成(適度な初速の
    //     フリー走行、追加負荷なし)では、電流由来の発熱項をHEAT_DISSIPATION(自然放熱)が
    //     上回るため蓄積しないだけであり、発熱項自体は非短絡時にも存在する。
    // heat上限到達時間(約0.13秒)は候補値3.0秒よりはるかに早いため、この構成でのD03実発火
    // タイミングは短絡持続下限(3.0秒)そのものに支配される(heat条件は先に満たされ待機状態になる)。

    it('受け入れ条件1: 通常運用(短絡なし)ではBATTERY_HEAT_LIMITに到達しない(アルカリ・NiMHそれぞれ120秒間)', () => {
      const alkalineRatio = resolveInternalResistanceRatio('battery-alkaline');
      const nimhRatio = resolveInternalResistanceRatio('battery-nickel-metal-hydride');
      const frames = Math.round(120 / DT_P3_1);

      const runNormalOperation = (ratio: number): number => {
        const config = p31BaseMotorConfig({ batteryInternalResistanceRatio: ratio });
        let s: SimState = { ...p31RestState(), omega: 50 };
        let maxHeat = 0;
        for (let i = 0; i < frames; i++) {
          s = step(config, s, DT_P3_1, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: NO_NOISE_RNG_P3_1 });
          maxHeat = Math.max(maxHeat, s.batteryHeat);
        }
        return maxHeat;
      };

      expect(runNormalOperation(alkalineRatio), 'アルカリ: 120秒間の通常運用でBATTERY_HEAT_LIMIT未到達であること').toBeLessThan(BATTERY_HEAT_LIMIT);
      expect(runNormalOperation(nimhRatio), 'NiMH: 120秒間の通常運用でBATTERY_HEAT_LIMIT未到達であること').toBeLessThan(BATTERY_HEAT_LIMIT);
    });

    it('受け入れ条件2: held-short(持続短絡)でアルカリ・NiMHともに設計較正時点の実測フレーム数でBATTERY_HEAT_LIMITへ到達する(数値回帰)', () => {
      const alkalineRatio = resolveInternalResistanceRatio('battery-alkaline');
      const nimhRatio = resolveInternalResistanceRatio('battery-nickel-metal-hydride');
      const alkalineFrames = measureHeatCapReachFrames(alkalineRatio);
      const nimhFrames = measureHeatCapReachFrames(nimhRatio);

      // 設計較正時点(2026-08-04)の実測値を数値回帰として固定する。既存nextBatteryHeatの
      // 発熱式が将来意図的に変わった場合、この回帰が変化を検出し、sweep証跡の再取得・
      // 再レビューを促す警報になる(Suu指摘)。
      expect(alkalineFrames, 'アルカリのheat上限到達フレーム数(設計較正時点の回帰)').toBe(15);
      expect(nimhFrames, 'NiMHのheat上限到達フレーム数(設計較正時点の回帰)').toBe(16);

      const alkalineSeconds = alkalineFrames! * DT_P3_1;
      const nimhSeconds = nimhFrames! * DT_P3_1;
      expect(alkalineSeconds, 'アルカリのheat上限到達秒数').toBeCloseTo(0.125, 6);
      expect(nimhSeconds, 'NiMHのheat上限到達秒数').toBeCloseTo(1 / 7.5, 6); // 16/120 ≈ 0.1333秒
      // heat上限到達時間は候補値3.0秒より十分早い
      expect(alkalineSeconds).toBeLessThan(3.0);
      expect(nimhSeconds).toBeLessThan(3.0);
    });

    it('受け入れ条件3(境界実装前提の数値実測、サブステップ2で実経路検証予定): dt=1/120sの360回加算が3.0を僅かに下回る', () => {
      // 本テストはadvanceD03(P3-1サブステップ2、未実装)をまだ呼ばない。ここではdt蓄積の
      // 浮動小数点特性を実測するだけであり、「D03のオン・オフが正確に切り替わる」ことの
      // 受け入れ完了はサブステップ2(advanceDestructionState実経路での359/360フレーム
      // テスト)へ持ち越す(Suu指摘)。
      //
      // 実測: dt=1/120sを360回加算した値は2.999999999999992であり、厳密な3.0にはならない
      // (浮動小数点誤差)。サブステップ2のadvanceD03実装では、物理較正値ではなく浮動小数点
      // 誤差吸収のためのprivateなepsilon(1e-9秒、既存scoring.ts等の先例と同型)を用いて
      // durationS + epsilon >= limitS として判定し、359フレーム未発火・360フレーム発火を
      // 実経路でテストする(361フレームへの遅延は許容仕様にしない)。
      const limitS = mapD03DestructionConfig('battery-alkaline').shortCircuitDurationLimitS;
      const framesToLimit = Math.round(limitS / DT_P3_1); // 3.0 / (1/120) = 360
      let shortCircuitDurationS = 0;
      for (let i = 1; i <= framesToLimit; i++) {
        shortCircuitDurationS += DT_P3_1;
      }
      expect(shortCircuitDurationS).toBeLessThan(limitS);
      expect(shortCircuitDurationS).toBeCloseTo(limitS, 12); // 誤差の大きさ自体は極小であることを確認
    });
  });
});

describe('P3-2ゲート2: D04/D07較正値の写像(物理到達sweepを含まない純関数単体テスト)', () => {
  const ALL_MAGNET_IDS = MAGNET_MATERIALS.map((m) => m.id);
  const ALL_BODY_IDS = BODY_MATERIALS.map((m) => m.id) as readonly BodyMaterialId[];
  const NON_DEMAGNETIZING_MAGNET_IDS = ['magnet-ferrite', 'magnet-alnico', 'magnet-samarium-cobalt'] as const;
  const DEMAGNETIZING_MAGNET_IDS = ['magnet-neodymium'] as const;

  it('mapD04BatteryDestructionConfigはprofile:"lipo"の完全なconfigを返す(internalResistanceDegradationMultiplier込み。stageDurationsは正式Fable P3-2ゲート5 Q13-1裁定〈overheated保留規則、2026-08-09人間再承認済み〉で確定)', () => {
    const config = mapD04BatteryDestructionConfig('battery-lithium-polymer');
    expect(config.profile).toBe('lipo');
    expect(config.internalResistanceDegradationMultiplier).toBe(1.5); // 人間再承認済みの初期候補値(変更なし)
    expect(config.shortCircuitDurationLimitS).toBe(0.05); // Q13-1裁定の対象外、現状維持
    expect(config.runawayHeatThreshold).toBe(0.3); // Q13-1裁定の対象外、現状維持
    expect(config.stageDurations.swellingS).toBe(0.35); // Q13-1裁定で確定(12fps格子4個)
    expect(config.stageDurations.smokingS).toBe(0.25); // Q13-1裁定で確定(12fps格子3個)
  });

  it('Suu_mot3ゲート2レビュー: mapD04BatteryDestructionConfigは呼び出しごとに独立したstageDurationsオブジェクトを返す(1回目の戻り値を変更しても2回目の結果が候補値と完全一致する)', () => {
    const first = mapD04BatteryDestructionConfig('battery-lithium-polymer');
    first.stageDurations.swellingS = -999;
    first.stageDurations.smokingS = -999;
    const second = mapD04BatteryDestructionConfig('battery-lithium-polymer');
    expect(second.stageDurations.swellingS).toBe(0.35);
    expect(second.stageDurations.smokingS).toBe(0.25);
  });

  it('mapBodyScorchDeltaFractionはBODY_MATERIALS全素材で有限の0以上1以下の値を返し、body-none(hasPhysicalMaterial:false)は0を返す', () => {
    for (const bodyId of ALL_BODY_IDS) {
      const value = mapBodyScorchDeltaFraction(bodyId);
      expect(Number.isFinite(value), `${bodyId}: 有限であること`).toBe(true);
      expect(value, `${bodyId}: [0,1]の範囲`).toBeGreaterThanOrEqual(0);
      expect(value, `${bodyId}: [0,1]の範囲`).toBeLessThanOrEqual(1);
    }
    expect(mapBodyScorchDeltaFraction('body-none')).toBe(0);
  });

  it('mapMagnetScorchDeltaFractionはnonDemagnetizing磁石(ferrite/alnico/samarium-cobalt)に0を返す', () => {
    for (const magnetId of NON_DEMAGNETIZING_MAGNET_IDS) {
      expect(mapMagnetScorchDeltaFraction(magnetId), magnetId).toBe(0);
    }
  });

  it('mapD07DestructionConfigはferrite/alnico/samarium-cobaltにirreversible.kind==="nonDemagnetizing"を、neodymiumに"demagnetizing"を返す(spec.md「ネオジムのみ実用域で発生、他は事実上安全」)', () => {
    for (const magnetId of NON_DEMAGNETIZING_MAGNET_IDS) {
      expect(mapD07DestructionConfig(magnetId).irreversible.kind, magnetId).toBe('nonDemagnetizing');
    }
    for (const magnetId of DEMAGNETIZING_MAGNET_IDS) {
      expect(mapD07DestructionConfig(magnetId).irreversible.kind, magnetId).toBe('demagnetizing');
    }
  });

  it('mapD07DestructionConfigは全磁石素材でthermal係数(HUD熱ゲージ用、磁石の種類によらず常時必須)が有限正である', () => {
    for (const magnetId of ALL_MAGNET_IDS) {
      const config = mapD07DestructionConfig(magnetId);
      expect(config.thermal.conductionCoefficient, magnetId).toBeGreaterThan(0);
      expect(config.thermal.dissipationCoefficient, magnetId).toBeGreaterThan(0);
      expect(Number.isFinite(config.thermal.conductionCoefficient), magnetId).toBe(true);
      expect(Number.isFinite(config.thermal.dissipationCoefficient), magnetId).toBe(true);
    }
  });

  it('Suu_mot3ゲート2レビュー: mapD07DestructionConfigは呼び出しごとに独立したthermalオブジェクトを返す(1回目の戻り値を変更しても2回目の結果が候補値と完全一致する。conductionCoefficientはゲート5でproduction-valid構成による再sweepで裏付け済みだがQ13-3裁定待ち)', () => {
    const first = mapD07DestructionConfig('magnet-neodymium');
    first.thermal.conductionCoefficient = -999;
    first.thermal.dissipationCoefficient = -999;
    const second = mapD07DestructionConfig('magnet-neodymium');
    expect(second.thermal.conductionCoefficient).toBe(0.25); // Q13-3裁定待ち(旧候補0.001から改訂、production-valid再sweepで裏付け済み)
    expect(second.thermal.dissipationCoefficient).toBe(0.5); // 変更なし
  });

  it('付帯条件4(正式Fable P3-2-Q5裁定): 全磁石素材でmapMagnetScorchDeltaFraction >= (demagnetizingならdemagnetizationDeltaFraction、nonDemagnetizingなら0)を満たす', () => {
    for (const magnetId of ALL_MAGNET_IDS) {
      const scorch = mapMagnetScorchDeltaFraction(magnetId);
      const d07 = mapD07DestructionConfig(magnetId);
      const demag = d07.irreversible.kind === 'demagnetizing' ? d07.irreversible.demagnetizationDeltaFraction : 0;
      expect(scorch, `${magnetId}: magnetScorchDeltaFraction(${scorch}) >= demag相当(${demag})`).toBeGreaterThanOrEqual(demag);
    }
  });

  it('生成されたDestructionConfig(mapD04BatteryDestructionConfig/mapD07DestructionConfig由来)はvalidateDestructionConfigをok:trueで通過する(全磁石素材)', () => {
    for (const magnetId of ALL_MAGNET_IDS) {
      const draft: DestructionConfigDraft = {
        battery: mapD04BatteryDestructionConfig('battery-lithium-polymer'),
        d01: { decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5, coilDeformOmegaRadS: COIL_DEFORM_OMEGA },
        d02: { smokeGaugeThreshold: 0.6, coilOverheatGaugeLimit: 1, conductionScale: 0.04, dissipationCoefficient: 0.5, smokeResistanceMultiplier: 1.2 },
        d04: { bodyScorchDeltaFraction: mapBodyScorchDeltaFraction('body-ps-cowl'), magnetScorchDeltaFraction: mapMagnetScorchDeltaFraction(magnetId) },
        d05: {
          brushSparkDurationLimitS: 0.15,
          brushSparkCurrentThresholdA: 3,
          brushWearRateRatio: 1,
          highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 8, highCurrentPenaltyMultiplier: 1.5 },
          wearPerAmpSecond: 0.001,
          recoveryFrames: 6,
          recoveryContactResistanceMultiplier: 1.2,
        },
        d06: { breakage: { kind: 'nonBreakable' }, toothFatigueExposureNmS: 0.5 },
        d07: mapD07DestructionConfig(magnetId),
        d09: {
        thermal: { conductionCoefficient: 0.25, dissipationCoefficient: 0.5 },
        bearingSeizureGaugeLimit: 1,
        metalGearContactAlways: false,
        highLoadHighSpeed: { loadTorqueThresholdNm: 0.2, rpmThreshold: 3000 },
        gearSeizureDeltaFraction: 0.15,
        bearingSeizureDeltaFraction: 0.2,
      },
      };
      const result = validateDestructionConfig(draft);
      expect(result.ok, `${magnetId}: ${result.ok ? '' : JSON.stringify(result.invalidFields)}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// P3-2ゲート5(是正版、2026-08-09): M4到達可能性(D04)・D07 Q11受け入れ条件・Q2独立sweepの
// 物理到達sweep証跡(docs/phase3-p3-2-plan.md v13 §3.3・§2.5・8節)。
//
// 初回版(2026-08-08)はSuu_mot3レビューでP1〜P5の5点を要修正として差し戻された。本版は
// それぞれ次のとおり是正する:
// P1(production-valid fixture方針違反): 全fixtureをcomposeConfigFromMaterials(実写像)の
//   出力から構築し、素材写像値(magnetStrength・batteryInternalResistanceRatio・
//   batteryCapacityRatio)は上書きしない。「高負荷」等の演出はplayer-adjustable値
//   (coilTurns・magnetDistanceMm・brushPressure・gearRatio・tireGrip・slopeDeg)側だけで
//   構築する。
// P2(UI識別可能性との衝突): D04段階時間(swellingS/smokingS)候補値はart-spec §7の12fps格子
//   (0.0833秒)と両立しないことがfeasibility実測で判明した。値の変更では解決できない
//   構造的対立であるため、Q13-1として正式Fable補足裁定を依頼する
//   (docs/phase3-p3-2-gate5-calibration-review-request.md)。feasibility実測表を本節に含める。
// P3(通常運用の定義): 恣意的な30秒/100kmではなく、実在コース(src/data/tracksの
//   'energy-run')の自然完走、およびspec.md P4-0(20〜30秒コース)の設計意図引用を根拠にする。
// P4(D07非空虚性不足): terminatedAtStep/finalStatusを正確にassert・報告し、「全step・全構成」
//   という過大主張だった条件4を実態(ferrite単一構成の極端入力回帰)に合わせて改名する。
// P5(Q2定常性の不足): 末尾1フレームではなく窓平均(前半/後半比較込み)で定常性を確認し、
//   isolated fixture(conductionCoefficient≈0)を「production-valid」ではなく
//   「schema-valid test-only isolation」と明記する。
// ---------------------------------------------------------------------------

describe('P3-2ゲート5(是正版): M4到達可能性・D07 Q11・Q2独立sweepの物理到達sweep証跡', () => {
  const DT_G5 = 1 / 120;
  const NO_NOISE_RNG_G5 = () => 0.5;
  const G5_BASELINE: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 0.8 };

  // P1是正(Suu_mot3レビュー是正2、必須追補3)+ゲート5是正ラウンド2是正(必須追補2、
  // 2026-08-09): production-valid fixture builder。composeConfigFromMaterialsの実出力を
  // 出発点にし、motorOverrides/carOverridesにはplayer-adjustable値だけを渡す契約とする。
  //
  // 現利用キーの依存閉包(`rg "pvMotorCar\(" -A3`実測、2026-08-09): motorOverridesは
  // coilTurns・magnetDistanceMm・brushPressure・slitWidthMmの4キーのみ、carOverridesは
  // gearRatio・tireGripの2キーのみが実際に使われている(全呼び出し箇所を確認済み)。
  // fail-closedな許可リスト(Pick方式)でこの6キーだけに閉じる——Omit方式(素材所有キー
  // だけを除外し残り全部を許可)はfail-openであり、MotorConfig/CarConfigへ将来新しい
  // 素材所有フィールドが追加された際に無検査で上書き可能になってしまう(初回P1事故と
  // 同階級の不正入力を再び構築可能にする欠陥)。将来player-adjustable値を追加する場合は、
  // テスト計画・レビューを経てこの許可リストへ明示的にキーを追加すること(自動拡張しない)。
  function pvMotorCar(
    selection: MaterialSelection,
    motorOverrides: Partial<Pick<MotorConfig, 'coilTurns' | 'magnetDistanceMm' | 'brushPressure' | 'slitWidthMm'>> = {},
    carOverrides: Partial<Pick<CarConfig, 'gearRatio' | 'tireGrip'>> = {},
  ): { motorConfig: MotorConfig; carConfig: CarConfig } {
    const baseMotor: MotorConfig = { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 0.5, magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.4, parallelStrands: 1, varnished: true, ...motorOverrides };
    const baseCar: CarConfig = { massG: 150, gearEfficiency: 0.8, gearRatio: 4, wheelDiameterMm: 30, tireGrip: 0.7, axleFriction: 0, wheelAlignmentMm: 0, centerOfMassHeightMm: 20, motorMountOffsetMm: 0, ...carOverrides };
    const result = composeConfigFromMaterials(baseMotor, baseCar, G5_BASELINE, selection);
    if (!result.ok) throw new Error(`テスト前提が崩れています: composeConfigFromMaterials失敗(${result.reason})`);
    return { motorConfig: result.motorConfig, carConfig: result.carConfig };
  }

  // P1是正(Suu_mot3レビュー是正2、必須追補3): このtrackは「production-valid」ではない。
  // 正確には「素材写像・MotorConfig/CarConfigはpvMotorCar経由でproduction-validだが、
  // 到達可能性harness(M4/D07/feasibility)が使う長距離track自体はschema-valid
  // test-only synthetic track(lengthM=100000、実在コースではない)」という区別である。
  // 実在コースでの検証はM4条件1(energy-run自然完走)のみが行う。
  function g5LongTrack(hasEnergyBudget: boolean, slopeDeg = 0) {
    const def: TrackDefinition = { id: 'g5-track', name: 'g5-track', description: '', segments: [{ lengthM: 100000, slopeDeg, surfaceGrip: 0.7, roughness: 0.2 }], objectives: [] };
    return createValidatedTrack({ ...def, hasEnergyBudget } as TrackDefinition);
  }

  function g5VehicleRunContext(): DestructionRunContext {
    return { context: 'vehicle', fireExposureProfile: { bodyEquipped: true, adjacentRolesEquipped: ['magnet'] }, gearTotalToothCount: 10 };
  }

  // 単一出典: production較正値(mapD04BatteryDestructionConfig/mapD07DestructionConfig)を
  // そのまま使う。ここで数値を複製・再定義しない。
  function g5LipoDestructionConfig(): DestructionConfig {
    return {
      battery: mapD04BatteryDestructionConfig('battery-lithium-polymer'),
      d01: { decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5, coilDeformOmegaRadS: COIL_DEFORM_OMEGA },
      d02: { smokeGaugeThreshold: 0.6, coilOverheatGaugeLimit: 1, conductionScale: 0.04, dissipationCoefficient: 0.5, smokeResistanceMultiplier: 1.2 },
      d04: { bodyScorchDeltaFraction: mapBodyScorchDeltaFraction('body-ps-cowl'), magnetScorchDeltaFraction: mapMagnetScorchDeltaFraction('magnet-neodymium') },
      d05: {
        brushSparkDurationLimitS: 0.15,
        brushSparkCurrentThresholdA: 3,
        brushWearRateRatio: 1,
        highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 8, highCurrentPenaltyMultiplier: 1.5 },
        wearPerAmpSecond: 0.001,
        recoveryFrames: 6,
        recoveryContactResistanceMultiplier: 1.2,
      },
      d06: { breakage: { kind: 'nonBreakable' }, toothFatigueExposureNmS: 0.5 },
      d07: mapD07DestructionConfig('magnet-neodymium'),
      d09: {
        thermal: { conductionCoefficient: 0.25, dissipationCoefficient: 0.5 },
        bearingSeizureGaugeLimit: 1,
        metalGearContactAlways: false,
        highLoadHighSpeed: { loadTorqueThresholdNm: 0.2, rpmThreshold: 3000 },
        gearSeizureDeltaFraction: 0.15,
        bearingSeizureDeltaFraction: 0.2,
      },
    };
  }

  function g5NonLipoDestructionConfig(magnetId: 'magnet-neodymium' | 'magnet-ferrite' = 'magnet-neodymium'): DestructionConfig {
    return {
      battery: { profile: 'nonLipo', shortCircuitDurationLimitS: 999 }, // D07 sweepはD03/D04と無関係、短絡経路は評価させない
      d01: { decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5, coilDeformOmegaRadS: COIL_DEFORM_OMEGA },
      d02: { smokeGaugeThreshold: 0.6, coilOverheatGaugeLimit: 1, conductionScale: 0.04, dissipationCoefficient: 0.5, smokeResistanceMultiplier: 1.2 },
      d04: { bodyScorchDeltaFraction: mapBodyScorchDeltaFraction('body-ps-cowl'), magnetScorchDeltaFraction: mapMagnetScorchDeltaFraction(magnetId) },
      d05: {
        brushSparkDurationLimitS: 0.15,
        brushSparkCurrentThresholdA: 3,
        brushWearRateRatio: 1,
        highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 8, highCurrentPenaltyMultiplier: 1.5 },
        wearPerAmpSecond: 0.001,
        recoveryFrames: 6,
        recoveryContactResistanceMultiplier: 1.2,
      },
      d06: { breakage: { kind: 'nonBreakable' }, toothFatigueExposureNmS: 0.5 },
      d07: mapD07DestructionConfig(magnetId),
      d09: {
        thermal: { conductionCoefficient: 0.25, dissipationCoefficient: 0.5 },
        bearingSeizureGaugeLimit: 1,
        metalGearContactAlways: false,
        highLoadHighSpeed: { loadTorqueThresholdNm: 0.2, rpmThreshold: 3000 },
        gearSeizureDeltaFraction: 0.15,
        bearingSeizureDeltaFraction: 0.2,
      },
    };
  }

  type VehicleStatus = 'ready' | 'running' | 'finished' | 'stalled' | 'derailed' | 'overheated';

  // M4 test-only harness(計画v13 §3.3のsweepM4Reachability疑似コードを実関数で実装したもの)。
  // 各stepでcomposeEffectiveMotorConfigを1回作り、同じeffectiveConfigをstepTrackRunと
  // buildVehicleFrameInputの両方へ渡す(単一出典契約)。theoreticalCurrentA/energyUsedRatio/
  // D07熱式はここで複製しない——buildVehicleFrameInput・advanceDestructionStateの実関数を
  // そのまま呼ぶ。
  interface M4Diagnostics {
    reachedBurning: boolean;
    finalStep: number;
    finalStatus: VehicleStatus;
    maxEnergyUsedRatio: number;
    finalD04Stage: 'none' | 'swelling' | 'smoking' | 'burning';
    unsafeDischargeEnteredAtStep: number | null;
    shortThresholdAtStep: number | null;
    runawayAtStep: number | null;
    swellingAtStep: number | null;
    smokingAtStep: number | null;
    burningAtStep: number | null;
    burningEnergyUsedRatio: number | null;
    burningInitiatingCause: { shortCircuitDurationS: number; overDischargeRatio: number | null } | null;
    // overheated保留規則(P3-2ゲート5 Q13-1)が実際に発動したstep(base stepの生の出力が
    // overheatedだったが、post正規化でrunningへ書き換えられた最初のstep)。一度も発動しなければ
    // null(=この構成ではそもそもoverheatedに到達せず保留規則が無関係だったことを示す)。
    firstHeldOverheatedAtStep: number | null;
  }

  function sweepM4Reachability(baseMotorConfig: MotorConfig, carConfig: CarConfig, track: ReturnType<typeof g5LongTrack>, destructionConfig: DestructionConfig, maxSteps: number): M4Diagnostics {
    let vehicleState = createInitialVehicleState(baseMotorConfig, carConfig);
    let destructionState = createInitialDestructionState('lipo');
    const runContext = g5VehicleRunContext();
    let maxEnergyUsedRatio = 0;
    let unsafeDischargeEnteredAtStep: number | null = null;
    let shortThresholdAtStep: number | null = null, runawayAtStep: number | null = null;
    let swellingAtStep: number | null = null, smokingAtStep: number | null = null, burningAtStep: number | null = null;
    let burningEnergyUsedRatio: number | null = null;
    let burningInitiatingCause: M4Diagnostics['burningInitiatingCause'] = null;
    let firstHeldOverheatedAtStep: number | null = null;

    for (let i = 0; i < maxSteps; i++) {
      // overheated保留規則(正式Fable P3-2ゲート5 Q13-1裁定、docs/phase3-p3-2-plan.md 14.2節)。
      // wrapper共通契約のpre面: base step(stepTrackRun)へ渡す直前に、prev vehicle state・
      // prev destruction stateへnormalizeOverheatedStatusForD04Holdを適用し、base step内部の
      // 早期returnガード(status==='overheated'なら入力をそのまま返す)を回避する。
      const prevVehicleState = normalizeOverheatedStatusForD04Hold(vehicleState, destructionState);
      const effectiveConfig = composeEffectiveMotorConfig(baseMotorConfig, destructionState, destructionConfig); // 単一出典
      const rawNextVehicleState = stepTrackRun(effectiveConfig, carConfig, track, prevVehicleState, DT_G5, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: NO_NOISE_RNG_G5 }); // 実効configを使用
      vehicleState = rawNextVehicleState;
      const frame = buildVehicleFrameInput(effectiveConfig, carConfig, prevVehicleState, vehicleState); // 同じ実効configを使用、実関数をそのまま使用
      if (destructionConfig.battery.profile === 'lipo' && runawayAtStep === null && frame.batteryHeat >= destructionConfig.battery.runawayHeatThreshold) {
        runawayAtStep = i;
      }
      const result = advanceDestructionState(destructionState, frame, destructionConfig, runContext, DT_G5);
      destructionState = result.state;
      // wrapper共通契約のpost面: advanceDestructionState実行後のnext destruction stateと、
      // base stepが返した生のnext vehicle stateへ再適用してからphysics end判定へ渡す。
      // これによりnone→swelling同一step境界でも正しく保留される(14.2節)。
      vehicleState = normalizeOverheatedStatusForD04Hold(rawNextVehicleState, destructionState);
      // 保留規則が実際に発動したこと(base生出力がoverheatedだったが正規化でrunningへ
      // 書き換えられたこと)を空虚な一致の禁止として記録する。
      if (firstHeldOverheatedAtStep === null && rawNextVehicleState.status === 'overheated' && vehicleState.status === 'running') {
        firstHeldOverheatedAtStep = i;
      }
      // feasibility()と同一のepsilon比較(production本体advanceD04と単一出典)で判定する。
      if (
        destructionConfig.battery.profile === 'lipo' && shortThresholdAtStep === null
        && destructionState.shared.shortCircuitDurationS + DURATION_COMPARISON_EPSILON_S >= destructionConfig.battery.shortCircuitDurationLimitS
      ) {
        shortThresholdAtStep = i;
      }

      if (frame.energyUsedRatio !== undefined && destructionConfig.battery.profile === 'lipo') {
        maxEnergyUsedRatio = Math.max(maxEnergyUsedRatio, frame.energyUsedRatio);
        if (unsafeDischargeEnteredAtStep === null && frame.energyUsedRatio >= destructionConfig.battery.unsafeDischargeStartRatio) {
          unsafeDischargeEnteredAtStep = i;
        }
      }
      if (destructionState.battery.profile === 'lipo') {
        const stage = destructionState.battery.d04.stage;
        if (stage === 'swelling' && swellingAtStep === null) swellingAtStep = i;
        if (stage === 'smoking' && smokingAtStep === null) smokingAtStep = i;
        if (stage === 'burning' && burningAtStep === null) burningAtStep = i;
      }
      const burningEvent = result.events.find((e) => e.mode === 'D04' && e.causeLog.stage === 'burning');
      if (burningEvent && burningEvent.mode === 'D04') {
        burningEnergyUsedRatio = frame.energyUsedRatio ?? null;
        burningInitiatingCause = burningEvent.causeLog.initiatingCause;
        return {
          reachedBurning: true, finalStep: i, finalStatus: vehicleState.status, maxEnergyUsedRatio,
          finalD04Stage: 'burning', unsafeDischargeEnteredAtStep, shortThresholdAtStep, runawayAtStep,
          swellingAtStep, smokingAtStep, burningAtStep, burningEnergyUsedRatio, burningInitiatingCause,
          firstHeldOverheatedAtStep,
        };
      }
      if (vehicleState.status !== 'running') {
        return {
          reachedBurning: false, finalStep: i, finalStatus: vehicleState.status, maxEnergyUsedRatio,
          finalD04Stage: destructionState.battery.profile === 'lipo' ? destructionState.battery.d04.stage : 'none',
          unsafeDischargeEnteredAtStep, shortThresholdAtStep, runawayAtStep,
          swellingAtStep, smokingAtStep, burningAtStep, burningEnergyUsedRatio: null, burningInitiatingCause: null,
          firstHeldOverheatedAtStep,
        };
      }
    }
    return {
      reachedBurning: false, finalStep: maxSteps, finalStatus: vehicleState.status, maxEnergyUsedRatio,
      finalD04Stage: destructionState.battery.profile === 'lipo' ? destructionState.battery.d04.stage : 'none',
      unsafeDischargeEnteredAtStep, shortThresholdAtStep, runawayAtStep,
      swellingAtStep, smokingAtStep, burningAtStep, burningEnergyUsedRatio: null, burningInitiatingCause: null,
      firstHeldOverheatedAtStep,
    };
  }

  // 必須是正P3(Suu_mot3レビュー、2026-08-09): 「burning eventを見つけただけ」では
  // destructionTerminal成立を意味しない。実productionの経路(classifyTerminalModes→
  // terminalModeCandidates蓄積→finalizeDestructionRun/finalizeRun)を実関数でそのまま辿り、
  // 本物のRunOutcomeを得るharness。stepMotorWithDestruction(motor-onlyラッパー、
  // destructionOrchestration.ts)が内部で行っている集計パターンを、vehicle文脈向けに
  // test-only harnessとして再現する(production版stepTrackRunWithDestructionはP3-4まで
  // 新設しない、1.1節の非対象と矛盾しない——ここではproduction関数を呼ぶ側を書いているだけで、
  // 新しいproduction関数を追加してはいない)。stampPhysicsSnapshot/asNonEmptyは
  // destructionOrchestration.ts内の非export・自明な構造ヘルパー(map/length判定のみ)のため、
  // 較正値のような二重出典リスクはなく、ここでの再実装は許容する。
  function runVehicleToRunOutcome(
    motorConfig: MotorConfig, carConfig: CarConfig, track: ReturnType<typeof g5LongTrack>,
    destructionConfig: DestructionConfig, batteryProfile: 'lipo' | 'nonLipo', maxSteps: number,
  ): {
    outcome: RunOutcome; finalStep: number;
    swellingAtStep: number | null; smokingAtStep: number | null; burningAtStep: number | null;
    firstHeldOverheatedAtStep: number | null;
    rawVehicleStatusAtOutcomeStep: VehicleSimState['status'];
  } {
    const initialVehicleState = createInitialVehicleState(motorConfig, carConfig);
    const snapshot = captureRunSnapshot({
      motorConfig, carConfig, destructionConfig,
      runContext: g5VehicleRunContext(),
      initialMotorState: initialVehicleState.motor,
      initialVehicleState,
      track,
      courseLengthM: null, // track-run文脈(track非null)のためnull必須(ゲート6正式M2検証、5.2節)
      slopeRad: null,
      seed: 1,
      initialDestructionState: createInitialDestructionState(batteryProfile),
      recipeKey: 'v1|test-vehicle',
    });
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let vehicleState = snapshot.initialVehicleState!;
    let swellingAtStep: number | null = null, smokingAtStep: number | null = null, burningAtStep: number | null = null;
    let firstHeldOverheatedAtStep: number | null = null;
    for (let i = 0; i < maxSteps; i++) {
      const prevVehicleState = normalizeOverheatedStatusForD04Hold(vehicleState, accumulator.destructionState);
      const effectiveConfig = composeEffectiveMotorConfig(snapshot.motorConfig, accumulator.destructionState, snapshot.destructionConfig);
      const rawNextVehicleState = stepTrackRun(effectiveConfig, snapshot.carConfig!, track, prevVehicleState, DT_G5, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: NO_NOISE_RNG_G5 });
      const frame = buildVehicleFrameInput(effectiveConfig, carConfig, prevVehicleState, rawNextVehicleState);
      const { state, events } = advanceDestructionState(accumulator.destructionState, frame, snapshot.destructionConfig, snapshot.runContext, DT_G5);
      vehicleState = normalizeOverheatedStatusForD04Hold(rawNextVehicleState, state);
      if (firstHeldOverheatedAtStep === null && rawNextVehicleState.status === 'overheated' && vehicleState.status === 'running') {
        firstHeldOverheatedAtStep = i;
      }
      if (state.battery.profile === 'lipo') {
        if (state.battery.d04.stage === 'swelling' && swellingAtStep === null) swellingAtStep = i;
        if (state.battery.d04.stage === 'smoking' && smokingAtStep === null) smokingAtStep = i;
        if (state.battery.d04.stage === 'burning' && burningAtStep === null) burningAtStep = i;
      }
      const physicsSnapshotAtT: PhysicsSnapshotAtT = { context: 'vehicle', state: vehicleState };
      const stampedEvents: readonly DestructionEvent[] = events.map((e) => ({ ...e, physicsSnapshotAtT }));
      const nextTerminalModeCandidates = [...accumulator.terminalModeCandidates, ...classifyTerminalModes(events)];
      accumulator = {
        ...accumulator, destructionState: state,
        events: [...accumulator.events, ...stampedEvents],
        terminalModeCandidates: nextTerminalModeCandidates,
      };
      const [firstTerminalMode, ...restTerminalModes] = nextTerminalModeCandidates;
      if (firstTerminalMode !== undefined) {
        // 同一frame優先規則: terminalModeCandidates(D02/D03/D04-burning/D06/D09)が1件でも
        // あれば、vehicleState.statusが同一step内でoverheated等になっていてもdestructionTerminal
        // を優先する(既存production accumulatorパターンをそのまま踏襲、この分岐順序自体が
        // 優先規則の実体)。
        return {
          outcome: finalizeDestructionRun({ ...accumulator, terminalModeCandidates: [firstTerminalMode, ...restTerminalModes] }),
          finalStep: i, swellingAtStep, smokingAtStep, burningAtStep, firstHeldOverheatedAtStep,
          rawVehicleStatusAtOutcomeStep: rawNextVehicleState.status,
        };
      }
      if (vehicleState.status === 'finished' || vehicleState.status === 'stalled' || vehicleState.status === 'derailed' || vehicleState.status === 'overheated') {
        return {
          outcome: finalizeRun(accumulator, { kind: 'physicsEnded', physicsEndStatus: vehicleState.status === 'stalled' ? { status: 'stalled', failureCode: vehicleState.failureCode } : { status: vehicleState.status } }),
          finalStep: i, swellingAtStep, smokingAtStep, burningAtStep, firstHeldOverheatedAtStep,
          rawVehicleStatusAtOutcomeStep: rawNextVehicleState.status,
        };
      }
    }
    throw new Error('テスト前提が崩れています: maxSteps以内に終端しませんでした');
  }

  // D02専用M4型sweep受け入れ条件(計画v10 3.4節、正式Fable P3-3-Q1裁定に伴う付帯要件、
  // checkpoint5較正sweep)。D02専用熱ゲージが電池系終端(overheated/D03/D04)より先に発火
  // できるproduction-valid構成が最低1つ存在することを示す(死にモード防止)。motor-only文脈
  // (固定loadTorqueによる高電流維持、Q2独立sweepと同型のharness)。
  // production-valid選択: wire-silver(低抵抗)・magnet-ferrite(nonDemagnetizing、D07を
  // 構造的に排除しD02を単独観測する)・gear-titanium・battery-alkaline(D04非該当)+
  // player-adjustable調整(coilTurns:40・magnetDistanceMm:3で高電流、loadTorque=0.02で
  // 近失速状態を維持し電流を持続的に高く保つ)。
  //
  // 実測値(2026-08-10計測、checkpoint5、DT=1/120s、rng固定0.5、d02較正値
  // conductionScale=0.04・dissipationCoefficient=0.5・smokeGaugeThreshold=0.6・
  // coilOverheatGaugeLimit=1、theta初期値=π/4で整流子不感帯を回避):
  //   D02 event発火step=1205(10.04秒)、他モード(D03等)のeventは一切先行しない、
  //   coilHeatGaugeRatio=1(発火時点)、current≈3.9A(sustained)。
  it('D02専用M4型sweep受け入れ条件(3.4節): 高電流構成(motor-only、固定loadTorque)ではD02が電池系終端(D03)より先に発火する(死にモード防止)', () => {
    const { motorConfig } = pvMotorCar(
      { wireId: 'wire-silver', magnetId: 'magnet-ferrite', gearId: 'gear-titanium', batteryId: 'battery-alkaline', brushId: 'brush-carbon' },
      { coilTurns: 40, magnetDistanceMm: 3 },
    );
    const destructionConfig = g5NonLipoDestructionConfig('magnet-ferrite');
    const snapshot = captureRunSnapshot({
      motorConfig, carConfig: null, destructionConfig,
      runContext: { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null },
      initialMotorState: { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 },
      initialVehicleState: null, track: null, courseLengthM: null, slopeRad: null, seed: 1,
      initialDestructionState: createInitialDestructionState('nonLipo'),
      recipeKey: 'v1|test-motor',
    });
    let accumulator: RunAccumulator = createRunAccumulator(snapshot);
    let motorState: SimState = snapshot.initialMotorState;
    let i = 0;
    const maxSteps = 2000;
    for (; i < maxSteps && accumulator.events.length === 0 && !accumulator.terminalModeCandidates.length; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, DT_G5, () => 0.5, 0.02); // 高い固定loadTorqueで近失速状態を維持し、電流(ひいてはcoilLossW)を持続的に高く保つ
      motorState = result.physicsState;
      accumulator = result.accumulator;
    }

    // 空虚な一致を禁止する: 上限打ち切りではなく実際にD02が発火したことを先に確認する。
    expect(accumulator.events.map((e) => e.mode), `finalStep=${i}`).toEqual(['D02']);
    expect(accumulator.destructionState.modes.D02.coilHeatGaugeRatio).toBe(1);
    // D03(battery-alkaline、電池系終端)が一切先行・混在していないことを直接確認する。
    expect(accumulator.destructionState.battery.profile === 'nonLipo' && accumulator.destructionState.battery.d03.triggered).toBe(false);
    // 設計較正時点(2026-08-10、checkpoint5)の実測値を数値回帰として固定する。
    expect(i, 'D02発火step(回帰)').toBe(1206);
    expect(i * DT_G5, 'D02発火秒数(回帰)').toBeCloseTo(10.05, 3);
    expect(motorState.current, '発火時点の実電流A(回帰)').toBeGreaterThan(3.8);
  });

  describe('M4到達可能性3条件(D04、計画§3.3、production-valid fixture、2026-08-09再計測)', () => {
    // P3是正: 恣意的な100km/30秒トラックではなく、実在コース(src/data/tracks.tsの
    // 'energy-run'、15m・hasEnergyBudget:true)を自然完走させる。この15mコースは
    // 「省エネロングラン」として既にhasEnergyBudget:trueで設計されており、
    // spec.md P4-0(0.3節Q13-2引用元)が想定する「20〜30秒コース」の設計意図とも
    // 整合する時間スケールになる(実測32.07秒、後述)。
    //
    // 実測値(2026-08-09計測、production-valid構成〈wire-copper-standard・magnet-neodymium・
    // gear-pom・battery-lithium-polymer、既定player値〉、本テストと同一の物理式・
    // DT=1/120s・rng=()=>0.5固定)。必須追補3是正(appendix全文化)により写像後config全文を明記:
    //   motorConfig = {coilTurns:80, slitWidthMm:1.5, sandingQuality:0.9, brushPressure:0.3,
    //     magnetStrength:0.9, magnetDistanceMm:10, batteryVoltage:3, axisOffsetMm:0,
    //     wireGaugeMm:0.4, parallelStrands:1, varnished:true, wireResistivityRatio:1,
    //     wireDensityRatio:1, batteryInternalResistanceRatio:0.15, batteryCapacityRatio:1.3}
    //   carConfig = {massG≈150.6126, gearEfficiency:0.8, gearRatio:4, wheelDiameterMm:30,
    //     tireGrip:0.7, axleFriction:0, wheelAlignmentMm:0, centerOfMassHeightMm:20,
    //     motorMountOffsetMm:0}
    //   player入力: なし(全フィールドが既定値または素材写像値)。wireResistivityRatio/
    //   wireDensityRatioが1なのはwire-copper-standardがcanonical anchor(比率1.0)であるため。
    //   finalStatus='finished'、finalStep=3848(32.0667秒)、maxEnergyUsedRatio≈0.8073、
    //   D04最終stage='none'(burning未到達)。
    it('条件1: 通常負荷構成(実在コース"energy-run"を自然完走)ではburningへ到達しない', () => {
      const track = TRACK_BY_ID.get('energy-run');
      if (!track) throw new Error('テスト前提が崩れています: energy-runがTRACK_BY_IDに存在しません');
      const { motorConfig, carConfig } = pvMotorCar({ wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-lithium-polymer', brushId: 'brush-carbon' });
      const destructionConfig = g5LipoDestructionConfig();

      let vehicleState = createInitialVehicleState(motorConfig, carConfig);
      let destructionState = createInitialDestructionState('lipo');
      const runContext = g5VehicleRunContext();
      let maxEnergyUsedRatio = 0;
      let i = 0;
      const maxSteps = 120 * 120; // 上限120秒(実際は32秒程度で完走する見込み、無限ループ防止のみ)
      for (; i < maxSteps && (vehicleState.status === 'running' || vehicleState.status === 'ready'); i++) {
        // overheated保留規則(Q13-1、14.2節)のpre/post契約を一貫して適用する(通常運用では
        // D04 stageが'none'のまま推移するため実質no-opだが、全harnessで同一契約を使う)。
        const prevVehicleState = normalizeOverheatedStatusForD04Hold(vehicleState, destructionState);
        const effectiveConfig = composeEffectiveMotorConfig(motorConfig, destructionState, destructionConfig);
        const rawNextVehicleState = stepTrackRun(effectiveConfig, carConfig, track, prevVehicleState, DT_G5, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: NO_NOISE_RNG_G5 });
        const frame = buildVehicleFrameInput(effectiveConfig, carConfig, prevVehicleState, rawNextVehicleState);
        const result = advanceDestructionState(destructionState, frame, destructionConfig, runContext, DT_G5);
        destructionState = result.state;
        vehicleState = normalizeOverheatedStatusForD04Hold(rawNextVehicleState, destructionState);
        if (frame.energyUsedRatio !== undefined) maxEnergyUsedRatio = Math.max(maxEnergyUsedRatio, frame.energyUsedRatio);
      }

      // 空虚な一致を禁止する: 上限に達して打ち切られたのではなく、実際にコースが完走した
      // ことを先に確認する。
      expect(vehicleState.status, `finalStep=${i}, maxEnergyUsedRatio=${maxEnergyUsedRatio}`).toBe('finished');
      expect(destructionState.battery.profile === 'lipo' && destructionState.battery.d04.stage).toBe('none');
      // 設計較正時点(2026-08-09)の実測値を数値回帰として固定する。
      expect(i, '完走step(回帰)').toBe(3848);
      expect(i * DT_G5, '完走秒数(回帰)').toBeCloseTo(32.0667, 3);
      expect(maxEnergyUsedRatio, '完走時点のmaxEnergyUsedRatio(回帰)').toBeCloseTo(0.8073, 3);
    });

    // P1是正: magnetStrength/batteryCapacityRatioを直接上書きするのではなく、production-valid
    // 選択(wire-silver・magnet-neodymium〈写像実測上限0.9〉・gear-titanium・
    // battery-lithium-polymer〈写像固定値ratio=0.15・capacity=1.3〉)+player-adjustable値
    // (coilTurns・magnetDistanceMm・brushPressure・gearRatio・tireGrip)の調整だけで
    // 過放電経路を到達させる。
    //
    // 実測値(2026-08-09計測、hasEnergyBudget:true・120秒上限、上記選択+
    // coilTurns:20・magnetDistanceMm:5・brushPressure:0.5・gearRatio:8・tireGrip:0.9)。
    // Q13-1裁定(overheated保留規則、stageDurations={swellingS:0.35,smokingS:0.25}確定)後の
    // 再計測(2026-08-09、人間再承認後):
    //   motorConfig={coilTurns:20,slitWidthMm:1.5,sandingQuality:0.9,brushPressure:0.5,
    //     magnetStrength:0.9,magnetDistanceMm:5,batteryVoltage:3,axisOffsetMm:0,
    //     wireGaugeMm:0.4,parallelStrands:1,varnished:true,
    //     wireResistivityRatio≈0.9464,wireDensityRatio≈1.1708,
    //     batteryInternalResistanceRatio:0.15,batteryCapacityRatio:1.3}
    //   carConfig={massG≈150.70,gearEfficiency≈0.72,gearRatio:8,wheelDiameterMm:30,
    //     tireGrip:0.9,axleFriction:0,wheelAlignmentMm:0,centerOfMassHeightMm:20,
    //     motorMountOffsetMm:0}
    //   swellingAtStep=897(entry timing自体はQ13-1裁定の対象外のため不変)、
    //   smokingAtStep=939(旧stageDurations=0.05秒時代の903から、新0.35秒により変化)、
    //   burningAtStep=969(8.075秒)=finalStep(旧909から、新smokingS=0.25秒により変化)、
    //   burning時energyUsedRatio(=maxEnergyUsedRatio)≈0.9677(段階が長くなった分、
    //   burning到達までの走行距離が伸び、電力消費が進んだ結果。旧≈0.9127から変化)、
    //   finalStatus='running'(energyExhausted未到達)、finalD04Stage='burning'。
    //   burningInitiatingCause={shortCircuitDurationS:0, overDischargeRatio≈0.9003}(G-R1後の再基準化値)
    //   (overDischargeRatioはswelling突入時に一度だけ凍結される値〈initiatingCauseLog〉のため、
    //   段階時間の変更による影響を受けず不変。短絡は一切発生させていない構成のため、
    //   開始原因が過放電であり短絡由来でないことを直接確認する)。shortThresholdAtStep/
    //   runawayAtStepはこの構成では短絡自体が発生しないためnullのまま。
    it('条件2: 高負荷LiPo構成(production-valid素材+player-adjustable調整)ではunsafeDischargeStartRatio到達後、energy-budget切れより先にburningへ到達できる(開始原因はoverDischargeであり短絡由来ではない)', () => {
      const { motorConfig, carConfig } = pvMotorCar(
        { wireId: 'wire-silver', magnetId: 'magnet-neodymium', gearId: 'gear-titanium', batteryId: 'battery-lithium-polymer', brushId: 'brush-carbon' },
        { coilTurns: 20, magnetDistanceMm: 5, brushPressure: 0.5 },
        { gearRatio: 8, tireGrip: 0.9 },
      );
      const track = g5LongTrack(true);
      const destructionConfig = g5LipoDestructionConfig();
      const result = sweepM4Reachability(motorConfig, carConfig, track, destructionConfig, 120 * 120);

      expect(result.reachedBurning, `finalD04Stage=${result.finalD04Stage}, finalStatus=${result.finalStatus}`).toBe(true);
      expect(result.finalStatus, 'burning到達時点でenergyExhausted(status!==running)にまだ到達していないこと').toBe('running');
      expect(result.unsafeDischargeEnteredAtStep).not.toBeNull();
      expect(result.swellingAtStep).not.toBeNull();
      expect(result.smokingAtStep).not.toBeNull();
      expect(result.burningAtStep).not.toBeNull();
      expect(result.burningEnergyUsedRatio).not.toBeNull();
      expect(result.burningEnergyUsedRatio!).toBeGreaterThanOrEqual(0.9); // unsafeDischargeStartRatio(0.9)到達後であること
      expect(result.burningEnergyUsedRatio!).toBeLessThan(1.0); // energyExhausted(比率1.0)未到達であること
      // 開始原因がoverDischargeであり短絡由来ではないことを直接確認する(短絡を一切発生させていない構成)
      expect(result.burningInitiatingCause).toEqual({ shortCircuitDurationS: 0, overDischargeRatio: expect.any(Number) });
      expect(result.burningInitiatingCause!.overDischargeRatio).toBeGreaterThanOrEqual(0.9);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加、2026-08-19人間再承認)による再基準化。承認された意味assertは不変。
      // 旧値0.9011 → 0.9003181256670577(P3-2数値回帰3件の再基準化、2026-08-19人間承認)。
      expect(result.burningInitiatingCause!.overDischargeRatio, 'overDischargeRatio(回帰、burning時energyUsedRatioとは別値)').toBeCloseTo(0.9003181256670577, 3);
      // 設計較正時点(2026-08-09)の実測値を数値回帰として固定する。
      expect(motorConfig.magnetStrength, 'neodymiumのmagnetStrength(写像実測上限)').toBe(0.9);
      expect(motorConfig.batteryCapacityRatio, 'LiPoのbatteryCapacityRatio(写像固定値)').toBe(1.3);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧897 → 912(質量増で加速が鈍り+15step遅延)。
      expect(result.swellingAtStep, 'swelling到達step(回帰)').toBe(912);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧939 → 954(同+15step。swellingとの間隔42stepは不変)。
      expect(result.smokingAtStep, 'smoking到達step(回帰、Q13-1裁定のstageDurations=0.35/0.25秒により旧903から更新)').toBe(954);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧969 → 984(同+15step。smokingとの間隔30stepは不変)。
      expect(result.burningAtStep, 'burning到達step(回帰、同上により旧909から更新)').toBe(984);
      // 必須追補3是正(2026-08-09、appendix全文化): finalStep/maxEnergyUsedRatio/finalD04Stage
      // /shortThresholdAtStep/runawayAtStepも省略せず数値回帰として固定する。この構成は
      // 短絡を一切発生させていないため、shortThresholdAtStep/runawayAtStepはnullのままで
      // 正しい(burningInitiatingCauseがshortCircuitDurationS:0であることと整合する)。
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧969 → 984(burning到達stepと一致する契約は不変)。
      expect(result.finalStep, 'finalStep(回帰、burning到達stepと一致、Q13-1裁定のstageDurations変更により旧909から更新)').toBe(984);
      expect(result.finalD04Stage, 'finalD04Stage(回帰)').toBe('burning');
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧0.9677 → 0.9778579632118439(質量増で消費が増加。意味assertの<1.0は維持)。
      expect(result.maxEnergyUsedRatio, 'maxEnergyUsedRatio(回帰、Q13-1裁定のstageDurations変更により旧0.9127から更新)').toBeCloseTo(0.9778579632118439, 3);
      expect(result.shortThresholdAtStep, '短絡を発生させていないためnull').toBeNull();
      expect(result.runawayAtStep, '短絡を発生させていないためnull').toBeNull();
    });

    // held-shortはmagnetStrength等に依存しない(motorPhysics.tsのshorted分岐でcurrentA=0に
    // なるため、電池発熱は内部抵抗ratioのみで決まる)。production-valid選択は
    // wire-copper-standard・magnet-neodymium・gear-pom・battery-lithium-polymer
    // (canonical、player-adjustable上書きはslitWidthMm:0のみ)。
    //
    // 条件(3)の再定式化(正式Fable P3-2ゲート5 Q13-1裁定、2026-08-09、人間再承認済み)。
    // 「overheatedより先にburningへ到達できること」という旧来の競争条件は、overheated保留
    // 規則によりD04進行中はoverheated自体が成立しなくなったため消滅した。新条件は正例・
    // 負例の対に置き換える(docs/phase3-p3-2-plan.md 14.1節): 正例はheld-short構成で
    // swelling→smoking→burningがstageDurationsどおり進行してdestructionTerminalで終端し、
    // overheatedが独立した終端理由として発火しないこと(=保留が実際に発動したことを
    // firstHeldOverheatedAtStepで確認する)。負例は次のit(非リポheld-short)で固定する。
    //
    // 実測値(2026-08-09計測、held-short〈slitWidthMm:0〉、hasEnergyBudget:false、
    // stageDurations={swellingS:0.35,smokingS:0.25}確定後、200step上限)。写像後config全文:
    //   motorConfig = {coilTurns:80, slitWidthMm:0, sandingQuality:0.9, brushPressure:0.3,
    //     magnetStrength:0.9, magnetDistanceMm:10, batteryVoltage:3, axisOffsetMm:0,
    //     wireGaugeMm:0.4, parallelStrands:1, varnished:true, wireResistivityRatio:1,
    //     wireDensityRatio:1, batteryInternalResistanceRatio:0.15, batteryCapacityRatio:1.3}
    //   carConfig = {massG≈150.6126, gearEfficiency:0.8, gearRatio:4, wheelDiameterMm:30,
    //     tireGrip:0.7, axleFriction:0, wheelAlignmentMm:0, centerOfMassHeightMm:20,
    //     motorMountOffsetMm:0}(条件1と同じ、slitWidthMmのみplayer入力で0へ変更)
    //   swellingAtStep=7、smokingAtStep=49(7+swellingS0.35秒=42step後)、
    //   burningAtStep=79(49+smokingS0.25秒=30step後)=finalStep、
    //   shortThresholdAtStep=5、runawayAtStep=7(entry timing自体は不変)、
    //   maxEnergyUsedRatio=0(hasEnergyBudget:falseのため常に0)、
    //   burningInitiatingCause={shortCircuitDurationS≈0.0667, overDischargeRatio:null}、
    //   burning到達step(=79)でのfinalStatusは'overheated'(同一step境界ケース(b)——burning
    //   到達時はoverheated保留を解除しdestructionTerminalを優先するため、この時点のraw
    //   statusがoverheatedであること自体は正しい。旧テストの「finalStatus==='running'」という
    //   期待は誤りだった)。firstHeldOverheatedAtStep=21(保留が実際に発動した最初のstep、
    //   swelling継続中にoverheatedへ到達しうる状況を保留規則が正しく吸収したことの証跡)。
    it('条件3(正例、再定式化): 短絡構成(production-valid、held-short)ではswelling→smoking→burningがstageDurationsどおり進行しdestructionTerminalで終端する(overheatedは独立した終端理由として発火しない)', () => {
      const { motorConfig, carConfig } = pvMotorCar(
        { wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-lithium-polymer', brushId: 'brush-carbon' },
        { slitWidthMm: 0 },
      );
      const track = g5LongTrack(false);
      const destructionConfig = g5LipoDestructionConfig();
      const result = sweepM4Reachability(motorConfig, carConfig, track, destructionConfig, 200);

      expect(result.reachedBurning, `finalD04Stage=${result.finalD04Stage}, finalStatus=${result.finalStatus}`).toBe(true);
      // 空虚な一致を禁止する: 保留規則が実際に発動した(=この構成では保留がなければ
      // overheatedがswelling/smoking進行中に成立しburningへ到達できなかった)ことを先に確認する。
      expect(result.firstHeldOverheatedAtStep, '保留規則が実際に発動したstep').not.toBeNull();
      // 設計較正時点(2026-08-09、stageDurations確定後)の実測値を数値回帰として固定する。
      expect(result.swellingAtStep, 'swelling到達step(回帰、entry timing不変)').toBe(7);
      expect(result.smokingAtStep, 'smoking到達step(回帰、swellingS=0.35秒により7+42=49)').toBe(49);
      expect(result.burningAtStep, 'burning到達step(回帰、smokingS=0.25秒により49+30=79)').toBe(79);
      expect(result.finalStep, 'finalStep(回帰、burning到達stepと一致)').toBe(79);
      expect(result.finalD04Stage, 'finalD04Stage(回帰)').toBe('burning');
      expect(result.maxEnergyUsedRatio, 'hasEnergyBudget:falseのため常に0(回帰)').toBe(0);
      expect(result.shortThresholdAtStep, '短絡閾値到達step(回帰、entry timing不変)').toBe(5);
      expect(result.runawayAtStep, 'runawayHeatThreshold到達step(回帰、entry timing不変)').toBe(7);
      expect(result.burningInitiatingCause!.shortCircuitDurationS, 'burning到達時点の短絡持続秒数(回帰)').toBeCloseTo(0.0667, 3);
      expect(result.burningInitiatingCause!.overDischargeRatio, '短絡由来のためoverDischargeRatioはnull').toBeNull();
      expect(result.firstHeldOverheatedAtStep, '保留発動step(回帰)').toBe(21);
      // 同一step境界ケース(b): burning到達stepではoverheated保留を解除しdestructionTerminalを
      // 優先する。この時点のraw statusが'overheated'であること自体は正しい契約である。
      expect(result.finalStatus, 'burning到達stepの生status(保留解除後、overheatedで正しい)').toBe('overheated');
      // 必須是正P5(Suu_mot3レビュー、2026-08-09): 有界性の物理的な証明起点はswellingAtStep
      // (D04段階タイマーが実際に動き出したstep)であり、firstHeldOverheatedAtStep(保留が
      // たまたま発動したstep)ではない。swellingAtStep→burningAtStepがswellingS+smokingS
      // (0.6秒=72step)以内であることを直接assertする(現実測は7→79=ちょうど72step)。
      expect(result.burningAtStep! - result.swellingAtStep!, '有界性(14.1節): swelling突入からburning終端までがswellingS+smokingS以内').toBeLessThanOrEqual(72);
      expect(result.burningAtStep! - result.swellingAtStep!, '有界性の実測値(回帰、ちょうど段階合計と一致)').toBe(72);
      // 参考: firstHeldOverheatedAtStepもswellingAtStep〜burningAtStepの範囲内で発生していること
      // (保留が段階進行の"外側"で無関係に発動したのではないことの確認)。
      expect(result.firstHeldOverheatedAtStep!).toBeGreaterThanOrEqual(result.swellingAtStep!);
      expect(result.firstHeldOverheatedAtStep!).toBeLessThan(result.burningAtStep!);
    });

    // 必須是正P3(Suu_mot3レビュー、2026-08-09): 「burning eventを見つけただけ」ではproduction
    // 契約上のdestructionTerminal成立を意味しない。実productionの経路(classifyTerminalModes→
    // terminalModeCandidates蓄積→finalizeDestructionRun)を実関数でそのまま辿り、本物の
    // RunOutcomeを得て検証する(runVehicleToRunOutcome、上記sweepM4Reachabilityとは独立実装の
    // 別harnessで、同一入力から同一の段階到達stepが得られることも交差確認する)。
    it('条件3(正例、terminal分類証跡): burning eventはclassifyTerminalModesで実際にD04をterminal candidateへ分類し、finalizeDestructionRunがendReason=destructionTerminalのRunOutcomeを返す', () => {
      const { motorConfig, carConfig } = pvMotorCar(
        { wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-lithium-polymer', brushId: 'brush-carbon' },
        { slitWidthMm: 0 },
      );
      const track = g5LongTrack(false);
      const destructionConfig = g5LipoDestructionConfig();
      const { outcome, finalStep, swellingAtStep, smokingAtStep, burningAtStep, firstHeldOverheatedAtStep } =
        runVehicleToRunOutcome(motorConfig, carConfig, track, destructionConfig, 'lipo', 200);

      // 空虚な一致を禁止する: 独立実装のharnessでも保留が実際に発動したことを先に確認する。
      expect(firstHeldOverheatedAtStep, '保留規則が実際に発動したstep(独立harnessでの再確認)').not.toBeNull();
      expect(outcome.endReason, 'finalizeDestructionRunが実際にdestructionTerminalを返すこと').toBe('destructionTerminal');
      if (outcome.endReason === 'destructionTerminal') {
        // classifyTerminalModesの実出力がD04を含み、finalizeDestructionRunの非空タプル契約
        // (terminalModeCandidatesが1件以上ある場合のみ呼び出し可能という型上の保証)を
        // 実際に満たしたうえでD04が最初のterminalModeとして採用されていることを確認する。
        expect(outcome.terminalModes, 'terminalModesにD04が含まれること(classifyTerminalModesの実出力)').toContain('D04');
      }
      // 交差確認: sweepM4Reachability(別実装のharness)と同一の段階到達stepが得られること。
      expect(swellingAtStep, 'sweepM4Reachabilityと同一の値(交差確認)').toBe(7);
      expect(smokingAtStep, 'sweepM4Reachabilityと同一の値(交差確認)').toBe(49);
      expect(burningAtStep, 'sweepM4Reachabilityと同一の値(交差確認)').toBe(79);
      expect(finalStep, 'sweepM4Reachabilityと同一の値(交差確認)').toBe(79);
    });

    // 条件(3)の負例(再定式化、Q13-1裁定): 非リポ(D03経路)のheld-shortでは保留が発動せず、
    // D03の既存同一frame優先規則が不変であることを確認する(同一step境界ケース(c))。
    it('条件3(負例、再定式化): 非リポ(D03経路)のheld-shortでは保留規則が発動せず、既存の終端挙動(overheated到達)が不変である', () => {
      const { motorConfig, carConfig } = pvMotorCar(
        { wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-alkaline', brushId: 'brush-carbon' },
        { slitWidthMm: 0 },
      );
      const track = g5LongTrack(false);
      const destructionConfig = g5NonLipoDestructionConfig();
      let vehicleState = createInitialVehicleState(motorConfig, carConfig);
      let destructionState = createInitialDestructionState('nonLipo');
      const runContext = g5VehicleRunContext();
      let firstHeldOverheatedAtStep: number | null = null;
      let overheatedAtStep: number | null = null;
      for (let i = 0; i < 200 && overheatedAtStep === null; i++) {
        const prevVehicleState = normalizeOverheatedStatusForD04Hold(vehicleState, destructionState);
        const effectiveConfig = composeEffectiveMotorConfig(motorConfig, destructionState, destructionConfig);
        const rawNextVehicleState = stepTrackRun(effectiveConfig, carConfig, track, prevVehicleState, DT_G5, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: NO_NOISE_RNG_G5 });
        const frame = buildVehicleFrameInput(effectiveConfig, carConfig, prevVehicleState, rawNextVehicleState);
        const result = advanceDestructionState(destructionState, frame, destructionConfig, runContext, DT_G5);
        destructionState = result.state;
        vehicleState = normalizeOverheatedStatusForD04Hold(rawNextVehicleState, destructionState);
        if (firstHeldOverheatedAtStep === null && rawNextVehicleState.status === 'overheated' && vehicleState.status === 'running') {
          firstHeldOverheatedAtStep = i;
        }
        if (vehicleState.status === 'overheated' && overheatedAtStep === null) overheatedAtStep = i;
      }
      // 空虚な一致を禁止する: overheated自体には実際に到達したことを先に確認する。
      expect(overheatedAtStep, '既存のD03/overheated終端挙動が実際に到達すること').not.toBeNull();
      // 保留規則はlipo専用(destructionState.battery.profile==='lipo'を要求する)ため、
      // nonLipoでは絶対に発動しない(同一step境界ケース(c))。
      expect(firstHeldOverheatedAtStep, 'nonLipoでは保留規則が発動しないこと').toBeNull();
      expect(destructionState.battery.profile).toBe('nonLipo');
    });

    // 必須是正P4(Suu_mot3レビュー、2026-08-09): 上記負例はoverheated到達と保留非発動のみを
    // 確認しており、正式Fable裁定が要求した「D03の同一フレーム優先規則」(同一step境界
    // ケース(c)の核心)を検証していなかった——旧negative testのg5NonLipoDestructionConfig()は
    // shortCircuitDurationLimitS:999(D07 sweep用に意図的にD03を無効化した値)を使っており、
    // D03が実際には一度も発火しないまま「保留が発動しない」ことだけを確認していた。
    //
    // **schema-valid test-only境界fixture**(production-valid通常sweepとは用途を分離する):
    // shortCircuitDurationLimitSを意図的に短く設定し(0.05秒=6step)、D03の発火条件
    // (shortCircuitDurationS>=limit かつ batteryHeat>=BATTERY_HEAT_LIMIT)のうち時間条件を
    // 熱条件より十分早く満たしておく。これにより、held-short構成でbatteryHeatが
    // BATTERY_HEAT_LIMITへ到達する(=vehicle status生出力がoverheatedになる)のと**同一step**で
    // D03の熱条件も初めて満たされ、D03 eventとraw overheated statusが同一frameで競合する
    // 境界状況を実際に作り出す。この`shortCircuitDurationLimitS:0.05`はD03の正式較正値
    // (3.0秒、正式Fable P3-1-Q3確定)を書き換えるものではなく、この境界テスト専用の
    // schema-valid test-only値である(production値は無変更)。
    it('境界fixture(P4是正、schema-valid test-only): 同一step内でraw vehicle status=overheatedとD03 eventが競合する場合、classifyTerminalModesがD03を返しdestructionTerminalが優先される', () => {
      const { motorConfig, carConfig } = pvMotorCar(
        { wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-alkaline', brushId: 'brush-carbon' },
        { slitWidthMm: 0 },
      );
      const track = g5LongTrack(false);
      const boundaryDestructionConfig: DestructionConfig = {
        ...g5NonLipoDestructionConfig(),
        battery: { profile: 'nonLipo', shortCircuitDurationLimitS: 0.05 }, // schema-valid test-only境界値(D03正式較正値3.0秒とは無関係)
      };
      const { outcome, rawVehicleStatusAtOutcomeStep } = runVehicleToRunOutcome(motorConfig, carConfig, track, boundaryDestructionConfig, 'nonLipo', 200);

      // 空虚な一致を禁止する: D03が実際に発火し(destructionTerminal)、かつその同一stepで
      // raw vehicle statusが実際にoverheatedだった(=真に競合する境界状況を作れていた)ことを
      // 両方確認する。前者だけでは「D03が先に発火しただけ」の可能性を排除できない。
      expect(outcome.endReason, 'D03がdestructionTerminalとして確定すること').toBe('destructionTerminal');
      if (outcome.endReason === 'destructionTerminal') {
        expect(outcome.terminalModes, 'terminalModesにD03が含まれること(classifyTerminalModesの実出力)').toContain('D03');
      }
      expect(rawVehicleStatusAtOutcomeStep, '同一stepでraw vehicle statusが実際にoverheatedだったこと(真の同一frame競合の証跡)').toBe('overheated');
    });

    // 保留込み決定論・リプレイ等価テスト(Q13-1、14.2節)。同一入力から独立に2回sweepし、
    // 診断値全体(保留発動step・全stage到達step・burningInitiatingCause等)が完全一致することを
    // 確認する。normalizeOverheatedStatusForD04Holdは純関数、NO_NOISE_RNG_G5は状態を持たない
    // 定数関数のため既存契約上は自明に決定論的だが、将来の変更に対する回帰の網として固定する。
    it('保留込み決定論: 条件3(正例)の構成を独立に2回sweepしても診断値全体が完全一致する', () => {
      const { motorConfig, carConfig } = pvMotorCar(
        { wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-lithium-polymer', brushId: 'brush-carbon' },
        { slitWidthMm: 0 },
      );
      const track = g5LongTrack(false);
      const destructionConfig = g5LipoDestructionConfig();
      const runA = sweepM4Reachability(motorConfig, carConfig, track, destructionConfig, 200);
      const runB = sweepM4Reachability(motorConfig, carConfig, track, destructionConfig, 200);

      // 空虚な一致を禁止する: 保留規則が実際に発動した非自明な run であることを先に確認する。
      expect(runA.firstHeldOverheatedAtStep).not.toBeNull();
      expect(runA.reachedBurning).toBe(true);
      expect(runB).toEqual(runA);
    });
  });

  // Q13-2裁定(正式Fable P3-2ゲート5、2026-08-09、docs/phase3-p3-2-plan.md 14.3節)。
  // NORMAL_OPERATION基準構成(M4条件1と同一: wire-copper-standard・magnet-neodymium・
  // gear-pom・battery-lithium-polymer、player値すべて既定、攻め入力なし)で、
  // src/data/tracks.tsの実在プレイアブル全コースを自然完走させ、第1条件(finished・
  // 破壊イベントゼロ・D04 stage none・D07 droop/irreversibleなし。予算有効コースは
  // maxEnergyUsedRatio<=0.85)を満たすことを確認する。
  // 必須是正P2(Suu_mot3レビュー、2026-08-09): Q13-2の正式定義(14.3節)は「対象電池」を
  // 変数としているが、初回実装はbattery-lithium-polymer(lipo)1種に縮約していた。
  // 現行全電池ID(alkaline/NiMH/LiPo)×実在全5コードのtable-drivenへ拡張する。batteryIdから
  // 正しいprofile('lipo'|'nonLipo')・DestructionConfig(nonLipoはmapD03DestructionConfig経由の
  // 実較正値、lipoはmapD04BatteryDestructionConfig)・初期destructionStateを構築する。
  describe('Q13-2通常運用確認(NORMAL_OPERATION基準構成、実在プレイアブル全コース×全電池、計画14.3節)', () => {
    function g5DestructionConfigForBattery(batteryId: 'battery-alkaline' | 'battery-nickel-metal-hydride' | 'battery-lithium-polymer'): DestructionConfig {
      const battery: DestructionConfig['battery'] = batteryId === 'battery-lithium-polymer'
        ? mapD04BatteryDestructionConfig(batteryId)
        : mapD03DestructionConfig(batteryId);
      return {
        battery,
        d01: { decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5, coilDeformOmegaRadS: COIL_DEFORM_OMEGA },
        d02: { smokeGaugeThreshold: 0.6, coilOverheatGaugeLimit: 1, conductionScale: 0.04, dissipationCoefficient: 0.5, smokeResistanceMultiplier: 1.2 },
        d04: { bodyScorchDeltaFraction: mapBodyScorchDeltaFraction('body-ps-cowl'), magnetScorchDeltaFraction: mapMagnetScorchDeltaFraction('magnet-neodymium') },
        d05: {
          brushSparkDurationLimitS: 0.15,
          brushSparkCurrentThresholdA: 3,
          brushWearRateRatio: 1,
          highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 8, highCurrentPenaltyMultiplier: 1.5 },
          wearPerAmpSecond: 0.001,
          recoveryFrames: 6,
          recoveryContactResistanceMultiplier: 1.2,
        },
        d06: { breakage: { kind: 'nonBreakable' }, toothFatigueExposureNmS: 0.5 },
        d07: mapD07DestructionConfig('magnet-neodymium'),
        d09: {
        thermal: { conductionCoefficient: 0.25, dissipationCoefficient: 0.5 },
        bearingSeizureGaugeLimit: 1,
        metalGearContactAlways: false,
        highLoadHighSpeed: { loadTorqueThresholdNm: 0.2, rpmThreshold: 3000 },
        gearSeizureDeltaFraction: 0.15,
        bearingSeizureDeltaFraction: 0.2,
      },
      };
    }

    const BATTERY_IDS = ['battery-alkaline', 'battery-nickel-metal-hydride', 'battery-lithium-polymer'] as const;
    const combinations = TRACKS.flatMap((track) => BATTERY_IDS.map((batteryId) => ({ trackId: track.id, batteryId })));

    it.each(combinations)('コース"$trackId"×電池"$batteryId"をNORMAL_OPERATION基準構成で自然完走し、破壊イベントゼロ・D04 stage none(該当時)・D07非発火であること', ({ trackId, batteryId }) => {
      const track = TRACK_BY_ID.get(trackId);
      if (!track) throw new Error(`テスト前提が崩れています: ${trackId}がTRACK_BY_IDに存在しません`);
      const profile = mapBatteryDestructionProfile(batteryId);
      const { motorConfig, carConfig } = pvMotorCar({ wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId, brushId: 'brush-carbon' });
      const destructionConfig = g5DestructionConfigForBattery(batteryId);

      let vehicleState = createInitialVehicleState(motorConfig, carConfig);
      let destructionState = createInitialDestructionState(profile);
      const runContext = g5VehicleRunContext();
      const allEvents: unknown[] = [];
      let maxEnergyUsedRatio = 0;
      let i = 0;
      const maxSteps = 120 * 120; // 上限120秒(無限ループ防止のみ、実際は数十秒で完走見込み)
      for (; i < maxSteps && (vehicleState.status === 'running' || vehicleState.status === 'ready'); i++) {
        const prevVehicleState = normalizeOverheatedStatusForD04Hold(vehicleState, destructionState);
        const effectiveConfig = composeEffectiveMotorConfig(motorConfig, destructionState, destructionConfig);
        const rawNextVehicleState = stepTrackRun(effectiveConfig, carConfig, track, prevVehicleState, DT_G5, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: NO_NOISE_RNG_G5 });
        const frame = buildVehicleFrameInput(effectiveConfig, carConfig, prevVehicleState, rawNextVehicleState);
        const result = advanceDestructionState(destructionState, frame, destructionConfig, runContext, DT_G5);
        destructionState = result.state;
        vehicleState = normalizeOverheatedStatusForD04Hold(rawNextVehicleState, destructionState);
        allEvents.push(...result.events);
        if (frame.energyUsedRatio !== undefined) maxEnergyUsedRatio = Math.max(maxEnergyUsedRatio, frame.energyUsedRatio);
      }

      // 空虚な一致を禁止する: 上限打ち切りではなく実際に完走したことを先に確認する。1件でも
      // 不適合ならここでSuu_mot3裁定どおり閾値を弱めず停止する(実測全文は完了報告へ記載)。
      expect(vehicleState.status, `trackId=${trackId}, batteryId=${batteryId}, finalStep=${i}`).toBe('finished');
      expect(allEvents, `破壊イベントゼロ(通常運用では一切発火しないこと、trackId=${trackId}, batteryId=${batteryId})`).toEqual([]);
      if (destructionState.battery.profile === 'lipo') {
        expect(destructionState.battery.d04.stage, `D04 stage none、trackId=${trackId}, batteryId=${batteryId}`).toBe('none');
      }
      expect(destructionState.modes.D07.reversibleDroopActive, `D07 droop非発火、trackId=${trackId}, batteryId=${batteryId}`).toBe(false);
      expect(destructionState.modes.D07.irreversibleTriggered, `D07 irreversible非発火、trackId=${trackId}, batteryId=${batteryId}`).toBe(false);
      // 付帯条件1(正式Fable指示、計画v12 §13.1.2較正sweep回収条件): D01/D02/D05もNORMAL_OPERATION
      // で一切進行しないことを直接確認する(P3-3新モード込みの再実測、checkpoint5)。
      expect(destructionState.modes.D01.triggered, `D01非発火、trackId=${trackId}, batteryId=${batteryId}`).toBe(false);
      expect(destructionState.modes.D02.smokingStarted, `D02発煙未到達、trackId=${trackId}, batteryId=${batteryId}, maxRatio=${destructionState.modes.D02.coilHeatGaugeRatio}`).toBe(false);
      expect(destructionState.modes.D05.episodeCount, `D05 episode不成立、trackId=${trackId}, batteryId=${batteryId}`).toBe(0);
      expect(destructionState.modes.D05.cumulativeWearDeltaFraction, `D05摩耗蓄積ゼロ(通常整流除外の実証)、trackId=${trackId}, batteryId=${batteryId}`).toBe(0);
      // Q14裁定(正式Fable補足裁定、2026-08-09T07:51、人間再承認不要、docs/phase3-p3-2-plan.md
      // 14.3節・14.8節)により確定: 「受け入れ閾値は、その閾値が防ぐ危険が構造的に存在する
      // 対象にのみ適用する」という一般原則に基づき、予算条件を電池物理型別に分離する。
      // LiPo(D04過放電経路が構造的に存在)は`maxEnergyUsedRatio<=0.85`(unsafeDischargeStartRatio
      // 0.90への設計マージン0.05)を維持する。nonLipo(alkaline/NiMH、BatteryDestructionProgress
      // 判別unionによりD04が型レベルで不存在)は、0.85(D04固有のunsafeDischargeStartRatio由来)
      // を適用する物理的参照先がないため、自然完走(finished、上のexpectで既に確認済み)のみを
      // 要求する。finishedは定義上「枯渇(ratio 1.0)前のゴール到達」と同値であり、
      // ratio<1.0はその言い換えとして併記する(是正史: 必須是正P2で全電池×全コース実測の
      // 結果、energy-run×alkaline≈0.9970・NiMH≈0.9338が旧「全電池へ一律0.85」条件を超過して
      // いたが、これはbatteryCapacityRatio較正差〈alkaline/NiMH=1.0、LiPo=1.3、人間再承認済み〉
      // による物理的に正しい帰結であり、Q14裁定により閾値の弱体化ではなく物理型ごとの
      // 正しい物差し分離として解消された)。
      if (track.hasEnergyBudget) {
        if (destructionState.battery.profile === 'lipo') {
          expect(maxEnergyUsedRatio, `trackId=${trackId}, batteryId=${batteryId}(LiPo)の予算マージン(unsafeDischargeStartRatio 0.90に対し<=0.85)`).toBeLessThanOrEqual(0.85);
        } else {
          expect(maxEnergyUsedRatio, `trackId=${trackId}, batteryId=${batteryId}(nonLipo)はfinished(既に確認済み)と同値のratio<1.0であること`).toBeLessThan(1.0);
        }
      }
    });
  });

  describe('D07 Q11受け入れ条件4つ(計画§2.5・§4、production-valid fixture、2026-08-09再計測)', () => {
    interface D07TailWindowStats {
      windowSteps: number;
      mean: number; min: number; max: number;
      meanFirst: number; meanSecond: number;
      diffRatio: number; // |meanFirst-meanSecond|/meanをdiffRatioとして返す(平衡到達の判定材料)
    }

    interface D07Diagnostics {
      terminatedAtStep: number | null;
      finalStatus: VehicleStatus;
      droopAtStep: number | null;
      irreversibleAtStep: number | null;
      overheatedAtStep: number | null;
      maxGauge: number;
      minGauge: number;
      finalGauge: number;
      tailWindow: D07TailWindowStats | null;
    }

    // 必須是正P1(Suu_mot3レビュー、2026-08-09): Q13-2平衡型の第2条件(14.3節)「時間窓の長さ
    // ではなく平衡到達の実証を要件とする——末尾窓でゲージ増加が止まっていること+平衡値が
    // 閾値未満」を実際に証明するため、tailWindowSteps(>0)を渡すと末尾固定窓のgauge系列を
    // 記録し、前半/後半平均・差を返す。0(既定)なら従来どおり記録しない。
    function sweepD07(
      baseMotorConfig: MotorConfig, carConfig: CarConfig, track: ReturnType<typeof g5LongTrack>,
      destructionConfig: DestructionConfig, maxSteps: number, tailWindowSteps = 0,
    ): D07Diagnostics {
      let vehicleState = createInitialVehicleState(baseMotorConfig, carConfig);
      let destructionState = createInitialDestructionState('nonLipo');
      const runContext = g5VehicleRunContext();
      let droopAtStep: number | null = null, irreversibleAtStep: number | null = null, overheatedAtStep: number | null = null;
      let maxGauge = 0, minGauge = 1;
      const gaugeHistory: number[] = [];

      const buildTailWindow = (): D07TailWindowStats | null => {
        if (tailWindowSteps <= 0) return null;
        const tail = gaugeHistory.slice(-tailWindowSteps);
        const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        const firstHalf = tail.slice(0, Math.floor(tail.length / 2));
        const secondHalf = tail.slice(Math.floor(tail.length / 2));
        const meanAll = mean(tail);
        const meanFirst = mean(firstHalf);
        const meanSecond = mean(secondHalf);
        return {
          windowSteps: tail.length, mean: meanAll, min: Math.min(...tail), max: Math.max(...tail),
          meanFirst, meanSecond, diffRatio: Math.abs(meanFirst - meanSecond) / meanAll,
        };
      };

      for (let i = 0; i < maxSteps; i++) {
        const prevVehicleState = vehicleState;
        const effectiveConfig = composeEffectiveMotorConfig(baseMotorConfig, destructionState, destructionConfig);
        vehicleState = stepTrackRun(effectiveConfig, carConfig, track, prevVehicleState, DT_G5, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: NO_NOISE_RNG_G5 });
        const frame = buildVehicleFrameInput(effectiveConfig, carConfig, prevVehicleState, vehicleState);
        const result = advanceDestructionState(destructionState, frame, destructionConfig, runContext, DT_G5);
        destructionState = result.state;
        const gauge = destructionState.modes.D07.magnetHeatGaugeRatio;
        maxGauge = Math.max(maxGauge, gauge);
        minGauge = Math.min(minGauge, gauge);
        if (tailWindowSteps > 0) gaugeHistory.push(gauge);
        if (destructionState.modes.D07.reversibleDroopActive && droopAtStep === null) droopAtStep = i;
        if (destructionState.modes.D07.irreversibleTriggered && irreversibleAtStep === null) irreversibleAtStep = i;
        if (vehicleState.status === 'overheated' && overheatedAtStep === null) overheatedAtStep = i;
        if (vehicleState.status !== 'running') {
          return { terminatedAtStep: i, finalStatus: vehicleState.status, droopAtStep, irreversibleAtStep, overheatedAtStep, maxGauge, minGauge, finalGauge: gauge, tailWindow: buildTailWindow() };
        }
      }
      return { terminatedAtStep: null, finalStatus: vehicleState.status, droopAtStep, irreversibleAtStep, overheatedAtStep, maxGauge, minGauge, finalGauge: destructionState.modes.D07.magnetHeatGaugeRatio, tailWindow: buildTailWindow() };
    }

    // production-valid選択: wire-copper-standard・magnet-neodymium(demagnetizing磁石を
    // 装備していても通常運用では誤発火しないことを確認する対象)・gear-pom・
    // battery-alkaline(低電流・高内部抵抗の「素の」構成、既定player値)。
    //
    // 実測値(2026-08-09計測、30秒間、DT=1/120s、rng=()=>0.5固定)。必須追補3是正
    // (appendix全文化)により全診断値を明記する(単位: terminated/droop/irreversible/
    // overheatedはstep数、gaugeは0〜1比):
    //   terminatedAtStep=null、finalStatus='running'、droopAtStep=null、
    //   irreversibleAtStep=null、overheatedAtStep=null、
    //   minGauge≈0.00325(是正: 初回記載の「minGauge=0」は誤り。初期値1から単調減少せず
    //   最初のstepで既に低い値へ動くため、真の最小値は0ちょうどにはならない)、
    //   maxGauge≈0.3254(droopThreshold 0.5未到達、G-R1後の再基準化値)、finalGauge≈0.3184。
    //
    // 必須是正P1(Suu_mot3レビュー、2026-08-09、Q13-2平衡型第2条件・14.3節「平衡到達の実証」)。
    // 末尾240step(2秒間、30秒間中の最後)窓のgauge系列全文(2026-08-09計測):
    //   windowSteps=240、mean≈0.3155、min≈0.3111、max≈0.3198、
    //   meanFirst(窓前半平均)≈0.3158、meanSecond(窓後半平均)≈0.3151、
    //   diffRatio(|meanFirst-meanSecond|/mean)≈0.00218(0.218%)。
    //   閾値3%はQ2定常RPM窓平均テスト(P5是正)で用いた基準と同型——コギング/整流リップルに
    //   よる揺らぎ幅(このケースでは実測0.2%程度)を吸収しつつ、系統的な増加トレンド
    //   (仮に発散中であればdiffRatioは有意に大きくなる)は検出できる基準として採用する。
    //   実測diffRatio(0.218%)はこの閾値の1/10未満であり、末尾窓でゲージ増加が明確に
    //   止まっている(平衡に達している)ことを示す。平衡値(窓平均0.3155)はdroopThreshold
    //   (0.5)を十分下回っている。
    it('受け入れ条件1: 通常運用(production-valid、標準構成)ではダレ閾値(reversibleDroopThreshold)に到達しない(30秒間、走行継続)', () => {
      const { motorConfig, carConfig } = pvMotorCar({ wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-alkaline', brushId: 'brush-carbon' });
      const track = g5LongTrack(false);
      const result = sweepD07(motorConfig, carConfig, track, g5NonLipoDestructionConfig(), 120 * 30, 240);

      // P4是正: terminatedAtStep/finalStatusを正確に固定する(30秒間走行継続したことを確認)。
      expect(result.terminatedAtStep, `maxGauge=${result.maxGauge}`).toBeNull();
      expect(result.finalStatus).toBe('running');
      expect(result.droopAtStep).toBeNull();
      expect(result.irreversibleAtStep).toBeNull();
      expect(result.overheatedAtStep, '通常運用ではoverheatedにも到達しないこと').toBeNull();
      expect(result.maxGauge).toBeGreaterThan(0); // 空虚な一致を禁止する: 熱ゲージ自体は実際に動いていること
      expect(result.maxGauge).toBeLessThan(0.5);
      // 設計較正時点(2026-08-09)の実測値を数値回帰として固定する。
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加、2026-08-19人間再承認)による再基準化。承認された意味assertは不変。
      // 旧値0.3271 → 0.3253827969698614。**下がっており**、ダレ閾値0.5未到達のマージンは広がった(安全側)。
      expect(result.maxGauge, 'maxGauge(回帰)').toBeCloseTo(0.3253827969698614, 3);
      expect(result.minGauge, 'minGauge(回帰、0ちょうどではない)').toBeCloseTo(0.00325, 4);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧0.3184 → 0.3124172702168319(熱ゲージ低下=ダレ閾値0.5へのマージン拡大、安全側)。
      expect(result.finalGauge, 'finalGauge(回帰)').toBeCloseTo(0.3124172702168319, 3);
      // 必須是正P1(Suu_mot3レビュー、2026-08-09、Q13-2平衡型第2条件、14.3節): 「時間窓の長さ
      // ではなく平衡到達の実証」——末尾240step(2秒間)窓でゲージ増加トレンドが止まっている
      // (前半/後半平均の差が小さい)ことと、平衡値(窓平均)が閾値(0.5)未満であることを
      // 直接assertする。閾値3%はQ2定常RPM窓平均テスト(P5是正)で使った値と同型の、
      // コギング/整流リップルの揺らぎ幅を吸収しつつ系統的トレンドは検出できる基準。
      expect(result.tailWindow, '空虚な一致を禁止する: 末尾窓が実際に記録されていること').not.toBeNull();
      const tw = result.tailWindow!;
      expect(tw.mean, '平衡値(窓平均)がdroopThreshold(0.5)未満').toBeLessThan(0.5);
      expect(tw.diffRatio, '末尾窓で増加トレンドが止まっていること(前半/後半平均差が全体平均比3%未満)').toBeLessThan(0.03);
      // 実測値(2026-08-09計測)を数値回帰として固定する: 窓長240step(2秒間)、
      // mean/min/max・前半/後半mean・diffRatio全文。
      expect(tw.windowSteps, '窓長(回帰)').toBe(240);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧0.3155 → 0.31229070070068193(熱ゲージ低下に伴う末尾窓統計の低下)。
      expect(tw.mean, '窓平均(回帰)').toBeCloseTo(0.31229070070068193, 3);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧0.3111 → 0.30713260348682186(熱ゲージ低下に伴う末尾窓統計の低下)。
      expect(tw.min, '窓内最小値(回帰)').toBeCloseTo(0.30713260348682186, 3);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧0.3198 → 0.3163036257786291(熱ゲージ低下に伴う末尾窓統計の低下)。
      expect(tw.max, '窓内最大値(回帰)').toBeCloseTo(0.3163036257786291, 3);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧0.3158 → 0.3119871788229032(熱ゲージ低下に伴う末尾窓統計の低下)。
      expect(tw.meanFirst, '窓前半平均(回帰)').toBeCloseTo(0.3119871788229032, 3);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧0.3151 → 0.31259422257846037(熱ゲージ低下に伴う末尾窓統計の低下)。
      expect(tw.meanSecond, '窓後半平均(回帰)').toBeCloseTo(0.31259422257846037, 3);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧0.00218 → 0.0019438419209894219(熱ゲージ低下に伴う末尾窓統計の低下)。
      expect(tw.diffRatio, 'diffRatio(回帰)').toBeCloseTo(0.0019438419209894219, 4);
    });

    // P1是正: magnetStrengthを直接上書きせず、production-valid選択(wire-silver・
    // magnet-neodymium・gear-titanium・battery-alkaline)+player-adjustable調整
    // (coilTurns:20・magnetDistanceMm:5・brushPressure:0.5・gearRatio:8・tireGrip:0.9)で
    // 高負荷を構築する。この構成は最終的にoverheated終端へ到達するが(P1是正で
    // magnetStrength上限が0.9に制約されたため、旧版の「ダレはするが20秒間は無傷」という
    // 前提は成立しなくなった)、条件2が要求するのは「ダレへの到達可能性」のみであり
    // 「その後overheatedしないこと」までは要求しない(計画§2.5原文を再確認、Q11条件(2)は
    // 「高負荷持続でレース内にダレ到達可能」とのみ規定)。
    //
    // 実測値(2026-08-09計測、30秒上限)。必須追補3是正(appendix全文化、正確な
    // irreversibleAtStepを追加——初回版は「最終的に発生」とだけ記載しstep数が欠落していた):
    //   droopAtStep=21(レース内に到達)、irreversibleAtStep=36、overheatedAtStep=147、
    //   terminatedAtStep=147・finalStatus='overheated'、minGauge≈0.0247、maxGauge=1、
    //   finalGauge=1(overheated終端時点でゲージは上限1に到達済み)。
    it('受け入れ条件2: 高負荷持続(production-valid素材+player-adjustable調整)ではレース内にダレ(reversibleDroopActive)へ到達可能', () => {
      const { motorConfig, carConfig } = pvMotorCar(
        { wireId: 'wire-silver', magnetId: 'magnet-neodymium', gearId: 'gear-titanium', batteryId: 'battery-alkaline', brushId: 'brush-carbon' },
        { coilTurns: 20, magnetDistanceMm: 5, brushPressure: 0.5 },
        { gearRatio: 8, tireGrip: 0.9 },
      );
      const track = g5LongTrack(false);
      const result = sweepD07(motorConfig, carConfig, track, g5NonLipoDestructionConfig(), 120 * 30);

      expect(result.droopAtStep, `maxGauge=${result.maxGauge}, finalStatus=${result.finalStatus}`).not.toBeNull();
      expect(result.droopAtStep!).toBeLessThan(120 * 30); // レース内(30秒間)に到達
      // 設計較正時点(2026-08-09)の実測値を数値回帰として固定する(P4是正: 最終的な
      // 終了状態も正確に報告し、「30秒間走行継続」という誤った主張はしない)。
      expect(result.droopAtStep, 'ダレ到達step(回帰)').toBe(21);
      expect(result.irreversibleAtStep, '不可逆到達step(回帰、初回版で欠落していた正確な値)').toBe(36);
      expect(result.overheatedAtStep, 'overheated到達step(回帰)').toBe(147);
      expect(result.terminatedAtStep, '最終的な終了step(回帰、overheated)').toBe(147);
      expect(result.finalStatus, '最終状態(回帰)').toBe('overheated');
      expect(result.maxGauge, 'maxGauge(回帰、上限到達)').toBe(1);
      expect(result.finalGauge, 'finalGauge(回帰)').toBe(1);
    });

    // P1是正: magnetStrength:6.0等の実写像範囲外の値は使わない。production-valid選択
    // (wire-silver・magnet-neodymium・gear-titanium・battery-alkaline、高内部抵抗で
    // I²R発熱を大きくする)+player-adjustable調整(coilTurns:15・magnetDistanceMm:3・
    // brushPressure:0.5・gearRatio:10・tireGrip:1.0・坂道slopeDeg:20)で、D07不可逆到達と
    // overheated到達の両方が同一run内で観測できる負荷を構築する。
    //
    // 実測値(2026-08-09計測、60秒上限)。必須追補3是正(appendix全文化): droopAtStep=17、
    // irreversibleAtStep=28、overheatedAtStep=72、terminatedAtStep=72・
    // finalStatus='overheated'、minGauge≈0.0317、maxGauge=1、finalGauge=1。
    // 不可逆到達(28)がoverheated終端(72)より先に成立する。
    it('受け入れ条件3: 意図的な持続過負荷構成(production-valid素材+player-adjustable調整+坂道)で不可逆到達(irreversibleTriggered)がoverheated終端より先に可能である(D04のM4条件と同型の到達可能性条件)', () => {
      const { motorConfig, carConfig } = pvMotorCar(
        { wireId: 'wire-silver', magnetId: 'magnet-neodymium', gearId: 'gear-titanium', batteryId: 'battery-alkaline', brushId: 'brush-carbon' },
        { coilTurns: 15, magnetDistanceMm: 3, brushPressure: 0.5 },
        { gearRatio: 10, tireGrip: 1.0 },
      );
      const track = g5LongTrack(false, 20);
      const result = sweepD07(motorConfig, carConfig, track, g5NonLipoDestructionConfig(), 120 * 60);

      expect(result.irreversibleAtStep, `overheatedAtStep=${result.overheatedAtStep}, terminatedAtStep=${result.terminatedAtStep}`).not.toBeNull();
      expect(result.overheatedAtStep, '空虚な一致を禁止する: overheated自体も実際に到達可能であることを確認する').not.toBeNull();
      expect(result.irreversibleAtStep!).toBeLessThan(result.overheatedAtStep!);
      // 設計較正時点(2026-08-09)の実測値を数値回帰として固定する(P4是正: 終了状態も含む)。
      expect(result.droopAtStep, 'ダレ到達step(回帰)').toBe(17);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加、2026-08-19人間再承認)による再基準化。承認された意味assertは不変。
      // 旧値28 → 27。質量増により負荷が増え不可逆到達が1step早まった(変化の方向として整合)。
      expect(result.irreversibleAtStep, '不可逆到達step(回帰)').toBe(27);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧72 → 70(質量増で負荷が増えoverheated到達が2step早まった)。
      expect(result.overheatedAtStep, 'overheated到達step(回帰)').toBe(70);
      // P3-4 G3のG-R1(ギヤ実質量のmassG追加)由来、2026-08-19人間承認済みの再基準化。 旧72 → 70(overheated到達stepと一致する契約は不変)。
      expect(result.terminatedAtStep, '最終的な終了step(回帰)').toBe(70);
      expect(result.finalStatus, '最終状態(回帰)').toBe('overheated');
      expect(result.maxGauge, 'maxGauge(回帰、上限到達)').toBe(1);
      expect(result.finalGauge, 'finalGauge(回帰)').toBe(1);
      expect(result.minGauge, 'minGauge(回帰)').toBeCloseTo(0.0317, 3);
    });

    // P4是正(名称訂正): 旧「条件4: 全step・全構成」は過大主張だった——実態はferrite
    // (nonDemagnetizing磁石)1構成・120stepのみの極端入力回帰である。「全構成での0-1
    // clamp」自体は既にdestructionModes.test.ts(Gate3)がadvanceD07の実装そのものに対して
    // 構造的網羅性(Math.min(1,Math.max(0,...))の直接検証+demagnetizing/nonDemagnetizing
    // 両kindの単体テスト)で保証済みであり、本テストはmaterialMapping由来のferrite
    // 実production較正値を使った回帰確認に限定する。
    //
    // 実測値(2026-08-09計測、motor-only・120step)。必須追補3是正(appendix全文化): この
    // テストはmotor-only文脈でありsweepD07の統一診断表(terminatedAtStep等)には入らないため、
    // min/max/finalGaugeと両flagを別行として明示する: minGauge=0、maxGauge≈0.3674、
    // finalGauge≈0.3674(単調増加のためmaxGaugeと一致)、reversibleDroopActive=false、
    // irreversibleTriggered=false(nonDemagnetizingのため両flagとも常にfalse)。
    it('ferrite(nonDemagnetizing)極端入力回帰: production-valid較正値でも0〜1 clamp・両トリガfalseが成立する(全入力の構造的網羅性はdestructionModes.test.ts Gate3で別途保証済み)', () => {
      const neodymiumConfig = mapD07DestructionConfig('magnet-neodymium');
      const ferriteConfig = mapD07DestructionConfig('magnet-ferrite'); // nonDemagnetizing
      const { motorConfig } = pvMotorCar({ wireId: 'wire-copper-standard', magnetId: 'magnet-ferrite', gearId: 'gear-pom', batteryId: 'battery-alkaline', brushId: 'brush-carbon' });
      const snapshot = captureRunSnapshot({
        motorConfig,
        carConfig: null,
        destructionConfig: { ...g5NonLipoDestructionConfig('magnet-ferrite'), d07: ferriteConfig },
        runContext: { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null },
        initialMotorState: { theta: 0.01, omega: 50, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 },
        initialVehicleState: null,
        track: null,
        courseLengthM: null, // motor文脈のためnull必須(ゲート6正式M2検証、5.2節)
        slopeRad: null,
        seed: 1,
        initialDestructionState: createInitialDestructionState('nonLipo'),
        recipeKey: 'v1|test-motor',
      } satisfies CaptureRunSnapshotInput);
      let accumulator = createRunAccumulator(snapshot);
      let motorState: SimState = snapshot.initialMotorState;
      let minGauge = 1, maxGauge = 0;
      for (let i = 0; i < 120; i++) {
        const result = stepMotorWithDestruction(motorState, accumulator, DT_G5, () => 0.5);
        motorState = result.physicsState;
        accumulator = result.accumulator;
        const gauge = accumulator.destructionState.modes.D07.magnetHeatGaugeRatio;
        expect(gauge).toBeGreaterThanOrEqual(0);
        expect(gauge).toBeLessThanOrEqual(1);
        minGauge = Math.min(minGauge, gauge);
        maxGauge = Math.max(maxGauge, gauge);
      }
      const finalGauge = accumulator.destructionState.modes.D07.magnetHeatGaugeRatio;
      // nonDemagnetizing(ferrite)ではいかなる入力でもtriggerが両方falseのまま
      expect(accumulator.destructionState.modes.D07.reversibleDroopActive).toBe(false);
      expect(accumulator.destructionState.modes.D07.irreversibleTriggered).toBe(false);
      expect(neodymiumConfig.irreversible.kind).toBe('demagnetizing'); // 対比: neodymiumはdemagnetizingであることの前提確認
      // 必須追補3是正(appendix全文化): motor-onlyのためsweepD07の統一表には入らないが、
      // min/max/finalGaugeと両flagを別行として明示する(2026-08-09実測回帰)。
      expect(minGauge, 'minGauge(回帰、motor-only 120step)').toBe(0);
      expect(maxGauge, 'maxGauge(回帰、motor-only 120step、単調増加のため0-1 clamp未到達)').toBeCloseTo(0.3674, 3);
      expect(finalGauge, 'finalGauge(回帰、単調増加のためmaxGaugeと一致)').toBe(maxGauge);
    });
  });

  describe('Q2独立sweep受け入れ条件(可逆ダレによる定常RPM低下の観測可能性、計画§2.5、P5是正)', () => {
    // P1是正+必須追補4是正(表現の一貫性、2026-08-09): motorConfigの出発点を
    // composeConfigFromMaterials経由のproduction-valid値(wire-copper-standard・
    // magnet-neodymium・gear-pom・battery-lithium-polymer)にする。motor-only文脈
    // (stepMotorWithDestruction)+固定loadTorque(トルク制限領域、磁力低下が定常RPMを
    // 引き下げる方向に効く負荷条件)で、**production-valid motorConfigを用いた
    // schema-valid test-only isolated state**(reversibleDroopActiveを直接seedし、
    // D07熱蓄積を実質ゼロ〈isolatedConfig、詳細は下記〉にして遮断した状態。実運用で
    // 自然にこの状態へ至ることは別途保証されている——D07 Q11受け入れ条件2
    // 〈本ファイル上記、droopAtStep=21で実際にreversibleDroopActiveへ自然到達することを
    // production-valid構成のまま確認済み〉——本テストはそこからさらに踏み込み、
    // 「ダレという状態が定常RPMへ与える効果」だけを他の変動要因〈熱蓄積の継続的進行〉から
    // 分離して測定する役割分担である)と、seedしないaccumulatorとで定常RPMを比較する。
    // フリー走行(無負荷に近い高速域)では磁力低下がback-EMF低下→定常回転数上昇という
    // 逆方向に効く(電機子反作用が支配的な領域とトルク制限領域とで符号が変わる、標準的な
    // DCモーターのfield-weakening挙動)ため、「症状として観測可能なRPM低下」を示すには
    // トルク制限領域の負荷を選ぶ必要がある(2026-08-09production-valid構成での再sweepで
    // loadTorque=0.007Nm付近が明確な低下を示す領域と判明、これより大きい負荷では失速
    // 〈rpm=0〉に近づき比較が不安定になる)。
    function g5PvBaseMotorConfig(): MotorConfig {
      const { motorConfig } = pvMotorCar({ wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-lithium-polymer', brushId: 'brush-carbon' });
      return motorConfig;
    }

    function g5MotorSnapshotInput(destructionConfig: DestructionConfig, overrides: Partial<CaptureRunSnapshotInput> = {}): CaptureRunSnapshotInput {
      return {
        motorConfig: g5PvBaseMotorConfig(),
        carConfig: null,
        destructionConfig,
        runContext: { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null },
        initialMotorState: { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 },
        initialVehicleState: null,
        track: null,
        courseLengthM: null, // motor文脈のためnull必須(ゲート6正式M2検証、5.2節)
        slopeRad: null,
        seed: 1,
        initialDestructionState: createInitialDestructionState('nonLipo'),
        recipeKey: 'v1|test-motor',
        ...overrides,
      };
    }

    // P5是正(fixtureの明示区別): Q11の熱蓄積(conductionCoefficient)をそのまま使うと、
    // loadTorque=0.007の高電流下では「ダレをseedしない」側でも自然にゲージが
    // reversibleDroopThresholdを越えてしまい、両条件とも部分的にダレた状態に汚染されて
    // 比較にならない(2026-08-08 sweepで発見)。Q2は「ダレという状態が物理へ与える効果」を
    // 独立に検証する項目であり、ゲージの到達可能性自体はQ11で別途検証済みのため、ここでは
    // conductionCoefficientを実質ゼロにする。**この`isolatedConfig`はproduction-validでは
    // なく、schema-valid(validateDestructionConfigは通るがmaterialMapping.tsのいかなる
    // 較正値にも対応しない)test-only isolation fixtureである**——motorConfig側は
    // production-valid(g5PvBaseMotorConfig)のまま、destructionConfig.d07だけを
    // 意図的に非現実的な値へ差し替えて熱蓄積の影響を遮断する、という構成である。
    // P5是正(窓平均による定常性確認、Suu_mot3レビュー是正2、必須追補2): 末尾1フレームの
    // 瞬間値ではなく、末尾240フレーム(2秒間)の平均を「定常RPM」とし、その窓の前半/後半
    // 平均が近いこと(コギング/整流リップルはあるが系統的なドリフトではないこと)を
    // 確認したうえで、症状(定常RPM低下)の主張自体もこの窓平均(meanAll)同士で行う。
    // 末尾1フレームの瞬間値は参考の回帰確認としてのみ残す(主張には使わない)。
    function measureWindowedSteadyRpm(droopActive: boolean, loadTorque: number, totalFrames = 1200, windowFrames = 240) {
      const isolatedConfig: DestructionConfig = { ...g5NonLipoDestructionConfig(), d07: { thermal: { conductionCoefficient: 1e-9, dissipationCoefficient: 0.5 }, irreversible: { kind: 'demagnetizing', magnetHeatGaugeLimit: 0.8, reversibleDroopThreshold: 0.5, reversibleDroopMultiplier: 0.95, demagnetizationDeltaFraction: 0.1 } } }; // schema-valid test-only isolation
      const snapshot = captureRunSnapshot(g5MotorSnapshotInput(isolatedConfig));
      let accumulator = createRunAccumulator(snapshot);
      let motorState: SimState = snapshot.initialMotorState;
      const rpmHistory: number[] = [];
      for (let i = 0; i < totalFrames; i++) {
        // 毎step、比較対象のreversibleDroopActiveをseedし直す(advanceD07が自然計算で
        // 上書きしても、conductionCoefficient≈0のため常にfalseへ再計算されるだけであり、
        // ここでのseedがその後のcomposeEffectiveMotorConfig呼び出しに実際に使われる)。
        accumulator = { ...accumulator, destructionState: { ...accumulator.destructionState, modes: { ...accumulator.destructionState.modes, D07: { ...accumulator.destructionState.modes.D07, reversibleDroopActive: droopActive } } } };
        const result = stepMotorWithDestruction(motorState, accumulator, DT_G5, NO_NOISE_RNG_G5, loadTorque);
        motorState = result.physicsState;
        accumulator = result.accumulator;
        if (i >= totalFrames - windowFrames) rpmHistory.push(motorState.rpm);
      }
      const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const firstHalf = rpmHistory.slice(0, windowFrames / 2);
      const secondHalf = rpmHistory.slice(windowFrames / 2);
      const meanAll = mean(rpmHistory);
      return {
        meanAll, meanFirst: mean(firstHalf), meanSecond: mean(secondHalf),
        min: Math.min(...rpmHistory), max: Math.max(...rpmHistory),
        lastFrameValue: rpmHistory[rpmHistory.length - 1], // 参考の回帰値のみ(主張には使わない)
      };
    }

    it('reversibleDroopMultiplier(0.95)だけでなく、可逆ダレが症状(定常RPM低下)として実際に観測可能であることを実測する(窓平均が主張、末尾1フレームは参考回帰のみ)', () => {
      const loadTorque = 0.007;
      const withoutDroop = measureWindowedSteadyRpm(false, loadTorque);
      const withDroop = measureWindowedSteadyRpm(true, loadTorque);

      // 定常性の確認: 前半/後半平均の差が全体平均の3%以内であれば定常とみなす(コギング/
      // 整流リップルの揺らぎ幅を吸収しつつ、系統的な立ち上がり/減衰トレンドは検出できる閾値)。
      expect(Math.abs(withoutDroop.meanFirst - withoutDroop.meanSecond) / withoutDroop.meanAll).toBeLessThan(0.03);
      expect(Math.abs(withDroop.meanFirst - withDroop.meanSecond) / withDroop.meanAll).toBeLessThan(0.03);

      // 空虚な一致を禁止する: 両条件とも失速(rpm=0)していないことを先に確認する
      expect(withoutDroop.meanAll).toBeGreaterThan(0);
      expect(withDroop.meanAll).toBeGreaterThan(0);

      // 主張(症状として観測可能なRPM低下)は窓平均(meanAll)同士で行う。
      expect(withDroop.meanAll, `droop有効時の窓平均RPM(${withDroop.meanAll})はdroop無効時(${withoutDroop.meanAll})より低いこと`).toBeLessThan(withoutDroop.meanAll);
      const dropRatio = (withoutDroop.meanAll - withDroop.meanAll) / withoutDroop.meanAll;
      expect(dropRatio, '定常RPM低下率(窓平均から算出)が症状として有意(5%以上)であること').toBeGreaterThan(0.05);

      // 設計較正時点(2026-08-09)の実測値を数値回帰として固定する(production-valid
      // motorConfig、末尾240フレーム窓、mean/min/max/前半/後半mean全文)。
      expect(withoutDroop.meanAll, 'droop無効時の窓平均RPM(回帰)').toBeCloseTo(399.986, 2);
      expect(withoutDroop.meanFirst, 'droop無効時の窓前半平均RPM(回帰)').toBeCloseTo(400.104, 2);
      expect(withoutDroop.meanSecond, 'droop無効時の窓後半平均RPM(回帰)').toBeCloseTo(399.868, 2);
      expect(withoutDroop.min, 'droop無効時の窓内最小RPM(回帰)').toBeCloseTo(393.920, 2);
      expect(withoutDroop.max, 'droop無効時の窓内最大RPM(回帰)').toBeCloseTo(407.685, 2);
      expect(withDroop.meanAll, 'droop有効時の窓平均RPM(回帰)').toBeCloseTo(348.981, 2);
      expect(withDroop.meanFirst, 'droop有効時の窓前半平均RPM(回帰)').toBeCloseTo(348.956, 2);
      expect(withDroop.meanSecond, 'droop有効時の窓後半平均RPM(回帰)').toBeCloseTo(349.006, 2);
      expect(withDroop.min, 'droop有効時の窓内最小RPM(回帰)').toBeCloseTo(338.210, 2);
      expect(withDroop.max, 'droop有効時の窓内最大RPM(回帰)').toBeCloseTo(362.648, 2);
      expect(dropRatio, '定常RPM低下率(窓平均、回帰)').toBeCloseTo(0.1275, 3);

      // 参考: 末尾1フレーム目の瞬間値の回帰確認(主張には使わない、窓平均との乖離幅の
      // 参考記録のみ)。
      expect(withoutDroop.lastFrameValue, 'droop無効時の末尾1フレーム瞬間値(参考回帰)').toBeCloseTo(394.079, 2);
      expect(withDroop.lastFrameValue, 'droop有効時の末尾1フレーム瞬間値(参考回帰)').toBeCloseTo(358.933, 2);
    });
  });

  describe('Q15-2独立sweep受け入れ条件(ブラシ接触抵抗比の観測可能性、正式Fable P3-3-Q15裁定、checkpoint5較正sweep)', () => {
    // 正式Fable P3-3-Q15-2裁定: ブラシ素材による接触抵抗比(brushContactResistanceRatio、
    // materialMapping.ts)の違いが定常状態の測定で観測可能であることを示す。両極
    // (brush-copper-plate: 1.3〈悪化〉とbrush-precious-metal: 0.5〈改善〉)の比較を、
    // 上記Q2droopsweepと同型の手法(production-valid motorConfig、motor-only文脈、窓平均に
    // よる定常性確認)で行う。負荷はQ2と同じloadTorque=0.007Nm(トルク制限領域、
    // 2026-08-10 sweepで両ブラシとも失速せず明確な差を示す領域と確認、0.01Nm以上では
    // 両条件とも失速〈rpm≈0〉して比較が退化することを確認済み)。ここは接触抵抗比という
    // 静的なMotorConfigフィールドの効果だけを見るため、destructionStateのseedは不要
    // (Q2のisolatedConfigのような遮断は不要)で、`step`を直接使う。
    function motorConfigForBrush(brushId: 'brush-copper-plate' | 'brush-precious-metal'): MotorConfig {
      return pvMotorCar({ wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-lithium-polymer', brushId }).motorConfig;
    }

    function measureWindowedSteadyRpm(motorConfig: MotorConfig, loadTorque: number, totalFrames = 1200, windowFrames = 240) {
      let state: SimState = { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 };
      const rpmHistory: number[] = [];
      for (let i = 0; i < totalFrames; i++) {
        state = step(motorConfig, state, DT_G5, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: NO_NOISE_RNG_G5, loadTorque: loadTorque });
        if (i >= totalFrames - windowFrames) rpmHistory.push(state.rpm);
      }
      const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const firstHalf = rpmHistory.slice(0, windowFrames / 2);
      const secondHalf = rpmHistory.slice(windowFrames / 2);
      return { meanAll: mean(rpmHistory), meanFirst: mean(firstHalf), meanSecond: mean(secondHalf) };
    }

    it('ブラシ接触抵抗比の違い(copper-plate:1.3 vs precious-metal:0.5)が定常RPMとして観測可能であることを実測する(窓平均が主張)', () => {
      const loadTorque = 0.007;
      const copper = measureWindowedSteadyRpm(motorConfigForBrush('brush-copper-plate'), loadTorque);
      const precious = measureWindowedSteadyRpm(motorConfigForBrush('brush-precious-metal'), loadTorque);

      // 定常性の確認(Q2と同じ3%閾値)
      expect(Math.abs(copper.meanFirst - copper.meanSecond) / copper.meanAll).toBeLessThan(0.03);
      expect(Math.abs(precious.meanFirst - precious.meanSecond) / precious.meanAll).toBeLessThan(0.03);

      // 空虚な一致を禁止する: 両条件とも失速(rpm=0)していないことを先に確認する
      expect(copper.meanAll).toBeGreaterThan(0);
      expect(precious.meanAll).toBeGreaterThan(0);

      // 主張: 接触抵抗比が低い(改善)precious-metalのほうが定常RPMが高いこと
      expect(precious.meanAll, `precious-metalの窓平均RPM(${precious.meanAll})はcopper-plate(${copper.meanAll})より高いこと`).toBeGreaterThan(copper.meanAll);
      const diffRatio = (precious.meanAll - copper.meanAll) / copper.meanAll;
      expect(diffRatio, '定常RPM差(窓平均から算出)が観測可能な水準(5%以上)であること').toBeGreaterThan(0.05);

      // 実測値(2026-08-10計測、checkpoint5、DT=1/120s、rng固定0.5、末尾240フレーム窓)を
      // 数値回帰として固定する。
      expect(copper.meanAll, 'copper-plateの窓平均RPM(回帰)').toBeCloseTo(354.836, 2);
      expect(copper.meanFirst, 'copper-plateの窓前半平均RPM(回帰)').toBeCloseTo(355.107, 2);
      expect(copper.meanSecond, 'copper-plateの窓後半平均RPM(回帰)').toBeCloseTo(354.565, 2);
      expect(precious.meanAll, 'precious-metalの窓平均RPM(回帰)').toBeCloseTo(490.930, 2);
      expect(precious.meanFirst, 'precious-metalの窓前半平均RPM(回帰)').toBeCloseTo(490.795, 2);
      expect(precious.meanSecond, 'precious-metalの窓後半平均RPM(回帰)').toBeCloseTo(491.064, 2);
      expect(diffRatio, '定常RPM差(窓平均、回帰)').toBeCloseTo(0.3835, 3);
    });
  });

  describe('Q15-3独立sweep受け入れ条件(precious-metalの高電流域摩耗ペナルティによる順位逆転、正式Fable P3-3-Q15-3裁定、checkpoint5較正sweep)', () => {
    // 正式Fable P3-3-Q15-3裁定: brush-precious-metalは低電流域の基礎摩耗率
    // (brushWearRateRatio=0.7)がbrush-carbon(1.0)・brush-copper-plate(1.5)より良いが、
    // 高電流(理論電流>highCurrentPenaltyThresholdA=3A)ではhighCurrentPenaltyMultiplier=2.5倍
    // が乗り、実効摩耗率0.7×2.5=1.75がcarbon(1.0、ペナルティなし)・copper-plate(1.5、
    // ペナルティなし)の両方を上回る——「低電流で抜群、大電流で急速に荒れる」という
    // materialMapping.tsのコメント(618行)どおりの順位逆転が、実際のD05状態機械
    // (advanceD05)経由で観測できることを示す。
    //
    // NORMAL_OPERATION(brushPressure=0.3、production-valid既定値)条件でのD05非進行
    // (episodeCount=0・cumulativeWearDeltaFraction=0、precious-metalを含む全ブラシで
    // 構造的に成立)は、上記Q13-2通常運用確認テストの付帯条件1で既に直接確認済み
    // (D05はbrushPressure<CHATTER_PRESSURE_THRESHOLD=0.2でなければ発火せず、
    // production-valid既定のbrushPressure=0.3はこれを構造的に排除するため、
    // ブラシ種別非依存で成立する)。本テストはそこからさらに踏み込み、
    // 「高電流下でのペナルティが実際に順位を逆転させる」ことをmotor-only sweepで直接示す。
    //
    // 構成: motor-only文脈(D02 M4型sweepと同型のharness)、brushPressure=0.1
    // (<CHATTER_PRESSURE_THRESHOLD=0.2で瞬断確率を発生させる)+固定loadTorque=0.02Nm
    // (近失速、理論電流を持続的にbrushSparkCurrentThresholdA=3A超に保つ)+
    // wire-silver・magnet-neodymium・gear-titanium・coilTurns:40・magnetDistanceMm:3
    // (D02 M4型sweepと同じ高電流構成)。rngは5回に1回0を返す周期パターン(バーストの
    // 再武装を周期的に許しつつ単調な常時瞬断にはしない探索と同型の手法)。
    function d05ConfigForBrush(brushId: 'brush-carbon' | 'brush-copper-plate' | 'brush-precious-metal') {
      return assembleD05Config(mapD05BrushWearConfig(brushId), {
        brushSparkDurationLimitS: 0.15,
        brushSparkCurrentThresholdA: 3,
        wearPerAmpSecond: 0.001,
        recoveryFrames: 6,
        recoveryContactResistanceMultiplier: 1.2,
      });
    }
    function highLoadWearResult(brushId: 'brush-carbon' | 'brush-copper-plate' | 'brush-precious-metal', totalSteps = 600) {
      const { motorConfig } = pvMotorCar(
        { wireId: 'wire-silver', magnetId: 'magnet-neodymium', gearId: 'gear-titanium', batteryId: 'battery-lithium-polymer', brushId },
        { coilTurns: 40, magnetDistanceMm: 3, brushPressure: 0.1 },
      );
      const destructionConfig: DestructionConfig = { ...g5LipoDestructionConfig(), d05: d05ConfigForBrush(brushId) };
      const snapshot = captureRunSnapshot({
        motorConfig, carConfig: null, destructionConfig,
        runContext: { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null },
        initialMotorState: { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 },
        initialVehicleState: null, track: null, courseLengthM: null, slopeRad: null, seed: 1,
        initialDestructionState: createInitialDestructionState('lipo'),
        recipeKey: 'v1|test-motor',
      });
      let accumulator: RunAccumulator = createRunAccumulator(snapshot);
      let motorState: SimState = snapshot.initialMotorState;
      let rngCallCount = 0;
      const rng = () => (rngCallCount++ % 5 === 0 ? 0 : 1);
      for (let i = 0; i < totalSteps; i++) {
        const result = stepMotorWithDestruction(motorState, accumulator, DT_G5, rng, 0.02);
        motorState = result.physicsState;
        accumulator = result.accumulator;
      }
      // 正式Fable P56-4要求: theoreticalCurrentA>3A(highCurrentPenaltyThresholdA)が実際に
      // 成立したことを、コメント上の主張ではなくD05 event自身のcauseLogから直接返す。
      const d05TheoreticalCurrentAs = accumulator.events.filter((e): e is Extract<typeof e, { mode: 'D05' }> => e.mode === 'D05').map((e) => e.causeLog.theoreticalCurrentA);
      return {
        cumulativeWearDeltaFraction: accumulator.destructionState.modes.D05.cumulativeWearDeltaFraction,
        episodeCount: accumulator.destructionState.modes.D05.episodeCount,
        d05TheoreticalCurrentAs,
        maxTheoreticalCurrentA: d05TheoreticalCurrentAs.length > 0 ? Math.max(...d05TheoreticalCurrentAs) : null,
      };
    }

    it('高電流構成(motor-only、brushPressure=0.1)では、precious-metalの累積摩耗がcarbon・copper-plateの両方を上回る(基礎摩耗率の順位0.7<1.0<1.5から、実効摩耗率1.75>1.5>1.0へ逆転する)', () => {
      const carbon = highLoadWearResult('brush-carbon');
      const copperPlate = highLoadWearResult('brush-copper-plate');
      const precious = highLoadWearResult('brush-precious-metal');

      // 空虚な一致を禁止する: 3種とも実際にepisodeが成立し摩耗が発生していることを先に確認する
      expect(carbon.episodeCount, 'carbon: episode成立').toBeGreaterThan(0);
      expect(copperPlate.episodeCount, 'copper-plate: episode成立').toBeGreaterThan(0);
      expect(precious.episodeCount, 'precious-metal: episode成立').toBeGreaterThan(0);
      expect(carbon.cumulativeWearDeltaFraction, 'carbon: 摩耗>0').toBeGreaterThan(0);
      expect(copperPlate.cumulativeWearDeltaFraction, 'copper-plate: 摩耗>0').toBeGreaterThan(0);
      expect(precious.cumulativeWearDeltaFraction, 'precious-metal: 摩耗>0').toBeGreaterThan(0);

      // 主張(順位逆転): 高電流ペナルティにより、precious-metalの累積摩耗が
      // copper-plate・carbonの両方を上回る(低電流域の基礎摩耗率の順位とは逆順になる)。
      expect(precious.cumulativeWearDeltaFraction, `precious-metal(${precious.cumulativeWearDeltaFraction})はcopper-plate(${copperPlate.cumulativeWearDeltaFraction})より摩耗が大きいこと`).toBeGreaterThan(copperPlate.cumulativeWearDeltaFraction);
      expect(copperPlate.cumulativeWearDeltaFraction, `copper-plate(${copperPlate.cumulativeWearDeltaFraction})はcarbon(${carbon.cumulativeWearDeltaFraction})より摩耗が大きいこと`).toBeGreaterThan(carbon.cumulativeWearDeltaFraction);

      // 実測値(2026-08-10計測、checkpoint5、DT=1/120s、600step、周期rng)を数値回帰として固定する。
      expect(carbon.cumulativeWearDeltaFraction, 'carbon: 累積摩耗(回帰)').toBeCloseTo(0.056354, 5);
      expect(carbon.episodeCount, 'carbon: episode数(回帰)').toBe(6);
      expect(copperPlate.cumulativeWearDeltaFraction, 'copper-plate: 累積摩耗(回帰)').toBeCloseTo(0.076636, 5);
      expect(copperPlate.episodeCount, 'copper-plate: episode数(回帰)').toBe(5);
      expect(precious.cumulativeWearDeltaFraction, 'precious-metal: 累積摩耗(回帰)').toBeCloseTo(0.117902, 5);
      expect(precious.episodeCount, 'precious-metal: episode数(回帰)').toBe(6);

      // 正式Fable P56-4要求: precious-metalのD05 event/causeLogから、
      // theoreticalCurrentA>3A(highCurrentPenaltyThresholdA)が実際に成立したことを
      // コメント上の主張ではなく直接assertする。
      expect(precious.d05TheoreticalCurrentAs, 'precious-metal: D05 event数(回帰)').toHaveLength(6);
      for (const theoreticalCurrentA of precious.d05TheoreticalCurrentAs) {
        expect(theoreticalCurrentA, `precious-metalの各D05 eventでtheoreticalCurrentA(${theoreticalCurrentA})が3Aを超えること`).toBeGreaterThan(3);
      }
      expect(precious.maxTheoreticalCurrentA, 'precious-metal: 最大theoreticalCurrentA(回帰)').toBeCloseTo(40.666317, 4);
    });

    // Gate5受け入れ条件1点目(正式Fable P3-3-Q15-3裁定「NORMAL_OPERATION非到達」)。
    // 上記Q13-2通常運用確認テストはbrushId固定でbrush-carbonのみを走らせているため、
    // brush-precious-metal自身についても直接確認する。ただしD05の発火条件
    // (isChatteringThisFrame、これはbrushPressure<CHATTER_PRESSURE_THRESHOLD=0.2の場合のみ
    // 成立しうる、motorPhysics.ts nextChatterState)はブラシ素材の比率(brushChatterProbabilityRatio)
    // より前段の構造的ゲートであり、production-valid既定のbrushPressure=0.3ではいかなる
    // ブラシでもチャタリング自体が発生しない。よってここでの非到達は「precious-metalの
    // highCurrentPenaltyが未発火」という結果そのものであり、Q13-2で確認済みの構造的事実の
    // ブラシ非依存性をprecious-metal自身についても直接裏付ける。
    it('NORMAL_OPERATION基準構成(production-valid、brushPressure=0.3)では、brush-precious-metalでもD05は一切進行しない(高電流ペナルティ未発火)', () => {
      const track = TRACK_BY_ID.get('energy-run');
      if (!track) throw new Error('テスト前提が崩れています: energy-runがTRACK_BY_IDに存在しません');
      const batteryId = 'battery-lithium-polymer';
      const { motorConfig, carConfig } = pvMotorCar({ wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId, brushId: 'brush-precious-metal' });
      const destructionConfig: DestructionConfig = { ...g5LipoDestructionConfig(), d05: d05ConfigForBrush('brush-precious-metal') };

      let vehicleState = createInitialVehicleState(motorConfig, carConfig);
      let destructionState = createInitialDestructionState('lipo');
      const runContext = g5VehicleRunContext();
      let i = 0;
      const maxSteps = 120 * 120;
      for (; i < maxSteps && (vehicleState.status === 'running' || vehicleState.status === 'ready'); i++) {
        const prevVehicleState = normalizeOverheatedStatusForD04Hold(vehicleState, destructionState);
        const effectiveConfig = composeEffectiveMotorConfig(motorConfig, destructionState, destructionConfig);
        const rawNextVehicleState = stepTrackRun(effectiveConfig, carConfig, track, prevVehicleState, DT_G5, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: NO_NOISE_RNG_G5 });
        const frame = buildVehicleFrameInput(effectiveConfig, carConfig, prevVehicleState, rawNextVehicleState);
        const result = advanceDestructionState(destructionState, frame, destructionConfig, runContext, DT_G5);
        destructionState = result.state;
        vehicleState = normalizeOverheatedStatusForD04Hold(rawNextVehicleState, destructionState);
      }

      // 空虚な一致を禁止する: 実際に完走したことを先に確認する。
      expect(vehicleState.status, `finalStep=${i}`).toBe('finished');
      expect(destructionState.modes.D05.episodeCount).toBe(0);
      expect(destructionState.modes.D05.cumulativeWearDeltaFraction).toBe(0);
    });
  });

  describe('P56-3: smokeResistanceMultiplier副作用の方向(正式Fable Q1/P44要求、checkpoint5較正sweep追補)', () => {
    // 正式Fable Q1/P44は、発煙後のR増(smokeResistanceMultiplier)が熱蓄積を加速・鈍化・
    // ほぼ不変のどれにするかをsweep実測で報告するよう要求している。D02専用M4型sweepと同一の
    // 高負荷構成(wire-silver・magnet-ferrite・gear-titanium・battery-alkaline・
    // coilTurns:40・magnetDistanceMm:3・固定loadTorque=0.02、motor-only、rng固定0.5)で
    // smokingStarted成立直後(実測forkStep=508)の同一motorState/destructionStateから、
    // multiplier=1.0(no-op相当)と1.2(採用値)へ分岐させ、以後の推移を比較する。
    function buildSnapshot(smokeResistanceMultiplier: number) {
      const { motorConfig } = pvMotorCar(
        { wireId: 'wire-silver', magnetId: 'magnet-ferrite', gearId: 'gear-titanium', batteryId: 'battery-alkaline', brushId: 'brush-carbon' },
        { coilTurns: 40, magnetDistanceMm: 3 },
      );
      const destructionConfig = { ...g5NonLipoDestructionConfig('magnet-ferrite'), d02: { ...g5NonLipoDestructionConfig('magnet-ferrite').d02, smokeResistanceMultiplier } };
      return captureRunSnapshot({
        motorConfig, carConfig: null, destructionConfig,
        runContext: { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null },
        initialMotorState: { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 },
        initialVehicleState: null, track: null, courseLengthM: null, slopeRad: null, seed: 1,
        initialDestructionState: createInitialDestructionState('nonLipo'),
        recipeKey: 'v1|test-motor',
      });
    }

    function reachSmokeOnset() {
      const snapshotRef = buildSnapshot(1.2);
      let accumulator: RunAccumulator = createRunAccumulator(snapshotRef);
      let motorState: SimState = snapshotRef.initialMotorState;
      let forkStep = -1;
      for (let i = 0; i < 3000 && forkStep < 0; i++) {
        const result = stepMotorWithDestruction(motorState, accumulator, DT_G5, () => 0.5, 0.02);
        motorState = result.physicsState;
        accumulator = result.accumulator;
        if (accumulator.destructionState.modes.D02.smokingStarted) forkStep = i;
      }
      return { forkStep, motorState, destructionState: accumulator.destructionState };
    }

    function forkWith(multiplier: number, refMotorState: SimState, refDestructionState: RunAccumulator['destructionState'], maxSteps: number) {
      const snap = buildSnapshot(multiplier);
      let acc: RunAccumulator = { events: [], destructionState: refDestructionState, replaySnapshot: snap, terminalModeCandidates: [] };
      let motorState = refMotorState;
      const ratioHistory: number[] = [];
      let burnoutStep = -1;
      for (let i = 0; i < maxSteps; i++) {
        const result = stepMotorWithDestruction(motorState, acc, DT_G5, () => 0.5, 0.02);
        motorState = result.physicsState;
        acc = result.accumulator;
        ratioHistory.push(acc.destructionState.modes.D02.coilHeatGaugeRatio);
        if (burnoutStep < 0 && acc.destructionState.modes.D02.coilHeatGaugeRatio >= 1) burnoutStep = i;
      }
      return { ratioHistory, burnoutStep, burnoutSeconds: burnoutStep < 0 ? null : burnoutStep * DT_G5 };
    }

    it('smokeResistanceMultiplier=1.2(採用値)はmultiplier=1.0(no-op)と比較して、発煙後の熱蓄積を加速しburnout到達を早める(観測結果、断定的な物理的説明は付与しない)', () => {
      const { forkStep, motorState: refMotorState, destructionState: refDestructionState } = reachSmokeOnset();
      const maxSteps = 1000; // 採用値側の実測burnoutStep(696)を十分超える予算
      const withMultiplier1_0 = forkWith(1.0, refMotorState, refDestructionState, maxSteps);
      const withMultiplier1_2 = forkWith(1.2, refMotorState, refDestructionState, maxSteps);

      // 空虚な一致を禁止する: フォーク元でsmokingStartedが実際に成立していたことを先に確認する。
      expect(forkStep, 'フォーク元でsmokingStarted成立(回帰)').toBe(508);
      expect(refDestructionState.modes.D02.smokingStarted).toBe(true);

      // 主張(観測された方向): multiplier=1.2はmultiplier=1.0よりburnout(coilOverheatGaugeLimit=1)へ
      // 速く到達する。multiplier=1.0は同じ予算内ではburnoutへ到達しない。
      expect(withMultiplier1_2.burnoutStep, 'multiplier=1.2はburnoutへ到達すること').toBeGreaterThan(0);
      expect(withMultiplier1_0.burnoutStep, 'multiplier=1.0は同じ予算内ではburnoutへ到達しないこと').toBe(-1);
      // 同一step数時点(multiplier=1.2のburnoutStep)で比較しても、multiplier=1.0はまだ1.0未満である。
      expect(withMultiplier1_0.ratioHistory[withMultiplier1_2.burnoutStep]).toBeLessThan(1);

      // 実測値(2026-08-10計測、checkpoint5 P56-3追補)を数値回帰として固定する。
      expect(withMultiplier1_2.burnoutStep, 'multiplier=1.2のburnoutStep(回帰)').toBe(696);
      expect(withMultiplier1_2.burnoutSeconds, 'multiplier=1.2のburnout秒数(回帰)').toBeCloseTo(5.8, 3);
      expect(withMultiplier1_0.ratioHistory[696], 'multiplier=1.0の同時点ratio(回帰)').toBeCloseTo(0.884946, 5);
      expect(withMultiplier1_0.ratioHistory[999], 'multiplier=1.0の1000step後ratio(回帰)').toBeCloseTo(0.920752, 5);
    });
  });

  describe('P56-4: D05共通較正値(duration/recovery)の証跡固定(checkpoint5較正sweep追補)', () => {
    // 正式Fable指示(P56-4)により、D05共通5値のうちduration/recoveryの2軸を、実チャタリング
    // バースト(nextChatterState経由、CHATTER_BURST_FRAMES=24フレーム=0.2秒)を使った物理
    // harnessで直接固定する。理論電流(theoreticalCurrentA)を単一burst内で安定して
    // brushSparkCurrentThresholdA(3A)超に保つため、`effectiveInertia`を極端に大きく
    // (=1、通常のJ_motorオーダー〈1e-5〉より5桁大きい)test-only固定し、バースト中のomega
    // 変動をほぼゼロへ凍結する——これによりtheta変化もほぼ止まり、コギング由来の電流振動・
    // 整流子不感帯の周期的通過(通常の高負荷構成で観測された、通常運用では起こりうる現象だが
    // duration境界を単独で見るには測定を汚染する)を排除できる。**この凍結harnessは
    // Q2 sweepのisolatedConfigと同種のtest-only isolation fixtureであり、production-valid
    // ではない**——motorConfig(wire-silver・coilTurns:10・magnetDistanceMm:3・
    // brushPressure:0.1)自体はproduction-valid選択の範囲内だが、effectiveInertiaの人為的な
    // 拡大は測定専用の分離手法である。
    function d05Config(brushSparkDurationLimitS: number) {
      return assembleD05Config(mapD05BrushWearConfig('brush-carbon'), {
        brushSparkDurationLimitS,
        brushSparkCurrentThresholdA: 3,
        wearPerAmpSecond: 0.001,
        recoveryFrames: 6,
        recoveryContactResistanceMultiplier: 1.2,
      });
    }
    function runSingleFrozenBurst(brushSparkDurationLimitS: number, totalFrames = 30) {
      const { motorConfig } = pvMotorCar(
        { wireId: 'wire-silver', magnetId: 'magnet-neodymium', gearId: 'gear-titanium', batteryId: 'battery-lithium-polymer', brushId: 'brush-carbon' },
        { coilTurns: 10, magnetDistanceMm: 3, brushPressure: 0.1 },
      );
      const destructionConfig: DestructionConfig = { ...g5LipoDestructionConfig(), d05: d05Config(brushSparkDurationLimitS) };
      const snapshot = captureRunSnapshot({
        motorConfig, carConfig: null, destructionConfig,
        runContext: { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null },
        initialMotorState: { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 },
        initialVehicleState: null, track: null, courseLengthM: null, slopeRad: null, seed: 1,
        initialDestructionState: createInitialDestructionState('lipo'),
        recipeKey: 'v1|test-motor',
      });
      let accumulator: RunAccumulator = createRunAccumulator(snapshot);
      let motorState: SimState = snapshot.initialMotorState;
      let rngCallCount = 0;
      const rng = () => (rngCallCount++ === 0 ? 0 : 1); // 単一の連続24フレームバーストのみを作る
      const episodeTriggeredAtFrame: number[] = [];
      let prevEpisodeCount = 0;
      for (let i = 0; i < totalFrames; i++) {
        const result = stepMotorWithDestruction(motorState, accumulator, DT_G5, rng, 0, 1); // effectiveInertia=1(凍結)、loadTorque=0
        motorState = result.physicsState;
        accumulator = result.accumulator;
        if (accumulator.destructionState.modes.D05.episodeCount > prevEpisodeCount) {
          episodeTriggeredAtFrame.push(i);
          prevEpisodeCount = accumulator.destructionState.modes.D05.episodeCount;
        }
      }
      return { episodeTriggeredAtFrame, finalEpisodeCount: accumulator.destructionState.modes.D05.episodeCount, finalSparkDurationS: accumulator.destructionState.modes.D05.sparkDurationS };
    }

    it('duration=0.15秒(採用値)は単一の実チャタリングバースト(24フレーム)内でepisodeへ到達可能である(frame17=18フレーム目、バースト終了frame23より前)', () => {
      const r = runSingleFrozenBurst(0.15);
      expect(r.episodeTriggeredAtFrame, '実測: frame17(0-indexed、18フレーム目=0.15秒)でepisode成立(回帰)').toEqual([17]);
      expect(r.finalEpisodeCount).toBe(1);
      expect(r.episodeTriggeredAtFrame[0]).toBeLessThan(23); // バースト終了(frame23)より前に到達
    });

    it('duration=0.2秒(=CHATTER_BURST_FRAMES/120、validatorが許す上限)は単一バーストの最終フレーム(frame23)でちょうど境界到達する', () => {
      const r = runSingleFrozenBurst(CHATTER_BURST_FRAMES / 120);
      expect(r.episodeTriggeredAtFrame, '実測: frame23(0-indexed、バーストの最終=24フレーム目)でepisode成立(回帰)').toEqual([23]);
      expect(r.finalEpisodeCount).toBe(1);
    });

    it('duration>0.2秒は単一バースト内では構造的に非到達である(validatorが既にこの値域を拒否することは既存テスト「72. validateDestructionConfig: d05の新規値域」で固定済み、ここではランタイム側の非到達性を直接確認する)', () => {
      const r = runSingleFrozenBurst(CHATTER_BURST_FRAMES / 120 + 1 / 120); // validatorを迂回しあえて0.2s超を設定(非到達性の確認専用)
      expect(r.episodeTriggeredAtFrame).toEqual([]);
      expect(r.finalEpisodeCount).toBe(0);
      expect(r.finalSparkDurationS).toBe(0); // バースト終了で再武装され、蓄積は持ち越されない
    });

    it('recoveryFrames=6・recoveryContactResistanceMultiplier=1.2はno-opではない(composeEffectiveMotorConfig後のbrushContactResistanceRatio増加、および実物理〈computeElectricalState〉での電流低下まで確認する)', () => {
      const { motorConfig } = pvMotorCar({ wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-lithium-polymer', brushId: 'brush-carbon' });
      const destructionConfig = g5LipoDestructionConfig();
      const baseDestructionState = createInitialDestructionState('lipo');
      const inactiveState = { ...baseDestructionState, modes: { ...baseDestructionState.modes, D05: { ...baseDestructionState.modes.D05, recoveryFramesLeft: 0 } } };
      const activeState = { ...baseDestructionState, modes: { ...baseDestructionState.modes, D05: { ...baseDestructionState.modes.D05, recoveryFramesLeft: 6 } } };

      const inactiveConfig = composeEffectiveMotorConfig(motorConfig, inactiveState, destructionConfig);
      const activeConfig = composeEffectiveMotorConfig(motorConfig, activeState, destructionConfig);

      // 空虚な一致を禁止する: base値(brush-carbon、比率1.0)からの変化を確認する。
      expect(inactiveConfig.brushContactResistanceRatio).toBe(1);
      expect(activeConfig.brushContactResistanceRatio, 'recovery活性時はbase×1.2(回帰)').toBeCloseTo(1.2, 10);
      expect(activeConfig.brushContactResistanceRatio!).toBeGreaterThan(inactiveConfig.brushContactResistanceRatio!);

      // 実物理での確認: 同一theta/omegaで、recovery活性時のほうが電流が低いこと。
      const theta = Math.PI / 4;
      const omega = 0;
      const inactiveCurrent = computeElectricalState(inactiveConfig, theta, omega).current;
      const activeCurrent = computeElectricalState(activeConfig, theta, omega).current;
      expect(activeCurrent, `recovery活性時の電流(${activeCurrent})はrecovery非活性時(${inactiveCurrent})より低いこと`).toBeLessThan(inactiveCurrent);
      expect(inactiveCurrent, 'recovery非活性時の電流(回帰)').toBeCloseTo(1.637896, 5);
      expect(activeCurrent, 'recovery活性時の電流(回帰)').toBeCloseTo(1.605186, 5);
    });
  });

  describe('付帯条件3(正式Fable checkpoint5較正レビュー、2026-08-10): precious-metalのbrushChatterProbabilityRatio=0.7が実際にバースト頻度を下げることの単離実証', () => {
    // 正式Fable指摘: Q15-3ではepisode数がcarbon(比率1.0)と同数(6)だったため、
    // brushChatterProbabilityRatio=0.7という値の「効果の存在」自体が一度も単離実証されて
    // いなかった(値の妥当性ではなく、効果があるかどうかの確認)。同一rng列・同一構成で
    // ratio=0.7と1.0のnextChatterState経由バースト発生数を比較する決定論harnessを新設する。
    //
    // 短い周期のrng配列を使うと、`step()`内の軸ずれ振動ノイズ(`vibrationNoise`、
    // axisOffsetMm=0でも数値的な効果はゼロだがrng()呼び出し自体は毎フレーム消費される、
    // 「rng消費②」コメント参照)とチャタリング判定のrng呼び出し(「rng消費①」)が
    // 干渉し、周期が一致すると特定の値に固定されてしまう(実際に周期4配列で実験した際、
    // ratio=0.7側が偶然すべて失敗する値に固定される「共振」を観測した)。この汚染を
    // 避けるため、周期を持たない決定論的PRNG(mulberry32相当、固定seed)を用いる。
    function makeDeterministicRng(seed: number) {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function countBursts(brushChatterProbabilityRatio: number, totalFrames: number) {
      const { motorConfig: base } = pvMotorCar(
        { wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-lithium-polymer', brushId: 'brush-carbon' },
        { brushPressure: 0.1 },
      );
      // brushChatterProbabilityRatioのみを差し替え、brushContactResistanceRatio等の他フィールドは
      // baseのまま(anchor、brush-carbon由来の1.0)に固定する——比較対象をこの1フィールドへ単離する。
      const motorConfig: MotorConfig = { ...base, brushChatterProbabilityRatio };
      let state: SimState = { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 };
      const rng = makeDeterministicRng(42); // 両ratioで同一seed(=同一rng列)を使う
      let burstStarts = 0;
      let totalChatterFrames = 0;
      for (let i = 0; i < totalFrames; i++) {
        const prevFramesLeft = state.chatterFramesLeft;
        state = step(motorConfig, state, DT_G5, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng: rng, loadTorque: 0 });
        if (prevFramesLeft === 0 && state.chatterFramesLeft === CHATTER_BURST_FRAMES - 1) burstStarts++;
        if (prevFramesLeft > 0 || state.chatterFramesLeft > 0) totalChatterFrames++;
      }
      return { burstStarts, totalChatterFrames };
    }

    it('同一rng列(固定seed)・同一構成(brushPressure=0.1)で、brushChatterProbabilityRatio=0.7はratio=1.0よりバースト発生数・総チャタリングフレーム数の両方が少ない', () => {
      const totalFrames = 12000; // 100秒相当、大数の法則で単発の揺らぎを均す
      const ratio1_0 = countBursts(1.0, totalFrames);
      const ratio0_7 = countBursts(0.7, totalFrames);

      // 空虚な一致を禁止する: 両ratioとも実際にバーストが発生していることを先に確認する。
      expect(ratio1_0.burstStarts, 'ratio=1.0: バースト発生数>0').toBeGreaterThan(0);
      expect(ratio0_7.burstStarts, 'ratio=0.7: バースト発生数>0').toBeGreaterThan(0);

      // 主張(効果の存在): ratio=0.7はratio=1.0よりバースト発生数・総チャタリングフレーム数の
      // 両方が少ない(確率が下がっている以上、頻度も下がるはず、という効果の存在証明)。
      expect(ratio0_7.burstStarts, `ratio=0.7のバースト発生数(${ratio0_7.burstStarts})はratio=1.0(${ratio1_0.burstStarts})より少ないこと`).toBeLessThan(ratio1_0.burstStarts);
      expect(ratio0_7.totalChatterFrames, `ratio=0.7の総チャタリングフレーム数(${ratio0_7.totalChatterFrames})はratio=1.0(${ratio1_0.totalChatterFrames})より少ないこと`).toBeLessThan(ratio1_0.totalChatterFrames);

      // 実測値(2026-08-10計測、checkpoint5較正レビュー付帯条件3)を数値回帰として固定する。
      expect(ratio1_0.burstStarts, 'ratio=1.0: バースト発生数(回帰)').toBe(403);
      expect(ratio1_0.totalChatterFrames, 'ratio=1.0: 総チャタリングフレーム数(回帰)').toBe(9672);
      expect(ratio0_7.burstStarts, 'ratio=0.7: バースト発生数(回帰)').toBe(375);
      expect(ratio0_7.totalChatterFrames, 'ratio=0.7: 総チャタリングフレーム数(回帰)').toBe(8977);
    });
  });

  describe('D01自己制限プラトー(正式Fable補足裁定、2026-08-11、受け入れ条件3→3′・条件1′確定)', () => {
    // 正式Fable補足裁定: D01追加sweepで発見された負のフィードバック(劣化→トルク定数低下→
    // 回転低下→COIL_DEFORM_OMEGA割れ→減衰停止)は、物理的に正しい創発挙動として受容された
    // (Phase 2の銅線+フェライト過熱レジームに続く本プロジェクト2件目の創発的実測知見、
    // docs/phase3-plan-v12-amendments.md参照)。旧条件3(floor到達可能性)は誤った受け入れ
    // 条件と判定され、次の3点へ改訂された:
    // - 条件3′(プラトーの実測固定): 代表的虐待構成の自己制限プラトー(実測: 最良構成で
    //   ratio 0.7074)が観測可能な劣化を与えること(条件2で別途確認済み、3%基準を大幅超過)。
    // - 条件1′(漸減性の直接形): 崩壊トリガ後1秒時点でratio>=0.8(段差禁止の実測可能形)。
    // - decayExposureRadがプラトー後は増加しないこと(減衰停止の直接assert)。
    // 最良構成(coilTurns=15・magnetDistanceMm=8、D01補足レビュー依頼書の実測構成と同一)を
    // 用い、この3点を単一の実走行経路で固定する。
    it('最良構成(coilTurns=15・magnetDistanceMm=8)のD01自己制限プラトーが、条件1′(トリガ+1秒でratio>=0.8)・条件3′(プラトーratio固定)・減衰停止(プラトー後decayExposureRad不増加)を満たす', () => {
      const { motorConfig: baseMotor } = pvMotorCar(
        { wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-lithium-polymer', brushId: 'brush-carbon' },
        { coilTurns: 15, magnetDistanceMm: 8 },
      );
      const motorConfig: MotorConfig = { ...baseMotor, varnished: false };
      const destructionConfig = g5LipoDestructionConfig(); // d01: decayExposureScaleRad=1000, minEffectiveTurnsRatio=0.5(確定値、変更なし)
      const snapshot = captureRunSnapshot({
        motorConfig, carConfig: null, destructionConfig,
        runContext: { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null },
        initialMotorState: { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 },
        initialVehicleState: null, track: null, courseLengthM: null, slopeRad: null, seed: 1,
        initialDestructionState: createInitialDestructionState('lipo'),
        recipeKey: 'v1|test-motor',
      });
      let accumulator: RunAccumulator = createRunAccumulator(snapshot);
      let motorState: SimState = snapshot.initialMotorState;
      let triggeredAtStep = -1;
      let ratioAt1sPostTrigger: number | null = null;
      const totalFrames = 3600; // 30秒(プラトーに達するまで十分な余裕)
      const oneSecondFrames = Math.round(1 / DT_G5);
      const decayExposureRadHistory: number[] = [];
      let finalRatio = 1;
      for (let i = 0; i < totalFrames; i++) {
        const result = stepMotorWithDestruction(motorState, accumulator, DT_G5, () => 0.5, 0);
        motorState = result.physicsState;
        accumulator = result.accumulator;
        const d01 = accumulator.destructionState.modes.D01;
        if (triggeredAtStep < 0 && d01.triggered) triggeredAtStep = i;
        if (triggeredAtStep >= 0) {
          decayExposureRadHistory.push(d01.decayExposureRad);
          // 正式Fable指摘(P59-1): 実効ratioはproductionのcomposeEffectiveMotorConfigから
          // 取得する(1000/0.5を直書き再計算するとproduction式との二重出典になる)。
          const effectiveRatio = composeEffectiveMotorConfig(motorConfig, accumulator.destructionState, destructionConfig).effectiveTurnsRatio ?? 1;
          finalRatio = effectiveRatio;
          if (ratioAt1sPostTrigger === null && i - triggeredAtStep >= oneSecondFrames) {
            ratioAt1sPostTrigger = effectiveRatio;
          }
        }
      }
      const finalDecayExposureRad = decayExposureRadHistory[decayExposureRadHistory.length - 1];

      // 空虚な一致を禁止する: 実際に崩壊がトリガし、トリガ後の履歴が取得できていることを確認する。
      expect(triggeredAtStep, '崩壊トリガが実際に発生すること').toBeGreaterThan(0);
      expect(ratioAt1sPostTrigger, 'トリガ+1秒時点のratioが取得できていること').not.toBeNull();

      // 主張(条件1′、漸減性の直接形): 崩壊トリガ後1秒時点でratio>=0.8(段差ではないこと)。
      expect(ratioAt1sPostTrigger!, `トリガ+1秒時点のratio(${ratioAt1sPostTrigger})は0.8以上であること`).toBeGreaterThanOrEqual(0.8);

      // 主張(減衰停止): プラトー到達後(末尾側)、decayExposureRadは増加しない
      // (末尾240フレーム=2秒分が全て同一値であることで、減衰が実際に停止したことを直接確認する)。
      const tailWindow = decayExposureRadHistory.slice(-240);
      expect(tailWindow.every((v) => v === tailWindow[0]), `末尾240フレームのdecayExposureRadが一定であること(減衰停止): ${JSON.stringify([...new Set(tailWindow)])}`).toBe(true);

      // 実測値(2026-08-11計測、正式Fable補足裁定、条件1′・条件3′)を数値回帰として固定する。
      expect(triggeredAtStep, '崩壊トリガstep(回帰)').toBe(563);
      expect(ratioAt1sPostTrigger!, 'トリガ+1秒時点ratio(回帰)').toBeCloseTo(0.8914, 3);
      expect(finalRatio, 'プラトーratio(回帰、条件3′)').toBeCloseTo(0.7074, 3);
      expect(finalDecayExposureRad, 'プラトーdecayExposureRad(回帰)').toBeCloseTo(292.634, 2);
    });
  });
});

describe('P3-3ゲート2: ブラシ素材の写像(mapBrushRatios/mapD05BrushWearConfig/assembleD05Config)', () => {
  const BRUSH_D05_COMMON_PART = {
    brushSparkDurationLimitS: 0.15,
    brushSparkCurrentThresholdA: 3,
    wearPerAmpSecond: 0.001,
    recoveryFrames: 6,
    recoveryContactResistanceMultiplier: 1.2,
  };

  it('1. BRUSH_MATERIALSの全4tierに対応するmapBrushRatios/mapD05BrushWearConfigの結果が存在する(Record型網羅+実行時確認)', () => {
    for (const brush of BRUSH_MATERIALS) {
      const ratios = mapBrushRatios(brush.id);
      expect(Number.isFinite(ratios.brushContactResistanceRatio), `${brush.id}のbrushContactResistanceRatio`).toBe(true);
      expect(Number.isFinite(ratios.brushChatterProbabilityRatio), `${brush.id}のbrushChatterProbabilityRatio`).toBe(true);
      const wear = mapD05BrushWearConfig(brush.id);
      expect(Number.isFinite(wear.brushWearRateRatio), `${brush.id}のbrushWearRateRatio`).toBe(true);
      expect(['noPenalty', 'thresholdPenalty']).toContain(wear.highCurrentPenalty.kind);
      if (wear.highCurrentPenalty.kind === 'thresholdPenalty') {
        expect(Number.isFinite(wear.highCurrentPenalty.highCurrentPenaltyThresholdA), `${brush.id}のhighCurrentPenaltyThresholdA`).toBe(true);
        expect(Number.isFinite(wear.highCurrentPenalty.highCurrentPenaltyMultiplier), `${brush.id}のhighCurrentPenaltyMultiplier`).toBe(true);
      }
    }
  });

  it('2. anchor(brush-carbon)はMotorConfig層の両ratio・D05層のwearRateRatioがすべて厳密1.0、高電流ペナルティなし(kind:noPenalty)になる(正式Fable P3-3-Q15-4裁定の判別union反映)', () => {
    const ratios = mapBrushRatios('brush-carbon');
    expect(ratios).toEqual({ brushContactResistanceRatio: 1, brushChatterProbabilityRatio: 1 });
    const wear = mapD05BrushWearConfig('brush-carbon');
    expect(wear.brushWearRateRatio).toBe(1);
    expect(wear.highCurrentPenalty).toEqual({ kind: 'noPenalty' });
  });

  it('3. tierIndex順(copper-plate<carbon<silver-graphite<precious-metal)でbrushContactResistanceRatioが単調減少する(値が小さいほど低接触抵抗=良、6.3節の低電流域期待表と一致)', () => {
    const byTier = [...BRUSH_MATERIALS].sort((a, b) => a.tierIndex - b.tierIndex);
    const ratios = byTier.map((brush) => mapBrushRatios(brush.id).brushContactResistanceRatio);
    expect(ratios.every((v, i) => i === 0 || v < ratios[i - 1]), `tierIndex順の実測値: ${JSON.stringify(ratios)}`).toBe(true);
    // 正式Fable checkpoint5較正レビュー付帯条件2: 単調減少だけでなく、Q15-2裁定済みの
    // 具体値そのもの(copper-plate 1.3 > carbon 1.0 > silver-graphite 0.7 > precious-metal 0.5)
    // をtierIndex順の配列として数値回帰固定する。
    expect(ratios, `tierIndex順のbrushContactResistanceRatio配列(回帰)`).toEqual([1.3, 1, 0.7, 0.5]);
  });

  it('4. brushChatterProbabilityRatioはbrush-precious-metalのみanchorより改善し、他はanchor(1.0)から変更しない(6.2節: 記述に根拠のない比率変更をしない方針)', () => {
    expect(mapBrushRatios('brush-copper-plate').brushChatterProbabilityRatio).toBe(1);
    expect(mapBrushRatios('brush-silver-graphite').brushChatterProbabilityRatio).toBe(1);
    expect(mapBrushRatios('brush-precious-metal').brushChatterProbabilityRatio).toBeLessThan(1);
  });

  it('5. D05層のbrushWearRateRatioは、brush-copper-plateのみanchorより悪化し、brush-silver-graphiteはanchorから変更せず(低接触抵抗の利点はMotorConfig層のみで表現)、brush-precious-metalのみ低電流域で改善する', () => {
    expect(mapD05BrushWearConfig('brush-copper-plate').brushWearRateRatio).toBeGreaterThan(1);
    expect(mapD05BrushWearConfig('brush-silver-graphite').brushWearRateRatio).toBe(1);
    expect(mapD05BrushWearConfig('brush-precious-metal').brushWearRateRatio).toBeLessThan(1);
  });

  it('6. brush-precious-metalのみ高電流ペナルティ(kind:thresholdPenalty・multiplierが1超)を持ち、他3素材はkind:noPenalty(倍率1.0のため無効、という古い番兵値表現ではなく、正式Fable P3-3-Q15-4裁定の判別unionでペナルティ関連フィールド自体を持たない)である(6.3節の非線形性は唯一この素材のみが表現する)', () => {
    for (const brushId of ['brush-carbon', 'brush-copper-plate', 'brush-silver-graphite'] as const) {
      const wear = mapD05BrushWearConfig(brushId);
      expect(wear.highCurrentPenalty, brushId).toEqual({ kind: 'noPenalty' });
    }
    const preciousMetal = mapD05BrushWearConfig('brush-precious-metal');
    expect(preciousMetal.highCurrentPenalty.kind).toBe('thresholdPenalty');
    if (preciousMetal.highCurrentPenalty.kind === 'thresholdPenalty') {
      expect(Number.isFinite(preciousMetal.highCurrentPenalty.highCurrentPenaltyThresholdA)).toBe(true);
      expect(preciousMetal.highCurrentPenalty.highCurrentPenaltyMultiplier).toBeGreaterThan(1);
    }
  });

  it('7. assembleD05ConfigはmapD05BrushWearConfigの素材依存部とd05共通部を過不足なく合成し、DestructionConfig[\'d05\']の全7フィールド(highCurrentPenaltyは判別unionとして1フィールド、正式Fable P3-3-Q15-4裁定)を埋める(共通部欠落はTypeScriptの戻り値型注釈がコンパイル時に検出する契約——本テストはそのkey完全性を実行時にも交差確認する)', () => {
    for (const brush of BRUSH_MATERIALS) {
      const assembled = assembleD05Config(mapD05BrushWearConfig(brush.id), BRUSH_D05_COMMON_PART);
      expect(Object.keys(assembled).sort()).toEqual(
        ['brushSparkDurationLimitS', 'brushSparkCurrentThresholdA', 'brushWearRateRatio', 'highCurrentPenalty', 'wearPerAmpSecond', 'recoveryFrames', 'recoveryContactResistanceMultiplier'].sort(),
      );
      expect(assembled).toEqual({ ...BRUSH_D05_COMMON_PART, ...mapD05BrushWearConfig(brush.id) });
    }
  });

  it('8. 同一引数のassembleD05Config呼び出しは互いに独立したオブジェクトを返す(戻り値を呼び出し元が変更しても他の呼び出し結果を汚染しない、mapD07DestructionConfigと同じ純粋性契約)', () => {
    const a = assembleD05Config(mapD05BrushWearConfig('brush-carbon'), BRUSH_D05_COMMON_PART);
    const b = assembleD05Config(mapD05BrushWearConfig('brush-carbon'), BRUSH_D05_COMMON_PART);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    (a as { recoveryFrames: number }).recoveryFrames = 999;
    expect(b.recoveryFrames).toBe(6);
  });

  it('9. composeConfigFromMaterialsでbrushId=brush-carbonを選ぶと、motorConfigのbrushContactResistanceRatio/brushChatterProbabilityRatioがともに厳密1.0になる(旧構成〈P3-3以前、比率概念自体が存在しない状態〉と数値的に等価)', () => {
    const baseline: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 0.8 };
    const selection: MaterialSelection = {
      wireId: 'wire-copper-standard',
      magnetId: 'magnet-ferrite',
      gearId: 'gear-pom',
      batteryId: 'battery-alkaline',
      brushId: 'brush-carbon',
    };
    const baseMotor: MotorConfig = { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 0.5, magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.4, parallelStrands: 1, varnished: true };
    const baseCar: CarConfig = { massG: 150, gearEfficiency: 0.8, gearRatio: 4, wheelDiameterMm: 30, tireGrip: 0.7, axleFriction: 0, wheelAlignmentMm: 0, centerOfMassHeightMm: 20, motorMountOffsetMm: 0 };
    const result = composeConfigFromMaterials(baseMotor, baseCar, baseline, selection);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.motorConfig.brushContactResistanceRatio).toBe(1);
    expect(result.motorConfig.brushChatterProbabilityRatio).toBe(1);
  });

  it('11. assembleD05Configの出力を含む完成DestructionConfigは、全4ブラシ素材でvalidateDestructionConfigをok:trueで通過する(このテストが無ければ、highCurrentPenaltyThresholdAへNumber.POSITIVE_INFINITYを使う設計—— isPositiveFinite制約に反しvalidateDestructionConfigがok:falseを返す——という実装バグを検出できなかった。同種のvalidator境界とのミスマッチをGate2側でも直接固定する)', () => {
    for (const brush of BRUSH_MATERIALS) {
      const config: DestructionConfig = {
        battery: mapD04BatteryDestructionConfig('battery-lithium-polymer'),
        d01: { decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5, coilDeformOmegaRadS: COIL_DEFORM_OMEGA },
        d02: { smokeGaugeThreshold: 0.6, coilOverheatGaugeLimit: 1, conductionScale: 0.04, dissipationCoefficient: 0.5, smokeResistanceMultiplier: 1.2 },
        d04: { bodyScorchDeltaFraction: mapBodyScorchDeltaFraction('body-ps-cowl'), magnetScorchDeltaFraction: mapMagnetScorchDeltaFraction('magnet-neodymium') },
        d05: assembleD05Config(mapD05BrushWearConfig(brush.id), BRUSH_D05_COMMON_PART),
        d06: { breakage: { kind: 'nonBreakable' }, toothFatigueExposureNmS: 0.5 },
        d07: mapD07DestructionConfig('magnet-neodymium'),
        d09: {
        thermal: { conductionCoefficient: 0.25, dissipationCoefficient: 0.5 },
        bearingSeizureGaugeLimit: 1,
        metalGearContactAlways: false,
        highLoadHighSpeed: { loadTorqueThresholdNm: 0.2, rpmThreshold: 3000 },
        gearSeizureDeltaFraction: 0.15,
        bearingSeizureDeltaFraction: 0.2,
      },
      };
      const result = validateDestructionConfig(config);
      expect(result.ok, `${brush.id}: ${result.ok ? '' : JSON.stringify(result.invalidFields)}`).toBe(true);
    }
  });

  it('10. selection中のbrushIdが未登録の場合、部分更新されたconfigを返さず全体がok:falseになる(既存の他ファミリーと同じ規律)', () => {
    const baseline: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 0.8 };
    const badSelection: MaterialSelection = {
      wireId: 'wire-copper-standard',
      magnetId: 'magnet-ferrite',
      gearId: 'gear-pom',
      batteryId: 'battery-alkaline',
      brushId: 'brush-unknown-fixture' as BrushMaterialId,
    };
    const baseMotor: MotorConfig = { coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3, magnetStrength: 0.5, magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 0, wireGaugeMm: 0.4, parallelStrands: 1, varnished: true };
    const baseCar: CarConfig = { massG: 150, gearEfficiency: 0.8, gearRatio: 4, wheelDiameterMm: 30, tireGrip: 0.7, axleFriction: 0, wheelAlignmentMm: 0, centerOfMassHeightMm: 20, motorMountOffsetMm: 0 };
    const result = composeConfigFromMaterials(baseMotor, baseCar, baseline, badSelection);
    expect(result.ok).toBe(false);
    expect((result as { motorConfig?: unknown }).motorConfig).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// P3-4 G1a: production DestructionConfig assembler(docs/phase3-p3-4-plan.md v12 §4)
// ---------------------------------------------------------------------------
describe('materialMapping.ts: P3-4 G1a assembleDestructionConfig', () => {
  function selection(overrides: Partial<MaterialSelection> = {}): MaterialSelection {
    return {
      wireId: 'wire-copper-standard',
      magnetId: 'magnet-ferrite',
      gearId: 'gear-pom',
      batteryId: 'battery-alkaline',
      brushId: 'brush-carbon',
      ...overrides,
    };
  }

  function equipmentContext(overrides: Partial<EquipmentDestructionContext> = {}): EquipmentDestructionContext {
    return { bodyId: 'body-none', ...overrides };
  }

  it('nonLipo電池選択でbattery.profileがnonLipoになり、validateDestructionConfigがok:trueを返す完全なDestructionConfigを生成する', () => {
    const config = assembleDestructionConfig(selection({ batteryId: 'battery-alkaline' }), equipmentContext());
    expect(config.battery.profile).toBe('nonLipo');
    const result = validateDestructionConfig(config as unknown as DestructionConfigDraft);
    expect(result.ok, result.ok ? '' : JSON.stringify(result)).toBe(true);
  });

  it('lipo電池選択でbattery.profileがlipoになり、validateDestructionConfigがok:trueを返す完全なDestructionConfigを生成する', () => {
    const config = assembleDestructionConfig(selection({ batteryId: 'battery-lithium-polymer' }), equipmentContext());
    expect(config.battery.profile).toBe('lipo');
    const result = validateDestructionConfig(config as unknown as DestructionConfigDraft);
    expect(result.ok, result.ok ? '' : JSON.stringify(result)).toBe(true);
  });

  it('d01/d02/d05はdestructionCalibration.ts/mapD05BrushWearConfig由来の値をそのまま反映する', () => {
    const config = assembleDestructionConfig(selection(), equipmentContext());
    expect(config.d01).toEqual({ decayExposureScaleRad: 1000, minEffectiveTurnsRatio: 0.5, coilDeformOmegaRadS: COIL_DEFORM_OMEGA });
    expect(config.d02.conductionScale).toBeCloseTo(0.04);
    expect(config.d05.brushWearRateRatio).toBe(1); // brush-carbon anchor
  });

  it('d04.bodyScorchDeltaFractionはEquipmentDestructionContext.bodyIdに応じて変わる(body-none=0、他body>0)', () => {
    const none = assembleDestructionConfig(selection(), equipmentContext({ bodyId: 'body-none' }));
    const cowl = assembleDestructionConfig(selection(), equipmentContext({ bodyId: 'body-cardboard-cowl' }));
    expect(none.d04.bodyScorchDeltaFraction).toBe(0);
    expect(cowl.d04.bodyScorchDeltaFraction).toBeGreaterThan(0);
  });

  it('d07はselection.magnetIdに応じて変わる(neodymium=demagnetizing、ferrite=nonDemagnetizing)', () => {
    const ferrite = assembleDestructionConfig(selection({ magnetId: 'magnet-ferrite' }), equipmentContext());
    const neodymium = assembleDestructionConfig(selection({ magnetId: 'magnet-neodymium' }), equipmentContext());
    expect(ferrite.d07.irreversible.kind).toBe('nonDemagnetizing');
    expect(neodymium.d07.irreversible.kind).toBe('demagnetizing');
  });

  it('全gear素材(pom/nylon-pa6/peek/titanium)×代表selectionで完全なDestructionConfigを生成しvalidateDestructionConfigを通す', () => {
    const gearIds: GearMaterialId[] = ['gear-pom', 'gear-nylon-pa6', 'gear-peek', 'gear-titanium'];
    for (const gearId of gearIds) {
      const config = assembleDestructionConfig(selection({ gearId }), equipmentContext());
      const result = validateDestructionConfig(config as unknown as DestructionConfigDraft);
      expect(result.ok, `${gearId}: ${result.ok ? '' : JSON.stringify(result)}`).toBe(true);
    }
  });
});

describe('materialMapping.ts: P3-4 G1a mapD06DestructionConfig(§6.3)', () => {
  it('gear-titaniumはnonBreakableを返す(gearStrengthThresholdNmを持たない)', () => {
    // P3-4 G3: toothFatigueExposureNmS(§9.1候補b)が追加された。nonBreakableでも型の全域性の
    // ため値は持つが、advanceD06はnonBreakableの時点で発火判定へ進まないため消費されない。
    // G-R3(2026-08-19人間再承認): toothFatigueExposureNmSを0.5→0.0100へ再較正した。
    expect(mapD06DestructionConfig('gear-titanium')).toEqual({ breakage: { kind: 'nonBreakable' }, toothFatigueExposureNmS: 0.01 });
  });

  it('gear-pom/gear-nylon-pa6/gear-peekはbreakableで正の有限なgearStrengthThresholdNmを持つ', () => {
    const gearIds: Exclude<GearMaterialId, 'gear-titanium'>[] = ['gear-pom', 'gear-nylon-pa6', 'gear-peek'];
    for (const gearId of gearIds) {
      const result = mapD06DestructionConfig(gearId);
      expect(result.breakage.kind).toBe('breakable');
      if (result.breakage.kind === 'breakable') {
        expect(Number.isFinite(result.breakage.gearStrengthThresholdNm)).toBe(true);
        expect(result.breakage.gearStrengthThresholdNm).toBeGreaterThan(0);
      }
    }
  });

  it('POM<PA6<PEEKのティア順序を維持する(§17.3較正候補)', () => {
    const pom = mapD06DestructionConfig('gear-pom');
    const pa6 = mapD06DestructionConfig('gear-nylon-pa6');
    const peek = mapD06DestructionConfig('gear-peek');
    if (pom.breakage.kind === 'breakable' && pa6.breakage.kind === 'breakable' && peek.breakage.kind === 'breakable') {
      expect(pom.breakage.gearStrengthThresholdNm).toBeLessThan(pa6.breakage.gearStrengthThresholdNm);
      expect(pa6.breakage.gearStrengthThresholdNm).toBeLessThan(peek.breakage.gearStrengthThresholdNm);
    }
  });
});

describe('materialMapping.ts: P3-4 G4 mapD09DestructionConfig(§7.2の最終形)', () => {
  const ALL_GEARS: GearMaterialId[] = ['gear-pom', 'gear-nylon-pa6', 'gear-peek', 'gear-titanium'];

  it('全gear素材で全フィールドが有限・正の値域を満たす', () => {
    for (const gearId of ALL_GEARS) {
      const result = mapD09DestructionConfig(gearId);
      expect(result.bearingSeizureGaugeLimit).toBeGreaterThan(0);
      expect(result.thermal.conductionCoefficient).toBeGreaterThan(0);
      expect(result.thermal.dissipationCoefficient).toBeGreaterThan(0);
      expect(result.highLoadHighSpeed.loadTorqueThresholdNm).toBeGreaterThan(0);
      expect(result.highLoadHighSpeed.rpmThreshold).toBeGreaterThan(0);
      // deltaFractionはD07のdemagnetizationDeltaFractionと同じ(0,1]の値域規律。
      expect(result.gearSeizureDeltaFraction).toBeGreaterThan(0);
      expect(result.gearSeizureDeltaFraction).toBeLessThanOrEqual(1);
      expect(result.bearingSeizureDeltaFraction).toBeGreaterThan(0);
      expect(result.bearingSeizureDeltaFraction).toBeLessThanOrEqual(1);
      for (const v of Object.values(result.thermal)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('metalGearContactAlwaysは金属ギヤ(チタン)のみtrue、樹脂3種はfalse(G4でgearIdを実際に消費)', () => {
    // **engineは素材IDを知らない**(leaf規則)ため、金属/樹脂の判別は本写像層が担い、
    // engineへはbooleanのみが渡る。spec §7.1「金属ギヤかじり含む」の実装位置。
    expect(mapD09DestructionConfig('gear-titanium').metalGearContactAlways).toBe(true);
    for (const gearId of ['gear-pom', 'gear-nylon-pa6', 'gear-peek'] as GearMaterialId[]) {
      expect(mapD09DestructionConfig(gearId).metalGearContactAlways).toBe(false);
    }
  });

  it('metalGearContactAlways以外のフィールドはgearId非依存である(全素材共通の較正値)', () => {
    const results = ALL_GEARS.map((gearId) => {
      const { metalGearContactAlways: _ignored, ...rest } = mapD09DestructionConfig(gearId);
      return rest;
    });
    for (const r of results) expect(r).toEqual(results[0]);
  });

  it('G4再較正(2026-08-19人間承認)のexact値をpinする: 0.005 N·m / 400 rpm(車軸) / limit 0.15', () => {
    // 旧候補値(0.2 N·m / 3000 rpm / limit 1.0)は両側拘束sweepで構造的に到達不能と実測された。
    // 本pinはG4暫定較正の固定であり、G5最終較正(Q15-1恒久規則)を先取りするものではない。
    const result = mapD09DestructionConfig('gear-pom');
    expect(result.highLoadHighSpeed.loadTorqueThresholdNm).toBe(0.005);
    expect(result.highLoadHighSpeed.rpmThreshold).toBe(400);
    expect(result.bearingSeizureGaugeLimit).toBe(0.15);
    // 承認範囲外の値が同時に動いていないことも同じpinで押さえる(熱係数・deltaFractionは不変)。
    expect(result.thermal).toEqual({ conductionCoefficient: 0.25, dissipationCoefficient: 0.5 });
    expect(result.gearSeizureDeltaFraction).toBe(0.15);
    expect(result.bearingSeizureDeltaFraction).toBe(0.2);
  });

  it('純関数: 同一gearIdの2回呼び出しが等価な値を返す', () => {
    for (const gearId of ALL_GEARS) {
      expect(mapD09DestructionConfig(gearId)).toEqual(mapD09DestructionConfig(gearId));
    }
  });
});

// ---------------------------------------------------------------------------
// G-R3(D06閾値の再較正、2026-08-19人間再承認済み)
// ---------------------------------------------------------------------------

describe('materialMapping.ts: G-R3 D06閾値の再較正', () => {
  const LOWER_BOUND = 0.003080; // NORMAL_OPERATION 15組合せの max|loadTorqueNm| 最大(実測)
  const UPPER_BOUND = 0.013544; // production-valid攻め構成の max|loadTorqueNm|(実測)
  const EXPOSURE = 0.01;

  function threshold(gearId: 'gear-pom' | 'gear-nylon-pa6' | 'gear-peek'): number {
    const cfg = mapD06DestructionConfig(gearId);
    if (cfg.breakage.kind !== 'breakable') throw new Error(`${gearId}はbreakableであること`);
    return cfg.breakage.gearStrengthThresholdNm;
  }

  it.each([
    ['gear-pom', 0.005],
    ['gear-nylon-pa6', 0.00726],
    ['gear-peek', 0.0079],
  ])('%sの閾値が承認済み確定値である', (id, expected) => {
    expect(threshold(id as 'gear-pom')).toBe(expected);
  });

  it('toothFatigueExposureNmSが承認済み確定値0.0100である(全素材共通)', () => {
    for (const id of ['gear-pom', 'gear-nylon-pa6', 'gear-peek', 'gear-titanium'] as const) {
      expect(mapD06DestructionConfig(id).toothFatigueExposureNmS).toBe(EXPOSURE);
    }
  });

  // 両側拘束(裁定■2): 通常運用では発火せず、攻めた構成では有限到達できること。
  it.each([['gear-pom'], ['gear-nylon-pa6'], ['gear-peek']])(
    '%sの閾値がNORMAL_OPERATION下限より上・production攻め上限より下にある(両側拘束)',
    (id) => {
      const t = threshold(id as 'gear-pom');
      expect(t, `${id}: 通常運用(最大${LOWER_BOUND})では発火しないこと`).toBeGreaterThan(LOWER_BOUND);
      expect(t, `${id}: 攻め構成(上限${UPPER_BOUND})では到達可能であること`).toBeLessThan(UPPER_BOUND);
    },
  );

  // 相対比のアンカー(裁定■1条件1): 引張降伏応力 POM 62 / PA6 90 / PEEK 98.0 MPa の比。
  it('閾値の相対比が実素材の引張降伏応力比(62:90:98)と0.1%以内で一致する', () => {
    const pom = threshold('gear-pom');
    expect(threshold('gear-nylon-pa6') / pom).toBeCloseTo(90 / 62, 2);
    expect(threshold('gear-peek') / pom).toBeCloseTo(98.0 / 62, 2);
    // 誤差が0.1%以内であることを直接固定する(比率は教育的価値の担い手のため)
    expect(Math.abs(threshold('gear-nylon-pa6') / pom / (90 / 62) - 1)).toBeLessThan(0.001);
    expect(Math.abs(threshold('gear-peek') / pom / (98.0 / 62) - 1)).toBeLessThan(0.001);
  });

  it('素材の強弱順序が保たれる(POM < PA6 < PEEK、強い素材ほど壊れにくい)', () => {
    expect(threshold('gear-pom')).toBeLessThan(threshold('gear-nylon-pa6'));
    expect(threshold('gear-nylon-pa6')).toBeLessThan(threshold('gear-peek'));
  });

  // 理論1本目時間(計画§9(2)「0.5〜10秒」)。上限を持続した場合の下限側の時間。
  it.each([
    ['gear-pom', 1.170],
    ['gear-nylon-pa6', 1.591],
    ['gear-peek', 1.772],
  ])('%sの理論1本目時間が承認時の実測値と一致し、0.5〜10秒の範囲に収まる', (id, expectedS) => {
    const t = EXPOSURE / (UPPER_BOUND - threshold(id as 'gear-pom'));
    expect(t).toBeCloseTo(expectedS as number, 2);
    expect(t).toBeGreaterThan(0.5);
    expect(t).toBeLessThan(10);
  });

  // 裁定■1条件3: チタンは構造腕のまま(数値閾値化しない)。
  it('gear-titaniumはnonBreakableの構造腕のままであり、数値閾値を持たない(spec §7.1)', () => {
    const cfg = mapD06DestructionConfig('gear-titanium');
    expect(cfg.breakage.kind).toBe('nonBreakable');
    expect('gearStrengthThresholdNm' in cfg.breakage).toBe(false);
  });

  // 過剰設計防止(裁定■停止条件): 強度フィールド・湿度状態を素材へ追加していないこと。
  it('GearMaterialへ強度フィールド・湿度状態を追加していない(過剰設計防止)', () => {
    for (const gear of GEAR_MATERIALS) {
      const keys = Object.keys(gear);
      expect(keys).not.toContain('flexuralStrength');
      expect(keys).not.toContain('tensileStrength');
      expect(keys).not.toContain('yieldStress');
      expect(keys).not.toContain('humidity');
      expect(keys).not.toContain('moistureState');
    }
  });
});
