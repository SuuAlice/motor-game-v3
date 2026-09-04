# P4-1C R3-E2 実装受入レビュー

実施日: 2026-09-02  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **IMPLEMENTATION ACCEPTED。store破断消費境界と追随3点を閉じ、全検証通過。P4-1C工程完了はC3人間試遊待ち**

## 1. 通過した確認

- 対象5ファイル・316テスト通過。
- 全106ファイル・2782テスト通過。
- build、lint、`tsc -b`、material sweep型検査、Phase 4型検査通過。
- `git diff --check`通過。
- 破断判定はrecord追加前、成功後だけ`wireBroke` dispatch、prefix保持、brokenからreset以外拒否、在庫上限のUI独自計算削除、確定UI文言、破断専用描画なしを確認した。
- spec/art-spec、engine、schema、D10、被膜、asset、音、Git/deployのR3追加差分なし。

最初の対象テスト実行は、セッションの`TEMP/TMP`がsandbox外のWindowsパスを指していたためVitest worker作成に失敗した。`TMPDIR/TEMP/TMP=/tmp`を明示して再実行し、対象・全検証とも通過した。リポジトリ起因ではない。

## 2. BLOCKING: `brokenTurnCount`のfail-closed不成立

`resolveWireBreakConsumption`は素材ID確認後、`computeConsumedWireM(brokenTurnCount, strands)`と在庫比較だけを行い、整数・正下限・schema上限・物理上限を検証していない。

read-only probe結果（在庫10 m、銅、並列1）:

```text
brokenTurnCount=-1   -> ok:true, consumedM=-0.043982..., 在庫10.043982... m
brokenTurnCount=0    -> ok:true, consumedM=0
brokenTurnCount=1.5  -> ok:true
brokenTurnCount=151  -> ok:true（MAX_WINDING_TURNS=150超過）
brokenTurnCount=NaN  -> ok:true, consumedM=NaN, 在庫NaN
```

これは次の承認契約と不一致である。

- R3-D2: 破断validatorは`brokenTurnCount <= resolveWindingTurnLimit(inventory, lot)`を再検証する。
- R3-D3: 完成validator、破断消費validator、表示が同じresolverを使う。
- 改竄入力・古い表示・他タブ競合・破損saveにfail-closedで対処する。

承認済み`ConsumeWireOnBreakCommand`は素材ID・並列本数・破断turn数の3fieldだけで線径を持たず、物理上限を同resolverで評価できない。承認済みfailure unionも`unknownWireMaterial / insufficientWire / persistFailed`だけで不正turn数を表す枝を持たない。したがって実装者が既存契約内で安全に補うことはできず、command/failure unionのexact deltaが必要である。

## 3. 現在の措置

- aliceのread-only再現により、負値での在庫増殖に加えて、`NaN`が永続化時に`null`となり次回起動時にsave validatorがセーブを拒否する経路まで確認した。
- arbiterは、承認済みR3-D2とR3-D6の契約矛盾、および自身のレビュー漏れを正式に認定した。
- arbiterは案Bを採用し、既存`WindingTurnLimitLot`を入れ子で再利用するcommand、`invalidTurnCount` failure、整数`1..limit`の事前検証を正式裁定した。loose field追加の案Aと既存failureへ偽装する案Cは却下された。
- brabitは正常UI経路から不正値が生成されないことを確認したが、storeのfail-closed責務は変わらないとして、追加編集せず停止している。
- 人間再承認対象は`docs/phase4-p4-1c-r3-store-boundary-human-reapproval.md`へ固定し、2026-09-02に承認された。
- aliceへstore側、brabitへUI側の機械的追随と必須回帰、全検証を再開するよう正式承認全文を中継する。
- 承認された7ファイル内のproduction/test是正だけを解禁し、commit、tag、push、deploy、PR、mergeは禁止を維持する。

## 4. 過剰設計監査

- 新規action・新規state・新規schema・新規resolverは追加しない。
- 既存の`WindingTurnLimitLot`と`resolveWindingTurnLimit`を再利用し、完成・破断・表示の単一出典を回復するだけである。
- 変更閉包はproduction 4ファイル、test 3ファイル、新規ファイル0に限定する。
- 正常UI経路のゲーム挙動、物理、較正、D10、被膜、描画、音は変更しない。

