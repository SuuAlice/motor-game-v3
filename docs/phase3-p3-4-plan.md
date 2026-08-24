# P3-4実装前詳細計画v14: D06(ギヤ歯欠け)+D09(軸受焼付き)+production DestructionConfig配線+人間試遊(Phase 3完成ゲート)

作成: alice_mot3(2026-08-13〜2026-08-16)。改訂履歴はv1(初版)→v2(Suu_mot3独立レビューP1〜P18是正)→v3(同A1〜A15是正)→v4(同C1〜C14是正、全節を自己完結full-textへ実体化)→v5(同D1〜D10是正)→v6(同E1〜E8是正)→v7(同F1〜F4是正)→v8(同G1〜G3是正)→v9(同H1〜H2是正、v8クロスレイヤ照合での再オープン)→v10(Fable提出直前メタデータ同期、契約本文変更なし)→v11(arbiter_mot3〈旧称Fable役〉正式技術レビュー判定文の反映、M-1必須修正+R1〜R27+人間再承認一覧A〜O+付帯条件C-1〜C13+REC-1〜4)→v12(Suu_mot3最終クロスレイヤ照合A1〜A5是正、契約変更なし)→v13(arbiter_mot3補足裁定〈HB-DEC-011ケースA、production config出典分裂〉の反映、G1a′ゲート新設+Q1〜Q8+S-1〜S-10+N-1〜N-3、人間再承認P承認済み)→v14(arbiter追加裁定Q9〈S-5/N-2後半のゲート循環解消、G1b移管〉の反映、G1a′完了条件をS-1〜S-4・S-6〜S-10+N-1・N-2前半・N-3へ限定、人間再承認P追補P-1)→v15(arbiter追加裁定Q10 §8補足裁定の相互参照〈§12〉、およびarbiter追加裁定Q11のalice担当分Q-R3〈正典run RNG `createRunRng`の名称・配置・公開signature・所有境界・テスト・P3-1-Q9リプレイ規約との接続〉の反映、§20.10新設。Q11のQ-R1/Q-R2/Q-R4およびDoD a〜gはbrabit所掌のためUI計画側で反映。Suu_mot3照合A-Q11-1により、engine配下のmulberry32実装を`createRunRng`へ一元化する確定〈§20.10.3.1〉とrg依存閉包〈§20.10.3.2〉を反映)。人間プロジェクトリードへ: 本書はP3-4(D06〈ギヤ歯欠け〉+D09〈軸受焼付き〉の新規状態機械実装、production `DestructionConfig`・gameStore・UI初回配線、Phase 3完成ゲート)の実装前詳細計画である。**本書のみを読めば実装内容・契約・DoDを検証できる。他版・他節を参照しないと内容が分からない箇所は存在しない。**

## v13→v14の変更点(arbiter追加裁定Q9〈S-5/N-2後半のゲート循環解消〉の反映、2026-08-16)

**契機**: G1a′初回実装報告に対するSuu_mot3レビューで、engine計画v13 §20.8「条件S-1〜S-10全充足後にG1a′完了」と§3.1「beginRunActionへの配線はG1b、G1bはG1a′完了後に着手」が循環していることが発見された(S-5・N-2後半はbeginRunActionへの統合を要求するが、その統合自体がG1b以降にしか行えないため、S-5がG1a′単体では原理的に充足不能)。Suu_mot3はarbiterへ追加裁定(Q9)を依頼した。

**総合判定**: **(a)採用。** G1a′完了条件を純関数側へ限定し、S-5+N-2後半をG1bの必須DoDへ移管する。(b)(G1a′をalice+brabit共同ゲートへ拡張する案)は却下——人間承認済みのG1b定義(brabit所有・配線ゲート)を再分割し、所有境界で切ったゲート設計自体を崩すため。

- **G1a′完了条件(改訂)**: S-1〜S-4・S-6〜S-10、および負例N-1・N-2前半・N-3の充足をもってG1a′実装完了とみなす。**S-5とN-2後半はG1a′の完了条件から除外する。**
- **G1a′で担保する代替保証**: resolver・baseline構築関数・compose(`composeConfigFromMaterials`)が**純関数であること**(引数以外を読まない、store/localStorage/sessionStorage/グローバル状態へ一切書き込まない)をG1a′テストで固定する——S-5不変条件のうち純関数側で成立しうる唯一の部分(関数自身が副作用を持たない)をG1a′で先取りする。
- **G1bへの移管(必須DoD化)**: S-5の失敗時不変条件(nextRunSequence不変・pendingRunEquipmentSnapshot不変・RunSnapshot/RunAccumulator不生成・gameStoreローカルruntime state不変)を、resolver失敗・baseline/compose失敗・有限性検証失敗の各経路について、N-2後半の統合テストとともに**G1bの必須DoD**とする。「config構築失敗がrunSequence消費より前に確定する構築順序」の実装指針もS-5からG1bへ移動する。テスト所有はalice(純関数・fixture提供)+brabit(beginRunAction配線・統合テスト本体)の共同、C-4監査のG1b段階分と同時充足する。
- **契約の不変性**: 本裁定はS-5/N-2後半の**検証時期と所有ゲートのみ**を変更し、不変条件の内容・失敗時の要求挙動・エラー型合流(Q5)・値・型は一切変更しない。
- **§0起草側欠陥の自己申告(意味保存の要約、判定文原文の無改変引用は台帳を参照)**: 本循環は、arbiter自身が条件S-1〜S-10の合成を値レベルで試した際に「単一構成での導出経路の整合」のみを検証し、ゲート境界(所有境界×実装時期)を跨いだ充足可能性の照合を省略したことによる起草側欠陥である(arbiter.md §4「条件どうしの合成を値のレベルで試す」・§7「裁定条件の発行前に充足可能性を承認済み計画・木の状態と照合」の不履行)。alice/Suuの停止判断は正当であり、独断先送りしなかった運用は規律どおりである。判定文原文の無改変引用は`docs/phase3-plan-v12-amendments.md`のP3-4-Q9エントリを正準参照とする。
- **人間再承認**: 要——新規バンドル項目の追加ではなく、本Q9裁定文自体の人間承認で足りる。`docs/phase3-p3-4-human-reapproval-bundle.md`の項目Pへ「追補P-1」として一体記録する(新規独立項目化しない)。**2026-08-16、人間プロジェクトリードが本Q9判定文全体を明示承認済み(Suu_mot3中継確認済み)。**
- **arbiter再提出要否**: 不要(本Q9裁定で完結)。以後もS-1〜S-10・Q9からの逸脱、または新たな充足不能が発見された場合は、その時点で追加裁定を求める。
- **Suu検出の3欠陥(既裁定内是正、Q9対象外)**: baseline関数のresolveGarageBuild再呼出しによる単一呼び出し結果違反(P1)・S-4監査の許可ファイル内違反/.tsx見逃し(P2)・N-2前半のreason/パス未固定(P3)は「既裁定内の実装欠陥としてalice是正」と整理された(Q9判定文§3)。いずれも2026-08-16に是正済み(§20.8参照)。
- **出典**: Suu_mot3中継の全文agmsgメッセージ(2026-08-16T15:06:57Z)。**判定文原文の無改変引用は`docs/phase3-plan-v12-amendments.md`のP3-4-Q9エントリが正準参照(本節は意味保存の自己完結反映)。**

**現時点の状態**: arbiter_mot3(旧称Fable役)正式技術レビュー判定文(2026-08-14、Suu_mot3中継)・Suu_mot3最終クロスレイヤ照合A1〜A5是正(2026-08-15)いずれも反映済み。人間再承認一覧A〜O(§20.5)は2026-08-15に人間プロジェクトリードが全15項目を明示承認(Suu_mot3中継確認済み)。Suu_mot3の指示によりG1aが解禁され、assembler(§4)・確定較正定数集約(§5)・`EquipmentDestructionContext`型定義+呼び出し側正規化のdocstring契約(§4.4。独立resolverは含まない)・RunSnapshot capture/recipeKey関連純関数(§13)を実装した(`src/materials/destructionCalibration.ts`・`recipeKey.ts`新設、`materialMapping.ts`・`destructionOrchestration.ts`改修)。**2026-08-15、Suu_mot3がG1aを正式通過と宣言した**(独立再実測全PASS)。**G1aは正式通過済みで契約の再openなし(arbiter補足裁定Q7)。** G1b着手時に発覚したgameStore↔素材個体の橋渡し契約欠落について、2026-08-16にHB-DEC-011ケースAとして条件付き承認(Q1〜Q8・S-1〜S-10・N-1〜N-3)を受け、**新設G1a′ゲート**(§3.1)をG1aとG1bの間に設けた。Suu_mot3独立照合の要修正9点是正・人間PMによる判定文全体+項目P承認(2026-08-16)を経てSuu_mot3がdocsゲートを正式通過とし、G1a′実装(resolver・baseline構築関数)を解禁、alice_mot3が実装しSuu照合(P1〜P3是正+精度追補を含む3ラウンド)を経た。その過程でSuu_mot3が発見したG1a′完了条件の循環(§20.8「S-1〜S-10全充足」と§3.1「G1bはG1a′完了後」)についてarbiterへQ9追加裁定を依頼、2026-08-16に(a)採用(G1a′完了条件をS-5/N-2後半除く形へ限定、S-5/N-2後半はG1bへ移管)の裁定を受け、人間プロジェクトリードが同日Q9判定文全体を明示承認した。純関数性テスト実装後、Suu_mot3レビュー(P4〜P8是正: Q9原文の無改変引用化・旧状態残存是正・純関数性の失敗分岐網羅・構造検査の恒久固定・引用見出し補完)を経て、**2026-08-16、Suu_mot3がG1a′を正式通過と宣言した**(独立照合: targeted 2ファイル/240テスト・全体70ファイル/1470テスト・build・lint・material-sweep tsc・diff check・cmpすべてPASS)。**G1a′のproduction/test追加編集は終了した。次はG1b(brabit所有、gameStore production配線)——ただしbrabitのUI計画側がQ9(S-5/N-2後半のG1b移管)へ同期し、Suu_mot3のクロスレイヤ照合を通過することが着手の前提条件として残る。**G1b production/test・feature gate・commit/tag/pushはこの照合通過まで引き続き未解禁。

## v12→v13の変更点(arbiter_mot3補足裁定〈HB-DEC-011ケースA、production config出典分裂〉の反映、2026-08-16)

**契機**: G1b着手時に発覚した、gameStore保持のV2 raw config(素材非依存)とP3素材システム保持の装備個体(EquipmentLoadout/PlayerInventory)を橋渡しする契約の欠落(2026-08-15)。alice_mot3が`docs/phase3-p3-4-production-config-source-review-request.md`を作成、Suu_mot3のP1〜P3追補指示を経てarbiter_mot3へ提出。

**総合判定**: 条件付き承認。G1a′新設(Q6)・resolver新設(Q1〜Q2)・二層命名(Q3)・baseline単一出典(Q4)・beginRun合流(Q5)を承認。G1aの再open範囲はなし(Q7)。人間再承認項目P新設を要する(Q8)。

- **Q1**: resolver(所有alice、`src/store/runOutcomeApplication.ts`、materials→storeのimport逆転回避のため`src/materials/`には置かない)を新設。検証順は`validateEquipmentLoadout`→resolverの単一順、bodyId解決も同一resolverへ統合。§4.4を精密化。
- **Q2**: `batteryItemId===null`は既存validateEquipmentLoadoutの`missingRole:'battery'`によりresolver到達前に構造的排除。`sourceWireMaterialId===null`はresolver内で防御的拒否。§3.4・§15を精密化。
- **Q3**: 二層命名(`rawPlayerConfig`/`materialComposedBase`)を確定。production beginRunでは車体側は`resolveGarageBuild(garageSelection)`の単一呼び出し結果を使い、gameStore.carConfig現在値を直接読まない(V2ラボ/診断の直接編集値は素材走行へ影響しなくなる、ゲームプレイ可視のため人間再承認Pに含む)。§12・§13.1・§13.2・§14.2の「base config」表記全箇所へ層を明示する改訂を行った(S-6)。
- **Q4**: `MaterialCompositionBaseline`のproduction出典を確定——chassis側は凍結関数`resolveChassisBaselineG(cellSelection)`、gear側は`resolveGarageBuild(garageSelection)`のgear.gearEfficiency(非対称出典)。§4.3・§5を精密化。
- **Q5**: 新規`BeginRunConfigError`型は設けない。resolver失敗・compose失敗はいずれも既存エラー腕へ合流、失敗時不変条件をテスト固定。§12を精密化。
- **Q6**: **G1a′ゲート新設**(G1aとG1bの間)。§3.1のゲート表へ追加。C-4最終DoD(§20.6・§22)を新規反映(S-7)。
- **Q7**: G1aの再open範囲なし(assembleDestructionConfig・captureRunSnapshot・computeRecipeKey・destructionCalibrationの公開シグネチャ・挙動は不変)。
- **Q8**: 人間再承認項目P新設(単一項目、`docs/phase3-p3-4-human-reapproval-bundle.md`)。arbiter再提出は不要。
- **台帳**: `docs/phase3-plan-v12-amendments.md`へP3-4-S1〜S10・N1〜N3エントリを新設。指摘1〜4(依頼書実査の不正確箇所4点)を実測どおり記録。

## v11→v12の変更点(Suu_mot3最終クロスレイヤ照合A1〜A5是正、契約変更なし、2026-08-15)

- **A1**: §7.3の「既存11フィールド」を実測どおり「既存12フィールド」へ訂正(§2.2列挙と一致)。§20.7 REC-1も「実装時再確認」ではなく本改訂で反映済みとして閉じ、自己矛盾を除去。
- **A2**: §14.2の呼び出し順序を、UI計画§6.2と同一の8段(base確定→有限性検証→computeRecipeKey→Wear反映→assembler→createInitialDestructionState→seed→capture)へ全面同期(旧5段+「UI7段」という不一致な記述を解消)。
- **A3**: §14.3へ「M-1(seeding)自体は`captureRunSnapshot`への追加のシグネチャ変更を伴わない、シグネチャ変更は人間再承認一覧A〈recipeKey必須追加〉起因」という限定を明記。
- **A4**: `docs/phase3-plan-v12-amendments.md`の2箇所(P3-4-M-1・R1〜R27エントリの日付行、改訂13)を、正しい経緯(人間PMがSuu_mot3との直接会話で設置を明示→Suu_mot3が正規性確認→alice/brabitへ中継)へ訂正。
- **A5**: 末尾の手続き注記を現状化——正式arbiterレビューは完了済み、残条件はSuu_mot3最終照合+人間再承認A〜Oの2つのみである旨を明記(「将来の正式Fableレビュー待ち」という誤った記述を除去)。

## v10→v11の変更点(arbiter_mot3正式技術レビュー判定文の反映、2026-08-14)

**総合判定**: 条件付き承認。実装開始を妨げる必須修正はM-1(D06クロスラン会計契約の欠落)1件のみ。M-1反映+Suu_mot3照合、および人間再承認一覧A〜Oの承認をもってG1aから実装解禁。再提出は不要(M-1・C-1をこの指定どおりに反映する限り)。

- **M-1(必須修正、最重要)**: 部分損傷ギヤ(例: 9歯欠け)を次走行で再装備すると、走行内`D06Progress.toothLossCount`が0から再スタートするため、(a)エンジンが更に10本欠けるまで終端しない会計破綻、(b)`applyWearToCarConfig`の歯欠け由来効率因子とD06 runtime効果の二重計上、(c)検死ログの「何本目か」の虚偽表示、という3つの実欠陥が生じることを式展開で証明された。確定裁定(i)〜(viii)どおり反映した: (i)`RunSnapshot.initialDestructionState.modes.D06.toothLossCount`を装備ギヤ個体の永続`WearState.gear.toothLossCount`でseedingする経路を§14.3として新設。(ii)`applyWearToCarConfig`(§14.1)から歯欠け由来効率因子を削除(seedingと対で実施)。(iii)`isTotalLoss`・曝露積分・再武装はseededカウントの上でそのまま動く(既存実装のまま)。(iv)`restoreRunSnapshot`へtoothLossCountの範囲検証を追加(§13.1)。(v)§15へgear全損個体の装備拒否を追加。(vi)§9.3を契約0/契約1′/契約2の3レンジへ再定義。(vii)負例(α)(β)(γ)を§9.2・DoDへ追加。(viii)両計画(engine §9/§12/§14/§15/§16、UI §6.2)+台帳への反映完了。
- **R1〜R27**: §20を「Fableへ求める判定」から「arbiter判定結果」へ全面書き換え、各項目を確定事項として反映(D06トリガは候補b〈累積曝露〉確定・D09被害記録は候補A〈生boolean2値〉確定・gear反射慣性はetaを含めない式で確定・gear密度はtitanium検証優先順で確定・recipeKeyは素材ID5フィールドを含める形で確定 等)。
- **人間再承認一覧A〜O**: §20.5として新設、判定文の単一一覧(重複なし)をそのまま転記。
- **付帯条件C-1〜C13**: §20.6として新設、DoD(§22)へ該当項目を追加。
- **REC-1〜4**: §20.7として新設(承認条件ではない推奨事項)。
- **台帳**: `docs/phase3-plan-v12-amendments.md`へP3-4-M-1・P3-4-R1〜R27を追記。

## v9→v10の変更点(Fable提出直前メタデータ同期2点、契約本文変更なし)

- 冒頭「現時点の状態」を「Fable提出前、Suu_mot3照合継続中」から「Suu_mot3照合通過、正式Fable提出待ち」へ更新した。
- §0(現行コード実査の根拠資料一覧)の`docs/phase3-p3-4-ui-plan.md`参照を、最終照合通過済みの`v9`へ更新した(旧v2表記のまま放置されていた)。

## v8→v9の変更点(Suu_mot3独立レビューH1〜H2是正、要約)

- **H1**: v8のクロスレイヤゲート順が自己矛盾していた——`G統合`(全ゲート完了+productionフラグ既定`true`化=実際のプレイヤー公開)を`G7`(UI/HUD/演出/a11y実装)より前に置いていたため、未完成のUIが先に公開される設計になっていた。brabit側UI v5はさらに`G統合→G9→G7`という、より悪い順序だった。是正: `G1a→G1b→G1c→G2→G3→G4→G5→G6→G7(フラグはfalseのまま)→G統合(engine+UI双方完成後にフラグをtrueへ)→G9(cleanup)→G8(最終コードでの人間試遊)`へ全面的に並べ替えた(§3.1・§3.2・§11.3・§22)。
- **H2**: §19.3の「brabit側が`computeRecipeKey`を再呼出しすることはない」という表現が、UI側で「brabitは一切呼ばない」と誤読された。実際は§13.1の設計どおり、brabit所有の`beginRunAction`がalice提供の`computeRecipeKey`をWear適用前base configに対してexact 1回呼び出す。「brabitは`beginRunAction`でexact 1回呼ぶ。`RunSnapshot`作成後・record保存後・`RegressionObservation`構築では再呼出しせず、一方向複写/永続record読取りのみ。関数実装所有alice、呼び出し配線所有brabit」という精密な文言へ書き換えた(§19.3)。

## v7→v8の変更点(Suu_mot3独立レビューG1〜G3是正、要約)

- **G1**: `PendingNotebookRecord`のvalidatorが、共通判別関数`validateNotebookFinalFields`の`legacy`結果をそのまま受理してしまい、pendingが本来持ちえないlegacy形状を誤って通してしまう設計だった。呼出し側の契約を分離し、pending専用validatorは`kind:'current'`のみを受理・legacyを明示的に拒否する設計へ変更した(§16.4)。
- **G2**: legacy sessionを保持したユーザーがP3-4後にexportすると、v7の「新規exportは常にversion 2〈新2フィールド必須〉」という設計では欠落フィールドを捏造できず矛盾していた。`NotebookExportV2.sessions`を`StoredExperimentSession`union(legacy/current混在可)へ変更し、履歴を一切捨てずexport/importする設計へ修正した(§16.2)。
- **G3**: `recipeKey`の空文字列の扱いを「実装時に確定する」と先送りしていた。`length>0`+envelope形式(`/^v[1-9][0-9]*\|/`)検証を今すぐ確定し、opaque payload自体は再parseしない設計とした(§16.4)。

## v6→v7の変更点(Suu_mot3独立レビューF1〜F4是正、要約)

- **F1**: §20 D4がv5時点のoriginKind案(表示専用・ハイブリッド)のまま残っていた。§7.7の最終形(候補A=originKindなし・終端瞬間の生boolean2値のみ、候補B=履歴由来の正確なoriginKind)と完全一致させ、ハイブリッド案は削除した。
- **F2**: legacy notebook unionが構造的部分型により「新2フィールドの片方だけ存在」を型で拒否できていなかった。`?:never`で両フィールド不在を型で明示し、raw validatorへ`hasFinal===hasRecipeKey`交差不変条件+deep検証を追加、半状態の負例テストを追加した。
- **F3**: feature gateのテストresetを「既存25ファイルは規律を持っているはず」という未検証の仮定で済ませていた。実際に`gameStore.test.ts`(beforeEachなし)・`testRunStore.test.ts`(部分resetのみ)を確認し、専用テストファイル+明示的beforeEach/afterEachでのreset設計へ具体化した。
- **F4**: `NotebookExport.version`方針が未確定のままだった。version 2方式(新規exportは常にversion 2、importはversion1/2を別validatorで受理)を確定し、D9(courseRuns/vehicleTestRuns export新設可否)とは独立のFable質問として追加した。

## v5→v6の変更点(Suu_mot3独立レビューE1〜E8是正、要約)

- **E1(最重要)**: §5.2のD02/D05確定較正値が実際の`docs/phase3-p3-3-implementation-report.md`§6の表と一致しない誤った値だった(実装すれば確定物理を巻き戻す)。全12フィールドを同表と1対1で再照合し正確な値へ訂正した。
- **E2**: `MotorConfig`のフィールド総数が18(必須8+optional10)であるべきところ、v5は16と誤カウントしていた(recipeKey対象は17)。文言をコード(既に17項目を列挙済み)と一致させた。
- **E3**: `RunSnapshot.contractVersion`の現行値が2(courseLengthM/slopeRad追加で1→2済み)であるのに、v5は「1→2」と誤記していた。「2→3」へ訂正、v2 snapshotの非救済方針・invalid versionテストを追加した。
- **E4**: `recipeKey`のexact transportが搬送経路の途中(RunSnapshot外への複写禁止・notebook保存・UI再計算)で自己矛盾していた。beginRun時1回計算→RunSnapshot.recipeKeyがrun中権威値→builder一方向複写→notebook record自身のrecipeKeyが永続履歴権威値、という5点契約へ統一した(§13.1)。
- **E5**: feature gateの依存注入factory案が、現行`useGameStore`が単一singletonであり25ファイルから直接参照される実態と乖離していた。既存singleton公開面を変えず、`productionWiringEnabled`をGameStore既存stateへの1フィールド追加とする方式へ全面再設計した(§11)。
- **E6**: D09候補Aの`originKind`が、表示専用でも終端瞬間値からは導出不能なままだった。解釈済みラベル(originKind)を撤回し、終端瞬間の生入力値をそのまま記録する設計へ変更した(§7.7)。
- **E7**: D09恒久劣化量の単一出典の表現が3箇所で揺れていた。D07の`demagnetizationDeltaFraction`パターン(config必須フィールド→event複写→derive はevent側のみ読む一方向契約)へ完全統一した(§7.2・§7.7)。
- **E8**: §19.3・§19.4・§21・§18・§11のstale参照(旧gate名・旧複写方針等)を一括是正した。

## v4→v5の変更点(Suu_mot3独立レビューD1〜D10是正、要約)

- **D1**: `MotorConfig`の全フィールド監査が14フィールドと誤カウントしていた(`brushContactResistanceRatio?`・`brushChatterProbabilityRatio?`の2件漏れ、E2是正で更に全18フィールド〈必須8+optional10〉が正確な総数と確定)。全18フィールドへ訂正し、`recipeKey`のexact field listへ両ブラシ比率を追加した(§2.9・§13.2)。
- **D2**: `recipeKey`の搬送経路が未設計だった。`RunSnapshot`への独立フィールド追加(選択肢a採用)として、beginRun capture→RunOutcome→PendingNotebookRecord→pendingApplication永続化→reload retry→履歴保存までのexact transportを設計した(§13.1)。
- **D3**: D09の熱ゲージ更新式(conduction/dissipation積分)・`deriveDegradationDiffs`のD09完成実装(P3-0-Q6完成形)を新設した(§7.6・§7.7)。
- **D4**: D09 originKindの因果喪失問題(D04 initiatingCauseと同型)を認め、既契約維持(候補A、推奨)+履歴記録による原因別選択適用(候補B)の2候補をFableへ提示する設計へ変更した(§7.7)。
- **D5**: D06部分損傷時の`gearEfficiency`値域契約を、base snapshot契約(0.60-0.95)とD06 runtime effective契約(`0<eta<=base`)の2つに明示分離し、数値安定性をG5 sweep必須項目とした(§9.3)。
- **D6**: D06候補dの物理説明の誤り(meshCrossingCount+1=次の歯であり同じ歯が戻るのはcount=10)を訂正し、最大損失率の解析を追加、候補bを第一推奨へ変更した(§9.1)。
- **D7**: D09の入力物理式(`gearFrictionLossW`)を証明済みの事実ではなく候補proxyとして再提示し、代数的分解による物理的妥当性の検証をFableへ求める形へ変更した(§7.5)。
- **D8**: feature gateの自己矛盾(constを書き換える設計)を解消し、依存注入方式(mutable stateなし)へ全面再設計した(§11)。
- **D9**: notebook JSON export/importの現状(`ExperimentSession`のみ、courseRuns/vehicleTestRunsは未対応)を正確に反映し、既存機能拡張と新機能追加を分離。finalDestructionStateのbuilderを3腕専用の判別union形式へ変更し二重上書きを型で防止した(§16.2・§16.5)。
- **D10**: DoD(§22)へD1〜D9由来の新規検証項目を追加した。
- **C14の§9重複指摘**: Suu_mot3が確認ミスと認め撤回済み(実ファイルには重複なし)。

## v3→v4の変更点(Suu_mot3独立レビューC1〜C14是正、要約)

- **C1**: 「vXのまま」「§x〜y」のみで本文が欠落していた全節(旧§2.1〜2.4・3.2・4.1/4.3・5.1〜5.3/5.5・6.1/6.6・8.1〜8.6・10.2・11.1〜11.3・12.2/12.3・13・15.1〜15.4・17・20)を物理的に全文実体化した。D01/D02/D05確定較正値も全フィールド実数を転記した(§6.2)。
- **C2**: `DestructionFrameInput`の実フィールド(`rpm`・`angularVelocityRadS`・`loadTorqueNm?`、`omega`/`motorRpm`/`carConfigSnapshot`は存在しない)を実測確認。wrapper側でCarConfig依存の値(`gearFrictionLossW`・`axleAngularVelocityRadS`)を事前計算し、leaf(`destructionModes.ts`)へは計算済みスカラーのみを渡す設計(候補b)を採用、型追加の全設計(所有不変条件・raw validator・frame builder・motor-only unavailable規則・依存閉包)を記載した(§7.2)。
- **C3**: `BearingAssemblyState.gearItemId`(単一ギヤに紐付く)を実測確認、bearing軸=ギヤ軸(車軸側)と確定し、motor角速度をgearRatioで除算した軸角速度を新規frame入力として設計した(§7.2・§9)。
- **C4**: D06全損(`toothLossCount===10`)で`gearEfficiency=0`のCarConfigが生成される危険を実測(`vehiclePhysics.ts`のeta除算箇所2箇所)で確認、全損は同一eventでdestructionTerminalとなり以後一切の物理step/config合成が発生しないことを型・テスト設計で固定した(§9.2)。
- **C5**: v3の候補c(toothIndex re-arm)が無効果な死んだ状態だったことを認め撤回。実効な2候補(累積曝露契約変更/歯噛合位相の構造的積分)を再設計しFableへ委ねた(§9.1)。
- **C6**: トルクリップルを実装可能な決定論的式として再設計(gearEfficiencyへの周期的変調、CarConfig新規フィールド不要)、K_VIB類推の誤りを訂正した(§9.4)。
- **C7**: actual→reflected J変換式(`J_reflected = J_actual / gearRatio²`、既存反射慣性式の質量項と同型)を導出し、eta関与の要否をFable確認事項とした(§10.3)。
- **C8**: `recipeKey`を`RunSnapshot`から独立させ、Wear反映**前**のbase configから走行開始前に1回計算した文字列としてnotebook recordへ直接格納する設計へ変更、RunSnapshot唯一出典契約との矛盾を解消した(§13)。全フィールドリスト・固定順・-0/NaN/Infinity処理・version規則を確定した。
- **C9**: `finalDestructionState`のlegacy union設計を、`NotebookSlice`配列・`PersistedSaveState`・add/replace action・export/import・validatorまで含めた完全な依存閉包+型分離設計へ拡張した(§14)。
- **C10**: pitfalls#2依存閉包の実測値を今すぐ全て記載した(§18、コマンド+実測結果)。
- **C11**: `gearStrengthThresholdNm`のtitanium欄を明記(nonBreakableのため値なしである理由を記載)、production-valid構成でのD06/D09到達可能性を受入条件として数値表へ追加した(§17)。
- **C12**: feature gateの型・注入方式・G統合検証方法・新旧wrapper移行を具体化した(§11)。
- **C13**: runtime compose失敗をbeginRun前の完成config検証で構造的に排除する設計を確定した(§12)。
- **C14**: 見出し重複ゼロを再確認(後述の検証結果)、§22 DoDをspec§12契約マトリクス全項目+alice/brabit所有者付きで完全実体化した。

## 0. 読む順序・根拠

`docs/spec.md`(§4.2ギヤ・§7.1・§7.1.1・§7.3・§7.4・§7.5・§12)・`docs/phase3-plan-v12-amendments.md`(裁定台帳全体)・`docs/phase2-report.md`§9.1・`docs/phase2-material-sweep-report.md`・`docs/phase3-p3-3-implementation-report.md`§13・`docs/phase3-p3-2-implementation-report.md`§12・`docs/phase3-p3-4-ui-plan.md`v9(最終照合通過済み)・Suu_mot3の全指示(キックオフ2026-08-13T00:28・Q-1〜Q-6・P1〜P18・A1〜A15・C1〜C14)。現行production codeは`src/engine/destructionModes.ts`・`destructionOrchestration.ts`・`vehiclePhysics.ts`・`trackPhysics.ts`・`motorPhysics.ts`・`src/store/gameStore.ts`・`saveStore.ts`・`runOutcomeApplication.ts`・`notebookStore.ts`・`src/materials/materialMapping.ts`・`materials.ts`・`inventoryItem.ts`・`degradationApplication.ts`・`assumedGeometry.ts`・`regressionDiff.ts`を実測した(行番号は本書各節に記載)。

## 1. スコープ

| # | 項目 | 対応節 |
|---|---|---|
| 1 | production DestructionConfig配線を最初のサブステップに置く | §4・§19 |
| 2 | 申し送り統合対応表 | §21 |
| 3 | D06・D09 | §6・§7・§9 |
| 4 | stepTrackRunWithDestruction | §8 |
| 5 | WearState反映・collapsed rotor拒否・finalDestructionState・regressionDiff | §14・§15・§16 |
| 6 | UI/brabit境界・bundle・人間試遊・DoD | §3.3・§19・§22 |
| 7 | 統合較正閉包+数値候補 | §17 |

**確定-1〜確定-6(Suu_mot3のQ-1〜Q-6回答、2026-08-13T00:37:16Z)**: (1)D06/D09は必須実装、production配線サブステップを先頭に置き配線済み状態で実装(§3)。(2)production `DestructionConfig`全体のassemblerはalice/materials-store境界が所有、UI個別mapXxx再構成禁止(§4)。(3)`stepTrackRunWithDestruction`はalice/engine所有(§8)。(4)WearState→次run base configはaliceの横断純関数(§14)。(5)`finalDestructionState`の型・validator・writerはalice同一ゲート(§16)。(6)`deriveFireExposureProfileFromLoadout`はrun開始時1回のみ(§15)。

## 2. 現行コード実査サマリ(全項目、行番号付き)

### 2.1 D06/D09状態機械の現状

`D06Progress`(destructionModes.ts:208-212、`{toothLossCount, firstLossAtT, causeLog}`)・`D09Progress`(222-227、`{triggered, triggeredAtT, bearingHeatGaugeRatio, causeLog}`)は実フィールド定義済み、`createInitialDestructionState`(253,255)で初期化済み。`D06CauseLog`(322-325、`{loadTorqueNm, toothLossCount}`)・`D09CauseLog`(329-331、`{bearingHeatGaugeRatio}`)は`CauseLogCommon`(285-290、`{currentA,rpm,atT,temperature}`)を継承。`DestructionModeId`(17、`'D01'|'D02'|'D03'|'D04'|'D05'|'D06'|'D07'|'D09'`)・`DestructionState.modes`(232-239、D01/D02/D05/D06/D07/D09の6キー)は両モードを含む。`classifyTerminalModes`(destructionOrchestration.ts:1091-1101)はD06(`event.isTotalLoss`)・D09(無条件)を既に分類済み。`DestructionConfig.d06`(destructionModes.ts:119、`{breakage: GearBreakageProfile}`)・`d09`(135、`{bearingSeizureGaugeLimit: number}`)は必須フィールドとして存在。

**`advanceD06`/`advanceD09`は存在しない**(全リポジトリgrep 0件)。ヘッダーコメント(367-370)明記: 「D06/D09の判定関数はまだ存在しない(P3-4以降で追加する)」。`advanceDestructionState`のモード呼び出しリスト(764-767)・events配列(772-777)・`modes`マージ(783)はD01/D02/D05/D07のみ。`deriveDegradationDiffs`のD06分岐(destructionOrchestration.ts:181-183、`gearToothLossCount`→`{role:'gear',kind:'toothLoss',deltaCount}`)は実装済みだが到達不能。D09分岐(193-195)は明示的スタブ。`DegradationDiff`union(42-52)には`{role:'gear',kind:'seizure',deltaFraction}`(46)・`{role:'bearing',kind:'seizure',deltaFraction}`(47)が宣言済みだが未使用。`validateD06ProgressShape`/`validateD09ProgressShape`(781-804)は個別フィールド型チェックのみで交差不変条件が欠落。`GearBreakageProfile`(destructionModes.ts:77、`{kind:'breakable',gearStrengthThresholdNm}|{kind:'nonBreakable'}`)は消費者ゼロ。

### 2.2 `DestructionFrameInput`の実フィールド(C2是正で再実測)

destructionModes.ts:261-281、全フィールド:
```ts
export interface DestructionFrameInput {
  currentA: number;
  theoreticalCurrentA: number;
  rpm: number; // 表示用移動平均rpm
  batteryHeat: number;
  shorted: boolean;
  chatterFramesLeft: number;
  coilCollapsedRisingEdge: boolean;
  loadTorqueNm?: number; // motor-onlyではundefined(下記参照)
  energyUsedRatio?: number;
  coilLossW: number;
  isChatteringThisFrame: boolean;
  angularVelocityRadS: number; // 平滑化前の生角速度(rad/s)
}
```
`buildVehicleFrameInput`(destructionOrchestration.ts:1145-1169)は`loadTorqueNm: next.loadTorqueNm`(`VehicleSimState.loadTorqueNm`、実在フィールド)を設定する。`buildMotorOnlyFrameInput`(1114-1134)は`loadTorqueNm: undefined`を**明示的に**設定する——**motor-only文脈は構造的にloadTorqueNmを持たない**(車体が存在しないため負荷トルクという概念自体が成立しない)。この既存の`undefined`設計こそが、D06/D09がmotor-only文脈で構造的に発生しえない一次的な理由である(§17で到達可能性マトリクスとして精密化)。**`frame.omega`・`frame.motorRpm`・`frame.carConfigSnapshot`という名前のフィールドは存在しない**(v3はこれらを仮定していたが誤りだった)。CarConfigの値(`gearEfficiency`等)は`DestructionFrameInput`に一切含まれない——`buildVehicleFrameInput`の引数は`config: MotorConfig`のみで`carConfig`を受け取らない。

### 2.3 `stepTestRunWithDestruction`の終端処理の実態

