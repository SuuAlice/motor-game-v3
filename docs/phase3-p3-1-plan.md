# P3-1詳細実装計画: 契約の最小実証(D01/D03、非リポ経路)+store統合

作成: alice_mot3(2026-08-04、v11)。本書はdocs/phase3-plan-v12.md §12「P3-1: 契約の最小実証(D01/D03、非リポ経路)+store統合」を、実装可能な水準まで詳細化した自己完結計画である。本書単独で実装・レビューを再開できることを目標に、参照のみで済ませず必要な型・関数シグネチャ・実コード根拠を本文へ実体化する。**v12本文への確定裁定の反映は、docs/phase3-plan-v12-amendments.md(追記専用台帳、Q9-5裁定により新設)と対で管理する。v12本体は物理的に無編集のまま維持し、v12を読む際は必ずこの台帳も併読すること。**

**承認手順(不変)**: 実装前ステップ計画→Suu_mot3レビュー→Fableレビュー→人間承認→実装→`npm run test && npm run build && npm run lint`→報告。commitは人間承認後のみ。**本書提出時点では未承認であり、production/test編集・commit・tag・pushは一切行っていない。**

**改訂の位置づけ**: v1(2026-08-03提出)はSuu_mot3レビューで「実装不能または正式Q2契約違反」として要修正14点を受けた。最重要の指摘は、v1がP3-0正式Q2裁定(「production配線はP3-4完了時まで延期。P3-1〜P3-3はfixtureベースで契約実証する」)に反して`gameStore.ts`(`finishAssembly`/`flickStart`/`resetSim`/`stepSim`)への実配線を計画していたことである。v2はこの違反を含む14点すべてを反映した。v2への再レビューで、主要14点は正確に反映されていると評価されたが、実コード照合で残った4点(Rng型の非export・runContext未使用引数・classifyTerminalModesのテスト可能性・createRunAccumulatorのbattery profile不一致)の指摘を受け、v3はこれらを反映した。v3はSuu_mot3最終照合を通過し正式Fable個別レビューへ提出、**2026-08-03T09:05、正式Fable技術レビューが条件付き承認(P3-1-Q1〜Q6の裁定+付帯条件)を返した**。v4はこの裁定・付帯条件を省略せず反映した。v4はSuu_mot3最終差分照合を通過し、**2026-08-04、人間プロジェクトリードがP3-1-Q6(a)を再承認**、サブステップ1(materialMapping.ts)を実装・Suu_mot3レビュー通過済み。v5は、サブステップ2着手準備中に新規発見された阻害要因P3-1-Q7(`DestructionConfig`関連3型の型所有、Q2(a)と同型の逆向き依存が未解決だった問題)を反映した。v6は、v5照合で指摘された追補2点(サブステップ1で発見済みのD03境界epsilonの計画本体への反映漏れ、および同時に新規発見されたP3-1-Q8=`BATTERY_HEAT_LIMIT`の値import問題)を反映した。**2026-08-03T16:13、正式Fable補足裁定がP3-1-Q7・P3-1-Q8双方を承認(いずれも人間再承認不要)、D03境界epsilonも異議なく承認した。v7はこの補足裁定+付帯条件(leaf不変条件の確定・構造テスト・epsilon単一出典の申し送り)を反映する**(15節参照)。サブステップ2はSuu_mot3のv7差分確認で通過し(2026-08-03T16:34)、サブステップ3(`stepMotorWithDestruction`本体・`classifyTerminalModes`完全形・Q6(a)機械追従)を実装した。**この実装完了後のSuu_mot3コードレビューで、新規の契約穴(P3-1-Q9)が発見された**: `createRunAccumulator(replaySnapshot)`(Q6(a))は`destructionState.battery.profile`を`replaySnapshot.destructionConfig.battery.profile`から一意導出するが、`stepMotorWithDestruction`は`destructionConfig`(および`config: MotorConfig`)を**別の独立引数**として受け取るため、呼び出し側がこの2つを食い違わせることが型上可能なまま残っていた——Q6(a)が確立したはずの「不一致は構築不能」という保証が、実際にはstepMotorWithDestructionの引数設計によって骨抜きにされていた。v8はこの新規発見をP3-1-Q9として自己完結的に記載し3案(a/b/c)を提示したが、**正式Fable補足裁定への提出とv8提出が入れ違いになり、v8はSuu_mot3の照合対象外(未裁定版)として扱われた。**

**2026-08-03T17:22、正式Fable補足裁定がP3-1-Q9を確定した**: **案(b)を採用**(`config: MotorConfig`・`destructionConfig: DestructionConfig`の両方を`stepMotorWithDestruction`の引数から削除し、`accumulator.replaySnapshot`を唯一の出典とする)。理由(Fable原文の要旨): 案(a)はD03の穴だけを塞ぐが、`MotorConfig`側に同じ階級の穴(liveとリプレイで異なるconfigを使える)を残す。`RunSnapshot`は図鑑リプレイの入力そのものであり、live走行がsnapshotと異なるconfigで走れる限り「リプレイは走行の正直な再生である」という契約が呼び出し側の慣習頼みになる——これはD03スキップと同種の、検出されない嘘の温床である。案(c)はQ6(a)が確立した「fail-fastより構築不能」の原則より弱い。**Q9の本質は引数の数ではなく「同じ走行契約を複数経路から入力でき、静かな不一致を作れること」であり、その定義から案(b)が一意に導かれる**(2.2.1節)。あわせて**Phase 3 wrapper共通不変条件**(「走行開始時に確定する構成情報は`RunSnapshot`を唯一の出典とし、wrapperの独立引数として再入力させない」)を新設した(2.2.2節)。**この裁定はv12 §4.4の承認済み公開シグネチャの変更であり、Q6(a)と同じ扱いで人間再承認を要する(Q9-4)。是正実装(`config`・`destructionConfig`引数の削除・呼び出し元の追従)は人間再承認後に行う。** v9(2026-08-04提出)はこの確定裁定の反映を行ったが、Suu_mot3照合で7点の必須修正(裁定番号の名前空間化・台帳のP3-0裁定監査漏れ・typo・状態記述の精度・文言の時制・リプレイ等価テストの実装バグ・見出し更新)を受け、v10でこれらを反映した。v10もSuu_mot3の最終照合で6点の追補(台帳の件数誤記・実装ステップの事実精度・P3-0-Q2/P3-1-Q4の進捗記述・リプレイ等価テストの非自明経路化)を受け、**v11(本改訂)**でこれらを反映した。いずれもdocs-only版であり、production/test編集は一切行っていない。サブステップ3の既存差分(Q9の欠陥を含む)はそのまま保持し、是正実装時に該当箇所のみ置き換える。

---

## 0. 参照実査結果(v1から継続、追加確認込み)

本計画作成にあたり、次を実際に読んで根拠とした:

- `docs/spec.md` §7.1・§7.1.1・§7.2・§7.4・§7.5・§12・§14
- `docs/art-spec.md`: D01/D03関連箇所はbrabit所有の演出のみでengine契約に無関係
- `docs/phase3-plan-v12.md` 全節。特に§1・§2・§3(3.2節A1・3.4節・3.5節)・§4(4.2節DestructionConfig・4.4節stepMotorWithDestruction全文)・§12(P3-1節、**Q2裁定の正確な文言を再確認**: 「production配線自体をP3-4完了まで遅らせる。付帯: (i)P3-1〜P3-3はfixture統合テストで契約実証、(ii)人間試遊はP3-4になることが帰結」)・§13
- P3-0実コード: `src/engine/destructionModes.ts`(178行)、`src/engine/destructionOrchestration.ts`(731行、`DestructionRunContext`は172行目・`FireExposureProfile`は154行目に実在することを確認)、`src/store/runOutcomeApplication.ts`、`src/store/saveStore.ts`(`beginRunAction`・`performApplyRunOutcome`が汎用実装済みでP3-0時点で既にテスト済みであることを確認)
- `src/engine/motorPhysics.ts`: `BATTERY_HEAT_LIMIT`(**定義元は`src/engine/constants.ts`、motorPhysics.tsは値importして内部使用するのみ**、値1.0)・`didCollapseJustHappen`・**`shorted = config.slitWidthMm <= 0`(299行目、実コード確認)——`shorted`はコミュテータの固定幾何パラメータのみで決まる値であり、`chatterFramesLeft`(接触不良バーストの残りフレーム数)とは完全に独立していることを確認**。motor-only`SimState`に`status`概念が存在しないことも確認
- `src/engine/vehiclePhysics.ts`: `coilCollapsePenaltyMm`機構の実装内容を再確認——`justCollapsed`時に`COIL_DEFORM_PENALTY_MM`を**一回だけ**加算する恒久ペナルティ(`effectiveAxisOffsetMm`経由で軸ずれ相当として反映)であり、「実効巻数・占積が漸減」する継続的な劣化を表す機構ではない。この区別をv2で正確に扱う(3節)
- `src/materials/materials.ts`: `BATTERY_MATERIALS`実データ(3件、profile分類は不変)
- `src/materials/materialMapping.ts`: 既存較正値パターン
- `src/store/gameStore.ts`: `finishAssembly`/`flickStart`/`resetSim`/`finishActiveSession`/`stepSim`の実装(motor-onlyセッション境界の理解は維持するが、**P3-0正式Q2によりこれらへの実配線はP3-1のスコープから完全に除外する**、1節)
- **v5追加(サブステップ2着手時に新規発見)**: `src/engine/destructionOrchestration.ts`の`BatteryDestructionConfig`(180行目)・`GearBreakageProfile`(199行目)・`DestructionConfig`(201行目)を実際にrgで再確認したところ、`advanceDestructionState`のシグネチャが必要とする`DestructionConfig`型が、Q2(a)裁定(leaf純度を構造で守る)の対象に含まれておらず、`DestructionRunContext`と同型の逆向き依存が未解決のまま残っていた(P3-1-Q7、2.1.1-補遺節)
- **v6追加**: サブステップ1完了報告でSuu_mot3自身が裁定した「dt=1/120sを360回加算した値は2.999999999999992」という浮動小数点誤差(`materialMapping.test.ts`実測)が、v5時点の2.1節コードへまだ反映されていなかったことが判明——`sharedShortCircuitDurationS >= config.shortCircuitDurationLimitS`という厳密比較のままだった。また、`advanceD03`が必要とする`BATTERY_HEAT_LIMIT`(`src/engine/constants.ts`定義)の値importが、`destructionModes.ts`の現行import(型のみ)に前例がないことも新規発見した(P3-1-Q8、2.1.1-補遺2節)
- **v7追加**: 正式Fable補足裁定(2026-08-03T16:13)がP3-1-Q7・P3-1-Q8双方を承認(いずれも契約変更に当たらず人間再承認不要)、D03境界epsilonも異議なく承認(数値所見: 360回加算の蓄積誤差は約8e-15、epsilon=1e-9は吸収に十分かつdt=1/120秒より6桁小さく境界を誤った方向へ1フレームずらすことは構造的に不可能)。付帯条件として、leaf不変条件(「destructionModes.tsの公開シグネチャに現れる全型はdestructionModes.ts所有」)の確定・構造テストによる機械固定・epsilonの単一出典維持+D04/D05での再発明回避の申し送りが求められた(2.1.1-補遺・2.1.1-補遺2・2.1.1-補遺3節、12節、14節)
- **v8追加(サブステップ3実装完了後のコードレビューで新規発見)**: `src/engine/destructionOrchestration.ts`の`stepMotorWithDestruction`(v7時点で実装済み、2.2節)を実際にrgで再確認したところ、`destructionConfig: DestructionConfig`(および`config: MotorConfig`)が`accumulator.replaySnapshot`とは独立した引数であることが判明した。`createRunAccumulator`(Q6(a))は`accumulator.destructionState.battery.profile`を`replaySnapshot.destructionConfig.battery.profile`から導出するが、`stepMotorWithDestruction`呼び出し時に別のprofileを持つ`destructionConfig`を第4引数として渡すことが型上可能であり、この場合`advanceDestructionState`内の二重条件(`prev.battery.profile==='nonLipo' && config.battery.profile==='nonLipo'`)が無言でfalseになりD03判定自体が実行されない。Q6(a)裁定文言(2.1.2節)の「両者は`createRunAccumulator(replaySnapshot)`の時点で同一のdestructionConfig.battery.profileに由来するため実行時には常に一致する」という前提が、`stepMotorWithDestruction`側の引数設計により実際には保証されていなかった(P3-1-Q9、2.2.1節)
- **v9追加(正式Fable補足裁定、2026-08-03T17:22確定)**: P3-1-Q9を案(b)で確定(`config`・`destructionConfig`両引数を`stepMotorWithDestruction`から削除し、`accumulator.replaySnapshot`を唯一の出典とする)。Phase 3のいかなるwrapper(motor-only/test-run/track-run)にも適用される**共通不変条件**(「走行開始時に確定する構成情報はRunSnapshotを唯一の出典とし、wrapperの独立引数として再入力させない」)を新設(2.2.2節)。人間再承認(Q9-4)が必要。あわせて、v12本文への確定裁定の反映が散在する問題(Q4解釈・Q8解釈・Q9シグネチャ等、複数件)を解消するため、追記専用台帳`docs/phase3-plan-v12-amendments.md`を新設(Q9-5裁定)し、v12は以後この台帳と対で読む運用とする

---

## 1. スコープ確定

### 1.1 対象・非対象

- **対象**: `src/engine/destructionModes.ts`への`advanceDestructionState`本体実装(D01・D03の2分岐のみ)、`src/engine/destructionOrchestration.ts`への`stepMotorWithDestruction`本体実装(+`classifyTerminalModes`のv12完全形実装、8節)、`src/materials/materialMapping.ts`への電池profile写像+D03較正値、**手構築fixtureによる統合テスト**(`stepMotorWithDestruction`→実際に生成された`RunOutcome`→`applyRunOutcome`が正しく連動することを検証する。P3-0で契約検証済みの`beginRunAction`/`performApplyRunOutcome`のaction契約自体は再検証しない)
- **非対象**(後続ステップ、P3-0正式Q2裁定): **`gameStore.ts`・`gameStore.test.ts`への一切の変更を含めない**。`finishAssembly`/`flickStart`/`resetSim`/`stepSim`への実配線、production向け`DestructionConfig`の実際の生成・供給は、単純な橋渡しであっても**production配線そのもの**でありQ2裁定に反するため、P3-4まで一切行わない。`stepTestRunWithDestruction`/`stepTrackRunWithDestruction`(vehicle/track版)、D02/D04〜D09の状態機械分岐、UIの破壊演出も非対象
- **人間試遊不可の明記**: 本ステップの完了時点で、実際にプレイヤーが組み立てモードで破壊を体験することはできない(gameStore無配線のため)。これはQ2裁定「人間試遊はP3-4になることが帰結」の意図した帰結であり、欠陥ではない

### 1.2 P3-1のstore統合の実体: fixtureベース統合テストのみ

P3-0で`src/store/saveStore.ts`の`beginRunAction`・`performApplyRunOutcome`は既に汎用実装・テスト済みである(0節、実コード確認済み)。これらのstore action自体の契約(lease/runSequence/原子性)はP3-0のDoDで既に検証されている。**P3-1が新たに検証すべきなのは、それらのstore actionへ実際にD01/D03由来の`RunOutcome`を流し込んだときに、想定どおりの`AppliedRunResult`(劣化差分の実個体解決・図鑑登録・報酬)が得られるという「型の穴のなさ」であり、store action自体の再テストではない**。

具体的には、`src/store/__tests__/runOutcomeApplication.test.ts`(または専用の新規テストファイル)に、次の手順の統合テストを追加する:

1. 手構築の完成版`DestructionConfig`fixture(battery.profile='nonLipo'、d02/d05/d06/d07/d09は5節で定義する不活性値)を用意する
2. 手構築の`RunSnapshot`fixture(`captureRunSnapshot`は呼ばず、型を満たす値を直接構築する。または`captureRunSnapshot`をテスト内で直接呼んでもよい——production配線ではなくテストコード内の呼び出しのため問題ない)
3. `createRunAccumulator`→`stepMotorWithDestruction`を複数回呼び、D01発火・D03発火を伴う一連の物理ステップをテスト内でシミュレートする
4. 得られた`termination`(非null、`RunOutcome`)または`finalizeRun`で確定させた`RunOutcome`を、`RunApplicationEnvelope`へ組み立てる(`equipmentSnapshot`・`notebookRecord`もテスト内でfixture構築する)
5. `applyRunOutcome`(pure関数、P3-0実装済み・無改修)へ渡し、`AppliedRunResult`が期待どおり(rotorAssembliesのcollapsed反映、battery個体消滅、報酬付与等)になることを検証する

このテストは`src/store/`配下のテストファイルへの追加のみであり、`saveStore.ts`本体・`gameStore.ts`のいずれも変更しない。

---

## 2. 型・関数の完全シグネチャ(実装対象)

