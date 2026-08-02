# P3-0実装完了 レビュー依頼(正式Fable個別レビュー提出用)

作成: alice_mot3(2026-08-03)。本書は`docs/phase3-p3-0-plan.md`(v7)・`docs/phase3-ui-autopsy-plan-v5.md`(brabit_mot3改訂版)に基づくP3-0実装が完了した時点での、正式Fable個別レビューへの提出物である。本書単独で「P3-0実装が計画・裁定どおりか」を判定できることを目標に、承認経緯・実装ファイル一覧・裁定対応表・Suu追加是正事項・テスト全出力・差分検証結果を自己完結的に記載する。

**添付が必要な別ファイル**: 本書は`docs/phase3-p3-0-plan.md`(v7、986行)と`docs/phase3-ui-autopsy-plan-v5.md`(231行)の要約・対応表であり、両ファイル自体の全文は別途提出物として添付が必要である(裁定の正確な原文・型定義の完全なシグネチャは両ファイルにのみ存在する)。

---

## 1. P3-0 v7 / Q1〜Q7承認・各サブステップ・Suu照合の経緯

### 1.1 計画承認までの経緯(概要)

- v12(engine契約、`docs/phase3-plan-v12.md`)は2026-08-02T06:47にプロジェクトリードが承認、2026-08-02T07:39にR1(docs-only自己完結化ゲート)をSuu_mot3が通過と判定。
- P3-0詳細実装計画(`docs/phase3-p3-0-plan.md`)はv1(2026-08-02T07:5x提出)からv7(2026-08-02T13:3x提出)まで、Suu_mot3による計7回のレビューラウンド(要修正10点→8点→7点→8点→4点→通過)を経て段階的に確定した。改訂の全履歴は同ファイル15節に記載。
- v6(2026-08-02T13:0x)がSuu_mot3の最終照合を通過し、正式Fable個別レビューへ提出可能と確定。
- 2026-08-02T13:12、正式Fable個別レビュー(Suu_mot3経由中継)が条件付き承認(必須修正2点+軽微条件4点+Q1〜Q7全裁定)を返した。alice_mot3がv7として反映。
- 2026-08-02T13:22、Suu_mot3から「Suu最終照合/要追補」7点(旧版残存表現・自己矛盾の解消)着信、alice_mot3がdocs-onlyで反映。
- 2026-08-02T13:24、Suu_mot3がdocsゲート通過(v7・UI v5双方)を最終確認。
- 2026-08-02T13:26、プロジェクトリードが「Q1〜Q7を再承認します」と正式回答し、実装解禁指示(サブステップ1のみ)。

### 1.2 実装サブステップの経緯

計画10節が定めるサブステップ1〜6は、各サブステップの実装完了後にSuu_mot3が独立検証(`npm run test`/`build`/`lint`/`git diff --check`/`cmp AGENTS.md CLAUDE.md`の再実行)を行ったうえで次サブステップを解禁する方式で進行した。

| サブステップ | 内容 | 担当 | 状態 |
|---|---|---|---|
| 1 | engine/materials型定義(附録A.1〜A.3準拠) | alice_mot3 | 通過(2026-08-02T14:12、Suu独立確認) |
| 2 | `src/store/runOutcomeApplication.ts`純粋ロジック(附録A.4準拠) | alice_mot3 | 通過(2026-08-02T15:28、Suu独立確認968/968) |
| 3 | `src/store/saveStore.ts`によるstore統合 | brabit_mot3 | 通過(2026-08-02T18:17、Suu独立確認1095/1095。中間で要修正3ラウンド: 10点→7点→5点) |
| 4 | 既存ファイル(8.3節)の行別実体照合・不足補完 | brabit_mot3 | 通過(2026-08-02T18:20) |
| 5 | AGENTS.md/CLAUDE.md現状説明の同期(計画9節) | alice_mot3 | 通過(2026-08-02T18:27、Suu独立確認cmp差分ゼロ) |
| 6 | 全体DoD(`npm run test && npm run build && npm run lint`、全ファイルgit diff --check) | 共通 | 通過(2026-08-02T18:27、Suu独立確認67 files/1095 tests・build・lint・diff check・cmp全成功) |

サブステップ1実装中、単一tsconfigプロジェクトの型検査境界により`WearState.gear`の破壊的変更が計画未記載の`src/retro/shop/formatMaterial.ts`(brabit_mot3所有)とサブステップ4所有の`shopEconomy.ts`/`shopEconomy.test.ts`を壊す事象が発覚し、Suu_mot3が案(a)「所有境界つき依存閉包」(契約変更なし、Fable/人間再承認不要)を採用した(詳細は3節)。