destructionOrchestration.ts:1339-1388。`termination: RunOutcome | null`は`terminalModeCandidates`が非空の場合(destructionTerminal)のみ非null。`finalizeRun`(128-132、`RunEndSignal`から`RunOutcome`を作る関数)は`stepTestRunWithDestruction`内部から一度も呼ばれていない——**物理的な終端(finished/stalled/derailed/overheated)を`RunOutcome`化する責務はwrapperの外(呼び出し側)にある**。

### 2.4 collapsed rotor / WearState / PendingNotebookRecord / regressionDiffの現状

`RotorAssemblyState`(inventoryItem.ts:52-58、`{assemblyId,sourceWireMaterialId,consumedWireM,collapsed,burnedOut}`)。`collapsed`はD01発火時に`applyRotorDiff`(degradationApplication.ts:33-36)でtrueへセットされるが、読み取り側は`saveStore.ts:406`の型ガードのみで意味的分岐に一度も使われていない。`validateEquipmentLoadout`(runOutcomeApplication.ts:63-92)の失敗フィールド名は`missingRole: EquipmentRole`(58-59、`invalidRole`は存在しない)。`WearState`(inventoryItem.ts:38-41、magnet/gear/brushの3variant判別union)、rotor(D01/D02)・body(D04)・bearing(D09)は別型(`RotorAssemblyState`・`BodyPartState`・`BearingAssemblyState`)。「diff→persisted item書込み」は実装済み(`degradationApplication.ts`)、逆方向(劣化済み個体→次run base config)は実装ゼロ。`PendingNotebookRecord`3腕(`ExperimentSession`・`VehicleTestRunNotebookRecord`・`CourseRunNotebookRecord`)いずれにも`finalDestructionState`は存在しない。`validateDestructionStateShape`(destructionOrchestration.ts:806)は非export。`regressionDiff.ts`(`detectPerformanceRegression`)はproduction呼び出しゼロ。

### 2.5 gear J未接続の実態

`docs/phase2-report.md`163行:「ギヤのJ/D06: Phase2で写像済みなのは`gearEfficiency`のみで...ギヤ質量・慣性J増側の接続は未実装のまま...ギヤ質量/J増の接続はD06とセットでPhase3計画時に判断するオープン項目とする」。`docs/phase2-material-sweep-report.md`104行: 同旨。`vehiclePhysics.ts`411行: `const jEff = jMotor + (massKg * wheelRadius * wheelRadius) / (gearRatio * gearRatio * eta);`——ギヤ自体の回転慣性を表す独立項が存在しない。**eta(gearEfficiency)は分母に2箇所現れる**(199行`tResistReflected = (wheelRadius / (gearRatio * gearEfficiency)) * resistTotal`、401行`const eta = carConfig.gearEfficiency`、411行の`jEff`式内)——**`gearEfficiency===0`はこれらすべてで除算エラー(`Infinity`/`NaN`)を生む**(C4是正で実測確認)。

### 2.6 gear密度・幾何の実態

`materials.ts`実測: `gear-pom`(pending)・`gear-nylon-pa6`(pending)・`gear-peek`(verified、1300kg/m³)・`gear-titanium`(pending)。4種中3種が未検証。`assumedGeometry.ts`(全文実測)は「本ファイルはgear/substrate/body(ギヤ・台紙・ボディ)の質量差分を扱わない。これらは対応する密度がmaterials.ts上でpending(未検証)のままであり...」(16-18行)と明記し、ギヤの幾何仮定値(半径・厚み等)は一切定義していない。`CarConfig.massG`の実行時clamp範囲は`[80,250]`g(`MASS_G_MIN`/`MASS_G_MAX`、assumedGeometry.ts:273-274)。`GEAR_TOTAL_TOOTH_COUNT = 10`(inventoryItem.ts:27、`saveStore.ts`・`runOutcomeApplication.ts`・`shopEconomy.ts`から再利用される既存単一出典)。`combineGearEfficiency`(materialMapping.ts:81-93)は`baseEfficiency*ratio`という乗算合成+`efficiency<=0||efficiency>1`をResultのok:falseとして明示拒否する既存規律。

### 2.7 `BearingAssemblyState`とギヤ軸の関係

inventoryItem.ts:66-70: `{assemblyId: string, gearItemId: string, seizureFraction: number}`——**bearingは独立した軸を持たず、`gearItemId`で特定の1ギヤ個体に紐付く**(既存`validateEquipmentLoadout`の`bearing.gearItemId !== loadout.gearItemId`検証、runOutcomeApplication.ts:84-86で確認済みの1:1対応)。本ゲームの車両モデルは単一のギヤ比(`CarConfig.gearRatio`)のみを持ち、複数段のギヤ列を表現しない——**このbearingは「ギヤと同じ軸(車軸側)にある軸受」と解釈するのが、既存の1ギヤ=1ベアリングという単純化されたモデルと整合する**唯一の一貫した読み方である(§9で採用)。

### 2.8 `NotebookSlice`/`PersistedSaveState`の構造

saveStore.ts:134-138: `NotebookSlice = {sessions: ExperimentSession[], courseRuns: CourseRunNotebookRecord[], vehicleTestRuns: VehicleTestRunNotebookRecord[]}`。176-185: `PersistedSaveState = {schemaVersion, progress, notebook, inventory, equipmentLoadout, encyclopedia, saveMeta, idCounters}`。`SCHEMA_VERSION=1`・`SAVE_KEY='v16:save'`・`V15_PROGRESS_KEY`/`V15_NOTEBOOK_KEY`(既存のv15→v16 migration前例が既に存在、187-190行)。

### 2.9 `MotorConfig`の全フィールド(C8のrecipeKey設計用)

motorPhysics.ts:38-86、**必須8+optional10=全18フィールド**(v4は14フィールド、v5は16フィールドと誤カウントしていた、D1・E2是正——`brushContactResistanceRatio?`〈82行〉・`brushChatterProbabilityRatio?`〈86行〉の2件漏れに加え、単純な合計計算自体も誤っていた): `coilTurns`(10–150)・`slitWidthMm`(0–5)・`sandingQuality`(0–1)・`brushPressure`(0–1)・`magnetStrength`(0–1)・`magnetDistanceMm`(2–30)・`batteryVoltage`(1.5|3.0)・`axisOffsetMm`(0–3)・`wireGaugeMm?`(既定D_REF=0.4mm)・`parallelStrands?`(既定1)・`varnished?`(既定true)・`wireResistivityRatio?`(既定1.0)・`wireDensityRatio?`(既定1.0)・`batteryInternalResistanceRatio?`(既定1.0)・`batteryCapacityRatio?`(既定1.0)・**`brushContactResistanceRatio?`(既定1.0、82行、`resolveBrushContactResistanceRatio`が`config.brushContactResistanceRatio ?? 1`として解決、181行)**・**`brushChatterProbabilityRatio?`(既定1.0、86行、同型の解決関数が185行に存在)**・`effectiveTurnsRatio?`(既定1.0、**P3-3-Q12裁定により「base MotorConfigでは常にundefined||1」という層分離契約が確定済み**——劣化後の実効値は`composeEffectiveMotorConfig`が都度計算し、base側には一切漏れない、recipeKeyから除外する根拠はこの契約のみに依拠する)。

**recipeKeyへ含めるか否かの判定基準**: 上記18フィールドのうち`effectiveTurnsRatio`のみが「base configでは恒久的に定数(1)である」という既存裁定(P3-3-Q12)を持つため、recipeKeyの構成要素から除外する根拠が明確に存在する。**残る17フィールド**(`brushContactResistanceRatio?`・`brushChatterProbabilityRatio?`を含む)はいずれも素材選択またはplayer-adjustable値から決まる、run前に確定する性能パラメータであり、除外する根拠がない——全て`computeRecipeKey`(§13.2)へ含める。

## 3. ゲート構造の全体設計

### 3.1 クロスレイヤゲート順(A14是正+H1是正、G7をG統合の前へ移動し段階的公開を防止)

P3-0-Q2/確定-1は「D06/D09を配線**済み**の状態で実装・統合較正する」ことを要求する。単純にG1を「aliceのassembler新設のみ」としbrabit配線をG統合まで待たせると、この要求と矛盾する。是正: G1をクロスレイヤの3段階へ分割する。

**H1是正の核心**: v8は「G統合(全ゲート完了+production既定true化)→G7(UI/HUD/演出/a11y)」という順序だったが、これは自己矛盾していた——「全ゲート完了」と言いながら、UI(G7)が未完成のままproduction既定でプレイヤーへ公開してしまう。brabit UI v5はさらに「G統合→G9(cleanup)→G7」という順序で、UI未完成のproduction経路をさらに早く公開する設計になっていた。**是正**: G7(UI/HUD/演出/a11y)を**G統合より前**へ移動する——feature gate(§11)が`false`のまま(必要な統合テストのみtest限定で`true`)、engine+UI双方の実装を完成させ、**両方が完成した時点で初めてG統合(production既定`true`化、実際の公開)を行う**。P3-0-Q2の「配線を先に」は、offフラグ下での内部配線(G1a〜G7)で満たし、**プレイヤーへの公開だけをG7完了後(G統合)へ置く**——これにより「配線済みの状態で実装する」ことと「未完成のものを公開しない」ことの両方を同時に満たす。

| ゲート | 内容 | 所有 |
|---|---|---|
| G1a | assembler(§4)・較正定数集約(§5)・`EquipmentDestructionContext`**型**定義+呼び出し側正規化のdocstring契約(§4.4。**独立resolverは含まない**——resolverはG1a′で初めて新設される、arbiter補足裁定Q1・指摘4)・`RunSnapshot` capture純関数。**2026-08-15正式通過(Suu_mot3独立照合済み)。arbiter補足裁定Q7により再open範囲なし——本ゲートの公開シグネチャ・挙動はG1a′以降も不変** | alice |
| **G1a′(arbiter補足裁定HB-DEC-011ケースA Q6、新設)** | `deriveMaterialSelectionFromEquipment`相当の**独立resolver実装済み**(Q1、`src/store/runOutcomeApplication.ts`、§4.4)+production `MaterialCompositionBaseline`単一出典関数実装済み(Q4、§4.3・§5)+二層命名`rawPlayerConfig`/`materialComposedBase`のdocs反映(Q3、§12・§13.1・§13.2・§14.2)+beginRun合流(Q5、§12)+純関数性テスト実装済み(arbiter追加裁定Q9代替保証、§20.9)。**2026-08-16、Suu_mot3が独立照合(9点是正・P1〜P3是正・精度追補・Q9反映・P4〜P8是正)のうえG1a′を正式通過と宣言した。G1a′のproduction/test追加編集は終了。次はG1b(UI計画Q9同期のSuu_mot3クロスレイヤ照合通過が前提条件)** | alice |
| G1b | `assembleDestructionConfig`等をgameStore.tsから呼ぶ配線を、§11の feature gate(offのまま)の内側に実装。実wrapper(`stepMotorWithDestruction`・`stepTestRunWithDestruction`)への置き換えも同様にoff下で実施。段1の実体は最初からG1a′のresolver+baseline関数を呼ぶ完成形として実装する(配線対象6段: 1/2/3/5/6/8は不変、G1a′完了前のG1b着手経路は存在しない)。**着手条件(arbiter補足裁定Q6): G1a′完了(Q9改訂条件、§20.9参照)+G1a′のSuu_mot3照合通過+人間再承認項目P承認後**。**必須DoD追加(arbiter追加裁定Q9、§20.9)**: S-5の失敗時不変条件(resolver失敗・baseline/compose失敗・有限性検証失敗の3経路×nextRunSequence不変・pendingRunEquipmentSnapshot不変・RunSnapshot/RunAccumulator不生成・gameStoreローカルruntime state不変の4不変項目)+N-2後半統合テスト(beginRunAction経由での範囲外baseline失敗再現)+「config構築失敗がrunSequence消費より前に確定する構築順序」の実装を、G1b配線と同一差分内で実施すること。テスト所有はalice(純関数・fixture提供)+brabit(beginRunAction配線・統合テスト本体)の共同、C-4監査のG1b段階分と同時充足する(§22 DoD参照) | brabit(配線)+alice(S-5 fixture提供、共同) |
| G1c | フラグをテスト環境限定でtrueにし、既存6モード(D01〜D05・D07)がproduction経路(G1a+G1b)で発火することを統合確認 | alice+brabit共同 |
| G2 | `stepTrackRunWithDestruction`(§8)、G1bと同様にoff下でgameStore配線 | alice(engine)+brabit(配線) |
| G3 | ギヤ慣性J接続(§10)+D06状態機械(§6・§9) | alice(engine/materials)+brabit(配線はG1bの延長) |
| G4 | D09状態機械(§7・§9) | alice+brabit |
| G5 | 較正sweep(§17) | alice |
| G6 | WearState反映(§14)+collapsed rotor拒否(§15)+finalDestructionState(§16)+fireExposureProfile(§15末尾)+regressionDiff(§13) | alice(純関数)+brabit(store action本体) |
| **G7(H1是正、G統合より前へ移動)** | HUD/演出/音/図鑑/検死/計測器/pending導線/a11y/bundle監視。**feature gate=falseのまま**(必要な統合テストのみtest限定でtrue)で、UI側の全実装を完成させる | brabit主導 |
| **G統合(H1是正、engine+UI双方完成後)** | 全ゲート(G1a〜G7)完了確認+contextマトリクス検証(§17)+feature gateをproduction既定`true`へ切り替える単一commit(実際のプレイヤー公開はここで初めて発生) | 全員 |
| G9(§11.3) | `productionWiringEnabled`フィールド・関連if/else分岐の削除(明示的code cleanupゲート、E5是正) | brabit |
| G8(最終コードでの人間試遊) | 人間試遊承認 | 全員 |

### 3.2 実装順序の理由

D01〜D05/D07は「新しい状態機械」と「初めての配線」という2つの新規性を同時に持ち込まないため配線を後回しにした(P3-0-Q2)。D06/D09は配線パターン自体の新規性が低い(D01〜D07で確立済み)ため、配線を先に固定し、残る新規性(D06/D09そのもの)を配線済みの実環境で較正することで統合較正閉包を実現する。**プレイヤーに実際に公開される(フラグがproduction既定でtrueになる)のはG統合のみ**——確定-1の「段階的ロールアウト禁止」は公開の段階性を禁じているのであり、内部実装順序の段階性を禁じてはいない。**H1是正**: この原則を守るため、G7(UI/HUD/演出/a11y、brabit主導)は§3.1のとおりG統合より**前**に位置する——G7自体もfeature gate=falseのまま(test限定でのみtrue)実装するため、UI実装作業自体はプレイヤー公開ではなく、G7完了確認後のG統合commitが公開そのものを表す単一の切り替え点であり続ける。

### 3.3 alice/brabit所有境界表

| ファイル/責務 | 所有者 |
|---|---|
| `src/materials/materialMapping.ts`(assembler・写像純関数) | alice |
| `src/materials/destructionCalibration.ts`(D01/D02/D05共通部の新規production定数、§5) | alice |
| `src/materials/gearInertia.ts`(新設、§10) | alice |
| `src/materials/wearReflection.ts`(新設、§14) | alice |
| `src/materials/recipeKey.ts`(新設、§13) | alice |
| `src/engine/destructionOrchestration.ts`(`stepTrackRunWithDestruction`・frame builder拡張) | alice |
| `src/engine/destructionModes.ts`(`DestructionFrameInput`拡張、§7.2) | alice |
| `src/engine/vehiclePhysics.ts`(`CarConfig.gearReflectedInertiaKgM2`追加のみ、§10.3 R13確定) | alice(既存の「`src/engine/`はaliceのみ変更」役割どおり) |
| `src/store/runOutcomeApplication.ts`(型定義・`finalDestructionState`型・エラー型・G1a′ resolver`deriveMaterialSelectionFromEquipment`相当、arbiter補足裁定Q1) | alice |
| `src/store/saveStore.ts`(action本体・feature gate) | brabit |
| `src/store/gameStore.ts`(wrapper呼び出し配線・`RunAccumulator`保持) | brabit |
| `src/components/*.tsx` | brabit |

## 4. production `DestructionConfig` assembler設計

### 4.1 所有ファイル・公開シグネチャ

**所有ファイル**: `src/materials/materialMapping.ts`(alice/materials-store境界)。

### 4.2 内部構成

```ts
// src/materials/materialMapping.ts 新設

// battery: batteryId自身のswitchでnarrowingする。各map関数は既にprofile込みの
// 完全なBatteryDestructionConfig variantを返すため{profile,...}の再構築は不要。
function resolveBatteryDestructionConfig(batteryId: BatteryMaterialId): BatteryDestructionConfig {
  switch (batteryId) {
    case 'battery-alkaline':
    case 'battery-nickel-metal-hydride':
      return mapD03DestructionConfig(batteryId);
    case 'battery-lithium-polymer':
      return mapD04BatteryDestructionConfig(batteryId);
  }
}

// d04(延焼側): bodyIdはnull非許容。EquipmentDestructionContext.bodyIdは常に
// BodyMaterialId(未装備時は実在するカタログ値'body-none')として解決済みの前提とする。
function resolveD04Config(equipmentContext: EquipmentDestructionContext, magnetId: MagnetMaterialId): DestructionConfig['d04'] {
  return {
    bodyScorchDeltaFraction: mapBodyScorchDeltaFraction(equipmentContext.bodyId),
    magnetScorchDeltaFraction: mapMagnetScorchDeltaFraction(magnetId),
  };
}

// total pure function(Result型なし)。理由: 全入力(MaterialSelection・
// EquipmentDestructionContext)は既に型システムで閉じた合法な値であることが保証されて
// いる(GearMaterialId等はunion型)。composeConfigFromMaterialsがResult型を持つ理由は
// baseMotorConfig/baseCarConfigという「任意の数値」を受け取り範囲外を検出する必要が
// あるためだが、本関数は数値レンジの外部入力を一切受け取らない(全フィールドが列挙型
// IDからの決定的な写像)。
export function assembleDestructionConfig(
  selection: MaterialSelection, // wireId/magnetId/gearId/batteryId/brushId
  equipmentContext: EquipmentDestructionContext, // bodyId
): DestructionConfig {
  return {
    battery: resolveBatteryDestructionConfig(selection.batteryId),
    d01: D01_CALIBRATION,
    d02: D02_CALIBRATION,
    d04: resolveD04Config(equipmentContext, selection.magnetId),
    d05: assembleD05Config(mapD05BrushWearConfig(selection.brushId), D05_COMMON_CALIBRATION),
    d06: mapD06DestructionConfig(selection.gearId), // §6.3
    d07: mapD07DestructionConfig(selection.magnetId),
    d09: mapD09DestructionConfig(selection.gearId), // §7.2、bearing個体状態は含まない(次run反映専用)
  };
}
```

### 4.3 UI側からの呼び出し契機(arbiter補足裁定Q1・Q3反映)

`RunSnapshot` capture時に1回、`assembleDestructionConfig(selection, equipmentContext)`を呼ぶ。UI側は個々の`mapD0X...`関数を直接呼ばない(確定-2)。`selection`・`equipmentContext`は、G1a′のresolver(§4.4改訂参照、`src/store/runOutcomeApplication.ts`所有)の単一呼び出し結果であり、gameStore側が`EquipmentLoadout`/`PlayerInventory`から個別に組み立てることはしない(単一出典契約、arbiter補足裁定Q1)。

### 4.4 `EquipmentDestructionContext`設計(arbiter補足裁定Q1・Q2により解決経路を精密化)

```ts
// src/materials/materialMapping.ts
export interface EquipmentDestructionContext {
  bodyId: BodyMaterialId; // null不可。EquipmentLoadout.bodyAssemblyId===nullの場合は
  // 'body-none'(実在するBodyMaterialId、materials.ts:734、
  // BODY_SCORCH_DELTA_FRACTION_CANDIDATE['body-none']===0)へ正規化済みの値が渡される。
  // 正規化はalice提供のG1a′ resolver(§4.4本文参照、runOutcomeApplication.ts所有)が
  // 単一経路で行う——旧v12までの「呼び出し側(brabit)が正規化」という記述は、
  // arbiter補足裁定Q1(HB-DEC-011ケースA)によりresolverへの統合へ精密化された
  // (interface自体の型・フィールドは無変更、正規化の実施主体のみの変更)。
}
```
**bearingAssemblyを含まない理由**: bearingの個体状態(`BearingAssemblyState.seizureFraction`)は`selection.gearId`と同じ「どのギヤを使っているか」という事実を装備個体経由という別経路から入力する穴になる(P3-1-Q9型の問題)。bearingは購入可能な素材軸を持たない(spec §4.2に記載なし)ため、`d09`のconfig自体はgearId(金属かどうか)のみに依存する(§7.2)。bearing個体の`seizureFraction`は次run反映専用の入力(§14)としてのみ扱う。

**G1a′ resolver設計(arbiter補足裁定Q1・Q2、`src/store/runOutcomeApplication.ts`所有、G1a′ゲートで実装)**:

```ts
// src/store/runOutcomeApplication.ts(新設、G1a′)
// 所有: alice。配置理由: EquipmentLoadout/PlayerInventoryはstore層の型であり、
// src/materials/へ置くとmaterials→storeのimport逆転(engine<materials<storeの
// 現行レイヤリング破壊)を生む。P3-2ゲート7のderiveFireExposureProfileFromLoadout
// (同ファイル、loadout→派生値の純関数)が直接の先例。

export type DeriveMaterialSelectionResult =
  | { ok: true; selection: MaterialSelection; equipmentContext: EquipmentDestructionContext }
  | { ok: false; reason: string; missingRole: EquipmentRole };

// 引数は検証済みnarrowing型(validateEquipmentLoadoutのok側、batteryItemIdが
// string確定済み)。resolverは存在・family・bearing一致検証を再実装しない
// (単一検証権威、二重管理禁止)。呼び出し順序(validateEquipmentLoadout→resolver)
// はbeginRunAction側の契約とする(resolver内ではvalidateEquipmentLoadoutを呼ばない)。
export function deriveMaterialSelectionFromEquipment(
  loadout: EquipmentLoadout & { batteryItemId: string },
  inventory: PlayerInventory,
): DeriveMaterialSelectionResult {
  // wireId ← rotorAssembly(loadout.rotorAssemblyIdで引く).sourceWireMaterialId
  //   nullの場合は{ok:false, missingRole:'rotor'}(防御的拒否、現行到達経路0件、
  //   理論上到達しない防御的分岐としてコメント明記)
  // magnetId/gearId/brushId ← items(family別, itemIdで引く).materialId
  // batteryId ← items(family:'battery', itemId===loadout.batteryItemId).materialId
  //   (batteryItemId===nullは引数の型により本関数へ到達する前に構造的に排除済み)
  // bodyId ← loadout.bodyAssemblyId===nullなら'body-none'、非nullなら
  //   inventory.bodyParts(bodyAssemblyIdで引く).materialId
  // すべて成功時: { ok: true, selection: {wireId,magnetId,gearId,batteryId,brushId}, equipmentContext: {bodyId} }
}
```

関数名は`deriveMaterialSelectionFromEquipment`を基準候補とするが、selection+equipmentContext両方を返す実体に即した命名(例: `deriveRunMaterialInputsFromEquipment`)はalice裁量とする(arbiter補足裁定Q1)。

## 5. production較正定数

### 5.1 所有ファイルと既存所在の区別

D04(`D04_SHORT_CIRCUIT_DURATION_LIMIT_S_CANDIDATE`等5定数、materialMapping.ts:474-477)・D07の確定較正値は**既にmaterialMapping.ts内のmodule-private constとして存在する**(`mapD04BatteryDestructionConfig`・`mapD07DestructionConfig`が内部で参照)——新規モジュール化不要。**新規に必要なのはD01・D02・D05共通部のみ**(現状production定数が存在しない)。

### 5.2 新設モジュール(E1是正、`docs/phase3-p3-3-implementation-report.md`§6と1対1照合済みの正確な確定値)

**E1是正の重大性**: v4/v3の数値(D02の`conductionScale=0.02`等、D05の`brushSparkDurationLimitS=3/120`等)は、実際の確定値表(下記)と一致しない**誤った値**だった——このまま実装すれば、正式Fable較正レビュー(2026-08-10)+人間commit承認を経て確定済みの物理が巻き戻ってしまう。以下は`docs/phase3-p3-3-implementation-report.md`§6の表(135-157行)と1フィールドずつ再照合済みの正確な値である。

```ts
// src/materials/destructionCalibration.ts(新設)
// docs/phase3-p3-3-implementation-report.md §6の確定値をproduction定数として初めて
// 保持する。出典: checkpoint5較正レビュー(2026-08-10)+D01較正確定(2026-08-11)。
// 値はここで新規に決定するのではなく、既に人間commit承認済みの確定値をtest
// fixtureの複製からproduction単一出典へ集約するのみ(数値そのものの変更ではない)。
// 下記全フィールドはdocs/phase3-p3-3-implementation-report.md §6の表と1対1で照合済み。

export const D01_CALIBRATION: DestructionConfig['d01'] = {
  decayExposureScaleRad: 1000, // §6表137行「確定。人間再承認不要」
  minEffectiveTurnsRatio: 0.5, // §6表138行「確定。人間再承認不要」
};

export const D02_CALIBRATION: DestructionConfig['d02'] = {
  smokeGaugeThreshold: 0.6, // §6表139行「ゲート1裁定値(較正対象外)」確定
  coilOverheatGaugeLimit: 1, // §6表140行「契約値(較正対象外)」
  conductionScale: 0.04, // §6表141行「checkpoint5でgrid実測により新規較正」確定
  dissipationCoefficient: 0.5, // §6表142行、同上
  smokeResistanceMultiplier: 1.2, // §6表143行「ゲート1裁定値」確定
};

// assembleD05Config(mapD05BrushWearConfig(brushId), D05_COMMON_CALIBRATION)の
// commonPart引数(materialMapping.ts:719-725の型と完全一致する5フィールド)。
// ブラシ素材非依存の共通部。
export const D05_COMMON_CALIBRATION = {
  brushSparkDurationLimitS: 0.15, // §6表144行「ゲート1裁定値」確定
  brushSparkCurrentThresholdA: 3, // §6表145行、同上
  wearPerAmpSecond: 0.001, // §6表146行、同上(v4は本フィールド自体を欠落させていた)
  recoveryFrames: 6, // §6表147行、同上
  recoveryContactResistanceMultiplier: 1.2, // §6表148行、同上(v4は本フィールド自体を欠落させていた)
};
```
**DoDへの追加**: 実装着手時、上記5フィールド×D05+5フィールド×D02+2フィールド×D01=**計12フィールドの数値**が、実装時点の`docs/phase3-p3-3-implementation-report.md`§6表(または同表を引き継ぐ最新の確定値記録)と完全一致することを、実装前チェックリストとして明記する(§22)。値の再決定は一切行わない。

## 6. D06(ギヤ歯欠け)状態機械設計

### 6.1 spec根拠

`docs/spec.md`§7.1: 「D06 | ギヤ歯欠け | 過負荷トルク超過(素材強度依存) | 歯欠け・破片飛散・空転」。§7.1.1: 「D06 | 反復イベント(歯単位) | 歯欠けごとに伝達効率低下・トルクリップル増。全損で空転=走行不能 | ギヤ個体の歯欠け数 | 初回の歯欠け | チタンは発火しない」。

### 6.2 型設計

型は`D06Progress`(既存、変更なし)を維持する。破壊的型変更は§9.1の候補選択(累積曝露 or 歯噛合位相積分)に従属する。

### 6.3 素材写像設計

```ts
export function mapD06DestructionConfig(gear: GearMaterialId): { breakage: GearBreakageProfile } {
  if (gear === 'gear-titanium') return { breakage: { kind: 'nonBreakable' } };
  return { breakage: { kind: 'breakable', gearStrengthThresholdNm: GEAR_STRENGTH_THRESHOLD_NM[gear] } };
}
```
`GEAR_STRENGTH_THRESHOLD_NM`は`Record<Exclude<GearMaterialId,'gear-titanium'>, number>`(gear-pom/gear-nylon-pa6/gear-peekの3値、titaniumは`nonBreakable`のため数値を持たない——§17で全4値の扱いを明記)。

## 7. D09(軸受焼付き)状態機械設計

### 7.1 spec根拠

`docs/spec.md`§7.1・§7.1.1: 「D09 | 軸受焼付き | 高速×無潤滑(金属ギヤかじり含む) | 急減速+異音」「進行(摩擦増)→終端(焼付き)...焼付きで急減速・走行終了...無潤滑相当=金属ギヤ接触**または**高負荷軸受×高速継続の簡約判定」。

### 7.2 config型設計(単一の最終形、E7是正でdeltaFraction2件を追加)

```ts
d09: {
  thermal: { conductionCoefficient: number; dissipationCoefficient: number };
  bearingSeizureGaugeLimit: number;
  metalGearContactAlways: boolean; // gear素材由来のconfig profile値。engineは素材IDを
  // 一切読まない(destructionModes.tsのleaf規則、素材非依存)——advanceD09はこの
  // booleanをconfig経由で受け取るのみで、gearIdそのものを見ない。
  highLoadHighSpeed: { loadTorqueThresholdNm: number; rpmThreshold: number };
  gearSeizureDeltaFraction: number; // 必須、D07のdemagnetizationDeltaFractionと同型
  // パターン(§7.7で詳述)——config→event→deriveDegradationDiffsという一方向契約の起点。
  bearingSeizureDeltaFraction: number; // 同上
};
```

### 7.3 `DestructionFrameInput`拡張設計(C2・C3是正)

**設計選択(候補b、wrapperでの事前計算)**: `destructionModes.ts`のleaf純度(他engineモジュールへ依存しない、CarConfigの構造を知らない)を維持するため、CarConfig依存の値はwrapper(destructionOrchestration.ts、carConfigにアクセスできる)側で事前計算し、計算済みスカラーのみを新規frameフィールドとして渡す。

```ts
// src/engine/destructionModes.ts、DestructionFrameInputへ追加(既存フィールドは無変更)
export interface DestructionFrameInput {
  // ...既存12フィールド(§2.2のとおり、A1是正)
  gearFrictionLossW?: number; // 新規。motor-onlyではundefined(loadTorqueNmと同じ規約)。
  // wrapper側でMath.abs(loadTorqueNm*omega)*(1-carConfig.gearEfficiency)として事前計算済みの
  // 摩擦損失(W)。leafはCarConfigの構造を知らずにこの数値だけを受け取る。
  axleAngularVelocityRadS?: number; // 新規。motor-onlyではundefined。
  // wrapper側でmotor角速度/carConfig.gearRatioとして事前計算済みの車軸(ギヤ・軸受)角速度。
}
```
**所有不変条件**: 上記2フィールドは`destructionModes.ts`が所有する型(`DestructionFrameInput`)への追加だが、**値の計算はdestructionModes.ts内では一切行わない**(destructionOrchestration.tsのframe builder側の責務、leaf規則「他engineモジュールへの逆依存・循環依存を持たない」は維持される——CarConfigの構造を知る必要があるのはframe builder側だけで、leaf側は数値を受け取るだけ)。**motor-only unavailable規則**: `buildMotorOnlyFrameInput`は両フィールドを`undefined`に設定する(既存`loadTorqueNm`/`energyUsedRatio`と同じ規約)。**raw validator**: `DestructionFrameInput`自体はrestore対象の永続型ではない(毎frame動的に構築される入力であり保存されない)ため、restore用のraw validatorは不要——ただし`D09CauseLog`(§7.5)・`D06CauseLog`は永続対象であり、そちらのvalidatorは別途必要(§18の依存閉包に記載)。**frame builder変更**: `buildVehicleFrameInput`(destructionOrchestration.ts:1145、`config: MotorConfig, prev/next: VehicleSimState`を受け取る現行シグネチャ)へ`carConfig: CarConfig`引数を追加する必要がある(現行は受け取っていない)——これは`buildVehicleFrameInput`の破壊的シグネチャ変更であり、全呼び出し元(`stepMotorWithDestruction`は対象外、`stepTestRunWithDestruction`・`stepTrackRunWithDestruction`の2箇所)を追従させる。

```ts
// destructionOrchestration.ts、buildVehicleFrameInputの改修後シグネチャ
export function buildVehicleFrameInput(config: MotorConfig, carConfig: CarConfig, prev: VehicleSimState, next: VehicleSimState): DestructionFrameInput {
  // ...既存の構築ロジック
  const loadTorqueNm = next.loadTorqueNm;
  const omega = next.motor.omega;
  const gearFrictionLossW = loadTorqueNm !== undefined ? Math.abs(loadTorqueNm * omega) * (1 - carConfig.gearEfficiency) : undefined;
  const axleAngularVelocityRadS = loadTorqueNm !== undefined ? omega / carConfig.gearRatio : undefined;
  return { /* 既存フィールド */, gearFrictionLossW, axleAngularVelocityRadS };
}
```

### 7.4 bearing軸の確定(C3是正)

`BearingAssemblyState`(inventoryItem.ts:66-70)は`gearItemId`で単一ギヤに紐付き独立軸を持たない(§2.7実測)。本ゲームは単一ギヤ比モデル(複数段ギヤ列を表現しない)であるため、**bearing=ギヤと同じ軸(車軸側)にある軸受**と確定する。角速度は`axleAngularVelocityRadS = motorAngularVelocityRadS / gearRatio`(§7.3の`buildVehicleFrameInput`拡張が既に計算)。これは物理的な簡約(実際には軸受はモーター軸・車軸のいずれにも存在しうるが、本ゲームは単一の集約ギヤ比としてモデル化している)であり、**R15確定**(判定文§4、`BearingAssemblyState.gearItemId`の1:1対応・単一集約ギヤ比モデルの唯一の一貫した読みとして承認)。

### 7.5 入力物理式(D7是正、証明済みの事実として確定せず候補proxyとして提示)

**v4の誤り(D7指摘)**: `gearFrictionLossW = |loadTorqueNm*omega|*(1-eta)`が実際のギヤ摩擦損失を表すことを、計画側で「二重計上ではない」と断定していた。実際には`loadTorqueNm`自体が既に`gearEfficiency`(eta)を通じて反射された負荷(vehiclePhysics.tsの`tResistReflected = (wheelRadius/(gearRatio*gearEfficiency))*resistTotal`、199行)であるため、この式が実際のgear lossを表すか、それとも既存の負荷計算に含まれる量の一部を別目的で読み直しているだけかは、v4時点では**説明だけでは証明できていなかった**。**R8(確定裁定、判定文§4)により代数的に証明された**: vehiclePhysics.tsの既存反射式(199行)より`P_in = |loadTorqueNm×ω_motor|`・`P_out = wheelRadius×resistTotal×ω_motor/gearRatio`であり、`P_out = eta×P_in`が恒等的に成立するため`P_loss = P_in - P_out = |loadTorqueNm×ω|×(1-eta)`——**提示式は既存反射式の下でのギヤ噛合散逸パワーそのものであり、二重計上ではない**(`loadTorqueNm`の再読取りはトルクの二重「適用」ではなく損失の「観測」)。D09自身が増やす`axleFriction`由来の損失は、`resistTotal`増→`loadTorque`増→`P_loss`増として間接的に既に式へ入り込む(自己正帰還、意図的挙動として受容、付帯条件C-9でsweep定量化)。

```ts
// advanceD09内部(destructionModes.ts、CarConfigの構造は一切知らない、frame経由の
// 事前計算済みスカラーのみを使用)——R8確定裁定により物理的妥当性を代数的に証明済み
function computeD09GaugeInputW(frame: DestructionFrameInput, config: DestructionConfig['d09']): number {
  const frictionLossW = frame.gearFrictionLossW ?? 0; // motor-onlyでは常に0(発火不能)
  const metalContactInputW = config.metalGearContactAlways ? frictionLossW * METAL_CONTACT_MULTIPLIER : 0;
  const loadTorqueNm = frame.loadTorqueNm ?? 0;
  const excessTorqueNm = Math.max(0, Math.abs(loadTorqueNm) - config.highLoadHighSpeed.loadTorqueThresholdNm);
  const axleOmega = frame.axleAngularVelocityRadS ?? 0;
  const isHighSpeed = Math.abs(axleOmega) > (config.highLoadHighSpeed.rpmThreshold * 2 * Math.PI / 60); // rpm→rad/s変換
  const highLoadInputW = isHighSpeed ? excessTorqueNm * Math.abs(axleOmega) : 0; // 実際の超過力学的パワー(固定値ではない)
  return metalContactInputW + highLoadInputW; // 常に非負
}
```
**符号規約**: `Math.abs()`・`Math.max(0,...)`により、前進/後退いずれの符号でも摩擦損失・ゲージ入力は非負。**回転数の意味**: `axleAngularVelocityRadS`は車軸(ギヤ・軸受)の角速度(§7.4)。

