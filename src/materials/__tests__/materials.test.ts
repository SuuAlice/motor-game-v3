import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_MATERIALS,
  BANNED_TRADEMARK_TERMS,
  BATTERY_MATERIALS,
  BODY_MATERIALS,
  BRUSH_MATERIALS,
  COATING_MATERIALS,
  GEAR_MATERIALS,
  MAGNET_MATERIALS,
  MATERIAL_FAMILIES,
  ROLLER_MATERIALS,
  SUBSTRATE_MATERIALS,
  WIRE_MATERIALS,
  type Material,
  type NumericProperty,
} from '../materials';

const FAMILY_LISTS: Record<string, readonly Material[]> = {
  wire: WIRE_MATERIALS,
  coating: COATING_MATERIALS,
  magnet: MAGNET_MATERIALS,
  gear: GEAR_MATERIALS,
  battery: BATTERY_MATERIALS,
  brush: BRUSH_MATERIALS,
  substrate: SUBSTRATE_MATERIALS,
  roller: ROLLER_MATERIALS,
  body: BODY_MATERIALS,
};

/** 全材料が持つNumericPropertyフィールドを1本のリストへ集約する(family固有フィールド名の違いを吸収)。 */
function collectNumericProperties(): NumericProperty[] {
  const values: NumericProperty[] = [];
  for (const material of WIRE_MATERIALS) values.push(material.resistivity, material.density);
  for (const material of COATING_MATERIALS) values.push(material.heatTolerance);
  for (const material of MAGNET_MATERIALS) values.push(material.remanenceBr, material.maxUseTemp, material.density);
  for (const material of GEAR_MATERIALS) values.push(material.density);
  for (const material of SUBSTRATE_MATERIALS) values.push(material.density);
  for (const material of BODY_MATERIALS) if (material.hasPhysicalMaterial) values.push(material.density);
  return values;
}

const SPEC_MD_PATH = resolve(__dirname, '../../../docs/spec.md');
const SPEC_MD_TEXT = readFileSync(SPEC_MD_PATH, 'utf-8');

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** spec.md §4.2の該当ティア行から、指定コラム位置の数値を1個抽出する。 */
function findSpecTableNumber(nameJa: string, tierIndex: number, columnPattern: RegExp): number {
  const rowPattern = new RegExp(String.raw`\|\s*${tierIndex}\s*\|\s*${escapeRegExp(nameJa)}\s*\|([^\n]*)`);
  const rowMatch = SPEC_MD_TEXT.match(rowPattern);
  if (!rowMatch) {
    throw new Error(`spec.md §4.2に「${nameJa}」(tier${tierIndex})の行が見つかりません`);
  }
  const columnMatch = rowMatch[1].match(columnPattern);
  if (!columnMatch) {
    throw new Error(`spec.md §4.2の「${nameJa}」行から数値を抽出できません: ${rowMatch[1]}`);
  }
  return Number.parseFloat(columnMatch[1]);
}

