// 棚(在庫・サルベージ)画面。docs/phase2-ui-shop-plan.md v4・Fable必須修正D:
// computeSalvageRateがok:falseの個体は確定操作を拒否し、状態を不変に保ち日本語エラーを表示する。
import { useEffect, useRef, useState } from 'react';
import { useRetroCanvasFrame } from './useRetroCanvasFrame';
import { loadPixelFonts } from '../retro/text/pixelFonts';
import { drawInventoryScreen } from '../retro/shop/drawInventory';
import { drawConfirmDialogChrome } from '../retro/shop/drawConfirmDialog';
import { computeDialogRect, computeScrollToRevealRow } from '../retro/shop/layout';
import { INVENTORY_HEADER_HEIGHT_PX, INVENTORY_ROW_HEIGHT_PX } from '../retro/shop/constants';
import { formatInventoryRowAriaLabel } from '../retro/shop/formatMaterial';
import { buildInventoryRows, previewSalvage, type InventoryRow } from '../store/shopEconomy';
import { useShopEconomyStore } from '../store/shopEconomyStore';
import { useGameStore } from '../store/gameStore';

const DIALOG_PREFERRED_WIDTH_PX = 220;
const DIALOG_PREFERRED_HEIGHT_PX = 130;

export function InventoryScreen() {
  const setMode = useGameStore((s) => s.setMode);
  const economy = useShopEconomyStore((s) => s.state);
  const lastErrorJa = useShopEconomyStore((s) => s.lastErrorJa);
  const lastSalvageAmountG = useShopEconomyStore((s) => s.lastSalvageAmountG);
  const salvage = useShopEconomyStore((s) => s.salvage);
  const clearLastError = useShopEconomyStore((s) => s.clearLastError);

  const { containerRef, canvasRef, contentRes, scaleResult } = useRetroCanvasFrame();
  const [fontStatus, setFontStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [scrollOffsetPx, setScrollOffsetPx] = useState(0);
  const [dialogRow, setDialogRow] = useState<InventoryRow | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedButtonRef = useRef<HTMLButtonElement | null>(null);

  const rows = buildInventoryRows(economy);

  useEffect(() => {
    loadPixelFonts().then((result) => setFontStatus(result.ok ? 'ok' : 'error'));
  }, []);

  const preview = dialogRow?.item ? previewSalvage(dialogRow.item) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scaleResult.fits) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawInventoryScreen(ctx, {
      rows,
      contentWidthPx: contentRes.w,
      contentHeightPx: contentRes.h,
      scrollOffsetPx,
      focusedIndex,
      cashG: economy.cashG,
    });
    if (dialogRow) {
      const rect = computeDialogRect(contentRes.w, contentRes.h, DIALOG_PREFERRED_WIDTH_PX, DIALOG_PREFERRED_HEIGHT_PX);
      const messageLines =
        preview?.ok
          ? [`回収率 ${(preview.rate * 100).toFixed(0)}%`, `回収額 ${preview.amountG} G`]
          : [preview?.reason ?? 'サルベージできません'];
      drawConfirmDialogChrome(ctx, rect, `${dialogRow.material.nameJa}のサルベージ`, messageLines);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRes.w, contentRes.h, scaleResult.fits, scrollOffsetPx, focusedIndex, economy.cashG, dialogRow, fontStatus, rows.length]);

  useEffect(() => {
    if (dialogRow) confirmButtonRef.current?.focus();
  }, [dialogRow]);

  function handleRowFocus(index: number, buttonEl: HTMLButtonElement) {
    setFocusedIndex(index);
    lastFocusedButtonRef.current = buttonEl;
    setScrollOffsetPx((current) =>
      computeScrollToRevealRow(index, current, INVENTORY_ROW_HEIGHT_PX, INVENTORY_HEADER_HEIGHT_PX, contentRes.h, rows.length),
    );
  }

  function openDialog(row: InventoryRow) {
    clearLastError();
    setDialogRow(row);
  }

  function closeDialog() {
    setDialogRow(null);
    lastFocusedButtonRef.current?.focus();
  }

  function confirmSalvageAction() {
    if (!dialogRow?.item) return;
    salvage(dialogRow.item.itemId);
    closeDialog();
  }

  const rowWidthCss = scaleResult.contentWidthPx;
  const rowHeightCss = INVENTORY_ROW_HEIGHT_PX * scaleResult.scale;

  // containerRefの要素は常に同一サイズのクラスで描画する(ShopScreen.tsxと同じ理由:
  // 「収まらない」表示専用の小さいコンテナに切り替えると、ResizeObserverの再測定でも
  // 永遠に収まらないままになる循環が実機検証で見つかったため)。
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-900">棚(在庫・サルベージ)</h2>
        <button type="button" onClick={() => setMode('garage')} className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold text-white">
          ガレージへ戻る
        </button>
      </div>
      {lastErrorJa && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{lastErrorJa}</p>}
      {lastSalvageAmountG !== null && !lastErrorJa && (
        <p className="rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">サルベージで {lastSalvageAmountG} G を回収しました。</p>
      )}
      <div ref={containerRef} className="relative h-[70vh] min-h-80 overflow-hidden bg-slate-800">
        {!scaleResult.fits && (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white">
            現在の画面では在庫画面(content {contentRes.w}×{contentRes.h})が等倍でも収まりません。
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
              {/* stackable行(線材・ワニス)も含め全在庫行をフォーカス可能にする。
                  stackableはサルベージ非対応(閲覧のみ)だが、フォーカス追従スクロールが
                  唯一のキーボード到達手段のため、行を欠かすと末尾の在庫へ到達できなくなる
                  (Suu_mot3コードレビュー指摘)。 */}
              {!dialogRow &&
                rows.map((row, index) => {
                  const rowTopCss = (INVENTORY_HEADER_HEIGHT_PX + index * INVENTORY_ROW_HEIGHT_PX - scrollOffsetPx) * scaleResult.scale;
                  if (rowTopCss + rowHeightCss < 0 || rowTopCss > scaleResult.contentHeightPx) return null;
                  const salvageable = row.kind === 'item' && !!row.item;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      aria-label={formatInventoryRowAriaLabel(row)}
                      aria-disabled={!salvageable}
                      onFocus={(e) => handleRowFocus(index, e.currentTarget)}
                      onClick={() => { if (salvageable) openDialog(row); }}
                      className="absolute left-0 bg-transparent opacity-0 outline-none focus:opacity-100 focus:outline focus:outline-2 focus:outline-offset-[-2px] focus:outline-yellow-300"
                      style={{ top: rowTopCss, width: rowWidthCss, height: rowHeightCss }}
                    />
                  );
                })}
            </div>
            {dialogRow && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`${dialogRow.material.nameJa}のサルベージ確認`}
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
                    onClick={confirmSalvageAction}
                    disabled={!preview?.ok}
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
