# docs/phase3-plan-v12.md 確定裁定台帳(追記専用)

作成: alice_mot3(2026-08-04)。正式Fable補足裁定(P3-1-Q9-5、2026-08-03T17:22確定)により新設。改訂: 2026-08-04(Suu_mot3指摘反映、詳細は末尾「改訂履歴」)。

**運用規則**:
- **v12本体は物理的に無編集のまま維持する**(既存の「無編集の原則」を継続)。本台帳が、v12本体の記述を実質的に上書き・再解釈する確定裁定を、番号・日付・置換対象節・旧契約/解釈・新契約文・実装ステップの形式で追記形式のみで記録する。
- **v12を読む者は、必ず本台帳も併読すること。** v12本体の記述と本台帳の記載が食い違う場合、**本台帳が優先する**(本台帳はv12より新しい確定裁定のみを記録するため)。**台帳の目的はv12本体+本台帳のみで現行契約を復元できることである。**
- **裁定番号は必ず名前空間付きで記載する**(`P3-0-Q<n>`・`P3-1-Q<n>`等)。同じ番号(例: `Q2`)が計画ステップをまたいで重複するため、番号単体では一意に読めない。本台帳・関連計画書のいずれにおいても、番号単体の「Q2」等の表記は用いない。※末尾の運用規則追補1で適用範囲を訂正
- 本台帳へのエントリ追加は追記のみとし、既存エントリの内容を書き換えない(訂正が必要な場合は新しいエントリとして追記し、旧エントリに「※後続の<番号>で訂正」等の一行注記を追加するに留める)。
- 統合full-text化(v12本体をゼロから自己完結に書き直すこと、過去のR1推奨に相当)の、Phase 3期間中の軽量な代替手段である。Phase 3完了時、または改訂コストが本台帳の維持コストを上回った時点で、統合full-text化への移行を再検討する。

---

## P3-0-Q1: `ApplyRunOutcomeError`への`invalidRunSequence`追加+高水位穴の意味論確定

- **日付**: 2026-08-02T13:12(正式Fable個別レビュー、P3-0-Q1確定)、人間再承認2026-08-02T13:26
- **置換対象節(v12)**: §1.6「劣化適用APIの型安全化」`ApplyRunOutcomeError`型(360〜366行目)
- **旧契約(v12原文)**: `ApplyRunOutcomeError`は`saveIdMismatch`・`staleLease`・`leaseNotAcquired`・`missingEquipment`の4種のみで、`runSequence >= nextRunSequence`(未来番号、発行元と無関係な入力)を表すエラー種別が存在しなかった。
- **新契約(確定)**: `ApplyRunOutcomeError`へ`{ kind: 'invalidRunSequence' }`を追加する。判定規則: `runSequence >= nextRunSequence`の場合のみこのエラーとし、`runSequence <= lastAppliedRunSequence`は正常な冪等skip、その中間の(放棄されて高水位に飛び越された)番号の「穴」はエラーとしない。
- **理由**: 未適用のまま高水位に飛び越された番号が冪等skip側に落ちるのは既知の高水位意味論(P3-0計画v9/v10レビューで受容済み)であり欠陥ではない、とFableが確認したうえでの契約補完。
- **実装ステップ**: P3-0で`src/store/runOutcomeApplication.ts`へ実装済み・commit済み
- **人間再承認**: 要(完了、2026-08-02T13:26)。契約追加のため。
- **出典**: `docs/phase3-p3-0-plan.md` §11(Q1)

---

## P3-0-Q2: `DestructionConfig`のproduction配線はP3-4まで延期

- **日付**: 2026-08-02T13:12(正式Fable個別レビュー、P3-0-Q2確定・案(c))、人間再承認2026-08-02T13:26
- **置換対象節(v12)**: v12本体はproduction配線の時期を明記していない(意図的な未確定事項)。本裁定はこの空白を埋める。
- **旧契約**: なし(v12はDestructionConfigの型・validator契約のみを定め、実際にどのタイミングでgameStore.ts等へ配線するかは未確定のまま残していた)。
- **新契約(確定)**: `DestructionConfig`のproduction生成元・gameStore.tsへの実配線自体をP3-4完了まで遅らせる(案(c))。付帯: (i) P3-1〜P3-3はfixture統合テストで契約実証する、(ii) 人間試遊はP3-4になることが帰結する(早期試遊が必要な場合はdev専用暫定configを人間PM承認で別途用意する)、(iii) P3-4計画では配線サブステップを最初に置く。
- **理由**: 各実装ステップの型・状態機械の正しさをfixtureで先に固め、production配線という「一度やると巻き戻しにくい」統合作業を最後にまとめて行うことでリスクを局所化する。
- **実装ステップ**: P3-1はfixture方針で進行中(production配線なし)。**P3-1全体はまだ未完了**(サブステップ4のstore fixture統合が未着手のため)。P3-2・P3-3も同様の方針を継続予定。P3-4で配線実施(未着手)。
- **人間再承認**: 要(完了、2026-08-02T13:26)。実装スケジュール・人間試遊可能時期に影響するため。
- **出典**: `docs/phase3-p3-0-plan.md` §11(Q2)、`docs/phase3-p3-1-plan.md` §1.1(参照・適用)

---

## P3-0-Q3: `RunApplicationEnvelope.notebookRecord`+3腕判別union+全腕自動trim統一

- **日付**: 2026-08-02T13:12(正式Fable個別レビュー、P3-0-Q3確定・3点すべて承認)、人間再承認2026-08-02T13:26
- **置換対象節(v12)**: §1.5「runIdの所有境界・冪等性・並行実行の完全化」`RunApplicationEnvelope`型(330〜336行目)
- **旧契約(v12原文)**: `RunApplicationEnvelope`は`runKey`・`leaseToken`・`outcome`・`equipmentSnapshot`のみで、実験ノート記録用のフィールドを持たなかった。実験ノートの記録経路・型(test-run文脈の扱い)・evict規則(sessions/courseRunsの非対称な既存挙動)もv12は定めていなかった。
- **新契約(確定)**: (i) `RunApplicationEnvelope`へ`notebookRecord: PendingNotebookRecord`フィールドを追加する(契約変更)。(ii) `VehicleTestRunNotebookRecord`を新設し、既存`CourseRunNotebookRecord`(`trackId`必須)と`ExperimentSession`とあわせた3腕判別unionとする(test-runは`trackId`を持たないため既存型を流用できないという実コード確認に基づく)。(iii) sessions/courseRunsいずれも50件上限の全腕自動trimへ統一し、既存のsessions側ボタン確認UIは撤去する(`codexRecords`はtrim対象外のまま)。
- **理由**: 実験ノート記録の原子的適用(1回のapplyRunOutcomeで劣化・報酬・図鑑・実験ノートすべてを同時に確定させる)を実現するには、記録に必要な情報がRunApplicationEnvelope自身に永続payloadとして含まれている必要がある(一時引数渡しでは missingEquipment→reload→retry 時に失われる)。原子性が確認UXに優先する。
- **実装ステップ**: P3-0で実装済み・commit済み。`PendingNotebookRecord`・`VehicleTestRunNotebookRecord`等の型定義は`src/store/runOutcomeApplication.ts`、実際の追記・50件trim処理(`appendNotebookRecord`)は`src/store/saveStore.ts`、リアクティブな薄い委譲ビューは`src/store/notebookStore.ts`、UI側(旧sessions確認ボタンの撤去含む)は`src/components/ExperimentNotebook.tsx`(brabit_mot3所有)に、それぞれ分かれて実装されている。単一ファイル・単一サブステップに集約されるものではない。
- **人間再承認**: 要(完了、2026-08-02T13:26)。(i)は契約変更、(iii)は既存UI仕様変更のため。
- **出典**: `docs/phase3-p3-0-plan.md` §11(Q3)

---

## P3-0-Q4a: battery消費後の`EquipmentLoadout.batteryItemId`自動null化+明示的再装備

- **日付**: 2026-08-02T13:12(正式Fable個別レビュー、P3-0-Q4a確定)、人間再承認2026-08-02T13:26
- **置換対象節(v12)**: v12 §1.5「`EquipmentIdSnapshot`は…具体的なフィールド構成は意図的にP3-0実装ステップまで未凍結のまま残す」——本裁定はこの意図的な空白を埋める設計判断であり、v12の既存テキストを上書きするものではない。
- **旧契約**: なし(P3-0実装ステップで確定する、とv12が明示的に留保していた設計判断)。
- **新契約(確定)**: D03/D04でbattery個体が消滅した場合、`EquipmentLoadout.batteryItemId`を自動でnullへ落とし、プレイヤーに明示的な再装備を求める(自動的な代替電池の再装備は行わない)。
- **理由**: 「壊れたものは自動的に補われない」というゲームプレイ上の一貫性・素材消耗の実感を維持するための設計判断。
- **実装ステップ**: P3-0で実装済み・commit済み。契約型(`EquipmentLoadout.batteryItemId: string | null`のnullable化)は`src/store/runOutcomeApplication.ts`に定義され、実際の自動null化処理(battery消費と一致した場合に`batteryItemId`をnullへ落とす適用ロジック)は`src/store/saveStore.ts`の`commitApplyResult`内に実装されている。
- **人間再承認**: 要(完了、2026-08-02T13:26)。ゲームプレイ設計判断のため。
- **出典**: `docs/phase3-p3-0-plan.md` §11(Q4a)

---

## P3-0-Q4b: `AppliedRunResult.consumedEquipmentIds`の追加

- **日付**: 2026-08-02T13:12(正式Fable個別レビュー、P3-0-Q4b確定)、人間再承認2026-08-02T13:26
- **置換対象節(v12)**: §1.6「劣化適用APIの型安全化」`AppliedRunResult`型(372〜380行目)
- **旧契約(v12原文)**: `AppliedRunResult`は`runKey`・`applied`・`newlyDiscoveredModes`・`rewardsGrantedG`・`resolvedDegradations`のみで、消費されたequipmentのID一覧を返す手段がなかった。
- **新契約(確定)**: `AppliedRunResult`へ`consumedEquipmentIds: readonly { role: EquipmentRole; id: string }[]`フィールドを追加する。battery消費(P3-0-Q4a)のような「現在のloadoutと一致する場合のみnull化する」という汎用の後続処理を、この配列を介して安全に行えるようにする。
- **理由**: 「現在のloadoutと一致する場合のみnull化する」という規則をstore側で安全に実施するための最小限の情報追加。
- **実装ステップ**: P3-0で`src/store/runOutcomeApplication.ts`へ実装済み・commit済み
- **人間再承認**: 要(完了、2026-08-02T13:26)。契約追加のため。
- **出典**: `docs/phase3-p3-0-plan.md` §11(Q4b)

---

## P3-0-Q5: `ValidateDestructionConfigResult`への`invalidFields`追加

- **日付**: 2026-08-02T13:12(正式Fable個別レビュー、P3-0-Q5確定)、人間再承認2026-08-02T13:26
- **置換対象節(v12)**: §4.2「DestructionConfig(段階導入対応)」`ValidateDestructionConfigResult`型(905行目)
- **旧契約(v12原文)**: `export type ValidateDestructionConfigResult = { ok: true; config: DestructionConfig } | { ok: false; missingFields: string[] };`——フィールド欠落(`missingFields`)のみを報告し、値域違反(範囲外の数値等)の詳細を返す手段がなかった。
- **新契約(確定)**: `ValidateDestructionConfigResult`の`{ ok: false }`分岐へ`invalidFields`(値域違反の詳細、フィールド名+理由)を追加する。
- **理由**: 純粋な改善であり反対理由なし、とFableが確認。
- **実装ステップ**: P3-0サブステップ1(`src/engine/destructionOrchestration.ts`、実装済み・Suu_mot3レビュー通過済み・commit済み。P3-1のvalidateDestructionConfig判別union対応テストでも継続して利用)
- **人間再承認**: 要(完了、2026-08-02T13:26)。契約変更のため。
- **出典**: `docs/phase3-p3-0-plan.md` §11(Q5)

