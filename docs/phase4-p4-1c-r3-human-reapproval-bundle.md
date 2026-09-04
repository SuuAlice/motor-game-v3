# P4-1C R3（C3張力破断）実装前統合裁定・人間再承認バンドル

作成日: 2026-09-01  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **2026-09-01人間承認済み。計画固定とarbiter補足照会だけを解禁。production/test実装、commit、tag、push、deployは禁止**

人間プロジェクトリード承認文:

> P4-1C R3実装前統合裁定R3-D1〜D8全文、およびarbiter補足照会への着手を承認します。

## 1. 現在地

alice_mot3のengine/store/H8閉包とbrabit_mot3のUI閉包がread-onlyで揃った。両担当ともrepo編集、新規ファイル、commit、tag、push、deploy、PR、merge、別セッション起動は0件で停止している。

R3の実装を始めるには、既承認契約と現行実装の間にある次の不足を先に裁定する必要がある。

1. `broken`から抜けるactionは既存`reset`だけで足りるが、`broken`へ入る既存actionがない。
2. 在庫上限と破断turn消費の境界をexact化する必要がある。
3. UIに残る在庫非考慮の`resolveDisplayTurnLimit`を廃止し、store権威へ一本化する必要がある。
4. 素材4種を同条件で比較できる一次資料が揃わず、素材別破断閾値を正当化できない。
5. 素材非依存の破断判定についても、蓄積式・閾値・有限sweepがまだ提示されていない。

したがって今回の承認対象は、以下の統合裁定とarbiter補足レビュー・read-only較正計画までである。production/test実装は解禁しない。

## 2. 維持する凍結契約

- 破断turn `N`は完成済み`WindingRecord`へ含めず、`record`は長さ`N−1`の破断直前prefixを保持する。
- 消費線材長は破断turnを含む`computeConsumedWireM(N, parallelStrands)`とする。
- 破断後は完成禁止。途中綁ぎを導入せず、新しいロットで最初から巻き直す。
- 消費済み線材は戻さない。
- 破断は新D番号・図鑑イベントにせず、工作工程内の失敗とする。
- ローターを生成せず、既存ローター、装備、保存レシピ、図鑑、ノート、所持金、`RotorAssemblyState`、save schema、canonical E2、MC4、recipeKey v2を変更しない。
- 線材消費はstoreのResult action 1点だけで行う。UIは素材ID、並列本数、破断turn数だけを渡し、現在在庫はstoreが読む。
- 在庫不足、未知素材、永続化失敗では在庫・工程stateとも不変。0 clamp・部分消費を禁止する。
- `computeConsumedWireM`を線長計算の単一出典とする。
- 新asset、音、ゲージ、新色、説明基盤、保存field、物理軸、sweep基盤を追加しない。

## 3. 統合裁定案

### R3-D1: `broken`へ入るactionを1種だけ許可する

次のactionを`WindingStepAction`へ追加する。

```ts
| { readonly kind: 'wireBroke' }
```

- `wireBroke`は`winding`からのみ受理し、`{ kind: 'broken', lot, record }`へ遷移する。
- `record`は破断turnを含まないprefixである。
- store Resultが`ok:true`を返した直後だけUIが`wireBroke`をdispatchする。
- `ok:false`ではdispatchせず、在庫・工程stateをともに不変とする。
- `broken`から受理するactionは既存`reset`だけとし、`wireBroke`を含む他actionは同一stateを返す。

既承認の「新actionを追加しない」は、破断後の消去・再開に`discardBroken`等を増やさず既存`reset`だけを使う境界として維持する。`broken`への入口は現行actionで表現不能なので、この1種だけを有限例外として明示承認する。理由union、途中継ぎ、専用reset actionは追加しない。

### R3-D2: 在庫1ターン留保は採用しない

`resolveWindingTurnLimit`は現行の完成可能上限を常時1減らさない。

```ts
turnLimit = Math.min(
  MAX_WINDING_TURNS,
  computeMaxTurns(windingWireGaugeMm, windingParallelStrands),
  computeMaxTurnsByStock(availableM, windingParallelStrands),
)
```

理由:

- 破断turnが`N`なら保持prefixは`N−1`、消費は`N`である。
- 在庫がちょうどNターン分なら、N本目の試行で破断しても消費Nを満たす。
- 上限N到達後はN+1本目を試行させないため、正常UI経路で「prefix=Nの後にN+1本目が破断」は構築しない。
- 1ターン留保を常時入れると、破断しない正常完成でも利用可能在庫より1ターン少なくなり、既存挙動を不要に変更する。

