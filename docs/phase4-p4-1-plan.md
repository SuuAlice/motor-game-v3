# Phase 4 P4-1詳細計画 v2（P4-1A受入完了）: ガレージ深化の本実装

作成: Suu_mot3（2026-08-28）

基点: `develop` / `c54c0f1d42c6969360952b2c1cfd7350bd1a99e7` / tag `p4-0-complete`

上位計画: `docs/phase4-plan.md`

UI計画: `docs/phase4-p4-1-ui-plan.md`

状態: **P4-1Aは2026-08-28にexact契約の人間承認、実装、Suu_mot3正式受入まで完了した。99ファイル・2554テスト、build・lint・型検査が成功している。次はP4-1Bのexact計画・承認であり、P4-1Aの正式commit、tag、push、deployおよびP4-1B実装は禁止する。**

## 1. 要約

P4-1は、P4-0で選ばれた半自動治具を通常の組み立て・在庫・走行へ接続し、巻線記録を「見た目だけの試作」からゲーム内のローター個体へ昇格させる工程である。

ただし、P4-1の全項目（保存schema、素材消費、張力、D01、D10、整流子、台座、釘、台紙、型紙）を一つの実装バンドルにしない。最初にクロスレイヤ契約を凍結し、以後は次の順で小さく通す。

1. P4-1A: 保存・ローター個体・production生成境界の契約凍結
2. P4-1B: 半自動治具のproduction UIと、巻線の出来・修正差が読める手続き描画
3. P4-1C: 巻線集計のproduction写像と張力ゲーム性、D01接続
4. P4-1D: 整流子の接触品質（他工程から独立）
5. P4-1E: 台座、釘本数、台紙素材とエッジ接触の正典入力
6. P4-1F: 被膜損傷の恒久蓄積、D10、簡易テスター
7. P4-1G: 素材消費付き型紙複製・部分修正とPhase 4最終試遊

各小工程は個別の計画・依存閉包・人間承認を持つ。前段の契約を変更する必要が出た場合は、後段を進めずP4-1Aへ戻る。

## 2. 問題

P4-0は次を証明した。

- 半自動治具は、3回巻いても苦役にならず、スマホ・PCの両方で成立する入力方式である。
- 一区間だけ直すと、固定シナリオの結果を狙った方向へ変えられる。
- 勝利後にもう一度試したいという動機は成立する。

一方、次が未解決である。

- 巻線の出来と修正効果を、数値表より先に絵から十分読み取れない。
- `position`と`tension`は記録・描画だけで、production物理へ未接続である。
- P4-0記録はセッション限定で、ローター個体、在庫消費、保存、レシピへ接続していない。
- 張力を上げる利益と、被膜損傷・破断の危険の釣り合いがゲームになっていない。
- D10、整流子、台座、釘、台紙、型紙のproduction契約が未確定である。
- productionのレシピ文字列は巻線記録を収載せず、正典§9.1との開きがある。

P4-1の失敗は、これらを「物理パラメータを増やして精密化すること」で埋めることである。成功は、プレイヤーが巻線の絵と走行現象から次の修正を考えられることにある。

## 3. 目標

### 3.1 ゲーム体験

- 巻いている最中に、線の配り方、重なり、緩み、高張力の負担が絵で連続的に読める。
- 完成したローターを見て「次はここを直す」という仮説を持てる。
- 張力は高いほど整列・占積に有利だが、素材ごとの許容を越えて使い続けると損傷が増える。
- 一箇所の修正が見た目と走りの両方へ同じ向きで現れる。
- 失敗時も原因の答えは出さず、症状、差分、計測器の三段開示を保つ。

### 3.2 技術

- `WindingRecord`をローター個体の正典データとし、描画、写像、保存、レシピ、型紙が同じ記録を参照する。
- 記録から物理入力への変換は純関数に閉じ、React/DOMへ物理計算を書かない。
- production走行はP3-4のsnapshot・原子的outcome反映・再読込retry契約を維持する。
- 旧saveを壊さず、一方向migrationと深いvalidatorを持つ。
- 同じ巻線記録・素材・seedから同じrun event列を得る。

