# Phase 1 実装結果レポート(Unit A〜H)

作成日: 2026-07-21
担当: brabit(UI・描画・音)
状態: **全Unit(A〜H)技術実装完了・Suu技術承認済み。人間レビュー未完了のためPhase 1ゲートは未達**
実費: 0 USD(Unit A〜H通算)

このドキュメントは、agmsg上でSuuへ報告した内容の永続版である。どのモデルが読んでも
単独でPhase 1の技術的完了状況と残作業を把握できることを目標にする。計画自体は
`docs/phase1-plan.md`(Suu作成・人間承認済み)を正とする。本書はその実装結果の記録。

## 1. 対象コミット(develop branch、push未実施)

| コミット | 内容 |
|---|---|
| `cf21386` | THIRD-PARTY-LICENSES新設(PixelMplus、Phase 0時点でフォント本体は未導入) |
| `e96fbe7` | Unit A: 整数拡大・二層倍率制約の基盤実装 |
| `e560fa8` | Unit B: パレット基盤+RGB直値検査スクリプト |
| `ce21985` | Unit C: PixelMplusフォント本体を導入 |
| `10d9dab` | Unit D: 試作entry基盤+解像度4案比較+俯瞰走行ビュー |
| `f56ad1f` | Unit D修正: G3色/16方位3/4視点/俯瞰ビュー整数拡大 |
| `ffddd0b` | Unit D修正: 整数ピクセル規律違反(carSprite/tallObject) |
| `f7a15c1` | Unit D修正: 解像度比較ハーネスの整数ピクセル化 |
| `d3c6d98` | Unit E: 色演算許可リスト検証 |
| `8b5b04c` | Unit F: Mode 7見取り図ズーム+通常スプライト重ね合わせ |
| `aad01e4` | Unit F修正: 実際の透視変換(行ごとのサンプリング幅変化) |
| `bf9adbd` | Unit F修正: 透視srcYの校正(縦方向スイープの退化を解消) |
| `bb4b149` | Unit F修正: off-by-one(最下段が常にN0になる不具合) |
| `40fcd09` | Unit G: サンプルベース音源(BGM+モーター音) |
| `44a1a63` | Unit G修正: playScoreの音高/音量/長さ無視を解消 |
| `35eecd3` | Unit H: 性能測定(frameProbe)+最悪ケース試作 |
| `328c25a` | Unit H修正: 縦持ち転置・メモリ計測窓・GC検出・停止状態管理・タブa11y・本書新設 |
| `30a0671` | PHASE1-REVIEW-FIX承認4件: 候補c表示・検死文字固定サイズ+行クリップ・車体サイズ拡大・Mode7静止比較 |
| `b15aed3` | 本書更新: §8を修正実施済みへ更新 |
| `b9fd843` | Task#18(音源タブ無音)+Task#19(最悪ケース音量バランス)を修正 |
| `becf4b9`・`3876920` | 本書更新: Task#18・#19の原因調査結果を記録 |
| `84a9983` | Task#17: WorstCaseDemoの初回フレームクラッシュを解消 |
| `1975d8c` | 本書更新: クラッシュの原因・修正結果を記録 |
| `efb085d` | 本書更新: WorstCaseDemo性能ボトルネックの計測結果と品質低下案を記録 |
| `76ed1c3` | Task#17: Mode7品質低下策(2pxサンプリング)+冗長clearRect削除 |
| `13fb7a5` | 本書更新: 品質低下策の実装結果と修正前後比較計測を記録 |
| `dd46aa6` | Task#17: WorstCaseDemoを直接低解像度Canvas方式へ変更(合成blit廃止、実験実装) |
| `957230f` | Task#17: 直接Canvas方式のDPR物理基準ヘルパー(`directCanvas.ts`)とvsync対応統計(`computeVsyncAwareStats`)を追加 |
| `00cfae8`・`833710d` | Task#17: 直接低解像度Canvas方式を全demo(ColorOpsDemo/Mode7Demo/OverheadViewDemo/ResolutionHarness)へ展開、DPR物理基準を`computeDirectCanvasPhysicalCssSize`へ置き換え |
| (本コミット) | 本書更新: 全demo展開・DPR物理基準整理の結果を記録、未着手事項(vsync再測定・18秒非復帰の切り分け)を明記 |

各コミットは`npm run test && npm run build && npm run lint`成功、`src/engine/`・既存V2 UI(`src/render/`等)への意図しない変更なしを確認済み。

## 2. Unit別の技術結果(要約)

- **Unit A**(整数拡大・二層倍率制約): `src/retro/canvas/integerScale.ts`にCSS基準・DPR物理ピクセル基準の整数倍率計算。二層構成の奇数倍率問題を実データで検証し、art-spec §2.1への反映提案を提出(未反映、人間判断待ち)。
- **Unit B**(パレット): `src/retro/palette.ts`に共通48色(コア32+拡張16)。`scripts/checkPaletteUsage.ts`でRGB直値混入を検査(fixtureベースのテスト、作業ツリーを汚さない)。
- **Unit C**(フォント): PixelMplus10/12 Regularを公式配布元(itouhiro/PixelMplus、commit `d89b95f0`)から取得。SHA-256・サイズ・ライセンス照合を記録。
- **Unit D**(試作entry+解像度比較+俯瞰走行ビュー): `retro-proto.html`(開発専用、本番buildに非混入)。4解像度案×3題材(乱巻き軌跡・ガレージ一枚絵・検死レポート)。俯瞰3/4視点の走行ビュー(壁つき周回コース・16方位スナップ・整数スクロール・接地影・G3遮蔽)。複数回のレビュー往復で整数ピクセル規律違反・16方位のctx.rotate依存・G3色不一致を修正済み。
- **Unit E**(色演算): `src/retro/colorOps/blend.ts`に加算合成・50%平均合成・市松ディザ判定の3純関数のみ(許可リスト外は未実装)。
- **Unit F**(Mode 7): `src/retro/mode7/affineSampler.ts`に行単位の透視ズーム変換(`computePerspectiveRowTransforms`)。3回のレビュー往復で「実は等方ズームだった」「縦方向スイープが数px化していた」「off-by-oneで最下段がN0になっていた」を修正し、実際の透視効果を実装済み。
- **Unit G**(音源): `src/retro/audio/`にADSR包絡線・JSON譜面・最大8chシーケンサ・自作IR残響・RPM連動モーター音の純関数一式。レビューで「playScoreが音高/音量/長さを無視していた」重大な不具合を修正し、`computePlaybackPlan`純関数で音高比・velocity・stopTime・ループを正しく反映するよう修正済み。
- **Unit H**(性能測定・DoD): `src/retro-proto/perf/frameProbe.ts`にp50/p95/p99/最大・欠落フレーム数・メモリ統計・GCらしき下降検出の純関数。最悪ケースタブ(俯瞰+Mode7+色演算+BGM+モーター音の同時稼働)。レビューで縦持ちviewport非対応・メモリ計測窓のウォームアップ混入・GC検出欠如・停止時の状態管理不備・タブ選択の色依存表示を修正済み。

## 3. 自動ゲート結果(本コミット時点)

- `npm run test`: 51ファイル・494テスト成功(既存V2由来206テスト含む、無変更。最新コミット時点、本書冒頭のコミット一覧参照)
- `npm run build`: 成功、651モジュール、既存V2本番入口(`index.html`)を維持。`retro-proto.html`は本番buildに含まれない
- `npm run lint`: 成功(oxlint、警告0)
- `npx vite-node scripts/checkPaletteUsage.ts src/retro src/retro-proto`: RGB直値0件検出
- `git diff --check`: 問題なし
- `cmp AGENTS.md CLAUDE.md`: 一致(brabitはこれらを変更していない)
- `src/engine/`・既存V2 UI(`src/render/`・`src/components/`・`src/modes/`・`src/store/`・`src/data/`)への意図しない差分: なし

