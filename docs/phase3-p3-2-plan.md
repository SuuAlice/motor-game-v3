# P3-2詳細実装計画: D04(リポ経路)+D07(三段開示骨格)+store統合

作成: alice_mot3(2026-08-08、v13)。本書はdocs/phase3-plan-v12.md §12「P3-2: D04(リポ経路、短絡+過放電)+D07(三段開示骨格)+store統合」を実装可能な水準まで詳細化した自己完結計画である。**本書のみを読めば実装内容・契約・DoDを検証できることを目標とし、旧版(v1〜v12)の参照や「変更なし」「継続」等の省略記述を用いない。凍結型は本文中に全文を再掲する。**

**v6以降は正式Fable技術レビュー(2026-08-08、人間プロジェクトリード直接提示、Suu_mot3が全文を`docs/phase3-p3-2-fable-review.md`へ保存済み——`docs/phase3-fable-review.md`はP3-1向け正式回答の保存先であり、P3-2向け正式回答は別ファイルである。両者を区別する事実記録であり、いずれも待ち状態ではない)の必須修正2点・Q1〜Q12全裁定・付帯条件6点をすべて確定として反映した版である。以降、本書に「案(a)/案(b)」「未確定」「Fableへ確認」という表現は残さない(人間再承認バンドル6項目のみ、値・型の細部は人間承認後に機械的に執行する)。**

**承認手順**: 計画(本書)→Suu_mot3最終照合→**正式Fableレビュー通過済み(v5に対して)**→人間再承認バンドル6項目の承認(済み)→実装(ゲート0〜9、11節)→`npm run test && npm run build && npm run lint`→報告。commitは人間承認後のみ。**ゲート0〜4(AGENTS/CLAUDE同期・型契約+validator・materialMapping写像・状態機械+deriveDegradationDiffs・実効config)はSuu_mot3最終照合を通過済み(2026-08-08)。v12はゲート5着手前検査でSuu_mot3が発見した依存順の残り1件(`buildVehicleFrameInput`のゲート6→5前倒し)を反映したが、Suu_mot3のv12差分照合で本文中に旧配置("ゲート4→5"という誤記)・事実誤記(`computeEnergyBudgetJ`のexport化時期の記述がv10以後の現契約と不整合)が2点残っていることが指摘された。本書v13はこの2点のみを訂正するdocs-onlyの改訂である(11.5節・8節参照)。ゲート5のSuu_mot3照合が通るまで、ゲート5のproduction/test編集・commit・tag・pushは一切行わない。これは承認済み契約・初期候補値・受け入れ条件・最終DoD(10節)の変更ではなく文言の是正であるため、Fable再提出・人間再承認は不要(Suu_mot3裁定)。**

---

## 0. 参照実査結果

### 0.1 読んだdocs

- `docs/spec.md` §4.2(素材ファミリー: 電池・磁石)・§4.8(エネルギー予算)・§4.10(コース区間)・§7.1(破壊モード一覧)・§7.1.1(発火後の物理と競合規則)・§7.3(不可逆ダメージの三段開示)・§7.4(温度の表現規約)・§7.5(結果反映と永続化の境界)・§8.2(ディレクトリ構成)・§12(フェーズ計画)・§14(定数・データ一覧)
- `docs/art-spec.md` §第一条(内製主義・演出の抑制)・§2.3・§5.2・§6
- `docs/handoff.md` §2〜§5
- `docs/phase3-plan-v12.md`(全節)
- `docs/phase3-plan-v12-amendments.md`(全節、P3-1-Q1の確定文言を含む)
- `docs/phase3-p3-1-plan.md`(v11、確定版)
- `docs/phase3-p3-1-implementation-report.md`・`docs/phase3-p3-1-fable-final-review.md`
- `docs/phase3-ui-autopsy-plan-v5.md`
- `docs/phase3-fable-review.md`(P3-1向け正式回答の保存先)
- `docs/phase3-p3-2-fable-review.md`(P3-2向け正式回答の保存先。Suu_mot3が2026-08-08に保存済み。本書v6以降は同ファイルの確定裁定を全文反映する)

### 0.2 読んだ実コード(ファイル・関数・行番号を明記)

- **`src/engine/destructionModes.ts`(全354行を通読)**: `DestructionModeId`・`FireExposureRole`・`FireExposureProfile`・`validateFireExposureProfile`・`DestructionRunContext`・`BatteryDestructionConfig`(lipo/nonLipoの判別union)・`GearBreakageProfile`・`DestructionConfig`・`DestructionSharedSignals`・`D01Progress`〜`D09Progress`・`BatteryDestructionProgress`・`DestructionState`・`createInitialDestructionState`・`DestructionFrameInput`・`TemperatureReading`・`CauseLogCommon`・`D01CauseLog`〜`D09CauseLog`・`PhysicsSnapshotAtT`・`UnstampedDestructionEvent`・`DURATION_COMPARISON_EPSILON_S = 1e-9`・`advanceD01`・`advanceD03`・`advanceDestructionState`本体を1行単位で確認した(2節に全文引用する)。
- **`src/engine/destructionOrchestration.ts`(全802行を通読)**: `DegradationDiff`・`DestructionEvent`・`RunAccumulator`・`createRunAccumulator`・`PhysicsEndStatus`・`RunEndSignal`・`RunOutcome`・`finalizeDestructionRun`・`convertPhysicsEndStatusToEndReason`・`finalizeRun`・`deriveDegradationDiffs`(135-174行目、シグネチャ`(events: readonly DestructionEvent[], _finalDestructionState: DestructionState): readonly DegradationDiff[]`——**`DestructionConfig`を受け取らない**)・`DestructionConfigDraft`・`InvalidConfigField`・`ValidateDestructionConfigResult`・`validateDestructionConfig`(210-275行目、d04専用の分岐は存在しない)・`RunSnapshot`(281-292行目)・`captureRunSnapshot`(310-323行目、`structuredClone`による深いコピー)・`RestoredRunSnapshot`・`restoreRunSnapshot`(630-704行目、正式M2必須検証662-671行目)・`classifyTerminalModes`(722-732行目)・`stampPhysicsSnapshot`・`buildMotorOnlyFrameInput`(745-758行目)・`stepMotorWithDestruction`(772-801行目、正式Fable裁定P3-1-Q9-2「Phase 3 wrapper共通不変条件」の実装)を1行単位で確認した。
- **`src/engine/vehiclePhysics.ts`**: `FailureCode = 'failureToStart' | 'energyExhausted'`(83行目)・`VehicleSimState`(92-118行目、`status: 'ready'|'running'|'finished'|'stalled'|'derailed'|'overheated'`)・`TrackFrameInputs`(122-128行目、`forcePowerOff?: boolean`)・`stepVehicle`(369行目〜、シグネチャ`(motorConfig, carConfig, state, dt, rng, slopeRad=0, trackInputs: TrackFrameInputs={})`、388-390行目でD01の恒久ペナルティ`coilCollapsePenaltyMm`を`axisOffsetMm`へ注入する既存パターン`effectiveMotorConfig = {...motorConfig, axisOffsetMm: motorConfig.axisOffsetMm + state.coilCollapsePenaltyMm}`、396行目`evaluateMotorFrame(effectiveMotorConfig, state.motor, rng, trackInputs.forcePowerOff ?? false)`)・`status`確定ロジック(649-665行目付近、`derailed`は`hasCurve && nextDerailDurationS >= DERAIL_DETECTION_TIME_S`かつ`hasCurve = trackInputs.curveRadiusM !== undefined && trackInputs.curveRadiusM > 0`)・`evaluateCourseCompletion`(697行目)・**`stepTestRun`(706-717行目、シグネチャ`(motorConfig, carConfig, state, dt, courseLengthM, rng=Math.random, slopeRad=0): VehicleSimState`、716行目`stepVehicle(motorConfig, carConfig, state, dt, rng, slopeRad)`——`slopeRad`は実際に受け取り`stepVehicle`へ実際に渡す引数である。既存`gameStore.ts`の呼び出しは`slopeRad`を省略〈既定0〉している)**。
- **`src/engine/motorPhysics.ts`**: `MotorConfig.batteryInternalResistanceRatio?: number`(65行目、既定1.0)・`resolveBatteryInternalResistanceRatio(config)`(149-150行目、`config.batteryInternalResistanceRatio ?? 1`)・`resolveEffectiveBatteryInternalResistance(config)`(193-194行目、`computeBatteryInternalResistance(config.batteryVoltage) * resolveBatteryInternalResistanceRatio(config)`)、これが電流計算(302行目)・電池発熱計算(488行目)の2箇所で一貫して使われる(190行目コメント)。
- **`src/engine/trackPhysics.ts`**: `TrackDefinition.hasEnergyBudget?: boolean`(52行目)・`resolveBatteryCapacityRatio`(165-167行目)・`computeEnergyBudgetJ`(169-172行目、**非export**。`base(batteryVoltageのみに依存) × resolveBatteryCapacityRatio(config)`——**`batteryInternalResistanceRatio`を一切参照しない**。したがって`composeEffectiveMotorConfig`がD04用に`batteryInternalResistanceRatio`だけを書き換えても`computeEnergyBudgetJ`の値は不変であるはずで、この不変性を予算不変性テストとして固定する、10節)・`stepTrackRun`(178-228行目、204行目`forcePowerOff = track.hasEnergyBudget===true && state.energyUsedJ >= computeEnergyBudgetJ(motorConfig)`、225行目`failureCode = forcePowerOff && result.status==='stalled' ? 'energyExhausted' : result.failureCode`——**`'energyExhausted'`はこの1箇所でのみ代入され、`vehiclePhysics.ts`のどこにも代入されない**)。
- **`src/materials/materialMapping.ts`**: `mapBatteryDestructionProfile`(384-386行目)・`mapD03DestructionConfig`(424-431行目、電池素材IDから`BatteryDestructionConfig`(nonLipo枝)を返す既存パターン。D04/D07の写像関数はこのパターンを踏襲する)・`GearMaterialId`/`MagnetMaterialId`/`WireMaterialId`/`BatteryMaterialId`(20-23行目、`export type X = (typeof X_MATERIALS)[number]['id']`という既存パターンでexportされている。`BodyMaterialId`は`src/materials/inventoryItem.ts`17-23行目でのみ定義され`materialMapping.ts`からはexportされていない——`mapBodyScorchDeltaFraction`新設に伴い、同じパターンで`materialMapping.ts`へ`BodyMaterialId`のexportを追加する)。
- **`src/store/notebookStore.ts`**: `ExperimentSession`(`id`・`startedAt`・`endedAt`・`config`・`seed`・`steadyRpm`・`averageCurrent`・`maxCurrent`・`currentRatio`・`rpmVariation`・`maxBatteryHeat`・`events`・`samples`)の全フィールドを確認した。`recipeCode`・`lapTimeS`・`topSpeedMps`はいずれも存在しない。
- **`src/store/runOutcomeApplication.ts`**: `VehicleTestRunNotebookRecord`(`id`・`savedAt`・`motorConfig`・`carConfig`・`seed`・`status`・`elapsedTimeS`・`positionM`・`energyUsedJ`・`energyBreakdown`・`samples`)・`CourseRunNotebookRecord`(同型+`trackId`)・`PendingNotebookRecord`(3腕判別union)の全フィールドを確認した。いずれの腕にも`DestructionState`・`causeLog`・`stage`に相当するフィールドは存在しない。`EquipmentLoadout`(`rotorAssemblyId`・`batteryItemId`・`brushItemId`・`magnetItemId`・`gearItemId`・`bearingAssemblyId`・`bodyAssemblyId`)・`EquipmentIdSnapshot`(context判別union)も同ファイルに定義されている。**`rg -rn "FireExposureProfile\b" src --include="*.ts"`実査の結果、`FireExposureProfile`を`EquipmentLoadout`/`EquipmentIdSnapshot`から導出する既存の production 関数は存在しない**(`destructionModes.ts`/`destructionOrchestration.ts`が型定義・validatorを持つのみ)。3.4節で新設する`deriveFireExposureProfileFromLoadout`はこの空白を埋める新規関数である。

### 0.3 発見した事実

1. **D04/D07の型契約はP3-0/P3-1で既に凍結済み**(`D04Progress`・`D07Progress`・各`CauseLog`・`DestructionConfig.d07`・`BatteryDestructionConfig`のlipo枝・`UnstampedDestructionEvent`のD04/D07バリアント・`DegradationDiff`のmagnet/body scorch+demagnetizationバリアント、いずれも既存)。P3-2の実質スコープは「既存型を満たす判定ロジック(`advanceD04`/`advanceD07`)と差分変換の実装」である。
2. **`deriveDegradationDiffs`は`DestructionConfig`を受け取らない**(0.2節)。較正値由来のdeltaFraction値は、`advanceD04`/`advanceD07`が発火時点で`UnstampedDestructionEvent`へ埋め込む設計とする(**正式Fable Q5裁定、確定**)。
3. **`computeEnergyBudgetJ`は既に実装済みだが非export**であり、`src/engine/__tests__/trackPhysics.test.ts`にPhase 2 Step5b時点の「非exportのまま」という古いコメントが残っている(export化の事実へ訂正する、コメントのみ)。
4. **`stepMotorWithDestruction`(P3-1で既にcommit・タグ`p3-1-complete`済み)の内部改修は、v12 §3.2が定める「実効configはwrapper内部で毎step合成する」という凍結契約の履行であり、契約変更ではない**(**正式Fable Q10裁定、確定**——P3-1時点では合成対象モード〈D04/D07〉が実装されていなかったため単に素通しになっていただけである)。
5. **D01の恒久劣化は現在「衝突時に固定量`COIL_DEFORM_PENALTY_MM`を一度だけ加算する」設計であり、spec §7.1.1が要求する「実効巻数・占積が漸減、振動増、走行継続」という漸減物理は未実装である**(`vehiclePhysics.ts`576行目`nextCoilCollapsePenaltyMm = justCollapsed ? state.coilCollapsePenaltyMm + COIL_DEFORM_PENALTY_MM : state.coilCollapsePenaltyMm`——衝突後は増加しない)。**正式Fable Q12裁定(確定)**: D01漸減の実装はP3-3のまま据え置く。ただし「D01は車体層専用パターンでありcomposeEffectiveMotorConfigの対象外」という整理は誤りと訂正された——spec §7.1.1の「実効巻数・占積の漸減」はトルク定数・抵抗というモーター層の量であり、`composeEffectiveMotorConfig`の対象そのものである。P3-3送りの正当な理由は層の違いではなくスコープ規律(P3-2は既に本フェーズ最大のステップ)であり、「機構〈`composeEffectiveMotorConfig`〉はP3-2で導入済み、P3-3での回収はD01分岐の追加+較正sweepに縮小する」という形でP3-1-Q1台帳へ追記する(`docs/phase3-plan-v12-amendments.md`)。
6. **`RunSnapshot.track`は`motor-only`(`context==='motor'`)と`vehicle`文脈のtest-run相当(`context==='vehicle'`かつ`track===null`)の両方でnullになりうる**。正式M2必須検証(`restoreRunSnapshot`662-671行目)は`context==='vehicle'`分岐で`carConfig`/`initialVehicleState`の非null性のみを検査し、`track`のnull性そのものは制約しない。**正式Fable Q6裁定(確定)**: `courseLengthM`・`slopeRad`を既存構造+交差検証で追加する案(旧v5案A)を採用する。判別union化(旧v5案B)は`DestructionRunContext.context`と意味の重複する第二の判別子を作り、P3-1-Q9が塞いだ「同じ事実を二経路から入力できる」穴の型版を再導入するため不採用。

### 0.4 brabit監査結果の実体化

P3-2は**UI production変更をゼロとする**(1節の非対象どおり、`gameStore.ts`・UIコンポーネントは一切変更しない)。P3-4で実装が必要になるUI項目は、`docs/phase3-ui-autopsy-plan-v5.md`が既に規定している次の各点である(P3-2はこれらのUI実装を一切行わない、契約の存在確認のみを行う):

- D04の`affectedRoles`表示、磁石延焼の性能一本化表示(M5(i))、電池膨張の非恒久表示(M5(ii)。本計画3.5節・9節で契約自体を再設計する)
- D07の熱ゲージ表示(`uncalibratedGauge`/`unavailable`2状態限定)、および「減磁は見た目に出さない」(art-spec §第一条、UI側は演出を追加しない)
- 三段開示段階2(regressionDiff)の実行タイミング・UI表示(本計画4.5節、alice所有の純関数実装のみがP3-2スコープ)
- 三段開示段階3(ガウスメーター)全体(P3-2非対象)

