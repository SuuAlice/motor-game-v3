// Step2a: 導線・磁石の質量差分計算(docs/phase2-plan.md §16 Step2a)。
//
// 本ファイルの数値仮定はUnit1(materials.ts)の物性値(verified/pending)とは性質が異なり、
// 一次資料で検証できる「事実」ではなく、ゲームバランスに関わる「設計仮定」である。
// 平均巻き半径7mm・磁石寸法(直径10mm×厚さ3mm×1個)は2026-07-22、Suuの条件付き承認により
// 採用値として確定した。台紙(段ボール)の密度算出方式はStep2bまで未決定のまま維持する。
//
// 本ファイルの寸法値(WINDING_MEAN_RADIUS_M・磁石寸法)は、engine/の慣性較正
// (motorPhysics.tsのJ_NAIL・K_J_REF等)へ流用しない。Fableレビュー条件により、Step5の
// wireDensityRatio等が参照してよいのは密度比の値のみであり、寸法そのものではない。
// この境界は自動テストではなくコードレビューで担保する(src/engine/への変更はaliceのみが
// 行うため、Step5計画レビュー時に本ファイルの寸法値がengine/へ流用されていないことを
// 都度確認する)。ディレクトリ文字列スキャンによる自動検出は、間接import・再エクスポート
// 経由の参照を検知できず実装詳細に依存するため採用しない(2026-07-22再レビュー指摘6)。
//
// 本ファイルはgear/substrate/body(ギヤ・台紙・ボディ)の質量差分を扱わない。これらは対応する
// 密度がmaterials.ts上でpending(未検証)のままであり、Step2bで密度がverified化され次第、
// 別途の関数として追加する(このファイルの公開関数を破壊的に変更する前提は取らない)。

import {
  MAGNET_MATERIALS,
  WIRE_MATERIALS,
  type Citation,
  type MagnetMaterial,
  type NumericProperty,
  type WireMaterial,
} from './materials';

// ---------------------------------------------------------------------------
// 設計仮定の定数
// ---------------------------------------------------------------------------

/**
 * 巻き線の平均半径想定 [m]。spec §9.0の「短冊ごと巻く」実幾何を円形等価半径へ近似した
 * 較正値であり、実寸再現ではない。Phase4の巻線記録方式(実際の軌跡記録)で実線長へ
 * 置換予定。2026-07-22 Suu承認値。
 */
export const WINDING_MEAN_RADIUS_M = 0.007;

/** 磁石1個の想定直径 [m]。安価な円板磁石の流通サイズを仮定した設計仮定値。2026-07-22 Suu承認値。 */
export const MAGNET_DIAMETER_M = 0.01;
/** 磁石1個の想定厚み [m]。2026-07-22 Suu承認値。 */
export const MAGNET_THICKNESS_M = 0.003;
/**
 * 想定磁石個数。現行MotorConfigに釘本数/磁石個数に相当するフィールドがないため固定1個とする
 * (spec §9.3の釘本数→B飽和機構はPhase4巻線記録方式で導入予定)。
 */
export const MAGNET_COUNT = 1;

export interface WindingParams {
  coilTurns: number;
  /** 導体径 [mm]として扱う設計仮定。被膜厚は含まない(Phase4で被膜込みへ見直し予定)。 */
  wireGaugeMm: number;
  parallelStrands: 1 | 2;
}

// ---------------------------------------------------------------------------
// 低水準の全域関数(throwしない、有効な数値入力に対して常に結果を返す)
// ---------------------------------------------------------------------------

/**
 * 1本(1 strand)あたりの巻き線長 [m]。`coilTurns × 2π × WINDING_MEAN_RADIUS_M`。
 *
 * **`computeWireVolumeM3`と`computeConsumedWireM`の共通出典**であり、両者が同じ半径規約を
 * 使うことを構造的に保証する(片方だけ別の近似へ変えると、質量と在庫消費が静かに食い違う)。
 * P4-1Cで実軌跡長へ置換予定(上記`WINDING_MEAN_RADIUS_M`のコメント参照)。
 */
export function computeWireLengthPerStrandM(coilTurns: number): number {
  return coilTurns * 2 * Math.PI * WINDING_MEAN_RADIUS_M;
}