サブステップ2〜4完了後もSuu_mot3の独立コードレビューにより、契約変更を伴わない実装上の欠陥・欠落が複数是正された(詳細は4節)。

commit・pushはこの提出のいずれの段階でも行っていない。

---

## 2. 実装ファイル一覧(責務境界・production配線状況)

**全ファイルにわたる不変条件(Q2裁定)**: production向けの`DestructionConfig`/`FireExposureProfile`の実配線(`gameStore.ts`の走行開始3箇所からの実際のconfig生成・供給)は本P3-0では一切行っていない。P3-0時点のconfig利用はすべてfixture・テスト内固定値であり、P3-4完了まで意図的に配線しない(Q2案(c))。

### 2.1 alice_mot3所有(engine/materials/store純粋ロジック)

| ファイル | 区分 | 責務 |
|---|---|---|
| `src/engine/destructionModes.ts` | 新規 | D01〜D09のProgress/CauseLog/DestructionState型、FireExposureRole。`advanceDestructionState`本体(状態遷移ロジック)は含まない(P3-1スコープ) |
| `src/engine/__tests__/destructionModes.test.ts` | 新規 | 上記の型・ガード関数のテスト |
| `src/engine/destructionOrchestration.ts` | 新規 | `RunAccumulator`/`RunOutcome`/`finalizeDestructionRun`/`finalizeRun`/`deriveDegradationDiffs`(Q6裁定範囲: D01collapse・D02burnout・D03/D04battery-consumed・D06toothLossのみ)/`RunSnapshot`capture・restore(runtime全検証)/`DestructionConfig`型・`validateDestructionConfig`(Q5裁定のinvalidFields込み)/`FireExposureProfile`・検証関数 |
| `src/engine/__tests__/destructionOrchestration.test.ts` | 新規 | 上記全関数のテスト |
| `src/materials/inventoryItem.ts` | 修正 | `WearState.gear`拡張(`totalToothCount`/`toothLossCount`/`seizureFraction`)、`PlayerInventory`へ`rotorAssemblies`/`bodyParts`/`bearingAssemblies`追加、`RotorAssemblyState`(Q7: `sourceWireMaterialId`+`consumedWireM`)/`BodyPartState`/`BearingAssemblyState`/`EquipmentRole`新設、`GEAR_TOTAL_TOOTH_COUNT`定数新設 |
| `src/materials/__tests__/inventoryItem.test.ts` | 修正 | 上記変更に伴うテスト更新 |
| `src/materials/degradationApplication.ts` | 新規 | `applyMagnetDiff`(Phase3最終レビューM5(i)/v12 1.6節: demagnetization/scorch共有)・`applyGearDiff`・`applyBrushDiff`・`applyRotorDiff`・`applyBodyDiff`・`applyBearingDiff`・`computeCompositeGearDamageFraction` |
| `src/materials/__tests__/degradationApplication.test.ts` | 新規 | 上記全関数のテスト |
| `src/store/runOutcomeApplication.ts` | 新規 | `EquipmentLoadout`/`EquipmentIdSnapshot`/`validateEquipmentLoadout`/`validateEquipmentIdSnapshot`/`captureEquipmentIdSnapshot`/`resolveBearingForGear`/`createInitialPlayerInventoryAndLoadout`/`beginRun`/`SaveEnvelopeMeta`/`TabRuntimeState`/`RunApplicationEnvelope`(Q3(i): `notebookRecord`フィールド込み)/`PendingNotebookRecord`(Q3(ii): 3腕判別union)/`CodexRecordEntry`/`ApplyRunOutcomeError`(Q1: `invalidRunSequence`込み)/`AppliedRunResult`(Q4b: `consumedEquipmentIds`込み)/`applyRunOutcome`/`retryPendingApplication`/`abandonPendingApplication`/`rebindLeaseForPendingApplication`/`touchLeaseHeartbeat`/`isLeaseHeartbeatStale`/`PROVISIONAL_DISCOVERY_REWARD_G` |
| `src/store/__tests__/runOutcomeApplication.test.ts` | 新規 | 上記全関数のテスト(59件) |
| `src/store/shopEconomy.ts` | 修正(依存閉包) | `freshWearState('gear')`の新shape追従、`createInitialShopEconomyState`への空アセンブリ配列追加。新規較正値・挙動追加なし |
| `src/store/__tests__/shopEconomy.test.ts` | 修正(依存閉包) | 上記追従に伴うテスト更新 |

### 2.2 brabit_mot3所有(store統合/UI)

