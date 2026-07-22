// spec.md §4.2の9素材ファミリー×ティアのカタログデータ。
// engine/はこのファイルを一切参照しない(spec §4.3「engine/本体は素材を知らない」)。
// 写像(materialMapping.ts)・質量差分計算(assumedGeometry.ts)は別ファイルでdocs/phase2-plan.md
// §16 Step 2以降に実装する。本ファイルはデータと型のみを持つ。
//
// 出典の扱い(docs/phase2-plan.md §13、Fable/Suuレビュー2026-07-22の3回の再レビューで確定):
// - docs/spec.md §4.2はV3における唯一の正(project canonical source)であり、物理学上の一次資料
//   ではない。同表の直接転記値はorigin: 'projectSpec'とする
// - 数値プロパティはすべてNumericProperty型(VerifiedNumericValue | PendingNumericValue)で
//   表現する。VerifiedNumericValueは、発行主体のドメインまで実際に到達し値を確認できたものに
//   限る(メーカー公式ドメイン、規格団体、学術参照データベース)。第三者ミラー・販売代理店・
//   集約データベース(Engineering ToolBox・Wikipedia・specialchem.com等)を経由した値、
//   または一次資料を直接確認できなかった値はPendingNumericValueとする
// - PendingNumericValueは意図的にvalue: numberを持たない。未検証の数値をproductionデータへ
//   数値として保持すると、後続の物理写像コード(materialMapping.ts等)が誤って消費できてしまう
//   ため、型レベルで構造的に不可能にする(reason・candidateCitationは参考情報として持つ)
// - CitationはliteratureName・publisher(発行主体)・sourceKind(資料種別)を必須とし、
//   URLは実際に確認した文書へ向ける(発行主体とURLドメインが一致しない引用はしない)
//
// 今回pending(未検証)のまま残した項目(候補値・出典候補はcandidateCitation.literatureName内の
// 説明文として保持しているが、構造化されたvalue: numberは持たない):
// - 電池(BATTERY_MATERIALS)の内部抵抗・エネルギー密度・質量: spec表に数値がなく、かつ質量は
//   セル容量・形状に依存し単一のカタログ値を置けない。プロパティ自体を未収録とした
// - 導線(銀メッキ銅線)の密度: メッキ層の質量寄与を無視する設計仮定であり、Step 2
//   (assumedGeometry.ts)側の設計仮定に本来属する
// - ギヤ(POM/PA6/PEEK/チタン)の密度: メーカー公式ドメインの存在は確認したが、本ツールの
//   JS非対応の制約で個別グレードの数値ページを直接確認できなかった
// - 台紙(段ボール)の密度: フルート形状・積層数に依存する構造依存の設計仮定であり、
//   Step 2(assumedGeometry.ts)側の設計仮定に本来属する
// - 台紙(プラ板PS・フェノール樹脂板)、ボディ(厚紙・プラ板・ポリカーボネート)の密度:
//   メーカー公式・規格団体ドメインの個別数値ページを直接確認できなかった
// これらの一次資料確認はStep 2(assumedGeometry.ts)着手前の課題として別途報告し、
// Unit1のcommitを妨げない(Suu 2026-07-22 三回目レビュー方針)。

export type MaterialFamily =
  | 'wire'
  | 'coating'
  | 'magnet'
  | 'gear'
  | 'battery'
  | 'brush'
  | 'substrate'
  | 'roller'
  | 'body';

export const MATERIAL_FAMILIES: readonly MaterialFamily[] = [
  'wire',
  'coating',
  'magnet',
  'gear',
  'battery',
  'brush',
  'substrate',
  'roller',
  'body',
];

/**
 * 一次資料(発行主体のドメイン)まで実際に到達し値を確認できた場合の出典区分。
 * 'projectSpec'はdocs/spec.mdからの直接転記(V3の唯一の正、project canonical source)。
 * 'manufacturerDatasheet'はメーカー公式ドメインの製品データシート。
 * 'standardOrGovernment'は規格団体・公的機関が発行する規格文書。
 * 'academicReference'は大学等が維持する学術参照データベース(元素の物理定数等、
 * 設計・製法に依存しない値に限る)。
 */
export type VerifiedOrigin = 'projectSpec' | 'manufacturerDatasheet' | 'standardOrGovernment' | 'academicReference';

export interface Citation {
  /** 文献名(主)。規格の場合は文書番号、メーカー資料の場合は発行元・製品名を含める */
  literatureName: string;
  /** 発行主体(必須)。manufacturerDatasheetは公式発行元、standardOrGovernmentは規格/公的発行元 */
  publisher: string;
  /** 資料種別(例: メーカー製品データシート/規格文書/学術参照データベース/project canonical source) */
  sourceKind: string;
  /** 規格番号・製品グレード名等(あれば) */
  documentIdOrGrade?: string;
  /** URL(従、任意)。実際に確認した文書へ向ける。発行主体とドメインが一致しない引用はしない */
  url?: string;
  /** 参照日(YYYY-MM-DD)。projectSpec(docs/spec.md)の場合は省略可、それ以外は必須 */
  accessedOn?: string;
}

