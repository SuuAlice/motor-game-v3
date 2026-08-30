# Phase 4 P4-1 UI詳細計画 v5（P4-1B W2閉包delta反映）

作成: Suu_mot3（2026-08-28）

基点: `phase4-plan` / `364111f8b3ca6dc15f695fa6b797f8c87d11e864`（P4-1A正式7commit先端）

上位計画: `docs/phase4-p4-1-plan.md`

状態: **P4-1Aは正式7commit（先端`364111f8`）を作成済み。P4-1B UIは2026-08-30にproduction半自動治具・手続き巻線描画・表示枠・人間視認是正・操作パッド内の巻き数常設まで完了し、正式commit先端`ae8f5f4c2031f9ad0197172201556c5d583160a2`へ到達した。スマホ人間視認と105ファイル・2695テスト、build・lint・型検査・禁止差分監査を通過している。次はP4-1Cの実装前詳細化と別途人間承認である。P4-1A/P4-1Bのtag・push・deploy、P4-1C以降、spec/art-spec確定変更、物理・較正、D10、被膜、RunSnapshot 4は未承認であり、承認まで行わない。**

## 1. UIの目的

P4-1のUIは、P4-0で採用した半自動治具を通常の8工程組み立てへ接続し、プレイヤーが数値表を見る前に巻線の出来を読み、P4-1Gの正典部分修正では修正効果も読めるようにする。

成功は「操作量を増やすこと」ではなく、次の循環が成立することで判定する。

```text
線を配る → 絵から偏り・重なり・緩み・張りを読む
          → 走る → 一箇所を直す → 同縮尺の絵で差を見る
```

## 2. 採用する入力と非採用範囲

- productionへ採用するのは半自動治具だけとする。
- 生ドラッグとパターン設計は`src/p40/`の比較証跡として凍結し、productionからimportしない。
- P4-0の画面全体を通常画面へ移植しない。`src/p40/inputs/inputCommands.ts`のうち半自動治具の純粋入力コマンドだけを`src/retro/winding/inputCommands.ts`へ移し、P4-0とproductionが同じ規則をimportする。生ドラッグ・パターン設計専用kernelは移さない。
- `src/p40/`の削除要否はP4-1末に別途判断し、途中で整理目的の削除を行わない。

## 3. productionの画面遷移

現行`AssemblyMode`の8工程を維持し、巻線工程を次の状態へ置き換える。

1. 巻線開始前に線径、並列本数、線材を確定する。被膜材の保存・消費はP4-1Fまで追加しない。
2. 1ターン記録後は、線径と並列本数を変更できない。変更する場合は確認後に現在の巻線記録を破棄する。
3. 半自動治具で位置、腕、方向、張力を連続入力する。
4. productionの`computeMaxTurns(wireGauge, parallelStrands)`を上限の単一出典とする。
5. 完成前にローター図と材料消費の事実を確認する。
6. 完成actionが成功した場合だけ、在庫消費・ローター生成・装備更新を反映する。
7. 失敗時は入力記録を保持し、理由を日本語で示して再試行できる。

巻線UIが`coilTurns`を独立編集することは禁止し、巻数は`WindingRecord`の長さから導出する。画面状態は`lotPending`、`lotFixed`、`winding`、`review`、`failed`の判別unionとし、`failed`でもrecordを保持する。

## 4. 巻線の視覚表現

### 4.1 完成形を読む主表示

採用案W1として、位置ヒストグラムからローター外周の輪郭を生成する。既承認`art-spec.md`の実寸比約3倍を初期値とし、実値と表示強調を混同しない注記を添える。

- 4段の巻線層とターンの前後関係を整数座標で描く。
- 左腕、右腕、中央またぎ、渡り線を形で区別する。
- 密集、空き、交差、突出を輪郭と線の重なりから読めるようにする。
- 新色を追加せず、既存paletteと`docs/art-spec.md`の色演算許可範囲を守る。
- 品質点、正解帯、予測タイム、原因名、推奨修正は重ねない。

### 4.2 修正前後

採用案W2として、修正前と修正後を同一縮尺・同一色規則で切り替える。差分専用色やヒートマップは使わず、形そのものを比較させる。利用者向け切替は、正典の修正前recordが生成されるP4-1Gで接続する。

- 選択区間外は同じ位置に同じ形で残す。
- 修正区間だけを置換し、完成前に前後を切り替えられる。
- P4-1Bでは同一縮尺・同一色規則、区間外stroke不変、`stripRect`・`axisRect`不変の幾何回帰だけを固定し、前後切替UIや比較用stateを追加しない。
- 「装備中record対作業中record」は修正前後と意味が異なるため代替にしない。
- レース画面の巻線クローズアップ拡充はP4-1の必須範囲にせず、通常組み立てで読めることを先に通す。