| ファイル | 区分 | 責務 |
|---|---|---|
| `src/store/saveStore.ts` | 新規 | 統合永続store(`persist key 'v16:save'`)。全書き込みactionのlease共通事前ゲート(Fable P1反映)、`performApplyRunOutcome`の単一`set()`、`commitApplyResult`が現在loadoutと一致する場合に`consumedEquipmentIds`から`batteryItemId`を同一原子的反映でnull化(Q4a/Q4b)、`addSessionRecord`/`addCourseRunRecord`/`addVehicleTestRunRecord`/`appendNotebookRecord`による全腕50件自動trim(Q3(iii))、`codexRecords`配列管理(最大8件・modeId一意・trim対象外)、`abandonPendingApplicationAction`が`currentRunSequence`を同一setでnull化(軽微条件(3))、lease heartbeatタイマー・stale自動遷移、`applyRunOutcome`/`retryPendingApplication`/`abandonPendingApplication`/`rebindLeaseForPendingApplication`(いずれもpure層)のaction層呼び出し |
| `src/store/__tests__/saveStore.test.ts` | 新規 | 上記のaction-levelテスト(113件、14ケース全列assert含む) |
| `src/store/gameStore.ts` | 修正 | `saveStore`との結線、既存3ループ(stepSim/stepTestRun/stepCourseRun)境界の維持 |
| `src/store/__tests__/gameStore.test.ts` | 修正 | 上記結線のテスト追加 |
| `src/store/notebookStore.ts` | 修正 | `saveStore.ts`(実体、trim実装含む)への薄い委譲/反応ビューへ変更、既存確認UI撤去側の対応 |
| `src/store/shopEconomyStore.ts` | 修正 | lease事前ゲートへの追従(P1反映) |
| `src/store/__tests__/testRunStore.test.ts` | 修正 | 上記変更に伴うテスト追加 |
| `src/components/SaveGate.tsx` | 新規 | `leaseNotAcquired`状態(6-D-0節)のUI表示・全store書き込み入口の無効化 |
| `src/components/saveGateMode.ts` | 新規 | lease状態3区分(正常/待機中/整合性エラー)の判定ロジック |
| `src/components/__tests__/saveGateMode.test.ts` | 新規 | 上記のテスト |
| `src/components/ExperimentNotebook.tsx` | 修正 | notebookRecord原子的適用・全腕自動trimへの追従 |
| `src/App.tsx` | 修正 | `SaveGate`結線 |
| `src/retro/shop/formatMaterial.ts` | 修正(依存閉包) | `WearState.gear`新shapeへの追従 |
| `src/retro/shop/__tests__/formatMaterial.test.ts` | 修正(依存閉包) | 上記追従に伴うテスト更新 |

### 2.3 共通(docs)

| ファイル | 区分 | 責務 |
|---|---|---|
| `AGENTS.md` | 修正(1文のみ) | 「プロジェクトの現状」節末尾を、Phase2完了・Phase3 P3-0着手済みの状態へ更新(計画9節どおり) |
| `CLAUDE.md` | 修正(1文のみ) | AGENTS.mdと完全同一の変更(`cmp`差分ゼロを維持) |

---

## 3. Fable P1/P2・軽微条件4点・Q1〜Q7の実装対応表

出典はすべて`docs/phase3-p3-0-plan.md` 11節(裁定原文)・15節v7エントリ(反映内容)。

