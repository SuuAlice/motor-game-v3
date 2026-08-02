# Phase 3統合計画(破壊モード+図鑑)— v9改訂版(engine完結のRunOutcome生成へ是正)

作成: alice_mot3 2026-08-02。**状態: Suuレビュー前・Fable未提出・実装/commit未着手。**

本書は`docs/phase3-plan-v8.md`をSuu_mot3レビュー(2026-08-01T20:31着信、以下「v8レビュー」)13項目に基づき改訂したものである。**v8をこの文書で置き換える。v8は履歴として保持する(削除しない)。**

v8レビューの結論: 「RunOutcome生成者・破壊時snapshot・D04過放電経路・反復event・損壊可能アセンブリ・P3-0〜P3-4内のstore/UI統合は方向として大きく改善した。`DestructionConfigDraft`と完成版`DestructionConfig`の分離にも`unknown`較正値は残っていない」。一方で**P3-0の型凍結には、engine/store所有境界・在庫参照・物理的な損傷名・イベント粒度・リプレイ永続化にまだ矛盾がある**——`runSequence`をengineの型に残していた、storeがイベントを蓄積してRunOutcomeを組み立てる構造が実質残っていた、`physicsSnapshotAtT`がmotor-only固定だった、存在しない`sourceWireItemId`を前提にしていた、D06/D09を同じ物理量へ統合していた、D04近接パーツがFableの物理判断だけで確定させようとしていた等。v9はこれらを是正する。

対象: `docs/spec.md`(r2)§4.8・§5.1・§5.2・§5.3・§7.1・§7.1.1・§7.2・§7.3・§7.4・§7.5・§12・§13。

---

## 0. v8レビュー13項目 対応サマリ

| # | v8の欠陥 | 対応節 |
|---|---|---|
| 1 | `RunOutcome`/`buildRunOutcome`が`runSequence`をengine型として持っていた(所有境界と自己矛盾) | 1.5節: engineの型から`runSequence`を除外。store側`RunApplicationEnvelope`へ移動 |
| 2 | storeが`destructionEvents`を蓄積して`buildRunOutcome`を呼ぶ構造で、実質storeがRunOutcomeを組み立てていた | 1.1節: `RunAccumulator`(engine状態)+`finalizeRun`(engine純関数)へ再設計 |
| 3 | `physicsSnapshotAtT`がD01〜D05・D07で`SimState`固定だった(vehicle/track文脈を無視) | 2.4節: 全モード共通の判別union`PhysicsSnapshotAtT`へ変更。1.1節の`causeLog: unknown`定義を削除 |
| 4 | `RotorAssemblyState.sourceWireItemId`が存在しない個体IDを前提にしていた | 1.2節: `sourceWireMaterialId`+消費量へ修正 |
| 5 | D06(歯欠け)とD09(かじり)を同じ`toothDamageFraction`へ統合していた | 1.2節: `toothLossCount`(D06)と`seizureFraction`(D09)を分離し、合成は純関数で行う |
| 6 | D04近接パーツを`body+magnet`固定でFableの物理判断だけに委ねていた | 3.1節: 走行開始時装備から作る`adjacentRoles`入力へ変更。具体的な隣接関係はart/layout判断としてSuu・人間承認事項化 |
| 7 | D04過放電代理指標の意味論(しきい値の向き・track種別ごとの判定可否・給電停止後の遷移)が未確定 | 3.2節: Phase3限定の簡約故障モデルとして明記し、5項目を確定 |
| 8 | D05が「閾値超過ごとに反復」で毎stepイベント化されかねない設計だった | 3.3節: 異常スパークepisodeのrising edgeのみをイベント化する設計へ変更 |
| 9 | `terminalMode?`が単数でD03/D04以外の同時終端を保持できなかった | 1.1節: `terminalModes: readonly DestructionModeId[]`へ変更 |
| 10 | `lastAppliedRunSequence`方式に順序保証・並行実行の契約が無かった | 1.5節: 単一未適用run・発行順序・並行タブ検出の契約を追加 |
| 11 | `degradationDiffs`の導出規則・シグネチャが未定義だった | 1.1節: `deriveDegradationDiffs`を明示的なengine内純関数として定義 |
| 12 | `ValidatedTrackDefinition`のTS branded型がJSON永続化後に失われる問題が未対応だった | 1.4節: 保存形式をraw schema化し、読み込み時に再検証する契約へ変更 |
| 13 | 全終了経路・reload保証範囲が未明記だった | 1.6節: 経路一覧+保証範囲(走行終了確定後のみ)を明記 |

---

## 1. P3-0: クロスレイヤ契約(型凍結ゲート)

### 1.1 RunOutcomeの生成: RunAccumulator + finalizeRun(v8レビュー#1・#2・#3・#9・#11対応)

