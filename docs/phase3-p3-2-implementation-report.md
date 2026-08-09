# P3-2実装完了報告: D04(リポ経路)+D07(三段開示骨格)+store統合

作成: alice_mot3(2026-08-09)。本書は`docs/phase3-p3-2-plan.md`(v18)の承認済み計画に基づくGate0〜9の実装完了を報告する自己完結文書である。**同一Fable threadが計画v18・裁定台帳(`docs/phase3-plan-v12-amendments.md`)・正式Fable技術レビュー(`docs/phase3-p3-2-fable-review.md`)・人間再承認バンドル(`docs/phase3-p3-2-human-reapproval-bundle.md`)を既に保持している場合に限り**、人間プロジェクトリードが本書と`docs/phase3-p3-2-final-review-request.md`をアップロードするだけで正式Fable最終レビューを依頼できることを目標とし、長い証跡(sweep実測全文・15組合せ表・テスト出力)を要約せずここへ集約する(P3-1時と同型の運用、agmsg全文を人間がターミナル上で取得できない制約への対応)。新規threadへ提出する場合は`docs/phase3-p3-2-final-review-request.md`の「読む順序」2〜5の文書も併せて添付する必要がある(同依頼文G9-R9是正参照)。

---

## 1. 承認経路

計画(`docs/phase3-p3-2-plan.md`)→Suu_mot3最終照合(v5に対して)→正式Fable技術レビュー条件付き承認(2026-08-08、`docs/phase3-p3-2-fable-review.md`)→人間再承認バンドル承認(6項目、`docs/phase3-p3-2-human-reapproval-bundle.md`)→実装着手(ゲート0〜9)→ゲート5途中で正式Fable補足裁定Q13-1〜Q13-3(2026-08-09)+人間再承認(overheated保留規則1件)→Q14裁定(2026-08-09、Q13-2予算条件の対象電池別適用範囲、人間再承認不要)→ゲート5〜9実装完了→**本書+`docs/phase3-p3-2-final-review-request.md`による正式Fable最終レビュー依頼(本書がその起点)**→人間commit承認、の順で進行した。

各ゲートの実装はSuu_mot3による独立検証(`npx tsc -b`・対象テスト・全体`npm run test`・`npm run build`・`npm run lint`・`cmp AGENTS.md CLAUDE.md`・`git diff --check`の再実行)を経て個別に照合通過している。commit/tag/pushは本書提出時点まで一切行っていない。

---

## 2. 人間再承認7件(当初6件+ゲート5較正裁定分1件)

| # | 対象 | 変更内容 | 対応するQ | 状態 |
|---|---|---|---|---|
| 1 | `DestructionConfig.battery`(lipo枝) | `internalResistanceDegradationMultiplier: number`追加(初期候補値1.5) | Q1 | 承認済み(バンドル) |
| 2 | `D04CauseLog`/`D04Progress` | `initiatingCause`/`initiatingCauseLog`追加(案b) | Q4-3 | 承認済み(バンドル) |
| 3 | `validateFireExposureProfile` | `adjacentRolesEquipped`の重複拒否追加(案a) | Q4-5 | 承認済み(バンドル) |
| 4 | `DestructionConfig` | `d04`セクション追加+`d07`を`{thermal,irreversible}`へ再設計 | Q5・Q11 | 承認済み(バンドル) |
| 5 | `RunSnapshot`系 | `courseLengthM`・`slopeRad`追加、`contractVersion`→2 | Q6 | 承認済み(バンドル) |
| 6 | `PendingNotebookRecord`3腕 | `finalDestructionState`追加の方針承認のみ(実装はP3-4) | Q9 | 承認済み(バンドル) |
| 7 | overheated保留規則 | 電池がlipoでD04 stageが`{swelling,smoking}`の間`overheated`終端を保留 | Q13-1 | **承認済み(2026-08-09T06:20、人間プロジェクトリード「overheated保留規則1点を再承認します」、Suu_mot3中継確認済み)** |

Q10(`stepMotorWithDestruction`内部改修)・Q12(D01漸減返済先)は正式裁定により再承認不要と明示されており、上記7件に含まれない。`stageDurations`初期候補(0.35/0.25秒)・Q13-2/Q14の`NORMAL_OPERATION`定義群は個別再承認不要(D03の3.0秒較正確定・Q8原則適用と同型、docs反映+Suu_mot3照合で足りると裁定済み)。

---

## 3. Gate0〜9完了サマリ

| Gate | 内容 | 主な変更ファイル | 状態 |
|---|---|---|---|
| 0 | AGENTS.md/CLAUDE.md現状同期+人間再承認バンドル承認確認 | `AGENTS.md`・`CLAUDE.md` | 完了(Gate9是正で現状記述を再同期、§5参照) |
| 1 | 型契約+validatorゲート | `destructionModes.ts`・`destructionOrchestration.ts`(型のみ) | 完了・Suu_mot3最終照合通過(2026-08-08) |
| 2 | materialMappingゲート(写像純関数、物理sweepを含まない) | `materialMapping.ts` | 完了・Suu_mot3最終照合通過(2026-08-08) |
| 3 | 状態機械ゲート(`advanceD04`/`advanceD07`)+`deriveDegradationDiffs`拡張 | `destructionModes.ts`・`destructionOrchestration.ts` | 完了・Suu_mot3最終照合通過(2026-08-08) |
| 4 | 実効configゲート(`composeEffectiveMotorConfig`+`stepMotorWithDestruction`改修+予算不変性) | `destructionOrchestration.ts`・`trackPhysics.ts`(export) | 完了・Suu_mot3最終照合通過(2026-08-08) |
| 5 | 較正sweepゲート(M4到達可能性・D07 Q11/Q2・overheated保留規則) | `materialMapping.ts`・`destructionOrchestration.ts`(`normalizeOverheatedStatusForD04Hold`) | 完了・Suu_mot3照合通過(2026-08-09、是正4ラウンド〈初回是正P1〜P5・エスカレーションQ14・§3.3同期・docs 14.3節文言是正〉を経て確定) |
| 6 | `RunSnapshot`拡張+`stepTestRunWithDestruction` | `destructionOrchestration.ts` | 完了・Suu_mot3照合通過(2026-08-09T09:07、是正2ラウンド) |
| 7 | store fixture統合(`deriveFireExposureProfileFromLoadout`) | `runOutcomeApplication.ts`・fixtureテスト3ファイル | 完了・Suu_mot3照合通過(2026-08-09T11:29、是正3ラウンド〈要修正4点→fixture単一出典3点→rest構文化1点〉) |
| 8 | `regressionDiff.ts`(三段開示段階2骨格) | `regressionDiff.ts`(新規) | 完了・Suu_mot3照合通過(2026-08-09T12:10、是正1ラウンド〈非有限値fail-closed化・current=0直接テスト〉) |
| 9 | 最終docs/台帳実装状態追補/全体DoD確認 | `phase3-plan-v12-amendments.md`・`phase3-p3-2-plan.md`(v18)・`AGENTS.md`/`CLAUDE.md`・本書・`phase3-p3-2-final-review-request.md` | **Suu_mot3最終照合通過(是正3ラウンド〈G9-R1〜R4・G9-R5〜R9・G9-R10〜R12〉反映済み)、正式Fable最終レビュー承認済み(2026-08-09、commit可・`p3-2-complete`タグ付与可。発効条件〈v18本文・台帳転記の裁定原文一致〉もSuu_mot3照合通過済み)、人間commit承認待ち** |

各ゲートの是正ラウンドの詳細な指摘内容・対応は`docs/phase3-plan-v12-amendments.md`「実装状態追補」節の「Gate9追記」ブロックに要約を記録済み。

---

## 4. 各Fable裁定への実装対応表