---

## P3-0-Q6: `deriveDegradationDiffs`の段階実装+発行可能eventの不変条件(「正式Fable P3-0-Q6」)

- **日付**: 2026-08-02T13:12(正式Fable個別レビュー、P3-0-Q6確定・案(a))
- **置換対象節(v12)**: v12 §1.2「損壊可能アセンブリと劣化差分の再設計」の`deriveDegradationDiffs`・`DegradationDiff`型定義自体は完成形(全モードのdeltaFraction込み)のまま変更しないが、**P3-0時点での実装範囲**および**advanceDestructionStateが実際に発行してよいeventの不変条件**という、v12が明示していなかった実装順序上の制約を追加する。
- **旧契約**: なし(v12の型定義自体は全モード分を最初から完成形で示しており、「どの順でいつ実装するか」「未実装モードの数値を捏造しないためにどう歯止めをかけるか」はv12の記述範囲外だった)。
- **新契約(確定)**: P3-0では型・集約規則と2値/カウント差分(D01/D02/D03/D04のbattery-consumed/D06)のみを実装し、連続量`deltaFraction`の換算(D04のscorch・D05・D07・D09のseizure等)は各モードの実装ステップで追加する。**不変条件を確定する**: 「`advanceDestructionState`は、差分換算(`deriveDegradationDiffs`側の変換)が実装済みのモードのイベントしか発行してはならない」。各モードの実装ステップDoDに「そのステップで発行可能になった全モードについて、対応する差分換算が同一ステップ内に存在することのテスト」を含めること。**この不変条件が、P3-1計画以降で継続的に参照される「正式Fable Q6不変条件」(`createRunAccumulator`に関するP3-1-Q6とは別物)の原典である。**
- **理由**: 較正定数が未確定のまま「完全実装」を謳う(較正を装った捏造)ことを防ぐための段階実装の歯止め。
- **実装ステップ**: P3-0サブステップ1(型・集約規則、実装済み・commit済み)。P3-1(D01/D03のイベント発行がこの不変条件下にあることを実装・テスト済み)。P3-2以降、各モード実装時に同型のテストを追加。
- **人間再承認**: 不要(型自体は変更せず、実装順序・不変条件の確定であり契約の型定義変更ではない)
- **出典**: `docs/phase3-p3-0-plan.md` §11(Q6)、`docs/phase3-p3-1-plan.md` §2.2(JSDoc「正式Fable P3-0-Q6不変条件」参照)

---

## P3-0-Q7(正式Fable必須修正P2): `RotorAssemblyState.sourceWireMaterialId`+`consumedWireM`の遡及承認

- **日付**: 2026-08-02T13:12(正式Fable個別レビュー、P3-0-Q7として遡及追加・承認)、人間再承認2026-08-02T13:26
- **置換対象節(v12)**: §1.2「損壊可能アセンブリと劣化差分の再設計」`RotorAssemblyState`型(166〜173行目)
- **状況(他の裁定と異なる点)**: この変更は本計画(`docs/phase3-p3-0-plan.md`)のv6提出以前、`docs/phase3-plan-v12.md`自身の草稿段階(v9レビュー相当)で既に行われており、**v12の現在の本文にはこの新契約(`sourceWireMaterialId`+`consumedWireM`)が既に反映されている**(v12は物理的に無編集のため、この点で本エントリはv12の現在の記述を上書きしない)。本エントリは、この変更が当時「Q1〜Q6のみが真の契約追加」という申告(P3-0計画旧版12節)から漏れており、無申告のまま契約変更が通っていたことをFableが発見し、遡及的に正式な契約変更として申告・承認した記録である。
- **旧契約(v8時点の記述、現在のv12本文にはもはや存在しない)**: `RotorAssemblyState`は`sourceWireItemId: string | null`(個体ID参照)を持っていた。
- **新契約(v12本文に既に反映済み、本裁定で遡及承認)**: `RotorAssemblyState.sourceWireMaterialId: WireMaterialId | null`(素材ID参照)+`consumedWireM: number`(組み立て時にスタック在庫から引き当てた量)。
- **理由**: 線材は`StackableStockEntry`(materialId+quantityMのスタック在庫)であり個体IDを持たないため、v8の`sourceWireItemId`はそもそも実装不能だった。`materialId`+消費量記録はPhase4巻線記録方式への正しい最小前駆である。手続き上、これを遡及追加し人間再承認の対象に含めることで、無申告の契約変更を通す前例を作らないこととした。
- **実装ステップ**: P3-0サブステップ1(実装済み・commit済み。実装自体は本裁定以前から存在)
- **人間再承認**: 要(完了、2026-08-02T13:26)。契約変更のため(遡及)。
- **出典**: `docs/phase3-p3-0-plan.md` §11(Q7、「正式Fable必須修正P2」として記載)

---

## P3-0-P1: lease未取得時の全saveStore書き込みaction共通ブロック

- **日付**: 2026-08-02T13:12(正式Fable個別レビュー、必須修正P1として確定)、人間再承認2026-08-02T13:26
- **置換対象節(v12)**: §1.5「runIdの所有境界・冪等性・並行実行の完全化」——v12本文はlease/`leaseToken`検証を`applyRunOutcome`/`retryPendingApplication`の文脈でのみ記述しており(357〜397行目付近)、それ以外のsaveStore書き込みaction(購入・装備変更等)へのlease guard適用は明記していなかった。
- **旧契約(v12原文の要旨)**: 「stale lease(他タブ由来)の拒否と、現所有タブのpending結果は混同しない」「`applyRunOutcome`/`retryPendingApplication`は`saveId`・`leaseToken`・`runSequence < nextRunSequence`を検証する」という記述はあったが、run適用・heartbeat・`beginRun`以外の書き込みaction(購入・装備変更等)がlease未取得タブから実行できてしまう穴が残っていた。
- **新契約(確定)**: 閲覧を除く**全saveStore書き込みaction**を、lease取得済み(現在のタブが所有タブである)ことを検証する共通ゲートの対象とする。従来はrun適用・heartbeat・`beginRun`のみがゲートされていた。
- **理由**: 古いタブ(stale lease)が購入・装備変更等の書き込みを行うと、現所有タブの状態と非同期にstateが変化し、後続のrun適用時に想定外の不整合を生みうる。lease guardの対象を書き込みaction全体へ拡張することで、この種の穴を構造的に塞ぐ。
- **実装ステップ**: P3-0で実装済み・commit済み。共通事前ゲートの実適用主体は`src/store/saveStore.ts`であり、`readFreshForApply`(lease不一致時に`leaseNotAcquired`を返す)を内包する`readGatedFreshState`関数を、各saveStore書き込みaction(`beginRunAction`・`performApplyRunOutcome`・`retryPendingApplicationAction`等、11箇所で`readGatedFreshState`呼び出しを確認済み)が共通に呼び出す形で実現している。`src/store/runOutcomeApplication.ts`はpureな型・検証関数(`leaseNotAcquired`エラー種別の定義等)を提供するのみで、全action共通のゲート機構自体はそこにはない(以前の記載は不正確だった)。
- **人間再承認**: 要(完了、2026-08-02T13:26)。lease適用範囲の拡張という契約変更のため。
- **出典**: `docs/phase3-p3-0-plan.md` §11(必須修正P1)、§15改訂履歴v7エントリ

---

## P3-1-Q2: `DestructionRunContext`・`FireExposureProfile`の定義元移設

- **日付**: 2026-08-03T09:05(正式Fable技術レビュー、P3-1-Q2確定)
- **置換対象節(v12)**: §1.9「使用する型の定義元一覧」(表中、`DestructionRunContext`・`FireExposureProfile`の行)
- **旧契約(v12原文の要旨)**: `DestructionRunContext`・`FireExposureProfile`(および`FireExposureRole`・`DestructionConfig`等)の定義元は`src/engine/destructionOrchestration.ts`(新規)とする、と表で明記されていた。
- **新契約(確定)**: `DestructionRunContext`・`FireExposureProfile`(および`validateFireExposureProfile`関数)の定義元を`src/engine/destructionModes.ts`(leafモジュール)へ移設する。`destructionOrchestration.ts`はそこからimportし、既存の公開importパスを維持するためre-exportする。型の構造(フィールド・意味)・公開importパス・公開面はいずれも不変。
- **理由**: 案(b)(`import type`による型のみの循環参照)は技術的には正しいが、「leaf純度は解釈でなく構造で守る」——散文に埋めた例外規範はエージェント間の中継で脱落しやすく、構造とルールだけが確実に生き残るという構造法則に照らし、型のみの例外的循環という解釈上の抜け道を作らない案(a)を採る。P3-0の`FireExposureRole`の前例を踏襲。
- **実装ステップ**: P3-1サブステップ2(`src/engine/destructionModes.ts`、実装済み・Suu_mot3レビュー通過済み)
- **人間再承認**: 不要(re-exportにより公開面不変、契約変更ではなく開示済みの実装詳細の逸脱)
- **出典**: `docs/phase3-p3-1-plan.md` §2.1.1

---

## P3-1-Q4: P3-1 DoD文言「実wrapper×全endReason網羅」の解釈確定

- **日付**: 2026-08-03T09:05(正式Fable技術レビュー、P3-1-Q4確定)
- **置換対象節(v12)**: §12「P3-1: 契約の最小実証(D01/D03、非リポ経路)+store統合」のDoD文言
- **旧契約(v12原文の要旨)**: 「motor-only/test-run/track-run×全endReason(manualAbort含む)が同一のfinalizeDestructionRun/finalizeRun→applyRunOutcome経路を通ることの網羅テスト」という文言が、実装対象(`stepMotorWithDestruction`のみ)と矛盾していた(`stepTestRunWithDestruction`/`stepTrackRunWithDestruction`はP3-1時点で契約骨格のみ)。
- **新契約(確定)**: 上記DoD文言は「`RunOutcome`→`applyRunOutcome`経路がcontextに関わらず正しく機能すること(context非依存性)」を意味すると解釈する。test-run/track-run文脈については手構築の`RunOutcome`fixture(実wrapperを経由しない)で`applyRunOutcome`への到達をテストする。実wrapper自体の全endReasonテストはmotor-onlyのみとし、「実wrapper×全endReason網羅」の完全な実施はP3-2(`stepTestRunWithDestruction`導入)・P3-4(`stepTrackRunWithDestruction`導入)の各DoDへ台帳化する。
- **理由**: v12自身の内部矛盾(DoD文言と実装対象の不整合)の正しい解消。P3-0-Q2裁定(production配線をP3-4まで延期)とも整合する。
- **実装ステップ**: fixtureベース統合テストによる代替検証は、`src/store/__tests__/runOutcomeApplication.test.ts`への追加としてP3-1サブステップ4で実装予定(未着手)。P3-2・P3-4(実wrapper導入時に本来の全endReason網羅DoDを回収、未着手)
- **人間再承認**: 不要(v12本文は無編集、解釈の確定であり契約自体の変更ではない)
- **出典**: `docs/phase3-p3-1-plan.md` §7.2

---

## P3-1-Q5: `classifyTerminalModes`のexport化

- **日付**: 2026-08-03T09:05(正式Fable技術レビュー、P3-1-Q5確定)
- **置換対象節(v12)**: §4.4(`function classifyTerminalModes(...)`、moduleプライベートの非export宣言)
- **旧契約(v12原文)**: `classifyTerminalModes`はexportされないmodule内部関数として記述されていた。
- **新契約(確定)**: `classifyTerminalModes`を`export`する。「本関数は分類規則のみを定める。各モードのイベントが実際に発行可能かは正式Fable P3-0-Q6不変条件(`deriveDegradationDiffs`の段階実装)が別途統制する」というJSDocを付す(P3-1固有の「P3-1-Q6」=`createRunAccumulator`裁定との呼称混同を避けるための注記込み)。
- **理由**: 純関数の可視性追加であり物理契約は不変。v12完全形の全分岐(D02/D03/D04-burning/D06-totalloss/D09)を、各モードの発行実装が完了する前(P3-2〜P3-4を待たず)に手構築fixtureで直接検証できる利益が大きい。
- **実装ステップ**: P3-1サブステップ3(実装済み。P3-1-Q9是正実装で最終シグネチャへ更新予定、契約自体は変更なし)
- **人間再承認**: 不要(新規関数の可視化、P3-0凍結面の変更ではない)
- **出典**: `docs/phase3-p3-1-plan.md` §2.2