**engineがRunOutcomeの生成を最初から最後まで完結させる。** v8は「エンジン出力」と定義しながら、store側の走行ループが`destructionEvents`を毎step蓄積し、終了検出後に`buildRunOutcome`を呼ぶ構造になっており、実質的にstoreがイベント列を組み立てていた(v8レビュー#2)。修正: **イベントの蓄積そのものをengine側の状態(`RunAccumulator`)として持たせ**、storeは毎stepこの状態を受け渡すだけにする。

```ts
// engine側の走行アキュムレータ。DestructionStateと同様、storeが値として保持し毎step
// 受け渡すだけの不透明な状態(2.1節の所有パターンと同型)
export interface RunAccumulator {
  events: readonly DestructionEvent[]; // このセッションで発生した全物理イベント(発生順、追記のみ)
  destructionState: DestructionState;
  replaySnapshot: RunSnapshot; // 走行開始時に1回だけ捕捉(1.4節)、以後不変
}

export function createRunAccumulator(replaySnapshot: RunSnapshot, batteryProfile: 'lipo' | 'nonLipo'): RunAccumulator {
  return { events: [], destructionState: createInitialDestructionState(batteryProfile), replaySnapshot };
}

// 各stepXxxWithDestructionは、DestructionStateではなくRunAccumulatorを受け取り返す
// (下記4.4節)。storeはeventsを再構成せず、返ってきたaccumulatorをそのまま次stepへ渡すだけ

export type PhysicsSnapshotAtT = // v8レビュー#3: 全モード共通の走行文脈付き判別union
  | { context: 'motor'; state: SimState }
  | { context: 'vehicle'; state: VehicleSimState };

export type DestructionEvent = // 2.4節で再掲。ここでは`causeLog: unknown`のような汎用定義を持たない
  // (v8レビュー#3: 1.1節に残っていた汎用interfaceを削除し、2.4節のモード別判別unionのみを唯一の定義とする)
  never; // 実体は2.4節を参照

export interface RunOutcome {
  endReason: 'finished' | 'stalled' | 'derailed' | 'energyExhausted' | 'destructionTerminal' | 'manualAbort';
  terminalModes: readonly DestructionModeId[]; // v8レビュー#9: 複数形へ変更。endReasonが'destructionTerminal'の
  // ときのみ非空(D03/D04排他を除き複数モードが同一stepで終端条件を満たし得るため)。固定順序(2.1節)で保持
  events: readonly DestructionEvent[];
  destructionState: DestructionState;
  degradationDiffs: readonly DegradationDiff[];
  replaySnapshot: RunSnapshot;
  // runSequence/saveIdは含めない(v8レビュー#1)。engineはstoreの走行ID発行の仕組みを一切知らない
}

// 走行終了を検出したstoreが1回だけ呼ぶ、唯一の最終化関数。accumulatorとendReason(・該当する
// 場合はterminalModes)だけから決定論的にRunOutcomeを組み立てる純関数。degradationDiffsは
// ここでderiveDegradationDiffs(下記)により導出する。storeはこの関数の外でeventsやdiffsを
// 再構成しない(v8レビュー#2「storeがイベント列や劣化差分を再構成しない契約をシグネチャで保証する」)
export function finalizeRun(
  accumulator: RunAccumulator,
  endReason: RunOutcome['endReason'],
  terminalModes: readonly DestructionModeId[] = [],
): RunOutcome {
  return {
    endReason,
    terminalModes,
    events: accumulator.events,
    destructionState: accumulator.destructionState,
    degradationDiffs: deriveDegradationDiffs(accumulator.events, accumulator.destructionState),
    replaySnapshot: accumulator.replaySnapshot,
  };
}

// v8レビュー#11: 導出規則をシグネチャまで確定する。
// - 集約規則: 同一(role, kind)の複数イベント(D05の複数episode、D06の複数歯欠け等)は
//   このrun内で合算し、1本のDegradationDiffへ集約する(roleごとに高々1件を返す。ただし
//   D04近接延焼のように複数roleへ同時に差分を出すケースは各roleごとに1件ずつ)
// - clamp規則: engineは個体の現在値(絶対値)を知らないため、ここでは**delta(増分)のみ**を
//   返しclampしない。絶対値への反映・[0,1]範囲へのclampはstore側(degradationApplication.ts、
//   1.6節のapplyRunOutcomeが呼ぶ)の責務とする
// - 手動中断時も同じ規則を適用する(終了時点までに蓄積されたeventsから導出するのみで、
//   endReasonによって規則を変えない)
// - 決定論: 同一のaccumulator+endReason+terminalModesを与えれば常に同一の結果を返す
//   (副作用なし、rng不使用)ことをテストで担保する
export function deriveDegradationDiffs(
  events: readonly DestructionEvent[],
  finalDestructionState: DestructionState,
): readonly DegradationDiff[];
```

### 1.2 損壊可能アセンブリの契約(v8レビュー#4・#5対応)

**`sourceWireItemId`の修正(v8レビュー#4)**: 既存`StackableStockEntry`のwireは`{ family: 'wire'; materialId: WireMaterialId; quantityM: number }`(スタック在庫、個体IDを持たない、`src/materials/inventoryItem.ts`で確認済み)。`RotorAssemblyState`が存在しない個体IDを前提にしていた誤りを修正する。

```ts
export interface RotorAssemblyState {
  assemblyId: string;
  sourceWireMaterialId: WireMaterialId | null; // 修正: 個体IDではなく素材IDを保持
  consumedWireM: number;                       // 組み立て時にスタック在庫から引き当てた量(store側の
  // 組立処理が記録する。Phase4巻線記録方式では巻線記録そのものが引当情報を兼ねるため、
  // Phase3のこのフィールドは暫定の最小記録として扱う)
  collapsed: boolean;
  burnedOut: boolean;
}

export interface BodyPartState {
  assemblyId: string;
  materialId: BodyMaterialId;
  scorchFraction: number;
}

// v8レビュー#5: D09を「seizure」としてD06の`toothDamageFraction`から明確に分離する
// (物理現象が異なる——歯欠けは離散的なチップ欠損、かじりは連続的な摩耗・焼き付き)
export interface BearingAssemblyState {
  assemblyId: string;
  gearItemId: string; // 付随先のギヤInventoryItem.itemId
  seizureFraction: number; // D09専用。歯欠けとは独立
}
```

**D06/D09のギヤ損傷分離(v8レビュー#5)**: v8で導入した統合`toothDamageFraction`(D06・D09共通kind)を撤回する。spec §7.1.1はD06の恒久状態を「ギヤ個体の歯欠け数」、D09を「軸受け・ギヤ個体の劣化」と明確に分けており、かじりを歯欠けとして記録するのは物理現象の誤記である。既存`WearState`(`src/materials/inventoryItem.ts`)の`gear` kindを次のとおり拡張する:

```ts
// 既存: { readonly kind: 'gear'; readonly toothDamageFraction: number }
// 修正後(P3-0で確定、既存フィールド名toothDamageFractionは維持しつつ意味をD06専用に限定):
export type WearState =
  | { readonly kind: 'magnet'; readonly demagnetizationFraction: number }
  | { readonly kind: 'gear'; readonly toothLossCount: number; readonly seizureFraction: number } // 修正
  | { readonly kind: 'brush'; readonly wearFraction: number };
```

`toothLossCount`(D06、離散カウント)と`seizureFraction`(D09、連続量、0–1)を別フィールドとして保持する。既存`computeSalvageRate`(`inventoryItem.ts`)が単一の劣化度スカラーを要求する箇所は、両者から**純関数で総合損傷率を算出**する新設ヘルパーを挟む:

```ts
// src/materials/inventoryItem.ts へ追加。型の簡便さを理由に異なる現象の値を混ぜない
// (v8レビュー#5)。totalToothCountは4.2節のDestructionConfig.d06較正値と同じ出典を使う
export function computeCompositeGearDamageFraction(
  wearState: Extract<WearState, { kind: 'gear' }>,
  totalToothCount: number,
): number {
  const toothLossFraction = Math.min(1, wearState.toothLossCount / totalToothCount);
  // 合成式(較正候補、根拠は各実装ステップで示す): 歯欠けと焼付きは別々の劣化経路のため、
  // 単純な線形合算ではなく「どちらか大きい方」を採用する案(alice所見)を提示するが、
  // 加重和・非線形合成との比較はFableへ諮る(15節)
  return Math.max(toothLossFraction, wearState.seizureFraction);
}
```

`computeSalvageRate`の呼び出し元は、gear個体について`resolveFraction`(既存)の代わりにこの合成関数を使うよう更新する(既存の`magnet`/`brush`分岐は無変更)。

### 1.3 store所有・PlayerInventoryの拡張(v8から継続、1.2節の型修正を反映)

```ts
export interface PlayerInventory {
  readonly cashG: number;
  readonly items: readonly InventoryItem[]; // WearState.gearの型変更(1.2節)を反映
  readonly stackableStock: readonly StackableStockEntry[];
  readonly rotorAssemblies: readonly RotorAssemblyState[];
  readonly bodyParts: readonly BodyPartState[];
  readonly bearingAssemblies: readonly BearingAssemblyState[];
}
```

### 1.4 リプレイスナップショット契約(v8レビュー#12対応、永続化可能なruntime契約へ)

`ValidatedTrackDefinition`(既存、`src/engine/trackPhysics.ts`)は`unique symbol`によるTypeScriptのbrand型であり、**JSON化(`localStorage`保存)を経ると失われる**(v8レビュー#12「型castだけで復元すると、将来のschema変更や壊れたsaveを検出できない」)。保存形式を素のJSON化可能なschemaとし、復元時に既存の`validateTrackDefinition`/`createValidatedTrack`(既存export)で再検証する契約へ変更する。

```ts
export interface RunSnapshot {
  contractVersion: number; // 固定dt・シミュレーション契約の版。現行1固定
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: TrackDefinition | null; // 修正: ValidatedTrackDefinitionではなく素のTrackDefinitionを
  // 保存する(brandは保存に意味を持たないため)。読み込み時にcreateValidatedTrackで**必ず
  // 再検証**してから使う。再検証に失敗した場合はリプレイ不可として扱う(下記)
  seed: number;
  initialDestructionState: DestructionState;
}

// store側(materialsまたはstore層、実装ステップで確定)。保存直前に呼び、以後の生きた
// config/state参照の変更がsnapshotへ波及しないようdeep copyする(v8レビュー#12
// 「作成時にdeep copy/immutable化し、走行後の参照元変更でsnapshotが変わらないようにする」)
export function captureRunSnapshot(/* ...実行時の生config/state群... */): RunSnapshot;

export type RestoreRunSnapshotResult =
  | { ok: true; track: ValidatedTrackDefinition | null }
  | { ok: false; reason: 'unsupportedContractVersion' | 'invalidTrack' };

// 読み込み時、trackがあれば既存createValidatedTrack/validateTrackDefinitionで再検証する。
// contractVersionが現行engineの対応範囲外なら「再生不可」として扱い、黙って現行engineで
// 再生しない(v8レビュー#12)
export function restoreRunSnapshot(snapshot: RunSnapshot): RestoreRunSnapshotResult;
```

### 1.5 runIdの所有境界と冪等性契約(v8レビュー#1・#10対応)

**engineは`saveId`・`runSequence`を型としても値としても一切知らない**(v8レビュー#1)。走行IDの発行・適用管理はすべてstore側の責務とする。

```ts
// store側(engineではない)の型。RunOutcomeをラップしてstoreの適用処理へ渡す
export interface RunApplicationEnvelope {
  runKey: { saveId: string; runSequence: number };
  outcome: RunOutcome; // engine出力そのもの(1.1節)
  equipmentSnapshot: EquipmentIdSnapshot; // 走行開始時点の実装備ID一覧(役割→実ID解決用、1.6節)
}

export interface SaveEnvelopeMeta {
  saveId: string;
  lastAppliedRunSequence: number; // 高水位
  activeRunSequence: number | null; // v8レビュー#10: 発行済みだが未適用のrunSequence。
  // nullでなければ新規runの開始を拒否する(1セーブにつき未適用runは同時に1件まで)
  sessionToken: string; // v8レビュー#10: 並行タブ検出用。セッション開始時にこのタブが
  // 新規発行し保存する。他タブが保存を試みる際、読み込んだsessionTokenが自分の発行値と
  // 異なっていた場合、後勝ちで上書きせず「別タブで使用中」を検出しUIへ伝える
  // (具体的な検出フロー・UI文言はUI計画側。ここではmeta契約のみ確定する)
}
```

**冪等性・順序契約(v8レビュー#10)**:
- `runSequence`はstoreが`lastAppliedRunSequence`確認後に`+1`として発行し、同時に`activeRunSequence`へ記録する。前runの原子的適用(`applied=true`または`false`のいずれかで確定)が完了するまで次の`runSequence`は発行しない
- `applyRunOutcome`は`envelope.runKey`が`(saveId, runSequence)`の組で比較され、`runSequence <= lastAppliedRunSequence`なら即座に`applied:false`で返す(1.6節)
- 複数タブでの並行実行は`sessionToken`の不一致検出で防ぐ(具体的な実装はP3-0実装ステップで確定)
- migrationは`SaveEnvelopeMeta`とは別に明示的な`schemaVersion`(既存`v15:*`からの移行フラグ)を持ち、一度成功したら再実行されないことをテストで担保する。migration自体は`saveId`を再発行しない(既存ユーザーの`saveId`を保持する)

### 1.6 store適用結果契約: `AppliedRunResult`(v8から継続、シグネチャをRunApplicationEnvelope起点へ修正)

```ts
export interface AppliedRunResult {
  runKey: { saveId: string; runSequence: number };
  applied: boolean;
  newlyDiscoveredModes: readonly DestructionModeId[];
  rewardsGrantedG: number;
  resolvedDegradations: ReadonlyArray<{ role: EquipmentRole; resolvedAssemblyOrItemId: string }>;
}

// store側(src/materials/degradationApplication.ts)。RunApplicationEnvelopeを受け取り、
// PlayerInventoryを原子的に更新する。runSequenceの冪等性チェック・degradationDiffsの
// 実ID解決・図鑑発見判定・報酬計算をすべてこの関数境界内で行う
export function applyRunOutcome(
  envelope: RunApplicationEnvelope,
  currentInventory: PlayerInventory,
  discoveredModes: ReadonlySet<DestructionModeId>,
  saveMeta: SaveEnvelopeMeta,
): { result: AppliedRunResult; nextInventory: PlayerInventory; nextDiscoveredModes: ReadonlySet<DestructionModeId>; nextSaveMeta: SaveEnvelopeMeta };
```

### 1.7 全終了経路とreload保証範囲(v8レビュー#13対応)

**経路一覧**: motor-only(`stepMotorWithDestruction`)・test run(`stepTestRunWithDestruction`)・track run(`stepTrackRunWithDestruction`)のいずれも、同一の`RunAccumulator`→`finalizeRun`→`RunApplicationEnvelope`→`applyRunOutcome`経路を通ることをテストで担保する。`manualAbort`はUI操作起点でstoreが`finalizeRun`を呼ぶ際の`endReason`として渡す(engine自体は中断操作を検知しない。既存物理ステップの`status`遷移か、外部からの明示的な終了指示かのいずれかでstoreが`finalizeRun`を呼ぶ)。

**reload保証範囲(明記、v8レビュー#13)**: **保証されるのは「走行終了(finalizeRun呼び出し)確定後」のreload安全性のみ**である。`applyRunOutcome`が原子的に完了した時点で、その走行の結果は失われない。**走行途中(finalizeRunを呼ぶ前)のタブクローズ・reloadでは、その走行のRunAccumulator自体が未確定であり、進行中の走行データは失われる**(仕様上のスコープ外。復旧が必要ならactive runの逐次永続化という別設計が要るが、本計画では対象外とする)。

### 1.8 engineの個体ID非依存性(v8から継続)

engineのどのモジュールも実ID・所持金・図鑑発見状態・`saveId`・`runSequence`を一切参照しない(1.5節で明確化)。

---

## 2. モジュール構成と状態機械設計

```
src/engine/destructionModes.ts          # 新規。D01〜D07・D09の状態機械(純関数)。leafモジュール
src/engine/destructionOrchestration.ts  # 新規。RunAccumulator操作+finalizeRun+deriveDegradationDiffs(1.1節)
src/engine/__tests__/destructionModes.test.ts
src/engine/__tests__/destructionOrchestration.test.ts
src/materials/degradationApplication.ts # applyRunOutcome(1.6節)。engineに依存しない
src/materials/__tests__/degradationApplication.test.ts
```

### 2.1 型設計: 共有信号+モード別Progress+排他的電池state(v8から継続、D05のみ再設計)

```ts
export type DestructionModeId =
  | 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D09';

export interface DestructionSharedSignals {
  shortCircuitDurationS: number;
  elapsedTimeS: number;
}

export function createInitialSharedSignals(): DestructionSharedSignals {
  return { shortCircuitDurationS: 0, elapsedTimeS: 0 };
}

export interface D01Progress { triggered: boolean; triggeredAtT: number | null; causeLog: D01CauseLog | null; }
export interface D02Progress { triggered: boolean; triggeredAtT: number | null; coilHeatGaugeRatio: number; causeLog: D02CauseLog | null; }

export type BatteryDestructionProgress =
  | { profile: 'nonLipo'; d03: D03Progress }
  | { profile: 'lipo'; d04: D04Progress };

export interface D03Progress { triggered: boolean; triggeredAtT: number | null; causeLog: D03CauseLog | null; }
export interface D04Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning';
  stageEnteredAtT: number | null;
  overDischargeActive: boolean;
  causeLog: D04CauseLog | null;
}

// v8レビュー#8: 「閾値超過ごとに反復」ではなく「異常スパークepisodeのrising edge」のみを
// イベント化する設計へ再設計
export interface D05Progress {
  sparkDurationS: number;   // 現在の連続スパーク継続時間(chatterFramesLeft>0が続く間dt積算。
  // 停止(chatterFramesLeft===0)で0へリセットし、episodeTriggeredも同時にリセットする)
  episodeTriggered: boolean; // 今の連続スパーク中に既にイベント発行済みか(1連続スパークにつき最大1件)
  episodeCount: number;     // 検死ログ・恒久劣化算出用の累積episode数(このセッション内)
  firstEpisodeAtT: number | null;
  causeLog: D05CauseLog | null; // 最初のepisode分のみ保持
}

export interface D06Progress {
  toothLossCount: number;
  firstLossAtT: number | null;
  causeLog: D06CauseLog | null;
}

export interface D07Progress {
  magnetHeatGaugeRatio: number;
  reversibleDroopActive: boolean;
  irreversibleTriggered: boolean;
  irreversibleTriggeredAtT: number | null;
  causeLog: D07CauseLog | null;
}

export interface D09Progress { triggered: boolean; triggeredAtT: number | null; bearingHeatGaugeRatio: number; causeLog: D09CauseLog | null; }

export interface DestructionState {
  shared: DestructionSharedSignals;
  battery: BatteryDestructionProgress;
  modes: {
    D01: D01Progress; D02: D02Progress; D05: D05Progress;
    D06: D06Progress; D07: D07Progress; D09: D09Progress;
  };
}

export function createInitialDestructionState(batteryProfile: 'lipo' | 'nonLipo'): DestructionState {
  return {
    shared: createInitialSharedSignals(),
    battery: batteryProfile === 'lipo'
      ? { profile: 'lipo', d04: { triggered: false, triggeredAtT: null, stage: 'none', stageEnteredAtT: null, overDischargeActive: false, causeLog: null } }
      : { profile: 'nonLipo', d03: { triggered: false, triggeredAtT: null, causeLog: null } },
    modes: { /* 全モード初期値 */ },
  };
}
```

`advanceDestructionState(prev, frame, config, dt) -> { state, events }`は不変。イベント固定順序(D01→D02→[D03またはD04]→D05→D06→D07→D09)も不変。

### 2.2 CauseLogと温度規約(v8から継続)

v8 2.2節の内容(`TemperatureReading`3状態、D03/D04の`uncalibratedGauge`化)を維持する。

### 2.3 D08の扱い(v8から継続)

### 2.4 イベント契約: 判別union+走行文脈付きスナップショット(v8レビュー#3・#8対応)

```ts
export type DestructionEvent =
  | { mode: 'D01'; causeLog: D01CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true }
  | { mode: 'D02'; causeLog: D02CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true }
  | { mode: 'D03'; causeLog: D03CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true }
  | { mode: 'D04'; causeLog: D04CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true }
  | { mode: 'D05'; causeLog: D05CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: boolean } // episode単位、複数あり得る
  | { mode: 'D06'; causeLog: D06CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: boolean } // 歯欠け単位、複数あり得る
  | { mode: 'D07'; causeLog: D07CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true }
  | { mode: 'D09'; causeLog: D09CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true };
```

`PhysicsSnapshotAtT`は1.1節の判別unionを使う(v8レビュー#3: D01〜D05・D07がmotor-only文脈固定だった誤りを修正。motor-onlyのベンチ試験でもvehicle/track走行中でも同じモードが発火し得るため、`context`で判別する)。同一stepで複数モードが成立した場合、それらのイベントはすべて同一の`physicsSnapshotAtT`(そのstepの`next`値、同じ`context`)を参照する。

**D05の「episode」の定義(v8レビュー#8)**: 「通常整流の微小火花」はイベント化しない。`chatterFramesLeft>0`かつ電流が異常しきい値を超えている状態が**継続して**いる間は1つの物理イベントとして扱い、`sparkDurationS`が`config.d05.brushSparkDurationLimitS`へ初めて到達した瞬間(rising edge)にのみ1件発行する。その後、同一の連続スパーク中は再発行しない。スパークが一度止み(`chatterFramesLeft`が0に戻り)、その後再び異常状態に入った場合のみ次のepisodeとして2件目を発行する。連続強度・累積摩耗はDestructionState(`sparkDurationS`・`episodeCount`)で積分し続けるが、event件数とは分離する(図鑑候補は最初のepisodeのみ)。

汎用`severity`フィールドは持たない。`deriveDegradationDiffs`(1.1節)が各モード固有フィールドから型安全に劣化差分を導出する。

---

## 3. D01〜D09個別設計

v8 3節の表を維持する(D01〜D09の物理トリガ・発火後物理・恒久劣化・図鑑登録条件)。以下、v8レビューで確定した変更点のみ詳述する。

### 3.1 D04: 近接延焼ロールの配置データ化(v8レビュー#6対応)

v8の「body+magnet固定」案は根拠のない当て推量であり、Fableの物理判断だけで画面・装備配置を確定させるべきではないと指摘された(v8レビュー#6「art/layout判断としてSuu・人間承認を受けてP3-0で凍結する」)。修正: **近接対象をengine内部にハードコードせず、走行開始時装備から構築する入力として受け取る**。

```ts
// 4.2節のDestructionConfigへ追加。値の内容(どのroleが「近接」に該当するか)はart-spec/実配置
// データに基づいてstore/UI層(brabit)が構築し、engineへ渡す。engineはこの一覧を反復して
// 延焼判定を行うだけで、どのroleが物理的に近いかを自分では判断しない
d04AdjacentRoles?: readonly EquipmentRole[]; // bodyは正典必須のため下記のとおり別枠固定、
// このフィールドはbody以外の追加対象(例: magnet、他の候補は今後の配置データ次第)専用
```

D04発火(炎上到達)時の延焼判定: **bodyは正典どおり必須の延焼対象**(装備されていれば常に対象。装備されていない場合は対象なしで良い、下記)。それ以外は`config.battery.d04AdjacentRoles`(空配列でもよい)を反復し、装備されているroleへ延焼差分を出す。**対象装備が存在しない場合の挙動**: 該当roleが未装備であれば、その役割へのDegradationDiffは生成しない(存在しない個体へ差分を出すことはできないため)。

具体的な隣接関係(`d04AdjacentRoles`に何を含めるか)はart-spec・実際の部品配置データに基づく判断であり、**独自解釈せずFableレビュー後にSuu・人間承認を経てP3-0実装時に凍結する**(15節)。

### 3.2 D04: 過放電代理指標の意味論(v8レビュー#7対応、簡約故障モデルとして明記)

v8の「新規物理式を発明せずに」という表現を撤回する。`energyUsedJ / computeEnergyBudgetJ(motorConfig)`という比は電池残容量の**代理指標**であり、これ自体は既存量の再利用だが、**この比をD04の故障しきい値・段階遷移条件として使うこと自体はPhase3限定の新規の簡約故障モデルである**。以下を確定する。

- **導入の性質**: 「過放電による熱暴走」という現象を、実際のSOC(充電状態)モデルなしに、既存のエネルギー消費量/予算比で近似するPhase3限定の簡約モデルとして導入する。将来SOC・電圧降下モデルが実装された場合、この比は置き換えられ得る
- **しきい値の向き**: `config.battery.overDischargeUsedRatioThreshold`は**(0, 1)の範囲**を取る(1以上では、消費量が予算に到達する前にトリガが引けず、既存のenergyExhausted停止と区別がつかなくなるため無意味)。「消費量が予算の●%に達したら過放電相当とみなす」という設計意図を明記する
- **track種別ごとの判定可否**: `energyUsedJ`は`VehicleSimState`にのみ存在し、`track.hasEnergyBudget`フラグの真偽に関わらず常に積算される(既存実装確認済み)。したがって過放電経路は**vehicle/track文脈(test run・track run)では`hasEnergyBudget`の設定に関わらず判定可能、motor-onlyベンチ試験では判定不可**(`energyUsedJ`が存在しないため)
- **給電停止後の遷移**: `hasEnergyBudget===true`のコースでは、`energyUsedJ`が予算へ到達すると既存機構(`forcePowerOff`)が給電を止め、電流が0になる。D04の膨張→発煙→炎上の段階遷移は、**給電停止後も継続する**(現実のリチウム電池熱暴走は内部化学反応由来であり、外部電流の有無に依存しないため。この設計判断自体を**Fableへ確認する**)
- **`energyExhausted`との優先順位**: `overDischargeUsedRatioThreshold`は`hasEnergyBudget===true`のコースでは予算到達(比=1.0)より必ず手前(比<1.0)で判定されるため、D04が先に発火し、その後の段階遷移が進む間に(給電停止済みでも)`energyExhausted`による`status:'stalled'`遷移が別途起き得る。この場合、**D04の段階進行(destructionTerminal相当)を優先し、`RunOutcome.endReason`は最終的に到達した終端(炎上到達なら`destructionTerminal`、炎上に至る前に他の終端条件が先に成立すればそちら)に従う**という優先順位を明記する

### 3.3 D05: episodeモデル(3節・2.4節参照)

2.4節を参照。

### 3.4 D06/D09: ギヤ損傷の分離(1.2節参照)

1.2節を参照。

### 3.5 D03/D04/D06: 素材family/ID非依存の設計(v8から継続)

---

## 4. destructionOrchestration.ts

### 4.1 既存3関数(変更なし、v8から継続)

### 4.2 DestructionConfig(v8から継続、d04AdjacentRoles追加)

```ts
export type BatteryDestructionConfig =
  | { profile: 'nonLipo'; shortCircuitDurationLimitS: number }
  | {
      profile: 'lipo';
      shortCircuitDurationLimitS: number;
      runawayHeatThreshold: number;
      overDischargeUsedRatioThreshold: number; // (0,1)、3.2節
      stageDurations: { swellingS: number; smokingS: number };
      d04AdjacentRoles: readonly EquipmentRole[]; // 3.1節。bodyは別枠必須のため対象外(常に含む前提)
    };

export interface DestructionConfigDraft {
  battery?: BatteryDestructionConfig;
  d02?: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
  d05?: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06?: { totalToothCount: number; breakage: GearBreakageProfile };
  d07?: { magnetHeatGaugeLimit: number; reversibleDroopThreshold: number };
  d09?: { bearingSeizureGaugeLimit: number };
}

export type GearBreakageProfile =
  | { kind: 'breakable'; gearStrengthThresholdNm: number }
  | { kind: 'nonBreakable' };

export interface DestructionConfig {
  battery: BatteryDestructionConfig;
  d02: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
  d05: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06: { totalToothCount: number; breakage: GearBreakageProfile };
  d07: { magnetHeatGaugeLimit: number; reversibleDroopThreshold: number };
  d09: { bearingSeizureGaugeLimit: number };
}

export type ValidateDestructionConfigResult = { ok: true; config: DestructionConfig } | { ok: false; missingFields: string[] };
export function validateDestructionConfig(draft: DestructionConfigDraft): ValidateDestructionConfigResult;
```

### 4.3 電池config(v9 4.2節に統合済み、再掲省略)

### 4.4 ラッパー関数: RunAccumulatorを受け渡す設計へ(v8レビュー#2対応)

```ts
export interface DestructionStepResult<TPhysicsState> {
  physicsState: TPhysicsState;
  accumulator: RunAccumulator; // 修正: destructionState/destructionEventsを個別に返すのではなく
  // accumulator一つにまとめる(v8レビュー#2、storeによる再構成を防ぐ)
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
  const { state, events } = advanceDestructionState(accumulator.destructionState, frame, destructionConfig, dt);
  const snapshot: PhysicsSnapshotAtT = { context: 'motor', state: physicsState };
  const stampedEvents = events.map((e) => ({ ...e, physicsSnapshotAtT: snapshot }));
  return {
    physicsState,
    accumulator: { ...accumulator, destructionState: state, events: [...accumulator.events, ...stampedEvents] },
  };
}

// vehicle/track版は契約骨格のみ(loadTorqueNmを含む専用frame builderはP3-4で確定、v7/v8から継続)
export function stepTestRunWithDestruction(/* 同型のaccumulator受け渡しへ変更、詳細はP3-2/P3-4で確定 */): DestructionStepResult<VehicleSimState>;
export function stepTrackRunWithDestruction(/* 同上 */): DestructionStepResult<VehicleSimState>;
```

store層の走行ループは、各step呼び出し後に返ってきた`accumulator`をそのまま次stepへ渡すだけであり、`events`や`destructionState`を自分で読み書き・再構成することはない(v8レビュー#2)。走行終了を検出したら、保持している最新の`accumulator`を1.1節の`finalizeRun`へそのまま渡す。

### 4.5 状態の所有者・初期化・受け渡し・呼び出しタイミング(v8から継続、accumulator化を反映)

- **所有者**: `RunAccumulator`はstore層が保持する(`DestructionState`単体ではなくaccumulator全体)
- **初期化**: セッション開始時、store層が1.4節の`captureRunSnapshot`でリプレイスナップショットを確定し、1.1節の`createRunAccumulator(replaySnapshot, batteryProfile)`を呼ぶ
- **次stepへの受け渡し**: store層は`accumulator`を読み、`stepXxxWithDestruction`へ渡し、返ってきた`accumulator`を次のsetの戻り値に含める(v6〜v8と同型のパターン)
- **呼び出しタイミング・rng消費順**: 不変

### 4.6 案1との比較(v8から継続)

---

## 5. 三段開示・イベント通知API(v8から継続、2.4節参照)

## 6. 三段開示・段階1のHUD境界(v8から継続)

## 7. 図鑑・個体永続状態のstore層所有

1.6節の`applyRunOutcome`が唯一の書き込み経路。1.5節の`SaveEnvelopeMeta`・`RunApplicationEnvelope`を含む統合永続store(brabit所有)の設計はv8から継続。

## 8. 決定論境界の保証構造(v8から継続)

## 9. D08のPhase割当の追認(v8から継続)

## 10. Phase2繰越事項の採否・順序(v8から継続)

## 11. art-specにない独自解釈しない事項

D04近接延焼ロール(3.1節)の具体的な内容は、art-spec/specに明記が無いため独自解釈せずFableレビュー後にSuu・人間承認を経て凍結する(3.1節に記載済み)。

## 12. ステップ分割案(P3-0〜P3-4、v8から継続、accumulator/finalizeRunの実装を明記)

各ゲートの手順は不変。P3-0のDoDへ以下を追加する: `RunAccumulator`+`finalizeRun`+`deriveDegradationDiffs`の単体テスト(ダミーイベント列からRunOutcomeが決定論的に組み立てられること)、`RunApplicationEnvelope`+`applyRunOutcome`の単一未適用run制約テスト、`restoreRunSnapshot`の再検証・contractVersion不一致テスト。P3-1〜P3-4の各ゲートは、v8 12節の内容を維持しつつ、store統合テストの対象を「accumulatorを受け渡す新シグネチャ」へ更新する。

## 13. DoD・テスト方針(v8から継続、追加項目)

v8 13節の破壊契約マトリクスに加え: **motor-only/test-run/track-run×全endReason(manualAbort含む)が同一のfinalizeRun→applyRunOutcome経路を通ることの網羅テスト**(v8レビュー#13)、**D05のepisode単位イベント化テスト**(連続スパーク中は1件のみ、途切れて再開すれば2件目、v8レビュー#8)、**D06/D09の劣化フィールドが分離して記録されることのテスト**(v8レビュー#5)、**runSequence順序制約(次発行は前run適用完了後のみ)のテスト**(v8レビュー#10)。

## 14. UI計画への申し送り(本書スコープ外、brabit_mot3の担当)

v8レビューの「UI計画v4は方向性を条件付きで受理」を踏まえ、v9で変更した契約(`RunApplicationEnvelope`・`terminalModes`複数形・D05 episode型・D04近接role入力)へUI計画をv5として追従させる必要がある(Suu_mot3の次の順序どおり)。

## 15. Fableへの重点確認事項

- **P3-0(最重点)**: `RunAccumulator`+`finalizeRun`+`deriveDegradationDiffs`の設計、`RunApplicationEnvelope`/`SaveEnvelopeMeta`の順序・並行性契約、1.2節のD06/D09分離+`computeCompositeGearDamageFraction`の合成式(最大値案 vs 加重和案)
- 3.1節: D04近接延焼ロールの具体的な内容(art/layout判断、Suu・人間承認後にP3-0で凍結)
- 3.2節: D04過放電の簡約モデル(しきい値の向き・給電停止後の継続進行・energyExhaustedとの優先順位)
- 2.4節: D05のepisodeモデルの妥当性
- 1.4節: `RunSnapshot`の再検証契約(track再validate・contractVersion不一致時の扱い)
- その他、v8から継続する未決事項(D02のR_coilオーバーライド、給電停止機構案a/b、D03/D04のmotor-only扱い等)

Fableの回答は要約せず全文でSuu_mot3経由で中継してもらう。実装・commitはFableレビュー・人間承認まで引き続き未着手のまま維持する。

---

## 16. 改訂履歴

v1〜v8の差分表は各版の16節に保持済み(`docs/phase3-plan-v6.md`にv1〜v5、`v7.md`にv6→v7、`v8.md`にv7→v8)。本節はv8→v9の差分のみ、0節の対応サマリ表を参照。
