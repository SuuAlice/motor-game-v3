// P3-4 G1a: computeRecipeKey(docs/phase3-p3-4-plan.md v12 §13.2、R2確定裁定, null)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeRecipeKey, RECIPE_KEY_VERSION, validateMaterialComposedBase } from '../recipeKey';
import { encodeWindingRecordCanonical, type WindingRecord } from '../windingRecord';
import type { MaterialSelection } from '../materialMapping';
import type { MotorConfig } from '../../engine/motorPhysics';
import type { CarConfig } from '../../engine/vehiclePhysics';

function goodSelection(overrides: Partial<MaterialSelection> = {}): MaterialSelection {
  return {
    wireId: 'wire-copper-standard',
    magnetId: 'magnet-ferrite',
    gearId: 'gear-pom',
    batteryId: 'battery-alkaline',
    brushId: 'brush-carbon',
    ...overrides,
  };
}

function goodMotorConfig(overrides: Partial<MotorConfig> = {}): MotorConfig {
  return {
    coilTurns: 80,
    slitWidthMm: 1.5,
    sandingQuality: 0.9,
    brushPressure: 0.3,
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

function goodCarConfig(overrides: Partial<CarConfig> = {}): CarConfig {
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

describe('recipeKey.ts: computeRecipeKey(§13.2, null)', () => {
  it('同一構成では常に同一キーを返す(冪等性)', () => {
    const key1 = computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), null);
    const key2 = computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), null);
    expect(key1).toBe(key2);
  });

  it('envelope形式(v{n}|...)で始まる', () => {
    const key = computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), null);
    expect(key.startsWith(`v${RECIPE_KEY_VERSION}|`)).toBe(true);
  });

  it('素材ID(R2確定)が異なると異なるキーになる(wireId違い)', () => {
    const a = computeRecipeKey(goodSelection({ wireId: 'wire-copper-standard' }), goodMotorConfig(), goodCarConfig(), null);
    const b = computeRecipeKey(goodSelection({ wireId: 'wire-silver' }), goodMotorConfig(), goodCarConfig(), null);
    expect(a).not.toBe(b);
  });

  it('gearId(素材ID)が異なると異なるキーになる', () => {
    const a = computeRecipeKey(goodSelection({ gearId: 'gear-pom' }), goodMotorConfig(), goodCarConfig(), null);
    const b = computeRecipeKey(goodSelection({ gearId: 'gear-titanium' }), goodMotorConfig(), goodCarConfig(), null);
    expect(a).not.toBe(b);
  });

  it('player-adjustable値(coilTurns)が異なると異なるキーになる', () => {
    const a = computeRecipeKey(goodSelection(), goodMotorConfig({ coilTurns: 80 }), goodCarConfig(), null);
    const b = computeRecipeKey(goodSelection(), goodMotorConfig({ coilTurns: 81 }), goodCarConfig(), null);
    expect(a).not.toBe(b);
  });

  it('brushContactResistanceRatio/brushChatterProbabilityRatio(D1是正で追加)が異なる2構成は異なるrecipeKeyを生成する', () => {
    const a = computeRecipeKey(goodSelection(), goodMotorConfig({ brushContactResistanceRatio: 1.0 }), goodCarConfig(), null);
    const b = computeRecipeKey(goodSelection(), goodMotorConfig({ brushContactResistanceRatio: 1.3 }), goodCarConfig(), null);
    const c = computeRecipeKey(goodSelection(), goodMotorConfig({ brushChatterProbabilityRatio: 1.0 }), goodCarConfig(), null);
    const d = computeRecipeKey(goodSelection(), goodMotorConfig({ brushChatterProbabilityRatio: 0.7 }), goodCarConfig(), null);
    expect(a).not.toBe(b);
    expect(c).not.toBe(d);
  });

  it('CarConfigの値(gearRatio)が異なると異なるキーになる', () => {
    const a = computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig({ gearRatio: 4 }), null);
    const b = computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig({ gearRatio: 8 }), null);
    expect(a).not.toBe(b);
  });

  it('optionalフィールド省略時は既定値で正規化され、明示的に既定値を渡した場合と同一キーになる', () => {
    const omitted = computeRecipeKey(goodSelection(), goodMotorConfig({ wireGaugeMm: undefined, parallelStrands: undefined }), goodCarConfig(), null);
    const explicit = computeRecipeKey(goodSelection(), goodMotorConfig({ wireGaugeMm: 0.4, parallelStrands: 1 }), goodCarConfig(), null);
    expect(omitted).toBe(explicit);
  });

  it('varnished=false/trueで異なるキーになる(booleanの0/1正規化)', () => {
    const a = computeRecipeKey(goodSelection(), goodMotorConfig({ varnished: true }), goodCarConfig(), null);
    const b = computeRecipeKey(goodSelection(), goodMotorConfig({ varnished: false }), goodCarConfig(), null);
    expect(a).not.toBe(b);
  });

  it('-0と+0は同一キーになる(-0正規化)', () => {
    const a = computeRecipeKey(goodSelection(), goodMotorConfig({ axisOffsetMm: 0 }), goodCarConfig(), null);
    const b = computeRecipeKey(goodSelection(), goodMotorConfig({ axisOffsetMm: -0 }), goodCarConfig(), null);
    expect(a).toBe(b);
  });

  it('NaN/Infinityが混入するとthrowする(base configは§12検証済みのため理論上到達しない防御的コード)', () => {
    expect(() => computeRecipeKey(goodSelection(), goodMotorConfig({ coilTurns: NaN }), goodCarConfig(), null)).toThrow();
    expect(() => computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig({ gearRatio: Infinity }), null)).toThrow();
  });

  // Suu_mot3 G1a照合是正P1: gearReflectedInertiaKgM2(§13.2 10項目目、G3で`CarConfig`へ
  // 追加予定)はG1a時点からexact設計どおり読み込む。
  // P4-1A(2026-08-28人間承認): windingTurnsRatio追加により1→2へ昇版した。
  it('RECIPE_KEY_VERSIONは2である(P4-1Aで1→2へ昇版)', () => {
    expect(RECIPE_KEY_VERSION).toBe(2);
  });

  it('gearReflectedInertiaKgM2未指定と明示0は同一キーになる(既定0への正規化)', () => {
    const omitted = computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), null);
    const explicitZero = computeRecipeKey(goodSelection(), goodMotorConfig(), { ...goodCarConfig(), gearReflectedInertiaKgM2: 0 } as CarConfig, null);
    expect(omitted).toBe(explicitZero);
  });

  it('gearReflectedInertiaKgM2が非zero値だと異なるキーになる(G1a時点からexact設計どおり読み込まれている証明)', () => {
    const zero = computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), null);
    const nonZero = computeRecipeKey(goodSelection(), goodMotorConfig(), { ...goodCarConfig(), gearReflectedInertiaKgM2: 3.9e-10 } as CarConfig, null);
    expect(zero).not.toBe(nonZero);
  });
});

