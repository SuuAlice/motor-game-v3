# Phase 4 P4-1 arbiter正式レビュー依頼 v1

作成: Suu_mot3（2026-08-28）

基点: `develop` / `c54c0f1d42c6969360952b2c1cfd7350bd1a99e7` / tag `p4-0-complete`

状態: **2026-08-28にarbiter正式回答を受領。条件付き承認・blocking defect 0で、P41-R1〜R7の人間再承認待ち。production/test実装、spec/art-spec確定変更、commit、tag、push、deployは禁止中。**

## 0. 依頼

P4-1の実装前詳細計画について、engine/store/保存/レシピ/破壊契約とゲーム目的の整合を正式レビューしてください。

判定は次を全文で返してください。

1. 承認 / 条件付き承認 / 差戻し。
2. blocking defectとnon-blocking申し送りを区別した一覧。
3. 技術論点1〜9それぞれの採用案、却下案と理由、exact契約または次gateで確定すべき範囲。
4. 人間再承認が必要なdeltaの全文。
5. P4-1A契約凍結で必要なexact dependency closure、version、migration、validator、負例。
6. 物理シミュレータ化・過剰設計へ逸脱していないかの判定。

入力と基点が食い違う場合は推測せず停止し、差分を報告してください。本依頼はFable名義文書の生成依頼ではなく、`arbiter_mot3`自身の正式判定依頼です。

## 1. 人間事前承認済みの方向 H1〜H8

### H1: P4-1を小工程へ分割する

次の順で、各工程を独立した計画・承認・検証単位にする。

1. 契約凍結。
2. production半自動治具と視覚。
3. 巻線写像・張力・D01。
4. 整流子接触品質・D05。
5. 台座・釘・台紙・エッジ接触。
6. 被膜損傷・D10・簡易テスター。
7. 素材消費付き型紙・Phase 4最終試遊。

巻線統合、張力較正、D10を一括実装しない。

### H2: production入力は半自動治具だけにする

P4-0で採用した半自動治具だけを通常の組み立て工程へ接続する。生ドラッグとパターン設計は比較証跡として凍結し、修理・production化しない。

### H3: 巻線の出来をまず絵で判断できるようにする

- W1: 位置分布から外形輪郭を描き、偏り・密集・空きを凸凹として見せる。既存art-specの約3倍誇張を第一候補にする。
- W2: 修正前後を同縮尺・同色規則で切り替える。差分採点色は使わない。

品質点、正解帯、予測タイム、原因断定、推奨修正は追加しない。

### H4: 張力は利益と累積危険の駆け引きにする

高張力は整列・占積に有利とし、素材許容を越えて使い続けると被膜損傷が連続蓄積する方向を採る。低張力は緩みとD01崩壊耐性低下へ接続する。

ユーザー意図に沿い、実線材破断へ至る候補Aを第一候補として照会する。ただし、ランダム即死、速度依存、反応時間QTE、緑黄赤の正解帯、PID調整は採用しない。spec §9.4との整合、破断時の扱い、exact閾値はarbiter裁定と有限sweep後に改めて人間承認を得る。

### H5: ローター個体を巻線と被膜損傷の単一出典にする

`RotorAssemblyState`を巻線記録、工作結果、ローター完成後の被膜損傷の単一出典へ拡張する候補Aを採用方向とする。線材スタックを個体管理へ全面変更する案は、店・在庫・保存・サルベージまで広げる過剰設計として不採用とする。

この方向を採る場合、spec §9.5の「線材個体」を実装実態に合わせて「ローター個体」へ是正する。exact型とmigrationはarbiter裁定後に再承認する。

### H6: 材料消費とローター生成を原子的にする

線材・被膜材の消費、ローター個体生成、装備更新を一つのResult actionで行う候補を採る。失敗時は在庫・装備・入力記録を変更しない。UIからの直接配列変更、途中保存、二段commitは採らない。

### H7: レシピは巻線記録を再現可能にする方向を維持する