/** 一次資料を確認できた数値。後続の物理写像(materialMapping.ts等)が消費してよい。 */
export interface VerifiedNumericValue {
  verifiedForPhysics: true;
  value: number;
  origin: VerifiedOrigin;
  citation: Citation;
}

/**
 * 一次資料を未確認、または構造依存の設計仮定(段ボール密度等)。
 * 意図的にvalue: numberを持たない(docs/phase2-plan.md §13、Suu三回目レビュー方針)。
 * 後続の物理写像コードがNumericPropertyをそのまま数値として誤用することを型レベルで防ぐ。
 */
export interface PendingNumericValue {
  verifiedForPhysics: false;
  status: 'pending';
  /** 未検証・未収録である理由 */
  reason: string;
  /** 参考候補の出典(将来の一次資料確認作業の手がかり。数値そのものは構造化フィールドに持たない) */
  candidateCitation?: Citation;
}

export type NumericProperty = VerifiedNumericValue | PendingNumericValue;

function verified(value: number, origin: VerifiedOrigin, citation: Citation): VerifiedNumericValue {
  return { verifiedForPhysics: true, value, origin, citation };
}

function pending(reason: string, candidateCitation?: Citation): PendingNumericValue {
  return { verifiedForPhysics: false, status: 'pending', reason, candidateCitation };
}

const SPEC_SOURCE_KIND = 'project canonical source(V3正本、物理学上の一次資料ではない)';

const SPEC_CITATION: Citation = {
  literatureName: 'docs/spec.md §4.2',
  publisher: 'MotorGameV3プロジェクト',
  sourceKind: SPEC_SOURCE_KIND,
};

interface MaterialTierBase {
  /** 全ファミリー横断で一意(family接頭辞で重複を構造的に回避) */
  id: string;
  family: MaterialFamily;
  /** spec表のティア番号(0始まり) */
  tierIndex: number;
  /** 一般名・元素名のみ(spec §15、登録商標は使用しない) */
  nameJa: string;
  /** spec表の特性列の直接転記または要約 */
  descriptionJa: string;
  /**
   * spec表で「V2互換基準」「正典構成」等と明示された基準ティア、または
   * Fableレビューでanchorとして確定したティア(docs/phase2-plan.md §6・§10)。
   * 家族によっては現時点でanchorが未確定(false)のままであり、これは
   * Step 2(assumedGeometry.ts)・Step 4(磁石較正値テーブル)で個別に確定する。
   */
  isBaselineAnchor: boolean;
  /** 仮の価格(spec §5.1「G」)。経済バランスはPhase2では未確定 */
  priceProvisionalG: number;
}

export interface WireMaterial extends MaterialTierBase {
  family: 'wire';
  /** 抵抗率 [nΩ·m] */
  resistivity: NumericProperty;
  /** 密度 [kg/m³] */
  density: NumericProperty;
}

export interface CoatingMaterial extends MaterialTierBase {
  family: 'coating';
  /** 耐熱クラス [℃] */
  heatTolerance: NumericProperty;
}

export interface MagnetMaterial extends MaterialTierBase {
  family: 'magnet';
  /** 残留磁束密度Br [T] 目安 */
  remanenceBr: NumericProperty;
  /** 使用上限温度 [℃](ネオジムは「グレードにより80℃前後」の代表値) */
  maxUseTemp: NumericProperty;
  /** 密度 [kg/m³] */
  density: NumericProperty;
}

export interface GearMaterial extends MaterialTierBase {
  family: 'gear';
  /** 密度 [kg/m³] */
  density: NumericProperty;
}

export interface BatteryMaterial extends MaterialTierBase {
  family: 'battery';
  // 数量的フィールドは未収録(ファイル冒頭コメント参照)。descriptionJaに定性特性を記録する。
}

export interface BrushMaterial extends MaterialTierBase {
  family: 'brush';
  // spec.md §4.2表に数値なし。定性特性のみdescriptionJaに記録する(docs/phase2-plan.md §11)。
}

export interface SubstrateMaterial extends MaterialTierBase {
  family: 'substrate';
  /** 密度 [kg/m³] */
  density: NumericProperty;
}

export interface RollerMaterial extends MaterialTierBase {
  family: 'roller';
  // spec.md §4.2表に数値なし。§6.5車両層拡張(e)の見積り結果待ち(docs/phase2-plan.md §4)。
}

/** tier0「なし」は物質そのものが存在しないため、密度等の物性フィールドを持たない。 */
export interface BodyMaterialNone extends MaterialTierBase {
  family: 'body';
  hasPhysicalMaterial: false;
}

/** tier1以降は実在素材を持ち、密度等の物性フィールドを収録する。 */
export interface BodyMaterialWithSubstance extends MaterialTierBase {
  family: 'body';
  hasPhysicalMaterial: true;
  /** 密度 [kg/m³] */
  density: NumericProperty;
}