| 項目 | 裁定内容(要約) | 実装対応 |
|---|---|---|
| **P1**(必須修正) | 閲覧を除く全`saveStore`書き込みaction(購入・売却/サルベージ・装備変更・在庫消費・セーブ初期化含む)をlease取得済み共通事前ゲートで保護すること。従来はrun適用・heartbeat・beginRunのみゲートされていた | `saveStore.ts`に共通事前ゲートを実装(brabit_mot3)。UI側は`SaveGate.tsx`/`saveGateMode.ts`が`leaseNotAcquired`の間、新規走行・全書き込み操作の入口を一様に無効化(UI v5 6-D-0-1節)。テスト: `saveStore.test.ts`内lease未取得時の全action拒否テスト、`saveGateMode.test.ts` |
| **P2 = Q7**(必須修正、遡及申告) | `RotorAssemblyState.sourceWireMaterialId: WireMaterialId \| null`+`consumedWireM`は、v8由来の`sourceWireItemId: string \| null`からの契約変更であり、Q1〜Q6の申告に含まれていなかった。変更自体は承認、人間再承認対象へ遡及追加 | `inventoryItem.ts`に実装済み(サブステップ1)。計画11節Q7・12節へ遡及記載済み、プロジェクトリードの2026-08-02T13:26再承認に含まれる |
| **軽微条件(1)** | `GEAR_TOTAL_TOOTH_COUNT`を単一定数化し、リテラル散在を排除する | `inventoryItem.ts`に`export const GEAR_TOTAL_TOOTH_COUNT = 10`を新設。ギヤ生成・初期値の全箇所(`inventoryItem.ts`定義自体・`shopEconomy.ts`・`runOutcomeApplication.ts`・各テスト)がこの定数を参照することをrg検証済み。`degradationApplication.ts`は定数を直接importせず、個体`WearState.totalToothCount`(生成時に定数から複写済みの値)を使う設計であり、将来ギヤ以外の総数形状にも開いた正しい設計である |
| **軽微条件(2)** | 背面タブthrottlingによるlease喪失を意図仕様として明記する | 計画4.1節に明記済み。UI v5 6-D-0節がstale自動検知→自動rebindの挙動として反映 |
| **軽微条件(3)** | 同一セッション放棄時、`currentRunSequence`もnull化する | pure層`runOutcomeApplication.ts`の`abandonPendingApplication`は`pendingApplication`をnull化した`SaveMeta`を返すのみ。`currentRunSequence`の同一setでのnull化は`saveStore.ts`の`abandonPendingApplicationAction`が担う(action層)。`saveStore.test.ts`でテスト済み |
| **軽微条件(4)** | 改訂UI v5提出物(6-D-0節等)を実装レビュー提出物へ含める | 本書冒頭に明記のとおり、`docs/phase3-ui-autopsy-plan-v5.md`全文の添付を要求している。同ファイル231行末尾に「提出物への含有」の自己申告記載あり |
| **Q1** | `ApplyRunOutcomeError`へ`invalidRunSequence`追加。`runSequence >= nextRunSequence`のみエラー、`<= lastAppliedRunSequence`は冪等skip、中間の穴は許容(高水位意味論) | `runOutcomeApplication.ts`の`ApplyRunOutcomeError`型・`applyRunOutcome`判定順序に実装済み。`runOutcomeApplication.test.ts`で3パターン(エラー/冪等skip/穴の通常適用)をテスト |
| **Q2** | `DestructionConfig`のproduction配線をP3-4完了まで延期(案(c))。P3-1〜P3-3はfixtureで契約実証、人間試遊はP3-4になる帰結を明示 | P3-0では`validateDestructionConfig`等の検証関数のみ実装、production生成元(`gameStore.ts`からの実配線)は一切実装していない(2.1節冒頭の不変条件参照) |
| **Q3(i)** | `RunApplicationEnvelope`へ`notebookRecord: PendingNotebookRecord`フィールドを契約追加 | `runOutcomeApplication.ts`に実装済み |
| **Q3(ii)** | `VehicleTestRunNotebookRecord`新設+3腕判別union(既存`CourseRunNotebookRecord`がtrackId必須でtest-runと非互換なため) | `runOutcomeApplication.ts`の`PendingNotebookRecord`型に実装済み |
| **Q3(iii)** | 全腕自動trim(50件)への統一、既存確認UI撤去。`codexRecords`はtrim対象外 | trim本体は`saveStore.ts`の`addSessionRecord`/`addCourseRunRecord`/`addVehicleTestRunRecord`/`appendNotebookRecord`が実装。`notebookStore.ts`(brabit_mot3)は`saveStore.ts`への薄い委譲/反応ビューへ変更、`ExperimentNotebook.tsx`で確認UI撤去。`codexRecords`(最大8件・modeId一意)は別管理でtrim対象外であることを`saveStore.ts`で実装 |
| **Q4a** | battery消費(D03/D04)後、`EquipmentLoadout.batteryItemId`を自動null化し明示的再装備を要求 | pure層`runOutcomeApplication.ts`の`applyRunOutcome`は`AppliedRunResult.consumedEquipmentIds`を返すのみでloadoutは書き換えない。実際のnull化は`saveStore.ts`の`commitApplyResult`が、`consumedEquipmentIds`と現在loadoutが一致する場合に単一の原子的反映として実行する(Q4bの層分離と整合) |
| **Q4b** | `AppliedRunResult`へ`consumedEquipmentIds: readonly {role, id}[]`を契約追加、現在loadoutと一致する場合のみnull化 | `runOutcomeApplication.ts`の`applyRunOutcome`が`consumedEquipmentIds`を算出・返却(pure層の責務はここまで)。一致判定によるnull化自体は`saveStore.ts`の`commitApplyResult`が実行し、`saveStore.test.ts`でテスト済み |
| **Q5** | `validateDestructionConfig`の戻り型へ`invalidFields`(値域違反詳細)を追加 | `destructionOrchestration.ts`に実装済み。判別union対応(nonLipo/nonBreakable時に不要フィールドを要求しない)含む |
| **Q6** | `deriveDegradationDiffs`のP3-0実装範囲を2値/カウント差分(D01/D02/D03/D04のbattery-consumed/D06)に限定。連続量`deltaFraction`(D04 scorch/D05/D07/D09 seizure)は各モードの実装ステップ(P3-2〜P3-4)で追加。不変条件「advanceDestructionStateは差分換算が実装済みのモードのイベントしか発行してはならない」 | `destructionOrchestration.ts`の`deriveDegradationDiffs`は上記5種のみ実装、他は未実装(スタブ・暫定値を入れていない)。`advanceDestructionState`本体自体がP3-1スコープのため本P3-0には存在せず、不変条件の実コード上の検証はP3-1以降の課題として計画に明記済み |

