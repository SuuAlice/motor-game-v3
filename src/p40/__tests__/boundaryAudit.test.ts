// P4-0 G3: **境界を機械的に固定する監査テスト**(arbiter条件P4-C2/P4-C3、計画 v3 §4.2)。
//
// これらの禁止は「今の実装がたまたま満たしている」だけでは意味がない——後から1行importを
// 足せば静かに破れるため、ソースを直接読んで検査する。レビュー時の目視に依存しない。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const P40_DIR = join(__dirname, '..');
const SWEEP_SCRIPT = join(__dirname, '../../../scripts/phase4PrototypeSweep.ts');
const WINDING_RECORD = join(__dirname, '../../materials/windingRecord.ts');

function collectSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : collectSources(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** 監査対象: P4-0が新規に持ち込んだ実装すべて(テスト自身は除く)。 */
const AUDITED = [...collectSources(P40_DIR), SWEEP_SCRIPT, WINDING_RECORD];

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** コメント行を落とす——「呼ばない」と説明する散文を検出してしまわないため。 */
function codeOf(path: string): string {
  return read(path)
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !(trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'));
    })
    .join('\n');
}

describe('監査対象の取りこぼしがないこと', () => {
  it('P4-0の実装ファイルを1つ以上拾えている', () => {
    expect(AUDITED.length).toBeGreaterThan(5);
    expect(AUDITED.some((p) => p.endsWith('sessionRunner.ts'))).toBe(true);
    expect(AUDITED.some((p) => p.endsWith('phase4PrototypeSweep.ts'))).toBe(true);
  });
});

describe('監査器そのものが働くこと(陰性対照)', () => {
  // 監査が常にpassするだけの飾りになっていないことを、合成入力で確かめる。
  it('コード行の違反は検出し、コメント行の言及は見逃す', () => {
    const strip = (src: string): string =>
      src.split('\n').filter((line) => {
        const trimmed = line.trim();
        return !(trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'));
      }).join('\n');
    expect(strip('const x = Math.random();')).toMatch(/Math\.random/);
    expect(strip('// Math.randomは使わない')).not.toMatch(/Math\.random/);
    expect(strip("import { useSaveStore } from '../store/saveStore';")).toMatch(/\buseSaveStore\b/);
  });
});

describe('P4-C2: RNG既定引数(Math.random)経路の排除', () => {
  it('P4-0のどのファイルもMath.randomを使わない', () => {
    for (const path of AUDITED) {
      expect(codeOf(path), `${path} が Math.random を使用しています`).not.toMatch(/Math\.random/);
    }
  });

  it('stepTrackRunを呼ぶのはsessionRunner.tsのstep wrapperだけ', () => {
    const callers = AUDITED.filter((path) => /\bstepTrackRun\b/.test(codeOf(path)));
    expect(callers.map((p) => p.split('/').pop())).toStrictEqual(['sessionRunner.ts']);
  });
});

describe('P4-C3: production保存経路との構造的隔離', () => {
  // `effectiveTurnsRatio≠1`なMotorConfigが materialComposedBase 契約(base=undefined|1)を持つ
  // 保存経路へ流れ込む口を、そもそも作らない。
  const FORBIDDEN_SYMBOLS = [
    'computeRecipeKey',
    'encodeRecipe',
    'decodeRecipe',
    'validateMaterialComposedBase',
    'beginProductionRun',
    'performApplyRunOutcome',
    'startCourseRun',
    'startTestRun',
    'useSaveStore',
    'useGameStore',
    'localStorage',
    // G4追加: 保存側の状態そのものへ触れる口も塞ぐ。P4-0は「保存しない分岐」を足すのではなく、
    // 書き込み経路が構造的に存在しないことで保存しない(計画§4.2)。
    'applyRunOutcome',
    'applyResolvedDegradations',
    'discoveredModes',
    'codexRecords',
    'courseProgress',
    'runSequence',
    'inventory',
    'notebook',
  ];

  for (const symbol of FORBIDDEN_SYMBOLS) {
    it(`${symbol} をimportも呼出しもしない`, () => {
      for (const path of AUDITED) {
        expect(codeOf(path), `${path} が ${symbol} を参照しています`).not.toMatch(new RegExp(`\\b${symbol}\\b`));
      }
    });
  }

  it('src/store・src/data/saveの何もimportしない', () => {
    for (const path of AUDITED) {
      expect(codeOf(path), `${path} が store をimportしています`).not.toMatch(/from\s+['"][^'"]*\/store\//);
    }
  });

  it('破壊wrapperからはRNG生成器だけを借り、破壊状態機械には触れない', () => {
    const DESTRUCTION_SYMBOLS = ['createRunAccumulator', 'advanceDestruction', 'composeRuntimeEffect', 'deriveDegradationDiffs'];
    for (const path of AUDITED) {
      for (const symbol of DESTRUCTION_SYMBOLS) {
        expect(codeOf(path), `${path} が ${symbol} を参照しています`).not.toMatch(new RegExp(`\\b${symbol}\\b`));
      }
    }
  });
});

describe('凍結領域を書き換えていないこと(P4-0はengine/materialsの式を作らない)', () => {
  it('P4-0はengineの物理定数を再定義しない', () => {
    // 物理定数の複製はP4-0最大の事故源——engineの値と静かにずれる。
    for (const path of AUDITED) {
      expect(codeOf(path), `${path} が engine の定数を再定義しています`).not.toMatch(/\bconst\s+(MU_0|COPPER_RESISTIVITY|AIR_DENSITY|GRAVITY)\b/);
    }
  });
});
