# Phase 3 P3-4実装前計画v14: production配線+UI/演出+人間試遊(Phase 3完成ゲート)

作成日: 2026-08-13(v1)。改訂: v2→v3→v4→v5(alice v8同期)→v6(H1〜H7反映)→v7(I1〜I6反映)→v8(J1〜J7反映)→v9(K1〜K3反映)→v10(正式arbiter_mot3〈旧称Fable役〉技術レビュー判定反映、L1〜L10)→v11(arbiter_mot3補足裁定〈HB-DEC-011ケースA、production config出典分裂〉のS-6/S-7反映、二層命名+G1a′ゲート境界同期、M1〜M4)→v12(arbiter追加裁定Q9〈S-5/N-2後半のゲート循環解消、G1b移管〉反映+承認定型文の全角括弧統一、N1〜N3)→v13(arbiter追加裁定Q10〈G1b beginRunActionのクロスストア原子的境界、A3採用〉反映、Q1〜Q7)→**v14(arbiter追加裁定Q11〈RunSnapshotとlive開始入力の単一出典+finishAssemblyの原子的境界〉反映、Q11-1〜Q11-6・Q-R1〜Q-R4)**。
担当: brabit_mot3(UI/描画/音/store adapter層)
状態: **実装前計画v14。Q11文書同期はSuu_mot3独立照合を2026-08-18に正式通過(B-Q11-1〜7是正済み、最終SHA256 5fa96015…)。Q11の実装工程は解禁されたが、工程1=alice担当Q-R3(`createRunRng`新設+engine内mulberry32の一元化)が先行し、brabit担当のP9/P13/P17・DoD-Q11-a〜gのstoreコード/test編集はSuu_mot3の工程2解禁指示まで停止中(現在Q-R3実装中)**

**本書のみを読めば実装内容・契約・DoDを検証できる。他版・他節を参照しないと内容が分からない箇所はゼロにする**(この方針を全節で維持する)。根拠は`docs/spec.md`・`docs/art-spec.md`(r3)・`docs/phase3-ui-autopsy-plan-v5.md`(以下「正式UI v5」)・`docs/phase3-p3-3-implementation-report.md` §13・`docs/phase3-p3-2-implementation-report.md` §12・`docs/phase3-plan-v12-amendments.md`・`docs/phase3-p3-4-plan.md`(alice_mot3のP3-4実装前詳細計画、**現状v15**——G1a′新設+arbiter補足裁定Q1〜Q8/S-1〜S-10/N-1〜N-3+追加裁定Q9〈S-5/N-2後半のG1b移管〉に加え、**追加裁定Q10 §8補足裁定の相互参照〈§12〉**および**追加裁定Q11のalice担当分Q-R3〈正典run RNG `createRunRng`——公開signature `export function createRunRng(seed: number): () => number`、配置`src/engine/destructionOrchestration.ts`、mulberry32、所有境界〈brabit所有の`src/retro/audio/prng.ts`およびテストヘルパ`src/engine/__tests__/prng.ts`とは共有しない〉、テスト、P3-1-Q9リプレイ規約との接続〉を§20.10として反映済み**。Q11のQ-R1/Q-R2/Q-R4およびDoD-Q11-a〜gはbrabit所掌のため本書側で反映する。**G1a′は2026-08-16正式通過**、以下「alice計画」)・正式arbiter_mot3(旧称Fable役)技術レビュー判定文(2026-08-14T08:28:39Z、Suu_mot3中継全文、以下「本レビュー」。**レビュー対象はengine v10全文+UI v9全文**〈当時の最新版、履歴として維持〉へのクロスレイヤ統合レビュー、条件付き承認、対象コミット`c163033`)・arbiter_mot3補足裁定判定文(HB-DEC-011ケースA、production config出典分裂、2026-08-16T10:42Z、Suu_mot3中継全文、以下「補足裁定」。対象は`docs/phase3-p3-4-production-config-source-review-request.md`、条件付き承認)・arbiter_mot3追加裁定Q9判定文(S-5/N-2後半のゲート循環解消、2026-08-16T15:06:57Z、Suu_mot3中継全文、以下「Q9裁定」。G1a′完了条件をS-5/N-2後半除く形へ限定し、これらをG1bの必須DoDへ移管)。正式UI v5の該当内容は本書へ全文インラインする(§3)。

## v9→v10の変更点(本レビュー反映、L1〜L10。M-1・R18〜R26・C-1・C-3〜C-6/C-12・人間再承認一覧A〜Oのうちbrabit所有/共同分)

**手続き上の注記**: 本レビューの効力は人間プロジェクトリードの承認後に発生する(本レビュー§0)。本節はdocs-only反映であり、この反映自体は§8-A〜Oの人間再承認を先取りするものではない。M-1反映+Suu_mot3照合、および人間再承認一覧A〜Oの承認をもってG1aから実装解禁となる(本レビュー§13)。

1. **L1(M-1: D06クロスラン会計契約、§6.2入力構築へ反映)**: 本レビューM-1は、部分損傷ギヤの再装備時にengine側の会計(`applyWearToCarConfig`の歯欠け由来効率因子)とD06状態機械の走行内カウント(`D06Progress.toothLossCount`が常に0開始)が二重に食い違う欠陥を指摘した。是正はalice所有(`applyWearToCarConfig`から歯欠け因子を削除、`composeD06RuntimeEffect`が一元計算)だが、**`RunSnapshot.initialDestructionState.modes.D06.toothLossCount`を装備ギヤ個体の永続`WearState.gear.toothLossCount`で初期化する**(M-1(i)、単一出典=装備個体)処理は、captureRunSnapshot入力構築の一部としてbrabit配線が読み取り渡す値であるため、§6.2の呼び出し順序へ新しい段(装備ギヤ個体のWear参照、captureRunSnapshot直前)を追加した。
2. **L2(C-3: base config有限性検証をrecipeKey計算より前に)**: `computeRecipeKey`呼出し(旧(2))の**前に**base configの有限性検証を行い、throwが未捕捉例外としてUIへ漏れる経路を塞ぐ(検証失敗はbeginRun失敗`{ok:false}`へ)よう新しい段を追加した。L1・L2の2段追加により、§6.2の「5段順」は**「7段順」**へ改めた。
3. **L3(R18: D07/D09専用視覚表現、確定)**: 候補1(既存性能低下icon+音+減速表現のみ、art-spec改訂不要)に確定。候補2(D09専用白煙)は却下(D02発煙との視覚的衝突・診断語彙の汚染)。§8.1を「未裁定」から確定済みへ改めた。
4. **L4(R19・R20: D01/D07追加pitch変調・D09焼付き音、確定)**: D01/D07への追加pitch変調は「候補1(追加変調なしのまま確定)」、D09焼付き音は「候補1(固定周波数2音の急速切替、API変更なし)」に確定。§8.3を改めた。
5. **L5(C-1: D01固有SEの新規追加、D07免除の根拠明記)**: art-spec §8「D01〜D09それぞれに固有SE」に対しD01が固有SEを欠いていた欠落を是正。D01専用の継続系SE初期候補(決定論的noise系、SEバス正規化対象)を§8.3表へ追加した。D07免除(spec §7.1「三段開示に従う」がart-spec §8の包括文に優先)は本レビューの裁定を根拠として明記した。
6. **L6(R26・C-6: D06 SEのqueue/coalescing、確定)**: 「queue方式(既定候補)を条件付き承認」——無制限queueの時間的不正直を避けるため、深さ上限(初期候補3)+超過分coalesceのハイブリッドに確定。上限値はG7で耳較正する。§8.3を改めた。
7. **L7(R21: `SE_MASTER_GAIN`、承認)**: 初期候補値(BGM 0.85/motor 0.05/SE 0.10、合計≤1.0)+モード横断単一SEバス正規化を承認。値そのものはG7/G8の人間の耳で最終確定(§8.3は変更なし、承認状態のみ明記)。
8. **L8(R23: ガウスメーター、確定)**: 価格800円固定(仮値ラベル必須)・解禁条件はD07初回発見後・所持状態は`PersistedSaveState`直下の`InstrumentOwnership.ownedInstrumentIds`・`SCHEMA_VERSION`1→2+`SAVE_KEY`不変+migration手順(a)〜(e)・`computeGaussMeterReading`のbrabit所有、いずれも確定。§11.3を「未裁定・複数候補」から確定済みへ改めた。
9. **L9(R25・C-12: 検死レポートcauseLog/劣化差分保存、確定)**: `CodexRecordEntry`拡張(`discoveryEvent`+`runDegradationDiffs`)を推奨候補どおり承認。交差不変条件負例(discoveryEventのみ/runDegradationDiffsのみの半状態を全復元経路で一貫拒否)をDoDへ追加(C-12)。§3.2・§22-9・§23-10を改めた。
10. **L10(alice_mot3クロスレイヤ照合、2026-08-14T10:00反映、M-1(i)配線の訂正。2026-08-15のSuu最終照合B3・B6で表現をさらに限定・訂正)**: L1提出時点の理解(「`initialDestructionState`自体の構築〈seeding処理〉はalice所有の`captureRunSnapshot`内部契約に委ねる」)は誤りだった。alice計画v11 §14.2・§14.3の確定により、`createInitialDestructionState()`→alice所有の新規純関数`seedInitialDestructionStateFromWear(base, equippedGearToothLossCount)`(brabit所有`beginRunAction`が明示的に1回呼ぶ独立ステップ、`applyWearToMotorConfig`等と同じ分業パターン)という2段が`captureRunSnapshot`呼出しの直前に挟まることが判明した。**M-1のseeding処理自体は`captureRunSnapshot`への追加のシグネチャ変更を生まない**(人間再承認A〈`recipeKey`必須追加〉により`captureRunSnapshot`は既に破壊的シグネチャ変更を受けているが、**`initialDestructionState`はAが追加した引数ではなくP3-0/P3-1以来の既存入力であり、Aが追加するのは`recipeKey`である**——M-1 seedingはこの従来から存在する`initialDestructionState`入力へseeding済みの`DestructionState`を渡すだけであるため、M-1固有の追加引数は不要、という限定つきの意味——「無改修」という表現はAによる変更まで無いかのように読めたため誤解を招いた)。§6.2の呼び出し順序を「7段順」から**「8段順」**へ改めた。

**人間再承認一覧A〜O(本レビュー§8)との対応、engine計画と同期**: 本レビューは重複のない単一一覧A〜Oを人間再承認対象として定めた。A〜I(`recipeKey`/`contractVersion`・notebook 3腕・`NotebookExportV2`・D06契約〈M-1込み〉・D09契約・`DestructionFrameInput`拡張・`CarConfig.gearReflectedInertiaKgM2`・`destroyedRole`分岐・`WearState`反映新経路)はengine専属所有であり、alice計画側の申告に委ね本書では参照のみとする。**brabit所有分は次のとおり**: **J(`PersistedSaveState`への`InstrumentOwnership`追加+`SCHEMA_VERSION`1→2+migration手順+失敗分類、R23)**・**K(`CodexRecordEntry`拡張、R25、Jと同一migrationへ同梱)**・**L(ガウスメーター経済接続=価格800円仮値・D07発見後解禁・シルエット掲載、R23)**・**M(`SE_MASTER_GAIN`新設+BGM/MOTOR再配分、R21)**・**N(motor-only終了ライフサイクル+G9での旧経路削除、R22)**・**O(D07固有SE免除+D01固有SEの新規追加、C-1)**。J・K・Lは同一`SCHEMA_VERSION`1→2 migrationへ同梱するため、人間再承認は3項目をまとめて1回の確認として提示することを推奨する(本レビューC-13)。**P(補足裁定、2026-08-16新設)**: G1a′一式(equipment→config導出resolver+production baseline単一出典関数+二層命名・単一出典契約+beginRun合流+G1a′ゲート新設とC-4最終DoD)。engine専属所有(alice)であり本書では参照のみ——2026-08-16、人間プロジェクトリードが定型文「補足裁定判定文全体（Q1〜Q8・S-1〜S-10・N-1〜N-3）と項目Pを承認します。」で承認済み(§6.2参照)。**追補P-1(Q9裁定、2026-08-16)**: S-5/N-2後半の検証時期をG1a′からG1bへ移管する変更(契約内容は不変)。項目Pと一体記録、新規独立項目化しない。人間プロジェクトリードが同日、Q9判定文全体を明示承認済み(§6.2参照)。**Q(Q10裁定、2026-08-18新設、brabit所有+alice担当分、2026-08-18人間承認済み)**: G1bクロスストア原子的境界一式(A3)——`RunPreparationResult`・`RunPreparationCallback`(`saveStore.ts`所有の新規public型2件)・`beginRunActionWithPreparation`(新規public action)・`prepareDestructionRun`(`gameStore.ts`所有の新規export純関数)・**`snapshotCaptureFailed`失敗腕**(commit済みだが`captureRunSnapshot`失敗、孤立runSequence1件を許容、要再試行——単独の行として明示提示することがarbiterの条件)。arbiterは「追加のみであることは再承認省略の理由にならない」(P3-0-Q1・Q3・Q4a・Q4b・Q5の先例)として**全件を再承認対象**と裁定した。**alice担当分のうち**P-Q10-A1**(`src/materials/recipeKey.ts`への`validateMaterialComposedBase`新設)・**P-Q10-A4**(検証対象契約=27エントリの有限性+`effectiveTurnsRatio`のbase契約)・**P-Q10-A5**(`effectiveTurnsRatio`違反時のResult拒否、arbiter補足裁定2026-08-18で確定)を再承認対象として同一バンドルへ独立行で併載する**。**P-Q10-A2**(`computeRecipeKey`内部を非exportヘルパ`collectRecipeKeyNumericFields`へ置換する内部リファクタ、公開シグネチャ・出力文字列とも不変)・**P-Q10-A3**(配置を`materialMapping.ts`ではなく`recipeKey.ts`とする設計判断)は**再承認対象外とし、arbiter裁定記録および決定台帳の`P3-4-Q10`エントリへの記載のみとする**(arbiter補足裁定§6の条件。公開面不変の内部配置変更は人間再承認不要という既存先例P3-1-Q2・P3-1-Q7と同型)。**`effectiveTurnsRatio`のruntime拒否機構はarbiter補足裁定(2026-08-18)によりResult拒否で確定した**(§6.5.6)。**arbiterの条件により、P-Q10-A3(配置決定)は人間再承認バンドルの独立項目から除外する**——公開面不変の内部配置変更は人間再承認不要という既存先例(P3-1-Q2・P3-1-Q7)と同型のため、裁定記録・決定台帳への記載で足りる。P-Q10-A2(内部リファクタ、公開面の増分なし)も同様に再承認対象外。**人間再承認の対象は公開契約と拒否挙動に限定する**(brabit担当分+alice担当分A1・A4・A5)。詳細は§6.5、バンドル反映内容は`docs/phase3-p3-4-q10-decision-proposals.md`を参照。**追補Q-R1〜Q-R4(Q11裁定、2026-08-18承認済み)**: Q-R1(`RunPreparationRunKind`のmotorOnly腕へ`initialOmega: number`必須追加、承認済み型の破壊的変更)・Q-R2(`beginProductionRun`を`(runKind, seed)`へ、承認済みactionのシグネチャ変更)・Q-R3(正典run RNG〈mulberry32〉の新設、**alice所有**)・Q-R4(契約文の追加、型変更なし——live runtime初期化はrunSnapshotのdeep copyを唯一出典とする/`finishAssembly`順序=案A/S-5適用範囲の明文化)。**2026-08-18、人間プロジェクトリードが定型文「P3-4追加裁定Q11判定文全体、および人間再承認デルタQ-R1・Q-R2・Q-R3・Q-R4を承認します。」で明示承認済み(Suu_mot3中継確認済み)——これによりQ11裁定の効力条件およびQ-R1〜Q-R4の人間再承認条件は充足した。** ただし**P9/P13/P17に対応するコード実装は、Suu_mot3の文書照合・明示解禁まで停止を継続する。**

## v10→v11の変更点(arbiter補足裁定〈HB-DEC-011ケースA〉S-6/S-7反映、Suu_mot3同期指示2026-08-16T13:57、M1〜M4)

**背景**: G1b着手前の実コード実測で、gameStore.config/carConfig(V2レガシー)とP3の`MaterialSelection`/`EquipmentLoadout`/`PlayerInventory`が無関係であること、`equipmentLoadout`→`MaterialSelection`の導出ヘルパーが存在しないことが判明し(brabit_mot3実測、2026-08-15)、alice_mot3が補足裁定依頼書を作成、arbiter_mot3が2026-08-16に条件付き承認(G1a′ゲート新設・Q1〜Q8・S-1〜S-10・N-1〜N-3)、人間プロジェクトリードが同日承認、alice_mot3がengine計画v13へ反映・Suu_mot3照合通過済み。本節はそのS-6(二層命名の§6.1・§6.2への適用)・S-7(C-4最終DoD文言の§23相当への転記)を、alice確定文言に追従してdocs-only反映したものである。

1. **M1(S-6: 二層命名の導入)**: 「base config」という語を、engine計画v13 §12の確定どおり2層へ区別する。**`rawPlayerConfig`**: `gameStore.config`/`carConfig`系統(V2スライダー・プリセット・recipe・診断由来の全8系統+`useSaveStore.subscribe`同期、素材選択を一切知らない)。**`materialComposedBase`**: `composeConfigFromMaterials(rawPlayerMotorConfig, rawPlayerCarConfig, baseline, selection)`の出力(Wear反映**前**)。§6.1・§6.2・§11.2でこれまで「base config」と無区別に記述していた箇所は、いずれも`materialComposedBase`を指す——本節以降、両者を明示的に区別して表記する。
2. **M2(S-6: production単一出典契約、engine計画§12(i)と同期)**: `rawPlayerCarConfig`は**beginRun時の`resolveGarageBuild(garageSelection)`単一呼び出し結果**とし、`gameStore.carConfig`現在値を直接読まない——`setLabCarConfig`/`setDiagnosisCarConfig`等で乖離しうるcarConfigとgarage選択の「別の事実」混入を構造的に排除する。**帰結(ゲームプレイ可視の挙動変更、人間再承認P反映済み)**: V2ラボ/診断モードでの直接編集値は、素材走行(test-run/track-run/motor-only、素材選択が絡む全走行)の実効configへ影響しなくなる。`rawPlayerMotorConfig`は`gameStore.config`(巻線・組立由来のplayer-adjustable値)を単一読取りする。
3. **M3(S-6: §6.2の8段順・段1をG1a′境界で1a〜1eへ精密化)**: G1a′新設(engine計画v13、G1aとG1bの間、resolver`deriveMaterialSelectionFromEquipment`相当+production baseline単一出典関数を新設するゲート)を受け、§6.2の段1「base MotorConfig/CarConfig/MaterialSelection/EquipmentDestructionContext確定」を1a〜1eへ精密化した(§6.2本文参照)。**G1bの着手条件を更新**: 従来「G1a完了後」としていた理解を、**「G1a′完了+G1a′のSuu_mot3照合通過+人間再承認項目P承認後」**へ訂正する(engine計画v13 §3.1、arbiter補足裁定Q6)。**(v11時点の記録)** 当時、人間再承認項目Pは2026-08-16に承認済みだったが、G1a′実装(docs以外)自体はSuu_mot3独立照合の要修正9点是正の再照合通過待ちであり、v11執筆時点ではG1bはまだ解禁されていなかった——**v12でG1a′はSuu_mot3照合を正式通過している**(N4・N9参照、本項は履歴として維持し現状とは矛盾しない)。
4. **M4(S-7: C-4最終DoDの転記)**: engine計画v13 §20.6のC-4最終DoD文言を§23へ転記した(§23 DoD21を参照)。G1a′(純関数側の単一出典)・G1b(配線側、現存6段分=1a単一読取り相当・2・3・5・6・8)・G6(8段全体の再固定)の3段階で充足する。

## v11→v12の変更点(arbiter追加裁定Q9〈S-5/N-2後半のゲート循環解消〉反映、Suu_mot3同期指示2026-08-16T15:52・クロスレイヤ初回照合是正2026-08-16T16:01、N1〜N9)

**背景**: Suu_mot3のG1a′実装レビューで、「G1a′完了条件=条件S-1〜S-10全充足」と「G1bの着手条件=G1a′完了後」が循環していることが発見された(S-5〈失敗時不変条件〉・N-2後半〈beginRunAction統合テスト〉はbeginRunActionへの統合を要求するが、その統合自体がbrabit所有のG1b以降にしか行えないため、G1a′単体ではS-5が原理的に充足不能だった)。alice/Suu_mot3は独断で先送りせず、arbiterへ追加裁定(Q9)を依頼して停止し、2026-08-16に(a)採用(G1a′完了条件を純関数側へ限定、S-5+N-2後半をG1bの必須DoDへ移管)の裁定を受け、人間プロジェクトリードが同日Q9判定文全体を明示承認、alice_mot3がengine計画v14へ反映・Suu_mot3照合(G1a′正式通過)を経た。本節はengine計画v14の確定文言(§3.1・§20.9)に追従してdocs-only反映したものである。

1. **N1(G1a′完了条件の限定・G1bへのDoD移管)**: G1a′完了条件は**S-1〜S-4・S-6〜S-10、および負例N-1・N-2前半・N-3の充足**に限定される(S-5・N-2後半は除外)。G1a′は代わりに、resolver・baseline構築関数・`composeConfigFromMaterials`が**純関数であること**(引数以外を読まず、store/localStorage/グローバル状態へ書き込まないこと)をテストで固定する——S-5不変条件のうち純関数側で成立しうる部分をG1a′が先取りする形。§6.2のG1a′/G1b/G6分割注記を更新した。
2. **N2(G1bの必須DoD追加)**: S-5の失敗時不変条件(`nextRunSequence`不変・`pendingRunEquipmentSnapshot`不変・`RunSnapshot`/`RunAccumulator`不生成・gameStoreローカルruntime state不変の4項目)を、resolver失敗・baseline/compose失敗・有限性検証失敗の**3経路それぞれ**について、N-2後半の統合テスト(beginRunAction経由での範囲外baseline失敗再現)とともに**G1bの必須DoD**として追加した。「config構築失敗がrunSequence消費より前に確定する構築順序」の実装指針もG1bへ移動。テスト所有はalice(純関数・fixture提供)+brabit(beginRunAction配線・統合テスト本体)の共同とし、C-4監査のG1b段階分と同時充足する。§23 DoD21を更新した。
3. **N3(承認定型文のverbatim全角括弧統一)**: Suu_mot3指摘(2026-08-16T14:22)により、人間承認定型文の引用箇所を半角括弧`()`から実際の人間承認文どおりの全角括弧`（）`へ統一した(§1)。

**Suu_mot3クロスレイヤ初回照合(2026-08-16T16:01)による是正N4〜N9**: 上記N1〜N3提出後、Suu_mot3の初回照合で「契約本体は概ね一致しているが、現状記述が一部矛盾・陳腐化している」との指摘を受け、以下を是正した。

4. **N4**: 冒頭§0のalice計画参照「G1a′実装完了・Suu_mot3照合待ち」を「G1a′は2026-08-16正式通過」へ更新(実際にはG1a′はこの時点でSuu_mot3照合を通過済みだった)。
5. **N5**: v11時点の履歴であるM3の「本書執筆時点でG1b未解禁」という記述が、v12時点の現状(G1a′正式通過済み)と矛盾して見えていたため、「(v11時点の記録)」であることを明示し、v12で正式通過した旨を追記して矛盾を解消した(履歴自体は改変しない)。
6. **N6**: §6.1・§6.2のengine計画参照が古い`v13`のままだったため、現行`v14`へ更新した。
7. **N7**: §6.2段1dへ、G1a′で実装済みの実シグネチャ`resolveProductionMaterialCompositionBaseline(rawPlayerMotorConfig: MotorConfig, garageBuild: GarageBuildResult): MaterialCompositionBaseline`(`src/store/runOutcomeApplication.ts`実測)を明記。`resolveGarageBuild(garageSelection)`のexact 1回呼び出し結果(`GarageBuildResult`)を`rawPlayerCarConfig`とbaseline関数の`garageBuild`引数の両方へ同一実体として渡し、baseline関数内部では`resolveGarageBuild`を再呼出ししない(構造的に不可能なシグネチャ)ことを1eへ追記した。
8. **N8**: §17のサブステップ分割ゲート表が、L〜M〜N各ラウンドの本文改訂に追従できておらず、G1a′行が欠落し、G1a行も旧い「`EquipmentDestructionContext`解決関数」という誤った特徴づけ(独立resolverを含むかのような記述)のまま放置されていたことが判明した——engine計画§3.1の確定内容(G1a=型+docstring契約のみ・G1a′=resolver+baseline+純関数性・G1b=Q9 DoD込み)に合わせて全面再構成し、直後の「brabit側の着手可能タイミング」段落も現状化した。
9. **N9**: 末尾「手続きに関する注記」の残条件記述が「A〜O承認待ち」「G1a′前」という陳腐化した内容のままだった——A〜O・P・追補P-1がすべて承認済み・G1a′が正式通過済みであることを反映し、残条件を「本UI計画v12是正(N4〜N9)自体のSuu_mot3クロスレイヤ照合通過+その後のG1b明示解禁指示」へ現状化した。あわせて§6.2の「解禁待ちの最終条件を満たしつつある」という曖昧な表現を、「着手条件は充足済みだが本是正提出中・Suu明示解禁待ち」へ明確化した。

**契約の不変性**: 本裁定はS-5/N-2後半の**検証時期と所有ゲートのみ**を変更し、不変条件の内容・失敗時の要求挙動・エラー型合流(Q5)・値・型は一切変更しない——brabit側の既存設計(§6.4.1の失敗表、Q5に整合)への影響はない。

## v13→v14の変更点(arbiter追加裁定Q11〈RunSnapshotとlive開始入力の単一出典+finishAssemblyの原子的境界〉反映、Suu_mot3全文中継2026-08-18T14:52)

