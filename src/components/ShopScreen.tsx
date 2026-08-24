// 店(ショップ)画面。docs/phase2-ui-shop-plan.md v4・docs/phase2-ui-shop-fable-review.md
// 条件付き承認に従う: Canvas描画(見た目)はart-spec準拠のレトロ低解像度Canvas、DOM要素は
// アクセシビリティ用の操作要素・フォーカス層に限定する(v4 §10)。購入可能なのは
// PURCHASABLE_FAMILIESの6ファミリーのみ(Fable必須修正A)。
//
// ショッピングカート方式(人間確定仕様2026-07-23、計画v6): 行のクリック/タップ/Arrow/Home/Endは
// 選択のみ。選択中の素材はselectedRowIndexで永続的に保持し、Canvas灰色ハイライトはこれ1つだけを
// 表示する(黄色DOM outlineは使わない)。購入は「カートへ追加」→カート内訳オーバーレイでの
// 「まとめて購入」の二段階とし、単発の購入確認ダイアログは廃止した。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRetroCanvasFrame } from './useRetroCanvasFrame';
import { useRetroDialog } from './useRetroDialog';
import { useElementViewportRect } from './useElementViewportRect';
import { loadPixelFonts } from '../retro/text/pixelFonts';
import { PALETTE } from '../retro/palette';
import { applyDirectCanvasBackingSize } from '../retro/canvas/directCanvas';
import { drawCatalogScreen } from '../retro/shop/drawCatalog';
import { drawCartOverlay } from '../retro/shop/drawCart';
import {
  clampScrollOffsetPx,
  computeDialogRect,
  computeMaxScrollOffsetPx,
  computeRowLayout,
  computeScrollToRevealRow,
  wrapRowIndex,
} from '../retro/shop/layout';
import { CART_FOOTER_HEIGHT_PX, CART_HEADER_HEIGHT_PX, CART_ROW_HEIGHT_PX, CATALOG_HEADER_HEIGHT_PX, CATALOG_ROW_HEIGHT_PX } from '../retro/shop/constants';
import { formatCatalogRowAriaLabel } from '../retro/shop/formatMaterial';
import { ALL_MATERIALS, type MaterialId } from '../materials/materials';
import { canAffordCartPurchase, computeCartTotalG, isPurchasableFamily, MAX_CART_LINE_QUANTITY, type CartLine } from '../store/shopEconomy';
import { useShopEconomyStore } from '../store/shopEconomyStore';
import { useGameStore } from '../store/gameStore';
import { InstrumentShopPanel } from './InstrumentShopPanel';

