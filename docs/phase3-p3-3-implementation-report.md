# P3-3実装完了報告: D02(コイル焼損)+D05(異常ブラシ火花)+D01漸減(P3-1-Q1返済)+ブラシ素材写像+Gate6(store fixture統合)

作成: alice_mot3(2026-08-11、Gate7指示によりSuu_mot3指示で新設)。本書は正式Fable最終レビューへ提出するための自己完結資料である。**本書のみを読めば、P3-3のproduction/test実装(Gate0〜6)の内容・Q1〜Q15+D01補足裁定の全裁定・checkpoint5の較正候補値・Gate6実測証跡・全検証結果に加え、統治・最終DoD(Gate7)の内容までを復元できることを目標とし、agmsg全文の引用を前提としない。** 唯一の正である`docs/phase3-p3-3-plan.md`(現在v17)と矛盾する場合は同計画書を優先する。本書はdocs-onlyであり、production/testコードへの変更は一切含まない。`docs/phase3-p3-3-checkpoint5-implementation-report.md`(Gate0〜5時点の中間報告)の内容を引き継ぎ、Gate6(store fixture統合)+Gate7(本書)の内容を追加した最終版である。

**現在の状態(2026-08-11、Gate7時点)**: production/test実装(Gate0〜6)は完了し、69ファイル1416テスト全成功・build/lint成功を維持している。Gate0〜5はSuu_mot3照合(P48〜P59)を経て2026-08-11に完了、Gate6はSuu_mot3独立レビュー5ラウンド(P60〜P64)を経て2026-08-11に正式通過した(Fable追加裁定不要とSuu_mot3が判断)。**Gate7(最終docs/全体DoD確認)の文書化・全体DoD再実行は完了し、Suu_mot3最終照合待ち(正式Fable最終レビュー提出前)である。** commit・tag・pushは引き続き未着手。

---

## 1. 承認経路

1. 計画v1(2026-08-09)→Suu_mot3レビュー5ラウンド(v1〜v6、指摘47件〈P1〜P47〉)→v6がSuu_mot3最終照合通過。
2. Suu_mot3が`docs/phase3-p3-3-fable-review-request.md`を作成し正式Fable技術レビューへ提出。
3. 正式Fable技術レビュー(2026-08-09、人間プロジェクトリード直接提示・Suu_mot3中継確認済み): 条件付き承認(実装開始を妨げる必須修正なし)。Q1〜Q14の確定裁定+付帯条件7点+人間再承認バンドル13件の承認をもって実装解禁。
4. v7(裁定反映)→v8(文言収束7点、Suu_mot3最終照合通過)。
5. 人間再承認13項目(`docs/phase3-p3-3-human-reapproval-bundle.md`)→2026-08-10人間承認(「13件を再承認します」)。
6. ゲート0(docs同期)→ゲート1(型契約)→ゲート2(素材写像)で契約違反3点(P48〜P50)発覚→独立Fable補足レビュー依頼→正式Fable補足裁定(Q15-1〜Q15-7、2026-08-10)→v9・v10。Q15-4(判別union化)の追加型契約変更は人間再承認バンドル#4追補として個別提示され、2026-08-10「Q15-4再承認します」で人間承認(既承認13項目とは別に発生した追補1件、計14件)。
7. ゲート3(状態機械)でQ13-2 15組合せ表のうち9組合せが未較正D02により失敗→P54是正(ゲート3〜5「統合較正閉包」への再編、v11)。
8. ゲート4(物理効果)で失敗19件へ拡大→P55診断(同一根因閉包と判定、v12)。
9. ゲート5=checkpoint5(較正sweep)完了(v13)→Suu_mot3照合P56(5点追補、v14)→P57(2点是正、v15、Suu_mot3最終照合通過)。
10. 正式Fable較正レビュー(2026-08-10): D02・D05共通・ブラシ8値を採用確定、付帯条件3点指示→P58是正→D01のみ受け入れ条件3未充足が判明→補足レビュー依頼→正式Fable補足裁定(2026-08-11、D01較正確定)→v16→P59是正(4点)。
11. Suu_mot3独立照合(2026-08-11)がGate6解禁条件3点の充足を確認、Gate6着手承認。
12. Gate6実装計画をSuu_mot3へ提出、6条件付き承認。実装後、Suu_mot3独立レビュー5ラウンド(P60〜P64是正、詳細は下記§10)を経て2026-08-11にGate6が正式通過(Fable追加裁定不要)。
13. Gate7(最終docs/全体DoD確認、本書)着手。

## 2. 人間再承認13件+追補1件(計14件、全件承認済み)

`docs/phase3-p3-3-human-reapproval-bundle.md`の要旨。原13項目は2026-08-10「13件を再承認します」で人間承認済み。#4追補(Q15-4、判別union化)はゲート2完了後に追加発生した型契約変更のため原13項目とは別に発生したが、これも2026-08-10「Q15-4再承認します」で別途人間承認済み(Suu_mot3中継確認済み)。

| # | 変更対象 | 関連裁定 |
|---|---|---|
| 1 | `D01Progress`への進行度フィールド追加(`decayExposureRad`) | Q4・Q5 |
| 2 | `DestructionConfig.d01`新設セクション(`decayExposureScaleRad`・`minEffectiveTurnsRatio`) | Q5 |
| 3 | `DestructionConfig.d02`拡張(`conductionScale`・`dissipationCoefficient`・`smokeResistanceMultiplier`) | Q1・Q2 |
| 4 | `DestructionConfig.d05`拡張(`brushWearRateRatio`・`highCurrentPenalty`・`wearPerAmpSecond`等) | Q3・Q6・Q7 |
| 4追補 | `highCurrentPenaltyThresholdA`/`highCurrentPenaltyMultiplier`の判別union化 | Q15-4(2026-08-10追加) |
| 5 | `DestructionFrameInput`拡張(`coilLossW`・`isChatteringThisFrame`・`angularVelocityRadS`) | Q1・Q4 |
| 6 | `D05Progress`拡張(`cumulativeWearDeltaFraction`・`recoveryFramesLeft`) | Q3・Q7 |
| 7 | `MotorConfig`拡張(`effectiveTurnsRatio`・ブラシ2フィールド) | Q5・Q6 |
| 8 | `computeElectricalState`/`computeMagneticTorque`/`computeContactResistance`/`nextChatterState`の式改修(**最重量**) | Q5・Q6・Q7 |
| 9 | `D02Progress`への発煙latchフィールド追加(`smokingStarted`・`smokingStartedAtT`) | Q8 |
| 10 | `D05CauseLog`への理論電流フィールド追加(`theoreticalCurrentA`) | Q9 |
| 11 | `MaterialSelection.brushId`必須フィールド追加 | Q10 |
| 12 | `restoreRunSnapshot`の復元契約厳格化 | Q7・Q12 |
| 13 | `encodeRecipe`への新規failureモード追加 | Q14 |

