# Phase 2ゲート提出物: 素材写像の物性検証sweep 報告書

作成日: 2026-07-23
担当: alice_mot3(エンジン・写像)
根拠計画: `docs/phase2-step9-plan.md` v12(Suu_mot3承認済み。計画文書自体は本レポートと同じdocs-only成果物)
対象コードcommit: `c628ff3`(`scripts/materialSweep.ts`・`tsconfig.material-sweep.json`・`package.json`の3ファイルのみ)
対象spec: `docs/spec.md` §12(Phase2ゲート「写像の物性検証sweep」)・§4.1・§5.4、`docs/phase2-plan.md` §15(sweep方針)

本書は`scripts/materialSweep.ts`(commit `c628ff3`)の実際の実行結果に基づく。実測前の数値の仮置き・捏造はない。

---

## 1. スコープ

`materialMapping.ts`が実際に写像を持つ4ファミリー(導線・磁石・ギヤ・電池)の全組合せ(4×4×4×3=192)を対象とした。coating・brush・substrate・roller・bodyの5ファミリーは`materialMapping.ts`未接続であり、本sweepの対象外・**既知のcoverage gap**である(`docs/phase2-plan.md` §15が想定した「9ファミリー×代表ティア」からの意図的な逸脱、詳細は6節)。

## 2. 4ゲートの結果

実行コマンド: `npm run typecheck:material-sweep && npm run sweep:material`。両方成功(exit code 0)。

```
GATE nan-safety: PASS
GATE monotonicity: PASS
GATE tradeoff: PASS
GATE bankruptcy-prevention: PASS
GATE capacity-ratio-only: PASS
wall-clock: 0.26s(目標10s)
```

### 2.1 項目1: NaN・負値・無限大の不在(健全性走査)

主軸192通り全組合せ(`straight-10m`)について、`composeConfigFromMaterials`が全件`ok:true`を返し、写像後の全数値フィールド・最終stateの主要数値(`positionM`・`velocityMps`・`energyUsedJ`・`elapsedTimeS`・`theta`・`omega`・`current`・`rpm`)がすべて有限、`massG`は既存clamp帯域`[80,250]`内、非負であるべき値もすべて非負だった。**192件中192件PASS**。

内訳: `status:'finished'` 178件、`status:'overheated'` 14件(いずれも有限性チェックには合格。完走の可否は本ゲートの判定対象ではない)。`overheated`になった14件はすべて「磁石=フェライト × 電池=アルカリ」の組合せであり、7節の物理的所見(i)と一致する。

### 2.2 項目2: 写像パラメータレベルの単調性

`computeElectricalState`/`computeCoggingTorque`によるロック状態(θ=π/4・ω=0)の直接評価(乱数非依存、V2回帰anchor基準):

- 導線(ロック電流): アルミ→銅→銀メッキ銅線→銀の順に単調増加。**PASS**
- 磁石(コギング振幅): フェライト<アルニコ<サマリウムコバルト<ネオジムの順に単調増加。**PASS**
- 電池(ロック電流): アルカリ→NiMH→LiPoの順に単調増加。**PASS**

### 2.3 項目3: 上位ティアの実在トレードオフ

- **磁石**: ネオジムはフェライトよりコギングトルク振幅が明確に大きい(2.2節と同一指標)。**PASS**
- **ギヤ**: 固定材質をminimum-tier(アルミ線/フェライト/アルカリ)としたPOM対チタン比較(同一seed)で、両方とも`straight-10m`を`finished`し、チタンがPOMより遅く消費エネルギーも大きい。**PASS**(詳細な数値は7節(ii))

### 2.4 項目4: 破産防止設計の物理的前提

minimum-tier構成(アルミ線・フェライト・POM・アルカリ)が`straight-10m`を`finished`ステータスで完走した(`elapsedTimeS=14.517s`)。**PASS**。ブラシ(spec §5.4の最低ティア一式には銅板ブラシを含むが、`materialMapping.ts`未接続でconfigへ反映されない)は本合否判定に影響しない(coverage gap、6節)。

