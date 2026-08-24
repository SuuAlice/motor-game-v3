# P3-4実装完了報告: D06/D09 + production配線 + Phase 3完成ゲート

作成: Suu_mot3（2026-08-25）。本書はP3-4の正式arbiter最終レビューへ提出するための実装報告である。正式なarbiter回答ではない。計画・裁定の唯一の詳細出典は`docs/phase3-p3-4-plan.md`、UI/描画/音の詳細出典は`docs/phase3-p3-4-ui-plan.md`、確定裁定原文は`docs/phase3-plan-v12-amendments.md`を優先する。

## 1. 結論と現在地

- P3-4のG1a〜G7、G統合、G9 cleanupは、人間承認済み範囲内で実装・検証を完了した。
- G8人間試遊は、2026-08-25に人間プロジェクトリードが次のとおり条件付き通過を承認した。

  > D01/D03音響確認をPhase 6へ繰り越し、G8を条件付き通過として承認します。

- 上記繰越は音響QAのみであり、物理式、較正値、engine/store公開契約、production配線を変更しない。
- D01/D03の音響を未確認のままPASSとは扱わない。Phase 6で再確認する。
- P3-4のsource正確点は診断snapshot `codex/g8-terminal-presentation-debug-handoff`、commit `2bf3a58`。これは`src/` 77ファイルだけを収録した診断用commitであり、main/developへmergeしていない。
- 正式commit、tag、main/developへの反映は未実施であり、arbiter最終レビューと別途の人間commit承認を待つ。

## 2. 目的に対する達成内容

P3-4の目的は、Phase 3で個別に実装した破壊状態機械をproduction入口へ接続し、D06/D09、素材・摩耗反映、原子的記録、図鑑・HUD・演出・音、旧経路cleanupまでを一つの実プレイループとして閉じることだった。

達成した主要項目:

1. production素材選択から走行config、DestructionConfig、recipeKey、RunSnapshotを同一出典で生成。
2. motor-only、vehicle test、course runの3文脈を原子的なrun記録経路へ統合。
3. D06歯欠け・全損とD09軸受焼付きのproduction到達性、状態遷移、終端、WearState反映を実装。
4. D01〜D09の図鑑、HUD、演出、SE、NotebookExportV2、regressionDiff配管を接続。
5. 装備UIからG8指定素材へ到達可能にし、装備中個体のサルベージ拒否を維持。
6. feature gateと旧session保存経路をG9で削除し、Phase 3 production経路を唯一の経路にした。
7. destructionTerminalの最終stepを非永続の表示専用退避へ保持し、停止画面でもD03/D04/D06/D09のHUD・粒子・SEを観測可能にした。

## 3. ゲート結果

| ゲート | 内容 | 結果 |
|---|---|---|
| G1a〜G1c | 型・素材構成・snapshot・原子的開始境界 | 正式通過 |
| G2 | 永続化・validation・import/export契約 | 正式通過 |
| G3 | D06 production入口と必須5 assert | 正式通過。G-R3確定値を反映 |
| G4 | D09状態機械とproduction入口 | 正式通過 |
| G5 | 正典run RNG + production wrapper有限sweep | 正式通過。既存較正値を全維持、変更0件 |
| G6 | WearState、seeding、原子的notebook、regressionDiff | 正式通過 |
| G7 | UI/演出/音/a11y/docs | 正式通過 |
| G統合 | production経路を有効化 | 完了 |
| G9 | feature gate・旧分岐・旧session保存経路削除 | 正式通過 |
| G8 | 人間試遊 | **条件付き通過**。D01/D03音響のみPhase 6へ繰越 |

## 4. 最終較正と過剰設計防止

- G5の正典有限sweepではD06・D09の全受入条件を満たし、既存較正値の変更対象は0件だった。
- D06のG-R3確定値を維持する: POM `0.005`、PA6 `0.00726`、PEEK `0.0079` N·m、`toothFatigueExposureNmS=0.01` N·m·s。チタンの`nonBreakable`腕も不変。
- D09のG4確定値を維持する: `loadTorqueThresholdNm=0.005` N·m、`rpmThreshold=400` rpm（車軸）、`bearingSeizureGaugeLimit=0.15`。
- G8条件付き通過後に追加sweep、新規較正軸、新規物理式、新規公開契約を追加しない。
- exact step値は回帰証跡であり、ゲームとしての楽しさを犠牲にして固定し続ける目的値ではない。将来のゲームバランス調整は、別フェーズの明示計画と承認で扱う。
- 次工程では「巻く→走る→稼ぐ→買う→壊す→図鑑」の短い完成ループを優先し、物理シミュレータとしての精緻化を目的化しない。

