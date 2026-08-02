# Phase 3統合計画(破壊モード+図鑑)— v8改訂版(engine/store所有境界の是正)

作成: alice_mot3 2026-08-02。**状態: Suuレビュー前・Fable未提出・実装/commit未着手。**

本書は`docs/phase3-plan-v7.md`をSuu_mot3レビュー(2026-08-01T20:18着信、以下「v7レビュー」)18項目に基づき改訂したものである。**v7をこの文書で置き換える。v7は履歴として保持する(削除しない)。**

v7レビューの結論: 「P3-0先行・D03/D04排他・無次元熱ゲージ・D09必須化・単一persist案・発火後物理の正典追従・破壊契約マトリクスは正しく直った」。一方で**engine/store所有境界と結果確定タイミングに重大な矛盾が残っている**——`RunOutcome`をengine出力と定義しながら実際にはstore層が組み立てる記述になっていた、破壊時物理スナップショットが契約に無かった、rotor/body/bearingを架空の素材familyとして追加しようとしていた、D06の反復物理イベントをイベント列から落としていた、等。v8はこれらを是正する。

対象: `docs/spec.md`(r2)§4.8・§5.1・§5.2・§5.3・§7.1・§7.1.1・§7.2・§7.3・§7.4・§7.5・§12・§13。

**本書の作成にあたり追加で確認したもの**(v7で確認済みの一次資料に加えて): `src/engine/trackPhysics.ts`の`computeEnergyBudgetJ`(非export、D04過放電経路の再利用候補、下記3.1節)、`VehicleSimState.energyUsedJ`(既存フィールド)。

---

## 0. v7レビュー18項目 対応サマリ

| # | v7の欠陥 | 対応節 |
|---|---|---|
| 1 | `RunOutcome`をengine出力と定義しながらstore層が組み立てる記述だった | 1.1節: `buildRunOutcome`をengine側(destructionOrchestration.ts)の関数として明記。store出力は別型`AppliedRunResult`(1.6節) |
| 2 | 破壊時物理スナップショットが契約に無い | 1.1節・2.4節: `DestructionEvent`へ`physicsSnapshotAtT`を追加 |
| 3 | `finalSnapshot`が走行開始状態を指す紛らわしい命名、trackId参照だけで自己完結しない | 1.4節: `replaySnapshot`へ改名し、track定義本体・シミュレーション契約版を含む完全自己完結型に拡張 |
| 4 | D03/D04の`temperature`が`unavailable`のままだった | 2.2節: D03/D04も`uncalibratedGauge`(ratio=batteryHeatRatio)へ修正 |
| 5 | D04の過放電経路が未実装のまま将来枠扱いだった | 3.1節: 既存`energyUsedJ`/エネルギー予算比の再利用案を提示し実装対象へ戻す |
| 6 | D04延焼対象がbodyのみでspec「近接パーツ」を落としていた | 1.2節・3節: `EquipmentRole`に近接部位の概念を追加 |
| 7 | rotor/body/bearingを架空の素材familyとして追加しようとしていた | 1.2節: 素材familyとは別の「損壊可能アセンブリ」スキーマへ設計変更 |
| 8 | D09のギヤ側劣化kind等、複数のvariantがP3-4まで型未凍結だった | 1.2節: P3-0で全variant(D06/D09のギヤ損傷共通化を含む)を確定 |
| 9 | D06の反復物理イベントが`events`列から欠落 | 2.4節: 全物理イベントをeventsへ含め、`isFirstThisSession`で図鑑候補を分離 |
| 10 | optional configで完成後もモードを黙って無効化できた | 4.2節: 段階実装用`DestructionConfigDraft`と完成版`DestructionConfig`を分離。チタン非発火を明示プロファイル化 |
| 11 | `runId`が無制限集合で管理される設計だった | 1.5節: 単調増加`runSequence`+高水位管理へ変更 |
| 12 | 手動中断時に劣化が確定しない抜け道があった | 1.1節: `endReason`に`manualAbort`を追加し、全終了経路で原子的反映を行う |
| 13 | store/UI統合が「P3-4以降」という無名工程に置かれていた | 12節: 各P3-1〜P3-4のDoDへstore統合テストを組み込み、P3-4を最終完成ゲートに統一 |
| 14〜17 | UI側(検死レポート遷移依存の永続化、終端/非終端分類、複数発見導線、正典ファイル名) | 本書はengine計画のためスコープ外。brabit_mot3のUI計画v4改訂事項として14節に明記 |
| 18 | AGENTS.md/CLAUDE.mdの同期更新が計画に無い | 12節: v8承認後・実装着手前のP3-0サブステップとして追加 |

---

## 1. P3-0: クロスレイヤ契約(型凍結ゲート)

### 1.1 RunOutcomeの生成者(v7レビュー#1・#2・#12対応)

