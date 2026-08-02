# Phase 3統合計画(破壊モード+図鑑)— v2改訂版

作成: alice_mot3 2026-07-25。実装・commit未着手。

本書は2026-07-24にagmsg全文で送付したv1ドラフトを、Suu_mot3一次レビュー(`docs/phase3-suu-draft-review.md`、以下「レビュー」)の8項目に基づき改訂したものである。**v1をこの文書で置き換える。** v1のうち改訂対象外の節(0・1・4・7・10・13・14)は内容不変のため要約のみ再掲し、改訂対象の節(2・3・5・6・9・11・12)は全面書き直しした。

対象: spec.md §7(破壊モードと失敗図鑑)。docs/spec.md を唯一の正とする。CLAUDE.md(b)(c)拡張点。

## 改訂差分サマリ(レビュー8項目への対応)

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

---

## 0. スコープ境界(v1不変)

- 対象はD01〜D09のみ。D10(鉄心短絡)はPhase4(spec §9.2依存)。
- D08(クラッシュ)のトリガはspec §6.5の周回コース(κ(s)・保持判定)に依存し、これはCLAUDE.md §2(e)でPhase5スコープと確定済み。Phase3では型・遷移・演出コールバックの枠のみ用意し、実トリガ結線はPhase5(e)-1完成後(9節で詳述、本改訂でA案採用を確定)。
- 未接続5ファミリー(coating/substrate/roller/body)の扱いは10節で整理(不変)。

## 1. 既存資産の棚卸し(v1不変)

`src/engine/`は凍結構造。D01〜D09は既存の凍結フィールドを**物理トリガの生信号**として再利用し、その上に「個体劣化・初回発見・三段開示」の意味論を被せる。

再利用対象(motorPhysics.ts、変更不要):
- `SimState.coilCollapsed`(D01の生トリガ)
- `SimState.batteryHeat` + `BATTERY_HEAT_LIMIT`(D02/D03の生トリガ)
- `SimState.shorted`(D03/D10系)
- `SimState.chatterFramesLeft` + `CHATTER_PRESSURE_THRESHOLD`(D05候補)
- `src/engine/failures.ts`(診断ヒント系)は別物として維持。名前衝突を避けるため新規モジュールは`destructionModes.ts`とする

再利用対象(materials/、Phase2成果):
- `WearState`(inventoryItem.ts)— D05/D06/D07の書き込み先
- `composeConfigFromMaterials`(materialMapping.ts)— 4節で拡張

---

## 2. モジュール構成と状態機械設計(改訂: レビュー#1・#2・#5対応)

```
src/engine/destructionModes.ts       # 新規。D01〜D09の状態機械(純関数)
src/engine/__tests__/destructionModes.test.ts
src/materials/wearAccumulation.ts    # 新規。DestructionEvent→WearState差分の純関数(alice所有、engine非依存)
src/materials/__tests__/wearAccumulation.test.ts
```

### 2.1 v1からの設計変更(レビュー#1)

v1は「`destructionModes.ts`は状態を持たず、`alreadyTriggered`をstore層が管理する」設計だった。レビューで、これはspec §7.1・AGENTS.md (b)「演出タスクではなくエンジンの状態機械」と矛盾すると指摘された。該当のとおり撤回する。

v2は`DestructionState`を値として明示し、engine APIが状態遷移そのものを担う:

```ts
export type DestructionModeId =
  | 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D08' | 'D09';
// D10は含めない(Phase4)

export interface CauseLog {
  current: number;      // A(spec §7.1「電流」)
  temperature: number;  // モードごとの対象温度指標。単位・意味はモードごとに3節で規定
  rpm: number;           // spec §7.1「回転数」
  atT: number;           // セッション内秒(spec §7.1「タイムスタンプ」)
}

export interface ModeProgress {
  triggered: boolean;        // このセッション内で一度でも発火したか(engine所有、二重発火防止の主体)
  triggeredAtT: number | null;
  accumulator: number;        // 継続量の蓄積(0起点)。モードごとの意味は3節の表に規定。新規物理量を要さないD01/D03は未使用(常に0)
  causeLog: CauseLog | null;  // 発火した瞬間に一度だけ書き込み、以後不変(スナップショット)
}

export type DestructionState = Readonly<Record<DestructionModeId, ModeProgress>>;

export function createInitialDestructionState(): DestructionState; // 全モードtriggered:false、accumulator:0

export interface DestructionEvent {
  mode: DestructionModeId;
  causeLog: CauseLog; // ModeProgress.causeLogと同一参照
  severity: number;   // 0–1。WearStateへの加算量計算に使う(4節)
}

export function advanceDestructionState(
  prev: DestructionState,
  frame: DestructionFrameInput, // 3節で規定。SimStateの当該ステップの値+configの実効しきい値
  config: DestructionConfig,    // 3節で規定。materialMapping由来の実効しきい値のみ(素材IDは含まない)
  dt: number,
): { state: DestructionState; events: DestructionEvent[] };
```

`events`は「この1ステップで新規にtriggeredへ遷移したモード」のみを含む(空配列が大半)。`state`は次ステップへそのまま持ち越す値。

### 2.2 呼び出しタイミングと二段API凍結方針との関係(レビュー#5)

`advanceDestructionState`は`advanceMotorState`と同じ固定dt(1/120s)のステップごとに、store層のゲームループ(brabit所有)から**`advanceMotorState`の直後に**毎回呼び出す。1フレームあたり物理ステップ最大2回の非機能要件はここにも適用される(destructionも1フレーム最大2回呼ばれる)。

これはモーター/車体の二段API(`evaluateMotorFrame`/`advanceMotorState`)を分割・変更するものではない。二段分割は「空転時にモーター軸と車軸を2自由度へ分離し得る」という力学的必要から来ており、destructionModesにはこの必要がない。既存コードでも`nextBatteryHeat`・`nextChatterState`のような「1ステップ1回、前状態から次状態を計算する」純関数がmotorPhysics.ts内に複数存在しており、`advanceDestructionState`はこれらと同じ設計パターンの拡張である(motorPhysics.ts本体は変更しない。呼び出し側で連結する)。

**rng消費順**: `advanceDestructionState`はrngを一切消費しない。ステップ内での呼び出し順は「①`evaluateMotorFrame`(rng消費、chatter判定を含む) → ②`advanceMotorState`(SimState確定) → ③`advanceDestructionState`(②の結果を読むだけ)」に固定する。既存の①②間のrng消費順序には触れないため、既存テストのシード再現性に影響しない。

**リプレイに必要な初期状態**: セッション開始時、store層は`createInitialDestructionState()`を呼んで`DestructionState`を初期化する。図鑑の「発見済み」永続状態(7節)はこの初期化に一切混ぜない——同一seedで同一レシピを何度再生しても、初回発見だろうと2回目だろうと`DestructionState`と`events`の遷移列は同一になる(図鑑登録・報酬の要否だけがstore層で後から分岐する)。

### 2.3 causeLogのスナップショット確定(レビュー#2)

v1は「`HistorySample[]`ウィンドウから検死ログを後付け生成する」設計だったが、これも撤回する。v2では`triggered`がfalse→trueに反転する**その1ステップの`frame`引数の値をそのまま`CauseLog`として書き込み**、以後上書きしない。ウィンドウ探索や後付け照合は発生しない(3節・5節の固定dtアキュムレータ設計と表裏一体)。

フィールドはspec §7.1「破壊時のパラメータログ(電流・温度・回転数・タイムスタンプ)」の4項目に厳密に一致させ、`theta`等の追加フィールドは**根拠不足のため見送る**(v1にあった`theta`は削除)。将来、特定モードの検死レポートに追加数値が必要と判明した場合は、そのモードのステップ実装計画(12節)で個別に根拠を示して追加する。

