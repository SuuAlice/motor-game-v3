// PHASE1-PLAN-01-REV2【3】/ Suuレビュー条件: RGB直値の検査ロジックを純関数として
// 実装する。意図的な違反の検証は、作業ツリーへ違反ファイルを残す方式ではなく、
// この関数へ文字列fixtureを直接入力するユニットテストで行う(scripts/checkPaletteUsage.ts
// が実ファイルを読んでこの関数へ渡すCLIラッパーを担う)。

export interface RawColorViolation {
  filePath: string;
  line: number;
  column: number;
  match: string;
}

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_FUNC_PATTERN = /\brgba?\(/g;

export function findRawColorViolations(sourceText: string, filePath: string): RawColorViolation[] {
  const violations: RawColorViolation[] = [];
  const lines = sourceText.split('\n');

  lines.forEach((line, lineIdx) => {
    for (const pattern of [HEX_COLOR_PATTERN, RGB_FUNC_PATTERN]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        violations.push({
          filePath,
          line: lineIdx + 1,
          column: match.index + 1,
          match: match[0],
        });
      }
    }
  });

  return violations;
}

// palette.ts自身はRGB直値の定義元なので検査対象から除外する(Suuレビュー条件:
// palette.tsのみを例外とする。paints.ts等は未実装のため対象外)。
export function isExemptFile(filePath: string, exemptBasenames: readonly string[] = ['palette.ts']): boolean {
  const basename = filePath.split(/[\\/]/).pop() ?? filePath;
  return exemptBasenames.includes(basename);
}
