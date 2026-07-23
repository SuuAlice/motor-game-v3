# Phase 2 実装結果レポート(素材システム+店・在庫・サルベージUI)

作成日: 2026-07-23
担当: brabit_mot3(UI成果・本書統合)、alice_mot3(素材システム・写像・sweep・(d)(e)見積り、`docs/phase2-gate-status.md`要約を統合)
状態: **実装完了・人間試遊承認待ち**(Phase2完了とはまだ確定していない。本書末尾の試遊チェックリストによる人間承認を経てPhase2完了・Phase3着手可否を判断する)

本書は`docs/phase1-report.md`の構成に倣い、alice側(素材システム・写像層・sweep・(d)(e)見積り)とbrabit側(店・在庫・サルベージUI)双方の実装結果を統合したPhase2完了報告(試遊承認申請)である。`docs/phase2-gate-status.md`(alice_mot3作成、docs-only棚卸し)と、brabit_mot3からSuu_mot3への実装完了報告(2026-07-23、agmsg)を統合した。

---

## 1. 対象コミット(develop branch)

| commit | 内容 |
|---|---|
| `9fcc203` | docs: Phase 2素材システム実装計画を追加 |
| `b46c062`〜`28b142b` | `materials.ts`データ収録(9ファミリー) |
| `b025f72` | `assumedGeometry.ts`+massG差分方式 |
| `5b5c39b` | `gearEfficiency`設計較正値 |
| `ee6eff9` | 磁石設計較正値テーブル(anchor=フェライト) |
| `da65e04`・`3c51c9b`・`e97deae` | engine拡張(導線・電池ratio、Fableレビュー済み) |
| `c4d3580` | recipeCode MC3化 |
| `e4de702`・`e97deae` | `materialMapping.ts`へ導線・電池接続 |
| `a52a9b9` | `inventoryItem.ts`(個体状態・`computeSalvageRate`) |
| `c628ff3`・`4d053c2` | `materialSweep.ts`実装・Phase2ゲート提出 |
| `0425e54`・`4da126a` | (d)/(e)見積り文書・Fable判定・人間最終承認 |
| `323061e` | docs確定(UI計画v4・Fable全文・ゲート状況・`MaterialTier`誤記訂正) |
| `d0aa020` | **feat(ui): 店・在庫・サルベージ画面を実装 [brabit_mot3]** |

## 2. alice側成果物(素材システム・写像層、`docs/phase2-plan.md` §16移行順との対応)

| Step | 内容 | 状態 | 主なcommit |
|---|---|---|---|
| 1 | `materials.ts`データ収録(9ファミリー) | 完了 | `b46c062`・`28b142b` |
| 2 | `assumedGeometry.ts`+massG差分方式 | 完了 | `b025f72` |
| 3 | `gearEfficiency`設計較正値 | 完了 | `5b5c39b` |
| 4 | 磁石設計較正値テーブル(anchor=フェライト) | 完了 | `ee6eff9` |
| 5 | engine拡張(導線・電池ratio、Fableレビュー済み) | 完了 | `da65e04`・`3c51c9b`・`e97deae` |
| 6 | recipeCode MC3化 | 完了 | `c4d3580` |
| 7 | `materialMapping.ts`へ導線・電池接続 | 完了 | `e4de702`・`e97deae` |
| 8 | `inventoryItem.ts`(個体状態・`computeSalvageRate`) | 完了 | `a52a9b9` |
| 9 | `materialSweep.ts`実装・Phase2ゲート提出 | 完了 | `c628ff3`・`4d053c2` |
| 10 | (d)/(e)見積り文書・Fable判定・人間最終承認 | 完了 | `0425e54`・`4da126a` |

§4表で×/△と分類された5ファミリー(エナメル被膜・ブラシ・台紙・ガイドローラー・ボディ)がengine非接続なのは計画上の意図的な非目標(Phase3/4待ち、`docs/phase2-plan.md` §2・§4)であり、Phase2の未完了項目ではない。

## 3. Phase2ゲート「写像の物性検証sweep」結論(`docs/phase2-material-sweep-report.md` §8)