export type BodyMaterial = BodyMaterialNone | BodyMaterialWithSubstance;

export type Material =
  | WireMaterial
  | CoatingMaterial
  | MagnetMaterial
  | GearMaterial
  | BatteryMaterial
  | BrushMaterial
  | SubstrateMaterial
  | RollerMaterial
  | BodyMaterial;

// ---------------------------------------------------------------------------
// 出典。発行主体のドメインへ実際に到達できたものはverified()の引数として使う。
// 到達できなかったもの・構造依存の設計仮定はpending()のcandidateCitationとして
// 参考保持する(値そのものはreason/literatureName内の説明文としてのみ言及する)。
// ---------------------------------------------------------------------------

// 純元素の密度は設計や製法に依存しない物理定数。WebElements(英国シェフィールド大学が
// 維持する学術参照データベース、webelements.com自身のドメイン)で直接値を確認した。
const CIT_ALUMINUM_DENSITY: Citation = {
  literatureName: 'WebElements "Aluminium: physical properties"',
  publisher: 'WebElements(University of Sheffield)',
  sourceKind: '学術参照データベース(元素の物理定数)',
  url: 'https://www.webelements.com/aluminium/physics.html',
  accessedOn: '2026-07-22',
};

const CIT_COPPER_DENSITY: Citation = {
  literatureName: 'WebElements "Copper: physical properties"',
  publisher: 'WebElements(University of Sheffield)',
  sourceKind: '学術参照データベース(元素の物理定数)',
  url: 'https://www.webelements.com/copper/physics.html',
  accessedOn: '2026-07-22',
};

const CIT_SILVER_DENSITY: Citation = {
  literatureName: 'WebElements "Silver: physical properties"',
  publisher: 'WebElements(University of Sheffield)',
  sourceKind: '学術参照データベース(元素の物理定数)',
  url: 'https://www.webelements.com/silver/physics.html',
  accessedOn: '2026-07-22',
};

const CIT_FERRITE_MAGNET_DENSITY: Citation = {
  literatureName: 'TDK Electronics "Ferrite Magnets FB Series Product Guide"',
  publisher: 'TDK Corporation',
  sourceKind: 'メーカー公式製品データシート',
  documentIdOrGrade: 'FB series',
  url: 'https://product.tdk.com/en/system/files/dam/doc/product/magnet/magnet/ferrite/datasheets/magnet_fb_summary_en.pdf',
  accessedOn: '2026-07-22',
};

const CIT_ALNICO_MAGNET_DENSITY: Citation = {
  literatureName: 'Arnold Magnetic Technologies "Cast ALNICO Permanent Magnets"',
  publisher: 'Arnold Magnetic Technologies Corp.',
  sourceKind: 'メーカー公式製品データシート',
  url: 'https://www.arnoldmagnetics.com/wp-content/uploads/2017/10/Cast-Alnico-Permanent-Magnet-Brochure-101117-1.pdf',
  accessedOn: '2026-07-22',
};

const CIT_SMCO_MAGNET_DENSITY: Citation = {
  literatureName: 'Adams Magnetic Products "Samarium Cobalt Magnets"',
  publisher: 'Adams Magnetic Products Co.',
  sourceKind: 'メーカー公式製品資料',
  url: 'https://www.adamsmagnetic.com/samarium-cobalt/',
  accessedOn: '2026-07-22',
};

const CIT_NEODYMIUM_MAGNET_DENSITY: Citation = {
  literatureName: 'Arnold Magnetic Technologies "Neodymium Iron Boron Magnet Catalog"',
  publisher: 'Arnold Magnetic Technologies Corp.',
  sourceKind: 'メーカー公式製品カタログ',
  url: 'https://www.arnoldmagnetics.com/wp-content/uploads/2019/06/Arnold-Neo-Catalog.pdf',
  accessedOn: '2026-07-22',
};

// 以下はcandidateCitation(pending、未検証の参考情報)。値は各literatureName内に
// 参考として言及するのみで、構造化されたNumericValueは持たない。

const CANDIDATE_CIT_SILVER_PLATED_COPPER: Citation = {
  literatureName: '設計仮定候補: 銀メッキ層は表層のみで質量寄与が無視できるとみなし、基材である銅の密度(WebElements確認済み)を代用する案',
  publisher: '(設計仮定、一次資料なし)',
  sourceKind: '構造依存の設計仮定候補。本来Step 2(assumedGeometry.ts)に属する',
  accessedOn: '2026-07-22',
};

const CANDIDATE_CIT_POM_DENSITY: Citation = {
  literatureName:
    'Celanese Hostaform(POM)製品ファミリーの密度候補(ISO 1183準拠)。Celanese公式ドメイン(materials.celanese.com)にHostaform製品データシート群は確認したが、JSレンダリング制約で個別グレードの数値ページは今回未直接確認',
  publisher: 'Celanese Corporation(公式ドメインの存在は確認、個別数値ページ未直接確認)',
  sourceKind: 'メーカー製品データシート候補値(未直接確認)',
  url: 'https://materials.celanese.com/',
  accessedOn: '2026-07-22',
};

