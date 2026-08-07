# P3-1実装完了報告: D01/D03契約最小実証+store統合

作成: alice_mot3（2026-08-04、agmsg完了報告をSuu_mot3が提出用文書へ転記）

状態: 正式Fable最終レビュー待ち

commit/tag/push: 未実施

本報告は、正式Fable最終レビューへの提出用にP3-1の実装内容と検証証跡を集約したものである。契約の根拠は`docs/phase3-p3-1-plan.md`および`docs/phase3-plan-v12-amendments.md`を正とする。

## 1. サブステップ1〜5の実装一覧と所有境界

| サブステップ | 内容 | 所有ファイル | 状態 |
|---|---|---|---|
| 1 | 電池profile写像+D03較正値 | `src/materials/materialMapping.ts`+テスト | 完了・Suu_mot3レビュー通過 |
| 2 | `advanceDestructionState`本体（D01/D03） | `src/engine/destructionModes.ts`+テスト+`destructionModesImportStructure.test.ts`（leaf構造テスト新設） | 完了・Suu_mot3レビュー通過 |
| 3 | `stepMotorWithDestruction`本体+`classifyTerminalModes`完全形（+P3-1-Q9是正） | `src/engine/destructionOrchestration.ts`+テスト | 完了・Suu_mot3レビュー通過（Q9是正含む） |
| 4 | store fixtureベース統合テスト（motor-only/test-run/track-run 3文脈） | `src/store/__tests__/runOutcomeApplication.test.ts`のみ（`runOutcomeApplication.ts`本体・`saveStore.ts`・`gameStore.ts`は無改修） | 完了・Suu_mot3レビュー通過 |
| 5 | AGENTS.md/CLAUDE.md pitfallsルール2件の同期 | `AGENTS.md`・`CLAUDE.md` | 完了・Suu_mot3独立検証通過 |

**所有境界（alice_mot3所有・engine/materials/store fixtureテストのみ）**: `src/engine/destructionModes.ts`・`src/engine/destructionOrchestration.ts`・`src/materials/materialMapping.ts`とそれぞれのテスト、`src/engine/__tests__/destructionModesImportStructure.test.ts`（新規）、`src/store/__tests__/runOutcomeApplication.test.ts`（fixtureテストのみ）。**brabit_mot3所有領域（`saveStore.ts`・`gameStore.ts`・UIコンポーネント）は今回一切変更していない。**

## 2. P3-1-Q1（D01漸減物理）の未返済（台帳化）

D01は「崩壊開始event+既存恒久劣化（`RotorAssemblyState.collapsed=true`）+既存`coilCollapsed`物理までの最小実証」に限定している。**「実効巻数・占積が漸減」という継続的な劣化物理は未実装である。**

正式Fable裁定（P3-1-Q1、案(b)）により、この返済先は**P3-3（D02実装ステップ、実効config合成機構の導入ステップ）**と確定済みである。**P3-1をD01「完成」とは記述しない**。実装したのは「開始event+既存恒久劣化+既存物理flagまで」であり、漸減は未実装である。

P3-3計画のDoDへ「D01漸減がspec §7.1.1の文言と対応する形で実装され、劣化式はsweep付きで較正されること」を明記する台帳化が必要である旨、`docs/phase3-p3-1-plan.md` §3.1に記載済みである。

## 3. P3-1-Q4（context非依存性）の未返済（台帳化）

P3-1で実装した実wrapperは`stepMotorWithDestruction`（motor-only）のみである。DoD文言「motor-only/test-run/track-run×全endReason網羅」は、正式Fable裁定（P3-1-Q4、案(a)）により「`RunOutcome`→`applyRunOutcome`経路のcontext非依存性」と解釈することが確定した。test-run/track-run文脈はサブステップ4で手構築`RunOutcome` fixture（有効な`RunSnapshot`込み、3文脈table-driven）により検証済みである。

