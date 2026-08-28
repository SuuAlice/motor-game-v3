// P3-0(docs/phase3-p3-0-plan.md v7 8.1節)。附録A.3の適用関数群をテストする。
import { describe, expect, it } from 'vitest';
import {
  applyBearingDiff,
  applyBodyDiff,
  applyBrushDiff,
  applyGearDiff,
  applyMagnetDiff,
  applyRotorDiff,
  computeCompositeGearDamageFraction,
} from '../degradationApplication';
import type { BearingAssemblyState, BodyPartState, RotorAssemblyState, WearState } from '../inventoryItem';
import { GEAR_TOTAL_TOOTH_COUNT } from '../inventoryItem';
import type { DegradationDiff } from '../../engine/destructionOrchestration';

describe('degradationApplication.ts: computeCompositeGearDamageFraction(補完乗算合成)', () => {
  it('1. toothLossCount=0・seizureFraction=0のとき0を返す', () => {
    const wearState: Extract<WearState, { kind: 'gear' }> = { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 0, seizureFraction: 0 };
    expect(computeCompositeGearDamageFraction(wearState)).toBe(0);
  });

  it('2. toothLossCount=totalToothCount(全損)のとき1を返す(seizureFraction=0でも)', () => {
    const wearState: Extract<WearState, { kind: 'gear' }> = { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: GEAR_TOTAL_TOOTH_COUNT, seizureFraction: 0 };
    expect(computeCompositeGearDamageFraction(wearState)).toBe(1);
  });

  it('3. seizureFraction=1のとき1を返す(toothLossCount=0でも)', () => {
    const wearState: Extract<WearState, { kind: 'gear' }> = { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 0, seizureFraction: 1 };
    expect(computeCompositeGearDamageFraction(wearState)).toBe(1);
  });

  it('4. 中間値(toothLossCount=5/10, seizureFraction=0.5)は補完乗算式どおり0.75になる', () => {
    const wearState: Extract<WearState, { kind: 'gear' }> = { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 5, seizureFraction: 0.5 };
    // 1 - (1-0.5)*(1-0.5) = 1 - 0.25 = 0.75
    expect(computeCompositeGearDamageFraction(wearState)).toBeCloseTo(0.75, 10);
  });
});

describe('degradationApplication.ts: applyMagnetDiff(scorch+demagnetizationの共有適用先)', () => {
  it('5. demagnetizationのdeltaFractionが現在値へ加算される', () => {
    const diff: Extract<DegradationDiff, { role: 'magnet' }> = { role: 'magnet', kind: 'demagnetization', deltaFraction: 0.2 };
    const current: Extract<WearState, { kind: 'magnet' }> = { kind: 'magnet', demagnetizationFraction: 0.1 };
    const result = applyMagnetDiff(diff, current);
    expect(result.kind).toBe('magnet');
    expect(result.demagnetizationFraction).toBeCloseTo(0.3, 10);
  });

  it('6. scorchのdeltaFractionも同じdemagnetizationFractionへ加算される', () => {
    const diff: Extract<DegradationDiff, { role: 'magnet' }> = { role: 'magnet', kind: 'scorch', deltaFraction: 0.2 };
    const current: Extract<WearState, { kind: 'magnet' }> = { kind: 'magnet', demagnetizationFraction: 0.1 };
    const result = applyMagnetDiff(diff, current);
    expect(result.kind).toBe('magnet');
    expect(result.demagnetizationFraction).toBeCloseTo(0.3, 10);
  });

  it('7. scorch+demagnetizationの2diffを順に適用すると両方が合算される(同一runでの2 kind共存)', () => {
    let current: Extract<WearState, { kind: 'magnet' }> = { kind: 'magnet', demagnetizationFraction: 0 };
    current = applyMagnetDiff({ role: 'magnet', kind: 'scorch', deltaFraction: 0.1 }, current);
    current = applyMagnetDiff({ role: 'magnet', kind: 'demagnetization', deltaFraction: 0.15 }, current);
    expect(current.demagnetizationFraction).toBeCloseTo(0.25, 10);
  });

  it('8. 上限1.0を超える加算は1.0へclampされる', () => {
    const diff: Extract<DegradationDiff, { role: 'magnet' }> = { role: 'magnet', kind: 'demagnetization', deltaFraction: 0.5 };
    const current: Extract<WearState, { kind: 'magnet' }> = { kind: 'magnet', demagnetizationFraction: 0.8 };
    expect(applyMagnetDiff(diff, current)).toEqual({ kind: 'magnet', demagnetizationFraction: 1 });
  });
});