対象viewport成立の回帰テスト(`src/retro/canvas/__tests__/orientation.test.ts`)で、縦390×844・横844×390・デスクトップ1920×1080の3viewportすべてでOverheadViewDemo/WorstCaseDemo基準解像度(480×270、縦持ちは270×480へ転置)が`fits=true`になることを確認済み。

## 4. 容量

- dist総量(`npm run build`、非圧縮、全ファイル): 3,109,839 bytes
  - 内訳: `index.html`(0.72kB)+CSS(22.04kB)+JS(677.39kB)+PixelMplusフォント2書体(計2,407,612 bytes)
- 現在の本番エントリ(`index.html`)が実際に読み込むファイルはCSS・JSのみで、フォント2書体はどのタグ・スクリプトからも参照されていないため、実際のブラウザは要求しない(Vite の `public/` コピー仕様により dist 上には存在するが、production の初回ロードには含まれない)
- 現在の本番初回ロード転送量(ビルド成果物の依存関係から算出、baseline-v2.0.md 701,552 bytes からの比較): 非圧縮約700KB・圧縮後(gzip)約196KB相当(CSS gzip 5.23kB+JS gzip 191.19kB)。baseline からほぼ変化なし(Tailwindのcontent scanがretro-proto配下も対象にしているための微増、+397 bytes)
- 実ブラウザNetworkタブでの実測(圧縮方式・キャッシュヘッダ等ホスティング環境依存要素を含む)は未実施、人間実測待ち
- 将来V3本番UIがフォント・retro描画基盤を実際に採用した場合の参考値(概算): フォント2書体のgzip合計約730KB+既存JS/CSS圧縮分約196KB≈926KB(1MB未満の範囲に収まる可能性があるが概算)

## 5. アクセシビリティ

- キーボード操作: 全タブのUI要素はネイティブHTML要素(button/select/input)で、tabIndex上書きやoutline除去等の独自CSSは追加していない。タブのrole/aria-selected付与済み(本コミット)
- 色以外の状態表示: タブ選択状態は背景色に加え記号(▶)・太字でも表示するよう修正済み(本コミット)。試作題材(乱巻き軌跡・ガレージ一枚絵)の色分けについては、本番アセット段階での二重符号化(形状差等)の適用はPhase1試作のスコープ外として扱った
- 縦持ち表示: 解像度比較・俯瞰走行ビュー・最悪ケースの各タブは内部解像度の転置(`selectOrientedResolution`)により縦390×844でも表示可能なことを純関数テストで確認済み。実機での見た目確認は人間実測待ち
- 実機でのキーボード操作・フォーカス視認の確認は人間実測待ち

## 6. 人間レビュー結果(2026-07-21実施分)

- **色演算タブ(発光・煙・夕景、演算あり/なし/市松ディザ)**: 合格。プロジェクトリードから「問題なし」の評価。
- **解像度比較タブ**: 不合格2件を検出。(1)検死レポートの文字が見にくい、(2)候補cが表示されない。原因調査結果は§8参照(修正は未実施、Suu報告後に着手)。
- **俯瞰走行ビュータブ**: 「表現は良いが、車が小さすぎる」との指摘。俯瞰3/4視点の表現自体は良好という肯定的評価を含む。原因調査結果は§8参照。
- **Mode 7タブ**: 不合格。「全体が拡大されるだけで、傾いて見えない」との指摘。数値テストは通過しているが視覚上の床面傾斜・奥行き表現が成立していない。再確認待ち。原因調査結果は§8参照。
- **音源タブ**: 不合格。「モーター音が鳴らない」との報告。再現手順・原因は未調査(§10.1で追跡)。
- **最悪ケースタブ(音量バランス)**: 不合格。「モーター音は鳴るがうるさすぎてBGMが聞こえない」との報告。音源タブの無音問題とは別事象(§10.2で追跡)。
- **性能実測(WorstCaseDemo)**: 測定条件「content 480×270・表示倍率2x・Chrome CPU 4倍スロットリング有効」で実施。viewport実寸・DPRは未確認のため、対象3viewport(縦390×844/横844×390/1920×1080)のいずれかへの割り当ては未確定。実測値・60fps未達の判定は§9参照。

## 7. 人間レビュー待ち項目(Phase 1ゲートまで追跡、実測値は未取得のまま明記)

1. ~~4案×3題材(解像度比較タブ)の無加工スクリーンショット取得、比較表・推奨案の最終判断~~ → 実施済み、不合格2件検出(§6)。その後(b)480×270単層で再確定・人間承認済み(`docs/phase1-resolution-comparison.md`)
2. ~~乱巻きの可読性と整数化による角張りの評価~~ → Task#WINDING-AGE-RADIUS実装後、2026-07-22人間承認(§12、`docs/phase1-art-review.md` §2)
3. ~~ガレージ一枚絵の描き込み密度の評価~~ → Task#GARAGE-DENSITY実装後、2026-07-22人間承認(§12、`docs/phase1-art-review.md` §3)
4. ~~検死レポート(PixelMplus10/12+セグメント風数値)の可読性~~ → 実施済み、不合格(§6・§8)
5. ~~俯瞰走行ビュー: 壁・コーナーの可読性、16方位スナップでコーナリングが滑らかに見えるか~~(車体サイズ拡大実施済み・§8) → 2026-07-22人間承認(§12、`docs/phase1-art-review.md` §4)
6. ~~色演算(発光・煙・夕景)の演算あり/なし/市松ディザの見た目比較・妥当性判断~~ → 実施済み、合格(§6)
7. ~~Mode7透視ズームの見た目の妥当性~~ → 実施済み、不合格(§6)。静止比較(§8.4)+ズーム変化率同期実装後、2026-07-22人間承認(§12、`docs/phase1-art-review.md` §6)
8. BGMの旋律・和音・音長・ループ境界の試聴確認、既存曲を想起させないことの確認
9. サンプルループ部の継ぎ目・音割れの有無
10. 残響ON/OFFの差の確認
11. モーター音のRPM追従・RPM=0無音化の試聴確認
12. ブラウザでの音源生成・WAV保存動作の実地確認
13. 性能実測: 縦390×844/横844×390/1920×1080×Chrome CPU4倍スロットリングでのp50/p95/p99/最大・16.7ms超過フレーム数・メモリ推移・GCらしき下降 → 1回分の実測値を取得(§9)。ただしviewport実寸・DPRが未確認のため対象3viewportへの割り当ては未確定。60fps未達(16.7ms超過約19.2%)、ボトルネック調査・品質低下策は§9参照
14. 初回ロード転送量の実ブラウザNetworkタブでの実測(ビルド成果物からの計算値は上記§4のとおり提示済み)
15. キーボード操作・フォーカス視認・縦持ち表示の実機確認
16. 4案からの内部解像度確定、二層構成(候補c)の奇数倍率問題への対応方針、共通48色の最終値、1MB超過時のフォントサブセット方針(現状は超過していない計算だが最終判断は人間)、Phase1ゲート後の試作画面(`retro-proto.html`/`src/retro-proto/`)の削除または保持

## 8. PHASE1-REVIEW-FIX承認4件(2026-07-21人間レビュー起因、コミット`30a0671`で実装済み・人間再レビュー待ち)

Suuから「PHASE1-REVIEW-FIX承認・全文指示」で4件とも承認され、以下のとおり実装した。**4件はいずれも人間再レビューまでは未合格のまま**(自動テスト・build・lintは全件成功)。

### 8.1 候補cが表示されない → 実装済み
候補c(検死レポート題材時)はUI層960×540を内部解像度として使う。`computeIntegerScale`はcontainer(ブラウザwindow実寸から header・余白を引いた領域)が960×540未満だと`fits=false`を返す。`computeIntegerScalePhysical`の数式自体は正当で、CSS基準では`fits=false`でもDPR物理ピクセル基準(例: DPR=2)では`fits=true`になりうることを回帰テスト2件(`integerScale.test.ts`)で固定した。`ResolutionHarness.tsx`のfallbackメッセージに、必要サイズ・現在の基準モード(CSS/物理)・現在のCSSコンテナ実寸・devicePixelRatio・利用可能な物理ピクセル数・「物理ピクセル基準を有効にすると成立する場合がある」という切替ヒントを追加し、二層構成の成立条件を利用者が判断できるようにした。二層構成そのものの採否は仕様上の未決事項として残る(§11参照)。