**「実wrapper×全endReason網羅」の完全な実施（`stepTestRunWithDestruction`・`stepTrackRunWithDestruction`自体の全endReasonテスト）は、P3-2（`stepTestRunWithDestruction`導入）・P3-4（`stepTrackRunWithDestruction`導入）の各計画のDoDへ明示的に台帳化する必要がある**（`docs/phase3-p3-1-plan.md` §7.2）。

## 4. P3-0-Q6不変条件の実コードテスト

正式Fable P3-0-Q6裁定（「`advanceDestructionState`は差分換算実装済みのモード=D01/D03のイベントしか発行してはならない」）は、`src/engine/__tests__/destructionModes.test.ts`で以下により機械検証済みである。

- 極端な`DestructionFrameInput`を与えてもD02/D04/D05/D06/D07/D09に対応する`events`が発行されないことを、許可リスト（D01|D03のみ）への直接検証で確認（禁止リスト列挙ではなくホワイトリスト方式、Suu指摘反映済み）
- `validateDestructionConfig`を通る複数の有効な`DestructionConfig` fixture（d02/d05/d06/d07/d09の値だけを変えたもの）間で、D01/D03の判定結果（events・state）が変化しないことを確認
- `events`配列の順序がD01→D03の固定順序であることを、同一フレームで両方が発火し得る人工的な境界値で確認

## 5. P3-1-Q7/Q8/leaf構造テスト

- **P3-1-Q7（型定義元移設）**: `BatteryDestructionConfig`・`GearBreakageProfile`・`DestructionConfig`本体を`src/engine/destructionModes.ts`（leaf）へ移設。`destructionOrchestration.ts`はimport/re-exportのみ。公開importパスは不変
- **P3-1-Q8（leaf規則の一方向値import許可）**: `destructionModes.ts`が`constants.ts`（真のleaf）から`BATTERY_HEAT_LIMIT`を値importすることを許可
- **leaf不変条件の構造テスト**（`src/engine/__tests__/destructionModesImportStructure.test.ts`、新規2テスト）: `destructionModes.ts`のソーステキストを実際に読み込み、import文が許可リスト（value importは`./constants`のみ、type-only importは`./motorPhysics`・`./vehiclePhysics`のみ）以外を含まないこと、`destructionOrchestration.ts`への逆依存が存在しないことを機械的に検証

裁定文書ではなくテストがP3-1-Q2(a)・P3-1-Q7・P3-1-Q8の裁定を以後守る状態になっている。

## 6. P3-1-Q9（snapshot唯一出典）

正式Fable補足裁定（2026-08-03T17:22、案(b)確定）+人間再承認（2026-08-04）により、`stepMotorWithDestruction`は`config`・`destructionConfig`を引数として受け取らず、`accumulator.replaySnapshot.motorConfig`・`.destructionConfig`から一意に導出する。`buildMotorOnlyFrameInput`の`theoreticalCurrentA`計算も同一のconfig変数を共有している。

**Phase 3 wrapper共通不変条件**（走行開始時に確定する構成情報はRunSnapshotを唯一の出典とし、wrapperの独立引数として再入力させない）をJSDocへ明記し、P3-2/P3-4の骨格実装時に同型のリプレイ等価テストを課すことを台帳化している（`docs/phase3-plan-v12-amendments.md` P3-1-Q9エントリ）。

**リプレイ等価テスト**（非自明な破壊経路: held-short `motorConfig`+短時間`destructionConfig`、`mulberry32(snapshot.seed)`で独立2run、D03発火+`destructionTerminal`終端を比較前にassertしてから完全一致比較）も実装・成功済みである。

## 7. A1: 給電停止機構の再監査（結論: 導入しない）

正式Fable指摘によりP3-1で再監査した結果、`DestructionStepResult.termination`が非nullになった時点で呼び出し側が以後`stepMotorWithDestruction`を呼ばないという規約だけで、D03発火後の物理進行を防げることを確認した。**結論: 導入しない。** `MotorConfig`・`stepTestRun`いずれにも新規フィールド・引数を追加していない（`docs/phase3-p3-1-plan.md` §6）。

