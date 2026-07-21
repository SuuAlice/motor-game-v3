import { describe, expect, it } from 'vitest';
import { computeAudioTabUiState } from '../audioTabUiState';

// Task#18: 生成完了前に再生系ボタンを押しても無反応・無音のまま何も
// フィードバックが出ない不具合の修正。生成状態→ボタン有効/無効・表示文言の
// 対応をReact/DOMから切り離して検証する。
describe('computeAudioTabUiState', () => {
  it('idle: 再生系ボタンは無効、生成ボタンは有効、文言で理由が分かる', () => {
    const state = computeAudioTabUiState('idle');
    expect(state.generateButtonDisabled).toBe(false);
    expect(state.playbackControlsDisabled).toBe(true);
    expect(state.statusMessage).toContain('先に');
  });

  it('generating: 生成ボタン・再生系ボタンともに無効(二重生成防止)', () => {
    const state = computeAudioTabUiState('generating');
    expect(state.generateButtonDisabled).toBe(true);
    expect(state.playbackControlsDisabled).toBe(true);
    expect(state.statusMessage).toContain('生成中');
  });

  it('ready: 生成ボタン・再生系ボタンともに有効', () => {
    const state = computeAudioTabUiState('ready');
    expect(state.generateButtonDisabled).toBe(false);
    expect(state.playbackControlsDisabled).toBe(false);
  });

  it('ready: detailMessageを渡すとstatusMessageに反映される', () => {
    const state = computeAudioTabUiState('ready', '生成完了(楽器5種+残響IR+モーター音)');
    expect(state.statusMessage).toBe('生成完了(楽器5種+残響IR+モーター音)');
  });

  it('error: 再生系ボタンは無効のまま、生成ボタンは再試行できるよう有効に戻る', () => {
    const state = computeAudioTabUiState('error');
    expect(state.generateButtonDisabled).toBe(false);
    expect(state.playbackControlsDisabled).toBe(true);
  });

  it('error: detailMessageを渡すとエラー内容がstatusMessageに反映される', () => {
    const state = computeAudioTabUiState('error', '生成に失敗しました: AudioContext is not defined');
    expect(state.statusMessage).toBe('生成に失敗しました: AudioContext is not defined');
  });

  it('4状態のstatusMessageはすべて異なる(既定文言、detailMessage省略時)', () => {
    const messages = (['idle', 'generating', 'ready', 'error'] as const).map((s) => computeAudioTabUiState(s).statusMessage);
    expect(new Set(messages).size).toBe(4);
  });
});
