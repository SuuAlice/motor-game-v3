# P3-3 Checkpoint 5(統合較正閉包)実装報告 — 正式Fable較正レビュー提出用

作成: alice_mot3(2026-08-10初版、2026-08-11更新)。本書はSuu_mot3の指示により、正式Fable較正レビューへ提出するための自己完結資料として新設した。**本書のみを読めば、P3-3のGate0〜5の実装内容・Q1〜Q15の全裁定・checkpoint5の較正候補値・実測証跡・検証結果を把握できることを目標とし、agmsg全文の引用を前提としない。** 唯一の正である`docs/phase3-p3-3-plan.md`(現在v16)と矛盾する場合は同計画書を優先する。本書はdocs-onlyであり、production/testコードへの変更は一切含まない。

**現在の状態(2026-08-11更新時点)**: production/test実装(Gate0〜5、checkpoint5較正sweepを含む)は完了し、69ファイル1406テスト全成功・build/lint成功を維持している。Suu_mot3照合(P56・P57・P58・P59)はいずれも通過済み。**正式Fable較正レビュー(2026-08-10)がD02・D05共通・ブラシ8値を採用確定し、正式Fable補足裁定(2026-08-11)がD01較正(受け入れ条件3→3′・条件1→1′改訂)を経て確定した——本節の§3全較正値の確定申請表は、この結果を反映した「確定」状態を記載する。Suu_mot3がGate6解禁条件3点の充足(2026-08-11)を確認し、Gate6(store fixture統合)を正式に解禁した。** commit・tag・pushは引き続き着手しない。

---

## 1. Gate0〜5と是正史(P48〜P57)の要約年表

P3-3は計画docs自体が v1→v16 まで16版の改訂を経ており(v1〜v6は5ラウンド47件の指摘〈P1〜P47〉、v9〜v10はQ15審査〈P48〜P53〉、v11〜v15はGate3〜5実装中の是正〈P54〜P57〉、v16は正式Fable較正レビュー+D01補足裁定の確定反映)、実装側もGate0からGate5まで複数ラウンドのSuu_mot3照合を経て現在に至る。年表は次のとおり。

