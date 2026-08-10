# P3-3詳細実装計画: D02(コイル焼損)+D05(ブラシ異常スパーク)+D01漸減返済(P3-1-Q1)+ブラシ素材写像

作成: alice_mot3(2026-08-09初版、2026-08-11 v17改訂)。本書は`docs/phase3-plan-v12.md` §12「P3-3: D02(コイル焼損)+D05(ブラシ火花)」を実装可能な水準まで詳細化した自己完結計画である。**本書はv17であり、v16まででcheckpoint5(較正sweep)較正候補値の全てがFable裁定を経て確定し(D02・D05共通・ブラシ8値は2026-08-10、D01は2026-08-11)、v17でGate6(store fixture統合)がSuu_mot3独立レビュー5ラウンド(P60〜P64是正、詳細は13.2.1節)を経て2026-08-11に正式通過し、ゲート0〜7完了・Suu最終照合待ち(正式Fable最終レビュー前)の状態にある。本書のみを読めば実装内容・契約・DoDを検証できることを目標とし、「変更なし」「継続」等の省略記述を用いない。** P3-2と同型の運用(計画→Suu_mot3照合→正式Fableレビュー→必要な人間再承認→実装)に従う。v13〜v15の経緯(D02較正候補→実測→採否、Q15-2/Q15-3実測、P56指摘5点の追補、P57是正2点)を経て、正式Fable較正レビュー(2026-08-10)がD02(`conductionScale`/`dissipationCoefficient`/`smokeResistanceMultiplier`)・D05共通5値・ブラシ8値を採用確定し、付帯条件3点(Q15-3摩耗3値の数値回帰固定・接触抵抗4素材順位の具体値固定・貴金属`brushChatterProbabilityRatio=0.7`の効果単離実証)を指示した。付帯条件のうち2点は既存テストで充足済みと確認し、1点(効果単離実証)を新規実装した(Suu_mot3照合P58で当初の付帯条件2確認漏れを指摘され是正)。D01のみ、Fable自身が課した受け入れ条件3(floor到達可能性)を現行値(`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`)が満たさないことが実測で判明し、値を変更せず補足レビューを依頼(`docs/phase3-p3-3-d01-supplementary-review-request.md`)した結果、**正式Fable補足裁定が現行値を維持したまま確定し、誤っていたのは値ではなく受け入れ条件3自体だったと裁定した**——実測で発見された自己制限フィードバック(劣化→トルク定数低下→回転低下→減衰停止)を、Phase 2の銅線+フェライト過熱レジームに続く本プロジェクト2件目の創発的実測知見として受容し、条件3→3′・条件1→1′へ改訂した(詳細は13.1.3節「D01較正証跡」、`docs/phase3-plan-v12-amendments.md`「P3-3-D01較正確定」を参照)。Gate6解禁条件(D01自己制限プラトー回帰テスト・docs反映・Suu_mot3照合)のうちテストとdocs反映を本v16で完了した(新規物理契約ではなく較正sweepの実測記録の確定反映、Fable再提出・人間再承認は不要)。

