# P4-1C R2-C2 NORMAL_OPERATION最終read-only確認・停止報告

受領日時: 2026-08-31T16:17:18Z  
報告者: `alice_mot3`  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **受入条件(iii)不成立・追加実測停止・arbiter追加裁定待ち**

## 実行境界

- read-only、repo編集0、harnessは`/tmp`配下のみ。
- 式、`COIL_DEFORM_FRAMES=360`、素材リスト、seed、dtは無変更。
- `K_LOOSE=0.5`を固定。commit、tag、push、deployは0件。
- HEADは`874f8dd`。作業ツリーはR2-Aの承認済み変更のみで、106 files / 2726 tests・build・lint成功を維持。

## 測定設計の自己訂正

初回は閾値だけを`meanTension=0`相当へ下げ、`windingTurnsRatio=1.0`のまま測ったため15組合せ全件発火した。しかし同一recordでは`meanTension=0`なら`windingTurnsRatio`も0.85へ下がり、この組合せは構築不能である。初回結果は破棄し、閾値と`windingTurnsRatio`を同一recordから導出して再測定した。recordはNORMAL_OPERATION基準の80ターン、左21/右9比率、全ターン正転、正規command/reducer経路で生成した。

`varnished=true`では15組合せ×track/motor-only初速15/40の45走行が全てD01非発火だったが、`nextDeformState`が構造的にfalseを返すため下側拘束の実質証跡には採用しない。有効判定はD01が発火可能な`varnished=false`で行った。

## 有効測定結果

余裕は`閾値 − ω360`で、正なら非発火、`閾値 < ω360`なら発火する。

粗い刻み`k={0,32,...,256}`の135走行では、`k>=32`は全件非発火で、余裕は`k=32`の+5.7〜+25.9から`k=256`の+97.6〜+112.4へ単調に拡大した。一方、`k=0`で8/15組合せが発火した。

同一条件の低張力端を`k={0,2,4,6,8,10,12,16,20,24,28,32}`で細分した180走行の結果:

```text
✓ straight-10m / alkaline      k0:+11.4 … k32:+23.3（全域非発火）
✗ straight-10m / NiMH          k0〜k6発火、k8:+0.2、k32:+10.5
✗ straight-10m / LiPo          k0〜k12発火、k16:+1.2、k32:+7.8
✓ hill-climb / alkaline        k0:+14.7 … k32:+24.4（全域非発火）
✗ hill-climb / NiMH            k0〜k2発火、k4:+2.1、k32:+13.8
✗ hill-climb / LiPo            k0〜k2発火、k4:+1.3、k32:+12.0
✓ curve-balance / alkaline     k0:+11.4 … k32:+23.3（全域非発火）
✗ curve-balance / NiMH         k0〜k6発火、k8:+0.2、k32:+10.5
✗ curve-balance / LiPo         k0〜k12発火、k16:+1.2、k32:+7.8
✓ rough-board / alkaline       k0:+13.8 … k32:+25.9（全域非発火）
✓ rough-board / NiMH           k0:+0.6 … k32:+11.9（全域非発火）
✗ rough-board / LiPo           k0〜k4・k8発火、k6:+0.4、k10:+0.9、k32:+10.5
✓ energy-run / alkaline        k0:+10.8 … k32:+23.7（全域非発火）
✗ energy-run / NiMH            k0〜k4発火、k6:+0.3、k32:+10.4
✗ energy-run / LiPo            k0〜k12発火、k16:+1.5、k32:+5.7
```

- 最小非発火余裕: +0.2 rad/s（straight-10m / curve-balance、NiMH、k=8）。
- 最大発火側逸脱: −5.520 rad/s（hill-climb、NiMH、k=0、閾値104.72対ω360 110.24）。
- D02/D05/D06/D09の意図外発火は0件。
- alkalineの5コースは全張力域で非発火。
- NiMH/LiPoの10組合せ中8組合せが、`k<=14`（`meanTension<=約0.055`）の極端な低張力端だけで発火。
- `k>=16`では全15組合せが非発火だが、`k=16〜32`には余裕+0.2〜+11.9の薄い帯がある。

したがって、承認済み拘束(iii)「NORMAL_OPERATION 15組合せは張力によらず非発火」は文言どおりには成立しない。

## Suu_mot3一次判定

1. 構築不能な初回測定を破棄し、同一record由来の整合入力へ直した自己訂正は妥当。
2. `varnished=true`の構造的非発火は下側拘束の証跡に採用しない。
3. `varnished=false`では拘束(iii)が明確に不成立。事後的に`k>=16`だけを「通常域」と定義して合格扱いにはしない。
4. 粗刻みで発見した境界を、同一係数・式・fixtureのまま細刻みした行為は、失敗を限定する同一確認内の診断として受容する。新係数・新fixture・域外探索ではない。
5. 結果はC2の設計意図「極端に緩い巻きは高回転で崩れる」とは整合するが、正式受入文との矛盾は技術裁定なしに解消できない。

## arbiter正式追加裁定依頼

1. 拘束(iii)不成立として`K_LOOSE=0.5`候補を棄却するか、「弱い/NORMALビルドでも極端な低張力端はC2発火してよい」と受入契約を訂正するか。
2. 後者の場合、事後的な恣意的合格を避けるexact境界を、実測の`k>=16`に置くのか、ゲーム入力・設計上の別の正典境界に置くのか。Suu/aliceは新境界を発明しない。
3. `K_LOOSE`を既承認格子内の0.4以下へ戻す再sweepが必要か。必要なら候補・有限入力・停止条件・人間再承認文を示すこと。
4. 構成C（50ターンfixture）とNORMAL_OPERATION基準構成（80ターン）の役割差を維持したまま、下側拘束をどう定義するか。
5. 同一条件の粗刻みから低張力端細刻みへの継続を「最終read-only確認1回」の範囲内として受理できるか。
6. 次のexact人間再承認文、またはC2非採用条件。

正式回答までは追加実測、係数候補変更、production反映、R3、spec/art-spec、commit、tag、push、deploy、PR、mergeを行わない。式改造、`COIL_DEFORM_FRAMES`短縮、未承認係数域探索、多軸179件探索も禁止を維持する。