### 2.1 `src/engine/destructionModes.ts`: `advanceDestructionState`本体

```ts
// src/engine/destructionModes.ts に追加

// BATTERY_HEAT_LIMITの値import(正式Fable補足裁定P3-1-Q8(a)確定、2.1.1-補遺2節参照)。
// 正典定数を複製・literal化せず、canonical constants.tsからの一方向値importとして追加する
import { BATTERY_HEAT_LIMIT } from './constants';

// 物理較正値ではなく、固定dt累積の浮動小数点誤差だけを吸収する数値許容差(サブステップ1の
// materialMapping.test.tsでの実測発見、Suu裁定でP3-1本体へ反映。dt=1/120sを360回加算した
// 実測値は2.999999999999992であり厳密な3.0にはならない。この誤差を吸収しないと、本来
// 到達すべきフレームで判定が1フレーム遅れる)
const DURATION_COMPARISON_EPSILON_S = 1e-9;

function advanceD01(
  prev: D01Progress,
  frame: DestructionFrameInput,
  elapsedTimeS: number,
): { next: D01Progress; event: UnstampedDestructionEvent | null } {
  if (prev.triggered) return { next: prev, event: null }; // 崩壊は不可逆・一度きり(spec §7.1.1)
  if (!frame.coilCollapsedRisingEdge) return { next: prev, event: null };
  const causeLog: D01CauseLog = {
    currentA: frame.currentA,
    rpm: frame.rpm,
    atT: elapsedTimeS,
    temperature: { kind: 'unavailable' },
  };
  return {
    next: { triggered: true, triggeredAtT: elapsedTimeS, causeLog },
    event: { mode: 'D01', causeLog, isFirstThisSession: true },
  };
}

function advanceD03(
  prev: D03Progress,
  frame: DestructionFrameInput,
  config: Extract<BatteryDestructionConfig, { profile: 'nonLipo' }>,
  sharedShortCircuitDurationS: number,
  elapsedTimeS: number,
): { next: D03Progress; event: UnstampedDestructionEvent | null } {
  if (prev.triggered) return { next: prev, event: null };
  // DURATION_COMPARISON_EPSILON_Sは浮動小数点誤差吸収のみが目的で、新しい物理式・較正値
  // ではない(Fable Q3「境界1フレーム精度」を満たす数値実装、Suu所見)。361フレームへの
  // 遅延は許容仕様にしない——359フレーム未発火・360フレーム発火をadvanceDestructionState
  // 実経路でテストする(4節・14.2節DoD)
  const fired = sharedShortCircuitDurationS + DURATION_COMPARISON_EPSILON_S >= config.shortCircuitDurationLimitS
    && frame.batteryHeat >= BATTERY_HEAT_LIMIT;
  if (!fired) return { next: prev, event: null };
  const causeLog: D03CauseLog = {
    currentA: frame.currentA,
    rpm: frame.rpm,
    atT: elapsedTimeS,
    temperature: { kind: 'uncalibratedGauge', ratio: frame.batteryHeat },
    batteryHeatRatio: frame.batteryHeat,
    shortCircuitDurationS: sharedShortCircuitDurationS,
  };
  return {
    next: { triggered: true, triggeredAtT: elapsedTimeS, causeLog },
    event: { mode: 'D03', causeLog, isFirstThisSession: true },
  };
}

export function advanceDestructionState(
  prev: DestructionState,
  frame: DestructionFrameInput,
  config: DestructionConfig, // destructionModes.ts所有(正式Fable補足裁定P3-1-Q7(a)確定、
  // 2.1.1-補遺節)。BatteryDestructionConfig・GearBreakageProfileも本サブステップでdestructionModes.tsへ
  // 移設する。destructionOrchestration.tsがimport/re-exportし、DestructionConfigDraft・validator本体は
  // orchestration側に残す
  runContext: DestructionRunContext, // destructionModes.ts所有(正式Fable P3-1-Q2(a)裁定確定)。
  // destructionOrchestration.tsはdestructionModes.tsからimportしre-exportする(2.1.1節)
  dt: number,
): { state: DestructionState; events: readonly UnstampedDestructionEvent[] } {
  // tsconfig.app.json noUnusedParameters:true対策。P3-1のD01/D03分岐はrunContextの
  // いかなるフィールド(fireExposureProfile・gearTotalToothCount)も参照しないが、
  // v12が定める将来共通シグネチャ(D04/D06実装時にrunContextを使う)を維持するため、
  // 引数自体は削除しない(Suu指摘、v3で追加)
  void runContext;
  // 状態更新順(判定用、公開eventsの整列順とは独立): ①shared→②battery→③others
  const nextShared: DestructionSharedSignals = {
    elapsedTimeS: prev.shared.elapsedTimeS + dt,
    shortCircuitDurationS: frame.shorted ? prev.shared.shortCircuitDurationS + dt : 0,
  };

  let nextBattery = prev.battery;
  let d03Event: UnstampedDestructionEvent | null = null;
  // P3-1-Q6(a)採用後、この二重条件は不一致ガードではなく型narrowingである。両者は
  // createRunAccumulator(replaySnapshot)の時点で同一のdestructionConfig.battery.profileに
  // 由来するため実行時には常に一致する(2.1.2節参照、削除しないこと)
  if (prev.battery.profile === 'nonLipo' && config.battery.profile === 'nonLipo') {
    const d03Result = advanceD03(
      prev.battery.d03, frame, config.battery, nextShared.shortCircuitDurationS, nextShared.elapsedTimeS,
    );
    nextBattery = { profile: 'nonLipo', d03: d03Result.next };
    d03Event = d03Result.event;
  }
  // lipo分岐(D04)はP3-1に存在しない。prev.battery.profile==='lipo'の場合は素通しする

  const d01Result = advanceD01(prev.modes.D01, frame, nextShared.elapsedTimeS);

  // 公開eventsは判定順ではなく、v12 2.1節が定める固定順序(D01→D02→[D03またはD04]→
  // D05→D06→D07→D09)に厳密に従って組み立てる。v1はここでbattery→D01の判定順のまま
  // pushしてしまい、D03→D01という逆順のeventsを生成していた(Suu指摘、v2で修正)
  const events: UnstampedDestructionEvent[] = [];
  if (d01Result.event) events.push(d01Result.event);
  if (d03Event) events.push(d03Event);

  return {
    state: {
      shared: nextShared,
      battery: nextBattery,
      modes: { ...prev.modes, D01: d01Result.next },
    },
    events,
  };
}
```

**DoDテスト(v2追加)**: D01とD03が人工的に同一フレームで同時発火する入力(`coilCollapsedRisingEdge: true`かつ短絡持続条件を同時に満たす境界値)を構築し、`events`が常に`[D01, D03]`の順で返ることを固定入力で検証する。

**DoDテスト(v6追加、境界1フレーム精度の実経路検証)**: `advanceDestructionState`を実際に359回・360回呼び出し(`shorted:true`固定、held-short相当のframe入力)、359回目終了時点で`D03Progress.triggered`が`false`のまま(未発火)、360回目で`true`(発火・`events`にD03が現れる)ことをテストする。361回目まで発火が遅延しないことも確認する。この実測は`src/materials/__tests__/materialMapping.test.ts`(サブステップ1)の「dt=1/120sを360回加算した値が2.999999999999992になる」という実測発見と対応しており、両者が同じ数値的根拠(`DURATION_COMPARISON_EPSILON_S`)に基づくことを確認する。

### 2.1.1 `DestructionRunContext`の型所有——正式Fable裁定(P3-1-Q2: 案(a))

`DestructionRunContext`(`fireExposureProfile: FireExposureProfile`を含む)は現状コード上`src/engine/destructionOrchestration.ts`(172行目)に実在する。P3-1のD01/D03分岐はこの型のいかなるフィールドも参照しないが、`advanceDestructionState`のシグネチャ自体はv12が定める将来共通の形(runContext引数を持つ)を維持する必要がある。

**正式Fable裁定(2026-08-03T09:05、確定): 案(a)**。`DestructionRunContext`および参照先の`FireExposureProfile`(`validateFireExposureProfile`含む)の定義を`destructionModes.ts`(leafモジュール)へ移設し、`destructionOrchestration.ts`はそこからimportし、既存の公開APIとして re-export する。型の構造(フィールド・意味)は一切変更しない。

**裁定理由(Fable原文の要旨)**: 案(b)(`import type`による型のみの循環参照)は技術的には正しい(ランタイム循環は発生しない)が、「leaf純度は解釈でなく構造で守る」——散文に埋めた例外規範はエージェント間の中継で脱落しやすく、構造とルールだけが確実に生き残るという、このプロジェクトの構造法則に照らし、型のみの例外的循環という解釈上の抜け道を作らない案(a)を採る。`FireExposureRole`の前例(P3-0で同種の問題を同じ方法で解決済み)を踏襲する。

**契約変更ではない(人間再承認不要)**: re-exportにより既存のimport箇所・型の同一性・公開面は不変であるため、これは契約変更ではなく開示済みの実装詳細の逸脱である。実装報告への記載で足りる。

**移設対象の明確化(型だけでなくvalidator関数も含む)**: `destructionModes.ts`へ移設するのは`DestructionRunContext`(型)・`FireExposureProfile`(型)に加え、**`validateFireExposureProfile`(値、関数本体)も含む**。`destructionOrchestration.ts`は型2つに加えて`validateFireExposureProfile`関数も`destructionModes.ts`からimportし、既存の公開名のままre-exportする(`export { validateFireExposureProfile } from './destructionModes'`のような形)。これにより、既存`src/engine/__tests__/destructionOrchestration.test.ts`の`import { validateFireExposureProfile } from '../destructionOrchestration'`(値のimport)を含め、下記の依存閉包の全箇所が変更不要のまま維持される。

**依存閉包の事前確認(実装前rg、pitfalls追加案2の自己適用)**:
```
$ rg -n "DestructionRunContext|FireExposureProfile|validateFireExposureProfile" src/ --include="*.ts"
```
実測結果(production外部importとtest参照を区別して列挙):

- **production外部import(1箇所)**: `src/store/runOutcomeApplication.ts`(9行目、`import type {... DestructionRunContext ...} from '../engine/destructionOrchestration'`。84行目で`validateEquipmentIdSnapshot`の引数型として使用)
- **test参照(3ファイル)**: `src/engine/__tests__/destructionOrchestration.test.ts`(`DestructionRunContext`型+`validateFireExposureProfile`関数の両方をimport・使用)、`src/store/__tests__/runOutcomeApplication.test.ts`(`DestructionRunContext`型をimport)、`src/store/__tests__/saveStore.test.ts`(`DestructionRunContext`型をimport、`captureRunSnapshot`等と同じimport文)
- **定義・内部使用**: `src/engine/destructionOrchestration.ts`自身(現状の定義箇所、151〜174行目・629行目・634行目の`validateRunContextShape`内部使用)

**re-export後、上記のいずれの参照箇所も変更不要**(すべて`'../engine/destructionOrchestration'`または`'../destructionOrchestration'`という同一のimportパスを使っており、`destructionOrchestration.ts`が型・関数を引き続き公開名で提供し続けるため)——Fableの「公開面は不変」という判断を実コードで裏付ける。

#### 2.1.1-補遺 `DestructionConfig`関連型の型所有——正式Fable補足裁定(P3-1-Q7: 案(a)、承認・人間再承認不要)

**サブステップ2の実装着手時に新規発見(2026-08-03T15:29、Suu_mot3のコードレビュー指摘、実コードで裏付け済み)**: `advanceDestructionState`のシグネチャは`config: DestructionConfig`を引数に取る(2.1節)。この`DestructionConfig`(および`BatteryDestructionConfig`・`GearBreakageProfile`)は現状コード上すべて`src/engine/destructionOrchestration.ts`に定義されている。Q2(a)の裁定(「leaf純度は解釈でなく構造で守る」、`import type`による型のみの循環参照すら不採用)に従う限り、`DestructionRunContext`だけを`destructionModes.ts`へ移設しても、`DestructionConfig`という**別の型による同種の逆向き依存**が残ったままであり、Q2(a)裁定の意図(destructionModes.tsをdestructionOrchestration.tsから完全に独立させる)が達成されない。v4はこの依存を未解決のまま提出していた。

**依存閉包の実測(rg、pitfalls追加案2の自己適用)**:
```
$ rg -n "BatteryDestructionConfig" src/ --include="*.ts"
$ rg -n "GearBreakageProfile" src/ --include="*.ts"
$ rg -n "\bDestructionConfig\b" src/ --include="*.ts"
```
実測結果:

- **`BatteryDestructionConfig`**: production外部import1箇所(`src/materials/materialMapping.ts`18行目、`mapD03DestructionConfig`の戻り値型として426行目で使用)。定義・内部使用は`destructionOrchestration.ts`(180行目定義、`DestructionConfigDraft`/`DestructionConfig`のbatteryフィールド型、`validateBatteryDestructionConfigRawShape`内部使用)
- **`GearBreakageProfile`**: 外部からの参照なし(現時点)。`destructionOrchestration.ts`内部でのみ使用(199行目定義、`DestructionConfigDraft`/`DestructionConfig`のd06.breakageフィールド型)
- **`DestructionConfig`(Draft・派生型を除く本体)**: test参照2ファイル(`src/engine/__tests__/destructionOrchestration.test.ts`・`src/store/__tests__/saveStore.test.ts`、いずれも`from '../destructionOrchestration'`または`'../../engine/destructionOrchestration'`)。定義・内部使用は`destructionOrchestration.ts`(201行目定義、`ValidateDestructionConfigResult`・`RunSnapshot`・`RestoredRunSnapshot`・`CaptureRunSnapshotInput`のフィールド型)

**Suu_mot3推奨の最小修正案**: 状態機械の公開シグネチャ(`advanceDestructionState`)が直接必要とする次の3型のみを`destructionModes.ts`へ定義移設する:

```ts
// destructionModes.ts(leaf)へ移設する3型
export type BatteryDestructionConfig =
  | { profile: 'nonLipo'; shortCircuitDurationLimitS: number }
  | {
      profile: 'lipo';
      shortCircuitDurationLimitS: number;
      runawayHeatThreshold: number;
      unsafeDischargeStartRatio: number;
      stageDurations: { swellingS: number; smokingS: number };
    };

export type GearBreakageProfile = { kind: 'breakable'; gearStrengthThresholdNm: number } | { kind: 'nonBreakable' };

export interface DestructionConfig {
  battery: BatteryDestructionConfig;
  d02: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
  d05: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06: { breakage: GearBreakageProfile };
  d07: { magnetHeatGaugeLimit: number; reversibleDroopThreshold: number };
  d09: { bearingSeizureGaugeLimit: number };
}
```

`destructionOrchestration.ts`はこの3型を`destructionModes.ts`からimportし、既存の公開importパスを維持するためre-exportする。**`DestructionConfigDraft`・`InvalidConfigField`・`ValidateDestructionConfigResult`・`validateDestructionConfig`本体・restore用raw validator(`validateBatteryDestructionConfigRawShape`等)はorchestration側に残し**、移設した3型をimportして使用する(validator/restore責務はorchestrationに維持する——これらはstoreのRunSnapshotの復元・値域検証という、destructionModes.tsのleaf責務を超えたorchestration固有の役割であるため)。

**正式Fable補足裁定(2026-08-03T16:13、確定): 案(a)を承認する。契約変更に当たらず人間再承認は不要(実装報告への記載で足りる)。**

**裁定理由(Fable原文の要旨)**: Q2(a)と同型の「公開面不変の定義移設」である。3型の選定と、`Draft`・`InvalidConfigField`・`validator`本体・restore用raw validatorをorchestration側に残す分割も正しい——復元・値域検証はstoreの`RunSnapshot`責務に属するorchestration固有の役割であり、leafに引きずり込むべきでない。依存閉包のrg実測を計画に載せた点(pitfalls追加案2の自己適用)を評価する。

**leaf不変条件の確定(Fable補足裁定、新規)**: この種の型所有の発見が3度続いた(`FireExposureRole`→Q2(a)→Q7)ことから、個別移設の裁定を繰り返さないための不変条件を固定する: **「`destructionModes.ts`の公開シグネチャ(`advanceDestructionState`等)に現れるすべての型は`destructionModes.ts`が所有する」**。Q7の移設完了をもってこの不変条件が成立する(シグネチャに残る型参照: `DestructionState`・`DestructionFrameInput`・`UnstampedDestructionEvent`=既にleaf所有、`DestructionRunContext`=Q2(a)、`DestructionConfig`=Q7)。**成立の確認をサブステップ2の完了報告に1行含める**(12節・14節)。

#### 2.1.1-補遺3 leaf不変条件の機械的固定(構造テスト、正式Fable補足裁定の付帯条件)

