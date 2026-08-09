# P3-2正式Fable最終レビュー依頼

作成: alice_mot3(2026-08-09)。人間プロジェクトリードへ: 本書はP3-2(D04〈リポ経路〉+D07〈三段開示骨格〉+store統合)の実装完了に伴う、正式Fable最終レビューの依頼文です。**本書自体は正式Fable名義の回答ではなく、alice_mot3が作成した依頼文+実施報告です。** Fableの回答は、人間プロジェクトリードの直接提示、またはSuu_mot3が中継したものだけを正式回答として扱ってください(CLAUDE.md/AGENTS.md pitfalls#1)。

## 読む順序

1. **`docs/phase3-p3-2-implementation-report.md`**(本レビューの起点。承認経路・人間再承認7件・Gate0〜9完了サマリ・全変更ファイルと非対象境界・各裁定への実装対応表・最終較正値一覧・D04/D07 sweep実測全文・Q13/Q14の15組合せ表全文・P3-0-Q6不変条件・全テスト/build/lint/cmp/diff証跡〈実出力全文〉・bundle差分・既知の非配線事項・後続申し送り・commit候補範囲を自己完結で記載)。
2. `docs/phase3-p3-2-plan.md`(v18、承認済み詳細計画。実装報告の内容に疑義がある場合の一次資料)。
3. `docs/phase3-plan-v12-amendments.md`(裁定台帳。P3-2-Q1〜Q12・P3-2-Q13-1・P3-2-Q13-2の各エントリ+「実装状態追補」節の「Gate9追記」ブロック)。
4. `docs/phase3-p3-2-fable-review.md`(正式Fable技術レビュー、2026-08-08、条件付き承認の原文)。
5. `docs/phase3-p3-2-human-reapproval-bundle.md`(人間再承認バンドル6項目の原文)。
6. Q13-1〜Q13-3・Q14の裁定記録(`docs/phase3-p3-2-plan.md` 14節に自己完結記載、原文はagmsg履歴・Suu_mot3中継記録)。

長い証跡(sweep実測・15組合せ表・テスト出力全文)は上記1のみに集約しており、本書では再掲していません。

**アップロード前提(G9-R9是正、明記)**: 下記「補足」の「本依頼文+実施報告の2点で足りる」という記載は、**Fable側が計画v18・裁定台帳・正式技術レビュー・人間再承認バンドルを同一レビューthreadで既に保持している場合に限り成立します。** 新規threadへ提出する場合は、上記読む順序2〜5の文書(`docs/phase3-p3-2-plan.md`・`docs/phase3-plan-v12-amendments.md`・`docs/phase3-p3-2-fable-review.md`・`docs/phase3-p3-2-human-reapproval-bundle.md`)も併せてアップロードしてください。Q13/Q14原文は`docs/phase3-p3-2-plan.md` 14節に自己完結化済みのため、計画書の添付で代替できます(個別に探す必要はありません)。

## Fableへ求める判定

1. **commit可否**: `docs/phase3-p3-2-implementation-report.md` §5(全変更ファイルと非対象境界)・§13(commit候補範囲と無関係差分の除外)に基づき、P3-2の実装をcommitしてよいか。
2. **較正値の確定**: §6(最終較正値一覧)・§7(D04/D07 sweep実測全文)・§8(Q13-2/Q14の15組合せ表全文)に基づき、設計候補値(`internalResistanceDegradationMultiplier`=1.5、`reversibleDroopMultiplier`=0.95、`demagnetizationDeltaFraction`=0.10、`magnetScorchDeltaFraction`=0.15、`bodyScorchDeltaFraction`=0.2、D04`stageDurations`={0.35,0.25}、D07`thermal`={0.25,0.5}等)を最終値として確定してよいか、追加のsweep・裁定が必要か。
3. **裁定充足の確認**: §4(各Fable裁定への実装対応表)に基づき、Q1〜Q12・Q13-1・Q13-2/Q14の全裁定が実装により正しく充足されているか。
4. **後続申し送りの妥当性確認**: §12(後続ステップ/フェーズへの申し送り)に基づき、P3-3/P3-4/Phase5への申し送り事項に不足・誤りがないか。

## 補足

- production向け`DestructionConfig`の実配線・人間試遊はP3-0-Q2裁定どおりP3-4まで行っていません(実施報告§10「既知の非配線事項」)。
- `src/engine/vehiclePhysics.ts`は本フェーズを通じて完全無編集です。
- テスト全出力・build/lint/cmp/diff証跡は実施報告ファイル§11に実出力全文で保存済みのため、**上記「アップロード前提」の条件(Fableが既存threadでv18・台帳・正式レビュー・再承認バンドルを保持している場合)を満たすなら**、人間プロジェクトリードは本依頼文+実施報告ファイルの2点をアップロードいただければ足ります。条件を満たさない新規threadの場合は、上記「読む順序」の2〜5も併せてアップロードしてください。
