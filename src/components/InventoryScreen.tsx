// 棚(在庫・サルベージ)画面。docs/phase2-ui-shop-plan.md v4・Fable必須修正D:
// computeSalvageRateがok:falseの個体は確定操作を拒否し、状態を不変に保ち日本語エラーを表示する。
//
// 選択とサルベージ操作の分離(人間確定仕様2026-07-23): 行のクリック/タップ/Arrow/Home/Endは
// 選択のみ。選択中の個体はselectedRowIndexで永続的に保持し、Canvas灰色ハイライトはこれ1つだけを
// 表示する。サルベージは独立した「サルベージ」ボタン(またはEnter/Space)から確認ダイアログを開く。
// 確認ダイアログはShopScreen.tsxのカート内訳と同じnative <dialog>+showModal()(useRetroDialog)で
// 真のモーダルにする。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRetroCanvasFrame } from './useRetroCanvasFrame';
import { useRetroDialog } from './useRetroDialog';
import { useElementViewportRect } from './useElementViewportRect';
import { loadPixelFonts } from '../retro/text/pixelFonts';
import { PALETTE } from '../retro/palette';
import { applyDirectCanvasBackingSize } from '../retro/canvas/directCanvas';
import { drawInventoryScreen } from '../retro/shop/drawInventory';
import { drawConfirmDialogChrome } from '../retro/shop/drawConfirmDialog';
import {
  clampScrollOffsetPx,
  computeDialogRect,
  computeMaxScrollOffsetPx,
  computeRowLayout,
  computeScrollToRevealRow,
  wrapRowIndex,
} from '../retro/shop/layout';
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
  // 選択中の行(常に値を持つ、Tabで一覧外へ出ても保持する=ShopScreen.tsxと同じ設計)。
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [scrollOffsetPx, setScrollOffsetPx] = useState(0);
  const [isSalvageDialogOpen, setIsSalvageDialogOpen] = useState(false);
  const [dialogRow, setDialogRow] = useState<InventoryRow | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const salvageButtonRef = useRef<HTMLButtonElement>(null);
  const rowButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // ShopScreen.tsxと同じ理由: 実キーボードフォーカス位置を選択状態と分離して追跡する
  // (可視範囲外スクロール時の不可視フォーカス防止専用、再描画不要)。
  const realFocusRowIndexRef = useRef<number | null>(null);
  // ダイアログを閉じた後(キャンセル/Escape)、「サルベージ」ボタンが再mountされてから
  // フォーカスするための予約フラグ(ShopScreen.tsxのpendingOpenCartButtonFocusと同じ理由)。
  const [pendingSalvageButtonFocus, setPendingSalvageButtonFocus] = useState(false);
  // サルベージ確定成功後は対象個体がrowsから消えるため、選択indexのクランプと、その結果
  // 「サルベージ」ボタンがdisabledになる場合は行/戻るボタンへのフォーカス退避が必要
  // (Suu_mot3コードレビュー指摘)。rows再計算後(economy state更新後)に実行する。
  const pendingPostSalvageAdjustRef = useRef(false);

  const rows = buildInventoryRows(economy);
  const selectedRow: InventoryRow | undefined = rows[selectedRowIndex];
  const selectedSalvageable = selectedRow?.kind === 'item' && !!selectedRow.item;

  const salvageDialogRef = useRetroDialog({ open: isSalvageDialogOpen, onClose: closeSalvageDialog });
  const containerViewportRect = useElementViewportRect(containerRef, isSalvageDialogOpen);
  const salvageDialogRect = computeDialogRect(contentRes.w, contentRes.h, DIALOG_PREFERRED_WIDTH_PX, DIALOG_PREFERRED_HEIGHT_PX);
  // サルベージ確認の見た目専用のdialog内Canvas(ShopScreen.tsxのcartCanvasRefと同じ理由:
  // native dialogのtop layer構成では通常canvasへ描くと::backdropの遮光を受けてしまうため)。
  const salvageCanvasRef = useRef<HTMLCanvasElement>(null);

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
      focusedIndex: selectedRowIndex,
      cashG: economy.cashG,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRes.w, contentRes.h, scaleResult.fits, scrollOffsetPx, selectedRowIndex, economy.cashG, fontStatus, rows.length]);

  // サルベージ確認の見た目はdialog内専用canvasへ描く(ShopScreen.tsxのcartCanvasRefと同じ理由)。
  useEffect(() => {
    if (!isSalvageDialogOpen || !dialogRow) return;
    const canvas = salvageCanvasRef.current;
    if (!canvas) return;
    applyDirectCanvasBackingSize(canvas, salvageDialogRect.widthPx, salvageDialogRect.heightPx);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    {
      const rect = { xPx: 0, yPx: 0, widthPx: salvageDialogRect.widthPx, heightPx: salvageDialogRect.heightPx };
      const messageLines =
        preview?.ok
          ? [`回収率 ${(preview.rate * 100).toFixed(0)}%`, `回収額 ${preview.amountG} G`]
          : [preview?.reason ?? 'サルベージできません'];
      drawConfirmDialogChrome(ctx, rect, `${dialogRow.material.nameJa}のサルベージ`, messageLines);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSalvageDialogOpen, dialogRow, salvageDialogRect.widthPx, salvageDialogRect.heightPx, fontStatus]);

  // ダイアログを開いた直後、明確な先頭操作(キャンセル、破壊的操作の確定ボタンではない)へ
  // フォーカスする(ShopScreen.tsxのカート内訳と同じ方針)。useLayoutEffectでペイント前に
  // 完了させ、未フォーカスのまま一瞬でも描画されないようにする(Suu_mot3コードレビュー指摘)。
  useLayoutEffect(() => {
    if (isSalvageDialogOpen) cancelButtonRef.current?.focus();
  }, [isSalvageDialogOpen]);

  // 通常の close(キャンセル/Escape)後、「サルベージ」ボタンが実際に再mountされてから
  // フォーカスする(ShopScreen.tsxと同じ理由: setState直後はまだref.currentがnull)。
  useEffect(() => {
    if (!isSalvageDialogOpen && pendingSalvageButtonFocus) {
      salvageButtonRef.current?.focus();
      setPendingSalvageButtonFocus(false);
    }
  }, [isSalvageDialogOpen, pendingSalvageButtonFocus]);

  // サルベージ確定成功後: 選択indexをrows再計算後の範囲へクランプし、新しい選択行が
  // サルベージ可能なら「サルベージ」ボタンへ、disabledになる場合はその行へ、rowsが0件に
  // なった場合は「ガレージへ戻る」へフォーカスする(disabledボタンへは決してfocusしない)。
  useEffect(() => {
    if (!pendingPostSalvageAdjustRef.current) return;
    pendingPostSalvageAdjustRef.current = false;
    if (rows.length === 0) {
      setSelectedRowIndex(0);
      backButtonRef.current?.focus();
      return;
    }
    const clampedIndex = Math.min(selectedRowIndex, rows.length - 1);
    setSelectedRowIndex(clampedIndex);
    const nextRow = rows[clampedIndex];
    const nextSalvageable = nextRow?.kind === 'item' && !!nextRow.item;
    if (nextSalvageable) {
      salvageButtonRef.current?.focus();
    } else {
      rowButtonRefs.current[clampedIndex]?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const maxScrollOffsetPx = computeMaxScrollOffsetPx(rows.length, INVENTORY_ROW_HEIGHT_PX, INVENTORY_HEADER_HEIGHT_PX, contentRes.h);

  // ホイールでのスクロールを必須化(人間試遊フィードバック項目8)。ShopScreen.tsxと同じ理由で
  // ネイティブaddEventListenerを{passive:false}で使う(Reactのonwheelはpreventdefaultが効かない)。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      setScrollOffsetPx((current) => clampScrollOffsetPx(current + e.deltaY, maxScrollOffsetPx));
    };
    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', handleWheelNative);
  }, [containerRef, maxScrollOffsetPx]);

  // ShopScreen.tsxと同じ理由: ホイール等で実フォーカス中の行が可視範囲外に出た場合、不可視の
  // ままフォーカスを残さない。selectedRowIndex(選択の記憶)には触れず、実DOMフォーカスだけを
  // 安全な状態(blur)へ戻す。
  useEffect(() => {
    const index = realFocusRowIndexRef.current;
    if (index === null) return;
    const layout = computeRowLayout(rows.length, INVENTORY_ROW_HEIGHT_PX, INVENTORY_HEADER_HEIGHT_PX, contentRes.h, scrollOffsetPx);
    if (layout[index]?.visible) return;
    (document.activeElement as HTMLElement | null)?.blur();
    realFocusRowIndexRef.current = null;
  }, [scrollOffsetPx, contentRes.h, rows.length]);

  // 選択の確定のみ(ShopScreen.tsxのhandleRowSelectと同じ理由: iOS系ブラウザ等でタップが
  // <button>へネイティブフォーカスしない場合があるため、onClickから直接呼ぶ)。
  function handleRowSelect(index: number) {
    setSelectedRowIndex(index);
    setScrollOffsetPx((current) =>
      computeScrollToRevealRow(index, current, INVENTORY_ROW_HEIGHT_PX, INVENTORY_HEADER_HEIGHT_PX, contentRes.h, rows.length),
    );
  }

  function handleRowFocus(index: number) {
    handleRowSelect(index);
    realFocusRowIndexRef.current = index;
  }

  function handleRowBlur() {
    realFocusRowIndexRef.current = null;
  }

  // ShopScreen.tsxと同じ理由: Arrow上下は一覧内で循環、Enter/Spaceは選択中個体のサルベージ
  // 確認を直接開く(preventDefaultしネイティブクリック合成との二重発火を防ぐ)。Tabはここでは
  // 一切介入しない(ロービングtabindexにより一覧のTabストップは常に1つのため、DOM順
  // (一覧→サルベージ→▲→▼)だけで自然に一覧外へ移動できる)。
  function handleRowKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        rowButtonRefs.current[wrapRowIndex(index, 1, rows.length)]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        rowButtonRefs.current[wrapRowIndex(index, -1, rows.length)]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        rowButtonRefs.current[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        rowButtonRefs.current[rows.length - 1]?.focus();
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const row = rows[index];
        if (row && row.kind === 'item' && row.item) openSalvageDialog(row);
        break;
      }
      default:
        break;
    }
  }

  function stepScroll(rowDelta: number) {
    setScrollOffsetPx((current) => clampScrollOffsetPx(current + rowDelta * INVENTORY_ROW_HEIGHT_PX, maxScrollOffsetPx));
  }

  function openSalvageDialog(row: InventoryRow) {
    clearLastError();
    setDialogRow(row);
    setIsSalvageDialogOpen(true);
  }

  function closeSalvageDialog() {
    setIsSalvageDialogOpen(false);
    setPendingSalvageButtonFocus(true);
  }

  function confirmSalvageAction() {
    if (!dialogRow?.item) return;
    salvage(dialogRow.item.itemId);
    pendingPostSalvageAdjustRef.current = true;
    setIsSalvageDialogOpen(false);
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
        <button
          ref={backButtonRef}
          type="button"
          onClick={() => setMode('garage')}
          className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold text-white"
        >
          ガレージへ戻る
        </button>
      </div>
      {!isSalvageDialogOpen && lastErrorJa && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{lastErrorJa}</p>}
      {!isSalvageDialogOpen && lastSalvageAmountG !== null && !lastErrorJa && (
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
              {/* stackable行(線材・ワニス)も含め全在庫行を常時マウントしてフォーカス可能にする。
                  可視範囲外でもDOMからunmountしない(以前はunmountしており、フォーカス追従の
                  スクロールが発火せずTabが末尾行の手前でブラウザchromeへ抜けていた=人間試遊
                  フィードバック項目3・6・8の真因)。行クリック/Enterは選択・サルベージ確認の
                  オープンのみを行う(人間確定仕様2026-07-23、以前は即座に確認ダイアログが開き
                  「何を選択したか分かりにくい」との指摘があった)。 */}
              {!isSalvageDialogOpen &&
                rows.map((row, index) => {
                  const rowTopCss = (INVENTORY_HEADER_HEIGHT_PX + index * INVENTORY_ROW_HEIGHT_PX - scrollOffsetPx) * scaleResult.scale;
                  const salvageable = row.kind === 'item' && !!row.item;
                  return (
                    <button
                      key={row.key}
                      ref={(el) => { rowButtonRefs.current[index] = el; }}
                      type="button"
                      tabIndex={index === selectedRowIndex ? 0 : -1}
                      aria-label={formatInventoryRowAriaLabel(row)}
                      aria-disabled={!salvageable}
                      onFocus={() => handleRowFocus(index)}
                      onBlur={handleRowBlur}
                      onKeyDown={(e) => handleRowKeyDown(e, index)}
                      onClick={() => handleRowSelect(index)}
                      className="absolute left-0 bg-transparent opacity-0 outline-none"
                      style={{ top: rowTopCss, width: rowWidthCss, height: rowHeightCss }}
                    />
                  );
                })}
            </div>
            {!isSalvageDialogOpen && (
              <div className="absolute bottom-2 left-2 flex gap-1">
                <button
                  ref={salvageButtonRef}
                  type="button"
                  disabled={!selectedSalvageable}
                  onClick={() => { if (selectedRow) openSalvageDialog(selectedRow); }}
                  aria-label={
                    !selectedRow
                      ? 'サルベージ対象がありません'
                      : selectedSalvageable
                        ? `${selectedRow.material.nameJa}をサルベージ`
                        : `${selectedRow.material.nameJa}はサルベージできません`
                  }
                  className="rounded bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  サルベージ
                </button>
                {/* 将来「詳細」ボタン等をここへ追加できるよう、同じflex行に並べる想定
                    (人間確定仕様2026-07-23、詳細機能自体は今回実装しない)。 */}
              </div>
            )}
            {!isSalvageDialogOpen && (
              <div className="absolute right-2 top-2 flex flex-col gap-1">
                <button
                  type="button"
                  aria-label="上へスクロール"
                  onClick={() => stepScroll(-1)}
                  disabled={scrollOffsetPx <= 0}
                  className="flex h-8 w-8 items-center justify-center rounded bg-slate-900/70 text-base font-bold text-white disabled:opacity-40"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label="下へスクロール"
                  onClick={() => stepScroll(1)}
                  disabled={scrollOffsetPx >= maxScrollOffsetPx}
                  className="flex h-8 w-8 items-center justify-center rounded bg-slate-900/70 text-base font-bold text-white disabled:opacity-40"
                >
                  ▼
                </button>
              </div>
            )}
            {isSalvageDialogOpen && dialogRow && (
              <dialog
                ref={salvageDialogRef}
                className="retro-dialog"
                aria-label={`${dialogRow.material.nameJa}のサルベージ確認`}
                style={{
                  left: (containerViewportRect?.left ?? 0) + scaleResult.offsetXPx + salvageDialogRect.xPx * scaleResult.scale,
                  top: (containerViewportRect?.top ?? 0) + scaleResult.offsetYPx + salvageDialogRect.yPx * scaleResult.scale,
                  width: salvageDialogRect.widthPx * scaleResult.scale,
                  height: salvageDialogRect.heightPx * scaleResult.scale,
                  // ::backdropの色の正本はPALETTE.N0のみ(src/index.cssのcolor-mixがこれを参照する)。
                  ['--retro-backdrop-color' as string]: PALETTE.N0,
                } as React.CSSProperties}
              >
                {/* 見た目専用。ShopScreen.tsxのcartCanvasRefと同じ理由でdialogの子canvasに描く。
                    pointer-events:none+aria-hidden=trueで操作ボタン層を一切遮らない。 */}
                <canvas
                  ref={salvageCanvasRef}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: salvageDialogRect.widthPx * scaleResult.scale,
                    height: salvageDialogRect.heightPx * scaleResult.scale,
                    imageRendering: 'pixelated',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
                {/* position:staticの要素はposition:absoluteの要素より常に背面になる(z-index未指定
                    でも同様)ため、position:relativeを明示してcanvasより確実に前面化する
                    (Suu_mot3コードレビュー指摘: この前提が崩れボタンが不可視になっていた)。 */}
                <div className="relative flex h-full flex-col justify-end gap-1 p-1" style={{ zIndex: 10 }}>
                  <div className="flex justify-end gap-2">
                    <button ref={cancelButtonRef} type="button" onClick={closeSalvageDialog} className="rounded bg-slate-300 px-3 py-1 text-xs font-bold text-slate-900">
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
              </dialog>
            )}
          </>
        )}
      </div>
    </div>
  );
}