正式Fable補足裁定(2026-08-03T16:13)の付帯条件として、上記leaf不変条件・Q8のleaf規則確定文言(2.1.1-補遺2節)を、**裁定文書ではなくテストが守る**状態にすることが求められた。サブステップ2のDoDへ、次の構造テストを1件追加する(既存`src/retro/lint/rawColorScan.ts`+`__tests__/rawColorScan.test.ts`と同型のパターン: ソーステキストを実際に読み込み、正規表現等でimport文を抽出し許可リストと照合する):

```ts
// src/engine/__tests__/destructionModesImportStructure.test.ts(新規、想定)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('destructionModes.ts: leaf不変条件の構造テスト(正式Fable補足裁定)', () => {
  it('import文が許可リスト(value: ./constantsのみ、type-only: ./motorPhysics・./vehiclePhysicsのみ)以外を含まない', () => {
    const source = readFileSync(new URL('../destructionModes.ts', import.meta.url), 'utf-8');
    const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line));
    for (const line of importLines) {
      const isAllowedValueImport = /from '\.\/constants'/.test(line) && !/^\s*import type\b/.test(line);
      const isAllowedTypeImport = /^\s*import type\b/.test(line) && /from '\.\/(motorPhysics|vehiclePhysics)'/.test(line);
      expect(isAllowedValueImport || isAllowedTypeImport, `許可リスト外のimportです: ${line}`).toBe(true);
    }
    // 特にdestructionOrchestration.tsからのimportが存在しないことを明示的に確認する
    expect(source.includes("from './destructionOrchestration'")).toBe(false);
  });
});
```

(実装時の正規表現・走査方法は上記の想定を出発点とし、実際のimport文の書式に合わせて調整してよい。目的は「許可リスト以外のimportが1件でもあれば失敗する」ことであり、具体的な実装方法自体は契約ではない。)

#### 2.1.1-補遺2 `BATTERY_HEAT_LIMIT`の値import——正式Fable補足裁定(P3-1-Q8: 案(a)、承認・人間再承認不要)

`advanceD03`(2.1節)は`frame.batteryHeat >= BATTERY_HEAT_LIMIT`の判定に既存の正典定数`BATTERY_HEAT_LIMIT`(値1.0、`src/engine/constants.ts`定義)を必要とする。`destructionModes.ts`の現在の(P3-0時点での)importは`motorPhysics.ts`・`vehiclePhysics.ts`からの**型のみ**であり、**値のimport**は前例がなかった。正典定数の複製(`const BATTERY_HEAT_LIMIT = 1.0`の再定義)は「較正値/定数の二重出典」に当たるため採らない。

**正式Fable補足裁定(2026-08-03T16:13、確定): 案(a)を承認する。契約変更に当たらず人間再承認は不要。**

**裁定理由(Fable原文の要旨)**: leaf規則の目的は逆依存と循環の禁止であって、依存ゼロの自己目的化ではない。`constants.ts`は他モジュールを一切importしない真の基礎leafであり、そこへの一方向値importは規則の目的を一切損なわない。literal複製の拒否(二重出典禁止)・定数移設の拒否(出典不明化の回避)はいずれも正しい判断である。

**leaf規則の意味の固定(確定文言)**: 「`destructionModes.ts`は、`destructionOrchestration.ts`およびstep実装関数本体への逆依存・循環依存を持たない。基礎leaf(他のいかなるモジュールもimportしないファイル)への一方向値import、および既存の型のみimportは許す」。この解釈はQ4(a)と同じ扱いで固定する。v12本文は編集しない(物理的無編集の原則)。

### 2.2 `src/engine/destructionOrchestration.ts`: `stepMotorWithDestruction`本体+`classifyTerminalModes`完全形

**v9時点のステータス: `stepMotorWithDestruction`のシグネチャはP3-1-Q9(案(b)、2026-08-03T17:22確定、2.2.1節)により変更が確定しているが、是正実装は人間再承認(Q9-4)後に行う。** 下記コードはサブステップ3で実装済み・現行差分として保持されているが、確定した契約穴の是正(`config`・`destructionConfig`引数の削除、2.2.1節)を**まだ反映していない旧シグネチャ**である。人間再承認後、この関数本体を2.2.1節の確定シグネチャへ置き換える。`classifyTerminalModes`・内部helper(`stampPhysicsSnapshot`・`asNonEmpty`・`MotorStepRng`)自体はQ9の対象外であり変更を要しない。`buildMotorOnlyFrameInput`はQ9-2(共通不変条件、2.2.2節)により、実効config一本化の観点から是正実装時に見直す(2.2.1節)。

**`classifyTerminalModes`のexport化——正式Fable裁定(P3-1-Q5: 案(a))**: v12 §4.4の完全形(D02/D03/D04-burning/D06-totalloss/D09の全分岐)を実装すること自体は、`advanceDestructionState`が実際に発行できるイベントを差分換算実装済みモード(P3-1時点ではD01/D03)に限定するQ6不変条件(5節)とは独立した別の話である。P3-1のQ6実装により`advanceDestructionState`が実際に発行できるのはD01/D03のイベントのみであるため、`classifyTerminalModes`を非exportのままにすると、D02/D04/D06/D09分岐を手構築event fixtureで直接テストする手段が公開APIから存在しない。

**正式Fable裁定(2026-08-03T09:05、確定): 案(a)**。`classifyTerminalModes`をexportする。純関数の可視性追加であり物理契約は不変。v12完全形の全分岐を、各イベントが実際に発行可能になる前(P3-2〜P3-4を待たず)に手構築fixtureで直接検証できる利益は大きい。**契約変更ではない(人間再承認不要)**: P3-0凍結面の変更ではなく新規関数の公開のため、実装報告への記載で足りる。

**条件(付帯、必須遵守)**: export化が「全モード実装済み」の誤読を生まないよう、次のJSDocを付す:
```
/**
 * 本関数は分類規則のみを定める。各モードのイベントが実際に発行可能かはQ6不変条件が別途統制する。
 */
```
(このJSDoc中の「Q6不変条件」は正式Fable Q6裁定=`deriveDegradationDiffs`の段階実装不変条件を指し、`createRunAccumulator`に関する本書のP3-1-Q6とは別物である。混同を避けるため、実装コードのコメントでも「正式Fable Q6」と明記する。)

**DoDテスト(exhaustive、Fable付帯条件)**: 正例だけでなく負分岐を明示的に含める——D04で`stage`が`'burning'`以外のイベントは分類されないこと、D06で`isTotalLoss=false`のイベントは分類されないこと、D01/D05/D07のイベントはいかなる場合も分類されないこと(Phase3レビューC5の終端負例の分類規則レベルでの前倒し検証)。

```ts
// src/engine/destructionOrchestration.ts に追加

/**
 * 本関数は分類規則のみを定める。各モードのイベントが実際に発行可能かは正式Fable Q6
 * 不変条件(deriveDegradationDiffsの段階実装、`createRunAccumulator`に関するP3-1-Q6とは別物)が
 * 別途統制する。
 */
export function classifyTerminalModes(events: readonly UnstampedDestructionEvent[]): readonly DestructionModeId[] {
  const result: DestructionModeId[] = [];
  for (const event of events) {
    if (event.mode === 'D02') result.push('D02');
    if (event.mode === 'D03') result.push('D03');
    if (event.mode === 'D04' && event.causeLog.stage === 'burning') result.push('D04');
    if (event.mode === 'D06' && event.isTotalLoss) result.push('D06');
    if (event.mode === 'D09') result.push('D09');
  }
  return result;
}

function stampPhysicsSnapshot(
  events: readonly UnstampedDestructionEvent[],
  snapshot: PhysicsSnapshotAtT,
): readonly DestructionEvent[] {
  return events.map((e) => ({ ...e, physicsSnapshotAtT: snapshot }));
}

function asNonEmpty<T>(arr: readonly T[]): readonly [T, ...T[]] | null {
  return arr.length > 0 ? (arr as readonly [T, ...T[]]) : null;
}

function buildMotorOnlyFrameInput(config: MotorConfig, prev: SimState, next: SimState): DestructionFrameInput {
  const theoreticalCurrentA = computeElectricalState(config, prev.theta, prev.omega).current;
  return {
    currentA: next.current,
    theoreticalCurrentA,
    rpm: next.rpm,
    batteryHeat: next.batteryHeat,
    shorted: next.shorted,
    chatterFramesLeft: next.chatterFramesLeft,
    coilCollapsedRisingEdge: didCollapseJustHappen(prev, next),
    loadTorqueNm: undefined,
    energyUsedRatio: undefined,
  };
}

// motorPhysics.tsの`type Rng = () => number`は非exportのため、destructionOrchestration.ts側から
// 直接参照できない(Suu指摘、v3で追加)。motorPhysics.tsは無改修のまま、既存`step`の公開
// シグネチャから型を導出する
type MotorStepRng = NonNullable<Parameters<typeof step>[3]>;

export function stepMotorWithDestruction(
  config: MotorConfig,
  motorState: SimState,
  accumulator: RunAccumulator,
  destructionConfig: DestructionConfig,
  dt: number,
  rng?: MotorStepRng,
  loadTorque?: number,
  effectiveInertia?: number,
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
    : null;
  return { physicsState, accumulator: nextAccumulator, termination };
}
```

`deriveDegradationDiffs`(P3-0既存実装、無改修)は`D01collapse`・`battery-consumed`(D03含む)を既にQ6裁定範囲で実装済み。

**`MotorStepRng`導出のDoD**: `motorPhysics.ts`を無改修のまま`typeof step`から`Rng`相当の型を導出できることを`tsc -b`成功で確認する(Suu指摘、v3で追加)。`Rng`自体をexport化する代替案は既存engine公開APIの変更に当たるため、採用する場合はFable質問化が必要——本計画は型導出案(export不要)を採用し、この代替案の検討自体は不要と判断する(型導出のみで完全に解決するため、Fable確認事項に含めない)。

### 2.2.1 `stepMotorWithDestruction`の引数と`replaySnapshot`の不一致——正式Fable裁定(P3-1-Q9: 案(b)確定、人間再承認対象)

**発見の経緯**: サブステップ3(2.2節の実装)完了後、Suu_mot3のコードレビューで発見された(実装内容自体は承認済みv7どおりで、実コードの欠陥ではなく**承認済み計画のシグネチャ自体に潜んでいた契約穴**)。

**問題(実コード確認済み)**: `createRunAccumulator(replaySnapshot)`(P3-1-Q6(a)、2.1.2節)は`accumulator.destructionState.battery.profile`を`replaySnapshot.destructionConfig.battery.profile`から一意に導出する。ところが実装済みの(v7時点の)`stepMotorWithDestruction`(2.2節)は次のシグネチャで`destructionConfig`(および`config: MotorConfig`)を**`accumulator`とは独立した引数**として受け取っていた:

```ts
// 是正前(v7実装、サブステップ3の現行差分)
export function stepMotorWithDestruction(
  config: MotorConfig,
  motorState: SimState,
  accumulator: RunAccumulator,
  destructionConfig: DestructionConfig, // ← replaySnapshot.destructionConfigと独立に指定できる
  dt: number,
  rng?: MotorStepRng,
  loadTorque?: number,
  effectiveInertia?: number,
): DestructionStepResult<SimState> { /* ... */ }
```

呼び出し側は`accumulator`(内部に`replaySnapshot`を保持)と`destructionConfig`(第4引数)の両方を独立に用意できるため、**この2つのbattery.profileが食い違う値を型上構築できる**。この場合、`advanceDestructionState`(2.1節)内の二重条件`if (prev.battery.profile === 'nonLipo' && config.battery.profile === 'nonLipo')`が無言でfalseとなり、D03判定自体が一切実行されない——2.1.2節のQ6(a)裁定コメント「両者は同一のdestructionConfig.battery.profileに由来するため実行時には常に一致する」という前提は、**`stepMotorWithDestruction`の引数設計がこの一致を強制していない**ため、実際には成立していなかった。

**再現例(是正前のv7実装コードで構築可能だった)**:
```ts
// accumulatorはnonLipo電池のsnapshotから作る
const snapshotA = captureRunSnapshot({ ...motorSnapshotInput(), destructionConfig: goodDestructionConfig('nonLipo') });
const accumulator = createRunAccumulator(snapshotA);
// accumulator.destructionState.battery.profile === 'nonLipo'

// stepMotorWithDestructionの第4引数には、accumulatorとは無関係な別のDestructionConfigを渡せる
const mismatchedConfig = goodDestructionConfig('lipo'); // 型上まったく合法(DestructionConfig型を満たす)
const result = stepMotorWithDestruction(motorConfig, motorState, accumulator, mismatchedConfig, 1 / 120);

// advanceDestructionState内部:
//   prev.battery.profile  === 'nonLipo' (accumulator.destructionStateから)
//   config.battery.profile === 'lipo'    (mismatchedConfigから、stepMotorWithDestructionの第4引数)
// → 二重条件が false のため advanceD03 は一切呼ばれない。
// → 短絡がどれだけ持続してもD03イベントは永遠に発行されない(events は常に空)。
// → 型システムはこの状態の構築を一切防げない。
```

この「不一致→無言スキップ」というパターンは、P3-1-Q6(a)裁定が`createRunAccumulator`について明示的に排除したはずの欠陥そのものである(2.1.2節「不一致→D03無言スキップは『静かな穴』になり得る欠陥であり、fail-fast(案b)より構築不能(案a)が優る」)。`createRunAccumulator`単体は正しく修正されたが、**その保証を実際に使う唯一の呼び出し元(`stepMotorWithDestruction`)の引数設計が、保証を素通りできる形になっていた**。

**依存閉包(実装前rg、pitfalls追加案2の自己適用)**:
```
$ rg -n "stepMotorWithDestruction" src/ -g "*.ts"
$ rg -n "buildMotorOnlyFrameInput" src/ -g "*.ts"
```
実測結果: `stepMotorWithDestruction`の定義は`src/engine/destructionOrchestration.ts`(764行目)のみ。呼び出し元は`src/engine/__tests__/destructionOrchestration.test.ts`の4箇所のみ(いずれもサブステップ3で新規追加したテストであり、production呼び出しは存在しない。`gameStore.ts`等への実配線はQ2裁定によりP3-4まで行っていないため)。`buildMotorOnlyFrameInput`は`stepMotorWithDestruction`内部からの呼び出し1箇所のみで外部公開されていない。**したがって、シグネチャ変更が必要な既存呼び出し箇所はテストファイル1件・4箇所のみであり、依存閉包は小さい。**

**検討した3案**: 案(a)`destructionConfig`引数のみ削除(最小修正、`MotorConfig`側の同種の穴が残存)/案(b)`config`・`destructionConfig`両方を削除し`accumulator.replaySnapshot`を唯一の出典とする/案(c)現行引数維持+runtime一致検証(fail-fast、非推奨)。

**正式Fable補足裁定(2026-08-03T17:22、確定): 案(b)を採る。**

**裁定理由(Fable原文の要旨)**: 案(a)はD03の穴だけを塞ぐが、`MotorConfig`側に同じ階級の穴——liveとリプレイで異なるconfigを使えること——を残す。`RunSnapshot`は図鑑リプレイの入力そのものであり、live走行がsnapshotと異なるconfigで走れる限り「リプレイは走行の正直な再生である」という契約が呼び出し側の慣習頼みになる。これはD03スキップと同種の、検出されない嘘の温床である。案(c)はQ6(a)が確立した「fail-fastより構築不能」の原則より弱く、deep equality規約という新たな維持負担も生む。**Q9の本質は引数の数ではなく「同じ走行契約を複数経路から入力でき、静かな不一致を作れること」であり、その定義から案(b)が一意に導かれる。**

**確定シグネチャ(案(b))**:
```ts
/**
 * Phase 3 wrapper共通不変条件(正式Fable裁定P3-1-Q9-2、2.2.2節)に従い、走行開始時に確定する
 * 構成情報(config・destructionConfig)はaccumulator.replaySnapshotを唯一の出典とし、引数として
 * 独立に受け取らない。引数はフレームごとに変わりうる動的入力(motorState・dt・rng・loadTorque・
 * effectiveInertia)に限る。
 */
export function stepMotorWithDestruction(
  motorState: SimState,
  accumulator: RunAccumulator,
  dt: number,
  rng?: MotorStepRng,
  loadTorque?: number,
  effectiveInertia?: number,
): DestructionStepResult<SimState> {
  const config = accumulator.replaySnapshot.motorConfig; // 唯一の出典(Q9-2)
  const destructionConfig = accumulator.replaySnapshot.destructionConfig; // 唯一の出典(Q9-2)
  const physicsState = step(config, motorState, dt, rng, loadTorque, effectiveInertia);
  const frame = buildMotorOnlyFrameInput(config, motorState, physicsState); // 同一のconfigを使用(Q9-2、後述)
  const { state, events } = advanceDestructionState(
    accumulator.destructionState, frame, destructionConfig, accumulator.replaySnapshot.runContext, dt,
  );
  // (以下、physicsSnapshotAtTスタンプ・terminalModeCandidates蓄積・finalizeDestructionRun呼び出しは
  // 2.2節の既存ロジックと同一)
}
```

