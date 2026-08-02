# Phase 3 / P3-0 詳細実装計画(クロスレイヤ契約: 型凍結ゲート)— v7(自己完結版・契約付録付き)

作成: alice_mot3 2026-08-02。**状態: 正式Fable個別レビュー(2026-08-02T13:12、Suu_mot3経由中継、条件付き承認)の必須修正2点(P1・P2)+軽微条件4点+Q1〜Q7全裁定を反映したv7。2026-08-02T13:26、プロジェクトリードがQ1〜Q7を再承認しサブステップ1着手を解禁。2026-08-02T14:12、Suu_mot3がサブステップ1を独立確認のうえ通過と判定。サブステップ2初回実装へのSuu_mot3レビュー(必須修正6点: 図鑑初回登録報酬未結線・rebindシグネチャ不一致・lease stale判定欠落・DoD所有境界・cashG単一出典・validator負例不足)を反映済み(10節・附録A.4)。npm run test 968/968・build・lint成功、git diff --check問題なし。サブステップ3・commit・pushは引き続き未解禁。**

## 0. 位置づけ

本書は`docs/phase3-plan-v12.md`(以下v12)——正式Fable最終回答・Suu_mot3最終照合通過(2026-08-02T06:46)・プロジェクトリード実装承認(2026-08-02T06:47)・P3-0 R1自己完結化ゲート通過(2026-08-02T07:39)——で確定した契約を実装するための、P3-0単体の詳細手順書である。**本書は単独で読んで実装・Fableレビューを再開できる自己完結版とする。旧版(v1〜v6)への参照は15節(改訂履歴)以外に置かない。附録Aに、本書がP3-0で実装する範囲のv12型定義を実体化して載せる(v12全文の複製ではない)。**

**正式Fable個別レビュー(2026-08-02T13:12)の総合判定**: 条件付き承認。P1・P2の反映とSuu_mot3確認、Q1〜Q7(Q7=P2)の人間再承認をもって実装着手(サブステップ1)へ進んでよいとされた。修正が本指示の範囲内であればFable再提出は不要(Suu_mot3確認済み)。**プロジェクトリードがQ1〜Q7を再承認(2026-08-02T13:26)し、サブステップ1(engine/materials型定義)へ着手した。** サブステップ1完了時に単一tsconfigプロジェクトゆえの依存閉包(`src/store/shopEconomy.ts`・`shopEconomy.test.ts`、および計画未記載だった`src/retro/shop/formatMaterial.ts`)が判明し、Suu_mot3裁定によりalice_mot3所有分をサブステップ1内で先行実施した(契約変更なし、10節参照)。**Suu_mot3がサブステップ1を独立確認のうえ通過と判定(2026-08-02T14:12)。**

**サブステップ2(2026-08-02T14:1x初回実施)**: `src/store/runOutcomeApplication.ts`(附録A.4+1節・4.4節・5節・6.4節の全pure関数、`beginRun`含む)+8.1節対応テスト(初回45件)を実装した。**その後、Suu_mot3レビューの必須修正6点(図鑑初回登録報酬未結線・rebindシグネチャ不一致・lease stale判定欠落・DoD所有境界・cashG単一出典・validator負例不足)を反映し、現在59件へ拡充済み(現在件数、初回45件は履歴)。** `saveStore.ts`本体・既存store adapter(`gameStore.ts`/`notebookStore.ts`/`shopEconomyStore.ts`)・UI selector・`ExperimentNotebook.tsx`には触れていない。production配線も行っていない。現在Suu_mot3が実行結果を確認中であり、**その確認完了までサブステップ3・commit・pushには進まない**。

**brabit_mot3所有領域**: 本書の店・在庫UI/store関連の記述は、2026-08-02T07:43・T10:14の2回のagmsgでのbrabit_mot3本人の回答(実装コード確認済み)を反映する。`saveStore.ts`本体+既存store adapter/UI selectorはbrabit_mot3実装、`src/store/runOutcomeApplication.ts`の純粋ロジックはalice_mot3実装(8.3節で確定)。

## 附録A: P3-0契約付録(v12型・関数定義の実体化、P3-0実装対象のみ)

本節は、本書がP3-0で実装するv12型・関数を、v12を開かずに実装・レビューできるようそのまま複製する(P3-1以降の型は含まない)。**`docs/phase3-plan-v12.md`自体は本書のいかなる版でも物理的に編集していない**——これは別事実として維持される。一方、**本書(v7)は11節Q1〜Q7として、正式Fable裁定を経た契約の追加・変更(`ApplyRunOutcomeError`・`RunApplicationEnvelope`・`AppliedRunResult`・`ValidateDestructionConfigResult`・`RotorAssemblyState`等)を明示的に含む**。以下の型定義は、v12から無変更で複製した部分と、Q1〜Q7による追加・変更を反映した部分が混在する(各Q番号の該当箇所はコメントで示す)。これらの追加・変更は**人間再承認後に初めてP3-0の実装契約として効力を持つ**(12節)。

### A.1 destructionModes.ts(型のみ、`advanceDestructionState`関数本体はP3-1)

```ts
export type DestructionModeId = 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D09';

export interface DestructionSharedSignals {
  shortCircuitDurationS: number;
  elapsedTimeS: number;
}
export function createInitialSharedSignals(): DestructionSharedSignals {
  return { shortCircuitDurationS: 0, elapsedTimeS: 0 };
}

export interface D01Progress { triggered: boolean; triggeredAtT: number | null; causeLog: D01CauseLog | null; }
export interface D02Progress { triggered: boolean; triggeredAtT: number | null; coilHeatGaugeRatio: number; causeLog: D02CauseLog | null; }

export type BatteryDestructionProgress =
  | { profile: 'nonLipo'; d03: D03Progress }
  | { profile: 'lipo'; d04: D04Progress };
export interface D03Progress { triggered: boolean; triggeredAtT: number | null; causeLog: D03CauseLog | null; }
export interface D04Progress {
  triggered: boolean; triggeredAtT: number | null;
  stage: 'none' | 'swelling' | 'smoking' | 'burning'; stageEnteredAtT: number | null;
  overDischargeActive: boolean; causeLog: D04CauseLog | null;
}

export interface D05Progress {
  sparkDurationS: number; episodeTriggered: boolean; episodeCount: number;
  cumulativeSparkExposure: number; firstEpisodeAtT: number | null; causeLog: D05CauseLog | null;
}
export interface D06Progress { toothLossCount: number; firstLossAtT: number | null; causeLog: D06CauseLog | null; }
export interface D07Progress {
  magnetHeatGaugeRatio: number; reversibleDroopActive: boolean;
  irreversibleTriggered: boolean; irreversibleTriggeredAtT: number | null; causeLog: D07CauseLog | null;
}
export interface D09Progress { triggered: boolean; triggeredAtT: number | null; bearingHeatGaugeRatio: number; causeLog: D09CauseLog | null; }

export interface DestructionState {
  shared: DestructionSharedSignals;
  battery: BatteryDestructionProgress;
  modes: { D01: D01Progress; D02: D02Progress; D05: D05Progress; D06: D06Progress; D07: D07Progress; D09: D09Progress };
}
export function createInitialDestructionState(batteryProfile: 'lipo' | 'nonLipo'): DestructionState {
  return {
    shared: createInitialSharedSignals(),
    battery: batteryProfile === 'lipo'
      ? { profile: 'lipo', d04: { triggered: false, triggeredAtT: null, stage: 'none', stageEnteredAtT: null, overDischargeActive: false, causeLog: null } }
      : { profile: 'nonLipo', d03: { triggered: false, triggeredAtT: null, causeLog: null } },
    modes: {
      D01: { triggered: false, triggeredAtT: null, causeLog: null },
      D02: { triggered: false, triggeredAtT: null, coilHeatGaugeRatio: 0, causeLog: null },
      D05: { sparkDurationS: 0, episodeTriggered: false, episodeCount: 0, cumulativeSparkExposure: 0, firstEpisodeAtT: null, causeLog: null },
      D06: { toothLossCount: 0, firstLossAtT: null, causeLog: null },
      D07: { magnetHeatGaugeRatio: 0, reversibleDroopActive: false, irreversibleTriggered: false, irreversibleTriggeredAtT: null, causeLog: null },
      D09: { triggered: false, triggeredAtT: null, bearingHeatGaugeRatio: 0, causeLog: null },
    },
  };
}

export interface DestructionFrameInput {
  currentA: number; theoreticalCurrentA: number; rpm: number; batteryHeat: number;
  shorted: boolean; chatterFramesLeft: number; coilCollapsedRisingEdge: boolean;
  loadTorqueNm?: number; energyUsedRatio?: number;
}
// advanceDestructionStateの完全シグネチャ(P3-1で関数本体を実装する。P3-0はこの型のみ確定する)
export declare function advanceDestructionState(
  prev: DestructionState, frame: DestructionFrameInput, config: DestructionConfig,
  runContext: DestructionRunContext, dt: number,
): { state: DestructionState; events: readonly UnstampedDestructionEvent[] };

export type TemperatureReading =
  | { kind: 'measured'; temperatureC: number }
  | { kind: 'uncalibratedGauge'; ratio: number }
  | { kind: 'unavailable' };
export interface CauseLogCommon { currentA: number; rpm: number; atT: number; temperature: TemperatureReading; }
export interface D01CauseLog extends CauseLogCommon {}
export interface D02CauseLog extends CauseLogCommon { coilHeatGaugeRatio: number; }
export interface D03CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; }
export interface D04CauseLog extends CauseLogCommon { batteryHeatRatio: number; shortCircuitDurationS: number; stage: D04Progress['stage']; overDischargeRatio: number | null; }
export interface D05CauseLog extends CauseLogCommon { sparkDurationS: number; }
export interface D06CauseLog extends CauseLogCommon { loadTorqueNm: number; toothLossCount: number; }
export interface D07CauseLog extends CauseLogCommon { magnetHeatGaugeRatio: number; }
export interface D09CauseLog extends CauseLogCommon { bearingHeatGaugeRatio: number; }

export type PhysicsSnapshotAtT = { context: 'motor'; state: SimState } | { context: 'vehicle'; state: VehicleSimState };

// destructionModes.ts内部専用型(非export)。ラッパー層(P3-1)がphysicsSnapshotAtTを後付けして
// 公開DestructionEventへ変換する
type UnstampedDestructionEvent =
  | { mode: 'D01'; causeLog: D01CauseLog; isFirstThisSession: true }
  | { mode: 'D02'; causeLog: D02CauseLog; isFirstThisSession: true }
  | { mode: 'D03'; causeLog: D03CauseLog; isFirstThisSession: true }
  | { mode: 'D04'; causeLog: D04CauseLog; isFirstThisSession: true; affectedRoles: readonly FireExposureRole[] }
  | { mode: 'D05'; causeLog: D05CauseLog; isFirstThisSession: boolean }
  | { mode: 'D06'; causeLog: D06CauseLog; isFirstThisSession: boolean; isTotalLoss: boolean }
  | { mode: 'D07'; causeLog: D07CauseLog; isFirstThisSession: true }
  | { mode: 'D09'; causeLog: D09CauseLog; isFirstThisSession: true };

export type DestructionEvent =
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & { mode: 'D01'; causeLog: D01CauseLog; isFirstThisSession: true })
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & { mode: 'D02'; causeLog: D02CauseLog; isFirstThisSession: true })
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & { mode: 'D03'; causeLog: D03CauseLog; isFirstThisSession: true })
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & { mode: 'D04'; causeLog: D04CauseLog; isFirstThisSession: true; affectedRoles: readonly FireExposureRole[] })
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & { mode: 'D05'; causeLog: D05CauseLog; isFirstThisSession: boolean })
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & { mode: 'D06'; causeLog: D06CauseLog; isFirstThisSession: boolean; isTotalLoss: boolean })
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & { mode: 'D07'; causeLog: D07CauseLog; isFirstThisSession: true })
  | ({ physicsSnapshotAtT: PhysicsSnapshotAtT } & { mode: 'D09'; causeLog: D09CauseLog; isFirstThisSession: true });
```

### A.2 destructionOrchestration.ts(P3-0実装対象)