| 裁定 | 内容(要旨) | 実装箇所 | テスト |
|---|---|---|---|
| Q1 | `internalResistanceDegradationMultiplier`(1.5)、swelling/smoking区別なし | `destructionOrchestration.ts`の`composeEffectiveMotorConfig` | `destructionOrchestration.test.ts`(composeEffectiveMotorConfig describe) |
| Q2 | `reversibleDroopMultiplier`(0.95) | 同上 | 同上 |
| Q3 | 合成順序は可換のため単一式 | 同上(単一式`base×(1−不可逆分)×可逆分`) | 同上 |
| Q4(i)〜(v) | D04状態機械5点(causeLog案b・affectedRoles重複禁止案a・交差不変条件3条) | `destructionModes.ts`の`advanceD04` | `destructionModes.test.ts` |
| Q5 | event埋め込み確定、`magnetScorchDeltaFraction`独立フィールド、不等式制約 | `destructionOrchestration.ts`の`deriveDegradationDiffs`、`materialMapping.ts`の`mapMagnetScorchDeltaFraction`/`mapD07DestructionConfig` | `materialMapping.test.ts`(付帯条件4テスト、Gate2実装、Gate7でも継続成功を確認) |
| Q6 | `RunSnapshot`拡張、案A、contractVersion→2 | `destructionOrchestration.ts` | `destructionOrchestration.test.ts`(交差検証10テスト)・`saveStore.test.ts`(round-trip 2テスト) |
| Q7 | `regressionDiff` baseline=同一recipeKey直近5回中央値、型設計案a | `regressionDiff.ts` | `regressionDiff.test.ts`(24件) |
| Q8 | P3-1-Q4返済=構造的証明+正例テストで充足 | `stepTestRunWithDestruction`のJSDoc+`destructionOrchestration.test.ts`の到達可能6種正例 | 同上 |
| Q9 | D04途中段階ノート記録は案B、型変更実装はP3-4 | 方針のみ(実装なし、P3-4送り) | — |
| Q10 | `stepMotorWithDestruction`内部改修、再承認不要 | `destructionOrchestration.ts` | `destructionOrchestration.test.ts`(既存P3-1回帰) |
| Q11 | D07物理モデル候補A+候補(ii)、受け入れ条件4つ | `destructionModes.ts`の`advanceD07`、`materialMapping.ts`の`mapD07DestructionConfig` | `materialMapping.test.ts`(D07 sweep、§7参照) |
| Q12 | D01漸減はP3-3残置、機構はP3-2で導入済み | `composeEffectiveMotorConfig`(D01漸減はモーター層の量として対象範囲内) | — |
| Q13-1 | overheated保留規則(pre/post 2面契約) | `destructionOrchestration.ts`の`normalizeOverheatedStatusForD04Hold` | `destructionOrchestration.test.ts`(単体+同一step境界4ケース+保留窓有界性+terminal分類証跡+D03同一frame優先規則の境界fixture) |
| Q13-2/Q14 | NORMAL_OPERATION正式定義+予算条件の電池物理型別分離 | `materialMapping.ts`のsweep harness(test-onlyのため production変更なし) | `materialMapping.test.ts`(Q13-2通常運用確認、15組合せtable-driven、§8参照) |
| Q13-3 | D07較正優先順位原則(非ブロッキング参考) | — | — |

---

## 5. 全変更ファイルと非対象境界

### 5.1 production(alice_mot3所有)

- `src/engine/destructionModes.ts`: `advanceD04`・`advanceD07`・`advanceD04StageBoundary`新設、`DestructionConfig`のd04/d07拡張、`D04Progress.initiatingCauseLog`等追加、`validateFireExposureProfile`重複拒否。
- `src/engine/destructionOrchestration.ts`: `composeEffectiveMotorConfig`・`stepTestRunWithDestruction`・`buildVehicleFrameInput`・`normalizeOverheatedStatusForD04Hold`新設、`deriveDegradationDiffs`拡張、`RunSnapshot`系拡張、`stepMotorWithDestruction`内部改修。
- `src/engine/trackPhysics.ts`: `computeEnergyBudgetJ`へ`export`追加のみ(関数本体無改修)。
- `src/materials/materialMapping.ts`: `BodyMaterialId`export、`mapD04BatteryDestructionConfig`・`mapBodyScorchDeltaFraction`・`mapMagnetScorchDeltaFraction`・`mapD07DestructionConfig`新設。
- `src/materials/regressionDiff.ts`(新規): 三段開示段階2骨格。
- `src/store/runOutcomeApplication.ts`: `deriveFireExposureProfileFromLoadout`新設(純関数のみ、gameStore配線なし)。

### 5.2 test(alice_mot3所有)

`src/engine/__tests__/destructionModes.test.ts`・`src/engine/__tests__/destructionOrchestration.test.ts`・`src/engine/__tests__/trackPhysics.test.ts`(コメントのみ)・`src/materials/__tests__/materialMapping.test.ts`・`src/materials/__tests__/regressionDiff.test.ts`(新規)・`src/store/__tests__/runOutcomeApplication.test.ts`・`src/store/__tests__/saveStore.test.ts`。

### 5.3 docs

`docs/phase3-p3-2-plan.md`(v18)・`docs/phase3-plan-v12-amendments.md`(改訂7まで)・`AGENTS.md`/`CLAUDE.md`(現状記述、cmp確認は§11参照)・本書・`docs/phase3-p3-2-final-review-request.md`(新規)。加えてゲート5是正過程で作成した審議用文書(`docs/phase3-p3-2-gate5-calibration-review-request.md`・`docs/phase3-p3-2-gate5-normal-operation-review-request.md`、いずれも審議記録として保持、commit候補に含める)。

### 5.4 非対象境界(明示)

- **`src/engine/vehiclePhysics.ts`は完全無編集**(`git diff --stat`で確認済み、全期間を通じて一度も変更していない)。
- `src/engine/trackPhysics.ts`の変更は`computeEnergyBudgetJ`のexport追加1行のみで、本体ロジックは無改修。
- production向け`DestructionConfig`のgameStore.tsへの実配線・`deriveFireExposureProfileFromLoadout`のgameStore.tsからの呼び出し・`regressionDiff`の実行タイミング配線は、P3-0-Q2裁定どおりP3-4まで行っていない(§10「既知の非配線事項」参照)。
- **`docs/art-spec.md`・`docs/spec.md`の差分はP3-2の対象外である。** 本セッション中に他役割(brabit_mot3等)の並行作業によって生じた変更であり、alice_mot3(engine担当)は一切関与していない。commit候補範囲には含めない(§13参照)。

---

## 6. 最終較正値一覧(Gate5 sweep充足により最終レビューへ確定申請する値)

**本節はSuu_mot3ゲート9照合G9-R6の指摘により新設した独立節である。以下はすべてproductionに採用した最終値(`src/materials/materialMapping.ts`の各`mapXxx`関数が返す値)であり、§7のtest-only境界fixture値(schema-validだがproduction写像に対応しない値、例: D03負例の`shortCircuitDurationLimitS=0.05`やQ2独立sweepの`isolatedConfig`)とは明確に区別する。**

### 6.1 D04(リポ電池、`mapD04BatteryDestructionConfig('battery-lithium-polymer')`)