**代数的分解の確定結果(D7是正、R8確定裁定で解決)**: `loadTorqueNm`の生成式(`vehiclePhysics.ts`の`computeDriveForceRequired`・`tResistReflected`周辺)を入力パワー(`P_in`、モーターが発生する機械的パワー)・出力パワー(`P_out`、車輪へ実際に伝わるパワー)・損失パワー(`P_loss = P_in - P_out`)の代数として分解した結果、`P_out = eta×P_in`が恒等的に成立し(§7.5参照)、`gearEfficiency`由来の損失(`P_loss_eta = P_in×(1-eta)`)がそのままD09ゲージへの入力として妥当であることが証明された——D09自身が増加させる`axleFriction`由来の損失は、上記のとおり`loadTorqueNm`の再計算を通じて間接的に既にこの式へ入り込む(独立に加算する必要はない)。**D06との正帰還の物理的妥当性(R8確定)**: D06(§9)がgearEfficiencyを低下させると、上記proxy式の`(1-gearEfficiency)`項が増加し、D09のゲージ入力も増加する——歯が欠けるほど軸受も焼き付きやすくなるという設計は物理的直感と整合する**意図的な設計として受容する**(D06→D09正帰還・D09自己正帰還のいずれも失速による自己制限構造を持つ、D01プラトーと同族)。付帯条件C-9によりG5 sweepで定量化する。

### 7.6 D09の熱ゲージ更新式(D3是正、新設)

**v4の欠落**: 入力パワー(§7.5)とruntime摩擦合成(§7.8)のみを記載し、ゲージそのものの更新式(積分・クランプ)を書いていなかった。D07(既存、既に実装済み)と同型のconduction/dissipation積分式を適用する:

```ts
// advanceD09内部、D07のadvanceD07(destructionModes.ts、既存実装)と同型のパターン
function computeNextBearingHeatGaugeRatio(prevRatio: number, gaugeInputW: number, config: DestructionConfig['d09'], dt: number): number {
  const next = prevRatio + (gaugeInputW * config.thermal.conductionCoefficient - prevRatio * config.thermal.dissipationCoefficient) * dt;
  return Math.min(1, Math.max(0, next)); // 0-1ゲージ範囲へclamp(§7.4温度表現規約)
}
```
**threshold境界・duration epsilon要否**: `bearingSeizureGaugeLimit`到達判定は`nextRatio >= config.bearingSeizureGaugeLimit`という単純な閾値比較で足り、D05の`DURATION_COMPARISON_EPSILON_S`のような時間比較epsilon(浮動小数点誤差対策)は**不要**——D05のepsilonは「持続時間」という時間量の比較に必要だったが、D09のゲージ閾値比較は瞬時の数値比較であり、既存D02/D07の`coilOverheatGaugeLimit`/`magnetHeatGaugeLimit`判定と同型(これらもepsilonを使っていない)。

### 7.7 D09被害対象の記録設計(D4是正、因果保持のための履歴記録)

**D4指摘の核心**: v12(既存契約)はD09終端で`BearingAssemblyState`加算+gear seizure加算の**両方**を無条件で記載しており、v4の`originKind`による選択適用(いずれか一方のみへdiffを発行)はこの既存契約からの**未申告の意味変更**だった。さらに、終端瞬間の`metalGearContactAlways`/`highLoadHighSpeedActive`という瞬時のboolean値だけからは、進行全体を通じた過去の寄与(例: 走行前半は金属接触でゲージが進み、後半は金属接触が解消したが高負荷条件だけが終端時に成立していた場合)を復元できない——これはD04の`initiatingCause`裁定(P3-2-Q4-3)が既に解決した問題と同型である。

**候補A(既契約維持、R4確定、E6是正でoriginKind自体を撤回)**: D09終端は**常に**gear seizure diffとbearing seizure diffの**両方**を発行する(v12の既存契約をそのまま維持)。**E6是正**: v5は`originKind`(`'gear'|'bearing'|'both'`という解釈済みラベル)を「診断表示専用だから瞬時値でもよい」としていたが、これは誤りだった——本文自身が認めているとおり終端瞬間の値だけでは過去の寄与を復元できない以上、**表示専用であっても不正確な因果ラベルを提示してはならない**(「主に金属接触が原因でした」という解釈済み文言は、実際には途中で原因が入れ替わっていた場合に嘘になる)。是正: `originKind`という**解釈済みラベルは追加しない**。代わりに`D09CauseLog`は終端瞬間の**生の入力値**をそのまま記録する(解釈を加えない):
```ts
export interface D09CauseLog extends CauseLogCommon {
  bearingHeatGaugeRatio: number;
  metalGearContactActive: boolean; // 終端瞬間のconfig.metalGearContactAlways値をそのまま記録(解釈しない)
  highLoadHighSpeedActive: boolean; // 終端瞬間のisHighSpeed&&excessTorqueNm>0判定値をそのまま記録(解釈しない)
}
```
プレイヤー向け診断表示(brabit所有)は、この2つの生値を「終端の瞬間、金属接触状態: あり/なし、高負荷高速状態: あり/なし」という**事実の提示**として表示してよい(spec §1.2の「答えを教えない、生の数値を見せる」という難易度哲学とも整合する)——「主に〜が原因」という因果の断定・解釈は行わない。

**候補B(原因別選択適用、契約変更、R4却下)**: 診断表示で正確な因果ラベルがどうしても必要な場合、D04の`initiatingCauseLog`(destructionModes.ts:184-187)と同型の履歴記録を導入する案(不採用、記録として残す):
```ts
export interface D09Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  bearingHeatGaugeRatio: number;
  causeLog: D09CauseLog | null;
  originContributionLog: { everMetalContact: boolean; everHighLoadHighSpeed: boolean }; // 新規、進行全体をOR蓄積
}
```
この場合、`D09CauseLog`は`originKind: 'gear'|'bearing'|'both'`(履歴から正しく導出された値)を持ってよく、`deriveDegradationDiffs`が`originKind`に応じて選択的にdiff発行する設計も選択できる(v12契約からの意味変更、要人間再承認)。

**確定理由(R4、判定文§4)**: 候補Aは診断表示から「不正確な因果ラベル」という問題自体を除去する(ラベル化しない、生値のみ提示)——候補Bの履歴記録の複雑さを持ち込まずに済む。spec §1.2「答えを教えない、生の数値を見せる」に合致し、不正確な因果ラベルという欠陥クラス自体を除去する。**候補A確定・候補B却下**(§20 R4)。

`validateD09CauseLogShape`(destructionOrchestration.ts:700)へ、`metalGearContactActive`/`highLoadHighSpeedActive`(いずれもboolean型検証のみ、交差不変条件は不要)を追加する(候補A確定のため候補B用の`originKind`交差不変条件チェックは実装しない)。D09は新規モードのため既存保存データにD09発火記録は存在せず、この型追加にmigration対象はない。

**D09恒久劣化量の単一出典(E7是正、D07`demagnetizationDeltaFraction`パターンへ統一)**: v5は「`DestructionConfig.d09`または専用較正定数」「moduleレベル定数」「config固定値」という3つの矛盾した表現が混在していた。是正: D07の確立済みパターン(`DestructionConfig.d07.irreversible.demagnetizationDeltaFraction`という**config必須フィールド**を、`advanceD07`が発火時点で`UnstampedDestructionEvent`へ複写〈destructionModes.ts:724-726、`event:{...,demagnetizationDeltaFraction:config.irreversible.demagnetizationDeltaFraction}`〉し、`deriveDegradationDiffs`が**event側からのみ**読む〈destructionOrchestration.ts:187、`event.demagnetizationDeltaFraction`〉という一方向契約)へ完全に統一する:

```ts
// §7.2のd09型設計へ追加(config必須フィールド)
d09: {
  thermal: { conductionCoefficient: number; dissipationCoefficient: number };
  bearingSeizureGaugeLimit: number;
  metalGearContactAlways: boolean;
  highLoadHighSpeed: { loadTorqueThresholdNm: number; rpmThreshold: number };
  gearSeizureDeltaFraction: number; // 新規必須、D07のdemagnetizationDeltaFractionと同型
  bearingSeizureDeltaFraction: number; // 新規必須、同上
};

// advanceD09内、終端event生成時(D07のadvanceD07:724-726と同型のコピー)
event: {
  mode: 'D09', causeLog, isFirstThisSession: true,
  gearSeizureDeltaFraction: config.gearSeizureDeltaFraction, // config→eventへ複写、この時点のみ
  bearingSeizureDeltaFraction: config.bearingSeizureDeltaFraction,
}

// deriveDegradationDiffs内(destructionOrchestration.ts、現状スタブの完成、event側のみ読む)
case 'D09':
  gearSeizureDeltaFractionSum += event.gearSeizureDeltaFraction; // config直接参照ではなくevent経由(D07と同型)
  bearingSeizureDeltaFractionSum += event.bearingSeizureDeltaFraction;
  break;
// ループ後
if (gearSeizureDeltaFractionSum > 0) diffs.push({ role: 'gear', kind: 'seizure', deltaFraction: gearSeizureDeltaFractionSum });
if (bearingSeizureDeltaFractionSum > 0) diffs.push({ role: 'bearing', kind: 'seizure', deltaFraction: bearingSeizureDeltaFractionSum });
```
**依存閉包の同期**: `DestructionConfig.d09`への2フィールド追加は、`DestructionConfigDraft`・`validateDestructionConfig`・`validateDestructionConfigRawShape`(既存d09検証箇所、destructionOrchestration.ts)・`UnstampedDestructionEvent`のD09 variant・`deriveDegradationDiffs`・関連fixtureのすべてに機械的追従を要する(§18のrg依存閉包実測対象へ追加)。sweep(§17)は`gearSeizureDeltaFraction`/`bearingSeizureDeltaFraction`の初期候補値(既に§17.3に記載済み)を、この統一されたconfig→event→derive経路で検証する。

### 7.8 D09の同一run内物理効果

```ts
export type ComposeD09RuntimeEffectResult = { ok: true; carConfig: CarConfig } | { ok: false; reason: string };

export function composeD09RuntimeEffect(baseCarConfig: CarConfig, d09Progress: D09Progress): ComposeD09RuntimeEffectResult {
  // 独立した2つの摩擦源を合成する既存パターン(1-(1-a)(1-b)、複数の欠陥要因が独立に
  // 効くときの標準的な合成式、[0,1]内に数学的に保証される)を採用する。
  const additionalFrictionRatio = d09Progress.bearingHeatGaugeRatio * D09_AXLE_FRICTION_INCREASE_PER_GAUGE;
  const axleFriction = 1 - (1 - baseCarConfig.axleFriction) * (1 - additionalFrictionRatio);
  if (!Number.isFinite(axleFriction) || axleFriction < 0 || axleFriction > 1) {
    return { ok: false, reason: `D09合成後のaxleFrictionが範囲外です: ${axleFriction}` };
  }
  return { ok: true, carConfig: { ...baseCarConfig, axleFriction } };
}
```
**no-op境界**: `bearingHeatGaugeRatio===0`のとき`additionalFrictionRatio===0`、`axleFriction=base`(恒等)。**単調性**: `bearingHeatGaugeRatio`増加で`axleFriction`単調増加。

### 7.9 C5負例+stalled競合

**正しい負例の形**: `UnstampedDestructionEvent`のD09 variantは**存在すること自体が「triggered」を意味する**(既存の他モードと同型)——「non-triggeredなD09 event」という中間状態は型システム上構築不能である。正しい負例: 「D09の摩擦増加中(`bearingHeatGaugeRatio`が0より大きいがまだ`bearingSeizureGaugeLimit`未満)のフレームでは、`advanceD09`が一切eventを生成しない(戻り値の`event`が`null`のまま)」ことを状態機械レベルで直接assertする。この状態では`events`配列自体にD09が現れないため、`classifyTerminalModes`への入力にもそもそも到達しない(分類ロジックそのものをテストするのではなく、分類器への入力が正しく空であることを確認する)。

**stalled競合のsweep受入への追加**: D09の摩擦増加(§7.8、`axleFriction`増加)がvehiclePhysics.tsの既存stall判定(`STALL_DETECTION_TIME_S`)を先に成立させてしまう可能性がある(軸受が焼き付く前に摩擦が大きすぎて車両が動けなくなり`stalled`終端が先に来る、物理的に正当な競合)。D09較正sweep(§17)の受入条件へ「D09が実際に`triggered:true`まで到達する構成が、stalled優先にならない構成として最低1つ存在すること」を明記する。

## 8. `stepTrackRunWithDestruction`設計

### 8.1 所有ファイル・公開シグネチャ

**所有ファイル**: `src/engine/destructionOrchestration.ts`。
```ts
export function stepTrackRunWithDestruction(
  vehicleState: VehicleSimState,
  accumulator: RunAccumulator,
  dt: number,
  rng?: VehicleStepRng,
): DestructionStepResult<VehicleSimState>
```

### 8.2 内部実装

```ts
export function stepTrackRunWithDestruction(
  vehicleState: VehicleSimState,
  accumulator: RunAccumulator,
  dt: number,
  rng?: VehicleStepRng,
): DestructionStepResult<VehicleSimState> {
  const baseMotorConfig = accumulator.replaySnapshot.motorConfig;
  const baseCarConfig = accumulator.replaySnapshot.carConfig!;
  const destructionConfig = accumulator.replaySnapshot.destructionConfig;
  const track = accumulator.replaySnapshot.track!; // track-run文脈、courseLengthM/slopeRadはnull

  const motorConfig = composeEffectiveMotorConfig(baseMotorConfig, accumulator.destructionState, destructionConfig);
  const d06Result = composeD06RuntimeEffect(baseCarConfig, accumulator.destructionState.modes.D06);
  if (!d06Result.ok) throw new Error(d06Result.reason); // §12のbeginRun前検証により実運用では到達不能、防御的
  const d09Result = composeD09RuntimeEffect(d06Result.carConfig, accumulator.destructionState.modes.D09);
  if (!d09Result.ok) throw new Error(d09Result.reason); // 同上
  const carConfig = d09Result.carConfig;

  const prevPhysicsState = normalizeOverheatedStatusForD04Hold(vehicleState, accumulator.destructionState);
  const rawNextPhysicsState = stepTrackRun(motorConfig, carConfig, track, prevPhysicsState, dt, rng);
  const frame = buildVehicleFrameInput(motorConfig, carConfig, prevPhysicsState, rawNextPhysicsState); // §7.3、carConfig引数追加
  const { state, events } = advanceDestructionState(
    accumulator.destructionState, frame, destructionConfig, accumulator.replaySnapshot.runContext, dt,
  );
  const physicsState = normalizeOverheatedStatusForD04Hold(rawNextPhysicsState, state);
  const snapshot: PhysicsSnapshotAtT = { context: 'vehicle', state: physicsState };
  const stampedEvents = stampPhysicsSnapshot(events, snapshot);
  const nextTerminalModeCandidates = [...accumulator.terminalModeCandidates, ...classifyTerminalModes(events)];
  const nextAccumulator: RunAccumulator = {
    ...accumulator,
    destructionState: state,
    events: [...accumulator.events, ...stampedEvents],
    terminalModeCandidates: nextTerminalModeCandidates,
  };
  const nonEmptyTerminalModes = asNonEmpty(nextTerminalModeCandidates);
  const termination = nonEmptyTerminalModes
    ? finalizeDestructionRun({ ...nextAccumulator, terminalModeCandidates: nonEmptyTerminalModes })
    : null; // destructionTerminal以外の物理終端では常にnull
  return { physicsState, accumulator: nextAccumulator, termination };
}
```
**runtime compose失敗の扱い(C13是正)**: 上記の`throw`は§12の設計により実運用では到達不能な防御的コードである——`beginRun`/`RunSnapshot` capture時点で`destructionConfig`・`baseCarConfig`の妥当性を完全検証し(§12)、stepping中の`composeD06RuntimeEffect`/`composeD09RuntimeEffect`は「有効な状態+有効なconfigからは失敗しない」ことをテストで固定する(§12)。したがって`ok:false`分岐は「あってはならない内部矛盾を検出した場合の最終防衛線」としてのみ存在し、通常の走行フローでは到達しない。

### 8.3 責務の分離

`stepTrackRunWithDestruction`(及び既存`stepTestRunWithDestruction`)の責務は「1フレーム進める+destructionTerminalが成立していればそれをRunOutcome化する」までであり、それ以外の物理終端(`finished`/`stalled`/`derailed`/`overheated`)をRunOutcomeへ変換する責務はwrapperの外、呼び出し側(gameStore.ts、brabit所有)にある。呼び出し側は毎frame、`physicsState.status`を監視し、`termination`がnullのまま`physicsState.status`が`'ready'`/`'running'`以外になった時点で、`finalizeRun(accumulator, {kind:'physicsEnded', physicsEndStatus})`を呼びRunOutcome化する。**同一stepでdestructionTerminalと物理終端が両方成立した場合、destructionTerminalが優先される**(`result.termination`のnullチェックを先に行う実装順序、`finalizeDestructionRun`が`terminalModeCandidates`非空を検知した時点でRunOutcomeを確定させる既存設計から自然に導かれる)。

### 8.4 全経路のテスト表

| 経路 | `result.termination` | `result.physicsState.status` | `RunOutcome.endReason` | 検証方法 |
|---|---|---|---|---|
| 破壊終端(D01〜D09いずれか) | 非null | (無関係) | `destructionTerminal` | §6・§7のD06/D09発火テスト+既存D01〜D05/D07 |
| 通常完走 | null | `finished` | `finished` | production-valid構成でのtrack完走 |
| 失速(電力不足) | null | `stalled`+`failureToStart` | `stalled` | 既存`stepTrackRun`の失速経路 |
| 失速(予算超過) | null | `stalled`+`energyExhausted` | `energyExhausted` | `hasEnergyBudget`トラックでの予算超過 |
| コースアウト | null | `derailed` | `derailed` | 曲率超過構成 |
| 熱暴走(overheated、D04以外) | null | `overheated` | `overheated` | 非lipo電池での過熱 |
| 熱暴走(overheated、D04保留中) | null | `running`のまま | (保留中は未終端) | `normalizeOverheatedStatusForD04Hold`のpre/post契約テスト |
| 手動中断 | null | `running`(中断時点) | `manualAbort` | UIの`abortCourseRun`→`finalizeRun({kind:'manualAbort'})`経路(§19.1) |

### 8.5 trusted preconditionのJSDoc

```ts
/**
 * vehicle文脈(track-run、accumulator.replaySnapshot.track !== null)のsnapshotを持つ
 * accumulator専用。test-run(track===null)またはmotor文脈のaccumulatorを渡した場合の
 * 挙動は未定義(trusted precondition、P3-2ゲート6のstepTestRunWithDestructionと同型の契約)。
 */
```

### 8.6 リプレイ等価性

同一`RunSnapshot`から独立2回のwrapper連続呼び出しで`events`/`destructionState`/`termination`が完全一致することを、D06/D09が発火する非自明経路で検証する(決定論的rng使用)。

## 9. D06/D09物理トリガの候補設計

### 9.1 D06トリガ(C5是正、候補cを撤回)

**候補c(旧v3、撤回)の無効性**: `toothIndex`という循環カウンタを追加しても、`advanceD06`は元から1物理stepに1回しか呼ばれない(既存の呼び出し構造)。「同一frame複数歯」を防ぐ効果は既存の1step1回契約が既に持っており、`toothIndex`を進めても発火可否・崩壊速度に何の変化も与えない——**無効果のフィールドを物理構造として提示していた**、撤回する。

**候補b(累積曝露、契約変更)**: `D06Progress`へ`cumulativeOverloadExposure: number`(N·m·s)を追加、`DestructionConfig.d06`へ`toothFatigueExposureNmS: number`を追加。D05の`cumulativeSparkExposure`と同型の累積曝露モデル。毎frame、`max(0, |loadTorqueNm|-threshold)*dt`を積算し、`toothFatigueExposureNmS`を超えるたびに歯を1本失い曝露カウンタをリセットする。**依存閉包**: `D06Progress`型・`DestructionConfig.d06`型・両者のvalidator(現状test fixtureのみ消費、§18で実測)。**再承認**: 要(型追加)。

**候補d(歯噛合位相の構造的積分、契約変更、新規、D6是正で物理説明を訂正)**: 実際の歯の噛み合わせ周期を物理的に積分する——`meshCrossingCount = accumulate(|axleAngularVelocityRadS| * gearTotalToothCount * dt / (2π))`(車軸1回転で歯数ぶんの噛み合わせが起きるという幾何関係)。

**v4の物理説明の誤り(D6是正)**: v4は「このカウンタが1周分進むごとに再武装する」と書いていたが誤りだった。`meshCrossingCount`が**1増える**のは「同じ歯が再び噛み合う1周」ではなく「**次の歯**の噛み合い」に相当する(gearTotalToothCount=10なら、同じ歯へ戻るのは`meshCrossingCount`が**10**進んだ時点)。是正: 再武装条件は「次の歯の噛み合い(`meshCrossingCount`が整数を1つまたぐ)ごとに、その時点でなお過負荷が継続していれば、**次の歯**を失う」と定義する(同じ歯が連続して壊れるのではなく毎回別の歯が壊れる、という設計)。

**1 tooth pitchと1 revolutionの区別**: `meshCrossingCount`の整数部が1増えることは1 tooth pitch(1枚の歯が噛み合う角度、`2π/gearTotalToothCount`ラジアン相当)の経過を表す。1 revolution(車軸1回転、`2π`ラジアン)は`meshCrossingCount`が`gearTotalToothCount`(=10)進むことに相当する。

**最大損失率(歯/秒)の解析(D6是正、新規)**: 再武装条件が「次のtooth pitchの経過」である場合、歯の損失率の上限は**tooth pitch(mesh-crossing)の発生率そのもの**で決まる——`meshCrossingRateHz = |axleAngularVelocityRadS| / (2π) * gearTotalToothCount`。例えば車軸角速度が105 rad/s(約1000rpm相当)・歯数10のとき、`meshCrossingRateHz ≈ 167`——過負荷が持続する限り理論上1秒間に最大167回の再武装が可能であり、**候補a(v3で撤回済みの瞬時判定)や単純な120fps毎frame判定よりもさらに速く全損しうる**(全10歯が理論上0.06秒程度で失われる計算になる)。**したがって候補dは「同一frameでの複数歯同時損失を防ぐ」という構造的効果は持つが、「崩壊速度そのものを緩和する」というA3是正が本来求めていた目的は達成しない**——高速回転域ではむしろ候補bより速く崩壊しうる。この点はv4の推奨理由(「物理的により厳密」)を再評価する必要がある材料としてFableへ提示する。

**再武装対象の選択(次歯か同歯か)**: 上記の再定義により、候補dは常に「次の歯」を対象とする(同じ歯が連続で壊れることはない、これは維持される構造的利点)。「同じ歯が再びやってくるまで待つ」(`meshCrossingCount`が`gearTotalToothCount`進むまで再武装しない)という、より遅い代替案も存在するが、この場合は10回に1回しか歯を失えない設計になり、逆に「反復イベント」というspecの趣旨(段階的な進行)には遅すぎる可能性がある——本書は「次の歯」方式を候補dの定義として採用し、「同じ歯が戻るまで待つ」方式は提示しない(いずれにせよ崩壊速度の制御はcumulativeOverloadExposure〈候補b〉の較正閾値で行う方が直接的であるため)。

**依存閉包**: 候補bと同型(`D06Progress`拡張)+`GEAR_TOTAL_TOOTH_COUNT`・`axleAngularVelocityRadS`(§7.3で新設)への依存。**再承認**: 要(人間再承認一覧D、§20.5)。

**R6(確定裁定、判定文§4)**: **候補b(累積曝露)を確定採用する。**理由: `toothFatigueExposureNmS`という単一の較正閾値で崩壊速度を直接制御でき、D05の`cumulativeSparkExposure`と同型の実装パターン共有により実装・レビューコストも低い。**候補d(歯噛合位相)は却下**——本書自身のD6是正解析(上記)どおり、高速域では`meshCrossingRateHz≈167`(1000rpm車軸・10歯)まで損失率が上がり、A3是正が求めた崩壊速度緩和を達成しない(むしろ候補bより速く崩壊しうる)。以降の§9.3・§9.4・§17.3は候補b確定を前提に統一する。

### 9.2 D06全損時の値域安全性(C4是正)

**問題**: `composeD06RuntimeEffect`(§9.3)が`toothLossCount===GEAR_TOTAL_TOOTH_COUNT(=10)`のとき`gearEfficiency=0`を生成すると、`vehiclePhysics.ts`のeta除算(199行`tResistReflected`・401行`eta`経由の411行`jEff`)で`Infinity`/`NaN`が発生する(§2.5実測確認)。

**是正設計**: D06全損(`toothLossCount===10`)は既存裁定により**同一eventでdestructionTerminalとなる**(`classifyTerminalModes`の`event.isTotalLoss`条件、既存実装済み)——**全損に到達した瞬間、そのstepの`RunOutcome`が確定し、以後一切の物理step・config合成が発生しない**という既存の終端契約(D01/D02等の他モードと同型、`finalizeDestructionRun`成立後はwrapperの戻り値`termination`が非nullになりgameStoreループが停止する)がそのまま適用される。したがって`composeD06RuntimeEffect`が**実際に呼ばれる時点では`toothLossCount`は常に0〜9の範囲**であり(全損したstepではeventが返るがそのstepの物理はまだ全損前の状態で計算され、次のstepは呼ばれない)、`gearEfficiency`が理論上0になることはない。

**テストでの固定**: (1)`toothLossCount=9`(全損直前)で`composeD06RuntimeEffect`が有限・正の`gearEfficiency`を返すことを直接assert。(2)`toothLossCount=9→10`へ至るstepで`advanceD06`が`isTotalLoss:true`のeventを返し、同一stepの`termination`が非nullになることを直接assert。(3)全損後、`composeD06RuntimeEffect`が二度と呼ばれない(=wrapperのループがそのstepで停止している)ことを、呼び出し回数のモックで確認する。

**M-1(vii)是正、クロスラン会計の負例(確定裁定、判定文§3、期待する赤を明記)**: (α)9歯損傷個体を§14.3でseedしたsnapshotからの走行で、走行内1本目の歯欠けイベントが`isTotalLoss:true`・`termination`非nullになることを直接assert——**現設計のままでは(seeding未実装のままだと)`isTotalLoss:false`となり本テストは赤になる**(これがM-1欠陥の検出証明そのもの)。(β)同fixtureで`applyGearDiff`(degradationApplication.ts)適用後の永続`toothLossCount`がちょうど10になり、既存の`Math.min(totalToothCount,...)`clampが実質発動しない(engine出力デルタ+永続値=10が厳密一致)ことをassert。(γ)M-1(ii)是正後の`applyWearToCarConfig`(§14.1)が、`toothLossCount=9`のwear入力に対し`gearEfficiency`を変えない(恒等)ことをassert——**§14.1是正前の実装では`×0.1`になり赤**(歯欠け因子削除の検出証明)。(α)(β)(γ)いずれもDoD(§22)へ反映する。

### 9.3 D06効率式(範囲安全化、M-1(vi)是正で契約0/1′/2の3レンジへ再定義)

**D5是正の核心**: v4は「finite/positiveならCarConfig既存範囲〈0.60〜0.95〉を満たす」と暗黙に扱っていたが誤りだった。base(0.60)×1歯欠け倍率(0.9)=0.54は既に既存コメント上のレンジ(0.60〜0.95)を外れる——複数の契約が意図的に異なるレンジを持つ別の契約として明示的に区別する必要がある。

**M-1(vi)是正(確定裁定、判定文§3)**: D5是正時点の2契約(base/runtime)分離では、§9.3が「base」と呼んでいた値が実際には「素材写像+WearState反映**前**」なのか「WearState反映**後**」なのかが曖昧だった(M-1(d)が指摘した契約矛盾はこの曖昧さに起因する)。是正: **3つのレンジを別の契約として明示的に区別する**。

**契約0: 素材写像出力(`composeConfigFromMaterials`が返す値、既存契約)**: `gearEfficiency∈[0.60,0.95]`。D06/D09・WearStateいずれの効果も含まれない、既存の素材写像レンジ(変更なし)。

**契約1′: Wear反映後base(`RunSnapshot.carConfig`、`applyWearToCarConfig`〈§14.1、M-1(ii)是正後〉適用後・D06/D09 runtime効果適用前)**: `gearEfficiency∈(0,0.95]`。**歯欠け由来の因子はここに含まれない**(M-1(ii)是正でapplyWearToCarConfigから削除済み)——含まれるのは`gearSeizureFraction`由来の因子(`GEAR_SEIZURE_EFFICIENCY_PENALTY=0.3`)のみ。最悪ケース下限は契約0の最小値(0.60)に`gearSeizureFraction=1.0`(全面かじり)を適用した`0.60×(1-1.0×0.3)=0.42`——**契約1′の下限は約0.42**であり、契約0の下限0.60を下回ることを明示的に許可する。**§12のbeginRun前検証は契約1′〈範囲`(0,0.95]`〉を用いる**(旧D5是正時点の「契約1=0.60-0.95のまま」という記述を置き換える——これが判定文M-1(d)の契約矛盾〈9歯損傷ギヤ装備でbeginRunが失敗する〉を解消する)。

**契約2: D06 runtime effective gearEfficiency(`composeD06RuntimeEffect`の戻り値、stepごとに動的に変わる、seeded歯欠けを含む)**: `0 < eta_effective <= base_eta`(`base_eta`は契約1′の値)という**より広いレンジ**を許容する契約とする——契約1′の下限(約0.42)を下回ることを明示的に許可する。下限の保証は「0より真に大きい」ことのみであり、これは§9.2の保証(`toothLossCount<=9`が常に成立、`efficiencyMultiplier>=0.1`)+§14.3のseeding(M-1(i))から`eta_effective >= 0.1 * base_eta_min >= 0.1*0.42 = 0.042`という具体的な下限が導かれる(契約1′の最悪ケース下限0.42を用いた試算——**M-1是正前の0.06〈契約1のまま0.60を使った試算〉ではなく、seeded歯欠け込みの最悪ケース0.042がG5較正sweepの実測対象**、判定文§3(vi)・§9(1))。

```ts
export type ComposeD06RuntimeEffectResult = { ok: true; carConfig: CarConfig } | { ok: false; reason: string };

export function composeD06RuntimeEffect(baseCarConfig: CarConfig, d06Progress: D06Progress): ComposeD06RuntimeEffectResult {
  const toothLossRatio = d06Progress.toothLossCount / GEAR_TOTAL_TOOTH_COUNT; // §9.2によりtoothLossCount<=9の
  // 呼び出しのみが実際に発生するため、この時点でtoothLossRatio<1(gearEfficiency>0保証)
  const efficiencyMultiplier = 1 - toothLossRatio;
  const gearEfficiency = baseCarConfig.gearEfficiency * efficiencyMultiplier;
  // 契約2(runtime effective)の範囲チェック——契約1′(base、M-1是正後は(0,0.95])ではなく、
  // 0<eta<=baseCarConfig.gearEfficiencyという意図的に広いレンジで検証する。
  if (!Number.isFinite(gearEfficiency) || gearEfficiency <= 0 || gearEfficiency > baseCarConfig.gearEfficiency) {
    // §9.2の保証が壊れた場合(呼び出し側のバグ等)の防御的チェック。理論上到達しない。
    return { ok: false, reason: `D06合成後のgearEfficiencyが範囲外です: ${gearEfficiency}` };
  }
  return { ok: true, carConfig: { ...baseCarConfig, gearEfficiency } };
}
```

**vehiclePhysics.tsがこの拡張レンジで有限・決定論的に動く証明**: `jEff`(411行)・`tResistReflected`(199行)のeta除算はいずれも`eta>0`のみを要求し、`eta>=0.60`という契約0/契約1′の下限を要求する数学的根拠は存在しない(既存コードのコメント上のレンジ`0.60–0.95`はゲームバランス上の設計意図〈素材選択の妥当なレンジ〉であって、数式が壊れる境界ではない)——**`eta_effective>=0.042`(M-1是正後、契約1′最悪ケース0.42×efficiencyMultiplier最小0.1、§9.2由来)である限り、既存の除算式は数学的に有限な値を返し続ける**(除算式自体は`eta`がどれだけ小さくとも、0でない限り有限)。これは実装前に数式から導出できる解析的な証明であり、sweepでの経験的確認とは別に本書へ明記する。

**9歯時の極小etaでの数値安定性(sweep DoD、解析的証明だけでは不十分な理由)**: 上記の証明は「有限であること」を保証するが、「数値的に安定した挙動になること」までは保証しない——`eta≈0.042`のような極小値では`jEff`・`tResistReflected`が非常に**大きな**有限値になり(除算の分母が小さいため)、既存のsemi-implicit積分が大きな加速度・力を生み出し、他の安全域(`gripMax`によるクランプ等)との相互作用で予期しない挙動(過大な空転判定・数値振動)を起こす可能性が理論上ある。**9歯損傷+seizureFraction最大という最悪ケース構成(`eta_effective≈0.042`)を明示的にsweepし、`stalled`/destructionTerminalとの競合(§9.2で全損は既にdestructionTerminal優先が保証されているが、9歯時点でもstalled等の別終端が先に来る可能性がある)・`jEff`増大による挙動の妥当性・数値振動の不在を実測で確認することをDoDへ追加する**(§17・§22、判定文§9(1)がG5の最初の手順として指定)。「finite/positiveなら安全」と断定せず、この実測をG5較正sweepの必須項目とする。

### 9.4 トルクリップル(C6是正、R7確定裁定で専用位相アキュムレータへ確定)

**v3の誤りの訂正**: 既存`K_VIB`(constants.ts:16)はmotorPhysics.ts内で`axisOffsetMm×omega²`から**乱数による**omega摂動を作る仕組みであり、CarConfigを一切読まない——「K_VIBと同型」という主張は誤りだった。また`vibrationAmplitude?:number`をCarConfigへ追加するだけでは消費箇所・エネルギー整合が未定義だった。

**是正設計**: トルクリップルを、新規CarConfigフィールドを追加せず、**既存`gearEfficiency`への周期的(決定論的)変調**として表現する。

**R7(確定裁定、判定文§4)**: **承認、ただし§9.1で候補b(累積曝露)が確定採用されたことに伴い、トルクリップル専用の噛合位相アキュムレータを新設する**——§9.1候補d(歯噛合位相トリガ、却下済み)が提供するはずだった`meshCrossingCount`は存在しないため、無償再利用はできない。`D06Progress`へ`meshPhaseAccumulator: number`(決定論的、rng非依存)を新設し、毎frame`|axleAngularVelocityRadS| * GEAR_TOTAL_TOOTH_COUNT * dt / (2 * Math.PI)`を積算する(歯数ぶんの噛み合わせが車軸1回転で起きるという既存の幾何関係、§9.1と同型の式)。トリガ判定(候補b、累積曝露)とは完全に独立した状態であり、D06の発火可否・崩壊速度には一切影響しない——純粋にリップル変調の位相源としてのみ機能する。
```ts
// composeD06RuntimeEffect内、既存gearEfficiency計算の直後に追加する変調項
const meshPhase = d06Progress.meshPhaseAccumulator % 1; // 0〜1、1歯噛み合わせ周期内の位相(決定論的、seedに依存しない純粋な回転幾何)
const rippleMultiplier = 1 - RIPPLE_AMPLITUDE * toothLossRatio * Math.sin(2 * Math.PI * meshPhase) * Math.sin(2 * Math.PI * meshPhase); // sin²で常に0以上1以下の減衰、負にならない
const gearEfficiency = baseCarConfig.gearEfficiency * efficiencyMultiplier * rippleMultiplier;
```
**単位・型**: `RIPPLE_AMPLITUDE`は無次元(§17数値候補)、`meshPhaseAccumulator`は`D06Progress`の新規フィールド(候補bのトリガ用累積曝露`cumulativeOverloadExposure`とは別の独立フィールド)。**消費箇所**: 既存`gearEfficiency`(vehiclePhysics.tsの既存フローがそのまま消費、新規消費箇所を作らない)。**エネルギー非増加**: `rippleMultiplier<=1`(`sin²`項は常に0以上のため`1-非負の値<=1`)、効率を下げる方向にのみ変調するためエネルギーを増やさない。**同一seedリプレイ**: `meshPhaseAccumulator`は`axleAngularVelocityRadS`(既存状態から決定論的に導出)の積分でありrngを一切使わないため、同一`RunSnapshot`からのリプレイは完全に決定論的。**0の恒等性**: `toothLossCount=0`(健全)のとき`toothLossRatio=0`、`rippleMultiplier=1-0=1`(恒等、既存回帰を破らない、R7の指定どおり回帰テストで固定)。**エイリアシングの明記(R7付帯)**: 噛合周波数(`meshCrossingRateHz`、最大約167Hz、§9.1)は物理タイムステップ120fpsのナイキスト周波数(60Hz)を超えエイリアスする——これは決定論的かつ有界(`sin²`により`0<=減衰<=RIPPLE_AMPLITUDE*toothLossRatio`、エネルギー非増加)であり正しさは損なわないが、「スペクトル忠実ではない」事実を実装コメントへ1行明記すること(R7指定)。**依存閉包**: `D06Progress.meshPhaseAccumulator`の新設は候補b確定(§9.1)と対で実装する(§18のrg依存閉包実測対象へ追加)。

