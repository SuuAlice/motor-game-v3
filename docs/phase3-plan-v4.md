# Phase 3統合計画(破壊モード+図鑑)— v4改訂版

作成: alice_mot3 2026-07-25。実装・commit未着手。

本書は`docs/phase3-plan-v3.md`をSuu_mot3三次レビュー(2026-07-24T15:40着信、以下「レビューv3」)6項目に基づき改訂したものである。**v3をこの文書で置き換える。** レビューv3は「温度の次元偽装撤回・D03/D04の継続条件・モード別Progress・D08のengine型除外・テスト境界の具体化は妥当」と確認した上で、契約上の不足6点を指摘している。v2→v3の改善点はすべて維持する。

対象: spec.md §7(破壊モードと失敗図鑑)。docs/spec.md を唯一の正とする。CLAUDE.md(b)(c)拡張点。

## 改訂差分サマリ(レビューv3 6項目への対応)

| # | レビューv3指摘 | 対応節 | 要旨 |
|---|---|---|---|
| 1 | §2.4統合案に状態の入出力経路がない | 2.4 | 3関数それぞれの加算的ラッパー関数の完全シグネチャ・状態所有者・初期化・受け渡しを明記 |
| 2 | 既存API直接変更は影響大、代替案と比較を | 2.4 | 既存3関数は無改修のまま加算的ラッパーを新設する案(案2)を採用。変更ファイル・呼び出し元・後方互換を列挙し2案を比較、Fableへ提示 |
| 3 | D04のshortCircuitDurationS参照元が未定、二重積分の恐れ | 2.1・3.1 | `DestructionState`に`shared`(共有信号)を新設し、短絡継続時間は一度だけ積分。D03/D04はcauseLogへスナップショットするのみ |
| 4 | 短絡解除時の減衰/リセットの意味論が未確定 | 3.1 | 「継続時間として即時リセット」案と「累積ストレスとして漸減(要改称)」案を提示、前者を推奨としてFable判断事項に明記 |
| 5 | 「全10種」誤記、D09見送り時のスコープ例外未記載 | 2.3・3.3・13・14 | 誤記を9種へ訂正。D09をStep6で見送る場合もD08同様に人間スコープ例外承認が必要と明記 |
| 6 | temperatureC/measurementUnavailableの不整合状態・仕様判断の未提示 | 2.2 | 判別unionへ変更(不整合状態を型で排除)。Phase3で未計測を許容するか/温度モデル完成まで未完成扱いとするかをFableへ明示的に諮る |

v3から**内容不変**の節: 0・1・3.2・3.4・4・5・6・7・8・10・11。**改訂**: 2.1・2.2・2.3(誤記のみ)・2.4・3.1・3.3・12・13・14。

---

## 0. スコープ境界(不変)

v3と同じ。D01〜D09が対象(D08はengine側`DestructionState`には含めない、2.3節)。D10はPhase4。

## 1. 既存資産の棚卸し(不変)

v3と同じ。

---

## 2. モジュール構成と状態機械設計

```
src/engine/destructionModes.ts          # 新規。D01〜D07・D09の状態機械(純関数)。motorPhysics.ts等への依存なし(leafモジュール)
src/engine/destructionOrchestration.ts  # 新規(v4で追加)。motorPhysics/vehiclePhysics/trackPhysicsとdestructionModesを結合する加算的ラッパーのみをexport(2.4節)
src/engine/__tests__/destructionModes.test.ts
src/engine/__tests__/destructionOrchestration.test.ts
src/materials/wearAccumulation.ts       # 新規(v1から不変)
src/materials/__tests__/wearAccumulation.test.ts
```

`destructionModes.ts`を`motorPhysics.ts`と同じ「leafモジュール」(他のengineモジュールに依存しない)に保つ方針を明記する。3節の状態機械はmotorPhysics.ts由来の値を**引数として**受け取るだけで、motorPhysics.ts/vehiclePhysics.ts/trackPhysics.tsをimportしない。vehicle層・track層との結合は新設の`destructionOrchestration.ts`が担う(2.4節)。これによりdestructionModes.tsの単体テストがmotor-onlyの入力だけで完結し、車体・コースの複雑さを持ち込まない。

