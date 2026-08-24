# P3-4 人間再承認バンドル(A〜O承認済み15項目+P承認済み1項目〈追補P-1含む〉、計16項目全承認済み)

作成: alice_mot3(2026-08-15、A〜O)。P追加: alice_mot3(2026-08-16、arbiter補足裁定HB-DEC-011ケースA Q8に基づく)。P追補P-1追加: alice_mot3(2026-08-16、arbiter追加裁定Q9に基づく)。正式arbiter技術レビュー(判定文2026-08-14、送信者名義arbiter_mot3〈旧称Fable役〉、Suu_mot3中継確認済み、条件付き承認)が確定した人間再承認対象A〜O(判定文§8、単一一覧・重複なし)を、型・影響・所有者・実装時期まで判断できる形でまとめる。詳細な設計根拠・依存閉包は`docs/phase3-p3-4-plan.md`(engine、現行版)§20.5・`docs/phase3-p3-4-ui-plan.md`(UI、現行版)の対応節を参照。

**状態**: A〜Oは正式arbiter技術レビュー条件付き承認済み(2026-08-14)を経て、**人間プロジェクトリードが2026-08-15、定型文「A〜O、15件を再承認します。」で全15項目を明示承認済み(Suu_mot3中継確認済み)。** これにより正式arbiter条件付き承認の発効条件(M-1 docs反映+Suu最終照合+A〜O承認)がすべて充足され、Suu_mot3の指示によりG1a(assembler・確定較正定数集約・`EquipmentDestructionContext`型定義+呼び出し側正規化のdocstring契約〈独立resolverは含まない、独立resolverはG1a′で新設、arbiter補足裁定Q1・指摘4〉・RunSnapshot capture/recipeKey関連純関数)が着手解禁され、2026-08-15にSuu_mot3の最終照合を通過した(正式通過)。

**Pは承認済み(追補P-1含む)**: G1b着手時にgameStore(V2 raw config)↔素材個体(EquipmentLoadout/PlayerInventory)間の橋渡し契約がP3-4計画に一度も定義されていなかったことが発覚し(2026-08-15)、`docs/phase3-p3-4-production-config-source-review-request.md`にてarbiter_mot3へ補足裁定を依頼、2026-08-16にHB-DEC-011ケースAとして**条件付き承認**の裁定を受けた(判定文Q1〜Q8、条件S-1〜S-10、負例仕様N-1〜N-3、詳細は`docs/phase3-p3-4-plan.md` §20.8〈全文の正準参照〉・`docs/phase3-plan-v12-amendments.md`該当エントリ)。**人間プロジェクトリードが2026-08-16、定型文「補足裁定判定文全体（Q1〜Q8・S-1〜S-10・N-1〜N-3）と項目Pを承認します。」で判定文全体+項目Pの両方を明示承認した(Suu_mot3中継確認済み)。** これにより判定文§9の効力発生条件(人間承認)は充足され、補足裁定判定文全体と項目Pは発効した。Suu_mot3独立照合で発見された要修正9点のdocs-only反映もSuu_mot3が再照合し通過、docsゲートを正式通過とした。**G1a′実装(resolver・baseline構築関数)が解禁され、alice_mot3が実装、Suu_mot3照合(P1〜P3是正+精度追補の3ラウンド)を経た。**その過程でG1a′完了条件(S-1〜S-10全充足)と§3.1のG1b着手条件(G1a′完了後)の循環が発見され、arbiterへ追加裁定(Q9)を依頼、S-5/N-2後半をG1bへ移管する裁定(契約不変・検証時期のみ変更)を受け、**人間プロジェクトリードが2026-08-16、定型文「P3-4追加裁定Q9判定文全体（S-5/N-2後半のG1b移管および項目P追補P-1を含む）を承認します。」で明示承認した(Suu_mot3中継確認済み)。** これによりQ9は発効した(詳細は下記「追補P-1」参照)。**数値較正値(§17.3・UI側候補値)はいずれも本バンドルの承認対象に含めない(確定はG5較正sweep+最終報告+人間commit承認、Q15-1恒久規則)。2026-08-16、Suu_mot3独立照合(P4〜P8是正込み)を経てG1a′は正式通過した。G1a′のproduction/test追加編集は終了。G1bはbrabitのUI計画Q9同期+Suu_mot3クロスレイヤ照合通過が着手の前提条件として残る。production配線・feature gate切替・commit/tag/pushは引き続き禁止。**

---

## A. `RunSnapshot.recipeKey`必須追加+`contractVersion` 2→3+v2非救済+素材ID5フィールド包含(R1・R2)

**型**: `RunSnapshot`へ`recipeKey: string`を必須フィールドとして追加。`contractVersion`を2→3へインクリメント。`computeRecipeKey`のシグネチャへ`MaterialSelection`(wireId/magnetId/gearId/batteryId/brushId、固定順)を追加し、`recipeKey`のpayload先頭へ素材ID5フィールドを含める。

**理由**: 数値タプルの偶然一致により破壊特性(D06閾値等)が異なる走行が同一baselineへ混入する曖昧さを構造的に排除するため(R2)。`recipeKey`を`RunSnapshot`の既存搬送経路(P3-1-Q9)へ相乗りさせることで新しい並行経路を作らない(R1)。

**影響**: `RunSnapshot`を保存するlocal storage契約の破壊的変更。v2形式のsnapshotは`unsupportedContractVersion`により非救済(production配線前で実ユーザーデータが存在しないため救済対象が構造的に無い)。`captureRunSnapshot`(既存関数)のシグネチャ変更(`recipeKey`引数追加)を伴う——これはM-1(D参照)のseedingとは別の変更点である。

**所有**: alice(`src/materials/recipeKey.ts`新設・`destructionOrchestration.ts`のRunSnapshot型・restoreRunSnapshot検証)。呼び出し配線(`beginRunAction`)はbrabit。

