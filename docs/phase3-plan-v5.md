# Phase 3統合計画(破壊モード+図鑑)— v5改訂版

作成: alice_mot3 2026-07-25(v1〜v4)。改訂: alice_mot3 2026-08-02(v5、開発再開後)。
**状態: Suuレビュー前・Fable未提出・実装/commit未着手。**

本書は`docs/phase3-plan-v4.md`をSuu_mot3の開発再開後指示(2026-08-01T16:19着信、以下「v5改訂指示」)5項目に基づき改訂したものである。**v4をこの文書で置き換える。v4は履歴として保持する(削除しない)。** v5改訂指示の要旨: (1) v4 §12 Step1のD04関連テストをStep5へ正式移管し付記(1)を本文へ統合、(2) v4 §2.4のvehicle/trackラッパー例からD06 loadTorqueNmを取得できるという誤解を除去、(3) 「v3と同じ」「内容不変」のみで済ませていた節を実体化し単独再開可能な自己完結版にする、(4) v4までに解消済みの指摘・未決事項11項目・Fable重点確認事項を欠落させない、(5) 日付・状態を再開時点へ更新する。

対象: spec.md §7(破壊モードと失敗図鑑)。docs/spec.md を唯一の正とする。CLAUDE.md(b)(c)拡張点。

**本書の自己完結性について**: v2〜v4では複数の節が「v3と同じ」「v2 X節の内容を維持する」という参照のみで実体を再掲していなかった。特にv3・v4はさらにその参照元であるv2自体が「v1不変」と一段深く参照していた節もあり、v3/v4だけを読んでも設計の全体像を再構成できない箇所があった(例: §4・§5・§7・§8・§10は要約や追記のみで原文が失われていた)。v5では該当箇所すべてに確定済みの実体を書き戻し、かつv2時点の用語(`coilOverheatThreshold`等の旧名称、単一`causeLog.temperature`フィールド)をv3・v4で確定した現行の名称・型設計に置き換えた。旧名称のまま残っていた場合、それは古い設計のまま矛盾していたことを意味するため、本改訂で発見し次第修正した(§4の較正値名一覧など)。

---

## 0. スコープ境界(v2から確定・不変)

- 対象はD01〜D09のみ。**D10(鉄心短絡)はPhase4**(spec §9.2の被膜ダメージ蓄積・巻線記録方式に依存するため)。
- **D08(クラッシュ)のトリガはspec §6.5の周回コース(κ(s)・保持判定)に依存し、これはCLAUDE.md §2(e)でPhase5スコープと確定済み**。Phase3時点では周回コースが存在しないため、D08は状態機械の型・遷移・演出コールバックの枠のみ用意し、実トリガの結線はPhase5(e)-1完成後とする(9節で詳述、A案採用確定済み)。
- 未接続5ファミリー(coating/substrate/roller/body)の扱いは10節で整理する。

## 1. 既存資産の棚卸し(v2から確定・不変)

`src/engine/`は凍結構造(CLAUDE.md)。D01〜D09はゼロから作るのではなく、既存の凍結フィールドを**物理トリガの生信号**として再利用し、その上に「個体劣化・初回発見・三段開示」という新しい意味論を被せる設計とする。

再利用対象(motorPhysics.ts、変更不要):
- `SimState.coilCollapsed: boolean` — ワニス崩壊(v1.5由来、D01の生トリガ)
- `SimState.batteryHeat` + `BATTERY_HEAT_LIMIT`(D02/D03の生トリガ)
- `SimState.shorted`(D03/D10系)
- `SimState.chatterFramesLeft` + `CHATTER_PRESSURE_THRESHOLD`(D05候補)
- `src/engine/failures.ts`(診断ヒント系)は別物として維持する。名前衝突を避けるため新規モジュールは`destructionModes.ts`とする

再利用対象(materials/、Phase2成果):
- `WearState`(inventoryItem.ts)— D05/D06/D07の書き込み先
- `composeConfigFromMaterials`(materialMapping.ts)— 4節で拡張

---

## 2. モジュール構成と状態機械設計

```
src/engine/destructionModes.ts          # 新規。D01〜D07・D09の状態機械(純関数)。motorPhysics.ts等への依存なし(leafモジュール)
src/engine/destructionOrchestration.ts  # 新規。motorPhysics/vehiclePhysics/trackPhysicsとdestructionModesを結合する加算的ラッパーのみをexport(2.4節)
src/engine/__tests__/destructionModes.test.ts
src/engine/__tests__/destructionOrchestration.test.ts
src/materials/wearAccumulation.ts       # 新規。DestructionEvent→WearStateへの加算量を計算する純関数。engineに依存しない
src/materials/__tests__/wearAccumulation.test.ts
```

`destructionModes.ts`を`motorPhysics.ts`と同じ「leafモジュール」(他のengineモジュールに依存しない)に保つ方針を明記する。3節の状態機械はmotorPhysics.ts由来の値を**引数として**受け取るだけで、motorPhysics.ts/vehiclePhysics.ts/trackPhysics.tsをimportしない。vehicle層・track層との結合は新設の`destructionOrchestration.ts`が担う(2.4節)。これによりdestructionModes.tsの単体テストがmotor-onlyの入力だけで完結し、車体・コースの複雑さを持ち込まない。

### 2.1 型設計: 共有信号+モード別明示名付きProgress

v1(agmsg送付のみ)は`destructionModes.ts`が状態を持たず`alreadyTriggered`をstore層が管理する設計だったが、spec §7.1・AGENTS.md (b)「演出タスクではなくエンジンの状態機械」と矛盾するため撤回した(v2で修正)。v2はモード共通の汎用`accumulator: number`フィールドを使い回す設計だったが、単位・意味が異なる継続量(電池発熱ゲージ・電流継続時間・コイル熱ゲージ等)を同じフィールド名に押し込めると誤接続を型で検出できないと指摘され、モードごとに明示名を持つ`XxxProgress`型へ分離した(v3で修正)。さらにv3は`D03Progress`にのみ`shortCircuitDurationS`を持たせ「D04はD03の値を共有参照するか複製するかはStep5で確定する」と未決のまま残していたが、型上D04Progressにその値が存在せずどこから読むか不定で二重積分・不一致が起き得ると指摘され、共有信号として一本化した(v4で修正)。

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
  coilHeatGaugeRatio: number; // 0–1、無次元(3.2節)
  causeLog: D02CauseLog | null;
}

export interface D03Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  // 継続量は持たない。sharedSignals.shortCircuitDurationSを毎step参照するのみ(本節)
  causeLog: D03CauseLog | null;
}

export interface D04Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning'; // Step5で段階時間確定(3.1節)
  stageEnteredAtT: number | null;
  // 継続量は持たない。sharedSignals.shortCircuitDurationSを毎step参照するのみ(本節)
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
  magnetHeatGaugeRatio: number; // 0–1、無次元(3.2節)
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