参考: 最上位構成(純銀/ネオジム/PEEK/リポ、gear-titaniumは意図的に除外)は`elapsedTimeS=7.425s`で完走。minimum-tier/最上位構成のelapsedTimeS比は約1.955。`energy-run`(効率が問われるコース)でのminimum-tier構成の挙動は参考情報として3節に記録し、本ゲートの合否には使わない。

### 2.5 容量ratio単独ゲート

minimum-tier(アルミ線/フェライト/POM/アルカリ)のcompose結果を土台に、`batteryCapacityRatio`の値のみを1.0→1.3へ差し替えた2run比較(内部抵抗ratio等は完全に同一、専用capacity-check track 300m、同一seed)。両run(容量ratio=1.0・1.3)とも`status:'stalled'`・`failureCode:'energyExhausted'`へ到達し、容量ratio=1.3の到達距離(`positionM=8.44m`)が容量ratio=1.0(`positionM=6.07m`)より厳密に大きかった。**PASS**。

追加の健全性確認: `computeBatteryCapacityRatioCalibration`はアルカリ・NiMHともに厳密に`1.0`を返すことを確認した。

## 3. 参考情報(ゲート対象外)

### 3.1 実素材電池3種の総合結果(容量ratio単独ゲートとは区別)

minimum-tier(アルミ線/フェライト/POM)を固定し、電池のみ実際の3tierを走らせた専用track(300m)上の到達距離: アルカリ`6.07m` < NiMH `11.49m` < LiPo `17.47m`。単調に増加しているが、**これは内部抵抗ratio改善+容量ratio増加の複合効果であり、「容量ratio単独の証明」ではない**(2.5節と区別)。

### 3.2 `energy-run`(実コース参考)

minimum-tier構成+電池3tierで既存`energy-run`(15m、`hasEnergyBudget:true`)を走らせた結果: アルカリ`status:'overheated'`(`elapsedTimeS=2.825s`・`energyUsedJ=26.098J`)、NiMH `status:'stalled'`(`elapsedTimeS=10.625s`・`energyUsedJ=80.094J`)、LiPo `status:'finished'`(`elapsedTimeS=9.925s`・`energyUsedJ=99.255J`)。この参考コースでもアルカリ+フェライトの過熱傾向が観測された(7節(i)と整合)。合否判定には使わない。

### 3.3 V2回帰anchor参考run

`RUNNABLE_BASE_CONFIG`上でV2回帰anchor(銅線標準/フェライト/POM/アルカリ)を`straight-10m`で1回走らせた結果: `status:'overheated'`(`elapsedTimeS=0.508s`)。ゲート対象外・参考情報。詳細は7節(i)。

## 4. 総run数

205run(主軸健全性走査192run+比較専用12run(容量ratio単独2run・実素材電池総合3run・ギヤトレードオフ2run・minimum-tier対最上位2run・`energy-run`参考3run)+V2回帰anchor参考1run)。用途タグ・使用seedはconsole出力に記録済み(`docs/phase2-step9-plan.md` §5・§8参照、再現可能)。

## 5. Phase3・Phase5への入力となる観察事実

### (i) 銅線+フェライトの過熱レジーム(創発的な実挙動)

`RUNNABLE_BASE_CONFIG`上の健全性走査で`overheated`になったのは14件、すべて「磁石=フェライト×電池=アルカリ」の組合せだった(2.1節)。その内訳(実測ログに基づく正確な集計):

- **非アルミ線(銅線標準・銀メッキ銅線・純銀の3種)×全4ギヤ=12組合せ**: **全件`overheated`**
- **アルミ線×4ギヤ**: PA6・PEEKの**2件は`overheated`**、POM・チタンの**2件は`finished`**(2.4節のminimum-tier=アルミ線+フェライト+POM+アルカリ、および7.3節のギヤトレードオフ比較=アルミ線+フェライト+{POM,チタン}+アルカリは、この2件の`finished`側に該当する)

すなわち「非アルミ線は全滅、アルミ線はギヤによって明暗が分かれる」という構図であり、当初の記述(「銅線・銀メッキ銅線・純銀はいずれも過熱」「アルミ線のみfinished」)は非アルミ線側の12件については正しいが、**アルミ線側の4件を一括りに『finished』と述べた点が実測と矛盾していた(誤り)ため訂正する**。アルミ線+PA6/PEEKがなぜ過熱し、アルミ線+POM/チタンがなぜ完走するのかについて、本sweepの範囲でギヤ材質と電気的発熱の因果を追加解析する予定はない(`gearEfficiency`較正値はPOM=1.00・PA6=0.98・PEEK=1.01・チタン=0.90であり、単純な大小関係だけでは説明できない非単調な境界的挙動であることのみを事実として記録する)。

