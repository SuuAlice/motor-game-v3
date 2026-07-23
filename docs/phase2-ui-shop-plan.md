# Phase 2 UI実装前計画: 店・インベントリ・素材カタログ・サルベージUI

作成日: 2026-07-23
担当: brabit_mot3(UI/描画/音)
状態: **実装前計画v4・Fable技術レビュー条件付き承認(必須修正A〜D反映済み)・Suu_mot3確認待ち・人間実装承認前**
実費見込み: 0 USD

本書は単独で作業を再開できる水準で書く。まだ実装・編集・commitは行っていない(検証目的の一時編集も行っていない)。根拠: `docs/art-spec.md` §5.1・§5.4・§5.5、`docs/spec.md` §4・§5・§5.4・§12、`docs/phase2-plan.md` §2・§12・§17、現行`src/materials/`公開API(`materials.ts`・`materialMapping.ts`・`inventoryItem.ts`)、`docs/phase2-ui-shop-fable-review.md`(v3へのFable技術レビュー全文)。作成経緯: 2026-07-23、Suu_mot3からのPhase2ゲート棚卸し依頼への回答(brabit担当範囲は進捗0%)を受け、Suu_mot3より本計画の起票のみ承認された。v1〜v3はSuu_mot3の事前レビューを経てFableへ全文提出、Fableは**条件付き承認**(必須修正A〜D、趣旨を変えなければ再レビュー不要)を回答した。本v4は必須修正A〜D・推奨事項・Suu追加確定事項をすべて反映する。

v1からの変更点(Suu_mot3 v1レビュー、v2で反映。13点、詳細は本ファイルのgit差分参照): 案B確定・仮経済閉ループ化・決定的ID方式・サルベージ確定処理・未解禁ロック廃止・手続きドット描画・pending値表示・劣化表示方針・導線構造(mode拡張)・テスト具体化・ファイル一覧具体化・Fable確認事項整理・MaterialTier表記対応。

v2からの変更点(Suu_mot3 v2レビュー、v3で反映。3点): Canvas内部解像度確定(横480×270単層/縦270×480単層、整数拡大・nearest継承)・通貨G整数化とサルベージ額`Math.floor`切り捨て・購入単位明記・劣化表示とドット描画意匠の確定。Fableへの確認事項を3点(仮経済storeとPhase3境界/決定的ID適合性/スコープ過大性)に整理して全文提出。

v3からの変更点(Fable技術レビュー条件付き承認、v4で反映。必須修正A〜D+推奨事項+Suu追加確定事項):
1. **必須A**: 現行`PlayerInventory`が表現できるのは`magnet`/`gear`/`battery`/`brush`(個体)と`wire`/`coating`(スタック)の6ファミリーのみと判明。9ファミリー全ティアを購入可能とする記述を撤回し、**閲覧は9ファミリー全て・購入は6ファミリーのみ**に変更。`substrate`/`roller`/`body`は「試遊版では閲覧のみ」表示とし購入操作を出さない。3ファミリー用のUI独自在庫型は作らない(§5・§6・§14)
2. **必須B**: 9ファミリー識別ドット描画に`coating`(ワニス容器、実在製品トレードドレス非模倣の一般的輪郭)を追加(§5)
3. **必須C**: 暫定ID方式を「fixtureとセッション購入品の名前空間分離」「全family共通の単調カウンタ」「削除後もID非再利用」「ID文字列をfamily判定に解析しない(familyは常に`InventoryItem.family`から取得)」「全ID(fixture含む)の一意性テスト」を明文化する形へ再設計(§7)
4. **必須D**: `computeSalvageRate`が`ok:false`を返した場合、サルベージ確定を拒否し状態を不変に保ち日本語エラーを表示する経路を追加(§6)
5. **Suu追加確定・サルベージ底値**: サルベージ額を`Math.floor(price × rate)`から`max(1, Math.floor(price × rate))`へ変更し、spec §5.4「どんな残骸でも0にはならない」の底値保証をPhase2試遊にも適用(0G禁止をSuu_mot3が独断せず判断、§6・§8)
6. **Suu追加確定・stackable統合**: 同一`materialId`のスタック購入は単一entryへ数量加算する(重複entry禁止)方針を明記(§6)
7. **Suu追加確定・mode非永続の回帰テスト**: `gameStore`の`persist`ミドルウェアが現状`mode`をpartialize対象に含めていない(=永続化されない)ことを確認し、`'shop'`/`'inventory'`追加後もこの非永続境界を維持する回帰テストを追加(§10・§14)
8. **Fable推奨事項の反映**: 経済ルールをZustand hookへ直接埋め込まず初期state生成・購入・サルベージを純関数として分離する構成へ変更(§13)。価格・残高・数量の有限・非負整数検証を状態遷移境界へ追加(§6・§14)。確認ダイアログ表示後に対象が消えていた場合は`itemId`再検索→存在しなければ状態不変で失敗させる経路を追加(§6・§14)。Canvas上の透明DOMボタンに視認可能なフォーカス枠・アクセシブルネーム・Canvas表示との位置同期を要求(§9・§14)。480×270/270×480双方でのスクロール・フォーカス追従・確認ダイアログの画面内収まりを試遊項目へ追加(§14)。全9ファミリー表示テストを「件数」だけでなく「各familyが固有の輪郭描画関数へ到達すること」まで検証するよう具体化(§14)
9. §12を「確認事項一覧」から「Fable技術レビュー結果の反映状況」へ更新し、Fableの3回答(整合/条件付き適合/過大でない)と必須修正の対応状況を記録する構成へ変更

