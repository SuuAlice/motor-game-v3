import { computeMaxTurns, type MotorConfig } from './motorPhysics';
import type { CarConfig } from './vehiclePhysics';

// spec.md §6.4: 車体・外観込みのレシピコード(v2)。
// v1.5由来のsrc/data/recipeCodec.ts(M15-、モーター単体、位置固定JSON配列)とは
// 別モジュール。M15-コードの後方互換読み込みのみ本ファイルへ移植する
// (recipeCodec.ts自体は無変更、Phase4完了ゲート後に削除予定の参考資料)。

const PREFIX_V2 = 'MC2-';
const PREFIX_V3 = 'MC3-';
const PREFIX_V15 = 'M15-';

// 悪意ある巨大入力によるbase64復号・JSON.parseコストを、処理前に排除する
const MAX_RECIPE_CODE_LENGTH = 4096;
const MAX_APPEARANCE_ID_LENGTH = 32;

// Phase2 Step6(docs/phase2-plan.md §9、Fable承認済み)。導線・電池ratio 4フィールド
// (Step5a/5b、docs/phase2-plan.md §7)のクランプ範囲。実測範囲(materials.ts
// Unit1/Step2a)を両側に余裕を持って包含する設計値であり、物性値そのものではない。
// クランプ変更ポリシー(Fable承認済み付帯条件): 範囲の拡大は後方互換(旧範囲内の値の
// decode結果は不変)、縮小は破壊的変更としてFable再レビュー対象とする。
const MIN_WIRE_RESISTIVITY_RATIO = 0.5;
const MAX_WIRE_RESISTIVITY_RATIO = 2.0; // 実測[0.946(銀), 1.577(アルミ)]を包含
const MIN_WIRE_DENSITY_RATIO = 0.2;
const MAX_WIRE_DENSITY_RATIO = 1.5; // 実測[0.301(アルミ), 1.171(銀)]を包含
// 電池ratio(batteryInternalResistanceRatio/batteryCapacityRatio)はStep7で
// materialMapping接続時に較正値が確定するまで、物性値としての意味のある上下限を
// 確定しない(Fable承認済みQ2)。NaN/Infinity/負値等の壊れた入力を排除するためだけの
// 広い保守的範囲とする。Step7較正値がこの範囲外になった場合はMC3仕様変更として
// Fable再レビュー対象とする(上記クランプ変更ポリシーと同じ扱い)。
const MIN_BATTERY_RATIO = 0.01;
const MAX_BATTERY_RATIO = 10;

// v2/v3共通のキー対応表(短縮キー、フィールド追加時はここに追記する)。
// m(MotorConfig): ct=coilTurns, sw=slitWidthMm, sq=sandingQuality, bp=brushPressure,
//   ms=magnetStrength, md=magnetDistanceMm, bv=batteryVoltage, ao=axisOffsetMm,
//   wg=wireGaugeMm, ps=parallelStrands, vn=varnished
//   (v3で追加) wr=wireResistivityRatio, wz=wireDensityRatio,
//   br=batteryInternalResistanceRatio, bc=batteryCapacityRatio
// c(CarConfig): mg=massG, gr=gearRatio, ge=gearEfficiency, wd=wheelDiameterMm,
//   tg=tireGrip, af=axleFriction, wa=wheelAlignmentMm, ch=centerOfMassHeightMm,
//   mo=motorMountOffsetMm
// a(CarAppearance): bc=bodyColorId, ac=accentColorId
// sd=seed
// 注意: m.bc(batteryCapacityRatio)とa.bc(bodyColorId)は短縮キーの文字列としては
// 同名だが、m/aは別オブジェクト(名前空間)のためシリアライズ上の衝突はない
// (Fable承認済み: 一意性の要求は各namespace内部に限定する、namespace横断は
// 完全修飾キーm.bc/a.bcで区別する)。

// 各namespaceのauthoritativeな生キー配列(Fable承認済み付帯条件: フィールド追加時に
// 重複キーを取り違えないための機械検査対象)。motorConfigToFields/normalizeMotorFields
// 等のオブジェクトリテラルとは意図的に別データとして保持する(オブジェクトリテラルは
// 重複キーを構文上静かに畳み込んでしまい、後勝ちで上書きされた重複を実行時に検出
// できないため、配列で明示的に列挙する必要がある)。フィールド追加時は、この配列と
// 対応するToFields/normalizeFields関数の両方を更新すること(recipeCode.test.tsの
// ドリフト検査が更新漏れを検出する)。
export const RECIPE_M_FIELD_KEYS = [
  'ct', 'sw', 'sq', 'bp', 'ms', 'md', 'bv', 'ao', 'wg', 'ps', 'vn', 'wr', 'wz', 'br', 'bc',
] as const;
export const RECIPE_C_FIELD_KEYS = ['mg', 'gr', 'ge', 'wd', 'tg', 'af', 'wa', 'ch', 'mo'] as const;
export const RECIPE_A_FIELD_KEYS = ['bc', 'ac'] as const;