`config`・`destructionConfig`いずれの不一致も構造的に構築不能になる(Q6(a)と同じ「fail-fastではなく構築不能」原則を全base configへ一貫適用)。v12 §1.4(`RunSnapshot`は開始時に一度捕捉され以後不変という設計、`RunAccumulator`は`replaySnapshot`のみを保持し二重コピーを持たない)、および§3.2(「D02/D04/D07の実効config合成は…毎stepラッパー内で合成する」「合成後configをラッパー外へ一切出さない」「リプレイは`RunSnapshot`の元configから同じ合成を再計算する」)と最も整合する——将来のD02実効config合成(P3-3)は、ラッパーが`replaySnapshot`の元configから内部合成する設計を前提としており、`config`が外部から独立に注入できる旧設計は、この将来設計とそもそも両立しなかった。

**人間再承認が必要な契約変更(P3-1-Q9-4)**: これは承認済みv12 §4.4の公開シグネチャの変更であり、**P3-1-Q6(a)と同じ扱いで人間プロジェクトリードの再承認を要する**(Fable裁定)。**是正実装(`config`・`destructionConfig`引数の削除、内部でのsnapshot参照化、呼び出し元4箇所の機械的追従)は人間再承認後に行う。**

**是正の範囲(Fable指定)**: 是正実装は「両引数の削除+wrapper内部のsnapshot参照化+呼び出し側(テスト)の機械的追従」に限定し、rg依存閉包を完了報告へ含める。サブステップ3の未コミット差分は是正後に一括で完了報告へ含める(現状のまま保持する判断は正しいとFableが確認済み)。

**DoDテスト(Fable指定、2件)**:

1. **リプレイ等価テスト**: 不一致の構築不能性はシグネチャ自体が保証するため、「`accumulator.replaySnapshot`が唯一の入力である」ことを実挙動として固定する。同一の`RunSnapshot`から`createRunAccumulator`→`stepMotorWithDestruction`の連続呼び出しを独立に2回行い、両者の`events`・`destructionState`・`termination`が完全一致することを検証する。**`rng`は省略しない**(`step()`は`rng`省略時に内部で`Math.random`を消費する非決定的経路へフォールバックするため、省略するとテストの意図——「`snapshot`が唯一の入力である」こと——が、偶然`axisOffsetMm`等の値によって乱数の影響が消えるfixtureにたまたま依存する形になり得る)。各runとも同一の`motorState`初期値・同一の`dt`刻みに加え、既存のテスト用決定的PRNGヘルパー`mulberry32`(`src/engine/__tests__/prng.ts`、`motorPhysicsLoad.test.ts`等で既に使用実績あり)を`snapshot.seed`から**独立に2つ**生成し、それぞれのrunへ渡す(同一の`rng`インスタンスを使い回すと、2回目のrunが1回目の消費済み内部状態から再開してしまい、真の独立性を検証できない。`snapshot.seed`から導出することで、`RunSnapshot`が唯一の出典であるという意図をrng生成の面でもコードで固定する)。**非空の破壊経路で固定する**: `destructionConfig`だけを短絡発火向けに設定しても、`motorConfig`が通常値のままだと物理的にD03条件(`frame.shorted`)へ到達せず、`events`が空・`termination`がnullのまま「両者とも空」という自明な一致でテストが通ってしまいかねない。これを避けるため、snapshotの`motorConfig`も`goodMotorConfig({ slitWidthMm: 0 })`(持続短絡、既存`motorPhysicsV15.test.ts`等で使用実績のある構成)に固定し、比較の直前に`runA`側で実際にD03イベントが1件発生し`termination`が`destructionTerminal`で終端していることをassertしてから、`runA`と`runB`の完全一致を検証する。

```ts
// DoDテスト骨子(是正実装時にdestructionOrchestration.test.tsへ追加。同一__tests__ディレクトリのため相対import)
import { mulberry32 } from './prng';

it('同一のRunSnapshotから独立に2回run(createRunAccumulator→stepMotorWithDestruction連続呼び出し)を行うと、結果(events・destructionState・termination)が完全一致する(非自明な破壊経路で検証)', () => {
  const snapshot = captureRunSnapshot(motorSnapshotInput({
    motorConfig: goodMotorConfig({ slitWidthMm: 0 }), // 持続短絡(held-short)。通常値のままだとD03へ到達せず空走行同士の自明一致になる
    destructionConfig: goodDestructionConfig('nonLipo', { shortCircuitDurationLimitS: 1 / 120 }),
  }));

  function runOnce() {
    let accumulator = createRunAccumulator(snapshot);
    let motorState: SimState = initialSimState();
    let termination: RunOutcome | null = null;
    const rng = mulberry32(snapshot.seed); // RunSnapshot唯一出典の意図をrng生成の面でも固定する。各run独立に新規生成
    for (let i = 0; i < 30 && termination === null; i++) {
      const result = stepMotorWithDestruction(motorState, accumulator, 1 / 120, rng);
      motorState = result.physicsState;
      accumulator = result.accumulator;
      termination = result.termination;
    }
    return { events: accumulator.events, destructionState: accumulator.destructionState, termination };
  }

  const runA = runOnce();
  const runB = runOnce();

  // 空走行同士の自明な一致を禁止する: D03が実際に発火し終端していることを先に確認する
  expect(runA.events.some((e) => e.mode === 'D03')).toBe(true);
  expect(runA.termination?.endReason).toBe('destructionTerminal');

  expect(runB.events).toEqual(runA.events);
  expect(runB.destructionState).toEqual(runA.destructionState);
  expect(runB.termination).toEqual(runA.termination);
});
```

2. **共通不変条件のJSDoc記載+後続ステップへの同型テスト義務化**: 上記の確定シグネチャのJSDoc(既出)に共通不変条件の文言を記載する。P3-2(`stepTestRunWithDestruction`)・P3-4(`stepTrackRunWithDestruction`)の骨格実装時に、同型のリプレイ等価テストを課すことをDoD申し送りとする(2.2.2節・14節)。

**再提出要否**: 本裁定の反映がv9の範囲内であればFable再提出は不要。Suu_mot3の確認→人間再承認(Q9-4)→是正実装→サブステップ4再開の順で進める。

### 2.2.2 Phase 3 wrapper共通不変条件(正式Fable裁定P3-1-Q9-2、確定)

Q9の是正を`stepMotorWithDestruction`単体の場当たり的な修正に終わらせず、P3-2(`stepTestRunWithDestruction`)・P3-4(`stepTrackRunWithDestruction`)を含むPhase 3の全wrapperが最初から共有すべき設計原則として、次の共通不変条件を確定する:

> **走行開始時に確定する構成情報は`RunSnapshot`を唯一の出典とし、wrapperの独立引数として再入力させない。wrapperの引数は、フレームごとに変わりうる動的入力(現在のsim状態・dt・rng・動的負荷等)に限る。**

**個別の適用(確定)**:
- **`destructionConfig`**: 全wrapperで`accumulator.replaySnapshot.destructionConfig`を唯一の出典とする(確定)
- **`motorConfig`**: 同様に`accumulator.replaySnapshot.motorConfig`を唯一の出典とする。**実効config(P3-3のD02発煙段階R_coil重ね掛け等、v12 §3.2)はwrapper内部で`base config`+`DestructionState`から合成し、`buildMotorOnlyFrameInput`の`theoreticalCurrentA`計算も同一の実効configを使う**——wrapper内部でのconfig出典自体を一本化し、`step()`呼び出しと`buildMotorOnlyFrameInput`呼び出しとで異なるconfigを参照する余地を残さない
- **`carConfig`・`track`・`gearTotalToothCount`**: `accumulator.replaySnapshot`(`runContext`経由)を唯一の出典とする
- **vehicle wrapperで動的入力に残るもの**(プレイヤー入力等)は、P3-2/P3-4の各計画で明確化するが、この不変条件の枠内で行い、構成情報を動的入力側へ逃がさないこと(Fable指定)

**P3-4配線計画への申し送り(Fable指定)**: snapshot唯一出典の帰結として、走行中(組み立てモード含む)のモーター構成編集は「現在runの終了+新しいbeginRun(新snapshot)」として扱う必要がある——configの途中差し替えという概念自体が存在しなくなる。この設計をP3-4のgameStore配線計画で明示的に定義すること(14節へ台帳化)。

### 2.1.2 `createRunAccumulator`のbattery profile不一致——正式Fable裁定(P3-1-Q6: 案(a)、人間再承認対象)

**問題(実コード確認済み)**: P3-0で既に実装・commit済みの`createRunAccumulator(replaySnapshot: RunSnapshot, batteryProfile: 'lipo' | 'nonLipo'): RunAccumulator`は、`replaySnapshot.destructionConfig.battery.profile`と第2引数`batteryProfile`を別々に受け取るため、呼び出し側がこの2つを食い違わせることができる。`advanceDestructionState`の分岐条件`if (prev.battery.profile === 'nonLipo' && config.battery.profile === 'nonLipo')`は、不一致の場合**D03判定自体が無言でスキップされる**。P3-4でproduction配線が入った際、この食い違いが「破壊が一切発生しない」という重大な穴になり得る。

**正式Fable裁定(2026-08-03T09:05、確定): 案(a)**。`createRunAccumulator(replaySnapshot: RunSnapshot): RunAccumulator`へシグネチャを変更し、`batteryProfile`を`replaySnapshot.destructionConfig.battery.profile`から一意に導出する(冗長な第2引数を除去)。**裁定理由**: 不一致→D03無言スキップは「静かな穴」になり得る欠陥であり、fail-fast(案b)より構築不能(案a)が優る——不正状態は検出するより存在させないのが、このチーム(D03/D04の排他設計)が既に確立している原則そのものである。

**人間再承認が必要な契約変更**: これはP3-0で既に確定・実装済みの公開シグネチャの変更であるため、Fable裁定は済んでいるが、**人間プロジェクトリードの再承認を要する**(計画の当初申告どおり)。

**付帯条件(実装時に満たすこと)**:

1. **依存閉包の事前確認(実装前rg、pitfalls追加案2の自己適用)**:
```
$ rg -n "createRunAccumulator" src/ --include="*.ts"
```
現時点の結果、`createRunAccumulator`の呼び出し元は`src/engine/__tests__/destructionOrchestration.test.ts`のみ(6箇所、いずれも第2引数`'nonLipo'`または`'lipo'`を渡している)。定義自体は`src/engine/destructionOrchestration.ts`(46行目)。**シグネチャ変更時、この6箇所すべてを`createRunAccumulator(snapshot)`(第2引数削除)へ更新する必要がある**(既存P3-0テストの機械的追従、契約変更ではなく依存閉包)。他ファイルからの呼び出しは現時点で存在しない。
2. **負例テストの形**: 「不一致が構築不能であること」を**型テスト**として表現する(ランタイムのfail-fastテストではない)。`createRunAccumulator`が`replaySnapshot`のみを受け取る新シグネチャでは、そもそも呼び出し側が矛盾する2つの値を渡す余地自体がなくなるため、負例テストは「新シグネチャでは`batteryProfile`を独立に指定するコードが書けない(型上そのような呼び出しが存在しない)」ことを確認する形になる
3. **`advanceDestructionState`内の二重条件についての注記**: Q6(a)採用後、`if (prev.battery.profile === 'nonLipo' && config.battery.profile === 'nonLipo')`という二重条件は、**不一致ガードとしてではなく、TypeScriptの判別unionに対する型narrowingとして残る**(両者は`createRunAccumulator`の時点で既に同一の`replaySnapshot.destructionConfig.battery.profile`に由来するため、実行時に食い違うことは構造上あり得ない。ただし`prev.battery`と`config.battery`は型レベルでは独立した判別unionであり、TypeScriptの型システムに`nonLipo`分岐を認識させるにはこの二重チェックの記述自体が必要)。**将来の読み手がこれを「冗長な不一致ガード」と誤認して削除しないよう、2.1節のコード中へ次の1行コメントを追加する**: 「(Q6(a)採用後、この二重条件は不一致ガードではなく型narrowingである。両者は同一のdestructionConfig.battery.profileに由来するため実行時には常に一致する)」

**重要な訂正(v8で発見、v9で裁定確定)**: 上記3.の前提(「両者は`createRunAccumulator`の時点で既に同一の`replaySnapshot.destructionConfig.battery.profile`に由来するため、実行時に食い違うことは構造上あり得ない」)は、**`advanceDestructionState`の呼び出し元が常に`accumulator.replaySnapshot.destructionConfig`をそのまま`config`引数へ渡す場合にのみ成立する**。実際には唯一の呼び出し元である`stepMotorWithDestruction`(2.2節)が`destructionConfig`を独立した引数として受け取っており、この前提を呼び出し側の規約だけに委ねていた(強制する構造がなかった)。これは`createRunAccumulator`単体では閉じていなかった穴であり、P3-1-Q9として確認事項化され、**正式Fable補足裁定(2026-08-03T17:22)が案(b)で確定した**(2.2.1節・2.2.2節)。本節(2.1.2節)の`createRunAccumulator`自体のシグネチャ・裁定はQ9の影響を受けない(是正対象は`stepMotorWithDestruction`側の引数設計であり、Q9確定後は同関数の内部で`accumulator.replaySnapshot.destructionConfig`を直接参照するため、この前提が構造的に成立するようになる)。

### 2.3 `src/materials/materialMapping.ts`: 電池profile写像+D03較正値

```ts
// materialMapping.ts に追加

const BATTERY_DESTRUCTION_PROFILE: Record<BatteryMaterialId, 'lipo' | 'nonLipo'> = {
  'battery-alkaline': 'nonLipo',
  'battery-nickel-metal-hydride': 'nonLipo',
  'battery-lithium-polymer': 'lipo',
};

export function mapBatteryDestructionProfile(batteryId: BatteryMaterialId): 'lipo' | 'nonLipo' {
  return BATTERY_DESTRUCTION_PROFILE[batteryId];
}

// D03較正値: 短絡「開始」からの連続継続時間の下限(秒)。config.battery.shortCircuitDurationLimitSの
// 実際の判定式は advanceD03(2.1節)の
//   sharedShortCircuitDurationS + DURATION_COMPARISON_EPSILON_S >= config.shortCircuitDurationLimitS
//   && frame.batteryHeat >= BATTERY_HEAT_LIMIT
// (DURATION_COMPARISON_EPSILON_S=1e-9秒は浮動小数点誤差吸収のみが目的、v6で追加)であり、
// 「batteryHeatがBATTERY_HEAT_LIMITへ到達した後さらにこの秒数だけ待つ」という意味ではない
// (v1はこの点を誤って記述していた、Suu指摘、v2で訂正)。両条件は同一フレームで同時に
// 満たされて初めて発火する(短絡が閾値秒数以上連続し、かつそのフレームで発熱ゲージも上限に
// 達している、という単一の複合条件)。
//
// この定数はP3-1(Phase3のD03物理較正)の対象であり、Phase5(経済結線・数値保証)の対象では
// ない。値自体は実測較正ではなく設計値であり、確定手順は下記「正式Fable裁定(P3-1-Q3)」参照。
//
// 正式Fable裁定(2026-08-03T09:05、確定): 候補値3.0秒での実装開始を承認する。確定はsweep実測を
// もって行う。物理所見(Fable原文の要旨): 実物の乾電池短絡破裂は分単位の現象であり3.0秒は実
// 時間として短いが、この値は単独の破裂タイマーではなく「既存発熱物理でheatゲージが上限に
// 達していること」との複合条件の持続下限であり、実効的な到達時間は既存nextBatteryHeatの物理が
// 支配する。ゲーム時間スケール(数十秒〜数分の走行)に対する設計較正値として妥当な出発点で
// ある。アルカリ/NiMHの単一値も正しい——一次資料なしに差を発明するのは捏造側であり、差が
// 必要になる根拠が出るまで単一値が正直である。
//
// 受け入れ条件(実装ステップで満たすこと):
//   - アルカリ・NiMHそれぞれについて、既存nextBatteryHeatの発熱式(motorPhysics.ts)を用いた
//     sweepで、通常運用(短絡なし)ではBATTERY_HEAT_LIMIT到達前にD03が発火しないこと
//   - 意図的に持続短絡(shorted=trueを固定してdt刻みで進める)させた場合、有限のシミュレーション
//     時間内にD03が発火すること(held-short到達性テスト)
//   - dt境界(shortCircuitDurationLimitSちょうどの直前/直後)でのオン・オフが1フレーム単位で
//     正確に切り替わること
//
// 確定手順(Fable指定): 実装報告に、上記3条件のsweep実測データ全文と、短絡構成でのheatゲージ
// 上限到達時間と3.0秒の関係の実測を含める(4種の証跡)。実測が受け入れ条件を満たせばFable
// 再裁定不要でこの値を確定してよい。満たさず値の変更が必要な場合のみ、変更値と実測をSuu_mot3
// 経由で報告する。
const BATTERY_SHORT_CIRCUIT_DURATION_LIMIT_S_CANDIDATE: Record<Extract<BatteryMaterialId, 'battery-alkaline' | 'battery-nickel-metal-hydride'>, number> = {
  'battery-alkaline': 3.0,
  'battery-nickel-metal-hydride': 3.0, // 内部抵抗差を反映する一次資料が現時点でなく単一値とする
};

export function mapD03DestructionConfig(
  batteryId: Extract<BatteryMaterialId, 'battery-alkaline' | 'battery-nickel-metal-hydride'>,
): Extract<BatteryDestructionConfig, { profile: 'nonLipo' }> {
  return {
    profile: 'nonLipo',
    shortCircuitDurationLimitS: BATTERY_SHORT_CIRCUIT_DURATION_LIMIT_S_CANDIDATE[batteryId],
  };
}
```

