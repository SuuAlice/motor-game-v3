# Fableレビュー依頼: P3-3 checkpoint 5（統合較正閉包）

P3-3のGate 0〜5実装とcheckpoint 5較正sweepについて、候補値の確定可否およびGate 6解禁可否の技術レビューをお願いします。

## 主資料

- `docs/phase3-p3-3-checkpoint5-implementation-report.md`（実施報告・実測全文・検証結果）
- `docs/phase3-p3-3-plan.md` v15（現行の自己完結計画）
- `docs/phase3-plan-v12-amendments.md`（確定裁定台帳）

正典は`docs/spec.md` r3および`docs/art-spec.md` r3です。実施報告へ全コマンド出力を重複転載せず、数値・表・変更範囲・検証結果をまとめています。

## 現在地

- Gate 0〜5（D01漸減、D02、D05、ブラシ素材写像、統合較正閉包）: 実装・Suu_mot3照合済み
- 検証: 69ファイル／1404テスト成功、build・lint・`cmp AGENTS.md CLAUDE.md`・`git diff --check`成功
- Gate 6（store fixture統合）以降: 未着手
- commit・tag・push: 未実施
- production向け`DestructionConfig`・gameStore・UI配線・人間試遊: P3-0-Q2裁定どおりP3-4まで未実施

## 判定依頼

1. 実施報告§3・§4の較正候補値について、採用・追加sweep・修正のいずれかを値群ごとに判定してください。
   - D01: `decayExposureScaleRad=1000`、`minEffectiveTurnsRatio=0.5`（値の大きさを支持する実測なし）
   - D02: `conductionScale=0.04`、`dissipationCoefficient=0.5`、既存`smokeResistanceMultiplier=1.2`
   - D05共通5値
   - ブラシ素材8値（Q15-2/Q15-3裁定済み候補。うち銀黒鉛contact値と貴金属chatter値は個別sweepなし）
2. checkpoint 5の実測範囲が較正完了証跡として十分か、不足するsweepがあれば具体的に指示してください。
3. Gate 6へ進んでよいか、候補値の確定および人間承認との順序を含めて判定してください。
4. 修正が必要な場合は、次を分けてください。
   - Gate 6開始を妨げる必須修正
   - 実装ゲート内で満たせる付帯条件
   - 人間再承認を要する契約・較正値
   - 推奨事項（条件ではないもの）
5. 指示どおり反映した場合、Fable再提出が必要か、Suu_mot3照合のみで進められるかを明記してください。

## 停止条件

正式Fable回答と必要な人間承認が完了するまで、Gate 6・追加production/test編集・commit・tag・pushを停止します。

本依頼書と実施報告はFable回答そのものではありません。正式回答はpitfalls#1どおり、人間プロジェクトリードの直接提示、またはSuu_mot3による中継だけを正式なものとして扱います。
