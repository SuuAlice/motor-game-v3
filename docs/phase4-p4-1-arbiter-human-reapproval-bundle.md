# Phase 4 P4-1 arbiter判定・人間再承認バンドル v1

作成: Suu_mot3（2026-08-28）

基点: `develop` / `c54c0f1d42c6969360952b2c1cfd7350bd1a99e7` / tag `p4-0-complete`

状態: **2026-08-28人間再承認済み。P4-1A契約計画の詳細化だけを解禁し、production/test実装、spec/art-spec確定変更、commit、tag、push、deployは各exact deltaの別途承認まで禁止する。**

## 1. arbiter正式判定

- 判定: **条件付き承認**。
- blocking defect: **なし**。
- 過剰設計・物理シミュレータ化: **逸脱なし**。
- 効力: P41-R1〜R7の人間再承認後、P4-1Aのexact型・encoding・migration計画の詳細化を解禁する。各実装は、各deltaのexact内容と数値の別途人間承認まで解禁しない。

## 2. 人間再承認デルタ全文

### P41-R1: 巻線由来ratioの新フィールド

`MotorConfig`へ巻線由来の方向一貫性フィールドを追加する。名称はaliceがP4-1Aで確定する。既定`undefined`は1.0、base契約は`(0,1]`とする。

走行時実効値は`composeEffectiveMotorConfig`内の既存単一合成点で、次の形に限って合成する。

```text
実効ratio = 巻線由来ratio × D01漸減ratio
```

将来D10の進行性低下を加える場合も、同じ単一乗算点へ第3因子として追加する。独自の第二経路やconfig直接書換えを作らない。

既存`effectiveTurnsRatio`の`undefined | 1` base契約と次の4執行点は変更しない。

1. `recipeCode.ts`のthrow境界。
2. `recipeKey.ts`のResult拒否境界。
3. `validateMaterialComposedBase`のResult拒否境界。
4. `restoreRunSnapshot`のbase config検証境界。

新フィールドは`validateMaterialComposedBase`、`restoreRunSnapshot`、save validatorで同じ`(0,1]`範囲を検証する。`computeRecipeKey`のcollectorへ追加し、`RECIPE_KEY_VERSION`を1から2へ上げる。

recipe文字列へ派生ratioを独立収載しない。論点3の巻線記録からdecode時に導出し、記録と派生値の二重収載を禁止する。K_E=K_T相反性としてbackEmfとtMagへ同じ実効ratioを適用する既存契約を維持する。

候補α（既存`effectiveTurnsRatio`のbase契約緩和）と候補γ（RunSnapshot/production runの第二チャネル）は却下する。

### P41-R2: ローター個体拡張とsave schema 3

`RotorAssemblyState`を巻線記録、工作結果、被膜損傷の単一出典へ拡張する。`coatingDamageFraction: number`を追加し、範囲は`[0,1]`とする。

被膜損傷の増分適用経路は次の2つだけに限定する。

1. 巻線完成actionで1回だけ適用する工程由来増分（高張力×エッジ×素材許容）。
2. 走行outcomeの原子的適用で1回だけ適用するD10進行由来増分。

React描画、再render、表示frameからの加算を構造テストで禁止する。

save `SCHEMA_VERSION`を2から3へ上げる。旧saveのローターは`coatingDamageFraction: 0`とするが、巻線記録なし・損傷0から始まる旧個体である`legacy`由来を明示し、存在しなかった巻線記録を捏造しない。

spec §9.5の「線材個体に被膜ダメージが蓄積」を「ローター個体」へ是正する。是正後の抑止機構を次の2つの実在機構へ分解したことを明記する。

- やり直しのコスト: 巻き直しごとの線材スタック消費。
- 雑な巻きのコスト: 新ローター個体に工程中蓄積する被膜損傷。

線材在庫そのものを個体管理へ変更する案は過剰設計として不採用とする。

### P41-R3: recipe MC4とrecipeKey 2

recipeをMC3から`MC4(v:4)`へ上げ、量子化済み`WindingRecord`のcanonical encodingを収載する。

最大150turnについて、各turnの`position`・`tension`・`arm`・`direction`を一意な正規形へ符号化する。同じ巻線記録は常に同じ文字列へなり、decode後の再encodeも同じcanonical文字列になることを固定する。exactなバイト列、文字列化、値域、順序はP4-1Aで提示し、実装前に再承認を得る。

MC2/MC3は従来どおりdecode可能にする。旧recipeには巻線記録がない事実を明示し、`coilTurns`等の旧集計値から架空の巻線記録を生成しない。破損recipeはfail-closedとし、黙ったfallbackを禁止する。

`RECIPE_KEY_VERSION`を1から2へ上げる。P4-1Cで巻線分布が線長・抵抗・占積へ接続されるため、canonical巻線記録そのもの、または全単射な正規形をrecipeKey入力へ含める。衝突可能なhash・要約による代替は禁止する。

巻線から導出できる方向一貫性ratioをrecipeへ二重収載しない。

### P41-R4: RunSnapshot contract 4

save 3、recipe MC4、recipeKey 2、RunSnapshot contract 4への昇版を、それぞれ1回だけ行う。サブゲートごとの再昇版を禁止する。

RunSnapshot 3から4への昇版理由はD10形状追加とする。巻線由来ratioはP41-R1の`MotorConfig`内フィールドで保持し、snapshotの独立第二チャネルを追加しない。

既存図鑑にはcontract version 3のreplaySnapshotが保存済みであるため、v3 snapshotを非救済にしてはならない。restore側でD10既定値を補完し、v3 snapshotを受理する一方向migrationを必須とする。

全migrationは次を守る。