/**
 * P4-1A(2026-08-28人間承認): 在庫から消費される導線長 [m]。
 * `record.length × 2π × WINDING_MEAN_RADIUS_M × parallelStrands`。
 *
 * 並列本数を掛けるのは、n本それぞれが同じ長さぶん消費されるためで、
 * `computeWireVolumeM3`が体積側で`parallelStrands`を掛けているのと同じ規約である。
 * **新しい定数は導入しない**——既存の`WINDING_MEAN_RADIUS_M`(2026-07-22 Suu承認値)だけを使う。
 */
export function computeConsumedWireM(turnCount: number, parallelStrands: number): number {
  return computeWireLengthPerStrandM(turnCount) * parallelStrands;
}

/**
 * 導線の巻き線体積 [m³]。
 * lengthM = coilTurns × 2π × WINDING_MEAN_RADIUS_M
 * crossSectionM2 = π × (wireGaugeMm / 1000 / 2)²(導体径として扱う設計仮定、被膜厚は含まない)
 * volumeM3 = lengthM × crossSectionM2 × parallelStrands
 */
export function computeWireVolumeM3(params: WindingParams): number {
  const lengthM = computeWireLengthPerStrandM(params.coilTurns);
  const radiusM = params.wireGaugeMm / 1000 / 2;
  const crossSectionM2 = Math.PI * radiusM * radiusM;
  return lengthM * crossSectionM2 * params.parallelStrands;
}

/**
 * 磁石(MAGNET_COUNT個ぶん)の体積 [m³]。円柱近似 V = π×(d/2)²×t。
 * 体積はd²に比例するため、直径の相対誤差は質量へ約2倍で効く。厚みへの依存は1乗(線形)。
 */
export function computeMagnetVolumeM3(): number {
  const radiusM = MAGNET_DIAMETER_M / 2;
  return Math.PI * radiusM * radiusM * MAGNET_THICKNESS_M * MAGNET_COUNT;
}

// ---------------------------------------------------------------------------
// 密度解決(pending/verifiedを判別し、質量計算で使える形へ正規化する全域関数。throwしない)
// ---------------------------------------------------------------------------

/**
 * 質量計算に使う密度の出所。'catalogVerified'はmaterials.ts上でverifiedForPhysics: trueと
 * 確認された、その素材自身の密度。'designAssumption'は素材自身は一次資料未確認(pending)だが、
 * 別の確認済み素材の値を明示的な設計仮定として代用したもの(例: 銀メッキ銅線→銅密度代用)。
 * verifiedForPhysics/originをそのまま流用すると「代用された素材自身が一次資料確認済み」と
 * 誤読されるため、別の判別型として明示的に区別する(2026-07-22 Suuレビュー指摘1)。
 */
export type DensityProvenance = 'catalogVerified' | 'designAssumption';

export interface ResolvedMassDensity {
  value: number;
  provenance: DensityProvenance;
  citation: Citation;
}

export type DensityResolution = { ok: true; value: ResolvedMassDensity } | { ok: false; reason: string };

function resolveDensity(property: NumericProperty, materialId: string): DensityResolution {
  if (!property.verifiedForPhysics) {
    return { ok: false, reason: `${materialId}: 密度が未検証(pending)のため質量差分を計算できません(${property.reason})` };
  }
  if (!Number.isFinite(property.value) || property.value <= 0) {
    return { ok: false, reason: `${materialId}: 密度が有限正の値ではありません: ${property.value}` };
  }
  return { ok: true, value: { value: property.value, provenance: 'catalogVerified', citation: property.citation } };
}

/**
 * 銀メッキ銅線は基材(銅)密度を代用する設計仮定。materials.tsのwire-silver-plated-copperの
 * pending値は書き換えず、この一箇所でのみ代替解決する(2026-07-22 Suu指摘9)。戻り値は
 * provenance: 'designAssumption'とし、「銀メッキ線そのものが一次資料確認済み」という
 * 誤った意味にならないようにする(同日再レビュー指摘1)。
 * 銅(wire-copper-standard)が万一verifiedでない場合は空のオーバーライドとなり、通常の
 * pending解決(未検証として失敗)にフォールバックする(throwしない)。
 */