```ts
export interface RunAccumulator {
  events: readonly DestructionEvent[];
  destructionState: DestructionState;
  replaySnapshot: RunSnapshot;
  terminalModeCandidates: readonly DestructionModeId[]; // D02発火到達・D03・D04炎上到達・D06全損・D09焼付き
}
export function createRunAccumulator(replaySnapshot: RunSnapshot, batteryProfile: 'lipo' | 'nonLipo'): RunAccumulator {
  return { events: [], destructionState: createInitialDestructionState(batteryProfile), replaySnapshot, terminalModeCandidates: [] };
}

export function finalizeDestructionRun(
  accumulator: RunAccumulator & { terminalModeCandidates: readonly [DestructionModeId, ...DestructionModeId[]] },
): RunOutcome {
  const [first, ...rest] = accumulator.terminalModeCandidates;
  return {
    endReason: 'destructionTerminal', terminalModes: [first, ...rest], events: accumulator.events,
    destructionState: accumulator.destructionState,
    degradationDiffs: deriveDegradationDiffs(accumulator.events, accumulator.destructionState),
    replaySnapshot: accumulator.replaySnapshot,
  };
}

export type PhysicsEndStatus =
  | { status: 'finished' } | { status: 'stalled'; failureCode?: FailureCode }
  | { status: 'derailed' } | { status: 'overheated' };
export type RunEndSignal = { kind: 'physicsEnded'; physicsEndStatus: PhysicsEndStatus } | { kind: 'manualAbort' };

export type RunOutcome =
  | {
      endReason: 'destructionTerminal'; terminalModes: readonly [DestructionModeId, ...DestructionModeId[]];
      events: readonly DestructionEvent[]; destructionState: DestructionState;
      degradationDiffs: readonly DegradationDiff[]; replaySnapshot: RunSnapshot;
    }
  | {
      endReason: 'finished' | 'stalled' | 'derailed' | 'overheated' | 'energyExhausted' | 'manualAbort';
      events: readonly DestructionEvent[]; destructionState: DestructionState;
      degradationDiffs: readonly DegradationDiff[]; replaySnapshot: RunSnapshot;
    };

export function finalizeRun(accumulator: RunAccumulator, endSignal: RunEndSignal): RunOutcome; // terminalModeCandidates
// が空のaccumulatorに対してのみ呼ばれる(呼び出し側規約)

// P3-0実装範囲の制約は2.4節を参照(D01/D02/D03/D04のbattery-consumed部分/D06はP3-0で完全実装、
// D04のmagnet/body-scorch・D05・D07・D09のseizureは連続量換算式が未確定のためP3-0では実装しない)
export function deriveDegradationDiffs(events: readonly DestructionEvent[], finalDestructionState: DestructionState): readonly DegradationDiff[];

export type DegradationDiff =
  | { role: 'magnet'; kind: 'demagnetization'; deltaFraction: number }
  | { role: 'magnet'; kind: 'scorch'; deltaFraction: number } // 適用先(demagnetizationFraction)はdemagnetizationと共有
  | { role: 'gear'; kind: 'toothLoss'; deltaCount: number }
  | { role: 'gear'; kind: 'seizure'; deltaFraction: number }
  | { role: 'bearing'; kind: 'seizure'; deltaFraction: number }
  | { role: 'brush'; kind: 'wear'; deltaFraction: number }
  | { role: 'rotor'; kind: 'collapse' }
  | { role: 'rotor'; kind: 'burnout' }
  | { role: 'battery'; kind: 'consumed' }
  | { role: 'body'; kind: 'scorch'; deltaFraction: number };

export type DestructionRunContext =
  | { context: 'motor'; fireExposureProfile: FireExposureProfile; gearTotalToothCount: null }
  | { context: 'vehicle'; fireExposureProfile: FireExposureProfile; gearTotalToothCount: number };

export interface RunSnapshot {
  contractVersion: number; motorConfig: MotorConfig; carConfig: CarConfig | null;
  destructionConfig: DestructionConfig; runContext: DestructionRunContext;
  initialMotorState: SimState; initialVehicleState: VehicleSimState | null;
  track: TrackDefinition | null; seed: number; initialDestructionState: DestructionState;
}
// CaptureRunSnapshotInput: RunSnapshotの全field(contractVersionを除く)をそのまま列挙した
// object引数。contractVersionは呼び出し側から受け取らず、captureRunSnapshot自身が常に1を
// 付与する(呼び出し側が誤った版番号を渡すことを型で防ぐ)
export interface CaptureRunSnapshotInput {
  motorConfig: MotorConfig; carConfig: CarConfig | null; destructionConfig: DestructionConfig;
  runContext: DestructionRunContext; initialMotorState: SimState; initialVehicleState: VehicleSimState | null;
  track: TrackDefinition | null; // 素のTrackDefinition(brandなし)。走行開始時の生きたtrack参照を渡す
  seed: number; initialDestructionState: DestructionState;
}
// 全フィールドを深いコピー(structuredClone相当)でRunSnapshotへ複写する。呼び出し後に
// inputを変更してもRunSnapshotの中身へは波及しない(6.1節A.2のdeep copy規則の実体化)
export function captureRunSnapshot(input: CaptureRunSnapshotInput): RunSnapshot;

export interface RestoredRunSnapshot {
  contractVersion: number; motorConfig: MotorConfig; carConfig: CarConfig | null;
  destructionConfig: DestructionConfig; runContext: DestructionRunContext;
  initialMotorState: SimState; initialVehicleState: VehicleSimState | null;
  track: ValidatedTrackDefinition | null; seed: number; initialDestructionState: DestructionState;
}
export type RestoreRunSnapshotResult =
  | { ok: true; snapshot: RestoredRunSnapshot }
  | { ok: false; reason: 'unsupportedContractVersion' }
  | { ok: false; reason: 'invalidSchema'; details: string }
  | { ok: false; reason: 'invalidTrack'; details: string };
export function restoreRunSnapshot(raw: unknown): RestoreRunSnapshotResult;

export type BatteryDestructionConfig =
  | { profile: 'nonLipo'; shortCircuitDurationLimitS: number }
  | { profile: 'lipo'; shortCircuitDurationLimitS: number; runawayHeatThreshold: number; unsafeDischargeStartRatio: number; stageDurations: { swellingS: number; smokingS: number } };
export interface DestructionConfigDraft {
  battery?: BatteryDestructionConfig;
  d02?: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
  d05?: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06?: { breakage: GearBreakageProfile };
  d07?: { magnetHeatGaugeLimit: number; reversibleDroopThreshold: number };
  d09?: { bearingSeizureGaugeLimit: number };
}
export type GearBreakageProfile = { kind: 'breakable'; gearStrengthThresholdNm: number } | { kind: 'nonBreakable' };
export interface DestructionConfig {
  battery: BatteryDestructionConfig; d02: { smokeGaugeThreshold: number; coilOverheatGaugeLimit: number };
  d05: { brushSparkDurationLimitS: number; brushSparkCurrentThresholdA: number };
  d06: { breakage: GearBreakageProfile }; d07: { magnetHeatGaugeLimit: number; reversibleDroopThreshold: number };
  d09: { bearingSeizureGaugeLimit: number };
}
// 戻り型はQ5(11節)により拡張予定。P3-0実装時点の暫定形は6.3節参照
export type ValidateDestructionConfigResult = { ok: true; config: DestructionConfig } | { ok: false; missingFields: readonly string[]; invalidFields: readonly { field: string; reason: string }[] };
export function validateDestructionConfig(draft: DestructionConfigDraft): ValidateDestructionConfigResult;

export type FireExposureRole = 'body' | 'magnet';
export interface FireExposureProfile { bodyEquipped: boolean; adjacentRolesEquipped: readonly Exclude<FireExposureRole, 'body'>[]; }
export function validateFireExposureProfile(raw: { bodyEquipped: boolean; adjacentRolesEquipped: readonly Exclude<FireExposureRole, 'body'>[] }): { ok: true; profile: FireExposureProfile } | { ok: false; reason: string };

// P3-0では型のみ(4.4節相当)。本体はP3-1
export interface DestructionStepResult<TPhysicsState> { physicsState: TPhysicsState; accumulator: RunAccumulator; termination: RunOutcome | null; }
```

### A.3 materials層(P3-0実装対象)

```ts
// 軽微条件1(Fable指摘): gear総歯数はこの単一の設計較正値定数からのみ参照する
// (v12 3.4節確定値=10、Phase3全ギヤ共通)。2.2節・1.4節・shopEconomy.ts等での
// リテラル散在を禁じる——歯数を要する箇所は必ずこの定数を import して使う
export const GEAR_TOTAL_TOOTH_COUNT = 10;

export type EquipmentRole = 'rotor' | 'battery' | 'gear' | 'brush' | 'magnet' | 'bearing' | 'body';
export type WearState =
  | { readonly kind: 'magnet'; readonly demagnetizationFraction: number }
  | { readonly kind: 'gear'; readonly totalToothCount: number; readonly toothLossCount: number; readonly seizureFraction: number }
  | { readonly kind: 'brush'; readonly wearFraction: number };
// Q7(正式Fable必須修正P2、遡及申告・承認済み): v12が継承したv8 1.2節の`sourceWireItemId: string | null`
// からの契約変更。線材はstackable在庫であり個体itemIdを持たないため(既存StackableStockEntry(wire)は
// materialId+quantityMのスタック在庫)、v8の`sourceWireItemId`はそもそも実装不能だった。
// `sourceWireMaterialId`(素材ID)+`consumedWireM`(消費量記録)への変更は、Phase4巻線記録方式への
// 正しい最小前駆でもある。11節Q7・12節参照
export interface RotorAssemblyState { assemblyId: string; sourceWireMaterialId: WireMaterialId | null; consumedWireM: number; collapsed: boolean; burnedOut: boolean; }
export interface BodyPartState { assemblyId: string; materialId: BodyMaterialId; scorchFraction: number; }
export interface BearingAssemblyState { assemblyId: string; gearItemId: string; seizureFraction: number; }
export interface PlayerInventory {
  readonly cashG: number; readonly items: readonly InventoryItem[]; readonly stackableStock: readonly StackableStockEntry[];
  readonly rotorAssemblies: readonly RotorAssemblyState[]; readonly bodyParts: readonly BodyPartState[]; readonly bearingAssemblies: readonly BearingAssemblyState[];
}
export function computeCompositeGearDamageFraction(wearState: Extract<WearState, { kind: 'gear' }>): number {
  const toothLossFraction = Math.min(1, wearState.toothLossCount / wearState.totalToothCount);
  return 1 - (1 - toothLossFraction) * (1 - wearState.seizureFraction);
}
export function applyMagnetDiff(diff: Extract<DegradationDiff, { role: 'magnet' }>, current: Extract<WearState, { kind: 'magnet' }>): Extract<WearState, { kind: 'magnet' }>;
export function applyGearDiff(diff: Extract<DegradationDiff, { role: 'gear' }>, current: Extract<WearState, { kind: 'gear' }>): Extract<WearState, { kind: 'gear' }>;
export function applyBrushDiff(diff: Extract<DegradationDiff, { role: 'brush' }>, current: Extract<WearState, { kind: 'brush' }>): Extract<WearState, { kind: 'brush' }>;
export function applyRotorDiff(diff: Extract<DegradationDiff, { role: 'rotor' }>, current: RotorAssemblyState): RotorAssemblyState;
export function applyBodyDiff(diff: Extract<DegradationDiff, { role: 'body' }>, current: BodyPartState): BodyPartState;
export function applyBearingDiff(diff: Extract<DegradationDiff, { role: 'bearing' }>, current: BearingAssemblyState): BearingAssemblyState;
```

### A.4 store層(P3-0実装対象、本書1節・5節で拡張する部分は※で示す)

```ts
export interface SaveEnvelopeMeta {
  saveId: string; lastAppliedRunSequence: number; nextRunSequence: number;
  leaseToken: string; leaseHeartbeatAt: string; pendingApplication: RunApplicationEnvelope | null;
}
export interface TabRuntimeState { currentRunSequence: number | null; }

export type EquipmentIdSnapshot =
  | { context: 'motor'; rotorAssemblyId: string; batteryItemId: string; brushItemId: string; magnetItemId: string; gearItemId: null; bearingAssemblyId: null; bodyAssemblyId: null }
  | { context: 'vehicle'; rotorAssemblyId: string; batteryItemId: string; brushItemId: string; magnetItemId: string; gearItemId: string; bearingAssemblyId: string; bodyAssemblyId: string | null };

// ※ notebookRecordはQ3(11節)により追加。v12契約への追加のため人間再承認対象
export interface RunApplicationEnvelope {
  runKey: { saveId: string; runSequence: number }; leaseToken: string; outcome: RunOutcome;
  equipmentSnapshot: EquipmentIdSnapshot; notebookRecord: PendingNotebookRecord;
}

export type ApplyRunOutcomeError =
  | { kind: 'saveIdMismatch' } | { kind: 'staleLease' } | { kind: 'leaseNotAcquired' }
  | { kind: 'invalidRunSequence' } // Q1(11節)、契約追加
  | { kind: 'missingEquipment'; role: EquipmentRole };

// ※ consumedEquipmentIdsはQ4b(11節)により追加。v12契約への追加のため人間再承認対象
export interface AppliedRunResult {
  runKey: { saveId: string; runSequence: number }; applied: boolean;
  newlyDiscoveredModes: readonly DestructionModeId[]; rewardsGrantedG: number;
  resolvedDegradations: ReadonlyArray<{ role: EquipmentRole; resolvedAssemblyOrItemId: string }>;
  consumedEquipmentIds: readonly { role: EquipmentRole; id: string }[];
}
export type ApplyRunOutcomeResult =
  | { ok: true; result: AppliedRunResult; nextInventory: PlayerInventory; nextDiscoveredModes: ReadonlySet<DestructionModeId>; nextSaveMeta: SaveEnvelopeMeta }
  | { ok: false; error: ApplyRunOutcomeError };
export function applyRunOutcome(envelope: RunApplicationEnvelope, currentInventory: PlayerInventory, discoveredModes: ReadonlySet<DestructionModeId>, saveMeta: SaveEnvelopeMeta): ApplyRunOutcomeResult;
export function retryPendingApplication(saveMeta: SaveEnvelopeMeta, currentInventory: PlayerInventory, discoveredModes: ReadonlySet<DestructionModeId>): ApplyRunOutcomeResult;
export function abandonPendingApplication(saveMeta: SaveEnvelopeMeta): SaveEnvelopeMeta { return { ...saveMeta, pendingApplication: null }; }
// 依存閉包(実装時に判明、Suu_mot3裁定・契約意味の変更ではない): rebind時にheartbeatも
// 更新するという既に確定済みの仕様(4.2節)を実装可能にするため、now(現在時刻)を依存注入
// パラメータとして追加した3引数版へシグネチャを補完する(touchLeaseHeartbeatと同じ
// テスト容易性パターン、偽時計を注入できるようにする)。
export function rebindLeaseForPendingApplication(saveMeta: SaveEnvelopeMeta, newLeaseToken: string, now: string): SaveEnvelopeMeta;

// 4.1節: lease stale判定(依存閉包、実装時に追加。境界規則の実行可能な形での確定)
export const LEASE_STALE_THRESHOLD_MS = 20_000;
export function isLeaseHeartbeatStale(leaseHeartbeatAt: string, now: string): boolean; // 不正ISO・
// 未来時刻(負のelapsed)は安全側でstale扱いとする

// 5.2節: 図鑑初回登録報酬(依存閉包、実装時に追加。spec §5.1/§7.5のDoDを満たすための機構実証)
export const PROVISIONAL_DISCOVERY_REWARD_G = 500; // 正の整数の仮額。Phase5経済結線までの
// provisional値であり較正値ではない。既存の別用途経済定数(INITIAL_CASH_G等)を意味を
// 偽って流用せず、専用の新規定数とする
```

## 1. 装備(EquipmentLoadout / EquipmentIdSnapshot)の型定義・検証・消費後整合性

### 1.1 型定義

`EquipmentLoadout`(store所有の「現在装備」永続状態)は**contextを持たない**。`rotorAssemblyId`・`brushItemId`・`magnetItemId`・`gearItemId`・`bearingAssemblyId`は常に必須。`bodyAssemblyId`は任意装備でnull許容。`batteryItemId`は`string | null`(1.3節)。

```ts
export interface EquipmentLoadout {
  rotorAssemblyId: string; batteryItemId: string | null; brushItemId: string;
  magnetItemId: string; gearItemId: string; bearingAssemblyId: string; bodyAssemblyId: string | null;
}
```

`EquipmentIdSnapshot`は附録A.4のとおり(`EquipmentLoadout`とは別型)。

### 1.2 検証関数・装備中個体の保護規則