## 5. G8実ブラウザ確認

確認済みの主要事実:

- 装備UI: 磁石・ブラシ・電池・ギヤの購入・装備・保持・同一ファミリー切替・装備中サルベージ拒否。
- D02: 指定production構成で約2.49秒、発煙HUD、煙粒子、発煙SE、図鑑登録、焼損を確認。
- D03: 指定production構成で約3.00秒、図鑑登録、電池消滅、専用粒子なし、終端を確認。破裂SEの人間聴取はPhase 6へ繰越。
- D04: 指定production構成で約0.76秒、停止後のHUD「燃えています」、炎粒子、図鑑登録、発火音を確認。リセット後にHUD・炎・ショート表示・発熱ゲージが消える負例も確認。
- console由来のアプリ赤エラーは、報告された確認範囲で0件。

G8条件付き通過の残件:

1. D01固有音の人間聴取。
2. D03破裂SEとduckingの人間聴取。

上記2件はPhase 6の音響QAで必ず再確認する。現行SE値をPhase 3で追加調整しない。

## 6. terminal presentation追加デルタ

G8でD04終端後の炎が失われることを検出し、承認済み有限バンドルで次を実装した。

- `gameStore`へ非永続・内部専用の`_terminalPresentationAccumulator`を1個追加。
- `destructionTerminal`の最終accumulatorだけを退避し、通常のfinished/stalled等では退避しない。
- HUD、RaceEffects、MotorAudioControlはlive accumulatorを優先し、無い場合だけ退避を読む。
- 新run開始成功、reset、setModeで消去。開始失敗では不変。manual abortでは生成しない。
- D03/D04/D06/D09の各terminal event、開始失敗不変、通常物理終端の非退避、one-shot exactly-onceを既存テスト内で固定。
- save schema、永続キー、公開action/type、物理、較正、粒子数・色・寿命、SEパラメータは変更していない。

## 7. 最終検証

2026-08-25、Suu_mot3が診断snapshotと同一のsourceに対して独立再実行した結果:

- `npm run test`: **90ファイル / 2216テスト、全成功**
- `npm run build`: 成功
- `npm run lint`: 成功
- `npx tsc --noEmit -p tsconfig.node.json`: 成功
- `git diff --check`: 成功
- `cmp AGENTS.md CLAUDE.md`: 一致
- build出力: JS 867.98 kB、gzip 243.05 kB

alice_mot3とbrabit_mot3も同一作業ツリーをread-onlyで独立再検証し、双方が90ファイル・2216テスト、build、lint、型検査、diff check、AGENTS/CLAUDE一致を報告した。alice_mot3は、D01/D03音響層が`src/engine/`・`src/materials/`からimportされない所有境界を確認し、Phase 6繰越とengine/materials契約の矛盾0件を報告した。brabit_mot3は、UI/store実装とG8条件付き通過のdocs-only同期を確認した。

初回のVitest実行でWindows側の存在しないTEMPパス参照によるworker起動前エラーが発生したが、`TMPDIR=/tmp`で再実行し全2216テストが成功した。コード失敗ではない。

## 8. Phase 6への明示繰越

- D01固有のnoise系継続SEを実機で聴取し、重複・過大音量・意図しない継続がないこと。
- D03破裂SEが1回だけ鳴り、他SEをduckするが全muteしないこと。
- 音響不具合が見つかった場合、まずUI/audio層の局所修正として扱い、物理式・較正・公開契約へ拡大しない。

## 9. commit前の境界

- 現時点ではcommit・tag・main/developへのpushを許可しない。
- 診断branch `2bf3a58`は外部試遊用のsource snapshotであり、正式完了commitやmerge元として自動採用しない。
- arbiter最終レビューでcommit可否と条件を確認し、その後に人間プロジェクトリードへ正式commit範囲を提示する。
- スクリーンショットだけの外部draft PR #5は試遊証跡であり、ゲーム本体へmergeしない。

## 10. 正式commit構成案（arbiter最終レビュー条件C2〜C4、2026-08-25）

**状態**: 本節はcommit内容を事前照合するための構成案であり、commit・tag・pushの承認ではない。2026-08-25時点で、いずれも未実施である。

### 10.1 再構成の固定点と禁止事項

