import { R_COMMUTATOR_MM } from './constants';

const TWO_PI = Math.PI * 2;

function normalizeAngle(theta: number): number {
  const wrapped = theta % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

// spec §3.2: θが半回転(π)ごとに電流方向が反転する
export function getCommutationSign(theta: number): 1 | -1 {
  const normalized = normalizeAngle(theta);
  return normalized < Math.PI ? 1 : -1;
}

// spec §3.2: deadZoneRad = slitWidthMm / R_COMMUTATOR_MM。
// 整流の切り替わり角度(0, π)付近 ±deadZoneRad/2 をデッドゾーンとする。
export function isInDeadZone(theta: number, slitWidthMm: number): boolean {
  if (slitWidthMm <= 0) return false; // ショート時はdeadZoneではなくshortedフラグ側で扱う
  const deadZoneRad = slitWidthMm / R_COMMUTATOR_MM;
  const halfWidth = deadZoneRad / 2;
  const normalized = normalizeAngle(theta);
  const distanceToZero = Math.min(normalized, TWO_PI - normalized);
  const distanceToPi = Math.abs(normalized - Math.PI);
  return distanceToZero <= halfWidth || distanceToPi <= halfWidth;
}
