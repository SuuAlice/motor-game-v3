# Phase 3統合計画(破壊モード+図鑑)— v11改訂版(Fable提出前の最終契約閉じ)

作成: alice_mot3 2026-08-02。**状態: Suuレビュー前・Fable未提出・実装/commit未着手。**

本書は`docs/phase3-plan-v10.md`をSuu_mot3レビュー(2026-08-01T20:58着信、以下「v10レビュー」)7項目に基づき改訂したものである。**v10をこの文書で置き換える。v10は履歴として保持する(削除しない)。**

v10レビューの結論: 「v9レビューの9点は設計方向として解消した。判別union・D06/D09差分分離・FireExposureProfile分離・D04の停止規則・単調sequence・全snapshot検証・3層所有境界は採用する。残件は、既存コードへ接続したときに終端できない経路、リプレイ入力不足、型安全でない適用関数」。**v11でこの7点を閉じた後、Suu再照合を経てFableへ提出する予定**であり、Suuからも「`unsafeDischargeStartRatio`の較正値・D04簡約の妥当性・gear damage合成式・gear総歯数の出所・FireExposureProfileの具体的隣接role」はFableへ残してよいと明示された(15節)。

対象: `docs/spec.md`(r2)§4.8・§5.1・§5.2・§5.3・§7.1・§7.1.1・§7.2・§7.3・§7.4・§7.5・§12・§13。既存`src/engine/vehiclePhysics.ts`(`VehicleSimState.status`の`'overheated'`を含む全遷移)を再確認した。

---

## 0. v10レビュー7項目 対応サマリ

| # | v10の欠陥 | 対応節 |
|---|---|---|
| 1 | D02/D04destruction終端が成立してもVehicleSimState.statusが'running'のままの場合、`finalizeRun`を呼ぶ正当な引数が無かった | 1.1節: `DestructionStepResult`へ`termination: RunOutcome \| null`を追加。engine自身がstep結果として終端を返す |
| 2 | 既存`VehicleSimState.status`の`'overheated'`がRunOutcome.endReasonへ写像先を持たなかった | 1.1節: `endReason`へ`'overheated'`を追加。motor-onlyの終了理由・destruction/manualAbort競合時の優先順位を確定 |
| 3 | `FireExposureProfile`・ギヤ総歯数がRunAccumulatorにしかなく、RunSnapshotから再現できなかった | 1.4節: `DestructionRunContext`を新設しRunSnapshotへ統合。RunAccumulatorの二重保持を解消 |
| 4 | D04 eventが`fireExposureProfile`必須なのに、`advanceDestructionState`はこれを持たない値を返す型矛盾があった | 1.1節・2.4節: `runContext`を`advanceDestructionState`の引数へ追加し即座に完成させる。`physicsSnapshotAtT`のみ内部型`UnstampedDestructionEvent`で後付けする設計に整理 |
| 5 | D05の累積量が時間のみで、正典の「強度連続量」を再現できなかった | 1.2節・2.1節: `cumulativeSparkExposure`(超過電流×時間の積分)へ変更 |
| 6 | 同一lease内でN完了前にN+1を開始でき、高水位によりNが飛ばされ得た | 1.5節: タブ内ランタイム状態として`currentRunSequence`を1件だけ保持する制約を追加 |
| 7 | 劣化適用APIが不正なrole/state組合せを型上許し、battery消費・存在しない対象の扱いも未定義だった | 1.6節: role別関数へ分離。battery消費は専用処理。存在しない対象は整合性エラーとして統一 |

---

## 1. P3-0: クロスレイヤ契約(型凍結ゲート)

### 1.1 RunOutcomeの生成: destruction終端の即時確定と全終了経路の網羅(v10レビュー#1・#2・#4対応)