---

## 4. Suu追加レビューで是正した事項(契約変更を伴わない実装欠陥の是正)

以下はいずれも**Fable裁定・v7契約自体への変更を伴わない**、実装完了後にSuu_mot3の独立コードレビューが発見した欠陥・欠落の是正である。

### 4.1 サブステップ2(alice_mot3所有、必須修正6点、2026-08-02T14:44指摘→2026-08-02T15:0x対応)

1. `rewardsGrantedG=0`固定——図鑑初回登録報酬機構(spec §5.1/§7.5が要求)が実質未実装だった。`PROVISIONAL_DISCOVERY_REWARD_G`(専用新規暫定定数、値500)を新設し、新規発見モード数×定数を`cashG`へ原子的加算する実装を追加。二重付与防止テスト込み。
2. `rebindLeaseForPendingApplication`の計画附録A.4(2引数)と実装(3引数、`now`追加)の不一致——計画側を3引数版へ同期。
3. lease stale判定(`isLeaseHeartbeatStale`+`LEASE_STALE_THRESHOLD_MS=20000`)がテストのみ存在し実装が欠落していた——実装を追加。
4. 計画10節のサブステップ2 DoDが、pure関数だけでは検証不能なaction-level項目を含んでいた——サブステップ2/3の境界を計画本文で明示的に分割。
5. `createInitialPlayerInventoryAndLoadout`の`cashG:1000`リテラルが計画の「`INITIAL_CASH_G`参照」という確定事項に反していた——参照へ統一。
6. validator負例(battery以外のfamily不一致、vehicle/motor文脈別のnull性負例)が不足——追加。

対応後: テスト14件追加(59件)、`npm run build`/`test`(968/968)/`lint`全成功。

### 4.2 サブステップ3(brabit_mot3所有、必須修正10点→7点→5点の3ラウンド)

- **1回目(2026-08-02T16:15、10点)**: クロスタブleaseの最新localStorage未参照、lifecycle/UI未配線、pending共通ブロック欠落、hydrate検証迂回、validator/14ケース不足等。
- **2回目(2026-08-02T17:00、7点)**: 1回目対応後の再レビューで、14ケース表の不足、エラー理由の偽変換/待機poll未再開、SaveGate迂回、BFCache復帰未対応、validator深度不足、全actionテスト不足、terminal progress原子性の課題。
- **3回目(2026-08-02T17:43、5点)**: 2回目対応版(1082 tests)への独立照合で、gameStoreクロスタブ同期欠落、全write I/O失敗の異常停止未統一、`persist.rehydrate`validator迂回、劣化diff負値validator不足、14ケース全列assert不足。
- 3回目対応版(1095 tests)をSuu_mot3が独立確認し、2026-08-02T18:17に通過と判定。

### 4.3 その他

- サブステップ1完了時の最終軽微追補(2026-08-02T15:22、計画本文の疑似コード2引数呼び出し残存・テスト件数表記の旧版残存2箇所)——docs-onlyで反映済み(計画15節参照)。

いずれのラウンドも、Fable裁定の型・意味論(Q1〜Q7・P1・P2)自体を変更するものではなく、その裁定を実コードとして正しく実現できていなかった欠陥の是正である。

---

## 5. `npm run test`完全出力(2026-08-03T03:28実行、省略なし)