## 4. 非目標

- 進角、電機子インダクタンス、アルニコ逆磁界減磁
- PID制御、制御工学パネル、波形を合わせる作業
- 張力の正解帯を緑・黄・赤で教える品質ゲージ
- ポインタ速度と張力の再結合
- 生ドラッグ・パターン設計のproduction化
- Phase 5の周回、CPU、ボス、賞金、工房の棚・銘板・改良履歴
- Phase 6へ繰り越した音4種、BGM、スマホ最終最適化
- 新しい色、フォント、内部解像度、画像asset、依存package

## 5. P4-1の分割

### 5.1 P4-1A: クロスレイヤ契約凍結

P4-1Aでは次を型・validator・migration・公開actionとして確定・実装し、正式受入を通過した。

- ローター個体が保持する巻線記録、線材、被膜、台紙、工作結果、恒久損傷
- 旧ローター個体のmigration既定値と、旧saveから復元した記録の由来表示
- 巻線完成時の在庫消費とローター生成を一回で行う原子的action
- 装備中ローター、型紙、レシピ、run snapshotが参照する単一出典
- 巻線由来の初期`effectiveTurnsRatio`と、D01走行中漸減ratioの積算位置
- D10を追加した場合のevent、state、degradation、図鑑、温度規約、終端/非終端
- save schema、recipe code、RunSnapshot contractの版上げ要否とmigration
- 線径・並列本数を巻き始める前に固定し、既存ターンの意味を途中変更できない契約

P4-1Aでは画面、物理式、較正値、D10状態機械を実装していない。`ExperimentNotebook.tsx`の網羅ラベル1行だけは`MotorConfig`型追加への機械的追随として人間承認を得て反映した。MC4はUI供給経路とlegacyローターのUXを同時に閉じるためP4-1Bへ延期し、RunSnapshot 4はD10形状確定時まで延期した。

### 5.2 P4-1B: 半自動治具と視覚のproduction化

- P4-0の半自動治具だけを通常の組み立て工程へ接続する。
- `src/p40/`の比較専用フローをそのままproductionへ流用せず、共通入力コマンドと`src/retro/winding/`の描画だけを引き上げる。
- 4段の巻線層、ターンの前後関係、左右腕、渡り線、線の張り、重なり密度を既存palette・整数座標で描く。
- raw `position/tension`は表示できるが、品質点、予測タイム、推奨修正は表示しない。
- 完成前後と型紙修正前後を、同縮尺・同色規則で比較できる。

P4-1Bでは新しい物理式やD10を入れない。UIが記録を忠実に作り、絵から差を読めることだけを確認する。

### 5.3 P4-1C: 巻線写像と張力ゲーム性

productionへ接続する候補軸は、正典§9.2に記載済みの現象だけとする。

- 方向一貫性 → `effectiveTurnsRatio`
- 左右バランス → 既存`axisOffsetMm`
- 分布・渡り線 → 線長、抵抗、占積
- 低張力・張力ムラ → 緩み、占積低下、D01崩壊耐性
- 高張力×エッジ接触×素材許容 → 被膜損傷の増分

各軸は一つずつread-only有限sweepし、実在物性または既存設計較正値から候補を逆算する。全軸を同時に動かして結果だけ合わせない。

張力操作は「高いほど常に得」にはしない。ただし低張力と高張力を対称な罰にする任意の山型関数も禁止する。利益側は整列・占積、危険側は素材許容を越えた損傷という、異なる実在現象として分ける。

### 5.4 P4-1D: 整流子の接触品質

- 溝掘り・仕上げから、既存の`sandingQuality`、接触抵抗、チャタリング、D05へ接続する。
- 溝角度による進角は接続しない。
- P4-1Cの張力較正やP4-1E/Fの台紙・D10へ依存させず、独立gateとして実装・検証する。

### 5.5 P4-1E: 台座、釘、台紙

次を別々のgateで実装する。

