// spec docs/spec.md §4.10・§8.2: コース区間と完走・コースアウト判定。
// spec §8.2ディレクトリ構成コメントで本ファイルの責務として明記されている。
// 「条件セット判定」(Objective関連)はscoring.tsが担当する(責務分離、
// spec §8.2コメントどおり)。
//
// scoring.tsとの循環参照はimport typeのみで構成する(型のみのためコンパイル時に
// 消去され、実行時の循環importにはならない)。
import type { MotorConfig } from './motorPhysics';
import { stepVehicle, type CarConfig, type VehicleSimState } from './vehiclePhysics';
import type { Objective } from './scoring';
import { BATTERY_CAPACITY_J_1_5V, BATTERY_CAPACITY_J_3_0V } from './constants';

type Rng = () => number;

// spec §4.10のまま
export interface TrackSegment {
  lengthM: number;
  slopeDeg: number;
  curveRadiusM?: number; // 省略時は直線
  surfaceGrip: number; // 0–1
  roughness: number; // 0–1
}

export interface NumericRange {
  min: number;
  max: number;
}

export interface BuildRestrictions {
  lockedMotorParams: Partial<MotorConfig>;
  lockedCarParams: Partial<CarConfig>;
  motorParamRanges: Partial<Record<keyof MotorConfig, NumericRange>>;
  carParamRanges: Partial<Record<keyof CarConfig, NumericRange>>;
  allowedPartPresetIds: string[];
  maxBatteryVoltage: 1.5 | 3.0;
}

export interface TrackDefinition {
  id: string;
  name: string;
  description: string;
  segments: TrackSegment[];
  objectives: Objective[];
  exObjectives?: Objective[];
  restrictions?: Partial<BuildRestrictions>;
  allowReverse?: boolean; // 坂での後退を許すか。省略時false
  // 【本計画での追加提案】trueの場合のみ§4.8のエネルギー予算停止を適用する
  // (「省エネコース」を表すフラグ)。省略時false=「通常コースでは電圧低下・
  // 予算停止を省略」(§4.8)。実際の予算J数はmotorConfig.batteryVoltageから
  // 実行時に導出する(電池電圧はガレージで選ぶ値であり、コース定義時点では
  // 決まらないため、TrackDefinition側にJ数そのものは持たせない)。
  hasEnergyBudget?: boolean;
}

export interface ResolvedSegment {
  segment: TrackSegment;
  index: number;
  segmentStartM: number; // このセグメントの開始位置(コース先頭からの距離)
}

// 区間特定(純関数)。全区間を例外なく半開区間
// [segmentStartM_i, segmentStartM_i+lengthM_i)として扱う。positionMが全区間長の
// 合計以上なら(ちょうど一致する場合を含め)常にnullを返す(完走)。
// positionM<0は区間0(先頭区間)を返す(起点より手前の地形はデータとして
// 定義しないため、区間0の条件がそのまま手前側にも延長されているとみなす単純化)。
// track.segments.length===0の場合はpositionMの値によらず常にnullを返す
// (空配列に対するsegments[0]アクセスを避ける防御)。
export function resolveSegmentAt(track: TrackDefinition, positionM: number): ResolvedSegment | null {
  if (track.segments.length === 0) return null;
  if (positionM < 0) {
    return { segment: track.segments[0], index: 0, segmentStartM: 0 };
  }
  let cursor = 0;
  for (let index = 0; index < track.segments.length; index++) {
    const segment = track.segments[index];
    const lengthM = Math.max(segment.lengthM, 0); // 負のlengthMを防御(1.6節のvalidateTrackDefinitionが正規の契約)
    if (positionM < cursor + lengthM) {
      return { segment, index, segmentStartM: cursor };
    }
    cursor += lengthM;
  }
  return null; // 全区間長以上(ちょうど一致する場合を含め)は完走
}