---

## 3. D01〜D09個別設計(改訂: レビュー#2・#3・#5対応)

`accumulator`の意味・`frame`/`config`に必要な新規フィールド・`causeLog.temperature`の対象を、モードごとに規定する。

| ID | 物理トリガ(判定式) | accumulatorの意味 | causeLog.temperature | 新規frame/config入力 | WearState書き込み |
|---|---|---|---|---|---|
| D01 コイル崩壊 | `frame.coilCollapsed`の立ち上がり(既存) | 未使用(0) | `frame.batteryHeat`(参考値。コイル自体の温度指標が存在しないため電池発熱を代用——3節注記) | なし | なし(Phase4の巻線記録まで個体化されないため) |
| D02 エナメル焼損 | `accumulator >= config.coilOverheatThreshold` | **新規**: `coilHeatAccumulator`。`current²×dt`を積算し、既存`HEAT_DISSIPATION`と同型の放熱減衰を適用する専用の漏れ積分(batteryHeatとは別系統、電池側ではなくコイル側の発熱経路として分離) | `accumulator`(0–1、コイル熱ゲージ) | `config.coilOverheatThreshold`(新規較正値) | なし(D01同様) |
| D03 電池破裂 | `frame.batteryHeat >= BATTERY_HEAT_LIMIT`かつ`frame.shorted`継続(既存フィールドのみ) | 未使用(0) | `frame.batteryHeat` | なし | 電池は恒久結果を別スキーマで記録(WearState対象外、Phase2の意図的判断を維持) |
| D04 リポ炎上 | `frame.batteryHeat >= config.batteryRunawayHeatThreshold`(D03と別しきい値) | 未使用(0) | `frame.batteryHeat` | `config.batteryRunawayHeatThreshold?: number`(3.1節) | 同上 |
| D05 ブラシ火花 | `accumulator >= config.brushSparkThreshold` | `chatterFramesLeft > 0`かつ`current`が閾値超の間、dtを積算(継続時間の累積) | `frame.current`をD05専用スケールへ写像(または電流そのもの。実装ステップで確定) | `config.brushSparkThreshold` | `WearState.wearFraction`加算 |
| D06 ギヤ歯欠け | `frame.loadTorque > config.gearStrengthThreshold`(瞬間判定、新規) | 未使用(0、瞬間判定のため) | `frame.rpm`を代用(専用温度指標なし) | `frame.loadTorque`(新規)、`config.gearStrengthThreshold`(新規較正値、gearEfficiencyと対の表) | `WearState.toothDamageFraction`加算 |
| D07 熱減磁 | `accumulator >= config.magnetDemagTempLimit` | **新規**: `magnetTempAccumulator`。`current²×dt`由来の発熱−冷却の漏れ積分(batteryHeatと同型の設計) | `accumulator`(磁石温度指標) | `config.magnetDemagTempLimit`(新規較正値) | `WearState.demagnetizationFraction`加算。**spec§7.3三段開示の代表例**(6節) |
| D08 クラッシュ | Phase3では判定式なし(常にfalseを返すスタブ) | 未使用 | 未使用 | なし(9節) | なし |
| D09 軸受焼付き | `accumulator >= config.bearingSeizureThreshold` | **新規**: `bearingWearAccumulator`。`rpm`が閾値超×潤滑不足シグナルの間dtを積算 | `accumulator`(軸受摩耗指標) | `config.bearingSeizureThreshold`、潤滑シグナルは既存パラメータからの転用可否を要検討(11節同様、設計コスト最大のため12節でPhase3内最後に配置) | なし(個体化されていないため演出のみ) |

太字にした新規物理量(D02コイル熱・D06負荷トルク・D07磁石温度・D09軸受摩耗)は、既存の「オプショナルフィールド追加、省略時デフォルトでv2互換を壊さない」パターン(`wireResistivityRatio?`等と同型)でSimState/MotorConfigへ追加する。engine構造そのもの(二段API・energyUsedJ)は変更しない。