`advanceDestructionState(prev, frame, config, dt) -> { state, events }`(v2からの確定シグネチャ)は変わらない。内部で①`shared`を先に更新→②各モードの判定が更新後の`shared`を参照する、という順序を固定する(D03/D04の判定式が同一stepの`shared`更新後の値を見ることを保証する)。`events`は「この1ステップで新規にtriggeredへ遷移したモード」のみを含む(空配列が大半)。呼び出しタイミング・rng消費順は2.4.3節、決定論境界は8節を参照。

### 2.2 CauseLogの次元誠実性: 判別unionへの変更

v2は全モード共通の単一`temperature: number`フィールドに、モードごとにbatteryHeat・current・rpm等まったく異なる次元の値を代入する設計だった(D01は専用の温度指標がないため電池発熱を代用する暫定処置すら検討していた)。これは次元偽装であるとレビューで指摘され撤回した。v3では`temperatureC: number | null` + `measurementUnavailable: boolean`の2フィールド構成へ改めたが、「`temperatureC`が`null`なのに`measurementUnavailable`が`false`」のような、型上表現可能だが意味をなさない不整合状態を作れる欠陥が残っていた。v4で判別unionへ変更し、不整合状態そのものを型で表現不可能にした。

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

export interface D01CauseLog extends CauseLogCommon {} // temperatureは常に{kind:'unavailable'}(コイル自体の温度指標が存在しないため。電池発熱等の代用は行わない)
export interface D02CauseLog extends CauseLogCommon { coilHeatGaugeRatio: number; }
export interface D03CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; } // sharedからのスナップショット複製(2.1節)
export interface D04CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; stage: D04Progress['stage']; }
export interface D05CauseLog extends CauseLogCommon { sparkDurationS: number; }
export interface D06CauseLog extends CauseLogCommon { loadTorqueNm: number; }
export interface D07CauseLog extends CauseLogCommon { magnetHeatGaugeRatio: number; }
export interface D09CauseLog extends CauseLogCommon { bearingHeatGaugeRatio: number; }
```

**スナップショット確定の原則(v2で確定、以後不変)**: `causeLog`は`triggered`がfalse→trueに反転するその1ステップの`frame`引数の値をそのままCauseLogとして書き込み、以後は上書きしない(2.1節の`shared`複製ルールと同じ「発火した瞬間の記録」の扱い)。`HistorySample[]`のようなウィンドウ探索・後付け生成は行わない(5節)。フィールドはspec §7.1「破壊時のパラメータログ(電流・温度・回転数・タイムスタンプ)」の記載範囲に厳密に一致させ、根拠のない追加フィールド(検討時に候補へ上がった`theta`等)は追加しない。将来、特定モードの検死レポートに追加数値が必要と判明した場合は、そのモードのステップ実装計画(12節)で個別に根拠を示して追加する。

**Fableへ諮る仕様判断**: `temperature`が`{kind:'unavailable'}`になり得ることは、spec §7.1「破壊時のパラメータログ(電流・温度・回転数・タイムスタンプ)をエンジンが記録する」という要求を満たすかどうかという仕様解釈そのものに関わる。2案を提示する。

- **案A(Phase3推奨)**: `{kind:'unavailable'}`をPhase3の正式な仕様として許容する。実温度モデルを持たないモード(D01・D02・D07・D09、3.2節案A採用時)は`unavailable`のまま「完成」として扱い、DoD(13節)もこれを前提とする。理由: 3.2節で述べるとおり、実温度モデル(案B)は新規較正値・熱容量/熱抵抗の調査を要し、Phase3のスコープを実質的に拡大する。捏造しないという規律さえ守れれば、「未計測であることを明示した記録」自体がspec §7.1の趣旨(検死レポートの原本として誠実な記録を残す)に反しないと考える。
- **案B**: 温度モデル(3.2節案B)が完成するまで、当該モードは「未完成」として扱い、Phase3のDoDから個別に除外する(D08と同様の人間スコープ例外扱いが、D02/D07等にも波及し得る)。

alice所見は案A。ただし判断そのものをFableへ諮る(12節Step1・Step2ゲート事項、15節)。

### 2.3 D08の扱い

v3の「D01〜D09の**全10種**を含む」は誤記であり、**全9種**(D01〜D09)に訂正した。engineの`DestructionState`からD08を完全除外し、図鑑UI用の予約枠はstore層/UI層専用の別型`FailureCodexModeId`(D01〜D09の全9種+D08、store層またはUI層で定義)に限定する。この型はengineの`DestructionModeId`(Phase3時点ではD01〜D07・D09の8種)とは別物であり、Phase5で(e)-1完成後にengine側`DestructionModeId`へD08を追加した時点で両者は一致する。

この設計(engine型を最小に保ち、拡張はPhase5で型そのものを広げる/store層に別枠を作る、のどちらを採るか)は**Fableへ裁定を依頼する**(12節Step7ゲート事項)。

### 2.4 呼び出し境界: 加算的ラッパーによる単一オーケストレーション

v2は「呼び出し境界をstore層ではなくengine層(既存3関数自体)に置く」案として、`step`/`stepTestRun`/`stepTrackRun`の戻り値へ直接`destructionState`を追加する設計だった。v3レビューで、前stepの状態をどう入力するかが示されておらず、また既存exported関数の契約変更は既存テスト・呼び出し元(sweep.ts等)への影響が大きいと指摘された。**両方の指摘を踏まえ、既存3関数を一切変更せず、それぞれを内部で呼ぶ新規の加算的ラッパー関数を`destructionOrchestration.ts`に追加する案(以下「案2」)へv4で変更した。**

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

// motor-only版。D01/D02/D03/D04/D05/D07/D09はいずれもモーター軸の生信号のみに
// 依存し車両層の量を必要としないため、この関数の対象になり得る(D06は対象外、後述)
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
```

**vehicle/track版の契約骨格(D06のloadTorqueNm入力は未確定、Step4で設計)**: `stepTestRunWithDestruction`・`stepTrackRunWithDestruction`は、`stepMotorWithDestruction`と同型の入出力契約(既存物理ステップを無改修で呼び、`DestructionStepResult`を返す)を踏襲する点は確定しているが、**frame構築の実装は本計画時点では確定させない**。

理由: `stepMotorWithDestruction`が使う`frameInputFromSimState(physicsState)`はmotor-only の`SimState`しか見ておらず、D06の判定に必要な`loadTorqueNm`(車両層`stepVehicle`内部で計算される量で、motor-only側の`SimState`には含まれない)を供給できない。v4ではこの2関数についても`frameInputFromSimState(physicsState.motor)`を呼ぶ具体的なコード例を示していたが、これはD06入力を欠いたまま「動くコード例」に見えてしまう誤りだったため、本改訂で例自体を削除し契約骨格のみに置き換える。