- 4ファミリー(導線・磁石・ギヤ・電池)全192組合せのNaN安全性を確認(健全性走査PASS)
- 写像パラメータレベルの単調性を導線・磁石・電池の3ファミリーで確認(PASS)
- 上位ティアの実在トレードオフを磁石・ギヤで確認、導線・電池はPhase2時点で意図的な暫定的上位互換であることを明記
- 破産防止minimum-tier構成の物理的完走可能性を確認(PASS)
- 電池容量ratioのengine実作用を単一変数比較で確認(PASS)
- 残り5ファミリー(coating・brush・substrate・roller・body)は`materialMapping.ts`未接続のcoverage gapとして明記(意図的、上記2節参照)
- 2件の実装上の障害(初期fixture不適合・coilTurnsクランプ漏れ)を発見から解決まで監査記録として保存

対象コード: `scripts/materialSweep.ts`・`tsconfig.material-sweep.json`・`package.json`(commit `c628ff3`、Suu_mot3コードレビュー済み)。`src/engine/`・`materialMapping.ts`・`materials.ts`は無変更。

## 4. Fable技術レビュー付帯条件3点(`docs/phase2-plan.md`承認時、2026-07-22)と反映状況

Phase2計画自体のFable承認に付帯した3条件。AGENTS.md/CLAUDE.mdの「レビュー条件・承認条件は要約せず全文中継する」に従い、`docs/phase2-plan.md` §22付録の原文を改変せず引用する。

> 【条件3点(承認に付帯)】
> 1. §15 sweep項目2の表現を修正すること。「上位ティアが単調に良い方向へ効く」ことの検証は、写像パラメータレベル(銀線→抵抗減、等)に限定する。総合性能の単調改善はspec §4.1(ピーキーさ設計・チタンは重い等)と矛盾するため検証項目にしてはならず、むしろ「上位ティアに実在のトレードオフが存在すること」(例: チタンギヤでJ増が観測される)を確認項目に加えること。
> 2. 案Bの負差分ガード(Q1)を実装・テストすること。
> 3. store層(個体ID・永続化)の所有はPhase 3計画時にbrabit・aliceと確定する。永続化は決定論(engine外の状態がシード再現を汚染しない構造)を保つこと。現時点で実装しないのは正しい。

反映状況:

1. → **反映済み**(3節のsweep結論に反映、`docs/phase2-material-sweep-report.md`)
2. → **反映済み**(`assumedGeometry.ts`、Step2)
3. → **Phase2 UI実装(6節)でこの境界を厳守**: `src/store/shopEconomy.ts`の仮経済はセッション内限定・非`localStorage`永続とし、`src/materials/inventoryItem.ts`の型は変更していない。本条件はPhase2 UI計画のFable技術レビュー(`docs/phase2-ui-shop-fable-review.md`)でも再確認され、「条件付きで適合する」との判定を受けている

## 5. 進角(d)・周回横方向拡張(e)の確定判定(Step10、`docs/phase2-plan.md` §18)

- **(d) 整流モデル進角拡張**: 現行の無誘導電気モデルではspec §9.2の特性シフトを原理的に再現できない(電機子インダクタンス導入が必要)という発見により大規模と判定され、**将来枠へ降格**することがFable技術判定として確定(2026-07-23人間承認済み)
- **(e) 車両層の周回・横方向拡張**: 「中〜大規模」の再評価を受け入れたうえで**採用が相当(降格しない)**、Phase5内で(e)-1(周回構造)・(e)-2(壁擦り+ローラー)の2独立ステップへ分割することがFable技術判定として確定
- いずれもspec.md/CLAUDE.md/AGENTS.mdへ状態追記済み(commit `0425e54`)

## 6. brabit側成果: 店・在庫・サルベージUI(commit `d0aa020`)

`docs/phase2-ui-shop-plan.md`(v4、Fable技術レビュー条件付き承認・必須修正A〜D反映、Suu_mot3最終レビュー合格、2026-07-23プロジェクトリード人間実装承認)に従い実装した。

### 6.1 画面構成

