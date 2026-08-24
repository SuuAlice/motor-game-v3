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

## P3-4-M-1・P3-4-R1〜R27: P3-4統合実装前計画 正式arbiter技術レビュー判定(engine v10+UI v9クロスレイヤ統合)

- **日付**: 2026-08-14(正式arbiter技術レビュー、送信者名義「arbiter_mot3〈旧称Fable役〉」、Suu_mot3中継確認済み)。arbiter_mot3の設置自体は、人間プロジェクトリードがSuu_mot3との直接会話〈agmsg外〉で2026-08-14に設置を明示し、Suu_mot3が正規性を確認したうえでalice_mot3・brabit_mot3へ中継したものである(A4是正)。
- **契機**: `docs/phase3-p3-4-plan.md`(engine計画v10)+`docs/phase3-p3-4-ui-plan.md`(UI計画v9)のクロスレイヤ統合レビュー依頼(`docs/phase3-p3-4-fable-review-request.md`)。照合基準はspec.md r3・art-spec.md r3・phase3-plan-v12.md+本台帳・P3-2報告§12・P3-3報告§13。形態A(使い捨てクローン・read-only)。対象コミット`c163033`(タグ`p3-3-complete`付与済みコミットの直後のdocs同期コミット=HEAD)。
- **総合判定**: **条件付き承認。**実装開始を妨げる必須修正は**M-1(1件、D06クロスラン会計契約の欠落)**のみ。M-1のdocs反映+Suu_mot3照合、および本エントリ「人間再承認一覧A〜O」の承認をもってG1aから実装解禁。
- **M-1(必須修正)**: 部分損傷ギヤ(例: 9歯欠け)を次走行で再装備すると、走行内`D06Progress.toothLossCount`が0から再スタートするため、(a)エンジンが更に10本欠けるまで終端しない会計破綻、(b)`applyWearToCarConfig`の歯欠け由来効率因子とD06 runtime効果の二重計上、(c)検死ログの「何本目か」の虚偽表示、という3欠陥が式展開で証明された。確定裁定(i)〜(viii): (i)`RunSnapshot.initialDestructionState.modes.D06.toothLossCount`を装備ギヤ個体の永続`WearState.gear.toothLossCount`でseedingする(単一出典)。(ii)`applyWearToMotorConfig`/`applyWearToCarConfig`から歯欠け由来効率因子を削除(seedingと対で実施必須)。(iii)`isTotalLoss`・曝露積分・再武装はseededカウントの上でそのまま動く。(iv)`restoreRunSnapshot`へtoothLossCountの範囲検証(0以上`gearTotalToothCount`未満)を追加。(v)gear全損個体(`toothLossCount>=10`)の装備拒否を追加(collapsed rotor・burnedOut rotorと同輩)。(vi)§9.3の`gearEfficiency`契約を契約0(素材写像[0.60,0.95])/契約1′(Wear反映後base、seizure込み下限≈0.42、歯欠け因子は含まない)/契約2(runtime effective、seeded歯欠け込み最悪≈0.042)の3レンジへ再定義。(vii)負例(α)9歯seed個体の1本目歯欠けで`isTotalLoss:true`、(β)`applyGearDiff`適用後の永続値が厳密10、(γ)`applyWearToCarConfig`是正後は`toothLossCount=9`でも`gearEfficiency`不変、をDoDへ追加。(viii)両計画(engine §9/§12/§13.1/§14/§15/§16、UI §6.2)+本エントリへの反映完了。
- **人間再承認**: **要(単一一覧A〜O、下表参照)**。詳細は`docs/phase3-p3-4-plan.md`(現行v12)§20.5・`docs/phase3-p3-4-ui-plan.md`側の対応節を参照。
- **実装ステップ**: ゲート0〜9(**M-1反映〈完了、engine v11、A1〜A5是正はv12〉+人間再承認A〜O待ち、未着手**)。
- **出典**: `docs/phase3-p3-4-plan.md`(v11、A1〜A5是正はv12)§20〜§20.7に全文引用・反映。判定文原本はSuu_mot3中継の全文agmsgメッセージ(2026-08-14T08:28:38Z)。

各裁定の要旨(詳細・実装コードはengine計画(現行v12)§20またはUI計画該当節を参照):

| 番号 | 要旨 | 人間再承認 |
|---|---|---|
| P3-4-R1 | recipeKey搬送は`RunSnapshot`への独立フィールド追加(候補a)。`contractVersion`2→3、v2 snapshot非救済 | 要(A) |
| P3-4-R2 | recipeKeyへ`MaterialSelection`5フィールド(wireId/magnetId/gearId/batteryId/brushId)を先頭固定順で含める。bodyIdは含めない | 要(A) |
| P3-4-R3 | D09劣化量供給はconfig固定値→event複写→derive一方向(D07demagnetizationDeltaFractionと同型)を承認 | 要(E) |
| P3-4-R4 | D09被害記録は候補A(常時両diff発行+生boolean2値のcauseLog)確定、候補B(originKind履歴記録)却下 | 要(E) |
| P3-4-R5 | D06 runtime etaの2契約分離は方向承認、M-1(vi)の3契約(契約0/1′/2)へ置換 | 不要 |
| P3-4-R6 | D06トリガは候補b(累積曝露)確定採用、候補d(歯噛合位相)却下 | 要(D) |
| P3-4-R7 | トルクリップルは承認、専用噛合位相アキュムレータ(`meshPhaseAccumulator`)新設で確定 | 要(D、R6と同一型変更) |
| P3-4-R8 | D09入力物理式(`gearFrictionLossW`)は既存反射式から代数的に`P_loss=P_in-P_out`と証明され二重計上でないことを確認、正帰還は意図的挙動として受容(C-9でsweep定量化) | 不要(型変更なし) |
| P3-4-R9 | G統合後は明示cleanupゲートG9でフラグ・分岐削除(候補a)確定 | 不要 |
| P3-4-R10 | courseRuns/vehicleTestRunsのexport/import新設はP3-4スコープ外と確定 | 不要(新設見送りのため) |
| P3-4-R11 | NotebookExportはversion 2方式+`StoredExperimentSession`等union(legacy/current混在)を確定 | 要(C) |
| P3-4-R12 | recipeKey外形検証(`length>0`+envelope形式、payload非再parse)を確定 | 不要 |
| P3-4-R13 | gear反射慣性式は`J_reflected=J_actual/gearRatio²`(etaを含めない)を確定採用 | 要(G) |
| P3-4-R14 | gear密度pending対応順序は(c)一次資料検証→(a)designAssumption代用→(b、titanium禁止)を確定 | 要(G) |
| P3-4-R15 | bearing軸=ギヤ軸(車軸側)、`axleAngularVelocityRadS=ω_motor/gearRatio`を確定 | G(R13)に付随 |
| P3-4-R16 | D09摩擦増によるstalled優先競合を許容する設計を確定 | 不要 |
| P3-4-R17 | burnedOut rotorもcollapsed rotorと同様に装備拒否対象と確定 | 要(H) |
| P3-4-R18〜R26 | UI/brabit所有(D07/D09視覚表現・D01/D07変調なし・D09焼付き音・SE_MASTER_GAIN・motor-only終了ライフサイクル・ガウスメーター一式・staleLease非契約・検死レポート拡張・D06 SE queue)、詳細は`docs/phase3-p3-4-ui-plan.md`側 | J〜O(該当項目のみ) |
| P3-4-R27 | v12 §1.2のgear-seizure→効率ペナルティ写像(`gearEfficiency`)はP3-4次run反映の主旨に反しないと精密化確定。`computeCompositeGearDamageFraction`(経済専用)の物理経路非参照を構造テストで固定 | 不要(v12契約の精密化、型変更なし) |

**人間再承認が必要な項目の単一一覧(A〜O、判定文§8、重複なし、engine専属A〜I/UI所有J〜O)**:

A. `RunSnapshot.recipeKey`必須追加+`contractVersion`2→3+v2非救済+素材ID5フィールド包含(R1・R2) / B. notebook 3腕への`finalDestructionState`+`recipeKey`必須追加+Legacy union+共通validator / C. `NotebookExportV2`(version1→1/2の2形式、sessions=union)(R11) / D. D06契約変更一式(`cumulativeOverloadExposure`+`meshPhaseAccumulator`+`toothFatigueExposureNmS`+M-1クロスラン会計契約)(R6・R7+M-1) / E. D09契約変更一式(`DestructionConfig.d09`型完成+`D09CauseLog`生boolean2値+derive完成)(R3・R4) / F. `DestructionFrameInput`拡張+`buildVehicleFrameInput`のcarConfig引数追加(破壊的シグネチャ変更) / G. `CarConfig.gearReflectedInertiaKgM2?`追加+`gearInertia.ts`新設(R13・R14) / H. `ValidateEquipmentLoadoutResult`への`destroyedRole`分岐+拒否3種(collapsed rotor/burnedOut rotor〈R17〉/全損gear〈M-1(v)〉) / I. WearState→次run反映の新経路(`wearReflection.ts`+較正定数3種)(R27) / J. `PersistedSaveState`への`InstrumentOwnership`追加+`SCHEMA_VERSION`1→2(R23、UI) / K. `CodexRecordEntry`拡張(R25、UI) / L. ガウスメーター経済接続(R23、UI) / M. `SE_MASTER_GAIN`新設+再配分(R21、UI) / N. motor-only終了ライフサイクル+G9旧経路削除(R22、UI) / O. 音・アート適用例外2件(D07固有SE免除+D01固有SE新規追加)(UI)。

**付帯条件C-1〜C13(判定文§11)・推奨REC-1〜4(判定文§12)**: `docs/phase3-p3-4-plan.md`(現行v12)§20.6・§20.7に全文記載、本台帳では重複記載しない。

**再提出要否**: arbiter再提出は不要——M-1・C-1のdocs反映が判定文の指定どおりである限り。実装解禁の条件: (1)M-1反映(両計画+本台帳)+Suu_mot3照合、(2)人間再承認一覧A〜Oの承認、(3)C-1はG7着手前まで、C-13の台帳追記はM-1と同時。以上の完了後、G1aから着手可。

---

## P3-4-S1〜S10・P3-4-N1〜N3: production config出典分裂 補足裁定(HB-DEC-011ケースA)

- **日付**: 2026-08-16(arbiter_mot3補足裁定、HB-DEC-011ケースA・実行形態A、Suu_mot3中継確認済み)。**判定文§8(外部情報自己申告)の最終確定記述**: **判定作成モデル: claude-fable-5(人間PM確認済み)。起動時system prompt表示: claude-sonnet-5(履歴として記録)。**(判定文§8と不可分一体として本エントリへ同時収録)。影響評価: 判定内容(Q1〜Q8・S-1〜S-10・N-1〜N-3)への影響なし(受領照合・テスト・build/lint/tsc・rg実測はすべて機械的・終了コード付きで記録済み、モデル非依存に再現可能)、役割の有効性への影響なし(arbiter.mdの実体要件は能力で定義され特定モデルに固定されない)、役名`arbiter_mot3`は旧役名Fableとモデル名Fable 5の同名衝突とは無関係に変更なし(役割命名原則の適用対象は役名のみ)。**再レビューは不要**とされた。(履歴: 当初の暫定訂正は「参加直後にclaude-fable-5へ切り替えられており、工程1返信〜受領照合〜判定文起草の一部または全部がFable 5で実行された可能性が高い」という不確定形だったが、後続の人間PM確認により上記確定記述へ上書きされた。)
- **契機**: G1b着手時、brabit_mot3の実装照会をSuu_mot3が実コード・計画へ照合した結果、正式arbiter条件付き承認(2026-08-14)+人間再承認済みのengine計画・UI計画いずれにも、gameStoreが保持するproduction motorConfig/carConfig(V2由来のraw値)と、P3素材システムが保持する装備個体(EquipmentLoadout/PlayerInventory)の間を橋渡しする契約が一度も定義されていなかったことが判明した(2026-08-15)。alice_mot3が実コード実査を経て`docs/phase3-p3-4-production-config-source-review-request.md`を作成し、Suu_mot3の追補指示(P1: 仕様書変更点欄、P2: §9.5必須回答一覧Q1〜Q8、P3: HEAD/PRESENTED状態分離+G1a現行9件のハッシュ固定)を経て、形態A(使い捨てクローン)ケースAとしてarbiter_mot3へ提出された。
- **総合判定**: **条件付き承認。** クロスレイヤ契約欠落は実在(独立実測で確認)。G1a′新設(Q6)・resolver新設(Q1〜Q2)・二層命名(Q3)・baseline単一出典(Q4)・beginRun合流(Q5)を、Q1〜Q8裁定+条件S-1〜S-10のとおり承認。G1aの再open範囲はなし(Q7)。人間再承認項目P新設を要する(Q8)。
- **依頼書の実査に対する矛盾指摘(4点、実測どおり記録。いずれも欠落の存在自体は覆さない——むしろ補強する)**:
  - **指摘1**: 依頼書§1.1「gameStore.config/carConfigの生成元は2箇所のみ」は実測不一致。実際は少なくとも8系統+1同期経路——(1)起動時bootstrap(`_initialProgress`、gameStore.ts:253前後)、(2)スライダー系action(`clampToCoilWindow`、295-297)、(3)`setGarageSelection`(299-306)、(4)`setLabCarConfig`(308-313)、(5)`loadRecipe`(316-331、configのみ)、(6)`loadCarRecipe`(332-350、依頼書が「loadRecipe(336-344行)」と呼んだ実体はこちら)、(7)`startDiagnosis`(664-685)、(8)`setDiagnosisCarConfig`(687-695)、加えて`useSaveStore.subscribe`同期(746-757)。全系統がV2 raw値であり素材非参照という構造的結論は不変だが、「2箇所」を前提にC-4監査や単一出典契約を設計すると(4)(7)(8)経由の別事実混入を見逃す。
  - **指摘2**: 依頼書§1.5「productionでこの2値をどこから取るかの規則は存在しない」は部分的に不正確。`chassisBaselineG`には既存の確定出典指示が存在する——materialMapping.ts:281 docstring「assumedGeometry.tsの`resolveChassisBaselineG()`の結果を渡す」+`resolveChassisBaselineG`(assumedGeometry.ts:192-200、'one-cell'→135g/'two-cell'→150g=標準シャーシ110g+電池25g/40g)。`baseGearEfficiency`にも同docstring(materialMapping.ts:283-284)が「既存gearRatio階層のみに基づく値。例: V2互換0.9/0.8/0.74」と半確定の意味論を与えており、`GEAR_PRESETS`(partPresets.ts:12-16、fast 0.9/balanced 0.8/torque 0.74)と値レベルで一致する。未定義だったのは「これらを装備・garage状態から誰がいつ導出するか」という配線規則のみ。
  - **指摘3**: 依頼書§5候補(a)原文「`resolveGarageBuild`から`chassis.baseMassG`・`gear.gearEfficiency`を取る」は既存契約と数値矛盾。`chassis.baseMassG`は電池質量抜きの60/110/190gであり、凍結契約の135/150g(電池込み・常に標準シャーシ基準)と矛盾する——two-cell標準構成で凍結契約はmassG=150+Δ(wire,magnet)だが、候補(a)原文採用だとmassG=110+Δとなり**電池40gが恒久欠落**する。`scripts/materialSweep.ts:118`の`REPRESENTATIVE_BASELINE {chassisBaselineG:150}`+起動時V2回帰anchor自己検証(同165行以降)はこの150を厳密値として固定しており、候補(a)原文採用は既存sweep自己検証を破る。
  - **指摘4**: 依頼書冒頭・人間再承認バンドルの特徴づけ「EquipmentDestructionContext解決純関数」は、G1a実測では独立exported関数として不存在(rg実測0件)——`EquipmentDestructionContext`はinterface定義(materialMapping.ts:802-805)+「呼び出し側(brabit)が'body-none'へ正規化」docstring契約のみ。engine計画§4.4自体は独立関数を要求していないためG1a通過判定は覆らないが、特徴づけの不正確さと、`bodyAssemblyId`非null時の`inventory.bodyParts`→`materialId`引き当て経路が明文化されていなかった穴の両方が判明した。
