import { computeMaxTurns, type MotorConfig } from '../engine/motorPhysics';

const PREFIX = 'M15-';

export interface MotorRecipe {
  config: MotorConfig;
  seed: number;
}

export class RecipeCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeCodeError';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new RecipeCodeError('ペイロードに使用できない文字が含まれています。');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new RecipeCodeError('ペイロードを読み取れません。');
  }
}

function normalizeConfig(values: unknown[]): MotorConfig {
  const numberAt = (index: number, fallback: number) => typeof values[index] === 'number' ? values[index] : fallback;
  const wireGaugeMm = Math.round(clamp(numberAt(9, 0.4), 0.2, 0.8) * 10) / 10;
  const parallelStrands: 1 | 2 = numberAt(10, 1) >= 1.5 ? 2 : 1;
  const maxTurns = computeMaxTurns(wireGaugeMm, parallelStrands);
  const batteryVoltage: 1.5 | 3.0 = numberAt(7, 3) < 2.25 ? 1.5 : 3.0;
  return {
    coilTurns: Math.round(clamp(numberAt(1, 80), 10, maxTurns)),
    slitWidthMm: clamp(numberAt(2, 1.5), 0, 5),
    sandingQuality: clamp(numberAt(3, 0.9), 0, 1),
    brushPressure: clamp(numberAt(4, 0.3), 0, 1),
    magnetStrength: clamp(numberAt(5, 0.9), 0, 1),
    magnetDistanceMm: clamp(numberAt(6, 10), 2, 30),
    batteryVoltage,
    axisOffsetMm: clamp(numberAt(8, 0), 0, 3),
    wireGaugeMm,
    parallelStrands,
    varnished: typeof values[11] === 'boolean' ? values[11] : true,
  };
}

export function encodeRecipe(recipe: MotorRecipe): string {
  const config = normalizeConfig([
    1,
    recipe.config.coilTurns,
    recipe.config.slitWidthMm,
    recipe.config.sandingQuality,
    recipe.config.brushPressure,
    recipe.config.magnetStrength,
    recipe.config.magnetDistanceMm,
    recipe.config.batteryVoltage,
    recipe.config.axisOffsetMm,
    recipe.config.wireGaugeMm ?? 0.4,
    recipe.config.parallelStrands ?? 1,
    recipe.config.varnished ?? true,
  ]);
  const serialized = JSON.stringify([
    1,
    config.coilTurns,
    config.slitWidthMm,
    config.sandingQuality,
    config.brushPressure,
    config.magnetStrength,
    config.magnetDistanceMm,
    config.batteryVoltage,
    config.axisOffsetMm,
    config.wireGaugeMm,
    config.parallelStrands,
    config.varnished,
    recipe.seed >>> 0,
  ]);
  const payload = encodeBase64Url(serialized);
  return `${PREFIX}${payload}.${checksum(payload)}`;
}

export function decodeRecipe(code: string): MotorRecipe {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new RecipeCodeError('レシピコードはM15-で始まる必要があります。');
  const body = trimmed.slice(PREFIX.length);
  const separator = body.lastIndexOf('.');
  if (separator <= 0) throw new RecipeCodeError('チェックサムがありません。');
  const payload = body.slice(0, separator);
  const suppliedChecksum = body.slice(separator + 1);
  if (checksum(payload) !== suppliedChecksum) throw new RecipeCodeError('チェックサムが一致しません。コードが欠損または改変されています。');
  let values: unknown;
  try {
    values = JSON.parse(decodeBase64Url(payload));
  } catch (error) {
    if (error instanceof RecipeCodeError) throw error;
    throw new RecipeCodeError('レシピデータを読み取れません。');
  }
  if (!Array.isArray(values) || values[0] !== 1) throw new RecipeCodeError('対応していないレシピバージョンです。');
  return {
    config: normalizeConfig(values),
    seed: typeof values[12] === 'number' ? values[12] >>> 0 : 0,
  };
}