**実装時期**: G1a(engine計画§13.1・§13.2)。

---

## B. notebook 3腕への`finalDestructionState`+`recipeKey`必須追加+Legacy union+3専用builder+共通validator

**型**: `ExperimentSession`・`VehicleTestRunNotebookRecord`・`CourseRunNotebookRecord`(3腕)へ`finalDestructionState: DestructionState`・`recipeKey: string`を必須フィールドとして追加(P3-2-Q9裁定の実装)。過去記録(P3-4以前)向けに`LegacyXxx`型(`?:never`で両フィールドの不在を型で明示、構造的部分型の抜け穴を塞ぐ)を新設し、`StoredXxx = Xxx | LegacyXxx`のunionで読取り側を受理する。3腕専用のbuilder関数(判別unionベース、二重上書き不能)+共通validator(`hasFinal===hasRecipeKey`交差不変条件)を新設。

**理由**: P3-2-Q9裁定の実装(検死レポート・図鑑の三段開示に必要)。legacy/current半状態(片方だけ存在)を型・validator両方で構造的に禁止する。

**影響**: 既存notebook永続データ(P3-4以前のlegacy record)は引き続き読める(legacy unionで受理)が、新規書込みは必須フィールドを型で強制される。

**所有**: alice(型・validator・builder純関数、`src/store/runOutcomeApplication.ts`・`notebookValidation.ts`)。store action本体はbrabit(`saveStore.ts`)。

**実装時期**: G6(engine計画§16.1・§16.4・§16.5)。

---

## C. `NotebookExportV2`(version 1→1/2の2形式運用、sessions=union)

**型**: `NotebookExport`をversion 2方式へ拡張。`NotebookExportV2.sessions: StoredExperimentSession[]`(legacy/current混在union)。version 1 importは引き続きlegacyのみ受理、version 2 importは同じunionを受理(R11確定)。

**理由**: 新規exportを常にcurrent形式で強制すると、P3-4以前のlegacy sessionを持つ既存ユーザーがexportできなくなる(既存履歴を捨てない、捏造しない)。

**影響**: `NotebookExport`のversion運用方針変更。既存version 1エクスポートの読み込みは無変更。

**所有**: alice(型・validator設計)+brabit(実際のexport/importフロー実装)。

**実装時期**: G6(engine計画§16.2)。

---

## D. D06契約変更一式(累積曝露トリガ+噛合位相アキュムレータ+M-1クロスラン会計契約)

**型**: `D06Progress`へ`cumulativeOverloadExposure: number`(トリガ用、R6確定・候補b)+`meshPhaseAccumulator: number`(トルクリップル専用、R7確定、決定論的・rng非依存)を追加。`DestructionConfig.d06`へ`toothFatigueExposureNmS: number`を追加。**M-1(必須修正)**: `RunSnapshot.initialDestructionState.modes.D06.toothLossCount`を装備ギヤ個体の永続`WearState.gear.toothLossCount`でseedingする経路(`seedInitialDestructionStateFromWear`、§14.3新設)+`applyWearToCarConfig`(§14.1)からの歯欠け由来効率因子削除(seedingと対で実施必須)+`restoreRunSnapshot`へのtoothLossCount範囲検証(§13.1)。

**理由**: D06トリガは累積曝露方式(R6)、トルクリップルは専用位相アキュムレータ方式(R7、候補d却下に伴う新設)。M-1は部分損傷ギヤ再装備時の会計破綻(次走行が更に10本欠けるまで終端しない)・二重計上・検死ログ虚偽表示という3実欠陥の是正(判定文§3、確定裁定(i)〜(viii))。

**影響**: `D06Progress`・`DestructionConfig.d06`の破壊的型拡張。`applyWearToCarConfig`の計算式変更(既存挙動から歯欠け因子を削除)。

**所有**: alice(`destructionModes.ts`・`wearReflection.ts`)。

**実装時期**: G3(engine計画§6・§9)。M-1のうち§15装備拒否はH(下記)と対で実施。

---

## E. D09契約変更一式(config型完成+生boolean2値のcauseLog+derive完成)

**型**: `DestructionConfig.d09`を`{ thermal: {...}, bearingSeizureGaugeLimit, metalGearContactAlways, highLoadHighSpeed: {...}, gearSeizureDeltaFraction, bearingSeizureDeltaFraction }`として完成(R3確定)。`D09CauseLog`へ`metalGearContactActive: boolean`・`highLoadHighSpeedActive: boolean`(終端瞬間の生値、解釈済みラベルは持たない、R4確定・候補A)を追加。`deriveDegradationDiffs`のD09分岐(現状スタブ)を完成させる。

**理由**: D09劣化量供給はconfig固定値→event複写→derive一方向契約(D07`demagnetizationDeltaFraction`と同型、R3)。被害記録は「答えを教えない、生の数値を見せる」というspec §1.2の難易度哲学に合致する生boolean記録(R4、候補B〈履歴記録によるoriginKind〉は却下)。

**影響**: `DestructionConfig.d09`・`D09CauseLog`の破壊的型拡張(新規モードのためmigration対象なし)。

**所有**: alice(`destructionModes.ts`・`destructionOrchestration.ts`)。

**実装時期**: G4(engine計画§7.2・§7.7)。

---

## F. `DestructionFrameInput`拡張+`buildVehicleFrameInput`のcarConfig引数追加

**型**: `DestructionFrameInput`へ`gearFrictionLossW?: number`・`axleAngularVelocityRadS?: number`(いずれもmotor-onlyでは`undefined`)を追加。`buildVehicleFrameInput`のシグネチャへ`carConfig: CarConfig`引数を追加(既存の`config: MotorConfig`のみのシグネチャからの破壊的変更)。

