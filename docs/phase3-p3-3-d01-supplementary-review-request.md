# Fable補足レビュー依頼: P3-3 D01 checkpoint5較正sweep(floor到達可能性が未充足)

正式Fable checkpoint5較正レビュー(2026-08-10、値群ごとの判定+Gate6解禁条件)がD01(`decayExposureScaleRad`/`minEffectiveTurnsRatio`)について指示した追加sweep(4条件: 漸減性・観測可能性・floor到達可能性・NORMAL_OPERATION非トリガ)を実施した結果、現行値(`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`)は**条件3(floor到達可能性)を満たさない**ことが実測で判明しました。Suu_mot3の明示指示(「満たさない場合は値を変更せず停止し、実測全文と提案値をエスカレーションしてください」)に従い、値は変更せず停止し、本補足レビューを依頼します。

## 提出資料

- 本書(実測全文・harness再現情報の主資料)
- `docs/phase3-p3-3-checkpoint5-implementation-report.md`(D01が「fixture候補、値の大きさを支持する実測なし」と記載していた元の状態)
- `docs/phase3-p3-3-plan.md` v15、13.1.3節(D01較正証跡、本sweep以前の記述)

## 現在の状態

- P3-3 checkpoint5(統合較正閉包)は69ファイル1404テスト全緑で完了報告済み(Suu_mot3照合P56・P57通過)
- 正式Fable較正レビュー(2026-08-10)により、D02(`conductionScale`/`dissipationCoefficient`/`smokeResistanceMultiplier`)・D05共通5値・ブラシ8値は**採用確定**。付帯条件3点(Q15-3摩耗3値の数値回帰固定・接触抵抗4素材順位の具体値固定・貴金属`brushChatterProbabilityRatio=0.7`の効果単離実証)はいずれも反映済み(Suu_mot3照合P58通過)
- D01のみ**保留**(Gate6解禁を妨げる唯一の必須修正)。本書はその追加sweep結果の報告です
- production/testへの恒久差分: **D01探索用のproduction/testコードは残していません**。今回のD01 sweepはすべて一時的な探索コードとして実施し、完全にrevert済みです(`grep -c "TEMP_" src/materials/__tests__/materialMapping.test.ts` → 0)。恒久的なtest差分は、本checkpointの一連の作業全体を通じて付帯条件3のテスト1件・P58是正の数値回帰assertion1件のみであり、D01 sweep自体に起因する恒久差分はありません
- Gate6・commit・tag・push: 未着手

## 実測結果全文

### 条件2(観測可能性): 充足

代表的な劣化水準としてratio=0.75(現行値1000での実測プラトーが0.71〜0.92の範囲だったことに基づく代表値)を用い、トルク制限領域(既存のQ2/Q15-2 sweepと同型)で定常RPM低下を実測した。

| loadTorque(Nm) | ratio=1(劣化なし)窓平均RPM | ratio=0.75(劣化後)窓平均RPM | 低下率 |
|---|---|---|---|
| 0.003 | 860.7898038405073 | 599.3917511421481 | 30.37% |
| 0.005 | 631.9754876874289 | 199.65189542873978 | 68.41% |
| 0.007 | 399.98616664677627 | 0(失速) | 100% |

目安3%を大きく上回り、明確に観測可能。

### 条件4(NORMAL_OPERATION非トリガ): 充足(既存実測)

Q13-2既存テスト(実在全5コース×全3電池、15組合せ)で`D01Progress.triggered===false`を全組合せで直接確認済み(checkpoint5報告時の付帯条件1、`docs/phase3-p3-3-checkpoint5-implementation-report.md` §4.6参照)。追加sweep不要。

### 条件1(漸減性)・条件3(floor到達可能性): 現行値(decayExposureScaleRad=1000)は条件3を満たさない

**現行値でのtrajectory実測(motor-only free-spin、`varnished:false`、`loadTorque=0`)**: 4構成いずれも40秒間(4800フレーム)floorへ一切到達しない。