```
> motor-game-v3@0.0.0 test
> vitest run


 RUN  v2.1.9 /home/alice/projects/motor-game-v3

 ✓ src/retro-proto/perf/__tests__/frameProbe.test.ts (18 tests) 14ms
 ✓ src/materials/__tests__/degradationApplication.test.ts (16 tests) 10ms
 ✓ src/materials/__tests__/assumedGeometry.test.ts (31 tests) 25ms
 ✓ src/materials/__tests__/materials.test.ts (18 tests) 34ms
 ✓ src/materials/__tests__/inventoryItem.test.ts (16 tests) 16ms
 ✓ src/store/__tests__/shopEconomy.test.ts (45 tests) 36ms
 ✓ src/retro/audio/__tests__/score.test.ts (29 tests) 24ms
 ✓ src/retro/shop/__tests__/layout.test.ts (25 tests) 19ms
 ✓ src/engine/__tests__/recipeCode.test.ts (41 tests) 40ms
 ✓ src/store/__tests__/runOutcomeApplication.test.ts (59 tests) 64ms
 ✓ src/engine/__tests__/scoring.test.ts (22 tests) 39ms
 ✓ src/engine/__tests__/failures.test.ts (13 tests) 53ms
 ✓ src/engine/__tests__/motorPhysicsLoad.test.ts (5 tests) 35ms
 ✓ src/materials/__tests__/materialMapping.test.ts (57 tests) 145ms
 ✓ src/retro/audio/__tests__/sequencer.test.ts (19 tests) 37ms
 ✓ src/engine/__tests__/destructionOrchestration.test.ts (43 tests) 38ms
 ✓ src/engine/__tests__/motorPhysicsV15.test.ts (15 tests) 235ms
 ✓ src/retro/mode7/__tests__/affineSampler.test.ts (22 tests) 574ms
   ✓ computePerspectiveRowTransforms > 全出力行を通してソース参照座標は常に整数になる(ニアレストネイバー) 533ms
 ✓ src/engine/__tests__/vehiclePhysics.test.ts (38 tests) 324ms
 ✓ src/engine/__tests__/motorPhysicsSplitApi.test.ts (12 tests) 9ms
 ✓ src/retro/audio/__tests__/synth.test.ts (21 tests) 29ms
 ✓ src/store/__tests__/saveStore.test.ts (113 tests) 259ms
 ✓ src/retro-proto/resolutionHarness/__tests__/postMortemLayout.test.ts (16 tests) 17ms
 ✓ src/retro-proto/worstCase/__tests__/qualityDegradation.test.ts (13 tests) 24ms
 ✓ src/retro/shop/__tests__/formatMaterial.test.ts (14 tests) 15ms
 ✓ src/retro/audio/__tests__/mixLevels.test.ts (8 tests) 4ms
 ✓ src/retro/audio/__tests__/motorSound.test.ts (16 tests) 18ms
 ✓ src/retro/canvas/__tests__/integerScale.test.ts (9 tests) 9ms
 ✓ src/retro/canvas/__tests__/directCanvas.test.ts (8 tests) 17ms
 ✓ src/retro-proto/resolutionHarness/__tests__/windingTraceGeometry.test.ts (12 tests) 93ms
 ✓ src/engine/__tests__/trackPhysics.test.ts (34 tests) 789ms
 ✓ src/engine/__tests__/destructionModes.test.ts (5 tests) 14ms
 ✓ src/store/__tests__/gameStore.test.ts (6 tests) 23ms
 ✓ src/retro/canvas/__tests__/viewportReport.test.ts (9 tests) 12ms
 ✓ src/retro-proto/overheadView/__tests__/carSprite.test.ts (8 tests) 15ms
 ✓ src/retro-proto/resolutionHarness/__tests__/garageIllustrationGeometry.test.ts (9 tests) 82ms
 ✓ src/retro-proto/mode7Demo/__tests__/drawMode7Demo.test.ts (6 tests) 39ms
 ✓ src/components/__tests__/saveGateMode.test.ts (9 tests) 11ms
 ✓ src/engine/__tests__/motorPhysics.test.ts (49 tests) 962ms
   ✓ 性質ベーステスト(ランダムパラメータ) > 状態が常に有限で、電流は非負、ショート時はトルク相当(電流)が常にゼロ、符号は0を経由せず反転しない 782ms
 ✓ src/store/__tests__/testRunStore.test.ts (14 tests) 499ms
 ✓ src/retro-proto/audioDemo/__tests__/audioTabUiState.test.ts (7 tests) 12ms
 ✓ src/engine/__tests__/commutator.test.ts (9 tests) 14ms
 ✓ src/retro/lint/__tests__/rawColorScan.test.ts (10 tests) 18ms
 ✓ src/retro-proto/overheadView/__tests__/track.test.ts (9 tests) 9ms
 ✓ src/retro/audio/__tests__/wavEncoder.test.ts (7 tests) 15ms
 ✓ src/retro-proto/mode7Demo/__tests__/drawPerspectiveComparison.test.ts (5 tests) 10ms
 ✓ src/retro-proto/overheadView/__tests__/carIndex.test.ts (8 tests) 7ms
 ✓ src/store/__tests__/notebookStore.test.ts (4 tests) 6ms
 ✓ src/retro/shop/__tests__/materialIcons.test.ts (11 tests) 14ms
 ✓ src/retro/canvas/__tests__/orientation.test.ts (7 tests) 8ms
 ✓ src/retro/text/__tests__/segmentDigits.test.ts (8 tests) 29ms
 ✓ src/retro-proto/worstCase/__tests__/insetLayout.test.ts (4 tests) 6ms
 ✓ src/retro-proto/overheadView/__tests__/tallObjectStyle.test.ts (5 tests) 8ms
 ✓ src/retro/colorOps/__tests__/blend.test.ts (9 tests) 16ms
 ✓ src/data/__tests__/brokenCars.test.ts (3 tests) 131ms
 ✓ src/retro-proto/resolutionHarness/__tests__/dummyWindingRecord.test.ts (5 tests) 15ms
 ✓ src/retro/audio/__tests__/bgmScore.test.ts (4 tests) 12ms
 ✓ src/data/__tests__/trackSweep.test.ts (3 tests) 10ms
 ✓ src/data/__tests__/tracks.test.ts (4 tests) 13ms
 ✓ src/retro-proto/colorOpsDemo/__tests__/colorOpsScenes.test.ts (9 tests) 64ms
 ✓ src/retro/canvas/__tests__/layeredCanvasConstraint.test.ts (4 tests) 5ms
 ✓ src/retro-proto/resolutionHarness/__tests__/candidates.test.ts (4 tests) 8ms
 ✓ src/retro-proto/__tests__/tabState.test.ts (3 tests) 7ms
 ✓ src/retro-proto/mode7Demo/__tests__/checkerFloorSource.test.ts (3 tests) 4ms
 ✓ src/retro/__tests__/palette.test.ts (5 tests) 10ms
 ✓ src/data/__tests__/partPresets.test.ts (2 tests) 5ms
 ✓ src/retro/audio/__tests__/reverb.test.ts (20 tests) 1360ms
   ✓ generateImpulseResponseSamples > 全サンプルが-1..1の範囲に収まる 1231ms

 Test Files  67 passed (67)
      Tests  1095 passed (1095)
   Start at  03:28:39
   Duration  3.30s (transform 8.76s, setup 0ms, collect 21.19s, tests 6.52s, environment 18ms, prepare 8.33s)
```