### 8.2 検死レポートの文字が見にくい → 実装済み
`postMortemLayout.ts`のフォントサイズを、候補ごとのcontentHeightPxに比例した動的計算(実測7〜32px)から、固定のネイティブサイズ(`FONT_TITLE_SIZE_PX=12`/`FONT_BODY_SIZE_PX=10`)へ変更した(PixelMplus10/12はビットマップ内蔵TTFのため、ネイティブサイズ以外では拡縮によるぼやけが生じる)。フォントサイズを固定した結果、低解像度候補(320×180)では全13行が収まらなくなるため、収まる行だけを描画し末尾に「…残りN行」を付与する行クリップ/省略ロジック(`omittedLineCount`)を追加した。480×270以上では全13行が省略なく表示される。テストを全面書き換え(16件、固定サイズ・低解像度での省略・高解像度での全行表示・単調性・境界値・部分行非表示を検証)。

### 8.3 俯瞰走行ビューの車体が小さい → 実装済み
`carSprite.ts`の寸法を承認済み値へ拡大した(全長16→28px・幅9→16px・側面高最大6→10px・前部マーカー半径5→8px)。トラック全幅84px(`TRACK_HALF_WIDTH`×2)に対し車体最大幅28px(約33%)は過大にならない範囲に収まることを回帰テストで固定した(16方位すべての幅がトラック全幅の50%未満)。

### 8.4 Mode 7が「単なるズーム」に見える(傾いて見えない) → 実装済み
数値上の透視変換自体は既存テストで正しいと確認済みだったため、原因は(a)デモのアニメーションが一様zoom往復のみで台形比率自体が動かず「ズームしている」印象が支配的になっていた点、(b)見取り図ソースが疎で収束の手がかりに乏しかった点、の2点と判定した(Suu承認済み仮説)。対策として、密な2色市松検証床(`checkerFloorSource.ts`、20pxタイル・400×400)を新設し、等方ズーム版(`computeZoomRowTransforms`)と透視版(`computePerspectiveRowTransforms`)を同一zoom(1.6)・同一中心・同一奥行き校正で並べる静止比較(`drawPerspectiveComparison.ts`)を`Mode7Demo`の主表示に追加した。ラベルは色以外(「A:等方(比較用)」「B:透視(採用版)」というテキスト内容そのもの)で区別できるようにした。透視比率は比較中固定(非アニメーション)とし、既存の見取り図アニメーションデモ(往復zoom)は補助表示へ格下げした。テストで、透視版の奥側(row=0付近)の隣接行間ワールドY差が手前側(参照行付近)の2倍を超えること、等方版は全行で同一のサンプリング幅(a)を使うのに対し透視版は手前から奥へ向けて増加すること、等方版と透視版が既知点(row=0)で明瞭に異なることを固定した(`drawPerspectiveComparison.test.ts`)。

## 9. 性能実測データ(2026-07-21、人間実測1回分)

測定条件: WorstCaseDemoタブの画面表示「content: 480×270 / 倍率: 2x」、Chrome CPU 4倍スロットリング有効。**viewport実寸・DPRは未確認**(対象3viewport縦390×844/横844×390/1920×1080のいずれかへの割り当ては断定しない)。

| 項目 | 値 |
|---|---|
| フレーム数 | 754 |
| p50 | 11.10ms |
| p95 | 22.30ms |
| p99 | 22.60ms |
| 最大 | 22.70ms |
| 16.7ms超過フレーム数 | 145/754(約19.2%) |
| メモリ | 開始12.4MB→終了13.4MB(ピーク13.6MB、差分0.9MB) |
| GCらしき下降 | あり(6回、しきい値1.0MB、最大下降1.92MB) |

この条件下では16.7ms超過率約19.2%であり、60fps目標に対して未達として扱う。原因分析(ボトルネック調査)と、仕様(非機能要件「遅延時は時間を飛ばさず描画品質を下げる」)に沿った品質低下策は測定条件確定後に提示する(§10.3で追跡)。

## 10. 追加調査中の不具合(2026-07-21人間レビュー起因)

### 10.1 音源タブでモーター音が鳴らない → 実装済み(コミット`b9fd843`、人間再レビュー待ち)

**再現手順**: 音源タブを開き、「楽器サンプル+残響IR+モーター音を生成」ボタンを押さずに(または生成中に)「モーター音再生」を押す。

**確認方法**: 実Chromium(Playwright経由、headless)でWeb Audio APIのAudioContext/AudioParam/AudioBufferSourceNode/AudioNode.connectをフックし、実際のノード生成・接続・gain値・バッファ内容を計測した。生成完了後に「モーター音再生」を押した場合は、AudioContext.state=`running`、GainNode.gain.value=1、AudioBufferSourceNode.loop=true・playbackRate=1・バッファ内容は無音でない(平均振幅0.33)ことを確認しており、**生成完了後の再生パス自体は正しく動作する**。

**原因**: `AudioDemo.tsx`の「モーター音再生」(および「BGM再生」・各楽器の「再生」)ボタンには生成完了状態と連動した`disabled`制御が一切ない。`handleToggleMotor`は`motorBufferRef.current`が`null`なら`if (!buffer) return;`で即座に抜けるだけで、ボタンラベルも変化せず、コンソールエラーも画面上のメッセージも一切出ない。生成未実施(または生成中、5楽器+残響IR+モーター音の複数回`await`のため体感できる時間がかかる)の状態で押すと、完全に無反応・無音のまま何も起きない。人間レビューの「モーター音が鳴らない」はこの経路で再現することを確認した(Playwrightで生成ボタンを押さず「モーター音再生」を押すケースを実行し、`AudioBufferSourceNode.start()`が一度も呼ばれないこと、ボタンラベルが変化しないこと、画面上にエラー表示が一切出ないことを確認済み)。

**実装内容**(Suu承認済み仕様どおり):
1. `audioTabUiState.ts`に`computeAudioTabUiState(status: 'idle'|'generating'|'ready'|'error', detailMessage?)`を純関数として新設し、モーター/BGM/各楽器の再生・保存ボタンを`disabled={uiState.playbackControlsDisabled}`で一括制御。idle時は「未生成。先に音源を生成してください」、generating時は「音源を生成中です…」、error時は日本語エラーメッセージを色以外(文言)で表示する。
2. 「生成」ボタンも`generating`中は`disabled`にした。
3. 二重生成防止は`isGeneratingRef`(Ref、同期的)で行う。実ブラウザ確認で、React stateのクロージャに基づくガードは同一tick内の連続呼び出しを防げないことが分かった(2回目の呼び出しが古いレンダーのクロージャを参照するため)ため、Refで即時反映されるフラグに変更した。
4. 生成失敗時は`catch`で`error`状態+日本語エラーメッセージへ遷移し、`generating`に固定されないようにした。
5. **実ブラウザ確認で発見した副次バグ**: アンマウント時cleanupの`isMountedRef`について、`useEffect`のsetup本体を空にしていたところ、開発時のStrictMode(mount→cleanup→再mountを合成的に実行)により実マウント後も`isMountedRef.current`が`false`に固定され、生成処理が`if (!isMountedRef.current) return;`で無限に「生成中です…」から進まなくなる不具合を作り込んでいた。`useEffect`のsetup本体で明示的に`isMountedRef.current = true`とすることで解消した。この種の不具合は`npm run test`/`build`/`lint`のいずれでも検出できず、実ブラウザでの動作確認で初めて見つかった。

**確認結果**(実Chromium/Playwright): idle時はモーター/BGM/楽器ボタンが無効で生成ボタンが有効、生成完了後は逆に切り替わり文言も追従することを確認。生成ボタンを合成的に連打(同一tick内で2回`click()`)しても`OfflineAudioContext`の生成回数は6回(楽器5+モーター1)ちょうどで、二重生成が発生しないことを確認済み。