## 3. Gate0〜7完了サマリ(年表)

| # | 時期 | 対象 | 内容 | 結果 |
|---|---|---|---|---|
| Gate0 | 2026-08-10 | AGENTS.md/CLAUDE.md | spec/art-spec r3反映・P3-3計画状況の同期 | 完了、Suu_mot3照合通過 |
| Gate1(2ラウンド) | 2026-08-10 | 型契約+frame構築+MotorConfig側ブラシ型宣言 | `D01Progress`/`DestructionFrameInput`/`DestructionConfig.d01`拡張等 | 完了、Suu_mot3照合通過 |
| Gate2 | 2026-08-10 | materialMappingゲート | `mapBrushRatios`/`mapD05BrushWearConfig`/`assembleD05Config`新設 | P48〜P50指摘→独立Fable補足レビュー(Q15-1〜Q15-7)→P52・P53是正→最終照合通過 |
| Gate3 | 2026-08-10 | 状態機械checkpoint | Q13-2 NORMAL_OPERATION表9組合せ失敗発覚 | P54是正(Gate3〜5を「統合較正閉包」として再編) |
| Gate4 | 2026-08-10 | 物理効果checkpoint | 失敗9件→19件へ拡大 | P55診断(同一根因閉包、許容する赤19件を列挙) |
| Gate5(checkpoint5) | 2026-08-10 | 較正sweep | D02較正値導出(0.1/0.1→0.04/0.5)、Q15-2/Q15-3実測、NORMAL_OPERATION拡張列再実測 | P56(5点追補)→P57(2点是正)→Suu_mot3最終照合通過 |
| — | 2026-08-10 | 正式Fable較正レビュー | D02・D05共通・ブラシ8値採用確定、付帯条件3点 | P58是正→D01のみ受け入れ条件3未充足判明 |
| — | 2026-08-11 | D01補足裁定 | 現行値維持、受け入れ条件3→3′・条件1→1′改訂(創発知見として受容) | P59是正(4点)→Gate6解禁確定 |
| Gate6 | 2026-08-11 | store fixture統合(10件、#71〜#80) | D01/D02/D05の3文脈原子的適用+原子性負例2件 | P60〜P64是正(詳細§10)→2026-08-11正式通過(Fable追加裁定不要) |
| Gate7 | 2026-08-11 | 最終docs/全体DoD確認 | 本書+plan.md/amendments.md更新+AGENTS.md/CLAUDE.md更新+全体DoD再実行 | 本書がその成果物 |

## 4. 各Fable裁定への実装対応表

### 4.1 正式Fable技術レビュー確定裁定(2026-08-09、Q1〜Q14、条件付き承認)

| # | 内容 | 確定裁定 |
|---|---|---|
| P3-3-Q1 | D02コイル熱ゲージの駆動式 | **確定**: `coilLossW`(`computeRCoil`ベース)を承認 |
| P3-3-Q2 | D02発煙抵抗倍率の具体形 | **確定**: 単一固定値(`smokeResistanceMultiplier`) |
| P3-3-Q3 | D05摩耗換算経路 | **確定**: 候補(a)、`D05Progress.cumulativeWearDeltaFraction`新設 |
| P3-3-Q4 | D01進行量の駆動式・入力単位 | **確定**: 候補(b)、`angularVelocityRadS`新設+`COIL_DEFORM_OMEGA`超過分積分 |
| P3-3-Q5 | 実効巻数・占積減の表現方法 | **確定**: 承認(`effectiveTurnsRatio`新設、エネルギー整合コメント+motorPhysics.test.ts 49件回帰全成功が条件) |
| P3-3-Q6 | ブラシ写像の層分離 | **確定**: MotorConfig層2フィールド+DestructionConfig.d05層3フィールドの2層分離を承認 |
| P3-3-Q7 | D05一時接触抵抗悪化の実装方法 | **確定**: 候補(a)回復区間モデル+spec解釈確定(アーク後接触面荒れ) |
| P3-3-Q8 | D02発煙状態の可逆/不可逆 | **確定**: 候補(b)不可逆latch(`smokingStarted`) |
| P3-3-Q9 | `D05CauseLog`拡張の要否 | **確定**: 候補(b)`theoreticalCurrentA`追加(人間再承認対象) |
| P3-3-Q10 | recipeCode.tsキー名・MC3版上げ要否・`MaterialSelection.brushId`必須化 | **確定**: 3点とも承認 |
| P3-3-Q11 | `brush.wearFraction`の次run反映 | **確定**: P3-4据え置きを承認 |
| P3-3-Q12 | `effectiveTurnsRatio`の型・restore・recipeの3契約 | **確定**: 承認(`restoreRunSnapshot`へbase専用制約) |
| P3-3-Q13 | `mapD05BrushWearConfig`出力+共通部分の単一構築経路 | **確定**: 候補(b)`assembleD05Config`新設 |
| P3-3-Q14 | `encodeRecipe`のencode方向脱落防止 | **確定**: 候補(c)戻り値string維持+throw |

### 4.2 正式Fable補足裁定(2026-08-10、Q15-1〜Q15-7、P48〜P50への対応)

| # | 内容 | 確定裁定 |
|---|---|---|
| Q15-1 | P48(未承認具体値の混入、8個)の裁定 | **確定**: 案(a)。恒久規則新設(較正数値は初期候補値としてFable裁定を経ること) |
| Q15-2 | ratio類6個(接触抵抗3・チャタリング1・摩耗2)の裁定 | **確定**: 全数承認 |
| Q15-3 | 貴金属高電流ペナルティ2個(閾値3A・倍率2.5)の裁定 | **確定**: 全数承認、Gate5受け入れ条件3点 |
| Q15-4 | 不活性ペナルティ表現(番兵値999 vs 判別union) | **確定**: 候補(ii)判別union化。**人間再承認対象**(確定済み) |
| Q15-5 | P49(銀黒鉛摩耗契約の矛盾)の裁定 | **確定**: 案(i) |
| Q15-6 | 人間再承認の個別判定 | **確定**: Q15-4のみ必要 |
| Q15-7 | Q6/Q13への影響 | **確定**: 設計変更不要 |

### 4.3 D01較正確定(正式Fable補足裁定、2026-08-11)

現行値(`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`)を維持したまま確定。受け入れ条件3(floor到達可能性)自体を誤りと認定し、実測で発見された自己制限フィードバック(劣化→トルク定数低下→回転低下→減衰停止)を、Phase 2の銅線+フェライト過熱レジームに続く本プロジェクト2件目の創発的実測知見として受容。条件3→3′(プラトーの実測固定)・条件1→1′(トリガ+1秒でratio≥0.8)へ改訂。詳細は§7.4を参照。

## 5. 全変更ファイルと非対象境界

### 5.1 production(alice_mot3所有、Gate0〜5)

- `src/engine/destructionModes.ts`: `advanceD02`/`advanceD05`新設、`D01Progress`拡張、`DestructionConfig.d01`新設、`D02Progress`拡張、`D05CauseLog`拡張、`DestructionConfig.d02`/`d05`拡張、`D05Progress`拡張、`DestructionFrameInput`拡張。
- `src/engine/destructionOrchestration.ts`: `composeEffectiveMotorConfig`のD01/D02/D05分岐、`buildMotorOnlyFrameInput`/`buildVehicleFrameInput`の新フィールド算出、`deriveDegradationDiffs`のD02/D05拡張、validator拡張。
- `src/engine/motorPhysics.ts`: `computeElectricalState`/`computeMagneticTorque`/`computeContactResistance`/`nextChatterState`の式改修、`MotorConfig`インターフェースへ3フィールド追加(いずれも既定値で後方互換)。
- `src/materials/materialMapping.ts`: `mapBrushRatios`・`mapD05BrushWearConfig`・`assembleD05Config`新設、`BrushMaterialId`export、`composeConfigFromMaterials`拡張(Gate2実装対象、計画本文記載どおり)。
- `src/engine/recipeCode.ts`: ブラシ2フィールドのキー追加+`encodeRecipe`のfail-fast化。

### 5.1追補 scripts(alice_mot3所有、Gate2/Q15/P50)

- `scripts/materialSweep.ts`: P3-3 Gate2実装+正式Fable補足裁定(Q15)+P50是正の一環として、brush選択・health scan・表示文言を変更した真正なP3-3差分。計画本文(`docs/phase3-p3-3-plan.md`)自身が本ファイルをGate2実装対象として記録している。無関係差分ではなく、commit候補に含める。

### 5.1追補2 components(P3-3の型依存閉包による機械的追従、UI独自仕様変更ではない)

- `src/components/ExperimentNotebook.tsx`: `MotorConfig`拡張(`effectiveTurnsRatio`・`brushContactResistanceRatio`・`brushChatterProbabilityRatio`、§5.1のmotorPhysics.ts改修分)に対する、既存の表示名辞書への機械的追従差分(3フィールドの表示名追加のみ)。UI側の独自仕様変更ではなく、公開`MotorConfig`型拡張への型依存閉包の一部としてcommit候補に含める。

### 5.2 test(alice_mot3所有、計6ファイル)

Gate0〜5: `src/engine/__tests__/destructionModes.test.ts`・`destructionOrchestration.test.ts`・`recipeCode.test.ts`・`src/materials/__tests__/materialMapping.test.ts`・`src/store/__tests__/runOutcomeApplication.test.ts`(冒頭調整分)・`saveStore.test.ts`。
Gate6: `src/store/__tests__/runOutcomeApplication.test.ts`(新規10件#71〜#80+ヘルパー関数群、詳細§10、上記6ファイルのうち既出の1ファイルへの追加差分であり別ファイルではない)。

### 5.3 docs

`docs/phase3-p3-3-plan.md`(v1→v17)、`docs/phase3-plan-v12-amendments.md`(P3-3-Q1〜Q15・D01較正確定・改訂12エントリ)、`docs/phase3-p3-3-human-reapproval-bundle.md`、`docs/phase3-p3-3-fable-review-request.md`、`docs/phase3-p3-3-fable-supplementary-review-request-q15.md`、`docs/phase3-p3-3-checkpoint5-fable-review-request.md`、`docs/phase3-p3-3-checkpoint5-fable-review.md`、`docs/phase3-p3-3-checkpoint5-implementation-report.md`、`docs/phase3-p3-3-d01-supplementary-review-request.md`、`docs/phase3-p3-3-d01-fable-response.md`、`docs/phase3-p3-3-d01-fable-submission-message.md`(提出経路記録)、`AGENTS.md`/`CLAUDE.md`、本書、`docs/phase3-p3-3-final-review-request.md`。

### 5.4 非対象境界(明示)

- `src/engine/vehiclePhysics.ts`・`src/engine/trackPhysics.ts`(車体・コース物理、凍結)は**本フェーズを通じて完全無編集**。
- `src/store/gameStore.ts`はP3-0-Q2裁定どおり無配線・無編集(P3-4スコープ)。
- `src/store/saveStore.ts`・`src/store/runOutcomeApplication.ts`・`src/materials/degradationApplication.ts`はP3-0で全モード汎用対応済みのためGate6でも無編集(§10で差分ゼロを確認)。

## 6. 最終較正値一覧(全較正値の確定申請表)

**本節の全数値の性格**: 正式Fable較正レビュー(D02・D05共通・ブラシ8値、2026-08-10)+正式Fable補足裁定(D01、2026-08-11)をもって、以下の値は**全て確定**した。ただしproduction向け`DestructionConfig`・gameStore・UI配線はP3-0-Q2裁定どおりP3-4まで存在しないため、現時点ではいずれも`materialMapping.test.ts`等のfixtureでのみ使われる値である(「値としての確定」と「productionへの配線」は別軸)。

| 値 | 出典 | 受け入れ証跡 | 現時点の効力 |
|---|---|---|---|
| **D01: `decayExposureScaleRad=1000`** | ゲート1仮値、正式Fable補足裁定により**確定** | 構造的性質+改訂後の受け入れ条件3′・1′を実測・回帰テストで固定(§7.4) | **確定**。人間再承認不要 |
| **D01: `minEffectiveTurnsRatio=0.5`** | 同上、役割を安全域clampへ再定性のうえ**確定** | clamp DoDを確認済み | **確定**。人間再承認不要 |
| D02: `smokeGaugeThreshold=0.6` | ゲート1裁定値(較正対象外) | Q13-2 15組合せ実測でmaxD02Ratioが0.08〜0.16と十分下回る | **確定** |
| D02: `coilOverheatGaugeLimit=1` | 同上(terminal定義値、契約値) | D02専用M4型sweep・grid実測で到達可能性確認 | 契約値(較正対象外) |
| **D02: `conductionScale=0.04`** | checkpoint5でgrid実測により新規較正 | §7.1参照 | **確定**(「3×3 grid実測は較正証跡として模範的」とFable評価) |
| **D02: `dissipationCoefficient=0.5`** | 同上 | 同上 | 同上 |
| D02: `smokeResistanceMultiplier=1.2` | ゲート1裁定値 | §7.2参照 | **確定** |
| D05共通: `brushSparkDurationLimitS=0.15` | ゲート1裁定値 | §7.3参照 | **確定** |
| D05共通: `brushSparkCurrentThresholdA=3` | 同上 | Q15-3高負荷構成でD05 event causeLogから直接確認 | **確定** |
| D05共通: `wearPerAmpSecond=0.001` | 同上 | Q15-3の累積摩耗実測値が現実的範囲 | **確定** |
| D05共通: `recoveryFrames=6` | 同上 | §7.3参照 | **確定** |
| D05共通: `recoveryContactResistanceMultiplier=1.2` | 同上 | 同上 | **確定** |
| ブラシ: `brush-copper-plate` `brushContactResistanceRatio=1.3` | Q15-2裁定済み暫定候補値 | §7.5(両極実測、差率38.35%) | **確定** |
| ブラシ: `brush-silver-graphite` `brushContactResistanceRatio=0.7` | 同上 | tierIndex順配列`[1.3,1,0.7,0.5]`数値回帰固定 | **確定**(間接的裏付け) |
| ブラシ: `brush-precious-metal` `brushContactResistanceRatio=0.5` | 同上 | §7.5(改善側の極として直接実測) | **確定** |
| ブラシ: `brush-precious-metal` `brushChatterProbabilityRatio=0.7` | 同上 | 付帯条件3(効果単離実証、バースト発生数375<403) | **確定** |
| ブラシ: `brush-copper-plate` `brushWearRateRatio=1.5` | Q15-3裁定済み暫定候補値 | §7.6(累積摩耗0.076636、中間順位) | **確定** |
| ブラシ: `brush-precious-metal` `brushWearRateRatio=0.7` | 同上 | §7.6(累積摩耗0.117902、両方上回る) | **確定** |
| ブラシ: `brush-precious-metal` `highCurrentPenaltyThresholdA=3` | 同上 | §7.6(causeLog直接assert、最大40.666317A) | **確定** |
| ブラシ: `brush-precious-metal` `highCurrentPenaltyMultiplier=2.5` | 同上 | §7.6(実効摩耗率1.75、両方上回る) | **確定** |

計20項目(較正値19項目+較正対象外契約値`coilOverheatGaugeLimit`1項目)。

## 7. 実測結果全文(checkpoint5)

### 7.1 D02較正: 3×3 grid実測(`conductionScale`×`dissipationCoefficient`)

| conductionScale | dissipationCoefficient | 等価ゲインk | Q13-2 15組合せ maxD02Ratio | 高負荷ignition step | 高負荷ignition秒 | D03先行/混在 |
|---|---|---|---|---|---|---|
| 0.02 | 0.3 | 0.0667 | 0.1294 | 到達せず(3000step上限) | - | なし |
| 0.02 | 0.5 | 0.04 | 0.0780 | 到達せず | - | なし |
| 0.02 | 0.8 | 0.025 | 0.0488 | 到達せず | - | なし |
| 0.04 | 0.3 | 0.1333 | 0.2589 | 678 | 5.65 | なし |
| **0.04** | **0.5** | **0.08** | **0.1559** | **1206** | **10.05** | **なし** |
| 0.04 | 0.8 | 0.05 | 0.0976 | 到達せず | - | なし |
| 0.08 | 0.3 | 0.2667 | 0.5177 | 326 | 2.72 | なし |
| 0.08 | 0.5 | 0.16 | 0.3119 | 403 | 3.36 | なし |
| 0.08 | 0.8 | 0.1 | 0.1952 | 632 | 5.27 | なし |

採用値(0.04,0.5)はq13max=0.1559で閾値0.6まで約74%の余裕があり、受け入れ領域の内部に位置する。既存の期待値(`finalStep:3848`等)は較正後に再実測してそのまま一致し、書き換えは発生しなかった。

### 7.2 D02: smokeResistanceMultiplier副作用の方向実測

| multiplier | フォーク直後coilLossW平均 | 100step後coilLossW平均 | burnout到達step | burnout到達秒数 | 同時点(step696)でのratio |
|---|---|---|---|---|---|
| 1.0(no-op) | 10.578 | 9.818(減少傾向) | 未到達 | 未到達 | 0.885 |
| **1.2(採用値)** | 9.728 | 10.690(増加傾向) | **696** | **5.8秒** | 1.0(到達済み) |

### 7.3 D05共通較正値(duration/recovery)の証跡

- `brushSparkDurationLimitS=0.15`は単一バースト内(24フレーム)のframe17でepisode到達することを実測固定。
- `recoveryFrames=6`・`recoveryContactResistanceMultiplier=1.2`がno-opでないことを実測固定(実測: 非活性1.637896A→活性1.605186A)。

### 7.4 D01較正確定: 自己制限プラトー実測

**trajectory実測(motor-only free-spin、`varnished:false`、`loadTorque=0`)**:

| coilTurns | magnetDistanceMm | 崩壊トリガ時刻(秒) | decayExposureRadのプラトー値 | プラトー時点のratio | 40秒時点のomega(rad/s) |
|---|---|---|---|---|---|
| **15** | **8**(最良構成) | 4.691666666666666 | 292.6341151356759 | 0.7073658848643241 | 0(完全失速) |
| 15 | 10 | 5.225 | 217.60714924446563 | 0.7823928507555343 | 0(完全失速) |
| 10 | 8 | 8.475 | 77.4163912161609 | 0.922583608783839 | 28.595677602878084 |
| 20 | 10 | 4.583333333333333 | 271.8388621147568 | 0.7281611378852432 | 188.81404799446105 |

正式Fable補足裁定(全文`docs/phase3-p3-3-d01-fable-response.md`): 現行値維持で確定。自己制限フィードバックを本プロジェクト2件目の創発的実測知見として受容。条件3′(プラトーratio 0.7074充足)・条件1′(トリガ+1秒でratio≥0.8、実測0.8914)へ改訂。`minEffectiveTurnsRatio=0.5`の役割を安全域clampへ再定性。Phase 5コース設計への申し送り(急降坂コースの潜在挙動)を記録。

### 7.5 Q15-2(接触抵抗両極の観測可能性)実測結果

| ブラシ | 窓平均RPM(実測) |
|---|---|
| copper-plate(悪化側) | 354.836 |
| precious-metal(改善側) | 490.930 |

差率38.35%で明確に観測可能(受け入れ閾値5%を大きく上回る)。

### 7.6 Q15-3(貴金属高電流ペナルティによる順位逆転)実測結果

| ブラシ | 基礎摩耗率 | 高電流ペナルティ適用後の実効値 | 実測累積摩耗(600step) | episode数 |
|---|---|---|---|---|
| carbon(anchor) | 1.0 | 1.0(ペナルティなし) | 0.056354 | 6 |
| copper-plate | 1.5 | 1.5(ペナルティなし) | 0.076636 | 5 |
| precious-metal | 0.7 | 1.75(0.7×2.5) | 0.117902 | 6 |

precious-metal(0.117902)はcopper-plate(0.076636)を上回る(「大電流で急速に荒れる」の実測確認)。precious-metalの各D05 event causeLog(`theoreticalCurrentA`)から理論電流が3Aを超えていたことも直接assert(6件全event、最大40.666317A)。

## 8. NORMAL_OPERATION 15組合せ表全文

実在プレイアブル全5コース×全3電池、production-valid構成(`brush-carbon`固定)での自然走行実測(全15組合せ、`finalStatus='finished'`、破壊イベントゼロ):

| コース | 電池 | finalStep | 最終status | maxEnergyUsedRatio | maxD02Ratio |
|---|---|---|---|---|---|
| straight-10m | alkaline | 2919 | finished | 0.6627 | 0.0803 |
| straight-10m | NiMH | 2656 | finished | 0.6294 | 0.0896 |
| straight-10m | LiPo | 2576 | finished | 0.5398 | 0.1159 |
| hill-climb | alkaline | 3945 | finished | 1.1046※ | 0.0857 |
| hill-climb | NiMH | 3355 | finished | 0.9514 | 0.0964 |
| hill-climb | LiPo | 3085 | finished | 0.7383 | 0.1190 |
| curve-balance | alkaline | 2919 | finished | 0.6627 | 0.0803 |
| curve-balance | NiMH | 2656 | finished | 0.6294 | 0.0896 |
| curve-balance | LiPo | 2576 | finished | 0.5398 | 0.1159 |
| rough-board | alkaline | 2970 | finished | 0.6744 | 0.0813 |
| rough-board | NiMH | 2694 | finished | 0.6388 | 0.0897 |
| rough-board | LiPo | 2574 | finished | 0.5379 | 0.1146 |
| energy-run | alkaline | 4365 | finished | 0.9970 | 0.0802 |
| energy-run | NiMH | 3988 | finished | 0.9338 | 0.0880 |
| energy-run | LiPo | 3848 | finished | 0.8073 | 0.1154 |

※`hill-climb`は`hasEnergyBudget=false`のコースであり、1.0超は想定内。全15組合せで`D01Progress.triggered===false`・`D02Progress.smokingStarted===false`・`D05Progress.episodeCount===0`かつ`cumulativeWearDeltaFraction===0`を直接確認済み。

## 9. P3-0-Q6不変条件

P3-0-Q6(「破壊モードの状態機械を追加するたびに、`deriveDegradationDiffs`が新モードのdiffを生成することをテストで固定する」)は、D02(`{role:'rotor',kind:'burnout'}`)・D05(`{role:'brush',kind:'wear',deltaFraction}`)の両方についてゲート3(状態機械checkpoint)で同時実装され、`destructionOrchestration.test.ts`のtargetedテストで直接固定済み。適用範囲拡張(D01/D02/D05込み)は既存契約を変更せず、対象モードを追加するのみ。

---

## 10. Gate6: store fixture統合(3文脈、10件)+P60〜P64是正史

### 10.1 実装内容

`src/store/__tests__/runOutcomeApplication.test.ts`へD01/D02/D05の3文脈(motor-only/test-run/track-run)原子的適用+原子性負例2件を実装した(既存#70に続けて#71〜#80)。store層(`runOutcomeApplication.ts`・`saveStore.ts`・`degradationApplication.ts`)はP3-0で全モード汎用対応済みのため、新規productionコードは一切追加していない。

| # | モード | 文脈 | 素材選択 | 要点 |
|---|---|---|---|---|
| 71 | D01(非終端、rotor/collapse) | test-run(実wrapper) | NiMH+magnet-samarium-cobalt(nonDemagnetizing)+wire-silver+gear-titanium+brush-precious-metal | collapsed反映・newlyDiscoveredModes確認 |
| 72 | D01 | track-run(66番/68b番と同型のreplaySnapshot差し替え) | 同上 | fingerprint一致・restoreRunSnapshot成功 |
| 73 | D02(終端、rotor/burnout) | motor-only(実wrapper、外部負荷トルク) | NiMH+magnet-neodymium+wire-silver+gear-titanium+brush-precious-metal | burnedOut反映・terminalModes確認・D07相関発火の共存確認 |
| 74 | D02 | test-run(実wrapper、登坂高電流) | 同上(+magnetDistanceMm=2) | burnedOut反映・batteryHeat<1確認 |
| 75 | D02 | track-run(同型差し替え) | 同上 | 同上 |
| 76 | D05(非終端、brush/wear) | motor-only(実wrapper、決定論的rng) | NiMH+magnet-neodymium+wire-silver+gear-titanium+brush-carbon | wearFraction反映・cumulativeWearDeltaFractionを最終stateから直接検証・termination===null直接固定 |
| 77 | D05 | test-run(実wrapper、決定論的rng) | 同上 | 同上 |
| 78 | D05 | track-run(同型差し替え) | 同上 | 同上 |
| 79 | 原子性負例(D02/rotor) | motor-only(#73と同一構築関数) | 同#73 | missingEquipment(role:rotor)・入力inventory完全非変異 |
| 80 | 原子性負例(D05/brush) | motor-only(#76と同一構築関数) | 同#76 | missingEquipment(role:brush)・入力inventory完全非変異 |

### 10.2 P60〜P64是正史(Suu_mot3独立レビュー5ラウンド)

値(D01/D02/D05/D07較正値)は一度も変更していない。是正はすべてtest fixture構築側に閉じている。詳細は`docs/phase3-p3-3-plan.md` 13.2.1節を参照。要旨:

- **P60(較正値の実質差し替え違反)**: 初回実装は#71/#73/#74/#76〜78のdestructionConfig個別上書き(D02のconductionScale=5、D05のthreshold=1.0等)が、§13.2条件3「較正値は変更しない」の実質的違反だった。`vehicleSnapshotInput`ヘルパーの出典分裂(overrides.motorConfig/carConfigを渡してもinitialVehicleStateが既定値のまま導出される)も発覚し是正した(既存#63〜70への数値影響なしを回帰確認)。#73/#74の適用前event直接assert欠落(条件2)も是正。
- **P61(電池素材軸の見落とし)**: D02 test-run/track-runの到達不能判断が`batteryInternalResistanceRatio`(既定1.0=アルカリ)を固定した理論分析に基づいており、実在NiMH(ratio=0.3)を見落としていた。理論上界V²/(4·R_battery)が7.5W→25Wへ改善。
- **P62(「一部だけ正式写像」の不十分性)**: `batteryInternalResistanceRatio`1フィールドだけを既定fixtureへ足す構成はfixture全体のproduction-valid性として不十分と指摘。`composeConfigFromMaterials`起点の構成へ差し替え、D02 test-run/track-runが成立(NiMH+neodymium+silver+precious-metal+titanium+magnetDistanceMm=2)。
- **P63(素材事実の二経路手入力)**: 「値」だけでなく「値の対応関係」もproduction-valid性の対象との指摘。D01/D05の基底motorConfigがmagnetStrength=1.0(実在最大値neodymium=0.9を超過)であったこと、D01の磁石強度とd07.nonDemagnetizing・D05のbrush素材とd05摩耗設定がそれぞれ同一素材事実を2経路から入力できる穴を残していたことが指摘され、`pvMotorCarGate6`(`MaterialSelection`明示入力の汎用builder)へ#71〜78を統一、d07/d05を`mapD07DestructionConfig`/`mapD05BrushWearConfig`+`assembleD05Config`から同一素材IDより自動導出する構造へ是正。
- **P64(既存assertの脱落)**: P63の全面書き直しで#76〜78から既存の`expect(result.termination).toBeNull()`(D05非終端の直接固定)が脱落していたことが指摘され復元。

2026-08-11、Suu_mot3独立レビューがP64是正を最終確認し、Gate6は正式に通過した(Fable追加裁定不要)。

### 10.3 副次的発見

実在neodymium磁石は熱感度が高く、D02/D05のテスト構成でD07(磁石減磁、非終端)が過負荷の相関効果として一緒に発火する。terminalModes/degradationDiffsのD02/D05固有assertionは妨げられないことを確認済み。同一過負荷条件下でコイル焼損・ブラシ摩耗と磁石熱が相関するという物理的に自然な現象であり、fixtureの欠陥ではない。

---

## 11. 既知の非配線事項(commit候補にも含めるが、P3-4以降まで機能しない)

- production向け`DestructionConfig`・`gameStore`実配線・UI配線・人間試遊は、P3-0-Q2裁定どおり引き続きP3-4まで行わない。
- D01/D02/D05/D07較正値は「値としての確定」のみで、`materialMapping.test.ts`・`runOutcomeApplication.test.ts`のfixtureでのみ使われる(productionの`gameStore`は未配線)。
- `brush.wearFraction`の次run反映(Q11裁定によりP3-4据え置き)。

---

## 12. 全テスト/build/lint/cmp/diff証跡(Gate7最終実行、実出力全文)

以下は`docs/phase3-p3-3-implementation-report.md`執筆時点(2026-08-11、Gate7)で実行した最終検証の実出力である。§14(Gate7-6)で再実行した最新結果を正とする。

```
$ npx tsc -b
→ エラーなし(exit 0)

$ npx vitest run src/store/__tests__/runOutcomeApplication.test.ts
→ Test Files 1 passed (1) / Tests 87 passed (87)

$ npm run test -- --run
→ Test Files 69 passed (69) / Tests 1416 passed (1416)

$ npm run build
→ ✓ built、dist/assets/index-*.js 790.97 kB / gzip 221.23 kB(v16時点と同一、Gate6はtest-onlyのためbundle不変)

$ npm run lint
→ エラーなし(exit 0、oxlint)

$ npx tsc -p tsconfig.material-sweep.json
→ エラーなし(exit 0)

$ cmp AGENTS.md CLAUDE.md
→ 差分なし(identical)

$ git diff --check
→ exit 0

$ git diff --stat -- src/store/runOutcomeApplication.ts src/store/saveStore.ts src/materials/degradationApplication.ts src/store/gameStore.ts src/engine/vehiclePhysics.ts src/engine/trackPhysics.ts
→ 出力なし(無変更)

$ grep -rc "TEMP_" scripts/ src/
→ 全ファイル0(診断コードの残留なし)
```

**Gate7/Suu照合記録(正式Fable最終レビューの付帯条件2、1行確認)**: D02/D05のevent.causeLog.temperature規約は実装・テストとも確認済みである。D02は`{ kind: 'uncalibratedGauge', ratio: nextCoilHeatGaugeRatio }`(`src/engine/destructionModes.ts`)を発行し、`src/engine/__tests__/destructionModes.test.ts:330`で`expect(event.causeLog.temperature).toEqual({ kind: 'uncalibratedGauge', ratio: state.modes.D02.coilHeatGaugeRatio })`として`state.modes.D02.coilHeatGaugeRatio`に直接一致することを検証している。D05は`{ kind: 'unavailable' }`(固定)を発行し、同ファイル936行目で`expect(event.causeLog.temperature).toEqual({ kind: 'unavailable' })`として直接検証している。

Gate6差分stat(機械分離、`src/store/__tests__/runOutcomeApplication.test.ts`のみ):

- Gate1由来(pre-existing、本フェーズ中Gate6着手前から存在、`goodDestructionConfig`/`goodLipoDestructionConfig`のd01/d02/d05フィールド追従): +22/-4(正味+18)
- **Gate6由来(alice_mot3、#71〜80+ヘルパー関数群+`vehicleSnapshotInput`是正)**: +557/-2(正味+555)

---

## 13. 後続ステップ/フェーズへの申し送り

P3-4(production配線)・Phase 5(以降)への申し送り事項。Suu_mot3のGate7指示で明記された8項目に、正式Fable最終レビュー(判定5)指摘の9項目目を加えた計9項目。

1. **D09摩擦増のみ非終端負例**: D09(軸受焼き付き)の摩擦増加のみで終端しない境界条件のテストが、P3-3スコープ内には存在しない。P3-4以降でD09の完全な状態機械テストを追加する際に確認すること。
2. **D02/D04/D05/D07個体WearState→base config共通反映**: 個体の恒久劣化(`WearState`)をD02(rotor burnedOut)・D04(body/magnet scorch)・D05(brush wear)・D07(magnet demagnetization)それぞれについて、次run開始時のbase MotorConfig/CarConfigへ反映する経路(劣化した個体を装備した状態で走行を開始する際の実効値computation)は、いずれもP3-4のgameStore配線時に横断的な設計判断(共通経路として第一級節扱いすべきか個別実装か)を要する(Q11裁定と同種の論点)。
3. **collapsed rotorの装備拒否**: D01でcollapsed=trueになったrotorAssemblyを、次runの装備選択UIでプレイヤーが誤って選択できてしまわないためのUI/store側のガード(現状はapplyRunOutcome層のmissingEquipment検証のみで、「壊れたrotorを装備しようとする」ケースの明示的拒否は未実装)。
4. **production `DestructionConfig`/`gameStore`/UI初回配線**: P3-0-Q2裁定どおりP3-4のスコープ。本フェーズで確定した全較正値(§6)をproduction configへ実際に配線する作業一式。
5. **snapshot唯一出典の徹底**: Gate6で発見した`vehicleSnapshotInput`ヘルパーの出典分裂バグ(P60是正)と同種のパターンが、P3-4のproduction経路(実際のゲームループでのRunSnapshot生成箇所)にも存在しないか、配線時に横断監査すること。
6. **Q9 finalDestructionStateノート追加**: `deriveDegradationDiffs`のD05拡張で`finalDestructionState`引数を初めて実際に使用した(P37是正)。この設計判断(final state由来のdiff)がD09等の将来モードにも適用可能かの検討ノートをP3-4着手時に追加すること。
7. **D01外部駆動floor潜在挙動**: `minEffectiveTurnsRatio`のfloorは現行5コースでは到達しないが、Phase 5で急降坂コース(外部機械駆動による過回転維持)を追加する場合、floor到達の潜在挙動が顕在化しうる。Phase 5コース設計時に本申し送りを参照すること。
8. **配線時bundle不連続増加の想定**: 現在のbundle size(790.97kB/gzip 221.23kB)はGate0〜6を通じて不変(test-onlyの変更のみ)。P3-4でproduction配線・UI結線を行うと、bundle sizeが不連続に増加することが予想される——初回ロード1MB未満(非機能要件)との整合を配線時に確認すること。
9. **P3-2-Q9裁定(`PendingNotebookRecord`3腕へのfinalDestructionState追加)**: 正式Fable較正裁定P3-2-Q9(`docs/phase3-plan-v12-amendments.md`)は、D04途中段階終了時のノート記録として`PendingNotebookRecord`3腕へ`finalDestructionState: DestructionState`を追加する方針(案B)を承認済みだが、型変更の実装自体はP3-2時点で書き手不在(「死にフィールド」回避)のためP3-4のgameStore配線サブステップへ送られている。台帳には記録済みだが本§13の申し送りリストにはP3-3実装完了時点まで一度も明記されていなかったため、正式Fable最終レビュー(`docs/phase3-p3-3-fable-final-review.md`判定5)の指摘によりP3-4計画の必須項目として本項で追記する。**本項は§13-6(P3-3独自のQ9——`deriveDegradationDiffs`のD05拡張での`finalDestructionState`引数使用に関する検討ノート)とは別件である**——§13-6はP3-3固有のFable Q9裁定、本項はP3-2-Q9裁定(ノート記録型そのものへのフィールド追加)であり、対象が異なる。

**P3-4計画起草者への統合参照義務**: 本§13の9項目は、次の申し送り群と統合参照すること——`docs/phase3-plan-v12-amendments.md`(裁定台帳)、`docs/phase3-p3-2-implementation-report.md` §12の申し送り(Q13-1保留規則〈`normalizeOverheatedStatusForD04Hold`〉の共通純関数継承・Q8のtrack-run×derailed/energyExhausted網羅・P3-1-Q9-2の`accumulator.replaySnapshot`単一出典原則に基づく非自明経路のリプレイ等価テスト・正式M5(ii)〈膨張・発煙段階のまま走行が終わった電池個体の記録に膨張域到達が残る〉のUI整合)。申し送りが本書§13・台帳・P3-2報告§12の複数文書に分散している以上、**P3-4計画レビューでは、これら申し送り群の統合が漏れなく行われているかを最初に確認すること**(正式Fable最終レビュー判定5)。

---

## 14. commit候補範囲と無関係差分の除外

### 14.1 commit候補allow-list(P3-3スコープ、全ファイル明示)

**production(5ファイル、§5.1)**: `src/engine/destructionModes.ts`・`src/engine/destructionOrchestration.ts`・`src/engine/motorPhysics.ts`・`src/materials/materialMapping.ts`・`src/engine/recipeCode.ts`。

**scripts(1ファイル、§5.1追補)**: `scripts/materialSweep.ts`(Gate2/Q15/P50でbrush選択・health scan・文言を変更した真正なP3-3差分)。

**components(1ファイル、§5.1追補2)**: `src/components/ExperimentNotebook.tsx`(MotorConfig拡張3フィールドへの表示名辞書の機械的追従)。

**test(6ファイル、§5.2)**: `src/engine/__tests__/destructionModes.test.ts`・`src/engine/__tests__/destructionOrchestration.test.ts`・`src/engine/__tests__/recipeCode.test.ts`・`src/materials/__tests__/materialMapping.test.ts`・`src/store/__tests__/runOutcomeApplication.test.ts`・`src/store/__tests__/saveStore.test.ts`。

**docs(§5.3記載の全ファイル)**: `docs/phase3-p3-3-plan.md`・`docs/phase3-plan-v12-amendments.md`・`docs/phase3-p3-3-human-reapproval-bundle.md`・`docs/phase3-p3-3-fable-review-request.md`・`docs/phase3-p3-3-fable-supplementary-review-request-q15.md`・`docs/phase3-p3-3-checkpoint5-fable-review-request.md`・`docs/phase3-p3-3-checkpoint5-fable-review.md`・`docs/phase3-p3-3-checkpoint5-implementation-report.md`・`docs/phase3-p3-3-d01-supplementary-review-request.md`・`docs/phase3-p3-3-d01-fable-response.md`・`docs/phase3-p3-3-d01-fable-submission-message.md`・`AGENTS.md`・`CLAUDE.md`・`docs/phase3-p3-3-implementation-report.md`(本書)・`docs/phase3-p3-3-final-review-request.md`・`docs/phase3-p3-3-fable-final-review.md`(正式Fable最終レビュー回答原文、新規追加)。

合計: production5+scripts1+components1+test6+docs16 = **29ファイル**。

### 14.2 除外(P3-3スコープ外、無関係差分)

- `.codex/`ディレクトリ、`docs/`配下のP3-3と無関係な文書(`docs/agmsg_codex_delivery_guide.md`・`docs/art-spec-r2.md`・phase2関連文書群・`docs/phase3-suu-v*-review.md`等のPhase3初期文書・`docs/spec_1.md`・`docs/publication-consultation/`・`docs/temp/`等): いずれも本フェーズの作業対象外であり、commit候補から除外する。
- `docs/phase3-p3-3-checkpoint5-fable-review-request.md`・`docs/phase3-p3-3-checkpoint5-fable-review.md`は上記14.1のとおりP3-3の真正な履歴文書としてcommit候補に**含める**(除外ではない、P65是正)。

Suu_mot3・人間プロジェクトリードによるcommit承認時は、上記14.1の allow-list のみをstageすること。`git status`実行時に14.1の範囲外の未追跡ファイルが混在していないか、commit実行前に必ず目視確認すること。

---

## 15. rg依存閉包(pitfalls#2、詳細は`docs/phase3-p3-3-plan.md` §14.2を参照)

Gate1(型契約)着手前に実測した依存閉包の要旨は`docs/phase3-p3-3-plan.md` §14.2に実測コマンド・出力とともに記載済み(`D01Progress`8箇所・`D05Progress`4箇所・`DestructionFrameInput`14箇所・`DestructionConfig.d02`/`d05`の6ファイル等)。Q15-4(判別union化)の依存閉包は`destructionModes.ts`・`destructionOrchestration.ts`・`materialMapping.ts`(production3)+`destructionModes.test.ts`・`destructionOrchestration.test.ts`・`materialMapping.test.ts`・`runOutcomeApplication.test.ts`・`saveStore.test.ts`(test5)の計8ファイルで実測済み(`docs/phase3-p3-3-checkpoint5-implementation-report.md` §2.2脚注)。Gate6は新規productionコードを追加していないため、新規の破壊的型変更・依存閉包は発生していない。

---

**手続きに関する注記**: 本書はalice_mot3が作成したdocs-only文書であり、正式Fableレビューの回答そのものではない。pitfalls#1(Fable回答の真正性)により、正式なFable回答は人間プロジェクトリードの直接提示、またはSuu_mot3が中継したもののみを正式回答として扱う。alice_mot3はいかなる場合もFable名義の文書を自己生成しない。
