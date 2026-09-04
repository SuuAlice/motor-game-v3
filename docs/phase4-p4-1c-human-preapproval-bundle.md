# P4-1C 実装前・人間事前承認バンドル

作成日: 2026-08-30  
状態: **2026-08-30 人間事前承認済み。production/test実装、spec/art-spec確定変更、commit、tag、push、deployは引き続き未承認**

## 0. 目的と工程分割

P4-1Cの目的は、半自動治具で記録済みの張力をproduction性能とD01へ初めて接続し、「強く張る利益」と「切れないよう抑える判断」をゲームとして成立させることである。PID調整や正解帯探しにはしない。

一括実装せず、次の順に独立gateで進める。

1. **C1 張力利益**: 平均張力を既存`windingTurnsRatio`へ接続する純関数とread-only有限sweep。
2. **C2 D01接続**: D01の発火閾値を`DestructionConfig.d01`の単一出典へ移し、低張力による閾値低下をread-only有限sweepする。
3. **C3 破断契約**: 閾値・線材消費・失敗時非破壊性を別deltaとして実装し、別の人間試遊で操作性を判定する。

C1/C2のexact数値とC3のproduction実装は、sweep結果提示後の別途人間承認まで行わない。

## 1. 事前承認項目

### P41C-H1: P4-1Cの有限範囲

今回接続するproduction入力は**平均張力1軸だけ**とする。

- 方向一貫性は既存どおり維持する。
- 左右位置は既存`axisOffsetMm`だけを維持する。
- 張力ムラ（分散）、実軌跡長、渡り線長、占積の独立fieldは実装しない。
- 実軌跡長は、正典となる巻幅・腕間距離が未定のまま導入すると抵抗、質量、在庫消費を同時に動かすため、P4-1Cでは延期する。

### P41C-H2: 張力利益の表現

新しい`MotorConfig` fieldは追加せず、既存`windingTurnsRatio`の意味を次へ限定拡張する。

```text
windingTurnsRatio = directionConsistencyRatio × tensionPackingRatio
```

- 両因子と積は`(0, 1]`。
- `tensionPackingRatio`は平均張力に対して単調非減少とし、高張力側へ任意の罰を置かない。
- D01との合成点は既存の1か所だけを維持し、`effectiveTurnsRatio = windingTurnsRatio × d01Ratio`とする。
- `coilTurns`、canonical E2、MC4、recipeKey v2、save schemaは変更しない。
- 品質点、推奨値、正解帯、緑黄赤ゲージは追加しない。

これはP4-1Aで「方向一貫性」として凍結した定義の限定拡張であるため、production反映前にarbiterの正式レビューを必須とする。

### P41C-H3: 張力集計と量子化

- 入力はcanonical `WindingRecord`の各turnが持つ`0..256`の張力量子値だけとする。
- C1/C2では算術平均だけを使う。分散、最大値、連続高張力区間は混ぜない。
- record順、位置、腕、方向を張力計算のために変更しない。
- 同じrecordから常に同じ値を得る純関数とする。乱数、時刻、ポインタ速度、反応時間は参照しない。

### P41C-H4: D01閾値の単一出典化

既承認P41-R5どおり、`COIL_DEFORM_OMEGA`相当を次へ移す。

```ts
DestructionConfig.d01.coilDeformOmegaRadS
```

- migration時のdefaultは現行2000 rpm相当のexact値とし、挙動変更0・既存数値回帰の再基準化0。
- D01の発火判定と発火後の超過回転曝露は、必ず同じfieldを使う。
- `MotorConfig`へ同値fieldを複製しない。
- 推奨配線は、production wrapperから物理stepへ当該スカラーを明示的に渡す案とする。シグネチャと全呼出し箇所のexact依存閉包はarbiterへ提示し、正式レビュー後に確定する。
- `varnished`は既存booleanのまま維持し、張力へ読み替えない。D01張力較正は`varnished=false`のfixtureで行う。

### P41C-H5: C1/C2 read-only有限sweep

production値を変更する前に、次を別々に実行してexact候補を提示する。

1. C1: 平均張力`0/256..256/256`の257点で、`tensionPackingRatio`、実効巻数率、代表run結果を出す。
2. C2: 同じ257点で、D01閾値、発火step、発火しない範囲、発火後の進行を出す。
3. 各sweepは張力以外のrecord、素材、run seed、物理入力を固定する。
4. C1係数とC2係数は同時較正せず、個別候補を出した後に固定代表点だけで交差確認する。

停止条件:

- 低張力と高張力で観測可能な差が出ない。
- 通常操作域の全てでD01が発火する、または全域で発火しない。
- 1/256格子を尽くす前に候補なしと結論しそうになる。
- 張力ムラ、位置、素材を第二入力として同時に動かす必要が生じる。
- exact値をsweep結果ではなく「それらしい値」で置く必要が生じる。

### P41C-H6: 破断はP4-1C内の別deltaに分離

破断のゲーム性は採用するが、C1/C2と同時実装しない。C1/C2のexact値確定後、**P4-1C-C3**として別途人間承認を受ける。