```ts
export function stepTestRunWithDestruction(
  motorConfig: MotorConfig, carConfig: CarConfig, vehicleState: VehicleSimState,
  destructionState: DestructionState, destructionConfig: DestructionConfig,
  dt: number, courseLengthM: number, rng?: Rng, slopeRad?: number,
): DestructionStepResult<VehicleSimState>;
// 内部でstepTestRun(既存、無改修)を呼んだ後、advanceDestructionStateへ渡すframeの構築方法は
// Step4(D06実装時)で確定する。motor-only用のframeInputFromSimStateにloadTorqueNmの代理値・
// 偽値を入れて済ませることはしない。VehicleSimStateを受け取る専用のframe builder(仮称
// frameInputFromVehicleSimState)を新設するか、frameInputFromSimStateを拡張するかはStep4で決める。

export function stepTrackRunWithDestruction(
  motorConfig: MotorConfig, carConfig: CarConfig, track: ValidatedTrackDefinition,
  vehicleState: VehicleSimState, destructionState: DestructionState, destructionConfig: DestructionConfig,
  dt: number, rng?: Rng,
): DestructionStepResult<VehicleSimState>;
// 同上。stepTrackRun(既存、無改修)を呼んだ後のframe構築方法はStep4で確定する。
```

#### 2.4.3 状態の所有者・初期化・受け渡し・呼び出しタイミング

- **所有者**: `DestructionState`の値自体はstore層(gameStore.ts、brabit所有)のZustand stateスライスが保持する。これは既存の`simState`・`vehicleState`と全く同じ扱いであり、engine側(`destructionOrchestration.ts`)は毎回引数で受け取り新しい値を返すだけで、内部に保持しない(8節の決定論境界と整合)。
- **初期化**: セッション開始時、store層が`createInitialDestructionState()`(2.1節)を呼び、`destructionState`スライスへ格納する。既存の`createInitialVehicleState`呼び出し箇所(`resetTestRun`・`startCourseRun`)、およびLab/ベンチ試験開始相当の箇所と同じタイミングで呼ぶ。
- **次stepへの受け渡し**: store層の3つの`stepXxx`関数(`stepSim`・`stepTestRun`・`stepCourseRun`)が、`set((s) => {...})`内で`s.destructionState`を読み、`stepXxxWithDestruction`へ渡し、返ってきた`destructionState`を次の`set`の戻り値に含める。既存の`s._vehicleRngState`(前回値を読んで次回値を書き戻す)と同型のパターンであり、store層に新しい設計原則を持ち込まない。
- **呼び出しタイミング・rng消費順**: `advanceDestructionState`は、各`stepXxxWithDestruction`ラッパー内部で既存物理ステップ(`step`/`stepTestRun`/`stepTrackRun`)の呼び出し直後、rngを一切消費せずに呼ばれる(2.4.2のコード参照)。1ステップ内の消費順は「①既存物理ステップ内部のrng消費処理(chatter判定等を含む)→②既存物理ステップが`SimState`/`VehicleSimState`を確定→③`advanceDestructionState`(②の結果を読むだけ)」に固定され、既存物理ステップ内部のrng消費順序には一切触れない(既存テストのシード再現性に影響しない)。1フレームあたり物理ステップ最大2回の非機能要件は`advanceDestructionState`にも同様に適用される(既存物理ステップと同じ回数だけ呼ばれる)。

#### 2.4.4 案1(既存API直接変更)との比較

| 観点 | 案1: 既存`step`/`stepTestRun`/`stepTrackRun`の引数・戻り値を直接変更 | 案2(推奨): 加算的ラッパーを新設、既存3関数は無改修 |
|---|---|---|
| 二段API凍結方針・既存契約への影響 | 3関数のシグネチャ・戻り値契約そのものを変更する後方非互換変更 | 既存3関数は一切変更しない |
| 既存テスト(motorPhysics/vehiclePhysics/trackPhysics関連、既存206+819テストの一部)への影響 | 戻り値の型・呼び出し元アサーションの修正が広範囲に必要になり得る | ゼロ(既存関数・既存テストは無改修で通る) |
| `scripts/sweep.ts`・`scripts/vehicleSweep.ts`への影響 | これらが`step`/`stepTestRun`等を直接呼んでいる場合、影響を受ける | 影響なし。sweep側は`step`等の既存シグネチャをそのまま呼び続けられる(destructionを使わない用途では新規ラッパーを呼ぶ必要がない) |
| 呼び忘れ防止の型による担保 | 戻り値に`destructionState`が常に含まれるため、既存関数を呼ぶ限り型レベルで呼び忘れが起きない | `step`等を直接呼んでも型エラーにならないため、型だけでは呼び忘れを防げない |
| 呼び忘れ防止の運用上の担保 | (型で担保されるため運用ルールは不要) | 「gameStore.tsの3ループ(`stepSim`/`stepTestRun`/`stepCourseRun`)は`stepXxxWithDestruction`のみを呼ぶ」という規約を定め、store層の統合テスト(3ループそれぞれの戻り値が`destructionEvents`フィールドを持つことを検証)で担保する |
| 変更ファイル数 | engine 3ファイル(既存改修)+store 3箇所 | engine 2ファイル(新規)+store 3箇所(呼び出し先の切替のみ) |

alice所見は**案2(推奨)**。既存の凍結された物理エンジンAPIへ一切触れずに済み、影響範囲が新規ファイルとstore層の呼び出し先切替のみに限定される点を優先する。呼び忘れ防止が型で完全には担保できない点は案2の弱点であり、統合テストでの担保が実務上十分かを**Fableへ確認する**(12節Step1ゲート事項、15節)。

---

## 3. D01〜D09個別設計