1. 台座の軸受け穴精度 → 既存`axisOffsetMm`/摩擦損への集計。
2. 釘本数 → B強化と慣性、飽和。
3. 台紙素材 → 剛性、エッジ鋭さ、D01/D10耐性。
4. 巻線記録×台紙×釘から、エッジへ接触した高張力turnを決定論的に抽出する純関数。

一つのgateで複数工程を同時較正しない。既存写像で表現できない場合は新しいエンジン状態を足さず、arbiterへ戻す。

### 5.6 P4-1F: 被膜損傷とD10

- 被膜損傷はローター個体に帰属する0〜1の恒久状態候補とする。原反線材ストックへ遡及させない。
- 巻き直し・高張力・エッジ擦れによる増分は、完成actionで一度だけ適用する。React描画frameや再renderで増やさない。
- D10は被膜損傷×通電を原因とし、釘付近の細い発煙と進行性の実効巻数低下を持つ。
- D10の発火後仕様、terminal性、temperature表現、degradation、初回図鑑、リプレイ、1破壊1eventをP3破壊契約マトリクスに追加する。
- 簡易テスターは抵抗・導通という事実を示し、「D10の原因です」と断定しない。

P4-1FはP4-1C（張力）とP4-1E（エッジ接触・台紙・釘）の両方に依存する。D10を先に実装して仮のエッジ判定を置かない。

### 5.7 P4-1G: 型紙とPhase 4完了

- 型紙は`WindingRecord`の値コピーであり、自動改善・平滑化をしない。
- 複製・部分修正は通常どおり線材・被膜材を消費し、新しいローター個体を作る。
- 変更区間外はJSON同値を固定する。
- 型紙の系譜、銘板、引退機の棚はPhase 5へ送り、P4-1では保存しない。
- 最終試遊は「わざと雑に」巻き、逆巻き、偏り、緩み、高張力、エッジ擦れが絵・計測・破壊へ正しく現れるかを確認する。

## 6. P4-1Aで確定が必要な裁定

### Q1: ローター個体の保存形

候補A（推奨）: `RotorAssemblyState`を、巻線記録と工作結果を含むproductionローターの単一出典へ拡張し、save migrationで旧ローターへ明示的なlegacy由来を付ける。

候補B: 巻線記録を別テーブルに保存し、ローターからID参照する。

候補Bは参照整合、削除、複製、snapshotで第二の同期対象を作るため、型紙の共有要件が実証されるまでは過剰である。

### Q2: `effectiveTurnsRatio`の積算

現行は`recipeCode.ts`、`recipeKey.ts`、`validateMaterialComposedBase`の3か所が、base configの`effectiveTurnsRatio`を`undefined | 1`へ固定している。巻線由来ratioをそのまま入れる案はP3-3-Q12/Q14/P-Q10-A5と衝突する。

- 候補α: `ratio_total = ratio_winding × ratio_D01`とし、base契約を`(0,1]`へ広げる。
- 候補β: 巻線由来ratioを`MotorConfig`の別フィールドにし、run時のcomposeだけがD01 ratioと乗算する。
- 候補γ: 巻線由来ratioをRunSnapshot/production run契約の別フィールドとして捕捉し、base `MotorConfig`の禁止契約を維持する。

いずれもrecipeKey十分性、snapshot/replay、save validatorのどこかへ波及する。現段階で推奨を決めず、alice報告の依存閉包を添えてarbiter裁定へ出す。

### Q3: 張力による破断

候補A: 被膜損傷を連続蓄積し、極端な高張力で線材破断へ至る決定論的な蓄積閾値を持つ。

候補B: P4-1では破断させず、連続損傷と後続D01/D10だけで危険を表す。

ユーザー意図は「強く張る利益と、切れないよう抑える判断」であり候補Aが近い。一方、spec §9.4の成否二値禁止との整合が必要なため、arbiter裁定と人間承認前に確定しない。いずれもランダム即死、反応時間QTE、正解帯ゲージは採らない。

### Q4: D10の終端性

D10は「静かに蝕む」進行性破壊であるため、即時terminalではなく進行性劣化を第一候補とする。ただしrun終了条件、重複event、D02との優先順位、最終劣化の一意性を破壊契約マトリクスで裁定する。