**背景**: G1b実装のSuu_mot3独立レビューで、`RunSnapshot`と実際のlive開始入力が一致していない箇所が3件(P9・P13)、および`finishAssembly`の順序・失敗原子性の問題(P17)が検出された。arbiterが独立に実コードを確認し、4件の不一致すべてを事実と認定したうえで裁定した(2026-08-18、条件付き承認)。

1. **Q11-1(motor-onlyの`initialMotorState`、両候補とも不採用→第3案)**: 「REST_STATE維持」も「post-input state全体の捕捉」も不可。前者は初速を再現できずリプレイ契約が第1stepから破れる。後者は前runの過渡状態(`batteryHeat`・`theta`・`chatterFramesLeft`・`coilCollapsed`等)が新runへ漏れる**第二の伝搬チャネル**を作る(run間の恒久効果は`applyRunOutcome`→`WearState`/個体状態の単一経路に限る、P3-0以来の契約)。特に`coilCollapsed`の持ち越しは`RotorAssemblyState.collapsed`との二重表現になる。**裁定: `{...REST_STATE, omega: clamp済み初速}`とし、`RunPreparationRunKind`のmotorOnly腕へ`initialOmega: number`を必須追加する**(`SimState`全体を腕に持たせると`batteryHeat=0.9`のような不正初期状態を型上構築可能になるため、omegaのみへ縮小——P3-1-Q6「構築不能」原則)。clampの実施主体は呼出し側、`prepareDestructionRun`は有限性・`|initialOmega| <= MAX_FLICK_OMEGA`をthrowで防御する。
2. **Q11-2(test-runのlive vehicleState、承認)**: begin成功後のlive `vehicleState`は`runSnapshot.initialVehicleState`のdeep copyから開始し、raw configから再生成しない。deep copy必須の理由は、参照共有だと将来のin-place変更が`accumulator.replaySnapshot`を汚染しうるため(現行engineは毎step新オブジェクトを返すので即座の実害はないが、安全性を実装の偶然に依存させない)。
3. **Q11-3(live RNG seed、条件付き承認)**: 原則(`_rngState`/`_vehicleRngState`/`_sessionSeed`は`runSnapshot.seed`が唯一の出典)は確定。ただし**必須修正2点**——(i)`beginProductionRun`へ`seed`引数を追加し呼出し側供給とする(内部`createSessionSeed()`のままだと`flickStart`の`recipeSeed`による再現実行というプレイヤー可視機能がtrue側で静かに死ぬ)、(ii)**RNGアルゴリズムの正典化**(liveはxorshift、リプレイ規約はmulberry32であり、seed一致だけでは系列が再現しない)。正典run RNGをmulberry32と確定し、alice所有の単一exportとして新設する。brabit所有の`src/retro/audio/prng.ts`は所有境界を越えて共有しない。
4. **Q11-4(`finishAssembly`、案A採用)**: config永続commit成功後にbeginを呼ぶ順序へ是正する(§6.5.8)。案B(`beginRunActionWithPreparation`へprospective configを注入)は承認済み契約の大幅再openを招くため却下。「config保存済みだがrun未開始」という中間状態は**欠陥ではない**——組み立て完了はrun開始と独立に成立するプレイヤーの耐久的決定であり、購入と同格。あわせて**S-5の適用範囲**(run runtimeのみ、プレイヤー確定構成は対象外)を明文化した。
5. **Q11-5(公開契約変更4件)**: Q-R1(`RunPreparationRunKind`のmotorOnly腕変更)・Q-R2(`beginProductionRun`シグネチャ変更)・Q-R3(正典run RNG新設、alice所有)・Q-R4(契約文の追加、型変更なし)。いずれも人間再承認デルタとして項目Qの追補で提示する。**変更しないもの**: `RunPreparationResult`・`RunPreparationCallback`・`beginRunActionWithPreparation`・`prepareDestructionRun`のシグネチャ・`CaptureRunSnapshotInput`/`RunSnapshot`・V2凍結engine本体。
6. **Q11-6(DoD追加)**: DoD-Q11-a〜g(§23の28〜34)。G6以降への先送りは認められない(いずれも「同一snapshotからの再現」というG1bのcommit境界契約の一部であるため)。

**独立報告I-1(裁定範囲外、記録のみ)**: `flickStart`/`finishAssembly`が実験ノートへ記録する`_sessionConfig`はrawPlayerMotorConfigだが、true側の物理はmaterialComposedBase(素材写像込み)で走る。実験ノートが「rawのプレイヤー入力値」と「実際に物理へ渡ったcomposed値」のどちらを見せるべきかはspec §1.2に関わる提示設計の問題であり、Q11の裁定範囲(単一出典・原子性)の外。Suu_mot3のルーティングに委ねられた(必要ならG7 notebook配線前の別裁定)。

## v12→v13の変更点(arbiter追加裁定Q10〈G1b beginRunActionのクロスストア原子的境界〉反映、Suu_mot3全文中継2026-08-18T08:37、Q1〜Q7)

**背景**: G1b明示解禁(2026-08-16T20:01)を受けて実装着手しようとした際、UI計画v12が繰り返し参照していた「`beginRunAction`(gameStore.ts所有)」という記述が実コードと食い違うこと(実体は`src/store/saveStore.ts`のP3-0由来の既存actionであり、`gameStore.ts`からは一度も呼ばれていない)をbrabit_mot3が実測で発見した。さらに、config構築(§6.2の8段順)とrunSequence発行の**原子的境界がどの承認済み計画にも定義されていない**ことが判明した。設計案を2ラウンド差し戻された後(v1: 既存`beginRunAction`を先に呼ぶ案がS-5/Q9違反、v2: TOCTOU論証の誤り+`composeConfigFromMaterials`の型誤認)、Suu_mot3の事前照合21点(P1〜P21)を経て`docs/phase3-p3-4-g1b-atomic-boundary-review-request.md`を作成、arbiter_mot3が2026-08-18に**条件付き承認**の裁定(Q10)を下した。本節はその全条件のdocs-only反映である。

1. **Q1(§0.1不可能三角形の裁定、A1・A2不採用→A3採用)**: 依頼書が提示した2案はいずれも不採用となり、arbiterが第3案A3を採用した。依頼書§0.1が「commit後の`captureRunSnapshot`例外」を**新種の問題**と扱ったのは見落としであり、実際にはプレイヤーがrun開始直後にタブを閉じた場合と構造的に同一で、**P3-0-Q1の高水位runSequence意味論が既に日常的に許容している状態**である(孤立runSequenceが1件生まれるだけで、冪等skipとして吸収される)。したがって「例外を投げないruntime保証」は達成不能かつ不要であり、必要なのは「例外が起きても未捕捉のまま伝播させず、runtime状態を『run進行中』のまま取り残さない」という弱い保証で足りる。**A3はUI契約(a)の再openを一切必要としない**(A2が払う代償を払わずに済む)。§6.5を新設して全文を反映した。
2. **Q2(A3の必須修正2点)**: `captureRunSnapshot`呼出しの`try/catch`包囲+新設失敗腕`{ok:false, reason:'snapshotCaptureFailed'}`、およびcatch内でのruntime専用3フィールド(`currentRunSequence`・`pendingRunEquipmentSnapshot`・`pendingRunSaveId`)の明示的`null`リセット。後者を怠ると`pureBeginRun`の`runInProgress`ガードにより**ページリロードなしには再挑戦できないソフトロック**になる(arbiterが自らA1由来の設計をトレースして発見した具体的負例)。§6.5.2・§6.5.4に反映した。
3. **Q3(§6.4.1の失敗表を2点改訂)**: (i) 既存「Wear反映後のconfig範囲外」行のラベルが、実際には既に承認済みだったC-3(Wear適用**前**のbase有限性検証)を文字どおりカバーしていなかったため、「config構築失敗(base有限性検証〈C-3〉およびWear反映後範囲外の両方を含む)」へ改称し、Q10で確定したcompose失敗・有限性失敗もこの行へ合流することを明記した(arbiter条件)。(ii) `snapshotCaptureFailed`を新規行として追加し、**契約(a)の修正ではなく契約(a)の対象外の新規契約**として契約(a′)を新設した(arbiter明示)。UI文言は「この操作は行われませんでした」的な含意を避け、**再試行が安全であることを示す文言**とすることも確定した。
4. **Q4(trusted narrowing、案(i)承認)**: `fresh.equipmentLoadout`を`EquipmentLoadout & {batteryItemId: string}`へ橋渡す局所type assertion案(i)が承認された。案(ii)(`pureBeginRun`の`BeginRunResult`拡張)は**戻り値型の変更もシグネチャ変更**でありP13(iv)「`pureBeginRun`無改修」に反するとして却下。条件として、アサーション箇所に「なぜ安全か」の1行コメント(既存`deriveMaterialSelectionFromEquipment`内のtrusted precondition記法と同じ様式)を必須とする。追加の機械テストは不要(`batteryItemId===null`時の`missingRole:'battery'`挙動は既存テストで固定済みのため)。
5. **Q5(P16判別union・P17内部導出・P18定数の3件、いずれも承認)**: `RunPreparationRunKind`判別unionはP3-1-Q6以来の「fail-fastより構築不能」原則に沿う。`initialVehicleState`/`initialMotorState`の内部導出はP3-1-Q9の「走行開始時に確定する構成情報はRunSnapshotを唯一の出典とし独立引数として再入力させない」の直接の帰結。`GEAR_TOTAL_TOOTH_COUNT`(`src/materials/inventoryItem.ts:27`、値10)はarbiterが実測確認した。
6. **Q6(runKind/context整合性、依頼書の設計は不承認・要修正)**: 「呼出し側の前提とする」という依頼書§2.3脚注の設計は**不十分**と判定された。`prepareDestructionRun`は公開export純関数であり将来別の呼び出し元から呼ばれうるため、**同じ事実を表す2つの独立入力から不整合な組合せを構築できる構造**(P3-1-Q6が明示的に排除対象とした「静かな不一致」)が残る。関数内部の先頭で`(runKind.kind==='motorOnly') === (equipmentSnapshot.context==='motor')`を明示検証し不一致時は`throw`すること(無効入力に対するthrowは参照透過性を損なわない)、および**実際に矛盾する引数を渡してthrowを確認する負例テスト**を`gameStore.test.ts`へ追加することが条件として課された。§6.5.4・§6.5.5に反映した。
7. **Q7(人間再承認は全件要、docs反映先はUI計画のみ)**: `RunPreparationResult`・`RunPreparationCallback`・`beginRunActionWithPreparation`・`prepareDestructionRun`・`snapshotCaptureFailed`のいずれも新規の公開契約面であり、**追加のみであることは再承認省略の理由にならない**(P3-0-Q1・Q3・Q4a・Q4b・Q5の先例に照らす)。バンドル項目**Q**として提出する(§1参照)。Q10は`src/engine/`の型・関数を一切変更しないため**engine計画v14への実体的反映は不要**(相互参照コメント1行で足りる)、実体的反映先は本UI計画のみ。**実装の分担(alice_mot3設計回答v2で確定、§6.5.6の表が正)**: `src/materials/`(`recipeKey.ts`の`validateMaterialComposedBase`一式)=alice_mot3、`src/store/saveStore.ts`・`src/store/gameStore.ts`(A3一式)=brabit_mot3、`src/engine/`=変更0件——arbiter §7原文は「実装もbrabit_mot3の所掌でalice_mot3の関与は不要(ただし§8を除く)」としていたが、その§8がalice担当分として実体化したため、Q10時点の正しい分担は上記のとおり2者にまたがる。**(v14注記)** この「`src/engine/`=変更0件」はQ10時点の記述であり、**後続のQ11 Q-R3(正典run RNG `createRunRng`の新設)により撤回された**——現行の分担は§6.5.6の表および§17 G1b行を正とする。

**arbiter §8ブロッキング指摘(実装着手前に解消必須)**: 依頼書のpseudocodeが呼んでいた`isFiniteMaterialComposedBase`が**リポジトリに実在しない**ことがarbiterの独立実測で判明した(`rg`0件)。「既存C-3同型」という表現は誤解を招くもので、C-3は**要件**であって実装済み関数ではなかった。この関数がなければG1bはコンパイルすら通らない。arbiterは配置に`src/materials/materialMapping.ts`を推奨しつつ、最終的な名称・配置・検証粒度をalice_mot3の設計判断に委ねた。**alice_mot3の設計回答v2(2026-08-18、Suu_mot3全文中継)で確定した内容へ§6.5.4・§6.5.6・§17・DoD27を同期済み**——公開関数は`validateMaterialComposedBase(motorConfig, carConfig)`、配置は`materialMapping.ts`ではなく**`src/materials/recipeKey.ts`**(値importによる循環回避)、検証対象は**27エントリ**(`MotorConfig` 17件+`CarConfig` 10件)の有限性+`effectiveTurnsRatio`のbase契約、内部collectorは非exportで公開面の増分は1件のみ。**`effectiveTurnsRatio`のruntime拒否機構(Result対throw)は、arbiter補足裁定(2026-08-18、Suu_mot3全文中継)によりResult拒否で確定した**(§6.5.6)。同補足裁定は配置(`recipeKey.ts`)・27エントリ十分性証明・collector非export・所有分担も全件承認し、条件としてP-Q10-A3(配置決定)を人間再承認バンドルの独立項目から除外することを課した(公開面不変の内部配置変更は人間再承認不要という既存先例P3-1-Q2・P3-1-Q7と同型)。**§8ブロッキング指摘は設計上解消済みと判定された。**

## v8→v9の変更点(Suu_mot3照合K1〜K3、2026-08-13T19:35:11Z反映)

1. **K1(migration書込み失敗はstorageError)**: §11.3(d)「storageErrorはreadRawのI/O例外由来のみに限定」という記述は、(c)のmigration書き戻し(`writeV16`)と矛盾していた。既存`computeBootstrapResult`(`saveStore.ts:882-884`)が`writeV16`のI/O失敗を`storageError`として分類している既存precedentを確認し、migrationの旧/新validator失敗は`corrupted`、`readRaw`/`writeV16`のI/O失敗は`storageError`という区別へ訂正した。メモリ上だけでmigration成功として続行しない(冪等設計)ことをDoDへ追加した(§11.3・§23-9)。
2. **K2(検死レポートの劣化差分も保存元未解決)**: §3.2項目4はcauseLog/`DestructionEvent`の保存元欠落を正しく質問化していたが、`DegradationDiff`(劣化差分)も`CodexRecordEntry`に保存されておらず、mode別帰属も不能であることを見落としていた。`discoveryEvent`(causeLog込み)+`runDegradationDiffs`(mode別帰属をしない走行単位の事実)による`CodexRecordEntry`拡張を推奨候補として提示し、実験ノート参照案の弱点(runSequence安定参照の欠如、50件trim対象)を明記した。型拡張・validator・migration/legacy表示・8件有界性・人間再承認要否をFable質問(§22-9)・DoD(§23-10)へ追加した。独断確定はしていない。
3. **K3(D03表記の残存1件)**: §8.3のducking段落に残っていた「D03発火時」を「D03電池破裂時」へ訂正した。

## v7→v8の変更点(Suu_mot3照合J1〜J7、2026-08-13T19:24:09Z反映)

1. **J1(staleLeaseの到達不能契約を最後まで統一)**: §9に「pending状態で再試行がstaleLeaseを返した場合は文言表示」という、§2・§23-4と矛盾する記述が残っていた。実コード上production E2E表示契約として書けないため当該文を削除し、`staleLease`は`applyOutcomeErrorReasonJa`単体テストのみ、と全節で統一した。
2. **J2(計測器所持状態の保存配置・migrationを実装時判断に残さない)**: `readLatestV16`が`wrapper.version !== SCHEMA_VERSION`を即`corrupted`とし、`isValidPersistedSaveState`が全フィールドをall-or-nothingで要求する既存実装を確認した(実測、§11.3)。「restore時に`[]`補完」では旧v16データを救済できないことを認め、SCHEMA_VERSION 1→2+専用migration手順(v15→v16と同型)を軸とする複数案をFable質問・人間再承認対象として自己完結に定義した。
3. **J3(SE正規化を全同時voice集合へ拡張)**: v7はD05のモード内最大3音のみを分母にしていたが、D01/D07/D09のloopとD02/D03/D04/D05/D06のeventがモード横断で重なる場合に`SE_MASTER_GAIN`超過を防げなかった。単一SE busでその時点の全active voiceの基準gain合計から実効gainを正規化する契約へ訂正した(§8.3)。
4. **J4(文言・状態の同期)**: alice v9を「Suu照合通過・固定済み」へ更新。§8.3冒頭の「D03電池破裂発火」を「D03電池破裂」へ訂正し、D02発煙/D03電池破裂/D04発火を別項目として列挙した。
5. **J5(motor-only終了契約を実コード事実に合わせる)**: `motorPhysics.ts`の`step`は`SimState.running`をfalseへ遷移させる経路を持たない(既存の`running`値をそのまま返すのみ、実測確認)ことを確認し、「物理的な停止」という自然終端入口の記述を撤回した。現行productionに存在する4つのユーザー操作契機(`resetSim`/`setMode`/`flickStart`再呼び出し/`finishAssembly`再呼び出し)のみを列挙し、いずれもmanualAbort相当・destructionTerminal優先という契約へ確定した(§6.2)。
6. **J6(自己完結性とStore表示方式の実体化)**: 検死レポート共通レイアウト(見出し・発見情報・構成情報・原因情報・劣化差分・報酬・記録導線・登録済み表示)を実在の型(`CodexRecordEntry`等)に基づき新設した(§3.2)。pending/waiting画面は既存`SaveGate`(アプリ境界、`normal`/`waiting`/`pending`/`corrupted`を既に所有)での表示に確定し、`gameStore.mode`への追加は`'encyclopedia'`のみとした(§3.7)。
7. **J7(計測式・a11yの境界確定)**: `WearState`の`kind:'magnet'`variantで`demagnetizationFraction`が必須フィールドであること(validatorも必須検証)を確認し、「legacy欠落」という根拠のない条件を削除、実在する失敗(未装備のみ)に限定した。式が定格比であるため`baseStrength`が計算上約分されることを明記した(§11.3)。a11yモーダル契約へ`overscroll-behavior: contain`、status更新は事前描画した安定DOMノードのtext更新であることを追加した(§13)。

---

## 0. 位置づけ

P3-0-Q2裁定により、production配線・UI配線・人間試遊はP3-4まで延期されてきた。現在のUIコードに破壊モードドメインの識別子は一件も存在しない(2026-08-13時点、`rg -ln "DestructionState|DestructionMode|destructionConfig" src/render src/components src/retro`で0件、§20)。alice計画(**現行v15**、arbiter補足裁定・追加裁定Q9・Q10 §8補足裁定〈§12相互参照〉・追加裁定Q11のalice担当分Q-R3〈正典run RNG `createRunRng`の名称・配置・公開signature・所有境界・テスト・P3-1-Q9リプレイ規約との接続、§20.10新設〉まで反映済み。G1a′はSuu_mot3照合を正式通過済み)を権威入力として参照する。**Q11のQ-R1/Q-R2/Q-R4およびDoD-Q11-a〜gはbrabit所掌のため本書側で反映する。**

---

## 1. 依存点/確定事項

### 確定-1: D06・D09は必ずP3-4実装対象。**公開の**段階的ロールアウトは禁止

プレイヤーに実際に公開される(production先行配線フラグが既定でtrueになる)のはG統合のみ。この「段階的ロールアウト禁止」は公開の段階性を禁じるのであり、内部実装順序の段階性は禁じない——brabit側の内部実装(G1b等)はalice側の対応ゲート完了直後から着手してよい(§17)。

### 確定-2: production `DestructionConfig` assemblerはalice所有、total pure function

`assembleDestructionConfig(selection: MaterialSelection, equipmentContext: EquipmentDestructionContext): DestructionConfig`——Result型を返さない。`EquipmentDestructionContext = {bodyId: BodyMaterialId}`のみ(bearing個体状態は含まない)。**(N11是正)** `selection`・`equipmentContext`(`bodyId`の`EquipmentLoadout.bodyAssemblyId===null`→`'body-none'`正規化込み)はいずれもG1a′ resolver(alice所有、§6.1参照)が一元的に導出する——brabit(gameStore.ts)はresolverの戻り値をそのまま使うのみであり、`bodyAssemblyId`のnull正規化を含む個別の解決ロジックを独自に持たない。

### 確定-3: `stepTrackRunWithDestruction`はalice所有。terminationはdestructionTerminalのみ

motor-only/test-run/track-runいずれの実wrapperも、`termination`は`destructionTerminal`のみを返す。他の全endReasonは呼出側(brabit、gameStore.ts)が`finalizeRun(accumulator, endSignal)`を明示的に呼んで生成する(§6.3・§12)。

### 確定-4: `WearState`→次run base configはaliceの横断純関数(`applyWearToMotorConfig`/`applyWearToCarConfig`、Result型あり)

brabit側は`RunSnapshot` capture時にこの2関数を順に呼ぶ配線のみ。失敗時(`{ok:false,reason}`)はbeginRun全体を中止する(§6.2・§6.4)。

### 確定-5: `finalDestructionState`+`recipeKey`のwriterはaliceの3専用builder純関数、brabitは呼ぶだけ

`buildVehicleTestRunNotebookRecord`/`buildExperimentSession`/`buildCourseRunNotebookRecord`(alice所有、`src/store/runOutcomeApplication.ts`)がそれぞれの腕専用に`finalDestructionState`と`recipeKey`を同時に組み込む。brabit(`saveStore.ts`のaction本体)はこれらを呼び出し、その戻り値をそのまま使う(§10)。

### 確定-6: `deriveFireExposureProfileFromLoadout`はrun開始時1回のみ

run開始時/`RunSnapshot` capture時に1回だけ導出し、`RunSnapshot`の不変入力として固定する。走行中の動的再評価は禁止。

### 確定-7: `recipeKey`は「実装所有=alice、呼出し配線所有=brabit」

`computeRecipeKey(selection: MaterialSelection, motorConfig, carConfig)`という関数本体はalice所有(`src/materials/recipeKey.ts`、R2確定によりengine側の確定シグネチャは`selection`を第一引数に取る——素材ID5フィールドは関数内部で自動的に得られるものではなく、**呼び出し元(brabit)が同一の`MaterialSelection`を明示的に渡す**契約である。この`selection`は§6.1の`assembleDestructionConfig`が受け取るものと同一の値を用い、beginRunAction内で複数の`MaterialSelection`実体が並立しないようにする)。この関数を呼び出す配線(いつ・どこで・何回呼ぶか)はbrabit所有——具体的には、brabit所有の`beginRunAction`(gameStore.ts)内で、Wear反映**前**の`materialComposedBase`(§6.2の二層命名、M1是正)確定直後に**exact 1回**呼ぶ(§6.2の8段順)。その後(`RunSnapshot`→`RunOutcome`→builder→notebook record→`RegressionObservation`という搬送経路の中)は、`computeRecipeKey`の再呼出しを行わない——`RunSnapshot.recipeKey`を権威値として一方向複写するだけであり、`RegressionObservation.recipeKey`の構築時も永続化済みnotebook recordの`recipeKey`フィールドをそのまま読む(§11.2)。**`RunSnapshot.contractVersion`はP3-4時点で固定値`3`**(I6是正、「現行値からの自動increment」という曖昧な表現を撤回する——現行の`RUN_SNAPSHOT_CONTRACT_VERSION`は2であり、`recipeKey`独立フィールド追加によりP3-4は必ずこれを3へ書き換える契約として明記する)。

### 確定-8: production先行配線フラグはbrabit所有のGameStore state

`productionWiringEnabled: boolean`(既定`false`)を既存`GameStore`型へ追加する。所有ファイルは`src/store/gameStore.ts`(brabit所有)。setterは標準Zustand API(`useGameStore.setState({productionWiringEnabled:true})`)のみ。既存25ファイルの`useGameStore`公開面は無変更(§7・§20)。**G統合commitは、この初期値`false`を`true`へ書き換える1行diffのみで構成される**(I5是正、旧経路廃止等の追加コード変更をG統合commitへ混ぜない、§17)。

### 本レビューで解消された項目(v9まで未裁定、L3〜L9・R18〜R26で確定)

- **D07・D09専用視覚表現**: 候補1(既存icon流用のみ、art-spec改訂不要)に確定(R18、§8.1)。
- **SE個別契約(D01/D07pitch変調・D09焼付き音・D06 queue/coalescing・`SE_MASTER_GAIN`・D01固有SE追加)**: いずれも§8.3のとおり確定(R19・R20・R21・R26・C-1)。**波形/周波数/ADSR/gainの数値候補自体**はG7実装+G8人間の耳での最終較正まで確定しない(§19の分類表どおり)。
- **ガウスメーター価格・解禁条件・所持状態schema・測定式**: 確定(R23、§11.3)。
- **検死レポートcauseLog/劣化差分の保存契約**: `CodexRecordEntry`拡張(`discoveryEvent`+`runDegradationDiffs`)に確定(R25、§3.2・§22-9)。
- **alice計画側の主要未裁定事項**: D06物理トリガは候補b(累積曝露)に確定、D09原因記録は候補A(生boolean2値)に確定、ギヤ密度pendingは(c)一次資料→(a)designAssumption→(b、titanium除く)の順に確定、`recipeKey`への素材ID追加は「含める」に確定、`courseRuns`/`vehicleTestRuns` export/import新設は「P3-4スコープ外」に確定、burnedOut rotorの装備拒否はcollapsed rotorと同様に「拒否する」に確定(R17、本書§10.5の表示経路をそのまま適用できる)——いずれもalice計画側、本書は参照のみ。

### 未裁定のまま維持する項目