## 5. 張力の操作とフィードバック

張力はPID調整、速度合わせ、反応時間QTEにしない。半自動治具の独立入力として維持する。

- 数値はraw値を補助表示できるが、緑・黄・赤の正解判定には使わない。
- 線は高張力ほど直線的かつ細く張られ、低張力ほど弛みが見える連続表現とする。
- 治具側は高張力ほどゴム帯が伸びるような物理的負担を連続表示する。
- 被膜損傷が確定した場合は、原因名ではなく擦れ・毛羽立ち・局所変色などの症状だけを表示する。
- 実際の線材破断をP4-1へ入れるかはQ3裁定前に実装しない。
- 音響の呼出し口や新規SEはP4-1で追加せず、Phase 6へ送る。

## 6. 型紙と部分修正

- 型紙は保存済み`WindingRecord`の忠実な値コピーとする。
- 自動平滑化、自動改善、自動張力補正をしない。
- 区間修正は選択区間だけを入力可能にし、区間外を視覚・値の両方で固定する。
- 完成時には通常どおり素材を消費し、新しいローター個体を作る。
- 系譜、工房の棚、銘板、引退機展示はPhase 5へ送る。

## 7. エラー・安全・UX文言

- 在庫不足、上限超過、不正記録、保存失敗は完成前に止め、入力を失わない。
- 戻る、リセット、材料変更で記録を破棄する場合は確認を出す。
- 電池短絡・発熱・工作道具の安全注意は既存規律を維持する。
- UI文言は日本語で、単位を省略しない。
- 「良い巻線」「失敗の原因は○○」のように答えを直接教えない。

## 8. スマホ・キーボード・レイアウト

- 単一指で位置と張力を操作でき、同時二点操作を必須にしない。
- キーボードで位置、張力、始動・停止、方向反転へ到達できる。
- 主要操作のタップ領域は44 px以上を維持する。
- 横長・縦長の両方で巻線画面、巻数、状態、主要ボタンを同時に失わない。
- production必須画面では初回測定や画面再入場時に`fits=false`のまま停止しない。測定再試行は表示状態と分離し、メニュー往復後も同じ結果になることをテストする。
- 色だけで腕、方向、損傷、操作可否を伝えない。
- reduced motionでも記録値・判断材料を失わない。

## 9. 既存ファイルの依存閉包

UI担当の主な変更候補:

- `src/components/assembly/CoilWindingStep.tsx`
- `src/components/assembly/AssemblyReviewStep.tsx`
- `src/components/assembly/StartStep.tsx`
- `src/modes/AssemblyMode.tsx`
- `src/retro/winding/**`

クロスレイヤ境界としてalice担当計画と同期が必要:

- `src/store/gameStore.ts`（完成action、`coilTurns`導出）
- `src/store/saveStore.ts`（schema、validator、migration）
- `src/materials/windingRecord.ts`（共通記録・集計）
- `src/materials/inventoryItem.ts`（ローター個体）

直接`coilTurns`を表示・編集している画面は、`docs/phase4-p4-1-plan.md` §7.4の全一覧をG0で再照合する。fixture追随と公開契約変更を混同しない。

## 10. UIゲート

### U0: 契約と画面状態

- P4-1Aの型、validator、migration、完成actionは人間・arbiter承認と実装・正式受入を完了した。
- 画面状態図、戻る/失敗/再試行、材料固定時点を確定する。

### U1: production記録

- 半自動治具が通常組み立てで同じ4値を決定論的に記録する。
- 選外入力案とP4-0セッション画面をproductionへ持ち込まない。

### U2: 完成形と修正差

- P4-1BではW1輪郭を実装し、数値を見る前の完成形の視認試遊を通す。
- W2前後切替と修正差の視認試遊は、正典の部分修正を実装するP4-1Gで通す。
- 視認できない場合、品質ゲージを足さず描画の形・倍率・配置だけを再検討する。

### U3: 張力症状

- 低張力、高張力、素材許容超過の症状を連続表示する。
- 物理未接続値を接続済みと説明しない。

### U4: 型紙・完成action

- 区間外同値、素材消費、失敗時非破壊、再読込を確認する。

### U5: 人間試遊

- スマホ縦横、PC、キーボードで同じ結果を作れる。
- 3回巻いても苦役でなく、完成形から改善仮説を持てる。

## 11. テストと確認

