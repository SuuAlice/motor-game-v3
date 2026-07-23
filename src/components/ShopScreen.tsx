// 店(ショップ)画面。docs/phase2-ui-shop-plan.md v4・docs/phase2-ui-shop-fable-review.md
// 条件付き承認に従う: Canvas描画(見た目)はart-spec準拠のレトロ低解像度Canvas、DOM要素は
// アクセシビリティ用の操作要素・フォーカス層に限定する(v4 §10)。購入可能なのは
// PURCHASABLE_FAMILIESの6ファミリーのみ(Fable必須修正A)。
import { useEffect, useRef, useState } from 'react';
import { useRetroCanvasFrame } from './useRetroCanvasFrame';
import { loadPixelFonts } from '../retro/text/pixelFonts';
import { drawCatalogScreen } from '../retro/shop/drawCatalog';
import { drawConfirmDialogChrome } from '../retro/shop/drawConfirmDialog';
import { computeDialogRect, computeScrollToRevealRow } from '../retro/shop/layout';
import { CATALOG_HEADER_HEIGHT_PX, CATALOG_ROW_HEIGHT_PX } from '../retro/shop/constants';
import { formatCatalogRowAriaLabel, formatPriceLabel } from '../retro/shop/formatMaterial';
import { ALL_MATERIALS, type Material, type MaterialId } from '../materials/materials';
import { canAffordPurchase, isPurchasableFamily } from '../store/shopEconomy';
import { useShopEconomyStore } from '../store/shopEconomyStore';
import { useGameStore } from '../store/gameStore';

const DIALOG_PREFERRED_WIDTH_PX = 220;
const DIALOG_PREFERRED_HEIGHT_PX = 130;