const CANDIDATE_CIT_PA6_DENSITY: Citation = {
  literatureName: '未充填PA6の複数樹脂物性データベースで報告される密度候補。メーカー公式データシート個別ページは今回未直接確認',
  publisher: '(メーカー公式未直接確認)',
  sourceKind: '複数資料の集計候補値(未直接確認)',
  accessedOn: '2026-07-22',
};

// WebFetchでVictrex公式データシートページ本文を直接確認できた(2026-07-22)。
// 密度は原文g/cm³表記のためkg/m³へ換算する(×1000)。既知値換算はmaterials.test.tsで固定する。
const CIT_PEEK_DENSITY: Citation = {
  // ページ内表記「Last updated 17 March 2026」(文書自体の更新日、WebFetchで確認した
  // accessedOn 2026-07-22とは別の日付であることに注意)。
  literatureName: 'VICTREX™ PEEK POLYMER 450G™ Datasheet(密度1.30 g/cm³、ISO 1183。ページ更新日2026-03-17)',
  publisher: 'Victrex plc',
  sourceKind: 'メーカー公式製品データシート',
  documentIdOrGrade: '450G(未充填・unreinforced granules)',
  url: 'https://www.victrex.com/en/downloads/datasheets/victrex-peek-450g',
  accessedOn: '2026-07-22',
};

// WebFetchで到達できたのはTMS Titanium(チタン販売代理店。原材料メーカー/ミルではない)の
// 技術資料で、ASTM B265本文が密度を規定しているとは明記されていない「参考値」との記載を
// 確認した(2026-07-22)。manufacturerDatasheet origin(実発行主体の公式文書限定)の要件を
// 満たさない。Suuレビューにより、新規origin区分(supplierTechnicalDocument等)は追加せず、
// 販売代理店資料のみを物理写像に使うverified根拠としないことが決定済み(docs/phase2-plan.md
// §13、Suu指摘6)。原材料メーカー/ミル・学術標準資料・公的資料・本文を直接確認できる規格
// 資料が見つかるまでpendingのまま維持する(Step 2以降で必要になる前に別途探索する)。
const CANDIDATE_CIT_TITANIUM_ALLOY_DENSITY: Citation = {
  literatureName:
    'TMS Titanium(チタン販売代理店)技術資料に記載のTi-6Al-4V(Grade 5)密度参考値。同資料はASTM B265本文がこの値を規定するとは明記していない。原材料メーカー/ミルの公式文書には今回到達できなかった',
  publisher: 'TMS Titanium(販売代理店。原材料メーカー/ミルではない)',
  sourceKind: '販売代理店の技術資料(メーカー公式データシートではない、規格本文未確認)',
  url: 'https://tmstitanium.com/page/grade-5-titanium',
  accessedOn: '2026-07-22',
};

const CANDIDATE_CIT_CARDBOARD_DENSITY: Citation = {
  literatureName:
    '段ボール(コルゲートファイバーボード)のBフルート相当密度候補。フルート形状・積層数により密度幅が大きい構造依存の設計仮定',
  publisher: '(設計仮定、一次資料なし)',
  sourceKind: '構造依存の設計仮定候補。本来Step 2(assumedGeometry.ts)に属する',
  url: 'https://en.wikipedia.org/wiki/Corrugated_fiberboard',
  accessedOn: '2026-07-22',
};

const CANDIDATE_CIT_POLYSTYRENE_DENSITY: Citation = {
  literatureName:
    'GPPS(汎用ポリスチレン)の代表グレードで報告される密度候補。INEOS Styrolution公式ドメイン(ineos-styrolution.com)は確認したが、個別グレードの数値ページは今回未直接確認',
  publisher: 'INEOS Styrolution Group(公式ドメインの存在は確認、個別数値ページ未直接確認)',
  sourceKind: 'メーカー製品データシート候補値(未直接確認)',
  url: 'https://www.ineos-styrolution.com/',
  accessedOn: '2026-07-22',
};

const CANDIDATE_CIT_POLYCARBONATE_DENSITY: Citation = {
  literatureName: 'ポリカーボネートの複数樹脂物性データベースで報告される密度候補。Covestro(Makrolon)公式データシート個別ページは今回未直接確認',
  publisher: '(メーカー公式未直接確認)',
  sourceKind: '複数資料の集計候補値(未直接確認)',
  accessedOn: '2026-07-22',
};

const CANDIDATE_CIT_PHENOLIC_BOARD_DENSITY: Citation = {
  literatureName:
    '紙フェノール積層板(NEMA Grade XX相当)の複数資料で報告される密度候補。規格発行元(NEMA)の規格文書(NEMA LI-1)本文は有償のため今回未確認',
  publisher: '(規格発行元NEMAの規格文書本文は未確認)',
  sourceKind: '複数資料の集計候補値(規格本文未確認)',
  accessedOn: '2026-07-22',
};