**電池素材IDの出所(v1の未確認事項を解消)**: `src/engine/motorPhysics.ts`の`MotorConfig`実型は`batteryVoltage`・`internalResistanceRatio`・`capacityRatio`のみを持ち、`BatteryMaterialId`を保持しない(実コード確認済み、0節)。P3-0で確定した`EquipmentLoadout`+`PlayerInventory`が素材IDの正統な出所である。**しかしP3-1はQ2裁定によりproduction接続を行わないため、この経路は実際には使わない**——1.2節のfixture統合テストが`mapD03DestructionConfig(batteryId)`を**テストコード内で直接**呼ぶだけで型・契約の実証が完結する。v1にあった「gameStoreが電池素材IDをどう保持するか」という未確認事項・確認依頼は本ステップの対象外として削除する。

---

## 3. D01個別設計

| 項目 | 内容 |
|---|---|
| 物理トリガ | `frame.coilCollapsedRisingEdge`(既存`didCollapseJustHappen(prev,next)`、無改修で再利用) |
| 恒久劣化 | `RotorAssemblyState.collapsed = true`(サルベージのみ可) |
| 図鑑登録条件 | 崩壊開始の初回(`isFirstThisSession: true`固定) |
| 競合規則 | なし |
| 終端性 | 非終端 |

### 3.1 発火後物理(spec §7.1.1「実効巻数・占積が漸減、振動増。走行継続」)——正式Fable裁定(P3-1-Q1: 案(b))

**実コード確認結果**: `src/engine/vehiclePhysics.ts`の`coilCollapsePenaltyMm`機構は、`justCollapsed`の瞬間に`COIL_DEFORM_PENALTY_MM`を**一回だけ**加算する恒久ペナルティ(`effectiveAxisOffsetMm`経由で軸ずれ相当の性能低下として反映される)であり、これは「振動増」の一種の代理と見なせる。**しかし「実効巻数・占積が漸減」——発火後に時間とともに進行する継続的な劣化——を表す機構は、`motorPhysics.ts`・`vehiclePhysics.ts`のいずれにも存在しない。**

**正式Fable裁定(2026-08-03T09:05、確定): 案(b)**。P3-1は「崩壊開始イベント+既存恒久劣化(`RotorAssemblyState.collapsed=true`)+既存`coilCollapsed`物理までの最小実証」に限定し、「実効巻数・占積漸減」の実装自体を後続ステップへ明示的に割り当てる。**裁定理由**: 「実効巻数・占積の漸減」の劣化式は較正定数を要し、sweepなしにP3-1でこの式を発明することは「較正を装った捏造」に当たる(P3-0のQ2・Q6裁定と同じ原則)。

**返済先の物理的訂正(Fable指摘)**: 漸減は**vehicle層の現象ではなくモーター自体の現象**(実効巻数の減少→トルク定数・内部抵抗への影響)である。したがって正しい実装先は`stepTestRunWithDestruction`(vehicle wrapper)ではなく、**実効config合成機構を最初に導入するステップ**(v12 §3.2「D02発煙段階のR_coil重ね掛け」と同型のパターンを最初に実装するステップ)である。この機構は**D02実装ステップ(P3-3)**で導入される予定であるため、**D01漸減物理の自然な返済先はP3-3**と確定する。

**台帳化(先送り条件、必須遵守)**:
1. P3-3(D02実装ステップ)の計画に、「D01漸減がspec §7.1.1の文言と対応する形で実装され、劣化式はsweep付きで較正されること」をDoDとして明記する。`D01Progress`への進行度フィールド追加は、その時点で申告済みの契約変更として扱う(P3-0契約への拡張、Fable+人間再承認対象になる見込み)
2. **P3-1の完了報告でD01を「完成」と書かない**。「開始イベント+恒久劣化+既存フラグまで実装、漸減は未実装(返済先: P3-3)」と明記する

`stepMotorWithDestruction`(motor-only)自体は、D01の漸減物理を一切実装しない(motor-onlyのSimStateには元々実効巻数漸減を表現する場がなく、この機構が導入されるのはvehicle層側のD02実装ステップである)。

### 3.2 境界負例テスト

- `coilCollapsedRisingEdge: false`が連続するフレームでは`D01Progress.triggered`が`false`のまま、`events`にD01が現れない
- 一度`triggered: true`になった後、`advanceD01`自身の`prev.triggered`ガードが二重発火を防ぐことを確認する(冪等性の二重防御、既存`didCollapseJustHappen`の不可逆ガードとは独立した保証)

---

## 4. D03個別設計

| 項目 | 内容 |
|---|---|
| 物理トリガ | `shared.shortCircuitDurationS + DURATION_COMPARISON_EPSILON_S >= config.battery.shortCircuitDurationLimitS`(短絡**開始**からの連続時間、epsilon=1e-9秒は浮動小数点誤差吸収のみ、v6追加) かつ `frame.batteryHeat >= BATTERY_HEAT_LIMIT`(同一フレームでの複合条件)。非リポ系(アルカリ/NiMH)専用 |
| 発火後 | 瞬時・終端。`termination`が非nullになる |
| 恒久劣化 | battery個体消滅(くず値極小)。`{role:'battery', kind:'consumed'}`(P3-0既存実装) |
| 図鑑登録条件 | 破裂の初回(`isFirstThisSession: true`固定) |
| 競合規則 | リポ搭載時はD03自体が存在しない(構造的排他、判別union) |
| 終端性 | 終端 |

### 4.1 `shortCircuitDurationS`のリセット規則(維持、根拠を訂正)

`frame.shorted===false`になった瞬間に0へリセットする連続区間カウンタとする設計自体はSuu_mot3が妥当と評価済みのため維持する。**ただし根拠を訂正する**: v1は「チャタリング(`chatterFramesLeft`)による断続的接触不良を持続短絡と誤判定しないため」と記述していたが、実コード確認の結果`shorted = config.slitWidthMm <= 0`(motorPhysics.ts 299行目)はコミュテータの固定幾何パラメータのみで決まり、`chatterFramesLeft`とは完全に独立している(Suu指摘、v2で訂正)。**現行motor-onlyでは、一度組み立てられたモーター構成に対して`shorted`は run中ほぼ固定値であり、実際のチャタリングによって値が動くことはない。** したがって、リセット規則の負例テスト(短絡が一時的に途切れる状況)は、実際の物理から到達可能な状態ではなく、**`advanceD03`へ人工的に構築したframe入力(`shorted: false`を意図的に挟む)を与える状態機械テストとして実施する**。これは「将来、断続的な短絡が起こり得る入力に対しても正直に振る舞う一般規則」として維持する価値があるが、「チャタリング保護のため」とは書かない。

**境界1フレーム精度の数値実装(v6追加)**: `shortCircuitDurationS`の蓄積(dt刻み加算)は浮動小数点誤差を伴う(サブステップ1の`materialMapping.test.ts`で実測: dt=1/120sを360回加算した値は2.999999999999992)。`DURATION_COMPARISON_EPSILON_S=1e-9`秒による許容差込みの比較(2.1節)は、この誤差だけを吸収する数値実装であり、新しい物理式・較正値ではない。

### 4.2 境界負例テスト

- `shortCircuitDurationS`が閾値未満のまま人工的にリセットが挟まる(4.1節参照)→D03は発火しない
- `frame.batteryHeat`が`BATTERY_HEAT_LIMIT`未満のまま`shortCircuitDurationS`だけが閾値を超える人工入力→D03は発火しない
- リポ搭載(`prev.battery.profile==='lipo'`)の場合、D03に相当する判定自体が一切実行されないことをテストする

---

## 5. Q6不変条件の実コード検証

**不変条件(正式Fable Q6裁定)**: 「`advanceDestructionState`は、差分換算が実装済みのモード(P3-1時点ではD01・D03)のイベントしか発行してはならない」。2.1節の実装はD02/D05/D06/D07/D09の判定関数を一切呼び出さないため、この不変条件は構造的に満たされる。

**DoDテスト(v2訂正)**:
1. 極端な`DestructionFrameInput`を与えても、D02/D05/D06/D07/D09に対応する`events`が発行されないことをテストする
2. **`validateDestructionConfig`を通る有効な`DestructionConfig`fixtureを複数用意し(d02/d05/d06/d07/d09の値だけを変えた複数の正当なfixtureを比較する)、D01/D03の判定結果(events・state)がconfigのd02/d05/d06/d07/d09フィールドの値によって変化しないことをテストする。**(v1は`Infinity`や`0`等の`validateDestructionConfig`を通らない不正値を使っていたが、これは「完成版config fixture」と混同すべきでない。不正値を使った非参照検出テストを行う場合は、それが「pure関数の非参照性のみを確認する目的で、production-validなfixtureではない」ことを明記する。本ステップでは前者(複数の有効なfixture比較)を主方針とする、Suu指摘・v2で訂正)
3. `events`配列の順序がD01→D03の固定順序であることを、同一フレームで両方が発火し得る人工的な境界値で検証する(2.1節)

---

## 6. A1: 給電停止機構の再監査(結論・維持)

**結論: 導入しない。** `MotorConfig`・`stepTestRun`いずれにも新規フィールド・引数を追加しない。この結論はSuu_mot3が妥当と評価済みのため維持する。

**根拠**: `DestructionStepResult.termination`が非nullになった時点で、**呼び出し側(P3-1では手構築のテストharness、production配線が入るP3-4以降はstore層)が以後`stepMotorWithDestruction`を呼ばないという規約**だけで、D03発火後の物理進行を防げる。motor-only`SimState`には`status`概念自体が存在しないため、v12 3節表の「既存`stepVehicle`の`status:'overheated'`機構」はvehicle層にのみ適用対象があり、motor-onlyのD03終了は`termination`確定→呼び出し側の停止、という一本の機構だけで完結する。

### 6.1 DoDテスト(v2訂正: gameStoreではなくfixture harnessで検証)

v1は「`gameStore.ts`の`stepSim`が`termination`後に`stepMotorWithDestruction`を再度呼ばないこと」を検証するとしていたが、P3-1は`gameStore.ts`を変更対象に含めないため(1.1節)、この検証はテストコード内の**fixture harness**(1.2節の統合テストが使う手構築ループ)で行う:

1. D03発火(`termination !== null`)後、harnessが`stepMotorWithDestruction`を再呼び出ししない設計であることをテストする(harness自体の規約テスト。productionのstore/UI側の規約遵守はP3-4以降で別途検証する)
2. **規約に反してharnessが`termination`確定後にもう一度`stepMotorWithDestruction`を呼んだ場合の挙動を正確に記述する**: `advanceD03`の`prev.triggered`ガード(2.1節)により、**D03の`events`は増えない**(二重イベント・二重の劣化差分は発生しない)。ただし`terminalModeCandidates`は既に非空のまま残り続けるため、**`termination`自体は(内容が同一のまま)再び非nullを返す**——「terminationが二度とnullでなくなる」という意味ではnull化しない。v1はこの点を「engine側の`prev.triggered`ガードが安全網」とだけ書いていたが、正確には**イベント重複は防げるが、`applyRunOutcome`が呼ばれる回数自体(=経済的反映の二重適用)を防ぐ最後の防波堤は`applyRunOutcome`の`runSequence`/lease層(P3-0契約)であり、engineの`prev.triggered`ガードだけでは不十分である**ことを明記する(Suu指摘、v2で訂正)

---

## 7. RunOutcome→applyRunOutcome統合(fixtureベース、v2で全面書き換え)

### 7.1 全終了経路の網羅(fixtureテストとして)

motor-onlyの経路は1つ(`stepMotorWithDestruction`のみ)。次の2終了パターンを、いずれも同一の`applyRunOutcome`呼び出し規約(v12 §14「RunOutcome確定後1回のみ呼ぶ」)に従うfixtureテストとして検証する:

1. **`manualAbort`**: harness内で`finalizeRun(accumulator, {kind:'manualAbort'})`を呼ぶケース(production側の「いつmanualAbortを発行するか」の判断——実際には`resetSim`等——はP3-4のgameStore配線ステップで確定する。P3-1はこの経路が正しく`RunOutcome`→`applyRunOutcome`へ到達することのみを検証する)
2. **`destructionTerminal`(D03発火)**: `stepMotorWithDestruction`の戻り値`termination`をそのまま使うケース

### 7.2 P3-1 DoDのcontext範囲——正式Fable裁定(P3-1-Q4: 案(a))

v12 §12「P3-1」のDoD文言は「motor-only/test-run/track-run×全endReason(manualAbort含む)が同一のfinalizeDestructionRun/finalizeRun→applyRunOutcome経路を通ることの網羅テスト」と書かれているが、同節の実装対象は`stepMotorWithDestruction`のみであり、`stepTestRunWithDestruction`/`stepTrackRunWithDestruction`(vehicle/track版)は「契約骨格のみ」(v12 §4.4)でP3-2/P3-4まで実体を持たない。

**正式Fable裁定(2026-08-03T09:05、確定): 案(a)**。実wrapperは`stepMotorWithDestruction`のみ実装するが、DoDの「motor-only/test-run/track-run×全endReason」という文言は「**`RunOutcome`→`applyRunOutcome`経路がcontextに関わらず正しく機能すること(context非依存性)**」を意味すると解釈する。test-run/track-run文脈については**手構築の`RunOutcome`fixture**(実wrapperを経由しない、型を満たす値を直接構築したもの)を使って`applyRunOutcome`への到達をテストする。実wrapper自体の全endReasonテストはmotor-onlyのみ。

**裁定理由**: これはv12自身の内部矛盾(DoD文言と実装対象の不整合)の正しい解消であり、Q2裁定(産業配線をP3-4まで延期する案(c))とも整合する。**条件**: v12本文は編集しない(物理的無編集の原則を維持する——本裁定はv12の解釈の確定であり、v12自体への追記・修正ではない)。

**台帳化(先送り条件、必須遵守)**: 「実wrapper×全endReason網羅」テストを、P3-2(`stepTestRunWithDestruction`導入)およびP3-4(`stepTrackRunWithDestruction`導入)の各計画のDoDへ明示的に載せる。無言でどこにも属さなくなる(先送りが宙に浮く)ことを防ぐ。P3-1完了報告には、この先送りが台帳化されたことを明記する。

### 7.3 DoDテスト

- motor-only、`manualAbort`終了でD01の恒久劣化(rotorAssemblies)が正しく反映されることのfixture統合テスト
- motor-only、D03発火でbattery個体消滅+`destructionTerminal`終了が反映されることのfixture統合テスト
- 同一run内でD01(非終端)発火後にD03(終端)が発火した場合、両方の`degradationDiffs`が単一の`RunOutcome`へ集約され、単一の`applyRunOutcome`呼び出しで両方反映されることのfixture統合テスト
- test-run/track-run文脈の手構築`RunOutcome`fixtureで、`applyRunOutcome`経路のcontext非依存性を検証する(正式Fable P3-1-Q4(a)裁定確定、7.2節)

---

## 8. 破壊イベント契約の実コード適用確認

- **`physicsSnapshotAtT`**: 同一step内の全イベントが同一スナップショットを持つことをテストする
- **`causeLog`**: `advanceD01`/`advanceD03`がそのステップの`frame`引数の値をそのまま書き込み、以後上書きしない
- **`isFirstThisSession`**: D01/D03いずれも常に`true`固定
- **繰返し規則**: `prev.triggered`ガードにより同一runで複数回イベントが発行されないことを5節・6節のテストで担保
- **温度非遡及規則**: D03の`temperature: {kind:'uncalibratedGauge', ratio: frame.batteryHeat}`は将来較正完了後も書き換えない(正式Fable R2)。P3-1は`measured`状態を生成するパス自体を持たない

---

## 9. 変更対象ファイル一覧(所有者・依存閉包つき、v2で全面訂正)

### 9.1 alice_mot3所有(production)