export function ShopScreen() {
  const setMode = useGameStore((s) => s.setMode);
  const economy = useShopEconomyStore((s) => s.state);
  const lastErrorJa = useShopEconomyStore((s) => s.lastErrorJa);
  const purchaseCartAction = useShopEconomyStore((s) => s.purchaseCart);
  const clearLastError = useShopEconomyStore((s) => s.clearLastError);

  const { containerRef, canvasRef, contentRes, scaleResult } = useRetroCanvasFrame();
  const [fontStatus, setFontStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  // 購入対象として選択中の行(常に値を持つ、Tabで一覧外へ出ても保持する=人間確定仕様2026-07-23)。
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [scrollOffsetPx, setScrollOffsetPx] = useState(0);
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [isCartOverlayOpen, setIsCartOverlayOpen] = useState(false);
  const [cartScrollOffsetPx, setCartScrollOffsetPx] = useState(0);

  const backButtonRef = useRef<HTMLButtonElement>(null);
  const addToCartButtonRef = useRef<HTMLButtonElement>(null);
  const openCartButtonRef = useRef<HTMLButtonElement>(null);
  const cartCloseButtonRef = useRef<HTMLButtonElement>(null);
  // カート内訳の見た目専用のdialog内Canvas(Suu_mot3コードレビュー指摘: native dialogの
  // top layer構成は「dialog→::backdrop→通常コンテンツ」の順のため、通常canvasへ描くと
  // ::backdropの遮光がカート内訳自体にもかかってしまう。dialogの子として別canvasを置き、
  // 同じtop layerで合成させることで::backdropの影響を受けないようにする)。
  const cartCanvasRef = useRef<HTMLCanvasElement>(null);
  const rowButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const cartRowFirstButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // 実キーボードフォーカス位置(再描画不要、選択状態のselectedRowIndexとは別物として追跡)。
  // ホイール等で当該行が可視範囲外に出た場合に不可視フォーカスを残さないための安全策専用。
  const realFocusRowIndexRef = useRef<number | null>(null);
  // オーバーレイを閉じた直後に「カートを見る」へフォーカスを戻すための予約フラグ(Suu_mot3
  // コードレビュー指摘: setState直後はまだ再mount前でref.currentがnullのため、useEffectで
  // 実際にmountされた後にfocusする必要がある)。
  const [pendingOpenCartButtonFocus, setPendingOpenCartButtonFocus] = useState(false);
  // カート行削除後、繰り上がった行(または末尾/閉じるボタン)へフォーカスを移すための予約index。
  // nullは「予約なし」、-1は「閉じるボタンへ」を意味する。
  const pendingCartFocusIndexRef = useRef<number | null>(null);

  // native <dialog>+showModal()でカート内訳を真のモーダルにする(人間確定仕様2026-07-23、
  // Suu_mot3コードレビュー指摘: 自前backdrop/focusinガードでは背面(戻るボタン等)の
  // pointer操作を防げなかった)。ブラウザのinert機構により背面は自動的に操作不能になり、
  // Tab/Shift+Tabもオーバーレイ内に閉じ込められるため、手製のTabトラップは不要になる。
  const cartDialogRef = useRetroDialog({ open: isCartOverlayOpen, onClose: closeCartOverlay });
  // dialogはtop layerへ昇格するため、containerRef相対のposition:absoluteでは位置がずれ得る
  // (Suu_mot3コードレビュー指摘)。position:fixedのままcontainerRefの実際のviewport座標を
  // 都度計測し、そこからオフセットする。
  const containerViewportRect = useElementViewportRect(containerRef, isCartOverlayOpen);

  useEffect(() => {
    loadPixelFonts().then((result) => setFontStatus(result.ok ? 'ok' : 'error'));
  }, []);

  const selectedMaterial = ALL_MATERIALS[selectedRowIndex] ?? ALL_MATERIALS[0];
  const selectedMaterialCartQuantity = cartLines.find((l) => l.materialId === selectedMaterial.id)?.quantity ?? 0;
  const cartTotalResult = computeCartTotalG(cartLines);
  const cartOverlayRect = computeDialogRect(contentRes.w, contentRes.h, Math.max(0, contentRes.w - 16), Math.max(0, contentRes.h - 16));
  const cartRowsAreaBottomPx = Math.max(CART_HEADER_HEIGHT_PX, cartOverlayRect.heightPx - CART_FOOTER_HEIGHT_PX);
  const cartLineCount = cartTotalResult.ok ? cartTotalResult.lines.length : 0;
  const maxCartScrollOffsetPx = computeMaxScrollOffsetPx(cartLineCount, CART_ROW_HEIGHT_PX, CART_HEADER_HEIGHT_PX, cartRowsAreaBottomPx);

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
      focusedIndex: selectedRowIndex,
      cashG: economy.cashG,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRes.w, contentRes.h, scaleResult.fits, scrollOffsetPx, selectedRowIndex, economy.cashG, fontStatus]);

  // カート内訳の見た目はdialog内専用canvasへ描く(上記の理由でtop layerに置くため)。
  // backing storeは整数論理解像度(content px)のみとし、CSS表示寸法だけにscaleResult.scale
  // (整数)を適用する。二重scale・ぼけを避けるため、backing sizeとCSS寸法の管理元を分離する
  // 既存directCanvas.tsの規律をここでも踏襲する。
  useEffect(() => {
    if (!isCartOverlayOpen) return;
    const canvas = cartCanvasRef.current;
    if (!canvas) return;
    applyDirectCanvasBackingSize(canvas, cartOverlayRect.widthPx, cartOverlayRect.heightPx);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawCartOverlay(ctx, {
      rect: { xPx: 0, yPx: 0, widthPx: cartOverlayRect.widthPx, heightPx: cartOverlayRect.heightPx },
      lines: cartTotalResult.ok ? cartTotalResult.lines : [],
      scrollOffsetPx: cartScrollOffsetPx,
      totalG: cartTotalResult.ok ? cartTotalResult.totalG : null,
      cashG: economy.cashG,
      errorJa: lastErrorJa ?? (cartTotalResult.ok ? null : cartTotalResult.reason),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCartOverlayOpen, cartOverlayRect.widthPx, cartOverlayRect.heightPx, cartScrollOffsetPx, cartLines, economy.cashG, lastErrorJa, fontStatus]);

  // カート内訳オーバーレイを開いた直後、明確な先頭操作(閉じるボタン)へフォーカスする
  // (人間確定仕様2026-07-23、補足条件b)。useLayoutEffectでペイント前に完了させ、
  // 未フォーカスのまま一瞬でも描画されないようにする(Suu_mot3コードレビュー指摘)。
  useLayoutEffect(() => {
    if (isCartOverlayOpen) cartCloseButtonRef.current?.focus();
  }, [isCartOverlayOpen]);

  // オーバーレイを閉じた後、「カートを見る」ボタンが実際に再mountされてからフォーカスする
  // (Suu_mot3コードレビュー指摘: closeCartOverlay内でsetState直後にref.currentへ触れても
  // まだ旧DOMのままでnull、フォーカス復帰が保証されない)。
  useEffect(() => {
    if (!isCartOverlayOpen && pendingOpenCartButtonFocus) {
      openCartButtonRef.current?.focus();
      setPendingOpenCartButtonFocus(false);
    }
  }, [isCartOverlayOpen, pendingOpenCartButtonFocus]);

  // カート行の削除(数量1での−、または削除ボタン)後、繰り上がった行の−ボタン、
  // なければ「閉じる」ボタンへフォーカスを移す(Suu_mot3コードレビュー指摘: 削除された行が
  // フォーカスを持ったままunmountされるとactiveElementがbodyへ落ち、以後のTabがオーバーレイの
  // フォーカストラップへ届かなくなる)。cartLines変更後(再mount後)に実行する。
  useEffect(() => {
    const pendingIndex = pendingCartFocusIndexRef.current;
    if (pendingIndex === null) return;
    pendingCartFocusIndexRef.current = null;
    if (cartLineCount === 0) {
      cartCloseButtonRef.current?.focus();
      return;
    }
    const targetIndex = Math.min(pendingIndex, cartLineCount - 1);
    cartRowFirstButtonRefs.current[targetIndex]?.focus();
  }, [cartLines, cartLineCount]);

  // カート行数が減ってスクロール可能量が縮んだ際、現在のオフセットが新しい上限を超えたままだと
  // 末尾が空白表示になり得るため、上限変更のたびに再クランプする(Suu_mot3コードレビュー指摘)。
  useEffect(() => {
    setCartScrollOffsetPx((current) => clampScrollOffsetPx(current, maxCartScrollOffsetPx));
  }, [maxCartScrollOffsetPx]);

  const maxScrollOffsetPx = computeMaxScrollOffsetPx(ALL_MATERIALS.length, CATALOG_ROW_HEIGHT_PX, CATALOG_HEADER_HEIGHT_PX, contentRes.h);

  // ホイールでのスクロールを必須化(人間試遊フィードバック項目8)。Reactのwheelは既定でpassive
  // 登録されpreventDefault()が効かないため、ネイティブaddEventListenerで{passive:false}にする。
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

  // カート内訳オーバーレイ自身のホイールスクロール(開いている間だけ)。
  useEffect(() => {
    if (!isCartOverlayOpen) return;
    const el = cartDialogRef.current;
    if (!el) return;
    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      setCartScrollOffsetPx((current) => clampScrollOffsetPx(current + e.deltaY, maxCartScrollOffsetPx));
    };
    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', handleWheelNative);
  }, [isCartOverlayOpen, maxCartScrollOffsetPx, cartDialogRef]);

  // ホイール等でスクロールした結果、実フォーカス中の行が可視範囲外に出た場合、不可視のまま
  // フォーカスを残さない(人間確定仕様2026-07-23)。selectedRowIndex(選択の記憶)には触れず、
  // 実DOMフォーカスだけを安全な状態(blur)へ戻す。
  useEffect(() => {
    const index = realFocusRowIndexRef.current;
    if (index === null) return;
    const rows = computeRowLayout(ALL_MATERIALS.length, CATALOG_ROW_HEIGHT_PX, CATALOG_HEADER_HEIGHT_PX, contentRes.h, scrollOffsetPx);
    if (rows[index]?.visible) return;
    (document.activeElement as HTMLElement | null)?.blur();
    realFocusRowIndexRef.current = null;
  }, [scrollOffsetPx, contentRes.h]);

  // 選択の確定(selectedRowIndex更新+可視範囲へのスクロール追従)のみを行う。onClickから直接
  // 呼ぶ(Suu_mot3コードレビュー指摘: iOS系ブラウザ等はタップで<button>へネイティブフォーカス
  // しない場合があり、onFocusだけに依存すると「タップ=選択」が成立しない機種がある)。
  // realFocusRowIndexRefには触れない: ここを触ると、実フォーカスを伴わないclickでも
  // 「この行が実フォーカス中」という誤情報が残り、後続のスクロールで無関係な要素
  // (▲▼ボタン等、実際にフォーカスしているもの)を誤ってblurしてしまう(Suu_mot3コードレビュー
  // 再指摘)。
  function handleRowSelect(index: number) {
    setSelectedRowIndex(index);
    setScrollOffsetPx((current) =>
      computeScrollToRevealRow(index, current, CATALOG_ROW_HEIGHT_PX, CATALOG_HEADER_HEIGHT_PX, contentRes.h, ALL_MATERIALS.length),
    );
  }

  // 実DOMフォーカス(onFocusイベント)専用。選択の確定に加えてrealFocusRowIndexRefも更新する。
  function handleRowFocus(index: number) {
    handleRowSelect(index);
    realFocusRowIndexRef.current = index;
  }

  function handleRowBlur() {
    realFocusRowIndexRef.current = null;
  }

  // Arrow上下は一覧内で循環(人間確定仕様)。Enter/Spaceは選択中の素材をカートへ追加する
  // (ネイティブのクリック合成と二重発火しないようpreventDefaultする、補足条件8)。Tabは
  // ここでは一切介入しない(ロービングtabindexにより一覧のTabストップは常に1つのため、
  // DOM順(一覧→カートへ追加→カートを見る→▲→▼)だけで自然に一覧外へ移動できる)。
  function handleRowKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        rowButtonRefs.current[wrapRowIndex(index, 1, ALL_MATERIALS.length)]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        rowButtonRefs.current[wrapRowIndex(index, -1, ALL_MATERIALS.length)]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        rowButtonRefs.current[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        rowButtonRefs.current[ALL_MATERIALS.length - 1]?.focus();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        addToCart(ALL_MATERIALS[index].id as MaterialId);
        break;
      default:
        break;
    }
  }

  function stepScroll(rowDelta: number) {
    setScrollOffsetPx((current) => clampScrollOffsetPx(current + rowDelta * CATALOG_ROW_HEIGHT_PX, maxScrollOffsetPx));
  }

  function addToCart(materialId: MaterialId) {
    const material = ALL_MATERIALS.find((m) => m.id === materialId);
    if (!material || !isPurchasableFamily(material.family)) return;
    setCartLines((current) => {
      const index = current.findIndex((l) => l.materialId === materialId);
      if (index < 0) return [...current, { materialId, quantity: 1 }];
      const existing = current[index];
      if (existing.quantity >= MAX_CART_LINE_QUANTITY) return current;
      return current.map((l, i) => (i === index ? { ...l, quantity: l.quantity + 1 } : l));
    });
  }

  function incrementCartLine(materialId: MaterialId) {
    setCartLines((current) =>
      current.map((l) => (l.materialId === materialId && l.quantity < MAX_CART_LINE_QUANTITY ? { ...l, quantity: l.quantity + 1 } : l)),
    );
  }

  function decrementCartLine(materialId: MaterialId, rowIndex: number) {
    setCartLines((current) =>
      current.flatMap((l) => {
        if (l.materialId !== materialId) return [l];
        if (l.quantity <= 1) {
          pendingCartFocusIndexRef.current = rowIndex;
          return [];
        }
        return [{ ...l, quantity: l.quantity - 1 }];
      }),
    );
  }

  function removeCartLine(materialId: MaterialId, rowIndex: number) {
    pendingCartFocusIndexRef.current = rowIndex;
    setCartLines((current) => current.filter((l) => l.materialId !== materialId));
  }

  function revealCartRow(index: number) {
    setCartScrollOffsetPx((current) => computeScrollToRevealRow(index, current, CART_ROW_HEIGHT_PX, CART_HEADER_HEIGHT_PX, cartRowsAreaBottomPx, cartLineCount));
  }

  function stepCartScroll(rowDelta: number) {
    setCartScrollOffsetPx((current) => clampScrollOffsetPx(current + rowDelta * CART_ROW_HEIGHT_PX, maxCartScrollOffsetPx));
  }

  function openCartOverlay() {
    clearLastError();
    setCartScrollOffsetPx(0);
    setIsCartOverlayOpen(true);
  }

  function closeCartOverlay() {
    setIsCartOverlayOpen(false);
    setPendingOpenCartButtonFocus(true);
  }

  function confirmCartPurchase() {
    const succeeded = purchaseCartAction(cartLines);
    if (succeeded) {
      setCartLines([]);
      closeCartOverlay();
    }
  }

  const rowWidthCss = scaleResult.contentWidthPx;
  const rowHeightCss = CATALOG_ROW_HEIGHT_PX * scaleResult.scale;
  const cartConfirmDisabled = !cartTotalResult.ok || !canAffordCartPurchase(economy.cashG, cartTotalResult.totalG);

  // containerRefの要素は常に同一サイズのクラスで描画する。fits判定に応じてサイズ自体を
  // 変えると、「収まらない」表示用の小さいコンテナがResizeObserverの再測定でも
  // 永遠に収まらないままになる循環(実機検証で発見)を避けるため。
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-900">カタログ(店)</h2>
        <button
          ref={backButtonRef}
          type="button"
          onClick={() => setMode('garage')}
          className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-bold text-white"
        >
          ガレージへ戻る
        </button>
      </div>
      {!isCartOverlayOpen && lastErrorJa && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{lastErrorJa}</p>}
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
              {/* 9ファミリー全行を常時マウントしてフォーカス可能にする(購入不可の3ファミリーも
                  aria-labelで「試遊版では閲覧のみ」と示すのみで、フォーカス自体は必ず通す)。
                  可視範囲外でもDOMからunmountしない(以前はunmountしており、フォーカス追従の
                  スクロールが発火せずTabが末尾行の手前でブラウザchromeへ抜けていた=人間試遊
                  フィードバック項目3・6・8の真因)。可視外はcanvas位置で親のoverflow-hiddenに
                  よって視覚的にのみクリップされる。行クリック/Enterは選択・カート追加のみを行い、
                  即時購入はしない(人間確定仕様2026-07-23)。 */}
              {!isCartOverlayOpen &&
                ALL_MATERIALS.map((material, index) => {
                  const rowTopCss = (CATALOG_HEADER_HEIGHT_PX + index * CATALOG_ROW_HEIGHT_PX - scrollOffsetPx) * scaleResult.scale;
                  const purchasable = isPurchasableFamily(material.family);
                  return (
                    <button
                      key={material.id}
                      ref={(el) => { rowButtonRefs.current[index] = el; }}
                      type="button"
                      tabIndex={index === selectedRowIndex ? 0 : -1}
                      aria-label={formatCatalogRowAriaLabel(material)}
                      aria-disabled={!purchasable}
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
            {!isCartOverlayOpen && (
              <div className="absolute bottom-2 left-2 flex gap-1">
                <button
                  ref={addToCartButtonRef}
                  type="button"
                  disabled={!isPurchasableFamily(selectedMaterial.family) || selectedMaterialCartQuantity >= MAX_CART_LINE_QUANTITY}
                  onClick={() => addToCart(selectedMaterial.id as MaterialId)}
                  aria-label={
                    !isPurchasableFamily(selectedMaterial.family)
                      ? `${selectedMaterial.nameJa}は試遊版では閲覧のみのためカートへ追加できません`
                      : selectedMaterialCartQuantity >= MAX_CART_LINE_QUANTITY
                        ? `${selectedMaterial.nameJa}は数量上限(${MAX_CART_LINE_QUANTITY})のためこれ以上追加できません`
                        : `${selectedMaterial.nameJa}をカートへ追加`
                  }
                  className="rounded bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  カートへ追加
                </button>
                <button
                  ref={openCartButtonRef}
                  type="button"
                  onClick={openCartOverlay}
                  aria-label={`カートを見る(${cartLines.length}種類)、まとめて購入`}
                  className="rounded bg-slate-700 px-3 py-2 text-xs font-bold text-white"
                >
                  カート({cartLines.length})
                </button>
              </div>
            )}
            {!isCartOverlayOpen && (
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
            {isCartOverlayOpen && (
              <dialog
                ref={cartDialogRef}
                className="retro-dialog"
                aria-label="カート内訳"
                style={{
                  left: (containerViewportRect?.left ?? 0) + scaleResult.offsetXPx + cartOverlayRect.xPx * scaleResult.scale,
                  top: (containerViewportRect?.top ?? 0) + scaleResult.offsetYPx + cartOverlayRect.yPx * scaleResult.scale,
                  width: cartOverlayRect.widthPx * scaleResult.scale,
                  height: cartOverlayRect.heightPx * scaleResult.scale,
                  // ::backdropの色の正本はPALETTE.N0のみ(src/index.cssのcolor-mixがこれを参照する)。
                  ['--retro-backdrop-color' as string]: PALETTE.N0,
                } as React.CSSProperties}
              >
                {/* 見た目専用。::backdropより前面(dialogの子=top layer)に置くことで暗くならない。
                    pointer-events:none+aria-hidden=trueとし、操作ボタン層を一切遮らない
                    (Suu_mot3コードレビュー指摘の追補条件)。 */}
                <canvas
                  ref={cartCanvasRef}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: cartOverlayRect.widthPx * scaleResult.scale,
                    height: cartOverlayRect.heightPx * scaleResult.scale,
                    imageRendering: 'pixelated',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
                {/* DOM順(position:staticの要素はposition:absoluteの要素より常に背面になる、
                    z-index未指定でも同様)に依存せず、canvasより確実に前面化する(Suu_mot3
                    コードレビュー指摘: InventoryScreen側でこの前提が崩れボタンが不可視になった)。 */}
                <div
                  className="absolute overflow-hidden"
                  style={{
                    left: 0,
                    top: CART_HEADER_HEIGHT_PX * scaleResult.scale,
                    width: cartOverlayRect.widthPx * scaleResult.scale,
                    height: Math.max(0, cartRowsAreaBottomPx - CART_HEADER_HEIGHT_PX) * scaleResult.scale,
                    zIndex: 10,
                  }}
                >
                  {cartTotalResult.ok &&
                    cartTotalResult.lines.map((line, index) => {
                      const rowTopCss = (index * CART_ROW_HEIGHT_PX - cartScrollOffsetPx) * scaleResult.scale;
                      const material = ALL_MATERIALS.find((m) => m.id === line.materialId);
                      const nameJa = material?.nameJa ?? line.materialId;
                      const atMax = line.quantity >= MAX_CART_LINE_QUANTITY;
                      return (
                        <div key={line.materialId} className="absolute right-1 flex items-center gap-1" style={{ top: rowTopCss, height: CART_ROW_HEIGHT_PX * scaleResult.scale }}>
                          <button
                            ref={(el) => { cartRowFirstButtonRefs.current[index] = el; }}
                            type="button"
                            aria-label={`${nameJa}を1減らす`}
                            onFocus={() => revealCartRow(index)}
                            onClick={() => decrementCartLine(line.materialId, index)}
                            className="flex h-6 w-6 items-center justify-center rounded bg-slate-700 text-xs font-bold text-white"
                          >
                            −
                          </button>
                          <button
                            type="button"
                            disabled={atMax}
                            aria-label={atMax ? `${nameJa}は数量上限(${MAX_CART_LINE_QUANTITY})のためこれ以上増やせません` : `${nameJa}を1増やす`}
                            onFocus={() => revealCartRow(index)}
                            onClick={() => incrementCartLine(line.materialId)}
                            className="flex h-6 w-6 items-center justify-center rounded bg-slate-700 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-500"
                          >
                            ＋
                          </button>
                          <button
                            type="button"
                            aria-label={`${nameJa}をカートから削除`}
                            onFocus={() => revealCartRow(index)}
                            onClick={() => removeCartLine(line.materialId, index)}
                            className="flex h-6 items-center justify-center rounded bg-red-800 px-1 text-xs font-bold text-white"
                          >
                            削除
                          </button>
                        </div>
                      );
                    })}
                </div>
                {/* カートスクロール▲▼は行操作列(−/＋/削除、右端に固定)とは別の水平帯である
                    フッターの左側に配置する(人間報告: 以前は右上で行操作列と重なっていた)。 */}
                <div
                  className="absolute flex items-center justify-between px-2"
                  style={{
                    left: 0,
                    top: cartRowsAreaBottomPx * scaleResult.scale,
                    width: cartOverlayRect.widthPx * scaleResult.scale,
                    height: (cartOverlayRect.heightPx - cartRowsAreaBottomPx) * scaleResult.scale,
                    zIndex: 10,
                  }}
                >
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label="カート一覧を上へスクロール"
                      onClick={() => stepCartScroll(-1)}
                      disabled={cartLineCount === 0 || cartScrollOffsetPx <= 0}
                      className="flex h-6 w-6 items-center justify-center rounded bg-slate-700 text-xs font-bold text-white disabled:opacity-40"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label="カート一覧を下へスクロール"
                      onClick={() => stepCartScroll(1)}
                      disabled={cartLineCount === 0 || cartScrollOffsetPx >= maxCartScrollOffsetPx}
                      className="flex h-6 w-6 items-center justify-center rounded bg-slate-700 text-xs font-bold text-white disabled:opacity-40"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      ref={cartCloseButtonRef}
                      type="button"
                      onClick={closeCartOverlay}
                      className="rounded bg-slate-300 px-3 py-1 text-xs font-bold text-slate-900"
                    >
                      閉じる
                    </button>
                    <button
                      type="button"
                      onClick={confirmCartPurchase}
                      disabled={cartConfirmDisabled}
                      aria-label={cartConfirmDisabled ? 'まとめて購入(確定できません)' : 'まとめて購入'}
                      className="rounded bg-amber-600 px-3 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      まとめて購入
                    </button>
                  </div>
                </div>
              </dialog>
            )}
          </>
        )}
      </div>
      <InstrumentShopPanel />
    </div>
  );
}