| ID | 物理トリガ(判定式) | 継続量 | 新規frame/config入力 | WearState書き込み |
|---|---|---|---|---|
| D01 コイル崩壊 | `frame.coilCollapsed`の立ち上がり(既存のみ) | なし | なし | なし |
| D02 エナメル焼損 | `coilHeatGaugeRatio >= config.coilOverheatGaugeLimit` | `coilHeatGaugeRatio`(モード固有) | `config.coilOverheatGaugeLimit` | なし |
| D03 電池破裂 | `shared.shortCircuitDurationS >= config.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= BATTERY_HEAT_LIMIT` | `shared.shortCircuitDurationS`(D04と共有、2.1節) | `config.shortCircuitDurationLimitS` | 電池は恒久結果を別スキーマ(WearState対象外) |
| D04 リポ炎上 | `shared.shortCircuitDurationS >= config.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= config.batteryRunawayHeatThreshold`(素材由来、3.4節)。過放電は3.1節のscope gap参照 | `shared.shortCircuitDurationS`(D03と共有)+`stage`(モード固有) | `config.batteryRunawayHeatThreshold?: number` | 同上 |
| D05 ブラシ火花 | `sparkDurationS >= config.brushSparkDurationLimitS` | `sparkDurationS`(モード固有) | `config.brushSparkDurationLimitS`・`config.brushSparkCurrentThresholdA` | `WearState.wearFraction`加算 |
| D06 ギヤ歯欠け | `frame.loadTorqueNm > config.gearStrengthThresholdNm`(瞬間判定) | なし | `frame.loadTorqueNm`(新規、2.4.2節のとおりStep4でframe構築方法を確定)、`config.gearStrengthThresholdNm` | `WearState.toothDamageFraction`加算 |
| D07 熱減磁 | `magnetHeatGaugeRatio >= config.magnetHeatGaugeLimit` | `magnetHeatGaugeRatio`(モード固有) | `config.magnetHeatGaugeLimit` | `WearState.demagnetizationFraction`加算。spec§7.3三段開示の代表例(6節) |
| D08 クラッシュ | Phase3は状態機械に含めない(2.3節) | — | — | — |
| D09 軸受焼付き | `bearingHeatGaugeRatio >= config.bearingSeizureGaugeLimit`(Step6で設計自体を再審査、3.3節) | `bearingHeatGaugeRatio`(モード固有) | 未確定(3.3節) | なし |

### 3.1 D03/D04: 短絡継続の共有信号と意味論の確定

**共有信号への統一**: 2.1節のとおり、「短絡継続時間」は`DestructionState.shared.shortCircuitDurationS`として一度だけ積分し、D03・D04双方の判定式・causeLogスナップショットがこの単一の値を参照する。D03Progress/D04Progress自身は独自の継続量を持たない。これにより「同一物理量の二重積分」は構造的に発生しない。

**解除時の意味論(Fableへ諮る)**: v2の「`nextBatteryHeat`と同じ漏れ積分パターンで緩やかに減衰させる」という記述は、名前(継続時間[秒])と実装(累積ダメージ的な漸減)が食い違っており、根拠なく決めていたため撤回した。2つの解釈を提示する。

- **案1(推奨)**: `shortCircuitDurationS`を文字どおり「現在連続して短絡している秒数」として扱う。`frame.shorted`が偽になった瞬間、**即座に0へリセットする**。理由: spec原文「短絡持続」の字義に最も忠実であり、名前と実装が一致する(2.2節で温度を騙った反省を踏まえ、ここでも名前と実装を一致させることを優先する)。新規の減衰率定数を発明する必要がなく、根拠の要らない設計になる。欠点: 短絡が瞬断を繰り返す(チャタリング的な)状況で、実際には電池に蓄積している可能性のあるストレスをゼロ扱いしてしまう可能性があるが、これはD03の対象外(そのような蓄積現象はD02のコイル発熱やD05のブラシ火花など、別モードが別に捉えるべき現象と整理する)。
- **案2**: 「連続時間」ではなく「短絡による累積ストレス」として再定義し、フィールド名を`shortCircuitStressS`等へ改称した上で、`nextBatteryHeat`型の漏れ積分(減衰)を採用する。この場合、減衰率の物理的根拠(電池の自己回復に相当する現象が実在するか)を新たに示す必要がある。

alice所見は案1。**Step1の実装前計画でFableへ両案を提示し、確定させる**(12節、15節)。

### 3.2 D02/D07: 無次元熱ゲージ

v2の`coilHeatAccumulator`・`magnetTempAccumulator`(`current²×dt`の漏れ積分)は、抵抗値・熱容量・熱抵抗を含まない簡易蓄積であり、これを「温度」と呼び実在素材のカタログ値(°C)と直接比較する設計は次元不整合であると指摘され撤回した。

**Fableへ諮る2案:**

- **案A(推奨、Phase3採用案)**: 既存`SimState.batteryHeat`と全く同型の設計を踏襲する。`coilHeatGaugeRatio`・`magnetHeatGaugeRatio`は0–1の無次元ゲージであり、「実測相当の温度」を主張しない。しきい値(`coilOverheatGaugeLimit`・`magnetHeatGaugeLimit`)も無次元(既存`BATTERY_HEAT_LIMIT=1.0`と同型)とし、較正値コメントに「このゲージが上限に達するのは、実在素材のカタログ値(°C)に基づく参考シナリオでおおよそこの負荷条件に相当する」という**参考情報としての出典**は残すが、シミュレーション内部の比較は無次元同士で完結させる。`CauseLog.temperature`は常に`{kind:'unavailable'}`とする(2.2節)。実装コストは既存`nextBatteryHeat`のコピー拡張程度で小さい。
- **案B**: I²R発熱・熱容量・熱抵抗(放熱)・初期/周囲温度を含む最小の集中定数熱モデルを構築し、実際に°C単位の`temperature: {kind:'measured', temperatureC}`を出力する。実在材料の比熱・熱抵抗相当値を新たにカタログ調査・較正する必要があり、Phase3のスコープを実質的に拡大する。

alice所見は案A(Phase3では無次元ゲージに留め、`temperature`は正直に`{kind:'unavailable'}`とする)。ただし次元の誠実性そのものが指摘の核心である以上、**採否はFable判断とする**(12節Step2/Step5ゲート事項、15節)。2.2節の「temperatureが`unavailable`のままで完成扱いとするか」という仕様判断とセットで確定する。

### 3.3 D09: 独立設計ゲート

v2の`bearingWearAccumulator`も同様に「温度」を騙る設計だった点を訂正し、3.2節と同じく`bearingHeatGaugeRatio`(無次元)へ改称した。

加えて、「無潤滑シグナル」の入力源(高速回転時の潤滑不足をどの既存パラメータから読むか、あるいは新規パラメータを要するか)が未決のままD09を統合計画の確定事項として扱っていた点も訂正する。**D09は12節のStep6において独立した設計・採否ゲートとして扱い、本計画では「実装するかどうか」自体を確定させない。** 既存パラメータ(`sandingQuality`等)の意味を変えて転用することは禁止し、必要であれば新規の集計済み物理パラメータとしてFable審査の対象にする。

**Phase3 DoDとの関係**: Phase3の対象表(spec §7.1・CLAUDE.mdフェーズ表)はD01〜D09を対象としている。D08は9節で確定済みのとおり「Phase5へ実トリガを移管する人間スコープ例外」として扱うが、**D09もStep6の設計・採否ゲートの結果として実装を見送る可能性を残す以上、見送りが確定した場合はD08と同様に「Phase3 DoD対象外とする人間のスコープ例外承認」を個別に得る**必要がある。本計画は「D09を実装するか見送るか」自体を確定させないため、13節DoD・14節未決事項一覧の双方にこの条件付き例外を明記する。

### 3.4 D04: 素材family/ID非依存の設計