// ---------------------------------------------------------------------------

export const WIRE_MATERIALS = [
  {
    id: 'wire-aluminum',
    family: 'wire',
    tierIndex: 0,
    nameJa: 'アルミ線',
    descriptionJa: '安価・軽量・高抵抗。序盤のやりくり用',
    isBaselineAnchor: false,
    priceProvisionalG: 50,
    resistivity: verified(26.5, 'projectSpec', SPEC_CITATION),
    density: verified(2700, 'academicReference', CIT_ALUMINUM_DENSITY),
  },
  {
    id: 'wire-copper-standard',
    family: 'wire',
    tierIndex: 1,
    nameJa: '銅線(標準)',
    descriptionJa: '基準。V2互換',
    isBaselineAnchor: true,
    priceProvisionalG: 100,
    resistivity: verified(16.8, 'projectSpec', SPEC_CITATION),
    density: verified(8960, 'academicReference', CIT_COPPER_DENSITY),
  },
  {
    id: 'wire-silver-plated-copper',
    family: 'wire',
    tierIndex: 2,
    nameJa: '銀メッキ銅線',
    descriptionJa: '高周波と耐食で有利。中位の贅沢品',
    isBaselineAnchor: false,
    priceProvisionalG: 250,
    resistivity: verified(16.3, 'projectSpec', SPEC_CITATION),
    density: pending(
      'メッキ層の質量寄与を無視する設計仮定であり、本来Step 2(assumedGeometry.ts)に属する。一次資料による個別確認はしていない',
      CANDIDATE_CIT_SILVER_PLATED_COPPER,
    ),
  },
  {
    id: 'wire-silver',
    family: 'wire',
    tierIndex: 3,
    nameJa: '純銀線',
    descriptionJa: '銅比 約-6%。最後の数%を金で買う。軟らかく張力許容幅が狭い',
    isBaselineAnchor: false,
    priceProvisionalG: 800,
    resistivity: verified(15.9, 'projectSpec', SPEC_CITATION),
    density: verified(10490, 'academicReference', CIT_SILVER_DENSITY),
  },
] as const satisfies readonly WireMaterial[];

export const COATING_MATERIALS = [
  {
    id: 'coating-polyurethane',
    family: 'coating',
    tierIndex: 0,
    nameJa: 'ポリウレタン',
    descriptionJa: 'はんだ直付け可。熱に弱い',
    isBaselineAnchor: false,
    priceProvisionalG: 30,
    heatTolerance: verified(130, 'projectSpec', SPEC_CITATION),
  },
  {
    id: 'coating-polyester',
    family: 'coating',
    tierIndex: 1,
    nameJa: 'ポリエステル',
    descriptionJa: '標準',
    isBaselineAnchor: false,
    priceProvisionalG: 60,
    heatTolerance: verified(155, 'projectSpec', SPEC_CITATION),
  },
  {
    id: 'coating-polyamide-imide',
    family: 'coating',
    tierIndex: 2,
    nameJa: 'ポリアミドイミド',
    descriptionJa: '高耐熱',
    isBaselineAnchor: false,
    priceProvisionalG: 150,
    heatTolerance: verified(200, 'projectSpec', SPEC_CITATION),
  },
  {
    id: 'coating-polyimide',
    family: 'coating',
    tierIndex: 3,
    nameJa: 'ポリイミド',
    descriptionJa: '最強被膜。高価。巻きの雑さへの保険(耐熱クラスは220℃以上、220を代表値とする)',
    isBaselineAnchor: false,
    priceProvisionalG: 400,
    heatTolerance: verified(220, 'projectSpec', SPEC_CITATION),
  },
] as const satisfies readonly CoatingMaterial[];

