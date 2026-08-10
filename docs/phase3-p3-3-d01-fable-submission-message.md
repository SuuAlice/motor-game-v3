# Fable補足レビュー依頼: P3-3 D01較正

P3-3 checkpoint 5較正レビューで追加指示されたD01 sweepの結果、現行値`decayExposureScaleRad=1000`・`minEffectiveTurnsRatio=0.5`はfloor到達可能性を満たしませんでした。値は変更せず、Gate 6前で停止しています。

実測全文・完全なharness再現情報・候補値比較は、次の別添資料にまとめています。

- `docs/phase3-p3-3-d01-supplementary-review-request.md`
- 参照: `docs/phase3-p3-3-checkpoint5-implementation-report.md`
- 参照: `docs/phase3-p3-3-plan.md` v15

要点:

- 現行scale 1000は4構成すべてで40秒以内にfloorへ到達せず、ratio 0.707〜0.923で自己制限しました。
- 観測可能性は充足し、ratio 0.75で定常RPMが30.4〜100%低下しました。
- NORMAL_OPERATION 15組合せではD01非トリガを維持しています。
- scale 200はfloorへ到達しますが、崩壊後1.30秒であり「1秒未満禁止」は満たす一方、「目安2秒以上」には届きません。
- 付帯条件3件は反映済みで、69ファイル／1405テスト、build、lint、`cmp AGENTS.md CLAUDE.md`、`git diff --check`が成功しています。

次を裁定してください。

1. scale 200を確定候補として採用できるか。それとも2秒目安を満たす別値の追加探索が必要か。
2. motor-only無負荷で生じた自己制限を意図挙動として受容するか。vehicle/track文脈の追加sweepが必要か。
3. `minEffectiveTurnsRatio=0.5`を維持するか。floor到達可能性の解釈またはモデルを見直す必要があるか。
4. 裁定反映後にGate 6を解禁できる条件、Fable再提出要否、人間再承認要否。

正式回答が届くまで、D01値変更・Gate 6・commit・tag・pushを停止します。正式回答はpitfalls#1どおり、人間プロジェクトリードの直接提示、またはSuu_mot3の中継だけを正として扱います。
