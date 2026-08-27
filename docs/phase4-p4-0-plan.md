# Phase 4 P4-0詳細計画 v3（実装解禁）: 15分の面白さを証明する垂直スライス

作成: Suu_mot3（2026-08-25）

基点: `develop` / `4fefebe09f3407910091327d21d08075d0cf9084` / tag `p3-4-complete`

上位計画: `docs/phase4-plan.md`

UI計画: `docs/phase4-p4-0-ui-plan.md`

状態: **G0〜G7完了。2026-08-28人間試遊で半自動治具を採用し、技術受入・表示是正後の代表経路・視覚再確認を通過した。正式commit構成を作成中で、tag・pushは未承認。**

## 1. この小工程で答える問い

P4-0で答える問いは一つだけである。

> 30〜60秒で巻いた結果を走らせ、事実から仮説を立て、一箇所だけ直し、数値を見る前に改善を感じる反復は、15分遊びたいゲームになっているか。

精密な巻線シミュレータを完成させる工程ではない。人間試遊の5条件を満たさない場合は入力方式または体験順を直し、物理軸・計測器・保存項目を増やして補わない。

## 2. 正典と優先順位

1. `docs/spec.md`をV3の唯一の正とする。特に§1.1、§1.2、§8.9、§9、§12のP4-0行を使う。
2. 画面・描画・音は`docs/art-spec.md`を正とする。
3. Phase 3の保存・走行・破壊契約は`docs/phase3-plan-v12-amendments.md`と`docs/phase3-p3-4-implementation-report.md`を継承する。
4. `docs/handoff.md`の旧円ドラッグ記述と`docs/spec.md`が食い違う箇所はspecを優先する。

## 3. 範囲

### 3.1 含む

- 同じ巻線記録へ出力する3入力案の最小比較試作
- 巻線記録の型、検証、正規化、複製、一区間置換
- 巻線記録から既存物理入力へ渡す最小2軸の集計純関数
- 固定素材、固定車体、固定コース、固定seed、固定ライバル1台のセッション限定走行
- 同期ゴースト、区間差、巻線クローズアップ、二段リザルト
- セッション限定の型紙・愛称・試作銘板
- 人間試遊票と入力方式の採否判定

### 3.2 含まない

- `src/engine/`の変更
- 保存schema、在庫、WearState、図鑑、実験ノート、courseProgressへの書込み
- Phase 5のCPU、周回、ボス、賞金、解禁、経済較正
- P4-1の分布/漏れ磁束、線長/抵抗、占積、被膜損傷、D10、整流子、台座、素材消費付き型紙
- 進角、電機子インダクタンス、アルニコ逆磁界減磁
- 新しい色、フォント、内部解像度、外部asset、依存package、ブラウザ自動化基盤
- V2 `CourseMode`のretro置換とlegacy courseRun actionの削除

## 4. 採用する境界

### 4.1 セッション限定の専用画面

P4-0は既存`assembly`/`course`へ暫定仕様を混ぜず、Appのlocal表示状態から開く専用画面として`src/p40/`へ隔離する。`gameStore.mode`へ一時的な腕を追加しない。セッション状態は専用画面の`useReducer`で保持し、Zustandの新規storeは作らない。

これにより次を機械的に守る。

- `saveStore.ts`と`SCHEMA_VERSION`を変更しない。
- inventoryの消費・劣化・報酬を発生させない。
- Phase 3の`beginProductionRun`/原子的outcome反映を迂回した「別のproduction入口」を作らない。P4-0走行は明示的に試作専用であり、キャリア記録ではない。
- P4-0を削除しても既存ゲームの保存と走行が変わらない。

### 4.2 同じ物理、別のin-memoryオーケストレーション

走行はP3-4 G5の較正sweepでも実証済みのstore-free構成を使う。具体的には既存素材写像で固定構成を1回得た後、`TRACK_BY_ID.get('straight-10m')`の検証済みブランド型、`createInitialVehicleState`、`stepTrackRun`、`createRunRng`を使う。生の`TrackDefinition`は渡さない。物理式と乱数器を複製せず、固定ライバルもプレイヤーも同じ関数・同じdt=`1/120 s`で計算する。