## 10. ギヤ慣性J接続設計

### 10.1 問題の所在

`vehiclePhysics.ts`411行の反射慣性式`jEff = jMotor + (massKg*wheelRadius²)/(gearRatio²*eta)`は、ギヤ自体の回転慣性を独立項として持たない。spec §4.2「チタンは砕けない代わりに重い(J増で加速鈍化)」を実装するには新しい入力が必要。

### 10.2 等価質量案の撤回

「ギヤ慣性の等価質量を`massG`へ加算する」案は**非推奨**とする。`massG`は`jEff`の計算だけでなく、既存`stepVehicle`内の重力抵抗・転がり抵抗・法線力/グリップ限界の計算にも使われる——ギヤの回転慣性(回転運動エネルギーの蓄積)を車体の並進質量として注入すると、坂道の登坂性能・コーナー保持限界という回転慣性と無関係な物理量まで意図せず変化させてしまう。

### 10.3 推奨案: `CarConfig`への直接フィールド追加+actual→reflected変換式(C7是正)

```ts
// vehiclePhysics.ts(frozen core、変更を伴う)
export interface CarConfig {
  massG: number;
  gearRatio: number;
  gearEfficiency: number;
  wheelDiameterMm: number;
  tireGrip: number;
  axleFriction: number;
  wheelAlignmentMm: number;
  centerOfMassHeightMm: number;
  motorMountOffsetMm: number;
  gearReflectedInertiaKgM2?: number; // 新規、既定0。モーター軸換算済みのギヤ慣性(下記変換式参照)
}
```
```ts
// vehiclePhysics.ts、jEff計算式(411行付近)
const jEff = jMotor + (massKg * wheelRadius * wheelRadius) / (gearRatio * gearRatio * eta) + (carConfig.gearReflectedInertiaKgM2 ?? 0);
```

**actual→reflected変換式(C7是正)**: §2.7・§7.4の実測により、本ゲームのギヤは単一の集約ギヤ比モデルであり、ギヤ(および紐付くbearing)は車軸側に位置する。既存の`jEff`式が車体質量`massKg`を`massKg*wheelRadius²/gearRatio²`という形でモーター軸へ反射しているのと同じ位置(車軸側からモーター軸への反射)にギヤが存在するため、**ギヤの実際の慣性`J_gear_actual`(ギヤ自身の軸で計測した値)も同じ`1/gearRatio²`則で反射する**:
```
J_gear_reflected = J_gear_actual / (gearRatio²)
```
**etaの関与について(R13確定裁定、判定文§4)**: 既存の質量反射項は`/(gearRatio²*eta)`(効率で追加除算)だが、`jMotor`自体(モーター軸上の慣性)は`eta`で除算されない。ギヤの回転慣性は「回転運動エネルギーの蓄積」であり、`eta`が表す「力の伝達効率損失」とは異なる物理現象であるため、質量反射項と同じ`/eta`を適用すべきか、`jMotor`と同じく`eta`を適用しないべきかは物理的に自明ではなかった。**R13は`/eta`を適用しない式(上記、`J_gear_reflected = J_gear_actual/gearRatio²`)を確定採用する**——慣性(エネルギー貯蔵)はetaが表す散逸と物理的に別物であり、質量項は走行中も`carConfig.gearEfficiency`(D06でstep毎に変動)を参照して自然に追従するのに対し、`gearReflectedInertiaKgM2`はcapture時固定のスカラーであるため、etaを焼き込むとD06劣化時に「古いeta」が固定される不整合を生む。実装コメントへ「質量項の/etaと意図的に異なる」旨とR13参照を1行残すこと。

**どの軸へ反映済みのJか**: `gearReflectedInertiaKgM2`という名前自体が「モーター軸(reflected)から見た慣性」であることを明示する——既存`effectiveInertia`パラメータの命名規約(motorPhysics.ts:414-416)と同型。**既定0でV2回帰を保つ**: 既存の全テスト・全既存configはこのフィールドを指定しないため`?? 0`により既存の`jEff`計算式と完全に同一の結果になる。

### 10.4 J数値の導出設計(共通幾何+密度純関数、pending密度の扱い)

```ts
// src/materials/gearInertia.ts(新設)
// assumedGeometry.tsと同型の設計原則: ギヤの共通幾何(全ティア共通の設計仮定値)を
// 導入する。現行assumedGeometry.tsはgearを明示的に除外しており(同ファイル16-18行)、
// 本ファイルが初めてこの空白を埋める。判定文§9(5)により候補値として全数承認済み
// (確定はG5 sweep実測+人間commit承認、Q15-1恒久規則)、人間再承認は§20.5-Gに含まれる。

/** ギヤを一様円板として近似する設計仮定値。判定文§9(5)で候補承認済み(§20.5-G)。 */
export const GEAR_ASSUMED_RADIUS_M = 0.008; // §17数値候補
export const GEAR_ASSUMED_THICKNESS_M = 0.003; // §17数値候補

export type GearInertiaResolution = { ok: true; value: number } | { ok: false; reason: string };

/**
 * 一様円板の回転慣性(ギヤ自身の軸上、reflectedではなくactual) J_actual = (1/2)×mass×radius²。
 * massは密度×体積(円板体積=π×r²×厚み)。gear.densityがpending(未検証)の場合は
 * 明示的に失敗を返す(assumedGeometry.tsのresolveDensityと同型の規律、黙って代用しない)。
 */
export function resolveGearActualInertiaKgM2(gear: GearMaterial): GearInertiaResolution {
  if (!gear.density.verifiedForPhysics) {
    return { ok: false, reason: `${gear.id}: 密度が未検証(pending)のためJを計算できません(${gear.density.reason})` };
  }
  const volumeM3 = Math.PI * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_THICKNESS_M;
  const massKg = gear.density.value * volumeM3;
  return { ok: true, value: 0.5 * massKg * GEAR_ASSUMED_RADIUS_M * GEAR_ASSUMED_RADIUS_M };
}

/** actual J(§10.4上記)をreflected J(§10.3の変換式)へ変換する。 */
export function resolveGearReflectedInertiaKgM2(gear: GearMaterial, gearRatio: number): GearInertiaResolution {
  const actual = resolveGearActualInertiaKgM2(gear);
  if (!actual.ok) return actual;
  return { ok: true, value: actual.value / (gearRatio * gearRatio) };
}
```
**pending密度への裁定確定(R14、判定文§4)**: `gear-pom`・`gear-nylon-pa6`・`gear-titanium`の3種(4種中3種)は密度が**pending**(§2.6実測確認)。`resolveGearActualInertiaKgM2`はこれら3素材で`ok:false`を返す。**R14は次の優先順序を確定する**: **(c)を第一手**——titanium(Ti-6Al-4V級)・POM・PA6の一次資料検証をG3内で試みる。**(a)を代替**——検証不能な素材は既存`wire-silver-plated-copper`前例と同型の明示的`designAssumption`(候補出典コメント付き)で接続する。**(b、接続見送り)はPOM/PA6に限り許容し、titaniumへの適用は不可**——spec §4.2「チタンは砕けない代わりに重い」はtitaniumの存在意義そのものであり、J未接続はnonBreakableだけが残る一方的優位を作り§1.2縮退戦略回避に反するため。付帯条件C-8(効果量の正直な報告)とセットで運用する。`gear-peek`(verified、1300kg/m³)のみが即座に`ok:true`を返せる。**この問題(actual→reflected変換式そのものの設計、C7)は、pending密度問題(A10、数値の入手可能性)とは別の、先行して解決すべき設計問題である**——変換式自体が定義できなければ、密度が仮に全てverifiedであってもJ接続は実装できない(R13が変換式自体を確定済み)。

## 11. production先行配線の露出制御(feature gate設計、C12・D8・E5是正、既存singleton状態への相乗り方式)

### 11.0 是正の経緯(D8→E5の2段階)

**v4の誤り(D8)**: `export const DESTRUCTION_PRODUCTION_WIRING_ENABLED = false`という真の定数(再代入不可能)を、テスト専用setter関数で書き換える設計を提案しており自己矛盾していた。

**v5の誤り(E5、依存注入factory案の現実的破綻)**: D8是正でv5は`createGameStore(destructionWiring)`というfactory方式(store生成時に値を注入、instance単位で独立)へ切り替えたが、これは現行実装の実態と乖離していた——実測確認: `useGameStore = create<GameStore>()(...)`(gameStore.ts:251)は**module-levelの単一singleton**であり、factoryではない。gameStore.ts内部は`useSaveStore`/`useNotebookStore`という**別の2つのsingleton**を直接6箇所で参照する(実測)。さらに`useGameStore`自体を直接参照するファイルはリポジトリ全体で**25ファイル**存在する(実測)。`createGameStore({productionWiringEnabled:true})`で独立instanceを作っても、その内部が引き続き既存のsave/notebook**singleton**を参照する限り、真に独立したテストにはならない——v5の「各テストが完全に独立」という主張は現状のアーキテクチャでは成立しない。

**是正方針(E5是正、既存singleton公開面を変えない最小侵襲案を採用)**: `useGameStore`をfactory化する全面改修(25ファイルへの波及+save/notebook singleton分離という二重の大工事)は行わない。代わりに、**`productionWiringEnabled`を`GameStore`の状態(state)の一部として追加する**——既存の25ファイルが依存している「単一のsingleton `useGameStore`」という公開面は一切変えない。

### 11.1 single source(既存Zustand storeの状態として)

```ts
// src/store/gameStore.ts(brabit所有)、既存のGameStore型・useGameStore singletonへ追加
export interface GameStore {
  // ...既存の全フィールド・action(無変更)
  productionWiringEnabled: boolean; // 新規、既定false
}

export const useGameStore = create<GameStore>()((set, get) => ({
  // ...既存の全フィールド・action初期値(無変更)
  productionWiringEnabled: false, // 既定値、production起動時はこのまま
  // 既存のstepCourseRun等のaction内部が、get().productionWiringEnabledを読んで
  // if/else分岐する(§11.4)。
}));
```
**唯一のowner**: `productionWiringEnabled`は`GameStore`という既存の単一state木の一部であり、他のいかなる場所にも複製されない。**setterは既存のZustand標準API(`useGameStore.setState({productionWiringEnabled:true})`)のみを使う**——D8が問題視した「専用の秘密setter関数」を新設しない。これはconstの書き換えではなく、Zustand storeの通常のstate更新であり、他の既存stateフィールド(例えば走行状態等)と全く同じ扱いを受ける——**「書き換え可能なstate」という設計自体はGameStore全体が既に持っている性質であり、`productionWiringEnabled`だけが特別ではない**(D8の自己矛盾を、特別な仕組みなしに解消する)。

### 11.2 テスト環境での切替方法(F3是正、実測に基づく明示的reset設計)

**依存閉包(E5是正、実測)**: `useGameStore`を直接参照する既存ファイルは25件(`grep -rl "useGameStore"`実測)。**F3是正、v6の未検証の仮定を撤回**: v6は「既存25ファイルは何らかの分離規律を持っているはず」と未確認のまま書いていたが、実際に主要な2テストファイルを確認したところ、**全体一括resetの規律は存在しなかった**——`src/store/__tests__/gameStore.test.ts`は`beforeEach`自体を持たず、各テスト内で個別に`useSaveStore.setState(...)`/`useGameStore.setState({testRunPhase:'running'})`等、そのテストに必要な範囲だけを都度設定する方式。`src/store/__tests__/testRunStore.test.ts`は`beforeEach`(41行)を持つが、`courseProgress`・`testRunCompleted`・`courseRunSpeed`という、そのファイルのテスト対象に関係するフィールドのみを個別にresetしており、GameStore全体の一括resetではない。**したがって`productionWiringEnabled`は、いずれの既存`beforeEach`からも自動的にresetされない**——専用のreset処理を明示的に追加する必要がある。

**是正設計(具体的なテストファイル・reset方式を確定)**: G1cのtrue経路統合テストは、新設の専用テストファイル`src/store/__tests__/destructionWiring.test.ts`(alice+brabit共同、production経路統合確認専用)に置く——既存`gameStore.test.ts`/`testRunStore.test.ts`へ混在させない(それぞれのファイルが対象とする既存スコープを汚染しないため)。このファイルは既存2ファイルと同じ「そのファイルのテスト対象に関係するフィールドのみ個別にreset」という既存の慣習(testRunStore.test.tsのbeforeEachパターン)に従い、次のreset処理を持つ:

```ts
// src/store/__tests__/destructionWiring.test.ts(新設)
beforeEach(() => {
  useGameStore.setState({ productionWiringEnabled: false }); // 各テスト開始前に明示的にfalseへ
});
afterEach(() => {
  useGameStore.setState({ productionWiringEnabled: false }); // VitestのafterEachはテスト失敗・
  // throw時にも実行される既存保証を利用し、trueのまま後続テストへ漏れることを防ぐ。
});
```
**save/notebook singletonへの結果書き込みを伴う統合テストでの再利用**: G1c統合テスト(既存6モードがproduction経路で発火することの確認)は、走行結果を`useSaveStore`/`useNotebookStore`へ実際に書き込むため、これら2つのsingletonについても既存のfake storage/lease初期化機構(既存`saveStore.test.ts`・`testRunStore.test.ts`が使っている既存パターン、実装時に該当箇所を確認し再利用する)を同じ`beforeEach`/`afterEach`内で呼び出す——`productionWiringEnabled`専用のreset処理と、既存のsave/notebook初期化処理を並置する形にし、新しいstorage分離機構は発明しない。

**false経路/true経路の順序非依存性(DoD)**: `destructionWiring.test.ts`内のtrue経路テストと、他の既存テストファイル(false経路を暗黙に前提とする既存テスト群)を、Vitestのデフォルト実行順とは逆順で実行しても結果が変わらないことを、CI設定またはテストスクリプトで確認する項目としてDoDへ追加する(§22)——`afterEach`によるreset処理が実際に機能していることの実証的な裏付けとする。

**factoryが注入する範囲(E5是正、正確な境界)**: `productionWiringEnabled`という1つのbooleanのみがGameStore stateに追加される。**save/notebook依存は変更しない**——`useSaveStore`/`useNotebookStore`は引き続き既存のsingletonのまま、gameStore.ts内部からの参照方法も無変更。これはfactory化ではなく、既存stateへの1フィールド追加のみであるため、save/notebookとの独立性という論点自体が発生しない(v5のfactory案が抱えていた問題が、この設計では最初から存在しない)。

**production singleton `useGameStore`の公開面**: 完全維持(無変更)。既存の25ファイルはコード変更不要。

**false固定の検証(ソース文字列走査に頼らない実挙動での固定)**: production起動後の実際のgameStore state(`useGameStore.getState().productionWiringEnabled`)が`false`であることを、起動後のE2E的なテスト(実際にstoreを初期化した状態を読む)で確認する——ソースコード中の初期値`false`という文字列を探すのではなく、実際に生成されたstoreインスタンスの実行時state値を読むことで、初期化ロジックのどこかで誤って上書きされていないかまで含めて検証する。

### 11.3 G1a/G1b/G1c〜G統合との対応関係(E8是正、§3.1と明示的に対応付け)

**§3.1のゲート表との対応(H1是正でG7の位置を反映)**: G1a(alice、assembler等の純関数実装)はこの節と無関係(production先行配線の露出制御はgameStore.ts、brabit所有領域のみに関わる)。**G1b(brabit、gameStore配線をoffフラグ下で実装)がこの節の対象そのもの**——`productionWiringEnabled:false`のまま、`stepTrackRunWithDestruction`等の呼び出しコードを`if(get().productionWiringEnabled){...}else{...}`の分岐内に実装する。**G1c(alice+brabit共同、統合確認)**は、テストコードが`useGameStore.setState({productionWiringEnabled:true})`を呼んだ状態で既存6モードがproduction経路で発火することを確認する(§11.2のtrue側統合テスト)。**G2〜G6**は同じ`productionWiringEnabled`state(既定false)の下でD06/D09等の追加実装を進める。**G7(H1是正でG統合の前へ移動、brabit主導のUI/HUD/演出/a11y実装)も同じ`productionWiringEnabled`既定falseの下で行う**——G7完了時点でも、G1c同様test限定でのtrue切り替えによる統合確認のみ行い、production既定はfalseのまま維持する。**G統合**でproduction起動時の初期値を`false`から`true`へ切り替える(engine+UI双方の実装がG7まで完了して初めてこのcommitを行う)。

**G1〜G6期間中(G1c以外)のfalse維持確認**: production起動後の`useGameStore.getState().productionWiringEnabled`が`false`であることを、§11.2の実挙動テストで固定する。

**G1cでの統合確認**: `useGameStore.setState({productionWiringEnabled:true})`を呼んだ後、既存6モード(D01〜D05・D07)がproduction経路(assembler+wrapper置き換え、§4・§8)で発火することを確認する——実際に同じsingleton上でtrueへ切り替えて検証するため、モックではなく実経路の証明になる(C12指摘の要求を満たす)。

**G統合での切り替え**: `useGameStore`の初期state定義(gameStore.ts、`create<GameStore>()((set,get)=>({...,productionWiringEnabled:false,...}))`)の`false`を`true`へ書き換える単一commitとする——この1行diffが、G統合そのものを表す機械的に識別可能な変更になる。

**G統合完了後の扱い(D8是正+E5是正、コード変更を伴う明示的cleanupゲートへ訂正/H1是正でG9をG統合〜G8間の正式ゲートとして確定)**: **v5の誤り**: 「次のdocs-onlyクリーンアップステップ」と書いていたが、`productionWiringEnabled`フィールド・関連する全if/else分岐の削除は**production/testコードの変更そのもの**であり、docs-onlyではありえない(E5指摘)。是正: G統合の後続作業として、**Phase 3完成前の明示的なcode cleanupゲートG9**(§3.1で正式なゲートとして確定、H1是正)を経て、(1)`productionWiringEnabled`フィールドおよび関連if/else分岐を削除、(2)`createGameStore`という誤った旧設計名の残骸がないか確認、(3)削除後に`npm run test && npm run build && npm run lint`を再実行、という工程を経る。これは通常のP3-4実装ゲート(G1a〜G統合)と同じ扱いのcode変更ゲートであり、docs-onlyの範疇では完結しない。**G9はG統合とG8(最終コードでの人間試遊)の間に位置する**(§3.1)——人間試遊はgateコードが削除された最終形のコードに対して行う。

### 11.4 新旧wrapper移行/二重step防止

`productionWiringEnabled`が`false`の間、gameStore.tsは既存の非destruction経路(`stepTrackRun`直接呼び出し等)のみを実行し、`stepTrackRunWithDestruction`等は一切呼ばれない(呼び出しコード自体はG1b/G2で実装されるが、`if (get().productionWiringEnabled) {...} else {...}`という排他分岐の内側に置かれ、falseの間は実行されない)。**二重step(新旧両方が同一frameで物理を進めてしまう)は、この分岐がif/elseの排他構造であることで構造的に防止する**(両方を呼ぶ設計にしない、実装時のコードレビューで確認)。

## 12. runtime compose失敗の構造的排除(C13是正、arbiter補足裁定Q3・Q4・Q5で二層命名+resolver+baseline+合流契約を反映)

**二層命名(arbiter補足裁定Q3)**: 本書は以降、「base config」という語を次の2層に区別する。**`rawPlayerConfig`**: gameStore.config/carConfig系統——V2スライダー・プリセット・recipe(recipeCode.ts経由)・診断由来の全8系統+`useSaveStore.subscribe`同期(`docs/phase3-plan-v12-amendments.md`のP3-4-S1〜S10エントリ「指摘1」参照)。素材選択を一切知らない。**`materialComposedBase`**: `composeConfigFromMaterials(rawPlayerMotorConfig, rawPlayerCarConfig, baseline, selection)`の出力(Wear反映**前**)。§13.1・§13.2・§14.2でこれまで「base MotorConfig/CarConfig」と無区別に記述していた箇所は、いずれも`materialComposedBase`を指す。

**production単一出典契約(arbiter補足裁定Q3(i))**: `rawPlayerCarConfig`は**beginRun時の`resolveGarageBuild(garageSelection)`単一呼び出し結果**とし、gameStore.carConfig現在値を直接読まない——`setLabCarConfig`/`setDiagnosisCarConfig`等で乖離しうるcarConfigとgarage選択の「別の事実」混入を構造的に排除する(帰結: V2ラボ/診断モードの直接編集値は素材走行の実効configへ影響しなくなる。**ゲームプレイ可視の挙動変更のため人間再承認項目Pに含む**、`docs/phase3-p3-4-human-reapproval-bundle.md`)。`rawPlayerMotorConfig`はgameStore.config(巻線・組立由来のplayer-adjustable値)を単一読取りする。

**`selection`/`equipmentContext`/`materialComposedBase`の単一出典(arbiter補足裁定Q1・Q3(ii)(iii))**: `selection`・`equipmentContext`はG1a′ resolver(§4.4、`deriveMaterialSelectionFromEquipment`相当)の単一呼び出し結果。`recipeKey=computeRecipeKey(selection, materialComposedBase両config)`(§13.2)、`DestructionConfig=assembleDestructionConfig(selection, equipmentContext)`(§4)、`RunSnapshot.motorConfig/carConfig=materialComposedBase`へのWear反映結果(§14)——**すべて同一の`selection`実体・同一の`materialComposedBase`実体から派生する**。motor-only文脈でも`materialComposedBase`は両config導出し、`RunSnapshot.carConfig`のみ既存契約どおりnull(`computeRecipeKey`は非null CarConfig必須のため、composed carConfigをキー計算へ用いる——同一ビルドのmotor-only/vehicle走行でキーの素材・巻線部分が一貫する)。

**`MaterialCompositionBaseline`のproduction単一出典(arbiter補足裁定Q4)**: `chassisBaselineG := resolveChassisBaselineG(cellSelection)`(§5.2既存の凍結関数、`cellSelection`は`rawPlayerMotorConfig.batteryVoltage`(1.5|3.0)からの全域写像で導出、`resolveGarageBuild`のchassis側は使わない)。`baseGearEfficiency := resolveGarageBuild(garageSelection)`結果の`gear.gearEfficiency`(0.9/0.8/0.74、gearRatioを供給するのと同一の単一呼び出し結果)。この構築はalice所有の単一純関数(G1a′、配置はレイヤリング規則内でalice裁量)へ集約し、テスト・sweepを除く全productionコードで、この関数以外が`MaterialCompositionBaseline`リテラル構築・`resolveChassisBaselineG`直接呼出しを行わないことをrg/import監査テストで固定する(構造テスト、C-10と同型)。recipe load時、recipeCode.tsは素材選択をencodeしない既存設計のため、素材走行の出典になり得ない——`loadCarRecipe`が再構築するのは`rawPlayerConfig`+近似`garageSelection`のみであり、以後の素材走行はその近似`garageSelection`を単一出典として整合的に走る(gearRatioとbaseGearEfficiencyが同一プリセット行から出るため内部矛盾は構造的に生じない、静かな不一致は生じない契約)。

**設計**: `beginRunAction`/`RunSnapshot` capture時点(走行開始前、gameStore.ts側)で、`assembleDestructionConfig`が生成した`DestructionConfig`+`applyWearToMotorConfig`/`applyWearToCarConfig`(§14)適用後の実効`MotorConfig`/`CarConfig`について、既存の`validateDestructionConfig`(destructionOrchestration.ts、既存関数)と同型の完全な範囲検証を行い、**不正な値が検出された場合は`RunSnapshot`自体を作らずbeginRun自体を失敗させる**(既存の`ApplyRunOutcomeError`的な事前ゲートと同型)。**M-1是正(判定文§3(vi))**: この検証が`gearEfficiency`へ適用するレンジは§9.3の**契約1′**(`(0,0.95]`、歯欠け因子を含まないWear反映後baseの契約)であり、素材写像そのままの契約0(`[0.60,0.95]`)ではない——9歯損傷ギヤを装備した次走行のbeginRunが、契約0のレンジ検証によって誤って失敗しないようにするための明示的な区別である。検証対象の`carConfig`は、§14.1(Wear反映)→§14.3(D06 seedingは`initialDestructionState`側のみを更新するため`carConfig`自体には影響しない)を経た後の値。

**beginRun不開始への合流(arbiter補足裁定Q5)**: 新規`BeginRunConfigError`型は設けない。G1a′ resolver失敗(§4.4)は既存の`missingRole`腕(`{ok:false, reason, missingRole}`)へ、baseline構築/`composeConfigFromMaterials`失敗/本節の有限性検証失敗は既存の`{ok:false, reason: string}`腕へ合流する(UI計画§6.4.1の既存行と同型)。理由: 消費者(UI)は全configエラーで同一挙動(run不開始・reason表示・ローカル状態不変)であり、第三のエラー契約層は判別の需要なく複雑さのみ足す。条件: (i)各失敗経路のreasonは相互に区別可能な日本語定型文(単位省略禁止)とし、経路別負例で固定する。(ii)**失敗時不変条件**「`saveMeta.nextRunSequence`不変・`pendingRunEquipmentSnapshot`不変・`RunSnapshot`/`RunAccumulator`不生成・gameStoreローカルruntime state不変」をconfig系全失敗経路でテスト固定する(config構築失敗がrunSequence消費後に起きてsequenceを浪費する実装を禁止する——構築順序で保証すること)。**検証時期(arbiter追加裁定Q9、§20.9)**: この不変条件の実測はbeginRunActionへの統合を要するため**G1bの必須DoD**とする(S-5)。G1a′では、これを構成する純関数(resolver・baseline構築関数・compose)が副作用を持たないこと(純関数性)のみを先取りして固定する。契約の内容・値・型は本裁定により一切変更しない。実装中に判別union化の実需要(UIが経路で分岐する等)が生じた場合は、P3-3-Q15-4先例に照らした追加裁定を要求してよい(無断導入は不可)。

**相互参照(arbiter追加裁定Q10 §8+同§8補足裁定、2026-08-18)**: 本節の有限性検証のうち、`materialComposedBase`(Wear適用前のbase config)側をbeginRun経路で担う純関数`validateMaterialComposedBase`(`src/materials/recipeKey.ts`、alice所有、新規)の設計確定内容は`docs/phase3-p3-4-q10-alice-design-v2.md`(提出原文+追補)を参照。本節の契約・値・型に変更はない。

**帰結**: 一度`RunSnapshot`が正常に作られたら、その`motorConfig`/`carConfig`は既に検証済みの妥当な値であることが保証される。§9.3の`composeD06RuntimeEffect`・§7.8の`composeD09RuntimeEffect`が受け取る`baseCarConfig`は常にこの検証済みの値であり、**有効な状態(`D06Progress`/`D09Progress`が§9.2等の既存契約を満たす)+有効なconfigの組み合わせからは、これら合成関数が`ok:false`を返すことは理論上ない**——これを実装時にproperty-based testやテーブル駆動テストで固定する(有効な入力の直積に対し常に`ok:true`を返すことを確認)。

**RunOutcome.endReasonへの架空`configError`追加は行わない**(C13は「架空のconfigErrorを足すのか、beginRunで排除するのか」の二択を提示していたが、本書は後者〈beginRunでの構造的排除〉を採用する——走行中に発生しうる終端理由は既存の物理的な終了理由〈finished/stalled/derailed/overheated/energyExhausted/manualAbort/destructionTerminal〉のみであり、「config自体が壊れていた」という状況はそもそも走行が始まる前に排除されるべき異常系であって、走行結果の一種として扱うべきではない)。**走行途中での沈黙停止・stalledへの偽変換・partial applyの禁止**: 上記の設計により、走行開始後は合成関数の失敗が理論上発生しないため、これらの異常系は構造的に発生しない契約となる。§8.2の`throw`は、この契約が破れた場合(実装バグ)の最終防衛線として残すが、正常な運用フローでは到達しない。

## 13. `recipeKey`設計(C8是正、RunSnapshot唯一出典契約との矛盾を解消、D1・D2追加是正)

### 13.1 矛盾の解消方針

**問題**: `RunSnapshot.motorConfig`/`.carConfig`はリプレイが実際にstepで使うconfigの唯一出典であり(P3-1-Q9)、P3-4でWearを実走行へ反映する以上、`RunSnapshot`が保持するconfigは**Wear反映後の実効config**でなければリプレイが不正直になる(実際に走った状態と異なる状態がリプレイされてしまう)。一方`recipeKey`は「同一レシピ」を判定するための識別子であり、Wear(個体の劣化)を含めるべきではない——**同じ`RunSnapshot.motorConfig`フィールドを両方の用途に使おうとすると矛盾する**。以下「base config」という語は§12で確定した二層のうち`materialComposedBase`(Wear反映前、`composeConfigFromMaterials`の出力)を指す(arbiter補足裁定Q3)。

**是正方針(D2是正、選択肢(a)採用)**: `recipeKey`を`RunSnapshot`へ**独立フィールドとして**追加する(motorConfig/carConfigとは別枠、物理stepは一切読まない派生メタデータ)。理由: `RunSnapshot`は既にP3-1-Q9により「走行開始時に確定する構成情報の唯一出典」として`RunAccumulator.replaySnapshot`→`RunOutcome.replaySnapshot`という既存の搬送経路(destructionOrchestration.ts:66,131で確認済み)を持つ——`contractVersion`のような、物理stepが一切参照しない純粋なメタデータフィールドが既にRunSnapshotに同居している前例(destructionOrchestration.ts:484)と同型に、`recipeKey`もこの既存搬送経路へ相乗りさせることで、**新しい並行搬送経路を作らずに済む**(RunAccumulator/RunOutcome/RunApplicationEnvelopeへ個別にfield追加する選択肢(b)は、既存のRunSnapshot搬送経路と機能的に重複する新経路を作ることになり、P3-1-Q9が禁じる「同じ事実を複数経路から入力できる」構造を招く恐れがある)。

```ts
// src/engine/destructionOrchestration.ts、RunSnapshotへ追加(既存フィールドは無変更)
export interface RunSnapshot {
  contractVersion: number; // 既存。RUN_SNAPSHOT_CONTRACT_VERSION(destructionOrchestration.ts:499)は
  // 現行2(ゲート6でcourseLengthM/slopeRad追加のため1→2、既存コメントで確認済み)。recipeKey追加は
  // **2→3**(E3是正、v5の「1→2」は現行versionを誤認していた)。
  motorConfig: MotorConfig; // 既存、Wear反映後の実効値(変更なし)
  carConfig: CarConfig | null; // 既存、Wear反映後の実効値(変更なし)
  // ...既存の他フィールド(destructionConfig/runContext/initialMotorState/
  // initialVehicleState/track/courseLengthM/slopeRad/seed/initialDestructionState)は無変更
  recipeKey: string; // 新規。Wear反映**前**のmaterialComposedBase(§12二層命名、
  // arbiter補足裁定Q3)から走行開始前に1回計算したopaque文字列。物理stepは一切読まない。
}
```

**v2→v3(RunSnapshotの既存local storage契約)の扱い(E3是正)**: production配線前の現時点でも、`restoreRunSnapshot`のraw validator(destructionOrchestration.ts:957)は`contractVersion`の不一致を`{ok:false,reason:'unsupportedContractVersion'}`として拒否する既存契約を持つ。P3-4時点では実ユーザーのsnapshotデータ(production配線がまだ存在しないため)は存在しないと判断できるため、**v2形式のsnapshotをmigrationせず、`unsupportedContractVersion`によりそのまま非救済とする**(明示的なmigration機構は導入しない、既存のversion不一致拒否契約をそのまま適用するだけ)。DoDへ、restore/capture双方でversion 3が正しく扱われること、および不正なversion(1・2・4等)がいずれも`unsupportedContractVersion`で一貫して拒否されることのテストを追加する(§22)。

**M-1(iv)是正(確定裁定、判定文§3)**: 上記のcontractVersion検証に加え、`restoreRunSnapshot`のraw validatorへ「`initialDestructionState.modes.D06.toothLossCount`は0以上`gearTotalToothCount`(=10)**未満**の整数」という交差不変条件検証を追加する(§14.3のseedingが生成する値の不変条件と対をなす検証——全損個体〈`toothLossCount>=10`〉は§15の装備拒否〈M-1(v)〉により走行開始前に排除されるため、この範囲を外れたsnapshotは常に`invalidSchema`として拒否してよい)。既存の`validateD06ProgressShape`(destructionModes.ts:781-804、個別フィールド型チェックのみ)へこの交差不変条件を追加する形で実装する(§18の依存閉包へ追加対象として記載する)。

**実装配置の注記(P3-4 G6実装時の実測、docs-only是正)**: 上記の「`validateD06ProgressShape`へ追加する」という記述は**採らない**——実装配置は**§16.3の重複防止規定を優先し、`restoreRunSnapshot`の`initialDestructionState`専用位置とする**。理由は実測による: `validateD06ProgressShape`は`validateDestructionStateShape`経由で**`finalDestructionState`(走行終了時点)の検証にも共用されており**、そこへ交差不変条件を入れると全損記録(`toothLossCount===10`)を誤って拒否する。これは§16.3が明示的に禁じている「両者を同一のvalidator呼び出しへ混在させる」形そのものである。§16.3・契約・productionコードの他の記述は変更していない(本注記は既承認内容の文書整合であり、新しい設計判断を含まない)。

**exact transport(E4是正、beginRun capture→履歴保存までの完成契約、5点)**:

1. **計算はbeginRun時に1回のみ**: `beginRunAction`(gameStore.ts、brabit所有)内で、Wear反映**前**のbase `MotorConfig`/`CarConfig`(§14の`applyWearToMotorConfig`/`applyWearToCarConfig`を適用する直前の値)+装備中の`MaterialSelection`(R2確定)から`computeRecipeKey(selection, baseMotorConfig, baseCarConfig)`を呼び、文字列を得る。同じタイミングでWear反映を適用し実効config(Wear反映後)を得て、両方を`captureRunSnapshot`(既存関数、`recipeKey`引数を追加する破壊的シグネチャ変更)へ渡し`RunSnapshot`を構築する。

2. **`RunSnapshot.recipeKey`をrun中/pending中の権威値とする**: `createRunAccumulator(replaySnapshot)`→`finalizeRun`/`finalizeDestructionRun`(既存、無改修)が生成する`RunOutcome.replaySnapshot.recipeKey`まで、既存の`replaySnapshot`搬送経路(P3-1-Q9)にそのまま乗る。走行中〜pending中(`RunApplicationEnvelope.outcome.replaySnapshot.recipeKey`、`pendingApplication`永続化を含む)は、この値を唯一の権威値として扱う。