| 値 | 単位/型 | 意味 | 最終値 | 出典・状態 |
|---|---|---|---|---|
| `shortCircuitDurationLimitS` | 秒 | 持続短絡がbattery発熱を開始させるまでの時間閾値 | 0.05 | Q13-1裁定の対象外のためゲート2時点の値を維持。確定申請 |
| `runawayHeatThreshold` | 無次元(0-1ゲージ比) | 熱暴走(swelling突入)の発火閾値 | 0.3 | 同上、確定申請 |
| `unsafeDischargeStartRatio` | 無次元(energyUsedRatio) | 過放電経路の発火閾値 | 0.9 | 正式P3-0裁定で確定済み、変更なし |
| `stageDurations.swellingS` | 秒 | swelling段階の滞在時間 | 0.35 | **正式Fable Q13-1裁定(2026-08-09、人間再承認済み)で確定。確定申請** |
| `stageDurations.smokingS` | 秒 | smoking段階の滞在時間 | 0.25 | 同上、確定申請 |
| `internalResistanceDegradationMultiplier` | 無次元(乗算係数) | swelling/smoking段階でbatteryInternalResistanceRatioへ乗算する係数(段階間の区別なし) | 1.5 | 正式Fable P3-2-Q1裁定、人間再承認済み(バンドル#1)。確定申請 |

### 6.2 D04延焼(body/magnet scorch)

| 値 | 単位/型 | 意味 | 最終値 | 出典・状態 |
|---|---|---|---|---|
| `bodyScorchDeltaFraction`(`mapBodyScorchDeltaFraction`、body素材ごと) | 無次元(deltaFraction) | D04 burning到達時にbody個体のscorchFractionへ加算する増分。`body-none`=0(実体なし)、`body-cardboard-cowl`/`body-ps-cowl`/`body-polycarbonate-clear`=0.2(可燃性素材、素材間の焼損しやすさの差を発明しない単一値) | 0 / 0.2 / 0.2 / 0.2 | 設計較正値(一次資料なし、D03アルカリ/NiMH単一値と同規律)。確定申請 |
| `magnetScorchDeltaFraction`(`mapMagnetScorchDeltaFraction`、磁石素材ごと) | 無次元(deltaFraction) | D04 burning到達時にmagnet個体のdemagnetizationFractionへ加算する増分。ferrite/alnico/samarium-cobalt(nonDemagnetizing)=0、neodymium(demagnetizing)=0.15 | 0 / 0 / 0 / 0.15 | 正式Fable P3-2-Q5裁定、人間再承認済み(バンドル#4)。`magnetScorchDeltaFraction≥demagnetizationDeltaFraction`(付帯条件4)を満たす値として確定申請 |

### 6.3 D07(磁石熱蓄積・可逆ダレ・不可逆減磁、`mapD07DestructionConfig`)

| 値 | 単位/型 | 意味 | 最終値 | 出典・状態 |
|---|---|---|---|---|
| `thermal.conductionCoefficient` | 無次元(熱ゲージ式の伝導係数) | 電流I²Rによる熱ゲージ蓄積速度(磁石種類によらず常時計算) | 0.25 | ゲート5 sweep実測(§7.4)で改訂(旧候補0.001から)。確定申請 |
| `thermal.dissipationCoefficient` | 無次元(熱ゲージ式の放散係数) | 熱ゲージの自然放散速度 | 0.5 | ゲート2設計初期候補のまま(人間再承認バンドルに個別記載なし)。確定申請 |
| `irreversible.reversibleDroopThreshold`(demagnetizing磁石のみ) | 無次元(0-1ゲージ比) | 可逆ダレ(reversibleDroopActive)の発火閾値 | 0.5 | ゲート2設計初期候補。確定申請 |
| `irreversible.magnetHeatGaugeLimit`(demagnetizing磁石のみ) | 無次元(0-1ゲージ比) | 不可逆減磁(irreversibleTriggered)の発火閾値 | 0.8 | ゲート2設計初期候補。確定申請 |
| `irreversible.reversibleDroopMultiplier`(demagnetizing磁石のみ) | 無次元(乗算係数) | 可逆ダレ発火中にmagnetStrengthへ乗算する係数 | 0.95 | 正式Fable P3-2-Q2裁定、人間再承認済み(バンドル#4に包含)。確定申請 |
| `irreversible.demagnetizationDeltaFraction`(demagnetizing磁石のみ) | 無次元(deltaFraction) | 不可逆減磁到達時にdemagnetizationFractionへ加算する増分 | 0.1 | 正式Fable P3-2-Q5裁定、人間再承認済み(バンドル#4)。確定申請 |
| nonDemagnetizing磁石(ferrite/alnico/samarium-cobalt)の`irreversible` | 判別union | `{kind:'nonDemagnetizing'}`——`reversibleDroopThreshold`等のフィールド自体を持たない、いかなる入力でも`reversibleDroopActive`/`irreversibleTriggered`が真にならない(付帯条件5、negative確認済み) | `kind:'nonDemagnetizing'`固定 | spec.md「ネオジムのみ実用域で発生、他は事実上安全」の正典記述どおり。確定申請 |

すべて`materialMapping.ts`の各`mapXxx`関数が呼び出しごとに独立した新規オブジェクトを返すこと(戻り値のネストオブジェクトの汚染防止)をSuu_mot3ゲート2レビューで検証済み(`materialMapping.test.ts`)。

---

## 7. D04/D07 sweep実測全文(ゲート5)

### 7.1 M4到達可能性条件1(実在コース自然完走、energy-run)

`src/data/tracks.ts`の`energy-run`(予算有効コース)をLiPo・production-valid構成(wire-copper-standard・magnet-neodymium・gear-pom・battery-lithium-polymer)で自然完走した実測: **完走step=3848**、**完走秒数≈32.0667秒**、**maxEnergyUsedRatio≈0.8073**、`D04 stage`は完走時点まで`'none'`のまま(破壊イベント非発火)。

### 7.2 M4条件2(過放電経路)

production-valid選択(wire-silver・magnet-neodymium〈`magnetStrength`写像実測上限0.9〉・gear-titanium・battery-lithium-polymer〈写像固定`batteryCapacityRatio=1.3`〉)+player-adjustable調整(coilTurns=20・magnetDistanceMm=5・brushPressure=0.5・gearRatio=8・tireGrip=0.9)、`hasEnergyBudget:true`・120秒上限での実測(Q13-1裁定〈`stageDurations={0.35,0.25}`確定〉後の再計測):

- `unsafeDischargeEnteredAtStep`到達確認済み、`swellingAtStep=897`(entry timing自体はQ13-1裁定の対象外のため不変)、`smokingAtStep=939`(旧stageDurations=0.05秒時代の903から変化)、`burningAtStep=969`(8.075秒、旧909から変化)=`finalStep`。
- `burningEnergyUsedRatio`(=`maxEnergyUsedRatio`)≈**0.9677**(段階が長くなった分、burning到達までの走行距離が伸び電力消費が進んだ結果。旧≈0.9127から変化)。`finalStatus='running'`(`energyExhausted`未到達)、`finalD04Stage='burning'`。
- `burningInitiatingCause={shortCircuitDurationS:0, overDischargeRatio≈0.9011}`(`overDischargeRatio`はswelling突入時に一度だけ凍結される値のため段階時間の変更による影響を受けない。短絡は一切発生させていない構成のため開始原因が過放電であり短絡由来でないことを直接確認)。
- `shortThresholdAtStep`/`runawayAtStep`はこの構成では短絡自体が発生しないため`null`のまま(`burningInitiatingCause.shortCircuitDurationS:0`と整合)。

### 7.3 M4条件3(短絡経路、正式Fable Q13-1裁定後の再sweep)

production-valid選択(wire-copper-standard・magnet-neodymium・gear-pom・battery-lithium-polymer、player-adjustable上書きは`slitWidthMm:0`のみ)のheld-short構成(`hasEnergyBudget:false`、200step上限)での実測: `swellingAtStep=7`→`smokingAtStep=49`(7+swellingS0.35秒=42step後)→`burningAtStep=79`(49+smokingS0.25秒=30step後)=`finalStep`。`shortThresholdAtStep=5`、`runawayAtStep=7`(entry timing自体は不変)。`maxEnergyUsedRatio=0`(`hasEnergyBudget:false`のため常に0)。`burningInitiatingCause={shortCircuitDurationS≈0.0667, overDischargeRatio:null}`(短絡由来であることの確認)。

**保留窓の実発動**: `firstHeldOverheatedAtStep=21`(電池がlipoでD04 stage∈{swelling,smoking}のため生の`overheated`判定が`running`へ正規化された最初のstep、`swellingAtStep`(7)以上`burningAtStep`(79)未満の範囲内であることも確認済み)。**有界性**: `burningAtStep − swellingAtStep = 72step = swellingS+smokingS`(0.6秒×120fps)にちょうど一致し、契約上の上限(≤72step)を満たす。burning到達step(79)における生のvehicle statusは`'overheated'`(同一step境界ケース(b)——burning到達時は保留を解除しdestructionTerminalを優先するため、この時点の生statusが`overheated`であること自体は正しい契約)。terminal分類証跡: `classifyTerminalModes`→`finalizeDestructionRun`の実経路で`RunOutcome.endReason==='destructionTerminal'`まで確認済み(swelling=7/smoking=49/burning=79/finalStep=79はsweepM4Reachabilityとの交差確認でも同一値)。

**Q13-1後の正しい契約(G9-R4是正、訂正済み)**: LiPo D04経路では、D04 stageが`swelling`/`smoking`の間は`overheated`終端が保留され、`burning`到達時にのみ`destructionTerminal`(D04)として終端する——「短絡経路がoverheatedより先にburningへ到達する」という**旧・競合条件表現は撤回済み**(Q13-1裁定により物理終了の定義そのものから重複表現を除いたため、そもそも競合が構造的に解消されている)。**非リポ(nonLipo)のD03経路のみ**、従来どおりの「同一フレームでのD03/overheated競合時はD03(destructionTerminal)が優先される」という既存規則が不変のまま残る(境界fixtureで実証、次項7.4)。

### 7.4 D03同一frame優先規則の境界fixture(P4是正、schema-valid test-only境界値)

production-valid選択(wire-copper-standard・magnet-neodymium・gear-pom・battery-alkaline、`slitWidthMm:0`)+`shortCircuitDurationLimitS=0.05`(D03正式較正値3.0秒とは無関係のこの境界テスト専用値、schema-valid test-only)のnonLipo held-short構成で、`batteryHeat`が`BATTERY_HEAT_LIMIT`へ到達する(生のvehicle statusが`overheated`になる)のと**同一step**でD03の熱条件も初めて満たされる状況を作り、`outcome.endReason==='destructionTerminal'`・`outcome.terminalModes`に'D03'が含まれること・`rawVehicleStatusAtOutcomeStep==='overheated'`(真に同一frameで競合していたことの証跡)を実関数経由で固定した。destructionTerminal(D03)が優先されることを確認済み(同一step境界ケース(c))。

### 7.5 D07 Q11受け入れ条件1〜4(production-valid構成、2026-08-09再計測)

較正値: `thermal.conductionCoefficient=0.25`・`dissipationCoefficient=0.5`(k=conduction/dissipation=0.5)。磁石=neodymium(`magnetStrength=0.9`、写像実測上限)固定。

- **条件1(通常運用、平衡到達)**: 通常負荷(battery-alkaline+gear-pom+wire-copper-standard、既定player値、30秒間、`g5LongTrack(false)`)で`maxGauge≈0.3271`、`minGauge≈0.00325`(0ちょうどではない)、`finalGauge≈0.3184`。`terminatedAtStep=null`・`finalStatus='running'`(30秒間走行継続)・`droopAtStep`/`irreversibleAtStep`/`overheatedAtStep`いずれも`null`(到達なし)。**末尾窓統計(240step=2秒間)**: `windowSteps=240`、`mean≈0.3155`、`min≈0.3111`、`max≈0.3198`、`meanFirst`(前半平均)`≈0.3158`、`meanSecond`(後半平均)`≈0.3151`、`diffRatio=|meanFirst−meanSecond|/mean≈0.00218`(0.218%、3%閾値の1/10未満)。平衡到達が明確に示され、平衡値(0.3155)は`reversibleDroopThreshold`(0.5)を十分下回る。
- **条件2(高負荷持続、ダレ到達可能)**: 高負荷(wire-silver・magnet-neodymium・gear-titanium・battery-alkaline+coilTurns=20・magnetDistanceMm=5・brushPressure=0.5・gearRatio=8・tireGrip=0.9、平坦、30秒上限)で`droopAtStep=21`(到達可能、レース内)、`irreversibleAtStep=36`、`overheatedAtStep=147`、`terminatedAtStep=147`・`finalStatus='overheated'`、`maxGauge=1`・`finalGauge=1`(overheated終端時点でゲージ上限到達済み)。条件2が要求するのは「ダレへの到達可能性」のみであり、その後overheatedしないことまでは要求しない(計画§2.5原文確認済み)。
- **条件3(意図的な持続過負荷、不可逆到達がoverheated終端より先)**: wire-silver・magnet-neodymium・gear-titanium・battery-alkaline+coilTurns=15・magnetDistanceMm=3・brushPressure=0.5・gearRatio=10・tireGrip=1.0・slopeDeg=20、60秒上限で`droopAtStep=17`・`irreversibleAtStep=28`・`overheatedAtStep=72`・`terminatedAtStep=72`・`finalStatus='overheated'`・`maxGauge=1`・`finalGauge=1`・`minGauge≈0.0317`。不可逆到達(28)がoverheated終端(72)より先に成立する(付帯条件5充足)。
- **条件4(0〜1 clamp、ferrite nonDemagnetizing極端入力回帰)**: ferrite(nonDemagnetizing)・battery-alkaline、motor-only 120step、`theta=0.01`・`omega=50`(通常通電)構成で`minGauge=0`、`maxGauge≈0.3674`、`finalGauge≈0.3674`(単調増加のため`maxGauge`と一致)。`reversibleDroopActive=false`・`irreversibleTriggered=false`(nonDemagnetizingのためいかなる入力でも両flagとも常にfalse)。0-1 clampの全入力構造的網羅性自体は`destructionModes.test.ts`(Gate3)が`advanceD07`実装への直接検証(`Math.min(1,Math.max(0,...))`+demagnetizing/nonDemagnetizing両kindの単体テスト)で別途保証済みであり、本測定はmaterialMapping由来のferrite実production較正値を使った回帰確認に限定する。

### 7.6 D07 Q2独立sweep(可逆ダレによる定常RPM低下の観測可能性、production-valid motorConfig・トルク制限領域loadTorque=0.007Nm)

motor-only文脈(`stepMotorWithDestruction`)+固定`loadTorque=0.007`(トルク制限領域、磁力低下が定常RPMを引き下げる方向に効く負荷条件——フリー走行〈高速域〉では逆にfield-weakeningでRPMが上昇するため、症状として観測可能なRPM低下を示すにはこの領域を選ぶ必要がある)。`reversibleDroopActive`を直接seedし、D07熱蓄積を実質ゼロ(`conductionCoefficient=1e-9`のschema-valid test-only isolation)にして遮断した状態(ダレという状態が定常RPMへ与える効果を他の変動要因から分離して測定する役割分担、ダレの到達可能性自体は条件2で別途保証済み)。末尾240フレーム(2秒間)窓、`totalFrames=1200`。

| | meanAll(窓平均) | meanFirst(前半平均) | meanSecond(後半平均) | min | max | lastFrameValue(参考) |
|---|---|---|---|---|---|---|
| ダレ無効(withoutDroop) | 399.986 | 400.104 | 399.868 | 393.920 | 407.685 | 394.079 |
| ダレ有効(withDroop) | 348.981 | 348.956 | 349.006 | 338.210 | 362.648 | 358.933 |

**定常性確認**: 両条件とも前半/後半平均の差が全体平均の3%未満(`|meanFirst−meanSecond|/meanAll<0.03`)であり定常とみなせる。**症状としての低下率**: `dropRatio=(meanAll_without−meanAll_with)/meanAll_without≈0.1275`(12.75%、5%以上という有意性基準を満たす)。主張(症状として観測可能なRPM低下)は窓平均(meanAll)同士で行い、末尾1フレーム瞬間値(lastFrameValue)は参考回帰のみで主張には使わない。

---

## 8. Q13-2/Q14「通常運用(NORMAL_OPERATION)で非到達」15組合せ表全文

基準構成: 素材={copper-standard, neodymium, pom, 対象電池}、player値すべて既定、攻め入力なし(M4条件1と同一構成)。

| コース | 電池 | finalStep | status | eventCount | maxEnergyUsedRatio | D04 stage | D07 droop/irreversible |
|---|---|---|---|---|---|---|---|
| straight-10m | alkaline | 2919 | finished | 0 | 0.6627 | N/A | false/false |
| straight-10m | NiMH | 2656 | finished | 0 | 0.6294 | N/A | false/false |
| straight-10m | LiPo | 2576 | finished | 0 | 0.5398 | none | false/false |
| hill-climb | alkaline | 3945 | finished | 0 | **1.1046** | N/A | false/false |
| hill-climb | NiMH | 3355 | finished | 0 | 0.9514 | N/A | false/false |
| hill-climb | LiPo | 3085 | finished | 0 | 0.7383 | none | false/false |
| curve-balance | alkaline | 2919 | finished | 0 | 0.6627 | N/A | false/false |
| curve-balance | NiMH | 2656 | finished | 0 | 0.6294 | N/A | false/false |
| curve-balance | LiPo | 2576 | finished | 0 | 0.5398 | none | false/false |
| rough-board | alkaline | 2970 | finished | 0 | 0.6744 | N/A | false/false |
| rough-board | NiMH | 2694 | finished | 0 | 0.6388 | N/A | false/false |
| rough-board | LiPo | 2574 | finished | 0 | 0.5379 | none | false/false |
| energy-run(予算有効) | alkaline | 4365 | finished | 0 | **0.9970** | N/A | false/false |
| energy-run(予算有効) | NiMH | 3988 | finished | 0 | **0.9338** | N/A | false/false |
| energy-run(予算有効) | LiPo | 3848 | finished | 0 | 0.8073 | none | false/false |

**Q14裁定適用後の判定(15/15全適合)**: LiPoは`maxEnergyUsedRatio≤0.85`条件を維持し、energy-run×LiPo(0.8073)を含む全5コースで適合。nonLipo(alkaline/NiMH)は自然完走(`finished`)のみを要求し、energy-run×alkaline(0.9970)・NiMH(0.9338)を含む全15組合せで`finished`かつ破壊イベントゼロを満たす(D04はnonLipoで型レベルで不存在のためN/A、D07は全組合せでdroop/irreversible非発火)。原因分析: `batteryCapacityRatio`較正差(alkaline/NiMH=1.0、LiPo=1.3、`BATTERY_CAPACITY_RATIO_CALIBRATION`、人間再承認済み)により、同じコース・同じ走行でも比率の分母(電池容量)が小さいほどエネルギー使用比が高くなるため、alkaline/NiMHの方がLiPoより比率が高くなるのは物理的に正しい帰結である。`0.85`自体はD04固有の`unsafeDischargeStartRatio`(0.90)からの設計マージンであり、D04を型レベルで持たないnonLipoには物理的参照先がない(一般原則: 受け入れ閾値は、その閾値が防ぐ危険が構造的に存在する対象にのみ適用する)。

**Phase 5申し送り(非ブロッキング、§12参照)**: `hill-climb`×alkalineの実測`maxEnergyUsedRatio=1.1046`(>1.0)は、現時点では`hill-climb`が予算無効コースのため問題化していないが、将来このコースが予算有効化されればalkalineは完走不能になるという設計空間の事実である。

---

## 9. P3-0-Q6不変条件(適用範囲拡張の確認)

正式Fable P3-0-Q6不変条件: **「`advanceDestructionState`は、差分換算(`deriveDegradationDiffs`)が実装済みのモードのイベントしか発行してはならない」**(段階実装のホワイトリスト原則)。P3-2はD04(`burning`到達時のみ)・D07(`irreversibleTriggered`到達時のみ)の2モードについて、`advanceD04`/`advanceD07`を`advanceDestructionState`へ接続してイベント発行を可能にするのと**同一ゲート(ゲート3)**で、対応する`deriveDegradationDiffs`のD04/D07拡張(`{role:'body'/'magnet',kind:'scorch'}`・`{role:'magnet',kind:'demagnetization'}`等の差分換算)を実装した。これにより「イベントは発行できるが差分換算されない」という中間状態(v8時点で一度発生しかけたが、Suu_mot3裁定によりv9でゲート3へ前倒しして解消済み、`docs/phase3-p3-2-plan.md`改訂履歴v9参照)を作らず、本不変条件を実装完了時点まで常時成立させた。D05・D09の連続量deltaFraction換算は未実装のままP3-3/P3-4送り(本不変条件により、これらのイベントが現時点で`advanceDestructionState`から発行されることはない)。

---

## 10. 既知の非配線事項(commit候補にも含めるが、P3-4以降まで機能しない)

- production向け`DestructionConfig`のgameStore.tsへの実配線(P3-0-Q2裁定どおりP3-4)。
- `deriveFireExposureProfileFromLoadout`のgameStore.tsからの呼び出し(純関数の新設のみ、配線はP3-4)。
- `regressionDiff.detectPerformanceRegression`の実行タイミング・永続化・UI表示(A2裁定どおりbrabit所有、P3-4)。
- `stepTrackRunWithDestruction`(track-run用の実wrapper)自体が未実装(P3-4)。現時点のtrack-run文脈は、手構築`RunOutcome`(実wrapperが生成した内部一貫性のあるevents/state/diffsをそのまま使い、`replaySnapshot`のみ有効なtrack-run snapshotへ差し替える方式)→`applyRunOutcome`の経路のみで検証している(正式Fable P3-1-Q4(a)裁定と同型の扱い)。
- `assembleD04Config`相当(素材写像4関数を組み合わせてproduction configを構築する関数)は未実装(P3-4)。
- D04途中段階終了時のノート記録の型変更(`finalDestructionState`追加)は方針承認のみで実装はP3-4。

---

## 11. 全テスト/build/lint/cmp/diff証跡(Gate9 G9-R8是正、2026-08-09最終実行、実出力全文)

```
$ npx tsc -b
(標準出力なし、exit 0)

$ npm run test -- --run

> motor-game-v3@0.0.0 test
> vitest run --run


 RUN  v2.1.9 /home/alice/projects/motor-game-v3

 ✓ src/materials/__tests__/regressionDiff.test.ts (24 tests) 12ms
 ✓ src/retro-proto/perf/__tests__/frameProbe.test.ts (18 tests) 8ms
 ✓ src/materials/__tests__/degradationApplication.test.ts (16 tests) 8ms
 ✓ src/materials/__tests__/assumedGeometry.test.ts (31 tests) 13ms
 ✓ src/materials/__tests__/inventoryItem.test.ts (16 tests) 20ms
 ✓ src/engine/__tests__/scoring.test.ts (22 tests) 27ms
 ✓ src/engine/__tests__/failures.test.ts (13 tests) 35ms
 ✓ src/materials/__tests__/materials.test.ts (18 tests) 42ms
 ✓ src/store/__tests__/shopEconomy.test.ts (45 tests) 27ms
 ✓ src/engine/__tests__/recipeCode.test.ts (41 tests) 47ms
 ✓ src/retro/audio/__tests__/score.test.ts (29 tests) 16ms
 ✓ src/engine/__tests__/destructionModes.test.ts (40 tests) 86ms
 ✓ src/engine/__tests__/motorPhysicsV15.test.ts (15 tests) 172ms
 ✓ src/retro/audio/__tests__/sequencer.test.ts (19 tests) 30ms
 ✓ src/store/__tests__/runOutcomeApplication.test.ts (77 tests) 120ms
 ✓ src/engine/__tests__/destructionOrchestration.test.ts (138 tests) 178ms
 ✓ src/retro/mode7/__tests__/affineSampler.test.ts (22 tests) 423ms
   ✓ computePerspectiveRowTransforms > 全出力行を通してソース参照座標は常に整数になる(ニアレストネイバー) 391ms
 ✓ src/engine/__tests__/vehiclePhysics.test.ts (38 tests) 337ms
 ✓ src/engine/__tests__/motorPhysicsLoad.test.ts (5 tests) 33ms
 ✓ src/engine/__tests__/motorPhysicsSplitApi.test.ts (12 tests) 10ms
 ✓ src/store/__tests__/saveStore.test.ts (115 tests) 240ms
 ✓ src/retro/audio/__tests__/synth.test.ts (21 tests) 46ms
 ✓ src/retro/shop/__tests__/layout.test.ts (25 tests) 22ms
 ✓ src/retro-proto/resolutionHarness/__tests__/postMortemLayout.test.ts (16 tests) 18ms
 ✓ src/retro-proto/worstCase/__tests__/qualityDegradation.test.ts (13 tests) 16ms
 ✓ src/retro/shop/__tests__/formatMaterial.test.ts (14 tests) 9ms
 ✓ src/retro/canvas/__tests__/directCanvas.test.ts (8 tests) 14ms
 ✓ src/retro/audio/__tests__/motorSound.test.ts (16 tests) 19ms
 ✓ src/retro/audio/__tests__/mixLevels.test.ts (8 tests) 9ms
 ✓ src/materials/__tests__/materialMapping.test.ts (98 tests) 606ms
 ✓ src/retro/canvas/__tests__/integerScale.test.ts (9 tests) 8ms
 ✓ src/engine/__tests__/trackPhysics.test.ts (34 tests) 779ms
 ✓ src/retro-proto/resolutionHarness/__tests__/garageIllustrationGeometry.test.ts (9 tests) 42ms
 ✓ src/store/__tests__/gameStore.test.ts (6 tests) 16ms
 ✓ src/retro-proto/resolutionHarness/__tests__/windingTraceGeometry.test.ts (12 tests) 153ms
 ✓ src/engine/__tests__/motorPhysics.test.ts (49 tests) 944ms
   ✓ 性質ベーステスト(ランダムパラメータ) > 状態が常に有限で、電流は非負、ショート時はトルク相当(電流)が常にゼロ、符号は0を経由せず反転しない 750ms
 ✓ src/retro-proto/overheadView/__tests__/carSprite.test.ts (8 tests) 15ms
 ✓ src/retro/canvas/__tests__/viewportReport.test.ts (9 tests) 22ms
 ✓ src/store/__tests__/testRunStore.test.ts (14 tests) 510ms
 ✓ src/retro-proto/mode7Demo/__tests__/drawMode7Demo.test.ts (6 tests) 32ms
 ✓ src/engine/__tests__/commutator.test.ts (9 tests) 11ms
 ✓ src/components/__tests__/saveGateMode.test.ts (9 tests) 20ms
 ✓ src/retro-proto/audioDemo/__tests__/audioTabUiState.test.ts (7 tests) 5ms
 ✓ src/retro-proto/overheadView/__tests__/track.test.ts (9 tests) 11ms
 ✓ src/retro/lint/__tests__/rawColorScan.test.ts (10 tests) 9ms
 ✓ src/retro/audio/__tests__/wavEncoder.test.ts (7 tests) 5ms
 ✓ src/retro-proto/overheadView/__tests__/carIndex.test.ts (8 tests) 6ms
 ✓ src/retro-proto/mode7Demo/__tests__/drawPerspectiveComparison.test.ts (5 tests) 11ms
 ✓ src/engine/__tests__/destructionModesImportStructure.test.ts (2 tests) 7ms
 ✓ src/retro/text/__tests__/segmentDigits.test.ts (8 tests) 54ms
 ✓ src/retro/canvas/__tests__/orientation.test.ts (7 tests) 6ms
 ✓ src/store/__tests__/notebookStore.test.ts (4 tests) 12ms
 ✓ src/retro-proto/overheadView/__tests__/tallObjectStyle.test.ts (5 tests) 7ms
 ✓ src/retro-proto/worstCase/__tests__/insetLayout.test.ts (4 tests) 10ms
 ✓ src/retro/shop/__tests__/materialIcons.test.ts (11 tests) 21ms
 ✓ src/data/__tests__/brokenCars.test.ts (3 tests) 85ms
 ✓ src/retro/audio/__tests__/bgmScore.test.ts (4 tests) 10ms
 ✓ src/data/__tests__/trackSweep.test.ts (3 tests) 9ms
 ✓ src/retro/colorOps/__tests__/blend.test.ts (9 tests) 11ms
 ✓ src/data/__tests__/tracks.test.ts (4 tests) 12ms
 ✓ src/retro/canvas/__tests__/layeredCanvasConstraint.test.ts (4 tests) 4ms
 ✓ src/retro-proto/resolutionHarness/__tests__/dummyWindingRecord.test.ts (5 tests) 41ms
 ✓ src/retro/__tests__/palette.test.ts (5 tests) 15ms
 ✓ src/retro-proto/__tests__/tabState.test.ts (3 tests) 5ms
 ✓ src/retro-proto/colorOpsDemo/__tests__/colorOpsScenes.test.ts (9 tests) 90ms
 ✓ src/retro-proto/resolutionHarness/__tests__/candidates.test.ts (4 tests) 8ms
 ✓ src/data/__tests__/partPresets.test.ts (2 tests) 6ms
 ✓ src/retro-proto/mode7Demo/__tests__/checkerFloorSource.test.ts (3 tests) 4ms
 ✓ src/retro/audio/__tests__/reverb.test.ts (20 tests) 1313ms
   ✓ generateImpulseResponseSamples > 全サンプルが-1..1の範囲に収まる 1177ms

 Test Files  69 passed (69)
      Tests  1312 passed (1312)
   Start at  22:27:50
   Duration  2.94s (transform 9.03s, setup 0ms, collect 20.22s, tests 6.97s, environment 21ms, prepare 7.24s)

$ npm run build

> motor-game-v3@0.0.0 build
> tsc -b && vite build

vite v8.1.5 building client environment for production...
transforming...✓ 681 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.72 kB │ gzip:   0.46 kB
dist/assets/index-ChiYvQ2W.css   23.81 kB │ gzip:   5.54 kB
dist/assets/index-ChxWOa0Q.js   784.99 kB │ gzip: 219.84 kB

✓ built in 1.17s
(vite-reporterのchunk size警告のみ、コード分割は既存の別課題でありP3-2の対象外)

$ npm run lint

> motor-game-v3@0.0.0 lint
> oxlint

(標準出力なし、exit 0)

$ cmp AGENTS.md CLAUDE.md
(出力なし、exit 0、差分なし)

$ git diff --check
(出力なし、exit 0、空白関連の問題なし)
```

### 11.1 テストファイル別内訳(P3-2で変更・新設したファイルのみ抜粋)

| ファイル | テスト数 |
|---|---|
| `src/engine/__tests__/destructionModes.test.ts` | 40 |
| `src/engine/__tests__/destructionOrchestration.test.ts` | 138 |
| `src/engine/__tests__/trackPhysics.test.ts` | 34(既存回帰、コメントのみ変更) |
| `src/materials/__tests__/materialMapping.test.ts` | 98 |
| `src/materials/__tests__/regressionDiff.test.ts`(新規) | 24 |
| `src/store/__tests__/runOutcomeApplication.test.ts` | 77 |
| `src/store/__tests__/saveStore.test.ts` | 115 |

### 11.2 bundle size差分(§10.6契約)

P3-1完了時点の基準値: `dist/assets/index-*.js` 781.47kB / gzip 219.29kB。
現行: 784.99kB / gzip 219.84kB。
**差分: +3.52kB / gzip +0.55kB。**

P3-2はregressionDiff.ts・`deriveFireExposureProfileFromLoadout`ともにgameStore.tsへの配線を行っていないため差分ゼロが期待値だったが、わずかな増分が生じている。原因はGate1〜6で`destructionModes.ts`・`destructionOrchestration.ts`・`materialMapping.ts`へ追加した状態機械本体(`advanceD04`/`advanceD07`等)が、これらのファイルの既存exportを経由して(P3-0時点から)bundleに含まれるためである(P3-0-Q2裁定が延期しているのは「production `DestructionConfig`の実配線」であり、型・状態機械本体のファイル自体はP3-0からbundleに含まれる)。`regressionDiff.ts`・`deriveFireExposureProfileFromLoadout`自体はどこからもimportされておらず、この増分には寄与していない。

### 11.3 `git diff --stat`(P3-2スコープファイルのみ、G9-R8是正)

```
$ git diff --stat -- AGENTS.md CLAUDE.md docs/phase3-plan-v12-amendments.md \
    src/engine/destructionModes.ts src/engine/destructionOrchestration.ts src/engine/trackPhysics.ts \
    src/materials/materialMapping.ts src/store/runOutcomeApplication.ts \
    src/engine/__tests__/destructionModes.test.ts src/engine/__tests__/destructionOrchestration.test.ts \
    src/engine/__tests__/trackPhysics.test.ts src/materials/__tests__/materialMapping.test.ts \
    src/store/__tests__/runOutcomeApplication.test.ts src/store/__tests__/saveStore.test.ts

 AGENTS.md                                          |    2 +-
 CLAUDE.md                                          |    2 +-
 docs/phase3-plan-v12-amendments.md                 |   75 ++
 src/engine/__tests__/destructionModes.test.ts      |  444 +++++++-
 .../__tests__/destructionOrchestration.test.ts     | 1159 ++++++++++++++++++-
 src/engine/__tests__/trackPhysics.test.ts          |    8 +-
 src/engine/destructionModes.ts                     |  239 +++-
 src/engine/destructionOrchestration.ts             |  418 ++++++-
 src/engine/trackPhysics.ts                         |    2 +-
 src/materials/__tests__/materialMapping.test.ts    | 1202 +++++++++++++++++++-
 src/materials/materialMapping.ts                   |  169 ++-
 src/store/__tests__/runOutcomeApplication.test.ts  |  548 ++++++++-
 src/store/__tests__/saveStore.test.ts              |   63 +-
 src/store/runOutcomeApplication.ts                 |   15 +-
 14 files changed, 4234 insertions(+), 112 deletions(-)
```

### 11.4 `git status --short`(全リポジトリ、G9-R11是正: 省略なしの全出力〈70行〉+§13の名指しstage方針との対応づけ)

```
$ git status --short

 M AGENTS.md
 M CLAUDE.md
 M docs/art-spec.md
 M docs/phase3-plan-v12-amendments.md
 M docs/spec.md
 M src/engine/__tests__/destructionModes.test.ts
 M src/engine/__tests__/destructionOrchestration.test.ts
 M src/engine/__tests__/trackPhysics.test.ts
 M src/engine/destructionModes.ts
 M src/engine/destructionOrchestration.ts
 M src/engine/trackPhysics.ts
 M src/materials/__tests__/materialMapping.test.ts
 M src/materials/materialMapping.ts
 M src/store/__tests__/runOutcomeApplication.test.ts
 M src/store/__tests__/saveStore.test.ts
 M src/store/runOutcomeApplication.ts
?? .codex/
?? docs/agmsg_codex_delivery_guide.md
?? docs/art-reference-notes-20260808.md
?? docs/art-spec-r2.md
?? docs/decision-item-race-camera.md
?? docs/phase2-step5b-plan.md
?? docs/phase2-step6-fable-key-scope-answer.md
?? docs/phase2-step6-fable-key-scope-question.md
?? docs/phase2-step7-fable-review.md
?? docs/phase2-step7-plan.md
?? docs/phase2-step7-suu-review-v2.md
?? docs/phase2-step7-suu-review-v3.md
?? docs/phase2-step7-suu-review.md
?? docs/phase2-step7b-fable-review.md
?? docs/phase2-step7b-plan.md
?? docs/phase2-step7b-suu-review.md
?? docs/phase2-step8-fable-review.md
?? docs/phase2-step8-plan.md
?? docs/phase2-step8-suu-review.md
?? docs/phase2-step9-fable-review-v2.md
?? docs/phase2-step9-fable-review.md
?? docs/phase3-fable-action-items.md
?? docs/phase3-fable-review-request.md
?? docs/phase3-fable-review.md
?? docs/phase3-fable-submit-gate.md
?? docs/phase3-p3-2-fable-review-request.md
?? docs/phase3-p3-2-fable-review.md
?? docs/phase3-p3-2-final-review-request.md
?? docs/phase3-p3-2-gate5-calibration-review-request.md
?? docs/phase3-p3-2-gate5-normal-operation-review-request.md
?? docs/phase3-p3-2-human-reapproval-bundle.md
?? docs/phase3-p3-2-implementation-report.md
?? docs/phase3-p3-2-plan.md
?? docs/phase3-suu-draft-review.md
?? docs/phase3-suu-v10-review.md
?? docs/phase3-suu-v11-review.md
?? docs/phase3-suu-v12-review.md
?? docs/phase3-suu-v2-review.md
?? docs/phase3-suu-v3-review.md
?? docs/phase3-suu-v5-review.md
?? docs/phase3-suu-v6-review.md
?? docs/phase3-suu-v7-review.md
?? docs/phase3-suu-v8-review.md
?? docs/phase3-suu-v9-review.md
?? docs/phase3-v12-ui-v5-suu-review.md
?? docs/publication-consultation/
?? docs/reference/
?? docs/spec-r3-revision-proposal.md
?? docs/spec_1.md
?? docs/temp/
?? publication-consultation-pack-2026-08-08.tar.gz
?? shareimg/
?? src/materials/__tests__/regressionDiff.test.ts
?? src/materials/regressionDiff.ts
```

**P3-2対象/対象外の対応づけ**:

| git status行 | P3-2対象か | §13上の扱い |
|---|---|---|
| `M AGENTS.md`・`M CLAUDE.md` | 対象 | commit候補(名指しstage) |
| `M docs/phase3-plan-v12-amendments.md` | 対象 | commit候補(名指しstage) |
| `M src/engine/*`・`M src/materials/*`・`M src/store/*`(tracked production/test 11ファイル、§11.3の`git diff --stat`に現れる集合と同一) | 対象 | commit候補(名指しstage) |
| `M docs/art-spec.md`・`M docs/spec.md` | **対象外** | 他役割(brabit_mot3等)の並行作業。**commit候補から明示的に除外**(§13・§5.4既述) |
| `?? docs/phase3-p3-2-fable-review-request.md`・`?? docs/phase3-p3-2-fable-review.md`・`?? docs/phase3-p3-2-final-review-request.md`・`?? docs/phase3-p3-2-gate5-calibration-review-request.md`・`?? docs/phase3-p3-2-gate5-normal-operation-review-request.md`・`?? docs/phase3-p3-2-human-reapproval-bundle.md`・`?? docs/phase3-p3-2-implementation-report.md`・`?? docs/phase3-p3-2-plan.md`(`phase3-p3-2-`接頭辞、計8件) | 対象 | commit候補(名指しstage)。**G9-R11是正: 当初「6ファイル」と誤記していたが、正しくは上記8件全件** |
| `?? src/materials/regressionDiff.ts`・`?? src/materials/__tests__/regressionDiff.test.ts`(untracked production/test 2ファイル) | 対象 | commit候補(名指しstage)。tracked 11件+untracked 2件=production/test合計**13ファイル**(§13参照、§11.3の`git diff --stat`には現れない——`git diff --stat`はtrackedファイルの差分のみを表示するため) |
| `?? .codex/`・`?? docs/agmsg_codex_delivery_guide.md`・`?? docs/art-reference-notes-20260808.md`・`?? docs/art-spec-r2.md`・`?? docs/decision-item-race-camera.md`・`?? docs/phase2-*.md`(Phase2期、10件)・`?? docs/phase3-fable-action-items.md`・`?? docs/phase3-fable-review-request.md`・`?? docs/phase3-fable-review.md`・`?? docs/phase3-fable-submit-gate.md`(いずれも`p3-2`を含まないP3-1期のfable関連文書)・`?? docs/phase3-suu-*-review.md`(P3-1期、10件)・`?? docs/phase3-v12-ui-v5-suu-review.md`・`?? docs/publication-consultation/`・`?? docs/reference/`・`?? docs/spec-r3-revision-proposal.md`・`?? docs/spec_1.md`・`?? docs/temp/`・`?? shareimg/`・`?? publication-consultation-pack-2026-08-08.tar.gz` | **対象外** | P3-2以前(Phase2・P3-1期)または他役割の既存作業。commitに含めない(`git add`で名指しした対象にこれらは含まれないため自動的に除外される) |

commitを実行する際は、上記「対象」行のファイルのみを`git add`で個別に名指しし(`-A`/`.`は使わない)、「対象外」行は一切触れないこと(§13参照)。

---

## 12. 後続ステップ/フェーズへの申し送り(集約、詳細は`docs/phase3-p3-2-plan.md` §10.7)

- D04途中段階終了時のノート記録契約(P3-4、Q9案B)。
- `RunSnapshot`拡張のtrack-run実装(`stepTrackRunWithDestruction`)への波及(P3-4)。**波及先は正式Fable P3-1-Q9裁定の「`accumulator.replaySnapshot`単一出典」不変条件を、`stepTestRunWithDestruction`と同様に引き継ぐこと。**
- `derailed`/`energyExhausted`のtrack-run文脈での必須網羅(P3-4、Q8裁定)。
- `regressionDiff`の実行タイミング・永続化・UI表示(P3-4、brabit所有、A2裁定)。
- `assembleD04Config`相当の実装(P3-4)。
- P3-1-Q1(D01漸減)のP3-3回収。
- **Q13-1のoverheated保留pre/post 2面契約(`normalizeOverheatedStatusForD04Hold`)を`stepTrackRunWithDestruction`(P3-4)が必ず共通純関数経由で継承し、独自複製しないこと。**
- **Q14裁定によるPhase5申し送り**: `hill-climb`×alkalineの実測`maxEnergyUsedRatio=1.1046`は、将来このコースが予算有効化された場合にalkalineが完走不能になるという設計空間の事実(§8参照)。
- **(正式Fable最終レビュー申し送り、2026-08-09、Phase3レビューC5残余——契約変更ではなく既存確定条件のリマインド)**: P3-3 DoD必須——「D02発煙のみ」(発煙相当の閾値には到達するがburnout条件には未到達の場合)では`terminalModeCandidates`が増えないことを固定する負例テスト。加えて「D05」は非終端モードそのものであるため、D05由来のいかなるイベントも`terminalModeCandidates`へ追加されないこと(`classifyTerminalModes`にD05分岐が存在しないという分類規則レベルの事実)を負例テストで固定すること。P3-4 DoD必須——「D09摩擦増のみ」(摩擦増大の閾値には到達するが焼付き条件には未到達の場合)では`terminalModeCandidates`が増えないことを固定する負例テスト。D04の「膨張のみ」「発煙のみ」に相当する負例(C5負例2件)はP3-2で既に消化済み。

---

## 13. commit候補範囲と無関係差分の除外

**commit候補に含める(P3-2スコープ、G9-R8是正でP3-2関連未追跡docs全件を漏れなく列挙、G9-R11是正でファイル数訂正)**:
- §5.1(production 6件)・§5.2(test 7件)記載のファイル一式(**合計13ファイル**: tracked 11件〈§11.3の`git diff --stat`に現れる集合〉+untracked `regressionDiff.ts`/`regressionDiff.test.ts` 2件)。§11.3の`git diff --stat`が示す「14 files」は、この tracked 11件に`AGENTS.md`・`CLAUDE.md`・`docs/phase3-plan-v12-amendments.md`の3 docsを加えた集合であり、production/testファイル数そのものではない。
- `AGENTS.md`・`CLAUDE.md`。
- `docs/phase3-plan-v12-amendments.md`(既存追跡ファイル、改訂7まで反映)。
- `docs/phase3-p3-2-plan.md`(v18、新規未追跡)。
- 本書(`docs/phase3-p3-2-implementation-report.md`、新規未追跡)。
- `docs/phase3-p3-2-final-review-request.md`(新規未追跡)。
- `docs/phase3-p3-2-fable-review-request.md`・`docs/phase3-p3-2-fable-review.md`(正式Fable技術レビューの依頼・回答原文、本セッション以前に作成済みの既存未追跡ファイル)。
- `docs/phase3-p3-2-human-reapproval-bundle.md`(人間再承認バンドル6項目の原文、既存未追跡ファイル)。
- ゲート5是正過程の審議用文書2件(`docs/phase3-p3-2-gate5-calibration-review-request.md`・`docs/phase3-p3-2-gate5-normal-operation-review-request.md`、既存未追跡ファイル)。

**commit候補から除外(P3-2の対象外、無関係差分)**:
- `docs/art-spec.md`・`docs/spec.md`——本セッション中に他役割の並行作業で生じた変更であり、alice_mot3(engine担当)は一切関与していない。
- `.codex/`・`docs/phase2-*.md`(Phase2期)・`docs/phase3-fable-*.md`/`docs/phase3-suu-*-review.md`/`docs/phase3-v12-ui-v5-suu-review.md`(P3-1期、`p3-2`を含まないファイル名で区別できる)・`docs/publication-consultation/`・`docs/reference/`・`docs/spec_1.md`・`docs/spec-r3-revision-proposal.md`・`docs/temp/`・`shareimg/`・`publication-consultation-pack-*.tar.gz`等——P3-2以前または他役割の既存作業(§11.4参照)。

commitの実行自体は人間承認後にステージング範囲を個別確認して行うこと(`git add`は`-A`/`.`を使わず、上記commit候補ファイルを名指しで指定する)。

**変更していないことを確認済み**: `src/engine/vehiclePhysics.ts`(完全無編集)。

### 13.1 人間判断2点の承認記録(2026-08-10承認)

正式Fable最終レビューの「人間承認時の確認2点」(§4相当の判定4に付随、Fable原文参照)について、人間プロジェクトリードが以下のとおり承認した。

1. **spec r3/art-spec r3一式の扱い**: `docs/spec.md`・`docs/art-spec.md`の浮き差分をP3-2 commitから除外する本書のスコープ判断は正しい。これらは責任者承認済みのr3改定であるため、**P3-2 commitとは別の近接commit**(対象: `docs/spec.md`・`docs/art-spec.md`・`docs/spec-r3-revision-proposal.md`・`docs/art-reference-notes-20260808.md`・`docs/decision-item-race-camera.md`・`docs/reference/`配下)として反映する。**このr3別commitはbrabit_mot3が実行する。alice_mot3のP3-2 commitには一切含めない**(対象ファイルの正確な確定作業もbrabit_mot3側の担当とする)。
2. **P3-1期のレビュー原文の保存方式**: 既存決定を維持する——**真正な最終レビュー原文のみを保存し、真正性が混在する旧資料群(P3-1期の未追跡docsのうち出典・版が確認できないもの)は遡及的にcommit対象へ含めない。** 今回のP3-2方式(§13、レビュー原文・再承認バンドル・審議文書をcommitに含める)をP3-1期分へ遡及適用することはしない。

いずれもP3-2のcommit範囲(§13冒頭)・production/test・較正値・契約本文には影響しない。P3-1期の対象外ファイル(`docs/phase3-fable-*.md`・`docs/phase3-suu-*-review.md`等)は、この決定によりP3-2 commitでも従来どおり対象外のままである(§13「commit候補から除外」に既述のとおり)。
