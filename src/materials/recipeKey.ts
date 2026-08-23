// P3-4 G1a: recipeKey設計(docs/phase3-p3-4-plan.md v12 §13.2、R2確定裁定で素材ID5フィールドを
// 先頭へ追加)。同一レシピ(素材選択+player-adjustable値)の判定に使うopaque文字列を、
// beginRun時に1回だけ計算する。動的run内状態・WearState由来の実効値は一切含めない。

import type { MaterialSelection } from './materialMapping';
import type { MotorConfig } from '../engine/motorPhysics';
import type { CarConfig } from '../engine/vehiclePhysics';

// Suu_mot3 G1a照合是正P1: 計画v12 §13.2はcarConfig.gearReflectedInertiaKgM2をexact設計として
// 最初から10項目目に含み、R2確定裁定は「RECIPE_KEY_VERSIONは1のまま最終形で開始」と明記する
// ——G3での`CarConfig.gearReflectedInertiaKgM2?`追加(人間再承認一覧G)を待ってversionを2へ
// 上げる設計は不可。本ローカル互換view型で、CarConfig本体をG3前に編集せずに10項目目を
// G1a時点から読む。G3で`CarConfig`へ`gearReflectedInertiaKgM2?`が追加された後は、この
// 局所view型を削除し`carConfig.gearReflectedInertiaKgM2`を直接参照する形へ単純化してよい
// (RECIPE_KEY_VERSIONは変更しない)。
type CarConfigWithGearReflectedInertia = CarConfig & { readonly gearReflectedInertiaKgM2?: number };

export const RECIPE_KEY_VERSION = 1;

/**
 * collectRecipeKeyNumericFieldsの1エントリ(非export)。
 *
 * 戻り値型をインラインのオブジェクト型リテラルではなく名前付き型にしているのは、関数本体を
 * ソーステキストから抽出する構造検査(recipeKey.test.ts)が、戻り値型注釈内の`{`を関数本体の
 * 開始と誤認して過小抽出する偽陰性を防ぐため(G1a′ P7是正と同じクラスの問題。実装時に実際に
 * 構造検査が検出した)。
 */
type RecipeKeyNumericField = { readonly label: string; readonly value: number };

/**
 * computeRecipeKeyが読む数値フィールドの単一出典(P3-4-Q10 §8補足裁定 P-Q10-A2、非export)。
 *
 * computeRecipeKey(canonical文字列化)とvalidateMaterialComposedBase(有限性検証)の双方が
 * このcollectorを呼ぶ。これにより「検査した集合」と「throwする集合」が独立した2箇所に
 * 存在して静かに乖離する構造そのものを排除する(P3-1-Q6「fail-fastより構築不能」の適用)。
 * フィールドを追加する場合はここ1箇所を編集すれば両者へ同時に反映される。
 *
 * 公開しない理由(P-Q10-A2、arbiter補足裁定質問4で承認): 呼び出し元(brabit側のgameStore)は
 * validateMaterialComposedBaseのみを呼び、collectorを直接必要としない。件数不変条件(27)は
 * computeRecipeKeyの出力文字列(第3セグメントの要素数)から公開APIのみで固定できるため、
 * テストのためのexportも不要である。
 *
 * labelは失敗理由の文言に用いる(どのフィールドが非有限だったかを具体的に示すため)。
 */