```ts
export type ValidateEquipmentLoadoutResult =
  | { ok: true; loadout: EquipmentLoadout & { batteryItemId: string } }
  | { ok: false; reason: string; missingRole: EquipmentRole };
export function validateEquipmentLoadout(loadout: EquipmentLoadout, inventory: PlayerInventory): ValidateEquipmentLoadoutResult;
// 検証内容: 各roleのID実在・family一致、bearingAssembly.gearItemId===loadout.gearItemId、
// batteryItemId===nullなら必ずok:false(missingRole:'battery')

export type ValidateEquipmentIdSnapshotResult = { ok: true } | { ok: false; reason: string };
export function validateEquipmentIdSnapshot(snapshot: EquipmentIdSnapshot, runContext: DestructionRunContext): ValidateEquipmentIdSnapshotResult;

export function captureEquipmentIdSnapshot(loadout: EquipmentLoadout & { batteryItemId: string }, context: 'motor' | 'vehicle'): EquipmentIdSnapshot {
  const common = { rotorAssemblyId: loadout.rotorAssemblyId, batteryItemId: loadout.batteryItemId, brushItemId: loadout.brushItemId, magnetItemId: loadout.magnetItemId };
  return context === 'motor'
    ? { context: 'motor', ...common, gearItemId: null, bearingAssemblyId: null, bodyAssemblyId: null }
    : { context: 'vehicle', ...common, gearItemId: loadout.gearItemId, bearingAssemblyId: loadout.bearingAssemblyId, bodyAssemblyId: loadout.bodyAssemblyId };
}
```

**装備中個体のサルベージ・削除の保護規則**: `EquipmentLoadout`のいずれかのフィールドが指す`itemId`/`assemblyId`は、**明示的な装備解除(unequip)を経ない限りサルベージ・削除操作の対象にできない**(原則拒否)。装備解除・変更のUI操作自体はP3-0のスコープ外(後続ステップで実装)としてよいが、`setEquipmentLoadout`系のstore action(brabit実装)は必ず`validateEquipmentLoadout`(検証対象は更新後の値)を通過した値のみを受理する契約とする——この不変条件自体はP3-0で凍結する。

### 1.3 battery消費後の整合性

**問題**: v12の`DegradationDiff`は`{role:'battery', kind:'consumed'}`を持ち、`applyRunOutcome`は該当battery`InventoryItem`を`inventory.items`配列から直接除去する。除去後、`EquipmentLoadout.batteryItemId`が存在しない個体IDを指したままだと、次のrun開始で`validateEquipmentLoadout`が必ず失敗する。自動で別電池を装備する挙動(プレイヤーの意図しない選択)は導入しない。

**確定設計**: `EquipmentLoadout.batteryItemId`を`string | null`とし、battery消費diffの適用と**同一の単一`set()`**で、`inventory.items`からの除去と`equipmentLoadout.batteryItemId = null`への更新を同時に行う。この機構は附録A.4の`AppliedRunResult.consumedEquipmentIds`(役割・IDの一覧)を経由する——`applyRunOutcome`(pure)は除去した個体の`(role, id)`一覧を`consumedEquipmentIds`として返すのみで、`EquipmentLoadout`自体は書き換えない(`applyRunOutcome`の入出力に`EquipmentLoadout`を含めない、v12の既承認シグネチャを変更しない)。**store action(`performApplyRunOutcome`)が`consumedEquipmentIds`を読み、対応するloadoutフィールドをnull化する処理を、同じ単一`set()`内で行う**(5.2節で手順を確定する)。

**正式Fable裁定**: Q4a(battery消費後の自動null化+明示的再装備という設計自体)・Q4b(`consumedEquipmentIds`フィールド追加)とも**承認済み**。Q4a裁定理由: 別電池の自動装備はプレイヤーの意図しないレシピ変更(物理configの出所の無断差し替え)であり導入しないのが正しい。電池が破壊で消滅したのだから再装備を求めるのは世界観内でも自然な摩擦である(ゲームプレイ設計として人間承認の最終判断へ)。Q4b裁定理由: pure関数が`EquipmentLoadout`に触れない層分離を保ったまま、store actionが同一`set()`内でnull化するために必要十分な機構であり、「現在のloadoutと一致する場合のみnull化」の規則(5.2節手順5)も正しいと確認された。`consumedEquipmentIds`フィールドの追加は`AppliedRunResult`(v12 1.5節確定済み型)への追加のため、人間再承認リストへ含める(11節)。

### 1.4 gear購入時のbearing自動生成・gear切替時のbearing自動解決

ギヤ購入時、**非交換の`BearingAssemblyState`を同時に1件生成する**(軸受はギヤに1:1で紐づく非交換部位)。

```
ギヤ購入action(store層、brabit実装、alice提供のロジックを呼ぶ):
  1. 新規InventoryItem(family:'gear', wearState:{kind:'gear', totalToothCount:GEAR_TOTAL_TOOTH_COUNT, toothLossCount:0, seizureFraction:0})を発行
  2. 同時に新規BearingAssemblyState({assemblyId: 新規発行, gearItemId: 1.のitemId, seizureFraction:0})を生成
  3. inventory.items・inventory.bearingAssembliesの両方へ単一setで追加する
```

ギヤ装備切替時、`gearItemId`と`bearingAssemblyId`は常にペアで更新する(片方だけを更新するAPIは提供しない)。

```ts
export type SetGearEquipmentResult = { ok: true; bearingAssemblyId: string } | { ok: false; reason: string };
export function resolveBearingForGear(gearItemId: string, inventory: PlayerInventory): SetGearEquipmentResult {
  const bearing = inventory.bearingAssemblies.find((b) => b.gearItemId === gearItemId);
  return bearing ? { ok: true, bearingAssemblyId: bearing.assemblyId } : { ok: false, reason: `${gearItemId}に対応するBearingAssemblyStateが見つかりません` };
}
```

ギヤのサルベージ・削除操作は、対応する`BearingAssemblyState`も同時に削除する。装備中ギヤのサルベージ・削除は1.2節の保護規則に従う(装備解除後のみ許可)。

## 2. 物理config・スナップショットの同一起源、legacy初期データの完全確定

### 2.1 capture時の一貫性

1. `validateEquipmentLoadout(loadout, inventory)`を呼ぶ。`ok:false`ならrunを発行しない
2. `equipmentSnapshot = captureEquipmentIdSnapshot(result.loadout, context)`(1.2節)
3. `runContext.context`は上記と同一の`context`値を使う
4. `runContext.gearTotalToothCount`(vehicle時)は、`loadout.gearItemId`が指す同一gear個体の`WearState.gear.totalToothCount`から取得する

### 2.2 legacy初期データの完全確定表

新規セーブ(`v16:save`キー不存在)の初回bootstrap時、次の**固定値**でPlayerInventory・EquipmentLoadoutを決定的に構築する。

| 項目 | 値 |
|---|---|
| `cashG` | `1000`(既存`src/store/shopEconomy.ts`の`INITIAL_CASH_G`定数) |
| rotor: `assemblyId` | `'initial-rotor-01'` |
| rotor: `sourceWireMaterialId` | `'wire-copper-standard'`(既存`WIRE_MATERIALS`の標準銅線) |
| rotor: `consumedWireM` | `1`(Phase4巻線記録方式が未実装のP3-0時点での設計上の暫定値。物理パラメータへは影響しない) |
| rotor: `collapsed` / `burnedOut` | `false` / `false` |
| magnet: `itemId` / `materialId` / `wearState` | `'initial-magnet-01'` / `'magnet-ferrite'` / `{kind:'magnet', demagnetizationFraction:0}` |
| gear: `itemId` / `materialId` / `wearState` | `'initial-gear-01'` / `'gear-pom'` / `{kind:'gear', totalToothCount:GEAR_TOTAL_TOOTH_COUNT, toothLossCount:0, seizureFraction:0}` |
| bearing: `assemblyId` / `gearItemId` / `seizureFraction` | `'initial-bearing-01'` / `'initial-gear-01'` / `0` |
| brush: `itemId` / `materialId` / `wearState` | `'initial-brush-01'` / `'brush-copper-plate'` / `{kind:'brush', wearFraction:0}` |
| battery: `itemId` / `materialId` / `wearState` | `'initial-battery-01'` / `'battery-alkaline'` / `undefined` |
| body | 未装備(`bodyParts: []`、`bodyAssemblyId: null`) |
| `stackableStock` | `[{family:'wire', materialId:'wire-copper-standard', quantityM:5}, {family:'coating', materialId:'coating-polyester', quantityMl:10}]` |
| `EquipmentLoadout`初期値 | `{rotorAssemblyId:'initial-rotor-01', batteryItemId:'initial-battery-01', brushItemId:'initial-brush-01', magnetItemId:'initial-magnet-01', gearItemId:'initial-gear-01', bearingAssemblyId:'initial-bearing-01', bodyAssemblyId:null}` |

**ID発行prefix・counter**:

| 対象 | prefix | 初期counter | 例 |
|---|---|---|---|
| `InventoryItem`(magnet/gear/brush/battery) | `'item-'` | `1`(4桁ゼロ埋め) | `item-0001` |
| `RotorAssemblyState`/`BodyPartState`/`BearingAssemblyState` | `'assembly-'` | `1`(4桁ゼロ埋め) | `assembly-0001` |

固定初期ID(`initial-`)とcounter発行ID(`item-`/`assembly-`)は名前空間が異なるため衝突しない。`idCounters`スライス`{nextItemCounter:number; nextAssemblyCounter:number}`(両方初期値`1`)がcounterを保持する。

```ts
export function createInitialPlayerInventoryAndLoadout(): { inventory: PlayerInventory; loadout: EquipmentLoadout } {
  return {
    inventory: {
      cashG: 1000,
      items: [
        { itemId: 'initial-magnet-01', family: 'magnet', materialId: 'magnet-ferrite', wearState: { kind: 'magnet', demagnetizationFraction: 0 } },
        { itemId: 'initial-gear-01', family: 'gear', materialId: 'gear-pom', wearState: { kind: 'gear', totalToothCount: GEAR_TOTAL_TOOTH_COUNT, toothLossCount: 0, seizureFraction: 0 } },
        { itemId: 'initial-brush-01', family: 'brush', materialId: 'brush-copper-plate', wearState: { kind: 'brush', wearFraction: 0 } },
        { itemId: 'initial-battery-01', family: 'battery', materialId: 'battery-alkaline', wearState: undefined },
      ],
      stackableStock: [
        { family: 'wire', materialId: 'wire-copper-standard', quantityM: 5 },
        { family: 'coating', materialId: 'coating-polyester', quantityMl: 10 },
      ],
      rotorAssemblies: [{ assemblyId: 'initial-rotor-01', sourceWireMaterialId: 'wire-copper-standard', consumedWireM: 1, collapsed: false, burnedOut: false }],
      bodyParts: [],
      bearingAssemblies: [{ assemblyId: 'initial-bearing-01', gearItemId: 'initial-gear-01', seizureFraction: 0 }],
    },
    loadout: {
      rotorAssemblyId: 'initial-rotor-01', batteryItemId: 'initial-battery-01', brushItemId: 'initial-brush-01',
      magnetItemId: 'initial-magnet-01', gearItemId: 'initial-gear-01', bearingAssemblyId: 'initial-bearing-01', bodyAssemblyId: null,
    },
  };
}
```

motor-onlyベンチ走行(`finishAssembly`)は、上記`loadout`から`captureEquipmentIdSnapshot(loadout, 'motor')`で一時的なmotor用スナップショットを導出するだけであり、**store側の`equipmentLoadout`スライス自体は一切書き換えない**(1.2節の保護規則と整合)。

### 2.3 `DestructionConfig`のproduction生成元(正式Fable Q2裁定: 案(c)、production配線をP3-4完了時まで遅らせる)

`RunSnapshot.destructionConfig`は完成版`DestructionConfig`を要求するが、P3-0時点ではD01/D03しか実装されない(P3-1)ため、D02/D04/D05/D06/D07/D09の較正値が実在しない状態でどう`RunSnapshot`を完成させるかが問題だった。11節Q2として提示した3案のうち、**Fable裁定は案(c)(production配線自体を、全モードのconfig値が揃う段階=P3-4完了時まで遅らせる)を採用する**。

**裁定理由**: (a)(全モードconfig値を物理判定ロジックより前に完成させる)は、物理判定ロジック・sweep検証が存在しない段階で較正値を確定させることになり、較正を装った暫定値の捏造になる(どのみち各ステップのsweepで改訂され、確定の意味がない)。(b)(`RunSnapshot`を実装段階別の判別unionへ変更)は、`RunSnapshot`契約の変更がvalidator・リプレイ・UIへ波及し最悪の選択肢。(c)は、v8で確定済みの「`DestructionConfigDraft`(段階導入対応)/`DestructionConfig`(完成版)分離」という設計思想(P3-4完了時点で昇格検証する)そのものであり、**契約変更ゼロで済む**。

**付帯事項(Fable指摘)**:
- (i) P3-1〜P3-3の契約実証は、production配線を待たずfixtureベースの統合テストで行う(本計画の既定どおり、6節・8.1節)
- (ii) **帰結**: 破壊モードを人間が実際に試遊できるのはP3-4になる。早期試遊が必要になった場合は、dev専用の暫定config(productionコードパスに混入させない、別ビルド/別フラグ経由)を人間PM承認で別途用意する道を残す(本計画のスコープ外、必要になった時点で別途提案する)
- (iii) P3-4計画では、配線サブステップを最初に置き、D06/D09の実装を配線済みの状態で進めることを推奨する(最終ゲートでのビッグバン統合を避ける)——P3-4計画書作成時にこの順序を反映すること

**`sourceWireMaterialId`のnull値の扱いはこの論点と無関係**——2.2節のとおりlegacy初期rotorは`null`ではなく`'wire-copper-standard'`を使うため、null値自体はP3-0のlegacy初期化経路では発生しない。

**P3-0のスコープ(確定)**: `captureRunSnapshot`・`restoreRunSnapshot`はテストコード内で手構築した完成版`DestructionConfig`fixtureで完全にテストする(6節)。production配線(`gameStore.ts`の`finishAssembly`/`startTestRun`/`startCourseRun`への実接続)はP3-4で行う。**P3-0で`gameStore.ts`へ行う変更は、3節の進捗`saveStore`移管のみに限定する。**

### 2.4 `deriveDegradationDiffs`のP3-0実装範囲(正式Fable Q6裁定: 案(a)、段階実装の不変条件付き)

