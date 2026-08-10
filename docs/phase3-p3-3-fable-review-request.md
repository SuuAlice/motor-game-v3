# Fableレビュー依頼: P3-3詳細実装計画v6

Phase 3のP3-3(D02コイル発煙・焼損、D05異常ブラシ火花、P3-1から繰り越したD01漸減、ブラシ素材写像)について、実装前の技術レビューをお願いします。

## 提出資料

- `docs/phase3-p3-3-plan.md` v6全文(自己完結full-text版、本レビューの主資料)
- `docs/spec.md` r3、特に§2・§4.2・§7.1.1・§7.3〜§7.5・§12
- `docs/art-spec.md` r3、特にHUD・症状表示・12fps格子の規約
- `docs/phase3-plan-v12.md`
- `docs/phase3-plan-v12-amendments.md`
- `docs/phase3-p3-2-plan.md`および`docs/phase3-p3-2-implementation-report.md`

旧版v1〜v5との差分レビューではなく、`docs/phase3-p3-3-plan.md` v6全文を現行計画として判定してください。v6は旧版本文への継続参照を持たず、実コード実査・依存閉包・候補比較・DoD・ゲート分割を本文内に収録しています。

## 現在の状態

- P3-2: commit `3fa3068`・tag `p3-2-complete`で完了
- spec/art-spec r3: commit `82ccdac`で反映済み
- Suu_mot3によるP3-3計画レビュー: 5ラウンド47件を反映し、v6最終照合通過
- production/test編集: 未着手
- commit・tag・push: 未実施
- production向け`DestructionConfig`・gameStore・UI配線と人間試遊: P3-0-Q2裁定どおりP3-4まで行わない

## 必須回答

1. 総合判定を、承認・条件付き承認・要修正のいずれかで示してください。
2. 計画§15.1のP3-3-Q1〜Q14を、未回答を残さずすべて裁定してください。
3. 計画§15.2の公開型・契約変更について、人間再承認が必要な項目を確定してください。
4. D01/D02/D05の状態機械、終端/非終端、反復event、`physicsSnapshotAtT`、CauseLog、恒久劣化差分、P3-0-Q6ホワイトリストの整合を判定してください。
5. D01漸減がP3-1-Q1の返済条件を満たすか、D02/D05がPhase 3レビューC5の残余負例を満たすか確認してください。
6. 計画§12のDoDと§13のゲート分割が、各ゲートを独立レビューでき、途中状態でも型検査とP3-0-Q6不変条件を破らない構成か判定してください。
7. 較正値候補はsweep開始値として妥当か、確定に必要な受け入れ条件に不足がないか判定してください。値の根拠が不足する場合は、暫定値の発明ではなく必要なsweep条件を指示してください。

## Q1〜Q14の裁定対象