spec §9.1に従い、量子化済み巻線記録をレシピ文字列へ収載する候補Aを採用方向とする。容量だけを理由に後送りしない。ただしrecipe version、recipeKey十分性、旧レシピ互換、RunSnapshotへの収載範囲はarbiter裁定後に再承認する。

### H8: 線径・並列本数は巻き始める前に固定する

1ターン記録後は線径・並列本数を変更できない。変更する場合は確認後に巻線記録を破棄して最初からやり直す。途中変更によって既存turnの意味が変わる抜け道を作らない。

## 2. 技術論点1〜9

### 論点1: 初期`effectiveTurnsRatio`とD01走行中ratio

現行は`recipeCode.ts`、`recipeKey.ts`、`validateMaterialComposedBase`がbaseの`effectiveTurnsRatio`を`undefined | 1`へ固定する。一方、D01走行中ratioは`composeEffectiveMotorConfig`で算出される。

- 候補α: `ratio_total = ratio_winding × ratio_D01`としてbase契約を`(0,1]`へ広げる。
- 候補β: 巻線由来ratioを`MotorConfig`の別フィールドにし、run時composeだけがD01 ratioと乗算する。
- 候補γ: 巻線由来ratioをRunSnapshot/production run契約の別フィールドとして捕捉し、base `MotorConfig`禁止契約を維持する。

P3-3-Q5/Q12/Q14/P-Q10-A5、recipeKey十分性、snapshot/replay、save validatorとの整合を裁定してください。

### 論点2: 被膜損傷の帰属

spec §9.5は「線材個体」とするが、productionの線材は個体IDを持たないスタック在庫である。

- 候補A: `RotorAssemblyState.coatingDamageFraction`としてローター個体へ帰属し、spec文言を是正する。
- 候補B: 線材在庫を個体管理へ拡張する。

H5は候補Aを採用方向、候補Bを過剰設計として不採用方向に承認済み。exact型、範囲、migration、劣化適用境界を裁定してください。

### 論点3: recipeへの巻線記録収載

spec §9.1どおり量子化済み`WindingRecord`をrecipeへ収載する方向はH7で承認済み。recipe prefix/version、最大150turnのcanonical encoding、旧recipe decode、recipeKey十分性、手動共有長、破損分類を裁定してください。

### 論点4: versionとmigration

現行はsave schema 2、recipe v3、RunSnapshot contract 3である。各versionを一律に上げるのではなく、巻線記録・被膜損傷・D10・replay再現に必要な最小範囲を裁定してください。一方向migration、旧版読込、deep validator、破損時非破壊、黙ったfallback禁止を維持します。

### 論点5: D01崩壊耐性の入力

低張力をD01崩壊耐性へ接続するため、現行engine定数`COIL_DEFORM_OMEGA`相当を`DestructionConfig.d01`へ移す候補があります。engine凍結方針§2(b)の許容範囲、旧デフォルト同値、finite sweep軸、`varnished`を素材由来のまま維持する契約を裁定してください。

### 論点6: D10発火後仕様

D10は高張力×台紙/釘エッジ×被膜損傷×通電を正典原因とし、細い局所発煙と進行性の実効巻数低下を候補とする。非終端候補、D01/D02/D05との優先順位、temperature、event、state、degradation、図鑑、リプレイ、1破壊1event、最終劣化の一意性を裁定してください。D10用の仮エッジ入力を先行新設しません。

### 論点7: 実線材破断とspec §9.4

ユーザーは「張力は強いほど有利だが、切れないよう調整する釣りの巻上げのようなゲーム性」を希望している。一方、spec §9.4は成否二値の判定を禁止し、現行D01〜D10に巻線中の線材切断はない。

候補Aは素材許容超過の連続損傷が決定論的閾値へ達した時に破断する。候補BはP4-1で破断させず被膜損傷とD01/D10だけで危険を表す。新しいD番号、ランダム即死、QTEを追加せず、ゲーム意図と正典を両立する案を裁定してください。