| coilTurns | magnetDistanceMm | 崩壊トリガ時刻(triggeredAtS) | decayExposureRadのプラトー値 | プラトー時点のeffectiveTurnsRatio | 40秒時点のomega(rad/s) |
|---|---|---|---|---|---|
| 15 | 8 | 4.691666666666666 | 292.6341151356759 | 0.7073658848643241 | 0(完全失速) |
| 15 | 10 | 5.225 | 217.60714924446563 | 0.7823928507555343 | 0(完全失速) |
| 10 | 8 | 8.475 | 77.4163912161609(まだ増加中、減衰継続) | 0.922583608783839 | 28.595677602878084(減速継続中) |
| 20 | 10 | 4.583333333333333 | 271.8388621147568 | 0.7281611378852432 | 188.81404799446105(定常、COIL_DEFORM_OMEGA未満で停滞) |

floor(ratio=0.5)には`decayExposureRad>=500`が必要だが、いずれの構成もプラトー値がこれを大きく下回る。

**根本原因(実測から判明した負のフィードバック)**: `effectiveTurnsRatio`の低下は`computeMagneticTorque`のトルク定数も比例して低下させる(K_E=K_T相反性、正式Fable P3-3-Q5裁定)。無負荷自由回転(loadTorque=0)では、劣化が進む→トルク定数低下→コギング/ブラシ摩擦等の抵抗トルクに対し発生トルクが不足→回転数低下→`|angularVelocityRadS|`が`COIL_DEFORM_OMEGA`(209.4395102393 rad/s、2000RPM相当)を下回る→減衰蓄積が停止(既存の「停止時ゼロ」契約どおり)、という自己制限ループが生じる。構成によっては最終的に完全停止(omega=0)まで減速し、そこで永久に停止する。

**decayExposureScaleRadを変えた場合の参考測定(値の変更は行わず、最良構成coilTurns=15/magnetDistanceMm=8のみで測定)**:

| decayExposureScaleRad | floor到達 | floor到達秒数(崩壊トリガ後) |
|---|---|---|
| 1000(現行) | 未到達 | - |
| 700 | 未到達 | - |
| 500 | 未到達 | - |
| 300 | 未到達(プラトー0.5684、僅差) | - |
| 250 | 未到達(プラトー0.5434) | - |
| **200** | **到達** | **1.30秒(floorReachedAtS 5.991666666666666 − triggeredAtS 4.691666666666666)** |
| 150 | 到達 | 0.87秒(条件1のハード要件〈1秒未満禁止〉に抵触の恐れ) |
| 100 | 到達 | 0.53秒(条件1のハード要件に明確に抵触) |

scaleを下げるほどfloor到達は近づくが、同時に条件1(「段差ではなく漸減」、1秒未満での到達禁止、目安2秒以上)と正面から競合する非常に狭いwindow(200付近)しかなく、200でも目安の「2秒以上」には届かない。

## harness再現情報(探索コードrevert後も第三者が同一測定を再構築できる水準)

以下はすべて`src/materials/__tests__/materialMapping.test.ts`内の既存ヘルパー・型・定数(いずれも現在もファイルに存在する)を用いて再構築できる。

**共通定数**: `DT_G5 = 1/120`(既存定義、1021行目)。`NO_NOISE_RNG_G5 = () => 0.5`(既存定義、1022行目)。trajectory計測では`stepMotorWithDestruction`のrng引数にも同じ`() => 0.5`固定値を使用した。

**base MotorConfig(`pvMotorCar`ヘルパー、既存定義、1041行目付近)**:
```ts
const baseMotor: MotorConfig = {
  coilTurns: 80, slitWidthMm: 1.5, sandingQuality: 0.9, brushPressure: 0.3,
  magnetStrength: 0.5, magnetDistanceMm: 10, batteryVoltage: 3, axisOffsetMm: 0,
  wireGaugeMm: 0.4, parallelStrands: 1, varnished: true,
  ...motorOverrides, // trajectory計測では { coilTurns, magnetDistanceMm } で上書き(下表)
};
const baseCar: CarConfig = {
  massG: 150, gearEfficiency: 0.8, gearRatio: 4, wheelDiameterMm: 30, tireGrip: 0.7,
  axleFriction: 0, wheelAlignmentMm: 0, centerOfMassHeightMm: 20, motorMountOffsetMm: 0,
};
const G5_BASELINE: MaterialCompositionBaseline = { chassisBaselineG: 150, baseGearEfficiency: 0.8 };
const selection: MaterialSelection = {
  wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom',
  batteryId: 'battery-lithium-polymer', brushId: 'brush-carbon',
};
const { motorConfig: composed } = composeConfigFromMaterials(baseMotor, baseCar, G5_BASELINE, selection); // .ok===trueを前提
const motorConfig: MotorConfig = { ...composed, varnished: false }; // 崩壊を許可するための上書き(baseMotorのvarnished:trueを無効化)
```