3. **`PendingNotebookRecord`構築時は一方向複写**: `notebookRecord`(§16のExperimentSession/VehicleTestRunNotebookRecord/CourseRunNotebookRecordいずれか)は`recipeKey: string`を**必須フィールドとして持つ**(§16.1のLegacy union設計を、`finalDestructionState`と同様に`recipeKey`にも適用する——事前P3-4の過去recordは両フィールドとも持たないため、`LegacyXxx`型は`Omit<T,'finalDestructionState'|'recipeKey'>`として定義し直す、§16.1改訂)。builder(§16.5の3専用builder関数)が`outcome.replaySnapshot.recipeKey`から`record.recipeKey`へ**一方向に複写する**処理を担う——呼び出し側(brabit)が別の`recipeKey`値を独自に渡せるAPIは提供しない(builderの引数に`recipeKey`を含めず、`runOutcome`から内部で読む設計とする)。

4. **apply/retry後は各notebook record自身の`recipeKey`が永続履歴の権威値**: 一度`notebookStore`/`saveStore`へ保存された後は、`RunSnapshot`(replaySnapshotごと)は永続化されない(`appendNotebookRecord`は`PendingNotebookRecord.record`のみを履歴へ保存する既存契約、E4実測確認)——**保存後は`record.recipeKey`自身が権威値となり、`RunSnapshot`を再参照する経路は存在しない**。`RegressionObservation.recipeKey`(regressionDiff.ts)はこの永続化済み`record.recipeKey`から導出する。UI/brabit側は`computeRecipeKey`を**再呼出ししない**(§19.3改訂)。

5. **legacy recordの扱い**: `recipeKey`を持たないlegacy record(`LegacyXxx`型)は、判別可能なunionの一方としてそのまま扱う——`pastObservations`(regressionDiffのbaseline候補集合)を構築する際、legacy recordは`recipeKey`を持たないため**baseline候補から構造的に除外される**(型レベルで`recipeKey`必須の`Stored...`の`Legacy`でない側のみを対象にする、フィルタ処理はbrabit側の`RegressionObservation`構築コードが担う)。

**P3-1-Q9との関係**: `RunSnapshot.recipeKey`(run中/pending中の権威値)から`record.recipeKey`(永続履歴の権威値)への移行点は明確に1箇所(builder関数内の一方向複写)のみであり、複数経路からの独立入力は存在しない——P3-1-Q9の原則(「同じ事実を複数経路から入力できると静かな不一致を作れる」)に抵触しない。**人間再承認要否**: `RunSnapshot`への破壊的フィールド追加(`recipeKey`必須追加)+`contractVersion`のインクリメント(2→3)+notebook record 3腕への`recipeKey`必須フィールド追加は契約変更であり要(R1・R2、§20.5-A)。

### 13.2 exact field list・固定順・数値表現規則(D1是正、ブラシ比率2件を追加、R2確定で素材ID5フィールドを先頭へ追加)

**R2是正(確定裁定、判定文§4)**: `recipeKey`へ素材ID(`MaterialSelection`の5フィールド)を含める。理由: (i)数値タプルの偶然一致(例: 効率ratioが同値の異素材)時に破壊特性〈D06閾値等〉が異なる走行が同一baselineへ混入する曖昧さを構造的に排除する、(ii)spec §7.3-2の「同一レシピ」はプレイヤー概念として素材選択を含む、(iii)コストはキー長数十文字のみ。`bodyId`は含めない(`MaterialSelection`外であり、性能への寄与は`massG`等の数値として既にキーに入る)。

```ts
// src/materials/recipeKey.ts(新設)
export const RECIPE_KEY_VERSION = 1;

/**
 * MaterialSelection(素材ID5フィールド、R2確定)+materialComposedBaseのMotorConfig/CarConfig
 * (§12二層命名、arbiter補足裁定Q3。Wear反映前、RunSnapshot capture前の値)から、性能に
 * 影響する値のみをcanonical文字列化する。DestructionState等の動的run内状態、
 * およびWearState由来の実効値は一切含めない。
 */
export function computeRecipeKey(selection: MaterialSelection, motorConfig: MotorConfig, carConfig: CarConfig): string {
  // 素材ID5フィールド(R2確定、固定順)。文字列そのまま、正規化不要(列挙型IDのため
  // -0/NaN/Infinity等の懸念がない)。
  const materialIds: string[] = [
    selection.wireId,
    selection.magnetId,
    selection.gearId,
    selection.batteryId,
    selection.brushId,
  ];
  const fields: number[] = [
    // MotorConfig(§2.9の全18フィールド中17フィールド、effectiveTurnsRatioのみ除く——
    // P3-3-Q12により base MotorConfigでは常にundefined||1に固定されているため、
    // レシピ識別に寄与しない定数であり含める意味がない)
    motorConfig.coilTurns,
    motorConfig.slitWidthMm,
    motorConfig.sandingQuality,
    motorConfig.brushPressure,
    motorConfig.magnetStrength,
    motorConfig.magnetDistanceMm,
    motorConfig.batteryVoltage,
    motorConfig.axisOffsetMm,
    motorConfig.wireGaugeMm ?? 0.4, // 既定値で正規化(undefinedと明示値を区別しない)
    motorConfig.parallelStrands ?? 1,
    motorConfig.varnished === false ? 0 : 1, // booleanを0/1へ正規化
    motorConfig.wireResistivityRatio ?? 1.0,
    motorConfig.wireDensityRatio ?? 1.0,
    motorConfig.batteryInternalResistanceRatio ?? 1.0,
    motorConfig.batteryCapacityRatio ?? 1.0,
    motorConfig.brushContactResistanceRatio ?? 1.0, // D1是正で追加(§2.9)
    motorConfig.brushChatterProbabilityRatio ?? 1.0, // D1是正で追加(§2.9)
    // CarConfig(§10.3で新規追加されるgearReflectedInertiaKgM2を含む10フィールド全て)
    carConfig.massG,
    carConfig.gearRatio,
    carConfig.gearEfficiency,
    carConfig.wheelDiameterMm,
    carConfig.tireGrip,
    carConfig.axleFriction,
    carConfig.wheelAlignmentMm,
    carConfig.centerOfMassHeightMm,
    carConfig.motorMountOffsetMm,
    carConfig.gearReflectedInertiaKgM2 ?? 0,
  ];
  // -0/NaN/Infinityの正規化: -0は+0へ、NaN/Infinityは変換不能(呼び出し前提が崩れている
  // ため計算しない、事前条件違反としてthrowする——base configは§12により常に有限値の
  // 検証済み値であるため、この分岐は理論上到達しない防御的コード)。
  const normalized = fields.map((v) => {
    if (!Number.isFinite(v)) throw new Error(`computeRecipeKey: 非有限値が渡されました: ${v}`);
    return v === 0 ? 0 : v; // -0を+0へ正規化(Object.is(-0,0)はfalseだが-0+0===0を利用)
  });
  // R2確定: 素材ID5フィールドを先頭、既存の数値フィールドリストを後続へ配置する固定順。
  return `v${RECIPE_KEY_VERSION}|${materialIds.join(',')}|${normalized.join(',')}`;
}
```
**フィールドリストの型テストでの固定(D1是正)**: 実装時、`MotorConfig`/`CarConfig`の全フィールドを列挙する型レベルテスト(例: `type AssertAllFieldsCovered = Exclude<keyof MotorConfig, 'effectiveTurnsRatio'> extends KeysUsedInComputeRecipeKey ? true : false`のような機械的網羅性チェック、またはテストコード内で`Object.keys(motorConfig)`の実行時列挙と本関数が参照するフィールド名リストを突き合わせる)を追加し、将来`MotorConfig`/`CarConfig`へフィールドが追加された際に本関数が追従を忘れることを構造的に防ぐ。`MaterialSelection`の5フィールドについても同様の網羅性チェックを追加する。

**version更新規則**: `RECIPE_KEY_VERSION`は、上記フィールドリストの構成(追加・削除・順序変更)を変更するたびにインクリメントする。旧versionのキーと新versionのキーは文字列として異なるため、`regressionDiff.ts`の`detectPerformanceRegression`は自然に「異なるversion=異なるrecipeKey=別レシピ扱い」となり、version境界をまたいだ誤ったbaseline比較を構造的に防ぐ。**素材IDを含める(R2確定)**: 上記設計は`MaterialSelection`の5フィールド(先頭)+`MotorConfig`/`CarConfig`の数値フィールド(後続)を使う——同じ数値でも異なる素材選択から偶然同じ数値になるケース(理論上ありうるが実際には稀)を素材IDが構造的に区別する。`DestructionConfig`自体は含めない(`DestructionConfig`は`MaterialSelection`から一意に導出される派生値であり、素材IDが既に同じ情報を包含している)。

### 13.3 alice/brabit分業

関数(`src/materials/recipeKey.ts`)はalice所有。呼び出し契機(`beginRunAction`直前、§14のWear反映呼び出しと同時刻)・`pastObservations`の取得元(`notebookStore`からの抽出)はbrabit所有。

## 14. `WearState`→materialComposedBase次run反映設計(§12二層命名、arbiter補足裁定Q3)

### 14.1 層の分離

```ts
// src/materials/wearReflection.ts(新設)
export interface IndividualDegradationInput {
  magnetDemagnetizationFraction: number;
  gearSeizureFraction: number;
  brushWearFraction: number;
  bearingSeizureFraction: number;
  // bodyScorchFraction・rotorBurnedOutは含まない(下記参照)。gearToothLossCountも
  // 含まない(M-1是正、判定文§3(viii))——歯欠け由来の効率低下はapplyWearToCarConfig
  // ではなくcomposeD06RuntimeEffect(§9.3)がseeded toothLossCount(§14.3)から一元計算する。
}
```
**`bodyScorchFraction`を含まない理由**: D04延焼の外観記録用途のみで、現行物理には反映先が存在しない(D08〈クラッシュ被害軽減〉はPhase5スコープ)。config反映が必要になった時点(Phase5)で改めて設計する、それまでは記録専用として`BodyPartState.scorchFraction`のまま保持する。**`rotorBurnedOut`を含まない理由**: `burnedOut===true`の個体は§15.3(R17確定)により`collapsed`と同様に`validateEquipmentLoadout`(装備検証時)で拒否される——本関数(次run config反映)が呼ばれる時点では既に「burnedOutな個体は装備されていない」ことが構造的に保証される(未使用パラメータとして残すのではなく、そもそも引数から除外する)。

```ts
export type ApplyWearToMotorConfigResult = { ok: true; motorConfig: MotorConfig } | { ok: false; reason: string };
export function applyWearToMotorConfig(base: MotorConfig, wear: IndividualDegradationInput): ApplyWearToMotorConfigResult {
  const magnetStrength = base.magnetStrength * (1 - wear.magnetDemagnetizationFraction);
  const brushContactResistanceRatio = base.brushContactResistanceRatio * (1 + wear.brushWearFraction * BRUSH_WEAR_RESISTANCE_PENALTY);
  if (!Number.isFinite(magnetStrength) || magnetStrength < 0 || !Number.isFinite(brushContactResistanceRatio) || brushContactResistanceRatio < 0) {
    return { ok: false, reason: 'WearState反映後のMotorConfigが範囲外です' };
  }
  return { ok: true, motorConfig: { ...base, magnetStrength, brushContactResistanceRatio } };
}

export type ApplyWearToCarConfigResult = { ok: true; carConfig: CarConfig } | { ok: false; reason: string };
export function applyWearToCarConfig(base: CarConfig, wear: IndividualDegradationInput): ApplyWearToCarConfigResult {
  // M-1(ii)(確定裁定、判定文§3): 歯欠け由来の効率因子(1-toothLossRatio)はここでは
  // 計算しない。歯欠け由来の効率低下はcomposeD06RuntimeEffect(§9.3)がseeded
  // toothLossCount(§14.3)から一元計算する——ここで計算すると§14.3のseedingと
  // 二重計上になる(判定文M-1(f)、必ず対で実施すること)。gearSeizureFraction/
  // bearingSeizureFraction由来の因子はD06と無関係のためそのまま残す。
  const gearEfficiency = base.gearEfficiency * (1 - wear.gearSeizureFraction * GEAR_SEIZURE_EFFICIENCY_PENALTY);
  const axleFriction = 1 - (1 - base.axleFriction) * (1 - wear.bearingSeizureFraction * BEARING_SEIZURE_FRICTION_PENALTY);
  if (!Number.isFinite(gearEfficiency) || gearEfficiency <= 0 || gearEfficiency > 1 || !Number.isFinite(axleFriction) || axleFriction < 0 || axleFriction > 1) {
    return { ok: false, reason: 'WearState反映後のCarConfigが範囲外です' };
  }
  return { ok: true, carConfig: { ...base, gearEfficiency, axleFriction } };
}
```
**`gearToothLossCount`フィールドの用途変更(M-1是正)**: `IndividualDegradationInput.gearToothLossCount`は本関数ではもう使われない(上記のとおり削除)。装備ギヤ個体の`toothLossCount`は§14.3の`seedInitialDestructionStateFromWear`が読む——`IndividualDegradationInput`型自体からは`gearToothLossCount`フィールドを削除し、§14.3が装備ギヤ個体の永続`WearState`を直接引数に取る設計とする(同じ事実を2つの入力経路〈`IndividualDegradationInput`経由と直接経由〉から渡せる状態を作らない、P3-1-Q9の単一出典原則)。

### 14.2 呼び出し契機(A2是正、UI §6.2と同一の8段順へ全面同期。arbiter補足裁定Q3により段1を1a〜1eへ精密化)

`beginRunAction`(brabit所有)内の呼び出し順序を、UI計画(`docs/phase3-p3-4-ui-plan.md`§6.2)と同一の8段として確定する。**arbiter補足裁定Q6により、G1bの着手自体がG1a′完了+Suu_mot3照合通過+人間再承認項目P承認後まで開始できない**(§3.1)——したがって「G1a′完了前のG1b」という中間経路は存在しない。G1b開始時点では、段1は最初から下記1a〜1e(resolver・baseline構築関数を含む完成形)として実装される:

1. **base `MotorConfig`/`CarConfig`確定**(素材写像+装備由来の値、§12二層命名で以下へ精密化):
   - 1a. `rawPlayerConfig`(gameStore.config)・`EquipmentLoadout`・`PlayerInventory`・`garageSelection`の単一読取り
   - 1b. `validateEquipmentLoadout`(既存)による装備検証
   - 1c. G1a′ resolver`deriveMaterialSelectionFromEquipment`相当(§4.4)による`selection`・`equipmentContext`導出
   - 1d. `MaterialCompositionBaseline`のproduction構築(§12、`resolveChassisBaselineG`+`resolveGarageBuild`のgear.gearEfficiency)
   - 1e. `composeConfigFromMaterials(rawPlayerMotorConfig, rawPlayerCarConfig(=resolveGarageBuild(garageSelection)単一呼び出し結果), baseline, selection)`で`materialComposedBase`を得る
2. `materialComposedBase`の有限性検証(C-3、`computeRecipeKey`呼出しより前——検証失敗はbeginRun失敗`{ok:false}`、失敗時不変条件は§12参照)
3. `computeRecipeKey(selection, materialComposedBase.motorConfig, materialComposedBase.carConfig)`(§13.2、R2確定の`MaterialSelection`引数込み)——Wear反映**前**の`materialComposedBase`を使う
4. Wear反映: `applyWearToMotorConfig`→`applyWearToCarConfig`(§14.1)の順で`materialComposedBase`へ適用し、実効`MotorConfig`/`CarConfig`を得る
5. `assembleDestructionConfig(selection, equipmentContext)`(§4.3)で`DestructionConfig`を得る
6. `createInitialDestructionState()`(destructionModes.ts、既存、常にD06.toothLossCount=0で初期化)
7. `seedInitialDestructionStateFromWear(6の結果, 装備ギヤ個体のtoothLossCount)`(§14.3、M-1(i))——`initialDestructionState`をD06 seeding済みへ更新
8. `captureRunSnapshot(...)`(§13.1、A3是正参照)——4の実効config・3のrecipeKey・7の`initialDestructionState`をまとめて`RunSnapshot`へ格納

走行中の再評価は行わない(4のWear反映・7のseedingいずれも1回のみ)。7(D06 seeding)は4(Wear反映によるmotorConfig/carConfigの更新)とは別の対象(`initialDestructionState`)へ適用する独立したステップだが、同じ装備ギヤ個体の永続状態を出典とする点で§14.1と論理的に対をなす。**C-4最終DoD(arbiter補足裁定Q6)**: `beginRunAction`内で、loadout・inventory・garageSelection・gameStore.configの読取りが各exact 1回であり、1a〜8が単一経路を成し、`materialComposedBase`・`DestructionConfig`・`recipeKey`・実効configがすべて同一の`selection`実体・同一の読取り値から派生することを、呼出し回数モック+同一参照/同値assertで機械的に固定する(§20.6 C-4・§22)。G1a′(純関数側の単一出典)・G1b(配線側、現存6段分=1a単一読取り相当・2・3・5・6・8)・G6(8段全体の再固定)の3段階で充足する。

### 14.3 D06 toothLossCountのseeding(M-1(i)、確定裁定、新設)

**目的**: 部分損傷ギヤ(例: 9歯欠け)を再装備した次走行で、走行内`D06Progress.toothLossCount`を0からではなく装備個体の永続損傷数から開始させ、判定文M-1が指摘した会計破綻(帰結1〜4、§9.3参照)を構造的に防ぐ。

```ts
// src/materials/wearReflection.ts(§14.1と同一ファイル、alice所有)
// createInitialDestructionState()(destructionModes.ts、既存、変更なし)は常にD06.toothLossCount=0
// で初期化する——本関数はその直後に呼び、装備ギヤ個体の永続WearStateで上書きする。
export function seedInitialDestructionStateFromWear(
  base: DestructionState, // createInitialDestructionState()の戻り値、無改変
  equippedGearToothLossCount: number, // 装備中ギヤ個体の永続WearState.gear.toothLossCount(単一出典)
): DestructionState {
  return {
    ...base,
    modes: {
      ...base.modes,
      D06: { ...base.modes.D06, toothLossCount: equippedGearToothLossCount },
    },
  };
}
```
**単一出典**: `equippedGearToothLossCount`は装備中ギヤ個体の永続`WearState`(gear variant)の`toothLossCount`フィールドから、`RunSnapshot` capture時に1回だけ読む——`IndividualDegradationInput`(§14.1)経由の間接値は使わない(同じ事実を2経路から入力できる状態を作らないため、P3-1-Q9の単一出典原則、§14.1末尾参照)。**呼び出し契機**: §14.2の8段順のステップ7(`createInitialDestructionState()`の直後・`captureRunSnapshot`直前)に1回のみ呼ぶ。走行中の再seedingは行わない。**全損個体の扱い**: `equippedGearToothLossCount >= GEAR_TOTAL_TOOTH_COUNT`(全損個体)は§15の装備拒否(M-1(v))により、そもそも本関数へ到達する前に排除される——本関数が実際に呼ばれる時点では`equippedGearToothLossCount`は常に`0`以上`GEAR_TOTAL_TOOTH_COUNT`**未満**の整数である(§13.1の`restoreRunSnapshot`検証〈M-1(iv)〉と同じ不変条件)。

**A3是正、`captureRunSnapshot`シグネチャ変更の帰属を限定**: `captureRunSnapshot`(既存関数)は§13.1のとおり`recipeKey`引数を追加する破壊的シグネチャ変更を受ける——これは人間再承認一覧**A**(`RunSnapshot.recipeKey`必須追加、R1・R2)に起因するものであり、**M-1(本節のseeding)自体が`captureRunSnapshot`へ追加のシグネチャ変更を要求するわけではない**。M-1のseeding結果は、`captureRunSnapshot`が既に持つ(recipeKey追加後も変わらない)`initialDestructionState`引数へ、seeding済みの`DestructionState`をそのまま渡す形で伝わる——`captureRunSnapshot`の型シグネチャに`toothLossCount`用の新規引数は追加しない。UI側(`docs/phase3-p3-4-ui-plan.md`§6.2)もこの前提(recipeKey引数追加=A起因、seeding自体はシグネチャ非変更)で同期させること。

## 15. collapsed rotor装備拒否設計

### 15.1 誤りの訂正

`validateEquipmentLoadout`の実際の失敗時フィールド名は`missingRole`である(`invalidRole`は存在しない)。`ApplyRunOutcomeError`(走行結果適用時のエラー)と`ValidateEquipmentLoadoutResult`(装備検証時のエラー)は別の契約層であり、`validateEquipmentLoadout`は`ApplyRunOutcomeError`を返す関数ではない。

### 15.2 是正設計

`ValidateEquipmentLoadoutResult`(装備設定時のエラー、`setEquipmentLoadout`が使う)へ新分岐を追加する:
```ts
export type ValidateEquipmentLoadoutResult =
  | { ok: true; loadout: EquipmentLoadout & { batteryItemId: string } }
  | { ok: false; reason: string; missingRole: EquipmentRole } // 既存
  | { ok: false; reason: string; destroyedRole: EquipmentRole }; // 新規
```
`validateEquipmentLoadout`のrotor存在確認の直後へ:
```ts
if (rotor.collapsed) return { ok: false, reason: `rotorAssemblyId(${loadout.rotorAssemblyId})は崩壊済みです`, destroyedRole: 'rotor' };
if (rotor.burnedOut) return { ok: false, reason: `rotorAssemblyId(${loadout.rotorAssemblyId})は焼損済みです`, destroyedRole: 'rotor' }; // R17確定
if (gear.toothLossCount >= GEAR_TOTAL_TOOTH_COUNT) return { ok: false, reason: `gearItemId(${loadout.gearItemId})は全損済みです`, destroyedRole: 'gear' }; // M-1(v)確定
```
`ApplyRunOutcomeError`は変更しない。UI側(brabit)は`ok:false`を受け取った時点で`reason`(既に日本語文言として構築済み)をそのまま表示する経路を実装する。

### 15.3 burnedOut rotor・gear全損の扱い(確定裁定、R17・M-1(v))

**R17(確定)**: `RotorAssemblyState.burnedOut`(D02由来)も`collapsed`と同様に装備拒否する。理由: D02発火到達=rotor個体焼損(v12 §3表「rotor個体焼損」、spec §7.1.1)であり、装備可能なまま残す根拠がない——§14.1が既に「burnedOutは装備されない前提」で設計されている以上、拒否がなければ§14の前提が破れる。`destroyedRole:'rotor'`(理由文言で崩壊/焼損を区別、上記コード参照)。

**M-1(v)(確定裁定)**: gear全損個体(`toothLossCount>=GEAR_TOTAL_TOOTH_COUNT`)も同様にcollapsed rotor・burnedOut rotorと同輩の装備拒否対象とする(`destroyedRole:'gear'`)。これは§14.3(D06 seeding)・§13.1(restore検証、M-1(iv))が前提とする「本関数が実際に呼ばれる時点ではtoothLossCountは常に0〜9」という不変条件を、装備段階で構造的に保証するための対をなす拒否である——§14.3・§13.1いずれの検証も、この装備拒否が機能していることを前提とする(3箇所は独立に追加するが、互いの不変条件を支え合う一体の設計として実装・テストすること)。

## 16. `finalDestructionState`型/validator/writer設計

### 16.1 型変更(必須のまま+legacy専用union新設、F2是正で構造的部分型の抜け穴を型で塞ぐ)

**F2指摘の核心**: v6の`Omit<New,'finalDestructionState'|'recipeKey'>`は、TypeScriptの構造的部分型により、非リテラル値(変数経由で渡された値等)であれば余剰フィールド(片方だけ存在する等)を持っていても`Legacy`側の型として通ってしまう——「両フィールドとも存在しない」ことを型で強制していなかった。

```ts
// src/store/runOutcomeApplication.ts / notebookStore.ts
export interface VehicleTestRunNotebookRecord {
  // ...既存フィールド(§2.4参照)
  finalDestructionState: DestructionState; // 必須
  recipeKey: string; // 必須(E4是正で追加、§13.1の一方向複写契約の複写先)
}
// ExperimentSession・CourseRunNotebookRecordも同様に両フィールドとも必須のまま

// legacy(P3-4以前の過去record)は両フィールドの不在を型で明示する(F2是正)。
// `?: never`により、Legacy型の値にこれらのプロパティを(値を持つ形で)設定すること
// 自体がコンパイルエラーになる——Omitだけでは防げなかった「片方だけ余剰で持つ」
// 構造的部分型の抜け穴を、明示的な`never`型で塞ぐ。
export type LegacyVehicleTestRunNotebookRecord = Omit<VehicleTestRunNotebookRecord, 'finalDestructionState' | 'recipeKey'> & {
  finalDestructionState?: never;
  recipeKey?: never;
};
export type LegacyExperimentSession = Omit<ExperimentSession, 'finalDestructionState' | 'recipeKey'> & {
  finalDestructionState?: never;
  recipeKey?: never;
};
export type LegacyCourseRunNotebookRecord = Omit<CourseRunNotebookRecord, 'finalDestructionState' | 'recipeKey'> & {
  finalDestructionState?: never;
  recipeKey?: never;
};

export type StoredVehicleTestRunNotebookRecord = VehicleTestRunNotebookRecord | LegacyVehicleTestRunNotebookRecord;
export type StoredExperimentSession = ExperimentSession | LegacyExperimentSession;
export type StoredCourseRunNotebookRecord = CourseRunNotebookRecord | LegacyCourseRunNotebookRecord;
```

### 16.2 依存閉包(C9是正、`NotebookSlice`から`PersistedSaveState`まで)

**`NotebookSlice`(saveStore.ts:134-138)の変更**: `sessions: StoredExperimentSession[]`・`courseRuns: StoredCourseRunNotebookRecord[]`・`vehicleTestRuns: StoredVehicleTestRunNotebookRecord[]`——**読み取り(永続化された履歴)はunion型を受理する**。

**`PersistedSaveState`(saveStore.ts:176-185)**: `notebook: NotebookSlice`フィールド自体の型は上記union対応後のまま、`schemaVersion`は変更不要(型レベルのunion対応であり、既存データのバイナリ形式は変わらない——`finalDestructionState`フィールドが単に「存在しない」ことが合法な状態として読めるようになるだけ)。

**add/replace action(`saveStore.ts`)**: 当初の規定は「`addSessionRecord(session: ExperimentSession)`等の**書き込み系action引数は`Stored...`ではなく非legacy(`finalDestructionState`必須)の型のみを受理する**——新規書込みでの欠落を型レベルで禁止する(C12是正の意図)」であった。**G6-R1(2026-08-19、arbiter追加裁定+人間軽量再承認)により、この執行点を精密化する**——実装時に、`productionWiringEnabled === false`側の旧経路(`finishActiveSession`→`addSession`→`addSessionRecord`)が2フィールドの出典を持たないまま**G9まで維持される**ことが判明し(UI計画§17 G9行が旧経路の削除時期をG9と確定している)、「新規書込みは非legacy限定」と「出典のない旧経路をG9まで維持」が同一のstorage action境界では両立しないためである。

**G6-R1の確定内容(人間承認原文、Suu_mot3中継)**:

> G6-R1(§16.2執行点の精密化): 「add/replace actionの書き込み系action引数は非legacyのみ受理」(engine計画§16.2)の執行点を、storage action境界から新規レコードの生成境界(§16.5 builder+§16.4 pending validator、いずれも承認済み)へ移す。add/replace actionの引数型は、false側直接書込み=LegacyXxx(G9削除予定・呼出し箇所構造テスト付き)、import=StoredXxx union(G2裁定の帰結)、true側新規レコード=envelope原子経路のみ(action新設なし)と宣言する。挙動変更・新規公開action・新規型の追加はいずれもゼロ。C12の意図(新規書込みにlegacy形状の抜け道を作らない)は生成境界の型+validator+呼出し箇所構造テストで維持される。

**G6-R2によるtaxonomy訂正(2026-08-19、arbiter追加裁定+人間承認)**: G6-R1の分類「false側直接書込み=LegacyXxx(G9削除予定)」は列挙が不完全だった——`addCourseRunRecord`には**gateの外に第3の呼出し元**(V2 `CourseMode.tsx`の手動「A/B比較用に実験ノートへ保存」ボタン)が存在し、その寿命はG9ではない。人間承認原文は次のとおり:

> **G6-R2(CourseMode手動保存のgate条件付き無効化+G6-R1 taxonomy訂正)**: (1)`productionWiringEnabled=true`時、CourseModeの手動「A/B比較用に実験ノートへ保存」を無効化する(理由テキスト付き、§6.4.1 disabled規律準拠)。true側では同一走行がPhase 3原子経路により`kind:'courseRun'`で自動記録されるため、二重記録を防ぐ。`false`時は現行挙動を無改修で維持する——**ゲームプレイ可視のUI挙動変更(true側のみ)**。(2)G6-R1の分類を訂正する: `addCourseRunRecord`(Legacy型宣言)の削除期限を「G9」から「G9とV2 CourseModeのretro UI置換の遅い方」へ改め、呼出し箇所構造テストの列挙へ`CourseMode.tsx`手動保存を追加する。(3)track-run記録配線の是正(courseRun腕+courseRunHistory出典)は承認済み契約内の実装欠陥修正であり、本バンドルの承認対象ではない(経緯の記録のみ)。新規公開action・新規型の追加はゼロ。

**削除マイルストーンの一覧(訂正後)**:

| legacy書込み口 | 呼出し元 | 削除時期 |
|---|---|---|
| `addSession` / `addSessionRecord` | `gameStore.finishActiveSession`(false側旧経路) | **G9**(`productionWiringEnabled`分岐の削除と同時) |
| `addCourseRun` / `addCourseRunRecord` | `CourseMode.tsx`の手動保存ボタン(gate分岐の**外**) | **G9とV2 CourseModeのretro UI置換の遅い方** |

**C12の意図が維持される仕組み(3点セット)**: (1)**生成境界の型**——§16.5の3専用builderは入力を`LegacyXxx`に固定しており、既に2フィールドを持つ値を渡すこと自体がコンパイルエラーになる(二重上書き不能)。`recipeKey`は`RunOutcome`から一方向複写のみで、呼出し側が別値を渡せる引数を持たない。(2)**pending validator**——§16.4の`acceptsPendingNotebookFinalFields`は`current`のみを受理し、legacy形状のpendingを拒否する。(3)**呼出し箇所の構造テスト**——legacy形状の書込み口が列挙済みの箇所に限られることを、ソーステキスト走査の構造監査で機械的に固定する。**腕ごとに監査ファイルを分ける**(削除時期が異なるため): session腕は`src/store/__tests__/legacySessionWriteAudit.test.ts`(alice所有)が旧経路1箇所(`finishActiveSession`)を、courseRun腕は`src/store/__tests__/legacyCourseRunWriteAudit.test.ts`(brabit所有)が**`CourseMode.tsx`手動保存→`notebookStore.addCourseRun`→`saveStore.addCourseRunRecord`という1本の委譲チェーン**を固定する。いずれも呼出しファイル・呼出し関数本体・**呼出し件数**を固定し、許可ファイル内で呼出しが増える偽陰性(S-4監査P2で確認された同型の穴)も塞ぐ。**courseRun腕は加えて、gameStoreからlegacy書込みactionへの直接呼出しが0件であることを固定する**——true側の`kind:'courseRun'`はenvelope原子経路(`performApplyRunOutcome`、arbiter追加裁定A)を通るため、gameStoreからの直接呼出しが現れたら二重記録の退行である。**実測(2026-08-19、Suu_mot3独立照合済み)**: courseRun腕のlegacy書込みは上記1委譲チェーンのみで、gameStoreからの直接呼出しは0件である(「gameStore false側+CourseModeの2系統」という記述は事実誤認であり、false側のcourse走行はnotebookへの自動保存経路自体を持たない)。**各書込み口の削除時期に達した際は、対応する監査ごと削除する**(上表の削除マイルストーン参照)。

**`appendNotebookRecord`(saveStore.ts、50件trim処理)**: 引数型を書き込み系actionと同じ非legacy型に統一する。

**JSON export/import(D9是正、既存範囲と新設範囲を分離)**: **v4の誤り**: 「`StoredXxx`全腕をそのままexport/importする」と書いていたが、これは既存機能の拡張ではなく**新機能の追加**だった——`notebookStore.ts`の現行`parseNotebookJson(json:string):ExperimentSession[]`(150行)・`stringifyNotebook(sessions:ExperimentSession[]):string`(161-163行、`NotebookExport{version:1,exportedAt,sessions}`)は**`ExperimentSession[]`のみ**を対象としており、`courseRuns`/`vehicleTestRuns`は現状export/import機能を一切持たない(実測確認済み)。

**是正**: 既存機能(`ExperimentSession`のexport/import)への対応と、新設範囲(`courseRuns`/`vehicleTestRuns`のexport/import)を明確に分離する。この2つは独立した論点として扱う(F4是正)。

**(1) `NotebookExport.version`方針(F4是正、「検討する」を撤回し具体案を確定/G2是正、legacy/current混在履歴の扱いを追加)**: **Suu_mot3推奨のversion 2方式を採用する**——「同じversion 1の意味を後から拡張する」のではなく、「形式変更をversionで正直に示す」。importはversion 1(legacy、`ExperimentSession[]`のみ、新2フィールドなし)とversion 2(新形式)を**別々のvalidator**で受理する——同一のvalidatorで両方を扱おうとして「新2フィールドの有無で自動判別する」という設計にはしない(バージョン番号という明示的な判別子を使う方が、§16.4の`hasFinal===hasRecipeKey`交差不変条件〈F2是正〉と組み合わせても曖昧さがない)。

**G2指摘の核心(混在履歴の扱い、v7の欠落)**: v7は「新規exportは常にversion 2(新2フィールド必須の新形式)」と書いていたが、これは実現不能だった——P3-4以前から`NotebookSlice`に保存済みのlegacy sessionは`finalDestructionState`/`recipeKey`を持たず、新規exportがこれらを「新2フィールド必須」で強制すると、legacy sessionを含む既存ユーザーの履歴全体がexportできなくなる(欠落フィールドを捏造することも、CLAUDE.mdの正確性原則により禁止)。

**是正(G2是正、Suu_mot3推奨案を採用)**:
```ts
// src/store/notebookStore.ts、NotebookExport(既存version:1形式から拡張)
export interface NotebookExportV2 {
  version: 2;
  exportedAt: string;
  sessions: StoredExperimentSession[]; // union——legacy(両フィールドなし)・current(両フィールドあり)が混在してよい
}
```
- **version 2の`sessions`要素は`StoredExperimentSession`(union)を許容する**——各要素は§16.4の交差不変条件(`hasFinal===hasRecipeKey`)により「両方あり(current)」または「両方なし(legacy)」のいずれかのみが正当であり、半状態は禁止のまま。
- **`stringifyNotebook`(export関数)は履歴を一切捨てない**——`NotebookSlice.sessions`(legacy/current混在のunion配列)をそのまま`NotebookExportV2.sessions`へ格納する。legacy要素をcurrent形式へ強制変換しようとしない(架空のfinalDestructionState/recipeKeyを補完しない)。
- **version 2のimportも同じunion(`StoredExperimentSession[]`)を受理する**——legacy/current混在のexportファイルを、混在のまま復元できる。
- **version 1のimportは引き続きlegacyのみ**(既存の`ExperimentSession[]`形式、新2フィールドを持たない旧形式)。
- **regressionDiffのbaseline候補は引き続きcurrentのみ**(§13.1の既存設計どおり、legacy要素は`recipeKey`を持たないため構造的に除外される、変更なし)。

**代案(非推奨)**: legacy sessionが1件でも含まれる場合はexport自体を拒否する案も存在するが、既存の正常なユーザー(P3-4以前からの実験ノート履歴を持つユーザー)がexportできなくなるため非推奨とする。**後方互換テスト**: 既存のversion 1エクスポートファイルがimport時に引き続き正しく読めることに加え、legacy/current混在のversion 2エクスポート→再importの往復で全件(legacy要素も含めて)が欠落なく復元されることをテストで固定する。**人間再承認**: `NotebookExport`のversion運用方針変更(1のみ→1/2の2形式、かつ2はunion要素を許容)は契約変更に相当するため要——`RUN_SNAPSHOT_CONTRACT_VERSION`と同型の運用(§13.1)に揃える。

**(2) `courseRuns`/`vehicleTestRuns`のexport/import機能新設可否**: **R10確定(判定文§4)、P3-4スコープ外。**既存機能拡張ではなく新機能追加であり、Phase 3完成ゲートの必須要件ではない——申し送りとして§21対応表へ記録する。

