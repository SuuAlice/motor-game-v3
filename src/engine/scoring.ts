// trackPhysics.tsとの循環参照はimport typeのみで構成する(型のみのため
// コンパイル時に消去され、実行時の循環importにはならない)。TrackDefinition
// (trackPhysics.ts)がObjective(本ファイル)を参照し、本ファイルのcomplianceの
// 判定がBuildRestrictions/NumericRange(trackPhysics.ts)を参照するための双方向。
import type { BuildRestrictions } from './trackPhysics';
import type { CarConfig } from './vehiclePhysics';
import type { MotorConfig } from './motorPhysics';
import type { VehicleSimState } from './vehiclePhysics';

// spec docs/spec.md §3.6: 調整チャレンジの☆評価。config/simStateそのものではなく、
// 時系列サンプル列(store.historyと同じ形)を受け取って判定する純関数。
export interface HistorySample {
  t: number; // 秒(サンプリング開始からの経過時間)
  rpm: number;
  current: number;
  backEmf: number;
}

export interface ScoreResult {
  star1: boolean; // 目標RPM到達
  star2: boolean; // 安定持続(10秒間RPM変動±10%以内)
  star3: boolean; // 消費電流の少なさ(効率)
  stars: 0 | 1 | 2 | 3;
}

const STABILITY_WINDOW_SEC = 10;
const STABILITY_TOLERANCE = 0.1; // ±10%

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// 末尾側から10秒分のトレーリングウィンドウを走査し、「平均RPMが目標以上」かつ
// 「窓内のRPMが平均の±10%以内」の窓が(過去のどの時点でも)一度でも成立していれば
// その窓を返す。☆1(到達)の上に☆2(その状態を10秒維持)が積み上がる設計にするため、
// 窓の平均RPMがtargetRpmを下回る場合は候補としない。
function findStableWindow(history: HistorySample[], targetRpm: number): HistorySample[] | null {
  for (let end = history.length - 1; end >= 0; end--) {
    const endTime = history[end].t;
    const startIndex = history.findIndex((s) => s.t >= endTime - STABILITY_WINDOW_SEC);
    if (startIndex < 0 || startIndex > end) continue;
    if (history[startIndex].t > endTime - STABILITY_WINDOW_SEC + 1e-9) continue; // 窓が10秒に満たない

    const window = history.slice(startIndex, end + 1);
    const meanRpm = average(window.map((s) => s.rpm));
    if (meanRpm < targetRpm) continue;

    const maxDeviation = Math.max(...window.map((s) => Math.abs(s.rpm - meanRpm)));
    if (maxDeviation <= meanRpm * STABILITY_TOLERANCE) {
      return window;
    }
  }
  return null;
}

// spec §3.6: ☆1(目標RPM到達)→☆2(10秒間の安定持続)→☆3(効率)の順に積み上がる。
// star3MaxAvgCurrentAは各チャレンジのデータ(data/challenges.ts)側で、
// scripts/sweep.tsの探索結果から個別に決める。
export function evaluateChallenge(
  history: HistorySample[],
  targetRpm: number,
  star3MaxAvgCurrentA: number,
): ScoreResult {
  const star1 = history.some((sample) => sample.rpm >= targetRpm);

  const stableWindow = findStableWindow(history, targetRpm);
  const star2 = stableWindow !== null;

  const star3 = star2 && average(stableWindow!.map((s) => s.current)) <= star3MaxAvgCurrentA;

  const stars = star3 ? 3 : star2 ? 2 : star1 ? 1 : 0;
  return { star1, star2, star3, stars };
}

// ============================================================
// ここから条件セット(v2 Phase3、spec §6.1・§4.10)。上記の☆評価(v1.5由来、
// モーター単体の調整チャレンジ専用)とは別の、TrackDefinition.objectives用の
// 判定ロジック。spec §8.2ディレクトリ構成コメントで本ファイルの責務として
// 明記されている。
// ============================================================

// 'compliance'(制約遵守)はBuildRestrictionsによるパラメータ選択の制限を
// 走行結果から事後判定するkind。「完走+目標タイム」「完走+エネルギー上限」と
// 並ぶ条件セットの一種として扱う(spec §6.1のEX条件例「3.0V禁止で完走」等)。
export type ObjectiveKind = 'finish' | 'targetTimeS' | 'maxEnergyJ' | 'compliance';

export interface Objective {
  id: string;
  kind: ObjectiveKind;
  value?: number; // targetTimeS→秒、maxEnergyJ→J。finish/complianceは不要(undefined)
}

export interface ObjectiveEvaluation {
  id: string;
  achieved: boolean;
  actualValue?: number; // finished時のelapsedTimeSまたはenergyUsedJ(UI表示用)
}

export interface ObjectiveSetResult {
  allAchieved: boolean;
  results: ObjectiveEvaluation[];
}

// complianceの判定にはconfig・restrictionsが要るため、finalStateだけでなく
// コンテキストオブジェクトを受け取る。motorConfig/carConfig/restrictionsは
// 'compliance'kindを評価する場合のみ必須(未指定時はachieved=falseとして扱う、
// サイレントに達成扱いにしない)。
export interface ObjectiveContext {
  finalState: VehicleSimState;
  motorConfig?: MotorConfig;
  carConfig?: CarConfig;
  restrictions?: Partial<BuildRestrictions>;
  usedPartPresetIds?: string[];
}

