# Phase 4 P4-0 UI・描画・音計画 v3（実装解禁）

作成: Suu_mot3（2026-08-25）

基点: `develop` / `4fefebe09f3407910091327d21d08075d0cf9084`

上位計画: `docs/phase4-plan.md`

engine/store/data計画: `docs/phase4-p4-0-plan.md`

状態: **計画一式・D01推奨案A・arbiter正式レビュー判定全文（P4-C1〜P4-C3を含む）は人間承認済み。条件反映とSuu_mot3照合を完了し、G0正式通過・G1実装解禁。commit、tag、pushは未承認。**

## 1. UX目標

UIの仕事は、巻線の上手さを採点することではない。次の順序を崩さず、プレイヤーが自分で因果を推測できる材料を出すことである。

```text
手を動かす
→ 自分の巻線が絵として残る
→ 走りと音と振動の差を見る
→ まず勝敗を受け取る
→ 次に比較事実を見る
→ 一箇所だけ直す
→ もう一度走る
```

「品質」「上手さ」「正解率」のゲージは作らない。原因断定文、推奨修正、自動修正も作らない。

## 2. 共通画面骨格

- 480×270の既存retro canvasを使う。
- 横画面を主とし、縦画面は既存orientation規律に従い、同じ情報を再配置する。
- paletteは`src/retro/palette.ts`の48色だけを使う。
- fontは`pixelFonts.ts`と`segmentDigits.ts`だけを使う。
- 巻線、走行、リザルトの主画面は単一canvas内で描く。操作用DOMはcanvas外の既存UI層に置き、canvas上へDOMを重ねて見た目を構成しない。
- クローズアップは480×270内の領域拡大であり、第二内部解像度を作らない。

### 2.1 画面内の固定領域

横画面の基準配置:

| 領域 | 目安 | 内容 |
|---|---:|---|
| 主作業/走行 | 左320×216 | 治具、ローター、コース、ゴースト |
| 生データ | 右160×216 | 巻数、方向、張力の現在値、走行中のrpm/電流。品質評価なし |
| 操作案内 | 下480×54 | ボタン、キー、状態文。長文を置かない |

縦画面では主領域→生データ→操作の順に並べ、読み順を変えない。

## 3. 15分フロー

### S0: P4-0入口

- タイトルに「巻線プロトタイプ」入口を1件追加し、Appのlocal表示状態で専用画面を開く。`gameStore.mode`は変更しない。
- 「保存されません」「固定部品・固定10 mコース」の2事実を短く表示する。
- 既存キャリアの所持金・在庫・進捗は使わない。

### S1: 入力案選択

- 3案を同じ順で並べる: 生ドラッグ / 半自動治具 / パターン設計。
- 各説明は操作差だけを書く。期待性能、初心者向け、推奨案などの評価語は書かない。
- 比較中はいつでもS1へ戻れる。戻ると未確定記録は破棄する旨を確認する。

### S2: 巻線

- 30〜60秒で固定ターン数を完成できる速度にする。
- 巻いた軌跡は即時に表示する。
- 表示する生値: 記録済み巻数、現在の方向、現在の張力、現在の腕。
- 表示しない値: balanceErrorRatio、axisOffsetMm、effectiveTurnsRatio、予測タイム、品質点。
- 完成後に「この巻線で走る」を有効化する。validator不通過時は原因を日本語で示す。
- 0〜9ターンでは集計・描画を有限値のまま維持し、「10ターン以上で走行できます」と理由を示して走行ボタンを無効化する。0ターンを含め、NaN/Infinityを表示しない（P4-C1）。

### S3: 初走

- playerを実体色、rivalを1段暗い半透明風の許可色演算で描く。
- 同時スタートし、表示上の位置は各traceの`positionM`だけから決める。
- 音はplayer motorを主にし、rival motorを別チャンネルで重ねない。3ch予算を守り、視覚ゴーストで相手を表す。
- 走行中はタイム差分析を出さない。現在位置、経過時間、playerのrpm/電流だけを表示する。

