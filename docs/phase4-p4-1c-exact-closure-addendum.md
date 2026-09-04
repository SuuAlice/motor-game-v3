# P4-1C exact依存閉包・正式レビュー追補

作成日: 2026-08-30  
基点: `874f8dd9e6407bdc02a04fda2c862394bc06d069`  
由来: H1〜H10人間事前承認後のalice_mot3 read-only現物監査  
変更: **production/test編集0、commit/tag/push/deploy 0**

本書は`phase4-p4-1c-arbiter-review-request.md`のRQ-1〜RQ-5を、現物コードの型・関数単位へ精密化する。両文書が違う場合、本追補の現物監査結果を新しい事実として扱い、採否はarbiterが明示する。

## A. C1 `windingTurnsRatio`意味拡張

### A-1 推奨実装点

`aggregateWindingRecord`は変更しない。`src/materials/__tests__/windingRecord.test.ts`は、P4-0契約としてposition/tensionが集計結果を変えないことを固定し、凍結中の`src/p40/sessionRunner.ts`も同aggregateを読むためである。

張力因子は`src/materials/windingMapping.ts`へ閉じる。

```ts
export interface TensionPackingCalibration {
  readonly minPackingRatio: number;
  readonly referenceTension: number;
}

export function computeMeanTension(record: WindingRecord): number;
export function computeTensionPackingRatio(
  meanTension: number,
  calibration: TensionPackingCalibration,
): number;

export const PRODUCTION_TENSION_PACKING: TensionPackingCalibration;
```

`deriveWindingMotorFields`だけが次を合成する。

```text
windingTurnsRatio = directionConsistencyRatio × tensionPackingRatio
```

### A-2 不変と追随

変更不要:

- `src/store/rotorAssembly.ts`（既存純関数caller）
- `src/engine/recipeCode.ts`（MC4 decodeが既存純関数caller）
- `src/materials/windingRecord.ts`
- `src/materials/recipeKey.ts`
- `src/store/saveStore.ts`
- `src/store/gameStore.ts`
- `src/components/ExperimentNotebook.tsx`

test候補:

- 新規`src/materials/__tests__/windingMapping.test.ts`
- `src/store/__tests__/rotorAssembly.test.ts`
- `src/store/__tests__/saveStore.test.ts`
- `src/engine/__tests__/windingTurnsRatioContract.test.ts`
- `src/engine/__tests__/recipeCode.test.ts`は自動追随し変更不要候補

必須不変条件:

- `minPackingRatio > 0`。張力0でも完成可能な正値を返す。
- 緩い巻線を方向の完全打ち消しと誤分類しない。
- 積が常に`(0,1]`。
- exact係数はsweep後の別途人間承認まで置かない。
- C1反映時は`28/30`等の既存期待値が動くため、対象期待値・新値・根拠をexact候補と同時提示し、限定再基準化の別途人間承認を受ける。

## B. C2 `coilDeformOmegaRadS`単一供給

### B-1 現行供給鎖

```text
stepTestRunWithDestruction / stepTrackRunWithDestruction  // DestructionConfigあり
  -> stepTestRun / stepTrackRun                           // configなし
     -> stepVehicle
        -> motorPhysics.step
           -> nextDeformState                             // 発火閾値

destructionModes.advanceD01                               // 進行閾値
```

motor-only wrapperは`destructionOrchestration.ts`から`motorPhysics.step`を直接呼ぶ。

破壊wrapper外の直接caller:

- `src/p40/sessionRunner.ts`
- `scripts/vehicleSweep.ts`
- `scripts/materialSweep.ts`

### B-2 二候補

#### 候補B-required

5関数へ必須スカラーを追加し、全callerが明示供給する。破壊wrapperは`DestructionConfig.d01.coilDeformOmegaRadS`、bare callerは現行default定数を明示供給する。`src/p40/sessionRunner.ts`を挙動変更0で機械追随する必要がある。

利点: 渡し忘れが型検査で落ちる。  
欠点: P4-0凍結1ファイルの一時解除が必要。

#### 候補B-default（alice_mot3推奨、P4-0凍結優先）

```ts
// motorPhysics.ts
export function step(
  config: MotorConfig,
  state: SimState,
  dt: number,
  rng?: Rng,
  loadTorque?: number,
  effectiveInertia?: number,
  coilDeformOmegaRadS: number = COIL_DEFORM_OMEGA,
): SimState;

function nextDeformState(
  omega: number,
  varnished: boolean,
  highSpeedFrameCount: number,
  alreadyCollapsed: boolean,
  coilDeformOmegaRadS: number,
): { highSpeedFrameCount: number; coilCollapsed: boolean };

// vehiclePhysics.ts
export function stepVehicle(..., trackInputs?: TrackFrameInputs,
  coilDeformOmegaRadS: number = COIL_DEFORM_OMEGA): VehicleSimState;
export function stepTestRun(..., slopeRad?: number,
  coilDeformOmegaRadS: number = COIL_DEFORM_OMEGA): VehicleSimState;

// trackPhysics.ts
export function stepTrackRun(..., rng?: Rng,
  coilDeformOmegaRadS: number = COIL_DEFORM_OMEGA): VehicleSimState;
```