interface RecipePayloadV2 {
  v: 2;
  m: { ct: number; sw: number; sq: number; bp: number; ms: number; md: number; bv: number; ao: number; wg: number; ps: number; vn: boolean };
  c: { mg: number; gr: number; ge: number; wd: number; tg: number; af: number; wa: number; ch: number; mo: number };
  a: { bc: string; ac: string };
  sd: number;
}

interface RecipePayloadV3 {
  v: 3;
  m: RecipePayloadV2['m'] & { wr: number; wz: number; br: number; bc: number };
  c: RecipePayloadV2['c'];
  a: RecipePayloadV2['a'];
  sd: number;
}

// spec.md §3.3のCarAppearance(色ID、走行物理には影響しない)。
// src/render/CarSprite.tsxの同名interface(chassisColor/accentColorという解決済み
// 色値を持つ、別概念)とは異なる。Suu側でCarSprite.tsxの型はCarSpriteAppearance
// へ改名される予定(alice側はCarSprite.tsxに触れない)
export interface CarAppearance {
  bodyColorId: string;
  accentColorId: string;
}

export interface CarRecipe {
  motorConfig: MotorConfig;
  carConfig: CarConfig;
  appearance: CarAppearance;
  seed: number;
}

export class RecipeCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeCodeError';
  }
}

// engine/はdata/partPresets.tsに依存しない(アーキテクチャ境界)。
// DEFAULT_GARAGE_SELECTION相当の標準構成をエンジン内蔵値として直接保持し、
// 本番UIではdecodeRecipeの引数で実際のプリセット由来値を注入できるようにする
const BUILT_IN_FALLBACK_CAR_CONFIG: CarConfig = {
  massG: 150,
  gearRatio: 4,
  gearEfficiency: 0.8,
  wheelDiameterMm: 30,
  tireGrip: 0.7,
  axleFriction: 0,
  wheelAlignmentMm: 0,
  centerOfMassHeightMm: 20,
  motorMountOffsetMm: 0,
};

