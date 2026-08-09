# Fable技術レビュー: P3-2詳細実装計画v5

状態: **正式Fable回答**（2026-08-08、人間プロジェクトリードが直接提示）

## 総合判定

条件付き承認（必須修正2点+付帯条件6点+Q1〜Q12全裁定。裁定反映とSuu照合、人間再承認バンドルの承認をもって実装解禁）。

v1→v5でSuuレビューが潰した欠陥の系譜（自己完結性・因果記録の穴・D07常時更新契約違反・M4 harnessの実効config不整合・重複保証の誤主張の撤回）は正確であり、0.2節の行番号付き実コード実査は本チームの計画品質の新しい基準になっている。

## 必須修正

### M-1. dt分割不変性テストの定義が正典違反（10.1節）

「1/120s×N分割 vs 1/240s×2N分割の比較」は物理dt自体を1/240秒へ変えており、固定物理dt=1/120秒の正典、およびP3-1で確定した定義（分割とは「1フレームあたりの物理step数のバッチング」であり、dt値の変更ではない）に反する。さらに実質的な問題として、D07の熱蓄積はオイラー積分（+ (…)×dt）であり、dt値の変更に対して数学的に不変ではない——1/240比較は境界近傍の較正値で必ず偽の不一致を出すか、通ったとしても正典外の性質を検証することになる。

修正: 比較は「1フレーム1物理step×2Nフレーム vs 1フレーム2物理step×Nフレーム」（いずれもdt=1/120固定）へ戻す。D04の段階境界（elapsedTimeSの絶対値比較）はdt値変更にも不変だが、テスト定義は全モード共通で正典に揃えること。

### M-2. RunSnapshot.slopeRadの実消費確認（5.2節）

5.1節のstepTestRunWithDestructionはcourseLengthMをstepTestRunへ渡すが、slopeRadはどこにも渡していない。既存stepTestRunのシグネチャが勾配を実際に受け取る場合のみ追加し、受け取らないなら追加しない（誰も読まないフィールドは自己完結スナップショットの偽装であり、死にフィールドの新設を禁じる）。受け取る場合はwrapperから実際に渡す配線まで本文へ明記する。

## Q1: D04内部抵抗悪化係数

承認。単一係数とし、名称はinternalResistanceDegradationMultiplierとする（既存batteryInternalResistanceRatioへの乗数であることを名前で示す。「Ratio」の重複を避ける）。swelling/smokingで別値にしない——段階差は物理的には実在するが、区別を支える較正根拠がなく、smokingは滞在時間も短い。

初期候補値1.5（実物の損傷リポの内部抵抗上昇1.5〜2倍域の下端、設計較正値ラベル+根拠コメント）。副次効果に注意: 抵抗悪化は短絡電流と発熱率を下げる方向のフィードバックであり、これは3.3節sweep条件（3）の到達可能性に有利に働く（overheated到達を遅らせる）。sweepで実測確認すること。lipo枝への型追加は人間再承認バンドルへ。

## Q2: D07可逆ダレ係数

承認。reversibleDroopMultiplier初期候補値0.95（B低下5%。ネオジムの可逆温度係数≈−0.11%/℃で数十℃の昇温に相当する物理的に妥当な域、設計較正値ラベル）。二値（閾値でon/off）の簡約は凍結済みD07Progress.reversibleDroopActive: booleanと整合しており維持する。

sweep受け入れ条件: 定常RPM低下として症状（三段開示段階1）が観測可能であること。

## Q3: 合成順序

順序問題は乗算の可換性により消滅する。実効B = base × (1−不可逆分) × 可逆分の単一式で書き、順序に意味があるかのようなコメントを残さない。不可逆到達後もダレ係数は重畳適用する（熱い磁石は恒久損傷後も熱い——現行式のとおりで正しい）。翌セッションの恒久分はWearState.demagnetizationFraction経由でbaseに織り込み済みという層分離も現設計どおり。

