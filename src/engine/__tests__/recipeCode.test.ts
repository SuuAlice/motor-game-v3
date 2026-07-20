// spec.md §6.4: 車体・外観込みレシピコード(MC2-)。v1.5(M15-、モーター単体、
// src/data/recipeCodec.ts)との後方互換読み込み・書き出し直しも検証する。
import { describe, expect, it } from 'vitest';
import { decodeRecipe, encodeRecipe, RecipeCodeError, type CarAppearance, type CarRecipe } from '../recipeCode';
import { computeMaxTurns, type MotorConfig } from '../motorPhysics';
import type { CarConfig } from '../vehiclePhysics';

function fullMotorConfig(overrides: Partial<MotorConfig> = {}): MotorConfig {
  return {
    coilTurns: 80,
    slitWidthMm: 1.5,
    sandingQuality: 0.9,
    brushPressure: 0.3,
    magnetStrength: 0.9,
    magnetDistanceMm: 10,
    batteryVoltage: 3,
    axisOffsetMm: 0,
    wireGaugeMm: 0.4,
    parallelStrands: 1,
    varnished: true,
    ...overrides,
  };
}

function fullCarConfig(overrides: Partial<CarConfig> = {}): CarConfig {
  return {
    massG: 150,
    gearRatio: 4,
    gearEfficiency: 0.8,
    wheelDiameterMm: 30,
    tireGrip: 0.7,
    axleFriction: 0,
    wheelAlignmentMm: 0,
    centerOfMassHeightMm: 20,
    motorMountOffsetMm: 0,
    ...overrides,
  };
}

function fullAppearance(overrides: Partial<CarAppearance> = {}): CarAppearance {
  return { bodyColorId: 'blue', accentColorId: 'yellow', ...overrides };
}

function fullRecipe(overrides: Partial<CarRecipe> = {}): CarRecipe {
  return {
    motorConfig: fullMotorConfig(),
    carConfig: fullCarConfig(),
    appearance: fullAppearance(),
    seed: 0x12345678,
    ...overrides,
  };
}

// テスト専用のMC2-コード組み立てヘルパー(recipeCode.ts本体のencode/checksum
// ロジックと同一アルゴリズムを再実装。改竄・構造不正系のテスト用フィクスチャを
// decodeRecipeを経由せずに構築するためのもので、本番コードには影響しない)
function testChecksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function testEncodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function buildRawMc2Code(rawJson: string): string {
  const payload = testEncodeBase64Url(rawJson);
  return `MC2-${payload}.${testChecksum(payload)}`;
}

function testClamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

// v1.5(M15-)フィクスチャ生成専用のヘルパー。src/data/recipeCodec.tsは
// Phase4完了ゲートで削除される参考資料のため、テストからはimportせず、
// 同一の位置固定JSON配列・クランプ・base64url+チェックサムのロジックを
// 自己完結で再実装する(engine/のテストはdata/に依存しない)
function buildV15Code(config: MotorConfig, seed: number): string {
  const wireGaugeMm = Math.round(testClamp(config.wireGaugeMm ?? 0.4, 0.2, 0.8) * 10) / 10;
  const parallelStrands = (config.parallelStrands ?? 1) >= 1.5 ? 2 : 1;
  const maxTurns = computeMaxTurns(wireGaugeMm, parallelStrands);
  const batteryVoltage = config.batteryVoltage < 2.25 ? 1.5 : 3.0;
  const serialized = JSON.stringify([
    1,
    Math.round(testClamp(config.coilTurns, 10, maxTurns)),
    testClamp(config.slitWidthMm, 0, 5),
    testClamp(config.sandingQuality, 0, 1),
    testClamp(config.brushPressure, 0, 1),
    testClamp(config.magnetStrength, 0, 1),
    testClamp(config.magnetDistanceMm, 2, 30),
    batteryVoltage,
    testClamp(config.axisOffsetMm, 0, 3),
    wireGaugeMm,
    parallelStrands,
    config.varnished ?? true,
    seed >>> 0,
  ]);
  const payload = testEncodeBase64Url(serialized);
  return `M15-${payload}.${testChecksum(payload)}`;
}

