import { describe, expect, it } from 'vitest';
import {
  MAGNET_DIAMETER_M,
  MAGNET_THICKNESS_M,
  WINDING_MEAN_RADIUS_M,
  applyMassAdjustmentToBaselineG,
  computeMagnetVolumeM3,
  computeMassDeltaG,
  computeWireMagnetMassAdjustmentG,
  computeWireVolumeM3,
  resolveChassisBaselineG,
  resolveMagnetDensity,
  resolveWireDensity,
  type ResolvedMassDensity,
  type WindingParams,
} from '../assumedGeometry';
import { MAGNET_MATERIALS, WIRE_MATERIALS, type MagnetMaterial, type WireMaterial } from '../materials';

const COPPER_WIRE = WIRE_MATERIALS.find((m) => m.id === 'wire-copper-standard')!;
const ALUMINUM_WIRE = WIRE_MATERIALS.find((m) => m.id === 'wire-aluminum')!;
const SILVER_WIRE = WIRE_MATERIALS.find((m) => m.id === 'wire-silver')!;
const SILVER_PLATED_WIRE = WIRE_MATERIALS.find((m) => m.id === 'wire-silver-plated-copper')!;
const FERRITE_MAGNET = MAGNET_MATERIALS.find((m) => m.id === 'magnet-ferrite')!;

const REPRESENTATIVE_WINDING: WindingParams = { coilTurns: 100, wireGaugeMm: 0.4, parallelStrands: 1 };

function densityOf(wire: WireMaterial): ResolvedMassDensity {
  const resolved = resolveWireDensity(wire);
  if (!resolved.ok) throw new Error(`test setup failure: ${wire.id} did not resolve`);
  return resolved.value;
}