## Q4: D04状態機械5点

1. overDischargeActiveの毎フレーム再評価: 承認。
2. 段階タイマーの不可逆進行: 承認。物理的正当化を本文へ1文——「膨張は発生済みガスの存在であり、駆動条件の瞬断で巻き戻らない。熱慣性下の暴走進行は瞬間条件でなく段階で表現する」。
3. 案（b）を裁定する。案（a）のfallbackは「短絡先行→過放電追加」は拾うが「過放電先行→短絡追加」を落とす非対称があり、検死・図鑑という本作の中核読み物で因果の半分が消える。causeLog.initiatingCause: {shortCircuitDurationS, overDischargeRatio: number|null}を追加し、既存causeLog.shortCircuitDurationS/overDischargeRatioはburning到達時点の瞬間値と再定義する（到達時に短絡が解消済みなら0が入る——それ自体が「発火の瞬間、短絡はもう存在しなかった」という正直な記録である）。D04Progress.initiatingCauseLogは凍結記憶域として維持。
4. stage/cause交差不変条件は3条すべてvalidatorで拒否する: stage==='none' ⟺ initiatingCauseLog===null、stage∈{swelling,smoking,burning} ⟹ initiatingCauseLog非null、triggered===true ⟺ stage==='burning' ∧ causeLog非null。安価・全域的で、物理的に不可能な復元stateを存在させない。
5. affectedRolesは案（a）を裁定する: validateFireExposureProfileへ重複拒否を追加する。Set化（案b）は不正入力の無言修復であり、「不正状態は検出でなく構築不能に、修復はしない」という本チームの原則に反する。疑似コードのSetは削除し、production側の構築（単一loadoutからの導出で構造的に重複不能）を確認するテストを添える。受理契約の狭窄は人間再承認バンドルへ。

## Q5: 劣化量供給経路+magnetScorchの独立性

event埋め込み設計を承認する——deriveDegradationDiffsのシグネチャ不変・単一出典からの一方向流・リプレイ整合、いずれも正しい。

magnetScorchDeltaFractionはD07の値の再利用ではなく独立フィールドとして維持する。理由: 火災は数百℃の急性熱曝露、D07不可逆到達は動作限界の踏み越えであり、熱量が桁で異なる——同値にすると「炎に包まれた磁石」と「限界をわずかに超えた磁石」の損失が等しくなり、物理の方向が誤る。

ただし架空指標化を防ぐ制約を課す: 全磁石素材でmapMagnetScorchDeltaFraction(m) ≥ mapD07DestructionConfig(m).irreversible.demagnetizationDeltaFractionを単体テストで固定する（火災が閾値踏み越えより軽いことは決してない）。nonDemagnetizing磁石には0を返す（簡約の明記込み）。初期候補値: demagnetizationDeltaFraction 0.10、magnetScorchDeltaFraction 0.15（設計較正値）。

検知可能性制約を追記: 恒久損失は段階2の3%閾値で診断可能であるべきなので、demagnetizationDeltaFractionは0.03を十分上回る値に保つ（0.10はこれを満たす）。型追加は人間再承認バンドルへ。

## Q6: RunSnapshot拡張

案Aを裁定する。案BのrunEnvironmentはDestructionRunContext.contextと意味の重複する第二の判別子を作り、「同じ事実を二経路から入力できる」というP3-1-Q9が塞いだばかりの穴の型版を再導入する（context='motor'∧kind='trackRun'という新しい不正状態の発明）。案Aの交差検証3規則は既存の正式M2パターンの自然な拡張であり全域的。

contractVersion→2・旧snapshot非救済の判断も、production配線ゼロ=実ユーザーデータ不在の根拠込みで承認する。M-2の裁定に従いslopeRadの要否を確定してから実装。人間再承認バンドルへ。

## Q7: regressionDiff

