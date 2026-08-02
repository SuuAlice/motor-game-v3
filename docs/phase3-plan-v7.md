# Phase 3統合計画(破壊モード+図鑑)— v7改訂版(spec r2対応・P3-0〜P3-4再編)

作成: alice_mot3 2026-08-02。**状態: Suuレビュー前・Fable未提出・実装/commit未着手。**

本書は`docs/phase3-plan-v6.md`を、正典差し替え(`docs/spec.md`・`docs/art-spec.md`がr2へ更新)後のSuu_mot3レビュー(2026-08-01T17:35、18項目、以下「r2レビュー」)に基づき改訂したものである。**v6をこの文書で置き換える。v6は履歴として保持する(削除しない)。**

**改訂の性質(v6までとの違い)**: v6までの改訂は「未決事項をどう設計してFableへ諮るか」が主な作業だったが、spec r2(§7.1.1・§7.4・§7.5・§12・§5.1・§13)がPhase3の契約を仕様として確定させたため、v6で「Fableへ諮る」としていた複数の論点(D03/D04の排他性、温度規約、D09の要否、発火後の物理挙動、結果反映の原子性)はもはや設計選択ではなく**正典の要求を実装する問題**になった。v7ではこれらを正典原文どおりに固定し、Fableへは「正典内で未確定の物理式・較正根拠・凍結APIへの接続妥当性」だけを諮る(r2レビュー「v7の構成条件」)。

対象: `docs/spec.md`(r2)§5・§7・§12・§13。docs/spec.mdを唯一の正とする。CLAUDE.md(b)(c)拡張点。

**本書の作成にあたり実際に読んだもの**: `docs/spec.md` §5.1・§5.2・§5.3・§7.1・§7.1.1・§7.2・§7.3・§7.4・§7.5・§12・§13(該当箇所全文)、`src/materials/inventoryItem.ts`(現行`WearState`/`InventoryItem`スキーマ)、`src/materials/materials.ts`(現行9ファミリー: wire/magnet/gear/brush/battery/coating/substrate/roller/body。**bearing(軸受)ファミリーは存在しない**)、`src/store/gameStore.ts`(persist key `v15:progress`、`partializeGameStorePersistedState`)、`src/store/notebookStore.ts`(persist key `v15:notebook`)、`src/store/shopEconomyStore.ts`(**意図的に永続化なし**、Phase2仮store)。v6同様、既存の凍結APIを実際に確認した上で設計する方針を継続する。

---

## 0. spec r2による変更点サマリ

| 論点 | v6での扱い | spec r2での確定内容 | 対応 |
|---|---|---|---|
| D03/D04の同時発火 | 3ケースに分離しFableへ諮る(v6 3.1節) | §7.1.1: D03は非リポ系専用、D04はリポ専用。**構造的に排他**(「D03と排他——同一原因での二重報酬を構造的に禁止」) | P3-0で排他union型として固定。Fable未決事項から削除(下記2節) |
| 温度規約(案A/B) | Fableへ諮る(v6 2.2節・3.2節) | §7.4: 0〜1無次元ゲージを正式採用。℃換算・表示禁止。「温度モデル未較正」明示。破壊モード完成と温度診断完成をゲート分離 | 案Aで確定。案Bは削除。`TemperatureReading`型を「未計測」と「未較正ゲージ値」の2状態に拡張(下記2.2節) |
| D09の要否 | Step6を独立設計・採否ゲートとする(v6 3.3節) | §7.1.1でD09の発火後物理・劣化差分が確定記載。**Phase3対象として確定**(見送りオプションは正典上存在しない) | 必須実装対象へ変更。「見送り時の人間スコープ例外」記述を削除 |
| D01/D02/D04/D06/D07/D09の発火後物理 | 「Fableへ諮る」設計候補として提示(v6 2.5節) | §7.1.1が表形式でモードごとに確定記載(継続/終端・次stepの物理量・恒久劣化・図鑑登録条件・競合規則) | 正典の表をそのまま3節・4節へ反映。物理モデルの選択自体はもはや論点ではない(具体的な式・較正値のみ各ステップで確定) |
| DestructionEvent→WearState変換の所在 | `src/materials/wearAccumulation.ts`(v6 4節・5.2節) | §7.5: 「アイテムへ適用すべき劣化差分」はエンジン出力そのもの。エンジンは実個体ID・在庫を知らない | `RunOutcome.degradationDiffs`をengine契約へ格上げ(下記1節)。`wearAccumulation.ts`はこの差分をInventoryItemへ適用するstore側ヘルパーへ役割変更 |
| store境界・原子性 | v6 Step8で図鑑store設計に初めて言及 | §7.5: P3-0で個体ID・永続化・セーブスキーマ・原子的結果反映を最初に確定 | **P3-0を新設し最初のゲートに置く**(1節) |
| D08の扱い | 「人間スコープ例外承認」を得る手続きとして記述(v6 0節・9節) | §7.1・§12でPhase5と明記済みの確定事項。追加承認不要 | 9節を「例外」から「正典のPhase割当の追認」へ書き換え |
| ステップ分割 | Step1〜9(直線的、v6 12節) | r2レビュー「v7の構成条件」: P3-0〜P3-4の小ゲートへ再編 | 12節を全面再編(下記12節) |

---

## 1. P3-0: クロスレイヤ契約(新設、最初の独立ゲート)

spec §7.5・§12「store境界(§7.5)の個体ID・永続化・セーブスキーマ・原子的結果反映をP3-0で確定」に従い、D01〜D09いずれの実装よりも先に本ゲートを置く。後続のP3-1〜P3-4はここで確定した型を変更しない(r2レビュー「v7の構成条件」)。

### 1.1 エンジン出力契約: `RunOutcome`

spec §7.5「エンジンが出力するもの: 破壊状態、破壊イベント列(シミュレーション時刻付き)、破壊時の物理スナップショット、走行終了時のRunOutcome、アイテムへ適用すべき劣化差分」に従い、1走行の結果を単一の型にまとめる。

```ts
export interface RunOutcome {
  endReason: 'finished' | 'stalled' | 'derailed' | 'energyExhausted' | 'destructionTerminal';
  // 'destructionTerminal'は3節表で「終端」性質を持つモード(D02発火到達・D03・D04炎上・D09焼付き)
  // が走行を終了させた場合。それ以外の既存終了理由(vehiclePhysics.ts既存のstatus)はそのまま踏襲する
  terminalMode?: DestructionModeId; // endReason==='destructionTerminal'のときのみ設定
  events: DestructionEvent[]; // この走行で発生した全イベント(発生順、時刻付き)
  destructionState: DestructionState; // 走行終了時点の状態(検死ログ・デバッグ用)
  degradationDiffs: DegradationDiff[]; // 個体へ適用すべき劣化差分(下記1.2節)
  finalSnapshot: RunSnapshot; // リプレイ用(下記1.4節)
}
```

`RunOutcome`はengineの出力であり、**engineは実個体ID・在庫・所持金・図鑑発見状態を一切参照しない**(spec §7.5「エンジンはこれ以外を知らない」)。`destructionOrchestration.ts`の各`stepXxxWithDestruction`ラッパー(v6 2.4.2節から引き続き使用)が毎step呼ばれ、走行終了を検出した時点でstore層が`RunOutcome`を組み立てる(積算された`events`・最終`destructionState`・走行開始時に確定した`finalSnapshot`から)。

### 1.2 劣化差分契約: `DegradationDiff`(役割ベース、個体ID非依存)

spec §7.5「エンジンは部位ロール別の決定論的な劣化差分を返す」「storeが走行開始時の装備スナップショットを使って実個体IDへ解決する」に従い、engineは実IDではなく**装備スロット/部位ロール**で劣化対象を指す。