**v1→v17の位置づけ(自己完結要約)**: v1(初版)はSuu_mot3レビューで要修正14点(P1〜P14、実コードとの整合性不足・複数設計の内部矛盾)を受け、v2で全面改訂した。v2はさらに要修正12点(P15〜P26、事実誤認・暗黙の設計欠落・前ラウンドで誤って削除した論点の再発・自己編集による参照切れ)を受け、v3で改訂した。v3はさらに要修正11点(P27〜P37、本書の版数自己記述の不整合・ゲート依存順の破綻・型契約の内部矛盾・validator自己完結性の不足・単一出典原則との整合不足)を受け、v4で改訂した。v4はさらに要修正8点(P38〜P45、自己同一性の算術誤り・節順・候補別契約の不一致・ゲート単独build不能・物理主張の過大な断定)を受け、v5で改訂した。v5はさらに要追補2点(P46〜P47、既存型破壊的変更のpitfalls#2依存閉包欠落・UI入力経路の未確定)を受け、v6で改訂した。v6はSuu_mot3最終照合を通過し(5ラウンド累計47件、14+12+11+8+2)、Suu_mot3が作成した`docs/phase3-p3-3-fable-review-request.md`により正式Fable技術レビューへ提出された。正式Fableレビューは条件付き承認(実装開始を妨げる必須修正なし、Q1〜Q14の裁定反映+付帯条件7点+人間再承認バンドル13件の承認をもって実装解禁)であり、v7でこの裁定内容をすべて反映した。v7+台帳+再承認バンドルの実質内容照合(Suu_mot3)では裁定内容は正式Fable原文と一致していたが、未裁定版当時の未来形・条件形の言い回しが確定済み節に残っていたため、最終文言収束7点を反映したのがv8である。人間再承認バンドル承認後、ゲート0・ゲート1・ゲート2(materialMapping.tsのブラシ写像)を実装したが、ゲート2完了報告に対するSuu_mot3照合で契約違反3点(P48〜P50)が指摘され、docs-only追補(v9、新設15.5節「P3-3-Q15」)+独立Fable補足レビュー依頼書を提出した。正式Fable補足裁定(2026-08-10)がQ15-1〜Q15-7としてP48(案a確定+恒久再発防止規則新設)・P49(案i確定、6.3節の銀黒鉛表精密化)の裁定と、P48由来の副次論点(不活性ペナルティ表現)についてQ15-4(判別union化確定、人間再承認対象)を下し、これを実装(ゲート1・ゲート2の該当8ファイル)+docs反映したのがv10である。**Q15-4の人間再承認確定後、ゲート3(`advanceD02`/`advanceD05`状態機械+`deriveDegradationDiffs`拡張)を実装したところ、既存`Q13-2 NORMAL_OPERATION`15組合せ表のうち9組合せがD02の未較正値により失敗するようになった——これはゲート3〜5の依存関係(D02較正は物理効果ゲート4・較正sweepゲート5を経て初めて意味を持つ)を計画のゲート分割自体が見落としていたために生じた契約間の矛盾であり、`advanceD02`の実装ミスではない。Suu_mot3裁定により、契約・物理式・較正条件・最終DoDを一切変えずゲート3〜5を単一の「統合較正閉包」として再編する13.1節(P54是正)を新設したのがv11である。**checkpoint4(composeEffectiveMotorConfigのD01/D02/D05分岐+motorPhysics.ts式改修)を実装したところ、全suite失敗が9件→19件へ拡大した(Q13-2表が9/15→15/15組合せへ、加えてM4条件1・M4条件2・D07通常回帰・Q2独立sweepの4件が新規に破綻)。Suu_mot3独立診断(P55)の結果、19件はいずれもcomposeEffectiveMotorConfig自体の実装誤りではなく、未較正D02が統合wrapper内で発煙latchへ到達しR_coil変化がM4/D07/Q2 sweepへ連成する同一の根因閉包に属すると判定され、許容する赤を「正確な19テスト」として列挙する13.1.1節+即時停止条件+checkpoint4完了報告の追加要件(診断表)、checkpoint5の回収条件を明記する13.1.2節を新設したのがv12である(新規物理契約ではなく実行順の精密化、Fable再提出・人間再承認は不要)。**checkpoint4完了報告(19件が計画どおりの正確な列挙と一致、それ以外の失敗・性質変化なし)がSuu_mot3照合を通過した後、checkpoint5(較正sweep)へ着手した。D02の`conductionScale`/`dissipationCoefficient`が未較正のGate1時代の仮値(等価ゲインk=1.0)のまま残っていたことが19件すべての根因であると実測で確認し、NORMAL_OPERATION実測coilLossW(3.0〜3.7W)から`smokeGaugeThreshold`(0.6)を十分下回る新較正値(k=0.08)を導出して5箇所の共有config literalへ適用したところ、既存の期待値(`finalStep:3848`・`swellingAtStep:897`・`maxGauge:0.3271`等)を一切書き換えることなく19件すべてが回帰した。あわせてQ15-2(接触抵抗両極の定常RPM観測可能性)・Q15-3(貴金属高電流ペナルティによる順位逆転、NORMAL_OPERATION非到達を含む3条件)の新規sweepテストを実装し、69ファイル全緑・build・lintの全成功を確認したのがv13である(新規物理契約ではなく較正sweepの実測記録、Fable再提出・人間再承認は不要)。**v13提出後、Suu_mot3照合(P56)により、checkpoint5を「較正sweep完了」と扱うには証跡が不足している5点(全較正値の確定申請表の欠落・D02が2点比較のみでgrid実測でない・smokeResistanceMultiplier副作用の方向未報告・D05共通較正値の機械固定テスト不足・D01較正証跡の未整理)を指摘された。production/testの既存受け入れ条件・旧回帰値を一切変更せず、D02 grid実測(3×3、両軸独立較正の実証)・smokeResistanceMultiplier=1.0対1.2の方向実測(burnout到達の加速を確認)・D05共通のduration/recovery証跡を実チャタリングバースト経由で機械固定する新規テスト4件・Q15-3統合テストへのtheoreticalCurrentA>3A直接assertion追加・D01較正証跡(値そのものは実測未支持でありfixture候補と正直に記録)を反映し、13.1.3節を拡充したのがv14である(新規物理契約ではなく較正sweepの実測記録の拡充、Fable再提出・人間再承認は不要)。**v14提出後、Suu_mot3再照合(P57)により、13.1.3節の記述がP56原指示と2点不一致(全較正値の確定申請表でブラシ素材の暫定候補値8個を「ratio類6個・高電流ペナルティ2個」という1行へ集約してしまい、Suu指定の個別8値〈copper-plate/silver-graphite/precious-metal各contact値・precious-metal chatter値・copper-plate/precious-metal各wear値・precious-metal高電流閾値/倍率〉を列挙していなかったこと、smokeResistanceMultiplier実測段落の観測結果に「電流低下の効果が瞬時にはI²R増加を上回るため」という因果説明が混入し、同じ文冒頭の「断定的な物理的説明は付与しない」という宣言と自己矛盾していたこと)を指摘された。productionコード・テストコードは無変更のまま、ブラシ8値をそれぞれ個別行(出典・受け入れ証跡・現時点の効力つき)へ展開し、smokeResistanceMultiplier段落から因果説明の括弧書きを削除して観測値のみの記述へ戻したのがv15である(docs-onlyの是正、実測値・数値回帰・assertion内容はいずれも無変更)。**v15提出後、正式Fable較正レビュー(2026-08-10)が届き、D02(`conductionScale`/`dissipationCoefficient`/`smokeResistanceMultiplier`)・D05共通5値・ブラシ8値を採用確定し、付帯条件3点を指示した。Suu_mot3独立照合(P58)で付帯条件2(接触抵抗4素材順位)が単調減少のみで具体値`[1.3,1,0.7,0.5]`を固定していなかったと指摘され、数値回帰assertionを追加して是正した。付帯条件3(貴金属`brushChatterProbabilityRatio=0.7`の効果単離実証)は新規テストとして実装し、短周期rng配列が`step()`内の軸ずれ振動ノイズのrng消費と「共振」する問題を発見して周期性のない決定論的PRNGへ切り替えた。D01については、Fable指示の4条件sweepで現行値(`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`)が受け入れ条件3(floor到達可能性)を満たさないことが判明し、値を変更せず`docs/phase3-p3-3-d01-supplementary-review-request.md`で補足レビューを依頼した。正式Fable補足裁定は現行値を維持したまま確定し、誤っていたのは値ではなく受け入れ条件3自体だったと裁定——実測で発見された自己制限フィードバック(劣化→トルク定数低下→回転低下→減衰停止)をPhase 2の銅線+フェライト過熱レジームに続く本プロジェクト2件目の創発的実測知見として受容し、条件3→3′・条件1→1′へ改訂した。Gate6解禁条件(自己制限プラトー回帰テスト・docs反映・Suu_mot3照合)のうちテスト実装とdocs反映(13.1.3節D01行の確定反映、`docs/phase3-plan-v12-amendments.md`「P3-3-D01較正確定」エントリ新設)を行ったのがv16である(新規物理契約ではなく較正sweepの実測記録の確定反映、Fable再提出・人間再承認は不要)。**v16提出後、Suu_mot3独立照合(P59)が精度是正4点(D01回帰テストの二重出典・「全21値」算術誤り・Gate6解禁条件の先取り記述・D01裁定日付の誤り)を指摘し、docs-onlyで是正した。Suu_mot3が独立再検証のうえGate6解禁条件3点の全充足を確認し、Gate6(store fixture統合)へ着手した。実装後、Suu_mot3独立レビュー5ラウンド(P60〜P64是正、13.2.1節に詳細記録)を経て2026-08-11にGate6が正式通過したのがv17である(新規productionコードなし、値の変更なし、Fable追加裁定不要とSuu_mot3が判断)。** 差分の詳細は17節(改訂履歴)を参照。

---

## 0. 参照実査結果

### 0.1 読んだdocs

`docs/spec.md`(r3、§2・§4.1・§4.2・§7.1・§7.1.1・§7.2・§7.3・§7.4・§12・§14)、`docs/art-spec.md`(§5.2・§5.3・§6・§7・§8)、`docs/phase3-plan-v12.md`(全節、特に§3.2・§3.3・§3.4・§6・§12・§13・A1〈701行目〉)、`docs/phase3-plan-v12-amendments.md`(P3-1-Q1エントリ・P3-2-Q12エントリ)、`docs/phase3-p3-1-plan.md`(§3.1 P3-1-Q1裁定〈644行目〉・§6 A1結論〈701行目〉・`DURATION_COMPARISON_EPSILON_S`申し送り)、`docs/phase3-p3-2-plan.md`(v18、§10.7後続申し送り・§14 Q13-1〜Q14裁定・§6 D07個別設計)。

### 0.2 読んだ実コード(ファイル・関数・行番号を明記、v2で追加実査した箇所を含む)

- `src/engine/destructionModes.ts`: `DestructionFrameInput`(211〜221行目)、`D01Progress`(114〜118行目)、`D02Progress`/`D02CauseLog`(120〜125行目・233〜235行目)、`D05Progress`(149〜156行目)、`DestructionConfig.d02`/`d05`(79〜103行目)、`advanceD07`(459〜495行目、`frame.currentA`を使う既存の熱ゲージ積分式)、`DURATION_COMPARISON_EPSILON_S`(312行目)。
- `src/engine/destructionOrchestration.ts`: `buildMotorOnlyFrameInput`/`buildVehicleFrameInput`(924〜965行目)、`composeEffectiveMotorConfig`(1021〜1056行目)、`classifyTerminalModes`(901〜911行目)、`validateD01ProgressShape`/`validateD05ProgressShape`(594行目・633行目)、`DestructionConfigDraft`の`d02?`/`d05?`(205〜207行目)とvalidator(299〜322行目・735〜746行目)。
- `src/engine/motorPhysics.ts`(**v2で追加実査**): `nextChatterState`(201〜218行目)、`evaluateMotorFrame`のチャタリング適用(409〜429行目)、`updateRpm`(225〜228行目、`RPM_SMOOTHING_ALPHA`による指数移動平均——**表示用平滑化rpmであり瞬時角速度ではない**ことを確認)、`nextBatteryHeat`(252〜264行目)、`computeContactResistance`(120〜125行目)、`computeMagneticTorque`(312〜316行目、`K_T × B × current × config.coilTurns × sinTheta × commutationSign`——**`coilTurns`がトルク定数の一部として直接使われている**ことを確認)、`computeElectricalState`内の`backEmf`計算(301行目、`K_E × B × config.coilTurns × omega × sinTheta × s`——同じく`coilTurns`が逆起電力に直接効く)、`computeRCoil`/`computeJ`(169〜182行目、いずれも既にexport済み)、`MotorConfig`(38〜75行目)。
- `src/engine/vehiclePhysics.ts`(**v2で追加実査**): `coilCollapsePenaltyMm`(88行目・110行目・360行目・576行目・680行目、`justCollapsed`の瞬間に`COIL_DEFORM_PENALTY_MM`を一回加算する既存の恒久ペナルティ)、`effectiveAxisOffsetMm`(389〜390行目、`motorConfig.axisOffsetMm + state.coilCollapsePenaltyMm`という既存の合成式)。
- `src/materials/materials.ts`: `BrushMaterial`(179〜182行目)、`BRUSH_MATERIALS`(620〜658行目)。
- `src/materials/inventoryItem.ts`・`degradationApplication.ts`: `WearState`の`kind:'brush'`(41行目)、`applyBrushDiff`(29〜31行目)。
- `src/engine/recipeCode.ts`(**v2で追加実査、v3で事実誤認および関数名・行番号を再訂正——P15**): 35〜39行目のキー対応表コメント・57〜59行目(`RECIPE_M_FIELD_KEYS`権威的キー配列)・63〜72行目(`RecipePayloadV2`/`V3`の`m`型定義)・186〜212行目(実名`normalizeMotorFields`、v2は`normalizeMotorFieldsFromRecord`と誤記していた——`wr`/`wz`/`br`/`bc`を`numAt(..., fallback:1)`でデコード)・237〜253行目(`motorConfigToFields`、エンコード時に`wr`/`wz`/`br`/`bc`を出力)・296〜311行目(`encodeRecipe`内`RecipePayloadV3`組み立てリテラル、`motorConfigToFields`とは別の独立したリテラルサイト)を確認した結果、**`wireResistivityRatio`・`wireDensityRatio`・`batteryInternalResistanceRatio`・`batteryCapacityRatio`(Phase2 Step6で追加済み)は実際にはMC3ペイロードへ`wr`/`wz`/`br`/`bc`として明示的にエンコード・デコードされている**。v2の「recipeCodeのエンコード対象に含まれていない」という記載は事実誤認だった(訂正済み、6.4節・14.2節)。

### 0.3 発見した事実(v1から維持、実コードに基づく)

1. D02専用の熱ゲージ入力が存在しない(3.1節で設計)。
2. D05のチャタリング境界信号に取りこぼしがある(4.2節で状態遷移表と是正案)。
3. ブラシ素材が無次元の写像先を持たない(6節)。
4. D01漸減物理が未実装(5節、P3-1-Q1返済)。
5. `composeEffectiveMotorConfig`はD01/D02分岐を追加できる形で既に存在する(P3-2 Gate4導入済み)。
6. `computeRCoil`/`computeElectricalState`は既にexport済み。

### 0.4 v2で新たに発見した事実(Suu_mot3レビューを機に再実査して判明)

7. **`deriveDegradationDiffs(events, finalDestructionState)`はMotorConfig/DestructionConfigを一切受け取らない**(既存公開シグネチャ、destructionOrchestration.ts)。ブラシ摩耗率のような素材由来係数をこの関数の内部で読むことは構造的に不可能。
8. **チャタリング中は`current`が完全に0へ強制される**(motorPhysics.ts 415行目、`if (chatterState.chattering) { current = 0; }`)。この同一stepで接触抵抗倍率を上げても`current`/`tMag`には何の影響も及ぼさない(0×倍率=0のまま)。
9. **`coilTurns`はR_coil(抵抗)・J(慣性)・トルク定数・逆起電力の4箇所すべてに使われる単一の入力である**(169〜182行目・301行目・312〜316行目)。これを直接減らすと4箇所が同時に変化し、「巻き崩れで電気的結合だけが弱まる」という意図と乖離する。
10. **`DestructionFrameInput.rpm`は表示用の指数移動平均済み値**(`updateRpm`、`RPM_SMOOTHING_ALPHA`)であり、`COIL_DEFORM_OMEGA`(瞬時角速度rad/s、崩壊トリガの閾値)と単位・時定数の両方が異なるため直接比較できない。
11. **既存`coilCollapsePenaltyMm`は崩壊瞬間の一回加算のみ**(vehiclePhysics.ts 576行目、`justCollapsed`のときだけ加算)であり、D01の継続的な漸減が同じ`axisOffsetMm`経路へ効果を追加する場合、二重計上を避ける明示的な合成規則が必要。
12. **`CHATTER_BURST_FRAMES=24`(=0.2秒@120fps)が単一バーストの最大長**(constants.ts 42行目)。D05のepisode duration判定を「非アクティブになったら即座にリセット」で設計する場合(4.1節)、`brushSparkDurationLimitS`はこの0.2秒以下でなければepisode自体が構造的に到達不能になる。

### 0.5 v3で訂正・追加実査した事実(Suu_mot3のv2差分照合を機に再実査して判明)

13. **`wireResistivityRatio`等はrecipeCode.tsへ実際にエンコードされている**(P15、上記0.2節で訂正)。ブラシ由来のMotorConfig層フィールド(6.2節)を追加する場合、recipeCode.tsへの対応する追従が必要になる。
14. **`MaterialSelection.batteryId`は必須フィールドとして既に存在する**(materialMapping.ts 289行目、`BatteryMaterialId`型、オプショナルではない)。これが「素材選択項目を`MaterialSelection`へ追加する際の型契約は必須フィールドにする」という既存前例である。
15. **`validateMotorConfigShape`(destructionOrchestration.ts 467〜479行目)は`optionalNumberFields`という明示的な配列で既知のオプショナル数値フィールドを列挙している**(現在`wireGaugeMm`・`wireResistivityRatio`・`wireDensityRatio`・`batteryInternalResistanceRatio`・`batteryCapacityRatio`の5つ)。この配列に列挙されていないフィールドは、restore時に**型・値域チェックを一切受けずに素通りする**(未知キーを拒否する仕組みがないため)。新規オプショナルフィールドを追加する場合、この配列への追加を怠ると、そのフィールドは「型はあるが実行時に検証されない」という新たな穴になる。
16. **D05のepisode成立stepは定義上チャタリング中(`isSparkActive`の一部が`isChatteringThisFrame`)であり、その瞬間の`frame.currentA`(実電流)は常に0である**(motorPhysics.ts 415行目の`current=0`強制)。`D05CauseLog`が`CauseLogCommon.currentA`を継承する既存設計のまま`frame.currentA`を書き込むと、検死ログが「0A」という誤解を招く値を記録してしまう。

---

## 1. スコープ確定

### 1.1 対象

- D02: 発煙進行→発火終端(コイル焼損)。発煙段階のR_coil実効config合成、発火時のみのevent発行・図鑑登録・rotor burnout差分。
- D05: 異常スパークepisode(反復event、`isFirstThisSession`分離)、`theoreticalCurrentA`基準の超過積分、接触抵抗の一時悪化、ブラシ摩耗の恒久差分。
- **P3-1-Q1返済**: D01の実効巻数・占積漸減を`composeEffectiveMotorConfig`のD01分岐として実装。
- **Phase 2繰越**: ブラシ素材(銅板/カーボン/銀黒鉛/貴金属)の写像層接続。

### 1.2 非対象(明示)

- production向け`DestructionConfig`のgameStore.ts実配線・人間試遊は、P3-0-Q2裁定どおりP3-4まで行わない。**P3-0-Q2が延期するのは「gameStore.tsからの実配線・実プレイでの発動」であり、`composeConfigFromMaterials`のような既存の素材写像純関数の拡張(6.4節)はこれに該当しない**(P3-1・P3-2でも同様の純関数拡張はfixture/sweepの中で行われてきた既存の扱いであり、P3-3で新たに延期対象を広げるものではない)。
- D06(ギヤ歯欠け)・D09(軸受焼付き)はP3-4のスコープ(spec §12)。
- D08・D10はP3-3のengine型に一切含めない。
- r3のP4-0/P4-1改定(二段リザルト・記録更新ジングル・愛称・工房の蓄積等)はPhase3凍結契約を変えるものではなく、P3-3へ遡及適用しない。
- 給電停止オーバーライド機構は導入しない(A1結論、1.3節)。

### 1.3 A1再監査結果の継承

`docs/phase3-p3-1-plan.md` §6のA1結論(`termination`確定→呼び出し側停止、という規約のみでD03/D04/D02の物理進行停止を実現する。`MotorConfig`・`stepTestRun`への新規フィールド・引数を追加しない)をD02発火にもそのまま適用する。D02発煙中のR_coil合成(3.1節)は走行継続中の実効値変更であり、発火後の停止とは別物。

---

## 2. 現行型の表現力の敵対的監査

| # | 対象 | 現状 | 不足 | 対応節 |
|---|---|---|---|---|
| 1 | `D02Progress.coilHeatGaugeRatio` | 型フィールドのみ | コイル熱入力 | 3.1 |
| 2 | `D01Progress` | 進行度フィールドなし | 漸減進行度 | 5.2〜5.3 |
| 3 | `DestructionFrameInput` | コイル熱・回転曝露・チャタリング事実が含まれない | 3.1・4.2・5.4 | — |
| 4 | `buildXxxFrameInput`の`chatterFramesLeft` | `next`のみ渡す | `prev`との比較 | 4.2 |
| 5 | `MotorConfig` | ブラシ素材フィールドなし、`coilTurns`が電気的結合と質量/線材量を同時支配 | 分離した新フィールド | 5.3・6.2 |
| 6 | `BrushMaterial` | 定性descriptionのみ | 数値物性 | 6 |
| 7 | `deriveDegradationDiffs` | MotorConfig/DestructionConfig非受領 | 素材由来係数はadvance側で先に畳み込む | 4.3 |

---

## 3. D02個別設計

### 3.1 コイル熱ゲージの駆動式(P10是正、正式Fable裁定確定P3-3-Q1)

**v1の問題(P10指摘)**: 候補(a)(`frame.currentA² × 単一lumped係数`)は、素材由来の`R_coil`(`wireResistivityRatio`等で変わる)にもD02自身の発煙によるR増フィードバック(3.2節)にも連動しない。これはコイル銅損I²Rとして物理的に不正確であり、D07の磁石熱ゲージ(素材の熱伝導係数自体を較正対象にしているだけで、電気抵抗のフィードバックループは持たない)とは事情が異なる。

**確定候補(旧候補(b)、物理優先案へ格上げ)**: `buildMotorOnlyFrameInput`/`buildVehicleFrameInput`内(destructionOrchestration.ts、`motorPhysics.ts`は無改修)で、既にexport済みの`computeRCoil(effectiveConfig)`と`frame.currentA`相当の値を使い、コイル損失電力を計算して`DestructionFrameInput`へ新規フィールドとして渡す:

```ts
// buildXxxFrameInput内(configは呼び出し元がcomposeEffectiveMotorConfigで得た実効config)
const coilLossW = next.current * next.current * computeRCoil(config); // 実電流(理論値ではない、D07と同じ選択)
```

`DestructionFrameInput`へ`coilLossW: number`を追加する。`advanceD02`の熱ゲージ式:

```
nextCoilHeatGaugeRatio = clamp01(
  prev.coilHeatGaugeRatio + (frame.coilLossW × config.d02.conductionScale − prev.coilHeatGaugeRatio × config.d02.dissipationCoefficient) × dt
)
```

較正自由度は候補(a)と同じく実質2つ(`conductionScale`・`dissipationCoefficient`)——`computeRCoil`が既に素材差・巻数差を織り込むため、`conductionScale`はW→無次元ゲージの単位変換兼較正係数として働く。**これによりD02の熱蓄積は、素材由来R_coilにもD02自身の発煙R増フィードバックにも自動的に連動する**(発煙が進む→`wireResistivityRatio`悪化〈3.2節〉→次stepの`computeRCoil`が増加→`coilLossW`は`current`と`computeRCoil`の両方を毎step再計算した結果として決まる)。

**「熱蓄積が加速する正のフィードバック」という断定の撤回(P44是正)**: v4は「R_coil増→coilLossW増→熱蓄積加速」という正のフィードバックを物理的に保証されるものとして断定していたが、これは固定電圧系では一般に成立しない——`R_coil`が増えると回路の他抵抗(内部抵抗等)との関係で実電流`current`は低下する方向に働くため、`coilLossW = current² × computeRCoil(config)`は`R_coil`増と`current`減という2つの反対方向の効果の積であり、正味で増加するか減少するかは回路条件(内部抵抗・逆起電力・負荷等)に依存する、経験的に決まる量である。**正しい主張**: `coilLossW`は`config`(R_coil悪化を織り込んだ実効config)から得た実`R_coil`と、その`config`のもとで実際に流れた実電流`current`の両方を**毎step独立に再計算し**、その積として一貫した(捏造のない)I²R値を熱ゲージへ結合するというだけであり、「加速する」という結果を断定しない。**sweepでの実測条件へ置き換え**: `smokeResistanceMultiplier`(11.1節)の副作用(発煙後に熱蓄積が実際に加速するか、鈍化するか、ほぼ変化しないか)は、production-valid構成のsweepで実測し報告する対象とする(3.4節のM4型sweep受け入れ条件と合わせて実測する)。この副作用の方向性が「症状は隠さないが原因は特定させる」という難易度哲学(CLAUDE.md)に反しないかは、sweep実測後にFableへ報告する。

**正式Fable裁定(確定P3-3-Q1)**: 確定候補(`computeRCoil`ベースの`coilLossW`)を承認する。I²R銅損は正しい物理であり、実効config(発煙悪化込みのR)とその下で実際に流れた実電流の毎step独立再計算という設計は捏造のない結合である。チャタリング中は`current=0`によりコイルが冷える帰結も物理的に正しい。**P44是正(正帰還断定の撤回)を特に評価する**——固定電圧系では`dP_coil/dR_coil`の符号は`R_coil`と残余抵抗の大小関係で反転する(`R_coil < R_rest`でのみ増加する)。方向をsweep実測で報告する扱いが正しい。

**発煙抵抗倍率の具体形(P10指摘、正式Fable裁定確定P3-3-Q2)**: 3.2節の`smokeMultiplier`について、(a)発煙開始(しきい値到達)以後は単一の固定値、(b)`coilHeatGaugeRatio`の発煙開始後の進行比率に線形比例、の2案を提示する。**正式Fable裁定(確定)**: 単一固定値(候補a)を裁定する。段階内比例則は較正根拠のない連続法則の発明であり、P3-2-Q1(swelling/smoking無区別)と同じ規律。`>=1`制約込みで承認。`DestructionConfig.d02`へ`smokeResistanceMultiplier: number`(制約`>=1`、11節)を追加する。

### 3.2 発煙段階のR_coil重ね掛け(合成直交性)

`composeEffectiveMotorConfig`(既存)へD02分岐を追加する。D04・D07と同型で、`wireResistivityRatio`(素材由来base値)へ乗算する。**判定条件は3.5節の可逆性裁定で確定する`smokingStarted`相当のlatch状態を使う(生の`coilHeatGaugeRatio >= smokeGaugeThreshold`を毎frame再判定しない、3.5節参照)**:

```ts
if (<3.5節で確定するlatch条件>) {
  effective = { ...effective, wireResistivityRatio: (baseMotorConfig.wireResistivityRatio ?? 1) * destructionConfig.d02.smokeResistanceMultiplier };
}
```

**合成直交性テスト(必須DoD)**: D01(5.3節の新フィールド)・D02(`wireResistivityRatio`)・D04(`batteryInternalResistanceRatio`)・D07(`magnetStrength`)の4分岐が同時に有効な状態で、各baseフィールドが自分の担当分岐からのみ変更され他分岐の入力を取り違えないことを、4通りの独立fixtureで検証する。

### 3.3 発煙/発火境界とevents/terminalModes

`advanceD02`は`coilHeatGaugeRatio >= config.d02.coilOverheatGaugeLimit`到達時にのみevent発行(`isFirstThisSession:true`固定)。`classifyTerminalModes`の既存D02分岐(無条件)はそのまま維持できる。

### 3.4 M4型sweep受け入れ条件(死にモード防止)

D02専用熱ゲージが電池系終端(overheated/D03/D04)より先に発火できるproduction-valid構成が最低1つ存在することをsweep受け入れ条件にする。同一stepでD02と電池系終端が成立しうる境界fixtureを構築し、`events`固定順序(D01→D02→[D03またはD04]→D05→D06→D07→D09)どおりに両方のeventが並ぶこと、`terminalModeCandidates`が両モードを保持すること(D02とD03/D04は排他ではない、spec §7.1.1)を検証する。

### 3.5 発煙状態の可逆/不可逆(Suu_mot3指摘、正式Fable裁定確定P3-3-Q8、P38是正で3.3/3.4の後へ移動)

**問題**: 現行`D02Progress`は`coilHeatGaugeRatio`(連続値)と`triggered`(発火のみ)しか持たず、「発煙開始」自体をlatchする状態がない。単純な`coilHeatGaugeRatio >= smokeGaugeThreshold`の毎frame再判定だと、冷却(電流低下等で熱ゲージが放散し閾値未満へ戻る)により**煙・R_coil悪化が消えてしまう**——v12 §12「進行(発煙)→終端(発火)」「発煙段階はR_coil増」という記述だけでは、この可逆性が確定していない。

**`smokingActive`を非永続の派生出力にする(P39是正、根本設計の訂正)**: v4は`smokingActive`を`D02Progress`への**persisted公開フィールド**として設計したが、これをsnapshotへ保存すると「`smokingActive === (coilHeatGaugeRatio >= config.d02.smokeGaugeThreshold)`」という**config横断の交差不変条件**が生じる——`validateD02ProgressShape(raw: unknown): boolean`(既存シグネチャ、601行目)は`config`を受け取らないため、この不変条件を検証するには新規にconfig引数を追加する必要があり、他のどのProgress validatorも持たない新種のパターンになってしまう(D04の`stage`/`initiatingCauseLog`同値関係はいずれもProgress内部で閉じており、config非依存)。**是正**: `smokingActive`は`D02Progress`へ**一切追加しない**。代わりに、`destructionModes.ts`(またはdestructionOrchestration.ts)へ新規の**非永続・純関数**`isD02SmokingActive(progress: D02Progress, d02Config: DestructionConfig['d02']): boolean`をexportし、`progress.coilHeatGaugeRatio >= d02Config.smokeGaugeThreshold`を返すだけの薄いラッパーとする。UI(HUD)はこの関数を毎フレーム呼び出して真偽値を得る——「UIが独自の破壊判定を持たない」原則(spec §7.1.1)は、**UI自身が比較式を書くか否か**ではなく**エンジン側が提供する判定ロジックを経由するか否か**で満たされるため、非永続の関数呼び出しであってもUIの独自判定にはならない。この設計により、`smokingActive`はsnapshotへ一切保存されず、restore時の交差不変条件もrestore破損の攻撃面も生じない。

**候補(a)——完全可逆**: `coilHeatGaugeRatio >= smokeGaugeThreshold`を毎frame再評価し、閾値未満へ戻れば表示・R_coil効果とも消える。D07の可逆ダレ(`reversibleDroopActive`)と同型の設計。**物理的懸念**: 一度煙が出るほど加熱した巻線の絶縁劣化は現実には可逆ではないため、症状として消えるのは「現象は隠さない」原則には反しないが物理的説明が弱い。**UIへの公開**: UIは`isD02SmokingActive(progress, config.d02)`(非永続の派生関数、上記)を呼んで得た真偽値のみを読む。**`D02Progress`への新規フィールド追加は一切ない**(v4の「`smokingActive`を新規persistedフィールドとして追加する」という設計は撤回、P39是正)。

**候補(b)(推奨)——不可逆latch(D04のstage開始パターンと同型)**: `D02Progress`へ`smokingStarted: boolean`・`smokingStartedAtT: number | null`の**2フィールドのみ**を追加する(P30是正: v2/v3で「必要なら`initiatingCauseLog`相当」と保留していた点を検討し、**追加しないことに確定する**——D04の`initiatingCauseLog`は「短絡由来か過放電由来か」という複数原因を`burning`到達時まで区別・凍結する必要から存在するが、`D02CauseLog`(233〜235行目)は`CauseLogCommon`+`coilHeatGaugeRatio`という単一スカラーのみで、D02には元来D04のような分岐する原因が存在しない〈熱ゲージ閾値到達という単一経路のみ〉ため、原因を凍結保存する対象自体がない)。一度`coilHeatGaugeRatio >= smokeGaugeThreshold`を満たしたら`smokingStarted`は**そのセッション中不可逆**にtrueのまま(D01の「崩壊は不可逆・一度きり」、D04の`stage`が後退しない設計と同じ規律)。R_coil悪化(3.2節)は`smokingStarted`を条件に適用し、冷却後も持続する。`coilHeatGaugeRatio`自体は熱ゲージとして今後も上下しうる(HUD診断表示用の生値として維持、art-spec §5.2のHUD規約と整合)。**UIへの公開**: `smokingStarted`(persisted latch)をそのまま読む——こちらは真に状態を持つ(過去に一度でも閾値到達したか)ため、非永続の派生関数では表現できず、latchとして永続化が必要。

**候補(c)——表示は可逆・損傷はlatch(候補a/bのハイブリッド)**: 煙の**表示**(UI演出のトリガ)は候補(a)と同じ`isD02SmokingActive`(非永続の派生関数)を読み、**R_coil悪化(実損傷)だけ**を候補bの`smokingStarted`(persisted latch)でlatchする。UIは表示に`isD02SmokingActive`を、engineの実効config合成は`smokingStarted`を、それぞれ別の目的で参照する。

**候補a/cのUI入力経路(P47是正、Fable確定裁定事項P3-3-Q8の一部)**: `isD02SmokingActive(progress, d02Config)`はUIから直接呼べる純関数だが、**UIは現行`config.d02`を一切参照できない**——production向け`DestructionConfig`のUI配線自体がP3-0-Q2裁定によりP3-4まで延期されており(11.3節)、現行UI契約は`DestructionState`/`events`の読取専用(16節)であって`DestructionConfig`を読む経路が存在しない。候補a/cを実装可能な案として残すには、UIが`d02Config`をどこから得るかを未定のままにできない。2案を提示する:
1. **候補(A)——P3-4でUIへ`RunSnapshot.destructionConfig`の読取専用参照を渡す**: UI/HUDが`isD02SmokingActive(state.modes.D02, config.d02)`を自分で呼び出す。**懸念**: UIへ新規のconfig読取経路を追加する配線変更(P3-4スコープ)が必要になり、現行の「HUDはDestructionState/eventsのみ読む」という単純な契約が崩れる。
2. **候補(B)(推奨)——wrapper/storeがengine純関数の派生結果(boolean)を公開しUIはbooleanだけ読む**: `stepTestRunWithDestruction`等のwrapper(`state`と`destructionConfig`の両方を既に内部で保持している)が`isD02SmokingActive`を自分で呼び出し、その結果(boolean)を、UIが既に読んでいる per-step結果構造(`DestructionState`と並ぶ非persisted扱いの派生値)へ含めて公開する。UIは新規のconfig読取経路を一切必要とせず、既存の「HUDはstep結果の読取専用」契約(16節)をそのまま維持できる。候補(b)の`smokingStarted`(`DestructionState.modes.D02`の一部としてUIへ既に届く)と、UI側からの見え方が構造的に同格になる。
**alice_mot3推奨**: 候補(B)。理由: 既存UI契約(config非読取)を一切変更せずに済み、候補a/b/cのいずれが採用されてもUI側の実装パターンが統一される(常に「step結果からbooleanを読むだけ」)。この経路自体の**実装(wrapperがderived booleanを実際にper-step結果へ添付する配線)はP3-3のスコープ外**(production wiring、P3-0-Q2裁定どおりP3-4)であり、本節はP3-4が従うべき契約の決定のみを行う——6.5節のWearState次run反映と同じ「決定はP3-3、配線はP3-4」という切り分けである。

**正式Fable裁定(確定P3-3-Q8)**: 候補(b)不可逆latchを裁定する。エナメル絶縁の熱劣化は実物で不可逆であり、D01/D04と同じ規律。**P39是正(`smokingActive`をpersistedフィールドにせず非永続派生関数`isD02SmokingActive`とし、config横断交差不変条件の発生自体を回避した設計)を特に評価する**——保存しない状態は復元で壊れない。(b)採用によりUI入力経路A/Bの選択は本件では不要になるが、**同型の派生値が将来生じた場合の標準経路として候補(B)(wrapper/storeがbooleanを公開しUIはconfigを読まない)をここで確定しておく**——「HUDはstep結果の読取専用」契約を全候補で不変に保つ唯一の形である。

**影響範囲(比較表、P39是正で候補別field集合を訂正)**:

| | 新規persistedフィールド | validator | リプレイ | 12fps表示 | 人間再承認 |
|---|---|---|---|---|---|
| 候補(a) | **なし**(`isD02SmokingActive`は非永続の派生関数) | 追加フィールドなしのため交差不変条件も不要(既存`coilHeatGaugeRatio`の`[0,1]`clampのみ) | 決定論は保たれる(既存ゲージのみに依存、`isD02SmokingActive`は都度再計算する純関数) | 表示は毎frame`isD02SmokingActive(progress, config.d02)`呼び出しに追従、点滅等の12fps格子はUI側の責務(art-spec §7) | **不要**(新規公開フィールドなし) |
| 候補(b)(推奨) | `smokingStarted`・`smokingStartedAtT` | `smokingStarted===false ⟺ smokingStartedAtT===null`(D04の`stage`/`initiatingCauseLog`と同型)を`restoreRunSnapshot`のraw validatorへ追加 | 決定論は保たれる(latchも既存フレーム入力のみから決定論的に導出) | 表示はlatch後固定(消えない)、UI側の12fps格子は不変 | **必要**(`D02Progress`への公開フィールド追加、D04の`initiatingCauseLog`追加時と同格) |
| 候補(c) | `smokingStarted`・`smokingStartedAtT`(候補bと同じ、`isD02SmokingActive`はフィールドではないため候補cもfield集合は候補bと同一) | 候補(b)と同じ+UI契約側の追加確認(art-spec整合、P3-3外) | 候補(b)と同じ | UIが`isD02SmokingActive`と`smokingStarted`の2系統を別々に描画する必要があり演出設計の負担が増える | 候補(b)と同じ+UI契約確認 |

**正式Fable裁定により候補(b)〈不可逆latch〉で確定済み(P3-3-Q8)。**

---

## 4. D05個別設計

### 4.1 状態遷移の完全定義(P1是正)

**v1の問題**: 4.1節の式に`isChatteringThisFrame`条件が欠落しており、理論電流が閾値超なら通常整流中(チャタリングしていない)でも`sparkDurationS`/`cumulativeSparkExposure`を積算してしまっていた。これは「通常整流の微小火花は除外」というspec §7.1.1の要件に反する。

**確定式(状態遷移を完全定義)**:

```ts
const excessCurrentA = Math.max(0, frame.theoreticalCurrentA - config.d05.brushSparkCurrentThresholdA);
const isSparkActive = frame.isChatteringThisFrame && excessCurrentA > 0; // 4.2節の新規フィールド

let sparkDurationS: number;
let episodeTriggered: boolean;
let cumulativeSparkExposure = prev.cumulativeSparkExposure; // 恒久蓄積、非アクティブでもリセットしない

if (isSparkActive) {
  sparkDurationS = prev.sparkDurationS + dt;
  cumulativeSparkExposure = prev.cumulativeSparkExposure + excessCurrentA * dt; // アクティブ中は無条件で加算(episode成立可否と独立)
  episodeTriggered = prev.episodeTriggered; // 判定は下記
} else {
  sparkDurationS = 0; // 再武装
  episodeTriggered = false; // 再武装(次のアクティブ区間で新規episodeとして検出可能にする)
}

const justCrossed = isSparkActive && !episodeTriggered
  && sparkDurationS + DURATION_COMPARISON_EPSILON_S >= config.d05.brushSparkDurationLimitS;

if (justCrossed) {
  episodeTriggered = true; // 付帯条件(Fable指示): justCrossed成立時のepisodeTriggered更新を疑似コードへ明示補記
}
```

`justCrossed`が真の場合にのみepisode成立(event発行候補、4.3節)。**付帯条件(Fable指示)**: 上記疑似コードはv6まで`justCrossed`を判定するだけで`episodeTriggered`への反映(`if (justCrossed) episodeTriggered = true;`)を省略しており、遷移そのものが疑似コード上で欠落していた(挙動自体は4.3節のDoDに含まれる2episode実経路テストが固定済みのため実装上の誤りではないが、疑似コードの完全性を優先し補記する)。`cumulativeSparkExposure`は**アクティブ区間中は毎frame無条件に加算**され、episodeが成立するか否か(=event発行の有無)とは独立(4.3節でこの独立性を正式に扱う)。

### 4.2 チャタリング境界の正しい検出(状態遷移表)

**問題**(v1から維持、Suu_mot3指摘2): `evaluateMotorFrame`(motorPhysics.ts)は`chatterState.chattering`(このstep実際にチャタリングしたか)を`current=0`の適用にのみ使い、戻り値の`chatterFramesLeft`は次stepの残りバースト長である。`nextChatterState`の実装(201〜218行目)により、バースト最終step(`prev.chatterFramesLeft===1`)は`chattering:true`だが`next.chatterFramesLeft===0`を返す。

| `prev.chatterFramesLeft` | このstepの実際の`chattering`(engine内部、非公開) | `next.chatterFramesLeft` | 正しい復元式 |
|---|---|---|---|
| 0(非チャタリング) | false | 0 | `prev>0 \|\| next>0` = false |
| 0(新規バースト発生) | true | 23(>0) | `prev>0 \|\| next>0` = true |
| N>1(バースト継続中) | true | N−1(>0) | `prev>0 \|\| next>0` = true |
| 1(バースト最終step) | **true** | **0** | `prev>0 \|\| next>0` = **true**(単純な`next>0`判定はfalseになる) |

**確定**: `DestructionFrameInput`へ新規フィールド`isChatteringThisFrame: boolean`を追加し、`buildMotorOnlyFrameInput`/`buildVehicleFrameInput`(motorPhysics.ts無改修のままこの2関数内で完結)が`prev.chatterFramesLeft > 0 || next.chatterFramesLeft > 0`を計算して設定する。既存の`chatterFramesLeft`フィールド自体は意味を変えず残す(「残りフレーム数」のまま)。

**境界テスト(必須DoD)**: `CHATTER_BURST_FRAMES − 1`(23)フレーム連続でチャタリングが継続し、最終フレーム(`prev.chatterFramesLeft===1`)でも`isChatteringThisFrame===true`と判定されること、その次フレームでは`false`に戻ることを、`step`(motorPhysics.ts公開API)経由の実物理で固定する。

### 4.3 反復event契約(P2是正)

- **`episodeCount`**: `justCrossed`が真になるたびに`prev.episodeCount + 1`。
- **`firstEpisodeAtT`**: `prev.firstEpisodeAtT === null`かつ`justCrossed`のときのみ`elapsedTimeS`を設定、以後不変。
- **`D05Progress.causeLog`**: **最初のepisode成立時にのみ設定し、以後上書きしない**(D01/D03と同じ「以後上書きしない」規律)。2回目以降のepisodeでは`D05Progress.causeLog`は変化しない。
- **各`UnstampedDestructionEvent`(D05)自身の`causeLog`**: `D05Progress.causeLog`とは別物——**そのepisode成立stepの瞬間値**(`sparkDurationS`・`currentA`・`rpm`・`atT`)を都度新しく構築する(D01/D03/D04のように固定値を使い回さない)。
- **`isFirstThisSession`**: 各eventについて`(prevEpisodeCount === 0)`(=このepisodeがセッション初回かどうか)。2episode目以降は`false`。

**必須DoD**: 2episode実経路テスト(1回目のepisode成立でevent発行(`isFirstThisSession:true`)+`D05Progress.causeLog`固定、非アクティブ区間を挟んで2回目のepisode成立でevent発行(`isFirstThisSession:false`、causeLogはこのepisode固有の瞬間値)+`D05Progress.causeLog`が1回目のまま不変、を1本のテストで確認する)。

**episode最大継続時間とCHATTER_BURST_FRAMESの到達可能性(必須DoD、0.4節#12)**: `isSparkActive`が非アクティブになった瞬間に`sparkDurationS`がリセットされる設計(4.1節)のため、**単一の連続チャタリングバースト内でしか`sparkDurationS`を蓄積できない**。`CHATTER_BURST_FRAMES=24`(=0.2秒@120fps、dt=1/120s)が物理的な上限であるため、**`brushSparkDurationLimitS`の較正値は0.2秒以下でなければepisodeが構造的に到達不能になる**。この制約をsweep受け入れ条件(10節)へ明記し、境界sweep(0.2秒ちょうど・それ超過の較正候補では到達不能になることを示す負例)をDoDへ追加する。

### 4.4 摩耗換算の経路(P3・P18是正、正式Fable裁定確定P3-3-Q3)

**v1の問題**: `deriveDegradationDiffs(events, finalDestructionState)`はMotorConfig/DestructionConfigを受け取らない(0.4節#7)。ブラシ素材由来の`wearRateRatio`や高電流ペナルティをMotorConfigに置いても、diff換算時に読む手段がない。さらに`cumulativeSparkExposure`のA·s総量だけでは、そのうちどれだけが高電流閾値超だったか事後復元できない。

**v2の問題(P18指摘)**: v2の`cumulativeWeightedWearExposure`は「A·s × ratio」という次元のままであり、「無次元」と書きながら実際には無次元ではなかった。さらに、その値を最終的に`wearFraction`へ変換する係数(A·s→wearFraction)の所有場所・config field名・validatorが未定義のままだった。

**確定候補(a)——`advanceD05`が毎frame最終的な無次元差分まで積分し、D05Progressは無次元の恒久蓄積値のみを保持する**: `DestructionConfig.d05`へ`wearPerAmpSecond: number`(A·s→wearFraction相当の変換係数、次元は`1/(A·s)`)を追加し、`brushWearRateRatio`・`highCurrentPenalty`(正式Fable P3-3-Q15-4裁定、確定候補ii: `{ kind: 'noPenalty' } | { kind: 'thresholdPenalty'; highCurrentPenaltyThresholdA: number; highCurrentPenaltyMultiplier: number }`の判別union、15.5節)とあわせてadvance時点で完全に無次元へ変換する。`D05Progress`へ`cumulativeWearDeltaFraction: number`(**無次元、この名前が実際の次元を正しく表す**)を追加する:

```ts
if (isSparkActive) {
  const penalty = config.d05.highCurrentPenalty;
  const penaltyMultiplier =
    penalty.kind === 'thresholdPenalty' && frame.theoreticalCurrentA > penalty.highCurrentPenaltyThresholdA
      ? penalty.highCurrentPenaltyMultiplier
      : 1;
  const wearDelta = excessCurrentA * dt * config.d05.brushWearRateRatio * penaltyMultiplier * config.d05.wearPerAmpSecond; // 無次元(A·s × 1/(A·s) × 無次元比率)
  cumulativeWearDeltaFraction = prev.cumulativeWearDeltaFraction + wearDelta;
}
```

`deriveDegradationDiffs`は`finalDestructionState.modes.D05.cumulativeWearDeltaFraction`をそのまま`{role:'brush', kind:'wear', deltaFraction: cumulativeWearDeltaFraction}`として返す(**この時点で追加の変換係数を掛けない**——変換は`advanceD05`側で完結済み)。**MotorConfigへのアクセスは一切不要になる**(素材由来係数は`DestructionConfig.d05`側に既に畳み込み済みのため)。

**候補(b)——`deriveDegradationDiffs`の公開シグネチャへRunSnapshot/configを追加する**: 電流分布の喪失問題(高電流閾値超だった部分の復元不能)はこの変更だけでは解決しない(結局per-frame integrationが必要)。P3-0公開シグネチャの変更でもあり不採用。

**候補(c)——Unstamped eventへ埋め込むだけ**: episode未成立(4.1節の非アクティブ区間)やmanualAbort時の曝露を取りこぼす(eventが発行されないため)。不採用。

**`cumulativeWearDeltaFraction`の1超過をどこでclampするか(P35是正)**: 実コード確認の結果、`degradationApplication.ts`の`applyBrushDiff`(29〜31行目)は**既に**`clampFraction(current.wearFraction + diff.deltaFraction)`という形で、diff適用後の`WearState.wearFraction`を`[0,1]`へclampしている(既存実装、D05専用の新規対応ではなく`applyMagnetDiff`・`applySeizureDiff`〈17〜27行目〉も同型)。この既存precedentに従い、**`cumulativeWearDeltaFraction`自体(run中の累積値)はclampしない**——長時間の異常スパーク多発runでは1を大きく超える値になりうるが、これは「今回のrunでどれだけ摩耗させたか」という差分量であって恒久状態そのものではないため、run中に1で頭打ちにする理由がない(頭打ちにすると、複数episodeの合計摩耗量という情報が失われる)。**恒久状態への反映時(`applyBrushDiff`)でのみclampする**、という役割分担を明記する。DoDへ「`cumulativeWearDeltaFraction > 1`となる構成でも`applyBrushDiff`適用後の`wearFraction`が`1`を超えないことを固定する負例テスト」を追加する。

**不変条件(二重出典化の禁止、命名で明示)**: `cumulativeSparkExposure`(A·s、次元を持つ物理量)は**診断・API向けの単一出典**(症状表示・実験ノート等が参照する生の物理量、素材非依存)。`cumulativeWearDeltaFraction`(**無次元**、命名がこの事実を正しく表す)は**恒久摩耗差分換算専用の単一出典**(素材の`brushWearRateRatio`・`wearPerAmpSecond`等を織り込み済み)。両者は同一frameの同一入力(`excessCurrentA`・`dt`)から`advanceD05`が独立に計算するが、**一方から他方を事後導出しない**(片方だけを保存して他方を後から係数を掛けて求める実装は禁止——将来どちらかの式だけが変わった場合に静かに乖離するため、P3-2是正ラウンド3の教訓「値をコピーせず可視性を共有する」と同じ原則をここでは「同一frameで独立に計算する」という形で適用する)。

**正式Fable裁定(確定P3-3-Q3)**: 候補(a)を裁定する。`advanceD05`側で素材係数・`wearPerAmpSecond`まで畳み込み、`cumulativeWearDeltaFraction`(無次元)をfinal stateから読む設計は、`deriveDegradationDiffs`の公開シグネチャ不変・event 0件run(閾値未満の軽微スパーク蓄積)の取りこぼしゼロ・二重出典禁止(A·s診断量と無次元摩耗量を同一frameで独立計算、事後導出禁止)のすべてを満たす。8節のP3-0-Q6整合確認も承認する——不変条件は「イベント発行のホワイトリスト」であって「diffのイベント比例」ではなく、D05が`finalDestructionState`引数を初めて実使用するモードになることは違反でない。ホワイトリスト構造テスト(event個数を変えてもdiff不変)の設計も正しい。**物理的にも正しい**: ブラシは目立つepisodeの瞬間だけでなく、火花活動の総量で摩耗する。

---

## 5. D01個別設計(P3-1-Q1返済)

### 5.1 返済の背景

P3-1-Q1裁定(`docs/phase3-p3-1-plan.md` 644〜656行目)の要約は既存v1のとおり。返済先の機構(`composeEffectiveMotorConfig`)はP3-2 Gate4で既に導入済みのため、P3-3は新規関数を作らず既存関数へD01分岐を追加する。

### 5.2 進行量の駆動式・入力単位の是正(P9是正、正式Fable裁定確定P3-3-Q4)

**v1の問題**: `DestructionFrameInput.rpm`は`updateRpm`による指数移動平均済みの表示用値(min⁻¹)であり、`COIL_DEFORM_OMEGA`(瞬時角速度、rad/s)と単位・時定数の両方が異なるため直接比較できない。

**確定**: `DestructionFrameInput`へ新規フィールド`angularVelocityRadS: number`(=`next.omega`、平滑化前の生値)を追加する。`buildMotorOnlyFrameInput`/`buildVehicleFrameInput`(motorPhysics.ts無改修)がそのまま`next.omega`(motor-onlyは`next.omega`、vehicleは`next.motor.omega`)を渡す。

**進行量の駆動式(候補)**: 候補(a)`|frame.angularVelocityRadS|`の時間積分(回転曝露の総量)、候補(b)`max(0, |frame.angularVelocityRadS| − COIL_DEFORM_OMEGA) × dt`の積分(崩壊トリガと同じ閾値を超えた分だけを進行量に算入)。**正式Fable裁定(確定)**: 候補(b)を裁定する。崩壊の原因(閾値超過回転)と進行の駆動因を同一閾値で説明し、較正自由度を1つ減らす——原因と進行が同じ物理機構であることの正直な表現である。`angularVelocityRadS`(平滑化前の生値)の新設は0.4節#10の単位問題の正しい解である。

**停止時ゼロの負例(必須DoD)**: 崩壊発生後、`|angularVelocityRadS|`が`COIL_DEFORM_OMEGA`未満で継続するフレーム列で、進行量が増加しないことを固定する。

**進行量フィールドの具体化(P34是正)**: `D01Progress`へ`decayExposureRad: number`(**新規公開field名を確定**、初期値`0`、単位rad——`max(0, |angularVelocityRadS| − COIL_DEFORM_OMEGA)`〈単位rad/s〉を`dt`〈単位s〉で積分した累積量)を追加する。**更新式**: `triggered === false`の間は`0`のまま(崩壊前は漸減しない、spec §7.1.1「発火後」の文言および`docs/phase3-p3-1-plan.md` 644行目の裁定と整合)。`triggered === true`の各stepで`next.decayExposureRad = prev.decayExposureRad + max(0, |frame.angularVelocityRadS| − COIL_DEFORM_OMEGA) × dt`(単調非減少、負の増分はない)。**値域**: 常に有限非負(`decayExposureRad >= 0`)。

### 5.3 実効巻数と抵抗/占積効果の分離(P8是正、正式Fable裁定確定P3-3-Q5)

**v1の問題(P8指摘)**: v1候補(a)(`wireResistivityRatio`増+`axisOffsetMm`増)は抵抗・振動の効果であって、spec §7.1.1が要求する「実効巻数」減少(=トルク定数・逆起電力に直接効く量)ではない。**抵抗増を「実効巻数減」と呼び替えてはならない。** v1候補(b)(`effectiveTurnsFraction`をR/J双方へ掛ける)も、実在する導線質量・線長が消えるため不正。

**確定候補(新設計)**: `MotorConfig`へ新規フィールド`effectiveTurnsRatio?: number`(既定1.0)を追加し、**磁気結合の2式にのみ**適用する(`computeRCoil`/`computeJ`は実`coilTurns`のまま据え置き、導線質量・線長は変化させない):

```
backEmf = K_E × B × config.coilTurns × config.effectiveTurnsRatio × omega × sinTheta × s   // computeElectricalState改修
tMag = K_T × B × current × config.coilTurns × config.effectiveTurnsRatio × sinTheta × commutationSign   // computeMagneticTorque改修
```

**この2式の改修は`motorPhysics.ts`への変更を伴う**(14.2節で明示)。既定値1.0(フィールド省略時)で既存の全計算結果と完全一致するため後方互換であり、Phase2 Step5aで`wireResistivityRatio`/`wireDensityRatio`が同じパターン(既定1.0のオプショナル乗数、`computeRCoil`/`computeJ`の式改修)で導入され承認された前例と同型である。

**正式Fable裁定(確定P3-3-Q5)**: 承認する。エンジン凍結方針の範囲内と裁定する。物理所見を2点添える: (1) 巻き崩れで導線の実在(質量・線長・抵抗)は変わらず、磁気結合だけが劣化する——R/Jを実`coilTurns`に据え置き磁気2式のみへ係数を掛ける本設計は、v1の両候補が犯した誤り(抵抗増の呼び替え/実在質量の消失)を正確に回避している。(2) backEmfとtMagへ同一係数を掛けることは**エネルギー整合の要請**である(`K_E=K_T`の相反性: 逆起電力仕事=機械仕事。片方だけ劣化させるとエネルギー保存が破れる)——**この根拠を実装コメントに1行残すこと(付帯条件、実装時DoD)**。凍結判定: 既定値1.0で全既存結果と一致するオプショナル乗数はPhase 2 Step 5a(`wireResistivityRatio`等)で確立した拡張パターンそのものであり、駆動源が(a)素材写像でなく(b)破壊状態機械である点も凍結方針§2の拡張枠に収まる。**条件**: 49件回帰全成功(下記5.4節DoDどおり)。

**スコープ確定(P21是正)**: v2は「`effectiveTurnsRatio`のみ〈MVP〉に絞るか3効果すべて実装するかをFable裁定に委ねる」としていたが、これはP3-1-Q1裁定が課した「spec §7.1.1の文言(実効巻数・占積が漸減、**振動増**)に対応する形で実装する」という返済条件を、MVP選択時に**無名のまま消してしまう**穴だった(P3-1-Q1は「返済先はP3-3」という条件付き先送りであり、P3-3内で改めて一部を先送りする場合は返済/非採用の判断を明示しなければならない)。

**確定候補(より小さく正直な範囲)**: `effectiveTurnsRatio`を「実効巻数**と**占積の健全性をまとめた単一の磁気結合率」として定義する(占積劣化〈導通経路の乱れ〉も畢竟、磁気的に有効な巻数の実効的な減少として同じ`effectiveTurnsRatio`で表現できるため、抵抗増という別解釈を持ち出す必要がない)。**振動増は新規経路を発明せず、既存`coilCollapsePenaltyMm`(vehiclePhysics.ts、崩壊瞬間の一回加算)がそのまま担当する**——D01の「振動増」は既にこの既存機構でカバー済みと判断し、追加のR/axis悪化経路は導入しない。これにより実装対象は`effectiveTurnsRatio`1本のみになり、かつP3-1-Q1が要求する3要素(実効巻数・占積・振動)のすべてに対応先が明示される(実効巻数・占積→新規`effectiveTurnsRatio`、振動→既存`coilCollapsePenaltyMm`)。**3効果を独立に実装する拡張案(v2案)は不採用とし、無名の先送りを残さない。**

**正式Fable裁定(P21是正の確認)**: P21是正(3要素の対応先明示: 実効巻数・占積→`effectiveTurnsRatio`、振動増→既存`coilCollapsePenaltyMm`)は、P3-1-Q1返済条件の充足として認定する——spec §7.1.1の「振動増」は漸減する量ではなく崩壊時に増えた状態と読むのが正しく、無名の先送りは残っていない。

**二重計上防止(必須DoD、0.4節#11)**: 既存`coilCollapsePenaltyMm`はD01の振動要件を単独で担当するため、D01の新規`effectiveTurnsRatio`(磁気結合)とは別経路であり合成の重複は生じない(`effectiveAxisOffsetMm`計算式自体は無改修)。念のため、`effectiveTurnsRatio`の値が`axisOffsetMm`系のいかなる計算にも混入しないことをテストで固定する。

**`decayExposureRad`→`effectiveTurnsRatio`の写像式(P34是正)**: 新規`DestructionConfig.d01`セクションを追加し、`decayExposureScaleRad: number`(有限正、スケール定数、単位rad)・`minEffectiveTurnsRatio: number`(値域`0 < minEffectiveTurnsRatio <= 1`、劣化の下限)の2値を持たせる。写像式:

```
effectiveTurnsRatio = max(
  config.d01.minEffectiveTurnsRatio,
  1 - state.modes.D01.decayExposureRad / config.d01.decayExposureScaleRad
)
```

**値域の保証**: 上式は`decayExposureRad >= 0`(5.2節で保証済み)である限り常に`minEffectiveTurnsRatio <= effectiveTurnsRatio <= 1`を満たす(`decayExposureRad=0`で`1`、`decayExposureRad`が大きいほど単調減少して`minEffectiveTurnsRatio`で頭打ち)。**単調性DoD**: `decayExposureRad`が単調非減少である限り(5.2節)、`effectiveTurnsRatio`は単調非増加であることをテストで固定する。**clamp DoD**: `decayExposureScaleRad`に対して極端に大きい`decayExposureRad`を与えても`effectiveTurnsRatio`が`minEffectiveTurnsRatio`を下回らないことを固定する。**停止時ゼロとの整合**: `decayExposureRad`が増加しない限り(5.2節の停止時ゼロ)、`effectiveTurnsRatio`も変化しない。

**型・restore・recipeの3契約の整合(P29是正、Fable確定裁定事項P3-3-Q12)**: `composeEffectiveMotorConfig`は`(base: MotorConfig, ...) => MotorConfig`という既存シグネチャで、`{ ...effective, effectiveTurnsRatio: ... }`という既存D04/D07と同型のスプレッド合成を行う(1021〜1056行目)。このため`effectiveTurnsRatio`は**型としては通常の`MotorConfig`の一員であることを避けられない**——「実行時合成値だから`MotorConfig`型に属さない」という主張は型システム上成立しない(v3の14.2節はこの点で誤っていた、P29指摘)。したがって以下のとおり3つの契約を切り分けて確定する:
1. **型契約**: `effectiveTurnsRatio?: number`は`MotorConfig`インターフェースの通常の1フィールドとして宣言する(ブラシ2フィールドと同格)。
2. **restore契約(validator)**: 汎用の`validateMotorConfigShape`の`optionalNumberFields`には**追加する**(型はMotorConfig全体で共有されるため、値域〈有限数〉チェック自体はどの`MotorConfig`インスタンスに対しても必要——ここは既存の`batteryInternalResistanceRatio`等と同じ扱いで良い)。その上で、**RunSnapshotが保持する「base(無傷)config」に限っては追加の値制約**(`effectiveTurnsRatio === undefined || effectiveTurnsRatio === 1`)を課す——`restoreRunSnapshot`(destructionOrchestration.ts 779行目〜)内の`validateMotorConfigShape(motorConfigRaw)`呼び出し(784行目)の直後へ、この専用チェックを追加する(`validateMotorConfigShape`自体は変更しない、呼び出し側にもう1段重ねる形)。`composeEffectiveMotorConfig`の**出力**(実行時のみ・保存されない)にはこの追加制約を適用しない(D04/D07の合成後`MotorConfig`が同じくRunSnapshot base検証の対象外であるのと同型の区別)。D04/D07の合成対象フィールド(`magnetStrength`等)にこの種の「baseは特定値固定」という制約が存在しないのは、それらの base値が素材選択によって正当に1.0以外を取りうるためであり、`effectiveTurnsRatio`はどの素材を選んでも新品時は必ず1.0という点で構造的に異なる(この非対称性自体をFableへ明示し確認する)。
3. **recipe契約**: `recipeCode.ts`への追従は行わない(6.4節で確定済み、素材によってbase値が変わらないため符号化する情報がない——decode時は常にフィールド省略〈`undefined`〉となり、上記2のbase制約を自動的に満たす)。

**正式Fable裁定(確定P3-3-Q12)**: 承認する。汎用validator(`validateMotorConfigShape`)は文脈非依存のまま、base専用制約(`undefined || 1`)を文脈が存在する`restoreRunSnapshot`呼び出し側に重ねる層分離は正しい。D04/D07合成対象フィールドとの非対称性の根拠(素材によらず新品時必ず1.0)も正確。

**encode方向の静かな脱落防止(P43是正・P46是正、Fable確定裁定事項P3-3-Q14)**: 上記3は「decodeが常に`undefined`を返す」というdecode方向の安全性のみを述べており、**encode方向**の問題は未対応だった——`encodeRecipe(recipe: CarRecipe): string`(291行目)は`recipe.motorConfig: MotorConfig`を受け取るが、`MotorConfig`型は`effectiveTurnsRatio`を含む(上記1で確定済み)ため、呼び出し側が誤って(あるいは意図的に)`composeEffectiveMotorConfig`の出力〈`effectiveTurnsRatio < 1`を含む実行時のeffective config〉を`encodeRecipe`へそのまま渡すことができてしまう。この場合`motorConfigToFields`/`RECIPE_M_FIELD_KEYS`のいずれも`effectiveTurnsRatio`用のキーを持たない(6.4節で確定済み、意図的に追従しない)ため、`effectiveTurnsRatio<1`という情報は**エラーなく静かに脱落**し、生成されたレシピコードは「無傷の新品」を表すコードになる——round-tripの結果が入力と異なるにもかかわらず、呼び出し側には一切通知されない。RunSnapshot base制約(上記2、decode方向)と対になる、encode方向の同種の問題である。

**依存閉包の事前列挙(P46是正、pitfalls#2遵守——既存の破壊的型変更計画に依存閉包の事前列挙を欠いていた)**: `encodeRecipe`のシグネチャを破壊的に変更する候補(a)を検討する以上、実装着手前の本書の時点で`rg`実測を行う。`rg -n "encodeRecipe\(" --type=ts`(2026-08-10実測)の結果:
- **定義**: `src/engine/recipeCode.ts`(291行目)1箇所。
- **呼出元**: `src/engine/__tests__/recipeCode.test.ts`(17箇所)・`src/store/__tests__/testRunStore.test.ts`(1箇所)・`src/components/RecipePanel.tsx`(39行目、1箇所)。
- **合計19呼出し、3 consumerファイル**(定義ファイルを含め計4ファイルが変更対象)。候補(a)採用時はこの19箇所すべてで戻り値の受け取り方(`.ok`判定の追加)を機械的に追従する。

4案を比較する(P46是正で候補を1件追加):
1. **候補(a)——`encodeRecipe`が非1の`effectiveTurnsRatio`を拒否する(Result型化)**: `encodeRecipe`の戻り値を`string`から`{ok: true; code: string} | {ok: false; reason: string}`のようなResult型へ変更し、`recipe.motorConfig.effectiveTurnsRatio`が`undefined`でも`1`でもない場合は`{ok: false}`を返す。**懸念**: 19呼出し全箇所が影響を受ける破壊的シグネチャ変更(上記で事前列挙済み)。
2. **候補(b)——base専用型を分離する**: `CarRecipe.motorConfig`の型を`Omit<MotorConfig, 'effectiveTurnsRatio'>`のような専用のbase型に絞り、コンパイル時に非base値を渡せなくする。**却下理由(正式Fable裁定で強化)**: この案はコンパイル時の保証として機能しない——TypeScriptの構造的部分型のもとでは、非リテラルの`MotorConfig`値は余剰オプショナルフィールドの有無を検査されずに`Omit`型へ代入可能である(過剰プロパティ検査はオブジェクトリテラルのみに適用される)。したがってコンパイル時保証は幻影であり、単なる「型を維持するコストが生じる」以上に、**「安全に見えて実際には防御にならない」候補**として却下する。
3. **候補(c)(推奨、P46是正で新規追加)——戻り値`string`を維持しfail-fastでthrowする**: `encodeRecipe`のシグネチャ(`string`を直接返す)は変更せず、内部で`recipe.motorConfig.effectiveTurnsRatio`が`undefined`でも`1`でもない場合に例外をthrowする。**利点**: 静かな脱落は防ぎつつ(呼び出し側が例外を無視しない限り必ず気づく)、19呼出しのうち**成功系(effectiveTurnsRatioを含まない通常呼び出し)のAPIは一切破壊しない**——例外は本来到達してはならない誤用時のみ発生するため、既存テスト19箇所のうち実際に修正が必要なのは「意図的に非1のeffectiveTurnsRatioを渡すテストケースを新設する」場合のみで、既存の成功系呼び出しは無改修で動く。例外の型・文言は実装詳細でよく、本書では「throwする」という契約のみを固定する。
4. **候補(d)——現状の呼び出し規約のみで許容する(是正しない)**: 「`encodeRecipe`にはbase configのみを渡す」という規約をdocsに明記するだけで、型・実行時のいずれでも強制しない。**懸念**: 本節が問題視した「静かな脱落」がそのまま残る。

**正式Fable裁定(確定P3-3-Q14)**: 候補(c)を裁定する。候補(a)(Result型化)は19呼出し全箇所への機械的追従を必要とする一方、静かな脱落を防ぐという目的自体は「誤用時に例外で気づける」候補(c)でも同等に達成できる。候補(c)は成功系APIを一切変更しないため実装コストが候補(a)よりはるかに小さい。候補(b)は上記のとおり型システム上防御にならない偽の安全であり、候補(c)は「(b)より安い」のではなく「(b)が偽の安全を売っているために正しい」選択である。`restoreRunSnapshot`側(decode方向)がResult型を採用しているのとの非対称性は、`restoreRunSnapshot`が「外部由来の`unknown`を検証する」関数(失敗が常態)であるのに対し`encodeRecipe`が「内部で構築した`MotorConfig`を渡す」関数(失敗は本来ありえない誤用のみ)という性質の違いに基づく合理的な非対称性であり、無理に揃える必要はない。**条件**: throwの負例テスト(12.7節)を維持し、**例外文言に本裁定(P3-3-Q14)への参照を1行含めること(付帯条件、実装時DoD)**。

### 5.4 予算不変性テストの再実行

D01/D02/D05の分岐追加後、既存の予算不変性テスト(`computeEnergyBudgetJ(baseMotorConfig) === computeEnergyBudgetJ(composeEffectiveMotorConfig(...))`)を再実行する。D01/D02の合成対象フィールド(`effectiveTurnsRatio`・`wireResistivityRatio`・`axisOffsetMm`)がいずれも`computeEnergyBudgetJ`(`trackPhysics.ts`、車体側パラメータのみ使用)の入力に含まれないことをコード確認済み。

### 5.5 D02×D05×D01の非自明リプレイ等価性(必須DoD)

D01(高速回転による漸減進行)・D02(発煙進行)・D05(異常スパーク)が同一run内で同時に進行しうる非自明な構成(held-short相当ではなく、通常通電下で3モードが並行進行する構成)を用い、同一`RunSnapshot.seed`から独立に2回実行した結果(`events`・`destructionState`・`degradationDiffs`・`physicsState`)が完全一致することを検証する。

---

## 6. ブラシ素材写像設計

### 6.1 制約の確認(v1から維持)

spec §4.2「ブラシ(写像先: 接触抵抗、摩耗率、チャタリング特性)」。既存player軸`sandingQuality`/`brushPressure`を素材写像で上書きしない。貴金属ブラシの大電流非線形性(6.3節)。

### 6.2 層の分離(P5・P6是正)

**v1の問題(P5指摘)**: `brushContactResistanceRatio`/`brushChatterProbabilityRatio`は`computeContactResistance`/`nextChatterState`(いずれもmotorPhysics.ts)を変更しないと効果を持たない。v1の「motorPhysics.ts無改修」という変更ファイル表の記載と矛盾していた。

**確定設計(2層に分離)**:

1. **MotorConfig層(motorPhysics.ts改修を伴う)**: `brushContactResistanceRatio?: number`(既定1.0、`computeContactResistance`の戻り値へ乗算)・`brushChatterProbabilityRatio?: number`(既定1.0、`nextChatterState`内の`prob`計算へ乗算)。この2フィールドは「接触抵抗」「チャタリング特性」という2つの写像先を担当する。**motorPhysics.tsの当該2関数の改修+既存回帰テストの再実行が必要**(14.2節で明示)。5.3節の`effectiveTurnsRatio`と同じ前例(既定値1.0の後方互換オプショナル乗数)に従う。**recipeCode.tsへの追従が必要(P15是正、6.4節)——`wireResistivityRatio`等と同じ「素材由来base値」であり、`effectiveTurnsRatio`(run内合成値、6.4節末尾で区別)とは異なりrecipeへ含める。**
2. **DestructionConfig.d05層(motorPhysics.ts無改修)**: `brushWearRateRatio`・`highCurrentPenalty`(判別union、正式Fable P3-3-Q15-4裁定、4.4節、素材ごとの写像値)。「摩耗率」という写像先を担当し、`advanceD05`が既に受け取っている`DestructionConfig['d05']`へ素材写像時に畳み込む。`wearPerAmpSecond`(A·s→wearFraction変換係数、4.4節)は素材非依存の単一較正値であり、こちらは`mapD05BrushWearConfig`ではなく`DestructionConfig.d05`の共通部分として直接較正する(素材ごとに変える一次資料がないため、D03のアルカリ/NiMH単一値と同じ規律)。

**正式Fable裁定(確定P3-3-Q6)**: 承認する。spec §4.2の3写像先(接触抵抗・チャタリング特性→MotorConfig層、摩耗率→d05層)と消費関数の所在が一致する正しい分割。`nextChatterState`のシグネチャ変更の事前明記(14.2節4)も適切。

### 6.3 貴金属の大電流非線形性の受け入れ条件(P7是正)

**v1の問題**: 「上位素材ほど常に有利」という設計は、spec §4.2「貴金属ブラシ: 低電流で抜群、大電流で急速に荒れる」という**交差する非線形性**と矛盾する。

**受け入れ条件(表)**:

| 素材 | 低電流域の期待順位 | 高電流域の期待順位(wear rate) |
|---|---|---|
| 銅板(tier0) | 最下位(接触抵抗も摩耗も最悪) | 下位(ただし非線形ペナルティなし) |
| カーボン(tier1、anchor) | 中位(基準1.0) | 中位(基準1.0、変化なし) |
| 銀黒鉛(tier2) | 上位(低接触抵抗) | 中位(摩耗率はカーボンと同値、優位は低接触抵抗のみ。正式Fable P3-3-Q15-5裁定、確定案i) |
| 貴金属(tier3) | **最上位**(全軸で最良) | **カーボン・銀黒鉛より劣る**(高電流ペナルティにより逆転) |

**最小較正自由度の優先(Suu_mot3指摘への対応)**: 一次資料のない5値×4素材(20値)を一気に発明せず、**カーボンを中立anchor(全比率1.0)に固定**し、他3素材は自身の定性descriptionに直接対応する軸だけを動かす: 銅板は`contactResistanceRatio`・`wearRateRatio`のみ悪化(「摩耗大」の記述に対応)、銀黒鉛は`contactResistanceRatio`のみ改善(「低接触抵抗」の記述に対応)、貴金属は`contactResistanceRatio`・`wearRateRatio`・`chatterProbabilityRatio`を改善しつつ高電流ペナルティ(閾値・倍率)の2値だけを新規に持つ(「大電流で急速に荒れる」の記述に対応)。これにより実質的な**設計自由度**(独立に決めた軸の数、実際にコードへ書いた具体値の個数とは別の指標——後者は15.5節Q15-1で8個と実測済み)は先発3素材分の3値+貴金属の交差用2値=**5値程度**まで削減できる。

**正式Fable P3-3-Q15-5裁定(確定、2026-08-10)**: 案(i)——上表を「銀黒鉛の高電流域は摩耗率でカーボンと同値、優位は低接触抵抗のみ」へ精密化する側で確定した。spec/materials.ts原文が摩耗優位を記述していない以上、`brushWearRateRatio<1`を写像する案(ii)は物性の発明にあたり不採用。正式Fableの条件付き承認(2026-08-09)における「値を1つも発明していない」という評価は、この案(i)の解釈を前提としていたことがここで確定した(15.5節参照)。

### 6.4 recipeCode.tsへの追従・MaterialSelectionの拡張(P15・P16是正、正式Fable裁定確定P3-3-Q10)

**recipeCode.tsへの追従(P15是正、v3で行番号・関数名を再実査し訂正)**: `wireResistivityRatio`等はrecipeCode.tsのMC3ペイロードへ`wr`/`wz`/`br`/`bc`として既に明示的にエンコード・デコードされている。実際の該当箇所は以下**5箇所**(いずれも`rg`で確認済み、関数名はv2の「`normalizeMotorFieldsFromRecord`」という誤記から実名`normalizeMotorFields`へ訂正する):
1. `RECIPE_M_FIELD_KEYS`(57〜59行目)——重複キー検査用の権威的キー配列。フィールド追加時に必ず追記する(recipeCode.test.tsのドリフト検査対象)。
2. `RecipePayloadV2['m']`/`RecipePayloadV3['m']`型定義(63〜72行目)。
3. `normalizeMotorFields`(186〜212行目、`numAt(m, 'wr', 1)`等のfallback付き読み取り)。
4. `motorConfigToFields`(237〜253行目、`wr: motor.wireResistivityRatio ?? 1`等)。
5. `encodeRecipe`内の`RecipePayloadV3`組み立てリテラル(296〜311行目、`motorConfigToFields`の出力を`normalizeMotorFields`で再正規化した後、`m: {...}`へ手動で再列挙する箇所——`motorConfigToFields`とは別の独立したリテラルサイトである点に注意)。

加えて`src/engine/__tests__/recipeCode.test.ts`の`fullMotorConfig()`ヘルパー(21行目)は`RECIPE_M_FIELD_KEYS.length`との集合一致をドリフト検査で強制している(505・535・559・562行目)ため、新規キー追加時はこのヘルパーとテストの期待値集合も追従が必要(**6箇所目**)。

6.2節1の`brushContactResistanceRatio`・`brushChatterProbabilityRatio`は同じ「素材由来base値」であるため、**上記6箇所すべてへ新規キー(例: `bcr`=brushContactResistanceRatio、`bpr`=brushChatterProbabilityRatio)を追加する**契約変更が必要。`numAt(..., fallback:1)`という既存の総称的フォールバック機構により、旧バージョンのレシピコード(これらのキーを持たない)をデコードしても既定値1.0が補われるため、**MC3の版番号(`PREFIX_V3`)自体を上げる必要はない**(wr/wz/br/bc追加時にMC2→MC3の版上げが行われた前例はあるが、当時は`numAt`のフォールバック機構自体が新設された節目であり、機構が既に存在する今回は単純なキー追加で後方互換を保てる)。**この版上げ要否の判断自体もFable確認事項に含める。**

**単一出典の監査(P33是正)**: `brushId`から`mapBrushRatios`で写像した比率(数値)と、その数値がrecipeCode(`bcr`/`bpr`)へ保存されるという2つの経路が並存すると、一見「素材ID」と「派生比率」という同じ構成事実の二重入力に見える。しかし実査の結果、これは**brushに限らない、wire/magnet/batteryで既に存在する既存アーキテクチャそのもの**であることを確認した——`recipeCode.ts`(`CarRecipe`型、88行目〜)は`wireId`/`magnetId`/`batteryId`/`brushId`のような素材ID自体を一切エンコードしない。エンコードされるのは常に`composeConfigFromMaterials`の**出力**である派生済み数値(`wireResistivityRatio`等)のみであり、その数値がどの素材選択に由来したかという情報はrecipeCodeの往復では保持されない。さらに`materialMapping.ts`(540行目のコメント)が明示するとおり、`coilTurns`・`magnetDistanceMm`・`brushPressure`等は「player-adjustable値」として`composeConfigFromMaterials`の出力後もプレイヤーが独立に調整でき、素材選択との対応関係を維持する仕組みは元から存在しない。**したがって権威は常に「その時点のMotorConfigの数値そのもの」であり、`MaterialSelection`(brushId等)はcompose時点の入力にすぎず、事後の同期・整合性維持の対象ではない**(P3-1-Q9の「RunSnapshotの`config`が唯一の走行入力出典」という原則とも整合する——RunSnapshotは`MotorConfig`の数値のみを保持し、`MaterialSelection`自体を保持・参照しない)。**結論**: 新規の二重入力防止バリデータは追加しない(brush固有の新しいリスクではなく、P2で既に受容済みの既存設計の帰結であることをFableへ確認する)。

**正式Fable裁定で確定済み(P3-3-Q10)**: 上記の単一出典解釈(brush固有のバリデータは不要、既存wire/magnet/battery設計と同型)も含めて承認済み。

**`effectiveTurnsRatio`との区別**: 5.3節の`effectiveTurnsRatio`はD01(破壊状態)が`composeEffectiveMotorConfig`で**実行時に合成する値**であり、D04の`batteryInternalResistanceRatio`合成後の値や、D07の`magnetStrength`合成後の値が一度もrecipeCodeへ書き戻されないのと同じ理由で、**recipeCode.tsへの追従は不要**(baseのMotorConfigはrecipeが表す「無傷の初期状態」であり、破壊による実行時の変化は再現性〈同一seedからの再計算〉で扱う、既存D04/D07と同型の層分離)。

**`MaterialSelection`の拡張(P16是正)**: `rg`実測(0.5節#14)により、`MaterialSelection`型の消費者は`src/materials/materialMapping.ts`(型定義・`composeConfigFromMaterials`)と`src/materials/__tests__/materialMapping.test.ts`(fixture)の**2ファイルのみ**(`scripts/materialSweep.ts`はsweepツールでありfixture更新が必要だが本体の契約には含めない)。既存`batteryId: BatteryMaterialId`が必須フィールドとして追加されている前例(0.5節#14)に倣い、**`brushId: BrushMaterialId`を必須フィールドとして`MaterialSelection`へ追加し、`composeConfigFromMaterials`の型追加と実消費(6.2節のMotorConfig層2フィールドの populate)+既存fixture・scripts/materialSweep.tsの全追従を、単一の**ゲート2(materialMappingゲート、13節)**で同時に実施する**(型だけ先に追加して消費・fixture追従を後回しにしない、既存前例どおり。P40是正: v4はこの原則を書きながらゲート表では型をゲート1・消費をゲート2に分離してしまっており、13節で実際にゲート2へ統合した)。production-valid fixtureのbrush出典は、既存の`pvMotorCar`(materialMapping.test.ts)ヘルパーが`MaterialSelection`を組み立てる箇所すべてへ`brushId`を追加することで確定する(このヘルパーの呼び出し箇所は既存`rg`実測〈14.2節〉で網羅する)。

**正式Fable裁定(確定P3-3-Q10)**: 3点すべて承認する。`bcr`/`bpr`キー追加(6箇所+ドリフト検査の事前列挙は正確)、MC3版上げ不要(`numAt`フォールバック機構が既存であり、旧レシピはブラシ比率1.0=カーボンanchor=Phase 2物理の暗黙ブラシとして意味論的にも正しく復元される)、`brushId`必須化(`batteryId`前例)。単一出典監査の結論(brush固有の二重入力バリデータ不要——素材IDを符号化せず派生数値のみを権威とする既存アーキテクチャの帰結)も確認する。

### 6.5 恒久摩耗(`brush.wearFraction`)の次run反映(P23是正、正式Fable裁定確定P3-3-Q11)

**問題**: `WearState`の`kind:'brush'`(0.5節・`inventoryItem.ts`41行目)へ`applyBrushDiff`(`degradationApplication.ts`29〜31行目)が加算する`wearFraction`は恒久ダメージとしてアイテム個体に蓄積されるが、これを**次のrunで実際にどう物理へ反映するか**——具体的には摩耗が進んだブラシ個体を装備した状態で`composeConfigFromMaterials`が呼ばれたとき、6.2節1のMotorConfig層(`brushContactResistanceRatio`等)へどう畳み込むか——は、本書のどの節にも定義がない。

**実査結果**: `composeConfigFromMaterials`(materialMapping.ts、317行目〜)の現行シグネチャは`MaterialSelection`(素材IDの組のみ)を入力とし、個体の`WearState`(摩耗量)を一切受け取らない。既存のD04(電池)・D07(磁石)についても同様で、`composeConfigFromMaterials`は常に「無傷の新品」相当のbase値のみを返し、個体差(摩耗)を実行時にconfigへ畳み込む経路はP3-3時点のcodebaseに一つも存在しない——これはD04/D07についても未着手のまま据え置かれている一般的なギャップであり、D05のブラシ摩耗に限った新規の欠落ではない。

**裁定(P3-0-Q2の境界に従う)**: 「摩耗した個体をロードアウトとして選び、その摩耗量をbase configへ反映する」処理は、プレイヤーの手持ちinventoryから実際にアイテムを選んでrunを構成する**gameStore.tsの実配線**そのものであり、P3-0-Q2が定義する「gameStore.ts実配線・実プレイでの発動」に該当する(1.2節)。D04/D07で既に据え置かれているのと同じ理由により、**P3-3では実装しない**。`composeConfigFromMaterials`は引き続き`MaterialSelection`(素材IDの組)のみを入力とし、個体の`WearState`を受け取る新規引数は追加しない(motorPhysics.ts/materialMapping.tsどちらも無改修)。

**silent gapにしないための明示措置**: この項目をP3-4への named DoD として以下のとおり明記しておく——「P3-4: 摩耗済み個体(`WearState.kind:'brush'`の`wearFraction`)をロードアウトへ選択した際、`brushContactResistanceRatio`等のbase値へその摩耗分を反映する経路(`composeConfigFromMaterials`拡張、または呼び出し側でのconfig後処理のいずれか)を設計・実装する。D04(電池劣化)・D07(磁石劣化)も同一ギャップを抱えており、P3-4ではD02/D04/D05/D07の恒久摩耗すべてを横断する単一の設計(個体差反映の共通経路)として扱うことが望ましい」。P3-3のDoD(12節)には、この項目が**未実装のまま据え置かれている**ことをテストコメントまたはdocsコメントで明示する作業のみを含める(実装は含めない)。

**正式Fable裁定(確定P3-3-Q11)**: P3-4据え置きを承認する。個体`WearState`→base config反映はgameStore実配線そのものでP3-0-Q2の境界内、かつD04/D07も同一ギャップを抱える以上、P3-4で「D02/D04/D05/D07横断の個体差反映共通経路」を第一級の設計節として扱う方針も承認する(named DoDの明示措置込み)。

**P3-4申し送り追加項目(付帯条件、Fable指示)**: loadout検証で`RotorAssemblyState.collapsed===true`の個体の装備を拒否すること——spec §7.1.1「サルベージのみ可」の**執行点**が、現行計画のどこにも定義されていない(D01崩壊済みのロータは崩壊状態のまま次runへ装備できてはならず、サルベージ〈素材分解〉のみが許される、という規約自体はspecに存在するが、それを実際にどこで「拒否」として実装するかが未定義だった)。上記の`brush.wearFraction`と同じ「P3-4 gameStore実配線」の境界に該当するため、named DoDとして同じ段落へ追加する: 「P3-4: loadout構成時(ロードアウト画面でのアイテム選択・run開始直前のいずれか)に`RotorAssemblyState.collapsed===true`の個体を検出し、装備選択から拒否する(サルベージ導線のみへ誘導する)検証を実装する」。

---

## 7. D05の一時接触抵抗悪化(P4是正+可観測性、Fable確定裁定事項P3-3-Q7)

### 7.1 問題(P4+可観測性追加指摘)

spec §7.1.1はD05を「スパーク中は接触抵抗が一時悪化、摩耗加速」と定める。しかし0.4節#8のとおり、**チャタリング中は`current`が完全に0へ強制される**ため、同一stepで接触抵抗倍率を上げても`current`/`tMag`には反映されない(観測不能)。理論電流の算出側を下げる設計にすると、`excessCurrentA`(4.1節)が縮み`cumulativeSparkExposure`自体が小さくなる逆向き作用になりかねない。`composeEffectiveMotorConfig`はphysics step**前**に呼ばれるため、同stepのRNG結果(このstep実際にチャタリングするか)を予知できない——D04のswelling/smokingが「前stepの状態を次stepのconfigへ反映する」のと同じ時系列上の制約がある。

### 7.2 候補

**候補(a)(推奨)——回復区間モデル**: `D05Progress`へ`recoveryFramesLeft: number`(0で非アクティブ)を追加する。**バースト終了検出(P19是正)**: `advanceD05`は`frame`(単一の平坦な構造体)しか受け取らずprev/next生stateへ直接アクセスできないため、「バーストの最終step」は**既存/計画済みの2フィールドの組合せ**で判定する——`frame.isChatteringThisFrame === true`(このstepはチャタリングだった)**かつ**`frame.chatterFramesLeft === 0`(次stepへ持ち越すバースト残りフレームが0、=このバーストはこのstepで終わる)。この組合せだけで判定可能なため、**新規フィールド`burstEndedThisFrame`は追加しない**(既存4.2節の`isChatteringThisFrame`+既存`chatterFramesLeft`で足りる)。

バースト最終stepを検出した`advanceD05`呼び出しは、`D05Progress.recoveryFramesLeft`を`config.d05.recoveryFrames: number`(**P31是正で新規命名確定**、非負整数、較正値候補、11.1節)へ設定する。以後の各stepで`recoveryFramesLeft > 0`の間、`composeEffectiveMotorConfig`が`brushContactResistanceRatio`(6.2節)へ`config.d05.recoveryContactResistanceMultiplier: number`(**P31是正で新規命名確定**、`>= 1`必須、`highCurrentPenalty`のthresholdPenalty枝の`highCurrentPenaltyMultiplier`〈`> 1`厳密、正式Fable P3-3-Q15-4裁定〉と同じ「悪化方向のみ許可」規律)を乗算し、`advanceD05`が`recoveryFramesLeft`を1ずつ減算する。**時系列**: stepNでバースト終了検出→`D05Progress.recoveryFramesLeft`設定→stepN+1のconfig合成(回復区間の倍率適用、このときは`isChatteringThisFrame===false`で実電流が流れるため効果が観測可能)→stepN+1の`advanceD05`が`recoveryFramesLeft`を減算。

**回復期間中の新規バースト優先規則(P19是正)**: 回復区間中(`recoveryFramesLeft > 0`)に新しいチャタリングバーストが始まった場合(`frame.isChatteringThisFrame`が再び`true`になる)、**新規バーストを優先し`recoveryFramesLeft`を直ちに0へリセットする**(チャタリング中は4.1節の完全瞬断が観測上優先されるため、回復区間の抵抗倍率と同時適用しても意味を持たない。新規バーストが再度終了した時点で`recoveryFramesLeft`を`config.d05.recoveryFrames`へ再設定する、という単純な「毎回リセットして最新のバースト終了からの回復期間だけを数える」規則にする)。

**初回step・継続stepの境界テスト**: 回復区間開始step(バースト終了検出の直後step)で正しく倍率が適用されること、回復区間最終step(`recoveryFramesLeft===1`から`0`への遷移)の次からは通常抵抗へ戻ること、回復区間中に新規バーストが始まった場合に`recoveryFramesLeft`が即座に0へリセットされることを固定する。

**no-op値の扱い(P41是正)**: `recoveryFrames`の値域(非負整数)は`0`を許し、`recoveryContactResistanceMultiplier`の値域(`>= 1`)は`1`を許す——この2値の組み合わせ(`recoveryFrames=0`または`multiplier=1`)は、候補(a)を採用したにもかかわらず一時抵抗悪化が実質的に無効化される「no-op構成」であり、11.2節の値域validatorだけではこれを拒否できない。**是正方針**: validator自体は他の`d05`較正値(`brushWearRateRatio`等)と同じ「物理的に逆向きの値だけを拒否する」規律(値域は`0`/`1`を許容したまま)を維持し、代わりに**production向け較正値がno-opでないことをsweep受け入れ条件(DoD)として明示的に要求する**——D02のM4型sweep受け入れ条件(3.4節)と同型のパターンで、候補(a)採用後の較正済みproduction-valid構成では`recoveryFrames >= 1`かつ`recoveryContactResistanceMultiplier > 1`が実際に成立していることを固定するテストを追加する(validator側での一律禁止ではなく、production較正値に対する受け入れ条件として要求する——将来「意図的に極めて軽微な効果にする」という設計判断がありうるため、型・validatorレベルでの一律禁止は柔軟性を失わせすぎると判断した)。

**復元上限のcross-validator(P41是正)**: `restoreRunSnapshot`(destructionOrchestration.ts 779行目〜)は`initialDestructionState`(853〜854行目)と`destructionConfig`(789行目付近)の両方を同一関数内で検証済みの状態に持つ——これは5.3節・P3-3-Q12で`effectiveTurnsRatio`のbase制約を追加したのと同じ箇所である。この箇所へ、候補(a)採用時の追加cross-validator`initialDestructionState.modes.D05.recoveryFramesLeft <= destructionConfig.d05.recoveryFrames`を新設する(復元された`recoveryFramesLeft`が対応するconfigの上限を超えないことを保証する)。これがないと、破損・改竄されたlocalStorageデータから任意に大きな`recoveryFramesLeft`を持つsnapshotを復元でき、configの較正値によらない任意長の接触抵抗悪化が発生しうる。

**候補(b)——完全瞬断モデルによる簡約の明文化**: 現行の完全瞬断(`current=0`)自体を接触抵抗∞の極限表現とみなし、追加の倍率を一切設けない。**この解釈(「spec §7.1.1のスパーク中の接触抵抗一時悪化は、既存の完全瞬断モデルによって既に表現されている」)を正式裁定として明記する必要がある**(spec文言の解釈確定を伴うため)。観測不能な倍率を追加しないという安全側の利点がある一方、「悪化」ではなく「途絶」であるという字義との乖離が残る。

**候補(c)——motorPhysicsのチャタリングモデル自体を有限高抵抗へ変更**: `current=0`の代わりに、チャタリング中は`rContact`を大きな有限値に置き換える設計。エンジン凍結への影響・既存回帰(`motorPhysics.test.ts`の瞬断関連テスト)への影響が候補(a)(b)より大きい。**非推奨**(既存の「チャタリング=完全瞬断」という凍結済みモデルの意味自体を変えるため)。

**正式Fable裁定(確定P3-3-Q7、spec解釈の確定を含む)**: 候補(a)回復区間モデルを裁定し、あわせてspec解釈を確定する。「スパーク中の接触抵抗一時悪化」のうち、**スパーク(瞬断)中の悪化は既存の完全瞬断=抵抗∞の極限が既に包含しており**、観測可能な有限の悪化は**アーク後の接触面荒れによる直後回復区間**として実装する——これは実在物理(アーク放電後の接触面酸化・荒損)であり、字義の拡張ではなく機構の正しい所在の特定である。新規バースト優先リセット・no-op防止sweep条件(P41)・`recoveryFramesLeft <= recoveryFrames`のcross-validator(P41——破損localStorageからの任意長悪化の防止)いずれも承認する。

---

## 8. events固定順序・P3-0-Q6ホワイトリスト拡張(P37是正: D05の非event駆動diffを明文化)

`advanceDestructionState`のホワイトリストへD02・D05を追加する。同一ゲート内で`deriveDegradationDiffs`のD02(`{role:'rotor', kind:'burnout'}`)・D05(`{role:'brush', kind:'wear', deltaFraction}`、4.4節の`cumulativeWearDeltaFraction`基準)拡張を実装する。

**events固定順序(再掲)**: D01→D02→[D03またはD04]→D05→D06→D07→D09。P3-3時点で実際に発火しうる部分列はD01→D02→[D03またはD04]→D05→D07。

**D05のdiff換算は`events`ではなく`finalDestructionState`から読む(P37是正、重要な設計上の分岐点)**: 現行`deriveDegradationDiffs(events, _finalDestructionState)`(destructionOrchestration.ts 147行目)は、第2引数`_finalDestructionState`にアンダースコアが付いた**未使用**引数であり、D04(`event.bodyScorchDeltaFraction`)・D07(`event.demagnetizationDeltaFraction`、176〜180行目)を含む既存の全diffはすべて**`events`配列をループし、各eventへ埋め込み済みの値を読む**という統一パターンに従っている(134〜138行目のコメントで明示された設計)。**D05はこのパターンに従えない**——4.1節の`cumulativeSparkExposure`・4.4節の`cumulativeWearDeltaFraction`は「episode閾値を一度も超えなかった軽微なスパーク活動」でも蓄積されうる連続量であり、そもそも一度もD05 eventが発行されない(0件の)runでも正の摩耗を生みうる(4.3節・4.4節のDoD「event 0件でもdiffが出る正例」)。eventが0件ならば`events`配列にD05由来の値を埋め込む場所自体が存在しないため、**D05は`deriveDegradationDiffs`が唯一`_finalDestructionState`引数を実際に使用する(アンダースコアを外し`finalDestructionState`へ改名する)モードになる**——`finalDestructionState.modes.D05.cumulativeWearDeltaFraction`を直接読む。これは公開シグネチャの変更ではなく(引数自体は元から存在する)、既存の未使用引数を初めて使用する変更である。

**P3-0-Q6ホワイトリスト不変条件との整合(P37是正)**: P3-0-Q6裁定の不変条件は「`advanceDestructionState`は差分換算が実装済みのモードのイベントしか発行してはならない」(134〜142行目のコメント)であり、これは「diffがeventの個数に比例する」ことを要求するものではない——D05はイベントを引き続きホワイトリストどおり発行する(episode成立時のみ、演出・図鑑登録目的、4.3節)が、**diffの実際の換算元は`events`ではなく`finalDestructionState`である**という非対称性がP3-0-Q6の不変条件に違反しないことを、この段落で明示的に確認する。**ホワイトリスト構造テスト(必須DoD)**: D05のevent発行有無に関わらず(0件・1件・複数件のいずれでも)`deriveDegradationDiffs`が`finalDestructionState`の値から一貫してdiffを算出することを、`events`配列の中身を差し替えた複数fixtureで固定する(eventの個数を変えてもdiff算出ロジック自体は`events`の中身を一切参照しないことを確認する)。**store fixtureテスト(必須DoD、12.2節・12.3節へ追加)**: event 0件・`cumulativeWearDeltaFraction`正、という具体的なproduction-valid構成を1つ用意し、`RunOutcome.degradationDiffs`に正しくbrush wear diffが現れることをstore統合テストとして固定する。

---

## 9. dt分割不変性(D05 duration境界)

D05の`sparkDurationS`境界判定は`DURATION_COMPARISON_EPSILON_S`(export済み)をそのまま再利用する。dt分割不変性テスト(固定dt=1/120s、1step×2Nフレーム対2step×Nフレームのバッチング比較)をD05の`sparkDurationS`境界へ適用する。

---

## 10. C5負例

- **D02発煙のみ**: `coilHeatGaugeRatio`が`smokeGaugeThreshold`には到達するが`coilOverheatGaugeLimit`には未到達の入力で、`terminalModeCandidates`が増えないことを固定する。
- **D05は非終端モードそのもの**: `classifyTerminalModes`にD05の分岐が存在しないという分類規則レベルの事実——D05由来のいかなるevent(episode成立・境界値)を与えても`terminalModeCandidates`へ一切追加されないことを負例テストで固定する。

---

## 11. 較正値候補一覧+validator交差不変条件(P11是正)

### 11.1 較正値候補(値は本書で確定しない、sweep対象)

| 候補値 | 対象 | 状態 |
|---|---|---|
| `d02.conductionScale`・`d02.dissipationCoefficient`・`d02.smokeResistanceMultiplier` | D02熱ゲージ・発煙抵抗倍率 | 未確定、sweep対象。**`smokeResistanceMultiplier >= 1`必須(11.2節)**。**P44是正: 発煙後に熱蓄積が実際に加速するか否かは正のフィードバックとして断定せず、production-valid構成のsweepで実測して報告する(3.1節)** |
| `d05.brushSparkDurationLimitS`(**0.2秒=CHATTER_BURST_FRAMES/120以下必須**、4.3節)・`d05.brushSparkCurrentThresholdA` | D05 episode成立閾値 | 未確定、sweep対象 |
| `d05.brushWearRateRatio`・`d05.highCurrentPenalty`(判別union、正式Fable P3-3-Q15-4裁定、thresholdPenalty枝のthresholdA/multiplierのみ数値、ブラシ素材ごと)・`d05.wearPerAmpSecond`(素材非依存の共通較正値) | D05恒久摩耗換算(4.4節、A·s→wearFraction変換を含め全て`wearPerAmpSecond`一本へ統合済み——**P25是正: v2時点で残っていた「A·s(重み付き)→wearFraction変換係数」という旧命名の重複行をここに統合し削除**) | ratio類6個・高電流ペナルティ2個の具体値8個は正式Fable P3-3-Q15-2・Q15-3裁定により暫定候補値として承認済み(15.5節)、確定はGate5のsweep受け入れ条件を経る |
| `d01.decayExposureScaleRad`(有限正)・`d01.minEffectiveTurnsRatio`(`0 < x <= 1`、P34是正で新規命名確定) | D01漸減の劣化曲線+進行下限 | 未確定、sweep対象 |
| `d05.recoveryFrames`(非負整数)・`d05.recoveryContactResistanceMultiplier`(**P31是正で新規命名確定**、`>= 1`必須)(Q7確定) | D05一時抵抗悪化(7節) | 未確定、sweep対象 |
| `brushContactResistanceRatio`・`brushChatterProbabilityRatio`(ブラシ素材ごと) | ブラシMotorConfig層 | 未確定、sweep対象 |

### 11.2 validator交差不変条件(P20是正、候補別に完全列挙)

**`DestructionConfig.d02`の値域**: `0 < smokeGaugeThreshold < coilOverheatGaugeLimit <= 1`、`conductionScale`/`dissipationCoefficient`は有限正、`smokeResistanceMultiplier >= 1`(発煙で抵抗が改善する逆向き物理を拒否、Suu_mot3ゲート1レビューの`internalResistanceDegradationMultiplier`負例と同型)。`coilHeatGaugeRatio`(state側)は常に`[0,1]`clamp(既存D07と同型の構造的保証)。

**`DestructionConfig.d05`の値域**: `brushSparkDurationLimitS`は有限正**かつ`<= CHATTER_BURST_FRAMES / 120`(0.4節#12の到達可能性制約、4.3節)**、`brushSparkCurrentThresholdA`は有限正、`brushWearRateRatio`/`wearPerAmpSecond`は有限正。**`highCurrentPenalty`(正式Fable P3-3-Q15-4裁定、確定候補ii判別union、15.5節)は`kind==='noPenalty'`なら検証対象フィールドなし、`kind==='thresholdPenalty'`なら`highCurrentPenaltyThresholdA`が有限正・`highCurrentPenaltyMultiplier`が`> 1`厳密(`>= 1`ではない——multiplier===1のthresholdPenaltyはnoPenaltyの重複表現になるため不可、付帯条件a)。** **`recoveryFrames`(Q7確定、P31是正で新規追加)は非負整数、`recoveryContactResistanceMultiplier`(Q7確定、P31是正で新規追加)は`>= 1`必須(同じく悪化方向のみ許可)。** **`brushChatterProbabilityRatio`(6.2節、MotorConfig層)は、既存`nextChatterState`の確率式`prob = CHATTER_MAX_PROB × (CHATTER_PRESSURE_THRESHOLD − brushPressure) / CHATTER_PRESSURE_THRESHOLD`へ乗算されるため、`prob × brushChatterProbabilityRatio`が`[0,1]`を超えないことを較正値の受け入れ条件に含める**(素材比率と既存プレイヤー軸の組み合わせでも確率が1を超える構成を許さない、11.1節の較正候補一覧へ追記)。**加えてP35是正: 較正値の受け入れ条件だけに頼らず、`nextChatterState`実装自体が最終`prob`を`[0,1]`へclampする(構造的な安全網、既存`coilHeatGaugeRatio`の`[0,1]`clampと同じ二重防御の規律——較正値バリデータは「意図した設計を外れた較正値」を拒否する一次防御、実装側clampは「player-adjustable値〈brushPressure〉との組み合わせで想定外の値になった場合」への二次防御として役割が異なる)。**このclamp追加も`motorPhysics.ts`の`nextChatterState`改修に含める(既存回帰49件への影響を14.2節のとおり確認する)。

**D01の新規Progressフィールド(P34是正で field名確定)**: `decayExposureRad`(5.2節)は有限非負(負の進行量を拒否)、`triggered===false`の間は`0`固定(交差不変条件: `triggered===false` ⟹ `decayExposureRad===0`)。**`DestructionConfig.d01`の値域(新規セクション)**: `decayExposureScaleRad`は有限正、`minEffectiveTurnsRatio`は`0 < x <= 1`。

**D05Progress(4.1節・4.3節・4.4節・7.2節)**: `episodeCount`は非負整数。`sparkDurationS`・`cumulativeSparkExposure`・`cumulativeWearDeltaFraction`はいずれも有限非負。`recoveryFramesLeft`(Q7確定)は非負整数。**config横断のcross-validator(P41是正、`restoreRunSnapshot`779行目〜で実施、5.3節のeffectiveTurnsRatio base制約と同じ箇所)**: `recoveryFramesLeft <= destructionConfig.d05.recoveryFrames`(復元された残余フレーム数がconfigの上限を超えないことを保証、7.2節)。**交差不変条件は3条件の同値関係+1条件の片方向含意**(D04のような単純な`iff`1本ではない——`episodeTriggered`は非アクティブ区間で`false`へ再武装するが`causeLog`は最初のepisode以降`null`に戻らないため、`episodeTriggered`単体を`causeLog`の有無と同値にはできない):
1. `episodeCount === 0` ⟺ `firstEpisodeAtT === null` ⟺ `causeLog === null`(3条件の同値、セッション中一度もepisodeが成立していない状態の表現)。
2. `episodeTriggered === true` ⟹ `episodeCount >= 1`(片方向の含意——逆〈`episodeCount>=1`だからといって`episodeTriggered`が今`true`とは限らない、非アクティブ区間で再武装済みの可能性があるため)。

**D02Progress(P30是正: 既存フィールドを含めた完全な不変条件として自己完結化、3.5節の候補別差分も含む)**: 現行`validateD02ProgressShape`(destructionOrchestration.ts 601〜608行目)は形状検証のみで、D04(616〜632行目)と異なり`triggered`と`causeLog`の交差不変条件を一切検証していない(実コード確認済み、これ自体が既存のギャップだが、D02はP3-0/P3-1で導入済みの型でありP3-3では新規フィールド追加時にまとめて是正する)。P3-3で以下を完全形として実装する:
1. **未発火3値のnull同値(新規)**: `triggered === false` ⟺ `triggeredAtT === null` ⟺ `causeLog === null`(D04の`stage==='none' ⟺ initiatingCauseLog===null`と同型の3値同値、現行未実装のため新規追加)。
2. **発火時の非null(新規)**: 上記1の対偶として`triggered === true` ⟹ `triggeredAtT`が有限数 ∧ `causeLog`が非null(1と合わせて実質的に`triggered ⟺ causeLog非null`の同値になる)。
3. **`causeLog`の深部型検証(既存維持)**: `causeLog !== null`ならば`validateD02CauseLogShape`(559行目、既存)による深部検証を実施(現行どおり、変更なし)。
4. **候補別追加(3.5節)**:
   - 候補(a)完全可逆: 新規フィールドを追加しないため上記1〜3のみ(既存`coilHeatGaugeRatio`は`[0,1]`clampの構造的保証のみ追加)。
   - 候補(b)不可逆latch・候補(c)表示可逆+損傷latch(いずれも`smokingStarted`/`smokingStartedAtT`を追加、`initiatingCauseLog`相当は3.5節のP30是正により追加しないと確定済み): `smokingStarted === false` ⟺ `smokingStartedAtT === null`(D04の`stage==='none' ⟺ initiatingCauseLog===null`と同型の同値関係)。さらに`triggered === true`(発火到達)⟹`smokingStarted === true`(発火は必ず発煙を経由する、`coilOverheatGaugeLimit > smokeGaugeThreshold`という値域制約〈上記〉と整合する片方向含意)。

**DoD追加**: 上記交差不変条件のうち採用される候補分すべてに違反する破損localStorage相当の負例テスト(P3-0期の他モードと同型の`corrupted`判定テスト)。

### 11.3 較正値の出典・`DestructionConfig`統合境界(P26是正)

**D02較正値(`conductionScale`・`dissipationCoefficient`・`smokeResistanceMultiplier`)の出典**: これらは`mapXxx`のような素材由来写像関数を持たない——D02は「コイル自体の熱容量・放熱特性」という**素材非依存のモード固有較正値**であり、D07の`magnetStrength`(素材ごとに変わる)とは性質が異なる(3.1節冒頭で確認済みの区別)。D03のアルカリ/NiMH単一較正値と同じ規律で、11.1節のsweep結果を`DestructionConfig.d02`の**単一の固定値**として直接較正し、素材選択に応じて分岐する関数は新設しない。

**現状確認(`rg`実測)**: `src/`配下に`DEFAULT_DESTRUCTION_CONFIG`のような**production向け`DestructionConfig`の既定値オブジェクトは、D02/D05に限らずD01〜D09のいずれについても現時点で一つも存在しない**(`rg -n "DEFAULT_DESTRUCTION_CONFIG|defaultDestructionConfig"`→ヒットなし)。これはP3-0-Q2裁定(production向け`DestructionConfig`の実配線はP3-4まで行わない)の帰結であり、D02/D05に固有のギャップではない。したがってP3-3時点でD02較正値が満たすべき「provenance」は、**14.2節で確定した6ファイルのテストfixture値+本書11.1節のsweep候補一覧**の2つのみであり、production defaultsオブジェクトへの反映はP3-4のスコープとして明示的に据え置く(6.5節のWearState反映と同じ境界)。

**`mapD05BrushWearConfig`の出力が完全な`DestructionConfig.d05`へ統合される経路(P36是正: 単一構築経路を確定)**: `composeConfigFromMaterials`(materialMapping.ts 317行目〜)は現行、`{motorConfig, carConfig}`のみを返し`DestructionConfig`には一切関与しない(実装確認済み)。したがって`mapD05BrushWearConfig`(ブラシ素材ごとの`brushWearRateRatio`・`highCurrentPenalty`判別unionを返す、正式Fable P3-3-Q15-4裁定)の出力は、**`composeConfigFromMaterials`の戻り値には含めない**。この出力(素材依存の2フィールド)と`DestructionConfig.d05`の素材非依存の共通部分(`brushSparkDurationLimitS`・`brushSparkCurrentThresholdA`・`wearPerAmpSecond`、6.5節・11.1節)を合成する経路について、以下2案を比較する:

- **候補(a)——呼び出し側での任意のオブジェクトスプレッド**: 各呼び出し側(P3-3のproduction-valid fixture、P3-4のgameStore.ts)がその都度`{ ...commonPart, ...materialPart }`を書く。**欠陥(P36指摘)**: 呼び出し箇所が複数(fixture・将来のgameStore.ts)に分散すると、`DestructionConfig.d05`へ将来フィールドを追加した際にどこかのスプレッド箇所だけ追従を忘れても、TypeScriptの構造的型付けにより`{ ...a, ...b }`という式は代入先変数の型注釈がない限り欠落を検出できない(6.4節で確認した`recipeCode.ts`の教訓——重複キーや欠落キーを静かに畳み込んでしまう問題と同型のリスク)。
- **候補(b)(確定)——`mapD05BrushWearConfig`と対になる`assembleD05Config`純関数を`materialMapping.ts`へ新設**: シグネチャを`assembleD05Config(materialPart: ReturnType<typeof mapD05BrushWearConfig>, commonPart: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number; wearPerAmpSecond: number; recoveryFrames: number; recoveryContactResistanceMultiplier: number }): DestructionConfig['d05']`のように**明示的な戻り値型注釈**を持たせる(**P42是正、Q7裁定確定〈候補a〉により`commonPart`の完全型が確定**: `recoveryFrames`・`recoveryContactResistanceMultiplier`〈P31是正で命名確定〉を含む完成版`DestructionConfig['d05']`全フィールドと一致させる)。TypeScriptは関数の戻り値位置のオブジェクトリテラルを宣言済み戻り値型と照合するため、`DestructionConfig.d05`へ新規必須フィールドを追加すれば、この関数の`return { ...materialPart, ...commonPart }`が型検査エラーになり**コンパイル時に自動検出される**(`recipeCode.ts`の`RECIPE_M_FIELD_KEYS`のような別建ての実行時ドリフト検査を新設する必要がない、型注釈自体がドリフト検査を兼ねる)。構築経路が単一関数に集約されるため、呼び出し側(fixture・将来のgameStore.ts)は常にこの関数を経由し、独自にスプレッドを書かない。

**正式Fable裁定(確定P3-3-Q13)**: 候補(b)を裁定する。戻り値型注釈によるコンパイル時ドリフト検出は実行時配列検査より優れ、Q7裁定(候補a確定)により`commonPart`の完全型は`recoveryFrames`・`recoveryContactResistanceMultiplier`込みで確定する(Q7→Q13の順序関係の明示も正しい)。

---

## 12. DoD一覧(11節までの内容を集約)

### 12.1 状態機械・判定ロジック

- `advanceD02`/`advanceD05`の全分岐(4.1節の状態遷移表どおり)。
- `composeEffectiveMotorConfig`のD01/D02/D05分岐の合成直交性(3.2節)。
- D05チャタリング境界是正(4.2節)+境界テスト。
- dt分割不変性(9節)。
- 予算不変性テストの再実行(5.4節)。
- D01停止時ゼロの負例(5.2節)。
- D01二重計上防止(5.3節)。
- D01単調性・clamp DoD(`effectiveTurnsRatio`が`minEffectiveTurnsRatio`を下回らないこと、5.3節)。
- `brushChatterProbabilityRatio`適用後の`prob`が`[0,1]`へclampされること(P35是正、6.2節・11.2節)。

### 12.2 events契約・終端判定

- events固定順序、`isFirstThisSession`/二重発行防止、`causeLog`初回固定(D05は「Progress.causeLogのみ固定、event自身のcauseLogは都度」という特殊規則、4.3節)。
- `physicsSnapshotAtT`同一step一致。
- P3-0-Q6ホワイトリストへD02・D05追加。
- D02専用M4型sweep受け入れ条件+同一step競合(3.4節)。
- D05一時抵抗悪化(Q7確定)のno-op防止sweep受け入れ条件(`recoveryFrames >= 1`かつ`recoveryContactResistanceMultiplier > 1`が実際のproduction-valid較正値で成立することを固定、P41是正、7.2節)。
- D05 2episode実経路テスト+episode最大継続時間の到達可能性制約(4.3節)。
- D05のdiff換算がevent個数に依存しないことのホワイトリスト構造テスト+event0件でも正のdiffが出るstore fixtureテスト(P37是正、8節)。

### 12.3 劣化適用・store統合の原子性

- D02のrotorAssemblies.burnedOut反映。
- D05のbrush個体wearFraction加算(`cumulativeWearDeltaFraction`基準、event 0件でもdiffが出る正例+反復eventの二重適用防止負例、4.4節)。
- `cumulativeWearDeltaFraction > 1`となる構成でも`applyBrushDiff`適用後の`wearFraction`が`1`を超えないことの負例(P35是正、4.4節)。
- 原子的store反映・同一runSequence冪等性。

### 12.4 C5負例(10節)

- **D02発煙のみ**: `coilHeatGaugeRatio`が`smokeGaugeThreshold`には到達するが`coilOverheatGaugeLimit`には未到達の入力で、`terminalModeCandidates`が増えないことを固定する負例テスト。
- **D05は非終端モードそのもの**: `classifyTerminalModes`にD05の分岐が存在しないという分類規則レベルの事実を、episode成立・境界値を含むあらゆるD05由来eventについて`terminalModeCandidates`へ一切追加されないことで固定する負例テスト。

### 12.5 ブラシ写像

- `mapBrushRatios`(MotorConfig層)・`mapD05BrushWearConfig`(DestructionConfig.d05層)の全素材網羅テスト、貴金属の交差非線形性(6.3節の表どおり)。
- `composeConfigFromMaterials`拡張のproduction-valid fixture接続。
- `assembleD05Config`(P36是正で新設、`mapD05BrushWearConfig`出力+`DestructionConfig.d05`共通部分の単一構築経路)→既存validator通過、をproduction-valid fixtureで検証するテスト(11.3節)。

### 12.6 リプレイ等価性

- D02×D05×D01の非自明リプレイ等価性(5.5節)。

### 12.7 validator

- 11.2節の交差不変条件の正負例+破損localStorage負例。
- `recoveryFramesLeft <= config.d05.recoveryFrames`のcross-validator正負例(P41是正、破損snapshotで任意長の悪化が起きないことを固定、7.2節)。
- `encodeRecipe`が非1の`effectiveTurnsRatio`を含む`MotorConfig`に対してthrowすることの正負例(P3-3-Q14確定、P46是正で候補変更、5.3節)。

### 12.8 全体ゲート

- `npm run test && npm run build && npm run lint`が各ゲート単独で成功する(13節でゲート順を型検査可能な形に修正済み)。**P54是正(13.1節): この原則はゲート0・1・2・6・7にそのまま適用するが、ゲート3〜5(状態機械・物理効果・較正sweep)は単一の「統合較正閉包」として扱い、`npm run test`全成功は個別checkpointではなく閉包の最終点(checkpoint 5、較正sweep完了時)で満たされることを要求する。**
- bundle size差分の報告(P3-2完了時点の基準値784.99kB/gzip219.84kBとの差分)。
- `git diff --check`・`git diff --stat`・変更ファイル全一覧・全テスト出力・`cmp AGENTS.md CLAUDE.md`。
- sweep実測全文(11.1節の全候補値)。
- `rg`依存閉包(14.2節、概算・再実測予定という記載は行わない)。

---

## 13. ゲート分割(P12是正: 型検査可能な順序へ再構成、P28是正: ゲート2のtype-check破綻を解消)

**v1の問題**: v1のゲート1(型契約、`isChatteringThisFrame`を`DestructionFrameInput`へ必須追加)とゲート5(`buildXxxFrameInput`改修、この新フィールドを実際に埋める)が分離しており、ゲート1完了直後は`buildXxxFrameInput`が新フィールドを満たせず`tsc -b`が失敗する状態になる。ゲート3の`advanceD05`もこの信号に依存するため、状態機械より前に解消する必要がある。

**v3の問題(P28指摘)**: v3のゲート2(`mapBrushRatios`・`composeConfigFromMaterials`拡張)は`MotorConfig.brushContactResistanceRatio`/`brushChatterProbabilityRatio`という新規フィールドへ値をpopulateするが、この2フィールドの**型宣言自体**は旧ゲート4(`motorPhysics.ts`改修)まで追加されていなかった。ゲート2単独では参照先の型が存在せず`tsc -b`が失敗する。**是正方針**: 「型宣言(フィールドを追加するだけ、物理効果はまだ結線しない)」と「物理効果の実装(`motorPhysics.ts`の式が実際にそのフィールドを読んで計算へ反映する)」を明確に別工程とし、前者をゲート1へ、後者をゲート4へ割り当てる。TypeScriptの型検査はフィールドが「宣言されているか」のみを見るため、値がまだどこにも効果を持たなくても、宣言済みであればゲート2は単独でtype-check可能になる。

**v4の問題(P40指摘、まだ単独build不能)**: v4は上記是正を`MotorConfig`側では正しく適用したが、**`MaterialSelection.brushId`必須化については逆向きに壊れていた**——`brushId: BrushMaterialId`をゲート1で**必須**フィールドとして追加する一方、それを消費する`composeConfigFromMaterials`実装・`materialMapping.test.ts`の全fixture・`scripts/materialSweep.ts`の追従はゲート2に置いていた。必須フィールドを追加した瞬間、単一tsconfigプロジェクト全体で`MaterialSelection`を構築する既存の全リテラル(fixture・sweep双方)が型エラーになるため、ゲート1はこの時点で単独build不能になる。これは6.4節で自ら定めた「型追加と実消費を同一ゲートで実施する」という規律にも違反していた。**是正**: `MaterialSelection.brushId`の型追加・`composeConfigFromMaterials`実消費・`materialMapping.test.ts`全fixture追従・`scripts/materialSweep.ts`全消費者追従を**ゲート2へ一括で移す**(ゲート1は`MotorConfig`側〈motorPhysics.ts所有〉の型宣言に専念し、`MaterialSelection`側〈materialMapping.ts所有〉の型宣言+消費はゲート2〈materialMappingゲート〉へ集約、というオーナーシップ境界に沿った分割にする)。

**確定ゲート構成(各ゲート単独でtype-check/build可能)**:

| ゲート | 内容 | 前提 |
|---|---|---|
| 0 | AGENTS.md/CLAUDE.md現状同期 | なし |
| 1 | **型契約+frame構築是正+MotorConfig側ブラシ型宣言を同一ゲートで実施**(P28是正: materialMappingが参照するMotorConfig側の型をすべて本ゲートで確定させる。P40是正: `MaterialSelection`側〈materials層所有〉はゲート2へ分離): `D01Progress`拡張(`decayExposureRad`、P34是正)、`DestructionFrameInput`拡張(`coilLossW`・`isChatteringThisFrame`・`angularVelocityRadS`)+`buildMotorOnlyFrameInput`/`buildVehicleFrameInput`を同一ゲートで改修して新フィールドを実際に埋める(**物理式〈computeElectricalState等〉は未改修**、P40是正: 「motorPhysics.ts無改修」という表現は本ゲートでも`MotorConfig`インターフェース自体〈motorPhysics.ts所有〉へ型追加するため紛らわしく、「物理式は未改修」へ訂正)、`DestructionConfig.d01`新設(`decayExposureScaleRad`・`minEffectiveTurnsRatio`、P34是正)+`DestructionConfig.d02`/`d05`拡張+validator(11.2節の交差不変条件を含む)、**`MotorConfig`型へ`effectiveTurnsRatio?`・`brushContactResistanceRatio?`・`brushChatterProbabilityRatio?`の3フィールドを宣言(値はまだどの計算式からも読まれない、型追加のみ)**、`validateMotorConfigShape`の`optionalNumberFields`へ新規3フィールド(`effectiveTurnsRatio`・ブラシ2件)すべてを追加(P29是正、5.3節)+`restoreRunSnapshot`のbase config専用制約(`effectiveTurnsRatio === undefined || === 1`)を追加、`recipeCode.ts`の6箇所(6.4節、`RECIPE_M_FIELD_KEYS`・型定義・`normalizeMotorFields`・`motorConfigToFields`・`encodeRecipe`内リテラル・`recipeCode.test.ts`ドリフト検査)へブラシ2フィールドのキー追加。**Fable裁定確定field集合(P45是正が想定していた条件分岐は、正式Fable裁定〈2026-08-09〉によりQ7=候補(a)・Q8=候補(b)・Q9=候補(b)で確定したため、以下は無条件で本ゲートへ追加する)**: `D02Progress`へ`smokingStarted`・`smokingStartedAtT`を追加+`restoreRunSnapshot`raw validatorへの交差不変条件追加(Q8確定、3.5節)、`D05CauseLog`へ`theoreticalCurrentA`を追加(Q9確定、15.3節、**人間再承認対象**)、`D05Progress`へ`recoveryFramesLeft`+`DestructionConfig.d05`へ`recoveryFrames`・`recoveryContactResistanceMultiplier`+`restoreRunSnapshot`への`recoveryFramesLeft <= recoveryFrames`cross-validator(Q7確定、7.2節・P41是正)を追加する。**限定DoD(P40是正で明記): 14.2節で確定した既存fixture・初期state・raw validatorすべてを本ゲート内で同時追従する**——`D01Progress`8箇所・`D05Progress`4箇所・`DestructionFrameInput`14箇所(いずれも新規必須フィールドを追加するため、フィールドを消費しない既存関数は型変更のみ、消費する箇所は実装も追従)、`DestructionConfig.d02`/`d05`の6ファイル(型定義1+テストfixture5、Q7/Q8/Q9確定分を含む)。`BrushMaterialId`型宣言のみ本ゲートに残す(`MaterialSelection`側の消費はゲート2、P40是正)。**付帯条件(Fable指示)**: D02イベントのtemperature規約は`uncalibratedGauge`(ratio=`coilHeatGaugeRatio`)、D05イベントは`unavailable`(ブラシ温度ゲージは存在しないため捏造しない)をD02CauseLog/D05CauseLogの`temperature`フィールドへ本ゲートで明記する(P3-1のD01/D03と同じ規律)。 | なし |
| 2 | materialMappingゲート(`mapBrushRatios`・`mapD05BrushWearConfig`・`assembleD05Config`〈P36是正〉写像純関数新設、`composeConfigFromMaterials`拡張〈ゲート1で宣言済みのMotorConfig型へ値をpopulate、この時点では物理式はまだ読まないため走行結果には影響しない〉、**`MaterialSelection.brushId`必須フィールド型追加+実消費を同一ゲートで実施(P40是正)**——`materialMapping.test.ts`の全fixture(`pvMotorCar`等の`MaterialSelection`構築箇所すべて)・`scripts/materialSweep.ts`〈`MaterialSelection`実測10ヒット、14.2節〉の全消費者を本ゲート内で同時追従、物理sweepを含まない) | ゲート1 |
| 3 | 状態機械checkpoint(`advanceD02`/`advanceD05`、ゲート1の`isChatteringThisFrame`に依存)+`deriveDegradationDiffs`拡張(P3-0-Q6同時実装)。**P3-3-Q13確定により(P45是正)**: 本checkpointのproduction-valid fixtureは、ゲート2で新設済みの`assembleD05Config`が構築した完成版`DestructionConfig['d05']`に依存する(独自にオブジェクトを組み立てない)——ゲート2完了(`assembleD05Config`が使用可能)を前提とする順序をここで固定する。**P54是正(統合較正閉包、下記参照): 本checkpoint単独の`npm run test`全成功は要求しない** | ゲート1・2 |
| 4 | **物理効果checkpoint**(`composeEffectiveMotorConfig`のD01/D02/D05分岐+`effectiveTurnsRatio`/ブラシ2フィールドを実際に消費する**motorPhysics.ts式改修**〈`computeElectricalState`・`computeMagneticTorque`・`computeContactResistance`・`nextChatterState`、ゲート1で宣言済みの型を初めて読み取る〉+合成直交性+予算不変性再実行+既存回帰49件〈motorPhysics.test.ts、14.2節〉全件成功確認)。**P54是正: 本checkpoint単独の`npm run test`全成功も要求しない(下記参照)** | ゲート3 |
| 5 | 較正sweepcheckpoint(D02 M4型・D05 duration境界+到達可能性・D01停止時ゼロ・ブラシ交差非線形性)。**付帯条件1(Fable指示)**: P3-2-Q13-2の`NORMAL_OPERATION`15組合せ表(実在全5コース×全3電池、`materialMapping.test.ts`のtable-driven、`docs/phase3-plan-v12-amendments.md`のP3-2-Q13-2エントリ参照)を、D01/D02/D05の新モード込みで再実測する——既存の受け入れ列(自然完走・破壊イベントゼロ等)に加え、全15組合せで`D01Progress.triggered===false`・`D02Progress.smokingStarted===false`(発煙未到達)・`D05Progress.episodeCount===0`かつ`cumulativeWearDeltaFraction===0`(通常整流除外の実証——超過電流が発生しない以上、摩耗蓄積は厳密に0であるべき)を確認する。定義自体はQ13-2/Q14裁定のまま変更せず、対象症状を拡張するのみ。**P54是正: ゲート3〜5「統合較正閉包」の最終点。ここで初めて`npm run test`全成功を要求する(下記参照)** **2026-08-10完了。実測記録は13.1.3節(v13新設)を参照。** | ゲート2・3・4 |
| 6 | store fixture統合(3文脈、P3-2と同型。track-runは手構築RunOutcome限定、15.4節)。**2026-08-11着手承認、実装確定条件は13.2節参照。2026-08-11完了(P60〜P64是正を経てSuu_mot3最終照合通過、詳細は13.2節末尾を参照)** | ゲート5 |
| 7 | 最終docs/全体DoD確認。**2026-08-11着手(本改訂)** | ゲート6 |

各ゲートの限定DoDは実装着手前にSuu_mot3照合を経て確定する。

### 13.1 ゲート3〜5「統合較正閉包」(P54是正、2026-08-10、Suu_mot3裁定、実装順/完了境界の是正——新規物理契約ではない)

**発覚した契約間の矛盾**: ゲート3(状態機械checkpoint)で`advanceD02`をactivateすると、既存のQ13-2 `NORMAL_OPERATION`15組合せ表(P3-2ゲート5是正版で確立済み、ゲート3以前はD02が判定関数を持たず凍結されていたため常に非発火だった)が、D02を**実際に評価**するようになる。しかしD02の較正値(`conductionScale`・`dissipationCoefficient`等)は、`composeEffectiveMotorConfig`のD02分岐・発煙R_coil重ね掛け(ゲート4)・D02専用M4型sweep(ゲート5)を経て初めて正しくsweepできる値であり、ゲート3の時点では意味のある値を較正しようがない。その結果、**「各ゲート単独で`npm run test`が全成功する」という12.8節の原則**と、**「advanceD02をゲート3で先に有効化し、較正はゲート5まで行わない」というゲート順序**が両立しない——これは`advanceD02`自体の実装ミスではなく、計画のゲート分割設計に存在した依存関係の見落としである(2026-08-10のゲート3完了報告で発覚、9組合せの失敗として正しく症状が現れた)。

**禁止する対処(Suu_mot3裁定)**: 以下はいずれもゲート5の較正責務を偽装するため採用しない。
- 既知の失敗を残したままゲート3を「完了」として扱う。
- `skip`/`only`/filter等でD02由来のeventを隠す。
- `NORMAL_OPERATION`の受け入れ条件(assertion)を一時的に弱める。
- ゲート3時点で任意のtest-only数値を`d02`較正値へ設定して緑化する(較正はゲート5の較正sweepでのみ行う、P3-3-Q15-1の恒久規則と同じ理由)。

**裁定(確定)**: 契約・物理式・較正条件・最終DoDはいずれも変更せず、**ゲート3〜5を単一の「統合較正閉包」として再編する**。実装順序・完了境界の是正であり新規の物理契約ではないため、Fable再提出・人間再承認は不要。

1. **checkpoint 3(状態機械、2026-08-10実装済み)**: `advanceD02`/`advanceD05`+`deriveDegradationDiffs`拡張。**個別のtargeted新規テスト(destructionModes.test.ts/destructionOrchestration.test.tsの新規追加分)はこのcheckpoint単独で全成功を要求する。** 既存`Q13-2 NORMAL_OPERATION`表のD02由来の赤(2026-08-10時点で9組合せ、`coilHeatGaugeRatio`が未較正値のまま長時間走行で`coilOverheatGaugeLimit`へ到達してしまう)は、**この閉包が完了するまでの既知の診断結果として許容する**(「失敗を隠す」のではなく「原因を特定した上で、対応する較正checkpoint〈5〉まで意図的に残す」という違い)。
2. **checkpoint 4(物理効果、2026-08-10実装完了)**: 既定のゲート4範囲(`composeEffectiveMotorConfig`のD01/D02/D05分岐+`motorPhysics.ts`式改修+合成直交性+予算不変性再実行+既存回帰49件)をそのまま実施した。**checkpoint 3→4の間、許容した失敗は下記13.1.1節の「正確な19テスト」に限定され**、それ以外の失敗(新規回帰・既存回帰の劣化等)は発生しなかった(Suu_mot3照合通過済み)。
3. **checkpoint 5(較正sweep、2026-08-10完了)**: 既定のゲート5範囲(D02 M4型・D05 duration境界・D01停止時ゼロ・ブラシ交差非線形性のsweep)でD01/D02/D05を較正し、付帯条件1どおり`Q13-2 NORMAL_OPERATION`15組合せの拡張列を正式に再実測して、**ここで初めて全体を緑化した**。回収条件は下記13.1.2節に従う。較正候補→実測→採否の記録・Q15-2/Q15-3実測結果は下記13.1.3節を参照。この時点で統合較正閉包が完了する。
4. **禁止事項の明記**: 上記いずれのcheckpointでも、`skip`/`only`/filterによるevent隠蔽、assertionの弱体化、暫定数値による緑化は行わない(繰り返し明記、恒久規則として14.2節・12.8節と同じ強さで扱う)。

**12.8節との関係(精密化)**: 「各ゲート単独で`npm run test`が全成功する」という原則は、ゲート0・1・2・6・7についてはそのまま適用する。**ゲート3〜5(統合較正閉包)についてのみ、この原則は個別checkpointではなく閉包の最終点(checkpoint 5)で満たされることを要求する**、と精密化する。

#### 13.1.1 checkpoint 3〜4で許容する赤の正確な列挙(P55是正、2026-08-10、Suu_mot3裁定)

**背景**: checkpoint4(`composeEffectiveMotorConfig`のD01/D02/D05分岐+`motorPhysics.ts`式改修)を実装したところ、全suite実行での失敗が9件→19件へ拡大した。Suu_mot3による独立診断の結果、checkpoint4の実効config結線自体には契約逸脱・実装誤りは見つからず、19件はいずれも**同一の根因閉包**(未較正のD02が統合wrapper内で実際に発煙latch〈`smokingStarted`〉へ到達し、`smokeResistanceMultiplier`による`wireResistivityRatio`変化がP3-2由来のM4/D07 sweepへ連成する)に属すると判定された——`M4条件1/2`はいずれも毎step`composeEffectiveMotorConfig`を通し同じ`DestructionConfig`内の未較正D02を実行し、`D07`通常回帰・`Q2`定常RPMテストは`D07 config`は分離しているが`D02`は分離しておらず、`stepMotorWithDestruction`内でD02も進行するため、である。

**許容する赤の正確な列挙(合計19テスト、これ以外は一切許容しない)**:

1. `materialMapping.test.ts`「Q13-2通常運用確認(NORMAL_OPERATION基準構成)」の実在全5コース×全3電池、**15組合せ全て**(2026-08-10 checkpoint4実装時点で15/15組合せが失敗、うち`energy-run`×`battery-alkaline`は`vehicleState.status`が`'finished'`ではなく`'stalled'`になる)。
2. 「M4到達可能性3条件 > 条件1: 通常負荷構成(`energy-run`自然完走)ではburningへ到達しない」の**完走step数値回帰1件**(2026-08-10実測: 期待値3848→実測4369)。
3. 「M4到達可能性3条件 > 条件2: 高負荷LiPo構成ではunsafeDischargeStartRatio到達後...burningへ到達できる」の**swelling到達step数値回帰1件**(2026-08-10実測: 期待値897→実測912)。
4. 「D07 Q11受け入れ条件1: 通常運用ではダレ閾値に到達しない(30秒間)」の**`maxGauge`数値回帰1件**(2026-08-10実測: 期待値0.3271→実測0.32876)。
5. 「Q2独立sweep受け入れ条件: 可逆ダレによる定常RPM低下の観測可能性」の**droop定常RPM判定1件**(定常性判定`|meanFirst-meanSecond|/meanAll <= 3%`が破れる)。

**即時停止条件**: 以下のいずれかが発生した時点で、それ以上の作業(checkpoint4残作業・完了報告)を一切進めず即座に停止しSuu_mot3へ報告する。
- 上記19テスト以外(20件目、別ファイル、別describe)が失敗する。
- 上記19テストであっても、失敗の性質が「D02発煙→R変化に起因する数値回帰/状態変化」以外(例外・NaN・schema破損等)へ変わる。

**checkpoint4完了報告の追加要件**: 上記2〜5番の各テスト(M4条件1・M4条件2・D07通常・Q2独立sweep)について、少なくとも次を一時診断または既存stateの観測から表で示す。診断用ログはproductionへ残さない。
- D02の`smokingStarted`が成立すること。
- 初回成立step(または成立が期待値乖離より前であることの確認)。
- その後のR_coil実効倍率(`wireResistivityRatio`の変化)。
- 最終status/主要観測値。

#### 13.1.2 checkpoint 5(較正sweep)の回収条件(P55是正)

D02/D05較正後、単に期待値を書き換えるのではなく、以下を満たして69ファイル全緑へ戻す。

- `Q13-2`全15組合せで`D01Progress.triggered===false`・`D02Progress.smokingStarted===false`・`D05Progress.episodeCount===0`かつ`cumulativeWearDeltaFraction===0`(既存付帯条件1のまま)。
- M4通常条件(条件1)はD02非到達のまま、既存の自然完走・D04非到達契約を維持する。
- M4高負荷条件(条件2)はD04到達可能性と既存受け入れ条件を維持する(D02連成が較正後も残る場合は実測と因果を報告し、勝手に数値保証を更新しない)。
- D07通常回帰・droop観測ではD02非到達とし、P3-2で確定したD07受け入れ条件を維持する。
- 15.5節Q15追加条件(接触抵抗両極の観測可能性〈Q15-2〉、貴金属高電流順位逆転〈Q15-3〉等)を充足する。
- `npm run test`/`build`/`lint`・`cmp`・`git diff --check`をすべて通す。

これは新しい物理契約や較正値の裁定ではなく、ゲート3で初めて観測できた依存閉包をcheckpoint境界へ正確に反映する実行順の精密化であり、Fable再提出・人間再承認は不要と裁定された(P54と同じ扱い)。

#### 13.1.3 checkpoint 5実測記録: 較正候補→実測→採否、Q15-2/Q15-3実測結果(v13新設、v14でP56追補反映、v15でP57是正反映、v16で全値確定反映)

**本節の全数値の性格(P56是正、精密化。v16で全値確定を反映)**: 本節に記載する値は、正式Fable較正レビュー(D02・D05共通・ブラシ8値、2026-08-10)+正式Fable補足裁定(D01、2026-08-11)をもって**全て確定**した。ただし`DestructionConfig.d01`/`d02`/`d05`共通値・ブラシ素材値は、production向け`DestructionConfig`・gameStore・UI配線がP3-0-Q2裁定どおりP3-4まで存在しないため、現時点ではいずれも`materialMapping.test.ts`等のfixtureでのみ使われる値である点は変わらない——「値としての確定」と「productionへの配線」は別軸であり、後者はP3-4のスコープである。値の確定経路(Fable候補裁定→sweep→確定申請→人間commit承認)における「確定申請」段階は、`docs/phase3-p3-3-checkpoint5-implementation-report.md`の確定申請表への反映をもって満たし、続く人間commit承認はP3-3最終commit承認に包含される(D01については人間再承認不要と裁定済み、他の値も同型の経路)。値ごとの出典・受け入れ証跡・現時点の効力は次の表のとおり。

**全較正値の確定申請表(P56-1)**

| 値 | 出典 | 受け入れ証跡 | 現時点の効力 |
|---|---|---|---|
| **D01: `decayExposureScaleRad=1000`** | ゲート1仮値として導入され、正式Fable補足裁定(D01較正、2026-08-11)により**確定**。誤っていたのは値ではなく旧受け入れ条件3(floor到達可能性)だったと裁定された | 構造的性質(単調性・停止時ゼロ・clamp)+改訂後の受け入れ条件3′(プラトーの実測固定)・1′(トリガ+1秒でratio≥0.8)を実測・回帰テストで固定済み(下記D01較正証跡を参照) | **確定**(`docs/phase3-plan-v12-amendments.md`「P3-3-D01較正確定」参照)。人間再承認不要(値の変更なし) |
| **D01: `minEffectiveTurnsRatio=0.5`** | 同上。floorの役割を「ゲームプレイ上の到達目標」から「数値安全域のclamp」へ再定性したうえで**確定**(値の物理的根拠〈崩れた巻線の残存結合〉は不変) | clamp DoD(頭打ちになること)を確認済み。floorが実際のゲームプレイに現れうる経路は外部機械駆動(急降坂での逆駆動)のみで現行5コースには存在しないため、到達可能性そのものは受け入れ条件から外れた(下記参照) | **確定**。人間再承認不要(値の変更なし) |
| D02: `smokeGaugeThreshold=0.6` | ゲート1裁定値(P3-3-Q1関連、本checkpointでは変更対象外) | Q13-2 15組合せ実測でNORMAL_OPERATION時のmaxD02Ratioが採用値(k=0.08)で0.08〜0.16と、この閾値を十分下回ることを確認(下記D02較正参照) | **確定**(正式Fable較正レビュー、2026-08-10)。本checkpointでは非変更 |
| D02: `coilOverheatGaugeLimit=1` | 同上(D02状態機械のterminal定義値、無次元ゲージの1.0固定は設計契約であり較正対象ではない) | D02専用M4型sweep・grid実測いずれも到達可能性を確認 | 契約値(較正対象外) |
| **D02: `conductionScale=0.04`** | **本checkpointでgrid実測により新規較正**(旧値0.1はゲート1仮値、根因究明済み) | 下記D02較正(grid実測、P56-2)参照 | **確定**(正式Fable較正レビュー、2026-08-10。「3×3 grid実測は較正証跡として模範的」と評価) |
| **D02: `dissipationCoefficient=0.5`** | 同上 | 同上 | 同上 |
| D02: `smokeResistanceMultiplier=1.2` | ゲート1裁定値(本checkpointでは変更対象外) | 本checkpointでmultiplier=1.0との比較sweepにより副作用の方向(熱蓄積加速)を実測(下記smokeResistanceMultiplier方向実測、P56-3参照) | **確定**(正式Fable較正レビュー、2026-08-10)。本checkpointでは非変更、方向のみ新規実測 |
| D05共通: `brushSparkDurationLimitS=0.15` | ゲート1裁定値(本checkpointでは変更対象外) | 単一実チャタリングバースト内でepisode到達可能であることを本checkpointで新規実測(下記D05共通較正証跡、P56-4参照) | **確定**(正式Fable較正レビュー、2026-08-10)。本checkpointでは非変更、到達可能性のみ新規実測 |
| D05共通: `brushSparkCurrentThresholdA=3` | 同上 | Q15-3高負荷構成で理論電流が実際にこの閾値を超えることをD05 event causeLogから直接確認(下記Q15-3参照) | **確定**(正式Fable較正レビュー、2026-08-10) |
| D05共通: `wearPerAmpSecond=0.001` | 同上 | Q15-3の累積摩耗実測値がゼロでも発散でもない現実的な範囲に収まることで間接的に確認 | **確定**(正式Fable較正レビュー、2026-08-10。「虐待走行4〜8回でブラシ寿命という経済スケールとして妥当」と評価) |
| D05共通: `recoveryFrames=6` | 同上 | no-opでないことを本checkpointで新規実測(下記D05共通較正証跡参照) | **確定**(正式Fable較正レビュー、2026-08-10) |
| D05共通: `recoveryContactResistanceMultiplier=1.2` | 同上 | 同上(`brushContactResistanceRatio`のbase×1.2への変化、および実物理での電流低下を確認) | **確定**(正式Fable較正レビュー、2026-08-10) |
| ブラシ: `brush-copper-plate` `brushContactResistanceRatio=1.3` | 正式Fable P3-3-Q15-2裁定済みの暫定候補値(15.5節) | Q15-2独立sweep(copper-plate/precious-metal両極の窓平均定常RPM差、実測354.836 vs 490.930・差率38.35%)で観測可能性を実測確認 | **確定**(正式Fable較正レビュー、2026-08-10)。Gate5受け入れ条件(接触抵抗両極の観測可能性)充足 |
| ブラシ: `brush-silver-graphite` `brushContactResistanceRatio=0.7` | 同上 | Q15-2裁定時にratio類6個の一括承認対象(本checkpointでの個別sweepは両極〈copper-plate/precious-metal〉のみを直接実測、silver-graphiteは中間値として個別sweep対象外)。付帯条件2(P58是正)でtierIndex順の具体値配列`[1.3,1,0.7,0.5]`を数値回帰固定済み | **確定**(正式Fable較正レビュー、2026-08-10)。個別sweep証跡はないが、tierIndex順配列の数値回帰固定で間接的に裏付け済み |
| ブラシ: `brush-precious-metal` `brushContactResistanceRatio=0.5` | 同上 | Q15-2独立sweep(上記、改善側の極として直接実測) | **確定**(正式Fable較正レビュー、2026-08-10)。Gate5受け入れ条件充足 |
| ブラシ: `brush-precious-metal` `brushChatterProbabilityRatio=0.7` | 同上 | Q15-3高負荷構成のチャタリング実測(episodeCount=6、frame17/frame23のバースト内到達性を含む一連のD05実測)に加え、付帯条件3(正式Fable指示)で同一rng列・決定論的PRNG(mulberry32相当、seed=42)によるratio=0.7対1.0のバースト発生数比較(0.7側375<1.0側403、総チャタリングフレーム数8977<9672)を実測固定し、効果の存在を直接実証済み | **確定**(正式Fable較正レビュー、2026-08-10)。付帯条件3で効果の単離実証を完了 |
| ブラシ: `brush-copper-plate` `brushWearRateRatio=1.5` | 正式Fable P3-3-Q15-3裁定済みの暫定候補値(15.5節) | Q15-3高負荷構成で実測累積摩耗0.076636(carbon 0.056354を上回り、precious-metal 0.117902を下回る中間順位であることを確認) | **確定**(正式Fable較正レビュー、2026-08-10)。Gate5受け入れ条件(順位逆転の実証)充足 |
| ブラシ: `brush-precious-metal` `brushWearRateRatio=0.7` | 同上 | Q15-3高負荷構成で実測累積摩耗0.117902(highCurrentPenaltyMultiplier適用後、carbon・copper-plateの両方を上回ることを確認) | **確定**(正式Fable較正レビュー、2026-08-10)。Gate5受け入れ条件充足 |
| ブラシ: `brush-precious-metal` `highCurrentPenaltyThresholdA=3` | 同上 | Q15-3統合テストでprecious-metalの各D05 event causeLog(`theoreticalCurrentA`)が実際にこの閾値を超えていたことを直接assert(6件全event、最大40.666317A) | **確定**(正式Fable較正レビュー、2026-08-10)。Gate5受け入れ条件充足 |
| ブラシ: `brush-precious-metal` `highCurrentPenaltyMultiplier=2.5` | 同上 | Q15-3高負荷構成で実効摩耗率0.7×2.5=1.75がcarbon(1.0)・copper-plate(1.5)の両方を上回ることを実測確認(NORMAL_OPERATION側は`brush-precious-metal`自身のD05非進行も別途直接確認、Q13-2はbrush-carbon固定のため個別追加テストが必要だった) | **確定**(正式Fable較正レビュー、2026-08-10)。Gate5受け入れ条件3点すべて充足 |

**D01較正証跡(P56-5、正式Fable補足裁定〈D01較正、2026-08-11〉により確定)**

計画のゲート5(較正sweepcheckpoint)がD01について宣言していた範囲は「D01停止時ゼロ」のsweep確認のみであり(13節ゲート表)、`decayExposureScaleRad`/`minEffectiveTurnsRatio`自体の数値較正sweepは範囲に含まれていなかった。この宣言済み範囲は、次の既存テストで満たされている(いずれも本checkpoint以前に実装済み):

- 単調積分: `destructionModes.test.ts`「trigger後、|angularVelocityRadS|がCOIL_DEFORM_OMEGAを超える限りdecayExposureRadは単調に増加する」(2回のadvance呼び出しで`expectedDelta`→`expectedDelta*2`)。
- 停止時ゼロ: 同ファイル「trigger後、|angularVelocityRadS| <= COIL_DEFORM_OMEGA(閾値以下)または停止(0)ではdecayExposureRadが変化しない」(閾値以下・停止・ちょうど閾値の3パターンいずれも`decayExposureRad`不変)。
- clamp: `destructionOrchestration.test.ts`「decayExposureRadが極端に大きい場合、effectiveTurnsRatioはminEffectiveTurnsRatioで頭打ちになる(clamp DoD、5.3節)」。

v14〜v15時点では、`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`という**具体的な大きさ**を支持する実測・sweepが存在しないままfixture候補として記録していた。checkpoint5完了後、正式Fable較正レビューがD01へ追加sweep(漸減性・観測可能性・floor到達可能性・NORMAL_OPERATION非トリガの4条件)を指示し、これを実施した結果、**現行値は旧条件3(floor到達可能性)を満たさないことが実測で判明した**(`docs/phase3-p3-3-d01-supplementary-review-request.md`に実測全文・harness再現情報を記載)。

**D01 trajectory実測(motor-only free-spin、`varnished:false`、`loadTorque=0`)**:

| coilTurns | magnetDistanceMm | 崩壊トリガ時刻(秒) | decayExposureRadのプラトー値 | プラトー時点のratio | 40秒時点のomega(rad/s) |
|---|---|---|---|---|---|
| **15** | **8**(最良構成) | 4.691666666666666 | 292.6341151356759 | 0.7073658848643241 | 0(完全失速) |
| 15 | 10 | 5.225 | 217.60714924446563 | 0.7823928507555343 | 0(完全失速) |
| 10 | 8 | 8.475 | 77.4163912161609 | 0.922583608783839 | 28.595677602878084(減速継続中) |
| 20 | 10 | 4.583333333333333 | 271.8388621147568 | 0.7281611378852432 | 188.81404799446105(定常、COIL_DEFORM_OMEGA未満で停滞) |

floor(ratio=0.5)には`decayExposureRad>=500`が必要だが、いずれの構成もプラトー値がこれを大きく下回る。

**根本原因(創発挙動として受容、正式Fable裁定)**: `effectiveTurnsRatio`の低下は`computeMagneticTorque`のトルク定数も比例して低下させる(K_E=K_T相反性、P3-3-Q5裁定)。無負荷自由回転では、劣化が進む→トルク定数低下→抵抗トルクに対し発生トルクが不足→回転数低下→`|angularVelocityRadS|`が`COIL_DEFORM_OMEGA`(209.4395102393 rad/s)を下回る→減衰蓄積が停止(既存の「停止時ゼロ」契約どおり)、という自己制限フィードバックが生じる。**正式Fable裁定は、この挙動を「実物の巻線崩壊は過回転の遠心応力が駆動し、損傷が進めばモーターは自らの過回転を維持できなくなり、損傷の駆動源そのものが消える」という物理的に正しい創発挙動と認定した——Phase 2の銅線+フェライト過熱レジーム(`docs/phase2-material-sweep-report.md` §5(i))に続く、本プロジェクト2件目の創発的実測知見である。** P3-3-Q4(角速度超過分の積分による駆動)の再考は不要と確定した。

**受け入れ条件の改訂(正式Fable裁定)**: 旧条件3(floor到達可能性)は、減衰が外部駆動されるという暗黙の仮定の上に書かれた条件であり、実測はその仮定が自己駆動系(motor-only無負荷)では成立しないことを示した。次の2条件へ改訂する。

- **条件3′(プラトーの実測固定)**: 代表的虐待構成の自己制限プラトー(最良構成coilTurns=15/magnetDistanceMm=8でratio 0.7074、29%の結合喪失)が観測可能な劣化を与えること。条件2実測(ratio=0.75でloadTorque∈{0.003,0.005,0.007}での定常RPM低下率30.4%・68.4%・100%、目安3%を大幅超過)により**充足済み**。
- **条件1′(漸減性の直接形)**: 崩壊トリガ後1秒時点でratio≥0.8(段差ではないことの実測可能形)。最良構成での実測トリガ+1秒時点ratio=0.8914により**充足済み**。
- 条件2(観測可能性)・条件4(NORMAL_OPERATION非トリガ)は元の定義のまま充足済み(変更なし)。

**`minEffectiveTurnsRatio=0.5`の再定性**: floorの役割を「ゲームプレイ上の到達目標」から「数値安全域のclamp」へ改める(復元データの破損・将来のモデル変更・外部駆動に対する安全域保証)。値0.5の物理的根拠(崩れた巻線の残存結合)は不変。floorが実際のゲームプレイに現れうる唯一の経路は外部機械駆動(急な下り坂での逆駆動による過回転の外部維持)であり、現行の実在5コースには存在しないため、vehicle/track文脈の追加sweepは不要と裁定された。**Phase 5コース設計への申し送り**: 急降坂コースはD01減衰をfloorまで進めうる潜在挙動を持つことを記録する(`docs/phase3-plan-v12-amendments.md`「P3-3-D01較正確定」エントリに同内容を記録済み)。

**自己制限プラトー回帰テスト(Gate6解禁条件、実装済み)**: 最良構成(coilTurns=15/magnetDistanceMm=8)で、(i)プラトーratio≈0.7074のtoBeCloseTo固定、(ii)プラトー到達後`decayExposureRad`が末尾240フレーム(2秒)にわたり不変であることの直接assert(減衰停止の証拠)、(iii)トリガ+1秒時点ratio≥0.8(条件1′)を単一の実走行経路で固定した(`materialMapping.test.ts`「D01自己制限プラトー」)。

D01の2値(`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`)は、以上の裁定・実測・回帰テストをもって**確定**する。詳細な裁定全文は`docs/phase3-p3-3-d01-fable-response.md`、依頼書・再現情報は`docs/phase3-p3-3-d01-supplementary-review-request.md`を参照。

**D02較正(`conductionScale`/`dissipationCoefficient`、P56-2でgrid実測へ拡充)**

根因: `d02`の`conductionScale: 0.1, dissipationCoefficient: 0.1`(等価ゲイン`k = conductionScale / dissipationCoefficient = 1.0`)はゲート1時代の未較正の仮値であり、checkpoint4で`composeEffectiveMotorConfig`のD02分岐(`smokingStarted`時の`wireResistivityRatio *= smokeResistanceMultiplier`)を結線した時点で、NORMAL_OPERATION実測`coilLossW`(全15組合せで3.0〜3.7W)がこのゲインのまま`coilHeatGaugeRatio`を`smokeGaugeThreshold`(0.6)へほぼ即座に到達させ、19件の連鎖失敗を引き起こしていた(13.1.1節参照)。

Suu_mot3指摘(P56-2)を受け、`conductionScale`/`dissipationCoefficient`を独立に3値ずつ(計9通り)の一時grid harnessで実測した(探索用コードは完全にrevert済み、`grep -c "TEMP_"`で残留ゼロを確認)。各組合せについてQ13-2 15組合せのNORMAL_OPERATION maxD02Ratio(実在全5コース×全3電池での最大値)・D02専用M4型sweep(高負荷構成)のignition step/秒・D03先行/混在の有無を実測した:

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

観察: NORMAL_OPERATION非到達(<0.6)かつ高負荷到達可能(3000step以内)の両方を満たす候補は(0.04,0.3)・(0.04,0.5)〈採用〉・(0.08,0.3)〈q13max=0.518で閾値まで14%しか余裕がない〉・(0.08,0.5)・(0.08,0.8)の5通り。**採用値(0.04,0.5)はq13max=0.1559で閾値0.6まで約74%の余裕があり、受け入れ領域の内部(境界ではない)に位置する。** また、高負荷到達可能性は等価ゲインkだけでなく`conductionScale`の絶対値にも依存する観測結果を得た(0.02系列は全滅、0.04系列はdissipationCoefficient=0.8のみ不達)——この観測の物理的説明(過渡応答と定常応答の時定数の違い等)は断定せず、実測事実としてのみ記録する。

既存の期待値(`finalStep:3848`・`swellingAtStep:897`・`maxGauge:0.3271`等)は較正後に再実測してそのまま一致し、書き換えは発生しなかった。

**D02: smokeResistanceMultiplier副作用の方向実測(P56-3)**

正式Fable Q1/P44の要求(発煙後のR増が熱蓄積を加速・鈍化・ほぼ不変のいずれかをsweep実測で報告)に対し、D02専用M4型sweepと同一構成でsmokingStarted成立直後(実測forkStep=508)の同一状態から、`smokeResistanceMultiplier=1.0`(no-op相当)と`1.2`(採用値)へ分岐させて実測した(`materialMapping.test.ts`「P56-3: smokeResistanceMultiplier副作用の方向」)。

| multiplier | フォーク直後coilLossW平均(最初20step) | 100step後coilLossW平均(80-100step) | burnout到達step | burnout到達秒数 | 同時点(step696)でのratio |
|---|---|---|---|---|---|
| 1.0(no-op) | 10.578 | 9.818(減少傾向) | 未到達(1000step以内) | 未到達 | 0.885(1000step後は0.921) |
| **1.2(採用値)** | 9.728 | 10.690(増加傾向) | **696** | **5.8秒** | 1.0(到達済み) |

観測結果(方向、断定的な物理的説明は付与しない): フォーク直後の瞬間coilLossWはmultiplier=1.2のほうがやや低いが、100step(0.83秒)の推移で見ると増加傾向(1.2)と減少傾向(1.0)に分岐し、この傾向差が持続した結果、採用値(1.2)はno-op(1.0)と比較してburnout到達を大幅に早める(1.0側は1000step経過してもratio=0.921までしか到達しない)。この観測結果を数値回帰として固定した。

**D05共通較正値(duration/recovery)の証跡(P56-4)**

Suu_mot3指摘(P56-4)を受け、実チャタリングバースト(`nextChatterState`経由、`CHATTER_BURST_FRAMES=24`フレーム=0.2秒)を使った物理harnessで、D05共通5値のうちduration/recoveryの2軸を新規に固定した(`materialMapping.test.ts`「P56-4: D05共通較正値(duration/recovery)の証跡固定」、4件)。バースト中のomega変動を`effectiveInertia`のtest-only拡大(通常のJ_motorオーダーより5桁大きい値)で凍結し、コギング由来の電流振動・整流子不感帯通過による測定汚染を排除している(Q2 sweepのisolatedConfigと同種のtest-only isolation fixture)。

- `brushSparkDurationLimitS=0.15`は単一バースト内(24フレーム)のframe17(18フレーム目=0.15秒、0-indexed)でepisode到達することを実測固定した(バースト終了frame23より前)。
- `brushSparkDurationLimitS=CHATTER_BURST_FRAMES/120`(0.2秒、validatorが許す上限)は単一バーストの最終フレーム(frame23)でちょうど境界到達することを実測固定した。
- `brushSparkDurationLimitS`が0.2秒を超える値(validatorを迂回したtest-only値)は、単一バースト内では構造的に非到達(episodeCount=0のまま)であることを実測固定した。この値域自体の拒否は既存の「72. validateDestructionConfig: d05の新規値域」テストで別途固定済みであり、両者を合わせてvalidator側の拒否とランタイム側の非到達性が整合していることを確認した。
- `recoveryFrames=6`・`recoveryContactResistanceMultiplier=1.2`がno-opでないことを、同一motorState・同一destructionState(recoveryFramesLeftのみ0/6で分岐)からの`composeEffectiveMotorConfig`比較で実測固定した——`brushContactResistanceRatio`はrecovery活性時にbase(1.0)×1.2=1.2へ増加し、`computeElectricalState`で計算した実電流もrecovery活性時のほうが低い(実測: 非活性1.637896A→活性1.605186A)ことを確認した。

**Q15-2(接触抵抗両極の観測可能性)実測結果**

両極(`brush-copper-plate`: `brushContactResistanceRatio=1.3`〈悪化〉と`brush-precious-metal`: 0.5〈改善〉)を、production-valid motorConfig+motor-only文脈+`loadTorque=0.007Nm`(トルク制限領域)で窓平均定常RPM比較した(`materialMapping.test.ts`「Q15-2独立sweep受け入れ条件」)。

| ブラシ | 窓平均RPM(実測) |
|---|---|
| copper-plate(悪化側) | 354.836 |
| precious-metal(改善側) | 490.930 |

差率38.35%で明確に観測可能(受け入れ閾値5%を大きく上回る)。この構成は既存の較正値(`materialMapping.ts`の`brushContactResistanceRatio`)を変更せず、そのまま採用(Gate5受け入れ条件充足)。

**Q15-3(貴金属高電流ペナルティによる順位逆転)実測結果**

正式Fable裁定のGate5受け入れ条件3点をそれぞれ次のテストで実測した(`materialMapping.test.ts`「Q15-3独立sweep受け入れ条件」)。

1. **NORMAL_OPERATION非到達**: production-valid構成(`energy-run`×`battery-lithium-polymer`、`brush-precious-metal`、既定`brushPressure=0.3`)で自然完走し、`D05.episodeCount=0`・`cumulativeWearDeltaFraction=0`を実測(高電流ペナルティは未発火のまま)。
2. **高負荷での順位逆転**: motor-only高電流構成(`wire-silver`・`magnet-neodymium`・`gear-titanium`・`coilTurns:40`・`magnetDistanceMm:3`・`brushPressure:0.1`・固定`loadTorque=0.02`)で600step実測した累積摩耗(`cumulativeWearDeltaFraction`)は次のとおり、基礎摩耗率の順位(precious 0.7 < carbon 1.0 < copper-plate 1.5)から実効摩耗率の順位(precious 1.75 > copper-plate 1.5 > carbon 1.0)へ逆転することを直接確認した。**さらにP56-4指摘を受け、precious-metalの各D05 event自身のcauseLog(`theoreticalCurrentA`)から、理論電流が実際に3A(highCurrentPenaltyThresholdA)を超えていたことを直接assertする(コメント上の主張に留めない)よう是正した——実測: 6件全event中、最大theoreticalCurrentA=40.666317A。**

| ブラシ | 基礎摩耗率(`brushWearRateRatio`) | 高電流ペナルティ適用後の実効値 | 実測累積摩耗(600step) | episode数 |
|---|---|---|---|---|
| carbon(anchor) | 1.0 | 1.0(ペナルティなし) | 0.056354 | 6 |
| copper-plate | 1.5 | 1.5(ペナルティなし) | 0.076636 | 5 |
| precious-metal | 0.7 | 1.75(0.7×2.5、highCurrentPenaltyMultiplier適用) | 0.117902 | 6 |

3. **銅板超えの副次的帰結の明示報告**: 上表のとおり、precious-metal(0.117902)はcopper-plate(0.076636)を上回る——「大電流で急速に荒れる」という素材descriptionどおり、通常時最悪のcopper-plateすら高電流下では上回るという副次的帰結が実測で確認された(既存の`materialMapping.ts`のペナルティ較正値`highCurrentPenaltyThresholdA=3, highCurrentPenaltyMultiplier=2.5`は変更せず、そのまま採用)。

**採用値まとめ**: 本checkpointで変更したのは`d02`の`conductionScale`/`dissipationCoefficient`のみ(5箇所の共有test config literal)。Q15-2/Q15-3で検証した`materialMapping.ts`側の較正値(接触抵抗ratio・摩耗率ratio・高電流ペナルティ閾値/倍率)、およびD05共通値・D02のsmokeGaugeThreshold等はいずれも既存値をそのまま実測確認しただけであり、変更していない。**D01の2値(`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`)は、正式Fable補足裁定(D01較正、2026-08-11)により受け入れ条件3→3′・条件1→1′の改訂を経て確定済み**(上記D01較正証跡参照)。D02・D05共通値・ブラシ8値は正式Fable較正レビュー(2026-08-10)により採用確定済み(付帯条件3点も充足済み)。以上により、上記「全較正値の確定申請表」記載の全値がFable裁定を経て確定した。

---

### 13.2 ゲート6実装確定条件(Suu_mot3承認、2026-08-11、着手前固定)

Gate6(store fixture統合、3文脈、P3-2ゲート7と同型)の実装着手前に、Suu_mot3照合で確定した限定条件を記録する。対象: `src/store/__tests__/runOutcomeApplication.test.ts`への新規10件(#71〜#80、D01/D02/D05の3文脈fixture+原子性負例2件)。

1. **track-run分岐(#72/#75/#78)は#66/#68bと完全同型**: test-run実wrapper(`stepTestRunWithDestruction`)で内部一貫したevents/state/diffsを生成し、`replaySnapshot`のみ有効なtrack-run snapshotへ置換する。両snapshotは`track`/`courseLengthM`/`slopeRad`以外がdeny-list fingerprint(`runSnapshotConfigFingerprint`)で完全一致することを確認し、restore成功をassertする。track-run側のaccumulatorへ`stepTestRunWithDestruction`を呼ばないことを構築自体で示す。
2. **各正例は空虚な適用を禁止**: D01は実event発生・非終端・collapse diff・`collapsed`反映・newlyDiscoveredModesへの登録を明示assert。D02は実D02 event・`destructionTerminal`/`terminalModes`にD02が含まれること・burnout diff・rotorの`burnedOut`反映・新規発見を明示assert。D05は実episode event・非終端・`cumulativeWearDeltaFraction>0`・wear diff・brush wear増加・新規発見を明示assert——**D05のdiffはfinal state由来であり、event個数とdiff量を手で結び直さない**(diff量はfinal stateの`cumulativeWearDeltaFraction`から直接assertする)。
3. **test-run fixtureはproduction-validかつsnapshot単一出典を維持する**。車両構成(コース・車体パラメータ)の探索は許可するが、較正値・状態機械・受け入れ条件は変更しない。極端な条件や到達不能が判明した場合は値を動かさず停止し、実測とともに報告する。
4. **#79/#80(原子性負例)**: `missingEquipment`のroleが厳密一致することに加え、適用前inventoryをdeep cloneし、入力全体が非変異であることを直接assertする(#70と同型)。途中diffの部分適用は許さない。
5. **本ゲートはstore fixture統合であり、productionコード変更なしが既定**。実装中に変更の必要性が判明した場合は、変更せず停止して報告し、Suu_mot3の再照合を待つ(報告後に独断で進めない)。
6. **DoD**: 新規10件targeted成功、全69+ files全緑、`npm run build`・`npm run lint`・`npx tsc -p tsconfig.material-sweep.json`・`cmp AGENTS.md CLAUDE.md`・`git diff --check`。完了報告にはGate6差分stat、および`src/store/runOutcomeApplication.ts`・`src/store/saveStore.ts`・`src/materials/degradationApplication.ts`・`src/store/gameStore.ts`にGate6由来の差分がないことの確認を含める。

### 13.2.1 ゲート6完了記録(2026-08-11、Suu_mot3独立レビューP60〜P64是正史)

初回実装提出後、Suu_mot3の独立レビューで5ラウンド(P60〜P64)の是正を経て2026-08-11に最終照合通過した。値(D01/D02/D05/D07較正値)は一度も変更していない——是正はすべてfixture構築側(テスト専用のtrigger構成)に閉じている。

- **P60(較正値の実質差し替え違反)**: 初回実装は#71(D01)のD02/D07への抑制的上書き(conductionScale=5等)、#73/#74(D02)のconductionScale=5への上書き、#76〜78(D05)のbrushSparkCurrentThresholdA=1.0への引き下げなど、本条件3「較正値は変更しない」に対する実質的な違反を含んでいた(67番〈D07〉の旧schema-valid test-only値を前例として引用したが、これは本条件3を上書きする前例にはならないと指摘された)。あわせて`vehicleSnapshotInput`ヘルパーがoverrides.motorConfig/carConfigを渡してもinitialVehicleState/initialMotorStateが既定値から導出されたままという出典分裂(単一出典原則違反)が発覚し、最終motorConfig/carConfigを先に確定→その2値からinitialVehicleStateを導出する構造へ是正した(既存#63〜70への数値影響なしを回帰確認)。#73/#74への適用前event直接assert欠落(条件2)も是正した。
- **P61(電池素材軸の見落とし)**: D02 test-run/track-run(#74/#75)の到達可否理論分析が`batteryInternalResistanceRatio`(既定1.0=アルカリ相当)を固定したまま行われており、`materialMapping.ts`に実在するNiMH(ratio=0.3)・LiPo(ratio=0.15)という電池素材軸を見落としていた。反映すると理論上界V²/(4·R_battery)が7.5W→25Wへ改善し、実測到達点も大幅に改善したが、なお1.0(coilOverheatGaugeLimit)には届かなかった。
- **P62(「一部だけ正式写像」の不十分性)**: `batteryInternalResistanceRatio`という1フィールドだけを既定fixtureへ追加する構成は、fixture全体のproduction-valid性としては不十分と指摘された。`composeConfigFromMaterials`(正式素材写像パイプライン、`materialMapping.test.ts`の`pvMotorCar`と同型)を一度通した結果を出発点にし、player-adjustable値(coilTurns・magnetDistanceMm・gearRatio・axleFriction・slopeRad)のみをその上で変更する構成へ差し替えたところ、NiMH+magnet-neodymium+wire-silver+brush-precious-metal+gear-titaniumの素材選択+magnetDistanceMm=2(player-adjustable範囲下限)でD02 test-run/track-runが成立した。
- **P63(素材事実の二経路手入力)**: 「値」だけでなく「値の対応関係」もproduction-valid性の対象であるとの指摘。D01/D05が基底とする`goodMotorConfig`はmagnetStrength=1.0で実在磁石写像の最大値(neodymium=0.9)を超えており、またD01のmotorConfig磁石強度とd07.nonDemagnetizing、D05のbrush素材とd05 brushWear/highCurrentPenaltyが、それぞれ同じ素材事実を2つの別経路(手入力)から入力できる構造的な穴を残していた。`pvMotorCarForD02`を`pvMotorCarGate6`(`MaterialSelection`明示入力の汎用版)へ一般化し、#71〜78全件がこれを経由する構成へ統一。D01はmagnet-samarium-cobalt(実在nonDemagnetizing)を選び`mapD07DestructionConfig(magnetId)`からd07を自動導出、D05は`mapD05BrushWearConfig(brushId)`+`assembleD05Config`からd05を導出することで、二経路入力を解消した。track-run対(#72/#75/#78)は`createInitialVehicleState`を1回だけ呼びtest-run/track-run両snapshotで共有する構造へ修正した。
- **P64(既存assertの脱落)**: P63の全面書き直しの過程で、#76/#77/#78(D05)のstepループから既存の`expect(result.termination).toBeNull()`(D05非終端の直接固定、§13.2条件2)が脱落していたことが指摘され、全3箇所へ復元した。

**最終構成(素材選択)**: D01=NiMH+magnet-samarium-cobalt(nonDemagnetizing)+wire-silver+gear-titanium+brush-precious-metal。D02=NiMH+magnet-neodymium+wire-silver+gear-titanium+brush-precious-metal。D05=NiMH+magnet-neodymium+wire-silver+gear-titanium+brush-carbon。D02/D05のneodymium選択では、過負荷条件下でD07(磁石減磁、非終端)が相関して発火することがあるが、これは同一過負荷でコイル焼損・ブラシ摩耗と磁石熱が相関するという物理的に自然な現象であり、D02/D05固有のterminalModes/degradationDiffs/event直接assertは妨げられないことを確認済み。

2026-08-11、Suu_mot3独立レビュー(P64是正の再確認)により、§13.2の6条件すべてを満たすことが確認され、**Gate6(store fixture統合)は正式に通過した**。Fable追加裁定は不要と判断された。Gate7(最終docs/全体DoD確認)が解禁された。

---

## 14. 変更対象ファイル一覧・依存閉包(P13是正: 概算を排し実測値を記載)

### 14.1 変更対象ファイル(想定、alice_mot3所有)

| ファイル | 変更内容 |
|---|---|
| `src/engine/destructionModes.ts` | `advanceD02`/`advanceD05`新設、`D01Progress`拡張(`decayExposureRad`、P34是正で命名確定、5.2〜5.3節)、`DestructionConfig.d01`新設セクション(`decayExposureScaleRad`・`minEffectiveTurnsRatio`、5.3節)、`D02Progress`拡張(`smokingStarted`・`smokingStartedAtT`、Q8確定、3.5節)、`isD02SmokingActive`非永続派生関数新設(P39是正)、`D02CauseLog`拡張なし(3.1節の熱ゲージ瞬間値は既存フィールドで表現可能と判断した、0.4節#7の判断根拠を参照)、`D05CauseLog`拡張(`theoreticalCurrentA`追加、Q9確定、15.3節、人間再承認対象)、`DestructionConfig.d02`拡張(`conductionScale`・`dissipationCoefficient`・`smokeResistanceMultiplier`)、`DestructionConfig.d05`拡張(`brushWearRateRatio`・`highCurrentPenalty`〈判別union、Q15-4確定〉・`wearPerAmpSecond`・Q7確定`recoveryFrames`・`recoveryContactResistanceMultiplier`〈P31是正で追加〉)、`D05Progress`拡張(`cumulativeWearDeltaFraction`・`recoveryFramesLeft`Q7確定)、`DestructionFrameInput`拡張(`coilLossW`・`isChatteringThisFrame`・`angularVelocityRadS`)、D02/D05イベントのtemperature規約明記(D02=`uncalibratedGauge`、D05=`unavailable`、付帯条件・Fable指示) |
| `src/engine/destructionOrchestration.ts` | `composeEffectiveMotorConfig`のD01/D02/D05分岐追加、`buildMotorOnlyFrameInput`/`buildVehicleFrameInput`の新フィールド算出、`deriveDegradationDiffs`のD02拡張(events経路)+D05拡張(`_finalDestructionState`の未使用アンダースコアを外し`finalDestructionState`として実際に使用する初のモード、P37是正、8節)、validator拡張(11.2節)、`restoreRunSnapshot`のbase config専用制約追加(P29是正、5.3節)+D05 recoveryFramesLeft cross-validator追加(P41是正、7.2節) |
| `src/engine/motorPhysics.ts` | **改修あり**(v1の「無改修」は撤回): `computeElectricalState`(`effectiveTurnsRatio`をbackEmfへ)、`computeMagneticTorque`(`effectiveTurnsRatio`をtMagへ)、`computeContactResistance`(`brushContactResistanceRatio`)、`nextChatterState`(`brushChatterProbabilityRatio`)、`MotorConfig`インターフェースへの3フィールド追加(いずれも既定値で後方互換) |
| `src/materials/materialMapping.ts` | `mapBrushRatios`(MotorConfig層)・`mapD05BrushWearConfig`(DestructionConfig.d05層)・`assembleD05Config`(P36是正で新設、単一構築経路)新設、`BrushMaterialId`export、`composeConfigFromMaterials`拡張(brush選択の反映) |
| `src/engine/recipeCode.ts` | ブラシ2フィールドのキー追加(6箇所、6.4節)+`encodeRecipe`のfail-fast化(P3-3-Q14確定、P46是正で候補変更、シグネチャ〈`string`を返す〉自体は無改修、19呼出し中の成功系は無改修) |

### 14.2 依存閉包(pitfalls#2、`rg`実測、P24是正: 概算・内部矛盾を排し実測コマンド・出力を明記)

以下はすべて実装着手時ではなく**本書執筆時点(2026-08-09/10)に実行した`rg`の実測結果**であり、実装着手時に再実行して差分がないことを確認する(差分があれば本節を更新してから着手する)。

**型定義・validator参照箇所(型自体の拡張時に影響、フィールド追加はオプショナル拡張のため多くは型変更のみで実装変更を要しない)**:

- **`D01Progress`**: `rg -n "D01Progress" --type=ts` → **8箇所**(`destructionOrchestration.ts`: 594行目`validateD01ProgressShape`定義・683行目呼び出し=2箇所。`destructionModes.ts`: 114行目型定義・183行目`DestructionState.modes.D01`・315行目`advanceD01`引数・318行目返り値型=4箇所。`destructionModes.test.ts`: 160行目・172行目=2箇所。合計2+4+2=8)。
- **`D05Progress`**: `rg -n "D05Progress" --type=ts` → **4箇所**(`destructionOrchestration.ts`: 633行目`validateD05ProgressShape`定義・685行目呼び出し=2箇所。`destructionModes.ts`: 149行目型定義・185行目`DestructionState.modes.D05`=2箇所)。
- **`DestructionFrameInput`**: `rg -n "DestructionFrameInput" --type=ts` → **14箇所**(`destructionOrchestration.ts`: 17行目import・924行目`buildMotorOnlyFrameInput`シグネチャ・941行目コメント・947行目`buildVehicleFrameInput`シグネチャ=4箇所。`destructionModes.ts`: 211行目型定義・316行目`advanceD01`引数・335行目`advanceD03`引数・388行目コメント内・399行目コメント内・461行目`advanceD07`引数・499行目引数=7箇所。`destructionModes.test.ts`: 10行目import・17行目`frameInput`ヘルパー・303行目`extremeFrames`=3箇所)。新規フィールド追加時はこの14箇所すべてを確認し、フィールドを消費しない既存関数(`advanceD01`/`advanceD03`等)は型変更のみで実装変更不要であることを個別に確認する。

**`DestructionConfig.d02`/`d05`リテラルfixture箇所**: `rg -n "d02:\s*\{" --type=ts`・`rg -n "d05:\s*\{" --type=ts` → d02/d05とも同一の**6ファイル**構成(型定義1+テストfixture5、0.5節#と一致): `destructionModes.ts`(型定義、d02=81行目・d05=85行目)、`destructionModes.test.ts`(d02=2箇所〈35・330行目〉、d05=3箇所〈37・332行目、+境界テスト用途で値を変えた箇所を含む〉)、`destructionOrchestration.test.ts`(各1箇所〈75・77行目〉)、`runOutcomeApplication.test.ts`(各2箇所〈647/780行目・649/782行目〉)、`saveStore.test.ts`(各1箇所〈43行目・45行目〉)、`materialMapping.test.ts`(各4箇所〈962/1047/1059/1601行目・964/1049/1061/1603行目〉)。**v2の「7ファイル」という記載(自身の列挙とも矛盾していた、P24指摘)を実測どおり6ファイルへ訂正する。** validator側は`destructionOrchestration.ts`の299〜322行目(`DestructionConfigDraft`検証)・735〜746行目(raw shape検証)に集約されている。新規必須フィールド追加時はこの6ファイル全箇所+validator2箇所を機械的に追従する。

**`MotorConfig`(P24是正: 生の`rg`ヒット数〈型注釈・型引数として使われる箇所を含む35ファイル・多数行〉は変更範囲の実態を表さないため、役割別のownership境界で列挙し直す)**:

1. **`validateMotorConfigShape`**(`destructionOrchestration.ts` 467〜479行目): `optionalNumberFields`配列(472行目)へ新規オプショナルフィールド名3件すべて(`effectiveTurnsRatio`・`brushContactResistanceRatio`・`brushChatterProbabilityRatio`)を追加する(P29是正: `effectiveTurnsRatio`は`composeEffectiveMotorConfig`の戻り値型が`MotorConfig`である以上、型としては通常のMotorConfigフィールドであり除外できない、5.3節で訂正済み)。これを怠ると0.5節#15のとおり「型はあるが検証されない」サイレントホールになる。**必須の変更箇所**。加えて`restoreRunSnapshot`(779行目〜)の`validateMotorConfigShape(motorConfigRaw)`呼び出し(784行目)の直後へ、base configに限った追加制約(`effectiveTurnsRatio === undefined || === 1`、5.3節・P3-3-Q12)を実装する。**こちらも必須の変更箇所**。
2. **`recipeCode.ts`**(6.4節で確定した6箇所: `RECIPE_M_FIELD_KEYS`配列・`RecipePayloadV2/V3['m']`型定義・`normalizeMotorFields`・`motorConfigToFields`・`encodeRecipe`内リテラル・`recipeCode.test.ts`の`fullMotorConfig()`+ドリフト検査)。ブラシ2フィールドのみ対象、`effectiveTurnsRatio`は対象外(6.4節の区別どおり)。**必須の変更箇所**。
3. **`composeConfigFromMaterials`**(`materialMapping.ts` 317行目〜): `mapBrushRatios`の出力をMotorConfigのbrush2フィールドへ populate する分岐を追加(6.2節)。**必須の変更箇所**。
4. **`motorPhysics.ts`の式本体**: `computeElectricalState`(301行目付近、backEmf項)・`computeMagneticTorque`(312〜316行目、tMag項)・`computeContactResistance`(120行目、`export function`)・`nextChatterState`(201行目、非export、呼び出し元は413行目の1箇所のみ)。特に`nextChatterState`は現在`(brushPressure, chatterFramesLeft, rng)`という3引数シグネチャで`config`全体を受け取っていないため、`brushChatterProbabilityRatio`を渡すには**シグネチャ変更**(呼び出し元413行目も同時改修)が必要——単純な「configに新フィールドを足すだけ」では済まない、実装着手時に明記すべき具体的な変更点。既存回帰テストへの影響は`npx vitest run src/engine/__tests__/motorPhysics.test.ts`で実測済み(**49 tests、全件成功**、2026-08-10実測)——新フィールドはいずれも既定値1.0で既存結果を保つ設計のため、実装後もこの49件全件成功を維持することをDoDとする。
5. **その他のMotorConfigリテラル構築箇所(35ファイルに渡る`MotorConfig`という識別子の出現、型注釈込みで数百箇所規模)**: 上記1〜4以外の箇所(sweepスクリプト・UIコンポーネント・既存の物理テスト等)は、新規3フィールド(`effectiveTurnsRatio`・ブラシ2件)がすべてオプショナル(`?:`、既定値1.0)であるため**無改修のまま動作する**(Phase2 Step5aの`wireResistivityRatio?`等と同じ後方互換パターン)。個別の列挙は行わない(件数に実装上の意味がないため)。

**`MaterialSelection`(P24是正: v2の「25箇所」という生ヒット数を、実際の消費者3ファイルへ再構成)**: `rg -n "MaterialSelection" --type=ts -l` → `src/materials/materialMapping.ts`(型定義+`composeConfigFromMaterials`、2ヒット)・`src/materials/__tests__/materialMapping.test.ts`(fixture、13ヒット)・`scripts/materialSweep.ts`(sweepツール、10ヒット、本体契約とは別の消費者として明記)の**3ファイルのみ**。6.4節で確定したとおり`brushId: BrushMaterialId`を**必須フィールド**として追加し(`batteryId`と同格)、`materialMapping.ts`の型定義+`composeConfigFromMaterials`の実消費、`materialMapping.test.ts`の全fixture(`pvMotorCar`ヘルパー呼び出し箇所を`rg -n "pvMotorCar\("`等で個別に洗い出す)、`scripts/materialSweep.ts`の10ヒット(`V2_REGRESSION_ANCHOR_SELECTION`等の定数+`composeOrThrow`呼び出し)を**ゲート2(13節、P40是正)**で機械的に追従する。

**`gameStore.ts`/`testRunStore`**: P3-3のスコープはfixtureベース統合テストまで(P3-0-Q2裁定)であり、`gameStore.ts`自体への変更・実配線は本計画の対象外(P3-2と同型、6.5節のWearState次run反映の据え置きも同じ境界)。

**`encodeRecipe`(P46是正、pitfalls#2遵守——Q14の破壊的変更候補に対する事前列挙)**: `rg -n "encodeRecipe\(" --type=ts`(2026-08-10実測、5.3節に同じ結果を記載済み) → 定義`src/engine/recipeCode.ts`(1箇所)+呼出元`src/engine/__tests__/recipeCode.test.ts`(17箇所)・`src/store/__tests__/testRunStore.test.ts`(1箇所)・`src/components/RecipePanel.tsx`(1箇所)の**計19呼出し・3 consumerファイル**(定義ファイルを含め計4ファイル)。正式Fable裁定によりQ14は候補(a)〈Result型化〉が不採用となったため、この19箇所へのResult型追従(`.ok`判定の機械的追加)は**不要**。確定した候補(c)〈戻り値string維持+throw〉では、19箇所のうち**成功系の呼び出しは無改修のまま動作する**(新規のfail-fastパスに実際に入るテストケースを新設する場合のみ追加のテストコードが必要)。

---

## 15. 確定裁定一覧+人間再承認バンドル(P14是正: P3-3-Qn名前空間へ統一)

### 15.1 確定裁定項目(正式Fable技術レビュー条件付き承認、2026-08-09、全14件裁定確定)

| # | 内容 | 節 | 確定裁定 |
|---|---|---|---|
| P3-3-Q1 | D02コイル熱ゲージの駆動式(`computeRCoil`ベース、`coilLossW`新設) | 3.1 | **確定**: 承認(`coilLossW`ベース) |
| P3-3-Q2 | D02発煙抵抗倍率の具体形(単一固定値 vs ゲージ進行比例) | 3.1 | **確定**: 単一固定値 |
| P3-3-Q3 | D05摩耗換算経路(`cumulativeWearDeltaFraction`をD05Progress新設 vs deriveシグネチャ変更 vs event埋め込みのみ) | 4.4 | **確定**: 候補(a) |
| P3-3-Q4 | D01進行量の駆動式・入力単位(`angularVelocityRadS`新設+`COIL_DEFORM_OMEGA`超過分積分) | 5.2 | **確定**: 候補(b) |
| P3-3-Q5 | 実効巻数・占積減の表現方法(`effectiveTurnsRatio`新設〈実効巻数+占積の単一磁気結合率〉、振動は既存`coilCollapsePenaltyMm`が担当、motorPhysics.ts改修の是非) | 5.3 | **確定**: 承認(付帯条件: エネルギー整合コメント+49件回帰全成功) |
| P3-3-Q6 | ブラシ写像の層分離(MotorConfig層2フィールド+DestructionConfig.d05層3フィールド) | 6.2 | **確定**: 2層分離を承認 |
| P3-3-Q7 | D05一時接触抵抗悪化の実装方法(回復区間モデル vs 完全瞬断簡約の正式解釈 vs 有限高抵抗モデル) | 7 | **確定**: 候補(a)回復区間モデル+spec解釈確定(アーク後接触面荒れ) |
| P3-3-Q8 | D02発煙状態の可逆/不可逆(完全可逆 vs 不可逆latch vs 表示可逆+損傷latch) | 3.5 | **確定**: 候補(b)不可逆latch |
| P3-3-Q9 | `D05CauseLog`拡張の要否(`currentA`意味論上書き vs `theoreticalCurrentA`追加 vs 別名強度フィールド追加) | 15.3 | **確定**: 候補(b)`theoreticalCurrentA`追加(人間再承認対象) |
| P3-3-Q10 | recipeCode.tsキー名・MC3版上げ要否・`MaterialSelection.brushId`必須化 | 6.4 | **確定**: 3点とも承認(`bcr`/`bpr`キー追加、版上げ不要、`brushId`必須化) |
| P3-3-Q11 | `brush.wearFraction`の次run反映をP3-3で実装するかP3-4へ据え置くか | 6.5 | **確定**: P3-4据え置きを承認(D02/D04/D05/D07横断の共通経路) |
| P3-3-Q12 | `effectiveTurnsRatio`の型・restore・recipeの3契約(base専用の値制約を`restoreRunSnapshot`側に追加する設計の是非) | 5.3 | **確定**: 承認(`restoreRunSnapshot`784行目直後へbase専用制約、`validateMotorConfigShape`本体は汎用のまま) |
| P3-3-Q13 | `mapD05BrushWearConfig`出力+共通部分の単一構築経路(呼び出し側スプレッド vs `assembleD05Config`専用関数) | 11.3 | **確定**: 候補(b)`assembleD05Config`新設 |
| P3-3-Q14 | `encodeRecipe`のencode方向脱落防止(Result型化 vs base専用型分離 vs 戻り値string維持+throw vs 呼び出し規約のみ) | 5.3 | **確定**: 候補(c)戻り値string維持+throw(候補bはOmit型の過剰プロパティ検査回避により偽の安全と判定され却下) |

**再提出要否**: Fable裁定により、上記裁定反映が本裁定の範囲内であればFable再提出は不要。Suu_mot3差分照合→人間再承認バンドル(15.2節・`docs/phase3-p3-3-human-reapproval-bundle.md`)承認→ゲート0から実装着手へ進む。

### 15.2 人間再承認が必要な公開型・契約変更のバンドル(正式Fable裁定確定、独立ファイル化済み)

**正式Fable裁定(2026-08-09)により、以下13項目すべてが人間再承認対象として確定した(Q11・Q13は不要と裁定)。値・実装時期まで判断できる独立ファイルとして`docs/phase3-p3-3-human-reapproval-bundle.md`を作成済みであり、人間承認はこのファイルを参照して行う(本節は型変更の一覧・対応Qの記録として維持する)。**

| # | 対象 | 変更内容 | 対応するQ |
|---|---|---|---|
| 1 | `D01Progress` | `decayExposureRad`追加(P3-1-Q1裁定が事前に予告済み、P34是正で命名確定) | P3-3-Q4・Q5 |
| 2 | `DestructionConfig.d01` | 新設セクション(`decayExposureScaleRad`・`minEffectiveTurnsRatio`、P34是正で追加) | P3-3-Q5 |
| 3 | `DestructionConfig.d02` | `conductionScale`・`dissipationCoefficient`・`smokeResistanceMultiplier`追加 | P3-3-Q1・Q2 |
| 4 | `DestructionConfig.d05` | `brushWearRateRatio`・`highCurrentPenalty`(判別union、Q15-4確定で`highCurrentPenaltyThresholdA`/`highCurrentPenaltyMultiplier`のフラット2フィールドから変更)・`wearPerAmpSecond`・`recoveryFrames`・`recoveryContactResistanceMultiplier`(Q7確定、P31是正で追加)追加 | P3-3-Q3・Q6・Q7・Q15-4 |
| 5 | `DestructionFrameInput` | `coilLossW`・`isChatteringThisFrame`・`angularVelocityRadS`追加 | P3-3-Q1・Q4 |
| 6 | `D05Progress` | `cumulativeWearDeltaFraction`+`recoveryFramesLeft`(Q7確定)追加 | P3-3-Q3・Q7 |
| 7 | `MotorConfig` | `effectiveTurnsRatio`・`brushContactResistanceRatio`・`brushChatterProbabilityRatio`追加(いずれもオプショナル、既定値で後方互換) | P3-3-Q5・Q6 |
| 8 | `computeElectricalState`/`computeMagneticTorque`/`computeContactResistance`/`nextChatterState` | 式改修(`motorPhysics.ts`、既定値で既存結果を保つ後方互換改修) | P3-3-Q5・Q6・Q7 |
| 9 | `D02Progress` | `smokingStarted`・`smokingStartedAtT`追加(Q8確定、D04の`initiatingCauseLog`追加と同格。`isD02SmokingActive`は非永続派生関数のため型契約の変更ではない、P39是正) | P3-3-Q8 |
| 10 | `D05CauseLog` | `theoreticalCurrentA`追加(Q9確定) | P3-3-Q9 |
| 11 | `MaterialSelection` | `brushId: BrushMaterialId`必須フィールド追加(`batteryId`と同格) | P3-3-Q10 |
| 12 | `restoreRunSnapshot` | base config専用の追加値制約(`effectiveTurnsRatio === undefined \|\| === 1`)+D05の`recoveryFramesLeft <= config.d05.recoveryFrames`cross-validator(Q7確定、P41是正)を新設、既存の復元契約を厳格化する変更 | P3-3-Q12・Q7 |
| 13 | `encodeRecipe` | 戻り値型`string`は無改修(P46是正で候補変更)、誤用時(非1の`effectiveTurnsRatio`)のみthrowする新規failureモードを追加——19呼出し中の成功系は無改修、シグネチャ変更なしのため公開契約への影響は限定的だが新規failureモード自体は契約変更として記載 | P3-3-Q14 |

### 15.3 CauseLog拡張の要否(v2の判断をP17是正で再訂正、正式Fable裁定確定P3-3-Q9)

**v2の判断(D02は不要、D05も不要)は、D05について誤りだった(P17指摘)。** D02の熱ゲージ瞬間値は既存の`coilHeatGaugeRatio`フィールドで表現可能であり、新規CauseLogフィールドを要しないという判断は維持する。

**D05は再考が必要**: D05のepisode成立stepは定義上チャタリング中(0.5節#16)であり、そのstepの`frame.currentA`(実電流)は常に0である。`D05CauseLog`が`CauseLogCommon.currentA`をそのまま継承すると、検死ログが「このスパークは0Aで発生した」という誤解を招く記録になる(実際に強度を持つのは理論遮断電流`theoreticalCurrentA`のほう)。3案を提示する:

- **候補(a)——モード別の意味規約**: D05に限り`CauseLogCommon.currentA`の意味を「理論電流」と読み替える(モードごとに意味が変わる、既存の`CauseLogCommon`の統一的な意味〈実電流〉から逸脱する)。**非推奨**——フィールド名と意味の乖離が生まれ、他モードのcauseLogと並べて読むときに誤解を招く。
- **候補(b)(推奨)——`D05CauseLog`へ`theoreticalCurrentA`を追加**: 継承元`CauseLogCommon.currentA`は仕様どおり実電流(=0、チャタリング中の事実として正直に記録)のまま維持し、`D05CauseLog`固有の追加フィールド`theoreticalCurrentA: number`でスパーク強度を別途記録する。**人間再承認候補**(D05CauseLogへの新規フィールド追加、D04CauseLog拡張と同格)。
- **候補(c)——実電流0を正直に残し、別の強度量フィールドを追加**: 候補(b)と実質同型(強度量の名前を`theoreticalCurrentA`ではなく`sparkIntensityA`のような独立名にする案)。**alice_mot3推奨は候補(b)**——`theoreticalCurrentA`という名前は`DestructionFrameInput`側の既存フィールド名と一致しており、読み手が「あの理論電流のことだ」と直ちに理解できる。

**正式Fable裁定(確定P3-3-Q9)**: 候補(b)を裁定する。`currentA=0`(チャタリング中の実電流の事実)を正直に残し、強度は`theoreticalCurrentA`で別記する——「二つの真実を両方記録し、フィールドの意味をモード別に読み替えない」というP3-2-Q4(iii)と同じ原則。フィールド名の`DestructionFrameInput`との一致も正しい。**人間再承認対象。**

### 15.4 store 3文脈の扱い(P14是正、明記)

P3-2と同型——motor-only(`stepMotorWithDestruction`)・test-run(`stepTestRunWithDestruction`)は実wrapperを経由したfixtureテスト、track-run用の実wrapper(`stepTrackRunWithDestruction`)はP3-4まで未実装のため、track-run文脈は実wrapperが生成した内部一貫性のあるRunOutcomeのevents/state/diffsをそのまま使い`replaySnapshot`のみ有効なtrack-run snapshotへ差し替える方式(正式Fable P3-1-Q4(a)裁定と同型)に限定する。

**pitfalls#1遵守の明記**: 上記への正式回答は、人間プロジェクトリードの直接提示、またはSuu_mot3が中継したものだけを正式回答として扱う。alice_mot3はいかなるツールを用いてもFable名義の文書を自己生成しない。

---

### 15.5 P3-3-Q15: Gate2較正値の未承認混入審査(Suu_mot3指摘P48〜P50、正式Fable補足裁定確定、2026-08-10)

**背景**: ゲート2(materialMapping.tsのブラシ写像、`mapBrushRatios`/`mapD05BrushWearConfig`/`assembleD05Config`)の実装完了報告に対するSuu_mot3照合で、11.1節「較正値は本書で確定しない、sweep対象」および人間再承認バンドル冒頭「数値較正値はいずれも未確定であり、本バンドルでは型契約の変更のみを承認対象とする」という既承認契約に反する事象が3点指摘された(P48・P49・P50)。alice_mot3はdocs-only追補(v9)+独立Fable補足レビュー依頼書を提出し、正式Fable補足裁定(2026-08-10、人間プロジェクトリード直接提示・Suu_mot3中継確認済み)を受領した。**手続きの評価(Fable原文)**: 未承認値の混入(P48)は契約違反だが、ゲート照合が物理配線(ゲート4)前にこれを止め、alice_mot3が追加修正を凍結してdocs-onlyでエスカレーションしたことは、二段階承認の破れを効果が生じる前に多層レビューが検出した事例であり、プロセスは設計どおり機能した。15.5節(旧版)の根因分析(「型は完成値を要求するが値は未承認、という状態の表現手段が計画に存在しなかった」)も正確であり、実装者の過失ではなく契約設計のギャップと認められた。

#### Q15-1: P48(未承認具体値の混入)の裁定——案(a)確定+恒久再発防止規則

**事実関係**: `mapBrushRatios`/`mapD05BrushWearConfig`(materialMapping.ts)の実装時、以下の具体的な数値をproduction側の`BRUSH_MOTOR_CONFIG_RATIO_CANDIDATE`/`D05_BRUSH_WEAR_CANDIDATE`テーブルへ直接置いた: 接触抵抗ratio(銅板1.3・銀黒鉛0.7・貴金属0.5)・チャタリング確率ratio(貴金属0.7)・摩耗率ratio(銅板1.5・貴金属0.7)の**ratio類6個**、貴金属の高電流ペナルティ(閾値3A・倍率2.5)の**2個**、計**8個**(6.3節「較正自由度5値程度」という独立軸の概算とは別の指標)。11.1節・人間再承認バンドル前文の「値は未確定」契約に反しており、いずれのレビュー・承認過程でも審査対象になっていなかった。

**正式Fable裁定(確定)**: 案(a)——Gate2 production写像に暫定候補値を明示し、全値・根拠・Gate5での置換条件をFable裁定対象にする、を裁定する。案(b)(数値写像発効をGate5へ移す)は却下——`mapBrushRatios`というproduction関数に偽の値を返させることになり、「スタブ・プレースホルダを置かない」という本チームの規律への違反を、別の形でより深く犯す。型追加と実消費の同一ゲート原則(P40是正で確立)とも矛盾する。案(c)(命名規約)は単独では却下——コンパイル強制できず置換漏れを防げない(ただし既存の`_CANDIDATE`命名は検索性の補助として維持してよい)。

**恒久規則(再発防止の本体、確定)**: 「実装ゲートでproductionコードに較正数値を置く前に、その数値は初期候補値としてFable裁定を経ていなければならない。候補値はsweep受け入れ条件との対で最終報告の確定申請表に載り、人間のcommit承認をもって確定する」——これはP3-2で実際に踏まれた手順(Fableが初期候補1.5/0.95/0.10/0.15を裁定→実装→sweep→確定申請)の明文化である。**「値を書かない計画」は値の発明を防がない。審査を逃す経路を作るだけである。値は計画に書いて審査させる**——今後のステップ計画の「較正値候補一覧」(11.1節相当)には初期候補値の数値列を含めてFableレビューへ提出する(P3-2方式への統一)。11.1節冒頭の「値は本書で確定しない」は「値は本書で確定しない(初期候補はFable裁定を経て記載し、確定はsweep+最終報告で行う)」へ精密化する。

#### Q15-2: ratio類6個の裁定——全数承認+銅板の物理所見+Gate5受け入れ条件

**正式Fable裁定(確定)**: 6個すべて(接触抵抗ratio: 銅板1.3・銀黒鉛0.7・貴金属0.5、チャタリング確率ratio: 貴金属0.7、摩耗率ratio: 銅板1.5・貴金属0.7)を暫定候補値として承認する。

**物理所見(Fable原文)**: 接触抵抗の順位(銅板1.3>カーボン1.0>銀黒鉛0.7>貴金属0.5)は、素の銅が良導体であることと一見矛盾するが、実物の銅板ブラシは酸化被膜(半導体的な酸化銅)の形成により接触抵抗が急速に悪化・不安定化するのに対し、カーボンは自己潤滑で安定、銀黒鉛は実物のブラシ産業でまさに低接触抵抗が売りであり、貴金属は低電流精密モーターの定番である。この順位は承認済み6.3節の受け入れ表と実物の双方に整合する。

**条件(Gate5較正確定までに満たすこと)**: (i)銅板の値の根拠コメントに酸化被膜の1行を残す(materialMapping.tsへ反映済み、下記実装反映参照)。(ii)Gate5のsweep受け入れ条件へ「接触抵抗ratio差が定常計測で観測可能であること(少なくとも銅板と貴金属の両極間で、D07 Q2 sweepと同型の観測可能性確認)」を追加する。(iii)既定の受け入れ条件(6.3節順位表の両電流域での実証・prob clamp・NORMAL_OPERATION拡張列〈付帯条件1〉)はすべて維持する。

#### Q15-3: 貴金属ペナルティ2個の裁定——全数承認+スケール所見+Gate5受け入れ条件3点

**正式Fable裁定(確定)**: 閾値3A・倍率2.5を暫定候補値として承認する。

**スケール所見(Fable原文)**: 本エンジンの電流域(通常運用1〜2A級、held-short/失速域で数A超)に対し、3Aは「通常域の上端〜虐待域の入口」に座る妥当な出発点である。

**Gate5確定のための受け入れ条件3点**: (i)NORMAL_OPERATION構成では理論電流が閾値を超えず、貴金属が通常域で全軸最良のままであること。(ii)高負荷構成(M4条件2型)のスパークepisode中に理論電流が閾値を超え、貴金属の実効摩耗率(0.7×2.5=1.75)がカーボン・銀黒鉛(1.0)を上回る順位逆転が実測されること。(iii)副次的帰結として貴金属(1.75)が銅板(1.5)をも上回り高電流域の最下位になることは、承認済み表と矛盾しない(表は銅板との相対を規定していない)が、実測時に明示的に観測・報告し確定申請に記載すること(実物の貴金属接点がアーク下で破滅的に荒れるという物理と整合)。不充足時の調整順はQ13-3の原則を適用し、**倍率より先に閾値を動かす**(閾値がレジーム境界を支配するため)。

#### Q15-4: 不活性ペナルティ表現の裁定——候補(ii)判別union化確定(人間再承認対象)

**背景**: `highCurrentPenaltyMultiplier===1`の素材について、`highCurrentPenaltyThresholdA`という「本来ペナルティが発動する電流値」を何で埋めるかという契約穴が存在していた。旧実装は`validateDestructionConfig`の`isPositiveFinite`制約を満たすための有限な番兵値(999)を置いていたが、この値自体に物理的根拠はなかった。

**正式Fable裁定(確定)**: 候補(ii)——非ペナルティ/閾値ペナルティの判別union化を裁定する: `{ kind: 'noPenalty' } | { kind: 'thresholdPenalty'; highCurrentPenaltyThresholdA: number; highCurrentPenaltyMultiplier: number }`。

**理由(Fable原文)**: (1)番兵値999は根拠のない捏造値そのものであり、P3-2-Q11で同型の番兵(閾値1000)を既に却下している——候補(i)を採れば自身の裁定と矛盾する。(2)D07の`nonDemagnetizing`判別unionという承認済みの完全な前例があり、「状態が存在しないことを、無意味な値の代入なしに型で表現する」のは本チームの中核原則(不正状態は構築不能に)の適用である。(3)候補(i)の「意味のある共有値」も結局は別の発明値を要求し、「閾値はあるがペナルティなし」という死んだつまみを契約に残す——このつまみの解読コストはP3-4・Phase 5の全読者へ複利で課される。

**付帯条件(確定)**: (a)`thresholdPenalty`枝のvalidatorは`highCurrentPenaltyMultiplier > 1`(厳密、`>= 1`ではない)を要求する——`multiplier===1`の`thresholdPenalty`は`noPenalty`の重複表現であり、同一状態の二重表現を型から排除する(D05の`recoveryFrames`のno-op防止をsweep条件に留めた既裁定はそのまま——あちらはモード共通較正値で「意図的に軽微な効果」が正当な設計空間だが、こちらは素材別で倍率1=無ペナルティと厳密に同義)。(b)pitfalls#2の依存閉包8ファイルの実測列挙は十分と認める。実装着手時に`rg`再実行で差分ゼロを確認する。(c)**人間再承認を要する**(ゲート1確定済み`DestructionConfig.d05`の破壊的変更。人間再承認バンドル#4の追補として提出、`docs/phase3-p3-3-human-reapproval-bundle.md`参照)。

**依存閉包の再測定(実装着手前、差分ゼロ確認済み)**:
```
$ rg -l "highCurrentPenalty" src scripts | sort
src/engine/__tests__/destructionModes.test.ts
src/engine/__tests__/destructionOrchestration.test.ts
src/engine/destructionModes.ts
src/engine/destructionOrchestration.ts
src/materials/__tests__/materialMapping.test.ts
src/materials/materialMapping.ts
src/store/__tests__/runOutcomeApplication.test.ts
src/store/__tests__/saveStore.test.ts
```
15.5節(旧版)で実測した8ファイル(production3〈destructionModes.ts・destructionOrchestration.ts・materialMapping.ts〉+test5)と完全一致(差分ゼロ)。全8ファイルへ判別unionを反映済み(実装内容は本節末尾「実装反映」参照)。

#### Q15-5: P49(銀黒鉛摩耗契約の矛盾)の裁定——案(i)確定

**事実関係**: 6.3節の受け入れ条件表は「銀黒鉛: 高電流域の期待順位(wear rate)=上位(摩耗率自体はカーボンより有利のまま)」と記載していたが、直後の最小較正自由度段落は「銀黒鉛は`contactResistanceRatio`のみ改善」と記載しており、2つの文が同時には成立しなかった。ゲート2の実装・テストは後者に従い`brushWearRateRatio===1`(anchor同値)としていた。

**正式Fable裁定(確定)**: 案(i)——6.3節の表を「銀黒鉛: 高電流域=中位(摩耗率はカーボンと同値、優位は低接触抵抗のみ)」へ精密化し、最小自由度段落・現行実装と整合させる(6.3節へ反映済み)。spec/materials.ts原文が摩耗優位を記述していない以上、`wearRateRatio<1`(案ii)は物性の発明である。正式Fableの条件付き承認(2026-08-09)における「値を1つも発明していない」という評価は、この案(i)の解釈を前提としていたことがここで確定した。docs-only修正(実装変更なし、現行実装が結果的にi相当のまま)。

#### Q15-6: 人間再承認の個別判定(確定)

(1) Q15-1の手続き裁定(恒久規則の新設): 人間再承認**不要**(Fable裁定+台帳記録で足りる)。(2) 暫定候補値8個(Q15-2・Q15-3)の承認: 人間再承認バンドルの更新**不要**——バンドル前文「数値較正値はいずれも未確定」は引き続き真であり(候補値はsweep+最終報告の確定申請+人間commit承認で初めて確定する)、これはP3-2で人間承認が型バンドルのみを個別承認し、値はFable裁定→sweep→完了報告→commit承認の経路で確定した前例と同一である。ただし台帳(`docs/phase3-plan-v12-amendments.md`)のQ15エントリへ「値の確定経路はFable候補裁定→sweep→確定申請→人間commit承認」の1行を明記し、前文との関係を文書上で閉じる。(3) Q15-4(判別union化): **人間再承認必要**(上記、バンドル#4追補として提出済み)。(4) Q15-5(i)・P50・scripts文言訂正: 人間再承認**不要**、Suu_mot3照合で足りる。

#### Q15-7: Q6/Q13への影響(確定、設計変更なし)

設計変更は不要と裁定された。Q6(ブラシ2層分離)は不変。Q13の`assembleD05Config`は、`materialPart`側の型が判別unionを含む形へ精密化されるのみで、戻り値型注釈によるドリフト検出という設計の骨格はそのまま——むしろunion化により型検査の網が細かくなる。`commonPart`の構成(Q7(a)採用分込み)も不変。

#### P50: P3-2のD07数値回帰fixtureへprecious brushを混入させた/非anchor brush fixtureの監査(機械的是正、Fable裁定不要、記録として確認済み)

**事実関係**: ゲート2の`MaterialSelection`全消費者追従の際、`materialMapping.test.ts`の「P3-2ゲート5」describe内、P3-2で既に数値回帰として固定されていたD07受け入れ条件2/3の2箇所(`droopAtStep=21`/`irreversibleAtStep=28`等の実測値を固定するテスト)へ、`brushId: 'brush-precious-metal'`を割り当てていた。ゲート4で`brushContactResistanceRatio`等が実際に走行式へ効くようになると、この2fixtureのD07回帰結果にブラシ効果が混入し、P3-2で較正・承認された数値の意味が変わってしまうため、`brush-carbon`(anchor)へ是正した(実装反映済み)。

**Fable所見(裁定対象外だが記録)**: 1870/1902行のcarbon戻し(P3-2較正値の意味保存)・555/577行の現状維持(全軸非anchorのsmoke目的に整合)・464行のcarbon統一推奨、という分類はいずれも妥当と認める。`scripts/materialSweep.ts`の文言訂正も一括差分に含めてよい(実装反映済み)。

**非anchor brush fixtureの全数監査(`rg`実測、確認済み)**:

```
$ rg -nP "brushId: 'brush-(?!carbon)" src/materials/__tests__/materialMapping.test.ts
464:      brushId: 'brush-precious-metal',
555:      brushId: 'brush-precious-metal',
577:      brushId: 'brush-precious-metal',
2221:      brushId: 'brush-unknown-fixture' as BrushMaterialId,
```

(是正後、旧1870/1902行は`brush-carbon`へ変更済みのためこの一覧から外れた。2221行目は新設describe「P3-3ゲート2: ブラシ素材の写像」内の意図的な不正ID負例であり本監査の対象外。)

| 行 | 所属テスト | 目的 | 分類 | 対応 |
|---|---|---|---|---|
| 464 | 「4. 出力を再びbaseMotorConfig/baseCarConfigとして入力しても...(冪等性)」 | 冪等性の確認(構造比較のみ、固定数値へのハードコード比較なし)。テスト自身のコメントは「非anchor**電池**で明示確認する」であり、ブラシは非anchor化の対象として明示的に選ばれたものではない | 数値回帰ではないため厳密な混入リスクはないが、偶発的な非anchor化 | 現状維持(必須ではない軽微是正のためFable所見どおり見送り) |
| 555・577 | 「9a/9b. 合成写像の出力...NaN/Infinityが発生しない(smokeテスト)」 | 全軸を意図的に非anchorにして数値の有限性のみを確認する汎用smokeテスト | 目的に整合する非anchor使用 | 現状維持(Fable所見どおり) |
| (旧1870・1902) | 「受け入れ条件2/3」(P3-2 D07数値回帰) | P3-2較正値の固定数値回帰 | 他モードの固定数値回帰 | `brush-carbon`へ是正済み |

**実装反映(本節の裁定を単一の一括差分でsrc/へ反映済み)**: `destructionModes.ts`・`destructionOrchestration.ts`・`materialMapping.ts`とその関連test5ファイル(計8ファイル、Q15-4の依存閉包どおり)で`DestructionConfig['d05'].highCurrentPenalty`を判別unionへ変更、`multiplier > 1`厳密validatorを追加、raw shape validator(`validateD05HighCurrentPenaltyRawShape`)を新設。`materialMapping.ts`の接触抵抗ratioテーブルへ銅板酸化被膜のコメントを追加。6.3節の表をQ15-5確定案(i)へ精密化。`materialMapping.test.ts`の旧1870/1902行を`brush-carbon`へ、`scripts/materialSweep.ts`冒頭コメントを実装と一致する文言へ、それぞれ是正済み。`npx tsc -b`・`npm run test -- --run`・`npm run build`・`npm run lint`・`cmp`・`git diff --check`・依存閉包`rg`再測定(差分ゼロ)はいずれも17節の改訂履歴に確認コマンド・結果を記録する。

---

## 16. P3-4 UI申し送り(brabit_mot3、非スコープ確認)

UI実装(演出・HUD)はP3-3対象外であり、契約変更がなければUI v5をP3-3で編集しない(brabit_mot3読取監査確認済み)。P3-4のUI配線が前提とすべき事実を以下に固定する。

1. **D02(P22・P32・P39・P47是正、正式Fable裁定確定Q8=候補(b)を反映)**: 発煙のみは非終端で走行継続、発火(`coilOverheatGaugeLimit`到達)のみが`destructionTerminal`(§3.3・§10)。**「発煙中か否か」の表示判定は、UIが`coilHeatGaugeRatio`の生値を毎frame閾値比較して独自に再導出してはならない**(spec §7.1.1「破壊判定を行うのはエンジンのみ、UIが独自の破壊判定を持たない」原則)。Q8確定(不可逆latch)により、UIが読む対象は`D02Progress.smokingStarted`(persisted latch)の一択に定まる——UIは`smokeGaugeThreshold`等の閾値定数を自前で保持・比較せず、latch済みの真偽値をそのまま読むだけでよい。**標準UI入力経路(Fable裁定で確定、P47是正の一般化)**: `smokingStarted`は`D02Progress`(=`DestructionState`の一部)としてUIへ既に届くため新規のconfig読取経路は不要——将来、本件のような非永続の派生値(`isD02SmokingActive`相当)が別モードで必要になった場合も、wrapper/storeがconfigを使って計算しUIはbooleanだけを読む(候補B)という経路を標準とする(既存の「HUDはstep結果の読取専用」契約〈本節5〉を維持する唯一の形)。
2. **D05**: 毎episode(`justCrossed`成立ごと、§4.1)が演出対象。`isFirstThisSession`は図鑑初回性の判定にのみ使用し(2回目以降のepisodeもUI演出自体は行ってよい)、D05は常に非終端(`classifyTerminalModes`に分岐が存在しない、§10)。
3. **D01**: 漸減進行中(§5)も走行は継続し非終端(D01は元来非終端モード、spec §7.1.1)。
4. **演出はart-spec §7の12fps格子に従う**(engine側はロジック60fps/dt=1/120sのまま、演出タイミングの格子合わせはUI側の責務)。
5. **HUDはstep結果(`DestructionState`/`events`)の読取専用**とし、原因・閾値をUI側で再導出しない(spec §7.1.1「破壊判定を行うのはエンジンのみ」の既存原則、art-spec §5.2のHUD規約と一致)。

**art-spec既定の再確認(engineは関与しない、UI側の資料)**: D02煙は白→灰→黒(art-spec §6)、D02/D04の炎はFランプパレットサイクル、D05火花はY1→M3→N3、D01線材の暴れはM1。これらはart-spec §6の既存表そのものであり、P3-3はこの表に影響する型・契約変更を行わない。

---

## 17. 改訂履歴

- v1(2026-08-09提出): 初版。
- v2(2026-08-09提出): **Suu_mot3レビュー必須修正14点(P1〜P14)+D05一時抵抗悪化の可観測性追加指摘を反映。契約候補は変更したが、実装はまだ着手していない(docs-onlyのまま)。**
  - P1: D05積分式へ`isChatteringThisFrame && excessCurrentA>0`条件を追加し、非アクティブ時の再武装(`sparkDurationS=0`・`episodeTriggered=false`、`cumulativeSparkExposure`は保持)を含む状態遷移を完全定義した(4.1節)。
  - P2: D05の`episodeCount`・`firstEpisodeAtT`・`D05Progress.causeLog`(最初のepisodeのみ固定)とevent自身のcauseLog(episodeごとに瞬間値)の区別・`isFirstThisSession`の判定式を明記し、2episode実経路テストをDoDへ追加した(4.3節)。
  - P3: `deriveDegradationDiffs`がMotorConfig/DestructionConfigを受け取らない制約を踏まえ、`D05Progress`へ`cumulativeWeightedWearExposure`を新設し`advanceD05`が毎frame材料由来係数を畳み込む設計(候補a)へ変更、`cumulativeSparkExposure`との非二重出典の不変条件を明記した(4.4節)。
  - P4: D05の一時接触抵抗悪化について、回復区間モデル(候補a、推奨)・完全瞬断簡約の正式解釈(候補b)・有限高抵抗モデル(候補c)の3案を新設した(7節)。
  - P5: ブラシMotorConfig案(`brushContactResistanceRatio`等)が`motorPhysics.ts`改修を要することを明記し、変更ファイル表を訂正した(6.2節・14.1節)。
  - P6: `composeConfigFromMaterials`拡張(P3-3実施)とgameStore.ts実配線(P3-4延期)の区別を明記した(1.2節・6.2節)。
  - P7: 貴金属の交差非線形性の受け入れ条件表+カーボンanchor方式による最小較正自由度案を追加した(6.3節)。
  - P8: `effectiveTurnsRatio`(磁気結合の2式にのみ適用、R_coil/Jは実巻数のまま)という新候補へ差し替えた(5.3節)。
  - P9: `DestructionFrameInput.angularVelocityRadS`(平滑化前の生omega)を新設し、`rpm`と`COIL_DEFORM_OMEGA`の単位不一致を解消した(5.2節)。
  - P10: D02熱ゲージの駆動式を`computeRCoil`ベース(旧候補b)へ格上げし、発煙抵抗倍率の具体形をFable確認事項化した(3.1節)。
  - P11: D02/D05/D01の新規フィールドに対するvalidator交差不変条件+破損localStorage負例をDoDへ追加した(11.2節)。
  - P12: ゲート1(型契約)へ`buildXxxFrameInput`改修を統合し、各ゲート単独でtype-check/build可能な順序へ再構成した(13節)。
  - P13: `D01Progress`の算術矛盾(2+5+2=9なのに8と表記)を訂正し、全対象型の依存閉包を`rg`実測の確定値(概算・再実測予定という記載を排除)へ更新した(14.2節)。
  - P14: `D02CauseLog`/`D05CauseLog`への未具体化な追加候補を削除し、store 3文脈の扱い(track-runは手構築RunOutcome限定)を明記し、Fable確認事項の名前空間を`P3-3-Qn`へ統一した(15節)。
  - 追加指摘(D01回転曝露): `angularVelocityRadS`ベースの進行量駆動式に停止時ゼロの負例を追加、二重計上防止規則(既存`coilCollapsePenaltyMm`との合成式)を明記した(5.2節・5.3節)。
  - 追加指摘(D05一時抵抗の可観測性): チャタリング中の`current=0`強制により同stepの抵抗倍率が観測不能である問題を7.1節で明示し、回復区間モデルを推奨案とした。
  - 追加指摘(brabit_mot3読取監査、UI非スコープ確認): UI実装がP3-3対象外(P3-4配線まで延期)であることの確認に基づき、16節「P3-4 UI申し送り」を新設し、D02発煙のみ非終端・D05常に非終端・D01継続走行非終端・演出は12fps格子・HUDはstep結果読取専用、というP3-4 UI配線が前提とすべき事実を固定した。
  - 追加指摘(D02発煙の可逆/不可逆、Suu_mot3指摘): `D02Progress`が発煙開始状態をlatchするフィールドを持たず、単純な閾値再判定では冷却で煙・R_coil悪化が消えてしまう契約穴を3.5節で新設し、完全可逆(候補a)・不可逆latch(候補b、推奨、D04のstage開始パターンと同型)・表示可逆+損傷latch(候補c)の3案を比較し、validator・リプレイ・12fps表示・人間再承認への影響を表で整理した(P3-3-Q8として15節へ追加)。
- v3(2026-08-10提出): **Suu_mot3レビュー第2ラウンド必須修正12点(P15〜P26)を反映。契約候補・依存閉包の記載を訂正したが、実装はまだ着手していない(docs-onlyのまま)。**
  - P15: `recipeCode.ts`が`wireResistivityRatio`等を`wr`/`wz`/`br`/`bc`として実際にエンコード・デコードしているという事実誤認(v1/v2の「エンコード対象に含まれない」という記載)を訂正し、正確な関数名・行番号(`RECIPE_M_FIELD_KEYS`・`RecipePayloadV2/V3`型・`normalizeMotorFields`・`motorConfigToFields`・`encodeRecipe`内リテラル・`recipeCode.test.ts`のドリフト検査の計6箇所)を実測して明記した(0.2節・0.5節#13・6.4節・14.2節)。
  - P16: `MaterialSelection.brushId`を、既存`batteryId`必須フィールドの前例に倣い必須フィールドとして確定し、`composeConfigFromMaterials`の型追加と実消費を同一ゲートで実施する決定を新設した(6.4節)。
  - P17: D05のepisode成立stepが定義上チャタリング中(`frame.currentA`が常に0)であるため`D05CauseLog`が既存`CauseLogCommon.currentA`をそのまま継承すると誤解を招く、というP14で一度削除した論点を再訂正し、`theoreticalCurrentA`追加(候補b、推奨)を含む3候補を15.3節として復元した(P3-3-Q9)。
  - P18: `cumulativeWeightedWearExposure`が実際には無次元でなかった(A·s×ratioの次元が残っていた)欠陥を修正し、`DestructionConfig.d05.wearPerAmpSecond`(素材非依存の単一較正値)を新設して`advanceD05`が完全に無次元な`cumulativeWearDeltaFraction`まで積分する設計へ差し替えた(4.4節)。
  - P19: D05一時接触抵抗悪化のバースト終了検出を`frame.isChatteringThisFrame===true && frame.chatterFramesLeft===0`(既存/新設フィールドのみで導出、新規フィールド追加なし)として再定義し、`recoveryFramesActive`を`recoveryFramesLeft`へ改名、回復期間中の新規バースト優先規則を明記した(7.2節)。
  - P20: `DestructionConfig.d02`/`d05`・D01Progress・D05Progress・D02Progress(候補別)のvalidator交差不変条件を、値域・同値関係・片方向含意まで含めて完全列挙した(11.2節)。
  - P21: `effectiveTurnsRatio`の「MVP案 vs 3効果案、Fable裁定」という曖昧な枠組みを撤回し、実効巻数と占積を単一の磁気結合率として統合、振動増は既存`coilCollapsePenaltyMm`が担当すると明記することで、P3-1-Q1返済義務が暗黙に消失するリスクを解消した(5.3節・15.1節Q5)。
  - P22: §16「P3-4 UI申し送り」のD02記述を、3.5節で採用されうる候補(a/b/c)ごとにUIが参照すべき対象(比較式そのもの、または`smokingStarted`latch)を明示する形へ書き換え、UIが独自に閾値を再導出しないという原則(spec §7.1.1)と整合させた(16節)。
  - P23: `brush.wearFraction`の次run反映(摩耗した個体をロードアウトとして選んだ際のbase config反映経路)が本書のどこにも定義されていなかった欠落を6.5節として新設し、D04/D07にも同一ギャップが既に存在するという実装確認をもとに、P3-3では実装せずP3-4へ「D02/D04/D05/D07横断の共通経路」として明示的にledgerする裁定を記載した(P3-3-Q11)。
  - P24: §14を全面書き換えし、d02/d05リテラルfixtureの内部矛盾(「7ファイル」記載が自身の列挙〈5ファイル〉と不一致)を実測どおり6ファイル(型定義+テスト5)へ訂正、`MotorConfig`の依存閉包を生ヒット数(29箇所)からownership境界別(`validateMotorConfigShape`・`recipeCode.ts`・`composeConfigFromMaterials`・`motorPhysics.ts`式本体・その他無改修箇所)の枠組みへ再構成、`MaterialSelection`を実消費3ファイル(materialMapping.ts/materialMapping.test.ts/scripts/materialSweep.ts)へ精密化した(14.2節)。
  - P25: 存在しない節番号を参照していた「13.1節」(2箇所)・「13.2節」(1箇所)を実際の記載先「14.2節」へ訂正、空だった§12.4「C5負例」へ10節の2負例を転記、11.1節に残っていた`cumulativeWeightedWearExposure`時代の重複行(A·s重み付き→wearFraction変換係数)を削除、§12.1/§12.2間のD02記述の重複疑いを`rg`で再確認し実際には別内容(状態機械分岐 vs sweep受け入れ条件)であり重複ではないことを確認した。
  - P26: D02較正値(`conductionScale`等)が素材非依存の単一較正値でありD03と同じ規律に従うこと、production向け`DestructionConfig`既定値オブジェクトがD01〜D09いずれについても現時点で1つも存在しないこと(`rg`実測)、`mapD05BrushWearConfig`の出力が`composeConfigFromMaterials`の戻り値には含まれず呼び出し側でのオブジェクトスプレッド合成を経て既存validatorへ渡される2段階経路であることを、新設11.3節として明記した(P3-0-Q2の境界とは別の、materials層・validator層の設計確認であることを明示)。
- v4(2026-08-10提出): **Suu_mot3独立照合による第3ラウンド必須修正11点(P27〜P37)を反映。契約候補・依存閉包の記載を訂正したが、実装はまだ着手していない(docs-onlyのまま)。**
  - P27: 冒頭の作成表記が「v2」「v1→v2の位置づけ」のまま更新されていなかった自己同一性の不整合を訂正し、「v1→v4」としてv1〜v3累計49件の指摘を自己完結に要約した(冒頭)。見出し番号の重複疑いは`grep -n "^## "`/`grep -n "^### "`+`sort | uniq -c`で機械確認し、全見出し番号が1回のみ出現することを確認した(重複なし、report参照)。
  - P28: ゲート2(`mapBrushRatios`・`composeConfigFromMaterials`拡張)が参照する`MotorConfig`ブラシ2フィールドの型宣言が旧ゲート4まで存在せず、ゲート2単独では`tsc -b`が失敗する破綻を発見・是正した。「型宣言(ゲート1)」と「物理効果の実装(ゲート4)」を明確に分離し、ゲート1へ`MotorConfig`の3新規フィールド宣言・`validateMotorConfigShape`・`recipeCode.ts`6箇所・`MaterialSelection.brushId`をすべて集約、ゲート2本文へ`scripts/materialSweep.ts`追従を明示した(13節)。
  - P29: `effectiveTurnsRatio`について「§15.2はMotorConfigのoptional公開フィールドだが§14.2はMotorConfigではなく実行時合成値なのでvalidatorへ追加しない」という内部矛盾を発見・是正した。`composeEffectiveMotorConfig`の戻り値型が`MotorConfig`である以上、型としては通常のMotorConfigフィールドであることを認め、`validateMotorConfigShape`の`optionalNumberFields`へ追加する一方、RunSnapshotのbase configに限った追加値制約(`effectiveTurnsRatio === undefined || === 1`)を`restoreRunSnapshot`(784行目直後)へ新設するという3契約(型・restore・recipe)の整合案を確定した(5.3節、P3-3-Q12)。
  - P30: D02Progressのvalidatorが3.5節のQ8候補別追加条件だけを列挙し、既存`triggered`/`triggeredAtT`/`causeLog`自体の交差不変条件(現行`validateD02ProgressShape`には実装されていないことを実コード確認)を欠いていた自己完結性の不足を是正し、未発火3値のnull同値・発火時の非null・causeLog深部型検証を含む完全な不変条件として11.2節を書き直した。候補(b)の「必要なら`initiatingCauseLog`相当」という未確定の保留も、D02CauseLogが単一スカラーのみでD04のような分岐原因を持たないことを理由に「追加しない」と確定させた(3.5節)。
  - P31: 候補(a)採用時に状態機械が使用する`recoveryFrames`・回復時接触抵抗倍率が、`DestructionConfig.d05`型・値域validator・較正表・変更ファイル表・人間再承認バンドルのいずれからも欠落していたことを発見し、`recoveryFrames`(非負整数)・`recoveryContactResistanceMultiplier`(`>= 1`)という正式field名を確定して全箇所へ追加した(7.2節・11.1節・11.2節・14.1節・15.2節)。
  - P32: 16節のD02申し送りにあった「エンジン側の比較式をそのままUIへ渡す」(候補a)という表現が、直後の「UIは閾値を保持・比較しない」という原則と両立しない矛盾を発見・是正した。候補(a)にも新規`smokingActive: boolean`(非latch、毎frame再計算)を追加し、全候補でUIが真偽値のみを読む一意な設計へ統一した(3.5節・16節・15.2節)。
  - P33: `brushId`から写像した比率をrecipeCodeへも保存すると素材IDと派生比率という同一構成事実の二重入力が生じるのではという懸念を検証した結果、recipeCode.tsは元来素材ID自体(`wireId`等)を一切エンコードしない(派生済み数値のみをエンコードする)既存アーキテクチャであり、`MaterialSelection`は事後の同期対象ではないという既存precedent(wire/magnet/batteryと同型)を確認し、brush固有の新規二重入力防止バリデータは不要と結論した(6.4節、P3-1-Q9整合)。
  - P34: `D01Progress`の進行度フィールドが「`decayExposure`等」という仮名のまま具体化されていなかった不備を是正し、`decayExposureRad`(単位rad、初期値0、`triggered`前は0固定)という正式field名・更新式・新設`DestructionConfig.d01`(`decayExposureScaleRad`・`minEffectiveTurnsRatio`)による`effectiveTurnsRatio`への写像式・値域(`0 < effectiveTurnsRatio <= 1`保証)・単調性/clamp DoDを確定した(5.2節・5.3節)。
  - P35: `brushChatterProbabilityRatio`適用後の`prob`超過対策が較正値バリデータのみに依存していた点を是正し、`nextChatterState`実装自体による`[0,1]`clampを二次防御として追加した。`cumulativeWearDeltaFraction`の1超過については、既存`applyBrushDiff`(degradationApplication.ts)が既にdiff適用後の`wearFraction`を`clampFraction`している実装precedentを確認し、run中の累積値自体はclampせず最終適用時のみclampするという既存設計と一貫する結論を明記した(4.4節・11.2節)。
  - P36: `mapD05BrushWearConfig`出力とDestructionConfig.d05共通部分の合成を「任意のオブジェクトスプレッド」のまま複数箇所(fixture・将来のgameStore.ts)へ分散させると将来のフィールド追加時にドリフト検出手段がない問題を発見し、明示的な戻り値型注釈を持つ`assembleD05Config`専用純関数を新設し単一構築経路に統一する案を確定した(型注釈自体がコンパイル時ドリフト検査を兼ねる、`recipeCode.ts`の実行時配列型ドリフト検査より保守コストが低い、11.3節、P3-3-Q13)。
  - P37: `deriveDegradationDiffs(events, _finalDestructionState)`の第2引数が現行未使用(アンダースコア付き)で、D04/D07を含む既存の全diffが`events`配列に埋め込まれた値を読む統一パターンに従っている実コード上の事実を発見した。D05はepisode閾値未満の軽微な活動でも摩耗が蓄積されうるため(event 0件でもdiffが出るという既存DoD要件)、`events`ではなく`finalDestructionState`(未使用引数を初めて使用する)から直接読む必要があり、これがP3-0-Q6の「差分換算実装済みモードのみevent発行」不変条件に違反しないことを明示し、diffがevent個数に依存しないことを固定するホワイトリスト構造テスト+event0件のstore fixtureテストをDoDへ追加した(8節)。
- v5(2026-08-10提出): **Suu_mot3独立再照合による第4ラウンド最終修正8点(P38〜P45)を反映。契約候補・ゲート順・物理主張の記載を訂正したが、実装はまだ着手していない(docs-onlyのまま)。**
  - P38: 冒頭の「3ラウンド累計49件」が14+12+11=37の算術誤りだった(是正済みP38自体を含めると4ラウンド累計45件)ことを訂正し、§3.5が§3.3・§3.4より前に物理配置されていた本文順序を3.1→3.2→3.3→3.4→3.5へ並べ替えた(見出し番号自体は変更なし、物理位置のみ移動)。
  - P39: 3.5節の候補別`smokingActive`field集合が§14.1/§15.2の「全候補共通」という記載、および§11.2候補(a)の「新規フィールドを追加しない」という記載と矛盾していたことを発見した。根本的な設計変更として、`smokingActive`を`D02Progress`へのpersistedフィールドにすること自体を撤回し、`isD02SmokingActive(progress, config.d02)`という**非永続の派生純関数**へ置き換えた——これによりsnapshot保存時のconfig横断交差不変条件(新種のvalidatorパターン)が丸ごと不要になり、候補(a)は真に「新規フィールドなし」に戻った(候補b/cのみ`smokingStarted`という真に状態を持つpersistedフィールドを持つ)。
  - P40: ゲート1で`MaterialSelection.brushId`を必須化する一方、その消費(fixture・scripts/materialSweep.ts追従)をゲート2に置いていたため、ゲート1完了時点で単一tsconfig全体の既存`MaterialSelection`リテラルが軒並み型エラーになりゲート1が単独build不能だった(6.4節自身の「型追加と実消費は同一ゲート」という規律にも違反)。`MaterialSelection`側(materials層所有)の型追加+全消費をゲート2へ一括移動し、ゲート1は`MotorConfig`側(motorPhysics.ts所有)の型宣言に専念するというオーナーシップ境界に沿った分割へ是正した。ゲート1の限定DoDへ14.2節の全fixture・初期state・raw validator追従を明記し、「motorPhysics.ts無改修」という紛らわしい表現を「物理式は未改修」へ訂正した(13節)。
  - P41: Q7候補(a)採用時、`recoveryFrames=0`または`recoveryContactResistanceMultiplier=1`という値域上合法な「no-op構成」が一時抵抗悪化を実質無効化できてしまう問題と、破損snapshotが`config.d05.recoveryFrames`の上限を超える`recoveryFramesLeft`を持ちうる問題を発見した。前者はvalidatorでの一律禁止ではなくsweep受け入れ条件(production較正値の非中立性を要求)として扱い、後者は`restoreRunSnapshot`(effectiveTurnsRatioのbase制約と同じ箇所)へ`recoveryFramesLeft <= config.d05.recoveryFrames`のcross-validatorを追加して是正した(7.2節)。
  - P42: 11.3節の`assembleD05Config`シグネチャ例の`commonPart`型がQ7候補(a)採用時の`recoveryFrames`・`recoveryContactResistanceMultiplier`を欠いており、推奨案採用時に完成版`DestructionConfig['d05']`を構築できない不備を発見し、`commonPart`型を完成版全フィールドと一致させ、Q7の裁定結果がQ13の`commonPart`型を決定するという順序関係をFableへ明示した(11.3節)。
  - P43: `effectiveTurnsRatio`をrecipeへ収載しない方針(decode方向の安全性)だけでは、`encodeRecipe`がcompose後の非1の`effectiveTurnsRatio`を含む`MotorConfig`を誤って渡された場合にエラーなく静かに脱落させてしまうencode方向の問題を発見した。RunSnapshot base制約(decode方向)と対になる新規Q(`encodeRecipe`拒否 vs base専用型分離 vs 呼び出し規約のみ)として3候補を比較し、`encodeRecipe`のResult型化による拒否を推奨案として提示した(5.3節、P3-3-Q14)。
  - P44: 3.1節の「R_coil増→coilLossW増→熱蓄積加速」という正のフィードバック断定が、固定電圧系では一般に保証されない(R_coil増は電流減も同時に引き起こすため正味の方向は回路条件次第)という物理的な過大主張を発見・撤回した。正しい主張(「実効R・低下後の実電流から毎step独立にI²Rを再計算し、結合した帰結を捏造しない」)へ差し替え、`smokeResistanceMultiplier`の実際の副作用(加速/鈍化/ほぼ無変化)はsweep実測で報告する対象へ切り替えた(3.1節・11.1節)。
  - P45: ゲート1の型・fixture表からQ7/Q8/Q9の採用案で追加される`D02Progress`・`D05CauseLog`・`D05Progress`・d05回復configが読み取れなかった不備を是正し、「Fable裁定が確定した候補分のみを着手時点でゲート1へ同時追加する」という順序を明示した。またQ13採用時の`assembleD05Config`(ゲート2)にゲート3のproduction-valid fixtureが依存するという順序をゲート3の行へ明記した(13節)。
- v6(2026-08-10提出): **Suu_mot3最終照合による要追補2点(P46〜P47)を反映。大枠・ゲート順・Q1〜Q13は通過方向との評価を受けた上での最終調整であり、実装はまだ着手していない(docs-onlyのまま)。**
  - P46: Q14で破壊的なResult型化を推奨しつつ依存閉包を「採用確定後に洗い出す」としていたことがpitfalls#2(既存型の破壊的変更計画は事前に依存閉包を列挙する)に違反していたと指摘され、`rg -n "encodeRecipe\("`実測(定義1箇所+呼出元19箇所〈recipeCode.test.ts17・testRunStore.test.ts1・RecipePanel.tsx1〉、計3 consumerファイル)を計画へ記載した。あわせて「戻り値string維持+非1のeffectiveTurnsRatioでthrowするfail-fast案」を第4候補として追加し、19呼出しの成功系APIを一切破壊しないという利点から推奨案をResult型化からこちらへ差し替えた(5.3節・14.2節、P3-3-Q14)。
  - P47: Q8候補a/cが`isD02SmokingActive(progress, config.d02)`という非永続の派生関数に依存する一方、UIは現行`DestructionConfig`を一切読めない(P3-0-Q2でproduction配線がP3-4延期中、既存UI契約はDestructionState/eventsの読取専用)という未確定のまま残っていたUI入力経路を明示した。「UIへconfigの読取専用参照を渡す」案と「wrapper/storeが派生結果(boolean)を計算しUIはbooleanだけ読む」案の2候補を比較し、既存UI契約(config非読取)を変更せずに済む後者を推奨案としてFable裁定対象へ含めた。この経路自体の実装配線はP3-3のスコープ外(P3-4)であり、本書は契約の決定のみを行う(3.5節・16節)。
- v7(2026-08-10提出): **v6がSuu_mot3最終照合を通過し、`docs/phase3-p3-3-fable-review-request.md`により正式Fable技術レビューへ提出された。正式Fableレビューは条件付き承認(2026-08-09、人間プロジェクトリード直接提示、Suu_mot3中継確認済み)。Q1〜Q14全件の確定裁定+付帯条件7点+人間再承認バンドル13件をすべて反映した。**
  - **総合判定**: 条件付き承認。実装開始を妨げる必須修正なし。v6は「本フェーズで最も監査品質の高い計画」と評価された——0.4節#8〜#12の実コード発見(チャタリング中の電流0強制、coilTurnsの4箇所結合、平滑化rpmの単位問題)が、Q5・Q7・Q9の設計の前提になっていることが特に評価された。
  - **Q1〜Q14の確定裁定**: 15.1節の表を「推奨案」から「確定裁定」へ全面更新し、各Qの該当節(3.1・3.5・4.4・5.2・5.3・6.2・6.4・6.5・7.2・11.3・15.3)へFableの裁定文をそのまま記録した。Q1(確定候補承認+P44是正の評価)・Q2(単一固定値)・Q3(候補a)・Q4(候補b)・Q5(承認+エネルギー整合コメント条件)・Q6(2層分離承認)・Q7(候補a+アーク後接触面荒れの解釈確定)・Q8(候補b不可逆latch+UI標準経路候補Bの確定)・Q9(候補b)・Q10(3点承認)・Q11(P3-4据え置き承認)・Q12(承認)・Q13(候補b)・Q14(候補c+候補bの偽の安全という却下理由強化)。
  - **ゲート1の条件付きfield集合を確定集合へ収束**: Q7=候補a・Q8=候補b・Q9=候補bの確定により、13節ゲート1表の「Fable裁定後にのみ追加する」という条件分岐記述を、無条件の確定フィールド集合へ書き換えた。
  - **付帯条件7点の反映**: (1)ゲート5でP3-2-Q13-2の`NORMAL_OPERATION`15組合せ表をD01/D02/D05新モード込みで再実測(13節)。(2)D02/D05イベントのtemperature規約明記(D02=`uncalibratedGauge`、D05=`unavailable`、13節)。(3)4.1節疑似コードへ`justCrossed`成立時の`episodeTriggered=true`設定を補記。(4)6.5節のP3-4申し送りへ`RotorAssemblyState.collapsed===true`個体の装備拒否を追加。(5)Q5のエネルギー整合コメント(K_E=K_T相反性)を5.3節へ記録。(6)Q7の解釈段落(アーク後接触面荒れ)を7.2節へ記録。(7)Q14のthrow文言への裁定参照を5.3節へ明記。
  - **台帳化**: `docs/phase3-plan-v12-amendments.md`へ「P3-3-Q1〜Q14」エントリ(改訂8)を新設し、Q1〜Q14の要旨+人間再承認要否+付帯条件7点を記録した。人間再承認バンドル13項目を`docs/phase3-p3-3-human-reapproval-bundle.md`として独立ファイル化した(型・実装時期まで判断できる形、値はゲート5較正sweep後に別途報告)。
- v8(2026-08-10提出): **Suu_mot3のv7+台帳+再承認バンドル実質内容照合(裁定内容は正式Fable原文と一致)を受け、未裁定版当時の未来形・条件形の言い回しが確定済み節に残っていた最終文言収束7点を反映。契約変更・Fable再提出は不要(Suu_mot3指示どおりdocs-onlyの文言修正のみ)。**
  - 1. §13「確定ゲート構成」見出しの重複疑いを`grep`で再確認したが、実体としての重複行は見つからなかった(590行目に1箇所のみ、739行目の改訂履歴内言及は正当な過去形記述)——report参照。
  - 2. §3.5末尾「Fableへの確定裁定事項(P3-3-Q8)とする」を「正式Fable裁定により候補(b)〈不可逆latch〉で確定済み(P3-3-Q8)」へ変更。
  - 3. §6.4「Fableへの確定裁定事項に追記(P3-3-Q10)」を「正式Fable裁定で確定済み(P3-3-Q10)」へ変更。
  - 4. §12.7のencodeRecipe DoD「候補c採用時」を「P3-3-Q14確定」へ変更。
  - 5. §14.1 recipeCode.ts行の「候補c採用時」を「P3-3-Q14確定」へ変更。§14.2 encodeRecipe依存閉包を「Q14は候補(a)が不採用となったため19箇所へのResult型追従は不要」「確定した候補(c)では成功系は無改修」という確定形へ書き換え。
  - 6. §13ゲート3の「Q13採用時」を「P3-3-Q13確定により」へ変更。§15見出し「Fableへの確定裁定依頼Q一覧+人間再承認候補バンドル」を「確定裁定一覧+人間再承認バンドル」へ変更。
  - 7. `docs/phase3-p3-3-human-reapproval-bundle.md` #12の「cross-validatorを追加(候補a採用時)」を「cross-validatorを追加(P3-3-Q7確定により)」へ変更。
  - 比較案を説明する本文中の「候補(a)/(b)/(c)」表記(3.5節・5.3節・7.2節の候補比較そのもの等)は裁定理由の記録として維持した(Suu_mot3の指示どおり)。
- v9(2026-08-10提出): **ゲート0・ゲート1・ゲート2の実装完了後、ゲート2完了報告に対するSuu_mot3照合で契約違反3点(P48〜P50)が指摘され、新設15.5節「P3-3-Q15」として問題と選択肢を整理した(docs-onlyの追補、production/test修正は行っていない)。**
  - P48: `mapBrushRatios`/`mapD05BrushWearConfig`(ゲート2)へ具体的な較正値(接触抵抗ratio3個・チャタリング確率ratio1個・摩耗率ratio2個のratio類6個+高電流ペナルティ閾値/倍率2個、**具体値8個**——6.3節「較正自由度5値程度」という独立軸の概算とは別の指標であり混同しない、P51是正)を直接置いたことが、11.1節「較正値は本書で確定しない、sweep対象」・人間再承認バンドル前文「数値較正値はいずれも未確定」という既承認契約に反することを認め、(a)暫定候補値を明示しFableへ個別裁定を仰ぐ、(b)数値写像の発効をGate5へ移しGate2〜4はtest-only値で契約実証する、(c)命名規約等による機械的検出、の3案を比較した。あわせて「ペナルティ無効化」を表す`highCurrentPenaltyThresholdA`の番兵値(999、根拠なし)についても、(i)完成型のまま意味のある共有値を置く、(ii)非ペナルティ/閾値ペナルティの判別union化(契約変更、pitfalls#2対象)の2案を比較した(15.5節)。
  - P49: 6.3節の受け入れ条件表(「銀黒鉛は高電流域でも摩耗率自体はカーボンより有利」)と直後の最小較正自由度段落(「銀黒鉛はcontactResistanceRatioのみ改善」)が同時に成立しないこと、現行実装/testが後者(anchor同値)に従っていることを認め、(i)表をanchor同値へ精密化、(ii)摩耗率<1を写像、の2案を比較した(15.5節)。
  - P50: `materialMapping.test.ts`のP3-2 D07数値回帰fixture(受け入れ条件2/3、1870・1902行目)へ`brush-precious-metal`を割り当てたことが、ゲート4配線後にP3-2較正値の意味を変えてしまうことを認め、`brush-carbon`への是正(Fable裁定不要、P48/P49と同一の一括差分で反映)を確定した。あわせて全非carbon brush fixture(`rg`実測、6箇所)を監査し、目的整合性を表で分類した。scripts/materialSweep.ts冒頭コメントの文言不一致(全selection固定と書きながら実際は192combo scanのみ固定)も同一差分での是正対象とした(15.5節)。
- v9早期照合是正(2026-08-10、P51、Suu_mot3早期照合メモへの対応、docs-onlyのままversion番号は据え置き): P48候補(ii)の依存閉包を「4ファイル」という誤記から`rg`実測どおり8ファイルへ訂正し、非carbon fixture監査のrgコマンドを`-P`(負の先読み対応)へ修正した。「具体値の数え方」を新設し、6.3節の「較正自由度5値程度」(独立軸の概算)と、今回production定数として実際に置いた具体値の個数(ratio類6個+高電流ペナルティ2個=**8個**)が別指標であることを明記し、Fable補足レビュー依頼書の必須回答を6項目(3案選択/ratio6個の妥当性/高電流2個の妥当性〈別問題〉/不活性threshold構造i-ii/銀黒鉛i-ii/各裁定の人間再承認要否)へ再構成した。
- v10(2026-08-10提出): **正式Fable補足裁定(P3-3-Q15、2026-08-10、人間プロジェクトリード直接提示・Suu_mot3中継確認済み)を反映し、Q15是正をproduction/testへ実装した。**
  - **手続きの評価(Fable原文)**: 未承認値の混入(P48)は契約違反だが、ゲート照合が物理配線(ゲート4)前にこれを止め、alice_mot3が追加修正を凍結してdocs-onlyでエスカレーションしたことは、二段階承認の破れを効果が生じる前に多層レビューが検出した事例であり、プロセスは設計どおり機能したと評価された。
  - **Q15-1(P48)**: 案(a)〈暫定候補値を明示しFableへ個別裁定〉を確定。案(b)〈test-onlyダミー値でGate2〜4を通す〉は「スタブ・プレースホルダを置かない」という規律への違反として却下、案(c)〈命名規約のみ〉は単独では実効性不足として却下。恒久再発防止規則(「較正数値をproductionへ置く前に初期候補値としてFable裁定を経ること、確定はsweep+最終報告+人間commit承認」)を新設し、11.1節冒頭へ反映した。
  - **Q15-2(ratio類6個)**: 全数承認。銅板の接触抵抗悪化(1.3)に「実物は酸化被膜により接触抵抗が悪化する」という物理所見(良導体という直感との見かけ上の矛盾を解消)を得て、materialMapping.tsのコメントへ反映した。Gate5受け入れ条件(接触抵抗ratio差の定常計測観測可能性)を11.1節へ追加した。
  - **Q15-3(貴金属高電流ペナルティ2個)**: 全数承認。「3Aは通常域上端〜虐待域入口として妥当」というスケール所見を得て、Gate5受け入れ条件3点(NORMAL_OPERATION非到達・高負荷での順位逆転実測・銅板超えの副次的帰結の明示報告)を確定した。
  - **Q15-4(不活性ペナルティ表現)**: 候補(ii)〈判別union化〉を確定(人間再承認バンドル#4追補対象)。理由は番兵値999がP3-2-Q11の同型番兵却下と矛盾すること、D07の判別union前例との整合、死んだつまみの解読コストの複利負担。付帯条件として`thresholdPenalty`枝の`multiplier > 1`厳密検証を新設し、依存閉包8ファイル(destructionModes.ts・destructionOrchestration.ts・materialMapping.tsとその関連test5)へ実装した(4.4節・6.2節・11.1〜11.3節・14.1〜14.2節・15.5節へ反映)。
  - **Q15-5(P49)**: 案(i)〈6.3節の表をanchor同値へ精密化〉を確定。spec/materials.ts原文が摩耗優位を記述していない以上、案(ii)〈摩耗率<1〉は物性の発明と判定された。6.3節の表を精密化した(実装変更なし)。
  - **Q15-6**: 人間再承認要否を個別判定——Q15-1〈手続き〉・Q15-2/Q15-3〈暫定候補値〉・Q15-5〈docs修正〉・P50〈機械的是正〉はいずれも不要、Q15-4〈判別union化〉のみ必要(人間再承認バンドル#4追補、`docs/phase3-p3-3-human-reapproval-bundle.md`)。
  - **Q15-7**: Q6(ブラシ2層分離)・Q13(`assembleD05Config`の戻り値型注釈)への設計変更は不要と確定(union化はmaterialPart型の精密化のみ)。
  - **P50実装**: `materialMapping.test.ts`の旧1870/1902行を`brush-carbon`へ、`scripts/materialSweep.ts`冒頭コメントを実装と一致する文言へ、それぞれ是正した。
  - **検証**: `npx tsc -b`・`npm run test -- --run`(1354件全通過)・`npm run build`・`npm run lint`(oxlint)・`cmp AGENTS.md CLAUDE.md`・`git diff --check`いずれも成功。依存閉包`rg`再測定は実装着手前後とも8ファイルで差分ゼロ。`src/store/gameStore.ts`・`src/engine/vehiclePhysics.ts`・`src/engine/trackPhysics.ts`は無変更。
  - Q15-4の人間再承認完了まで、ゲート3・commit/tag/pushには進まない。
- v11(2026-08-10提出): **Q15-4人間再承認確定後、ゲート3(`advanceD02`/`advanceD05`状態機械+`deriveDegradationDiffs`拡張)を実装・報告したところ、Suu_mot3照合により契約間の矛盾(P54)が発覚し、ゲート3〜5を「統合較正閉包」として再編する13.1節を新設した(docs-only、実装順/完了境界の是正)。**
  - **P54(発覚した契約間の矛盾)**: ゲート3で`advanceD02`をactivateすると、既存の`Q13-2 NORMAL_OPERATION`15組合せ表(P3-2ゲート5是正版で確立済み、ゲート3以前はD02が判定関数を持たず常に非発火だった)がD02を実際に評価するようになるが、D02の較正値(`conductionScale`・`dissipationCoefficient`等)はゲート4(`composeEffectiveMotorConfig`のD02分岐・発煙R_coil重ね掛け)・ゲート5(D02専用M4型sweep)を経て初めて正しく較正できる値であり、ゲート3の時点では意味のある値を較正しようがない。その結果、12.8節「各ゲート単独で`npm run test`が全成功する」という原則と、「ゲート3でadvanceD02を先に有効化し較正はゲート5まで行わない」というゲート順序が両立しないという矛盾が生じた(2026-08-10のゲート3完了報告で9組合せの失敗として発覚。`advanceD02`自体の実装ミスではなく、計画のゲート分割設計が依存関係を見落としていたことによる)。
  - **裁定(確定、Suu_mot3、契約変更なし)**: 契約・物理式・較正条件・最終DoDを一切変えず、ゲート3〜5を単一の「統合較正閉包」として再編する13.1節を新設した。ゲート3(状態機械checkpoint、targeted新規テストのみ全成功要求、`Q13-2 NORMAL_OPERATION`表のD02由来の赤は閉包完了までの既知の診断結果として許容)→ゲート4(物理効果checkpoint、既定範囲のまま実施、失敗がD02未較正由来に限定されることを都度確認、それ以外の失敗は一切許容せず停止)→ゲート5(較正sweep checkpoint、D01/D02/D05較正+`Q13-2 NORMAL_OPERATION`拡張列の正式再実測、ここで初めて全体を緑化)という3段階の完了境界を明記した。`skip`/`only`/filterによるevent隠蔽・assertion弱体化・暫定数値による緑化はいずれも明示的に禁止する(P3-3-Q15-1の恒久規則〈較正値はFable裁定→sweep→確定申請→人間commit承認の経路のみで確定する〉と同じ理由)。実装順序・完了境界の是正であり新規の物理契約ではないため、Fable再提出・人間再承認は不要と裁定された。
  - 12.8節「各ゲート単独で`npm run test`が全成功する」を精密化し、ゲート0・1・2・6・7にはそのまま適用、ゲート3〜5(統合較正閉包)についてのみ閉包の最終点(checkpoint 5)で満たされることを要求すると明記した。
  - ゲート3・4・5の変更ファイル一覧・依存閉包(14節)自体には変更がないため14節は無改訂。
- v12(2026-08-10提出): **checkpoint4(composeEffectiveMotorConfigのD01/D02/D05分岐+motorPhysics.ts式改修)を実装したところ、全suite失敗が9件→19件へ拡大し、Suu_mot3独立診断(P55)により根因閉包・許容範囲を精密化した(docs-only、実行順の精密化)。**
  - **P55(独立診断結果)**: checkpoint4の実効config結線自体に契約逸脱・実装誤りは見つからなかった。19件はいずれも、未較正のD02が統合wrapper内で実際に発煙latch(`smokingStarted`)へ到達し、`smokeResistanceMultiplier`による`wireResistivityRatio`変化がP3-2由来のM4/D07 sweepへ連成した結果である——M4条件1/2はいずれも毎step`composeEffectiveMotorConfig`を通し同じ`DestructionConfig`内の未較正D02を実行し、D07通常回帰・Q2定常RPMテストは`D07 config`は分離しているが`D02`は分離しておらずD02も進行するため、Q13-2表だけでなくこの4件も同じ根因閉包に属すると判定された。
  - **裁定(確定、Suu_mot3、契約変更なし)**: 新設13.1.1節で、checkpoint3〜4が許容する赤を「正確な19テスト」(Q13-2全15組合せ+M4条件1完走step回帰1件+M4条件2 swelling到達step回帰1件+D07通常maxGauge回帰1件+Q2独立sweep droop定常RPM判定1件)として列挙し、20件目・別ファイル・別describeの失敗、または失敗の性質が「D02発煙→R変化」以外(例外・NaN・schema破損等)へ変わった場合は即時停止と明記した。checkpoint4完了報告には、追加4件それぞれについて`smokingStarted`成立・初回成立step・その後のR_coil実効倍率・最終status/主要観測値を一時診断(productionへ残さない)で示すことを要求した。
  - 新設13.1.2節で、checkpoint5(較正sweep)の回収条件(Q13-2 15組合せの契約充足・M4通常/高負荷の既存契約維持・D07通常/droopの既存契約維持・Q15追加条件充足・全体緑化)を明記した。
  - `skip`/`only`/filter・assertion弱体化・test-only魔法値による緑化・期待値の黙示更新の禁止を改めて明記した(P54・P3-3-Q15-1の恒久規則と同じ強さ)。
  - 実装順序の精密化であり新規の物理契約・較正値の裁定ではないため、Fable再提出・人間再承認は不要と裁定された。
- v13(2026-08-10提出): **checkpoint4完了報告(19件が正確な列挙と一致、性質変化なし)がSuu_mot3照合を通過した後、checkpoint5(較正sweep)を実施し、ゲート3〜5「統合較正閉包」を完了した。新設13.1.3節に較正候補→実測→採否の記録を追記した。**
  - **D02較正**: `d02.conductionScale`/`d02.dissipationCoefficient`をゲート1時代の未較正値(0.1/0.1、等価ゲインk=1.0)から、NORMAL_OPERATION実測`coilLossW`(3.0〜3.7W)を根拠に新較正値(0.04/0.5、k=0.08)へ改めた。5箇所の共有test config literalへ一律適用し、既存の期待値(`finalStep:3848`・`swellingAtStep:897`・`maxGauge:0.3271`等)は書き換えることなくそのまま回帰した(19件全件緑化)。D02専用M4型sweep受け入れ条件(3.4節)を新規実装し、この較正値がNORMAL_OPERATION非到達・高負荷到達可能の両立条件を満たすことを確認した(実測値: 高電流構成でstep=1206・10.05秒でD02が電池系終端より先に発火)。
  - **Q15-2実測**: 接触抵抗両極(copper-plate 1.3・precious-metal 0.5)の窓平均定常RPM差(実測354.836 vs 490.930、差率38.35%)を`materialMapping.ts`の既存較正値のまま観測できることを確認した(値の変更なし)。
  - **Q15-3実測**: NORMAL_OPERATION非到達(precious-metalでD05非進行を直接確認)・高負荷での順位逆転(実測累積摩耗carbon 0.056354 < copper-plate 0.076636 < precious-metal 0.117902、基礎摩耗率の順位0.7<1.0<1.5から実効摩耗率の順位1.75>1.5>1.0への逆転)・銅板超えの副次的帰結の明示報告、Fable裁定の3条件すべてを`materialMapping.ts`の既存較正値のまま実測確認した(値の変更なし)。
  - 13.1.2節の回収条件6点すべてを充足したことを確認した。
  - **検証**: `npx tsc -b`・`npm run test -- --run`(69ファイル1399件全通過)・`npm run build`(790.97kB/gzip 221.23kB、checkpoint4完了時点と同一——test-onlyの変更のみのためbundleサイズは無変動)・`npm run lint`(oxlint)・`cmp AGENTS.md CLAUDE.md`・`git diff --check`いずれも成功。`src/store/gameStore.ts`・`src/engine/vehiclePhysics.ts`・`src/engine/trackPhysics.ts`は無変更。一時診断コードは`grep -c "TEMP_" materialMapping.test.ts`で0件を確認済み。
  - Suu_mot3照合・人間承認を経るまで、ゲート6・commit/tag/pushには進まない。
- v14(2026-08-10提出): **Suu_mot3照合(P56)により、checkpoint5を「較正sweep完了」と扱うには証跡が不足している5点(P56-1〜P56-5)を指摘され、production/testの既存受け入れ条件・旧回帰値を一切変更せずに反映した。**
  - **P56-1(全較正値の確定申請表)**: 13.1.3節の冒頭へ、D01/D02/D05共通値・ブラシ素材値の全項目を1表にまとめ、出典(ゲート1仮値/本checkpointでのgrid実測/Fable裁定済み暫定候補値)・受け入れ証跡・現時点の効力(いずれもfixture候補または暫定候補値であり、production確定値ではない)を明記した。冒頭段落へ「人間commit承認の前に正式Fable較正レビューで審査対象として提出する」ことを明記し精密化した。
  - **P56-2(D02 grid実測)**: 旧報告の2点比較(旧値0.1/0.1 vs 採用値0.04/0.5)を、conductionScale/dissipationCoefficientそれぞれ3値(計9通り)の一時grid harnessによる実測へ拡充した。各組合せでQ13-2 15組合せのmaxD02Ratio・高負荷ignition step/秒・D03先行有無を実測し、採用値(0.04,0.5)がNORMAL_OPERATION非到達(q13max=0.1559、閾値0.6まで約74%の余裕)かつ高負荷到達可能という受け入れ領域の内部(境界ではない)に位置することを示した。探索用コードは完全にrevert済み(`grep -c "TEMP_"`ゼロを確認)。
  - **P56-3(smokeResistanceMultiplier方向実測)**: 正式Fable Q1/P44の要求に応え、smokingStarted成立直後の同一状態からmultiplier=1.0(no-op)と1.2(採用値)へ分岐させ、burnout到達time(1.2は696step/5.8秒で到達、1.0は1000step経過してもratio=0.921までしか到達しない)を実測し、恒久回帰テストとして固定した(観測結果として記録、断定的な物理的説明は付与しない)。
  - **P56-4(D05共通較正値の証跡固定)**: 実チャタリングバースト(nextChatterState経由)を使った物理harnessで、duration=0.15秒の単一バースト内到達可能性(frame17)・duration=0.2秒ちょうどの境界到達(frame23、バースト最終フレーム)・0.2秒超の単一バースト内非到達(既存validatorテスト「72.」と整合)・recoveryFrames/multiplierのno-op性否定(brushContactResistanceRatio増加+実物理での電流低下、非活性1.637896A→活性1.605186A)の4件を新規実装した。あわせてQ15-3統合テストへ、precious-metalのD05 event causeLogから`theoreticalCurrentA>3A`が実際に成立したことを直接assertする改修(実測最大40.666317A)を加えた。
  - **P56-5(D01較正証跡の整理)**: ゲート5の宣言済み範囲(D01は「停止時ゼロ」のsweep確認のみ)が既存テスト(単調積分・停止時ゼロ・clamp)で満たされていることを13.1.3節へ明記した。一方`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`という具体的な大きさを支持する実測・sweepは存在しないことを認め、production確定値ではなくfixture候補として正直に記録し、正式Fable較正レビューの審査項目へ計上した。
  - **検証**: `npx tsc -b`・`npm run test -- --run`(69ファイル1404件全通過、P56で新規追加した6件を含む)・`npm run build`(790.97kB/gzip 221.23kB、v13時点と同一——test-onlyの変更のみのためbundleサイズは無変動)・`npm run lint`(oxlint)・`cmp AGENTS.md CLAUDE.md`・`git diff --check`いずれも成功。`src/store/gameStore.ts`・`src/engine/vehiclePhysics.ts`・`src/engine/trackPhysics.ts`は無変更。一時診断コードは`grep -c "TEMP_" materialMapping.test.ts`で0件を確認済み。
  - Suu_mot3照合・正式Fable較正レビュー・人間承認を経るまで、ゲート6・commit/tag/pushには進まない。
- v15(2026-08-10提出): **Suu_mot3再照合(P57)により、v14の13.1.3節がP56原指示と2点不一致であることを指摘され、docs-onlyでこの2点のみを是正した(production/testは無変更)。**
  - **P57-1(全較正値の確定申請表、ブラシ8値の個別列挙漏れ)**: P56-1は「全較正値を1表に列挙」「各値について出典・受け入れ証跡・現時点の効力」を要求していたが、v14の該当行はブラシ素材値を「ratio類6個・高電流ペナルティ2個」の1行へ集約し、数値そのものを記載していなかった。Suu_mot3指定の8値(`brush-copper-plate` contact=1.3・`brush-silver-graphite` contact=0.7・`brush-precious-metal` contact=0.5・`brush-precious-metal` chatter=0.7・`brush-copper-plate` wear=1.5・`brush-precious-metal` wear=0.7・`brush-precious-metal` high-current threshold=3A・multiplier=2.5)をそれぞれ個別行へ展開し、値ごとにQ15-2/Q15-3の出典・対応する実測証跡・現時点の効力(いずれもFable裁定済み暫定候補値、最終確定は正式Fable較正レビュー+人間commit承認待ち)を記載した。
  - **P57-2(smokeResistanceMultiplier実測段落への因果説明混入)**: P56-3は「結果の方向を断定コメントへ逆輸入せず、観測結果として記録」と明記していたが、v14の該当段落は「フォーク直後の瞬間coilLossWはmultiplier=1.2のほうがやや低い(電流低下の効果が瞬時にはI²R増加を上回るため)」と原因を断定しており、同じ文冒頭の「断定的な物理的説明は付与しない」という宣言と自己矛盾していた。この括弧内因果説明を削除し、観測値のみの記述へ戻した。テスト自体のassert・数値回帰は変更していない。
  - **検証**: `npx tsc -b`・`npm run test -- --run`(69ファイル1404件全通過、v14時点から不変)・`npm run build`(790.97kB/gzip 221.23kB、v14時点と同一)・`npm run lint`(oxlint)・`cmp AGENTS.md CLAUDE.md`・`git diff --check`いずれも成功。`git diff --stat -- src scripts`はv14時点(P56報告時)から完全に不変であることを確認した(本v15はdocsのみの差分)。
  - Suu_mot3照合・正式Fable較正レビュー・人間承認を経るまで、ゲート6・commit/tag/pushには進まない。
- v16(2026-08-11提出): **正式Fable較正レビュー(2026-08-10、D02・D05共通・ブラシ8値の採用確定+付帯条件3点)と正式Fable補足裁定(2026-08-11、D01較正確定、受け入れ条件3→3′・条件1→1′改訂)を反映し、checkpoint5の全較正候補値が確定した。**
  - **正式Fable較正レビュー反映**: D02(`conductionScale`/`dissipationCoefficient`/`smokeResistanceMultiplier`)・D05共通5値・ブラシ8値をいずれも「確定」へ更新した(13.1.3節「全較正値の確定申請表」)。付帯条件3点のうち、付帯条件1(Q15-3摩耗3値の数値回帰固定)・付帯条件2(接触抵抗4素材順位テスト)は既存テストで充足済みと確認した。
  - **P58是正(付帯条件2の確認漏れ)**: Suu_mot3独立照合により、付帯条件2の既存テストが単調減少のみを確認しFable指定の具体値`[1.3,1,0.7,0.5]`を固定していなかったと指摘され、`materialMapping.test.ts`「3. tierIndex順...」テストへ`toEqual([1.3,1,0.7,0.5])`の数値回帰を追加した。
  - **付帯条件3(新規実装)**: 貴金属`brushChatterProbabilityRatio=0.7`の効果単離実証として、同一rng列(固定seed)でratio=0.7と1.0のバースト発生数を比較する決定論harnessを新設した(`materialMapping.test.ts`「D01自己制限プラトー」の直前ブロック)。短周期rng配列が`step()`内の軸ずれ振動ノイズ(`vibrationNoise`)のrng消費と「共振」し特定の値に固定される現象を発見し、周期性のない決定論的PRNG(mulberry32相当)へ切り替えて12000フレームの大サンプルで効果(バースト発生数375<403、総チャタリングフレーム数8977<9672)を実測固定した。
  - **D01較正確定**: Fable指示の4条件sweep(漸減性・観測可能性・floor到達可能性・NORMAL_OPERATION非トリガ)を実施した結果、現行値(`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`)が旧条件3(floor到達可能性)を満たさないことが判明(motor-only free-spin4構成いずれも40秒でfloor未到達、自己制限フィードバックにより最良構成でもratio 0.7074でプラトー)。値を変更せず`docs/phase3-p3-3-d01-supplementary-review-request.md`(実測全文・harness再現情報)で補足レビューを依頼した。正式Fable補足裁定は現行値を維持したまま確定し、この自己制限フィードバックをPhase 2の銅線+フェライト過熱レジームに続く本プロジェクト2件目の創発的実測知見として受容、受け入れ条件を3→3′(プラトーの実測固定)・1→1′(トリガ+1秒でratio≥0.8)へ改訂した。`minEffectiveTurnsRatio=0.5`の役割を「ゲームプレイ上の到達目標」から「数値安全域のclamp」へ再定性し、Phase 5コース設計への申し送り(急降坂コースの潜在挙動)を記録した。
  - **自己制限プラトー回帰テスト(実装済み)**: 最良構成(coilTurns=15/magnetDistanceMm=8)で、プラトーratio≈0.7074のtoBeCloseTo固定・プラトー後`decayExposureRad`不増加(末尾240フレーム一定)の直接assert・トリガ+1秒時点ratio≥0.8(条件1′)を単一の実走行経路で固定した(`materialMapping.test.ts`「D01自己制限プラトー」)。
  - **13.1.3節の更新**: 全較正値の確定申請表(D01 2値・D02 5値〈うち較正対象外の契約値`coilOverheatGaugeLimit`1値を含む〉・D05共通5値・ブラシ8値、計20項目=較正値19項目+契約値1項目)を「確定」へ更新し、D01較正証跡をtrajectory実測表・自己制限フィードバックの物理的解釈・受け入れ条件改訂の経緯を含めて全面更新した。
  - **台帳反映**: `docs/phase3-plan-v12-amendments.md`へ「P3-3-D01較正確定」エントリを新設し、改訂10として記録した。
  - **検証**: `npx tsc -b`・`npm run test -- --run`(69ファイル1406件全通過)・`npm run build`(790.97kB/gzip 221.23kB、v15時点と同一)・`npm run lint`(oxlint)・`cmp AGENTS.md CLAUDE.md`・`git diff --check`いずれも成功。`src/store/gameStore.ts`・`src/engine/vehiclePhysics.ts`・`src/engine/trackPhysics.ts`は無変更。一時診断コードは`grep -c "TEMP_" materialMapping.test.ts`で0件を確認済み。
  - Suu_mot3独立照合(P59)で4点の精度是正指摘(D01回帰テストの二重出典・「全21値」算術誤り・Gate6解禁条件の先取り記述・D01裁定日付の誤り〈実際はJST 2026-08-11〉)を受け、production/testの契約値・実測値を変更せずdocs-onlyで是正した(改訂履歴・台帳の詳細は`docs/phase3-plan-v12-amendments.md`改訂11を参照)。Suu_mot3が独立再検証のうえ**2026-08-11、Gate6解禁条件3点の全充足を確認し、Gate6(store fixture統合)を正式に解禁した**。commit/tag/pushへは引き続き進まない。
- v17(2026-08-11提出): **Gate6(store fixture統合、`src/store/__tests__/runOutcomeApplication.test.ts`への新規10件#71〜#80)を実装し、Suu_mot3独立レビュー5ラウンド(P60〜P64是正、13.2.1節に詳細記録)を経て2026-08-11に正式通過した。Gate7(最終docs/全体DoD確認)へ進む。** 是正の要旨: (P60)較正値の実質差し替え違反+`vehicleSnapshotInput`出典分裂+event直接assert欠落を是正。(P61)電池素材軸(NiMH batteryInternalResistanceRatio=0.3)の見落としを是正、理論上界7.5W→25Wへ改善。(P62)「一部だけ正式写像」の不十分性を指摘され、`composeConfigFromMaterials`起点の構成へ差し替え、D02 test-run/track-runが成立。(P63)素材事実の二経路手入力(D01磁石強度とd07分岐、D05ブラシ素材とd05摩耗設定)という構造的な穴を指摘され、`pvMotorCarGate6`(MaterialSelection明示入力)へ全件統一。(P64)P63の書き直しで脱落した既存assert(D05非終端の直接固定)を復元。値(D01/D02/D05/D07較正値)は一度も変更していない。詳細な是正史・最終構成(素材選択)は13.2.1節を参照。