## 8. D03 sweep 4条件の実測全文

対象: `src/materials/__tests__/materialMapping.test.ts`

実測日: 2026-08-04

### 条件1（通常運用非到達）

アルカリ・NiMHそれぞれ、120秒間の通常運用（短絡なし、適度な初速のフリー走行）で`batteryHeat`が`BATTERY_HEAT_LIMIT`未満のまま推移することを確認した。`expect(runNormalOperation(alkalineRatio)).toBeLessThan(BATTERY_HEAT_LIMIT)`等で検証している。

### 条件2（held-short有限到達、数値回帰）

held-short（持続短絡）構成で、アルカリは**15フレーム（0.125秒）**、NiMHは**16フレーム（0.1333秒）**で`BATTERY_HEAT_LIMIT`へ到達することを設計較正時点の数値回帰として固定した（`toBe(15)`・`toBe(16)`）。内部抵抗ratioは裸の数値ではなく、`BATTERY_MATERIALS`実データ+`computeBatteryInternalResistanceRatioCalibration`から導出している。

### 条件3（359/360/361境界）

二重に検証済みである。

1. `materialMapping.test.ts`: dt=1/120秒を360回加算した値が`2.999999999999992`であり、厳密な3.0を僅かに下回ることを実測（浮動小数点誤差の存在確認）
2. `destructionModes.test.ts`の実経路テスト（`advanceDestructionState`を実際に359回・360回・361回呼び出し）:
   - 359ステップ目まで`triggered:false`・`events`長0
   - 360ステップ目で`triggered:true`・`events`に`D03`が1件
   - 361ステップ目でも`events`長0（二重発火防止、361フレームへの遅延を許容仕様にしない）

### 条件4（heat上限到達時間と3.0秒の関係）

heat上限到達時間（アルカリ0.125秒・NiMH 0.1333秒）は候補値3.0秒よりはるかに早く（`toBeLessThan(3.0)`）、この構成でのD03実発火タイミングは短絡持続下限3.0秒そのものに支配される。heat条件は先に満たされ、待機状態になる。

## 9. `DURATION_COMPARISON_EPSILON_S`単一出典+申し送り

`src/engine/destructionModes.ts`の`DURATION_COMPARISON_EPSILON_S = 1e-9`秒は、物理較正値ではなく、固定dt累積の浮動小数点誤差（約8e-15、dt=1/120秒より6桁小さい）だけを吸収する数値実装である。正式Fable P3-1-Q3裁定により、境界1フレーム精度の正しい数値実装と認定済みである。

P3-2のD04 `stageDurations`・P3-3のD05 `brushSparkDurationLimitS`が同種のduration比較を導入する際、別のepsilonを発明せず、この単一出典を共有・再利用することを申し送り事項として明記する（`docs/phase3-p3-1-plan.md` §12・§14）。

## 10. P3-1-Q6/Q9のrg依存閉包実測

**P3-1-Q6（`createRunAccumulator`）**:

- 定義1箇所（`destructionOrchestration.ts`）
- 呼び出し元はすべてテストファイル
- `destructionOrchestration.test.ts` 10箇所
- `runOutcomeApplication.test.ts` 3箇所
- production呼び出しは存在しない

**P3-1-Q9（`stepMotorWithDestruction`）**:

- 定義1箇所（`destructionOrchestration.ts`）
- 呼び出し元はすべてテストファイル
- `destructionOrchestration.test.ts` 5箇所
- `runOutcomeApplication.test.ts` 3箇所
- production呼び出しは存在しない

`gameStore.ts`等への実配線は、P3-0-Q2裁定によりP3-4まで行っていない。

## 11. 検証結果

### `npm run test`

```text
Test Files  68 passed (68)
Tests       1142 passed (1142)
Duration    2.81s

transform 8.94s
setup 0ms
collect 19.09s
tests 6.06s
environment 18ms
prepare 7.11s
```

### `npm run build`全出力+bundle

