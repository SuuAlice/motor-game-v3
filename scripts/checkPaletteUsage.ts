// Unit B成果物: src/retro/(既定でsrc/retro-protoも)配下のRGB直値混入を検査するCLI。
// 検出ロジック本体はsrc/retro/lint/rawColorScan.ts(テスト済みの純関数)。
// 本スクリプトはディレクトリ走査+結果出力のみを担う薄いラッパー(新規依存なし)。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findRawColorViolations, isExemptFile } from '../src/retro/lint/rawColorScan';

const TARGET_EXTENSIONS = ['.ts', '.tsx'];
const DEFAULT_DIRS = ['src/retro', 'src/retro-proto'];

// __tests__配下・*.test.ts(x)はテストfixture(意図的な違反文字列を含みうる)であり、
// 実際に描画へ使われるコードではないため走査対象から除外する。RGB直値検査自体の
// テスト(src/retro/lint/__tests__/rawColorScan.test.ts)は検査関数へ文字列を直接
// 渡すユニットテストとして別途実施しており、このCLIの走査対象ではない。
function isTestFile(name: string): boolean {
  return name === '__tests__' || /\.test\.tsx?$/.test(name);
}

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    // ディレクトリが存在しない場合(例: src/retro-protoが未着手)はスキップする
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (isTestFile(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (TARGET_EXTENSIONS.includes(entry.slice(entry.lastIndexOf('.')))) {
      files.push(fullPath);
    }
  }
  return files;
}

const targetDirs = process.argv.slice(2);
const dirsToScan = targetDirs.length > 0 ? targetDirs : DEFAULT_DIRS;

let violationCount = 0;
for (const dir of dirsToScan) {
  for (const filePath of walk(dir)) {
    if (isExemptFile(filePath)) continue;
    const source = readFileSync(filePath, 'utf-8');
    const violations = findRawColorViolations(source, filePath);
    for (const v of violations) {
      console.error(`${v.filePath}:${v.line}:${v.column}  RGB直値の疑い: ${v.match}`);
      violationCount++;
    }
  }
}

if (violationCount > 0) {
  console.error(`\n${violationCount}件のRGB直値混入疑いを検出しました(palette.tsは対象外)。`);
  process.exit(1);
} else {
  console.log(`RGB直値の混入は検出されませんでした(対象: ${dirsToScan.join(', ')})。`);
}
