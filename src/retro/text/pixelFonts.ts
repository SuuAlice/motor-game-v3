// Unit C(PixelMplus本体導入)の実利用第一号。CSS Font Loading APIでTTFを読み込み、
// document.fontsへ登録する。ブラウザAPI(FontFace/document.fonts)に依存するため
// vitest(Node環境)ではテストしない。読み込みロジックは失敗時にok:falseを返すのみで、
// フォールバック先(sans-serif)への切替はCanvas側のctx.font指定(カンマ区切り)に委ねる。

const FONT_BASE = '/fonts/pixelmplus';

export const PIXEL_FONT_10 = 'PixelMplus10';
export const PIXEL_FONT_12 = 'PixelMplus12';

export interface PixelFontLoadResult {
  ok: boolean;
  error?: string;
}

let loadPromise: Promise<PixelFontLoadResult> | null = null;

export function loadPixelFonts(): Promise<PixelFontLoadResult> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const face10 = new FontFace(PIXEL_FONT_10, `url(${FONT_BASE}/PixelMplus10-Regular.ttf)`);
      const face12 = new FontFace(PIXEL_FONT_12, `url(${FONT_BASE}/PixelMplus12-Regular.ttf)`);
      const [loaded10, loaded12] = await Promise.all([face10.load(), face12.load()]);
      document.fonts.add(loaded10);
      document.fonts.add(loaded12);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })();

  return loadPromise;
}
