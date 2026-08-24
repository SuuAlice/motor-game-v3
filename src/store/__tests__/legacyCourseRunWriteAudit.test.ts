// P3-4 G6-R2(人間承認2026-08-19): `addCourseRunRecord`(legacy形状の直接書込み専用)の
// **呼出し箇所構造テスト**。G6-R1のtaxonomyは削除期限を「G9」としていたが、
// `addCourseRunRecord`には旧経路とは別の呼出し元(CourseMode手動保存)が存在するため、
// 削除期限は「**V2 CourseModeのretro UI置換**」へ訂正された(G9では削除されない)。
//
// 守る不変条件: **legacy形状のcourseRunを書き込めるのは、1本の委譲チェーンだけである**。
//   `modes/CourseMode.tsx`の手動「A/B比較用に実験ノートへ保存」
//     → `store/notebookStore.ts`の`addCourseRun`
//     → `store/saveStore.ts`の`addCourseRunRecord`
// **`gameStore`から本actionを呼ぶ経路は存在しない**(2026-08-19 rg実測、Suu_mot3照合済み。
// session腕の`addSessionRecord`はG9で旧経路ごと削除済みで、courseRun腕だけが残っている)。
// 新規のproductionレコードは`performApplyRunOutcome`のenvelope原子経路のみを通り、
// 生成境界(§16.5 builder)で`finalDestructionState`/`recipeKey`が型により必須化される。
//
// **本監査は、上記チェーンを削除する際に一緒に削除する。**
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const SRC_DIR = fileURLToPath(new URL('../../', import.meta.url)); // src/store/__tests__/ → src/

/** src配下のproductionソース(テストを除く)を列挙する。 */
function listProductionSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      listProductionSources(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe('G6-R2: legacy courseRun書込みの呼出し箇所監査', () => {
  const files = listProductionSources(SRC_DIR);

  it('前提: 走査対象のproductionソースが十分に存在する(空振りしていない)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("`addCourseRunRecord(`を呼ぶproductionファイルは store/notebookStore.ts のみ", () => {
    const callers = files
      .filter((file) => countOccurrences(readFileSync(file, 'utf-8'), 'addCourseRunRecord(') > 0)
      .map((file) => relative(SRC_DIR, file).replace(/\\/g, '/'));
    expect(callers).toEqual(['store/notebookStore.ts']);
  });

  it("`addCourseRunRecord(`の呼出しはproduction全体でちょうど1件", () => {
    // 許可ファイル内での件数増加を見逃さない(ファイル許可リストだけでは偽陰性になる)。
    const total = files.reduce((sum, file) => sum + countOccurrences(readFileSync(file, 'utf-8'), 'addCourseRunRecord('), 0);
    expect(total).toBe(1);
  });

  it("`addCourseRun(`(notebookStore経由の入口)を呼ぶproductionファイルは modes/CourseMode.tsx のみ", () => {
    const callers = files
      .filter((file) => {
        const source = readFileSync(file, 'utf-8');
        // 宣言・委譲自体(notebookStore.ts)は呼出しではないため除外する
        if (relative(SRC_DIR, file).replace(/\\/g, '/') === 'store/notebookStore.ts') return false;
        return countOccurrences(source, 'addCourseRun(') > 0;
      })
      .map((file) => relative(SRC_DIR, file).replace(/\\/g, '/'));
    expect(callers).toEqual(['modes/CourseMode.tsx']);
  });

  it('production経路(gameStore)からのlegacy直接書込みは0件である', () => {
    // courseRun腕の唯一の呼出しはCourseMode.tsxの手動保存であり、gameStoreからは呼ばれない。
    // (session腕の旧経路はG9で削除済み。)この不変条件を明示的に固定する。
    const source = readFileSync(join(SRC_DIR, 'store/gameStore.ts'), 'utf-8');
    expect(countOccurrences(source, 'addCourseRunRecord(')).toBe(0);
    expect(countOccurrences(source, 'addCourseRun(')).toBe(0);
  });

  it('legacy直接書込みactionはretro CourseMode置換まで存続し、UIでは常時無効化されている', () => {
    const source = readFileSync(join(SRC_DIR, 'modes/CourseMode.tsx'), 'utf-8');
    // native disabled + 隣接理由テキスト(UI計画§6.4.1のdisabled規律)
    expect(source).toContain('<button type="button" disabled');
    expect(source).toContain('走行結果は自動で実験ノートへ記録されます');
    expect(source).toContain('aria-describedby');
  });
});