**問題**: `deriveDegradationDiffs`(附録A.2)を「P3-0で完全実装する」とは、現時点の契約だけでは不可能だった。v12自身がD05のブラシ摩耗換算式(A·s→wearFraction)をP3-3で確定するとしており(v12 3.3節)、D04のmagnet/body延焼(scorch)・D07の不可逆減磁(demagnetization)・D09の焼付き(seizure)についても、`deltaFraction`の具体的な換算式・較正定数はまだ本計画のどこにも存在しない。イベント・状態から`role`/`kind`(どのDegradationDiffバリアントが発生したか)は導出できるが、**`deltaFraction`の数値そのものを捏造せずに「完全実装」することはできない**。

一方、次のkindは較正値を必要としない(離散的な事実、または個体属性から直接導出できる値)ため**P3-0で完全実装する**:

- `{role:'rotor', kind:'collapse'}`(D01)・`{role:'rotor', kind:'burnout'}`(D02発火到達)——2値の事実のみ
- `{role:'battery', kind:'consumed'}`(D03/D04の電池消滅)——2値の事実のみ
- `{role:'gear', kind:'toothLoss', deltaCount}`(D06)——イベント発生回数そのものがカウント値であり、較正定数を要さない

次のkindは連続量`deltaFraction`の換算が未確定のため、**P3-0では実装しない**(D04のmagnet/body scorch・D05のbrush wear・D07のdemagnetization・D09のbearing/gear seizure)。

**Fable裁定は案(a)を採用する**: P3-0では型・集約規則(1 run内の同一kind集約等)と上記の2値/カウント差分のみを実装し、連続量`deltaFraction`の換算は各モードの実装ステップ(D04→P3-2、D05→P3-3、D07/D09→P3-4)で追加する。**裁定理由はQ2(2.3節)と同型**——物理判定ロジック・sweep検証が存在しない段階での換算定数確定は捏造になるため。

**段階実装の不変条件(Fable裁定、機械検証可能な形で確定)**: 「`advanceDestructionState`は、差分換算が実装済みのモードのイベントしか発行してはならない」を段階実装全体の不変条件とする。この不変条件により、未対応kindのイベントは「未実装」ではなく「まだ発生しえない入力」となり(本節の整理どおり)、`deriveDegradationDiffs`側にthrowスタブも暫定値も不要になる。**各モードの実装ステップ(P3-1〜P3-4)のDoDには、「そのステップで発行可能になった全モードについて、対応する差分換算が同一ステップ内に存在することのテスト」を含めること**——これにより不変条件を毎ステップ機械検証可能にする(各ステップの計画書作成時にこのDoD項目を反映すること)。P3-0時点では`advanceDestructionState`本体自体が存在しないため、この不変条件はP3-1以降の各ステップ計画が引き継ぐ。

## 3. 統合永続store `saveStore.ts`: schema・bootstrap・migrationの完全確定

### 3.1 slice構成

単一の`useSaveStore`+単一`persist`ミドルウェア、persist key`'v16:save'`。

```ts
interface PersistedSaveState {
  schemaVersion: number; // 初期値1
  progress: { diagnosisProgress: Record<string, boolean>; courseProgress: Record<string, CourseProgress>; selectedTrackId: string; testRunCompleted: boolean; config: MotorConfig; carConfig: CarConfig; garageSelection: GarageSelection; };
  notebook: { sessions: ExperimentSession[]; courseRuns: CourseRunNotebookRecord[] }; // 6.4節で拡張(vehicleTestRuns)
  inventory: PlayerInventory;
  equipmentLoadout: EquipmentLoadout;
  encyclopedia: { discoveredModes: readonly DestructionModeId[]; codexRecords: readonly CodexRecordEntry[] };
  saveMeta: SaveEnvelopeMeta; // 単一slice、フィールドを分散させない
  idCounters: { nextItemCounter: number; nextAssemblyCounter: number };
}
```

**非persist(runtimeのみ)state**: `currentRunSequence: number | null`・`runtimeLeaseToken: string`・lease取得状態(表示用派生値)・走行開始時に確定した`equipmentSnapshot`(一時値)。

### 3.2 saveId・runtimeLeaseTokenの生成規則

**`saveId`**: 初回bootstrap時に1回だけ`crypto.randomUUID()`(利用不可環境向けfallback生成器あり、可用性のためのfallbackで意味論上の差異はない)で生成し、`saveMeta.saveId`として永続化する。以後再生成しない。

**`runtimeLeaseToken`**: `saveStore`のstoreインスタンス生成時に1回だけ同じ生成関数で生成する。非永続。

**`v16:save`スキーマ自体が壊れている場合**: 3.3節の検証(wrapper形・`state`形・`schemaVersion`・全slice)のいずれかで不正が見つかった場合、**新規bootstrapとして扱わない**(黙って新しい`saveId`を発行すると既存データを実質破棄することになるため)。この異常系はP3-0では自動復旧を実装せず、「整合性エラー」状態として扱う。**UI境界(最低限)**: 通常のゲーム画面へは遷移させず、専用のエラー表示(「セーブデータの読み込みに失敗しました」)を出す。具体的な復旧導線(手動リセット案内等)はUI側の別途対応とし、本書のスコープ外。

### 3.3 bootstrap・migration手順(Zustand実体に即した検証順)

**`v16:save`もlocalStorage上は zustand `persist`の標準wrapper形`{state: PersistedSaveState, version: number}`である**。次の順で検証する(v15由来データの読み込みも同型のwrapper検証を経る、6.2節):

```
起動時:
  1. localStorageから'v16:save'キーの生文字列を取得する
  2. 存在する場合:
     a. JSON.parseを試みる。失敗したら3.2節の異常系(整合性エラー)へ
     b. パース結果が{state: object, version: number}という標準wrapper形であることを
        runtime検証する。不一致なら異常系へ
     c. state.schemaVersionが期待値(現在1)であることを確認する。不一致なら異常系
        (将来の非破壊的versionアップ時はここでフィールド単位の補完処理を行う余地を残す)
     d. state内の全slice(progress/notebook/inventory/equipmentLoadout/encyclopedia/
        saveMeta/idCounters)それぞれについて、6.2節相当のruntime検証(型・判別union・
        finite数値・文字列であるべき箇所が文字列か等)を行う。**saveIdだけが正常で
        他sliceが壊れている場合も、全体として不採用(異常系)とする**(部分的な
        信頼はしない)
     e. すべて通過したら、そのままstoreの初期状態として採用する。'v15:progress'/
        'v15:notebook'は一切読み直さない(v16が単一の正、旧v15由来データで上書きしない)
  3. 'v16:save'キーが存在しない場合(初回起動、またはv15からの初移行):
     a. 'v15:progress'キーが存在すれば、それも同じwrapper形検証(1〜dと同型の手順、
        6.2節)を経てprogressスライスへコピー移行する。存在しない、または検証失敗
        (フィールド単位)なら該当フィールドのみ新規初期値を使う(6.2節手順3の
        fallback方針)
     b. 'v15:notebook'キーが存在すれば、同様にnotebookスライスへコピー移行する
     c. inventory・equipmentLoadoutは、2.2節の createInitialPlayerInventoryAndLoadout()
        による新規初期値から開始する(移行元データが存在しないため)
     d. encyclopedia・saveMeta・idCountersは新規初期値から開始する
        (discoveredModes:[]、codexRecords:[]、
        saveMeta: {saveId: 新規生成, lastAppliedRunSequence:0, nextRunSequence:1,
        leaseToken:'', leaseHeartbeatAt:(常にstale判定される過去日時), pendingApplication:null}、
        idCounters: {nextItemCounter:1, nextAssemblyCounter:1})
     e. 上記a〜dの結果を'v16:save'として初めて永続化する
  4. 'v15:progress'/'v15:notebook'キーは、移行後も削除しない(人間試遊確認まで
     並存させ、'v16:save'の有無で「移行済みか」を判定できるようにする)
```

## 4. lease/runSequence状態機械

### 4.1 用語・初期値

- `runtimeLeaseToken`: タブ内非永続、起動時1回生成(3.2節)
- `saveMeta.leaseToken`: 永続。bootstrap直後は空文字列
- `saveMeta.leaseHeartbeatAt`: 永続、ISO文字列。bootstrap直後は常にstale判定される過去日時
- heartbeat更新間隔: **5秒**。stale判定閾値: **20秒**。**境界規則: 経過時間が20000ms以上ならstale(`elapsedMs >= 20000`、20秒ちょうどはstale側)**。根拠: 5秒間隔はブラウザの非アクティブタブタイマー間引きを考慮しても数回に1回は届く頻度、20秒はheartbeat間隔の4倍で正常なタブの一時遅延を吸収しつつ待機を実用範囲に抑える。P3-0実装時のsweep・人間試遊で調整可
- `leaseHeartbeatAt`が不正なISO文字列(パース不能)の場合: **stale扱いにする**(安全側。パース不能な値を「新鮮」と解釈すると、誰もそのタブの所有権を奪えなくなるリスクがあるため)
- `saveMeta.nextRunSequence`初期値: `1`。`saveMeta.lastAppliedRunSequence`初期値: `0`
- **背面タブのthrottlingは意図仕様として許容する(軽微条件2、Fable指摘)**: ブラウザの背面タブ間引き(例: Chromeのintensive throttlingでは分単位までタイマーが間引かれうる)により、生きた(閉じていない)背面タブでもheartbeatが20秒を超えて更新されず、lease所有権を失うことがありうる。これは意図仕様として許容する——背面タブはrequestAnimationFrame等も停止しているため走行(run)自体が進行しておらず、所有権喪失による実害は限定的である。

### 4.2 状態遷移

```
[起動/hydration完了時]
  runtimeLeaseToken(タブ固有) vs saveMeta.leaseToken(永続) を比較する

  ケース1: leaseToken不一致 かつ leaseHeartbeatAt が新鮮(20秒未満)
    → 状態=待機(leaseNotAcquired)。新規run開始・retryPendingApplication とも拒否
    → heartbeatタイマーは起動しない
    → leaseHeartbeatAtがstaleになるまで定期的に再判定する(自動遷移、UI操作不要)

  ケース2: leaseToken不一致 かつ leaseHeartbeatAt が古い(20秒以上)、
           または leaseToken が空文字列(bootstrap直後・初回)
    → rebindLeaseForPendingApplication(saveMeta, runtimeLeaseToken, now) を呼ぶ
      (nowはこの再判定時点の現在時刻。依存注入により偽時計を注入できる、4.4節の方針)
    → 状態=取得済み(acquired)。heartbeatタイマー起動
    → pendingApplicationが非nullなら retryPendingApplication を自動実行する

  ケース3: leaseToken一致(このタブが既に所有している、再描画等)
    → 状態=取得済み(acquired)のまま
```

**既知の限界**: localStorageは非トランザクションであるため、**2タブが同時にstale判定し`rebindLeaseForPendingApplication`を実行した場合、最後の書き込みが勝つ**(既知の限界として明記するのみとし、追加の同期プロトコルは導入しない)。

### 4.3 heartbeat所有権guard

```ts
export function touchLeaseHeartbeat(saveMeta: SaveEnvelopeMeta, runtimeLeaseToken: string, now: string): SaveEnvelopeMeta | null {
  if (saveMeta.leaseToken !== runtimeLeaseToken) return null; // no-op、呼び出し側がタイマーを停止する
  return { ...saveMeta, leaseHeartbeatAt: now };
}
```

**pagehideの扱い**: best-effortでタイマーを停止するだけとし、heartbeatを能動的に書き換えて早期stale化する処理は行わない(v12確定方針「pagehideは補助であって正しさの根拠にしない」との整合。能動的な早期stale化はそれ自体が追加の書き込み経路になり、既知の限界(2タブ同時書き込み)を増やすだけであるため採用しない)。

**テスト**: 偽時計・固定トークンで「タブAが取得済み→タブBがstale判定してrebind→タブAの次回`touchLeaseHeartbeat`呼び出しがno-opになりタブAのタイマーが自ら停止する」ことを検証する(8.1節)。

### 4.4 runSequence発行action(`beginRun`)

**欠落していた設計**: `nextRunSequence`の初期値`1`・適用時検証(5.1節)はあったが、**run開始時に番号を予約し`nextRunSequence`を増やす処理自体が本書のどこにもなかった**。これでは最初のrunで`runSequence=1`を作っても、`applyRunOutcome`が`1 >= nextRunSequence(=1)`により必ず`invalidRunSequence`を返してしまい、実装不能だった。**`beginRun`をP3-0でfixtureテストまで完全実装する。**

**前提条件**: lease取得済み(4.2節「取得済み」状態)・`saveMeta.pendingApplication===null`・`currentRunSequence===null`・`validateEquipmentLoadout`成功。

```ts
export type BeginRunResult =
  | { ok: true; runSequence: number; nextSaveMeta: SaveEnvelopeMeta; equipmentSnapshot: EquipmentIdSnapshot }
  | { ok: false; reason: 'leaseNotAcquired' }
  | { ok: false; reason: 'runInProgress' } // currentRunSequence !== null
  | { ok: false; reason: 'pendingApplicationExists' } // saveMeta.pendingApplication !== null
  | { ok: false; reason: string; missingRole: EquipmentRole }; // validateEquipmentLoadout失敗

// src/store/runOutcomeApplication.ts。leaseAcquiredは呼び出し元(store action)が4.2節の
// 状態機械から判定した「このタブがlease取得済みか」の現在値を渡す(この関数自体は
// runtimeLeaseTokenを保持しないため、判定済みの真偽値として受け取る)
export function beginRun(
  loadout: EquipmentLoadout, inventory: PlayerInventory, context: 'motor' | 'vehicle',
  saveMeta: SaveEnvelopeMeta, currentRunSequence: number | null, leaseAcquired: boolean,
): BeginRunResult {
  if (!leaseAcquired) return { ok: false, reason: 'leaseNotAcquired' };
  if (currentRunSequence !== null) return { ok: false, reason: 'runInProgress' };
  if (saveMeta.pendingApplication !== null) return { ok: false, reason: 'pendingApplicationExists' };
  const validated = validateEquipmentLoadout(loadout, inventory);
  if (!validated.ok) return { ok: false, reason: validated.reason, missingRole: validated.missingRole };
  const equipmentSnapshot = captureEquipmentIdSnapshot(validated.loadout, context);
  const runSequence = saveMeta.nextRunSequence;
  return { ok: true, runSequence, nextSaveMeta: { ...saveMeta, nextRunSequence: runSequence + 1 }, equipmentSnapshot };
}
```

**store action側の単一`set()`**(呼び出し元、brabit実装): `beginRun`が`ok:true`を返した場合、同一の単一`set()`で (a) `saveMeta`を`result.nextSaveMeta`へ更新(`nextRunSequence`の即時永続化を含む)、(b) `currentRunSequence = result.runSequence`(タブ内runtime)、(c) `equipmentSnapshot`をrun終了までの一時runtime値として保持する(3.1節)、をまとめて行う。`ok:false`の場合は一切の状態を変更しない。

