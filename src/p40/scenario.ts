// Phase 4 P4-0 G3(docs/phase4-p4-0-plan.md v3 §7): 固定シナリオの**不変条件**と、
// 巻線記録を組み立てるためのhelper。
//
// **G4(2026-08-26人間承認)で、G3のsweepが提示したexactバンドルを正典定数として固定した。**
// 承認対象は「K_axis=3.0 / seed=1 / 30ターン / player左21・右9でturn10のみ逆巻き /
// rival左23・右7全正転」と、それぞれの記録hash・走行結果である
// (正式sweep script SHA-256=3982b0a34a68163f552b32e5eeb7e2d7bd89cfd813fbdba6db35c0c7d31ebea8)。
//
// **候補集合と選定ロジックはここへ持ち込まない**——sweepが試した候補の配列も、
// 「受理帯の端から最も離れた候補を選ぶ」という選定規則も`scripts/phase4PrototypeSweep.ts`に
// script-localで残す。productionが持つべきなのは選ばれた結果だけで、選び方ではない。

import type { MotorConfig } from '../engine/motorPhysics';
import type { CarConfig } from '../engine/vehiclePhysics';
import { TRACK_BY_ID } from '../data/tracks';
import type { ValidatedTrackDefinition } from '../engine/trackPhysics';
import { composeConfigFromMaterials, type MaterialCompositionBaseline, type MaterialSelection } from '../materials/materialMapping';
import { resolveGarageBuild, DEFAULT_GARAGE_SELECTION } from '../data/partPresets';
import type { WindingArm, WindingDirection, WindingRecord, WindingValidationResult } from '../materials/windingRecord';
import { INITIAL_WINDING_INPUT_STATE, applyWindingCommand, applyWindingCommands, type WindingCommand } from '../retro/winding/inputCommands';

/**
 * コース(§7.1)。**検証済みブランド型を`TRACK_BY_ID`から取得する**——生の`TrackDefinition`から
 * 作った場合、走行が終端しないことを実測済み(P3-4 G5 probeで9000 step非終端を確認)。
 */
export function resolvePhase4Track(): ValidatedTrackDefinition {
  const track = TRACK_BY_ID.get('straight-10m');
  if (track === undefined) throw new Error('P4-0シナリオの前提が崩れています: straight-10mが見つかりません');
  return track;
}

/** 区間境界(§8: 固定4区間、各2.5 m)。 */
export const PHASE4_SECTION_BOUNDARIES_M: readonly number[] = [2.5, 5, 7.5, 10];

// ---------------------------------------------------------------------------
// 人間承認済みexact値(2026-08-26)。ここから下の定数は承認の対象そのものであり、
// 再承認なしに変更しない。
// ---------------------------------------------------------------------------

/**
 * player/rival共通の固定素材構成(§7.1「在庫と無関係」)。
 * 初期装備の組合せ(ferrite/copper-plate)では straight-10m を完走しないことを実測済み。
 */
export const PHASE4_MATERIAL_SELECTION: MaterialSelection = {
  wireId: 'wire-copper-standard',
  magnetId: 'magnet-neodymium',
  gearId: 'gear-pom',
  batteryId: 'battery-alkaline',
  brushId: 'brush-carbon',
};

/** `balanceErrorRatio`→`axisOffsetMm`の係数 [mm]。1 mm ÷ ratio 0.333333 として逆算された値。 */
export const PHASE4_AXIS_OFFSET_COEFFICIENT_MM = 3;

/** 走行RNGのseed。3走(初走・修正後・rival)すべてで共通。 */
export const PHASE4_SEED = 1;

/** player初走の左腕本数(残り9本は右腕)。 */
export const PHASE4_PLAYER_LEFT_TURNS = 21;

/** rivalの左腕本数(残り7本は右腕)。全ターン正転。 */
export const PHASE4_RIVAL_LEFT_TURNS = 23;

/** player初走で逆巻きになっている半開区間。turn 10の1ターンのみ。 */
export const PHASE4_PLAYER_REVERSED_RANGE = { start: 10, end: 11 } as const;

/** `resolveGarageBuild`の戻り値型。呼出し側がS-3関数へそのまま渡せるように公開する。 */
export type Phase4GarageBuild = ReturnType<typeof resolveGarageBuild>;

/**
 * baselineを組み立てるのに必要な**入力事実**を返す(2026-08-26裁定・案C)。
 *
 * この関数自体は`MaterialCompositionBaseline`を**構築しない**——構築してよいのは
 * S-3関数`resolveProductionMaterialCompositionBaseline`(store)だけであり、P4-0は
 * storeをimportしないため(P4-C3)、呼出し側(App)が橋渡しをする:
 *
 *   const { rawPlayerMotorConfig, garageBuild } = resolvePhase4BaselineInputs();
 *   const baseline = resolveProductionMaterialCompositionBaseline(rawPlayerMotorConfig, garageBuild);
 *   // baselineをPhase4PrototypeScreenへpropsで注入する
 *
 * `resolvePhase4FixedConfigs`も同じ関数を使う。**入力事実の出典を1つに保つ**ためで、
 * 呼出し側とscenario側が別々に入力を作ると、baselineと実際の構成が静かにずれる。
 */
