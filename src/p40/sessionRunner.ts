// Phase 4 P4-0 G3(docs/phase4-p4-0-plan.md v3 §4.2・§7・§8、arbiter条件P4-C2/P4-C3):
// **セッション限定のstore-free runner**。
//
// **何であって、何でないか**: 既存engine/materialsの公開純関数を**並べるだけ**のオーケストレーション
// であり、物理式・乱数器・破壊判定を一切複製しない。Phase 3のproduction入口
// (`beginProductionRun`/`startCourseRun`/破壊wrapper/`performApplyRunOutcome`)は**呼ばない**——
// したがってinventory・WearState・図鑑・報酬・実験ノート・runSequence・courseProgressは
// 変化しようがなく、A3原子境界へ「保存しない分岐」を足す必要もない(§4.2)。
//
// **P4-C2(RNG既定値の明示排除)**: `stepTrackRun`のRNG既定引数(`Math.random`)経路は使わない。
// 本ファイルの`stepPhase4Track`だけがRNGを**必須引数**として受け取り`stepTrackRun`を呼ぶ。
// P4-0の他ファイルは`stepTrackRun`を直接呼ばず`Math.random`も使わない
// (`__tests__/boundaryAudit.test.ts`が機械的に固定する)。
//
// **P4-C3(ratio≠1 configの隔離)**: 本ファイルは`computeRecipeKey`・`encodeRecipe`・
// `validateMaterialComposedBase`・`beginProductionRun`・`performApplyRunOutcome`を
// importも呼出しもしない。P4-0の`effectiveTurnsRatio≠1`なMotorConfigが、`materialComposedBase`
// 契約(base=`undefined | 1`)を持つproduction保存経路へ流れ込む口を構造的に作らないため。

import type { MotorConfig } from '../engine/motorPhysics';
import type { CarConfig, VehicleSimState } from '../engine/vehiclePhysics';
import { createInitialVehicleState } from '../engine/vehiclePhysics';
import { stepTrackRun, type ValidatedTrackDefinition } from '../engine/trackPhysics';
import { createRunRng } from '../engine/destructionOrchestration';
import { COIL_DEFORM_OMEGA } from '../engine/constants';
import { aggregateWindingRecord, resolveWindingRunnability, type P4WindingAggregate, type WindingRecord } from '../materials/windingRecord';

/** 物理タイムステップ。既存と同一の固定値(spec §2、engine凍結方針)。 */
export const PHASE4_DT_S = 1 / 120;

/** trace採取間隔(§8「0.05秒間隔」)。 */
export const PHASE4_TRACE_INTERVAL_S = 0.05;

/**
 * 1走行の最大step数。**候補不成立を検出するための打ち切り**であり、ゲーム内の制限時間ではない。
 * §8の「最大32秒記録」に合わせて32秒相当とする(32 × 120 = 3840)。超過した候補は
 * 「20〜30秒で終わらない」ため有限候補表から落ちる(§7.3)。
 */
export const PHASE4_MAX_STEPS = 3840;

/** 走行の終端status。engineの既存終端をそのまま使い、P4-0で新しい終端を作らない。 */
const TERMINAL_STATUSES: readonly VehicleSimState['status'][] = ['finished', 'stalled', 'derailed', 'overheated'];

/**
 * RNGを**必須引数**とする唯一のstep wrapper(P4-C2)。
 *
 * `stepTrackRun`のRNG引数は既定値`Math.random`を持つため、渡し忘れると**seedを固定したのに
 * 再現しない**という静かな不整合が起きる。本wrapperを通す限りその状態を構築できない。
 */
export function stepPhase4Track(
  motorConfig: MotorConfig,
  carConfig: CarConfig,
  track: ValidatedTrackDefinition,
  state: VehicleSimState,
  dt: number,
  rng: () => number,
): VehicleSimState {
  // P4-1C R2-A(2026-08-31人間再承認): `stepTrackRun`のoptionsがrequiredになったための
  // 機械的追随。P4-0はD01閾値を動かさないため、`constants.ts`の`COIL_DEFORM_OMEGA`
  // (単一出典)をそのまま渡す——P4-0の決定論(固定record hash・trace一致)は不変である。
  return stepTrackRun(motorConfig, carConfig, track, state, dt, { coilDeformOmegaRadS: COIL_DEFORM_OMEGA, rng });
}

