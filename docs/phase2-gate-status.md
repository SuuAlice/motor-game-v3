# Phase 2 ゲート状況棚卸し(docs-only)

作成日: 2026-07-23
担当: alice_mot3(エンジン・写像側の棚卸し。UI側はbrabit_mot3本人からの正式報告を反映)
状態: **Phase2 UI計画v4、プロジェクトリードより人間実装承認済み(2026-07-23、Suu_mot3中継)。UI実装(brabit)着手可。docs確定コミット実施済み**

本書はプロジェクトリードの進行許可(Suu_mot3経由、2026-07-23)を受けて作成した、Phase2の共通DoD・成果物・未完了項目・試遊可能範囲・完了報告の要否の棚卸しである。engine/production変更は一切行っていない(docs-onlyの現状確認)。

## 1. 参照した既存の正典

- `docs/spec.md` §12(フェーズ計画表): Phase2内容「素材システム: materials.ts+写像層、在庫・個体状態、サルベージ、店(経済数値は仮)」、主担当「alice(写像)+UI(店UI)」、ゲート「写像の物性検証sweep」
- `CLAUDE.md`/`AGENTS.md`: 「各フェーズ末に人間の試遊承認。共通DoDは`npm run test && npm run build && npm run lint`の成功」
- `docs/phase2-plan.md`(2026-07-22人間実装承認済み): §16移行順(Step1〜10)、§19停止条件
- 先例: `docs/phase1-report.md`(brabit作成、Phase1完了時の完了報告書。状態欄に「Phase 1完了(2026-07-22人間承認)」)
- `docs/phase2-ui-shop-plan.md`(brabit作成、Phase2 UI実装前計画。2026-07-23時点v3、Fable全文レビュー提出済み)、`docs/phase2-ui-shop-fable-review.md`(Fable全文レビュー、判定=条件付き承認、必須修正A〜D)

## 2. 共通DoD(現時点、alice側変更後の状態)

2026-07-23時点で再実行し、いずれも成功を確認した。

- `npm run test`: 747 tests passed(56 files)
- `npm run build`: 成功(`tsc -b && vite build`)
- `npm run lint`: 成功(oxlint, exit 0)
- `git diff --check`: 成功
- working tree: Phase2/Step10関連の変更はすべてコミット済み(HEAD=`4da126a`)。他Stepの未追跡ドラフト文書(後述4節)は未コミットのまま残置

## 3. alice側成果物棚卸し(`docs/phase2-plan.md` §16移行順との対応)

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

**Phase2ゲート「写像の物性検証sweep」(spec §12)**: `docs/phase2-material-sweep-report.md` §8(結論)にて充足を確認済み。4ファミリー(導線・磁石・ギヤ・電池)全192組合せの健全性・単調性・トレードオフ・破産防止前提を検証しPASS、対象コードはSuu_mot3コードレビュー済み(commit `c628ff3`)。

**§4表で×/△と分類された5ファミリー(エナメル被膜・ブラシ・台紙・ガイドローラー・ボディ)がengine非接続なのは、計画上の意図的な非目標(Phase3/4待ち、`docs/phase2-plan.md` §2・§4)であり、Phase2の未完了項目ではない。**

## 4. 未完了項目・懸念点

### 4.1 UI側(brabit担当)は未着手(0%)であることが本人より正式報告済み — 最重要

spec §12のPhase2行は主担当を「alice(写像)+UI(店UI)」と明記しており、`docs/spec.md` §12本文も「在庫・個体状態、サルベージ、店」を含む。本リポジトリのgit historyでもPhase2開始commit(`9fcc203` docs: Phase 2素材システム実装計画を追加)以降、`[brabit]`署名のcommitは1件も見つからなかった。