exit=0。

### `npm run build`完全出力

```
> motor-game-v3@0.0.0 build
> tsc -b && vite build

vite v8.1.5 building client environment for production...
transforming...✓ 681 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.72 kB │ gzip:   0.46 kB
dist/assets/index-ChiYvQ2W.css   23.81 kB │ gzip:   5.54 kB
dist/assets/index-DXCILpbE.js   781.47 kB │ gzip: 219.29 kB

✓ built in 1.08s
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
```

exit=0(`tsc -b`型検査成功込み。チャンクサイズ警告は既知の情報メッセージであり、CLAUDE.md非機能要件の「初回ロードは1MB未満」に対する認識済みの検討事項であって本P3-0固有の問題ではない)。

### `npm run lint`完全出力

```
> motor-game-v3@0.0.0 lint
> oxlint

```

exit=0(出力なし=違反ゼロ)。

---

## 6. cmp / git diff --check / git status・diff --stat

**重要な注記**: `git status`には、本P3-0実装と無関係な既存の未追跡ファイル(`docs/phase2-*`・`docs/phase3-plan-v2〜v11`・`docs/phase3-suu-*-review.md`・`docs/phase3-fable-*`等の過去の計画反復物、および`docs/spec.md`・`docs/art-spec.md`・`docs/art-spec-r2.md`・`docs/spec_1.md`・`.codex/`・`shareimg/`等のユーザー/他工程所有物)が多数含まれる。これらはいずれも本実装差分と無関係であり、以下の対象範囲には含めていない。

### 6.1 cmp AGENTS.md CLAUDE.md

```
$ cmp AGENTS.md CLAUDE.md
```
exit=0(差分なし)。

### 6.2 git diff --check(P3-0実装スコープに限定してstage→確認→restore)