export function ShopScreen() {
  const setMode = useGameStore((s) => s.setMode);
  const economy = useShopEconomyStore((s) => s.state);
  const lastErrorJa = useShopEconomyStore((s) => s.lastErrorJa);
  const purchase = useShopEconomyStore((s) => s.purchase);
  const clearLastError = useShopEconomyStore((s) => s.clearLastError);

  const { containerRef, canvasRef, contentRes, scaleResult } = useRetroCanvasFrame();
  const [fontStatus, setFontStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [scrollOffsetPx, setScrollOffsetPx] = useState(0);
  const [dialogMaterial, setDialogMaterial] = useState<Material | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    loadPixelFonts().then((result) => setFontStatus(result.ok ? 'ok' : 'error'));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scaleResult.fits) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCatalogScreen(ctx, {
      materials: ALL_MATERIALS,
      contentWidthPx: contentRes.w,
      contentHeightPx: contentRes.h,
      scrollOffsetPx,
      focusedIndex,
      cashG: economy.cashG,
    });
    if (dialogMaterial) {
      const rect = computeDialogRect(contentRes.w, contentRes.h, DIALOG_PREFERRED_WIDTH_PX, DIALOG_PREFERRED_HEIGHT_PX);
      const messageLines = [`${dialogMaterial.nameJa}を購入しますか?`, `価格: ${formatPriceLabel(dialogMaterial)}`];
      if (!canAffordPurchase(economy.cashG, dialogMaterial.priceProvisionalG)) messageLines.push('所持金が不足しています');
      drawConfirmDialogChrome(ctx, rect, '購入確認', messageLines);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRes.w, contentRes.h, scaleResult.fits, scrollOffsetPx, focusedIndex, economy.cashG, dialogMaterial, fontStatus]);

  useEffect(() => {
    if (dialogMaterial) confirmButtonRef.current?.focus();
  }, [dialogMaterial]);

  function handleRowFocus(index: number, buttonEl: HTMLButtonElement) {
    setFocusedIndex(index);
    lastFocusedButtonRef.current = buttonEl;
    setScrollOffsetPx((current) =>
      computeScrollToRevealRow(index, current, CATALOG_ROW_HEIGHT_PX, CATALOG_HEADER_HEIGHT_PX, contentRes.h, ALL_MATERIALS.length),
    );
  }

  function openDialog(material: Material) {
    clearLastError();
    setDialogMaterial(material);
  }

  function closeDialog() {
    setDialogMaterial(null);
    lastFocusedButtonRef.current?.focus();
  }

  function confirmPurchase() {
    if (!dialogMaterial) return;
    if (!canAffordPurchase(economy.cashG, dialogMaterial.priceProvisionalG)) return;
    purchase(dialogMaterial.id as MaterialId);
    closeDialog();
  }

  const rowWidthCss = scaleResult.contentWidthPx;
  const rowHeightCss = CATALOG_ROW_HEIGHT_PX * scaleResult.scale;

  // containerRefの要素は常に同一サイズのクラスで描画する。fits判定に応じてサイズ自体を
  // 変えると、「収まらない」表示用の小さいコンテナがResizeObserverの再測定でも
  // 永遠に収まらないままになる循環(実機検証で発見)を避けるため。
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-900">カタログ(店)</h2>
        <button type="button" onClick={() => setMode('garage')} className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold text-white">
          ガレージへ戻る
        </button>
      </div>
      {lastErrorJa && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{lastErrorJa}</p>}
      <div ref={containerRef} className="relative h-[70vh] min-h-80 overflow-hidden bg-slate-800">
        {!scaleResult.fits && (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white">
            現在の画面ではカタログ(content {contentRes.w}×{contentRes.h})が等倍でも収まりません。
          </div>
        )}
        {scaleResult.fits && (
          <>
            <canvas
              ref={canvasRef}
              style={{
                imageRendering: 'pixelated',
                width: `${scaleResult.contentWidthPx}px`,
                height: `${scaleResult.contentHeightPx}px`,
                position: 'absolute',
                left: `${scaleResult.offsetXPx}px`,
                top: `${scaleResult.offsetYPx}px`,
              }}
            />
            <div
              className="absolute overflow-hidden"
              style={{ left: scaleResult.offsetXPx, top: scaleResult.offsetYPx, width: scaleResult.contentWidthPx, height: scaleResult.contentHeightPx }}
            >
              {/* 9ファミリー全行をフォーカス可能にする(購入不可の3ファミリーもaria-labelで
                  「試遊版では閲覧のみ」と示すのみで、フォーカス自体は必ず通す)。フォーカス追従の
                  スクロールだけがキーボードでの到達手段のため、行を欠かすと末尾ファミリーへ
                  到達できなくなる(Suu_mot3コードレビュー指摘)。 */}
              {!dialogMaterial &&
                ALL_MATERIALS.map((material, index) => {
                  const rowTopCss = (CATALOG_HEADER_HEIGHT_PX + index * CATALOG_ROW_HEIGHT_PX - scrollOffsetPx) * scaleResult.scale;
                  if (rowTopCss + rowHeightCss < 0 || rowTopCss > scaleResult.contentHeightPx) return null;
                  const purchasable = isPurchasableFamily(material.family);
                  return (
                    <button
                      key={material.id}
                      type="button"
                      aria-label={formatCatalogRowAriaLabel(material)}
                      aria-disabled={!purchasable}
                      onFocus={(e) => handleRowFocus(index, e.currentTarget)}
                      onClick={() => { if (purchasable) openDialog(material); }}
                      className="absolute left-0 bg-transparent opacity-0 outline-none focus:opacity-100 focus:outline focus:outline-2 focus:outline-offset-[-2px] focus:outline-yellow-300"
                      style={{ top: rowTopCss, width: rowWidthCss, height: rowHeightCss }}
                    />
                  );
                })}
            </div>
            {dialogMaterial && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`${dialogMaterial.nameJa}の購入確認`}
                className="absolute flex flex-col justify-end gap-1 p-1"
                style={(() => {
                  const rect = computeDialogRect(contentRes.w, contentRes.h, DIALOG_PREFERRED_WIDTH_PX, DIALOG_PREFERRED_HEIGHT_PX);
                  // レターボックスのオフセット(offsetXPx/offsetYPx)を加算しないと、コンテナが
                  // content比率とずれる場合にDOMダイアログがCanvas描画の枠とずれる(実機検証で発見)。
                  return {
                    left: scaleResult.offsetXPx + rect.xPx * scaleResult.scale,
                    top: scaleResult.offsetYPx + rect.yPx * scaleResult.scale,
                    width: rect.widthPx * scaleResult.scale,
                    height: rect.heightPx * scaleResult.scale,
                  };
                })()}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeDialog();
                }}
              >
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={closeDialog} className="rounded bg-slate-300 px-3 py-1 text-xs font-bold text-slate-900">
                    キャンセル
                  </button>
                  <button
                    ref={confirmButtonRef}
                    type="button"
                    onClick={confirmPurchase}
                    disabled={!canAffordPurchase(economy.cashG, dialogMaterial.priceProvisionalG)}
                    aria-label={canAffordPurchase(economy.cashG, dialogMaterial.priceProvisionalG) ? '確定' : '確定(所持金不足のため購入できません)'}
                    className="rounded bg-amber-600 px-3 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    確定
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