- pure: 入力コマンド、量子化、描画geometry、同縮尺比較、区間置換。
- component: 完成前無効、上限停止、材料固定、破棄確認、失敗時入力保持。
- structural: productionから生ドラッグ/パターン/P4-0画面のimportが0件。
- visual: 480×270、整数座標、既存palette、3倍強調上限、横長・縦長。
- accessibility: touch、keyboard、focus、44 px、色以外の状態、reduced motion。
- regression: メニュー往復、resize、再入場、初回測定で`fits=false`警告が不安定に再発しない。
- full: `npm run test`、`npm run build`、`npm run lint`、全体型検査、palette検査、`git diff --check`。

## 12. 人間試遊票

1. 完成形だけを見て、偏り・重なり・緩み・張りのうち一つを指摘できる。
2. P4-1Gで修正前後を切り替え、変更した区間を数値なしで見分けられる。
3. 高張力の利益と負担を、線と治具の動きから感じられる。
4. 危険の原因を断定表示されなくても、計測・再走の仮説を持てる。
5. 半自動治具を3回使っても苦役に感じない。
6. スマホ縦横とPCで主要操作を失わない。
7. キーボードだけで一本を完成できる。

## 13. 過剰設計防止と停止条件

- 視認性不足を品質点、ヒートマップ、原因断定で補おうとしたら停止する。
- 張力をPID、ポインタ速度、反応時間QTEへ変え始めたら停止する。
- 新色、font、asset、依存package、汎用描画基盤が必要になったら停止する。
- 生ドラッグ・パターン設計の修理またはproduction化を始めたら停止する。
- レース画面、Phase 5の棚・系譜・銘板を先取りし始めたら停止する。
- UIが物理式、D10発火、素材消費を独自判定し始めたら停止する。
- Q3の破断、Q5の原子境界、save/recipe/snapshot版が未裁定のまま画面を実装し始めたら停止する。

## 14. 現在の未確定事項

- 実線材破断を採るか、連続損傷だけに留めるか。
- 型紙の保存位置、上限、削除時の扱い。
- 被膜損傷の症状表現はD10契約と同時に`docs/art-spec.md`へ確定追記する。

これらは推測で確定せず、担当報告・arbiter裁定・人間承認を経る。

## 15. P4-1B UI exact delta（2026-08-30人間事前承認）

### 15.1 状態・素材固定・失敗表示

```ts
type WindingPhase =
  | { kind: 'lotPending' }
  | { kind: 'lotFixed'; lot: WindingLot }
  | { kind: 'winding'; lot: WindingLot; record: WindingRecord }
  | { kind: 'review'; lot: WindingLot; record: WindingRecord }
  | { kind: 'failed'; lot: WindingLot; record: WindingRecord; failure: CompleteRotorAssemblyFailure };
```

- `WindingLot`は線材ID、線径、並列本数だけを持つ。0ターンでは変更自由、1ターン以上では確認後にrecord全体を破棄する。clamp・部分切り詰めはしない。
- 完成は`completeRotorAssemblyAction`だけへ渡す。成功時だけ次工程へ進み、失敗時はrecordを保持する。`finishAssembly`は別の走行開始操作のまま変更しない。
- 失敗文言は次で固定する。
  - 巻線の記録が壊れています
  - 巻き数がNターンです（M〜Kターンで完成できます）
  - この線径では最大Nターンまでです
  - 線材が足りません（必要Nメートル / 残りMメートル）
  - 選んだ線材が見つかりません
  - ローターの採番が重複しました
  - 保存できませんでした

### 15.2 半自動治具の共有範囲

production共通位置へ移すのは`applyWindingCommand`、`applyWindingCommands`、`INITIAL_WINDING_INPUT_STATE`、`WindingInputState`、`resolveGuideFromX`、`resolvePadInput`、`resolveJigKeyCommand`、`SEMI_AUTO_TICK_MS`、`advanceTicks`と、その直接依存support contract（`WindingCommand`、`WindingInputProps`、`PadPoint`、`WindingCurrentValues`、`KEY_STEP`、`TickState`、`INITIAL_TICK_STATE`）だけとする。生ドラッグ・パターン設計のkernelは`src/p40`へ残す。re-export shimは置かず、`SemiAutoJigInput.tsx`、`RawDragInput.tsx`、`PatternInput.tsx`、`Phase4PrototypeScreen.tsx`、`scenario.ts`、`inputCommands.test.ts`、旧`inputCommands.ts`のimportを明示更新する。productionから`src/p40/**`をimportせず、P4-0側が共有層をimportする。既存の同一コマンド列・tick決定論assertは変更しない。

### 15.3 視覚・操作・fits