**motorOverrides(4構成)**: `{ coilTurns: 15, magnetDistanceMm: 8 }` / `{ coilTurns: 15, magnetDistanceMm: 10 }` / `{ coilTurns: 10, magnetDistanceMm: 8 }` / `{ coilTurns: 20, magnetDistanceMm: 10 }`。

**DestructionConfig(`g5LipoDestructionConfig`ヘルパー、既存定義、1064行目付近)**:
```ts
const destructionConfig: DestructionConfig = {
  battery: mapD04BatteryDestructionConfig('battery-lithium-polymer'),
  d01: { decayExposureScaleRad: /* 表の値、既定1000 */, minEffectiveTurnsRatio: 0.5 },
  d02: { smokeGaugeThreshold: 0.6, coilOverheatGaugeLimit: 1, conductionScale: 0.04, dissipationCoefficient: 0.5, smokeResistanceMultiplier: 1.2 },
  d04: { bodyScorchDeltaFraction: mapBodyScorchDeltaFraction('body-ps-cowl'), magnetScorchDeltaFraction: mapMagnetScorchDeltaFraction('magnet-neodymium') },
  d05: { brushSparkDurationLimitS: 0.15, brushSparkCurrentThresholdA: 3, brushWearRateRatio: 1, highCurrentPenalty: { kind: 'thresholdPenalty', highCurrentPenaltyThresholdA: 8, highCurrentPenaltyMultiplier: 1.5 }, wearPerAmpSecond: 0.001, recoveryFrames: 6, recoveryContactResistanceMultiplier: 1.2 },
  d06: { breakage: { kind: 'nonBreakable' } },
  d07: mapD07DestructionConfig('magnet-neodymium'),
  d09: { bearingSeizureGaugeLimit: 1 },
};
```
d01のみ表中の値へ差し替え、他フィールドは不変。

**初期state・snapshot構築**:
```ts
const initialMotorState: SimState = { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 };
const snapshot = captureRunSnapshot({
  motorConfig, carConfig: null, destructionConfig,
  runContext: { context: 'motor', fireExposureProfile: { bodyEquipped: false, adjacentRolesEquipped: [] }, gearTotalToothCount: null },
  initialMotorState, initialVehicleState: null, track: null, courseLengthM: null, slopeRad: null,
  seed: 1, initialDestructionState: createInitialDestructionState('lipo'),
});
let accumulator = createRunAccumulator(snapshot);
let motorState = snapshot.initialMotorState;
```

**stepループ(loadTorque=0固定、effectiveInertia省略=既定計算値)**:
```ts
for (let i = 0; i < totalFrames; i++) { // totalFrames=4800(40秒)
  const result = stepMotorWithDestruction(motorState, accumulator, DT_G5, () => 0.5, 0);
  motorState = result.physicsState;
  accumulator = result.accumulator;
  // ...崩壊時刻・floor判定は下記
}
```

**崩壊時刻(triggeredAtStep)の判定方法**: `accumulator.destructionState.modes.D01.triggered`が`false`から`true`へ変わった最初のstep index(`i`)。`triggeredAtS = triggeredAtStep * DT_G5`。この遷移は、内部的に`varnished:false`かつ`|omega| > COIL_DEFORM_OMEGA`(209.4395102393 rad/s)が`COIL_DEFORM_FRAMES`(360フレーム=3秒)連続した時点で`coilCollapsedRisingEdge`が立ち、`advanceD01`が`triggered:true`へ遷移する(`src/engine/motorPhysics.ts`の`nextDeformState`・`src/engine/destructionModes.ts`の`advanceD01`、いずれも既存実装、変更なし)。

**floor到達(floorReachedAtStep)の判定方法**: `triggeredAtStep`以降の各step、`ratio = Math.max(minEffectiveTurnsRatio, 1 - d01.decayExposureRad / decayExposureScaleRad)`(`composeEffectiveMotorConfig`が使う式と同一)を計算し、`ratio <= 0.5`になった最初のstep index。`floorReachedAtS = floorReachedAtStep * DT_G5`(未到達の場合はnull、triggeredAtSからの経過秒数が「floor到達秒数」列の値)。