describe('assumedGeometry.ts Step2a(導線・磁石の質量差分)', () => {
  describe('computeWireVolumeM3: 方向性テスト', () => {
    it('coilTurnsに対して線形に増加する', () => {
      const base = computeWireVolumeM3({ coilTurns: 100, wireGaugeMm: 0.4, parallelStrands: 1 });
      const doubled = computeWireVolumeM3({ coilTurns: 200, wireGaugeMm: 0.4, parallelStrands: 1 });
      expect(doubled).toBeCloseTo(base * 2, 10);
    });

    it('wireGaugeMmに対して2乗で増加する(断面積∝径²)', () => {
      const base = computeWireVolumeM3({ coilTurns: 100, wireGaugeMm: 0.4, parallelStrands: 1 });
      const doubledGauge = computeWireVolumeM3({ coilTurns: 100, wireGaugeMm: 0.8, parallelStrands: 1 });
      expect(doubledGauge).toBeCloseTo(base * 4, 6);
    });

    it('parallelStrandsに対して線形に増加する', () => {
      const single = computeWireVolumeM3({ coilTurns: 100, wireGaugeMm: 0.4, parallelStrands: 1 });
      const double = computeWireVolumeM3({ coilTurns: 100, wireGaugeMm: 0.4, parallelStrands: 2 });
      expect(double).toBeCloseTo(single * 2, 10);
    });

    it('既知値: lengthM=coilTurns×2π×0.007、crossSectionM2=π×(gauge/1000/2)²、volume=length×cross×strands', () => {
      const params: WindingParams = { coilTurns: 50, wireGaugeMm: 0.4, parallelStrands: 1 };
      const expectedLengthM = 50 * 2 * Math.PI * 0.007;
      const expectedRadiusM = 0.4 / 1000 / 2;
      const expectedCrossSectionM2 = Math.PI * expectedRadiusM * expectedRadiusM;
      const expectedVolumeM3 = expectedLengthM * expectedCrossSectionM2 * 1;
      expect(computeWireVolumeM3(params)).toBeCloseTo(expectedVolumeM3, 15);
    });
  });

  describe('computeMagnetVolumeM3: 既知値・定数の確認', () => {
    it('円柱近似 V = π×(d/2)²×t×個数 と一致する', () => {
      const expected = Math.PI * (MAGNET_DIAMETER_M / 2) ** 2 * MAGNET_THICKNESS_M * 1;
      expect(computeMagnetVolumeM3()).toBeCloseTo(expected, 15);
    });

    it('採用値は直径10mm・厚さ3mm(2026-07-22 Suu承認)', () => {
      expect(MAGNET_DIAMETER_M).toBeCloseTo(0.01, 10);
      expect(MAGNET_THICKNESS_M).toBeCloseTo(0.003, 10);
    });
  });

  it('平均巻き半径は2026-07-22 Suu承認値7mmである', () => {
    expect(WINDING_MEAN_RADIUS_M).toBeCloseTo(0.007, 10);
  });

  describe('computeMassDeltaG: 符号の正しさ', () => {
    it('anchorより高密度の材質は正の差分になる(銀 > 銅)', () => {
      const delta = computeMassDeltaG(densityOf(SILVER_WIRE), densityOf(COPPER_WIRE), 1e-9);
      expect(delta).toBeGreaterThan(0);
    });

    it('anchorより低密度の材質は負の差分になる(アルミ < 銅)', () => {
      const delta = computeMassDeltaG(densityOf(ALUMINUM_WIRE), densityOf(COPPER_WIRE), 1e-9);
      expect(delta).toBeLessThan(0);
    });

    it('anchor同士は差分ゼロになる', () => {
      const delta = computeMassDeltaG(densityOf(COPPER_WIRE), densityOf(COPPER_WIRE), 1e-9);
      expect(delta).toBe(0);
    });
  });

  describe('resolveWireDensity / resolveMagnetDensity: verified/pending判別・provenance区別', () => {
    it('銅(anchor)はcatalogVerifiedとして解決される', () => {
      const result = resolveWireDensity(COPPER_WIRE);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.provenance).toBe('catalogVerified');
    });

    it('磁石4ティア全てがcatalogVerifiedとして解決される(Unit1で全て確認済み)', () => {
      for (const magnet of MAGNET_MATERIALS) {
        const result = resolveMagnetDensity(magnet);
        expect(result.ok, `${magnet.id}が解決できません`).toBe(true);
        if (result.ok) expect(result.value.provenance).toBe('catalogVerified');
      }
    });

    it('銀メッキ銅線はdesignAssumption(銅密度代用)として解決され、materials.ts側のpending値は書き換わっていない', () => {
      // materials.ts自体は不変であることを確認(Suu指摘9)
      expect(SILVER_PLATED_WIRE.density.verifiedForPhysics).toBe(false);
      // assumedGeometry.ts側の解決結果はdesignAssumption(銀メッキ線自身が一次資料確認された
      // わけではない、という区別を型で表す。2026-07-22再レビュー指摘1)
      const resolved = resolveWireDensity(SILVER_PLATED_WIRE);
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value.provenance).toBe('designAssumption');
        expect(resolved.value.value).toBe(densityOf(COPPER_WIRE).value);
        expect(resolved.value.citation.sourceKind).toContain('設計仮定');
      }
    });

    it('(実行時Result) pendingな密度を持つ合成材料はok:falseで拒否される(型レベルの主張ではなく実行時テスト)', () => {
      const pendingWire: WireMaterial = {
        ...COPPER_WIRE,
        id: 'wire-test-fixture-pending',
        density: { verifiedForPhysics: false, status: 'pending', reason: 'テスト用fixture' },
      };
      const result = resolveWireDensity(pendingWire);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('resolveChassisBaselineG: 電池本数を推測しない判別型', () => {
    it('one-cellは135g(標準シャーシ110g+電池1本25g)、two-cellは150g(標準シャーシ110g+電池2本の合計40g)を返す', () => {
      expect(resolveChassisBaselineG('one-cell')).toBe(135);
      expect(resolveChassisBaselineG('two-cell')).toBe(150);
    });
  });

  describe('applyMassAdjustmentToBaselineG: [80,250]gの実行時ガード(clampせず明示失敗)', () => {
    it('anchor構成相当(delta=0)ではbaselineがそのまま返る', () => {
      expect(applyMassAdjustmentToBaselineG(135, 0)).toEqual({ ok: true, massG: 135 });
      expect(applyMassAdjustmentToBaselineG(150, 0)).toEqual({ ok: true, massG: 150 });
    });

    it('下限(80g)を下回る場合はclampせずok:falseを返す', () => {
      const result = applyMassAdjustmentToBaselineG(135, -100);
      expect(result.ok).toBe(false);
    });

    it('上限(250g)を上回る場合はclampせずok:falseを返す', () => {
      const result = applyMassAdjustmentToBaselineG(135, 200);
      expect(result.ok).toBe(false);
    });

    it('NaN/Infiniteな入力はok:falseを返す', () => {
      expect(applyMassAdjustmentToBaselineG(135, Number.NaN).ok).toBe(false);
      expect(applyMassAdjustmentToBaselineG(135, Number.POSITIVE_INFINITY).ok).toBe(false);
      expect(applyMassAdjustmentToBaselineG(Number.NaN, 0).ok).toBe(false);
    });

    it('範囲内(境界値80g・250gちょうど)はok:trueを返す', () => {
      expect(applyMassAdjustmentToBaselineG(0, 80)).toEqual({ ok: true, massG: 80 });
      expect(applyMassAdjustmentToBaselineG(0, 250)).toEqual({ ok: true, massG: 250 });
    });
  });

  describe('computeWireMagnetMassAdjustmentG: 入力検証(clampせず明示失敗)', () => {
    it('coilTurnsが非整数の場合は失敗', () => {
      const result = computeWireMagnetMassAdjustmentG(COPPER_WIRE, FERRITE_MAGNET, { coilTurns: 10.5, wireGaugeMm: 0.4, parallelStrands: 1 });
      expect(result.ok).toBe(false);
    });

    it('coilTurnsが0以下の場合は失敗', () => {
      const result = computeWireMagnetMassAdjustmentG(COPPER_WIRE, FERRITE_MAGNET, { coilTurns: 0, wireGaugeMm: 0.4, parallelStrands: 1 });
      expect(result.ok).toBe(false);
    });

    it('wireGaugeMmが非有限・非正の場合は失敗', () => {
      expect(computeWireMagnetMassAdjustmentG(COPPER_WIRE, FERRITE_MAGNET, { coilTurns: 100, wireGaugeMm: 0, parallelStrands: 1 }).ok).toBe(false);
      expect(
        computeWireMagnetMassAdjustmentG(COPPER_WIRE, FERRITE_MAGNET, { coilTurns: 100, wireGaugeMm: Number.NaN, parallelStrands: 1 }).ok,
      ).toBe(false);
    });

    it('parallelStrandsが1・2以外の場合は失敗', () => {
      const invalidParams = { coilTurns: 100, wireGaugeMm: 0.4, parallelStrands: 3 } as unknown as WindingParams;
      const result = computeWireMagnetMassAdjustmentG(COPPER_WIRE, FERRITE_MAGNET, invalidParams);
      expect(result.ok).toBe(false);
    });

    it('pendingな密度を持つ合成材料を渡すとok:falseで明示的に失敗する(anchorと同質量に偽装しない)', () => {
      const pendingMagnet: MagnetMaterial = {
        ...FERRITE_MAGNET,
        id: 'magnet-test-fixture-pending',
        density: { verifiedForPhysics: false, status: 'pending', reason: 'テスト用fixture' },
      };
      const result = computeWireMagnetMassAdjustmentG(COPPER_WIRE, pendingMagnet, REPRESENTATIVE_WINDING);
      expect(result.ok).toBe(false);
    });
  });

  describe('computeWireMagnetMassAdjustmentG: anchor構成での厳密ゼロ再現', () => {
    it('銅×フェライト(anchor同士)はcoilTurns/gaugeによらず常にdeltaG=0', () => {
      for (const coilTurns of [10, 100, 500]) {
        for (const wireGaugeMm of [0.2, 0.4, 0.8]) {
          const result = computeWireMagnetMassAdjustmentG(COPPER_WIRE, FERRITE_MAGNET, { coilTurns, wireGaugeMm, parallelStrands: 1 });
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.deltaG).toBe(0);
        }
      }
    });

    it('anchor構成ではapplyMassAdjustmentToBaselineG経由でV2基準massGがそのまま再現される(135g/150g)', () => {
      const adjustment = computeWireMagnetMassAdjustmentG(COPPER_WIRE, FERRITE_MAGNET, REPRESENTATIVE_WINDING);
      expect(adjustment.ok).toBe(true);
      if (adjustment.ok) {
        expect(applyMassAdjustmentToBaselineG(resolveChassisBaselineG('one-cell'), adjustment.deltaG)).toEqual({ ok: true, massG: 135 });
        expect(applyMassAdjustmentToBaselineG(resolveChassisBaselineG('two-cell'), adjustment.deltaG)).toEqual({ ok: true, massG: 150 });
      }
    });
  });

  it(
    '(暫定安全域チェック。代表巻線1点・導線4ティア×磁石4ティアの16組合せのみで、巻数/線径の全域sweepではない。' +
      '全素材質量の完成保証でもない) 各組合せでbaseline+deltaGが既存clamp[80,250]g内に収まる',
    () => {
      for (const wire of WIRE_MATERIALS) {
        for (const magnet of MAGNET_MATERIALS) {
          const result = computeWireMagnetMassAdjustmentG(wire, magnet, REPRESENTATIVE_WINDING);
          expect(result.ok, `${wire.id}×${magnet.id}が解決できません`).toBe(true);
          if (result.ok) {
            const guarded = applyMassAdjustmentToBaselineG(resolveChassisBaselineG('one-cell'), result.deltaG);
            expect(guarded.ok, `${wire.id}×${magnet.id}: ${!guarded.ok ? guarded.reason : ''}`).toBe(true);
          }
        }
      }
    },
  );

  // 型レベルの拒否(computeMassDeltaGがResolvedMassDensity以外を受け付けないこと)は
  // ResolvedMassDensity/PendingNumericValueの構造的な型定義とtscビルド成功で担保する。
  // if (false)ブロックでの@ts-expect-errorはunreachable code解析により型検査自体が
  // 素通りし「エラーなし」と誤判定されたため、信頼できない型テストとして削除した
  // (2026-07-22再レビュー指摘3)。
});