---

## P3-1-Q6: `createRunAccumulator`のbattery profile不一致排除(単一引数化)

- **日付**: 2026-08-03T09:05(正式Fable技術レビュー、P3-1-Q6裁定)/2026-08-04(人間プロジェクトリード再承認)
- **置換対象節(v12)**: §1.1「RunOutcomeの生成: RunAccumulator+finalizeDestructionRun/finalizeRun」(`createRunAccumulator`のシグネチャ)
- **旧契約(v12原文)**: `export function createRunAccumulator(replaySnapshot: RunSnapshot, batteryProfile: 'lipo' | 'nonLipo'): RunAccumulator`(2引数。`batteryProfile`を`replaySnapshot.destructionConfig.battery.profile`と独立に指定可能)
- **新契約(確定)**: `export function createRunAccumulator(replaySnapshot: RunSnapshot): RunAccumulator`(1引数。`batteryProfile`を`replaySnapshot.destructionConfig.battery.profile`から一意に導出する)
- **理由**: 不一致(accumulator側と引数側のprofileが食い違う)→`advanceDestructionState`内の二重条件が無言でfalseとなりD03判定がスキップされる、という「静かな穴」を、fail-fast(案b、検出)ではなく構築不能(案a、そもそも存在させない)によって塞ぐ。不正状態は検出するより存在させないという、このプロジェクトが既に確立している設計原則そのもの。
- **実装状態(区別を明記)**: `createRunAccumulator`自体のシグネチャ変更・単一引数化は**実装・検証済み**(P3-1サブステップ3、Suu_mot3独立実行でテスト確認済み)。ただし**サブステップ3全体としては、後続で発見されたP3-1-Q9(`stepMotorWithDestruction`側の引数設計)の是正が完了するまで、サブステップ全体の完了・commitは保留状態にある**。P3-1-Q6自体が未完了・未検証というわけではない。
- **人間再承認**: **要(完了、2026-08-04)**。P3-0で既に実装・commit済みの公開シグネチャの破壊的変更のため。
- **出典**: `docs/phase3-p3-1-plan.md` §2.1.2

---

## P3-1-Q7: `BatteryDestructionConfig`・`GearBreakageProfile`・`DestructionConfig`の定義元移設

- **日付**: 2026-08-03T16:13(正式Fable補足裁定、P3-1-Q7確定)
- **置換対象節(v12)**: §1.9「使用する型の定義元一覧」(表中、`DestructionConfig`の行、および同表が暗黙に前提する`BatteryDestructionConfig`・`GearBreakageProfile`の定義元)
- **旧契約(v12原文の要旨)**: `DestructionConfig`の定義元は`src/engine/destructionOrchestration.ts`(新規)とする、と表で明記されていた。`BatteryDestructionConfig`・`GearBreakageProfile`も同ファイル内で`DestructionConfig`の構成要素として定義される前提だった。
- **新契約(確定)**: `BatteryDestructionConfig`・`GearBreakageProfile`・`DestructionConfig`(本体)の定義元を`src/engine/destructionModes.ts`(leaf)へ移設する。`destructionOrchestration.ts`はこの3型をimportし、既存の公開importパスを維持するためre-exportする。`DestructionConfigDraft`・`InvalidConfigField`・`ValidateDestructionConfigResult`・`validateDestructionConfig`本体・restore用raw validatorは`destructionOrchestration.ts`側に残置する(復元・値域検証はstoreの`RunSnapshot`責務に属するorchestration固有の役割であり、leafに引きずり込むべきでないため)。
- **理由**: P3-1-Q2と同型の「公開面不変の定義移設」。**leaf不変条件を新設**: 「`destructionModes.ts`の公開シグネチャ(`advanceDestructionState`等)に現れるすべての型は`destructionModes.ts`が所有する」——この種の型所有の発見が3度続いた(`FireExposureRole`→P3-1-Q2→P3-1-Q7)ことから、個別移設の裁定を繰り返さないための不変条件として確定した。構造テスト(import許可リスト検証)で機械的に固定する。
- **実装ステップ**: P3-1サブステップ2(実装済み・Suu_mot3レビュー通過済み)
- **人間再承認**: 不要(公開面不変、実装報告への記載で足りる)
- **出典**: `docs/phase3-p3-1-plan.md` §2.1.1-補遺・§2.1.1-補遺3

---

## P3-1-Q8: `destructionModes.ts`のleaf規則の意味の再定義(`BATTERY_HEAT_LIMIT`値import許可)

- **日付**: 2026-08-03T16:13(正式Fable補足裁定、P3-1-Q8確定)
- **置換対象節(v12)**: §2「モジュール構成と状態機械設計」冒頭の記述「`destructionModes.ts`を`motorPhysics.ts`と同じ『leafモジュール』(**他のengineモジュールに依存しない**)に保つ」
- **旧契約(v12原文)**: 無条件の依存ゼロ規則(他のいかなるengineモジュールへの依存も持たない)と読める記述だった。
- **新契約(確定)**: leaf規則の意味を次のとおり再定義する——「`destructionModes.ts`は、`destructionOrchestration.ts`およびstep実装関数本体への逆依存・循環依存を持たない。基礎leaf(他のいかなるモジュールもimportしないファイル、例: `constants.ts`)への一方向値import、および既存の型のみimportは許す」。この再定義に基づき、`destructionModes.ts`が`constants.ts`から`BATTERY_HEAT_LIMIT`を値importすることを許可する(正典定数の複製・literal化は不可のため)。
- **理由**: leaf規則の目的は逆依存と循環の禁止であって、依存ゼロの自己目的化ではない。`constants.ts`は他モジュールを一切importしない真の基礎leafであり、そこへの一方向値importは規則の目的を一切損なわない。
- **実装ステップ**: P3-1サブステップ2(実装済み・Suu_mot3レビュー通過済み。leaf不変条件の構造テストで機械固定)
- **人間再承認**: 不要(実装詳細、報告記載で足りる)
- **出典**: `docs/phase3-p3-1-plan.md` §2.1.1-補遺2

---

## P3-1-Q9: `stepMotorWithDestruction`のconfig引数削除+Phase 3 wrapper共通不変条件

- **日付**: 2026-08-03T17:22(正式Fable補足裁定、P3-1-Q9確定)。人間再承認(P3-1-Q9-4)は承認待ち。
- **置換対象節(v12)**: §4.4「ラッパー関数: RunAccumulatorの受け渡しとterminationの生成」(`stepMotorWithDestruction`のシグネチャ)
- **旧契約(v12原文および、これを踏襲した実装)**: `stepMotorWithDestruction`は`config: MotorConfig`・`destructionConfig: DestructionConfig`を、`accumulator`(内部に`replaySnapshot`を保持)とは独立した引数として受け取る形で記述・実装されていた。この設計では、呼び出し側が`accumulator.replaySnapshot`と食い違う`config`/`destructionConfig`を型上構築でき、`createRunAccumulator`(P3-1-Q6)が確立したはずの「battery.profile不一致は構築不能」という保証が、`stepMotorWithDestruction`の引数設計によって素通りできる状態だった。
- **新契約(確定)**: `stepMotorWithDestruction`から`config`・`destructionConfig`の両引数を削除し、`accumulator.replaySnapshot.motorConfig`・`accumulator.replaySnapshot.destructionConfig`をそれぞれ唯一の出典とする。あわせて**Phase 3 wrapper共通不変条件**を新設: 「走行開始時に確定する構成情報は`RunSnapshot`を唯一の出典とし、wrapperの独立引数として再入力させない。wrapperの引数は、フレームごとに変わりうる動的入力(現在のsim状態・dt・rng・動的負荷等)に限る」。`destructionConfig`=全wrapperでsnapshot唯一出典。`motorConfig`=同様にsnapshot唯一出典(実効configはwrapper内部でbase+DestructionStateから合成し、`buildMotorOnlyFrameInput`のtheoreticalCurrentA計算も同一の実効configを使う——wrapper内部でのconfig出典も一本化する)。`carConfig`・`track`・`gearTotalToothCount`=snapshot(runContext)唯一出典。P3-2・P3-4のvehicle wrapperで動的入力に残るもの(プレイヤー入力等)は各計画で明確化するが、この不変条件の枠内で行う。
- **理由**: 案(a)(`destructionConfig`のみ削除)はD03の穴だけを塞ぐが、`MotorConfig`側に同じ階級の穴(liveとリプレイで異なるconfigを使えること)を残す。`RunSnapshot`は図鑑リプレイの入力そのものであり、live走行がsnapshotと異なるconfigで走れる限り「リプレイは走行の正直な再生である」という契約が呼び出し側の慣習頼みになる——これはD03スキップと同種の、検出されない嘘の温床である。案(c)(runtime一致検証)はP3-1-Q6が確立した「fail-fastより構築不能」の原則より弱い。「Q9の本質は引数の数ではなく、同じ走行契約を複数経路から入力でき静かな不一致を作れることであり、その定義から案(b)が一意に導かれる」という問題定義そのものが裁定の核心。
- **付帯条件**: (i) リプレイ等価テスト(同一`RunSnapshot`から`createRunAccumulator`→wrapperの連続呼び出しを独立に2回行い、`events`・`destructionState`・`termination`が完全一致することを検証)を追加。(ii) 共通不変条件の文言をwrapper実装のJSDocへ記載し、P3-2/P3-4の骨格実装時に同型テストを課すことをDoD申し送りとする。(iii) P3-4のgameStore配線計画で、走行中のモーター構成編集は「現在runの終了+新しいbeginRun(新snapshot)」として扱う(configの途中差し替え概念の廃止)ことを明示的に定義する。
- **実装ステップ**: P3-1サブステップ3是正実装(**人間再承認待ち、未着手**。既存差分は是正前の旧シグネチャのまま凍結保持)
- **人間再承認**: **要(P3-1-Q9-4、承認待ち)**。v12 §4.4の承認済み公開シグネチャの変更であり、P3-1-Q6と同じ扱い。
- **出典**: `docs/phase3-p3-1-plan.md` §2.2.1・§2.2.2

---

## 監査で対象外と判断した裁定(完全性のための記録)

以下は、v12の記述に対する確認事項として裁定を経た項目だが、v12本体の**具体的な記述テキストを上書きするものではない**ため、本台帳のエントリとしては採用しなかった。監査を実施したことの記録として残す。

- **P3-1-Q1(D01漸減物理のスコープ限定)**: v12 §3のD01行は「実効巻数・占積が漸減、振動増…走行継続」という**最終的な設計目標**を記述しており、本裁定はこの目標自体を変更するものではなく、P3-1がこの目標のうち「崩壊開始イベント+既存恒久劣化」のみを実装し、「漸減」の実装をP3-3へ先送りするという**実装順序・スコープの決定**である。v12の記述はP3-3完了時点でそのまま妥当することが意図されており、上書きに当たらない。
  - **追記(2026-08-08、正式Fable P3-2-Q12裁定による返済記録の追補)**: 返済先はP3-3のまま(変更なし)。ただし「D01漸減は車体層専用パターンに属し`composeEffectiveMotorConfig`〈P3-2新設〉の対象外」という、P3-2計画v1〜v5が抱いていた層の整理は**誤りと訂正**された——spec §7.1.1の「実効巻数・占積の漸減」はトルク定数・抵抗というモーター層の量であり、`composeEffectiveMotorConfig`の対象そのものである(既存の`axisOffsetMm`一回加算は漸減とは別物の暫定実装、`vehiclePhysics.ts`に残る車体層専用パターンである)。P3-3送りの正当な理由は層ではなく**スコープ規律**(P3-2は本フェーズ最大のステップであるため)。**返済形**: 機構(`composeEffectiveMotorConfig`)自体はP3-2で導入済みのため、P3-3での回収は「D01分岐の追加+較正sweep」に縮小する。詳細は`docs/phase3-p3-2-plan.md`(v6)0.3節5・7節Q12を参照。