`materialMapping.ts`(alice所有、既存の較正値テーブル群と同じ書式)が、電池素材ごとに`batteryRunawayHeatThreshold`(数値、リポ系以外は`undefined`)を写像し、`DestructionConfig`(2.4.2節)へ渡す。engineはこの数値を`config.batteryRunawayHeatThreshold: number | undefined`として受け取り、`undefined`ならD04判定自体をスキップする(常にfalse)。engineのコード上に「リポ」「lithium」等の素材ID・family文字列が一切現れない設計を実装ステップの受け入れ条件とする。D03(電池破裂、既存`BATTERY_HEAT_LIMIT`)とD04(リポ炎上、`batteryRunawayHeatThreshold`)は独立した2つのしきい値比較として共存する。

```ts
// materialMapping.ts に追加(既存BATTERY_INTERNAL_RESISTANCE_RATIO_CALIBRATION等と同じ書式)
const BATTERY_RUNAWAY_HEAT_THRESHOLD_CALIBRATION: Record<BatteryMaterialId, number | undefined> = {
  // リチウムイオン系: 熱暴走特性を持つためBATTERY_HEAT_LIMIT未満の実測相当値を設定(出典コメント必須)
  // ニッケル水素・アルカリ系: 熱暴走特性を持たないためundefined(D04は物理的に発生しない)
};
```

---

## 4. WearState→engine実効値の写像拡張

現状`composeConfigFromMaterials`はWearStateを受け取らない。Phase3で以下を追加する:

```ts
export interface MaterialWearInput {
  magnetWear?: Extract<WearState, { kind: 'magnet' }>;
  gearWear?: Extract<WearState, { kind: 'gear' }>;
  brushWear?: Extract<WearState, { kind: 'brush' }>;
}
```

`composeConfigFromMaterials`の引数に`wear?: MaterialWearInput`を追加する(既存呼び出し元は省略可能、後方互換)。同時に、3節で確定した`DestructionConfig`(2.4.2節)のしきい値群(`coilOverheatGaugeLimit`・`shortCircuitDurationLimitS`・`batteryRunawayHeatThreshold`・`brushSparkDurationLimitS`・`brushSparkCurrentThresholdA`・`gearStrengthThresholdNm`・`magnetHeatGaugeLimit`・`bearingSeizureGaugeLimit`(D09、3.3節確定後))も、素材選択から一度だけ計算し、セッション中は不変のconfigとして持たせる(CLAUDE.md「写像は起動時に一度計算し、走行中は既存パラメータのみが生きる」を厳守)。

**未確定点(v4で判明)**: 2.4節で`DestructionConfig`を`MotorConfig`とは別建ての型にしたため、`composeConfigFromMaterials`の戻り値に`DestructionConfig`を追加で持たせるか、`DestructionConfig`専用の別関数(例: `composeDestructionConfigFromMaterials`)として分離するかは未確定である。Step1実装計画で確定する。

`wearAccumulation.ts`(新設)の責務: `DestructionEvent`→WearStateへの加算量を計算する純関数。engineに依存しない。

---

## 5. 三段開示・破壊イベント通知APIの決定論境界

### 5.1 固定dt状態遷移への統一

D02・D04・D07・D09は「継続量」を要するが、v1の`HistorySample[]`ウィンドウ依存設計は撤回し、`SimState.batteryHeat`と同型の**固定dt漏れ積分**(2.1節の各`XxxProgress`の明示フィールド、D03/D04は`shared.shortCircuitDurationS`)へ統一した。これにより:

- 毎step更新箇所: `advanceDestructionState`内、既存物理ステップ確定直後(2.4.3節)
- rng消費順: `advanceDestructionState`は非消費(2.4.3節)
- リプレイに必要な初期状態: `createInitialDestructionState()`(2.1節)
- `HistorySample`(既存、実験ノート用の記録)はdestructionModesの入力から完全に切り離され、三段開示段階2(自動差分検知)専用の用途に限定される(5.3節)

### 5.2 破壊イベント通知API

`DestructionEvent`は「生ログ(`causeLog`)」と「集計済みメタ(`mode`・`severity`)」を同居させる1つの型として渡す。判定ロジック自体はengine内で完結させ、UIに閾値判定を持ち込ませない。

```ts
export interface DestructionEvent {
  mode: DestructionModeId;
  causeLog: /* 2.2節のD0xCauseLog判別union */ unknown;
  severity: number; // 0–1。WearStateへの加算量計算に使う(4節)
}
```

コールバックの実体は「毎ステップ呼べる純粋な状態遷移関数」(`advanceDestructionState`)であり、EventEmitter的な登録機構ではない。呼び出し側(store層)が毎フレーム呼び、返ってきた`events`を見てUI側の演出・通知処理へ橋渡しする。

### 5.3 三段開示・段階2の所有

段階2(自動差分検知、「同一構成で3%低下」)の判定ロジック(同一レシピ照合+3%しきい値比較)はalice所有の純関数として`materials/`または新設`src/engine/regressionDiff.ts`に置く。実行タイミング・保存先(実験ノート追記)・UI表示はbrabit所有。既存`ExperimentSession`を比較材料として利用する。

---

## 6. 三段開示・段階1のHUD境界

- **段階1はbrabit所有。ただしHUDが走行中に参照してよいのは、セッション開始時に`composeConfigFromMaterials`が一度だけ合成した実効config(劣化込みの`magnetStrength`等)由来の`SimState`のみ**である。
- 永続`WearState`そのものを、走行中にHUDが再読み込み・再写像することは禁止する。理由: CLAUDE.md「写像は起動時に一度計算し、走行中は既存パラメータのみが生きる」の決定論境界を、演出コードが迂回して壊す経路になり得るため。
- 具体的には、性能低下アイコン・モーター音のピッチ低下は「劣化込みですでに下がっている`SimState.rpm`や`current`の値」をそのまま表示に使えばよく、`WearState.demagnetizationFraction`の数値を演出側が改めて参照する必要はない設計になっている(3節の`DestructionEvent`とcauseLogは「発火の通知・記録」用であり、「常時HUD表示」用ではない)。
- 段階2・段階3の所有分担は5.3節のとおり(段階2=alice判定ロジック+brabit実行/表示、段階3=brabit)。

---

## 7. 図鑑・個体永続状態のstore層所有

Phase2の分離パターン(`src/store/shopEconomy.ts`=alice寄り純粋ロジック / `src/store/shopEconomyStore.ts`=brabit所有Zustand hook)を踏襲する:

- **データスキーマ・純粋な変換関数**: `src/materials/`配下(alice所有)
- **Zustand store・localStorage永続・実個体IDの発行**: `src/store/`配下(brabit所有)。新設候補`src/store/failureCodexStore.ts`(persist key案`v3:failureCodex`)
- 個体在庫の永続化はPhase2の暫定ID方式からPhase3で初めて永続IDへ格上げする。ID発行はbrabit所有storeで行い、`InventoryItem`型自体は不変