### S4: 二段リザルト第一段

- 2〜3秒は写真判定、勝敗、差、自己改善差、短いジングルだけを出す。
- 初走では前回値がないためrivalとの差だけ。二走目以降は前走との差も出せる。
- ボタンで即時スキップできる。reduced motionではアニメーションを省略して同じ事実を静止表示する。
- 分析表、巻線、原因候補を第一段へ混ぜない。

### S5: 二段リザルト第二段

- 同期ゴーストを自動で1回再生し、「もう一度見る」ボタンだけを置く。停止・シーク・任意速度のplayerは作らない。
- 2.5 mごとの区間差。
- 初走の巻線クローズアップ。
- 表示文は「第2区間で0.18秒遅れ」「この区間は左腕が多い」のような観測事実に限る。
- 「右へ直すと速い」「偏りが原因」のような因果断定はしない。
- プレイヤーが仮説を言った後に試遊票へ記録する。UI内に自由記述保存は作らない。

### S6: 型紙複製と一区間修正

- 「前の巻線を複製」を選ぶと記録を値コピーする。
- 記録を4等分した固定区間から一つを選び、その区間だけ選定入力方式で巻き直す。走行の4区間表示と同じ粒度に揃え、任意範囲timeline widgetは作らない。
- 選択外turnはロック表示し、値を変更しない。
- 修正前後を同じ縮尺・同じ色規則で切り替え比較できる。
- 自動平滑化、穴埋め、左右バランス補正はしない。

### S7: 二走目と勝利

- S3〜S5と同じ走行・結果UIを使う。別の勝利専用物理や画面を作らない。
- 第一段で勝利と改善を祝福し、第二段で事実を出す。
- 勝利時だけセッション限定銘板へ進める。

### S8: セッション限定銘板

- 愛称入力は短い日本語/英数字。上限はUI実装前に既存font幅から決める。
- 表示: 愛称、最終タイム、rivalとの差、巻線の小さな軌跡。
- localStorageへ保存しない。リロード/終了で消えることを明記する。
- 勝利札、戦績、引退機の棚、型紙永続化はPhase 5へ送る。

### S9: 任意三走目

- 承認済みのD01案Aに従い、「もう一度巻く」だけを提供してD01専用誘導は置かない。
- 既存D01デモへの分岐や、張力を原因とする表示は追加しない。
- P4-0完了を妨げる必須導線にしない。

## 4. 3入力案

3案は共通`WindingCommand`へ出力し、同じ描画、写像、走行、結果を使う。比較のための差は操作だけである。

### 4.1 案I: 生ドラッグ

目的: r2方式の比較対照。最小実装で「一周=一ターン」の身体感覚を確認する。

- pointer/touchで治具の周囲を一周すると`advanceTurn`を1件発行する。
- 横方向の通過位置から`position/arm`、独立slider/keysから`tension`、switchから`direction`を取る。
- 一周判定は幾何純関数へ分離し、描画frame数を使わない。
- キーボードでは左右でguide、上下でtension、Enterで1ターン、Rで方向反転。
- 円運動の速さを張力へ写像しない。

比較上の注意: 1ターンずつの反復が30〜60秒で苦役になるかを測る。演出を厚くして所要時間を隠さない。

### 4.2 案II: 半自動治具

目的: spec §9.1の本命候補。自動回転中にguideと張力を保持し、多数turnを連続記録する。

- 始動/一時停止、guide左右、張力、方向反転の4操作。
- 固定record tickで`advanceTurn`する。requestAnimationFrame回数は記録値に使わない。
- pointer/touch: guideを主操作、張力は独立sliderまたは第二pointer対応ではなく明示controlにする。multi-touch必須化はしない。
- keyboard: A/Dまたは左右=guide、W/Sまたは上下=tension、Space=始動/停止、R=方向。
- 方向反転は明示switchだけで起こり、gesture誤認識では起こらない。