export const MAGNET_MATERIALS = [
  {
    id: 'magnet-ferrite',
    family: 'magnet',
    tierIndex: 0,
    nameJa: 'フェライト',
    descriptionJa: '弱いが熱に鈍感で軽い。扱いやすさの王',
    // Fableレビュー(docs/phase2-plan.md §10)により、pre-Phase2の暗黙デフォルト値としてanchor確定。
    isBaselineAnchor: true,
    priceProvisionalG: 40,
    remanenceBr: verified(0.4, 'projectSpec', SPEC_CITATION),
    maxUseTemp: verified(250, 'projectSpec', SPEC_CITATION),
    density: verified(4900, 'manufacturerDatasheet', CIT_FERRITE_MAGNET_DENSITY),
  },
  {
    id: 'magnet-alnico',
    family: 'magnet',
    tierIndex: 1,
    nameJa: 'アルニコ',
    descriptionJa: '高Brだが保磁力が低く逆磁界で減磁する固有の癖(使用上限温度は450℃超、450を代表値とする)',
    isBaselineAnchor: false,
    priceProvisionalG: 300,
    remanenceBr: verified(1.2, 'projectSpec', SPEC_CITATION),
    maxUseTemp: verified(450, 'projectSpec', SPEC_CITATION),
    density: verified(7300, 'manufacturerDatasheet', CIT_ALNICO_MAGNET_DENSITY),
  },
  {
    id: 'magnet-samarium-cobalt',
    family: 'magnet',
    tierIndex: 2,
    nameJa: 'サマリウムコバルト',
    descriptionJa: '磁力で3位、熱耐性で2位。中位の存在意義',
    isBaselineAnchor: false,
    priceProvisionalG: 600,
    remanenceBr: verified(1.0, 'projectSpec', SPEC_CITATION),
    maxUseTemp: verified(300, 'projectSpec', SPEC_CITATION),
    density: verified(8400, 'manufacturerDatasheet', CIT_SMCO_MAGNET_DENSITY),
  },
  {
    id: 'magnet-neodymium',
    family: 'magnet',
    tierIndex: 3,
    nameJa: 'ネオジム(N系)',
    descriptionJa: '最強。ただし過熱で不可逆減磁(§7.3)。重くコギングが激しい(Brはグレードにより1.3T以上、使用上限温度はグレードにより80℃前後を代表値とする)',
    isBaselineAnchor: false,
    priceProvisionalG: 900,
    remanenceBr: verified(1.3, 'projectSpec', SPEC_CITATION),
    maxUseTemp: verified(80, 'projectSpec', SPEC_CITATION),
    density: verified(7500, 'manufacturerDatasheet', CIT_NEODYMIUM_MAGNET_DENSITY),
  },
] as const satisfies readonly MagnetMaterial[];

export const GEAR_MATERIALS = [
  {
    id: 'gear-pom',
    family: 'gear',
    tierIndex: 0,
    nameJa: 'POM(ポリアセタール)',
    descriptionJa: '軽量・自己潤滑・安価。標準',
    // spec表に「V2互換基準」の明示ラベルなし。anchorはStep 2(assumedGeometry.ts)で個別確定する。
    isBaselineAnchor: false,
    priceProvisionalG: 80,
    density: pending('メーカー公式ドメイン(materials.celanese.com)は確認したが、個別グレードの数値ページを直接確認できなかった', CANDIDATE_CIT_POM_DENSITY),
  },
  {
    id: 'gear-nylon-pa6',
    family: 'gear',
    tierIndex: 1,
    nameJa: 'ナイロン(PA6)',
    descriptionJa: '粘り強いが吸湿で寸法が動く(将来枠の癖)',
    isBaselineAnchor: false,
    priceProvisionalG: 100,
    density: pending('メーカー公式データシート個別ページを直接確認できなかった', CANDIDATE_CIT_PA6_DENSITY),
  },
  {
    id: 'gear-peek',
    family: 'gear',
    tierIndex: 2,
    nameJa: 'PEEK',
    descriptionJa: '軽量・自己潤滑・高耐熱の優等生。高価',
    isBaselineAnchor: false,
    priceProvisionalG: 500,
    // 1.30 g/cm³ × 1000 = 1300 kg/m³(g/cm³→kg/m³の換算式)。既知値はmaterials.test.tsで固定。
    density: verified(1300, 'manufacturerDatasheet', CIT_PEEK_DENSITY),
  },
  {
    id: 'gear-titanium',
    family: 'gear',
    tierIndex: 3,
    nameJa: 'チタン',
    descriptionJa: '砕けない代わりに重い(J増で加速鈍化)。金属同士は無潤滑でかじる',
    isBaselineAnchor: false,
    priceProvisionalG: 1200,
    density: pending(
      '販売代理店(TMS Titanium)の技術資料には到達したが、原材料メーカー/ミルの公式文書ではなく、規格発行元(ASTM International)の規格文書本文(有償)も未確認。販売代理店資料のみのためverified化せず、一次性の高い資料確認までpendingを維持する',
      CANDIDATE_CIT_TITANIUM_ALLOY_DENSITY,
    ),
  },
] as const satisfies readonly GearMaterial[];