**2026-07-23、brabit_mot3本人からSuu_mot3経由で正式報告を受領**: Phase2 UI担当範囲(店UI・インベントリ表示・素材カタログの見た目・個体劣化の視覚表現、`docs/phase2-plan.md` §17)は**未着手(0%)**であり、該当するcommit・画面は存在しない。現時点で試遊可能なのは旧V2 UI(凍結参考実装、CLAUDE.md「V2 UI一式」)のみ。git history上の不在は「別環境で進行中で未commit」ではなく、実際に未着手であることが確定した。

Suu_mot3よりbrabit_mot3へ、Phase2 UI実装前計画の起票が指示済み(2026-07-23)。

- brabit Phase2 UI実装前計画: `docs/phase2-ui-shop-plan.md`(v1→Suu_mot3必須修正→v2はSuu_mot3事前レビュー通過→Fableへ全文提出)。**Fable全文レビュー結果は`docs/phase2-ui-shop-fable-review.md`に保存済み。判定=条件付き承認。必須修正A〜Dをbrabitへ返却済みで、現在v4修正中・未承認・未実装**
- 方針(v1〜v3共通): 低解像度Canvas採用、セッション内仮経済(購入→在庫→サルベージの試遊閉ループを構成)、決定的な暫定ID方式、Phase3での永続化境界(`localStorage`化等)はFable確認後に人間承認を得てから確定、という設計方針
- Fable必須修正A〜Dの要旨(詳細は`docs/phase2-ui-shop-fable-review.md`参照):
  - **A**: 現行`PlayerInventory`が表現できるのは6ファミリー(個体: magnet/gear/battery/brush、スタック: wire/coating)のみで、substrate/roller/bodyの3ファミリーは購入不可。計画書の「9ファミリー全ティア購入可能」という前提と、既存`src/materials/`型を変更しないという制約は両立しないため、9ファミリーは全てカタログ閲覧可能・購入操作は6ファミリーのみに限定するよう修正(3ファミリーを購入可能にするには`src/materials/`の公開型変更=alice別計画が必要、今回は非推奨)
  - **B**: 9ファミリー識別形状の一覧に`coating`(ワニス容器等の一般的輪郭)が欠落しているため追加
  - **C**: 暫定IDの一意性規則(fixtureとセッション購入品の名前空間分離・カウンタ共有単位・削除後非再利用・ID文字列非解析・一意性テスト)を計画へ明文化
  - **D**: `computeSalvageRate`が`ok:false`を返した場合の扱い(サルベージ拒否・在庫/所持金不変・日本語エラー表示・状態遷移テスト追加)を計画へ定義
- v4はSuu_mot3最終レビューに合格し、必須修正A〜Dの反映を確認済み。再Fableは不要と判断された。**2026-07-23、プロジェクトリードより『Phase 2 UI計画v4を承認、実装を進めて』と明示承認を受領(Suu_mot3中継)。UI実装(brabit)着手可**

### 4.2 試遊可能範囲

現状、素材システムを実際に触って確認できる手段は次のみ:
- `npm run test`によるユニットテスト(素材写像・個体状態・サルベージ計算の関数レベル検証)
- `npm run sweep`系スクリプト(`materialSweep.ts`)によるコンソール出力の数値検証

**ゲーム画面上で店に入る・素材を買う・インベントリの個体状態を見る、といった操作は一切実装されておらず、現時点では「試遊」自体が成立しない。** CLAUDE.md/AGENTS.mdの「各フェーズ末に人間の試遊承認」という運用に照らすと、UI側が揃わない限り人間承認のための試遊ができない状態にある。

### 4.3 `docs/phase2-plan.md` §17記載の`MaterialTier`型は実装に存在しない(将来誤読防止のdocs-only訂正候補、未実施)

`docs/phase2-plan.md`は2箇所(§9「UI(brabit)との境界」本文・§17冒頭)で、brabitの店UIが読み取り専用で消費する型として「`MaterialId`/`MaterialTier`/`InventoryItem`/`PlayerInventory`等」を`src/materials/`から公開すると記載している。実装を確認したところ、`MaterialId`(`materials.ts`)・`InventoryItem`/`PlayerInventory`(`inventoryItem.ts`)は実在するが、**`MaterialTier`という型は実装に存在しない**。ティア情報は各素材ファミリー固有のID型(`GearMaterialId`・`MagnetMaterialId`等)が持つ`tierIndex`プロパティ+`family`判別子で表現されており、この構成で過不足ないことを確認した(brabit計画レビューの過程でSuu_mot3・alice_mot3間で確認済み)。

