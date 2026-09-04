# P4-1C P41C-R2-SWEEP-2 motor-only有限探索結果

報告受領日時: 2026-08-31T04:50:27Z  
報告者: `alice_mot3`  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **停止条件1に該当。追加arbiter裁定待ち**

以下はagmsgで受領したdev報告全文である。

---

【MotorGameV3/alice_mot3】P41C-R2-SWEEP-2 結果報告(motor-only、read-only、repo編集0)・停止条件1に該当のため停止

照合への回答も兼ねます。新規承認待ちdeltaは**あります**(下記5節)。motor-only有限探索は完了しました。
基点HEAD 874f8dd、repo編集0、harnessは/tmp/r2sweep3.tsのみ、commit/tag/push/deploy 0件です。

## 1. 固定入力(再承認どおり。変更0)

```text
式       : COIL_DEFORM_OMEGA × (1 − K_LOOSE × (1 − meanTension))  ← 無変更
候補     : K_LOOSE ∈ {0.1,0.2,0.3,0.4,0.5}  ← 無変更
fixture  : motor-only / stepMotorWithDestruction / varnished=false
record   : 30ターン・左21/右9・全ターン正転・tension=k/256(正規command/reducer経路)← 無変更
material : wire-copper-standard / magnet-neodymium / gear-pom / battery-alkaline / brush-carbon ← 無変更
seed=1   dt=1/120   257点   走行長 最大3840step(=32.0 s)   COIL_DEFORM_FRAMES=360(=3.0 s連続超過が必要)
```

**再承認文が固定していない入力が1つありました: motor-only走行の初速です。**
勝手に1つ選ばず、production既存の2定数**両方**で全探索しました(第二入力の新設ではなく、既存constants.tsの値の使い分けです):

- `FLICK_INITIAL_OMEGA = 15 rad/s`(productionのボタン既定、gameStore.ts:751)
- `MAX_FLICK_OMEGA = 40 rad/s`(productionの最大弾き、gameStore.ts:1157でclamp)

参考として20/25/30/50/60でも確認し、20以上なら結果は初速にほぼ非感応であることを実測しました。

## 2. 陽性対照(harnessの観測能力の証明)

```text
k=256 thr=80.0 → 発火step 405 / firedAtT 3.383 s / decayExposureRad 195.03
k=128 thr=60.0 → 発火step 387 / firedAtT 3.233 s / decayExposureRad 150.38
k=0   thr=40.0 → 発火step 364 / firedAtT 3.042 s / decayExposureRad 93.53
```

発火step・発火時刻・decay進行のいずれも観測できています。

## 3. 全出力(257点 × 5候補 × 初速2種 = 2570走行、打ち切りなし)

### 初速15 rad/s = FLICK_INITIAL_OMEGA

K_LOOSE 全5候補: 発火 0/257点、decay最大 0.000、連続超過frame最大 0/360。

実測maxOmega = 12.092 rad/s(全点同一)。**モーターが始動しません**——初速15ではコギングを越えられずωが減衰して停止します(既定素材はmagnet-neodymium)。この初速では張力によらず何も起きないため、上側基準の評価対象になりません。

### 初速40 rad/s = MAX_FLICK_OMEGA

| K_LOOSE | 発火 | 閾値域(rad/s) | 実測maxOmega域 | 余裕の最小 | 連続超過frame最大 | decay最大 |
|---:|---:|---:|---:|---:|---:|---:|
| 0.1 | 0/257 | 188.496〜209.440 | 103.347〜202.848 | +6.346 | 0/360 | 0.000 |
| 0.2 | 0/257 | 167.552〜209.440 | 103.347〜202.848 | +6.101 | 0/360 | 0.000 |
| 0.3 | 0/257 | 146.608〜209.440 | 103.347〜202.848 | +5.856 | 0/360 | 0.000 |
| 0.4 | 0/257 | 125.664〜209.440 | 103.347〜202.848 | +4.235 | 0/360 | 0.000 |
| 0.5 | 0/257 | 104.720〜209.440 | 103.347〜202.848 | **−6.999** | **13**/360 | 0.000 |

