# P4-1C R3（C3張力破断）実装前exact delta作成依頼

作成日: 2026-09-01  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **read-only計画作成を解禁。production/test実装は禁止**

## 1. 目的

P4-1CのC1/C2完了後、C3「極端な高張力による線材破断」を別deltaとして有限化する。今回は実装前のexact契約・依存閉包・素材根拠・UI文言・テスト閉包の作成だけを行う。

## 2. 凍結済み契約

- 破断turnは完成済み`WindingRecord`へ含めず、recordは破断直前のprefixを保持する。
- 消費線材長は破断turnを含む`record.length + 1`ターン分。
- 破断後は完成禁止。途中継ぎを導入せず、新しいロットで最初から巻き直す。
- 消費済み線材は戻さない。
- 破断は新D番号・図鑑イベントにせず、工作工程内の失敗として扱う。
- 既存ローター、装備、保存レシピ、図鑑、ノート、所持金を遡及変更しない。
- 破断はローターを生成しない。`RotorAssemblyState`、save schema、canonical E2、MC4、recipeKey v2を変更しない。

## 3. store原子境界

- 線材消費はstoreのResult action 1点だけで行う。
- UIが渡せるのは素材ID、並列本数、破断turn数だけ。現在在庫はstoreが読む。
- 成功時だけ、永続在庫の消費と工程`broken`への遷移を反映する。
- 在庫不足、未知素材、永続化失敗では在庫・工程stateとも不変。0 clamp・部分消費を禁止する。
- `computeConsumedWireM`を線長計算の単一出典とする。
- `resolveWindingTurnLimit`を唯一の在庫上限権威とし、完成validatorと破断消費validatorが同じ純関数で再検証する。
- UIはstoreが計算した同じ上限値を表示用に受け取るが、表示は非権威。UI独自clamp・在庫直接読取りを禁止する。
- `WindingLot`へ在庫量を保存しない。

候補シグネチャは次を起点とし、既存型・関数との衝突を`rg`で確認してexact化する。

```ts
export function computeMaxTurnsByStock(
  availableM: number,
  parallelStrands: 1 | 2,
): number;

export function resolveWindingTurnLimit(
  inventory: PlayerInventory,
  lot: {
    wireMaterialId: string;
    windingWireGaugeMm: number;
    windingParallelStrands: 1 | 2;
  },
): number;
```

## 4. reducer・reset境界

- 既存`reset` actionを`broken`後にも再利用し、新actionを追加しない。
- `canRequestCompletion(broken) === false`。
- `broken`から`reset`以外の遷移を構造テストで禁止する。
- reset後は`lotPending`、在庫は消費後のまま。
- 通常の任意破棄では既存確認dialogを維持する。
- 破断後の「新しい線材で最初から巻き直す」では、任意破棄と同じ確認dialogを出さない。ただしreducerの消去actionは既存`reset`だけを使う。
- `discardBroken`、理由union、途中継ぎを追加しない。

## 5. 素材許容・較正境界

- 素材別相対比は、全対象素材について比較条件を揃えられる線材メーカーまたは規格発行元の一次資料がある場合だけ候補化する。
- ゲーム内0..1張力への絶対換算は、実在物性値と分離した`designAssumption`として明記する。
- 一次資料が揃わない素材を推測で補完しない。共通仮値で素材差を装わない。
- 参考アンカーELEKTRISOLA IEC/JIS丸銅エナメル線0.400 mmの最大巻線張力854 cNを、アルミ線・純銀線の根拠へ流用しない。
- 一次資料が揃わない場合は素材差を実装せず停止し、成立する最小の共通契約と後工程への委譲条件を提示する。係数や換算値を発明しない。
- 操作性は別の人間試遊で判定する。

## 6. alice_mot3依頼（engine/store）

read-onlyで次を提示する。

1. 新規action/type、`broken`枝、純関数、Result unionのexact名称・型全文。
2. `rg`で確定した全依存閉包。既存型を破壊的変更する場合は単一tsconfig全参照を列挙する。
3. 原子消費の成功・在庫不足・未知素材・永続化失敗におけるbefore/after不変条件。
4. `maxTurnsByStock`の単一出典と、完成・破断validatorでの再利用点。
5. record=N−1、消費=N、完成禁止、既存資産非遡及を固定するテスト閉包。
6. `broken`→既存resetだけ、在庫非返却を固定するreducer構造テスト。
7. H8の一次資料調査。出典URL・比較条件・対象素材ごとの成立/不成立を分離し、推測を入れない。
8. production/test/docsの予定ファイル一覧、変更禁止ファイル、検証コマンド、停止条件。

## 7. brabit_mot3依頼（UI）

read-onlyで次を提示する。

1. store権威の`maxTurnsByStock`を表示用に受け取るexact props/selector/call site。UI独自計算・clamp・在庫直接読取りなし。
2. 既存巻線図に破断直前prefixを残し、完成不可と最初からの巻き直しを示す最小UI閉包。
3. exact日本語文言。対象ユーザー向けに簡潔・正確とし、単位を省略しない。
4. 通常の任意破棄dialogと、破断後resetのdialogなしを分離するcall site。
5. キーボード・スマホ操作、色だけに依存しない表示、フォーカス順の受入条件。
6. UI構造テスト・component test・人間試遊項目のexact閉包。
7. 新asset・音・ゲージ・図鑑・D番号・新actionを追加しないことの監査方法。
8. production/test/docsの予定ファイル一覧、変更禁止ファイル、検証コマンド、停止条件。

## 8. 全担当共通の禁止事項

production/test実装、spec/art-spec確定変更、commit、tag、push、deploy、PR、mergeを行わない。R3の係数・素材比・action・type・文言を実装へ置かない。追加の物理軸、schema、保存field、UI基盤、sweep基盤、新D番号、図鑑、音、assetを追加しない。結果提示後に停止する。