Suuから提案のあったWeb Audio ノード生成のDI化(呼び出し順序を自動テストする案)は、上記の対応だけで無音の直接原因には対応済みのため、今回のスコープでは見送り、将来必要になった時点で改めて検討する。

### 10.2 最悪ケースタブでモーター音がBGMより大きすぎる → 実装済み(コミット`b9fd843`、人間再レビュー待ち)

音源タブの無音問題(§10.1)とは別事象。`sequencer.ts`の`computeChannelMix`は「合算クリップ防止として、チャンネル数で等分したゲインを返す」設計で、BGM(`bgmScore.ts`、kick/snare/bass/chord/leadの5ch)は各chが`masterGain(既定1)/5=0.2`を基準ゲインとし、さらに`note.velocity`(0.4〜0.9)を掛ける。つまりBGMの各音は最大でも約0.18(kick: 0.2×0.9)、持続音でも約0.08〜0.14(bass: 0.2×0.7、chord: 0.2×0.4)程度に抑えられている。

一方`WorstCaseDemo.tsx`の`ensureAudioStarted`はモーター用GainNodeを`audioCtx.createGain()`で生成した直後は初期値(Web Audio既定の1.0)のまま、その後アニメーションループ内で毎フレーム`applyMotorGain(motorGainRef.current, rpm)`を呼ぶ。`computeMotorGain(rpm)`は`rpm>0 ? 1 : 0`という二値のみを返す設計で、WorstCaseDemoのダミーRPM(`baseRpm*(0.4+0.6*sin)`)は常に正のため、実質的に**モーター音は常時gain=1.0固定**になる。実測したモーターサンプルの持続部振幅(sustainLevel=0.8付近)と合わせると、モーターは常時振幅約0.8で鳴り続けるのに対し、BGMの各chは間欠的に振幅0.08〜0.18程度――音量比でおおよそ4〜10倍、モーター側が優勢な設計になっている。BGM側が「合算クリップ防止のためチャンネル数で等分」という抑制を受けているのに対し、モーター側にはその種の抑制が一切ない、という設計上の非対称が根本原因。

**実装内容**(Suu承認済み仕様どおり、追加条件「BGM最大予算+モーター最大予算が1.0を超えない」も反映): `src/retro/audio/mixLevels.ts`を新設し、`BGM_MASTER_GAIN = 0.8`・`MOTOR_MASTER_GAIN = 0.2`(合計1.0、クリップ防止)を一元管理する。
- `sequencer.ts`の`computeChannelMix`の既定`masterGain`を`1`から`BGM_MASTER_GAIN`へ変更(呼び出し側で明示的に`masterGain`を渡していない`computePlaybackPlan`経由のBGM再生すべてに適用される)。
- `motorSound.ts`の`computeMotorGain`を二値(0/1)から連続値へ変更: `rpm<=0`で0、`rpm>0`で`MOTOR_MASTER_GAIN * Math.min(1, rpm / baseRpm)`(RPMに比例して0→上限まで連続的に増加、上限でクランプ)。シグネチャに`baseRpm`引数を追加(`applyMotorGain`も同様)。
- `WorstCaseDemo.tsx`のモーター用GainNode生成直後にも`applyMotorGain(gainNode, 0, baseRpm)`を呼び、Web Audio既定値(1.0)のまま最初の描画フレームまで一瞬だけ最大音量になる問題を予防した。
- 回帰テスト: (a) `BGM_MASTER_GAIN + MOTOR_MASTER_GAIN <= 1.0`(`mixLevels.test.ts`)、(b) `computeMotorGain`がrpmについて単調非減少、(c) `rpm=0`で厳密に0・`rpm>=baseRpm`で`MOTOR_MASTER_GAIN`ちょうど、(d) `computeChannelMix`の既定`masterGain`が`BGM_MASTER_GAIN`になること、を固定した。
- `computeMotorPlaybackRate`(ピッチ)は変更していない。BGM側のミュート・モーター側の完全無音化は行っていない(Suu指示の制約どおり)。

**確認結果**(実Chromium/Playwright、音源タブ): RPM=0で再生開始した直後のgain値は0(無音)、RPM=16000(baseRpmの2倍)で再生開始した直後のgain値は0.2(`MOTOR_MASTER_GAIN`ちょうど、クランプ済み)を確認。playbackRateも別途0.25/2として正しく反映されていることを確認済み。数値の妥当性(0.2という具体値・BGMとの相対比)は試遊確認が必要なため、人間再レビューを依頼する。

### 10.3 WorstCaseDemoの性能(60fps未達)・初回フレームクラッシュ

**初回フレームクラッシュ → 原因判明・修正済み(コミット`84a9983`、人間再レビュー待ち)**

**現象**: WorstCaseDemoタブで「開始」を押すと描画ループの初回フレームで例外`Cannot read properties of undefined (reading 'x')`(`drawOverheadView.ts`の`const camX = Math.round(car.x - contentWidthPx / 2);`、`car = state.trackPoints[state.carIndex]`が`undefined`)が発生し、描画が完全に止まる。Playwright(headless Chromium)で3回連続再現していた。

**環境差の説明(プロジェクトリード環境で754フレームの計測が成功していた事実との整合)**: 描画ループ内で`elapsedSec = Math.min((now - lastTime) / 1000, 0.25)`(`now`=`requestAnimationFrame`のコールバック引数、`lastTime`=直前に同期的に取得した`performance.now()`)を計算し、`progress += elapsedSec * DUMMY_SPEED_POINTS_PER_SEC`でトラック上の進行度を積み上げ、`carIndex = Math.floor(progress) % TRACK_POINTS.length`で車の位置indexを求めていた。デバッグ計測の結果、headless Chromium実行時、初回コールバックで`now`が直前の`lastTime`よりわずかに(実測約12ms)小さくなる事象を確認した(`elapsedSec ≈ -0.0121`、`progress ≈ -0.218`、`carIndex = -1`)。JSの`%`演算子は負数に対して数学的な剰余ではなく符号を保持した値を返す(`-1 % 144 === -1`)ため、`TRACK_POINTS[-1]`が`undefined`になっていた。`elapsedSec`の上限(0.25秒)はクランプしていたが下限(0秒)はクランプしておらず、`now < lastTime`を想定していなかったのが直接原因。

`requestAnimationFrame`のコールバックタイムスタンプは仕様上、直前の`performance.now()`呼び出しより前になることは実質的に起こらない(通常の垂直同期に基づくため)。今回observedした逆転は、headless/自動化環境固有の仮想時刻・タイマー精度丸め(セキュリティ上の理由でperformance系APIの精度が意図的に落とされていることがある)に起因すると考えられる。プロジェクトリードの実ブラウザ環境ではこの逆転が発生せず754フレームの計測に成功していたことと整合する。ただし、この一致していないタイミングの発生条件そのものを完全には特定できていない(Chromiumの内部実装への深追いはしていない)ため、断定はしていない。

**修正内容**: (1) `elapsedSec`に下限0秒のクランプを追加(根本原因への直接対応)。(2) `carIndex`の算出を`computeCarIndex`(`src/retro-proto/worstCase/carIndex.ts`)という純関数へ抽出し、「`trackLength`は正の整数」「返り値は常に0以上`trackLength`未満の有限整数」という不変条件を強制する(数学的modulo `((n%m)+m)%m`で負のprogressも正しく折り返す、trackLengthが不正なら例外)。配列アクセスをoptional chainingで隠す対症療法はしていない。テスト8件(`carIndex.test.ts`)で既知値・負のprogress・巨大なprogress・不正なtrackLength/NaN/Infinityの拒否を固定した。Playwrightで3回連続再現していたクラッシュが解消し、241フレーム連続で例外なく描画が継続することを確認済み。