/** trace 1点(§8: 既存`TestRunSample`相当の項目に限定し、新しい計測量を作らない)。 */
export interface Phase4TraceSample {
  readonly t: number;
  readonly positionM: number;
  readonly velocityMps: number;
  readonly rpm: number;
  readonly currentA: number;
}

export interface Phase4RunResult {
  readonly steps: number;
  readonly elapsedTimeS: number;
  readonly status: VehicleSimState['status'];
  /** 打ち切り(`PHASE4_MAX_STEPS`到達)で終わったか。候補選定で落とすための事実。 */
  readonly truncated: boolean;
  readonly finishTimeS: number | null;
  readonly positionM: number;
  /**
   * V2由来のコイル崩壊(`motorPhysics`が`varnished=false`×高回転で立てる不可逆フラグ)が
   * 起きたか。**破壊wrapperを使わないP4-0でも、この1つだけは物理側に存在する**ため、
   * 「意図しない発火0」を主張するには実測して示す必要がある(§7.3)。
   */
  readonly coilCollapsed: boolean;
  /** 走行中に短絡(`slitWidthMm<=0`)が観測されたか。V2由来の`shortCircuit`相当。 */
  readonly shorted: boolean;
  readonly trace: readonly Phase4TraceSample[];
  readonly motorConfig: MotorConfig;
  readonly aggregate: P4WindingAggregate;
}

export type Phase4RunOutcome =
  | { readonly ok: true; readonly run: Phase4RunResult }
  | { readonly ok: false; readonly reason: string };

export interface Phase4RunInput {
  readonly record: WindingRecord;
  /** 巻線以外は player/rival で共通の固定構成(§7.1)。 */
  readonly baseMotorConfig: MotorConfig;
  readonly carConfig: CarConfig;
  readonly track: ValidatedTrackDefinition;
  readonly seed: number;
  /** `balanceErrorRatio`→`axisOffsetMm`の係数。G3で確定するまで呼出し側が明示する(§6.3)。 */
  readonly axisOffsetCoefficientMm: number;
  readonly maxSteps?: number;
}

/**
 * 巻線記録から実効`MotorConfig`を組み立てる(§6の最小2軸のみ)。
 *
 * - `coilTurns`は**実在量**(記録長)。逆巻きでも導線は存在するのでR_coil・Jは減らさない
 * - `effectiveTurnsRatio`は**磁気のみ**の打ち消し
 * - `axisOffsetMm`は左右バランス由来。**base側の`axisOffsetMm`は上書きする**——P4-0では
 *   軸ずれの出典を巻線記録1つに限り、固定構成側と二重入力にしない(P3-1-Q9の単一出典)
 *
 * `position`/`tension`は使わない(P4-0では物理へ接続しない、§6.4)。
 */
export function composePhase4MotorConfig(
  baseMotorConfig: MotorConfig,
  record: WindingRecord,
  axisOffsetCoefficientMm: number,
): { motorConfig: MotorConfig; aggregate: P4WindingAggregate } {
  const aggregate = aggregateWindingRecord(record, { axisOffsetCoefficientMm });
  return {
    motorConfig: {
      ...baseMotorConfig,
      coilTurns: aggregate.coilTurns,
      effectiveTurnsRatio: aggregate.effectiveTurnsRatio,
      axisOffsetMm: aggregate.axisOffsetMm,
    },
    aggregate,
  };
}

/**
 * 1台分の走行(store-free)。
 *
 * **走行拒否**: 記録が既存`coilTurns`受理範囲(10〜150)を外れる場合、**engineへ入る前に**
 * `ok:false`で返す。黙ってclampしない(§6.2、P4-C1)。
 *
 * **終端**: `state.status`が`finished/stalled/derailed/overheated`のいずれかになった時点で閉じる
 * (破壊wrapperを使わないため終端判定はrunnerが持つ、§4.2)。`maxSteps`超過は`truncated:true`
 * として**事実のまま返す**——候補表から落とす判断は呼出し側が行う。
 */