function collectRecipeKeyNumericFields(
  motorConfig: MotorConfig,
  carConfig: CarConfig,
): readonly RecipeKeyNumericField[] {
  return [
    // MotorConfig(全18フィールド中17フィールド、effectiveTurnsRatioのみ除く——P3-3-Q12により
    // base MotorConfigでは常にundefined||1に固定されているため、レシピ識別に寄与しない。
    // 同フィールドのbase契約はvalidateMaterialComposedBaseの層2で別途検証する)
    { label: 'motorConfig.coilTurns', value: motorConfig.coilTurns },
    { label: 'motorConfig.slitWidthMm', value: motorConfig.slitWidthMm },
    { label: 'motorConfig.sandingQuality', value: motorConfig.sandingQuality },
    { label: 'motorConfig.brushPressure', value: motorConfig.brushPressure },
    { label: 'motorConfig.magnetStrength', value: motorConfig.magnetStrength },
    { label: 'motorConfig.magnetDistanceMm', value: motorConfig.magnetDistanceMm },
    { label: 'motorConfig.batteryVoltage', value: motorConfig.batteryVoltage },
    { label: 'motorConfig.axisOffsetMm', value: motorConfig.axisOffsetMm },
    { label: 'motorConfig.wireGaugeMm', value: motorConfig.wireGaugeMm ?? 0.4 }, // 既定値で正規化(undefinedと明示値を区別しない)
    { label: 'motorConfig.parallelStrands', value: motorConfig.parallelStrands ?? 1 },
    { label: 'motorConfig.varnished', value: motorConfig.varnished === false ? 0 : 1 }, // booleanを0/1へ正規化
    { label: 'motorConfig.wireResistivityRatio', value: motorConfig.wireResistivityRatio ?? 1.0 },
    { label: 'motorConfig.wireDensityRatio', value: motorConfig.wireDensityRatio ?? 1.0 },
    { label: 'motorConfig.batteryInternalResistanceRatio', value: motorConfig.batteryInternalResistanceRatio ?? 1.0 },
    { label: 'motorConfig.batteryCapacityRatio', value: motorConfig.batteryCapacityRatio ?? 1.0 },
    { label: 'motorConfig.brushContactResistanceRatio', value: motorConfig.brushContactResistanceRatio ?? 1.0 },
    { label: 'motorConfig.brushChatterProbabilityRatio', value: motorConfig.brushChatterProbabilityRatio ?? 1.0 },
    // CarConfig(§13.2のexact設計どおり10フィールド全て、P1是正)
    { label: 'carConfig.massG', value: carConfig.massG },
    { label: 'carConfig.gearRatio', value: carConfig.gearRatio },
    { label: 'carConfig.gearEfficiency', value: carConfig.gearEfficiency },
    { label: 'carConfig.wheelDiameterMm', value: carConfig.wheelDiameterMm },
    { label: 'carConfig.tireGrip', value: carConfig.tireGrip },
    { label: 'carConfig.axleFriction', value: carConfig.axleFriction },
    { label: 'carConfig.wheelAlignmentMm', value: carConfig.wheelAlignmentMm },
    { label: 'carConfig.centerOfMassHeightMm', value: carConfig.centerOfMassHeightMm },
    { label: 'carConfig.motorMountOffsetMm', value: carConfig.motorMountOffsetMm },
    { label: 'carConfig.gearReflectedInertiaKgM2', value: (carConfig as CarConfigWithGearReflectedInertia).gearReflectedInertiaKgM2 ?? 0 },
  ];
}

/**
 * MaterialSelection(素材ID5フィールド、R2確定)+base MotorConfig/CarConfig(Wear反映前、
 * RunSnapshot capture前の値)から、性能に影響する値のみをcanonical文字列化する。
 * DestructionState等の動的run内状態、およびWearState由来の実効値は一切含めない。
 */
export function computeRecipeKey(selection: MaterialSelection, motorConfig: MotorConfig, carConfig: CarConfig): string {
  // 素材ID5フィールド(R2確定、固定順)。文字列そのまま、正規化不要(列挙型IDのため
  // -0/NaN/Infinity等の懸念がない)。
  const materialIds: string[] = [selection.wireId, selection.magnetId, selection.gearId, selection.batteryId, selection.brushId];

  // 数値フィールドはcollectorを単一出典として取得する(P-Q10-A2、公開シグネチャ・出力文字列は不変)。
  const fields: number[] = collectRecipeKeyNumericFields(motorConfig, carConfig).map((field) => field.value);

  // -0/NaN/Infinityの正規化: -0は+0へ、NaN/Infinityは変換不能(呼び出し前提が崩れているため
  // 計算しない、事前条件違反としてthrowする——base configは常に有限値の検証済み値であるため、
  // この分岐は理論上到達しない防御的コード)。beginRun経路では、この事前条件を
  // validateMaterialComposedBaseがResultとして先出しするため、throwへは到達しない。
  const normalized = fields.map((v) => {
    if (!Number.isFinite(v)) throw new Error(`computeRecipeKey: 非有限値が渡されました: ${v}`);
    return v === 0 ? 0 : v; // -0を+0へ正規化(Object.is(-0,0)はfalseだが-0+0===0を利用)
  });

  return `v${RECIPE_KEY_VERSION}|${materialIds.join(',')}|${normalized.join(',')}`;
}