- 店(カタログ)画面・棚(在庫・サルベージ)画面をart-spec §5.4/§5.5準拠のレトロ低解像度Canvas(横480×270単層/縦270×480単層、整数拡大・nearest neighbor継承、Phase1承認済み解像度をそのまま使用)で新規実装
- ガレージ画面(`GarageMode.tsx`)から「カタログ(店)」「棚(在庫・サルベージ)」ボタンで遷移(`gameStore`の`mode`型へ`'shop'`/`'inventory'`を追加。`partialize`は変更せず、`mode`は引き続き非永続のまま)
- DOM操作要素はアクセシビリティ用フォーカス層に限定。Canvas描画(見た目)とDOM操作要素(キーボード操作・スクリーンリーダー用)を分離する構成とし、通常のTailwind DOM UIとしての新設は行っていない

### 6.2 カタログ(店)

- 9ファミリー全素材(全ティア)を閲覧可能。購入操作は現行`PlayerInventory`型が表現できる`wire`/`coating`/`magnet`/`gear`/`battery`/`brush`の6ファミリーに限定(Fable必須修正A)。`substrate`/`roller`/`body`の3ファミリーは「試遊版では閲覧のみ」と表示し、購入操作を出さない(独自のUI在庫型は新設していない)
- 9ファミリー識別の手続きドット描画(`src/retro/shop/materialIcons.ts`、`coating`のワニス容器輪郭を含む、実在製品のトレードドレスは模倣しない)。使用色は既存パレット(`src/retro/palette.ts`)のみ
- 物性抜粋は`VerifiedNumericValue`のみ数値表示し、`PendingNumericValue`(未検証)は数値を出さず「未検証」+単位のみ表示
- 価格は`priceProvisionalG`(仮値)をそのまま表示。購入単位は個体パーツ1個・線材1 m・ワニス1 mlで、単位を価格の横に明記

### 6.3 棚(在庫・サルベージ)

- 個体在庫(磁石・ギヤ・ブラシ・電池)+スタック在庫(線材・ワニス)を一覧表示。個体劣化は警告色・強調色・新規アイコンを使わず、日本語ラベル+数値+単位のみで表示(例: 「減磁度 12%」)
- 個体のみサルベージ操作可能、スタック在庫は閲覧専用としてフォーカス可能な行を用意

### 6.4 仮経済閉ループ(セッション内限定、非永続)

- `src/store/shopEconomy.ts`(Zustandに依存しない純関数)+`src/store/shopEconomyStore.ts`(Zustand hook、`persist`未使用)
- 初期所持金1000Gの固定フィクスチャから開始し、購入→在庫追加→サルベージ確認→回収額加算までが実際に動作する。ページreloadで常に初期フィクスチャへ戻る(`localStorage`呼び出し皆無、コード構造上の保証)
- サルベージ額は`max(1, Math.floor(price × rate))`(spec §5.4「どんな残骸でも0にはならない」底値保証、0G禁止)
- 暫定ID発行は`fixture-`/`session-`の名前空間分離+全family共通の単調カウンタ。family判定は常に`InventoryItem.family`から取得し、ID文字列は解析しない(Fable必須修正C)。削除後もカウンタは巻き戻らず、欠番IDは再利用しない
- `computeSalvageRate`が`ok:false`を返す場合はサルベージ確定を拒否し、状態を不変に保ち日本語エラーを表示(Fable必須修正D)
- 購入・サルベージの価格・残高・数量(スタック在庫の既存数量・ID発行カウンタを含む)を、状態遷移の前後すべてで有限かつ非負の整数として検証し、異常時はok:false・入力state不変(Suu_mot3コードレビュー指摘への対応)
- 残高不足時は購入確認ダイアログの確定ボタンを無効化し、Canvas・アクセシブルネーム双方に「所持金不足」を表示

## 7. 自動ゲート結果(2026-07-23、commit `d0aa020`時点)

- `npm run test`: **819 tests / 61 files 全pass**(Phase2 UI追加分72件を含む)
- `npm run build`: 成功(`tsc -b && vite build`)
- `npm run lint`(oxlint): エラーなし
- `npx vite-node scripts/checkPaletteUsage.ts`: RGB直値混入なし(`src/retro`・`src/retro-proto`対象)
- `git diff --cached --check`: 空白エラーなし
- 初回entry転送量(gzip): `index.html` 0.46KB + JS 203.30KB + CSS 5.42KB ≒ **約209KB**(1MB未満)。`dist`総量3.1MBのうち`dist/fonts`2.4MBはPixelMplusの遅延ロード分(店・棚画面初回マウント時のみFontFace APIで取得、初回entryには含まれない)