const validRawFields = {
  m: { ct: 80, sw: 1.5, sq: 0.9, bp: 0.3, ms: 0.9, md: 10, bv: 3, ao: 0, wg: 0.4, ps: 1, vn: true },
  c: { mg: 150, gr: 4, ge: 0.8, wd: 30, tg: 0.7, af: 0, wa: 0, ch: 20, mo: 0 },
  a: { bc: 'blue', ac: 'yellow' },
};

describe('recipeCode(v2・MC2-)', () => {
  it('1. CarRecipe全体を同一値で往復できる', () => {
    const recipe = fullRecipe();
    const decoded = decodeRecipe(encodeRecipe(recipe));
    expect(decoded).toEqual(recipe);
  });

  it('2. 1文字の改竄をチェックサムで検出する(改変位置は固定: チェックサム直前の1文字)', () => {
    const code = encodeRecipe(fullRecipe());
    const index = code.indexOf('.') - 1;
    const tampered = `${code.slice(0, index)}${code[index] === 'A' ? 'B' : 'A'}${code.slice(index + 1)}`;
    expect(() => decodeRecipe(tampered)).toThrow(RecipeCodeError);
    expect(() => decodeRecipe(tampered)).toThrow('チェックサム');
  });

  it('3. 範囲外のモーター値を物理範囲・巻き数上限へクランプする', () => {
    const recipe = fullRecipe({
      motorConfig: fullMotorConfig({ coilTurns: 999, wireGaugeMm: 0.8, parallelStrands: 2, magnetDistanceMm: -10 }),
    });
    const decoded = decodeRecipe(encodeRecipe(recipe));
    expect(decoded.motorConfig.coilTurns).toBe(computeMaxTurns(0.8, 2));
    expect(decoded.motorConfig.coilTurns).toBe(18);
    expect(decoded.motorConfig.magnetDistanceMm).toBe(2);
  });

  it('4. 範囲外の車体値をspec §3.3の範囲へクランプする', () => {
    const recipe = fullRecipe({
      carConfig: fullCarConfig({ massG: 999999, gearRatio: -5, wheelDiameterMm: 999, tireGrip: -1, motorMountOffsetMm: 999 }),
    });
    const decoded = decodeRecipe(encodeRecipe(recipe));
    expect(decoded.carConfig.massG).toBe(250);
    expect(decoded.carConfig.gearRatio).toBe(1.0);
    expect(decoded.carConfig.wheelDiameterMm).toBe(50);
    expect(decoded.carConfig.tireGrip).toBe(0);
    expect(decoded.carConfig.motorMountOffsetMm).toBe(10);
  });

  it('5. v1.5(M15-)コードを読み込み、モーター部分が一致し車体・外観がフォールバックになる', () => {
    const v15Config = fullMotorConfig();
    const v15Code = buildV15Code(v15Config, 42);
    const decoded = decodeRecipe(v15Code);
    expect(decoded.motorConfig).toEqual(v15Config);
    expect(decoded.seed).toBe(42);
    expect(decoded.carConfig).toEqual({
      massG: 150, gearRatio: 4, gearEfficiency: 0.8, wheelDiameterMm: 30, tireGrip: 0.7,
      axleFriction: 0, wheelAlignmentMm: 0, centerOfMassHeightMm: 20, motorMountOffsetMm: 0,
    });
    expect(decoded.appearance).toEqual({ bodyColorId: 'kraft', accentColorId: 'teal' });
  });

  it('5b. defaultCarConfig/defaultAppearanceを渡すとv1.5読み込みでそちらが使われる', () => {
    const v15Code = buildV15Code(fullMotorConfig(), 1);
    const injectedCar = fullCarConfig({ massG: 200, gearRatio: 7 });
    const injectedAppearance = fullAppearance({ bodyColorId: 'red', accentColorId: 'orange' });
    const decoded = decodeRecipe(v15Code, injectedCar, injectedAppearance);
    expect(decoded.carConfig).toEqual(injectedCar);
    expect(decoded.appearance).toEqual(injectedAppearance);
  });

  it('6. v1.5コードを読み込んだ結果をMC2-として書き出し直し、再度往復できる', () => {
    const v15Code = buildV15Code(fullMotorConfig({ magnetDistanceMm: 3 }), 7);
    const decodedFromV15 = decodeRecipe(v15Code);
    const rewritten = encodeRecipe(decodedFromV15);
    expect(rewritten.startsWith('MC2-')).toBe(true);
    const decodedAgain = decodeRecipe(rewritten);
    expect(decodedAgain).toEqual(decodedFromV15);
  });

  it('7. 異常なappearanceの値はエンジン内蔵既定IDへフォールバックする', () => {
    const recipe = fullRecipe({
      appearance: { bodyColorId: 12345 as unknown as string, accentColorId: 'x'.repeat(50) },
    });
    const decoded = decodeRecipe(encodeRecipe(recipe));
    expect(decoded.appearance).toEqual({ bodyColorId: 'kraft', accentColorId: 'teal' });
  });

  it('7b. 形として妥当だが未知のappearance IDはそのまま保持する(描画側fallbackに委ねる)', () => {
    const recipe = fullRecipe({ appearance: { bodyColorId: 'not-a-real-color', accentColorId: 'also-unknown' } });
    const decoded = decodeRecipe(encodeRecipe(recipe));
    expect(decoded.appearance).toEqual({ bodyColorId: 'not-a-real-color', accentColorId: 'also-unknown' });
  });

  it('8. MC2-/M15-以外のプレフィックスを拒否する', () => {
    expect(() => decodeRecipe('XYZ-invalid')).toThrow(RecipeCodeError);
    expect(() => decodeRecipe('XYZ-invalid')).toThrow('MC2-');
  });

  it('9. payload内のバージョン不整合を拒否する', () => {
    const raw = JSON.stringify({ v: 3, ...validRawFields, sd: 1 });
    expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow(RecipeCodeError);
    expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow('バージョン');
  });

  it('10. defaultCarConfig/defaultAppearance省略時はエンジン内蔵フォールバックが使われる', () => {
    const v15Code = buildV15Code(fullMotorConfig(), 1);
    const decoded = decodeRecipe(v15Code);
    expect(decoded.carConfig.massG).toBe(150);
    expect(decoded.appearance.bodyColorId).toBe('kraft');
  });

  it('10b. default省略時に返されるcarConfig/appearanceは呼び出しごとに新規オブジェクトで、変更してもモジュール内既定値を汚染しない', () => {
    const v15Code = buildV15Code(fullMotorConfig(), 1);
    const decodedA = decodeRecipe(v15Code);
    decodedA.carConfig.massG = 999;
    decodedA.appearance.bodyColorId = 'mutated';
    const decodedB = decodeRecipe(v15Code);
    expect(decodedB.carConfig.massG).toBe(150);
    expect(decodedB.appearance.bodyColorId).toBe('kraft');
    expect(decodedB.carConfig).not.toBe(decodedA.carConfig);
    expect(decodedB.appearance).not.toBe(decodedA.appearance);
  });

  it('10c. 注入したdefaultCarConfig/defaultAppearanceは複製されて返り、変更しても注入元オブジェクトを汚染しない', () => {
    const v15Code = buildV15Code(fullMotorConfig(), 1);
    const injectedCar = fullCarConfig({ massG: 200 });
    const injectedAppearance = fullAppearance({ bodyColorId: 'red' });
    const decoded = decodeRecipe(v15Code, injectedCar, injectedAppearance);
    expect(decoded.carConfig).not.toBe(injectedCar);
    expect(decoded.appearance).not.toBe(injectedAppearance);
    decoded.carConfig.massG = 1;
    decoded.appearance.bodyColorId = 'mutated';
    expect(injectedCar.massG).toBe(200);
    expect(injectedAppearance.bodyColorId).toBe('red');
  });

  describe('11. 構造不正なpayloadはTypeErrorを漏らさずRecipeCodeErrorになる', () => {
    it('トップレベルが配列', () => {
      const raw = JSON.stringify([1, 2, 3]);
      expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow(RecipeCodeError);
    });

    it('mがnull(モーター設定のメッセージを含む)', () => {
      const raw = JSON.stringify({ v: 2, ...validRawFields, m: null, sd: 1 });
      expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow(RecipeCodeError);
      expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow('モーター設定');
    });

    it('cが配列(車体設定のメッセージを含む)', () => {
      const raw = JSON.stringify({ v: 2, ...validRawFields, c: [1, 2, 3], sd: 1 });
      expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow(RecipeCodeError);
      expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow('車体設定');
    });

    it('aが欠落(外観設定のメッセージを含む)', () => {
      const raw = JSON.stringify({ v: 2, m: validRawFields.m, c: validRawFields.c, sd: 1 });
      expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow(RecipeCodeError);
      expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow('外観設定');
    });

    it('mが文字列', () => {
      const raw = JSON.stringify({ v: 2, ...validRawFields, m: 'not-an-object', sd: 1 });
      expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow(RecipeCodeError);
    });
  });

  it('12. 長すぎるレシピコードをbase64復号前に拒否する', () => {
    const huge = `MC2-${'a'.repeat(5000)}`;
    expect(() => decodeRecipe(huge)).toThrow(RecipeCodeError);
    expect(() => decodeRecipe(huge)).toThrow('長すぎ');
  });

  it('13. 型不正・非有限値のフィールドは例外を投げずフォールバックへ収束する', () => {
    // "md":1e400 はJSON.parseの時点でNumber.POSITIVE_INFINITYへ丸められる
    // (JSON構文としては合法な巨大指数リテラルであり、ソース上でJS数値リテラルとして
    // 書くとJSON.stringify段階でnullに落ちてしまうため、文字列置換で直接埋め込む)
    const raw = JSON.stringify({
      v: 2,
      m: { ...validRawFields.m, ct: 'not-a-number', vn: 5, bv: 'x' },
      c: validRawFields.c,
      a: validRawFields.a,
      sd: 'not-a-seed',
    }).replace('"md":10', '"md":1e400');
    const decoded = decodeRecipe(buildRawMc2Code(raw));
    expect(decoded.motorConfig.coilTurns).toBe(80);
    expect(decoded.motorConfig.varnished).toBe(true);
    expect(decoded.motorConfig.magnetDistanceMm).toBe(10);
    expect(decoded.motorConfig.batteryVoltage).toBe(3);
    expect(decoded.seed).toBe(0);
  });

  it('14. magnetDistanceMmの下限は2〜30で統一され、M15由来の2〜5mmはMC2再書き出しでも引き戻されない', () => {
    const decodedDirect = decodeRecipe(encodeRecipe(fullRecipe({ motorConfig: fullMotorConfig({ magnetDistanceMm: -100 }) })));
    expect(decodedDirect.motorConfig.magnetDistanceMm).toBe(2);
    const decodedHigh = decodeRecipe(encodeRecipe(fullRecipe({ motorConfig: fullMotorConfig({ magnetDistanceMm: 999 }) })));
    expect(decodedHigh.motorConfig.magnetDistanceMm).toBe(30);

    const v15Code = buildV15Code(fullMotorConfig({ magnetDistanceMm: 3 }), 1);
    const decodedFromV15 = decodeRecipe(v15Code);
    expect(decodedFromV15.motorConfig.magnetDistanceMm).toBe(3);
    const rewritten = encodeRecipe(decodedFromV15);
    const decodedAfterRewrite = decodeRecipe(rewritten);
    expect(decodedAfterRewrite.motorConfig.magnetDistanceMm).toBe(3);
  });
});
