// Task#18(音源タブでモーター音が鳴らない)の根本原因は、生成完了前に
// 再生系ボタンを押しても`if (!buffer) return`で無反応・無音のまま何も
// フィードバックが出ないことだった。生成状態とボタンの有効/無効・
// 表示文言の対応をReact/DOMから切り離した純関数として抽出し、Node上で
// 検証できるようにする(art-spec的な色以外の状態表示規律にも従い、
// 文言そのもので状態を伝える)。
export type GenerationStatus = 'idle' | 'generating' | 'ready' | 'error';

export interface AudioTabUiState {
  statusMessage: string;
  generateButtonDisabled: boolean;
  /** モーター・BGM再生、各楽器の再生・WAV保存ボタンをまとめて制御する。 */
  playbackControlsDisabled: boolean;
}

export function computeAudioTabUiState(status: GenerationStatus, detailMessage?: string): AudioTabUiState {
  switch (status) {
    case 'idle':
      return {
        statusMessage: '未生成。先に音源を生成してください',
        generateButtonDisabled: false,
        playbackControlsDisabled: true,
      };
    case 'generating':
      return {
        statusMessage: '音源を生成中です…',
        generateButtonDisabled: true,
        playbackControlsDisabled: true,
      };
    case 'ready':
      return {
        statusMessage: detailMessage ?? '生成完了',
        generateButtonDisabled: false,
        playbackControlsDisabled: false,
      };
    case 'error':
      return {
        statusMessage: detailMessage ?? '生成に失敗しました。もう一度お試しください',
        generateButtonDisabled: false,
        playbackControlsDisabled: true,
      };
  }
}