## 8. Playwright実機検証(2026-07-23、brabit_mot3実施)

横900×600・縦390×844の両方で実施(scratchpad内の隔離npmプロジェクトからPlaywrightを実行。本体`package.json`/lockfileは無変更)。

- 9ファミリー全行へキーボードフォーカスで到達(閲覧専用3ファミリーの末尾「段ボール」行まで確認)
- 残高不足(チタン1200G>初期所持金1000G)で確定ボタンが無効化され、Canvas・aria-label双方に「所持金不足」表示
- 購入フロー(アルミ線50G): ダイアログ表示→確定で正常動作、タイトル・メッセージ・ボタンが重ならず画面内に収まる
- サルベージ(フェライト): 回収率20%・回収額8G表示、キャンセルで状態不変、確定で在庫削除+残高加算
- Escapeキーでダイアログが閉じる、コンソールエラーなし
- reload時の初期化は、`shopEconomyStore`が`persist`未使用であることのコード保証+ユニットテストの決定性確認で担保(canvas描画の所持金表示はDOM `textContent`から読めないため、ブラウザ上でのテキストスクレイピングによる実測は行っていない)

検証中に発見・修正したバグ2件:
1. コンテナ要素が`scaleResult.fits`の真偽でサイズの異なるクラスへ切り替わり、「収まらない」表示用の小さいコンテナが content 高さに満たず永遠に収まらない自己再現ループ
2. 確認ダイアログのDOM操作要素がCanvasのレターボックスoffset(`offsetXPx`/`offsetYPx`)を加算しておらず、コンテナがcontent比率とずれる場合にボタンとCanvas描画枠がずれる不具合

## 9. 既知の制約・繰越事項

### 9.1 alice側(素材システム・写像層)の繰越事項

- **未接続5ファミリー**: エナメル被膜(coating)はengineに対応する連続パラメータが存在しない(`varnished?`は真偽値のみ)ため写像対象外。ブラシは新品特性・摩耗ともPhase2ではengine非写像とし、**Phase3で「ブラシパッケージ」として一括設計**(Fable Q5判定: 接触抵抗・チャタリング・摩耗が結合した一個のサブシステムであり、新品特性だけ先に写像すると接触品質実装時に再較正が発生するため)。台紙(substrate)はD01閾値・エッジ擦れ率がPhase3/4待ち。ガイドローラー(roller)は×(データのみ)で、写像可否は下記(e)の見積り結果に連動。ボディ(body)は放熱スケーラを今回除外し、D06/D08被害軽減はPhase3待ち
- **電池のトレードオフ**: 短絡・過放電による膨張→発煙→炎上(Phase3 D03/D04)、入手性によるトレードオフはPhase3完了まで未実装(意図的な暫定状態)。経済結線(実賞金・実価格バランス)はPhase5
- **導線の張力**: spec §4.2「軟らかさ→張力許容幅」の写像先である「張力」自体が、Phase4の巻線記録方式(spec §9.1「各ターンを`{位置,腕,方向,張力}`として保存」・§9.2「張力(速さ・リズムのムラ)→巻きの緩み/被膜ダメージ」)で導入される概念のため、Phase2時点では対応する連続パラメータを持たずPhase4待ち
- **ギヤのJ/D06**: Phase2で写像済みなのは`gearEfficiency`(設計較正値)のみで、spec §4.2「チタンは砕けない代わりに重い(J増で加速鈍化)」に対応するギヤ質量・慣性J増側の接続は未実装のまま残っている。歯欠け閾値(D06)もPhase3待ちであり、ギヤ質量/J増の接続はD06とセットでPhase3計画時に判断するオープン項目とする
- **store層(個体ID・永続化)の所有**: Phase3計画時にbrabit・aliceで確定する(Fable付帯条件3、4節)。永続化は決定論(engine外の状態がシード再現を汚染しない構造)を保つ制約下で設計する
- **(e) 周回・横方向拡張**: Phase5内で(e)-1(周回構造)・(e)-2(壁擦り+ローラー)の2独立ステップへ分割し(5節)、各実装は個別計画・Suu/Fable/人間承認を要する
- **(d) 進角拡張**: 将来枠へ降格(5節)。Phase4の巻線記録の溝掘りジェスチャーは、spec §9.2の既定フォールバックどおり「接触品質(チャタリング・D05)のみ」へ接続して実装する(工作要素としての溝掘り自体は失われない)。将来(d)を実装する場合は、電機子インダクタンス導入と`recipeCode`の新版数`MC4-`新設を一体パッケージとして再見積りする(`docs/phase2-step10-advance-angle-estimate.md`)
- **ガイドローラーの写像**: 上記のとおり(e)車両層拡張の見積り結果に連動しており、(e)採用確定(5節)を受けてPhase5内で写像可否を判断する