**v15/v16 migration機構との関係**: 既存の`V15_PROGRESS_KEY`/`V15_NOTEBOOK_KEY`(saveStore.ts:189-190)は、v15形式のデータをv16形式へ一度だけ変換する既存の仕組みであり、**本変更(`finalDestructionState`のunion化)はこの既存migration機構とは独立**——v16形式のデータの中で`finalDestructionState`の有無だけが分岐する話であり、新しいmigration key・新しいschemaVersionは不要(プロパティ存在検査による判別で十分)。

**pending未適用recordと既適用notebook履歴の区別**: `PendingNotebookRecord`(まだ`applyRunOutcome`を経ていない、走行直後の一時データ)は常にP3-4以降のコードパスで生成されるため`finalDestructionState`は常に存在する(必須型のまま、legacy union不要)——legacy unionが必要なのは、**既に`notebookStore`/`saveStore`に永続化済みの、P3-4以前の過去のnotebook履歴のみ**である。

### 16.3 公開raw validatorの設計

`validateDestructionStateShape`(destructionOrchestration.ts:806、現状非export)を`export`する。JSDocへ「PendingNotebookRecordのvalidator(saveStore.ts所有)から再利用される、循環依存回避のためdestructionOrchestration.tsが唯一の出典」と明記する。**M-1(iv)との関係(重複防止のための明示的区別)**: `finalDestructionState`(本節、notebook recordが保持する走行**終了時点**の`DestructionState`)のvalidatorと、§13.1で追加する`initialDestructionState.modes.D06.toothLossCount`範囲検証(`RunSnapshot`が保持する走行**開始時点**の`DestructionState`、M-1(iv))は、対象データの時点が異なる**別のvalidator**である——`validateDestructionStateShape`(本節)を`initialDestructionState`の検証にも共用してよいが、M-1(iv)の交差不変条件(0以上`gearTotalToothCount`未満)は`initialDestructionState`専用の追加チェックであり、`finalDestructionState`(走行終了時点、全損なら`toothLossCount===10`もありうる)には適用しない。両者を同一のvalidator呼び出しへ誤って混在させないこと。

### 16.4 property-presence判別のdeep validation(C9是正、F2是正で交差不変条件`hasFinal===hasRecipeKey`を追加、G1・G3是正で呼出し契約分離+recipeKey形式検証を追加)

**F2指摘の核心**: v6のvalidatorは`finalDestructionState`の存在有無のみを判定し、`recipeKey`の存在・型を一切検査していなかった——「finalDestructionStateあり・recipeKeyなし」という壊れた中間状態(片方だけ存在)を誤って受理しうる。

**G3是正、recipeKey空文字/形式検証を実装時判断へ先送りしない**: `computeRecipeKey`(§13.2)は常に`v{n}|...`という非空のenvelope形式文字列を返す——空文字列・envelope形式でない文字列は理論上到達しないはずだが、raw validatorとしては「到達しないはず」に頼らず明示的に拒否する。最低条件として`recipeKey.length>0`、加えて`/^v[1-9][0-9]*\|/`(version prefix+パイプ区切り)というenvelope形式を検証する——**ただし`|`以降のopaque payload自体(§13.2の個々のフィールド値列)は再parseしない**(recipeKeyは`computeRecipeKey`だけが構成方法を知るopaque文字列という契約を守る、envelopeの外形だけを検証する)。

```ts
// src/store/notebookValidation.ts(新設、3腕+pending validatorで共通再利用、alice所有)
// finalDestructionState・recipeKeyは同時にP3-4で追加された2フィールドであり、
// 「両方存在(新形式)」「両方不在(legacy)」のいずれかのみを正当とする交差不変条件を
// 共通関数として1箇所に定義する(3腕・pending validator・save restore・JSON importの
// 全経路が同じ関数を再利用し、判定ロジックの複製を避ける)。
export type NotebookFinalFieldsValidationResult =
  | { ok: true; kind: 'legacy' }
  | { ok: true; kind: 'current'; finalDestructionState: DestructionState; recipeKey: string }
  | { ok: false; reason: string };

const RECIPE_KEY_ENVELOPE_PATTERN = /^v[1-9][0-9]*\|/; // G3是正、外形のみ検証、内容は再parseしない

export function validateNotebookFinalFields(raw: Record<string, unknown>): NotebookFinalFieldsValidationResult {
  const hasFinal = 'finalDestructionState' in raw;
  const hasRecipeKey = 'recipeKey' in raw;
  if (hasFinal !== hasRecipeKey) {
    // 片方のみ存在する壊れた中間状態——半状態は明示的に拒否する(F2是正の核心)。
    return { ok: false, reason: `finalDestructionStateとrecipeKeyの存在が一致しません(hasFinal=${hasFinal}, hasRecipeKey=${hasRecipeKey})` };
  }
  if (!hasFinal) {
    return { ok: true, kind: 'legacy' }; // 両方なし=legacy
  }
  // 両方あり=新形式、双方をdeep検証する
  if (!validateDestructionStateShape(raw.finalDestructionState)) {
    return { ok: false, reason: 'finalDestructionStateの形状が不正です' };
  }
  if (typeof raw.recipeKey !== 'string' || raw.recipeKey.length === 0) {
    return { ok: false, reason: 'recipeKeyが文字列でないか空文字列です' }; // G3是正
  }
  if (!RECIPE_KEY_ENVELOPE_PATTERN.test(raw.recipeKey)) {
    return { ok: false, reason: 'recipeKeyがenvelope形式(v{n}|...)ではありません' }; // G3是正
  }
  return { ok: true, kind: 'current', finalDestructionState: raw.finalDestructionState, recipeKey: raw.recipeKey };
}
```

**G1是正、呼出し側の契約分離(共通関数は判別結果を返すところまで、受理可否は呼出し側が決める)**: `validateNotebookFinalFields`自体は`legacy`/`current`の判別結果を返すのみとし、**「legacyを受理してよいか」は呼出し側の文脈ごとに異なる契約とする**——v7は誤ってこの区別をせず、pending validatorも`legacy`を無条件で`ok`扱いしていた。

```ts
// persisted notebook history / save restore(saveStore.ts)——legacy・current両方を受理
function isValidStoredExperimentSession(raw: unknown): raw is StoredExperimentSession {
  if (!isValidExperimentSessionBaseShape(raw)) return false;
  return validateNotebookFinalFields(raw as Record<string, unknown>).ok; // legacy/current両方okでよい
}
// isValidStoredCourseRunNotebookRecord・isValidStoredVehicleTestRunNotebookRecordも同型。

// PendingNotebookRecord validator(まだ走行結果適用前の一時データ)——currentのみ受理、legacyは拒否
function isValidPendingExperimentSession(raw: unknown): raw is ExperimentSession {
  if (!isValidExperimentSessionBaseShape(raw)) return false;
  const result = validateNotebookFinalFields(raw as Record<string, unknown>);
  return result.ok && result.kind === 'current'; // G1是正: legacyは明示的に拒否
}
// PendingNotebookRecordの3腕すべて、同型のpending専用validatorを持つ(§16.2で確認済みのとおり
// pendingは常にP3-4以降のコードパスで生成されるため、legacyな中間状態は本来存在しえない——
// この期待をvalidatorレベルでも強制する)。

// JSON v1 import——legacyのみ受理(v1形式はfinalDestructionState/recipeKeyを持たない旧形式)
// JSON v2 import——§16.2(G2是正)で確定する形式(StoredExperimentSession union、legacy/current両方)を受理
```
**半状態+G1・G3是正の負例テスト**: (1)`{...validRecordWithoutBoth, finalDestructionState: validState}`(recipeKeyなし)・`{...validRecordWithoutBoth, recipeKey: 'v1|...'}`(finalDestructionStateなし)の両方が、3腕すべて・pending validator・save restore・JSON importの各経路で一貫して`ok:false`を返すことをテストで固定する。(2)pending validatorに「両方なし(legacy形状)」のrawを渡した場合、`validateNotebookFinalFields`自体は`ok:true,kind:'legacy'`を返すが、pending専用validator(`isValidPendingExperimentSession`等)は`result.kind==='current'`条件により`false`を返すことを直接テストする(G1是正)。(3)`recipeKey:''`(空文字列)・`recipeKey:'not-an-envelope'`(形式不正)が、3腕・pending・save restore・JSON v2 importの全経路で一貫して`ok:false`を返すことをテストする(G3是正)。いずれも§22 DoDへ反映する。

### 16.5 writer(alice側同一ゲート、D9是正で二重上書き不能な判別union builderへ)

**v4の誤り**: 汎用`buildNotebookRecordWithFinalDestructionState<T>(recordWithoutFinalState: T, ...)`は、型パラメータ`T`が既に`finalDestructionState`を持つ型(例えば誤って`VehicleTestRunNotebookRecord`自体を渡してしまった場合)でも受理してしまい、既存の値を黙って上書きできてしまう——「新規書込みで欠落・二重上書きを構築不能にする」というD9の要求を満たしていなかった。

**是正**: 3腕それぞれのOmit型(§16.1で定義済みの`LegacyVehicleTestRunNotebookRecord`等、`finalDestructionState`を含まない型)を入力とする、判別unionベースの3つの専用builder関数へ分割する(汎用`<T>`を廃止):

```ts
// src/store/runOutcomeApplication.ts(alice所有、純関数)
// 3腕それぞれ専用のbuilder。入力型がLegacyXxx(finalDestructionState・recipeKeyを
// 持たない)に固定されているため、既にこれらを持つ値を誤って渡すこと自体が
// コンパイルエラーになる(型システムによる二重上書き不能化)。recipeKeyは
// runOutcome.replaySnapshot.recipeKeyから一方向に複写する(§13.1のexact transport
// 契約3、呼び出し側が別のrecipeKey値を渡せる引数は持たない)。
export function buildVehicleTestRunNotebookRecord(
  recordWithoutFinalState: LegacyVehicleTestRunNotebookRecord,
  runOutcome: RunOutcome,
): VehicleTestRunNotebookRecord {
  return {
    ...recordWithoutFinalState,
    finalDestructionState: runOutcome.destructionState,
    recipeKey: runOutcome.replaySnapshot.recipeKey, // 一方向複写、呼び出し側からは上書き不可
  };
}
export function buildExperimentSession(
  recordWithoutFinalState: LegacyExperimentSession,
  runOutcome: RunOutcome,
): ExperimentSession {
  return {
    ...recordWithoutFinalState,
    finalDestructionState: runOutcome.destructionState,
    recipeKey: runOutcome.replaySnapshot.recipeKey,
  };
}
export function buildCourseRunNotebookRecord(
  recordWithoutFinalState: LegacyCourseRunNotebookRecord,
  runOutcome: RunOutcome,
): CourseRunNotebookRecord {
  return {
    ...recordWithoutFinalState,
    finalDestructionState: runOutcome.destructionState,
    recipeKey: runOutcome.replaySnapshot.recipeKey,
  };
}
```
確定-5の「型・validator・writer全てalice側の同一ゲート」は、型(§16.1)・validator(§16.3・§16.4、export化+deep validation)・値の組み立て純関数(本節、3つの専用builder)をaliceが提供することで満たす。**store action本体(`set()`呼び出し自体)は既存の所有境界どおりbrabit(`saveStore.ts`)が担当**——alice側は「値をどう組み立てるか」の純関数を提供し、それを呼び出すのはbrabitという既存の分業パターン(`applyResolvedDegradations`等と同型)を維持する。

## 17. context×mode到達可能性マトリクス+全数値較正候補(C11是正、統合)

### 17.1 到達可能性マトリクス

D06・D09は`buildMotorOnlyFrameInput`が`loadTorqueNm: undefined`を明示的に設定する(§2.2実測)ため、motor-only文脈で構造的に発生しない。

| モード | motor-only | test-run | track-run |
|---|---|---|---|
| D01〜D05・D07 | ○ | ○ | ○ |
| D06 | **構造的に不可能**(loadTorqueNm undefined) | ○(要sweep実測、下記参照) | ○ |
| D09 | **構造的に不可能**(同上) | ○(要sweep実測) | ○ |

**正例テスト**: D01〜D05・D07の3文脈×6モード=18正例、D06・D09の2文脈×2モード=4正例、計22正例。**構造負例テスト**: motor-onlyで`buildMotorOnlyFrameInput`が返す`frame.loadTorqueNm`/`gearFrictionLossW`/`axleAngularVelocityRadS`が全て`undefined`であることの直接assert。

### 17.2 D06/D09のproduction-valid到達可能性(C11是正、疑わしさの検証)

**既存loadTorqueNm観測上限**(`src/engine/__tests__/`実測値)は概ね0.0075〜0.3 N·mの範囲。§17.3の`gearStrengthThresholdNm`最弱候補(gear-pom=0.4)がこの観測上限(0.3)を上回っている場合、**production-valid構成でD06が原理的に到達不能になる可能性がある**——これは数値候補を最終決定する前に、G5の較正sweepで必ず検証しなければならない受入条件である。**test-only(非production)な値による到達を確定証跡にしてはならない**(C11明示禁止)——D01〜D05/D07の全ての較正sweepが`composeConfigFromMaterials`(production素材写像パイプライン)を経由した構成のみを正例として採用してきた既存規律(P3-3 Gate6のP60〜P64是正史)を、D06/D09にもそのまま適用する。

**受入条件(§17.3の数値表と対で読む)**: (1)`gearStrengthThresholdNm`(全4値、titanium含む)がproduction-valid構成(`composeConfigFromMaterials`経由)で実際に超過可能なloadTorqueNmの値域と整合すること——超過不能な場合は閾値候補を下げるか、既存物理(勾配・タイヤグリップ等)を組み合わせた「攻めた構成」でどこまでloadTorqueNmを上げられるかを先に実測し、その実測上限を下回る閾値候補へ差し替える。(2)D09の`highLoadHighSpeed.loadTorqueThresholdNm`・`rpmThreshold`についても同様の到達可能性実測を行う。(3)いずれも「通常運用〈NORMAL_OPERATION〉で非到達」かつ「攻めたproduction-valid構成で有限到達」の両方をsweepで実証する。

### 17.3 較正候補値一覧(全実数、titanium欠落を解消)

| フィールド | 対象 | 初期候補値 | 単位 | 根拠 |
|---|---|---|---|---|
| `gearStrengthThresholdNm` | gear-pom | 0.4 | N·m | 既存loadTorqueNm観測上限(0.3)をやや超える値。§17.2の到達可能性sweepで要検証 |
| 同上 | gear-nylon-pa6 | 0.55 | N·m | POM比+37.5% |
| 同上 | gear-peek | 0.7 | N·m | POM比+75% |
| 同上 | **gear-titanium** | **値なし(`GearBreakageProfile`が`{kind:'nonBreakable'}`を返すため、`gearStrengthThresholdNm`フィールド自体を持たない。`Record<Exclude<GearMaterialId,'gear-titanium'>,number>`という型設計により、titanium用の値を書き忘れているのではなく、型システムがtitaniumにこのフィールドを要求しないことを保証する)** | - | spec §4.2「チタンは砕けない代わりに重い」の直接反映(§6.3) |
| `toothFatigueExposureNmS`(R6確定、候補b) | 全gear共通 | 0.05 | N·m·s | D05較正値と同スケール。判定文§9(2)受入条件: 1本目の歯欠けまでが観測可能なオーダー(0.5〜10秒)+全損が段階的(1 stepで全損しない)ことを実測 |
| `meshPhaseAccumulator`(R7確定、トルクリップル専用) | - | 較正不要(`GEAR_TOTAL_TOOTH_COUNT=10`と`axleAngularVelocityRadS`の幾何関係から自動決定、追加の較正定数なし) | - | §9.4のリップル専用位相アキュムレータ(候補d却下に伴い新設、R6/R7) |
| `RIPPLE_AMPLITUDE`(§9.4) | 全gear共通 | 0.03 | 無次元 | `efficiencyMultiplier`(最大0.9、1本目の歯欠け時)に対し3%程度の追加変調、観測可能だが支配的ではない規模感 |
| `GEAR_ASSUMED_RADIUS_M`(§10.4) | 全gear共通(形状仮定) | 0.008 | m | `WINDING_MEAN_RADIUS_M`(既存確定値0.007m)と近いスケール |
| `GEAR_ASSUMED_THICKNESS_M`(§10.4) | 全gear共通 | 0.003 | m | `MAGNET_THICKNESS_M`(既存確定値0.003m)と同スケール |
| `d09.thermal.conductionCoefficient` | 全構成共通 | 0.25 | 無次元/秒 | D07確定値と同オーダー |
| `d09.thermal.dissipationCoefficient` | 全構成共通 | 0.5 | 無次元/秒 | 同上 |
| `bearingSeizureGaugeLimit` | 全構成共通 | 1.0 | 無次元(0-1ゲージ) | D07と同じゲージ上限規約 |
| `highLoadHighSpeed.loadTorqueThresholdNm` | 全構成共通 | 0.2 | N·m | D06最弱閾値(0.4)より低い値域(軸受が歯より先に音を上げる設計意図)。§17.2のsweepで要検証(既存観測上限0.3との整合含む) |
| `highLoadHighSpeed.rpmThreshold` | 全構成共通 | 3000 | rpm(車軸換算、§7.4) | `COIL_DEFORM_OMEGA`(2000rpm相当、モーター軸)を参考に、車軸rpmとしての規模感で設定。sweepで要検証 |
| `METAL_CONTACT_MULTIPLIER` | 全構成共通 | 1.5 | 無次元 | 金属接触時の摩擦損失増倍 |
| `D09_AXLE_FRICTION_INCREASE_PER_GAUGE` | 全構成共通 | 0.1 | 無次元(補完合成比率) | ゲージ満タンで軸摩擦の残り余地の10%を消費 |
| `GEAR_SEIZURE_EFFICIENCY_PENALTY` | 全構成共通 | 0.3 | 無次元(乗算比率) | 軸受焼付き劣化の重篤度 |
| `BEARING_SEIZURE_FRICTION_PENALTY` | 全構成共通 | 0.2 | 無次元(補完合成比率) | 次run恒久効果としての軸受摩擦増 |
| `BRUSH_WEAR_RESISTANCE_PENALTY` | 全構成共通 | 0.5 | 無次元(比率) | 既存`brushContactResistanceRatio`レンジに対する規模感 |
| `D09_GEAR_SEIZURE_DELTA_FRACTION`(§7.7、D3是正で新設) | 全構成共通 | 0.15 | 無次元(0-1、WearStateへの恒久劣化加算量) | D07の`demagnetizationDeltaFraction`(config固定値パターン)と同スケール、1回の終端でgearのWearState.seizureFractionを15%進める規模感 |
| `D09_BEARING_SEIZURE_DELTA_FRACTION`(§7.7、D3是正で新設) | 全構成共通 | 0.2 | 無次元(0-1、WearStateへの恒久劣化加算量) | 軸受自体はgearより焼付きの直接的被害を受けるという設計意図でgear側よりやや大きい値 |
| ガウスメーター等UI較正値 | brabit所有 | 800円(価格)等 | - | R23確定(§20 R18〜R26要旨)、`docs/phase3-p3-4-ui-plan.md`側で詳細反映済み |

**D5是正+M-1(vi)是正(§9.3)の数値裏付け**: G5較正sweepは、9歯損傷+`gearSeizureFraction`最大という最悪ケース(`eta_effective≈0.042`、契約1′下限0.42×efficiencyMultiplier最小0.1)の構成についても、既存NORMAL_OPERATION非到達・攻めた構成での有限到達可能性・**数値振動の不在**を実測項目に追加する(§9.3で確定した契約2の数値裏付け、判定文§9(1)がG5の最初の手順として指定)。**R6確定(§9.1)の数値裏付け**: `meshCrossingRateHz`(§9.1で導出した式)を用いた最大損失率を、候補b(確定採用)の`toothFatigueExposureNmS`較正と併せて通常運用構成・攻めた構成それぞれで実測し、崩壊速度が意図した範囲(1本目の歯欠けまで0.5〜10秒、§9(2))に収まることをsweep結果として記録する。

## 18. rg依存閉包実測結果(pitfalls#2、今すぐ全実測、C10是正)

```bash
$ rg -l "CarConfig\b" --type=ts
src/engine/vehiclePhysics.ts src/engine/trackPhysics.ts src/engine/destructionOrchestration.ts
src/engine/__tests__/vehiclePhysics.test.ts src/engine/__tests__/trackPhysics.test.ts
src/engine/__tests__/destructionOrchestration.test.ts src/materials/materialMapping.ts
src/materials/__tests__/materialMapping.test.ts src/materials/assumedGeometry.ts
src/store/gameStore.ts src/store/saveStore.ts src/store/runOutcomeApplication.ts
src/store/__tests__/gameStore.test.ts src/store/__tests__/saveStore.test.ts
src/store/__tests__/runOutcomeApplication.test.ts src/components/ExperimentNotebook.tsx
scripts/vehicleSweep.ts scripts/materialSweep.ts
（実装時、gearReflectedInertiaKgM2追加により影響を受けるのは型定義元〈vehiclePhysics.ts〉
+CarConfigリテラルを直接構築する全箇所——optional新規フィールドのため既存の大半の
構築箇所は無改修で動くが、上記全ファイルを実装時に再走査し、CarConfigを網羅的に
列挙・分解代入している箇所〈存在すれば〉がないかを確認する）

$ rg -l "DestructionFrameInput\b" --type=ts
src/engine/destructionModes.ts src/engine/destructionOrchestration.ts
src/engine/__tests__/destructionModes.test.ts src/engine/__tests__/destructionOrchestration.test.ts
（gearFrictionLossW/axleAngularVelocityRadS追加の影響範囲。4ファイルのみ、closureは小さい）

$ rg -l "buildVehicleFrameInput\b" --type=ts
src/engine/destructionOrchestration.ts src/engine/__tests__/destructionOrchestration.test.ts
（carConfig引数追加という破壊的シグネチャ変更の影響範囲。呼び出し元はstepTestRunWithDestruction・
stepTrackRunWithDestruction〈新設〉の2箇所、既存テストの直接呼び出し箇所も含む）

$ rg -l "D06Progress\b|D09Progress\b" --type=ts
src/engine/destructionModes.ts src/engine/destructionOrchestration.ts
（D06候補b/d選択後の型拡張、現状2ファイルのみ、production消費者ゼロ）

$ rg -l "D06CauseLog\b" --type=ts
src/engine/destructionModes.ts
$ rg -l "D09CauseLog\b" --type=ts
src/engine/destructionModes.ts
$ rg -l "ExperimentSession\b" --type=ts
src/materials/regressionDiff.ts src/store/saveStore.ts src/store/runOutcomeApplication.ts
src/components/ExperimentNotebook.tsx src/store/gameStore.ts src/store/notebookStore.ts
src/store/__tests__/saveStore.test.ts src/store/__tests__/notebookStore.test.ts
$ rg -l "CourseRunNotebookRecord\b" --type=ts
src/store/saveStore.ts src/store/runOutcomeApplication.ts src/store/notebookStore.ts
src/components/ExperimentNotebook.tsx
$ rg -l "VehicleTestRunNotebookRecord\b" --type=ts
src/store/saveStore.ts src/store/runOutcomeApplication.ts
$ rg -l "NotebookSlice\b" --type=ts
src/store/saveStore.ts
$ rg -l "PersistedSaveState\b" --type=ts
src/store/saveStore.ts
$ rg -l "appendNotebookRecord\b|addSessionRecord\b|addCourseRunRecord\b|replaceSessionsRecord\b" --type=ts
src/store/saveStore.ts src/store/notebookStore.ts src/store/__tests__/saveStore.test.ts
$ rg -l "\.d09\b|\bd09\??:" --type=ts
src/materials/__tests__/materialMapping.test.ts src/store/__tests__/saveStore.test.ts
src/store/__tests__/runOutcomeApplication.test.ts src/engine/destructionOrchestration.ts
src/engine/destructionModes.ts src/engine/__tests__/destructionModes.test.ts
src/engine/__tests__/destructionOrchestration.test.ts
$ rg -l "ApplyRunOutcomeError\b" --type=ts
src/store/saveStore.ts src/store/runOutcomeApplication.ts
$ rg -l "ValidateEquipmentLoadoutResult\b" --type=ts
src/store/runOutcomeApplication.ts
$ rg -l "RotorAssemblyState\b" --type=ts
src/materials/inventoryItem.ts src/store/saveStore.ts src/materials/degradationApplication.ts
src/materials/__tests__/degradationApplication.test.ts src/store/runOutcomeApplication.ts
$ rg -l "GearBreakageProfile\b" --type=ts
src/engine/destructionOrchestration.ts src/engine/destructionModes.ts
$ rg -l "MaterialSelection\b" --type=ts
scripts/materialSweep.ts src/materials/materialMapping.ts
src/materials/__tests__/materialMapping.test.ts src/store/__tests__/runOutcomeApplication.test.ts
$ rg -l "useGameStore\b" --type=ts
（E5是正、E8是正——旧`DESTRUCTION_PRODUCTION_WIRING_ENABLED`定数名rgは新設計〈GameStore state〉の
依存閉包になっていなかった。§11.2の`productionWiringEnabled`はGameStore既存stateへの1フィールド
追加であるため、依存閉包の対象は`useGameStore`自体を参照する全ファイルとなる。実測25ファイル
〈§11.0参照〉。実装時、この25ファイルのうち実際に`productionWiringEnabled`を読み書きする
箇所〈新規〉と、既存のGameStore全体をモック・初期化している箇所〈`productionWiringEnabled`の
既定値が意図せず変わらないか確認が必要な箇所〉を再実測し区別する）
$ rg -l "useSaveStore\.\|useNotebookStore\." --type=ts -- src/store/gameStore.ts
（gameStore.ts内部が既存singletonを直接参照する6箇所、§11.0実測。productionWiringEnabled追加は
これらの参照方法を変更しないため影響なし、確認のみ）
$ rg -l "computeRecipeKey\b" --type=ts
（0件、新規のため実装時0件から開始）
```

**所有境界付き要約**: notebook関連(`ExperimentSession`等)の依存閉包はalice所有ファイル2件(`runOutcomeApplication.ts`・定義の一部)+brabit所有ファイル6件(`saveStore.ts`・`notebookStore.ts`・`gameStore.ts`・`ExperimentNotebook.tsx`・関連テスト)に及ぶ——`finalDestructionState`legacy union化の実装は両者の協調作業になる。`CarConfig`の依存閉包は非常に広い(alice所有のengine/materials層+brabit所有のstore/scripts層の両方)が、`gearReflectedInertiaKgM2`はoptional新規フィールドのため大半の既存箇所は無改修で動く。

## 19. brabit UI計画への申し送り事項

### 19.1 `manualAbort`対応関係

`docs/phase3-p3-4-ui-plan.md`§4.4へ、§8.3の`manualAbort`対応関係(UIの`abortCourseRun`が`finalizeRun(accumulator, {kind:'manualAbort'})`を明示的に呼ぶ責務を持つこと)を追記するよう申し送る。

### 19.2 collapsed rotor拒否のUI表示経路

§15.2の`ValidateEquipmentLoadoutResult`の`destroyedRole`分岐を受け取った際、`reason`文言をそのまま表示する経路の実装をbrabit側へ申し送る。

### 19.3 regressionDiff `recipeKey`共同契約(E8是正・H2是正、beginRunActionでのexact 1回呼び出しを明記)

**v5の誤り**: 「`computeRecipeKey`をbrabit側から呼び出す」と書いていたが、§13.1のexact transport契約(E4是正)により、`recipeKey`はalice提供の`computeRecipeKey`が1回だけ計算されnotebook recordへ一方向複写される——という契約の骨格自体は正しかった。

**v8の誤り(H2是正)**: 「brabit側が`computeRecipeKey`を再呼出しすることはない」という表現が曖昧で、UI側で「brabitは`computeRecipeKey`を一切呼ばない」と誤読された。実際は§13.1の設計どおり、**brabit所有の`beginRunAction`がWear適用前のbase configに対してalice提供の`computeRecipeKey`をexact 1回呼び出す**——これは唯一かつ正しい呼び出し箇所であり、省略されるべきものではない。

是正後の正確な契約: **brabitは`beginRunAction`でexact 1回`computeRecipeKey`を呼ぶ。**それ以降——`RunSnapshot`作成後・notebook recordの保存後・`RegressionObservation`構築時——は一切再呼出しせず、`beginRunAction`→`RunSnapshot`→builder(§16.5)経由notebook recordという**一方向複写**、および永続化済みrecordの`recipeKey`フィールド(§16.1)の**読取りのみ**を行う(UIによる再計算はP3-1-Q9の単一出典原則に反する)。関数実装の所有はalice、呼び出し配線(`beginRunAction`内での実際の呼出し)の所有はbrabit。

### 19.4 production先行配線フラグ

§11の`productionWiringEnabled`(GameStore既存stateへの1フィールド追加、E5是正で旧`DESTRUCTION_PRODUCTION_WIRING_ENABLED`定数案から変更)の切り替えタイミング(G統合完了時の単一commit)を、`docs/phase3-p3-4-ui-plan.md`側のサブステップ計画と同期させるよう申し送る。

### 19.5 クロスレイヤゲート順の同期依頼

`docs/phase3-p3-4-ui-plan.md`のサブステップ計画を、本書§3.1のG1a(alice API)→G1b(brabit gameStore配線、offフラグ下)→G1c(統合確認)という3段階分割と同期させるよう申し送る。

## 20. arbiter判定結果(R1〜R27、旧「Fableへ求める判定」を確定事項へ更新、判定文2026-08-14)

**総合判定(判定文§2)**: 条件付き承認。実装開始を妨げる必須修正はM-1(1件、§9.2・§9.3・§12・§13.1・§14・§15・§16に反映済み)のみ。以下は判定文§4(必須回答2)のR1〜R27を、旧v10の「Fableへ求める判定」に代えて確定事項として記録する。番号はUI/engine不問の共通番号(判定文どおり)。**R18〜R26はUI/brabit所有**であり`docs/phase3-p3-4-ui-plan.md`側で反映済みのため、本節では一覧のみ引用する。それ以外(R1〜R17・R27)がengine/alice所有。

**D1由来**: なし(recipeKeyフィールド網羅の事実誤りは本書内で確定済みの機械的是正であり、判定を要する設計選択ではなかった)。

R1(§13.1、recipeKey搬送経路): **候補(a)確定**——`RunSnapshot`への独立フィールド追加、物理stepは読まない。`contractVersion`は2→3(E3是正どおり)。v2 snapshotの非救済(`unsupportedContractVersion`一貫拒否)確定——production配線前で実ユーザーデータが存在しないため救済対象が構造的に無い。**人間再承認**: 要(§20.5-A)。

R2(§13.2、recipeKeyへの素材ID): **含める確定。**`MaterialSelection`の5フィールド(wireId/magnetId/gearId/batteryId/brushId)を固定順でpayload先頭へ置く(§13.2のfields配列冒頭へ5フィールドを追加する形で改訂)。根拠: (i)数値タプルの偶然一致時に破壊特性〈D06閾値等〉が異なる走行が同一baselineへ混入する曖昧さを構造的に排除、(ii)spec §7.3-2の「同一レシピ」はプレイヤー概念として素材選択を含む、(iii)コストはキー長数十文字のみ。bodyIdは含めない(`MaterialSelection`外)。`RECIPE_KEY_VERSION`は1のまま最終形で開始。**人間再承認**: 要(§20.5-A)。

R3(§7.6・§7.7、D09劣化量供給): **承認確定**——config必須2フィールド→event複写→deriveはevent側のみ読む一方向契約(D07の`demagnetizationDeltaFraction`と同型)。**人間再承認**: 要(§20.5-E)。

R4(§7.7、D09被害記録): **候補A確定・候補B却下。**終端時にgear/bearing両diffを常時発行(v12既存契約維持)+`D09CauseLog`は終端瞬間の生boolean2値のみ(解釈済みoriginKindを持たない)。spec §1.2「答えを教えない、生の数値を見せる」に合致し、不正確な因果ラベルという欠陥クラス自体を除去する。表示は「事実の提示」に限る。**人間再承認**: 要(§20.5-E)。

R5(§9.3、D06 runtime etaレンジ): 2契約分離の**方向は承認**、ただし**M-1(vi)の3契約(契約0/契約1′/契約2)で置き換え済み**(§9.3参照)。9歯時数値安定性のG5必須化承認(最悪ケースは`eta≈0.042`、M-1(vi))。**人間再承認**: 不要(既存型の変更ではなく新規runtime関数の契約定義)。

R6(§9.1、D06トリガ): **候補b(累積曝露)を確定採用**(§9.1で反映済み)。`max(0,|loadTorqueNm|−threshold)×dt`積分、`toothFatigueExposureNmS`超過ごとに1歯喪失+カウンタリセット。候補d(歯噛合位相)は却下——高速域でむしろ候補bより速く崩壊しうるため。**人間再承認**: 要(§20.5-D)。

R7(§9.4、トルクリップル): **承認、専用位相アキュムレータ追加で確定**(§9.4で反映済み)。`D06Progress`へ決定論的な噛合位相アキュムレータ(rng非依存)を新設。エイリアシングは決定論的・有界(エネルギー非増加)であり実装コメントへ1行明記。`toothLossCount=0`での恒等性を回帰テストで固定。**人間再承認**: 要(§20.5-D、R6と同一の型変更に含まれる)。

R8(§7.5、D09入力物理式): **候補proxyを物理的に正当なものとして承認、代数的裏付け確定。**vehiclePhysics.tsの既存反射式(199行)より`P_out = eta×P_in`が恒等的に成立し、`P_loss = |loadTorqueNm×ω|×(1−eta)`——提示式は既存反射式の下でのギヤ噛合散逸パワーそのものであり二重計上ではない。D06→D09正帰還・D09自己正帰還(eta低下で(1−eta)と1/etaの両方が増加)は物理的直感と整合する意図的挙動として受容する(いずれも失速で自己制限)。付帯条件C-9でsweep定量化。**人間再承認**: 式が契約変更を伴わないため不要、ただし挙動確認はC-9でG5必須。

R9(§11.3、G統合後のフラグ): **(a)確定**——G9明示cleanupゲートで`productionWiringEnabled`と分岐を削除、全テスト/build/lint再実行、G8試遊は最終コードで行う。**人間再承認**: 不要(内部実装詳細)。

R10(§16.2、courseRuns/vehicleTestRunsのexport/import新設): **P3-4スコープ外と確定。**新機能追加でありPhase 3完成ゲートの必須要件ではない。申し送りとして§21対応表へ記録。`ExperimentSession`腕のversion 2化(R11)はP3-4必須(型変更の帰結)。

R11(§16.2、NotebookExport): **version 2方式+`sessions: StoredExperimentSession[]`(legacy/current混在union)確定。**履歴を捨てない・捏造しない・v1/v2別validator。交差不変条件`hasFinal===hasRecipeKey`込み。往復テスト必須(§22 DoD)。**人間再承認**: 要(§20.5-C)。

R12(§16.4、recipeKey外形検証): **確定**——`length>0`+`/^v[1-9][0-9]*\|/`、payload再parseなし。**人間再承認**: 不要(既存型の変更を伴わない検証ロジック追加)。

R13(§10.3、gear J反射式のeta要否): **etaを含めない`J_reflected = J_actual/gearRatio²`を確定採用。**慣性(エネルギー貯蔵)はetaが表す散逸と物理的に別物——質量反射項の`/eta`は損失を実効慣性へ繰り込んだ近似だが、質量項は走行中も`carConfig.gearEfficiency`(D06でstep毎に変動)を参照して自然に追従するのに対し、`gearReflectedInertiaKgM2`はcapture時固定のスカラーでありetaを焼き込むとD06劣化時に「古いeta」が固定される不整合を生む。実装コメントへ「質量項の/etaと意図的に異なる」旨と本裁定参照を1行残す。**人間再承認**: 要(§20.5-G、`CarConfig`破壊的フィールド追加のため)。

R14(§10.4、gear密度pending): **(c)を第一手、(a)を代替、(b)はtitaniumには禁止で確定。**順序: titanium(Ti-6Al-4V級)・POM・PA6の一次資料検証をG3内で試みる→検証不能な素材は既存`wire-silver-plated-copper`前例どおり明示`designAssumption`(候補出典コメント付き)で接続→接続見送り(b)はPOM/PA6に限り許容し、**titaniumへの適用は不可**(spec §4.2「チタンは砕けない代わりに重い」はtitaniumの存在意義そのもので、J未接続はnonBreakableだけが残る一方的優位を作り§1.2縮退戦略回避に反する)。付帯条件C-8(効果量の正直な報告)とセット。**人間再承認**: 要(§20.5-G)。