**観測可能性測定(条件2)のharness**: D01状態機械を経由せず、`MotorConfig.effectiveTurnsRatio`を直接上書きして`step()`(`stepMotorWithDestruction`ではなく`motorPhysics.ts`の`step`関数を直接呼ぶ、destructionState不要)を呼ぶ。
```ts
const { motorConfig: base } = pvMotorCar(selection); // motorOverridesなし(coilTurns:80, magnetDistanceMm:10の既定のまま)
const config: MotorConfig = { ...base, effectiveTurnsRatio }; // 1 または 0.75
let state: SimState = { theta: Math.PI / 4, omega: 0, current: 0, backEmf: 0, shorted: false, running: true, rpm: 0, chatterFramesLeft: 0, batteryHeat: 0, coilCollapsed: false, highSpeedFrameCount: 0 };
const rpmHistory: number[] = [];
for (let i = 0; i < 1200; i++) { // totalFrames=1200
  state = step(config, state, DT_G5, NO_NOISE_RNG_G5, loadTorque); // loadTorque ∈ {0.003, 0.005, 0.007}
  if (i >= 1200 - 240) rpmHistory.push(state.rpm); // 末尾240フレーム(windowFrames)を窓平均
}
const meanAll = rpmHistory.reduce((a, b) => a + b, 0) / rpmHistory.length;
```

## 必須回答

1. **decayExposureScaleRadの確定値**: 上記実測に基づき、200前後が条件1のハード要件(1秒未満での到達禁止)と条件3(floor到達可能性)を両立する下限に近い値だが、条件1の目安(2秒以上)には届かない。この値をそのまま確定してよいか、それとも他の値・他のアプローチを指示するか裁定してください。
2. **代替案A(構成の見直し)**: 本sweepはmotor-only・無負荷(loadTorque=0)のharnessに限定しています。実際のゲームプレイ(車体文脈、走行抵抗・坂道・転がり摩擦等が常時存在)では、この「無負荷ゆえの自己停止」が起きにくい可能性があります。車体文脈(vehicle-only、track-run)での虐待構成による再sweepを追加で行うべきか指示してください。
3. **代替案B(モデルの見直し)**: 自己制限フィードバック自体(劣化→トルク低下→減速→減衰停止、場合によっては完全停止)が意図された挙動か、それとも軽減すべき設計上の懸念か所見をお願いします。仮にモデル自体の見直し(例: 減衰蓄積の駆動式を角速度ではなく別の量にする、停止時ゼロの条件を緩和する等)が必要な場合、これはP3-3-Q4(確定済み)の再考を意味するため、その要否も併せて判定してください。
4. **人間再承認要否**: 上記1〜3のいずれの裁定についても、`decayExposureScaleRad`の値変更自体は既存の`DestructionConfig.d01`型の範囲内(値のみの変更)であり新規の型契約変更を伴わないため、Q15-6で確定した経路(Fable候補裁定→sweep→確定申請→人間commit承認)のとおり、値の確定は人間commit承認に包含される(個別の型契約再承認は不要)という理解でよいか確認してください。

## 重点確認事項

- 条件1(漸減性)と条件3(floor到達可能性)が、少なくとも今回試したmotor-only無負荷harnessでは非常に狭いwindowでしか両立しないという実測結果が、他の較正値(D02等)のように「受け入れ領域が十分な余裕を持つ」形にならない可能性がある点。
- 「floorは崩れた巻線の残存結合という物理的意味が明確」という正式Fable裁定の前提が、今回発見した自己制限フィードバック(無負荷では実質的にfloorへ到達しにくい)とどう整合するか。

## Suu_mot3の推奨(参考、alice_mot3は独断で確定していません)

なし(本書はalice_mot3が実測結果に基づき作成した一次エスカレーションであり、Suu_mot3の推奨はまだ受領していません)。

## pitfalls#1遵守の明記

本依頼書への正式回答は、人間プロジェクトリードの直接提示、またはSuu_mot3が中継したものだけを正式回答として扱います。alice_mot3はいかなるツールを用いてもFable名義の文書を自己生成しません。