- **P3-1-Q3(D03短絡持続時間の較正値3.0秒)**: v12 §3のD03行は`config.battery.shortCircuitDurationLimitS`という**実行時configパラメータ**を参照する形で記述されており、具体的な数値をv12本文が指定していない(値は`materialMapping.ts`が素材写像として供給する設計、v12 §12参照)。本裁定はこのconfigパラメータの候補値(3.0秒)をsweep実測で確定した**較正決定**であり、v12本文の記述を上書きするものではない。

---

## P3-2-Q1〜Q12: D04(リポ経路)+D07(三段開示骨格)実装計画の確定裁定

- **日付**: 2026-08-08(正式Fable技術レビュー、人間プロジェクトリード直接提示)。
- **対象文書**: `docs/phase3-p3-2-plan.md`(v6、v1〜v5の往復レビュー〈Suu_mot3必須修正計28点相当〉を経て正式Fable提出、条件付き承認)。
- **置換対象節(v12)**: §3(D04/D07行)・§3.2(実効config合成)・§12(P3-2 DoD)。
- **人間再承認**: **要(6項目のみ)**。詳細は`docs/phase3-p3-2-human-reapproval-bundle.md`を参照。Q10・Q12は人間再承認不要と明示的に裁定された。
- **実装ステップ**: P3-2サブステップ0〜7(**人間再承認バンドル承認待ち、未着手**)。
- **出典**: `docs/phase3-p3-2-plan.md`(v6)7節「確定裁定一覧」に全文引用。

各裁定の要旨(詳細・実装コードは出典を参照):

| 番号 | 要旨 | 人間再承認 |
|---|---|---|
| P3-2-Q1 | D04内部抵抗悪化係数を単一値`internalResistanceDegradationMultiplier`(swelling/smoking区別なし、初期候補値1.5)とする | 要 |
| P3-2-Q2 | D07可逆熱ダレ係数`reversibleDroopMultiplier`(初期候補値0.95) | 要(Q5と統合) |
| P3-2-Q3 | D04/D07の実効config合成順序は乗算の可換性により無意味、単一式`実効B = base × (1−不可逆分) × 可逆分`で表現する | 不要(実装詳細) |
| P3-2-Q4 | D04状態機械5点: (i)`overDischargeActive`毎フレーム再評価、(ii)段階タイマー不可逆進行(物理的正当化明記)、(iii)混合原因は`D04CauseLog.initiatingCause`新設で記録、(iv)stage/cause交差不変条件3条をvalidatorで拒否、(v)`affectedRoles`重複禁止は`validateFireExposureProfile`への拒否ロジック追加で保証 | (iii)(v)のみ要 |
| P3-2-Q5 | 劣化量供給経路はevent埋め込み方式(`DestructionConfig.d04`+`UnstampedDestructionEvent`拡張)。`magnetScorchDeltaFraction`はD07の`demagnetizationDeltaFraction`の再利用ではなく独立フィールド(火災は急性熱曝露で物理的原因が異なるため)、ただし`magnetScorch >= demag`を全磁石素材で不変条件化 | 要 |
| P3-2-Q6 | `RunSnapshot`へ`courseLengthM`・`slopeRad`を追加(案A、既存`context`+`track`構造への交差検証拡張)。判別union化(案B)は`DestructionRunContext.context`と意味の重複する第二の判別子を作るため不採用。`contractVersion`1→2 | 要 |
| P3-2-Q7 | `regressionDiff`のbaselineは同一`recipeKey`直近5回(当該run除く)の中央値(`REGRESSION_BASELINE_WINDOW=5`は契約定数)。型設計は`metricKind`から`degradationDirection`を導出する純関数案 | 不要(P3-2内で完結する新規純関数) |
| P3-2-Q8 | P3-1完了報告の申し送り「実wrapper×全endReason網羅」は、到達不能な`derailed`/`energyExhausted`について構造的証明の引用+到達可能6種の正例テストで充足したとみなす(track-run文脈での必須網羅はP3-4へ台帳送り) | 不要 |
| P3-2-Q9 | D04途中段階終了時のノート記録は、`PendingNotebookRecord`3腕へ`finalDestructionState: DestructionState`を追加する方針(案B)を承認。型変更の実装はP3-4のgameStore配線サブステップで行う(P3-2時点は書き手不在のため「死にフィールド」を作らない) | 要(方針のみ、実装はP3-4) |
| P3-2-Q10 | `stepMotorWithDestruction`への実効config合成追加(内部改修、公開シグネチャ不変)は、v12 §3.2の凍結契約(実効configはwrapper内部で毎step合成)の履行であり契約変更ではない | **不要** |
| P3-2-Q11 | D07熱ゲージ入力源は候補A(I²R/伝導、失速・過負荷時に減磁リスク最大という物理的根拠)。磁石構造は候補(ii)(`{thermal, irreversible}`の2部構成、0〜1ゲージ規約を満たす)。受け入れ条件4点+nonDemagnetizing負例1点 | 要(Q5と統合) |
| P3-2-Q12 | D01漸減の返済先はP3-3のまま(スコープ規律が理由。層の整理は誤りと訂正、P3-1-Q1エントリへ追記済み) | **不要** |

**付帯条件6点(すべて確定、実装DoDへ反映済み)**: (1)予算不変性テスト(`composeEffectiveMotorConfig`合成前後で`computeEnergyBudgetJ`不変)、(2)`stepTestRunWithDestruction`のJSDocへvehicle文脈専用のtrusted precondition明記、(3)D04較正の結合条件(短絡経路の炎上到達可能性の解析的裏付け)を本文明記、(4)`magnetScorchDeltaFraction >= demagnetizationDeltaFraction`不等式テスト、(5)D07 Q11負例+到達可能性条件(3)をDoDへ明記、(6)test-runでの過放電到達が意図仕様であることを1行明記。

**必須修正2点(v5→v6で反映済み)**: (M-1)dt分割不変性テストの定義誤り——「1/120s×N vs 1/240s×2N」は固定物理dt=1/120sの正典に反する。正しい比較はdt固定のまま「1物理step×2Nフレーム vs 2物理step×Nフレーム」というバッチング比較。(M-2)`RunSnapshot.slopeRad`が`stepTestRun`(既存、7番目の引数)へ実際に渡され消費されることを確認・配線(死にフィールド化の回避)。

---

## P3-2-Q13-1: overheated保留規則+Phase3-Q2適用範囲注記

- **日付**: 2026-08-09T05:29(正式Fable補足裁定、人間プロジェクトリード直接提示、Suu_mot3中継確認済み)。人間再承認: 保留中(本エントリが対象)。
- **命名の明確化(本エントリ固有の注意)**: 本エントリの見出し「Q13-1」は`docs/phase3-p3-2-plan.md`(P3-2計画)のゲート5較正裁定依頼(`docs/phase3-p3-2-gate5-calibration-review-request.md`)内の質問番号であり、**「Phase3-Q2」(本エントリが適用範囲を注記する対象、`docs/phase3-fable-review.md`59行目「§15重点質問」・`docs/phase3-plan-v12.md`804行目「正式Fable Q2回答」)とも、P3-2固有の質問リスト内「P3-2-Q2」(D07可逆ダレのRPM低下、本台帳の`P3-2-Q1〜Q12`エントリの表内Q2)とも別物である。** 番号の衝突を避けるため、以下の文中では常に「Phase3-Q2」「P3-2-Q2」「P3-2ゲート5のQ13-1」を明示的に書き分ける(過去に同種の命名衝突がP3-2ゲート5の是正過程で発見されている、教訓として`project_phase3_p3_2_gate_progress.md`〈alice_mot3メモリ〉に記録済み)。
- **置換対象**: `docs/phase3-fable-review.md`59行目・`docs/phase3-plan-v12.md`804行目の「Phase3-Q2」原文——「D04が既存物理終了後に継続stepしない」という確定裁定。本エントリはこの原文自体を書き換えず、**適用範囲を注記として精密化する**(v12本体無編集の原則に従い、本台帳へ追記のみで反映する)。
- **旧解釈(Phase3-Q2原文が単独で読まれた場合)**: 「D04が既存物理終了後に継続stepしない」という文言は、`overheated`終端(既存物理の終了条件の1つ)がD04進行中に成立した場合でも、物理stepをそこで止めるべきだと読める余地があった。この読み方のまま、D04段階時間(swelling/smoking)にart-spec §7の12fps格子1個(0.0833秒)以上を割り当てようとすると、production-valid構成での実測(ゲート5是正版feasibility表1〜3、`docs/phase3-p3-2-gate5-calibration-review-request.md`)により、離散時間シミュレーションとして達成可能な真に最速のentryでも、D04の2段階分の遷移時間をこの時間予算(最大19〜21フレーム)に収めることが構造的に不可能であることが判明した。
- **新契約(確定、適用範囲注記)**: Phase3-Q2が禁じるのは「物理終了後の継続step」である。**電池が`lipo`で、D04の`stage`が`{swelling, smoking}`にある間は、`overheated`という物理終了条件そのものが成立しない(保留される)——これは物理終了の定義から、D04熱暴走進行との重複表現を除く措置であり、「終了後にstepを続ける」ことではない。** Phase3-Q2の他の作動規則(`energyExhausted`・`stalled`・`derailed`・`manualAbort`はD04によって保留されず、これらで走行が終われば段階は途中凍結する)は無変更のまま生き残る。保留対象は`overheated`のみ、根拠は「V2由来の`overheated`終端とD04熱暴走進行が、同一の物理過程〈電池の熱的破局〉の二重表現になっていたこと」のみである。
- **有界性**: 保留は無限延命ではない。正式P3-2-Q4(ii)裁定(D04段階タイマーの不可逆進行)により、`swelling`突入から`swellingS + smokingS`後に`burning`が必ず成立するため、保留窓は段階合計時間で厳密に有界である。
- **理由**: `docs/phase3-p3-2-plan.md`14.1節を参照(自己完結的な裁定理由・却下案・実装制約を記載、本エントリでは重複記載しない)。
- **実装ステップ**: 未着手(Suu_mot3照合+人間再承認待ち、`docs/phase3-p3-2-plan.md`14.6節「ゲート5の残作業」参照)。
- **人間再承認**: **要(未完了、本裁定の中核対象)**。既存確定裁定(Phase3-Q2)の適用範囲を狭める精密化であり、確定裁定を上書きする手続きとして人間再承認の対象とする(無申告の再解釈の前例を作らないため、Fable裁定文の明示的な指示)。
- **出典**: `docs/phase3-p3-2-gate5-calibration-review-request.md`(v4、Q13-1)、Fable補足裁定原文(2026-08-09T05:29、Suu_mot3中継、agmsg履歴参照)、`docs/phase3-p3-2-plan.md`14節。

---

## P3-2-Q13-2: 「通常運用(NORMAL_OPERATION)で非到達」の正式定義+Q14精密化

