# P4-1C arbiter正式レビュー依頼

作成日: 2026-08-30  
実装基準: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
状態: **2026-08-30 arbiter正式レビュー回答受領済み。条件付き承認の人間再承認待ち。production/test実装、spec/art-spec確定変更、commit、tag、push、deployは禁止**

## 0. 正式性と人間承認

レビュー対象の人間事前承認本文は`docs/phase4-p4-1c-human-preapproval-bundle.md`のP41C-H1〜H10全文である。2026-08-30、人間プロジェクトリードは次の文面で承認した。

> H1〜H10を承認します

この承認はexact依存閉包の確定とarbiter正式レビューへの進行だけを解禁した。production/test実装、production較正値変更、spec/art-spec確定変更、commit、tag、push、deploy、PR、mergeは未承認である。

## 1. 人間承認済み境界（省略禁止）

1. P4-1CをC1張力利益、C2 D01接続、C3破断契約へ分割する。
2. C1/C2は平均張力1軸だけを扱う。張力ムラ、実軌跡長、渡り線長、占積の独立field、素材差は同時実装しない。
3. `windingTurnsRatio = directionConsistencyRatio × tensionPackingRatio`へ限定拡張する。新しい`MotorConfig` fieldは追加しない。
4. 両因子と積は`(0,1]`。D01との既存単一合成点`effectiveTurnsRatio = windingTurnsRatio × d01Ratio`を維持する。
5. canonical E2、MC4 payload、recipeKey v2、save schema、`coilTurns`は変更しない。
6. 張力はcanonical recordの0..256量子値の算術平均だけを使う。乱数、時刻、速度、反応時間を使わない。
7. D01閾値を`DestructionConfig.d01.coilDeformOmegaRadS`へ移し、発火判定と発火後進行へ同じfieldを供給する。`MotorConfig`へ複製しない。
8. migration defaultは現行2000 rpm相当のexact値。移設だけの段階では挙動変更・数値回帰再基準化を行わない。
9. `varnished`はbooleanのまま。張力へ読み替えず、D01張力較正は`varnished=false`で行う。
10. C1/C2は平均張力0/256..256/256の257点を別々にread-only sweepし、production値変更前にexact候補を人間へ提示する。
11. C1/C2係数を同時較正しない。個別候補確定後、固定代表点だけで交差確認する。
12. 破断のゲーム性は採用するがC1/C2と同時実装せず、P4-1C-C3として別途人間承認を受ける。
13. 破断turnはrecordへ含めず、prefix N-1ターンを保持する。線材消費は破断turnを含むNターン分とする。
14. 破断後は完成不可。途中継ぎを入れず、新しいロットで最初から巻き直す。消費線材は戻さない。
15. 破断は新D番号・図鑑eventにしない。既存ローター、装備、保存レシピ、図鑑、ノート、所持金を遡及変更しない。
16. C3の線材消費はstoreのResult action 1点。成功時だけ永続化と工程`broken`遷移を反映し、未知素材・不足・永続化失敗は在庫・工程stateとも不変にする。
17. `maxTurnsByStock`を既存線長単一出典で求め、物理上限・150ターン上限との最小値を巻ける上限とする。
18. 破断はローターを生成しないため`RotorAssemblyState`、save schema、canonical E2、MC4、recipeKey v2を変更しない。
19. 素材別破断許容は全素材の一次資料の比較条件が揃うまでproductionへ入れない。相対比は一次資料、絶対換算は明記した`designAssumption`とし、推測値を補わない。
20. C1/C2 UIは既存の張力幾何、完成巻線図、D01 HUD・粒子・SE・図鑑だけを使う。新色、asset、音、ゲージ、説明、予測を追加しない。
21. 被膜斑点、エッジ接触、D10はP4-1Fまで実装しない。

## 2. 承認後監査で判明した必須精密化

### RQ-1: D01閾値の物理step供給（blocking）

現行経路:

```text
stepTestRunWithDestruction / stepTrackRunWithDestruction  // DestructionConfigあり
  -> stepTestRun / stepTrackRun                           // DestructionConfigなし
     -> motorPhysics.step / advanceMotorState
        -> nextDeformState                                // 発火閾値を使用
```

