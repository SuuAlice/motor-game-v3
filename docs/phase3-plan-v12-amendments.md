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
- **P3-1-Q3(D03短絡持続時間の較正値3.0秒)**: v12 §3のD03行は`config.battery.shortCircuitDurationLimitS`という**実行時configパラメータ**を参照する形で記述されており、具体的な数値をv12本文が指定していない(値は`materialMapping.ts`が素材写像として供給する設計、v12 §12参照)。本裁定はこのconfigパラメータの候補値(3.0秒)をsweep実測で確定した**較正決定**であり、v12本文の記述を上書きするものではない。

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

---

## 改訂履歴

- 初版(2026-08-04、v9作成と同時): P3-1裁定7件(Q2・Q4・Q5・Q6・Q7・Q8・Q9、当時は名前空間なし表記)を収録。Q1・Q3は監査のうえ対象外と判断し、その理由を記録。
- 改訂1(2026-08-04、Suu_mot3のv9+台帳照合指摘反映): (1) 全裁定番号を名前空間付き表記(`P3-1-Q<n>`等)へ変更し、本文中の相互参照(「Q2(a)と同型」等)も同様に修正。(2) `docs/phase3-p3-0-plan.md` §11を監査し、人間再承認済みでv12を追加・変更したP3-0-Q1〜Q7(`invalidRunSequence`高水位穴意味論・DestructionConfig production配線P3-4延期・RunApplicationEnvelope.notebookRecord等3点・battery消費後loadout null化・consumedEquipmentIds・ValidateDestructionConfigResult.invalidFields・deriveDegradationDiffs段階実装+発行可能event不変条件・RotorAssemblyState sourceWireMaterialId遡及承認)+P3-0-P1(lease未取得時の全saveStore書込みaction共通ブロック)の計9件(Q4a・Q4bは別エントリとして数える)を新規収録。P3-0-Q7はv12本文に既に反映済み(v12草稿段階での無申告変更を遡及承認したもの)である旨を明記し、他エントリと性質が異なることを注記。(3) P3-1-Q4エントリのtypo「endReault」→「endReason」訂正。(4) P3-1-Q6エントリへ、シグネチャ変更自体は実装・検証済みだがサブステップ3全体はP3-1-Q9是正待ちである旨の区別を追記。(5) P3-1-Q5エントリ中の「正式Fable Q6不変条件」表記を「正式Fable P3-0-Q6不変条件」へ訂正(P3-0-Q6エントリとの対応を明確化)。
- 改訂2(2026-08-04、Suu_mot3のv10+台帳最終照合指摘反映): (1) 本改訂履歴末尾の件数誤記「計8件」を実際のエントリ数と一致する「計9件」へ訂正。(2) P3-0-Q1の実装ステップから不確かな「P3-0サブステップ1」というサブステップ番号表記を削除し、「P3-0で`src/store/runOutcomeApplication.ts`へ実装済み・commit済み」という事実ベースの記載へ変更。(3) P3-0-Q3の実装ステップを、`runOutcomeApplication.ts`(型定義)・`saveStore.ts`(`appendNotebookRecord`による実際の追記・trim処理)・`notebookStore.ts`(薄い委譲ビュー)・`ExperimentNotebook.tsx`(brabit_mot3所有のUI、旧確認ボタン撤去)にまたがる実装であることを明記し、単一ファイル・単一サブステップへの縮約を解消。(4) P3-0-Q4aの実装ステップを、契約型のnullable化(`runOutcomeApplication.ts`)と実際の自動null化適用ロジック(`saveStore.ts`の`commitApplyResult`)を分離して実ファイル名で記載。(5) P3-0-Q4bの実装ステップからサブステップ番号を削除。(6) P3-0-P1の実装ステップを全面訂正——共通ゲート機構が`runOutcomeApplication.ts`にあるという誤った記載を削除し、実際の適用主体である`saveStore.ts`の`readGatedFreshState`/`readFreshForApply`(11箇所の書き込みactionから共通に呼び出されていることを確認)を正しく記載。(7) P3-0-Q2の進捗を「P3-1 fixtureベースのみ、実装済み」から「fixture方針で進行中、production配線なし、P3-1全体は未完了(サブステップ4未着手のため)」へ訂正。(8) P3-1-Q4の進捗を「fixtureベース統合テストで代替検証、実装済み」から「P3-1サブステップ4で実装予定(未着手)」へ訂正。いずれも契約変更ではなく、台帳の実装証跡の事実訂正。
- 改訂3(2026-08-04、正式Fable最終レビュー提出前の最終同期、Suu_mot3指示): (1) 冒頭運用規則の「番号単体の表記は用いない」bulletへ「※末尾の運用規則追補1で適用範囲を訂正」の一行注記を追加。(2) **運用規則追補1**を新設し、台帳entry見出し・台帳内cross-step参照・現行コードJSDocは完全名前空間必須、詳細計画書の同一P3-1節内shorthand・改訂履歴の原文記録は許容、P3-0/P3-1をまたぐ参照・複数文書をまたぐ参照は完全名前空間必須、と適用範囲を明文化(命名運用の自己矛盾解消、契約変更ではない)。(3) **実装状態追補**を新設し、既存エントリを書き換えずP3-1-Q4(サブステップ4完了、3文脈・有効snapshot)・P3-1-Q6(人間再承認済み・実装済み)・P3-1-Q9(人間再承認済み・是正実装済み・非自明リプレイ等価テスト済み)の現在状態を追記。
