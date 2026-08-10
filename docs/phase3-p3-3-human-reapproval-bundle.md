# P3-3 人間再承認バンドル(13項目+追補1項目)

作成: alice_mot3(2026-08-10)。正式Fable技術レビュー(2026-08-09、人間プロジェクトリード直接提示、Suu_mot3中継確認済み)が確定した人間再承認対象13項目のみを、型・実装時期まで判断できる形でまとめる。詳細な設計根拠・依存閉包は`docs/phase3-p3-3-plan.md`(v7)を参照。**`assembleD05Config`新設(Q13)・`brush.wearFraction`の次run反映をP3-4据え置きとする方針(Q11)は、正式Fable裁定により人間再承認不要と明示的に判定されており、本バンドルに含めない。**

本バンドルの承認をもって、P3-3実装(ゲート0)へ着手する。数値較正値はいずれも未確定であり、本バンドルでは型契約の変更のみを承認対象とする(**2026-08-10精密化、正式Fable補足裁定P3-3-Q15-1・Q15-6: 「未確定」とは「Fable候補裁定さえ経ていない」ではなく「commit承認を経ていない」ことを意味する——ゲート2は較正値候補について正式Fable裁定〈Q15-2・Q15-3、暫定候補値として承認済み〉を経ているが、確定はゲート5のsweep受け入れ条件実測+最終報告の確定申請+人間commit承認を経て初めて成立し、本バンドルはこの数値確定そのものを承認対象に含めない、という従来からの意味を明確化したものであり、契約変更ではない)。