---

## 0. 前提(遵守事項)

計画承認・Suu_mot3レビュー・Fable技術レビュー・人間実装承認のいずれかが完了する前は、検証目的であっても一時的なproduction/testファイルの編集を行わない。本計画自体は新規docsのみで、他ファイルは一切変更していない。

## 1. 位置づけ

Phase2ゲート「店(店UI)・インベントリ表示・素材カタログ(経済数値は仮)」(`CLAUDE.md`実装フェーズ表・`docs/spec.md` §12・`docs/phase2-plan.md` §2「非目標」および§17「UI(brabit)との境界」)。2026-07-23棚卸し報告(agmsg、Suu_mot3宛)のとおり、現状進捗0%・commit皆無。alice側の写像実装(materials.ts〜inventoryItem.ts、Step1〜9)は完了済みで、brabitが読み取り専用で消費できる型・関数がすでに揃っている。

## 2. 現状認識(前提)

- 現行UIシェルは旧V2由来のTailwind DOM UI(`src/App.tsx`・`src/modes/GarageMode.tsx`等)のまま。`art-spec.md` §5.4が定義する「一枚絵ガレージハブ(机/棚/カタログ/本棚/ドア/ラジオ)」はまだ実装されていない
- Phase1は低解像度Canvas描画基盤の技術検証(`src/retro/`配下: `palette.ts`・`canvas/*`・`colorOps/*`・`mode7/*`・`text/*`・`audio/*`)を完了したが、これらはまだゲーム本編画面(`App.tsx`以下の`modes/`・`components/`)には結合されていない。本計画(店・在庫画面)が、この結合の最初の論理単位になる
- alice提供の読み取り専用インターフェース(`src/materials/`): `MaterialId`・`Material`判別共用体(9ファミリー)・`MaterialFamily`・`InventoryItem`・`StackableStockEntry`・`PlayerInventory`・`WearState`・`computeSalvageRate()`
- **重要(Fable必須修正A)**: `InventoryItem`(個体管理)は`magnet`/`gear`/`battery`/`brush`の4ファミリーのみ、`StackableStockEntry`(スタック管理)は`wire`/`coating`の2ファミリーのみを表現できる。`substrate`/`roller`/`body`の3ファミリーは現行`PlayerInventory`型に**入れられない**。この境界はalice所有の型設計(`docs/phase2-step8-plan.md` v5)であり、本計画では変更しない
- `docs/phase2-plan.md` §17が挙げる型名「`MaterialTier`」は実装に存在しない。各`Material`派生型は`tierIndex: number`フィールドを持つのみ(11節で扱う)
- `PlayerInventory`/`InventoryItem`の個体ID発行・永続化は明示的にPhase2責務外(`inventoryItem.ts`冒頭コメント「itemIdは生成方法を問わない不透明な識別子として型のみ提供する(生成はPhase2責務外)」)。`docs/phase2-plan.md` §12「store層(個体ID・永続化)の所有はPhase3計画時にbrabit・aliceと確定する」というFable条件がある
- `gameStore.ts`は`zustand`+`persist`ミドルウェア。`partialize`は`diagnosisProgress`・`courseProgress`・`selectedTrackId`・`testRunCompleted`・`config`・`carConfig`・`garageSelection`のみを対象とし、`mode`は現状永続化対象に**含まれていない**。localStorageキーは`v15:`接頭辞の既存慣例(`v15:progress`・`v15:notebook`・`v15:legacy-notice-dismissed`)。本計画の仮経済storeは意図的にこの慣例に**乗らない**(7節)