**性能測定(60fps未達)のボトルネック調査 → 支配的要因を特定(修正は未実装、承認待ち)**

**計測方法**: クラッシュ解消後、描画ループの5フェーズ(1.俯瞰走行ビュー全面、2.Mode7インセット、3.色演算インセット、4.モーター音RPM更新、5.`clearRect`+`drawImage`合成blit)それぞれの前後に`performance.now()`を仕込み、各300フレーム分の平均所要時間を計測した(計測後は元のコードへ復元、コミットには含めていない)。Chrome DevTools Protocolの`Emulation.setCPUThrottlingRate`でCPU 1倍・4倍の両条件を計測。viewport 1280×720(Playwright既定)、content 480×270・倍率1x。

| フェーズ | CPU 1倍 | CPU 4倍 | 割合(両条件でほぼ同一) |
|---|---|---|---|
| 1) 俯瞰走行ビュー(全面) | 0.141ms | 0.391ms | 2.8〜4.0% |
| 2) Mode7インセット(120×90) | 1.238ms | 4.810ms | 35.0% |
| 3) 色演算インセット | 0.054ms | 0.232ms | 1.5〜1.7% |
| 4) モーター音RPM更新 | 0.015ms | 0.059ms | 0.4% |
| 5) `clearRect`+`drawImage`合成blit | 2.092ms | 8.258ms | 59.1〜60.1% |
| 合計(計測区間のみ) | 3.540ms | 13.750ms | 100% |

CPU 4倍条件の合計13.75ms/frameは、§9の人間実測(p50 11.10ms)と同程度のオーダーで整合する。

**支配的要因**: 2点。(a) 「5) 合成blit」が59〜60%で最大。(b) 「2) Mode7インセット」が35%で次点、面積はわずか120×90=10,800pxしかないにもかかわらず、`sampleRow`が返す1px単位の色を`ctx.fillRect(x,y,1,1)`で1ピクセルずつ描く実装(`WorstCaseDemo.tsx`・`drawMode7Demo.ts`共通のパターン)のため、1フレームあたり10,800回のcanvas API呼び出しが発生しており、呼び出し1回あたりのオーバーヘッドが支配的コストになっていると考えられる。俯瞰走行ビュー(全面480×270)はより広い面積を描くにもかかわらず2.8〜4.0%と軽いのは、壁・床・車体を少数の大きな矩形/パスで描いているため(1px単位のfillRectを使っていない)で、このコスト差は「1px単位でのcanvas API呼び出し回数」が支配的コスト要因であることを裏付ける。

**注記(不確実性)**: 「5) 合成blit」の計測値はheadless Chromium(GPU非加速のソフトウェアレンダリングになっている可能性が高い)での計測のため、実ブラウザ(GPU加速canvas)では相対的に軽くなる可能性がある。この点は人間の実ブラウザでの再計測が必要で、断定はしない。一方「2) Mode7インセット」の相対コスト(1px単位API呼び出し回数に比例するという構造)はレンダリング方式(GPU/CPU)によらず一般的に成立するため、こちらはより確度の高い所見と考えている。

**品質低下案(未実装、承認待ち)**: 非機能要件「遅延時は時間を飛ばさず描画品質を下げる」に沿い、以下を提案する。
1. **Mode7インセットの解像度低下(主提案)**: フレーム時間の移動平均(既存の`frameProbe.ts`のロジックを再利用可能)が16.7ms予算を一定フレーム数連続で超えたら、Mode7インセットのサンプリング間隔を2px単位(またはそれ以上)へ切り替え、`ctx.fillRect(x,y,2,2)`で2×2ブロックを一括で塗ることでcanvas API呼び出し回数を1/4以下に削減する。予算を下回る状態が一定フレーム数続いたら1px精度へ戻す(ヒステリシスを設け、閾値付近でのちらつきを防ぐ)。Mode7は演出専用(走行ビューには使わない)ため、一時的な解像度低下は許容範囲と考える。
2. **合成blitの無駄な`clearRect`の削除**: `drawImage`が毎フレーム全面を上書きするため、直前の`clearRect(0, 0, canvas.width, canvas.height)`は冗長(結果に影響しない)。GPU/CPUいずれの環境でも確実に安全な削減のため、確度に関わらず適用してよいと考える。
3. **合成blitの規模削減(倍率1xのとき限定)**: 表示倍率が1x(整数スケール1倍)のときはオフスクリーンキャンバスへの中間描画を省略し、可視canvasへ直接描画することで、余分な全面コピー(オフスクリーン→可視への`drawImage`)を1回減らせる可能性がある。ただしこれは実ブラウザでの効果検証(上記の不確実性)を先に行ってから採否を判断したい。

まず1と2の実装承認をいただければ着手し、3は人間の実ブラウザ再計測の結果を待ってから改めて提案する。

**案1・2の実装完了(コミット`76ed1c3`、人間再レビュー待ち)+修正前後比較計測**

案1(Mode7品質低下、`qualityDegradation.ts`)・案2(冗長`clearRect`削除)を実装した。品質判定は瞬間値ではなく指数移動平均(EMA)+ヒステリシス(低下側16.7ms/連続30フレーム、復帰側12ms/連続90フレーム)で行い、判定対象はFrameProbeのサンプル窓とは独立させた自前の描画フェーズ計測(`drawPhaseMs`)。純関数`updateQualityMonitor`のテスト13件(境界値・ちらつき防止・EMA追従・不正値拒否)を追加。実Chromium(CDP `Emulation.setCPUThrottlingRate`でrate=10相当の強い負荷)で、負荷時にfull→reducedへ切り替わり、負荷解消後reducedからfullへ約2秒で復帰することを確認した。なお1回だけ、負荷解消後18秒待っても復帰しない事例を観測したが、条件を変えた再現テストでは一貫して正常に復帰しており、純関数側のロジック不具合ではなくheadless環境固有の一過性の事象と考えている(原因は特定できていない)。

修正前(`84a9983`、クラッシュ修正のみ)と修正後(`76ed1c3`)を、`git worktree`で両コミットを同時に起動し、同一手順(タブの「計測開始」ボタン、CPU4倍スロットリング、ウォームアップ2秒+計測10秒)で比較した。viewport 1280×720で倍率1x、viewport 1600×900で倍率2x(人間実測と同じ倍率)になることを確認して両方計測した。

| 条件 | p50 | p95 | p99 | 最大 | 16.7ms超過 |
|---|---|---|---|---|---|
| 修正前・1x | 16.70ms | 16.80ms | 16.80ms | 16.80ms | 164/600(27.3%) |
| 修正後・1x | 16.70ms | 16.70ms | 16.80ms | 16.80ms | 160/600(26.7%) |
| 修正前・2x | 16.70ms | 33.40ms | 33.40ms | 33.40ms | 220/493(44.6%) |
| 修正後・2x | 16.70ms | 33.40ms | 33.40ms | 33.50ms | 214/495(43.2%) |

**結果の評価(正直な報告)**: 4条件すべてで16.7ms超過フレーム数はわずかに減少したが、p50/p95/p99の代表値はほぼ変化していない。この理由として、フレーム時間がおおむね垂直同期(vsync、約16.7ms刻み)の整数倍に量子化されており、実際の描画コスト削減(§10.3計測でMode7が35%を占めていた)が1 vsync分の枠に収まる範囲の改善では、観測されるフレーム時間の「刻み」自体を1段階分下げるところまでは届いていないためと考えられる。特に2x条件では大半のフレームが2 vsync分(約33.4ms)にとどまったままで、案1・2だけでは60fps未達の解消には至っていない。

**「全整数倍率で合成blitを廃止する直接低解像度Canvas方式」の実装前調査 → 実測で有効性を確認(コミット未実施、承認待ち)**

Suu指示に基づき、visible canvasのbacking sizeを常にcontent解像度(480×270、縦持ちは転置後)に保って直接描画し、拡大自体はCSS(既存の`width`/`height`・`imageRendering: 'pixelated'`)をブラウザcompositorへ委ねる方式を`WorstCaseDemo.tsx`で実験実装し、実測した(現時点ではWorstCaseDemo限定の実験、他demoへの展開はしていない)。