function buildWireDensityAssumptionOverrides(): Partial<Record<string, ResolvedMassDensity>> {
  const copperWire = WIRE_MATERIALS.find((m) => m.id === 'wire-copper-standard');
  const copperResolution = copperWire ? resolveDensity(copperWire.density, copperWire.id) : undefined;
  if (!copperResolution || !copperResolution.ok) return {};
  const citation: Citation = {
    literatureName:
      '設計仮定: 銀メッキ層は表層のみで質量寄与が無視できるとみなし、基材である銅の密度(materials.ts wire-copper-standardのverified値)を代用する。銀メッキ線そのものが一次資料確認されたわけではない',
    publisher: copperResolution.value.citation.publisher,
    sourceKind: '設計仮定(銅密度の代用)。materials.tsのpending値は書き換えない',
    url: copperResolution.value.citation.url,
    accessedOn: copperResolution.value.citation.accessedOn,
  };
  const assumption: ResolvedMassDensity = {
    value: copperResolution.value.value,
    provenance: 'designAssumption',
    citation,
  };
  return { 'wire-silver-plated-copper': assumption };
}

const WIRE_DENSITY_ASSUMPTION_OVERRIDES = buildWireDensityAssumptionOverrides();

export function resolveWireDensity(wire: WireMaterial): DensityResolution {
  const override = WIRE_DENSITY_ASSUMPTION_OVERRIDES[wire.id];
  if (override) return { ok: true, value: override };
  return resolveDensity(wire.density, wire.id);
}

export function resolveMagnetDensity(magnet: MagnetMaterial): DensityResolution {
  return resolveDensity(magnet.density, magnet.id);
}

/**
 * 質量差分 [g] = (実際の密度 − anchor密度) [kg/m³] × 体積 [m³] × 1000(kg→g)。
 * resolveWireDensity/resolveMagnetDensityで解決済みのResolvedMassDensityのみを受け取る
 * (value有限正はresolveDensity側で保証済み)。
 */
export function computeMassDeltaG(actual: ResolvedMassDensity, anchor: ResolvedMassDensity, volumeM3: number): number {
  return (actual.value - anchor.value) * volumeM3 * 1000;
}

// ---------------------------------------------------------------------------
// anchor解決の公開API(Phase2 Step7、Fable承認済み)
// ---------------------------------------------------------------------------

export type AnchorResolutionResult<T> = { ok: true; material: T } | { ok: false; reason: string };

/**
 * 導線ファミリーのanchorティア(isBaselineAnchor=true、wire-copper-standard)を解決する。
 * 密度解決(resolveWireDensity)・質量差分(computeWireMagnetMassAdjustmentG)・
 * materialMapping.tsの抵抗率ratio計算が、この単一関数を共有することで同一のanchor選択
 * 規則を参照する(anchor不一致というバグ類型を構造的に排除する、Fable承認済みQ1・Q7)。
 */
export function resolveAnchorWireMaterial(): AnchorResolutionResult<WireMaterial> {
  const anchor = WIRE_MATERIALS.find((m) => m.isBaselineAnchor);
  if (!anchor) return { ok: false, reason: '導線ファミリーにanchorティアが定義されていません(materials.tsの不整合)' };
  return { ok: true, material: anchor };
}

/** 磁石ファミリーのanchorティア(isBaselineAnchor=true、magnet-ferrite)を解決する。上記と同型。 */
export function resolveAnchorMagnetMaterial(): AnchorResolutionResult<MagnetMaterial> {
  const anchor = MAGNET_MATERIALS.find((m) => m.isBaselineAnchor);
  if (!anchor) return { ok: false, reason: '磁石ファミリーにanchorティアが定義されていません(materials.tsの不整合)' };
  return { ok: true, material: anchor };
}

// ---------------------------------------------------------------------------
// V2基準massG(推測で電池本数を導出せず、判別型で明示選択させる)
// ---------------------------------------------------------------------------

export type ChassisBaselineSelection = 'one-cell' | 'two-cell';

/**
 * V2基準massG [g]。標準シャーシ110g(src/data/partPresets.ts CHASSIS_PRESETS)+電池質量分
 * (one-cell: 電池1本25g→135g、two-cell: 電池2本の合計40g→150g)。
 */
export function resolveChassisBaselineG(selection: ChassisBaselineSelection): number {
  return selection === 'one-cell' ? 135 : 150;
}

// ---------------------------------------------------------------------------
// 入力検証(範囲外はclampせず明示失敗)
// ---------------------------------------------------------------------------