### Q5: 素材消費の原子境界

巻線完成時は、線材/被膜材の消費、ローター個体生成、装備更新を一つのResult actionで行う候補を推奨する。途中保存・二段commit・UIからの直接配列変更は禁止する。

### Q6: レシピ文字列への巻線記録収載

spec §9.1は巻線記録の収載を要求する一方、現行`recipeCode.ts`は`coilTurns`等の集計値だけを持ち、`effectiveTurnsRatio`は意図的に非収載である。

- 候補A: recipe版を上げ、量子化済み巻線記録を収載する。
- 候補B: P4-1ではproductionローターID/保存記録を正とし、手動共有用recipeの巻線収載を後続gateへ送る。

レシピ再現とCPU実レシピの正典性に関わるため、容量だけを理由に候補Bへ逃げずarbiter裁定を得る。

### Q7: contract versionとmigration

save `SCHEMA_VERSION=2`、RunSnapshot contract version 3、recipe prefix/versionのどれを上げるかを個別に確定する。版上げは一方向migration、旧版の再読込、破損分類、write失敗非破壊を必須とし、旧saveの黙った破棄を禁止する。

### Q8: 線径・並列本数の固定時点

巻き始めた後に線径・並列本数を変更すると、既に記録したturnの線長・上限・物理的意味が変わる。巻線開始前に確定し、1ターン記録後は固定する案を推奨する。変更したい場合は記録を破棄して最初から巻き直す。

### Q9: challenge制約の`coilTurns`への適用

現行の`lockedKeys` / `paramRanges`はassembly工程から十分に参照されておらず、`coilTurns`を直接編集する前提である。巻数を記録長から導出した後は、次を区別する。

- 上限: `computeMaxTurns(wireGauge, parallelStrands)`とchallenge上限の小さい方で、追加turnを受理しない。
- 固定値: 目標巻数へ到達するまで完成できず、超過turnは受理しない。
- 記録内容: 位置・腕・方向・張力をchallenge側が黙って固定・補正しない。

exactな制約契約は既存challengeの全参照を再列挙してからarbiterへ出す。UIだけでclampし、storeが異なる値を受理する二重契約は禁止する。

### Q10: `src/p40/`の撤去時点

P4-0比較証跡はP4-1実装中に変更しない。production半自動治具、共通契約、回帰証跡の移管が完了し、P4-0再現性が別の正式テスト・文書で保たれたことを確認したP4-1末に限り、ディレクトリ単位の削除を別バンドルで判断する。途中の整理目的削除と、選外2案の修理は行わない。

## 7. 現時点の依存閉包（read-only `rg`）

### 7.1 `WindingRecord/WindingTurn`

- `src/materials/windingRecord.ts`
- `src/materials/__tests__/windingRecord.test.ts`
- `src/p40/**`
- `src/retro/winding/**`
- `src/retro-proto/resolutionHarness/**`
- `src/retro/audio/prng.ts`（コメント参照）

P4-0比較コード`src/p40/**`はproduction単一出典にしない。P4-1Bで残す共通部分と削除可能部分を明示する。

### 7.2 `RotorAssemblyState/rotorAssemblies`

少なくとも次が機械的追随候補である。

- `src/materials/inventoryItem.ts`
- `src/materials/degradationApplication.ts`
- `src/materials/__tests__/inventoryItem.test.ts`
- `src/materials/__tests__/degradationApplication.test.ts`
- `src/store/saveStore.ts`
- `src/store/runOutcomeApplication.ts`
- `src/store/shopEconomy.ts`
- `src/store/gameStore.ts`
- `src/store/__tests__/saveStore.test.ts`
- `src/store/__tests__/runOutcomeApplication.test.ts`
- `src/store/__tests__/gameStore.test.ts`
- `src/store/__tests__/destructionWiring.test.ts`
- `src/retro/destruction/__tests__/gearMaterialColor.test.ts`
- `src/materials/wearReflection.ts`
- `src/retro/shop/formatMaterial.ts`（型変更の機械的追随が必要か再確認）

