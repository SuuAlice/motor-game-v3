// P4-1B B1(2026-08-30人間承認): 半自動治具の入力規則をproductionへ移設した境界の固定。
//
// 守りたいのは2つ。
// (a) production(components/modes/retro/store/materials)が`src/p40/**`へ依存しないこと。
//     P4-0のディレクトリはP4-1中は比較証跡として凍結されており、productionがそこへ
//     依存すると「凍結対象なのに壊せない」状態になる。
// (b) 移設が**純移動**であること。移設先が記録の型・量子化・検証を自前で持ち始めたら、
//     `src/materials/windingRecord.ts`の単一出典が崩れる。
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PRODUCTION_ROOTS = ['components', 'modes', 'retro', 'store', 'materials', 'engine', 'render', 'data'];

/** コメントを落とす。説明文中の語をimplementationと数えないため。 */
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function collectSources(dir: URL, out: { path: string; source: string }[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) collectSources(child, out);
    else if (/\.tsx?$/.test(entry.name)) out.push({ path: child.pathname, source: readFileSync(child, 'utf8') });
  }
}

describe('productionはsrc/p40へ依存しない', () => {
  const sources: { path: string; source: string }[] = [];
  for (const root of PRODUCTION_ROOTS) {
    collectSources(new URL(`../../../${root}/`, import.meta.url), sources);
  }

  it('走査が全rootへ届いている(空虚に通らないことの陽性対照)', () => {
    expect(sources.length).toBeGreaterThan(50);
    for (const root of PRODUCTION_ROOTS) {
      expect(sources.some((s) => s.path.includes(`/src/${root}/`)), root).toBe(true);
    }
    // 移設先そのものが走査対象に入っていること。
    expect(sources.some((s) => s.path.endsWith('/src/retro/winding/inputCommands.ts'))).toBe(true);
  });

  it('production実装からp40へのimportが0件', () => {
    for (const { path, source } of sources) {
      if (path.includes('/__tests__/')) continue; // testはproduction成果物ではない
      expect(strip(source), path).not.toMatch(/from '[^']*\bp40\//);
      expect(strip(source), path).not.toMatch(/import\([^)]*\bp40\//);
    }
  });
});

describe('移設は純移動である', () => {
  const moved = readFileSync(new URL('../inputCommands.ts', import.meta.url), 'utf8');
  const code = strip(moved);

  it('記録の型・量子化・検証を自前で持たず、正典をimportする', () => {
    expect(code).toMatch(/from '\.\.\/\.\.\/materials\/windingRecord'/);
    // 量子化・置換の再実装が無いこと(正典の関数を呼ぶだけ)。
    expect(code).not.toMatch(/1\s*\/\s*256/);
    expect(code).not.toMatch(/function\s+quantize/);
    expect(code).not.toMatch(/function\s+replaceWindingRange/);
  });

  it('DOM・タイマー・storeを扱わない(意味コマンドの層に閉じる)', () => {
    for (const forbidden of [
      'document', 'window.', 'addEventListener', 'requestAnimationFrame',
      'useGameStore', 'useSaveStore', 'localStorage',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('選外案専用kernelを持ち込んでいない', () => {
    for (const forbidden of ['advanceRotation', 'releaseRotation', 'expandPatternToCommands', 'DEFAULT_PATTERN']) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('承認された16項目をexportしている', () => {
    for (const name of [
      'applyWindingCommand', 'applyWindingCommands', 'INITIAL_WINDING_INPUT_STATE', 'WindingInputState',
      'resolveGuideFromX', 'resolvePadInput', 'resolveJigKeyCommand', 'SEMI_AUTO_TICK_MS', 'advanceTicks',
      'WindingCommand', 'WindingInputProps', 'PadPoint', 'WindingCurrentValues', 'KEY_STEP',
      'TickState', 'INITIAL_TICK_STATE',
    ]) {
      expect(code, name).toMatch(new RegExp(`export (function|const|interface|type) ${name}\\b`));
    }
  });

  it('re-export shimを置いていない', () => {
    const legacy = strip(readFileSync(new URL('../../../p40/inputs/inputCommands.ts', import.meta.url), 'utf8'));
    expect(legacy).not.toMatch(/export \*/);
    expect(legacy).not.toMatch(/export \{[^}]*\} from/);
  });
});
