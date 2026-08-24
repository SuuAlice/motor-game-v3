// P3-4 G7-D(UI計画§8.1〜§8.3、art-spec §5.2): 走行中の破壊症状HUD。
// 表示判断は`destructionPresentation.ts`の純関数へ委ね、本コンポーネントは並べるだけにする。
//
// 三段開示(spec §7.3): 出すのは症状だけ。原因(「磁石が弱っています」等)は書かない。
import { useGameStore } from '../store/gameStore';
import { deriveDestructionHudState, PERFORMANCE_DROP_ICON } from '../retro/destruction/destructionPresentation';
import { PALETTE } from '../retro/palette';

/** 継続演出の日本語ラベル。症状の名前であり、原因の断定ではない。 */
const LOOP_LABEL: Record<string, string> = {
  D01_wireLash: 'コイルが暴れています',
  D02_smoke: '煙が出ています',
  D02_D04_flame: '燃えています',
};

export function DestructionHud() {
  // G8: 停止画面でも終端stepの症状を出す。live runが無い間は表示専用の退避を使う
  // (二重適用判定には使わない。§3.3-B(3)の「停止画面に症状を残す」契約)。
  const liveAccumulator = useGameStore((s) => s._runAccumulator);
  const terminalAccumulator = useGameStore((s) => s._terminalPresentationAccumulator);
  const accumulator = liveAccumulator ?? terminalAccumulator;
  if (accumulator === null) return null;

  const hud = deriveDestructionHudState(accumulator.destructionState);
  const symptoms = [
    ...(hud.showPerformanceDropIcon ? ['性能が落ちています'] : []),
    ...hud.activeLoops.map((id) => LOOP_LABEL[id] ?? id),
  ];

  // a11y項目6・7(J7): statusノードは**常設**し、textContentだけを差し替える。
  // 症状の有無でノードごと出し入れすると、支援技術が変更を検知できない、あるいは
  // 読み上げ直しが過剰になる。Canvas側のaria-labelを書き換えるのではなく、
  // この安定したDOMテキストを唯一の読み上げ経路にする。
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100">
      <span aria-hidden="true" style={{ color: PALETTE[PERFORMANCE_DROP_ICON.paletteKey], visibility: hud.showPerformanceDropIcon ? 'visible' : 'hidden' }}>▼</span>
      {/* 色だけに依存しないよう、記号と文言を併記する(a11y項目5)。 */}
      <p role="status" className="min-h-[1.25rem] m-0">{symptoms.join(' / ')}</p>
    </div>
  );
}