R15(§7.4、bearing軸=車軸側): **確定**——`BearingAssemblyState.gearItemId`の1:1対応・単一集約ギヤ比モデルの唯一の一貫した読み。`axleAngularVelocityRadS = ω_motor/gearRatio`確定。**人間再承認**: `CarConfig`拡張(R13)に付随。

R16(§7.9、D09 stalled競合): **許容確定**——摩擦増で焼付き前に失速するのは物理的に正当。sweep受け入れ(triggered:true到達構成が最低1つ存在)を維持。

R17(§15.3、burnedOut rotor): **collapsedと同様に装備拒否する、と確定**(§15.2・§15.3で反映済み)。D02発火到達=rotor個体焼損(v12 §3表、spec §7.1.1)であり、装備可能なまま残す根拠がない。`destroyedRole:'rotor'`(理由文言で崩壊/焼損を区別)。**人間再承認**: 要(§20.5-H)。

R18〜R26(UI/brabit所有、`docs/phase3-p3-4-ui-plan.md`側で反映済み、要旨のみ引用): R18 D07/D09専用視覚表現=候補1(既存性能低下表現のみ)確定。R19 D01/D07追加pitch変調=候補1(追加変調なし)確定。R20 D09焼付き音=候補1(固定周波数2音の急速切替)確定。R21 `SE_MASTER_GAIN`新設+モード横断単一SEバス正規化承認(初期候補BGM0.85/motor0.05/SE0.10)。R22 motor-only終了ライフサイクル=単一adapter集約承認。R23 ガウスメーター一式(価格800円固定仮値・D07初回発見後解禁・`InstrumentOwnership`新設・`SCHEMA_VERSION`1→2)確定。R24 staleLease=具体UI契約を設計しないことを承認。R25 検死レポート保存情報=`CodexRecordEntry`拡張(discoveryEvent+runDegradationDiffs)承認。R26 D06 SEのqueue/coalescing=深さ上限(初期候補3)+coalescingのハイブリッド条件付き承認。

R27(§14.1、gear-seizure→効率ペナルティ精密化): **承認+台帳精密化を確定。**v12 §1.2の「伝達効率はtoothLossCountから、摩擦はseizureFractionから独立算出」という文言は補完乗算合成値の物理流用禁止を主旨とする走行内派生の規定であり、次run反映(P3-4新設領域、§14.1)においてgear側seizure(噛合面のかじり=噛合摩擦=効率損失)を`gearEfficiency`へ写像することはこの主旨に反しない——ただし`computeCompositeGearDamageFraction`は引き続き経済専用であり物理経路から参照されないことを構造テスト(import/呼出し監査)で固定する(付帯条件C-10)。台帳へ`P3-4-R27`として記録する(無申告の再解釈を作らないため)。**人間再承認**: 不要(v12契約の精密化であり型変更を伴わない)。

### 20.5 人間再承認が必要な項目の単一一覧(A〜O: 判定文§8、必須回答7、重複なし。P: arbiter補足裁定HB-DEC-011ケースA Q8、新規)

**運用**: 本一覧は`docs/phase3-p3-4-ui-plan.md`側と共有する単一の一覧である(engine専属A〜I/UI所有J〜O)。重複記載はしない。承認手続き・承認記録は人間プロジェクトリードが行う(本書はA〜Pを網羅的に提示するのみ)。**A〜Oは2026-08-15に人間プロジェクトリードが既に明示承認済み(再承認不要)。Pは2026-08-16、人間プロジェクトリードが定型文「補足裁定判定文全体（Q1〜Q8・S-1〜S-10・N-1〜N-3）と項目Pを承認します。」で明示承認済み**(承認記録は`docs/phase3-p3-4-human-reapproval-bundle.md`「承認記録」参照)。

A. `RunSnapshot.recipeKey`必須追加+`contractVersion` 2→3+v2非救済+素材ID5フィールド包含(R1・R2、§13.1・§13.2)
B. notebook 3腕への`finalDestructionState`+`recipeKey`必須追加(P3-2-Q9実装)+Legacy union(`?:never`)+読取Stored union+3専用builder+共通validator(交差不変条件)(§16.1・§16.4・§16.5)
C. `NotebookExportV2`(version 1→1/2の2形式運用、sessions=union)(R11、§16.2)
D. D06契約変更一式: `D06Progress.cumulativeOverloadExposure`+噛合位相アキュムレータ`meshPhaseAccumulator`(R6・R7、§9.1・§9.4)+`DestructionConfig.d06.toothFatigueExposureNmS`+**M-1クロスラン会計契約**(initialDestructionState seeding〈§14.3〉・§14.1からの歯欠け因子削除・restore検証追加〈§13.1〉)
E. D09契約変更一式: `DestructionConfig.d09`の型完成(thermal/metalGearContactAlways/highLoadHighSpeed/2 deltaFraction)+`D09CauseLog`への生boolean2値+deriveのD09完成(R3・R4、§7.2・§7.7)
F. `DestructionFrameInput`への`gearFrictionLossW`/`axleAngularVelocityRadS`追加+`buildVehicleFrameInput`のcarConfig引数追加(破壊的シグネチャ変更、§7.3)
G. `CarConfig.gearReflectedInertiaKgM2?`追加(凍結コアへのoptional追加、既定0でV2回帰不変)+`gearInertia.ts`新設(`GEAR_ASSUMED_RADIUS_M`/`GEAR_ASSUMED_THICKNESS_M`の設計仮定値)(R13・R14、§10.3・§10.4)
H. `ValidateEquipmentLoadoutResult`への`destroyedRole`分岐+拒否3種(collapsed rotor/burnedOut rotor〈R17〉/全損gear〈M-1(v)〉)(§15.2・§15.3)
I. WearState→次run反映の新経路(`wearReflection.ts`+較正定数3種〈`BRUSH_WEAR_RESISTANCE_PENALTY`/`GEAR_SEIZURE_EFFICIENCY_PENALTY`/`BEARING_SEIZURE_FRICTION_PENALTY`〉、既存個体状態の実走行への初接続という挙動変更)(R27、§14.1)
J. `PersistedSaveState`への`InstrumentOwnership`追加+`SCHEMA_VERSION` 1→2+migration手順+失敗分類(R23、brabit所有)
K. `CodexRecordEntry`拡張(discoveryEvent+runDegradationDiffs、Jと同一migrationへ同梱)(R25、brabit所有)
L. ガウスメーター経済接続(価格800円仮値・D07発見後解禁・シルエット掲載)(R23、brabit所有)
M. `SE_MASTER_GAIN`新設+BGM/MOTOR再配分(mixLevels既存定数変更)(R21、brabit所有)
N. motor-only終了ライフサイクル+G9での旧経路削除(既存挙動変更)(R22、brabit所有)
O. 音・アートの適用例外2件: D07固有SE免除(spec §7.3がart-spec §8の包括文に優先するという裁定)+D01固有SEの新規追加(付帯条件C-1、brabit所有)
P. G1a′一式(arbiter補足裁定HB-DEC-011ケースA、Q1〜Q8): equipment→config導出resolver新設(Q1・Q2)+production baseline単一出典関数(Q4)+二層命名・単一出典契約(Q3、V2ラボ/診断の直接編集値が素材走行へ影響しなくなる挙動変更を含む)+beginRun合流(Q5)+G1a′ゲート新設とC-4最終DoD(Q6)。**2026-08-16、人間プロジェクトリードが定型文「補足裁定判定文全体（Q1〜Q8・S-1〜S-10・N-1〜N-3）と項目Pを承認します。」で承認済み**(詳細は`docs/phase3-p3-4-human-reapproval-bundle.md`の項目P、§20.8参照)。

### 20.6 付帯条件C-1〜C13(判定文§11、実装ゲート内で満たす)

C-1(G7着手前、docs反映+Suu照合): D01固有SEの欠落是正。art-spec §8はD01〜D09それぞれに固有SEを割り当てると定めるが、UI計画§8.3表はD01・D07に固有SEを持たない。D07はspec §7.1「無演出破壊ではない、§7.3の三段開示に従う」が優先し免除が正当——ただし本裁定を根拠に台帳へ記録し人間確認(§20.5-O)を得ること。D01には免除根拠がなく、D01用の継続系SE初期候補(noise系・決定論的・SEバス正規化対象)を追加すること(brabit所有)。
C-2: G3〜G5でP54/P55方式(許容赤の完全列挙+根因閉包判定)を最初から採用する(§17)。
C-3: `beginRunAction`の呼び出し順序で、`computeRecipeKey`呼出しの**前に**`materialComposedBase`(§12二層命名)の有限性検証を行い、throwが未捕捉例外としてUIへ漏れる経路を塞ぐ(検証失敗はbeginRun失敗`{ok:false}`へ、§14.2の拡張順序へ反映済み)。
C-4(arbiter補足裁定Q6でC-4最終DoDへ精密化): production `RunSnapshot`生成箇所(`beginRunAction`)の出典分裂横断監査(P60教訓)をG1a′・G1b・G6の3段階DoDへ明記——loadout・inventory・garageSelection・gameStore.configの読取りが各exact 1回であり、§14.2の1a〜8が単一経路を成し、`materialComposedBase`・`DestructionConfig`・`recipeKey`・実効configがすべて同一の`selection`実体・同一の読取り値から派生することを、呼出し回数モック+同一参照/同値assertで機械的に固定する形で(§22)。
C-5: G8試遊票へ「図鑑報酬・素材価格・ガウスメーター価格等の経済値は試遊用仮値(数値保証はPhase 5)」の注記を含める(brabit所有)。
C-6: D06 SE queueへ深さ上限(初期候補3)+超過coalesce(R26、brabit所有)。
C-7: リップルのエイリアシング事実の実装コメント明記+G5でのエネルギー非増加・決定論確認(R7、§9.4で反映済み)。
C-8: gear J効果量(titanium vs POMのタイム差)のsweep実測と正直な報告+<1%時のエスカレーション(R14・§17.3)。
C-9: D06→D09正帰還・D09自己正帰還の定量化をG5 sweepへ(発火後のゲージ進行加速率を記録し、NORMAL_OPERATION非到達・攻め構成有限到達の受け入れが両帰還込みで成立することを確認、§7.5・§17)。
C-10: `computeCompositeGearDamageFraction`が物理経路から参照されないことの構造テスト(R27、§14.1)。
C-11: M-1(vii)の負例3件(α/β/γ、§9.2)+§9(3)のD09負例を、期待する赤(注入値・期待パターン・期待パス)込みでDoDへ転記(§22)。
C-12: R25のcodex拡張に伴う交差不変条件負例(discoveryEventのみ/runDegradationDiffsのみの半状態を全復元経路で一貫拒否)をDoDへ(brabit所有)。
C-13: 台帳へ本判定の裁定(P3-4-R1〜R27+M-1)を追記し、両計画の該当節を改訂する(M-1のみ実装前必須、他は該当ゲート着手前まで)——本v11/v12改訂+`docs/phase3-plan-v12-amendments.md`への追記(§6)がこれに該当する。

### 20.7 推奨事項(判定文§12、承認条件ではない)

REC-1: §7.3の「既存11フィールド」は実測12フィールド(§2.2自身の列挙とも12、`currentA`〜`angularVelocityRadS`)——docs訂正を推奨。**A1是正で本改訂により反映済み**(§7.3を「既存12フィールド」へ訂正した、上記参照)。
REC-2: `LegacyXxx`型をbuilder入力に再利用する設計は健全だが、「Legacy(過去データ)」と「Draft(構築途中)」の二役が読み手を混乱させる——`type XxxRecordDraft = LegacyXxx`の別名導入を推奨(型実体は同一、コスト0)。
REC-3: `computeRecipeKey`の−0正規化はJSの文字列化仕様(`String(-0)==="0"`)により実質冗長——保持は無害だが、コメントに「防御的冗長」と一言添えることを推奨。
REC-4: D09専用視覚表現(白煙等)はPhase 6磨き込みでの再訪候補として申し送り(R18、brabit所有)。

**再提出要否・発効条件(判定文§13)**: arbiter再提出は不要——M-1・C-1のdocs反映が判定文の指定どおりである限り。実装解禁の条件: (1)M-1反映(両計画+台帳)+Suu_mot3照合、(2)§20.5の人間再承認一覧A〜Oの承認、(3)C-1はG7着手前まで、C-13の台帳追記はM-1と同時。以上の完了後、G1aから着手可。レビュー完了後もcommit・tag・pushはP3-4完了ゲートの通常経路(実装→実測報告→Suu照合→本役最終レビュー→人間commit承認)に従う。**G1aは2026-08-15に上記条件をすべて充足しSuu_mot3が正式通過を宣言した。**

### 20.8 補足裁定(HB-DEC-011ケースA、production config出典分裂、2026-08-16)

**総合判定**: 条件付き承認。G1a′新設(Q6)・resolver新設(Q1〜Q2)・二層命名(Q3)・baseline単一出典(Q4)・beginRun合流(Q5)を承認。G1aの再open範囲はなし(Q7)。人間再承認項目P新設を要する(Q8)。**Q1〜Q8の裁定内容は§4.4(Q1・Q2)・§12(Q3・Q4・Q5)・§3.1(Q6、G1a′ゲート)へ本改訂(v13)で自己完結反映済み。**

**条件S-1〜S-4・S-6〜S-10、および負例N-1・N-2前半・N-3の充足後にG1a′実装完了とみなす(arbiter追加裁定Q9、2026-08-16、人間承認済み)。S-5および負例N-2後半はQ9裁定によりG1b必須DoDへ移管する(契約内容は不変、検証時期のみ移動)**:
- S-1: resolverを`src/store/runOutcomeApplication.ts`へ新設し、引数型を検証済みnarrowing型とする。検証ロジックの再実装禁止(§4.4)。
- S-2: bodyId解決をS-1のresolver戻り値equipmentContextへ統合し、brabit側のインライン解決コードを設けない(§4.4)。
- S-3: production `MaterialCompositionBaseline`構築をalice所有の単一純関数へ集約し、cellSelectionをbatteryVoltage(1.5|3.0)からの全域写像で導出する。60/110/190g系(chassis.baseMassG)をbaselineへ使用しない(§12)。**P1是正(Suu_mot3指摘、2026-08-16)**: baseline関数はgarage build結果(=呼び出し元がexact 1回呼ぶ`resolveGarageBuild`の戻り値)を引数として受け取り、関数内部で`resolveGarageBuild`を再呼出ししない設計へ是正済み(単一呼び出し結果の受け渡しを引数経由で保証)。
- S-4: テスト・sweepを除く全productionコードで、`MaterialCompositionBaseline`のリテラル構築・`resolveChassisBaselineG`の直接呼出しがS-3関数**本体**以外に存在しないことをrg/import監査テストで固定する(C-10と同型)。**P2是正(Suu_mot3指摘、2026-08-16)**: 許可対象をファイル単位ではなくS-3関数本体の範囲(波括弧の対応関係で抽出)へ限定し、`.ts`/`.tsx`双方を走査対象とするよう是正済み(旧実装は許可ファイル内の関数外・`.tsx`の不正呼出しを見逃す偽陰性を持っていた)。
- S-5(**Q9裁定によりG1b必須DoDへ移管、検証時期のみ変更・契約内容は不変**): Q5の失敗時不変条件(nextRunSequence不変・pendingRunEquipmentSnapshot不変・RunSnapshot/RunAccumulator不生成・gameStoreローカルruntime state不変)を、resolver失敗・baseline/compose失敗・有限性検証失敗の各経路で個別にテスト固定する(§12)。**検証時期はG1b(beginRunAction配線と同一差分)。G1a′では関数自身の副作用非保有(純関数性: 引数以外を読まない・store/localStorage/sessionStorage/グローバル状態へ一切書き込まない・同一入力で同一出力・引数非破壊)のみを先取りして固定する(Q9裁定)。** テスト所有はalice(純関数・fixture提供)+brabit(beginRunAction配線・統合テスト本体)の共同、C-4監査のG1b段階分と同時充足する。「config構築失敗がrunSequence消費より前に確定する構築順序」の実装指針もG1bで扱う。
- S-6: 二層命名(rawPlayerConfig/materialComposedBase)を§12・§13.1・§13.2・§14.2の「base config」全出現箇所へ適用する——**本改訂(v13)で反映済み。**
- S-7: C-4最終DoD(Q6の文言)を§20.6のC-4および§22のDoD表へ転記する——**§20.6・§22ともに本改訂(v13)で反映済み。**
- S-8: 台帳(`docs/phase3-plan-v12-amendments.md`)へ本裁定をP3-4-S1〜S10として収録する際、依頼書実査への矛盾指摘4点(代入8系統・既存半確定規則・候補(a)原文の−40g矛盾式・解決関数不存在)を実測どおり記録する——**反映済み(P3-4-S1〜S10エントリ)。**
- S-9: §6の負例3件を、期待する赤(注入値・期待パターン・期待パス)込みでG1a′テストへ実装する。**P3是正(Suu_mot3指摘、2026-08-16)**: N-2前半のreasonをexact文言固定へ是正済み(下記N-2参照)。
- S-10: **人間再承認P(Q8)の承認を得るまでG1a′の実装(docs以外)に着手しないこと。** G1b解禁はG1a′完了(Q9改訂条件充足)+Suu照合後。

**負例仕様N-1・N-2前半・N-3(期待する赤まで指定、G1a′スコープ)+N-2後半(Q9裁定によりG1b移管)**:
- N-1(sourceWireMaterialId null防御): fixtureで`rotorAssemblies:[{assemblyId:'r1', sourceWireMaterialId:null, consumedWireM:1, collapsed:false, burnedOut:false}]`を直接注入し、検証済みloadoutでresolverを呼ぶ→期待: `{ok:false, missingRole:'rotor'}`かつreasonが導線材質不明を示す定型文。期待パス: resolverの防御的分岐(他のいかなる成功経路・throwにも入らないこと)。
- N-2前半(baseline範囲外→compose直接不開始、G1a′スコープ): S-3関数を経由しない値`{chassisBaselineG:10, baseGearEfficiency:0.8}`をcompose直接テストへ注入→期待: composeが`{ok:false}`(massG下限80g未満の範囲外reason)。**P3是正**によりexact reason(`'baseline+deltaが既存clamp範囲[80,250]gを外れました: 10'`)を固定し、部分成功値・throwのいずれにも入らないことをResult型判別+reason文言の両方で担保する。
- N-2後半(**Q9裁定によりG1b移管**): 上記と同じ失敗をbeginRunAction統合テストで再現し→期待: `{ok:false}`+S-5不変条件成立(nextRunSequence書込みなし・RunSnapshot不生成)。検証時期はG1b(beginRunAction配線と同一差分)。
- N-3(cell分裂の構造的不可能): production経路のrg監査(S-4)で、`resolveChassisBaselineG`直接呼出しが0件であることをassert→期待: 監査テスト自体が、意図的にダミー直接呼出しを追加した場合に赤へ転じること(監査の検出力確認、追加後revert)。注: N-3の検出力確認は一時ローカル変更のみで行い、成果物へ残さない。**P2是正後の検出力確認**: (1)同一ファイル内・S-3関数本体外への注入、(2)別productionの`.tsx`ファイルへの注入、の2ケースでいずれも赤へ転じることを確認済み(2026-08-16)。

**判定文§8モデル最終確定記述**: **判定作成モデル: claude-fable-5(人間PM確認済み)。起動時system prompt表示: claude-sonnet-5(履歴として記録)。**(全文は`docs/phase3-plan-v12-amendments.md`のP3-4-S1〜S10エントリを参照)。判定内容(Q1〜Q8・S-1〜S-10・N-1〜N-3)への影響はない。**再レビューは不要**とされた。(履歴: 当初の暫定訂正は「参加直後にclaude-fable-5へ切り替えられており、工程1返信〜受領照合〜判定文起草の一部または全部がFable 5で実行された可能性が高い」という不確定形だったが、後続の人間PM確認により上記確定記述へ上書きされた。)

**再提出要否・発効条件**: arbiter再提出は不要(Q8裁定)。判定の効力は人間プロジェクトリードの承認後に発生する(判定文§9、対象は本判定文全体+人間再承認項目P)。**人間プロジェクトリードが2026-08-16、定型文「補足裁定判定文全体（Q1〜Q8・S-1〜S-10・N-1〜N-3）と項目Pを承認します。」で判定文全体+項目Pを明示承認済み(Suu_mot3中継確認済み、詳細は`docs/phase3-p3-4-human-reapproval-bundle.md`「承認記録」参照)——判定文§9の効力発生条件は充足された。Suu_mot3独立照合の要修正9点のdocs-only反映もSuu_mot3が再照合し通過、engine計画v13+台帳改訂17+再承認バンドルPのdocsゲートを正式通過とした。** G1a′実装(resolver・baseline構築関数)を解禁し、alice_mot3が実装、Suu_mot3照合(初回P1〜P3是正+精度追補の3ラウンド)を経た。その過程で発見されたG1a′完了条件の循環(下記§20.9 Q9参照)については、Q9追加裁定+人間承認を経て解消した。**2026-08-16、Suu_mot3がG1a′を正式通過と宣言した(P4〜P8是正込みの独立照合、全体70ファイル/1470テスト・build・lint・material-sweep tsc・diff check・cmpすべてPASS)。次はG1b——brabitのUI計画Q9同期+Suu_mot3クロスレイヤ照合通過が着手の前提条件。**

**出典**: `docs/phase3-p3-4-production-config-source-review-request.md`(§11に受領記録)、`docs/phase3-p3-4-human-reapproval-bundle.md`(項目P)、`docs/phase3-plan-v12-amendments.md`(P3-4-S1〜S10エントリ、全文)。

### 20.9 arbiter追加裁定Q9(S-5/N-2後半のゲート循環解消、2026-08-16、自己完結反映——判定文原文の無改変引用は`docs/phase3-plan-v12-amendments.md`のP3-4-Q9エントリを正準参照とする、P4是正)

**契機**: G1a′初回実装報告に対するSuu_mot3レビューで、§20.8「条件S-1〜S-10全充足後にG1a′完了」と§3.1「beginRunActionへの配線はG1b、G1bはG1a′完了後に着手」が循環していることが発見された。S-5(失敗時不変条件: nextRunSequence不変等)とN-2後半(beginRunAction統合テストでの再現)はbeginRunActionへの統合を要求するが、その統合自体がG1b以降にしか行えないため、G1a′単体ではS-5が原理的に充足不能だった。alice/Suu_mot3は独断で先送りせず、arbiterへ追加裁定(Q9)を依頼して停止した。

**■0. 起草側欠陥の自己申告(arbiter原文、インシデント記録用)**: 本循環は、arbiter自身が条件S-1〜S-10の合成を値レベルで試した際に「単一構成での導出経路の整合」のみを検証し、**ゲート境界(所有境界×実装時期)を跨いだ充足可能性の照合を省略した**ことによる起草側欠陥である(arbiter.md §4「条件どうしの合成を値のレベルで試す」・§7「裁定条件の発行前に充足可能性を承認済み計画・木の状態と照合」の不履行)。alice/Suuの停止判断は正当であり、独断先送りしなかった運用は規律どおりである。本欠陥は叱責対象ではなく資産として記録する。

**■1. 裁定(Q9)**: **(a)を採用する。** G1a′完了条件を純関数側へ限定し、S-5+N-2後半をG1bの必須DoDへ移管する。確定内容:
1. **G1a′完了条件(改訂)**: S-1〜S-4、S-6〜S-10、および負例N-1・N-2前半・N-3の充足をもってG1a′実装完了とみなす。S-5とN-2後半はG1a′の完了条件から除外する。
2. **G1a′で担保する代替保証**: resolver・baseline構築関数・composeが**純関数であること**(引数以外を読まず、store/localStorage/グローバル状態へ一切書き込まないこと)をG1a′テストで固定する——S-5不変条件のうち純関数側で成立しうる唯一の部分は「関数自身が副作用を持たない」ことであり、これをG1a′で先取りする。
3. **G1bへの移管(必須DoD化)**: S-5の失敗時不変条件(nextRunSequence不変・pendingRunEquipmentSnapshot不変・RunSnapshot/RunAccumulator不生成・gameStoreローカルruntime state不変)を、resolver失敗・baseline/compose失敗・有限性検証失敗の各経路について、N-2後半の統合テストとともに**G1bの必須DoD**とする。G1b配線と同一差分内で実装し、G1bのSuu照合対象へ含める。「config構築失敗がrunSequence消費より前に確定する構築順序」の実装指針もS-5からG1bへ移動する。テスト所有はalice(純関数・fixture提供)+brabit(beginRunAction配線・統合テスト本体)の共同とし、C-4監査のG1b段階分と同時充足する。
4. **契約の不変性**: 本裁定はS-5/N-2後半の**検証時期と所有ゲートのみ**を変更し、不変条件の内容・失敗時の要求挙動・エラー型合流(Q5)・値・型は一切変更しない。
5. **(b)は却下**: G1a′をalice+brabit共同ゲートへ拡張する案は、人間承認済みのG1b定義(brabit所有・配線ゲート)を再分割し、所有境界で切ったゲート設計(確定-1〜-6・§3.1)自体を崩す。検証時期の整合という目的に対し過大な構造変更であり、採らない。

**■2. 付随回答**:
- **(i)人間再承認の要否**: 要——ただし新規バンドル項目の追加ではなく、**本Q9裁定文自体の人間承認**(全裁定共通の効力条件)で足りる。台帳・バンドルには「項目P追補(P-1): S-5/N-2後半の検証時期をG1bへ移管(契約不変、Q9裁定)」として項目Pと一体記録する。
- **(ii)docs修正文言(骨子)**: 本書§20.8・§3.1・§22・§14.2は上記骨子どおり本改訂(v14)で反映済み。UI計画側は次工程(brabit所有)。
- **(iii)arbiter再提出要否**: 不要——本Q9裁定(ケースA追加裁定)で完結する。以後もS-1〜S-10・Q9からの逸脱、または新たな充足不能が発見された場合は、その時点で追加裁定を求めること(独断先送りの禁止は本件で実証された運用どおり)。

**■3. Q9対象外3欠陥の扱いについて(arbiter確認)**: Suu検出の3欠陥(baseline関数のresolveGarageBuild再呼出しによる単一呼び出し結果違反/S-4監査の許可ファイル内違反・.tsx見逃し/N-2前半のreason・パス未固定)を「既裁定内の実装欠陥としてalice是正」とする整理に同意する。特に1点目はQ3/Q4が排除対象とした「同一事実の複数読取り」そのものであり、是正後のG1a′ Suu照合で単一呼び出し結果の受け渡し(引数経由)を明示確認すること。3欠陥の是正はQ9裁定の効力発生を待たず進めてよい(既裁定の枠内のため)。**2026-08-16、alice_mot3がP1〜P3として是正済み(§20.8参照)。**

**■4. 外部情報自己申告(HB-DEC-013)**: 判定作成モデルはclaude-fable-5(前回一体記録の申告と同一)。本判定は、Suu_mot3の裁定依頼文(2026-08-16T14:22)+arbiter自身の判定文(本セッション内で起草・送信済みの全文)+既読の固定入力(review-input・norm-input・clone・presented-g1a)のみを根拠とする。新たなファイル読取り・clone再接触は行っていない。engine計画v13・台帳改訂17・バンドルPの転記後文書は未受領・未読——§2(ii)の修正文言は骨子指定であり、転記後のSuu照合で意味保存を確認すること。

**■5. 効力**: 本判定の効力は人間プロジェクトリードの承認後に発生する。承認対象: 本Q9判定文全体(§1裁定+§2付随回答、項目P追補P-1を含む)。**人間プロジェクトリードが2026-08-16、定型文「P3-4追加裁定Q9判定文全体（S-5/N-2後半のG1b移管および項目P追補P-1を含む）を承認します。」で明示承認した(Suu_mot3中継確認済み)——Q9は発効した。**

**Q9反映後のG1a′ Suu_mot3照合(P4〜P8是正)**: Q9発効後、alice_mot3が①docs反映(engine計画v14・台帳P3-4-Q9エントリ・バンドル追補P-1)②G1a′純関数性テスト実装を行い報告したところ、Suu_mot3レビューでP4(台帳の「全文収録」主張と原文の不一致——見出し改変・§2(ii)圧縮・実装済み/承認済み注記混入)・P5(旧状態残存3箇所)・P6(純関数性の失敗分岐網羅不足)・P7(構造検査自体の恒久固定不足)の4点を指摘された。alice_mot3が是正(台帳を判定文原文の無改変引用ブロックへ改め実装状況は引用外へ分離、旧状態表現の現状化、N-1/N-2失敗分岐への純関数性assert統合、抽出範囲の恒久回帰テスト+禁止集合拡張〈use*Store一般形・.getState/.setState/.subscribe・Date.now/Math.random/performance.now/crypto・process一般形〉)して再提出、Suu_mot3のtargeted確認後、P8(引用先頭の見出し1行欠落)の追加是正を経て、**2026-08-16、Suu_mot3がG1a′を正式通過と宣言した**(独立照合: targeted 2ファイル/240テスト・全体70ファイル/1470テスト・build・lint・material-sweep tsc・diff check・cmpすべてPASS)。**G1a′のproduction/test追加編集はここで終了する。**

**出典**: Suu_mot3中継の全文agmsgメッセージ(2026-08-16T15:06:57Z)、人間承認同T15:06:57Z前後(Suu_mot3経由中継)。**本節は意味保存の自己完結反映であり、判定文原文の無改変引用は`docs/phase3-plan-v12-amendments.md`のP3-4-Q9エントリが正準参照。**

### 20.10 arbiter追加裁定Q11のalice担当分——Q-R3 正典run RNG(2026-08-18、人間再承認済み)

**位置づけ**: arbiter追加裁定Q11(RunSnapshotとlive開始入力の単一出典+finishAssemblyの原子的境界、2026-08-18、条件付き承認)のうち、**alice_mot3の担当はQ-R3(正典run RNG関数の新設)のみ**である。Q-R1(`RunPreparationRunKind`のmotorOnly腕へ`initialOmega: number`追加)・Q-R2(`beginProductionRun`へ`seed`引数追加)・Q-R4(live初期化規則・finishAssembly順序案A・S-5適用範囲の明文化)およびQ11-6の追加DoD a〜gの実装はいずれもbrabit_mot3所掌である(判定文■Q11-6)。判定文原文の無改変引用は決定台帳`docs/phase3-plan-v12-amendments.md`の`P3-4-Q11`エントリを正準参照とする。人間プロジェクトリードは2026-08-18、「P3-4追加裁定Q11判定文全体、および人間再承認デルタQ-R1・Q-R2・Q-R3・Q-R4を承認します。」で明示承認した(Suu_mot3中継確認済み)。

#### 20.10.1 Q-R3が必要になった理由(裁定■Q11-3 修正(ii))

live側のrunループが使う乱数は`gameStore.ts`の`nextRandom`(xorshift)である一方、P3-1-Q9が確立したリプレイ等価テスト規約はmulberry32(`snapshot.seed`)である。**同一seedでもアルゴリズムが異なれば系列が異なるため、seedを`runSnapshot.seed`へ単一出典化するだけでは「同一snapshotからの正直な再生」は成立しない。** そこで正典run RNGをmulberry32と確定し、production関数として単一のexportを新設する。true側のlive stepはこの正典関数を`runSnapshot.seed`で初期化して用いる。false側(V2旧経路)は`nextRandom`のまま無改修とする(裁定明示)。

#### 20.10.2 確定内容(名称・配置・公開signature)

| 項目 | 確定値 |
|---|---|
| 関数名 | `createRunRng` |
| 配置 | `src/engine/destructionOrchestration.ts` |
| 公開signature | `export function createRunRng(seed: number): () => number` |
| アルゴリズム | mulberry32(裁定確定、変更不可) |
| 所有 | alice_mot3 |

**命名の根拠**: 「run(走行)の正典RNG」であることが名称から判別でき、brabit所有のaudio用PRNG(`src/retro/audio/prng.ts`)およびテストヘルパ(`src/engine/__tests__/prng.ts`)と用途を取り違えない。裁定の例示名(`createRunRng`)をそのまま採用する。

**配置の最終判断と根拠(裁定は`destructionOrchestration.ts`を推奨としつつ最終判断をaliceへ委任)**: 推奨どおり`src/engine/destructionOrchestration.ts`とする。理由は3点。

1. **守る契約と同じ家に置く**: 正典run RNGが守る不変条件は「`RunSnapshot.seed`から決定論的にrunを再生できること」である。その`RunSnapshot`(seedの定義元、§483行付近)・`createRunAccumulator`・`restoreRunSnapshot`・`captureRunSnapshot`というリプレイ機構一式が同ファイルに揃っている。これはQ10 §8で`validateMaterialComposedBase`を「守る対象(`computeRecipeKey`の事前条件)と同一ファイル」である`recipeKey.ts`へ置いた判断基準と同一である。
2. **V2凍結面に触れない**: `destructionOrchestration.ts`はPhase 3拡張ファイルであり、仕様書§2の凍結対象(`constants.ts`・`motorPhysics.ts`・`vehiclePhysics.ts`・`commutator.ts`等)ではない。新規ファイル`src/engine/runRng.ts`案も検討したが、解決する問題がないままファイル数を増やすだけであり、既存のリプレイ機構から関数が離れる分だけ発見可能性が下がるため採らない。
3. **import循環を生じない**: `destructionOrchestration.ts`は`MotorConfig`/`CarConfig`等のengine型を参照する既存の依存方向のままで、新たな依存を追加しない(mulberry32は外部依存を持たない自己完結実装)。

**所有境界(裁定明示の禁止事項)**: brabit所有の`src/retro/audio/prng.ts`のmulberry32を**所有境界を越えて共有してはならない**。audio用途とrun物理用途は変更理由が異なり(前者は音響、後者はリプレイ決定論)、意図的重複が本プロジェクトの確立パターンである。

#### 20.10.3 既存P3-1-Q9リプレイ規約との接続

P3-1-Q9付帯条件(i)が定めるリプレイ等価テスト規約は、`RunSnapshot`から`createRunAccumulator`+wrapperで独立に再走行した結果が、live経由の結果と完全一致することを要求する。その際に使うRNGがmulberry32(`snapshot.seed`)である。Q-R3により、**live側も同一の`createRunRng(snapshot.seed)`を使うため、規約側とlive側のアルゴリズムが一致し、リプレイ等価が初めて成立する**。裁定のDoD-Q11-d(production経路のリプレイ等価)・DoD-Q11-e(RNG正典適合)はこの接続を実測で固定するものである。

#### 20.10.3.1 mulberry32実装の一元化(A-Q11-1、Suu_mot3照合により確定、2026-08-18)

Q-R3を新設すると、mulberry32の実装がengine配下で**3箇所に並存し得る**。DoD-Q11-eは正典系列との一致を固定するが、実装が複数あると片方だけが書き換わっても検出されない——これはQ10 §8で排除した「検査集合とthrow集合の二重管理」と同型の構造的リスクである。

**初回起草時のalice列挙は不完全だった**(production+`__tests__/prng.ts`の2箇所と記載)。Suu_mot3の独立`rg`照合により、`src/engine/__tests__/failures.test.ts:129`にも**ローカル定義のmulberry32**が実在することが判明した(`describe('diagnoseFailures(実際のstep()出力を使った統合テスト)')`内のローカル関数)。alice再実測でも同一の事実を確認した。

**確定(Suu_mot3判断、案1採用)**: engine側のmulberry32実装をproduction `createRunRng`へ**一元化する**。機械的追従のexact範囲は次の4点である。

1. `src/engine/destructionOrchestration.ts`へ`createRunRng`を実装する(唯一の実装)。
2. `src/engine/__tests__/prng.ts`は`createRunRng`へ委譲する**薄い互換wrapper**とする(既存consumerのimport名`mulberry32`は維持し、呼び出し側を無改修に保つ)。
3. `src/engine/__tests__/failures.test.ts`のローカル実装(129行)を削除し、上記wrapperまたは`createRunRng`を使用する形へ置き換える。
4. `src/retro/audio/prng.ts`(brabit所有)は裁定どおり**意図的な別実装として無改修**とする。所有境界を越えた共有は禁止であり、本一元化の対象外である。

#### 20.10.3.2 rg依存閉包(CLAUDE.md pitfalls#2、実測2026-08-18)