1. **Q1 D02熱ゲージ駆動式**: `computeRCoil`と同じ実効抵抗から得る`coilLossW = I²R`を`DestructionFrameInput`へ渡し、伝導・放散で0〜1ゲージを進める設計。
2. **Q2 D02発煙抵抗倍率**: 発煙開始後の`R_coil`悪化を単一固定倍率とするか、ゲージ進行比例とするか。計画推奨は単一固定倍率。
3. **Q3 D05摩耗換算経路**: `D05Progress.cumulativeWearDeltaFraction`へ連続量を保持し、final stateから`deriveDegradationDiffs`が差分化する案。
4. **Q4 D01進行量**: `angularVelocityRadS`と既存`COIL_DEFORM_OMEGA`の超過分をrad単位で積分する案。
5. **Q5 D01漸減の物理表現**: `effectiveTurnsRatio`を実効巻数・占積の単一磁気結合率として導入し、振動増は既存`coilCollapsePenaltyMm`へ一本化する案。二重計上防止も含む。
6. **Q6 ブラシ写像の2層分離**: 通常物理用の接触抵抗・チャタリング倍率を`MotorConfig`へ、破壊進行・高電流非線形・摩耗量を`DestructionConfig.d05`へ置く設計。
7. **Q7 D05一時接触抵抗悪化**: チャタリングバースト終了後の有限回復区間を`recoveryFramesLeft`で表し、新規バーストを優先して回復区間をリセットする案。
8. **Q8 D02発煙の可逆性**: 完全可逆、不可逆latch、表示可逆+損傷latchの3案。計画推奨は`smokingStarted`/`smokingStartedAtT`を持つ不可逆latch。完全可逆/ハイブリッドを選ぶ場合のUI入力経路も、configをUIへ渡す案とwrapper/storeがbooleanを公開する案から裁定してください。
9. **Q9 D05 CauseLog**: 共通`currentA`は実電流0のまま保持し、`theoreticalCurrentA`を追加して遮断電流を正直に記録する案。
10. **Q10 recipe/material契約**: ブラシ物理キー`bcr`/`bpr`追加、既存MC3版維持、`MaterialSelection.brushId`必須化。
11. **Q11 brush wearの次run反映時期**: P3-3は差分生成までとし、D02/D04/D05/D07共通のWearState→base config配線はP3-4へ据え置く案。
12. **Q12 effectiveTurnsRatioの3契約**: `MotorConfig`の通常のoptionalフィールドにする一方、RunSnapshotのbase configだけは`undefined`または1に限定し、recipeへは符号化しない設計。
13. **Q13 D05共通config構築**: `mapD05BrushWearConfig`の素材別部分と共通較正値を`assembleD05Config`で単一構築し、戻り値型でフィールド欠落を検出する案。
14. **Q14 encodeRecipeの静かな脱落防止**: Result型化、base専用型、戻り値`string`維持+非1の`effectiveTurnsRatio`でthrow、規約のみの4案。計画推奨は成功系19呼出しを壊さない`string`維持+throw。

## 重点確認事項

- D02の熱式が既存`computeRCoil`/実効configと同じ値を使い、別の抵抗式を発明していないこと。
- 発煙中の`R_coil`悪化による`I²R`変化を、単純な正帰還と断定せず連成物理で再計算すること。
- D02発煙のみではeventもterminalMode候補も増えず、焼損到達時だけD02 eventを1回発行すること。
- D05は`isChatteringThisFrame && theoreticalCurrentA超過`時だけ積算し、通常整流火花を除外すること。
- D05のepisodeは反復eventを許しつつ、図鑑初回性だけを`isFirstThisSession`で分離し、常に非終端であること。
- D05のチャタリングstepでは実電流0、強度は理論遮断電流という二量をCauseLogで混同しないこと。
- D01の`effectiveTurnsRatio`が逆起電力・磁気トルクへ同じ倍率として効き、axisOffset/振動経路と二重計上しないこと。
- `composeEffectiveMotorConfig`がRunSnapshotを唯一の構成情報源とし、予算分母を変えず、非自明なD01+D02+D05経路でもリプレイ等価であること。
- `DURATION_COMPARISON_EPSILON_S`をD05 duration境界でも再利用し、物理dt=1/120秒を変更しないこと。
- `restoreRunSnapshot`の深いvalidatorが、新規Progress/CauseLog/configフィールド、交差不変条件、base config制約を実行時にも守ること。
- `MaterialSelection.brushId`必須化、MotorConfig拡張、recipeキー追加、`encodeRecipe`候補の依存閉包がpitfalls#2どおり事前列挙されていること。
- P3-0-Q2に反してP3-3でproduction配線や人間試遊を開始しないこと。

## レビュー回答の形式

修正が必要な場合は、次を分けてください。

- 実装開始を妨げる必須修正
- 実装ゲート内で満たせる付帯条件
- 人間再承認を要する契約変更
- 推奨事項(条件ではないもの)

また、指示どおりに計画へ反映した場合にFable再提出が必要か、Suu_mot3の差分照合だけで実装承認へ進めるかを明記してください。

レビュー完了後も、Fable裁定の計画反映、Suu_mot3照合、必要な人間再承認が終わるまでproduction/test編集・実装・commit・tag・pushは開始しません。
