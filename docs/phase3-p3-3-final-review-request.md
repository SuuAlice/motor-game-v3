# P3-3正式Fable最終レビュー依頼

作成: alice_mot3(2026-08-11)。人間プロジェクトリードへ: 本書はP3-3(D02〈コイル焼損〉+D05〈異常ブラシ火花〉+D01漸減〈P3-1-Q1返済〉+ブラシ素材写像+Gate6〈store fixture統合〉)の実装完了に伴う、正式Fable最終レビューの依頼文です。**本書自体は正式Fable名義の回答ではなく、alice_mot3が作成した依頼文+実施報告です。** Fableの回答は、人間プロジェクトリードの直接提示、またはSuu_mot3が中継したものだけを正式回答として扱ってください(CLAUDE.md/AGENTS.md pitfalls#1)。

## 読む順序

1. **`docs/phase3-p3-3-implementation-report.md`**(本レビューの起点。承認経路・人間再承認13件+追補1件・Gate0〜7完了サマリ・各Fable裁定への実装対応表〈Q1〜Q15+D01補足裁定〉・全変更ファイルと非対象境界・最終較正値一覧・D01/D02/D05 sweep実測全文・NORMAL_OPERATION 15組合せ表全文・P3-0-Q6不変条件・Gate6実装内容+P60〜P64是正史・既知の非配線事項・全テスト/build/lint/cmp/diff証跡・後続申し送り8項目・commit候補allow-list全ファイルを自己完結で記載)。
2. `docs/phase3-p3-3-plan.md`(v17、承認済み詳細計画。13.2.1節にGate6完了記録〈P60〜P64是正史〉。実装報告の内容に疑義がある場合の一次資料)。
3. `docs/phase3-p3-3-human-reapproval-bundle.md`(人間再承認バンドル13項目+追補1件〈Q15-4〉の原文。いずれも人間承認済み)。
4. `docs/phase3-p3-3-fable-review-request.md`(正式Fable技術レビュー依頼、v6提出時点)。
5. `docs/phase3-p3-3-fable-supplementary-review-request-q15.md`(Q15補足レビュー依頼)。
6. `docs/phase3-p3-3-checkpoint5-fable-review-request.md`(checkpoint5較正sweep完了に伴う正式Fable較正レビュー依頼)。
7. `docs/phase3-p3-3-checkpoint5-fable-review.md`(**正式Fable回答原文**、人間プロジェクトリード直接提示・Suu_mot3中継確認済み、D02・D05共通・ブラシ8値の採用確定+付帯条件3点)。
8. `docs/phase3-p3-3-checkpoint5-implementation-report.md`(Gate0〜5時点の中間実施報告)。
9. `docs/phase3-p3-3-d01-supplementary-review-request.md`(D01補足レビュー依頼、実測全文・harness再現情報)。
10. `docs/phase3-p3-3-d01-fable-response.md`(**正式Fable回答原文**、D01較正確定・受け入れ条件3→3′・条件1→1′改訂)。
11. `docs/phase3-p3-3-d01-fable-submission-message.md`(D01補足レビュー依頼の提出経路記録。正式回答そのものではなく、提出時のagmsg送付文面の記録として参考添付)。
12. `docs/phase3-plan-v12-amendments.md`(裁定台帳。P3-3-Q1〜Q15・P3-3-D01較正確定・改訂12〈Gate6完了記録〉)。
13. `docs/phase3-p3-3-fable-final-review.md`(**正式Fable最終レビュー回答原文**、人間プロジェクトリード直接提示・Suu_mot3中継確認済み、2026-08-10。commit可・p3-3-completeタグ付与可の承認、発効条件1点+申し送り追記2点)。

長い証跡(sweep実測・15組合せ表・テスト出力全文・Gate6是正史)は上記1のみに集約しており、本書では再掲していません。

**アップロード前提**: 下記「補足」の「本依頼文+実施報告の2点で足りる」という記載は、**Fable側が計画v17・裁定台帳・過去の正式技術レビュー・補足裁定・人間再承認バンドルを同一レビューthreadで既に保持している場合に限り成立します。** 新規threadへ提出する場合は、上記読む順序2〜12の文書も併せてアップロードしてください(特に7・10は正式Fable回答原文であり、新規threadでは省略しないこと)。

## Fableへ求める判定

1. **裁定充足の確認**: `docs/phase3-p3-3-implementation-report.md` §4(各Fable裁定への実装対応表)に基づき、Q1〜Q14・Q15-1〜Q15-7・D01較正確定の全裁定が実装により正しく充足されているか。
2. **較正値の確定(再確認)**: §6(最終較正値一覧、計20項目)に基づき、正式Fable較正レビュー(2026-08-10)+補足裁定(2026-08-11)で確定済みの値が、Gate6実装(§10)を経ても変更されていないことの確認。Gate6のtest fixture構築(§10.2、P60〜P64是正史)は較正値そのものを一切変更せず、production-validなfixture構成(motor/car/course/初期動的状態/実行時間/rng+`composeConfigFromMaterials`起点の素材選択)のみで到達したことの妥当性確認。
3. **Gate6設計判断の確認**: §10.3(副次的発見)で報告した、D02/D05のneodymium選択によりD07(磁石減磁、非終端)が過負荷の相関効果として共起する設計判断が適切か。D02/D05固有のassertion(terminalModes・event直接確認・degradationDiffs)がD07共起によって損なわれていないことの確認。
4. **commit可否**: §5(全変更ファイルと非対象境界)・§14(commit候補範囲と無関係差分の除外)に基づき、P3-3(Gate0〜7)の実装をcommitしてよいか。
5. **P3-4/Phase5申し送りの妥当性確認**: §13(後続ステップ/フェーズへの申し送り、8項目)に基づき、不足・誤りがないか。

**(2026-08-10追記)**: 上記5項目の判定は`docs/phase3-p3-3-fable-final-review.md`にて全て承認済み(commit可・p3-3-completeタグ付与可)。判定5では申し送りへ9項目目(P3-2-Q9裁定)の追加とP3-4計画起草者への統合参照義務の明記を指示され、`docs/phase3-p3-3-implementation-report.md` §13へ反映済み。判定1では付帯条件2(temperature規約)のGate7 1行確認を指示され、同報告§12へ反映済み。

## 補足

- production向け`DestructionConfig`の実配線・人間試遊はP3-0-Q2裁定どおりP3-4まで行っていません(実施報告§11「既知の非配線事項」)。
- `src/engine/vehiclePhysics.ts`・`src/engine/trackPhysics.ts`は本フェーズを通じて完全無編集です。
- Gate6(store fixture統合)は新規productionコードを一切追加していません(store層はP3-0で全モード汎用対応済み)。
- テスト全出力・build/lint/cmp/diff証跡は実施報告ファイル§12に実出力全文で保存済みのため、**上記「アップロード前提」の条件を満たすなら**、人間プロジェクトリードは本依頼文+実施報告ファイルの2点をアップロードいただければ足ります。条件を満たさない新規threadの場合は、上記「読む順序」の2〜12も併せてアップロードしてください。