D01のcauseLog.temperatureに電池発熱を代用する点は暫定である。コイル自体に温度指標がない以上の選択肢が現状ないための処置であり、Step1実装時にFableへ明示して可否を確認する(12節Step1のゲート事項)。

### 3.1 D04: 素材family/ID非依存の設計(レビュー#3)

v1は「D04の判定でengineが電池素材がリポ系かどうかを見る」設計だったが、これはengineが素材family/IDを知ることになるため撤回する。

v2の設計: `materialMapping.ts`(alice所有、既存の較正値テーブル群と同じ書式)が、電池素材ごとに「熱暴走しきい値」を計算し`MotorConfig`(または新設`DestructionConfig`、4節で確定)へ写像する。

```ts
// materialMapping.ts に追加(既存BATTERY_INTERNAL_RESISTANCE_RATIO_CALIBRATION等と同じ書式)
const BATTERY_RUNAWAY_HEAT_THRESHOLD_CALIBRATION: Record<BatteryMaterialId, number | undefined> = {
  // リチウムイオン系: 熱暴走特性を持つためBATTERY_HEAT_LIMIT未満の実測相当値を設定(出典コメント必須)
  // ニッケル水素・アルカリ系: 熱暴走特性を持たないためundefined(D04は物理的に発生しない)
};
```

engine(`destructionModes.ts`)はこの数値を`config.batteryRunawayHeatThreshold: number | undefined`として受け取り、`undefined`ならD04判定自体をスキップする(常にfalse)。engineのコード上に「リポ」「lithium」等の文字列・IDが一切現れない設計を実装ステップの受け入れ条件とする。D03(電池破裂、既存`BATTERY_HEAT_LIMIT`)とD04(リポ炎上、`batteryRunawayHeatThreshold`)は独立した2つのしきい値比較として共存し、`batteryRunawayHeatThreshold < BATTERY_HEAT_LIMIT`の素材ではD04がD03より先に発火する(炎上が破裂より先に起きる、という物理的にも自然な順序になる)。

---

## 4. WearState→engine実効値の写像拡張(v1不変、参照節番号のみ更新)

現状`composeConfigFromMaterials`はWearStateを受け取らない。Phase3で以下を追加:

```ts
export interface MaterialWearInput {
  magnetWear?: Extract<WearState, { kind: 'magnet' }>;
  gearWear?: Extract<WearState, { kind: 'gear' }>;
  brushWear?: Extract<WearState, { kind: 'brush' }>;
}
```

`composeConfigFromMaterials`の引数に`wear?: MaterialWearInput`を追加(既存呼び出し元は省略可能、後方互換)。同時に、3節で新設した`DestructionConfig`系のしきい値(`coilOverheatThreshold`・`batteryRunawayHeatThreshold`・`brushSparkThreshold`・`gearStrengthThreshold`・`magnetDemagTempLimit`・`bearingSeizureThreshold`)も、この関数が素材選択から一度だけ計算し、セッション中は不変のconfigとして持たせる(CLAUDE.md「写像は起動時に一度計算し、走行中は既存パラメータのみが生きる」を厳守)。

`wearAccumulation.ts`(新設、v1不変)の責務: `DestructionEvent`→WearStateへの加算量を計算する純関数。engineに依存しない。

---

## 5. 三段開示・破壊イベント通知APIの決定論境界(改訂: レビュー#5・#6対応)

### 5.1 固定dt状態遷移への統一(レビュー#5、2・3節の補足)

D02・D04・D07・D09は「継続量」を要するが、v1の`HistorySample[]`ウィンドウ依存設計は撤回し、`SimState.batteryHeat`と同型の**固定dt漏れ積分アキュムレータ**(2.1節`ModeProgress.accumulator`)へ統一した。これにより:

- 毎step更新箇所: `advanceDestructionState`内、`advanceMotorState`直後(2.2節)
- rng消費順: 変更なし(2.2節、advanceDestructionStateはrng非消費)
- リプレイに必要な初期状態: `createInitialDestructionState()`(2.2節)
- `HistorySample`(既存、実験ノート用の記録)はdestructionModesの入力から完全に切り離され、三段開示段階2(自動差分検知)専用の用途に限定される(5.2節)

### 5.2 破壊イベント通知API((c)、brabit Q1回答。v1から変更なし)

`DestructionEvent`は「生ログ(`causeLog`)」と「集計済みメタ(`mode`・`severity`)」を同居させる1つの型として渡す。判定ロジック自体はengine内で完結させ、UIに閾値判定を持ち込ませない。

コールバックの実体は「毎ステップ呼べる純粋な状態遷移関数」(`advanceDestructionState`)であり、EventEmitter的な登録機構ではない。呼び出し側(store層)が毎フレーム呼び、返ってきた`events`を見てUI側の演出・通知処理へ橋渡しする。

### 5.3 三段開示・段階2の所有(brabit Q2回答。v1から変更なし)

- 段階2(自動差分検知、「同一構成で3%低下」)の判定ロジック(同一レシピ照合+3%しきい値比較)はalice所有の純関数として`materials/`または新設`src/engine/regressionDiff.ts`に置く。実行タイミング・保存先(実験ノート追記)・UI表示はbrabit所有。既存`ExperimentSession`を比較材料として利用する。

---

## 6. 三段開示・段階1のHUD境界(改訂: レビュー#6対応)

v1は「段階1(走行中症状)はHUDが`SimState`/`WearState`から直接演出を出す」としていたが、`WearState`(永続個体状態)を走行中に直接参照する経路を許すと読める点が曖昧だった。以下へ訂正する:

- **段階1はbrabit所有。ただしHUDが走行中に参照してよいのは、セッション開始時に`composeConfigFromMaterials`が一度だけ合成した実効config(劣化込みの`magnetStrength`等)由来の`SimState`のみ**である。
- 永続`WearState`そのものを、走行中にHUDが再読み込み・再写像することは禁止する。理由: CLAUDE.md「写像は起動時に一度計算し、走行中は既存パラメータのみが生きる」の決定論境界を、演出コードが迂回して壊す経路になり得るため。
- 具体的には、性能低下アイコン・モーター音のピッチ低下は「劣化込みですでに下がっている`SimState.rpm`や`current`の値」をそのまま表示に使えばよく、`WearState.demagnetizationFraction`の数値を演出側が改めて参照する必要はない設計になっている(3節の`DestructionEvent`とcauseLogは「発火の通知・記録」用であり、「常時HUD表示」用ではない)。
- 段階2・段階3の所有分担は5.3節・v1のまま変更なし。

---

## 7. 図鑑・個体永続状態のstore層所有(Fable付帯条件3・brabit Q3回答。v1から変更なし、2.2節の追記あり)

Phase2の分離パターン(`src/store/shopEconomy.ts`=alice寄り純粋ロジック / `src/store/shopEconomyStore.ts`=brabit所有Zustand hook)を踏襲:

- **データスキーマ・純粋な変換関数**: `src/materials/`配下(alice所有)
- **Zustand store・localStorage永続・実個体IDの発行**: `src/store/`配下(brabit所有)。新設候補`src/store/failureCodexStore.ts`(persist key案`v3:failureCodex`)
- 個体在庫の永続化はPhase2の暫定ID方式からPhase3で初めて永続IDへ格上げ。ID発行はbrabit所有storeで行い、`InventoryItem`型自体は不変

**2.2節との整合**: 「セッション内で一度きり」(`ModeProgress.triggered`)はengine所有の一時状態(セッション終了で破棄)であり、「図鑑に初めて登録されたか」(`alreadyDiscoveredSet`相当)はstore層所有の永続状態である。両者は別物であり、store層の永続集合をengineへ注入することはない(engineの物理判定は何度目の発見でも同じ)。

