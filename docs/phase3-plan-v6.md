# Phase 3統合計画(破壊モード+図鑑)— v6改訂版

作成: alice_mot3 2026-08-02。**状態: Suuレビュー前・Fable未提出・実装/commit未着手。**

本書は`docs/phase3-plan-v5.md`をSuu_mot3レビュー(2026-08-01T16:34着信、以下「v5レビュー」)13項目に基づき改訂したものである。**v5をこの文書で置き換える。v5は履歴として保持する(削除しない)。** v5レビューは「v4付記2点の本文統合・vehicle/track版の不正確な関数本体例の撤回・自己完結化は妥当」と確認した上で、状態機械が「発火検出とログ生成」に留まり、破壊後の物理状態遷移・入力型・イベント型・段階導入契約に未解決の矛盾があると指摘した。

**本改訂の方法論**: v5までは設計を先に書いてから実装可能性を後追いで確認する順序だったため、既存engineコード(`src/engine/motorPhysics.ts`・`vehiclePhysics.ts`・`trackPhysics.ts`・`src/materials/materialMapping.ts`)を読まずに書けてしまう矛盾(D01の立ち上がり検出に必要な関数が実は既に存在する、D05の電流入力が原理的に取得不能、`composeConfigFromMaterials`の所属先の誤記等)が複数残っていた。v6では該当箇所を実装を読んだ上で書き直した。特に、`didCollapseJustHappen`・`didBatteryJustOverheat`・`didShortJustHappen`(motorPhysics.ts)、`computeElectricalState`(同、チャタリング前の理論電流を独立に再取得できる)、`stepVehicle`の`coilCollapsePenaltyMm`(既存の「セッション内オーバーライド」パターンの実例)は、すべて**既に存在する凍結APIの一部**であり、Phase3はこれらを新規発明せず再利用する。

対象: spec.md §7(破壊モードと失敗図鑑)。docs/spec.md を唯一の正とする。CLAUDE.md(b)(c)拡張点。

---

## 0. スコープ境界