- **`staleLease`の具体UI化**: production action経路からの実到達性が現時点で確認できていない。実到達の証拠が得られた場合のみ個別質問として提起する(R24で「具体UI契約を設計しない」ことが確定、§2)。
- **`courseRuns`/`vehicleTestRuns` export/import UI導線**: R10でP3-4スコープ外と確定したため、本書の対象からも除外する(§10.6)。

---

## 2. lease/pending状態の意味分類(3区分、`staleLease`は防御的種別)

現行`SaveGateMode`(`src/components/saveGateMode.ts`)は`'corrupted' | 'waiting' | 'pending' | 'normal'`の4値であり、優先順位は`computeSaveGateMode`が固定するとおり**破損(`bootstrapError!==null`)>lease待機(`leaseState==='leaseNotAcquired'`)>保留中(`hasPendingApplication`)>通常**。現行`leaseState`は`'acquired' | 'leaseNotAcquired'`の2値のみ。

正式UI v5の意味分類は3区分: (1) 正常。(2) `leaseNotAcquired`待機(他タブが有効なheartbeatを保持しているだけでエラーではない、「前回セッションの終了確認中です」等の否定的でない文言、一定間隔で自動再判定、この間は新規走行開始+閲覧を除く全store書き込み操作の入口を無効化)。(3) 整合性エラー(`missingEquipment`等の実際の適用失敗、保留中結果画面で再試行・二段確認付き明示的放棄を提供)。

**`staleLease`の扱い(I2是正)**: 実コード(`saveStore.ts`の`readFreshForApply`、1044-1047行)を確認したところ、`fresh.saveMeta.leaseToken !== get().runtimeLeaseToken`(他タブがleaseを奪取した状態)は、`loseLeaseAndResumeWaiting`を経由して**`{ok:false, error:{kind:'leaseNotAcquired'}}`へ変換される**。この関数は`performApplyRunOutcome`・`retryPendingApplicationAction`双方の内部ゲートとして呼ばれる——つまり、他タブによるlease奪取という状況は、production action経路においては`staleLease`としてではなく**`leaseNotAcquired`(waiting)として扱われる**設計になっている。`staleLease`は`ApplyRunOutcomeError`の型としては存在し(既存`applyOutcomeErrorReasonJa`に文言もある)、`applyRunOutcome`という**純関数**(`runOutcomeApplication.ts`)自体が直接呼ばれた場合には返しうる値だが、**store action(`saveStore.ts`)からこの値が実際に呼び出し元まで到達する経路が現状確認できていない**(上記の事前ゲートが先に働くため)。したがって本書は、`staleLease`について**具体的なUI表示契約(P3-4の既定E2E契約)を設計しない**——既存の`applyOutcomeErrorReasonJa('staleLease')`の単体テスト(純粋な文言関数としての正しさ)のみを維持し、実際にproduction action経路からこの値が到達する具体的な状況証拠が得られた場合にのみ、その時点でFable/人間へ個別質問として提起する(§22)。

---

## 3. 画面構成・遷移・検死レポート・実験ノート導線・文言・キー操作(全文、正式UI v5からのインライン、I1是正)

本節は正式UI v5 §4〜§9の該当内容を、他文書を参照せず実装できる水準で全文インラインする。

### 3.1 画面構成・導線(正式UI v5 §4)

`gameStore.ts`の`mode`ユニオン型へ`'encyclopedia'`を追加する。起動時/ガレージ復帰時/新規走行の開始操作のいずれのタイミングでも、次の判定順序に従う:

```
アプリ起動 / ガレージへの遷移 / 新規走行の開始操作
  └─ lease取得状態を判定(§2)
        ├─ leaseNotAcquired(待機中、エラーではない)
        │     → 「前回セッションの終了確認中です」を待機表示。自動再判定。
        │       この間は新規走行開始に加え、閲覧を除く全store状態変更操作
        │       (購入・売却/サルベージ・装備変更・在庫消費・セーブ初期化・
        │       実験ノート操作・pending結果の再試行/放棄を含む)が不可
        └─ lease取得済み → pendingApplicationが非nullか判定
              ├─ 非null → 保留中結果の復元画面(§3.3)。新規走行の開始ボタンは無効化
              └─ null → 通常のガレージ / 新規走行の開始を許可

ガレージ(拠点)
  └─ 本棚 → 失敗図鑑一覧(mode:'encyclopedia')
              ├─ D0xサムネイル(未発見はシルエット。D08は一覧に含めない)
              └─ 選択 → D0x詳細画面(検死レポート統合先、§3.2)

走行画面(testRun/course/motor-only)
  ├─ 走行中(非終端stage: D01進行/D02発煙/D04膨張・発煙/D05スパーク/
  │         D06歯欠け進行〈全損未満〉/D07可逆・不可逆/D09摩擦増)
  │     → 症状・イベント通知のみ表示、走行継続
  └─ RunOutcome確定(engineが返すendReasonに従う。UI側の独自判定なし)
        → 結果反映(全endReason共通、原子的適用を1回実行、§12)
        ├─ endReason: destructionTerminal → 停止画面(§3.3-B)を経て検死レポートへ
        └─ endReason: finished/stalled/derailed/overheated/energyExhausted/manualAbort
              → 通常のリザルト画面(新規発見があれば発見一覧を経由、§3.3-C)
```

図鑑一覧・D0x詳細・発見一覧・保留中結果画面はすべて閲覧または再試行/放棄操作専用であり、購入・サルベージのような日常的な状態変更操作とは扱いを分ける。保留中結果画面が表示されている間、走行開始に加え、閲覧を伴わない全store変更操作の入口を無効化する。

### 3.2 検死レポート統合レイアウト(正式UI v5 §5、図鑑D0x詳細画面)

**共通レイアウト(J6是正、新設)**: 正式UI v5 §5自体は「v4から継続する構成に加え」という前提で追加事項のみを記載しており、共通レイアウトの列挙を持たない旧版(v4)を参照しないと画面全体を実装できない状態だった。本節はこの欠落を、実在する型(`CodexRecordEntry`・`DestructionState`・`DegradationDiff`)から導出した具体的な共通レイアウトとして新設する——これはbrabit側の設計提案であり、正式UI v5の文言そのものの引用ではない(alice/Suu/Fableへの確認事項として§22にも挙げる)。D0x詳細画面は、当該モードが**既発見**(`codexRecords`に該当`modeId`のエントリが存在)の場合、次のフィールドを上から順に表示する:

1. **見出し**: モードID(D01〜D09)+症状名(art-spec/spec §7.1の名称、例: 「D03 電池破裂」)。
2. **発見情報**: `CodexRecordEntry.firstDiscoveredAtRunSequence`(初回発見時の走行連番)を基準に「初回発見: n回目の走行」のように表示する(絶対日時は表示しない、runSequenceのみが記録されている契約と整合させる)。
3. **構成情報**: `CodexRecordEntry.replaySnapshot`(発見時点の`RunSnapshot`)から、走行文脈(motor-only/test-run/track-run)を表示する。`replaySnapshot.recipeKey`自体は個体を特定しうる内部識別子であり、画面上には表示しない(§3.5の「内部識別子をゲーム画面の文言に出さない」既存方針の直接適用)。
4. **原因情報(causeLog)+劣化差分の保存元(K2是正、未解決事項として拡張)**: 各モードのcauseLog型(`D0xCauseLog`、モードごとにフィールドが異なる、例: D07なら温度規約に従ったゲージ値+`温度モデル未較正`表示)を、§3.2既存項目(延焼・磁石延焼性能・電池膨張非恒久・熱ゲージ)の規約に従って表示する。**`CodexRecordEntry`(`src/store/runOutcomeApplication.ts:225-229`)は`{modeId, firstDiscoveredAtRunSequence, replaySnapshot}`のみを保持し、causeLogを含む生イベント(`DestructionEvent`)を一切持たない**——さらに実測の結果、**劣化差分(`DegradationDiff`)も同様に保存元がない**ことを確認した: `RunOutcome.degradationDiffs`はrun全体の配列(複数モードの差分が混在しうる)であり、`CodexRecordEntry`生成後にはこの情報自体が失われる。UI側が「どのdiffがどのmodeに帰属するか」を独自に再構築することもできない(diffには発生元のmodeを直接示す情報がなく、causeLog同様の欠落)。**推奨候補**: `CodexRecordEntry`を拡張し、(a) 初回登録時点の「発見イベント」(`discoveryEvent`、`physicsSnapshotAtT`+当該モードの`causeLog`を含む)、(b) 当該run全体で確定した劣化差分の配列(`runDegradationDiffs`、複数モード分をそのまま保持し、UIは特定モードへの虚偽の個別帰属をしない——「この走行で確定した劣化」という走行単位の事実としてのみ表示する)、の2フィールドを追加する。**対立案(実験ノート参照)**: `firstDiscoveredAtRunSequence`から対応する実験ノート記録を検索して参照する案もあるが、(i) `runSequence`による安定した参照契約が現状存在しない(実験ノート側のレコードにrunSequenceを検索キーとして引く機構がない)、(ii) 実験ノートの3腕は上限50件で自動trimされる(§3.4)ため、発見から時間が経つと参照先が失われうる、という弱点を持つ——`CodexRecordEntry`拡張案(推奨)より脆弱である。**型拡張・validator・migration/legacy表示(discoveryEvent/runDegradationDiffsを持たない既存codexRecordsとの共存)・`codexRecords`最大8件という既存の有界性制約内に収まるデータ量であることの確認・人間再承認要否**を含め、いずれもalice/Fable/人間へ確認する未解決事項とし、本書側で独断確定しない(§22-9)。
5. **報酬/発見**: 初回発見時のみ、報酬付与済みであることを表示する(3.3-B(2)の原子的反映で既に付与済み、本画面は表示のみ)。既発見の場合は報酬ブロックを表示しない(3.3-B(3)の既存契約)。
6. **記録導線**: 実験ノートへの遷移リンク(§3.4)。

**未発見(シルエット)の場合**: 上記1(見出しのみモードIDを伏せた表示、例:「未発見」)+発見条件のヒント(仮、文言は§3.5の確定に合わせる)のみを表示し、2以降は表示しない。

- **延焼(D04)表示**: `affectedRoles`(`FireExposureRole`配列。body装備時は`'body'`を先頭含み、その後に隣接role〈Phase 3では`'magnet'`のみ〉が続く)を**唯一の入力**として延焼部位を表示する。`'body'`が含まれていれば「ボディへの延焼」、`'magnet'`が含まれていれば「磁石への延焼」と表示し、UI側で`bodyEquipped`や劣化差分から独自に延焼対象を再導出・二重表示しない。
- **磁石延焼の性能表示**: `affectedRoles`に`'magnet'`が含まれる場合、engineはD04の原因diffとして`{role:'magnet', kind:'scorch'}`を生成する(`kind:'scorch'`はそのまま保持され`demagnetization`等へ置換されない)。適用先はD07の不可逆減磁と同じ`demagnetizationFraction`であり、独立した架空の性能量を新設しない。検死レポート上の性能低下表示は、原因(D04延焼由来かD07の熱減磁由来か)を問わず**単一の「磁石の実効磁力低下」として一本化して表示する**——性能数値としての二重計上をしない、という結果だけをUI側の要件とし、原因の記録(`scorch`という`kind`自体)はUI側で書き換えない。
- **電池膨張の非恒久表示**: D04が膨張・発煙段階のまま炎上に至らずに走行が終わった場合、当該電池個体には恒久状態を残さない。**走行画面外(図鑑・在庫・ガレージ等)では、電池個体の「膨張済み」表示を一切行わない**。膨張・発煙への到達は当該走行の記録(HUD症状表示・実験ノート等)には残るため「現象は隠さない」という難易度哲学は満たされる——恒久的な個体状態としてだけ残らない、という区別を実装時に徹底する。
- **熱ゲージ表示**: 熱状態の型自体は`measured`/`uncalibratedGauge`/`unavailable`の3状態unionだが、Phase 3で生成されるイベントは`uncalibratedGauge`/`unavailable`の2状態に限定される(D02/D03/D04/D07/D09いずれも共通)。UIはこの2状態のみを表示対象とし、「ゲージ値+温度モデル未較正」または「未計測」のいずれかを示す。℃表示はしない。将来較正後に`measured`を持つ新規イベントが現れても、過去に記録済みのcauseLogは遡及更新されない。
- D0x一覧画面はD01〜D07・D09の8マス固定、D08は一覧に含めない。

### 3.3 破壊発生時の遷移フロー(正式UI v5 §6、`RunOutcome.endReason`に一本化)

**UIは`RunOutcome.endReason`の値のみに従って画面遷移を分岐する。mode IDや独自の物理閾値では判定しない。**

**結果反映は全`endReason`共通の処理とし、画面分岐より先に行う**: `finished`・`stalled`・`derailed`・`overheated`・`energyExhausted`・`manualAbort`のいずれで走行が終わった場合も、`RunOutcome`確定直後に単一アクションを1回呼び、途中まで進行していた劣化差分・新規発見・実験ノート記録を原子的に適用する。「非破壊系の終了だから結果反映をスキップする」という分岐は存在しない。反映成功後にのみ、`endReason`で停止画面(3.3-B)か通常リザルト(新規発見があれば3.3-C)かを分ける。反映失敗時はendReasonに関わらず§2の整合性エラー導線へ入る。

**3.3-A. 非終端stage(走行継続)**: D01進行、D02発煙段階、D04膨張・発煙段階、D05スパーク、D06歯欠け進行(全損未満)、D07可逆熱ダレ・不可逆減磁(いずれも走行は継続)、D09摩擦増段階。走行画面のHUD領域へ症状表示を反映するのみで、画面遷移は発生しない。D06が全歯欠け(全損)に到達した場合はここに含めない——`terminalModeCandidates`へ追加され3.3-Bの`destructionTerminal`へ進む。UIは歯数を独自に数えず、`RunOutcome`の判定結果だけに従う。**HUD参照範囲**: このHUD症状表示は、engine側のstep結果に含まれる`DestructionState`を**読み取り専用**で参照する。UIはこの読み取り専用参照以外の経路(独自の閾値判定・独自の物理計算等)で症状の有無を推測しない。

**3.3-B. `endReason==='destructionTerminal'`(停止画面へ)**: D02発火・D03破裂・D04炎上・D06全損・D09焼付きが対象になりうる(`terminalModes`に含まれるモードはengineの判定結果に従う、UI側で列挙をハードコードしない)。(1) engineが`finalizeDestructionRun`により`RunOutcome`(`endReason:'destructionTerminal'`、`terminalModes`非空配列)を確定した時点で走行を停止する。(2) 結果反映は3.3節冒頭の全endReason共通処理で完了済み——`destructionTerminal`だからといってここで改めて適用アクションを呼び直さない。1つの`RunOutcome`につき適用呼び出しは常に1回(§12)。(3) 反映成功時: 停止画面で破壊演出・症状を表示したまま自動では遷移せず、プレイヤー操作「検死レポートへ」を待つ。押下後の遷移先: **新規発見が2件以上**なら発見一覧(3.3-C)を経由する。**新規発見が1件**ならその新規発見のD0x詳細画面へ直行する。**新規発見が0件**(`terminalModes`に含まれるモードがすべて既発見)なら、`terminalModes`の先頭モードの登録済み詳細画面へ直行する(既発見なので報酬ブロックは表示しない)。(4) 反映失敗時: §2の整合性エラー導線(保留中結果画面)へ入る。

**3.3-C. 複数モード同時発見時の導線**: 新規発見が2件以上の場合、「今回の発見一覧」画面を先に表示し、各詳細を順に閲覧できるようにする。報酬は3.3-B(2)の原子的反映で一括付与済みであり、詳細画面は記録の表示のみ。

**3.3-D. 保留中結果(`pendingApplication`)の復元・再試行・新規走行ブロック**: 通常の検死レポート画面(3.3-B・3.3-C)とは独立した画面/導線として設計する。**検知**: アプリ起動時、およびガレージへの遷移時に、storeの永続化された`pendingApplication`を確認する。非nullであれば専用画面へ強制的に遷移する(この画面を経由せずガレージの通常機能へは到達できない)。**表示内容**: 「前回の走行結果を保存できませんでした」という趣旨の説明、可能な範囲で保存されている走行終了理由・新規発見件数等の要約。**閲覧以外の全store変更操作のブロック**: `pendingApplication`は走行開始時点の個体IDへ差分を適用する契約であるため、保留中に対象個体が変化すると再試行時に`missingEquipment`等で恒久的に失敗しうる。したがって解決するまで、新規走行(testRun/course/motor-onlyへの遷移)に加えて、ショップ購入・売却/サルベージ・装備変更・在庫消費・セーブ初期化等、閲覧を伴わないすべてのstore変更操作をブロックする。図鑑・在庫情報等の純粋な閲覧は許可する。**音量・CRT表示等の設定操作は、`saveStore`および`pendingApplication`のいずれも一切変更しない、完全に独立した設定領域に限り例外として許可する**——設定値が万一`saveStore`側のフィールドとして持たれる設計になった場合、その設定はこの例外の対象外となり通常の書き込み操作と同様にブロックされる。**再試行操作**: 「もう一度保存を試す」ボタンで、storeの再試行アクションを呼ぶ。成功した場合、通常の走行終了後フロー(3.3-B(3)〜、または3.3-C)へ合流する。失敗した場合はこの画面に留まり、再試行を繰り返せる。**明示的放棄操作**: データ破損等で恒久的に解決不能なケースのための救済導線。「この記録を破棄する」操作は、通常の「戻る」「検死レポートへ」等の閲覧遷移とは明確に区別する。具体的には: (a) 再試行ボタンとは別の位置に配置し誤操作を避ける、(b) 押下後に「破棄すると当該走行の劣化・発見記録・報酬は永久に失われます。元に戻せません」という趣旨の確認画面を挟む、(c) 確認画面での最終操作を経て初めて放棄が確定する(単一クリックで即座に破棄しない)。**放棄確定後**: 新規走行のブロックを解除し、通常のガレージへ戻る。放棄した走行の結果(劣化・発見・報酬)は一切適用されない。

**3.3-E. 電池消滅後の明示的再装備**: D03/D04で電池個体が消滅した場合、原子的適用(`AppliedRunResult.consumedEquipmentIds`)により当該装備スロットはnull化される。engineはこの際、**別の所持電池を自動装備しない**(プレイヤーの意図しないレシピ変更を避けるため)。UI側の遷移: (1) 走行終了後の結果画面を表示した後、ガレージに戻った時点で電池スロットが空(null)であることをガレージ画面上で視覚的に示す(既存の装備不足表示パターンを踏襲)。(2) 電池スロットが空の状態では、新規走行の開始入口を無効化し、「電池を装備してください」等の案内を表示する(これはlease/pending由来のブロックとは別系統、通常のガレージ操作は制限しない)。(3) プレイヤーが明示的に別の電池を選び直すことでスロットが埋まり、通常どおり新規走行を開始できるようになる。(4) 「電池が消滅しました。再装備してください」という趣旨の通知は、破壊発生時の検死レポートまたは結果画面のいずれかで一度提示する。

### 3.4 実験ノートとの導線(正式UI v5 §7)

D0x詳細画面からの導線・実験ノート側の責務分離。**実験ノートの自動trim**: 実験ノートの3腕(motor-only/test-run/track-run、それぞれ判別union型の別記録)は、いずれも原子的適用時(3.3節冒頭の全endReason共通処理)に上限50件で**自動的に**trimされる。上限到達時にどの記録を残すか・削除するかをプレイヤーに確認するモーダルUIは撤去する(原子的適用はプレイヤーのボタン選択を待てないため、確認フローと原子性は構造的に両立せず原子性を優先する)。**codexRecords(図鑑の検死記録、追記のみ・最大8件)はこのtrim対象に含まれない**——実験ノートの3腕とは別の永続領域であり、上限方式も異なる。任意(brabit裁量): 上限到達で最古の記録が自動削除された走行の直後に、リザルト画面等で非モーダルの通知を1つ出してもよい。

### 3.5 文言例(正式UI v5 §8、仮、Fable/Suuレビュー・人間承認で確定)

- 保留中結果画面の見出し: 「前回の走行結果を保存できませんでした」
- 再試行ボタン: 「もう一度保存を試す」
- 放棄ボタン: 「この記録を破棄する」
- 放棄確認画面: 「破棄すると当該走行の劣化・発見記録・報酬は永久に失われます。元に戻せません」
- lease待機中の表示: 「前回セッションの終了確認中です」(「失敗」「エラー」等の否定的な語を使わない。起動時・新規走行開始時のいずれでも共通の文言とする)
- 開発工程・Phase番号・内部エラーコード・`leaseToken`等の内部識別子をゲーム画面の文言に出さない。

### 3.6 キー操作・非機能要件(正式UI v5 §9)

- 保留中結果画面の「もう一度保存を試す」「この記録を破棄する」、および放棄確認画面の最終操作ボタンは、いずれもフォーカス可能なDOM要素としてEnter/Spaceで操作可能にする。
- 放棄確認画面はフォーカストラップ(画面内の要素のみをTab移動対象にする)とし、誤って背後の要素を操作できないようにする。
- (§13でa11y全11項目として追加のDoDを定義する)

### 3.7 Store所有境界(正式UI v5 §10)

UI側は「再試行する」「放棄する」に対応する単一のstoreアクションをそれぞれ1回ずつ呼び、成否のみを受け取る。`RunApplicationEnvelope`の中身・`saveId`/`leaseToken`照合・永続化形式の実装はP3-0契約(alice/store領域)に委ねる。

**保留中結果画面の表示方式(J6是正、確定)**: 「`mode`ユニオンへの追加要否は実装時に決定する」という先送りを撤回する。**既存`SaveGate`(`src/components/SaveGate.tsx`)は既にアプリ境界として`corrupted`/`waiting`/`pending`/`normal`の4モードを所有しており、`App.tsx`のルーティングより上位でこれらを表示する構造になっている**——保留中結果画面(`pending`)・待機画面(`waiting`)は、この既存`SaveGate`の表示としてそのまま実装する(§2の3区分の実体)。`gameStore.ts`の`mode`ユニオンへ新規追加するのは`'encyclopedia'`のみであり、保留中結果画面専用の新しい`mode`値やオーバーレイ表示機構は追加しない——`SaveGate`は`gameStore.mode`とは独立したアプリ境界レイヤーであるため、両者を混同しない。

---

## 4. 前提: 既存資産の継承範囲

- lease/pending UI境界(`src/components/SaveGate.tsx`・`src/components/saveGateMode.ts`、純関数`computeSaveGateMode`、テスト済み)。破損・待機・保留中の3状態、`retryPendingApplicationAction`/`abandonPendingApplicationAction`の呼び出し、二段確認付き放棄フローはP3-0で実装済み。
- 統合永続store(`src/store/saveStore.ts`)。`beginRunAction`・`performApplyRunOutcome`・`retryPendingApplicationAction`・`updateProgress`等の全action、lease状態機械、runtime validatorはP3-0で実装済み。P3-4はこれらのactionを初めて実際のゲームループから呼び出す(=配線する)フェーズであり、action自体の新規実装は原則不要。
- `regressionDiff.ts`(`src/materials/regressionDiff.ts`、P3-2ゲート8)。三段開示段階2の統計判定純関数。`detectPerformanceRegression(current, pastObservations)`が実装済み・24テスト済み。
- 音合成基盤(`src/retro/audio/`、Phase 1実装済み)。`synth.ts`の`InstrumentParams`型(`{name, waveform, frequencyHz, durationSec(0.1〜2s), attackSec, decaySec, sustainLevel, releaseSec, pitched}`)+`renderInstrumentSample`。`motorSound.ts`の連続音modulationパターン(`computeMotorPlaybackRate`/`computeMotorGain`、`AudioBufferSourceNode.loop=true`+RPM連動)。`mixLevels.ts`のゲイン予算規律(`BGM_MASTER_GAIN`0.93+`MOTOR_MASTER_GAIN`0.07≦1.0)。**現状これらの消費者は`AudioDemo.tsx`/`WorstCaseDemo.tsx`という試作画面のみで、実プレイ画面への配線自体も未着手**(§20)。
- 既存の`discoveredModes: readonly DestructionModeId[]`(`saveStore.ts`、`Encyclopedia`型)——重複拒否validator付きの配列永続化パターン。§11.3のガウスメーター所持状態設計はこのパターンを踏襲する。

---

## 5. スコープ

| # | 項目 | 対応節 | alice側ゲート依存 |
|---|---|---|---|
| 1 | production配線後の全endReason 1回適用 | §6・§12 | 依存(G1a〜G1c) |
| 2 | D06反復歯欠け/全損 | §8 | 依存(alice G3) |
| 3 | D09摩擦増/焼付き | §8 | 依存(alice G4) |
| 4 | D04途中段階のfinalDestructionState記録+走行外膨張非表示 | §10 | 依存(alice G6) |
| 5 | pending/lease UI(3区分) | §9 | 非依存(実装済み) |
| 6 | 三段開示・図鑑・検死・計測器 | §11 | 一部依存(recipeKeyは読み取り専用化で解消) |
| 7 | D01〜D07/D09の演出/SE | §8 | 依存(全モード一括接続) |
| 8 | キーボード/a11y | §13 | 非依存 |
| 9 | bundle 1MB未満 | §14 | 非依存 |
| 10 | 人間試遊導線 | §15 | 依存 |

---

## 6. production配線設計

### 6.1 `DestructionConfig`生成(確定-2、M1〜M3是正でG1a′ resolver経由へ精密化)