/**
 * validateMaterialComposedBaseの結果(P3-4-Q10 §8、P-Q10-A1)。
 *
 * 非exportである理由(Suu_mot3独立コードレビュー是正、2026-08-18): 承認済み契約は
 * 「公開面の増分はvalidateMaterialComposedBase 1件のみ」(P-Q10-A1/A2、arbiter補足裁定質問4)
 * であり、結果型をexportすると公開exportが2件へ増えて契約違反になる。呼び出し側は
 * 戻り値を構造的に(`result.ok`の判別で)扱えるため、型名のexportは不要である。
 */
type ValidateMaterialComposedBaseResult = { ok: true } | { ok: false; reason: string };

/**
 * materialComposedBase(Wear適用前のbase MotorConfig/CarConfig)が、beginRun経路へ進んでよい
 * 値であることを検証する純関数(P3-4-Q10 §8 + §8補足裁定、P-Q10-A1・A4・A5、人間再承認済み)。
 *
 * 検証は2層(P-Q10-A4、依存閉包による十分性証明はdocs/phase3-p3-4-q10-alice-design-v2.md §2):
 *
 * - 層1: computeRecipeKeyが読む27エントリすべての有限性(collectorを単一出典として共有)。
 *   MotorConfigの宣言18フィールドのうち17件+CarConfigの宣言9フィールド全件+将来フィールド
 *   gearReflectedInertiaKgM2で、宣言フィールド全数から漏れるのはeffectiveTurnsRatioのみ。
 * - 層2: そのeffectiveTurnsRatioのbase契約(undefined | 1、P3-3-Q12)。有限性だけでは
 *   2や0.5のような「有限だがbase契約違反」を捕捉できないため、値制約として別途検証する。
 *
 * 契約(P-Q10-A5、arbiter補足裁定2026-08-18により確定): 層2の判定式はencodeRecipe
 * (recipeCode.ts、P3-3-Q14)と同一だが、機構はthrowではなくResultである。両者の差は
 * 呼び出し境界の性質の違いに基づく意図的な設計——encodeRecipeは開発者向けAPIの誤用検出
 * (プレイヤー操作では到達しない)であるのに対し、本関数はbeginRun経路(プレイヤーがrun開始を
 * 操作する起点)に直接位置するため、例外を投げるとarbiter追加裁定Q10 §1(A3)が排除した
 * 「未捕捉例外がbeginRun経路へ伝播する」問題を再導入してしまう。Resultであれば
 * UI計画§6.4.1の「config構築失敗」genericな行へそのまま合流でき、UIは再試行可能な形で扱える。
 *
 * 呼び出し位置(brabit所有): composeConfigFromMaterialsがok:trueを返した後、computeRecipeKeyの
 * 直前。ok:falseのときはbeginRunを開始せず、reasonをそのまま既存の{ok:false, reason}腕へ渡す。
 */
export function validateMaterialComposedBase(
  motorConfig: MotorConfig,
  carConfig: CarConfig,
): ValidateMaterialComposedBaseResult {
  // 層1: computeRecipeKeyの事前条件(27エントリの有限性)をResultとして先出しする。
  for (const field of collectRecipeKeyNumericFields(motorConfig, carConfig)) {
    if (!Number.isFinite(field.value)) {
      return { ok: false, reason: `${field.label}が非有限値です: ${field.value}` };
    }
  }

  // 層2: effectiveTurnsRatioのbase契約(undefined | 1、P3-3-Q12)。判定式はencodeRecipe
  // (recipeCode.ts、P3-3-Q14)と同一で、機構のみResultへ適応している(上記docコメント参照)。
  const { effectiveTurnsRatio } = motorConfig;
  if (effectiveTurnsRatio !== undefined && effectiveTurnsRatio !== 1) {
    return {
      ok: false,
      reason: `motorConfig.effectiveTurnsRatioが1以外のbase configはrun開始に使用できません(実行時の破壊状態合成値が混入しています): ${effectiveTurnsRatio}`,
    };
  }

  return { ok: true };
}