// ---------------------------------------------------------------------------
// P3-4-Q10 §8 + §8補足裁定: validateMaterialComposedBase
// (設計 docs/phase3-p3-4-q10-alice-design-v2.md §9、人間再承認項目Q承認済み 2026-08-18)
// ---------------------------------------------------------------------------

describe('recipeKey.ts: validateMaterialComposedBase(P3-4-Q10 §8)', () => {
  // 28エントリの完全な列挙(MotorConfig 18件〈P4-1AでwindingTurnsRatio追加〉+CarConfig 10件)。
  // computeRecipeKeyが読む集合の「仕様側」の記述であり、実装側(非exportのcollector)とは
  // 独立にここへ書き下すことで、実装がこの集合から乖離した場合にテストが落ちる。
  //
  // 検査の内訳(Suu_mot3独立レビューP2是正、2026-08-18。P4-1AでwindingTurnsRatio追加により
  // 件数を更新): **数値入力27件のNaN双方向同期** + **varnished正規化domain 3件**
  // + **公開API件数28**。28件全部をNaNへ差し替えるのではない
  // ——残る1件のmotorConfig.varnishedはboolean型で、collector内で0/1へ正規化されるため
  // NaN差替えが型・意味の双方で実施不能である(設計v2 §2「varnishedは有限性の論点を持たない」)。
  // そのvarnishedについては、NaNの代わりにdomain全域(true/false/undefined)を明示的に固定する。
  const MOTOR_ENTRY_MUTATIONS: Array<[string, (v: number) => Partial<MotorConfig>]> = [
    ['coilTurns', (v) => ({ coilTurns: v })],
    ['slitWidthMm', (v) => ({ slitWidthMm: v })],
    ['sandingQuality', (v) => ({ sandingQuality: v })],
    ['brushPressure', (v) => ({ brushPressure: v })],
    ['magnetStrength', (v) => ({ magnetStrength: v })],
    ['magnetDistanceMm', (v) => ({ magnetDistanceMm: v })],
    ['batteryVoltage', (v) => ({ batteryVoltage: v as MotorConfig['batteryVoltage'] })],
    ['axisOffsetMm', (v) => ({ axisOffsetMm: v })],
    ['wireGaugeMm', (v) => ({ wireGaugeMm: v })],
    ['parallelStrands', (v) => ({ parallelStrands: v as MotorConfig['parallelStrands'] })],
    ['wireResistivityRatio', (v) => ({ wireResistivityRatio: v })],
    ['wireDensityRatio', (v) => ({ wireDensityRatio: v })],
    ['batteryInternalResistanceRatio', (v) => ({ batteryInternalResistanceRatio: v })],
    ['batteryCapacityRatio', (v) => ({ batteryCapacityRatio: v })],
    ['brushContactResistanceRatio', (v) => ({ brushContactResistanceRatio: v })],
    ['brushChatterProbabilityRatio', (v) => ({ brushChatterProbabilityRatio: v })],
    // P4-1Aで追加。NaNは有限性検査(層1)で弾かれるため、他の乗数エントリと同じ扱いになる
    // (範囲(0,1]の検査は層3で、専用のテストが別にある)。
    ['windingTurnsRatio', (v) => ({ windingTurnsRatio: v })],
  ];

  const CAR_ENTRY_MUTATIONS: Array<[string, (v: number) => Partial<CarConfig>]> = [
    ['massG', (v) => ({ massG: v })],
    ['gearRatio', (v) => ({ gearRatio: v })],
    ['gearEfficiency', (v) => ({ gearEfficiency: v })],
    ['wheelDiameterMm', (v) => ({ wheelDiameterMm: v })],
    ['tireGrip', (v) => ({ tireGrip: v })],
    ['axleFriction', (v) => ({ axleFriction: v })],
    ['wheelAlignmentMm', (v) => ({ wheelAlignmentMm: v })],
    ['centerOfMassHeightMm', (v) => ({ centerOfMassHeightMm: v })],
    ['motorMountOffsetMm', (v) => ({ motorMountOffsetMm: v })],
    ['gearReflectedInertiaKgM2', (v) => ({ gearReflectedInertiaKgM2: v }) as Partial<CarConfig>],
  ];

  // varnishedはbooleanを0/1へ正規化するエントリであり、非有限値を取り得ない(型上boolean)。
  // したがってNaN差替えによる負例の対象外だが、28エントリの1件として件数には含まれる。
  const NON_MUTABLE_ENTRY_COUNT = 1; // motorConfig.varnished
  const TOTAL_ENTRY_COUNT = MOTOR_ENTRY_MUTATIONS.length + NON_MUTABLE_ENTRY_COUNT + CAR_ENTRY_MUTATIONS.length;

  // §9-1: 正常系
  it('有効なbase configではok:trueを返す', () => {
    expect(validateMaterialComposedBase(goodMotorConfig(), goodCarConfig())).toEqual({ ok: true });
  });

  // §9-2: 負例(base由来・composeが検証しない引き継ぎフィールド)
  it.each([
    ['carConfig.gearRatio', NaN],
    ['carConfig.wheelDiameterMm', Infinity],
    ['carConfig.tireGrip', -Infinity],
  ])('composeが検証しないbase由来フィールド(%s)の非有限値をok:falseで拒否する', (label, badValue) => {
    const field = label.replace('carConfig.', '');
    const mutation = CAR_ENTRY_MUTATIONS.find(([name]) => name === field);
    if (!mutation) throw new Error(`テスト前提が崩れています: ${field}の変異関数が見つかりません`);
    const result = validateMaterialComposedBase(goodMotorConfig(), goodCarConfig(mutation[1](badValue as number)));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('到達しない');
    expect(result.reason).toContain(label);
    expect(result.reason).toContain('非有限');
  });

  it('composeが検証しないbase由来フィールド(motorConfig.coilTurns)の非有限値をok:falseで拒否する', () => {
    const result = validateMaterialComposedBase(goodMotorConfig({ coilTurns: NaN }), goodCarConfig());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('到達しない');
    expect(result.reason).toContain('motorConfig.coilTurns');
  });

  // §9-3: 負例(compose設定側フィールド。組み立て後の最終オブジェクトに対する唯一の検査)
  it('composeが設定するフィールド(motorConfig.magnetStrength)の非有限値もok:falseで拒否する', () => {
    const result = validateMaterialComposedBase(goodMotorConfig({ magnetStrength: NaN }), goodCarConfig());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('到達しない');
    expect(result.reason).toContain('motorConfig.magnetStrength');
  });

  // §9-4(必須): 件数固定。公開APIのみを用いる——computeRecipeKeyの出力書式
  // `v{n}|{ids}|{numbers}` の第3セグメントの要素数が28であることを固定する。
  // 非exportのcollectorへフィールドを足し忘れた/重複させた場合にここで検出される。
  // P4-1AでwindingTurnsRatioが加わり27→28。件数を固定する意味(collectorへの足し忘れ・
  // 重複の検出)は変わらない。
  it('computeRecipeKeyの数値エントリ数は28である(件数固定、公開APIのみで検査)', () => {
    const key = computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), null);
    const segments = key.split('|');
    // P4-1Aで第4セグメント(canonical巻線記録、legacyは'none')が加わり3→4。
    expect(segments).toHaveLength(4);
    expect(segments[2].split(',')).toHaveLength(28);
    expect(segments[3]).toBe('none');
  });

  it('テスト側の28エントリ列挙が実装と一致している(仕様側の記述が実装から乖離していないことの固定)', () => {
    expect(TOTAL_ENTRY_COUNT).toBe(28);
  });

  // §9-5(必須): 双方向同期。検査集合 ⊆ throw集合、および throw集合 ⊆ 検査集合。
  it.each(MOTOR_ENTRY_MUTATIONS)(
    '双方向同期(motorConfig.%s): NaN差替えでvalidatorがok:falseを返し、かつcomputeRecipeKeyがthrowする',
    (label, mutate) => {
      const motorConfig = goodMotorConfig(mutate(NaN));
      const result = validateMaterialComposedBase(motorConfig, goodCarConfig());
      expect(result.ok).toBe(false); // 検査集合に含まれる
      expect(() => computeRecipeKey(goodSelection(), motorConfig, goodCarConfig(), null)).toThrow(); // throw集合にも含まれる
      if (result.ok) throw new Error('到達しない');
      expect(result.reason).toContain(`motorConfig.${label}`);
    },
  );

  it.each(CAR_ENTRY_MUTATIONS)(
    '双方向同期(carConfig.%s): NaN差替えでvalidatorがok:falseを返し、かつcomputeRecipeKeyがthrowする',
    (label, mutate) => {
      const carConfig = goodCarConfig(mutate(NaN));
      const result = validateMaterialComposedBase(goodMotorConfig(), carConfig);
      expect(result.ok).toBe(false);
      expect(() => computeRecipeKey(goodSelection(), goodMotorConfig(), carConfig, null)).toThrow();
      if (result.ok) throw new Error('到達しない');
      expect(result.reason).toContain(`carConfig.${label}`);
    },
  );

  // varnished(28エントリのうちNaN差替え不能な1件)はboolean型でNaN差替えが型上不可能なため、NaN双方向同期の
  // 代わりにdomain全域(true/false/undefined)をvalidator側・computeRecipeKey側の両方で
  // 明示的に閉包する(Suu_mot3独立レビューP2是正、2026-08-18)。
  it.each([[true], [false], [undefined]])(
    'varnished=%sのときvalidateMaterialComposedBaseはok:trueを返す(varnished正規化domainの明示閉包)',
    (varnished) => {
      expect(validateMaterialComposedBase(goodMotorConfig({ varnished }), goodCarConfig())).toEqual({ ok: true });
    },
  );

  it.each([[true], [false], [undefined]])(
    'varnished=%sのときcomputeRecipeKeyはthrowしない(同domainのthrow集合側の閉包)',
    (varnished) => {
      expect(() => computeRecipeKey(goodSelection(), goodMotorConfig({ varnished }), goodCarConfig(), null)).not.toThrow();
    },
  );

  it('逆向き(throw集合 ⊆ 検査集合): validatorがok:trueを返す入力ではcomputeRecipeKeyはthrowしない', () => {
    const cases: Array<[MotorConfig, CarConfig]> = [
      [goodMotorConfig(), goodCarConfig()],
      [goodMotorConfig({ wireGaugeMm: undefined, parallelStrands: undefined, varnished: undefined }), goodCarConfig()],
      [goodMotorConfig({ effectiveTurnsRatio: 1 }), goodCarConfig()],
      [goodMotorConfig({ axisOffsetMm: -0 }), goodCarConfig({ gearReflectedInertiaKgM2: 3.9e-10 } as Partial<CarConfig>)],
    ];
    for (const [motorConfig, carConfig] of cases) {
      expect(validateMaterialComposedBase(motorConfig, carConfig)).toEqual({ ok: true });
      expect(() => computeRecipeKey(goodSelection(), motorConfig, carConfig, null)).not.toThrow();
    }
  });

  // §9-6(必須): effectiveTurnsRatioのbase契約(P3-3-Q12、P-Q10-A5確定)
  it.each([[undefined], [1]])('effectiveTurnsRatioが%sのときok:trueを返す(base契約 undefined | 1)', (value) => {
    expect(validateMaterialComposedBase(goodMotorConfig({ effectiveTurnsRatio: value }), goodCarConfig())).toEqual({ ok: true });
  });

  it.each([[2], [0.5], [NaN]])(
    'effectiveTurnsRatioが%sのときok:falseで拒否する(有限でも2/0.5はbase契約違反、P-Q10-A5)',
    (value) => {
      const result = validateMaterialComposedBase(goodMotorConfig({ effectiveTurnsRatio: value }), goodCarConfig());
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('到達しない');
      expect(result.reason).toContain('effectiveTurnsRatio');
    },
  );

  it('effectiveTurnsRatio違反はthrowせずResultで返る(P-Q10-A5: beginRun経路へ例外を伝播させない)', () => {
    expect(() => validateMaterialComposedBase(goodMotorConfig({ effectiveTurnsRatio: 2 }), goodCarConfig())).not.toThrow();
  });

  // §9-7: 既定値正規化(オプショナルundefinedは非有限扱いしない)
  it('オプショナルフィールドがundefinedでもok:trueを返す(既定値へ正規化される)', () => {
    const motorConfig = goodMotorConfig({
      wireGaugeMm: undefined,
      parallelStrands: undefined,
      varnished: undefined,
      wireResistivityRatio: undefined,
      wireDensityRatio: undefined,
      batteryInternalResistanceRatio: undefined,
      batteryCapacityRatio: undefined,
      brushContactResistanceRatio: undefined,
      brushChatterProbabilityRatio: undefined,
    });
    expect(validateMaterialComposedBase(motorConfig, goodCarConfig())).toEqual({ ok: true });
  });

  // §9-9: 純関数性(G1a′で確立した作法)
  it('引数を破壊せず、同一内容の別実体で同一の結果を返す(純関数性)', () => {
    const motorConfig = goodMotorConfig();
    const carConfig = goodCarConfig();
    const motorSnapshot = structuredClone(motorConfig);
    const carSnapshot = structuredClone(carConfig);

    const first = validateMaterialComposedBase(motorConfig, carConfig);
    expect(motorConfig).toEqual(motorSnapshot);
    expect(carConfig).toEqual(carSnapshot);

    const second = validateMaterialComposedBase(goodMotorConfig(), goodCarConfig());
    expect(second).toEqual(first);
  });

  it('失敗分岐でも引数を破壊せず、同一内容の別実体で同一の失敗結果を返す(純関数性・負例)', () => {
    const motorConfig = goodMotorConfig({ coilTurns: NaN });
    const carConfig = goodCarConfig();
    const motorSnapshot = structuredClone(motorConfig);
    const carSnapshot = structuredClone(carConfig);

    const first = validateMaterialComposedBase(motorConfig, carConfig);
    expect(motorConfig).toEqual(motorSnapshot);
    expect(carConfig).toEqual(carSnapshot);
    expect(first.ok).toBe(false);

    const second = validateMaterialComposedBase(goodMotorConfig({ coilTurns: NaN }), goodCarConfig());
    expect(second).toEqual(first);
  });
});