凍結中P4-0とscriptsは無改修。production wrapperの明示供給漏れは、新規`src/engine/__tests__/coilDeformThresholdAudit.test.ts`で固定する。

構造・数値回帰:

- `destructionOrchestration.ts`のmotor/test/track 3 wrapperがfieldを明示供給する。
- コメントを除外したソース走査と陰性対照を持つ。
- 既定と異なる閾値fixtureで、発火stepと発火後進行量の両方が同時に動くことを実測する。

利点: P4-0凍結を守る。  
欠点: 任意fallbackがproductionの将来の供給漏れを静かに隠すため、P4-C2のRNG規律より弱い。

arbiterは、P4-0の1ファイル機械追随を許してB-requiredを採るか、構造テストを条件にB-defaultを採るかを明示すること。

### B-3 config/validator/snapshot閉包

- `src/engine/destructionModes.ts`: `DestructionConfig.d01.coilDeformOmegaRadS`追加。`advanceD01`が同fieldを使用。
- `src/materials/destructionCalibration.ts`: `D01_CALIBRATION`へ現行exact値を追加。
- `src/engine/destructionOrchestration.ts`: validator、raw shape、3 wrapper供給、旧snapshot補完。
- `src/engine/constants.ts`: `COIL_DEFORM_OMEGA`はdefault値の単一出典として維持。
- `src/engine/motorPhysics.ts`、`vehiclePhysics.ts`、`trackPhysics.ts`: 閾値供給。

旧v3 replaySnapshotはfieldを持たない。必須条件:

- restore時だけ欠落を現行exact値で補完する。
- RunSnapshot版は上げない。
- 新規captureはfield必須。
- 補完後に正有限値をvalidatorで検証する。
- 欠落、0、負、NaN、Infinity、文字列を回帰固定する。

d01リテラルfixture追随候補:

- `src/engine/__tests__/destructionModes.test.ts`
- `src/engine/__tests__/destructionOrchestration.test.ts`
- `src/materials/__tests__/materialMapping.test.ts`
- `src/store/__tests__/runOutcomeApplication.test.ts`
- `src/store/__tests__/saveStore.test.ts`

default exact同値移設なのでC2移設段階の数値再基準化は0。

## C. C3 `maxTurnsByStock`権威境界

store側候補:

```ts
export function computeMaxTurnsByStock(
  availableM: number,
  parallelStrands: 1 | 2,
): number {
  return Math.floor(availableM / computeConsumedWireM(1, parallelStrands));
}

export function resolveWindingTurnLimit(
  inventory: PlayerInventory,
  lot: {
    wireMaterialId: string;
    windingWireGaugeMm: number;
    windingParallelStrands: 1 | 2;
  },
): number;
```

- 既存線長単一出典だけを使う。
- `resolveWindingTurnLimit`を唯一の権威とし、完成・破断消費validatorが再利用する。
- clampせずResultで拒否する。
- UIはstore計算済み表示値を受け、在庫を直接読んで独自計算しない。
- `WindingLot`へ在庫量を保存しない。
- UIと権威が食い違った場合もstore拒否を迂回できない。
- exact props・selector・文言はC3別承認対象。

arbiterは、UIへ同じ権威値を渡す構成と「UI表示は非権威、storeが再検証」の両方を要求し、UI独自clampを禁止するか判定すること。

## D. C3 破断後リセット

現行reducerには記録・工程を初期化する`reset` actionが1本ある。

- 推奨R1: `broken`からも既存`reset`だけを使う。新actionを追加しない。
- 線材消費は破断時のstore actionで既に確定し、`reset`は在庫へ触れない。
- `canRequestCompletion(broken) === false`。
- `reset`後は`lotPending`、在庫は消費後のまま。
- `broken`から`reset`以外の遷移を禁止する。
- 通常の任意破棄は既存確認dialogを維持する。
- 破断済みの「新しい線材で最初から巻き直す」は、既に失敗が確定しているため同じ任意破棄文言を出さない。ただしreducer上の消去actionは同じ`reset`だけを使う。
- C3 UIのcall site・文言・構造テストは別途人間承認対象。

新規`discardBroken`や途中継ぎは採らない。

## E. arbiterへ追加で求める明示判定

1. C1を`windingMapping.ts`へ閉じ、P4-0 aggregateを維持する案の可否。
2. B-required / B-defaultの採否と、その理由・必須構造テスト全文。
3. 旧snapshotの版上げなし補完と負例の十分性。
4. C1だけ限定再基準化、C2移設は再基準化0という分離の可否。
5. store唯一権威+UI同値表示+store再検証の境界。
6. 既存`reset` actionを破断後にも再利用し、新actionを足さない境界。
7. 上記を超える新field・schema・基盤・物理軸を追加せず成立するか。