**2.1節との整合**: 「セッション内で一度きり」(`XxxProgress.triggered`)はengine所有の一時状態(セッション終了で破棄)であり、「図鑑に初めて登録されたか」(`alreadyDiscoveredSet`相当)はstore層所有の永続状態である。両者は別物であり、store層の永続集合をengineへ注入することはない(engineの物理判定は何度目の発見でも同じ)。

**2.3節・2.4節との整合**: 2.3節のD08予約枠(store層専用の`FailureCodexModeId`)は本節のstore層所有パターンに従う。2.4節の設計が「既存engine関数の戻り値契約変更」から「加算的ラッパー新設+store層の呼び出し先切替」へ変わったため、brabit_mot3との協議事項は「戻り値契約変更の合意」ではなく「gameStore.tsの3ループを新規ラッパーへ切り替える作業分担・`destructionState`スライスの追加」に変わる(協議自体は引き続き必要)。

上記分担案は本計画のFableレビュー+brabit_mot3との最終合意を経て確定する。

---

## 8. 決定論境界の保証構造

engineの純関数(`advanceDestructionState`・`composeConfigFromMaterials`)はいずれも「毎回明示的に渡された引数のみから出力を計算する」。永続化された図鑑・WearStateを読むのは呼び出し側(store層)であり、それをengineへ引数として明示的に注入する。engine内部が`localStorage`やZustand storeを直接参照する経路は構造上ない。2.4.3節の所有者・初期化・受け渡し設計はこの節の具体化である。

**図鑑発見状態からの独立**: セッション開始時、store層は`createInitialDestructionState()`(2.1節)を呼んで`DestructionState`を初期化する。この初期化に図鑑の「発見済み」永続状態(7節)を一切混ぜない。したがって同一seedで同一レシピを何度再生しても、初回発見だろうと2回目だろうと`DestructionState`と`events`の遷移列は完全に同一になる(図鑑登録・報酬の要否だけがstore層で後から分岐する)。

---

## 9. D08と(e)周回拡張の順序問題

**A案を確定する。**

- Phase3では`FailureCodexModeId`(store層/UI層専用型、2.3節)に`'D08'`を含め、図鑑の型・予約枠として存在させる。ただしengineの`DestructionState`・`DestructionModeId`にはD08を含めない(2.3節、2.1節)。
- **Phase3のDoD「全モードの再現手順テスト」からD08を明示的に除外する。** D08の実トリガ実装・再現手順テストはPhase5(e)-1(周回構造)完成後の別ステップへ移管する。これは通常のフェーズ表(CLAUDE.md)からの逸脱にあたるため、**人間のスコープ例外承認事項として本計画のFableレビュー後、人間承認時に明示的に諮る**(「D08はPhase3 DoD対象外」の承認を個別に得る)。
- 理由: 「限界超過→コースアウト」の判定式は(e)の保持判定式そのものであり、Phase3時点の直線コースで代用トリガを作ると、Phase5本実装時に必ず作り直しになる(使い捨て物理)。CLAUDE.mdの「実物の工作・走行で起こりうる原因と対応させる」原則にも、直線コース上の代用クラッシュ条件は馴染まない。簡易代替トリガ案は不採用とする。

2.3節の型設計(engineの`DestructionModeId`からD08を除外し、store層専用型で予約枠を持つ)はこのA案をより厳密に実装した形であり、方針自体に矛盾はない。

---

## 10. Phase2繰越事項の採否・順序

- ブラシパッケージ(Fable判定済み): Phase3が実装先。D05設計(3節)がその本体。
- ギヤJ/D06: 同じくPhase3が実装先。D06トリガ設計(3節)に合わせ、ギヤ質量/慣性J増側の接続も同時に行う。
- 未接続5ファミリーのうちcoating/substrate/roller/body: 引き続きPhase3スコープ外。
- store層個体ID・永続化の所有: 7節で提案、brabit_mot3との協議で確定。

---

## 11. art-specにない独自解釈しない事項

1. **検死レポートのレイアウト**: 単独ダイアログではなく、**図鑑詳細画面へ統合**する(確定)。「紙」様式であること自体はart-spec §5.2で既定(N6地・暗色文字、レトロ攻略本の趣)。
2. **破壊イベント発生後の画面遷移**: 自動遷移ではなく、**プレイヤーの操作待ち**とする(確定)。
3. D01〜D09の具体的な音色仕様は、brabit_mot3の別ステップ計画で個別に提示する事項として残す(未決のまま、本計画のスコープ外)。SEを各モードへ割り当てること自体はart-spec §8で既定(「破壊モードD01〜D09それぞれに固有SEを割り当てる」と明記)。未決なのは各モードの具体的な音色仕様(周波数・エンベロープ等の詳細)のみ。

---

## 12. ステップ分割案

各stepの手順(不変): **実装前ステップ計画→Suu_mot3レビュー→Fableレビュー→人間承認→実装→`npm run test && npm run build && npm run lint`→報告**。commitは人間承認後のみ。

1. **Step1: 契約の最小実証(D01/D03)**。`destructionModes.ts`(2.1・2.2節の型)+`destructionOrchestration.ts`(2.4節の加算的ラッパー、`stepMotorWithDestruction`のみ。D01/D03は車体層を要さないため)+D01/D03を実装する。D03は`shared.shortCircuitDurationS`+`config.shortCircuitDurationLimitS`を要するため新規較正値が1つ入る(D01は較正値ゼロのまま)。
   - **ゲート事項(Fableへ諮る、15節)**:
     a. 2.1節の型設計(共有信号+モード別Progress)の妥当性
     b. 2.2節: `temperature: TemperatureReading`が`unavailable`のままで「完成」と扱えるか(案A)、温度モデル完成まで未完成扱いとするか(案B)
     c. 2.4節: 加算的ラッパー新設案(案2)の採否、および「呼び忘れ防止」を統合テスト+規約で担保する運用が十分か
     d. 3.1節: `shortCircuitDurationS`の解除時意味論(案1即時リセット/案2漸減、名称変更要否)
   - **テスト網羅**: D01・D03それぞれについて非発火境界・発火境界・一度きり・ログ固定・dt分割不変性・相互非干渉を個別に用意する。D03のdt分割不変性テストは`shared.shortCircuitDurationS`が対象。
   - **D04テストの扱い(v4付記(1)を本文へ統合)**: Step1はD01/D03のみを実装するため、D04の発火テスト・D03/D04同時発火テストはここでは実施しない。Step1で検証するのは共有信号`shared.shortCircuitDurationS`の更新がD03単独の入力(`batteryRunawayHeatThreshold`等D04関連configは一切設定しない状態)で正しく行われることのみとし、未実装のD04をテスト対象に含めない。D04関連のテストはStep5(D04実装時)へ移管する(下記Step5参照)。