// Phase2 Step7b(docs/phase2-step7b-plan.md v3、Fable/Suu_mot3承認2026-07-22)。
// 内部抵抗ratio・容量ratioの設計較正値(カタログ物性ではない)は本ファイルではなく
// src/materials/materialMapping.tsのBATTERY_INTERNAL_RESISTANCE_RATIO_CALIBRATION・
// BATTERY_CAPACITY_RATIO_CALIBRATIONで定義する(数値の正はmaterialMapping.ts、
// 変更時は両方更新すること)。本ファイル冒頭の既存方針(データと型のみを持つ)を維持するため、
// BatteryMaterial interfaceには数値フィールドを追加しない(Fable承認Q1条件1、
// materials.tsへの数値転記はせず決定基準+参照ポインタのみとする裁量を採用)。
//
// 決定基準(Fable、docs/phase2-step7-fable-review.md §Q3・Q4より):
// 1. 実測の順序(内部抵抗: アルカリ>NiMH>LiPo、実用エネルギー: アルカリ≦NiMH<LiPo)を保存する。
// 2. 実測の内部抵抗比は10倍を超えるが、ゲーム特性の分離が壊れない範囲へ3〜7倍程度に圧縮した。
// 3. 負荷依存の実効容量低下(アルカリの大電流時崩れ)は、engineが固定J予算である以上
//    モデル化せず、低内部抵抗の優位に代表させる(この省略は意図的)。
// 4. 「同一外形・同一電圧相当のゲーム用抽象パック」として設計較正する。電圧差はratioへ
//    含めず、既存batteryVoltageと直交させる(実セル電圧差は抽象パックの「電圧相当」に吸収)。
// 5. Phase2時点のLiPoは低内部抵抗・高容量の純粋上位互換になる(意図的な暫定状態)。
//    発熱・膨張・炎上(Phase3 D03/D04)・入手性によるトレードオフはPhase3完了まで未実装。
//    この不完全性はPhase2ゲートsweep報告(docs/phase2-plan.md §16移行順9番)へも別途明記する。
//
// 下記descriptionJa(「内部抵抗高め」「低内部抵抗・大電流に強い」「最強の出力密度」)は
// この較正値の定性的根拠である。
export const BATTERY_MATERIALS = [
  {
    id: 'battery-alkaline',
    family: 'battery',
    tierIndex: 0,
    nameJa: 'アルカリ',
    descriptionJa: 'V2互換基準。内部抵抗高め',
    isBaselineAnchor: true,
    priceProvisionalG: 20,
  },
  {
    id: 'battery-nickel-metal-hydride',
    family: 'battery',
    tierIndex: 1,
    nameJa: 'ニッケル水素',
    descriptionJa: '低内部抵抗・大電流に強い。実用の主力',
    isBaselineAnchor: false,
    priceProvisionalG: 150,
  },
  {
    id: 'battery-lithium-polymer',
    family: 'battery',
    tierIndex: 2,
    nameJa: 'リチウムポリマー',
    descriptionJa: '最強の出力密度。短絡・過放電で膨張→発煙→炎上(§7.1の花形)',
    isBaselineAnchor: false,
    priceProvisionalG: 400,
  },
] as const satisfies readonly BatteryMaterial[];

export const BRUSH_MATERIALS = [
  {
    id: 'brush-copper-plate',
    family: 'brush',
    tierIndex: 0,
    nameJa: '銅板(クリップ)',
    descriptionJa: 'V1以来の原点。摩耗大',
    isBaselineAnchor: false,
    priceProvisionalG: 10,
  },
  {
    id: 'brush-carbon',
    family: 'brush',
    tierIndex: 1,
    nameJa: 'カーボン',
    descriptionJa: '標準。自己潤滑',
    isBaselineAnchor: false,
    priceProvisionalG: 40,
  },
  {
    id: 'brush-silver-graphite',
    family: 'brush',
    tierIndex: 2,
    nameJa: '銀黒鉛',
    descriptionJa: '低接触抵抗',
    isBaselineAnchor: false,
    priceProvisionalG: 150,
  },
  {
    id: 'brush-precious-metal',
    family: 'brush',
    tierIndex: 3,
    nameJa: '貴金属ブラシ',
    descriptionJa: '低電流で抜群、大電流で急速に荒れる実在のピーキーさ',
    isBaselineAnchor: false,
    priceProvisionalG: 500,
  },
] as const satisfies readonly BrushMaterial[];

export const SUBSTRATE_MATERIALS = [
  {
    id: 'substrate-cardboard',
    family: 'substrate',
    tierIndex: 0,
    nameJa: '段ボール',
    descriptionJa: '正典構成(§9.0)の標準。軽いが剛性最低、高回転でたわむ。切り口の角が線を傷めやすい',
    isBaselineAnchor: true,
    priceProvisionalG: 5,
    density: pending('フルート形状・積層数に依存する構造依存の設計仮定であり、本来Step 2(assumedGeometry.ts)に属する', CANDIDATE_CIT_CARDBOARD_DENSITY),
  },
  {
    id: 'substrate-ps-sheet',
    family: 'substrate',
    tierIndex: 1,
    nameJa: 'プラ板(PS)',
    descriptionJa: '剛性・エッジとも改善のバランス型',
    isBaselineAnchor: false,
    priceProvisionalG: 60,
    density: pending('メーカー公式ドメイン(ineos-styrolution.com)は確認したが、個別グレードの数値ページを直接確認できなかった', CANDIDATE_CIT_POLYSTYRENE_DENSITY),
  },
  {
    id: 'substrate-phenolic-board',
    family: 'substrate',
    tierIndex: 2,
    nameJa: 'フェノール樹脂板',
    descriptionJa: '高剛性・耐熱。実物の電気基板材であり世界観にも正しい',
    isBaselineAnchor: false,
    priceProvisionalG: 200,
    density: pending('規格発行元(NEMA)の規格文書本文(有償)を直接確認できなかった', CANDIDATE_CIT_PHENOLIC_BOARD_DENSITY),
  },
] as const satisfies readonly SubstrateMaterial[];