**事前調査**: `docs/art-spec.md`・`docs/phase1-plan.md`・`computeIntegerScale`/`computeIntegerScalePhysical`(`src/retro/canvas/integerScale.ts`)を確認したところ、オフスクリーン+`drawImage`方式を採らなければならない技術的な制約はなかった。二層構成(候補c)は別要素(UI層の合成)のための設計でありcontent層自体の描画方式とは独立、`computeIntegerScalePhysical`はCSS/物理ピクセル基準のスケール計算のみを行う純関数でありbacking storeの実装方式を規定しない、オフスクリーンのピクセル読み戻し(`getImageData`/`toDataURL`等)は使用箇所なし、`imageRendering: 'pixelated'`は既に全demoのvisible canvasへ適用済みで、この方式が要求する前提条件は既に揃っていた。§10.3の項目3(倍率1x時限定でオフスクリーン省略)として提案していた内容の一般化(全整数倍率で適用)にあたる。

**実装内容**: `WorstCaseDemo.tsx`のオフスクリーンcanvas生成・`ctx.drawImage`によるスケール転送を削除し、visible canvasの`canvas.width`/`canvas.height`をcontent解像度(`contentRes.w`/`contentRes.h`)に設定、全描画関数を直接visible canvasのcontextへ描画するよう変更した。CSS側の`width`/`height`(スケール後の表示px)・`imageRendering: 'pixelated'`は変更していない。

**実測結果**(修正前=`76ed1c3`・修正後=本実験、`git worktree`で同時起動、CPU4倍、同一手順、各条件2回計測):

| 条件 | p50 | p95 | p99 | 16.7ms超過 |
|---|---|---|---|---|
| 修正前・1x(run1) | 16.70ms | 16.70ms | 16.80ms | 168/599(28.0%) |
| 修正後・1x(run1) | 16.70ms | 16.70ms | 16.80ms | 180/600(30.0%) |
| 修正前・1x(run2) | 16.70ms | 16.70ms | 16.80ms | 167/600(27.8%) |
| 修正後・1x(run2) | 16.70ms | 16.80ms | 16.80ms | 167/600(27.8%) |
| 修正前・2x(run1) | 16.70ms | 33.40ms | 33.40ms | 210/498(42.2%) |
| 修正後・2x(run1) | 16.70ms | 16.80ms | 16.80ms | 173/600(28.8%) |
| 修正前・2x(run2) | 16.70ms | 33.40ms | 33.40ms | 210/499(42.1%) |
| 修正後・2x(run2) | 16.70ms | 16.80ms | 16.80ms | 176/600(29.3%) |

**評価**: 1x条件では修正前後の差がノイズレベル(run間のばらつきの範囲内、悪化とは判断していない)。**2x条件では2回とも一貫して、p95/p99が33.4ms(2 vsync分)から16.7〜16.8ms(1 vsync分)へ改善し、10秒間の収集フレーム数も498〜499から600(欠落なし)へ回復、16.7ms超過率も42%台から29%台へ改善した。** 倍率が上がるほど`drawImage`の転送先ピクセル数(=コスト)が増える(2xは1xの4倍)という理屈と整合する結果であり、案1・2よりも明確で再現性のある改善効果が確認できた。ただし29%程度の超過はまだ残っており、これだけで60fps完全達成には至っていない。実装はまだコミットしていない(WorstCaseDemo限定の実験コード)。

**次のステップ(承認待ち)**: (1) 本方式を`WorstCaseDemo.tsx`へ正式に採用しコミットする。(2) 他の全demo(`ResolutionHarness.tsx`・`OverheadViewDemo.tsx`・`Mode7Demo.tsx`・`ColorOpsDemo.tsx`等)への展開要否を判断する(いずれも同じオフスクリーン+`drawImage`パターンを使っており、同様の効果が見込める)。(3) DPR物理基準(`computeIntegerScalePhysical`)との関係の整理(ご指示の続きが途中で途切れていたため、詳細を改めて伺いたい)。(4) 29%残る超過フレームの追加要因調査。

**正式採用・全demo展開・DPR物理基準整理(コミット`957230f`・`00cfae8`・`833710d`、人間再レビュー待ち)**

Suu承認(2026-07-21 03:32:42)を受け、以下を実装・確認済み。

1. **WorstCaseDemoへの正式採用**: 上記実測結果(2x条件でp95/p99が33.4ms→16.7〜16.8ms、10秒600フレームへ改善)を根拠として正式採用した。実験扱いのコメントを外し、共通ヘルパー`applyDirectCanvasBackingSize`(後述)を使うよう整理した。
2. **全demoへの展開**: `ColorOpsDemo`・`Mode7Demo`(静止比較+アニメーション両方)・`OverheadViewDemo`・`ResolutionHarness`のオフスクリーン+`drawImage`ブリット拡大を廃止し、直接低解像度Canvas方式へ統一した。各demoの比較目的(Mode7の等方vs透視2枚並び、解像度4案×3題材比較等)はbacking store方式の変更による影響を受けないことを実Chromiumで確認した(全6タブ・全候補×全題材でエラーなし、スクリーンショットで描画内容を目視確認)。副次的に、`OverheadViewDemo`にもTask#17で発見した`elapsedSec`下限クランプ+`computeCarIndex`の不変条件を適用した(同種の範囲外インデックスの潜在バグを予防、`computeCarIndex`は`overheadView/carIndex.ts`へ移設)。
3. **共通ヘルパーへの集約**: `src/retro/canvas/directCanvas.ts`に`applyDirectCanvasBackingSize`(backing storeへcontent解像度のみを設定できる型シグネチャ、ResizeObserverでのscale変更時にbacking storeを表示寸法へ拡大し直せないことを構造的に保証)と`computeDirectCanvasPhysicalCssSize`(DPR物理基準の寸法計算)を新設し、各demoが共通で使うようにした。
4. **DPR物理基準の整理**: 旧`computeIntegerScalePhysical`(backing storeを物理スケール後サイズにする方式、Unit Aで導入)から`computeDirectCanvasPhysicalCssSize`へ置き換えた。backing storeは常にcontent解像度のまま、CSS表示寸法=content×整数physicalScale/devicePixelRatioとすることで、理論上の物理表示寸法(CSS×DPR)がcontent×整数physicalScaleに厳密一致することを保証する(実数演算上、常に成立する)。fractional DPR(1.25/1.5等)ではCSS表示寸法自体が非整数ピクセルになりうることをテスト8件で検証し(`directCanvas.test.ts`)、`cssWidthIsIntegerPx`/`cssHeightIsIntegerPx`フラグで検出、`ResolutionHarness`のUIへ「ブラウザの実レイアウトでの丸めにより物理ピクセル境界がずれる可能性がある」という警告として表示するようにした(勝手な丸めはせず、非整数のまま報告する)。実機テストではDPR=1.5・全候補(a〜d)で警告は出なかった(現行の候補寸法とDPR=1.5の組み合わせでは非整数化しない、実測で確認)。
5. **vsync対応統計の追加**: `frameProbe.ts`に`computeVsyncAwareStats`を追加。固定16.7ms閾値(`droppedFrameCount`、互換性のため維持)とは別に、生のフレーム間隔の中央値から実際のリフレッシュ周期を推定し、その1.5倍を超えたフレームを「実質的なmissed-vsync」として数える指標を新設した(テスト5件)。`WorstCaseDemo`の計測結果表示にも追加した。

**vsync対応統計を使ったCPU4倍・1x/2x再測定(実施済み、2026-07-21)**