const BUILT_IN_FALLBACK_APPEARANCE: CarAppearance = {
  bodyColorId: 'kraft',
  accentColorId: 'teal',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numAt(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolAt(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

// 実在する色パレット(data/partPresets.tsのBODY_COLORS/ACCENT_COLORS)との照合は
// 行わない(engine/がdata/に依存しないため)。型・長さのみ検証し、未知だが
// 形として妥当なIDはそのまま保持する(描画側のbyIdフォールバックに委ねる、
// Fable判断事項(3))
function stringAt(record: Record<string, unknown>, key: string, fallback: string, maxLength: number): string {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : fallback;
}

function normalizeSeed(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value >>> 0 : 0;
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

// magnetDistanceMmの下限は2〜30で統一する(Fable判断事項(5)の最終決定)。
// M15由来の2〜5mmの値をMC2で再書き出ししても引き戻さず往復保持するため、
// v2・v1.5互換の両方でこの関数を経由させ、クランプ範囲を分岐させない。
// 新規ガレージ/工作UIの入力を5〜30mmへ絞るのはSuu側のUI層の責務であり、
// このレシピコード形式そのものの正規化範囲ではない
function normalizeMotorFields(m: Record<string, unknown>): MotorConfig {
  const wireGaugeMm = Math.round(clamp(numAt(m, 'wg', 0.4), 0.2, 0.8) * 10) / 10;
  const parallelStrands: 1 | 2 = numAt(m, 'ps', 1) >= 1.5 ? 2 : 1;
  const maxTurns = computeMaxTurns(wireGaugeMm, parallelStrands);
  const batteryVoltage: 1.5 | 3.0 = numAt(m, 'bv', 3) < 2.25 ? 1.5 : 3.0;
  return {
    coilTurns: Math.round(clamp(numAt(m, 'ct', 80), 10, maxTurns)),
    slitWidthMm: clamp(numAt(m, 'sw', 1.5), 0, 5),
    sandingQuality: clamp(numAt(m, 'sq', 0.9), 0, 1),
    brushPressure: clamp(numAt(m, 'bp', 0.3), 0, 1),
    magnetStrength: clamp(numAt(m, 'ms', 0.9), 0, 1),
    magnetDistanceMm: clamp(numAt(m, 'md', 10), 2, 30),
    batteryVoltage,
    axisOffsetMm: clamp(numAt(m, 'ao', 0), 0, 3),
    wireGaugeMm,
    parallelStrands,
    varnished: boolAt(m, 'vn', true),
    // Phase2 Step6で追加。数値型でない・非有限(NaN/Infinity)・キー欠落はいずれも
    // numAtの既存パターンにより fallback=1 へ差し替わる(新規の特別扱いをしない)。
    // decodeV2(v2 payload、wr/wz/br/bcキーを持たない)・decodeV15からもこの
    // normalizeMotorFieldsを経由するため、旧コードを復号した場合も4フィールドは
    // 一律fallback=1(=engineのデフォルト挙動と等価)で補われる(意味互換)。
    wireResistivityRatio: clamp(numAt(m, 'wr', 1), MIN_WIRE_RESISTIVITY_RATIO, MAX_WIRE_RESISTIVITY_RATIO),
    wireDensityRatio: clamp(numAt(m, 'wz', 1), MIN_WIRE_DENSITY_RATIO, MAX_WIRE_DENSITY_RATIO),
    batteryInternalResistanceRatio: clamp(numAt(m, 'br', 1), MIN_BATTERY_RATIO, MAX_BATTERY_RATIO),
    batteryCapacityRatio: clamp(numAt(m, 'bc', 1), MIN_BATTERY_RATIO, MAX_BATTERY_RATIO),
  };
}

// spec.md §3.3のCarConfig範囲へクランプする
function normalizeCarFields(c: Record<string, unknown>): CarConfig {
  return {
    massG: clamp(numAt(c, 'mg', BUILT_IN_FALLBACK_CAR_CONFIG.massG), 80, 250),
    gearRatio: clamp(numAt(c, 'gr', BUILT_IN_FALLBACK_CAR_CONFIG.gearRatio), 1.0, 12.0),
    gearEfficiency: clamp(numAt(c, 'ge', BUILT_IN_FALLBACK_CAR_CONFIG.gearEfficiency), 0.6, 0.95),
    wheelDiameterMm: clamp(numAt(c, 'wd', BUILT_IN_FALLBACK_CAR_CONFIG.wheelDiameterMm), 20, 50),
    tireGrip: clamp(numAt(c, 'tg', BUILT_IN_FALLBACK_CAR_CONFIG.tireGrip), 0, 1),
    axleFriction: clamp(numAt(c, 'af', BUILT_IN_FALLBACK_CAR_CONFIG.axleFriction), 0, 1),
    wheelAlignmentMm: clamp(numAt(c, 'wa', BUILT_IN_FALLBACK_CAR_CONFIG.wheelAlignmentMm), 0, 3),
    centerOfMassHeightMm: clamp(numAt(c, 'ch', BUILT_IN_FALLBACK_CAR_CONFIG.centerOfMassHeightMm), 10, 40),
    motorMountOffsetMm: clamp(numAt(c, 'mo', BUILT_IN_FALLBACK_CAR_CONFIG.motorMountOffsetMm), 0, 10),
  };
}

function normalizeAppearanceFields(a: Record<string, unknown>): CarAppearance {
  return {
    bodyColorId: stringAt(a, 'bc', BUILT_IN_FALLBACK_APPEARANCE.bodyColorId, MAX_APPEARANCE_ID_LENGTH),
    accentColorId: stringAt(a, 'ac', BUILT_IN_FALLBACK_APPEARANCE.accentColorId, MAX_APPEARANCE_ID_LENGTH),
  };
}

function motorConfigToFields(motor: MotorConfig): Record<string, unknown> {
  return {
    ct: motor.coilTurns,
    sw: motor.slitWidthMm,
    sq: motor.sandingQuality,
    bp: motor.brushPressure,
    ms: motor.magnetStrength,
    md: motor.magnetDistanceMm,
    bv: motor.batteryVoltage,
    ao: motor.axisOffsetMm,
    wg: motor.wireGaugeMm ?? 0.4,
    ps: motor.parallelStrands ?? 1,
    vn: motor.varnished ?? true,
    wr: motor.wireResistivityRatio ?? 1,
    wz: motor.wireDensityRatio ?? 1,
    br: motor.batteryInternalResistanceRatio ?? 1,
    bc: motor.batteryCapacityRatio ?? 1,
  };
}

function carConfigToFields(car: CarConfig): Record<string, unknown> {
  return {
    mg: car.massG,
    gr: car.gearRatio,
    ge: car.gearEfficiency,
    wd: car.wheelDiameterMm,
    tg: car.tireGrip,
    af: car.axleFriction,
    wa: car.wheelAlignmentMm,
    ch: car.centerOfMassHeightMm,
    mo: car.motorMountOffsetMm,
  };
}

function appearanceToFields(appearance: CarAppearance): Record<string, unknown> {
  return { bc: appearance.bodyColorId, ac: appearance.accentColorId };
}

// defaultCarConfig/defaultAppearance(呼び出し側から注入されたオブジェクト)・
// BUILT_IN_FALLBACK_*(モジュール内定数)のいずれも、normalizeCarFields/
// normalizeAppearanceFieldsを経由させることで必ず新規オブジェクトとして返す。
// 直接参照を返すと、呼び出し側がdecode結果を変更した際に注入元オブジェクトや
// モジュール内定数そのものを汚染してしまう(以後の全decodeの既定値が変わる)
function resolveDefaultCarConfig(defaultCarConfig?: CarConfig): CarConfig {
  return normalizeCarFields(carConfigToFields(defaultCarConfig ?? BUILT_IN_FALLBACK_CAR_CONFIG));
}

function resolveDefaultAppearance(defaultAppearance?: CarAppearance): CarAppearance {
  return normalizeAppearanceFields(appearanceToFields(defaultAppearance ?? BUILT_IN_FALLBACK_APPEARANCE));
}

// Phase2 Step6(Fable承認済み): encodeRecipeは常にMC3-(v:3)を出力する。
// MC2-を出力する経路は残さない(decodeRecipeはMC2-/M15-の読み込みのみ後方互換で
// 維持する。生成は常に最新版数)。
export function encodeRecipe(recipe: CarRecipe): string {
  const motorConfig = normalizeMotorFields(motorConfigToFields(recipe.motorConfig));
  const carConfig = normalizeCarFields(carConfigToFields(recipe.carConfig));
  const appearance = normalizeAppearanceFields(appearanceToFields(recipe.appearance));
  const payload: RecipePayloadV3 = {
    v: 3,
    m: {
      ct: motorConfig.coilTurns,
      sw: motorConfig.slitWidthMm,
      sq: motorConfig.sandingQuality,
      bp: motorConfig.brushPressure,
      ms: motorConfig.magnetStrength,
      md: motorConfig.magnetDistanceMm,
      bv: motorConfig.batteryVoltage,
      ao: motorConfig.axisOffsetMm,
      wg: motorConfig.wireGaugeMm as number,
      ps: motorConfig.parallelStrands as number,
      vn: motorConfig.varnished as boolean,
      wr: motorConfig.wireResistivityRatio as number,
      wz: motorConfig.wireDensityRatio as number,
      br: motorConfig.batteryInternalResistanceRatio as number,
      bc: motorConfig.batteryCapacityRatio as number,
    },
    c: {
      mg: carConfig.massG,
      gr: carConfig.gearRatio,
      ge: carConfig.gearEfficiency,
      wd: carConfig.wheelDiameterMm,
      tg: carConfig.tireGrip,
      af: carConfig.axleFriction,
      wa: carConfig.wheelAlignmentMm,
      ch: carConfig.centerOfMassHeightMm,
      mo: carConfig.motorMountOffsetMm,
    },
    a: { bc: appearance.bodyColorId, ac: appearance.accentColorId },
    sd: normalizeSeed(recipe.seed),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `${PREFIX_V3}${encodedPayload}.${checksum(encodedPayload)}`;
}

function decodeChecksummedBody(prefix: string, trimmed: string): string {
  const body = trimmed.slice(prefix.length);
  const separator = body.lastIndexOf('.');
  if (separator <= 0) throw new RecipeCodeError('チェックサムがありません。');
  const payload = body.slice(0, separator);
  const suppliedChecksum = body.slice(separator + 1);
  if (checksum(payload) !== suppliedChecksum) {
    throw new RecipeCodeError('チェックサムが一致しません。コードが欠損または改変されています。');
  }
  return payload;
}

function parsePayloadJson(payload: string): unknown {
  try {
    return JSON.parse(decodeBase64Url(payload));
  } catch (error) {
    if (error instanceof RecipeCodeError) throw error;
    throw new RecipeCodeError('レシピデータを読み取れません。');
  }
}

// Phase2 Step6(Fable承認済みQ3): decodeV2は無改修のまま残す(1文字も変更しない)。
// M15→MC2で確立した「旧decoderを不変体として凍結する」資産をそのまま踏襲する。
function decodeV2(trimmed: string): CarRecipe {
  const payload = decodeChecksummedBody(PREFIX_V2, trimmed);
  const parsed = parsePayloadJson(payload);
  if (!isPlainRecord(parsed)) throw new RecipeCodeError('レシピデータの構造が不正です。');
  if (parsed.v !== 2) throw new RecipeCodeError('対応していないレシピバージョンです。');
  const m = parsed.m;
  const c = parsed.c;
  const a = parsed.a;
  if (!isPlainRecord(m)) throw new RecipeCodeError('モーター設定の構造が不正です。');
  if (!isPlainRecord(c)) throw new RecipeCodeError('車体設定の構造が不正です。');
  if (!isPlainRecord(a)) throw new RecipeCodeError('外観設定の構造が不正です。');
  return {
    motorConfig: normalizeMotorFields(m),
    carConfig: normalizeCarFields(c),
    appearance: normalizeAppearanceFields(a),
    seed: normalizeSeed(parsed.sd),
  };
}

// Phase2 Step6(Fable承認済みQ3): decodeV2とほぼ同型の独立関数として新設する
// (共通ヘルパーへの統合リファクタは行わない。decodeV2側の参照は変更しない)。
// 相違点はprefix(PREFIX_V3)とversion判定(v===3)のみで、normalizeMotorFields等の
// 共有関数を経由するため、v3固有のパース処理は不要(m内のwr/wz/br/bcが
// numAt→clampで正規化される)。
function decodeV3(trimmed: string): CarRecipe {
  const payload = decodeChecksummedBody(PREFIX_V3, trimmed);
  const parsed = parsePayloadJson(payload);
  if (!isPlainRecord(parsed)) throw new RecipeCodeError('レシピデータの構造が不正です。');
  if (parsed.v !== 3) throw new RecipeCodeError('対応していないレシピバージョンです。');
  const m = parsed.m;
  const c = parsed.c;
  const a = parsed.a;
  if (!isPlainRecord(m)) throw new RecipeCodeError('モーター設定の構造が不正です。');
  if (!isPlainRecord(c)) throw new RecipeCodeError('車体設定の構造が不正です。');
  if (!isPlainRecord(a)) throw new RecipeCodeError('外観設定の構造が不正です。');
  return {
    motorConfig: normalizeMotorFields(m),
    carConfig: normalizeCarFields(c),
    appearance: normalizeAppearanceFields(a),
    seed: normalizeSeed(parsed.sd),
  };
}

// v1.5(src/data/recipeCodec.ts)の位置固定JSON配列
// [1, coilTurns, slitWidthMm, sandingQuality, brushPressure, magnetStrength,
//  magnetDistanceMm, batteryVoltage, axisOffsetMm, wireGaugeMm, parallelStrands,
//  varnished, seed]を、キー付きレコードへ変換してnormalizeMotorFieldsへ渡す。
// 車体・外観はv1.5に存在しないため、defaultCarConfig/defaultAppearance
// (省略時はエンジン内蔵フォールバック)で補う(spec §6.4)
function decodeV15(trimmed: string, defaultCarConfig?: CarConfig, defaultAppearance?: CarAppearance): CarRecipe {
  const payload = decodeChecksummedBody(PREFIX_V15, trimmed);
  const values = parsePayloadJson(payload);
  if (!Array.isArray(values) || values[0] !== 1) {
    throw new RecipeCodeError('対応していないレシピバージョンです。');
  }
  const motorFields: Record<string, unknown> = {
    ct: values[1],
    sw: values[2],
    sq: values[3],
    bp: values[4],
    ms: values[5],
    md: values[6],
    bv: values[7],
    ao: values[8],
    wg: values[9],
    ps: values[10],
    vn: values[11],
  };
  return {
    motorConfig: normalizeMotorFields(motorFields),
    carConfig: resolveDefaultCarConfig(defaultCarConfig),
    appearance: resolveDefaultAppearance(defaultAppearance),
    seed: normalizeSeed(values[12]),
  };
}

export function decodeRecipe(code: string, defaultCarConfig?: CarConfig, defaultAppearance?: CarAppearance): CarRecipe {
  const trimmed = code.trim();
  if (trimmed.length > MAX_RECIPE_CODE_LENGTH) {
    throw new RecipeCodeError('レシピコードが長すぎます。');
  }
  if (trimmed.startsWith(PREFIX_V3)) return decodeV3(trimmed);
  if (trimmed.startsWith(PREFIX_V2)) return decodeV2(trimmed);
  if (trimmed.startsWith(PREFIX_V15)) return decodeV15(trimmed, defaultCarConfig, defaultAppearance);
  throw new RecipeCodeError('レシピコードはMC3-、MC2-またはM15-で始まる必要があります。');
}