```ts
export type EquipmentRole = 'rotor' | 'battery' | 'gear' | 'brush' | 'magnet' | 'bearing' | 'body';

export type DegradationDiff =
  | { role: 'magnet'; kind: 'demagnetization'; deltaFraction: number } // D07(不可逆域到達時のみ。可逆熱ダレは差分を生成しない、3節)
  | { role: 'gear'; kind: 'toothDamage'; deltaTeeth: number } // D06(歯欠け1回につき1件)
  | { role: 'brush'; kind: 'wear'; deltaFraction: number } // D05
  | { role: 'rotor'; kind: 'collapse' } // D01恒久結果(spec §7.1.1「ローター個体(線材)損壊。サルベージのみ可」、全損の1件)
  | { role: 'rotor'; kind: 'burnout' } // D02恒久結果(「線材焼損(個体損壊)」、全損の1件。rotorをkindで区別)
  | { role: 'battery'; kind: 'consumed' } // D03/D04共通(「電池個体消滅」、全損の1件)
  | { role: 'body'; kind: 'scorch'; deltaFraction: number } // D04延焼(「ボディ・近接パーツへの延焼判定と焼損差分」)
  | { role: 'bearing'; kind: 'seizure' }; // D09(「軸受け・ギヤ個体の劣化」のうち軸受側、全損の1件)
```

D09の「軸受け・**ギヤ**個体の劣化」(spec §7.1.1)のうちギヤ側は既存の`{ role: 'gear'; kind: 'toothDamage' }`を再利用する(D06と同じ劣化経路を共有してよいか、専用の`kind`を分けるかはP3-4で確定、14節)。

**未解決のスキーマ差分(本節の核心的な未決事項)**: 上表の`rotor`(D01/D02)・`body`(D04)・`bearing`(D09)は、**現行`src/materials/inventoryItem.ts`の`WearState`/`InventoryItem`にkindとして存在しない**(現行は`magnet`/`gear`/`brush`/`battery`の4種のみ)。`src/materials/materials.ts`にも`bearing`ファミリーは存在しない(現行9ファミリー: wire/magnet/gear/brush/battery/coating/substrate/roller/body。bodyファミリー自体はカタログに存在するが個体劣化スキーマには未接続)。さらにrotor(ローターの巻線組立物)は、CLAUDE.mdのフェーズ表でPhase4「巻線記録方式一式」に個体化が予定されている概念であり、Phase3時点では未存在である。

この差分をP3-0で解決する必要がある。3案を提示する。