### 9.2 brabit側(UI)の繰越事項

- `substrate`/`roller`/`body`の3ファミリーは閲覧専用(購入・在庫化なし)。購入対応には`src/materials/`の型拡張が必要なため今回のスコープ外(必要になった場合はaliceとの別計画・承認へ)
- 仮経済はセッション内限定・非永続(reloadで固定フィクスチャへ初期化)。Phase5の最終経済結線(実賞金・実サルベージ額・実価格バランス)とは分離
- 個体ID発行方式(`fixture-`/`session-`)はPhase2試遊専用の暫定方式。Phase3で確定する本物の永続ID方式を先取りしない
- ガレージ本体(art-spec §5.4の一枚絵ハブ)自体のレトロCanvas化は未着手のまま。店・棚画面のみが先行してCanvas化され、`GarageMode.tsx`からの遷移ボタンで暫定接続している
- component単位のDOM操作テストは本リポジトリに`@testing-library`等が未導入のため自動化しておらず、Playwright手動実行で代替した(vitestは純関数側`shopEconomy.ts`・`formatMaterial.ts`・`layout.ts`等のみ自動化)
- `docs/phase2-plan.md` §9・§17の`MaterialTier`型表記不一致は訂正済み(commit `323061e`、4.3節相当。ティアは各素材ファミリー固有のID型の`tierIndex`+`family`で表現)

## 10. 人間試遊チェックリスト

以下を実際にブラウザで操作して確認してください(`npm run dev`起動後、表示されたURLを開く)。

1. **起動**: `npm run dev`でローカルサーバーを起動し、ブラウザで開く。タイトル画面が表示されること
2. **横画面・縦画面**: ウィンドウ幅を横長・縦長それぞれにしてガレージ→カタログ(店)・棚(在庫・サルベージ)を開き、Canvas表示が画面内に収まること(「収まりません」表示が出ないこと)
3. **9ファミリー閲覧**: カタログ画面で導線・被膜・磁石・ギヤ・電池・ブラシ・台紙・ガイドローラー・ボディの9ファミリーすべてが表示され、台紙・ガイドローラー・ボディには「試遊版では閲覧のみ」と表示されること
4. **6ファミリー購入**: 導線・被膜・磁石・ギヤ・電池・ブラシのいずれかを選び、購入確認ダイアログ→確定で所持金が減り在庫が増えること
5. **残高不足**: 所持金を上回る素材(例: チタンギヤ1200G)を選ぶと、確定ボタンが押せず「所持金が不足しています」と表示されること
6. **在庫**: 棚画面で購入した素材・初期フィクスチャの在庫(個体・スタック双方)が表示されること
7. **サルベージ取消/確定**: 個体をサルベージ選択→確認ダイアログでキャンセルすると状態が変わらないこと。再度選択→確定すると在庫から消え所持金が増えること(回収額が最低1G以上であること)
8. **キーボード操作**: マウスを使わず、Tabキーだけでカタログ・棚画面のすべての行(閲覧専用・スタック在庫を含む)へ到達でき、Enter/Spaceで操作でき、Escapeで確認ダイアログを閉じられること
9. **reload初期化**: 購入・サルベージを行った後にページを再読み込みし、所持金・在庫が初期状態(所持金1000G、初期フィクスチャ)へ戻ること
