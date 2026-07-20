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
| (本コミット) | Unit H修正: 縦持ち転置・メモリ計測窓・GC検出・停止状態管理・タブa11y・本書新設 |

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

- `npm run test`: 44ファイル・424テスト成功(既存V2由来206テスト含む、無変更)
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

## 6. 人間レビュー待ち項目(Phase 1ゲートまで追跡、実測値は未取得のまま明記)

1. 4案×3題材(解像度比較タブ)の無加工スクリーンショット取得、比較表・推奨案の最終判断
2. 乱巻きの可読性と整数化による角張りの評価
3. ガレージ一枚絵の描き込み密度の評価
4. 検死レポート(PixelMplus10/12+セグメント風数値)の可読性
5. 俯瞰走行ビュー: 壁・コーナーの可読性、16方位スナップでコーナリングが滑らかに見えるか
6. 色演算(発光・煙・夕景)の演算あり/なし/市松ディザの見た目比較・妥当性判断
7. Mode7透視ズームの見た目の妥当性
8. BGMの旋律・和音・音長・ループ境界の試聴確認、既存曲を想起させないことの確認
9. サンプルループ部の継ぎ目・音割れの有無
10. 残響ON/OFFの差の確認
11. モーター音のRPM追従・RPM=0無音化の試聴確認
12. ブラウザでの音源生成・WAV保存動作の実地確認
13. 性能実測: 縦390×844/横844×390/1920×1080×Chrome CPU4倍スロットリングでのp50/p95/p99/最大・16.7ms超過フレーム数・メモリ推移・GCらしき下降(WorstCaseDemoタブで計測手段は提供済み、数値は未取得)
14. 初回ロード転送量の実ブラウザNetworkタブでの実測(ビルド成果物からの計算値は上記§4のとおり提示済み)
15. キーボード操作・フォーカス視認・縦持ち表示の実機確認
16. 4案からの内部解像度確定、二層構成(候補c)の奇数倍率問題への対応方針、共通48色の最終値、1MB超過時のフォントサブセット方針(現状は超過していない計算だが最終判断は人間)、Phase1ゲート後の試作画面(`retro-proto.html`/`src/retro-proto/`)の削除または保持

## 7. 未決事項(人間/Suu判断待ち、docs/phase1-plan.md §13より継承)

- Phase 1実装開始の承認: 完了(2026-07-21、人間承認済み)
- 4案から採用する内部解像度: 未確定(上記§6-1)
- 二層構成の奇数倍率問題への対応、または二層案の不採用: 未確定(Unit Aの提案あり)
- 共通48色の最終値: 未確定(現行値はart-spec §3の初期提案のまま)
- 1MB超過時のフォントサブセット方針: 現状超過していないため未着手
- Phase 1ゲート後の試作画面の削除または保持: 未確定
- BGM・モーター音の試聴承認: 未実施