- **日付**: 2026-08-09T05:29(正式Fable補足裁定、人間プロジェクトリード直接提示、Suu_mot3中継確認済み。Q14精密化は2026-08-09T07:51、同様に人間プロジェクトリード直接提示・Suu_mot3中継確認済み)。
- **置換対象節(v12)**: v12本体は「通常運用で非到達」の正式な基準構成・時間窓・電池を定義していない(意図的な空白)。本裁定はこの空白を埋める。
- **旧契約**: なし(P3-1/P3-2の各sweep証跡が使ってきた「通常運用」の時間窓・構成はモードごとにバラバラで、正式な統一定義が存在しなかった)。
- **新契約(確定)**: 基準構成(`NORMAL_OPERATION`基準)は素材={copper-standard, neodymium, pom, 対象電池}・player値すべて既定・攻め入力なし。第1条件(実在コース完走)は`src/data/tracks.ts`の実在プレイアブル全コースを自然完走し、`finished`・破壊イベントゼロ・D07 droop/irreversibleなし(全電池共通)。第2条件(持続挙動)は症状の物理型(平衡型/構造型/資源枯渇型)で時間窓の定め方を3分する。詳細は`docs/phase3-p3-2-plan.md`14.3節に自己完結記載(重複記載しない)。
- **Q14精密化(確定、2026-08-09T07:51)**: 第1条件の予算条件(`maxEnergyUsedRatio`)を電池物理型別に分離する——LiPo(D04過放電経路が構造的に存在)は`maxEnergyUsedRatio ≤ 0.85`、nonLipo(alkaline/NiMH、D04が型レベルで不存在)は自然完走(`finished`、`ratio<1.0`と同値)のみ。**一般原則**(今後の受け入れ条件の作文規則): 受け入れ閾値は、その閾値が防ぐ危険が構造的に存在する対象にのみ適用する。契機: ゲート5是正版でQ13-2を全電池×実在全5コースへ拡張実測した結果、`energy-run`でalkaline(実測0.9970)・NiMH(実測0.9338)が旧`0.85`一律条件を超過することが判明した(`docs/phase3-p3-2-gate5-normal-operation-review-request.md`Q14として提出)。原因はbatteryCapacityRatio較正差(alkaline/NiMH=1.0、LiPo=1.3、人間再承認済み)による物理的に正しい帰結であり、`0.85`自体がD04固有の`unsafeDischargeStartRatio`(0.90)由来のためD04を持たないnonLipoには物理的参照先がなかった。
- **理由**: 詳細な裁定理由(却下案(b)(c)の理由含む)は`docs/phase3-p3-2-plan.md`14.8節を参照(重複記載しない)。
- **実装ステップ**: Q13-2本体はゲート5是正版で実装済み(`src/materials/__tests__/materialMapping.test.ts`のQ13-2通常運用確認テスト)。Q14精密化の反映(LiPo/nonLipo分離条件への変更)はGate5完了報告で実施。
- **人間再承認**: 不要(Q13-2本体・Q14精密化のいずれも数値・閾値・production値・素材写像を変更せず、docs反映+Suu_mot3照合で足りると裁定済み)。
- **出典**: `docs/phase3-p3-2-plan.md`14.3節・14.8節、`docs/phase3-p3-2-gate5-normal-operation-review-request.md`(Q14)、Fable補足裁定原文(2026-08-09T05:29・2026-08-09T07:51、Suu_mot3中継、agmsg履歴参照)。

---

## 運用規則追補1: 名前空間必須の適用範囲(2026-08-04、命名運用の自己矛盾解消)

冒頭「運用規則」の「番号単体の表記は用いない」は、`docs/phase3-p3-1-plan.md`(v11)自身の各P3-1節が、同一節内の局所shorthand(例: 2.1.2節内で「Q6(a)」を繰り返し使う等)を多数使っている現実と矛盾していた。適用範囲を次のとおり訂正する(命名運用ルールの範囲明確化であり、物理・公開契約の変更ではない):

- **台帳(本ファイル)のentry見出し・台帳内のcross-step参照(P3-0エントリからP3-1エントリを指す等)・現行コード(`src/engine/`・`src/materials/`・`src/store/`)のJSDoc/コメントでは、完全名前空間(`P3-0-Q<n>`・`P3-1-Q<n>`等)を必須とする。**
- **詳細計画書(`docs/phase3-p3-1-plan.md`等)の同一P3-1節内でのみ用いる局所shorthand(「Q6(a)」等、当該計画の直近文脈で一意に読める場合)は許容する。** 本台帳の改訂履歴内の原文記録(過去の版が実際にどう書かれていたかの引用)も同様に許容する。
- **P3-0とP3-1をまたぐ参照、または複数の計画書・本台帳をまたぐ参照は、完全名前空間を必須とする。**

---

## 実装状態追補(2026-08-04、契約変更なし)

以下は既存エントリの内容を書き換えず、現在の実装進捗のみを追記するものである(運用規則「追記のみ」に従う)。

- **P3-1-Q4(fixture context統合)**: サブステップ4で完了。motor-only/test-run/track-runの3文脈それぞれについて、有効な`RunSnapshot`(`captureRunSnapshot`の実際の出力、`restoreRunSnapshot`検証成功済み)を使うtable-drivenテストで`applyRunOutcome`到達を確認済み(`src/store/__tests__/runOutcomeApplication.test.ts`)。
- **P3-1-Q6**: 人間再承認済み(2026-08-04)。`createRunAccumulator(replaySnapshot)`単一引数化を実装済み(`src/engine/destructionOrchestration.ts`)。
- **P3-1-Q9**: 人間再承認済み(2026-08-04)。`stepMotorWithDestruction`から`config`・`destructionConfig`両引数を削除する是正実装済み。非自明な破壊経路(held-short `motorConfig`+短時間`destructionConfig`)によるリプレイ等価テスト(`mulberry32(snapshot.seed)`で独立2run、D03発火+`destructionTerminal`終端を比較前にassert)も実装済み。
- **P3-2-Q13-1(overheated保留規則+Phase3-Q2適用範囲注記)**: **人間再承認済み(2026-08-09T06:20、人間プロジェクトリード「overheated保留規則1点を再承認します」、Suu_mot3中継確認済み)。** ゲート5残作業(`docs/phase3-p3-2-plan.md`14.6節)の着手が解禁された。実装は未着手(本追補時点)。

**Gate9追記(2026-08-09、以下は改訂7で追加。既存の上記各エントリは書き換えず追記のみ)**:

- **P3-2-Q13-1(続報)**: 上記の「実装は未着手」はGate5着手前時点の記述である。**Gate5で実装完了・Suu_mot3照合通過済み。** `normalizeOverheatedStatusForD04Hold(state, destructionState)`を`src/engine/destructionOrchestration.ts`へexport純関数として新設し、`stepTestRunWithDestruction`(後述Gate6)を含む全wrapperがpre/post 2面契約(14.2節)で共通利用する。単体テスト・入力非破壊・同一step境界4ケース・保留窓有界性・terminal分類証跡・D03同一frame優先規則の境界fixtureは`src/engine/__tests__/destructionOrchestration.test.ts`に実装済み。
- **P3-2-Q13-2/Q14(続報)**: **Gate5で実装完了・Suu_mot3照合通過済み。** `src/materials/__tests__/materialMapping.test.ts`のQ13-2通常運用確認テスト(table-driven)で、実在全5コース×全3電池(alkaline/NiMH/LiPo)=15組合せのうち、LiPoは`maxEnergyUsedRatio≤0.85`、nonLipo(alkaline/NiMH)は自然完走(`finished`)のみを要求する分離条件で15/15全適合を確認済み。
- **Gate6(`RunSnapshot`拡張+`stepTestRunWithDestruction`)**: **完了・Suu_mot3照合通過済み(2026-08-09T09:07)。** `RunSnapshot`/`CaptureRunSnapshotInput`/`RestoredRunSnapshot`へ`courseLengthM`/`slopeRad`追加(`RUN_SNAPSHOT_CONTRACT_VERSION` 1→2)、`restoreRunSnapshot`へ交差検証3規則(motor⟹両方null/test-run⟹courseLengthM正の有限数・slopeRad有限数/track-run⟹両方null)を追加。`stepTestRunWithDestruction`を`src/engine/destructionOrchestration.ts`へ新設し、`vehiclePhysics.ts`は無改修のまま利用(到達可能6種の`status`全正例、`slopeRad`配線の実効果テスト込み)。
- **Gate7(store fixture統合、`deriveFireExposureProfileFromLoadout`)**: **完了・Suu_mot3照合通過済み(2026-08-09T11:29)。** `deriveFireExposureProfileFromLoadout(snapshot)`を`src/store/runOutcomeApplication.ts`へ新設(gameStore.tsへの配線はP3-0-Q2裁定どおりP3-4まで延期)。D04/D07の劣化diffsがmotor-only/test-run(実wrapper)・track-run(実wrapperが生成した内部一貫性のあるRunOutcomeのevents/state/diffsをそのまま使い、`replaySnapshot`のみ有効なtrack-run snapshotへ差し替える方式)の3文脈で`applyRunOutcome`へ原子的に反映されることを`src/store/__tests__/runOutcomeApplication.test.ts`のfixtureテストで確認済み。`magnetScorchDeltaFraction >= demagnetizationDeltaFraction`(付帯条件4)は既存のGate2テスト(`src/materials/__tests__/materialMapping.test.ts`)が引き続き充足を固定している(Gate7で新規に狭い重複テストを追加後、既存テストとの重複が判明し削除した)。`RunSnapshot`の`courseLengthM`/`slopeRad`round-trip確認は`src/store/__tests__/saveStore.test.ts`に実装済み。
- **Gate8(`src/materials/regressionDiff.ts`、三段開示段階2骨格)**: **完了・Suu_mot3照合通過済み(2026-08-09T12:10)。** `detectPerformanceRegression`のbaselineプールは、計画本文が明記する「同一recipeKey」に加えて**「同一metricKind」も一致条件へ含める**精密化をSuu_mot3が承認済み(単位の異なる指標を同一中央値計算に混在させないための実装上の帰結)。非有限値の扱いは「比較候補〈同一recipeKey・同一metricKind〉に1件でも非有限値があれば関数全体でnullを返す」というfail-closed契約(無言修復の禁止)で実装。`directionForMetricKind`はexport済み。単体テスト24件は`src/materials/__tests__/regressionDiff.test.ts`に実装済み。production配線(実行タイミング・永続化・UI表示)はP3-4のスコープ(v12 §5.3のA2裁定どおり)。

---

## P3-3-Q1〜Q14: D02(コイル焼損)+D05(異常ブラシ火花)+D01漸減(P3-1-Q1返済)+ブラシ素材写像 実装計画の確定裁定

- **日付**: 2026-08-09(正式Fable技術レビュー、人間プロジェクトリード直接提示、Suu_mot3中継確認済み)。
- **対象文書**: `docs/phase3-p3-3-plan.md`(v6、v1〜v5の往復レビュー〈Suu_mot3必須修正5ラウンド計47点〉を経て正式Fable提出、条件付き承認。v7で全裁定・付帯条件を反映)。
- **総合判定**: 条件付き承認(実装開始を妨げる必須修正なし。Q1〜Q14の裁定反映+付帯条件7点+人間再承認バンドルの承認をもって実装解禁)。
- **人間再承認**: **要(13項目)**。詳細は`docs/phase3-p3-3-human-reapproval-bundle.md`を参照。
- **実装ステップ**: ゲート0〜7(**人間再承認バンドル承認待ち、未着手**)。
- **出典**: `docs/phase3-p3-3-plan.md`(v7)15.1節「確定裁定項目」に全文引用。

各裁定の要旨(詳細・実装コードは出典を参照):