**production配線とP3-0スコープの関係**: `beginRun`自体(および偽store統合テスト)はP3-0のスコープに含む。実際に`gameStore.ts`の`finishAssembly`/`startTestRun`/`startCourseRun`から呼び出す配線は、2.3節の正式Fable Q2裁定(案(c))どおりP3-4で行う——`beginRun`自体は`DestructionConfig`を直接扱わないため型としては先に確定できるが、実際に呼ばれる配線はP3-4でまとめて行う(2.3節付帯事項(iii)、配線サブステップを最初に置く)。

**テスト(8.1節へ追加)**: 多重開始拒否(`currentRunSequence`非null時の`runInProgress`、`pendingApplication`非null時の`pendingApplicationExists`)、放棄・未完走のrunでも番号が再利用されないこと(`beginRun`成功後に`nextRunSequence`が既に進んでいるため、そのrunを放棄しても後続の`beginRun`は次の番号を発行する)、reload後も`nextRunSequence`が維持されること(`nextSaveMeta`が即時永続化されるため)。

### 4.5 lease未取得タブの書き込み全面ブロック(正式Fable必須修正P1)

**欠落していた設計**: 従来の記述はrun適用(5節)・heartbeat(4.3節)・`beginRun`(4.4節)についてはleaseゲートを規定していたが、**購入・売却/サルベージ・装備変更(`EquipmentLoadout`更新)・在庫消費・セーブ初期化・実験ノート操作等、run以外の`saveStore`書き込みaction全般には、leaseゲートが及んでいなかった**。この穴を放置すると、lease未取得のタブB(4.2節「待機」状態)が在庫・装備を書き換えられてしまい、タブAが走行中にその装備個体が消える(=`missingEquipment`の主要な発生源になる)という形でlease機構全体が実質的に迂回される。

**確定する不変条件**: **閲覧を除くすべての`saveStore`書き込みactionは、lease取得済み(4.2節の状態機械が「取得済み」状態であること)を共通の事前ゲートとする。** これは`pendingApplication`が非null時にすべての書き込みをブロックする既存の入口ゲート(6節・7節)と同型のパターンであり、判定対象を「pending中か」から「lease取得済みか」へ広げたものとして、`saveStore.ts`の全書き込みactionの共通の入口(ミドルウェア的な事前チェック、または各actionの冒頭での共通ガード呼び出し)として実装する。

**UI側の帰結**: 待機中(6-D-0)は、新規走行開始だけでなく、購入・売却/サルベージ・装備変更・在庫消費・セーブ初期化・実験ノート操作等の状態変更系の全入口をUI側でも無効化する(7節)。

**テスト(8.2節へ追加)**: lease未取得時に購入・装備変更等の書き込みactionが拒否されることのテスト。

## 5. applyRunOutcomeの原子性・冪等性・エラー戻り値・action順序

### 5.1 検証順序の確定(二層構造、固定)

**`leaseNotAcquired`の責務分離**: `applyRunOutcome`/`retryPendingApplication`(pure関数、附録A.4)の現行シグネチャは`envelope`・`currentInventory`・`discoveredModes`・`saveMeta`のみを受け取り、**このタブが現在leaseを取得済みかどうか(runtimeの`runtimeLeaseToken`由来の状態)を引数として持たない**。したがって`leaseNotAcquired`は、これらpure関数の内部検証だけでは判定できない。**`leaseNotAcquired`は`saveStore` action層が、pure関数を呼ぶ前に4.2節の状態機械(取得済み/待機)を検証して返す、action-levelの結果として明記する。** 未取得の場合、store actionはpure関数を一切呼ばず、`{ok:false, error:{kind:'leaseNotAcquired'}}`相当の結果を直接構築して返す。

**二層の検証順序**:

- **①store action層(pure関数呼び出し前)**: 4.2節の状態機械により、このタブが現在lease取得済みかを検証する。未取得なら`leaseNotAcquired`を返し、pure関数を呼ばない
- **②pure関数内部(`applyRunOutcome`/`retryPendingApplication`)**: ①を通過した呼び出しのみが到達する。次の順序で固定する:
  1. **`saveId`一致**: `envelope.runKey.saveId === saveMeta.saveId`か。不一致なら`saveIdMismatch`
  2. **lease一致**: `envelope.leaseToken === saveMeta.leaseToken`か。不一致なら`staleLease`(rebind等により、①の時点では取得済みだったこのタブの所有権が、envelope作成後に他タブへ移っていた場合を検出する)
  3. **runSequence判定**(5.3節で規則を確定): `runSequence >= nextRunSequence`なら`invalidRunSequence`。`runSequence <= lastAppliedRunSequence`なら冪等skip(正常終了)へ分岐
  4. **全装備preflight**: `equipmentSnapshot`の各IDが`currentInventory`に実在するか、`degradationDiffs`が指す全roleが解決可能かを、実際に適用する前に**全件**チェックする。いずれか解決不能なら`missingEquipment`(部分適用はしない)

**`ApplyRunOutcomeError`の`leaseNotAcquired`バリアント自体は型として残す**(附録A.4、v12確定済み)が、**pure関数自身の内部ロジックがこの値を生成することはない**(②の順序にこの判定が存在しないことに対応する)。呼び出し側(store action)がこの値を含む`ApplyRunOutcomeResult`形の結果を、pure関数を経由せずに直接組み立てて返すことで、呼び出し元コードは常に同じ結果型を扱える。

**`retryPendingApplication`の呼び出し前提**: `saveMeta.pendingApplication !== null`であることを**呼び出し前提(precondition)**とする。store action層はこの前提を保証してから呼ぶ契約とし、`retryPendingApplication`自体は`pendingApplication===null`の場合の呼び出しを想定しない(型で新しいarmを追加するのではなく、呼び出し規約として明記するに留める。前提が破られた場合の挙動を関数の戻り値契約には含めない)。
5. 4を通過したら実際の適用処理(資産更新・discoveredModes更新・consumedEquipmentIds算出等をまとめて計算する)

**この順序が必要な理由(2点の一致を先に見る)**: `saveId`→`lease`を`runSequence`より先に検証することで、**rebindにより所有権を失った古いタブが、たまたま既適用済みの`runSequence`を持つenvelopeを再送してきた場合でも、必ず`staleLease`が返る**(先に`runSequence`を見て冪等skipとしてしまうと、「所有権を失ったタブを一律拒否する」という契約が崩れる)。

### 5.2 原子的適用の完全手順

**問題1(実験ノート)**: 既存`ExperimentSession`(motor)・`CourseRunNotebookRecord`(vehicle、trackId必須)は`RunOutcome`が持たない情報(時系列サンプル・trackId等)を必要とする。一時引数渡しでは`missingEquipment`→reload→`retryPendingApplication`でノート入力が失われる。**確定設計**: 走行終了時、store層が`RunApplicationEnvelope`組み立てと同時にJSON-safeなnotebook recordを確定し、`RunApplicationEnvelope`自体の永続payload(`notebookRecord`、附録A.4)として持たせる。型の詳細・50件上限の扱いは6.4節で確定する(正式Fable Q3裁定済み)。

**問題2(図鑑記録の生成元)**: **`outcome.terminalModes`を入力にしない**(D01/D05/D07・D06の全損前イベント等の非終端発見は`terminalModes`に含まれず、非destruction `RunOutcome`には`terminalModes`フィールド自体が存在しない)。**`applyRunOutcome`(pure)が返す`result.newlyDiscoveredModes`(附録A.4の`AppliedRunResult`)を唯一の入力にする**。`applyRunOutcome`内部は`outcome.events`(全モードのイベント、terminal/非terminal問わず)から`mode`をすべて集め、`discoveredModes`にまだ含まれないものを`newlyDiscoveredModes`として算出する。各`modeId`について`outcome.replaySnapshot`を`CodexRecordEntry.replaySnapshot`として保存する。

```ts
export interface CodexRecordEntry {
  modeId: DestructionModeId;
  firstDiscoveredAtRunSequence: number; // envelope.runKey.runSequenceから取得(RunOutcome自体は
  // runSequenceを持たない、v12 1.8節のengine個体ID非依存性と整合)
  replaySnapshot: RunSnapshot;
}
```

`codexRecords`は最大8件(D01〜D09からD08を除いた8モード)、`modeId`一意、追記のみ(既存レコードを上書きしない)。

**確定手順(単一`set()`)**:

```
performApplyRunOutcome(outcome: RunOutcome):
  1. equipmentSnapshot = (走行開始時に確定済みの一時値、3.1節)
  2. notebookRecord = buildPendingNotebookRecord(outcome, context, 走行中に蓄積した
     history/testRunHistory/courseRunHistory)(既存バッファからの詰め替え、6.4節)
  3. envelope = { runKey: {saveId, runSequence}, leaseToken: runtimeLeaseToken, outcome,
     equipmentSnapshot, notebookRecord }
  4. result = applyRunOutcome(envelope, inventory, discoveredModes, saveMeta)
  5. result.ok === true かつ result.result.applied === true(新規適用)の場合、
     同一の単一set()で以下すべてを同時更新する:
     - inventory(cash報酬を含む、result.nextInventory)
     - equipmentLoadout: result.result.consumedEquipmentIds のうち role:'battery' の
       エントリについて、現在のloadout.batteryItemIdと一致するなら null へ更新する
       (1.3節)。一致しない場合(既に装備から外されていた場合)は変更しない
     - discoveredModes(result.nextDiscoveredModes)
     - codexRecords(result.result.newlyDiscoveredModesの各modeIdについて、
       {modeId, firstDiscoveredAtRunSequence: envelope.runKey.runSequence,
       replaySnapshot: outcome.replaySnapshot} を追記する)
     - notebook(6.4節の規則でenvelope.notebookRecordを追記)
     - saveMeta(result.nextSaveMeta)
     - currentRunSequence(nullへ)
  6. result.ok === true かつ result.result.applied === false(冪等skip)の場合、
     saveMeta以外(inventory/equipmentLoadout/discoveredModes/codexRecords/notebook)は
     一切更新しない。currentRunSequenceはnullへ更新する
  7. result.ok === false の場合、5.3節の条件表に従う
```

**preflightの担保**: 手順4(`applyRunOutcome`)内部で、5.1節の検証順序4「全装備preflight」がすべてのdiffの解決可能性を事前確認してから適用計算を行うため、**途中で一部だけ適用されてinventory/loadoutが不整合な状態になることはない**(全成功か全不変のいずれか)。8.1節でこの原子性をテストする。

**reload安全性の境界**: `RunOutcome`確定直後、UIの`await`やボタン待ちを一切挟まず、同一の同期コールスタック内で`performApplyRunOutcome`を必ず呼ぶ。手順5・6・5.3節の`set()`呼び出しの完了が、v12 1.7節の「走行終了確定後」というreload保証の実装上の具体的な地点である。

### 5.3 currentRunSequence・pendingApplication解放条件(完全表、14ケース)

**v12 1.5節の解放条件は「成功・冪等skip・明示的放棄のみ」であり、それ以外のエラーで`currentRunSequence`を解放しない。**

**runSequence判定の確定規則(正式Fable Q1承認)**: `envelope.runKey.runSequence <= saveMeta.lastAppliedRunSequence` → 正常な冪等skip(エラーではない)。`envelope.runKey.runSequence >= saveMeta.nextRunSequence` → `invalidRunSequence`(まだ発行されていない番号)。上記いずれでもない範囲(既発行だが未適用のまま放棄された「穴」の番号を含む)→ エラーにせず通常の適用処理へ進む。**注記(Fable指摘)**: 未適用のまま高水位(`lastAppliedRunSequence`)に飛び越された「穴」番号が、以後この判定で冪等skip側(`<=lastAppliedRunSequence`)に落ちるのは仕様上の既知の高水位意味論であり(v9/v10で受容済み)、欠陥ではない——「未適用なのにskipになる」という挙動を将来の読み手が欠陥と誤認しないための注記である。

初回apply・retryそれぞれについて、5.1節の検証順序が返しうる全結果(各7通り、計14ケース)を次の表で確定する。

| 呼び出し | 結果 | `pendingApplication` | `currentRunSequence` | inventory/loadout/notebook/codex | `lastAppliedRunSequence` | heartbeat |
|---|---|---|---|---|---|---|
| 初回apply | 成功(新規適用) | (元々null) | **null化** | 全更新(5.2節手順5) | `runSequence`へ更新 | 触れない |
| 初回apply | 冪等skip | (元々null) | **null化** | 更新しない | 変化なし | 触れない |
| 初回apply | `missingEquipment` | **envelopeを保存(非null化)**——store actionの`set()`内で明示的に行う(pure関数の`ok:false`armは`nextSaveMeta`を返さないため、この永続化はstore action自身の責務) | **維持** | 更新しない | 変化なし | 触れない |
| 初回apply | `saveIdMismatch` | 書き込まない | **維持** | 更新しない | 変化なし | 触れない |
| 初回apply | `staleLease` | 書き込まない | **維持** | 更新しない | 変化なし | 触れない |
| 初回apply | `leaseNotAcquired` | 書き込まない(5.1節①のstore action層による事前判定。pure関数自体は呼ばれない) | **維持** | 更新しない | 変化なし | 触れない |
| 初回apply | `invalidRunSequence` | 書き込まない(壊れたenvelope自体を保存する意味がないため) | **維持** | 更新しない | 変化なし | 触れない |
| retry | 成功(新規適用) | **null化(解放)** | null化(retry時点で既にreload等によりnullの想定。同一セッション内retryなら明示的にnull化) | 全更新(5.2節手順5) | `runSequence`へ更新 | 触れない |
| retry | 冪等skip | **null化(解放)**(既に他経路で適用済みと判明したため) | null化 | 更新しない | 変化なし | 触れない |
| retry | `missingEquipment` | **保持(そのまま非null)** | 維持 | 更新しない | 変化なし | 触れない |
| retry | `saveIdMismatch` | 書き込まない(通常発生しない) | 維持 | 更新しない | 変化なし | 触れない |
| retry | `staleLease` | **保持(そのまま非null、pendingApplicationは書き換えない)**——rebind後に別途再試行させる | 維持 | 更新しない | 変化なし | 触れない |
| retry | `leaseNotAcquired` | **保持(そのまま非null)**——heartbeatがstaleになるまで自動再判定を待つ(4.2節ケース1の待機と同じ扱い、UI操作不要で自動遷移) | 維持 | 更新しない | 変化なし | 触れない |
| retry | `invalidRunSequence` | **保持(そのまま非null)**——壊れたpendingを勝手に破棄せず、異常系として検知・ログのみ行う | 維持 | 更新しない | 変化なし | 触れない |