```text
dist/index.html                   0.72 kB │ gzip:   0.46 kB
dist/assets/index-ChiYvQ2W.css   23.81 kB │ gzip:   5.54 kB
dist/assets/index-DXCILpbE.js   781.47 kB │ gzip: 219.29 kB
✓ built in 1.03s
```

P3-0完了時点の基準（781.47 kB / gzip 219.29 kB）から完全に不変である。engine/materials/store fixtureテスト+docsのみの変更のためである。

**台帳外の申し送り（正式Fable最終レビュー指摘、2026-08-07）**: bundleがP3-0から完全不変である理由は、P3-0-Q2裁定によりproduction配線が存在せず、`destructionModes.ts`・`destructionOrchestration.ts`の新規実装がいずれのproductionエントリポイントからも値参照されていないため、tree-shakingでバンドル外にあることによる。**したがって、P3-4のproduction配線ステップでbundle sizeが不連続に増加する見込みがある。P3-4計画実装時、この不連続増加を監視項目として明記すること。**

### `npm run lint`

```text
> oxlint
(exit 0、エラー・警告なし)
```

### `cmp AGENTS.md CLAUDE.md`

```text
差分なし
```

### `git diff --check` / `--stat`

対象9ファイル（AGENTS.md・CLAUDE.md・engine/materials/store配下の変更ファイル）と新規テスト1件を一時的にステージし、`git diff --cached --check`後にステージ解除して確認した。exit 0、空白関連の指摘なし。commitはしていない。

```text
AGENTS.md                                             |   4 +-
CLAUDE.md                                             |   4 +-
src/engine/__tests__/destructionModes.test.ts         | 324 ++++++++++++++++++++-
src/engine/__tests__/destructionOrchestration.test.ts | 247 +++++++++++++++-
src/engine/destructionModes.ts                        | 183 +++++++++++-
src/engine/destructionOrchestration.ts                | 192 ++++++++----
src/materials/__tests__/materialMapping.test.ts       | 158 +++++++++-
src/materials/materialMapping.ts                      |  61 ++++
src/store/__tests__/runOutcomeApplication.test.ts     | 298 ++++++++++++++++++-
9 files changed, 1384 insertions(+), 87 deletions(-)
```

## 12. 変更ファイル全一覧と意図commit範囲

**意図commit範囲（production+test）**:

- `src/engine/destructionModes.ts`
- `src/engine/destructionOrchestration.ts`
- `src/engine/__tests__/destructionModes.test.ts`
- `src/engine/__tests__/destructionOrchestration.test.ts`
- `src/engine/__tests__/destructionModesImportStructure.test.ts`（新規）
- `src/materials/materialMapping.ts`
- `src/materials/__tests__/materialMapping.test.ts`
- `src/store/__tests__/runOutcomeApplication.test.ts`
- `AGENTS.md`
- `CLAUDE.md`

**意図commit範囲（契約docs）**:

- `docs/phase3-p3-1-plan.md`（v11、新規）
- `docs/phase3-plan-v12-amendments.md`（新規、確定裁定台帳）
- `docs/phase3-p3-1-implementation-report.md`（本報告、新規）
- `docs/phase3-p3-1-fable-final-review.md`（新規、正式Fable最終レビュー原文+人間PM決定追補）

**除外**: 上記以外の`docs/`配下の未追跡ファイル（`docs/phase2-*`・`docs/phase3-fable-*`・`docs/phase3-suu-*`・`docs/art-spec-r2.md`・`docs/spec_1.md`・`docs/agmsg_codex_delivery_guide.md*`等）・`docs/temp/`・`.codex/`・`shareimg/`は、いずれも本セッション以前から存在するpre-existingの未追跡ファイルであり、P3-1の意図commit範囲には含めない。

次のproductionファイルも無変更である。

- `src/store/gameStore.ts`
- `src/store/saveStore.ts`
- `src/store/runOutcomeApplication.ts`
- `docs/phase3-plan-v12.md`

## 13. commit/tag/push

未実施である。正式Fable最終レビュー+人間承認まで行わない。

以上、P3-1実装完了報告である。