`stepTrackRun`のRNG既定値経路は使わない。`src/p40/sessionRunner.ts`にRNG引数を必須とするlocal `stepPhase4Track` wrapperを置き、player/rivalの各runに`createRunRng(seed)`で生成したRNGを明示的に渡す。P4-0の他ファイルは`stepTrackRun`を直接呼ばず、`Math.random`も使わない。`src/p40/__tests__/boundaryAudit.test.ts`でこの呼出し境界を機械的に固定する（P4-C2）。

runnerは`state.status`が`finished/stalled/derailed/overheated`のいずれかになった時点で閉じる。最大step数も固定し、超過時は候補不成立として停止する。`beginProductionRun`、`startCourseRun`、`stepCourseRun`、破壊wrapper、`performApplyRunOutcome`を呼ばないため、inventory、WearState、図鑑、報酬、実験ノート、runSequence、courseProgressは変化せず、A3原子境界へ「保存しない分岐」を追加しない。

この構成は§11の承認済み案Aに従う。`captureRunSnapshot/createRunAccumulator/stepTrackRunWithDestruction`等のD01デモ用依存閉包はP4-0へ追加しない。

## 5. 巻線記録契約

### 5.1 型

```ts
export type WindingArm = 'left' | 'right' | 'straddle';
export type WindingDirection = 1 | -1;

export interface WindingTurn {
  position: number;  // 0〜1
  arm: WindingArm;
  direction: WindingDirection;
  tension: number;   // 0〜1
}

export type WindingRecord = readonly WindingTurn[];
```

- 0〜150ターン。空記録は入力途中として受理するが走行開始には使えない。2〜9ターンも集計・描画は受理するが走行開始には使えない。既存`coilTurns`受理範囲どおり、走行可能域は10〜150ターンとする。
- `position`と`tension`は`1/256`刻みへ量子化してから記録する。NaN、Infinity、範囲外、非量子化値はvalidatorで拒否する。
- 記録済みturnは不変オブジェクトとして扱い、入力方式・描画・写像が書き換えない。
- prototype側の`dummyWindingRecord.ts`はproduction型の単一出典にしない。型を新規正典へ移し、prototypeはimportへ追随させる。

### 5.2 入力コマンド

3入力案はDOMイベントを直接記録せず、次の意味コマンドへ正規化して共通reducerへ渡す。

```ts
type WindingCommand =
  | { kind: 'setGuide'; position: number; arm: WindingArm }
  | { kind: 'setTension'; tension: number }
  | { kind: 'setDirection'; direction: WindingDirection }
  | { kind: 'advanceTurn' }
  | { kind: 'replaceRange'; start: number; deleteCount: number; turns: WindingRecord };
```

- `advanceTurn`時点のguide/tension/directionを1ターンとして確定する。
- 半自動治具の進行は描画frame数でなく固定の記録tickへ累積時間を割り当てる。遅延frameでは必要tick数だけ追いつくが、1frameに依存した値は記録しない。
- キーボード、pointer、touchは同じ意味コマンドを使う。
- テストで同じコマンド列からJSON同値の記録が得られることを固定する。

### 5.3 型紙と部分修正

- 型紙複製は`structuredClone`相当の値コピーであり、数値補間・平滑化・自動改善をしない。
- 部分修正は半開区間`[start, start + deleteCount)`だけを置換する。
- 範囲外のindex、150ターン超過、不正turnはResultで拒否し、元記録を変更しない。
- テストでは置換区間外がJSON上同一であることを固定する。

## 6. P4-0の最小物理写像

### 6.1 集計結果

```ts
interface P4WindingAggregate {
  woundTurnCount: number;       // 表示用。記録長
  effectiveTurnsRatio: number; // engineへ渡す磁気的な方向一貫性
  leftTurnCount: number;
  rightTurnCount: number;
  straddleTurnCount: number;
  balanceErrorRatio: number;   // 0〜1
  axisOffsetMm: number;        // 候補係数確定後
}
```

### 6.2 実在巻数と方向一貫性

集計純関数は0〜150ターンの全域を定義域とし、空記録では`coilTurns=0`、`effectiveTurnsRatio=1`を返す。1ターン以上では`coilTurns = record.length`、`effectiveTurnsRatio = abs(sum(turn.direction)) / record.length`とする。したがって1ターンは方向にかかわらずratio=1となる。逆向き区間があっても導線の実在量、抵抗、慣性は減らさず、磁気トルクと逆起電力だけを既存ratioで減らす。「巻数カウンタは増えたが磁気的な実効巻数は少ない」という実物現象を維持する（P4-C1）。