上記分担案は本計画のFableレビュー+brabit_mot3との最終合意を経て確定する。

---

## 8. 決定論境界の保証構造(brabit Q4回答。v1から変更なし、2.2節で具体化済み)

engineの純関数(`advanceDestructionState`・`composeConfigFromMaterials`)はいずれも「毎回明示的に渡された引数のみから出力を計算する」。永続化された図鑑・WearStateを読むのは呼び出し側(store層)であり、それをengineへ引数として明示的に注入する。engine内部が`localStorage`やZustand storeを直接参照する経路は構造上ない。

---

## 9. D08と(e)周回拡張の順序問題(改訂: レビュー#4対応、A案を確定)

レビュー#4により、v1のA案/B案併記を解消し**A案を確定**する。

- Phase3では`DestructionModeId`に`'D08'`を含め、`ModeProgress`のレコードにもキーとして存在させる(図鑑の型・予約枠)。ただし`advanceDestructionState`内のD08判定は**常にfalseを返すスタブ**とし、Phase3中にD08イベントが発生することはない。
- **Phase3のDoD「全モードの再現手順テスト」からD08を明示的に除外する。** D08の実トリガ実装・再現手順テストはPhase5(e)-1(周回構造)完成後の別ステップへ移管する。これは通常のフェーズ表(CLAUDE.md)からの逸脱にあたるため、**人間のスコープ例外承認事項として本計画のFableレビュー後、人間承認時に明示的に諮る**(「D08はPhase3 DoD対象外」の承認を個別に得る)。
- 理由(v1から不変): 「限界超過→コースアウト」の判定式は(e)の保持判定式そのものであり、Phase3時点の直線コースで代用トリガを作ると、Phase5本実装時に必ず作り直しになる(使い捨て物理)。CLAUDE.mdの「実物の工作・走行で起こりうる原因と対応させる」原則にも、直線コース上の代用クラッシュ条件は馴染まない。B案(簡易代替トリガ)は不採用とする。

---

## 10. Phase2繰越事項の採否・順序(v1不変)

- ブラシパッケージ(Fable Q5判定済み): Phase3が実装先。D05設計(3節)がその本体。
- ギヤJ/D06: 同じくPhase3が実装先。D06トリガ設計(3節)に合わせ、ギヤ質量/慣性J増側の接続も同時に行う。
- 未接続5ファミリーのうちcoating/substrate/roller/body: 引き続きPhase3スコープ外。
- store層個体ID・永続化の所有: 7節で提案、brabit_mot3との協議で確定。

---

## 11. art-specにない独自解釈しない事項(改訂: レビュー#7対応、整理を修正)

v1は「3点ともart-spec未記載」としていたが、正しくは以下のとおり一部既定・一部未決である。訂正する:

1. **検死レポートの画面様式**: 「紙」様式であること自体はart-spec §5.2で既定(N6地・暗色文字、レトロ攻略本の趣)。**未決なのは、単独ダイアログとして出すか、実験ノート/図鑑と統合した1画面にするかというレイアウトのみ**。
2. **D01〜D09の固有SE**: SEを各モードへ割り当てること自体はart-spec §8で既定(「破壊モードD01〜D09それぞれに固有SEを割り当てる」と明記)。**未決なのは、各モードの具体的な音色仕様(周波数・エンベロープ等の詳細)のみ**。
3. **破壊イベント発生後の画面遷移**: 自動でリザルト/検死画面へ遷移するか、プレイヤーの操作待ちにするかは、art-spec/spec双方に記載がなく**真に未決**。

1・2はSuu_mot3経由で人間へ「レイアウト・音色の詳細のみ」を確認すればよく、3のみ独自解釈せず改めて確認が必要な事項として扱う。

---

## 12. ステップ分割案(改訂: レビュー#8対応、各stepにゲートを明記)