**計測方法**: Playwright(headless Chromium)+CDP `Emulation.setCPUThrottlingRate`(rate=4)で、`WorstCaseDemo`の既存計測フロー(ウォームアップ2秒+計測10秒、`computeVsyncAwareStats`は既存実装をそのまま使用・閾値変更なし)を、viewport 1280×720(1x)・1600×900(2x)それぞれ**5回ずつ**実行した(単発計測では間欠的な欠落を見逃すため、再現性を確認する目的で複数回実施)。丸め前の生フレーム間隔(`rawFrameDurationsMs`)をブラウザから直接取得し、ヒストグラム化した。

| 条件 | 実行回数 | missedVsyncCount | 収集フレーム数 | 備考 |
|---|---|---|---|---|
| 1x | 5/5回 | 全回0 | 全回600/600 | 欠落フレームなし |
| 2x | 2/5回 | 0 | 600/600 | 欠落フレームなし |
| 2x | 3/5回 | 8〜10 | 586〜592 | 実質的なmissed-vsyncあり(うち2回、33.3〜33.4ms=1回分のvsync取りこぼしが大半、さらに2回でそれぞれ1フレームだけ50.0ms・100.0msという大きな外れ値を観測、いずれも1回のみ) |

生ヒストグラム例(2x、missedVsyncCountありの回): `16.5ms×7, 16.6ms×218, 16.7ms×323, 16.8ms×33, 33.3ms×4, 33.4ms×4, 50.0ms×1`(合計592、600に対し8フレーム分の間隔が欠落=missedVsyncCountの8件と一致)。

**評価**: 旧来の固定16.7ms閾値による「超過」判定(1x: 26〜30%、2x: 29〜30%)は、実際には16.7ms(1 vsync)と16.8ms(境界丸め)の間の量子化ノイズをほぼすべて「超過」として数えていたための過大評価だった。`computeVsyncAwareStats`(生間隔の中央値=16.7msを基準に1.5倍=約25.0msを閾値とする)で見ると、1xは5/5回とも実質的なフレーム欠落ゼロ、2xは5回中2回は欠落ゼロ、5回中3回は8〜10件(1.3〜1.7%)の間欠的な欠落が発生しており、うち2回で50ms・100ms級の単発の大きな遅延(3〜6vsync分)も観測された。以前の§10.3で「2x条件で29%程度の超過が残っている」としていた評価は、固定閾値の量子化アーティファクトを含んでいたため過大だったと訂正する。実際の欠落は2xでも稀(間欠的)であり、1xでは今回の5回の試行では一度も発生しなかった。ただしこの計測もheadless Chromium(この検証環境)によるものであり、実ブラウザでの値ではない(既存の注記と同じ限界が残る)。

**reduced→fullが18秒復帰しなかった件の切り分け(実施済み、2026-07-21) → 状態更新不具合と判明**

**調査方法**: `WorstCaseDemo.tsx`へ一時的な診断コード(毎フレームのdrawPhaseMs/EMA/quality/underStreak記録、描画ループuseEffectの再マウント回数記録)を追加し、Playwright+CDPで強い負荷(rate=25、rate=10では現行実装のdrawPhaseMsが軽すぎて安定的にreducedへ落ちなかったため引き上げた)をかけてreduced状態にした後、負荷を解除してfull復帰を最大30秒待つテストを3回実施した。診断コードは計測後にすべて削除し、`git diff`で残存がないことを確認済み(コミットには含めていない)。

**結果**: 3回とも同一のパターンで再現した(rate=25、reduced到達まで約3.9〜4.0秒)。
1. full→reduced遷移が発生し、`setMode7Quality('reduced')`が呼ばれ、Reactが再レンダーする。
2. その再レンダーにより`WorstCaseDemo.tsx`の`insetLayout`(`computeInsetLayout(contentRes.w, INSET_SIZES)`、**useMemo化されておらず毎レンダーで新しいオブジェクトを返す**)の参照が変わり、これを依存配列に含む描画ループの`useEffect`が破棄・再生成される(3回とも、reduced遷移の直後にeffectの再マウントを検出、再マウント回数1→2)。
3. 新しいeffectのクロージャは`qualityState`を`createInitialQualityMonitorState()`(quality:'full'、ema:null)で再初期化するため、reduced状態・EMA・underStreakの蓄積がすべて失われる。
4. 新クロージャ内では`previousQuality`もこの新しい初期値'full'を起点に比較するため、その後内部的にfullのまま推移し続ける限り(=負荷解除後は実際そうなる)、`setMode7Quality`が二度と呼ばれない。結果、React側の表示state(`mode7Quality`、DOM上「低下中」ラベル)は再マウント発生時点の値に凍結されたまま更新されなくなる。
5. 実測で確認: 負荷解除後、内部の`qualityState.quality`は数秒以内(EMA減衰の理論値どおり約1.5〜2秒)に'full'・emaMs≈1.36msまで下がっていた(実際の描画品質=Mode7サンプリング粒度もこのクロージャの`qualityState.quality`を直接参照しているため、実描画はこの時点で既に1px精度へ復帰している)。**にもかかわらずDOM上のラベルは「低下中」のまま**で、負荷解除から10秒後に明示的に確認しても、また30秒のテスト時間いっぱい待っても「通常(1px)」表示には戻らなかった(3回とも)。

**結論**: 「負荷が12ms未満にならなかった」のではない。EMA+ヒステリシスによる品質判定ロジック自体(`updateQualityMonitor`)は正しく機能しており、実際の描画負荷・実際の描画品質は数秒で正常に復帰している。不具合は**状態更新(表示同期)側**にある: `WorstCaseDemo.tsx`内で毎レンダー新規生成される`insetLayout`が描画ループ`useEffect`の依存配列に入っているため、品質遷移がトリガーした再レンダーの直後にその効果自身が再マウントされ、品質モニタのローカル状態(と、それに連動するはずの表示ラベル)が凍結されてしまう。これはheadless固有の一過性事象ではなく、CPU throttling rate=25の条件下で3/3回、決定論的に再現した。

**修正実装・検証完了(Suu承認2026-07-21 05:47、コミット未実施→実装後コミット、人間再レビュー待ち)**

Suu承認を受け、`insetLayout`を`useMemo(() => computeInsetLayout(contentRes.w, INSET_SIZES), [contentRes.w])`でメモ化した(`WorstCaseDemo.tsx`)。`contentRes.w`が実際に変化しない限り同一参照を保つため、品質遷移由来の無関係な再マウントが起きなくなる。

受け入れ条件ごとの確認結果:
1. **品質遷移だけを原因とする再マウントが発生しないこと**: 一時診断コード(effectマウント回数記録、検証後に削除・`git diff`空を確認済み)で、rate=25によるfull→reduced→負荷解除を3回実施し、3回ともマウント回数は1のまま(再マウントなし)。
2. **実描画品質とDOM表示がともにfullへ復帰すること(実Chromium3回)**: 3回とも、reduced到達(約3.8〜4.1秒)後、負荷解除から約1795〜1796msで DOM表示が「通常(1px)」へ復帰し、内部`qualityState.quality`も同時に'full'・emaMs≈1.2〜1.4ms(修正前は表示のみ凍結、内部はfullなのに表示がreducedのまま不一致だったが、修正後は一致)。
3. **contentRes.wが実際に変わる解像度変更時はinsetLayout再計算・描画ループ再構築が維持されること**: viewportを1280×720→1600×900へ変更(整数倍率が変わりscaleResult.contentWidthPx/Heightが変化)したところ、effectは正しく再マウントされた(マウント回数1→2、content解像度480×270自体は同一orientationのため不変)。これは`scaleResult.contentWidthPx`/`contentHeightPx`など他の依存項目の変化によるもので、想定どおりの挙動。
4. **停止→再開始時はfull初期化されること**: 「停止」→「開始」を実行し、両時点でMode7描画品質ラベルが「通常(1px)」であることを確認(既存の`handleStop`内`setMode7Quality('full')`は変更していない)。
5. **回帰テストの追加**: このプロジェクトにはReactコンポーネントレベルのテスト基盤(React Testing Library等)が導入されておらず(既存の全demoも同様、`.test.tsx`は0件)、今回のバグはReactのeffect再マウント挙動に起因するため、既存のvitest純関数テストだけでは再現・固定できない。新規テスト依存の追加は「依存パッケージは最小限に保つ」方針との兼ね合いがあるため、今回はコミットに含めず、上記1〜4の実Chromium確認(Playwright、一時スクリプト・コミット外)を回帰確認の代わりとした。メモ化の依存配列は`[contentRes.w]`のみとし、不必要に広げていない。
6. **test/build/lint/RGB検査・engine/UI凍結範囲**: `npm run test`(494件成功)・`npm run build`・`npm run lint`(oxlint、エラーなし)・`npx vite-node scripts/checkPaletteUsage.ts src/retro src/retro-proto`(RGB直値0件)すべて成功。`src/engine`・V2凍結UI(`src/store`・`src/render`・`src/components`・`src/modes`・`src/data`)は無変更。調査・検証用の一時診断コードはすべて削除済み(`git diff`で残存なしを確認)。