### 4.3 案III: パターン設計+自動実行+要所修正

目的: 手作業量を抑えて仮説検証の反復速度を上げられるか確認する。

- 固定4点の`position/tension`値を調整し、4区間ごとにarm/directionを選ぶ。点の追加・削除・並べ替えはできない。
- 実行すると、制御点間を決められた補間規則でturn列へ展開する。
- 展開後に任意の一区間だけ案II相当の手動入力で置換できる。
- 自動実行は作成した値を再生するだけで、品質を改善しない。
- 高機能curve editor、複数layer、undo履歴基盤、プリセットライブラリは作らない。

## 5. 巻線描画

Phase 1の次をproductionへ引き上げる。

- `dummyWindingRecord.ts`の型は新正典型へ移す。
- `windingTraceGeometry.ts`の整数座標、内層→外層包絡、arm offset、tension由来wobbleを維持する。
- `drawWindingTrace.ts`の既存palette規律を維持する。

追加する表現:

- 逆方向区間: 新色ではなく既存色の明暗/破線規則で識別し、凡例を付ける。
- 選択修正区間: 既存選択色+枠。色だけでなく角括弧/markerでも示す。
- left/right/straddle: 位置差を既存幾何で表し、テキスト凡例を併用する。
- tension: wobbleへ既存どおり反映するが、「緩い/強い」の評価語は出さない。

禁止:

- SVG、画像asset、WebGL、新しいcanvas engine
- antialias前提の細線、サブpixel座標
- 品質に応じた赤/緑採点色
- 記録に存在しない乱れの見た目上の追加

## 6. 走行・ゴースト描画

- productionの既存`RaceCanvas`/`CourseRaceCanvas`は720×360のV2描画であり、480×270のPhase 1確定事項と両立しないため再利用しない。
- `src/retro-proto/overheadView/`の俯瞰斜め3/4試作から、P4-0に必要な1コース・player 1台・ghost 1台だけを`src/retro/race/`へ引き上げる。Mode 7、任意track描画、N台対応は入れない。
- 新しい走行描画は巻線描画と同じ480×270、整数pixel、既存palette/font規律に従う。これは新しい描画基盤ではなく、Phase 1で承認済みの試作をproduction helperへ移す作業とする。
- player/rivalの位置は共通の10 m座標をscreenへ写像する。
- rivalは同じ固定traceの再生。playerへ追従させない。
- 振動はplayerの既存`axisOffsetMm`由来値を描画へ渡す。UI独自に巻線から振動を計算しない。
- 写真判定はfinish付近の固定cameraだけ。勝敗判定は実タイムを唯一の出典にする。
- 区間差は4区間固定。汎用N区間editorは作らない。

## 7. 音

### 7.1 再利用

- motor音は既存`motorSound.ts`のrpm/current入力を使う。
- UI SEとジングルは既存synth/sequencer/mixへ載せる。
- 3チャンネル予算、master音量、音オフ、ブラウザのuser gesture解禁を維持する。

### 7.2 P4-0で必要な最小音

- turn確定: 短い低音量tick。連続治具では全turnを鳴らさず一定間隔に間引く。
- 区間選択/確定: 既存UI SEを再利用。
- 記録更新/勝利: 2〜3秒以内の短いジングル1種。
- 初走敗北: 新規敗北曲は作らず、短い結果SEだけ。

音を追加する場合は、音色・長さ・同時発音数・mix上限をG5前に一覧化し、人間確認へ出す。サンプルassetや新しいBGMはP4-0へ入れない。

### 7.3 決定（2026-08-26人間承認、案B）: P4-0では音を追加しない

**§7.2の4種（turn確定tick・区間選択/確定・記録更新/勝利ジングル・初走敗北SE）はPhase 6へ繰り越す。** P4-0では音関連コード・呼出し口・音響基盤を一切追加しない。上の§7.1・§7.2は当時の要求として残し（承認経緯を曖昧にしないため削除しない）、本項が優先する。