これはバグではなく、低抵抗の導線と弱い磁石(低い逆起電力)の組合せが、速度上昇による電流抑制が効く前に高電流状態を維持してしまう創発的な実挙動である——「中位ティア(銅線)が最低ティア(アルミ線)より脆い動作点が存在する」という非直感的な事実であり、spec §4.1のピーキーさ設計(上位素材ほど実在の癖を背負う)に直結する最初の実測知見である。素材ティア設計・将来のバランス調整(Phase5)の入力として記録する。

### (ii) POM対チタンの差が小さいこと

minimum-tier基準でのPOM対チタン比較: POM `finished elapsedTimeS=14.517s`・`energyUsedJ=122.982J`、チタン`finished elapsedTimeS=14.733s`・`energyUsedJ=124.294J`。差は`0.216秒`(約1.5%)・`1.312J`(約1.1%)であり、チタンの`gearEfficiency`低下(1.00→0.90)による実走行への影響はこの動作点では軽微である。

この事実は、Phase5の経済バランスsweepおよびPhase3のギヤ質量・J接続(D06とセット)判断の入力として記録する。

## 6. 既知の不完全性・coverage gap

- ブラシファミリー(銅板ブラシ含む全4tier)は`materialMapping.ts`未接続であり、本sweepの対象外(coverage gap)
- coating・substrate・roller・bodyの4ファミリーも同様に未接続・対象外
- 電池ファミリーのトレードオフ(発熱・膨張・炎上・入手性)はPhase3・Phase5完了まで不完全(`materials.ts`既存コメント、Phase2ゲート`docs/phase2-plan.md` §16移行順9番のオープン項目として管理台帳で追跡中)
- 導線ファミリーの工作精度トレードオフ(張力管理の難度)はPhase4巻線記録方式まで不完全
- ギヤのJ増トレードオフ(spec §4.2「重い」)は現行実装で未接続、代わりに`gearEfficiency`低下(無潤滑摩擦のproxy、spec §4.2「かじる」)が実在のトレードオフとして機能している。Phase2時点のチタンは「効率が落ちるだけの純粋下位互換」だが、これはLiPo純粋上位互換の鏡像であり、見返り(砕けない・D06歯欠けしにくさ)がPhase3に分割された意図的暫定状態である。**ギヤ質量・Jの接続はPhase3計画時にD06(歯欠け)とセットで判断するオープン項目**として管理台帳に残す

`docs/phase2-plan.md` §15「9ファミリー×代表ティア」からの本Stepの逸脱(4ファミリーへの限定)は、`docs/phase2-plan.md` §15末尾への日付入り追記(本レポートと同時にdocs-only commit予定)で明文化する。

## 7. 監査記録

### 監査記録1: 初期代表fixture不適合→計画停止→再較正(v6→v7)

(A)実装の初回実行で、当時の`REPRESENTATIVE_MOTOR_CONFIG`/`REPRESENTATIVE_CAR_CONFIG`(`materialMapping.test.ts`から転記した数値伝播テスト用fixture)を土台にしたところ、多くの素材構成で`status:'stalled'`・`failureCode:'failureToStart'`となり、7.3(ギヤトレードオフ)・7.4(破産防止)・容量ratio単独ゲートの3件がFAILした。

```
V2回帰anchor(銅線/フェライト/POM/アルカリ): status=stalled elapsedTimeS=1.442 energyUsedJ=1.597
minimum-tier(アルミ線/フェライト/POM/アルカリ): status=stalled elapsedTimeS=1.208
ギヤトレードオフ比較(POM vs チタン、V2回帰anchor固定): 両方とも status=stalled elapsedTimeS=1.442 energyUsedJ=1.597(完全同値、差が出る前に両方起動失敗)
容量ratio単独ゲート(V2回帰anchor+alkaline土台): 両run status=stalled failureCode=failureToStart positionM=0.03
```

