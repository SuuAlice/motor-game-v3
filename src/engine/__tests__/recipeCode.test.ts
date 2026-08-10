// spec.md §6.4: 車体・外観込みレシピコード(MC3-)。v2(MC2-)・v1.5(M15-、モーター
// 単体、src/data/recipeCodec.ts)との後方互換読み込み・書き出し直しも検証する。
import { describe, expect, it } from 'vitest';
import {
  decodeRecipe,
  encodeRecipe,
  RecipeCodeError,
  RECIPE_M_FIELD_KEYS,
  RECIPE_C_FIELD_KEYS,
  RECIPE_A_FIELD_KEYS,
  type CarAppearance,
  type CarRecipe,
} from '../recipeCode';
import { computeMaxTurns, type MotorConfig } from '../motorPhysics';
import type { CarConfig } from '../vehiclePhysics';

// Phase2 Step6(Fable承認済み): 新4フィールド(wireResistivityRatio/wireDensityRatio/
// batteryInternalResistanceRatio/batteryCapacityRatio)を含む、全オプショナル
// フィールドを明示設定した構成。RECIPE_M_FIELD_KEYSとのドリフト検査(後述)の
// fixtureとして使うため、MotorConfigの全optionalフィールドを省略しないこと。
// P3-3(正式Fable P3-3-Q10裁定確定)でbrushContactResistanceRatio/brushChatterProbabilityRatio
// (bcr/bpr)を追加。effectiveTurnsRatioは実行時合成値でありrecipeCodeへ追従しない
// (P3-3-Q12裁定で確定済みの区別)ため、ここには含めない。
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
    wireResistivityRatio: 1,
    wireDensityRatio: 1,
    batteryInternalResistanceRatio: 1,
    batteryCapacityRatio: 1,
    brushContactResistanceRatio: 1,
    brushChatterProbabilityRatio: 1,
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

function buildRawMc3Code(rawJson: string): string {
  const payload = testEncodeBase64Url(rawJson);
  return `MC3-${payload}.${testChecksum(payload)}`;
}

function testClamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

