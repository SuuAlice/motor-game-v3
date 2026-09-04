# P4-1C R3 store破断消費境界 人間再承認バンドル

提示日: 2026-09-02  
状態: **2026-09-02 人間再承認済み・限定実装中**

承認原文: 「承認します」  
承認対象: 本文§6の承認文全文

## 0. 再承認が必要な理由

承認済みR3-D2は、破断時のstore validatorが
`brokenTurnCount <= resolveWindingTurnLimit(inventory, lot)`を再検証することを要求している。
一方、承認済みR3-D6の`ConsumeWireOnBreakCommand`は素材ID・並列本数・破断turn数の3fieldしか持たず、物理上限の計算に必要な線径を持たない。したがって、承認時点から両契約は同時に実装不能だった。

この矛盾はarbiterの正式レビューでも見逃され、Suu_mot3の実装受入時runtime probeで発見された。arbiterはレビュー漏れを正式に認定し、台帳へ残すよう裁定した。

在庫10 m、銅、並列1での再現:

```text
-1       -> ok:true、在庫10 -> 10.043982... m（資産増殖）
0        -> ok:true、消費0
1.5      -> ok:true
NaN      -> ok:true、在庫NaN（永続化後にsave破損へ到達）
151      -> ok:true（schema上限150超過）
Infinity -> 現行ではinsufficientWire
```

正常UI経路は整数かつ上限内の値だけを生成するが、R3-D2のstore境界は、改竄入力・古い表示・他タブ競合・破損saveに対してUIを信用せずfail-closedにする責務を持つ。このためUIの正常性だけでは欠陥を許容できない。

## 1. arbiter正式裁定: 案B採用

### 1.1 command exact形

既存型`WindingTurnLimitLot`をそのまま再利用し、次の形へ変更する。

```ts
interface ConsumeWireOnBreakCommand {
  readonly lot: WindingTurnLimitLot;
  readonly brokenTurnCount: number;
}
```

`WindingTurnLimitLot`は既存どおり次の3fieldを持つ。

```ts
interface WindingTurnLimitLot {
  readonly wireMaterialId: string;
  readonly windingWireGaugeMm: number;
  readonly windingParallelStrands: 1 | 2;
}
```

線径だけを4番目のloose fieldとして追加する案Aは、既存lot型と別経路で同じ情報を運び単一出典を弱めるため却下する。既存3field commandの維持もR3-D2/D3を満たせないため却下する。

### 1.2 failure union exact delta

次の1kindだけを追加する。

```ts
| {
    readonly kind: 'invalidTurnCount';
    readonly count: number;
    readonly limit: number;
  }
```

負値・0・非整数・`NaN`・`Infinity`・上限超過を`insufficientWire`等の既存failureへ写像する案Cは、破損分類を偽るため却下する。

### 1.3 validator exact条件

素材の存在確認後、線材消費計算・永続化より前に次を満たさない入力を`invalidTurnCount`として拒否する。

```ts
const limit = resolveWindingTurnLimit(inventory, command.lot);

Number.isInteger(command.brokenTurnCount)
  && 1 <= command.brokenTurnCount
  && command.brokenTurnCount <= limit
```

つまり有効範囲は整数`1..limit`だけである。拒否時はメモリ上の在庫・永続内容を一切変更しない。

### 1.4 凍結文言の是正

旧文言:

> UIは素材ID、並列本数、破断turn数だけを渡す。

新文言:

> UIはロット（素材ID・線径・並列本数）と破断turn数だけを渡し、現在在庫はstoreが読む。

lotはH8で巻き始めに固定済みのUI既知情報であり、在庫authorityがstoreにある境界は変更しない。

## 2. 実装閉包

production 4ファイル、test 3ファイル、新規ファイル0に限定する。

- `src/store/rotorAssembly.ts`: command型、failure union、validator本体
- `src/store/saveStore.ts`: 型追随と既存actionの引数追随
- `src/components/assembly/CoilWindingStep.tsx`: `lot`と`brokenTurnCount`を渡す機械的追随
- `src/components/assembly/windingStepState.ts`: `invalidTurnCount`の網羅caseと簡潔な日本語文言
- `src/store/__tests__/rotorAssembly.test.ts`
- `src/store/__tests__/saveStore.test.ts`
- `src/components/assembly/__tests__/windingStepWiring.test.ts`

UI文言は正常操作では到達しない整合性エラーとして、原因断定・助言・評価語を加えず簡潔にする。新規asset・音・ゲージ・色・D番号・action・stateは追加しない。

## 3. 必須回帰

- `-1`、`0`、`1.5`、`NaN`、`Infinity`、`151`を恒久負例として固定する。
- 物理上限超過と在庫上限超過を、同じresolverを用いる境界テストで固定する。
- `1`と上限ちょうどを正例として固定する。
- 全負例でメモリ在庫・永続内容が不変で、書込みへ到達しないことを固定する。
- `ok:true`なら`consumedM`は有限かつ正で、在庫が必ず減ることを固定する。
- 既存UIの`brokenTurnCount = prefix.length + 1`、record追加前判定、成功後だけ`wireBroke` dispatchを維持する。
- 全test、build、lint、通常型検査、material sweep型検査、Phase 4型検査、禁止差分監査を再実行する。

## 4. 維持する禁止事項

物理、較正、engine、`materials.ts`、save schema、canonical E2、recipeKey v2、MC4、D10、被膜、asset、音、新色、新D番号、図鑑、sweep基盤は変更しない。commit、tag、push、deploy、PR、mergeも引き続き禁止する。

## 5. 過剰設計防止

このdeltaは既存lot型・既存resolver・既存actionを再利用し、資産増殖とセーブ破損を閉じて承認済みR3-D2/D3を実装可能に戻すだけである。正常UI経路のゲーム挙動や新機能を増やさない。上記7ファイルを超える必要が判明した場合は停止し、再提示する。

## 6. 承認文

承認する場合は、次の全文を承認する。

> P4-1C R3 store破断消費境界の補足裁定全文を承認します。ConsumeWireOnBreakCommandを`{ lot: WindingTurnLimitLot; brokenTurnCount: number }`へ変更し、`invalidTurnCount { count, limit }`を追加し、整数`1..resolveWindingTurnLimit(inventory, lot)`だけを消費前に受理してください。負値・0・非整数・NaN・Infinity・151、物理上限・在庫上限、正例境界の回帰を固定し、提示された7ファイル・新規ファイル0の閉包に限定してください。物理・較正・その他の禁止事項、commit・tag・push・deploy・PR・merge禁止を維持してください。
