// P4-0 G5(セッション限定の進行): 巻線→初走→二段リザルト→一区間の巻き直し→二走目→銘板。
//
// **すべてメモリ内の純reducer**である。localStorage・gameStore・saveStore・inventory・
// notebook・codex・courseProgressへは読み書きしない——リロードや退出で消えることが
// P4-0の前提であり、保存経路を1つでも持つとその前提が静かに崩れる。
//
// 勝敗補正・結果書換え・追加乱数は持たない。走行はalice所有の`runPhase4Vehicle`へ委譲し、
// 承認済みscenario定数だけを渡す。修正はUIと同じ`replaceRange`経路(`applyWindingPatch`)を通る。
//
// `MaterialCompositionBaseline`は**呼出し側から注入するだけ**で、ここでは組み立てない——
// baselineの出典はS-4の単一関数に限られており、p40側で生値から作り直すとその単一出典が
// 二重化する。既定値やmodule内キャッシュも持たない(reducerの純粋性のため)。
import {
  PHASE4_AXIS_OFFSET_COEFFICIENT_MM,
  PHASE4_MATERIAL_SELECTION,
  PHASE4_SEED,
  applyWindingPatch,
  buildPhase4RivalRecord,
  resolvePhase4FixedConfigs,
  resolvePhase4Track,
} from './scenario';
import { runPhase4Vehicle, type Phase4RunResult } from './sessionRunner';
import type { WindingRecord } from '../materials/windingRecord';
import type { MaterialCompositionBaseline } from '../materials/materialMapping';

/**
 * UI計画§9の進行段階。走行(racing)・第一段(celebration)・第二段(facts)を分けて持つのは、
 * 「祝ってから事実を出す」順序をreducerが強制するため——factsを先に自動表示しない。
 *
 * 区間選択(`selectRepairSection`)・巻き直し中(`repairing`)・巻き直し済み(`repaired`)も
 * 別段階にする。G5の筋は「直したから変わった」であり、直さずに再走できると比較が
 * 成立しない。また`repaired`からは追加の巻き直しを受理しないので、初走と変わるのは
 * 選んだ1区間だけに保たれる。
 */
export type Phase4Stage =
  | 'winding'
  | 'racingFirst'
  | 'celebrationFirst'
  | 'factsFirst'
  | 'selectRepairSection'
  | 'repairing'
  | 'repaired'
  | 'racingSecond'
  | 'celebrationSecond'
  | 'factsSecond'
  | 'nameplate'
  | 'complete';

/**
 * 修正区間の数。**記録を4等分した固定区間**で、走行の4区間差と同じ粒度に揃える
 * (UI計画§S6)。任意範囲timeline widgetも汎用N区間editorも作らない。
 */
export const PHASE4_REPAIR_SECTION_COUNT = 4;

export interface Phase4RepairSection {
  /** 0始まり。画面には1始まりの「区間1〜4」で出す。 */
  readonly index: number;
  /** 記録内のturn範囲 [start, end)。 */
  readonly start: number;
  readonly end: number;
}

/**
 * 記録を4等分した固定区間。端数の配り方は`Math.round`に委ね、区間長の差は最大1ターンに
 * 収まる。走行可能な下限10ターン以上であれば4区間はいずれも非空になる。
 */
export function computeRepairSections(turnCount: number): readonly Phase4RepairSection[] {
  const sections: Phase4RepairSection[] = [];
  for (let index = 0; index < PHASE4_REPAIR_SECTION_COUNT; index++) {
    sections.push({
      index,
      start: Math.round((turnCount * index) / PHASE4_REPAIR_SECTION_COUNT),
      end: Math.round((turnCount * (index + 1)) / PHASE4_REPAIR_SECTION_COUNT),
    });
  }
  return sections;
}

export interface Phase4RaceOutcome {
  readonly player: Phase4RunResult;
  readonly rival: Phase4RunResult;
}

