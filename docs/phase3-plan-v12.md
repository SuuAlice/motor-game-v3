# Phase 3統合計画(破壊モード+図鑑)— v12改訂版(自己完結full-text版、2026-08-02T06:47 P3-0 R1ゲート)

作成: alice_mot3 2026-08-02。**状態: 正式Fable条件付き承認・Suu最終照合通過・プロジェクトリード実装承認済み。P3-0 R1ゲート(本改訂)実施中、production/test実装は未着手。**

**本改訂の性質(R1ゲート)**: 正式Fable最終回答R1「人間承認確定後、v12を契約変更なしの自己完結統合版へ編集する」に従い、v6〜v11に残っていた「vNから継続」「vN参照」「変更なし」「表を維持」等の参照(旧版がなければ契約・型・式・DoDを復元できない記述)をすべて解消し、実装に必要な本文をこの1ファイルへ統合した。**契約・型・union・フィールド・式・定数・責務境界・工程順・DoD・承認条件は一切変更していない**(意味差分があればFable/人間の再承認対象になるため、文書統合に限定した)。改訂履歴(0節・0.1〜0.3節・16節)は過去のレビュー往復の記録として、旧版ファイル名を含む参照のまま残す(これは「改訂履歴上の参照」であり実装に必要な契約の参照ではないため、R1の解消対象に含めない)。参照元→統合先の対応表は末尾(17節)に置く。

対象: `docs/spec.md`(r2)§4.8・§5.1・§5.2・§5.3・§7.1・§7.1.1・§7.2・§7.3・§7.4・§7.5・§12・§13。既存`src/engine/motorPhysics.ts`・`vehiclePhysics.ts`・`trackPhysics.ts`・`src/materials/inventoryItem.ts`・`materialMapping.ts`・`materials.ts`・`src/store/gameStore.ts`等を確認済み(v6〜v12)。

---

## 0. v11照合4項目 対応サマリ(改訂履歴)