2. **Step2: D07磁石温度モデル+三段開示段階1・2の骨格**。`destructionOrchestration.ts`に`stepTestRunWithDestruction`を追加。3.2節・2.2節の案A/B採否をFableに確定してもらった上で着手する。
3. **Step3: D05ブラシパッケージ**(WearState結線込み)。
4. **Step4: D06ギヤ歯欠け+ギヤJ増接続**(Phase2繰越の解消)。`destructionOrchestration.ts`に`stepTrackRunWithDestruction`を追加(コース走行が絡むため)。**2.4.2節の未確定点を解消する**: `loadTorqueNm`を含む車両用frame builderをここで設計する。
5. **Step5: D02/D04**。3.1節の`stage`遷移の具体的時間・過放電scope gapの採否をここで確定する。**Step1から移管したD04関連テスト(v4付記(1))**: D03のみが発火する条件(`shortCircuitDurationLimitS`到達だが`batteryRunawayHeatThreshold`未設定または未到達)でD04が発火しないこと、およびD04のみが発火し得る条件(`batteryRunawayHeatThreshold`到達)でD03と同時に(同一stepで)発火し得ることを許容するか排他とするかを明記してテストする(spec上、破裂と炎上が同一stepで同時発生してよいかは独自解釈せずここでFableへ確認する)。
6. **Step6: D09、独立設計ゲート**(3.3節)。実装するか見送るか自体をこのstepで確定する。**見送る場合は3.3節のとおりD08と同様の人間スコープ例外承認を得る**。
7. **Step7: D08型・図鑑予約枠のみ**(2.3節・9節)。
8. **Step8: 図鑑store・WearState永続化**(brabit協働、7節)。2.4節の`gameStore.ts`切替をここでbrabit_mot3と最終合意する。
9. **Step9: 計測器店UI接続**(brabit、三段開示段階3)。

## 13. DoD・テスト方針

- 既存DoD不変: `npm run test && npm run build && npm run lint`
- **例外1**: 「全モードの再現手順テスト」からD08を除外する(9節、人間承認事項)
- **例外2**: D09がStep6で実装見送りとなった場合、D08と同様にPhase3 DoD対象外とする人間スコープ例外承認を個別に得る(3.3節)
- engine変更には対応する数値テストを必ず追加
- 決定論: 同一シード+同一WearStateで同一`DestructionEvent`列が出ることをテストで担保

## 14. 未決事項一覧

- 7節・2.4節: `gameStore.ts`の3ループ切替作業分担・`destructionState`スライス設計 — brabit_mot3との協議で確定
- 2.2節: `temperature`が`unavailable`のままで完成扱いとするか(案A) / 温度モデル完成まで未完成扱いとするか(案B) — Fable判断
- 2.4節: 加算的ラッパー案(案2)の採否、呼び忘れ防止の運用担保で十分か — Fable判断
- 2.4.2節: vehicle/track版のframe構築方法(motor-only分と共通化するか、`loadTorqueNm`を追加した専用型にするか) — Step4でFableへ確認
- 3.1節: `shortCircuitDurationS`の解除時意味論(即時リセット案1/漸減・改称案2) — Step1でFable判断
- 3.2節: D02/D07/D09の無次元ゲージ案(案A)vs実温度モデル案(案B) — Fable判断
- 3.1節: D04の過放電トリガをPhase3で実装するか将来枠か — Step5でFable/人間へ諮る
- 3.3節: D09を実装するか見送るか自体、見送り時の人間スコープ例外承認 — Step6で確定
- 12節Step5: D03/D04が同一stepで同時発火してよいか(排他か許容か) — Step5計画でFableへ確認(v5でStep1からStep5へ移管)
- D02/D05/D06/D09の較正値・式の具体値 — 各ステップ実装計画で個別に確定
- 4節: `DestructionConfig`を`composeConfigFromMaterials`の戻り値へ統合するか別関数に分離するか — Step1実装計画で確定
- 9節: D08をPhase3 DoD対象外とする扱いの人間承認 — 本計画のFableレビュー後に諮る
- 11節③: D01〜D09の具体的音色仕様 — brabit_mot3の別ステップ計画事項(本計画スコープ外)

---

## 15. Fableへの重点確認事項