対象: `src/engine/` `src/materials/` `src/store/` `src/components/` `src/retro/shop/` `src/App.tsx` `AGENTS.md` `CLAUDE.md`

```
$ git add -A -- src/engine src/materials src/store src/components src/retro/shop src/App.tsx AGENTS.md CLAUDE.md
$ git diff --cached --check
```
exit=0(空白関連の問題なし)。確認後`git restore --staged`で追跡外の状態に戻し、commitはしていない。

### 6.3 git diff --cached --stat(P3-0実装スコープ)

```
 AGENTS.md                                          |    2 +-
 CLAUDE.md                                          |    2 +-
 src/App.tsx                                        |   70 +-
 src/components/ExperimentNotebook.tsx              |   11 +-
 src/components/SaveGate.tsx                        |  100 ++
 src/components/__tests__/saveGateMode.test.ts      |   50 +
 src/components/saveGateMode.ts                     |   37 +
 src/engine/__tests__/destructionModes.test.ts      |   62 +
 src/engine/__tests__/destructionOrchestration.test.ts |  505 ++++++
 src/engine/destructionModes.ts                     |  178 ++
 src/engine/destructionOrchestration.ts             |  731 +++++++++
 src/materials/__tests__/degradationApplication.test.ts |  123 ++
 src/materials/__tests__/inventoryItem.test.ts      |   13 +-
 src/materials/degradationApplication.ts            |   57 +
 src/materials/inventoryItem.ts                     |   49 +-
 src/retro/shop/__tests__/formatMaterial.test.ts    |   14 +-
 src/retro/shop/formatMaterial.ts                   |    2 +-
 src/store/__tests__/gameStore.test.ts              |   40 +
 src/store/__tests__/runOutcomeApplication.test.ts  |  563 +++++++
 src/store/__tests__/saveStore.test.ts              | 1323 +++++++++++++++
 src/store/__tests__/shopEconomy.test.ts            |    5 +-
 src/store/__tests__/testRunStore.test.ts           |   48 +
 src/store/gameStore.ts                             |  235 +--
 src/store/notebookStore.ts                         |   65 +-
 src/store/runOutcomeApplication.ts                 |  543 +++++++
 src/store/saveStore.ts                             | 1700 ++++++++++++++++++++
 src/store/shopEconomy.ts                           |    6 +-
 src/store/shopEconomyStore.ts                       |   76 +-
 28 files changed, 6410 insertions(+), 200 deletions(-)
```

### 6.4 git status --short(P3-0実装スコープのみ抜粋)

```
 M AGENTS.md
 M CLAUDE.md
 M src/App.tsx
 M src/components/ExperimentNotebook.tsx
 M src/materials/__tests__/inventoryItem.test.ts
 M src/materials/inventoryItem.ts
 M src/retro/shop/__tests__/formatMaterial.test.ts
 M src/retro/shop/formatMaterial.ts
 M src/store/__tests__/gameStore.test.ts
 M src/store/__tests__/shopEconomy.test.ts
 M src/store/__tests__/testRunStore.test.ts
 M src/store/gameStore.ts
 M src/store/notebookStore.ts
 M src/store/shopEconomy.ts
 M src/store/shopEconomyStore.ts
?? src/components/SaveGate.tsx
?? src/components/__tests__/saveGateMode.test.ts
?? src/components/saveGateMode.ts
?? src/engine/__tests__/destructionModes.test.ts
?? src/engine/__tests__/destructionOrchestration.test.ts
?? src/engine/destructionModes.ts
?? src/engine/destructionOrchestration.ts
?? src/materials/__tests__/degradationApplication.test.ts
?? src/materials/degradationApplication.ts
?? src/store/__tests__/runOutcomeApplication.test.ts
?? src/store/__tests__/saveStore.test.ts
?? src/store/runOutcomeApplication.ts
?? src/store/saveStore.ts
```

commitはこの状態のまま行っておらず、本レビュー提出後の判定待ちである。

---

## 7. 添付が必要な提出物

- `docs/phase3-p3-0-plan.md`(v7、986行)全文——本書3節の対応表が参照する裁定原文・附録A(A.1〜A.4)の完全な型シグネチャはこのファイルにのみ存在する。
- `docs/phase3-ui-autopsy-plan-v5.md`(231行)全文——特に6-D節・6-D-0節・6-D-0-1節・6-E節・7節(P1/Q3/Q4a反映範囲、軽微条件4対応箇所)。

---

## 8. 質問

**P3-0実装をcommit可能と判定できるか。必須修正があれば列挙されたい。**