### 2.1 型設計: 共有信号+モード別明示名付きProgress(v3から改訂: レビューv3 #3反映)

v3は`D03Progress`にのみ`shortCircuitDurationS`を持たせ、「D04はD03の値を共有参照するか複製するかはStep5で確定する」と未決のまま残していた。レビューで、型上D04Progressにその値が存在せずどこから読むか不定であり、共有か独立かを本計画レベルで確定しないと同一物理量の二重積分・不一致が起き得ると指摘された。該当のとおり修正する。

**確定方針**: 「短絡継続時間」はD03固有でもD04固有でもなく、両モードが参照する**物理現象そのもの**(電池が短絡し続けている、という1つの事実)である。したがって`DestructionState`直下に`shared`(共有信号)を新設し、**積分は1箇所でのみ**行う。D03/D04の各`Progress`は独自の継続量を持たず、発火時に`shared`の値をcauseLogへ**スナップショットとして複製するのみ**とする(複製は「発火した瞬間の記録」であり、複製後に再積分されることはない。2.2節のcauseLog不変規約と同じ扱い)。

```ts
export interface DestructionSharedSignals {
  shortCircuitDurationS: number; // 短絡継続秒数。D03/D04が共通で参照する唯一の積分(3.1節)
}

export function createInitialSharedSignals(): DestructionSharedSignals {
  return { shortCircuitDurationS: 0 };
}

export interface D01Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  causeLog: D01CauseLog | null;
}

export interface D02Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  coilHeatGaugeRatio: number; // 0–1、無次元(3.2節、v3から不変)
  causeLog: D02CauseLog | null;
}

export interface D03Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  // 継続量は持たない。sharedSignals.shortCircuitDurationSを毎step参照するのみ(2.1節)
  causeLog: D03CauseLog | null;
}

export interface D04Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning'; // Step5で段階時間確定(3.1節、v3から不変)
  stageEnteredAtT: number | null;
  // 継続量は持たない。sharedSignals.shortCircuitDurationSを毎step参照するのみ(2.1節)
  causeLog: D04CauseLog | null;
}

export interface D05Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  sparkDurationS: number; // D05固有(D03/D04と物理現象が異なるため共有しない)
  causeLog: D05CauseLog | null;
}

export interface D06Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  causeLog: D06CauseLog | null; // 瞬間判定
}

export interface D07Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  magnetHeatGaugeRatio: number; // 0–1、無次元(3.2節、v3から不変)
  causeLog: D07CauseLog | null;
}

export interface D09Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  bearingHeatGaugeRatio: number;
  causeLog: D09CauseLog | null; // Step6で設計自体を再審査(3.3節)
}

export interface DestructionState {
  shared: DestructionSharedSignals;
  modes: {
    D01: D01Progress; D02: D02Progress; D03: D03Progress; D04: D04Progress;
    D05: D05Progress; D06: D06Progress; D07: D07Progress; D09: D09Progress;
    // D08は含めない(2.3節)
  };
}

export function createInitialDestructionState(): DestructionState {
  return {
    shared: createInitialSharedSignals(),
    modes: { /* 全モードtriggered:false、継続量0、causeLog:null */ },
  };
}
```

`advanceDestructionState(prev, frame, config, dt) -> { state, events }`のシグネチャ自体(v2からの確定事項)は変わらない。内部で①`shared`を先に更新→②各モードの判定が更新後の`shared`を参照する、という順序を固定する(D03/D04の判定式が同一stepの`shared`更新後の値を見ることを保証する)。

### 2.2 CauseLogの次元誠実性: 判別unionへの変更(v3から改訂: レビューv3 #6反映)

v3の`temperatureC: number | null` + `measurementUnavailable: boolean`は、「`temperatureC`が`null`なのに`measurementUnavailable`が`false`」のような、型上表現可能だが意味をなさない不整合状態を作れると指摘された。判別unionへ変更し、不整合状態そのものを型で表現不可能にする。