`rg`によるengine配下の`mulberry32`全出現を実測した結果、**実装2件(新設後は`createRunRng`を含め一元化により実装1件+wrapper1件)+`__tests__/prng.ts`のconsumer 7ファイル**である。機械的追従が必要な範囲は次のとおり。

| 分類 | ファイル | 追従内容 |
|---|---|---|
| 実装(新設) | `src/engine/destructionOrchestration.ts` | `createRunRng`を新規実装(唯一の実装) |
| 実装(既存・wrapper化) | `src/engine/__tests__/prng.ts` | ローカル実装を削除し`createRunRng`へ委譲。export名`mulberry32`は維持 |
| 実装(既存・削除) | `src/engine/__tests__/failures.test.ts`(129行) | ローカル実装を削除し、wrapperまたは`createRunRng`を使用 |
| consumer(無改修見込み) | `src/engine/__tests__/motorPhysics.test.ts` | import名維持のため無改修。回帰確認対象 |
| consumer(無改修見込み) | `src/engine/__tests__/motorPhysicsLoad.test.ts` | 同上 |
| consumer(無改修見込み) | `src/engine/__tests__/motorPhysicsSplitApi.test.ts` | 同上 |
| consumer(無改修見込み) | `src/engine/__tests__/motorPhysicsV15.test.ts` | 同上 |
| consumer(無改修見込み) | `src/engine/__tests__/vehiclePhysics.test.ts` | 同上 |
| consumer(無改修見込み) | `src/engine/__tests__/trackPhysics.test.ts` | 同上 |
| consumer(無改修見込み) | `src/engine/__tests__/destructionOrchestration.test.ts` | 同上。**特にP3-1-Q9リプレイ等価テスト(1420行・1956行・2246行・2331行の`mulberry32(snapshot.seed)`)が正典系列で走ることになり、Q-R3の意図と直結する** |
| 対象外(所有境界) | `src/retro/audio/prng.ts`(brabit所有) | 無改修。`src/retro/audio/synth.ts`・`reverb.ts`が参照するが、これはaudio用途の別実装であり本件と無関係 |

**エンジン凍結方針との関係**: 本一元化はテストヘルパの参照先変更と`destructionOrchestration.ts`(Phase 3拡張ファイル)への関数追加のみであり、V2凍結対象(`constants.ts`・`motorPhysics.ts`・`vehiclePhysics.ts`・`commutator.ts`・`failures.ts`本体等)のproductionコードには一切触れない。`failures.test.ts`はテストであり凍結面ではない。

#### 20.10.4 テスト(実装解禁後のDoD)

1. **既知系列の固定**: `createRunRng(seed)`が既知seedに対しmulberry32の既知系列(先頭N値)を返すことを固定する。アルゴリズムが将来書き換わった場合に検出する。
2. **決定論・独立性**: 同一seedの2インスタンスが同一系列を返すこと、異なるseedが異なる系列を返すこと、インスタンス間で状態が共有されないことを固定する。
3. **値域**: 返り値が常に`[0, 1)`に収まること。
4. **純粋性**: `createRunRng`本体がstore/localStorage/グローバル状態/`Date.now`/`Math.random`等を参照しないことを、G1a′で確立した構造検査(禁止グローバルパターン)と同一の作法で固定する。
5. **リプレイ接続**: DoD-Q11-d・DoD-Q11-e(brabit所有の統合テスト)へ、alice側は`createRunRng`とfixtureを提供する形で協働する(§3.1のG1b共同DoDと同じ分担)。
6. **既存全consumerの回帰(A-Q11-1確定に伴う必須DoD)**: §20.10.3.2の依存閉包に挙げた`__tests__/prng.ts`のconsumer 7ファイル(`motorPhysics` / `motorPhysicsLoad` / `motorPhysicsSplitApi` / `motorPhysicsV15` / `vehiclePhysics` / `trackPhysics` / `destructionOrchestration`の各`.test.ts`)が、wrapper委譲後も**無変更で全通過**することを確認する。import名`mulberry32`を維持するため呼び出し側の改修は生じない見込みだが、通過の実測をもって確認する。
7. **`failures.test.ts`の追従(A-Q11-1確定に伴う必須DoD)**: ローカル実装(129行)の削除後、`diagnoseFailures`統合テスト群が**同一の系列・同一の判定結果**で通過することを確認する。ローカル実装と`createRunRng`は同一アルゴリズム(mulberry32)であるため系列は不変であるはずだが、しきい値ベースの統合テストであり系列が変われば判定が動きうるため、通過の実測を必須とする。
8. **一元化の構造的固定**: engine配下にmulberry32のローカル再実装が再び現れないことを、`rg`相当の構造検査(`src/engine/`配下で`0x6d2b79f5`等のmulberry32定数リテラルが`destructionOrchestration.ts`以外に出現しないこと)で恒久固定する。これによりQ10 §8と同じく「二重管理が再発しないこと」を検査ではなく構造で担保する。

#### 20.10.5 Q11各条件とalice担当分の対応

| Q11条件 | 担当 | 本書での扱い |
|---|---|---|
| Q11-1(motorOnly `initialOmega`、防御throw) | brabit | 本節対象外。`MAX_FLICK_OMEGA=40`・`FLICK_INITIAL_OMEGA=15`は`src/engine/constants.ts`に実在(alice実測、無改修で流用可) |
| Q11-2(live vehicleStateはsnapshot由来deep copy) | brabit | 本節対象外 |
| Q11-3 修正(i)(`beginProductionRun`へseed引数) | brabit | 本節対象外(Q-R2) |
| Q11-3 修正(ii)(正典run RNG) | **alice** | **本節20.10.2〜20.10.4(Q-R3)** |
| Q11-4(finishAssembly案A) | brabit | 本節対象外(Q-R4) |
| Q11-5(公開契約変更4件) | 共同 | Q-R3のみalice。他3件はbrabit |
| Q11-6 DoD a〜g | brabit主、alice協働 | DoD-Q11-d/eへ`createRunRng`・fixtureを提供(20.10.4-5) |

**実装解禁**: 人間再承認(2026-08-18充足済み)に加え、**Suu_mot3の文書照合と明示解禁を経てから**。それまでQ11該当部分(P9/P13/P17)およびQ-R3のコード実装・テストは着手しない。

### 20.11 G3 C-8エスカレーションとG-R1(ギヤ実質量のmassG追加、2026-08-19人間再承認済み)

**経緯**: §10.3のギヤ反射慣性J接続を実装した結果、効果量が`jEff`比**0.006〜0.023%**(Ti対POMの差でも0.016ポイント)であることが実測で判明した。これは付帯条件C-8が定める**1%未満のエスカレーション条件**に該当したため、Suu_mot3経由でarbiter_mot3へ裁定を依頼した。

**確定した事実(alice_mot3・brabit_mot3・Suu_mot3・arbiter_mot3が独立に検算し一致)**: spec §4.2「チタンは砕けない代わりに重い(J増で加速鈍化)」の**J経路では意図が実現できない**。釘ローターの基礎慣性(`J_NAIL=2.0e-5`)がギヤ慣性(reflected 1.4〜5.3e-9)より3桁大きいためで、仮定幾何の選び方ではなく物理的スケールの問題である(効果を作るために幾何を実物大から動かすのは数値の捏造にあたるため選択肢に入れない)。

**G-R1(人間再承認済み2026-08-19、承認文「G-R1・G-R2を承認します」)**: specの意図は**実質量経路**で実現する。`composeConfigFromMaterials`の`massG`合成へ、装備ギヤとanchorギヤの**実質量差**を加算する。

- **差分方式を採る根拠(alice_mot3が実装事実で確定)**: V2の`chassisBaselineG`は標準ギヤを**暗黙包含**している——`partPresets.ts`の`GEAR_PRESETS`は質量項を持たず(chassis presetは`baseMassG`、battery presetは`massG`を持つのに対し)、`massG`は`chassis.baseMassG + battery.massG`のみで合成される。ギヤは走行に不可欠でありながらどこにも独立計上されていないため、110gが一式(ギヤ込み)の質量である。**絶対質量加算は二重計上になる。**
- **anchorの解決**: 素材IDをハードコードせず`GEAR_MATERIALS`の`isBaselineAnchor`から解決する(`resolveAnchorGearMaterial`、`assumedGeometry.ts`の導線・磁石anchor解決と同型)。本G3で`gear-pom`へ`isBaselineAnchor: true`を設定した(それまでギヤ族にanchorは未定義だった)。
- **anchor装備時はmassG不変**(差分0)でV2回帰を厳密に保つ。
- **幾何はJ経路と同一の単一出典**(`GEAR_ASSUMED_RADIUS_M`・`GEAR_ASSUMED_THICKNESS_M`)を共有し、同値リテラルを重複させない。
- **値はハードコードせず式から算出**する(密度差 × π r² t × 1000)。

**質量差分(独立検算済み、anchor=POM 1410 kg/m³)**: POM **0 g** / Ti-6Al-4V(4430) **+1.821621084 g** / PA6(1130) **-0.168892021 g** / PEEK(1300) **-0.066350437 g**。

**密度の出所(R14(c)一次資料検証)**: Ti-6Al-4V=4430(TIMET公式技術資料、本文直接確認)・POM=1410(Celanese公式製品マニュアル、本文直接確認)・PEEK=1300(Victrex公式、既存verified)はいずれも`manufacturerDatasheet` verified。**PA6=1130のみ**、BASF公式資料をSuu_mot3が視認確認したが公式PDFが画像のみ(テキスト層なし・暗号化)でalice_mot3環境では機械的検証が不能なため、**写像層の`designAssumption`として確認者・出典・将来の昇格条件を明記して扱う**ことを人間が承認した。

**効果量の正直な報告(C-8)**: 表示質量約**+1.82g**(Ti対POM)、平坦走行(15m test-run)の動的効果は**約0.1%オーダー**(実測: POM 14.3833秒 → Ti 14.4667秒、+0.0833秒=+0.58%)。**「1.21%の性能差」とは表現しない**(質量比の計算値であって走行結果の差ではないため)。質量線形効果はPhase 5で本格化する。

**DoD-C8の充足状況**: (a)J経路と質量経路の単一幾何出典=テストで固定 (b)exact質量差とanchor差分=式から算出して固定 (c)`computeEnergyBudgetJ`不変=実測で確認(POM/Tiとも80.000000 J、`massG`に依存しない) (d)平坦走行のTi対POM実測時間差=上記に記載 (e)表示質量の単位gとgear素材差の確認=**G7/G8へ申し送り**。

### 20.12 G-R3(D06閾値の再較正、2026-08-19人間再承認済み)

**経緯**: G3実装後、brabit_mot3のproduction入口探索とalice_mot3の検算により、`gearStrengthThresholdNm`の旧値(POM 0.4 / PA6 0.55 / PEEK 0.7 N·m)が**構造的に到達不能**であることが判明した。engineが比較する`frame.loadTorqueNm`はモーター軸換算(`vehiclePhysics.ts`の`loadTorqueUsed = fContact * wheelRadius /(gearRatio * eta)`)であり、`fContact`はタイヤのグリップ上限(μ×m×g)でcapされるため、**どれほど強いモーターでもタイヤが伝えられる力以上の負荷はギヤを通らない**。C-8と同じクラスの較正スケール不整合であり、alice_mot3がG3で閾値を導入した際に到達域を実測しなかったことが原因である。

**両側拘束の実測(alice_mot3、read-only sweep)**:
- **下限**: NORMAL_OPERATION基準構成 × 実在全5コース × 全3電池(15組合せ)の`max|loadTorqueNm|` = **0.003080 N·m**(hill-climbで最大、15組合せすべて歯欠け0・完走)
- **上限**: production-valid攻め構成 = **0.013544 N·m**(gr=2・車輪50mm・grip0.7・mass200/250、hill-climb)。完走構成に限定すると0.006164 N·m
- 旧値0.4はこの上限の**約30倍**(裁定§0の当初記載「約80倍」は上限を0.00484としていた際の値で、実測sweepにより訂正済み)

**探索方向の反直感性(両担当が一度誤った点、記録として)**: モーター軸換算は`/(gearRatio × eta)`であるため**低ギヤ比ほどトルクが大きい**。ただし低ギヤ比は登坂力を落とすため、**「登れる範囲での最小ギヤ比」が最大値を与える**。massは登坂可否に影響しない(必要力もgrip上限も質量比例で相殺)一方`F_grip`には比例する。alice_mot3・brabit_mot3とも当初は「モーターを強くする」方向に振って失速させ、下限を下回る値を上限と誤報告した。

**G-R3確定値(人間再承認文: 「G-R3(D06閾値の再較正)有限バンドル全文…を承認します」)**:

| 項目 | 旧値 | 新値 |
|---|---|---|
| POM `gearStrengthThresholdNm` | 0.4 | **0.00500 N·m** |
| PA6 `gearStrengthThresholdNm` | 0.55 | **0.00726 N·m** |
| PEEK `gearStrengthThresholdNm` | 0.7 | **0.00790 N·m** |
| `toothFatigueExposureNmS` | 0.5 | **0.0100 N·m·s**(G3暫定、体感の最終較正はG5) |
| チタン | `nonBreakable` | **不変**(数値閾値化しない) |

**相対比のアンカー(裁定■1条件1)**: 指標は3素材で揃う**引張降伏応力**とした——曲げ強度はPOM公式資料に記載がなく(Celanese公式マニュアル本文を機械検索し`flexural strength`0件、ISO 178欄は弾性率のみ)、3素材で揃わないため。
- POM **62 MPa**: Celanese公式 Hostaform POM Product Manual、ISO 527、23°C、標準未充填
- PA6 **90 MPa(dry)**: BASF公式 Ultramid B3S Product Datasheet、ISO 527-1/-2、23°C、50 mm/min、未充填。**Suu_mot3が本文で確認**した値であり、alice_mot3側は当該PDFが画像のみ(テキスト層なし・暗号化)のため**独立確認できていない**(二者一致ではない)
- PEEK **98.0 MPa**: Victrex公式 PEEK 450G Datasheet、ISO 527-2、23°C、未充填
- 比 62 : 90 : 98 = 1 : 1.4516… : 1.5806…。採用値の比率誤差は **PA6 0.027% / PEEK 0.041%**(5桁採用による。4桁ではPA6が0.578%と一桁大きく、比率が教育的価値の担い手であるため5桁を採用した)

**PA6のdry値採用理由**: conditioned(45 MPa)を採用しない。現行モデルは湿度状態を持たず、吸湿差をランタイムへ持ち込むとスコープを拡大するため。**実機では吸湿により実効強度が最大で約半分まで低下しうる**ことを承知のうえでの設計上の割り切り(designAssumption)である。湿度モデル・強度フィールドは追加しない。

**絶対スケール = 衝撃・疲労換算係数80のdesignAssumption(裁定■1条件2)**: 実効閾値 = 静的強度相当値(POM 0.4 N·m) ÷ 80。実世界の歯欠けは定常トルクではなく、ジャム・衝突・急停止でミリ秒に集中する**過渡衝撃**と疲労で起こる。simの`loadTorqueNm`は定常量であり、実物の静的強度と直接比較する限りD06は物理的に正しく「発火しない」。係数80はその過渡増幅を1つの明示的な数値へ抽象化したものであり、**「POMの歯が静的0.005 N·mで折れる」という主張ではない**。

**理論1本目時間(上限0.013544 N·m持続時)**: POM 約1.170秒(140 step)/ PA6 約1.591秒(191 step)/ PEEK 約1.772秒(213 step)。いずれも計画§9(2)の「1本目まで0.5〜10秒」に収まり、強い素材ほど遅く壊れる順序も保たれる。**体感の最終較正はG5**で行う(P3-3-Q15-1の較正値ディシプリン)。

**過剰設計防止(裁定■停止条件)**: `GearMaterial`への強度フィールド、湿度状態、新規公開型・新規契約はいずれも追加しない。chassis massG論点は本件から分離し、G-R1領域の独立台帳項目として扱う。

## 21. 対応表(P3-3報告§13・P3-2報告§12・amendments.mdとの整合証明)

| 出典 | 項目 | 本書での対応節 |
|---|---|---|
| P3-3報告§13-1 | D09摩擦増のみ非終端負例 | §7.9 |
| P3-3報告§13-2 | D02/D04/D05/D07個体WearState→base config共通反映 | §14 |
| P3-3報告§13-3 | collapsed rotorの装備拒否 | §15 |
| P3-3報告§13-4 | production DestructionConfig/gameStore/UI初回配線 | §4(全体)・§11(露出制御) |
| P3-3報告§13-5 | snapshot唯一出典の徹底 | §8.2(track wrapperがtest-run版と同一パターン)、§4.3・§13.1(recipeKeyは`RunSnapshot`へ独立フィールドとして同居させ〈E4是正でRunSnapshot外配置案から訂正〉、走行中/pending中の権威値とする。永続化後は各notebook recordの`recipeKey`が権威値となる二段階の唯一出典設計)・§14.2・§15(いずれも`RunSnapshot` capture時1回のみ) |
| P3-3報告§13-6 | Q9 finalDestructionStateノート追加検討(D09等将来モードへの適用可否) | §7.7(D09自体がP3-4対象のため、causeLog設計が実質的に包含) |
| P3-3報告§13-7 | D01外部駆動floor潜在挙動 | 対象外(Phase 5申し送り、P3-4スコープ外) |
| P3-3報告§13-8 | 配線時bundle不連続増加の想定 | `docs/phase3-p3-4-ui-plan.md`§12(brabit所有) |
| P3-3報告§13-9 | P3-2-Q9裁定(finalDestructionState/案B/実装P3-4) | §16(本書が実装設計そのもの) |
| P3-2報告§12 | D04途中段階終了時のノート記録契約(Q9案B) | §16 |
| P3-2報告§12 | `RunSnapshot`拡張のtrack-run実装、P3-1-Q9単一出典不変条件の引継ぎ | §8.2 |
| P3-2報告§12 | derailed/energyExhaustedのtrack-run文脈での必須網羅(Q8) | §8.4 |
| P3-2報告§12 | regressionDiffの実行タイミング・永続化・UI表示 | §19.3(brabit裁量部分)・§13(recipeKeyのみ共同契約) |
| P3-2報告§12 | `assembleD04Config`相当の実装 | §4.2(`mapD04BatteryDestructionConfig`+`mapBodyScorchDeltaFraction`+`mapMagnetScorchDeltaFraction`の3関数合成として、既存Gate2〜5で個別に実装済み。単一の"assembleD04Config"という名前の関数は存在せず、本書§4.2の`assembleDestructionConfig`内でこの3関数を呼ぶ形でその役割を果たす) |
| P3-2報告§12 | Q13-1保留規則の共通純関数継承 | §8.2(明示的に`normalizeOverheatedStatusForD04Hold`を再利用) |
| P3-2報告§12 | 正式M5(ii) UI整合 | §16(finalDestructionState実装) |
| amendments.md P3-0-Q2 | production DestructionConfig配線のP3-4実施 | §4(全体) |
| amendments.md P3-1-Q9 | Phase 3 wrapper共通不変条件 | §8.1〜§8.6 |
| amendments.md P3-2-Q8 | track-run×derailed/energyExhausted必須網羅 | §8.4 |
| amendments.md P3-2-Q9 | finalDestructionState案B、実装P3-4 | §16 |
| amendments.md P3-3-Q11 | brush.wearFraction次run反映のP3-4据え置き | §14.1(brush含む横断設計に統合) |
| amendments.md P3-3付帯条件(4) | collapsed rotorの装備拒否をP3-4申し送り | §15 |
| phase2-report §9.1(163行) | ギヤJ/D06接続をD06実装時に判断 | §10(本書が実装設計そのもの) |
| phase2-material-sweep-report(104行) | ギヤ質量・Jの接続はD06とセットで判断 | §10 |

## 22. DoD(全体、spec§12契約マトリクス全項目の実体化、alice/brabit所有者付き)

`npm run test && npm run build && npm run lint`成功に加え、次を満たすこと(各項目に所有者を明記):

| DoD項目 | 内容 | 所有者 |
|---|---|---|
| 状態遷移 | D06(健全→歯欠け×N→全損)・D09(健全→摩擦増→焼付き)の全状態遷移を単体テストで固定 | alice |
| 境界直前 | D06の`toothLossCount=9`(全損直前)・D09の`bearingHeatGaugeRatio`がlimit直前で正常値を返すことを直接assert(§9.2・§9.3) | alice |
| 反復event | D06の歯欠けごとのevent発行(`isFirstThisSession`区別込み)を既存D05パターンと同型でテスト | alice |
| P3-0-Q6同時diff | D06/D09を`advanceDestructionState`のホワイトリストへ追加する際、同一ゲート内で`deriveDegradationDiffs`のD06/D09分岐が対応する差分換算を持つことをテスト(D06は既存実装を活用、D09は§7.7で新規実装) | alice |
| temperature | D06=`{kind:'unavailable'}`(熱ゲージ概念なし)、D09=`{kind:'uncalibratedGauge',ratio:bearingHeatGaugeRatio}`(D02/D07と同型)をテストで固定 | alice |
| physicsSnapshotAtT | D06/D09のeventが`stampPhysicsSnapshot`経由で正しい物理スナップショットを保持することを既存パターンで確認 | alice |
| isFirstThisSession | D06/D09のevent`isFirstThisSession`が既存D01〜D07と同型の意味論(初回発見判定用)を持つことを確認 | alice |
| 同一step終端 | destructionTerminal優先の同一step境界(§8.3)をD06/D09発火経路で追加テスト | alice |
| 全endReason1回適用 | `performApplyRunOutcome`呼び出しがちょうど1回であることを、D06/D09発火を含む全経路でモック呼び出し回数により検証 | brabit(配線後の確認、既存v5計画の申し送りをD06/D09にも拡張) |
| snapshot/replay | §8.6のリプレイ等価性テスト(D06/D09が発火する非自明経路) | alice |
| legacy read | §16.4のdeep validationにより、`finalDestructionState`欠落record(legacy)+存在record(P3-4以降)の両方を正しく読めることをテスト | alice(validator)+brabit(実際の永続データでのE2E確認) |
| recipeKey | §13.2の`computeRecipeKey`が-0/NaN/Infinity入力で正しくthrow/正規化することを単体テスト、同一構成で同一キーになる冪等性テスト | alice |
| lease/pending | 既存SaveGate分岐(破損>待機>保留中>通常)が、D06/D09を含む全モードのrun適用で意図どおり機能することのE2E確認 | brabit |
| UI/a11y | D06/D09のHUD表示・演出・SEが既存パターン(art-spec §6・§8)に従うこと、色だけに依存しない状態表示、キーボード操作可能性 | brabit |
| 試遊 | D06/D09を含む全8モードが実際に人間試遊で発生・確認できること | 全員(§3.1 G8) |
| context×mode到達可能性 | §17.1のマトリクス(正例22件+構造負例)+§17.2のproduction-valid到達可能性sweep | alice |
| stalled競合 | §7.9のD09 stalled優先競合を許容する構成の存在確認 | alice(sweep) |
| gear J | §10.4のgear密度pending問題への裁定結果に基づくJ接続実装(pending素材が対象外となる場合はその旨をテストで明記) | alice |
| bundle | production配線後もbundle size(現状790.97kB/gzip 221.23kB)が1MB未満を維持することを実測 | brabit(実装後実測)+alice(engine側の増分寄与を事前見積り) |
| pitfalls#2 | §18の依存閉包を実装着手前に再実測し、本書へ転記 | alice |
| 破壊的型変更再承認 | §20.5(人間再承認一覧A〜O)に基づく人間再承認 | 人間プロジェクトリード |
| G7先行完成(H1/C-1) | UI(G7)がG統合より前に完成し、D01固有SE(C-1)を含めて着手すること(H1是正・C-1) | brabit |
| C-3 beginRun検証順序 | §14.2の拡張順序どおり、`computeRecipeKey`呼出し前に`materialComposedBase`の有限性検証を行い、throwが未捕捉のままUIへ漏れないことを確認(C-3) | alice(設計)+brabit(配線確認) |
| C-4 出典分裂横断監査(arbiter補足裁定Q6でC-4最終DoDへ精密化) | `beginRunAction`内でloadout・inventory・garageSelection・gameStore.configの読取りが各exact 1回であり、§14.2の1a〜8が単一経路を成し、`materialComposedBase`・`DestructionConfig`・`recipeKey`・実効configがすべて同一の`selection`実体・同一の読取り値から派生することを、呼出し回数モック+同一参照/同値assertで機械的に固定(C-4、P60教訓)。G1a′(純関数側の単一出典)・G1b(配線側、現存6段分)・G6(8段全体の再固定)の3段階で充足 | alice+brabit |
| G1a′ resolver(S-1・S-2) | `deriveMaterialSelectionFromEquipment`相当がvalidateEquipmentLoadoutを再実装せず、bodyId解決を統合していることをテストで固定。N-1負例(sourceWireMaterialId null防御)を実装 | alice |
| G1a′ baseline単一出典(S-3・S-4) | production `MaterialCompositionBaseline`構築がalice所有の単一純関数のみから行われ、chassis.baseMassG(60/110/190g)を使用しないこと、S-3関数**本体**以外に`MaterialCompositionBaseline`リテラル構築・`resolveChassisBaselineG`直接呼出しが存在しないことをrg/import監査テストで固定(.ts/.tsx双方走査、N-3の検出力確認込み〈同一ファイル内・関数外+別.tsxの2ケース〉、成果物への一時変更混入なし)。baseline関数はgarage build結果を引数で受け取り内部で`resolveGarageBuild`を再呼出ししないこと(単一呼び出し結果の受け渡し) | alice |
| G1a′ N-2前半(compose直接) | S-3関数を経由しない範囲外baseline(chassisBaselineG=10)を`composeConfigFromMaterials`へ直接注入し、massG下限80g未満のexact reasonで`ok:false`になることをResult型判別+reason文言の両方で固定 | alice |
| G1a′ 純関数性(Q9代替保証、arbiter追加裁定Q9・§20.9) | resolver・baseline構築関数・`composeConfigFromMaterials`が、引数以外を読まない・store/localStorage/sessionStorage/グローバル状態へ一切書き込まない・同一入力で同一出力・引数非破壊であることを構造検査+テストで固定する。S-5不変条件のうち純関数側で成立しうる部分をG1a′で先取りする | alice |
| G1b beginRun失敗時不変条件(S-5、arbiter追加裁定Q9によりG1a′から移管) | resolver失敗・baseline/compose失敗・有限性検証失敗の3経路×`nextRunSequence`不変・`pendingRunEquipmentSnapshot`不変・`RunSnapshot`/`RunAccumulator`不生成・gameStoreローカルruntime state不変の4不変項目をbeginRunAction統合テストで固定。N-2後半負例(beginRunAction経由での範囲外baseline失敗再現)を実装。「config構築失敗がrunSequence消費より前に確定する構築順序」もここで実装。G1b配線と同一差分内、C-4監査のG1b段階分と同時充足 | alice(fixture提供)+brabit(配線・統合テスト本体)共同 |
| G1a′ 人間再承認P(+追補P-1) | §20.5(項目P、arbiter補足裁定HB-DEC-011ケースA Q8)に基づく人間再承認(2026-08-16承認済み)+追補P-1(arbiter追加裁定Q9、S-5/N-2後半のG1b移管、2026-08-16人間承認済み)。Suu_mot3独立照合(9点是正+P1〜P3是正+精度追補+P4〜P8是正)を経て**2026-08-16、G1a′正式通過**。G1a′のproduction/test追加編集はここで終了 | 人間プロジェクトリード |
| C-9 正帰還定量化 | D06→D09正帰還・D09自己正帰還がG5 sweepでNORMAL_OPERATION非到達・攻め構成有限到達の受け入れを満たすことを実測(C-9) | alice(sweep) |
| feature gate | §11.3の機械的検証(`useGameStore.getState().productionWiringEnabled`の実挙動が`false`であることの確認)が**G1〜G7期間中**(H1是正でG7を含む)CIで維持、G統合commitでのみ初期値`true`へ切替。§11.2の既存reset規律への相乗り(E5是正)により新規のtest分離機構は不要 | brabit |
| G9(code cleanup) | §11.3のG9(明示的cleanupゲート)で`productionWiringEnabled`削除後、全テスト/build/lintを再実行(E5是正、docs-only扱いを撤回) | brabit |
| D09 deltaFraction候補・積分境界 | §7.6の`bearingHeatGaugeRatio`更新式(conduction/dissipation/dt/clamp)がthreshold境界で正しくclampされること、§7.7の`D09_GEAR_SEIZURE_DELTA_FRACTION`/`D09_BEARING_SEIZURE_DELTA_FRACTION`が単体テストで固定されることを確認(D3是正、D10) | alice |
| D09 origin履歴 | R4確定(候補A)により、`D09CauseLog`の`metalGearContactActive`/`highLoadHighSpeedActive`が終端瞬間の値を正確に記録することをテスト(D4是正、F1是正、R4) | alice |
| D06 effective eta拡張レンジ+9歯数値安定性 | §9.3の契約2(`0<eta<=base_eta`、base_etaは契約1′)がvehiclePhysics.tsで有限・決定論的に動くことの解析的証明+9歯損傷+seizureFraction最大の最悪ケース(`eta≈0.042`)での数値振動不在をsweepで確認(D5是正、M-1(vi)) | alice(証明)+alice(sweep) |
| D06クロスラン会計(M-1) | §14.3のseedingが装備ギヤ個体の永続`toothLossCount`から`initialDestructionState.modes.D06.toothLossCount`を正しく初期化すること、§13.1の`restoreRunSnapshot`が範囲外値(`>=10`)を`invalidSchema`で拒否すること、§15.2の全損gear装備拒否、M-1(vii)の負例(α)(β)(γ)(§9.2)をすべてテストで固定(M-1、C-11) | alice |
| gear-seizure構造テスト | `computeCompositeGearDamageFraction`(経済専用)が物理経路(`applyWearToCarConfig`・`composeD06RuntimeEffect`等)から一切import・呼出しされないことをimport/呼出し監査で固定(R27、C-10) | alice |
| recipeKey transport/reload retry | §13.1のexact transport(beginRun capture→RunOutcome→PendingNotebookRecord→pendingApplication永続化→reload retry→履歴保存)が実際に機能し、reload/retry後もrecipeKeyが失われないことをE2Eテストで確認(D2是正、D10) | alice(transport設計)+brabit(E2E確認) |
| recipeKeyブラシratio差 | §13.2の`brushContactResistanceRatio`/`brushChatterProbabilityRatio`が異なる2構成が異なる`recipeKey`を生成することを単体テストで確認(D1是正、D10) | alice |
| pending legacy拒否 | §16.4のpending専用validator(`isValidPendingExperimentSession`等)が、両フィールドなし(legacy形状)のrawを明示的に拒否することを直接テスト(G1是正) | alice |
| v2 mixed history export/import | §16.2のNotebookExportV2がlegacy/current混在の`sessions`を欠落なくexport/importできること(往復テスト)、legacy要素にfinalDestructionState/recipeKeyが捏造されないことを確認(G2是正) | alice(型・validator設計)+brabit(実際のexport/importフロー実装・E2E確認) |
| recipeKey非空/形式負例 | §16.4の`recipeKey:''`・`recipeKey:'not-an-envelope'`が3腕・pending・save restore・JSON v2 importの全経路で一貫して拒否されることを確認(G3是正) | alice |

---

**手続きに関する注記(A5是正、2026-08-18現状化)**: 本書はalice_mot3が作成したdocs-only計画である。正式arbiter技術レビュー(判定文2026-08-14、条件付き承認)は**完了済み**——M-1・R1〜R27・人間再承認一覧A〜O・付帯条件C-1〜C13・REC-1〜4はすべて本書へ反映済みである(v11、A1〜A5是正はv12、HB-DEC-011ケースA反映はv13、Q9反映はv14)。**本書の現行版はv15である**(v15=Q10 §8補足裁定の相互参照+Q11のalice担当分Q-R3の反映、§20.10)。

**承認・通過済みの事項**: 人間再承認一覧A〜O(§20.5)は2026-08-15に全15項目が人間プロジェクトリードにより明示承認済み。項目P(HB-DEC-011ケースA判定文全体)およびその追補P-1(Q9)は2026-08-16に明示承認済み。G1a(2026-08-15)・G1a′(2026-08-16)はいずれもSuu_mot3が正式通過を宣言済みで、G1a′のproduction/test追加編集は終了している。arbiter追加裁定Q10(G1b beginRunActionのクロスストア原子的境界、2026-08-18・条件付き承認)およびQ10 §8補足裁定(`validateMaterialComposedBase`の設計確定、2026-08-18・条件付き承認)はいずれも受領済みで、本書への反映(§12の相互参照)は完了している。

**残る条件(この順に充足する)**: (i)人間再承認項目Q(Q10および§8補足裁定に伴う新規公開契約——`snapshotCaptureFailed`失敗腕、`RunPreparationResult`/`RunPreparationCallback`/`beginRunActionWithPreparation`/`prepareDestructionRun`、ならびにP-Q10-A1・A4・A5)の人間承認**——2026-08-18に充足済み**、(ii)`validateMaterialComposedBase`(`src/materials/recipeKey.ts`、alice所有・新規)の実装と、alice設計回答v2 §9のテスト#4(件数固定、公開APIのみ)・#5(双方向同期)を含む完了報告を、**全文出力および終了コード付きで**提出すること(要約報告は禁止)、(iii)Suu_mot3によるG1bの明示解禁。

**人間プロジェクトリードによる正式承認(2026-08-18、Suu_mot3中継、原文どおり)**:

> P3-4追加裁定Q10判定文全体（A3採用・snapshotCaptureFailed新設）および§8補足裁定判定文全体と、項目Q（brabit担当分の新規公開契約およびalice担当分P-Q10-A1・A4・A5）を承認します。

この承認により、Q10本裁定・§8補足裁定の効力条件と項目Qの人間再承認は充足された(上記(i))。**(ii)のalice担当分(`validateMaterialComposedBase`の実装+設計v2 §9のテスト)は2026-08-18に実装し、Suu_mot3の独立照合を経て正式通過した**(targeted 70/70・全体70ファイル1526/1526・build・lint・material-sweep tsc・`git diff --check`・`cmp`いずれも終了コード0、公開exportは`RECIPE_KEY_VERSION`/`computeRecipeKey`/`validateMaterialComposedBase`の3件のみ)。同日、Suu_mot3がbrabit_mot3へG1bを明示解禁した(上記(iii))。

**arbiter追加裁定Q11(RunSnapshotとlive開始入力の単一出典+finishAssemblyの原子的境界、2026-08-18、条件付き承認)**: Q11-1(motor-onlyの`initialMotorState`は`{...REST_STATE, omega: clamp済み初速}`、`RunPreparationRunKind`のmotorOnly腕へ`initialOmega: number`を必須追加)・Q11-2(live `vehicleState`は`runSnapshot.initialVehicleState`のdeep copy)・Q11-3(live seedは`runSnapshot.seed`を唯一の出典とし、`beginProductionRun`へ`seed`引数を追加。正典run RNGをmulberry32と確定)・Q11-4(finishAssemblyは案A=config永続commit成功後にbegin)・Q11-5(公開契約変更4件=Q-R1〜Q-R4)・Q11-6(追加DoD a〜g)。**alice担当はQ-R3(正典run RNG関数の新設、名称・配置はalice確定)のみで、他はbrabit所掌である。**

**人間プロジェクトリードによる正式承認(2026-08-18、Suu_mot3中継、原文どおり)**:

> P3-4追加裁定Q11判定文全体、および人間再承認デルタQ-R1・Q-R2・Q-R3・Q-R4を承認します。

この承認により、Q11裁定の効力条件およびQ-R1〜Q-R4の人間再承認条件は充足された。**Q11該当部分(P9/P13/P17)の実装解禁は、Suu_mot3の照合と明示解禁を経てからである。**

**Q10旧§1〜§7の条件(A3のtry/catch+runtime状態リセット、runKind/`equipmentSnapshot.context`整合性assertion、UI計画§6.4.1のラベル改称等)は補足裁定によって変更・免除されず、すべて継続して有効である。**

**実装は未解禁である。** production/test/scripts/components編集・実装・commit/tag/pushは、上記(i)〜(iii)をすべて経て実装解禁が出るまで一切行わない。