| # | v11の欠陥 | 対応節 |
|---|---|---|
| 1 | destruction終端確定時、`finalizeRun`へ「使われない」ダミーの`physicsEnded`を渡していた(v10レビュー#1が求めた「正当な引数なしに確定できるAPI」を満たさない) | 1.1節・4.4節: `finalizeDestructionRun`を新設し、非空`terminalModeCandidates`を型で要求する専用APIへ分離。ダミー値を完全に排除 |
| 2 | `DestructionRunContext.gearTotalToothCount: number`が必須で、ギヤを持たないmotor-onlyの正当なcontextを作れなかった | 1.4節: `DestructionRunContext`を`motor`/`vehicle`の判別unionへ変更 |
| 3 | `FireExposureProfile.adjacentRolesEquipped`が任意の`EquipmentRole`を許す一方、`DegradationDiff`のscorchはbody/magnetにしか対応しておらず、gear/brush/rotor等を選ぶと適用不能だった | 1.6節・2.4節・3.1節: `FireExposureRole`(body/magnetに限定)を新設し、全armに対応する差分・適用関数の存在を型で保証する |
| 4 | `applyRunOutcome`が整合性エラーで失敗した後も`currentRunSequence`を解放しており、次runが先に成功すると未解決のrunが高水位により永久にskipされ得た | 1.5節: `TabRuntimeState`へ`pendingApplication`を追加し、解放条件を成功・冪等skip・明示的放棄のみに限定 |

### 0.1 差分確認追補3項目(2026-08-01T21:18着信)

| # | 指摘 | 対応節 |
|---|---|---|
| A | `pendingApplication`が非永続`TabRuntimeState`にあり、整合性エラー後にreloadすると保護自体が失われる | 1.5節: `pendingApplication`を永続`SaveEnvelopeMeta`へ移動。`currentRunSequence`のみタブ内runtime状態に残す |
| B | `RunSnapshot`validatorが`context`と`track`の相互整合を「検証する」とだけ書き、motor文脈での`track`非null混入を明示的に拒否していなかった | 1.4節: `context==='motor'`なら`track===null`を必須とするvalidator規則を明記 |
| C | `adjacentRolesEquipped`(`FireExposureRole[]`)に`body`が重複して入り得た(`bodyEquipped`と二重管理) | 1.6節・2.4節・3.1節: `adjacentRolesEquipped`の型を`Exclude<FireExposureRole,'body'>[]`へ変更し、`body`の重複混入を型で排除 |

### 0.2 クロスレイヤレビュー追補2項目(2026-08-01T21:42着信、UI v5との突き合わせ)

| # | 指摘 | 対応節 |
|---|---|---|
| D | 永続`pendingApplication`が失敗時の旧`leaseToken`を持つため、reload/クラッシュ復旧後の新leaseで`retryPendingApplication`が永久に`staleLease`拒否され得た | 1.5節: `rebindLeaseForPendingApplication`によるlease引継ぎを追加(2026-08-02訂正: `sessionStorage`による同一タブ特権判定は`localStorage`以外禁止の規約に抵触するため撤回し、単一経路の判定へ変更) |
| E | `classifyTerminalModes`がD06を常に非終端として扱い、正典§7.1.1「全損で空転=走行不能」を終端として確定できなかった | 2.4節・4.4節: D06イベントへ`isTotalLoss`を追加し、全損到達時のみ`terminalModeCandidates`へ追加 |

### 0.3 正式Fable最終回答 対応(2026-08-02T05:05着信、プロジェクトリード直送)

**必須修正(正式M1〜M5、alice_mot3担当分)**:

| # | 指摘 | 対応節 |
|---|---|---|
| 正式M1 | lease待機(heartbeat新鮮でブロック中)と整合性エラー(missingEquipment等)を区別する戻り値がなく、UIが待機を「保存失敗」と誤表示しうる | 1.5節: `leaseNotAcquired`をブロック理由として追加し、heartbeat周期・stale閾値の具体値方針を明記 |
| 正式M2 | `RunSnapshot`はlocalStorage由来の`unknown`から復元されるため、`context`⟺`gearTotalToothCount`のnull性一致は型宣言だけでは守れない | 1.4節: `restoreRunSnapshot`の必須runtime検証として明記し、不一致は`invalidSchema`。DoDテストへ追加 |
| 正式M4 | D04過放電経路が、予算有効レース中に本当に炎上到達できるかの較正受け入れ条件が未記載 | 3.2節: 到達可能性の近似条件式を較正の受け入れ条件として明記し、sweep項目を追加 |
| 正式M5 | (i) magnet scorchの物理的中身(demagnetizationFractionへの加算)が未明文化 (ii) D04途中段階で走行が終わった電池の非恒久簡約が未明文化 | 1.2節・1.6節・3.2節 |

(正式M3はUI 6-B節の新規発見0件時遷移先の指摘であり、brabit_mot3のUI v5改訂事項。alice_mot3の担当外)

**追加裁定・付帯条件(alice_mot3担当分)**: A1(給電停止機構の要否をP3-1で再監査、3.2節・12節)/A2(regressionDiffのsrc/materials配置承認、5.3節)/A3(D09金属接触信号の素材ID非依存、3.4節)/C1(A1の再監査、12節)/C2(heartbeat周期・stale閾値、1.5節)/C3(rebind競合の既知限界+明示的放棄時に高水位を進めない、1.5節)/C5(終端負例テストをP3-2/P3-3/P3-4へ個別配置、12節)/C6(`unsafeDischargeStartRatio`=0.90、3.2節)/C7(HUD参照許可リストへDestructionState追加、6節)。

**確定裁定**: gear総歯数=Phase3全ギヤ共通の単一定数、値10(3.4節)/gear damage合成式=補完乗算、経済評価専用(1.2節)/D02・D09・D03は終端遷移でのみeventを発行/magnet延焼の性能劣化はdemagnetizationFractionへ加算、kindは`scorch`のまま保持(1.2節・1.6節)/D04は物理終了後に継続stepしない(3.2節)/`computeEnergyBudgetJ`のexport化を承認、P3-2実施/温度規約`uncalibratedGauge`3状態型・非遡及規則を承認(2.2節)/3アセンブリスキーマ(Rotor/Body/Bearing)・bearing非カタログ化を承認/D06/D09のギヤ損傷kind分離を追認/D03/D04のmotor-only扱い(短絡経路のみ有効)を確定。

**2026-08-02の事故と訂正の記録**: v12(追補A〜E反映版)完成後、alice_mot3がAgentツールの`model:'fable'`委任で生成した自己レビュー文書を正式なFable回答と誤認し、`docs/phase3-fable-review.md`として保存・agmsg中継した。これに基づきSuu_mot3が誤った「Fable条件付き承認 対応割当」(旧M1〜M5)を発行し、alice_mot3が本書0.3節等へ反映した。2026-08-02T04:46、Suu_mot3から即時訂正・撤回の指示を受け作業を停止。2026-08-02T05:05、プロジェクトリードが直送した正式なFable最終回答(全文)が到着し、0.3節を含む該当箇所を正式回答へ整合させた(自己生成版由来の旧M1〜M5のうち、正式回答と一致しなかったもの——test-run再現パラメータ・ギヤ初期欠損数・D06発行周期の自己流ルール・lease書き込み自己降格規則・D03/D04短絡経路の較正不変条件——は除去した)。2026-08-02T05:37・06:31にSuu_mot3の差分レビューでmagnet scorch kindの誤統合等7点を修正、2026-08-02T06:46に最終照合通過、同日プロジェクトリードが実装承認。

---

## 1. P3-0: クロスレイヤ契約(型凍結ゲート)

spec §7.5・§12「store境界の個体ID・永続化・セーブスキーマ・原子的結果反映をP3-0で確定する」に従い、D01〜D09いずれの実装よりも先に本ゲートを置く。後続のP3-1〜P3-4はここで確定した型を変更しない。

### 1.1 RunOutcomeの生成: `RunAccumulator`+`finalizeDestructionRun`/`finalizeRun`

**engineがRunOutcomeの生成を最初から最後まで完結させる**(spec §7.5「エンジンが出力するもの」)。イベントの蓄積そのものをengine側の状態(`RunAccumulator`)として持たせ、storeは毎stepこの状態を受け渡すだけにする。

```ts
export interface RunAccumulator {
  events: readonly DestructionEvent[]; // このセッションで発生した全物理イベント(発生順、追記のみ)
  destructionState: DestructionState;
  replaySnapshot: RunSnapshot; // 走行開始時に1回だけ捕捉(1.4節)、以後不変
  terminalModeCandidates: readonly DestructionModeId[]; // このrun中に「終端性質」(3節表で発火後に
  // 走行終了するモード: D02発火到達・D03・D04炎上到達・D06全損・D09焼付き)を満たしたモードを固定順序
  // (2.1節)で追記する。ここへの追記は`advanceDestructionState`の呼び出し結果からラッパー
  // (4.4節)が機械的に行うだけで、storeは一切書き込まない
}

export function createRunAccumulator(replaySnapshot: RunSnapshot, batteryProfile: 'lipo' | 'nonLipo'): RunAccumulator {
  return { events: [], destructionState: createInitialDestructionState(batteryProfile), replaySnapshot, terminalModeCandidates: [] };
}

// destruction終端専用のfinalize API。非空配列型で「terminalModeCandidatesが1件以上ある」ことを
// 引数の型そのもので保証する(ダミー値を伴わずに正当な終端引数を作れるAPI)
export function finalizeDestructionRun(
  accumulator: RunAccumulator & { terminalModeCandidates: readonly [DestructionModeId, ...DestructionModeId[]] },
): RunOutcome {
  const [first, ...rest] = accumulator.terminalModeCandidates;
  return {
    endReason: 'destructionTerminal',
    terminalModes: [first, ...rest],
    events: accumulator.events,
    destructionState: accumulator.destructionState,
    degradationDiffs: deriveDegradationDiffs(accumulator.events, accumulator.destructionState),
    replaySnapshot: accumulator.replaySnapshot,
  };
}

// finalizeRunは非destruction終了専用に純化する(RunEndSignalにdestructionTerminal相当の
// バリアントを持たない。物理的な終了・手動中断だけを扱う)
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

// finalizeRunは常にterminalModeCandidatesが空であるaccumulatorに対してのみ呼ばれる
// (呼び出し側の規約、4.4節。destruction終端が先に成立していればfinalizeDestructionRunが
// 既にterminationを確定させているため、この関数へ到達すること自体がない)
export function finalizeRun(accumulator: RunAccumulator, endSignal: RunEndSignal): RunOutcome {
  const degradationDiffs = deriveDegradationDiffs(accumulator.events, accumulator.destructionState);
  const endReason = endSignal.kind === 'manualAbort' ? 'manualAbort' : convertPhysicsEndStatusToEndReason(endSignal.physicsEndStatus);
  return { endReason, events: accumulator.events, destructionState: accumulator.destructionState, degradationDiffs, replaySnapshot: accumulator.replaySnapshot };
}

// v9レビュー#11で確定した導出規則。engine出力である以上、store/materials層に再導出させない
// - 集約規則: 同一(role, kind)の複数イベントはこのrun内で合算し、1本のDegradationDiffへ集約する
// - clamp規則: engineは個体の現在値(絶対値)を知らないため、ここではdelta(増分)のみを返しclamp
//   しない。絶対値への反映・範囲clampはstore側(degradationApplication.ts)の責務とする
// - 手動中断時も同じ規則を適用する(終了時点までに蓄積されたeventsから導出するのみ)
// - 決定論: 同一のevents+finalDestructionStateを与えれば常に同一の結果を返す
export function deriveDegradationDiffs(
  events: readonly DestructionEvent[],
  finalDestructionState: DestructionState,
): readonly DegradationDiff[];
```

`DestructionStepResult.termination`(4.4節)は**`finalizeDestructionRun`だけから生成する**。`terminalModeCandidates`が非空になったことの型上の保証は、4.4節のラッパーが空/非空を分岐判定してから`finalizeDestructionRun`を呼ぶことで満たす。

**destruction終端とmanualAbortの優先順位**: 同一境界で競合した場合、既に成立済みのdestructionを優先する。`termination`のチェックが常にmanualAbort処理より先行するようstoreループの順序を規定する。

**motor-onlyの終了理由**: motor-onlyコンテキストには`physicsEnded`シグナルが存在しない(既存`SimState`は`status`概念自体を持たない)。`manualAbort`か`termination`(destruction終端)のいずれかでのみ終わる。

### 1.2 損壊可能アセンブリと劣化差分の再設計

**「損壊可能アセンブリ」の境界**: rotor/body/bearingを実在素材カタログに接続しない架空の`InventoryItem.family`として追加することはしない。**material family**(既存の実在素材分類、`materials.ts`の9ファミリー)と、**damageable equipment/assembly**(ローター組立物・ボディ個体・軸受部などの損壊状態を表す別スキーマ)を分離する。assemblyは構成素材・在庫IDを参照できるが、自身を架空素材として扱わない。

```ts
// Phase4巻線記録方式への移行を見据えた最小スキーマ。Phase3時点では「巻かれた線材が壊れたか
// どうか」の2値+由来の線材素材IDのみを持つ
export interface RotorAssemblyState {
  assemblyId: string;              // 個体ID(store発行)
  sourceWireMaterialId: WireMaterialId | null; // 既存StackableStockEntry(wire)はmaterialId+quantityMの
  // スタック在庫であり個体IDを持たないため、個体IDではなく素材IDを保持する
  consumedWireM: number;           // 組み立て時にスタック在庫から引き当てた量
  collapsed: boolean;              // D01: 崩壊開始済みか
  burnedOut: boolean;              // D02: 発火到達により全損したか
}

// bodyは既存の実在素材(materials.tsのbodyファミリー)を持つ個体
export interface BodyPartState {
  assemblyId: string;
  materialId: BodyMaterialId; // materialMapping.tsに未export。src/materials/inventoryItem.ts内で
  // (typeof BODY_MATERIALS)[number]['id']としてMagnetMaterialId等と同じパターンでローカル再宣言する
  scorchFraction: number;     // 0(無傷)〜1(全損)。D04延焼由来
}

// 軸受はmaterials.tsに素材ファミリーとして存在しない。ギヤに付随する非交換部位として扱う
export interface BearingAssemblyState {
  assemblyId: string;
  gearItemId: string;         // 付随先のギヤInventoryItem.itemId
  seizureFraction: number;    // 0〜1、D09の摩擦増進行度の恒久側
}
```

**D06/D09のギヤ損傷kind分離**: `WearState`の`gear` kindを次のとおり拡張する(既存`src/materials/inventoryItem.ts`のWearStateを修正):

```ts
export type WearState =
  | { readonly kind: 'magnet'; readonly demagnetizationFraction: number }
  | { readonly kind: 'gear'; readonly totalToothCount: number; readonly toothLossCount: number; readonly seizureFraction: number }
  | { readonly kind: 'brush'; readonly wearFraction: number };
```

`toothLossCount`(D06、離散カウント)と`seizureFraction`(D09、連続量、0–1)を別フィールドとして保持する(D06=脆性破壊、D09=凝着摩耗という別現象であり、混同しない)。`totalToothCount`は個体属性として保存する(店・サルベージ画面がrunのconfigを保持しなくても復元できるようにするため)。runtime検証: `totalToothCount > 0`、`toothLossCount`は有限非負整数(`totalToothCount`超過はしない、3.4節の状態遷移規則で保証)。

**`EquipmentRole`(全アセンブリ/個体を横断する役割の全体集合)**:

```ts
export type EquipmentRole = 'rotor' | 'battery' | 'gear' | 'brush' | 'magnet' | 'bearing' | 'body';
```

**magnetの延焼(D04)の入力契約**: `DegradationDiff`は`{role:'magnet', kind:'scorch', deltaFraction}`(D04延焼由来)と`{role:'magnet', kind:'demagnetization', deltaFraction}`(D07不可逆到達由来)を**別kindとして保持する**(正式Fable M5(i)の原文「`{role:'magnet', kind:'scorch'}`が`demagnetizationFraction`(D07と同一量)へ加算される」——kind自体を削除・統合するのではなく、**原因kindは保持したまま、適用先(物理的な保存量)だけをD07と共有する**)。

```ts
export type DegradationDiff =
  | { role: 'magnet'; kind: 'demagnetization'; deltaFraction: number } // D07不可逆到達
  | { role: 'magnet'; kind: 'scorch'; deltaFraction: number }          // D04延焼(magnet対象時)。
  // kindはdemagnetizationと別だが、適用先(WearState.magnet.demagnetizationFraction)は共有する。
  // 「火災熱による減磁」という物理的な保存先の共有と、検死ログ上の原因(D04延焼 vs D07使用上限
  // 超過)の区別を両立させる(正式Fable M5(i)の原文どおりの契約、1.6節で適用規則を明記)
  | { role: 'gear'; kind: 'toothLoss'; deltaCount: number }            // D06
  | { role: 'gear'; kind: 'seizure'; deltaFraction: number }           // D09のうちギヤ側
  | { role: 'bearing'; kind: 'seizure'; deltaFraction: number }        // D09のうち軸受側
  | { role: 'brush'; kind: 'wear'; deltaFraction: number }             // D05
  | { role: 'rotor'; kind: 'collapse' }                                // D01
  | { role: 'rotor'; kind: 'burnout' }                                 // D02発火到達
  | { role: 'battery'; kind: 'consumed' }                              // D03/D04共通
  | { role: 'body'; kind: 'scorch'; deltaFraction: number };           // D04延焼(body必須対象。bodyは
  // 性能パラメータを持たない外観のみの個体のため、scorch kindのまま外観劣化として残す
```

集約規則: `demagnetization`と`scorch`(magnet)はそれぞれ独立に「同一kindごと高々1件」へ集約される。**同一run内で両方のkindが発生した場合、`applyMagnetDiff`(1.6節)が両方のdiffを受け取り、双方の`deltaFraction`を合算して単一の`WearState.magnet.demagnetizationFraction`へ加算する**——加算先は共有するが、`degradationDiffs`配列上は`demagnetization`と`scorch`の2件が別々に残り、検死ログ・実験ノート上でどちらの原因由来かを追跡できる。

**gear damage合成式(正式Fable Q3回答、確定)**: `WearState.gear`の`toothLossCount`と`seizureFraction`から総合損傷率を求める式を**補完乗算合成**とする。根拠: max案は片方の損傷を完全に無視する。加重和は恣意的な重み定数を要し、clamp飽和で情報を失う。補完乗算は「独立な損傷が残存価値に順に効く」モデルで、単調・片方ゼロで他方に一致・1を超えない・新規較正定数ゼロ。

```ts
// src/materials/inventoryItem.ts。補完乗算合成(Fable確定裁定)
export function computeCompositeGearDamageFraction(wearState: Extract<WearState, { kind: 'gear' }>): number {
  const toothLossFraction = Math.min(1, wearState.toothLossCount / wearState.totalToothCount);
  return 1 - (1 - toothLossFraction) * (1 - wearState.seizureFraction);
}
```

**適用範囲の制約(Fable明記事項)**: **この合成値はサルベージ等の経済評価専用であり、物理には一切使わない**(伝達効率は`toothLossCount`から、摩擦は`seizureFraction`から、それぞれ独立に算出する)。サルベージ率はprovisional(Phase 5較正、spec §14)のため、この式は較正値ではなく構造(clamp不要・両者0のとき0・片方1のとき1になる境界挙動)として固定する。

### 1.3 store所有・PlayerInventoryの拡張

既存`PlayerInventory`(`src/materials/inventoryItem.ts`)に、1.2節の3アセンブリを追加する:

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

個体ID(`itemId`・`assemblyId`)の発行はすべてstore所有(brabit)。engineはこれらの実IDを一切知らない(1.8節)。

### 1.4 リプレイスナップショット契約: `DestructionRunContext`・`RunSnapshot`

**motor-only/vehicleを判別するunion**: ギヤを持たないmotor-onlyベンチrunの正当な`DestructionRunContext`を作れるよう判別unionにする。

```ts
export type DestructionRunContext =
  | { context: 'motor'; fireExposureProfile: FireExposureProfile; gearTotalToothCount: null }
  | { context: 'vehicle'; fireExposureProfile: FireExposureProfile; gearTotalToothCount: number };
```

D06(3節表、ギヤ歯欠け)は`context === 'vehicle'`のアームでのみ評価する(`destructionModes.ts`内部、2.4節)。

`RunSnapshot`のruntime検証で、次の相互整合を**validatorが必須条件として拒否する**:

- `runContext.context === 'motor'` ⟺ `carConfig === null` かつ `initialVehicleState === null` **かつ `track === null`(必須)**。motor-onlyの`RunSnapshot`に`track`が非nullで紛れ込んでいた場合、`restoreRunSnapshot`は`invalidSchema`として拒否する
- `runContext.context === 'vehicle'` ⟺ `carConfig !== null` かつ `initialVehicleState !== null`。この場合のみ`track`の非null性は自由(test-run由来(`stepTestRun`はコース長`courseLengthM`のみを取り`TrackDefinition`を持たない)なら`track === null`、track-run由来なら`track`が非null。いずれも合法)

**正式M2(確定): `runContext`自体のruntime検証を必須化する**: `RunSnapshot`(ひいては`runContext`)はlocalStorage由来の`unknown`から復元されるため、TypeScriptの型宣言だけでは実行時の不正値を防げない。**`restoreRunSnapshot`の必須検証として、`context==='motor' ⟺ gearTotalToothCount===null`、`context==='vehicle' ⟺ gearTotalToothCountが正の有限整数`であることを明記し、不一致は`invalidSchema`として拒否する。** この検証をDoDテストへ追加する(12節)。

```ts
export interface RunSnapshot {
  contractVersion: number;  // 固定dt・シミュレーション契約の版。現行1固定
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  runContext: DestructionRunContext;
  initialMotorState: SimState;
  initialVehicleState: VehicleSimState | null;
  track: TrackDefinition | null; // 素のTrackDefinitionを保存する(brandはlocalStorage保存に意味を
  // 持たないため)。読み込み時にcreateValidatedTrackで必ず再検証する
  seed: number;
  initialDestructionState: DestructionState;
}

// store側(materialsまたはstore層、実装ステップで確定)。保存直前に呼び、以後の生きた
// config/state参照の変更がsnapshotへ波及しないようdeep copyする
export function captureRunSnapshot(/* ...実行時の生config/state群... */): RunSnapshot;

export interface RestoredRunSnapshot {
  contractVersion: number;
  motorConfig: MotorConfig;
  carConfig: CarConfig | null;
  destructionConfig: DestructionConfig;
  runContext: DestructionRunContext;
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
  // initialMotorState/initialVehicleState/seed/initialDestructionState/runContextのいずれかが
  // 有限数・判別unionとして不正
  | { ok: false; reason: 'invalidTrack'; details: string };   // track再検証失敗

// localStorage由来のJSON.parse結果はunknownとして受け取る
export function restoreRunSnapshot(raw: unknown): RestoreRunSnapshotResult;
```

`RunAccumulator`は`replaySnapshot: RunSnapshot`のみを保持し、`runContext`の二重コピーを持たない。

### 1.5 runIdの所有境界・冪等性・並行実行の完全化

**engineは`saveId`・`runSequence`を型としても値としても一切知らない。** 走行IDの発行・適用管理はすべてstore側の責務とする。

```ts
// store側(engineではない)の型。RunOutcomeをラップしてstoreの適用処理へ渡す
export interface RunApplicationEnvelope {
  runKey: { saveId: string; runSequence: number };
  leaseToken: string; // 発行時点のリーストークン。適用時に古いタブ由来かを判定する
  outcome: RunOutcome; // engine出力そのもの(1.1節)
  equipmentSnapshot: EquipmentIdSnapshot; // 走行開始時点の実装備ID一覧(役割→実ID解決用)。
  // 具体的なフィールドはP3-0実装ステップで確定する
}

export interface SaveEnvelopeMeta {
  saveId: string;
  lastAppliedRunSequence: number; // 適用成功した最大runSequence(高水位)
  nextRunSequence: number;        // 次に発行する番号。発行時に即座にインクリメントし永続化する
  // (run自体が完走せず放棄されても、この番号が再利用されることはない)
  leaseToken: string;             // 現在アクティブなタブ/セッションのリース識別子
  leaseHeartbeatAt: string;       // ISO時刻。アクティブタブが定期的に更新する
  pendingApplication: RunApplicationEnvelope | null; // 永続化する。整合性エラー等で確定できなかった
  // 結果をここへ保持する。reloadしても失われず、新規runのブロック・再試行の両方をタブをまたいで
  // 継続できる
}

export interface TabRuntimeState {
  currentRunSequence: number | null; // タブ内runtime状態のみ(reloadで自然に失われる)
}
```

`EquipmentIdSnapshot`は、`RunApplicationEnvelope`が走行開始時点の実装備ID一覧を保持するための型であることのみ確定しており、具体的なフィールド構成(役割→実IDの対応をどう表現するか)は**意図的にP3-0実装ステップまで未凍結のまま残す**(1.9節の型一覧でも同型を指す)。これは記述漏れではなく、店・在庫UIの実データ形状(brabit所有)が確定してから決める設計判断であり、本改訂(R1)でも新しいフィールドを発明しない。

**`applyRunOutcome`が返すエラー種別(正式M1、lease待機と整合性エラーの区別)**: 現契約では、reload直後はheartbeatが新鮮なため(pendingの有無に関わらず)新規run開始も再試行もstale判定までブロックされる。これは正しい設計だが、この「lease未取得・待機中」という状態と、`missingEquipment`等の**整合性エラー**が、戻り値上で区別されていなかった。これではUIが単なる待機を「保存失敗」と偽表示しうる。**storeアクションの失敗理由へ`leaseNotAcquired`(待機中、エラーではない)を追加し、整合性エラー系(`missingEquipment`等)とは異なる種類として返す。**

```ts
export type ApplyRunOutcomeError =
  | { kind: 'saveIdMismatch' }   // 別セーブへの不正入力
  | { kind: 'staleLease' }       // 古いタブ由来(下記回復フロー)
  | { kind: 'leaseNotAcquired' } // heartbeatが新鮮なため待機中であり、整合性エラーではない。
  // UIはこれを「前回セッションの終了確認中」の待機表示とし、stale到達時に自動再判定する
  // (UI側の具体的な表示はbrabit_mot3のUI v5改訂事項、14節)
  | { kind: 'missingEquipment'; role: EquipmentRole };
```

**`applyRunOutcome`(原子的結果反映の本体)**:

```ts
export interface AppliedRunResult {
  runKey: { saveId: string; runSequence: number };
  applied: boolean; // 既に適用済み(冪等skip)の場合false、新規適用ならtrue
  newlyDiscoveredModes: readonly DestructionModeId[]; // このrunで初めて図鑑登録されたモード
  rewardsGrantedG: number; // 図鑑新規登録・サルベージ等に伴う報酬(仮の経済値、Phase5較正)
  resolvedDegradations: ReadonlyArray<{ role: EquipmentRole; resolvedAssemblyOrItemId: string }>;
  // RunOutcome.degradationDiffsの各roleが、equipmentSnapshot経由でどの実個体/アセンブリIDへ
  // 解決されたかの記録(検死ログ・実験ノート表示用)
}

export type ApplyRunOutcomeResult =
  | { ok: true; result: AppliedRunResult; nextInventory: PlayerInventory; nextDiscoveredModes: ReadonlySet<DestructionModeId>; nextSaveMeta: SaveEnvelopeMeta }
  | { ok: false; error: ApplyRunOutcomeError };

// src/store/runOutcomeApplication.ts。RunOutcomeをstoreへ原子的に反映する唯一の入口(7節)。
// saveId・leaseToken・runSequence<nextRunSequenceを検証し、envelope.equipmentSnapshotから
// degradationDiffsの各roleを実個体/アセンブリIDへ解決したうえで、1.6節のapplyXxxDiff群を
// 適用する。途中で一つでもmissingEquipmentが発生した場合は部分適用せず全体を失敗させ、
// pendingApplicationへ保持する(原子性契約、1.5節)
export function applyRunOutcome(
  envelope: RunApplicationEnvelope,
  currentInventory: PlayerInventory,
  discoveredModes: ReadonlySet<DestructionModeId>,
  saveMeta: SaveEnvelopeMeta,
): ApplyRunOutcomeResult;
```

**整合性エラー後の次run開始を防ぐ**: 「適用完了(成功・失敗いずれも確定)後、`currentRunSequence`をnullへ戻す」という規約は、`missingEquipment`等の整合性エラーで原子的適用が失敗した後も次runを開始できてしまい、N+1が先に成功すると未解決のNが高水位により永久にskipされる欠陥を生む。修正: **解放条件を成功・冪等skip・明示的放棄のみに限定する**。

```ts
// 起動時、saveMeta.pendingApplicationが非nullなら新規runの開始を即座にブロックする
// (currentRunSequenceの有無に関わらない)。再試行はこの関数を呼ぶ
export function retryPendingApplication(
  saveMeta: SaveEnvelopeMeta,
  currentInventory: PlayerInventory,
  discoveredModes: ReadonlySet<DestructionModeId>,
): ApplyRunOutcomeResult; // saveMeta.pendingApplicationを対象にapplyRunOutcomeと同じ処理を行う。
// 成功すればpendingApplicationをnullへ戻し、失敗すれば保持したままにする
```

- 新規run開始のブロック条件は**`saveMeta.pendingApplication !== null`**(タブをまたいで有効)、または**同一タブ内で`currentRunSequence !== null`**(タブ内の多重run防止)のいずれかが真の場合
- `pendingApplication`を解放(nullへ戻す)してよいのは次の3つの場合のみ: (a) `retryPendingApplication`(または初回の`applyRunOutcome`)が成功、(b) 既に適用済みと判明(冪等skip)、(c) プレイヤー/開発者が明示的に「この走行結果を破棄する」操作を確定した場合(UI側の救済導線、14節)
- `missingEquipment`等の整合性エラー(`ok:false`)が発生した場合、`saveMeta.pendingApplication`へその`RunApplicationEnvelope`を保持したまま永続化する
- **stale lease(他タブ由来)の拒否と、現所有タブのpending結果は混同しない**。`leaseToken`不一致による拒否は、そのタブ自身の`TabRuntimeState.currentRunSequence`に対してのみ作用し、永続`pendingApplication`には影響しない
- `applyRunOutcome`/`retryPendingApplication`は`saveId`・`leaseToken`・`runSequence < nextRunSequence`を検証する

**正式M1(確定): lease待機状態を整合性エラーと区別する**: 現契約では、reload直後はheartbeatが新鮮なため(pendingの有無に関わらず)新規run開始も再試行もstale判定までブロックされる。これは正しい設計だが、この「lease未取得・待機中」という状態と、`missingEquipment`等の**整合性エラー**が、戻り値上で区別されていなかった。これではUIが単なる待機を「保存失敗」と偽表示しうる。**storeアクションの失敗理由へ`leaseNotAcquired`(待機中、エラーではない)を追加し、整合性エラー系(`missingEquipment`等)とは異なる種類として返す。**`ApplyRunOutcomeError`・`ApplyRunOutcomeResult`の型定義は本節前段(`applyRunOutcome`本体の直前)に統合済み。

**heartbeat周期・stale閾値**: 「短い値+`pagehide`を補助として使い、reload待機を実用範囲に抑える」という方針を確定する。具体的な数値較正は実装ステップで行ってよい(alice所見として、heartbeat更新間隔5秒・stale判定閾値20秒程度を出発点として提案するが、P3-0実装時のsweep・人間試遊で調整可)。`pagehide`はタブが正常終了する際にheartbeatを早期に無効化する補助として使ってよいが、正しさの根拠は常にheartbeatタイムスタンプ比較に置く(発火保証がないため)。

**rebind競合の既知の限界**: localStorageは非トランザクションであるため、2タブが同時にstale判定し`rebindLeaseForPendingApplication`を実行した場合、**最後の書き込みが勝つ**(既知の限界として明記するのみとし、これを解決する追加の同期プロトコルは導入しない)。

**明示的放棄時の高水位の扱い**: プレイヤー/開発者が「この走行結果を破棄する」操作を確定した場合、`lastAppliedRunSequence`は**進めない**。放棄済みのrunSequenceは永久に未適用のまま残り、後続の(より大きい番号の)runが正常に適用された時点で、高水位が自然にそれを飛び越える。

```ts
// 明示的放棄。pendingApplicationをnullへ戻すだけで、lastAppliedRunSequenceには触れない
export function abandonPendingApplication(saveMeta: SaveEnvelopeMeta): SaveEnvelopeMeta {
  return { ...saveMeta, pendingApplication: null };
}
```

**pending結果のlease引継ぎ**: 永続`pendingApplication`は失敗時点の(古い)`leaseToken`を保持している。reload・クラッシュ復旧後に新しい`leaseToken`が発行されると、`retryPendingApplication`が`staleLease`で永久に拒否され得る欠陥がある。**同一タブのreloadを特権扱いせず、すべての起動を単一の経路で扱う**(`sessionStorage`は`localStorage`ではないためCLAUDE.md規約に抵触し不採用)。

- 起動時、`saveMeta.leaseHeartbeatAt`が新鮮(既定の閾値以内)であれば、それが自分自身の直前のタブによるものか他タブによるものかを区別せず、**新規run開始・`retryPendingApplication`のいずれもブロックする**(安全側に倒す。正当な同一タブreloadであっても例外にしない)
- `leaseHeartbeatAt`が閾値を超えて古ければstaleと判定し、`rebindLeaseForPendingApplication`(下記)で新leaseを取得してから`retryPendingApplication`を呼ぶ
- `pagehide`等のイベントは、タブが正常終了する際に`leaseHeartbeatAt`を早期に無効化する**補助**として使ってよいが、**正しさの根拠にはしない**

```ts
// leaseを新所有者へ原子的に引き継ぐ。saveId・runSequence・RunOutcome・equipmentSnapshotは
// 一切変更せず、leaseTokenだけを新所有者のものへ更新する。統合save envelope(1.3節)への
// 単一のset()呼び出しとして実装し、原子性契約から逸脱しない
export function rebindLeaseForPendingApplication(
  saveMeta: SaveEnvelopeMeta,
  newLeaseToken: string,
): SaveEnvelopeMeta {
  return {
    ...saveMeta,
    leaseToken: newLeaseToken,
    leaseHeartbeatAt: /* 現在時刻のISO文字列 */ '',
    pendingApplication: saveMeta.pendingApplication === null
      ? null
      : { ...saveMeta.pendingApplication, leaseToken: newLeaseToken },
  };
}
```

rebind後、旧タブ(古い`leaseToken`をまだ保持している)が`retryPendingApplication`または通常の`applyRunOutcome`を試みても、`leaseToken`不一致により`staleLease`で拒否される(所有権は新タブへ移っている)。「pendingあり→reload/lease引継ぎ→再試行成功」「旧タブがrebind後に拒否される」の統合テストをP3-0 DoDへ含める(12節)。

### 1.6 劣化適用APIの型安全化

**`affectedRoles`とscorch差分の型を一致させる**: `FireExposureProfile.adjacentRolesEquipped: readonly EquipmentRole[]`は任意のroleを許す一方、`DegradationDiff`のscorch(延焼)差分は`body`と`magnet`にしか対応しておらず、gear/brush/rotor等を選ぶとengineが適用可能な差分を生成できない矛盾を生む。修正: **Phase3で延焼差分に対応するroleを`FireExposureRole`として明示的に限定する**。

```ts
// Phase3で延焼差分(scorch)に対応するroleをこの2つに限定する。gear/brush/rotor等への延焼を
// 将来的に追加する場合は、この型・対応するDegradationDiff・適用関数を同時に拡張する
export type FireExposureRole = 'body' | 'magnet';

export interface FireExposureProfile {
  bodyEquipped: boolean;
  // bodyは既にbodyEquippedで別管理しているため、adjacentRolesEquippedの型からbodyを除外する
  // (Exclude<FireExposureRole,'body'>)。これによりbodyの二重管理・重複混入が型レベルで
  // 起こり得なくなる
  adjacentRolesEquipped: readonly Exclude<FireExposureRole, 'body'>[]; // 現状は実質'magnet'[]のみだが、
  // 将来FireExposureRoleが拡張されてもbodyだけは常にこの配列から除外される
}

export function validateFireExposureProfile(
  raw: { bodyEquipped: boolean; adjacentRolesEquipped: readonly Exclude<FireExposureRole, 'body'>[] },
): { ok: true; profile: FireExposureProfile } | { ok: false; reason: string };
```

**role別関数への分離**: `applyDegradationDiffToAssembly(diff, current: Rotor|Body|Bearing|null)`のような統合関数は、`diff.role`と`current`の型が対応していない不正な組み合わせを型上許してしまう。修正: role別に完全に分離する。

```ts
// src/materials/degradationApplication.ts。個体単位の小さな適用変換のみ(RunOutcome全体・
// save meta・実個体の集合は一切知らない)
export function applyMagnetDiff(diff: Extract<DegradationDiff, { role: 'magnet' }>, current: Extract<WearState, { kind: 'magnet' }>): Extract<WearState, { kind: 'magnet' }>;
export function applyGearDiff(diff: Extract<DegradationDiff, { role: 'gear' }>, current: Extract<WearState, { kind: 'gear' }>): Extract<WearState, { kind: 'gear' }>;
export function applyBrushDiff(diff: Extract<DegradationDiff, { role: 'brush' }>, current: Extract<WearState, { kind: 'brush' }>): Extract<WearState, { kind: 'brush' }>;
export function applyRotorDiff(diff: Extract<DegradationDiff, { role: 'rotor' }>, current: RotorAssemblyState): RotorAssemblyState;
export function applyBodyDiff(diff: Extract<DegradationDiff, { role: 'body' }>, current: BodyPartState): BodyPartState;
export function applyBearingDiff(diff: Extract<DegradationDiff, { role: 'bearing' }>, current: BearingAssemblyState): BearingAssemblyState;
// batteryは状態更新ではなく消滅(配列からの除去)のため、変換関数を持たない。
// src/store/runOutcomeApplication.ts(store層)が該当battery InventoryItemをID解決して
// 配列から直接除去する専用処理を持つ
```

**`applyMagnetDiff`の適用規則(正式Fable M5(i))**: `applyMagnetDiff`は`{role:'magnet', kind:'demagnetization'}`(D07由来)と`{role:'magnet', kind:'scorch'}`(D04延焼由来)の両方のkindを受け取る。**両kindとも、加算先は同一の`WearState.magnet.demagnetizationFraction`である**(「火災熱による減磁」という物理的な保存先をD07と共有するが、原因kindは`scorch`のまま保持し、`demagnetization`kindへ統合・変換しない)。同一run内で両方のkindが発生した場合、`applyMagnetDiff`は両方の`deltaFraction`を合算して単一の`demagnetizationFraction`更新として適用する。

**対象装備が存在しない場合の扱い**: `DegradationDiff`が指すroleの個体が走行開始時装備スナップショットに存在しない場合、**原則すべて整合性エラーとする**(黙ってskipしない)。理由: destruction eventは、その発火の時点で該当roleの装備が物理的に存在したことを前提として生成される(例: D06はloadTorqueNmの計算にギヤが必須であり、ギヤ不在ではそもそもD06イベント自体が起こり得ない)。`applyRunOutcome`はこの場合`{kind:'missingEquipment'; role}`エラーを返す。

**toothLossCountの不変条件**: `0 <= toothLossCount <= totalToothCount`。`totalToothCount`を超過した値を許容してclampする案は不採用——`destructionModes.ts`のD06判定ロジック自体が、`toothLossCount`が`runContext.gearTotalToothCount`へ到達した時点で「全損・空転」状態へ遷移し、以後は新たな歯欠けイベント/差分を生成しない設計にする(境界はengine内部の状態遷移規則で保証し、下流のclampに頼らない)。

**旧`toothDamageFraction`からの移行時の丸め・サルベージ率差**: 移行式`toothLossCount = round(toothDamageFraction × 既定totalToothCount(=10、3.4節))`は丸め誤差を伴い、移行前後でわずかにサルベージ率が変わり得る。これは一度きりの、文書化された離散化誤差として許容する。

### 1.7 全終了経路とreload保証範囲

**経路一覧**: motor-only(`stepMotorWithDestruction`)・test run(`stepTestRunWithDestruction`)・track run(`stepTrackRunWithDestruction`)のいずれも、同一の`RunAccumulator`を介し、destruction終端は`finalizeDestructionRun`(1.1節、step結果の`termination`経由)、非destruction終端は`finalizeRun`(1.1節、`RunEndSignal`経由)のいずれかを通って`RunApplicationEnvelope`→`applyRunOutcome`(1.6節)へ到達することをテストで担保する。`manualAbort`はUI操作起点でstoreが`finalizeRun`を呼ぶ際の`endReason`として渡す(engine自体は中断操作を検知しない)。

**reload保証範囲**: **保証されるのは「走行終了(`termination`確定または`finalizeRun`呼び出し)確定後」のreload安全性のみ**である。`applyRunOutcome`が原子的に完了した時点で、その走行の結果は失われない。**走行途中(終端確定前)のタブクローズ・reloadでは、その走行の`RunAccumulator`自体が未確定であり、進行中の走行データは失われる**(仕様上のスコープ外。復旧が必要ならactive runの逐次永続化という別設計が要るが、本計画では対象外とする)。

### 1.8 engineの個体ID非依存性

engineのどのモジュール(`destructionModes.ts`・`destructionOrchestration.ts`)も、`InventoryItem.itemId`・`RotorAssemblyState.assemblyId`等の実ID・所持金・図鑑発見状態・`saveId`・`runSequence`を一切参照しない(1.5節で明確化)。

### 1.9 使用する型の定義元一覧

| 型 | 定義元 | 備考 |
|---|---|---|
| `MotorConfig`・`SimState`・`Rng` | `src/engine/motorPhysics.ts`(既存) | 無改修 |
| `CarConfig`・`VehicleSimState`・`FailureCode` | `src/engine/vehiclePhysics.ts`(既存) | 無改修 |
| `TrackDefinition`・`ValidatedTrackDefinition` | `src/engine/trackPhysics.ts`(既存) | 無改修。`validateTrackDefinition`・`createValidatedTrack`を1.4節で再利用 |
| `DestructionModeId`・`DestructionState`・`DestructionEvent`・`RunAccumulator`・`RunOutcome`・`DegradationDiff`・`RunSnapshot`・`RestoredRunSnapshot`・`FireExposureProfile`・`FireExposureRole`・`DestructionRunContext`・`DestructionConfig`・`finalizeDestructionRun`・`finalizeRun` | `src/engine/destructionOrchestration.ts`(新規) | engine契約(1節・2節) |
| `WearState`・`InventoryItem`・`PlayerInventory`・`RotorAssemblyState`・`BodyPartState`・`BearingAssemblyState`・`EquipmentRole` | `src/materials/inventoryItem.ts`(既存を拡張) | 1.2節・1.3節 |
| `WireMaterialId`・`GearMaterialId`・`MagnetMaterialId`・`BatteryMaterialId` | `src/materials/inventoryItem.ts`内でローカル再宣言(既存パターン、`materialMapping.ts`の同名exportとは意図的に別) | 既存 |
| `BodyMaterialId` | `src/materials/inventoryItem.ts`で`(typeof BODY_MATERIALS)[number]['id']`として、既存の`MagnetMaterialId`等と同じパターンでローカル再宣言する(`BODY_MATERIALS`は`src/materials/materials.ts`に既存export) | 1.2節 |
| `EquipmentIdSnapshot`・`AppliedRunResult`・`SaveEnvelopeMeta`・`TabRuntimeState`・`RunApplicationEnvelope`・`ApplyRunOutcomeResult`・`ApplyRunOutcomeError`・`applyRunOutcome`・`retryPendingApplication`・`abandonPendingApplication`・`rebindLeaseForPendingApplication` | `src/store/runOutcomeApplication.ts`(新規、store層) | 1.5節・1.6節 |
| `applyMagnetDiff`・`applyGearDiff`・`applyBrushDiff`・`applyRotorDiff`・`applyBodyDiff`・`applyBearingDiff`・`computeCompositeGearDamageFraction`・`validateFireExposureProfile` | `src/materials/degradationApplication.ts`または`inventoryItem.ts`(新規/拡張) | 1.2節・1.6節 |

---

## 2. モジュール構成と状態機械設計

```
src/engine/destructionModes.ts          # D01〜D07・D09の状態機械(純関数)。leafモジュール
src/engine/destructionOrchestration.ts  # RunAccumulator操作+finalizeDestructionRun/finalizeRun+
                                         # deriveDegradationDiffs+captureRunSnapshot/restoreRunSnapshot
src/engine/__tests__/destructionModes.test.ts
src/engine/__tests__/destructionOrchestration.test.ts
src/materials/degradationApplication.ts # 個体単位の小さな適用変換のみ(1.6節)
src/materials/__tests__/degradationApplication.test.ts
src/store/runOutcomeApplication.ts      # applyRunOutcome等(1.5節・1.6節)
src/store/__tests__/runOutcomeApplication.test.ts
```

`destructionModes.ts`を`motorPhysics.ts`と同じ「leafモジュール」(他のengineモジュールに依存しない)に保つ。3節の状態機械はmotorPhysics.ts由来の値を**引数として**受け取るだけで、motorPhysics.ts/vehiclePhysics.ts/trackPhysics.tsをimportしない。vehicle層・track層との結合は`destructionOrchestration.ts`が担う(4節)。

### 2.1 型設計: 共有信号+モード別Progress+排他的電池state

```ts
export type DestructionModeId =
  | 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D09';
// D08はここに含めない(2.3節)

export interface DestructionSharedSignals {
  shortCircuitDurationS: number; // 短絡継続秒数。D03/D04が共通で参照する積分(3.1節)
  elapsedTimeS: number;          // セッション内経過秒数。causeLog.atTの唯一の出典
}

export function createInitialSharedSignals(): DestructionSharedSignals {
  return { shortCircuitDurationS: 0, elapsedTimeS: 0 };
}

export interface D01Progress { triggered: boolean; triggeredAtT: number | null; causeLog: D01CauseLog | null; }
export interface D02Progress {
  triggered: boolean;      // 「発火到達」。発煙段階に入っただけではtrueにしない(spec §7.1.1)
  triggeredAtT: number | null;
  coilHeatGaugeRatio: number; // 0–1、無次元(3.2節)。発煙段階の進行度でもある
  causeLog: D02CauseLog | null;
}

// D03/D04: 排他的判別union(spec §7.1.1「D04はリポ専用。D03と排他」)。写像層が電池素材から
// 'lipo'か'nonLipo'かを一意に決め、DestructionConfig(4節)へ渡す。engineは判別された
// プロファイルだけを見る
export type BatteryDestructionProgress =
  | { profile: 'nonLipo'; d03: D03Progress }
  | { profile: 'lipo'; d04: D04Progress };

export interface D03Progress { triggered: boolean; triggeredAtT: number | null; causeLog: D03CauseLog | null; }
export interface D04Progress {
  triggered: boolean; // 「炎上到達」
  triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning'; // spec §7.1.1「膨張→発煙→炎上」
  stageEnteredAtT: number | null;
  overDischargeActive: boolean; // 過放電経路が現在進行中か(3.2節)
  causeLog: D04CauseLog | null;
}

// D05: 異常スパークepisodeのrising edgeのみをイベント化する設計
export interface D05Progress {
  sparkDurationS: number;             // 現在の連続スパーク継続時間(chatterFramesLeft>0が続く間
  // dt積算。停止(chatterFramesLeft===0)で0へリセットし、episodeTriggeredも同時にリセットする)
  episodeTriggered: boolean;          // 今の連続スパーク中に既にイベント発行済みか(1連続スパーク
  // につき最大1件)
  episodeCount: number;               // 検死ログ・恒久劣化算出用の累積episode数(このセッション内)
  cumulativeSparkExposure: number;    // A·s単位。Σ max(0, theoreticalCurrentA -
  // config.d05.brushSparkCurrentThresholdA) × dt(chatterFramesLeft>0の間のみ積算)。
  // episode跨ぎでリセットしない、run全体の累積摩耗量の唯一の出典
  firstEpisodeAtT: number | null;
  causeLog: D05CauseLog | null;       // 最初のepisode分のみ保持
}

// D06: 反復状態。toothLossCountは物理イベントの累積回数そのもの
export interface D06Progress {
  toothLossCount: number;
  firstLossAtT: number | null;
  causeLog: D06CauseLog | null;
}

// D07: 三概念分離(熱ゲージ・可逆熱ダレ・不可逆減磁)
export interface D07Progress {
  magnetHeatGaugeRatio: number;     // 0–1、無次元。熱ゲージそのもの(常時更新)
  reversibleDroopActive: boolean;   // 可逆熱ダレが現在進行中か(高温域でBが一時低下)。図鑑登録なし
  irreversibleTriggered: boolean;   // 不可逆減磁への初回到達(図鑑登録対象)
  irreversibleTriggeredAtT: number | null;
  causeLog: D07CauseLog | null;     // 不可逆減磁到達時のみ記録
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
    modes: { /* 全モードtriggered:false、継続量0、causeLog:null */ },
  };
}
```

`batteryProfile`はセッション開始時に一度だけ写像層が決定し(3.4節)、以後セッション中は不変。

**`advanceDestructionState`(状態機械の唯一の入口)**:

```ts
export interface DestructionFrameInput {
  currentA: number;                 // 実電流(チャタリング反映後)。next.currentそのもの
  theoreticalCurrentA: number;      // チャタリング反映前の理論電流(D05用)
  rpm: number;                      // next.rpmそのもの
  batteryHeat: number;              // 0–1、next.batteryHeatそのもの
  shorted: boolean;                 // next.shortedそのもの
  chatterFramesLeft: number;        // next.chatterFramesLeftそのもの
  coilCollapsedRisingEdge: boolean; // didCollapseJustHappen(prev, next)の結果(D01用)
  loadTorqueNm?: number;            // 車両層のみ。motor-onlyの呼び出しではundefined(D06はこの場合スキップ)
  energyUsedRatio?: number;         // 車両層のみ。motor-onlyではundefined(D04過放電経路はこの場合スキップ)
}

export function advanceDestructionState(
  prev: DestructionState,
  frame: DestructionFrameInput,
  config: DestructionConfig,
  runContext: DestructionRunContext,
  dt: number,
): { state: DestructionState; events: readonly UnstampedDestructionEvent[] };
```

内部で①`shared`を先に更新(`elapsedTimeS += dt`、`shortCircuitDurationS`の積分)→②`battery`(判別された方のみ)→③その他モードの順に判定する。`events`は固定順序(D01→D02→[D03またはD04]→D05→D06→D07→D09)で並べる(決定論)。D06は`runContext.context === 'vehicle'`のアームでのみ評価する。

### 2.2 CauseLogと温度規約

```ts
export type TemperatureReading =
  | { kind: 'measured'; temperatureC: number }   // 将来の温度SI較正完了後にのみ生成される(spec §7.4「別ゲート」)。Phase3では生成しない
  | { kind: 'uncalibratedGauge'; ratio: number }  // Phase3の既定。0–1無次元ゲージ値+「温度モデル未較正」の事実そのもの
  | { kind: 'unavailable' };                       // 熱指標が存在しないモード(D01・D05・D06)

export interface CauseLogCommon {
  currentA: number;                // A(spec §7.1「電流」)
  rpm: number;                     // min⁻¹(spec §7.1「回転数」)
  atT: number;                     // セッション内秒(spec §7.1「タイムスタンプ」)。shared.elapsedTimeSのスナップショット
  temperature: TemperatureReading; // spec §7.1「温度」。D02/D03/D04/D07/D09はuncalibratedGauge、D01/D05/D06はunavailable。Phase3ではmeasuredを生成しない
}

export interface D01CauseLog extends CauseLogCommon {} // temperatureは常にunavailable
export interface D02CauseLog extends CauseLogCommon { coilHeatGaugeRatio: number; } // temperature.kind==='uncalibratedGauge'、ratio===coilHeatGaugeRatio
export interface D03CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; }
export interface D04CauseLog extends CauseLogCommon {
  batteryHeatRatio: number; shortCircuitDurationS: number; stage: D04Progress['stage'];
  overDischargeRatio: number | null; // 過放電経路が絡んだ場合の比率(3.2節)。短絡経路のみの発火ではnull
}
export interface D05CauseLog extends CauseLogCommon { sparkDurationS: number; } // temperatureはunavailable
export interface D06CauseLog extends CauseLogCommon { loadTorqueNm: number; toothLossCount: number; } // temperatureはunavailable。累積歯欠け数を記録
export interface D07CauseLog extends CauseLogCommon { magnetHeatGaugeRatio: number; } // temperature.kind==='uncalibratedGauge'。不可逆到達時のみ生成
export interface D09CauseLog extends CauseLogCommon { bearingHeatGaugeRatio: number; } // temperature.kind==='uncalibratedGauge'
```

**共通/固有フィールドの境界規約**: 共通4項目はspec §7.1が明記する範囲に厳密一致。モード固有の追加フィールドは3節の物理トリガ判定式(「物理トリガ」列)に登場する量そのものに限定する。D04の`stage`のみ例外(演出段階の記録として必要)。D06の`toothLossCount`も例外(検死レポートに「何本目の歯欠けか」を残す必要があるため、反復イベントゆえの追加)。

**スナップショット確定の原則**: `causeLog`は`triggered`がfalse→trueに反転するその1ステップの`frame`引数の値をそのままCauseLogとして書き込み、以後は上書きしない。`atT`は`shared.elapsedTimeS`のこのstep更新後の値を記録する。`temperature`・`currentA`・`rpm`・`batteryHeat`・`shorted`等はすべてnext(このstep終了時点)のSimState/VehicleSimState由来の値を記録する。`coilCollapsedRisingEdge`のようなprev/next比較の結果(真偽値)は、比較そのものの生値を記録するのではなく、比較結果が「このstepで確定した事実」としてcauseLogに反映される。根拠のない追加フィールド(検討時に候補へ上がった`theta`等)は追加しない。

**D03/D04も`uncalibratedGauge`(`ratio`=`batteryHeatRatio`)である**(`batteryHeat`は既存SimStateの0–1ゲージであり、無次元熱ゲージそのものであるため)。

**非遡及規則(正式Fable R2、確定)**: 将来、温度SI較正が完了し`measured`状態を生成できるようになった場合でも、**較正完了前に記録済みの`causeLog`は書き換えない**——過去の記録は記録時点の正直な状態(`uncalibratedGauge`または`unavailable`)をそのまま保持する。**新規に発火するイベントのみが`measured`を生成する。** `TemperatureReading`が判別unionであるため、この移行は型の破壊的変更を伴わずに行える(旧記録の型は`uncalibratedGauge`/`unavailable`のまま有効であり続ける)。

**Fableへ諮った仕様判断(確定済み、案A採用)**: `temperature`が`{kind:'unavailable'}`になり得ることは、spec §7.1「破壊時のパラメータログ(電流・温度・回転数・タイムスタンプ)をエンジンが記録する」という要求を満たすかどうかという仕様解釈に関わっていたが、正式Fable回答が`uncalibratedGauge`3状態型を承認したことで確定した(案A: 実温度モデルを持たないモードは`unavailable`のままPhase3完成として扱う)。

**ガウスメーターとの関係**: ガウスメーターの表示値(実効/公称`magnetStrength`比率)はD07の`magnetHeatGaugeRatio`とは別の量であり、三段開示段階3の実装対象。本節の`TemperatureReading`型とは独立に扱う。

### 2.3 D08の扱い

engineの`DestructionState`・`DestructionModeId`にD08を含めない。spec §7.1・§12がD08をPhase5(e)拡張後と確定済みであるため、Phase3のengine側にD08の型・遷移・演出コールバックの枠を一切用意しない。図鑑UI用の予約枠は、store層/UI層専用の別型`FailureCodexModeId`に限定する:

```ts
export type FailureCodexModeId =
  | 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D08' | 'D09'; // 全9種(D08を含む)
```

この型はengineの`DestructionModeId`(Phase3時点ではD01〜D07・D09の8種)とは別物であり、Phase5で(e)-1完成後にengine側`DestructionModeId`へD08を追加した時点で両者は一致する。この設計(engine型を最小に保ち、拡張はPhase5で型そのものを広げる/store層に別枠を作る、のどちらを採るか)は**Fableへ裁定を依頼済み**(9節参照)。

### 2.4 イベント契約

**`advanceDestructionState`の戻り値とスタンプ前/後の型分離**: D04の延焼対象(`affectedRoles`)・D06の全損判定(`gearTotalToothCount`)はいずれも個体IDを含まない値であり、`destructionModes.ts`のleafモジュール方針を破らずに引数(`runContext`)として受け取れる。これにより、D04の炎上到達イベントは`advanceDestructionState`の内部で**即座に完成した`affectedRoles`を持つ**(後付けのスタンプが不要)。一方`physicsSnapshotAtT`は、`destructionModes.ts`が`SimState`/`VehicleSimState`の実体を知らない(leafモジュール)ため、**これだけは引き続きラッパー(4節)が後付けする**。この非対称性を型で表現するため、`advanceDestructionState`の戻り値は内部専用の`UnstampedDestructionEvent`(公開`DestructionEvent`から`physicsSnapshotAtT`を除いた形)とする。

```ts
export type PhysicsSnapshotAtT =
  | { context: 'motor'; state: SimState }
  | { context: 'vehicle'; state: VehicleSimState };

// destructionModes.ts内部専用(非export、またはengine内部限定export)
type UnstampedDestructionEvent =
  | { mode: 'D01'; causeLog: D01CauseLog; isFirstThisSession: true }
  | { mode: 'D02'; causeLog: D02CauseLog; isFirstThisSession: true }
  | { mode: 'D03'; causeLog: D03CauseLog; isFirstThisSession: true }
  | { mode: 'D04'; causeLog: D04CauseLog; isFirstThisSession: true; affectedRoles: readonly FireExposureRole[] } // 炎上到達(stage'burning')した瞬間、
  // destructionModes.ts内部でruntContext.fireExposureProfileを参照し、bodyEquipped(真なら'body'を
  // 先頭へ1回だけ追加)+adjacentRolesEquipped(型上bodyを含み得ない)を連結して組み立てる
  | { mode: 'D05'; causeLog: D05CauseLog; isFirstThisSession: boolean } // episode単位、複数あり得る
  | { mode: 'D06'; causeLog: D06CauseLog; isFirstThisSession: boolean; isTotalLoss: boolean } // このイベントで
  // toothLossCountがrunContext.gearTotalToothCountへ到達したか(「全損で空転=走行不能」spec §7.1.1)。
  // destructionModes.ts内部でrunContext.gearTotalToothCountと比較して確定する。全損到達後は
  // 新たな歯欠けevent/差分を生成しない(上限保証はengine内部の状態遷移規則が担い、下流clampに頼らない)
  | { mode: 'D07'; causeLog: D07CauseLog; isFirstThisSession: true }
  | { mode: 'D09'; causeLog: D09CauseLog; isFirstThisSession: true };

// 公開型。orchestration層(4節)がUnstampedDestructionEvent + physicsSnapshotAtTから組み立てる
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

**D05の「episode」の定義**: 「通常整流の微小火花」はイベント化しない。`chatterFramesLeft>0`かつ電流が異常しきい値を超えている状態が継続している間は1つの物理イベントとして扱い、`sparkDurationS`が`config.d05.brushSparkDurationLimitS`へ初めて到達した瞬間(rising edge)にのみ1件発行する。その後、同一の連続スパーク中は再発行しない。スパークが一度止み、その後再び異常状態に入った場合のみ次のepisodeとして2件目を発行する。

汎用`severity`フィールドは持たない。`deriveDegradationDiffs`(1.1節)が各モード固有フィールドから型安全に劣化差分を導出する。

---

## 3. D01〜D09個別設計

| ID | 性質 | 物理トリガ | 発火後(セッション内) | 恒久劣化(走行終了時反映) | 図鑑登録条件 | 競合規則 |
|---|---|---|---|---|---|---|
| D01 | 崩壊開始イベント+進行 | `frame.coilCollapsedRisingEdge`(既存`didCollapseJustHappen`由来、4.2節) | 実効巻数・占積が漸減、振動増(既存`coilCollapsePenaltyMm`機構、`stepVehicle`が既に実装済み)。走行継続 | rotor個体(`RotorAssemblyState.collapsed=true`)。サルベージのみ可 | 崩壊開始の初回 | — |
| D02 | 進行(発煙)→終端(発火) | 発煙: `coilHeatGaugeRatio>=config.d02.smokeGaugeThreshold`。発火: `>=config.d02.coilOverheatGaugeLimit` | 発煙段階はR_coil増で出力低下・走行継続。発火で走行終了 | rotor個体焼損(`burnedOut=true`) | **発火到達の初回**(発煙のみでは登録しない) | — |
| D03 | 瞬時・終端 | `shared.shortCircuitDurationS >= config.battery.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= BATTERY_HEAT_LIMIT`。**非リポ系(アルカリ/NiMH)専用** | 電源喪失で走行終了(既存`stepVehicle`の`status:'overheated'`機構がそのまま働く) | battery個体消滅(くず値極小) | 破裂の初回 | **リポ搭載時はD03自体が存在しない**(構造的排他、2.1節の判別union) |
| D04 | 段階遷移(膨張→発煙→炎上) | 短絡経路: D03と同型条件(しきい値は`config.battery.runawayHeatThreshold`)。過放電経路: `energyUsedRatio >= config.battery.unsafeDischargeStartRatio`。**リポ専用**、いずれかで発火 | 膨張で内部抵抗悪化、炎上到達で走行終了+近接延焼判定(3.2節) | battery個体消滅+近接部位焼損(magnet/body) | 炎上到達の初回 | **D03と排他**(構造的、同一原因での二重報酬を型で禁止) |
| D05 | 反復・強度連続量 | `sparkDurationS >= config.d05.brushSparkDurationLimitS`(閾値超過ごとにepisode反復) | スパーク中は接触抵抗一時悪化、摩耗加速。走行継続 | brush摩耗量加算(`cumulativeSparkExposure`由来) | 異常強度/継続時間の閾値超の初回(通常整流の微小火花は登録対象外) | — |
| D06 | 反復イベント(歯単位) | `config.d06.breakage.kind === 'breakable'`かつ`frame.loadTorqueNm > config.d06.breakage.gearStrengthThresholdNm`(瞬間判定、歯欠けごとに反復発生。`kind==='nonBreakable'`ならこの判定自体を行わない) | 歯欠けごとに伝達効率低下・トルクリップル増。全損で空転=走行不能 | gear個体の`toothLossCount`加算 | 最初の歯欠け(2回目以降は反復物理イベントとして扱うが図鑑には再登録しない) | チタンは発火しない(3.4節、写像層が`{kind:'nonBreakable'}`プロファイルを返す) |
| D07 | 三概念分離 | (i)可逆熱ダレ: `magnetHeatGaugeRatio`が高温域しきい値超過(冷却で回復、図鑑登録なし) (ii)不可逆減磁: 使用上限超過で初回到達 | (i)一時的なB低下、冷却で回復。走行継続。イベント非発行 (ii)恒久B低下。走行は継続 | magnet個体の`demagnetizationFraction`加算(不可逆到達時のみ) | 不可逆域への初回到達のみ | 症状・診断はspec §7.3の三段開示に従う(6節) |
| D08 | Phase3対象外 | Phase3のDestructionStateに含めない(2.3節・9節) | — | — | — | — |
| D09 | 進行(摩擦増)→終端(焼付き) | `bearingHeatGaugeRatio >= config.d09.bearingSeizureGaugeLimit`。入力は「金属ギヤ接触または高負荷軸受×高速継続」の簡約判定(spec §7.1.1・§13) | 焼付きで急減速・走行終了 | `BearingAssemblyState.seizureFraction`加算+gear個体の`seizureFraction`加算 | 焼付きの初回 | 無潤滑相当の簡約判定。潤滑アイテムは導入しない(spec §13) |

共通規則(spec §7.1.1): 図鑑登録は1走行につき同一モード1回まで。イベントは状態遷移の**立ち上がりで1回だけ**発行する(毎フレーム再発行の禁止)。D03/D04の排他を除き、複数モードの同時成立を許す。破壊判定を行うのはengineのみ。UIはengineの発行するイベントを描画するだけで、独自の閾値判定を持たない。

### 3.1 D04: `affectedRoles`の組み立て順序

`FireExposureProfile.adjacentRolesEquipped`が`FireExposureRole`から`body`を除いた型(`Exclude<FireExposureRole,'body'>[]`)に限定されたことに伴い、`affectedRoles`(2.4節)は`destructionModes.ts`内部で次のとおり組み立てる: **`bodyEquipped`が真なら`'body'`を先頭へ1回だけ追加し、続けて`adjacentRolesEquipped`(型上`body`を含み得ない)をそのまま連結する**。この構成順により、`affectedRoles`に`body`が重複して現れることは型・組み立てロジックの両方から起こり得ない。

具体的な隣接関係の内容(`magnet`を含めるかどうか等)はart-spec・実配置データに基づく判断であり、独自解釈せずFableレビュー後にSuu・人間承認を経てP3-0実装時に凍結する(正式Fable Q5は物理的妥当性のみ確認済み。最終的なart/layout判断はSuu・人間承認)。

### 3.2 D04: 過放電・給電停止後の進行

**過放電経路**: 既存`VehicleSimState.energyUsedJ`と`trackPhysics.ts`の`computeEnergyBudgetJ`(要export化、下記)の比`energyUsedJ / computeEnergyBudgetJ(motorConfig)`が`config.battery.unsafeDischargeStartRatio`を超えたら過放電経路が発火する。

**`unsafeDischargeStartRatio`の設計上の性質・初期値(正式Fable Q1回答、確定)**: エンジンに電圧垂下・SoCモデルがない以上、`energyUsedJ / computeEnergyBudgetJ`は過放電(電圧cutoff割れ)の**唯一の正直な代理指標**である。物理的意味: 実LiPoの放電曲線は容量末尾で電圧が崩落し、負荷下では定格の概ね9割消費以降が損傷域に相当する。**初期値`0.90`を設計較正値として採用する**(ラベル+「電圧cutoffの代理」の簡約であることを明記する)。

- **`hasEnergyBudget`の値に関わらず過放電経路は評価する(無効化しない)**: `energyUsedJ`は予算無効レースでも積算される(実コード確認済み)。フリー走行で定格を超えて回し続ければ過放電が発火するのは**物理的に正直な帰結**であり、意図した仕様として明記する(抑制しない)
- `energyUsedJ`(実コード確認: `batteryVoltage × evaluation.current × dt`)は**短絡時`current=0`のため短絡放電のエネルギーを含まない**。この比は「モーターへ供給した放電」のみを測る代理指標であり、短絡由来の熱暴走は別経路(`shortCircuitDurationS`)が担う——このことを実装時のdocコメントへ明記する
- motor-onlyでは`energyUsedJ`が存在しないため過放電経路は判定不可(`energyUsedRatio: undefined`)

**正式M4(確定): 予算有効レース中の炎上到達可能性を較正の受け入れ条件にする**: 過放電経路の炎上到達には、閾値超過から`stageDurations.swellingS + stageDurations.smokingS`の経過が、予算有効レース(`hasEnergyBudget===true`)では`energyExhausted`(比率1.0への到達)より**先に完了する**必要がある。これがないと、図鑑の花形であるD04が予算レースで原理的に到達不能なまま較正が通ってしまう事故が起こり得る。次の近似条件をP3-2較正の受け入れ条件として明記する。

```
(1 − unsafeDischargeStartRatio) × energyBudgetJ ÷ 想定消費電力 > swellingS + smokingS
```

**較正・DoD**: Phase3ゲートのsweepへ「リポ×高負荷構成で、予算有効レース中に炎上到達可能であること」の確認を追加する(通常構成が到達しないこと・高負荷LiPo構成が到達することの両方、P3-2)。

**D04が既存物理終了後に継続stepしない(正式Fable Q2回答、確定・採用文言)**: 既存の凍結早期returnパターン(`stepVehicle`/`stepTrackRun`の終端安定性)と矛盾しない唯一の案として採用する。正当化(Fable指定の文言をそのまま採用): 「**膨張・発煙は電流・熱入力に駆動される段階であり、物理step停止で駆動項が消える。自己持続的熱暴走はburning到達のみが表現し、burningは即終端であるため走行後の時間発展を必要としない。**」`energyExhausted`と`destructionTerminal`が同一run内で排他になる帰結も正しい。

**正式M5(ii)(確定): D04途中段階の電池非恒久簡約を明文化する**: 膨張・発煙段階のまま走行が終わった電池個体には**恒久状態を残さない**(実物の膨張は不可逆だが、spec §5.2は電池の恒久状態を要求していない——「電池は恒久結果を別スキーマ(WearState対象外)」という3節表の整理と整合する)。UI側はこの簡約に整合させ、走行外(ガレージ画面等)で膨張表示をしないことを条件とする(14節、brabit_mot3のUI v5改訂事項)。走行の記録(`destructionState`・実験ノート)には膨張域到達が残るため、「現象は隠さない」(spec §1.2)は満たされる。

**D02/D04/D07の実効config合成**: 発煙段階のR_coil増(D02)・膨張段階の内部抵抗悪化(D04)・可逆熱ダレのB低下(D07)は、いずれも既存`stepVehicle`の`effectiveMotorConfig`合成(`{...motorConfig, axisOffsetMm: effective}`、既存コード確認済み)と同型のパターンで、**destructionStateの純関数として毎stepラッパー内(4節)で合成する**。**合成後configをラッパー外へ一切出さない(保存・表示に使わない)ことを実装規約とする**——リプレイは`RunSnapshot`の元configから同じ合成を再計算することで再現し、合成済みの中間値をシリアライズしない。D02のR_coil重ね掛けは、走行継続中の実効値変更として引き続き必要であり正式Fableレビューで承認済み(決定論はリプレイが同じ経路で再計算するため保たれる)。

**A1(正式Fable指摘、P3-1で再監査): 給電停止機構の要否を見直す**: 給電停止オーバーライド機構(D02発火・D03・D04炎上で走行を終了させるための`MotorConfig`新規任意フィールド案(a)/`stepTestRun`新規任意引数案(b))は、`termination`設計(4節、終端成立時点でstoreがstepを止める)により**導入動機が既に消滅している可能性が高い**。**P3-1計画で要否を再監査し、不要ならMotorConfig無改修のまま導入しない**(エンジン凍結の観点で厳密に優る)。D02発煙段階のR_coil重ね掛け(上記、走行継続中の実効値変更)とは別物であり、これは引き続き必要。

**`computeEnergyBudgetJ`のexport化**: 正式Fable承認済み(Q1「非export関数の可視性追加のみで、実装・既存呼び出し元・テストへの影響ゼロ」)。P3-2で行う(4.1節)。

### 3.3 D05: episodeモデル+強度統合

2.1節・2.4節参照。`cumulativeSparkExposure`(A·s、超過電流×時間の積分、`theoreticalCurrentA`基準)は物理的に正しい——スパーク強度は遮断電流に比例し、チャタリング中の実電流ではなく理論電流を使うのが正当(正式Fable回答で確認済み)。既存`nextBatteryHeat`のI²R的な「超過量を積分する」設計パターンと同型。換算係数(A·s→wearFraction)の較正値はP3-3実装ステップで確定する。episode件数(`episodeCount`)・図鑑初回性(`isFirstThisSession`)・連続摩耗量(`cumulativeSparkExposure`)は互いに独立して保持し、混同しない。

### 3.4 D06/D09: ギヤ損傷の完全分離、全損の内部状態遷移、gear総歯数、D09入力の素材ID非依存性

D06/D09のギヤ損傷kind分離(`toothLossCount`/`seizureFraction`の独立保持、1.2節)・全損の内部状態遷移(下流clampに頼らない)は正式Fableレビューが追認済み(0.3節)。

**gear総歯数(正式Fable Q4回答、確定)**: Phase3は**全ギヤ共通の単一の設計較正値定数**とする。値は**10**とする(既存の移行式`toothLossCount = round(toothDamageFraction × 既定totalToothCount)`の既定値との一貫性)。根拠: 素材ティアは同一形状の材質違いというspec §4の前提(Phase2の`assumedGeometry`単一出典方針と同じ原則)であり、歯数差を素材に紐づけるのは物性でない差の捏造になる。個体の`WearState`に保存する現設計(取得時にこの定数から複写する、1.2節)は将来の形状導入に開かれており維持する。

チタンギヤは発火しない: `materialMapping.ts`が写像するD06較正値(`GearBreakageProfile`、4.2節)自体をチタンについて`{kind:'nonBreakable'}`(明示プロファイル)に設定することで表現する。「非常に大きいしきい値」のようなハックではなく、破損しないという事実そのものを構造化する。engineが素材IDでチタンかどうかを分岐することはしない。

**A3(正式Fable指摘、確定): D09の「金属ギヤ接触」信号は素材ID非依存で渡す**: 具体的な入力信号(高負荷軸受×高速継続の判定式)自体はP3-4で確定してよいが、設計制約を今固定する——金属接触の事実は、D06の`GearBreakageProfile`と同じパターンで、`materialMapping`が写像するconfigプロファイル(または蓄積率係数)としてengineへ届き、**engineが素材IDで分岐することは決してない**(3.5節の原則そのもの)。

### 3.5 D03/D04/D06: 素材family/ID非依存の設計

`materialMapping.ts`(alice所有)が、電池素材から`battery.profile`(`'lipo' | 'nonLipo'`)と、profile別の較正値(非リポ系: `shortCircuitDurationLimitS`、リポ系: `shortCircuitDurationLimitS`+`runawayHeatThreshold`+`unsafeDischargeStartRatio`+段階遷移時間)を一意に写像する。ギヤ素材からD06較正値(`GearBreakageProfile`、チタンは`nonBreakable`)を写像する。engineのコード上に素材ID・family文字列が一切現れない設計を実装ステップの受け入れ条件とする。

```ts
// materialMapping.ts に追加(既存BATTERY_INTERNAL_RESISTANCE_RATIO_CALIBRATION等と同じ書式)
const BATTERY_RUNAWAY_HEAT_THRESHOLD_CALIBRATION: Record<BatteryMaterialId, number | undefined> = {
  // リチウムイオン系: 熱暴走特性を持つためBATTERY_HEAT_LIMIT未満の実測相当値を設定(出典コメント必須)
  // ニッケル水素・アルカリ系: 熱暴走特性を持たないためundefined(D04は物理的に発生しない)
};
```

---

## 4. destructionOrchestration.ts

### 4.1 既存3関数(変更なし)

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

既存exportの再利用: `didCollapseJustHappen(prev, next)`・`didBatteryJustOverheat(prev, next)`・`didShortJustHappen(prev, next)`(motorPhysics.ts、境界検出ヘルパー)、`computeElectricalState(config, theta, omega)`(motorPhysics.ts、チャタリング判定前の理論電気状態)。本節で`trackPhysics.ts`の`computeEnergyBudgetJ`をexportする(3.2節、可視性の追加のみ、既存挙動・呼び出し元は無改修)。

### 4.2 DestructionConfig(段階導入対応)

段階実装中(P3-1〜P3-4の途中)は`DestructionConfigDraft`(モード別optional)、Phase3完成条件としては`DestructionConfig`(必須フィールド+ランタイムvalidator)という2型構成にする(「設定忘れを無言で無効化しない」ことを型で保証する)。

```ts
export type BatteryDestructionConfig =
  | { profile: 'nonLipo'; shortCircuitDurationLimitS: number }
  | {
      profile: 'lipo';
      shortCircuitDurationLimitS: number;
      runawayHeatThreshold: number;
      unsafeDischargeStartRatio: number; // (0,1)、初期値0.90(3.2節)
      stageDurations: { swellingS: number; smokingS: number };
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

D06の判定式(3節表`config.d06.breakage.kind === 'breakable'`かつ`frame.loadTorqueNm > config.d06.breakage.gearStrengthThresholdNm`)における`totalToothCount`は、判定対象個体の`WearState.gear.totalToothCount`(1.2節)から都度読む(configではなく個体から読む値)。

**未確定点**: `composeConfigFromMaterials`(`src/materials/materialMapping.ts`所属、engineの純関数ではない、8節)の戻り値に`DestructionConfig`を追加で持たせるか、`DestructionConfig`専用の別関数として分離するかは未確定。Step1実装計画で確定する。

### 4.3 電池config(4.2節に統合済み)

v9で電池configを独立節として検討したが、`BatteryDestructionConfig`(判別union、profile別に必須フィールドが変わる)という形で4.2節の`DestructionConfig`へ統合済みであり、別節として独立した内容は存在しない。本節はその統合済みという事実を示す内部見出しであり、外部版(v9等)を参照しないと復元できない内容は持たない。

### 4.4 ラッパー関数: `RunAccumulator`の受け渡しと`termination`の生成

```ts
function classifyTerminalModes(events: readonly UnstampedDestructionEvent[]): readonly DestructionModeId[] {
  const result: DestructionModeId[] = [];
  for (const event of events) {
    if (event.mode === 'D02') result.push('D02'); // D02はeventが存在する時点で常に発火到達(terminal)
    if (event.mode === 'D03') result.push('D03');
    if (event.mode === 'D04' && event.causeLog.stage === 'burning') result.push('D04');
    if (event.mode === 'D06' && event.isTotalLoss) result.push('D06'); // 全損到達のみterminal。
    // 途中の歯欠けeventは非終端のまま
    if (event.mode === 'D09') result.push('D09');
  }
  return result;
}

function stampPhysicsSnapshot(events: readonly UnstampedDestructionEvent[], snapshot: PhysicsSnapshotAtT): readonly DestructionEvent[] {
  return events.map((e) => ({ ...e, physicsSnapshotAtT: snapshot }));
}

// 型の絞り込みヘルパー: 配列長0チェックにより非空配列型であることをTypeScriptへ伝える
function asNonEmpty<T>(arr: readonly T[]): readonly [T, ...T[]] | null {
  return arr.length > 0 ? (arr as readonly [T, ...T[]]) : null;
}

// motor-only版のframe構築。既存exportのdidCollapseJustHappen・computeElectricalStateを再利用する
function buildMotorOnlyFrameInput(config: MotorConfig, prev: SimState, next: SimState): DestructionFrameInput {
  const theoreticalCurrentA = computeElectricalState(config, prev.theta, prev.omega).current; // 既存の
  // 純関数を再呼び出し(evaluateMotorFrame内部で計算されているのと同じ値を、同じ入力(config、
  // prevのtheta/omega)で再度得る。乱数を消費しない純関数の再呼び出しであり、rng消費順・
  // 決定論には影響しない)
  return {
    currentA: next.current, theoreticalCurrentA, rpm: next.rpm, batteryHeat: next.batteryHeat,
    shorted: next.shorted, chatterFramesLeft: next.chatterFramesLeft,
    coilCollapsedRisingEdge: didCollapseJustHappen(prev, next), // 既存exportそのまま
    loadTorqueNm: undefined, energyUsedRatio: undefined, // motor-onlyではD06入力・過放電比のいずれも無し
  };
}

export interface DestructionStepResult<TPhysicsState> {
  physicsState: TPhysicsState;        // 既存step関数がそのまま返す値。中身は無改変
  accumulator: RunAccumulator;        // 次stepへ持ち越す値(1.1節)
  termination: RunOutcome | null;     // 非nullなら、このstepでdestruction終端が確定した。
  // storeはこれ以上物理stepを呼ばず、この値をそのままRunOutcomeとして使う
}

export function stepMotorWithDestruction(
  config: MotorConfig, motorState: SimState,
  accumulator: RunAccumulator, destructionConfig: DestructionConfig,
  dt: number, rng?: Rng, loadTorque?: number, effectiveInertia?: number,
): DestructionStepResult<SimState> {
  const physicsState = step(config, motorState, dt, rng, loadTorque, effectiveInertia); // 既存、無改修
  const frame = buildMotorOnlyFrameInput(config, motorState, physicsState);
  const { state, events } = advanceDestructionState(
    accumulator.destructionState, frame, destructionConfig, accumulator.replaySnapshot.runContext, dt,
  );
  const snapshot: PhysicsSnapshotAtT = { context: 'motor', state: physicsState };
  const stampedEvents = stampPhysicsSnapshot(events, snapshot);
  const nextTerminalModeCandidates = [...accumulator.terminalModeCandidates, ...classifyTerminalModes(events)];
  const nextAccumulator: RunAccumulator = {
    ...accumulator,
    destructionState: state,
    events: [...accumulator.events, ...stampedEvents],
    terminalModeCandidates: nextTerminalModeCandidates,
  };
  const nonEmptyTerminalModes = asNonEmpty(nextTerminalModeCandidates);
  const termination = nonEmptyTerminalModes
    ? finalizeDestructionRun({ ...nextAccumulator, terminalModeCandidates: nonEmptyTerminalModes })
    : null; // ダミー値を経由せず、finalizeDestructionRunだけがterminationを生成する
  return { physicsState, accumulator: nextAccumulator, termination };
}

// vehicle/track版は契約骨格のみ(loadTorqueNmを含む専用frame builderはP3-4で確定)
export function stepTestRunWithDestruction(
  motorConfig: MotorConfig, carConfig: CarConfig, vehicleState: VehicleSimState,
  accumulator: RunAccumulator, destructionConfig: DestructionConfig,
  dt: number, courseLengthM: number, rng?: Rng, slopeRad?: number,
): DestructionStepResult<VehicleSimState>; // runContextの受け渡し・terminationの生成はP3-2で確定

export function stepTrackRunWithDestruction(
  motorConfig: MotorConfig, carConfig: CarConfig, track: ValidatedTrackDefinition,
  vehicleState: VehicleSimState, accumulator: RunAccumulator, destructionConfig: DestructionConfig,
  dt: number, rng?: Rng,
): DestructionStepResult<VehicleSimState>; // P3-4で確定
```

**store側の呼び出し規約**: 毎step、`result.termination`を最優先で確認する。非nullならそれを`RunOutcome`として直ちに使い、以後の物理stepを呼ばない。nullの場合のみ、既存`physicsState.status`(vehicle/track)の変化を見て`finalizeRun`を呼ぶかどうかを判断する(motor-onlyでは`manualAbort`のみ)。

### 4.5 状態の所有者・初期化・受け渡し・呼び出しタイミング

- **所有者**: `RunAccumulator`はstore層が保持する
- **初期化**: セッション開始時、store層が`captureRunSnapshot`でリプレイスナップショットを確定し、`createRunAccumulator(replaySnapshot, batteryProfile)`(1.1節)を呼ぶ
- **次stepへの受け渡し**: store層は`accumulator`を読み、`stepXxxWithDestruction`へ渡し、返ってきた`accumulator`を次のsetの戻り値に含める。既存の`s._vehicleRngState`(前回値を読んで次回値を書き戻す)と同型のパターン
- **呼び出しタイミング・rng消費順**: `advanceDestructionState`は、各`stepXxxWithDestruction`ラッパー内部で既存物理ステップ(`step`/`stepTestRun`/`stepTrackRun`)の呼び出し直後、rngを一切消費せずに呼ばれる。`buildMotorOnlyFrameInput`内の`computeElectricalState`呼び出しもrngを使わない純関数のため、rng消費順序に影響しない。1ステップ内の消費順は「①既存物理ステップ内部のrng消費処理→②既存物理ステップが`SimState`/`VehicleSimState`を確定→③frame構築(rng非消費)→④`advanceDestructionState`(rng非消費)」に固定され、既存物理ステップ内部のrng消費順序には一切触れない(既存テストのシード再現性に影響しない)。1フレームあたり物理ステップ最大2回の非機能要件は`advanceDestructionState`にも同様に適用される

### 4.6 案1(既存API直接変更)との比較

| 観点 | 案1: 既存`step`/`stepTestRun`/`stepTrackRun`の引数・戻り値を直接変更 | 案2(採用): 加算的ラッパーを新設、既存3関数は無改修 |
|---|---|---|
| 二段API凍結方針・既存契約への影響 | 3関数のシグネチャ・戻り値契約そのものを変更する後方非互換変更 | 既存3関数は一切変更しない |
| 既存テスト(既存844テスト)への影響 | 戻り値の型・呼び出し元アサーションの修正が広範囲に必要になり得る | ゼロ(既存関数・既存テストは無改修で通る) |
| `scripts/sweep.ts`・`scripts/vehicleSweep.ts`への影響 | これらが`step`/`stepTestRun`等を直接呼んでいる場合、影響を受ける | 影響なし |
| 呼び忘れ防止の型による担保 | 戻り値に`destructionState`が常に含まれるため型レベルで呼び忘れが起きない | `step`等を直接呼んでも型エラーにならないため、型だけでは呼び忘れを防げない |
| 呼び忘れ防止の運用上の担保 | (型で担保されるため運用ルールは不要) | 「gameStore.tsの3ループは`stepXxxWithDestruction`のみを呼ぶ」という規約+統合テストで担保する |
| 変更ファイル数 | engine 3ファイル(既存改修)+store 3箇所 | engine 2ファイル(新規)+store 3箇所(呼び出し先の切替のみ) |

alice所見は**案2(採用)**。既存の凍結された物理エンジンAPIへ一切触れずに済み、影響範囲が新規ファイルとstore層の呼び出し先切替のみに限定される点を優先する。**採否は正式Fableレビューで承認済み**(0.3節)。

---

## 5. 三段開示・破壊イベント通知APIの決定論境界

### 5.1 固定dt状態遷移への統一

D02・D04・D07・D09は「継続量」を要するが、`SimState.batteryHeat`と同型の**固定dt漏れ積分**(2.1節の各`XxxProgress`の明示フィールド、D03/D04は`shared.shortCircuitDurationS`)へ統一する。これにより:

- 毎step更新箇所: `advanceDestructionState`内、既存物理ステップ確定直後(4.5節)
- rng消費順: `advanceDestructionState`は非消費(4.5節)
- リプレイに必要な初期状態: `createInitialDestructionState()`(2.1節)
- `HistorySample`(既存、実験ノート用の記録)はdestructionModesの入力から完全に切り離され、三段開示段階2(自動差分検知)専用の用途に限定される(5.3節)

### 5.2 破壊イベント通知API

`DestructionEvent`はmodeを判別子とする判別unionとして渡す(2.4節)。判定ロジック自体はengine内で完結させ、UIに閾値判定を持ち込ませない。コールバックの実体は「毎ステップ呼べる純粋な状態遷移関数」(`advanceDestructionState`)であり、EventEmitter的な登録機構ではない。呼び出し側(store層)が毎フレーム呼び、返ってきた`events`(`RunAccumulator.events`経由)を見てUI側の演出・通知処理へ橋渡しする。

### 5.3 三段開示・段階2の所有

段階2(自動差分検知、「同一構成で3%低下」)の判定ロジック(同一レシピ照合+3%しきい値比較)は、**`src/engine/`ではなく`src/materials/`配下**(alice所有、例: `src/materials/regressionDiff.ts`)に置く。理由: この判定は物理ステップ(固定dtの状態遷移)ではなく、既に完了した複数セッションの`ExperimentSession`記録同士を比較する分析関数であり、CLAUDE.mdが許可するengine拡張点(a)〜(e)のいずれにも該当しない。**A2(正式Fable指摘、確定): この配置判断を承認する**(「物理stepではなく完了済み記録同士の分析純関数であり、拡張枠(a)〜(e)に該当しない配置判断は正しい」)。実行タイミング・保存先(実験ノート追記)・UI表示はbrabit所有。既存`ExperimentSession`を比較材料として利用する。

---

## 6. 三段開示・段階1のHUD境界

- **段階1はbrabit所有。ただしHUDが走行中に参照してよいのは、セッション開始時に`composeConfigFromMaterials`が一度だけ合成した実効config(劣化込みの`magnetStrength`等)由来の`SimState`、および3.2節のセッション内実効config合成が既存configへ合成した実効値のみ**である。
- 永続`WearState`そのものを、走行中にHUDが再読み込み・再写像することは禁止する。理由: CLAUDE.md「写像は起動時に一度計算し、走行中は既存パラメータのみが生きる」の決定論境界を、演出コードが迂回して壊す経路になり得るため。
- 具体的には、性能低下アイコン・モーター音のピッチ低下は「劣化込みですでに下がっている`SimState.rpm`や`current`の値」をそのまま表示に使えばよく、`WearState.demagnetizationFraction`の数値を演出側が改めて参照する必要はない。
- **正式Fable C7(確定): HUD参照許可リストへ「step結果の`DestructionState`(読み取り専用)」を追加する。** UI 6-Aの走行中症状表示(spec §7.3段階1)は、`stepXxxWithDestruction`の戻り値に含まれる`DestructionState`(2.1節)を読み取り専用で参照してよい——これはengine側で毎step確定した値であり、起動時合成済みconfigと同じ「決定論境界の内側」の情報である。HUDはこの読み取り専用参照を、永続`WearState`の直接再写像の代わりに用いること(上記の禁止事項は不変)。
- 段階2・段階3の所有分担は5.3節のとおり(段階2=alice判定ロジック+brabit実行/表示、段階3=brabit)。

---

## 7. 図鑑・個体永続状態のstore層所有

Phase2の分離パターン(`src/store/shopEconomy.ts`=alice寄り純粋ロジック / `src/store/shopEconomyStore.ts`=brabit所有Zustand hook)を踏襲する:

- **データスキーマ・純粋な変換関数**: `src/materials/`配下(alice所有)。`degradationApplication.ts`(1.6節)・`materialMapping.ts`(3.5節)
- **統合永続store(brabit所有)**: 1.3節の`PlayerInventory`拡張(rotorAssemblies/bodyParts/bearingAssemblies)+1.5節の`SaveEnvelopeMeta`+進捗+実験ノート+図鑑発見済み集合を単一store・単一persist keyで保持する。`applyRunOutcome`(1.5節)がこのstoreの唯一の書き込み経路となる。新設候補`src/store/failureCodexStore.ts`を含め、既存`gameStore.ts`(`v15:progress`)・`notebookStore.ts`(`v15:notebook`)・`shopEconomyStore.ts`(非永続)からの移行はbrabit_mot3との協議・P3-0実装計画で確定する
- 個体・アセンブリID発行はbrabit所有store側で行う。`InventoryItem`型は1.2節の新規`family`(rotor/body/bearing)を追加する

**2.1節との整合**: 「セッション内で一度きり」(`XxxProgress.triggered`)はengine所有の一時状態(セッション終了で破棄)であり、「図鑑に初めて登録されたか」(`alreadyDiscoveredSet`相当)はstore層所有の永続状態である。両者は別物であり、store層の永続集合をengineへ注入することはない(engineの物理判定は何度目の発見でも同じ)。

**2.3節・4節との整合**: 2.3節のD08予約枠(store層専用の`FailureCodexModeId`)は本節のstore層所有パターンに従う。4節の加算的ラッパー設計により、brabit_mot3との協議事項は「gameStore.tsの3ループを新規ラッパーへ切り替える作業分担・`destructionState`(`RunAccumulator`)スライスの追加」である。

上記分担案は本計画のFableレビュー(正式承認済み)+brabit_mot3との最終合意を経て確定する。

---

## 8. 決定論境界の保証構造

engineの純関数は「毎回明示的に渡された引数のみから出力を計算する」。**永続化されたWearStateそのものをengineへ引数として渡すことはしない。** WearStateを読むのは`composeConfigFromMaterials`(**`src/materials/materialMapping.ts`に属する純関数であり、engineの純関数ではない**)であり、これがセッション開始時に**一度だけ**WearState込みの実効値(劣化込みの`magnetStrength`等)へ写像する。走行中のengine(`step`/`stepTestRun`/`stepTrackRun`/`advanceDestructionState`)が受け取るのはこの写像済みの数値だけであり、raw WearStateを直接見ることはない。この境界は1.2節・6節と整合する。4.5節の所有者・初期化・受け渡し設計はこの節の具体化である。

**図鑑発見状態からの独立**: セッション開始時、store層は`createRunAccumulator`(内部で`createInitialDestructionState(batteryProfile)`を呼ぶ、1.1節・2.1節)を呼んで`DestructionState`を初期化する。この初期化に図鑑の「発見済み」永続状態(7節)を一切混ぜない。したがって同一seedで同一レシピを何度再生しても、初回発見だろうと2回目だろうと`DestructionState`と`events`の遷移列は完全に同一になる(図鑑登録・報酬の要否だけがstore層で後から分岐する)。

---

## 9. D08と(e)周回拡張の順序問題

**A案を確定する。**

- Phase3では`FailureCodexModeId`(store層/UI層専用型、2.3節)に`'D08'`を含め、図鑑の型・予約枠として存在させる。ただしengineの`DestructionState`・`DestructionModeId`にはD08を含めない(2.3節)
- **Phase3のDoD「全モードの再現手順テスト」からD08を明示的に除外する。** D08の実トリガ実装・再現手順テストはPhase5(e)-1(周回構造)完成後の別ステップへ移管する。これは通常のフェーズ表(CLAUDE.md)からの逸脱にあたるため、**人間のスコープ例外承認事項として本計画のFableレビュー後、人間承認時に明示的に諮る**——正式Fable回答は「D08はPhase5、D10はPhase4とspec §7.1・§12で確定した。D08をPhase3 engine/DoDから外すための追加人間承認やFable裁定は不要」と裁定した(正式回答済み)。図鑑UI予約枠自体もPhase3の必須実装ではない(「入れるならP3-4 UI DoDへ明示し、入れない選択肢も許容する」)
- 理由: 「限界超過→コースアウト」の判定式は(e)の保持判定式そのものであり、Phase3時点の直線コースで代用トリガを作ると、Phase5本実装時に必ず作り直しになる(使い捨て物理)。CLAUDE.mdの「実物の工作・走行で起こりうる原因と対応させる」原則にも、直線コース上の代用クラッシュ条件は馴染まない。簡易代替トリガ案は不採用とする

---

## 10. Phase2繰越事項の採否・順序

- ブラシパッケージ: Phase3が実装先。D05設計(3節)がその本体
- ギヤJ/D06: 同じくPhase3が実装先。D06トリガ設計(3節)に合わせ、ギヤ質量/慣性J増側の接続も同時に行う
- 未接続だった5ファミリー(coating/substrate/roller/body/brush)のうち、brushはPhase3のD05実装により接続される。bodyはD04の延焼判定(1.2節`BodyPartState`)により部分的に接続される。coating/substrate/rollerは引き続きPhase3スコープ外
- bearingは実在素材ファミリーとしてカタログ化しない(1.2節、将来枠)
- store層個体ID・永続化の所有: 1.3節・7節で確定

---

## 11. art-specにない独自解釈しない事項

1. **検死レポートのレイアウト**: 単独ダイアログではなく、**図鑑詳細画面へ統合**する(確定)。「紙」様式であること自体はart-spec §5.2で既定(N6地・暗色文字、レトロ攻略本の趣)
2. **破壊イベント発生後の画面遷移**: 自動遷移ではなく、**プレイヤーの操作待ち**とする(確定、終端モードのみ。非終端モードは走行継続、UI計画側で詳述)
3. D01〜D09の具体的な音色仕様は、brabit_mot3の別ステップ計画で個別に提示する事項として残す(未決のまま、本計画のスコープ外)。SEを各モードへ割り当てること自体はart-spec §8で既定。未決なのは各モードの具体的な音色仕様(周波数・エンベロープ等の詳細)のみ
4. D04近接延焼ロール(3.1節)の具体的な内容は、art-spec/specに明記が無いため独自解釈せずFableレビュー後にSuu・人間承認を経て凍結する(3.1節に記載済み)

---

## 12. ステップ分割案(P3-0〜P3-4)

各ゲートの手順(不変): **実装前ステップ計画→Suu_mot3レビュー→Fableレビュー→人間承認→実装→`npm run test && npm run build && npm run lint`→報告**。commitは人間承認後のみ。

### P3-0: クロスレイヤ契約(型凍結ゲート)

1節の全型(`RunOutcome`・`DegradationDiff`・`RunSnapshot`・`RunAccumulator`・`finalizeDestructionRun`/`finalizeRun`・`SaveEnvelopeMeta`・`RunApplicationEnvelope`)を確定する。AGENTS.md/CLAUDE.md同期更新(Phase2完了・D08=Phase5・D10=Phase4・P3-0のstore境界を反映、`cmp`差分なし)をサブステップとして含む。

**DoD**:
- 型定義+ダミーRunOutcomeの原子的適用の単体テスト、既存v15スキーマからの移行冪等性テスト
- `finalizeDestructionRun`が非空`terminalModeCandidates`以外を受理しないことの型テスト
- motor-onlyの`DestructionRunContext`(`gearTotalToothCount:null`)でD06判定が常にスキップされることのテスト
- `FireExposureRole`に含まれないroleを`adjacentRolesEquipped`へ渡すと`validateFireExposureProfile`が拒否することのテスト
- 整合性エラー発生後、`pendingApplication`が解決するまで新規run開始が拒否され続けることのテスト。整合性エラー発生後にreloadし、永続`saveMeta.pendingApplication`が復元されて新規run開始が引き続きブロックされることのテスト。`retryPendingApplication`が成功時に`pendingApplication`をnullへ戻し、失敗時は保持し続けることのテスト
- `runContext.context==='motor'`のRunSnapshotへ非nullな`track`を混入させると`restoreRunSnapshot`が`invalidSchema`で拒否することのテスト
- `adjacentRolesEquipped`の型が`body`を受け付けないこと(コンパイル時)+`affectedRoles`生成結果に`body`が重複しないことのテスト
- 「pendingあり→同一タブreload直後(heartbeat新鮮)→新規run開始・retryPendingApplicationとも一時ブロックされる」ことのテスト、「pendingあり→heartbeatがstaleになるまで待つ→`rebindLeaseForPendingApplication`→同一タブで再試行成功」の統合テスト、「pendingあり→別タブがstale lease判定→`rebindLeaseForPendingApplication`→新タブで再試行成功、旧タブは`staleLease`拒否」の統合テスト
- 待機中(`leaseNotAcquired`)と整合性エラー(`missingEquipment`等)が異なるエラー種別として区別されることのテスト(正式M1)
- `restoreRunSnapshot`が`context`⟺`gearTotalToothCount`のnull性不一致を`invalidSchema`で拒否することのテスト(正式M2)
- **正式Fable R1(明示的DoDゲート化)**: 人間承認確定後、production/test着手前に、**契約変更を一切伴わない**v12の自己完結full-text化編集(現在の版で残る参照・要約的な記述を実体化し、単独で再開可能な1ファイルへ整える)を行い、Suu_mot3の照合を経ること(本改訂がこれに該当する)。この編集で意味差分(契約・型・振る舞いの変更)が生じた場合は、通常の改訂と同じレビュー経路(Suu→Fable→人間)を経て再承認を取ること——「文書整理だから承認不要」という扱いを許さない

### P3-1: 契約の最小実証(D01/D03、非リポ経路)+store統合

`destructionModes.ts`+`destructionOrchestration.ts`(`stepMotorWithDestruction`のみ)+D01+D03を実装する。P3-0で確定した`applyRunOutcome`へ実際にD01/D03のRunOutcomeを流し込み、rotorAssemblies/battery個体への反映まで統合テストする。

**A1(正式Fable指摘、本ステップで再監査)**: 給電停止機構(v7案a/b)の要否を再監査する。`termination`設計(4.4節)により動機が消滅していれば導入しない。D02発煙段階のR_coil重ね掛け(3.2節)とは別物であり、こちらは引き続き必要。

**DoD**: 発火境界・一度きり・ログ固定・dt分割不変性・相互非干渉・`events`固定順序・`physicsSnapshotAtT`の同一step一致・手動中断(`manualAbort`)時も途中までのdegradationDiffsが確定反映されること。motor-only/test-run/track-run×全endReason(manualAbort含む)が同一のfinalizeDestructionRun/finalizeRun→applyRunOutcome経路を通ることの網羅テスト。

### P3-2: D04(リポ経路、短絡+過放電)+D07(三段開示骨格)+store統合

D04の`stage`遷移+短絡/過放電2経路(3.2節)+`stepTestRunWithDestruction`を実装。D07を三概念で実装し三段開示段階1・2の骨格を実装する。`computeEnergyBudgetJ`のexport化をこのゲートで行う。

**DoD**:
- 過放電しきい値較正(`unsafeDischargeStartRatio`初期値0.90)、段階遷移時間・内部抵抗悪化オーバーライドの具体式
- **正式M4**: リポ×高負荷構成が予算有効レース中に`unsafeDischargeStartRatio`経由で炎上到達できることのsweepテスト、通常構成が到達しないことのテスト
- **C5**: 「**D04発煙のみ**」(膨張・発煙段階に留まり炎上到達しない入力)では`terminalModeCandidates`が増えないことの境界負例テスト
- D01/D07の恒久劣化反映(rotor/magnet個体)を統合テストする

### P3-3: D02(コイル焼損)+D05(ブラシ火花)

D02の発煙→発火(R_coilオーバーライド、3.2節)+D05(反復物理/初回登録分離、`theoreticalCurrentA`活用)を実装する。

**DoD**:
- D02のR_coilオーバーライド式・発煙/発火の境界較正、D05の物理スパーク/図鑑イベント分離の妥当性
- **C5**: 「**D02発煙のみ**」(発火到達しきい値未満で発煙段階に留まる入力)では`terminalModeCandidates`が増えないことの境界負例テスト
- D02のrotorAssemblies.burnedOut反映、D05のbrush個体wearFraction加算(反復イベントぶんの累積)を統合テストする

### P3-4: D06(ギヤ歯欠け)+D09(軸受焼付き)+Phase3完成ゲート

D06の反復状態(全物理イベントをevents化)+ギヤJ増接続+D09(必須実装)を実装し、`stepTrackRunWithDestruction`のframe構築(4.4節未確定点)を確定する。**A3(正式Fable指摘)**: D09の「金属ギヤ接触」入力信号は`materialMapping`が写像するconfigプロファイル(`GearBreakageProfile`と同型)として届け、engineが素材IDで分岐しないこと(3.4節)。**本ゲートをPhase3完成の最終ゲートとする**:

- D08型・図鑑予約枠(2.3節・9節、任意)
- 統合永続storeの最終実装完了(7節)
- 計測器店UI接続(brabit、三段開示段階3)
- **C5**: 「**D09摩擦増のみ**」(焼付き閾値未満で摩擦増ゲージが進行するだけの入力)では`terminalModeCandidates`が増えないことの境界負例テスト
- 13節の破壊契約マトリクス全項目の自動検証
- 横/縦画面+キーボード/タッチの人間試遊

---

## 13. DoD・テスト方針

spec §12の破壊契約マトリクスに基づき、各Phase3対象モードについて最低限、次を自動検証する:

- 正例(発火境界)
- 閾値直前の境界負例
- 同一シード・同一開始WearStateでイベント列一致(決定論)
- 1物理イベント=1`events`要素、図鑑候補は`isFirstThisSession`+永続発見済み集合の突き合わせで別途導出(反復物理イベントと図鑑イベントの区別、D05/D06で特に重要)
- 発火後物理が次stepから現れる
- 正しい装備個体・アセンブリだけへ劣化差分が適用される
- 原子的store反映(部分適用が起きないこと)
- 同一`runSequence`の二重適用防止
- 図鑑初回性と二重報酬防止
- 検死ログ固定
- `physicsSnapshotAtT`を含むリプレイスナップショットからの完全一致
- `manualAbort`を含む全終了経路での劣化確定
- UIが独自の破壊判定を持たない
- 横/縦画面+キーボード/タッチの人間試遊

既存DoD(`npm run test && npm run build && npm run lint`)は不変。D08はengine/DoD対象外のまま(9節、追加承認不要)。図鑑予約枠もPhase3必須ではない。D09は必須実装対象のため例外なし。`AGENTS.md`/`CLAUDE.md`の同期(`cmp`差分なし)をP3-0のDoDに含める。

---

## 14. UI計画への申し送り

brabit_mot3のUI v5改訂事項(alice_mot3の担当外、正式回答の指定どおり):
- 正式M1: `leaseNotAcquired`(1.5節、待機中)を、通常起動の走行開始入口・6-D(pending画面)の両方で「前回セッションの終了確認中」表示として扱い、stale到達時に自動再判定する。虚偽の「保存失敗」表示をしない
- 正式M3: 6-B節3の新規発見遷移——0件時は`terminalModes[0]`の登録済み詳細、1件時は新規発見の詳細、2件以上は発見一覧
- 正式M5(ii): 走行外(ガレージ画面等)でD04膨張表示をしない(3.2節の電池非恒久簡約と整合)
- C4: pending中でも音量・CRT等の在庫/走行結果と無関係な設定変更は許可してよい(許可する場合もpending envelopeは保持したまま)
- C7: 6節のHUD参照許可リスト更新に合わせ、UI 6-Aの症状表示がstep結果の`DestructionState`を参照する実装であることを確認する
- 1.5節の「pending結果の明示的放棄」操作のUI導線(データ破損等で恒久的に適用不能なケース向けの救済策)
- 全endReason共通適用でRunOutcome確定後1回`applyRunOutcome`を呼び、endReasonごとの画面分岐は適用成功後にのみ行う(v4から継承の「反映はボタンを待たない」原則)
- D08は一覧から完全除外し、開発工程文言をゲーム画面へ出さない

---

## 15. 正式Fable最終回答(2026-08-02T05:05、確定)

`docs/spec.md`(r2)・`docs/art-spec.md`(r2)・本書v6〜v12・UI計画v1/v3/v4/v5・関連Suuレビュー一式を実装済みコードと照合したFable最終回答が、**条件付き承認**(必須修正5点+付帯条件7点+推奨2点、§15全質問への回答を含む)を判定した。判定内容は0.3節に集約済み、全文は`docs/phase3-fable-review.md`。

**総評(Fable回答より)**: 「v6→v12の7回の改訂で潰された欠陥の系譜——RunOutcome生成者の矛盾、リプレイ入力不足、型安全でない適用関数、pending消失、lease永久拒否、D06非終端——は、localStorage永続化とマルチタブという本当に難しい領域に正しく集中しており、Suuのクロスレイヤレビューと『実装前に契約を敵対的に検証する』文化が機能し続けている証拠である。破壊状態機械そのものの物理設計(排他union・超過積分・三概念分離・終端集合)はspec §7.1.1の忠実な機械化であり、状態機械の質に関する懸念はない。」

**R1・R2(推奨、反映済み)**: R1は12節P3-0のDoDへ明示的なゲート(人間承認後・production/test着手前・契約変更なし・自己完結full-text化・Suu照合・意味差分があれば再承認)として追加した(本改訂がその実施)。R2(`uncalibratedGauge`の非遡及規則)は2.2節本文へ実際に明記した。

正式Fable回答は要約せず全文でSuu_mot3経由・agmsgで中継済み、`docs/phase3-fable-review.md`へも全文保存済み。**人間承認確定済み**(2026-08-02T06:47)。本改訂(P3-0 R1ゲート)完了後、Suu_mot3の照合を経てproduction/test実装(P3-0実装)に着手する。

---

## 16. 改訂履歴

v1〜v11の差分表は各版の16節に保持済み(旧`docs/phase3-plan-v6.md`〜`v11.md`)。v11→v12(v11照合4項目+追補A〜E+正式Fable対応+6点修正+2点修正)の差分は0節・0.1節・0.2節・0.3節の対応サマリ表を参照。本節はv12初版→本改訂(R1自己完結化)の差分のみ追加する。

### v12初版→本改訂(2026-08-02T06:47、正式Fable R1ゲート)

全セクションの「vNから継続」「vN参照」「変更なし」「表を維持」等の参照を解消し、実装に必要な型・式・DoD本文をすべて本ファイルへ統合した。契約・型・union・フィールド・式・定数・責務境界・工程順・DoD・承認条件は変更していない(意味差分なし)。統合箇所の詳細な対応表は17節を参照。

---

## 17. 参照元→統合先の対応表(R1ゲート、本改訂で追加)

| 統合先(本書の節) | 参照元(旧「vNから継続」等の記述が指していた版・節) |
|---|---|
| 1.1節 `RunAccumulator`・`finalizeDestructionRun`・`finalizeRun`・`deriveDegradationDiffs` | v11 1.1節・v9レビュー#11(deriveDegradationDiffs規則) |
| 1.2節 `RotorAssemblyState`・`BodyPartState`・`BearingAssemblyState`・`EquipmentRole`・`WearState`(gear拡張)・`DegradationDiff`・gear合成式 | v8 1.2節(3アセンブリ初出)・v9 1.2節(sourceWireMaterialId修正)・v10 1.2節(D06/D09分離)・v12 1.2節(magnet scorch訂正) |
| 1.3節 `PlayerInventory` | v10 1.3節(rotorAssemblies等追加) |
| 1.4節 `DestructionRunContext`・`RunSnapshot`・`captureRunSnapshot`・`restoreRunSnapshot`・`RestoredRunSnapshot` | v10 1.4節(motor/vehicle判別union)・v11 1.4節(runtime検証拡張) |
| 1.5節 `SaveEnvelopeMeta`・`TabRuntimeState`・`RunApplicationEnvelope`・`retryPendingApplication`・`rebindLeaseForPendingApplication`・`abandonPendingApplication` | v9〜v11 1.5節(runId方式の反復修正) |
| 1.6節 `FireExposureRole`・`applyXxxDiff`群 | v10〜v11 1.6節 |
| 1.7節 全終了経路とreload保証範囲 | v9 1.7節(v10〜v12で「vNから継続」のまま参照のみだった箇所を実体復元、finalizeDestructionRun分離を反映して更新) |
| 1.8節 個体ID非依存性 | v9〜v11 1.8節 |
| 2.1節 Progress型一式・`DestructionFrameInput`・`advanceDestructionState`全シグネチャ | v9 2.1節(DestructionFrameInput初出)・v11 2.1節(D05Progress更新)。`advanceDestructionState`のruntContext引数はv11 2.4節から本節へ統合 |
| 2.2節 `TemperatureReading`・`CauseLogCommon`・D01〜D09 CauseLog全定義 | v8 2.2節(判別union化)・v8レビュー#4(D03/D04のuncalibratedGauge化)・正式Fable R2(非遡及規則、本改訂で2.2節本文へ実体化) |
| 2.4節 `PhysicsSnapshotAtT`・`UnstampedDestructionEvent`・`DestructionEvent` | v10〜v11 2.4節 |
| 3節 D01〜D09個別設計表 | v8 3節表(「v8 3節の表を維持する」という参照を実体化) |
| 3.2節 過放電・給電停止後の進行 | v9 3.1節(過放電経路初出)・v10 3.2節(給電停止後の進行を一意化)・正式Fable M4・M5(ii)・Q1・Q2 |
| 3.4節 gear総歯数・A3 | v10 1.2節(gear総歯数)・正式Fable Q4・A3 |
| 3.5節・4.1節 素材ID非依存・既存3関数シグネチャ | v6〜v8(既存関数群の確認箇所) |
| 4.2節 `DestructionConfig`・`DestructionConfigDraft`・`GearBreakageProfile` | v10 4.2節(段階導入対応) |
| 4.4節 ラッパー関数実装 | v11〜v12 4.4節(finalizeDestructionRun使用に更新) |
| 4.5節 状態の所有者・初期化・タイミング | v9〜v11 4.5節 |
| 4.6節 案1との比較表 | v9 2.4.4節(初出、以後「vNから継続」のまま参照のみだった箇所を実体復元) |
| 5節(5.1〜5.3) 三段開示APIの決定論境界 | v6〜v7 5節(初出、以後「変更なし」のまま参照のみだった箇所を実体復元)。5.3のA2確定を追加 |
| 6節 HUD境界 | v6〜v7 6節+正式Fable C7 |
| 7節 図鑑・個体永続状態のstore層所有 | v6〜v9 7節(初出、以後参照のみだった箇所を実体復元) |
| 8節 決定論境界の保証構造 | v6〜v10 8節(WearState所属の誤記訂正を含む) |
| 9節 D08と(e)周回拡張の順序問題 | v6〜v8 9節+正式Fable回答(D08確定裁定の追認) |
| 10節 Phase2繰越事項 | v6〜v10 10節 |
| 11節 art-specにない独自解釈しない事項 | v6〜v9 11節 |
| 12節 ステップ分割案 | v8〜v12(P3-0〜P3-4構造はv8初出、2026-08-02T05:37差分レビューで再編済み。本改訂は内容変更なし) |
| 13節 DoD・テスト方針 | v8〜v10(破壊契約マトリクス反映) |