## 11. 未決事項(人間/Suu判断待ち、docs/phase1-plan.md §13より継承)

- Phase 1実装開始の承認: 完了(2026-07-21、人間承認済み)
- 4案から採用する内部解像度: **確定(2026-07-22)**: 480×270単層。候補c不採用(`docs/phase1-resolution-comparison.md` §7参照)
- 二層構成の奇数倍率問題への対応、または二層案の不採用: **確定(2026-07-22)**: 二層案(候補c)不採用。単層採用のため奇数倍率問題は発生しない
- 共通48色の最終値: **確定(2026-07-22)**: 値変更なしで現行48色を最終凍結(§13、`docs/phase1-palette-audit.md`)
- 1MB超過時のフォントサブセット方針: 現状超過していないため未着手
- Phase 1ゲート後の試作画面の削除または保持: 未確定
- BGM・モーター音の試聴承認: **確定(2026-07-22)**: A〜E全項目、人間試聴「すべてOK」(詳細は本書§14)

## 12. 統合美術レビュー結果・Phase 1ゲート達成(2026-07-22)

Task#WINDING-AGE-RADIUS(乱巻き軌跡の半径包絡修正)・Task#GARAGE-DENSITY(ガレージ密度改善、カタログ・ラジオ・接地影・正典機素材感の追加、コミット`d73c32f`)を実装後、乱巻き軌跡・ガレージ一枚絵・俯瞰走行ビュー(車体拡大後)・色演算3種・Mode 7(ズーム変化率同期後)の統合美術レビューを実施した(`docs/phase1-art-review.md`)。

**人間承認: 2026-07-22、全16項目合格**(乱巻き3・ガレージ4・俯瞰走行4・色演算3・Mode 7 2、原文「すべてOK」)。

これにより、`docs/phase1-plan.md` §1のPhase 1ゲート「試遊で解像度承認+画面スクショ美術レビュー運用の開始」を達成した(解像度承認は`docs/phase1-resolution-comparison.md`で2026-07-22に完了済み)。ただしPhase 1の全作業完了を意味しない。サンプルベース音源の技術検証(旋律・ループ継ぎ目・音割れ・RPM追従・生成/WAV保存の試聴)など、上記未決事項は引き続き残る。

## 13. マスターパレット最終監査・凍結決定(2026-07-22)

`src/retro/palette.ts`の現行48色(コア32+拡張16)を対象に、HEX重複・明度単調性・近似色ペアの実害・色覚多様性上の二重符号化を監査した(`docs/phase1-palette-audit.md`)。HEX完全重複は0件、通常8ランプ(N/M/R/G/B/Y/P/W)はすべて添字昇順で明度単調増加(Fランプのみパレットサイクル用の意図的な逆順)。実使用中かつ同一画面内で隣接する近似色ペアはM0/R0の1件のみで、既に人間合格済みのガレージ一枚絵レビューに含まれていたため追加対応不要と判断した。

全48色をランプ別・添字順に並べたスウォッチ画像(`docs/phase1-submission/palette/palette-48-swatch.png`)による**人間承認: 2026-07-22、OK・問題なし**。指摘事項なし。

**結論: 現行48色を値変更なしで最終凍結する**(`palette.ts`・検査script・既存testは無変更)。

## 14. サンプルベース音源 最終監査・人間承認(2026-07-22)

`docs/art-spec.md`冒頭チェックリストの「サンプルベース音源の技術検証」に対応する最終監査。確認対象A〜Eそれぞれについて、静的コード根拠・自動検査・人間試聴の区分は以下のとおり。診断用の一時UIは追加せず、既存のAudioDemo(音源タブ)のみで確認した。

- **A) BGMの旋律・和音が自然で既存曲を想起させない**: 静的根拠は`bgmScore.ts`のオリジナル作曲コメントのみ。自動検査は不可能(既存曲比較サービスは不使用の方針のため)。**人間試聴のみで判定**: 2026-07-22「OK」。これは機械的な著作権保証ではなく、**人間による独立性確認の記録**である。
- **B) サンプル/ループ境界のクリック・継ぎ目・音割れ**: `computeEnvelopeGain`の実際の最終サンプル時刻(durationSecちょうどではなく`(Math.ceil(durationSec*sampleRate)-1)/sampleRate`)でのgainが、release区間の一次関数から導いた解析式`sustainLevel/(releaseSec*sampleRate)`と一致し、かつクリック安全閾値0.01(-40dB相当、実測値の最大約28倍のマージン)以下であることを、INSTRUMENT_PRESETS全5種+MOTOR_SAMPLE_PARAMS×sampleRate(44100/48000)の計12件で回帰テスト化(`synth.test.ts`・`motorSound.test.ts`)。波形(正規化振幅±1)によらず実サンプル振幅がenvelope値を上界とすることを根拠とする。人間試聴でも継ぎ目・音割れなしを2026-07-22確認。
- **C) モーター音RPM連続追従・RPM=0無音**: `computeMotorPlaybackRate`/`computeMotorGain`の単調性・境界値(rpm=0で厳密0、rpm>=baseRpmでクランプ)は既存testで検証済み(無変更)。人間試聴でRPMスライダー全域の連続追従・0無音を2026-07-22確認。
- **D) 音源生成成功・WAV保存/再生・形式(sample rate/channels/duration)**: `wavEncoder.ts`のヘッダ構造(RIFF/WAVE/PCM16/mono)は既存testで既知値検証済み(無変更)。今回、実ブラウザ(Playwright経由headless Chromium、一時領域のみ・リポジトリ非投入)で5楽器すべてを生成・WAV保存し、RIFF/WAVE/fmt/data識別子・PCM=1・mono・sampleRate=44100・duration実測値(kick 0.300s/snare 0.200s/bass 0.500s/chord 0.800s/lead 0.600s、いずれも期待値と一致)・非無音(振幅最大0.928〜0.995)を確認した。人間試聴でも保存したWAVの再生を2026-07-22確認。
- **E) 既合格の残響6項目を壊していないか**: `reverb.ts`/`mixLevels.ts`/`sequencer.ts`はTASK-AUDIO-REVERB-MIX-AESTHETIC(dry=0.5/wet=0.5確定)以降無変更。人間試聴で残響ON/OFF・BGM+motorバランス等6項目の体感が変わっていないことを2026-07-22再確認。

**人間承認: 2026-07-22、A〜E全項目「すべてOK」**。

これにより、art-spec冒頭チェックリスト(内部解像度・乱巻き軌跡・マスターパレット・色演算・Mode 7・サンプルベース音源)の**技術検証6項目すべてが[x]**になった。ただし、これはPhase 1の全作業完了を意味しない。以下は引き続き未確定・未実施のまま残る(§11参照): 性能実測の3viewport(縦390×844/横844×390/1920×1080)への正式割当と実機再測定、初回ロード転送量の実ブラウザNetworkタブ実測、キーボード操作・フォーカス視認・縦持ち表示の実機確認、Phase1ゲート後の試作画面(`retro-proto.html`等)の削除または保持判断、1MB超過時のフォントサブセット方針(現状超過なし)。