- 対象はD01〜D09のみ。**D10(鉄心短絡)はPhase4**(spec §9.2の被膜ダメージ蓄積・巻線記録方式に依存するため)。
- **D08(クラッシュ)は、engineの`DestructionState`・`DestructionModeId`には一切含めない。** トリガ条件がspec §6.5の周回コース(κ(s)・保持判定)に依存し、これはCLAUDE.md §2(e)でPhase5スコープと確定済みであるため、Phase3のengine側には型・遷移・演出コールバックのいずれも用意しない(2.3節・9節)。図鑑UI用の予約枠はstore層/UI層専用の別型`FailureCodexModeId`に限定する(v5レビュー#8: v5の§0は「engineに型・遷移の枠を用意する」と読める記述だったが、2.3節・9節の確定方針と矛盾していたため本節を後者へ統一する)。
- 未接続だった5ファミリー(coating/substrate/roller/body/brush)のうち、**brushはPhase3のD05実装により接続される**(3節)。残る4ファミリー(coating/substrate/roller/body)は引き続きPhase3スコープ外(10節)。

## 1. 既存資産の棚卸し

`src/engine/`は凍結構造(CLAUDE.md)。D01〜D09はゼロから作るのではなく、既存の凍結フィールド・凍結関数を**物理トリガの生信号および境界検出ヘルパー**として再利用し、その上に「個体劣化・初回発見・三段開示」という新しい意味論を被せる設計とする。

再利用対象(motorPhysics.ts、変更不要):
- `SimState.coilCollapsed: boolean` — ワニス崩壊(v1.5由来、D01の生トリガ)
- `SimState.batteryHeat` + `BATTERY_HEAT_LIMIT`(**D03**の生トリガ。v5レビュー#11: v5は「D02/D03の生トリガ」と誤記していたが、D02は3.2節のとおり専用の`coilHeatGaugeRatio`を持ち`batteryHeat`を参照しない)
- `SimState.shorted`(D03/D04/D10系)
- `SimState.chatterFramesLeft` + `CHATTER_PRESSURE_THRESHOLD`(D05候補)
- `didCollapseJustHappen(prev, next)`・`didBatteryJustOverheat(prev, next)`・`didShortJustHappen(prev, next)` — **既存の境界検出ヘルパー(export済み)**。spec-v1.5.md §6.1の`SessionEventType`向けに既にmotorPhysics.tsに実装済みであり、D01(・D03の立ち上がり検出)はこれらをそのまま再利用する(2.4.2節)
- `computeElectricalState(config, theta, omega)` — 既存のexport純関数。チャタリング判定前の理論電気状態を独立に計算できる(2.4.2節、D05入力の再棚卸しで使用)
- `src/engine/failures.ts`(診断ヒント系)は別物として維持する。名前衝突を避けるため新規モジュールは`destructionModes.ts`とする

再利用対象(vehiclePhysics.ts、変更不要):
- `VehicleSimState.coilCollapsePenaltyMm` + `stepVehicle`内の`effectiveAxisOffsetMm`合成パターン — D01の走行中物理効果は**既にこの機構で実装済み**(2.5節)
- `VehicleSimState.status`(`'overheated'`等)+ 早期return機構 — D03の走行停止は**既にこの機構で実装済み**(2.5節)

再利用対象(materials/、Phase2成果):
- `WearState`(inventoryItem.ts)— D05/D06/D07の書き込み先
- `composeConfigFromMaterials`(`src/materials/materialMapping.ts`所属の純関数。**engineの純関数ではない**。8節)— 4節で拡張

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

### 2.1 契約型一式(v5レビュー#4対応: 自己完結させる)

v5は`DestructionModeId`・`DestructionFrameInput`を明示的に定義せず、`advanceDestructionState`のシグネチャも略記のままだった。以下、Phase3完成時点で成立させるべき完全な型一式を示す(Step1で実装するのはこのうちD01/D03関連のみであり、Step1の最小実証範囲は12節で別途明記する)。

```ts
export type DestructionModeId =
  | 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D09';
// D08はここに含めない(0節・2.3節)

export interface DestructionSharedSignals {
  shortCircuitDurationS: number; // 短絡継続秒数。D03/D04が共通で参照する唯一の積分(2.4節)
  elapsedTimeS: number; // セッション内経過秒数。advanceDestructionState内で独立に積算する
  // (VehicleSimState.elapsedTimeSには依存しない。destructionModes.tsをleafモジュールに保つため。
  // causeLog.atTの唯一の出典になる、v5レビュー#4・#13対応)
}

export function createInitialSharedSignals(): DestructionSharedSignals {
  return { shortCircuitDurationS: 0, elapsedTimeS: 0 };
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
  // 継続量は持たない。sharedSignals.shortCircuitDurationSを毎step参照するのみ(2.4節)
  causeLog: D03CauseLog | null;
}

export interface D04Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning'; // Step5で段階時間確定(3.1節)
  stageEnteredAtT: number | null;
  // 継続量は持たない。sharedSignals.shortCircuitDurationSを毎step参照するのみ(2.4節)
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
  };
}

export function createInitialDestructionState(): DestructionState {
  return {
    shared: createInitialSharedSignals(),
    modes: { /* 全モードtriggered:false、継続量0、causeLog:null */ },
  };
}

// destructionOrchestration.tsのframe builder(2.4.2節)が構築する入力。
// prev/next比較が必要なフィールド(coilCollapsedRisingEdge)・チャタリング前の
// 理論電流(theoreticalCurrentA)は、既存API呼び出し側(ラッパー)が構築する
// 責務であり、destructionModes.ts自身はprev SimStateを受け取らない(leafモジュール
// 方針を維持するため、prev/next比較はここではなくラッパー側の責務とする)。
export interface DestructionFrameInput {
  currentA: number;                 // 実電流(チャタリング反映後)。next.currentそのもの
  theoreticalCurrentA: number;      // チャタリング反映前の理論電流(D05用、2.4.2節)
  rpm: number;                      // next.rpmそのもの
  batteryHeat: number;              // 0–1、next.batteryHeatそのもの
  shorted: boolean;                 // next.shortedそのもの
  chatterFramesLeft: number;        // next.chatterFramesLeftそのもの
  coilCollapsedRisingEdge: boolean; // didCollapseJustHappen(prev, next)の結果(D01用)
  loadTorqueNm?: number;            // 車両層のみ。motor-onlyの呼び出しではundefined(D06はこの場合スキップ)
}

export function advanceDestructionState(
  prev: DestructionState,
  frame: DestructionFrameInput,
  config: DestructionConfig, // 2.4.2節(段階導入対応の較正値グループ)
  dt: number,
): { state: DestructionState; events: DestructionEvent[] };
```

内部で①`shared`を先に更新(`elapsedTimeS += dt`、`shortCircuitDurationS`の積分)→②各モードの判定が更新後の`shared`を参照する、という順序を固定する(D03/D04の判定式が同一stepの`shared`更新後の値を見ることを保証する)。`events`は「この1ステップで新規にtriggeredへ遷移したモード」のみを含み、**常に固定順序(D01→D02→D03→D04→D05→D06→D07→D09)で並べる**(同一stepで複数モードが成立した場合の決定論的順序、v5レビュー#13対応。13節のテストで担保する)。

### 2.2 CauseLogの次元誠実性と共通/固有フィールドの境界(v5レビュー#7対応)

```ts
export type TemperatureReading =
  | { kind: 'measured'; temperatureC: number }
  | { kind: 'unavailable' };

export interface CauseLogCommon {
  currentA: number;               // A(spec §7.1「電流」)
  rpm: number;                    // min⁻¹(spec §7.1「回転数」)
  atT: number;                    // セッション内秒(spec §7.1「タイムスタンプ」)。shared.elapsedTimeSのスナップショット
  temperature: TemperatureReading; // spec §7.1「温度」。3.2節の案採用状況に応じてkindが決まる
}

export interface D01CauseLog extends CauseLogCommon {} // temperatureは常に{kind:'unavailable'}(コイル自体の温度指標が存在しないため。電池発熱等の代用は行わない)
export interface D02CauseLog extends CauseLogCommon { coilHeatGaugeRatio: number; }
export interface D03CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; }
export interface D04CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; stage: D04Progress['stage']; }
export interface D05CauseLog extends CauseLogCommon { sparkDurationS: number; }
export interface D06CauseLog extends CauseLogCommon { loadTorqueNm: number; }
export interface D07CauseLog extends CauseLogCommon { magnetHeatGaugeRatio: number; }
export interface D09CauseLog extends CauseLogCommon { bearingHeatGaugeRatio: number; }
```

**共通/固有フィールドの境界規約(v5レビュー#7の指摘への回答)**: v5は「spec §7.1の4項目に厳密に一致し追加しない」と書きながら、実際には各D0x型へ`batteryHeatRatio`等を追加しており矛盾していた。正しい規約は以下のとおりである。

- **共通必須4項目**(`CauseLogCommon`)はspec §7.1が明記する「電流・温度・回転数・タイムスタンプ」に厳密に一致させ、これ以上増やさない。
- **モード固有の追加フィールドは、3節の物理トリガ判定式(「物理トリガ」列)に登場する量そのものに限定する。** 判定式に登場しない値を検死ログへ追加しない。この規約により各モードの追加フィールドは以下のとおり過不足なく決まる: D02=`coilHeatGaugeRatio`(判定式の左辺そのもの)、D03=`batteryHeatRatio`+`shortCircuitDurationS`(判定式の両辺)、D04=同左+`stage`(3.1節の演出段階、判定式には登場しないが三段開示の記録として必要であることを明記した上での例外)、D05=`sparkDurationS`、D06=`loadTorqueNm`、D07=`magnetHeatGaugeRatio`、D09=`bearingHeatGaugeRatio`。
- 根拠のない追加フィールド(検討時に候補へ上がった`theta`等)は追加しない。将来、特定モードの検死レポートに追加数値が必要と判明した場合は、そのモードのステップ実装計画(12節)で個別に根拠を示して追加する。

**スナップショット確定の原則(不変)**: `causeLog`は`triggered`がfalse→trueに反転するその1ステップの`frame`引数の値をそのままCauseLogとして書き込み、以後は上書きしない。`HistorySample[]`のようなウィンドウ探索・後付け生成は行わない(5節)。`atT`は`shared.elapsedTimeS`の**このstep更新後**の値を記録する(v5レビュー#13: 「step開始時刻か終了時刻か」を明示。2.1節の①→②の順序により、モード判定時点では既にshared更新後のため、記録される`atT`は常に「このstepの終了時点の経過秒数」で統一される)。`temperature`・`currentA`・`rpm`・`batteryHeat`・`shorted`等はすべて**next(このstep終了時点)のSimState/VehicleSimState由来の値**を記録する。`coilCollapsedRisingEdge`のようなprev/next比較の結果(真偽値)は、比較そのものの生値(prevの値)を記録するのではなく、比較結果が「このstepで確定した事実」としてcauseLogに反映される(D01CauseLog自体には比較結果を格納するフィールドはない。triggeredへの遷移そのものが立ち上がりの記録である)。

**Fableへ諮る仕様判断**: `temperature`が`{kind:'unavailable'}`になり得ることは、spec §7.1の要求を満たすかどうかという仕様解釈そのものに関わる。2案を提示する。

- **案A(Phase3推奨)**: `{kind:'unavailable'}`をPhase3の正式な仕様として許容する。実温度モデルを持たないモード(D01・D02・D07・D09、3.2節案A採用時)は`unavailable`のまま「完成」として扱い、DoD(13節)もこれを前提とする。
- **案B**: 温度モデル(3.2節案B)が完成するまで、当該モードは「未完成」として扱い、Phase3のDoDから個別に除外する。

alice所見は案A。ただし判断そのものをFableへ諮る(12節Step1・Step2ゲート事項、15節)。

### 2.3 D08の扱い

engineの`DestructionState`・`DestructionModeId`からD08を完全除外する(0節)。図鑑UI用の予約枠はstore層/UI層専用の別型`FailureCodexModeId`に限定する:

```ts
export type FailureCodexModeId =
  | 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D08' | 'D09'; // 全9種(D08を含む)
```

(v5レビュー#8: v5の説明文が「D01〜D09の全9種+D08」としており、D08を9種の内側と外側の両方で二重計上していた。正しくは「全9種(D08を含む)」であり、`FailureCodexModeId`のunion自体は上記のとおりD01〜D09の9つのリテラルのみを持つ。)

この型はengineの`DestructionModeId`(Phase3時点ではD01〜D07・D09の8種)とは別物であり、Phase5で(e)-1完成後にengine側`DestructionModeId`へD08を追加した時点で両者は一致する。この設計(engine型を最小に保ち、拡張はPhase5で型そのものを広げる/store層に別枠を作る、のどちらを採るか)は**Fableへ裁定を依頼する**(12節Step7ゲート事項)。

### 2.4 呼び出し境界: 加算的ラッパーによる単一オーケストレーション

既存3関数(`step`/`stepTestRun`/`stepTrackRun`)を一切変更せず、それぞれを内部で呼ぶ新規の加算的ラッパー関数を`destructionOrchestration.ts`に追加する(案2)。

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

**DestructionConfigの段階導入対応(v5レビュー#6対応)**: v5の最終形`DestructionConfig`はD02/D05/D06/D07用フィールドまで必須であり、Step1(D01/D03のみ実装)の呼び出し側が未実装モードの仮値を渡さねばならない欠陥があった。モードごとのoptionalグループへ分離し、グループが`undefined`のモードは`advanceDestructionState`内部で判定自体をスキップする(常に未発火のまま)という設計にする。

```ts
export interface DestructionConfig {
  // モードごとのoptionalグループ。存在しないグループ=そのモードは判定対象外
  // (仮の較正値を要求しない。設定忘れを無言で無効化するのではなく、
  // 「実装されていないモードは呼び出し側がグループごと省略する」という
  // 型で表現された明示的な状態にする)
  d02?: { coilOverheatGaugeLimit: number };
  d03?: { shortCircuitDurationLimitS: number };
  d04?: { batteryRunawayHeatThreshold: number };
  d05?: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06?: { gearStrengthThresholdNm: number };
  d07?: { magnetHeatGaugeLimit: number };
  d09?: { bearingSeizureGaugeLimit: number };
  // D01は較正値を持たないため対応するグループがない(3節表のとおり)
}
```

**3案比較(v5レビュー#6の指摘どおり)**:

| 観点 | 案A(採用): モード別optionalグループ | 案B: Stepごとの型拡張(継承) | 案C: 明示的disabledバリアント |
|---|---|---|---|
| 概要 | 上記のとおり、モードごとに`field?: {...}`| `DestructionConfigStep1 extends {d01,d03}`のようにstepごとに新しい型を作る | `{enabled:true,...} \| {enabled:false}`のdiscriminated unionをモードごとに持つ |
| 型の増分 | Step追加のたびに既存interfaceへプロパティを追加するだけ | Stepごとに新しい型が増え続ける | 案Aと同数のプロパティ増分+`enabled`タグの分だけ冗長 |
| 呼び出し側の記述量 | 実装済みモードのグループだけ渡せばよい(`{d03:{...}}`) | そのStep用の型を毎回import・使い分ける必要がある | 未実装モードも`{enabled:false}`を明示的に書く必要がある |
| `advanceDestructionState`側の分岐 | `config.d0X`のundefinedチェック | Stepごとに型が違うため、内部実装もstepを意識した分岐が必要になりやすい | `config.d0X.enabled`のチェック(案Aとほぼ同型) |
| 既存コードとの整合 | `MotorConfig`の`wireGaugeMm?`等、本コードベースで既に多用されている「省略可・既定なし」パターンと同型 | 前例なし | 前例なし、案Aと機能的にほぼ同じで冗長性のみ増える |

alice所見は**案A(採用)**。既存`MotorConfig`の任意フィールド群と同じ設計言語で書けること、Stepが進むごとに型を増やさずに済むことを優先する。**採否はFableへ確認する**(15節)。

```ts
export interface DestructionStepResult<TPhysicsState> {
  physicsState: TPhysicsState;        // 既存step関数がそのまま返す値。中身は無改変
  destructionState: DestructionState;  // 次stepへ持ち越す値(2.1節)
  destructionEvents: DestructionEvent[]; // このstepで新規発火したイベントのみ
}

// motor-only版のframe構築(D01/D02/D03/D04/D05/D07/D09で共通に使う)。
// 既存exportのdidCollapseJustHappen・computeElectricalStateを再利用する
// (v5レビュー#2・#3対応、1節参照)
function buildMotorOnlyFrameInput(
  config: MotorConfig, prev: SimState, next: SimState,
): DestructionFrameInput {
  // チャタリング反映前の理論電流(D05用)。evaluateMotorFrame内部で計算されている
  // のと同じ値を、同じ入力(config, prevのtheta/omega)でcomputeElectricalStateへ
  // 再度渡すことで得る。乱数を消費しない純関数の再呼び出しであり、rng消費順・
  // 決定論には影響しない(重複した式の新規発明ではなく、既存exportの再利用)
  const theoreticalCurrentA = computeElectricalState(config, prev.theta, prev.omega).current;
  return {
    currentA: next.current,
    theoreticalCurrentA,
    rpm: next.rpm,
    batteryHeat: next.batteryHeat,
    shorted: next.shorted,
    chatterFramesLeft: next.chatterFramesLeft,
    coilCollapsedRisingEdge: didCollapseJustHappen(prev, next), // 既存exportそのまま
    loadTorqueNm: undefined, // motor-onlyではD06入力なし(D06は3節のとおりこの場合スキップ)
  };
}

export function stepMotorWithDestruction(
  config: MotorConfig, motorState: SimState,
  destructionState: DestructionState, destructionConfig: DestructionConfig,
  dt: number, rng?: Rng, loadTorque?: number, effectiveInertia?: number,
): DestructionStepResult<SimState> {
  const physicsState = step(config, motorState, dt, rng, loadTorque, effectiveInertia); // 既存、無改修
  const frame = buildMotorOnlyFrameInput(config, motorState, physicsState);
  const { state, events } = advanceDestructionState(destructionState, frame, destructionConfig, dt);
  return { physicsState, destructionState: state, destructionEvents: events };
}
```

**vehicle/track版の契約骨格(D06のloadTorqueNm入力は未確定、Step4で設計)**: `stepTestRunWithDestruction`・`stepTrackRunWithDestruction`は、`stepMotorWithDestruction`と同型の入出力契約(既存物理ステップを無改修で呼び、`DestructionStepResult`を返す)を踏襲する点は確定しているが、**frame構築の実装は本計画時点では確定させない**。

理由: `buildMotorOnlyFrameInput`はmotor-only の`SimState`しか見ておらず、D06の判定に必要な`loadTorqueNm`(車両層`stepVehicle`内部で計算される量で、motor-only側の`SimState`には含まれない)を供給できない。`VehicleSimState.loadTorqueNm`は既に存在するフィールドであるため(vehiclePhysics.ts参照)、車両用frame builderはこれをそのまま`frame.loadTorqueNm`へ渡せばよいと考えられるが、その他のフィールド(`coilCollapsedRisingEdge`等)を`VehicleSimState.motor`の prev/next からどう取り出すかを含めた完全な実装はStep4で確定する。

```ts
export function stepTestRunWithDestruction(
  motorConfig: MotorConfig, carConfig: CarConfig, vehicleState: VehicleSimState,
  destructionState: DestructionState, destructionConfig: DestructionConfig,
  dt: number, courseLengthM: number, rng?: Rng, slopeRad?: number,
): DestructionStepResult<VehicleSimState>;
// 内部でstepTestRun(既存、無改修)を呼んだ後、advanceDestructionStateへ渡すframeは
// buildMotorOnlyFrameInputを土台にloadTorqueNm: physicsState.loadTorqueNmを追加した
// ものになる見込みだが、完全な実装はStep4で確定する。

export function stepTrackRunWithDestruction(
  motorConfig: MotorConfig, carConfig: CarConfig, track: ValidatedTrackDefinition,
  vehicleState: VehicleSimState, destructionState: DestructionState, destructionConfig: DestructionConfig,
  dt: number, rng?: Rng,
): DestructionStepResult<VehicleSimState>;
// 同上。stepTrackRun(既存、無改修)を呼んだ後のframe構築はStep4で確定する。
```

#### 2.4.3 状態の所有者・初期化・受け渡し・呼び出しタイミング

- **所有者**: `DestructionState`の値自体はstore層(gameStore.ts、brabit所有)のZustand stateスライスが保持する。これは既存の`simState`・`vehicleState`と全く同じ扱いであり、engine側(`destructionOrchestration.ts`)は毎回引数で受け取り新しい値を返すだけで、内部に保持しない(8節の決定論境界と整合)。
- **初期化**: セッション開始時、store層が`createInitialDestructionState()`(2.1節)を呼び、`destructionState`スライスへ格納する。既存の`createInitialVehicleState`呼び出し箇所(`resetTestRun`・`startCourseRun`)、およびLab/ベンチ試験開始相当の箇所と同じタイミングで呼ぶ。
- **次stepへの受け渡し**: store層の3つの`stepXxx`関数(`stepSim`・`stepTestRun`・`stepCourseRun`)が、`set((s) => {...})`内で`s.destructionState`を読み、`stepXxxWithDestruction`へ渡し、返ってきた`destructionState`を次の`set`の戻り値に含める。既存の`s._vehicleRngState`(前回値を読んで次回値を書き戻す)と同型のパターンであり、store層に新しい設計原則を持ち込まない。
- **呼び出しタイミング・rng消費順**: `advanceDestructionState`は、各`stepXxxWithDestruction`ラッパー内部で既存物理ステップ(`step`/`stepTestRun`/`stepTrackRun`)の呼び出し直後、rngを一切消費せずに呼ばれる。`buildMotorOnlyFrameInput`内の`computeElectricalState`呼び出しもrngを使わない純関数のため、rng消費順序に影響しない。1ステップ内の消費順は「①既存物理ステップ内部のrng消費処理(chatter判定等を含む)→②既存物理ステップが`SimState`/`VehicleSimState`を確定→③frame構築(rng非消費)→④`advanceDestructionState`(rng非消費)」に固定され、既存物理ステップ内部のrng消費順序には一切触れない(既存テストのシード再現性に影響しない)。1フレームあたり物理ステップ最大2回の非機能要件は`advanceDestructionState`にも同様に適用される。

#### 2.4.4 案1(既存API直接変更)との比較

| 観点 | 案1: 既存`step`/`stepTestRun`/`stepTrackRun`の引数・戻り値を直接変更 | 案2(推奨): 加算的ラッパーを新設、既存3関数は無改修 |
|---|---|---|
| 二段API凍結方針・既存契約への影響 | 3関数のシグネチャ・戻り値契約そのものを変更する後方非互換変更 | 既存3関数は一切変更しない |
| 既存テスト(既存の844テスト、v5レビュー#11: 古い件数表記を訂正)への影響 | 戻り値の型・呼び出し元アサーションの修正が広範囲に必要になり得る | ゼロ(既存関数・既存テストは無改修で通る) |
| `scripts/sweep.ts`・`scripts/vehicleSweep.ts`への影響 | これらが`step`/`stepTestRun`等を直接呼んでいる場合、影響を受ける | 影響なし。sweep側は`step`等の既存シグネチャをそのまま呼び続けられる |
| 呼び忘れ防止の型による担保 | 戻り値に`destructionState`が常に含まれるため型レベルで呼び忘れが起きない | `step`等を直接呼んでも型エラーにならないため、型だけでは呼び忘れを防げない |
| 呼び忘れ防止の運用上の担保 | (型で担保されるため運用ルールは不要) | 「gameStore.tsの3ループは`stepXxxWithDestruction`のみを呼ぶ」という規約+統合テストで担保する |
| 変更ファイル数 | engine 3ファイル(既存改修)+store 3箇所 | engine 2ファイル(新規)+store 3箇所(呼び出し先の切替のみ) |

alice所見は**案2(推奨)**。**採否はFableへ確認する**(12節Step1ゲート事項、15節)。

### 2.5 破壊後の物理状態遷移(新設、v5レビュー#1対応)

v5までの状態機械は`triggered`・ゲージ・`causeLog`を更新するだけで、破壊後の物理状態を後続stepへ反映する経路がなかった。以下、既存コードの実際の挙動を踏まえてモードごとに整理する。

| モード | 発火後も走行継続するか | 次stepから変わる物理量 | セッション中の扱い | 個体永続状態(WearState)への反映 |
|---|---|---|---|---|
| D01 コイル崩壊 | 継続する | 車両層: **既存の**`VehicleSimState.coilCollapsePenaltyMm`が**既存の**`stepVehicle`内で自動的に`axisOffsetMm`へ加算され振動抵抗が増える(vehiclePhysics.ts、凍結実装。Phase3側の新規対応不要)。motor-only(`step`単体): 対応する物理量がSimStateに存在しないため、セッション中は無変化 | 車両層は既存機構がそのままセッション中の劣化を体現する | 次回セッション開始時、恒久`axisOffsetMm`ベースラインへ`COIL_DEFORM_PENALTY_MM`相当を加算する形でWearStateへ反映する接続方法をStep1実装計画で確定する |
| D02 エナメル焼損 | 継続する(想定) | 未確定。実効`coilTurns`低下(有効巻数減)またはR_coil低下(層間短絡)のどちらでモデル化するかは物理的に一長一短があり、**Fableへ諮る**(下記) | 新規セッション内オーバーライド機構(下記)が必要 | 3節表では書き込み先が未定義。Step5実装計画で確定 |
| D03 電池破裂 | 停止する(既存機構) | 車両層: `batteryHeat >= BATTERY_HEAT_LIMIT`は**既存の**`stepVehicle`が`status:'overheated'`へ遷移させ、既存の早期return機構がそのまま働く(凍結実装、対応不要)。motor-only: 対応する停止機構がSimStateに存在しない | 車両層は既存機構で完結。motor-onlyの扱いは未確定(下記) | 電池は恒久結果を別スキーマ(3節表のとおりWearState対象外) |
| D04 リポ炎上 | 停止させる必要があるが、既存`BATTERY_HEAT_LIMIT`未満で発火するため既存`status:'overheated'`機構は働かない。新規オーバーライド機構が必要(下記) | 同上、未確定 | 同上 | 同上 |
| D05 ブラシ火花 | 継続する | なし(1回のスパークイベント自体は瞬時的で、個々のイベントによる即時的な性能変化は設計しない) | 変化なし | `WearState.wearFraction`加算(4節)。将来セッションの実効`brushPressure`低下等として反映(7節) |
| D06 ギヤ歯欠け | 継続する(想定、破損後も走行は続く) | 未確定。実効`gearEfficiency`低下、または回転位相依存の間欠的トルク損失のどちらでモデル化するかは物理的複雑さに差があり、**Fableへ諮る**(下記) | 新規セッション内オーバーライド機構(下記)が必要 | `WearState.toothDamageFraction`加算(4節) |
| D07 熱減磁 | 継続する | 実効`magnetStrength`が低下する。spec §7.3が要求する「同一走行中の性能低下体感」を満たすには、発火(閾値到達)前から`magnetHeatGaugeRatio`に比例して連続的に弱まる設計が物理的に自然だが、比例定数は新規較正値であり**Fableへ諮る**(下記) | 新規セッション内オーバーライド機構(下記)が必要 | `WearState.demagnetizationFraction`加算(4節) |
| D09 軸受焼付き | 停止に近い急減速(想定) | 未確定。3.3節のとおりD09自体がStep6の独立設計ゲート対象であり、物理的消費(異常摩擦・急減速)のモデル化もStep6でまとめて確定する | Step6で確定 | Step6で確定 |

**セッション内オーバーライド機構(新規設計、上表の「必要」箇所に対応)**: いずれも既存の`step`/`stepTestRun`/`stepTrackRun`の**シグネチャを変更せずに**実現する必要がある(2.4節の案2方針)。実在する前例として、`stepVehicle`は`state.coilCollapsePenaltyMm`(既存の`VehicleSimState`フィールド)を`effectiveAxisOffsetMm = motorConfig.axisOffsetMm + state.coilCollapsePenaltyMm`として毎ステップ合成し、既存`MotorConfig`の同名フィールドをオーバーライドしてから物理計算へ渡している(vehiclePhysics.ts）。この「セッション内で蓄積したペナルティ値を、呼び出し側が毎ステップ合成してから既存configへ渡す」パターンを、`destructionOrchestration.ts`のラッパーが`DestructionState`の新規フィールド(モードごとに設計)を使って同様に行う案を提案する。

D02(実効`coilTurns`低下)・D06(実効`gearEfficiency`低下)・D07(実効`magnetStrength`低下)は、対象フィールド自体が`MotorConfig`/`CarConfig`に既に存在するため、`coilCollapsePenaltyMm`と同じ「既存フィールドをオーバーライドする」パターンがそのまま使えると考えられる。**D04(および motor-only文脈でのD03)の給電停止だけは例外**で、`MotorConfig.batteryVoltage`は`1.5 | 3.0`のリテラル型であり0を代入できない。給電停止相当を表現するには次のいずれかが必要になる。

- **案(a)**: `MotorConfig`に新規の任意フィールド(例: `batteryDisabled?: boolean`)を追加し、`wireGaugeMm?`・`varnished?`等の既存の「省略可・既定false・既存呼び出し元は無改修」パターンを踏襲する。`computeElectricalState`/`evaluateMotorFrame`内部で`powerOff`引数と同様に扱う(motorPhysics.tsの`evaluateMotorFrame`は既に`powerOff: boolean`引数を持ち、current/tMag/shortedを一貫して0/falseにする実装がある。この処理系自体は既に存在する)。
- **案(b)**: 車両層に限り、既存`stepVehicle`が既に持つ`trackInputs.forcePowerOff`機構を`stepTestRun`からも到達可能にする(`stepTestRun`に新規の任意引数を追加する。戻り値型・既存呼び出し元は無変更のため2.4節が禁じた「既存3関数の契約変更」には当たらないと考えられるが、この解釈自体を**Fableへ確認する**)。

motor-only版(`step`)には対応する停止相当の概念が既存にないため、そもそもmotor-onlyベンチ試験でD03/D04を検出対象にするかどうかも未確定である。

**Fableへの諮り事項(本節、15節へ追加)**:
1. D02(層間短絡)の物理モデル: 実効`coilTurns`低下 vs R_coil低下、どちらを採るか
2. D04の給電停止機構: `MotorConfig`への新規任意フィールド追加 案(a) vs `stepTestRun`への新規任意引数追加 案(b)、あるいは他の設計
3. D06(歯欠け)の物理モデル: 実効`gearEfficiency`低下(簡易) vs 回転位相依存の間欠トルク損失(高忠実度、Phase3の実装コストとして現実的か)
4. D07(熱減磁)の連続弱化モデル: 発火前からの比例弱化を採用するか、発火時の一段階弱化に留めるか。比例定数の較正根拠
5. D03/D04のmotor-onlyベンチ試験での扱い: そもそも検出対象にするか、対象にする場合の停止相当機構

---

## 3. D01〜D09個別設計

| ID | 物理トリガ(判定式) | 継続量 | 新規frame/config入力 | WearState書き込み |
|---|---|---|---|---|
| D01 コイル崩壊 | `frame.coilCollapsedRisingEdge`(既存`didCollapseJustHappen`由来) | なし | なし | なし(2.5節、次回セッションのaxisOffsetMmベースラインへ反映) |
| D02 エナメル焼損 | `coilHeatGaugeRatio >= config.d02.coilOverheatGaugeLimit` | `coilHeatGaugeRatio`(モード固有) | `config.d02.coilOverheatGaugeLimit` | 未定義(2.5節、Step5で確定) |
| D03 電池破裂 | `shared.shortCircuitDurationS >= config.d03.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= BATTERY_HEAT_LIMIT` | `shared.shortCircuitDurationS`(D04と共有、2.1節) | `config.d03.shortCircuitDurationLimitS` | 電池は恒久結果を別スキーマ(WearState対象外) |
| D04 リポ炎上 | `shared.shortCircuitDurationS >= config.d03.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= config.d04.batteryRunawayHeatThreshold`(素材由来、3.4節)。3.1節のとおりD03と同じ継続時間しきい値を共有する。過放電は3.1節のscope gap参照 | `shared.shortCircuitDurationS`(D03と共有)+`stage`(モード固有) | `config.d04.batteryRunawayHeatThreshold` | 同上 |
| D05 ブラシ火花 | `sparkDurationS >= config.d05.brushSparkDurationLimitS` | `sparkDurationS`(モード固有、`chatterFramesLeft>0`かつ`theoreticalCurrentA`が閾値超の間dt積算。2.4.2節) | `config.d05.brushSparkDurationLimitS`・`config.d05.brushSparkCurrentThresholdA` | `WearState.wearFraction`加算 |
| D06 ギヤ歯欠け | `frame.loadTorqueNm > config.d06.gearStrengthThresholdNm`(瞬間判定) | なし | `frame.loadTorqueNm`(新規、2.4.2節のとおりStep4でframe構築方法を確定)、`config.d06.gearStrengthThresholdNm` | `WearState.toothDamageFraction`加算 |
| D07 熱減磁 | `magnetHeatGaugeRatio >= config.d07.magnetHeatGaugeLimit` | `magnetHeatGaugeRatio`(モード固有) | `config.d07.magnetHeatGaugeLimit` | `WearState.demagnetizationFraction`加算。spec§7.3三段開示の代表例(6節) |
| D08 クラッシュ | Phase3は状態機械に含めない(0節・2.3節) | — | — | — |
| D09 軸受焼付き | `bearingHeatGaugeRatio >= config.d09.bearingSeizureGaugeLimit`(Step6で設計自体を再審査、3.3節) | `bearingHeatGaugeRatio`(モード固有) | 未確定(3.3節) | Step6で確定 |

### 3.1 D03/D04: 短絡継続の共有信号・意味論・同時発火の場合分け(v5レビュー#12対応)

**共有信号への統一**: 「短絡継続時間」は`DestructionState.shared.shortCircuitDurationS`として一度だけ積分し、D03・D04双方の判定式・causeLogスナップショットがこの単一の値を参照する。D03Progress/D04Progress自身は独自の継続量を持たない。

**D03/D04は継続時間しきい値を共有する**: 3節表のとおり、D03とD04は`shared.shortCircuitDurationS >= config.d03.shortCircuitDurationLimitS`という**同一の継続時間条件**を共有し、電池発熱側のしきい値だけが異なる(D03=`BATTERY_HEAT_LIMIT`、D04=`config.d04.batteryRunawayHeatThreshold`、素材由来でリポ系は`BATTERY_HEAT_LIMIT`未満に設定される見込み、3.4節)。この共有関係から、v5の「D04のみが発火し得る条件でD03と同時に発火し得る」という記述は用語が曖昧で自己矛盾的に読めた(v5レビュー#12)。実際には次の3ケースに論理的に分離できる。

- **(a) D03のみ発火**: 継続時間条件を満たし、かつ`frame.batteryHeat >= BATTERY_HEAT_LIMIT`。これはD04の条件(`batteryHeat >= batteryRunawayHeatThreshold`)も同時に満たすはずだが、`config.d04.batteryRunawayHeatThreshold`が`undefined`(非リポ系電池、3.4節)の場合はD04判定自体がスキップされるため、D03のみが発火する。**非リポ系電池での標準的な発火経路。**
- **(b) D04のみ発火(D03条件は未到達)**: 継続時間条件を満たし、`frame.batteryHeat >= config.d04.batteryRunawayHeatThreshold`だが`frame.batteryHeat < BATTERY_HEAT_LIMIT`。リポ系電池は`batteryRunawayHeatThreshold < BATTERY_HEAT_LIMIT`に設定される設計意図(3.4節「炎上が破裂より先に起きる」)のため、**リポ系電池での標準的な発火経路。**
- **(c) 両方の条件が同一stepで成立**: 継続時間条件を満たし、`frame.batteryHeat`が単一のdtステップ内で`batteryRunawayHeatThreshold`と`BATTERY_HEAT_LIMIT`の両方を跨いで上昇する場合(急峻な発熱・大きめのdt刻みで理論上起こり得る境界ケース)。**この場合のみ、両モードを同一stepで発火させる(併発許容)か、D04を優先しD03は次stepまで持ち越す(排他)かの選択が必要であり、これをFableへ諮る**(12節Step5ゲート事項、15節)。

**解除時の意味論(Fableへ諮る)**: `shortCircuitDurationS`を文字どおり「現在連続して短絡している秒数」として扱い、`frame.shorted`が偽になった瞬間、**即座に0へリセットする**案1を推奨する。対案として、「短絡による累積ストレス」として再定義し`shortCircuitStressS`等へ改称した上で漏れ積分(減衰)を採用する案2がある(減衰率の物理的根拠を新たに示す必要がある)。alice所見は案1。**Step1の実装前計画でFableへ両案を提示し、確定させる**(12節、15節)。

### 3.2 D02/D07: 無次元熱ゲージ

既存`SimState.batteryHeat`と全く同型の設計を踏襲する**案A(推奨、Phase3採用案)**: `coilHeatGaugeRatio`・`magnetHeatGaugeRatio`は0–1の無次元ゲージであり、「実測相当の温度」を主張しない。しきい値も無次元とし、`CauseLog.temperature`は常に`{kind:'unavailable'}`とする(2.2節)。対案**案B**は集中定数熱モデルで実際に°C単位の温度を出力するが、新規較正値調査を要しPhase3のスコープを実質的に拡大する。alice所見は案A。**採否はFable判断とする**(12節Step2/Step5ゲート事項、15節)。2.2節の「temperatureが`unavailable`のままで完成扱いとするか」という仕様判断とセットで確定する。

### 3.3 D09: 独立設計ゲート

`bearingHeatGaugeRatio`(無次元、3.2節と同型)へ改称する。「無潤滑シグナル」の入力源が未決のため、**D09は12節のStep6において独立した設計・採否ゲートとして扱い、本計画では「実装するかどうか」自体を確定させない。** 既存パラメータ(`sandingQuality`等)の意味を変えて転用することは禁止し、必要であれば新規の集計済み物理パラメータとしてFable審査の対象にする。

**Phase3 DoDとの関係**: D09もStep6の設計・採否ゲートの結果として実装を見送る可能性を残す以上、見送りが確定した場合はD08と同様に「Phase3 DoD対象外とする人間のスコープ例外承認」を個別に得る必要がある(13節・14節)。

### 3.4 D04: 素材family/ID非依存の設計

`materialMapping.ts`(alice所有)が、電池素材ごとに`batteryRunawayHeatThreshold`(数値、リポ系以外は`undefined`)を写像し、`DestructionConfig.d04`(2.4.2節)へ渡す。engineはこの数値を`config.d04?.batteryRunawayHeatThreshold: number | undefined`として受け取り、`config.d04`が`undefined`ならD04判定自体をスキップする(3.1節ケース(a))。engineのコード上に「リポ」「lithium」等の素材ID・family文字列が一切現れない設計を実装ステップの受け入れ条件とする。

```ts
// materialMapping.ts に追加(既存BATTERY_INTERNAL_RESISTANCE_RATIO_CALIBRATION等と同じ書式)
const BATTERY_RUNAWAY_HEAT_THRESHOLD_CALIBRATION: Record<BatteryMaterialId, number | undefined> = {
  // リチウムイオン系: 熱暴走特性を持つためBATTERY_HEAT_LIMIT未満の実測相当値を設定(出典コメント必須)
  // ニッケル水素・アルカリ系: 熱暴走特性を持たないためundefined(D04は物理的に発生しない)
};
```

---

## 4. WearState→engine実効値の写像拡張

現状`composeConfigFromMaterials`(**src/materials/materialMapping.tsに属する純関数**。8節参照)はWearStateを受け取らない。Phase3で以下を追加する:

```ts
export interface MaterialWearInput {
  magnetWear?: Extract<WearState, { kind: 'magnet' }>;
  gearWear?: Extract<WearState, { kind: 'gear' }>;
  brushWear?: Extract<WearState, { kind: 'brush' }>;
}
```

`composeConfigFromMaterials`の引数に`wear?: MaterialWearInput`を追加する(既存呼び出し元は省略可能、後方互換)。同時に、3節で確定した`DestructionConfig`(2.4.2節、モード別optionalグループ)のしきい値群も、素材選択から一度だけ計算し、セッション中は不変のconfigとして持たせる(CLAUDE.md「写像は起動時に一度計算し、走行中は既存パラメータのみが生きる」を厳守)。

**未確定点**: `composeConfigFromMaterials`の戻り値に`DestructionConfig`を追加で持たせるか、`DestructionConfig`専用の別関数(例: `composeDestructionConfigFromMaterials`)として分離するかは未確定である。Step1実装計画で確定する。

`wearAccumulation.ts`(新設)の責務: `DestructionEvent`→WearStateへの加算量を計算する純関数。engineに依存しない。2.1節で`DestructionEvent`から汎用`severity`フィールドを削除した(5.2節)ため、各モードの加算量は`event.causeLog`の固有フィールド(例: D05なら`sparkDurationS`)から個別に導出する。具体的な計算式は各モードの実装ステップ(12節)で確定する。

---

## 5. 三段開示・破壊イベント通知APIの決定論境界

### 5.1 固定dt状態遷移への統一

D02・D04・D07・D09は「継続量」を要するが、`SimState.batteryHeat`と同型の**固定dt漏れ積分**(2.1節の各`XxxProgress`の明示フィールド、D03/D04は`shared.shortCircuitDurationS`)へ統一する。これにより:

- 毎step更新箇所: `advanceDestructionState`内、既存物理ステップ確定直後(2.4.3節)
- rng消費順: `advanceDestructionState`は非消費(2.4.3節)
- リプレイに必要な初期状態: `createInitialDestructionState()`(2.1節)
- `HistorySample`(既存、実験ノート用の記録)はdestructionModesの入力から完全に切り離され、三段開示段階2(自動差分検知)専用の用途に限定される(5.3節)

### 5.2 破壊イベント通知API

`DestructionEvent`はmodeを判別子とする**判別union**として渡す(v5レビュー#5対応、2.1節)。判定ロジック自体はengine内で完結させ、UIに閾値判定を持ち込ませない。

```ts
export type DestructionEvent =
  | { mode: 'D01'; causeLog: D01CauseLog }
  | { mode: 'D02'; causeLog: D02CauseLog }
  | { mode: 'D03'; causeLog: D03CauseLog }
  | { mode: 'D04'; causeLog: D04CauseLog }
  | { mode: 'D05'; causeLog: D05CauseLog }
  | { mode: 'D06'; causeLog: D06CauseLog }
  | { mode: 'D07'; causeLog: D07CauseLog }
  | { mode: 'D09'; causeLog: D09CauseLog };
```

v5にあった全モード共通`severity: number`は削除した。理由(v5レビュー#5対応): D01/D03等の「WearState対象外」モードには使い道がなく、モードごとに物理的意味が異なる量(火花継続時間・瞬間トルク超過量・熱ゲージ値)を単一の0–1値へ押し込めると根拠のない固定値になりかねない。上記の判別unionにより`event.mode`で分岐すれば`event.causeLog`は自動的にそのモード固有の型へ絞り込まれる(TypeScriptの型narrowing)ため、`wearAccumulation.ts`(4節)は各モード固有フィールドから直接、型安全に加算量を導出できる。`mode`と`causeLog`の対応保証にunknown型を使う必要がない。

コールバックの実体は「毎ステップ呼べる純粋な状態遷移関数」(`advanceDestructionState`)であり、EventEmitter的な登録機構ではない。呼び出し側(store層)が毎フレーム呼び、返ってきた`events`を見てUI側の演出・通知処理へ橋渡しする。

### 5.3 三段開示・段階2の所有(配置先の訂正、v5レビュー#10対応)

段階2(自動差分検知、「同一構成で3%低下」)の判定ロジック(同一レシピ照合+3%しきい値比較)は、**`src/engine/`ではなく`src/materials/`配下**(alice所有、例: `src/materials/regressionDiff.ts`)に置く。理由: この判定は物理ステップ(固定dtの状態遷移)ではなく、既に完了した複数セッションの`ExperimentSession`記録同士を比較する分析関数であり、CLAUDE.mdが許可するengine拡張点(a)〜(e)のいずれにも該当しない。`src/engine/`はCLAUDE.mdの5点以外の目的で構造変更しない方針(凍結方針冒頭)であるため、この機能はengine外に置くのが素直な帰結である。実行タイミング・保存先(実験ノート追記)・UI表示はbrabit所有。既存`ExperimentSession`を比較材料として利用する。この配置判断自体を**Fable裁定事項とする**(15節)。

---

## 6. 三段開示・段階1のHUD境界

- **段階1はbrabit所有。ただしHUDが走行中に参照してよいのは、セッション開始時に`composeConfigFromMaterials`が一度だけ合成した実効config(劣化込みの`magnetStrength`等)由来の`SimState`、および2.5節のセッション内オーバーライド機構が既存configへ合成した実効値のみ**である。
- 永続`WearState`そのものを、走行中にHUDが再読み込み・再写像することは禁止する。理由: CLAUDE.md「写像は起動時に一度計算し、走行中は既存パラメータのみが生きる」の決定論境界を、演出コードが迂回して壊す経路になり得るため。
- 具体的には、性能低下アイコン・モーター音のピッチ低下は「劣化込みですでに下がっている`SimState.rpm`や`current`の値」をそのまま表示に使えばよく、`WearState.demagnetizationFraction`の数値を演出側が改めて参照する必要はない設計になっている。
- 段階2・段階3の所有分担は5.3節のとおり(段階2=alice判定ロジック+brabit実行/表示、段階3=brabit)。

---

## 7. 図鑑・個体永続状態のstore層所有

Phase2の分離パターン(`src/store/shopEconomy.ts`=alice寄り純粋ロジック / `src/store/shopEconomyStore.ts`=brabit所有Zustand hook)を踏襲する:

- **データスキーマ・純粋な変換関数**: `src/materials/`配下(alice所有)
- **Zustand store・localStorage永続・実個体IDの発行**: `src/store/`配下(brabit所有)。新設候補`src/store/failureCodexStore.ts`(persist key案`v3:failureCodex`)
- 個体在庫の永続化はPhase2の暫定ID方式からPhase3で初めて永続IDへ格上げする。ID発行はbrabit所有storeで行い、`InventoryItem`型自体は不変

**2.1節との整合**: 「セッション内で一度きり」(`XxxProgress.triggered`)はengine所有の一時状態(セッション終了で破棄)であり、「図鑑に初めて登録されたか」(`alreadyDiscoveredSet`相当)はstore層所有の永続状態である。両者は別物であり、store層の永続集合をengineへ注入することはない(engineの物理判定は何度目の発見でも同じ)。

**2.3節・2.4節との整合**: 2.3節のD08予約枠(store層専用の`FailureCodexModeId`)は本節のstore層所有パターンに従う。2.4節の設計が「既存engine関数の戻り値契約変更」から「加算的ラッパー新設+store層の呼び出し先切替」へ変わったため、brabit_mot3との協議事項は「gameStore.tsの3ループを新規ラッパーへ切り替える作業分担・`destructionState`スライスの追加」である。

上記分担案は本計画のFableレビュー+brabit_mot3との最終合意を経て確定する。

---

## 8. 決定論境界の保証構造(v5レビュー#9対応: WearStateの扱いを訂正)

engineの純関数(`advanceDestructionState`)は「毎回明示的に渡された引数のみから出力を計算する」。**永続化されたWearStateそのものをengineへ引数として渡すことはしない。** WearStateを読むのは`src/materials/composeConfigFromMaterials`(**src/materials/に属する純関数であり、engineの純関数ではない**。v5は「engineの純関数」と誤記していた)であり、これがセッション開始時に**一度だけ**WearState込みの実効値(劣化込みの`magnetStrength`等)へ写像する。走行中のengine(`step`/`stepTestRun`/`stepTrackRun`/`advanceDestructionState`)が受け取るのはこの写像済みの数値だけであり、raw WearStateを直接見ることはない。この境界は4節・6節と整合する。

2.4.3節の所有者・初期化・受け渡し設計はこの節の具体化である。

**図鑑発見状態からの独立**: セッション開始時、store層は`createInitialDestructionState()`(2.1節)を呼んで`DestructionState`を初期化する。この初期化に図鑑の「発見済み」永続状態(7節)を一切混ぜない。したがって同一seedで同一レシピを何度再生しても、初回発見だろうと2回目だろうと`DestructionState`と`events`の遷移列は完全に同一になる(図鑑登録・報酬の要否だけがstore層で後から分岐する)。

---

## 9. D08と(e)周回拡張の順序問題

**A案を確定する。**

- Phase3では`FailureCodexModeId`(store層/UI層専用型、2.3節)に`'D08'`を含め、図鑑の型・予約枠として存在させる。ただしengineの`DestructionState`・`DestructionModeId`にはD08を含めない(0節・2.3節・2.1節)。
- **Phase3のDoD「全モードの再現手順テスト」からD08を明示的に除外する。** D08の実トリガ実装・再現手順テストはPhase5(e)-1(周回構造)完成後の別ステップへ移管する。これは通常のフェーズ表(CLAUDE.md)からの逸脱にあたるため、**人間のスコープ例外承認事項として本計画のFableレビュー後、人間承認時に明示的に諮る**(「D08はPhase3 DoD対象外」の承認を個別に得る)。
- 理由: 「限界超過→コースアウト」の判定式は(e)の保持判定式そのものであり、Phase3時点の直線コースで代用トリガを作ると、Phase5本実装時に必ず作り直しになる(使い捨て物理)。CLAUDE.mdの「実物の工作・走行で起こりうる原因と対応させる」原則にも、直線コース上の代用クラッシュ条件は馴染まない。簡易代替トリガ案は不採用とする。

---

## 10. Phase2繰越事項の採否・順序

- ブラシパッケージ(Fable判定済み): Phase3が実装先。D05設計(3節)がその本体。**これによりbrushファミリーは0節のとおりPhase3で接続される。**
- ギヤJ/D06: 同じくPhase3が実装先。D06トリガ設計(3節)に合わせ、ギヤ質量/慣性J増側の接続も同時に行う。
- 未接続だった5ファミリーのうち、残る4ファミリー(coating/substrate/roller/body)は引き続きPhase3スコープ外(0節)。
- store層個体ID・永続化の所有: 7節で提案、brabit_mot3との協議で確定。

---

## 11. art-specにない独自解釈しない事項

1. **検死レポートのレイアウト**: 単独ダイアログではなく、**図鑑詳細画面へ統合**する(確定)。「紙」様式であること自体はart-spec §5.2で既定(N6地・暗色文字、レトロ攻略本の趣)。
2. **破壊イベント発生後の画面遷移**: 自動遷移ではなく、**プレイヤーの操作待ち**とする(確定)。
3. D01〜D09の具体的な音色仕様は、brabit_mot3の別ステップ計画で個別に提示する事項として残す(未決のまま、本計画のスコープ外)。SEを各モードへ割り当てること自体はart-spec §8で既定。未決なのは各モードの具体的な音色仕様(周波数・エンベロープ等の詳細)のみ。

---

## 12. ステップ分割案

各stepの手順(不変): **実装前ステップ計画→Suu_mot3レビュー→Fableレビュー→人間承認→実装→`npm run test && npm run build && npm run lint`→報告**。commitは人間承認後のみ。

1. **Step1: 契約の最小実証(D01/D03)**。`destructionModes.ts`(2.1・2.2節の型)+`destructionOrchestration.ts`(2.4節の加算的ラッパー、`stepMotorWithDestruction`のみ。D01/D03は車体層を要さないため)+D01/D03を実装する。D03は`shared.shortCircuitDurationS`+`config.d03.shortCircuitDurationLimitS`を要するため新規較正値が1つ入る(D01は較正値ゼロのまま)。**2.5節のD01セッション内効果は既存vehiclePhysics.tsの機構をそのまま使うため、motor-onlyのStep1では対応不要**(D01のcauseLog記録のみを実装する)。D03のmotor-onlyでの停止機構は2.5節のとおり未確定であり、本stepのゲート事項に含める。
   - **ゲート事項(Fableへ諮る、15節)**:
     a. 2.1節の型設計(共有信号+モード別Progress+`DestructionFrameInput`)の妥当性
     b. 2.2節: `temperature: TemperatureReading`が`unavailable`のままで「完成」と扱えるか(案A)、温度モデル完成まで未完成扱いとするか(案B)
     c. 2.4節: 加算的ラッパー新設案(案2)の採否、および2.4.2節のDestructionConfig段階導入案(案A)の採否
     d. 3.1節: `shortCircuitDurationS`の解除時意味論(案1即時リセット/案2漸減、名称変更要否)
     e. 2.5節: D03のmotor-onlyベンチ試験での扱い(そもそも検出対象にするか)
   - **テスト網羅**: D01・D03それぞれについて非発火境界・発火境界・一度きり・ログ固定・dt分割不変性・相互非干渉を個別に用意する。D03のdt分割不変性テストは`shared.shortCircuitDurationS`が対象。
   - **決定論境界のテスト(v5レビュー#13対応、新設)**: 同一stepでD01とD03が両方発火し得る入力列を用意し、`events`が常に`['D01イベント', 'D03イベント']`の固定順序(2.1節の固定順序規約)で並ぶことをテストで担保する。`causeLog.atT`が`shared.elapsedTimeS`のこのstep更新後の値と一致することも併せて検証する。
   - **D04テストの扱い**: Step1はD01/D03のみを実装するため、D04の発火テスト・D03/D04同時発火テストはここでは実施しない。Step1で検証するのは共有信号`shared.shortCircuitDurationS`の更新がD03単独の入力(`config.d04`は`undefined`のまま)で正しく行われることのみとし、未実装のD04をテスト対象に含めない。D04関連のテストはStep5(D04実装時)へ移管する(下記Step5参照)。
2. **Step2: D07磁石熱ゲージ実装+三段開示段階1・2の骨格**(v5レビュー#11: v5の「D07磁石温度モデル」という表現は3.2節案A=無次元ゲージと矛盾するため訂正)。`destructionOrchestration.ts`に`stepTestRunWithDestruction`を追加(2.4.2節の車両用frame builder未確定点を解消する必要がある)。3.2節・2.2節の案A/B採否をFableに確定してもらった上で着手する。2.5節のD07セッション内弱化モデル(発火前からの比例弱化か、発火時の一段階弱化か)もここで確定する。
3. **Step3: D05ブラシパッケージ**(WearState結線込み)。2.4.2節の`theoreticalCurrentA`(チャタリング前電流)を用いた入力棚卸しをここで実装・検証する。
4. **Step4: D06ギヤ歯欠け+ギヤJ増接続**(Phase2繰越の解消)。`destructionOrchestration.ts`に`stepTrackRunWithDestruction`を追加(コース走行が絡むため)。**2.4.2節の未確定点を解消する**: `loadTorqueNm`を含む車両用frame builderをここで設計する。**2.5節のD06セッション内効果モデル(実効`gearEfficiency`低下か回転位相依存の間欠損失か)もここで確定する**。
5. **Step5: D02/D04**。3.1節の`stage`遷移の具体的時間・過放電scope gapの採否をここで確定する。**3.1節で分離した3ケース(a)(b)(c)のテスト**: (a) D03のみ発火(`config.d04`未設定)、(b) D04のみ発火(`config.d04`設定、D03条件未到達)、(c) 両方の条件が同一stepで成立する場合の排他/併発をそれぞれ個別にテストする。(c)の排他/併発の採否はここでFableへ確認する。**2.5節のD02セッション内効果モデル(実効coilTurns低下かR_coil低下か)、D04の給電停止機構(案a/案b)もここで確定する**。
6. **Step6: D09、独立設計ゲート**(3.3節)。実装するか見送るか自体をこのstepで確定する。**見送る場合は3.3節のとおりD08と同様の人間スコープ例外承認を得る**。2.5節のD09物理消費モデルもここで確定する。
7. **Step7: D08型・図鑑予約枠のみ**(2.3節・9節)。
8. **Step8: 図鑑store・WearState永続化**(brabit協働、7節)。2.4節の`gameStore.ts`切替をここでbrabit_mot3と最終合意する。
9. **Step9: 計測器店UI接続**(brabit、三段開示段階3)。

## 13. DoD・テスト方針

- 既存DoD不変: `npm run test && npm run build && npm run lint`
- **例外1**: 「全モードの再現手順テスト」からD08を除外する(9節、人間承認事項)
- **例外2**: D09がStep6で実装見送りとなった場合、D08と同様にPhase3 DoD対象外とする人間スコープ例外承認を個別に得る(3.3節)
- engine変更には対応する数値テストを必ず追加
- 決定論: 同一シード+同一WearStateで同一`DestructionEvent`列が出ることをテストで担保。同一stepで複数モードが成立する場合の`events`順序が固定であることもテストで担保する(2.1節・12節Step1)

## 14. 未決事項一覧

- 7節・2.4節: `gameStore.ts`の3ループ切替作業分担・`destructionState`スライス設計 — brabit_mot3との協議で確定
- 2.2節: `temperature`が`unavailable`のままで完成扱いとするか(案A) / 温度モデル完成まで未完成扱いとするか(案B) — Fable判断
- 2.4節: 加算的ラッパー案(案2)の採否 — Fable判断
- 2.4.2節: `DestructionConfig`段階導入案(案A: モード別optionalグループ)の採否 — Fable判断
- 2.4.2節: vehicle/track版のframe構築方法(`loadTorqueNm`を含む専用builderの具体形) — Step4でFableへ確認
- 2.5節: D02(層間短絡)の物理モデル(実効coilTurns低下 vs R_coil低下) — Step5でFableへ諮る
- 2.5節: D04の給電停止機構(MotorConfig新規任意フィールド案a vs stepTestRun新規任意引数案b) — Step5でFableへ諮る
- 2.5節: D06の物理モデル(実効gearEfficiency低下 vs 回転位相依存の間欠損失) — Step4でFableへ諮る
- 2.5節: D07の連続弱化モデルと比例定数 — Step2でFableへ諮る
- 2.5節: D03/D04のmotor-onlyベンチ試験での扱い — Step1でFableへ諮る
- 3.1節: `shortCircuitDurationS`の解除時意味論(即時リセット案1/漸減・改称案2) — Step1でFable判断
- 3.1節: D03/D04が同一stepで両方の条件を満たす場合の排他/併発 — Step5計画でFableへ確認
- 3.2節: D02/D07/D09の無次元ゲージ案(案A)vs実温度モデル案(案B) — Fable判断
- 3.1節: D04の過放電トリガをPhase3で実装するか将来枠か — Step5でFable/人間へ諮る
- 3.3節: D09を実装するか見送るか自体、見送り時の人間スコープ例外承認 — Step6で確定
- 5.3節: 三段開示段階2の配置先(`src/materials/regressionDiff.ts`案)の妥当性 — Fable裁定
- D02/D05/D06/D09の較正値・式の具体値 — 各ステップ実装計画で個別に確定
- 4節: `DestructionConfig`を`composeConfigFromMaterials`の戻り値へ統合するか別関数に分離するか — Step1実装計画で確定
- 9節: D08をPhase3 DoD対象外とする扱いの人間承認 — 本計画のFableレビュー後に諮る
- 11節③: D01〜D09の具体的音色仕様 — brabit_mot3の別ステップ計画事項(本計画スコープ外)

---

## 15. Fableへの重点確認事項

- 2.1節: 共有信号(`shared.shortCircuitDurationS`・`shared.elapsedTimeS`)+モード別Progress型+`DestructionFrameInput`の設計妥当性
- 2.2節: `temperature`が`{kind:'unavailable'}`のままでspec §7.1適合・Phase3完成扱いとできるか(案A)、温度モデル完成まで未完成扱いとすべきか(案B)
- 2.3節: D08予約枠の設計(engine型除外+store層別型 vs 他案)
- 2.4節: 既存API(`step`/`stepTestRun`/`stepTrackRun`)を無改修のまま維持する加算的ラッパー案(案2)の採否
- 2.4.2節: `DestructionConfig`段階導入案(モード別optionalグループ、案A)の採否
- 2.4.2節: vehicle/track版のframe構築(D06の`loadTorqueNm`入力)をStep4へ先送りする扱いの妥当性
- **2.5節(新設、最重点)**: 破壊後の物理状態遷移の全体設計。特に(1)D02の物理モデル、(2)D04の給電停止機構(案a/案b)、(3)D06の物理モデル、(4)D07の連続弱化モデル、(5)D03/D04のmotor-onlyでの扱い
- 3.1節: 短絡解除時の意味論(即時リセット案1推奨/漸減・改称案2)、および同一step両条件成立時の排他/併発
- 3.2節: D02/D07/D09の無次元ゲージ案(案A)vs実温度モデル案(案B)
- 5.3節: 三段開示段階2(自動差分検知)を`src/engine/`ではなく`src/materials/`へ置く判断の妥当性
- その他、14節に列挙した全未決事項

Fableの回答は要約せず全文でSuu_mot3経由で中継してもらう(CLAUDE.md「レビュー条件・承認条件は要約せず全文中継する」規律)。実装・commitはFableレビュー・人間承認まで引き続き未着手のまま維持する。

---

## 16. 改訂履歴(v1→v6)

過去の改訂差分表をすべて保持する(v5レビュー#4に基づく方針を継続)。v1→v5の差分表は`docs/phase3-plan-v5.md`16節に記載済みのため、本節ではv5→v6の差分のみを追加する(v1〜v4の差分表もv5に完全な形で保持されており、参照はv5を辿ればよい。歴史的経緯を1ファイルへ集約したい場合はStep1着手前に別途統合するかSuu_mot3へ確認する)。

### v5→v6(Suu_mot3レビュー13項目)

| # | 指摘 | 対応節 | 要旨 |
|---|---|---|---|
| 1 | 破壊後の物理状態遷移がモード別に定義されていない | 2.5(新設) | 既存の`coilCollapsePenaltyMm`・`status:'overheated'`機構を実装から確認し再利用。D02/D04/D06/D07は新規セッション内オーバーライド機構が必要と特定し、具体的な物理モデル案をFable確認事項として整理 |
| 2 | D01の立ち上がり入力(prev/next比較)の設計 | 1・2.4.2 | 既存exportの`didCollapseJustHappen(prev,next)`をそのまま再利用する設計に変更。新規ロジック不要 |
| 3 | D05の電流入力の原理的な取得不能性 | 1・2.4.2・3 | `evaluateMotorFrame`はチャタリング反映後の電流のみ返すため、既存exportの`computeElectricalState(config, prev.theta, prev.omega)`を再呼び出しして理論電流を独立取得する設計に変更 |
| 4 | 契約型(`DestructionModeId`・`DestructionFrameInput`・`advanceDestructionState`)が未定義 | 2.1 | 完全な型一式を明記。`atT`の出典を`shared.elapsedTimeS`(新設)に一本化 |
| 5 | `DestructionEvent.causeLog: unknown`が型安全でない、`severity`の根拠不明 | 2.1・5.2・4 | modeを判別子とする判別unionへ変更。`severity`を削除し、加算量算出はwearAccumulation.tsが各モード固有フィールドから導出する設計へ変更 |
| 6 | 段階導入時に`DestructionConfig`が未実装モードへ仮値を要求する | 2.4.2 | モード別optionalグループへ変更。3案比較を追加 |
| 7 | CauseLogの説明(4項目限定)と実際の型(モード固有追加あり)が矛盾 | 2.2 | 「3節の物理トリガ判定式に登場する量に限定する」という具体的な境界規約を明記 |
| 8 | D08の記述が§0とその他の節で矛盾、「全9種+D08」が二重計上 | 0・2.3 | §0を2.3節・9節の確定方針(engine完全除外)へ統一。「全9種(D08を含む)」へ訂正。5ファミリー列挙にbrushを補い、Phase3で接続される旨を明記 |
| 9 | `composeConfigFromMaterials`を「engineの純関数」と誤記、WearState直接注入の記述 | 1・4・8 | `src/materials/`所属である旨を明記し、raw WearStateはengineへ渡さずセッション開始時の写像入力に限定する旨へ訂正 |
| 10 | 三段開示段階2(`regressionDiff.ts`)のengine配置がCLAUDE.mdの許可拡張点と対応しない | 5.3 | `src/materials/`への配置へ変更し、判断根拠を明記。Fable裁定事項として15節へ追加 |
| 11 | 用語誤り(D02/D03の生トリガ)・Step2ラベルの矛盾・古いテスト件数 | 1・12・2.4.4 | D03のみの生トリガへ訂正。Step2ラベルを「磁石熱ゲージ」へ訂正。テスト件数を現行844件へ更新 |
| 12 | D03/D04同時発火条件の記述が論理的に自己矛盾 | 3.1 | 3ケース(D03のみ/D04のみ/同一step両方)へ明確に分離し、(c)のみをFable裁定事項とした |
| 13 | 発火入力・causeLogの時刻・同一step複数モードの順序が未確定 | 2.1・2.2・12 | `atT`の出典・タイミング規約を明記。`events`の固定順序規約を追加し、Step1のテストに決定論境界の検証を追加 |
