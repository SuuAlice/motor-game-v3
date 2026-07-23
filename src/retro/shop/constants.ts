// 店・在庫画面(docs/phase2-ui-shop-plan.md v4)で共有する描画ジオメトリ定数。
// Canvas描画側とDOM操作要素(アクセシビリティ層)の位置同期に使うため、
// 両方から同じ値を参照する。
export const CATALOG_ROW_HEIGHT_PX = 36;
export const CATALOG_HEADER_HEIGHT_PX = 18;
export const INVENTORY_ROW_HEIGHT_PX = 36;
export const INVENTORY_HEADER_HEIGHT_PX = 18;
export const ICON_SIZE_PX = 22;
// 項目3・6・8の修正(Suu_mot3承認2026-07-23)で追加: スクロール可能表示・現在位置表示。
export const SCROLLBAR_WIDTH_PX = 4;
export const SCROLLBAR_MARGIN_PX = 2;
export const SCROLLBAR_MIN_THUMB_HEIGHT_PX = 8;

// ショッピングカート方式(人間確定仕様2026-07-23)で追加。
export const CART_ROW_HEIGHT_PX = 34;
export const CART_HEADER_HEIGHT_PX = 18;
export const CART_FOOTER_HEIGHT_PX = 36;
/** カート行の操作列(−/+/削除)の合計幅。DOM側ボタン配置とCanvas側テキスト折返しの両方で使う。 */
export const CART_CONTROLS_WIDTH_PX = 96;