**理由**: D09入力物理式(gearFrictionLossW)・D06/D09の車軸角速度(axleAngularVelocityRadS)はCarConfig依存のため、`destructionModes.ts`(leaf、CarConfig構造を知らない)ではなくwrapper側(`destructionOrchestration.ts`)で事前計算する設計(§7.3)。R8確定裁定によりgearFrictionLossWの物理的妥当性は代数的に証明済み(二重計上ではない)。

**影響**: `buildVehicleFrameInput`の呼び出し元2箇所(`stepTestRunWithDestruction`・`stepTrackRunWithDestruction`)が追従を要する破壊的シグネチャ変更。

**所有**: alice(`destructionModes.ts`・`destructionOrchestration.ts`)。

**実装時期**: G3(engine計画§7.3、D06/D09双方が参照するため先行導入)。

---

## G. `CarConfig.gearReflectedInertiaKgM2?`追加+`gearInertia.ts`新設

**型**: `CarConfig`(vehiclePhysics.ts、frozen core)へ`gearReflectedInertiaKgM2?: number`(既定0)を追加。`jEff`計算式へ`+ (carConfig.gearReflectedInertiaKgM2 ?? 0)`を追加。新設`src/materials/gearInertia.ts`が`GEAR_ASSUMED_RADIUS_M`/`GEAR_ASSUMED_THICKNESS_M`(設計仮定値、判定文§9(5)で候補承認済み)+`resolveGearReflectedInertiaKgM2`(actual→reflected変換、R13確定・etaを含めない式)を提供。

**理由**: spec §4.2「チタンは砕けない代わりに重い(J増で加速鈍化)」の実装に必要。R13は既存の質量反射項(`/eta`込み)とは意図的に異なる式(慣性はエネルギー貯蔵でありetaが表す散逸とは別物)を確定。R14はgear密度pending問題(4種中3種)への対応順序((c)一次資料検証→(a)designAssumption代用→(b、titanium禁止)を確定)。

**影響**: `CarConfig`(frozen core)へのoptional追加——既定0のため既存configはすべて無改修で動作しV2回帰不変。`vehiclePhysics.ts`の変更を伴う(既存の「`src/engine/`はaliceのみ変更」役割どおり)。

**所有**: alice(`vehiclePhysics.ts`・`gearInertia.ts`新設)。

**実装時期**: G3(engine計画§10.3・§10.4)。

---

## H. `ValidateEquipmentLoadoutResult`への`destroyedRole`分岐+拒否3種

**型**: `ValidateEquipmentLoadoutResult`へ`{ ok: false; reason: string; destroyedRole: EquipmentRole }`分岐を追加。collapsed rotor・burnedOut rotor(R17確定)・gear全損個体(`toothLossCount>=GEAR_TOTAL_TOOTH_COUNT`、M-1(v))の3種を装備拒否対象とする。

**理由**: 崩壊・焼損・全損した個体を平然と再装備・再走行できてしまう既存の穴を塞ぐ。D06/D09会計契約(D参照)がこの装備拒否を前提とする(gear全損は§14.3のseeding・§13.1のrestore検証と対をなす不変条件)。

**影響**: `ValidateEquipmentLoadoutResult`の新規分岐追加(既存`missingRole`分岐は無変更)。

**所有**: alice(`runOutcomeApplication.ts`)。UI表示経路はbrabit。

**実装時期**: G6(engine計画§15)。

---

## I. WearState→次run反映の新経路(`wearReflection.ts`+較正定数3種)

**型**: 新設`src/materials/wearReflection.ts`が`applyWearToMotorConfig`・`applyWearToCarConfig`(§14.1)を提供。新規較正定数3種`BRUSH_WEAR_RESISTANCE_PENALTY`・`GEAR_SEIZURE_EFFICIENCY_PENALTY`・`BEARING_SEIZURE_FRICTION_PENALTY`(値は本バンドルの承認対象外、G5 sweepで確定、R27精密化済み)。

**理由**: 個体の恒久劣化(WearState)を次run開始時のbase config(実走行)へ初めて反映する経路——P3-1〜P3-3では「diff→persisted item書込み」のみが実装済みで、逆方向(劣化済み個体→次run base config)は未実装だった。R27はv12 §1.2契約(伝達効率はtoothLossCountから、摩擦はseizureFractionから独立算出)の精密化を確定。

**影響**: **既存個体状態の実走行への初接続という挙動変更**(P3-1〜P3-3では劣化が次走行の実際の性能に影響しなかったが、本項目以降は影響するようになる)。

**所有**: alice(`wearReflection.ts`新設)。

**実装時期**: G6(engine計画§14.1)。

---

## J. `PersistedSaveState`への`InstrumentOwnership`追加+`SCHEMA_VERSION` 1→2+migration手順

**型**: `PersistedSaveState`へ`InstrumentOwnership: { ownedInstrumentIds: readonly InstrumentId[] }`を追加(`R23`確定、`encyclopedia`配下ではなく`PersistedSaveState`直下)。`SCHEMA_VERSION`を1→2へインクリメント、一方向migration(旧validator→`[]`補完→新validator→`writeV16`)+失敗分類(旧/新validator失敗=corrupted、readRawまたはwriteV16のI/O失敗=storageError)。

**理由**: ガウスメーター(L参照)の所持状態を表現するための新規永続領域。既存`readLatestV16`・`computeBootstrapResult`のversion不一致即corrupted判定と整合するmigration設計。

**影響**: セーブデータのschema変更(既存v15→v16 migration前例と同型の一方向migration)。

**所有**: brabit(`saveStore.ts`)。

**実装時期**: G7(UI計画側)。

---

## K. `CodexRecordEntry`拡張(discoveryEvent+runDegradationDiffs)