破断validatorは`brokenTurnCount <= resolveWindingTurnLimit(inventory, lot)`を再検証する。在庫不足failureは、改竄入力、古い表示、他タブ競合、破損saveに対するfail-closedとして残す。

### R3-D3: 在庫上限をstore権威へ一本化する

新規純関数を次の配置・シグネチャで採用する。

```ts
// src/materials/assumedGeometry.ts
export function computeMaxTurnsByStock(
  availableM: number,
  parallelStrands: 1 | 2,
): number;

// src/store/rotorAssembly.ts
export interface WindingTurnLimitLot {
  readonly wireMaterialId: string;
  readonly windingWireGaugeMm: number;
  readonly windingParallelStrands: 1 | 2;
}

export function resolveWindingTurnLimit(
  inventory: PlayerInventory,
  lot: WindingTurnLimitLot,
): number;
```

- `computeMaxTurnsByStock`は`computeConsumedWireM(1, parallelStrands)`の逆算だけを使い、新定数を導入しない。
- 非有限・0以下の在庫は0を返す。
- `resolveWindingTurnLimit`だけが物理上限・schema上限・在庫上限の最小値を決める。
- 完成validator、破断消費validator、表示が同じresolverを使う。
- `WindingLot`へ在庫量を保存しない。
- UI独自の`resolveDisplayTurnLimit`と`computeMaxTurns` importは削除する。

表示用には、saveStoreが現在在庫を内部で読むread-only queryを1点だけ公開し、`AssemblyMode`がその関数を`resolveTurnLimit` propとして`CoilWindingStep`へ渡す。`CoilWindingStep`と`LotChooser`は在庫を直接読まず、計算・clampもしない。新しい書込みactionは追加しない。

### R3-D4: 任意破棄と破断後resetを分離する

- 通常の「材料を選び直す」は現行`discardLot()`→確認dialog→`changeLot`を変更しない。
- 破断後の「新しい線材で巻き直す」は`restartAfterBreak()`→確認dialogなし→既存`reset`を使う。
- `changeLot`を`reset`へ統合しない。既存の任意破棄挙動を変更しない。
- 「破断後に使える消去actionはresetだけ」という意味で既承認契約を維持する。

### R3-D5: 消費ターン表示はprefixから導出する

UI文言は次で固定する。

- 状態文: `線材が切れました。この巻線は完成できません。`
- ボタン: `新しい線材で巻き直す`
- 消費事実: `切れるまでに {record.length + 1} ターン分の線材を使いました。`

`record.length + 1`は既承認の破断契約そのものであり、物理量の別計算ではない。表示専用の`consumedTurnCount` fieldや新stateを追加しない。store側では同じ`brokenTurnCount`を`computeConsumedWireM`へ渡し、構造テストで両者の一致を固定する。

### R3-D6: store Result actionとfailure union

既存`src/store/rotorAssembly.ts`へ同居させ、新規productionファイルを作らない。

```ts
export interface ConsumeWireOnBreakCommand {
  readonly wireMaterialId: string;
  readonly windingParallelStrands: 1 | 2;
  readonly brokenTurnCount: number;
}

export type ConsumeWireOnBreakFailure =
  | { readonly kind: 'unknownWireMaterial'; readonly materialId: string }
  | { readonly kind: 'insufficientWire'; readonly requiredM: number; readonly availableM: number }
  | { readonly kind: 'persistFailed'; readonly detail: string };

export type ResolveWireBreakConsumptionResult =
  | { readonly ok: true; readonly inventory: PlayerInventory; readonly consumedM: number }
  | { readonly ok: false; readonly failure: ConsumeWireOnBreakFailure };

export function resolveWireBreakConsumption(input: {
  readonly command: ConsumeWireOnBreakCommand;
  readonly inventory: PlayerInventory;
}): ResolveWireBreakConsumptionResult;
```

saveStore interfaceへ追加する書込みactionは1点だけとする。

```ts
consumeWireOnBreakAction: (command: ConsumeWireOnBreakCommand) =>
  | { ok: true; consumedM: number }
  | { ok: false; failure: ConsumeWireOnBreakFailure };
```

成功時は`writeOrFail`成功後だけmemory stateを更新する。在庫不足、未知素材、永続化失敗ではmemory・永続内容・工程stateをすべて不変とする。他素材、ローター、装備、config、ID、所持金、図鑑、ノートを変更しない。