export const ROLLER_MATERIALS = [
  {
    id: 'roller-none',
    family: 'roller',
    tierIndex: 0,
    nameJa: 'なし',
    descriptionJa: '壁に直接擦る。保持は弱く壁擦り損失が大きい',
    isBaselineAnchor: true,
    priceProvisionalG: 0,
  },
  {
    id: 'roller-pom-fixed',
    family: 'roller',
    tierIndex: 1,
    nameJa: 'POM固定ローラー',
    descriptionJa: '標準。保持と摩擦のバランス',
    isBaselineAnchor: false,
    priceProvisionalG: 80,
  },
  {
    id: 'roller-rubber-ring',
    family: 'roller',
    tierIndex: 2,
    nameJa: 'ゴムリング付き',
    descriptionJa: '保持力最大だが転がり抵抗も増。テクニカル向け',
    isBaselineAnchor: false,
    priceProvisionalG: 200,
  },
  {
    id: 'roller-bearing',
    family: 'roller',
    tierIndex: 3,
    nameJa: 'ベアリング入り',
    descriptionJa: '低摩擦で直線も殺さない。高価。衝撃で玉が欠ける繊細さ',
    isBaselineAnchor: false,
    priceProvisionalG: 600,
  },
] as const satisfies readonly RollerMaterial[];

export const BODY_MATERIALS = [
  {
    id: 'body-none',
    family: 'body',
    tierIndex: 0,
    nameJa: 'なし(むき出し)',
    descriptionJa: '最軽量・保護ゼロ・放熱最良。正典構成の姿',
    isBaselineAnchor: true,
    priceProvisionalG: 0,
    hasPhysicalMaterial: false,
  },
  {
    id: 'body-cardboard-cowl',
    family: 'body',
    tierIndex: 1,
    nameJa: '厚紙カウル',
    descriptionJa: '安価な自作。軽いが保護は気休め、濡れ・熱に弱い',
    isBaselineAnchor: false,
    priceProvisionalG: 30,
    hasPhysicalMaterial: true,
    density: pending('段ボールと同一の構造依存の設計仮定。本来Step 2(assumedGeometry.ts)に属する', CANDIDATE_CIT_CARDBOARD_DENSITY),
  },
  {
    id: 'body-ps-cowl',
    family: 'body',
    tierIndex: 2,
    nameJa: 'プラ板(PS)自作カウル',
    descriptionJa: '保護と剛性のバランス。不透明(内部を隠せる)',
    isBaselineAnchor: false,
    priceProvisionalG: 120,
    hasPhysicalMaterial: true,
    density: pending('メーカー公式ドメイン(ineos-styrolution.com)は確認したが、個別グレードの数値ページを直接確認できなかった', CANDIDATE_CIT_POLYSTYRENE_DENSITY),
  },
  {
    id: 'body-polycarbonate-clear',
    family: 'body',
    tierIndex: 3,
    nameJa: 'ポリカーボネート・クリアボディ',
    descriptionJa:
      '実物RCの標準材。軽量・高靭性・透明でモーターが見える。塗装は内側から。ただし覆う分の放熱悪化は物性どおり',
    isBaselineAnchor: false,
    priceProvisionalG: 350,
    hasPhysicalMaterial: true,
    density: pending('メーカー公式データシート個別ページを直接確認できなかった', CANDIDATE_CIT_POLYCARBONATE_DENSITY),
  },
] as const satisfies readonly BodyMaterial[];

export const ALL_MATERIALS: readonly Material[] = [
  ...WIRE_MATERIALS,
  ...COATING_MATERIALS,
  ...MAGNET_MATERIALS,
  ...GEAR_MATERIALS,
  ...BATTERY_MATERIALS,
  ...BRUSH_MATERIALS,
  ...SUBSTRATE_MATERIALS,
  ...ROLLER_MATERIALS,
  ...BODY_MATERIALS,
];

export type MaterialId = (typeof ALL_MATERIALS)[number]['id'];

// spec §15「名称・商標」: 素材名は一般名・元素名のみ使用し、登録商標はゲーム内表記に使用しない。
// 本リストはspec §15が明示する例(ジュラコン・MCナイロン・テフロン)に加え、本ファイルが扱う
// 素材分野で混同しやすい代表的な登録商標(デルリン=POMのDuPont商標、ベークライト/Bakelite=
// フェノール樹脂のUnion Carbide由来商標)を防御的に追加している。ゲーム内表示文字列
// (id/nameJa/descriptionJa)にはこれらを使用しない。出典(Citation.literatureName)内での
// 引用識別のための言及は対象外とする(実在資料の題名を正確に引用する必要があるため)。
export const BANNED_TRADEMARK_TERMS: readonly string[] = [
  'ジュラコン',
  'MCナイロン',
  'テフロン',
  'デルリン',
  'Delrin',
  'ベークライト',
  'Bakelite',
];