- `effectiveTurnsRatio`はP4-0のstore-free MotorConfigにだけ初期値として設定する。P3-3のmaterial base validatorとproduction保存経路は通らない。
- 記録長が既存`coilTurns`の受理範囲10〜150を外れる場合は走行不可として事実を表示し、黙ってclampしない。
- 0、1、2〜9ターンの集計境界をテストし、NaN/InfinityをUI・runnerへ流さない。
- 全ターンが一方向なら向きが`1`でも`-1`でも同じ絶対巻数になる。P4-0は回転極性を新設しない。
- P4-1でproductionへ統合する前に、巻線由来の初期`effectiveTurnsRatio`とD01走行中漸減ratioをどう積算するかを正式裁定する。P4-0の式をそのままmaterial base契約へ持ち込まない。

### 6.3 左右バランス

`left/right/straddle`の数から0〜1の`balanceErrorRatio`を純関数で得て、`axisOffsetMm = balanceErrorRatio × K_axis`として既存物理へ渡す。型のJSDocには`balanceErrorRatio`が表示・テスト用の生集計、`axisOffsetMm`だけがP4-0物理入力であることを明記する。

- `straddle`は左右へ0.5ずつ配分する。
- `K_axis`は未確定。G3では先に既存`axisOffsetMm`の0〜3 mm範囲を有限sweepして体感可能域を確認し、その後で記録の到達可能な`balanceErrorRatio`へ逆算する。係数を先に置かない。production配線前にexact値と受入バンドルを人間へ提示する。
- G3のexact受入バンドルには、`position`/`tension`を`1/256`へ量子化した後に到達可能な離散`balanceErrorRatio`と`axisOffsetMm`候補の対応を含める。連続値として存在しない候補を提示しない。
- 新しい振動式は作らない。既存`axisOffsetMm`と既存ω²振動則だけを使う。

### 6.4 P4-1へ送る値

`position`と`tension`はP4-0でも記録・描画・差分表示へ使うが、物理結果へは入れない。分布、渡り線、線長、占積、被膜損傷、張力由来D01/D10は、物理的な単一出典と較正計画を作るP4-1へ送る。

UIは未接続値を「物理へ反映済み」と説明してはならない。「張力」「位置」の生記録は表示できるが、良否・原因を断定しない。

## 7. 固定シナリオ

### 7.1 不変条件

- コース: 既存`straight-10m`
- dt: `1/120 s`
- seed: 1個の固定整数（G3で候補提示）
- 車体・電池・磁石・ブラシ・ギヤ・軸受: 固定、在庫と無関係
- rival: 固定巻線記録から集計した固定MotorConfigを同じ物理で走らせる1台
- player: 入力した巻線記録以外はrivalと同条件
- 走行中の相手補正、勝敗スクリプト、ゴムバンド、結果の書換え: 0件

### 7.2 初走と二走目

初走用のガイド型紙には一つの観察可能な左右偏り区間を含める。ただし画面は「ここが悪い」「右へ直せ」と答えを出さない。プレイヤーは同期ゴースト、区間差、振動、巻線クローズアップから仮説を立てる。

二走目は型紙全体を巻き直さず、一つの連続区間だけを置換する。正しい修正を強制せず、結果も偽らない。意図した方向へ変わったかを人間試遊で判定する。

### 7.3 僅差の決め方

固定player候補記録×固定rival候補記録×固定seedの有限表だけをread-onlyで走らせ、次を満たす候補を提示する。

- 初走: 完走し、rivalに僅差で負ける。
- 二走目: 一区間置換以外は同一で、初走より改善する。
- 改善候補: rivalへ僅差で勝てる。
- 両走とも20〜30秒を目標とする。既存実測上`straight-10m`は21.5〜24.3秒帯の候補がある。
- exactのタイム差、step数、`K_axis`、seed、固定記録hashをproduction反映前に人間へ提示する。

この有限表で候補が得られなければ停止する。新しい物理や相手補正へ進まない。

## 8. 走行traceと比較事実

- 0.05秒間隔で`t/positionM/velocityMps/rpm/currentA`を最大32秒記録する。既存`TestRunSample`相当の項目に限定する。
- rival traceは走行開始前に同じ固定関数で最後まで生成し、player走行中に同じ時刻位置を描く。
- 区間は固定4区間（各2.5 m）。各区間の通過時刻差だけを事実として表示する。
- クローズアップは初走記録と二走目記録の変更区間を同じ縮尺で並べる。良否スコアは出さない。
- ゴーストとplayerの時間原点・dt・seedをテストで固定し、描画都合でtraceを補正しない。
- 各runは`state.status`を唯一の物理終端事実とし、terminal後は追加stepを行わない。最大step超過は完走扱いにせず候補不成立とする。