**型**: `CodexRecordEntry`(検死レポート・図鑑の保存情報)へ`discoveryEvent`(physicsSnapshotAtT+causeLog込みの初回登録イベント)・`runDegradationDiffs`(走行単位の事実、mode別の虚偽帰属をしない)の2フィールドを追加(R25確定)。Jと同一のSCHEMA_VERSION 1→2 migrationへ同梱する(migration手順を2本立てにしない)。

**理由**: 検死レポートの保存情報として推奨候補(CodexRecordEntry拡張)が承認された。対立案(実験ノートrunSequence参照)は安定参照契約の欠如+50件trimで参照先を失うため却下。

**影響**: `CodexRecordEntry`の破壊的拡張。legacy/currentはproperty-presence判別union+交差不変条件(`hasDiscoveryEvent===hasRunDegradationDiffs`、Bと同型)。

**所有**: brabit。

**実装時期**: G7(UI計画側)。

---

## L. ガウスメーター経済接続

**内容**: 価格800円固定(仮値ラベル必須、Phase 5で経済sweep較正)。D07初回発見後に解禁、未解禁時は非接触温度計と同型の「取扱予定」シルエット掲載。所持状態はJの`InstrumentOwnership`で管理(R23確定)。

**理由**: 磁石ティア連動の価格案は却下(較正の従属変数が増える、診断機器の「買い切りの寛容さ」という定価性格にも合わない)。発見→定量確認という三段開示の順序に合致。

**影響**: 新規UI機能追加+経済数値(仮値)。

**所有**: brabit。

**実装時期**: G7(UI計画側)。

---

## M. `SE_MASTER_GAIN`新設+BGM/MOTOR再配分

**内容**: `SE_MASTER_GAIN`を新設し、初期候補BGM 0.85/motor 0.05/SE 0.10(合計≤1.0)+モード横断単一SEバス正規化を承認(R21確定)。既存`mixLevels`定数の変更を伴う。

**理由**: D06/D09を含む全8モードのSE追加に伴うモード横断の音量正規化が必要。最終バランスはG7/G8の人間の耳で確定。

**影響**: 既存の音量バランス定数(`mixLevels`)の変更。

**所有**: brabit。

**実装時期**: G7(UI計画側)。

---

## N. motor-only終了ライフサイクル+G9での旧経路削除

**内容**: 4入口(resetSim/setMode/flickStart再/finishAssembly再)を単一adapter`finalizeMotorOnlyRunIfActive`へ集約(R22確定)。旧`finishActiveSession`直接addSession経路の削除はG9(明示的cleanupゲート)のみで実施。

**理由**: motor-only文脈には自然終端が存在しない(motorPhysics.tsの実測どおり)ため、4つの離脱経路すべてを一貫した終了処理へ統一する必要がある。

**影響**: **既存挙動変更**(motor-only走行の終了処理の一元化)。

**所有**: brabit。

**実装時期**: G1b(adapter新設)〜G9(旧経路削除、UI計画側)。

---

## O. 音・アートの適用例外2件(D07固有SE免除+D01固有SE新規追加)

**内容**: D07固有SE免除(spec §7.3の三段開示規定がart-spec §8の包括文〈D01〜D09それぞれに固有SEを割り当てる〉に優先するという裁定)。D01固有SEの新規追加(現状D01・D07のみ固有SEを欠いていたうち、D07は免除が正当・D01には免除根拠がないため新規追加、付帯条件C-1)。

**理由**: D07は無演出破壊ではなく三段開示に従う(specが唯一の正)。D01(線材の暴れ)は可聴現象そのものであり、art-spec §6にパーティクル行も存在するため免除根拠がない。

**影響**: art-spec運用に関わる例外的扱い(art-spec本文の改訂は伴わない、本裁定を根拠として台帳へ記録する運用)。

**所有**: brabit。

**実装時期**: G7着手前(C-1、UI計画側)。

---

## P. G1a′一式(EquipmentLoadout→MaterialSelection resolver+production baseline単一出典+二層命名+単一出典契約+beginRun合流+G1a′ゲート新設)【新規・2026-08-16承認済み】