破壊wrapperを通らない既存callerもある。

- `src/p40/sessionRunner.ts`
- `scripts/vehicleSweep.ts`
- `scripts/materialSweep.ts`
- `scripts/sweep.ts`
- engine/data/store/materialsの直接step test群
- `src/render/RaceCanvas.tsx`

候補:

- **A（推奨）**: motor/vehicle/trackのstepへ閾値スカラーを必須引数として明示供給する。破壊wrapperは`DestructionConfig.d01.coilDeformOmegaRadS`を渡す。bare callerは単一のdefault定数を明示的に渡す。P4-0の`src/p40/sessionRunner.ts`は挙動変更0の機械追随1件として一時解除する。任意引数・暗黙fallbackを作らない。
- B: 引数を任意にし、省略時は現行値へfallbackする。凍結経路を触らないが、productionの渡し忘れが静かに既定値へ落ちるため非推奨。
- C: motor-onlyとvehicle/trackで別供給経路を持つ。単一出典の検証面が分裂するため不採用候補。

arbiterへ、Aがエンジン凍結方針§2(b)とP4-0凍結に対して許容可能か、より小さい単一出典配線があるかの判定を求める。

### RQ-2: 旧replaySnapshot復元（blocking）

旧snapshotの`destructionConfig.d01`には新fieldがない。補完なしでは比較がfalse化し、超過回転曝露がNaNになる。

候補A（推奨）:

- restore時だけ、field欠落を現行2000 rpm相当の単一default値で補完する。
- RunSnapshot版は上げない（RunSnapshot 4はD10用に留保）。
- 新規captureはfieldを必須収載する。
- validatorは補完後のfieldが正有限値であることを検証する。
- 欠落補完、0、負、NaN、Infinity、文字列を回帰固定する。

### RQ-3: `tensionPackingRatio`の正下限と再基準化

- 張力0でも`tensionPackingRatio > 0`とし、緩い巻線は「弱いが完成可能」にする。
- 生成拒否`windingTurnsRatio===0`は方向の完全打ち消しだけに限定する。
- C1 production値反映時はP4-1Aの`28/30`等の既存期待値が動く。再基準化対象、新期待値、根拠をsweep exact候補と同時に人間へ提示する。
- H4の閾値移設だけは再基準化0、H2の張力利益反映は別承認後に限定再基準化あり、と区別する。

### RQ-4: `maxTurnsByStock`の権威境界

推奨候補:

- store/domain純関数が在庫、素材ID、線径、並列数から`maxTurnsByStock`を計算する。
- storeの完成・破断消費validatorが同じ純関数を再利用して権威執行する。
- UIはAssembly境界から計算済み表示上限だけを受け取り、在庫を直接読んで独自clampしない。
- `WindingLot`へ在庫値を保存しない。
- `LotChooser`文言は、物理上限と在庫上限を区別して事実だけを表示する。exact文言とpropsはC3別承認対象。

技術論点8の「store validatorが執行点、UI clampだけの二重契約禁止」と整合するか判定を求める。

### RQ-5: 破断後の単一破棄境界

現行の任意破棄は`discardLot()` 1本と確認dialogを通る。破断済みに同じ確認文は不適切だが、無関係な第二の記録消去経路も作らない。

推奨候補:

- recordを消去する内部遷移は1関数に維持する。
- 呼出し理由を`userDiscard | brokenRestart`の有限unionにする。
- `userDiscard`だけ既存確認dialogを要求する。
- `brokenRestart`は`state.kind==='broken'`でのみ許可し、既に消費確定済みのprefixを表示した後、「新しい線材で最初から巻き直す」操作で同じ内部遷移を通る。
- user cancellation、broken以外からの迂回、recordのclamp・部分救済を構造テストで禁止する。

この精密化はC3別承認まで実装しない。

### RQ-6: 型網羅UI

H2により新しい`MotorConfig` fieldは作らないため、C1/C2の`ExperimentNotebook.CONFIG_LABELS`追随は0件である。arbiterが新fieldを要求する場合は人間承認範囲外として停止する。

