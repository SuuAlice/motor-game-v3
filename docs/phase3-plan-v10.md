# Phase 3統合計画(破壊モード+図鑑)— v10改訂版(型契約のコンパイル可能性・所有境界の最終是正)

作成: alice_mot3 2026-08-02。**状態: Suuレビュー前・Fable未提出・実装/commit未着手。**

本書は`docs/phase3-plan-v9.md`をSuu_mot3レビュー(2026-08-01T20:42着信、以下「v9レビュー」)9項目に基づき改訂したものである。**v9をこの文書で置き換える。v9は履歴として保持する(削除しない)。**

v9レビューの結論: 「v8レビューの13項目は方向としてすべて回答された。走行IDのengine除外・`RunAccumulator`導入・走行文脈付きsnapshot・線材参照・D06/D09分離・D05 episode化・複数終端・raw track再検証は採用できる。ただしP3-0でそのまま型・モジュールを実装すると**コンパイル不能または結果消失につながる矛盾**が残る」。今回の9項目はいずれも「Fableに判断を依頼する前に閉じるべき契約の技術的な穴」であり、v6〜v9で積み上げた設計方針そのものへの反対ではない。

対象: `docs/spec.md`(r2)§4.8・§5.1・§5.2・§5.3・§7.1・§7.1.1・§7.2・§7.3・§7.4・§7.5・§12・§13。

**本書の作成にあたり追加で確認したもの**: `src/materials/materials.ts`のexport一覧(`BODY_MATERIALS`の存在確認。`BodyMaterialId`は`materialMapping.ts`未export、`inventoryItem.ts`が既存の`MagnetMaterialId`等と同じ「同型ローカル再宣言」パターンを踏襲すべき箇所であることを確認)。

---

## 0. v9レビュー9項目 対応サマリ

| # | v9の欠陥 | 対応節 |
|---|---|---|
| 1 | `DestructionEvent`の二重定義(`= never`+2.4節の実定義)でコンパイル不能。`PlayerInventory`コードブロックに余分な`}`。型の定義元・export境界が未記載 | 1.1節・2.4節: 二重定義を解消し単一定義に統一。1.3節を修正。型定義元の一覧を1.9節へ追加 |
| 2 | `finalizeRun`へstoreが不正な`endReason`/`terminalModes`組み合わせを注入できた | 1.1節: `RunAccumulator`に`terminalModeCandidates`を持たせengine側で追跡。`RunOutcome`を判別unionへ変更 |
| 3 | `DegradationDiff`がv8の統合`toothDamage`型のまま、D05の累積摩耗が保持されない | 1.2節・2.1節: D06/D09/D05それぞれの差分・累積量を明示的に分離 |
| 4 | `d04AdjacentRoles`が電池config(物性・較正値)へ混入していた | 1.2節・3.1節: `FireExposureProfile`としてrun開始入力へ分離し、D04イベントへ結果を保持させる |
| 5 | D04給電停止後の段階進行継続と、既存物理statusによる走行終了が同時に成立し得る記述が矛盾 | 3.2節: 「physics停止後にdestruction-onlyの継続stepを行わない」案を採用し一意化 |
| 6 | `runSequence`予約が途中reloadで永久ロックされる/再利用衝突の恐れ | 1.5節: 単一active枠をやめ、`nextRunSequence`の単調発行+高水位で解決 |
| 7 | `restoreRunSnapshot`がtrack以外をruntime検証していなかった | 1.4節: 全フィールドをruntime検証する`RestoredRunSnapshot`契約へ拡張 |
| 8 | ギヤ総歯数がrunのDestructionConfigに依存し、店・サルベージ画面から復元できない | 1.2節: `WearState`の`gear`kindへ`totalToothCount`を個体属性として保存 |
| 9 | `degradationApplication.ts`が「engine非依存」と誤記され、かつstore所有の適用処理まで含んでいた | 1.6節・2節: ファイル配置をengine/materials/store3層へ正しく再配分 |

---

## 1. P3-0: クロスレイヤ契約(型凍結ゲート)

### 1.1 RunOutcomeの生成: 判別unionと`terminalModeCandidates`(v9レビュー#1・#2対応)