baseline=同一recipeKeyの直近5回（当該run除く）の中央値を裁定する。根拠: この機構の目的は「最近何かが変わった」の検知であり、本作の恒久劣化はイベント駆動の段差（D07到達・D04延焼）であって漸進ドリフトではない——段差検知には直近窓の中央値が最適で、外れ値1回に頑健。最良値基準は通常分散を恒久劣化と誤認する偽陽性製造機になるため不採用。

過去観測1件以上で判定可（1件なら実質直前値比較）、0件でnull。窓幅5は契約定数（REGRESSION_BASELINE_WINDOW = 5、較正値ではない）。型設計は案（a）（directionForMetricKind導出関数、フィールド自体を持たない）——存在しないフィールドは食い違えない。判別union（案b）は同じ安全性をより多い定型文で買うだけである。

## Q8: P3-1-Q4返済の解釈

承認する。到達不能なendReasonの網羅義務は構造的証明の引用で履行されたとみなす。DoDの方式は「実コード根拠の引用+到達可能6種の正例テスト」とし、長時間実行による不在テストは要求しない（実行による不在証明は保証にならない）。derailed/energyExhaustedはtrack-run（P3-4）の必須網羅として台帳送り。

## Q9: D04途中段階のノート記録

案Bを裁定する。ただし型変更の実装はP3-4の配線サブステップで行う。案AはM5（ii）の前提（「走行の記録には膨張域到達が残る」）を空文化するため採れない——膨張のみで終わった走行は現行型ではどこにも痕跡が残らず、「現象は隠さない」が破れる。

3腕（ExperimentSession含む）へfinalDestructionState: DestructionStateを追加する（要約型の発明はしない——単一出典の全量保存が最も正直で保守負担も最小）。P3-2で実装しない理由: 書き手が存在しない段階でのフィールド追加は死にフィールド（M-2と同じ原則）。本裁定を台帳P3-2-Q9として固定し、P3-4計画の必須項目とする。方針の人間承認は今回のバンドルに含め、型変更の実行はP3-4で機械的執行として再掲する。

## Q10: stepMotorWithDestruction内部改修

人間再承認は不要と裁定する。これはv12 §3.2の凍結契約（実効configはwrapper内部で毎step合成）の履行であり、契約変更ではない——P3-1時点では合成対象モードが存在しなかったため素通しだっただけである。P3-2計画自体の人間承認（通常ゲート）で足りる。

条件: 既存P3-1テスト回帰+リプレイ等価テスト再実行（計画のDoDに記載済み）。

## Q11: D07物理モデル+磁石構造

候補A（I²R/伝導）を裁定する。物理的根拠: ブラシ付きDCモーターの磁石（固定子）の主要な熱源は電機子銅損の伝導であり、減磁リスクが最大になるのは失速・過負荷時（最大電流・最小回転）である——これは電機子反作用が磁石に直接対抗する条件とも一致する。候補B（rpm²）は減磁を高速現象にしてしまい、実物と逆方向に誤る。蓄積式は既存batteryHeatの超過積分ファミリーと同型で一貫する。

磁石構造は候補（ii）（{thermal, irreversible}の2部構成）を裁定する——候補（i）の閾値1000は0〜1ゲージ規約（spec §7.4）の違反であり不採用。係数は発明せずsweepで確定し、受け入れ条件を4つ課す:

1. 通常運用でダレ閾値非到達。
2. 高負荷持続でレース内にダレ到達可能。
3. 意図的な持続過負荷構成で、不可逆到達がoverheated終端より先に可能であること（M4と同型のD07到達可能性条件——これがないと図鑑のD07が原理的に到達不能なまま較正が通る）。
4. ゲージが0〜1にclampされること。

負例を1件追加: nonDemagnetizing磁石ではいかなる入力でもreversibleDroopActive/irreversibleTriggeredが真にならないこと。

## Q12: D01漸減の返済先