**`RunOutcome`はengine側の純関数が生成する。** v7 §1.1は「エンジン出力」と定義しながら「走行終了時にstore層が組み立てる」と書いており矛盾していた(v7レビュー#1)。修正: `destructionOrchestration.ts`に、走行終了を検出した時点で呼ぶ`buildRunOutcome`を新設する。

```ts
export interface DestructionEvent {
  mode: DestructionModeId;
  causeLog: /* 2.2節の判別union */ unknown; // 表示用の最小ログ
  physicsSnapshotAtT: SimState | VehicleSimState; // v7レビュー#2: 破壊時の物理スナップショット(再現・検証用)。
  // causeLogとは別物: causeLogは検死レポート表示用の抽出済み最小フィールド、
  // physicsSnapshotAtTはそのstepの物理状態そのもの(リプレイ・数値検証用)
  isFirstThisSession: boolean; // v7レビュー#9: このセッション内でこのモードが初めて発火したか。
  // 「図鑑への初回登録候補」の判定材料(実際の初回登録可否はstoreの永続発見済み集合と
  // 突き合わせて決まるため、engineは「セッション内初回」までしか判定できない)
}

export interface RunOutcome {
  endReason: 'finished' | 'stalled' | 'derailed' | 'energyExhausted' | 'destructionTerminal' | 'manualAbort';
  // v7レビュー#12: 'manualAbort'を追加。UIがプレイヤー操作でセッションを中断した場合も
  // ここまでに発生した劣化差分・イベントを一度だけ確定する(下記1.6節)
  terminalMode?: DestructionModeId; // endReason==='destructionTerminal'のときのみ
  events: DestructionEvent[]; // この走行で発生した**全物理イベント**(発生順)。D06の2本目以降の
  // 歯欠け等、反復する物理イベントもすべて含む(v7レビュー#9、v7からの変更点)
  destructionState: DestructionState; // 走行終了時点の状態
  degradationDiffs: DegradationDiff[]; // 1.2節
  replaySnapshot: RunSnapshot; // 1.4節(v7の`finalSnapshot`から改名)
  runSequence: number; // 1.5節
}

// destructionOrchestration.tsの新規export。走行終了(既存VehicleSimState.status、または
// motor-onlyの停止相当機構、下記3.1節)を検出したstoreが1回だけ呼ぶ。純関数であり、
// 引数はすべてこのセッション中にengine側で蓄積・計算済みの値のみ(所持金・実個体ID・
// runId発行元は一切参照しない、1.7節の個体ID非依存性を維持)
export function buildRunOutcome(
  endReason: RunOutcome['endReason'],
  terminalMode: DestructionModeId | undefined,
  accumulatedEvents: DestructionEvent[],
  finalDestructionState: DestructionState,
  initialSnapshot: RunSnapshot,
  runSequence: number,
): RunOutcome;
```

**storeの責務はRunOutcomeを受け取り原子的に適用するだけ**(v7レビュー#1)。適用結果は`RunOutcome`とは別の型`AppliedRunResult`で表す(1.6節)。所持金・発見済み状態・実個体ID・`runId`(runSequence)の発行元はいずれもengineへ渡さない(1.7節)。

### 1.2 損壊可能アセンブリの契約(v7レビュー#6・#7・#8対応)

**v7案A(rotor/body/bearingを実在素材カタログに接続しない架空の`InventoryItem.family`として追加する)を撤回する。** v7レビュー#7の指摘どおり、これは「素材family」(実在物性を持つカタログ概念、`materials.ts`)と「組立物・部位の損壊状態」(概念として別物)を混同しており、CLAUDE.md「架空素材・架空物性は導入しない」の精神とも衝突しやすい。

**修正した境界**:
- **material family**: 既存の実在素材分類のまま変更しない(`materials.ts`の9ファミリー)
- **damageable equipment/assembly**: ローター組立物・ボディ個体・軸受部などを表す**別スキーマ**。assemblyは構成素材・在庫IDを参照できるが、自身を架空素材として扱わない

```ts
// Phase4巻線記録方式(CLAUDE.md拡張点(b)ではなく本体機能)への移行を見据えた最小スキーマ。
// Phase3時点では「巻かれた線材が壊れたかどうか」の2値+由来の線材itemIdのみを持つ。
// Phase4で巻線記録の集計値(ターン数・被膜ダメージ等)を持つ本格スキーマへ拡張される
export interface RotorAssemblyState {
  assemblyId: string;         // 個体ID(store発行、1.5節と同じ発行者)
  sourceWireItemId: string | null; // 由来の線材消耗材(スタック在庫からの引当。無ければnull)
  collapsed: boolean;         // D01: 崩壊開始済みか(spec §7.1.1「実効巻数・占積が漸減」の起点)
  burnedOut: boolean;         // D02: 発火到達により全損したか
}

// bodyは既存の実在素材(materials.tsのbodyファミリー)を持つ個体。coating/substrate/roller同様、
// Phase2時点で個体劣化スキーマに未接続だった(v7 10節)。D04延焼で初めて劣化を追跡する
export interface BodyPartState {
  assemblyId: string;
  materialId: BodyMaterialId;  // 既存bodyファミリーの素材ID(materials.ts)
  scorchFraction: number;      // 0(無傷)〜1(全損)。D04延焼由来
}

// 軸受はmaterials.tsに素材ファミリーとして存在しない(実測確認済み)。V3では軸受を
// 実在素材アイテムとしてカタログ化せず(bearingを新規materialファミリーとして追加する
// ことはPhase3のスコープに含めない、下記Fable確認事項)、ギヤに付随する非交換部位として
// 扱う。したがって素材アイテムではないassemblyとして最小定義する
export interface BearingAssemblyState {
  assemblyId: string;          // ギヤ個体に1:1で付随(gearItemIdを保持)
  gearItemId: string;          // 付随先のギヤInventoryItem.itemId
  seizureFraction: number;     // 0〜1、D09の摩擦増進行度の恒久側
}
```

**D06/D09のギヤ損傷kindの統合(v7レビュー#8)**: v7は「D06=toothDamageFraction」「D09=gear個体の劣化(未定kind)」を別々に持たせようとしており、「P3-0以降は型を変えない」方針と矛盾していた。**統合案(推奨)**: `WearState`の`gear` kindを単一の総合損傷度として扱い、D06(歯欠け、離散カウント由来)とD09(かじり、連続摩耗由来)の両方がこの同じ`toothDamageFraction`へ加算する(D06は「1本あたりの固定増分」、D09は「焼付き発生時の一括増分」)。対案(D06/D09を別kindに分ける)はより物理的に正確だが、`computeSalvageRate`等の既存ロジックがgear個体を単一fractionとして扱う設計(inventoryItem.ts)と食い違いが増える。**採否をFableへ確認する**(15節)。

**近接延焼ロールの拡張(v7レビュー#6)**: spec §7.1.1「ボディ・近接パーツへの延焼判定と焼損差分」に従い、`EquipmentRole`を拡張する。「近接パーツ」の具体的な範囲(モーター本体に近い部位という物理的位置関係をどう装備スロットへ落とすか)はart-spec/spec双方に明記が無いため、**独自解釈せず**次の暫定案を提示してFableへ確認する: 電池と同一のモーターユニット内に搭載される部位として`body`(ボディ全体)+`magnet`(電池至近の磁石)を延焼対象候補とする。`gear`・`brush`は電池から離れた駆動系のため対象外とする。

```ts
export type EquipmentRole = 'rotor' | 'battery' | 'gear' | 'brush' | 'magnet' | 'bearing' | 'body';

export type DegradationDiff =
  | { role: 'magnet'; kind: 'demagnetization'; deltaFraction: number } // D07不可逆到達時
  | { role: 'magnet'; kind: 'scorch'; deltaFraction: number }          // D04延焼(暫定対象、上記)
  | { role: 'gear'; kind: 'toothDamage'; deltaFraction: number }       // D06(歯1本あたり固定増分)+D09(焼付き時一括増分)、統合kind
  | { role: 'brush'; kind: 'wear'; deltaFraction: number }             // D05
  | { role: 'rotor'; kind: 'collapse' }                                // D01(全損、RotorAssemblyState.collapsed=true)
  | { role: 'rotor'; kind: 'burnout' }                                 // D02発火到達(全損、burnedOut=true)
  | { role: 'battery'; kind: 'consumed' }                              // D03/D04共通
  | { role: 'body'; kind: 'scorch'; deltaFraction: number }            // D04延焼(必須対象)
  | { role: 'bearing'; kind: 'seizure' };                              // D09
```

**Fableへの確認事項(本節、15節へ追加)**: (a) 上記のRotorAssemblyState/BodyPartState/BearingAssemblyStateの3スキーマ案の妥当性、(b) D06/D09のギヤ損傷kind統合の採否、(c) D04近接延焼ロールの暫定案(body+magnet)の妥当性、(d) bearingを将来Phase5以降で実在素材ファミリーとしてカタログ化する構想の要否(V3スコープ外の将来枠として明記するか)。

### 1.3 store所有・PlayerInventoryの拡張

`PlayerInventory`(既存、`src/materials/inventoryItem.ts`)に、1.2節の3アセンブリを追加する:

```ts
export interface PlayerInventory {
  readonly cashG: number;
  readonly items: readonly InventoryItem[];       // 既存(magnet/gear/brush/battery)
  readonly stackableStock: readonly StackableStockEntry[]; // 既存(wire/coating)
  readonly rotorAssemblies: readonly RotorAssemblyState[]; // 新規(1.2節)
  readonly bodyParts: readonly BodyPartState[];             // 新規
  readonly bearingAssemblies: readonly BearingAssemblyState[]; // 新規
}
```

個体ID(`itemId`・`assemblyId`)の発行はすべてstore所有(brabit)。engineはこれらの実IDを一切知らない(1.1節)。

### 1.4 リプレイスナップショット契約(v7レビュー#3対応、`replaySnapshot`へ改名・自己完結化)

v7の`finalSnapshot`という命名は「走行開始状態」を指す設計と矛盾しており(v7レビュー#3)、`trackId`のみの参照ではコースデータが将来更新された場合に現在のデータを誤って参照する。**改名し、版付きの自己完結スナップショットへ拡張する**:

```ts
export interface RunSnapshot {
  contractVersion: number; // 固定dt・シミュレーション契約そのものの版(将来dt変更等があった場合の
  // 互換性検出用。現行は1固定。CLAUDE.mdの固定dt=1/120s契約が変わらない限り1のまま)
  motorConfig: MotorConfig;
  carConfig: CarConfig | null; // motor-onlyの場合null
  destructionConfig: DestructionConfig; // 4.2節(完成版)
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: ValidatedTrackDefinition | null; // v7の`trackId`参照から変更: コース定義本体をまるごと
  // 埋め込む(motor-onlyの場合null)。将来同一trackIdのコースデータが更新されても、
  // 保存済みリプレイはこのスナップショット内の定義で再現される
  seed: number;
  initialDestructionState: DestructionState; // 実質的にcreateInitialDestructionState(battery.profile)の値
}
```

`RunOutcome.replaySnapshot`は**走行開始時点**のスナップショットを保持する(命名の意図を明確化)。リプレイは`RunSnapshot`単体から、現在の在庫・現在のWearState・現在の装備選択を一切参照せずに再現できることをDoDで検証する(v6・v7から継続)。

### 1.5 runIdの冪等性契約(v7レビュー#11対応、有限化)

v7の「UUIDまたは連番」「適用済みID集合」は無制限に増える集合を要求しており不足していた。**単調増加する`runSequence`+高水位管理**へ変更する:

```ts
export interface SaveEnvelopeMeta {
  saveId: string;             // このセーブファイル系列の識別子(初回起動時に1回発行)
  lastAppliedRunSequence: number; // 最後に適用したrunSequence(初期値0)
}
```

`runSequence`はstore側がセッション開始時に`lastAppliedRunSequence + 1`として払い出す(実質的な連番)。`applyRunOutcome(outcome: RunOutcome)`は`outcome.runSequence <= lastAppliedRunSequence`の場合、適用済みとして無条件にスキップする(冪等)。集合ではなく単一の数値を保持するだけでよいため保存量が有界になる(v7レビュー#11)。

**移行**: 既存の`v15:progress`/`v15:notebook`から新統合スキーマへの移行時、`saveId`を新規発行し`lastAppliedRunSequence`を0で初期化する。移行処理自体の冪等性(移行を複数回実行しても二重にならないこと)をDoDへ含める(v7レビュー#11)。

### 1.6 store適用結果契約: `AppliedRunResult`(v7レビュー#1対応、新設)

```ts
export interface AppliedRunResult {
  runSequence: number;
  applied: boolean; // false=runSequenceが既に適用済みだったため何もしなかった(1.5節の冪等性)
  newlyDiscoveredModes: DestructionModeId[]; // 今回のRunOutcome.eventsのうちisFirstThisSession=true
  // かつstoreの永続発見済み集合に無かったモード(実際の「初回登録」)
  rewardsGrantedG: number; // 今回付与された図鑑報酬合計(仮値、spec §5.1)
  resolvedDegradations: Array<{ role: EquipmentRole; resolvedItemOrAssemblyId: string }>; // 1.2節の
  // 役割ベース差分が、走行開始スナップショット上のどの実IDへ解決されたか(検証・表示用)
}
```

store側の`applyRunOutcome`は、`RunOutcome`(engine出力)+走行開始時の装備スナップショット(実ID一覧)を受け取り、1.2節の`DegradationDiff`を実IDへ解決しながら1.3節のPlayerInventoryを更新し、単一の`set()`呼び出しで原子的に反映する(spec §7.5の5操作、v7 1.3節から継続)。戻り値が`AppliedRunResult`である。

### 1.7 engineの個体ID非依存性(v7から継続)

engineのどのモジュールも、`InventoryItem.itemId`・`RotorAssemblyState.assemblyId`等の実ID・所持金・図鑑発見状態を型としても値としても参照しない。

### 1.8 段階実装用config/完成版configの分離(v7レビュー#10対応)

4.2節で詳述する。P3-0時点では「段階実装中は`DestructionConfigDraft`(モード別optional)、Phase3完成条件としては`DestructionConfig`(必須フィールド+ランタイムvalidator)」という2型構成の方針だけをここで確定する。

---

## 2. モジュール構成と状態機械設計

```
src/engine/destructionModes.ts          # 新規。D01〜D07・D09の状態機械(純関数)。leafモジュール
src/engine/destructionOrchestration.ts  # 新規。既存3関数との結合+buildRunOutcome(1.1節)
src/engine/__tests__/destructionModes.test.ts
src/engine/__tests__/destructionOrchestration.test.ts
src/materials/degradationApplication.ts # RunOutcome.degradationDiffsを実IDへ解決しPlayerInventoryへ
                                         # 適用する純関数。engineに依存しない(1.6節のapplyRunOutcomeが使う)
src/materials/__tests__/degradationApplication.test.ts
```

### 2.1 型設計: 共有信号+モード別Progress+排他的電池state(v7から継続)

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
  overDischargeActive: boolean; // v7レビュー#5: 過放電経路が現在進行中か(下記3.1節)
  causeLog: D04CauseLog | null;
}

export interface D05Progress { triggered: boolean; triggeredAtT: number | null; sparkDurationS: number; causeLog: D05CauseLog | null; }

// D06: 反復状態(v7から継続)。toothLossCountは物理イベントの累積回数そのもの
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

`advanceDestructionState(prev, frame, config, dt) -> { state, events }`のシグネチャは不変。①`shared`→②`battery`→③その他モードの順に判定し、`events`は固定順序(D01→D02→[D03またはD04]→D05→D06→D07→D09)で並べる。

### 2.2 CauseLogと温度規約(v7レビュー#4対応、D03/D04を`uncalibratedGauge`化)

```ts
export type TemperatureReading =
  | { kind: 'measured'; temperatureC: number }   // Phase3では生成しない(将来の温度SI較正後)
  | { kind: 'uncalibratedGauge'; ratio: number }  // Phase3の既定
  | { kind: 'unavailable' };                       // 熱指標が存在しないモード(D01・D05・D06)

export interface CauseLogCommon {
  currentA: number;
  rpm: number;
  atT: number;
  temperature: TemperatureReading;
}

export interface D01CauseLog extends CauseLogCommon {} // unavailable
export interface D02CauseLog extends CauseLogCommon { coilHeatGaugeRatio: number; } // uncalibratedGauge、ratio===coilHeatGaugeRatio
export interface D03CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; }
// v7レビュー#4: D03のtemperatureもuncalibratedGauge(ratio===batteryHeatRatio)。
// batteryHeatは既存SimStateの0–1ゲージであり、無次元熱ゲージそのものであるため
export interface D04CauseLog extends CauseLogCommon {
  batteryHeatRatio: number; shortCircuitDurationS: number; stage: D04Progress['stage'];
  overDischargeRatio: number | null; // v7レビュー#5: 過放電経路が絡んだ場合の比率(3.1節)。短絡経路のみの発火ではnull
}
// D04のtemperatureも同様にuncalibratedGauge(ratio===batteryHeatRatio)
export interface D05CauseLog extends CauseLogCommon { sparkDurationS: number; } // unavailable
export interface D06CauseLog extends CauseLogCommon { loadTorqueNm: number; toothLossCount: number; } // unavailable
export interface D07CauseLog extends CauseLogCommon { magnetHeatGaugeRatio: number; } // uncalibratedGauge
export interface D09CauseLog extends CauseLogCommon { bearingHeatGaugeRatio: number; } // uncalibratedGauge
```

**テスト要件(v7レビュー#4)**: D02/D03/D04/D07/D09の`causeLog.temperature`が`{kind:'uncalibratedGauge'}`であり、かつ`temperature.ratio`がそのモード固有フィールド(`coilHeatGaugeRatio`等)と一致することを検証する。

### 2.3 D08の扱い(v7から継続、9節参照)

### 2.4 イベント契約: 物理イベントと図鑑候補の分離(v7レビュー#9対応)

```ts
export type DestructionEvent =
  | { mode: 'D01'; causeLog: D01CauseLog; physicsSnapshotAtT: SimState; isFirstThisSession: true } // D01は本質的にセッション内一度きり
  | { mode: 'D02'; causeLog: D02CauseLog; physicsSnapshotAtT: SimState; isFirstThisSession: true }
  | { mode: 'D03'; causeLog: D03CauseLog; physicsSnapshotAtT: SimState; isFirstThisSession: true }
  | { mode: 'D04'; causeLog: D04CauseLog; physicsSnapshotAtT: SimState; isFirstThisSession: true }
  | { mode: 'D05'; causeLog: D05CauseLog; physicsSnapshotAtT: SimState; isFirstThisSession: boolean } // 異常閾値超過は反復し得る(spec §7.1.1)
  | { mode: 'D06'; causeLog: D06CauseLog; physicsSnapshotAtT: SimState | VehicleSimState; isFirstThisSession: boolean } // 歯欠けは反復する
  | { mode: 'D07'; causeLog: D07CauseLog; physicsSnapshotAtT: SimState; isFirstThisSession: true } // 不可逆到達のみイベント化(可逆熱ダレはイベントを発行しない、3節)
  | { mode: 'D09'; causeLog: D09CauseLog; physicsSnapshotAtT: SimState | VehicleSimState; isFirstThisSession: true };
```

D05・D06は`isFirstThisSession`が`boolean`型(2回目以降は`false`)であるのに対し、その他のモードは常に`true`のみ取り得る(型上`true`固定にすることで、これらのモードが本質的に一度きりであることを表現する)。**`events`配列にはこのセッションで発生した全物理イベントを含める**(v7からの変更点、v7レビュー#9)。図鑑登録候補はstore側が`isFirstThisSession===true`のイベントのうち、さらに永続発見済み集合に含まれないものとして導出する(1.6節`AppliedRunResult.newlyDiscoveredModes`)。

`physicsSnapshotAtT`はcauseLogとは別に、そのstepの物理状態そのもの(`SimState`または`VehicleSimState`)を保持する(v7レビュー#2)。同一stepで複数モードが成立した場合、それらのイベントはすべて同一の`physicsSnapshotAtT`(そのstepの`next`値)を参照する(決定論、2.1節の固定順序と整合)。

汎用`severity`フィールドは持たない(v6から継続の設計)。`degradationApplication.ts`が各モード固有フィールドから型安全に劣化差分を導出する。

---

## 3. D01〜D09個別設計

spec §7.1.1の表(v7 3節から継続、変更点のみ再掲):

| ID | 物理トリガ | 発火後(セッション内) | 恒久劣化 | 図鑑登録条件 |
|---|---|---|---|---|
| D01 | `frame.coilCollapsedRisingEdge` | 実効巻数・占積が漸減、振動増。走行継続 | `RotorAssemblyState.collapsed=true`(サルベージのみ可) | 崩壊開始の初回 |
| D02 | 発煙: `coilHeatGaugeRatio>=config.d02.smokeGaugeThreshold`。発火: `>=config.d02.coilOverheatGaugeLimit` | 発煙: `R_coil`増で出力低下、走行継続。発火: 走行終了 | `RotorAssemblyState.burnedOut=true` | 発火到達の初回のみ |
| D03 | `shared.shortCircuitDurationS>=config.battery.shortCircuitDurationLimitS`かつ`batteryHeat>=BATTERY_HEAT_LIMIT`。非リポ限定 | 電源喪失で走行終了 | battery個体消滅 | 破裂の初回 |
| D04 | 短絡経路: D03と同型条件(しきい値は`config.battery.runawayHeatThreshold`)。**過放電経路(v7レビュー#5、下記3.1節)**: `energyUsedJ/energyBudgetJ >= config.battery.overDischargeUsedRatioThreshold`。リポ限定、いずれかで発火 | 膨張: 内部抵抗悪化。炎上到達: 走行終了+近接延焼判定(1.2節) | battery個体消滅+近接部位焼損 | 炎上到達の初回 |
| D05 | `sparkDurationS>=config.d05.brushSparkDurationLimitS`(閾値超過ごとに反復) | スパーク中は接触抵抗一時悪化、摩耗加速。走行継続 | brush摩耗量加算 | 異常強度/継続時間閾値超過ごとに物理イベント化。セッション内初回のみ図鑑候補 |
| D06 | `loadTorqueNm>config.d06.gearStrengthThresholdNm`(歯欠けごとに反復) | 歯欠けごとに伝達効率低下・トルクリップル増。全損で空転 | gear個体の`toothDamageFraction`加算(1.2節、D09と共通kind) | 歯欠けごとに物理イベント化。最初の1回のみ図鑑候補 |
| D07 | (i)可逆熱ダレ: 高温域しきい値超過 (ii)不可逆減磁: 使用上限超過 | (i)一時的なB低下、冷却で回復、走行継続、イベント非発行 (ii)恒久B低下、走行継続 | magnet個体の`demagnetizationFraction`加算(不可逆到達時のみ) | 不可逆域への初回到達のみ |
| D09 | `bearingHeatGaugeRatio>=config.d09.bearingSeizureGaugeLimit` | 焼付きで急減速・走行終了 | `BearingAssemblyState.seizureFraction`加算+gear個体の`toothDamageFraction`加算(1.2節) | 焼付きの初回 |

### 3.1 D04: 短絡経路と過放電経路(v7レビュー#5対応、実装対象へ復帰)

spec §7.1のD04トリガは「リポ×短絡/過放電」であり、短絡経路のみを実装しv7で過放電を将来枠へ送っていたのは仕様の未実装だった(v7レビュー#5「現行エネルギー/電圧モデルから過放電相当を得られるか棚卸しする」)。

**既存信号の棚卸し結果**: `trackPhysics.ts`の`VehicleSimState.energyUsedJ`(既存、累積消費エネルギー)と、同ファイル内の非export関数`computeEnergyBudgetJ(motorConfig)`(既存、`BATTERY_CAPACITY_J_1_5V`/`BATTERY_CAPACITY_J_3_0V`×`batteryCapacityRatio`)を組み合わせれば、`energyUsedJ / computeEnergyBudgetJ(motorConfig)`という「消費エネルギー比」を**新規物理式を発明せずに**過放電の代理指標として使える。この比が`config.battery.overDischargeUsedRatioThreshold`(新規較正値)を超えたら過放電経路が発火する。

**必要な最小限の凍結API拡張**: `computeEnergyBudgetJ`は現状`trackPhysics.ts`内の非exportローカル関数である。`destructionOrchestration.ts`から呼ぶには**export化(可視性の追加のみ、関数の実装・既存呼び出し元の挙動は無改修)**が必要になる。これは2.4節が禁じている「既存3関数のシグネチャ・戻り値契約の変更」には該当しない(呼び出し元ゼロの新規exportであり、既存テスト・既存呼び出し元への影響がない)が、念のため**この可視性変更自体の妥当性をFableへ確認する**(15節)。

**適用範囲の制約**: `energyUsedJ`は`VehicleSimState`のみに存在し、motor-only`SimState`には存在しない。したがって過放電経路はvehicle/track文脈でのみ判定可能であり、motor-onlyベンチ試験のD04は短絡経路のみで判定する(3.4節のD03/D04 motor-only未決事項と同型の制約)。`track.hasEnergyBudget`フラグの真偽に関わらず`energyUsedJ`自体は常に積算されているため(既存実装確認済み)、過放電経路の判定はどのコースでも可能である。

**D04Progress.overDischargeActive**(2.1節)は、過放電経路の条件(`overDischargeUsedRatioThreshold`超過)が現在成立しているかを保持する。短絡経路・過放電経路いずれか(または両方)が成立すれば`stage`遷移(膨張→発煙→炎上)を開始する。`D04CauseLog.overDischargeRatio`は発火時点でこの比が計算されていればその値、短絡経路のみでの発火なら`null`を記録する。

**テスト要件**: 短絡経路のみの正例/境界負例、過放電経路のみの正例/境界負例、両経路が同時に成立する場合の挙動(排他にするか併発を許容するかは、D04自体は既に1モードのため「同時成立」は単に発火条件を満たす経路が複数あるだけで、二重イベント化はしない——`D04Progress.triggered`が一度きりである以上、経路の組み合わせによらずイベントは1件)を個別にテストする。

### 3.2 D02: 発煙/発火境界とR_coilオーバーライド(v7から継続)

v7 3.1節の内容を維持する(発煙段階のR_coilオーバーライド機構、給電停止相当のオーバーライド案(a)/案(b))。

### 3.3 D06/D09: ギヤ損傷kindの共有と全損閾値(1.2節から継続)

`config.d06.totalToothCount`(全損判定較正値)、D09のギヤ側劣化は1.2節で確定した共通`toothDamageFraction`へ加算する。

### 3.4 D03/D04/D06: 素材family/ID非依存の設計(v7から継続)

`materialMapping.ts`が`battery.profile`+profile別較正値(過放電しきい値含む)、D06較正値(チタンは4.2節の`breakage:'nonBreakable'`プロファイル)を写像する。

---

## 4. destructionOrchestration.ts

### 4.1 既存3関数(変更なし、シグネチャ再掲、v7から継続)

```ts
export function step(config: MotorConfig, state: SimState, dt: number, rng?: Rng, loadTorque?: number, effectiveInertia?: number): SimState;
export function stepTestRun(motorConfig: MotorConfig, carConfig: CarConfig, state: VehicleSimState, dt: number, courseLengthM: number, rng?: Rng, slopeRad?: number): VehicleSimState;
export function stepTrackRun(motorConfig: MotorConfig, carConfig: CarConfig, track: ValidatedTrackDefinition, state: VehicleSimState, dt: number, rng?: Rng): VehicleSimState;
```

**本節で新たに必要になる可視性変更**: `trackPhysics.ts`の`computeEnergyBudgetJ`をexportする(3.1節)。既存3関数のシグネチャ自体は無改修のまま。

### 4.2 段階実装用config/完成版configの分離(v7レビュー#10対応)

```ts
// 段階実装中(P3-1〜P3-4の途中)のみ使う。未実装モードのグループがundefinedであることを
// 許容する。Phase3完成後のコードパスでは使わない
export interface DestructionConfigDraft {
  battery?: BatteryDestructionConfig; // P3-1時点ではnonLipoのshortCircuitDurationLimitSのみ埋まる
  d02?: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
  d05?: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06?: { gearStrengthThresholdNm: number; totalToothCount: number; breakage: GearBreakageProfile };
  d07?: { magnetHeatGaugeLimit: number; reversibleDroopThreshold: number };
  d09?: { bearingSeizureGaugeLimit: number };
}

// GearBreakageProfile: チタンの「非常に大きいしきい値」ハックを撤回し、
// 破損しないという事実そのものを構造化する(v7レビュー#10)
export type GearBreakageProfile =
  | { kind: 'breakable'; gearStrengthThresholdNm: number }
  | { kind: 'nonBreakable' }; // チタン。D06判定自体を常にfalseにする

// Phase3完成条件としての完成版config。全フィールド必須(D01は較正値を持たないため対象外)。
// composeConfigFromMaterials(またはP3-0の1.8節で確定する専用合成関数)の戻り値はこの型を
// 満たさなければならない。実行時validator(下記)が、DraftからConfigへの昇格時に全フィールド
// 充足を検証する
export interface DestructionConfig {
  battery: BatteryDestructionConfig; // 排他union、4.3節
  d02: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
  d05: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06: { totalToothCount: number; breakage: GearBreakageProfile };
  d07: { magnetHeatGaugeLimit: number; reversibleDroopThreshold: number };
  d09: { bearingSeizureGaugeLimit: number };
}

export type ValidateDestructionConfigResult = { ok: true; config: DestructionConfig } | { ok: false; missingFields: string[] };

// P3-4完了時点で、composeConfigFromMaterialsの出力がDestructionConfigDraftから
// DestructionConfigへ昇格できることを検証する(欠落フィールドがあれば明示的に失敗し、
// 「設定忘れを無言で無効化しない」というv7レビュー#10の要求を満たす)
export function validateDestructionConfig(draft: DestructionConfigDraft): ValidateDestructionConfigResult;
```

**D04の較正値**(`runawayHeatThreshold`・`overDischargeUsedRatioThreshold`・段階遷移時間)は`BatteryDestructionConfig`の`lipo`アームに属する(2.1節の`BatteryDestructionProgress`と対応、4.3節で再掲)。

### 4.3 電池config(排他union、v7から継続・過放電しきい値を追加)

```ts
export type BatteryDestructionConfig =
  | { profile: 'nonLipo'; shortCircuitDurationLimitS: number }
  | {
      profile: 'lipo';
      shortCircuitDurationLimitS: number;
      runawayHeatThreshold: number;
      overDischargeUsedRatioThreshold: number; // v7レビュー#5で追加
      stageDurations: { swellingS: number; smokingS: number }; // stage遷移時間(P3-2で較正)
    };
```

### 4.4 ラッパー関数とbuildRunOutcome(v7から継続、1.1節のbuildRunOutcomeを結合)

```ts
export interface DestructionStepResult<TPhysicsState> {
  physicsState: TPhysicsState;
  destructionState: DestructionState;
  destructionEvents: DestructionEvent[]; // このstepで新規発火した物理イベントのみ(累積はstore側)
}

function buildMotorOnlyFrameInput(config: MotorConfig, prev: SimState, next: SimState): DestructionFrameInput {
  const theoreticalCurrentA = computeElectricalState(config, prev.theta, prev.omega).current;
  return {
    currentA: next.current, theoreticalCurrentA, rpm: next.rpm, batteryHeat: next.batteryHeat,
    shorted: next.shorted, chatterFramesLeft: next.chatterFramesLeft,
    coilCollapsedRisingEdge: didCollapseJustHappen(prev, next),
    loadTorqueNm: undefined, energyUsedRatio: undefined, // motor-onlyではD06入力・過放電比のいずれも無し
  };
}

export function stepMotorWithDestruction(
  config: MotorConfig, motorState: SimState,
  destructionState: DestructionState, destructionConfig: DestructionConfig,
  dt: number, rng?: Rng, loadTorque?: number, effectiveInertia?: number,
): DestructionStepResult<SimState> {
  const physicsState = step(config, motorState, dt, rng, loadTorque, effectiveInertia);
  const frame = buildMotorOnlyFrameInput(config, motorState, physicsState);
  const { state, events } = advanceDestructionState(destructionState, frame, destructionConfig, dt);
  return { physicsState, destructionState: state, destructionEvents: events };
}

// vehicle/track版は引き続き契約骨格のみ(loadTorqueNmを含む専用frame builderはP3-4で確定、v7から継続)。
// energyUsedRatio(3.1節)は既存VehicleSimState.energyUsedJ/(export化したcomputeEnergyBudgetJの結果)
// から導出し、motor-only版と共通のDestructionFrameInput.energyUsedRatio?フィールドへ渡す
export function stepTestRunWithDestruction(/* v7から継続、frame構築の完全な実装はP3-2/P3-4で確定 */): DestructionStepResult<VehicleSimState>;
export function stepTrackRunWithDestruction(/* 同上 */): DestructionStepResult<VehicleSimState>;
```

`buildRunOutcome`は1.1節のとおり。store層の走行ループが、各`stepXxxWithDestruction`呼び出し後に`destructionEvents`を累積し、終了条件(既存`VehicleSimState.status`の非`'running'`遷移、またはUIからの`manualAbort`シグナル)を検出した時点で1回だけ呼ぶ。

### 4.5 状態の所有者・初期化・受け渡し・呼び出しタイミング(v7から継続)

不変。`createInitialDestructionState(batteryProfile)`・rng非消費・既存物理ステップ確定直後の呼び出し、いずれもv7から変更なし。

### 4.6 案1との比較(v7から継続)

v7 4.5節の比較表・所見(案2採用)を維持する。

---

## 5. 三段開示・イベント通知API(v7から継続、5.2節のみDestructionEvent型更新を反映)

5.1節(固定dt統一)・5.3節(段階2配置)はv7から不変。5.2節の`DestructionEvent`型定義は2.4節を参照する(`physicsSnapshotAtT`・`isFirstThisSession`を追加した最新版)。

---

## 6. 三段開示・段階1のHUD境界(v7から継続)

---

## 7. 図鑑・個体永続状態のstore層所有(1.3節・1.6節と整合するよう更新)

- **データスキーマ・純粋な変換関数**: `src/materials/`配下(alice所有)。`degradationApplication.ts`(2節)・`materialMapping.ts`(3.4節)
- **統合永続store(brabit所有)**: 1.3節の`PlayerInventory`拡張(rotorAssemblies/bodyParts/bearingAssemblies)+1.5節の`SaveEnvelopeMeta`+進捗+実験ノート+図鑑発見済み集合を単一store・単一persist keyで保持する。`applyRunOutcome`(1.6節)がこのstoreの唯一の書き込み経路となる
- 個体・アセンブリID発行はbrabit所有store側で行う
- 既存`gameStore.ts`(`v15:progress`)・`notebookStore.ts`(`v15:notebook`)・`shopEconomyStore.ts`(非永続)からの移行はbrabit_mot3との協議・P3-0実装計画で確定する

---

## 8. 決定論境界の保証構造(v7から継続)

engineの純関数は明示的引数のみから出力を計算する。`composeConfigFromMaterials`は`src/materials/`所属でengineの純関数ではない。図鑑発見状態からの独立(v7から継続)。

---

## 9. D08のPhase割当の追認(v7から継続、13節のDoD任意化と整合)

spec §7.1・§12がD08をPhase5と確定済み。engineのDestructionState・DestructionModeIdに含めない。**図鑑UIの予約枠(`FailureCodexModeId`)自体もPhase3の必須実装ではない**(v7レビュー#13「D08予約枠はPhase3の必須実装ではない。入れるならP3-4 UI DoDへ明示し、入れない選択肢も許容する」)。UI側で予約枠を出す場合は「Phase5で実装予定」という開発工程文言をゲーム画面に出さないことをUI計画v4の要件とする(v7レビュー#17、本書スコープ外だが依存関係として明記)。

---

## 10. Phase2繰越事項の採否・順序(v7から継続、bodyの扱いを更新)

- ブラシパッケージ・ギヤJ/D06: v7から不変
- brushはD05実装で接続。bodyはD04延焼(1.2節`BodyPartState`)により接続。coating/substrate/rollerは引き続きスコープ外
- bearingは実在素材ファミリーとしてカタログ化しない(1.2節、将来枠)
- store層個体ID・永続化の所有: 1.3節・7節で確定

---

## 11. art-specにない独自解釈しない事項(v7から継続)

D04近接延焼の対象部位(1.2節)はart-spec/spec双方に明記が無いため、独自解釈せずFableへ確認する(1.2節に記載済み)。

---

## 12. ステップ分割案(P3-0〜P3-4、store/UI統合を各ゲートへ組み込み)

各ゲートの手順(不変): **実装前ステップ計画→Suu_mot3レビュー→Fableレビュー→人間承認→実装→`npm run test && npm run build && npm run lint`→報告**。commitは人間承認後のみ。

### P3-0: クロスレイヤ契約(型凍結ゲート)+ドキュメント同期

1節の全型(`RunOutcome`・`DegradationDiff`・`RunSnapshot`・`AppliedRunResult`・1.2節の3アセンブリ・4.2節のDraft/完成版config)を確定する。1.6節の`applyRunOutcome`+統合save envelope(7節)の**実装骨格**(空のRunOutcomeでも原子的に適用できることのテストを含む)までをこのゲートで完成させる(v7レビュー#13「P3-0で単一save envelope・原子的適用の実装骨格まで完成」)。

- **サブステップ(v7レビュー#18)**: v8承認後・実装着手前に、`AGENTS.md`/`CLAUDE.md`のPhase3記述(Phase2完了・D08=Phase5・D10=Phase4・P3-0のstore境界)を同期更新する。`cmp AGENTS.md CLAUDE.md`が差分なしであることをDoDへ含める
- **ゲート事項(Fableへ諮る、15節)**: 1.2節の3アセンブリ案・D06/D09ギヤ損傷kind統合・D04近接延焼ロール暫定案、1.5節のrunSequence方式、4.2節のDraft/完成版config分離
- **DoD**: 型定義+ダミーRunOutcomeの原子的適用の単体テスト、runSequence冪等性テスト、既存v15スキーマからの移行冪等性テスト

### P3-1: 契約の最小実証(D01/D03、非リポ経路)+store統合

`destructionModes.ts`+`destructionOrchestration.ts`(`stepMotorWithDestruction`)+D01+D03を実装する。**P3-0で確定したapplyRunOutcomeへ実際にD01/D03のRunOutcomeを流し込み、rotorAssemblies/battery個体への反映まで統合テストする**(v7レビュー#13、store統合をP3-4まで先送りしない)。

- **テスト網羅**: 発火境界・一度きり・ログ固定・dt分割不変性・相互非干渉・`events`固定順序・**`physicsSnapshotAtT`の同一step一致**・**手動中断(`manualAbort`)時も途中までのdegradationDiffsが確定反映されること**(v7レビュー#12)

### P3-2: D04(リポ経路、短絡+過放電)+D07(三段開示骨格)+store統合

D04の`stage`遷移+短絡/過放電2経路(3.1節)+`stepTestRunWithDestruction`を実装。D07を三概念で実装し三段開示段階1・2の骨格を実装する。`computeEnergyBudgetJ`のexport化(4.1節)をこのゲートで行う。

- **ゲート事項**: 過放電しきい値較正、`computeEnergyBudgetJ`export化の妥当性、段階遷移時間・内部抵抗悪化オーバーライドの具体式
- **store統合**: D04の近接延焼(bodyPartsまたはmagnet個体)・D07の不可逆減磁(magnet個体)への反映を統合テストする

### P3-3: D02(コイル焼損)+D05(ブラシ火花)+store統合

D02の発煙→発火(R_coilオーバーライド)+D05(反復物理/初回登録分離、`theoreticalCurrentA`活用)を実装する。

- **store統合**: D02のrotorAssemblies.burnedOut反映、D05のbrush個体wearFraction加算(反復イベントぶんの累積)を統合テストする

### P3-4: D06(ギヤ歯欠け)+D09(軸受焼付き)+Phase3完成ゲート

D06の反復状態(全物理イベントをevents化)+ギヤJ増接続+D09(必須実装)を実装し、`stepTrackRunWithDestruction`のframe構築(4.1節未確定点)を確定する。**本ゲートをPhase3完成の最終ゲートとする**(v7レビュー#13「P3-4のDoDに図鑑・リプレイ・計測器・UI/演出・全契約マトリクスを含める」):

- D08型・図鑑予約枠(9節、任意)
- 統合永続storeの最終実装完了(7節)
- 計測器店UI接続(brabit、三段開示段階3)
- 13節の破壊契約マトリクス全項目の自動検証
- 横/縦画面+キーボード/タッチの人間試遊

---

## 13. DoD・テスト方針(spec §12「破壊契約マトリクス」+v7レビュー反映)

- 正例/閾値直前の境界負例/同一シード・同一WearStateでイベント列一致/**1物理イベント=1`events`要素、図鑑候補は`isFirstThisSession`+永続発見済み集合の突き合わせで別途導出**(v7レビュー#9)/発火後物理が次stepから現れる/正しい装備個体・アセンブリだけへ劣化差分が適用される/原子的store反映(部分適用が起きないこと)/**runSequenceの二重適用防止**(v7レビュー#11)/図鑑初回性と二重報酬防止/検死ログ固定/**`physicsSnapshotAtT`を含むリプレイスナップショットからの完全一致**(v7レビュー#2・#3)/**`manualAbort`を含む全終了経路での劣化確定**(v7レビュー#12)/UIが独自の破壊判定を持たない/横・縦画面+キーボード/タッチの人間試遊
- 既存DoD(`npm run test && npm run build && npm run lint`)は不変
- D08はengine/DoD対象外のまま。図鑑予約枠はPhase3必須ではない(9節)
- D09は必須実装対象のため例外なし
- `AGENTS.md`/`CLAUDE.md`の同期(`cmp`差分なし)をP3-0のDoDに含める(v7レビュー#18)

## 14. UI計画(v3→v4)への申し送り(本書スコープ外、brabit_mot3の担当)

v7レビュー#14〜#17はUI計画(`docs/phase3-ui-autopsy-plan.md`)への指摘であり、本書(engine計画)のスコープ外である。ただしengine契約(本書)との依存関係として明記する:

- UIは走行終了境界で`applyRunOutcome`(1.6節)を**画面遷移操作(「検死レポートへ」ボタン等)に依存せず**直ちに1回呼ぶこと。ボタン押下前のreload/離脱で結果が消える設計は本書の原子性契約(1.6節)と矛盾する
- UIの終端/非終端分類は本書2.1節の`stage`/`triggered`フィールドとRunOutcome.endReasonから導出し、UI独自の閾値・独自条件を持たないこと
- 一走行で複数モードを発見した場合、`RunOutcome.events`(複数件あり得る)から発見一覧を表示できる導線を用意すること
- 正典ファイル名は`docs/spec.md`・`docs/art-spec.md`(差し替え後の実体)を参照すること。`docs/spec_1.md`・`docs/art-spec-r2.md`は差分確認用の控えであり参照先ではない
- D08予約枠を出す場合、「Phase5で実装予定」等の開発工程文言をゲーム画面へ出さない(世界観内の文言は別途人間承認)

## 15. Fableへの重点確認事項

- **P3-0(最重点)**: 1.2節の3アセンブリスキーマ案(RotorAssemblyState/BodyPartState/BearingAssemblyState)、D06/D09ギヤ損傷kind統合の採否、D04近接延焼ロール暫定案(body+magnet)、1.5節のrunSequence方式、4.2節のDraft/完成版config分離+`validateDestructionConfig`設計
- 1.1節: `buildRunOutcome`をengine側純関数として設計する妥当性、`AppliedRunResult`の型設計
- 1.4節: `RunSnapshot`(旧`finalSnapshot`)の自己完結化設計(track定義本体を埋め込む方式)
- 2.2節: D03/D04を`uncalibratedGauge`化したことの妥当性
- 2.4節: `physicsSnapshotAtT`+`isFirstThisSession`によるイベント/図鑑候補分離の設計
- 3.1節: D04過放電経路の設計(`energyUsedJ`/`computeEnergyBudgetJ`再利用)、`computeEnergyBudgetJ`のexport化の妥当性
- 4.6節: 既存API無改修の加算的ラッパー案(案2)の採否(v6から継続)
- その他、v7から継続する未決事項(D02のR_coilオーバーライド、給電停止機構案a/b、D03/D04のmotor-only扱い等)

Fableの回答は要約せず全文でSuu_mot3経由で中継してもらう。実装・commitはFableレビュー・人間承認まで引き続き未着手のまま維持する。

---

## 16. 改訂履歴

v1〜v6の差分表は`docs/phase3-plan-v6.md`16節に、v6→v7の差分表は`docs/phase3-plan-v7.md`16節に保持済み。本節はv7→v8の差分のみを追加する(0節の対応サマリ表と重複するため、ここでは簡潔な一覧のみ示す)。

### v7→v8(Suu_mot3レビュー18項目)

RunOutcome生成者のengine統一/破壊時物理スナップショット追加/replaySnapshot改名・自己完結化/D03・D04温度のuncalibratedGauge化/D04過放電経路の実装対象復帰/D04近接延焼ロール拡張/rotor・body・bearingの架空素材化撤回とアセンブリスキーマへの変更/D06・D09ギヤ損傷kind統合/D06反復イベントのevents列復帰/段階実装用Draft configと完成版config分離/runSequenceによる有限な冪等性契約/manualAbort追加/store・UI統合をP3-0〜P3-4各ゲートへ組み込み/AGENTS.md・CLAUDE.md同期更新のP3-0サブステップ化。詳細は0節の対応サマリ表を参照。UI計画側の指摘(#14〜#17)は14節へ申し送り。