| 番号 | 要旨 | 人間再承認 |
|---|---|---|
| P3-3-Q1 | D02コイル熱ゲージを`computeRCoil`ベースの`coilLossW=I²R`(実効config・実電流の毎step独立再計算)で駆動する。P44是正(正帰還断定の撤回)を含めて承認 | 要(§15.2#3・#5) |
| P3-3-Q2 | D02発煙抵抗倍率は単一固定値(段階内比例則は較正根拠のない発明、P3-2-Q1と同規律) | 要(§15.2#3) |
| P3-3-Q3 | D05摩耗換算は`advanceD05`が素材係数・`wearPerAmpSecond`まで畳み込み`cumulativeWearDeltaFraction`(無次元)をfinal stateから読む(候補a)。`deriveDegradationDiffs`公開シグネチャ不変 | 要(§15.2#4・#6) |
| P3-3-Q4 | D01進行量は`max(0,\|ω\|−COIL_DEFORM_OMEGA)×dt`積分(候補b)、`angularVelocityRadS`新設 | 要(§15.2#1・#5) |
| P3-3-Q5 | `effectiveTurnsRatio`(実効巻数+占積の単一磁気結合率、磁気2式のみへ適用)を承認。backEmf/tMagへ同一係数=エネルギー整合(K_E=K_T相反性)の要請、実装コメントに1行明記が条件。振動増は既存`coilCollapsePenaltyMm`で充足済み(P3-1-Q1返済条件の認定) | 要(§15.2#1・#2・#7・#8、#8は最重量) |
| P3-3-Q6 | ブラシ写像2層分離(接触抵抗・チャタリング→MotorConfig層、摩耗率→DestructionConfig.d05層)を承認 | 要(§15.2#4・#7・#8) |
| P3-3-Q7 | D05一時接触抵抗悪化は回復区間モデル(候補a、`recoveryFramesLeft`)。spec解釈確定: スパーク中の悪化は既存完全瞬断が包含済み、観測可能な悪化はアーク後接触面荒れによる直後回復区間として実装(実在物理、字義拡張ではない) | 要(§15.2#4・#6・#8・#12) |
| P3-3-Q8 | D02発煙は不可逆latch(候補b、`smokingStarted`/`smokingStartedAtT`)。エナメル絶縁の熱劣化は不可逆、D01/D04と同規律。非永続派生関数`isD02SmokingActive`(config横断交差不変条件の発生自体を回避)の設計を特に評価 | 要(§15.2#9) |
| P3-3-Q9 | `D05CauseLog`へ`theoreticalCurrentA`追加(候補b)。`currentA=0`の事実を正直に残し強度を別記、P3-2-Q4(iii)と同原則 | 要(§15.2#10) |
| P3-3-Q10 | recipeCode.ts `bcr`/`bpr`キー追加・MC3版上げ不要・`MaterialSelection.brushId`必須化の3点を承認 | 要(§15.2#11) |
| P3-3-Q11 | `brush.wearFraction`の次run反映はP3-4据え置き(gameStore実配線境界、D02/D04/D05/D07横断の共通経路として第一級節扱い) | 不要(方針のみ、実装はP3-4) |
| P3-3-Q12 | `effectiveTurnsRatio`は汎用`MotorConfig`optionalフィールド、`restoreRunSnapshot`側にbase専用制約(`undefined\|\|1`)を重ねる層分離を承認 | 要(§15.2#12) |
| P3-3-Q13 | `mapD05BrushWearConfig`出力+共通部分を`assembleD05Config`(戻り値型注釈による自動ドリフト検出)で単一構築(候補b)。Q7裁定によりcommonPart完全型確定 | 不要(`materialMapping.ts`内の新設純関数、公開型の変更を伴わない) |
| P3-3-Q14 | `encodeRecipe`は戻り値`string`維持+非1の`effectiveTurnsRatio`でthrow(候補c)。候補b(Omit型によるbase専用型分離)は過剰プロパティ検査がリテラル代入にしか働かないため偽の安全と判定し却下 | 要(§15.2#13、シグネチャ不変のため影響限定的) |

**付帯条件7点(すべて確定、v7で実装DoDへ反映済み)**: (1)ゲート5でP3-2-Q13-2の`NORMAL_OPERATION`15組合せ表をD01/D02/D05新モード込みで再実測(全15組合せでD01 triggered=false・D02 smokingStarted=false・D05 episodeCount=0かつcumulativeWearDeltaFraction=0)。(2)D02/D05イベントのtemperature規約明記(D02=`uncalibratedGauge`、D05=`unavailable`、P3-1のD01/D03と同規律)。(3)4.1節疑似コードへ`justCrossed`成立時の`episodeTriggered=true`設定を明示補記。(4)P3-4申し送りへ`RotorAssemblyState.collapsed===true`個体の装備拒否(spec §7.1.1「サルベージのみ可」の執行点)を追加。(5)Q5のエネルギー整合コメント(K_E=K_T相反性)を実装コメントへ1行残す。(6)Q7の解釈段落(アーク後接触面荒れ)を7節へ記録。(7)Q14のthrow文言に本裁定への参照を1行含める。

**再提出要否**: 上記裁定反映が本裁定の範囲内であるためFable再提出は不要。Suu_mot3差分照合→人間再承認バンドル承認→ゲート0から実装着手へ進む。完了報告の証跡要件はP3-2と同型(全テスト出力・sweep全文・bundle差分・`rg`再実測・`cmp`・`git diff --check`/`--stat`)。

---

## P3-3-Q15: Gate2較正値の未承認混入審査(補足裁定)

- **日付**: 2026-08-10(正式Fable補足裁定、人間プロジェクトリード直接提示、Suu_mot3中継確認済み)。
- **契機**: P3-3ゲート2(materialMapping.tsのブラシ写像)完了報告に対するSuu_mot3照合で、既承認契約(11.1節「較正値は本書で確定しない」・人間再承認バンドル前文「数値較正値はいずれも未確定」)に反する未審査具体値の混入(P48)・§6.3の銀黒鉛摩耗契約の計画内矛盾(P49)・P3-2 D07数値回帰fixtureへの非anchorブラシ混入(P50)の3点が指摘された。
- **対象文書**: `docs/phase3-p3-3-plan.md`(v9 15.5節でdocs-only追補・独立Fable補足レビュー依頼書`docs/phase3-p3-3-fable-supplementary-review-request-q15.md`を提出、v10で裁定を反映)。
- **総合判定**: P48・P49に補足裁定、P50は機械的是正(Fable裁定不要)。
- **手続きの評価(Fable原文)**: 未承認値の混入(P48)は契約違反だが、ゲート照合が物理配線(ゲート4)前にこれを止め、alice_mot3が追加修正を凍結してdocs-onlyでエスカレーションしたことは、二段階承認の破れを効果が生じる前に多層レビューが検出した事例であり、プロセスは設計どおり機能した。
- **人間再承認**: **要(1項目、Q15-4のみ)**。詳細は`docs/phase3-p3-3-human-reapproval-bundle.md`の追補#4を参照。
- **実装ステップ**: ゲート2是正(実装済み、8ファイル)。人間再承認完了後にゲート3(状態機械)へ進む。
- **出典**: `docs/phase3-p3-3-plan.md`(v10)15.5節に全文引用。

各裁定の要旨:

| 番号 | 要旨 | 人間再承認 |
|---|---|---|
| P3-3-Q15-1 | P48の扱い: 案(a)〈暫定候補値を明示しFableへ個別裁定〉を確定。案(b)〈test-onlyダミー値〉・案(c)〈命名規約のみ〉は却下。**恒久再発防止規則を新設**: 「較正数値をproductionへ置く前に初期候補値としてFable裁定を経ること、確定はsweep+最終報告+人間commit承認」(P3-2方式への統一) | 不要(手続き裁定、台帳記録で足りる) |
| P3-3-Q15-2 | ratio類6個(接触抵抗ratio: 銅板1.3・銀黒鉛0.7・貴金属0.5、チャタリング確率ratio: 貴金属0.7、摩耗率ratio: 銅板1.5・貴金属0.7)を暫定候補値として全数承認。銅板の物理所見(酸化被膜による接触抵抗悪化)付き。Gate5受け入れ条件(接触抵抗ratio差の定常計測観測可能性)を追加 | 不要(暫定候補値、確定はsweep+人間commit承認) |
| P3-3-Q15-3 | 貴金属の高電流ペナルティ具体値2個(threshold=3A・multiplier=2.5)を暫定候補値として承認。スケール所見(3Aは通常域上端〜虐待域入口)付き。Gate5受け入れ条件3点(NORMAL_OPERATION非到達・高負荷での順位逆転実測・銅板超えの副次的帰結の明示報告)を確定 | 不要(暫定候補値、確定はsweep+人間commit承認) |
| P3-3-Q15-4 | `highCurrentPenaltyThresholdA`/`highCurrentPenaltyMultiplier`のフラット2フィールドを、`{ kind: 'noPenalty' } \| { kind: 'thresholdPenalty'; highCurrentPenaltyThresholdA: number; highCurrentPenaltyMultiplier: number }`の判別unionへ変更(候補ii確定)。番兵値999がP3-2-Q11の同型番兵却下と矛盾すること、D07の判別union前例との整合を理由とする。付帯: `thresholdPenalty`枝は`multiplier > 1`厳密 | **要**(ゲート1確定済み`DestructionConfig.d05`の破壊的変更、バンドル#4追補) |
| P3-3-Q15-5 | P49の扱い: 案(i)〈6.3節の表を「銀黒鉛の高電流域は摩耗率でカーボンと同値、優位は低接触抵抗のみ」へ精密化〉を確定。案(ii)〈摩耗率<1を写像〉はspec/materials.ts原文に根拠がなく物性の発明として不採用 | 不要(docs修正のみ、実装変更なし) |
| P3-3-Q15-6 | 人間再承認要否の個別判定: Q15-1・Q15-2・Q15-3・Q15-5・P50はいずれも不要、Q15-4のみ必要 | (本行はQ15-1〜Q15-5の再承認要否の集約) |
| P3-3-Q15-7 | Q6(ブラシ2層分離)・Q13(`assembleD05Config`戻り値型注釈)への設計変更は不要。union化は`materialPart`型の精密化のみで骨格は不変 | 不要 |

**値の確定経路(恒久規則、11.1節へ反映済み)**: Fable候補裁定(本エントリ、Q15-2・Q15-3)→ゲート5sweep(受け入れ条件充足の実測)→確定申請(最終報告表への記載)→人間commit承認、の4段階。人間再承認バンドル前文「数値較正値はいずれも未確定」は、この経路のいずれの段階が完了しても(Fable候補裁定段階まで進んでも)真であり続ける——「未確定」は「Fable裁定さえ経ていない」ではなく「commit承認を経ていない」を意味すると精密化する。

**P50(記録、Fable裁定対象外)**: `materialMapping.test.ts`のP3-2 D07数値回帰fixture(受け入れ条件2/3)を`brush-carbon`(anchor)へ是正し、`scripts/materialSweep.ts`冒頭コメントの文言不一致を実装と一致する記述へ訂正した。P3-2較正値の意味を変えないための機械的是正であり、Fable裁定不要・Suu_mot3照合で足りると裁定された。

**再提出要否**: 上記裁定反映が本裁定の範囲内であるためFable再提出は不要。Q15-4の人間再承認完了後、ゲート3(状態機械)へ進む。

---

## P3-3-D01較正確定: floor到達可能性の受け入れ条件改訂+自己制限プラトーの創発知見(補足裁定)

- **日付**: 2026-08-11(正式Fable補足裁定、人間プロジェクトリード直接提示、Suu_mot3中継確認済み)。
- **契機**: checkpoint5較正レビュー(正式Fable較正レビュー、2026-08-10)がD01(`decayExposureScaleRad`/`minEffectiveTurnsRatio`)へ追加指示した4条件sweep(漸減性・観測可能性・floor到達可能性・NORMAL_OPERATION非トリガ)の結果、現行値(`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`)が旧条件3(floor到達可能性)を満たさないことが実測で判明した。Suu_mot3の明示指示(「満たさない場合は値を変更せず停止し、実測全文と提案値をエスカレーションしてください」)に従い、値を変更せず`docs/phase3-p3-3-d01-supplementary-review-request.md`(実測全文・harness再現情報)で補足レビューを依頼した。
- **対象文書**: `docs/phase3-p3-3-d01-supplementary-review-request.md`(依頼書)、`docs/phase3-p3-3-d01-fable-response.md`(裁定全文)、`docs/phase3-p3-3-d01-fable-submission-message.md`(Suu_mot3作成の短文submission)。
- **総合判定**: **現行値(`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`)を維持したまま確定する**。誤っていたのは値ではなく、Fable自身が課した受け入れ条件3(floor到達可能性)だった。scale 200への変更・追加の値探索・モデルの見直しはいずれも行わない。
- **創発知見(本プロジェクト2件目)**: 実測が発見した負のフィードバック(劣化→トルク定数低下〈K_E=K_T相反性、P3-3-Q5〉→回転低下→`COIL_DEFORM_OMEGA`割れ→減衰停止)は、物理的に正しい創発挙動として受容された。実物の巻線崩壊は過回転の遠心応力が駆動し、損傷が進めばモーターは自らの過回転を維持できなくなり、損傷の駆動源そのものが消える——「損傷が自分の原因を食い潰して止まる」のは実在系の性質であり、モデルの欠陥ではなくモデルが正直である証拠と評価された。構成coilTurns=20/magnetDistanceMm=10がω=188.8 rad/s(閾値209.4 rad/sのわずか下)で定常化した実測は、系が「減衰が再開しない限界比率」へ自己組織化することを示す臨界収束と解釈された。**Phase 2の銅線+フェライト過熱レジーム(`docs/phase2-material-sweep-report.md` §5(i))に続く、本プロジェクト2件目の創発的実測知見**として記録する。P3-3-Q4(角速度超過分の積分による駆動)の再考は不要と確定した。
- **受け入れ条件の改訂**: 旧条件3(floor到達可能性)は、減衰が外部駆動されるという暗黙の仮定の上に書かれた条件であり、実測はその仮定が自己駆動系(motor-only無負荷)では成立しないことを示した。次の2条件へ改訂する。
  - **条件3′(プラトーの実測固定)**: 代表的虐待構成における自己制限プラトー(実測: 最良構成coilTurns=15/magnetDistanceMm=8でratio 0.7074、29%の結合喪失)が、観測可能な劣化(3%基準を大幅超過——条件2実測でratio=0.75時に定常RPM 30.4〜100%低下)を与えること。**充足済み**。
  - **条件1′(漸減性の直接形)**: floor到達時間はもはや漸減性の尺度にならないため、「崩壊トリガ後1秒時点でratio≥0.8」を段差禁止の実測可能形とする。**充足済み**(実測トリガ+1秒時点ratio=0.8914、回帰テストで固定)。
  - 条件2(観測可能性)・条件4(NORMAL_OPERATION非トリガ)は元のまま充足済み(変更なし)。
- **`minEffectiveTurnsRatio=0.5`の再定性**: floorの役割を「ゲームプレイ上の到達目標」から「数値安全域のclamp」へ改める——復元データの破損・将来のモデル変更・外部駆動に対して比率が正気の域を出ないことの保証である。値0.5の根拠(崩れた巻線の残存結合という物理的意味)は変わらない(役割が変わっただけで前裁定との矛盾はない)。floorが初めてゲームプレイに現れうる唯一の経路は外部機械駆動(急な下り坂での逆駆動による過回転の外部維持)であり、現行の実在5コースには存在しないため、vehicle/track文脈の追加sweepは不要と裁定された(負荷下ではωはさらに低く、崩壊後の持続過回転はむしろ起きにくいため)。**Phase 5コース設計への申し送り**: 「急降坂コースはD01減衰をfloorまで進めうる潜在挙動を持つ」ことを1行記録し、floorを死んだ定数ではなく文書化された潜在挙動として扱うこと(`docs/phase3-p3-3-plan.md` §16「P3-4 UI申し送り」に準じ、Phase 5着手時に参照する申し送り事項として本エントリに記録する)。
- **Gate 6解禁条件(3点、全充足)**: (1) 自己制限プラトーの数値回帰テスト1本を恒久追加(最良構成coilTurns=15/magnetDistanceMm=8で、プラトーratio≈0.7074のtoBeCloseTo固定・プラトー後`decayExposureRad`不増加の直接assert・条件1′〈トリガ+1秒でratio≥0.8〉を単一の実走行経路で固定、`src/materials/__tests__/materialMapping.test.ts`「D01自己制限プラトー」)。**実装済み**。(2) docs反映(`docs/phase3-p3-3-plan.md` 13.1.3節のD01行更新+本エントリ新設+`docs/phase3-p3-3-checkpoint5-implementation-report.md`確定申請表でD01の2値を「確定」へ昇格)。**完了**。(3) Suu_mot3照合。**2026-08-11通過(P59是正4点の独立再検証を経て確認済み)。Gate6(store fixture統合)は解禁された。**
- **人間再承認**: **不要**。値の変更自体が発生せず(1000/0.5維持)、型契約の変更もなく、値の確定はQ15-6の経路(確定申請→人間commit承認)に包含される。受け入れ条件の改訂はFable自身の裁定の改訂であり、台帳記録で足りる。
- **Fable再提出**: 上記の反映が本裁定の範囲内であれば不要。
- **手続きの評価(Fable原文)**: 値をいじって緑にせず、Suu_mot3の停止指示どおり実測全文と共にエスカレーションした判断、revert済みharnessを第三者が再構築できる水準まで文書化した再現情報、根因分析がQ5裁定(K_E=K_T相反性)を正しく引いて閉じている点——いずれも較正規律の模範と評価された。この一連の流れ(条件を先に固定→実測→条件側の誤りの発見→条件の改訂)は、「仕様は仮説であり、実装と実測だけが検証する」という本プロジェクトの原則が、Fableの裁定自身にも適用されることを示した最初の完全な事例として記録する。
- **出典**: `docs/phase3-p3-3-d01-fable-response.md`に全文引用。

---

## 改訂履歴

- 初版(2026-08-04、v9作成と同時): P3-1裁定7件(Q2・Q4・Q5・Q6・Q7・Q8・Q9、当時は名前空間なし表記)を収録。Q1・Q3は監査のうえ対象外と判断し、その理由を記録。
- 改訂1(2026-08-04、Suu_mot3のv9+台帳照合指摘反映): (1) 全裁定番号を名前空間付き表記(`P3-1-Q<n>`等)へ変更し、本文中の相互参照(「Q2(a)と同型」等)も同様に修正。(2) `docs/phase3-p3-0-plan.md` §11を監査し、人間再承認済みでv12を追加・変更したP3-0-Q1〜Q7(`invalidRunSequence`高水位穴意味論・DestructionConfig production配線P3-4延期・RunApplicationEnvelope.notebookRecord等3点・battery消費後loadout null化・consumedEquipmentIds・ValidateDestructionConfigResult.invalidFields・deriveDegradationDiffs段階実装+発行可能event不変条件・RotorAssemblyState sourceWireMaterialId遡及承認)+P3-0-P1(lease未取得時の全saveStore書込みaction共通ブロック)の計9件(Q4a・Q4bは別エントリとして数える)を新規収録。P3-0-Q7はv12本文に既に反映済み(v12草稿段階での無申告変更を遡及承認したもの)である旨を明記し、他エントリと性質が異なることを注記。(3) P3-1-Q4エントリのtypo「endReault」→「endReason」訂正。(4) P3-1-Q6エントリへ、シグネチャ変更自体は実装・検証済みだがサブステップ3全体はP3-1-Q9是正待ちである旨の区別を追記。(5) P3-1-Q5エントリ中の「正式Fable Q6不変条件」表記を「正式Fable P3-0-Q6不変条件」へ訂正(P3-0-Q6エントリとの対応を明確化)。
- 改訂2(2026-08-04、Suu_mot3のv10+台帳最終照合指摘反映): (1) 本改訂履歴末尾の件数誤記「計8件」を実際のエントリ数と一致する「計9件」へ訂正。(2) P3-0-Q1の実装ステップから不確かな「P3-0サブステップ1」というサブステップ番号表記を削除し、「P3-0で`src/store/runOutcomeApplication.ts`へ実装済み・commit済み」という事実ベースの記載へ変更。(3) P3-0-Q3の実装ステップを、`runOutcomeApplication.ts`(型定義)・`saveStore.ts`(`appendNotebookRecord`による実際の追記・trim処理)・`notebookStore.ts`(薄い委譲ビュー)・`ExperimentNotebook.tsx`(brabit_mot3所有のUI、旧確認ボタン撤去)にまたがる実装であることを明記し、単一ファイル・単一サブステップへの縮約を解消。(4) P3-0-Q4aの実装ステップを、契約型のnullable化(`runOutcomeApplication.ts`)と実際の自動null化適用ロジック(`saveStore.ts`の`commitApplyResult`)を分離して実ファイル名で記載。(5) P3-0-Q4bの実装ステップからサブステップ番号を削除。(6) P3-0-P1の実装ステップを全面訂正——共通ゲート機構が`runOutcomeApplication.ts`にあるという誤った記載を削除し、実際の適用主体である`saveStore.ts`の`readGatedFreshState`/`readFreshForApply`(11箇所の書き込みactionから共通に呼び出されていることを確認)を正しく記載。(7) P3-0-Q2の進捗を「P3-1 fixtureベースのみ、実装済み」から「fixture方針で進行中、production配線なし、P3-1全体は未完了(サブステップ4未着手のため)」へ訂正。(8) P3-1-Q4の進捗を「fixtureベース統合テストで代替検証、実装済み」から「P3-1サブステップ4で実装予定(未着手)」へ訂正。いずれも契約変更ではなく、台帳の実装証跡の事実訂正。
- 改訂3(2026-08-04、正式Fable最終レビュー提出前の最終同期、Suu_mot3指示): (1) 冒頭運用規則の「番号単体の表記は用いない」bulletへ「※末尾の運用規則追補1で適用範囲を訂正」の一行注記を追加。(2) **運用規則追補1**を新設し、台帳entry見出し・台帳内cross-step参照・現行コードJSDocは完全名前空間必須、詳細計画書の同一P3-1節内shorthand・改訂履歴の原文記録は許容、P3-0/P3-1をまたぐ参照・複数文書をまたぐ参照は完全名前空間必須、と適用範囲を明文化(命名運用の自己矛盾解消、契約変更ではない)。(3) **実装状態追補**を新設し、既存エントリを書き換えずP3-1-Q4(サブステップ4完了、3文脈・有効snapshot)・P3-1-Q6(人間再承認済み・実装済み)・P3-1-Q9(人間再承認済み・是正実装済み・非自明リプレイ等価テスト済み)の現在状態を追記。
- 改訂4(2026-08-08、正式Fable P3-2技術レビュー反映、Suu_mot3指示): (1) **P3-2-Q1〜Q12**エントリを新設し、`docs/phase3-p3-2-plan.md`(v6)の確定裁定12件+付帯条件6点+必須修正2点(M-1・M-2)の要旨を記録。人間再承認が必要な6項目(Q1・Q4-iii・Q4-v・Q5・Q6・Q9〈方針のみ〉)と不要な項目(Q3・Q7・Q8・Q10・Q12)を明示。(2) P3-1-Q1エントリ(「監査で対象外と判断した裁定」節)へ、正式Fable P3-2-Q12裁定による返済記録の追記(返済先はP3-3のまま変更なし、ただし層の整理の誤りを訂正、返済形を「D01分岐の追加+較正sweepへ縮小」と明確化)を追加(既存記述は書き換えず追記のみ)。
- 改訂5(2026-08-09、正式Fable補足裁定〈ゲート5較正裁定、人間プロジェクトリード直接提示、Suu_mot3中継確認済み〉反映、Suu_mot3指示): **P3-2-Q13-1**エントリを新設し、overheated保留規則(電池がlipoでD04 stageが`{swelling, smoking}`の間`overheated`終端を保留する)+Phase3-Q2適用範囲注記(Phase3-Q2が禁じるのは「物理終了後の継続step」であり、本裁定は物理終了の定義から重複表現を除く措置であって終了後の継続stepではないこと、`energyExhausted`/`stalled`/`derailed`/`manualAbort`は保留対象に含まれないこと)を記録した。本エントリの見出し「Q13-1」・注記対象「Phase3-Q2」・別文書内の「P3-2-Q2」(D07 RPM低下)を版・対象で明確に区別する命名の注意書きを付した(過去のP3-2ゲート5是正過程で発見された命名衝突の教訓を踏まえる)。人間再承認は**保留中**(本裁定の中核対象、確定裁定の適用範囲を狭める精密化のため再承認手続きを要する)。詳細な裁定理由・却下案・実装制約は`docs/phase3-p3-2-plan.md`14節に自己完結記載し、本台帳エントリでは重複記載していない。
- 改訂6(2026-08-09、正式Fable補足裁定〈P3-2ゲート5Q14、人間プロジェクトリード直接提示、Suu_mot3中継確認済み〉反映、Suu_mot3指示): **P3-2-Q13-2**エントリを新設し、「通常運用(NORMAL_OPERATION)で非到達」の正式定義(基準構成・第1条件・第2条件の症状型3分)+Q14精密化(予算条件を電池物理型別に分離——LiPoは`maxEnergyUsedRatio≤0.85`維持、nonLipoは自然完走`finished`のみ。一般原則「受け入れ閾値は、その閾値が防ぐ危険が構造的に存在する対象にのみ適用する」を今後の作文規則として記録)を収録した。契機はゲート5是正版でのQ13-2全電池×実在全5コース拡張実測で判明した`energy-run`×alkaline/NiMHの旧`0.85`一律条件超過(`docs/phase3-p3-2-gate5-normal-operation-review-request.md`Q14として提出)。人間再承認は不要(Q13-2本体・Q14精密化のいずれも数値・閾値・production値・素材写像を変更せず、docs反映+Suu_mot3照合で足りると裁定済み)。詳細な裁定理由は`docs/phase3-p3-2-plan.md`14.3節・14.8節に自己完結記載し、本台帳エントリでは重複記載していない。
- 改訂7(2026-08-09、P3-2ゲート9〈計画v17 §11.9〉、Suu_mot3指示): **実装状態追補**へ「Gate9追記」節を新設し、既存エントリ(P3-2-Q13-1・P3-2-Q13-2)を書き換えずに、Gate1〜8完了後の実装状態(実ファイル名・実テスト名)を追記のみで記録した。内容: (1) P3-2-Q13-1(overheated保留規則)がGate5で実装完了・Suu_mot3照合通過済みであること(`normalizeOverheatedStatusForD04Hold`、`src/engine/destructionOrchestration.ts`)。(2) P3-2-Q13-2/Q14がGate5で実装完了・15/15全適合であること。(3) Gate6(`RunSnapshot`拡張+`stepTestRunWithDestruction`)完了。(4) Gate7(`deriveFireExposureProfileFromLoadout`+D04/D07 3文脈fixture統合)完了、Suu_mot3ゲート7レビュー(要修正4点→fixture単一出典3点→rest構文化1点の計3ラウンド)を経て正式通過した経緯を含む。(5) Gate8(`src/materials/regressionDiff.ts`)完了、Suu_mot3が承認した精密化「baselineプールは同一recipeKeyかつ同一metricKind」を明記(Gate9着手承認メッセージでの明示指示どおり)。契約・production値・受け入れ条件の変更は一切ない(実装完了の事実記録のみ)。
- 改訂8(2026-08-09、正式Fable技術レビュー〈P3-3計画v6、人間プロジェクトリード直接提示、Suu_mot3中継確認済み〉反映、Suu_mot3指示): **P3-3-Q1〜Q14**エントリを新設し、`docs/phase3-p3-3-plan.md`(v6→v7)の確定裁定14件+付帯条件7点の要旨を記録した。総合判定は条件付き承認(実装開始を妨げる必須修正なし)。人間再承認が必要な項目(Q1・Q2・Q3・Q4・Q5・Q6・Q7・Q8・Q9・Q10・Q12・Q14の12件、詳細は`docs/phase3-p3-3-human-reapproval-bundle.md`の13項目〈型・契約変更13件〉を参照)と不要な項目(Q11・Q13)を明示した。特記事項: Q5(`effectiveTurnsRatio`)はbackEmf/tMagへの同一係数適用がエネルギー整合(K_E=K_T相反性)の要請であるという物理的根拠が付され、実装コメントへの明記が条件。Q7はspec §7.1.1の「スパーク中の接触抵抗一時悪化」の解釈をFableが確定した(スパーク中の悪化=既存完全瞬断が包含済み、観測可能な悪化=アーク後接触面荒れによる直後回復区間)。Q14は候補(b)〈base専用型分離〉がTypeScriptの過剰プロパティ検査(オブジェクトリテラルのみに適用)により実際には防御にならない「偽の安全」であるという指摘を受け、候補(c)〈戻り値string維持+throw〉へ確定した。
- 改訂9(2026-08-10、正式Fable補足裁定〈P3-3-Q15、人間プロジェクトリード直接提示、Suu_mot3中継確認済み〉反映、Suu_mot3指示): **P3-3-Q15**エントリを新設し、P3-3ゲート2完了報告に対するSuu_mot3照合で発見された未承認較正値混入(P48)・銀黒鉛摩耗契約の計画内矛盾(P49)・P3-2数値回帰fixture混入(P50)の3点への正式Fable補足裁定を記録した。P48は案(a)〈暫定候補値明示+Fable個別裁定〉を確定し、「較正数値をproductionへ置く前に初期候補値としてFable裁定を経ること」という恒久再発防止規則を新設(11.1節へ反映)。P48由来の副次論点(不活性ペナルティのthreshold表現)はQ15-4として判別union化(候補ii)を確定し、`DestructionConfig.d05`の破壊的変更として人間再承認バンドル#4追補の対象とした(バンドル前文の値未確定性は「Fable裁定さえ経ていない」ではなく「commit承認を経ていない」を意味すると精密化)。P49は案(i)〈6.3節表の精密化〉を確定。P50は機械的是正としてFable裁定不要と判定。人間再承認が必要な項目はQ15-4の1件のみ(詳細は`docs/phase3-p3-3-human-reapproval-bundle.md`の追補#4を参照)。
- 改訂10(2026-08-11、正式Fable補足裁定〈P3-3 D01較正、人間プロジェクトリード直接提示、Suu_mot3中継確認済み〉反映、Suu_mot3指示): **P3-3-D01較正確定**エントリを新設し、checkpoint5較正レビューが追加指示したD01(`decayExposureScaleRad`/`minEffectiveTurnsRatio`)の4条件sweepで判明した「現行値1000/0.5は旧条件3〈floor到達可能性〉を満たさない」という実測結果への正式Fable補足裁定を記録した。裁定は値ではなく受け入れ条件3自体を誤りと認定し、現行値1000/0.5を維持したまま確定した。実測で発見された自己制限フィードバック(劣化→トルク定数低下→回転低下→減衰停止)を、Phase 2の銅線+フェライト過熱レジームに続く本プロジェクト2件目の創発的実測知見として受容し、条件3→3′(プラトーの実測固定)・条件1→1′(トリガ+1秒でratio≥0.8)へ改訂した。`minEffectiveTurnsRatio=0.5`の役割を「ゲームプレイ上の到達目標」から「数値安全域のclamp」へ再定性し、Phase 5コース設計への申し送り(急降坂コースの潜在挙動)を記録した。人間再承認は不要(値の変更なし、型契約の変更なし)。Gate 6解禁条件3点は本改訂と同一差分で(1)(2)完了、(3)Suu_mot3照合は2026-08-11通過(P59是正4点の独立再検証込み)——**Gate6(store fixture統合)は正式に解禁された**。
- 改訂11(2026-08-11、Suu_mot3独立照合〈P59〉指摘4点の是正+Gate6解禁確定、Suu_mot3指示): 改訂10提出後のSuu_mot3独立照合(P59)で発見された精度不足4点をdocs-only(一部testの実装精度)で是正した。(1) D01自己制限プラトー回帰テスト(`materialMapping.test.ts`)がproduction`composeEffectiveMotorConfig`の式を`Math.max(0.5, 1-decayExposureRad/1000)`として再実装しており二重出典だった——`composeEffectiveMotorConfig(...).effectiveTurnsRatio`から取得する形へ修正(`decayExposureRad`の停止assertは現状維持、実測値は変更前と完全一致)。(2) 確定申請表の項目数「全21値」が算術誤りだった——実際には20項目(較正値19項目+較正対象外契約値`coilOverheatGaugeLimit`1項目)であり、`docs/phase3-p3-3-plan.md`・本台帳の該当表現を訂正した。(3) 改訂10・`docs/phase3-p3-3-checkpoint5-implementation-report.md`のGate6解禁条件記述が、Suu_mot3照合(3点目)未完了の時点で「3点すべて充足」「いずれも充足済み」と先取りしていた——(1)(2)完了・(3)Suu照合待ちへ訂正した。(4) D01正式補足裁定はJST 2026-08-11に人間から直接提示されていたが、新規D01裁定・回帰テスト・v16改訂履歴の一部に2026-08-10という誤った日付が残っていた——該当箇所を2026-08-11へ訂正し、前段checkpoint5較正レビュー自体・Q15補足裁定の2026-08-10表記(いずれも正しい)は維持した。P59是正4点の独立再検証(targeted D01テスト・69ファイル1406テスト・build・lint・material-sweep tsc・cmp・diff --check)がすべて成功し、**Suu_mot3がGate6(store fixture統合)を正式に解禁した**。contract値・実測値の変更はなし(docs-onlyの精度是正+テストの出典一本化のみ)。
- 改訂12(2026-08-11、Gate6〈store fixture統合〉実装完了+Suu_mot3独立レビュー5ラウンド〈P60〜P64〉是正+正式通過、Suu_mot3指示): Gate6解禁(改訂10・11)後、`src/store/__tests__/runOutcomeApplication.test.ts`へD01/D02/D05の3文脈(motor-only/test-run/track-run)fixture統合+原子性負例2件(#71〜#80)を実装した。初回提出後、Suu_mot3独立レビューで5ラウンドの是正を経て2026-08-11に最終照合通過した。**値(D01/D02/D05/D07較正値)は一度も変更していない——是正はすべてtest fixture構築側に閉じている。** (P60)較正値の実質差し替え違反(D01/D02/D05トリガのdestructionConfig個別上書き)+`vehicleSnapshotInput`ヘルパーの出典分裂(overrides.motorConfig/carConfigを渡してもinitialVehicleStateが既定値のまま)+適用前event直接assert欠落の3点を是正。(P61)D02 test-run/track-runの到達不能判断が`batteryInternalResistanceRatio`(既定1.0=アルカリ)を固定した理論分析に基づいており、実在するNiMH(ratio=0.3)という電池素材軸を見落としていたと指摘され、反映すると理論上界V²/(4·R_battery)が7.5W→25Wへ改善した。(P62)「NiMH ratioだけを既定fixtureへ足す」構成はfixture全体のproduction-valid性としては不十分と指摘され、`composeConfigFromMaterials`(正式素材写像パイプライン)を一度通した結果を出発点にする構成へ差し替え、D02 test-run/track-runが成立した(NiMH+magnet-neodymium+wire-silver+brush-precious-metal+gear-titanium+player-adjustable値〈magnetDistanceMm=2等〉)。(P63)「値」だけでなく「値の対応関係」もproduction-valid性の対象であるとの指摘——D01/D05の基底motorConfigがmagnetStrength=1.0(実在磁石写像の最大値neodymium=0.9を超過)であったこと、D01の磁石強度とd07.nonDemagnetizing・D05のbrush素材とd05摩耗設定がそれぞれ同一の素材事実を2つの別経路(手入力)から入力できる構造的な穴を残していたことが指摘され、`pvMotorCarGate6`(`MaterialSelection`明示入力の汎用production-valid fixture builder)へ全#71〜78を統一し、d07は`mapD07DestructionConfig(magnetId)`、d05は`mapD05BrushWearConfig(brushId)`+`assembleD05Config`から同一素材IDより自動導出する構造へ是正した。(P64)P63の全面書き直しで#76〜78から既存の`expect(result.termination).toBeNull()`(D05非終端の直接固定)が脱落していたことが指摘され復元した。2026-08-11、Suu_mot3独立レビューがP64是正を最終確認し、**Gate6(store fixture統合)は正式に通過した(Fable追加裁定は不要と判断)**。Gate7(最終docs/全体DoD確認)が解禁された。人間再承認は不要(値の変更なし、型契約の変更なし、test-onlyの差分)。詳細な是正史・最終構成(素材選択の対応表)は`docs/phase3-p3-3-plan.md` 13.2.1節を参照。