- 発火step / 発火時刻(triggeredAtT): 全2570走行でnull(0件)
- decayExposureRad推移: 全走行・全サンプル点で0
- **発火しない張力域**: k=0〜256の全域(meanTension 0.000000〜1.000000)。上限はk=256
- status/終端: motor-onlyのため走行終端はなく、全走行が3840step到達。termination発生0件
- **D02/D05/D06/D09の意図しない発火: 全2570走行で0件**。D07のみ全走行で発火(非終端)

**K_LOOSE=0.5で余裕が負になったのに発火しない理由(実測)**

ピークωが閾値を1frameでも超えたkは257点中62点(k=3〜186)ありますが、**最大でも13frame連続**で、発火に必要な360frame(3.0秒連続)に遠く届きません。ピークは起動直後の過渡で、定常ωは:

```text
k=  0 定常 74.105 / 閾値 104.720 → 差 30.614
k=128 定常110.088 / 閾値 157.080 → 差 46.992
k=256 定常133.006 / 閾値 209.440 → 差 76.433
```

定常ωは全域で閾値を30〜76 rad/s下回り、**差は低張力側でも詰まりません**。

## 4. 該当した停止条件

**停止条件1「全域で非発火」に該当**(2570走行・全点実施・打ち切りなし)。
**上側受入基準「motor-only高回転で緩い張力ほど早期に発火する単調差」は評価不能**です(発火0件のため)。
下側受入基準「負荷走行全域で非発火」は第1回R2-SWEEPの1285走行で充足済みです。
第二入力の新設・式や候補域の変更・固定recordや素材の変更は一切行っていません。

## 5. 裁定2(B)の前提と実測の食い違い(承認待ちdeltaの中身)

arbiter裁定2(B)は「motor-onlyは定常ω≈187.5 rad/sで既定閾値209.44に近く、K≧約0.105で交差しうる」という概算を前提にしていました。この187.5という数値の出所は**私のR2-A有効性fixture**です。

そのfixtureが使ったmotorConfigはテスト用の`goodMotorConfig({varnished:false, brushPressure:0.05, magnetDistanceMm:5})`——coilTurns=80 / batteryVoltage=3.0——であり、**本sweepの「既定素材」構成(P4-0シナリオ由来、coilTurns=30)とは別物**です。既定素材のmotor-only定常ωは実測74〜133 rad/sで、187.5 rad/sには達しません。私のR2-A報告では「この`motorConfig`の自走ω定常値は約187.5rad/s」と限定して書きましたが、構成の違いが裁定へ伝わる形になっていませんでした。この点は私の報告の書き方に起因します。

したがって(B)の「式・候補域を無変更のままfixture移設だけで交差が成立する」という見込みは、既定素材構成では成立しません。ここから先(構成側を動かすのか、式・候補域を見直すのか、D01の較正自体を別のPhaseへ送るのか)は私の判断範囲を超えるため、提案せず停止します。必要であれば追加のread-only実測(例: 既定素材で定常ωが閾値へ届く構成条件の有無)を、承認いただければ実施します。

## 6. 状態

結果提示につき停止します。C2 production係数、R3、spec/art-spec、commit・tag・push・deploy・PR・mergeの禁止は継続しています。作業ツリーはR2-A(コメント整合適用済み)のままで、106 files / 2726 tests・build・lintすべてpass、HEADは874f8ddです。

---

## Suu_mot3一次判定

これは実行障害ではなく、裁定時に参照したmotor-only構成と承認済み固定構成の不一致である。承認済みの式・係数候補・固定record・素材を変更せず停止したdevの対応は正しい。通常走行や固定構成を発火させる目的で式・閾値・継続時間を曲げることは過剰較正となるため、追加arbiter裁定なしに進めない。

arbiterへ、次の設計境界と人間再承認条件を正式照会する。

1. P41C-R2-SWEEP-2の停止を正当な負の結果として受け入れるか。
2. D01の正しい実機構を観測できる既存構成へfixtureを移すのか、追加read-onlyで成立条件だけを調べるのか、P4-1CのC2を延期・不採用とするのか。
3. 式、K_LOOSE格子、COIL_DEFORM_FRAMES、固定record、素材、初速のどれを変更禁止のまま維持すべきか。
4. 次工程に必要なexact有限deltaと人間再承認文。

C2 production係数、R3、spec/art-spec、commit、tag、push、deploy、PR、mergeは禁止を維持する。
