# Phase 3統合計画(破壊モード+図鑑)— v3改訂版

作成: alice_mot3 2026-07-25。実装・commit未着手。

本書は`docs/phase3-plan-v2.md`をSuu_mot3二次レビュー(2026-07-24T15:27着信、以下「レビューv2」)10項目に基づき改訂したものである。**v2をこの文書で置き換える。** v2からの主要変更は「単位・次元の誠実性」(#1・#4・#5)、「継続量として未実装だった箇所の是正」(#2・#3)、「型設計の見直し」(#6・#7)、「未決事項の確定反映」(#8)、「テスト網羅性」(#9)、「呼び出し境界の棚卸し」(#10)である。v2の改善点(状態機械化・engineログ確定・素材ID遮断・rng非消費・D08延期・人間スコープ例外)は維持する。

対象: spec.md §7(破壊モードと失敗図鑑)。docs/spec.md を唯一の正とする。CLAUDE.md(b)(c)拡張点。

## 改訂差分サマリ(レビューv2 10項目への対応)

| # | レビューv2指摘 | 対応節 | 要旨 |
|---|---|---|---|
| 1 | CauseLog.temperatureの次元偽装 | 2 | 単一`temperature`フィールドを廃止。`currentA`・`batteryHeatRatio`・`rpm`を正しい単位の別フィールドへ分離。実温度モデルがないモードは`temperatureC: null`+`measurementUnavailable: true`。Fable判断事項として明記 |
| 2 | D03は瞬間発火で「短絡持続」を表現していない | 3 | `shortCircuitDurationS`をdt積分で追加。新規較正値`shortCircuitDurationLimitS`。Step1は較正値ゼロでなくなる旨を訂正 |
| 3 | D04がheatのみで短絡/過放電条件を落としている | 3 | `shortCircuitDurationS`流用+膨張→発煙→炎上の`stage`遷移をStep5計画事項として明記。過放電は未モデル化の scope gapとして明示。断定記述を削除 |
| 4 | D02/D07のcurrent²×dtは温度ではない | 3 | `coilHeatGaugeRatio`・`magnetHeatGaugeRatio`(無次元、既存batteryHeatと同型)へ改称。実温度[°C]比較はしない。Fable判断事項として2案提示 |
| 5 | D09も同様+無潤滑シグナル未決 | 3 | `bearingHeatGaugeRatio`へ改称。Step6を独立設計ゲートとし統合計画では未確定のまま明記 |
| 6 | genericな`accumulator`の型安全性 | 2 | モードごとに明示名を持つ`XxxProgress`型へ分離(Record値の型を個別化)。代替案(判別union)と比較しFableへ推奨案提示 |
| 7 | D08スタブは不要な実装対象を作る | 2・9 | Phase3の`DestructionState`からD08を除外。予約枠はstore層の図鑑専用型に限定。Fable裁定依頼として明記 |
| 8 | §11・§14の反映漏れ | 11・14 | 検死レポート=図鑑詳細統合、破壊後=操作待ち、を確定反映。未決一覧から除外 |
| 9 | Step1テストの網羅不足 | 12 | D01/D03それぞれに非発火境界・発火境界・一度きり・ログ固定・dt分割不変性・相互非干渉を列挙 |
| 10 | 呼び出し経路の棚卸し不足 | 2.4(新設) | gameStore.tsの3ループ(stepSim/stepTestRun/stepCourseRun)を棚卸し。単一オーケストレーション境界の設計を追加 |

v2から**内容不変**の節: 0・1・4・7・10(番号のみ据え置き)。v2から**全面改訂**: 2・3・6・9・11・12・14。5・8はv2の内容を維持しつつ2・3節の変更を前提に軽微な参照更新のみ。

---

## 0. スコープ境界(不変)

v2と同じ。D01〜D09が対象(ただし2節のとおりD08はPhase3の`DestructionState`自体には含めない)。D10はPhase4。未接続5ファミリーは10節。

## 1. 既存資産の棚卸し(不変)

v2と同じ。`src/engine/`凍結構造の再利用対象・`failures.ts`との名前分離方針は変更なし。

---

## 2. モジュール構成と状態機械設計(改訂: レビューv2 #1・#6・#7・#10対応)

```
src/engine/destructionModes.ts       # 新規。D01〜D07・D09の状態機械(純関数、D08は含めない)
src/engine/__tests__/destructionModes.test.ts
src/materials/wearAccumulation.ts    # 新規(v1/v2から不変)
src/materials/__tests__/wearAccumulation.test.ts
```

### 2.1 型設計: モード別明示名付きProgress(レビューv2 #6対応)

v2は`ModeProgress.accumulator: number`を全モード共通の汎用フィールドとして使い回す設計だった。レビューで「単位・意味が異なる継続量(電池発熱ゲージ・電流継続時間・コイル熱ゲージ等)を同じ型の同じフィールド名に押し込めると、誤接続を型で検出できない」と指摘された。該当のとおり撤回する。

**比較した2案:**

- **案A(判別union)**: `DestructionEvent`のような「発生した1件」を表す型は判別unionが自然だが、`DestructionState`は「全モードの進行状況を常時同時に保持する」形が必要(ある時点でD01は未発火・D07は進行中、といった状態を同時に表現する必要がある)。「いずれか1つ」を表すunionはこの「同時に全部持つ」形とは相性が悪く、`Record<ModeId, ...>`的な構造を諦めてunion配列+ID検索にすると、既存コードの`Record`ベースの参照パターン(例: `wearAccumulation.ts`が個体ごとのWearStateを扱う既存流儀)から外れ、実装・テスト双方で複雑さが増す。
- **案B(推奨): `Record`構造は維持しつつ、値の型をモードごとに個別インターフェースへ分離する。**

```ts
export interface D01Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  causeLog: D01CauseLog | null;
}

export interface D02Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  coilHeatGaugeRatio: number; // 0–1、無次元(既存SimState.batteryHeatと同型の設計。3.2節)
  causeLog: D02CauseLog | null;
}

export interface D03Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  shortCircuitDurationS: number; // 秒、dt積分(3.1節)
  causeLog: D03CauseLog | null;
}

export interface D04Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning'; // 3.1節、Step5で段階時間を確定
  stageEnteredAtT: number | null;
  causeLog: D04CauseLog | null;
}

export interface D05Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  sparkDurationS: number; // 秒、dt積分
  causeLog: D05CauseLog | null;
}

export interface D06Progress {
  triggered: boolean;
  triggeredAtT: number | null;
  causeLog: D06CauseLog | null; // 瞬間判定のため継続量フィールドなし
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
  bearingHeatGaugeRatio: number; // 0–1、無次元。Step6で設計自体を再審査(3.3節)
  causeLog: D09CauseLog | null;
}

export interface DestructionState {
  D01: D01Progress; D02: D02Progress; D03: D03Progress; D04: D04Progress;
  D05: D05Progress; D06: D06Progress; D07: D07Progress; D09: D09Progress;
  // D08はここに含めない(2.3節、レビューv2 #7)
}
```

各`XxxCauseLog`は共通フィールド(`currentA: number`・`rpm: number`・`atT: number`)+モード固有の正しく命名・単位付けされたフィールドのみを持つ(2.2節)。案Bを推奨するが、判別unionとの優劣は実装コストの見積り誤差があり得るため、**Fableへ両案を提示し推奨可否の確認を求める**(12節Step1ゲート事項)。

### 2.2 CauseLogの次元誠実性(レビューv2 #1対応)

v2の`CauseLog.temperature: number`(全モード共通の単一フィールドに、モードごとにbatteryHeat・current・rpmという異なる次元の値を代入する設計)は不承認・撤回する。

```ts
// 共通部分(全モードのCauseLogが持つ)
export interface CauseLogCommon {
  currentA: number;               // A(spec §7.1「電流」)
  rpm: number;                    // min⁻¹(spec §7.1「回転数」)
  atT: number;                    // セッション内秒(spec §7.1「タイムスタンプ」)
  temperatureC: number | null;    // °C(spec §7.1「温度」)。実温度モデルを持たないモードはnull
  measurementUnavailable: boolean; // temperatureCがnullの理由が「未計測」であることを明示するフラグ
}

// モード固有の生値はCauseLogCommonに追加するフィールドとして正しい単位名で持つ
export interface D01CauseLog extends CauseLogCommon {} // 追加フィールドなし。temperatureCは常にnull(3節)
export interface D02CauseLog extends CauseLogCommon { coilHeatGaugeRatio: number; } // temperatureCは常にnull(3.2節、案A採用時)
export interface D03CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; } // temperatureCは常にnull
export interface D04CauseLog extends CauseLogCommon { batteryHeatRatio: number; stage: D04Progress['stage']; }
export interface D05CauseLog extends CauseLogCommon { sparkDurationS: number; }
export interface D06CauseLog extends CauseLogCommon { loadTorqueNm: number; }
export interface D07CauseLog extends CauseLogCommon { magnetHeatGaugeRatio: number; } // temperatureCは常にnull(3.2節、案A採用時)
export interface D09CauseLog extends CauseLogCommon { bearingHeatGaugeRatio: number; }
```

`temperatureC`を実際に持たせるか(3.2節・3.3節の案B相当)は、Fableが該当ステップで個別に採否判断する。本計画レベルでは「捏造しない」契約だけを固定する。

### 2.3 D08の扱い(レビューv2 #7対応)

v2の「`advanceDestructionState`内でD08は常にfalseを返すスタブ」は撤回する。Phase3の`DestructionState`型・`advanceDestructionState`の実装対象から**D08を完全に除外**する(2.1節の型定義にD08キーが存在しない)。

図鑑UI(brabit所有)がD08を「未発見ではなく未実装」として表示上の予約枠に使う必要がある場合は、engine非依存の別型(例: `FailureCodexModeId`、store層またはUI層で定義、D01〜D09の全10種を含む)を用意し、そこにのみD08を含める。この型はengineの`DestructionModeId`(Phase3時点ではD01〜D07・D09の8種)とは別物であり、Phase5で(e)-1完成後にengine側`DestructionModeId`へD08を追加した時点で両者は一致する。

この設計(engine型を最小に保ち、拡張はPhase5で型そのものを広げる/store層に別枠を作る、のどちらを採るか)は**Fableへ裁定を依頼する**(12節Step7ゲート事項)。

### 2.4 呼び出し境界の棚卸しと単一オーケストレーション設計(新設、レビューv2 #10対応)

現状、物理ステップを呼ぶループはgameStore.ts(brabit所有)内に3系統独立して存在する:

| store関数 | 呼び出すengine関数 | 用途(UIモード) |
|---|---|---|
| `stepSim(dt)` | `motorPhysics.step`(内部で`evaluateMotorFrame`→`advanceMotorState`) | モーター単体のベンチ試験(LabMode/GarageMode相当) |
| `stepTestRun(dt)` | `vehiclePhysics.stepTestRun`(内部で`stepVehicle`→`evaluateCourseCompletion`) | 直線コースのテスト走行(DiagnosisMode/CourseMode相当) |
| `stepCourseRun(dt)` | `trackPhysics.stepTrackRun`(内部で車体ステップ+コース評価) | コース走行本番(CourseMode) |

3系統がそれぞれ独立にstore層で`advanceDestructionState`を個別に呼ぶ設計にすると、将来UIモードが増えるたびに「呼び忘れ」が起こり得る。これを構造的に防ぐため、**呼び出し境界をstore層ではなくengine層のラッパー関数自体に置く**ことを提案する:

- `motorPhysics.step`・`vehiclePhysics.stepTestRun`・`trackPhysics.stepTrackRun`の3関数それぞれの内部で、既存の物理ステップ確定後に`advanceDestructionState`を呼び、戻り値へ`destructionState`・`destructionEvents`を追加する(既存の`SimState`/`VehicleSimState`本体は変更しない。戻り値オブジェクトへのフィールド追加のみ)。
- こうすることで、store層(gameStore.ts)の3つの呼び出し箇所は「返ってきた`destructionState`/`destructionEvents`をどう永続化・表示するか」だけを担当すればよく、「呼ぶかどうか」を個別に判断する必要がなくなる。呼び忘れが構造的に発生しない。
- 代償: 3つの既存exported関数(`step`・`stepTestRun`・`stepTrackRun`)の戻り値型が変わるため、gameStore.ts側の3呼び出し箇所すべての型定義・分割代入を更新する必要がある。これは**brabit_mot3との協議・合意が必須**(engineの戻り値契約変更であり、7節の所有境界の議論と合わせて確定する)。
- 代替案(不採用理由): store層の3箇所each個別に`advanceDestructionState`を呼ぶ設計は、engineの戻り値契約を変えずに済む利点はあるが、レビューv2 #10が問題視した「呼び忘れ」リスクをそのまま残す。engine層への統合を推奨する。

この設計自体もFableレビュー対象とし、brabit_mot3との協議結果と合わせて12節Step1着手前に確定する。

---

## 3. D01〜D09個別設計(改訂: レビューv2 #2・#3・#4・#5対応)

| ID | 物理トリガ(判定式) | 継続量(型は2.1節) | 新規frame/config入力 | WearState書き込み |
|---|---|---|---|---|
| D01 コイル崩壊 | `frame.coilCollapsed`の立ち上がり(既存のみ) | なし | なし | なし(Phase4まで個体化されない) |
| D02 エナメル焼損 | `coilHeatGaugeRatio >= config.coilOverheatGaugeLimit` | `coilHeatGaugeRatio`(3.2節) | `config.coilOverheatGaugeLimit`(新規較正値) | なし |
| D03 電池破裂 | `shortCircuitDurationS >= config.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= BATTERY_HEAT_LIMIT` | `shortCircuitDurationS`(3.1節) | `config.shortCircuitDurationLimitS`(新規較正値) | 電池は恒久結果を別スキーマ(WearState対象外、Phase2判断を維持) |
| D04 リポ炎上 | `shortCircuitDurationS >= config.shortCircuitDurationLimitS`かつ`frame.batteryHeat >= config.batteryRunawayHeatThreshold`(素材由来、3.4節)。過放電条件は3.1節のscope gap参照 | `stage`(3.1節、Step5で段階時間確定) | `config.batteryRunawayHeatThreshold?: number` | 同上 |
| D05 ブラシ火花 | `sparkDurationS >= config.brushSparkDurationLimitS` | `sparkDurationS`(`chatterFramesLeft>0`かつ`current`閾値超の間dt積算) | `config.brushSparkDurationLimitS`・`config.brushSparkCurrentThresholdA` | `WearState.wearFraction`加算 |
| D06 ギヤ歯欠け | `frame.loadTorqueNm > config.gearStrengthThresholdNm`(瞬間判定) | なし | `frame.loadTorqueNm`(新規)、`config.gearStrengthThresholdNm`(新規較正値) | `WearState.toothDamageFraction`加算 |
| D07 熱減磁 | `magnetHeatGaugeRatio >= config.magnetHeatGaugeLimit` | `magnetHeatGaugeRatio`(3.2節) | `config.magnetHeatGaugeLimit`(新規較正値) | `WearState.demagnetizationFraction`加算。spec§7.3三段開示の代表例(6節、v2から不変) |
| D08 クラッシュ | Phase3は状態機械に含めない(2.3節) | — | — | — |
| D09 軸受焼付き | `bearingHeatGaugeRatio >= config.bearingSeizureGaugeLimit`(Step6で設計自体を再審査、3.3節) | `bearingHeatGaugeRatio` | 未確定(3.3節) | なし(演出のみ) |

### 3.1 D03/D04: 継続量としての短絡・段階状態(レビューv2 #2・#3対応)

**D03(電池破裂)**: v2は`batteryHeat`のみを見る瞬間判定だったが、spec §7.1「短絡持続」を表現していないと指摘された。`D03Progress.shortCircuitDurationS`を新設し、`frame.shorted`が真の間dtを加算、偽になったら既存`nextBatteryHeat`と同じ「漏れ積分(減衰)」パターンを踏襲して緩やかに減衰させる(瞬時ゼロリセットにはしない。既存コードの流儀との一貫性を優先)。トリガは`shortCircuitDurationS`が新規較正値`config.shortCircuitDurationLimitS`以上、**かつ**`frame.batteryHeat >= BATTERY_HEAT_LIMIT`の両方を要求する(spec原文「短絡持続(BATTERY_HEAT_LIMIT超過)」の並列条件を字義どおり両方実装する)。

この変更により、**Step1(2節の型・契約の最小実証)は「新規較正値ゼロ」ではなくなる**。v2の12節記述はこの点で不正確だったため、12節で訂正する。`shortCircuitDurationLimitS`の具体的な秒数根拠はStep1実装計画で個別に示す。

**D04(リポ炎上)**: v2は「D03と同じ`batteryHeat`だが閾値が別」という設計だったが、spec原文のトリガは「リポ×短絡/過放電」であり、heatの大小だけでは短絡・過放電という条件そのものが表現から落ちる、と指摘された。v3では`shortCircuitDurationS`(D03と同じ値を共有参照するか、D04専用に複製するかはStep5で確定)と`config.batteryRunawayHeatThreshold`(3.4節、素材由来)の組み合わせをD03同様に要求する形へ修正する。

「過放電」条件は現行engineに対応する生信号が存在しない(電池残量・SOCに類する概念が未実装)。これは**Phase3のスコープギャップとして明示し、Step5計画時に「過放電トリガをPhase3で新規追加するか、Phase3ではリポ×短絡経路のみを実装し過放電経路は将来枠へ回すか」をFable/人間へ諮る**。本計画では断定せず、両案の可否検討をStep5の計画事項とする。

D04の演出段階(膨張→発煙→炎上、art-spec §6のパーティクル規約に対応)は`D04Progress.stage`(none→swelling→smoking→burning)としてモデル化する。各stageの滞在時間・遷移条件の具体値はStep5実装計画で個別に確定する(本計画では型の骨格のみ提示)。v2にあった「炎上が破裂より先に起きるのが物理的に自然」という記述は、根拠のレビューを経ていないため**削除する**。

### 3.2 D02/D07: 無次元熱ゲージへの改称(レビューv2 #4対応)

v2の`coilHeatAccumulator`・`magnetTempAccumulator`(`current²×dt`の漏れ積分)は、抵抗値・熱容量・熱抵抗を含まない簡易蓄積であり、これを「温度」と呼び実在素材のカタログ値(°C)と直接比較する設計は次元不整合であると指摘された。特に`magnetDemagTempLimit`という実温度を示唆する命名と0–1蓄積量の比較は誤りだった。

**Fableへ諮る2案:**

- **案A(推奨、Phase3採用案)**: 既存`SimState.batteryHeat`と全く同型の設計を踏襲する。`coilHeatGaugeRatio`・`magnetHeatGaugeRatio`は0–1の無次元ゲージであり、「実測相当の温度」を主張しない。しきい値(`coilOverheatGaugeLimit`・`magnetHeatGaugeLimit`)も無次元(既存`BATTERY_HEAT_LIMIT=1.0`と同型)とし、較正値コメントに「このゲージが上限に達するのは、実在素材のカタログ値(°C)に基づく参考シナリオでおおよそこの負荷条件に相当する」という**参考情報としての出典**は残すが、シミュレーション内部の比較は無次元同士で完結させる。`CauseLog.temperatureC`は常に`null`・`measurementUnavailable: true`とする(2.2節)。実装コストは既存`nextBatteryHeat`のコピー拡張程度で小さい。
- **案B**: I²R発熱・熱容量・熱抵抗(放熱)・初期/周囲温度を含む最小の集中定数熱モデルを構築し、実際に°C単位の`temperatureC`を出力する。実在材料の比熱・熱抵抗相当値を新たにカタログ調査・較正する必要があり、Phase3のスコープを実質的に拡大する。

alice所見は案A(Phase3では無次元ゲージに留め、`temperatureC`は正直に`null`とする)。ただし次元の誠実性そのものをレビューv2#4が問題にしている以上、**採否はFable判断とする**(12節Step2/Step5ゲート事項)。

### 3.3 D09: 独立設計ゲート(レビューv2 #5対応)

v2の`bearingWearAccumulator`も同様に「温度」を騙る設計だった点を訂正し、3.2節と同じく`bearingHeatGaugeRatio`(無次元)へ改称する。

加えて、「無潤滑シグナル」の入力源(高速回転時の潤滑不足をどの既存パラメータから読むか、あるいは新規パラメータを要するか)が未決のままD09を統合計画の確定事項として扱っていた点も訂正する。**D09は12節のStep6において独立した設計・採否ゲートとして扱い、本計画では「実装するかどうか」自体を確定させない。** 既存パラメータ(`sandingQuality`等)の意味を変えて転用することは禁止し、必要であれば新規の集計済み物理パラメータとしてFable審査の対象にする。

### 3.4 D04: 素材family/ID非依存の設計(v2から不変)

v2 3.1節の内容を維持する。`materialMapping.ts`が電池素材ごとに`batteryRunawayHeatThreshold`(数値、リポ系以外は`undefined`)を写像し、engineは数値比較のみを行う。engineのコード上に素材ID・family文字列が一切現れない設計を実装ステップの受け入れ条件とする。

---

## 4. WearState→engine実効値の写像拡張(v2から不変、参照更新のみ)

v2 4節の内容を維持する。`composeConfigFromMaterials`が3節で確定した新規較正値(`coilOverheatGaugeLimit`・`shortCircuitDurationLimitS`・`brushSparkDurationLimitS`・`brushSparkCurrentThresholdA`・`gearStrengthThresholdNm`・`magnetHeatGaugeLimit`・`batteryRunawayHeatThreshold`・D09関連は3.3節確定後)を起動時一度だけ計算する点は変わらない。

---

## 5. 三段開示・破壊イベント通知APIの決定論境界(v2から不変、参照更新のみ)

v2 5節の内容を維持する。`HistorySample`はdestructionModesの入力から切り離され、三段開示段階2専用。`advanceDestructionState`はrng非消費・毎ステップ更新(2.4節の呼び出し境界棚卸しを反映)。

---

## 6. 三段開示・段階1のHUD境界(v2から不変)

v2 6節の内容を維持する。HUDは起動時合成済みconfig由来の`SimState`のみを読み、永続`WearState`を走行中に再読み込みしない。

---

## 7. 図鑑・個体永続状態のstore層所有(v2から不変、2.3節・2.4節との整合注記を追加)

v2 7節の内容を維持する。追加確認事項:
- 2.3節のD08予約枠(store層専用の`FailureCodexModeId`)は本節のstore層所有パターンに従う。
- 2.4節のengine戻り値契約変更(`step`/`stepTestRun`/`stepTrackRun`への`destructionState`/`destructionEvents`追加)はbrabit_mot3との協議事項として本節の議論に統合する。

---

## 8. 決定論境界の保証構造(v2から不変)

v2 8節の内容を維持する。

---

## 9. D08と(e)周回拡張の順序問題(v2から不変、2.3節との整合)

v2 9節のA案(Phase3はD08の型・図鑑予約枠のみ、実トリガ・再現テストはPhase5(e)-1後、DoD除外は人間スコープ例外承認事項)を維持する。2.3節の型設計変更(engineの`DestructionModeId`からD08を除外し、store層専用型で予約枠を持つ)はこのA案をより厳密に実装した形であり、方針自体に矛盾はない。

---

## 10. Phase2繰越事項の採否・順序(v2から不変)

v2 10節の内容を維持する。

---

## 11. art-specにない独自解釈しない事項(改訂: レビューv2 #8対応、決定事項を反映)

v2 11節の1・2は継続(検死レポート紙様式は既定・レイアウトのみ未決、SE存在は既定・音色仕様のみ未決)。3点目についてSuu_mot3から以下2点が決定事項として伝達されたため確定へ更新する:

1. **検死レポートのレイアウト**: 単独ダイアログではなく、**図鑑詳細画面へ統合**する(確定)。
2. **破壊イベント発生後の画面遷移**: 自動遷移ではなく、**プレイヤーの操作待ち**とする(確定)。
3. D01〜D09の具体的な音色仕様は、brabit_mot3の別ステップ計画で個別に提示する事項として残す(未決のまま、本計画のスコープ外)。

---

## 12. ステップ分割案(改訂: レビューv2 #9対応、Step1テスト網羅化。他ステップは3節の変更を反映)

各stepの手順(v2から不変): **実装前ステップ計画→Suu_mot3レビュー→Fableレビュー→人間承認→実装→`npm run test && npm run build && npm run lint`→報告**。commitは人間承認後のみ。

1. **Step1: 契約の最小実証(D01/D03)**。`destructionModes.ts`の型一式(2.1節・2.2節)+D01/D03を実装する。**v2の「新規較正値ゼロ」という記述は誤りだったため訂正する**: D03は3.1節の`shortCircuitDurationS`+`config.shortCircuitDurationLimitS`を要するため、Step1にも新規較正値が1つ入る(D01は既存トリガのみで較正値ゼロのまま)。
   - **ゲート事項(Fableへ諮る)**: 2.1節の型設計案(A: 判別union / B: 明示名付きRecord、推奨B)、2.3節のD08除外設計、2.4節の呼び出し境界統合案(engine戻り値契約変更の可否)。
   - **テスト網羅(レビューv2 #9反映)**: D01・D03それぞれについて以下を個別に用意する。
     - 非発火境界: しきい値未満(D01=`highSpeedFrameCount`が`COIL_DEFORM_FRAMES`未満、D03=`shortCircuitDurationS`が`shortCircuitDurationLimitS`未満または`batteryHeat`が`BATTERY_HEAT_LIMIT`未満)で`triggered`が`false`のまま・`events`が空であること
     - 発火境界: しきい値をまたぐ1ステップで`triggered`が`true`へ反転し、そのステップの`events`に該当`DestructionEvent`が1件だけ含まれること
     - 一度きり: 発火後、条件が満たされ続ける複数ステップを追加実行しても`events`に再度含まれないこと(`triggered`は`true`のまま、`causeLog`も変化しない)
     - ログ固定: 発火ステップの`causeLog`の値が、後続ステップで入力(`frame`)がどう変化しても不変であること
     - dt分割不変性: D03の`shortCircuitDurationS`について、同一の実時間区間(例: 短絡継続1.0秒)を「dt=1/120で120回」呼んだ場合と「1フレームあたり2回ずつ、フレーム数を半分にして」呼んだ場合とで、最終的な`shortCircuitDurationS`の値・発火有無が一致すること(D01は継続量を持たないため対象外、コメントでその旨明記)
     - 相互非干渉: D01の条件のみを満たす入力列でD03が発火しないこと、およびその逆(D03条件のみでD01が発火しないこと)
2. **Step2: D07磁石温度モデル+三段開示段階1・2の骨格**。3.2節の案A/案B採否をFableへ確定してもらった上で着手する。
3. **Step3: D05ブラシパッケージ**(WearState結線込み)。`sparkDurationS`・`brushSparkDurationLimitS`・`brushSparkCurrentThresholdA`の較正根拠を明記。
4. **Step4: D06ギヤ歯欠け+ギヤJ増接続**(Phase2繰越の解消)。`gearStrengthThresholdNm`較正値・ギヤ質量→J増分の接続式。
5. **Step5: D02/D04**。3.1節の`stage`遷移の具体的時間・3.2節の`coilOverheatGaugeLimit`較正・過放電scope gapの採否をここで確定する。
6. **Step6: D09、独立設計ゲート**(3.3節)。無潤滑シグナルの入力源設計自体をFable審査対象とし、実装するか見送るかをこのstepで初めて確定する(統合計画では未確定のまま)。
7. **Step7: D08型・図鑑予約枠のみ**(2.3節・9節)。engine型を最小に保つか、store層専用型で分離するかをFableへ裁定依頼する。
8. **Step8: 図鑑store・WearState永続化**(brabit協働、7節)。2.4節のengine戻り値契約変更をここでbrabit_mot3と最終合意する。
9. **Step9: 計測器店UI接続**(brabit、三段開示段階3)。

## 13. DoD・テスト方針(v2から不変)

v2 13節の内容を維持する(D08をDoD対象外とする例外を含む)。

## 14. 未決事項一覧(改訂: レビューv2 #8対応)

- 7節・2.4節: engine戻り値契約変更(`step`/`stepTestRun`/`stepTrackRun`)の設計・store層ファイル分担 — brabit_mot3との協議で確定
- 2.1節: `DestructionState`の型設計(判別union案 vs 明示名付きRecord案) — Fable判断
- 2.3節: D08予約枠の設計(engine型除外+store層別型 vs 他案) — Fable裁定
- 3.2節・3.3節: D02/D07/D09の無次元ゲージ案(案A)vs実温度モデル案(案B) — Fable判断
- 3.1節: D04の過放電トリガをPhase3で実装するか将来枠か — Step5でFable/人間へ諮る
- 3.3節: D09を実装するか見送るか自体 — Step6で確定
- D02/D05/D06/D09の較正値・式の具体値 — 各ステップ実装計画で個別に確定
- 9節: D08をPhase3 DoD対象外とする扱いの人間承認 — 本計画のFableレビュー後に諮る
- 11節③: D01〜D09の具体的音色仕様 — brabit_mot3の別ステップ計画事項(本計画スコープ外)