export function resolvePhase4BaselineInputs(): {
  rawPlayerMotorConfig: MotorConfig;
  garageBuild: Phase4GarageBuild;
} {
  const garageBuild = resolveGarageBuild(DEFAULT_GARAGE_SELECTION);
  const rawPlayerMotorConfig: MotorConfig = {
    coilTurns: 80,
    slitWidthMm: 1.5,
    sandingQuality: 0.9,
    brushPressure: 0.3,
    magnetStrength: 0.5,
    magnetDistanceMm: 10,
    batteryVoltage: garageBuild.batteryVoltage,
    axisOffsetMm: 0,
    wireGaugeMm: 0.4,
    parallelStrands: 1,
    varnished: true,
  };
  return { rawPlayerMotorConfig, garageBuild };
}

/**
 * 巻線以外の固定構成(§7.1)。既存の素材写像を1回通して得る——P4-0が独自の物性値を持たない
 * ようにするため、`composeConfigFromMaterials`の出力をそのまま使う。
 *
 * 巻線由来の3値(`coilTurns`・`effectiveTurnsRatio`・`axisOffsetMm`)は`sessionRunner`が
 * 記録から上書きするため、ここでの値は出発点にすぎない。
 *
 * **`baseline`を引数で受ける理由(S-4単一出典契約)**: production側の
 * `MaterialCompositionBaseline`は`resolveProductionMaterialCompositionBaseline`(store)だけが
 * 構築してよく、`resolveChassisBaselineG`の直接呼出しも`chassisBaselineG`のリテラル構築も
 * productionコードでは禁止されている(`src/store/__tests__/runOutcomeApplication.test.ts`の
 * S-4構造監査が機械的に固定)。P4-0はstoreをimportしない(P4-C3)ため、ここでbaselineを
 * **作らず**呼出し側から受け取る。呼出し側(App)が`resolvePhase4BaselineInputs()`の戻り値を
 * S-3関数へ渡してbaselineを作り、propsで注入する(2026-08-26裁定・案C)。
 */
export function resolvePhase4FixedConfigs(
  selection: MaterialSelection,
  baseline: MaterialCompositionBaseline,
): { baseMotorConfig: MotorConfig; carConfig: CarConfig } {
  // 入力事実は`resolvePhase4BaselineInputs`が唯一の出典。ここで作り直すと、
  // 呼出し側がbaselineを組んだ入力と食い違っても誰も気づけない。
  const { rawPlayerMotorConfig, garageBuild } = resolvePhase4BaselineInputs();
  const composed = composeConfigFromMaterials(
    rawPlayerMotorConfig,
    garageBuild.carConfig,
    baseline,
    selection,
  );
  if (!composed.ok) throw new Error(`P4-0シナリオの前提が崩れています: ${composed.reason}`);
  return { baseMotorConfig: composed.motorConfig, carConfig: composed.carConfig };
}

/** G3候補の固定ターン数。案II-Bは1ターン=1秒(`SEMI_AUTO_TICK_MS`)なので、30ターン=約30秒。 */
export const PHASE4_CANDIDATE_TURNS = 30;

/**
 * 巻線記録を**正規のcommand/reducer経路で**組み立てるhelper。
 *
 * `WindingTurn`配列を直接作らないのは、G3が確かめたいのが「UIが実際に出す意味コマンド列から
 * 出る記録」だからで、配列を手で組むと入力経路を迂回した別物を測ってしまう。位置・張力・向きの
 * 決め方は案II-B相当(左右どちらの腕へ寄せるかだけを変える)。
 *
 * `tension`は0.5固定——P4-0では物理へ接続しないため、候補間で動かす意味がない(§6.4)。
 */
function guideCommandsFor(arm: WindingArm): readonly WindingCommand[] {
  const position = arm === 'left' ? 0.25 : arm === 'right' ? 0.75 : 0.5;
  return [{ kind: 'setGuide', position, arm }];
}

/**
 * 「左右の配り方」と「逆巻き区間」からcommand列を作る。**sweepの候補生成専用**であり、
 * ここで作った記録が正典になるわけではない(正典化は人間承認後)。
 *
 * @param turnCount 総ターン数(10〜150)
 * @param leftBias 左腕へ寄せる比率0〜1。0.5で左右均等
 * @param reversedRange 逆巻きにする半開区間`[start, end)`。省略時は全ターン正転
 */