**型**:
1. **resolver新設**(所有: alice、配置: `src/store/runOutcomeApplication.ts`): `deriveMaterialSelectionFromEquipment`(命名はalice裁量、実体はselection+equipmentContext両方を返す)。引数は検証済みnarrowing型`EquipmentLoadout & {batteryItemId: string}`(既存`validateEquipmentLoadout`のok側narrowing)。検証ロジックの再実装は行わない(単一検証権威)。戻り値: `{ok:true; selection: MaterialSelection; equipmentContext: EquipmentDestructionContext} | {ok:false; reason: string; missingRole: EquipmentRole}`。`batteryItemId===null`はresolver到達前に構造的に排除(P3-1-Q6「構築不能」原則)。`sourceWireMaterialId===null`はresolver内で防御的拒否(`missingRole:'rotor'`、現行到達経路0件の防御的分岐)。bodyId解決(null→'body-none'/非null→`inventory.bodyParts`からの`materialId`引き当て)を同一resolverへ統合する。
2. **production `MaterialCompositionBaseline`構築関数**(所有: alice、単一純関数へ集約): `chassisBaselineG := resolveChassisBaselineG(cellSelection)`(`cellSelection`は`rawPlayerMotorConfig.batteryVoltage`(1.5|3.0)からの全域写像で導出、`resolveGarageBuild`のchassis側は使わない)。`baseGearEfficiency := resolveGarageBuild(garageSelection)`結果の`gear.gearEfficiency`(gearRatioと同一呼び出し結果から取る)。テスト・sweepを除く全productionコードで、このS-3関数以外が`MaterialCompositionBaseline`リテラル構築・`resolveChassisBaselineG`直接呼出しを行わないことをrg/import監査テストで固定する(S-4)。
3. **二層命名の確定**(docs反映): `rawPlayerConfig`(gameStore.config/carConfig系統、V2スライダー・プリセット・recipe・診断由来の全8系統+subscribe同期を含む。素材を知らない)と`materialComposedBase`(`composeConfigFromMaterials`の出力、Wear反映前)を区別する。production素材走行のbeginRunでは、rawPlayerCarConfigは**beginRun時の`resolveGarageBuild(garageSelection)`単一呼び出し結果**とし、gameStore.carConfig現在値を直接読まない——V2ラボ/診断(`setLabCarConfig`/`setDiagnosisCarConfig`)の直接編集値は素材走行へ影響しなくなる(**ゲームプレイ可視の挙動変更**、本承認の対象)。rawPlayerMotorConfigはgameStore.configを単一読取りする。recipeKey・DestructionConfig・RunSnapshotはすべて同一の`selection`実体・同一の`materialComposedBase`実体から派生する(単一出典契約)。
4. **beginRun不開始への合流**: 新規`BeginRunConfigError`型は設けない。resolver失敗は既存`missingRole`腕へ、baseline/compose/有限性検証失敗は既存`{ok:false, reason: string}`腕へ合流する。失敗時不変条件(`nextRunSequence`不変・snapshot不生成・ローカル状態不変)を各経路で個別にテスト固定する。
5. **G1a′ゲート新設**: 既存G1a(正式通過済み、契約は一切書き換えない)とG1b(brabit所有、gameStore配線)の間に新設。G1bの着手はG1a′のSuu_mot3照合通過+本項目Pの人間承認後。G1bの配線対象6段(現存1/2/3/5/6/8)自体は変更しないが、段1の実体はG1a′の関数群を呼ぶ形へ精密化される。G6(Wear反映4/seeding 7)は従来範囲を維持。C-4(出典分裂横断監査)の最終DoDをG1a′・G1b・G6の3段階で充足する。

**追補P-1(arbiter追加裁定Q9、2026-08-16、人間承認済み): S-5/N-2後半の検証時期をG1bへ移管**——上記4「beginRun不開始への合流」の失敗時不変条件(S-5)、および対応する負例N-2後半(beginRunAction統合テストでの再現)は、beginRunActionへの統合自体がG1b以降にしか行えないためG1a′単体では原理的に充足不能であることがSuu_mot3レビューで発見され、arbiterへ追加裁定(Q9)を依頼した。**裁定内容(契約の内容・値・型は一切変更しない、検証時期と所有ゲートのみの変更)**: G1a′完了条件からS-5・N-2後半を除外し、G1a′では代わりに resolver・baseline構築関数・compose(`composeConfigFromMaterials`)が**純関数であること**(引数以外を読まない・store/localStorage/sessionStorage/グローバル状態へ一切書き込まない・同一入力で同一出力・引数非破壊)をテストで固定する。S-5の失敗時不変条件(3失敗経路×4不変項目)+N-2後半統合テスト+「config構築失敗がrunSequence消費前に確定する構築順序」は**G1bの必須DoD**として移管し、テスト所有はalice(純関数・fixture提供)+brabit(beginRunAction配線・統合テスト本体)の共同、C-4監査のG1b段階分と同時充足する。arbiterは併せて、本循環が「ゲート境界を跨いだ充足可能性の照合を省略した」という起草側欠陥に起因することを自己申告した(§0、インシデント記録、全文は`docs/phase3-plan-v12-amendments.md`のP3-4-Q9エントリを参照)。

**理由**: G1b着手時に発覚した、gameStoreのV2 raw config(装備素材を一切参照しない)とP3素材システムの装備個体(EquipmentLoadout/PlayerInventory)の間を橋渡しする契約がP3-4計画のいずれの節にも定義されていなかったという欠落(2026-08-15発覚)を埋めるため。放置すると装備素材とRunSnapshotの物理configが「別の事実」を参照する構成が生じ、spec §4・P3-1-Q9単一出典原則・P60/P63教訓に反する。arbiter_mot3がHB-DEC-011ケースA(2026-08-16)で条件付き承認、条件S-1〜S-10・負例仕様N-1〜N-3を課した。追補P-1は、この条件群のうちS-5/N-2後半がG1a′単体では充足不能という起草時の見落としを、arbiter追加裁定(Q9)により是正するもの。

**影響**: 新規契約の追加(既存A〜Oのいずれとも非重複)。§3(二層命名)の帰結として、V2ラボ/診断モードの直接編集値が素材走行の実効configへ反映されなくなる**ゲームプレイ可視の設計変更**を伴う(P3-0-Q4a先例により人間承認事項)。既存G1a(正式通過済み)の公開シグネチャ・挙動への変更は一切ない(arbiter判定Q7「再open範囲なし」)。追補P-1はG1a′/G1bの検証時期配分のみの変更であり、ゲームプレイ可視の挙動変更は追加で発生しない。

**所有**: alice(resolver・baseline関数・docs反映、純関数性テスト)。G1b配線(段1の呼び出し側、S-5統合テスト本体)はbrabit(alice共同)。

**実装時期**: G1a′(G1aとG1bの間、本項目P承認後に着手)。S-5/N-2後半はG1b(追補P-1、Q9裁定)。

**arbiter再提出要否**: 不要(本補足裁定〈HB-DEC-011ケースA〉が該当審査に相当、arbiter判定Q8。追補P-1のQ9裁定自体も本裁定文で完結、arbiter判定Q9-§2(iii))。

---

## Q. G1bクロスストア原子的境界一式(A3)+`validateMaterialComposedBase`【新規・2026-08-18承認済み】

