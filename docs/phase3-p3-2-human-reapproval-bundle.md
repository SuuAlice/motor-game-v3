# P3-2 人間再承認バンドル(6項目)

作成: alice_mot3(2026-08-08)。正式Fable技術レビュー(2026-08-08、人間プロジェクトリード直接提示)が確定した人間再承認対象6項目のみを、値・型・実装時期まで判断できる形でまとめる。詳細な設計根拠・依存閉包は`docs/phase3-p3-2-plan.md`(v6)を参照。**`stepMotorWithDestruction`の内部改修(Q10)・D01漸減の返済先(Q12)は、正式Fable裁定により人間再承認不要と明示的に判定されており、本バンドルに含めない。**

本バンドルの承認をもって、P3-2実装(サブステップ0)へ着手する。

---

## 1. `DestructionConfig.battery`(lipo枝)への係数追加(Q1)

**型**: `BatteryDestructionConfig`(lipo判別枝)へ`internalResistanceDegradationMultiplier: number`を追加。

**値**: 初期候補値 **1.5**(設計較正値。swelling/smoking段階で値を区別しない——区別を支える較正根拠がないため単一値とする)。実物の損傷リポの内部抵抗上昇1.5〜2倍域の下端に対応する。sweep実測(短絡・過放電到達可能性、D03の3.0秒と同じ確定手順)をもってサブステップ1完了報告で最終化する。

**実装時期**: サブステップ1(`materialMapping.ts`)・サブステップ2(`destructionModes.ts`の`DestructionConfig`型定義)。

---

## 2. `D04CauseLog`/`D04Progress`の因果記録フィールド追加(Q4-3)

**型**:
- `D04Progress`へ`initiatingCauseLog: { shortCircuitDurationS: number; overDischargeRatio: number | null } | null`を追加(stage開始原因の凍結記憶域)。
- `D04CauseLog`へ`initiatingCause: { shortCircuitDurationS: number; overDischargeRatio: number | null }`を追加(非null、burning到達時に`initiatingCauseLog`から複写)。
- 既存`D04CauseLog.shortCircuitDurationS`/`overDischargeRatio`は「burning到達時点の瞬間値」へ意味を再定義する(値自体の型は不変)。

**理由**: 短絡でswelling開始→後から過放電が加わる、または逆順の混合原因を、両方とも正直に記録するため(単一の凍結値のみでは片方の原因が記録から消える)。

**実装時期**: サブステップ2(`destructionModes.ts`)。`restoreRunSnapshot`の`validateD04ProgressShape`/`validateD04CauseLogShape`(サブステップ4)へ、この2フィールドの深い検証+3条の交差不変条件(`stage==='none' ⟺ initiatingCauseLog===null`等)を追加。

---

## 3. `validateFireExposureProfile`の受理契約の狭窄(Q4-5)

**変更**: 既存公開関数`validateFireExposureProfile`(`destructionModes.ts`)へ、`adjacentRolesEquipped`配列内の重複要素(例: `['magnet','magnet']`)を拒否するロジックを追加する。

**理由**: 現行契約は重複を受理してしまい、`affectedRoles`(D04延焼の影響範囲)に同じroleが重複して現れうる。「不正状態は検出でなく構築不能に、修復はしない」という原則に従い、event組み立て時の無言修復(Set化)ではなく、validatorでの拒否を選ぶ。

**影響**: 既存の呼び出し元(`restoreRunSnapshot`経由の`RunSnapshot`復元)が、重複を含む(不正な)保存データに対して従来は成功していたものが失敗するようになる。ただしP3-2時点でproduction配線・実ユーザーデータは存在しないため実害はない。

**実装時期**: サブステップ2(`destructionModes.ts`)。

---

## 4. `DestructionConfig.d04`/`d07`の新設・再設計+event拡張(Q5・Q11)

**型**:
```ts
d04: { bodyScorchDeltaFraction: number; magnetScorchDeltaFraction: number };
d07: {
  thermal: { conductionCoefficient: number; dissipationCoefficient: number };
  irreversible:
    | { kind: 'demagnetizing'; magnetHeatGaugeLimit: number; reversibleDroopThreshold: number; reversibleDroopMultiplier: number; demagnetizationDeltaFraction: number }
    | { kind: 'nonDemagnetizing' };
};
```
`UnstampedDestructionEvent`のD04バリアントへ`bodyScorchDeltaFraction: number`・`magnetScorchDeltaFraction: number`、D07バリアントへ`demagnetizationDeltaFraction: number`を追加。

