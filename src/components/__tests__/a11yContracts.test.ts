// P3-4 G7-E(UI計画§13、全11項目): P3-4で追加・変更した画面のa11y契約。
// Reactレンダリング環境(jsdom)が無いため構造テスト(ソース検査)で固定する。
// **実挙動の確認(スクリーンリーダー読み上げ・実フォーカス移動・実ズーム)は
// 自動化できないため、通過扱いにせずG8の実ブラウザ試遊項目とする。**
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** P3-4で追加・変更した画面。 */
const SCREENS = {
  encyclopedia: read('../EncyclopediaScreen.tsx'),
  instrumentShop: read('../InstrumentShopPanel.tsx'),
  destructionHud: read('../DestructionHud.tsx'),
  saveGate: read('../SaveGate.tsx'),
  raceEffects: read('../../render/RaceEffects.tsx'),
};

describe('項目1: 操作可能要素はnative要素', () => {
  it('div/spanへonClickを付けていない', () => {
    for (const [name, source] of Object.entries(SCREENS)) {
      const code = stripComments(source);
      expect(code, name).not.toMatch(/<(div|span|p|li)[^>]*\sonClick/);
    }
  });

  it('操作要素は<button type="button">で書かれている', () => {
    for (const [name, source] of Object.entries(SCREENS)) {
      const code = stripComments(source);
      const buttons = code.match(/<button/g) ?? [];
      const typed = code.match(/type="button"/g) ?? [];
      expect(typed.length, name).toBeGreaterThanOrEqual(buttons.length);
    }
  });
});

describe('項目2・8: フォーカス可視化とforced-colors', () => {
  const css = read('../../index.css');

  it(':focus-visibleのリングが全体へ適用されている', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toMatch(/outline:\s*2px solid/);
  });

  it('forced-colors環境でもリングが消えない(システム色で描き直す)', () => {
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('Highlight');
  });
});

describe('項目3: モーダルのフォーカス契約', () => {
  const code = stripComments(SCREENS.saveGate);

  it('放棄確認はnative <dialog>で、独自のaria-modal風divではない', () => {
    expect(code).toContain('<dialog');
    expect(code).not.toContain('role="alertdialog"');
    expect(code).not.toContain('aria-modal');
  });

  it('背面無効化・Escape・Tab循環は既存hookへ委ねている(新機構を作らない)', () => {
    expect(code).toContain('useRetroDialog({ open: confirmingAbandon');
  });

  it('open時は先頭のフォーカス可能要素へ移し、破棄側を初期フォーカスにしない', () => {
    expect(code).toContain('abandonCancelRef.current?.focus()');
    expect(code).not.toMatch(/if \(confirmingAbandon\)[^\n]*abandonConfirm/);
  });

  it('閉じたらトリガー要素へフォーカスを戻す', () => {
    expect(code).toContain('abandonTriggerRef.current?.focus()');
  });

  it('accessible nameを持つ', () => {
    expect(code).toContain('aria-labelledby="abandon-dialog-heading"');
    expect(code).toContain('id="abandon-dialog-heading"');
  });
});

describe('項目4: roving tabindexの適用範囲', () => {
  it('図鑑一覧はnative Tab順のまま(tabIndexを触らない)', () => {
    expect(stripComments(SCREENS.encyclopedia)).not.toContain('tabIndex');
  });
});

describe('項目5: 色以外の状態表示', () => {
  it('性能低下は色つきアイコンだけでなく文言でも示す', () => {
    expect(SCREENS.destructionHud).toContain('性能が落ちています');
  });

  it('計測器の陳列状態は色ではなく文言で区別する', () => {
    expect(SCREENS.instrumentShop).toContain('{view.note}');
  });
});

describe('項目6・7: role区分とノード安定性(J7)', () => {
  it('通常の拒否理由はrole="status"で、role="alert"を使わない', () => {
    expect(stripComments(SCREENS.instrumentShop)).toContain('role="status"');
    expect(stripComments(SCREENS.instrumentShop)).not.toContain('role="alert"');
    // 保留中画面の再試行失敗も拒否理由なのでstatus。
    expect(stripComments(SCREENS.saveGate)).toContain('role="status"');
  });

  it('statusノードは常設し、条件でノードごと出し入れしない', () => {
    for (const name of ['instrumentShop', 'destructionHud', 'saveGate'] as const) {
      const code = stripComments(SCREENS[name]);
      // `{x && <p role="status">}` のようなノード自体の条件描画が無いこと。
      expect(code, name).not.toMatch(/&&\s*<p role="status"/);
      expect(code, name).not.toMatch(/\?\s*<p role="status"/);
    }
  });

  it('Canvasのaria-labelを高頻度で書き換えず、DOMのstatus領域を使う(項目7)', () => {
    const code = stripComments(SCREENS.raceEffects);
    expect(code).toContain('aria-hidden="true"');
    expect(code).not.toContain('aria-label');
  });
});

describe('項目9: タッチ/クリックターゲット', () => {
  it('P3-4で追加した画面の操作要素はすべて44px相当の最小寸法を持つ', () => {
    for (const name of ['instrumentShop', 'saveGate', 'encyclopedia'] as const) {
      const buttons = (stripComments(SCREENS[name]).match(/<button/g) ?? []).length;
      const minHeights = (SCREENS[name].match(/min-h-\[44px\]/g) ?? []).length;
      expect(buttons, name).toBeGreaterThan(0); // 空虚な一致(ボタン0件)を排除
      expect(minHeights, name).toBe(buttons);
    }
  });
});

describe('項目11: タイムアウト禁止', () => {
  it('保留中画面のメッセージを時間で自動消去しない', () => {
    const code = stripComments(SCREENS.saveGate);
    expect(code).not.toContain('setTimeout');
    expect(code).not.toContain('setInterval');
  });

  it('計測器の拒否理由も自動消去しない', () => {
    expect(stripComments(SCREENS.instrumentShop)).not.toContain('setTimeout');
  });
});