// 境界値はinclusive(<=/>=)。未完走(status!=='finished')の場合、kindによらず
// achieved=falseとする(目標タイム・エネルギー上限・制約遵守はいずれも完走が前提)。
export function evaluateObjectives(objectives: Objective[], context: ObjectiveContext): ObjectiveSetResult {
  const results: ObjectiveEvaluation[] = objectives.map((objective) => {
    const finished = context.finalState.status === 'finished';
    if (!finished) {
      return { id: objective.id, achieved: false };
    }
    switch (objective.kind) {
      case 'finish':
        return { id: objective.id, achieved: true };
      case 'targetTimeS': {
        const actualValue = context.finalState.elapsedTimeS;
        return { id: objective.id, achieved: objective.value !== undefined && actualValue <= objective.value, actualValue };
      }
      case 'maxEnergyJ': {
        const actualValue = context.finalState.energyUsedJ;
        return { id: objective.id, achieved: objective.value !== undefined && actualValue <= objective.value, actualValue };
      }
      case 'compliance': {
        if (!context.motorConfig || !context.carConfig || !context.restrictions) {
          return { id: objective.id, achieved: false };
        }
        const validation = validateBuildRestrictions(context.motorConfig, context.carConfig, context.restrictions, context.usedPartPresetIds);
        return { id: objective.id, achieved: validation.valid };
      }
      default:
        return { id: objective.id, achieved: false };
    }
  });
  return { allAchieved: results.every((r) => r.achieved), results };
}

export interface BuildRestrictionViolation {
  path: 'motor' | 'car' | 'partPreset' | 'batteryVoltage';
  key?: string;
  reason: 'locked' | 'outOfRange' | 'batteryVoltageExceeded' | 'partPresetNotAllowed';
}

export interface BuildRestrictionValidation {
  valid: boolean; // evaluable && violations.length===0(判定不能は構造的にvalid=falseになる)
  evaluable: boolean; // すべての制約カテゴリを判定できたか
  violations: BuildRestrictionViolation[];
}

// 純関数。lockedMotorParams/motorParamRanges/lockedCarParams/carParamRanges/
// maxBatteryVoltageはconfigの生数値だけで常に判定できる(evaluableに影響しない)。
// restrictions.allowedPartPresetIdsが空でない配列を指定しているのに
// usedPartPresetIdsが未指定の場合のみ、evaluable=falseにする(「判定不能」を
// achieved=falseへ構造的に帰着させるため、この状態でもvalid=falseになる)。
//
// API境界: usedPartPresetIdsは呼び出し側(Suu側のガレージUI・レシピコード読み込み・
// sweepスクリプト)がUI操作履歴から明示的に注入する。エンジン側は生のMotorConfig/
// CarConfigのみを他の判定基準とする(「どのプリセットで選んだか」というUI操作履歴を
// エンジンは知らない、という既存の分離方針を維持する)。
export function validateBuildRestrictions(
  motorConfig: MotorConfig,
  carConfig: CarConfig,
  restrictions: Partial<BuildRestrictions>,
  usedPartPresetIds?: string[],
): BuildRestrictionValidation {
  const violations: BuildRestrictionViolation[] = [];
  let evaluable = true;

  if (restrictions.lockedMotorParams) {
    for (const key of Object.keys(restrictions.lockedMotorParams) as (keyof MotorConfig)[]) {
      if (motorConfig[key] !== restrictions.lockedMotorParams[key]) {
        violations.push({ path: 'motor', key, reason: 'locked' });
      }
    }
  }
  if (restrictions.lockedCarParams) {
    for (const key of Object.keys(restrictions.lockedCarParams) as (keyof CarConfig)[]) {
      if (carConfig[key] !== restrictions.lockedCarParams[key]) {
        violations.push({ path: 'car', key, reason: 'locked' });
      }
    }
  }
  if (restrictions.motorParamRanges) {
    for (const key of Object.keys(restrictions.motorParamRanges) as (keyof MotorConfig)[]) {
      const range = restrictions.motorParamRanges[key];
      const value = motorConfig[key];
      if (range && typeof value === 'number' && (value < range.min || value > range.max)) {
        violations.push({ path: 'motor', key, reason: 'outOfRange' });
      }
    }
  }
  if (restrictions.carParamRanges) {
    for (const key of Object.keys(restrictions.carParamRanges) as (keyof CarConfig)[]) {
      const range = restrictions.carParamRanges[key];
      const value = carConfig[key];
      if (range && typeof value === 'number' && (value < range.min || value > range.max)) {
        violations.push({ path: 'car', key, reason: 'outOfRange' });
      }
    }
  }
  if (restrictions.maxBatteryVoltage !== undefined && motorConfig.batteryVoltage > restrictions.maxBatteryVoltage) {
    violations.push({ path: 'batteryVoltage', reason: 'batteryVoltageExceeded' });
  }

  if (restrictions.allowedPartPresetIds && restrictions.allowedPartPresetIds.length > 0) {
    if (usedPartPresetIds === undefined) {
      evaluable = false;
    } else {
      const disallowed = usedPartPresetIds.filter((id) => !restrictions.allowedPartPresetIds!.includes(id));
      if (disallowed.length > 0) {
        violations.push({ path: 'partPreset', reason: 'partPresetNotAllowed' });
      }
    }
  }

  return { valid: evaluable && violations.length === 0, evaluable, violations };
}