**放棄操作**: `abandonPendingApplication`は`saveMeta.pendingApplication`をnullへ戻すだけで、`lastAppliedRunSequence`には触れない(高水位が自然に飛び越える)。**同一セッション内で放棄操作を行った場合、この`abandonPendingApplication`の単一`set()`の中で`currentRunSequence`も同時にnullへ更新する**(軽微条件3、Fable指摘。放棄後に`currentRunSequence`だけが取り残されて次のrun開始をブロックし続けることを防ぐ)。

## 6. RunSnapshot capture/restore・v15/v16 migrationのruntime検証詳細

### 6.1 `restoreRunSnapshot`の完全な検証順序(値の形状まで列挙)

1. `raw`が`object`かつ`contractVersion === 1`。不一致なら`{ok:false, reason:'unsupportedContractVersion'}`
2. **`motorConfig`**: 附録A(既存`MotorConfig`)の全フィールドを検証する——`coilTurns`/`slitWidthMm`/`sandingQuality`/`brushPressure`/`magnetStrength`/`magnetDistanceMm`/`axisOffsetMm`は`Number.isFinite`。**`batteryVoltage`は`1.5`または`3.0`のリテラル一致**(任意の有限数ではない)。`wireGaugeMm`/`wireResistivityRatio`/`wireDensityRatio`/`batteryInternalResistanceRatio`/`batteryCapacityRatio`は`undefined`または有限数。`parallelStrands`は`undefined`・`1`・`2`のいずれか。`varnished`は`undefined`または`boolean`
3. **`carConfig`**: `null`、または既存`CarConfig`の全フィールド(`massG`/`gearRatio`/`gearEfficiency`/`wheelDiameterMm`/`tireGrip`/`axleFriction`/`wheelAlignmentMm`/`centerOfMassHeightMm`/`motorMountOffsetMm`)が有限数
4. **`destructionConfig`**: `validateDestructionConfig`(6.3節)の構造・値域検証を通す
5. **`runContext`**: 判別union形状検証+正式M2の必須検証(2.2節・附録A.2)
6. **`initialMotorState`**: 既存`SimState`の全フィールド——`theta`/`omega`/`current`/`backEmf`/`rpm`/`chatterFramesLeft`/`batteryHeat`/`highSpeedFrameCount`は有限数、`shorted`/`running`/`coilCollapsed`は`boolean`
7. **`initialVehicleState`**: `null`、または既存`VehicleSimState`の全フィールド——`motor`(6.の`SimState`検証を再帰適用)、`positionM`/`velocityMps`/`accelerationMps2`/`axleOmega`/`driveForceN`/`loadTorqueNm`/`slipRatio`/`reunionDeferralStreak`/`stalledDurationS`/`derailDurationS`/`coilCollapsePenaltyMm`/`energyUsedJ`/`elapsedTimeS`/`trackSegmentIndex`は有限数、`isSlipping`は`boolean`、**`status`は`'ready'|'running'|'finished'|'stalled'|'derailed'|'overheated'`のいずれかのリテラル一致**、`failureCode`は`undefined`・`'failureToStart'`・`'energyExhausted'`のいずれか、`stallObservation`は`undefined`または`{wasSlippingAtStall:boolean, coilCollapsePenaltyMmAtStall:number, deadZoneAtStall:boolean}`形、`energyBreakdown`は**ネストしたオブジェクト**`{driveJ, gearLossJ, slipLossJ, brushLossJ, heatJ}`の全フィールドが有限数であることを個別に検証する
8. **`seed`**: 有限数
9. **`initialDestructionState`**: `DestructionState`の判別union形状(`battery.profile`が`'lipo'|'nonLipo'`、各`Progress`型のフィールド形状)
10. **`track`**: 非nullの場合のみ既存`createValidatedTrack`/`validateTrackDefinition`で再検証。失敗時`{ok:false, reason:'invalidTrack', details}`
11. 2〜9のいずれかで不正なら`{ok:false, reason:'invalidSchema', details}`
12. すべて通過したら`{ok:true, snapshot: RestoredRunSnapshot}`

**deep copy**: `captureRunSnapshot`(附録A.2の`CaptureRunSnapshotInput`)は走行開始時点の生きたconfig/state参照を深いコピーでスナップショットへ複写する。`input`の各フィールドを呼び出し後に変更しても、返された`RunSnapshot`の中身へは波及しないことを8.1節でテストする。

### 6.2 v15/v16共通: zustand persist wrapper形のruntime検証手順

`v15:progress`/`v15:notebook`/`v16:save`はいずれも zustand `persist`ラッパー由来であり、`localStorage.getItem`で得られる生の値は`unknown`(JSON文字列)である。

1. `JSON.parse`を試みる。失敗したら不正データとして扱う(該当キー全体を無視、fallbackへ)
2. パース結果が`{state: {...}, version: number}`という標準wrapper形であることを検証する(`state`フィールドの存在、`object`型)
3. `state`内の各フィールドの型を検証する(`v15:progress`なら`diagnosisProgress`・`courseProgress`・`selectedTrackId`・`testRunCompleted`・`config`・`carConfig`・`garageSelection`、それぞれ6.1節と同型の形状検証を必要な範囲で適用する)
4. 不正・欠落があった場合のfallback: **`v15:progress`/`v15:notebook`の移行では**、該当フィールドのみ初期値へ差し替え、移行処理自体は継続する(1フィールドの破損で全体の移行を諦めない)。**`v16:save`自体の検証では**、1つでも不正があれば全体を不採用とし3.2節の異常系(整合性エラー)へ入る(v16は「単一の正」であるため部分的な信頼をしない)
5. 旧`v15:progress`/`v15:notebook`キーは移行後も削除しない(3.3節)

### 6.3 `validateDestructionConfig`の判別union対応・値域検証

`DestructionConfigDraft`/`DestructionConfig`の`battery`フィールドは判別union(`profile:'lipo'|'nonLipo'`)、`d06.breakage`も判別union(`kind:'breakable'|'nonBreakable'`)である。**`validateDestructionConfig`はこれらの判別に応じて検証対象を変える**——`profile==='nonLipo'`の場合、lipo専用フィールド(`runawayHeatThreshold`・`unsafeDischargeStartRatio`・`stageDurations`)の存在を要求しない。`breakage.kind==='nonBreakable'`の場合、`gearStrengthThresholdNm`の存在を要求しない。

戻り型は附録A.2のとおり`{ok:false, missingFields, invalidFields}`(**正式Fable Q5裁定: 承認済み**——本計画自身が値域検証(`unsafeDischargeStartRatio∈(0,1)`等)を要求している以上、現行`{ok:false, missingFields}`ではこれを表現できないという矛盾が既に存在するとの指摘は妥当であり、純粋な改善として反対理由がないとの裁定。契約変更として人間再承認リストへ含める、11節)。

検証内容: 各必須フィールドの存在確認に加え、`battery.shortCircuitDurationLimitS`は正の有限数、`profile==='lipo'`時の`unsafeDischargeStartRatio`は`(0,1)`の開区間、`stageDurations.swellingS`/`smokingS`は正の有限数、`runawayHeatThreshold`は正の有限数、`d02.smokeGaugeThreshold`/`coilOverheatGaugeLimit`は正の有限数、`d05.brushSparkDurationLimitS`/`brushSparkCurrentThresholdA`は正の有限数、`breakage.kind==='breakable'`時の`gearStrengthThresholdNm`は正の有限数、`d07.magnetHeatGaugeLimit`/`reversibleDroopThreshold`は正の有限数、`d09.bearingSeizureGaugeLimit`は正の有限数。

### 6.4 実験ノート記録の型(既存コード確認に基づく訂正)

**訂正(実コード確認結果)**: 既存`CourseRunNotebookRecord`(`src/store/notebookStore.ts`)は`trackId: string`が**必須**であり、`src/store/gameStore.ts`の`startTestRun`/`stepTestRun`は`selectedTrackId`を一切参照せず、固定長`TEST_RUN_COURSE_LENGTH_M`(`=10`)のみでtest-runを実行する(track-runとは別の実行経路であることを実コードで確認済み)。**test-runを`CourseRunNotebookRecord`(trackId必須)で表現することはできない**——架空の`trackId`を発明することはしない。

また、既存`sessions`(`ExperimentSession[]`、motor-onlyベンチ)は**上限50件到達時に自動evictしない**——`addSession`は上限到達時、新規セッションを`pendingSession`へ一時退避するだけで`sessions`配列を変更せず、UIが「上限50件です。最も古い記録を削除して新しい記録を保存しますか？」という確認バナー(`src/components/ExperimentNotebook.tsx`)を表示し、プレイヤーが「保存する」(`confirmEviction`、最古を削除して追加)か「破棄する」(`cancelEviction`、新規分を破棄)を選ぶまで確定しない。一方`courseRuns`(`CourseRunNotebookRecord[]`)は`addCourseRun`が無条件で先頭追加+`.slice(0, 50)`により**自動trim**する(確認なし)。**この2つの既存挙動は互いに異なり、v4の「既存evict規則(古い順)を踏襲する」という記載は事実誤認だった(訂正する)。**

**問題**: spec §7.5・v12の原子的run適用はボタン待ちにできない(5.2節、UIのawait/ボタン待ちを挟まない同期コールスタックでの単一set完了が保証点)。既存`sessions`のボタン確認フローをそのまま持ち込むと、この原子性契約と矛盾する。

**正式Fable Q3裁定(3点すべて承認)**: Phase3の原子的run適用では、**motor/test/track全腕を自動で最新50件へtrimする**方式へ統一する(既存`courseRuns`と同じ挙動へ、`sessions`側の確認UIフローは廃止する)。裁定理由: spec §7.5の原子的適用はプレイヤーのボタン選択を待てず、確認フローと原子性は構造的に両立しないため、原子性が優先される。既存`src/components/ExperimentNotebook.tsx`の`pendingSession`/`confirmEviction`/`cancelEviction`関連UIは撤去対象(brabit_mot3のUI側作業)。**この既存UI挙動の変更自体は人間承認の最終判断事項とする。** 任意推奨(条件ではない、brabit裁量): 上限到達で最古の記録が消えた走行後に、非モーダルの通知を1つ出す。

**codexRecordsはtrim対象外(Fable明記)**: 上記の自動trim(50件)は**notebookの3腕(session/vehicleTestRun/courseRun)にのみ適用し、`codexRecords`(追記のみ・最大8件・modeId一意、5.2節)には及ばない**——図鑑記録は経済的な容量制約(50件)ではなく発見済みモード数(最大8)で自然に上限が定まるため、trim機構自体を持たない。

**型設計(正式Fable承認、実コード確認に基づく設計として妥当と評価済み)**: `CourseRunNotebookRecord`のtrackId必須制約を保ったまま、test-run用に別型を新設する3腕判別unionとする:

```ts
export type PendingNotebookRecord =
  | { kind: 'session'; record: ExperimentSession }              // motor context(既存型そのまま)
  | { kind: 'vehicleTestRun'; record: VehicleTestRunNotebookRecord } // vehicle・test-run(新設、trackIdを持たない)
  | { kind: 'courseRun'; record: CourseRunNotebookRecord };      // vehicle・track-run(既存型そのまま、trackId必須)

// 既存CourseRunNotebookRecordからtrackIdを除いた形(新設)
export interface VehicleTestRunNotebookRecord {
  id: string; savedAt: string; motorConfig: MotorConfig; carConfig: CarConfig; seed: number;
  status: VehicleSimState['status']; elapsedTimeS: number; positionM: number;
  energyUsedJ: number; energyBreakdown: EnergyBreakdown; samples: TestRunSample[];
}
```

**契約上の位置づけ**: この型・evict方式変更はv12契約への追加ではなく、既存notebookStore型への追加(brabit所有領域寄り)だが、原子性という設計原則に関わる判断のためFable裁定を経た。`RunApplicationEnvelope.notebookRecord`フィールド自体の追加(v12 1.5節への契約追加)は11節Q3(i)として人間再承認対象に含める。

## 7. UI導線

- **lease待機中(`leaseNotAcquired`)**: 専用の待機画面(`docs/phase3-ui-autopsy-plan-v5.md` 6-D-0節)。文言例「前回セッションの終了確認中です」。起動時・ガレージ復帰時・新規走行開始操作時のいずれでも同一の待機表示、staleに達すると自動的に取得済み状態へ遷移する(UI操作不要)。**待機中は新規走行開始だけでなく、購入・売却/サルベージ・装備変更・在庫消費・セーブ初期化・実験ノート操作等、状態変更系の全入口を無効化する(4.5節P1、閲覧・設定操作は除く)**
- **pending結果(整合性エラー)**: 保留中結果画面(同6-D-1節)。「もう一度保存を試す」(`retryPendingApplication`)と「この記録を破棄する」(`abandonPendingApplication`、二段確認)の2操作
- **設定変更**: pending中も許可する(`pendingApplication`自体を書き換えない前提)
- **電池未装備時の走行開始ブロック**(1.3節の帰結): 「電池が未装備です」という導線で店・在庫画面へ誘導する
- **v16スキーマ破損時**: 通常のゲーム画面へは遷移させず、専用のエラー表示を出す(3.2節)

## 8. テスト一覧・変更ファイル一覧・実装担当

### 8.1 alice_mot3側新規テスト

**`destructionModes.test.ts`**: `createInitialDestructionState`が`batteryProfile`別に正しい判別unionを返すこと

**`destructionOrchestration.test.ts`**:
- `finalizeDestructionRun`が非空`terminalModeCandidates`以外を受理しないことの型テスト
- `finalizeDestructionRun`/`finalizeRun`/`deriveDegradationDiffs`を手構築`DestructionEvent[]`fixtureで動作確認。**P3-0のテスト対象は2.4節の範囲(D01collapse・D02burnout・D03/D04のbattery-consumed・D06toothLoss)に限定する**——D04のmagnet/body scorch・D05・D07・D09のseizureは、正式Q6裁定どおり、各実装ステップ(D04→P3-2、D05→P3-3、D07/D09→P3-4)で追加する(P3-0では追加しない)
- `restoreRunSnapshot`の全12ステップ(6.1節、`batteryVoltage`リテラル・`status`リテラル・`energyBreakdown`ネスト形も含む)を境界値でテスト
- `validateFireExposureProfile`の境界テスト
- `validateDestructionConfig`(6.3節)が判別union対応であること(nonLipo/nonBreakable時に不要フィールドを要求しないこと)、値域違反を`invalidFields`で報告すること