`assembleDestructionConfig(selection, equipmentContext)`を`RunSnapshot` capture時に1箇所から呼ぶ。Result型を返さないため呼び出し側でのok/ng分岐は不要——ただし§6.2で述べる`applyWearToMotorConfig`/`applyWearToCarConfig`が`{ok:false, reason}`を返しうるため、beginRun全体としての失敗経路はそちらに存在する。**`selection`(`MaterialSelection`)・`equipmentContext`(`EquipmentDestructionContext`、`bodyId`込み)はいずれもalice所有のG1a′ resolver(`deriveMaterialSelectionFromEquipment`相当、`src/store/runOutcomeApplication.ts`、engine計画v14 §4.4)の単一呼び出し結果をそのまま渡す**——v10までの「`EquipmentDestructionContext.bodyId`はbrabitが`EquipmentLoadout.bodyAssemblyId`から解決し`null`時は`'body-none'`へ正規化してから渡す」という記述は、arbiter補足裁定Q1により誤りと訂正された(interface自体の型・フィールドは無変更、正規化の実施主体のみresolverへ統合)。brabit側はこのresolverの戻り値(`{ok:true, selection, equipmentContext}`または`{ok:false, reason, missingRole}`)を受け取り、失敗時は§6.4.1の既存`missingRole`行と同型に扱う配線のみを行う——resolver内部の検証ロジック(存在・family・bearing一致等)を独自に再実装しない。

### 6.2 motor-only終了ライフサイクル+`RunSnapshot` capture配線+recipeKey計算順序

**motor-only終了ライフサイクル(J5是正、実コード事実に合わせて自然終端入口を削除)**: 既存コード(gameStore.ts)を確認すると、`finishAssembly`(組み立て完了→lab遷移)・`flickStart`(ラボでの再始動)はいずれも`finishActiveSession(get())`を先に呼んでから新セッションを始めている——これは既存の(V2由来の)実験ノート記録用セッション管理であり、Phase 3の`RunSnapshot`/`RunAccumulator`とは別の仕組みである。**`src/engine/motorPhysics.ts`の`step`関数を実測した結果、`SimState.running`をfalseへ遷移させる経路は存在しない**(550行・581行いずれも既存の`state.running`値をそのまま返すのみ)——motor-onlyには現行production上、物理stepそのものが自発的に停止する「自然終端」が存在しない。**v7で終了入口の一つとして挙げていた「(a) 物理的な停止」はこの理由により撤回する**。**次の3つを明確に区別する**: (1) 初回開始=`finishAssembly`。(2) 再始動前の既存run確定=`flickStart`(既存run未確定のまま呼ばれた場合、Phase 3側の`RunAccumulator`も同じ「前のrunを終わらせずに次を始めない」原則に従わせるため、`finalizeRun(accumulator, {kind:'manualAbort'})`を暗黙に呼んで確定させてから新しい`RunSnapshot`を作る設計を提案する)。(3) 新snapshotでのbeginRun。**motor-onlyの全終了入口(現行productionに実在する4つのユーザー操作契機のみ)**: (a) `resetSim`、(b) `setMode`(他モードへの画面遷移)、(c) `flickStart`の再呼び出し、(d) `finishAssembly`の再呼び出し。**これら4入口はすべてユーザー操作/画面遷移が契機であり、`manualAbort`相当として扱う**(destructionTerminalが既にwrapperの`termination`として確定している場合はそちらを優先する、既存の優先順位契約どおり)。将来、物理層に`running=false`を外部から設定する経路(例えば燃料/エネルギー切れ相当の自然停止)が追加された場合、その扱いはこの契約の対象外とし、追加時に別途確認する。これらすべての入口で、`RunOutcome`生成→`performApplyRunOutcome`→notebook反映が各runにつきちょうど1回になるよう、単一のadapter関数(仮称`finalizeMotorOnlyRunIfActive(accumulator)`)を新設し、上記(a)〜(d)のいずれの入口からもこの単一関数を経由させる。**既存`finishActiveSession`との二重生成回避(I5是正、廃止タイミングを明確化)**: `productionWiringEnabled`(§7)がtrueの経路とfalseの経路を排他的に実装する——**true側**では`finalizeMotorOnlyRunIfActive`経由のPhase 3 notebook記録のみを行い、旧`finishActiveSession`の直接`addSession`呼び出しは**呼ばない**。**false側**では旧経路(直接`addSession`)のみを維持する。この排他実装自体はG1b(motor-only配線)/G6(notebook型変更が絡む場合)の時点で完成させる。**G統合commitはフラグの`false→true`書き換えのみ**であり、旧経路のコード自体はこの時点でまだ残っている(true側では実行されないだけ)。G9(§17)で、false側の分岐および旧`finishActiveSession`の直接`addSession`呼び出しコードそのものを削除する——**旧経路削除はG9のみが行う**。二重notebook生成が発生しないこと(true経路実行時にPhase 3記録のみが1件生成され、旧経路由来の記録が生成されないこと)をG1c/G1統合テストのDoDへ含める(§23)。

**二層命名(M1是正、engine計画v14 §12と同期)**: 以降「base config」という語は次の2層に区別する。**`rawPlayerConfig`**: `gameStore.config`/`carConfig`系統(V2スライダー・プリセット・recipe・診断由来の全8系統+`useSaveStore.subscribe`同期。素材選択を一切知らない)。**`materialComposedBase`**: `composeConfigFromMaterials(rawPlayerMotorConfig, rawPlayerCarConfig, baseline, selection)`の出力(Wear反映**前**)。以下の8段順で「base config」と書いていた箇所は、いずれも`materialComposedBase`を指す。

**production単一出典契約(M2是正)**: `rawPlayerCarConfig`は**beginRun時の`resolveGarageBuild(garageSelection)`単一呼び出し結果**とし、`gameStore.carConfig`現在値を直接読まない(`setLabCarConfig`/`setDiagnosisCarConfig`等の直接編集値は素材走行へ影響しない、人間再承認P反映済み)。`rawPlayerMotorConfig`は`gameStore.config`を単一読取りする。

**`RunSnapshot` capture時の確定した呼び出し順序(8段順、段1はM3是正でG1a′境界に合わせ1a〜1eへ精密化。alice計画v14 §14.2と同期)**:

1. **`materialComposedBase`確定**(素材写像+装備由来の値):
   - 1a. `rawPlayerConfig`(`gameStore.config`)・`EquipmentLoadout`・`PlayerInventory`・`garageSelection`の単一読取り
   - 1b. `validateEquipmentLoadout`(既存)による装備検証
   - 1c. G1a′ resolver(§6.1、`deriveMaterialSelectionFromEquipment`相当)による`selection`・`equipmentContext`導出
   - 1d. `MaterialCompositionBaseline`のproduction構築(alice所有の単一純関数、実シグネチャ`resolveProductionMaterialCompositionBaseline(rawPlayerMotorConfig: MotorConfig, garageBuild: GarageBuildResult): MaterialCompositionBaseline`〈`src/store/runOutcomeApplication.ts`〉。`chassisBaselineG`は`rawPlayerMotorConfig.batteryVoltage`から導出した`cellSelection`を`resolveChassisBaselineG`へ渡した結果、`baseGearEfficiency`は引数`garageBuild.carConfig.gearEfficiency`。brabit側はこの関数を呼ぶだけで内部を再実装しない)
   - 1e. `composeConfigFromMaterials(rawPlayerMotorConfig, rawPlayerCarConfig, baseline, selection)`で`materialComposedBase`を得る。**`garageBuild`単一出典の徹底**: `resolveGarageBuild(garageSelection)`をbrabit側でexact 1回だけ呼び、その戻り値(`GarageBuildResult`)を`rawPlayerCarConfig`(=`garageBuild.carConfig`)と1dの`resolveProductionMaterialCompositionBaseline`の`garageBuild`引数の**両方へ同一実体として渡す**——`resolveProductionMaterialCompositionBaseline`内部では`resolveGarageBuild`を再呼出ししない(構造的に不可能なシグネチャ、S-3是正)。brabit側の呼び出しコードが実際にexact 1回しか呼ばないこと・同一実体を渡すことは、G1bのC-4統合テストで固定する。
2. **[L2新設・C-3]** `materialComposedBase`の全フィールドについて有限性検証(`Number.isFinite`)を行う。検証失敗時はここでbeginRun全体を**開始しない**——`RunSnapshot`/`RunAccumulator`を作らず、`{ok:false, reason}`を返す。
3. `computeRecipeKey(selection, materialComposedBase.motorConfig, materialComposedBase.carConfig)`をbrabit所有の`beginRunAction`内でexact 1回呼ぶ(alice提供の関数、Wear反映**前**の`materialComposedBase`を引数として呼ぶ。R2確定により第一引数に1cの`selection`を渡す)。
4. `applyWearToMotorConfig`→`applyWearToCarConfig`(alice所有、失敗しうる、`{ok:false,reason}`の場合はbeginRun全体を**開始しない**、§6.4)。
5. `assembleDestructionConfig(selection, equipmentContext)`呼び出し(§6.1、1cの結果を使う)。
6. `createInitialDestructionState()`を呼び、初期`DestructionState`を得る。
7. **[L1新設・M-1(i)]** 装備中のギヤ個体の永続`WearState.gear.toothLossCount`を読み取り(単一出典=装備個体)、alice所有の`seedInitialDestructionStateFromWear(base: DestructionState, equippedGearToothLossCount: number): DestructionState`(`src/materials/wearReflection.ts`)へ6の結果と共に渡す——**M-1のseeding処理自体は`captureRunSnapshot`への追加のシグネチャ変更を生まない**(`captureRunSnapshot`は人間再承認A〈`recipeKey`必須追加〉により既に破壊的シグネチャ変更を受けているが〈8参照〉、`initialDestructionState`自体はAが追加した引数ではなくP3-0/P3-1以来の既存入力であり、M-1 seedingはこの既存入力へseeding済みの値を渡すだけである)。
8. `captureRunSnapshot`(recipeKey〈3〉・Wear反映後の実効config〈4〉・`destructionConfig`〈5〉・7の結果を既存の`initialDestructionState`引数へそのまま渡す、`contractVersion`は固定値**3**、確定-7)。

この8ステップ(1a〜1eを含む)の順序を守ることがbrabit実装の契約である。**restore時の検証(M-1(iv))**: `restoreRunSnapshot`は`initialDestructionState.modes.D06.toothLossCount`が0以上`gearTotalToothCount`**未満**の整数であることを検証し(alice所有)、不一致は`invalidSchema`として拒否する——brabit側はこの検証結果をそのまま§6.4.1の失敗表に従って扱う。

**G1a′/G1b/G6のゲート分割(Suu_mot3裁定2026-08-15T10:27+arbiter補足裁定Q6+arbiter追加裁定Q9、N1〜N2是正でG1a′完了条件とG1bのDoDを更新)**: 上記8段順は**P3-4完了時点の最終形**であり、単一ゲートで一括実装するものではない。実コード実測の結果、`src/materials/wearReflection.ts`(`applyWearToMotorConfig`/`applyWearToCarConfig`/`seedInitialDestructionStateFromWear`を含む)は2026-08-16時点で**存在しない**——engine計画v14のゲート表(§3.1)はこれらをG6(「WearState反映+collapsed rotor拒否+finalDestructionState+recipeKey搬送+fireExposureProfile+regressionDiff+計測器所持状態」)に位置づけており、G1a/**G1a′**/G1bには含まれない。したがって:
- **G1a′で新設する段(alice所有、G1aとG1bの間、新ゲート)**: 1cのresolver(`deriveMaterialSelectionFromEquipment`相当)・1dのbaseline単一出典構築関数。brabit側の実装対象ではないが、**G1bの着手条件そのもの**である(下記参照)。**G1a′完了条件(N1是正、Q9で限定)**: S-1〜S-4・S-6〜S-10+負例N-1・N-2前半・N-3の充足、および1c/1d/`composeConfigFromMaterials`が**純関数であること**(引数以外を読まず、store/localStorage/グローバル状態へ書き込まないこと)のテスト固定——S-5(失敗時不変条件)・N-2後半(beginRunAction統合テスト)はG1a′の完了条件から**除外**され、G1bへ移管される(下記N2参照)。**2026-08-16、G1a′は上記条件でSuu_mot3照合を通過した(正式完了)。**
- **G1bで配線する段(brabit所有)**: 1(1a単一読取り相当)・2(有限性検証)・3(`computeRecipeKey`)・5(`assembleDestructionConfig`)・6(`createInitialDestructionState`)・8(`captureRunSnapshot`)——この6段のみ。段1の実体は**最初からG1a′のresolver・baseline関数を呼ぶ完成形**として実装する(G1a′完了前のG1b着手経路は存在しない)。8へ渡す実効configは4未実装のため**現時点では`materialComposedBase`と同一(identity)**、`initialDestructionState`は7未実装のため**unseeded**(`createInitialDestructionState`の戻り値をそのまま渡す)。**G1bの必須DoD追加(N2是正、Q9でG1a′から移管)**: S-5の失敗時不変条件(`nextRunSequence`不変・`pendingRunEquipmentSnapshot`不変・`RunSnapshot`/`RunAccumulator`不生成・gameStoreローカルruntime state不変の4項目)を、resolver失敗・baseline/compose失敗・有限性検証失敗の**3経路それぞれ**について、N-2後半の統合テスト(beginRunAction経由での範囲外baseline失敗再現)とともにG1b配線と同一差分内で実装する。「config構築失敗がrunSequence消費より前に確定する構築順序」の実装指針もG1bの責務に含む。テスト所有はalice(純関数・fixture提供)+brabit(beginRunAction配線・統合テスト本体)の共同。
- **G6で追加する段**: 4(Wear反映)・7(D06 seeding)。既存の3/5/6/8の呼び出し経路へ、同じ位置に挿入する形で追加する(新しい並行経路を作らない)。
- **G1b着手条件(arbiter補足裁定Q6)**: 「G1a完了後」ではなく**「G1a′完了(Q9改訂条件充足)+G1a′のSuu_mot3照合通過+人間再承認項目P+追補P-1承認後」**。人間再承認項目P+追補P-1は2026-08-16承認済み、G1a′もSuu_mot3照合を通過し正式完了した(上記参照)——**着手条件自体は充足済みだが、本v12是正の提出中であり、Suu_mot3からG1bの明示解禁指示はまだ届いていない**(§17参照)。
- **G1b時点でunseededが許される理由**: D06はG3(D06状態機械実装)完了までevent発行不能であり、`productionWiringEnabled`はG1a′〜G6を通じてfalseのまま、G1cの検証対象は既存6モード(D01〜D05・D07)のみであるため、D06 seedingの欠落がG1b〜G1c時点の挙動へ影響しない。
- **禁止事項**: G1bで4/7の暫定値・ダミー関数・スタブ・将来のversion分岐を前倒しで置かないこと。
- **C-4最終DoD(arbiter補足裁定Q6、M4是正で確定文言へ更新)**: 「`beginRunAction`内で、loadout・inventory・garageSelection・`gameStore.config`の読取りが各exact 1回であり、1a〜8が単一経路を成し、`materialComposedBase`・`DestructionConfig`・`recipeKey`・(G6以降)実効configがすべて同一の`selection`実体・同一の読取り値から派生することを、呼出し回数モック+同一参照/同値assertで機械的に固定する」——**G1a′(純関数側の単一出典、alice)・G1b(配線側、現存6段分=1a単一読取り相当・2・3・5・6・8、brabit)・G6(8段全体の再固定)の3段階で充足する**(§23 DoD21を参照、G6完了時に改訂)。

test-run文脈は`courseLengthM=TEST_RUN_COURSE_LENGTH_M`(既存定数)+`slopeRad=0`固定。track-run文脈は`courseLengthM`/`slopeRad`共にnull固定(`RunSnapshot`の既存交差検証契約「`track!==null`〈track-run〉⟺`courseLengthM===null && slopeRad===null`」により、選択中trackの`ValidatedTrackDefinition`自体が唯一の出典)。確定-6反映: `deriveFireExposureProfileFromLoadout`もこの同じタイミングで1回だけ呼ぶ。

### 6.3 実wrapper呼び出しの配線

- motor-only: `stepMotorWithDestruction`を`stepSim`相当の置き換えとして呼ぶ。
- test-run: `stepTestRunWithDestruction`を`stepTestRun`の置き換えとして呼ぶ。
- track-run: `stepTrackRunWithDestruction`(確定-3、alice所有の新規実装)を`stepCourseRun`の置き換えとして呼ぶ。UI側による独自の`stepCourseRun`改修・部分置換は行わない。

いずれの`termination`も`destructionTerminal`のみを返す(§12で全経路の表を詳述)。UIの`abortCourseRun`(および motor-only/test-run相当の中断操作)は、`termination`が`null`のまま(=まだdestructionTerminalに到達していない)場合、`finalizeRun(accumulator, {kind:'manualAbort'})`を明示的に呼ぶ責務を持つ(§12.2で原子的順序を詳述)。

### 6.4 `beginRunAction`/`performApplyRunOutcome`の呼び出し契機

#### 6.4.1 `beginRunAction`失敗時の扱い

| 失敗パターン | 実際の型 | SaveGateModeの管轄 | UI側の扱い |
|---|---|---|---|
| storage/corrupted | `{ok:false, reason:'storageError'}` / `{ok:false, reason:'corrupted'}` | **する**(`SaveGateMode==='corrupted'`) | 画面全体がSaveGateにより自動遷移。個別ハンドリング不要 |
| lease未取得 | `{ok:false, reason:'leaseNotAcquired'}` | **する**(`SaveGateMode==='waiting'`) | 画面全体がSaveGateにより自動遷移。待機表示、否定的語を使わない |
| 走行進行中 | `{ok:false, reason:'runInProgress'}` | しない | native `disabled`属性+隣接する理由テキスト |
| 保留中結果あり | `{ok:false, reason:'pendingApplicationExists'}` | しない(通常は§3.3-Dが事前に入口を無効化しているはずの異常系) | 保留中結果画面(`SaveGateMode==='pending'`)へ強制遷移 |
| 装備不足(判別literalではない) | `{ok:false, reason: string, missingRole: EquipmentRole}` | しない | `reason`をそのまま表示。`aria-disabled`+`aria-describedby`+クリック/キーボード操作の両方を明示的にブロック |
| 装備破壊済み(alice計画で新設予定) | `{ok:false, reason: string, destroyedRole: EquipmentRole}` | しない | 上記と同型(§10.5) |
| config構築失敗(**Q10-§3是正で行ラベルを改称**。base有限性検証〈C-3、Wear適用**前**〉およびWear反映**後**のconfig範囲外の**両方**を含む。加えてQ10で確定したcompose失敗〈`composeConfigFromMaterials`の`ok:false`〉・resolver以外の有限性失敗もこの行へ合流する) | `{ok:false, reason: string}`(`missingRole`キー自体を持たない) | しない | run開始しない、ローカル状態不変。`reason`をそのまま表示する。Wear反映後範囲外は理論上到達しない設計だが防御的にハンドリングする |
| **`snapshotCaptureFailed`(Q10-§1・A3で新設。commit済みだが`captureRunSnapshot`が例外を投げた場合)** | `{ok:false, reason:'snapshotCaptureFailed'}` | しない | **下記の契約(a′)を適用する唯一の行**。run開始は永続的にはcommit済み(`saveMeta.nextRunSequence`は進んでいる)だが`RunSnapshot`は得られていない。**再試行が安全であることを示す文言**(例: 「一度目の試行は完了できませんでした。もう一度お試しください」)を表示し、走行開始入口を再度有効にする。「この操作は行われませんでした」という含意の文言は**使わない**(実際には孤立runSequenceが1件発生しているため) |

**契約**: (a) 失敗時、run開始アクションはそこで終了し`RunSnapshot`/`RunAccumulator`は作られない、(b) gameStoreのローカルruntime stateは一切変更しない、(c) `leaseNotAcquired`は待機であり否定的文言を使わない、(d) 一定間隔で自動的に状態を再確認する。

**契約(a′)(Q10-§1・A3で新設、`snapshotCaptureFailed`行にのみ適用する契約(a)の対象外規定)**: `snapshotCaptureFailed`は、**契約(a)を修正するものではなく、契約(a)の対象外にある新規契約**である(arbiter裁定Q10 §1: 「契約(a)の修正ではなく契約(a)の対象外の新規契約の追加として扱う」)。この経路では、(i) 永続状態(`saveMeta.nextRunSequence`)は既にcommit済みであり**ロールバックしない**——孤立したrunSequenceが1件発生することを許容する(P3-0-Q1の高水位runSequence意味論「未適用のまま高水位に飛び越された番号は冪等skip、エラーではない」がそのまま吸収する。プレイヤーがrun開始直後にタブを閉じた場合と構造的に同一の状態であり、本設計に固有の新種の問題ではない)、(ii) `RunSnapshot`/`RunAccumulator`は生成されない(例外により構築が中断されるため)、(iii) **saveStore側のruntime専用フィールド(`currentRunSequence`・`pendingRunEquipmentSnapshot`・`pendingRunSaveId`)を明示的に`null`へ戻す**——これを怠ると`pureBeginRun`の`if (currentRunSequence !== null) return {reason:'runInProgress'}`ガードに阻まれ、**ページリロードなしには再挑戦できないソフトロック**になる(arbiter裁定Q10 §1の具体的負例)、(iv) 例外は未捕捉のまま伝播させない。**disabled方針**: 一律`aria-disabled`にしない。恒常的に既知の禁止(`runInProgress`)はnative `disabled`+隣接理由テキスト。フォーカス可能なまま説明を提示する必要がある入口(`missingRole`/`destroyedRole`)は`aria-disabled`+`aria-describedby`+クリックハンドラ内部とキーボード操作(Enter/Space)の両方で実際の遷移を阻止する。**role区分**: 通常状態は`role="alert"`にしない、緊急対応が必要な状態のみ。**拒否後のフォーカス**: 押下元に留める。

#### 6.4.2 `performApplyRunOutcome`の呼び出し契機

`termination`が非nullになった時点、または`finalizeRun`で明示的に`RunOutcome`を生成した時点で、ちょうど1回呼ぶ(§12)。

### 6.5 gameStore↔saveStoreクロスストア原子的境界(A3、arbiter追加裁定Q10で確定、v13新設)

G1b着手時、UI計画v12までが「`beginRunAction`(gameStore.ts所有)」と記述していた関数の実体が、実コード上は`src/store/saveStore.ts`の既存action(P3-0由来、`gameStore.ts`からは未呼出し)であり、**config構築(§6.2の8段順)とrunSequence発行の原子的境界がどの承認済み計画にも定義されていない**ことが判明した。arbiter追加裁定Q10(2026-08-18、条件付き承認)がこの境界を確定した。本節はその確定内容である。

#### 6.5.1 裁定の骨子(A1・A2不採用、A3採用)

依頼書は2案(A1=commit後`captureRunSnapshot`/A2=commit前capture+UI契約(a)の限定再open)を提示したが、arbiterは**いずれも不採用**とし第3案A3を採用した。理由: 依頼書§0.1が「commit後にcaptureが例外を投げるとrunがcommit済みなのにRunSnapshotを得られない」という状態を**新種の問題**と扱ったのは見落としであり、これはプレイヤーがrun開始直後にタブを閉じた場合(runSequenceは発行済みだがoutcomeが永久に適用されない)と構造的に同一で、**P3-0-Q1の高水位runSequence意味論が既に日常的に許容している状態**である。したがって「例外を投げないというruntime保証」(達成不能)は不要であり、実際に必要なのは「例外が発生しても未捕捉のまま伝播させず、saveStore側のruntime状態を『run進行中』のまま取り残さない」という、より弱いが十分な保証である。**A3はUI契約(a)の再openを一切必要としない**——A2が払う代償(storage I/O失敗経路での契約(a)限定再open)を払わずに済む。

#### 6.5.2 A3の構成(候補Aの骨子+必須修正2点)

fresh読取りは`readGatedFreshState`の1回のみ、config構築は`pureBeginRun`成功後・commit前、`captureRunSnapshot`の実呼出しはcommit成功後——という候補Aの骨子を維持し、次の2点を**必須構成要素**として追加する:

1. `captureRunSnapshot(prepared.snapshotInput)`の呼び出しを`try/catch`で包み、catch時は新設の判別可能な失敗腕`{ok:false, reason:'snapshotCaptureFailed'}`を返す。
2. catchブロック内で、直前に`applyFreshStateToStore`で設定したruntime専用フィールド(`currentRunSequence`・`pendingRunEquipmentSnapshot`・`pendingRunSaveId`)を**明示的に`null`へ戻す`set(...)`を呼ぶ**(§6.4.1契約(a′)(iii)のソフトロック回避、arbiter裁定の具体的負例)。

#### 6.5.3 型・シグネチャ(所有: いずれもbrabit)

```ts
// src/store/saveStore.ts が定義・export する(型所有をsaveStore側へ置くことで、
// 既存の gameStore.ts → saveStore.ts という一方向依存を維持する。逆方向の型依存を作らない)
export type RunPreparationResult =
  | { ok: true; snapshotInput: CaptureRunSnapshotInput }
  | { ok: false; reason: string; missingRole: EquipmentRole } // resolver失敗腕
  | { ok: false; reason: string };                            // compose/有限性失敗腕(missingRoleキー自体を持たない)

export type RunPreparationCallback = (
  loadout: EquipmentLoadout & { batteryItemId: string },
  inventory: PlayerInventory,
  equipmentSnapshot: EquipmentIdSnapshot, // pureBeginRunの権威値をそのまま渡す(単一出典、再計算しない)
) => RunPreparationResult;

// SaveStore型へ追加する新規public action(既存beginRunActionは無改修のまま並存)
beginRunActionWithPreparation: (
  context: 'motor' | 'vehicle',
  prepare: RunPreparationCallback,
) =>
  | { ok: true; runSequence: number; equipmentSnapshot: EquipmentIdSnapshot; runSnapshot: RunSnapshot }
  | { ok: false; reason: 'leaseNotAcquired' }
  | { ok: false; reason: 'runInProgress' }
  | { ok: false; reason: 'pendingApplicationExists' }
  | { ok: false; reason: string; missingRole: EquipmentRole }
  | { ok: false; reason: string }
  | { ok: false; reason: 'storageError' }
  | { ok: false; reason: 'corrupted' }
  | { ok: false; reason: 'snapshotCaptureFailed' }; // A3新設
```