P3-3残置を裁定する。ただしaliceの層の整理は訂正する。「D01漸減は車体層専用パターンに属するためcomposeEffectiveMotorConfigの対象外」という整理は誤り——spec §7.1.1の「実効巻数・占積の漸減」はトルク定数・抵抗というモーター層の量であり、composeEffectiveMotorConfigの対象そのものである（既存のaxisOffsetMm一回加算は漸減とは別物の暫定実装）。

P3-3送りの正当な理由は層ではなくスコープ規律である: P3-2は既に本フェーズ最大のステップであり、漸減の実装は独自の減衰モデル+D01Progress拡張+較正sweepを要する。機構（composeEffectiveMotorConfig）はP3-2で存在するようになるため、P3-3での回収は「D01分岐の追加+較正」に縮小する。台帳のP3-1-Q1エントリへ「返済先=P3-3、返済形=composeEffectiveMotorConfigへのD01分岐追加、機構自体はP3-2で導入済み」と追記し、P3-3計画の必須項目とする。

## 付帯条件

1. **予算不変性テスト**: composeEffectiveMotorConfigがcomputeEnergyBudgetJの消費するフィールドを一切変更しないこと（合成前後でcomputeEnergyBudgetJの値が一致）をテストで固定する。energyUsedRatioの分母が実効configで計算されても現在は無害だが、将来の合成対象追加で静かに壊れる箇所を先に封じる。
2. **stepTestRunWithDestructionのJSDocへ呼び出し側契約を明記**: 「vehicle文脈（test-run）のsnapshotを持つaccumulator専用。motor文脈のaccumulatorを渡した場合の挙動は未定義（trusted precondition）」。
3. **D04較正の結合条件を3.2/3.3節へ明記**: 短絡経路の炎上到達には「runawayHeatThreshold到達から1.0（overheated）到達までの時間（悪化後の抵抗による減速込み） > swellingS+smokingS」が必要——sweep条件（3）の解析的裏付けとして。
4. **Q5の不等式テスト**: magnetScorch ≥ demag、全磁石素材。
5. **Q11の負例と到達可能性条件**: nonDemagnetizingと到達可能性条件（c）をDoD 10.6へ明記。
6. **test-runでの過放電到達**: フリー走行の正直な帰結として意図仕様であること（P3-1確定裁定の適用）を5.3節へ1行明記。

## 人間再承認バンドル（確定）

- Q1（lipo枝フィールド）
- Q4案（b）（D04CauseLog.initiatingCause+D04Progress.initiatingCauseLog）
- Q4案（a）（validateFireExposureProfile受理契約の狭窄）
- Q5（DestructionConfig.d04+d07二部構成+eventフィールド）
- Q6案A（RunSnapshot+contractVersion 2）
- Q9案B（方針承認、実装はP3-4）

Q10・Q12は再承認不要。初期候補値（1.5/0.95/0.10/0.15）は設計較正値でありsweep確定後に完了報告で最終化する（D03の3.0秒と同じ手順）。

## P3-1申し送り6点の充足

1. 実wrapper×全endReason=Q8裁定で充足。
2. snapshot唯一出典+非自明リプレイ等価=5.1節・10.5節で充足。
3. epsilon再利用=2.2節・2.3節で充足（短絡比較・段階境界の両方で単一出典を使用、確認済み）。
4. M4+3種sweep=3.3節で充足。
5. C5負例=3.6節で充足。
6. 非恒久簡約と記録整合=Q9裁定で充足。

## DoD・サブステップ分割（必須回答6）

承認。各サブステップが裁定確定を前提条件として明記され、独立レビュー可能。M-1の修正をDoD 10.1へ反映すること。

## 再提出要否

裁定反映が本指示の範囲内であればFable再提出は不要。Suu照合→人間再承認バンドル→サブステップ0から実装着手の順で進めてよい。台帳へのP3-2-Q1〜Q12エントリ追記（12.3節の予定どおり）を忘れないこと。
