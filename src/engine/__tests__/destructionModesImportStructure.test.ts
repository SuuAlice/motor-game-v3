// P3-1(docs/phase3-p3-1-plan.md v7 §2.1.1-補遺3)。正式Fable補足裁定(2026-08-03T16:13)の
// 付帯条件: leaf不変条件(destructionModes.tsの公開シグネチャに現れる全型はdestructionModes.ts
// 所有)・正式Fable P3-1-Q8(a)裁定(constants.tsへの一方向値importのみ許可)を、裁定文書ではなく
// テストで機械的に守る。既存src/retro/lint/rawColorScan.tsと同型のパターン(ソーステキストを
// 実際に読み込み走査する)。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('destructionModes.ts: leaf不変条件の構造テスト(正式Fable補足裁定)', () => {
  it('import文が許可リスト(value importは./constantsのみ、type-only importは./motorPhysics・./vehiclePhysicsのみ)以外を含まない', () => {
    const source = readFileSync(new URL('../destructionModes.ts', import.meta.url), 'utf-8');
    const importLines = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import '));

    expect(importLines.length, 'import文が1件も検出できていません(正規表現の不備の可能性)').toBeGreaterThan(0);

    for (const line of importLines) {
      const isTypeOnly = /^import type\b/.test(line);
      const fromMatch = line.match(/from '([^']+)'/);
      expect(fromMatch, `import文からモジュール指定子を抽出できません: ${line}`).not.toBeNull();
      const specifier = fromMatch![1];

      if (isTypeOnly) {
        expect(['./motorPhysics', './vehiclePhysics'], `type-only importの許可リスト外です: ${line}`).toContain(specifier);
      } else {
        expect(specifier, `value importの許可リスト外です(./constantsのみ許可): ${line}`).toBe('./constants');
      }
    }
  });

  it('destructionOrchestration.tsへの逆依存が存在しない', () => {
    const source = readFileSync(new URL('../destructionModes.ts', import.meta.url), 'utf-8');
    expect(source.includes("from './destructionOrchestration'")).toBe(false);
  });
});