describe('degradationApplication.ts: applyGearDiff', () => {
  it('9. toothLossのdeltaCountがtoothLossCountへ加算される', () => {
    const diff: Extract<DegradationDiff, { role: 'gear' }> = { role: 'gear', kind: 'toothLoss', deltaCount: 3 };
    const current: Extract<WearState, { kind: 'gear' }> = { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 2, seizureFraction: 0 };
    expect(applyGearDiff(diff, current)).toEqual({ kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 5, seizureFraction: 0 });
  });

  it('10. toothLossCountはtotalToothCountを超過しない(clamp)', () => {
    const diff: Extract<DegradationDiff, { role: 'gear' }> = { role: 'gear', kind: 'toothLoss', deltaCount: 100 };
    const current: Extract<WearState, { kind: 'gear' }> = { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 0, seizureFraction: 0 };
    expect(applyGearDiff(diff, current).toothLossCount).toBe(GEAR_TOTAL_TOOTH_COUNT);
  });

  it('11. seizureのdeltaFractionがseizureFractionへ加算される(toothLossCountは不変)', () => {
    const diff: Extract<DegradationDiff, { role: 'gear' }> = { role: 'gear', kind: 'seizure', deltaFraction: 0.3 };
    const current: Extract<WearState, { kind: 'gear' }> = { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 2, seizureFraction: 0.1 };
    expect(applyGearDiff(diff, current)).toEqual({ kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 2, seizureFraction: 0.4 });
  });
});

describe('degradationApplication.ts: applyBrushDiff / applyRotorDiff / applyBodyDiff / applyBearingDiff', () => {
  it('12. brush wearのdeltaFractionが加算されclampされる', () => {
    const diff: Extract<DegradationDiff, { role: 'brush' }> = { role: 'brush', kind: 'wear', deltaFraction: 0.9 };
    const current: Extract<WearState, { kind: 'brush' }> = { kind: 'brush', wearFraction: 0.5 };
    expect(applyBrushDiff(diff, current)).toEqual({ kind: 'brush', wearFraction: 1 });
  });

  it('13. rotor collapseはcollapsedフラグをtrueにし、burnedOutは変更しない', () => {
    const diff: Extract<DegradationDiff, { role: 'rotor' }> = { role: 'rotor', kind: 'collapse' };
    const current: RotorAssemblyState = { assemblyId: 'r1', sourceWireMaterialId: 'wire-copper-standard', consumedWireM: 1, collapsed: false, burnedOut: false, winding: { kind: 'legacy' }, coatingDamageFraction: 0 };
    expect(applyRotorDiff(diff, current)).toEqual({ ...current, collapsed: true });
  });

  it('14. rotor burnoutはburnedOutフラグをtrueにする', () => {
    const diff: Extract<DegradationDiff, { role: 'rotor' }> = { role: 'rotor', kind: 'burnout' };
    const current: RotorAssemblyState = { assemblyId: 'r1', sourceWireMaterialId: 'wire-copper-standard', consumedWireM: 1, collapsed: false, burnedOut: false, winding: { kind: 'legacy' }, coatingDamageFraction: 0 };
    expect(applyRotorDiff(diff, current)).toEqual({ ...current, burnedOut: true });
  });

  it('15. body scorchのdeltaFractionが加算される', () => {
    const diff: Extract<DegradationDiff, { role: 'body' }> = { role: 'body', kind: 'scorch', deltaFraction: 0.2 };
    const current: BodyPartState = { assemblyId: 'b1', materialId: 'body-cardboard-cowl', scorchFraction: 0.1 };
    const result = applyBodyDiff(diff, current);
    expect(result.assemblyId).toBe('b1');
    expect(result.materialId).toBe('body-cardboard-cowl');
    expect(result.scorchFraction).toBeCloseTo(0.3, 10);
  });

  it('16. bearing seizureのdeltaFractionが加算される', () => {
    const diff: Extract<DegradationDiff, { role: 'bearing' }> = { role: 'bearing', kind: 'seizure', deltaFraction: 0.4 };
    const current: BearingAssemblyState = { assemblyId: 'be1', gearItemId: 'g1', seizureFraction: 0.1 };
    expect(applyBearingDiff(diff, current)).toEqual({ ...current, seizureFraction: 0.5 });
  });
});