export interface Phase4SessionState {
  readonly stage: Phase4Stage;
  /** 初走に使った記録。巻き直し後も比較のため保持する。 */
  readonly firstRecord: WindingRecord | null;
  readonly firstOutcome: Phase4RaceOutcome | null;
  /** 巻き直す区間。選択前はnull。 */
  readonly selectedSection: Phase4RepairSection | null;
  /** 巻き直し後の記録。 */
  readonly repairedRecord: WindingRecord | null;
  readonly secondOutcome: Phase4RaceOutcome | null;
  /** 直近の操作が拒否された理由(記録が短すぎる・区間長が合わないなど)。成功時はnull。 */
  readonly rejectReason: string | null;
}

export const INITIAL_PHASE4_SESSION: Phase4SessionState = {
  stage: 'winding',
  firstRecord: null,
  firstOutcome: null,
  selectedSection: null,
  repairedRecord: null,
  secondOutcome: null,
  rejectReason: null,
};

export type Phase4SessionAction =
  | { readonly kind: 'runFirst'; readonly record: WindingRecord }
  /** 走行の再生が終わった(または飛ばされた)。第一段へ進む。 */
  | { readonly kind: 'finishRace' }
  /** 第一段を飛ばして事実へ。自動では進めない。 */
  | { readonly kind: 'showFacts' }
  | { readonly kind: 'beginRepair' }
  | { readonly kind: 'selectSection'; readonly index: number }
  /** 区間を選び直す。巻き直しを確定する前ならいつでも戻れる。 */
  | { readonly kind: 'reselectSection' }
  /**
   * 選んだ区間を`turns`で丸ごと置き換える。position/arm/direction/tensionの4値を
   * 案II-Bで**再入力**した結果であり、方向だけの反転ではない(UI計画§S6)。
   * 区間外のturnは値同一のまま残る。
   */
  | { readonly kind: 'commitRepair'; readonly turns: WindingRecord }
  | { readonly kind: 'runSecond' }
  | { readonly kind: 'toNameplate' }
  | { readonly kind: 'finish' }
  | { readonly kind: 'reset' };

/**
 * 1レース分(player + rival)を走らせる。**両者とも同じseed・同じ固定構成**で、
 * 差は巻線記録だけ。追従補正・ラバーバンドは存在しない。
 */
export function runPhase4Race(
  record: WindingRecord,
  baseline: MaterialCompositionBaseline,
): { readonly ok: true; readonly outcome: Phase4RaceOutcome } | { readonly ok: false; readonly reason: string } {
  const track = resolvePhase4Track();
  const { baseMotorConfig, carConfig } = resolvePhase4FixedConfigs(PHASE4_MATERIAL_SELECTION, baseline);
  const common = {
    baseMotorConfig,
    carConfig,
    track,
    seed: PHASE4_SEED,
    axisOffsetCoefficientMm: PHASE4_AXIS_OFFSET_COEFFICIENT_MM,
  };
  const player = runPhase4Vehicle({ ...common, record });
  if (!player.ok) return { ok: false, reason: player.reason };
  const rival = runPhase4Vehicle({ ...common, record: buildPhase4RivalRecord() });
  if (!rival.ok) return { ok: false, reason: rival.reason };
  return { ok: true, outcome: { player: player.run, rival: rival.run } };
}

export type Phase4RaceRunner = (record: WindingRecord) => ReturnType<typeof runPhase4Race>;

/** 注入されたbaselineを1回だけ束ねてrunnerにする。baselineの出典は呼出し側のまま。 */
export function createPhase4RaceRunner(baseline: MaterialCompositionBaseline): Phase4RaceRunner {
  return (record) => runPhase4Race(record, baseline);
}

/** 勝敗はタイムが唯一の出典。未完走は負け、両者未完走は勝ちにしない。 */
export function playerWon(outcome: Phase4RaceOutcome): boolean {
  const player = outcome.player.finishTimeS;
  const rival = outcome.rival.finishTimeS;
  if (player === null) return false;
  return rival === null || player < rival;
}