**型(brabit担当分、`src/store/`)**: `src/store/saveStore.ts`へ新規public型2件を追加する——`RunPreparationResult`(`{ok:true; snapshotInput: CaptureRunSnapshotInput}` | `{ok:false; reason:string; missingRole: EquipmentRole}` | `{ok:false; reason:string}`の3腕判別union)、`RunPreparationCallback`(`(loadout, inventory, equipmentSnapshot) => RunPreparationResult`)。`SaveStore`型へ新規public action `beginRunActionWithPreparation(context, prepare)`を追加する(既存`beginRunAction`は**無改修のまま並存**)。`src/store/gameStore.ts`へ新規export純関数`prepareDestructionRun(...)`+判別union型`RunPreparationRunKind`(`motorOnly`|`testRun`|`trackRun`)+新規orchestrator action `beginProductionRun(runKind)`を追加する。

**型(brabit担当分、単独項目として明示提示——arbiterの条件)**: `beginRunActionWithPreparation`の戻り値unionへ**新規失敗腕`{ok:false, reason:'snapshotCaptureFailed'}`**を追加する。意味は「**永続commitは完了済みだが`captureRunSnapshot`が例外を投げたため`RunSnapshot`を得られなかった。孤立runSequenceが1件発生することを許容し、ロールバックしない。UIは再試行可能**」。UI計画v13 §6.4.1へ新規行として追加し、契約(a′)(**契約(a)の修正ではなく、契約(a)の対象外の新規契約**)を適用する。

**型(alice担当分、`src/materials/`)**: `src/materials/recipeKey.ts`へ新規export純関数`validateMaterialComposedBase(motorConfig: MotorConfig, carConfig: CarConfig): { ok: true } | { ok: false; reason: string }`を追加する(**P-Q10-A1**)。検証内容は2層——第1層が`computeRecipeKey`の読む**27エントリ**(`MotorConfig` 17件+`CarConfig` 10件〈`gearReflectedInertiaKgM2`を含む〉)の有限性、第2層が`effectiveTurnsRatio`のbase契約(`undefined | 1`)(**P-Q10-A4**)。**P-Q10-A5(拒否挙動、arbiter補足裁定2026-08-18により確定)**: `effectiveTurnsRatio`が`undefined`でも`1`でもない場合、`validateMaterialComposedBase`はResultとして`{ ok: false, reason: string }`を返す(判定式は`!== undefined && !== 1`でP3-3-Q14の`encodeRecipe`判定式と同一)。既存`encodeRecipe`(P3-3-Q14裁定によりthrow)との機構差は、呼び出し境界の性質の違い(前者はプレイヤー操作起点のbeginRun経路、後者は開発者向けAPI誤用検出)に基づく意図的な設計であり、beginRun経路で例外を未捕捉のまま伝播させないというarbiter追加裁定Q10 §1(A3)の要求と整合する。

**再承認対象外(記録のみ、arbiter補足裁定§6の判定)**: **P-Q10-A2**(`computeRecipeKey`内部のフィールド収集を非exportヘルパ`collectRecipeKeyNumericFields`へ置換する内部リファクタ。**公開シグネチャ・出力文字列とも不変**、公開面の増分なし)、**P-Q10-A3**(`validateMaterialComposedBase`の配置を`materialMapping.ts`ではなく`recipeKey.ts`とする設計判断)。いずれも**人間再承認の対象ではない**——「公開面不変の内部配置変更は人間再承認不要」という確立した先例(**P3-1-Q2**「`DestructionRunContext`等の定義元移設」・**P3-1-Q7**「`BatteryDestructionConfig`等の定義元移設」、いずれも「人間再承認: 不要(公開面不変、実装詳細の逸脱)」)と同型であり、arbiter裁定記録および決定台帳(`docs/phase3-plan-v12-amendments.md`の`P3-4-Q10`エントリ)への記載で足りる。**本項目Qの人間再承認対象は、公開契約(上記の新規型・関数・action)と拒否挙動(`snapshotCaptureFailed`・`effectiveTurnsRatio`のResult拒否)に限定する。**

**理由**: G1b着手時、config構築(8段順)とrunSequence発行の原子的境界がどの承認済み計画にも定義されていないことが判明した(2026-08-16実測)。既存`beginRunAction`を先に呼ぶ設計はQ9/S-5の不変条件(「`nextRunSequence`不変」「config構築失敗をrunSequence消費前に確定」)に直接違反するため使えず、arbiter追加裁定Q10(2026-08-18、条件付き承認)がA3を採用した。`snapshotCaptureFailed`は、`captureRunSnapshot`が内部で`structuredClone`を8箇所呼びResult型を持たない(`DataCloneError`等を投げうる)という実装事実に対し、**例外を未捕捉のまま伝播させず、かつruntime状態を「run進行中」のまま取り残してソフトロックを起こさない**ために必須である。`validateMaterialComposedBase`は、Q10依頼書のpseudocodeが呼んでいた`isFiniteMaterialComposedBase`が実在しない(G1bがコンパイルできない)というarbiter §8ブロッキング指摘の解消として新設する。

**影響(ゲームプレイ可視の挙動)**: (i) 通常時は挙動変化なし(新経路は`productionWiringEnabled=false`下に実装され、G統合まで公開されない)。(ii) `captureRunSnapshot`が例外を投げた稀なケースでは走行が開始されず、「一度目の試行は完了できませんでした。もう一度お試しください」に相当する**再試行が安全であることを示す文言**が表示され、プレイヤーは即座に再試行できる。この際、内部的にはrunSequenceが1つ進む(孤立runSequence)が、P3-0-Q1の高水位意味論により冪等skipとして吸収され、セーブデータの整合性・報酬・図鑑登録には一切影響しない。**ロールバックは行わない**(P3-0以来の「書いてから戻さない」原則を維持)。(iii) `effectiveTurnsRatio`が`1`以外のbase configでrun開始を試みた場合、走行は開始されず§6.4.1の「config構築失敗」行として`reason`が表示される(理論上到達しない防御的経路)。