export function buildWindingCommands(
  turnCount: number,
  leftBias: number,
  reversedRange?: { readonly start: number; readonly end: number },
): readonly WindingCommand[] {
  const leftCount = Math.round(turnCount * leftBias);
  const commands: WindingCommand[] = [{ kind: 'setTension', tension: 0.5 }];
  let lastArm: WindingArm | null = null;
  let lastDirection: WindingDirection | null = null;
  for (let i = 0; i < turnCount; i += 1) {
    const arm: WindingArm = i < leftCount ? 'left' : 'right';
    const direction: WindingDirection = reversedRange !== undefined && i >= reversedRange.start && i < reversedRange.end ? -1 : 1;
    // 変化した時だけコマンドを出す(同値の再設定は記録を変えない)。
    if (arm !== lastArm) { commands.push(...guideCommandsFor(arm)); lastArm = arm; }
    if (direction !== lastDirection) { commands.push({ kind: 'setDirection', direction }); lastDirection = direction; }
    commands.push({ kind: 'advanceTurn' });
  }
  return commands;
}

/** command列を正規reducerへ通して記録を得る。拒否された場合は理由を伝播する。 */
export function buildWindingRecord(
  turnCount: number,
  leftBias: number,
  reversedRange?: { readonly start: number; readonly end: number },
): WindingValidationResult<WindingRecord> {
  const applied = applyWindingCommands(INITIAL_WINDING_INPUT_STATE, buildWindingCommands(turnCount, leftBias, reversedRange));
  if (!applied.ok) return applied;
  return { ok: true, value: applied.value.record };
}

/**
 * 二走目の「一箇所だけ直す」操作。**`replaceWindingRange`を直接呼ばず、`replaceRange`
 * コマンドをreducerへ通す**——プレイヤーがUIで行う修正と同じ経路であることを保つ。
 */
export function applyWindingPatch(
  record: WindingRecord,
  start: number,
  deleteCount: number,
  turns: WindingRecord,
): WindingValidationResult<WindingRecord> {
  const applied = applyWindingCommand(
    { ...INITIAL_WINDING_INPUT_STATE, record },
    { kind: 'replaceRange', start, deleteCount, turns },
  );
  if (!applied.ok) return applied;
  return { ok: true, value: applied.value.record };
}

// ---------------------------------------------------------------------------
// 承認済み3走の巻線記録。**すべて正規のcommand/reducer経路で組み立てる**——
// 記録hashが承認値と一致することは`__tests__/scenario.test.ts`が固定する。
// ---------------------------------------------------------------------------

/** 承認済み記録を組み立てる際の共通処理。前提が崩れたら黙って別の記録を返さず落とす。 */
function buildApprovedRecord(
  turnCount: number,
  leftBias: number,
  reversedRange?: { readonly start: number; readonly end: number },
): WindingRecord {
  const built = buildWindingRecord(turnCount, leftBias, reversedRange);
  if (!built.ok) throw new Error(`P4-0シナリオの前提が崩れています: ${built.reason}`);
  return built.value;
}

/** player側の左腕比率。置換用の1ターンも同じ比率で作るため、腕構成が動かない。 */
const PLAYER_LEFT_BIAS = PHASE4_PLAYER_LEFT_TURNS / PHASE4_CANDIDATE_TURNS;

/** player初走: 左21/右9、turn 10だけ逆巻き。「一箇所だけ巻き間違えた」状態。 */
export function buildPhase4PlayerFirstRecord(): WindingRecord {
  return buildApprovedRecord(PHASE4_CANDIDATE_TURNS, PLAYER_LEFT_BIAS, PHASE4_PLAYER_REVERSED_RANGE);
}

/**
 * player修正後: 腕構成は初走のまま、turn 10だけ正転へ直す。
 *
 * 置換は`replaceRange`コマンド経由で、プレイヤーがUIで行う修正と同じ経路を通る。
 * 置換用の1ターンも同じ左腕比率で作るため、`balanceErrorRatio`・`axisOffsetMm`は
 * 初走から**動かない**(変わるのは`effectiveTurnsRatio`だけ)。
 */
export function buildPhase4PlayerFixedRecord(): WindingRecord {
  const first = buildPhase4PlayerFirstRecord();
  const replacement = buildApprovedRecord(PHASE4_PLAYER_REVERSED_RANGE.end - PHASE4_PLAYER_REVERSED_RANGE.start, PLAYER_LEFT_BIAS);
  const deleteCount = PHASE4_PLAYER_REVERSED_RANGE.end - PHASE4_PLAYER_REVERSED_RANGE.start;
  const patched = applyWindingPatch(first, PHASE4_PLAYER_REVERSED_RANGE.start, deleteCount, replacement);
  if (!patched.ok) throw new Error(`P4-0シナリオの前提が崩れています: ${patched.reason}`);
  return patched.value;
}

/** rival: 左23/右7、全ターン正転。 */
export function buildPhase4RivalRecord(): WindingRecord {
  return buildApprovedRecord(PHASE4_CANDIDATE_TURNS, PHASE4_RIVAL_LEFT_TURNS / PHASE4_CANDIDATE_TURNS);
}