// 重力位置エネルギー計算(純関数)。track.segmentsを先頭から累積し、各区間内の
// 変位分だけsin(slopeRad)を積算する。区分的に連続な区分線形関数として構成される
// ため、区間境界で不連続にならない。positionM<0は区間0の勾配で、positionMが
// 全区間長を超える場合は最終区間の勾配で外挿する。空segmentsは0を返す(防御)。
export function computeElevationAt(track: TrackDefinition, positionM: number): number {
  if (track.segments.length === 0) return 0;
  const firstSlopeRad = (track.segments[0].slopeDeg * Math.PI) / 180;
  if (positionM <= 0) return positionM * Math.sin(firstSlopeRad);

  let elevation = 0;
  let cursor = 0;
  for (const segment of track.segments) {
    const slopeRad = (segment.slopeDeg * Math.PI) / 180;
    const lengthM = Math.max(segment.lengthM, 0);
    const withinM = Math.min(Math.max(positionM - cursor, 0), lengthM);
    elevation += withinM * Math.sin(slopeRad);
    cursor += lengthM;
    if (positionM <= cursor) return elevation;
  }
  const lastSlopeRad = (track.segments[track.segments.length - 1].slopeDeg * Math.PI) / 180;
  return elevation + (positionM - cursor) * Math.sin(lastSlopeRad);
}

export interface TrackValidationIssue {
  segmentIndex?: number; // 'segments'自体の問題(空配列)はundefined
  field?: 'lengthM' | 'slopeDeg' | 'surfaceGrip' | 'roughness' | 'curveRadiusM';
  reason: 'emptySegments' | 'nonPositiveLength' | 'outOfRange' | 'nonPositiveCurveRadius' | 'nonFinite';
}

// データ契約(純関数)。1.7節のcreateValidatedTrackから呼ばれる(唯一の正規の入口)。
// Suu側のdata/tracks.ts定義時・ユニットテストでも直接呼べる。
export function validateTrackDefinition(track: TrackDefinition): TrackValidationIssue[] {
  const issues: TrackValidationIssue[] = [];
  if (track.segments.length === 0) {
    issues.push({ reason: 'emptySegments' });
    return issues;
  }
  track.segments.forEach((segment, segmentIndex) => {
    // NaNは`<=`等の比較演算がすべてfalseになるため、下の個別チェックだけでは
    // 検出できない(例: `NaN <= 0`はfalse)。Number.isFiniteで独立に検出する。
    const numericFields: Array<['lengthM' | 'slopeDeg' | 'surfaceGrip' | 'roughness' | 'curveRadiusM', number | undefined]> = [
      ['lengthM', segment.lengthM],
      ['slopeDeg', segment.slopeDeg],
      ['surfaceGrip', segment.surfaceGrip],
      ['roughness', segment.roughness],
      ['curveRadiusM', segment.curveRadiusM],
    ];
    for (const [field, value] of numericFields) {
      if (value !== undefined && !Number.isFinite(value)) {
        issues.push({ segmentIndex, field, reason: 'nonFinite' });
      }
    }
    if (segment.lengthM <= 0) issues.push({ segmentIndex, field: 'lengthM', reason: 'nonPositiveLength' });
    if (segment.surfaceGrip < 0 || segment.surfaceGrip > 1) issues.push({ segmentIndex, field: 'surfaceGrip', reason: 'outOfRange' });
    if (segment.roughness < 0 || segment.roughness > 1) issues.push({ segmentIndex, field: 'roughness', reason: 'outOfRange' });
    if (segment.curveRadiusM !== undefined && segment.curveRadiusM <= 0) {
      issues.push({ segmentIndex, field: 'curveRadiusM', reason: 'nonPositiveCurveRadius' });
    }
  });
  return issues;
}

declare const validatedTrackBrand: unique symbol;
export type ValidatedTrackDefinition = TrackDefinition & { readonly [validatedTrackBrand]: true };