```ts
export type TemperatureReading =
  | { kind: 'measured'; temperatureC: number }
  | { kind: 'unavailable' };

export interface CauseLogCommon {
  currentA: number;               // A(spec §7.1「電流」)
  rpm: number;                    // min⁻¹(spec §7.1「回転数」)
  atT: number;                    // セッション内秒(spec §7.1「タイムスタンプ」)
  temperature: TemperatureReading; // spec §7.1「温度」。3.2節の案採用状況に応じてkindが決まる
}

export interface D01CauseLog extends CauseLogCommon {} // temperatureは常に{kind:'unavailable'}(コイル自体の温度指標が存在しないため)
export interface D02CauseLog extends CauseLogCommon { coilHeatGaugeRatio: number; }
export interface D03CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; } // sharedからのスナップショット複製(2.1節)
export interface D04CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; stage: D04Progress['stage']; }
export interface D05CauseLog extends CauseLogCommon { sparkDurationS: number; }
export interface D06CauseLog extends CauseLogCommon { loadTorqueNm: number; }
export interface D07CauseLog extends CauseLogCommon { magnetHeatGaugeRatio: number; }
export interface D09CauseLog extends CauseLogCommon { bearingHeatGaugeRatio: number; }
```

**Fableへ諮る仕様判断(レビューv3 #6の核心)**: `temperature`が`{kind:'unavailable'}`になり得ることは、spec §7.1「破壊時のパラメータログ(電流・温度・回転数・タイムスタンプ)をエンジンが記録する」という要求を満たすかどうかという仕様解釈そのものに関わる。2案を提示する。

- **案A(Phase3推奨)**: `{kind:'unavailable'}`をPhase3の正式な仕様として許容する。実温度モデルを持たないモード(D01・D02・D07・D09、3.2節案A採用時)は`unavailable`のまま「完成」として扱い、DoD(13節)もこれを前提とする。理由: 3.2節で述べるとおり、実温度モデル(案B)は新規較正値・熱容量/熱抵抗の調査を要し、Phase3のスコープを実質的に拡大する。捏造しないという規律さえ守れれば、「未計測であることを明示した記録」自体がspec §7.1の趣旨(検死レポートの原本として誠実な記録を残す)に反しないと考える。
- **案B**: 温度モデル(3.2節案B)が完成するまで、当該モードは「未完成」として扱い、Phase3のDoDから個別に除外する(D08と同様の人間スコープ例外扱いが、D02/D07等にも波及し得る)。

alice所見は案A。ただし判断そのものをFableへ諮る(12節Step1・Step2ゲート事項)。

### 2.3 D08の扱い(誤記訂正のみ、v3から内容不変)

v3の「D01〜D09の**全10種**を含む」は誤記であり、**全9種**(D01〜D09)に訂正する。それ以外の内容(engineの`DestructionState`からD08を完全除外し、図鑑UI用の予約枠はstore層/UI層専用の別型`FailureCodexModeId`に限定する設計、Fableへの裁定依頼)はv3から変更なし。

### 2.4 呼び出し境界: 加算的ラッパーによる単一オーケストレーション(v3から全面改訂: レビューv3 #1・#2反映)

v3は「既存`step`/`stepTestRun`/`stepTrackRun`の戻り値へ`destructionState`を追加する」とだけ書き、前stepの状態をどう入力するかを示していなかった。また既存exported関数の契約変更は既存テスト・呼び出し元への影響が大きいと指摘された。**両方の指摘を踏まえ、既存3関数を一切変更せず、それぞれを内部で呼ぶ新規の加算的ラッパー関数を`destructionOrchestration.ts`に追加する案(以下「案2」)へ変更する。**

#### 2.4.1 既存3関数(変更なし、シグネチャ再掲)

```ts
// src/engine/motorPhysics.ts(無改修)
export function step(
  config: MotorConfig, state: SimState, dt: number,
  rng?: Rng, loadTorque?: number, effectiveInertia?: number,
): SimState;

// src/engine/vehiclePhysics.ts(無改修)
export function stepTestRun(
  motorConfig: MotorConfig, carConfig: CarConfig, state: VehicleSimState,
  dt: number, courseLengthM: number, rng?: Rng, slopeRad?: number,
): VehicleSimState;

// src/engine/trackPhysics.ts(無改修)
export function stepTrackRun(
  motorConfig: MotorConfig, carConfig: CarConfig, track: ValidatedTrackDefinition,
  state: VehicleSimState, dt: number, rng?: Rng,
): VehicleSimState;
```

#### 2.4.2 新規ラッパー(destructionOrchestration.ts、案2)

```ts
export interface DestructionConfig {
  // 3節の較正値一式(素材由来、materialMapping.tsが計算)。MotorConfig/CarConfig
  // には混ぜない(素材非依存のMotorConfig契約に破壊しきい値まで混入させないため)
  coilOverheatGaugeLimit: number;
  shortCircuitDurationLimitS: number;
  batteryRunawayHeatThreshold?: number;
  brushSparkDurationLimitS: number;
  brushSparkCurrentThresholdA: number;
  gearStrengthThresholdNm: number;
  magnetHeatGaugeLimit: number;
  bearingSeizureGaugeLimit?: number; // Step6確定後に追加
}

export interface DestructionStepResult<TPhysicsState> {
  physicsState: TPhysicsState;        // 既存step関数がそのまま返す値。中身は無改変
  destructionState: DestructionState;  // 次stepへ持ち越す値(2.1節)
  destructionEvents: DestructionEvent[]; // このstepで新規発火したイベントのみ
}

export function stepMotorWithDestruction(
  config: MotorConfig, motorState: SimState,
  destructionState: DestructionState, destructionConfig: DestructionConfig,
  dt: number, rng?: Rng, loadTorque?: number, effectiveInertia?: number,
): DestructionStepResult<SimState> {
  const physicsState = step(config, motorState, dt, rng, loadTorque, effectiveInertia); // 既存、無改修
  const { state, events } = advanceDestructionState(
    destructionState, frameInputFromSimState(physicsState), destructionConfig, dt,
  );
  return { physicsState, destructionState: state, destructionEvents: events };
}

export function stepTestRunWithDestruction(
  motorConfig: MotorConfig, carConfig: CarConfig, vehicleState: VehicleSimState,
  destructionState: DestructionState, destructionConfig: DestructionConfig,
  dt: number, courseLengthM: number, rng?: Rng, slopeRad?: number,
): DestructionStepResult<VehicleSimState> {
  const physicsState = stepTestRun(motorConfig, carConfig, vehicleState, dt, courseLengthM, rng, slopeRad); // 既存、無改修
  const { state, events } = advanceDestructionState(
    destructionState, frameInputFromSimState(physicsState.motor), destructionConfig, dt,
  );
  return { physicsState, destructionState: state, destructionEvents: events };
}

export function stepTrackRunWithDestruction(
  motorConfig: MotorConfig, carConfig: CarConfig, track: ValidatedTrackDefinition,
  vehicleState: VehicleSimState, destructionState: DestructionState, destructionConfig: DestructionConfig,
  dt: number, rng?: Rng,
): DestructionStepResult<VehicleSimState> {
  const physicsState = stepTrackRun(motorConfig, carConfig, track, vehicleState, dt, rng); // 既存、無改修
  const { state, events } = advanceDestructionState(
    destructionState, frameInputFromSimState(physicsState.motor), destructionConfig, dt,
  );
  return { physicsState, destructionState: state, destructionEvents: events };
}
```

#### 2.4.3 状態の所有者・初期化・受け渡し

- **所有者**: `DestructionState`の値自体はstore層(gameStore.ts、brabit所有)のZustand stateスライスが保持する。これは既存の`simState`・`vehicleState`と全く同じ扱いであり、engine側(`destructionOrchestration.ts`)は毎回引数で受け取り新しい値を返すだけで、内部に保持しない(8節の決定論境界と整合)。
- **初期化**: セッション開始時、store層が`createInitialDestructionState()`(2.1節)を呼び、`destructionState`スライスへ格納する。既存の`createInitialVehicleState`呼び出し箇所(`resetTestRun`・`startCourseRun`)、およびLab/ベンチ試験開始相当の箇所と同じタイミングで呼ぶ。
- **次stepへの受け渡し**: store層の3つの`stepXxx`関数(`stepSim`・`stepTestRun`・`stepCourseRun`)が、`set((s) => {...})`内で`s.destructionState`を読み、`stepXxxWithDestruction`へ渡し、返ってきた`destructionState`を次の`set`の戻り値に含める。既存の`s._vehicleRngState`(前回値を読んで次回値を書き戻す)と同型のパターンであり、store層に新しい設計原則を持ち込まない。

#### 2.4.4 案1(既存API直接変更)との比較

| 観点 | 案1: 既存`step`/`stepTestRun`/`stepTrackRun`の引数・戻り値を直接変更 | 案2(推奨): 加算的ラッパーを新設、既存3関数は無改修 |
|---|---|---|
| 二段API凍結方針・既存契約への影響 | 3関数のシグネチャ・戻り値契約そのものを変更する後方非互換変更 | 既存3関数は一切変更しない |
| 既存テスト(motorPhysics/vehiclePhysics/trackPhysics関連、既存206+819テストの一部)への影響 | 戻り値の型・呼び出し元アサーションの修正が広範囲に必要になり得る | ゼロ(既存関数・既存テストは無改修で通る) |
| `scripts/sweep.ts`・`scripts/vehicleSweep.ts`への影響 | これらが`step`/`stepTestRun`等を直接呼んでいる場合、影響を受ける | 影響なし。sweep側は`step`等の既存シグネチャをそのまま呼び続けられる(destructionを使わない用途では新規ラッパーを呼ぶ必要がない) |
| 呼び忘れ防止の型による担保 | 戻り値に`destructionState`が常に含まれるため、既存関数を呼ぶ限り型レベルで呼び忘れが起きない | `step`等を直接呼んでも型エラーにならないため、型だけでは呼び忘れを防げない |
| 呼び忘れ防止の運用上の担保 | (型で担保されるため運用ルールは不要) | 「gameStore.tsの3ループ(`stepSim`/`stepTestRun`/`stepCourseRun`)は`stepXxxWithDestruction`のみを呼ぶ」という規約を定め、store層の統合テスト(3ループそれぞれの戻り値が`destructionEvents`フィールドを持つことを検証)で担保する |
| 変更ファイル数 | engine 3ファイル(既存改修)+store 3箇所 | engine 2ファイル(新規)+store 3箇所(呼び出し先の切替のみ) |

alice所見は**案2(推奨)**。既存の凍結された物理エンジンAPIへ一切触れずに済み、影響範囲が新規ファイルとstore層の呼び出し先切替のみに限定される点を優先する。呼び忘れ防止が型で完全には担保できない点は案2の弱点であり、統合テストでの担保が実務上十分かを**Fableへ確認する**(12節Step1ゲート事項)。

---

## 3. D01〜D09個別設計

| ID | 物理トリガ(判定式) | 継続量 | 新規frame/config入力 | WearState書き込み |
|---|---|---|---|---|
| D01 コイル崩壊 | `frame.coilCollapsed`の立ち上がり(既存のみ) | なし | なし | なし |
| D02 エナメル焼損 | `coilHeatGaugeRatio >= config.coilOverheatGaugeLimit` | `coilHeatGaugeRatio`(モード固有) | `config.coilOverheatGaugeLimit` | なし |
| D03 電池破裂 | `shared.shortCircuitDurationS >= config.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= BATTERY_HEAT_LIMIT` | `shared.shortCircuitDurationS`(D04と共有、2.1節) | `config.shortCircuitDurationLimitS` | 電池は恒久結果を別スキーマ(WearState対象外) |
| D04 リポ炎上 | `shared.shortCircuitDurationS >= config.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= config.batteryRunawayHeatThreshold`(素材由来、3.4節)。過放電は3.1節のscope gap参照 | `shared.shortCircuitDurationS`(D03と共有)+`stage`(モード固有) | `config.batteryRunawayHeatThreshold?: number` | 同上 |
| D05 ブラシ火花 | `sparkDurationS >= config.brushSparkDurationLimitS` | `sparkDurationS`(モード固有) | `config.brushSparkDurationLimitS`・`config.brushSparkCurrentThresholdA` | `WearState.wearFraction`加算 |
| D06 ギヤ歯欠け | `frame.loadTorqueNm > config.gearStrengthThresholdNm`(瞬間判定) | なし | `frame.loadTorqueNm`(新規)、`config.gearStrengthThresholdNm` | `WearState.toothDamageFraction`加算 |
| D07 熱減磁 | `magnetHeatGaugeRatio >= config.magnetHeatGaugeLimit` | `magnetHeatGaugeRatio`(モード固有) | `config.magnetHeatGaugeLimit` | `WearState.demagnetizationFraction`加算。spec§7.3三段開示の代表例(6節) |
| D08 クラッシュ | Phase3は状態機械に含めない(2.3節) | — | — | — |
| D09 軸受焼付き | `bearingHeatGaugeRatio >= config.bearingSeizureGaugeLimit`(Step6で設計自体を再審査、3.3節) | `bearingHeatGaugeRatio`(モード固有) | 未確定(3.3節) | なし |

### 3.1 D03/D04: 短絡継続の共有信号と意味論の確定(v3から改訂: レビューv3 #3・#4反映)

**共有信号への統一(#3対応)**: 2.1節のとおり、「短絡継続時間」は`DestructionState.shared.shortCircuitDurationS`として一度だけ積分し、D03・D04双方の判定式・causeLogスナップショットがこの単一の値を参照する。D03Progress/D04Progress自身は独自の継続量を持たない。これにより「同一物理量の二重積分」は構造的に発生しない。

**解除時の意味論(#4対応、Fableへ諮る)**: v3の「`nextBatteryHeat`と同じ漏れ積分パターンで緩やかに減衰させる」という記述は、名前(継続時間[秒])と実装(累積ダメージ的な漸減)が食い違っており、根拠なく決めていたため撤回する。2つの解釈を提示する。

- **案1(推奨)**: `shortCircuitDurationS`を文字どおり「現在連続して短絡している秒数」として扱う。`frame.shorted`が偽になった瞬間、**即座に0へリセットする**。理由: spec原文「短絡持続」の字義に最も忠実であり、名前と実装が一致する(3.2節で温度を騙った反省を踏まえ、ここでも名前と実装を一致させることを優先する)。新規の減衰率定数を発明する必要がなく、根拠の要らない設計になる。欠点: 短絡が瞬断を繰り返す(チャタリング的な)状況で、実際には電池に蓄積している可能性のあるストレスをゼロ扱いしてしまう可能性があるが、これはD03の対象外(そのような蓄積現象はD02のコイル発熱やD05のブラシ火花など、別モードが別に捉えるべき現象と整理する)。
- **案2**: 「連続時間」ではなく「短絡による累積ストレス」として再定義し、フィールド名を`shortCircuitStressS`等へ改称した上で、`nextBatteryHeat`型の漏れ積分(減衰)を採用する。この場合、減衰率の物理的根拠(電池の自己回復に相当する現象が実在するか)を新たに示す必要がある。

alice所見は案1。**Step1の実装前計画でFableへ両案を提示し、確定させる**(12節)。

### 3.2 D02/D07: 無次元熱ゲージ(v3から内容不変)

v3の内容を維持する。案A(無次元ゲージ、Phase3推奨)/案B(実温度の集中定数モデル)をFableへ諮る。2.2節の「temperatureが`unavailable`のままで完成扱いとするか」という仕様判断とセットでStep2/Step5のゲート事項とする。

### 3.3 D09: 独立設計ゲート(v3から改訂: レビューv3 #5反映)

v3の内容(`bearingHeatGaugeRatio`への改称、無潤滑シグナルの入力源が未決、Step6を独立した設計・採否ゲートとする)を維持する。

**追加(レビューv3 #5対応)**: Phase3の対象表(spec §7.1・CLAUDE.mdフェーズ表)はD01〜D09を対象としている。D08は9節で確定済みのとおり「Phase5へ実トリガを移管する人間スコープ例外」として扱うが、**D09もStep6の設計・採否ゲートの結果として実装を見送る可能性を残す以上、見送りが確定した場合はD08と同様に「Phase3 DoD対象外とする人間のスコープ例外承認」を個別に得る**必要がある。本計画は「D09を実装するか見送るか」自体を確定させないため、13節DoD・14節未決事項一覧の双方にこの条件付き例外を明記する。

### 3.4 D04: 素材family/ID非依存の設計(v3から内容不変)

v3 3.4節の内容を維持する。

---

## 4. WearState→engine実効値の写像拡張(v3から内容不変)

v3 4節の内容を維持する(`DestructionConfig`の較正値群を`composeConfigFromMaterials`が起動時一度だけ計算する点は変わらない。2.4節で`DestructionConfig`をMotorConfigと別建てにしたことに伴い、`composeConfigFromMaterials`の戻り値に`DestructionConfig`を追加で持たせるか、別関数として分離するかはStep1実装計画で確定する)。

## 5. 三段開示・破壊イベント通知APIの決定論境界(v3から内容不変)

v3 5節の内容を維持する。

## 6. 三段開示・段階1のHUD境界(v3から内容不変)

v3 6節の内容を維持する。

## 7. 図鑑・個体永続状態のstore層所有(v3から内容不変、2.4節との整合注記を更新)

v3 7節の内容を維持する。追加確認事項の記述を更新: 2.4節の設計が「既存engine関数の戻り値契約変更」から「加算的ラッパー新設+store層の呼び出し先切替」へ変わったため、brabit_mot3との協議事項は「戻り値契約変更の合意」ではなく「gameStore.tsの3ループを新規ラッパーへ切り替える作業分担・`destructionState`スライスの追加」に変わる(協議自体は引き続き必要)。

## 8. 決定論境界の保証構造(v3から内容不変)

v3 8節の内容を維持する。2.4.3節の所有者・初期化・受け渡し設計はこの節の具体化である。

## 9. D08と(e)周回拡張の順序問題(v3から内容不変)

v3 9節の内容を維持する(A案確定、DoD除外は人間スコープ例外承認事項)。

## 10. Phase2繰越事項の採否・順序(v3から内容不変)

v3 10節の内容を維持する。

## 11. art-specにない独自解釈しない事項(v3から内容不変)

v3 11節の内容を維持する(検死レポート=図鑑統合、破壊後=操作待ちを確定済みとして反映済み。SE具体音色のみ未決)。

---

## 12. ステップ分割案(v3から改訂: レビューv3の各点を反映)

各stepの手順(v2から不変): **実装前ステップ計画→Suu_mot3レビュー→Fableレビュー→人間承認→実装→`npm run test && npm run build && npm run lint`→報告**。commitは人間承認後のみ。

1. **Step1: 契約の最小実証(D01/D03)**。`destructionModes.ts`(2.1・2.2節の型)+`destructionOrchestration.ts`(2.4節の加算的ラッパー、`stepMotorWithDestruction`のみ。D01/D03は車体層を要さないため)+D01/D03を実装する。D03は`shared.shortCircuitDurationS`+`config.shortCircuitDurationLimitS`を要するため新規較正値が1つ入る(D01は較正値ゼロのまま)。
   - **ゲート事項(Fableへ諮る)**:
     a. 2.1節の型設計(共有信号+モード別Progress)の妥当性
     b. 2.2節: `temperature: TemperatureReading`が`unavailable`のままで「完成」と扱えるか(案A)、温度モデル完成まで未完成扱いとするか(案B)
     c. 2.4節: 加算的ラッパー新設案(案2)の採否、および「呼び忘れ防止」を統合テスト+規約で担保する運用が十分か
     d. 3.1節: `shortCircuitDurationS`の解除時意味論(案1即時リセット/案2漸減、名称変更要否)
   - **テスト網羅(v3から不変)**: D01・D03それぞれについて非発火境界・発火境界・一度きり・ログ固定・dt分割不変性・相互非干渉を個別に用意する(v3 12節の記述をそのまま維持。D03のdt分割不変性テストは`shared.shortCircuitDurationS`が対象)。
   - **追加テスト(2.1節の共有信号設計に伴う)**: D03のみが発火する条件(`shortCircuitDurationLimitS`到達だが`batteryRunawayHeatThreshold`未設定または未到達)でD04が発火しないこと、およびD04のみが発火し得る条件(`batteryRunawayHeatThreshold`到達)でD03と同時に(同一stepで)発火し得ることを許容するか排他とするかを明記してテストする(spec上、破裂と炎上が同一stepで同時発生してよいかは独自解釈せずStep1計画でFableへ確認する)。
2. **Step2: D07磁石温度モデル+三段開示段階1・2の骨格**。`destructionOrchestration.ts`に`stepTestRunWithDestruction`を追加。3.2節・2.2節の案A/B採否をFableに確定してもらった上で着手する。
3. **Step3: D05ブラシパッケージ**(WearState結線込み)。
4. **Step4: D06ギヤ歯欠け+ギヤJ増接続**(Phase2繰越の解消)。`destructionOrchestration.ts`に`stepTrackRunWithDestruction`を追加(コース走行が絡むため)。
5. **Step5: D02/D04**。3.1節の`stage`遷移の具体的時間・過放電scope gapの採否をここで確定する。
6. **Step6: D09、独立設計ゲート**(3.3節)。実装するか見送るか自体をこのstepで確定する。**見送る場合は3.3節のとおりD08と同様の人間スコープ例外承認を得る**。
7. **Step7: D08型・図鑑予約枠のみ**(2.3節・9節)。
8. **Step8: 図鑑store・WearState永続化**(brabit協働、7節)。2.4節の`gameStore.ts`切替をここでbrabit_mot3と最終合意する。
9. **Step9: 計測器店UI接続**(brabit、三段開示段階3)。

## 13. DoD・テスト方針(v3から改訂: レビューv3 #5反映)

- 既存DoD不変: `npm run test && npm run build && npm run lint`
- **例外1**: 「全モードの再現手順テスト」からD08を除外する(9節、人間承認事項)
- **例外2(新設)**: D09がStep6で実装見送りとなった場合、D08と同様にPhase3 DoD対象外とする人間スコープ例外承認を個別に得る(3.3節)
- engine変更には対応する数値テストを必ず追加
- 決定論: 同一シード+同一WearStateで同一`DestructionEvent`列が出ることをテストで担保

## 14. 未決事項一覧(v3から改訂: レビューv3 #5反映)

- 7節・2.4節: `gameStore.ts`の3ループ切替作業分担・`destructionState`スライス設計 — brabit_mot3との協議で確定
- 2.2節: `temperature`が`unavailable`のままで完成扱いとするか(案A) / 温度モデル完成まで未完成扱いとするか(案B) — Fable判断
- 2.4節: 加算的ラッパー案(案2)の採否、呼び忘れ防止の運用担保で十分か — Fable判断
- 3.1節: `shortCircuitDurationS`の解除時意味論(即時リセット案1/漸減・改称案2) — Step1でFable判断
- 3.2節: D02/D07/D09の無次元ゲージ案(案A)vs実温度モデル案(案B) — Fable判断
- 3.1節: D04の過放電トリガをPhase3で実装するか将来枠か — Step5でFable/人間へ諮る
- 3.3節: D09を実装するか見送るか自体、見送り時の人間スコープ例外承認 — Step6で確定
- 12節Step1: D03/D04が同一stepで同時発火してよいか(排他か許容か) — Step1計画でFableへ確認
- D02/D05/D06/D09の較正値・式の具体値 — 各ステップ実装計画で個別に確定
- 9節: D08をPhase3 DoD対象外とする扱いの人間承認 — 本計画のFableレビュー後に諮る
- 11節③: D01〜D09の具体的音色仕様 — brabit_mot3の別ステップ計画事項(本計画スコープ外)