| ファイル | 変更内容 |
|---|---|
| `src/engine/destructionModes.ts` | `advanceDestructionState`本体+`advanceD01`/`advanceD03`(2.1節) |
| `src/engine/__tests__/destructionModes.test.ts` | 上記のテスト |
| `src/engine/destructionOrchestration.ts` | `stepMotorWithDestruction`本体+`classifyTerminalModes`v12完全形+内部ヘルパー(2.2節) |
| `src/engine/__tests__/destructionOrchestration.test.ts` | 上記のテスト(8節のDoDテスト含む) |
| `src/materials/materialMapping.ts` | `mapBatteryDestructionProfile`・`mapD03DestructionConfig`+較正値(2.3節) |
| `src/materials/__tests__/materialMapping.test.ts` | 上記のテスト |

### 9.2 alice_mot3所有(fixtureテストのみ、production側変更なし)

| ファイル | 変更内容 |
|---|---|
| `src/store/__tests__/runOutcomeApplication.test.ts`(または新規専用テストファイル) | 1.2節・7節のfixture統合テスト。`src/store/runOutcomeApplication.ts`本体・`src/store/saveStore.ts`はいずれも無改修 |

### 9.3 変更しないファイル(v2で明示的に除外)

**`src/store/gameStore.ts`・`src/store/__tests__/gameStore.test.ts`は本ステップの変更対象から完全に除外する**(P3-0正式Q2裁定違反の是正、v1からの最重要変更)。`src/store/saveStore.ts`本体も無改修(action契約はP3-0で検証済み、1.2節)。brabit_mot3所有のproduction改修はP3-1に一切存在しない。

### 9.4 依存閉包の確認(rg事前実査、Q6(a)の破壊的シグネチャ変更を含む全件)

P3-1は`createRunAccumulator`(P3-1-Q6(a))という**P3-0公開関数の破壊的シグネチャ変更を含む**ため、「破壊的な型変更は本ステップに含まれない」とはいえない。新規識別子と既存識別子の変更を区別し、依存閉包を次のとおり全件列挙する。

**新規識別子(4件: `advanceDestructionState`・`stepMotorWithDestruction`・`mapBatteryDestructionProfile`・`mapD03DestructionConfig`)**:
```
$ rg -n "advanceDestructionState|stepMotorWithDestruction|mapBatteryDestructionProfile|mapD03DestructionConfig" src/ --type ts
```
これらは本ステップの新規追加ファイル自身にのみ現れる。既存productionからの呼び出しは存在しない(P3-1はproduction配線を持たないため、`gameStore.ts`等からの呼び出しも本ステップでは追加しない)。

**既存識別子の破壊的変更(Q6(a)、`createRunAccumulator`)**:
```
$ rg -n "createRunAccumulator" src/ --include="*.ts"
```
実測結果: 定義1箇所(`src/engine/destructionOrchestration.ts`46行目)+呼び出し元は`src/engine/__tests__/destructionOrchestration.test.ts`の6箇所のみ(いずれも第2引数`batteryProfile`を渡している)。**シグネチャ変更時、この6箇所すべてを`createRunAccumulator(snapshot)`(第2引数削除)へ機械的に追従させる**(2.1.2節と同一内容、ここへ統合)。他ファイルからの呼び出しは存在しない。

**既存識別子の定義移設(Q2(a)、`DestructionRunContext`・`FireExposureProfile`・`validateFireExposureProfile`)**:
```
$ rg -n "DestructionRunContext|FireExposureProfile|validateFireExposureProfile" src/ --include="*.ts"
```
実測結果(2.1.1節と同一内容、ここへ統合): production外部import 1箇所(`src/store/runOutcomeApplication.ts`)、test参照3ファイル(`src/engine/__tests__/destructionOrchestration.test.ts`・`src/store/__tests__/runOutcomeApplication.test.ts`・`src/store/__tests__/saveStore.test.ts`)。**いずれも`destructionOrchestration.ts`からのimportパスを使っており、re-export後は変更不要**(型の所有移動であり、破壊的シグネチャ変更ではないため依存閉包への機械的追従は発生しない)。

**既存識別子の定義移設(v5追加、Q7、`BatteryDestructionConfig`・`GearBreakageProfile`・`DestructionConfig`)**:
```
$ rg -n "BatteryDestructionConfig" src/ --include="*.ts"
$ rg -n "GearBreakageProfile" src/ --include="*.ts"
$ rg -n "\bDestructionConfig\b" src/ --include="*.ts"
```
実測結果(2.1.1-補遺節と同一内容、ここへ統合):
- `BatteryDestructionConfig`: production外部import1箇所(`src/materials/materialMapping.ts`)
- `GearBreakageProfile`: 外部参照なし(現時点、`destructionOrchestration.ts`内部使用のみ)
- `DestructionConfig`: test参照2ファイル(`src/engine/__tests__/destructionOrchestration.test.ts`・`src/store/__tests__/saveStore.test.ts`)

いずれも`destructionOrchestration.ts`からのimportパスを使っており、**re-export後は変更不要**(Q2(a)と同型の定義移設であり、破壊的シグネチャ変更ではないため依存閉包への機械的追従は発生しない)。

**新規の値import依存(v6追加、Q8、`BATTERY_HEAT_LIMIT`)**:
```
$ rg -n "BATTERY_HEAT_LIMIT" src/ -g "*.ts"
```
実測結果: 定義元は`src/engine/constants.ts`(120行目、`export const BATTERY_HEAT_LIMIT = 1.0;`)。**`constants.ts`自身は他のいかなるモジュールもimportしない(真のleaf、実コード確認済み)。** 既存の値import元は`src/engine/motorPhysics.ts`(34行目)・`src/engine/vehiclePhysics.ts`(28行目)、および複数のテストファイル(`motorPhysicsLoad.test.ts`・`motorPhysicsV15.test.ts`・`vehiclePhysics.test.ts`・`materialMapping.test.ts`)。`destructionModes.ts`が`import { BATTERY_HEAT_LIMIT } from './constants'`を追加しても、`constants.ts`→`destructionModes.ts`という逆方向の依存は生じない(`constants.ts`が空のimportのままであるため、循環は構造的に発生し得ない)。

以上により、本ステップで機械的追従が必要なのは`createRunAccumulator`呼び出し元6箇所(いずれもP3-0既存テストファイル1件)のみであり、他の依存閉包(Q2(a)・Q7・Q8とも)は「変更不要であることの確認」または「循環が生じないことの確認」で完結する。

**新規の契約穴(v8追加、Q9、`stepMotorWithDestruction`)**:
```
$ rg -n "stepMotorWithDestruction" src/ -g "*.ts"
$ rg -n "buildMotorOnlyFrameInput" src/ -g "*.ts"
```
実測結果(2.2.1節と同一内容、ここへ統合): 定義は`src/engine/destructionOrchestration.ts`(764行目)のみ。呼び出し元は`src/engine/__tests__/destructionOrchestration.test.ts`の4箇所のみ(サブステップ3で新規追加、production呼び出しなし)。`buildMotorOnlyFrameInput`は内部呼び出し1箇所のみで非公開。**P3-1-Q9裁定(案(b)確定)により、機械的追従が必要なのはこのテストファイル1件・4箇所のみ**(依存閉包は小さいが、`config`・`destructionConfig`両引数を削除するため、この4箇所すべてで呼び出し側の引数の組み立て方自体を書き換える必要があり、単純な引数削除の機械的置換では済まない点に注意)。

---

## 10. bundle sizeの現在基準

**現基準(P3-0完了時点)**: `dist/assets/index-*.js` 781.47 kB(gzip 219.29 kB)。P3-1は`src/engine/`・`src/materials/`への追加のみ(UIコンポーネント・gameStore.ts変更なし、v2で対象縮小)であり、影響はP3-0の同種追加より更に軽微と見込む。実装後の実測値を完了報告へ記載する。

---

## 11. dt分割不変性の検証可能な定義(v2で明確化)

固定dt=1/120sが正典(CLAUDE.md)。異なるdt分割(1フレーム1ステップ vs 2ステップ)間で、`causeLog.atT`・`physicsSnapshotAtT`の物理状態が**完全に同一の数値**になるとは限らない(積分誤差の蓄積が理論上あり得る)。**曖昧な「完全一致」を要求せず、比較対象を次のとおり具体化する**:

- 発火有無(D01/D03いずれも発火する/しないが分割方法によって変わらないこと)
- event件数・順序(D01→D03の固定順序が分割方法に関わらず同一であること)
- 最終`DestructionState`(`triggered`フラグ等の離散状態が分割方法に関わらず一致すること)
- `causeLog.atT`は「1フレーム=最大2物理ステップ」という既存の非機能要件の範囲内での差(1ステップ分、dt=1/120s単位)を許容差とする。数値の完全一致は要求しない
- **`shortCircuitDurationS`と`config.shortCircuitDurationLimitS`の境界比較(v6追加)**: `DURATION_COMPARISON_EPSILON_S=1e-9`秒による許容差込みの比較(2.1節・4.1節)は、dt分割不変性が要求する「発火有無が分割方法に関わらず同一」を、浮動小数点誤差という実装上の理由から満たすための数値実装である。この許容差自体は分割方法(1ステップ/2ステップ)に関わらず同一の値を使うため、dt分割不変性の定義そのものを変更しない

---

## 12. 正式Fable裁定結果(P3-1-Q1〜P3-1-Q6、2026-08-03T09:05確定/P3-1-Q7・P3-1-Q8、2026-08-03T16:13補足裁定確定/P3-1-Q9、2026-08-03T17:22補足裁定確定)

| 質問 | 該当節 | 裁定 | 人間再承認 |
|---|---|---|---|
| P3-1-Q1 | 3.1節 | 案(b): P3-1は最小実証に限定。D01漸減物理はP3-3(実効config合成機構導入ステップ)へ台帳化 | 不要(P3-1はD01を「完成」と書かない) |
| P3-1-Q2 | 2.1.1節 | 案(a): `DestructionRunContext`/`FireExposureProfile`を`destructionModes.ts`へ移設、re-export | 不要(公開面不変、報告記載で足りる) |
| P3-1-Q3 | 2.3節 | 候補値3.0秒で実装開始を承認。確定はsweep実測(4種の証跡)による | 不要(受け入れ条件を満たせば再裁定不要) |
| P3-1-Q4 | 7.2節 | 案(a): DoD文言を「RunOutcome→applyRunOutcomeのcontext非依存性」と解釈。実wrapper×全endReason網羅はP3-2/P3-4へ台帳化 | 不要(v12本文は無編集) |
| P3-1-Q5 | 2.2節 | 案(a): `classifyTerminalModes`をexport化。JSDocで正式Fable Q6不変条件との別物性を明記 | 不要(新規関数の可視化) |
| P3-1-Q6 | 2.1.2節 | 案(a): `createRunAccumulator(replaySnapshot)`のみへ変更、profileを一意導出 | **必要**(P3-0公開シグネチャの変更) |
| **P3-1-Q7(2026-08-03T16:13承認)** | 2.1.1-補遺節 | 案(a)承認: `BatteryDestructionConfig`/`GearBreakageProfile`/`DestructionConfig`を`destructionModes.ts`へ移設、re-export | **不要**(公開面不変、報告記載で足りる) |
| **P3-1-Q8(2026-08-03T16:13承認)** | 2.1.1-補遺2節 | 案(a)承認: `constants.ts`(真のleaf)からの一方向値import(`BATTERY_HEAT_LIMIT`)を許可、leaf規則の意味を確定文言どおり再定義 | **不要**(実装詳細、報告記載で足りる) |
| **P3-1-Q9(2026-08-03T17:22承認)** | 2.2.1節・2.2.2節 | 案(b)確定: `stepMotorWithDestruction`から`config`・`destructionConfig`両引数を削除、`accumulator.replaySnapshot`を唯一の出典化。Phase 3 wrapper共通不変条件を新設(2.2.2節) | **必要**(v12 §4.4承認済み公開シグネチャの変更、Q6(a)と同じ扱い) |

**総合判定(Fable原文の要旨、Q1〜Q6分)**: 条件付き承認。実装開始を妨げる必須修正はない。計画の質は高く、v1のQ2裁定違反をSuuレビューが実装前に止め、v2/v3で実コード照合に基づく訂正を重ねた結果、「実コードと正典の不一致を隠さず裁定に上げる」という規律の見本になっている、と評価された。無言の契約縮小を明示的に拒否している点(7.2節・3.1節)も特に評価された。

**P3-1-Q7・P3-1-Q8の補足裁定(2026-08-03T16:13、確定)**: 両者とも承認、契約変更に当たらず人間再承認不要(2.1.1-補遺節・2.1.1-補遺2節に裁定理由を記載)。**leaf不変条件**(「`destructionModes.ts`の公開シグネチャに現れるすべての型は`destructionModes.ts`が所有する」)をQ7の付帯条件として確定し、**構造テスト**(2.1.1-補遺3節)によって以後この不変条件・Q2(a)・Q8のleaf規則確定文言を機械的に守る状態にすることを付帯条件とした。**必須修正はなし。**

**D03境界epsilon実装(Fable Q3「境界1フレーム精度」の数値実装)への補足裁定**: `DURATION_COMPARISON_EPSILON_S=1e-9`秒(2.1節・2.3節・4節・11節)は**異議なく承認**。数値所見(Fable原文): 360回加算の蓄積誤差は約8e-15であり、epsilon=1e-9はこれを吸収するのに十分大きく、かつdt=1/120秒(約8.3e-3)より6桁小さいため、境界を誤った方向に1フレームずらすことは構造的に不可能。「物理較正値ではなく浮動小数点誤差の吸収のみ」というラベル・359/360/361フレームの実経路固定テスト・dt分割不変性定義との整合の明記(11節)、いずれも正確でQ3「境界1フレーム精度」の正しい数値実装と認められた。**付帯条件**: `DURATION_COMPARISON_EPSILON_S`を単一出典として維持し、後続ステップ(P3-2のD04`stageDurations`、P3-3のD05`brushSparkDurationLimitS`)が同種のduration比較を導入する際、別のepsilonを発明せず共通化・同一出典利用を検討することを、P3-1完了報告の申し送り事項として明記する(14節)。

**その他の確認事項への所見(いずれも妥当と評価され、本文の変更は不要)**: events固定順序D01→D03/D03の非リポ専用・D04構造排他/D03二重閾値(既存発熱式流用の原則)/D01非終端・D03終端(spec整合)/A1結論(給電停止機構は導入しない、6.1節のprev.triggeredガードの限界に関する正確な記述を特に評価)/Q6不変条件のproduction-valid fixture比較方式/physicsSnapshotAtT同一step一致・causeLog固定・isFirstThisSession true固定・二重発火防止/D01のtemperature:unavailable・D03のuncalibratedGauge(温度規約準拠)/`void runContext`/fixture限定によるQ2遵守の厳格解釈/dt分割不変性の定義(11節)/D03較正のPhase3帰属訂正/production-valid fixture主方針/pitfalls追加2件の文言・根拠。

**実装後レビューへの提出証跡(完了報告に必須)**: `npm run test`全出力(省略なし)・`npm run build`全出力+bundle size実測(P3-0基準781.47kB/gzip 219.29kBとの差分)・`npm run lint`・`cmp AGENTS.md CLAUDE.md`・`git diff --check`と`--stat`・D03 sweep実測データ(2.3節の4種証跡)・Q6依存閉包rgの実結果(2.1.2節)・pitfalls 2ルールの最終文言・**leaf不変条件の成立確認(1行、2.1.1-補遺節)**・**epsilon単一出典+D04/D05再発明回避の申し送り記載**。

**次回人間承認時の報告事項**: Q7・Q8は現時点の再承認ゲートではないが、**次回の人間承認(実装完了報告等)時に報告事項の一覧へ含める**(Fable指定)。

**P3-1-Q9(2026-08-03T17:22、正式Fable補足裁定確定、2.2.1節・2.2.2節)**: サブステップ3実装完了後のSuu_mot3コードレビューで新規発見。`stepMotorWithDestruction`の`config`/`destructionConfig`引数が`accumulator.replaySnapshot`と独立に食い違い得るため、Q6(a)が確立した「不一致は構築不能」という保証が実際には`stepMotorWithDestruction`の引数設計によって素通りできる状態だった。**案(b)を確定**(`config`・`destructionConfig`両方を削除し`accumulator.replaySnapshot`を唯一の出典とする)。理由: 案(a)はD03の穴のみ塞ぎ`MotorConfig`側の同種の穴を残す、案(c)はQ6(a)が退けたfail-fastパターンで劣る。**Phase 3 wrapper共通不変条件**(「走行開始時に確定する構成情報はRunSnapshotを唯一の出典とし、wrapperの独立引数として再入力させない」)を新設し、P3-2・P3-4の各wrapperにも同一原則を適用する(2.2.2節)。**人間再承認を要する**(v12 §4.4承認済み公開シグネチャの変更、Q6(a)と同じ扱い)。**是正実装(両引数削除+呼び出し元4箇所の機械的追従)は人間再承認後に行う。** サブステップ3の既存差分(欠陥を含む)は保持し、再承認後に該当箇所のみ修正実装へ入れ替える。DoDとしてリプレイ等価テスト(同一snapshotから独立2回runした結果が完全一致すること)を追加する(2.2.1節)。