**二重定義の解消(v9レビュー#1)**: v9の1.1節にあった`export type DestructionEvent = never;`(前方参照のためのプレースホルダ、実際には2.4節と名前が衝突しコンパイル不能)を削除する。`DestructionEvent`は2.4節でのみ定義する(本節はそれを利用する側)。

**engineがterminal候補を自ら追跡する(v9レビュー#2)**: v9の`finalizeRun(accumulator, endReason, terminalModes=[])`は、storeが任意の`endReason`/`terminalModes`の組み合わせ(例: `'finished'`なのに`terminalModes`が非空)を渡せてしまい、「engineがRunOutcomeを生成する」契約が実質破れていた。修正: **destruction由来の終端候補は、各stepでengine自身が`RunAccumulator`へ固定順序で記録する**。

```ts
export interface RunAccumulator {
  events: readonly DestructionEvent[];
  destructionState: DestructionState;
  replaySnapshot: RunSnapshot;
  fireExposureProfile: FireExposureProfile; // v9レビュー#4、1.2節
  terminalModeCandidates: readonly DestructionModeId[]; // v9レビュー#2(新設)。このrun中に
  // 「終端性質」(3節表で発火後に走行終了するモード: D02発火到達・D03・D04炎上到達・D09焼付き)
  // を満たしたモードを固定順序(2.1節)で追記する。ここへの追記は`advanceDestructionState`の
  // 呼び出し結果からラッパー(4.4節)が機械的に行うだけで、storeは一切書き込まない
}

// D01/D05/D06/D07は発火しても走行を終了させないため、たとえ発火してもterminalModeCandidates
// へは追加されない(3節表「発火後(セッション内)」列が「走行継続」のモード)。この判定基準は
// spec §7.1.1の表そのものであり、engine内に「どのモードが終端か」の固定マッピングとして持つ

// storeから渡してよい終了シグナルはmanualAbortのみに限定する(v9レビュー#2「外部から許す
// 信号はmanualAbortだけに限定する」)。既存物理status/failureCodeからの終了理由変換も
// engine側の型付き関数で行う
export type PhysicsEndStatus =
  | { context: 'vehicle'; status: Exclude<VehicleSimState['status'], 'running' | 'ready'>; failureCode?: FailureCode }
  | { context: 'motor'; stopped: true }; // motor-onlyの停止相当(3.1節・v8から継続の未決事項)

export type RunEndSignal =
  | { kind: 'physicsEnded'; physicsEndStatus: PhysicsEndStatus }
  | { kind: 'manualAbort' };

// 既存VehicleSimState.status/failureCodeから、destruction非関与の場合のRunOutcome.endReasonへ
// 変換する型付き純関数(engine側)。destruction関与時(terminalModeCandidatesが非空)は、
// この変換結果より常にdestructionTerminalを優先する(下記finalizeRunの判定順)
function convertPhysicsEndStatusToEndReason(status: PhysicsEndStatus): Exclude<RunOutcome['endReason'], 'destructionTerminal' | 'manualAbort'>;

// RunOutcomeは判別union化する(v9レビュー#2「destructionTerminalなら非空、その他なら空である
// ことを型で保証する」)。TypeScriptの非空配列型(readonly [X, ...X[]])でterminalModesを
// 「必ず1件以上」と表現する
export type RunOutcome =
  | {
      endReason: 'destructionTerminal';
      terminalModes: readonly [DestructionModeId, ...DestructionModeId[]]; // 非空を型で保証
      events: readonly DestructionEvent[];
      destructionState: DestructionState;
      degradationDiffs: readonly DegradationDiff[];
      replaySnapshot: RunSnapshot;
    }
  | {
      endReason: 'finished' | 'stalled' | 'derailed' | 'energyExhausted' | 'manualAbort';
      events: readonly DestructionEvent[];
      destructionState: DestructionState;
      degradationDiffs: readonly DegradationDiff[];
      replaySnapshot: RunSnapshot;
      // terminalModesフィールド自体を持たない(型レベルでdestructionTerminal以外に付与不可能)
    };

export function finalizeRun(accumulator: RunAccumulator, endSignal: RunEndSignal): RunOutcome {
  const degradationDiffs = deriveDegradationDiffs(accumulator.events, accumulator.destructionState);
  if (accumulator.terminalModeCandidates.length > 0) {
    // destruction由来の終端は、他の終了シグナル(手動中断以外)より優先する。手動中断が
    // destruction終端の成立と同一stepで競合するケースの扱いはP3-1実装ステップで確定する
    const [first, ...rest] = accumulator.terminalModeCandidates;
    return { endReason: 'destructionTerminal', terminalModes: [first, ...rest], events: accumulator.events, destructionState: accumulator.destructionState, degradationDiffs, replaySnapshot: accumulator.replaySnapshot };
  }
  const endReason = endSignal.kind === 'manualAbort' ? 'manualAbort' : convertPhysicsEndStatusToEndReason(endSignal.physicsEndStatus);
  return { endReason, events: accumulator.events, destructionState: accumulator.destructionState, degradationDiffs, replaySnapshot: accumulator.replaySnapshot };
}
```

**motor-only/test-run/track-runごとの「有効な終了理由」組み合わせ(v9レビュー#2)**: motor-onlyは`VehicleSimState`を持たないため`'stalled'|'derailed'|'energyExhausted'`という車両由来の終了理由を持ち得ない(motor-onlyの停止相当機構自体が3.1節の未決事項であるため、`PhysicsEndStatus`の`{context:'motor'}`アームは暫定的に`stopped:true`のみを持つ最小形とする)。test-run/track-runは車両由来の全終了理由を持ち得る。この組み合わせの網羅はP3-1〜P3-4の実装ステップでテストする。

### 1.2 損壊可能アセンブリと劣化差分の再設計(v9レビュー#3・#4・#8対応)

**ギヤ総歯数を個体属性へ(v9レビュー#8)**: `computeCompositeGearDamageFraction`が外部から`totalToothCount`を受け取る設計は、店・サルベージ画面がrunの`DestructionConfig`を保持しないため復元不能だった。**総歯数をギヤ個体の恒久状態そのものへ保存する**よう`WearState`を修正する:

```ts
export type WearState =
  | { readonly kind: 'magnet'; readonly demagnetizationFraction: number }
  | { readonly kind: 'gear'; readonly totalToothCount: number; readonly toothLossCount: number; readonly seizureFraction: number } // 修正
  | { readonly kind: 'brush'; readonly wearFraction: number };

// src/materials/inventoryItem.ts。totalToothCountを個体から読むため、呼び出し元がrunの
// configを保持する必要がなくなる(v9レビュー#8)
export function computeCompositeGearDamageFraction(wearState: Extract<WearState, { kind: 'gear' }>): number {
  const toothLossFraction = Math.min(1, wearState.toothLossCount / wearState.totalToothCount);
  return Math.max(toothLossFraction, wearState.seizureFraction); // 合成式の採否は1.2節末尾、Fable確認
}
```

**runtime検証**: `totalToothCount > 0`、`toothLossCount`が有限非負整数であること(`totalToothCount`を超える値も許容するが、`computeCompositeGearDamageFraction`内で`Math.min(1, ...)`により実害はない)。

**歯数の出典**: 総歯数がギヤ素材・tierによって変わるか、全ギヤ共通の不変値か(spec/art-specに明記なし)は、**独自解釈せずFableへ確認する**(1.2節末尾)。P3-0では「個体属性として保存する」という保存先の契約のみ確定し、実際の値の決め方(素材別か共通定数か)は実装ステップで確定する。

**既存`computeSalvageRate`呼び出し元の移行**: 既存(Phase2完了時点)の`{kind:'gear', toothDamageFraction: number}`形式のテストデータ・想定呼び出し元は、`totalToothCount`(既定値、例えば10)+`toothLossCount = round(toothDamageFraction × 既定totalToothCount)`+`seizureFraction: 0`への変換で移行する。この既定値と変換式自体をP3-0実装計画に明記する。

**DegradationDiffの完全な再分離(v9レビュー#3)**:

```ts
export type DegradationDiff =
  | { role: 'magnet'; kind: 'demagnetization'; deltaFraction: number } // D07不可逆到達時
  | { role: 'magnet'; kind: 'scorch'; deltaFraction: number }          // D04延焼(FireExposureProfileに含まれる場合)
  | { role: 'gear'; kind: 'toothLoss'; deltaCount: number }            // D06。歯欠け「本数」の増分(fraction化しない)
  | { role: 'gear'; kind: 'seizure'; deltaFraction: number }           // D09のうちギヤ側
  | { role: 'bearing'; kind: 'seizure'; deltaFraction: number }        // D09のうち軸受側
  | { role: 'brush'; kind: 'wear'; deltaFraction: number }             // D05
  | { role: 'rotor'; kind: 'collapse' }                                // D01
  | { role: 'rotor'; kind: 'burnout' }                                 // D02発火到達
  | { role: 'battery'; kind: 'consumed' }                              // D03/D04共通
  | { role: 'body'; kind: 'scorch'; deltaFraction: number };           // D04延焼(body必須対象)
```

集約規則(v9レビュー#3で明確化): 同一`(role, kind)`ごとに高々1件(「roleごと高々1件」ではない。例えばD04延焼で`{role:'magnet', kind:'scorch'}`と将来的にD07由来の`{role:'magnet', kind:'demagnetization'}`が同一runで両方生成される場合、role(`magnet`)は同じだがkindが異なるため2件とも残す)。

**D05の累積摩耗保持(v9レビュー#3「反復episode数だけでは連続強度・摩耗加速を導出できない」)**: `D05Progress`(2.1節)に、episodeごとにリセットされる`sparkDurationS`とは別に、run全体で累積するフィールドを追加する:

```ts
export interface D05Progress {
  sparkDurationS: number;             // 現在の連続スパーク継続時間(episode終了で0リセット)
  episodeTriggered: boolean;
  episodeCount: number;
  cumulativeAbnormalExposureS: number; // 新規: run開始からの異常スパーク時間の累積(episode跨ぎで
  // リセットしない)。deriveDegradationDiffsのD05 wear差分算出の入力にする
  firstEpisodeAtT: number | null;
  causeLog: D05CauseLog | null;
}
```

`deriveDegradationDiffs`は、最終`DestructionState.modes.D05.cumulativeAbnormalExposureS`から`{role:'brush', kind:'wear', deltaFraction}`を導出する(具体的な換算式はP3-3実装ステップで確定)。

**`deriveDegradationDiffs`が`events`+`finalState`だけで全差分を再現できることの明示(v9レビュー#3)**: 各モードの差分は次のいずれかから導出する。(a) `finalState`の累積フィールド(D02: `coilHeatGaugeRatio`到達有無、D05: `cumulativeAbnormalExposureS`、D06: `toothLossCount`、D07: `magnetHeatGaugeRatio`+`irreversibleTriggered`、D09: `bearingHeatGaugeRatio`到達有無)、(b) `events`内の該当`DestructionEvent`の存在有無(D01の`collapse`、D02/D03/D04の全損、D04延焼)。`events`は表示・検死ログ用、`finalState`は連続量の最終値であり、両方を組み合わせて初めて差分を再現できる設計であることをテストで示す。

### 1.3 store所有・PlayerInventoryの拡張(v9レビュー#1のブロック修正含む)

```ts
export interface PlayerInventory {
  readonly cashG: number;
  readonly items: readonly InventoryItem[];
  readonly stackableStock: readonly StackableStockEntry[];
  readonly rotorAssemblies: readonly RotorAssemblyState[];
  readonly bodyParts: readonly BodyPartState[];
  readonly bearingAssemblies: readonly BearingAssemblyState[];
}
```

(v9レビュー#1: 末尾の余分な`}`を削除し、上記のとおり単一の正しいinterface定義とする。)

### 1.4 リプレイスナップショット: 完全なruntime検証契約(v9レビュー#7対応)

```ts
export interface RunSnapshot {
  contractVersion: number;
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: TrackDefinition | null;
  seed: number;
  initialDestructionState: DestructionState;
}

export function captureRunSnapshot(/* ...実行時の生config/state群... */): RunSnapshot; // deep copy(v8レビュー#12から継続)

export interface RestoredRunSnapshot {
  contractVersion: number;
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: ValidatedTrackDefinition | null; // 再検証済み
  seed: number;
  initialDestructionState: DestructionState;
}

export type RestoreRunSnapshotResult =
  | { ok: true; snapshot: RestoredRunSnapshot }
  | { ok: false; reason: 'unsupportedContractVersion' }
  | { ok: false; reason: 'invalidSchema'; details: string }   // motorConfig/carConfig/destructionConfig/
  // initialMotorState/initialVehicleState/seed/initialDestructionStateのいずれかが有限数・
  // 判別unionとして不正(v9レビュー#7「motor/car/destruction config、初期state、seedのruntime
  // validation」)
  | { ok: false; reason: 'invalidTrack'; details: string };   // track再検証失敗

// localStorage由来のJSON.parse結果はunknownとして受け取る(v9レビュー#7)。contractVersion別に
// validatorを分岐する(現行はcontractVersion===1のみ対応)
export function restoreRunSnapshot(raw: unknown): RestoreRunSnapshotResult;
```

`track`が非nullの場合、`validateTrackDefinition`(既存export)で再検証してから`createValidatedTrack`(既存export)を通す。`motorConfig`等の他フィールドも、数値フィールドの有限性・判別unionの形状を個別に検証する専用validator群(P3-0実装ステップで具体化)を通す。

### 1.5 runIdの所有境界・冪等性・回復フロー(v9レビュー#6対応、単一active枠を撤廃)

v9の「`activeRunSequence`(単一枠)」は、途中reloadで`RunAccumulator`が失われた場合に永久ロックされる欠陥があった(v9レビュー#6)。修正: **sequence番号は一度発行したら再利用しない単調カウンタとし、「未適用の枠」という概念自体を持たない**。

```ts
export interface SaveEnvelopeMeta {
  saveId: string;
  lastAppliedRunSequence: number; // 適用成功した最大runSequence(高水位)
  nextRunSequence: number;        // 次に発行する番号。発行時に即座にインクリメントし永続化する
  // (run自体が完走せず放棄されても、この番号が再利用されることはない。v9レビュー#6
  // 「sequenceは一度発行したら再利用しない」「独立したnextRunSequenceで次番号を発行する」)
  leaseToken: string;             // 現在アクティブなタブ/セッションのリース識別子
  leaseHeartbeatAt: string;       // ISO時刻。アクティブタブが定期的に更新する
}

export interface RunApplicationEnvelope {
  runKey: { saveId: string; runSequence: number };
  leaseToken: string; // 発行時点のリーストークン。適用時に古いタブ由来かを判定する
  outcome: RunOutcome;
  equipmentSnapshot: EquipmentIdSnapshot; // 1.9節
}

export type ApplyRunOutcomeError =
  | { kind: 'saveIdMismatch' }   // v9レビュー#6「saveId不一致はapplied:falseではなくerrorにする」
  | { kind: 'staleLease' };      // 古いタブ由来(下記回復フロー)

export type ApplyRunOutcomeResult =
  | { ok: true; result: AppliedRunResult; nextInventory: PlayerInventory; nextDiscoveredModes: ReadonlySet<DestructionModeId>; nextSaveMeta: SaveEnvelopeMeta }
  | { ok: false; error: ApplyRunOutcomeError };
```

**リース回復フロー(v9レビュー#6「起動時、別タブが本当に生存中の場合と、クラッシュで残ったstale leaseを区別する具体的な回復フローをP3-0で確定する」)**: 起動時、保存済み`leaseHeartbeatAt`が現在時刻から一定時間(例: 30秒、具体値は実装ステップで較正)以内であれば「別タブが生存中の可能性がある」と判定しUIへ警告する(新規runの開始をブロック)。それより古ければ「クラッシュ後の残留」とみなし、このタブが新しい`leaseToken`を発行して上書きする(安全に引き継ぐ)。アクティブなタブは`leaseHeartbeatAt`を一定間隔で更新し続ける。

**冪等性(不変)**: `runSequence <= lastAppliedRunSequence`は「適用済みとしてskip」(`applied:false`、エラーではない)。`saveId`不一致は「別セーブへの不正入力」として`ApplyRunOutcomeError.saveIdMismatch`を返す(v9レビュー#6)。

**migration**: 既存`v15:progress`/`v15:notebook`から新統合スキーマへの移行時、`saveId`を新規発行し`lastAppliedRunSequence=0`・`nextRunSequence=1`で初期化する。移行処理自体の冪等性(再実行しても二重にならない)は既存スキーマの有無で判定する(v9から継続)。

### 1.6 ファイル所有境界の是正(v9レビュー#9対応)

v9は`applyRunOutcome`を`src/materials/degradationApplication.ts`に置き「engineに依存しない」としていたが、この関数は**engine出力`RunOutcome`を受け取るため実際には依存しており、かつ適用・図鑑・報酬・save metaの管理はspec §7.5でstore所有と確定している事項**である(v9レビュー#9)。3層へ正しく再配分する:

```
src/engine/destructionOrchestration.ts   # RunAccumulator・finalizeRun・deriveDegradationDiffs・
                                          # captureRunSnapshot・restoreRunSnapshot(RunSnapshotは
                                          # シミュレーション契約そのものであるためengine所有とする)
src/materials/degradationApplication.ts  # 小さな副作用のない変換のみ: 単一のDegradationDiffを
                                          # 単一のWearState/AssemblyStateへ適用しnewWearStateを返す。
                                          # RunOutcome全体もPlayerInventory全体も知らない
src/store/runOutcomeApplication.ts       # 新設(store層、brabit所有)。applyRunOutcome・
                                          # AppliedRunResult・SaveEnvelopeMeta管理・図鑑発見判定・
                                          # 報酬計算。RunApplicationEnvelopeを受け取り、
                                          # degradationApplication.tsの小さな変換を個体ごとに
                                          # 呼び出しながらPlayerInventory全体を更新する
```

```ts
// src/materials/degradationApplication.ts。engine型(DegradationDiff)への型参照はあるが、
// RunOutcome全体・save meta・実個体の集合は一切知らない(v9レビュー#9の「小さな変換」)
export function applyDegradationDiffToWearState(
  diff: Extract<DegradationDiff, { role: 'magnet' | 'gear' | 'brush' }>,
  current: WearState,
): WearState;

export function applyDegradationDiffToAssembly(
  diff: Extract<DegradationDiff, { role: 'rotor' | 'body' | 'battery' | 'bearing' }>,
  current: RotorAssemblyState | BodyPartState | BearingAssemblyState | null, // battery(消滅)はnull遷移
): RotorAssemblyState | BodyPartState | BearingAssemblyState | null;

// src/store/runOutcomeApplication.ts
export function applyRunOutcome(
  envelope: RunApplicationEnvelope,
  currentInventory: PlayerInventory,
  discoveredModes: ReadonlySet<DestructionModeId>,
  saveMeta: SaveEnvelopeMeta,
): ApplyRunOutcomeResult;
```

### 1.7 全終了経路とreload保証範囲(v9から継続、1.1節の判別union化を反映)

### 1.8 engineの個体ID非依存性(v9から継続)

### 1.9 使用する型の定義元一覧(v9レビュー#1対応、新設)

| 型 | 定義元 | 備考 |
|---|---|---|
| `MotorConfig`・`SimState`・`Rng` | `src/engine/motorPhysics.ts`(既存) | 無改修 |
| `CarConfig`・`VehicleSimState`・`FailureCode` | `src/engine/vehiclePhysics.ts`(既存) | 無改修 |
| `TrackDefinition`・`ValidatedTrackDefinition` | `src/engine/trackPhysics.ts`(既存) | 無改修。`validateTrackDefinition`・`createValidatedTrack`を1.4節で再利用 |
| `DestructionModeId`・`DestructionState`・`DestructionEvent`・`RunAccumulator`・`RunOutcome`・`DegradationDiff`・`RunSnapshot`・`RestoredRunSnapshot`・`FireExposureProfile` | `src/engine/destructionOrchestration.ts`(新規、本計画) | engine契約(1節・2節) |
| `WearState`・`InventoryItem`・`PlayerInventory`・`RotorAssemblyState`・`BodyPartState`・`BearingAssemblyState` | `src/materials/inventoryItem.ts`(既存を拡張) | 1.2節・1.3節 |
| `WireMaterialId`・`GearMaterialId`・`MagnetMaterialId`・`BatteryMaterialId` | `src/materials/inventoryItem.ts`内でローカル再宣言(既存パターン、`materialMapping.ts`の同名exportとは意図的に別、1節の層境界コメント参照) | 既存 |
| `BodyMaterialId` | **新規**。`src/materials/inventoryItem.ts`で`(typeof BODY_MATERIALS)[number]['id']`として、既存の`MagnetMaterialId`等と同じパターンでローカル再宣言する(`BODY_MATERIALS`は`src/materials/materials.ts`に既存export確認済み) | 1.2節 |
| `EquipmentIdSnapshot`・`AppliedRunResult`・`SaveEnvelopeMeta`・`RunApplicationEnvelope`・`ApplyRunOutcomeResult` | `src/store/runOutcomeApplication.ts`(新規、store層) | 1.5節・1.6節。`EquipmentIdSnapshot`は走行開始時点の実装備ID一覧(役割→実ID解決用)、具体的なフィールドはP3-0実装ステップで確定 |

---

## 2. モジュール構成と状態機械設計

```
src/engine/destructionModes.ts          # D01〜D07・D09の状態機械(純関数)。leafモジュール
src/engine/destructionOrchestration.ts  # RunAccumulator操作+finalizeRun+deriveDegradationDiffs+
                                         # captureRunSnapshot/restoreRunSnapshot(1.6節で確定)
src/engine/__tests__/destructionModes.test.ts
src/engine/__tests__/destructionOrchestration.test.ts
src/materials/degradationApplication.ts # 個体単位の小さな適用変換のみ(1.6節)
src/materials/__tests__/degradationApplication.test.ts
src/store/runOutcomeApplication.ts      # applyRunOutcome等(1.6節、新設)
src/store/__tests__/runOutcomeApplication.test.ts
```

### 2.1 型設計: 共有信号+モード別Progress+排他的電池state(v9から継続、D05のみ更新)

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
  triggered: boolean; triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning';
  stageEnteredAtT: number | null;
  overDischargeActive: boolean;
  causeLog: D04CauseLog | null;
}

export interface D05Progress { // 1.2節: cumulativeAbnormalExposureSを追加
  sparkDurationS: number;
  episodeTriggered: boolean;
  episodeCount: number;
  cumulativeAbnormalExposureS: number;
  firstEpisodeAtT: number | null;
  causeLog: D05CauseLog | null;
}

export interface D06Progress { toothLossCount: number; firstLossAtT: number | null; causeLog: D06CauseLog | null; }

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
    modes: { /* 全モード初期値。D05のcumulativeAbnormalExposureSも0で初期化 */ },
  };
}
```

### 2.2 CauseLogと温度規約(v8から継続、D04CauseLogへfireExposureProfile追加)

```ts
export interface D04CauseLog extends CauseLogCommon {
  batteryHeatRatio: number; shortCircuitDurationS: number; stage: D04Progress['stage'];
  overDischargeRatio: number | null;
  fireExposureProfile: FireExposureProfile; // v9レビュー#4対応(3.1節): 炎上到達時点で有効だった
  // 延焼対象プロファイルをイベントへスタンプする。deriveDegradationDiffsはこの値だけを見て
  // 延焼対象roleを決定できる(advanceDestructionStateの引数を増やさずに済む設計、3.1節)
}
```

その他CauseLog型・`TemperatureReading`はv8から不変。

### 2.3 D08の扱い(不変)

### 2.4 イベント契約(v9から継続、`DestructionEvent`はここでのみ定義、1.1節参照)

```ts
export type PhysicsSnapshotAtT =
  | { context: 'motor'; state: SimState }
  | { context: 'vehicle'; state: VehicleSimState };

export type DestructionEvent =
  | { mode: 'D01'; causeLog: D01CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true }
  | { mode: 'D02'; causeLog: D02CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true }
  | { mode: 'D03'; causeLog: D03CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true }
  | { mode: 'D04'; causeLog: D04CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true }
  | { mode: 'D05'; causeLog: D05CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: boolean }
  | { mode: 'D06'; causeLog: D06CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: boolean }
  | { mode: 'D07'; causeLog: D07CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true }
  | { mode: 'D09'; causeLog: D09CauseLog; physicsSnapshotAtT: PhysicsSnapshotAtT; isFirstThisSession: true };
```

D05のepisodeモデル(rising edgeのみイベント化)はv9から不変。

---

## 3. D01〜D09個別設計

v8 3節の表を維持する。以下、v9レビューで確定した変更点のみ詳述する。

### 3.1 D04: FireExposureProfileの分離(v9レビュー#4対応)

v9の`d04AdjacentRoles`が電池の較正値configへ混入していた問題を修正する。**装備配置は物性値ではないため、電池configから独立したrun開始入力として扱う**:

```ts
export interface FireExposureProfile {
  bodyEquipped: boolean;             // bodyは正典必須対象(spec §7.1.1)。未装備なら延焼差分なし
  adjacentRolesEquipped: readonly EquipmentRole[]; // body以外の追加対象。validatorで重複・
  // body/battery自身の混入を排除する
}

export function validateFireExposureProfile(
  raw: { bodyEquipped: boolean; adjacentRolesEquipped: readonly EquipmentRole[] },
): { ok: true; profile: FireExposureProfile } | { ok: false; reason: string };
```

`FireExposureProfile`は`RunAccumulator`(1.1節)へ走行開始時に1回だけ格納する(装備は起動時一括写像の規律により走行中不変)。D04が炎上到達(`stage`が`'burning'`)した瞬間、ラッパー(4.4節)がその時点の`accumulator.fireExposureProfile`を`D04CauseLog.fireExposureProfile`へスタンプする(2.2節)。`deriveDegradationDiffs`はこのcauseLogのフィールドだけを見て延焼対象roleを決定し、`advanceDestructionState`自体のシグネチャは変更しない(`fireExposureProfile`はconfigでもframeでもなく、イベント生成後にラッパーが後付けする情報として扱う)。

具体的な隣接関係(`adjacentRolesEquipped`に何を含めるか)はart-spec・実配置データに基づく判断であり、独自解釈せずFableレビュー後にSuu・人間承認を経てP3-0実装時に凍結する(v9から継続、15節)。

### 3.2 D04: 過放電・給電停止後の進行を一意化(v9レビュー#5対応)

v9は「給電停止後も膨張→炎上へ進行する」としながら、既存の車両物理ループ自体は`status`が終端になった時点でstepを終了する(既存`stepVehicle`/`stepTrackRun`の早期returnパターン)ため、両者は両立しなかった(v9レビュー#5)。

**採用案(Suu提示の2案のうち案2)**: **destruction専用の継続stepループは導入しない。** D04の段階遷移(膨張→発煙→炎上)は、既存の物理step(motor-only/vehicle/track)が実際に呼ばれている間だけ進行する。もし既存物理が(energyExhausted等)destruction以外の理由で先に終端した場合、**その時点でD04の段階進行も止まり、`stage`が`'burning'`未到達のままそのrunは終わる**(炎上未到達=`RunOutcome.terminalModes`にD04は含まれない。電池は消滅せず、単に「危険域まで行ったが完走した」という記録がdestructionStateに残るのみ)。これは実装コストが低く、既存の「物理停止後は一切ステップしない」という凍結済みの早期returnパターンと矛盾しない。

この採用により、v9で書いていた「給電停止後も進行する」という記述は撤回する。`energyExhausted`と`destructionTerminal`(D04炎上到達)は、**同一run内でどちらか一方しか起こらない**(先に到達した方が`RunOutcome.endReason`を決める。1.1節の`finalizeRun`が`terminalModeCandidates`の有無で自動的に優先順位を判定する)。

**過放電しきい値の意味(v9レビュー#5、名称変更)**: `overDischargeUsedRatioThreshold`を`unsafeDischargeStartRatio`へ改称する(v9レビュー#5「LiPoの安全放電限界を近似する`unsafeDischargeStartRatio`として提案」)。値は(0,1)の範囲で、「総エネルギー予算に対する消費比率がこの値を超えたら安全放電限界を超えたとみなす」という設計意図を明記する。物理的根拠・較正値は**Fableへ確認する**(15節)。

### 3.3 D05: episodeモデル(2.4節参照、v9から不変)

### 3.4 D06/D09: ギヤ損傷の完全分離(1.2節参照)

### 3.5 D03/D04/D06: 素材family/ID非依存の設計(v8から継続)

---

## 4. destructionOrchestration.ts

### 4.1 既存3関数(変更なし、v8から継続)

### 4.2 DestructionConfig(v9レビュー#4対応、`d04AdjacentRoles`を削除)

```ts
export type BatteryDestructionConfig =
  | { profile: 'nonLipo'; shortCircuitDurationLimitS: number }
  | {
      profile: 'lipo';
      shortCircuitDurationLimitS: number;
      runawayHeatThreshold: number;
      unsafeDischargeStartRatio: number; // 3.2節、旧overDischargeUsedRatioThresholdから改称
      stageDurations: { swellingS: number; smokingS: number };
      // d04AdjacentRolesはここに含めない(3.1節、FireExposureProfileへ分離)
    };

export interface DestructionConfigDraft {
  battery?: BatteryDestructionConfig;
  d02?: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
  d05?: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06?: { breakage: GearBreakageProfile }; // totalToothCountはここに置かない(1.2節、個体属性化)
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
  d06: { breakage: GearBreakageProfile };
  d07: { magnetHeatGaugeLimit: number; reversibleDroopThreshold: number };
  d09: { bearingSeizureGaugeLimit: number };
}

export type ValidateDestructionConfigResult = { ok: true; config: DestructionConfig } | { ok: false; missingFields: string[] };
export function validateDestructionConfig(draft: DestructionConfigDraft): ValidateDestructionConfigResult;
```

D06の判定式(3節表`frame.loadTorqueNm > config.d06.gearStrengthThresholdNm`)における`totalToothCount`は、判定対象個体の`WearState.gear.totalToothCount`(1.2節)から都度読む(configではなく個体から読む値であることをここに明記する)。

### 4.3 電池config(v10 4.2節に統合済み)

### 4.4 ラッパー関数: RunAccumulatorとterminalModeCandidatesの更新(v9レビュー#2反映)

```ts
export interface DestructionStepResult<TPhysicsState> {
  physicsState: TPhysicsState;
  accumulator: RunAccumulator;
}

const TERMINAL_MODES_TABLE: ReadonlySet<DestructionModeId> = new Set(['D03', 'D09']); // D02は発火到達時のみ、
// D04は炎上到達時のみterminal(下記の個別判定)。D03/D09は発火=常にterminal

function classifyTerminalModes(events: readonly DestructionEvent[]): readonly DestructionModeId[] {
  const result: DestructionModeId[] = [];
  for (const event of events) {
    if (TERMINAL_MODES_TABLE.has(event.mode)) result.push(event.mode);
    if (event.mode === 'D02') result.push('D02'); // D02Progress.triggeredは3節表のとおり「発火到達」
    // のみを表す(発煙段階ではeventが発行されないため、eventが存在する時点で常にterminal)
    if (event.mode === 'D04' && event.causeLog.stage === 'burning') result.push('D04');
  }
  return result;
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
  const stampedEvents = events.map((e) => e.mode === 'D04'
    ? { ...e, physicsSnapshotAtT: snapshot, causeLog: { ...e.causeLog, fireExposureProfile: accumulator.fireExposureProfile } }
    : { ...e, physicsSnapshotAtT: snapshot });
  return {
    physicsState,
    accumulator: {
      ...accumulator,
      destructionState: state,
      events: [...accumulator.events, ...stampedEvents],
      terminalModeCandidates: [...accumulator.terminalModeCandidates, ...classifyTerminalModes(stampedEvents)],
    },
  };
}

export function stepTestRunWithDestruction(/* 同型のaccumulator受け渡し。frame構築の完全な実装はP3-2/P3-4で確定 */): DestructionStepResult<VehicleSimState>;
export function stepTrackRunWithDestruction(/* 同上 */): DestructionStepResult<VehicleSimState>;
```

### 4.5 状態の所有者・初期化・受け渡し・呼び出しタイミング(v9から継続)

### 4.6 案1との比較(v9から継続)

---

## 5〜11(v9から継続、変更なし)

5節(三段開示・イベント通知API)・6節(HUD境界)・7節(図鑑・store所有、1.6節のファイル配置修正を反映)・8節(決定論境界)・9節(D08 Phase割当)・10節(Phase2繰越事項)・11節(独自解釈しない事項)は、本節番号のままv9の内容を維持する(1.6節のファイル所有境界修正はこれらの節の記述と矛盾しない)。

---

## 12. ステップ分割案(P3-0〜P3-4、v9から継続、ファイル所有境界の変更を反映)

各ゲートの手順は不変。P3-0のDoDへ追加: `RunOutcome`判別unionのコンパイル可能性そのもの(TypeScriptビルドが通ること)、`terminalModeCandidates`の固定順序テスト、`nextRunSequence`が途中放棄されたrunをブロックしないことのテスト、`restoreRunSnapshot`の全フィールドruntime検証テスト、`WearState.gear`の新スキーマへの移行テスト(既定`totalToothCount`からの変換)、`applyDegradationDiffToWearState`/`applyDegradationDiffToAssembly`(materials層)と`applyRunOutcome`(store層)の責務分離テスト。

## 13. DoD・テスト方針(v9から継続、追加項目)

v9 13節に加え: **`RunOutcome`判別unionが`destructionTerminal`以外で`terminalModes`を持てないことの型テスト**、**D04が既存物理終了(energyExhausted等)により`stage`未到達のまま終わるケースのテスト**(v9レビュー#5)、**leaseHeartbeat/staleLease判定のテスト**(v9レビュー#6)。

## 14. UI計画への申し送り(v9から継続)

Suu_mot3の次の順序どおり、UI計画v5はv10確定後にbrabit_mot3が着手する。

## 15. Fableへの重点確認事項

- **P3-0(最重点)**: `RunOutcome`判別union+`terminalModeCandidates`の設計、`nextRunSequence`+lease回復フローの設計、1.6節のengine/materials/store3層のファイル所有境界
- 1.2節: ギヤ総歯数(`totalToothCount`)が素材別に変わるか全ギヤ共通の不変値か、合成式(max案 vs 加重和案)
- 3.1節: `FireExposureProfile`の具体的な隣接関係(art/layout判断、Suu・人間承認後にP3-0で凍結)
- 3.2節: D04の「physics停止後は継続stepしない」案の採用可否、`unsafeDischargeStartRatio`の物理的根拠・較正値
- その他、v9から継続する未決事項(D02のR_coilオーバーライド、給電停止機構案a/b、D03/D04のmotor-only扱い等)

Fableの回答は要約せず全文でSuu_mot3経由で中継してもらう。実装・commitはFableレビュー・人間承認まで引き続き未着手のまま維持する。

---

## 16. 改訂履歴

v1〜v9の差分表は各版の16節に保持済み。本節はv9→v10の差分のみ、0節の対応サマリ表を参照。