Fable提出時にSuu_mot3から重点確認を依頼された事項+文書記載の全裁定事項をここに集約する(v4まではagmsg送付文面にのみ記載され、本書には転記していなかった。v5改訂指示#4により本節を新設)。

- 2.1節: 共有信号(`shared.shortCircuitDurationS`)+モード別Progress型の設計妥当性
- 2.2節: `temperature`が`{kind:'unavailable'}`のままでspec §7.1適合・Phase3完成扱いとできるか(案A)、温度モデル完成まで未完成扱いとすべきか(案B)
- 2.3節: D08予約枠の設計(engine型除外+store層別型 vs 他案)
- 2.4節: 既存API(`step`/`stepTestRun`/`stepTrackRun`)を無改修のまま維持する加算的ラッパー案(案2)の採否、呼び忘れ防止を統合テスト+規約で担保する運用の妥当性
- 2.4.2節: vehicle/track版のframe構築(D06の`loadTorqueNm`入力)をStep4へ先送りする扱いの妥当性
- 3.1節: 短絡解除時の意味論(即時リセット案1推奨/漸減・改称案2)
- 3.2節: D02/D07/D09の無次元ゲージ案(案A)vs実温度モデル案(案B)
- 12節Step1: D03/D04テスト範囲をD01/D03のみに限定しD04関連をStep5へ移管する扱いの妥当性
- その他、14節に列挙した全未決事項

Fableの回答は要約せず全文でSuu_mot3経由で中継してもらう(CLAUDE.md「レビュー条件・承認条件は要約せず全文中継する」規律)。実装・commitはFableレビュー・人間承認まで引き続き未着手のまま維持する。

---

## 16. 改訂履歴(v1→v5)

v5改訂指示#4「解消済みの指摘・未決事項・Fable重点確認事項を欠落させない」に基づき、過去の改訂差分表をすべて保持する。

### v1→v2(Suu_mot3一次レビュー8項目)

| # | レビュー指摘 | 対応節 | 要旨 |
|---|---|---|---|
| 1 | destructionModes.tsを状態機械にする | 2 | `DestructionState`を明示し`advanceDestructionState(prev, frame, config, dt) -> { state, events }`へ変更。遷移規則・一度きり発火はengine所有 |
| 2 | causeLogはengineが遷移時にスナップショット確定 | 2・3 | HistorySample後付け生成を廃止。フィールドはspec§7.1どおり4項目のみ(theta削除) |
| 3 | D04はengineが素材family/IDを知らない | 3 | materialMappingが熱暴走しきい値(数値)へ写像、engineは数値比較のみ |
| 4 | D08はPhase3で「実装済み」扱いしない | 9 | 型・図鑑予約枠のみ。実トリガ・再現テストはPhase5へ明示移管、人間スコープ例外事項 |
| 5 | D02/04/07/09は固定dt状態遷移で設計 | 2・3・5 | HistorySampleウィンドウ依存を廃止し、batteryHeat型のdt積分アキュムレータへ統一 |
| 6 | 三段開示段階1のHUD境界を明記 | 6 | HUDは起動時合成済みconfig由来のSimStateのみを読む。永続WearState直接参照を禁止 |
| 7 | art-spec未決点の整理を修正 | 11 | SE存在・検死レポート様式は既定、未決範囲を正確化。破壊後遷移のみ真の未記載 |
| 8 | 段階的提出・各stepにゲート明記 | 12 | Step1(D01/D03)を契約の最小実証と位置付け、各stepにFable/人間承認ゲートを明記 |

### v2→v3(Suu_mot3二次レビュー10項目)

| # | レビュー指摘 | 対応節 | 要旨 |
|---|---|---|---|
| 1 | CauseLog.temperatureの次元偽装 | 2 | 単一`temperature`フィールドを廃止。`currentA`・`batteryHeatRatio`・`rpm`を正しい単位の別フィールドへ分離。実温度モデルがないモードは`temperatureC: null`+`measurementUnavailable: true`。Fable判断事項として明記 |
| 2 | D03は瞬間発火で「短絡持続」を表現していない | 3 | `shortCircuitDurationS`をdt積分で追加。新規較正値`shortCircuitDurationLimitS`。Step1は較正値ゼロでなくなる旨を訂正 |
| 3 | D04がheatのみで短絡/過放電条件を落としている | 3 | `shortCircuitDurationS`流用+膨張→発煙→炎上の`stage`遷移をStep5計画事項として明記。過放電は未モデル化のscope gapとして明示。断定記述を削除 |
| 4 | D02/D07のcurrent²×dtは温度ではない | 3 | `coilHeatGaugeRatio`・`magnetHeatGaugeRatio`(無次元、既存batteryHeatと同型)へ改称。実温度[°C]比較はしない。Fable判断事項として2案提示 |
| 5 | D09も同様+無潤滑シグナル未決 | 3 | `bearingHeatGaugeRatio`へ改称。Step6を独立設計ゲートとし統合計画では未確定のまま明記 |
| 6 | genericな`accumulator`の型安全性 | 2 | モードごとに明示名を持つ`XxxProgress`型へ分離(Record値の型を個別化)。代替案(判別union)と比較しFableへ推奨案提示 |
| 7 | D08スタブは不要な実装対象を作る | 2・9 | Phase3の`DestructionState`からD08を除外。予約枠はstore層の図鑑専用型に限定。Fable裁定依頼として明記 |
| 8 | §11・§14の反映漏れ | 11・14 | 検死レポート=図鑑詳細統合、破壊後=操作待ち、を確定反映。未決一覧から除外 |
| 9 | Step1テストの網羅不足 | 12 | D01/D03それぞれに非発火境界・発火境界・一度きり・ログ固定・dt分割不変性・相互非干渉を列挙 |
| 10 | 呼び出し経路の棚卸し不足 | 2.4(新設) | gameStore.tsの3ループ(stepSim/stepTestRun/stepCourseRun)を棚卸し。単一オーケストレーション境界の設計を追加 |

### v3→v4(Suu_mot3三次レビュー6項目)

| # | レビュー指摘 | 対応節 | 要旨 |
|---|---|---|---|
| 1 | §2.4統合案に状態の入出力経路がない | 2.4 | 3関数それぞれの加算的ラッパー関数の完全シグネチャ・状態所有者・初期化・受け渡しを明記 |
| 2 | 既存API直接変更は影響大、代替案と比較を | 2.4 | 既存3関数は無改修のまま加算的ラッパーを新設する案(案2)を採用。変更ファイル・呼び出し元・後方互換を列挙し2案を比較、Fableへ提示 |
| 3 | D04のshortCircuitDurationS参照元が未定、二重積分の恐れ | 2.1・3.1 | `DestructionState`に`shared`(共有信号)を新設し、短絡継続時間は一度だけ積分。D03/D04はcauseLogへスナップショットするのみ |
| 4 | 短絡解除時の減衰/リセットの意味論が未確定 | 3.1 | 「継続時間として即時リセット」案と「累積ストレスとして漸減(要改称)」案を提示、前者を推奨としてFable判断事項に明記 |
| 5 | 「全10種」誤記、D09見送り時のスコープ例外未記載 | 2.3・3.3・13・14 | 誤記を9種へ訂正。D09をStep6で見送る場合もD08同様に人間スコープ例外承認が必要と明記 |
| 6 | temperatureC/measurementUnavailableの不整合状態・仕様判断の未提示 | 2.2 | 判別unionへ変更(不整合状態を型で排除)。Phase3で未計測を許容するか/温度モデル完成まで未完成扱いとするかをFableへ明示的に諮る |

### v4→v5(開発再開後、Suu_mot3のv5改訂指示5項目)

| # | 指摘 | 対応節 | 要旨 |
|---|---|---|---|
| 1 | v4 §12 Step1のD04発火・D03/D04同時発火テストがStep5未移管のまま、v4提出時の付記(1)と本文が矛盾していた | 12(Step1・Step5)・14 | Step1のテスト対象をD01/D03+shared.shortCircuitDurationSのD03単独検証に限定し、D04関連テストをStep5へ正式移管。付記(1)を本文へ統合 |
| 2 | v4 §2.4のvehicle/trackラッパー例が、motor-onlyのframeInputFromSimState(physicsState.motor)だけでD06のloadTorqueNmを取得できるかのように誤読され得た | 2.4.2 | 誤った関数本体例を削除し契約骨格のみ提示。frame構築方法はStep4で確定する未決事項として14節・15節に明記 |
| 3 | v4以前の複数節が「v3と同じ」「内容不変」のみで実体を再掲せず、単独再開ができなかった(v3自体もv2を一段深く参照していた節が存在) | 0・1・4・5・6・7・8・9・10 | v2まで遡って確定済みの実体を書き戻し、v3・v4で確定した現行名称・型設計(旧`coilOverheatThreshold`等→`coilOverheatGaugeLimit`等、旧単一`causeLog.temperature`→判別union)へ統一 |
| 4 | v1〜v4で解消済みの指摘・未決事項11項目・Fable重点確認事項(agmsg送付文面のみに存在)が本書から欠落する恐れ | 14・15・16 | 未決事項一覧を維持しつつStep移管に伴う参照更新。Fable重点確認事項を15節として新設し文書に格上げ。v1〜v4の差分表を16節として保持 |
| 5 | 日付・状態表示が中断前のままだった | 冒頭 | 作成日・改訂日・状態(Suuレビュー前・Fable未提出・実装/commit未着手)を明記 |
