// PHASE1-UNITH-REVIEW指摘5: 非機能要件「色だけに依存した状態表示をしない」への
// 対応。選択中タブの表示ロジック(aria-selected値・表示ラベルの記号付与)を
// 純関数として分離し、App.tsxのレンダリングから参照することでテスト可能にする。

export interface TabButtonState {
  ariaSelected: boolean;
  displayLabel: string;
}

const SELECTED_MARKER = '▶ ';

export function computeTabButtonState(tabLabel: string, isSelected: boolean): TabButtonState {
  return {
    ariaSelected: isSelected,
    displayLabel: isSelected ? `${SELECTED_MARKER}${tabLabel}` : tabLabel,
  };
}