- 基点は`develop`の`c1630330f2990cb2ca9e261910e9faade1e6dda2`とする。
- arbiterが照合したsource正確点は`2bf3a58ab25095b2e2aa03614f21a4325124f843`、そのcommit treeは`4454f08c085cf3df1463abeb5fac298be30ffd34`、`src/` subtreeは`39eb9923f4b0cb2cefbbebcd8a43e76d481342a2`である。
- 診断branchをmerge・cherry-pickしない。正式branch上で、下記の明示対象だけをsource正確点から再構成する。
- `git add .`、`git add -A`、ディレクトリ単位の一括stage、未追跡ファイルを含むglobは使わない。各commitは下記のexact pathだけをstageする。
- 診断用スクリーンショット、draft PR、`.codex/`、`.turnclock-handoff-staging/`、`docs/temp/`、本案に列挙していない未追跡資料は正式commitへ含めない。
- source内容は追加修正しない。差異が1 byteでも出た場合は停止し、C2不充足としてSuu_mot3へ報告する。

### 10.2 commit 1案: alice所有のengine・materials・純契約境界（23ファイル）

提案メッセージ: `feat(engine): P3-4破壊契約・D06/D09・素材反映を実装 [alice_mot3]`

対象:

```text
src/engine/__tests__/destructionModes.test.ts
src/engine/__tests__/destructionOrchestration.test.ts
src/engine/__tests__/failures.test.ts
src/engine/__tests__/prng.ts
src/engine/destructionModes.ts
src/engine/destructionOrchestration.ts
src/engine/vehiclePhysics.ts
src/materials/__tests__/gearInertia.test.ts
src/materials/__tests__/materialMapping.test.ts
src/materials/__tests__/materials.test.ts
src/materials/__tests__/recipeKey.test.ts
src/materials/__tests__/wearReflection.test.ts
src/materials/destructionCalibration.ts
src/materials/gearInertia.ts
src/materials/materialMapping.ts
src/materials/materials.ts
src/materials/recipeKey.ts
src/materials/wearReflection.ts
src/store/__tests__/beginRunSingleSourceAudit.test.ts
src/store/__tests__/notebookValidation.test.ts
src/store/__tests__/runOutcomeApplication.test.ts
src/store/notebookValidation.ts
src/store/runOutcomeApplication.ts
```

`src/engine/**`と`src/materials/**`はalice_mot3だけが正式commitする。store 4ファイルは、3腕builder・共通validator・原子的適用純関数というalice所有の契約境界として同じcommitに置く。

### 10.3 commit 2案: brabit所有のproduction配線・UI・描画・音（54ファイル）

提案メッセージ: `feat(ui): P3-4 production配線・図鑑・破壊演出を実装 [brabit_mot3]`

対象:

```text
src/App.tsx
src/components/DestructionHud.tsx
src/components/EncyclopediaScreen.tsx
src/components/ExperimentNotebook.tsx
src/components/InstrumentShopPanel.tsx
src/components/InventoryScreen.tsx
src/components/MotorAudioControl.tsx
src/components/SaveGate.tsx
src/components/ShopScreen.tsx
src/components/__tests__/a11yContracts.test.ts
src/components/__tests__/destructionAudioWiring.test.ts
src/components/__tests__/encyclopediaView.test.ts
src/components/__tests__/instrumentShopView.test.ts
src/components/encyclopediaView.ts
src/components/instrumentShopView.ts
src/index.css
src/modes/CourseMode.tsx
src/modes/GarageMode.tsx
src/modes/LabMode.tsx
src/modes/TestRunMode.tsx
src/render/RaceEffects.tsx
src/retro/audio/__tests__/destructionSe.test.ts
src/retro/audio/__tests__/mixLevels.test.ts
src/retro/audio/destructionSe.ts
src/retro/audio/mixLevels.ts
src/retro/destruction/__tests__/destructionPresentation.test.ts
src/retro/destruction/__tests__/gearMaterialColor.test.ts
src/retro/destruction/__tests__/particleField.test.ts
src/retro/destruction/__tests__/particleTick.test.ts
src/retro/destruction/__tests__/reducedMotion.test.ts
src/retro/destruction/__tests__/seVoiceHandles.test.ts
src/retro/destruction/destructionPresentation.ts
src/retro/destruction/gearMaterialColor.ts
src/retro/destruction/particleField.ts
src/retro/destruction/particleTick.ts
src/retro/destruction/reducedMotion.ts
src/retro/destruction/seVoiceHandles.ts
src/retro/shop/__tests__/formatMaterial.test.ts
src/store/__tests__/destructionWiring.test.ts
src/store/__tests__/gameStore.test.ts
src/store/__tests__/instrumentShop.test.ts
src/store/__tests__/legacyCourseRunWriteAudit.test.ts
src/store/__tests__/notebookStore.test.ts
src/store/__tests__/regressionObservation.test.ts
src/store/__tests__/saveStore.test.ts
src/store/__tests__/shopEconomyStore.test.ts
src/store/__tests__/testRunStore.test.ts
src/store/gameStore.ts
src/store/instrumentShop.ts
src/store/notebookStore.ts
src/store/regressionObservation.ts
src/store/regressionReport.ts
src/store/saveStore.ts
src/store/shopEconomyStore.ts
```