**v12本文への確定裁定の反映管理(P3-1-Q9-5、確定)**: v12本文は物理的無編集を維持するが、確定した裁定(Q4解釈・Q8解釈・Q9シグネチャ等)がv12本文を実質的に上書きする状態が複数件蓄積しており、散在すると「v12だけを読んだ者が古い契約を実装する」事故が起こりうる。**追記専用の単一台帳`docs/phase3-plan-v12-amendments.md`を新設し、各裁定の番号・日付・置換対象節・新契約文を一覧で管理する**(docs-only作業、統合full-text化(過去のR1推奨)のPhase 3中の軽量代替)。以後、v12は必ずこの台帳と対で読む。

**再提出要否(P3-1-Q9反映後の現在の状態)**: P3-1-Q9裁定の反映がv9〜v11の範囲内であればFable再提出は不要。進行順序は「Suu_mot3のv11確認→人間再承認(P3-1-Q9-4)→是正実装→サブステップ4再開」。実装完了報告は従来どおり正式Fable個別レビューへ提出する。

---

## 13. AGENTS.md/CLAUDE.md pitfallsルール追加計画(維持、正式Fableが文言・根拠とも妥当と評価済み)

Fable推奨2件を、P3-1のdocsゲート(実装完了後)で番号付きルールとして追加する。

**追加案1(Fable回答の真正性)**: 正式なFableレビュー回答は、人間プロジェクトリードの直接提示、またはSuu_mot3が中継したものだけを正式回答として扱う。いかなるエージェントも、Agentツール等でFable名義の文書を自ら生成し、それを正式レビュー回答として提出・保存してはならない。**根拠**: 2026-08-02、開発チームの一エージェントがAgentツールへ`model:'fable'`を指定して自己生成した文書を、正式なFableレビュー回答と誤認して保存・中継する事故が実際に発生した。この事故は検出・訂正されたが、同種の事故を構造的に防ぐため本ルールを追加する。

**追加案2(破壊的型変更の依存閉包事前列挙)**: `src/engine/`・`src/materials/`の既存型を破壊的に変更する計画を立てる際は、単一tsconfigプロジェクト全体で当該型を参照する全箇所を事前に`rg`で洗い出し、計画書へ依存閉包(所有境界を越えて機械的追従が必要なファイル一覧)として明記すること。**根拠**: P3-0の実装中、`WearState.gear`型の破壊的変更が計画に一度も記載されていなかった`src/retro/shop/formatMaterial.ts`の型検査を壊す事象が発生し、実装段階で初めて発覚した。事前の`rg`洗い出しにより同種の事象を防ぐため本ルールを追加する。

具体的な文言・挿入位置は、本計画がSuu_mot3レビューを通過した後、AGENTS.md/CLAUDE.md同期作業(P3-1の最終サブステップ)で確定する。

---

## 14. DoD・実装順序・承認ゲート

### 14.1 実装順序(サブステップ)

1. `src/materials/materialMapping.ts`(電池profile写像+D03較正値)+テスト——**完了・Suu_mot3レビュー通過済み(2026-08-04)**
2. `src/engine/destructionModes.ts`(`advanceDestructionState`本体)+テスト(3節・4節・5節・6節のDoD)——**完了・Suu_mot3レビュー通過済み(2026-08-03T16:34)**。`BatteryDestructionConfig`・`GearBreakageProfile`・`DestructionConfig`の型移設(2.1.1-補遺節)・`BATTERY_HEAT_LIMIT`の値import(2.1.1-補遺2節)・leaf不変条件の構造テスト(2.1.1-補遺3節)を実装済み
3. `src/engine/destructionOrchestration.ts`(`stepMotorWithDestruction`本体+`classifyTerminalModes`完全形)+テスト(7節・8節のDoD)——**実装済み(2026-08-04)だが、実装完了後のコードレビューで新規契約穴P3-1-Q9を発見。正式Fable補足裁定(2026-08-03T17:22)が案(b)で確定、人間再承認(Q9-4)を要する。既存差分(是正前の旧シグネチャ)はそのまま保持し凍結。人間再承認が完了するまで、`stepMotorWithDestruction`のシグネチャ是正を含むいかなる追加production/test編集も行わない。再承認後の是正実装は2.2.1節の確定シグネチャ+リプレイ等価テストを反映する。**
4. `src/store/__tests__/runOutcomeApplication.test.ts`へのfixture統合テスト追加(1.2節・7節)——**サブステップ3の是正実装完了までは着手しない**(fixture統合テストは`stepMotorWithDestruction`の最終シグネチャに依存するため)
5. AGENTS.md/CLAUDE.md pitfallsルール2点の追加(13節)+`cmp`確認
6. 全体DoD(`npm run test && npm run build && npm run lint`)+bundle size実測報告

`src/store/gameStore.ts`は本ステップのいかなるサブステップにも含まれない(9.3節)。

### 14.2 DoD一覧

- 発火境界(D01のrising edge、D03の二重閾値)
- 一度きり(`prev.triggered`ガードによる冪等性)
- ログ固定
- dt分割不変性(11節の具体化した定義)
- 相互非干渉
- `events`固定順序(D01→D03、2.1節)
- `physicsSnapshotAtT`の同一step一致
- 手動中断(`manualAbort`)時も途中までの`degradationDiffs`が確定反映されること(fixtureテスト)
- motor-only×全endReasonが同一の`finalizeDestructionRun`/`finalizeRun`→`applyRunOutcome`経路を通ることの網羅テスト+test-run/track-run文脈は手構築`RunOutcome`fixtureによるcontext非依存性テスト(7.2節、P3-1-Q4裁定どおり)
- `classifyTerminalModes`をexportし(P3-1-Q5裁定)、v12完全形の全分岐(正例)+負分岐(D04 stage≠burning非分類・D06 isTotalLoss=false非分類・D01/D05/D07非分類)を網羅テスト(8節・2.2節)
- Q6不変条件の機械検証(5節、production-valid fixture比較。JSDoc中の「Q6不変条件」呼称の混同防止コメントも確認)
- A1結論の機械検証(6節、fixture harnessベース)
- `MotorStepRng`型導出の`tsc -b`成功確認(motorPhysics.ts無改修のまま`Rng`相当の型を得られること、2.2節)
- `advanceDestructionState`の`runContext`引数が`noUnusedParameters`下でビルド成功すること(2.1節)
- `createRunAccumulator(replaySnapshot)`へのシグネチャ変更(P3-1-Q6裁定)+型narrowingコメント追加+依存閉包(destructionOrchestration.test.ts 6箇所)の機械的追従+「不一致が構築不能であること」の型テスト(2.1.2節)
- P3-1-Q1裁定に基づく台帳化: P3-3計画へD01漸減物理のDoDを明記する予定であることの記載(3.1節)
- P3-1-Q4裁定に基づく台帳化: P3-2/P3-4計画へ「実wrapper×全endReason網羅」を明記する予定であることの記載(7.2節)
- D03較正値のsweep実測4種証跡(通常運用非到達・held-short有限到達・境界1フレーム精度・heat上限到達時間と3.0秒の関係、2.3節)
- **(v6追加)** `DURATION_COMPARISON_EPSILON_S`込みの境界比較を`advanceDestructionState`実経路で検証: 359フレーム未発火・360フレーム発火・361フレームへの遅延不許容(2.1節・4節)。`materialMapping.test.ts`の実測(360回加算=2.999999999999992)との対応確認
- **(v6追加)** `destructionModes.ts`が`import { BATTERY_HEAT_LIMIT } from './constants'`を追加してもビルド・循環importが発生しないことの確認(P3-1-Q8裁定どおり、2.1.1-補遺2節・9.4節)
- **(v7追加)** leaf不変条件の構造テスト(2.1.1-補遺3節): `destructionModes.ts`のimport文が許可リスト(value: `./constants`のみ、type-only: `./motorPhysics`・`./vehiclePhysics`のみ)以外を含まないことを、ソーステキストを実際に読み込んで検証するテストを1件追加。特に`./destructionOrchestration`からのimportが存在しないことを明示的に確認する
- **(v7追加)** `DURATION_COMPARISON_EPSILON_S`の単一出典維持+D04(P3-2)/D05(P3-3)での再発明回避の申し送りをP3-1完了報告へ記載(12節)
- **(v7追加)** leaf不変条件(「destructionModes.tsの公開シグネチャに現れる全型はdestructionModes.ts所有」)の成立確認を完了報告へ1行記載(2.1.1-補遺節・12節)
- **(v9追加)** `stepMotorWithDestruction`のQ9是正実装(人間再承認後)で、`config`・`destructionConfig`両方が`accumulator.replaySnapshot`由来のみとなり独立引数として指定不能であることを確認(2.2.1節確定シグネチャ)。既存4呼び出し箇所(destructionOrchestration.test.ts)の機械的追従+`tsc -b`成功確認
- **(v9追加、v10で強化)** リプレイ等価テスト(2.2.1節): 同一`RunSnapshot`から`createRunAccumulator`→`stepMotorWithDestruction`の独立2回runで、`events`・`destructionState`・`termination`が完全一致することを確認。**D03が実際に発火(`events`に含まれる)し`termination.endReason==='destructionTerminal'`で終端していることを比較前にassertし、空走行同士の自明な一致でテストが通らないことを保証する**(non-trivial destructive pathでの検証)
- **(v9追加)** Phase 3 wrapper共通不変条件(2.2.2節)のJSDoc記載確認+P3-2/P3-4の骨格実装DoDへ同型リプレイ等価テストを課す旨の申し送りが台帳化されていることの確認
- **(v9追加、台帳化)** P3-4のgameStore配線計画への申し送り: snapshot唯一出典の帰結として、走行中(組み立てモード含む)のモーター構成編集は「現在runの終了+新しいbeginRun(新snapshot)」として扱う必要があり、configの途中差し替えという概念自体が存在しなくなることを、P3-4計画で明示的に定義する(2.2.2節、Fable指定)
- 既存DoD(`npm run test && npm run build && npm run lint`)
- bundle size実測記載(P3-0基準781.47kB/gzip219.29kBとの差分)
- `git diff --check`・`--stat`
- `cmp AGENTS.md CLAUDE.md`差分なし

### 14.3 承認ゲート

**正式Fable個別レビュー(2026-08-03T09:05)はQ1〜Q6につき条件付き承認済み**。人間プロジェクトリードがP3-1-Q6(a)を再承認し(2026-08-04)、サブステップ1(materialMapping.ts)を実装・Suu_mot3レビュー通過済み。

**正式Fable補足裁定(2026-08-03T16:13、確定)**: P3-1-Q7・P3-1-Q8はいずれも承認、契約変更に当たらず人間再承認不要。D03境界epsilon(`DURATION_COMPARISON_EPSILON_S`)も異議なく承認。**必須修正なし。** Q7・Q8は次回の人間承認(実装完了報告等)時に報告事項の一覧へ含める(再承認ゲートではない)。

**サブステップ2の解禁条件**: Suu_mot3のv7差分確認のみで着手してよい(Q7・Q8とも人間再承認は不要なため)。サブステップ1の既存差分はそのまま保持する。**Suu_mot3の確認完了までは production/test編集・実装・commit・tag・push のいずれも開始しない。**——**サブステップ2は2026-08-03T16:34にSuu_mot3のv7差分確認を通過し、完了済み。**

**サブステップ3の状態(v11)**: サブステップ3(`stepMotorWithDestruction`本体・`classifyTerminalModes`完全形)はSuu_mot3の正式解禁(2026-08-03T16:57)を受けて実装済みだが、実装完了後のコードレビューでP3-1-Q9が新規発見され、正式Fable補足裁定(2026-08-03T17:22)が案(b)で確定した(2.2.1節・2.2.2節)。**この裁定は人間再承認(Q9-4)を要する。人間再承認が完了するまで、サブステップ4・AGENTS.md/CLAUDE.md編集・`gameStore.ts`/`saveStore.ts`のproduction編集・commit/tag/pushのいずれも行わない。** サブステップ3の既存差分(是正前の旧シグネチャ)はそのまま保持し、人間再承認後に`stepMotorWithDestruction`を2.2.1節の確定シグネチャへ是正実装する(リプレイ等価テスト込み)。**進行順序: Suu_mot3のv11照合→人間再承認(Q9-4)→是正実装→サブステップ4再開。**

---

## 15. 改訂履歴