**訂正実施済み**: `docs/phase2-plan.md` §9・§17の記載を「`MaterialId`/`InventoryItem`/`PlayerInventory`等(ティアは各IDの`tierIndex`+`family`で表現し、独立の`MaterialTier`型は存在しない)」へ更新した。本項目はゲート充足や試遊可否に影響しない軽微なdocs整合性の訂正であり、`docs/phase2-ui-shop-plan.md`(v4)・`docs/phase2-ui-shop-fable-review.md`・本書とあわせて、人間実装承認後の同一docs-only commitへ含める(Suu_mot3指示)。

## 5. Phase2完了報告の要否について

既存文書には「Phase2完了報告書を書け」という明示的な指示・計画は見当たらなかった(`docs/phase2-plan.md`にも該当節なし)。ただし次の根拠からPhase1同様の完了報告が必要になると考えられる。

- CLAUDE.md/AGENTS.md「各フェーズ末に人間の試遊承認」という運用ルール(全フェーズ共通)
- 先例`docs/phase1-report.md`(brabit作成、状態欄「Phase 1完了(人間承認)」、CLAUDE.md冒頭にも参照あり)が、フェーズ完了を人間へ提示する文書として機能した実績

**所見**: alice側(写像・sweep・(d)/(e)見積り)は本棚卸しのとおり完了しているが、4.1のとおりUI側は正式に未着手(0%)であることが確定したため、**Phase2全体としての完了報告・人間試遊承認は現時点で出せない**。

## 5.1 現在の方針(2026-07-23、Suu_mot3レビュー確定)

前節で提示した3案のうち**案Aを採用済み**。現在の運用は次のとおり。

- Suu_mot3よりbrabit_mot3へ、Phase2 UI実装前計画(店UI・インベントリ表示・素材カタログの見た目・個体劣化の視覚表現)の起票を指示済み(2026-07-23)。計画文書のパス確定・状況は4.1節参照
- 計画はv1→v2(Suu_mot3事前レビュー通過)→v3(Fable全文レビュー、条件付き承認・必須修正A〜D)→v4(必須修正A〜D反映)と改訂され、**v4はSuu_mot3最終レビューに合格。再Fableは不要と判断された**(Fable技術判定は既にv3で完了しており、v4はその必須修正を正しく反映したかの確認に閉じるため)
- **2026-07-23、プロジェクトリードより人間実装承認を受領(Suu_mot3中継)。brabitはUI実装に着手可**
- UI実装完了後、alice側完了報告(本棚卸しがベース)とbrabit側完了報告を合わせた`docs/phase2-report.md`(Phase1の`docs/phase1-report.md`に相当)を作成し、人間の試遊承認を仰ぐ
- **UI実装・合同`docs/phase2-report.md`作成・人間試遊承認が揃うまでは、Phase2は未完了として扱う。Phase3実装への着手は禁止**(既存の指示どおり、alice側もPhase3のengine拡張作業には着手しない)

## 6. 次のアクション

2026-07-23、プロジェクトリードより人間実装承認を受領(Suu_mot3中継)。`docs/phase2-ui-shop-plan.md`(v4)・`docs/phase2-ui-shop-fable-review.md`・本書・`docs/phase2-plan.md`のMaterialTier訂正(4.3節)をあわせ、docs-only commitとして確定する(brabitのUI実装(production)着手前に、共有indexファイル等の競合を避けるためdocs確定を先行する)。UI実装完了後は、5.1節のとおりalice側・brabit側双方の完了報告を合わせた`docs/phase2-report.md`を作成し、人間の試遊承認を仰ぐ。