**destruction終端をstep結果自体に持たせる(v10レビュー#1)**: D02(発火到達)・D03・D04(炎上到達)・D09(焼付き)は、既存の`VehicleSimState.status`とは独立にengine自身が「このstepで走行が終わる」と判定できる(既存物理statusが`'running'`のままでも)。`finalizeRun`を呼ぶための正当な`RunEndSignal`が存在しないという矛盾を解消するため、**各`stepXxxWithDestruction`ラッパー自身が、terminal候補が生じた瞬間に`RunOutcome`を確定して返す**。

```ts
export interface DestructionStepResult<TPhysicsState> {
  physicsState: TPhysicsState;
  accumulator: RunAccumulator;
  termination: RunOutcome | null; // 非nullなら、このstepでdestruction終端が確定した。
  // storeはこれ以上物理stepを呼ばず、この値をそのままRunOutcomeとして使う(v10レビュー#1
  // 「storeはaccumulator内部を読んで終端判定せず、step結果のterminationだけを受け取る」)
}
```

`stepXxxWithDestruction`は内部で`accumulator.terminalModeCandidates`が(このstep呼び出し前後で)非空になった場合、`finalizeRun`相当の処理をその場で行い`termination`へ格納する。**destruction終端とmanualAbortが同一境界で競合した場合、既に成立済みのdestructionを優先する**(v10レビュー#2「P3-1で決めるを残さない」への回答として本計画で確定する。store側が同一stepでmanualAbortを送っても、その直前のstep呼び出しが既に`termination`非nullを返していれば、storeはそちらを使う——`termination`のチェックが常にmanualAbort処理より先行するようstoreループの順序を規定する)。

**全終了経路の網羅(v10レビュー#2)**: 既存`VehicleSimState.status`は`'finished'|'stalled'|'derailed'|'overheated'`を持つ(vehiclePhysics.ts確認済み)。v10の`RunOutcome.endReason`に`'overheated'`が欠けており、`PhysicsEndStatus`が受理しても変換先が無い実装不能な状態だった。

```ts
export type PhysicsEndStatus =
  | { status: 'finished' }
  | { status: 'stalled'; failureCode?: FailureCode }
  | { status: 'derailed' }
  | { status: 'overheated' }; // 既存のBATTERY_HEAT_LIMIT到達由来。D03のshortCircuitDurationS条件を
  // 満たさないまま(短絡を伴わない)通常の発熱だけでこの状態に達する経路が存在するため、
  // destructionTerminal(D03)とは独立した終了理由として保持する

export type RunEndSignal =
  | { kind: 'physicsEnded'; physicsEndStatus: PhysicsEndStatus }
  | { kind: 'manualAbort' };

function convertPhysicsEndStatusToEndReason(status: PhysicsEndStatus): Exclude<RunOutcome['endReason'], 'destructionTerminal' | 'manualAbort'> {
  if (status.status === 'stalled' && status.failureCode === 'energyExhausted') return 'energyExhausted';
  if (status.status === 'stalled') return 'stalled';
  return status.status; // 'finished' | 'derailed' | 'overheated'
}

export type RunOutcome =
  | {
      endReason: 'destructionTerminal';
      terminalModes: readonly [DestructionModeId, ...DestructionModeId[]];
      events: readonly DestructionEvent[];
      destructionState: DestructionState;
      degradationDiffs: readonly DegradationDiff[];
      replaySnapshot: RunSnapshot;
    }
  | {
      endReason: 'finished' | 'stalled' | 'derailed' | 'overheated' | 'energyExhausted' | 'manualAbort';
      events: readonly DestructionEvent[];
      destructionState: DestructionState;
      degradationDiffs: readonly DegradationDiff[];
      replaySnapshot: RunSnapshot;
    };

export function finalizeRun(accumulator: RunAccumulator, endSignal: RunEndSignal): RunOutcome {
  // destruction終端が既にtermination(上記)で処理されているケースはこの関数を呼ばない
  // (store側の呼び出し規約、4.4節)。ここは非destruction終了専用の経路
  const degradationDiffs = deriveDegradationDiffs(accumulator.events, accumulator.destructionState);
  const endReason = endSignal.kind === 'manualAbort' ? 'manualAbort' : convertPhysicsEndStatusToEndReason(endSignal.physicsEndStatus);
  return { endReason, events: accumulator.events, destructionState: accumulator.destructionState, degradationDiffs, replaySnapshot: accumulator.replaySnapshot };
}
```

**motor-onlyの終了理由(v10レビュー#2「motor-onlyの`stopped:true`がどのendReasonになるかをP3-0で確定する」)**: 既存`SimState`(motor-only)は`status`概念自体を持たない(vehiclePhysics.tsの`VehicleSimState.status`はvehicle/track専用)。したがって**motor-onlyコンテキストには`physicsEnded`シグナルが存在しない**——motor-onlyの走行は、プレイヤー操作(`manualAbort`)か、destruction終端(`termination`、上記)のいずれかでのみ終わる。`PhysicsEndStatus`型はvehicle/track専用として扱い、`P3-1`実装計画でmotor-only側の`RunEndSignal`が`manualAbort`のみになることをテストで明記する。

### 1.2 損壊可能アセンブリと劣化差分の再設計(v10レビュー#5対応、D05の強度統合)

**D05の強度連続量への修正(v10レビュー#5)**: v10の`cumulativeAbnormalExposureS`(時間のみの積分)は、正典§7.1.1「反復・強度連続量」を再現できない(しきい値直上の弱いスパークと大電流のスパークが同じ摩耗になってしまう)。修正: **超過電流×時間の積分**へ変更する。

```ts
// D05Progress(2.1節)の該当フィールドを次のとおり修正
cumulativeSparkExposure: number; // 単位: A·s。Σ max(0, theoreticalCurrentA - config.d05.brushSparkCurrentThresholdA) × dt
// (chatterFramesLeft>0の間のみ積算)。既存nextBatteryHeatのI²R的な「超過量を積分する」設計パターンと
// 同型(1節、既存パターンの再利用)。有限非負であることをruntime検証する。換算係数(A·s→wearFraction)
// の較正値はP3-3実装ステップ/Fableへ委ねる(15節)
```

episode件数(`episodeCount`)・図鑑初回性(`isFirstThisSession`)・連続摩耗量(`cumulativeSparkExposure`)は互いに独立して保持し、混同しない(v10レビュー#5)。

### 1.3 store所有・PlayerInventoryの拡張(v10から継続)

### 1.4 リプレイスナップショット契約: `DestructionRunContext`の統合(v10レビュー#3対応)

**全リプレイ入力をRunSnapshotへ集約する(v10レビュー#3)**: v10は`FireExposureProfile`をRunAccumulatorにのみ持たせており、保存済みsnapshot+seedだけからD04イベント・延焼差分を再現できなかった。また`WearState.gear.totalToothCount`(1.2節、v10)をengineが走行中に読む経路も存在しなかった(engineは個体ID・在庫を知らないため)。**個体IDを含まない、走行に必要な値だけを`DestructionRunContext`としてrunスナップショットへ含める**。

```ts
export interface DestructionRunContext {
  fireExposureProfile: FireExposureProfile; // 3.1節。走行開始時に装備から構築、個体IDは含まない
  gearTotalToothCount: number; // 走行開始時に装備ギヤ個体のWearState.gear.totalToothCountから
  // 複写した値(個体IDは含まない)。engineは走行中この値を再度在庫から読まない
}

export interface RunSnapshot {
  contractVersion: number;
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  runContext: DestructionRunContext; // 新設
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: TrackDefinition | null;
  seed: number;
  initialDestructionState: DestructionState;
}

export interface RestoredRunSnapshot {
  // RunSnapshotと同型のフィールド+trackのみValidatedTrackDefinition(1.4節、v10から不変)。
  // runContextもruntime検証対象に含める(FireExposureProfileの形状、gearTotalToothCount>0)
}
```

`RunAccumulator`(1.1節)は`replaySnapshot: RunSnapshot`のみを保持し、`fireExposureProfile`等の**二重コピーを持たない**(v10レビュー#3「RunAccumulatorはsnapshotと別のprofileコピーを二重保持せず、snapshot/run contextを唯一の正とする」)。`RunAccumulator`の定義から独立した`fireExposureProfile`フィールドを削除する(v10からの変更)。

**永続WearStateとの関係**: ギヤ個体が永続的に`totalToothCount`を保持すること(v10 1.2節)と、走行開始時にその値を`DestructionRunContext`へ複写すること(本節)は両立する。engineが走行中に在庫を直接読む設計にはしない(v10レビュー#3で明記されたとおり)。

### 1.5 runIdの所有境界・冪等性・並行実行の完全化(v10レビュー#6対応)

**同一lease内の単一in-flight制約(v10レビュー#6)**: v10の`nextRunSequence`による単調発行は「途中reload後の番号再利用」は解消したが、「同一タブ内でNの完了前にN+1を開始する」ケースを防げていなかった(N+1が先に適用されると高水位によりNがskipされる)。**永続ロックではなく、タブのランタイム状態(メモリ上、reloadで自然に失われる)として制約する**:

```ts
// store層のランタイム状態(persistしない。SaveEnvelopeMetaとは別)
export interface TabRuntimeState {
  currentRunSequence: number | null; // このタブで現在進行中のrun。非nullの間、新規run開始を拒否する
}
```

- 新規run開始時、`currentRunSequence !== null`なら拒否する(同一タブ内の多重run禁止)
- run適用完了(成功・失敗いずれも確定)後、`currentRunSequence`をnullへ戻す
- reloadで`TabRuntimeState`が失われた場合、そのrunは1.7節のとおり放棄扱いとなり、永続済み`nextRunSequence`から次の番号が発行される(v10から不変の設計と整合)
- `applyRunOutcome`は`saveId`・`leaseToken`・`runSequence < nextRunSequence`(発行済み範囲)を検証する。これに加え、lease取得・heartbeat更新・適用が競合するケース(例: heartbeat更新中に他タブが横取りする)のテストをP3-0実装ステップへ追加する

### 1.6 劣化適用APIの型安全化(v10レビュー#7対応)

**role別関数への分離**: v10の`applyDegradationDiffToAssembly(diff, current: Rotor|Body|Bearing|null)`は、`diff.role`と`current`の型が対応していない不正な組み合わせを型上許していた。修正:

```ts
// src/materials/degradationApplication.ts。role別に完全に分離する
export function applyMagnetDiff(diff: Extract<DegradationDiff, { role: 'magnet' }>, current: Extract<WearState, { kind: 'magnet' }>): Extract<WearState, { kind: 'magnet' }>;
export function applyGearDiff(diff: Extract<DegradationDiff, { role: 'gear' }>, current: Extract<WearState, { kind: 'gear' }>): Extract<WearState, { kind: 'gear' }>;
export function applyBrushDiff(diff: Extract<DegradationDiff, { role: 'brush' }>, current: Extract<WearState, { kind: 'brush' }>): Extract<WearState, { kind: 'brush' }>;
export function applyRotorDiff(diff: Extract<DegradationDiff, { role: 'rotor' }>, current: RotorAssemblyState): RotorAssemblyState;
export function applyBodyDiff(diff: Extract<DegradationDiff, { role: 'body' }>, current: BodyPartState): BodyPartState;
export function applyBearingDiff(diff: Extract<DegradationDiff, { role: 'bearing' }>, current: BearingAssemblyState): BearingAssemblyState;
// batteryは状態更新ではなく消滅(配列からの除去)のため、変換関数を持たない(下記)
```

**battery消費の専用処理**: `{role:'battery', kind:'consumed'}`は部分更新ではなく全損(個体の消滅)であるため、`degradationApplication.ts`の変換関数群には含めない。`src/store/runOutcomeApplication.ts`(v10 1.6節)が、該当battery `InventoryItem`を`PlayerInventory.items`配列から直接除去する専用ロジックを持つ(v10レビュー#7「battery消費はstoreが対象battery InventoryItemをID解決して配列から除去する専用処理にする」)。

**対象装備が存在しない場合の扱い(v10レビュー#7)**: `DegradationDiff`が指すroleの個体が走行開始時装備スナップショットに存在しない場合、**原則すべて整合性エラーとする**(黙ってskipしない)。理由: destruction eventは、その発火の時点で該当roleの装備が物理的に存在したことを前提として生成される(例: D06はloadTorqueNmの計算にギヤが必須であり、ギヤ不在ではそもそもD06イベント自体が起こり得ない)。存在しないのに差分が来ることはengine/store間の契約違反であり、`applyRunOutcome`はこの場合`AppliedRunResult`ではなく明示的な整合性エラーを返す(1.5節の`ApplyRunOutcomeError`へ`{kind:'missingEquipment'; role: EquipmentRole}`を追加する)。

**toothLossCountの不変条件**: `0 <= toothLossCount <= totalToothCount`。**`totalToothCount`を超過した値を許容してclampする案(v10まで)は撤回する**——`destructionModes.ts`のD06判定ロジック自体が、`toothLossCount`が`runContext.gearTotalToothCount`(1.4節)へ到達した時点で「全損・空転」状態へ遷移し、以後は新たな歯欠けイベント/差分を生成しない設計にする(境界はengine内部の状態遷移規則で保証し、下流のclampに頼らない)。

**旧`toothDamageFraction`からの移行時の丸め・サルベージ率差(v10レビュー#7)**: 移行式`toothLossCount = round(toothDamageFraction × 既定totalToothCount)`は丸め誤差を伴い、移行前後でわずかにサルベージ率が変わり得る。これは**一度きりの、文書化された離散化誤差として許容する**(黙って無視しない。移行ログ・migration実装のコメントに明記する)。

### 1.7 全終了経路とreload保証範囲(v10から継続)

### 1.8 engineの個体ID非依存性(v10から継続)

### 1.9 使用する型の定義元一覧(v10から継続、新規型を追加)

`DestructionRunContext`(1.4節)・`UnstampedDestructionEvent`(2.4節)は`src/engine/destructionOrchestration.ts`所属。`TabRuntimeState`(1.5節)は`src/store/runOutcomeApplication.ts`所属(persistしないランタイム専用状態)。

---

## 2. モジュール構成と状態機械設計

### 2.1 型設計(v10から継続、D05Progressのみ更新)

```ts
export interface D05Progress {
  sparkDurationS: number;
  episodeTriggered: boolean;
  episodeCount: number;
  cumulativeSparkExposure: number; // 1.2節: A·s単位。旧cumulativeAbnormalExposureSから変更
  firstEpisodeAtT: number | null;
  causeLog: D05CauseLog | null;
}
```

その他のProgress型・`DestructionState`・`createInitialDestructionState`はv10から不変。

### 2.2 CauseLogと温度規約(v10レビュー#4対応、`fireExposureProfile`をD04CauseLogから削除)

```ts
export interface D04CauseLog extends CauseLogCommon {
  batteryHeatRatio: number; shortCircuitDurationS: number; stage: D04Progress['stage'];
  overDischargeRatio: number | null;
  // fireExposureProfileはここに置かない(v10レビュー#4「検死用の最小物理ログではない」)。
  // 延焼対象は2.4節のDestructionEvent(D04)側のaffectedRolesフィールドへ分離する
}
```

その他CauseLog型は不変。

### 2.3 D08の扱い(不変)

### 2.4 イベント契約: `advanceDestructionState`の引数拡張とスタンプ前/後の型分離(v10レビュー#4対応)

**`advanceDestructionState`へ`runContext`を追加する**: D04の延焼対象(`affectedRoles`)・D06の全損判定(`gearTotalToothCount`)はいずれも個体IDを含まない値であり、`destructionModes.ts`のleafモジュール方針(motorPhysics.ts等への依存を持たない)を破らずに引数として受け取れる。

```ts
export function advanceDestructionState(
  prev: DestructionState,
  frame: DestructionFrameInput,
  config: DestructionConfig,
  runContext: DestructionRunContext, // 新設(1.4節)
  dt: number,
): { state: DestructionState; events: readonly UnstampedDestructionEvent[] };
```

これにより、D04の炎上到達イベントは`advanceDestructionState`の内部で**即座に完成した`affectedRoles`を持つ**(後付けのスタンプが不要になる)。一方`physicsSnapshotAtT`は、`destructionModes.ts`が`SimState`/`VehicleSimState`の実体を知らない(leafモジュール、1節)ため、**これだけは引き続きラッパー(4.4節)が後付けする**。この非対称性を型で表現するため、`advanceDestructionState`の戻り値は内部専用の`UnstampedDestructionEvent`(公開`DestructionEvent`から`physicsSnapshotAtT`を除いた形)とする(v10レビュー#4案(b)を、affectedRolesについては案(a)で先に解決した上で採用):

```ts
export type PhysicsSnapshotAtT =
  | { context: 'motor'; state: SimState }
  | { context: 'vehicle'; state: VehicleSimState };

// destructionModes.ts内部専用(非export、またはengine内部限定export)。DestructionEventから
// physicsSnapshotAtTを除いた形(TypeScriptの分配的Omitパターンで各モードごとに定義する)
type UnstampedDestructionEvent =
  | { mode: 'D01'; causeLog: D01CauseLog; isFirstThisSession: true }
  | { mode: 'D02'; causeLog: D02CauseLog; isFirstThisSession: true }
  | { mode: 'D03'; causeLog: D03CauseLog; isFirstThisSession: true }
  | { mode: 'D04'; causeLog: D04CauseLog; isFirstThisSession: true; affectedRoles: readonly EquipmentRole[] } // v10レビュー#4
  | { mode: 'D05'; causeLog: D05CauseLog; isFirstThisSession: boolean }
  | { mode: 'D06'; causeLog: D06CauseLog; isFirstThisSession: boolean }
  | { mode: 'D07'; causeLog: D07CauseLog; isFirstThisSession: true }
  | { mode: 'D09'; causeLog: D09CauseLog; isFirstThisSession: true };

// 公開型。orchestration層(4.4節)がUnstampedDestructionEvent + physicsSnapshotAtTから組み立てる
export type DestructionEvent =
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & Extract<UnstampedDestructionEvent, { mode: 'D01' }>)
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & Extract<UnstampedDestructionEvent, { mode: 'D02' }>)
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & Extract<UnstampedDestructionEvent, { mode: 'D03' }>)
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & Extract<UnstampedDestructionEvent, { mode: 'D04' }>)
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & Extract<UnstampedDestructionEvent, { mode: 'D05' }>)
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & Extract<UnstampedDestructionEvent, { mode: 'D06' }>)
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & Extract<UnstampedDestructionEvent, { mode: 'D07' }>)
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & Extract<UnstampedDestructionEvent, { mode: 'D09' }>);
```

D05のepisodeモデル(rising edgeのみイベント化)・図鑑候補分離(`isFirstThisSession`)はv9から不変。

---

## 3. D01〜D09個別設計

v8 3節の表を維持する。

### 3.1 D04: `affectedRoles`の解決(v10レビュー#4により`advanceDestructionState`内部で解決)

炎上到達(`stage`が`'burning'`へ遷移)した瞬間、`destructionModes.ts`内部で`runContext.fireExposureProfile`(1.4節)を参照し、`bodyEquipped`(true固定で対象)+`adjacentRolesEquipped`のうち実際に装備されている(=`FireExposureProfile`構築時点で既に装備済みのroleのみを含む設計、3.1節v10から不変)roleを`affectedRoles`として`UnstampedDestructionEvent`(D04)へ格納する。`advanceDestructionState`のシグネチャに`runContext`が加わったことで、後付けスタンプが不要になった(2.4節)。

具体的な隣接関係(`adjacentRolesEquipped`の内容)はart-spec・実配置データに基づく判断であり、独自解釈せずFableレビュー後にSuu・人間承認を経てP3-0実装時に凍結する(v9から継続、15節)。

### 3.2 D04: 過放電・給電停止後の進行(v10から継続)

### 3.3 D05: episodeモデル+強度統合(1.2節・2.1節参照)

### 3.4 D06/D09: ギヤ損傷の完全分離、全損の内部状態遷移(1.6節参照)

### 3.5 D03/D04/D06: 素材family/ID非依存の設計(v8から継続)

---

## 4. destructionOrchestration.ts

### 4.1 既存3関数(変更なし、v8から継続)

### 4.2 DestructionConfig(v10から継続)

`totalToothCount`はconfigではなく`DestructionRunContext.gearTotalToothCount`(1.4節)から得る点はv10から不変。

### 4.3 電池config(v10 4.2節に統合済み)

### 4.4 ラッパー関数: `termination`の生成とrunContextの受け渡し(v10レビュー#1・#4反映)

```ts
function classifyTerminalModes(events: readonly UnstampedDestructionEvent[]): readonly DestructionModeId[] {
  const result: DestructionModeId[] = [];
  for (const event of events) {
    if (event.mode === 'D02') result.push('D02'); // D02はeventが存在する時点で常に発火到達(terminal)
    if (event.mode === 'D03') result.push('D03');
    if (event.mode === 'D04' && event.causeLog.stage === 'burning') result.push('D04');
    if (event.mode === 'D09') result.push('D09');
  }
  return result;
}

function stampPhysicsSnapshot(events: readonly UnstampedDestructionEvent[], snapshot: PhysicsSnapshotAtT): readonly DestructionEvent[] {
  return events.map((e) => ({ ...e, physicsSnapshotAtT: snapshot }));
}

function buildMotorOnlyFrameInput(config: MotorConfig, prev: SimState, next: SimState): DestructionFrameInput {
  const theoreticalCurrentA = computeElectricalState(config, prev.theta, prev.omega).current;
  return {
    currentA: next.current, theoreticalCurrentA, rpm: next.rpm, batteryHeat: next.batteryHeat,
    shorted: next.shorted, chatterFramesLeft: next.chatterFramesLeft,
    coilCollapsedRisingEdge: didCollapseJustHappen(prev, next),
    loadTorqueNm: undefined, energyUsedRatio: undefined,
  };
}

export function stepMotorWithDestruction(
  config: MotorConfig, motorState: SimState,
  accumulator: RunAccumulator, destructionConfig: DestructionConfig,
  dt: number, rng?: Rng, loadTorque?: number, effectiveInertia?: number,
): DestructionStepResult<SimState> {
  const physicsState = step(config, motorState, dt, rng, loadTorque, effectiveInertia);
  const frame = buildMotorOnlyFrameInput(config, motorState, physicsState);
  const { state, events } = advanceDestructionState(
    accumulator.destructionState, frame, destructionConfig, accumulator.replaySnapshot.runContext, dt,
  );
  const snapshot: PhysicsSnapshotAtT = { context: 'motor', state: physicsState };
  const stampedEvents = stampPhysicsSnapshot(events, snapshot);
  const newTerminalModes = classifyTerminalModes(events);
  const nextAccumulator: RunAccumulator = {
    ...accumulator,
    destructionState: state,
    events: [...accumulator.events, ...stampedEvents],
    terminalModeCandidates: [...accumulator.terminalModeCandidates, ...newTerminalModes],
  };
  const termination = newTerminalModes.length > 0
    ? finalizeRun(nextAccumulator, { kind: 'physicsEnded', physicsEndStatus: { status: 'finished' } /* 使われない、destructionTerminal優先のため下記参照 */ })
    : null;
  // 実装注記: finalizeRunのdestructionTerminal分岐はterminalModeCandidates非空を見て決まるため、
  // 上記呼び出しのphysicsEndStatusダミー値は実際には参照されない。P3-1実装時にfinalizeRunの
  // シグネチャをterminalModeCandidates非空時は引数なしで呼べる形へ整理する(型設計の意図を
  // 損なわない範囲でのAPI微調整、v10レビュー#1「overload/判別引数を用意する」)
  return { physicsState, accumulator: nextAccumulator, termination };
}

export function stepTestRunWithDestruction(/* 同型。runContextの受け渡し・terminationの生成はP3-2/P3-4で確定 */): DestructionStepResult<VehicleSimState>;
export function stepTrackRunWithDestruction(/* 同上 */): DestructionStepResult<VehicleSimState>;
```

**store側の呼び出し規約**: 毎step、`result.termination`を最優先で確認する。非nullならそれを`RunOutcome`として直ちに使い、以後の物理stepを呼ばない。nullの場合のみ、既存`physicsState.status`(vehicle/track)の変化を見て`finalizeRun`を呼ぶかどうかを判断する(motor-onlyでは`manualAbort`のみ)。

### 4.5 状態の所有者・初期化・受け渡し・呼び出しタイミング(v10から継続、runContext言及を追加)

`RunAccumulator`初期化時、`replaySnapshot.runContext`(1.4節)を`captureRunSnapshot`が装備スナップショットから構築する。

### 4.6 案1との比較(v10から継続)

---

## 5〜11(v10から継続、変更なし)

---

## 12. ステップ分割案(P3-0〜P3-4、v10から継続)

P3-0のDoDへ追加: **`termination`が非nullを返すstep直後に物理stepを継続しないことのテスト**(D02/D04/D09で個別に)、**`'overheated'`終了(D03条件を満たさない単純過熱)とdestructionTerminal(D03)の両方が発生し得る入力列の区別テスト**、**`DestructionRunContext`を含むリプレイの完全一致テスト**(FireExposureProfile・gearTotalToothCountを変えて2回リプレイし、在庫の現在状態を変えても結果が変わらないことを確認)、**同一タブ内での多重run開始拒否テスト**、**role別劣化適用関数の型テスト+存在しない対象への整合性エラーテスト**。

## 13. DoD・テスト方針(v10から継続)

## 14. UI計画への申し送り(v10から継続)

## 15. Fableへの重点確認事項

Suu_mot3から明示的に「Fableへ残してよい」とされた事項(v10レビュー):
- `unsafeDischargeStartRatio`の物理的意味・較正値
- D04が既存物理終了後に継続stepしない簡約の妥当性
- gear damage合成式(max案 vs 加重和案)
- gear総歯数(共通値 vs 形状別値)
- `FireExposureProfile`の具体的な隣接role(最終的なart/layout判断はSuu・人間承認)

加えて本書で新設した契約の妥当性:
- 1.1節: `termination`によるdestruction即時終端の設計、`'overheated'`をendReasonへ追加した判断
- 1.4節: `DestructionRunContext`の内容(fireExposureProfile+gearTotalToothCount)がリプレイに必要十分か
- 2.4節: `UnstampedDestructionEvent`→`DestructionEvent`の型分離設計
- 1.5節: `TabRuntimeState`によるタブ内単一run制約の設計
- 1.6節: role別劣化適用関数+存在しない対象を整合性エラーとする設計

Fableの回答は要約せず全文でSuu_mot3経由で中継してもらう。実装・commitはFableレビュー・人間承認まで引き続き未着手のまま維持する。

---

## 16. 改訂履歴

v1〜v10の差分表は各版の16節に保持済み。本節はv10→v11の差分のみ、0節の対応サマリ表を参照。