担当報告後、fixtureだけの追随と契約変更を分け、exact file closureとして固定する。

### 7.3 `effectiveTurnsRatio`

- `src/engine/motorPhysics.ts`
- `src/engine/destructionModes.ts`
- `src/engine/destructionOrchestration.ts`
- `src/engine/recipeCode.ts`
- `src/materials/recipeKey.ts`
- `src/materials/windingRecord.ts`
- 対応するengine/materials/P4-0テスト
- `src/components/ExperimentNotebook.tsx`

P3-3のbase禁止契約を変更しない案を優先する。変更が必要なら本一覧だけで十分とみなさず、単一tsconfig全体で再度`rg`し計画を改訂する。

### 7.4 production UIと直接`coilTurns`前提

- `src/components/ParamPanel.tsx`
- `src/components/assembly/CoilWindingStep.tsx`
- `src/components/assembly/AssemblyReviewStep.tsx`
- `src/components/assembly/StartStep.tsx`
- `src/modes/AssemblyMode.tsx`
- `src/modes/GarageMode.tsx`
- `src/components/RecipePanel.tsx`
- `src/components/ExperimentNotebook.tsx`
- `src/store/gameStore.ts`（`coilTurns` clampと`finishAssembly`）
- `src/store/saveStore.ts`（既定値・validator）

UIは`coilTurns`を別の正として編集せず、productionローターの巻線記録から導出する。

## 8. ゲート

### G0: 計画・依存閉包・裁定

- alice/brabitのread-only報告を本文へ統合する。
- Q1〜Q5とD10発火後仕様を人間へ提示する。
- engine/store契約をarbiterが正式レビューする。
- 必要な人間再承認後に限りP4-1Aの実装計画を解禁する。

### G1: save/ローター契約

- schema migration、deep validator、fixture、旧save復元を実装する。
- まだUI・物理写像・D10へ進まない。

### G2: 原子的ローター生成

- 在庫消費、ローター生成、装備更新の成功/失敗非破壊性を固定する。
- 不足在庫、重複ID、不正記録、上限超過、書込失敗を負例にする。

### G3: production半自動治具と視覚

- P4-1BのUI計画を実装し、人間/画面操作AIが差を視認できることを確認する。
- 物理未接続値を接続済みと説明しない。

### G4: 巻線写像

- 一軸ずつfinite sweepし、exact候補をproduction反映前に提示する。
- 初期ratio×D01 ratio、線長、占積、緩みを別々に検証する。

### G5: 張力・被膜

- 連続損傷、素材差、巻き直し累積、決定論、上限clampを確認する。
- 破断を採る場合は別の人間試遊で操作性を判定する。

### G6: 整流子

- 接触品質・D05だけを接続し、進角を追加しない。

### G7: 台座・釘・台紙

- 各工程を個別に通し、D10の正典入力となるエッジ接触を固定する。

### G8: D10

- Phase 3と同じ破壊契約マトリクスをD10へ適用する。
- 図鑑、リプレイ、原子的劣化、二重報酬防止まで通す。

### G9: 型紙とPhase 4人間試遊

- 素材消費、値コピー、部分修正局所性、再読込を確認する。
- 「わざと雑に」試遊を行い、Phase 4完了判定を受ける。

## 9. テスト戦略

- pure: validator、量子化、集計、線長、占積、損傷、部分置換、migration
- deterministic: 同一記録・素材・seedでconfig、event列、outcome、保存hashが一致
- boundary negative: 閾値直前、0/1/9/10/150ターン、在庫不足、壊れた旧save、不正ID
- structural: Reactに物理式なし、UI独自D10判定なし、base ratio契約の迂回なし、P4-0選外入力のproduction importなし
- store: action失敗時の引数非破壊、原子的反映、reload retry、二重適用防止
- visual/a11y: 480×270、整数座標、palette、横縦、touch、keyboard、reduced motion、色だけに依存しない
- full gate: `npm run test`、`npm run build`、`npm run lint`、全体型検査、追加sweep型検査、palette検査、`git diff --check`