## 9. ゲート

### G0: 文書・境界凍結

- 本書、UI計画、上位計画を人間承認へ出す。
- engine計画をarbiterがレビューする。
- D01扱い、専用画面、最小2軸、有限sweep手順を確定する。
- 計画一式・D01推奨案A・arbiter条件付き承認全文の人間承認とP4-C1〜P4-C3反映後、Suu_mot3が三文書のhash・差分・境界を照合する。arbiter再提出は不要とする。
- 上記照合前はコードへ進まない。照合通過後はG1へ進める。

### G1: 巻線記録と決定論

- 記録型、validator、量子化、共通command reducer、複製、部分置換を実装する。
- prototype描画の型importを正典型へ追随させる。
- 3入力UI・走行・物理写像にはまだ進まない。
- 自動条件: validator境界、0/1/2〜9ターンの記録受理と走行拒否、同一command列同値、150上限、入力非破壊、部分修正局所性。P4-C1の有限集計は物理写像を実装するG3で固定する。

### G2: 3入力案の比較試作

- 3案を共通reducerへ接続する。
- 3案共通の巻線描画と30〜60秒計測を接続する。
- この時点では固定記録の描画比較まで。走行結果へ接続しない。
- **人間中間ゲート**: 3案を比較し、P4-0後半で磨く1案を選ぶ。選外案は機能追加せず比較証跡だけ残す。

### G3: 最小写像とread-only有限sweep

- 実在巻数・方向一貫性ratio・左右バランスの純関数とテストを実装する。
- 固定scenario runnerを使い、候補表を生成する。
- production UIへ値を接続する前に、exact `K_axis`、seed、記録hash、初走/二走/rival結果、量子化後に到達可能な離散`balanceErrorRatio`との対応を人間へ提示する。
- 候補なし、D01/D03等の意図しない発火、30秒超過、見分け不能なら停止する。

### G4: セッション限定の垂直配線

- 選定入力→記録→写像→player走行→trace→一箇所修正→再走を専用画面で接続する。
- save/inventory/notebook/codex/courseProgressに差分がないことを構造テストで固定する。
- 既存CourseModeは変更しない。

### G5: ゲーム演出

- 同期ゴースト、区間差、クローズアップ、二段リザルト、記録ジングル、セッション銘板を接続する。
- 祝福前に分析を出さず、第二段でも原因を断定しない。
- reduced motion、音オフ、キーボード、touch、縦横画面を確認する。
- **改訂（2026-08-26人間承認、案B）**: 記録ジングルを含むP4-0の音4種はPhase 6へ繰り越す。P4-0では音関連コード・呼出し口・`AudioContext`/`SampleBank`/SE busの変更を一切行わない。根拠と経緯はUI計画§7.3。G5のDoDから音を外し、G7は視覚だけで判定する。

### G6: 自動検証

- 対象テスト、全test、build、lint、型検査を実行する。
- 固定hash・固定seed再現、全走行同一物理関数、engine差分0、保存契約差分0を確認する。
- `boundaryAudit.test.ts`で、RNG必須wrapper外の`stepTrackRun`直接呼出し、`Math.random`、P4-C3禁止import/呼出しがすべて0件であることを確認する。
- 新しい数値回帰の再基準化は別途人間承認なしに行わない。

### G7: 人間試遊と採否

- 3入力案比較と15分垂直スライスを試遊する。
- 5条件を一つずつPASS/FAIL/未確認で記録する。
- 入力方式を採用、修正再試遊、P4-0不通過のいずれかに判定する。
- 通過後にだけ`spec.md`/`art-spec.md`の§9.1入力装置割当を採用方式へ同期する計画を提示する。巻線schema、D10、被膜、整流子、進角は同期対象に先取りしない。

#### G7完了記録（2026-08-28）