### R3-D7: 素材別破断値を不採用とする

H8調査の結果、同条件の最大巻線張力を確認できたのは銅だけである。

- 成立: ELEKTRISOLA公式 IEC/JIS丸銅エナメル線。0.400 mmの最大巻線張力854 cN。
  - <https://www.elektrisola.com/Attachments/TechnicalDataBySize/ELEKTRISOLA_EnCuWire_IECJIS_Datasheet_eng.pdf>
- 不成立: アルミ線、純銀線、銀メッキ銅線。4素材を同一条件で比較できる一次資料は未充足。
- 銅値を他素材へ外挿しない。銀メッキ銅を「銅に近い」と推定しない。
- `WireMaterial`へ張力許容fieldを追加しない。
- C3では素材別閾値・相対比を実装しない。

素材差の将来解禁条件は、4素材すべてについて丸線・エナメル被覆・同一径・同一規格で直接比較可能な一次資料が揃うこととする。1素材でも欠ける場合、欠落値をdesignAssumptionで補わない。

### R3-D8: 破断判定のexact式・閾値は未承認のまま分離する

素材非依存の共通破断判定を採る場合も、0..1張力から破断までの蓄積式・閾値は`designAssumption`であり、現時点ではexact候補がない。よって今回の裁定だけでproductionへ値を置かない。

次工程としてarbiterへ次を補足照会する。

1. R3-D1の入口action 1種が、既承認の「破断後は既存resetだけ」と両立するか。
2. R3-D2の在庫留保なし境界が、record=N−1・消費=N・上限Nを矛盾なく満たすか。
3. store書込み成功後にlocal reducerへ`wireBroke`を同期dispatchする既存同型境界で、H7の原子性を満たすか。
4. 素材差0のまま、極端な高張力の継続だけを入力にする最小の決定論的蓄積式候補。
5. ランダム即死、反応時間QTE、正解帯ゲージ、張力ムラ・位置・素材の第二入力、被膜/D10先取りを避けたread-only有限sweepの入力格子・出力・受入条件・停止条件。

arbiter判定後、exact式・候補値・有限sweepを別途人間再承認する。sweep結果提示後にproduction値と実装全体をさらに別途人間承認する。

## 4. UI受入境界

- 既存巻線図で破断直前prefixをそのまま表示し、破断専用描画を追加しない。
- `broken`中はA/D/W/S/Space/R・pointerによる巻線操作、完成、巻き足しを受理しない。
- 「新しい線材で巻き直す」は通常の`button`、44 px以上、色だけに依存しない。
- 状態文は既存`role="status"`常設ノードを使い、新しい通知基盤を作らない。
- 自動フォーカス移動は行わない。
- 新asset・音・ゲージ・新色・図鑑・D番号を追加しない。

## 5. テスト・監査閉包

- `record.length === N−1`、消費=`computeConsumedWireM(N, strands)`、2本並列は消費2倍。
- 成功時だけ対象線材をexact量減算。他在庫・既存資産は不変。
- 在庫不足、未知素材、永続化失敗でmemory・永続内容・工程stateが不変。0 clamp・部分消費なし。
- `broken`で`canRequestCompletion === false`。
- `wireBroke`は`winding`からのみ受理。
- `broken`から`reset`以外の全actionは同一stateを返す。
- `reset`後は`lotPending`、在庫非返却。
- `currentRecord(broken)`はprefixを返す。
- `ok:false`では`wireBroke`をdispatchしない。
- 任意破棄には既存確認dialog、破断後resetにはdialogなし。
- `CoilWindingStep`は在庫・`computeMaxTurns`・独自clampを持たない。
- asset/audio/gauge/D番号/新色/src/p40 importの増加0。
- 対象test、全test、build、lint、`npx tsc -b`、material/Phase 4 sweep型検査、`git diff --check`、禁止差分監査、`cmp AGENTS.md CLAUDE.md`を実施する。

## 6. 今回解禁する範囲

2026-09-01の人間承認により、R3-D1〜D8を正式計画へ固定し、arbiter補足レビューへ提出することだけを解禁した。read-only調査と計画文書追随は許可する。

production/test実装、破断式・閾値のproduction採用、sweep実行、spec/art-spec確定変更、engine、materials.ts、save schema、canonical E2、MC4、recipeKey v2、D10、被膜、asset、音、commit、tag、push、deploy、PR、mergeは禁止を維持する。
