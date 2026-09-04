# P4-1C R2-C2配線閉包・人間再承認バンドル

作成日: 2026-09-01  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **実装・検証完了、人間再承認受領済み**

## 1. 実装結果

- `K_LOOSE=0.5`を`src/materials/destructionCalibration.ts`の単一出典へ反映。
- 承認済み式`COIL_DEFORM_OMEGA × (1 − K × (1 − meanTension))`を純関数`resolveCoilDeformOmegaRadS`として実装。
- `assembleDestructionConfig`が装備中巻線記録からD01閾値を解決し、`gameStore`はrecipeKeyへ渡したものと同じ局所変数`windingRecord`を再利用。
- P4-1C計画へ承認済み付帯3点を追記。
- 本deltaは8ファイル、新規0。新規テスト7件を追加。
- 106 files / 2733 tests、build、lint、material/Phase 4 sweep型検査、`git diff --check`、禁止差分監査が全て成功。
- commit、tag、push、deploy、PR、mergeは0件。

## 2. 承認文外だった判断1: assembler第3引数の必須化

exactシグネチャ:

```ts
assembleDestructionConfig(
  selection: MaterialSelection,
  equipmentContext: EquipmentDestructionContext,
  windingRecord: WindingRecord | null,
): DestructionConfig
```

`windingRecord`をoptionalにすると、記録が存在するのに呼出側が渡し忘れ、締め側の既定閾値で走る状態が静かに成立する。必須の`WindingRecord | null`とすることで、正規記録かlegacyを全呼出側に明示させる。3引数は相互に異なる型で、転置も型検査で検出される。

production閉包は定義`src/materials/materialMapping.ts`と実呼出し`src/store/gameStore.ts`の2ファイル。test閉包は5ファイルで、`rg`による全参照列挙と型検査を完了している。新規ファイルはない。

Suu_mot3受入判定: **採用を推奨する。** 新しい物理・action・型の追加ではなく、承認済み記録依存をfail-fastに搬送するための機械的契約である。

## 3. 承認文外だった判断2: legacy個体のfallback

`windingRecord === null`では`COIL_DEFORM_OMEGA`をそのまま返す。

- 記録がない個体へ仮の張力を与えない。
- P4-1C移設前のD01挙動を維持する。
- default定数は既存export`COIL_DEFORM_OMEGA`だけを参照し、同値定数を増やさない。
- legacy、meanTension=0/0.5/1、ターン数非依存、D01他field不変をテスト済み。

Suu_mot3受入判定: **採用を推奨する。** 旧データの張力捏造を避ける唯一の挙動変更0案であり、P4-1Aのlegacy record=`null`契約とも整合する。

## 4. 台帳記録先

Suu_mot3管理の次の正式裁定文書を本件の台帳とする。

- `docs/phase4-p4-1c-r2-c2-normal-operation-report.md`
- `docs/phase4-p4-1c-r2-c2-arbiter-final-decision.md`

これらに、arbiter文言欠陥、無ワニス選択の先にだけD01がある構造保証、攻め側発火境界の実測値が記録済みである。aliceによる追加の台帳ファイル作成・追記は不要とする。

## 5. exact人間再承認文

> P41C-R2-C2配線閉包deltaを承認します。`assembleDestructionConfig`の第3引数を必須の`windingRecord: WindingRecord | null`とし、gameStoreはrecipeKeyへ渡したものと同じ巻線記録をそのまま渡してください。legacy個体の`null`は`COIL_DEFORM_OMEGA`を維持し、張力を推定・捏造しないでください。現在の8ファイル・新規7テスト・付帯docs追記を受け入れます。台帳はSuu_mot3管理の正式裁定文書2件で充足し、追加台帳ファイルは作成しません。R3、spec/art-spec、commit・tag・push・deploy・PR・merge、追加sweep、係数・式・FRAMES変更は禁止を維持してください。

この承認は現在の実装を受け入れるだけであり、追加変更やR3着手を解禁しない。

## 6. 人間再承認記録

2026-09-01、人間プロジェクトリードが次の全文で承認した。

> P41C-R2-C2配線閉包deltaを承認します。assembleDestructionConfigの第3引数を必須のwindingRecord: WindingRecord | nullとし、gameStoreはrecipeKeyへ渡したものと同じ巻線記録をそのまま渡してください。legacy個体のnullはCOIL_DEFORM_OMEGAを維持し、張力を推定・捏造しないでください。現在の8ファイル・新規7テスト・付帯docs追記を受け入れます。台帳はSuu_mot3管理の正式裁定文書2件で充足し、追加台帳ファイルは作成しません。R3、spec/art-spec、commit・tag・push・deploy・PR・merge、追加sweep、係数・式・FRAMES変更は禁止を維持してください。

この承認により現在の8ファイルを受入済みとする。追加編集・R3着手・Git/deploy操作は解禁しない。