したがって、資産増殖・セーブ破損を閉じるために必要な最小の契約修正であり、目的外の拡張ではない。

## 5. 人間再承認後の独立受入（2026-09-02）

alice・brabitの是正後、次を確認した。

- countが`-1 / -100 / 0 / 1.5 / NaN / Infinity / 151 / 100000`のprobeはすべて`invalidTurnCount`となり、元の在庫増殖・NaN汚染は閉じた。
- 担当報告では全106ファイル・2806テスト、build、lint、通常/material/Phase 4型検査、禁止差分監査が通過した。

ただし正式受入前に次の3点を返却した。

1. 承認exact式は`Number.isInteger(count) && 1 <= count && count <= limit`だが、実装は`count > limit`を個別否定している。そのため`limit=NaN`では上限比較が偽となり、`windingWireGaugeMm=NaN`・`brokenTurnCount=1`が`ok:true`になることをread-only probeで確認した。exact論理式全体を否定する形へ直し、NaN limit回帰を追加する。
2. `src/store/saveStore.ts`に旧文言「素材ID・並列本数・破断ターン数だけ」が残り、承認済み凍結文言と不一致。`src/store/rotorAssembly.ts`にもunionを「3 kindだけ」とする古いJSDocが残る。承認済み2ファイル内のコメントだけ追随する。
3. 2026-09-02 deltaで承認外の8ファイル目`src/components/assembly/__tests__/windingStepState.test.ts`へ2テストが追加された。追加承認は求めず、そのdeltaを承認済み`windingStepWiring.test.ts`へ移し、前者をR3-E2本体時点SHA-256 `2305d78e792dcd3e464e10c72931546f44e8e5c679261e89d0c25f70f9ccf51b`へ戻す。

上記はいずれも新契約・新機能を導入せず、承認済み7ファイル内でexact条件と閉包を回復する追随である。追加の人間承認は不要と判定した。

## 6. 追随是正の最終受入（2026-09-02）

- predicateは承認式全体を否定する`!(Number.isInteger(count) && count >= 1 && count <= limit)`へ一致した。独立probeで`limit=NaN`は`invalidTurnCount`となる。
- `rotorAssembly.ts`のfailure数と`saveStore.ts`のlot説明は現契約へ追随した。
- 承認外8ファイル目の追加分は除去され、`windingStepState.test.ts`は指定SHA-256 `2305d78e792dcd3e464e10c72931546f44e8e5c679261e89d0c25f70f9ccf51b`へ復元、2テストは承認済み`windingStepWiring.test.ts`へ移設された。
- 独立対象検証は4ファイル・309テスト、独立全検証は106ファイル・2807テスト、build、lint、通常/material/Phase 4型検査、`git diff --check`がすべて成功した。
- `AGENTS.md`と`CLAUDE.md`は同一。commit、tag、push、deploy、PR、mergeは行っていない。

目的外のvalidator・failure・state・action・物理・較正・UI機能は追加していない。承認済み7ファイル閉包内のfail-closed回復として正式受入とする。

## 7. P4-1C工程完了との区別

本書で受け入れたのはR3-E2のproduction/test成果物とstore境界deltaである。P4-1C事前承認P41C-H6および計画G5は、破断を別の人間試遊で操作性判定することを要求しているため、P4-1C全体はまだ完了扱いにしない。

人間確認は次の最小範囲とする。

1. 高張力を維持すると33ターン目で破断し、画面には破断直前prefix 32ターンと「33ターン分を使いました」が表示される。
2. 破断後は巻線操作・完成・巻き足しができず、「新しい線材で巻き直す」だけで確認dialogなしに材料選択へ戻る。消費した線材は返らない。
3. 30ターン級は最大張力でも完成でき、張力を上げる利益と、上げ続ける危険の両方を操作・見た目から感じられる。

自動検証で固定済みの在庫原子性・prefix/消費一致・失敗時不変は人間に再試験させない。人間試遊後にP4-1C工程通過、docs同期、正式commit構成の順で別判定する。