**2026-08-10追補(#4追補)**: ゲート2完了報告に対するSuu_mot3照合・正式Fable補足裁定(P3-3-Q15)により、#4で追加した`DestructionConfig.d05`の`highCurrentPenaltyThresholdA`/`highCurrentPenaltyMultiplier`(フラット2フィールド)を判別unionへ変更する追加の型契約変更が発生した。これは13項目とは別に発生した追補であり、下記#4追補として個別に記載する(記載時点では、合計14項目のうち本追補が唯一未承認だった)。**その後2026-08-10、人間が本追補(Q15-4)についても別途「Q15-4再承認します」と明示承認した(Suu_mot3中継確認済み)。合計14項目(元の13項目+本追補1項目)すべてが人間承認済みである。**

---

## 1. `D01Progress`への進行度フィールド追加(Q4・Q5)

**型**: `D01Progress`(destructionModes.ts)へ`decayExposureRad: number`を追加(単位rad、初期値0、`triggered===false`の間は0固定)。

**理由**: P3-1-Q1裁定が事前に予告していた返済フィールド。`max(0, |angularVelocityRadS| − COIL_DEFORM_OMEGA) × dt`の累積により、D01崩壊後の実効巻数・占積漸減の駆動因を表す。

**実装時期**: ゲート1(`destructionModes.ts`)。

---

## 2. `DestructionConfig.d01`新設セクション(Q5)

**型**: `DestructionConfig`へ`d01: { decayExposureScaleRad: number; minEffectiveTurnsRatio: number }`を新設。

**値**: いずれも未確定(sweep対象)。`decayExposureScaleRad`は有限正(スケール定数、単位rad)、`minEffectiveTurnsRatio`は`0 < x <= 1`(劣化の下限)。

**実装時期**: ゲート1(`destructionModes.ts`の型定義+validator)。

---

## 3. `DestructionConfig.d02`拡張(Q1・Q2)

**型**: `DestructionConfig.d02`へ`conductionScale: number`・`dissipationCoefficient: number`・`smokeResistanceMultiplier: number`(`>= 1`必須)を追加。

**理由**: `computeRCoil`ベースの`coilLossW=I²R`によるコイル熱ゲージ駆動(Q1確定)+発煙後のR_coil悪化倍率(Q2確定、単一固定値)。

**実装時期**: ゲート1(`destructionModes.ts`の型定義+validator)。

---

## 4. `DestructionConfig.d05`拡張(Q3・Q6・Q7)

**型**: `DestructionConfig.d05`へ`brushWearRateRatio`・`highCurrentPenaltyThresholdA`・`highCurrentPenaltyMultiplier`(`>= 1`必須)・`wearPerAmpSecond`(素材非依存の共通較正値)・`recoveryFrames`(非負整数)・`recoveryContactResistanceMultiplier`(`>= 1`必須)を追加。

**理由**: D05摩耗換算(Q3確定)+ブラシ写像の摩耗率層(Q6確定)+一時接触抵抗悪化の回復区間モデル(Q7確定)。

**実装時期**: ゲート1(`destructionModes.ts`の型定義+validator)。

### 4追補. `highCurrentPenaltyThresholdA`/`highCurrentPenaltyMultiplier`の判別union化(Q15-4、2026-08-10追加)

**型**: 上記#4で追加した`highCurrentPenaltyThresholdA: number`・`highCurrentPenaltyMultiplier: number`のフラット2フィールドを、`highCurrentPenalty: { kind: 'noPenalty' } | { kind: 'thresholdPenalty'; highCurrentPenaltyThresholdA: number; highCurrentPenaltyMultiplier: number }`という単一の判別unionフィールドへ変更する。`thresholdPenalty`枝の`highCurrentPenaltyMultiplier`は`> 1`厳密(`>= 1`ではない)。

**理由**: ゲート2実装で「ペナルティ無効化」を根拠のない番兵値(閾値999)で表現していたことが、11.1節「値は本書で確定しない」契約の違反(P48)とは別に、契約設計そのもののギャップ(「ペナルティが存在しない」状態を意味のない数値なしに型で表現する手段がなかったこと)として正式Fable補足裁定(P3-3-Q15-4、2026-08-10)により指摘された。D07の`irreversible`判別union(`nonDemagnetizing`/`demagnetizing`)と同型の「不正状態を構築不能にする」原則を適用し、番兵値999(P3-2-Q11で既に却下した同型の番兵閾値1000と矛盾する設計)を撤回する。

**依存閉包**(pitfalls#2、`rg -l "highCurrentPenalty" src scripts`実測、差分ゼロ確認済み): `src/engine/destructionModes.ts`・`src/engine/destructionOrchestration.ts`・`src/materials/materialMapping.ts`(production3)+`src/engine/__tests__/destructionModes.test.ts`・`src/engine/__tests__/destructionOrchestration.test.ts`・`src/materials/__tests__/materialMapping.test.ts`・`src/store/__tests__/runOutcomeApplication.test.ts`・`src/store/__tests__/saveStore.test.ts`(test5)の計8ファイル。

**実装時期**: ゲート2是正(実装済み、`docs/phase3-p3-3-plan.md` v10 15.5節Q15-4参照)。本追補の人間承認をもって、この型変更が確定する。

---

## 5. `DestructionFrameInput`拡張(Q1・Q4)

**型**: `DestructionFrameInput`へ`coilLossW: number`・`isChatteringThisFrame: boolean`・`angularVelocityRadS: number`を追加。

**理由**: D02熱ゲージ入力(`coilLossW`、Q1)、D05チャタリング境界の正しい検出(`isChatteringThisFrame`)、D01進行量の入力単位是正(`angularVelocityRadS`、Q4)。

**実装時期**: ゲート1(`destructionModes.ts`の型定義+`buildMotorOnlyFrameInput`/`buildVehicleFrameInput`の実装、物理式は未改修)。

---

## 6. `D05Progress`拡張(Q3・Q7)

**型**: `D05Progress`へ`cumulativeWearDeltaFraction: number`(無次元の恒久蓄積値)・`recoveryFramesLeft: number`(非負整数、0で非アクティブ)を追加。

**理由**: 摩耗換算経路(Q3確定、候補a)+一時接触抵抗悪化の回復区間モデル(Q7確定、候補a)。

**実装時期**: ゲート1(`destructionModes.ts`の型定義+validator)。

---

## 7. `MotorConfig`拡張(Q5・Q6)

**型**: `MotorConfig`へ`effectiveTurnsRatio?: number`・`brushContactResistanceRatio?: number`・`brushChatterProbabilityRatio?: number`を追加(いずれもオプショナル、既定値1.0で後方互換)。

**理由**: D01漸減の磁気結合率(Q5確定)+ブラシ写像のMotorConfig層(Q6確定)。Phase 2 Step 5a(`wireResistivityRatio`等)で確立した拡張パターンと同型。

**実装時期**: ゲート1(型宣言のみ)。物理効果への結線はゲート4(下記8)。

---

## 8. `computeElectricalState`/`computeMagneticTorque`/`computeContactResistance`/`nextChatterState`の式改修(Q5・Q6・Q7、**最重量**)

**変更**: `motorPhysics.ts`の4関数を改修し、上記7の3フィールドを実際に消費する。
- `computeElectricalState`(backEmf項)・`computeMagneticTorque`(tMag項)へ`effectiveTurnsRatio`を同一係数として適用(**エネルギー整合〈K_E=K_T相反性〉の要請、この根拠を実装コメントに1行残すこと**、Fable付帯条件)。
- `computeContactResistance`の戻り値へ`brushContactResistanceRatio`を乗算。
- `nextChatterState`のシグネチャを`(brushPressure, chatterFramesLeft, rng)`から`config`全体(または`brushChatterProbabilityRatio`)を受け取る形へ変更し、確率式`prob`へ乗算した上で最終`prob`を`[0,1]`へclampする(構造的安全網)。

**条件**: 既定値1.0(フィールド省略時)で既存の全計算結果と完全一致すること。既存回帰テスト`motorPhysics.test.ts`(49 tests、2026-08-10実測で全件成功済み)が実装後も全件成功することをDoDとする。

**実装時期**: ゲート4(`motorPhysics.ts`)。エンジン凍結方針の範囲内と正式Fable裁定済み。

---

## 9. `D02Progress`への発煙latchフィールド追加(Q8)

**型**: `D02Progress`へ`smokingStarted: boolean`・`smokingStartedAtT: number | null`を追加(不可逆latch、D04の`stage`/`initiatingCauseLog`と同型)。

**理由**: エナメル絶縁の熱劣化は実物で不可逆であり、D01/D04と同じ規律。`initiatingCauseLog`相当のフィールドは、D02CauseLogが単一スカラーのみで複数原因を持たないため追加しない(Fable確認済み)。

**実装時期**: ゲート1(`destructionModes.ts`の型定義+`restoreRunSnapshot`raw validatorへの交差不変条件`smokingStarted===false ⟺ smokingStartedAtT===null`追加)。

---

## 10. `D05CauseLog`への理論電流フィールド追加(Q9)

**型**: `D05CauseLog`へ`theoreticalCurrentA: number`を追加。既存`CauseLogCommon.currentA`は仕様どおり実電流(チャタリング中は0)のまま維持する。

**理由**: D05のepisode成立stepは定義上チャタリング中で実電流が常に0であり、強度を正しく記録するには理論遮断電流を別記する必要がある(P3-2-Q4(iii)と同原則)。

**実装時期**: ゲート1(`destructionModes.ts`)。

---

## 11. `MaterialSelection.brushId`必須フィールド追加(Q10)

**型**: `MaterialSelection`へ`brushId: BrushMaterialId`を必須フィールドとして追加(既存`batteryId`と同格)。

**理由**: ブラシ素材写像(`mapBrushRatios`・`mapD05BrushWearConfig`)の入力として必須。既存`batteryId`必須化の前例に倣う。

**実装時期**: ゲート2(`materialMapping.ts`の型定義+`composeConfigFromMaterials`実消費+`materialMapping.test.ts`全fixture+`scripts/materialSweep.ts`全消費者、同一ゲートで実施)。

---

## 12. `restoreRunSnapshot`の復元契約厳格化(Q7・Q12)

**変更**: `restoreRunSnapshot`(destructionOrchestration.ts)の`validateMotorConfigShape(motorConfigRaw)`呼び出し直後へ、base config専用の追加値制約(`effectiveTurnsRatio === undefined || effectiveTurnsRatio === 1`)を追加。あわせて`initialDestructionState.modes.D05.recoveryFramesLeft <= destructionConfig.d05.recoveryFrames`のcross-validatorを追加(P3-3-Q7確定により)。

**理由**: `effectiveTurnsRatio`は素材によらず新品時必ず1.0であるため、RunSnapshotのbase configに限ってはこの値制約を課すことで、破損・改竄されたlocalStorageデータからの不正な復元を防ぐ(D04/D07合成対象フィールドとは非対称、正式Fable裁定で正確性を確認済み)。`recoveryFramesLeft`の上限cross-validatorは、破損snapshotからの任意長の接触抵抗悪化を防ぐ。

**影響**: 既存の復元契約を厳格化する変更(従来は受理されていた「baseなのにeffectiveTurnsRatio非1」「configの上限を超えるrecoveryFramesLeft」という不正な組み合わせのRunSnapshotが、今後は拒否されるようになる)。P3-3時点でproduction配線・実ユーザーデータは存在しないため実害はない。

**実装時期**: ゲート1(`destructionOrchestration.ts`)。

---

## 13. `encodeRecipe`への新規failureモード追加(Q14)

**変更**: `encodeRecipe(recipe: CarRecipe): string`(recipeCode.ts)の戻り値型シグネチャ自体は変更しないが、内部で`recipe.motorConfig.effectiveTurnsRatio`が`undefined`でも`1`でもない場合に例外をthrowする新規failureモードを追加する。例外文言には本裁定(P3-3-Q14)への参照を1行含める。

**理由**: `effectiveTurnsRatio`はrecipeCode.tsへ意図的に追従しない(6.4節、base値は素材によらず常に1.0のため符号化する情報がない)。誤って`composeEffectiveMotorConfig`の出力(実行時のeffective config)を`encodeRecipe`へ渡すと、この情報がエラーなく静かに脱落する問題があり、fail-fastで検出できるようにする。候補(b)〈base専用型`Omit<MotorConfig,'effectiveTurnsRatio'>`への分離〉は、TypeScriptの過剰プロパティ検査がオブジェクトリテラルにのみ適用されるため実際には型レベルの防御にならない(「偽の安全」)と判定され却下された。

**影響**: シグネチャ自体(`string`を返す)は無改修のため、既存呼出し19箇所(定義1+`recipeCode.test.ts`17+`testRunStore.test.ts`1+`RecipePanel.tsx`1)のうち**成功系はすべて無改修のまま動作する**。新規failureモードへ実際に到達するテストケースを新設する場合のみ追加のテストコードが必要。

**実装時期**: ゲート1(`recipeCode.ts`)。

---

## 承認いただきたい範囲

上記1〜13の型変更・受理契約の変更について、計画書`docs/phase3-p3-3-plan.md`(v7)どおりに実装を進めてよいかご承認をお願いします。数値較正値(`decayExposureScaleRad`・`smokeResistanceMultiplier`・`recoveryFrames`等)はいずれも本バンドルの承認対象に含めず、ゲート5の較正sweepで確定し別途報告します。