- **Q1〜Q8裁定(要旨、全文の正準参照は`docs/phase3-p3-4-plan.md` §20.8。`docs/phase3-p3-4-production-config-source-review-request.md` §11は受領履歴、`docs/phase3-p3-4-human-reapproval-bundle.md` P項目は承認範囲の説明であり、いずれも全文の正準参照ではない)**:
  - **Q1**: resolver(`deriveMaterialSelectionFromEquipment`基準候補、命名はalice裁量)の所有は**alice、`src/store/runOutcomeApplication.ts`**(materials→storeのimport逆転を避けるため`src/materials/`には置かない、P3-2ゲート7の`deriveFireExposureProfileFromLoadout`が先例)。検証順は`validateEquipmentLoadout`→resolverの単一順、resolverは検証を再実装しない。戻り値`{ok:true; selection; equipmentContext} | {ok:false; reason; missingRole}`。bodyId解決を同一resolverへ統合。
  - **Q2**: `batteryItemId===null`は既存validateEquipmentLoadoutの`missingRole:'battery'`によりresolver到達前に構造的に排除(拒否確定)。`sourceWireMaterialId===null`はresolver内で防御的拒否(`missingRole:'rotor'`、現行到達経路0件)。既定値代用はいずれも却下(P3-0-Q4a「壊れたものは自動的に補われない」)。bodyIdがMaterialSelection対象外であることを確認、resolver戻り値equipmentContextとして同一関数が解決する形へ精密化。
  - **Q3**: 二層命名を採用——`rawPlayerConfig`(gameStore.config/carConfig系統、指摘1の全8系統+subscribeを含む)/`materialComposedBase`(`composeConfigFromMaterials`出力、Wear反映前)。production素材走行のbeginRunでは、rawPlayerCarConfigはbeginRun時の`resolveGarageBuild(garageSelection)`単一呼び出し結果とし、gameStore.carConfig現在値を直接読まない(帰結: V2ラボ/診断の直接編集値は素材走行へ影響しない、**ゲームプレイ可視のため人間再承認Pに含める**)。recipeKey・DestructionConfig・RunSnapshotはすべて同一selection実体・同一materialComposedBase実体から派生。8段順は段1を「1a単一読取り→1b validateEquipmentLoadout→1c resolver→1d baseline構築→1e composeConfigFromMaterials」へ精密化。
  - **Q4**: 候補(a)を指摘3のとおり修正採用——`chassisBaselineG := resolveChassisBaselineG(cellSelection)`(`cellSelection`はrawPlayerMotorConfig.batteryVoltage(1.5|3.0)からの全域写像、`resolveGarageBuild`のchassis側は使わない)。`baseGearEfficiency := resolveGarageBuild(garageSelection)`結果のgear.gearEfficiency(gearRatioと同一呼び出し結果)。候補(b)(carConfigからの逆算)は却下(resolveGarageSelectionFromRecipeの非可逆近似汚染リスク)。production構築はalice所有の単一純関数へ集約。recipe load時、recipeCode.tsは素材選択をencodeしない既存設計のため素材走行の出典になり得ず、以後の素材走行は近似garageSelectionを単一出典として整合的に走る(静かな不一致は生じない、gear段の作者意図との差異はPhase 5申し送り)。
  - **Q5**: 新規`BeginRunConfigError`型は設けない。resolver失敗は既存`missingRole`腕へ、baseline/compose/有限性検証失敗は既存`{ok:false, reason}`腕へ合流。失敗時不変条件(nextRunSequence不変・snapshot不生成・ローカル状態不変)を各経路で個別にテスト固定する。判別union化の実需要が生じた場合はP3-3-Q15-4先例に照らした追加裁定を要求可(無断導入不可)。
  - **Q6**: **G1a′新設を承認**(既存G1aへの統合は否)。内容: (1)Q1 resolver+テスト、(2)Q4 baseline production構築関数+テスト、(3)二層命名・8段順精密化・§4.4コメント精密化のdocs反映、(4)本裁定の台帳収録。位置はG1aとG1bの間。**G1b着手はG1a′のSuu照合通過+人間再承認P承認後**。G1bの配線対象6段(現存1/2/3/5/6/8)は不変。G6(Wear反映4/seeding 7)も不変。C-4最終DoDをG1a′・G1b・G6の3段階で充足。
  - **Q7**: **G1aの再open範囲なし。** assembleDestructionConfig・captureRunSnapshot・computeRecipeKey・destructionCalibrationの各公開シグネチャと挙動は一切変更しない。許すのはmaterialMapping.ts内docstringのコメント精密化のみ。実装中にG1aのexportシグネチャ変更が必要と判明した場合は追加裁定を要求すること。
  - **Q8**: **人間再承認項目Pの新設が必要**(equipment→config導出は新規クロスレイヤ契約、かつQ3(i)/Q4の帰結がゲームプレイ可視のため)。Pは単一項目(G1a′一式)。**arbiter再提出は不要**(本補足裁定〈ケースA〉が該当審査に相当)。
- **受領照合・独立検証(実測)**: clone HEAD `c1630330f2990cb2ca9e261910e9faade1e6dda2`一致。review-input 11件中5件はHEAD追跡内容とバイト一致、amendments.mdはHEAD内容と差分あり(既知)、P3-4計画/UI計画/人間バンドル/旧レビュー依頼/本補足依頼の5件はHEAD不存在(未追跡DRAFT申告と一致)。G1a現行9件をoverlayした使い捨てvalidation copyで独立再実測: `npm run test`70ファイル/1447件全通過、`npm run build`成功(791.23kB/gzip 221.31kB)、`npm run lint`成功、`tsc -p tsconfig.material-sweep.json --noEmit`成功。検証copyは判定完了まで保持。
- **条件S-1〜S-10・負例仕様N-1〜N-3**: **全文の正準参照は`docs/phase3-p3-4-plan.md` §20.8**(本改訂で反映済み)。`docs/phase3-p3-4-production-config-source-review-request.md` §11は受領履歴(受領照合・モデル訂正・効力の記録)、`docs/phase3-p3-4-human-reapproval-bundle.md` P項目は人間承認の対象範囲を示す説明であり、いずれも条件・負例本文の正準参照ではない(本台帳では重複記載しない)。S-1〜S-5は実装(production/test)、S-6・S-7はdocs反映(engine計画v13で反映済み・UI計画は次工程)、S-8は本台帳収録(本エントリで充足)、S-9は負例実装、S-10は人間承認Pまでdocs以外へ着手しないこと。
- **人間再承認**: **承認済み(単一項目P、`docs/phase3-p3-4-human-reapproval-bundle.md`)**。判定の効力は人間プロジェクトリードの承認後に発生する(判定文§9)。**人間プロジェクトリードが2026-08-16、定型文「補足裁定判定文全体（Q1〜Q8・S-1〜S-10・N-1〜N-3）と項目Pを承認します。」で判定文全体+項目Pを明示承認した(Suu_mot3中継確認済み)——判定文§9の効力発生条件は充足された。** Suu_mot3独立照合の要修正9点(改訂17参照)のdocs-only反映もSuu_mot3が再照合し通過、engine計画v13+本台帳改訂17+再承認バンドルPのdocsゲートを正式通過とした。**G1a′実装(resolver・baseline構築関数)が解禁され、alice_mot3が実装、Suu_mot3照合(初回P1〜P3是正+精度追補の3ラウンド)を経た。その過程で発見されたG1a′完了条件の循環はP3-4-Q9エントリ(直後)で解消済み。**
- **再提出要否**: arbiter再提出は不要(Q8裁定)。ただしS-1〜S-10の条件からの逸脱、またはQ5/Q7の但書事象が生じた場合は追加裁定を要する。
- **出典**: `docs/phase3-p3-4-production-config-source-review-request.md`(§11に受領記録として全文引用済み)、`docs/phase3-p3-4-human-reapproval-bundle.md`(P項目)。判定文原本はSuu_mot3中継の全文agmsgメッセージ(2026-08-16T10:42:32Z、訂正追記は同10:54:24Z)。

---

## P3-4-Q9: S-5/N-2後半のゲート循環解消(arbiter追加裁定)

- **日付**: 2026-08-16(arbiter_mot3追加裁定、HB-DEC-011ケースAへの追加裁定、Suu_mot3中継確認済み)。
- **契機**: G1a′初回実装報告に対するSuu_mot3レビューで、engine計画v13 §20.8「条件S-1〜S-10全充足後にG1a′完了」と§3.1「beginRunActionへの配線はG1b、G1bはG1a′完了後に着手」が循環していることが発見された。alice_mot3・Suu_mot3は独断で先送りせず、arbiterへ追加裁定(Q9)を依頼して停止した。

**判定文原文(Suu_mot3中継、2026-08-16T15:06:57Z、無改変引用。P4是正: 見出し改変・圧縮・実装済み/承認済み注記混入を除去し、受領した原文をそのまま保存する)**:

> 【arbiter_mot3 追加裁定判定文Q9: S-5/N-2後半のゲート循環解消】2026-08-16、補足裁定(人間承認済み・発効済み)への追加裁定。判定作成モデル: claude-fable-5(前回一体記録の申告と同一)。判定効力は人間責任者承認後。
>
> ■0. 起草側欠陥の自己申告(インシデント記録用)
> 本循環は、arbiter自身が条件S-1〜S-10の合成を値レベルで試した際に「単一構成での導出経路の整合」のみを検証し、**ゲート境界(所有境界×実装時期)を跨いだ充足可能性の照合を省略した**ことによる起草側欠陥である(arbiter.md §4「条件どうしの合成を値のレベルで試す」・§7「裁定条件の発行前に充足可能性を承認済み計画・木の状態と照合」の不履行)。alice/Suuの停止判断は正当であり、独断先送りしなかった運用は規律どおり。本欠陥は叱責対象ではなく資産として、台帳のQ9エントリへ本節を含めて記録すること。
>
> ■1. 裁定(Q9)
> **(a)を採用する。** G1a′完了条件を純関数側へ限定し、S-5+N-2後半をG1bの必須DoDへ移管する。確定内容:
>
> 1. **G1a′完了条件(改訂)**: S-1〜S-4、S-6〜S-10、および負例N-1・N-2前半・N-3の充足をもってG1a′実装完了とみなす。S-5とN-2後半はG1a′の完了条件から除外する。
> 2. **G1a′で担保する代替保証**: resolver・baseline構築関数・composeが**純関数であること**(引数以外を読まず、store/localStorage/グローバル状態へ一切書き込まないこと)をG1a′テストで固定する——S-5不変条件のうち純関数側で成立しうる唯一の部分は「関数自身が副作用を持たない」ことであり、これをG1a′で先取りする。
> 3. **G1bへの移管(必須DoD化)**: S-5の失敗時不変条件(nextRunSequence不変・pendingRunEquipmentSnapshot不変・RunSnapshot/RunAccumulator不生成・gameStoreローカルruntime state不変)を、resolver失敗・baseline/compose失敗・有限性検証失敗の各経路について、N-2後半の統合テストとともに**G1bの必須DoD**とする。G1b配線と同一差分内で実装し、G1bのSuu照合対象へ含める。「config構築失敗がrunSequence消費より前に確定する構築順序」の実装指針もS-5からG1bへ移動する。テスト所有はalice(純関数・fixture提供)+brabit(beginRunAction配線・統合テスト本体)の共同とし、C-4監査のG1b段階分と同時充足する。
> 4. **契約の不変性**: 本裁定はS-5/N-2後半の**検証時期と所有ゲートのみ**を変更し、不変条件の内容・失敗時の要求挙動・エラー型合流(Q5)・値・型は一切変更しない。
> 5. **(b)は却下**: G1a′をalice+brabit共同ゲートへ拡張する案は、人間承認済みのG1b定義(brabit所有・配線ゲート)を再分割し、所有境界で切ったゲート設計(確定-1〜-6・§3.1)自体を崩す。検証時期の整合という目的に対し過大な構造変更であり、採らない。
>
> ■2. 付随回答
> **(i)人間再承認の要否**: 要——ただし新規バンドル項目の追加ではなく、**本Q9裁定文自体の人間承認**(全裁定共通の効力条件)で足りる。台帳・バンドルには「項目P追補(P-1): S-5/N-2後半の検証時期をG1bへ移管(契約不変、Q9裁定)」として項目Pと一体記録する。
> **(ii)docs修正文言(骨子、alice転記時はこの意味を保存すること)**:
> - engine計画v13 §20.8の「条件S-1〜S-10(すべて充足後にG1a′実装完了とみなす)」→「条件S-1〜S-4・S-6〜S-10+負例N-1・N-2前半・N-3の充足後にG1a′実装完了とみなす。S-5および負例N-2後半はQ9裁定によりG1b必須DoDへ移管(契約内容は不変、検証時期のみ移動)」。
> - S-5本文末尾へ追記: 「検証時期はG1b(beginRunAction配線と同一差分)。G1a′では関数自身の副作用非保有(純関数性)のみを先取りして固定する(Q9裁定)」。
> - G1bのゲート定義(engine計画§3.1のG1b行またはDoD表)へ追記: 「S-5失敗時不変条件(config系3失敗経路×4不変項目)+N-2後半統合テスト+config構築失敗がrunSequence消費前に確定する構築順序(Q9裁定、alice+brabit共同、C-4のG1b段階分と同時充足)」。
> - UI計画§6.2/§23相当のG1b節へ同旨を追記。
> - 台帳へP3-4-Q9として収録(本判定文全文+§0の起草側欠陥記録を含む)。
> **(iii)arbiter再提出要否**: 不要——本Q9裁定(ケースA追加裁定)で完結する。以後もS-1〜S-10・Q9からの逸脱、または新たな充足不能が発見された場合は、その時点で追加裁定を求めること(独断先送りの禁止は本件で実証された運用どおり)。
>
> ■3. Q9対象外3欠陥の扱いについて(確認)
> Suu検出の3欠陥(baseline関数のresolveGarageBuild再呼出しによる単一呼び出し結果違反/S-4監査の許可ファイル内違反・.tsx見逃し/N-2前半のreason・パス未固定)を「既裁定内の実装欠陥としてalice是正」とする整理に同意する。特に1点目はQ3/Q4が排除対象とした「同一事実の複数読取り」そのものであり、是正後のG1a′ Suu照合で単一呼び出し結果の受け渡し(引数経由)を明示確認すること。3欠陥の是正はQ9裁定の効力発生を待たず進めてよい(既裁定の枠内のため)。
>
> ■4. 外部情報自己申告(HB-DEC-013)
> 本判定は、Suu_mot3の裁定依頼文(2026-08-16T14:22)+arbiter自身の判定文(本セッション内で起草・送信済みの全文)+既読の固定入力(review-input・norm-input・clone・presented-g1a)のみを根拠とする。新たなファイル読取り・clone再接触は行っていない(循環の実在は自文とQ6裁定・UI計画既読内容の照合で確認した)。engine計画v13・台帳改訂17・バンドルPの転記後文書は未受領・未読であり、§2(ii)の修正文言は骨子指定である——転記後のSuu照合で意味保存を確認すること。
>
> ■5. 効力
> 本判定の効力は人間プロジェクトリードの承認後に発生する。承認対象: 本Q9判定文全体(§1裁定+§2付随回答、項目P追補P-1を含む)。全文転送を依頼する。承認まではG1a′は現行の停止状態(純関数提出済み・Suuレビュー保留)を維持してよいが、■3の3欠陥是正は先行してよい。

**docs-only反映状況(引用の外、alice_mot3の後続注記)**:
- engine計画をv13からv14へ改訂し、§20.8の完了条件をS-1〜S-4・S-6〜S-10+N-1・N-2前半・N-3へ限定(S-5・N-2後半除外)、S-5本文へG1b移管+G1a′での純関数性先取りを追記、新設§20.9へ本判定文を収録、§3.1 G1b行・§22 DoD表へS-5の3失敗経路×4不変項目・N-2後半・runSequence構築順・alice+brabit共同/C-4同時充足を追加した(`docs/phase3-p3-4-plan.md`)。
- 本台帳へ本エントリ(P3-4-Q9)を新設した。
- 人間再承認バンドルの項目Pへ「追補P-1」として一体記録した(新規独立項目化はしていない、`docs/phase3-p3-4-human-reapproval-bundle.md`)。
- **■3の3欠陥是正**: 2026-08-16、alice_mot3がP1(baseline関数のシグネチャ変更、resolveGarageBuild再呼出し排除)・P2(S-4監査を関数本体スコープへ限定+.tsx走査追加)・P3(N-2前半のexact reason固定)として是正済み(Suu_mot3独立確認済み)。続けてSuu_mot3の精度追補指摘(`GarageBuildResult`型を手書きshapeから`ReturnType<typeof resolveGarageBuild>`へ、過大な「型レベルで強制」表現の是正)も反映済み。
- **■2(ii)のG1a′純関数性テスト実装**: 2026-08-16、`src/store/__tests__/runOutcomeApplication.test.ts`へresolver・baseline構築関数・composeの純関数性(store/localStorage等非参照+引数非破壊+同一入力同一出力)を固定するテストを実装した。