C3で維持する契約:

- 破断turnは完成済み`WindingRecord`へ含めない。recordは破断直前のprefixを保持する。
- 消費線材長は破断turnを含む`record.length + 1`ターン分とする。
- 破断後は完成禁止。途中継ぎは導入せず、新しいロットで最初から巻き直す。
- 消費済み線材は戻さない。
- 破断は新D番号・図鑑イベントにせず、工作工程内の物理的失敗として扱う。
- 既存ローター、装備、保存レシピ、図鑑、ノート、所持金を遡及変更しない。

### P41C-H7: C3の原子境界

C3では、線材消費をstoreのResult action 1点に限定する。

- UIは素材ID、並列本数、破断turn数だけを渡し、現在在庫はstoreが読む。
- 成功時だけ永続化と工程`broken`状態への遷移を反映する。
- 在庫不足、未知素材、永続化失敗は在庫・工程stateとも不変にする。0へのclampや部分消費をしない。
- 巻き始め前に、既存の線長単一出典を使って`maxTurnsByStock`を求め、物理上限・150ターン上限との最小値を巻ける上限とする。
- 破断はローターを生成しないため、`RotorAssemblyState`、save schema、canonical E2、MC4、recipeKey v2を変更しない。

新規action/typeのexact名称、`broken`枝、テスト閉包はC3着手前の別途人間承認対象とする。

### P41C-H8: 素材許容と一次資料

素材別の破断許容は、全素材について一次資料の比較条件を揃えられるまでproductionへ入れない。

- 相対比は線材メーカーまたは規格発行元の一次資料に基づく。
- ゲーム内0..1張力への絶対換算は、実在値と分離した`designAssumption`として明記する。
- 一次資料が揃わない素材へ推測値を補わない。共通仮値で素材差を装うこともしない。
- 参考アンカーとして、ELEKTRISOLAのIEC/JIS丸銅エナメル線表は0.400 mmの最大巻線張力を854 cNとする。ただし、これは銅線・当該線径の資料であり、アルミ線・純銀線の相対比を正当化しない。

一次資料:

- ELEKTRISOLA, Technical Data by Size: <https://www.elektrisola.com/en-us/Products/Enamelled-Wire/Technical-Data>
- IEC/JIS round copper enamelled wire PDF: <https://www.elektrisola.com/Attachments/TechnicalDataBySize/ELEKTRISOLA_EnCuWire_IECJIS_Datasheet_eng.pdf>

### P41C-H9: UI観測境界

既存の張力幾何、完成巻線図、D01 HUD・粒子・SE・図鑑を使う。

- C1/C2では新しいUI、色、asset、音、ゲージ、説明文、予測表示を追加しない。
- C3の破断表示は、既存巻線図でprefixを残し、完成不可と巻き直しを日本語で示す最小UIだけを別途計画する。
- 被膜の斑点、エッジ接触、D10はP4-1Fまで実装しない。

### P41C-H10: arbiterへ諮る技術論点

人間事前承認後、次を全文でarbiterへ諮る。

1. `windingTurnsRatio`を方向一貫性×張力占積へ限定拡張しても、P4-1Aの単一合成点・recipe十分性・replay決定論を壊さないか。
2. `DestructionConfig.d01.coilDeformOmegaRadS`を発火判定と進行へ単一供給する最小のstepシグネチャと依存閉包。
3. C1/C2を平均張力1軸に限定し、張力ムラ・実軌跡長・素材差・破断書込みを分離する境界が妥当か。
4. C3の「recordはN-1、消費はN」、完成禁止、原子消費、在庫上限、非遡及保証がstore契約として十分か。
5. 一次資料未充足時に素材別破断値を停止する規律が実在素材主義を満たすか。

## 2. 全体禁止事項

この事前承認で解禁しないもの:

- production/test実装、production較正値の変更
- spec/art-spec確定変更
- 張力ムラ、実軌跡長、占積の独立field、素材別破断値
- 被膜損傷、エッジ接触、D10、整流子、台座、釘、台紙
- 新しい品質点、正解帯、ヒートマップ、PID、QTE、乱数
- package、汎用sweep/UI/E2E基盤
- commit、tag、push、deploy、PR、merge

## 3. 承認後の次工程

1. 本文をP4-1Cの人間事前承認記録として固定する。
2. aliceがengine/store依存閉包を、brabitがC3最小UI閉包をread-onlyで確定する。
3. arbiterへP41C-H1〜H10とexact依存閉包を全文提示する。
4. arbiter判定を人間へ全文提示する。
5. 人間再承認後に限り、C1の純関数・read-only sweepから着手する。

## 4. 人間事前承認記録

2026-08-30、人間プロジェクトリードが次の文面で本書P41C-H1〜H10全文を承認した。

> H1〜H10を承認します

この承認は、本書が明記するexact依存閉包の確定とarbiter正式レビューへの進行を解禁する。production/test実装、production較正値の変更、spec/art-spec確定変更、commit、tag、push、deploy、PR、mergeは解禁しない。