- **案A(推奨)**: Phase3では`rotor`/`body`/`bearing`を、既存の実在素材カタログ(materials.ts)に接続しない**軽量な損壊追跡専用の個体**として`InventoryItem`へ追加する(例: `{ family: 'rotor'; wearState: { kind: 'rotor'; collapsed: boolean } }`のような、実在素材の物性値を持たない最小スキーマ)。Phase4の巻線記録方式が導入された時点で、rotorスキーマを本格版へ置き換える(bodyの実在素材接続はPhase3のスコープ外のまま10節の未接続ファミリー整理に従う。bearingは今後実在軸受材(ステンレス鋼球等)のカタログ化をPhase5以降で検討する将来課題として残す)。
- **案B**: D01/D02/D04/D09の恒久劣化を、既存の`gear`ないし`magnet`個体へ間借りさせる(専用スキーマを作らない)。実装コストは低いが、「ローターが壊れたのにギヤの劣化度が上がる」ような意味論的な不整合を生み、CLAUDE.mdの物理的誠実性の規律に反する。**不採用推奨**。
- **案C**: rotor/body/bearingが未実装である間、D01/D02/D04/D09の恒久劣化反映自体をPhase3のDoDから個別に除外する。spec §7.1.1は「Phase3裁定」として発火後物理を明記しているため、恒久劣化を省略するとspec要件の黙った省略になる(r2レビュー#8「正典要件を黙って省略しない」に抵触)。**不採用推奨**。

alice所見は案A。**採否・具体的スキーマはFableへ確認する**(12節P3-0ゲート事項、15節)。

### 1.3 store所有・永続化・原子性

spec §7.5「storeが所有するもの: 安定した個体ID、アイテムの恒久劣化、図鑑の発見済み状態、計測器の所有状態、所持金と在庫、セーブスキーマの版、適用済み走行ID」「原子的反映と冪等性: 走行結果は単一トランザクションとして(1)個体劣化の適用(2)破壊・消費(3)図鑑初回登録(4)初回報酬(5)実験ノート記録をまとめて反映する。全部反映されるか、全部反映されないかのいずれかであること」に従う。

**現状の永続化境界(実装確認済み)**:
- `gameStore.ts`: persist key `v15:progress`。`diagnosisProgress`・`courseProgress`・`selectedTrackId`・`testRunCompleted`・`config`・`carConfig`・`garageSelection`のみ(`partializeGameStorePersistedState`)。所持金・在庫・図鑑は含まない
- `notebookStore.ts`: persist key `v15:notebook`。実験ノート(`ExperimentSession[]`)のみ
- `shopEconomyStore.ts`: **意図的に`persist`を使わない**(Phase2仮store、コメントに明記済み)。所持金・在庫は現状ページ再読み込みで初期フィクスチャへ戻る

**原子性の設計上の含意**: spec §7.5の5操作のうち(1)(2)(3)(4)は現状どこにも永続化されていない(shopEconomyStoreが非永続のため)。(5)実験ノート記録は`notebookStore`の別キーに永続化されている。**3つの独立したlocalStorageキーへ跨って原子性を作ることは、単純に複数の`persist`ミドルウェアの`set`を連続実行する方式では実現できない**(r2レビュー#2の指摘どおり。クラッシュ・タブクローズが2つの`setItem`の間で起きれば整合しない状態を作れる)。

`localStorage.setItem`は単一キーへの書き込みとしては(ブラウザ実装上)原子的である。この性質を利用し、**5操作すべてを単一のZustand store・単一のpersist keyへ統合し、`RunOutcome`の適用を単一の`set()`呼び出し(→単一の`setItem`)で完結させる**設計を推奨する。

- **案A(推奨)**: `gameStore.ts`の進捗系・`notebookStore.ts`の実験ノート・新設の在庫/経済/図鑑スライスを、単一の新persist key(例: `v16:save`。スキーマ変更を伴うため`v15:`から版を上げる)へ統合する。既存の`v15:progress`/`v15:notebook`からの移行読み込みパスをP3-0実装時に用意する。`applyRunOutcome(outcome: RunOutcome, runId: string)`のような単一関数が、1回の`set((s) => {...5操作をすべて計算した新state...})`ですべてを適用する
- **案B**: 3ストアを分離したまま維持し、書き込み前にすべての新state(3ストア分)を計算してから、`Promise.all`等で3つの`setItem`をできる限り近いタイミングで発行する。ただし複数`setItem`である以上、真の原子性(spec要求の「全部反映されるか、全部反映されないか」)は保証できず、クラッシュ整合性の証明が必要になる(r2レビュー#2「同等のクラッシュ整合性を証明できる方式」)。**証明の難度が高く不採用推奨**

alice所見は案A。**store層の最終設計はbrabit_mot3との協議事項**(7節)。**方式の採否自体をFableへ確認する**(12節P3-0ゲート事項、15節)。

**`runId`と二重適用防止**: 各走行に一意な`runId`を発行する(発行者はstore層、UUIDまたは連番+セッション識別子)。統合後のstore(案A採用時)は「適用済み`runId`の集合」を永続状態として持ち、`applyRunOutcome`は同一`runId`の再適用を構造的に拒否する(冪等性、spec §7.5「同一runIdの二重適用を禁止」)。

### 1.4 リプレイスナップショット契約

spec §7.5「リプレイは保存済みスナップショット+シードのみから再現し、現在の在庫状態を参照しない」に従う。v6の`createInitialDestructionState()`だけを初期状態とする設計は不十分(r2レビュー#14)。

```ts
export interface RunSnapshot {
  motorConfig: MotorConfig;       // 走行開始時点の実効config(composeConfigFromMaterials適用後)
  carConfig: CarConfig;           // 同上
  destructionConfig: DestructionConfig; // 同上(2.4.2節、v6から継続)
  initialMotorState: SimState;    // 走行開始時の物理初期状態
  initialVehicleState: VehicleSimState | null; // motor-onlyの場合null
  trackId: string | null;         // track/走行条件(motor-onlyの場合null)
  seed: number;                   // rng初期化シード
  initialDestructionState: DestructionState; // createInitialDestructionState()の値(通常は初期値固定だが型として保持)
}
```

`RunOutcome.finalSnapshot`は実際には**走行開始時点**のスナップショットを保持する(命名注意: 「リプレイに必要な情報」という意味で`finalSnapshot`という名は誤解を招くため、実装時に`replaySnapshot`等へ改名を検討する。v7時点では意図を明記するに留める)。リプレイは`RunSnapshot`+`seed`だけから同一の`events`・同一の破壊時刻を再現できることをP3-0のDoDで検証する(在庫変更後に再生しても結果が変わらないことを含む、r2レビュー#14)。

### 1.5 engineの個体ID非依存性の維持

engineのどのモジュール(`destructionModes.ts`・`destructionOrchestration.ts`)も、`InventoryItem.itemId`・所持金・図鑑発見状態を型としても値としても参照しない。これは1節冒頭の契約そのものであり、既存の「engineはlocalStorage/Zustandを直接参照しない」という8節の決定論境界(v6から継続)の自然な拡張である。

---

## 2. モジュール構成と状態機械設計

```
src/engine/destructionModes.ts          # 新規。D01〜D07・D09の状態機械(純関数)。motorPhysics.ts等への依存なし(leafモジュール)
src/engine/destructionOrchestration.ts  # 新規。motorPhysics/vehiclePhysics/trackPhysicsとdestructionModesを結合する加算的ラッパーのみをexport(4節)
src/engine/__tests__/destructionModes.test.ts
src/engine/__tests__/destructionOrchestration.test.ts
src/materials/degradationApplication.ts # 新規(v6のwearAccumulation.tsから役割変更)。RunOutcome.degradationDiffsを
                                         # 実個体ID(走行開始時スナップショットで解決済み)のInventoryItemへ適用する
                                         # 純関数。engineに依存しない(1.2節)
src/materials/__tests__/degradationApplication.test.ts
```

`destructionModes.ts`を`motorPhysics.ts`と同じ「leafモジュール」に保つ方針は不変。3節の状態機械はmotorPhysics.ts由来の値を**引数として**受け取るだけで、motorPhysics.ts/vehiclePhysics.ts/trackPhysics.tsをimportしない。vehicle層・track層との結合は`destructionOrchestration.ts`が担う(4節)。

### 2.1 型設計: 共有信号+モード別Progress+排他的電池state

v6の`D03Progress`/`D04Progress`はそれぞれ独立した`optional`グループとして共存できたが、spec §7.1.1「D04はリポ専用。D03と排他」に従い、**同一個体で両方が有効になり得ない**ことを型で表現する。電池側だけ判別unionとし、それ以外のモードはv6と同型の明示名付きProgressを維持する。

```ts
export type DestructionModeId =
  | 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D09';
// D08はここに含めない(9節)

export interface DestructionSharedSignals {
  shortCircuitDurationS: number; // 短絡継続秒数。D03/D04系が参照する積分(3.1節)
  elapsedTimeS: number;          // セッション内経過秒数。causeLog.atTの唯一の出典
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
  triggered: boolean;      // 「発火到達」(3節、終端)。発煙段階に入っただけではtrueにしない(spec §7.1.1)
  triggeredAtT: number | null;
  coilHeatGaugeRatio: number; // 0–1、無次元(3.2節)。発煙段階の進行度でもある
  causeLog: D02CauseLog | null;
}

// D03/D04: 排他的判別union(spec §7.1.1「D04はリポ専用。D03と排他」)。
// 写像層(materialMapping.ts)が電池素材から'lipo'か'nonLipo'かを一意に決め、
// DestructionConfig(4.2節)へ渡す。engineは判別されたプロファイルだけを見る
export type BatteryDestructionProgress =
  | { profile: 'nonLipo'; d03: D03Progress }
  | { profile: 'lipo'; d04: D04Progress };

export interface D03Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  causeLog: D03CauseLog | null;
}

export interface D04Progress {
  triggered: boolean; // 「炎上到達」(3節、終端)
  triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning'; // spec §7.1.1「膨張→発煙→炎上」
  stageEnteredAtT: number | null;
  causeLog: D04CauseLog | null;
}

export interface D05Progress {
  triggered: boolean; // 「異常強度または継続時間の閾値超」の初回(spec §7.1.1)
  triggeredAtT: number | null;
  sparkDurationS: number;
  causeLog: D05CauseLog | null;
}

// D06: 歯単位の反復状態(spec §7.1.1「反復イベント(歯単位)」、r2レビュー#10対応)。
// v6の単一triggered:booleanでは反復を表現できなかった
export interface D06Progress {
  toothLossCount: number;       // 歯欠け累積数(0から増加)。全損閾値はconfigで確定(4.2節)
  firstLossAtT: number | null;  // 図鑑初回登録は最初の歯欠け(spec §7.1.1)
  causeLog: D06CauseLog | null; // 直近の歯欠けイベントのログ(検死ログは初回分を保持、下記2.2節)
}

// D07: 三概念分離(spec §7.1.1、r2レビュー#11対応)。可逆熱ダレは登録なしの一時状態、
// 不可逆減磁は恒久差分を伴う初回登録イベント
export interface D07Progress {
  magnetHeatGaugeRatio: number;     // 0–1、無次元。熱ゲージそのもの(常時更新)
  reversibleDroopActive: boolean;   // 可逆熱ダレが現在進行中か(高温域でBが一時低下)。図鑑登録なし
  irreversibleTriggered: boolean;   // 不可逆減磁への初回到達(図鑑登録対象)
  irreversibleTriggeredAtT: number | null;
  causeLog: D07CauseLog | null;     // 不可逆減磁到達時のみ記録
}

export interface D09Progress {
  triggered: boolean; // 「焼付き」の初回(終端)
  triggeredAtT: number | null;
  bearingHeatGaugeRatio: number;
  causeLog: D09CauseLog | null;
}

export interface DestructionState {
  shared: DestructionSharedSignals;
  battery: BatteryDestructionProgress; // D03/D04(排他)
  modes: {
    D01: D01Progress; D02: D02Progress; D05: D05Progress;
    D06: D06Progress; D07: D07Progress; D09: D09Progress;
  };
}

export function createInitialDestructionState(batteryProfile: 'lipo' | 'nonLipo'): DestructionState {
  return {
    shared: createInitialSharedSignals(),
    battery: batteryProfile === 'lipo'
      ? { profile: 'lipo', d04: { triggered: false, triggeredAtT: null, stage: 'none', stageEnteredAtT: null, causeLog: null } }
      : { profile: 'nonLipo', d03: { triggered: false, triggeredAtT: null, causeLog: null } },
    modes: { /* 全モード初期値 */ },
  };
}
```

`createInitialDestructionState`が`batteryProfile`を引数に取るようになった点が、v6からの構造上の変更点である(v6は電池プロファイルを知らない設計だった)。`batteryProfile`はセッション開始時に一度だけ写像層が決定し(3.4節)、以後セッション中は不変(装備を変えるにはセッションを再開する必要があり、これは既存のセッション開始時一括写像の規律と整合する)。

`advanceDestructionState(prev, frame, config, dt) -> { state, events }`のシグネチャ自体は変わらない。内部で①`shared`を先に更新→②`battery`(判別された方のみ)→③その他モードの順に判定する。`events`は固定順序(D01→D02→[D03またはD04]→D05→D06→D07→D09)で並べる(決定論、v6から継続)。

### 2.2 CauseLogと温度規約の拡張(spec §7.4対応)

spec §7.4「内部の熱状態は0〜1の無次元ゲージとして保持してよい」「ゲージを℃として表示することを禁止する。SI較正のない温度は、検死ログ・ノート上で『温度モデル未較正』と明示する」に従い、v6の`TemperatureReading`(`measured | unavailable`の2状態)を3状態へ拡張する(r2レビュー#5)。

```ts
export type TemperatureReading =
  | { kind: 'measured'; temperatureC: number } // 将来の温度SI較正完了後にのみ生成される(spec §7.4「別ゲート」)。Phase3では生成しない
  | { kind: 'uncalibratedGauge'; ratio: number } // Phase3の既定。0–1無次元ゲージ値+「温度モデル未較正」の事実そのもの
  | { kind: 'unavailable' }; // そのモードに熱指標が存在しない(D01・D05等)

export interface CauseLogCommon {
  currentA: number;                // A(spec §7.1「電流」)
  rpm: number;                     // min⁻¹(spec §7.1「回転数」)
  atT: number;                     // セッション内秒(spec §7.1「タイムスタンプ」)。shared.elapsedTimeSのスナップショット
  temperature: TemperatureReading; // spec §7.1「温度」。D02/D07/D09はuncalibratedGauge、それ以外はunavailable
}

export interface D01CauseLog extends CauseLogCommon {} // temperatureは常にunavailable
export interface D02CauseLog extends CauseLogCommon { coilHeatGaugeRatio: number; } // temperature.kind==='uncalibratedGauge'、ratio===coilHeatGaugeRatio
export interface D03CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; }
export interface D04CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; stage: D04Progress['stage']; }
export interface D05CauseLog extends CauseLogCommon { sparkDurationS: number; } // temperatureはunavailable
export interface D06CauseLog extends CauseLogCommon { loadTorqueNm: number; toothLossCount: number; } // temperatureはunavailable。累積歯欠け数を記録
export interface D07CauseLog extends CauseLogCommon { magnetHeatGaugeRatio: number; } // temperature.kind==='uncalibratedGauge'。不可逆到達時のみ生成(2.1節)
export interface D09CauseLog extends CauseLogCommon { bearingHeatGaugeRatio: number; } // temperature.kind==='uncalibratedGauge'
```

**共通/固有フィールドの境界規約(v6から継続)**: 共通4項目はspec §7.1が明記する範囲に厳密一致。モード固有の追加フィールドは3節の物理トリガ判定式に登場する量そのものに限定する。D04の`stage`のみ例外(演出段階の記録として必要、v6から継続)。D06の`toothLossCount`も例外として追加する(検死レポートに「何本目の歯欠けか」を残す必要があるため。反復イベントゆえの追加、r2レビュー#10)。

**ガウスメーターとの関係(spec §7.4末尾)**: 「ガウスメーターは較正済み`magnetStrength`に基づく定格比(%)表示であり℃問題と独立のため、Phase3で完成扱いにできる」。ガウスメーターの表示値はD07の`magnetHeatGaugeRatio`とは別の量(実効`magnetStrength`÷公称`magnetStrength`の比率)であり、三段開示段階3(6節)の実装対象。本節の`TemperatureReading`型とは独立に扱う。

**Fableへ諮る事項**: `uncalibratedGauge`という第三状態の型設計自体の妥当性、および将来の`measured`状態への移行パス(較正完了後、engineの出力を`uncalibratedGauge`から`measured`へ切り替える際に既存のcauseLog記録済みイベントとの互換性をどう扱うか)。

### 2.3 D08の扱い

engineの`DestructionState`・`DestructionModeId`にD08を含めない。spec §7.1・§12がD08をPhase5(e)拡張後と確定済みであるため、**Phase3のengine側にD08の型・遷移・演出コールバックの枠を一切用意しない**(r2レビュー#13: 「D08をPhase3 engine/DoDから外すための追加人間承認やFable裁定は不要」)。

図鑑UI用の予約枠は、store層/UI層専用の別型`FailureCodexModeId`に限定する:

```ts
export type FailureCodexModeId =
  | 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D08' | 'D09'; // 全9種(D08を含む)
```

D08をこの型に含める場合、UIは「未発見」ではなく**「Phase5未実装の非発見可能枠」**として扱い、通常の未発見表示と区別できることをテストする(r2レビュー#13)。engineの`DestructionModeId`とは別物であり、Phase5で(e)-1完成後にengine側`DestructionModeId`へD08を追加した時点で両者は一致する。

---

## 3. D01〜D09個別設計(spec §7.1.1確定版)

以下はspec §7.1.1の表をそのまま反映する。物理モデルの選択自体はもはや論点ではなく、**具体的な式・較正値・実効config上書きの実装方法だけが各ステップの決定事項**である(0節)。

| ID | 性質 | 物理トリガ | 発火後(セッション内) | 恒久劣化 | 図鑑登録条件 | 競合規則 |
|---|---|---|---|---|---|---|
| D01 | 崩壊開始+進行 | `frame.coilCollapsedRisingEdge`(既存`didCollapseJustHappen`由来、4.2節) | 実効巻数・占積が漸減、振動増。走行継続 | rotor個体損壊(サルベージのみ可、1.2節) | 崩壊開始の初回 | — |
| D02 | 進行(発煙)→終端(発火) | `coilHeatGaugeRatio >= config.d02.coilOverheatGaugeLimit`(発火到達)。発煙段階自体には別の下側しきい値がある(下記3.1節) | 発煙段階: `R_coil`増で出力低下、走行継続。発火到達: 走行終了 | rotor個体焼損(全損) | **発火到達の初回のみ**(発煙のみでは登録しない) | — |
| D03 | 瞬時・終端 | `shared.shortCircuitDurationS >= config.battery.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= BATTERY_HEAT_LIMIT`。**非リポ系電池装備時のみ有効**(2.1節`battery.profile==='nonLipo'`) | 電源喪失で走行終了 | battery個体消滅 | 破裂の初回 | リポ搭載時はD03自体が存在しない(構造的排他、2.1節) |
| D04 | 段階遷移(膨張→発煙→炎上) | `shared.shortCircuitDurationS >= config.battery.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= config.battery.runawayHeatThreshold`。**リポ系電池装備時のみ有効** | 膨張で内部抵抗悪化(実効config上書き、下記3.1節)、炎上到達で走行終了+延焼判定 | battery個体消滅+body個体延焼(1.2節) | 炎上到達の初回 | 非リポ搭載時はD04自体が存在しない |
| D05 | 反復・強度連続量 | `sparkDurationS >= config.d05.brushSparkDurationLimitS`(閾値超の初回=図鑑登録)。物理的なスパーク自体は`theoreticalCurrentA`が閾値超×`chatterFramesLeft>0`の間、毎step反復して発生する(下記3.1節で区別) | スパーク中は接触抵抗を一時悪化、摩耗加速。走行継続 | brush摩耗量加算 | 異常強度/継続時間の閾値超過の初回(通常整流の微小火花は対象外) | — |
| D06 | 反復イベント(歯単位) | `frame.loadTorqueNm > config.d06.gearStrengthThresholdNm`(瞬間判定、歯欠け1回ごとに反復発生) | 歯欠けごとに伝達効率低下・トルクリップル増。全損(`toothLossCount >= config.d06.totalToothCount`)で空転=走行不能 | gear個体の歯欠け数加算 | 最初の歯欠け(2回目以降は反復物理イベントとして扱うが図鑑には再登録しない) | チタンは発火しない(3.4節、写像層が非発火プロファイルを返す) |
| D07 | 三概念分離 | (i)可逆熱ダレ: `magnetHeatGaugeRatio`が高温域しきい値超過(冷却で回復、図鑑登録なし) (ii)不可逆減磁: `magnetHeatGaugeRatio`が使用上限超過で初回到達 | (i)高温域でB一時低下、冷却で回復。走行継続 (ii)恒久B低下。走行は継続 | magnet個体の実効B低下(不可逆到達時のみ) | 不可逆域への初回到達のみ(可逆熱ダレは登録しない) | 症状・診断はspec §7.3の三段開示に従う(6節) |
| D08 | Phase3対象外 | Phase3のDestructionStateに含めない(2.3節・9節) | — | — | — | — |
| D09 | 進行(摩擦増)→終端(焼付き) | `bearingHeatGaugeRatio >= config.d09.bearingSeizureGaugeLimit`。トリガ入力は「金属ギヤ接触または高負荷軸受×高速継続」の簡約判定(spec §7.1.1・§13、下記3.3節) | 焼付きで急減速・走行終了 | bearing個体劣化+gear個体劣化(1.2節) | 焼付きの初回 | 無潤滑相当の簡約判定。潤滑アイテムは導入しない(spec §13) |

共通規則(spec §7.1.1、v6から継続かつ確定):
- 図鑑登録は1走行につき同一モード1回まで。イベントは状態遷移の**立ち上がりで1回だけ**発行する
- D03/D04の排他を除き、複数モードの同時成立を許す(2節の固定順序でイベントを並べる)
- 破壊判定を行うのはengineのみ。UIは独自の閾値判定を持たない

### 3.1 D02/D04: 段階進行の実効config上書き設計

**D02(エナメル焼損)**: 発煙段階(`coilHeatGaugeRatio`がある下側しきい値`config.d02.smokeGaugeThreshold`以上、発火到達しきい値`config.d02.coilOverheatGaugeLimit`未満の間)は、既存`MotorConfig`の`coilTurns`由来の`R_coil`計算(motorPhysics.ts `computeRCoil`)を、ラッパーが実効値としてオーバーライドする必要がある。v6で検討した「実効`coilTurns`低下」案はspec r2により**不採用**が確定した(spec原文は「R_coil増」と明記している)。実装方法: `destructionOrchestration.ts`のラッパーが、`coilHeatGaugeRatio`に応じた`R_coil`倍率(新規較正値、比例関係の具体式は各ステップで確定)を計算し、既存の`resistivityRatio`相当のオーバーライド機構(既存`MotorConfig.wireResistivityRatio?`フィールド、motorPhysics.ts既存)へ**セッション内一時値として重ね掛け**する(素材由来の`wireResistivityRatio`とは別に、劣化由来の倍率を掛け合わせる設計。乗算の順序・丸め誤差の扱いはStep実装計画で確定)。発火到達で走行終了させる機構は、D03/D04と同じ「給電停止相当」のオーバーライド(下記)を流用する。

**D04(リポ炎上)**: 膨張段階(`stage==='swelling'`)は内部抵抗悪化(`config.battery`由来の`batteryInternalResistanceRatio`相当をセッション内で更に悪化させるオーバーライド)。炎上到達(`stage==='burning'`)で走行終了。

**給電停止相当のオーバーライド機構(D02発火到達・D03・D04炎上で共有)**: v6 2.5節で検討した「`MotorConfig.batteryVoltage`は`1.5|3.0`のリテラル型で0を代入できない」という制約は変わらない。以下の設計を維持する。
- **案(a)**: `MotorConfig`に新規任意フィールド(例: `powerCutoff?: boolean`)を追加し、既存の`wireGaugeMm?`等と同じ「省略可・既定false・既存呼び出し元は無改修」パターンを踏襲する。`evaluateMotorFrame`内部で既存の`powerOff`引数と同様に扱う
- **案(b)**: 車両層に限り、既存`stepVehicle`の`trackInputs.forcePowerOff`機構を`stepTestRun`からも到達可能にする(新規任意引数の追加)

D03の「非終端」は正確ではない(3節表で「瞬時・終端」)。**D03の物理停止**は、既存`stepVehicle`の`batteryHeat >= BATTERY_HEAT_LIMIT`→`status:'overheated'`機構をそのまま使える見込みが高い(v6 2.5節で確認済み)。ただしmotor-onlyベンチ試験での扱いは未確定のまま(下記Fable確認事項)。

**Fableへ諮る事項**: 給電停止オーバーライド機構の案(a)/案(b)の採否、D02のR_coil倍率オーバーライドの重ね掛け設計、D03/D04のmotor-onlyベンチ試験での扱い(v6から継続する未決事項)。

### 3.2 D06: 全損閾値と反復/初回登録の分離

`config.d06.totalToothCount`(ギヤの総歯数相当、全損判定に使う較正値)を新設する。歯欠けは物理イベントとして`toothLossCount`が上がるたびに反復して発生するが、`DestructionEvent`(図鑑対象、5.2節)は最初の1回だけ発行する。2回目以降の歯欠けはD06Progressの状態更新(`toothLossCount`加算・`causeLog`更新)は行うが、`events`配列には含めない(r2レビュー#10「物理イベントの反復と図鑑初回性を分離」)。

チタンギヤは発火しない: `materialMapping.ts`が写像するD06較正値(`gearStrengthThresholdNm`)自体をチタンについて「実質発火しない」値(非常に高い、または`config.d06`自体を`undefined`にする)に設定することで表現する。engineが素材IDでチタンかどうかを分岐することはしない(3.4節)。

### 3.3 D09: 必須実装対象としての設計

spec r2確定によりD09は「実装するか見送るか」の設計ゲート(v6 3.3節)ではなくなった。**Phase3で必ず実装する**。「無潤滑相当」のトリガ入力は「金属ギヤ接触、または高負荷軸受×高速継続」の簡約判定(spec §7.1.1・§13)であり、既存パラメータの意味を変えて転用することは禁止する(spec §13「既存パラメータの意味変更転用は禁止を維持する」)。具体的な入力信号(どの既存フレーム値から「高負荷×高速継続」を判定するか)はP3-4実装計画で確定する。潤滑油アイテムはV3に導入しない(spec §13)。

### 3.4 D03/D04/D06: 素材family/ID非依存の設計

`materialMapping.ts`(alice所有)が、電池素材から`battery.profile`(`'lipo' | 'nonLipo'`)と、profile別の較正値(非リポ系: `shortCircuitDurationLimitS`、リポ系: `shortCircuitDurationLimitS`+`runawayHeatThreshold`+段階遷移時間)を一意に写像する。ギヤ素材からD06較正値(チタンは非発火相当)を写像する。engineのコード上に素材ID・family文字列が一切現れない設計を実装ステップの受け入れ条件とする(v6から継続)。

---

## 4. モジュール構成: destructionOrchestration.ts(v6から継続、電池排他対応)

v6 2.4節の加算的ラッパー設計(既存`step`/`stepTestRun`/`stepTrackRun`を無改修のまま呼ぶ案2)はspec r2によって否定されていないため継続する。以下、v6からの差分のみ示す(自己完結のため主要部分は再掲する)。

### 4.1 既存3関数(変更なし、シグネチャ再掲)

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

### 4.2 DestructionConfig(電池は排他union、それ以外はモード別optionalグループ)

```ts
export type BatteryDestructionConfig =
  | { profile: 'nonLipo'; shortCircuitDurationLimitS: number }
  | { profile: 'lipo'; shortCircuitDurationLimitS: number; runawayHeatThreshold: number /* stage遷移時間等はP3-2で追加 */ };

export interface DestructionConfig {
  battery: BatteryDestructionConfig; // 3.4節。排他のためoptionalではなく必須(profileで判別)
  d02?: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number; rCoilOverrideCalibration: unknown /* 3.1節、P3-3で確定 */ };
  d05?: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06?: { gearStrengthThresholdNm: number; totalToothCount: number };
  d07?: { magnetHeatGaugeLimit: number; reversibleDroopThreshold: number };
  d09?: { bearingSeizureGaugeLimit: number };
  // D01は較正値を持たない(3節表のとおり)
}
```

存在しないグループ(`undefined`)のモードは`advanceDestructionState`内部で判定自体をスキップする(v6 2.4.2節の設計を継続。3案比較・採否確認は既にv6でFableへ提示済みのため本節では省略し、15節の確認事項リストにのみ残す)。

### 4.3 ラッパー関数(v6から継続、frame構築はP3-0契約に合わせて更新)

```ts
export interface DestructionStepResult<TPhysicsState> {
  physicsState: TPhysicsState;
  destructionState: DestructionState;
  destructionEvents: DestructionEvent[];
}

// motor-only版のframe構築。既存exportのdidCollapseJustHappen・computeElectricalStateを
// 再利用する(v6から継続、r2レビューはこの部分を問題視していない)
function buildMotorOnlyFrameInput(
  config: MotorConfig, prev: SimState, next: SimState,
): DestructionFrameInput {
  const theoreticalCurrentA = computeElectricalState(config, prev.theta, prev.omega).current;
  return {
    currentA: next.current,
    theoreticalCurrentA,
    rpm: next.rpm,
    batteryHeat: next.batteryHeat,
    shorted: next.shorted,
    chatterFramesLeft: next.chatterFramesLeft,
    coilCollapsedRisingEdge: didCollapseJustHappen(prev, next),
    loadTorqueNm: undefined, // motor-onlyではD06入力なし
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

// vehicle/track版の契約骨格はv6から不変(D06のloadTorqueNm入力はP3-4で確定)
export function stepTestRunWithDestruction(
  motorConfig: MotorConfig, carConfig: CarConfig, vehicleState: VehicleSimState,
  destructionState: DestructionState, destructionConfig: DestructionConfig,
  dt: number, courseLengthM: number, rng?: Rng, slopeRad?: number,
): DestructionStepResult<VehicleSimState>;

export function stepTrackRunWithDestruction(
  motorConfig: MotorConfig, carConfig: CarConfig, track: ValidatedTrackDefinition,
  vehicleState: VehicleSimState, destructionState: DestructionState, destructionConfig: DestructionConfig,
  dt: number, rng?: Rng,
): DestructionStepResult<VehicleSimState>;
```

### 4.4 状態の所有者・初期化・受け渡し・呼び出しタイミング(v6から継続)

- **所有者**: `DestructionState`はstore層(gameStore.ts、1.3節の統合後storeの一部)が保持する
- **初期化**: セッション開始時、store層が`createInitialDestructionState(batteryProfile)`(2.1節、電池プロファイル引数が追加された点がv6からの変更)を呼ぶ
- **次stepへの受け渡し**: v6から不変(`stepXxx`関数が`s.destructionState`を読み、`stepXxxWithDestruction`へ渡す)
- **呼び出しタイミング・rng消費順**: v6から不変(rng非消費、既存物理ステップ確定直後)

### 4.5 案1(既存API直接変更)との比較(v6から継続、テスト件数のみ更新)

v6 2.4.4節の比較表・所見(案2採用)はspec r2によって否定されていないため、そのまま維持する(既存844テスト基準、v6の表を参照。自己完結のため必要なら実装ステップ計画時に再掲する)。

---

## 5. 三段開示・イベント通知API

### 5.1 固定dt状態遷移(v6から継続)

D02・D04・D07・D09は継続量を要するため固定dt積分で統一する(v6から不変)。`HistorySample`はdestructionModesの入力から切り離され、三段開示段階2専用。

### 5.2 イベント通知(判別union、D06の反復/初回分離を反映)

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

v6同様、汎用`severity`フィールドは持たない。`degradationApplication.ts`(2節)が各モード固有フィールドから型安全に劣化差分を導出する。D06は3.2節のとおり「反復する物理変化」と「`events`への計上(初回のみ)」を分離しているため、`DestructionEvent`自体は常に「図鑑対象の1件」のみを表す(反復側の状態更新は`DestructionState.modes.D06`が保持するのみで`events`には現れない)。

### 5.3 三段開示・段階2の配置(v6から継続)

`src/materials/regressionDiff.ts`(`src/engine/`ではなく`src/materials/`)に配置する。理由はv6 5.3節から不変(物理stepではなく、完了済みセッション記録同士を比較する分析関数のため、CLAUDE.mdの許可拡張点(a)〜(e)に該当しない)。**配置判断自体をFable裁定事項とする**(15節)。

---

## 6. 三段開示・段階1のHUD境界(v6から継続)

- 段階1(走行中症状)はbrabit所有。HUDが参照してよいのは、セッション開始時に合成済みの実効config由来の`SimState`、および4節のセッション内オーバーライド機構が既存configへ合成した実効値のみ
- 永続的な個体状態そのものを、走行中にHUDが再読み込み・再写像することは禁止する
- 段階2・段階3の所有分担は5.3節のとおり

---

## 7. 図鑑・個体永続状態のstore層所有(1.3節の統合設計と整合)

1.3節でP3-0の一部として「単一の永続envelope統合(案A)」を提案したため、v6 7節の「shopEconomy.ts/shopEconomyStoreパターンをそのまま踏襲」という記述を更新する。

- **データスキーマ・純粋な変換関数**: `src/materials/`配下(alice所有)。`degradationApplication.ts`(2節)・`materialMapping.ts`(3.4節)
- **統合後の永続store(brabit所有、1.3節)**: 進捗・実験ノート・在庫・所持金・図鑑発見状態・適用済み`runId`を単一store・単一persist keyで保持する。既存`gameStore.ts`(`v15:progress`)・`notebookStore.ts`(`v15:notebook`)・`shopEconomyStore.ts`(非永続)の統合方法、既存データの移行パスはbrabit_mot3との協議・P3-0実装計画で確定する
- 個体ID発行はbrabit所有store側で行う。`InventoryItem`型は1.2節の新規`family`(rotor/body/bearing、案A採用時)を追加する

**2.1節との整合**: 「セッション内で一度きり」(`XxxProgress.triggered`)はengine所有の一時状態であり、「図鑑に初めて登録されたか」はstore層所有の永続状態である。両者は別物であり、store層の永続集合をengineへ注入することはない。

上記分担案は本計画のFableレビュー+brabit_mot3との最終合意を経て確定する。

---

## 8. 決定論境界の保証構造(v6から継続)

engineの純関数は「毎回明示的に渡された引数のみから出力を計算する」。永続化されたWearState/InventoryItemそのものをengineへ引数として渡すことはしない。`composeConfigFromMaterials`(**`src/materials/`に属する純関数であり、engineの純関数ではない**)がセッション開始時に一度だけ写像する。走行中のengineが受け取るのはこの写像済みの数値だけである。

**図鑑発見状態からの独立**: セッション開始時、store層は`createInitialDestructionState(batteryProfile)`を呼んで`DestructionState`を初期化する。この初期化に図鑑の発見済み永続状態を一切混ぜない。同一seedで同一レシピを何度再生しても、初回発見だろうと2回目だろうと`DestructionState`と`events`の遷移列は完全に同一になる。

---

## 9. D08のPhase割当の追認(v6「例外」節から書き換え)

spec §7.1・§12はD08をPhase5((e)拡張後)、D10をPhase4(巻線記録実装時)と確定済みである(r2レビュー#13)。v6 9節は「Phase3のDoDからD08を除外するための人間スコープ例外承認を得る」という手続きを想定していたが、**これは正典が既に確定させている事項であり、追加の人間承認・Fable裁定は不要**。

- Phase3では`FailureCodexModeId`(2.3節)に`'D08'`を含め、図鑑の型・予約枠として存在させてよい。ただしengineの`DestructionState`・`DestructionModeId`にはD08を含めない
- D08の実トリガ実装・再現手順テストはPhase5(e)-1完成後の別ステップへ実施する。これは正典どおりのフェーズ割当であり「逸脱」ではない

---

## 10. Phase2繰越事項の採否・順序

- ブラシパッケージ: Phase3が実装先。D05設計(3節)がその本体
- ギヤJ/D06: 同じくPhase3が実装先
- 未接続だった5ファミリーのうち、brushはPhase3のD05実装で接続される。coating/substrate/rollerは引き続きPhase3スコープ外。**bodyはD04の延焼判定(3節)により部分的に接続が必要になる**(1.2節の個体スキーマ拡張、P3-0で対象範囲を確定)
- store層個体ID・永続化の所有: 1.3節・7節で確定

---

## 11. art-specにない独自解釈しない事項

1. 検死レポートのレイアウト: 図鑑詳細画面へ統合(確定)
2. 破壊イベント発生後の画面遷移: **終端モードのみ**プレイヤーの操作待ち(確定、r2レビュー#16。非終端モードは走行継続、下記12節UI計画で詳述)
3. D01〜D09の具体的な音色仕様: brabit_mot3の別ステップ計画事項(本計画スコープ外)

---

## 12. ステップ分割案(P3-0〜P3-4への再編)

各ゲートの手順(不変): **実装前ステップ計画→Suu_mot3レビュー→Fableレビュー→人間承認→実装→`npm run test && npm run build && npm run lint`→報告**。commitは人間承認後のみ。

### P3-0: クロスレイヤ契約(新設、最優先ゲート)

1節の`RunOutcome`・`DegradationDiff`・`RunSnapshot`型、1.3節の永続化統合方式、`runId`発行・二重適用防止機構を確定する。このゲートは物理モードの実装を一切含まない(型・store設計のみ)。

- **ゲート事項(Fableへ諮る、15節)**: (a) 1.2節のrotor/body/bearing個体スキーマ案A〜C、(b) 1.3節の永続化統合方式案A/B、(c) `RunOutcome`/`DegradationDiff`の型設計妥当性
- **DoD**: 型定義+ダミーの`RunOutcome`を使った統合storeへの原子的適用の単体テスト(部分適用が起きないことを検証)。物理モードのテストはまだ存在しない

### P3-1: 契約の最小実証(D01/D03、非リポ経路)

`destructionModes.ts`(2.1・2.2節の型)+`destructionOrchestration.ts`(4節のラッパー、`stepMotorWithDestruction`のみ)+D01+D03(非リポプロファイル)を実装する。D04アーム(リポプロファイル)は型として存在するが、この時点では判定ロジックを実装しない(常に未発火のまま。P3-2で実装)。

- **ゲート事項**: 2.1節の型設計(排他union含む)の妥当性、2.2節の`uncalibratedGauge`型の妥当性、4節の加算的ラッパー案の採否
- **テスト網羅**: D01・D03それぞれについて非発火境界・発火境界・一度きり・ログ固定・dt分割不変性・相互非干渉。同一stepで両方発火し得る入力列で`events`が固定順序(D01→D03)で並ぶことを検証
- **D04の扱い**: プロファイルが`nonLipo`の間はD04自体が存在しないため、D04のテストはP3-2へ移管する

### P3-2: 電池破壊の完成(D04、リポ経路)+D07(三段開示の骨格)

D04のプロファイル(`lipo`)・段階遷移(`stage`)・給電停止オーバーライド(3.1節)を実装し、`stepTestRunWithDestruction`を追加(車両層が必要なため)。D07を三概念(熱ゲージ・可逆熱ダレ・不可逆減磁)で実装し、三段開示段階1・2の骨格をここで実装する(spec §7.3の代表例のため優先度を上げる、v6から継続)。

- **ゲート事項**: 3.1節の段階遷移時間・内部抵抗悪化オーバーライドの具体式、2.2節の可逆/不可逆分離の妥当性
- **D01/D07の恒久劣化反映**: P3-0の1.2節スキーマ案採用結果に従い、rotor/magnet個体への劣化差分適用を実装する

### P3-3: D02(コイル焼損)+D05(ブラシ火花)

D02の発煙→発火の段階遷移(R_coil増オーバーライド、3.1節)+D05のブラシ火花(反復物理+閾値超過の初回登録分離、3節)を実装する。D05実装にあたり`theoreticalCurrentA`(チャタリング前電流、既存`computeElectricalState`再利用)を用いた入力棚卸しを検証する(v6 12節Step3から継続)。

- **ゲート事項**: D02のR_coilオーバーライド式・発煙/発火の境界較正、D05の物理スパーク/図鑑イベント分離の妥当性

### P3-4: D06(ギヤ歯欠け)+D09(軸受焼付き)

D06の歯単位反復状態(3.2節)+ギヤJ増接続(Phase2繰越)+D09(3.3節、必須実装)を実装する。`stepTrackRunWithDestruction`を追加し、4.3節の未確定点(`loadTorqueNm`を含む車両用frame builder)をここで解消する。

- **ゲート事項**: D06の全損閾値・チタン非発火較正、D09の「無潤滑相当」入力信号の具体設計

### P3-4以降(store/UI統合、v6のStep7〜9に相当)

- **D08型・図鑑予約枠**(2.3節・9節)
- **図鑑store・統合永続化の最終実装**(brabit協働、7節)。P3-0で確定した統合方式(1.3節)をここで実装完了させる
- **計測器店UI接続**(brabit、三段開示段階3)
- **UI計画v3への改訂**(`docs/phase3-ui-autopsy-plan.md`、r2レビュー#17。本書のスコープ外だがbrabit_mot3との整合確認が必要)

## 13. DoD・テスト方針(spec §12「破壊契約マトリクス」準拠)

各Phase3対象モードについて、以下を自動検証する(spec §12・r2レビュー#18):

- 正例(発火境界)
- 閾値直前の境界負例
- 同一シード・同一開始WearStateでイベント列一致(決定論)
- 1破壊1イベント(反復物理イベントと図鑑イベントの区別、D06/D05で特に重要)
- 発火後物理が次stepから現れる(2.5節的な検証。3節表の「発火後」列に対応)
- 正しい装備個体だけへ劣化差分が適用される(1.2節の役割解決)
- 原子的store反映(部分適用が起きないこと、P3-0 DoD)
- 同一`runId`の二重適用防止
- 図鑑初回性と二重報酬防止
- 検死ログ固定
- 保存スナップショットからのリプレイ一致(1.4節)
- UIが独自の破壊判定を持たない
- 横/縦画面+キーボード/タッチの人間試遊(UI計画側、11節)

既存DoD(`npm run test && npm run build && npm run lint`)は不変。D08はengine/DoD対象外のまま(9節、追加承認不要)。D09は必須実装対象のため例外なし(v6にあった「D09見送り時の人間スコープ例外」は削除する)。

## 14. 未決事項一覧

- 1.2節: rotor/body/bearing個体スキーマ(案A推奨)の採否・具体的スキーマ — P3-0でFableへ諮る
- 1.3節: 永続化統合方式(案A推奨: 単一store統合)の採否 — P3-0でFableへ諮る
- 1.3節: `RunOutcome`/`DegradationDiff`/`RunSnapshot`の型設計妥当性 — P3-0でFableへ諮る
- 1.2節: D09の「軸受け・ギヤ個体の劣化」のうちギヤ側の`kind`をD06と共有するか専用にするか — P3-4で確定
- 2.2節: `uncalibratedGauge`型の妥当性、将来の`measured`状態への移行パス — Fable判断
- 2.4節: 加算的ラッパー案(案2)の採否、DestructionConfig段階導入案(モード別optionalグループ)の採否 — Fable判断(v6から継続)
- 3.1節: 給電停止オーバーライド機構(案a/案b)、D02のR_coil倍率重ね掛け設計 — P3-2/P3-3でFableへ諮る
- 3.1節: D03/D04のmotor-onlyベンチ試験での扱い — P3-1でFableへ諮る(v6から継続)
- 3.2節: D06の全損閾値較正・チタン非発火の具体的較正値 — P3-4で確定
- 3.3節: D09の「無潤滑相当」入力信号の具体設計 — P3-4で確定
- 4.2節: vehicle/track版のframe構築方法(`loadTorqueNm`を含む専用builder) — P3-4でFableへ確認
- 5.3節: 三段開示段階2(`src/materials/regressionDiff.ts`)の配置妥当性 — Fable裁定
- 各モードの較正値・式の具体値(D02/D04段階時間、D05/D06/D09しきい値) — 各ゲート実装計画で個別に確定
- 7節: 統合store実装の`gameStore.ts`/`notebookStore.ts`/`shopEconomyStore.ts`からの移行パス — brabit_mot3との協議で確定
- 11節③: D01〜D09の具体的音色仕様 — brabit_mot3の別ステップ計画事項(本計画スコープ外)
- `docs/phase3-ui-autopsy-plan.md`のv3改訂(r2レビュー#17) — 本書のスコープ外、brabit_mot3が別途改訂

## 15. Fableへの重点確認事項

正典で確定済みの事項(D03/D04排他性そのもの、温度規約が無次元ゲージであること、D09が必須であること、各モードの発火後物理の方向性)はFableへの選択問題として出さない(r2レビュー「v7の構成条件」)。以下、正典内で未確定の物理式・較正根拠・凍結APIへの接続妥当性のみを重点確認事項とする。

- **P3-0(最重点)**: 1.2節のrotor/body/bearing個体スキーマ案、1.3節の永続化統合方式(単一store案)、`RunOutcome`/`DegradationDiff`型設計
- 2.1節: 電池排他union+モード別Progress型の設計妥当性
- 2.2節: `uncalibratedGauge`を含む3状態`TemperatureReading`の型設計
- 2.3節: D08予約枠の設計(engine型除外+store層別型)
- 3.1節: D02のR_coilオーバーライド設計、給電停止機構(案a/案b)
- 4.2節: DestructionConfig段階導入案(モード別optionalグループ)の採否、vehicle/track版frame構築のStep先送り
- 4.5節: 既存API無改修の加算的ラッパー案(案2)の採否(v6から継続)
- 5.3節: 三段開示段階2を`src/engine/`ではなく`src/materials/`へ置く判断
- その他、14節に列挙した全未決事項

Fableの回答は要約せず全文でSuu_mot3経由で中継してもらう。実装・commitはFableレビュー・人間承認まで引き続き未着手のまま維持する。

---

## 16. 改訂履歴

v1〜v6の差分表は`docs/phase3-plan-v6.md`16節(v1〜v5)・`docs/phase3-plan-v5.md`16節(v1〜v4)に保持済み。本節はv6→v7の差分のみを追加する。

### v6→v7(spec r2差し替え+Suu_mot3レビュー18項目)

| # | 指摘 | 対応節 | 要旨 |
|---|---|---|---|
| 0 | 正典がspec.md/art-spec.mdへr2として差し替わり、Phase3契約が仕様として確定した | 0節(新設) | v6での「Fableへ諮る」複数論点が正典確定事項に変わった変更点サマリを追加 |
| 1 | P3-0(クロスレイヤ契約)が最初のゲートとして存在しない | 1節(新設)・12節 | `RunOutcome`/`DegradationDiff`/`RunSnapshot`型を新設し、D01/D03実装より先に置くゲートとして再編 |
| 2 | 原子的反映が単一トランザクションとして設計されていない | 1.3節 | 現状3つの独立localStorageキー(v15:progress/v15:notebook/非永続shopEconomyStore)を確認し、単一store・単一persist keyへの統合案を提示 |
| 3 | RunOutcome/劣化差分がengine契約に入っていない | 1.1・1.2節 | エンジン出力として`RunOutcome`・`DegradationDiff`(役割ベース)を新設。`wearAccumulation.ts`を`degradationApplication.ts`へ役割変更 |
| 4 | D03/D04が構造的に排他になっていない | 2.1節 | `BatteryDestructionProgress`/`BatteryDestructionConfig`を判別unionへ変更し、同時設定を型で不可能にした |
| 5 | 温度規約が正典(§7.4)へ固定されていない | 2.2節 | 案A/B比較を削除し無次元ゲージを確定。`TemperatureReading`に`uncalibratedGauge`状態を追加 |
| 6 | D01の発火後物理が正典どおり完結していない | 3節・3.1節 | 実効巻数漸減・rotor個体スキーマの必要性を明記し、P3-0のスキーマ未決事項へ接続 |
| 7 | D02の段階・物理・終端が未確定のまま | 3.1節 | 「coilTurns低下 vs R_coil低下」の選択問題を解消し、正典どおりR_coil増で確定 |
| 8 | D04の延焼が含まれていない | 3節・1.2節 | body個体延焼をDegradationDiffへ追加。body個体スキーマ未接続をP3-0の課題として明記 |
| 9 | D05の走行中物理が欠けていた | 3節 | スパーク中の接触抵抗悪化・摩耗加速を追加。反復物理と図鑑初回性を型で分離 |
| 10 | D06が反復状態を表現できていない | 2.1節・3.2節 | `D06Progress`を`toothLossCount`ベースの反復状態へ変更 |
| 11 | D07の熱ゲージ比例弱化と不可逆減磁が混同されていた | 2.1節・3節 | 熱ゲージ・可逆熱ダレ・不可逆減磁の三概念に分離 |
| 12 | D09が採否ゲートのまま必須化されていない | 3.3節・13節 | 必須実装対象へ変更。見送り時の人間スコープ例外記述を削除 |
| 13 | D08が「例外」として扱われ、正典のPhase割当と表現がずれていた | 9節 | 「例外」から「正典確定事項の追認」へ書き換え |
| 14 | リプレイが`createInitialDestructionState()`だけでは不十分 | 1.4節 | `RunSnapshot`型を新設し、保存済みスナップショット+シードのみで再現する契約を明記 |
| 15 | 初回報酬が「仮額だが未結線」のままでよいと誤解されていた | 12節P3-0/13節 | 仮額を実際に原子的付与するDoDへ明記 |
| 16 | UI遷移が全破壊で即座停止する前提のままだった | 11節 | 終端/非終端モードの区別を明記(UI計画側の課題として11節・14節に記載) |
| 17 | UI計画(v2)がr2の温度規約・リプレイ契約に追従していない | 14節 | `docs/phase3-ui-autopsy-plan.md`のv3改訂を未決事項として明記(本書スコープ外) |
| 18 | DoDが正典の破壊契約マトリクスへ置き換わっていない | 13節 | spec §12の破壊契約マトリクス項目をそのままDoDへ反映 |