**人間承認(引用の外)**: **人間プロジェクトリードが2026-08-16、定型文「P3-4追加裁定Q9判定文全体（S-5/N-2後半のG1b移管および項目P追補P-1を含む）を承認します。」で明示承認した(Suu_mot3中継確認済み)——Q9は発効した。**

- **人間再承認**: 承認済み(本Q9判定文自体の承認で足りる、新規バンドル項目は作らず`docs/phase3-p3-4-human-reapproval-bundle.md`の項目Pへ追補P-1として一体記録)。
- **再提出要否**: arbiter再提出は不要(引用■2(iii))。
- **出典**: Suu_mot3中継の全文agmsgメッセージ(2026-08-16T15:06:57Z、判定文原文)。人間承認はSuu_mot3中継(同日、Suu_mot3正式中継の補足メッセージ2026-08-16T15:07:10Zで確認)。

---

## P3-4-Q10: G1b `beginRunAction`のクロスストア原子的境界(arbiter追加裁定+§8補足裁定)

**経緯**: 2026-08-16T20:01のG1b明示解禁を受けてbrabit_mot3が実装着手した際、UI計画v12が繰り返し参照していた「`beginRunAction`(gameStore.ts所有)」という記述が実コードと食い違うこと(実体は`src/store/saveStore.ts`のP3-0由来の既存actionであり、`gameStore.ts`からは一度も呼ばれていない)を実測で発見した。さらに、config構築(8段順)とrunSequence発行の**原子的境界がどの承認済み計画にも定義されていない**ことが判明した。既存`beginRunAction`は`pureBeginRun`成功時に`writeOrFail`で`saveMeta.nextRunSequence`を永続更新し`applyFreshStateToStore`でruntime 3フィールドも設定するため、これを先に呼んでからconfig構築を行うとQ9/S-5の「`nextRunSequence`不変」「config構築失敗をrunSequence消費前に確定」に直接違反する。brabit_mot3の設計案2版(v1: 既存action先行呼出し、v2: OCC/CAS方式)はいずれもSuu_mot3が差し戻し、事前照合21点(P1〜P21)を経て`docs/phase3-p3-4-g1b-atomic-boundary-review-request.md`(317行・25847 bytes・SHA256 `5ac68f9487e797db94a7048a5143c6036eae23d7dbc7442272bad5d2ef5151d5`)としてarbiter_mot3へ正式提出、2026-08-18に**条件付き承認**の裁定を受けた。続けて§8ブロッキング指摘の解消案についてalice_mot3が設計回答v2を提出し、同日**補足裁定(条件付き承認)**を受けた。

### 本裁定(§1〜§9、2026-08-18)

- **§1(最優先): A1・A2いずれも不採用、第3案A3を採用。** 依頼書§0.1は「(a)commit前にRunSnapshotを作らない/(b)storage I/O失敗を痕跡なく失敗させる/(c)commit後のcapture例外が起きないruntime保証」の3つが同時に満たせないと整理したが、(c)を文字どおり満たす必要はない。「commit後にcaptureが例外を投げ、runはcommit済みだがRunSnapshotを得られない」状態は**本設計に固有の新種の問題ではなく**、プレイヤーがrun開始直後にタブを閉じた場合と構造的に同一であり、**P3-0-Q1の高水位runSequence意味論(「未適用のまま高水位に飛び越された番号は冪等skip、エラーではない」)が既に日常的に許容している**。孤立runSequenceが1件生まれるだけでロールバック不要。必要な不変条件は「例外が発生しても未捕捉のまま伝播させず、saveStore側のruntime状態を『run進行中』のまま取り残さない(=UIが即座に再試行できる)こと」という、より弱いが十分な保証である。**A3はUI契約(a)の再openを一切必要としない**(A2案は不要な代償を払っている)。**A3の必須修正2点**: (i) `captureRunSnapshot`呼出しを`try/catch`で包み、catch時は新設の判別可能な失敗腕`{ok:false, reason:'snapshotCaptureFailed'}`を返す。(ii) catchブロック内でruntime専用フィールド(`currentRunSequence`・`pendingRunEquipmentSnapshot`・`pendingRunSaveId`)を**明示的に`null`へ戻す`set(...)`を呼ぶ**——怠ると`pureBeginRun`の`if (currentRunSequence !== null) return {reason:'runInProgress'}`ガードにより**ページリロードなしには再挑戦できないソフトロック**になる(arbiterが自らA1由来の設計をトレースして発見した具体的負例)。`snapshotCaptureFailed`はUI計画§6.4.1失敗表の新規行とし、UI文言は「この操作は行われませんでした」的な含意を避け**再試行が安全であることを示す文言**とする。これは**契約(a)の修正ではなく契約(a)の対象外の新規契約の追加**として扱う。
- **§2: trusted narrowing——案(i)局所type assertionを承認。** 案(ii)(`BeginRunResult`拡張)は戻り値型の変更もシグネチャ変更でありP13(iv)「`pureBeginRun`無改修」に反するとして却下。条件: アサーション箇所に「なぜ安全か」の1行コメント(既存`deriveMaterialSelectionFromEquipment`内のtrusted precondition記法と同様式)。追加の機械テストは不要。
- **§3: compose/有限性失敗腕の§6.4.1既存generic行への合流——承認、ただし表記の精密化を条件とする。** 既存行ラベル「Wear反映後のconfig範囲外」は、既に承認済みのC-3(Wear適用**前**のbase有限性検証)を文字どおりカバーしていない記述不備があるため、「config構築失敗(base有限性検証〈C-3〉およびWear反映後範囲外の両方を含む)」へ改称すること。実装上のハンドラ統合は問題ない。
- **§4: P16(判別union`RunPreparationRunKind`)・P17(`initialVehicleState`/`initialMotorState`の内部導出)・P18(`GEAR_TOTAL_TOOTH_COUNT`)は全件承認。** P16はP3-1-Q6の「fail-fastより構築不能」原則に沿う。P17はP3-1-Q9の「走行開始時に確定する構成情報はRunSnapshotを唯一の出典とし独立引数として再入力させない」の直接の帰結。P18はarbiterが`src/materials/inventoryItem.ts:27`を実測確認(値10)。
- **§5: runKind/`equipmentSnapshot.context`の整合——依頼書の「呼出し側の前提とする」設計は不承認、要修正。** `prepareDestructionRun`は公開export純関数であり将来別の呼び出し元から呼ばれうるため、同じ事実を表す2つの独立入力から不整合な組合せを構築できる構造(P3-1-Q6が明示的に排除対象とした「静かな不一致」)が残る。関数内部先頭で`(runKind.kind==='motorOnly') === (equipmentSnapshot.context==='motor')`を明示検証し不一致時は`throw`すること(無効入力に対するthrowは参照透過性を損なわない)、および実際に矛盾する引数を渡してthrowを確認する負例テストを`gameStore.test.ts`へ追加することを条件とする。二重入力自体の設計解消は任意の改善として実装者判断に委ねる。
- **§6: 新規public型・actionの人間再承認——要(全件)。** `RunPreparationResult`・`RunPreparationCallback`・`beginRunActionWithPreparation`・`prepareDestructionRun`、および`snapshotCaptureFailed`失敗腕(単独の行として明示提示すること)。**追加のみであることは再承認省略の理由にならない**(P3-0-Q1・Q3・Q4a・Q4b・Q5の先例)。
- **§7: docs反映の順序・所有。** Q10は`src/engine/`の型・関数を一切変更しない(`captureRunSnapshot`・`CaptureRunSnapshotInput`はalice所有・無改修)。したがって**engine計画v14への実体的反映は不要**(相互参照コメント1行で足りる)、実体的反映先は**UI計画(brabit所有)のみ**でv13として改訂。台帳は名前空間`P3-4-Q10`で追記(運用規則追補1)。
- **§8(ブロッキング指摘)**: 依頼書pseudocodeが呼んでいた`isFiniteMaterialComposedBase`が**リポジトリに実在しない**(arbiterの独立実測で`rg`0件)。「既存C-3同型」という表現は誤解を招くもので、C-3は**要件**であって実装済み関数ではない。この関数がなければG1bはコンパイルすら通らない。配置は`src/materials/materialMapping.ts`(alice所有)が推奨されるが、最終的な配置・命名・検証粒度はalice_mot3の設計判断に委ねる。
- **§9(効力)**: 本裁定の効力は人間プロジェクトリードの承認後に発生する。arbiter_mot3はコード作成・編集・commit・push・仕様の代行確定のいずれも行っていない。

### §8補足裁定(2026-08-18、`validateMaterialComposedBase`の設計確定)

alice_mot3の設計回答v2に対する**条件付き承認**(条件: P-Q10-A3の人間再承認バンドルからの除外。他は全件そのまま承認)。