## 3. 非目標(今回のPhase2 UI計画でやらないこと)

- 個体ID発行・恒久的な永続化スキーマの確定(Phase3事項、Fable条件、7節で決定的な暫定方式のみ実装)
- 経済数値の最終バランス・実際の`localStorage`永続化を伴う本番経済(価格・サルベージ実値の最終調整はPhase5、spec §12)
- 破壊モード視覚演出・検死レポート(Phase3)
- 巻線記録方式・整流子工程UI(Phase4)
- ガレージ一枚絵ハブ(art-spec §5.4)全体の実装。今回は店・在庫/サルベージ画面とその導線に限定する
- 素材ティアの解禁条件ロジック(spec §6.3、ボス連携はPhase5)。Phase2では全素材を閲覧可能とする(購入可否は5節参照)
- `substrate`/`roller`/`body`の購入機能、およびそのための独自UI在庫型の新設(Fable必須修正A。購入可能にするには`src/materials/`の型拡張が必要になるため、本計画のスコープ外・停止条件に該当)
- 恒久store・マイグレーション・賞金結線・ボス解禁・装着・摩耗更新・ローター組立物との連携(Fableレビュー「推奨事項」外の非目標として明記)
- `src/materials/`・`src/engine/`の変更(alice領域、越境しない)

## 4. 画面構成・導線(要求(1))

`art-spec.md` §5.4のハブ&スポーク構成に基づき、`gameStore`の`mode`ユニオン型へ`'shop'`・`'inventory'`を追加し、別シーンとして遷移する(`GarageMode`内タブ拡張は不採用: art-spec §5.4が定義する「棚→在庫・サルベージ」「カタログ→ショップ」は独立したスポーク画面であり、タブ内蔵はこの構成と整合しない)。

- 「棚」→ 在庫・サルベージ画面(`mode: 'inventory'`)
- 「カタログ」→ ショップ画面(`mode: 'shop'`)

遷移: ガレージ→棚→(サルベージ確認)→ガレージへ戻る。ガレージ→カタログ→(購入確認、6ファミリーのみ)→ガレージへ戻る。両画面とも実際に**購入・サルベージが完結する**仮経済閉ループとする(6節・7節)。

## 5. 素材カタログ表示(要求(2)、Fable必須修正A・B反映)

9ファミリー全ティアを`art-spec.md` §5.5「パーツ通販カタログ」様式(紙UI・N6地暗色文字、写真枠+品名+物性抜粋+価格)で**閲覧**表示する。ただし**購入操作を出すのは6ファミリーのみ**(下記)。

- 品名: `nameJa`(一般名のみ。`BANNED_TRADEMARK_TERMS`検査済みのデータをそのまま使用、商標語彙は独自追加しない)
- 物性抜粋: `NumericProperty`の状態で表示を分岐する。`VerifiedNumericValue`(`verifiedForPhysics: true`)は数値+単位をそのまま表示。`PendingNumericValue`(`status: 'pending'`)は数値を出さず「未検証」+単位のみ表示し、確定値であるかのように見せない
- 価格: `priceProvisionalG`(仮値である旨をUI上に明示する。spec §5.5「価格はバランスsweepの調整弁とする」)
- ティア表示: Phase2では全ティアを閲覧可能として表示する(未解禁ロックロジックは実装しない、3節)。「取扱予定」シルエット表示は将来のボス解禁連携(Phase5)向けの描画state型としてのみ用意し、型・関数はテスト可能に保つが、Phase2の実際の画面では常に「閲覧可能」状態のみを使う
- **購入可否の分岐(Fable必須A)**: `wire`/`coating`/`magnet`/`gear`/`battery`/`brush`の6ファミリーは購入ボタンを表示する。`substrate`/`roller`/`body`の3ファミリーは購入ボタンを出さず、「試遊版では閲覧のみ」等の日本語表示に置き換える。3ファミリー用に独自のUI在庫型(例: 仮の`InventoryItem`もどき)を新設しない
- 写真枠: プレースホルダ矩形ではなく、9ファミリーを識別できる最小限の内製手続きドット描画とする。形状は次のとおり確定(Fable必須B含む、輪郭で識別・色に依存しない):
  - 導線(wire)=コイル状の線、被膜(coating)=**一般的な無地ワニス容器の輪郭(実在製品のトレードドレスは模倣しない)**、磁石(magnet)=N/S二色ブロック、ギヤ(gear)=歯車シルエット、電池(battery)=円筒、ブラシ(brush)=短冊、台紙(substrate)=波形断面、ガイドローラー(roller)=円環、ボディ(body)=外形シルエット
  - 使用色は`src/retro/palette.ts`の既存色のみとし、新規色は追加しない
  - 新規画像アセットの追加は権利規約(spec §15.1内製主義)・1MB制約により禁止