- 3入力案の比較と人間試遊を経て、半自動治具を採用した。
- 代表経路（初走敗北→第2区間だけ修正→二走勝利）および、巻線の見た目と改善方向を読み取れる視覚再確認を通過した。
- turn確定音・区間選択音・勝利ジングル・敗北SEの4種はPhase 6へ繰り越し、P4-0では音関連コードを追加していない。
- 第2区間外の表示を全30ターン−選択7ターン=`23ターン`へ直し、回帰確認を完了した。
- 正式化前の最終受入では97ファイル・2475テストに加え、build・lint・型検査・palette検査・固定sweepが成功した。
- production物理・較正・schema・保存系は拡張していない。P4-1の契約・数値・依存閉包は次工程の詳細計画で扱う。

## 10. 依存閉包と所有

以下は現時点のexpected setであり、G0で`rg`により再確認する。対象外ファイルが必要になった場合は停止し、理由と追加diffを提示する。

### alice所有

- `src/materials/windingRecord.ts`（新規）
- `src/materials/__tests__/windingRecord.test.ts`（新規）
- `src/p40/scenario.ts`（新規。固定記録・設定・seed。exact値はG3承認後）
- `src/p40/sessionRunner.ts`（新規。既存engine/materials公開純関数を並べるstore-free runner）
- `src/p40/__tests__/sessionRunner.test.ts`（新規）
- `src/p40/__tests__/boundaryAudit.test.ts`（新規。P4-C2/P4-C3のexpected closure）
- `scripts/phase4PrototypeSweep.ts`（新規、有限候補探索専用）
- `tsconfig.phase4-sweep.json`（新規、sweep専用型検査）
- `package.json`（`sweep:phase4`と`typecheck:phase4-sweep`のみ追加）

### brabit所有

- `src/App.tsx`（local表示状態による専用画面入口と表示）
- `src/p40/Phase4PrototypeScreen.tsx`（新規）
- `src/p40/sessionReducer.ts`（新規、純reducer）
- `src/p40/inputs/`（新規、3入力案と共通control）
- `src/p40/Phase4PrototypeRaceCanvas.tsx`（新規）
- `src/p40/Phase4PrototypeResult.tsx`（新規）
- `src/retro/winding/`（新規、Phase 1幾何・描画のproduction移設）
- `src/retro/race/`（新規、Phase 1俯瞰斜め3/4試作からP4-0の1コース・2台表示だけをproduction移設）
- 上記pure helperの`__tests__`（新規）
- `src/components/useRetroCanvasFrame.ts`（既存hookをそのまま使用。変更不要を原則）
- `src/retro/audio/`（既存音源・mix予算を使用。変更が必要ならG5前にexact fileを再提示）
- `src/retro-proto/resolutionHarness/dummyWindingRecord.ts`（正典`WindingTurn`をtype import）
- `src/retro-proto/resolutionHarness/ResolutionHarness.tsx`（production描画helper importへ追随）
- `src/retro-proto/resolutionHarness/__tests__/windingTraceGeometry.test.ts`（production幾何helper importへ追随）
- `src/retro-proto/resolutionHarness/windingTraceGeometry.ts`（移設後に削除）
- `src/retro-proto/resolutionHarness/drawWindingTrace.ts`（移設後に削除）

### 明示的な差分0

- `src/engine/**`
- `src/store/gameStore.ts`
- `src/store/saveStore.ts`
- `src/store/runOutcomeApplication.ts`
- `src/materials/materialMapping.ts`
- `src/data/tracks.ts`
- `src/modes/CourseMode.tsx`
- `src/render/RaceCanvas.tsx`
- `src/render/CourseRaceCanvas.tsx`
- `src/components/ExperimentNotebook.tsx`
- `src/components/EncyclopediaScreen.tsx`
- package dependency / lockfile

### P4-C3の機械的な隔離

- `src/p40/**`と`src/materials/windingRecord.ts`は`recipeKey.ts`/`recipeCode.ts`をimportしない。
- `src/p40/sessionRunner.ts`は`computeRecipeKey`、`encodeRecipe`、`validateMaterialComposedBase`、`beginProductionRun`、`performApplyRunOutcome`をimportも呼出しもしない。
- `boundaryAudit.test.ts`は上記の禁止対象を文字列検索だけでなく、対象expected closureを固定した構造テストとして保証する。禁止境界を満たすための新規公開APIは作らない。

## 11. D01裁定

現行D01の原因は`varnished=false`かつ高回転であり、張力は入力に存在しない。P4-0で「攻めた張力からD01」を成立させるには新しい崩壊耐性契約または不正確な読み替えが必要になる。

推奨案A:

- 任意三走目のD01をP4-0合否必須から外す。
- P4-1の最初の裁定で、張力→崩壊耐性を物理的に定義するとともに、巻線由来の初期`effectiveTurnsRatio`とD01走行中ratioの積算契約をP3-3-Q5・Q12・Q14・P-Q10-A5へ照合し、既存D01へ正しく接続する。
- P4-0は二走目勝利と「もう一度試したい」までで面白さを判定する。

不採用の代替案B（判断記録）:

- 既存`varnished=false`×高回転の固定構成でD01を見せる。
- UIは「無ワニス×高回転」と表示し、張力原因とは言わない。
- P4-0の巻線技能検証とは独立した既存破壊デモとして扱う。

不採用案:

- 高張力を`varnished=false`へ変換する。
- P4-0だけのD01閾値、崩壊ゲージ、破壊状態を新設する。
- D01を起こすため既存較正値を変更する。

## 12. テストとDoD

### 自動で保証する

- 記録契約、量子化、validator、決定論
- 0ターンは`effectiveTurnsRatio=1`、1ターンはratio=1、2〜9ターンは有限集計かつ走行拒否となり、NaN/Infinityが流出しない
- 3入力案が同じcommand reducerへ収束する構造
- 型紙コピー同値と部分修正局所性
- 写像純関数の0恒等性、実在`coilTurns`不変、逆巻きの磁気打消し、左右対称、左右反転対称、有限性
- 同一seed/record/configのtrace完全一致
- rivalとplayerが同じ既存物理関数を使う構造
- rivalとplayerがRNG引数必須のlocal wrapperだけを通り、`createRunRng(seed)`以外の乱数経路を使わない構造
- `src/p40/**`と`windingRecord.ts`がrecipe/save/production書込み境界へ依存しない構造
- session resetで全試作stateが消える
- 保存、在庫、図鑑、実験ノート、courseProgressが変わらない
- palette raw color scan、480×270、既存3ch音量予算（2026-08-26の案B確定により、P4-0での確認内容は「音関連コード・呼出し口・音響基盤の追加が0件であること」に限る）

### 人間だけが保証する

1. 数値より前に改善を感じる。
2. 初走後に自分の仮説を言える。
3. 一箇所修正で意図した方向へ変えられる。
4. 勝利後に促されずもう一度試したくなる。
5. 3回巻いて苦役でない。

### 共通コマンド

```bash
npm run test
npm run build
npm run lint
npx tsc -b --pretty false
```

## 13. 過剰設計監査

各ゲート末にSuu_mot3が次を確認する。

- 追加した抽象がP4-0の1台・1コース・1ライバルに必要か。
- プレイヤーの仮説を助ける代わりに答えを表示していないか。
- 面白さ不足を物理軸・分析表・保存項目の追加で埋めていないか。
- 3案比較が3本の完成品開発へ膨らんでいないか。
- Phase 5/P4-1の契約を先取りしていないか。
- exact step値をゲームバランス目標として扱っていないか。

一つでも逸脱した場合は次ゲートへ進めず、削減案を先に提示する。

## 14. 人間承認済みの実装境界

1. Appのlocal表示状態と`src/p40/`へ隔離するセッション限定専用画面案。
2. `position/tension`を0〜1の`1/256`刻みへ量子化し、3案を共通command reducerへ収束させる記録契約。
3. `coilTurns=記録長`を保ち、方向一貫性`effectiveTurnsRatio`と`axisOffsetMm`の2軸に限定し、位置・張力の物理接続およびD01 ratio積算契約をP4-1へ送る案。
4. 初走/二走/rivalを固定候補の有限sweepで選び、走行中補正を禁止する案。
5. G2で入力方式を中間選定し、選外2案を磨かないゲート順。
6. D01は推奨案Aを採用する。
7. 本書のゲート、依存閉包、停止条件。
8. **（2026-08-26追加承認）P4-0の音は案Bとする。** §7.2相当の4種SE（turn確定・区間選択/確定・勝利ジングル・敗北SE）はPhase 6へ繰り越し、P4-0では音関連の変更を0件とする。G7は視覚のみで判定する。詳細はUI計画§7.3。

上記7項目、P4-C1〜P4-C3、人間確認点・申し送りを含むarbiter正式レビュー判定全文は承認済みである。P4-C1〜P4-C3の文書反映とSuu_mot3照合をもってG0を閉じ、G1から実装する。commit、tag、pushは別途承認まで行わない。