### 論点8: challenge制約

`lockedKeys` / `paramRanges`の`coilTurns`制約を、記録長、`computeMaxTurns(wireGauge, parallelStrands)`、store validatorへ同一契約で適用する必要がある。

- 上限は二つの上限の小さい方で追加turnを拒否する。
- 固定値は目標turn到達前に完成不可、超過turnは拒否する。
- 位置・腕・方向・張力をchallenge側が黙って補正しない。

既存challenge互換と失敗時の入力保持を含めて裁定してください。

### 論点9: `src/p40/`の撤去条件

P4-0比較証跡はP4-1実装中に凍結する。production半自動治具、共通契約、回帰証跡が正式側へ移管され、P4-0再現性を失わないと確認したP4-1末にだけ、ディレクトリ単位削除を別バンドルで判断する。途中削除、選外2案の修理、production importは行わない。この条件で十分か裁定してください。

## 3. 既知の依存閉包

詳細は`docs/phase4-p4-1-plan.md` §7を正とする。最低限、次の層を含む。

- `WindingRecord/WindingTurn`: `src/materials/windingRecord.ts`、`src/p40/**`、`src/retro/winding/**`、resolution harness、対応テスト。
- `RotorAssemblyState`: inventory、degradation、wear reflection、material mapping、shop economy、saveStore、gameStore、run outcome、retro shop formatter、対応テスト。
- `effectiveTurnsRatio/MotorConfig`: motor physics、destruction modes/orchestration、recipeCode、recipeKey、windingRecord、P4-0、ExperimentNotebook、sweep、対応テスト。
- production UI: ParamPanel、assembly 4画面、AssemblyMode、GarageMode、RecipePanel、ExperimentNotebook、gameStore、saveStore。

破壊的型変更を採る場合、実装前に単一tsconfig全体の`rg`を再実行し、fixture追随と公開契約変更を分けたexact expected file setをP4-1A計画へ固定してください。

## 4. 過剰設計防止条件

- 新しい物理軸を同時に5つ以上較正しない。
- 張力平均・ムラ・速度等を同時sweepしない。最初は一軸ずつ扱う。
- 「整列」「占積」を既存`effectiveTurnsRatio`と重複する独立状態として推測追加しない。
- PID、ポインタ速度、反応時間QTE、ランダム即死、品質ゲージ、原因断定を追加しない。
- D10のためにD01/D02/D05確定契約を無関係に再設計しない。
- 台座/釘/台紙より先に仮のD10入力を作らない。
- Phase 5の棚・系譜・銘板、Phase 6の音、新色/font/asset/dependencyを先取りしない。
- 生ドラッグ・パターン設計を修理・production化しない。
- 進角、インダクタンス、逆磁界減磁へ踏み込まない。

## 5. 人間承認全文

> P4-1実装前・人間事前承認バンドルH1〜H8、およびarbiterへ諮る技術論点1〜9を承認します。engine/store契約の正式レビューへ進めてください。production/test実装・spec/art-spec確定変更・commit・tag・push・deployは、arbiter結果の人間再承認まで禁止します。

## 6. 固定入力

次のファイルを全文読んでください。SHA-256は送信時のagmsg本文で固定します。

- `AGENTS.md`
- `docs/spec.md`
- `docs/art-spec.md`
- `docs/handoff.md`
- `docs/baseline-v2.0.md`
- `docs/phase4-plan.md`
- `docs/phase4-p4-1-plan.md`
- `docs/phase4-p4-1-ui-plan.md`
- `docs/phase4-p4-1-human-approval-bundle.md`
- `docs/phase4-p4-1-arbiter-review-request.md`

基点コードはcommit `c54c0f1d42c6969360952b2c1cfd7350bd1a99e7`を正とし、現在の未コミット文書は「PRESENTED DRAFT」であってcommit収録済みと誤認しないでください。その他の未追跡・未コミットファイルはレビュー対象外です。