- 購入単位: 購入可能な6ファミリーのうち、個体管理パーツ(磁石・ギヤ・ブラシ・電池)は1個単位、線材は1 m単位、ワニスは1 ml単位とし、価格表示の横に単位を明記する(8節)

## 6. PlayerInventory/InventoryItem/WearState・仮経済閉ループ(要求(3)(4)、Fable必須修正A・D反映)

- 在庫画面: `StackableStockEntry`(線材[m]・ワニス[ml])一覧+`InventoryItem`(磁石/ギヤ/ブラシ/電池)一覧。この6ファミリーのみが在庫画面に現れる(3ファミリーは在庫化しないため表示対象外)。各`InventoryItem`の`wearState`は警告色・強調色・新規アイコンを一切追加せず、N6紙面上の日本語ラベル+数値+単位のみで表示する(例: 磁石=「減磁度 12%」、ギヤ=「歯欠け度 5%」、ブラシ=「摩耗度 30%」。数値は`WearState`各バリアントのfractionをそのままパーセント表示)
- ショップ画面: カタログの6ファミリーから素材を選択→購入確認ダイアログ→確定操作で次を実行する:
  1. 所持金`cashG`(整数)から`priceProvisionalG`(購入単位1個/1 m/1 mlあたりの価格)を減算する。残高不足時は購入不可(ボタン無効化+理由表示)
  2. **個体管理(magnet/gear/battery/brush)**は新規`InventoryItem`を`items`へ追加する(ID発行方式は7節)
  3. **スタック管理(wire/coating)**は同一`materialId`の既存entryがあれば数量を加算し、なければ新規entryを追加する(Fable推奨: 重複entryを作らない。数量加算方式を採用)
- サルベージ画面: 対象`InventoryItem`を選択→確認ダイアログ表示前に`computeSalvageRate(material, wearState)`を評価する
  - `ok: true`の場合: 回収率を表示→確認ダイアログ(取消可能)→確定操作時に**再度**対象`itemId`が`items`配列に存在するか確認する(表示から確定までの間に対象が消えている可能性を考慮、Fable推奨)。存在すれば「対象を`items`から削除し、`cashG`へ`max(1, Math.floor(priceProvisionalG × rate))`(**Suu_mot3確定: 底値1G保証**、8節)を加算」を実行する。存在しなければ状態不変のまま失敗として扱い、日本語で再表示を促すメッセージを出す
  - `ok: false`の場合(Fable必須D): サルベージ確定操作自体を拒否する(確認ダイアログへ進めない、または進んでも確定ボタンを無効化する)。在庫・所持金は不変に保つ。`SalvageRateResult.reason`をそのまま出さず、日本語の一般エラー文言(例:「この個体はサルベージできません」)を表示する
- 状態遷移境界での検証(Fable推奨): 購入・サルベージいずれの操作でも、価格・残高・数量が有限(`Number.isFinite`)かつ非負の整数であることを確認し、満たさない場合は操作を実行しない
- 上記はすべて**セッション内限定の仮経済**であり、ページreloadで初期状態(固定フィクスチャ)に戻る。Phase5の最終経済結線(実賞金・実サルベージ額・実価格バランス)とは明確に分離し、UI上にも「試遊用の仮データ」である旨を表示する

## 7. 永続化/ID生成境界の明確化(要求(4)、最重要、Fable必須修正C反映)