## 10. 人間試遊の合格条件

1. 完成した巻線を見て、少なくとも一箇所の改善仮説を言える。
2. 張力を上げる利益を感じる一方、上げ続けることに明確な危険を感じる。
3. 危険の判断が数値だけでなく、線・治具・ローターの絵からできる。
4. 一区間だけ直した結果が、見た目と走りの同じ方向へ効く。
5. 原因の答えや品質点を表示されなくても、計測と再走で仮説検証できる。
6. スマホの単一指とキーボードで同じ4値を操作できる。
7. 3回巻いても苦役でなく、勝敗以外にも巻線そのものを作り直したくなる。

## 11. 過剰設計防止の停止条件

- 5つ以上の新規物理軸を同一sweepで同時較正し始めた。
- 張力をPID・微分・ポインタ速度・反応時間で評価し始めた。
- 見た目不足を品質ゲージ、原因断定、推奨修正で補おうとした。
- D10のためにD01/D02/D05の確定契約を無関係に再設計し始めた。
- 型紙のためにPhase 5の系譜・棚・銘板を先取りし始めた。
- 進角、インダクタンス、逆磁界減磁へ踏み込んだ。
- P4-0の選外2案を修理・production化し始めた。
- 新asset、palette、font、依存package、汎用E2E基盤が必要になった。
- 既存saveを破棄するmigration、黙ったfallback、clampで不正値を通す案が必要になった。

## 12. ロールアウトと禁止事項

- 実装はP4-1A〜Fの順で、各小工程ごとに人間承認を得る。
- engineを含む計画は実装前にarbiter正式レビューを受ける。
- production値はfinite sweepのexact候補提示前に変更しない。
- commit、tag、push、deployは各節目で別途承認を得る。
- main、Production、既存Previewは明示承認なしに変更しない。

## 13. 現在の未確定事項

- P4-1Bのproduction半自動治具・画面状態・戻る/失敗/再試行のexact依存閉包
- MC4へ巻線記録を収載する際のlegacyローターUXと`RecipePanel`配線
- 張力破断をP4-1で実装するか、連続損傷だけに留めるか
- D10のterminal性、temperature表現、D02/D05との同時発火優先順位
- 型紙の保存位置と上限数（系譜はPhase 5）
- `lockedKeys` / `paramRanges`を記録長へ適用するexact契約
- `src/p40/`の証跡移管完了条件と削除可否

これらを推測で埋めず、担当報告・arbiter裁定・人間承認で確定する。

## 14. P4-1A実装・受入結果（2026-08-28）

- `MotorConfig.windingTurnsRatio?: number`を追加し、既定1、`(0,1]`、D01因子との単一乗算点を固定した。
- `RotorAssemblyState.winding`をlegacy/recorded判別unionへ拡張し、recordedはcanonical `WindingRecord`、線径、並列本数を保持する。保存復元は厳密キー、10〜150turn、physical max以下をfail-closedで検証する。
- canonical E2 encodingを1ターン3バイトで実装し、save schemaを2から3、recipeKeyを1から2へ一度だけ昇版した。旧saveはv1→v2→v3の一方向migrationを維持する。
- `completeRotorAssemblyAction`はconfig、線材在庫、ローター個体、装備、ID counterを一つのpersist境界で更新し、失敗時は全sliceを不変にする。
- 線材消費は既存線長式を単一出典化した。物理式・較正値・D10・被膜保存/消費・challenge・`finishAssembly`・`src/p40`は変更していない。
- MC4はP4-1B、RunSnapshot 4はP4-1Fへ延期した。`ExperimentNotebook.tsx`は型網羅維持のラベル1行だけを変更した。
- Suu_mot3の正式受入では、99ファイル・2554テスト、build、lint、`npx tsc -b`、`git diff --check`が成功し、blocking defectなしと判定した。
- 正式commit構成はC1〜C6の実装単位とC7の文書単位で検証済みだが、commit、tag、push、deployは別途人間承認まで行わない。
