# P4-1C P41C-R1/R2 実装前・人間再承認バンドル

作成日: 2026-08-30  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **2026-08-30 人間再承認済み。工程順に従いP41C-R1-SWEEPのみ着手中。各停止点以降は未解禁**

## 0. 今回承認を求める範囲

P4-1CのC1（張力利益）とC2（D01閾値単一供給）を混ぜず、次の順で進める有限バンドルである。

1. **P41C-R1-SWEEP**: production/testを編集せず、script-localな候補式だけでC1の257点有限sweepを実行する。
2. 結果を停止提示し、C1のproduction係数と限定再基準化は別途承認を受ける。
3. **P41C-R2-A**: D01閾値の供給をS-A(options object)へ移す挙動変更0の機械追随を実装・検証する。低張力係数はまだ入れない。
4. **P41C-R2-SWEEP**: R2-A通過後にC2の257点有限sweepを実行する。
5. 結果を停止提示し、C2のproduction係数は別途承認を受ける。

C1係数とC2係数は同時較正せず、各工程を独立して停止する。

## 1. P41C-R1-SWEEP（C1 張力利益）

### 1.1 凍結定義の限定拡張と遡及効果

production反映時の定義は次の限定拡張とする。

```text
windingTurnsRatio = directionConsistencyRatio × tensionPackingRatio
```

- `windingTurnsRatio`はP4-1Aで「方向一貫性」として凍結済みであり、C1はその意味変更であることを明示する。
- `RotorWindingState.recorded`はratioを保存せずrecordから毎回導出するため、C1をproduction反映すると既存saveの全recordedローターへ遡及適用される。
- `tensionPackingRatio <= 1`なので、緩く巻いた既存個体は弱くなり、強くなる既存個体はない。
- `winding.kind === 'legacy'`は記録を持たず導出関数を通らないため影響を受けない。
- ratioを保存値化せず、recordを単一出典として維持する。
- `coilTurns`、canonical E2、MC4 payload、recipeKey v2（28エントリ）、save schemaは不変。

### 1.2 read-only有限sweep

| 項目 | exact値 |
|---|---|
| 平均張力 | `k/256`（`k = 0..256`）の257点 |
| record | 30ターン、左21/右9、全ターン正転。全ターンを同じ張力にして平均を格子へ厳密に載せる |
| material | `wire-copper-standard` / `magnet-neodymium` / `gear-pom` / `battery-alkaline` / `brush-carbon` |
| seed / track / dt | `1` / `straight-10m` / `1/120` |
| varnished | `true` |
| 候補空間 | `minPackingRatio ∈ {0.5,0.6,0.7,0.8,0.9}` × `referenceTension ∈ {64,128,192,256}/256` の20組 |
| 候補式 | `minPackingRatio + (1 - minPackingRatio) × min(1, meanTension / referenceTension)` |

sweep harnessは`/tmp`内だけに置き、リポジトリの`scripts/**`やpackage設定へ追加しない。

出力:

- `meanTensionQ`、`meanTension`、両候補係数、`tensionPackingRatio`、`directionConsistencyRatio`、`windingTurnsRatio`
- `axisOffsetMm`、`coilTurns`、`finishTimeS`、`steps`、`status`、`truncated`
- `coilCollapsed`、`shorted`、4区間通過時刻、record SHA-256
- 各20組のratio到達域、走行時間の最小・最大・全幅、体感差

候補選定条件:

- 全257点で走行が成立し、ratioが`(0,1]`に収まり、低張力端と高張力端に体感可能な差がある。
- 受理帯の端に張り付く組は採らない。
- 推奨1案に加えて差が最小の代表候補と非推奨理由を提示する。

停止条件:

1. 全20組で走行時間差が測定ノイズ以下。
2. 低張力側で走行不成立の組しかない。
3. ratioが`(0,1]`を外れる。
4. 257点を尽くす前に候補なしと結論しそうになる。
5. 張力ムラ・位置・素材・実軌跡長を第二入力にする必要が生じる。
6. sweep実測でなく推測値を置く必要が生じる。

### 1.3 C1反映時だけ許される限定再基準化

今回はsweepまでであり、次の変更は結果提示後の別途承認対象とする。

- `src/store/__tests__/rotorAssembly.test.ts`: 4アサーション
- `src/store/__tests__/saveStore.test.ts`: 2アサーション