// encodeRecipeが実際に生成したコードのm/c/a各payloadのkey集合を取り出す
// (recipeCode.ts本体のmotorConfigToFields等はexportされていないため、
// decodeBase64Urlと同一アルゴリズムをテスト側で再実装して覗き見る。
// 本番コードには影響しない)
function extractPayloadKeys(code: string): { m: string[]; c: string[]; a: string[] } {
  const withoutPrefix = code.replace(/^(MC3-|MC2-|M15-)/, '');
  const body = withoutPrefix.slice(0, withoutPrefix.lastIndexOf('.'));
  const base64 = body.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(body.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const json = JSON.parse(new TextDecoder('utf-8').decode(bytes));
  return { m: Object.keys(json.m), c: Object.keys(json.c), a: Object.keys(json.a) };
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

describe('recipeCode(MC3-/MC2-/M15-)', () => {
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

  it('6. v1.5コードを読み込んだ結果をMC3-として書き出し直し、再度往復できる(Step6でMC2-からMC3-へ更新)', () => {
    const v15Code = buildV15Code(fullMotorConfig({ magnetDistanceMm: 3 }), 7);
    const decodedFromV15 = decodeRecipe(v15Code);
    // v1.5コードには新4フィールドが存在しないため、decodeV15→normalizeMotorFields経由で
    // fallback=1.0が補われる(意味互換、15節のテストと同型)
    expect(decodedFromV15.motorConfig.wireResistivityRatio).toBe(1);
    expect(decodedFromV15.motorConfig.wireDensityRatio).toBe(1);
    expect(decodedFromV15.motorConfig.batteryInternalResistanceRatio).toBe(1);
    expect(decodedFromV15.motorConfig.batteryCapacityRatio).toBe(1);
    const rewritten = encodeRecipe(decodedFromV15);
    expect(rewritten.startsWith('MC3-')).toBe(true);
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

  it('8. MC3-/MC2-/M15-以外のプレフィックスを拒否する(Step6でMC3-の案内を追加)', () => {
    expect(() => decodeRecipe('XYZ-invalid')).toThrow(RecipeCodeError);
    expect(() => decodeRecipe('XYZ-invalid')).toThrow('MC3-');
    expect(() => decodeRecipe('XYZ-invalid')).toThrow('MC2-');
    expect(() => decodeRecipe('XYZ-invalid')).toThrow('M15-');
  });

  it('9. payload内のバージョン不整合を拒否する(MC2-プレフィックス+v:3)', () => {
    const raw = JSON.stringify({ v: 3, ...validRawFields, sd: 1 });
    expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow(RecipeCodeError);
    expect(() => decodeRecipe(buildRawMc2Code(raw))).toThrow('バージョン');
  });

  it('9b. payload内のバージョン不整合を拒否する(MC3-プレフィックス+v:2、9の逆方向)', () => {
    const raw = JSON.stringify({
      v: 2,
      m: { ...validRawFields.m, wr: 1, wz: 1, br: 1, bc: 1 },
      c: validRawFields.c,
      a: validRawFields.a,
      sd: 1,
    });
    expect(() => decodeRecipe(buildRawMc3Code(raw))).toThrow(RecipeCodeError);
    expect(() => decodeRecipe(buildRawMc3Code(raw))).toThrow('バージョン');
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

  // 固定MC2 fixture(Phase2 Step6着手前、Step5a/5b完了時点の実装で実際に生成された
  // 生文字列をリテラルとして固定したもの。将来encode実装がさらに変わっても、この
  // 文字列に対する復号互換だけは独立に検証できる。中身はfullRecipe()相当
  // (motorConfig: fullMotorConfig()のうち新4フィールドを除く旧11フィールド、
  // carConfig: fullCarConfig()、appearance: {bodyColorId:'blue',accentColorId:'yellow'}、
  // seed: 0x12345678)で、新4フィールドのキー(wr/wz/br/bc)を一切含まない)
  const FIXED_MC2_FIXTURE =
    'MC2-eyJ2IjoyLCJtIjp7ImN0Ijo4MCwic3ciOjEuNSwic3EiOjAuOSwiYnAiOjAuMywibXMiOjAuOSwibWQiOjEwLCJidiI6MywiYW8iOjAsIndnIjowLjQsInBzIjoxLCJ2biI6dHJ1ZX0sImMiOnsibWciOjE1MCwiZ3IiOjQsImdlIjowLjgsIndkIjozMCwidGciOjAuNywiYWYiOjAsIndhIjowLCJjaCI6MjAsIm1vIjowfSwiYSI6eyJiYyI6ImJsdWUiLCJhYyI6InllbGxvdyJ9LCJzZCI6MzA1NDE5ODk2fQ.0vkhtdv';

  it('15a. [MC2意味互換] 固定MC2 fixtureを復号すると、欠落している導線2件・電池2件の計4フィールドがすべてfallback=1.0へ補完される', () => {
    const decoded = decodeRecipe(FIXED_MC2_FIXTURE);
    expect(decoded.motorConfig.wireResistivityRatio).toBe(1);
    expect(decoded.motorConfig.wireDensityRatio).toBe(1);
    expect(decoded.motorConfig.batteryInternalResistanceRatio).toBe(1);
    expect(decoded.motorConfig.batteryCapacityRatio).toBe(1);
    // 4フィールド以外の意味も、旧MC2実装が意図した値のまま変わっていないことを確認
    expect(decoded.motorConfig.coilTurns).toBe(80);
    expect(decoded.motorConfig.magnetStrength).toBe(0.9);
    expect(decoded.carConfig).toEqual(fullCarConfig());
    expect(decoded.appearance).toEqual({ bodyColorId: 'blue', accentColorId: 'yellow' });
    expect(decoded.seed).toBe(0x12345678);
  });

  it('15b. [MC3 round-trip] MC3のencode/decodeで導線2件・電池2件の計4フィールドが往復保持される', () => {
    const recipe = fullRecipe({
      motorConfig: fullMotorConfig({
        wireResistivityRatio: 2,
        wireDensityRatio: 1.2,
        batteryInternalResistanceRatio: 0.5,
        batteryCapacityRatio: 3,
      }),
    });
    const code = encodeRecipe(recipe);
    expect(code.startsWith('MC3-')).toBe(true);
    const decoded = decodeRecipe(code);
    expect(decoded.motorConfig.wireResistivityRatio).toBe(2);
    expect(decoded.motorConfig.wireDensityRatio).toBe(1.2);
    expect(decoded.motorConfig.batteryInternalResistanceRatio).toBe(0.5);
    expect(decoded.motorConfig.batteryCapacityRatio).toBe(3);
    expect(decoded).toEqual(recipe);
  });

  describe('16. 新4フィールドのクランプ境界', () => {
    it('範囲内の値はそのまま保持される', () => {
      const recipe = fullRecipe({
        motorConfig: fullMotorConfig({
          wireResistivityRatio: 1.8,
          wireDensityRatio: 0.3,
          batteryInternalResistanceRatio: 5,
          batteryCapacityRatio: 0.02,
        }),
      });
      const decoded = decodeRecipe(encodeRecipe(recipe));
      expect(decoded.motorConfig.wireResistivityRatio).toBe(1.8);
      expect(decoded.motorConfig.wireDensityRatio).toBe(0.3);
      expect(decoded.motorConfig.batteryInternalResistanceRatio).toBe(5);
      expect(decoded.motorConfig.batteryCapacityRatio).toBe(0.02);
    });

    it('下限未満・上限超過はそれぞれの範囲へclampされる', () => {
      const recipe = fullRecipe({
        motorConfig: fullMotorConfig({
          wireResistivityRatio: 999,
          wireDensityRatio: -5,
          batteryInternalResistanceRatio: -1,
          batteryCapacityRatio: 999999,
        }),
      });
      const decoded = decodeRecipe(encodeRecipe(recipe));
      expect(decoded.motorConfig.wireResistivityRatio).toBe(2.0);
      expect(decoded.motorConfig.wireDensityRatio).toBe(0.2);
      expect(decoded.motorConfig.batteryInternalResistanceRatio).toBe(0.01);
      expect(decoded.motorConfig.batteryCapacityRatio).toBe(10);
    });
  });

  describe('17. 新4フィールドの異常値処理(既存numAtパターンへの完全な追従、特別扱いなし)', () => {
    it('キー欠落はfallback=1.0になる(validRawFieldsは新4フィールドのキーを持たない)', () => {
      const raw = JSON.stringify({ v: 3, ...validRawFields, sd: 1 });
      const decoded = decodeRecipe(buildRawMc3Code(raw));
      expect(decoded.motorConfig.wireResistivityRatio).toBe(1);
      expect(decoded.motorConfig.wireDensityRatio).toBe(1);
      expect(decoded.motorConfig.batteryInternalResistanceRatio).toBe(1);
      expect(decoded.motorConfig.batteryCapacityRatio).toBe(1);
      // P3-3(正式Fable P3-3-Q10裁定確定、Suu再照合是正): 旧MC3 payload(bcr/bprキーを
      // 持たない、validRawFieldsがまさにその代表例)をデコードした場合もbcr/bprが
      // 両方fallback=1(=カーボンanchor)へ意味論的に正しく復元される(MC3版上げ不要の根拠)。
      expect(decoded.motorConfig.brushContactResistanceRatio).toBe(1);
      expect(decoded.motorConfig.brushChatterProbabilityRatio).toBe(1);
    });

    it('null・文字列型等の型不一致はfallback=1.0になる', () => {
      const raw = JSON.stringify({
        v: 3,
        m: { ...validRawFields.m, wr: null, wz: 'not-a-number', br: true, bc: [1, 2] },
        c: validRawFields.c,
        a: validRawFields.a,
        sd: 1,
      });
      const decoded = decodeRecipe(buildRawMc3Code(raw));
      expect(decoded.motorConfig.wireResistivityRatio).toBe(1);
      expect(decoded.motorConfig.wireDensityRatio).toBe(1);
      expect(decoded.motorConfig.batteryInternalResistanceRatio).toBe(1);
      expect(decoded.motorConfig.batteryCapacityRatio).toBe(1);
    });

    it('JSON数値としてパース後Infinityになる巨大指数値(1e400等)はfallback=1.0になる(Number.isFiniteによる既存の検出)', () => {
      // ソース上でJS数値リテラルとして1e400を書くとJSON.stringify段階でnullに
      // 落ちてしまうため、既存の型不正テスト(13)と同じ手法で文字列置換により
      // 直接埋め込む(JSON構文としては合法な巨大指数リテラル)
      const raw = JSON.stringify({
        v: 3,
        m: { ...validRawFields.m, wr: 10, wz: 1, br: 1, bc: 1 },
        c: validRawFields.c,
        a: validRawFields.a,
        sd: 1,
      }).replace('"wr":10', '"wr":1e400');
      const decoded = decodeRecipe(buildRawMc3Code(raw));
      expect(decoded.motorConfig.wireResistivityRatio).toBe(1);
    });

    it('有限だが範囲外の負値・0はclampされる(範囲外の値であって欠落ではないため、fallback=1.0にはならない)', () => {
      const raw = JSON.stringify({
        v: 3,
        m: { ...validRawFields.m, wr: -5, wz: 0, br: -1, bc: 0 },
        c: validRawFields.c,
        a: validRawFields.a,
        sd: 1,
      });
      const decoded = decodeRecipe(buildRawMc3Code(raw));
      expect(decoded.motorConfig.wireResistivityRatio).toBe(0.5);
      expect(decoded.motorConfig.wireDensityRatio).toBe(0.2);
      expect(decoded.motorConfig.batteryInternalResistanceRatio).toBe(0.01);
      expect(decoded.motorConfig.batteryCapacityRatio).toBe(0.01);
    });

    it('JSON構文としてNaN/Infinityという裸tokenを埋め込んだ文字列はJSON.parse自体が失敗し、RecipeCodeErrorになる(JSON仕様上の非合法構文)', () => {
      const brokenPayload = testEncodeBase64Url('{"v":3,"m":{"wr":NaN}}');
      const code = `MC3-${brokenPayload}.${testChecksum(brokenPayload)}`;
      expect(() => decodeRecipe(code)).toThrow(RecipeCodeError);
    });
  });

  describe('18. namespace内key一意性(Fable承認済み付帯条件、m/c/a全namespaceを恒久検査)', () => {
    it('RECIPE_M_FIELD_KEYSはnamespace内に重複がない', () => {
      expect(new Set(RECIPE_M_FIELD_KEYS).size).toBe(RECIPE_M_FIELD_KEYS.length);
    });
    it('RECIPE_C_FIELD_KEYSはnamespace内に重複がない', () => {
      expect(new Set(RECIPE_C_FIELD_KEYS).size).toBe(RECIPE_C_FIELD_KEYS.length);
    });
    it('RECIPE_A_FIELD_KEYSはnamespace内に重複がない', () => {
      expect(new Set(RECIPE_A_FIELD_KEYS).size).toBe(RECIPE_A_FIELD_KEYS.length);
    });
  });

  // MotorConfig/CarConfig/CarAppearanceの長名フィールドの期待集合(interfaceの
  // フィールド名そのもの)。RECIPE_*_FIELD_KEYS(短縮key)とは1:1対応するが別の
  // 名前空間(長名 vs 短縮key)のため、fixtureの完全性はこちらの長名集合で
  // 直接検査する(encode後のpayloadはencodeRecipe内部のnormalizeMotorFields等が
  // 省略optionalへも常にdefault値を補って出力するため、payload側のkey数だけを
  // 見てもfixtureがoptionalを明示設定しているかどうかは判別できない、指摘1反映)。
  const EXPECTED_MOTOR_CONFIG_KEYS = [
    'coilTurns', 'slitWidthMm', 'sandingQuality', 'brushPressure', 'magnetStrength',
    'magnetDistanceMm', 'batteryVoltage', 'axisOffsetMm', 'wireGaugeMm', 'parallelStrands',
    'varnished', 'wireResistivityRatio', 'wireDensityRatio', 'batteryInternalResistanceRatio',
    'batteryCapacityRatio', 'brushContactResistanceRatio', 'brushChatterProbabilityRatio',
  ] as const;
  const EXPECTED_CAR_CONFIG_KEYS = [
    'massG', 'gearRatio', 'gearEfficiency', 'wheelDiameterMm', 'tireGrip',
    'axleFriction', 'wheelAlignmentMm', 'centerOfMassHeightMm', 'motorMountOffsetMm',
  ] as const;
  const EXPECTED_APPEARANCE_KEYS = ['bodyColorId', 'accentColorId'] as const;

  describe('19. fixtureの完全性(長名フィールドの明示設定を直接検査、指摘1反映)', () => {
    it('fullMotorConfig()はMotorConfigの全フィールド(新4フィールド込み)を明示設定しており、Object.keysの件数・集合がRECIPE_M_FIELD_KEYS.lengthおよび期待集合と一致する', () => {
      const keys = Object.keys(fullMotorConfig());
      expect(keys.length).toBe(RECIPE_M_FIELD_KEYS.length);
      expect(new Set(keys)).toEqual(new Set(EXPECTED_MOTOR_CONFIG_KEYS));
      expect(keys).toContain('wireResistivityRatio');
      expect(keys).toContain('wireDensityRatio');
      expect(keys).toContain('batteryInternalResistanceRatio');
      expect(keys).toContain('batteryCapacityRatio');
      expect(keys).toContain('brushContactResistanceRatio');
      expect(keys).toContain('brushChatterProbabilityRatio');
    });

    it('fullCarConfig()/fullAppearance()もRECIPE_C_FIELD_KEYS/RECIPE_A_FIELD_KEYSと件数・集合が一致する', () => {
      const carKeys = Object.keys(fullCarConfig());
      const appearanceKeys = Object.keys(fullAppearance());
      expect(carKeys.length).toBe(RECIPE_C_FIELD_KEYS.length);
      expect(new Set(carKeys)).toEqual(new Set(EXPECTED_CAR_CONFIG_KEYS));
      expect(appearanceKeys.length).toBe(RECIPE_A_FIELD_KEYS.length);
      expect(new Set(appearanceKeys)).toEqual(new Set(EXPECTED_APPEARANCE_KEYS));
    });
  });

  describe('20. authoritative key配列と実装(motorConfigToFields等)とのドリフト検査', () => {
    it('全フィールド明示設定済みのfullMotorConfig()/fullCarConfig()/fullAppearance()から実際にencodeされたpayloadのkey集合が、RECIPE_*_FIELD_KEYSの集合と一致する', () => {
      const code = encodeRecipe(fullRecipe());
      const { m, c, a } = extractPayloadKeys(code);
      expect(m.length).toBe(RECIPE_M_FIELD_KEYS.length);
      expect(c.length).toBe(RECIPE_C_FIELD_KEYS.length);
      expect(a.length).toBe(RECIPE_A_FIELD_KEYS.length);
      expect(new Set(m)).toEqual(new Set(RECIPE_M_FIELD_KEYS));
      expect(new Set(c)).toEqual(new Set(RECIPE_C_FIELD_KEYS));
      expect(new Set(a)).toEqual(new Set(RECIPE_A_FIELD_KEYS));
    });
  });

  describe('21. encode入力側のNaN/Infinity(計画v2 §9(a)、指摘2反映)', () => {
    it('encodeRecipeへ渡すMotorConfig側の新4フィールドがNaN/Infinityの場合、encode前のnormalizeで1.0へfallbackする', () => {
      const recipe = fullRecipe({
        motorConfig: fullMotorConfig({
          wireResistivityRatio: NaN,
          wireDensityRatio: Infinity,
          batteryInternalResistanceRatio: NaN,
          batteryCapacityRatio: -Infinity,
        }),
      });
      const decoded = decodeRecipe(encodeRecipe(recipe));
      expect(decoded.motorConfig.wireResistivityRatio).toBe(1);
      expect(decoded.motorConfig.wireDensityRatio).toBe(1);
      expect(decoded.motorConfig.batteryInternalResistanceRatio).toBe(1);
      expect(decoded.motorConfig.batteryCapacityRatio).toBe(1);
    });
  });

  describe('22. クランプの正確な境界値(計画v2 §6、指摘3反映)', () => {
    it('各フィールドの下限がそのまま保持される(clampされて消えない)', () => {
      const recipe = fullRecipe({
        motorConfig: fullMotorConfig({
          wireResistivityRatio: 0.5,
          wireDensityRatio: 0.2,
          batteryInternalResistanceRatio: 0.01,
          batteryCapacityRatio: 0.01,
        }),
      });
      const decoded = decodeRecipe(encodeRecipe(recipe));
      expect(decoded.motorConfig.wireResistivityRatio).toBe(0.5);
      expect(decoded.motorConfig.wireDensityRatio).toBe(0.2);
      expect(decoded.motorConfig.batteryInternalResistanceRatio).toBe(0.01);
      expect(decoded.motorConfig.batteryCapacityRatio).toBe(0.01);
    });

    it('各フィールドの上限がそのまま保持される(clampされて消えない)', () => {
      const recipe = fullRecipe({
        motorConfig: fullMotorConfig({
          wireResistivityRatio: 2.0,
          wireDensityRatio: 1.5,
          batteryInternalResistanceRatio: 10,
          batteryCapacityRatio: 10,
        }),
      });
      const decoded = decodeRecipe(encodeRecipe(recipe));
      expect(decoded.motorConfig.wireResistivityRatio).toBe(2.0);
      expect(decoded.motorConfig.wireDensityRatio).toBe(1.5);
      expect(decoded.motorConfig.batteryInternalResistanceRatio).toBe(10);
      expect(decoded.motorConfig.batteryCapacityRatio).toBe(10);
    });
  });

  describe('23. P3-3-Q14: encodeRecipeのeffectiveTurnsRatio fail-fast(正式Fable裁定確定、候補c)', () => {
    it('effectiveTurnsRatioがundefinedのMotorConfigはthrowしない(成功系、既存呼び出しの無改修動作を固定)', () => {
      const recipe = fullRecipe();
      expect(() => encodeRecipe(recipe)).not.toThrow();
    });

    it('effectiveTurnsRatioが1のMotorConfigはthrowしない(base configとして正当な値)', () => {
      const recipe = fullRecipe({ motorConfig: fullMotorConfig({ effectiveTurnsRatio: 1 }) });
      expect(() => encodeRecipe(recipe)).not.toThrow();
    });

    it('effectiveTurnsRatioが1未満のMotorConfigはRecipeCodeErrorをthrowし、文言にP3-3-Q14を含む', () => {
      const recipe = fullRecipe({ motorConfig: fullMotorConfig({ effectiveTurnsRatio: 0.7 }) });
      expect(() => encodeRecipe(recipe)).toThrow(RecipeCodeError);
      expect(() => encodeRecipe(recipe)).toThrow(/P3-3-Q14/);
    });

    it('effectiveTurnsRatioが1超のMotorConfigもRecipeCodeErrorをthrowし、文言にP3-3-Q14を含む', () => {
      const recipe = fullRecipe({ motorConfig: fullMotorConfig({ effectiveTurnsRatio: 1.3 }) });
      expect(() => encodeRecipe(recipe)).toThrow(RecipeCodeError);
      expect(() => encodeRecipe(recipe)).toThrow(/P3-3-Q14/);
    });
  });

  describe('24. P3-3-Q10: bcr/bprの非既定値round-trip(Suu再照合是正、取り違え・片方脱落の検出)', () => {
    it('brushContactResistanceRatio/brushChatterProbabilityRatioへ異なる非既定値を設定すると、それぞれ元のフィールドへ独立に保持される', () => {
      const recipe = fullRecipe({
        motorConfig: fullMotorConfig({
          brushContactResistanceRatio: 1.25,
          brushChatterProbabilityRatio: 0.75,
        }),
      });
      const decoded = decodeRecipe(encodeRecipe(recipe));
      // 値を意図的に非対称にすることで、bcr/bprの取り違え(キーの実装ミスによる
      // 入れ替わり)や片方だけのfallback脱落を検出できるようにする。
      expect(decoded.motorConfig.brushContactResistanceRatio).toBe(1.25);
      expect(decoded.motorConfig.brushChatterProbabilityRatio).toBe(0.75);
    });

    it('brushContactResistanceRatio/brushChatterProbabilityRatioを入れ替えた値でも独立に保持される(取り違えバグの反証)', () => {
      const recipe = fullRecipe({
        motorConfig: fullMotorConfig({
          brushContactResistanceRatio: 0.6,
          brushChatterProbabilityRatio: 2.0,
        }),
      });
      const decoded = decodeRecipe(encodeRecipe(recipe));
      expect(decoded.motorConfig.brushContactResistanceRatio).toBe(0.6);
      expect(decoded.motorConfig.brushChatterProbabilityRatio).toBe(2.0);
    });
  });
});