**`degradationApplication.test.ts`**: `computeCompositeGearDamageFraction`の境界値、各`applyXxxDiff`の単一diff加算

**`runOutcomeApplication.test.ts`(サブステップ2、pure関数単体で検証可能な範囲)**:
- `validateEquipmentLoadout`: 各roleのID不在・family不一致(battery以外の代表例、例: magnetItemIdがgearの個体を指す場合も検出)・bearing-gear不一致・`batteryItemId===null`の検出
- `captureEquipmentIdSnapshot`が生きたloadoutを変更しないこと(`finishAssembly`規約)
- `validateEquipmentIdSnapshot`: context不一致の検出に加え、vehicle文脈でgear/bearingがnull(unknown由来のcast入力)・motor文脈でgear/bearing/bodyが非null(unknown由来のcast入力)を拒否する負例テスト
- `applyRunOutcome`が返す`consumedEquipmentIds`にbattery消費(`role:'battery'`)が正しく記録されることのテスト(store action層でのloadout null化はサブステップ3で検証)
- `resolveBearingForGear`が対応するbearingを解決すること・対応がない場合`ok:false`を返すこと(ギヤ購入時のbearing自動生成自体はshopEconomy.ts側、サブステップ4以降)
- `bodyAssemblyId===null`で`{role:'body',kind:'scorch'}`が来た場合`missingEquipment`を返すこと
- `touchLeaseHeartbeat`所有権不一致でno-op(偽時計、4.3節)
- **`isLeaseHeartbeatStale`**(4.1節、Suu指摘#3で追加): 不正ISO文字列・nowが不正ISOの場合はstale、経過19999msはfresh、経過ちょうど`LEASE_STALE_THRESHOLD_MS`(20000ms)はstale、未来時刻(leaseHeartbeatAtがnowより後)は安全側でstale扱いになること
- **codexRecordsの生成元テスト**: `applyRunOutcome`が返す`result.newlyDiscoveredModes`が、非terminal(例: D01のみ発生、`manualAbort`/`finished`終了)の`RunOutcome`でも`outcome.events`から正しく算出されること(`outcome.terminalModes`を使わないことの確認、5.2節問題2の修正確認。実際の`codexRecords`配列構築はサブステップ3)
- **図鑑初回登録報酬テスト**(Suu指摘#1で追加): 新規発見1件で`PROVISIONAL_DISCOVERY_REWARD_G`分`cashG`が加算、新規発見複数件(D01+D09)で件数分加算、既発見のみ(`newlyDiscoveredModes`が空)では加算されない、冪等skip時は加算されない、`retryPendingApplication`で同一envelopeを再送しても既に適用済みなら冪等skipとなり二重付与されないこと
- **原子性テスト**: 複数diffのうち1つが`missingEquipment`相当の場合、preflightで検知され`inventory`が一切変化しないこと
- **runSequence判定テスト**: `<=lastApplied`が冪等skip、`>=nextRunSequence`が`invalidRunSequence`、中間の穴番号が通常適用されること
- **検証順序テスト**: rebindにより所有権を失ったタブが、既適用済みのrunSequenceを持つenvelopeを再送しても、冪等skipではなく`staleLease`が返ること(5.1節)
- `abandonPendingApplication`が`lastAppliedRunSequence`を進めないこと、放棄後の次runが正常適用されると高水位が放棄番号を飛び越えることのテスト
- ID prefix非衝突テスト、`createInitialPlayerInventoryAndLoadout`の決定性テスト、`cashG`が`INITIAL_CASH_G`(Suu指摘#5)を参照することのテスト
- **`beginRun`テスト**(4.4節): 多重開始拒否(`runInProgress`・`pendingApplicationExists`)、放棄・未完走のrunでも番号が再利用されないこと、reload後も`nextRunSequence`が維持されること、`leaseAcquired===false`で`leaseNotAcquired`を返すこと
- `rebindLeaseForPendingApplication`(3引数版、Suu指摘#2): leaseToken・leaseHeartbeatAtのみ更新しsaveId/runSequence等は不変であること、pendingApplicationが非nullならそのleaseTokenも同時に更新されること

**サブステップ3(brabit_mot3実装)へ持ち越す範囲**(所有境界の訂正、Suu指摘#4): 5.3節14ケースの`pendingApplication`/`currentRunSequence`のaction-level状態遷移、`codexRecords`が最大8件・`modeId`一意・追記のみであることの配列管理テスト、`performApplyRunOutcome`成功時に`inventory`/`equipmentLoadout`/`discoveredModes`/`codexRecords`/`notebook`/`saveMeta`が単一`set()`で同時反映されること・冪等skip時に一切追加されないことのテスト、`isLeaseHeartbeatStale`を用いたstale自動遷移(heartbeatタイマー5秒間隔の起動・停止含む)のテスト。

**`captureRunSnapshot`のdeep copyテスト**(6.1節、engine層・サブステップ1で実装済み): `CaptureRunSnapshotInput`の各フィールドを呼び出し後に変更しても、返された`RunSnapshot`の中身へ波及しないこと

### 8.2 brabit_mot3側テスト対象(参考掲載)

- lease3状態が混同されず表示されること、待機表示が起動時・ガレージ復帰時・新規走行開始時で共通に機能すること
- pending中は新規走行・購入・売却/サルベージ・装備変更・在庫消費・セーブ初期化がブロックされ、閲覧と設定操作のみ許可されること
- **lease未取得時に購入・装備変更等の書き込みactionが拒否されること**(4.5節P1、正式Fable必須修正)
- reload後もpendingApplicationが復元され同じ画面が再表示されること
- 放棄操作が二段確認を経ずに確定しないこと
- 電池未装備時の走行開始ブロック導線
- v16スキーマ破損時のエラー表示

### 8.3 変更が生じる既存ファイル一覧・実装担当

| ファイル | 変更内容 | 担当 |
|---|---|---|
| `src/materials/inventoryItem.ts` | `WearState.gear`拡張(破壊的変更)、`PlayerInventory`拡張、`RotorAssemblyState`等追加、`computeSalvageRate`内`resolveFraction`更新 | alice_mot3 |
| `src/materials/__tests__/inventoryItem.test.ts` | `{kind:'gear', toothDamageFraction}`形式の全fixtureを新形式へ | alice_mot3 |
| `src/store/shopEconomy.ts` | `freshWearState('gear')`戻り値変更(`totalToothCount`は`GEAR_TOTAL_TOOTH_COUNT`定数を参照、軽微条件1、リテラル`10`を書かない)、`buildPurchasedItem`のgear生成部分、`createInitialShopEconomyState`のgear fixture | alice_mot3 |
| `src/store/__tests__/shopEconomy.test.ts` | gear関連fixture更新 | alice_mot3 |
| `src/store/shopEconomyStore.ts` | 非永続fixtureから`saveStore`の`inventory`/`equipmentLoadout`スライス参照へ置き換え | brabit_mot3 |
| `src/store/gameStore.ts` | `v15:progress`のpersist呼び出しを廃止し進捗フィールドの読み書きを`saveStore`経由へ切替。**`finishAssembly`/`startTestRun`/`startCourseRun`へのcapture配線はP3-0では行わない(2.3節、正式Fable Q2裁定どおりP3-4冒頭の配線サブステップで行う)** | brabit_mot3 |
| `src/store/notebookStore.ts` | `v15:notebook`のpersist呼び出しを廃止、`sessions`の`pendingSession`確認フロー撤去(6.4節、正式Fable Q3裁定により撤去対象と確定) | brabit_mot3 |
| `src/components/ExperimentNotebook.tsx` | `pendingSession`/`confirmEviction`/`cancelEviction`関連UIの撤去(6.4節、正式Fable Q3裁定により撤去対象と確定) | brabit_mot3 |
| `src/store/saveStore.ts`(新規) | 統合永続store本体+既存store adapter/UI selector | brabit_mot3 |
| `src/store/runOutcomeApplication.ts`(新規) | 純粋ロジック(附録A.4+1節・5節) | alice_mot3 |
| `src/engine/destructionModes.ts`・`destructionOrchestration.ts`(新規) | 附録A.1・A.2 | alice_mot3 |
| `src/materials/degradationApplication.ts`(新規) | 附録A.3の適用関数群 | alice_mot3 |
| `src/retro/shop/formatMaterial.ts`(サブステップ1実装時に判明、計画未記載だった依存) | `wearFraction()`(52-61行)が`WearState.gear.toothDamageFraction`を直接参照するUI表示用の独立実装。新形式(`totalToothCount`/`toothLossCount`/`seizureFraction`、`GEAR_TOTAL_TOOTH_COUNT`参照)への追従が必要。`src/retro/`配下はbrabit_mot3所有領域のため本書はalice_mot3が触れない。**brabit_mot3により追従済みを確認**(2026-08-02T14:0x時点) | brabit_mot3 |
| `src/retro/shop/__tests__/formatMaterial.test.ts` | 上記に伴う追従。**brabit_mot3により追従済みを確認** | brabit_mot3 |

**実装担当の確定**: `saveStore.ts`本体+既存store adapter(`gameStore.ts`/`notebookStore.ts`/`shopEconomyStore.ts`の書き換え)+UI selector+`ExperimentNotebook.tsx`はbrabit_mot3が実装する(AGENTS.mdのマルチエージェント体制表における「UI/描画/音」の担当領域)。`src/store/runOutcomeApplication.ts`の純粋ロジック(型・validator・`applyRunOutcome`等)はalice_mot3が実装する。

**既存テストへの影響**: 目標は「既存844テストを、必要な契約更新後もすべて通過させる」であり、「既存テストファイルを一切変えない」ではない。上記表のファイル以外の既存テスト(engine/motorPhysics.test.ts等)には影響しない。

## 9. AGENTS.md/CLAUDE.md同期更新内容

現状、両ファイルは`cmp`で完全一致(差分ゼロ)を確認済み。P3-0のDoDとして、「次はPhase 2(素材システム...)」という記述を、「Phase 2(素材システム、**2026-07-24**人間試遊承認・完了、`git log`確認済みの実コミット日付)が完了し、Phase 3(破壊モード+図鑑)のP3-0(クロスレイヤ契約の型凍結ゲート、`docs/phase3-plan-v12.md`)に着手した」旨へ両ファイル同一内容で更新し、更新後も`cmp AGENTS.md CLAUDE.md`が差分ゼロであることを確認する。エンジン凍結方針・物理モデル・破壊モードとパラメータの対応・マルチエージェント体制等はP3-0で変更しない。

## 10. 実装順・各サブステップDoD

1. **サブステップ1(engine/materials型定義)**: 附録A.1(型のみ)・A.2(型+`createRunAccumulator`・`finalizeDestructionRun`・`finalizeRun`・`captureRunSnapshot`・`restoreRunSnapshot`・`validateDestructionConfig`・`validateFireExposureProfile`は完全実装。`deriveDegradationDiffs`は2.4節の範囲(D01/D02/D03/D04のbattery-consumed/D06のみ)に限定して実装し、連続量は正式Q6裁定どおりP3-2〜P3-4の各該当ステップで追加する)・A.3を実装する。スタブ・プレースホルダは置かない(P3-0範囲の関数はすべて完全実装、P3-1範囲—`advanceDestructionState`本体・wrapper本体—は一切作らない。2.4節の範囲外kindは「未実装」ではなく「まだ発生しえない入力」として扱う)。DoD: `npm run build`が通ること

   **依存閉包(実装時に判明、Suu_mot3判断・契約変更なし・Fable/人間再承認不要)**: `WearState.gear`の破壊的変更は単一tsconfigプロジェクトのため、サブステップ4所有と明記済みの`src/store/shopEconomy.ts`・`shopEconomy.test.ts`の型検査も同時に壊す。これらへの機械的追従(新3フィールドへの置換・`GEAR_TOTAL_TOOTH_COUNT`参照・`PlayerInventory`拡張フィールドの空配列追加。新しい較正値・挙動は追加しない)を、サブステップ1の`npm run build` DoDを満たすための依存閉包としてサブステップ1に含めて先行実施した(alice_mot3担当)。`src/retro/shop/formatMaterial.ts`(計画未記載だった依存、brabit_mot3所有領域のため上記閉包に含めず8.3節へ追記のみ)は別途brabit_mot3が追従する。
2. **サブステップ2(store純粋ロジック実装)**: 附録A.4+1節・4.4節・5節・6節の全関数(`beginRun`・`isLeaseHeartbeatStale`・`touchLeaseHeartbeat`含む)を実装する。**DoDの所有境界(Suu_mot3指摘、契約変更なしの所有境界訂正)**: 8.1節のうちpure関数単体で検証可能な項目——`validateEquipmentLoadout`/`validateEquipmentIdSnapshot`/`captureEquipmentIdSnapshot`/`resolveBearingForGear`/`createInitialPlayerInventoryAndLoadout`/`beginRun`/`applyRunOutcome`(検証順序・原子性・図鑑初回登録報酬・codexRecords生成元の算出元まで)/`retryPendingApplication`/`abandonPendingApplication`/`rebindLeaseForPendingApplication`/`touchLeaseHeartbeat`/`isLeaseHeartbeatStale`——のみがサブステップ2のDoDである。**5.3節14ケースのうち`currentRunSequence`/`pendingApplication`の実際の状態遷移、`performApplyRunOutcome`の単一`set()`、`codexRecords`/`notebook`配列管理(最大8件・modeId一意・trim)、heartbeatタイマー(5秒間隔)自体の起動・停止は、Zustandの`set()`とruntimeの`runtimeLeaseToken`管理を伴うためsaveStore action層でしか検証できず、サブステップ3のDoDとする(下記)。** DoD: 上記pure関数群について8.1節の対応テストがすべて通ること
3. **サブステップ3(store統合、brabit_mot3実装)**: `saveStore.ts`(3.1節の凍結仕様どおり)を実装する。`gameStore.ts`への変更は進捗の`saveStore`移管に限定する。**DoDには8.2節のテストに加え、5.3節14ケースのaction-level状態遷移(`currentRunSequence`/`pendingApplication`の実際の更新)・`performApplyRunOutcome`の単一`set()`(inventory/equipmentLoadout/discoveredModes/codexRecords/notebook/saveMetaの同時反映)・`codexRecords`配列管理(最大8件・modeId一意・追記のみ)・`isLeaseHeartbeatStale`を用いたstale自動遷移(4.2節の状態機械、heartbeatタイマー5秒間隔の起動・停止含む)を含める。** DoD: 8.2節のテストが通ること、既存`v15:progress`/`v15:notebook`からの移行(3.3節)が既存セーブデータで動作すること
4. **サブステップ4(既存ファイル更新)**: 8.3節の表に列挙した既存ファイルとその既存テストを更新する。DoD: 既存844テストが(必要な契約更新を反映した形で)すべて通ること
5. **サブステップ5(AGENTS.md/CLAUDE.md同期)**: 9節の更新を両ファイルへ反映。DoD: `cmp AGENTS.md CLAUDE.md`が差分ゼロ
6. **サブステップ6(全体DoD)**: `npm run test && npm run build && npm run lint`がすべて成功

各サブステップの完了ごとにgit diffを確認しながら進めるが、commit自体は本v7のSuu_mot3確認+11節Q1〜Q7の人間再承認後に行う(正式Fable個別レビュー完了だけでは実装・commitは解禁されない)。

## 11. Fable向け質問・裁定結果(完全版、正式Fable個別レビュー2026-08-02T13:12反映)

**Q1(裁定済み・承認、契約補完・人間再承認対象)**: `ApplyRunOutcomeError`へ`{kind:'invalidRunSequence'}`を追加する。判定規則: `runSequence >= nextRunSequence`の場合のみこのエラーとし、`runSequence <= lastAppliedRunSequence`は正常な冪等skip、その中間の放棄番号の「穴」はエラーとしない(5.3節)。Fable注記: 未適用のまま高水位に飛び越された番号が冪等skip側に落ちるのは既知の高水位意味論(v9/v10で受容済み)であり欠陥ではない。

**Q2(裁定済み: 案(c))**: `DestructionConfig`のproduction生成元・導入順(2.3節)。production配線自体をP3-4完了まで遅らせる。付帯: (i)P3-1〜P3-3はfixture統合テストで契約実証、(ii)人間試遊はP3-4になることが帰結、早期試遊が必要ならdev専用暫定configを人間PM承認で別途、(iii)P3-4計画では配線サブステップを最初に置く。

**Q3(裁定済み: 3点すべて承認)**: 実験ノートの原子的適用(6.4節・5.2節)。(i) `RunApplicationEnvelope`(v12 1.5節)へ`notebookRecord: PendingNotebookRecord`フィールドを追加する契約変更——承認、人間再承認リストへ。(ii) `VehicleTestRunNotebookRecord`新設+3腕判別union——承認、実コード確認に基づく適切な型設計と評価。(iii) 全腕自動trim(50件)への統一+既存確認UI撤去——承認(原子性が確認UXに優先)、既存UI仕様変更のため人間承認の最終判断事項。`codexRecords`はtrim対象外(6.4節に明記)。

**Q4a(裁定済み・承認、ゲームプレイ設計判断)**: battery消費(D03/D04)後、`EquipmentLoadout.batteryItemId`を自動でnull化し、プレイヤーに明示的な再装備を求める設計(1.3節)。人間承認の最終判断事項。

**Q4b(裁定済み・承認、契約追加・人間再承認対象)**: `AppliedRunResult`(v12 1.5節)へ`consumedEquipmentIds: readonly {role:EquipmentRole; id:string}[]`フィールドを追加する(1.3節・5.2節)。「現在のloadoutと一致する場合のみnull化」の規則も正しいと確認済み。

**Q5(裁定済み・承認、契約変更・人間再承認対象)**: `ValidateDestructionConfigResult`の戻り型へ`invalidFields`(値域違反の詳細)を追加する(6.3節)。純粋な改善として反対理由なしと裁定。

**Q6(裁定済み: 案(a)、段階実装の不変条件付き)**: `deriveDegradationDiffs`のP3-0実装範囲(2.4節)。P3-0では型・集約規則と2値/カウント差分(D01/D02/D03/D04のbattery-consumed/D06)のみを実装し、連続量`deltaFraction`の換算は各モードの実装ステップで追加する。段階実装の不変条件「`advanceDestructionState`は差分換算が実装済みのモードのイベントしか発行してはならない」を確定(2.4節)。各モードの実装ステップDoDに「そのステップで発行可能になった全モードについて、対応する差分換算が同一ステップ内に存在することのテスト」を含めること。

**Q7(正式Fable必須修正P2、遡及申告・承認済み、契約変更・人間再承認対象)**: `RotorAssemblyState.sourceWireMaterialId: WireMaterialId | null`+`consumedWireM`(附録A.3)は、v12が継承したv8 1.2節の`sourceWireItemId: string | null`からの契約変更である。この変更自体は本計画v6提出以前(v9レビュー)に既に行われていたが、「Q1〜Q6のみが真の契約追加」という申告(旧12節)から漏れていた。Fable裁定: **変更自体は承認する**(線材はstackable在庫であり個体itemIdを持たないため、v8の`sourceWireItemId`はそもそも実装不能だった。`materialId`+消費量記録はPhase4巻線記録方式への正しい最小前駆)。手続き要求として、Q7を遡及追加し人間再承認の対象に含めることで、無申告の契約変更を通す前例を作らないこととする。

## 12. v12のR1通過状態記録とv7の契約上の位置づけ

`docs/phase3-plan-v12.md`は2026-08-02T07:39にSuu_mot3の最終照合を通過し、P3-0 R1ゲートを完了した状態にある。**`docs/phase3-plan-v12.md`自体は本書のいかなる版でも物理的に編集していない**(附録A冒頭で確認済み)。

一方、**本書(v7)は11節Q1〜Q7として、正式Fable裁定を経た契約の追加・変更(`ApplyRunOutcomeError`・`RunApplicationEnvelope`・`AppliedRunResult`・`ValidateDestructionConfigResult`・`RotorAssemblyState`等)を明示的に含む**——これらは附録A・1節〜6節の型定義に既に実体化されている(v12が意図的に未凍結のまま残した部分の具体化とは別に、Q1〜Q7という新規の契約追加・変更として区別する)。**本v7は人間再承認後に初めてP3-0の実装契約として効力を持つ。** 正式Fable個別レビュー(2026-08-02T13:12)の総合判定は条件付き承認であり、本v7へのSuu_mot3確認、およびQ1〜Q7の人間再承認をもって実装着手(サブステップ1)が解禁される(正式Fable個別レビュー完了だけでは実装は解禁されない)。

## 13. 検証手法

```
git diff --no-index --check /dev/null docs/phase3-p3-0-plan.md
```
(exit=1は`/dev/null`との差分検出そのものによる正常な挙動であり、空白警告メッセージの有無で判定する。念のため`git add`による一時ステージ方式でも二重確認する。)

## 14. 次の手順

正式Fable個別レビュー(2026-08-02T13:12)の条件付き承認・プロジェクトリードのQ1〜Q7再承認(2026-08-02T13:26)を経て、サブステップ1(engine/materials型定義、依存閉包含む)を実装・Suu_mot3が独立確認のうえ通過と判定(2026-08-02T14:12)。続けてサブステップ2(`src/store/runOutcomeApplication.ts`の純粋ロジック+8.1節対応テスト)を実装し、Suu_mot3レビューの必須修正6点(図鑑初回登録報酬未結線・rebindシグネチャ不一致・lease stale判定欠落・DoD所有境界・cashG単一出典・validator負例不足)を反映済み。**npm run test(968/968)・build・lint成功、git diff --check問題なし。** Suu_mot3の最終確認完了後、サブステップ3(`saveStore.ts`、brabit_mot3実装)へ進む。**Suu_mot3確認が済むまでサブステップ3・commit・pushは行わない。**

**軽微条件4(記録、次回実装レビュー提出物への追加事項)**: M1対応で改訂されたUI計画v5(`docs/phase3-ui-autopsy-plan-v5.md` 6-D-0節)は、正式Fableレビューの時点で未達だった(裁定自体は本計画7節の記述から内容を特定できたため保留されていない)。**実装レビュー時には、改訂版UI v5の該当節を提出物へ含めること。**

## 15. 改訂履歴

- v1(2026-08-02T07:5x提出): 初版
- v2(2026-08-02T10:3x提出): Suu_mot3要修正10点対応
- v3(2026-08-02T11:5x提出): Suu_mot3必須修正8点対応
- v4(2026-08-02T12:0x提出): Suu_mot3必須修正7点対応(自己完結化、EquipmentLoadout.batteryItemId nullable化、実験ノート・図鑑記録の原子的適用への追加、lease所有権guard、DestructionConfig production配線のP3-1移動、Fable質問Q1〜Q3の整理)
- v5(2026-08-02T12:3x提出): Suu_mot3最終照合(2026-08-02T12:12)の必須修正8点対応。附録A(P3-0契約付録)の新設による完全自己完結化、codexRecords生成元をoutcome.terminalModesからresult.newlyDiscoveredModesへ訂正(非終端モードの図鑑欠落を修正)、notebookRecordの型設計訂正(既存CourseRunNotebookRecordのtrackId必須制約とtest-runの非互換を実コード確認で発見、VehicleTestRunNotebookRecord新設をQ3化)、既存sessions evict規則の事実誤認訂正(ボタン確認フローが実際の挙動、実コード確認済み)、battery null化をconsumedEquipmentIds経由の汎用機構へ変更(Q4b追加)、v16 hydrationをzustand実体(wrapper→state→schemaVersion→全slice)に即した検証順へ訂正、節番号参照の誤りを修正、apply/retry表へleaseNotAcquired行を追加し全14ケースへ拡充、検証順序を「saveId→lease→runSequence→preflight→適用」に固定しstaleLease優先を明記、lease既知限界(2タブ同時rebind)の復元、restoreRunSnapshotの検証をliteral/boolean/nested形状まで拡張、Q5を必須裁定化。
- v6(2026-08-02T13:0x提出): Suu_mot3最終追補(2026-08-02T12:51)の必須修正4点対応。(1) runSequence発行action`beginRun`(4.4節)を新設——run開始時に番号を予約し`nextRunSequence`を即時永続化する処理が全文から欠落しており実装不能だった欠陥を修正。(2) `deriveDegradationDiffs`のP3-0実装範囲を2値/カウント差分(D01/D02/D03/D04のbattery-consumed/D06)に限定し(2.4節)、連続量`deltaFraction`換算(D04のscorch・D05・D07・D09のseizure)をQ6としてFable裁定へ分離(較正定数が未確定のまま「完全実装」を謳っていた矛盾を解消)。(3) `captureRunSnapshot`へ`CaptureRunSnapshotInput`型を新設し完全なシグネチャを確定、deep copy・contractVersion自動付与の境界を明記。(4) `leaseNotAcquired`の判定責務をpure関数からstore action層(事前ゲート)へ明確に分離し(5.1節、二層検証順序)、`retryPendingApplication`の呼び出し前提(`pendingApplication!==null`)を明記。Suu_mot3最終照合通過、正式Fable個別レビューへ提出。
- v7(2026-08-02T13:3x提出): 正式Fable個別レビュー(2026-08-02T13:12、Suu_mot3経由中継)の条件付き承認(必須修正2点+軽微条件4点+Q1〜Q6全裁定)を反映。**必須修正**: P1(4.5節新設——閲覧を除く全`saveStore`書き込みactionをlease取得済み共通ゲート化。従来はrun適用・heartbeat・`beginRun`のみゲートされ、購入・装備変更等の書き込みactionにlease未取得タブの穴が残っていた)、P2(Q7として`RotorAssemblyState.sourceWireMaterialId`+`consumedWireM`——v8 1.2節の`sourceWireItemId`からの契約変更——を遡及申告、12節を「Q1〜Q7」へ訂正)。**Q1〜Q6の裁定を本文へ反映**(Q1: 高水位skipの既知意味論注記/Q2: 案(c)productionをP3-4まで延期・帰結明示/Q3: 3点すべて承認・codexRecordsはtrim対象外/Q4a: 承認/Q4b: 承認/Q5: 承認/Q6: 案(a)・段階実装の不変条件を確定)。**軽微条件4点**: (1) `GEAR_TOTAL_TOOTH_COUNT`単一定数化、リテラル散在を排除。(2) 背面タブthrottlingによるlease喪失を意図仕様として4.1節へ明記。(3) 同一セッション放棄時、`abandonPendingApplication`の同一setで`currentRunSequence`もnull化。(4) 改訂UI v5提出物への追加を14節へ記録。人間再承認前・実装未解禁を状態欄に明記。人間がQ1〜Q7を再承認しサブステップ1着手を解禁(2026-08-02T13:26)。
- v7実装時追補(2026-08-02T14:0x): サブステップ1実装中に発覚した依存閉包(単一tsconfigプロジェクトのため`WearState.gear`破壊的変更が`shopEconomy.ts`/`shopEconomy.test.ts`(サブステップ4所有)・`formatMaterial.ts`(計画未記載の新規発見、brabit所有)の型検査を壊す)についてSuu_mot3が案(a)を所有境界つきで採用(契約変更ではないためFable/人間再承認不要)。8.3節へ`formatMaterial.ts`を追記、10節サブステップ1へ依存閉包の実施内容を記録。サブステップ1をSuu_mot3が独立確認のうえ通過と判定(2026-08-02T14:12)。
- v7実装時追補2(本書、2026-08-02T14:5x): サブステップ2初回実装へのSuu_mot3レビュー(必須修正6点)を反映。(1) 図鑑初回登録報酬が未結線だった欠陥を修正——`PROVISIONAL_DISCOVERY_REWARD_G`(専用の新規provisional定数、既存経済定数の意味を偽って流用しない)を新設し、`rewardsGrantedG = 定数×newlyDiscoveredModes.length`を`nextInventory.cashG`へ原子的に加算する機構を実装(附録A.4・5.2節)。(2) `rebindLeaseForPendingApplication`の2引数版(附録A.4)を、依存閉包として実装済みの3引数版(`now`追加、契約意味は不変)へ同期。(3) lease stale判定の実行可能な形が欠落していた欠陥を修正——`isLeaseHeartbeatStale`+`LEASE_STALE_THRESHOLD_MS`(20000)を新設(依存閉包、附録A.4)。(4) 10節サブステップ2/3のDoDを、pure関数単体で検証可能な範囲(サブステップ2)とaction-level状態遷移・単一`set()`・配列管理(サブステップ3)へ明示的に分割、8.1節のテスト一覧もこの境界へ同期。(5) `createInitialPlayerInventoryAndLoadout`の`cashG`リテラルを`INITIAL_CASH_G`参照へ統一。(6) validator負例テスト(`validateEquipmentIdSnapshot`のcontext別null性負例、`validateEquipmentLoadout`のbattery以外のfamily不一致代表例)を追加。バージョン番号は据え置き(v7の実装時addendum2)。