**所有**: **`src/store/saveStore.ts`・`src/store/gameStore.ts`=brabit_mot3**(A3一式の実装とテスト)、**`src/materials/recipeKey.ts`=alice_mot3**(`validateMaterialComposedBase`・collector・`computeRecipeKey`内部リファクタとテスト)、**`src/engine/`=変更0件**(`captureRunSnapshot`・`CaptureRunSnapshotInput`はalice所有・無改修のまま呼び出しタイミングのみが変わる)。

**実装時期**: G1b(UI計画v13 §6.5・§17)。

**付随して要する条件(arbiter条件、いずれもG1b着手前。補足裁定によって変更・免除されず、すべて有効なまま継続する)**: (i) trusted narrowingの局所type assertionに「なぜ安全か」の1行コメントを付す。(ii) `prepareDestructionRun`内部でrunKind/`equipmentSnapshot.context`の整合を明示検証しthrowする+矛盾引数の負例テストを追加する。(iii) UI計画§6.4.1の既存generic行ラベルを「config構築失敗(base有限性検証〈C-3〉およびWear反映後範囲外の両方を含む)」へ改称する(反映済み)。(iv) alice_mot3設計回答v2 §9のテスト、特に**#4「件数固定(公開APIのみ)」**(`computeRecipeKey`出力の第3セグメント要素数が27であることを公開APIのみで固定)・**#5「双方向同期」**(検査集合⊆throw集合およびその逆)が実装され、**全文出力・終了コードとともに完了報告されること**(要約報告は禁止)。

**arbiter再提出要否**: 不要(本裁定Q10および§8補足裁定が該当審査に相当)。

### 追補Q-R1〜Q-R4(arbiter追加裁定Q11、2026-08-18承認済み)

G1b実装のSuu_mot3独立レビューで、`RunSnapshot`と実際のlive開始入力が食い違う箇所(P9・P13)と`finishAssembly`の順序・失敗原子性(P17)が検出され、arbiterへ追加裁定Q11を依頼した。arbiterは固定入力の実コードで独立確認し4件の不一致すべてを事実と認定、条件付き承認の裁定を下した(全文は`docs/phase3-plan-v12-amendments.md`の`P3-4-Q11`エントリ)。**人間再承認対象は次の4件**:

- **Q-R1**: `RunPreparationRunKind`のmotorOnly腕を`{ kind: 'motorOnly'; initialOmega: number }`へ変更(承認済み型の破壊的変更)。`prepareDestructionRun`はこの値の有限性・`|initialOmega| <= MAX_FLICK_OMEGA`をthrowで防御する。**理由**: 初速は「走行開始時に確定する構成情報」でありP3-1-Q9によりRunSnapshotが唯一の出典でなければならない。`SimState`全体ではなく`initialOmega`のみを持たせるのは、前runの過渡状態(`batteryHeat`・`coilCollapsed`等)が新runへ漏れる第二の伝搬チャネルを作らないため。**影響(ゲームプレイ可視)**: true側では前runの過渡状態の持ち越しが廃止される(false側=V2旧経路は無改修)。
- **Q-R2**: `beginProductionRun`のシグネチャを`(runKind: RunPreparationRunKind, seed: number)`へ変更(内部`createSessionSeed()`を削除し呼出し側供給へ)。**理由**: 内部生成のままだと`flickStart`の`recipeSeed`による再現実行——「固定初速で再現性を保つ」というプレイヤー可視の既存機能——がtrue側で静かに死ぬ。**影響(ゲームプレイ可視)**: この機能がtrue側でも保持される(DoD-Q11-bで固定)。
- **Q-R3**: 正典run RNG関数(mulberry32、**alice所有**、推奨配置`src/engine/destructionOrchestration.ts`、最終配置はalice設計判断)の新設(新規public関数)。**理由**: liveのrngはxorshift、リプレイ規約はmulberry32であり、seedの単一出典化だけでは同一snapshotからの再生が成立しない。**影響**: true側liveのrng系列がリプレイ規約と一致する(false側は`nextRandom`のまま無改修)。brabit所有の`src/retro/audio/prng.ts`は所有境界を越えて共有しない。
- **Q-R4**(契約文の追加、型変更なし): (a)begin成功後のlive runtime初期化は返された`runSnapshot`のdeep copyを唯一の出典とし、raw configからの再生成・別seedの使用を禁止する。(b)`finishAssembly`の順序=案A(config永続commit成功後にbegin)。(c)**S-5「gameStoreローカルruntime不変」の適用範囲の明文化**——run runtimeのみが対象であり、プレイヤー確定構成(`config`/`carConfig`/`garageSelection`/`recipeSeed`)は対象外。

**所有**: Q-R1・Q-R2・Q-R4=brabit_mot3(`src/store/gameStore.ts`)、Q-R3=alice_mot3。`src/engine/`のV2凍結面には触れない(Q-R3はPhase 3拡張ファイルへの追加)。

**実装時期**: G1b(UI計画v14 §6.5.7〜§6.5.9、DoD-Q11-a〜g)。

**人間プロジェクトリードによる承認(2026-08-18、Suu_mot3中継確認済み)**: 次の単一定型文で明示承認された(原文どおり、要約なし):

> P3-4追加裁定Q11判定文全体、および人間再承認デルタQ-R1・Q-R2・Q-R3・Q-R4を承認します。

**これによりQ11裁定の効力条件およびQ-R1〜Q-R4の人間再承認条件は充足した。ただしP9/P13/P17に対応するコード実装は、Suu_mot3の文書照合・明示解禁まで停止を継続する。**

---

## 承認記録