Fable条件(個体ID・永続化の所有はPhase3確定)と衝突しないための設計方針。Fableの条件付き適合判定(「ランダム文字列である必要はないが、次を満たすこと」)を踏まえ、次のとおり確定する:

- Phase2の仮`PlayerInventory`(仮称`shopEconomyStore`)は**セッション内メモリのみ**で保持する(brabit所有の一時store、`persist`ミドルウェアを使わない。`v15:`接頭辞の永続化慣例には乗らない)。ページリロードで固定フィクスチャへ戻る
- 初期データ: 固定フィクスチャ(標準機の初期在庫を模した数件+初期所持金)をコード内定数として定義する。fixture側の`itemId`には`fixture-`接頭辞を用いる(例: `fixture-magnet-01`)
- **セッション内購入品のID発行方式(Fable必須C)**:
  - fixtureとは別の名前空間`session-`接頭辞を用いる(例: `session-0001`)。familyをID文字列に埋め込まない(下記の「解析禁止」規則のため)
  - カウンタは**全family共通の単調カウンタ**とし、セッション開始時に1(または0)へリセットする。購入のたびにインクリメントし、サルベージで対象を削除してもカウンタを巻き戻さない(=削除後の欠番を再利用しない)
  - **familyは常に`InventoryItem.family`フィールドから取得し、`itemId`文字列を解析してfamilyを判定するロジックを一切書かない**(不透明な識別子として扱う契約を型だけでなく実装でも守る)
  - fixture ID(`fixture-`接頭辞)とsession ID(`session-`接頭辞)が衝突しないことをテストで保証する(全ID一意性テスト、14節)
  - この方式はテストで発行結果を再現可能にするためのものであり、**Phase3で確定する本物のID発行・永続化方式を先取りするものではない**と明記する
- サルベージ・購入による在庫増減は上記セッション内storeへの配列操作(追加・削除・数量加算)として実装し、`InventoryItem`/`StackableStockEntry`/`PlayerInventory`の型定義自体(alice所有、`src/materials/inventoryItem.ts`)は変更しない
- Fable技術レビュー(`docs/phase2-ui-shop-fable-review.md`)により、上記方針は「条件付きで適合」と判定済み。再レビューは、本節の趣旨(名前空間分離・全family共通カウンタ・非再利用・非解析・一意性テスト)を変えない限り不要

## 8. 経済数値仮置き(要求(5))

`priceProvisionalG`・サルベージ回収率(`computeSalvageRate`の帯域[0.1, 0.2]/[0.4, 0.6])はそのまま表示・計算に使用する。最終バランス調整はPhase5(spec §12「Phase 2以降、経済数値は最後(Phase 5)まで仮置き」)。仮経済storeの初期所持金額も仮値とし、内部の`Material`・`InventoryItem`の値自体は改変しない。

**通貨・端数処理の確定仕様**: 通貨Gは整数として扱う。サルベージ額=`max(1, Math.floor(priceProvisionalG × computeSalvageRateのrate))`(**Suu_mot3確定**: spec §5.4「どんな残骸でも0にはならない」の底値保証をPhase2試遊にも適用し、0Gを禁止する)。購入価格は`priceProvisionalG`をそのまま整数として減算する(購入単位=個体パーツ1個/線材1 m/ワニス1 ml、5節)。`computeSalvageRate`が`ok: false`を返す場合は金額計算自体を行わない(6節)。

## 9. 非機能要件対応(要求(6)(7)、Fable推奨事項反映)

- キーボード操作: カタログ項目・在庫項目・購入/サルベージ確認ボタンはすべてDOM操作要素(フォーカス可能なbutton等、アクセシビリティ層)として実装し、Enter/Spaceで操作可能にする(10節「DOM限定」方針に従う)
- **フォーカス可視性・アクセシブルネーム(Fable推奨)**: Canvas上に重ねる透明DOMボタンであっても、フォーカス時は視認可能な枠を表示する(透明のままにしない)。各操作要素にはaria-label等でアクセシブルネームを付与し、Canvas側の描画位置とDOM要素の位置を同期させる
- タッチ: 十分なヒット領域を確保
- 色非依存: 選択状態・確認ダイアログの可否はチェックマーク・テキストラベル等の非色情報を併記
- 60fps: Canvas描画は静的なカタログ/在庫一覧が主体のためPhase1の`requestAnimationFrame`結合パターン(必要な場合のみ再描画、または変更時のみ再描画)に従う
- 初回1MB未満: 新規画像アセット追加なし(手続き描画のみ)を前提とし、`npm run build`後に実サイズを計測して確認する(14節DoD)
- 日本語UI・単位必須・商標禁止: `materials.ts`の`nameJa`/`descriptionJa`をそのまま使用。単位はspec §4.2表記のまま(nΩ·m、T、℃等)を省略しない