describe('materials.ts 9ファミリー静的検査', () => {
  it('全ファミリーがMATERIAL_FAMILIESに列挙されている', () => {
    expect(new Set(Object.keys(FAMILY_LISTS))).toEqual(new Set(MATERIAL_FAMILIES));
  });

  it('全ファミリーのティアが1つ以上存在する', () => {
    for (const family of MATERIAL_FAMILIES) {
      expect(FAMILY_LISTS[family].length).toBeGreaterThan(0);
    }
  });

  it('IDが全ファミリー横断で重複しない', () => {
    const ids = ALL_MATERIALS.map((material) => material.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tierIndexがファミリー内で0始まり連番かつfamilyフィールドが一致する', () => {
    for (const family of MATERIAL_FAMILIES) {
      const tiers = [...FAMILY_LISTS[family]].sort((a, b) => a.tierIndex - b.tierIndex);
      tiers.forEach((tier, index) => {
        expect(tier.tierIndex).toBe(index);
        expect(tier.family).toBe(family);
      });
    }
  });

  it('各ファミリーのanchorティアは高々1件', () => {
    for (const family of MATERIAL_FAMILIES) {
      const anchors = FAMILY_LISTS[family].filter((tier) => tier.isBaselineAnchor);
      expect(anchors.length).toBeLessThanOrEqual(1);
    }
  });

  it('必須文字列フィールド(id/nameJa/descriptionJa)が空でない', () => {
    for (const material of ALL_MATERIALS) {
      expect(material.id.length).toBeGreaterThan(0);
      expect(material.nameJa.length).toBeGreaterThan(0);
      expect(material.descriptionJa.length).toBeGreaterThan(0);
    }
  });

  it('priceProvisionalGが有限かつ非負', () => {
    for (const material of ALL_MATERIALS) {
      expect(Number.isFinite(material.priceProvisionalG)).toBe(true);
      expect(material.priceProvisionalG).toBeGreaterThanOrEqual(0);
    }
  });

  it('id・nameJa・descriptionJa(ゲーム内表示文字列)が禁止商標語(spec §15)を含まない', () => {
    // Citation.literatureNameは実在資料の題名を正確に引用するため対象外とする
    // (docs/phase2-plan.md §13、Suu再レビュー指摘4)。
    for (const material of ALL_MATERIALS) {
      for (const term of BANNED_TRADEMARK_TERMS) {
        expect(material.id.includes(term), `${material.id}のidに禁止語「${term}」`).toBe(false);
        expect(material.nameJa.includes(term), `${material.id}のnameJaに禁止語「${term}」`).toBe(false);
        expect(material.descriptionJa.includes(term), `${material.id}のdescriptionJaに禁止語「${term}」`).toBe(false);
      }
    }
  });

  it('body tier0(なし)は物質が存在しないためcatalog物性を持たない', () => {
    const none = BODY_MATERIALS.find((material) => material.tierIndex === 0);
    expect(none).toBeDefined();
    expect(none!.hasPhysicalMaterial).toBe(false);
    expect('density' in none!).toBe(false);
  });

  it('body tier1以降は物性フィールドを持つ', () => {
    for (const material of BODY_MATERIALS.filter((m) => m.tierIndex > 0)) {
      expect(material.hasPhysicalMaterial).toBe(true);
      expect('density' in material).toBe(true);
    }
  });

  describe('NumericProperty(verified/pending判別共用体)', () => {
    it('(a) pendingはvalueプロパティを実行時にも持たない', () => {
      for (const property of collectNumericProperties()) {
        if (property.verifiedForPhysics) continue;
        expect('value' in property, `pending扱いなのにvalueを持つ: ${property.reason}`).toBe(false);
      }
    });

    it('(b) verifiedはvalueが有限かつ正であり、originが正しい区分に属する', () => {
      const validVerifiedOrigins = new Set(['projectSpec', 'manufacturerDatasheet', 'standardOrGovernment', 'academicReference']);
      for (const property of collectNumericProperties()) {
        if (!property.verifiedForPhysics) continue;
        expect(Number.isFinite(property.value)).toBe(true);
        expect(property.value).toBeGreaterThan(0);
        expect(validVerifiedOrigins.has(property.origin), `不正なorigin: ${property.origin}`).toBe(true);
        expect(property.citation.literatureName.length).toBeGreaterThan(0);
        expect(property.citation.publisher.length).toBeGreaterThan(0);
        expect(property.citation.sourceKind.length).toBeGreaterThan(0);
        if (property.origin === 'projectSpec') continue;
        // projectSpec以外は外部資料のためURL・参照日を必須とする
        expect(property.citation.url, `${property.citation.literatureName} にURLがありません`).toBeTruthy();
        expect(property.citation.accessedOn, `${property.citation.literatureName} に参照日がありません`).toBeTruthy();
      }
    });

    it('(c) pendingはreasonが非空である', () => {
      for (const property of collectNumericProperties()) {
        if (property.verifiedForPhysics) continue;
        expect(property.status).toBe('pending');
        expect(property.reason.length).toBeGreaterThan(0);
      }
    });

    it('(d) verified/pendingの件数を固定する(回帰検知用)', () => {
      const properties = collectNumericProperties();
      const verifiedCount = properties.filter((p) => p.verifiedForPhysics).length;
      const pendingCount = properties.filter((p) => !p.verifiedForPhysics).length;
      // 導線: 抵抗率4(projectSpec)+密度3(verified: Al/Cu/Ag)+密度1(pending: 銀メッキ)
      // 被膜: 耐熱クラス4(projectSpec)
      // 磁石: Br4+使用上限温度4(projectSpec)+密度4(verified: 全ティア manufacturerDatasheet)
      // ギヤ: 密度4(pending: 全ティア)
      // 台紙: 密度3(pending: 全ティア)
      // ボディ: 密度3(pending: 全ティア、tier1-3)
      expect(verifiedCount).toBe(23);
      expect(pendingCount).toBe(11);
      expect(verifiedCount + pendingCount).toBe(properties.length);
    });
  });

  // spec.md §4.2との転記一致は、materials.ts側の「転記ミス」を機械検出するものであり、
  // 密度等の外部物性値そのものの一次資料確認を代替するものではない
  // (docs/phase2-plan.md §13、Suu再レビュー指摘9)。すべてprojectSpec(常にverified)由来のため
  // .valueへ直接アクセスできる。
  describe('spec.md §4.2 転記一致(projectSpec値の転記ミス検出。外部物性の一次確認は代替しない)', () => {
    it('導線の抵抗率がspec表と一致する(≈記号は許容)', () => {
      for (const material of WIRE_MATERIALS) {
        const expected = findSpecTableNumber(material.nameJa, material.tierIndex, /[≈]?([0-9.]+)/);
        expect(material.resistivity.verifiedForPhysics).toBe(true);
        expect(material.resistivity.value).toBeCloseTo(expected, 10);
      }
    });

    it('エナメル被膜の耐熱クラスがspec表と一致する', () => {
      for (const material of COATING_MATERIALS) {
        const expected = findSpecTableNumber(material.nameJa, material.tierIndex, /([0-9.]+)℃/);
        expect(material.heatTolerance.verifiedForPhysics).toBe(true);
        expect(material.heatTolerance.value).toBeCloseTo(expected, 10);
      }
    });

    it('磁石のBr・使用上限温度がspec表と一致する', () => {
      for (const material of MAGNET_MATERIALS) {
        const brPattern = new RegExp(
          String.raw`\|\s*${material.tierIndex}\s*\|\s*${escapeRegExp(material.nameJa)}\s*\|\s*([0-9.]+)\+?\s*\|`,
        );
        const brMatch = SPEC_MD_TEXT.match(brPattern);
        expect(brMatch, `Brの行が見つかりません: ${material.nameJa}`).not.toBeNull();
        expect(material.remanenceBr.verifiedForPhysics).toBe(true);
        expect(material.remanenceBr.value).toBeCloseTo(Number.parseFloat(brMatch![1]), 10);

        const tempPattern = new RegExp(
          String.raw`\|\s*${material.tierIndex}\s*\|\s*${escapeRegExp(material.nameJa)}\s*\|\s*[0-9.]+\+?\s*\|\s*[^|]*?([0-9.]+)℃`,
        );
        const tempMatch = SPEC_MD_TEXT.match(tempPattern);
        expect(tempMatch, `使用上限温度の行が見つかりません: ${material.nameJa}`).not.toBeNull();
        expect(material.maxUseTemp.verifiedForPhysics).toBe(true);
        expect(material.maxUseTemp.value).toBeCloseTo(Number.parseFloat(tempMatch![1]), 10);
      }
    });
  });
});