- W1は既存palette・整数座標・約3倍の外形包絡線を追加する。中央またぎは軸を横切る形で示す。
- 張力は既存の線の開きだけを使い、第二の幾何・色・品質点を追加しない。
- P4-1BではW2の同一縮尺・同一色・区間外stroke・`stripRect`・`axisRect`不変だけを幾何回帰で固定する。利用者向け前後切替はP4-1Gへ延期し、差分色・ヒートマップや比較用stateを追加しない。
- `useRetroCanvasFrame`は未測定と実測`fits=false`を区別する最小変更だけを許可し、衝突するP4-0構造assertを同一deltaで更新する。
- touch、keyboard、44 px、横縦、reduced motion、色以外の二重符号化を既存規律のまま回帰固定する。

### 15.4 RecipePanelとlegacy

- 装備中ローターのrecordはloadoutとinventoryを突き合わせる純粋selector/helperを単一出典とする。新規store state/action/typeは作らない。
- recordedは「巻線の記録あり（Nターン）」を表示してMC4生成を許可する。
- legacyは「巻線の記録はありません（この機体を作った時点では記録していませんでした）」を表示し、MC4書き出しを理由付きdisabledにする。
- MC2/MC3は解析できるがrecordを持たない。`coilTurns`からrecordを捏造しない。
- MC4へ`windingTurnsRatio`を独立収載せず、decode時にcanonical recordから導出する。
- MC4はP4-1Bでは生成・解析だけとし、「この設定を読み込む」による在庫・装備変更は「このレシピの巻線記録の再現は、型紙機能の実装後に対応します」と理由付きで拒否する。正当なMC4を破損分類せず、P4-1Gまでローター生成・線材消費を先取りしない。
- production Assemblyのconfig、recipeKey経路、RecipePanelは同じ装備record selectorを使い、`record.length === config.coilTurns`をテストで固定する。

### 15.5 直接編集と依存閉包

- LabModeの`ParamPanel.coilTurns`は現行どおり残す。production Assemblyに直接巻数スライダー・UI clampは置かない。
- 組立challengeは追加せず`restrictions: null`を維持する。DiagnosisMode状態を流用しない。
- production候補は`CoilWindingStep.tsx`、`AssemblyReviewStep.tsx`、`StartStep.tsx`、`AssemblyMode.tsx`、`windingTraceGeometry.ts`、`drawWindingTrace.ts`、新規`inputCommands.ts`、`RecipePanel.tsx`、条件付き`useRetroCanvasFrame.ts`に限定する。
- testは半自動治具、失敗時record保持、材料固定、W1純関数、W2の同一縮尺・区間外stroke・`stripRect`・`axisRect`不変、P4-0非import、初回測定・再入場、MC4/legacyを対象とし、新規汎用fixture/E2E基盤を作らない。

### 15.6 禁止とレビューゲート

arbiter条件付き承認と人間再承認を2026-08-30に完了し、production/test実装を解禁した。同日、W2利用者向け前後切替をP4-1Gへ延期する閉包deltaを人間承認した。物理・較正・D10・被膜・RunSnapshot 4、音、新色、font、asset、package、生ドラッグ/パターン設計の修理、比較用state、`finishAssembly`再設計、commit、tag、push、deployは禁止する。W1約3倍は初期値とし、最終倍率はU2視認試遊で確定する。

## 16. P4-1B UI完了記録（2026-08-30人間承認・受入済み）

- productionへ採用した入力方式は半自動治具のみで、生ドラッグ・パターン設計はP4-0比較証跡として凍結した。
- 手続き巻線描画は位置分布、腕、方向、張力、4段積層を既存palette・整数座標で表現し、均一巻きに偽の規則縞が出ない外形輪郭へ是正した。
- 巻線ビューを持つ工程だけ表示枠を広げ、PC横長・スマホ縦横で「等倍でも収まりません」を出さずに操作できることを確認した。
- スマホ視認で判明した巻き数の見失いは、既存操作パッド内へ「巻き数 N / M ターン」を常設して解消した。既存`record.length` / `limit`だけを使い、パッド高さ、既存状態文、既存集計表示、aria規律は維持した。
- 人間は巻線形状・不均一さ・偽縞解消・画面収まり・巻き数常設と増加を承認した。利用者向け修正前後切替は、正典の修正前recordが生じるP4-1Gへ延期したままである。
- 最終先端`ae8f5f4c2031f9ad0197172201556c5d583160a2`は105ファイル・2695テスト、build、lint、通常型検査、Phase 4 sweep型検査、palette、productionから`src/p40`への非import、禁止差分監査を通過した。
- P4-1A/P4-1Bのtag・push・deployは未実施で、次はP4-1Cの実装前詳細化と別途人間承認である。