決定の経緯（G5実装前のread-only調査）:

- `src/components/MotorAudioControl.tsx`が`AudioContext`・`master`・`seBus`・`enabled`・`volume`をすべてcomponent内privateで保持しており、`src/p40/**`から到達する公開経路が存在しない。到達させるには同ファイル（UI計画§14のexpected closure外）の変更が要る。
- `sequencer.ts`の`computePlaybackPlan`は`perVoiceGain = BGM_MASTER_GAIN / voiceDivisor`を内部固定で使い、master gainの引数を持たない。SE予算`SE_MASTER_GAIN`=0.10へ収めるには`SE_MASTER_GAIN / BGM_MASTER_GAIN`≈0.1176の減衰段を挟む必要がある。
- `playScore`は`renderInstrumentSample`（OfflineAudioContext）で事前生成した`SampleBank`を要求するため、音4種のためにサンプル生成の初期化を新設することになる。

以上の代償（Phase 3のSE scheduler hostへの変更、SampleBank初期化の新設、closure拡張2件）に対し、§8が既に「音オフでも勝敗・記録更新・turn確定が視覚で分かる」ことを要求しており、G5で実装済みの視覚——勝敗の文字表示、写真判定の静止画、4区間差の表数値、巻数カウンタ、常設`role="status"`——だけでG7の人間試遊は成立する。

**G7では音を判定材料にせず、視覚だけで5条件を判定する。** 音の有無を理由にFAILとしない。

## 8. アクセシビリティと入力同等性

- すべての操作にbutton/slider/radio相当のDOM controlを持たせる。
- canvasだけをクリックしないと進めない構成にしない。
- focus ringを既存UIと同等以上に表示する。
- 各sliderは日本語label、単位、min/max/nowを持つ。正規化0〜1を画面へそのまま出す場合も「張力 62%」のように意味を付ける。
- direction、arm、選択区間は色以外の文字/形でも示す。
- touch targetは44 CSS px目安。横/縦の両方で重ならない。
- 44 CSS pxはcanvas外のDOM操作要素で保証する。canvas内は表示専用とし、canvas内の絵そのものへ独立したclick/touch当たり判定を持たせない。
- reduced motion時は写真判定の移動、ghost自動再生、点滅を停止できる。
- 音オフでも勝敗・記録更新・turn確定が視覚で分かる。
- keyboardだけで入力案選択→巻線→走行→結果→部分修正→再走→銘板まで到達できる。

## 9. 状態機械

```text
selectInput
  → windingFirst
  → readyFirst
  → racingFirst
  → celebrationFirst
  → factsFirst
  → hypothesisRecorded(試遊者が外部票へ記録)
  → selectRepairRange
  → windingRepair
  → readySecond
  → racingSecond
  → celebrationSecond
  → factsSecond
  → nameplate
  → optionalThird | complete
```

- reducerは許可された遷移だけを受理する。
- resetは全session stateを初期化する。
- race中の戻る操作は確認後にrunを破棄する。
- celebration中もskip可能だが、factsを先に自動表示しない。
- terminal/finish後に同じrAF loopを二重起動しない。
- P4-0限定の画面・scenario・session配線は`src/p40/`へ置き、P4-1で不要になればディレクトリ単位で除去できるようにする。巻線記録型と描画幾何だけは`src/materials/`・`src/retro/winding/`へ分離して残す。

## 10. テスト

### 10.1 pure/structure