```ts
// src/store/gameStore.ts が定義・export する純関数。引数以外を一切読まない
export type RunPreparationRunKind =
  // Q11-1(Q-R1): motorOnly腕へinitialOmegaを必須追加。初速は「走行開始時に確定する構成情報」
  // であり、P3-1-Q9によりRunSnapshotが唯一の出典でなければならない(REST_STATE固定では
  // 同一snapshotから初速を再現できず、リプレイ契約が第1stepから破れる)。
  // SimState全体ではなくomegaのみを持たせる——過渡状態(batteryHeat/theta/coilCollapsed等)を
  // 新runへ持ち込む第二の伝搬チャネルを作らないため(run間の恒久効果はapplyRunOutcome→
  // WearState/個体状態という単一経路に限る、P3-0以来の確立契約)。
  | { kind: 'motorOnly'; initialOmega: number }
  | { kind: 'testRun' }
  | { kind: 'trackRun'; track: TrackDefinition };
```

#### 6.5.4 実装pseudocode(A3、arbiter §1必須修正2点を反映)

```ts
// src/store/saveStore.ts
beginRunActionWithPreparation: (context, prepare) => {
  const gate = readGatedFreshState(set, get, false); // fresh読取りはこの1回のみ
  if (!gate.ok) {
    if (gate.error.kind === 'storageError') return { ok: false, reason: 'storageError' };
    if (gate.error.kind === 'corrupted') return { ok: false, reason: 'corrupted' };
    return { ok: false, reason: 'leaseNotAcquired' };
  }
  const fresh = gate.fresh;
  const candidate = pureBeginRun(fresh.equipmentLoadout, fresh.inventory, context, fresh.saveMeta, get().currentRunSequence, true);
  if (!candidate.ok) return candidate; // prepareは一度も呼ばれない(RunSnapshot不生成が構造的に保証される)

  // trusted narrowing(Q10-§2で案(i)承認): candidate.ok===trueは、同一のfresh読取り由来の
  // fresh.equipmentLoadoutに対してpureBeginRun内部のvalidateEquipmentLoadoutが成功したこと、
  // すなわちbatteryItemId!==nullをランタイムで保証する事実である(TypeScriptの制御フロー解析は
  // 関数呼び出し境界を越えないため型上は素通りできない)。検証ロジックの再実装ではない(S-1適合)。
  const narrowedLoadout = fresh.equipmentLoadout as EquipmentLoadout & { batteryItemId: string };

  const prepared = prepare(narrowedLoadout, fresh.inventory, candidate.equipmentSnapshot);
  if (!prepared.ok) {
    // generic腕ではmissingRoleプロパティ自体を返さない(undefinedを生成しない)
    if ('missingRole' in prepared) return { ok: false, reason: prepared.reason, missingRole: prepared.missingRole };
    return { ok: false, reason: prepared.reason };
  }

  // ここまで、いかなる分岐でもRunSnapshotは一度も構築されていない(UI契約(a)完全遵守)
  const nextState: PersistedSaveState = { ...fresh, saveMeta: candidate.nextSaveMeta };
  if (!writeOrFail(set, nextState)) return { ok: false, reason: 'storageError' }; // この分岐でもRunSnapshot未構築
  applyFreshStateToStore(set, nextState, {
    currentRunSequence: candidate.runSequence,
    pendingRunEquipmentSnapshot: candidate.equipmentSnapshot,
    pendingRunSaveId: fresh.saveMeta.saveId,
  });

  // A3必須修正1・2(arbiter裁定Q10 §1)
  try {
    const runSnapshot = captureRunSnapshot(prepared.snapshotInput);
    return { ok: true, runSequence: candidate.runSequence, equipmentSnapshot: candidate.equipmentSnapshot, runSnapshot };
  } catch {
    // 永続側(saveMeta.nextRunSequence)はcommit済みのままロールバックしない——孤立runSequenceを
    // 1件許容する(P3-0-Q1の高水位意味論が冪等skipとして吸収する)。しかしruntime専用フィールドを
    // 「run進行中」のまま残すと、pureBeginRunのrunInProgressガードによりリロードなしで再挑戦
    // できないソフトロックになるため、ここで明示的にnullへ戻す。
    set({ currentRunSequence: null, pendingRunEquipmentSnapshot: null, pendingRunSaveId: null });
    return { ok: false, reason: 'snapshotCaptureFailed' };
  }
},
```

```ts
// src/store/gameStore.ts
export function prepareDestructionRun(
  loadout: EquipmentLoadout & { batteryItemId: string },
  inventory: PlayerInventory,
  rawPlayerMotorConfig: MotorConfig,
  garageSelection: GarageSelection,
  equipmentSnapshot: EquipmentIdSnapshot,
  runKind: RunPreparationRunKind,
  seed: number,
): RunPreparationResult {
  // Q10-§5必須条件: runKindとequipmentSnapshot.contextは同じ事実を表す2つの独立入力であり、
  // 関数の型だけでは不整合な組合せを構築可能である(P3-1-Q6が排除対象とした「静かな不一致」構造)。
  // 本関数はexportされる公開純関数であり将来別の呼び出し元から呼ばれうるため、呼び出し元の規律に
  // 依存せず内部で明示的に検証しthrowする(無効入力に対するthrowは参照透過性を損なわない)。
  if ((runKind.kind === 'motorOnly') !== (equipmentSnapshot.context === 'motor')) {
    throw new Error('prepareDestructionRun: runKindとequipmentSnapshot.contextが不整合です');
  }

  const resolved = deriveMaterialSelectionFromEquipment(loadout, inventory);
  if (!resolved.ok) return { ok: false, reason: resolved.reason, missingRole: resolved.missingRole };

  const garageBuild = resolveGarageBuild(garageSelection); // exact 1回
  const baseline = resolveProductionMaterialCompositionBaseline(rawPlayerMotorConfig, garageBuild);
  const composed = composeConfigFromMaterials(rawPlayerMotorConfig, garageBuild.carConfig, baseline, resolved.selection);
  if (!composed.ok) return { ok: false, reason: composed.reason };                    // compose失敗経路
  // alice_mot3 設計回答v2で確定(§6.5.6)。src/materials/recipeKey.ts所有・export純関数。
  // 検証内容は「computeRecipeKeyが読む27エントリの有限性」+「effectiveTurnsRatioのbase契約
  // (undefined|1、arbiter補足裁定2026-08-18によりResult拒否で確定)」の2層。引数はComposeConfigResultではなく
  // motorConfig/carConfigの2引数(computeRecipeKey自身の引数形状と揃える、alice v2 §7)。
  const baseCheck = validateMaterialComposedBase(composed.motorConfig, composed.carConfig);
  if (!baseCheck.ok) return { ok: false, reason: baseCheck.reason };                  // 有限性/base契約失敗経路

  const recipeKey = computeRecipeKey(resolved.selection, composed.motorConfig, composed.carConfig);
  const destructionConfig = assembleDestructionConfig(resolved.selection, resolved.equipmentContext);
  const initialDestructionState = createInitialDestructionState(destructionConfig.battery.profile);
  const fireExposureProfile = deriveFireExposureProfileFromLoadout(equipmentSnapshot);

  if (runKind.kind === 'motorOnly') {
    return { ok: true, snapshotInput: {
      motorConfig: composed.motorConfig, carConfig: null, destructionConfig,
      runContext: { context: 'motor', fireExposureProfile, gearTotalToothCount: null },
      initialMotorState: REST_STATE, initialVehicleState: null,
      track: null, courseLengthM: null, slopeRad: null,
      seed, initialDestructionState, recipeKey,
    } };
  }

  // vehicle文脈: initialVehicleStateはcomposed値からexact1回導出し、initialMotorStateは
  // その内部から取り出す(独立入力にしない、RunSnapshot唯一出典原則P3-1-Q9の帰結)
  const initialVehicleState = createInitialVehicleState(composed.motorConfig, composed.carConfig);
  return { ok: true, snapshotInput: {
    motorConfig: composed.motorConfig, carConfig: composed.carConfig, destructionConfig,
    runContext: { context: 'vehicle', fireExposureProfile, gearTotalToothCount: GEAR_TOTAL_TOOTH_COUNT },
    initialMotorState: initialVehicleState.motor,
    initialVehicleState,
    track: runKind.kind === 'trackRun' ? runKind.track : null,
    courseLengthM: runKind.kind === 'testRun' ? TEST_RUN_COURSE_LENGTH_M : null,
    slopeRad: runKind.kind === 'testRun' ? 0 : null,
    seed, initialDestructionState, recipeKey,
  } };
}

// orchestrator action。get()は1回だけ呼び、config/garageSelectionを同一state実体から読む(C-4)。
// Q11-3修正(i)(Q-R2): seedは呼出し側が供給する(内部のcreateSessionSeed()は削除)。内部生成の
// ままだとflickStartのrecipeSeedによる再現実行——「固定初速で再現性を保つ」というプレイヤー
// 可視の既存機能——がtrue側で静かに死ぬ(snapshot.seedが常にランダム新規値になる)。
beginProductionRun: (runKind: RunPreparationRunKind, seed: number) => {
  const state = get();
  const rawPlayerMotorConfig = state.config;
  const garageSelection = state.garageSelection;
  const context: 'motor' | 'vehicle' = runKind.kind === 'motorOnly' ? 'motor' : 'vehicle';
  const prepare: RunPreparationCallback = (loadout, inventory, equipmentSnapshot) =>
    prepareDestructionRun(loadout, inventory, rawPlayerMotorConfig, garageSelection, equipmentSnapshot, runKind, seed);
  const result = useSaveStore.getState().beginRunActionWithPreparation(context, prepare);
  if (result.ok) set({ _runAccumulator: createRunAccumulator(result.runSnapshot) });
  // 失敗時は§6.4.1の表に従って分岐(snapshotCaptureFailedは契約(a′))
},
```

#### 6.5.7 begin成功後のlive runtime初期化規則(Q11-1・Q11-2・Q11-3、v14新設)

**live runtimeは、返された`runSnapshot`のdeep copyを唯一の出典として初期化する。raw configからの再生成・別seedの使用を禁止する**(Q-R4(a))。true側の各入口は次のとおり:

| 入口 | live初期化 |
|---|---|
| `flickStart`(motor-only) | `simState = structuredClone(runSnapshot.initialMotorState)`。**`{...s.simState, omega}`という前runの過渡状態を引き継ぐ初期化は廃止**(Q11-1)。`_rngState`は正典RNGを`runSnapshot.seed`で初期化した系列、`_sessionSeed = runSnapshot.seed` |
| `finishAssembly`(motor-only) | 同上。現行live初期化`{...REST_STATE, omega: clampedOmega}`は本裁定と同型であり、snapshot側がこれに一致する形になる |
| `startTestRun`(test-run) | `vehicleState = structuredClone(runSnapshot.initialVehicleState)`。**`createInitialVehicleState(s.config, s.carConfig)`によるraw由来の再生成はtrue側では削除**(Q11-2)。`_vehicleRngState`も`runSnapshot.seed`由来 |

**deep copyを必須とする理由**(Q11-2): live側の状態オブジェクトをsnapshotと参照共有すると、将来の実装変更でin-place変更が入った際に`accumulator.replaySnapshot`まで汚染される。現行engineは毎stepで新オブジェクトを返すため即座の実害はないが、この安全性を実装の偶然に依存させない。

**正典run RNG**(Q11-3修正(ii)、Q-R3): liveのrngはxorshift(`nextRandom`)だが、確定済みリプレイ等価テスト規約(P3-1-Q9付帯条件(i))は**mulberry32**である。同じseedでも系列が異なるため、seedの単一出典化だけでは「同一snapshotからの正直な再生」は成立しない。**正典run RNGをmulberry32と確定し、alice所有の単一export(例: `createRunRng(seed: number): () => number`、推奨配置は`src/engine/destructionOrchestration.ts`、最終配置はalice設計判断)として新設する。true側のlive stepはこれを`runSnapshot.seed`で初期化して用いる。false側(V2旧経路)は`nextRandom`のまま無改修。** brabit所有の`src/retro/audio/prng.ts`のmulberry32は**所有境界を越えて共有しない**(audio用途とrun物理用途は変更理由が異なる。意図的重複はこのプロジェクトの確立パターン)。

#### 6.5.8 `finishAssembly`の順序と失敗原子性(Q11-4、案A採用、v14新設)

**確定順序(案A)**: (1)前runのfinalize(現行どおり)→(2)omega clamp・seed生成→(3)**config永続commit**(progress gate、`recipeSeed`込み)→(4)**commit成功時のみ**`beginProductionRun`実行(この時点で`state.config`は新config)→(5)begin成功時のみlive runtimeを`runSnapshot`由来で初期化。

v13の実装(begin先行)は本裁定により**是正対象**である——snapshotが旧configで作られる欠陥、および「begin成功→config commit失敗で旧config snapshotのrunだけが進行中に残る」経路を持つ。案Aの順序ではこの経路自体が消滅する。

**失敗時の各状態**:

| 失敗地点 | 永続 | saveStore runtime | gameStore run runtime |
|---|---|---|---|
| (3) config commit失敗(`updateProgress===false`) | 不変 | 不変(runSequence未消費) | 不変。beginを呼ばない |
| (4) begin失敗(gate/resolver/compose/有限性/storageError/snapshotCaptureFailed) | **configは保存済みのまま保持** | A3/S-5の各裁定どおり(`snapshotCaptureFailed`のみ孤立runSequence1件+runtime3フィールドnullリセット、他は完全不変) | 不変(accumulator不生成、`simState`等不変) |
| (5) | — | — | 失敗しない(`set()`は失敗しない) |

**案Bの却下理由**(記録): `beginRunActionWithPreparation`の責務を「run開始」から「プレイヤー構成の永続化+run開始」へ拡張することになり、承認済み契約の大幅再openとcallback契約の複雑化を招く。得られる利益は「config保存済みだがrun未開始」という中間状態の排除だが、**この中間状態は欠陥ではない**——「組み立てを完了した」はrun開始と独立に成立するプレイヤーの耐久的決定であり、購入がrun開始と無関係に確定するのと同格である。

**S-5「gameStoreローカルruntime不変」の適用範囲(Q11-4で明文化、Q-R4(c))**: S-5が指すのは**run runtime**(`_runAccumulator`・`simState`/`vehicleState`・`_sessionSeed`/`_sessionStartedAt`/`_sessionConfig`/`_sessionSamples`・`_rngState`/`_vehicleRngState`・`testRunPhase`/`courseRunPhase`等)のみである。**プレイヤー確定構成(`config`/`carConfig`/`garageSelection`/`recipeSeed`)はS-5の対象外**であり、progress gate(`commitWithProgressGate`)の既存セマンティクス(先に永続化、成功時のみローカル反映)に従う。

#### 6.5.9 Q-R1・Q-R2の依存閉包(pitfalls#2、2026-08-18実測、v14新設)