## 3. exact依存閉包

### C1 張力利益

production候補:

- `src/materials/windingMapping.ts`

回帰・機械追随候補:

- `src/materials/__tests__/windingRecord.test.ts`
- `src/store/__tests__/rotorAssembly.test.ts`
- `src/store/__tests__/saveStore.test.ts`
- `src/engine/__tests__/windingTurnsRatioContract.test.ts`
- `src/engine/__tests__/recipeCode.test.ts`

不変監査:

- `src/materials/windingRecord.ts`（canonical E2不変）
- `src/materials/recipeKey.ts`（version/payload不変）
- `src/components/ExperimentNotebook.tsx`（field追加0）

### C2 D01接続

production候補:

- `src/engine/constants.ts`
- `src/engine/motorPhysics.ts`
- `src/engine/vehiclePhysics.ts`
- `src/engine/trackPhysics.ts`
- `src/engine/destructionModes.ts`
- `src/engine/destructionOrchestration.ts`
- `src/materials/materialMapping.ts`

bare callerの機械追随候補:

- `src/p40/sessionRunner.ts`
- `scripts/sweep.ts`
- `scripts/vehicleSweep.ts`
- `scripts/materialSweep.ts`
- `src/render/RaceCanvas.tsx`

直接step/restore/capture回帰候補（`rg`全閉包）:

- `src/data/__tests__/brokenCars.test.ts`
- `src/engine/__tests__/destructionOrchestration.test.ts`
- `src/engine/__tests__/failures.test.ts`
- `src/engine/__tests__/motorPhysics.test.ts`
- `src/engine/__tests__/motorPhysicsLoad.test.ts`
- `src/engine/__tests__/motorPhysicsSplitApi.test.ts`
- `src/engine/__tests__/motorPhysicsV15.test.ts`
- `src/engine/__tests__/scoring.test.ts`
- `src/engine/__tests__/trackPhysics.test.ts`
- `src/engine/__tests__/vehiclePhysics.test.ts`
- `src/materials/__tests__/materialMapping.test.ts`
- `src/store/__tests__/destructionWiring.test.ts`
- `src/store/__tests__/testRunStore.test.ts`
- `src/store/__tests__/saveStore.test.ts`

### C3 破断（別途人間承認まで未実装）

候補:

- `src/materials/windingTension.ts`（新規純関数）
- `src/materials/__tests__/windingTension.test.ts`
- `src/store/rotorAssembly.ts`
- `src/store/saveStore.ts`
- `src/store/__tests__/rotorAssembly.test.ts`
- `src/store/__tests__/saveStore.test.ts`
- `src/components/assembly/windingStepState.ts`
- `src/components/assembly/CoilWindingStep.tsx`
- `src/components/assembly/__tests__/windingStepState.test.ts`

exact action/type/props/文言はC3別承認前に確定する。

## 4. 過剰設計防止と停止条件

- 張力分散、実軌跡長、素材差、エッジ接触、被膜、D10を同じsweepへ加えない。
- `MotorConfig`新field、save schema昇版、RunSnapshot 4先取りをしない。
- optional引数やfallbackでproductionの供給漏れを隠さない（arbiterが明示条件付きで認める場合を除く）。
- 新規汎用sweep/UI/E2E基盤を作らない。
- 既存値を推測で再基準化しない。
- engine/を変更する各deltaには対応数値回帰を置く。
- 依存閉包が上記を超える場合、実装せず再提示する。

## 5. arbiterへ求める判定

1. H1〜H10全体の承認可否とblocking条件。
2. RQ-1のA/B/C採否。特にP4-0 1ファイルの挙動変更0追随を許容するか。
3. RQ-2の版上げなし復元補完契約の可否。
4. RQ-3の正下限・限定再基準化の可否。
5. RQ-4のstore権威計算/UI非権威表示境界の可否。
6. RQ-5の単一内部破棄遷移+理由unionの可否。
7. exact依存閉包の不足・過剰。
8. 追加の物理・較正・素材field・UI基盤を要求せず成立するか。
9. 条件付き承認の場合、production/test実装を解禁せず、人間再承認が必要なdelta全文。