describe('recipeKey.ts: 構造検査(P3-4-Q10 §8、G1a′作法の踏襲)', () => {
  const SRC_DIR = fileURLToPath(new URL('../../', import.meta.url)); // src/materials/__tests__/ → src/
  const RECIPE_KEY_SOURCE = readFileSync(join(SRC_DIR, 'materials', 'recipeKey.ts'), 'utf-8');

  // G1a′(runOutcomeApplication.test.ts)で確立した禁止集合と同一。純関数が引数以外を
  // 読まないこと(store/ブラウザAPI/時刻/乱数等の非決定・環境依存の副作用源を参照しないこと)を固定する。
  const FORBIDDEN_GLOBAL_PATTERNS: RegExp[] = [
    /\buse[A-Za-z0-9_]*Store\b/,
    /\.getState\s*\(/,
    /\.setState\s*\(/,
    /\.subscribe\s*\(/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bwindow\b/,
    /\bdocument\b/,
    /\bglobalThis\b/,
    /\bprocess\b/,
    /\bDate\.now\s*\(/,
    /\bMath\.random\s*\(/,
    /\bperformance\.now\s*\(/,
    /\bcrypto\b/,
  ];

  function extractNamedFunctionBody(source: string, functionName: string): string {
    const headerPattern = new RegExp(`function ${functionName}\\b`);
    const headerMatch = headerPattern.exec(source);
    if (!headerMatch) throw new Error(`テスト前提が崩れています: ${functionName}の定義が見つかりません`);
    const parenStart = source.indexOf('(', headerMatch.index);
    if (parenStart === -1) throw new Error(`テスト前提が崩れています: ${functionName}の開始丸括弧が見つかりません`);
    let parenDepth = 0;
    let parenEnd = parenStart;
    for (; parenEnd < source.length; parenEnd++) {
      if (source[parenEnd] === '(') parenDepth++;
      else if (source[parenEnd] === ')') {
        parenDepth--;
        if (parenDepth === 0) { parenEnd++; break; }
      }
    }
    if (parenDepth !== 0) throw new Error(`テスト前提が崩れています: ${functionName}の引数リストの終了丸括弧を検出できませんでした`);
    const braceStart = source.indexOf('{', parenEnd);
    if (braceStart === -1) throw new Error(`テスト前提が崩れています: ${functionName}の開始波括弧が見つかりません`);
    let depth = 0;
    let i = braceStart;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    if (depth !== 0) throw new Error(`テスト前提が崩れています: ${functionName}の終了波括弧を検出できませんでした`);
    return source.slice(braceStart, i);
  }

  // 抽出範囲自体の恒久回帰テスト(G1a′ P7是正と同じ規律。空/過小抽出の偽陰性を防ぐ)。
  it.each([
    ['validateMaterialComposedBase', 'effectiveTurnsRatio'],
    ['collectRecipeKeyNumericFields', 'brushChatterProbabilityRatio'],
  ])('%sの抽出本体が既知トークン(%s)を含む(抽出範囲の恒久回帰)', (functionName, knownToken) => {
    const body = extractNamedFunctionBody(RECIPE_KEY_SOURCE, functionName);
    expect(body.length).toBeGreaterThan(100);
    expect(body).toContain(knownToken);
  });

  it.each([['validateMaterialComposedBase'], ['collectRecipeKeyNumericFields'], ['computeRecipeKey']])(
    '%sの本体はstore/localStorage/グローバル状態/時刻/乱数を一切参照しない(純関数性の構造検査)',
    (functionName) => {
      const body = extractNamedFunctionBody(RECIPE_KEY_SOURCE, functionName);
      for (const pattern of FORBIDDEN_GLOBAL_PATTERNS) {
        expect(body).not.toMatch(pattern);
      }
    },
  );

  // Suu_mot3独立コードレビュー是正(2026-08-18): 承認済み契約「公開面の増分は
  // validateMaterialComposedBase 1件のみ」(P-Q10-A1/A2、arbiter補足裁定質問4)を
  // 恒久的に固定する。結果型・collector・内部型aliasがexportへ漏れると落ちる。
  it('recipeKey.tsの公開export集合はRECIPE_KEY_VERSION/computeRecipeKey/validateMaterialComposedBaseの3件のみである(公開面の増分固定)', () => {
    const exportedNames = [...RECIPE_KEY_SOURCE.matchAll(/^export\s+(?:const|function|type|interface|class)\s+([A-Za-z0-9_]+)/gmu)].map((m) => m[1]);
    expect([...exportedNames].sort()).toEqual(['RECIPE_KEY_VERSION', 'computeRecipeKey', 'validateMaterialComposedBase'].sort());
    // export { ... } / export default による再公開も存在しないことを確認する。
    expect(RECIPE_KEY_SOURCE).not.toMatch(/^export\s*\{/mu);
    expect(RECIPE_KEY_SOURCE).not.toMatch(/^export\s+default\b/mu);
  });
});

describe('P4-1A: 巻線記録のrecipeKey収載', () => {
  const record: WindingRecord = Array.from({ length: 30 }, (_, i) => ({
    position: 0.25, arm: 'left' as const, direction: (i === 10 ? -1 : 1) as 1 | -1, tension: 0.5,
  }));

  it('巻線記録なし(legacy)はnone、ありはcanonical文字列そのものが入る', () => {
    const legacyKey = computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), null);
    const recordedKey = computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), record);
    expect(legacyKey.split('|')[3]).toBe('none');
    expect(recordedKey.split('|')[3]).toBe(encodeWindingRecordCanonical(record));
    expect(recordedKey).not.toBe(legacyKey);
  });

  it('巻線が1ターンでも違えば別のキーになる(要約・hashではない)', () => {
    const other = record.map((t, i) => (i === 10 ? { ...t, direction: 1 as const } : t));
    expect(computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), record))
      .not.toBe(computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), other));
  });

  it('同一の記録は同一のキーになる(別実体でも一致)', () => {
    const copy = record.map((t) => ({ ...t }));
    expect(computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), copy))
      .toBe(computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), record));
  });

  it('windingTurnsRatioはキーへ反映される(既定1.0で正規化)', () => {
    const base = computeRecipeKey(goodSelection(), goodMotorConfig(), goodCarConfig(), null);
    const explicitOne = computeRecipeKey(goodSelection(), { ...goodMotorConfig(), windingTurnsRatio: 1 }, goodCarConfig(), null);
    const wound = computeRecipeKey(goodSelection(), { ...goodMotorConfig(), windingTurnsRatio: 0.8 }, goodCarConfig(), null);
    expect(explicitOne).toBe(base);
    expect(wound).not.toBe(base);
  });
});

describe('P4-1A: validateMaterialComposedBaseの層3(windingTurnsRatio)', () => {
  it('undefinedと(0,1]は受理する', () => {
    for (const value of [undefined, 1, 0.9333, 1 / 256]) {
      const result = validateMaterialComposedBase({ ...goodMotorConfig(), windingTurnsRatio: value }, goodCarConfig());
      expect(result.ok, `value=${String(value)}`).toBe(true);
    }
  });

  it('0・負・1超・非有限は拒否する', () => {
    for (const value of [0, -0.1, 1.0001, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = validateMaterialComposedBase({ ...goodMotorConfig(), windingTurnsRatio: value }, goodCarConfig());
      expect(result.ok, `value=${String(value)}`).toBe(false);
    }
  });

  it('effectiveTurnsRatioのbase禁止契約は変更されていない(同じ0.9333で挙動が分かれる)', () => {
    expect(validateMaterialComposedBase({ ...goodMotorConfig(), effectiveTurnsRatio: 0.9333 }, goodCarConfig()).ok).toBe(false);
    expect(validateMaterialComposedBase({ ...goodMotorConfig(), windingTurnsRatio: 0.9333 }, goodCarConfig()).ok).toBe(true);
  });
});