**値(いずれも設計較正値、sweep実測後に最終化)**:
- `reversibleDroopMultiplier`: 初期候補値 **0.95**(B低下5%)
- `demagnetizationDeltaFraction`: 初期候補値 **0.10**
- `magnetScorchDeltaFraction`: 初期候補値 **0.15**(全磁石素材で`magnetScorchDeltaFraction >= demagnetizationDeltaFraction`を満たすこと、nonDemagnetizing磁石には0を返すことを単体テストで固定)
- `conductionCoefficient`・`dissipationCoefficient`・`magnetHeatGaugeLimit`・`reversibleDroopThreshold`: sweepで確定(初期候補値は较正未定、サブステップ1で決定)

**理由**: `deriveDegradationDiffs`(既存シグネチャ不変)がD04/D07の劣化量を扱うための単一出典を`DestructionConfig`に置き、発火時点で`advanceD04`/`advanceD07`が`event`へ埋め込む(event埋め込み設計、Fable承認済み)。D07の磁石構造は0〜1ゲージ規約に従う`{thermal, irreversible}`の2部構成とする。

**実装時期**: サブステップ1(`materialMapping.ts`の写像関数)・サブステップ2(`destructionModes.ts`の型定義・`advanceD04`/`advanceD07`)・サブステップ4(`validateDestructionConfig`/`validateDestructionConfigRawShape`拡張)。

---

## 5. `RunSnapshot`拡張(Q6)

**型**: `RunSnapshot`/`CaptureRunSnapshotInput`/`RestoredRunSnapshot`へ`courseLengthM: number | null`・`slopeRad: number | null`を追加。`contractVersion`を1→2へ更新。

**交差検証**: `context==='motor'` ⟹ 両方null。`context==='vehicle' && track===null`(test-run) ⟹ `courseLengthM`は**正の有限数**、`slopeRad`は**有限数**(0や負の勾配〈下り坂〉も有効値として許容する——`slopeRad`を「正の有限数」に限定してはならない)。`context==='vehicle' && track!==null`(track-run) ⟹ 両方null。

**影響**: `contractVersion`更新により、既存version=1の`RunSnapshot`は新規フィールド欠落で`restoreRunSnapshot`が拒否するようになる(旧snapshotの救済は行わない)。P3-2時点でproduction配線・実ユーザーデータは存在しないため実害はない。

**実装時期**: サブステップ4(`destructionOrchestration.ts`)。`slopeRad`は`stepTestRunWithDestruction`が`stepTestRun`(既存、7番目の引数)へ実際に渡す(死にフィールドにしない)。

---

## 6. `PendingNotebookRecord`3腕への恒久劣化記録フィールド(Q9、方針承認のみ)

**型(方針、P3-2では型変更を実装しない)**: `ExperimentSession`・`VehicleTestRunNotebookRecord`・`CourseRunNotebookRecord`(いずれも`src/store/`所有)へ`finalDestructionState: DestructionState`を追加する方針を承認する。

**理由**: 正式M5(ii)「膨張・発煙段階のまま走行が終わった電池個体の記録には膨張域到達が残る」という要件を満たすには、走行記録側に恒久劣化状態そのものを保存する必要がある(要約型は発明しない)。

**実装時期**: **P3-2では実装しない**(gameStore無配線のため、このフィールドへ実際に書き込む経路がP3-2時点で存在せず、「死にフィールド」になるため)。**P3-4のgameStore配線サブステップで型変更を実行する**(台帳`P3-2-Q9`として`docs/phase3-plan-v12-amendments.md`へ記録し、P3-4計画の必須項目とする)。今回承認いただくのは方針(型を追加する、という設計判断)のみである。

---

## 承認いただきたい範囲

上記1〜6の型変更・受理契約の変更・値の候補(sweep確定前の暫定値であることを含む)について、計画書`docs/phase3-p3-2-plan.md`(v6)どおりに実装を進めてよいかご承認をお願いします。項目6については型変更の実装ではなく方針のみのご承認となります。