- 旧版読込可能。
- deep validator。
- 破損はfail-closed。
- 黙ったfallback禁止。
- write失敗時にメモリ上だけ成功扱いしない。
- 既存データを破棄しない。

### P41-R5: D01閾値の移設

`COIL_DEFORM_OMEGA`相当を`DestructionConfig.d01`へ、`coilDeformOmegaRadS`等の単一フィールドとして移設する。これはengine凍結方針§2(b)の破壊モード拡張範囲内とする。

条件:

1. 既定値は現行定数と厳密同値。
2. 移設だけの段階では既存全テストが再基準化なしで通ること。
3. D01発火閾値と漸減積分閾値は移設後も同じ単一フィールドを参照する。二つの閾値へ分裂させない。
4. `varnished`は素材由来のbooleanのまま維持し、張力を`varnished`へ読み替えない。
5. 張力写像からの供給値はP4-1Cで有限sweepし、exact候補をproduction反映前に人間へ提示する。

### P41-R6: spec改訂2件とD10不変条件

spec §9.5はP41-R2の意味で是正する。

spec §9.4は次の意味へ精密化する。

- 禁止する「成否二値の判定」は、隠れた判定、抽選、反応時間QTEである。
- 連続量が可視的に蓄積し、実在物性由来の決定論的閾値へ達して起きる線材破断は、この禁止の対象外とする。

D10は次を不変条件としてP4-1Fでexact状態機械を確定する。

1. 非終端で進行性。
2. 初回latchによる1破壊1event。
3. 実効巻数低下はP41-R1の単一乗算点への第3因子だけで適用。
4. D01/D02/D05の既存確定契約を変更しない。
5. temperature規約はモード別に明示裁定する。
6. 最終DestructionStateから劣化を一意に導出する。
7. 図鑑登録、リプレイ、二重報酬防止へPhase 3契約マトリクスを全面適用する。
8. エッジ接触の正典入力はP4-1E完了後に接続し、仮入力を先行新設しない。

### P41-R7: 工程内の線材破断契約

線材破断は候補Aを条件付き採用する。D01〜D10とは別の、巻線工程内の物理的帰結として扱い、新しいD番号を追加しない。

条件:

1. 素材カタログの引張強度比へアンカーし、絶対スケールは`designAssumption`として明示する。
2. 破断までの損傷は連続量として蓄積し、線の細りや治具の伸び等で連続的に見せる。
3. 乱数、抽選、反応時間QTE、隠れた正解帯を一切含めない。
4. 破断時の巻きかけ記録、消費済み線材、再開方法をP4-1C計画でexactに確定し、人間再承認を得る。
5. 破断によって保存済み資産や在庫を遡及破壊しない。
6. 新規D番号を作らない。
7. P4-1Cで数値込み契約を提示する。
8. 破断を採用した操作性は別の人間試遊で最終判定する。

## 3. 技術論点8・9の裁定（事前承認から意味変更なし）

### challenge制約

- 上限は`min(computeMaxTurns(wireGauge, parallelStrands), challenge上限)`。
- 上限到達後の追加turnを拒否する。
- 固定巻数は目標到達前に完成不可、超過turnを拒否する。
- 位置・腕・方向・張力をchallenge側が黙って補正しない。
- 失敗時は入力記録を保持する。
- 執行点はstore validator側とし、UI clampだけの二重契約を構造テストで禁止する。
- 既存challengeの全参照はP4-1Aで`rg`再列挙する。

### `src/p40/`撤去条件

P4-1中は凍結する。production半自動治具、共通契約、回帰証跡が正式側へ移管され、P4-0再現性を維持したことを確認後、P4-1末の別バンドルでディレクトリ単位削除を判断する。

tag `p4-0-complete`はgit履歴上の恒久再現点として残る。途中削除、選外案修理、production importは禁止する。

## 4. non-blocking申し送り全文

- N1: `restoreRunSnapshot`のbase ratio制限を、`effectiveTurnsRatio`依存閉包へ第4執行点として追加する。
- N2: 線材破断はD01〜D10ではなく工程内事象として扱い、新D番号を作らない。
- N3: Phase 3のG-R1、G6-R2等との交差はなく、gear・CourseModeへ触れない。

## 5. P4-1A契約凍結の必須チェックリスト

- 計画§7の依存閉包へ`restoreRunSnapshot`、`codexRecords`内v3 replaySnapshot、sweep系を追加する。
- 単一tsconfig全体で`rg`を再実行し、fixture追随と公開契約変更を分けたexpected file setを固定する。
- versionはsave 3 / recipe MC4 / recipeKey 2 / RunSnapshot 4。各1回だけ昇版する。
- validatorはmaterial-composed base、snapshot restore、save、recipe decodeで同じ意味・範囲を単一出典から使う。
- 最低限の負例: 0/1/9/10/150/151turn、非量子化値、ratio=0、損傷−0.01/1.01、旧save復元、v3 snapshot復元、MC3 decode、MC4破損、在庫不足、write失敗、challenge上限交差、D10形状なし旧図鑑replay。

## 6. 今回の再承認で解禁しないもの

- production/test実装。
- spec/art-specの確定変更。
- 公開型、schema、recipe、snapshotの実装。
- 物理値・較正値のproduction反映。
- D10状態機械。
- commit、tag、push、deploy。

## 7. 承認文

承認する場合は、次の内容で足りる。

> P4-1 arbiter正式レビューの条件付き承認判定全文、P41-R1〜R7、技術論点8・9の確定条件、non-blocking申し送りN1〜N3、およびP4-1A契約凍結チェックリストを承認します。P4-1Aのexact型・canonical encoding・version・migration・validator・依存閉包の詳細化へ進めてください。production/test実装、spec/art-spec確定変更、物理・較正・D10実装、commit・tag・push・deployは、各exact deltaの別途人間承認まで禁止します。