export function runPhase4Vehicle(input: Phase4RunInput): Phase4RunOutcome {
  const runnability = resolveWindingRunnability(input.record);
  if (!runnability.runnable) return { ok: false, reason: runnability.reason };

  const { motorConfig, aggregate } = composePhase4MotorConfig(input.baseMotorConfig, input.record, input.axisOffsetCoefficientMm);
  const rng = createRunRng(input.seed);
  const maxSteps = input.maxSteps ?? PHASE4_MAX_STEPS;

  let state = createInitialVehicleState(motorConfig, input.carConfig);
  const trace: Phase4TraceSample[] = [];
  let sampleAccumulatorS = 0;
  let steps = 0;
  let finishTimeS: number | null = null;
  let shorted = false;

  for (let i = 0; i < maxSteps; i++) {
    const next = stepPhase4Track(motorConfig, input.carConfig, input.track, state, PHASE4_DT_S, rng);
    steps = i + 1;
    sampleAccumulatorS += PHASE4_DT_S;
    if (sampleAccumulatorS >= PHASE4_TRACE_INTERVAL_S) {
      sampleAccumulatorS -= PHASE4_TRACE_INTERVAL_S;
      trace.push({
        t: next.elapsedTimeS,
        positionM: next.positionM,
        velocityMps: next.velocityMps,
        rpm: next.motor.rpm,
        currentA: next.motor.current,
      });
    }
    if (next.motor.shorted) shorted = true;
    state = next;
    if (TERMINAL_STATUSES.includes(state.status)) {
      if (state.status === 'finished') finishTimeS = state.elapsedTimeS;
      break;
    }
  }

  const truncated = !TERMINAL_STATUSES.includes(state.status);
  return {
    ok: true,
    run: {
      steps,
      elapsedTimeS: state.elapsedTimeS,
      status: state.status,
      truncated,
      finishTimeS,
      positionM: state.positionM,
      coilCollapsed: state.motor.coilCollapsed,
      shorted,
      trace,
      motorConfig,
      aggregate,
    },
  };
}

/** ゴール線の通過事実。完走した走行だけが持つ。 */
export interface Phase4FinishInfo {
  readonly finishTimeS: number;
  readonly finishPositionM: number;
}

/**
 * 4区間(各2.5 m)の通過時刻(§8)。未到達の区間は`null`——到達したように見せない。
 *
 * **traceに現れない境界は`finish`から埋める**: traceは0.05秒間隔の標本なので、最終標本の
 * 直後にゴールする走行ではゴール線(=コース全長)に一致する境界がtraceへ現れず、完走したのに
 * 第4区間がnullになる。ここで使う`finishTimeS`は**終端stepの正典値そのもの**であり、
 * 補間や推定ではない。
 *
 * traceに無い境界は定義上「最終標本より先」なので、実際に埋まるのはゴール直前の
 * 0.05秒未満に通過した境界だけ——通常はゴール線1つである。仮に中間境界まで
 * 埋まる走行が現れた場合、複数の区間が同一時刻になって**単調増加が崩れる**ため、
 * `sessionRunner.test.ts`の単調増加テストがそれを検出する(黙って通さない)。
 */
export function resolveSectionTimes(
  trace: readonly Phase4TraceSample[],
  sectionBoundariesM: readonly number[],
  finish?: Phase4FinishInfo,
): readonly (number | null)[] {
  return sectionBoundariesM.map((boundary) => {
    const hit = trace.find((sample) => sample.positionM >= boundary);
    if (hit !== undefined) return hit.t;
    if (finish !== undefined && finish.finishPositionM >= boundary) return finish.finishTimeS;
    return null;
  });
}

/** 完走した走行から`Phase4FinishInfo`を取り出す。未完走なら`undefined`。 */
export function resolveFinishInfo(run: Phase4RunResult): Phase4FinishInfo | undefined {
  if (run.finishTimeS === null) return undefined;
  return { finishTimeS: run.finishTimeS, finishPositionM: run.positionM };
}