- 0ターンの`effectiveTurnsRatio=1`、1ターンのratio=1、2〜9ターンの有限表示と走行拒否
- 三案が共通`WindingCommand`だけを出力するimport構造
- 同一command列の記録同値
- pointer座標の正規化と量子化境界
- 半自動治具の60/30/15 fps相当tick同値
- pattern展開の決定論と150上限
- state machineの許可/拒否遷移
- resetで記録、trace、銘板、選択区間が消える
- celebration→factsの順序
- 4区間差の純計算
- 表示用の区間差・クローズアップ入力が元trace/記録と一致すること
- palette外の生色0、整数座標、480×270
- aria label、keyboard handler、disabled理由文の構造
- `src/p40/__tests__/boundaryAudit.test.ts`による、RNG必須wrapper外の`stepTrackRun`直接呼出し、`Math.random`、recipe/save/production書込み境界への依存0件

### 10.2 人間/外部画面操作AI

ここでいう画面操作AIは、P3-4 G8と同様に、GitHubの診断branchを取得して実ブラウザを操作する外部デバッガーを指す。Playwright/jsdom等をリポジトリへ導入する意味ではなく、新規E2E dependency・設定・fixtureは追加しない。

画面操作AIへ依頼できる項目:

- 3案それぞれで完成まで到達できる
- pointer/keyboard操作、横/縦、focus、reset
- player/rivalの同時表示、写真判定、二段リザルト順序
- 区間差とクローズアップが画面へ表示される（値の一致自体はpure testが保証）
- 一区間以外が変更されない
- 銘板がリロードで消える
- Console赤エラー0

人間が確認する項目:

- 数値より前に音・振動・加速差を感じるか
- motor音と記録ジングルが適切か
- 3入力案の疲労感、身体感覚、もう一度やりたいか
- 原因を教えられずに仮説を作れるか
- 祝福が分析より先に感じられるか

## 11. 3入力案の採点票

同じ試遊者が各案を1回ずつ試す。順序効果を記録し、勝手に平均へ埋めない。

| 項目 | 生ドラッグ | 半自動治具 | パターン設計 |
|---|---|---|---|
| 完成時間（秒） |  |  |  |
| 意図した左右配置になった | PASS/FAIL | PASS/FAIL | PASS/FAIL |
| 張力を独立して操作できた | PASS/FAIL | PASS/FAIL | PASS/FAIL |
| 逆巻きを意図した時だけ入れられた | PASS/FAIL | PASS/FAIL | PASS/FAIL |
| 手癖が見た目へ残った | PASS/FAIL | PASS/FAIL | PASS/FAIL |
| 3回行って苦役でない | PASS/FAIL | PASS/FAIL | PASS/FAIL |
| もう一度使いたい | 自由回答 | 自由回答 | 自由回答 |
| 操作不能/混乱 | 事実のみ | 事実のみ | 事実のみ |

採用は単純な点数合計では決めない。5条件を満たし、重大な入力同等性欠陥がなく、30〜60秒を満たす案を人間が選ぶ。

## 12. 垂直スライス試遊票

```text
環境:
- commit / browser / OS / viewport / input device / audio on-off

時間:
- 1本目巻線 __秒
- 1走目 __秒
- 観察・仮説 __秒
- 部分修正 __秒
- 2走目 __秒
- 合計 __分__秒

1走目:
- player __秒 / rival __秒 / 差 __秒
- 初走で既に勝った: YES/NO（YESの場合も結果を書き換えず、この試遊を記録して固定シナリオ見直しへ戻る）
- 数値を見る前に感じたこと:
- 第二段を見て立てた仮説:

修正:
- 変更区間:
- 変更した事実（位置/腕/方向/張力）:
- 変更区間外が同一: PASS/FAIL

2走目:
- player __秒 / rival __秒 / 差 __秒
- 数値を見る前に改善を感じた: PASS/FAIL
- 狙った方向へ変わった: PASS/FAIL

総合5条件:
1. 数値前の改善: PASS/FAIL
2. 自発仮説: PASS/FAIL
3. 一箇所修正: PASS/FAIL
4. 自発的に再挑戦したい: PASS/FAIL
5. 3回巻いて苦役でない: PASS/FAIL/未実施

外観・音・操作の事実:
- 二段リザルト順序:
- motor音/ジングル:
- keyboard/touch:
- 横/縦:
- Console赤エラー:
```

