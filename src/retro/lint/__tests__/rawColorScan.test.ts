import { describe, expect, it } from 'vitest';
import { findRawColorViolations, isExemptFile } from '../rawColorScan';

describe('findRawColorViolations', () => {
  it('16進カラー直値を検出する', () => {
    const violations = findRawColorViolations("const c = '#ff00aa';", 'src/retro/foo.ts');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ filePath: 'src/retro/foo.ts', line: 1, match: '#ff00aa' });
  });

  it('3桁省略形の16進カラーも検出する', () => {
    const violations = findRawColorViolations("border: #fff;", 'x.ts');
    expect(violations).toHaveLength(1);
    expect(violations[0].match).toBe('#fff');
  });

  it('rgba()/rgb()関数呼び出しを検出する', () => {
    const violations = findRawColorViolations("ctx.fillStyle = 'rgba(0,0,0,0.5)';", 'x.ts');
    expect(violations).toHaveLength(1);
    expect(violations[0].match).toBe('rgba(');
  });

  it('PALETTE参照のみ(直値なし)では違反を検出しない', () => {
    const violations = findRawColorViolations("ctx.fillStyle = PALETTE.N0;", 'x.ts');
    expect(violations).toHaveLength(0);
  });

  it('複数行・複数違反の行番号を正しく報告する', () => {
    const src = ["const a = '#111111';", "const b = 'no color here';", "const c = 'rgb(1,2,3)';"].join('\n');
    const violations = findRawColorViolations(src, 'x.ts');
    expect(violations.map((v) => v.line)).toEqual([1, 3]);
  });

  it('コメント行の直値も検出する(コメント内の値も混入源になりうるため除外しない)', () => {
    const violations = findRawColorViolations('// #abcdef は仮の値', 'x.ts');
    expect(violations).toHaveLength(1);
  });
});

describe('isExemptFile', () => {
  it('palette.tsは既定で例外対象になる', () => {
    expect(isExemptFile('src/retro/palette.ts')).toBe(true);
    expect(isExemptFile('src/retro/palette.ts', ['palette.ts'])).toBe(true);
  });

  it('palette.ts以外は例外対象にならない', () => {
    expect(isExemptFile('src/retro/colorOps/blend.ts')).toBe(false);
  });

  it('パス区切りが\\でも basename を正しく判定する', () => {
    expect(isExemptFile('src\\retro\\palette.ts')).toBe(true);
  });

  it('例外リストを明示的に空にすると常にfalseになる', () => {
    expect(isExemptFile('src/retro/palette.ts', [])).toBe(false);
  });
});