## 10. Canvas低解像度・palette一元管理・既存シェルとの結合点(要求(8))

**案B(レトロCanvas)を採用確定。** `art-spec.md` §5.5準拠のレトロCanvas(`src/retro/palette.ts`・`canvas/*`・`text/*`)で店・在庫画面を新規実装する。理由(Suu_mot3判断): V3の画面・UI判断はart-specが正であり、旧V2 Tailwind様式で新設すること(不採用となった案A)はart-specの規範性と矛盾する。

- V2シェルへの結合: 既存`GarageMode.tsx`から`mode`遷移ボタン(棚・カタログ)で暫定接続する。ガレージ本体(art-spec §5.4の一枚絵ハブ)のレトロCanvas化は別スコープのまま据え置き、店・在庫画面だけが先行してCanvas化される
- 内部解像度: Phase1人間承認済みの解像度をそのまま使用する。横画面は480×270単層、縦画面は270×480単層。整数拡大・nearest neighbor(pixelated)描画規律をPhase1(`src/retro/canvas/integerScale.ts`等)から継承し、新規の解像度・拡大方式は導入しない
- DOM要素は**アクセシビリティ用の操作要素・フォーカス層に限定**する。Canvas描画(画像表現)と、その上に重ねる/並置する最小限のDOM操作要素(button等、キーボード操作・スクリーンリーダー用)を分離する構成とし、通常のTailwind DOM UIとしての新設は行わない
- palette参照は`src/retro/palette.ts`のパレット名参照のみ(RGB直値禁止、spec §14)とし、`src/retro/lint/rawColorScan.ts`相当の検査をDoDに含める(14節)
- **`mode`の永続化境界(Fable指摘)**: `gameStore`は`persist`ミドルウェアを使用しているが、`partialize`は現状`mode`を対象に含めていない(=`mode`は永続化されない)。`'shop'`/`'inventory'`追加後もこの非永続境界を維持し、reload時に常にタイトル等の初期`mode`へ戻ることを回帰テストで保証する(14節)。仮に将来`mode`が永続化対象へ変わった場合、reload後に店/在庫画面へ復帰しつつ仮経済だけ初期化される、という不整合な挙動が起こり得るため、この境界は意図的に維持する

## 11. `MaterialTier`不在の扱い(要求(11))

`docs/phase2-plan.md` §17は「`MaterialId`/`MaterialTier`/`InventoryItem`/`PlayerInventory`等」と記載するが、`MaterialTier`という名前のexport型は`src/materials/`に存在しない。実際には各`Material`派生型(`WireMaterial`等)が`tierIndex: number`(spec表のティア番号、0始まり)と`family: MaterialFamily`を個別に持つのみで、`MaterialTierBase`は`materials.ts`内部の非export interfaceである。

判定(v1から変更なし): 本計画のUI要件(5節カタログのティア別表示、6節個体表示)は`tierIndex`+`family`の組み合わせで実現可能であり、追加の型は不要と判断する。`isBaselineAnchor`(基準ティア判定)も既存exportで取得できる。よって**alice側への型追加依頼は不要**と結論する。命名の齟齬自体はSuu_mot3合意のとおり、ゲート状況文書(`docs/phase2-plan.md`)側の既知事項として、alice宛にdocs-only訂正を別途依頼する(本計画の実装スコープには含めない)。

## 12. Fable技術レビュー結果の反映状況

`docs/phase2-ui-shop-fable-review.md`(v3への回答、全文保存済み)の要旨と対応状況:

- **判定**: 条件付き承認。セッション内非永続の仮経済store・決定的ID・購入→在庫→サルベージの試遊閉ループという規模・境界は原則妥当と判定された
- **確認事項1(仮経済storeとPhase3所有境界)**: 「整合している」との回答。条件(`persist`/`localStorage`/既存`gameStore`永続化対象に仮state・IDカウンタを入れない、reloadで固定fixtureへ戻る、仮storeを将来スキーマとして扱わない、`inventoryItem.ts`型を変更しない)はすべて7節に反映済み
- **確認事項2(決定的暫定ID)**: 「条件付きで適合する」との回答。必須条件(family非解析・名前空間分離・非再利用・一意性テスト・カウンタ共有単位の明確化)はすべて7節・必須Cとして反映済み(全family共通カウンタとしてSuu_mot3が確定)
- **確認事項3(スコープ過大性)**: 「過大ではない」との回答。ただし恒久store・マイグレーション・賞金・ボス解禁・装着・摩耗更新・ローター組立物を追加してはならない旨を3節「非目標」へ明記した
- **必須修正A(9ファミリー購入と在庫型の不整合)**: 反映済み(§2・§3・§5・§6)。購入は`wire`/`coating`/`magnet`/`gear`/`battery`/`brush`の6ファミリーに限定し、`substrate`/`roller`/`body`は閲覧専用とする。3ファミリー用のUI独自在庫型は作らない
- **必須修正B(coating識別形状の欠落)**: 反映済み(§5)。一般的な無地ワニス容器輪郭を追加、実在製品のトレードドレスは模倣しない
- **必須修正C(暫定IDの一意性規則)**: 反映済み(§7)
- **必須修正D(`computeSalvageRate`失敗時の扱い)**: 反映済み(§6)
- **推奨事項**: 経済ルールの純関数分離(§13)、有限・非負整数検証(§6)、stackableの数量加算方式(§6、Suu確定)、サルベージ確定時の対象再検索(§6)、サルベージ底値1G保証(§8、Suu確定)、フォーカス可視性・アクセシブルネーム・Canvas位置同期(§9)、両解像度でのスクロール/フォーカス追従/ダイアログ画面内収まり(§14)、9ファミリー表示テストの輪郭描画関数到達確認(§14)をすべて反映済み

Fableの判定文言どおり、「上記必須修正後は人間実装承認へ進めてよい」状態を目指す。本v4の趣旨(必須A〜Dの対応方針)を変えない範囲の追記であれば再度のFableレビューは不要という判定を受けている。Suu_mot3による本v4の確認を経て、人間実装承認を仰ぐ。

## 13. 変更ファイル一覧(見込み、案B確定版・Fable推奨の純関数分離反映)

新規(想定):
- `src/store/shopEconomy.ts`(仮称。**Zustandに依存しない純関数群**: 初期fixture生成、購入判定・適用、サルベージ判定・適用、ID発行、有限・非負整数検証。Fable推奨により状態遷移ロジックをhookから分離)
- `src/store/shopEconomyStore.ts`(仮称。`shopEconomy.ts`の純関数を呼び出すZustand hook本体。セッション内メモリのみ、`persist`なし)
- `src/retro/shop/` (仮称、Canvas描画関数群。状態を受けて描画するだけの関数群とし、`shopEconomy.ts`の状態遷移とは分離する)
  - カタログ一覧描画・在庫一覧描画・9ファミリー識別ドット描画(9関数、coating含む)・確認ダイアログ描画
- `src/components/ShopScreen.tsx`・`src/components/InventoryScreen.tsx`(Canvas+アクセシビリティ用DOM操作要素をマウントするReactラッパー)
- 対応する`src/store/__tests__/`・`src/retro/shop/__tests__/`テスト

変更:
- `src/modes/GarageMode.tsx`(棚・カタログへの導線ボタン追加)
- `src/store/gameStore.ts`(`mode`型へ`'shop'`・`'inventory'`追加。`partialize`は変更しない=`mode`は引き続き非永続のまま)

旧V2置換範囲: 今回は`GarageMode.tsx`への導線追加のみとし、既存タブ(モーター/ギヤ/車輪/シャーシ・電池/カラー)の削除・置換は行わない(論理単位を分離し、着手前計画のスコープを最小に保つ)。

## 14. テスト計画・試遊手順・共通DoD(要求(9)、Fable必須修正・推奨事項反映)