- v1(2026-08-03提出): 初版
- v2(2026-08-03提出): Suu_mot3レビュー必須修正14点対応。**最重要**: `gameStore.ts`への実配線がP3-0正式Q2裁定(production配線はP3-4まで延期)に違反していたため、`gameStore.ts`/`gameStore.test.ts`を変更対象から完全除外し、fixtureベース統合テストへ全面差し替え(1節・6節・7節・9節・14節)。その他: `events`固定順序の実装バグ修正(D03→D01の逆順だったものをD01→D03へ、2.1節)、D01発火後物理の正典不一致を独断で落とさずFable確認事項化(3.1節、P3-1-Q1)、`DestructionRunContext`のleaf方針違反プレースホルダを撤去しFable確認事項化(2.1.1節、P3-1-Q2)、電池IDの未確認事項を削除(既に解決可能と判明、2.3節)、D03較正値3.0秒の意味説明訂正+Phase帰属訂正(Phase5→Phase3/P3-1、2.3節、P3-1-Q3)、chatter保護という誤った根拠を削除しshortedの実際の決定要因(slitWidthMm)を反映(4.1節)、`classifyTerminalModes`をv12完全形で実装するよう訂正(2.2節・8節)、P3-1 DoDのcontext範囲に関するv12内部矛盾を明示しFable確認事項化(7.2節、P3-1-Q4)、dt分割不変性の検証可能な定義への具体化(11節)、A1テストをfixture harnessベースへ修正+prev.triggeredガードの正確な限界の記述(6.1節)、Q6テストのfixture妥当性を明確化(5節)、計画内のリポジトリ外参照記法を除去し単独で読める記述へ置換(13節)。
- v3(2026-08-03提出): Suu_mot3再レビュー必須修正4点対応。(15) `motorPhysics.ts`の`Rng`型が非exportでビルド不能だった問題を、`motorPhysics.ts`無改修のまま`typeof step`から`MotorStepRng`型を導出する方式で解消し、`tsc -b`検証をDoDへ追加(2.2節)。(16) `advanceDestructionState`の`runContext`引数がP3-1では未使用のまま残り`tsconfig.app.json`の`noUnusedParameters:true`に反していた問題を、`void runContext;`+将来使用予定の注記で解消(2.1節)。(17) `classifyTerminalModes`が非exportのままではv12完全形の全分岐を手構築event fixtureで直接テストできない問題を、export化(案a、Suu推奨)/非export維持でP3-1はD03経由のみテスト(案b)の2案としてFable確認事項P3-1-Q5化(2.2節)。(18) `createRunAccumulator`の`batteryProfile`引数と`replaySnapshot.destructionConfig.battery.profile`が食い違うと`advanceDestructionState`のD03判定が無言でスキップされる(P3-4のproduction配線時に「破壊が一切発生しない」重大な穴になり得る)問題を、シグネチャ変更で不一致を構造的に不可能化(案a、Suu推奨、P3-0公開シグネチャ変更につきFable+人間再承認対象)/現行シグネチャ維持+fail-fast検証(案b)の2案としてFable確認事項P3-1-Q6化(2.1.2節)。Fable向け質問をP3-1-Q1〜Q6の6点へ拡充、DoD一覧・改訂履歴を同期。
- v4(2026-08-03提出): 正式Fable技術レビュー(2026-08-03T09:05、条件付き承認)のP3-1-Q1〜Q6裁定+付帯条件を反映。Q1(案b確定、D01漸減物理の返済先をP3-3「実効config合成機構導入ステップ」と特定し台帳化、P3-1完了報告でD01を完成と書かない、3.1節)。Q2(案a確定、`DestructionRunContext`/`FireExposureProfile`を`destructionModes.ts`へ移設・re-export、契約変更なし・依存閉包rg結果を実測反映、2.1.1節)。Q3(候補値3.0秒での実装開始承認、確定はsweep実測4種証跡による、2.3節)。Q4(案a確定、DoD文言をRunOutcome→applyRunOutcomeのcontext非依存性と解釈、実wrapper×全endReason網羅をP3-2/P3-4へ台帳化、v12本文無編集の条件明記、7.2節)。Q5(案a確定、`classifyTerminalModes`をexport化+指定JSDoc(正式Fable Q6不変条件との混同防止注記込み)+正負全分岐テスト、2.2節)。Q6(案a確定、`createRunAccumulator(replaySnapshot)`のみへのシグネチャ変更、実測した依存閉包(destructionOrchestration.test.ts 6箇所のみ)を反映、型narrowingコメントを2.1節コードへ追加、負例テストを型テストへ再定義、人間再承認対象と明記、2.1.2節)。12節をFable向け質問一覧から裁定結果表+実装後提出証跡一覧へ全面差し替え。14節DoD一覧・承認ゲートを裁定確定後の状態へ同期。
- v5(2026-08-04提出): サブステップ1(materialMapping.ts)完了・Suu_mot3レビュー通過後、サブステップ2着手準備中にコードレビューで新規発見された阻害要因(P3-1-Q7)を反映。`advanceDestructionState`が必要とする`BatteryDestructionConfig`・`GearBreakageProfile`・`DestructionConfig`が現状すべて`destructionOrchestration.ts`所有であり、Q2(a)裁定(leaf純度を構造で守る)の対象に含まれていなかったため、`DestructionRunContext`と同型の逆向き依存が未解決のまま残っていたことを実コードのrg結果で裏付けて明示(0節・2.1節・2.1.1-補遺節・9.4節)。Suu_mot3推奨の最小修正案(3型のみを`destructionModes.ts`へ移設、`DestructionConfigDraft`・`InvalidConfigField`・`ValidateDestructionConfigResult`・`validateDestructionConfig`本体・raw validatorはorchestration側に残す)を完全シグネチャで提示しつつ、契約変更か否かの判断は独断で決めずFable確認事項P3-1-Q7として12節の裁定結果表へ追加(裁定待ち)。14節の実装順序・承認ゲートを、サブステップ2がQ7裁定+Suu確認(必要なら人間再承認)まで着手しないことが分かる状態へ更新。サブステップ1の既存差分は変更せず保持。
- v6(2026-08-04提出): Suu_mot3のv5照合(Q7本体は正確と評価)で指摘された追補2点を反映。(1) サブステップ1で発見・Suu裁定したD03境界epsilon(`DURATION_COMPARISON_EPSILON_S=1e-9`秒、`materialMapping.test.ts`の実測「dt=1/120sを360回加算した値は2.999999999999992」に対応)が計画本体の2.1節コードへ未反映のまま厳密比較`>=`で書かれていた問題を、`sharedShortCircuitDurationS + DURATION_COMPARISON_EPSILON_S >= config.shortCircuitDurationLimitS`へ更新し、2.1節・2.3節・4節・4.1節・11節・14.2節DoDへ同期。359フレーム未発火・360フレーム発火・361フレームへの遅延不許容を`advanceDestructionState`実経路でテストする方針を明記し、これが正式Fable Q3「境界1フレーム精度」を満たす数値実装であり新しい物理式・較正値ではないというSuu所見を12節へ記載(Fable補足レビューでの確認対象)。(2) `advanceD03`が必要とする`BATTERY_HEAT_LIMIT`(`src/engine/constants.ts`定義)の値importが、`destructionModes.ts`の現行import(型のみ)に前例がなく、leaf方針との整合が未確認だった問題を、P3-1-Q8として2.1.1-補遺2節へ新設。`constants.ts`が他のいかなるモジュールもimportしない真のleafであることを実コードで確認したうえで、Suu推奨案(a)(leaf規則を「orchestration/step実装への逆依存・循環依存を持たない」と再定義し、constants.tsからの一方向値importを許可)と案(b)(DestructionConfigへ値追加、二重出典のため不利)を提示し、独断で決めずFable確認事項化。0節・9.4節・12節・14節を同期。サブステップ1の既存差分は変更せず保持、production/testは無編集。
- v6追補(2026-08-04、Suu_mot3v6最終照合指摘1点): 14.1節サブステップ2の行が「P3-1-Q7裁定+Suu確認...まで着手しない」のままQ8への言及を欠いていたため、14.3節と表現を揃え「P3-1-Q7・P3-1-Q8双方の裁定+Suu確認(必要なら人間再承認)まで着手しない」へ同期。それ以外の技術内容(Q7の3型移設境界・Q8のconstants.ts一方向値import・DURATION_COMPARISON_EPSILON_S=1e-9・359/360実経路DoD・依存閉包・12節/14.3節ゲート)はSuu_mot3照合で正確と確認済み。
- v7(2026-08-04提出): 正式Fable補足裁定(2026-08-03T16:13、Q7・Q8+D03境界epsilonの確認)を反映。**Q7**(2.1.1-補遺節): 案(a)承認、契約変更に当たらず人間再承認不要と確定。**Q8**(2.1.1-補遺2節): 案(a)承認、leaf規則の意味の確定文言(「destructionModes.tsは、destructionOrchestration.tsおよびstep実装関数本体への逆依存・循環依存を持たない。基礎leafへの一方向値import、および既存の型のみimportは許す」)を記載、人間再承認不要と確定。**leaf不変条件**(「destructionModes.tsの公開シグネチャに現れる全型はdestructionModes.ts所有」)をQ7の付帯条件として新設し、Q7移設完了による成立根拠を明記(2.1.1-補遺節)。**構造テスト**(2.1.1-補遺3節新設): 既存rawColorScanと同型のimport許可リスト検証テストを追加し、Q2(a)・Q7・Q8の裁定を以後テストが守る設計をサブステップ2 DoDへ追加。**epsilonの単一出典申し送り**: `DURATION_COMPARISON_EPSILON_S`をP3-2のD04`stageDurations`・P3-3のD05`brushSparkDurationLimitS`で再発明せず共通化・同一出典利用を検討する旨をP3-1完了報告の申し送り事項として12節・14節へ明記。12節の裁定結果表をQ7・Q8とも「承認・人間再承認不要」へ更新、14節のサブステップ2解禁条件を「Suu_mot3のv7差分確認のみで着手可能」へ更新。次回人間承認時の報告事項一覧へQ7・Q8を含める旨を明記。サブステップ1の既存差分は変更せず保持、production/testは無編集。
- v8(2026-08-04提出): サブステップ2(2026-08-03T16:34通過)・サブステップ3(2026-08-03T16:57解禁、実装完了)後のSuu_mot3コードレビューで新規発見された契約穴P3-1-Q9を反映。`stepMotorWithDestruction`(2.2節)が`config: MotorConfig`/`destructionConfig: DestructionConfig`を`accumulator.replaySnapshot`と独立した引数として受け取るため、`createRunAccumulator`(Q6(a))が保証したはずの「battery.profile不一致は構築不能」という性質が、実際にはstepMotorWithDestruction呼び出し時に別のdestructionConfigを渡すことで素通りできることを、実コード再現例つきで示した(0節・2.1.2節・2.2節・2.2.1節新設)。2.2.1節で問題の背景・再現例・依存閉包rg(定義1箇所+テスト呼び出し4箇所、production呼び出しなし)・3案の完全シグネチャ(案(a)`destructionConfig`のみ削除/案(b)`config`・`destructionConfig`双方を削除しaccumulator.replaySnapshotを唯一の出典とする(Suu推奨、v12 §1.4のRunSnapshot不変設計・§3.2の実効config合成規約と整合)/案(c)runtime一致検証(非推奨、Q6(a)が退けたfail-fastパターン))を提示。9.4節へ依存閉包rg結果を統合、12節の裁定結果表へQ9行(裁定待ち)を追加、14.1節のサブステップ3を「実装済みだが凍結、Q9裁定待ち」・サブステップ4を「Q9裁定+サブステップ3修正完了まで着手しない」へ更新、14.2節DoDへQ9裁定確定後の追加検証項目を追加、14.3節へサブステップ3の凍結状態を明記。Fableへの確認事項として、3案の選択に加え、案(b)採用時の`MotorConfig`引数削除がスコープ拡大に当たるか、P3-2/P3-4のvehicle/track版wrapper契約への波及、人間再承認要否のいずれも独断で判断せず含めるよう指定した(Suu指定)。サブステップ1・2の既存差分は変更せず保持、サブステップ3の既存差分(Q9の欠陥を含む)もそのまま保持し追加編集しない。**v8はFable補足裁定の中継と入れ違いで提出され、Suu_mot3の照合対象外(未裁定版)として扱われた。次版はv9として改訂し、v8を確定版へ上書き扱いにしない(Suu_mot3指定)。**
- v9(2026-08-04提出): 正式Fable補足裁定(2026-08-03T17:22、P3-1-Q9確定)を反映。**Q9-1**: 案(b)確定。`stepMotorWithDestruction`から`config`・`destructionConfig`両引数を削除し`accumulator.replaySnapshot`を唯一の出典とする(理由: 案(a)はMotorConfig側の同種の穴を残す、案(c)はQ6(a)が退けたfail-fastパターンで劣る。「Q9の本質は引数の数ではなく同じ走行契約を複数経路から入力でき静かな不一致を作れることであり、その定義から案(b)が一意に導かれる」というFable原文の問題定義を採用)。**Q9-2**: Phase 3 wrapper共通不変条件(「走行開始時に確定する構成情報はRunSnapshotを唯一の出典とし、wrapperの独立引数として再入力させない」)を新設し2.2.2節へ記載、destructionConfig/motorConfig(実効config合成・buildMotorOnlyFrameInputのconfig出典一本化込み)/carConfig・track・gearTotalToothCountそれぞれの適用を確定、P3-2/P3-4のvehicle wrapperでの動的入力の扱いもこの枠内で行う旨を明記。**Q9-4**: 人間再承認を要する(v12 §4.4承認済み公開シグネチャの変更、Q6(a)と同じ扱い)ことを確定し、是正実装は再承認後に限定。**Q9-5**: v12本文の物理的無編集を維持しつつ、v9のQ9裁定記録が実装契約として上書きする扱いを承認、あわせて確定裁定の散在(Q4解釈・Q8解釈・Q9シグネチャ等)を防ぐため`docs/phase3-plan-v12-amendments.md`(追記専用台帳)を新設(本ファイルとは別ファイル、統合full-text化のPhase 3中の軽量代替)。是正の範囲(両引数削除+wrapper内部snapshot参照化+呼び出し元4箇所の機械的追従に限定)・DoDテスト2件(リプレイ等価テスト・共通不変条件JSDoc+P3-2/P3-4への同型テスト義務化)・P3-4配線計画への申し送り(run途中のconfig差し替え概念の廃止)をFable指定どおり反映。2.2.1節を「未裁定」から確定内容へ全面書き換え、2.2.2節(共通不変条件)を新設、0節・2.1.2節・2.2節冒頭・9.4節・12節・14.1節・14.2節・14.3節から「未裁定」「裁定待ち」「必要なら人間再承認」「Fableへ提出予定」等の暫定文言を除去し確定状態の記述へ更新(改訂履歴内の過去バージョンの記述はそのまま保持)。v12本体は無編集、production/testは無編集(サブステップ1〜3の既存差分のみ保持)。**v9はSuu_mot3照合で必須修正7点を受け、v10として改訂した(下記)。**
- v10(2026-08-04提出): Suu_mot3のv9+`docs/phase3-plan-v12-amendments.md`照合(必須修正7点)を反映。(1) 台帳の裁定番号をすべて名前空間付き(`P3-1-Q<n>`等)へ変更(台帳側の改訂、本ファイルには直接の該当箇所なし)。(2) 台帳がP3-1裁定のみで不完全だった問題を解消——`docs/phase3-p3-0-plan.md` §11を監査し、人間再承認済みでv12を追加・変更したP3-0-Q1(invalidRunSequence高水位穴意味論)・P3-0-Q2(DestructionConfig production配線P3-4延期)・P3-0-Q3(RunApplicationEnvelope.notebookRecord+3腕union+全腕自動trim)・P3-0-Q4a(battery消費後loadout null化)・P3-0-Q4b(consumedEquipmentIds)・P3-0-Q5(ValidateDestructionConfigResult.invalidFields)・P3-0-Q6(deriveDegradationDiffs段階実装+発行可能event不変条件=「正式Fable P3-0-Q6」の原典)・P3-0-Q7(RotorAssemblyState sourceWireMaterialId、v12本文に既に反映済みの遡及承認として性質の違いを明記)+P3-0-P1(lease未取得時の全saveStore書込みaction共通ブロック)の計9件を台帳へ新規収録(台帳側の改訂)。(3) 台帳P3-1-Q4エントリのtypo「endReault」→「endReason」訂正(台帳側)。(4) 台帳P3-1-Q6エントリへ、シグネチャ変更自体は実装・検証済みだがサブステップ3全体はP3-1-Q9是正待ちである旨の区別を追記(台帳側)。(5) 本ファイル9.4節のQ9箇所に残っていた「シグネチャが変更される場合」「案(b)を採る場合」という仮定形の文言を、案(b)確定済みの断定形へ更新。(6) 本ファイル12節末尾の「再提出要否」がQ7/Q8時点(サブステップ2着手)の旧文のままだった問題を、P3-1-Q9裁定後の正しい進行順序(Fable再提出不要→Suu v10確認→人間Q9再承認→是正実装→サブステップ4)へ置換。(7) 2.2.1節のリプレイ等価テスト骨子にあった未定義未使用の`const config = motorConfig`を削除し、`rng`省略(`step()`が`Math.random`への非決定的フォールバックを持つため、意図——snapshotが唯一の入力であること——を偶然のfixture依存にしてしまう)を避け、既存のテスト用決定的PRNG`mulberry32`(`src/engine/__tests__/prng.ts`)を各runで独立に同一seedから生成して`stepMotorWithDestruction`へ渡す形へ修正。(8) 12節見出しへP3-1-Q9補足裁定日(2026-08-03T17:22)を追加。改訂履歴内の過去の「裁定待ち」等の記述は維持。v12本体・src(production/test)は無編集。**v10はSuu_mot3の最終照合で6点の追補を受け、v11として改訂した(下記)。**
- v11(2026-08-04提出): Suu_mot3のv10+台帳最終照合(必須追補6点、「方向性は通過」との評価つき)を反映。いずれもdocs-onlyの実装証跡・テスト精度の訂正であり契約変更ではない。(1) `docs/phase3-plan-v12-amendments.md`改訂履歴末尾の件数誤記「計8件」を実際のエントリ数「計9件」(Q4a・Q4bを別エントリとして数える)へ訂正(台帳側)。(2) 台帳P3-0-Q1の実装ステップから不確かな「P3-0サブステップ1」表記を削除し「P3-0で`src/store/runOutcomeApplication.ts`へ実装済み・commit済み」という事実ベースの記載へ変更(台帳側)。(3) 台帳P3-0-Q3の実装ステップを、型定義(`runOutcomeApplication.ts`)・実際の追記/trim処理(`saveStore.ts`の`appendNotebookRecord`)・薄い委譲ビュー(`notebookStore.ts`)・UI(`ExperimentNotebook.tsx`、brabit_mot3所有)にまたがる実装であることを明記し単一ファイル/サブステップへの縮約を解消(台帳側)。(4) 台帳P3-0-Q4aの実装ステップを、契約型のnullable化(`runOutcomeApplication.ts`)と実際の自動null化適用ロジック(`saveStore.ts`の`commitApplyResult`)に分離して実ファイル名で記載(台帳側)。(5) 台帳P3-0-Q4bの実装ステップからサブステップ番号を削除(台帳側)。(6) 台帳P3-0-P1の実装ステップを全面訂正——「`runOutcomeApplication.ts`に共通ゲート機構がある」という不正確な記載を削除し、実際の適用主体である`saveStore.ts`の`readGatedFreshState`/`readFreshForApply`(11箇所の書き込みactionから共通に呼び出されることを実コードで確認)を正しく記載(台帳側)。(7) 台帳P3-0-Q2の進捗を「P3-1 fixtureベースのみ、実装済み」から「fixture方針で進行中、production配線なし、P3-1全体は未完了(サブステップ4未着手のため)」へ訂正(台帳側)。(8) 台帳P3-1-Q4の進捗を「fixtureベース統合テストで代替検証、実装済み」から「P3-1サブステップ4で実装予定(未着手)」へ訂正(台帳側)。(9) 本ファイル2.2.1節のリプレイ等価テスト骨子を非自明な破壊経路へ固定——snapshotの`motorConfig`を`goodMotorConfig({ slitWidthMm: 0 })`(持続短絡)へ設定し(従来は`destructionConfig`のみ短絡向けで`motorConfig`が通常値のままD03へ実際には到達せず空走行同士の自明一致で通り得た)、比較前に`runA`側でD03イベントが実在し`termination.endReason==='destructionTerminal'`であることをassertしてから完全一致比較を行う形へ修正、importを「相対パスは実配置に合わせて調整」という曖昧な注記から`./prng`への直接importへ変更、rng seedをリテラル`1`から`mulberry32(snapshot.seed)`へ変更しRunSnapshot唯一出典の意図をコードでも固定、14.2節DoDへ「D03の非空event+destructionTerminal成立後に完全一致を比較」を明記。(10) 12節見出し・§2.1.2・§14の「v10確認」「v10照合」という現在の次アクション表現を「v11確認」「v11照合」へ更新(改訂履歴内の過去バージョンの記述はそのまま保持)。v12本体・src(production/test)は無編集。
