import { describe, expect, it } from 'vitest';
import { combineGearEfficiency, computeGearMaterialEfficiencyRatio, computeMagnetStrengthCalibration } from '../materialMapping';
import { GEAR_MATERIALS, MAGNET_MATERIALS } from '../materials';

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