**A〜O**(既承認・変更なし): 上記A〜Oの型・契約変更について、正式arbiter技術レビュー判定文(2026-08-14、条件付き承認)+`docs/phase3-p3-4-plan.md`(engine)+`docs/phase3-p3-4-ui-plan.md`(UI)どおりに実装を進めることは既に2026-08-15にご承認いただいています(再承認は不要です)。数値較正値(gearStrengthThresholdNm・toothFatigueExposureNmS・GEAR_ASSUMED_RADIUS_M等)はいずれも本バンドルの承認対象に含めず、G5の較正sweepで確定し別途報告します。

**P**(新規、承認済み): arbiter補足裁定(HB-DEC-011ケースA、2026-08-16条件付き承認)の効力は、判定文§9のとおり人間プロジェクトリードの承認後に発生する契約であった。承認対象は(1)補足裁定判定文全体(Q1〜Q8裁定+条件S-1〜S-10+負例仕様N-1〜N-3、全文は`docs/phase3-p3-4-plan.md` §20.8)、(2)上記項目P本文(G1a′: resolver新設・production baseline単一出典・二層命名・単一出典契約・beginRun合流・G1a′ゲート新設)の2つ。V2ラボ/診断モードの直接編集値が素材走行へ影響しなくなるという挙動変更(§3参照)を含む。

**人間プロジェクトリードが2026-08-16、次の単一定型文でご返信のうえ明示承認済み(Suu_mot3中継確認済み)**:

> 補足裁定判定文全体（Q1〜Q8・S-1〜S-10・N-1〜N-3）と項目Pを承認します。

これにより判定文§9の二対象(判定文全体・項目P)がいずれも発効した。Suu_mot3独立照合で発見された要修正9点のdocs-only反映もSuu_mot3が再照合し通過、docsゲートを正式通過とした。**G1a′実装(resolver・baseline構築関数)が解禁され、alice_mot3が実装、Suu_mot3照合(P1〜P3是正+精度追補の3ラウンド)を経た。**

**追補P-1**(新規・2026-08-16承認済み): G1a′実装レビューの過程で、G1a′完了条件(S-1〜S-10全充足)と§3.1のG1b着手条件(G1a′完了後)が循環していることが発見され、arbiterへ追加裁定(Q9)を依頼した。arbiterはS-5/N-2後半をG1bへ移管する裁定(契約不変・検証時期のみ変更)を下し、**人間プロジェクトリードが2026-08-16、次の単一定型文でご返信のうえ明示承認済み(Suu_mot3中継確認済み)**:

> P3-4追加裁定Q9判定文全体（S-5/N-2後半のG1b移管および項目P追補P-1を含む）を承認します。

これによりQ9は発効した。**2026-08-16、Suu_mot3独立照合(P4〜P8是正込み)を経てG1a′は正式通過した。G1bはbrabitのUI計画Q9同期+Suu_mot3クロスレイヤ照合通過が着手の前提条件として残る。**

**項目Q**(新規・**2026-08-18承認済み**): G1b着手時に、config構築(8段順)とrunSequence発行のクロスストア原子的境界がどの承認済み計画にも定義されていないことが判明した(brabit_mot3実測、2026-08-16)。設計案2版の差し戻しとSuu_mot3事前照合21点(P1〜P21)を経て`docs/phase3-p3-4-g1b-atomic-boundary-review-request.md`をarbiter_mot3へ正式提出し、**2026-08-18に追加裁定Q10(条件付き承認)**を受けた——A1・A2いずれも不採用とし第3案A3(commit後capture+`try/catch`+runtime専用3フィールドの明示nullリセット+`snapshotCaptureFailed`新設)を採用、UI契約(a)の再openは不要と裁定された。続けて§8ブロッキング指摘(`isFiniteMaterialComposedBase`が実在せずG1bがコンパイルできない)の解消についてalice_mot3が設計回答v2を提出し、同日**§8補足裁定(条件付き承認)**を受けた——`validateMaterialComposedBase`(`src/materials/recipeKey.ts`、alice所有)として確定し、`effectiveTurnsRatio`のResult拒否も確定、条件としてP-Q10-A3(配置決定)の本バンドルからの除外が課された。両判定文の全文は`docs/phase3-plan-v12-amendments.md`の`P3-4-Q10`エントリ(改訂20)を参照。**人間再承認の対象は公開契約と拒否挙動に限定し、P-Q10-A2(内部リファクタ、公開面の増分なし)・P-Q10-A3(配置決定)は記録のみで再承認対象外とする**(P3-1-Q2・P3-1-Q7の先例と同型)。

人間プロジェクトリードによる承認は、次の単一定型文でのご返信をお願いします:

> P3-4追加裁定Q10判定文全体（A3採用・`snapshotCaptureFailed`新設）および§8補足裁定判定文全体と、項目Q（brabit担当分の新規公開契約およびalice担当分P-Q10-A1・A4・A5）を承認します。

**人間プロジェクトリードによる承認(2026-08-18、Suu_mot3中継確認済み)**: 次の単一定型文で明示承認された(原文どおり、要約なし):

> P3-4追加裁定Q10判定文全体（A3採用・snapshotCaptureFailed新設）および§8補足裁定判定文全体と、項目Q（brabit担当分の新規公開契約およびalice担当分P-Q10-A1・A4・A5）を承認します。

**これによりQ10本裁定(§9)・§8補足裁定の効力発生条件(人間承認)および項目Qの人間再承認はいずれも充足した。**

**承認後に残る条件**: (i) `validateMaterialComposedBase`のalice_mot3による実装と、alice v2 §9のテスト(特に#4「件数固定(公開APIのみ)」・#5「双方向同期」)の**全文出力・終了コードを伴う完了報告**(要約報告は禁止)、(ii) Suu_mot3によるG1bの明示解禁指示。**Q10旧§1〜§7の条件はいずれも補足裁定によって変更・免除されず、すべて有効なまま継続する。** production配線・feature gate切替・commit/tag/pushは、上記2点が揃うまで引き続き禁止。