function validateWindingParams(params: WindingParams): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(params.coilTurns) || params.coilTurns <= 0) {
    return { ok: false, reason: `coilTurnsは正の整数である必要があります: ${params.coilTurns}` };
  }
  if (!Number.isFinite(params.wireGaugeMm) || params.wireGaugeMm <= 0) {
    return { ok: false, reason: `wireGaugeMmは有限の正数である必要があります: ${params.wireGaugeMm}` };
  }
  if (params.parallelStrands !== 1 && params.parallelStrands !== 2) {
    return { ok: false, reason: `parallelStrandsは1または2である必要があります: ${params.parallelStrands}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 公開エントリポイント(導線・磁石の質量差分のみ。massG全体の計算関数ではない)
// ---------------------------------------------------------------------------

export type MassAdjustmentResult = { ok: true; deltaG: number } | { ok: false; reason: string };

/**
 * 導線・磁石をanchor(銅線標準・フェライト)と比較した質量差分 [g] を返す。
 * ギヤ・台紙・ボディ・電池は対象外(Step2b以降)。いずれかの密度がpendingの場合や入力が
 * 不正な場合は、黙って無視・ゼロ代入せずResultで明示的に失敗を返す。
 * 関数名はcomputeMassGのような最終APIと誤認される名称を避けている(2026-07-22 Suu指摘4)。
 */
export function computeWireMagnetMassAdjustmentG(
  wire: WireMaterial,
  magnet: MagnetMaterial,
  windingParams: WindingParams,
): MassAdjustmentResult {
  const validation = validateWindingParams(windingParams);
  if (!validation.ok) return validation;

  const anchorWire = resolveAnchorWireMaterial();
  if (!anchorWire.ok) return anchorWire;
  const anchorMagnet = resolveAnchorMagnetMaterial();
  if (!anchorMagnet.ok) return anchorMagnet;

  const wireDensity = resolveWireDensity(wire);
  if (!wireDensity.ok) return wireDensity;
  const magnetDensity = resolveMagnetDensity(magnet);
  if (!magnetDensity.ok) return magnetDensity;

  const anchorWireDensity = resolveWireDensity(anchorWire.material);
  if (!anchorWireDensity.ok) return anchorWireDensity;
  const anchorMagnetDensity = resolveMagnetDensity(anchorMagnet.material);
  if (!anchorMagnetDensity.ok) return anchorMagnetDensity;

  const wireVolumeM3 = computeWireVolumeM3(windingParams);
  const magnetVolumeM3 = computeMagnetVolumeM3();

  const wireDeltaG = computeMassDeltaG(wireDensity.value, anchorWireDensity.value, wireVolumeM3);
  const magnetDeltaG = computeMassDeltaG(magnetDensity.value, anchorMagnetDensity.value, magnetVolumeM3);
  const deltaG = wireDeltaG + magnetDeltaG;

  if (!Number.isFinite(deltaG)) {
    return { ok: false, reason: '質量差分の計算結果が有限になりませんでした' };
  }
  return { ok: true, deltaG };
}

// ---------------------------------------------------------------------------
// baseline+delta合成の実行時ガード([80,250]g、Fable付帯条件)
// ---------------------------------------------------------------------------

export type MassGResult = { ok: true; massG: number } | { ok: false; reason: string };

const MASS_G_MIN = 80;
const MASS_G_MAX = 250;

/**
 * V2基準massG(resolveChassisBaselineG)と質量差分(computeWireMagnetMassAdjustmentG等)を
 * 合成し、既存CarConfig.massGのclamp範囲[MASS_G_MIN, MASS_G_MAX]g内であることを実行時に
 * 検証する。範囲外・非有限の場合はclampせずok:falseで明示的に失敗を返す(Fable付帯条件2、
 * 2026-07-22)。関数名はcomputeMassGのような最終APIと誤認されないよう避けている。
 */
export function applyMassAdjustmentToBaselineG(baselineG: number, deltaG: number): MassGResult {
  const massG = baselineG + deltaG;
  if (!Number.isFinite(massG)) {
    return { ok: false, reason: `baseline+deltaが有限になりませんでした: baseline=${baselineG}, delta=${deltaG}` };
  }
  if (massG < MASS_G_MIN || massG > MASS_G_MAX) {
    return { ok: false, reason: `baseline+deltaが既存clamp範囲[${MASS_G_MIN},${MASS_G_MAX}]gを外れました: ${massG}` };
  }
  return { ok: true, massG };
}