- Vitest(`shopEconomy.ts`純関数、状態遷移):
  - 購入成功(残高十分)/購入失敗(残高不足)。購入可能な6ファミリーすべてで動作すること
  - スタック購入(wire/coating)で同一`materialId`のentryへ数量加算されること(重複entryが作られないこと)
  - 個体購入(magnet/gear/battery/brush)で新規`InventoryItem`が追加されること
  - `substrate`/`roller`/`body`には購入操作自体が存在しない(UIに購入ボタンがない、または購入関数へfamilyを渡すとエラーになる等、型/実装レベルで購入不可であることを保証するテスト)
  - サルベージの取消(ダイアログキャンセルで状態不変)/確定(対象削除+残高加算)
  - サルベージ確定時に対象`itemId`が存在しない場合、状態不変のまま失敗すること
  - `computeSalvageRate`が`ok: false`を返す場合、確定操作が拒否され状態不変・日本語エラー表示となること
  - サルベージ額が`max(1, Math.floor(price × rate))`で計算され、0Gにならないこと
  - 決定的ID発行: 同一操作シーケンスで同一ID列が再現すること。fixture ID(`fixture-`)とsession ID(`session-`)の名前空間が衝突しないこと。全ID(fixture+session)の一意性テスト。削除後にカウンタが巻き戻らず、欠番IDが再利用されないこと
  - 価格・残高・数量が有限・非負の整数であることの検証(異常値を渡した場合に操作が実行されないこと)
  - `VerifiedNumericValue`/`PendingNumericValue`の表示切替ロジック
- `gameStore`回帰テスト: `mode`が`'shop'`/`'inventory'`追加後も`partialize`の対象に含まれず、reload相当のシナリオ(persistの再構築)で常に非永続であることを確認する
- Vitest/DOM操作テスト: キーボードのみでの購入・サルベージ完走(Tab/Enter/Spaceのみで一連の操作が完結すること)。フォーカス時に視認可能な枠が表示されること、各操作要素にアクセシブルネームが付与されていること
- Canvas描画: `src/retro/lint/rawColorScan.ts`相当のpalette違反検査(RGB直値の混入がないこと)を本機能の描画関数にも適用。全9ファミリー表示テストは「件数」だけでなく「各familyが固有の輪郭描画関数へ到達すること」まで確認する(coating含む)
- ビルド後の実サイズ計測: `npm run build`実行後、`docs/phase1-report.md` §15.2の実測手法(dist成果物サイズ)に倣い1MB未満を確認し、結果を実装報告に記録する
- 試遊手順(案):
  - (a) タイトル→ガレージ→カタログ→9ファミリー閲覧確認(substrate/roller/bodyは購入ボタンがなく閲覧のみであることを確認)→6ファミリーのいずれかを購入(残高十分/不足の両方を試す)→在庫反映確認→戻る
  - (b) タイトル→ガレージ→棚→在庫一覧確認→サルベージ対象選択→確認ダイアログでキャンセル→再度確認→確定→残高加算確認(1G未満にならないこと)→戻る
  - (a)(b)ともキーボードのみで完走できることを確認する。フォーカス枠が常に視認できることも確認する
  - 横480×270・縦270×480の両解像度で、カタログ一覧のスクロール・フォーカス追従・確認ダイアログが画面外へ出ないことを確認する
- 共通DoD: `npm run test && npm run build && npm run lint`の成功+上記palette検査+実サイズ計測

## 15. 停止条件

以下のいずれかに該当した場合、実装を中断しSuu_mot3へ報告する:

- `src/materials/`の公開型・関数のシグネチャ変更が必要と判明した場合(alice領域、越境不可。`substrate`/`roller`/`body`を購入可能にしたい要望が出た場合を含む、3節・必須A参照)
- 7節のID方式(名前空間分離・全family共通カウンタ・非再利用・非解析)について、Suu_mot3・Fableいずれかから趣旨に反する指摘が入った場合
- `npm run test`/`npm run build`/`npm run lint`のいずれかが導入前後で失敗した場合

---

以上、v4として提出する。Fable技術レビュー(`docs/phase2-ui-shop-fable-review.md`)の条件付き承認・必須修正A〜D・推奨事項をすべて反映済み。Suu_mot3の確認を経て、人間実装承認を仰ぐ。Fableの判定により、本v4の趣旨(必須修正の対応方針)を変えない範囲であれば再度のFable技術レビューは不要。production コード・アセット・commitは本計画書のみでは一切変更しない。