計2ファイル・6アサーションの新値と根拠をproduction係数候補と同時に提示する。C2移設へこの再基準化を混ぜない。

## 2. P41C-R2-A（C2 D01閾値単一供給、挙動変更0）

### 2.1 件数訂正の経緯

当初のarbiter判定は「P4-0凍結1ファイルの追随」と見積もった。aliceの初回行単位検索では153呼出しと報告したが、コメント・文字列内の`step(`と同名のgameStore actionを含んでいた。コメント・文字列・メソッド呼出し・関数定義を除外した再実測の正値は、**18ファイル・135呼出し（production 4ファイル6、scripts 3ファイル4、test 11ファイル125）**である。

arbiterはこの訂正を正式承認し、S-A採用、B-required維持、許容条件5点を不変とした。

### 2.2 採用シグネチャ

S-A（名前付きoptions object）を採用し、S-B（位置引数途中挿入）は却下する。`coilDeformOmegaRadS`、`loadTorque`、`effectiveInertia`はいずれも`number`であり、S-Bでは転置事故をTypeScriptが検出できないためである。

```ts
export interface MotorStepOptions {
  readonly coilDeformOmegaRadS: number;
  readonly rng?: Rng;
  readonly loadTorque?: number;
  readonly effectiveInertia?: number;
}

export interface VehicleStepOptions {
  readonly coilDeformOmegaRadS: number;
  readonly rng?: Rng;
  readonly slopeRad?: number;
  readonly trackInputs?: TrackFrameInputs;
}
```

次の4関数はrequired optionsを受け取る。

- `motorPhysics.step`
- `vehiclePhysics.stepVehicle`
- `vehiclePhysics.stepTestRun`
- `trackPhysics.stepTrackRun`

`nextDeformState`は`coilDeformOmegaRadS`をrequired scalarとして受ける。新しい公開action・物理軸・較正軸は追加しない。

### 2.3 実呼出し閉包（重複除去18ファイル・135呼出し）

#### production: 4ファイル・6呼出し

- `src/engine/destructionOrchestration.ts`: 3
- `src/engine/trackPhysics.ts`: 1
- `src/engine/vehiclePhysics.ts`: 1
- `src/p40/sessionRunner.ts`: 1（唯一のP4-0所有境界越え）

#### scripts: 3ファイル・4呼出し

- `scripts/sweep.ts`: 2
- `scripts/materialSweep.ts`: 1
- `scripts/vehicleSweep.ts`: 1

#### test: 11ファイル・125呼出し

- `src/data/__tests__/brokenCars.test.ts`: 1
- `src/engine/__tests__/destructionOrchestration.test.ts`: 12
- `src/engine/__tests__/failures.test.ts`: 1
- `src/engine/__tests__/motorPhysics.test.ts`: 22
- `src/engine/__tests__/motorPhysicsLoad.test.ts`: 11
- `src/engine/__tests__/motorPhysicsSplitApi.test.ts`: 2
- `src/engine/__tests__/motorPhysicsV15.test.ts`: 5
- `src/engine/__tests__/scoring.test.ts`: 1
- `src/engine/__tests__/trackPhysics.test.ts`: 13
- `src/engine/__tests__/vehiclePhysics.test.ts`: 44
- `src/materials/__tests__/materialMapping.test.ts`: 13

除外:

- `src/render/RaceCanvas.tsx`およびstore testsの`getState().stepTestRun(...)`はgameStore actionであり別シンボル。
- `*WithDestruction`系は`DestructionConfig`を持つwrapperであり、上記engine関数とは別シンボル。
- brabit所有の`src/components/**`、`src/modes/**`、`src/retro/**`への波及は0。

### 2.4 config・snapshot・fixture閉包

上記実呼出し追随に加えて、次の既存ファイルだけを契約追随対象とする。

- `src/engine/motorPhysics.ts`: options型、`nextDeformState`供給
- `src/engine/destructionModes.ts`: `DestructionConfig.d01.coilDeformOmegaRadS`と進行側参照
- `src/materials/destructionCalibration.ts`: 現行exact defaultを追加
- `src/engine/destructionOrchestration.ts`: draft/raw validator、motor/test/track供給、旧snapshot補完
- `src/engine/__tests__/destructionModes.test.ts`
- `src/store/__tests__/runOutcomeApplication.test.ts`
- `src/store/__tests__/saveStore.test.ts`