各stepは共通で以下の手順を踏む: **実装前ステップ計画(数値根拠・再現手順・テスト内容を明記)→Suu_mot3レビュー→Fableレビュー→人間承認→実装→`npm run test && npm run build && npm run lint`→報告**。commitは人間承認後のみ。

1. **Step1: 契約の最小実証(D01/D03)**。`destructionModes.ts`の型一式(`DestructionState`・`CauseLog`・`advanceDestructionState`)+D01/D03のみを実装する。両モードとも既存トリガ(`coilCollapsed`・`batteryHeat`/`shorted`)の流用のみで新規物理量ゼロのため、**状態機械・ログ契約そのものが正しく動くかをここで確定する**ことが目的。後続stepはこのstepで確立した契約を拡張するだけにする。数値根拠: 既存`BATTERY_HEAT_LIMIT`・`COIL_DEFORM_FRAMES`をそのまま流用するため新規較正値なし。再現手順: 同一seedでの`coilCollapsed`/`batteryHeat`超過を伴う走行を1本再生し、`DestructionEvent`列が2回とも一致することをテストで担保。テスト: `advanceDestructionState`の単体テスト(発火・非発火・二重発火防止・causeLogスナップショット固定)。ゲート事項: D01のcauseLog.temperatureに電池発熱を代用する暫定処置の可否をFableへ諮る(3節末尾)。
2. **Step2: D07磁石温度モデル+三段開示段階1・2の骨格**。spec §7.3代表例のため優先度を上げる。数値根拠: 磁石温度アキュムレータの発熱係数・`magnetDemagTempLimit`較正値(出典コメント必須、materialMapping.ts既存パターン踏襲)。再現手順: 同一構成での連続高負荷走行→段階1症状(rpm頭打ち)→段階2差分検知(3%低下通知)→段階3(WearState由来数値)の一連をシード再現でテスト。
3. **Step3: D05ブラシパッケージ**(WearState結線込み)。数値根拠: `brushSparkThreshold`較正値。既存`failures.ts`の`brushTooLoose`診断との過剰検出回避基準を明記。
4. **Step4: D06ギヤ歯欠け+ギヤJ増接続**(Phase2繰越の解消)。数値根拠: `gearStrengthThreshold`較正値(gearEfficiencyと対の表)、ギヤ質量→J増分の接続式。
5. **Step5: D02/D04**(コイル発熱経路分離・電池破壊スキーマ新設・3.1節の`batteryRunawayHeatThreshold`写像)。
6. **Step6: D09**(潤滑モデル、新規物理量の設計コストが最も高いためPhase3内最後に配置)。
7. **Step7: D08型のみ**(9節A案。トリガ結線はPhase5別ステップ、人間スコープ例外承認込み)。
8. **Step8: 図鑑store・WearState永続化**(brabit協働、7節)。
9. **Step9: 計測器店UI接続**(brabit、三段開示段階3)。

---

## 13. DoD・テスト方針(v1不変、9節の除外を反映)

- 既存DoD不変: `npm run test && npm run build && npm run lint`
- **例外**: 「全モードの再現手順テスト」からD08を除外する(9節、人間承認事項)
- engine変更(`destructionModes.ts`、motorPhysics.ts/MotorConfigへのオプショナルフィールド追加)には対応する数値テストを必ず追加
- 決定論: 同一シード+同一WearStateで同一`DestructionEvent`列が出ることをテストで担保

## 14. 未決事項一覧(v2で残るもの)

- 11節③: 破壊イベント発生後の画面遷移(自動/操作待ち)— 人間確認
- 7節: store層の最終ファイル分担 — brabit_mot3との協議で確定(本ドラフトはたたき台)
- D02/D09の較正値・式の具体値 — 各ステップ実装計画(12節)で個別に確定
- 9節: D08をPhase3 DoD対象外とする扱いの人間承認 — 本計画のFableレビュー後に諮る