**根因**: `materialMapping.ts`等の素材写像の不備ではなく、上記fixtureが「compose関数の数値伝播にNaNが出ないか」を確認する目的だけで選ばれた値であり、実際にトラックを走行・完走できる車両として検証されたことが一度もなかったこと。

**対応**: リポジトリ内へのファイル作成・編集・commitを一切行わない読み取り専用bounded診断(scratchpadでの`vite-node`実行、実行後破棄)により、`scripts/vehicleSweep.ts`の`MOTOR_CANDIDATES`/`CAR_GRID`の値を根拠に実走行可能な共通基準構成`RUNNABLE_BASE_CONFIG`を確定した(2187通り探索、604件目で発見)。7.3節の固定材質もV2回帰anchor(銅線)からminimum-tierと同じアルミ線基準へ変更した(銅線+フェライトが本候補下でも過熱するため、5節(i)参照)。

### 監査記録2: coilTurnsクランプ適用漏れによるゲート反転→修正(v9→v10→v11)

`RUNNABLE_BASE_CONFIG`確定後の人間再承認を得て(A)を`RUNNABLE_BASE_CONFIG`基準へ修正・再実行したところ、7.3ギヤトレードオフゲートの合否が読み取り専用診断(PASS想定)からFAILへ**反転**した。

```
診断値(想定): gear-pom finished 14.517s/122.982J、gear-titanium finished 14.733s/124.294J(チタンが劣る、PASS想定)
実装後実測: gear-pom finished 14.633s/51.614J、gear-titanium finished 14.475s/49.711J(チタンが優る、FAIL)
```

**根因**: `RUNNABLE_MOTOR_CONFIG_TEMPLATE.coilTurns=110`に付したコメント「engineが自動クランプする」が誤りだった。`computeMaxTurns`(`motorPhysics.ts`)は呼び出し側が明示的に適用すべき独立ヘルパーであり(`scripts/vehicleSweep.ts`の`MOTOR_CANDIDATES`も明示クランプ済み)、読み取り専用診断スクリプトは正しくクランプ(110→37)を適用していたが、実装(`scripts/materialSweep.ts`)側は適用し忘れ、`coilTurns=110`のまま(物理的に無効な巻数)使用してしまっていた。**engine/・materialMapping.ts等は無関係**の実装契約誤認だった。

**対応**: `RUNNABLE_MOTOR_CONFIG_TEMPLATE`の`coilTurns`定義に`scripts/vehicleSweep.ts`と同型の明示クランプ`Math.min(110, computeMaxTurns(0.8, 1))`を適用した。他のフィールド・素材較正値・engine定数は変更していない。修正後の再実行で全5ゲートPASS、診断値と完全一致し、ゲート反転・新規乖離は解消した(本報告書の数値がこの修正後の実測値である)。

いずれの監査記録も、Suu_mot3・Fableの技術レビューを経て解決し、production/materialMapping.ts/engine/への変更は一切発生していない。

## 8. 結論

Phase2ゲート「写像の物性検証sweep」(`docs/spec.md` §12)として、以下を提出する。

- 4ファミリー(導線・磁石・ギヤ・電池)全192組合せのNaN安全性を確認(健全性走査PASS)
- 写像パラメータレベルの単調性を導線・磁石・電池の3ファミリーで確認(PASS)
- 上位ティアの実在トレードオフを磁石・ギヤで確認、導線・電池はPhase2時点で意図的な暫定的上位互換であることを明記(5節・6節)
- 破産防止minimum-tier構成の物理的完走可能性を確認(PASS)
- 電池容量ratioのengine実作用を単一変数比較で確認(PASS)
- 残り5ファミリー(coating・brush・substrate・roller・body)は`materialMapping.ts`未接続のcoverage gapとして明記
- 2件の実装上の障害(初期fixture不適合・coilTurnsクランプ漏れ)を発見から解決まで監査記録として保存

対象コード: `scripts/materialSweep.ts`・`tsconfig.material-sweep.json`・`package.json`(commit `c628ff3`、Suu_mot3コードレビュー済み)。engine/・materialMapping.ts・materials.tsは無変更。