`src/engine/constants.ts`の既存export `COIL_DEFORM_OMEGA`を唯一のdefault定数とし、同ファイルへ同値定数を増やさない。bare caller、`D01_CALIBRATION`初期値、旧snapshot補完値はすべてこの1定数を参照する。

重複を除く実装対象の上限は**既存24ファイル**（実呼出し18ファイル+追加契約追随6ファイル）とし、新規production/testファイルは作らない。現物実装で25ファイル目が必要になった場合は停止する。

旧snapshotは版を上げず、field欠落時だけ現行exact値で補完する。`0`、負、`NaN`、`Infinity`、文字列はfail-closedで拒否する。新規captureはfield必須。

### 2.5 必須受入条件

1. C2移設deltaは全既存テストを**期待値リテラル無変更**で通す。期待値変更が1件でも必要なら停止・再エスカレーションする。
2. `src/p40/__tests__/scenario.test.ts`の13 assert（記録hash 3件、aggregate、step数2690/2429/2561、4区間時刻、シナリオ成立）を1文字も変更せず通す。
3. bare caller・較正初期値・旧snapshot補完値は`COIL_DEFORM_OMEGA` export 1定数だけを参照する。
4. options object化に乗じて他パラメータの意味変更・追加をしない。
5. 既定の0.5倍閾値fixtureで、発火stepと`D01Progress.decayExposureRad`が同時に動くことを1テストで固定する。

C2移設は再基準化0である。P41C-R1の限定再基準化を同じdeltaへ混ぜない。

## 3. P41C-R2-SWEEP（低張力→D01閾値）

R2-Aの全受入条件通過後だけ実施する。

| 項目 | exact値 |
|---|---|
| 平均張力 | `k/256`（257点） |
| record/material/seed/track/dt | R1と同じ固定入力 |
| varnished | `false`固定 |
| 候補係数 | `K_LOOSE ∈ {0.1,0.2,0.3,0.4,0.5}`（script-local） |
| 候補式 | `COIL_DEFORM_OMEGA × (1 - K_LOOSE × (1 - meanTension))` |

sweep harnessは`/tmp`内だけに置き、production係数・既存script・package設定を変更しない。

出力:

- 発火step、発火時刻、`decayExposureRad`推移、発火しない張力域の上限
- `finishTimeS`、status、D02/D05/D06/D09の意図しない発火フラグ

停止条件:

1. 通常操作域の全域で発火、または全域で非発火。
2. 発火するが体感時間20〜30秒帯へ入らない。
3. 257点を尽くす前に候補なしと結論しそうになる。
4. 張力ムラ・素材差を第二入力にする必要が生じる。
5. `varnished=true`側へ影響が漏れる。

## 4. 全体禁止事項

この承認で解禁しないもの:

- C1/C2のproduction係数確定・反映
- P41C-R1の2ファイル6アサーション再基準化
- P41C-R3の破断契約・線材消費・`broken` UI
- 張力ムラ、実軌跡長、素材別破断値、D10、被膜、整流子
- 新規UI、品質点、正解帯、予測、asset、音、汎用sweep基盤
- spec/art-spec変更、commit、tag、push、deploy、PR、merge

## 5. 承認後の停止点

- R1 sweep結果を先に提示し、C1のexact係数と限定再基準化を別途諮る。
- R2-Aは挙動変更0の全証跡を提示して停止する。
- R2 sweep結果を提示し、C2のexact係数を別途諮る。
- 計画外の波及、期待値変更、第二入力の必要、通常操作域全滅が1件でも生じたら推測せず停止する。

各実装段階で`npm run test`、`npm run build`、`npm run lint`を通す。R2-Aでは追随した既存scriptを`npm run sweep:motor`、`npm run sweep`、`npm run sweep:material`で実行し、`npm run typecheck:material-sweep`と`npm run typecheck:phase4-sweep`も通す。sweep候補の探索結果と既存scriptの回帰確認を混同しない。

## 6. 人間再承認記録

2026-08-30、人間プロジェクトリードが次の文面で本有限バンドル全文を承認した。

> P4-1C P41C-R1/R2実装前有限バンドル全文を承認します。