// fail-fast契約(指摘5・追補): stepTrackRunは生のTrackDefinitionを受け付けず、
// ValidatedTrackDefinitionのみを受け付ける(1.4節)。これにより「検証を経ずに
// 不正なtrackをstepTrackRunへ渡す」という経路自体を型で塞ぎ、毎フレームの
// 再検証コストもかけない。唯一の正規の生成経路。
export function createValidatedTrack(track: TrackDefinition): ValidatedTrackDefinition {
  const issues = validateTrackDefinition(track);
  if (issues.length > 0) {
    throw new RangeError(`Invalid TrackDefinition: ${JSON.stringify(issues)}`);
  }
  return track as ValidatedTrackDefinition;
}

function computeEnergyBudgetJ(motorConfig: MotorConfig): number {
  return motorConfig.batteryVoltage === 1.5 ? BATTERY_CAPACITY_J_1_5V : BATTERY_CAPACITY_J_3_0V;
}

// トラック駆動の1フレーム更新。stepVehicle(1区間・平坦専用のPhase2 API)の
// 上位に立ち、複数区間のTrackDefinitionを扱う。stepTestRun/evaluateCourseCompletion
// (Phase2、flat 10m直線のMVP専用)は無変更で維持し、本関数はそれとは独立な
// 複数区間対応の新規上位APIとする。
export function stepTrackRun(
  motorConfig: MotorConfig,
  carConfig: CarConfig,
  track: ValidatedTrackDefinition,
  state: VehicleSimState,
  dt: number,
  rng: Rng = Math.random,
): VehicleSimState {
  // 終端状態の安定性: stepVehicle自身も同じ早期returnパターンを持つが、
  // トラック層でも二重に安定させる
  if (state.status === 'finished' || state.status === 'stalled' || state.status === 'derailed' || state.status === 'overheated') {
    return state;
  }

  // フレーム開始位置の区間を特定する(物理入力の決定に使う。積分はフレーム
  // 開始状態から行う既存の規約どおり)
  const resolved = resolveSegmentAt(track, state.positionM);
  if (resolved === null) {
    return { ...state, status: 'finished' };
  }
  const { segment } = resolved;
  const slopeRad = (segment.slopeDeg * Math.PI) / 180;

  // エネルギー予算超過の判定(§4.8)。判定は前フレーム終了時点のenergyUsedJを
  // 使うため、判定が真になった次のフレームからforcePowerOffが効く(1フレーム分の
  // 超過を許容する、STALL_DETECTION_TIME_S等と同じ設計慣習)。
  const forcePowerOff = track.hasEnergyBudget === true && state.energyUsedJ >= computeEnergyBudgetJ(motorConfig);

  const result = stepVehicle(motorConfig, carConfig, state, dt, rng, slopeRad, {
    surfaceGrip: segment.surfaceGrip,
    curveRadiusM: segment.curveRadiusM,
    roughness: segment.roughness,
    allowReverse: track.allowReverse ?? false,
    forcePowerOff,
  });

  // フレーム終了時点の新しいpositionMから区間を再解決し、trackSegmentIndexへ
  // 反映する(フレーム開始時点の区間ではなく、フレーム終了時点の区間を報告する。
  // 区間境界をまたいだフレームでも1フレーム遅れなく正しい区間を報告できる)
  const resolvedAfter = resolveSegmentAt(track, result.positionM);
  if (resolvedAfter === null) {
    return { ...result, status: 'finished' };
  }

  // forcePowerOffが実際に有効だったフレームでのみfailureCodeを上書きする
  // (track.hasEnergyBudgetが真でも、forcePowerOffがfalseだった通常の失速は
  // 上書きしない=通常どおり'failureToStart'のまま)
  const failureCode = forcePowerOff && result.status === 'stalled' ? 'energyExhausted' : result.failureCode;

  return { ...result, trackSegmentIndex: resolvedAfter.index, failureCode };
}