## 13. 過剰設計停止条件

- 3案に別々の描画・走行・リザルトを作ろうとした。
- 3案比較前に本命案だけを磨き始めた。
- 「原因を分かりやすくする」ため品質ゲージや修正指示を足そうとした。
- ゴーストを任意N台、任意track、共有基盤へ一般化し始めた。
- 銘板・型紙・結果を保存しようとした。
- 第二解像度、新palette、新font、新asset、新dependencyが必要になった。
- 面白さ不足を新しい計測画面、物理軸、アニメーション量で埋めようとした。

該当時は作業を止め、削除または縮小案を先に提示する。

## 14. UI側expected file closure

G0で`rg`を再実行し、次のexpected setを固定する。追加が必要なら実装を止めて再提示する。

### 変更

- `src/App.tsx` — local表示状態と入口1件
- `src/retro-proto/resolutionHarness/dummyWindingRecord.ts` — `WindingTurn`の定義を削除し、alice所有の正典型をimport
- `src/retro-proto/resolutionHarness/windingTraceGeometry.ts` — production helper importへの追随が必要な場合のみ
- `src/retro-proto/resolutionHarness/drawWindingTrace.ts` — production helper importへの追随が必要な場合のみ

### 新規: P4-0後も残る

- `src/retro/winding/windingTraceGeometry.ts`
- `src/retro/winding/drawWindingTrace.ts`
- `src/retro/winding/__tests__/windingTraceGeometry.test.ts`
- `src/retro/race/phase4RaceGeometry.ts`
- `src/retro/race/drawPhase4Race.ts`
- `src/retro/race/__tests__/phase4RaceGeometry.test.ts`

### 新規: P4-0限定、`src/p40/`に隔離

- `src/p40/Phase4PrototypeScreen.tsx`
- `src/p40/sessionReducer.ts`
- `src/p40/Phase4PrototypeRaceCanvas.tsx`
- `src/p40/Phase4PrototypeResult.tsx`
- `src/p40/inputs/RawDragInput.tsx`
- `src/p40/inputs/SemiAutoJigInput.tsx`
- `src/p40/inputs/PatternInput.tsx`
- `src/p40/inputs/inputCommands.ts`
- `src/p40/__tests__/sessionReducer.test.ts`
- `src/p40/__tests__/inputCommands.test.ts`
- `src/p40/__tests__/boundaryAudit.test.ts`（P4-C2/P4-C3のexpected closure）

### 原則変更なし

- `src/store/**`
- `src/modes/CourseMode.tsx`
- `src/render/RaceCanvas.tsx`
- `src/render/CourseRaceCanvas.tsx`
- `src/retro/audio/**`（既存SEだけで成立する場合）
- package dependency / lockfile

UIは`WindingTurn/WindingRecord`型を定義せず、`src/materials/windingRecord.ts`からtype importする。

## 15. 実装前のUI承認事項

1. Appのlocal表示状態による専用画面とS0〜S9の画面順。
2. 3案の最小操作仕様（案IIIは固定4点）とG2の中間選定。
3. 二段リザルト、4区間差、クローズアップの事実限定表示。
4. 既存音基盤だけを使う最小音構成。→ 2026-08-26の人間承認（案B）により、P4-0では音を追加せずPhase 6へ繰り越すことに変更（§7.3）。
5. 外部画面操作AIと人間の確認分担。新規E2E基盤は導入しない。
6. 試遊票と停止条件。

上記UI境界は計画一式・D01推奨案A・arbiter正式レビュー判定全文の人間承認に含まれる。G7後の正典同期は`spec.md`/`art-spec.md` §9.1の入力装置割当だけとし、巻線schema、D10、被膜、整流子、進角を先取りしない。