/**
 * 状態遷移。**許可された遷移だけを受理**し、それ以外は状態を変えない——
 * 「二走目の結果が出たあとに初走をやり直す」ような順序で結果が混ざらないようにする。
 * 走行そのものは`runRace`に**必須引数として**注入し、reducerをテスト可能な純関数に保つ。
 * 既定のrunnerを持たせない——既定があると、baselineを渡し忘れた呼出しが静かに動いてしまう。
 */
export function phase4SessionReducer(
  state: Phase4SessionState,
  action: Phase4SessionAction,
  runRace: Phase4RaceRunner,
): Phase4SessionState {
  switch (action.kind) {
    case 'runFirst': {
      if (state.stage !== 'winding') return state;
      const result = runRace(action.record);
      if (!result.ok) return { ...state, rejectReason: result.reason };
      return {
        ...state,
        stage: 'racingFirst',
        firstRecord: action.record,
        firstOutcome: result.outcome,
        rejectReason: null,
      };
    }
    case 'finishRace': {
      if (state.stage === 'racingFirst') return { ...state, stage: 'celebrationFirst' };
      if (state.stage === 'racingSecond') return { ...state, stage: 'celebrationSecond' };
      return state;
    }
    case 'showFacts': {
      if (state.stage === 'celebrationFirst') return { ...state, stage: 'factsFirst' };
      if (state.stage === 'celebrationSecond') return { ...state, stage: 'factsSecond' };
      return state;
    }
    case 'beginRepair': {
      if (state.stage !== 'factsFirst' || state.firstRecord === null) return state;
      // 型紙の複製=初走の記録を値としてそのまま持ち越す。
      return { ...state, stage: 'selectRepairSection', repairedRecord: state.firstRecord, rejectReason: null };
    }
    case 'selectSection': {
      if (state.stage !== 'selectRepairSection' || state.repairedRecord === null) return state;
      const section = computeRepairSections(state.repairedRecord.length)[action.index];
      if (section === undefined) return { ...state, rejectReason: '区間の指定が不正です' };
      return { ...state, stage: 'repairing', selectedSection: section, rejectReason: null };
    }
    case 'reselectSection': {
      if (state.stage !== 'repairing') return state;
      return { ...state, stage: 'selectRepairSection', selectedSection: null, rejectReason: null };
    }
    case 'commitRepair': {
      // `repaired`からは受理しない=巻き直しは1区間だけ。
      if (state.stage !== 'repairing' || state.repairedRecord === null || state.selectedSection === null) return state;
      const { start, end } = state.selectedSection;
      const expected = end - start;
      if (action.turns.length !== expected) {
        // ターン数が変わると区間外のturn indexまでずれ、「選択外は値同一」が崩れる。
        return { ...state, rejectReason: `区間の巻数は${expected}ターンにしてください` };
      }
      const patched = applyWindingPatch(state.repairedRecord, start, expected, action.turns);
      if (!patched.ok) return { ...state, rejectReason: patched.reason };
      return { ...state, stage: 'repaired', repairedRecord: patched.value, rejectReason: null };
    }
    case 'runSecond': {
      // 巻き直し前(`repairing`)では走らせない。
      if (state.stage !== 'repaired' || state.repairedRecord === null) return state;
      const result = runRace(state.repairedRecord);
      if (!result.ok) return { ...state, rejectReason: result.reason };
      return { ...state, stage: 'racingSecond', secondOutcome: result.outcome, rejectReason: null };
    }
    case 'toNameplate': {
      // 銘板は勝利時だけ。負けたまま銘板へ進める導線は作らない。
      if (state.stage !== 'factsSecond' || state.secondOutcome === null) return state;
      if (!playerWon(state.secondOutcome)) return state;
      return { ...state, stage: 'nameplate' };
    }
    case 'finish': {
      if (state.stage !== 'factsSecond' && state.stage !== 'nameplate') return state;
      return { ...state, stage: 'complete' };
    }
    case 'reset':
      return INITIAL_PHASE4_SESSION;
  }
}