commit 1とcommit 2の中間点は、破壊的型変更の依存閉包を二人の所有commitへ分けるための内部履歴である。正式な受入判定はcommit 2適用後の結合treeに対して行う。中間点で型検査が成立しない場合でもsourceを補修してはならず、最終結合treeのexact一致を優先する。

`src/store/notebookStore.ts`と`src/store/__tests__/notebookStore.test.ts`は、brabit所有のstore統合ファイルでありcommit 2に置く。ただしP3-4差分には、aliceが作成した§16.1/§16.2のlegacy/current型、NotebookExportV1/V2の分岐、validator追随fixtureも含まれる。ファイル所有者に従うcommit配置とコード寄与者の記録を区別し、このalice寄与を消さない。`src/store/__tests__/beginRunSingleSourceAudit.test.ts`は共有ファイルではなくaliceが単独作成したC-4構造監査のため、commit 1へ置く。

### 10.4 commit 3案: Suu管理の正式文書（exact 7ファイル）

提案メッセージ: `docs(phase3): P3-4裁定台帳・実装報告を確定 [Suu_mot3]`

対象:

```text
docs/phase3-p3-4-final-review-request.md
docs/phase3-p3-4-g7-playtest-sheet.md
docs/phase3-p3-4-human-reapproval-bundle.md
docs/phase3-p3-4-implementation-report.md
docs/phase3-p3-4-plan.md
docs/phase3-p3-4-ui-plan.md
docs/phase3-plan-v12-amendments.md
```

この7件はarbiterへ提示した外部docs 7件と同じ集合である。うち本報告と裁定台帳は、正式レビュー後に人間が承認したC1追記・本commit構成案を加えた後続版としてcommitする。その他の未追跡docsは、内容が関連していても本commitへ混ぜない。

### 10.5 C2 exact照合・最終検証・停止条件

commit 2適用後、commit 3の文書差分に関係なく、次をすべて満たすこと:

1. 正式候補の`src/` subtreeが`39eb9923f4b0cb2cefbbebcd8a43e76d481342a2`と一致する。
2. `git diff --exit-code 2bf3a58ab25095b2e2aa03614f21a4325124f843 -- src`が差分0で終了する。
3. `npm run test`が90ファイル・2216テスト成功、`npm run build`・`npm run lint`・`npx tsc --noEmit -p tsconfig.node.json`が成功する。
4. `git diff --check`が成功し、`cmp AGENTS.md CLAUDE.md`が一致する。
5. 各commitのpath集合が10.2〜10.4の列挙と一致し、列挙外ファイルが0件である。

いずれかが不一致ならcommit実行前に停止する。既存のsourceを直して合わせる、診断branchをmergeする、未承認資料を同梱する、テスト期待値を再基準化することは禁止する。

### 10.6 C3・C4・tag/pushの承認境界

- C3は、alice_mot3・brabit_mot3が各path集合と提案メッセージをread-onlyで照合し、Suu_mot3が重複・欠落0件を確認して充足候補となる。
- C4は、人間プロジェクトリードが本構成案と照合結果を見たうえで**正式commitを明示承認した時点**でのみ充足する。
- commit承認はtag・push承認を兼ねない。`p3-4-complete`の付与とpushは、それぞれ別途の明示承認まで実施しない。

**C3最終照合結果（2026-08-25）**: alice_mot3・brabit_mot3は訂正版をread-onlyで再照合し、commit 1の23件、commit 2の54件、和集合77件について重複・欠落・列挙外混入0件をそれぞれ機械確認した。`beginRunSingleSourceAudit.test.ts`をalice側へ置くこと、共有store 2件をbrabit所有ファイルとしてcommit 2へ置きalice寄与を本文に残すこと、各提案メッセージの担当名に双方異議なし。Suu_mot3もレビュー対象source 77件との双方向差分0を再確認し、C3を充足と判定した。残条件はC4の人間commit承認だけである。
