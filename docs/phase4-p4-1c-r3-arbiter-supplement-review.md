# P4-1C R3（C3張力破断）arbiter補足レビュー正式回答

受領日: 2026-09-01  
送信者: `arbiter_mot3`  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **正式回答受領済み。blocking条件なし。R3-E1は2026-09-01人間再承認済み。read-only sweep実行中**

## 0. 受領確認

arbiter_mot3は、人間承認済みR3-D1〜D8全文と補足レビュー依頼全文を読了した。R3-D1〜D7は人間確定事項として再選択せず、A〜Cは整合確認、D〜Eは未確定部分の設計提示として回答した。基点不変・全禁止事項の維持を確認した。外部コンテキスト自己申告は、本依頼全文、実装基準コードの既読分、arbiter自身の先行裁定である。system prompt表示モデルは`claude-sonnet-5`。

## A. reducer入口とreset境界

**矛盾しない。承認。**

既承認の「破断後は既存resetだけ」は`broken`からの出口を統制する契約であり、`broken`への入口は破断が存在しなかった時点では定義できなかった。`wireBroke` 1種の有限例外は、次のガードにより出口契約を変えず、表現不能だった遷移を1本だけ埋める最小形である。

1. `winding`からのみ受理する。
2. store Resultの`ok:true`直後のみdispatchする。
3. `broken`の出口は引き続き`reset`のみとする。
4. 理由union、専用reset、途中継ぎを追加しない。

構造テスト「`broken`から`reset`以外の全actionは同一stateを返す」「`ok:false`ではdispatchしない」を必須として維持する。

## B. 在庫留保なし境界

**矛盾なくfail-closedである。承認。**

上限`N = min(物理, 150, 在庫)`のとき、在庫がちょうどNターン分ならN本目試行での破断消費Nは在庫内に収まる。prefixはN−1であり、上限到達後はN+1本目を受理しないため、「prefix=NでN+1本目破断」は正常経路で構築不能である。`brokenTurnCount <= turnLimit`は、record.length=N−1のとき`brokenTurnCount=N=turnLimit`で等号成立し受理する。1ターン常時留保が正常完成の上限を不要に減らすという不採用理由も正しい。改竄・古い表示・他タブ競合へのstore再検証をfail-closedで維持する。

## C. store成功後のlocal同期とH7原子性

**満たす。承認。non-blocking注記1点。**

H7原子性の対象は在庫消費（永続）であり、`writeOrFail`成功後のみmemory更新・`ok:true`という順序は既存gated actionの確立パターンである。reducerの同期dispatchは表示状態の追随であり永続原子性の一部ではない。`ok:false`不変・追加永続state/schema変更なしで成立する。

non-blocking注記: `ok:true`とdispatchの間でタブが落ちた場合、「線材は消費済みだがbroken画面は表示されない」ままreloadで新ロットから始まる。これは「消費済み線材は戻さない」契約と整合する正しい帰結である。将来の読者が非原子性バグと誤診しないよう、docsへ1行記録する。

## D. 素材非依存の最小蓄積式候補

production採用はsweepと人間再承認後とし、次の「超過張力の累積疲労」をexact候補とする。

```text
入力     : validator済みの各ターン張力 tension_i（0..1、1/256量子）
初期値   : overTensionExposure_0 = 0
更新点   : advanceTurnによるターン確定の評価時
更新順   : 破断判定 → 非破断ならrecordへ当該ターンを追加
超過量   : excess_i = max(0, tension_i - T_SAFE)
累積量   : overTensionExposure_i = overTensionExposure_{i-1} + excess_i
破断条件 : overTensionExposure_i > E_BREAK（厳密に大きい。等号は非破断）
破断時   : 当該ターンiはrecordへ含めずprefix=i-1を保持する
消費     : computeConsumedWireM(i, strands)
clamp    : 不要。累積量は単調非減少
定数     : T_SAFE ∈ (0,1)、E_BREAK > 0。双方ともdesignAssumption
```

性質:

1. canonical recordの張力列だけから決まる純粋・決定論的計算である。
2. 各ターンの張力が高いほど破断は早いか同時となる。
3. 全ターン`tension <= T_SAFE`なら累積は恒等的に0であり、150ターンでも非破断となる。
4. 「許容を超えて張り続けた分だけ疲労する」と説明できる。
5. 緩いターンで累積をリセットする連続カウント方式は、不自然な回復と交互入力による攻略を許すため不採用とする。

`T_SAFE`は素材別物性値ではない。ELEKTRISOLAの銅線854 cNは「最大巻線張力という実在現象が存在する」ことの参考に限り、854 cNから共通`T_SAFE`へ数値換算せず、アルミ・銀メッキ銅・純銀へ許容値を外挿しない。

実装候補を後に作る場合も、累積量はprefixと候補ターンから純関数で導出できるため、永続fieldを追加しない。セッション内の計算値をsave schema、canonical E2、MC4、recipeKeyへ収載しない。

## E. read-only有限sweep計画

本sweepは巻き工程の純関数評価であり、走行物理・モーターsim・乱数・seedを使わない。

### 候補格子

```text
T_SAFE ∈ {200/256, 208/256, 216/256, 224/256, 232/256}
E_BREAK ∈ {1.0, 2.0, 3.0, 4.0, 6.0}
合計25組
```

格子はscript-local候補であり、production値ではない。

### 入力集合

1. 一定張力: `k ∈ {0,8,...,256}`の33点 × 長さ`{30,80,150}`。
2. 最大張力持続: `k=256`を`m=1..150`ターン継続する。
3. 交互入力: `k=256`と`k=0`を交互にし、累積が回復しないことを確認する。
4. 並列本数`{1,2}`は消費検証だけに用い、破断式へ入力しない。
5. 等号境界と+1量子の専用fixtureを置く。

### 出力

- 破断有無
- 破断ターン
- prefix長
- 消費ターン数
- 最大張力持続における`T_SAFE`/`E_BREAK`別の破断ターン

一定超過量`x = max(0, tension - T_SAFE)`の場合、厳密な最初の破断ターンは`x > 0`に対して`floor(E_BREAK / x) + 1`である。arbiter回答中の`ceil(E_BREAK / x) + 1`は、商が整数となる例の説明には合うが一般式ではないため、この式へ正規化する。例`T_SAFE=208/256`、`E_BREAK=3.0`、`tension=1`では`x=48/256`、破断は17ターン目である。

### 受入条件

1. 全ターン`tension <= T_SAFE`の全recordで、全長・全候補とも非破断。
2. `k=256`持続で150ターン以内に破断する候補が存在する。
3. 一定張力の破断ターンが`k`について単調非増加。
4. `exposure == E_BREAK`では非破断、+1量子の超過で破断。
5. 交互パターンは対応する累積量どおりに破断し、回復しない。
6. 在庫ちょうど・不足・2本並列消費2倍は既存validator負例枠で固定する。

### 停止条件

- 25候補のすべてで安全域非発火と最大張力有限破断を両立できない。
- 境界効果を超える非単調がある。
- `tension <= T_SAFE`で破断する。
- ムラ、位置、素材、被膜等の第二入力が必要になる。
- 素材別仮定が必要になる。

いずれかで停止しarbiterへ戻す。

### 選定規則

受入条件を満たし、`k=256`持続の破断ターンが「気付けるが即死ではない」目安10〜40ターンに入る組から、端張り付きを避けて推奨1案と代表代替を提示する。sweep結果提示後、exact候補値のproduction採用とR3-D1〜D6の実装を別途人間再承認する。

## blocking・申し送り・次の承認

- blocking条件: なし。
- non-blocking: Cのクラッシュ窓の意味論をdocsへ記録する。
- R3-E1: Dの式・designAssumption位置づけ・Eのread-only有限sweep計画を人間承認してからsweepを実行する。
- R3-E2: sweep後のexact候補1組、代表代替、全受入結果、選定理由を人間承認してからproduction/test実装する。

arbiter_mot3はコード・docs編集、Git操作、sweep実行を行っていない。全禁止事項を維持し、回答後停止した。