**UI v5・過去中間文書の扱い**: `docs/phase3-ui-autopsy-plan-v5.md`本文中に残る古い状態注記(Fable未提出等の記述)は、2026-08-02にalice_mot3が自己生成した文書を正式Fableレビュー回答と誤認・保存・中継した事故(以下「偽Fableレビュー事故」と呼ぶ。当該事故はSuu_mot3・人間PMにより検出・訂正済みで、`AGENTS.md`/`CLAUDE.md`にpitfalls#1として恒久ルール化されている)以前の記述を含みうる。本計画は、正式Fable最終回答(P3-1向け: 2026-08-02T05:05到着、`docs/phase3-fable-review.md`。P3-2向け: 2026-08-08到着、`docs/phase3-p3-2-fable-review.md`)およびその後の人間承認済み各裁定のみを正式な根拠として扱い、UI v5内の古い状態注記や真正性が疑わしい中間文書(`docs/phase3-fable-action-items.md`等)を根拠にしない。

---

## 1. スコープ確定

### 1.1 対象・非対象

- **対象**:
  - `src/engine/destructionModes.ts`: `advanceD04`・`advanceD07`の実装(2.2節・2.5節)
  - `src/engine/destructionOrchestration.ts`: `composeEffectiveMotorConfig`新設(2.0節)、`stepMotorWithDestruction`の内部改修(2.1節)、`deriveDegradationDiffs`拡張(2.4節)、`stepTestRunWithDestruction`本体・`buildVehicleFrameInput`新設(5節)、`RunSnapshot`関連の拡張(5.2節)、`computeEnergyBudgetJ`のimport/re-export
  - `src/engine/trackPhysics.ts`: `computeEnergyBudgetJ`へ`export`キーワードを追加する(関数本体は無改修)
  - `src/engine/__tests__/trackPhysics.test.ts`: Phase 2 Step5b時点の「非exportのまま」という古いコメントを、export化の事実へ訂正する(アサーション本体は無改修)
  - `src/materials/materialMapping.ts`: D04/D07較正値の写像(`mapD04BatteryDestructionConfig`・`mapBodyScorchDeltaFraction`・`mapMagnetScorchDeltaFraction`・`mapD07DestructionConfig`、8節)
  - `src/materials/regressionDiff.ts`(新規): 三段開示段階2の骨格(純関数+単体テストのみ、4.5節)
  - `src/store/__tests__/runOutcomeApplication.test.ts`・`src/store/__tests__/saveStore.test.ts`: D04/D07・`RunSnapshot`拡張を含むfixture統合テスト(9節)
  - `docs/phase3-plan-v12-amendments.md`: P3-2-Q1〜Q12エントリ+P3-1-Q1返済記録の追補は、v6 docsゲート(本改訂)の時点で既に追記済み(改訂4)。ゲート9(11.9節)では実装完了後の実装状態証跡(実ファイル・実テスト名等)のみを追補する
- **非対象(P3-0正式Q2裁定、P3-4完了時まで一切行わない)**: `gameStore.ts`・`gameStore.test.ts`への一切の変更、`stepTrackRunWithDestruction`(production版track-runラッパー)の新設、D02/D05/D06/D09の状態機械分岐、UIの破壊演出全般、Q9(ii)で確定した`finalDestructionState`フィールドの型変更実装(方針確定のみP3-2、実装はP3-4)
- **人間試遊不可の明記**: production向け`DestructionConfig`の実配線・人間試遊は、正式Fable裁定P3-0-Q2どおりP3-4まで行わない。本計画で実装するすべての契約はfixtureベースの統合テストでのみ検証する。

### 1.2 store統合の実体

P3-2の「store統合」は`gameStore.ts`本体の変更を意味しない。`src/store/__tests__/runOutcomeApplication.test.ts`・`src/store/__tests__/saveStore.test.ts`内で、実際の`captureRunSnapshot`/`restoreRunSnapshot`/`stepTestRunWithDestruction`/`applyRunOutcome`を手構築のfixtureデータで直接呼び出し、D04/D07を含む契約が実行時に正しく成立することを検証する。P3-1の`runOutcomeApplication.test.ts`60〜63番テスト(D01/D03を対象に、motor-only/test-run/track-runの3文脈それぞれで有効な`RunSnapshot`を構築し、`captureEquipmentIdSnapshot`を文脈対応で呼び分け、単一`applyRunOutcome`呼び出しの結果を検証する構造)と同一のtable駆動パターンを、D04/D07を含む形へ拡張する。

---

## 2. 型・関数の完全シグネチャ

### 2.0 実効config合成(D04内部抵抗悪化+D07 B低下、motor-only/vehicle文脈の両方に適用)

v12 §3.2「D02/D04/D07の実効config合成」は、`vehiclePhysics.ts`のD01用パターン(0.2節、`effectiveMotorConfig = {...motorConfig, axisOffsetMm: effective}`)と同型に、**destructionStateの純関数として毎stepラッパー内で合成する**ことを定めている。D01のこのパターンは`stepVehicle`内部にあり車体層(`axisOffsetMm`)専用であるのに対し、D04(電池内部抵抗)・D07(磁石強度)はいずれも`MotorConfig`のフィールドであり、**motor-only文脈(`stepMotorWithDestruction`)でもvehicle文脈(`stepTestRunWithDestruction`)でも同じ`MotorConfig`合成が必要になる**(D04短絡経路・D07はいずれもmotor-onlyの`SimState`から得られる量だけをトリガ条件にできるため、両文脈で発火しうる。3.1節)。この共通合成を新設のヘルパー1関数に集約し、両ラッパー・M4 test-only harness(3.3節)から呼ぶ。

**係数の唯一の出典は`DestructionConfig`である。** `accumulator.replaySnapshot.destructionConfig`という既存の単一出典(P3-1-Q9-2が確立した原則)からそのまま渡す。

```ts
// src/engine/destructionOrchestration.ts に新規追加。両ラッパー(stepMotorWithDestruction・
// stepTestRunWithDestruction)・M4 test-only harness(3.3節)から呼ぶ共有ヘルパー。
/**
 * config合成純関数。production wrapperは内部で使用する。合成結果は保存・表示・wrapper外の
 * 走行入力へ二重供給しない(リプレイは元configから毎回再計算する)。決定論的純関数であることを
 * DoDで検証する(10節)。
 *
 * 単体テスト(付帯条件1の予算不変性テスト等)から直接呼び出せるようexportする(v11改訂、
 * Suu_mot3裁定): 新設純関数の可視性追加であり、既存公開契約の変更ではない
 * (`classifyTerminalModes`のexport化と同型)。Fable再提出・人間再承認は不要。
 */
export function composeEffectiveMotorConfig(
  baseMotorConfig: MotorConfig,
  destructionState: DestructionState,
  destructionConfig: DestructionConfig,
): MotorConfig {
  let effective = baseMotorConfig;

  // D04(正式Fable Q1裁定、確定): swelling/smokingで係数を区別しない(段階差は物理的に
  // 実在するが、区別を支える較正根拠がなく、smokingは滞在時間も短い)。単一係数
  // internalResistanceDegradationMultiplier(既存batteryInternalResistanceRatioへの
  // 乗数であることを名前で示す、「Ratio」の重複を避ける)を掛ける。
  if (destructionState.battery.profile === 'lipo' && destructionConfig.battery.profile === 'lipo') {
    const stage = destructionState.battery.d04.stage;
    if (stage === 'swelling' || stage === 'smoking') {
      const degradedRatio = (baseMotorConfig.batteryInternalResistanceRatio ?? 1) * destructionConfig.battery.internalResistanceDegradationMultiplier;
      effective = { ...effective, batteryInternalResistanceRatio: degradedRatio };
    }
  }

  // D07(正式Fable Q2・Q3裁定、確定): 合成順序は乗算の可換性により意味を持たない
  // (「順序に意味があるかのようなコメント」は残さない)。実効B = base × (1−不可逆分) ×
  // 可逆分の単一式で書く。不可逆到達後もダレ係数は重畳適用する(熱い磁石は恒久損傷後も
  // 熱い)。翌セッションの恒久分はWearState.demagnetizationFraction経由でbase
  // (materialMapping.tsのmagnetStrength較正)へ既に織り込み済みという層分離は現設計どおり
  // (このcomposeは同一セッション内で新たに不可逆到達した瞬間からの即時反映のみを担う)。
  if (destructionConfig.d07.irreversible.kind === 'demagnetizing') {
    const d07 = destructionState.modes.D07;
    const irreversibleMultiplier = d07.irreversibleTriggered ? (1 - destructionConfig.d07.irreversible.demagnetizationDeltaFraction) : 1;
    const reversibleMultiplier = d07.reversibleDroopActive ? destructionConfig.d07.irreversible.reversibleDroopMultiplier : 1;
    if (irreversibleMultiplier !== 1 || reversibleMultiplier !== 1) {
      effective = { ...effective, magnetStrength: baseMotorConfig.magnetStrength * irreversibleMultiplier * reversibleMultiplier };
    }
  }

  return effective;
}
```

**付帯条件1(予算不変性テスト、確定)**: `composeEffectiveMotorConfig`は`computeEnergyBudgetJ`が消費するフィールド(`batteryVoltage`・`batteryCapacityRatio`)を一切変更しない。合成前後で`computeEnergyBudgetJ(baseMotorConfig)`と`computeEnergyBudgetJ(composeEffectiveMotorConfig(...))`が常に一致することをテストで固定する(現時点では無害だが、将来の合成対象追加で静かに壊れる箇所を先に封じる)。

### 2.1 `stepMotorWithDestruction`の内部改修(既存commit済み関数、公開シグネチャ不変、人間再承認不要)

P3-1で実装・commit済み(`65a765a`)・タグ`p3-1-complete`済みの`stepMotorWithDestruction`は、現状次のとおりである(`destructionOrchestration.ts`772-801行目、実装済み全文):

```ts
export function stepMotorWithDestruction(
  motorState: SimState,
  accumulator: RunAccumulator,
  dt: number,
  rng?: MotorStepRng,
  loadTorque?: number,
  effectiveInertia?: number,
): DestructionStepResult<SimState> {
  const config = accumulator.replaySnapshot.motorConfig; // 唯一の出典(P3-1-Q9-2)
  const destructionConfig = accumulator.replaySnapshot.destructionConfig; // 唯一の出典(P3-1-Q9-2)
  const physicsState = step(config, motorState, dt, rng, loadTorque, effectiveInertia); // 既存、無改修
  const frame = buildMotorOnlyFrameInput(config, motorState, physicsState); // 同一のconfigを使用(P3-1-Q9-2)
  const { state, events } = advanceDestructionState(
    accumulator.destructionState, frame, destructionConfig, accumulator.replaySnapshot.runContext, dt,
  );
  const snapshot: PhysicsSnapshotAtT = { context: 'motor', state: physicsState };
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
    : null;
  return { physicsState, accumulator: nextAccumulator, termination };
}
```

D04短絡経路・D07はいずれもmotor-only文脈で発火しうる(3.1節)ため、この関数はD04/D07発火後も常に`baseMotorConfig`をそのまま`step()`へ渡し続けており、実効config合成を経由しない。P3-2で次のとおり改修する(公開シグネチャ=引数の型・戻り値の型は一切変更しない。挙動のみ変わる):

```ts
export function stepMotorWithDestruction(
  motorState: SimState,
  accumulator: RunAccumulator,
  dt: number,
  rng?: MotorStepRng,
  loadTorque?: number,
  effectiveInertia?: number,
): DestructionStepResult<SimState> {
  const baseConfig = accumulator.replaySnapshot.motorConfig; // 唯一の出典(P3-1-Q9-2、不変)
  const destructionConfig = accumulator.replaySnapshot.destructionConfig; // 唯一の出典(P3-1-Q9-2、不変)
  const config = composeEffectiveMotorConfig(baseConfig, accumulator.destructionState, destructionConfig); // 新規(2.0節)
  const physicsState = step(config, motorState, dt, rng, loadTorque, effectiveInertia); // 実効configを使用
  const frame = buildMotorOnlyFrameInput(config, motorState, physicsState); // 同じ実効configを使用(既存規約を維持)
  const { state, events } = advanceDestructionState(
    accumulator.destructionState, frame, destructionConfig, accumulator.replaySnapshot.runContext, dt,
  );
  // 以降(snapshot・stampedEvents・nextAccumulator・termination組み立て)は無改修。
  const snapshot: PhysicsSnapshotAtT = { context: 'motor', state: physicsState };
  const stampedEvents = stampPhysicsSnapshot(events, snapshot);
  const nextTerminalModeCandidates = [...accumulator.terminalModeCandidates, ...classifyTerminalModes(events)];
  const nextAccumulator: RunAccumulator = {
    ...accumulator, destructionState: state,
    events: [...accumulator.events, ...stampedEvents],
    terminalModeCandidates: nextTerminalModeCandidates,
  };
  const nonEmptyTerminalModes = asNonEmpty(nextTerminalModeCandidates);
  const termination = nonEmptyTerminalModes
    ? finalizeDestructionRun({ ...nextAccumulator, terminalModeCandidates: nonEmptyTerminalModes })
    : null;
  return { physicsState, accumulator: nextAccumulator, termination };
}
```

**正式Fable Q10裁定(確定)**: この改修は人間再承認を要しない——v12 §3.2の凍結契約(実効configはwrapper内部で毎step合成する)の履行であり契約変更ではない(P3-1時点では合成対象モードが存在しなかったため単に素通しになっていただけである)。P3-2計画自体の人間承認(通常ゲート)で足りる。**条件**: 既存P3-1テスト回帰+リプレイ等価テストの再実行(10節DoD)。

**回帰確認**: D01/D03のみが発火する既存P3-1テストケースでは、`destructionState.battery.d04`(存在する場合)・`modes.D07`がいずれも初期値のままであるため、`composeEffectiveMotorConfig`の合成条件はいずれも偽となり、`baseConfig`をそのまま返す。したがって**既存P3-1テストの結果は変化しない**ことを実装時に回帰テストとして確認する(10節DoD)。

### 2.2 `advanceD04`本体

**正式Fable Q4裁定(5項目、すべて確定)**:

1. `overDischargeActive`の毎フレーム再評価: 承認。stage突入時に一度だけ設定するのではなく、フレームごとに`frame.energyUsedRatio >= config.unsafeDischargeStartRatio`を再評価し続ける。
2. 段階タイマーの不可逆進行: 承認。**物理的正当化**: 「膨張は発生済みガスの存在であり、駆動条件の瞬断で巻き戻らない。熱慣性下の暴走進行は瞬間条件でなく段階で表現する」(2.3節)。
3. **混合原因の記録方針は案(b)を裁定**: `D04CauseLog`へ`initiatingCause: {shortCircuitDurationS: number; overDischargeRatio: number | null}`を新設する。既存の`causeLog.shortCircuitDurationS`/`overDischargeRatio`は**burning到達時点の瞬間値**と再定義する(到達時に短絡が既に解消済みなら`shortCircuitDurationS=0`が入る——それ自体が「発火の瞬間、短絡はもう存在しなかった」という正直な記録である)。理由: 案(a)(凍結値のみ・瞬間値へのfallback)は「短絡先行→過放電追加」は拾うが「過放電先行→短絡追加」を落とす非対称があり、検死・図鑑という本作の中核読み物で因果の半分が消える。`D04Progress.initiatingCauseLog`は「stage開始原因」を保持する凍結記憶域として維持する(命名: `stageEntryCauseLog`ではなく`initiatingCauseLog`)。
4. **stage/cause交差不変条件は3条すべてvalidatorで拒否する(確定)**: `stage==='none'` ⟺ `initiatingCauseLog===null`、`stage∈{swelling,smoking,burning}` ⟹ `initiatingCauseLog`非null、`triggered===true` ⟺ `stage==='burning' ∧ causeLog`非null。安価・全域的な検証であり、物理的に不可能な復元stateを存在させない。
5. **`affectedRoles`の重複禁止は案(a)を裁定**: `validateFireExposureProfile`へ重複拒否を追加する(既存公開validatorの受理契約の狭窄、人間再承認バンドル対象)。event組み立て時のSet化(案b)は「不正入力の無言修復」であり、「不正状態は検出でなく構築不能に、修復はしない」という本チームの原則に反するため不採用。production側の構築(単一loadoutからの導出で構造的に重複不能)を確認するテストを添える(3.4節)。

```ts
export interface D04Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning';
  stageEnteredAtT: number | null;
  overDischargeActive: boolean;
  initiatingCauseLog: { shortCircuitDurationS: number; overDischargeRatio: number | null } | null; // 新規(正式Fable Q4-3裁定、人間再承認バンドル対象)
  causeLog: D04CauseLog | null;
}

export interface D04CauseLog extends CauseLogCommon {
  batteryHeatRatio: number;
  shortCircuitDurationS: number; // burning到達時点の瞬間値(正式Fable Q4-3裁定)
  stage: D04Progress['stage'];
  overDischargeRatio: number | null; // burning到達時点の瞬間値(正式Fable Q4-3裁定)
  initiatingCause: { shortCircuitDurationS: number; overDischargeRatio: number | null }; // 新規、stage開始原因の凍結値(正式Fable Q4-3裁定、人間再承認バンドル対象)
}
```

**依存閉包(型拡張に伴う既存箇所への機械的追従、pitfalls#2)**: (1) `createInitialDestructionState`のlipo枝の初期`D04Progress`へ`initiatingCauseLog: null`を追加する。(2) `restoreRunSnapshot`の`validateD04ProgressShape`(既存、`destructionOrchestration.ts`496-505行目付近)へ、`initiatingCauseLog`の形状検証(`null`または`{shortCircuitDurationS: 有限数, overDischargeRatio: null|有限数}`)と、`D04CauseLog`形状検証への`initiatingCause`(非null、`{shortCircuitDurationS, overDischargeRatio}`)の検証を追加する。(3) 上記の3つの交差不変条件検証を追加する(unknown由来の復元であるため、型宣言だけでは実行時の不正値を防げない)。

```ts
// src/engine/destructionModes.ts に追加(具体的な係数・境界式は8節の較正確定後に確定する)

function advanceD04(
  prev: D04Progress,
  frame: DestructionFrameInput,
  config: Extract<BatteryDestructionConfig, { profile: 'lipo' }>,
  sharedShortCircuitDurationS: number,
  elapsedTimeS: number,
  runContext: DestructionRunContext,
): { next: D04Progress; event: UnstampedDestructionEvent | null } {
  // dtは本関数のいかなる分岐でも使わない(段階境界判定はelapsedTimeSの絶対値比較のみで
  // 行う、2.3節)。noUnusedParameters対策として引数自体を持たない(D01/D03の既存
  // advanceD01/advanceD03と同じく、dtを必要としない判定関数はdtを受け取らない)。
  if (prev.triggered) return { next: prev, event: null };

  // motor-onlyでは過放電経路を評価できない。frame.energyUsedRatioはvehicle文脈
  // (走行距離・エネルギー予算の概念を持つ)でのみ供給される値であり、motor-onlyの
  // DestructionFrameInputでは常にundefinedになる(buildMotorOnlyFrameInputの実装、
  // 2.1節)。motor-onlyで評価可能なのは短絡経路のみである、と一意に扱う。
  const overDischargeActiveNow = frame.energyUsedRatio !== undefined && frame.energyUsedRatio >= config.unsafeDischargeStartRatio;

  if (prev.stage === 'none') {
    const shortCircuitFired =
      sharedShortCircuitDurationS + DURATION_COMPARISON_EPSILON_S >= config.shortCircuitDurationLimitS
      && frame.batteryHeat >= config.runawayHeatThreshold;
    if (!shortCircuitFired && !overDischargeActiveNow) return { next: prev, event: null };
    return {
      next: {
        ...prev, stage: 'swelling', stageEnteredAtT: elapsedTimeS, overDischargeActive: overDischargeActiveNow,
        initiatingCauseLog: { shortCircuitDurationS: sharedShortCircuitDurationS, overDischargeRatio: overDischargeActiveNow ? (frame.energyUsedRatio ?? null) : null },
      },
      event: null,
    };
  }

  // 段階境界判定は2.3節のループへ委譲する(dt分割不変性を満たす実装)。
  const advanced = advanceD04StageBoundary(prev, config, elapsedTimeS);

  if (advanced.stage === 'burning' && prev.stage !== 'burning') {
    const affectedRoles: FireExposureRole[] = [];
    if (runContext.fireExposureProfile.bodyEquipped) affectedRoles.push('body');
    // adjacentRolesEquippedの重複はvalidateFireExposureProfileが構築時に拒否済み(正式
    // Fable Q4-5裁定)であるため、ここでの追加のSet化・重複排除は行わない。
    affectedRoles.push(...runContext.fireExposureProfile.adjacentRolesEquipped);

    // stage∈{swelling,smoking,burning}ならinitiatingCauseLogは非null(交差不変条件、
    // Q4-4裁定)。非nullアクセスはこの不変条件により安全である。
    const initiatingCause = prev.initiatingCauseLog!;
    const causeLog: D04CauseLog = {
      currentA: frame.currentA, rpm: frame.rpm, atT: elapsedTimeS,
      temperature: { kind: 'uncalibratedGauge', ratio: frame.batteryHeat },
      batteryHeatRatio: frame.batteryHeat,
      shortCircuitDurationS: sharedShortCircuitDurationS, // burning到達時点の瞬間値(Q4-3裁定)
      stage: 'burning',
      overDischargeRatio: overDischargeActiveNow ? (frame.energyUsedRatio ?? null) : null, // burning到達時点の瞬間値(Q4-3裁定)
      initiatingCause, // stage開始原因の凍結値(Q4-3裁定)
    };
    return {
      next: { ...advanced, triggered: true, triggeredAtT: elapsedTimeS, causeLog },
      event: { mode: 'D04', causeLog, isFirstThisSession: true, affectedRoles },
    };
  }
  return { next: { ...advanced, overDischargeActive: overDischargeActiveNow }, event: null };
}
```

### 2.3 段階境界判定(dt分割不変性、固定物理dt=1/120sのバッチング比較)

段階境界は「境界時刻ちょうどを次のstageの`stageEnteredAtT`とする」ことで、dtの余剰時間を切り捨てずに次の段階へ正しく繰り越す。1step内で複数境界(`swelling→smoking→burning`)を連続通過しうる場合(`stageDurations`がdtより短い極端な較正値の場合)に対応するため、`while`ループで最大2回まで進行させる。

```ts
function advanceD04StageBoundary(
  prev: D04Progress,
  config: Extract<BatteryDestructionConfig, { profile: 'lipo' }>,
  elapsedTimeS: number,
): D04Progress {
  let stage = prev.stage;
  let stageEnteredAtT = prev.stageEnteredAtT ?? elapsedTimeS;
  while (stage !== 'burning' && stage !== 'none') {
    const elapsedInStage = elapsedTimeS - stageEnteredAtT;
    const limit = stage === 'swelling' ? config.stageDurations.swellingS : config.stageDurations.smokingS;
    if (elapsedInStage + DURATION_COMPARISON_EPSILON_S < limit) break; // まだ境界未到達
    // 境界時刻ちょうど(stageEnteredAtT + limit)を次段階の起点とする。elapsedTimeSと
    // (stageEnteredAtT + limit)の差(dtの余剰分)は次のwhileループの反復でそのまま
    // 消費されるため、切り捨てられず正しく繰り越される。
    stageEnteredAtT = stageEnteredAtT + limit;
    stage = stage === 'swelling' ? 'smoking' : 'burning';
  }
  return { ...prev, stage, stageEnteredAtT };
}
```

**M-1是正(dt分割不変性のDoD定義、固定dt厳守)**: 「1/120s×N vs 1/240s×2N」という比較は**正典違反**である——固定物理dt=1/120秒(CLAUDE.md「物理タイムステップは固定1/120s」)、およびP3-1で確定した定義(「分割」とは1フレームあたりの物理step数のバッチングであり、dt値そのものの変更ではない)に反する。加えてD07の熱蓄積式(2.5節)はオイラー積分(`+ (…) × dt`)であり、dt値の変更に対して数学的に不変ではない——dt=1/240s比較は境界近傍の較正値で必ず偽の不一致を出すか、通ったとしても正典外の性質を検証することになる。

**正しい比較**: **dt=1/120秒に固定したまま**、「1フレームあたり1物理step×2Nフレーム」vs「1フレームあたり2物理step×Nフレーム」という**stepのバッチング方法だけを変える**比較を用いる(P3-1の`DURATION_COMPARISON_EPSILON_S`導入時と同じ検証思想、CLAUDE.mdの非機能要件「物理ステップは1フレームあたり最大2回まで」に対応する実際のバッチングパターン)。D04の段階境界判定(`elapsedTimeS`の絶対値比較)はこのバッチング方法の違いに対して構造的に不変だが、**テスト定義自体は全モード共通で正典(dt固定)に揃える**。

**離散的な結果(`stage`の最終値・`triggered`の真偽・発行された`event.mode`の集合)は分割方法に依存せず完全一致することを要求する。** `triggeredAtT`・`causeLog.atT`はいずれも「イベントが実際に発行されたstepの時刻」という同じ性質の値であり、バッチング方法の違いにより最大1物理step(=1/120s)の誤差を許容する統一基準とする。`events`配列の各eventの`physicsSnapshotAtT`は「そのイベントが実際に発行されたstepの物理状態」であることを検証する(**バイト単位の完全一致を無条件に要求しない**——これはP3-1の`DURATION_COMPARISON_EPSILON_S`導入時に確立した定義と同じ扱いである)。

**境界テスト(各stage境界の1フレーム手前・境界・1フレーム後)**: `stageDurations.swellingS`・`.smokingS`それぞれについて、正式Fable P3-1-Q3の359/360/361フレーム型パターンに倣い、境界フレームの1フレーム手前で未遷移、境界フレームで遷移、1フレーム後でも遷移済みのままであることを固定テストで検証する。

### 2.4 劣化量供給経路(正式Fable Q5裁定、確定)

**event埋め込み設計を承認する**——`deriveDegradationDiffs`のシグネチャ不変・単一出典からの一方向流・リプレイ整合、いずれも正しい。

1. `DestructionConfig`へ新規セクションを追加する(`d07`は4.3節の`{thermal, irreversible}`構成、`d04`が新規):
   ```ts
   export interface DestructionConfig {
     battery: BatteryDestructionConfig;
     d02: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
     d04: { bodyScorchDeltaFraction: number; magnetScorchDeltaFraction: number }; // 新規(人間再承認バンドル)
     d05: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
     d06: { breakage: GearBreakageProfile };
     d07: {
       thermal: { conductionCoefficient: number; dissipationCoefficient: number };
       irreversible: { kind: 'demagnetizing'; magnetHeatGaugeLimit: number; reversibleDroopThreshold: number; reversibleDroopMultiplier: number; demagnetizationDeltaFraction: number } | { kind: 'nonDemagnetizing' };
     }; // 新規(人間再承認バンドル)
     d09: { bearingSeizureGaugeLimit: number };
   }
   ```
2. `advanceD04`・`advanceD07`はいずれも該当する設定オブジェクトを引数として受け取る(`advanceD04`は`config: Extract<BatteryDestructionConfig,{profile:'lipo'}>`に加え`d04`セクション、`advanceD07`は`DestructionConfig['d07']`)ため、発火時点でこれらの値を`UnstampedDestructionEvent`へ埋め込める。
3. `UnstampedDestructionEvent`のD04/D07バリアントへフィールドを追加する:
   ```ts
   | { mode: 'D04'; causeLog: D04CauseLog; isFirstThisSession: true; affectedRoles: readonly FireExposureRole[]; bodyScorchDeltaFraction: number; magnetScorchDeltaFraction: number }
   | { mode: 'D07'; causeLog: D07CauseLog; isFirstThisSession: true; demagnetizationDeltaFraction: number }
   ```
4. `deriveDegradationDiffs`(シグネチャは無改修のまま)は`event.bodyScorchDeltaFraction`等を直接読み取って`DegradationDiff`を構築する:
   ```ts
   case 'D04':
     if (event.causeLog.stage === 'burning') {
       batteryConsumed = true;
       if (event.affectedRoles.includes('body')) diffs.push({ role: 'body', kind: 'scorch', deltaFraction: event.bodyScorchDeltaFraction });
       if (event.affectedRoles.includes('magnet')) diffs.push({ role: 'magnet', kind: 'scorch', deltaFraction: event.magnetScorchDeltaFraction });
     }
     break;
   case 'D07':
     if (event.isFirstThisSession) diffs.push({ role: 'magnet', kind: 'demagnetization', deltaFraction: event.demagnetizationDeltaFraction });
     break;
   ```

**単一出典→event/state→deriveDegradationDiffsの流れ**: `DestructionConfig.d04`/`.d07`(単一出典、`materialMapping.ts`が較正する)→`advanceD04`/`advanceD07`が発火時点でこの値を読み取り`UnstampedDestructionEvent`へ埋め込む→`deriveDegradationDiffs`(シグネチャ不変)が`event`から直接読み取る。リプレイ時も`accumulator.replaySnapshot.destructionConfig`という単一の出典から毎回同じ値が再生成されるため、合成後の値をシリアライズしないというv12の原則と整合する。

**変更対象**: `DestructionConfig`型(`destructionModes.ts`)・`validateDestructionConfig`/`validateDestructionConfigRawShape`(`destructionOrchestration.ts`、`d04`セクションの検証を新規追加、`d07`セクションを`{thermal,irreversible}`構成の検証へ全面拡張)・`UnstampedDestructionEvent`型(`destructionModes.ts`)・`advanceD04`/`advanceD07`(`destructionModes.ts`)・`deriveDegradationDiffs`(`destructionOrchestration.ts`)。`captureRunSnapshot`/`restoreRunSnapshot`は`DestructionConfig`全体を`structuredClone`/`validateDestructionConfig`経由で扱う既存実装のため、フィールド追加に対して構造的に自動追従する(個別のフィールド名を検査するコードの追加のみが必要)。

### 2.5 `advanceD07`本体(正式Fable Q2・Q3・Q11裁定、確定)

D07は三概念(熱ゲージ・可逆ダレ・不可逆減磁)を持つ(v12 §3、`D07Progress`型に対応: `magnetHeatGaugeRatio`・`reversibleDroopActive`・`irreversibleTriggered`)。

**熱ゲージの入力源(正式Fable Q11裁定、確定): 候補A(I²R/伝導)を採用する。** 物理的根拠: ブラシ付きDCモーターの磁石(固定子)の主要な熱源は電機子銅損の伝導であり、減磁リスクが最大になるのは失速・過負荷時(最大電流・最小回転)である——これは電機子反作用が磁石に直接対抗する条件とも一致する。候補B(rpm²、渦電流近似)は減磁を高速現象にしてしまい、実物と逆方向に誤るため不採用。蓄積式は既存`batteryHeat`の超過積分ファミリーと同型で一貫する:

```
nextRatio = clamp01(prev + (currentA² × conductionCoefficient − prev × dissipationCoefficient) × dt)
```

**磁石構造(正式Fable Q11裁定、確定): 候補(ii)を採用する。** `d07`を「熱蓄積(共通)+不可逆到達条件(判別union)」の2部構成へ再設計する(候補(i)の閾値1000は0〜1ゲージ規約、spec §7.4の違反であり不採用):

```ts
d07: {
  thermal: { conductionCoefficient: number; dissipationCoefficient: number }; // HUDの熱ゲージ表示は
  // 磁石の種類によらず常にこの共通thermalから計算できる——「事実上安全」な磁石でも
  // 熱ゲージ自体は表示可能であるべき(HUD読み取り専用境界、4.2節)。
  irreversible: { kind: 'demagnetizing'; magnetHeatGaugeLimit: number; reversibleDroopThreshold: number; reversibleDroopMultiplier: number; demagnetizationDeltaFraction: number } | { kind: 'nonDemagnetizing' };
}
```

**熱ゲージは不可逆到達後も常時更新する**(v12の凍結契約「熱ゲージは常時更新」「不可逆到達後も走行は継続する」に従う)。`prev.irreversibleTriggered`で早期returnして更新自体を止めてはならない——止めてよいのは`event`/`causeLog`の**再発行**だけである(`isFirstThisSession: true`という型どおり、不可逆到達eventは一度しか発行されない)。

```ts
// src/engine/destructionModes.ts に追加

function advanceD07(
  prev: D07Progress,
  frame: DestructionFrameInput,
  config: DestructionConfig['d07'], // {thermal, irreversible}の2部構成
  elapsedTimeS: number,
  dt: number, // 熱蓄積式が×dtの積分項を持つため使用する
): { next: D07Progress; event: UnstampedDestructionEvent | null } {
  // thermalはirreversible.kindによらず常に計算する(候補(ii)の構造)。0-1へclampする。
  const nextRatio = Math.min(1, Math.max(0, prev.magnetHeatGaugeRatio + (frame.currentA * frame.currentA * config.thermal.conductionCoefficient - prev.magnetHeatGaugeRatio * config.thermal.dissipationCoefficient) * dt));

  if (config.irreversible.kind === 'nonDemagnetizing') {
    // 熱ゲージ自体はHUD表示のため更新するが、不可逆到達判定自体を行わない。
    // 負例(正式Fable Q11裁定): nonDemagnetizing磁石ではいかなる入力でも
    // reversibleDroopActive/irreversibleTriggeredが真にならないことをテストする。
    return { next: { ...prev, magnetHeatGaugeRatio: nextRatio, reversibleDroopActive: false }, event: null };
  }

  const reversibleDroopActive = nextRatio >= config.irreversible.reversibleDroopThreshold;

  if (prev.irreversibleTriggered) {
    // 熱ゲージ・可逆ダレは不可逆到達後も更新を続ける。eventは再発行しない。
    return { next: { ...prev, magnetHeatGaugeRatio: nextRatio, reversibleDroopActive }, event: null };
  }

  if (nextRatio >= config.irreversible.magnetHeatGaugeLimit) {
    const causeLog: D07CauseLog = {
      currentA: frame.currentA, rpm: frame.rpm, atT: elapsedTimeS,
      temperature: { kind: 'uncalibratedGauge', ratio: nextRatio },
      magnetHeatGaugeRatio: nextRatio,
    };
    return {
      next: { magnetHeatGaugeRatio: nextRatio, reversibleDroopActive, irreversibleTriggered: true, irreversibleTriggeredAtT: elapsedTimeS, causeLog },
      // demagnetizationDeltaFractionはconfig.irreversible.demagnetizationDeltaFractionを
      // そのまま埋め込む(2.4節・2.0節の単一出典原則。ここで新しい値を発明しない)。
      event: { mode: 'D07', causeLog, isFirstThisSession: true, demagnetizationDeltaFraction: config.irreversible.demagnetizationDeltaFraction },
    };
  }
  return { next: { ...prev, magnetHeatGaugeRatio: nextRatio, reversibleDroopActive }, event: null };
}
```

**validator拡張**: `config.irreversible.kind==='demagnetizing'`の枝でのみ`reversibleDroopThreshold < magnetHeatGaugeLimit`および両者の0–1範囲を交差検証する。`kind==='nonDemagnetizing'`の枝では検証自体をスキップする。

**Q11の4つの受け入れ条件(sweepで確定、8節)**: (1) 通常運用でダレ閾値非到達。(2) 高負荷持続でレース内にダレ到達可能。(3) 意図的な持続過負荷構成で、不可逆到達がoverheated終端より先に可能であること(D04のM4条件と同型のD07到達可能性条件——これがないと図鑑のD07が原理的に到達不能なまま較正が通ってしまう)。(4) ゲージが0〜1にclampされること。

**Q2の独立したsweep受け入れ条件(確定、8節・10.6節)**: `reversibleDroopMultiplier=0.95`という係数値だけでなく、**可逆ダレが実際に定常RPM低下という症状(三段開示段階1)として観測可能であること**を検証する。同一構成(motorConfig・carConfig・走行条件を固定)で、ダレ非active(`reversibleDroopActive===false`)の場合と、ダレactive(`reversibleDroopActive===true`)の場合の定常RPM(`steadyRpm`相当の測定値)を比較し、後者が有意に低下していることをsweepで実測する。これはQ11の受け入れ条件(4点、不可逆到達可能性等)とは独立の検証項目であり、可逆ダレという「セッション内で回復しうる一時的な症状」がHUD/実験ノート上で実際に検知可能な形で現れることを保証する(不可逆到達後のsteady RPM低下だけでは、可逆ダレ自体の症状可視性を検証したことにならない)。

---

## 3. D04個別設計

### 3.1 物理トリガ・状態遷移

| 項目 | 内容 |
|---|---|
| 物理トリガ(短絡経路、motor-only/vehicle両文脈で評価可能) | `shared.shortCircuitDurationS + ε >= config.battery.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= config.battery.runawayHeatThreshold` |
| 物理トリガ(過放電経路、**vehicle文脈でのみ評価可能**) | `frame.energyUsedRatio >= config.battery.unsafeDischargeStartRatio`。**motor-onlyでは`frame.energyUsedRatio`が構造的に`undefined`になる(`buildMotorOnlyFrameInput`が常に`energyUsedRatio: undefined`を返す設計、2.1節)ため、motor-onlyで評価できるのは短絡経路のみに限られる。** |
| 発火後 | `stage: 'none'→'swelling'→'smoking'→'burning'`(2.3節、境界繰り越し対応) |
| 恒久劣化 | battery個体消滅+`affectedRoles`先の焼損deltaFraction加算(2.4節) |
| 図鑑登録条件 | 炎上到達(`stage:'burning'`)の初回のみ |
| 競合規則 | リポ専用。D03(非リポ)と`BatteryDestructionProgress`判別unionにより構造的に排他 |
| 終端性 | 終端(`burning`到達時、`classifyTerminalModes`が`event.causeLog.stage==='burning'`のD04を`terminalModeCandidates`へ含める) |

### 3.2 `energyExhausted`との競合+較正の結合条件(付帯条件3、確定)

`energyExhausted`は`trackPhysics.ts`の`stepTrackRun`内(225行目)でのみ代入される`FailureCode`であり、`stepMotorWithDestruction`・`stepTestRunWithDestruction`のいずれの経路でも構造的に発生しない(0.2節)。したがってD04(過放電経路)と`energyExhausted`の競合は、track-run文脈(`stepTrackRunWithDestruction`、P3-4のスコープ)で初めて実際に検証可能になる。

**短絡経路の炎上到達可能性の解析的裏付け(付帯条件3)**: 短絡経路が既存の`overheated`終端(`batteryHeat >= BATTERY_HEAT_LIMIT`)より先に`burning`へ到達するには、`runawayHeatThreshold`到達から`batteryHeat`が1.0(overheated)へ到達するまでの時間(内部抵抗悪化による電流減速込み)が`swellingS + smokingS`より大きい必要がある。この不等式を3.3節のsweep条件(3)の解析的な裏付けとして本文に明記する。

**P3-2時点ではtest-only harness(3.3節)を用いて理論上の帰結(過放電経路がenergy-budget切れより先に`burning`へ到達できること)を実測する**——これはproduction版`stepTrackRunWithDestruction`を新設するものではなく、既存`stepTrackRun`(無改修)+`advanceDestructionState`(本計画実装分)をテストコード内だけで手組みするものである(1.1節の非対象と矛盾しない)。

### 3.3 M4到達可能性条件のsweep方法論(test-only harness、実効config反映を含む)

`unsafeDischargeStartRatio`経由の過放電到達可能性(v12が定めるM4条件: `(1 − unsafeDischargeStartRatio) × energyBudgetJ ÷ 想定消費電力 > swellingS + smokingS`)を検証するには、実際の`energyExhausted`境界(`forcePowerOff`)を通す必要がある。**harnessは各stepで`composeEffectiveMotorConfig(baseMotorConfig, destructionState, destructionConfig)`(2.0節、3引数)を呼び、その同じ実効configを`stepTrackRun`と`frame`の`theoreticalCurrentA`計算の両方に使う**(D04が短絡経路経由で先に内部抵抗を悪化させている場合、それを無視して`baseMotorConfig`のまま`stepTrackRun`を呼ぶと、実際には起こらない別の物理をsweepすることになるため)。

```ts
// テストコード内のみ(production化しない。stepTrackRunWithDestructionという新規
// production関数は作らない、1.1節の非対象のまま)。v16改訂: overheated保留規則
// (14.1節・14.2節、正式Fable P3-2ゲート5 Q13-1裁定、人間再承認済み)のpre/post契約を反映。
function sweepM4Reachability(
  baseMotorConfig: MotorConfig, carConfig: CarConfig, track: ValidatedTrackDefinition,
  destructionConfig: DestructionConfig, runContext: DestructionRunContext, maxSteps: number, rng: () => number,
) {
  let vehicleState = createInitialVehicleState(baseMotorConfig, carConfig);
  let destructionState = createInitialDestructionState('lipo');
  for (let i = 0; i < maxSteps; i++) {
    // (pre) base stepへ渡す直前に、prev vehicle state・prev destruction stateへ
    // normalizeOverheatedStatusForD04Holdを適用し、base step内部の早期returnガード
    // (state.status==='overheated'なら入力をそのまま返す)を回避する(14.2節)。
    const prevVehicleState = normalizeOverheatedStatusForD04Hold(vehicleState, destructionState);
    const effectiveConfig = composeEffectiveMotorConfig(baseMotorConfig, destructionState, destructionConfig); // 2.0節、単一出典destructionConfigをstepTrackRun/frameの両方へ一貫適用
    const rawNextVehicleState = stepTrackRun(effectiveConfig, carConfig, track, prevVehicleState, DT, rng); // 実効configを使用
    const frame = buildVehicleFrameInput(effectiveConfig, prevVehicleState, rawNextVehicleState); // 同じ実効configを使用(5.3節)
    const result = advanceDestructionState(destructionState, frame, destructionConfig, runContext, DT);
    destructionState = result.state;
    // (post) advanceDestructionState実行後のnext destruction stateと、base stepが返した
    // 生のnext vehicle stateへ再適用してからphysics end判定へ渡す。これによりnone→swelling
    // 同一step境界でも正しく保留される(14.2節)。
    vehicleState = normalizeOverheatedStatusForD04Hold(rawNextVehicleState, destructionState);
    // 終了優先順位: 同一stepでdestructionTerminal(burning到達)とenergyExhaustedが両方
    // 成立しうる場合、destructionTerminalを優先して報告する(v12のM4条件は「energyExhausted
    // より先にburningへ到達できること」の実測が目的であるため)。burningとoverheatedの
    // 同一step競合はoverheated保留規則により構造的に解消済み(swelling/smoking中は
    // overheatedが保留され、burning到達時はdestructionTerminalが優先される、14.2節の
    // 同一step境界ケース(a)(b))。
    if (result.events.some((e) => e.mode === 'D04' && e.causeLog.stage === 'burning')) {
      return { reachedBurning: true, atStep: i, terminatedBy: 'destructionTerminal' as const };
    }
    if (vehicleState.status !== 'running') {
      return { reachedBurning: false, terminatedAt: i, status: vehicleState.status, failureCode: vehicleState.failureCode };
    }
  }
  return { reachedBurning: false, terminatedAt: null };
}
```

**DoD(完了報告に全文出力すること、v16改訂)**: 固定seed(既存sweepツール`scripts/vehicleSweep.ts`と同じ思想で、乱数依存を排除した決定論的な受け入れ判定にする。前提条件であり受入値の種類数には数えない)のもとで、次の**3種**の受入値を実測し完了報告へ全文出力する(要約しない): (1) 通常負荷構成では`energyExhausted`より先に`burning`へ到達しないこと、(2) 高負荷構成(高電流設定)では`unsafeDischargeStartRatio`到達後、energy-budget切れより先に`burning`へ到達できること、(3) **再定式化(v16、Q13-1裁定): 短絡構成では、overheated保留規則によりswelling/smoking進行中はoverheated終端が成立せず、swelling→smoking→burningがstageDurationsどおり進行してdestructionTerminalで終端すること(正例)、かつ非リポ(D03経路)の短絡構成では保留が発動せずD03の既存同一frame優先規則が不変であること(負例)。旧条件(3)「overheatedより先にburningへ到達できること」という競争条件は、overheated保留によりD04進行中はoverheatedという物理終了条件自体が成立しなくなったため消滅した(14.1節)。**

**D07版(付帯条件5)**: 同様のharnessパターンで、D07のQ11受け入れ条件(3)「意図的な持続過負荷構成で不可逆到達がoverheated終端より先に可能であること」も実測する。

### 3.4 `affectedRoles`の組み立て(正式Fable Q4-5裁定、確定)

`runContext.fireExposureProfile.bodyEquipped`が真なら`'body'`を、`runContext.fireExposureProfile.adjacentRolesEquipped`(型定義上`Exclude<FireExposureRole,'body'>[]`=`'magnet'[]`)を`affectedRoles`へ加える。この配列はUI層の唯一の入力(v12のHUD読み取り専用境界)であり、UI側が独自に延焼範囲を再計算しない。

**重複禁止は`validateFireExposureProfile`(既存公開関数)への拒否ロジック追加で保証する**(正式Fable Q4-5裁定、案(a)確定)。`adjacentRolesEquipped`に`'magnet'`のような重複要素が含まれる入力を拒否する。**これは既存公開validatorの受理契約を狭める変更であり、人間再承認バンドル対象とする。**

**production側構築確認テストの具体策**: `rg`実査の結果、現行productionコードには`FireExposureProfile`を`EquipmentLoadout`から導出する関数が存在しない(0.2節に依存閉包を追記)。「production構築経路のテストをP3-2で追加する」という曖昧な記述のままDoDへ置くと、存在しない経路のテストを要求することになるため、次のとおり具体策を固定する:

- `src/store/runOutcomeApplication.ts`(`EquipmentLoadout`・`EquipmentIdSnapshot`の所有ファイル、既存)へ、純関数`deriveFireExposureProfileFromLoadout(snapshot: EquipmentIdSnapshot): FireExposureProfile`を新設する。`EquipmentIdSnapshot.magnetItemId`は単一の`string`(配列ではない)フィールドであるため、この関数から`adjacentRolesEquipped`が`'magnet'`を2回以上含む結果を返すことは**構造的に不可能**(配列を構築する際に高々1要素しか追加しようがない)。
- **これはgameStore.tsへの配線ではない**(P3-0-Q2裁定が延期する「production配線」は、実際の走行開始アクション〈`finishAssembly`/`flickStart`/`resetSim`/`stepSim`〉から`DestructionConfig`/`RunSnapshot`一式を組み立てて実行する経路を指す)。`deriveFireExposureProfileFromLoadout`はgameStore.tsのいかなるactionからも呼び出さない、独立した純関数であり、`materialMapping.ts`の各写像関数がPhase 2時点でgameStore未接続のまま存在していたのと同じ扱いである。
- P3-2ではこの関数の単体テストのみを実装する(`EquipmentIdSnapshot`のfixtureを与え、返る`FireExposureProfile`の`adjacentRolesEquipped`が重複を含まないことを検証する)。gameStore.tsからこの関数を実際に呼び出す配線はP3-4で行う(10.7節へ台帳送り)。
- この設計はP3-0-Q2の「production配線はP3-4まで延期」という裁定を破らない(配線=gameStore action統合を行わないため)一方、正式Fable Q4-5が求める「production側構築確認テスト」を満たす(単一loadout由来の構築が構造的に重複不能であることを実際にテストする)。

2.2節の疑似コード(`advanceD04`)は、この検証済み前提のもとで追加のSet化を行わない。

### 3.5 D04途中段階終了時のノート記録契約(正式Fable Q9裁定、確定)

正式M5(ii)は「膨張・発煙段階のまま走行が終わった電池個体には恒久状態を残さない…走行の記録(`destructionState`・実験ノート)には膨張域到達が残るため『現象は隠さない』は満たされる」ことを求める。しかし`ExperimentSession`・`VehicleTestRunNotebookRecord`・`CourseRunNotebookRecord`のいずれにも`DestructionState`・`causeLog`・`stage`に相当するフィールドが存在しない(0.2節)。

**正式Fable Q9裁定: 案Bを裁定する。** 案A(`RunOutcome`の一時状態で足りるとする解釈)は、M5(ii)の前提(「走行の記録には膨張域到達が残る」)を空文化するため採れない——膨張のみで終わった走行は現行型ではどこにも痕跡が残らず、「現象は隠さない」が破れる。**3腕(`ExperimentSession`含む)へ`finalDestructionState: DestructionState`を追加する**(要約型の発明はしない——単一出典の全量保存が最も正直で保守負担も最小)。

**P3-2で型変更を実装しない理由**: 書き手が存在しない段階でのフィールド追加は「死にフィールド」であり(M-2と同じ原則——誰も読み書きしないフィールドの新設は自己完結スナップショットの偽装)、P3-2はgameStore無配線のため実際にこのフィールドへ書き込む経路が存在しない。**本裁定を台帳`P3-2-Q9`として`docs/phase3-plan-v12-amendments.md`へ固定し、P3-4計画の必須項目とする。** 方針の人間承認は本計画の人間再承認バンドルに含め(9節)、型変更の実行はP3-4で機械的執行として再掲する。

### 3.6 境界負例テスト(C5、2件)

「D04発煙のみ」(`stage`が`'smoking'`のまま炎上到達しない入力)と「D04膨張のみ」(`stage`が`'swelling'`のまま炎上到達しない入力)を、それぞれ独立したテストケースとして固定する。いずれも`accumulator.terminalModeCandidates`が空のままであることを確認する(`classifyTerminalModes`は`event.mode==='D04'`かつ`causeLog.stage==='burning'`を判定基準にしており、`swelling`/`smoking`段階ではevent自体が発行されないため、この2負例は構造的に成立する)。

---

## 4. D07個別設計

D07の三概念(熱ゲージ・可逆ダレ・不可逆減磁)の判定本体は2.5節に記載した。以下は関連する設計事項を補足する。

### 4.1 実効config合成

D07の実効config合成は2.0節の`composeEffectiveMotorConfig`へ統合済みである。`stepMotorWithDestruction`(2.1節)・`stepTestRunWithDestruction`(5節)の両方で適用される。

### 4.2 HUD読み取り専用境界

v12 §6が定めるとおり、UI層は`DestructionState.modes.D07`を読み取り専用で参照する。P3-2はUI実装を一切行わないため(0.4節)、この境界の実装確認はP3-4のスコープになる。P3-2では型・関数がこの境界を壊さないことのみを確認する(`D07Progress`のフィールドはいずれもプリミティブ値であり、UI層が変更不能な形で公開できる)。

### 4.3 regressionDiff所有境界(段階2)への接続

D07の熱ゲージ・可逆ダレは温度・性能の一時的変化として三段開示段階1(症状、HUD)に現れる。不可逆減磁到達後の性能変化(steady RPM低下等)の自動検知は三段開示段階2(regressionDiff、4.5節)が担当する。段階3(ガウスメーター)はP3-2の対象外である。

### 4.4 温度表現規約の遵守

spec §7.4により、D07の熱ゲージは`TemperatureReading`型(`{kind:'measured'}|{kind:'uncalibratedGauge';ratio}|{kind:'unavailable'}`)の`uncalibratedGauge`枝のみを使用し、摂氏表示は行わない(2.5節の`advanceD07`実装は`causeLog.temperature`を`{kind:'uncalibratedGauge', ratio: nextRatio}`として構築しており、この規約に従う)。

### 4.5 三段開示段階2(regressionDiff)の設計(正式Fable Q7裁定、確定)

**入力型の設計**: lap timeは増加が悪化、top speed/steady RPMは減少が悪化であるため、単一の`metric: number`だけでは3%判定の方向を正しく扱えない。**型設計は案(a)を裁定する**——`metricKind`から`degradationDirection`を導出する純関数を設け、`RegressionObservation`自体は`degradationDirection`フィールドを持たない(存在しないフィールドは食い違えない。判別union案(b)は同じ安全性をより多い定型文で買うだけである):

```ts
// src/materials/regressionDiff.ts(新規)
// store層のExperimentSession/CourseRunNotebookRecord/VehicleTestRunNotebookRecord等、
// 実際の記録型には一切依存しない(層逆転回避、src/materials/はsrc/store/をimportしない)。
// 呼び出し側(store層、P3-4で確定)が該当フィールドをこの最小構造へ変換してから渡す。

export type RegressionMetricKind = 'lapTimeS' | 'topSpeedMps' | 'steadyRpm';
export type RegressionDegradationDirection = 'higherIsWorse' | 'lowerIsWorse';

function directionForMetricKind(kind: RegressionMetricKind): RegressionDegradationDirection {
  switch (kind) {
    case 'lapTimeS': return 'higherIsWorse';
    case 'topSpeedMps':
    case 'steadyRpm': return 'lowerIsWorse';
  }
}

export interface RegressionObservation {
  recipeKey: string; // 同一レシピ照合キー。既存ExperimentSessionにはrecipeCode相当の
  // フィールドがないため、キーの構成方法はP3-4実装時に確定する(既存recipeCode.tsの
  // 再利用を検討する、本計画のスコープ外)。
  metricKind: RegressionMetricKind;
  value: number;
}

export interface RegressionComparisonResult {
  hasAnomaly: boolean;
  currentValue: number;
  baselineValue: number;
  percentChange: number; // directionForMetricKindに応じ悪化方向を正の値として正規化する
}

// 3%はv12 §5.3で既に確定した契約値である(将来較正対象ではない)。
const REGRESSION_ANOMALY_THRESHOLD = 0.03;
// baselineウィンドウ幅は契約定数であり較正値ではない(正式Fable Q7裁定)。
const REGRESSION_BASELINE_WINDOW = 5;

export function detectPerformanceRegression(
  current: RegressionObservation,
  pastObservations: readonly RegressionObservation[],
): RegressionComparisonResult | null;
```

**baseline方式(正式Fable Q7裁定、確定): 同一`recipeKey`の直近5回(当該run除く)の中央値とする。** 根拠: この機構の目的は「最近何かが変わった」の検知であり、本作の恒久劣化はイベント駆動の段差(D07到達・D04延焼)であって漸進ドリフトではない——段差検知には直近窓の中央値が最適で、外れ値1回に頑健。最良値基準は通常分散を恒久劣化と誤認する偽陽性製造機になるため不採用。過去観測1件以上で判定可(1件なら実質直前値比較)、0件で`null`。窓幅5(`REGRESSION_BASELINE_WINDOW`)は契約定数である。

**P3-2純関数のテスト契約**: 異なる`recipeKey`の観測は比較対象(baselineプール)から除外すること、`pastObservations`が空なら`null`を返すこと、`value`が0または非有限値の場合に`NaN`/`Infinity`を生成せず安全に扱うこと(非有限入力は`null`を返す)、ちょうど3%境界(2.999...%/3.0%/3.000...1%)で判定が一貫することをテストする。

**スコープ境界(明記)**: P3-2では`detectPerformanceRegression`の純関数+単体テストまでを実装する。実行タイミング(いつ呼ぶか)・永続化(結果をどこに保存するか)・UI表示(実験ノートへどう出すか)はP3-4でstore層・UI層が確定する(v12 §5.3のA2裁定「実行タイミング・保存先・UI表示はbrabit所有」どおり)。

---

## 5. `stepTestRunWithDestruction`

### 5.1 termination処理の完全な解決フロー(正式Fable Q8裁定、確定)

**test-runの`status`/`failureCode`が取りうる値と、それぞれをどの関数が確定するか**:

| `status`/`failureCode` | 確定する関数 | test-runで発生しうるか |
|---|---|---|
| `'running'` | `stepVehicle`(既定) | 可 |
| `'finished'` | `evaluateCourseCompletion`(`stepTestRun`が内部で呼ぶ、既存) | 可 |
| `'stalled'`(+`failureCode:'failureToStart'`) | `stepVehicle`内部(`nextStalledDurationS >= STALL_DETECTION_TIME_S`) | 可 |
| `'overheated'` | `stepVehicle`内部(`nextMotor.batteryHeat >= BATTERY_HEAT_LIMIT`) | 可 |
| `'derailed'` | `stepVehicle`内部(`hasCurve && nextDerailDurationS >= DERAIL_DETECTION_TIME_S`) | **構造的に不可能**(`stepTestRun`は`trackInputs`を渡さないため`hasCurve`が常にfalse、0.2節) |
| `failureCode:'energyExhausted'` | `stepTrackRun`(`trackPhysics.ts`)内部のみ(225行目) | **構造的に不可能**(`stepTestRun`はこのロジックを一切経由しない) |
| `destructionTerminal`(D04炎上到達など) | `advanceDestructionState`→`classifyTerminalModes`→`finalizeDestructionRun` | 可 |
| `manualAbort` | `stepTestRunWithDestruction`の**外側**(呼び出し側がループを止めて`finalizeRun(accumulator, {kind:'manualAbort'})`を呼ぶ) | 呼び出し側の操作次第(P3-2はfixtureテスト内でのみ構築) |

**正式Fable Q8裁定(確定)**: 到達不能なendReason(`derailed`/`energyExhausted`)の網羅義務は、構造的証明の引用(上表の実コード根拠)で履行されたとみなす。**DoDの方式は「実コード根拠の引用+到達可能6種(`running`/`finished`/`stalled`/`overheated`/`destructionTerminal`/`manualAbort`)の正例テスト」とし、長時間実行による不在テストは要求しない**(実行による不在証明は保証にならない)。`derailed`/`energyExhausted`はtrack-run(P3-4)の必須網羅として台帳送りにする。

**付帯条件2(JSDoc明記、確定)**: `stepTestRunWithDestruction`のJSDocへ呼び出し側契約を明記する——「vehicle文脈(test-run)のsnapshotを持つaccumulator専用。motor文脈のaccumulatorを渡した場合の挙動は未定義(trusted precondition)」。

```ts
/**
 * vehicle文脈(test-run)のsnapshotを持つaccumulator専用。motor文脈のaccumulatorを
 * 渡した場合の挙動は未定義(trusted precondition、付帯条件2)。
 */
export function stepTestRunWithDestruction(
  vehicleState: VehicleSimState, accumulator: RunAccumulator, dt: number, rng?: Rng,
): DestructionStepResult<VehicleSimState> {
  const baseMotorConfig = accumulator.replaySnapshot.motorConfig;
  const destructionConfig = accumulator.replaySnapshot.destructionConfig;
  const motorConfig = composeEffectiveMotorConfig(baseMotorConfig, accumulator.destructionState, destructionConfig); // 2.0節
  const carConfig = accumulator.replaySnapshot.carConfig!; // vehicle文脈、正式M2検証により非null
  const courseLengthM = accumulator.replaySnapshot.courseLengthM!; // 5.2節、vehicle+track===null文脈で非null
  const slopeRad = accumulator.replaySnapshot.slopeRad!; // 5.2節、M-2是正。vehicle+track===null文脈で非null

  // stepTestRunの実シグネチャ(vehiclePhysics.ts 706-717行目)は
  // (motorConfig, carConfig, state, dt, courseLengthM, rng, slopeRad)であり、slopeRadは
  // 実際にstepVehicleへ渡される引数である(0.2節)。省略すると既定値0で走行し、
  // RunSnapshotが保持するslopeRadが実際の物理へ反映されない「死にフィールド」に
  // なるため、M-2是正として最後の引数まで明示的に渡す。
  const physicsState = stepTestRun(motorConfig, carConfig, vehicleState, dt, courseLengthM, rng, slopeRad);
  const frame = buildVehicleFrameInput(motorConfig, vehicleState, physicsState); // 5.3節
  const { state, events } = advanceDestructionState(accumulator.destructionState, frame, destructionConfig, accumulator.replaySnapshot.runContext, dt);
  const snapshot: PhysicsSnapshotAtT = { context: 'vehicle', state: physicsState };
  const stampedEvents = stampPhysicsSnapshot(events, snapshot);
  const nextTerminalModeCandidates = [...accumulator.terminalModeCandidates, ...classifyTerminalModes(events)];
  const nextAccumulator: RunAccumulator = {
    ...accumulator, destructionState: state,
    events: [...accumulator.events, ...stampedEvents],
    terminalModeCandidates: nextTerminalModeCandidates,
  };
  const nonEmptyTerminalModes = asNonEmpty(nextTerminalModeCandidates);
  const termination = nonEmptyTerminalModes
    ? finalizeDestructionRun({ ...nextAccumulator, terminalModeCandidates: nonEmptyTerminalModes })
    : null;
  return { physicsState, accumulator: nextAccumulator, termination };
}
```

**付帯条件6(確定、正式配置は5.3節)**: test-runでの過放電到達は、フリー走行の正直な帰結として意図仕様である。詳細は5.3節を参照。

### 5.2 `RunSnapshot`拡張の設計(正式Fable Q6裁定、確定)

**正式Fable Q6裁定: 案Aを裁定する。** 案B(`runEnvironment`判別union)は`DestructionRunContext.context`と意味の重複する第二の判別子を作り、「同じ事実を二経路から入力できる」というP3-1-Q9が塞いだばかりの穴の型版を再導入する(`context='motor' ∧ kind='trackRun'`という新しい不正状態の発明)。案Aの交差検証3規則は既存の正式M2パターンの自然な拡張であり全域的。

**現行`RunSnapshot`(全文、`destructionOrchestration.ts`281-292行目)**:
```ts
export interface RunSnapshot {
  contractVersion: number;
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  runContext: DestructionRunContext;
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: TrackDefinition | null;
  seed: number;
  initialDestructionState: DestructionState;
}
```

**拡張後(案A、確定)**:

```ts
export interface RunSnapshot {
  contractVersion: number; // 1→2(スキーマ変更のため、既存version=1のsnapshotは新規
  // フィールド欠落によりrestoreRunSnapshotが拒否する。旧snapshotの救済は行わない
  // ——production配線ゼロ=実ユーザーデータ不在が根拠、正式Fable Q6裁定で承認済み)
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  runContext: DestructionRunContext;
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: TrackDefinition | null;
  courseLengthM: number | null;  // 新規。test-run文脈でのみ非null
  slopeRad: number | null;       // 新規。test-run文脈でのみ非null。M-2是正により実際に
  // stepTestRun(vehiclePhysics.ts 706-717行目)の7番目の引数として消費される(5.1節)
  seed: number;
  initialDestructionState: DestructionState;
}
```

**交差検証規則(`restoreRunSnapshot`の正式M2検証を拡張する)**:
- `context==='motor'` ⟹ `courseLengthM===null && slopeRad===null`
- `context==='vehicle' && track===null`(test-run) ⟹ `courseLengthM`は正の有限数、`slopeRad`は有限数
- `context==='vehicle' && track!==null`(track-run) ⟹ `courseLengthM===null && slopeRad===null`(track-runは`stepTrackRun`が`track`のセグメントデータから区間ごとに勾配を導出するため、単一のflat値を持たない)

**依存閉包(`RunSnapshot`を参照する全箇所、実ファイル・実ヘルパーを列挙)**:

| ファイル | 機械的追従が必要な箇所 |
|---|---|
| `src/engine/destructionOrchestration.ts` | `RunSnapshot`型定義(281-292行目)・`CaptureRunSnapshotInput`型定義(296-306行目)・`captureRunSnapshot`本体(310-323行目、新規フィールドの深いコピー追加)・`restoreRunSnapshot`(630-704行目、新規フィールドの検証段階追加+正式M2検証の拡張)・`RestoredRunSnapshot`型定義(329-340行目) |
| `src/engine/__tests__/destructionOrchestration.test.ts` | `motorSnapshotInput`・`vehicleSnapshotInput`ヘルパー関数(新規フィールドのデフォルト値追加)、`restoreRunSnapshot`の正負例テスト(交差検証の新規負例追加) |
| `src/store/runOutcomeApplication.ts` | `import type {...RunSnapshot...}`(型のみの参照) |
| `src/store/__tests__/runOutcomeApplication.test.ts` | fixture構築ヘルパー(新規フィールドのデフォルト値追加) |
| `src/store/__tests__/saveStore.test.ts` | fixture構築ヘルパー(新規フィールドのデフォルト値追加) |
| `src/store/saveStore.ts` | `restoreRunSnapshot`の呼び出し箇所——関数シグネチャ自体は変わらないため機械的追従は原則不要。ただし新規フィールドを含む`template`オブジェクト構築箇所があれば実装時に確認する |

### 5.3 `buildVehicleFrameInput`

**単体テストから直接呼び出せるよう`export`関数として実装する(v12改訂、Suu_mot3裁定)**: ゲート5のM4/D07 harness(`src/materials/__tests__/materialMapping.test.ts`)が`stepTrackRun`と本関数の両方へ同一の実効configを渡す単一出典契約(3.3節)を、テスト側でframe式を複製せずに直接検証するため。新設純関数の可視性追加であり、既存公開契約の変更ではない(`composeEffectiveMotorConfig`のexport化と同型)。

```ts
export function buildVehicleFrameInput(config: MotorConfig, prev: VehicleSimState, next: VehicleSimState): DestructionFrameInput {
  const theoreticalCurrentA = computeElectricalState(config, prev.motor.theta, prev.motor.omega).current;
  return {
    currentA: next.motor.current,
    theoreticalCurrentA,
    rpm: next.motor.rpm,
    batteryHeat: next.motor.batteryHeat,
    shorted: next.motor.shorted,
    chatterFramesLeft: next.motor.chatterFramesLeft,
    coilCollapsedRisingEdge: didCollapseJustHappen(prev.motor, next.motor),
    loadTorqueNm: next.loadTorqueNm,
    // energyUsedRatio: test-runは走行距離無制限のフリー走行であり、courseLengthMを
    // 完走すれば終わるがそれ以前は事実上の耐久走行になる。長時間走行すれば
    // energyUsedRatioがunsafeDischargeStartRatioへ到達しD04過放電経路が発火しうるが、
    // これはフリー走行の正直な帰結であり隠すべき挙動ではない、意図仕様である
    // (付帯条件6、正式P3-1確定裁定の適用)。
    energyUsedRatio: next.energyUsedJ / computeEnergyBudgetJ(config), // computeEnergyBudgetJのexport化を利用
  };
}
```

---

## 6. P3-0-Q6不変条件の適用範囲拡張

正式Fable裁定P3-0-Q6は「`advanceDestructionState`は差分換算(deltaFraction等)が実装済みのモードのイベントしか発行してはならない」という不変条件を定める。P3-1完了時点のホワイトリストは`D01`・`D03`のみである。P3-2完了後は`D04`(炎上到達時のみ)・`D07`(不可逆到達時のみ)をホワイトリストへ追加する。テスト対象は「イベントmode」だけでなく「イベントmode+deltaFraction系フィールドの存在」まで拡張する。

---

## 7. 確定裁定一覧(正式Fable技術レビュー、2026-08-08、人間プロジェクトリード直接提示)

**総合判定: 条件付き承認(必須修正2点+付帯条件6点+Q1〜Q12全裁定。裁定反映とSuu照合、人間再承認バンドルの承認をもって実装解禁)。** 以下、Q1〜Q12を裁定結果として記載する(いずれも本文へ反映済み、参照節を付す)。

1. **D04内部抵抗悪化係数(2.0節)**: 承認。単一係数`internalResistanceDegradationMultiplier`(swelling/smoking区別なし)。初期候補値1.5(設計較正値、8節でsweep確定)。
2. **D07可逆熱ダレ係数(2.0節)**: 承認。`reversibleDroopMultiplier`初期候補値0.95(設計較正値)。
3. **合成順序(2.0節)**: 乗算の可換性により順序問題は消滅。単一式`実効B = base × (1−不可逆分) × 可逆分`。
4. **D04状態機械5点(2.2節)**: (i)承認、(ii)承認+物理的正当化明記、(iii)案(b)裁定、(iv)3条すべて検証、(v)案(a)裁定。
5. **劣化量供給経路+magnetScorch独立性(2.4節・8節)**: event埋め込み承認。`magnetScorchDeltaFraction`はD07の値の再利用ではなく独立フィールドとして維持(理由: 火災は数百℃の急性熱曝露、D07不可逆到達は動作限界の踏み越えで熱量が桁で異なる)。ただし全磁石素材で`magnetScorchDeltaFraction ≥ demagnetizationDeltaFraction`を単体テストで固定(火災が閾値踏み越えより軽いことは決してない)。nonDemagnetizing磁石には0を返す。初期候補値: `demagnetizationDeltaFraction` 0.10、`magnetScorchDeltaFraction` 0.15(設計較正値)。検知可能性制約: `demagnetizationDeltaFraction`は段階2の3%閾値を十分上回る値に保つ(0.10はこれを満たす)。
6. **`RunSnapshot`拡張(5.2節)**: 案A裁定。`contractVersion`→2、旧snapshot非救済も承認。
7. **regressionDiff(4.5節)**: baseline=同一`recipeKey`の直近5回(当該run除く)の中央値。窓幅5は契約定数。型設計は案(a)(`directionForMetricKind`導出関数)。
8. **P3-1-Q4返済の解釈(5.1節)**: 承認。構造的証明の引用+到達可能6種の正例テストで履行。
9. **D04途中段階のノート記録(3.5節)**: 案B裁定。型変更の実装はP3-4配線サブステップで行う。方針の人間承認は今回のバンドルに含める。
10. **`stepMotorWithDestruction`内部改修(2.1節)**: 人間再承認不要。v12 §3.2凍結契約の履行であり契約変更ではない。
11. **D07物理モデル+磁石構造(2.5節)**: 候補A(I²R/伝導)+候補(ii)(`{thermal,irreversible}`)を裁定。係数はsweepで確定、受け入れ条件4つ(2.5節)。負例1件(nonDemagnetizing磁石は`reversibleDroopActive`/`irreversibleTriggered`が真にならない)。
12. **D01漸減の返済先(0.3節5)**: P3-3残置を裁定。ただし層の整理は訂正——D01漸減はモーター層の量であり`composeEffectiveMotorConfig`の対象そのものである。P3-3送りの正当な理由は層ではなくスコープ規律(P3-2は既に本フェーズ最大のステップ)。機構自体はP3-2で導入済み、P3-3での回収は「D01分岐の追加+較正」に縮小する。

### 7.1 付帯条件(6点、すべて確定・本文へ反映済み)

1. 予算不変性テスト(2.0節)。
2. `stepTestRunWithDestruction`のJSDocへ呼び出し側契約明記(5.1節)。
3. D04較正の結合条件を3.2/3.3節へ明記(解析的裏付け)。
4. Q5の不等式テスト(`magnetScorch ≥ demag`、全磁石素材、8節)。
5. Q11の負例と到達可能性条件をDoD 10.6へ明記(2.5節・3.3節)。
6. test-runでの過放電到達が意図仕様であることを5.3節(`buildVehicleFrameInput`の`energyUsedRatio`直下)へ1行明記(5.1節にも参照ポインタを残す)。

### 7.2 P3-1申し送り6点の充足確認

1. 実wrapper×全endReason=Q8裁定で充足(5.1節)。
2. snapshot唯一出典+非自明リプレイ等価=5.1節・10.5節で充足。
3. epsilon再利用=2.2節・2.3節で充足(短絡比較・段階境界の両方で単一出典を使用)。
4. M4+3種sweep=3.3節で充足。
5. C5負例=3.6節で充足。
6. 非恒久簡約と記録整合=Q9裁定で充足(3.5節)。

---

## 8. materialMapping.ts較正値の写像

**本節の内容はゲート2(写像純関数)とゲート5(較正sweep)に分かれる(11節)。ゲート2はゲート1〈型契約〉完了後に着手し、写像関数の実装+物理到達を伴わない単体テスト(不等式・nonDemagnetizing値)までを行う。ゲート5はゲート3〈状態機械〉・ゲート4〈実効config〉完了後に着手し、実際の物理sweep(M4到達可能性・Q11受け入れ条件・Q2定常RPM低下)を実施して候補値を確定する。** 既存`mapD03DestructionConfig`(0.2節、`materialMapping.ts`424-431行目)と同型のパターンで新設する。`DestructionConfig.d04`(2.4節の新規セクション、`{bodyScorchDeltaFraction, magnetScorchDeltaFraction}`)は電池素材ではなく、延焼を受ける側(body素材・magnet素材)の耐火性に由来する値であるため、次のとおり3関数へ分割する。`BodyMaterialId`は現状`materialMapping.ts`からexportされていない(0.2節)ため、既存の`GearMaterialId`等と同じパターンで新規exportを追加する。

```ts
// BodyMaterialId: 既存パターンを踏襲した新規export(0.2節)。
export type BodyMaterialId = (typeof BODY_MATERIALS)[number]['id'];

// mapD04BatteryDestructionConfig: リポ電池素材IDから、internalResistanceDegradationMultiplier
// (Q1裁定、初期候補値1.5)を含むBatteryDestructionConfig(lipo枝)を返す純関数。
// DestructionConfig.batteryセクションの単一出典になる。
export function mapD04BatteryDestructionConfig(
  batteryId: Extract<BatteryMaterialId, 'battery-lithium-polymer'>,
): Extract<BatteryDestructionConfig, { profile: 'lipo' }>;

// mapBodyScorchDeltaFraction: ボディ素材IDから、延焼時の焼損deltaFractionを返す純関数。
// DestructionConfig.d04.bodyScorchDeltaFractionの単一出典になる。
export function mapBodyScorchDeltaFraction(bodyId: BodyMaterialId): number;

// mapMagnetScorchDeltaFraction: 磁石素材IDから、D04延焼時に加算するdeltaFractionを
// 返す純関数(Q5裁定、初期候補値0.15)。DestructionConfig.d04.magnetScorchDeltaFractionの
// 単一出典になる。この性能影響はD07のdemagnetizationDeltaFractionと同一の
// WearState.demagnetizationFraction単一累積量へ合算される(applyMagnetDiffが既に
// D04-scorch/D07-demagnetizationの両kindを同一フィールドへ適用する既存設計、無改修)。
// {role:'magnet',kind:'scorch'}と{role:'magnet',kind:'demagnetization'}をDegradationDiffの
// 別バリアントとして残すのは、図鑑・実験ノート上「どのモードが原因で劣化したか」を
// 記録するためのbookkeeping目的であり、物理的な適用先は単一である。
// Q5裁定により、この値はD07側の値の再利用ではなく独立フィールドとして維持する
// (火災は数百℃の急性熱曝露でD07不可逆到達〈動作限界の踏み越え〉とは熱量が桁で
// 異なるため)。ただし架空指標化を防ぐ制約として、全磁石素材で
// mapMagnetScorchDeltaFraction(m) >= mapD07DestructionConfig(m).irreversible.demagnetizationDeltaFraction
// を単体テストで固定する(火災が閾値踏み越えより軽いことは決してない)。
// nonDemagnetizing磁石には0を返す。
export function mapMagnetScorchDeltaFraction(magnetId: MagnetMaterialId): number;

// mapD07DestructionConfig: 磁石素材IDから、{thermal, irreversible}の2部構成(Q11裁定)を
// 返す純関数。reversibleDroopMultiplier初期候補値0.95、demagnetizationDeltaFraction
// 初期候補値0.10を含む。
export function mapD07DestructionConfig(magnetId: MagnetMaterialId): DestructionConfig['d07'];
```

**production完成config(P3-4配線)の組み立て方**(P3-2では実装しない、型で示すのみ——1.1節の非対象=`gameStore.ts`変更ゼロと矛盾しない):

```ts
// P3-4でgameStore.ts側が行う想定の組み立て(P3-2はこの関数自体を実装しない)。
function assembleD04Config(equippedBatteryId: BatteryMaterialId, equippedBodyId: BodyMaterialId | null, equippedMagnetId: MagnetMaterialId): DestructionConfig['d04'] {
  return {
    bodyScorchDeltaFraction: equippedBodyId !== null ? mapBodyScorchDeltaFraction(equippedBodyId) : 0,
    magnetScorchDeltaFraction: mapMagnetScorchDeltaFraction(equippedMagnetId),
  };
}
```

P3-2のfixtureテスト(9節)では、この組み立て関数自体は実装せず、`DestructionConfig.d04`をfixtureリテラル値で直接構築する(`mapBodyScorchDeltaFraction`・`mapMagnetScorchDeltaFraction`・`mapD04BatteryDestructionConfig`・`mapD07DestructionConfig`の各関数はそれぞれ独立に単体テストする)。

**ゲート2の単体テスト(物理到達sweepを含まない)**: (1) `magnetScorchDeltaFraction >= demagnetizationDeltaFraction`の不等式(付帯条件4)を全磁石素材について固定する。(2) nonDemagnetizing磁石については`mapMagnetScorchDeltaFraction`が`0`を返すこと(0.3節・8節)。(3) 各写像関数が返す値の形状(`BatteryDestructionConfig`lipo枝・`DestructionConfig['d04']`・`DestructionConfig['d07']`)がvalidator(ゲート1で実装済みの`validateDestructionConfig`)を通ることの確認。**この段階では`advanceD04`/`advanceD07`/`composeEffectiveMotorConfig`が未実装のため、実際の物理到達可能性(M4条件・Q11受け入れ条件・Q2定常RPM低下)は検証しない。**

**ゲート5のsweep証跡**(`src/materials/__tests__/materialMapping.test.ts`内に実装、既存D03較正値と同水準の受け入れ条件・確定手順を適用。ゲート3〈状態機械〉・ゲート4〈実効config〉完了後にのみ実施可能): (1) 3.3節のM4到達可能性(D04)、(2) D07のQ11受け入れ条件4つ、(3) Q2の独立sweep受け入れ条件(可逆ダレによる定常RPM低下の観測可能性、2.5節)、(4) 短絡経路の解析的結合条件(3.2節付帯条件3)の実測裏付け。初期候補値(1.5・0.95・0.10・0.15)は設計較正値であり、このゲートのsweep実測をもって完了報告で最終化する(D03の3.0秒と同じ手順)。`computeEnergyBudgetJ`はゲート4でexport済みの実関数を利用し、本ゲートではexport作業も式の複製も行わない(v10改訂)。

---

## 9. store fixture統合テスト

`src/store/__tests__/runOutcomeApplication.test.ts`へ、D04/D07を含む3文脈(motor-only/test-run/track-run)のtable駆動テストを追加する。**3文脈は同一のwrapper経路を通らない**——`stepTestRunWithDestruction`は「vehicle文脈(test-run)のsnapshotを持つaccumulator専用」(5.1節JSDoc、`track===null`前提)であり、track-run文脈(`track!==null`、`courseLengthM`/`slopeRad`は共に`null`、5.2節の交差検証)へ渡すことはできない。production版track-runラッパー(`stepTrackRunWithDestruction`)はP3-4まで存在しない(1.1節の非対象)。したがって文脈ごとに次のとおり経路を分ける:

- **motor-only**: 有効な`RunSnapshot`(`context==='motor'`)を`captureRunSnapshot`で構築し、`createRunAccumulator`→`stepMotorWithDestruction`→`applyRunOutcome`という実経路を通す。
- **test-run**: 有効な`RunSnapshot`(`context==='vehicle'`、`track===null`、`courseLengthM`/`slopeRad`非null)を`captureRunSnapshot`で構築し、`createRunAccumulator`→`stepTestRunWithDestruction`→`applyRunOutcome`という実経路を通す。
- **track-run**: P3-1-Q4裁定どおり、実wrapperが存在しないため手構築の`RunOutcome`(`context==='vehicle'`、`track`が有効な`TrackDefinition`、`courseLengthM`/`slopeRad`はともに`null`)を直接構築し、`applyRunOutcome`へ渡してcontext非依存性(3文脈のいずれでも`applyRunOutcome`が正しく動作すること)のみを検証する。実際のtrack-run wrapper挙動(D04/D07がtrack-run物理ループの中でどう発火するか)はP3-4へ台帳送りとする(10.7節)。

**DoD**: `stepTestRunWithDestruction`(test-run専用wrapper)がtrack-run文脈のaccumulator(`track!==null`snapshot由来)へ決して渡されないことを、型上または実行時の呼び出し規約として固定する(呼び出し元のtable駆動テスト自体がtrack-run枝で`stepTestRunWithDestruction`を一切呼ばないことで示す)。

D04が炎上到達した場合の`degradationDiffs`(body/magnet scorchの`deltaFraction`込み)・D07が不可逆到達した場合の`degradationDiffs`(demagnetizationの`deltaFraction`込み)が、`src/materials/degradationApplication.ts`の`applyMagnetDiff`・`applyBodyDiff`(既存、無改修)を通じて`WearState`・`BodyPartState`へ正しく反映されることを検証する。`src/store/__tests__/saveStore.test.ts`には、`RunSnapshot`拡張後の`captureRunSnapshot`/`restoreRunSnapshot`往復が新規フィールドを保持することを確認するテストを追加する。

**Q9裁定(案B)について**: P3-2ではPendingNotebookRecord系3型への型変更を実装しない(3.5節)。fixtureテストは既存の3型のまま(無変更)で構築する。

---

## 10. DoD一覧

### 10.1 状態機械・判定ロジック

- `advanceD04`/`advanceD07`の判定ロジックが2.2節・2.5節の確定設計どおりに実装され、単体テストで全分岐(発火・非発火・境界)を検証する。
- `composeEffectiveMotorConfig`が決定論的純関数であること(同一入力から常に同一出力)を確認する。
- `stepMotorWithDestruction`改修後も、D04/D07が発火しない既存P3-1テストケース(D01/D03のみ発火)の結果が変化しないことを回帰確認する。
- **D04状態機械のdt分割不変性(M-1是正、固定dt=1/120s厳守)**: `stageDurations`境界の1フレーム手前・境界・1フレーム後の3点テストを`swelling→smoking`・`smoking→burning`それぞれで実施し、**dt=1/120秒に固定したまま**「1フレームあたり1物理step×2Nフレーム」vs「1フレームあたり2物理step×Nフレーム」という**stepのバッチング方法の比較**を追加する(2.3節の定義に従う——離散結果〈`stage`・`triggered`・`event.mode`集合〉は完全一致、`triggeredAtT`/`causeLog.atT`は最大1物理step許容、`events`のバイト単位完全一致は要求しない)。**dt値自体を1/240秒等へ変更する比較は正典違反として行わない。**
- **予算不変性テスト(付帯条件1)**: `composeEffectiveMotorConfig`の合成前後で`computeEnergyBudgetJ`の値が一致することを検証する。

### 10.2 events契約・終端判定(既存P3-1契約のD04/D07への拡張確認)

- **events固定順序**: 同一フレームで複数モードが発火した場合、公開`events`配列がv12 §2.1が定める固定順序(D01→D02→[D03またはD04]→D05→D06→D07→D09、P3-2時点で実際に発火しうるのはD01→D04→D07の部分列)どおりに組み立てられることを検証する。
- **`isFirstThisSession`/二重発行防止**: D04(`triggered`ガード)・D07(`irreversibleTriggered`ガード)のいずれも、一度発火した後は同一セッション内で`event`を再発行しないことをテストする(熱ゲージ自体は更新を続けるが`event`は再発行しない、という区別を明示的にテストする)。
- **`causeLog`初回固定**: 発火後の`causeLog`が以後のフレームで変化しない(`triggered`/`irreversibleTriggered`が真になった後は`next.causeLog`が不変)ことを検証する。
- **`physicsSnapshotAtT`同一step**: D04/D07の`event`に付与される`physicsSnapshotAtT`が、そのeventが実際に発行されたstepの物理状態と一致することを検証する(`stampPhysicsSnapshot`の既存機構、無改修)。
- **D03/D04構造排他**: `BatteryDestructionProgress`判別union(`profile:'lipo'`ならd04のみ、`profile:'nonLipo'`ならd03のみ保持)により、同一runでD03/D04が同時に構築不能であることを型テストで確認する(既存、無改修の再確認)。
- **P3-0-Q6ホワイトリスト**: `advanceDestructionState`がD04(`burning`到達時のみ)・D07(`irreversibleTriggered`到達時のみ)以外の未実装モード(D02/D05/D06/D09)のeventを一切発行しないことを検証する(6節)。
- **D04 `affectedRoles`の重複禁止**: `affectedRoles`配列に`'body'`・`'magnet'`がそれぞれ高々1回しか含まれないことをテストする。`validateFireExposureProfile`(正式Fable Q4-5裁定、案a確定)へ`adjacentRolesEquipped`の重複を拒否する入力を与える負例テストを追加し、新設する`deriveFireExposureProfileFromLoadout`(3.4節、`src/store/runOutcomeApplication.ts`)が単一の`EquipmentIdSnapshot`から構造的に重複を生成し得ないことを単体テストで確認する(gameStore.tsへの配線はP3-4)。
- **`D04Progress.initiatingCauseLog`/`D04CauseLog.initiatingCause`のvalidator正負例**: `restoreRunSnapshot`の`validateD04ProgressShape`/`validateD04CauseLogShape`拡張後、不正な形状の入力を拒否する負例、および3条の交差不変条件(2.2節Q4-4)を拒否する負例(例: `stage==='none'`なのに`initiatingCauseLog`が非nullな入力、`triggered===true`なのに`causeLog`がnullな入力)を追加する。

### 10.3 劣化適用・store統合の原子性(9節の拡張)

- **battery consumed時のloadout null化**: D04炎上到達によるbattery個体消滅(`degradationDiffs`の`{role:'battery',kind:'consumed'}`)適用時、`EquipmentLoadout.batteryItemId`が同一の原子適用内で`null`化されることを検証する(P3-0で確立した`string|null`設計との整合)。
- **自動再装備なし**: battery消滅後、他の未使用battery個体への自動差し替えが行われないことを確認する(P3-0裁定どおり)。
- **body/magnet scorch+D07 demagの原子的適用とrunSequence冪等性**: D04の`{role:'body',kind:'scorch'}`・`{role:'magnet',kind:'scorch'}`、D07の`{role:'magnet',kind:'demagnetization'}`が、既存`applyRunOutcome`の原子性契約(検証→適用の2段階、失敗時は`currentRunSequence`を解放しない)・冪等性契約(同一`runSequence`の再適用がskipされる)を満たすことをfixtureテストで検証する。
- **`magnetScorchDeltaFraction >= demagnetizationDeltaFraction`不等式テスト(付帯条件4)**: 全磁石素材についてこの不等式を単体テストで固定する。

### 10.4 `stepTestRunWithDestruction`のtermination契約

- 5.1節の表が定める到達可能な6種の`status`/`failureCode`(`running`/`finished`/`stalled`/`overheated`/`destructionTerminal`/`manualAbort`)それぞれについて、実際に到達するfixtureテストを用意する(正式Fable Q8裁定どおり、長時間実行による不在テストは要求しない)。
- `derailed`/`energyExhausted`が構造的に到達不能であることは、5.1節の実コード根拠の引用で満たされる。
- `manualAbort`経路のfixtureテスト(呼び出し側がループを止めて`finalizeRun(accumulator, {kind:'manualAbort'})`を呼ぶケース)を追加する。
- `stepTestRunWithDestruction`が`stepTestRun`の第7引数(`slopeRad`)へ`accumulator.replaySnapshot.slopeRad`を実際に渡していることを検証するテスト(M-2是正)を追加する。
- **`stepTestRunWithDestruction`をtrack-run文脈のaccumulatorへ渡さないことの固定(9節)**: store fixtureのtable駆動テストにおいて、track-run枝が`stepTestRunWithDestruction`を一切呼び出さず、代わりに手構築`RunOutcome`→`applyRunOutcome`の経路のみを使うことをテスト構造そのもので示す。

### 10.5 リプレイ等価性・既存回帰

- D04/D07が発火する非自明な経路(P3-1の`DURATION_COMPARISON_EPSILON_S`導入時と同水準——held-short/held-overDischarge等、単純な「何も起きない空走行」ではない経路)で、同一`RunSnapshot.seed`から2回リプレイした結果(`events`・`destructionState`・`degradationDiffs`)が完全一致することを検証する。
- `computeEnergyBudgetJ`の既存回帰: `export`化後も既存`stepTrackRun`内部呼び出し・既存`trackPhysics.test.ts`の全テストが変化なく成功することを確認する。

### 10.6 D07較正・全体ゲート

- **D07 Q11の4つの受け入れ条件**: (1) 通常運用でダレ閾値非到達、(2) 高負荷持続でレース内にダレ到達可能、(3) 意図的な持続過負荷構成で不可逆到達がoverheated終端より先に可能(付帯条件5)、(4) ゲージが0〜1にclampされること。
- **D07 Q2の独立sweep受け入れ条件**: 同一構成でのダレ非active/active比較により、可逆ダレによる定常RPM低下が症状(段階1)として観測可能であることを実測する(2.5節)。
- **D07 nonDemagnetizing負例(付帯条件5)**: nonDemagnetizing磁石ではいかなる入力でも`reversibleDroopActive`/`irreversibleTriggered`が真にならないことをテストする。
- C5負例2件(発煙のみ・膨張のみ、3.6節)。
- `RunSnapshot`拡張後の全負例(交差検証の新規負例含む、5.2節)。
- M4到達可能性のtest-only harnessによる実測(3.3節)。解析式のみ・test-runのみでの完了は認めない。
- 短絡経路が`overheated`終端より先に`burning`へ到達できることのsweep確認(3.3節・3.2節の解析的裏付け=付帯条件3)。
- `regressionDiff`の純関数単体テスト(3%しきい値・異なる`recipeKey`除外・baselineなし・非有限値・ちょうど3%境界、4.5節)。
- `npm run test && npm run build && npm run lint`が成功する。
- **bundle size差分の報告**: P3-1完了時点の基準値(`dist/assets/index-*.js` 781.47kB / gzip 219.29kB)との差分を完了報告へ明記する。P3-2もproduction配線を行わないため(1.1節)差分ゼロが期待値だが、実測して報告する。
- `git diff --check`・`git diff --stat`・変更ファイル全一覧・全テスト出力(ファイル数・テスト数)・`cmp AGENTS.md CLAUDE.md`を完了報告へ全文出力する。

### 10.7 後続ステップ/フェーズへの申し送り(P3-2完了報告に明記すること。Gate9是正でP3-4限定の見出しから改題——本節はP3-3/Phase5等も対象とする集約台帳であり、完了報告からここを辿れば足りる)

- D04途中段階終了時のノート記録契約(3.5節、Q9案B、型変更の実装)。P3-4向け。
- `RunSnapshot`拡張がP3-4のtrack-run実装(`stepTrackRunWithDestruction`)へどう波及するか。P3-4向け。**波及先の`stepTrackRunWithDestruction`は、正式Fable P3-1-Q9裁定(`stepMotorWithDestruction`のconfig引数削除、`docs/phase3-plan-v12-amendments.md`のP3-1-Q9エントリ)が確立した「走行開始時に確定する構成情報〈config・destructionConfig〉は`accumulator.replaySnapshot`を唯一の出典とし、引数として独立に受け取らない」というPhase 3 wrapper共通不変条件を、`stepTestRunWithDestruction`(Gate6実装済み)と同様に引き継ぐこと。**
- `derailed`/`energyExhausted`のtrack-run文脈での必須網羅(Q8裁定)。P3-4向け。
- `regressionDiff`の実行タイミング・永続化・UI表示(4.5節、A2裁定どおりbrabit所有)。P3-4向け。
- `mapBodyScorchDeltaFraction`/`mapMagnetScorchDeltaFraction`/`mapD04BatteryDestructionConfig`/`mapD07DestructionConfig`を実際に組み合わせてproduction configを組み立てる`assembleD04Config`相当の実装(8節)。P3-4向け。
- P3-1-Q1(D01漸減)のP3-3回収(「D01分岐の追加+較正」、機構自体はP3-2で導入済み、0.3節5・Q12)。P3-3向け。
- **(Gate9是正で追加)Q13-1のoverheated保留pre/post 2面契約(14.2節、`normalizeOverheatedStatusForD04Hold`)を、`stepTrackRunWithDestruction`(P3-4)が必ず同一の共通純関数経由で継承し、独自にロジックを複製しないこと。** `stepMotorWithDestruction`(pre/post契約対象外、motor文脈にD04保留は無関係)・`stepTestRunWithDestruction`(Gate6で実装済み)と同じ規律を維持する。
- **(Gate9是正で追加)Q14裁定によるPhase5申し送り(14.8節に既出、本節から辿れるよう再掲): `hill-climb`×alkalineの実測`maxEnergyUsedRatio=1.1046`(>1.0)は、このコースが将来予算有効化された場合にalkalineが完走不能になるという設計空間の事実である(現時点では`hill-climb`は予算無効コースのため問題化していない)。** Phase5のコース設計・電池較正調整時に参照すること。
- **(正式Fable最終レビュー申し送り、2026-08-09、Phase3レビューC5残余——契約変更ではなく既存確定条件のリマインド)**: P3-3 DoD必須——「D02発煙のみ」(D02が発煙相当の閾値には到達するがburnout条件には未到達の場合)では`terminalModeCandidates`が増えないことを固定する負例テスト。加えて「D05」は非終端モードそのものであるため、D05由来のいかなるイベントも`terminalModeCandidates`へ追加されないこと(`classifyTerminalModes`にD05分岐が存在しないという分類規則レベルの事実)を負例テストで固定すること。P3-4 DoD必須——「D09摩擦増のみ」(D09が摩擦増大の閾値には到達するが焼付き条件には未到達の場合)では`terminalModeCandidates`が増えないことを固定する負例テスト。D04の「膨張のみ」「発煙のみ」に相当する負例(C5負例2件、3.6節)はP3-2で既に消化済み。

---

## 11. ゲート分割・レビューゲート(案C、Suu_mot3裁定による依存順是正)

**背景**: 当初のサブステップ分割(v6/v7、「materialMapping.tsの写像+sweep証跡」を単独の先行ステップとする案、以下「案A」)は、写像関数`mapD04BatteryDestructionConfig`/`mapD07DestructionConfig`の**戻り値型自体**がゲート1(型契約)で拡張される型に依存し、かつsweep証跡が`advanceD04`/`advanceD07`(ゲート3)・`composeEffectiveMotorConfig`(ゲート4)の実在を前提とするため、単独では完結できないことが判明した(2026-08-08、alice_mot3発見・Suu_mot3裁定)。型・写像・状態機械・wrapper・較正を一括化する案(「案B」)も検討したが、独立レビュー性を失うため不採用。**契約・初期候補値・受け入れ条件・最終DoD(10節)はいずれも変更せず、実装順序のみを次の10ゲート(0〜9)へ再編する(案C、Suu_mot3裁定)。**

### 11.0 ゲート0: AGENTS.md/CLAUDE.md現状同期+人間再承認バンドル承認確認(完了済み)

計画承認後、実装着手前に実施する。人間再承認バンドル6項目(別文書`docs/phase3-p3-2-human-reapproval-bundle.md`)の承認確認を含む。**2026-08-08、Suu_mot3独立確認により通過済み。**

### 11.1 ゲート1: 型契約+validatorゲート

**内容**: `destructionModes.ts`の人間再承認済み型拡張——`BatteryDestructionConfig`(lipo枝)への`internalResistanceDegradationMultiplier`追加、`DestructionConfig.d04`新設、`DestructionConfig.d07`の`{thermal,irreversible}`2部構成への再設計、`D04Progress.initiatingCauseLog`追加、`D04CauseLog.initiatingCause`追加、`UnstampedDestructionEvent`のD04/D07バリアントへdeltaFractionフィールド追加、`validateFireExposureProfile`への重複拒否ロジック追加。`destructionOrchestration.ts`側の`DestructionConfigDraft`・`validateDestructionConfig`・`validateDestructionConfigRawShape`・`validateD04ProgressShape`・`validateD04CauseLogShape`(交差不変条件3条を含む)への対応する拡張。

**非スコープ**: `advanceD04`・`advanceD07`本体の実装は行わない(ゲート3)。`composeEffectiveMotorConfig`・`materialMapping.ts`の写像関数も行わない(ゲート2・4)。

**依存閉包(実測、pitfalls#2)**: 以下、型変更ごとに`rg`で実測した機械的追従の対象ファイルを列挙する(件数要約ではなく実ファイル・実行番号)。

| 変更対象型/関数 | 参照する全ファイル(`rg`実測) | 具体的な追従箇所 |
|---|---|---|
| `BatteryDestructionConfig` | `src/materials/materialMapping.ts`・`src/engine/destructionOrchestration.ts`・`src/engine/destructionModes.ts` | `destructionModes.ts`(型定義本体、55-63行目)。他2ファイルは型のみ参照、フィールド追加への機械的追従は不要(既存の`profile`判別のみに依存するコードのため) |
| `DestructionConfig` | `src/engine/destructionOrchestration.ts`・`src/materials/materialMapping.ts`・`src/engine/destructionModes.ts`・`src/materials/__tests__/materialMapping.test.ts`・`src/engine/__tests__/destructionModes.test.ts`・`src/engine/__tests__/destructionOrchestration.test.ts`・`src/store/__tests__/saveStore.test.ts`・`src/store/__tests__/runOutcomeApplication.test.ts` | `destructionModes.ts`(型定義本体、67-74行目)。テスト4ファイルは`DestructionConfig`リテラルfixtureを構築しており、`d04`新設フィールドの追加+`d07`の`{thermal,irreversible}`再設計への機械的追従が必要(下表で実行番号を列挙) |
| `D04Progress` | `src/engine/destructionModes.ts`のみ | 型定義本体+`createInitialDestructionState`のlipo初期値へ`initiatingCauseLog: null`追加 |
| `D04CauseLog` | `src/engine/destructionModes.ts`のみ | 型定義本体へ`initiatingCause`追加 |
| `UnstampedDestructionEvent` | `src/engine/destructionOrchestration.ts`・`src/engine/destructionModes.ts` | 型定義本体(`destructionModes.ts`)+`DestructionEvent`公開型(`UnstampedDestructionEvent & {physicsSnapshotAtT}`という既存の分配型のため`destructionOrchestration.ts`側は自動追従、明示変更不要) |
| `DestructionEvent`(公開型) | `src/engine/destructionOrchestration.ts`・`src/engine/__tests__/destructionOrchestration.test.ts`・`src/store/runOutcomeApplication.ts` | `runOutcomeApplication.ts`は型のみ参照(`import type`)、フィールド追加への機械的追従は不要 |
| `validateFireExposureProfile` | `src/engine/destructionOrchestration.ts`(re-export)・`src/engine/destructionModes.ts`(定義)・`src/engine/__tests__/destructionOrchestration.test.ts` | 定義本体(`destructionModes.ts`)へ重複拒否ロジック追加。テストへ重複入力の負例追加 |
| `validateDestructionConfig`/`validateDestructionConfigRawShape` | `src/engine/destructionOrchestration.ts`・`src/engine/__tests__/destructionOrchestration.test.ts` | `d04`セクションの検証新規追加、`d07`セクションを`{thermal,irreversible}`構成の検証へ全面拡張 |
| `DestructionConfigDraft` | `src/engine/destructionOrchestration.ts`・`src/engine/destructionModes.ts`・`src/engine/__tests__/destructionOrchestration.test.ts` | `d04?`フィールド追加、`d07?`を`{thermal,irreversible}`構成へ変更 |

**`DestructionConfig`リテラルfixtureの実行番号一覧(`d02:`/`d07:`双方を実測、`d04`は新設のため出現なし)**: `src/engine/__tests__/destructionModes.test.ts`(33-36行目・310-313行目、計2箇所)・`src/engine/__tests__/destructionOrchestration.test.ts`(68-71行目、1箇所)・`src/store/__tests__/runOutcomeApplication.test.ts`(606-609行目、1箇所)・`src/store/__tests__/saveStore.test.ts`(42-45行目、1箇所)。計5箇所すべてへ`d04: {bodyScorchDeltaFraction, magnetScorchDeltaFraction}`の追加と、`d07:`を`{thermal:{...}, irreversible:{kind:'demagnetizing',...}}`構成へ書き換える機械的追従が必要。`src/materials/__tests__/materialMapping.test.ts`は現時点で完全な`DestructionConfig`リテラルを構築していない(`rg`実測、0箇所)。

**DoD(このゲート限定)**: `tsc -b`が通ること。型・validator・`restoreRunSnapshot`関連の正負例テスト(交差不変条件3条・重複拒否負例を含む)が通ること。上記5箇所の既存fixtureがすべて新フィールドを含む形へ機械的に更新され、既存のD01/D03関連テストの結果が変化しないこと(回帰確認)。`npm run build`が成功すること(`advanceD04`/`advanceD07`本体が未実装のため、これらを呼び出す新規ロジックは存在しない=既存のexportされる関数の型のみが変わる状態)。

### 11.2 ゲート2: materialMappingゲート

**内容**: `BodyMaterialId`のexport、`mapD04BatteryDestructionConfig`・`mapBodyScorchDeltaFraction`・`mapMagnetScorchDeltaFraction`・`mapD07DestructionConfig`の実装。純関数の単体テスト、全磁石素材の`magnetScorchDeltaFraction >= demagnetizationDeltaFraction`不等式、nonDemagnetizing磁石の写像値0まで(8節)。

**前提**: ゲート1(型契約)完了。**非スコープ**: 物理到達sweep(M4条件・Q11受け入れ条件・Q2定常RPM低下)は含めない(ゲート5)。

**DoD(このゲート限定)**: 8節「ゲート2の単体テスト」の全項目。

### 11.3 ゲート3: 状態機械ゲート+`deriveDegradationDiffs`拡張(P3-0-Q6同時実装)

**内容**: `advanceD04`・`advanceD07`・`advanceD04StageBoundary`の実装(2.2節・2.3節・2.5節)。状態遷移・event発行の単体テスト(dt分割不変性、C5負例2件を含む)。nonDemagnetizing磁石でD07の状態(`reversibleDroopActive`/`irreversibleTriggered`)が真にならない負例はこのゲートで実装する(2.5節、Q11負例)。**`deriveDegradationDiffs`のD04/D07拡張(2.4節、`event.bodyScorchDeltaFraction`・`event.magnetScorchDeltaFraction`・`event.demagnetizationDeltaFraction`を読み取り`DegradationDiff`を構築する分岐)、およびD04/D07 eventから最終`degradationDiffs`までを一気通貫で検証するテストも、本ゲートで同時に実装する。**

**理由(正式P3-0-Q6不変条件の遵守)**: 正式Q6は「`advanceDestructionState`は差分換算が実装済みのモードのeventしか発行してはならず、各モードの実装ステップで対応する差分換算を同一ステップに置く」ことを契約する。`advanceD04`/`advanceD07`をこのゲートで`advanceDestructionState`へ接続してD04/D07 eventが発行可能になった時点で、対応する`deriveDegradationDiffs`拡張が未実装のままだと、「eventは発行できるが差分換算されない」という中間状態がQ6不変条件に違反する。したがって`deriveDegradationDiffs`拡張は、D04/D07 eventを発行可能にするのと**同一ゲート**で実装しなければならない(旧v8ではゲート6に残っており、ゲート3完了時点の中間状態がQ6違反になっていた——不正)。

**前提**: ゲート1完了(型)・ゲート2完了(写像関数、`mapXxx`が返す較正値をテストfixtureで一貫して使うため)。

**DoD(このゲート限定)**: 10.1節・10.2節の該当項目(events固定順序・isFirstThisSession二重発行防止・causeLog初回固定・physicsSnapshotAtT同一step・**P3-0-Q6ホワイトリスト〈D04/D07 event発行時点でderiveDegradationDiffsが対応済みであることを含む〉**・affectedRoles重複禁止のうち`validateFireExposureProfile`側の負例、initiatingCauseLog/initiatingCauseの正負例)。C5負例2件(3.6節)。D04/D07 eventから`degradationDiffs`までの一気通貫テスト(2.4節)。

### 11.4 ゲート4: 実効configゲート

**内容**: `composeEffectiveMotorConfig`の新設(2.0節。**単体テストから直接呼び出せるよう`export`関数として実装する**——新設純関数の可視性追加であり既存公開契約の変更ではない、`classifyTerminalModes`のexport化と同型、v11改訂・Suu_mot3裁定)、`stepMotorWithDestruction`の内部改修(2.1節、Q10裁定により人間再承認不要)、**`computeEnergyBudgetJ`の`export`化(`trackPhysics.ts`、関数本体は無改修)**、**`src/engine/__tests__/trackPhysics.test.ts`のPhase 2 Step5b時点の「非exportのまま」という古いコメントをexport化の事実へ訂正(アサーション本体は無改修)**、予算不変性テスト(付帯条件1。**export済みの実`computeEnergyBudgetJ`と実`composeEffectiveMotorConfig`を直接importして呼び出す**、テスト内での式の複製は二重出典になるため行わない)、既存P3-1テストの回帰確認、非自明経路のリプレイ等価テスト。

**理由(依存順是正、v10改訂)**: 予算不変性テスト(付帯条件1、10.1節)は「`composeEffectiveMotorConfig`合成前後で`computeEnergyBudgetJ`の値が一致する」ことを実関数呼び出しで直接検証する契約であり、単一出典原則によりテスト内で計算式を複製することはできない。したがって`computeEnergyBudgetJ`の`export`化は、このDoDを実装するゲート4自身で完了していなければならない。**v9まではこのexport化がゲート5に残っており、ゲート4完了時点で承認済みDoDを単一出典で実装できない依存順違反になっていた**(2026-08-08、Suu_mot3のゲート4着手前検査で発見・裁定)。

**理由(実装可能性追補、v11改訂)**: 付帯条件1のテストは`composeEffectiveMotorConfig(...)`自体を別ファイル(`src/engine/__tests__/destructionOrchestration.test.ts`)のVitestから直接呼び出して`computeEnergyBudgetJ`へ渡す必要がある。2.0節の`composeEffectiveMotorConfig`が非export関数のままでは別ファイルから呼び出せず、間接テスト(`stepMotorWithDestruction`経由等)では「合成後configの予算が不変」を直接固定できず、かといってテスト内で合成処理を複製すれば二重出典になる。したがって`composeEffectiveMotorConfig`自体も`export`関数として実装しなければ、ゲート4 DoDをコードとして実行できない(2026-08-08、Suu_mot3のv10照合で発見・裁定)。

**前提**: ゲート3(`advanceD04`/`advanceD07`が`DestructionState`を更新できること)完了。

**変更ファイル(このゲート限定)**: `src/engine/destructionOrchestration.ts`(`composeEffectiveMotorConfig`を`export`関数として新設、`stepMotorWithDestruction`内部改修)、`src/engine/__tests__/destructionOrchestration.test.ts`(下記4項目を本ファイルで実装する)、`src/engine/trackPhysics.ts`(`computeEnergyBudgetJ`へ`export`キーワード追加、本体無改修)、`src/engine/__tests__/trackPhysics.test.ts`(コメント訂正のみ、アサーション本体は無改修)。

`src/engine/__tests__/destructionOrchestration.test.ts`で実装する項目(v11改訂で明記):
- `composeEffectiveMotorConfig`のD04/D07各分岐の単体テスト(D04 swelling/smoking適用・非適用、D07可逆/不可逆の重畳適用・非適用)
- D07の合成順序が乗算の可換性により結果へ影響しないこと(可換な単一式であること)の確認
- 同一入力から常に同一出力を返すこと(決定論的純関数であることの確認)
- export済みの実`computeEnergyBudgetJ`を使う予算不変性テスト(付帯条件1、`computeEnergyBudgetJ(baseMotorConfig) === computeEnergyBudgetJ(composeEffectiveMotorConfig(...))`を直接呼び出しで検証)
- `stepMotorWithDestruction`の既存P3-1テストケース(D01/D03のみ発火)の回帰確認
- D04/D07が発火する非自明経路でのリプレイ等価性テスト

**DoD(このゲート限定)**: 10.1節の予算不変性テスト(export済みの実`computeEnergyBudgetJ`・実`composeEffectiveMotorConfig`を直接使用)、10.5節のリプレイ等価性・既存回帰(**`computeEnergyBudgetJ`の既存回帰——`export`化後も既存`stepTrackRun`内部呼び出し・既存`trackPhysics.test.ts`の全テストが変化なく成功すること——を含む**)。

### 11.5 ゲート5: 較正sweepゲート

**内容**: M4到達可能性3条件(3.3節)・D07 Q11受け入れ条件4つ(2.5節)・Q2独立sweep条件(定常RPM低下観測)・短絡経路の解析的結合条件(3.2節付帯条件3)を実測し、8節の初期候補値(1.5・0.95・0.10・0.15)を確定する。sweep証跡の実装場所は`src/materials/__tests__/materialMapping.test.ts`のまま(8節)。**`computeEnergyBudgetJ`の`export`化はゲート4で完了済み(v10改訂)であるため、本ゲートのM4 test-only harnessは既にexport済みの実関数をそのまま利用する(本ゲートでの新規export作業は発生しない)。**

**`buildVehicleFrameInput`のゲート6→5前倒し(v12改訂、Suu_mot3裁定)**: `src/engine/destructionOrchestration.ts`へ`export function buildVehicleFrameInput(...)`(5.3節)を新設する。M4/D07 test-only harness(3.3節)が`stepTrackRun`と本関数の両方へ同一の実効config(`composeEffectiveMotorConfig`)を渡す単一出典契約を、harness内でframe組み立て式を複製せず実関数を直接importして検証するため。`stepTestRunWithDestruction`本体・`RunSnapshot`拡張・`contractVersion`→2・`slopeRad`配線はゲート6のまま変更しない。

**理由(依存順是正、v12改訂)**: 計画v11 §3.3のM4 harnessは各stepで`buildVehicleFrameInput(effectiveConfig, prevVehicleState, vehicleState)`を呼び、`stepTrackRun`と破壊frameへ同じ実効configを使う単一出典契約を前提とする。しかし`buildVehicleFrameInput`の新設は旧v11まで§11.6ゲート6に残っており、現行srcにも存在しない。ゲート5の実装場所は`materialMapping.test.ts`(ゲート6より前)であるため、ゲート6を待たずにゲート5を完了するには「frame式の複製」か「未存在関数の参照」のいずれかが必要になり、単一出典原則によりどちらも許されない依存順違反になっていた(2026-08-08、Suu_mot3のゲート5着手前検査で発見・裁定)。

**前提**: ゲート3(`advanceD04`/`advanceD07`)・ゲート4(`composeEffectiveMotorConfig`、`computeEnergyBudgetJ`のexport化)完了。

**変更ファイル(このゲート限定)**: `src/engine/destructionOrchestration.ts`(`buildVehicleFrameInput`を`export`関数として新設、5.3節。**v15追加: `normalizeOverheatedStatusForD04Hold`を`export`純関数として新設、14.2節**)、`src/engine/__tests__/destructionOrchestration.test.ts`(**v15追加: 上記純関数の単体テスト・同一step境界4ケース・保留窓有界性テスト、14.2節・14.6節**)、`src/materials/__tests__/materialMapping.test.ts`(M4/D07 harnessが同関数を直接importして使用、sweep証跡本体。**v15追加: pre/post契約でのvehicle harness実装+保留込み決定論・リプレイ等価テスト**)。

**DoD(このゲート限定)**: 8節「ゲート5のsweep証跡」の全項目、10.6節の該当項目(D07 Q11の4条件・M4到達可能性・短絡経路sweep確認)。**M4/D07 harnessが`stepTrackRun`と`buildVehicleFrameInput`の両方へ同一の`effectiveConfig`を渡すこと、および`theoreticalCurrentA`・`energyUsedRatio`等のframe値をharness/テスト側で再計算・複製しないこと(実`buildVehicleFrameInput`をそのままimportして使用すること)を明記する。**

**M4条件(3)・stageDurations候補の更新(v14改訂、正式Fable補足裁定Q13-1)**: 上記M4到達可能性3条件のうち条件(3)、および3.2節の短絡経路解析的裏付け(`swellingS + smokingS`と`runawayHeatThreshold`到達から`overheated`到達までの時間窓の競合)は、**overheated保留規則の導入により再定式化された**(14.1節)。ゲート5の残作業・新しいstageDurations初期候補(0.35/0.25秒)・再定式化された条件(3)の正例・負例は14.6節を参照。本ゲートのDoDは、保留規則の人間再承認完了後、14.6節の残作業3点の充足をもって満たされたものとする。

### 11.6 ゲート6: `RunSnapshot`拡張+`stepTestRunWithDestruction`

**内容**: `RunSnapshot`/`CaptureRunSnapshotInput`/`RestoredRunSnapshot`/`captureRunSnapshot`/`restoreRunSnapshot`への`courseLengthM`・`slopeRad`追加+`contractVersion`→2(5.2節)、`stepTestRunWithDestruction`の新設(5.1節、M-2是正の`slopeRad`配線を含む)。**`buildVehicleFrameInput`はゲート5で新設済み(v12改訂)であるため、本ゲートでは既存の同関数を`stepTestRunWithDestruction`から利用するのみで、新設作業は発生しない**(5.3節)。**`deriveDegradationDiffs`のD04/D07拡張はゲート3で実装済みのため、本ゲートでは扱わない**(P3-0-Q6不変条件遵守のため、event発行可能化と同一ゲートで実装する必要があった、11.3節参照)。

**前提**: ゲート1〜5すべて完了(型・写像・状態機械・実効config・`buildVehicleFrameInput`・較正sweepの値が確定済みであること。特に`stepTestRunWithDestruction`は`composeEffectiveMotorConfig`〈ゲート4〉・`buildVehicleFrameInput`〈ゲート5〉を呼ぶ)。

**DoD(このゲート限定)**: 10.1節のdt分割不変性(該当があれば)、10.4節の`stepTestRunWithDestruction`termination契約全項目、`RunSnapshot`拡張後の全負例(5.2節)。

### 11.7 ゲート7: store fixture統合

**内容**: 9節の3文脈(motor-only/test-run/track-run)fixture統合テスト。`deriveFireExposureProfileFromLoadout`の新設・単体テスト(3.4節)。

**前提**: ゲート1〜6すべて完了。

**DoD(このゲート限定)**: 10.2節の`affectedRoles`重複禁止(production構築確認)、10.3節の劣化適用・store統合の原子性全項目、10.4節の`stepTestRunWithDestruction`をtrack-run文脈へ渡さない固定。

### 11.8 ゲート8: `src/materials/regressionDiff.ts`(三段開示段階2骨格)

他ゲートと独立して着手可能(型設計・baseline方式とも確定済み、4.5節)。**DoD(このゲート限定)**: 4.5節のP3-2純関数テスト契約全項目。

### 11.9 ゲート9: 最終docs/全体DoD

`AGENTS.md`/`CLAUDE.md` pitfalls同期(該当があれば)、`docs/phase3-plan-v12-amendments.md`への実装状態証跡の追補(P3-2-Q1〜Q12エントリ自体はv6 docsゲートで既に追記済み、改訂4。ここでは実装完了後の実ファイル名・実テスト名等の実装状態証跡のみを既存エントリを書き換えずに追補する、2026-08-04の「実装状態追補」と同型のパターン)、10節の全体DoDの最終確認。

**各ゲートとも、実装後は変更ファイル一覧・対象テスト全文・`npm run test`/`build`/`lint`結果・`git diff --check`をSuu_mot3へ報告し、レビュー通過後に次のゲートへ進む。**

---

## 12. 変更対象ファイル一覧

### 12.1 alice_mot3所有(production)

| ファイル | 変更内容 |
|---|---|
| `src/engine/destructionModes.ts` | `advanceD04`・`advanceD07`・`advanceD04StageBoundary`本体追加、`void runContext;`削除、`DestructionConfig`へ`d04`セクション追加+`d07`を`{thermal, irreversible}`へ再設計、`D04Progress.initiatingCauseLog`追加+`createInitialDestructionState`のlipo初期値へ`initiatingCauseLog: null`追加、`D04CauseLog.initiatingCause`追加、`validateFireExposureProfile`の重複拒否追加、`UnstampedDestructionEvent`のD04/D07バリアントへdeltaFractionフィールド追加 |
| `src/engine/__tests__/destructionModes.test.ts` | 上記のテスト+P3-0-Q6不変条件ホワイトリスト拡張+dt分割不変性テスト(M-1是正版) |
| `src/engine/destructionOrchestration.ts` | `composeEffectiveMotorConfig`新設、`stepMotorWithDestruction`の内部改修、`deriveDegradationDiffs`拡張、`stepTestRunWithDestruction`・`buildVehicleFrameInput`新設、`RunSnapshot`/`CaptureRunSnapshotInput`/`RestoredRunSnapshot`/`captureRunSnapshot`/`restoreRunSnapshot`拡張(`courseLengthM`・`slopeRad`)、`validateDestructionConfig`/`validateDestructionConfigRawShape`のd04セクション追加+d07拡張、`validateD04ProgressShape`/`validateD04CauseLogShape`へ`initiatingCauseLog`/`initiatingCause`の深い検証+交差不変条件を追加、`computeEnergyBudgetJ`のimport/re-export。**v15追加**: `normalizeOverheatedStatusForD04Hold`(overheated保留規則の正規化純関数、14.2節)新設 |
| `src/engine/__tests__/destructionOrchestration.test.ts` | 上記のテスト全般+回帰テスト+`RunSnapshot`拡張後の検証テスト。**v15追加**: `normalizeOverheatedStatusForD04Hold`の単体テスト(入力非破壊含む)+同一step境界4ケース(14.2節)+保留窓有界性テスト |
| `src/engine/trackPhysics.ts` | `computeEnergyBudgetJ`へ`export`追加(本体無改修) |
| `src/engine/__tests__/trackPhysics.test.ts` | Phase 2 Step5b時点の古いコメント訂正(コメントのみ) |
| `src/materials/materialMapping.ts` | `BodyMaterialId`の新規export、`mapD04BatteryDestructionConfig`・`mapBodyScorchDeltaFraction`・`mapMagnetScorchDeltaFraction`・`mapD07DestructionConfig`新設 |
| `src/materials/__tests__/materialMapping.test.ts` | 上記のテスト+sweep証跡+不等式テスト+nonDemagnetizing負例 |
| `src/materials/regressionDiff.ts`(新規) | 三段開示段階2骨格 |
| `src/materials/__tests__/regressionDiff.test.ts`(新規) | 上記のテスト |
| `src/store/runOutcomeApplication.ts` | `deriveFireExposureProfileFromLoadout`新設(3.4節、純関数のみ。gameStore.tsからの呼び出し配線はP3-4)。`EquipmentLoadout`/`EquipmentIdSnapshot`型自体は無改修 |

### 12.2 alice_mot3所有(fixtureテスト+新規純関数の単体テスト)

| ファイル | 変更内容 |
|---|---|
| `src/store/__tests__/runOutcomeApplication.test.ts` | D04/D07のfixture統合テスト+`deriveFireExposureProfileFromLoadout`の単体テスト(重複不能性の確認)。Q9裁定によりP3-2では`PendingNotebookRecord`系3型の型変更を行わない |
| `src/store/__tests__/saveStore.test.ts` | `RunSnapshot`拡張後のヘルパー関数追従 |

### 12.3 docs-only

| ファイル | 変更内容 |
|---|---|
| `AGENTS.md`・`CLAUDE.md` | プロジェクトの現状更新(ゲート0) |
| `docs/phase3-plan-v12-amendments.md` | P3-2-Q1〜Q12エントリ+P3-1-Q1返済記録の追補は**v6 docsゲート時点で追記済み**(改訂4)。ゲート9(11.9節)では実装状態証跡のみを追補する |
| `docs/phase3-p3-2-human-reapproval-bundle.md`(新規) | 人間再承認バンドル6項目のみを値・型・実装時期まで判断できる形でまとめた短文書(本計画とは分離) |

### 12.4 変更しないファイル

`src/store/gameStore.ts`・`src/store/gameStore.test.ts`・`src/store/saveStore.ts`本体(P3-2ではQ9の型変更を実装しないため)・UIコンポーネント全般。

---

## 13. 人間再承認バンドル(確定、6項目+ゲート5較正裁定分1項目)

**正式Fable裁定により確定した人間再承認対象は次の6項目のみである。Q10(stepMotorWithDestruction内部改修)・Q12(D01漸減返済先)は再承認不要と明示的に裁定されており、このバンドルに混ぜない。** 詳細(値・型・実装時期)は別文書`docs/phase3-p3-2-human-reapproval-bundle.md`(12.3節)にまとめる。

| # | 対象 | 変更内容 | 対応するQ |
|---|---|---|---|
| 1 | `DestructionConfig.battery`(lipo枝) | `internalResistanceDegradationMultiplier: number`フィールド追加(初期候補値1.5) | Q1 |
| 2 | `D04CauseLog`/`D04Progress` | `D04CauseLog.initiatingCause`+`D04Progress.initiatingCauseLog`フィールド追加(案b) | Q4-3 |
| 3 | `validateFireExposureProfile` | `adjacentRolesEquipped`の重複拒否を追加(既存公開validatorの受理契約を狭める、案a) | Q4-5 |
| 4 | `DestructionConfig` | `d04: {bodyScorchDeltaFraction, magnetScorchDeltaFraction}`セクション追加+`d07`を`{thermal, irreversible}`の2部構成へ再設計(`reversibleDroopMultiplier`・`demagnetizationDeltaFraction`含む)、`UnstampedDestructionEvent`のD04/D07バリアントへ対応フィールド追加 | Q5・Q11 |
| 5 | `RunSnapshot`/`CaptureRunSnapshotInput`/`RestoredRunSnapshot` | `courseLengthM`・`slopeRad`追加、`contractVersion`→2 | Q6 |
| 6 | `PendingNotebookRecord`3腕(`ExperimentSession`/`VehicleTestRunNotebookRecord`/`CourseRunNotebookRecord`) | 方針承認のみ(`finalDestructionState: DestructionState`追加、実装はP3-4) | Q9 |

その他(`advanceD04`/`advanceD07`本体実装、`advanceD04StageBoundary`新設、`stepTestRunWithDestruction`新規実装、`buildVehicleFrameInput`新設、`computeEnergyBudgetJ`のexport化、`composeEffectiveMotorConfig`新設、`mapD04BatteryDestructionConfig`/`mapBodyScorchDeltaFraction`/`mapMagnetScorchDeltaFraction`/`mapD07DestructionConfig`新設、`stepMotorWithDestruction`内部改修〈Q10〉)は新規関数の追加・可視性追加、または既存凍結契約の履行のみであり、人間再承認は不要。

**v14追加(ゲート5較正裁定分、正式Fable補足裁定Q13-1、2026-08-09)**:

| # | 対象 | 変更内容 | 対応するQ |
|---|---|---|---|
| 7 | overheated保留規則(M4条件(3)再定式化+`docs/phase3-plan-v12-amendments.md`のPhase3-Q2適用範囲注記を含む) | 電池がlipoでD04 stageが`{swelling, smoking}`の間、`overheated`終端を保留する(14.1節・14.5節) | Q13-1 |

**#7のみが本裁定分の人間再承認対象である**(14.7節)。新しい`stageDurations`初期候補(0.35/0.25秒)・Q13-2の`NORMAL_OPERATION`定義群は個別再承認不要(14.7節、既存のD03較正確定・Q8原則適用と同型の扱い)。**#7は人間再承認済み(2026-08-09T06:20、人間プロジェクトリード「overheated保留規則1点を再承認します」、Suu_mot3中継確認済み)。ゲート5残作業(14.6節)の着手が解禁された。**

---

## 14. ゲート5較正裁定反映(正式Fable、2026-08-09、人間プロジェクトリード直接提示)

**背景**: ゲート5(11.5節)のM4到達可能性条件(3)・D07 Q11との整合性確認のため、alice_mot3がproduction-valid構成でfeasibility実測sweepを実施した結果、離散時間シミュレーションとして達成可能な真に最速のentryでも、D04の`swelling`→`smoking`→`burning`の2段階分の遷移時間に、art-spec §7の12fps格子1個(0.0833秒)以上を各段階へ割り当てることと、既存の`overheated`終端(`batteryHeat >= BATTERY_HEAT_LIMIT`)より先に`burning`へ到達すること(M4条件(3))が、値の調整では両立不可能な構造的対立にあることが判明した(`docs/phase3-p3-2-gate5-calibration-review-request.md`Q13-1として提出、v4がSuu_mot3最終照合を通過し正式Fable補足裁定へ提出)。本節はこの裁定(Q13-1〜Q13-3)を計画へ自己完結反映する。**本節は正式Fable回答の反映であり、alice_mot3の解釈・提案ではない**(pitfalls#1、Suu_mot3による中継確認済み)。

### 14.1 Q13-1裁定: overheated保留規則(D04段階時間とUI識別可能性の構造的対立の解消)

**裁定の核心**: これは優先度の問題ではなく、**同一現象の二重表現の問題**である。V2由来の`overheated`終端(`batteryHeat >= 1.0`で走行凍結)と、D04の熱暴走進行(`runawayHeatThreshold`到達→膨張→発煙→炎上)は、同じ物理過程(電池の熱的破局)の2つのモデルである。D04導入以前、`overheated`は「電池が熱的限界に達した」ことの唯一の表現だった。D04が熱暴走の実過程をモデル化した今、両者を競争させると、粗いモデル(即時凍結)が精密なモデル(段階進行)を常に途中で殺してしまう(ゲート5是正版のfeasibility実測表1〜3が示した構造)。実物のリポは温度限界に触れた瞬間に給電を止めたりせず、熱暴走に入った電池は破局(発煙・発火)まで進行する。

**保留規則(確定)**: 電池が`lipo`で、D04の`stage`が`{swelling, smoking}`にある間、`overheated`終端は成立しない(熱暴走の表現はD04状態機械が専有する)。この間もbatteryHeatゲージは既存どおり0〜1にclampされたまま表示され続ける(計器が振り切れ、電池が膨らみ、煙が出て、燃える——という実物どおりの列がプレイヤーに見える)。`burning`到達で従来どおり即時`destructionTerminal`。

**Phase3-Q2との関係(確認事項への回答)**: 抵触しない、が無言では済まさない。Phase3-Q2(§15重点質問Q2、`docs/phase3-fable-review.md`59行目・`docs/phase3-plan-v12.md`804行目「正式Fable Q2回答」)が禁じたのは「物理終了後の継続step」である。本裁定は物理終了の定義から重複表現(暴走進行中の`overheated`)を除くのであって、終了後に踏み続けるのではない。Phase3-Q2の作動規則はすべて生き残る——`energyExhausted`・`stalled`・`derailed`・`manualAbort`は保留しない(電池が空になる・車が止まるのは過熱と別の物理過程であり、これらで走行が終われば段階は従来どおり途中凍結する)。保留対象は`overheated`のみ、根拠は「同一過程の重複表現」のみである。**この線引きはPhase3-Q2そのものの適用範囲を精密化する注記として`docs/phase3-plan-v12-amendments.md`へ別途追記する(14.5節参照、確定した既存裁定を上書きする手続きとして人間再承認対象とする)。**

**有界性(安全性の証明)**: 保留は無限延命ではない。正式P3-2-Q4(ii)裁定(段階タイマー不可逆進行)により、`swelling`突入から`swellingS + smokingS`後に`burning`が必ず成立する。よって保留窓は段階合計時間で厳密に有界である。**「保留発動後、`swellingS + smokingS`以内に`burning`終端すること」をテストで固定する(14.6節DoD)。**

**却下案の理由**:
- **案(a)却下(0.05秒への時間圧縮を演出上の割り切りとして受容)**: 三重に不利であり不採用。(i) art-spec §7の12fps格子規律に違反する、(ii) UI側の「疑似的に引き延ばす演出」は演出専用state禁止原則(v12「HUD読み取り専用境界」)への抵触リスクを伴う、(iii) 物理的にも劣る——実物の熱暴走は秒単位で進行するものであり、0.05〜0.1秒への圧縮は保留規則より遥かに大きな嘘になる。
- **案(c)却下(`BATTERY_HEAT_LIMIT`/`HEAT_DISSIPATION`等の既存熱物理式側を再較正)**: `BATTERY_HEAT_LIMIT`/`HEAT_DISSIPATION`はV2凍結核であり、確定したばかりのD03較正値(`shortCircuitDurationLimitS=3.0秒`)がこれに依存する。D04固有の表現問題を解くために全電池・全モードの熱挙動を動かすのは道具が違う。

**実装制約(確定)**:
- 保留はwrapper層(`src/engine/destructionOrchestration.ts`所有)で実装し、**凍結済みの`src/engine/vehiclePhysics.ts`・`src/engine/trackPhysics.ts`は編集しない**。
- base step(`stepVehicle`/`stepTrackRun`)が`state.status==='overheated'`で早期returnする構造(`vehiclePhysics.ts`380行目・`trackPhysics.ts`188行目、いずれも`state.status`が`finished`/`stalled`/`derailed`/`overheated`のいずれかなら入力stateをそのまま返す既存ガード)であることを踏まえ、wrapperがstatusを正規化して継続stepする(14.2節「実コード確認結果」参照)。
- **wrapper層で実装不能と判明した場合は実装せず停止・エスカレーションすること**(結論: 14.2節のとおり実装可能と判断したが、具体的な実装場所〈新規`stepTrackRunWithDestruction`か、より小さな正規化用純関数か〉はSuu_mot3照合で確定させる、14.2節)。
- 決定論・リプレイ等価は保留込みで再検証する。

**新しい段階時間の初期候補(確定)**: 保留により時間予算の制約が消えるため、段階を可視の長さへ戻す——**`swellingS = 0.35秒`(12fps格子4個)・`smokingS = 0.25秒`(格子3個)、合計0.6秒**(設計較正値)。制約は2つ残る: (i) 各段階 ≥ 0.0833秒(art-spec §7、この候補値で恒久的に充足)、(ii) 過放電経路のM4条件(2)——条件2実測ではentry(overDischargeRatio≈0.9011)から枯渇(比率1.0)まで約0.86秒であり、0.6秒はマージン約30%で収まるが、**新stageDurationsでのsweepにより再実証すること**(14.3節)。

**M4条件(3)の再定式化(確定)**: 「`overheated`より先」という競争条件は保留規則により消滅したため、次へ置き換える。**正例**: held-short構成で`swelling`→`smoking`→`burning`が`stageDurations`どおり進行して`destructionTerminal`で終端し、`overheated`終端が発火しないこと。**負例**: 非リポのheld-shortでは保留が発動せず、D03の同一フレーム優先規則を含む従来の終端挙動が不変であること。

**既存feasibility表1〜3の扱い**: 対立の存在証明としての役目を終えた(構造的対立が実在することの反証材料として)。保留実装後の再sweepでは新条件系(上記正例・負例)へ差し替えてよい。表自体は是正史として`docs/phase3-p3-2-gate5-calibration-review-request.md`に残す。

### 14.2 実コード確認結果(read-only調査、Suu_mot3指示による)

**base stepの早期returnガード(確認済み)**:
- `src/engine/vehiclePhysics.ts`380行目: `if (state.status === 'finished' || state.status === 'stalled' || state.status === 'derailed' || state.status === 'overheated') { return state; }`(コメント「終端状態の安定性: motorPhysics.step()の静止摩擦クランプと同じ早期returnパターン。自動再始動を構造的に禁止する」)。
- `src/engine/trackPhysics.ts`188行目: `stepTrackRun`が`stepVehicle`を呼ぶ前に同型のガードを二重に持つ(コメント「トラック層でも二重に安定させる」)。
- `overheated`自体は`vehiclePhysics.ts`653行目で`nextMotor.batteryHeat >= BATTERY_HEAT_LIMIT`から**毎フレーム新規に計算される**(sticky flagではない)。したがって、入力stateの`status`を(実際には`overheated`でも)`'running'`へ正規化して`stepTrackRun`/`stepVehicle`へ渡せば、早期returnガードを回避してこの1frameの物理を進めることができ、出力の`status`はこの1frameの`batteryHeat`から再度自然に計算される。
- `batteryHeat`自体は`src/engine/motorPhysics.ts`263行目で`Math.min(BATTERY_HEAT_LIMIT, Math.max(0, ...))`により既に0〜1へclampされている(既存契約、無改修)。「heatゲージは0〜1にclampされたまま表示され続ける」という裁定の要求は、この既存clampだけで自動的に満たされる。

**結論(feasibility)**: 保留規則は「wrapperが次stepの入力state.statusを、hold条件(lipo かつ D04 stage∈{swelling,smoking})が真の間だけ`'running'`へ正規化してからbase stepへ渡す」という設計で実装可能であり、`vehiclePhysics.ts`・`trackPhysics.ts`本体の編集は不要である。

**是正(v15、Suu_mot3必須追補1〜4反映)**: 上記の「次stepの入力だけを正規化する」という設計は、**`none`→`swelling`へ突入する同一step内でbaseが`overheated`を返した場合、呼び出し側がその出力をそのまま終端として確定してしまいうるため不十分だった**——pre正規化はこのstep開始時点の`destructionState`(まだ`D04.stage==='none'`)を参照するため、このstep内でbaseが`overheated`を返した直後に`advanceDestructionState`が`swelling`へ遷移させても、pre正規化だけでは間に合わない。14.2節の設計を次のとおり確定する(v15是正)。

**依存閉包(`rg`実測)**:

| 対象 | 参照箇所 | 本裁定への影響 |
|---|---|---|
| `state.status === 'overheated'`(判定・分岐) | `src/store/gameStore.ts`516行目・591行目、`src/modes/CourseMode.tsx`67行目・216行目、`src/modes/TestRunMode.tsx`27行目 | **影響なし**。これらはすべてV2由来の凍結参考実装(`CLAUDE.md`「V2 UI一式」)であり、`DestructionConfig`/`destructionState`と一切連動していない(P3-0-Q2により production配線はP3-4まで延期)。保留規則はD04の`stage`が存在する経路でのみ発動するため、これらのファイルは変更不要。 |
| `PhysicsEndStatus`型・`convertPhysicsEndStatusToEndReason`・`VEHICLE_STATUS_VALUES` | `src/engine/destructionOrchestration.ts`84・98・118・483行目 | **P3-2ゲート5時点では変更不要**。これらは`RunOutcome`確定(`finalizeRun`)のための型・関数であり、track-run文脈の実wrapper(`stepTrackRunWithDestruction`)が存在しないP3-2時点では、track-run文脈の`overheated`終端が`RunOutcome`へ到達する経路自体がまだ存在しない(1.1節の非対象、P3-0-Q2)。保留込みの`RunOutcome`確定契約は、実wrapperを新設するP3-4のスコープで扱う。 |
| `stepTrackRun`の呼び出し元 | `src/engine/destructionOrchestration.ts`(定義参照コメントのみ)・`src/store/gameStore.ts`570行目 | `gameStore.ts`はV2由来の直接呼び出しであり`DestructionConfig`と無縁(上記と同じ理由で無関係)。**production版`stepTrackRunWithDestruction`は現行srcに存在しない**(`rg`実測でこの2箇所のみ)。 |
| `saveStore.ts`の`VEHICLE_STATUSES`/`RUN_OUTCOME_END_REASONS`定数 | `src/store/saveStore.ts`312・590・620行目 | **影響なし**。値の列挙自体(`'overheated'`という文字列)は変わらない。保留規則は「いつ`overheated`が成立するか」というタイミングの契約であり、`overheated`という終端種別自体を削除・改名するものではない。 |

**設計選択の確定(v15、Suu_mot3裁定)**: 案(a)に確定する(Fableが「保留はwrapper層〈destructionOrchestration所有〉で実装する」と明示的に指定しているため、正規化ロジックをtest-only harness内に閉じ込める案(b)は不採用)。

**新設純関数の契約(確定)**:
```ts
// src/engine/destructionOrchestration.ts へ新設(export純関数)
export function normalizeOverheatedStatusForD04Hold(
  state: VehicleSimState,
  destructionState: DestructionState,
): VehicleSimState {
  // state.status==='overheated' かつ battery.profile==='lipo' かつ
  // battery.d04.stage∈{'swelling','smoking'} の場合だけ、statusを'running'へ
  // 書き換える。batteryHeatを含む他の全フィールドは不変(入力非破壊)。
  // finished/stalled/derailed・nonLipo・D04 stage∈{'none','burning'}のいずれの
  // 場合も絶対に変更しない。
}
```
新設純関数の可視性追加であり、`composeEffectiveMotorConfig`・`buildVehicleFrameInput`(ゲート4・5で同種の理由により先行export済み)と同型のパターンである。**人間再承認事項はQ13-1の1件(14.7節)へ既に包含されており、本関数の新設によって別項目を追加しない。**

**wrapper共通契約(確定、pre/post 2面適用)**: 「次stepの入力だけを正規化する」設計の不備(上記是正)を解消するため、次の前後2面契約を固定する。
- **(pre)** base step(`stepTrackRun`/`stepVehicle`)へ渡す直前に、**prev vehicle state**と**prev destruction state**へ`normalizeOverheatedStatusForD04Hold`を適用し、早期returnガードを回避する。
- **(post)** base step実行後、`advanceDestructionState`を実行して**next destruction state**を得た後、**base stepが返したnext vehicle state**と**このnext destruction state**へ`normalizeOverheatedStatusForD04Hold`を再適用してから、physics end判定/`RunOutcome`分類へ渡す。

post適用が`none→swelling`同一step問題を解消する理由: pre適用の時点ではdestructionStateがまだ`stage==='none'`(このstep開始時点)だが、post適用の時点では同一step内の`advanceDestructionState`が既に`swelling`へ遷移させた**後**のdestructionStateを参照するため、baseが返した生の`overheated`を、同一step内で正しく`running`へ補正できる。

**将来wrapperへの継承(台帳送り)**: 将来実装される`stepTestRunWithDestruction`(ゲート6)・`stepTrackRunWithDestruction`(P3-4)は、**必ずこの同じpre/post契約を使用し、独自の正規化ロジックを複製してはならない**。両実装が`normalizeOverheatedStatusForD04Hold`を直接importして使うことをそれぞれの計画のDoDへ明記する(ゲート6・P3-4の各計画書で本節を参照すること)。

**同一step境界の明記(確定、テスト化対象)**:

| ケース | baseの生の出力 | post正規化後 | 扱い |
|---|---|---|---|
| (a) lipo、next D04 stage ∈ {swelling, smoking} | `status==='overheated'` | `status==='running'`(保留発動) | 保留により終端としない |
| (b) lipo、next D04 stage === 'burning' | (任意) | 正規化しない(素通し) | 保留せず、D04 event(`burning`)を`destructionTerminal`優先で確定する(既存契約どおり) |
| (c) nonLipo(held-short) | `status==='overheated'`(D03経由) | 正規化しない(素通し) | D03の既存同一frame優先規則は不変 |
| (d) `finished`/`stalled`/`derailed`(D04と無関係な終端)、または`manualAbort`/`energyExhausted`終端経路 | 各終端status | 正規化しない(素通し) | 既存の終端挙動は完全に不変 |

これら4ケースはゲート5のDoDへテストとして固定する(14.6節)。

### 14.3 Q13-2裁定: 「通常運用で非到達」の正式定義(Q14精密化反映、2026-08-09)

**一般原則(Q14裁定、2026-08-09、今後の受け入れ条件の作文規則として明記)**: **受け入れ閾値は、その閾値が防ぐ危険が構造的に存在する対象にのみ適用する。** 対象が複数値を取りうる変数(このケースでは「対象電池」)を含む条件を書く際は、閾値の適用範囲を対象無条件の列挙ではなく、その閾値が意味を持つ物理型で条件付けた不変条件形で書くこと。

**案(c)のAND骨格を採用するが、時間窓を一律に定めず、症状の物理型で3分する**(今回の30/90/120秒の不整合は、窓の値の問題ではなく、異なる物理型に同じ「時間窓」という物差しを当てていたことが原因)。

**基準構成(`NORMAL_OPERATION`基準、確定)**: 素材 = {copper-standard, neodymium, pom, 対象電池}、player値すべて既定、攻め入力なし——ゲート5是正版のM4条件1の構成を**正式契約として固定する**。

**第1条件(実在コース完走、Q14精密化により電池物理型別に分離、契約変更ではなく適用範囲の明確化)**: `src/data/tracks.ts`の実在プレイアブル全コースを基準構成で自然完走し、`finished`・破壊イベントゼロ・D07 droop/irreversibleなしであること(全電池共通)。予算条件は電池の物理型で分離する:
- **LiPo(D04過放電経路が構造的に存在する)**: `maxEnergyUsedRatio ≤ 0.85`(`unsafeDischargeStartRatio`0.90に対する設計マージン0.05、従来どおり)。加えて`D04 stage`が`none`であること。`energy-run`の実測0.807は既に適合している。
- **nonLipo(alkaline/NiMH、`BatteryDestructionProgress`判別unionによりD04過放電経路が構造的に不存在)**: エネルギー比に安全上の参照先が存在しないため、条件は**自然完走(`finished`)のみ**とする。`finished`は定義上「枯渇(ratio 1.0)前のゴール到達」と同値であり、`ratio < 1.0`はその言い換えとして条件文に併記してよい。`0.85`(D04固有の`unsafeDischargeStartRatio`から導出された値)を適用する物理的参照先がないため、この閾値はnonLipoへは適用しない。

**根拠(Q14裁定原文)**: 0.85はD04固有の契約値(0.90)からの導出であり、D04を型レベルで持たない電池に適用する物理的参照先がない。alkalineの実測0.997は危険の接近ではなく、`energy-run`というコース(予算管理を競う設計)の意図の正しい発現である——弱い電池ほどぎりぎりで完走するのは、このコースが存在する理由そのものである。

**第2条件(持続挙動)——症状型別**:
- **平衡型**(D07熱ゲージ等、放散と釣り合う量): 時間窓の長さではなく**平衡到達の実証**を要件とする——末尾窓でゲージ増加が止まっていること+平衡値が閾値未満。現行30秒で平衡が示せているなら30秒でよい(根拠コメント付きで固定)。
- **構造型**(D03、D04短絡経路): 通常運用に短絡が存在しないことによる**構造的非到達**。負例テストで固定し、長時間実行のデモは要求しない(不在の実行証明は保証にならない——正式Q8「到達不能な`derailed`/`energyExhausted`は構造的証明の引用+到達可能6種の正例で充足」と同じ原則)。
- **資源枯渇型**(D04過放電経路、**LiPo限定**): 時間窓では定義しない。到達は経過時間でなくエネルギー消費比で決まるため、**LiPoのD04過放電経路については、第1条件のLiPo予算マージン(≤0.85)が正式基準**である(Q14裁定により、この0.85はD04が構造的に存在するLiPoにのみ適用され、D04を持たないnonLipoには適用しない、14.3節冒頭の一般原則・第1条件を参照)。予算無効の長時間フリー走行で通常負荷でも最終的に過放電域へ入るのは、確定裁定どおりの意図仕様であり(残量を使い切る直前まで回せば実物のリポも損傷域に入る)、「通常運用非到達」の反例として扱わない——2026-08-08の90秒実験で観測された挙動は欠陥ではなくこの仕様の実証である。**この1文を計画に固定し、二度と窓の伸縮で議論しないこと。**

### 14.4 Q13-3裁定(非ブロッキング参考): D07較正の優先順位原則

**原則**: 調整コストは「その値に依存して確定済みの裁定・sweep・人間承認の数」に比例する。依存の少ない側から動かす。

**優先順**: (a) D07固有較正値(`conductionCoefficient`等——D07 sweepのみが依存)→(b) D07閾値(`droopThreshold`/`gaugeLimit`——HUD表示とUI 6-Aにも波及するため第2順位)→(c) 素材写像(人間再承認済みで他モードのsweepが依存する共有基盤——最後の手段。動かす場合は依存表で波及先を列挙してから)。(d) Q11受け入れ条件そのものの変更は較正ではなく、alice・Suuの判断では行えない——(a)〜(c)で解決不能であることの実証を添えてFable再裁定+人間承認を経ること。

いずれの調整でも、確定済み較正値(D03の3.0秒等)への波及有無を先に確認する。**現時点でD07 Q11条件2/3はproduction-valid構成の範囲内で既に成立しており(ゲート5是正版appendix B参照)、本節は将来のバランス調整に備えた参考原則であり、Gate 5を一切ブロックしない。**

### 14.5 Phase3-Q2適用範囲注記への相互参照

本節14.1の保留規則がPhase3-Q2(D04即終端裁定)の適用範囲を精密化する注記は、`docs/phase3-plan-v12-amendments.md`へ独立エントリとして追記した(台帳の運用規則「追記専用」に従う)。本計画からは同エントリを参照する形とし、内容を重複記載しない。

### 14.6 ゲート5の残作業とゲート6解禁条件(確定、v15で具体化)

本裁定の反映後、ゲート5の残作業は次の3点である。
1. **保留規則の実装+テスト一式**(14.1節・14.2節)。実装場所・契約は14.2節で確定済み(v15)——`destructionOrchestration.ts`へ`normalizeOverheatedStatusForD04Hold`をexport純関数として新設し、pre/post 2面契約(14.2節)でwrapper(test-only vehicle harness)から適用する。テスト内容:
   - 純関数`normalizeOverheatedStatusForD04Hold`単体テスト(入力非破壊であることを含む——正規化しないケースでは入力stateへの参照がそのまま返る、または少なくとも全フィールドが変化しないことを確認)。
   - 保留窓の有界性テスト(「保留発動後、`swellingS + smokingS`以内に`burning`終端すること」、14.1節)。
   - 同一step境界4ケース(a)〜(d)のテスト(14.2節の表)。
   - test-only vehicle harness(`materialMapping.test.ts`)でのpre/post適用の実装(sweep harnessは`normalizeOverheatedStatusForD04Hold`を直接importし、正規化式をharness内で複製しない)。
   - 保留込みの決定論・リプレイ等価テスト。
2. **`stageDurations = {swellingS: 0.35, smokingS: 0.25}`での新M4条件系sweep**(条件1〜3〈14.1節の再定式化された正例・負例〉+14.3節のQ13-2定義での通常運用確認)。
3. **D07側は再実施不要**(14.4節、Q13-3は非ブロッキングであり現状の実測で条件充足済み)。

新sweep実測が本裁定の受け入れ条件を満たせば、**Fable再裁定は不要**(D03の3.0秒較正確定と同じ手順)。全文を完了報告へ掲載すること。**ゲート6解禁は、保留規則の人間再承認+新sweep充足をもって行う。**

**ゲート5変更ファイルへの追加(v15)**: 11.5節「変更ファイル(このゲート限定)」・12.1節/12.2節の変更対象ファイル一覧へ、`src/engine/destructionOrchestration.ts`(`normalizeOverheatedStatusForD04Hold`新設)・`src/engine/__tests__/destructionOrchestration.test.ts`(上記純関数の単体テスト一式)を追加する(いずれも既存のファイル一覧に既に列挙されているため、変更内容の記述へ本関数を追記する形になる)。

### 14.7 人間再承認一覧(確定、本裁定分)

1. **overheated保留規則**(Phase3-Q2適用範囲注記+M4条件(3)再定式化+台帳追記、14.1節・14.5節)——**本裁定の中核。人間再承認の対象はこの1件のみ。人間再承認済み(2026-08-09T06:20、人間プロジェクトリード「overheated保留規則1点を再承認します」、Suu_mot3中継確認済み)。**
2. `stageDurations`初期候補0.35/0.25秒は、sweep確定手順に載る設計較正値であり個別再承認不要(D03の3.0秒等と同型、完了報告で最終化)。
3. Q13-2の定義群(14.3節)はdocs反映+Suu_mot3照合で足りる(既存Q8原則の適用であり新規契約ではない)。

**ゲート5残作業の着手解禁(2026-08-09T06:20、Suu_mot3指示)**: 上記#1の人間再承認完了により、ゲート5残作業(14.6節)への着手が解禁された。凍結済み`vehiclePhysics.ts`/`trackPhysics.ts`は引き続き編集禁止。wrapper層で実装不能と判明した場合は実装せず停止・エスカレーションする。ゲート6・commit/tag/pushは、ゲート5完了報告のSuu_mot3照合まで禁止継続。

### 14.8 Q14裁定: Q13-2予算条件の対象電池別適用範囲(2026-08-09、人間再承認不要)

Gate5是正過程(必須是正P2)で、Q13-2の`maxEnergyUsedRatio ≤ 0.85`条件が全電池(alkaline/NiMH/LiPo)×実在全5コースで成立するか実測した結果、`energy-run`(唯一の予算有効コース)でalkaline(実測0.9970)・NiMH(実測0.9338)がこの閾値を超過することが判明した(`docs/phase3-p3-2-gate5-normal-operation-review-request.md`Q14として提出)。

**裁定(確定)**: 案(a)を採用する(14.3節へ反映済み)——予算条件を電池の物理型別に分離し、LiPoは`maxEnergyUsedRatio ≤ 0.85`を維持、nonLipo(alkaline/NiMH)は自然完走(`finished`、`ratio < 1.0`と同値)のみを要求する。**これは閾値の弱体化ではなく、D04の閾値を構造的に持たない物理型へ正しい物差しを分離するものである。**

**人間再承認**: 不要。数値・閾値・production値・素材写像のいずれも変更せず、Q13-2定義の適用範囲を電池物理型で明確化するのみのため、Q13-2本体と同格・同手続き(docs反映+Suu_mot3照合)で足りる(確定)。

**Fable再提出**: 不要。反映後にテストが15/15適合すれば、D03/D04較正確定と同じ手順(Suu_mot3照合で足りる)で扱う(確定)。

**Phase 5申し送り(非ブロッキング)**: `hill-climb`×alkalineの実測`maxEnergyUsedRatio=1.1046`(>1.0、予算無効コースのため現時点では非該当)は、このコースが将来予算有効化された場合、alkalineでは完走不能になることを意味する。これは欠陥ではなくコース×電池の設計空間の事実であり、Phase 5のコース設計(周回・予算設定)の判断材料として記録する。

---

## 15. 改訂履歴

- v1(2026-08-08提出): 初版。Suu_mot3レビューで必須修正12点を受けた。
- v2(2026-08-08提出): v1の12点を反映したが、Suu_mot3再レビューで自己完結性の欠如(v1参照による省略記述)等の必須修正7点+文書修正4点を受けた。
- v3(2026-08-08提出): 自己完結版として全面書き直し。Q1〜Q12として質問一覧を整理した。
- v4(2026-08-08提出、最終照合): Suu_mot3レビュー必須修正6点(compose config係数参照不能・D07不可逆後熱更新契約違反・D04因果記録の穴・dt/DoD矛盾・materialMapping分割不足・DoD不完全)を反映。
- v5(2026-08-08提出、最終照合): Suu_mot3レビュー必須追補3点(D04 causeLog方針矛盾・affectedRoles重複誤保証・initiatingCauseLog依存閉包不足)+文言2点を反映し、Suu_mot3最終照合を通過した。
- v6(2026-08-08提出): **正式Fable技術レビュー(2026-08-08、人間プロジェクトリード直接提示)の必須修正2点+Q1〜Q12全裁定+付帯条件6点をすべて確定として反映した。** 主な変更: (M-1)dt分割不変性テストの定義を「1/240s比較」(正典違反)から「固定dt=1/120sでのstepバッチング比較(1物理step×2N vs 2物理step×N)」へ修正(2.3節・10.1節)。(M-2)`RunSnapshot.slopeRad`が実際に`stepTestRun`(7番目の引数)へ渡され消費されることを確認・配線した(5.1節・5.2節)。Q1(内部抵抗係数`internalResistanceDegradationMultiplier`確定、swelling/smoking区別なし)。Q2(可逆ダレ係数`reversibleDroopMultiplier`確定)。Q3(合成順序は可換性により無意味、単一式へ整理)。Q4(状態機械5点確定——causeLog方針は案(b)〈v5の案(a)から変更〉、affectedRoles重複禁止は案(a)〈v5の暫定案(b)から変更〉、交差不変条件3条確定)。Q5(event埋め込み確定、`magnetScorchDeltaFraction`は独立フィールドとして維持、不等式制約追加)。Q6(RunSnapshot拡張は案A確定)。Q7(regressionDiff baselineは直近5回中央値、型設計は案(a)確定)。Q8(P3-1-Q4返済は構造的証明+正例テストで充足確定)。Q9(ノート記録は案B確定、型変更実装はP3-4)。Q10(stepMotorWithDestruction内部改修は人間再承認不要と確定)。Q11(D07物理モデルは候補A、磁石構造は候補(ii)確定)。Q12(D01漸減はP3-3残置、層の整理を訂正)。付帯条件6点(予算不変性テスト・JSDoc契約明記・D04較正結合条件・不等式テスト・D07負例明記・test-run過放電到達の意図仕様明記)をすべて反映。人間再承認バンドルを6項目(Q1・Q4-3・Q4-5・Q5・Q6・Q9)へ確定し、Q10・Q12を明示的に除外した(13節)。別文書`docs/phase3-p3-2-human-reapproval-bundle.md`を新設し、`docs/phase3-plan-v12-amendments.md`へのP3-2-Q1〜Q12追記を12.3節・11.7節へ明記した。Fable再提出は不要(裁定範囲内の反映のため)。
- v7(2026-08-08提出): Suu_mot3のv6照合で必須追補6点を受け反映。(1) 正式回答の保存先参照を訂正——`docs/phase3-fable-review.md`(P3-1向け)と`docs/phase3-p3-2-fable-review.md`(P3-2向け、Suu_mot3保存済み)を区別する事実記録へ直し、「待ち状態」という誤った表現を解消した(冒頭・0.1節・0.4節)。(2) Q2の独立sweep受け入れ条件(可逆ダレによる定常RPM低下が症状として観測可能であること、係数値0.95だけでは不十分)を2.5節・8節・10.6節へ追加した。(3) 人間再承認バンドル(`docs/phase3-p3-2-human-reapproval-bundle.md`)のQ6値域記述の誤り(`slopeRad`を「正の有限数」としていた——0や下り坂の負勾配を拒否する意味になっていた)を「`courseLengthM`のみ正、`slopeRad`は0/負値を許す有限数」へ訂正した。(4) 付帯条件6(test-runでの過放電到達が意図仕様)の正式配置を5.1節から5.3節(`buildVehicleFrameInput`の`energyUsedRatio`直下)へ移し、7.1節の参照も5.3節へ揃えた。(5) store fixtureの3文脈(motor-only/test-run/track-run)が同一のwrapper経路(`stepMotorWithDestruction`または`stepTestRunWithDestruction`)を通るかのように読める記述を修正——`stepTestRunWithDestruction`はvehicle+test-run専用でtrack-run文脈には渡せないため、track-runはP3-1-Q4どおり手構築`RunOutcome`→`applyRunOutcome`でcontext非依存性のみを検証する経路へ明確化し、DoDへも固定した(9節・10.4節)。(6) `affectedRoles`のproduction構築確認テストが「単一loadoutからの導出」という現行productionに存在しない経路を指していた問題を解消——`rg`実査で該当関数が存在しないことを確認したうえで、新規純関数`deriveFireExposureProfileFromLoadout`(`src/store/runOutcomeApplication.ts`、gameStore.tsへの配線は伴わない)をP3-2スコープで新設・単体テストする具体策へ差し替えた(P3-0-Q2の配線延期裁定と矛盾しないことを明記、3.4節・0.2節・10.2節・12.1節)。加えて、`docs/phase3-plan-v12-amendments.md`のP3-2-Q1〜Q12エントリは既にv6 docsゲート(改訂4)で追記済みであるという事実整合のため、1.1節・11.7節・12.3節の「実装承認後・サブステップ7で新規追記」という記述を「v6で追記済み、サブステップ7では実装状態証跡のみ追補」へ訂正した。
- v8(2026-08-08提出): **Suu_mot3裁定によるサブステップ依存順の是正(案C)を反映。契約・初期候補値・受け入れ条件・最終DoDは一切変更していない。** 背景: 人間再承認バンドル承認後、サブステップ1(materialMapping.ts+sweep証跡)着手前に、`mapD04BatteryDestructionConfig`/`mapD07DestructionConfig`の戻り値型が旧サブステップ2(型契約)で拡張される型に依存し、sweep証跡が旧サブステップ2(`advanceD04`/`advanceD07`)・旧サブステップ3(`composeEffectiveMotorConfig`)の実在を前提とするため、旧v6/v7のサブステップ分割(「案A」)ではサブステップ1が単独で完結しないことをalice_mot3が発見・報告した。型・写像・状態機械・wrapper・較正を一括化する代替案(「案B」)も検討したが独立レビュー性を失うため不採用となり、Suu_mot3が10ゲート(0〜9)構成の「案C」を裁定した: ゲート0(現状同期、完了済み)→ゲート1(型契約+validator、`advanceD04`/`advanceD07`本体を含まない)→ゲート2(materialMapping写像純関数、物理sweepを含まない)→ゲート3(状態機械`advanceD04`/`advanceD07`/`advanceD04StageBoundary`)→ゲート4(`composeEffectiveMotorConfig`+`stepMotorWithDestruction`改修+予算不変性)→ゲート5(較正sweep、`computeEnergyBudgetJ`export化を含む)→ゲート6(`RunSnapshot`拡張+`stepTestRunWithDestruction`+`deriveDegradationDiffs`)→ゲート7(store fixture統合)→ゲート8(regressionDiff)→ゲート9(最終docs/全体DoD)。11節を全面差し替えてこの10ゲート構成へ再編し、各ゲートの前提・非スコープ・限定DoDを明記した。8節(materialMapping.ts)を「ゲート2の単体テスト(物理sweepを含まない)」と「ゲート5のsweep証跡」へ分離した。pitfalls#2に従い、ゲート1の型変更(`BatteryDestructionConfig`・`DestructionConfig`・`D04Progress`・`D04CauseLog`・`UnstampedDestructionEvent`・`validateFireExposureProfile`・`validateDestructionConfig`系・`DestructionConfigDraft`)の依存閉包を`rg`で実測し、`DestructionConfig`リテラルfixtureの実行番号5箇所(`destructionModes.test.ts`2箇所・`destructionOrchestration.test.ts`1箇所・`runOutcomeApplication.test.ts`1箇所・`saveStore.test.ts`1箇所)を含め11.1節へ記載した。これは承認済み契約の変更ではなく実装順序の是正であるため、Fable再提出・人間再承認は不要(Suu_mot3裁定)。
- v9(2026-08-08提出): **Suu_mot3のv8照合で発見された正式P3-0-Q6不変条件違反1件を是正。契約・初期候補値・受け入れ条件・全体DoDは変更していない。** 問題: v8のゲート3(状態機械)で`advanceD04`/`advanceD07`を`advanceDestructionState`へ接続しD04/D07 eventを発行可能にする一方、対応する`deriveDegradationDiffs`のD04/D07拡張がゲート6に残っていた。正式Q6は「`advanceDestructionState`は差分換算が実装済みのモードのeventしか発行してはならず、各モードの実装ステップで対応する差分換算を同一ステップに置く」契約であり、ゲート3完了時点で「eventは発行できるが差分換算されない」という中間状態がこの不変条件に違反していた(11.3節DoDがQ6ホワイトリストを掲げていたこととも自己矛盾)。是正: (1) `deriveDegradationDiffs`のD04/D07拡張+event→全劣化diffの一気通貫テストをゲート6からゲート3へ移した(11.3節)。(2) ゲート3の内容・DoDへ「D04/D07を発行可能にする同一ゲートで対応差分換算を実装し、P3-0-Q6ホワイトリストを満たす」ことを明記した(前提はゲート1・2完了)。(3) ゲート6を`RunSnapshot`拡張+`stepTestRunWithDestruction`+`buildVehicleFrameInput`のみへ限定し、前提をゲート1〜5完了へ明記した(11.6節)。(4) 現行11.6節の内容・DoDには`deriveDegradationDiffs`が存在しないことを確認した(`grep`で「ゲート6」と`deriveDegradationDiffs`の共起2件を検出したが、いずれも11.3節の旧v8理由説明〈「旧v8ではゲート6に残っており…」という歴史的言及〉と改訂履歴v8エントリ自身〈v8が実際に含んでいた内容の記録〉のみであり、現行のゲート6定義そのものには出現しない)。これは案Cの依存閉包補正でありFable再提出・人間再承認は不要(Suu_mot3裁定)。
- v10(2026-08-08提出): **ゲート0〜3のSuu_mot3最終照合通過後、ゲート4着手前検査でSuu_mot3が発見した依存順の残り1件をdocs-onlyで是正。契約・初期候補値・受け入れ条件・最終DoD(10節)は一切変更していない。** 問題: §11.4ゲート4のDoDは「`composeEffectiveMotorConfig`合成前後で`computeEnergyBudgetJ`の値が一致する」ことを実関数呼び出しで直接検証する予算不変性テスト(付帯条件1)を課す一方、`computeEnergyBudgetJ`の`export`化はv9まで§11.5ゲート5に置かれていた。単一出典原則によりテスト内で計算式を複製することはできないため、ゲート4はゲート5のexport化なしには承認済みDoDを実装できない依存順違反になっていた。是正: (1) `computeEnergyBudgetJ`への`export`キーワード追加(`trackPhysics.ts`、関数本体無改修)をゲート5からゲート4へ移した(11.4節・11.5節)。(2) `src/engine/__tests__/trackPhysics.test.ts`の「非exportのまま」という古いコメントの訂正もゲート4へ移した。(3) ゲート4の内容・変更ファイル・DoDへ「export済みの実`computeEnergyBudgetJ`を直接使う予算不変性テスト」であることを明記した(11.4節)。(4) ゲート5は「ゲート4でexport済み」であることを前提にM4/D07 Q11/Q2/短絡経路結合sweepのみを行う構成へ訂正した(11.5節)。(5) 冒頭の承認手順記述をゲート0〜3通過済み・ゲート4着手前是正という現状へ更新した。(6) ゲート6以降(11.6節〜11.9節)は変更していない。これは既承認済みの可視性追加(export化)を1ゲート前へ移すだけの実装順是正であり、契約・物理・人間再承認事項の変更ではないためFable再提出・人間再承認は不要(Suu_mot3裁定)。
- v11(2026-08-08提出): **Suu_mot3のv10照合で発見されたゲート4実装可能性の残り2件をdocs-onlyで追補。物理式・初期候補値・受け入れ条件・最終DoD(10節)は一切変更していない。** 問題: v10でcompute側(`computeEnergyBudgetJ`)のexport化はゲート4へ前倒ししたが、付帯条件1の予算不変性テストは`computeEnergyBudgetJ(baseMotorConfig) === computeEnergyBudgetJ(composeEffectiveMotorConfig(...))`という、`composeEffectiveMotorConfig`自体を直接呼び出す契約である。2.0節の`composeEffectiveMotorConfig`は非export関数のまま記載されており、別ファイル(`src/engine/__tests__/destructionOrchestration.test.ts`)のVitestから直接呼び出せない——間接テスト(`stepMotorWithDestruction`経由等)では「合成後configの予算が不変」を直接固定できず、テスト内での合成処理複製は二重出典になるため不可であった。是正: (1) 2.0節の`composeEffectiveMotorConfig`を`export`関数として実装するよう明記し、JSDoc(「config合成純関数。production wrapperは内部で使用する。合成結果は保存・表示・wrapper外の走行入力へ二重供給しない」)を追加した——新設純関数の可視性追加であり既存公開契約の変更ではない(`classifyTerminalModes`のexport化と同型)。(2) §11.4ゲート4の内容・理由・変更ファイルへ、`composeEffectiveMotorConfig`のexport方針と、`src/engine/__tests__/destructionOrchestration.test.ts`をゲート4の変更ファイルとして明記し、同ファイルで実装する6項目(D04/D07各分岐・可換な単一式・決定論・export済み`computeEnergyBudgetJ`を使う予算不変性・`stepMotorWithDestruction`既存P3-1回帰・非自明経路のリプレイ等価性)を列挙した。(3) 冒頭の承認手順記述へv11追補の経緯を反映した。ゲート5以降(11.5節〜11.9節)は変更していない。これは既承認済みの可視性追加(export化)をv10と同型の実装順是正であり、物理式・候補値・受け入れ条件・DoDの変更ではないためFable再提出・人間再承認は不要(Suu_mot3裁定)。
- v12(2026-08-08提出): **ゲート4のSuu_mot3最終照合通過後、ゲート5着手前検査でSuu_mot3が発見した依存順の残り1件をdocs-onlyで是正。契約・物理式・初期候補値・受け入れ条件・最終DoD(10節)は一切変更していない。** 問題: 計画v11 §3.3のM4/D07 test-only harnessは各stepで`buildVehicleFrameInput(effectiveConfig, prevVehicleState, vehicleState)`を呼び、`stepTrackRun`と破壊frameへ同じ実効configを使う単一出典契約を前提とする。しかし`buildVehicleFrameInput`の新設は旧v11まで§11.6ゲート6に残っており、現行srcにも存在しない。ゲート5の実装場所(`materialMapping.test.ts`)はゲート6より前であるため、ゲート6を待たずにゲート5を完了するには「frame式の複製」か「未存在関数の参照」のいずれかが必要になり、単一出典原則によりどちらも許されない依存順違反になっていた。是正: (1) 5.3節の`buildVehicleFrameInput`を`export`関数として実装するよう明記した——新設純関数の可視性追加であり既存公開契約の変更ではない(`composeEffectiveMotorConfig`のexport化と同型)。(2) §11.5ゲート5の内容・理由・変更ファイルへ、`buildVehicleFrameInput`のゲート6→5前倒しと、`src/materials/__tests__/materialMapping.test.ts`のM4/D07 harnessが同関数を直接importして使用することを明記した。(3) ゲート5限定DoDへ、`stepTrackRun`と`buildVehicleFrameInput`の両方へ同一`effectiveConfig`を渡すこと、`theoreticalCurrentA`・`energyUsedRatio`等のframe値をharness/テスト側で再計算・複製しないことを追加した。(4) §11.6ゲート6から`buildVehicleFrameInput`の新設を除き、ゲート6は既存の同関数を`stepTestRunWithDestruction`から利用するのみへ修正した(`RunSnapshot`/`contractVersion`/`slopeRad`/`stepTestRun`本体は無変更)。(5) 冒頭の承認手順記述へゲート4通過・ゲート5着手前是正という現状を反映した。ゲート7以降(11.7節〜11.9節)は変更していない。これは既承認済みの可視性追加(export化)を1ゲート前へ移すだけの実装順是正であり、契約・物理・人間再承認事項の変更ではないためFable再提出・人間再承認は不要(Suu_mot3裁定)。
- v13(2026-08-08提出): **Suu_mot3のv12差分照合で発見された旧配置の誤記・事実誤記2点をdocs-onlyで訂正。契約・物理式・初期候補値・受け入れ条件・最終DoD(10節)は一切変更していない。** 問題: (1) §11.5見出し直下の「`buildVehicleFrameInput`のゲート4→5前倒し」という表記が誤りだった——v12の「問題」段落自体は正しく「旧v11まで§11.6ゲート6に残っており」と記載していたにもかかわらず、見出し・改訂履歴v12エントリの是正項目(2)の2箇所で「ゲート4→5」という誤った表記が残っていた(実際の旧配置はゲート6)。(2) §8「ゲート5のsweep証跡」末尾の「`computeEnergyBudgetJ`の`export`化(2.6節)もこのゲートまでに行う」という記述が、v10でexport化をゲート4へ前倒しした現契約と不整合のまま残っていた(v10・v11改訂時に§11.4・§11.5は更新したが、§8の記述を見落としていた)。是正: (1) 「ゲート4→5前倒し」の2箇所すべてを「ゲート6→5前倒し」へ訂正した(`rg`実測で全文書中の残存が改訂履歴v12エントリ含め2箇所のみであることを確認、いずれも訂正済み)。(2) §8の該当文を「`computeEnergyBudgetJ`はゲート4でexport済みの実関数を利用し、本ゲートではexport作業も式の複製も行わない(v10改訂)」へ書き換えた。(3) 冒頭の承認手順記述へv13の訂正経緯を反映した。ゲート5の内容・変更ファイル・DoD(§11.5)・ゲート6の記述(§11.6)自体は変更していない(v12で確定した構造は維持)。これは文言・旧配置表記の是正でありFable再提出・人間再承認は不要(Suu_mot3裁定)。
- v14(2026-08-09提出): **正式Fable補足裁定(2026-08-09、人間プロジェクトリード直接提示、Suu_mot3中継確認済み)Q13-1〜Q13-3を反映。新設14節「ゲート5較正裁定反映」を追加し、次を自己完結記載した: (1) Q13-1(overheated保留規則——電池がlipoでD04 stageが{swelling,smoking}の間はoverheated終端を保留し、burning到達まで熱暴走の表現をD04状態機械が専有する。Phase3-Q2への抵触なし〈物理終了の定義から重複表現を除くのみ〉だが適用範囲注記が必要、有界性はP3-2-Q4(ii)裁定の段階タイマー不可逆進行により保証、案(a)〈時間圧縮〉・案(c)〈熱物理式再較正〉は却下、新stageDurations候補swellingS=0.35秒/smokingS=0.25秒、M4条件(3)を正例〈held-shortでoverheated発火せずburning終端〉+負例〈非リポでは保留非発動〉へ再定式化)。(2) 14.2節でSuu_mot3指示によるread-only実コード確認結果を記載——vehiclePhysics.ts 380行目・trackPhysics.ts 188行目の早期returnガード、overheatedが毎フレーム再計算されるためstatus正規化で回避可能なこと、batteryHeatの既存0-1clamp、rg実測による依存閉包表(gameStore.ts等のV2 UI該当箇所は無関係、production版stepTrackRunWithDestruction不在を確認)、実装場所の未解決の設計選択(小さな正規化純関数か、test-only harness内で完結させるか)をSuu_mot3照合対象として明記。(3) Q13-2(通常運用の正式定義——NORMAL_OPERATION基準構成をM4条件1の構成として固定、第1条件は実在コース全数完走+予算マージン≤0.85、第2条件は症状の物理型〈平衡型/構造型/資源枯渇型〉で3分し一律の時間窓を廃止)。(4) Q13-3(D07較正優先順位原則、非ブロッキング参考)。(5) ゲート5残作業3点〈保留規則実装+有界性・負例・リプレイ等価テスト/新stageDurationsでのM4条件系再sweep/D07再実施不要〉とゲート6解禁条件〈保留規則の人間再承認+新sweep充足〉。(6) 人間再承認対象をoverheated保留規則1件のみに明示的に限定した(stageDurations初期候補・Q13-2定義群は個別再承認不要)。Phase3-Q2適用範囲注記は`docs/phase3-plan-v12-amendments.md`へ独立エントリとして追記した(14.5節、重複記載しない)。本改訂はdocs-onlyであり、保留規則の実装・新sweep・ゲート6着手・commit/tag/pushはSuu_mot3照合+人間再承認まで一切行わない(Suu_mot3指示)。**
- v15(2026-08-09提出): **Suu_mot3のv14照合で発見された実装可能性契約の不備4点をdocs-onlyで追補。裁定内容・追加Fable提出・追加人間再承認は不要(Suu_mot3裁定「Fable裁定の実装可能な具体化」)。** 問題: 14.2節v14版の「次stepの入力だけをstatusをrunningへ正規化する」という設計は、`none`→`swelling`へ突入する同一step内でbaseが`overheated`を返した場合、呼び出し側がその出力をそのまま終端として確定しうるため不十分だった。是正: (1) 設計選択を案(a)に確定した——`destructionOrchestration.ts`へ`export`純関数`normalizeOverheatedStatusForD04Hold(state, destructionState)`を新設する(`status==='overheated'`かつ`lipo`かつD04 stageが`swelling`/`smoking`の場合だけ`status`を`running`へ書き換え、`batteryHeat`他全フィールドは不変。`finished`/`stalled`/`derailed`・`nonLipo`・D04 stage`none`/`burning`は絶対に変更しない)。人間再承認事項はQ13-1の1件(14.7節)へ既に包含され、別項目を追加しない。案(b)〈test-only harness内で完結〉はFableが「wrapper層〈destructionOrchestration所有〉で実装」と明示指定しているため不採用。(2) wrapper共通契約をpre/post 2面で固定した——(pre)base stepへ渡す直前にprev vehicle state・prev destruction stateへ同関数を適用、(post)base step後に`advanceDestructionState`実行後のnext destruction stateとbase step生のnext vehicle stateへ同関数を再適用してからphysics end/RunOutcome分類へ渡す。これにより`none→swelling`同一stepのoverheatedも正しく保留される。将来の`stepTestRunWithDestruction`(ゲート6)・`stepTrackRunWithDestruction`(P3-4)は必ず同じpre/post契約を使い独自ロジックを複製しないことを台帳送りとして明記した。(3) 同一step境界4ケース(a)lipo+next D04 swelling/smoking→保留、(b)lipo+next D04 burning→保留せずdestructionTerminal優先、(c)nonLipo held-short→正規化されずD03の既存同一frame優先規則不変、(d)finished/stalled/derailedおよびmanualAbort/energyExhausted→不変、を表として明記し、ゲート5DoDのテスト対象として固定した(14.2節・14.6節)。(4) ゲート5変更ファイル一覧(11.5節・12.1節・12.2節)へ`src/engine/destructionOrchestration.ts`(`normalizeOverheatedStatusForD04Hold`新設)・`src/engine/__tests__/destructionOrchestration.test.ts`(同関数の単体テスト・同一step境界4ケース・保留窓有界性テスト)を追加し、ゲート5のsweep harnessがproduction純関数をimportし正規化式を複製しないことを明記した。本改訂もdocs-onlyであり、保留規則の実装・新sweep・ゲート6着手・commit/tag/pushはSuu_mot3照合+人間再承認まで一切行わない(Suu_mot3指示)。**
- v16(2026-08-09提出): **人間再承認完了(2026-08-09T06:20)後のゲート5実装で発見・実装した5点のうち、§3.3のpseudocode/M4条件(3)記述をv14/v15時点の§11.5/§14と同期させるdocs-onlyの是正(P5後半)。契約・production値は変更していない。** 問題: §3.3のM4 harness pseudocodeがpre/post保留適用なし・M4条件(3)が「overheatedより先にburningへ到達できること」という旧competing-condition文言のままであり、v14/v15で更新済みの§11.5・§14と矛盾していた(Suu_mot3のGate5残作業レビュー指摘P5後半)。是正: (1) §3.3のpseudocodeへ`normalizeOverheatedStatusForD04Hold`のpre/post適用を追記し、「burningとoverheatedの同一step競合はoverheated保留規則により構造的に解消済み」という一文を追加した。(2) DoD文中のM4条件(3)を、14.1節で確定した正例(held-shortでswelling→smoking→burningがstageDurationsどおり進行しdestructionTerminalで終端、overheated非発火)+負例(非リポでは保留非発動、D03の既存同一frame優先規則不変)へ書き換えた。同時に、Gate5残作業の実装本体として次を実施・報告する: (a)`normalizeOverheatedStatusForD04Hold`単体テスト+同一step境界4ケース(destructionOrchestration.test.ts、11テスト)、(b)M4条件3を正例(terminal分類証跡込み、classifyTerminalModes/finalizeDestructionRunの実経路でRunOutcome.endReason=destructionTerminalまで確認)+負例(D03/overheated同一frame優先規則のschema-valid test-only境界fixtureで実証)へ拡張、(c)有界性assertをfirstHeldOverheatedAtStepからswellingAtStep起点(物理的な証明起点)へ訂正、(d)D07条件1へ末尾240step窓の平衡到達実証(前半/後半平均diffRatio)を追加、(e)Q13-2通常運用確認を全3電池(alkaline/NiMH/LiPo)×実在全5コースのtable-drivenへ拡張。(e)の拡張により、energy-run(唯一の予算有効コース)でalkaline(maxEnergyUsedRatio≈0.9970)・NiMH(≈0.9338)がマージン0.85を超過する所見が新たに判明した(LiPoのみ≈0.8073で適合)。原因はbatteryCapacityRatio較正値の差(alkaline/NiMH=1.0、LiPo=1.3、人間再承認済み)による物理的に正しい帰結だが、Q13-2裁定原文がLiPo実測のみを根拠に適合を述べていたため、alkaline/NiMHでの成立可否は契約判断を要する。Suu_mot3裁定「1件でも不適合なら閾値を弱めず実測全文を停止報告する」に従い、当該2条件のテストは意図的に失敗させたまま(閾値未変更)Suu_mot3/Fableへ実測全文とともにエスカレーションする。本改訂(§3.3同期)自体は契約変更を伴わないためFable再提出・追加人間再承認は不要(Suu_mot3裁定)。**
- v17(2026-08-09提出): **正式Fable補足裁定(P3-2ゲート5Q14、2026-08-09、人間プロジェクトリード直接提示、Suu_mot3中継確認済み)を反映。v16のP2エスカレーション(energy-run×alkaline/NiMHの予算マージン超過)への裁定。契約・production値は変更していない(適用範囲の明確化のみ)。** 裁定: 案(a)採用——一般原則「受け入れ閾値は、その閾値が防ぐ危険が構造的に存在する対象にのみ適用する」を14.3節冒頭へ明記し、今後の受け入れ条件の作文規則とした。予算条件を電池物理型別に分離: LiPo(D04過放電経路が構造的に存在)は`maxEnergyUsedRatio ≤ 0.85`を維持、nonLipo(alkaline/NiMH、D04が型レベルで不存在)は自然完走(`finished`、`ratio<1.0`と同値)のみを要求する(14.3節)。新設14.8節へ裁定の詳細(採用理由、Q14依頼書参照)・人間再承認不要(Q13-2本体と同格・同手続き)・Fable再提出不要(反映後15/15適合ならSuu_mot3照合で足りる)・Phase 5申し送り(`hill-climb`×alkaline実測`maxEnergyUsedRatio=1.1046`、将来このコースが予算有効化されればalkalineは完走不能になるという設計空間の事実)を記録した。`docs/phase3-plan-v12-amendments.md`へ新設した`P3-2-Q13-2`エントリにもQ14精密化を反映した(重複記載しない)。テストコード側の是正(2件の赤テストをLiPo/nonLipo分離条件へ変更)はGate5完了報告で実施・報告する。**
- v18(2026-08-09提出、Gate9レビューG9-R2是正+正式Fable最終レビュー申し送り追加): **Suu_mot3のGate9レビューで指摘された、10.7節の後続申し送り集約不足をdocs-onlyで是正。契約・production値・受け入れ条件は変更していない。** 問題: 10.7節の見出しが「P3-4への台帳送り項目」とP3-4限定に読める表記だったが、実際にはP3-3向け項目(P3-1-Q1のD01漸減回収)も含まれており見出しと内容が不整合だった。また、Gate5で確定した「Q13-1のoverheated保留pre/post契約を将来wrapperが必ず継承する」という規律や、Q14裁定のPhase5申し送り(`hill-climb`×alkalineの設計空間の事実)が10.7節から辿れず、完了報告の集約台帳として機能していなかった。是正: (1) 見出しを「後続ステップ/フェーズへの申し送り」へ改題し、各既存項目へ宛先(P3-4向け/P3-3向け)を明記した。(2) 既存の「`RunSnapshot`拡張のtrack-run実装への波及」項目へ、正式Fable P3-1-Q9裁定(`accumulator.replaySnapshot`単一出典のPhase 3 wrapper共通不変条件)を`stepTrackRunWithDestruction`(P3-4)も引き継ぐことを明記した。(3) 新規項目として、Q13-1のoverheated保留pre/post 2面契約(`normalizeOverheatedStatusForD04Hold`)を`stepTrackRunWithDestruction`が共通純関数経由で継承し独自複製しないこと、Q14裁定のPhase5申し送り(`hill-climb`×alkaline実測`maxEnergyUsedRatio=1.1046`)を追加した(いずれも14.2節・14.8節に既出の記述の再掲・集約であり、新たな裁定内容の追加ではない)。14.2節・14.8節の既存記述自体は削除・書き換えていない。これは既存裁定の集約表現の改善でありFable再提出・人間再承認は不要(Suu_mot3裁定)。**(4) 正式Fable最終レビュー(2026-08-09、承認・commit可)がPhase3レビューC5残余の申し送りを追加指示したため、10.7節へ「D02発煙のみ」(P3-3 DoD必須負例)・「D05は非終端モードそのもの、分類規則レベルで終端候補に一切含まれない」(P3-3 DoD必須負例)・「D09摩擦増のみ」(P3-4 DoD必須負例)を追記した(D04の膨張のみ/発煙のみ相当の負例=C5負例2件はP3-2で消化済み)。これは既存確定条件のリマインドであり契約変更ではない(Suu_mot3指示、docs-only)。