- **配置を`recipeKey.ts`とする判断: 承認。** `materialMapping.ts`の現行importには`recipeKey.ts`への依存が一切なく、逆に`recipeKey.ts`は`MaterialSelection`を`materialMapping.ts`から**型のみ**片方向importしている(実測、`recipeKey.ts:5`)。`materialMapping.ts`へ置いてcollectorを共有しようとすると**値import**が新たに必要になり循環が生じる。共有せずフィールド列挙を複製する代案は「検査対象集合と`computeRecipeKey`が読む集合が独立した2箇所に存在し静かに乖離しうる」構造(P3-1-Q6の核心)を再導入する。**arbiter当初推奨(§8時点の`materialMapping.ts`)より優れた判断であり、覆すことに異論はない。**
- **依存閉包による十分性証明: 承認。** arbiterがalice_mot3の算術を鵜呑みにせず`MotorConfig`(`motorPhysics.ts:38-`、宣言18フィールド)・`CarConfig`(`vehiclePhysics.ts:44-54`、宣言9フィールド)を自ら読み直して独立再計算した結果、27エントリが覆っていないのは`effectiveTurnsRatio`のみであり、これを層2で別途検証することで宣言フィールド全数を過不足なく覆うことを確認した。2関数への分離は不要。
- **`effectiveTurnsRatio`違反のResult拒否、`encodeRecipe`との機構差: 承認。** 両者は**呼び出し境界の性質が異なる**ため機構が異なって当然であり不整合ではない——`encodeRecipe`のthrowは**プレイヤー操作を経由しない開発者向けAPI誤用検出**であるのに対し、`validateMaterialComposedBase`は**beginRun経路(プレイヤー操作起点)に直接位置する**ため、ここで例外を投げればQ10 §1で指摘した「未捕捉例外がbeginRun経路へ伝播する」問題を再導入しA3裁定の趣旨に反する。候補3(型レベル分離)はP3-3-Q14が「偽の安全」として却下済みの先例をそのまま適用でき再提案の余地はない。
- **collector非export化+単一出典共有、公開増分をvalidator1件に限定: 承認。** 「検査した集合とthrowする集合が別々の場所に存在し得る」構造そのものを排除する(P3-1-Q6の適用)。件数不変条件(27)を**公開API(`computeRecipeKey`出力文字列の第3セグメント要素数)からのみ**固定するテスト設計は、公開面を増やさずに追加漏れ・重複を検出できる健全な設計。
- **所有分担(materials=alice、store=brabit、engine変更0件): 承認。** `src/materials/`はPhase 2以来の既存の役割分担と整合する。
- **人間再承認項目の範囲: 条件付き承認。** P-Q10-A1(新規public関数)承認、P-Q10-A2(内部リファクタ、公開面の増分なし)は再承認対象外として記載のみで可、**P-Q10-A3(配置決定)はバンドルから除外することを条件とする**——「公開面不変の内部配置変更は人間再承認不要」という確立した先例(**P3-1-Q2**「`DestructionRunContext`等の定義元移設」・**P3-1-Q7**「`BatteryDestructionConfig`等の定義元移設」、いずれも「人間再承認: 不要(公開面不変、実装詳細の逸脱)」)と同型であり、人間PMにファイル配置の可否判断を求めることはバンドルの信号対雑音比を下げる。**本項目はarbiter裁定記録および本決定台帳への記載で足りる**(本エントリがその記載である)。P-Q10-A4(検証対象契約)承認。P-Q10-A5は下記の確定文言で確定。
- **P-Q10-A5確定文言**: 「`effectiveTurnsRatio`が`undefined`でも`1`でもない場合、`validateMaterialComposedBase`はResultとして`{ ok: false, reason: string }`を返す(候補1、判定式は`recipe.motorConfig.effectiveTurnsRatio !== undefined && recipe.motorConfig.effectiveTurnsRatio !== 1`でP3-3-Q14の`encodeRecipe`判定式と同一)。既存`encodeRecipe`(P3-3-Q14裁定によりthrow)との機構差は、呼び出し境界の性質の違い(前者はプレイヤー操作起点のbeginRun経路、後者は開発者向けAPI誤用検出)に基づく意図的な設計であり、beginRun経路で例外を未捕捉のまま伝播させないというarbiter追加裁定Q10 §1(A3)の要求と整合する。」
- **§8ブロッキング指摘は設計上解消済みと判定。** **G1b着手前の追加条件**: (1)本補足裁定を人間再承認バンドルへ反映すること、(2)**Q10旧§1〜§7の条件はいずれも本補足裁定によって変更・免除されない(すべて有効なまま継続)**、(3)alice v2 §9のテスト(特に**#4「件数固定(公開APIのみ)」・#5「双方向同期(検査集合⊆throw集合およびその逆)」**)が実装され全文出力・終了コードとともに完了報告されること(要約報告は禁止)、(4)決定台帳・人間再承認バンドル・UI計画への実追記をSuu_mot3の照合を経てから行うこと。
- **効力**: 本補足裁定の効力は人間プロジェクトリードの承認後に発生する。

### 確定した設計(alice_mot3設計回答v2+補足裁定)

| 項目 | 確定内容 |
|---|---|
| 公開関数 | `validateMaterialComposedBase(motorConfig: MotorConfig, carConfig: CarConfig): { ok: true } \| { ok: false; reason: string }` |
| 配置 | `src/materials/recipeKey.ts`(alice所有)——`materialMapping.ts`ではない(値import循環回避) |
| 検証第1層 | `computeRecipeKey`が読む**27エントリ**(`MotorConfig` 17件+`CarConfig` 10件〈`gearReflectedInertiaKgM2`を含む〉)の有限性 |
| 検証第2層 | `effectiveTurnsRatio`のbase契約(`undefined \| 1`)、違反時はResult拒否 |
| 内部helper | `collectRecipeKeyNumericFields`(**非export**、`computeRecipeKey`と単一出典共有) |
| `computeRecipeKey` | 公開シグネチャ・出力文字列とも**不変**(内部リファクタのみ) |
| 公開面の増分 | **`validateMaterialComposedBase` 1件のみ** |
| 呼び出し位置 | `prepareDestructionRun`内、`composed.ok===true`確認後・`computeRecipeKey`の**直前** |
| 所有分担 | `src/materials/`=alice_mot3、`src/store/saveStore.ts`・`gameStore.ts`=brabit_mot3、`src/engine/`=変更0件 |

**反映先**: `docs/phase3-p3-4-ui-plan.md` v13(§1・§6.4.1・§6.5・§17・§23 DoD23〜27)、`docs/phase3-p3-4-human-reapproval-bundle.md`(項目Q)、`docs/phase3-p3-4-q10-decision-proposals.md`(裁定記録)。engine計画v14は相互参照のみで実体的変更なし。

**出典**: Suu_mot3中継の全文agmsgメッセージ(本裁定=2026-08-18T08:37:44Z、補足裁定=2026-08-18T09:31:28Z、いずれも判定文原文)。

**【後続注記(2026-08-18、人間承認到達)】** 本裁定§9および§8補足裁定の効力発生条件(いずれも「人間プロジェクトリードの承認後に効力が発生する」)は、**2026-08-18に充足した**。人間プロジェクトリードが次の単一定型文で明示承認し、Suu_mot3が原文どおり中継・確認した(受領時刻 2026-08-18T10:22:21Z):

> P3-4追加裁定Q10判定文全体（A3採用・snapshotCaptureFailed新設）および§8補足裁定判定文全体と、項目Q（brabit担当分の新規公開契約およびalice担当分P-Q10-A1・A4・A5）を承認します。

これにより**Q10本裁定・§8補足裁定はいずれも発効し、人間再承認バンドル項目Qの再承認も完了した**(`docs/phase3-p3-4-human-reapproval-bundle.md`の項目Q・承認記録に原文を収録)。**残るG1b着手条件は次の2点のみ**: (1) `validateMaterialComposedBase`(`src/materials/recipeKey.ts`、alice_mot3所有)の実装と、alice設計回答v2 §9のテスト——特に**#4「件数固定(公開APIのみ)」・#5「双方向同期(検査集合⊆throw集合およびその逆)」**——が実装され、**全文出力・終了コードを伴って完了報告されること**(要約報告は禁止)、(2) Suu_mot3によるG1bの明示解禁指示。**Q10旧§1〜§7の条件はいずれも補足裁定・本承認によって変更・免除されず、すべて有効なまま継続する。** production配線・feature gate切替・commit/tag/pushは上記2点が揃うまで引き続き禁止。

---

## P3-4-Q11: RunSnapshotとlive開始入力の単一出典+`finishAssembly`の原子的境界(arbiter追加裁定)

**経緯**: G1b実装のSuu_mot3独立レビューで、`RunSnapshot`と実際のlive開始入力が食い違う箇所(P9・P13)と`finishAssembly`の順序・失敗原子性の問題(P17)が検出された。arbiterは依頼文の指摘を鵜呑みにせず固定入力の実コードで独立確認し、**4件の不一致すべてを事実と認定**した: (1)snapshot側`initialMotorState: REST_STATE`対live側`{...s.simState, omega: FLICK_INITIAL_OMEGA}`/`{...REST_STATE, omega: clampedOmega}`、(2)snapshot側composed由来`createInitialVehicleState(composed.motorConfig, composed.carConfig)`対live側raw由来`createInitialVehicleState(s.config, s.carConfig)`、(3)snapshot.seed(`beginProductionRun`内部生成)対live `_rngState`(`recipeSeed`)/`_vehicleRngState`(別の`createSessionSeed()`)/finishAssemblyのさらに別seed、**加えてliveのrngはxorshift(`nextRandom`)だがリプレイ規約(P3-1-Q9付帯条件(i))はmulberry32であり、アルゴリズム不一致も実在する**、(4)`finishAssembly`は`beginProductionRun`(旧`state.config`を読む)を先に呼び、その後新configをcommitする——snapshotは旧config・liveは新config。

**総合判定**: **条件付き承認**(Q11-2/Q11-3の原則は確定、Q11-1は両候補とも不採用で第3案を裁定、Q11-3はseedの供給経路とRNGアルゴリズム正典化の2点を必須修正、Q11-4は案Aを採用)。人間再承認デルタ4件(Q-R1〜Q-R4)の承認までG1b該当部分(P9/P13/P17)の実装停止を継続する。

### Q11-1: motor-onlyの`RunSnapshot.initialMotorState`(両候補とも不採用、第3案を裁定)

**裁定**: 「REST_STATE維持」でも「post-input state全体の捕捉」でもなく、**`initialMotorState = 静止状態(REST_STATE相当)+omegaのみを開始操作のclamp済み初速で置換した値`**とする。`RunPreparationRunKind`のmotorOnly腕へ`initialOmega: number`を必須追加し、`prepareDestructionRun`が`{...REST_STATE, omega: runKind.initialOmega}`を構築してsnapshotへ入れる。begin成功後のlive `simState`は、返された`runSnapshot.initialMotorState`のdeep copy(`structuredClone`)から初期化する(逆方向の再構築はしない)。

理由: (a)REST_STATE固定は不可——初速はまさに「走行開始時に確定する構成情報」であり、P3-1-Q9によりRunSnapshotが唯一の出典でなければならない。snapshotがomega=0のままでは同一snapshotから初速を再現できず、リプレイ契約が最初の1stepから破れる。既存フィールド内で決定論的に再現する方法は存在しない(seedはrng系列であり初速を運べない)。(b)post-input state全体の捕捉も不可——直前runの過渡状態(`batteryHeat`・`theta`・`chatterFramesLeft`・`coilCollapsed`等)が新runのsnapshot初期値へ漏れ込む。run間の恒久効果は`applyRunOutcome`→`WearState`/個体状態という単一経路に限るというP3-0以来の確立契約に対し、これは**第二の伝搬チャネル**を作る。特に`coilCollapsed=true`の持ち越しは`RotorAssemblyState.collapsed`(個体状態)で管理される既存契約と二重表現になる。`SimState`全体を腕に持たせる型設計も`batteryHeat=0.9`のような不正な初期状態を型上構築可能にするため不採用(P3-1-Q6「構築不能」原則)。

**帰結**: true側の`flickStart`のlive初期化は`{...s.simState, omega}`から`runSnapshot.initialMotorState`のdeep copyへ変わる(過渡状態の持ち越しはtrue側では廃止。false側=V2旧経路は無改修)。`finishAssembly`の現行live初期化は既に`{...REST_STATE, omega: clampedOmega}`でありこの裁定と同型——snapshot側をこれに一致させる形になる。clampの実施主体は呼出し側(gameStore各入口)。`prepareDestructionRun`は防御として`Number.isFinite(initialOmega)`かつ`|initialOmega| <= MAX_FLICK_OMEGA`を検証し、違反時はQ10 §5のcontext不整合と同じ扱いでthrowする(呼出し側プログラミングエラーでありプレイヤー到達経路ではないため、Result腕ではなくthrowが正しい)。

### Q11-2: test-runのlive vehicleState(承認)

**begin成功後のlive `vehicleState`は、返された`runSnapshot.initialVehicleState`のdeep copyから開始し、raw configから再生成してはならない。** 現行の`createInitialVehicleState(s.config, s.carConfig)`はtrue側では削除しsnapshot由来値へ置換する。wrapperが読むconfig(snapshot側composed)とliveの第1step入力が同一出典になる。deep copy必須の理由: live側の状態オブジェクトをsnapshotと参照共有すると、将来の実装変更でin-place変更が入った場合に`accumulator.replaySnapshot`まで汚染される——現行engineは毎stepで新オブジェクトを返すため即座の実害はないが、この安全性を実装の偶然に依存させない。

### Q11-3: live RNG seedとnotebook seed(条件付き承認——原則確定+必須修正2点)

**原則「live `_rngState`/`_vehicleRngState`および`_sessionSeed`(notebook seed)は、返された`runSnapshot.seed`を唯一の出典とする」を承認・確定する。** ただし次の2点を必須修正とする。

**修正(i) seedの供給経路——`beginProductionRun`へ`seed: number`引数を追加する。** 現行(承認済みpseudocode)は`beginProductionRun`が内部で`createSessionSeed()`を呼ぶ。この設計のままだと、`flickStart`(サンドボックス)の`recipeSeed`による再現実行——**プレイヤー可視の既存機能**(「固定初速で再現性を保つ」)——がtrue側で静かに死ぬ(snapshot.seedが常にランダム新規値になり、プレイヤーの指定seedと無関係になる)。よって`beginProductionRun(runKind, seed)`とし、呼出し側が供給する: `flickStart`は`recipeSeed`を、`finishAssembly`は新規生成した`seed`(同じ値を`recipeSeed`へも保存)を、`startTestRun`は`createSessionSeed()`のexact1回呼出し結果を渡す。内部生成は削除する。

**修正(ii) RNGアルゴリズムの正典化——seed一致だけではリプレイは再現しない。** liveのrngはxorshift(`nextRandom`)、確定済みリプレイ等価テスト規約(P3-1-Q9付帯条件(i))はmulberry32である。同じseedでも系列が異なるため、seedの単一出典化だけでは「同一snapshotからの正直な再生」は成立しない。**正典run RNGをmulberry32と確定し、production関数として単一のexport(例: `createRunRng(seed: number): () => number`)を新設する。true側のlive stepはこの正典関数を`runSnapshot.seed`で初期化して用いる。false側(V2旧経路)は`nextRandom`のまま無改修とする。** mulberry32を選ぶ理由: 既存のリプレイ等価テスト(commit済み、P3-1-Q9)が既にmulberry32(snapshot.seed)を規約としており、true側は新規経路なのでliveを規約側へ合わせるのが変更面最小。**所有はalice_mot3**(リプレイ機構の一部)。配置はQ10 §8と同じ委任方式——`src/engine/destructionOrchestration.ts`(RunSnapshot/replay機構の既存の家、V2凍結対象外のPhase 3拡張ファイル)を推奨するが、最終配置はaliceの設計判断に委ねる。**brabit所有の`src/retro/audio/prng.ts`にあるmulberry32を所有境界を越えて共有してはならない**(audio用途とrun物理用途の変更理由が異なる。意図的重複はこのプロジェクトの確立パターン)。

### Q11-4: `finishAssembly`の順序・失敗原子性(案Aを採用)

**案A**: (1)前runのfinalize→(2)omega clamp・seed生成→(3)config永続commit(progress gate、`recipeSeed`込み)→(4)**commit成功時のみ**`beginProductionRun`実行(この時点で`state.config`は新config)→(5)begin成功時のみlive runtimeを`runSnapshot`由来で初期化。

失敗時: (3)のcommit失敗→beginを呼ばない・永続不変・saveStore runtime不変(runSequence未消費)・gameStore runtime不変。(4)のbegin失敗→**configは保存済みのまま保持**・saveStore runtimeはA3/S-5の各裁定どおり(`snapshotCaptureFailed`のみ孤立runSequence1件+runtime3フィールドnullリセット、他は完全不変)・gameStore run runtime不変。(5)は失敗しない。

**案Bの却下理由**: `beginRunActionWithPreparation`(承認済み項目Q)の責務を「run開始」から「プレイヤー構成の永続化+run開始」へ拡張することになり、承認済み契約の大幅再openとcallback契約の複雑化(prospective configの注入)を招く。得られる利益は「config保存済みだがrun未開始」という中間状態の排除だが、**この中間状態は欠陥ではない**——「組み立てを完了した」はrun開始と独立に成立するプレイヤーの耐久的決定であり、購入がrun開始と無関係に確定するのと同格である。

**S-5「gameStoreローカルruntime不変」の適用範囲の明文化**: S-5が指すのは**run runtime**(`_runAccumulator`・`simState`/`vehicleState`・`_sessionSeed`/`_sessionStartedAt`/`_sessionConfig`/`_sessionSamples`・`_rngState`/`_vehicleRngState`・`testRunPhase`/`courseRunPhase`等)のみである。**プレイヤー確定構成(`config`/`carConfig`/`garageSelection`/`recipeSeed`)はS-5の対象外**であり、progress gate(`commitWithProgressGate`)の既存セマンティクス(先に永続化、成功時のみローカル反映)に従う。

現行実装(begin先行)は本裁定により**是正対象**である(snapshotが旧configで作られる欠陥、および「begin成功→config commit失敗で旧config snapshotのrunだけが進行中に残る」経路)。案Aの順序ではこの経路自体が消滅する。

### Q11-5: 公開型/signature変更のexact列挙+人間再承認(Q-R1〜Q-R4)

- **Q-R1**: `RunPreparationRunKind`のmotorOnly腕を`{ kind: 'motorOnly'; initialOmega: number }`へ変更(承認済み型の破壊的変更)。`prepareDestructionRun`はこの値の有限性・`|initialOmega| <= MAX_FLICK_OMEGA`をthrowで防御する。
- **Q-R2**: `beginProductionRun`のシグネチャを`(runKind: RunPreparationRunKind, seed: number)`へ変更(内部`createSessionSeed()`を削除し呼出し側供給へ)。C-4のexact1捕捉テストは新シグネチャへ追従する。
- **Q-R3**: 正典run RNG関数(mulberry32、**alice所有**、名称・配置はalice確定——推奨は`src/engine/destructionOrchestration.ts`)の新設(新規public関数)。
- **Q-R4**(契約文の追加、型変更なし): (a)begin成功後のlive runtime初期化は返された`runSnapshot`のdeep copyを唯一の出典とし、raw configからの再生成・別seedの使用を禁止する。(b)`finishAssembly`の順序=案A。(c)S-5適用範囲の明文化。

**変更しないもの(明示)**: `RunPreparationResult`・`RunPreparationCallback`・`beginRunActionWithPreparation`(saveStore側)・`prepareDestructionRun`のシグネチャ(runKind型の変更が透過するのみ)・`CaptureRunSnapshotInput`/`RunSnapshot`(engine、無改修)・V2凍結engine本体(Q-R3はPhase 3拡張ファイルへの追加であり凍結面に触れない)。

依頼文の「最小変更案(motorOnly腕へ`initialMotorState`必須追加)」について: 方向は採用するが、**腕に持たせるのは`SimState`全体ではなく`initialOmega: number`のみ**とする(Q11-1の理由による縮小)。

### Q11-6: G1b内の是正範囲+追加DoD

**是正範囲(すべてG1b内、brabit所有。ただしQ-R3のみalice所有)**: `flickStart`・`startTestRun`・`finishAssembly`のtrue側分岐、`beginProductionRun`、`RunPreparationRunKind`型、`prepareDestructionRun`のmotorOnly分岐+防御検証。**G6以降への先送りは認めない**(いずれも「同一snapshotからの再現」というG1bのcommit境界契約の一部であるため)。

**追加DoD(UI計画v14 §23の28〜34へ採番)**: DoD-Q11-a(snapshot⇔live一致)・b(再現性機能の保持、`runSnapshot.seed === recipeSeed`)・c(finishAssembly失敗原子性3経路)・d(production経路のリプレイ等価、非ゼロinitialOmega)・e(RNG正典適合、系列先頭N値一致)・f(防御throw負例)・g(false側回帰)。

### 独立報告I-1(裁定せず報告のみ、Q11の範囲外)

`flickStart`・`finishAssembly`は`_sessionConfig: {...s.config}`(rawPlayerMotorConfig)を実験ノートへ記録するが、true側の物理はmaterialComposedBase(素材写像込み)で走る。実験ノートが「rawのプレイヤー入力値」と「実際に物理へ渡ったcomposed値」のどちらを見せるべきかは、spec §1.2(生の数値を見せる/現象は隠さない)に関わる**提示設計**の問題であり、Q11の裁定範囲(単一出典・原子性)の外にある。推測で補わず、独立論点としてSuu_mot3のルーティング(必要ならG7 notebook配線前の別裁定)へ委ねる。

### docs反映先・担当・ゲート・効力

決定台帳: 本エントリ(brabit起草・Suu照合)。UI計画v13→v14: §6.5.4 pseudocode・§6.5.7(live初期化規則、新設)・§6.5.8(finishAssembly順序+S-5適用範囲、新設)・§23 DoD 28〜34。engine計画: Q-R3(正典RNG)の追加のみalice側で追記(配置確定込み)——**2026-08-18にalice_mot3がv14→v15として反映済み(§20.10)**。人間再承認: Q-R1〜Q-R4を項目Qの追補として1回のバンドルで提示(C-13の同梱推奨と同型)。**実装解禁は人間再承認デルタの承認+Suu_mot3照合の後**——それまでP9/P13/P17の停止を継続する。本裁定の効力は人間プロジェクトリードの承認後に発生する。arbiter_mot3はコード作成・編集・test・commit・push・仕様の代行確定のいずれも行っていない。

**出典**: Suu_mot3中継の全文agmsgメッセージ(2026-08-18T14:52:23Z、arbiter_mot3判定文原文、発行2026-08-18T14:49:05Z)。

**【後続注記(2026-08-18、人間承認到達)】** 本裁定の効力発生条件は**2026-08-18に充足した**。人間プロジェクトリードが次の単一定型文で明示承認し、Suu_mot3が原文どおり中継・確認した(受領時刻 2026-08-18T14:57:08Z):

> P3-4追加裁定Q11判定文全体、および人間再承認デルタQ-R1・Q-R2・Q-R3・Q-R4を承認します。

これによりQ11裁定は発効し、Q-R1〜Q-R4の人間再承認条件も充足した。**ただしP9/P13/P17に対応するG1bコード実装は、Suu_mot3の文書照合・明示解禁まで停止を継続する。** Q-R1・Q-R2の依存閉包はpitfalls#2に従い事前実測済み(UI計画v14 §6.5.9): `RunPreparationRunKind`のmotorOnly腕リテラル構築は3ファイル17箇所、`beginProductionRun`は3ファイル15箇所。

**Q-R3の確定内容の同期(2026-08-18、alice計画v15 §20.10)**: 裁定本文はQ-R3の名称・配置を「alice設計判断へ委任(推奨は`src/engine/destructionOrchestration.ts`)」としていたが、alice_mot3が**関数名`createRunRng`・公開signature`export function createRunRng(seed: number): () => number`・配置`src/engine/destructionOrchestration.ts`**として確定し、engine計画をv14→**v15**へ改訂した(§20.10新設。命名根拠=「run(走行)の正典RNG」であることが名称から判別でき、brabit所有のaudio用PRNG〈`src/retro/audio/prng.ts`〉およびテストヘルパ〈`src/engine/__tests__/prng.ts`〉と用途を取り違えないこと。裁定の例示名をそのまま採用)。**この確定により、Q10時点で記していた「`src/engine/`は変更0件」は撤回される**——ただしV2凍結面には触れず、Phase 3拡張ファイルへの追加に閉じる。したがってQ-R1・Q-R2の依存閉包実測における「engineへの波及0件」も、Q-R3の新設分(`destructionOrchestration.ts`へのexport追加、alice所有)を除いた記述として読むこと。**上記は確定内容の同期であり、人間が承認した判定文原文は改変していない。**

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
- 改訂13(2026-08-14、正式arbiter技術レビュー〈P3-4統合実装前計画、engine v10+UI v9クロスレイヤ、送信者名義arbiter_mot3〈旧称Fable役〉、Suu_mot3中継確認済み〉反映、Suu_mot3指示): **P3-4-M-1・P3-4-R1〜R27**エントリを新設し、`docs/phase3-p3-4-plan.md`(v10→v11)・`docs/phase3-p3-4-ui-plan.md`(v9)への正式arbiter技術レビュー判定(条件付き承認)を記録した。arbiter_mot3は「Fable」役の通信名改名であり、人間プロジェクトリードがSuu_mot3との直接会話(agmsg外)で2026-08-14に設置を明示し、Suu_mot3が正規性を確認したうえでalice_mot3・brabit_mot3へ中継したものである(A4是正)。agmsg履歴上は「arbiter_mot3」という名義自体が初出だったため、alice_mot3は一旦全ての関連作業を保留してSuu_mot3へ出自を照会し、上記の回答を受けて正式回答として扱った——pitfalls#1の正規チャネル要件〈人間PM直接提示またはSuu_mot3中継〉自体は当初から満たしていた。必須修正M-1(D06クロスラン会計契約の欠落、部分損傷ギヤ再装備時の会計破綻・二重計上・検死ログ虚偽表示の3欠陥)を式展開込みで記録し、確定裁定(i)〜(viii)を`docs/phase3-p3-4-plan.md`(v11)§9.2・§9.3・§12・§13.1・§14・§15・§16へ反映した。R1〜R27(D06トリガは候補b確定・D09被害記録は候補A確定・gear反射慣性はetaを含めない式で確定・gear密度はtitanium検証優先順で確定・recipeKeyは素材ID5フィールドを先頭に含める形で確定 等)を要旨として収録し、人間再承認が必要な単一一覧A〜O(engine専属A〜I/UI所有J〜O)・付帯条件C-1〜C13・推奨REC-1〜4を記録した。人間再承認バンドル未作成(次工程)。
- 改訂14(2026-08-15、Suu_mot3最終クロスレイヤ照合A1〜A5是正反映、契約変更なし、Suu_mot3指示): engine計画をv11からv12へ改訂した(`docs/phase3-p3-4-plan.md`)。A1(§7.3フィールド数11→12訂正+REC-1自己矛盾除去)・A2(§14.2をUI §6.2と同一の8段呼び出し順序へ全面同期)・A3(captureRunSnapshotのシグネチャ変更は人間再承認A〈recipeKey追加〉起因でありM-1のseeding自体は追加のシグネチャ変更を伴わない旨を§14.3へ明記)・A4(本台帳P3-4-M-1エントリの日付行+改訂13の出自記述を、正しい経緯「人間PMがSuu_mot3との直接会話で設置を明示→Suu_mot3が正規性確認→alice_mot3・brabit_mot3へ中継」へ訂正)・A5(engine末尾の手続き注記を現状化、正式arbiterレビュー完了済み・残条件はSuu最終照合+人間再承認A〜Oのみである旨を明記)のいずれも反映済み。続けてA6として、本台帳P3-4エントリ内の現行版参照4箇所(人間再承認詳細参照・出典・各裁定要旨・付帯条件/REC詳細)を「現行v12」表記へ同期した(本改訂14自体、および改訂13の履歴記述は書き換えていない)。人間再承認は不要(値・型契約の変更なし、docs-only是正のみ)。Suu_mot3最終クロスレイヤ照合は継続中(本改訂時点では未通過、先取り記載はしない)。
- 改訂15(2026-08-15、Suu_mot3最終クロスレイヤ照合通過+H1是正+人間再承認一覧A〜O人間承認+G1a初回実装提出〈Suu照合中、完了未宣言〉、Suu_mot3指示): Suu_mot3がengine v12・UI v10・台帳改訂14の最終クロスレイヤ照合を通過と宣言(正式arbiter再提出不要)。続けてSuu_mot3指示により`docs/phase3-p3-4-human-reapproval-bundle.md`を新規作成し、engine v12 §20.5のA〜O15項目を型/変更・理由・影響・所有者・実装時期付きで転記した(契約の追加変更なし)。Suu_mot3のH1是正指摘(バンドルJのmigration失敗分類「validator失敗=corrupted/readRaw」という誤記——readRawがcorrupted側に読めてしまう)を「旧/新validator失敗=corrupted、readRawまたはwriteV16のI/O失敗=storageError」へ訂正した。人間プロジェクトリードが2026-08-15、定型文「A〜O、15件を再承認します。」でA〜O全15項目を明示承認(Suu_mot3中継確認済み)。これにより正式arbiter条件付き承認の発効条件(M-1 docs反映+Suu最終照合+A〜O承認)がすべて充足され、Suu_mot3の指示によりG1a(assembler・確定較正定数集約・EquipmentDestructionContext解決純関数・RunSnapshot capture/recipeKey関連純関数)のみ実装解禁された。alice_mot3がpitfalls#2依存閉包をrg再実測したうえでG1aを実装した: 新設`src/materials/destructionCalibration.ts`(D01/D02/D05共通部の確定較正値集約)・`src/materials/recipeKey.ts`(`computeRecipeKey`、R2確定の素材ID5フィールド先頭込み)、`src/materials/materialMapping.ts`改修(`EquipmentDestructionContext`型・`resolveBatteryDestructionConfig`・`resolveD04Config`・`mapD06DestructionConfig`〈§17.3候補値〉・`mapD09DestructionConfig`〈G1a時点の現行最小形〉・`assembleDestructionConfig`新設)、`src/engine/destructionOrchestration.ts`改修(`RunSnapshot`/`CaptureRunSnapshotInput`/`RestoredRunSnapshot`への`recipeKey: string`追加、`RUN_SNAPSHOT_CONTRACT_VERSION`2→3、`captureRunSnapshot`のrecipeKey受け渡し、`restoreRunSnapshot`のrecipeKey外形検証追加)。d06/d09は`DestructionConfig`の現行最小形(`{breakage}`/`{bearingSeizureGaugeLimit}`)のまま実装し、G3/G4での型拡張(人間再承認一覧D/E)時に対応するmap関数を改訂する設計とした(この段階実装自体はSuu_mot3のG1a独立照合で受理方向と確認済み)。新規テスト25件(`recipeKey.test.ts`新設9件+`materialMapping.test.ts`13件+`destructionOrchestration.test.ts`4件〈うち1件contractVersion期待値2→3の既存修正〉)を追加し、既存1416件+新規25件=全1441件成功、`npm run build`成功(bundle 791.23kB/gzip 221.31kB、旧790.97kB/gzip 221.23kBから微増)、`npm run lint`成功、`npx tsc -p tsconfig.material-sweep.json`成功、`git diff --check`クリーン、`cmp AGENTS.md CLAUDE.md`差分なしを確認した。G1b以降(gameStore配線・feature gate)には一切着手していない。commit/tag/pushは行っていない。

**Suu_mot3のG1a独立照合(初回差分)で要修正3点(P1〜P3)を受領、是正済み(同日、docs-onlyではなくtest/production両方の是正)。** P1(recipeKeyのversion契約違反): `recipeKey.ts`が`carConfig.gearReflectedInertiaKgM2`をG3まで含めず「G3でversion 1→2」とした設計が、計画v12 §13.2の10項目目exact設計+R2確定裁定「RECIPE_KEY_VERSIONは1のまま最終形で開始」に反していた——是正: RECIPE_KEY_VERSION=1を維持したまま、局所的な互換view型(`CarConfig & {readonly gearReflectedInertiaKgM2?: number}`)でG1a時点から10項目目を`?? 0`で読み込む形へ修正し、「G3でversion変更」という注釈は削除した(CarConfig本体はG3まで無改修のまま)。P2(RunSnapshot version負例不足): contractVersion不正値のテストが2のみだったため、`it.each([1,2,4])`で3値すべてがexact `{ok:false,reason:'unsupportedContractVersion'}`になることを固定した。P3(recipeKey validator負例の判定精度): 空文字・非envelope・数値・欠落の負例テストが`ok:false`のみを確認しreasonを検証していなかったため、全負例で`reason==='invalidSchema'`+実装のdetails文言をexact固定するテストへ強化した。是正後、`npm run test -- --run`全件成功・`npm run build`成功・`npm run lint`成功・`npx tsc -p tsconfig.material-sweep.json`成功・`git diff --check`クリーン・`cmp AGENTS.md CLAUDE.md`差分なしを再確認済み。

**2026-08-15、Suu_mot3がP1〜P3是正を独立再実測のうえG1aを正式通過と宣言した。** 確認事項: recipeKeyはRECIPE_KEY_VERSION=1維持・G1a時点からCarConfig 10項目目を`?? 0`で包含・G3でのversion変更記述が残っていないこと(改訂履歴の是正史記述のみ残存)、RunSnapshotの不正contractVersion(1/2/4)全てがexact `unsupportedContractVersion`で拒否されること、recipeKey raw validatorの空/形式不正/数値/欠落がexact `invalidSchema`+details文言で固定されていること、D06/D09最小shape assemblerがproduction呼出し・event発行を伴わない段階実装として受理されG3/G4での原子的拡張という不変条件が維持されていること。Suu独立再実測(test 70ファイル/1447テスト・build 791.23kB/gzip 221.31kB・lint・material-sweep tsc・diff check・cmpすべてPASS)も一致を確認。**次はG1b(brabit所有、gameStore production配線を`productionWiringEnabled=false`の下で実装)が解禁された。alice_mot3の役割はG1bのAPI支援・照合のみであり、G1c/G2以降の実装には進まない。**commit/tag/pushは引き続き禁止。

- 改訂16(2026-08-16、arbiter補足裁定〈HB-DEC-011ケースA、production config出典分裂〉受領+docs-only先行是正、Suu_mot3指示): G1b着手時に発覚したgameStore(V2 raw config)↔素材個体(EquipmentLoadout/PlayerInventory)間の橋渡し契約欠落(2026-08-15発覚)について、alice_mot3作成の`docs/phase3-p3-4-production-config-source-review-request.md`(Suu_mot3のP1〜P3追補指示を経て完成)へarbiter_mot3が補足裁定(HB-DEC-011ケースA)を下した。**P3-4-S1〜S10・P3-4-N1〜N3**エントリ(本改訂の直前に新設)へQ1〜Q8裁定・条件S-1〜S-10・負例仕様N-1〜N-3・依頼書実査への矛盾指摘4点・判定文§8モデル訂正(参加直後にclaude-fable-5へ切替、人間PM申告・人間PM確認済み「判定はFable 5変更後に作成」・再レビュー不要)を記録した。Suu_mot3の指示により、alice_mot3が以下のdocs-only先行是正を実施した: (1) `docs/phase3-p3-4-production-config-source-review-request.md`へ指摘1〜4を「arbiter補足裁定による訂正」として履歴を消さず追記(§1.1の「2箇所」を8系統+subscribeへ、§1.5へ既存半確定契約の反映、候補(a)原文のchassis.baseMassG採用撤回+Q4確定式への置換、EquipmentDestructionContext独立resolver不存在の訂正)、および§11(受領記録)の新設。(2) `docs/phase3-p3-4-human-reapproval-bundle.md`へ項目P(G1a′一式、未承認)を追加、A〜O既承認は変更なしと明記。(3) 本エントリ(P3-4-S1〜S10)の新設。**engine計画をv12からv13へ改訂し(`docs/phase3-p3-4-plan.md`)、S-6(二層命名`rawPlayerConfig`/`materialComposedBase`を§12・§13.1・§13.2・§14.2へ反映)・S-7(C-4最終DoDを§20.6・§22へ反映)・G1a′ゲート新設(§3.1)・resolver設計(§4.4)・baseline単一出典確定式(§12)・§20.8(補足裁定Q1〜Q8+S-1〜S10+N-1〜N3の全文、本裁定の正準参照)をいずれも反映済み。UI計画(`docs/phase3-p3-4-ui-plan.md`)側の反映は次工程(brabit所有)。** **人間再承認は必須(項目P、未承認)。materialMapping.tsのdocstring精密化を含むproduction/test実装は一切行っていない(G1a′実装・G1b以降・commit/tag/pushは禁止継続)。**

**Suu_mot3独立照合(初回)で要修正9点を受領、是正済み(同日、docs-onlyのまま)。** (1)G1aの誤った特徴づけ(「EquipmentDestructionContext解決純関数」)をengine計画冒頭状態・§3.1ゲート表・人間再承認バンドル冒頭状態・依頼書HEAD/PRESENTED節の4箇所で「型定義+呼び出し側正規化のdocstring契約、独立resolverはG1a′で新設」へ訂正。(2)engine計画§20.5の見出し・運用文をA〜Pへ更新(A〜O=既承認・再承認不要、P=新規未承認を明確に分離)。(3)§3.1 G1b行の着手条件を「G1a′完了+Suu照合通過+項目P承認後」へ明記。(4)§20.8 S-7の自己矛盾(「§22は次工程」)を「§20.6・§22ともv13で反映済み」へ訂正。(5)§14.2の時系列矛盾(「G1a′実装前のG1bでは…」という存在しない中間経路の記述)を削除し、G1b開始時点で段1は最初から完成形(1a〜1e)である旨へ一本化。(6)本台帳・依頼書§11・バンドルP項目の相互参照を、engine計画§20.8を条件S/負例N全文の正準参照、依頼書§11を受領履歴、バンドルPを承認範囲の説明、と役割分離。(7)判定作成モデルの記述を最終確定形「判定作成モデル: claude-fable-5(人間PM確認済み)。起動時system prompt表示: claude-sonnet-5(履歴として記録)。」へ統一(暫定表現「Fable 5だった可能性が高い」等は後続PM確認により上書きされた履歴として明記)。(8)本改訂16の「engine計画v12次版への反映は未着手」という記述を、実際にはv13で反映済みという現状と整合させた(上記段落へ反映)。(9)人間承認文を判定文§9と一致させ、バンドル末尾を「補足裁定判定文全体（Q1〜Q8・S-1〜S-10・N-1〜N-3）と項目Pを承認します。」の単一定型文へ変更(A〜Oは既承認で変更なし)。併せて依頼書の候補節番号の誤記(「§3(候補(a))」→正しくは「§5(候補(a))」)を訂正した。

**【注記(2026-08-16、改訂17時点で追記)】** 上段(改訂16冒頭段落)の「人間再承認は必須(項目P、未承認)」は、9点是正着手時点(同日、人間承認到達前)の状態を記録した歴史的記述であり、書き換えていない。実際の承認到達・発効は下記**改訂17**を参照。

- 改訂17(2026-08-16、人間PM承認到達+補足裁定発効+承認状態同期是正、Suu_mot3指示): 上記9点是正の完了報告とほぼ同時に、人間プロジェクトリードが次の単一定型文で明示承認した(Suu_mot3が全文中継、Suu_mot3が独立照合済み): 「補足裁定判定文全体（Q1〜Q8・S-1〜S-10・N-1〜N-3）と項目Pを承認します。」。これにより判定文§9の効力発生条件(人間承認)が充足され、**補足裁定判定文全体(Q1〜Q8・条件S-1〜S-10・負例仕様N-1〜N-3)と人間再承認項目Pはいずれも発効した**。S-10(「人間再承認P〈Q8〉の承認を得るまでG1a′の実装〈docs以外〉に着手しないこと」)はこれにより充足され、G1a′の実装着手条件のうち人間承認の要件は満たされた。Suu_mot3の指示により、alice_mot3が承認状態をdocs-onlyで現状化した: (1) engine計画(`docs/phase3-p3-4-plan.md`)の冒頭状態・§3.1 G1a′行・§20.5運用文/P項目・§20.8発効条件・§22人間承認P行の「P未承認」「本書時点で未承認」をすべて承認済み記述へ更新(v13のまま、版数は変更なし)。(2) 人間再承認バンドル(`docs/phase3-p3-4-human-reapproval-bundle.md`)のタイトル・状態行・P節・末尾の「承認いただきたい範囲」を「承認記録」へ改題し、人間が実際に送った定型文を全角括弧を含めverbatim記録した。A〜O既承認は変更なし。(3) 本改訂17として承認日時・定型文・判定発効・S-10充足を記録し、改訂16の過去時点の「未承認」記述は上記注記のとおり書き換えず履歴として保存した。(4) 依頼書(`docs/phase3-p3-4-production-config-source-review-request.md`)§11の「本書時点では承認済みと記載しない」は提出時点の状態を保存する記述として維持し、現状は本改訂17を参照する旨の注記を追加した(現行状態としての誤読を避けるため)。**残条件**: G1a′実装(docs以外)・G1b以降は、Suu_mot3による本承認状態同期のdocs-only是正への最終照合通過まで、引き続き未着手。production配線・feature gate切替・commit/tag/pushは引き続き禁止。

- 改訂18(2026-08-16、Suu_mot3が承認状態同期是正を独立照合しG1a′実装を解禁→alice_mot3がG1a′実装(resolver・baseline構築関数)→Suu_mot3レビュー3ラウンド(P1〜P3是正・精度追補)→G1a′完了条件の循環発見→arbiter追加裁定Q9→人間承認、の一連の経緯を記録、Suu_mot3指示): Suu_mot3が承認状態同期(改訂17)を独立照合し、engine計画v13+本台帳改訂17+再承認バンドルPのdocsゲートを正式通過とした。これによりG1a′(resolver・production baseline単一出典関数・S-4構造監査・N-1〜N-3負例)の実装が解禁され、alice_mot3が`src/store/runOutcomeApplication.ts`へ`deriveMaterialSelectionFromEquipment`(Q1・Q2)・`resolveProductionMaterialCompositionBaseline`(Q4)を新設、`src/materials/materialMapping.ts`のdocstring精密化(Q1・Q2、`EquipmentDestructionContext`正規化主体の記述)、`src/store/__tests__/runOutcomeApplication.test.ts`へ新規テスト12件(resolver3件・baseline検証6件・N-2前半1件・S-4構造監査3件)を実装し報告した。Suu_mot3の初回targeted照合で要修正3点(P1: baseline関数内での`resolveGarageBuild`再呼出しがQ3/Q4「同一の単一呼び出し結果」契約に反する、P2: S-4監査がALLOWED_CALLERファイルを丸ごと除外し関数外の不正呼出し・`.tsx`ファイルを見逃す偽陰性を持つ、P3: N-2前半の負例が`ok:false`のみでexact reasonを固定していない)を受け、alice_mot3が(1)baseline関数のシグネチャを`(rawPlayerMotorConfig, garageSelection)`から`(rawPlayerMotorConfig, garageBuild: GarageBuildResult)`へ変更し内部での`resolveGarageBuild`呼出しを排除、(2)S-4監査を波括弧対応によるS-3関数本体スコープ限定+`.ts`/`.tsx`双方走査へ改修(N-3検出力確認を「同一ファイル内・関数外」「別`.tsx`ファイル」の2ケースで実施しいずれも赤へ転じることを確認、一時注入は`diff`で完全一致を確認のうえrevert)、(3)N-2前半のexact reason(`'baseline+deltaが既存clamp範囲[80,250]gを外れました: 10'`)固定、をいずれも是正し独立再実測(test 70ファイル/1461テスト・build・lint・material-sweep tsc・diff check・cmp)込みで報告、Suu_mot3のtargeted確認で通過を確認した。続けてSuu_mot3の精度追補指摘(`GarageBuildResult`型を手書きshapeから`ReturnType<typeof resolveGarageBuild>`参照へ、過大な「型レベルで同一呼び出し結果を強制する」というコメントの是正)も反映・確認された。この過程で、Suu_mot3のtargetedレビューがengine計画v13 §20.8「条件S-1〜S-10全充足後にG1a′完了」と§3.1「beginRunActionへの配線はG1b、G1bはG1a′完了後」の**循環**(S-5・N-2後半がbeginRunAction統合を要求するが、その統合自体がG1b以降にしか行えないためG1a′単体では原理的に充足不能)を発見した。alice_mot3・Suu_mot3は独断で先送りせずarbiterへ追加裁定(Q9)を依頼して停止し、arbiterが**P3-4-Q9**(直前エントリ、§0起草側欠陥の自己申告込み)を裁定、人間プロジェクトリードが2026-08-16、定型文「P3-4追加裁定Q9判定文全体（S-5/N-2後半のG1b移管および項目P追補P-1を含む）を承認します。」で明示承認した(Suu_mot3中継確認済み)。**Q9は発効した。** これを受け、alice_mot3がdocs-onlyで以下を反映した: (1) engine計画をv13からv14へ改訂し(`docs/phase3-p3-4-plan.md`)、§20.8の完了条件をS-1〜S-4・S-6〜S-10+N-1・N-2前半・N-3へ限定(S-5・N-2後半除外)、S-5本文へG1b移管+G1a′での純関数性先取りを追記、新設§20.9へQ9判定文全文(§0起草側欠陥含む)を収録、§3.1 G1b行・§22 DoD表へS-5の3失敗経路×4不変項目・N-2後半・runSequence構築順・alice+brabit共同/C-4同時充足を追加。(2) 本台帳へ**P3-4-Q9**エントリ(全文)を新設(直前参照)。(3) 人間再承認バンドル(`docs/phase3-p3-4-human-reapproval-bundle.md`)の項目Pへ「追補P-1」として一体記録(新規独立項目化はしない)。**残条件**: G1a′の完了条件(改訂後のS-1〜S-4・S-6〜S-10+N-1・N-2前半・N-3)充足のうち、Q9が新たに要求する純関数性固定テスト(resolver・baseline構築関数・composeが副作用を持たないこと)の実装はまだ着手していない——次工程。G1b配線・feature gate・commit/tag/pushは引き続き禁止。

- 改訂19(2026-08-16、G1a′純関数性テスト実装→Suu_mot3レビュー(P4〜P8是正)→G1a′正式通過、Suu_mot3指示): alice_mot3がG1a′純関数性テスト(resolver・baseline構築関数・composeの3関数について、store/localStorage等非参照の構造検査+引数非破壊+同一入力同一出力を固定)を実装し報告したところ、Suu_mot3レビューで4点(P4〜P7)を指摘された。**P4**: 台帳P3-4-Qエントリ・engine計画§20.9が「全文」を称しながら見出し改変・§2(ii)圧縮・実装済み/承認済み注記混入を行っていた——台帳のP3-4-Q9エントリを受領原文の無改変引用ブロック(`>`)へ改め、実装状況・人間承認・Suu確認は引用の外の後続注記へ分離し、engine計画§20.9は「全文」の主張を撤回して「自己完結反映」へ見出しを訂正した。**P5**: engine計画§3.1 G1a′行・`runOutcomeApplication.test.ts`のN-2前半直後コメント・冒頭/バンドルの「純関数性テストの実装+Suu照合待ち」という読解可能な曖昧表現(実装未完とも読める)を、それぞれ現状(実装済み)へ更新した(改訂履歴内の歴史的記述である改訂18は書き換えていない)。**P6**: 既存N-1負例(resolverのsourceWireMaterialId=null失敗)・N-2前半負例(composeのbaseline=10失敗)へ、失敗分岐でも入力非破壊+同一入力同一出力が成立することを固定するassertを統合した(純関数保証は成功分岐だけでなく関数全体が対象であるため)。**P7**: `extractNamedFunctionBody`(構造検査の本体抽出ヘルパー)の抽出範囲自体が正しいことを固定する恒久回帰テスト(各対象関数の抽出本体が既知トークン——derive: `sourceWireMaterialId`/`findNarrowedInventoryItemById`、baseline: `resolveChassisBaselineG`、compose: `computeWireMagnetMassAdjustmentG`——を含むことをassert)を新設し、禁止パターン集合を個別store名列挙から`use*Store`一般形+`.getState`/`.setState`/`.subscribe`の汎用アクセスパターン、`Date.now`/`Math.random`/`performance.now`/`crypto`、`process`一般形(env限定を撤回)へ拡張した。検出力確認(`useFooStore.getState()`+`Date.now()`の一時注入→red確認→`diff`で完全一致確認のうえrevert)込みで独立再実測(targeted 2ファイル/240テスト、全体70ファイル/1470テスト・build・lint・material-sweep tsc・diff check・cmp)を報告、Suu_mot3のtargeted確認で通過を確認した。続けて**P8**: 台帳の引用ブロック先頭に、受領原文の見出し行「【arbiter_mot3 追加裁定判定文Q9: S-5/N-2後半のゲート循環解消】」が1行欠落していたことが指摘され、verbatimで補完した。2026-08-16、Suu_mot3がP4〜P8を独立照合し、**G1a′を正式通過と宣言した**(確認証跡: Q9原文がagmsg履歴と台帳引用が見出しを含め一致、targeted 2ファイル/240件PASS、全体70ファイル/1470件PASS、build/lint/material-sweep tsc/diff-check/cmpすべて成功、resolver N-1・compose N-2失敗分岐の非破壊/決定性・3関数の構造純関数検査・抽出範囲回帰・禁止集合拡張・一時注入残存なしを確認)。**G1a′のproduction/test追加編集はここで終了した。次工程はdocs-onlyでのengine計画/台帳の現状更新(本改訂で反映)+brabitのUI計画Q9同期に必要なengine契約情報の提供。G1b production/test・feature gate・commit/tag/pushは、UI計画側のSuu_mot3クロスレイヤ照合通過まで引き続き未解禁。**

- 改訂20(2026-08-18、arbiter追加裁定Q10〈G1b beginRunActionのクロスストア原子的境界〉+§8補足裁定〈`validateMaterialComposedBase`設計確定〉の実反映、Suu_mot3指示): **P3-4-Q10**エントリを新設し、本裁定§1〜§9(A1・A2不採用→A3採用、必須修正2点〈`try/catch`+runtime専用3フィールドの明示nullリセット〉、`snapshotCaptureFailed`新設と契約(a)対象外としての位置づけ、trusted narrowing案(i)、§6.4.1既存generic行の改称条件、P16/P17/P18承認、runKind/context整合assertionの要修正、新規public契約の全件再承認、docs反映先はUI計画のみ)と§8補足裁定(配置`recipeKey.ts`承認、27エントリ十分性証明のarbiter独立再計算、`effectiveTurnsRatio`のResult拒否承認と`encodeRecipe`との機構差の理由、collector非export承認、所有分担承認、**P-Q10-A3の人間再承認バンドルからの除外を条件とする**〈P3-1-Q2・P3-1-Q7の先例と同型〉、P-Q10-A5確定文言、§8ブロッキング指摘の設計上解消判定、G1b着手前の追加条件4点)を条件文を省略せず全文収録した。**A3の配置判断(`materialMapping.ts`ではなく`recipeKey.ts`)は、人間再承認バンドルからは除外され本台帳の裁定記録にのみ残る。** 反映先: `docs/phase3-p3-4-ui-plan.md` v13・`docs/phase3-p3-4-human-reapproval-bundle.md`(項目Q)。engine計画v14は相互参照のみで実体的変更なし。**G1b production/test・feature gate・commit/tag/pushは、項目Qの人間再承認+`validateMaterialComposedBase`のalice実装完了報告+Suu_mot3明示解禁まで引き続き未解禁。**
- 改訂21(2026-08-18、人間プロジェクトリードによるQ10本裁定・§8補足裁定・項目Qの正式承認、Suu_mot3指示): `P3-4-Q10`エントリ末尾へ**【後続注記(2026-08-18、人間承認到達)】**を追加し、承認定型文の原文・受領時刻(2026-08-18T10:22:21Z、Suu_mot3中継確認済み)・効力発生条件の充足を記録した。**これによりQ10本裁定(§9)・§8補足裁定はいずれも発効し、人間再承認バンドル項目Q(brabit担当分の新規公開契約+alice担当分P-Q10-A1・A4・A5)の再承認も完了した。** あわせて`docs/phase3-p3-4-human-reapproval-bundle.md`(項目Qを承認済みへ更新+承認記録へ原文追記)・`docs/phase3-p3-4-ui-plan.md`(§1項目Q・§17着手条件・末尾手続き注記を承認済みへ現状化)・`docs/phase3-p3-4-q10-decision-proposals.md`(冒頭状態を承認済みへ、提案/未承認表記を履歴として区別)を同期した。**裁定原文・履歴本文は一切改変していない。残るG1b着手条件は、aliceの`validateMaterialComposedBase`実装+指定テスト(#4・#5)の全文出力・終了コードを伴う完了報告と、Suu_mot3のG1b明示解禁指示の2点のみ。** production/test実装・feature gate・commit/tag/pushはいずれも未実施。
- 改訂22(2026-08-18、arbiter追加裁定Q11〈RunSnapshotとlive開始入力の単一出典+finishAssemblyの原子的境界〉の反映、brabit_mot3起草): `P3-4-Q11`エントリを新設し、Q11-1〜Q11-6・Q-R1〜Q-R4・独立報告I-1を条件文を省略せず全文収録した。**arbiterは依頼文の指摘を鵜呑みにせず固定入力の実コードで独立確認し、4件の不一致(motor初速・test-run vehicleState出典・seed/RNGアルゴリズム・finishAssembly順序)すべてを事実と認定した。** 特にQ11-1は依頼した2候補をいずれも不採用とし第3案(REST_STATE+omegaのみ置換、`initialOmega`を腕へ追加)を裁定、Q11-3はseed単一出典化だけでは足りずRNGアルゴリズム(xorshift対mulberry32)の正典化が必要と指摘した。UI計画はv13→v14へ改訂済み(§6.5.4・§6.5.7新設・§6.5.8新設・§23 DoD 28〜34)。**Q-R1〜Q-R4の人間再承認+Suu_mot3照合まで、P9/P13/P17に対応するG1b実装は停止を継続する。** production/test実装・commit/tag/push・feature gate true化はいずれも未実施。
- 改訂23(2026-08-18、人間プロジェクトリードによるQ11裁定・Q-R1〜Q-R4の正式承認、Suu_mot3指示): `P3-4-Q11`エントリ末尾へ**【後続注記(2026-08-18、人間承認到達)】**を追加し、承認定型文の原文・受領時刻(2026-08-18T14:57:08Z、Suu_mot3中継確認済み)・効力発生条件の充足・Q-R1/Q-R2の依存閉包実測結果を記録した。あわせて`docs/phase3-p3-4-ui-plan.md`をv13→v14へ改訂(§6.5.4 pseudocode・§6.5.7 live初期化規則・§6.5.8 finishAssembly順序とS-5適用範囲・§6.5.9 依存閉包・§23 DoD 28〜34・§1追補Q-R1〜Q-R4の承認記録)、`docs/phase3-p3-4-human-reapproval-bundle.md`へ項目Q追補(Q-R1〜Q-R4)を追記した。**独立報告I-1(実験ノートのconfig出典曖昧性)はQ11の裁定範囲外であり、未裁定・後続ルーティング待ちとして独立に保持する(本台帳では裁定として扱わない)。** P9/P13/P17のコード実装はSuu_mot3の文書照合・明示解禁まで停止継続。commit/tag/push・feature gate true化はいずれも未実施。

- 改訂24(2026-08-19、P3-4 G4 D09較正の再較正〈到達不能の是正〉、人間承認済み、Suu_mot3指示): G4(D09軸受焼付き状態機械)の実装後、§17.3の既存候補値(`highLoadHighSpeed.loadTorqueThresholdNm = 0.2` N·m、車軸`rpmThreshold = 3000`、`bearingSeizureGaugeLimit = 1.0`)が**production-valid構成では構造的に到達不能**であることをalice_mot3のread-only sweepが実測した。閾値2値だけの再較正では解決不能であることも併せて反証済みである(D09のゲージ入力式において2閾値はいずれも入力の単調非増加パラメータであり、閾値0〈validatorが拒否する値〉が入力の上限。その最良ケースでも到達ゲージは0.394〈実ループ〉にとどまり、limit 1.0に届かない)。人間プロジェクトリードは、まず`bearingSeizureGaugeLimit`を追加対象としたread-only有限sweepを承認し、続いて提出された有限バンドルを次の定型文で承認した(Suu_mot3中継確認済み): 「D09 G4再較正の有限バンドルを承認します。loadTorqueThresholdNm=0.005 N·m、rpmThreshold=400 rpm、bearingSeizureGaugeLimit=0.15をproductionへ反映してください。熱係数・入力式・公開契約は変更せず、feature gate=falseを維持し、G5以降・commit・tag・push・default true化は禁止します。」。**実測根拠(すべてproduction経路〈`resolveGarageBuild`→`resolveProductionMaterialCompositionBaseline`→`composeConfigFromMaterials`〉での測定であり、test-only上書き値は確定証跡に含まない)**: 下限側はNORMAL_OPERATION基準構成×実在5コース×全3電池の15組合せで到達ゲージが厳密に0(通常運用の包絡線は最大|loadTorqueNm| 0.003464 N·m・最大車軸rpm 309.6で、閾値の下余裕はトルク1.44倍・rpm 1.29倍)、金属接触経路(チタン)15組合せは別枠測定で最大ゲージ0.059694(limit 0.15に対する安全余裕2.51倍)、いずれも全件`finished`・D09発火0件。上限側は攻めたproduction-valid構成288組合せ中66件が`triggered:true`へ到達(62件は`finished`終端でstalled優先ではない)、到達ゲージ上限はPOM 0.252160(上余裕1.68倍)・チタン 0.570387(3.80倍)。AND両辺成立はPOM(金属経路なし)の**攻め構成144組合せ**〈288組合せのうちPOM側半分〉で発火した**12件すべて**で確認した(承認用有限バンドル§4が報告した「24組合せ中6件」は、より狭い母数〈garage `gearId:'fast'`固定・コース2種〉での測定であり、再測でも同一の6/24を再現している。両者は母数の違いであって値の不一致ではない)。代表構成でtrigger step 243(t=2.0250 s)・causeLogの`temperature.ratio`と`bearingHeatGaugeRatio`一致・`metalGearContactActive:false`/`highLoadHighSpeedActive:true`を固定。決定論(同条件2回の完全一致)、終端順序(stalled構成でD09@197がstalled@785に588 step先行し、§7.9の受入条件を充足)も実測した。帰還の定量化(C-9)ではD06→D09の寄与0.000000、D09自己帰還は+1.34%(別構成では−9.1%)で**自己制限的**であり発散方向の正帰還は観測されなかった。**変更したのは`src/materials/materialMapping.ts`の既存3定数の値のみで、熱係数(0.25/0.5)・入力式・condition type・`metalGearContactAlways`・deltaFraction・公開型/シグネチャはいずれも不変。過剰設計防止条件に従い、新モデル・新係数・新状態・新公開契約・素材別分岐の追加は0件である。** 所有範囲のpin testは`src/materials/__tests__/materialMapping.test.ts`へ必要最小1件のみ追加した。**`loadTorqueThresholdNm = 0.005` N·mがD06のPOM閾値`GEAR_STRENGTH_THRESHOLD_NM['gear-pom'] = 0.005`と同値であるのは、共通の`loadTorqueNm`スケール上で独立に較正した結果の偶然の一致であり、D06値への参照依存ではない**(D09側は通常運用包絡線0.003464 N·mに対する下余裕1.44倍から決めており、D06側の値を参照していない。将来どちらか一方だけを変更してよい)。 **本値はG4暫定較正であり、G5最終較正を先取りするものではない(Q15-1恒久規則により最終確定はG5較正sweep+人間commit承認を要する)。** feature gate=falseを維持し、G5以降・commit/tag/push・default true化はいずれも未実施。

- 改訂24-補(2026-08-19、改訂24の証跡区分の事実訂正、Suu_mot3指示): **承認済み3値(0.005 N·m / 400 rpm / 0.15)・受入条件・人間承認原文はいずれも不変であり、本補記は証跡の区分を正すものである(人間再承認は不要)。改訂24の本文・数値・承認原文は履歴として一切削除・書き換えていない。** 訂正内容は2点。(1)**改訂24が挙げた測定値(step 243、POM 12/144、同6/24、攻め66/288、到達ゲージ0.252160/0.570387等)は、production素材写像〈`resolveGarageBuild`→`resolveProductionMaterialCompositionBaseline`→`composeConfigFromMaterials`〉で組み立てたconfigを使う、engine層のno-noise harness(`stepTestRunWithDestruction`/`stepTrackRunWithDestruction`を経由せずstepTrackRun+advanceDestructionStateを直接回す自前ループ、RNG=`()=>0.5`固定)の証跡であり、production入口〈`startCourseRun`→`stepCourseRun`〉の証跡ではない。** 改訂24本文の「production経路」は**構成組み立ての経路**を指しており、走行入口を意味しない(誤読を招く表現であったため本補記で明示する)。wrapper非経由のためD09発火後も走行が継続する点(改訂24が記した「finished@471」)も、production wrapperがD09で`destructionTerminal`として閉じる挙動とは一致しない。A/B実測により、**DestructionConfigの差(ゲート5 harness config対production写像config)は結果に一切影響せず、RNGの差だけが結果を反転させる**ことが確認されている(定数RNGではゲージ0.252160・step 243発火、正典run RNG〈mulberry32〉ではゲージ0・stalled@315)。(2)**正典run RNGでの再測定結果**: NORMAL_OPERATION(POM)5コース×3電池×3 seed=45走行で発火0件・最大ゲージ0、NORMAL_OPERATION(チタン、金属接触経路)45走行で発火0件・最大ゲージ0.059694(定数RNG測定と同値)、攻め構成はPOM 6/576・チタン 87/576が発火。**両側拘束(通常運用非発火/攻め構成での有限到達)は正典RNGでも維持されている。** さらに**production入口(`startCourseRun`→`stepCourseRun`)でのPOM正例**を実測した: hill-climb / garage{`chassisId:'standard'`, `gearId:'fast'`, `wheelId:'large'`, `tireId:'standard'`} / gear-pom・magnet-neodymium・battery-lithium-polymer・brush-precious-metal / `coilTurns:15`・`magnetDistanceMm:2`・`brushPressure:0.2`・`sandingQuality:0.9` → **closedStep 333・`endReason:'destructionTerminal'`・`terminalModes:["D09"]`・`performApplyRunOutcome` exact 1回・`metalGearContactActive:false`/`highLoadHighSpeedActive:true`・`bearingHeatGaugeRatio` 0.15030281668535994・degradationDiffsに`{role:'gear',kind:'seizure',deltaFraction:0.15}`と`{role:'bearing',kind:'seizure',deltaFraction:0.2}`の両方**。なお改訂24の時点でPOMがproduction入口で「非発火」と観測されたのは測定上の取りこぼしであった——**D09発火stepでrunが`destructionTerminal`として閉じ、同一stepで`_runAccumulator`が`null`になるため、accumulatorを毎step読む観測ループは発火を読む前に終了する**(最後に読めるゲージは発火直前値0.1498前後となり「上限0.15に頭打ち」に見える)。`performApplyRunOutcome`のspyでoutcomeを捕捉すると発火が観測できる。本補記による変更は本追記と`src/materials/materialMapping.ts`のコメント精密化のみで、**新規の設計判断・定数・テストの追加は0件**である。

- 改訂25(2026-08-19、P3-4 G5較正sweep〈正典run RNG・production wrapper〉の照合結果、人間承認済み、Suu_mot3指示): **結論——D06・D09の既存承認済み較正値をすべて維持し、変更対象は0件である。** 人間プロジェクトリードは次の定型文で承認した(Suu_mot3中継確認済み): 「P3-4 G5正式通過判定（正典run RNGおよびproduction wrapperによる有限sweep、D06・D09の全受入条件充足、既存較正値全維持・変更対象0件、1828テスト・build・lint成功、過剰設計防止条件を含む）を承認し、G5照合結果の台帳追記のみを承認します。feature gate=falseを維持し、G6以降・commit・tag・push・default true化は禁止します。」。**測定条件(証跡区分)**: 走行入口は**production wrapper `stepTrackRunWithDestruction`**(destructionTerminal処理込み。それ以外の物理終端はgameStoreと同じくharness側がstatusで閉じる)、構成組み立ては`resolveGarageBuild`→`resolveProductionMaterialCompositionBaseline`→`composeConfigFromMaterials`→`assembleDestructionConfig`のproduction写像(test-only上書きなし)、RNGは**`createRunRng`の正典run RNG(mulberry32)のみ**(改訂24-補が区分したRNG=0.5のno-noise harnessは本sweepでは不使用)。seedは`0x11111111`/`0x22222222`/`0x33333333`の3種。攻め構成576構成中**288構成でseed間の結果が相違**し、RNGが実際に作用していることを確認した(残り288構成は発火・終端がノイズに対しロバスト)。**母数**: D09 NORMAL_OPERATION=4素材×実在5コース×全3電池×3 seed=**180走行**、D06発火構成(ct150)=4素材×3 seed=**12走行**、D09攻め構成=4素材×3コース×ギヤ2×車輪2×タイヤ2×coilTurns3種×brushPressure2種×3 seed=**1728走行**、C-9対照=6走行、9歯+seizure最大=噛合位相41点sweep+実走行1本。**D09の受入結果**: (i)NORMAL_OPERATION非発火——180走行すべて`finished`・破壊イベント0件・D06歯欠け0本、D09最大ゲージは樹脂3種で0・チタン(金属接触経路)で0.059694(`bearingSeizureGaugeLimit`=0.15に対する安全余裕**2.51倍**)。(ii)攻めproduction-valid構成での有限到達——1728走行中**105件が`triggered:true`到達**(POM 12/PA6 12/PEEK 12/チタン 69)、**樹脂ギヤの発火は全件AND両辺成立**(`metalGearContactActive:false`かつ`highLoadHighSpeedActive:true`)。最早発火はチタンのstep 204(gauge 0.151524)、樹脂正例はPOMのstep 333(gauge 0.150303、brabit_mot3のG4 fixtureと同一値で再現)。(iii)stalled競合(§7.9)——**発火105件すべてが`endReason:'destructionTerminal'`・`terminalModes:["D09"]`で閉じ、D09到達前にstalledで閉じたものは0件**。(iv)C-9自己帰還——終端時点の軸摩擦増加は**0.015030**(`D09_AXLE_FRICTION_INCREASE_PER_GAUGE`=0.1×ゲージ0.15の理論値と一致)、**D06→D09帰還の寄与は0.000000**(D09発火が1本目の歯欠けより先行するため)、発散方向の正帰還は観測されなかった。**D06の受入結果**(hill-climb/garage{fast,large,standard}/neodymium・LiPo・貴金属ブラシ/ct150・md3・bp0.2・sanding1.0): 素材順序はPOM **4.5667秒**(step 548)< PA6 **5.8667秒**(704)< PEEK **7.2167秒**(866)< チタン(nonBreakableで発火なし、finished@2685)で**閾値の大小と完全に一致**、1本目の歯欠けは**全素材が0.5〜10秒の範囲内**、全損の段階性はPOMで歯欠けstep`548,743,902,1033,1141,1241,1323,1380,1416,1433`(間隔195→159→131→108→100→82→57→36→17と単調短縮=加速)を経て10本全損で`destructionTerminal ["D06"]`、3 seedすべてで一致。**9歯損傷+seizure最大の数値安定(§9.3 D5)**: 契約1′下限(base eta 0.42)へ9歯損傷+ゲージ1.0を重ねた最悪ケースを噛合位相41点でsweepし、`gearEfficiency`∈**[0.040110, 0.042000]**(全点で正の有限値かつbase以下、計画§9.3の予測`eta_effective≈0.042`と一致)、`axleFriction`=**0.100000**(全点一定・[0,1]内)、同configの実走行でも速度サンプルが全点有限で発散・数値振動なし(登坂で後退→停止という物理的に妥当な挙動)。**D06–D09共存**: 3件(代表はPOM/ct20でstep 341に`terminalModes:["D09"]`終端、その時点で歯欠け1本。degradationDiffsはgear/toothLoss(1)+gear/seizure(0.15)+bearing/seizure(0.2)が並立)。**上下拘束の余裕(現行値)**: D09 limit 0.15←通常運用最大0.059694(2.51倍)、D09トルク閾値0.005 N·m←通常運用最大0.003464 N·m(1.44倍)、D09車軸rpm閾値400←通常運用最大309.6(1.29倍)、D06閾値(POM 0.005/PA6 0.00726/PEEK 0.0079 N·m)・曝露0.01←通常運用で歯欠け0本かつ1本目4.57〜7.22秒。**申し送り(値変更の提案ではない)**: 非発火runの最大ゲージが0.14571に達し、limit 0.15との比は1.03倍である。これは閾値近傍の連続性による当然の帰結で、安全性の指標は通常運用側の2.51倍だが、将来コース・素材を追加する際に「意図せず発火する構成が増える」方向へ動きうる点を記録しておく。**過剰設計防止条件の遵守**: 新モデル・新係数・新状態・新公開契約・素材別分岐の追加は0件、production定数・公開契約・恒久テストの変更も0件、一時probeはsweep終了時に削除済み(`git status`にtmp-probeなし)。検証は`npm run test` **1828 passed / 1828(失敗0件)**・`npm run build`成功・`npm run lint`成功・`git diff --check`成功・`cmp AGENTS.md CLAUDE.md`一致。**本改訂による変更は本台帳追記1ファイルのみで、feature gate=falseを維持し、G6以降・commit/tag/push・default true化はいずれも未実施である。**

## P3-4-G6: regressionDiff純データ配管の腕対応・J/K/LのG7繰越(arbiter追加裁定+人間承認2026-08-20)

**人間承認原文(2026-08-20)**: 「P3-4 G6追加裁定全文（regressionDiff腕対応・候補Aの純データ配管・J/K/L承認状態訂正・J/K同一migrationのG7繰越・docs追随・禁止事項を含む）を承認します。」

**確定事項**:

1. **regressionDiffの腕×metric対応**: `session`(motor-only)=`steadyRpm`(**全件**——完走の概念がないため状態で絞らない)/`courseRun`=`lapTimeS`(`elapsedTimeS`、**`status==='finished'`のみ**)/`vehicleTestRun`=`topSpeedMps`(samplesの`velocityMps`最大値、**`finished`かつsamples非空のみ**)。完走していない走行をbaselineへ混ぜない趣旨。
2. **候補A(純データ配管)をG6範囲とする**: module-level純関数による観測変換・legacy除外・同一`recipeKey` baseline抽出+単体テストまで。実装は`src/store/regressionObservation.ts`(brabit所有、新設)。`computeRecipeKey`は再計算せず、永続化済みrecordの`recipeKey`をそのまま読む(§13.1 exact transport契約3)。
3. **G7繰越**: `detectPerformanceRegression`の実呼出し・結果保持(runtime state)・表示/HUD。
4. **J/K/Lの承認状態の訂正**: UI計画§22-6の「人間再承認は別途要」は執筆時点の記述であり、**J・K・Lは2026-08-15の「A〜O、15件を再承認します。」に含まれ承認済み**。項目C(`NotebookExportV2`)と同型の記述残存だった。
5. **J/K同一migrationのG7繰越**: `InstrumentOwnership`(J)・`CodexRecordEntry`拡張(K)は同一`SCHEMA_VERSION` 1→2 migrationへ同梱するため、実装時期をG7へ揃える。G6で先行すると`SCHEMA_VERSION`を二度上げることになる。**G6では`SCHEMA_VERSION`は1のまま**。

**G7への申し送り**: `collectBaselineObservations`の当該run除外は**参照同一性**による——値が等しい別実体は落ちない。「保存済み記録を全件変換してから比較する」実装にすると当該runが自らのbaselineへ混入し、**本来検出すべき悪化を見逃す**。**変換前にrecord idで当該runを除外すること**。値ベース除外は正当な同値記録まで落とすため不採用。`RegressionObservation`へのrecord id追加は新規契約フィールドであり、必要が生じた場合のみG7で別途裁定を仰ぐ。この限界は`regressionObservation.test.ts`の2件で明示的に固定済み。

## P3-4-G7: HUD/演出/音・図鑑/検死・計測器店・a11y/bundleの実装記録(G7正式通過は未承認。人間承認済みはD06素材色の有限写像+正典入力候補Aのみ)

**本節の承認範囲(誤読防止)**: 2026-08-20時点で人間承認が及ぶのは、下記に原文を引用する**D06素材色の有限写像4件と正典入力候補A(spawn時焼き付けを含む)だけ**である。**G7全体の正式通過は未承認**であり、本節のその他の記載(実装内容・是正記録・bundle記録・§13-3 J7と§13-11に関するSuu_mot3判断)は実装・照合の記録であって人間承認を意味しない。G統合以降・commit・tag・push・default true化はいずれも未実施。

**人間承認原文(2026-08-20、D06素材色。この引用の範囲が人間承認の全部である)**: 「P3-4 G7-D D06素材色有限写像（POM=N6、PA6=W3、PEEK=W2、チタン=N4）および正典入力候補A（pendingRunEquipmentSnapshot→inventory、spawn時焼き付け）を承認します。」

**確定事項**:

1. **D06破片の素材色(有限写像)**: `gear-pom`=`N6` / `gear-nylon-pa6`=`W3` / `gear-peek`=`W2` / `gear-titanium`=`N4`。実装は`src/retro/destruction/gearMaterialColor.ts`(brabit所有、新設)。**既定色fallbackは置かない**——art-spec §6が「素材色」と定めている以上、別の色で出すことは違う情報の提示になる。解決できない場合はD06破片を発生させない。
2. **素材色の正典入力(候補A)**: `useSaveStore.pendingRunEquipmentSnapshot`(`EquipmentIdSnapshot`のvehicle腕)の`gearItemId` → `inventory.items`のfamily `'gear'`個体の`materialId` → 上記写像。**run開始時に固定される値**を使い、生きた`equipmentLoadout`は読まない(走行中の装備変更で破片の色が変わらないようにするため)。新規engine公開型・`RunSnapshot`拡張・`recipeKey`文字列parseはいずれも行わない。素材アイコン(`retro/shop/materialIcons.ts`)も無変更。
3. **spawn時焼き付け**: 解決した`PaletteKey`は`DebrisParticle.materialColorKey`としてspawn時に焼き付ける。`pendingRunEquipmentSnapshot`はrun終了でnullへ戻るため、参照を持ち越すと走行終端をまたいだ破片の色が失われる。
4. **§13-3 J7(モーダル内スクロールの伝播防止)は追加実装なしで充足(Suu_mot3判断2026-08-20。人間承認ではない)**: J7の対象はスクロール可能領域であり、既存のShop/Inventoryモーダルは`passive:false`の`wheel`+`preventDefault()`による自前スクロールで背景へ伝播しない。G7-Eで`<dialog>`化した保留中結果画面の放棄確認は短文でスクロール可能領域を持たない。**冗長な`overscroll-behavior`は追加しない。**
5. **§13-11のE2E自動化は新規依存を追加せずに完了とする(Suu_mot3判断2026-08-20。人間承認ではない——同判断は「追加の人間承認は不要」としている)**: Playwright等の新規E2E依存は追加しない。「可能な範囲」は既存の構造テスト・純関数テストで満たす。**実focus移動・Escape・フォーカス復帰・forced-colors・スクリーンリーダー読み上げ・200%ズーム/320px reflow・OS側`prefers-reduced-motion`は、計画どおりG8人間試遊票へ明示して確認する。** 追加の人間承認は不要。

**G7で是正した既存欠陥(いずれもG7範囲内、新規契約の追加なし)**:

- `applyFreshStateToStore`(`saveStore.ts`)がG7-Aで追加した`instrumentOwnership`を列挙しておらず、永続実体だけが更新されメモリ上のstoreが古いまま残っていた(購入直後に所持状態が画面へ反映されない)。
- 保留中結果画面の放棄確認が`role="alertdialog"`+`aria-modal`を付けたただの`div`で、背面無効化・Escape・フォーカス移動・accessible nameのいずれも無かった。既存`useRetroDialog`(native `<dialog>`+`showModal()`)へ載せ替えて充足させた。**初期フォーカスは「やめる」側**とする——破棄側を初期フォーカスにすると、Enterの連打で取り返しのつかない操作が確定しうる。
- 計測器の拒否理由・保留中画面の再試行失敗・破壊症状HUDが、いずれも条件付きでstatusノードごと出し入れされていた(§13-6 J7違反)。常設ノードのtextContent差し替えへ変更。あわせて再試行失敗は緊急エラーではなく操作の拒否理由のため`role="alert"`→`role="status"`。

**bundle記録(§14)**: 起点 raw 790.97 kB / gzip 221.23 kB。G7-E区切り1時点で **JS raw 867.09 kB / gzip 242.62 kB** + **CSS raw 24.66 kB / gzip 5.67 kB**。増分は raw +76.1 kB / gzip +21.4 kB で、候補警戒線900 kBの手前。動的importは採用していない(採用時は分割ルート単位の設計・初回フォーカス先・ロード失敗時UIの計画化が先行条件)。

**feature gate**: `productionWiringEnabled`の既定値は`false`のまま。G統合以降・commit・tag・push・default true化はいずれも未実施。

## P3-4-C1: G7正式通過以降の人間承認原文とPhase 3最終状態（arbiter最終レビュー条件C1、2026-08-25追記）

**追記規則**: 本節は、上記P3-4-G7節を含む既存記録を書き換えず、後続の人間承認と現在状態を追記専用で収録する。上記P3-4-G7節末尾の「G7正式通過は未承認」「G統合以降未実施」「feature gate=false」は**2026-08-20当時の履歴**として維持し、現在状態は本節を正とする。

### C1-1. G7正式通過とG統合着手

**人間承認原文（2026-08-20）**:

> P3-4 G7正式通過判定全文を承認し、G統合（productionWiringEnabledをfalseからtrueへ変更する1行diffのみ）への着手を承認します。G9以降・commit・tag・pushは引き続き禁止します。

この承認により、G7は正式通過し、G統合は`productionWiringEnabled`の既定値を`false`から`true`へ変更する1行diffだけに限定して着手が解禁された。G9以降・commit・tag・pushは禁止されたままだった。

### C1-2. G統合（1行diff、検証追随、G9移行）

**G統合着手の人間承認原文（2026-08-20。C1-1と同一原文を、G統合側の効力記録として再掲）**:

> P3-4 G7正式通過判定全文を承認し、G統合（productionWiringEnabledをfalseからtrueへ変更する1行diffのみ）への着手を承認します。G9以降・commit・tag・pushは引き続き禁止します。

**G統合後の検証追随有限バンドルの人間承認原文（2026-08-20）**:

> G統合後の検証追随有限バンドル全文を承認します。A-1・A-2およびB-0〜B-3を、testRunStore内localのarrangeFinishFixture採用で実装してください。変更はテスト3ファイル・既存5テストに限定し、新規テスト・production変更・共有fixture基盤は追加しないでください。提示済みの実走確認2条件と停止条件を守り、G9以降・commit・tag・pushは禁止を維持してください。

**Node縮退経路のlease token再同期デルタの人間承認原文（2026-08-21 JST）**:

> G統合後の検証追随追加デルタとして、testRunStore.test.tsのresetSaveFixture末尾へ_evaluateLeaseOnce(new Date(0).toISOString())を1回追加し、Node縮退経路のleaseToken再同期を行うことを承認します。変更はこの1行に限定し、fake localStorage・writeV16・lease fixture・production変更・beforeEach/afterEach変更は追加しないでください。既存5件と対象外11件、実走条件2件、全test・build・lint・型検査を確認し、G9以降・commit・tag・pushは禁止を維持してください。

**コメント整合デルタの人間承認原文（2026-08-21 JST）**:

> G統合後の検証追随コメント整合デルタとして、testRunStore.test.tsのresetSaveFixture直前JSDocの「writeV16もlease取得も要らない」の1行を、提示されたruntime lease token再同期の説明へ置換することを承認します。production変更・テスト変更・commit・tag・pushは禁止を維持してください。

**G統合完了後、G9へ移行する人間承認原文（2026-08-21 JST）**:

> P3-4 G9 cleanupへの着手を承認します。上記の削除・検証範囲に限定し、新機能・仕様変更・新規基盤・commit・tag・pushは禁止します。

以上により、G統合のproduction変更は既定値の1行diffだけで完了し、追随は既存テスト5件・テスト3ファイルの有限範囲と2件の追加デルタに閉じた。新規production変更・新規公開契約・新規共有fixture基盤は追加されず、G9着手へ移行した。

### C1-3. G9正式通過とG8着手

**人間承認原文（2026-08-21 JST）**:

> P3-4 G9正式通過判定（feature gate・旧分岐・旧session保存経路の削除、89ファイル・2196テスト、build・lint・型検査成功、過剰設計防止条件を含む）を承認し、G8人間試遊への着手を承認します。commit・tag・pushは禁止を維持します。

この承認により、`productionWiringEnabled`、関連する旧分岐、旧session保存経路の削除が正式通過した。production経路は単一路となり、G8人間試遊が解禁された。commit・tag・pushは禁止されたままだった。

### C1-4. G8 terminal presentation有限バンドル

**人間承認原文（2026-08-24）**:

> 有限バンドルの実装承認します

上記承認が指す、直前提示済みの**承認対象全文**は次のとおり（2026-08-23T16:59:13ZにSuu_mot3からbrabit_mot3へ同一範囲を全文中継）:

#### 目的

`destructionTerminal`の最終stepに既に存在する`RunAccumulator`を表示専用に保持し、D03/D04/D06/D09の終端event・HUD・粒子・SE/loopを既存の単一出典から観測可能にする。

#### production変更（exact 4ファイル）

1. `src/store/gameStore.ts`
   - 非永続・内部専用フィールド`_terminalPresentationAccumulator: RunAccumulator | null`を1個だけ追加。初期値`null`。
   - `stepSim` / `stepTestRun` / `stepCourseRun`の`result.termination !== null`、すなわち`destructionTerminal`分岐だけで、`_runAccumulator`は従来どおり`null`にし、同じ`set`内で`result.accumulator`を退避する。
   - 通常の`finished`/`stalled`等の物理終端では退避しない。ここは過剰設計防止の確定制限。
   - successful new run startの`flickStart` / `finishAssembly` / `startTestRun` / `startCourseRun`、`resetSim` / `resetTestRun` / `resetCourseRun`、`setMode`で`null`化する。
   - start失敗（`!started.ok`）では変更しない。pendingでは変更しない。manual abortでは生成せず、reset/setModeの既存終了入口で消去する。
   - 退避フィールドを`canOperateRunEntry` / `finalizeActiveRunAsManualAbort` / `beginProductionRun` / outcome適用判定へ使わない。
2. `src/components/DestructionHud.tsx`
   - 表示入力を`_runAccumulator ?? _terminalPresentationAccumulator`とし、両方`null`の時だけ非表示。
3. `src/render/RaceEffects.tsx`
   - 同じ入力に限定して差し替える。両方`null`の時だけfield/cursorを消去。
   - 既存`runRef`・`processedEventCount`によりterminal eventをexactly-once処理し、閾値からeventを再構築しない。
4. `src/components/MotorAudioControl.tsx`
   - 同じ入力に限定して差し替える。
   - 既存schedulerの`runRef`・`processedEventCount`を維持し、one-shotをexactly-once、停止画面中の既存loopを継続させる。

#### テスト変更（既存2ファイルのみ、新規テストファイル・新規fixture基盤は禁止）

- `src/components/__tests__/destructionAudioWiring.test.ts`
- `src/store/__tests__/destructionWiring.test.ts`

最小4件:

1. D03/D04/D06/D09のterminal eventが退避accumulatorに載ることを既存fixtureで1件にまとめて確認。
2. 開始成功・reset・setModeで消え、start失敗は不変、manual abortでは生成されないlifecycle確認。
3. 退避accumulatorを2フレーム連続で渡してもterminal one-shotが1回だけであること。
4. 既存構造テストを、退避がない場合にのみfield/cursorを消す契約へ追随。

通常の`finished`/`stalled`で退避しない負例も、上記最小件数内のassertへ含める。追加テストが必要なら編集を止めてexact理由を提示する。

#### 明示的対象外・禁止

- 「検死レポートへ」ボタン・画面遷移は別gap。今回実装しない。
- engine、materials、物理式、較正値、公開action/type、save永続化、粒子数・色・寿命、SEパラメータ、docs、試遊票は変更しない。
- D01/D05を含む非terminal破壊状態を通常の完走・失速後に保持する拡張はしない。
- 新規component、asset、共有基盤を追加しない。
- commit・tag・pushは禁止。

#### 検証

- 変更対象の既存テスト。
- 全test、build、lint、型検査。
- `git diff --check`。
- 変更ファイルが上記production 4 + test 2の計6ファイル以内であること。

### C1-5. G8条件付き通過とPhase 6への音響QA繰越

**人間承認原文（2026-08-25）**:

> D01/D03音響確認をPhase 6へ繰り越し、G8を条件付き通過として承認します。

D01固有SEとD03破裂SE/duckingは未確認のままであり、PASSへ読み替えない。Phase 6計画の冒頭へ必須QAとして転記する。物理式・較正値・公開契約・production配線は変更せず、ゲームとしての完成ループを優先する。

### C1充足後のarbiter正式最終レビュー判定発効

arbiter_mot3は2026-08-25、source exact commit`2bf3a58ab25095b2e2aa03614f21a4325124f843` / tree`4454f08c085cf3df1463abeb5fac298be30ffd34`および外部docs 7件を独立照合し、90ファイル・2216テスト、build、lint、型検査、`git diff --check`、`AGENTS.md`/`CLAUDE.md`一致を再現した。そのうえで、P3-4を正式commit候補・タグ`p3-4-complete`付与可とする**条件付き承認**を発行し、ゲーム完成ループへの移行を妨げるPhase 3起因のblocking defectはないと判定した。

**人間承認原文（2026-08-25）**:

> P3-4 arbiter正式最終レビュー判定全文（条件付き承認、C1〜C4、Phase 6・次工程への申し送り、blocking defectなし、追加の物理・較正を要求しない条件を含む）を承認し、C1の台帳追記および正式commit構成案の作成に着手することを承認します。commit・tag・pushは別途承認まで禁止します。

**C1のSuu_mot3照合結果**: 本節C1-1〜C1-5へ対象5区分の人間承認原文を追記専用で収録し、上記P3-4-G7節の履歴記述を改変していない。2026-08-25、Suu_mot3は承認履歴との全文照合を完了し、C1を充足と判定した。commit・tag・pushは未承認のため実施しない。

### Phase 6・次工程への統合参照義務（blockingではない申し送り）

1. D01固有SEとD03破裂SE/duckingの実耳確認をPhase 6の必須QAとする。
2. CourseModeの無効化済みボタンに残る到達不能`onClick`とlegacy courseRun書込みactionは、「G9とV2 CourseMode retro置換の遅い方」という既裁定どおり、retro置換時に削除する。
3. 図鑑報酬・素材価格・ガウスメーター800 G等の経済値は仮値であり、Phase 5で調整する。
4. exact step回帰値はG時点の回帰証跡であってゲームバランスの目的値ではない。次工程では完成ループを優先し、物理精緻化を目的化しない。
5. chassis選択を`chassisBaselineG`へ反映しない挙動は、補足裁定S-3/Q4で確定した**意図的な凍結契約**である。`chassisBaselineG`は電池セル選択から`resolveChassisBaselineG`で135 g/150 gを導出し、garageの`chassis.baseMassG`は使わない。これは未解決実装gapではなく、将来変更する場合だけ別計画・承認を要する。