| # | 時期 | 対象 | 内容 | 結果 |
|---|---|---|---|---|
| Gate0 | 2026-08-10 | AGENTS.md/CLAUDE.md | spec/art-spec r3反映・P3-3計画状況の同期 | 完了、Suu_mot3照合通過 |
| Gate1(2ラウンド) | 2026-08-10 | 型契約+frame構築+MotorConfig側ブラシ型宣言 | `D01Progress`/`DestructionFrameInput`/`DestructionConfig.d01`拡張等。1ラウンド目でSuu_mot3指摘5点、2ラウンド目で追加指摘4点(validator負例テスト不足等)を是正 | 完了、Suu_mot3照合通過 |
| Gate2 | 2026-08-10 | materialMappingゲート | `mapBrushRatios`/`mapD05BrushWearConfig`/`assembleD05Config`新設 | 実装完了報告時にSuu_mot3照合で**P48〜P50**(較正値の未承認混入、6.3節の矛盾、P3-2 D07回帰fixtureへのブラシ混入)を指摘され停止 |
| — | 2026-08-10 | Q15審査 | P48〜P50を受け、独立Fable補足レビュー依頼書を提出。正式Fable補足裁定(Q15-1〜Q15-7)を受領・反映 | 反映後、Suu_mot3独立最終照合で追加是正**P52・P53**(判別unionのraw shape validatorの穴等)を指摘され是正。最終照合通過 |
| — | 2026-08-10 | Q15-4人間再承認 | `DestructionConfig.d05.highCurrentPenalty`判別union化(破壊的変更)の人間再承認 | 確定(バンドル#4追補) |
| Gate3 | 2026-08-10 | 状態機械checkpoint(`advanceD02`/`advanceD05`) | targeted新規テストは全成功したが、既存`Q13-2 NORMAL_OPERATION`表のうち9組合せがD02未較正値により失敗 | **P54発覚**: ゲート分割設計自体がD02較正の依存関係(較正はGate4/5を経て初めて意味を持つ)を見落としていたと判定。Suu_mot3裁定によりGate3〜5を「統合較正閉包」として再編(13.1節新設) |
| Gate4 | 2026-08-10 | 物理効果checkpoint(`composeEffectiveMotorConfig`のD01/D02/D05分岐+`motorPhysics.ts`式改修) | 実装したところ全suite失敗が9件→19件へ拡大 | **P55発覚**: Suu_mot3独立診断により、19件はいずれも同一根因閉包(未較正D02の発煙latch→R_coil変化がM4/D07/Q2 sweepへ連成)に属すると判定。許容する赤を「正確な19テスト」として列挙(13.1.1節) |
| Gate5(checkpoint5、較正sweep) | 2026-08-10 | D02較正・Q15-2/Q15-3実測・NORMAL_OPERATION拡張列再実測 | D02較正値(0.1/0.1→0.04/0.5)導出、19件全回帰、Q15-2/Q15-3実測。69ファイル全緑化 | 完了報告としてSuu_mot3へ提出(v13) |
| — | 2026-08-10 | Suu_mot3照合(**P56**) | 「実装・テストは全緑だが較正sweep完了の証跡として不足5点」を指摘: (1)全較正値の確定申請表がない、(2)D02が2点比較のみでgrid実測でない、(3)smokeResistanceMultiplier副作用の方向が未報告、(4)D05共通のduration/recovery較正値の直接固定テストがない、(5)D01較正証跡が未整理 | production/testを変更せず5点すべて追補(v14) |
| — | 2026-08-10 | Suu_mot3照合(**P57**) | v14の13.1.3節がP56原指示と2点不一致: (1)ブラシ8値を1行へ集約していた、(2)smokeResistanceMultiplier段落へ禁止済みの因果説明が混入 | docs-onlyで2点是正(v15)。**Suu_mot3最終照合通過(2026-08-10)** |
| — | 2026-08-10 | 正式Fable較正レビュー | D02(`conductionScale`/`dissipationCoefficient`/`smokeResistanceMultiplier`)・D05共通5値・ブラシ8値を採用確定。付帯条件3点(Q15-3摩耗3値の数値回帰固定・接触抵抗4素材順位の具体値固定・貴金属`brushChatterProbabilityRatio=0.7`の効果単離実証)を指示。D01のみ、現行値が受け入れ条件3(floor到達可能性)を満たさないと実測判明 | 付帯条件2点は既存テストで充足済みと確認、1点(効果単離実証)を新規実装。**P58**でSuu_mot3が付帯条件2の確認漏れを指摘し是正 |
| — | 2026-08-11 | D01補足裁定 | 値を変更せず`docs/phase3-p3-3-d01-supplementary-review-request.md`で補足レビューを依頼した結果、正式Fable補足裁定を受領。現行値(1000/0.5)を維持したまま確定し、誤っていたのは受け入れ条件3自体だったと裁定。自己制限フィードバックを本プロジェクト2件目の創発的実測知見として受容し、条件3→3′・条件1→1′へ改訂 | 自己制限プラトー回帰テスト実装+docs反映(plan v16・amendments改訂10・本書)を実施。**P59**でSuu_mot3が二重出典(回帰テスト)・算術誤り(全21値)・先取り記述・日付誤りの4点を指摘、是正済み |
| 現在地 | 2026-08-11 | — | P56〜P59とも是正済み。Gate6解禁条件3点すべて充足 | **Gate6(store fixture統合)解禁。commit/tag/pushは引き続き未着手** |

---

## 2. Q1〜Q15 全裁定対応表

### 2.1 正式Fable技術レビュー確定裁定(2026-08-09、Q1〜Q14、条件付き承認)

| # | 内容 | 確定裁定 |
|---|---|---|
| P3-3-Q1 | D02コイル熱ゲージの駆動式 | **確定**: `coilLossW`(`computeRCoil`ベース)を承認 |
| P3-3-Q2 | D02発煙抵抗倍率の具体形 | **確定**: 単一固定値(`smokeResistanceMultiplier`) |
| P3-3-Q3 | D05摩耗換算経路 | **確定**: 候補(a)、`D05Progress.cumulativeWearDeltaFraction`新設 |
| P3-3-Q4 | D01進行量の駆動式・入力単位 | **確定**: 候補(b)、`angularVelocityRadS`新設+`COIL_DEFORM_OMEGA`超過分積分 |
| P3-3-Q5 | 実効巻数・占積減の表現方法 | **確定**: 承認(`effectiveTurnsRatio`新設、付帯条件: エネルギー整合コメント+motorPhysics.test.ts 49件回帰全成功) |
| P3-3-Q6 | ブラシ写像の層分離 | **確定**: MotorConfig層2フィールド+DestructionConfig.d05層3フィールドの2層分離を承認 |
| P3-3-Q7 | D05一時接触抵抗悪化の実装方法 | **確定**: 候補(a)回復区間モデル+spec解釈確定(アーク後接触面荒れ) |
| P3-3-Q8 | D02発煙状態の可逆/不可逆 | **確定**: 候補(b)不可逆latch(`smokingStarted`) |
| P3-3-Q9 | `D05CauseLog`拡張の要否 | **確定**: 候補(b)`theoreticalCurrentA`追加(人間再承認対象) |
| P3-3-Q10 | recipeCode.tsキー名・MC3版上げ要否・`MaterialSelection.brushId`必須化 | **確定**: 3点とも承認(`bcr`/`bpr`キー追加、版上げ不要、`brushId`必須化) |
| P3-3-Q11 | `brush.wearFraction`の次run反映 | **確定**: P3-4据え置きを承認 |
| P3-3-Q12 | `effectiveTurnsRatio`の型・restore・recipeの3契約 | **確定**: 承認(`restoreRunSnapshot`へbase専用制約、`validateMotorConfigShape`本体は汎用のまま) |
| P3-3-Q13 | `mapD05BrushWearConfig`出力+共通部分の単一構築経路 | **確定**: 候補(b)`assembleD05Config`新設 |
| P3-3-Q14 | `encodeRecipe`のencode方向脱落防止 | **確定**: 候補(c)戻り値string維持+throw(候補bはOmit型の過剰プロパティ検査回避により偽の安全と判定され却下) |

### 2.2 正式Fable補足裁定(2026-08-10、Q15-1〜Q15-7、P48〜P50への対応)

| # | 内容 | 確定裁定 |
|---|---|---|
| Q15-1 | P48(未承認具体値の混入、8個)の裁定 | **確定**: 案(a)——Gate2 production写像に暫定候補値を明示し、全値・根拠・Gate5での置換条件をFable裁定対象にする。恒久規則新設: 「実装ゲートでproductionコードに較正数値を置く前に、その数値は初期候補値としてFable裁定を経ていなければならない」 |
| Q15-2 | ratio類6個(接触抵抗3・チャタリング1・摩耗2)の裁定 | **確定**: 全数承認(銅板1.3・銀黒鉛0.7・貴金属0.5〈接触抵抗〉、貴金属0.7〈チャタリング〉、銅板1.5・貴金属0.7〈摩耗〉)。銅板の物理所見(酸化被膜)+Gate5受け入れ条件(接触抵抗差の定常観測可能性)を追加 |
| Q15-3 | 貴金属高電流ペナルティ2個(閾値3A・倍率2.5)の裁定 | **確定**: 全数承認。Gate5受け入れ条件3点: (i)NORMAL_OPERATION非到達、(ii)高負荷での順位逆転実測、(iii)銅板超えの副次的帰結の明示報告 |
| Q15-4 | 不活性ペナルティ表現(番兵値999 vs 判別union) | **確定**: 候補(ii)判別union化(`{kind:'noPenalty'}\|{kind:'thresholdPenalty';...}`、multiplier>1厳密)。**人間再承認対象**(バンドル#4追補、確定済み) |
| Q15-5 | P49(銀黒鉛摩耗契約の矛盾)の裁定 | **確定**: 案(i)——6.3節表を「銀黒鉛: 高電流域=中位(摩耗率はカーボンと同値)」へ精密化 |
| Q15-6 | 人間再承認の個別判定 | **確定**: Q15-1(手続き)・Q15-2/Q15-3(暫定候補値)・Q15-5(docs修正)・P50(機械的是正)は不要。Q15-4(判別union化)のみ必要 |
| Q15-7 | Q6/Q13への影響 | **確定**: 設計変更不要 |

**依存閉包(Q15-4判別union化、pitfalls#2実測、差分ゼロ確認済み)**: `destructionModes.ts`・`destructionOrchestration.ts`・`materialMapping.ts`(production3)+`destructionModes.test.ts`・`destructionOrchestration.test.ts`・`materialMapping.test.ts`・`runOutcomeApplication.test.ts`・`saveStore.test.ts`(test5)の計8ファイル。

---

## 3. 13.1.3節: 全較正値の確定申請表(`docs/phase3-p3-3-plan.md` v16より転載、省略なし、全値確定)

**本節の全数値の性格**: 正式Fable較正レビュー(D02・D05共通・ブラシ8値、2026-08-10)+正式Fable補足裁定(D01、2026-08-11)をもって、以下の値は**全て確定**した。ただし production向け`DestructionConfig`・gameStore・UI配線はP3-0-Q2裁定どおりP3-4まで存在しないため、現時点ではいずれも`materialMapping.test.ts`等のfixtureでのみ使われる値である点は変わらない(「値としての確定」と「productionへの配線」は別軸)。

| 値 | 出典 | 受け入れ証跡 | 現時点の効力 |
|---|---|---|---|
| **D01: `decayExposureScaleRad=1000`** | ゲート1仮値として導入され、正式Fable補足裁定(D01較正)により**確定**。誤っていたのは値ではなく旧受け入れ条件3(floor到達可能性)だった | 構造的性質(単調性・停止時ゼロ・clamp)+改訂後の受け入れ条件3′(プラトーの実測固定)・1′(トリガ+1秒でratio≥0.8)を実測・回帰テストで固定済み(§4.7参照) | **確定**。人間再承認不要(値の変更なし) |
| **D01: `minEffectiveTurnsRatio=0.5`** | 同上。floorの役割を「ゲームプレイ上の到達目標」から「数値安全域のclamp」へ再定性のうえ**確定** | clamp DoDを確認済み。floorが実際のゲームプレイに現れうる経路は外部機械駆動(急降坂での逆駆動)のみで現行5コースには存在しない | **確定**。人間再承認不要(値の変更なし) |
| D02: `smokeGaugeThreshold=0.6` | ゲート1裁定値(P3-3-Q1関連、本checkpointでは変更対象外) | Q13-2 15組合せ実測でNORMAL_OPERATION時のmaxD02Ratioが採用値(k=0.08)で0.08〜0.16と、この閾値を十分下回ることを確認 | **確定**。本checkpointでは非変更 |
| D02: `coilOverheatGaugeLimit=1` | 同上(terminal定義値、無次元ゲージの1.0固定は設計契約) | D02専用M4型sweep・grid実測いずれも到達可能性を確認 | 契約値(較正対象外) |
| **D02: `conductionScale=0.04`** | **本checkpointでgrid実測により新規較正**(旧値0.1はゲート1仮値、根因究明済み) | §4.1(D02 3×3 grid実測)参照 | **確定**(「3×3 grid実測は較正証跡として模範的」とFable評価) |
| **D02: `dissipationCoefficient=0.5`** | 同上 | 同上 | 同上 |
| D02: `smokeResistanceMultiplier=1.2` | ゲート1裁定値(本checkpointでは変更対象外) | §4.2(smokeResistanceMultiplier方向実測)参照 | **確定**。本checkpointでは非変更、方向のみ新規実測 |
| D05共通: `brushSparkDurationLimitS=0.15` | ゲート1裁定値(本checkpointでは変更対象外) | §4.3(D05 duration/recovery実測)参照 | **確定**。本checkpointでは非変更、到達可能性のみ新規実測 |
| D05共通: `brushSparkCurrentThresholdA=3` | 同上 | Q15-3高負荷構成で理論電流が実際にこの閾値を超えることをD05 event causeLogから直接確認(§4.5) | **確定** |
| D05共通: `wearPerAmpSecond=0.001` | 同上 | Q15-3の累積摩耗実測値がゼロでも発散でもない現実的な範囲に収まることで間接的に確認 | **確定**(「虐待走行4〜8回でブラシ寿命という経済スケールとして妥当」とFable評価) |
| D05共通: `recoveryFrames=6` | 同上 | §4.3参照(no-opでないことを実測) | **確定** |
| D05共通: `recoveryContactResistanceMultiplier=1.2` | 同上 | 同上(`brushContactResistanceRatio`のbase×1.2への変化、実物理での電流低下を確認) | **確定** |
| ブラシ: `brush-copper-plate` `brushContactResistanceRatio=1.3` | 正式Fable Q15-2裁定済みの暫定候補値 | Q15-2独立sweep(§4.4、両極の窓平均定常RPM差、実測354.836 vs 490.930・差率38.35%) | **確定**。Gate5受け入れ条件充足 |
| ブラシ: `brush-silver-graphite` `brushContactResistanceRatio=0.7` | 同上 | Q15-2裁定時にratio類6個の一括承認対象。付帯条件2(P58是正)でtierIndex順の具体値配列`[1.3,1,0.7,0.5]`を数値回帰固定済み | **確定**。個別sweep証跡はないが配列固定で間接的に裏付け済み |
| ブラシ: `brush-precious-metal` `brushContactResistanceRatio=0.5` | 同上 | Q15-2独立sweep(改善側の極として直接実測) | **確定**。Gate5受け入れ条件充足 |
| ブラシ: `brush-precious-metal` `brushChatterProbabilityRatio=0.7` | 同上 | Q15-3高負荷構成のチャタリング実測に加え、付帯条件3(正式Fable指示)で同一rng列・決定論的PRNG(mulberry32相当、seed=42)によるratio=0.7対1.0のバースト発生数比較(0.7側375<1.0側403、総チャタリングフレーム数8977<9672)を実測固定し、効果の存在を直接実証済み | **確定**。付帯条件3で効果の単離実証を完了 |
| ブラシ: `brush-copper-plate` `brushWearRateRatio=1.5` | 正式Fable Q15-3裁定済みの暫定候補値 | Q15-3高負荷構成で実測累積摩耗0.076636(carbon 0.056354を上回り、precious-metal 0.117902を下回る中間順位) | **確定**。Gate5受け入れ条件充足 |
| ブラシ: `brush-precious-metal` `brushWearRateRatio=0.7` | 同上 | Q15-3高負荷構成で実測累積摩耗0.117902(ペナルティ適用後、carbon・copper-plateの両方を上回る) | **確定**。Gate5受け入れ条件充足 |
| ブラシ: `brush-precious-metal` `highCurrentPenaltyThresholdA=3` | 同上 | Q15-3統合テストでprecious-metalの各D05 event causeLog(`theoreticalCurrentA`)が実際にこの閾値を超えていたことを直接assert(6件全event、最大40.666317A) | **確定**。Gate5受け入れ条件充足 |
| ブラシ: `brush-precious-metal` `highCurrentPenaltyMultiplier=2.5` | 同上 | Q15-3高負荷構成で実効摩耗率0.7×2.5=1.75がcarbon(1.0)・copper-plate(1.5)の両方を上回ることを実測確認(NORMAL_OPERATION側は`brush-precious-metal`自身のD05非進行も別途直接確認) | **確定**。Gate5受け入れ条件3点すべて充足 |

---

## 4. 実測結果全文

### 4.1 D02較正: 3×3 grid実測(`conductionScale`×`dissipationCoefficient`)

根因: `d02`の`conductionScale: 0.1, dissipationCoefficient: 0.1`(等価ゲイン`k=1.0`)はゲート1時代の未較正仮値であり、Gate4で`composeEffectiveMotorConfig`のD02分岐を結線した時点で、NORMAL_OPERATION実測`coilLossW`(全15組合せで3.0〜3.7W)がこのゲインのまま`coilHeatGaugeRatio`を`smokeGaugeThreshold`(0.6)へほぼ即座に到達させ、19件の連鎖失敗を引き起こしていた(§1のGate4行を参照)。

`conductionScale`/`dissipationCoefficient`を独立に3値ずつ(計9通り)の一時grid harnessで実測した(探索用コードは完全にrevert済み、`grep -c "TEMP_"`で残留ゼロを確認)。各組合せについてQ13-2 15組合せのNORMAL_OPERATION maxD02Ratio(実在全5コース×全3電池での最大値)・D02専用M4型sweep(高負荷構成)のignition step/秒・D03先行/混在の有無を実測した:

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

観察: NORMAL_OPERATION非到達(<0.6)かつ高負荷到達可能(3000step以内)の両方を満たす候補は(0.04,0.3)・(0.04,0.5)〈採用〉・(0.08,0.3)〈q13max=0.518で閾値まで14%しか余裕がない〉・(0.08,0.5)・(0.08,0.8)の5通り。**採用値(0.04,0.5)はq13max=0.1559で閾値0.6まで約74%の余裕があり、受け入れ領域の内部(境界ではない)に位置する。** 高負荷到達可能性は等価ゲインkだけでなく`conductionScale`の絶対値にも依存する観測結果を得た(0.02系列は全滅、0.04系列はdissipationCoefficient=0.8のみ不達)——この観測の物理的説明は断定せず、実測事実としてのみ記録する。

既存の期待値(`finalStep:3848`・`swellingAtStep:897`・`maxGauge:0.3271`等)は較正後に再実測してそのまま一致し、書き換えは発生しなかった。

### 4.2 D02: smokeResistanceMultiplier副作用の方向実測

正式Fable Q1/P44の要求(発煙後のR増が熱蓄積を加速・鈍化・ほぼ不変のいずれかをsweep実測で報告)に対し、D02専用M4型sweepと同一構成でsmokingStarted成立直後(実測forkStep=508)の同一状態から、`smokeResistanceMultiplier=1.0`(no-op相当)と`1.2`(採用値)へ分岐させて実測した。

| multiplier | フォーク直後coilLossW平均(最初20step) | 100step後coilLossW平均(80-100step) | burnout到達step | burnout到達秒数 | 同時点(step696)でのratio |
|---|---|---|---|---|---|
| 1.0(no-op) | 10.578 | 9.818(減少傾向) | 未到達(1000step以内) | 未到達 | 0.885(1000step後は0.921) |
| **1.2(採用値)** | 9.728 | 10.690(増加傾向) | **696** | **5.8秒** | 1.0(到達済み) |

観測結果(方向、断定的な物理的説明は付与しない): フォーク直後の瞬間coilLossWはmultiplier=1.2のほうがやや低いが、100step(0.83秒)の推移で見ると増加傾向(1.2)と減少傾向(1.0)に分岐し、この傾向差が持続した結果、採用値(1.2)はno-op(1.0)と比較してburnout到達を大幅に早める(1.0側は1000step経過してもratio=0.921までしか到達しない)。

### 4.3 D05共通較正値(duration/recovery)の証跡

実チャタリングバースト(`nextChatterState`経由、`CHATTER_BURST_FRAMES=24`フレーム=0.2秒)を使った物理harnessで、D05共通5値のうちduration/recoveryの2軸を新規に固定した。バースト中のomega変動を`effectiveInertia`のtest-only拡大(通常のJ_motorオーダーより5桁大きい値)で凍結し、コギング由来の電流振動・整流子不感帯通過による測定汚染を排除している(Q2 sweepのisolatedConfigと同種のtest-only isolation fixture)。

- `brushSparkDurationLimitS=0.15`は単一バースト内(24フレーム)のframe17(18フレーム目=0.15秒、0-indexed)でepisode到達することを実測固定した(バースト終了frame23より前)。
- `brushSparkDurationLimitS=CHATTER_BURST_FRAMES/120`(0.2秒、validatorが許す上限)は単一バーストの最終フレーム(frame23)でちょうど境界到達することを実測固定した。
- `brushSparkDurationLimitS`が0.2秒を超える値(validatorを迂回したtest-only値)は、単一バースト内では構造的に非到達(episodeCount=0のまま)であることを実測固定した。この値域自体の拒否は既存の「72. validateDestructionConfig: d05の新規値域」テストで別途固定済みであり、両者を合わせてvalidator側の拒否とランタイム側の非到達性が整合していることを確認した。
- `recoveryFrames=6`・`recoveryContactResistanceMultiplier=1.2`がno-opでないことを、同一motorState・同一destructionState(recoveryFramesLeftのみ0/6で分岐)からの`composeEffectiveMotorConfig`比較で実測固定した——`brushContactResistanceRatio`はrecovery活性時にbase(1.0)×1.2=1.2へ増加し、`computeElectricalState`で計算した実電流もrecovery活性時のほうが低い(実測: 非活性1.637896A→活性1.605186A)ことを確認した。

### 4.4 Q15-2(接触抵抗両極の観測可能性)実測結果

両極(`brush-copper-plate`: `brushContactResistanceRatio=1.3`〈悪化〉と`brush-precious-metal`: 0.5〈改善〉)を、production-valid motorConfig+motor-only文脈+`loadTorque=0.007Nm`(トルク制限領域)で窓平均定常RPM比較した。

| ブラシ | 窓平均RPM(実測) |
|---|---|
| copper-plate(悪化側) | 354.836 |
| precious-metal(改善側) | 490.930 |

差率38.35%で明確に観測可能(受け入れ閾値5%を大きく上回る)。この構成は既存の較正値を変更せず、そのまま採用(Gate5受け入れ条件充足)。

### 4.5 Q15-3(貴金属高電流ペナルティによる順位逆転)実測結果

正式Fable裁定のGate5受け入れ条件3点をそれぞれ実測した。

1. **NORMAL_OPERATION非到達**: production-valid構成(`energy-run`×`battery-lithium-polymer`、`brush-precious-metal`、既定`brushPressure=0.3`)で自然完走し、`D05.episodeCount=0`・`cumulativeWearDeltaFraction=0`を実測(高電流ペナルティは未発火のまま)。
2. **高負荷での順位逆転**: motor-only高電流構成(`wire-silver`・`magnet-neodymium`・`gear-titanium`・`coilTurns:40`・`magnetDistanceMm:3`・`brushPressure:0.1`・固定`loadTorque=0.02`)で600step実測した累積摩耗は次のとおり、基礎摩耗率の順位(precious 0.7 < carbon 1.0 < copper-plate 1.5)から実効摩耗率の順位(precious 1.75 > copper-plate 1.5 > carbon 1.0)へ逆転することを直接確認した。precious-metalの各D05 event自身のcauseLog(`theoreticalCurrentA`)から、理論電流が実際に3A(highCurrentPenaltyThresholdA)を超えていたことも直接assertした(6件全event中、最大theoreticalCurrentA=40.666317A)。

| ブラシ | 基礎摩耗率(`brushWearRateRatio`) | 高電流ペナルティ適用後の実効値 | 実測累積摩耗(600step) | episode数 |
|---|---|---|---|---|
| carbon(anchor) | 1.0 | 1.0(ペナルティなし) | 0.056354 | 6 |
| copper-plate | 1.5 | 1.5(ペナルティなし) | 0.076636 | 5 |
| precious-metal | 0.7 | 1.75(0.7×2.5) | 0.117902 | 6 |

3. **銅板超えの副次的帰結の明示報告**: 上表のとおり、precious-metal(0.117902)はcopper-plate(0.076636)を上回る——「大電流で急速に荒れる」という素材descriptionどおり、通常時最悪のcopper-plateすら高電流下では上回るという副次的帰結が実測で確認された。ペナルティ較正値(`highCurrentPenaltyThresholdA=3, highCurrentPenaltyMultiplier=2.5`)は変更せず、そのまま採用。

### 4.6 NORMAL_OPERATION 15組合せ実測全文

実在プレイアブル全5コース(`straight-10m`・`hill-climb`・`curve-balance`・`rough-board`・`energy-run`)×全3電池(`battery-alkaline`・`battery-nickel-metal-hydride`・`battery-lithium-polymer`)、production-valid構成(`brush-carbon`固定、既定`brushPressure=0.3`)、DT=1/120s、rng固定(`NO_NOISE_RNG_G5`)で自然走行させた実測値(全15組合せ、いずれも`finalStatus='finished'`、破壊イベントゼロ、D01/D02/D05非進行を確認済み):

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

※`hill-climb`は`hasEnergyBudget=false`のコースであり、maxEnergyUsedRatioの上限assertionはテスト側で対象外(既存契約どおり)。1.0超はこのコース特性上の想定内の値であり、異常ではない。

全15組合せで`D01Progress.triggered===false`・`D02Progress.smokingStarted===false`(maxD02Ratioはいずれも0.6の閾値を大きく下回る0.08〜0.12レンジ)・`D05Progress.episodeCount===0`かつ`cumulativeWearDeltaFraction===0`を直接確認済み。この実測は上記診断コードで一時的に取得し、`grep -c "TEMP_"`で残留ゼロを確認したうえで完全にrevertしている(恒久テストのassertion自体は既存のまま、値の変更なし)。

### 4.7 D01較正確定: 自己制限プラトー実測+受け入れ条件3→3′・条件1→1′改訂(正式Fable補足裁定、2026-08-11)

初版提出後、正式Fable較正レビューがD01(`decayExposureScaleRad`/`minEffectiveTurnsRatio`)へ追加sweep(漸減性・観測可能性・floor到達可能性・NORMAL_OPERATION非トリガの4条件)を指示し、実施した結果、現行値(1000/0.5)が旧条件3(floor到達可能性)を満たさないことが判明した。実測全文・harness再現情報は`docs/phase3-p3-3-d01-supplementary-review-request.md`に記載済みのため、ここでは要旨のみ記す。

**trajectory実測(motor-only free-spin、`varnished:false`、`loadTorque=0`)**:

| coilTurns | magnetDistanceMm | 崩壊トリガ時刻(秒) | decayExposureRadのプラトー値 | プラトー時点のratio | 40秒時点のomega(rad/s) |
|---|---|---|---|---|---|
| **15** | **8**(最良構成) | 4.691666666666666 | 292.6341151356759 | 0.7073658848643241 | 0(完全失速) |
| 15 | 10 | 5.225 | 217.60714924446563 | 0.7823928507555343 | 0(完全失速) |
| 10 | 8 | 8.475 | 77.4163912161609 | 0.922583608783839 | 28.595677602878084 |
| 20 | 10 | 4.583333333333333 | 271.8388621147568 | 0.7281611378852432 | 188.81404799446105 |

**正式Fable補足裁定**(全文`docs/phase3-p3-3-d01-fable-response.md`): 現行値(1000/0.5)を維持したまま確定。誤っていたのは値ではなく受け入れ条件3自体。実測が発見した自己制限フィードバック(劣化→トルク定数低下〈K_E=K_T相反性、P3-3-Q5〉→回転低下→`COIL_DEFORM_OMEGA`割れ→減衰停止)は、実物の巻線崩壊が過回転の遠心応力に駆動される物理と整合する創発挙動として受容(Phase 2の銅線+フェライト過熱レジームに続く本プロジェクト2件目の創発的実測知見)。受け入れ条件を次へ改訂:

- **条件3′(プラトーの実測固定)**: 最良構成のプラトーratio 0.7074が観測可能な劣化(条件2実測でratio=0.75時に定常RPM 30.4〜100%低下、目安3%を大幅超過)を与えること。充足済み。
- **条件1′(漸減性の直接形)**: 崩壊トリガ後1秒時点でratio≥0.8。最良構成での実測値0.8914により充足済み。

`minEffectiveTurnsRatio=0.5`の役割は「ゲームプレイ上の到達目標」から「数値安全域のclamp」へ再定性された(値の物理的根拠は不変)。floorが実際のゲームプレイに現れうる唯一の経路(急降坂での外部機械駆動による過回転維持)は現行5コースに存在しないためvehicle/track追加sweepは不要と裁定され、Phase 5コース設計への申し送り事項として記録された(`docs/phase3-plan-v12-amendments.md`「P3-3-D01較正確定」参照)。

**Gate6解禁条件3点(全充足)**: (1) 自己制限プラトーの数値回帰テスト1本(最良構成でプラトーratio≈0.7074固定・プラトー後`decayExposureRad`不増加の直接assert・条件1′を単一走行経路で固定、`materialMapping.test.ts`「D01自己制限プラトー」)。**実装済み**。(2) docs反映(`docs/phase3-p3-3-plan.md` 13.1.3節D01行更新+本節+`docs/phase3-plan-v12-amendments.md`エントリ新設)。**完了**。(3) Suu_mot3照合。**2026-08-11通過(P59是正4点の独立再検証込み)——Gate6(store fixture統合)は正式に解禁された。**

---

## 5. 検証結果・変更ファイル一覧

```
$ npx tsc -b
→ エラーなし(exit 0)

$ npm run test -- --run
→ Test Files 69 passed (69) / Tests 1406 passed (1406)

$ npm run build
→ ✓ built、dist/assets/index-*.js 790.97 kB / gzip 221.23 kB

$ npm run lint
→ エラーなし(exit 0、oxlint)

$ npx tsc -p tsconfig.material-sweep.json
→ エラーなし(exit 0)

$ cmp AGENTS.md CLAUDE.md
→ 差分なし(identical)

$ git diff --check
→ exit 0

$ git diff --stat -- src/engine/vehiclePhysics.ts src/engine/trackPhysics.ts src/store/gameStore.ts
→ 出力なし(無変更、凍結ファイルへの影響なし)

$ grep -c "TEMP_" src/materials/__tests__/materialMapping.test.ts
→ 0(診断コードの残留なし)
```

**変更ファイル一覧(`git diff --stat -- src scripts`)**:

```
 scripts/materialSweep.ts                           |  17 +-
 src/components/ExperimentNotebook.tsx              |   3 +
 src/engine/__tests__/destructionModes.test.ts      | 435 ++++++++++-
 src/engine/__tests__/destructionOrchestration.test.ts | 582 ++++++++++++++-
 src/engine/__tests__/recipeCode.test.ts            |  66 +-
 src/engine/destructionModes.ts                     | 271 ++++++-
 src/engine/destructionOrchestration.ts             | 265 ++++++-
 src/engine/motorPhysics.ts                         |  62 +-
 src/engine/recipeCode.ts                           |  34 +-
 src/materials/__tests__/materialMapping.test.ts    | 793 ++++++++++++++++++++-
 src/materials/materialMapping.ts                   | 134 +++-
 src/store/__tests__/runOutcomeApplication.test.ts  |  26 +-
 src/store/__tests__/saveStore.test.ts              |  13 +-
 13 files changed, 2616 insertions(+), 85 deletions(-)
```

各ファイルの変更内容の詳細は`docs/phase3-p3-3-plan.md` §14.1(変更対象ファイル一覧)・§14.2(依存閉包実測)を参照。`src/engine/vehiclePhysics.ts`・`src/engine/trackPhysics.ts`(車体・コース物理、凍結)・`src/store/gameStore.ts`(P3-4スコープ)はいずれも無変更。

---

## 6. Fableへ求める判定(D02・D05共通・ブラシ8値は2026-08-10、D01は2026-08-11、全項目回答済み)

**本節は初版提出時の判定依頼を原文のまま保持する(履歴記録)。すべて正式Fable較正レビュー+正式Fable補足裁定(D01)により回答済み——D02・D05共通・ブラシ8値は6.1記載のとおり採用確定(付帯条件3点は§4.1〜§4.5・§3の該当行に反映済み)。D01は「値ではなく受け入れ条件3が誤りだった」と裁定され、条件3→3′・条件1→1′への改訂を経て現行値のまま確定した(§4.7参照)。6.2(実測範囲の十分性)は「D01追加sweep+付帯条件3件を除き十分」と回答され、その追加sweepも完了した。6.3(Gate6解禁)は「D01追加sweep充足+付帯条件3件反映+Suu_mot3照合」を条件に解禁と回答され、前2条件は充足済み・Suu_mot3照合が最後の関門である。**

正式Fable較正レビューにおいて、以下を判定対象として提出した(原文)。

### 6.1 各候補値の採否

- **D01**(2値: `decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`): 構造的性質(単調性・停止時ゼロ・clamp)は実測確認済みだが、値そのものの大きさを支持する実測・sweepは存在しない。**この2値をfixture候補のまま採用してよいか、それとも追加のsweep(例えば「何radの曝露でどの程度の劣化が現実的か」の物理的参照)を要求するか、判定を求める。**
- **D02**(2値: `conductionScale=0.04`・`dissipationCoefficient=0.5`): 3×3 grid実測により、NORMAL_OPERATION非到達(閾値まで74%の余裕)かつ高負荷到達可能という受け入れ領域の内部に位置することを確認した。**この採用値の妥当性、および受け入れ領域内での位置取り(74%の余裕という水準が十分か)について判定を求める。**
- **D02: `smokeResistanceMultiplier=1.2`**(既存値、方向のみ新規実測): no-op(1.0)比でburnout到達を加速する方向を確認した。**この方向・大きさが意図した設計と整合するか判定を求める。**
- **D05共通**(5値): duration/recoveryの2軸は実チャタリングバースト経由で直接固定した。`brushSparkCurrentThresholdA`・`wearPerAmpSecond`は間接証跡のみ。**直接証跡が薄い2値について追加sweepの要否を判定されたい。**
- **ブラシ8値**: Q15-2/Q15-3裁定済みの暫定候補値。うち`brush-silver-graphite`のcontact値と`brush-precious-metal`のchatter値は個別sweep未実施(裁定時の一括承認のみ)。**この2値について、個別sweepなしでの確定を許容するか、追加sweepを要求するか判定を求める。**

### 6.2 Gate6解禁可否

Gate6(store fixture統合、3文脈)は、上記較正候補値の採否判定を待たずに着手してよいか、それとも全候補値の確定(Fable最終レビュー+人間commit承認)を前提とすべきか、判定を求める。

### 6.3 追加sweep要否

上記6.1で個別に触れた項目に加え、全体として本報告の実測範囲(D02 grid 3×3、smokeResistanceMultiplier 2点分岐、D05 duration/recovery境界、Q15-2/Q15-3、NORMAL_OPERATION 15組合せ)が、checkpoint5「較正sweep」の完了証跡として十分か、不足があれば追加sweep項目を明示されたい。

---

**手続きに関する注記**: 本書はalice_mot3が作成したdocs-only文書であり、正式Fableレビューの回答そのものではない。pitfalls#1(Fable回答の真正性)により、正式なFable回答は人間プロジェクトリードの直接提示、またはSuu_mot3が中継したもののみを正式回答として扱う。alice_mot3はいかなる場合もFable名義の文書を自己生成しない。
