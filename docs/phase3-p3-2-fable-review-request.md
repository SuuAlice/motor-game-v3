# Fableレビュー依頼: P3-2詳細実装計画v5

Phase 3のP3-2(D04リポ破壊経路・D07三段開示骨格・test-run/store fixture統合)について、実装前の技術レビューをお願いします。

## 提出資料

- `docs/phase3-p3-2-plan.md` v5全文(自己完結full-text版、本レビューの主資料)
- `docs/spec.md`、特に§2・§5.2・§7.1.1・§7.3〜§7.5・§12
- `docs/phase3-plan-v12.md`
- `docs/phase3-plan-v12-amendments.md`
- `docs/phase3-p3-1-plan.md`およびP3-1完了時の申し送り

旧版v1〜v4との差分レビューではなく、`docs/phase3-p3-2-plan.md` v5全文を現行計画として判定してください。v5は旧版本文への差分参照を持ちません。

## 現在の状態

- Suu_mot3による計画レビュー・最終照合: 通過
- production/test編集: 未着手
- commit・tag・push: 未実施
- production向け`DestructionConfig`配線と人間試遊: P3-0-Q2裁定どおりP3-4まで行わない

## 必須回答

1. 総合判定を、承認・条件付き承認・要修正のいずれかで示してください。
2. 計画§7のQ1〜Q12をすべて裁定してください。特にD04の原因記録、D07の熱モデル、`RunSnapshot`拡張、regressionDiff、D01漸減の返済先を未回答のまま残さないでください。
3. 計画§13の契約変更について、人間再承認が必要な項目を確定してください。
4. D04/D07状態機械、終端/非終端、反復event防止、`physicsSnapshotAtT`、P3-0-Q6ホワイトリスト、恒久劣化差分の整合を判定してください。
5. P3-1からの申し送り6点を満たすか確認してください。
   - `stepTestRunWithDestruction`と到達可能な全`endReason`
   - wrapperの`RunSnapshot`唯一出典と非自明なリプレイ等価性
   - `DURATION_COMPARISON_EPSILON_S`の再利用
   - D04のM4到達可能性条件と3種sweep
   - D04膨張・発煙のみでは終端しない負例
   - D04途中段階終了時の非恒久簡約と記録/UI整合
6. §10のDoDと§11のサブステップ分割が、各サブステップを独立レビューできる十分な内容か判定してください。

## 重点確認事項

- D04の開始原因とburning到達時の混合原因を両立して記録するQ4案(a)/(b)
- `affectedRoles`重複防止をvalidator拒否またはevent組立時Set化のどちらで担保するか
- D04磁石延焼とD07減磁を同一の`WearState.demagnetizationFraction`へ合流させ、独立した架空性能指標を作らないQ5設計
- D07の熱ゲージを不可逆到達後も更新し、event/causeLogのみ再発行しない設計
- `composeEffectiveMotorConfig`が`RunSnapshot`内の`DestructionConfig`を係数の唯一の出典として使うこと
- `initiatingCauseLog`を含むunknown復元時の深いvalidatorとstage/cause交差不変条件

修正が必要な場合は、実装開始を妨げる必須修正と、実装ステップ内で満たせる付帯条件を分けてください。計画修正が指示どおりならFable再提出が必要かどうかも明記してください。

レビュー完了後も、Fable裁定の計画反映・Suu_mot3照合・必要な人間再承認が終わるまで実装は開始しません。