破壊的変更2件について、単一tsconfigプロジェクト全体で当該型・actionを参照する全箇所を事前に`rg`で洗い出した(AGENTS.md/CLAUDE.md pitfalls#2)。

**Q-R1(`RunPreparationRunKind`のmotorOnly腕へ`initialOmega: number`必須追加)**

```
$ rg -ln "RunPreparationRunKind" src -g '*.ts' -g '*.tsx'
src/store/gameStore.ts
```
→ **型参照は1ファイル・3箇所のみ**(型定義1、`prepareDestructionRun`の引数型1、`beginProductionRun`の引数型1)。ただし**motorOnly腕のオブジェクトリテラル構築箇所**が機械的追従の実対象であり、こちらは3ファイルにまたがる:

```
$ rg -n "kind: 'motorOnly'" src -g '*.ts' -g '*.tsx'
```
| ファイル | 箇所数 | 内訳 |
|---|---|---|
| `src/store/gameStore.ts` | 3 | 型定義1(228行)+production呼出し2(`flickStart` 666行・`finishAssembly` 1012行) |
| `src/store/__tests__/gameStore.test.ts` | 13 | `prepareDestructionRun`直接呼出しのテスト引数 |
| `src/store/__tests__/destructionWiring.test.ts` | 1 | `beginProductionRun`呼出し(517行) |

→ **合計17箇所**。型を必須フィールド追加へ変更すると、テストを含むこれら全箇所が型エラーになり機械的追従が必要になる(意図した破壊的変更であり、`?`付きoptionalで逃がさない——Q11-1が`initialOmega`を必須としたのは初速の単一出典を型で強制するためである)。

**Q-R2(`beginProductionRun`のシグネチャを`(runKind, seed)`へ変更)**

```
$ rg -ln "beginProductionRun" src -g '*.ts' -g '*.tsx'
src/store/gameStore.ts
src/store/__tests__/destructionWiring.test.ts
src/store/__tests__/gameStore.test.ts
```
→ **3ファイル・15箇所**。内訳: `gameStore.ts`(型宣言1・実装1・呼出し3〈`flickStart`・`startTestRun`・`finishAssembly`〉)、`destructionWiring.test.ts`(直接呼出し+構造検査の対象文字列)、`gameStore.test.ts`(構造検査での本体抽出・`get()`回数テストの対象文字列)。

**engine・materials・componentsへの波及は0件**(`src/engine/`・`src/materials/`・`src/components/`・`src/render/`・`src/modes/`のいずれにも両識別子の出現なし)。`useGameStore`公開面を消費する既存25ファイルは、両変更が`GameStore`型への**追加および内部シグネチャ変更**であり既存フィールドの破壊を伴わないため無影響の見込み——実装着手時に`npm run build`で型検査を通し再確認する。

**Q-R3(正典run RNG新設、alice所有)の依存閉包**: 新規exportのため既存参照は0件。brabit側の追従は「true側liveのrng生成を`nextRandom`から正典RNGへ差し替える」`gameStore.ts`内の2箇所(`stepSim`・`stepTestRun`のrngクロージャ)およびseed初期化箇所に閉じる見込み。**`src/retro/audio/prng.ts`(brabit所有のmulberry32)は所有境界を越えて共有しない**(Q11-3)。

#### 6.5.5 テスト契約(G1b必須DoD、§23 DoD23〜26として追加)

- **構造検査(純関数性)**: `prepareDestructionRun`本体を、既存G1a′純関数性テスト(`src/store/__tests__/runOutcomeApplication.test.ts`の`extractNamedFunctionBody`+`FORBIDDEN_GLOBAL_PATTERNS`)と**同一パターン**で検査する。引数非破壊・同一入力同一出力(決定性)もあわせて固定する。
- **callback構築部の検査**: `beginProductionRun`本体が`prepareDestructionRun`以外のalice所有関数を直接呼ばないことの構造検査+`get()`呼出し回数がexact1であることの回数テスト(C-4同型)。
- **§6.5.4の負例(Q10-§5必須条件、`gameStore.test.ts`へ追加)**: `prepareDestructionRun`へ**実際に矛盾する引数**(例: `runKind={kind:'testRun'}`かつ`equipmentSnapshot.context==='motor'`、およびその逆の`runKind={kind:'motorOnly'}`かつ`context==='vehicle'`)を渡し、**throwすること**を確認する(構造検査ではなく実行時の負例)。
- **`snapshotCaptureFailed`の負例(A3必須修正の検証、`saveStore.test.ts`へ追加)**: `captureRunSnapshot`が例外を投げる状況をモックで再現し、(i) 戻り値が`{ok:false, reason:'snapshotCaptureFailed'}`であること、(ii) `currentRunSequence`・`pendingRunEquipmentSnapshot`・`pendingRunSaveId`がいずれも`null`へ戻っていること、(iii) その直後に再度`beginRunActionWithPreparation`を呼ぶと`runInProgress`で拒否されずに進行できること(ソフトロックが発生しないことの直接確認)、(iv) `saveMeta.nextRunSequence`はcommit済みのまま(ロールバックされていない)ことを固定する。
- **S-5の3失敗経路×4不変条件(Q9でG1bへ移管済み)**: resolver失敗・compose失敗・有限性検証失敗の3経路それぞれについて、`nextRunSequence`不変・`pendingRunEquipmentSnapshot`不変・`RunSnapshot`/`RunAccumulator`不生成・gameStoreローカルruntime state不変の4項目を直接assertする。**加えてgate失敗(lease/pending/runInProgress)・storage書込み失敗の各経路でも同4項目が成立することを確認する**(A3ではこれらもcommit前に閉じるため、契約(a)を満たす)。

#### 6.5.6 alice_mot3への依頼事項(arbiter §8ブロッキング指摘、実装着手前に解消必須)

Q10依頼書§2.3のpseudocodeが呼んでいた`isFiniteMaterialComposedBase(composed)`は、**リポジトリに実在しない**(`rg -n "isFiniteMaterialComposedBase" src` → 0件、独立実測済み)。「既存C-3同型」という表現は誤解を招くものだった——C-3はUI計画v12/engine計画v14が確立した**要件**(「`materialComposedBase`の有限性検証を`computeRecipeKey`呼出しより前に行う」)であって、**実装済みの既存関数ではない**。`composeConfigFromMaterials`は内部で`Number.isFinite`検証を行い`ok:false`で報告するが、これは`composed.ok`分岐で捕捉される別物であり、`composed.ok===true`の後になお`motorConfig`/`carConfig`の全数値フィールドがfiniteであることを検証する関数は存在しない。**この関数がなければG1bはコンパイルすら通らない。**

arbiterの裁定は「当該関数は`ComposeConfigResult.motorConfig`/`carConfig`というalice所有の型のみを扱うため`src/materials/materialMapping.ts`(alice所有)への配置が層の一貫性に合致する」というものだったが、**最終的な配置・命名・検証ロジックの粒度はalice_mot3の設計判断に委ねる**と明示された(arbiterは実在の要否と配置方針のみを裁定)。

**alice_mot3 設計回答v2による確定内容(2026-08-18、Suu_mot3全文中継。以下がbrabit側の追従先である)**:

| 項目 | 確定内容 |
|---|---|
| 公開関数名 | **`validateMaterialComposedBase`** |
| 配置 | **`src/materials/recipeKey.ts`**(alice所有)——arbiter推奨の`materialMapping.ts`ではない。理由: (i) 守る対象である事前条件(`computeRecipeKey`)と同一ファイル、(ii) 収集ロジックの単一出典を共有できる、(iii) `materialMapping.ts`配置は**値import**による循環を生む(現行は`recipeKey.ts`→`materialMapping.ts`の**型のみ**片方向) |
| exactシグネチャ | `validateMaterialComposedBase(motorConfig: MotorConfig, carConfig: CarConfig): { ok: true } \| { ok: false; reason: string }` |
| 引数形状 | `ComposeConfigResult`ではなく**motorConfig/carConfigの2引数**——`computeRecipeKey`自身の引数形状と揃い、compose以外の経路からも再利用でき、`materialMapping.ts`の型へ依存しないため |
| 検証対象(第1層) | **`computeRecipeKey`が読む27エントリの有限性**(`Number.isFinite`)。内訳は`MotorConfig` 17件+`CarConfig` 10件(`gearReflectedInertiaKgM2`を含む) |
| 検証対象(第2層) | `effectiveTurnsRatio`のbase契約(`undefined \| 1`)——違反時は**Resultとして`{ok:false, reason}`を返す(arbiter補足裁定2026-08-18で確定)**(下記) |
| 内部helper | `collectRecipeKeyNumericFields`(**非export**、モジュール内部)。`computeRecipeKey`と`validateMaterialComposedBase`が同一のcollectorを共有することで「検査した集合 ≠ throwする集合」というドリフトを**構築不能**にする(P3-1-Q6「fail-fastより構築不能」の適用) |
| `computeRecipeKey`への影響 | **公開シグネチャ・出力文字列は不変**(内部をcollector呼び出しへ置換する内部リファクタのみ) |
| 公開面の増分 | **`validateMaterialComposedBase` 1件のみ**(collectorは非exportのため増分に含まれない) |

**27エントリの十分性(alice v2 §2の依存閉包による証明)**: `MotorConfig`は宣言18フィールドのうち17件が27エントリに含まれ、含まれないのは**`effectiveTurnsRatio`ただ1つ**(P3-3-Q12によりbase configでは常に`undefined||1`のためキー識別に寄与しない)。`CarConfig`は宣言9フィールドの**すべて**が含まれ、加えて将来追加の`gearReflectedInertiaKgM2`も局所view型経由で先読み済み。差分が1フィールドのみであるため、「recipeKey事前条件検証」と「materialComposedBase全体検証」を2関数へ分離する必要はなく、単一validatorが両者を満たす。

**既存compose検証との境界(alice v2 §10)**: `composeConfigFromMaterials`が検証するのは**自身が計算する中間比率のみ**(wireResistivityRatio/wireDensityRatio/magnetStrength/gearRatio/gearEfficiency/batteryInternalResistanceRatio/batteryCapacityRatio/massDelta/massG)であり、**baseMotorConfig/baseCarConfigからスプレッドで引き継がれるフィールドは一切検証していない**。新validatorの真に新規な守備範囲は後者である。前者も検査対象に含めるが、これは組み立て**後**の最終オブジェクトに対する唯一の検査であり意図的(composeの検査は中間値に対するもので、その後`combineGearEfficiency`等の算術を経ている)。

**`effectiveTurnsRatio`拒否機構の確定(arbiter補足裁定2026-08-18、Suu_mot3全文中継)**: 論点は「alice v2推奨の候補1(validator内でResultとして拒否)と、既存`encodeRecipe`(`recipeCode.ts:308-319`、正式Fable P3-3-Q14裁定)が同じ問題をthrowで扱っていることの機構差(throw対Result)を許容してよいか」であった。**arbiterはResult拒否(候補1)を承認し確定した。** 判定理由: 両者は**呼び出し境界の性質が異なる**ため機構が異なって当然であり不整合ではない——`encodeRecipe`のthrowは**プレイヤー操作を経由しない開発者向けAPI誤用検出**(実行時の破壊状態合成値を誤ってレシピ符号化へ渡すのはコード側のバグであり、通常操作では到達しない経路)であるのに対し、`validateMaterialComposedBase`は**beginRun経路(G1b、プレイヤーがrun開始ボタンを押す操作起点)に直接位置する**ため、ここで例外を投げればarbiter自身がQ10 §1で候補Aの核心的欠陥として指摘した「未捕捉例外がbeginRun経路へ伝播する」問題をこの新しい検証自体が再導入することになり、A3裁定の趣旨に真っ向から反する。Result拒否は既存§6.4.1の「config構築失敗」generic行へそのまま合流でき、UIは再試行可能な形で扱える。候補2(throwで統一)・候補3(型レベル分離`Omit<MotorConfig,'effectiveTurnsRatio'>`、P3-3-Q14が「TypeScriptの過剰プロパティ検査はオブジェクトリテラルにのみ適用され変数経由の代入では働かない偽の安全」として却下済み)はいずれも不採用。

**確定した第2層契約**: `effectiveTurnsRatio`が`undefined`でも`1`でもない場合、`validateMaterialComposedBase`はResultとして`{ ok: false, reason: string }`を返す。判定式は`!== undefined && !== 1`で`encodeRecipe`(P3-3-Q14)と同一とする。

**所掌の明示分担(Suu_mot3指示により統一)**:
- **`src/materials/` = alice_mot3**: `recipeKey.ts`の`validateMaterialComposedBase`(export新設)・`collectRecipeKeyNumericFields`(非export新設)・`computeRecipeKey`の内部リファクタ、および`src/materials/__tests__/recipeKey.test.ts`のテスト。
- **`src/store/saveStore.ts`・`src/store/gameStore.ts` = brabit_mot3**: arbiter §1〜§6に対応する実装(A3一式)とテスト(`saveStore.test.ts`・`gameStore.test.ts`)。
- **`src/engine/` = alice_mot3**(Q-R3の正典run RNG `createRunRng`を`destructionOrchestration.ts`へ新設。engine計画v15 §20.10で確定)。**Q10時点の「変更0件」はQ11のQ-R3により撤回された**——ただしV2凍結面には触れず、Phase 3拡張ファイルへの追加に閉じる。
- したがって、v13の初版で「実装もbrabit_mot3の所掌でalice_mot3の関与は不要」と記した箇所は、**`src/materials/`側のalice担当分が確定した現在は不正確**であり、上記の分担が正となる(§改訂履歴Q7の該当文も同旨で読むこと)。

---

## 7. production先行配線フラグ(確定-8)

`GameStore`型へ`productionWiringEnabled: boolean`(既定`false`)を追加する。setterは標準Zustand API(`useGameStore.setState({productionWiringEnabled: true})`)のみ。既存25ファイルの`useGameStore`公開面は無変更(§20)。

**テスト環境でのreset**: 新設の専用テストファイル`src/store/__tests__/destructionWiring.test.ts`に、明示的な`beforeEach`/`afterEach`で`productionWiringEnabled: false`へresetする処理を置く。既存`gameStore.test.ts`(`beforeEach`なし)・`testRunStore.test.ts`(部分resetのみ)には混在させない。save/notebook singletonへの結果書き込みを伴う統合テストでは、既存の`saveStore.test.ts`/`testRunStore.test.ts`が使うfake storage/lease初期化パターンをそのまま再利用する。false/true経路の順序非依存性をDoDに含める(§23)。

**新旧wrapper移行/二重step防止**: `productionWiringEnabled`が`false`の間、gameStore.tsは既存の非destruction経路のみを実行する。`if (get().productionWiringEnabled) {...} else {...}`という排他分岐でwrapper呼び出しコードを実装し、二重step(新旧両方が同一frameで物理を進める)を分岐の排他構造で構造的に防止する。**motor-onlyのnotebook経路も同じ排他分岐で実装する(§6.2)**。

---

## 8. D01〜D07/D09の演出/SE契約

### 8.1 art-spec既定の確認+D07/D09視覚表現の非対称性(I6是正)

`docs/art-spec.md` §6の既存表:

| モード | 色遷移 | 寿命 | 挙動 | 出典 |
|---|---|---|---|---|
| D01(線材の暴れ) | M1 | 破壊中持続 | コイルから伸びる折れ線を毎フレーム乱数振動 | art-spec §6 |
| D02(煙、発煙段階) | 白N5→灰N3→黒N1 | 40〜90f | 上昇+横流れ、市松ディザで希薄化 | 同上 |
| D02/D04(炎、発火/炎上後) | Fランプパレットサイクル(4f周期) | 燃焼中持続 | 上方へ揺らぎ | 同上 |
| D05(火花) | Y1→M3→N3 | 8〜20f | 重力小、直線飛散、1〜2px | 同上 |
| D06(破片) | 素材色 | 30〜60f | 重力+バウンド1回 | 同上 |

D03の正式名称は**「電池破裂」**(性格は「瞬時・終端」)。「即時破裂」という表現は正式名称として使わない。

**D07・D09専用視覚表現(R18、本レビューで確定)**: art-spec §6に専用行が存在しない。**候補1に確定**: 既存の性能低下icon(art-spec §5.2、Y1色・4フレーム周期点滅)+モーター音ピッチ低下のみで表現し、専用パーティクルは追加しない——この候補はart-spec既存範囲内であり、改訂不要(I6是正・本レビューR18で再確認)。**候補2(D09専用白煙)は却下**——白煙はD02発煙(白→灰→黒)と視覚的に衝突し、「煙=コイル/電池系」という診断語彙を汚染する(誤診断を誘発する演出はspec §1.2に反する、本レビューR18の裁定理由)。Phase 6の磨き込みで人間美術レビューにより再訪してよい(本レビューREC-4、申し送り)。

### 8.2 全モード一括接続の再定義

「全8モード一括接続」はプレイヤーに見える公開切替が一括であることを意味する。`productionWiringEnabled`(§7)がこの機構そのものである——UI側で別途feature gateを二重に持たない。event adapter→HUD→particle→audio→画面遷移の5層は独立にレビュー可能な内部ゲート(§17)へ分割してよいが、公開(フラグtrue化)はG統合の単一commitでのみ行う。

### 8.3 SE割り当て(初期候補値表、J3是正でモード横断のSEバス正規化契約を確定)

`docs/art-spec.md` §8「D01〜D09それぞれに固有SEを割り当てる」。既存の音合成基盤(`InstrumentParams`型・`motorSound.ts`の連続音modulationパターン)を再利用する。継続音(D01/D07/D09)と有限尺イベント音を区別する(J4是正、各モードの正式名称で列挙)——有限尺イベント音の対象: D02発煙、**D03電池破裂**(v6までの「D03発火時」「D03電池破裂発火」という誤記を訂正)、D04発火(炎上遷移の瞬間)、D05火花、D06歯欠け。

**D01固有SEの新規追加(C-1、確定)**: art-spec §8「D01〜D09それぞれに固有SEを割り当てる」に対し、v9までのSE表はD01固有SEを欠いていた(D07は下記の免除根拠を持つが、D01にはない——線材の暴れは可聴現象そのものであり、art-spec §6にD01パーティクル行も存在する)。**継続系(loop)SE候補**を新設する: waveform noise、決定論的な音量変調(`elapsedTimeS`〈`RunSnapshot`起点からの経過秒数〉を入力とするsin波ベースの周期変調をgainへ適用し、rngを一切使わない——下記の**却下された**D01/D07 pitch jitter式〈候補2〉とは別物であり、モーターのpitchではなくD01専用SE自身のgainのみを揺らす)、基準gain候補0.2(SEバス全体正規化`normalizeActiveVoiceGains`の対象に含める)。具体的な周波数特性・変調係数はG7実装時にSE波形候補として提示し、他のSE候補値と同じくG7/G8の人間の耳で最終較正する(§19の分類表どおり、追加すること自体は確定・数値は初期候補)。

**D01/D07の二重表現懸念(R19、確定)**: production配線後、`composeEffectiveMotorConfig`(alice所有)が実効`MotorConfig`を書き換え、`computeMotorPlaybackRate(rpm, baseRpm)`はこの実効configから導かれる`rpm`を入力に取るため、劣化の効果は既に既存のRPM連動モーター音へ自動的に反映されている。追加のpitch変調はこれと二重表現になる——**候補1(追加変調なし、既存RPM連動モーター音のみ)に確定**。劣化は実効configを経て既にRPM連動音に現れており(P3-2 Q2実測: ダレでRPM12.75%低下=音で可聴)、人工jitterの重畳は物理由来の音という診断情報の正直さを損なうため、候補2(決定論的jitter式)は採用しない。

**D03電池破裂の全mute禁止**: D03電池破裂時、他モードの現象自体を隠さないよう他SEを全ミュートしない。音量を一時的に下げる(ducking)、または優先度の高いD03を前面に出しつつ他は継続する(priority mixing)のいずれかとし、イベント発火自体は正常に処理する。

**D06のqueue/coalescing(R26・C-6、ハイブリッド方式に確定)**: D06は反復イベントであり短時間に複数回発生しうる。同時再生を1本に制限する場合、後続イベントを無音のまま破棄すると症状の欠落になる。**queue方式(既定候補)を条件付き承認**——ただし無制限queueは終端後も鳴り続ける時間的不正直を生むため、**深さ上限(初期候補3)+超過分coalesceのハイブリッド方式**に確定した。上限値そのものはG7で耳較正する候補値であり確定しない。

**D09スイープの未承認API変更(R20、確定)**: D09の焼付き瞬間を周波数スイープで表現する案は、現行`InstrumentParams.frequencyHz`が単一の固定値であるため実現不能。API変更(`renderInstrumentSample`拡張、または複数サンプル連続再生)が必要——**候補1(固定周波数2音の急速切替、API変更なし)に確定**。周波数sweep(候補2、API拡張)はP3-4スコープ外として不採用。

**却下された候補(R19、参考・不採用)**: v8までは`playbackRateMultiplier = 1 + (D01_JITTER_AMPLITUDE * sin(2 * PI * D01_JITTER_FREQUENCY_HZ * elapsedTimeS))`(D01_JITTER_AMPLITUDE候補0.1・D01_JITTER_FREQUENCY_HZ候補7Hz)およびD07の`1 - (magnetHeatGaugeRatio * D07_PITCH_DROOP_MAX)`(D07_PITCH_DROOP_MAX候補0.3)という決定論的pitch変調式を候補として提示していたが、上記「D01/D07の二重表現懸念」のとおり**候補1(追加変調なし)が確定したため、この2式はいずれも不採用**。式自体は将来Fable/人間が再訪する場合の参考として本節に記録のみ残す(削除しない)。

**gain上限・clipping負例テスト(J3是正、正規化の対象をモード内からモード横断の全active voice集合へ拡張。R21で予算新設+正規化方式を承認)**: 既存`BGM_MASTER_GAIN`(0.93)+`MOTOR_MASTER_GAIN`(0.07)=1.0の予算に対し、SE用の第三チャンネル予算`SE_MASTER_GAIN`を新設し`BGM_MASTER_GAIN + MOTOR_MASTER_GAIN + SE_MASTER_GAIN <= 1.0`を維持する(初期候補: 既存2チャンネルを`0.85`/`0.05`へ再配分し`SE_MASTER_GAIN=0.10`——モード横断単一SEバス正規化の方式ごと承認済み、`mixLevels.ts`既存定数の変更を伴うため人間再承認対象M、最終値はG7/G8の人間の耳で確定)。**v7の誤り**: 「D05の同時最大3」というモード内だけの正規化では、D01/D07/D09の継続(loop)音と、D02/D03/D04/D05/D06のイベント音が**モードを横断して同時に鳴る**状況(例: D02発煙が継続中にD05スパークが発生、さらにD09の継続音も鳴っている)をカバーできず、この場合`SE_MASTER_GAIN`予算を超過しうる。**是正**: 単一のSE bus(全D0x横断で共有する1つのゲイン管理単位)を設け、**その時点で実際に再生中の全active voice(継続loop音+発音中のイベント音、全モード横断)の基準gain候補の合計**を都度計算し、その合計が`SE_MASTER_GAIN`を超える場合にのみ、全voiceへ一律の縮小係数(`SE_MASTER_GAIN / 合計`)を掛けて実効gainへ正規化する(超えない場合は基準gain候補をそのまま使う、常時縮小しない):
```ts
// 候補、SEバス全体の正規化関数(brabit所有、音声再生コード内)
function normalizeActiveVoiceGains(activeVoices: readonly { baseGain: number }[]): readonly number[] {
  const total = activeVoices.reduce((sum, v) => sum + v.baseGain, 0);
  const scale = total > SE_MASTER_GAIN ? SE_MASTER_GAIN / total : 1;
  return activeVoices.map((v) => v.baseGain * scale);
}
```
**duckingとの関係**: D02/D04燃焼中duckingや**D03電池破裂時**(K3是正、「D03発火時」を訂正)のduckingは、この正規化とは別レイヤーとして扱う——ducking対象の音は正規化計算に加わる前に既にbaseGainを下げた状態で`activeVoices`へ渡す(2つのレイヤーの適用順序: 個別ducking→全体正規化)。**clipping負例テスト**: モード横断で理論上同時発音しうる最大構成(継続音2種〈D01/D07またはD09のうち採用されたもの〉+D05最大同時3+他の有限尺イベント1つ、といった現実的な最悪ケースの組み合わせをsweepまたは組み合わせ列挙で洗い出す)について、正規化後の実効gain合計がBGM+motor音+SE全チャンネルで`1.0`を超えないことを数値アサートする。

| モード | 種別 | waveform | frequencyHz(候補) | durationSec | ADSR(候補) | gain(候補、正規化前の基準値) | 同時発生規則 |
|---|---|---|---|---|---|---|---|
| D01(線材の暴れ) | **継続(loop)、C-1で新規追加確定** | noise | — | 1.0(loop素材) | attack 0/decay 0/sustain 1/release 0 | 0.2(候補、決定論的sin変調込み) | 常時1本(走行中持続、他D0xとは独立) |
| D02(発煙) | 有限尺 | noise | — | 0.5 | attack 0.01/decay 0.2/sustain 0.3/release 0.29 | 0.5 | 最大同時1、smokingStarted latchごとに1回 |
| D02/D04(炎) | 継続(loop) | noise | — | 1.2(loop素材) | attack 0/decay 0/sustain 1/release 0 | 0.3 | 燃焼中は他SEとduck |
| D03(電池破裂) | 有限尺 | square | 1500(候補) | 0.15 | attack 0.001/decay 0.1/sustain 0/release 0.049 | 0.8 | 最大同時1、他SEをduck(全mute禁止) |
| D05(火花) | 有限尺 | square | 2500(候補) | 0.15 | attack 0.001/decay 0.05/sustain 0.2/release 0.099 | 0.4(基準値、SEバス全体で正規化) | episodeごとに1回、最大同時3 |
| D06(歯欠け) | 有限尺 | noise | — | 0.5 | attack 0.001/decay 0.15/sustain 0.1/release 0.349 | 0.6 | **queue方式、深さ上限3+超過coalesce(R26確定)** |
| D07(熱ダレ/減磁) | **専用SEなし、確定(R19: 既存RPM連動モーター音のみ)** | — | — | — | — | — | — |
| D09(摩擦増/焼付き) | 継続+焼付き瞬間(有限尺) | 継続部noise、焼付き瞬間は**固定周波数2音の急速切替(R20確定、API変更不要)** | 継続部固定、焼付き瞬間は2音固定値(候補) | 焼付き瞬間0.3(候補) | 焼付き瞬間: attack 0.01/decay 0.2/sustain 0/release 0.09 | 継続部0.2・焼付き瞬間0.7 | 焼付き瞬間は他SEをduck |

D01/D07への追加pitch変調(モーター音自体の周波数を揺らすもの)は候補1(追加変調なし)に確定しており、上表のD01行(専用SEの新規追加)とは別の決定であることに注意する(上記「D01/D07の二重表現懸念」参照)。上記の波形/周波数/ADSR/gainはすべて候補値であり、較正値ディシプリンを経るまで確定しない(§16)——**確定しているのは「どのモードにSEを割り当てるか」「queue/coalescing方式」「SE_MASTER_GAIN予算の新設と正規化方式」の3点(R19・R20・R21・R26・C-1)であり、個々の数値ではない**。

### 8.4 12fps格子の適用範囲

`docs/art-spec.md` §7原文「ロジックは60fps、スプライトアニメは12fps格子(5フレーム毎)に載せる」。適用対象はスプライトのセル(絵柄)切替のみ。パーティクルの位置・速度更新、D04 stage表示の切替自体、engineの物理ロジック自体には拡張しない。

---

## 9. pending/lease UI(3区分)

| 状態 | 検知条件 | 表示 | 自動再判定 | 許可される操作 | ブロックされる操作 |
|---|---|---|---|---|---|
| 正常 | `SaveGateMode==='normal'` | 通常画面 | 不要 | 全操作 | なし |
| `leaseNotAcquired`待機 | `SaveGateMode==='waiting'` | 「前回セッションの終了確認中です」(role=status) | 自動、他タブheartbeat失効で復帰 | 閲覧+独立設定のみ | 新規走行開始+閲覧を除く全store書き込み操作 |
| 整合性エラー | `SaveGateMode==='pending'` | 「前回の走行結果を保存できませんでした」+要約(§3.3-D) | しない | 再試行・明示的放棄・閲覧 | 新規走行開始+閲覧を除く全store書き込み操作 |

`staleLease`はこの3状態のいずれにも新しい行として追加しない(§2)。**J1是正**: v7まで本節に残っていた「整合性エラー状態内で再試行操作が`staleLease`を返した場合、文言をそのまま表示する」という記述は削除する——§2で確認したとおり、production action経路(`performApplyRunOutcome`・`retryPendingApplicationAction`)は内部ゲート`readFreshForApply`によりlease不一致を`leaseNotAcquired`(waiting)へ変換するため、整合性エラー画面へ`staleLease`が到達するE2E経路は現状存在しない。本書は`staleLease`について具体的な画面表示契約を一切設計せず、既存`applyOutcomeErrorReasonJa('staleLease')`の単体テスト(純粋な文言関数としての正しさ)のみを維持する。

新規UIコンポーネントの追加は既存のSaveGate/PendingScreen相当のもので足りると見込むが、P3-4での作業は「配線確認」に留まらず、上表の3状態それぞれについて、実際のマルチタブ操作+単体テスト(状態遷移の網羅)の両方で検証する(§16)。

---

## 10. D04途中段階の記録+走行外膨張非表示

正式UI v5の既存契約(§3.2「電池膨張の非恒久表示」)は変更しない。

### 10.1 型設計への追従

`ExperimentSession`・`VehicleTestRunNotebookRecord`・`CourseRunNotebookRecord`3腕へ`finalDestructionState: DestructionState`+`recipeKey: string`を同時に必須フィールドとして追加する。過去のlegacy record(P3-4以前)は、`Omit<T,'finalDestructionState'|'recipeKey'> & {finalDestructionState?: never; recipeKey?: never}`という`LegacyXxx`型で、両フィールドとも存在しないことを型レベルで強制する。`StoredXxx = Xxx | LegacyXxx`のunion型を、読み取り(永続化された履歴)側でのみ受理する。

### 10.2 writer(確定-5、alice提供の3専用builder)

`buildVehicleTestRunNotebookRecord(recordWithoutFinalState: LegacyVehicleTestRunNotebookRecord, runOutcome: RunOutcome): VehicleTestRunNotebookRecord`(他2腕も同型)。brabit側(`saveStore.ts`のaction本体)はこの3関数をそれぞれの腕で呼び出し、戻り値をそのまま使う。UI側が独自に値を組み立てたり、引数として渡したりする経路は存在しない。

### 10.3 validator

`validateDestructionStateShape`(既存、`export`化予定)をaliceが公開する。共通判別関数`validateNotebookFinalFields(raw)`(`src/store/notebookValidation.ts`新設、alice所有)が`{ok:true,kind:'legacy'}`/`{ok:true,kind:'current',...}`/`{ok:false,reason}`を返す。呼出し側の文脈ごとに受理可否を分ける: (a) 永続化済みnotebook履歴・save restore・JSON importはlegacy/current両方を受理、(b) `PendingNotebookRecord`専用のvalidatorは**legacyを明示的に拒否**する。`recipeKey`の空文字列・envelope形式(`/^v[1-9][0-9]*\|/`)検証もこの共通関数が行う。

### 10.4 実験ノート詳細画面での表示

`finalDestructionState.battery`(D04Progress)の`stage`表示は「当該セッションの記録」内に限定し、電池個体自体のプロパティとしては表示しない。legacy record(`finalDestructionState`が`undefined`)の場合、UI側は「記録なし(旧バージョンの走行)」等の中立表示に留め、「膨張なし」と積極的に断定しない。

### 10.5 collapsed rotor拒否のUI表示経路

`ValidateEquipmentLoadoutResult`の`destroyedRole`分岐を受け取った際、`reason`(alice側が既に日本語文言として構築済み)をそのまま表示する経路を実装する。

### 10.6 `courseRuns`/`vehicleTestRuns`のexport/import

`courseRuns`/`vehicleTestRuns`のJSON export/importは現状production機能として存在しない(既存`parseNotebookJson`/`stringifyNotebook`は`ExperimentSession[]`のみを対象とする)。この2腕へexport/import機能を新設するかどうか自体がFable確認事項である(§22)。新設が承認された場合、そのversion/envelope/legacy-current分岐の契約はalice側が自己完結に定義し契約変更として申告する——本書はこの契約を先取りして定義しない。新設が承認されない場合、UI側は各腕の既存/確定validator(§10.3)に従う通常の永続化読み書きのみを実装し、export/import導線は`ExperimentSession`腕のみに限定する。

---

## 11. 三段開示・図鑑・検死・計測器

### 11.1 段階1: 走行中の症状

性能低下icon(下矢印、art-spec §5.2のY1・4フレーム周期点滅)+モーター音ピッチ低下+最高速頭打ち。

### 11.2 段階2: 走行後の自動差分検知

`regressionDiff.ts`を統合する。`recipeKey`は§1確定-7・§6.2の8段順のとおり、beginRunAction内でbrabitが1回だけ`computeRecipeKey(selection, materialComposedBase.motorConfig, materialComposedBase.carConfig)`を呼ぶ(実装はalice所有、呼び出し配線はbrabit所有)。その後は再呼出ししない——`RegressionObservation.recipeKey`は、`performApplyRunOutcome`成功後にnotebook recordへ書き込まれた`record.recipeKey`をそのまま読む。`pastObservations`は`notebookStore`の過去記録から同一`recipeKey`のものを抽出する——legacy record(`recipeKey`を持たない)は構造的にbaseline候補から除外される。`detectPerformanceRegression`の戻り値`hasAnomaly===true`の場合、「同一構成で記録が○%低下」という事実のみを表示する。

**G6実装済み範囲(arbiter追加裁定〈候補A: 純データ配管〉+人間承認2026-08-20)**: `src/store/regressionObservation.ts`(module-level純関数4件)+同単体テスト16件。観測変換・legacy除外・同一`recipeKey` baseline抽出まで。**腕ごとのmetricKindは次で確定**——`session`(motor-only)=`steadyRpm`(**全件**、完走の概念がないため状態で絞らない)/`courseRun`=`lapTimeS`(`elapsedTimeS`、**`status==='finished'`のみ**)/`vehicleTestRun`=`topSpeedMps`(samplesの`velocityMps`最大値、**`finished`かつsamples非空のみ**)。完走していない走行を含めると「タイム低下」ではなく「そもそも完走していない」データがbaselineへ混ざるため、course/test-runは完走に限定する。

**G7繰越**: `detectPerformanceRegression`の実呼出し・結果保持(runtime state)・表示/HUD。

**G7への申し送り(重要)**: `collectBaselineObservations`の当該run除外は**参照同一性**による——**値が等しい別実体は落ちない**。したがって「保存済み記録を全件`observe*`で変換してから比較する」実装にすると、当該runの記録も変換対象に含まれ、変換のたびに新しいオブジェクトが生成されるため除外されず、**自分自身がbaselineの中央値計算へ混入して本来検出すべき悪化を見逃す**。**G7では変換前にrecord idで当該runを除外すること**。値ベース除外(recipeKey+metricKind+value一致)は、たまたま同値だった正当な過去走行まで落とすため採らない。`RegressionObservation`へのrecord id追加は新規契約フィールドであり、必要が生じた場合のみG7で別途裁定を仰ぐ。この限界は`regressionObservation.test.ts`の2件で明示的に固定済み。

### 11.3 段階3: 原因の確定(計測器、**J2・J7是正、所持状態の永続化・測定式を確定**)

> **実装時期の確定(arbiter追加裁定+人間承認2026-08-20)**: 本節の実装は**G7**である。G6行(§17)は当初「計測器所持状態」をG6に含めていたが、人間再承認バンドル**J**(`PersistedSaveState`への`InstrumentOwnership`追加+`SCHEMA_VERSION` 1→2+migration手順+失敗分類)・**K**(`CodexRecordEntry`拡張)の実装時期がG7であり、かつ**J・Kは同一`SCHEMA_VERSION` 1→2 migrationへ同梱**すると定められているため、G6で先行実装するとversionを二度上げることになる。J/K/L自体は2026-08-15の「A〜O、15件を再承認します。」に含まれ**承認済み**であり、繰越は承認状態の問題ではなく実装時期の整合による。**G6では本節に一切着手していない**(`SCHEMA_VERSION`は1のまま、`InstrumentOwnership`・`CodexRecordEntry`の追加は0件)。

`docs/spec.md` §10「計測器店: ガウスメーター(磁束、定格比%表示——Phase 3で接続)。買い切り・非消耗」。P3-4でガウスメーター(D07)を店売り接続する。既存の`shopEconomy.ts`/`ShopScreen.tsx`/`InventoryScreen.tsx`パターンを再利用する(現状ガウスメーター関連の識別子は0件、新規追加)。

**価格(R23、確定)**: **800円固定**(仮値ラベル必須、Phase 5で経済sweep較正)。磁石ティア連動案(旧対立候補(b))は**却下**——価格自体がprovisionalな量に連動させると較正の従属変数が増えるだけで、診断機器の「買い切りの寛容さ」という定価性格にも合わないため(本レビューR23の裁定理由)。契約変更/人間再承認: 経済数値の新規追加のため要(§8-L)。

**解禁条件(R23、確定)**: **D07初回発見後**。未解禁時はspec §10の非接触温度計と同型の「取扱予定」シルエット掲載とする——発見→定量確認という三段開示の順序に合致し、図鑑登録は計測器なしで自動成立するため診断ループを阻害しない(本レビューR23の裁定理由)。無条件解禁案(旧対立候補(b))は不採用。

**所持状態の永続化(J2是正、実装時判断を排除)**: `writeV16`(`src/store/saveStore.ts`)は`JSON.stringify({state, version})`で永続化するため`Set`は要素を失う——`readonly InstrumentId[]`(既存`discoveredModes`と同型)へ設計する方針自体はv7のまま維持する。**しかし実測の結果、これだけでは既存v16データを救済できないことが判明した**: `readLatestV16`(`saveStore.ts:831-842`)は`parsed.wrapper.version !== SCHEMA_VERSION`(現行`SCHEMA_VERSION=1`)を検出した時点で即座に`{kind:'corrupted'}`を返す——version不一致に対する段階的なmigrationの仕組みはこの関数内には存在しない。さらに`isValidPersistedSaveState`(`saveStore.ts:771-`)は`encyclopedia.discoveredModes`等の既存フィールドすべてに対し`Array.isArray(...)`のような**all-or-nothingの必須検証**を行っており(実測、798行等)、値が欠落している場合にデフォルト値へ補完する分岐は一切持たない——つまり新規フィールドを同じ`isValidPersistedSaveState`へ無条件に追加すると、P3-4以前のセーブデータ(当該フィールドを持たない)はすべて検証に失敗し`corrupted`として扱われてしまう。したがって「restore時に`[]`補完」という単純な設計は成立しない。**次のとおり複数案を自己完結に定義していたが、本レビューR23がいずれも(a)〜(e)の推奨案どおり承認した(**§8-Jは2026-08-15の「A〜O、15件を再承認します。」に含まれ承認済み**。実装時期は**G7**であり、§8-K〈`CodexRecordEntry`拡張〉と**同一`SCHEMA_VERSION` 1→2 migrationへ同梱**する。2026-08-20訂正)**:

- **(a) 配置(承認)**: `InstrumentOwnership { ownedInstrumentIds: readonly InstrumentId[] }`を`PersistedSaveState`の`encyclopedia`と**同格のトップレベルフィールド**として追加する(確定)。理由: 「計測器の所持状態」は図鑑(`encyclopedia`、破壊モードの発見状態)とは概念的に独立した経済領域(店で買う道具)であり、`shopEconomy`寄りの性質を持つ——`encyclopedia`配下への同居は概念の混在を招く。対立案(`encyclopedia`配下へ追加)は却下。
- **(b) wrapper/state versionとSAVE_KEYの扱い(承認)**: **`SCHEMA_VERSION`を`1`→`2`へ引き上げ、`SAVE_KEY`(`'v16:save'`)は変更しない**(確定——`SAVE_KEY`のバージョン番号は大規模な永続化形式の変更〈v15→v16のような〉を表す接頭辞であり、フィールド1件の追加はその粒度に当たらない。既存の`SCHEMA_VERSION`という内部payload versionフィールドこそがこの粒度の変更を表現するために存在する)。`readLatestV16`は現行`SCHEMA_VERSION`(2)と一致する場合はそのまま読み、`1`の場合は次の(c)のmigration手順を経由してから読む——という2分岐へ拡張する。対立案(`SAVE_KEY`ごと新設)は不採用。
- **(c) migrate→新validator→writeの一方向手順(承認)**: `readLatestV16`内で`parsed.wrapper.version===1`を検出した場合、(i) 現行(v1)の`isValidPersistedSaveState`(`ownedInstrumentIds`を要求しない、旧版のまま維持する関数、仮称`isValidPersistedSaveStateV1`)でまず検証する、(ii) 検証成功なら`ownedInstrumentIds: []`を補って新形状(v2)のオブジェクトを構築する、(iii) 新版の`isValidPersistedSaveState`(`ownedInstrumentIds`必須)で再検証する(構築ロジック自体の誤りを防ぐ二重チェック)、(iv) 検証成功した新形状を`writeV16`(`SCHEMA_VERSION:2`)で書き戻す、(v) 以降は通常どおりこの新形状を返す。この手順は起動時に一度だけ実行し、既存の`migrateNotebookFromV15`(v15→v16 migrationの実装済み前例)と同型のパターンを踏襲する——新しい移行専用ファイルを作らず、`saveStore.ts`内に追加する。
- **(d) migration失敗/storage error/corruptionの区別(K1是正、承認)**: (i)の旧validatorが失敗した場合(=v1データ自体が壊れている)は、既存どおり`{kind:'corrupted'}`を返す(migrationのせいで新たに壊れて見えるようにしない、元々壊れていたケースと同一に扱う)。(iii)の新validatorが失敗した場合(=migration手順自体のロジックバグ、本来到達しないはずの防御的分岐)も同様に`{kind:'corrupted'}`とする。**(iv)の`writeV16`書き戻し自体がI/O失敗した場合は`{kind:'storageError'}`とする**——v7までの「`storageError`は`readRaw`のI/O例外由来のみに限定する」という記述は誤りであり撤回する。既存`computeBootstrapResult`(`saveStore.ts:882-884`)を実測した結果、v15→v16 migrationの最終書き戻しでも`const writeResult = writeV16(fresh); if (writeResult === 'ioError') return { kind: 'storageError' };`という同型の分類を既に行っている——本migrationもこの既存precedentへ揃える。**メモリ上だけでmigration成功として処理を続行しない**(書き戻しが失敗した場合、次回起動時に再度v1形式のまま読まれ、再度migrationが試行される、という冪等な設計とする——書き戻し前の状態を「成功した」ものとして扱わない)。
- **(e) pitfalls#2依存閉包(実測)**: `rg -ln "PersistedSaveState\b|isValidPersistedSaveState\b|SCHEMA_VERSION\b" src -g '*.ts' -g '*.tsx'`の実行結果は`src/store/saveStore.ts`・`src/store/__tests__/saveStore.test.ts`の2ファイルのみ(2026-08-13実測)。`SCHEMA_VERSION`のインクリメント+migration手順の追加は、この2ファイルに閉じる見込み——実装着手前に再実測する。

上記(a)〜(e)はいずれも本レビューR23で承認済み(readLatestV16・computeBootstrapResultの実装実測と完全に整合することが確認されている)。人間再承認(§8-J)のみ未了。

**測定純関数(J7是正、根拠のない条件を削除)**: `WearState`の`kind:'magnet'`variant(`src/materials/inventoryItem.ts:39`)を実測した結果、`demagnetizationFraction: number`は**必須フィールド**であり、対応するvalidator(`src/store/saveStore.ts:355`、`isValidFraction(c.demagnetizationFraction)`)も値の存在・値域を必須検証している——「legacy欠落」という状態はこの型・validatorのいずれにも存在せず、根拠がないため削除する。**測定不能条件は「対象個体が未装備」の1つのみ**に限定する:
```ts
export type GaussMeterReadingResult = { ok: true; displayPercent: number } | { ok: false; reason: 'notEquipped' };
export function computeGaussMeterReading(wear: { readonly kind: 'magnet'; readonly demagnetizationFraction: number } | null): GaussMeterReadingResult {
  if (wear === null) return { ok: false, reason: 'notEquipped' };
  return { ok: true, displayPercent: Math.round((1 - wear.demagnetizationFraction) * 100) };
}
```
表示単位はspec §10原文どおり「定格比(%)表示」に固定。**式の簡略化**: 「劣化後の実効磁力(`baseStrength*(1-demagnetizationFraction)`)÷`baseStrength`(素材カタログ値、劣化前基準)」という定格比の定義上、分子・分母の`baseStrength`は代数的に約分され、**実際の計算は`(1 - demagnetizationFraction) * 100`のみで完結し、`baseStrength`自体は引数として不要**——v7までの候補シグネチャが`baseStrength`を引数に含めていたのは誤りであり削除する。丸めは整数%へ四捨五入(R23で承認——較正値ではなく表示仕様として確定)。**関数の所有・入力の単一出典(R23、確定)**: この関数は素材の物性値ではなくWearStateの単純な算術変換のみを行うため、**brabit所有**(UI表示専用の純関数)に確定した——`demagnetizationFraction`自体の単一出典(alice所有のWearState管理)を変更するものではない。「約分の代数は検算済み: 定格比=(base×(1−d))/base=1−d」であることを本レビューが独立に確認済み。

原因の自動断定禁止・購入/使用のlease/pending gate遵守は必須。**alice側較正値との合本提出(実施済み)**: ガウスメーター等UI較正値(価格・解禁条件・上記(a)〜(e)のschema/migration設計・測定式の丸め仕様)は、alice側の数値候補一覧(engine計画§17.3)と同一のクロスレイヤ統合レビューへ合本提出され、本レビュー(R23、§9(7))が「承認、SEはG7実装+G8人間の耳で最終確定、経済値は仮値ラベル維持でPhase 5較正」として一括回答した。

図鑑(失敗図鑑)は`gameStore.ts`の`mode`ユニオンへ`'encyclopedia'`を追加する既存方針をP3-4で実施する(§3.1)。検死レポート画面のレイアウトは§3.2をそのまま使う。

---

## 12. 全endReason 1回適用の検証観点

### 12.1 全endReasonの表

| endReason | RunOutcome生成の契機 | 呼出側の責務 | 画面分岐 |
|---|---|---|---|
| `destructionTerminal` | wrapper(`stepXxxWithDestruction`)の`termination`が非null | `termination`をそのまま`performApplyRunOutcome`へ渡す | 停止画面(§3.3-B) |
| `finished` | wrapperの`termination`はnullのまま。呼出側が`physicsState.status==='finished'`を検知し`finalizeRun(accumulator, {kind:'physicsEnded', physicsEndStatus:{status:'finished'}})`を呼ぶ | 物理ループを停止し、生成した`RunOutcome`を`performApplyRunOutcome`へ渡す | 通常リザルト(§3.3-C) |
| `stalled` | 同上、`physicsState.status==='stalled'`(`failureCode`任意) | 同上 | 同上 |
| `energyExhausted` | 同上、`physicsState.status==='stalled' && failureCode==='energyExhausted'` | 同上 | 同上 |
| `derailed` | 同上、`physicsState.status==='derailed'`(track-run限定) | 同上 | 同上 |
| `overheated` | 同上、`physicsState.status==='overheated'`。D04のoverheated保留規則(`normalizeOverheatedStatusForD04Hold`)によりlipo電池でD04がswelling/smoking中は生の`overheated`が保留される | 同上 | 同上 |
| `manualAbort` | プレイヤーの中断操作。wrapperの`termination`が依然nullであることを確認した上で、呼出側が`finalizeRun(accumulator, {kind:'manualAbort'})`を明示的に呼ぶ | 同上 | 同上 |

motor-only文脈では`finished`/`derailed`/`energyExhausted`に相当する概念がない(周回・コースの概念がないため)。motor-only固有の終了は§6.2で確認した4入口(いずれもユーザー操作契機、自然な物理終端は現行production上存在しない)であり、いずれも`finalizeMotorOnlyRunIfActive`アダプタを経由してちょうど1回`performApplyRunOutcome`を呼ぶ。

### 12.2 同一step内の優先順位

(1) 既に算出済みのstep結果がある場合はそれを先に処理する(`termination`非null→destructionTerminal優先、`physicsState.status`が終端→物理終端で確定)。(2) いずれにも該当しなかった場合にのみ、その時点でプレイヤーの中断操作を`manualAbort`として確定する(新たに1frame分の物理を進めることはしない)。(3) 破壊成立と中断操作が同一stepで競合する場合、常にdestructionTerminalが優先される。

### 12.3 テスト観点

全endReasonで`performApplyRunOutcome`呼び出しがちょうど1回であることをモック呼び出し回数で検証する。同一stepで複数の終了条件が競合する場合の優先順位をテストで固定する。

---

## 13. キーボード/a11y(全11項目)

1. **native要素**: すべての操作可能要素はnative `<button>`/`<a>`要素とし、`div`+`onClick`のような非nativeなクリックターゲットを使わない。
2. **フォーカス可視化**: `:focus-visible`によるフォーカスリングをすべてのフォーカス可能要素に適用する。
3. **モーダルのフォーカス契約**: 背景無効化は`inert`属性を第一選択とする(`aria-hidden+tabindex=-1`のみでは子孫要素全体のフォーカス不能を保証しないため同等fallbackとして扱わない)。open時、モーダル内の最初のフォーカス可能要素へフォーカスを移動する。`Escape`キーで閉じる。閉じた後はトリガー要素へフォーカスを復帰する。accessible nameを明記する。**(J7新設)** モーダル内のスクロール可能領域には`overscroll-behavior: contain`を適用し、モーダル内でのスクロールが背景コンテンツ側へ伝播しない(背景がモーダルの下でスクロールしてしまう挙動を防ぐ)ことをDoDに含める。
4. **roving tabindexの適用範囲限定**: tabs/grid等の複合widgetにのみ適用する。図鑑一覧・発見一覧のような通常のリンク/ボタンの並びはnative Tab順を維持する。
5. **色以外の状態表示**: 色だけに依存した状態表示をしない。
6. **role区分**: `role="alert"`は緊急エラーのみ。通常の拒否理由・計測結果・進捗表示は`role="status"`または`aria-describedby`。**(J7新設)** `role="status"`/`role="alert"`いずれの更新も、**事前に描画済みの安定したDOMノードのtextContentを書き換える**方式で実装し、更新のたびにノード自体を作り直さない(ノードの再生成はスクリーンリーダーが変更を検知できない、または過剰に読み上げ直す原因になるため)。
7. **Canvas症状の表現**: `aria-label`の高頻度書き換えを避け、同じ情報を持つDOM上の安定したテキストstatus領域を更新する(項目6と同じ「ノードは固定・textContentのみ更新」の原則を適用する)。
8. **forced-colors対応**: `forced-colors`メディアクエリ環境でもフォーカス可視性が消えないこと。
9. **タッチ/クリックターゲット・reflow**: 最低24px、タッチ操作要素は44px相当。200%ズーム/320px幅でも横スクロールなしで全機能に到達できる(周辺HTML UI、低解像度Canvas部分は対象外)。
10. **`prefers-reduced-motion`**: 破壊演出のパーティクルアニメーションは静止画表示またはopacity変化のみに置き換える。物理・判定結果自体は不変。
11. **タイムアウト禁止+自動テスト化**: 保留中結果画面のエラーメッセージ等を一定時間で自動消去しない。keyboard操作・フォーカス管理・`prefers-reduced-motion`・alert/status区分の主要経路はPlaywright等で可能な範囲で自動化する。

---

## 14. bundle 1MB未満

実際にブラウザで初回画面が操作可能になるまでに取得したJS/CSS/フォント等の転送量(raw/gzip両方、静的ビルド出力サイズだけでなく実ブラウザ計測を伴う)。最初の操作前に必須のlazy chunkは除外できない。現状値(raw 790.97kB/gzip 221.23kB)を起点に、各サブステップで両方を記録する。900kBは候補警戒線であり承認済み規則ではない。動的import採用時は、分割ルート単位の設計・各ルートの初回フォーカス先・ロード失敗時のUIを計画化してから実施する。

---

## 15. 人間試遊導線

**自動契約行列**(§18のマトリクスを自動テスト化): D01〜D05・D07は3文脈、D06・D09はvehicle専用の2文脈で全到達可能組み合わせを網羅する。motor-onlyでのD06/D09非発生は構造負例として直接assertする。

**人間試遊票**(自動化できない部分に限定): 各モードについて、(1) 代表的な観測、(2) 遷移、(3) 安全表示、(4) 再現可能な素材構成recipe+入力手順+想定時間、(5) keyboard操作での到達確認、(6) タッチ操作での到達確認、(7) 代表viewport、(8) `prefers-reduced-motion`環境での確認、(9) 通常運用の負例、を記載した試遊票を用意する。**(10) 経済値の仮値注記(C-5、新設)**: 図鑑報酬・素材価格・ガウスメーター価格(800円、§11.3)等、試遊票に登場する経済値はいずれも試遊用仮値であり数値保証はPhase 5で行うことを、試遊票自体に注記として明記する。

**dev専用configの扱い**: production配線経路(§6.1のassembler)へ混入させない。

---

## 16. テスト方針(層分割)

- **unit層**: 純関数単体(§12.2の優先順位ロジック、§2の3状態判定ロジック、§6.4.1の失敗理由→文言マッピング関数)。既存の`saveGateMode.test.ts`と同型のパターンを踏襲する。
- **integration層**: gameStore action呼び出し+store状態遷移。
- **browser/human層**: マルチタブlease競合、フォーカス移動の目視確認、`prefers-reduced-motion`の実機確認等——自動テスト化できない項目は§15の人間試遊チェックリストへ回す。

既存テスト0件の領域: `src/render/RaceEffects.tsx`(現状12行のみ、パーティクル未実装)、SEを消費する実プレイ画面(`AudioDemo.tsx`/`WorstCaseDemo.tsx`以外に存在しない)。

---

## 17. サブステップ分割(統一ゲート順、I5是正)

| ゲート | 内容 | 所有 |
|---|---|---|
| G1a | assembler・較正定数集約・`EquipmentDestructionContext`**型**定義+呼び出し側正規化のdocstring契約(§6.1。**独立resolverは含まない**——resolverはG1a′で新設)・`RunSnapshot` capture純関数・`computeRecipeKey`本体。**2026-08-15正式通過(Suu_mot3独立照合済み)。arbiter補足裁定Q7により再open範囲なし** | alice |
| **G1a′(arbiter補足裁定HB-DEC-011ケースA Q6、新設)** | `deriveMaterialSelectionFromEquipment`相当の独立resolver+production `MaterialCompositionBaseline`単一出典関数(`resolveProductionMaterialCompositionBaseline`)+二層命名`rawPlayerConfig`/`materialComposedBase`のdocs反映+beginRun合流(Q5)+純関数性テスト(resolver・baseline・composeが引数以外を読まず副作用を持たないことの固定、arbiter追加裁定Q9の代替保証)。人間再承認項目P+追補P-1は2026-08-16人間プロジェクトリード承認済み。**2026-08-16、Suu_mot3照合を正式通過した** | alice |
| **G1b** | `assembleDestructionConfig`等をgameStore.tsから呼ぶ配線を、§7の`productionWiringEnabled`(offのまま)の内側に実装。既存6モードの実wrapper置き換え、`computeRecipeKey`の呼び出し配線、motor-only終了ライフサイクル(§6.2、true側=Phase3経路・false側=旧経路の排他実装)も同様にoff下で実施。段1の実体は最初からG1a′のresolver+baseline関数を呼ぶ完成形として実装する(§6.2の8段順1a〜1e・2・3・5・6・8)。**必須DoD(Q9)**: S-5の失敗時不変条件(3経路×4項目)+N-2後半統合テスト+config構築失敗をrunSequence消費前に確定する構築順序(§23 DoD21)。**必須構成要素(Q10、A3)**: クロスストア原子的境界一式(§6.5)——`beginRunActionWithPreparation`+`prepareDestructionRun`+`try/catch`+runtime 3フィールドの明示リセット+`snapshotCaptureFailed`、およびDoD23〜27。**必須構成要素(Q11、Q-R1〜Q-R4)**: `RunPreparationRunKind`のmotorOnly腕へ`initialOmega`必須追加+防御throw(Q-R1)、`beginProductionRun(runKind, seed)`へのシグネチャ変更(Q-R2)、**alice所有の正典run RNG `createRunRng`(mulberry32、`src/engine/destructionOrchestration.ts`、engine計画v15 §20.10で確定)の新設とtrue側liveでの使用**(Q-R3)、live runtime初期化をrunSnapshotのdeep copy唯一出典とする規則・`finishAssembly`順序=案A・S-5適用範囲の明文化(Q-R4)、およびDoD-Q11-a〜g(§23 DoD28〜34)。**Q-R3により`src/engine/destructionOrchestration.ts`への追加が発生するため、v13までの「`src/engine/`は変更0件」という記述は撤回する**(V2凍結面には触れないPhase 3拡張ファイルへの追加)。**着手条件**: G1a′完了(正式通過済み)+人間再承認項目P・追補P-1・項目Q・追補Q-R1〜Q-R4(**いずれも承認済み**)+`validateMaterialComposedBase`のalice実装とSuu_mot3照合(**完了済み**)+**本UI計画v14のSuu_mot3文書照合通過とG1bの明示解禁指示**(残条件) | **brabit(`saveStore.ts`/`gameStore.ts`のA3・Q-R1/R2/R4実装とテスト)+alice(`src/materials/recipeKey.ts`の`validateMaterialComposedBase`〈完了〉・`src/engine/destructionOrchestration.ts`の`createRunRng`〈Q-R3〉・S-5 fixture提供)の共同所有** |
| **G1c** | `useGameStore.setState({productionWiringEnabled:true})`をテスト環境限定で呼び、既存6モードがproduction経路で発火すること+motor-onlyの二重notebook生成がないことを統合確認 | **alice+brabit共同** |
| G2 | `stepTrackRunWithDestruction`、G1bと同様にoff下でgameStore配線 | alice(engine)+**brabit(配線)** |
| G3 | ギヤ慣性J接続+D06状態機械 | alice(engine/materials)+**brabit(配線)** |
| G4 | D09状態機械 | alice+**brabit** |
| G5 | 較正sweep | alice |
| G6 | WearState反映+collapsed rotor拒否+finalDestructionState+recipeKey搬送+fireExposureProfile+regressionDiff(**純データ配管まで**、§11.2)。**計測器所持状態(§11.3)はG7へ繰越**——人間再承認バンドルJ/Kの実装時期がG7であり、J/Kは同一`SCHEMA_VERSION` 1→2 migrationへ同梱するため(arbiter追加裁定+人間承認2026-08-20)。true側/false側の排他実装(必要な場合)もここで完成させる | alice(純関数)+**brabit(store action本体)** |
| **G7** | HUD/演出/音/図鑑/検死/計測器店/pending導線/a11y/bundle監視。`productionWiringEnabled`はfalseのまま、UI実装自体はここで完成させる(test限定でtrueにした統合確認は許可) | **brabit主導** |
| **G統合** | **`productionWiringEnabled`の初期値を`false`から`true`へ書き換える1行diffのみ**(I5是正、他のコード変更を含めない)。全ゲート完了+§18のcontextマトリクス検証を前提条件とする | 全員 |
| **G9** | `productionWiringEnabled`フィールド・関連if/else分岐の削除**および旧`finishActiveSession`直接`addSession`呼び出し経路の削除**(I5是正、旧経路削除はここでのみ行う)+全テスト/build/lint再実行 | **brabit** |
| **G8** | 人間試遊承認(最終コードでの試遊、G9完了後) | 全員 |

**brabit側の着手可能タイミング(N8是正で現状化)**: G1bはG1a′完了(独立resolver+baseline関数+純関数性テスト)後に着手できる——G1a単体の完了では着手できない(G1a′が新設されたため)。各ゲートの実装着手(コード編集)は、alice側の対応ゲートがSuu_mot3照合・正式arbiterレビュー・必要な人間承認を経て「実装解禁」となった範囲でのみ行う。2026-08-16時点、正式arbiterレビュー・補足裁定・追加裁定Q9いずれも完了し、人間再承認A〜O・P・追補P-1も承認済み、G1a′もSuu_mot3照合を正式通過しているが、**Suu_mot3からG1bの明示解禁指示がまだ届いていないため、brabit側もコード編集に一切着手していない**(本書はdocs-only計画のまま)。

各ゲートのDoDは`npm run test && npm run build && npm run lint`成功+該当節のテスト観点充足。G9も同型の完了報告を要する。

---

## 18. context×mode到達可能性マトリクス

D01〜D05・D07は3文脈(motor-only/test-run/track-run)すべてで到達可能。D06・D09は`buildMotorOnlyFrameInput`が`loadTorqueNm`/`gearFrictionLossW`/`axleAngularVelocityRadS`を全て`undefined`に設定するため、motor-onlyで構造的に発生しない(vehicle専用)。正例22件(D01〜D05・D07の3文脈×6+D06・D09の2文脈×2)+構造負例。production-valid到達可能性は、alice側の較正sweepで検証が必要な受入条件。

---

## 19. 較正候補値の分類表

| 分類 | 該当項目 |
|---|---|
| **承認済み(production定数へ移設するだけ)** | D01・D02・D05共通部(alice所有、`destructionCalibration.ts`) |
| **初期候補(Fable裁定→sweep実測→人間承認を要する)** | D06/D09/ギヤ慣性J/トルクリップルの全数値(alice所有)、SEの波形/周波数/ADSR/gain(§8.3)、ガウスメーター価格・測定式(§11.3) |
| **実測で確定(較正sweep完了後)** | 上記初期候補のうち、alice側較正sweep完了後に確定する全数値 |

---

## 20. rg依存閉包実測(実測値)

```
$ rg -n "mode:\s*'title'\s*\|.*'inventory'" src -g '*.ts' -g '*.tsx'
src/store/gameStore.ts:182(型定義)・223(setMode引数型)
```

```
$ rg -c "useGameStore" src -g '*.tsx' -g '*.ts' | grep -v ":0$" | wc -l
25
$ rg -l "useGameStore" src -g '*.tsx' -g '*.ts' | wc -l
25
```
→ 件数と列挙ファイル数が一致。実ファイル一覧(25件、occurrence数付き): `src/data/__tests__/partPresets.test.ts`(2)・`src/modes/TestRunMode.tsx`(7)・`src/modes/CourseMode.tsx`(16)・`src/modes/DiagnosisMode.tsx`(15)・`src/modes/GarageMode.tsx`(6)・`src/modes/LabMode.tsx`(9)・`src/components/InventoryScreen.tsx`(2)・`src/components/GraphPanel.tsx`(2)・`src/components/assembly/StartStep.tsx`(2)・`src/App.tsx`(4)・`src/components/ParamPanel.tsx`(5)・`src/components/ControlBar.tsx`(3)・`src/components/ObservationPanel.tsx`(3)・`src/components/CourseMeasurementPanel.tsx`(7)・`src/store/__tests__/testRunStore.test.ts`(77)・`src/store/__tests__/gameStore.test.ts`(20)・`src/store/gameStore.ts`(2)・`src/components/ShopScreen.tsx`(2)・`src/components/RecipePanel.tsx`(7)・`src/components/RpmMeter.tsx`(4)・`src/components/TestRunResult.tsx`(3)・`src/render/RaceCanvas.tsx`(8)・`src/components/MotorAudioControl.tsx`(2)・`src/render/CourseRaceCanvas.tsx`(11)・`src/render/MotorCanvas.tsx`(3)。

```
$ rg -ln "SaveGate|computeSaveGateMode|pendingApplication" src -g '*.ts' -g '*.tsx'
src/App.tsx
src/components/SaveGate.tsx
src/components/__tests__/saveGateMode.test.ts
src/components/saveGateMode.ts
src/store/__tests__/runOutcomeApplication.test.ts
src/store/__tests__/saveStore.test.ts
src/store/runOutcomeApplication.ts
src/store/saveStore.ts
```
→ 8ファイル。新規状態の追加はない(§2)。

```
$ rg -ln "from '.*retro/audio" src -g '*.ts' -g '*.tsx'
src/retro-proto/audioDemo/AudioDemo.tsx
src/retro-proto/worstCase/WorstCaseDemo.tsx
```
→ 2ファイルのみ。

```
$ rg -ln "DestructionState|DestructionMode|destructionConfig" src/render src/components src/retro -g '*.ts' -g '*.tsx'
```
→ 0件。

```
$ rg -ln "discoveredModes" src -g '*.ts' -g '*.tsx'
src/store/saveStore.ts
```
→ §11.3のガウスメーター所持状態設計が踏襲する既存パターンの所在ファイル。

**alice所有の新設ファイル(参照のみ)**: `src/materials/destructionCalibration.ts`・`gearInertia.ts`・`wearReflection.ts`・`recipeKey.ts`(新規ファイルのため既存依存閉包への影響ゼロ)、`src/store/notebookValidation.ts`(`saveStore.ts`・3腕validator・JSON import経路から参照される)。

---

## 21. alice計画への申し送り事項への応答

1. **manualAbort対応関係**: §12.2で反映済み。
2. **collapsed rotor拒否のUI表示経路**: §10.5で反映済み。
3. **recipeKey共同契約**: §1確定-7・§6.2・§11.2で一貫した理解へ統一済み。
4. **productionWiringEnabledフラグ同期**: §7・§17で反映済み。
5. **クロスレイヤゲート順の同期**: §17で統一順を反映した。

---

## 22. brabit固有質問への回答状況(本レビューで全9件解決、v10で更新)

v9まで本節は「Fableへ求める判定」としてbrabit固有の9件の未裁定質問を列挙していた。**本レビュー(2026-08-14T08:28:39Z、Suu_mot3中継)がこの9件すべてに回答した**——以下、質問→回答の対応を記録として残す(本レビューの効力は人間プロジェクトリードの承認後に発生する、本レビュー§0)。alice計画側がFableへ提示した内容(D06物理トリガ・D09原因記録候補・ギヤ密度pending問題・`recipeKey`への素材ID追加要否・`courseRuns`/`vehicleTestRuns` export/import新設可否等)も同一レビューで一括回答済みであり、brabit側は§1「本レビューで解消された項目」のとおり追従した。

1. **D07・D09専用視覚表現**(§8.1): **候補1に確定**(R18)。候補2(D09専用白煙)は却下。
2. **D01/D07への追加pitch変調**(§8.3): **候補1(追加変調なし)に確定**(R19)。候補2(決定論的jitter式)は不採用。
3. **D09の焼付き瞬間表現**(§8.3): **候補1(固定周波数2音の急速切替、API変更不要)に確定**(R20)。候補2(周波数スイープ)はP3-4スコープ外。
4. **`SE_MASTER_GAIN`予算新設+同時発音正規化**(§8.3): **承認**(R21)。初期候補値(BGM 0.85/motor 0.05/SE 0.10)+モード横断単一SEバス正規化の方式ごと承認、`mixLevels.ts`既存定数の変更を伴うため人間再承認(§8-M)は別途要。
5. **motor-only終了ライフサイクル**(§6.2): **承認**(R22)。`finalizeMotorOnlyRunIfActive`アダプタ・4入口・true/false排他実装・G9での旧経路削除、いずれもコード実測(`motorPhysics.ts` 550/581行)と一致することを本レビューが確認済み。人間再承認(§8-N)は別途要(既存機能の挙動変更)。
6. **ガウスメーター価格・解禁条件・所持状態のschema/migration設計・測定式**(§11.3): **全項目確定**(R23)。価格800円固定・D07初回発見後解禁・`PersistedSaveState`直下の`InstrumentOwnership`・`SCHEMA_VERSION`1→2+`SAVE_KEY`不変・migrate→新validator→write手順・`computeGaussMeterReading`のbrabit所有・整数%四捨五入、いずれも承認。**人間再承認の状態(2026-08-20訂正)**: 「別途要」は本節執筆時点の記述であり、**§8-J・§8-K・§8-Lは2026-08-15の「A〜O、15件を再承認します。」に含まれ承認済み**である(項目C〈`NotebookExportV2`〉と同型の記述残存だった)。ただし**実装時期はG7**であり、J・Kは同一`SCHEMA_VERSION` 1→2 migrationへ同梱する(arbiter追加裁定+人間承認2026-08-20、§11.3の注記を参照)。
7. **`courseRuns`/`vehicleTestRuns` export/import UI導線**(§10.6): **P3-4スコープ外に確定**(R10、alice計画側の判断)。新機能追加でありPhase 3完成ゲートの必須要件ではない。
8. **`staleLease`の具体UI化**(§2): **「具体UI契約を設計しない」ことを承認**(R24)。`readFreshForApply`がlease不一致を`leaseNotAcquired`へ変換するためproduction action経路からの到達経路が現存しないことを本レビューが確認済み。実到達の証拠が得られた場合のみ個別提起、という本書の手順自体も承認された。
9. **検死レポート共通レイアウトのcauseLog/劣化差分の保存・表示契約**(§3.2): **推奨候補〈`CodexRecordEntry`拡張〉を承認**(R25)。`discoveryEvent`(`physicsSnapshotAtT`+causeLog込みの初回登録イベント)+`runDegradationDiffs`(走行単位の事実、mode別虚偽帰属をしない)の2フィールド追加、legacy/currentはproperty-presence判別union+交差不変条件`hasDiscoveryEvent===hasRunDegradationDiffs`、永続形式拡張は項目6と同一`SCHEMA_VERSION`1→2 migrationへ同梱(migration手順を2本立てにしない)。対立案(実験ノート参照)は却下(安定参照契約の欠如+50件trim対象という弱点)。**人間再承認の状態(2026-08-20訂正)**: 「別途要」は本節執筆時点の記述であり、**§8-Kは2026-08-15の「A〜O、15件を再承認します。」に含まれ承認済み**である(§22-6と同型の記述残存だった)。ただし**実装時期はG7**であり、項目6(§8-J)と同一`SCHEMA_VERSION` 1→2 migrationへ同梱する(arbiter追加裁定+人間承認2026-08-20、§11.3の注記を参照)。

**まとめ**: 上記9件はいずれも「契約設計」自体は確定した。未了なのは(i) §8-M/N/Oの人間再承認、(ii) SE波形/周波数/ADSR/gain・queue深さ上限等の**数値**そのもの(G7実装+G8人間の耳で確定、§19の分類表)の2点のみである。**§8-J/K/Lは2026-08-15の「A〜O、15件を再承認します。」に含まれ承認済みであり、未了一覧から除外する**(実装時期はG7、J・Kは同一`SCHEMA_VERSION` 1→2 migrationへ同梱。2026-08-20訂正)。

---

## 23. DoD(全体、二層構成+J1〜J7・L1〜L10反映)

`npm run test && npm run build && npm run lint`成功に加え、次を満たすこと:

1. **全endReason1回適用(二層構成、P3-1-Q4裁定と同型)**: **(a) context非依存層**: 手構築した`RunOutcome`fixture(実wrapperを経由しない)を用い、`destructionTerminal`/`finished`/`stalled`/`derailed`/`overheated`/`energyExhausted`/`manualAbort`の全7 endReasonについて、`performApplyRunOutcome`呼び出しがちょうど1回であることを、contextに依存しない形で検証する(既存`src/store/__tests__/runOutcomeApplication.test.ts`と同型のtable-drivenテスト)。**(b) 実wrapper層**: 各文脈で実際に到達可能なendReasonのみを実wrapper経由の正例としてテストする——motor-onlyは`destructionTerminal`+§6.2の4終了入口(いずれもユーザー操作契機)経由の擬似`manualAbort`相当のみ、test-run/track-runは§18のマトリクスに従い`finished`/`stalled`/`derailed`(track-runのみ)/`overheated`/`energyExhausted`/`manualAbort`/`destructionTerminal`の全種。到達不能な組み合わせ(motor-onlyの`finished`/`derailed`/`energyExhausted`、および物理層発の自然終端が現行production上存在しないこと自体)は、実コード構造の引用(`motorPhysics.ts`の`step`が`running`をfalseへ遷移させる経路を持たないこと、`buildMotorOnlyFrameInput`の型にcourse/energyBudget概念が存在しないこと)で構造負例として固定する——実wrapperで無理に発生させようとしない。
2. **同一step優先順位**: destructionTerminalとmanualAbortが同一stepで競合する場合、常にdestructionTerminalが優先されることをテストで固定する(§12.2)。
3. **motor-only二重notebook生成ゼロ**: `productionWiringEnabled=true`の経路で、motor-onlyの1runにつき旧`finishActiveSession`経由の記録とPhase 3経由の記録が二重生成されないことを直接テストする(§6.2)。
4. **lease/pending 3状態**: 正常/`leaseNotAcquired`待機/整合性エラーの3状態(現行`SaveGateMode`の`normal`/`waiting`/`pending`に対応、`corrupted`は破損として別途扱う)が、実際のマルチタブ操作+単体テストで意図どおり機能することを確認する。`staleLease`は既存の`applyOutcomeErrorReasonJa`単体テストのみを維持し、新しい画面状態・E2E契約・整合性エラー画面内での表示分岐も追加しない(§2・§9、J1是正)。
5. **finalDestructionState/recipeKey legacy読み取り**: legacy record+存在record(P3-4以降)の両方を正しく読めることを、validatorのテスト(alice所有)+実際の永続データでのE2E確認(brabit所有)で検証する。
6. **D04記録legacy表示**: legacy recordを「膨張なし」と誤表示しないこと。
7. **collapsed/destroyed rotor表示**: `destroyedRole`分岐の`reason`がUIへそのまま表示されることを確認する。
8. **recipeKey単一呼び出し**: `computeRecipeKey`が`beginRunAction`内で実行あたりちょうど1回だけ呼ばれ、それ以外の箇所からは呼ばれないことをテストで固定する。
9. **計測器所持状態の永続化・migration(J2・K1是正)**: `ownedInstrumentIds`が`readonly InstrumentId[]`としてJSON往復(保存→復元)で欠落なく保持されること、重複が拒否されること、`SCHEMA_VERSION`1→2のmigration手順(旧v1データの読取→新形状構築→新validator再検証→書き戻し)が正しく機能すること、migration対象の旧/新validator失敗(データ自体の破損)は`corrupted`、**`readRaw`または`writeV16`のI/O失敗は`storageError`**として区別されること、**migrationの書き戻し(`writeV16`)自体が失敗した場合にメモリ上だけmigration成功として処理を続行しない**(次回起動時に再度migrationが試行される冪等設計)ことを確認する(§11.3、契約自体はFable/人間裁定を経てから実装)。
10. **検死レポートのcauseLog/劣化差分表示(K2是正、R25で承認済み)**: `discoveryEvent`/`runDegradationDiffs`拡張を持たない既存`codexRecords`(legacy)と、これらを持つP3-4以降の新規エントリ(current)の両方を正しく表示できることを確認する——legacy側は「発見時の詳細情報なし」等の中立表示に留め、causeLog/劣化差分を捏造しない(§8.4の既存legacy表示原則と同型)。**(C-12追加)** `discoveryEvent`のみ・`runDegradationDiffs`のみを持つ半状態(交差不変条件`hasDiscoveryEvent===hasRunDegradationDiffs`違反)を、全復元経路(save restore・JSON import・`PendingNotebookRecord`)で一貫して拒否することを負例テストで固定する。
11. **a11y**: §13の11項目すべてをDoDとして満たすこと。
12. **bundle**: production配線後もbundle sizeが1MB未満を維持することを、静的ビルド出力(raw/gzip)+実ブラウザでの初回操作可能時点までの転送量の両方で実測する。
13. **人間試遊**: §15の自動契約行列+human playtest票(10項目、C-5の仮値注記込み)を用いた試遊を実施する。
14. **安全表示**: 電池短絡・発熱・工作道具の注意が試遊開始前に画面上で提示されることを確認する。
15. **feature gate実挙動**: `useGameStore.getState().productionWiringEnabled`の実挙動が`false`であることの確認がG1〜G7期間中CIで維持され、G統合commitでのみ`true`へ切り替わる1行diffのみで構成されること、false/true経路の実行順序非依存性を確認する。
16. **G9(code cleanup)**: `productionWiringEnabled`削除+旧`finishActiveSession`直接`addSession`経路削除後、全テスト/build/lintを再実行することを確認する(I5是正)。
17. **`NotebookExportV2`往復(`ExperimentSession`腕のみ)**: legacy/current混在の`sessions`を欠落なくexport/importできることを往復テストで確認する。`courseRuns`/`vehicleTestRuns`腕は、alice側のスコープ判断確定までDoD対象外とする。
18. **SEバス正規化(モード横断)**: D05等の複数同時発音モードだけでなく、継続音(D01/D07/D09)とイベント音がモードを横断して同時発生する現実的な最悪ケースの組み合わせについて、正規化後の実効gainがBGM+motor音+SE全チャンネル合計で`1.0`を超えないことを数値アサートする(§8.3)。
19. **依存閉包の維持**: §20の実測値を実装着手前に再実測し、差分があれば本書へ転記する。
20. **`materialComposedBase`有限性検証の順序(C-3、M4是正で二層命名へ更新)**: §6.2の8段順(2)の検証がexact 1回・`computeRecipeKey`呼出し(3)より前に実行されることをテストで固定する。非有限値(NaN/Infinity)を注入した`materialComposedBase`でbeginRunが`{ok:false}`を返し、`RunSnapshot`/`RunAccumulator`が作られないこと、`computeRecipeKey`が呼ばれないことを直接assertする(期待する赤: 検証をrecipeKey計算の後に置いた場合、非有限値がrecipeKey文字列化時のthrowとして未捕捉のままUIへ漏れる)。
21. **production config出典分裂横断監査(C-4最終DoD、arbiter補足裁定Q6、N2是正でG1a′/G1b境界を更新)**: `beginRunAction`内で、`loadout`・`inventory`・`garageSelection`・`gameStore.config`の読取りが各**exact 1回**であり、1a(単一読取り)・1b(`validateEquipmentLoadout`)・1c(G1a′ resolver)・1d(baseline構築)・1e(`composeConfigFromMaterials`)・2(有限性検証)・3(`computeRecipeKey`)・4(Wear反映、G6以降)・5(`assembleDestructionConfig`)・6(`createInitialDestructionState`)・7(ギヤ個体`toothLossCount`読取り+`seedInitialDestructionStateFromWear`呼出し、G6以降)・8(`captureRunSnapshot`)が単一経路を成し、`materialComposedBase`・`DestructionConfig`・`recipeKey`・(G6以降)実効configがすべて同一の`selection`実体・同一の読取り値から派生していることを、呼出し回数モック+同一参照/同値assertで機械的に固定する(P60教訓)。**G1a′(1c/1d/composeが純関数であることのテスト固定、alice)・G1b(配線側、現存6段分=1a単一読取り相当・2・3・5・6・8+S-5失敗時不変条件〈3経路×4項目〉+N-2後半統合テスト、alice+brabit共同)・G6(8段全体の再固定)の3段階で充足する(arbiter追加裁定Q9、S-5/N-2後半はG1a′からG1bへ移管済み)**。
22. **M-1負例(α/β/γ、engine計画側実装のUI側受け入れ確認)**: alice計画側が実装するM-1(vii)の負例3件——(α)9歯損傷個体をseedした走行での1本目歯欠けイベントで`isTotalLoss:true`・`termination`非nullになること、(β)`applyGearDiff`適用後の永続`toothLossCount`がちょうど10になること、(γ)`applyWearToCarConfig`がtoothLossCount=9のwear入力に対しgearEfficiencyを変えない(恒等)こと——について、brabit側は§6.2 8段順(7)のギヤ個体`toothLossCount`読み取り+`seedInitialDestructionStateFromWear`呼出し配線が、これら負例のfixtureで想定どおりの値を`captureRunSnapshot`へ渡せることをG1b/G3統合テストで確認する(engine側テスト本体はalice所有、brabit側は配線の疎通確認のみ)。
23. **A3クロスストア原子的境界の純関数性・単一読取り(Q10、§6.5.5)**: `prepareDestructionRun`本体を既存G1a′純関数性テストと同一パターン(`extractNamedFunctionBody`+`FORBIDDEN_GLOBAL_PATTERNS`)で構造検査し、引数非破壊・同一入力同一出力(決定性)を固定する。`beginProductionRun`本体が`prepareDestructionRun`以外のalice所有関数を直接呼ばないことの構造検査、および`get()`呼出し回数がexact1であることの回数テスト(C-4同型)も行う。
24. **runKind/context不整合の負例(Q10-§6必須条件、`gameStore.test.ts`)**: `prepareDestructionRun`へ実際に矛盾する引数(`runKind={kind:'testRun'}`×`equipmentSnapshot.context==='motor'`、および`runKind={kind:'motorOnly'}`×`context==='vehicle'`の2方向)を渡し、**throwすること**を実行時に確認する(構造検査ではなく実引数による負例)。
25. **`snapshotCaptureFailed`の負例(Q10-§1・A3必須修正の検証、`saveStore.test.ts`)**: `captureRunSnapshot`が例外を投げる状況をモックで再現し、(i) 戻り値が`{ok:false, reason:'snapshotCaptureFailed'}`、(ii) `currentRunSequence`・`pendingRunEquipmentSnapshot`・`pendingRunSaveId`がいずれも`null`へ戻る、(iii) 直後の再呼出しが`runInProgress`で拒否されず進行できる(**ソフトロックが発生しないことの直接確認**)、(iv) `saveMeta.nextRunSequence`はcommit済みのまま(ロールバックしていない)——の4点を固定する。
26. **S-5の全失敗経路×4不変条件(Q9移管分をQ10で拡張)**: resolver失敗・compose失敗・有限性検証失敗の3経路に加え、**gate失敗(lease/pending/runInProgress)・storage書込み失敗の各経路**でも、`nextRunSequence`不変・`pendingRunEquipmentSnapshot`不変・`RunSnapshot`/`RunAccumulator`不生成・gameStoreローカルruntime state不変の4項目が成立することを直接assertする(A3ではこれら全経路がcommit前に閉じるため、UI契約(a)を完全に満たす)。
27. **`validateMaterialComposedBase`のUI側受け入れ確認(alice担当分の疎通、§6.5.6)**: alice_mot3が`src/materials/recipeKey.ts`に実装する`validateMaterialComposedBase(motorConfig, carConfig)`について、brabit側は`prepareDestructionRun`内での呼び出し配線が正しく機能することを確認する——(i) 呼び出し位置が`composed.ok===true`確認後・`computeRecipeKey`呼出しの**直前**であること(C-3の順序要件、DoD20と同型)、(ii) `{ok:false, reason}`が§6.4.1の「config構築失敗」generic行へ`missingRole`なしで合流すること、(iii) **27エントリ**(`MotorConfig` 17件+`CarConfig` 10件)のいずれかを非有限値にしたfixtureでbeginRunが`{ok:false}`を返し`RunSnapshot`/`RunAccumulator`が作られず`computeRecipeKey`が呼ばれないこと。**エントリ件数27の固定・双方向同期(検査集合⊆throw集合およびその逆)・`effectiveTurnsRatio`のbase契約テスト本体はalice所有**(`src/materials/__tests__/recipeKey.test.ts`)であり、brabit側は配線の疎通確認のみを行う(DoD22のM-1負例と同じ分担様式)。
28. **DoD-Q11-a(snapshot⇔live一致)**: true側の`flickStart`/`finishAssembly`/`startTestRun`それぞれについて、begin成功後に(i)`simState`が`runSnapshot.initialMotorState`と深い値一致(motor系2入口、omegaは期待`initialOmega`値)、(ii)`vehicleState`が`runSnapshot.initialVehicleState`と深い値一致(`startTestRun`)、(iii)live rngが正典RNG(`runSnapshot.seed`)で初期化されていること、(iv)`_sessionSeed === runSnapshot.seed`、をテストで固定する。
29. **DoD-Q11-b(再現性機能の保持)**: `flickStart`(true側)で`runSnapshot.seed === recipeSeed`であることを固定する(プレイヤー可視の再現実行機能がtrue側でも生きていることの担保)。
30. **DoD-Q11-c(finishAssembly失敗原子性)**: (i)config commit失敗→begin未呼出し・`nextRunSequence`不変・accumulator不生成、(ii)config commit成功+begin失敗→configは保存済み・run runtime不変・accumulator/snapshot不生成、(iii)成功時→snapshotの`motorConfig`が**新config由来のcomposed値**であること(例: `coilTurns`を変えて渡し、snapshot側composed値へ反映されていることをassert)、の3経路をテストで固定する。
31. **DoD-Q11-d(production経路のリプレイ等価)**: true側のmotor-only(**非ゼロ**`initialOmega`)とtest-runのそれぞれで、live経由でNステップ走行した結果(`events`・`destructionState`・`termination`)と、同一`runSnapshot`から`createRunAccumulator`+wrapper+正典RNG(`snapshot.seed`)で独立に再走行した結果が完全一致することを固定する(P3-1-Q9リプレイ等価テストのproduction入口版)。
32. **DoD-Q11-e(RNG正典適合)**: true側liveのrng系列の先頭N値が正典RNG(`seed`)の系列と一致することを固定する(アルゴリズムドリフトの検出)。
33. **DoD-Q11-f(防御throw負例)**: `prepareDestructionRun`へ非有限・範囲外の`initialOmega`を渡してthrowすることを固定する(Q10 §5のcontext不整合負例と同じ様式)。
34. **DoD-Q11-g(false側回帰)**: false側(V2旧経路)の既存テストが無変更で全通過すること(既存DoDの再確認、`nextRandom`・従来seed挙動の凍結)。

---

**手続きに関する注記(v13で現状化)**: 本書はbrabit_mot3が作成したdocs-only計画である。**正式arbiter_mot3(旧称Fable役)技術レビュー(2026-08-14)・補足裁定HB-DEC-011ケースA(2026-08-16)・追加裁定Q9(2026-08-16)・追加裁定Q10(2026-08-18)いずれも完了済み(条件付き承認)**——本書はその判定内容全体を反映しており、alice_mot3の設計回答v2(2026-08-18、`validateMaterialComposedBase`一式)への同期も済んでいる。pitfalls#1により、正式な(arbiter_mot3/旧Fable)回答は人間プロジェクトリードの直接提示、またはSuu_mot3が中継したもののみを正式回答として扱う——本書が反映した判定内容自体はこの経路(Suu_mot3中継)を満たしている。

**実装状況(2026-08-18時点、Suu_mot3文書照合通過・Q-R3実装中)**: **人間再承認一覧A〜O・P・追補P-1・Q・追補Q-R1〜Q-R4(§1)はすべて承認済み**、G1a′は正式通過済み、alice担当の`validateMaterialComposedBase`実装もSuu_mot3独立照合を通過済みである。brabit_mot3のG1b実装はSuu_mot3独立レビューを複数ラウンド経て**P1〜P8・P10〜P12・P14〜P16・P18・P19まで是正しSuu_mot3照合を通過**した。**Q11文書同期(本書v14・決定台帳`P3-4-Q11`・人間再承認バンドル追補)も、B-Q11-1〜B-Q11-7の是正を経て2026-08-18にSuu_mot3独立照合を正式通過した(本書最終SHA256 5fa96015…)。** これによりQ11の実装工程自体は解禁されたが、共有作業の競合回避と正典RNG契約の先行固定のため**工程順序が定められている**——**工程1=alice担当Q-R3**(`createRunRng`の新設+engine内mulberry32の一元化)、**工程2=brabit担当のP9/P13/P17・DoD-Q11-a〜g**(storeコード/test)。**brabit側は、aliceの工程1完了をSuu_mot3が照合して工程2解禁指示を出すまで、storeコード/testの編集を停止する。** **G1bは未通過。** commit/tag/push・`productionWiringEnabled`のtrue化・G1c/G2以降は引き続き禁止。