工程順と停止点は本書§0・§5のまま維持する。まずP41C-R1-SWEEPだけを解禁し、結果提示前にR2-Aへ進まない。production係数、C1限定再基準化、P41C-R3、spec/art-spec、commit、tag、push、deploy、PR、mergeは引き続き未承認である。

2026-08-31、人間プロジェクトリードが次の文面でR2-Aへの着手を承認した。

> R2-A着手承認します

この承認で解禁するのは本書§2のR2-Aだけである。S-A options object、既存18ファイル135呼出しと追加契約追随を合わせた既存24ファイル上限、期待値リテラル無変更、P4-0 scenario 13 assert無変更、`COIL_DEFORM_OMEGA`単一出典、旧snapshotの欠落時補完と不正値fail-closed、0.5倍閾値fixture、および§5の全検証・停止条件を維持する。R2-SWEEP、R3、spec/art-spec、commit、tag、push、deploy、PR、mergeは引き続き未承認である。

2026-08-31、人間プロジェクトリードが次の全文でR2-SWEEPへの着手を承認した。

> P4-1C R2-SWEEPのread-only有限探索への着手を承認します。平均張力`k/256`の257点、30ターン・左21/右9・全ターン正転、既定素材、seed=1、track=`straight-10m`、dt=`1/120`、varnished=falseを固定します。候補は`K_LOOSE ∈ {0.1,0.2,0.3,0.4,0.5}`、式は`COIL_DEFORM_OMEGA × (1 - K_LOOSE × (1 - meanTension))`とし、harnessは`/tmp`内だけに置いてください。結果提示後に停止し、production係数・既存script・package設定・repoファイルは変更しないでください。R3、spec/art-spec、commit・tag・push・deploy・PR・mergeは禁止を維持します。C2のproduction係数は結果確認後の別途承認とします。

この承認により本書§3のread-only有限探索だけを解禁する。出力項目・停止条件・§4の禁止事項はすべて維持する。

## 7. R2-SWEEP停止とfixture再定義の人間再承認待ち

R2-SWEEP第1回は、track-run 1285走行の全域でD01非発火となり、停止条件1へ該当して正当に停止した。詳細な結果とarbiter正式裁定全文は`docs/phase4-p4-1c-r2-sweep-arbiter-decision.md`を正とする。

次へ進むには、同書「P41C-R2-SWEEP-2(D01張力較正のfixture再定義)」全文の人間再承認が必要である。承認前はmotor-only有限探索へ進まず、C2 production係数、R3、spec/art-spec、commit、tag、push、deploy、PR、mergeの禁止を維持する。

2026-08-31、人間プロジェクトリードが同書記載の「P41C-R2-SWEEP-2(D01張力較正のfixture再定義)」全文を提示し、再承認した。これによりmotor-onlyのread-only有限探索だけを解禁する。式、K_LOOSE格子、第二入力、固定record、素材は変更せず、逸脱時は停止する。C2 production係数、R3、spec/art-spec、commit、tag、push、deploy、PR、mergeの禁止は維持する。

## 8. R2-SWEEP-2停止とR2-SWEEP-3人間再承認待ち

R2-SWEEP-2はmotor-only 2570走行の全域でD01非発火となり、停止条件1へ該当して正当に停止した。裁定が参照した約187.5 rad/sは80ターン等のR2-Aテスト構成、本探索の承認済み固定構成は30ターンで定常74〜133 rad/sであり、構成同一性を確認しなかったarbiterの概算誤りだった。結果全文は`docs/phase4-p4-1c-r2-sweep2-report.md`、正式裁定全文は`docs/phase4-p4-1c-r2-sweep3-arbiter-decision.md`を正とする。

次へ進むには、正式裁定記載の「P41C-R2-SWEEP-3」全文の人間再承認が必要である。承認前は成立条件のread-only探索へ進まない。C2 production係数、R3、spec/art-spec、commit、tag、push、deploy、PR、mergeの禁止を維持する。

2026-08-31、人間プロジェクトリードが正式裁定記載の「P41C-R2-SWEEP-3」全文を提示し、再承認した。これにより第1段の成立条件read-only探索と、成立時だけの第2段再sweepを解禁する。非成立時はC2を非採用としてC3/D10へ委譲する。C2 production係数、R3、spec/art-spec、commit、tag、push、deploy、PR、mergeの禁止は維持する。
