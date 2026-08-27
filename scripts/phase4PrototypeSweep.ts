// Phase 4 P4-0 G3のread-only有限候補探索(docs/phase4-p4-0-plan.md v3 §6.3・§7.3)。
//
// **この script は候補を「提示」するだけで、何も確定しない**。exact値は人間承認を経て
// `src/p40/scenario.ts`へ反映される。ここで試す候補集合はすべて**script-local**であり、
// production定数として export しない。
//
// 実行順序も計画どおりに固定する:
//   手順1: 既存`axisOffsetMm`(0〜3 mm)を有限sweepし、**体感可能域**(タイム差が出る範囲)を測る
//   手順2: 1/256量子化後に到達可能な離散`balanceErrorRatio`を列挙する
//   手順3: 手順1・2から`K_axis`候補を**逆算**する(係数を先に置かない)
//   手順4: player初走 / 一区間置換した二走目 / rival / seed の有限表を回し、§7.3の条件を満たす組を出す
//
// 物理式・閾値・相手補正はいっさい追加しない。候補が無ければ「無い」と出して終わる。

import { runPhase4Vehicle, resolveFinishInfo, resolveSectionTimes, PHASE4_DT_S } from '../src/p40/sessionRunner';
import {
  PHASE4_CANDIDATE_TURNS,
  applyWindingPatch,
  buildWindingRecord as buildWindingRecordResult,
  resolvePhase4FixedConfigs,
  resolvePhase4Track,
  PHASE4_SECTION_BOUNDARIES_M,
} from '../src/p40/scenario';
import type { WindingRecord } from '../src/materials/windingRecord';
import type { MaterialCompositionBaseline, MaterialSelection } from '../src/materials/materialMapping';
import { resolveChassisBaselineG } from '../src/materials/assumedGeometry';
import { resolveGarageBuild, DEFAULT_GARAGE_SELECTION } from '../src/data/partPresets';
import { createHash } from 'node:crypto';

/** 記録の同一性を人間承認バンドルへ載せるための指紋。 */
function recordSha256(record: WindingRecord): string {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

const track = resolvePhase4Track();

/**
 * 固定素材構成の候補(script-local)。**初期装備の組合せ(ferrite+copper-plate+alkaline)は
 * straight-10mを完走せず全て`stalled`になることを実測した**ため、既存素材の範囲で
 * 完走する組合せも候補に含める。新素材・新物性は追加していない。
 */
const SELECTION_CANDIDATES: { readonly label: string; readonly selection: MaterialSelection }[] = [
  { label: '初期装備(ferrite/alkaline/copper-plate)', selection: { wireId: 'wire-copper-standard', magnetId: 'magnet-ferrite', gearId: 'gear-pom', batteryId: 'battery-alkaline', brushId: 'brush-copper-plate' } },
  { label: 'NORMAL基準(neodymium/alkaline/carbon)', selection: { wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-alkaline', brushId: 'brush-carbon' } },
  { label: 'NORMAL基準+NiMH(neodymium/NiMH/carbon)', selection: { wireId: 'wire-copper-standard', magnetId: 'magnet-neodymium', gearId: 'gear-pom', batteryId: 'battery-nickel-metal-hydride', brushId: 'brush-carbon' } },
];

// P4-0のbaselineは**セッション限定のprototype値**であり、production保存経路の
// `resolveProductionMaterialCompositionBaseline`(store、S-4単一出典)とは別物。
// scriptsはS-4構造監査の対象外だが、値の出典が凍結関数と同一であることは保つ。
function phase4Baseline(): MaterialCompositionBaseline {
  const garageBuild = resolveGarageBuild(DEFAULT_GARAGE_SELECTION);
  return {
    chassisBaselineG: resolveChassisBaselineG(garageBuild.batteryVoltage === 1.5 ? 'one-cell' : 'two-cell'),
    baseGearEfficiency: garageBuild.carConfig.gearEfficiency,
  };
}

function configsFor(selection: MaterialSelection) {
  return resolvePhase4FixedConfigs(selection, phase4Baseline());
}

/** script-localの候補集合(production定数ではない)。 */
const AXIS_OFFSET_CANDIDATES_MM = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3];
const SEED_CANDIDATES = [1, 20260826, 0x5eed1234];
/** C1是正: 候補記録は30ターン固定(案II-Bで約30秒)。turn数を探索軸にしない。 */
const TURN_COUNT_CANDIDATES = [PHASE4_CANDIDATE_TURNS];
/**
 * D1是正: 30ターンでは**整数の左本数が正典**なので、承認済みの0.5〜0.8範囲を
 * 整数格子で尽くす(15〜24本)。0.1刻みのbiasは同じ範囲の4点しか見ておらず、
 * 到達可能なbalanceErrorRatioの証跡としても不足していた。範囲は広げていない。
 */
const LEFT_COUNT_CANDIDATES = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const biasOf = (leftCount: number): number => leftCount / PHASE4_CANDIDATE_TURNS;

/** 近傍探索の範囲(near-missのpBias=0.7=21本・rBias=0.8=24本の周辺)。 */
const NEIGHBOR_PLAYER_LEFT_COUNTS = [20, 21, 22];
const NEIGHBOR_RIVAL_LEFT_COUNTS = [22, 23, 24];
// 30ターンにおける最小有効粒度。1ターンでもratio=0.9333まで落ちるため、
// 80ターン探索時の粗い刻み[0,4,8,12]では僅差になりうる域を丸ごと飛ばしていた。
// 0は診断対照(逆巻きなし)、1〜4が一つの連続区間。
// near-miss近傍に限定するため1固定(0の診断対照は手順2で足りている)。
const REVERSED_LENGTH_CANDIDATES = [1];
const PATCH_START = 10;

/**
 * 正規のcommand/reducer経路で記録を作る。**`WindingTurn`配列を直接組まない**——
 * G3が測るのは「UIが出す意味コマンド列から出る記録」であり、配列を手で作ると経路を迂回する。
 */
function buildWindingRecord(
  turnCount: number,
  leftBias: number,
  reversedRange?: { readonly start: number; readonly end: number },
): WindingRecord {
  const built = buildWindingRecordResult(turnCount, leftBias, reversedRange);
  if (!built.ok) throw new Error(`候補生成の前提が崩れています: ${built.reason}`);
  return built.value;
}

function runOnce(record: WindingRecord, seed: number, kAxis: number, selection: MaterialSelection) {
  const { baseMotorConfig, carConfig } = configsFor(selection);
  return runPhase4Vehicle({ record, baseMotorConfig, carConfig, track, seed, axisOffsetCoefficientMm: kAxis });
}

/**
 * D2是正: 「なぜその結果になったか」を推測で書かないための実測出力。
 * 初走と二走のaggregateを全項目そのまま出し、patchで何が動いて何が動かないかを見せる。
 */
function armCounts(record: WindingRecord): string {
  const c = (arm: string): number => record.filter((t) => t.arm === arm).length;
  return `L${c('left')}/R${c('right')}/straddle${c('straddle')}`;
}

function fmt(value: number | null, digits = 4): string {
  return value === null ? 'null' : value.toFixed(digits);
}

// ---------------------------------------------------------------------------
// 手順1: 既存axisOffsetMmの到達可能域(体感可能域)を先に測る
// ---------------------------------------------------------------------------
console.log('=== 手順1: 素材候補ごとの完走可否と、axisOffsetMm 0〜3 mmの体感可能域 ===');
const viableSelections: typeof SELECTION_CANDIDATES = [];
for (const { label, selection } of SELECTION_CANDIDATES) {
  // 片寄り切り(ratio=1)の記録でaxisOffsetMm自体をsweepする。
  const skewed = buildWindingRecord(PHASE4_CANDIDATE_TURNS, 1);
  const times: (number | null)[] = [];
  let anyFinished = false;
  for (const axisOffsetMm of AXIS_OFFSET_CANDIDATES_MM) {
    const result = runOnce(skewed, SEED_CANDIDATES[0], axisOffsetMm, selection);
    if (!result.ok) { times.push(null); continue; }
    if (result.run.status === 'finished') anyFinished = true;
    times.push(result.run.finishTimeS);
  }
  const finished = times.filter((t): t is number => t !== null);
  const spread = finished.length >= 2 ? Math.max(...finished) - Math.min(...finished) : 0;
  console.log(`${label}: 完走=${anyFinished ? 'あり' : 'なし'} finish=[${times.map((t) => fmt(t, 3)).join(', ')}] 全幅=${spread.toFixed(4)}s`);
  if (anyFinished) viableSelections.push({ label, selection });
}
if (viableSelections.length === 0) {
  console.log('完走する素材候補がありません。物理・閾値を追加せず停止します。');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 手順2: 量子化後に到達可能な離散balanceErrorRatio
// ---------------------------------------------------------------------------
console.log('\n=== 手順2: 到達可能な離散balanceErrorRatio(30ターン、正規reducer経路) ===');
interface RatioEntry { readonly bias: number; readonly left: number; readonly right: number; readonly straddle: number; readonly ratio: number; readonly sha: string; }
const ratioEntries: RatioEntry[] = LEFT_COUNT_CANDIDATES.map((leftCount) => {
  const rec = buildWindingRecord(PHASE4_CANDIDATE_TURNS, biasOf(leftCount));
  const left = rec.filter((t) => t.arm === 'left').length;
  const right = rec.filter((t) => t.arm === 'right').length;
  const straddle = rec.filter((t) => t.arm === 'straddle').length;
  return { bias: biasOf(leftCount), left, right, straddle, ratio: Math.abs(left - right) / PHASE4_CANDIDATE_TURNS, sha: recordSha256(rec) };
});
for (const e of ratioEntries) {
  console.log(`左${e.left}本(bias=${e.bias.toFixed(6)}) → L${e.left}/R${e.right}/straddle${e.straddle}`
    + ` balanceErrorRatio=${e.ratio.toFixed(6)} record SHA-256=${e.sha}`);
}
console.log(`到達可能な離散balanceErrorRatio: ${[...new Set(ratioEntries.map((e) => e.ratio))].sort((a, b) => a - b).map((r) => r.toFixed(6)).join(', ')}`);

// ---------------------------------------------------------------------------
// 手順3: K_axisをコードで逆算する(係数を先に置かない)
// ---------------------------------------------------------------------------
console.log('\n=== 手順3: K_axisの逆算(K = 目標axisOffsetMm ÷ 到達可能ratio) ===');
// ratio=0は軸ずれ0にしかならずKを決められないので除外する(0除算)。
const NONZERO_RATIOS = [...new Set(ratioEntries.map((e) => e.ratio).filter((r) => r > 0))].sort((a, b) => a - b);
// 目標axisOffsetMmは手順1で実際に完走時間差が出た範囲(=AXIS_OFFSET_CANDIDATES_MMの正の値)。
const TARGET_AXIS_OFFSETS_MM = AXIS_OFFSET_CANDIDATES_MM.filter((mm) => mm > 0);
const derivedK: { readonly k: number; readonly from: string }[] = [];
for (const ratio of NONZERO_RATIOS) {
  for (const targetMm of TARGET_AXIS_OFFSETS_MM) {
    const k = targetMm / ratio;
    // 重複除去は「到達可能な最大ratio×Kが手順1の上限(3 mm)を超えない」範囲に限る——
    // 超えるKは、どの候補記録でも測っていない軸ずれ域へ外挿することになる。
    if (k * Math.max(...NONZERO_RATIOS) > Math.max(...AXIS_OFFSET_CANDIDATES_MM)) continue;
    if (derivedK.some((d) => Math.abs(d.k - k) < 1e-12)) continue;
    derivedK.push({ k, from: `${targetMm}mm ÷ ratio${ratio.toFixed(4)}` });
  }
}
derivedK.sort((a, b) => a.k - b.k);
const K_AXIS_CANDIDATES = derivedK.map((d) => d.k);
for (const d of derivedK) console.log(`K=${d.k.toFixed(6)}  (${d.from})`);
console.log(`逆算されたK_axis候補数: ${K_AXIS_CANDIDATES.length}(手置きではなく、上の ratio × axis から生成)`);
if (K_AXIS_CANDIDATES.length === 0) {
  console.log('K_axis候補が0件です。物理・素材・turn数を広げず停止します。');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 手順4: player初走 / 二走目(一区間置換) / rival / seed の有限表
// ---------------------------------------------------------------------------
function printAggregates(r: {
  readonly selectionLabel: string; readonly kAxis: number; readonly seed: number;
  readonly turnCount: number; readonly playerBias: number; readonly reversedLength: number; readonly rivalBias: number;
}): void {
  const selection = SELECTION_CANDIDATES.find((c) => c.label === r.selectionLabel)!.selection;
  const first = buildWindingRecord(r.turnCount, r.playerBias, r.reversedLength > 0 ? { start: PATCH_START, end: PATCH_START + r.reversedLength } : undefined);
  const patched = applyWindingPatch(first, PATCH_START, r.reversedLength, buildWindingRecord(r.reversedLength, r.playerBias));
  const rival = buildWindingRecord(r.turnCount, r.rivalBias);
  const entries: { readonly name: string; readonly record: WindingRecord }[] = [
    { name: '初走', record: first },
    { name: '二走', record: patched.ok ? patched.value : first },
    { name: 'rival', record: rival },
  ];
  for (const entry of entries) {
    const run = runOnce(entry.record, r.seed, r.kAxis, selection);
    if (!run.ok) { console.log(`      ${entry.name}: 走行不成立(${run.reason})`); continue; }
    const a = run.run.aggregate;
    const times = resolveSectionTimes(run.run.trace, PHASE4_SECTION_BOUNDARIES_M, resolveFinishInfo(run.run));
    console.log(`      ${entry.name}: coilTurns=${a.coilTurns} effectiveTurnsRatio=${a.effectiveTurnsRatio.toFixed(6)}`
      + ` balanceErrorRatio=${a.balanceErrorRatio.toFixed(6)} axisOffsetMm=${a.axisOffsetMm.toFixed(6)} K=${r.kAxis.toFixed(6)}`
      + ` | ${armCounts(entry.record)} | step=${run.run.steps} status=${run.run.status}`
      + ` coilCollapsed=${run.run.coilCollapsed} shorted=${run.run.shorted}`
      + ` | 区間 ${times.map((t) => (t === null ? 'null' : fmt(t))).join(' / ')}`
      + ` | SHA-256=${recordSha256(entry.record)}`);
  }
}
console.log('\n=== 手順4: 有限候補表 ===');
interface CandidateRow {
  anyCollapse: boolean; anyShort: boolean;
  selectionLabel: string; kAxis: number; seed: number; turnCount: number; playerBias: number; reversedLength: number; rivalBias: number;
  firstFinish: number | null; secondFinish: number | null; rivalFinish: number | null;
  firstStatus: string; secondStatus: string; rivalStatus: string;
  firstDelta: number | null; secondDelta: number | null;
}
const rows: CandidateRow[] = [];
let combinations = 0;
for (const { label: selectionLabel, selection } of viableSelections) {
  for (const kAxis of K_AXIS_CANDIDATES) {
    for (const seed of SEED_CANDIDATES) {
    for (const turnCount of TURN_COUNT_CANDIDATES) {
      for (const playerBias of NEIGHBOR_PLAYER_LEFT_COUNTS.map(biasOf)) {
        for (const reversedLength of REVERSED_LENGTH_CANDIDATES) {
          for (const rivalBias of NEIGHBOR_RIVAL_LEFT_COUNTS.map(biasOf)) {
            combinations += 1;
            // 初走: 偏り + 逆巻き区間を持つ記録
            const first = buildWindingRecord(turnCount, playerBias, reversedLength > 0 ? { start: PATCH_START, end: PATCH_START + reversedLength } : undefined);
            // 二走目: **一つの連続区間だけ**を置換(逆巻き区間を正転へ直す、§7.2)
            // C1是正: 二走目の一箇所修正も replaceRange コマンド→reducer を通す。
            const patch = reversedLength > 0
              ? applyWindingPatch(first, PATCH_START, reversedLength, buildWindingRecord(reversedLength, playerBias))
              : { ok: true as const, value: first };
            if (!patch.ok) continue;
            const rival = buildWindingRecord(turnCount, rivalBias);

            const firstRun = runOnce(first, seed, kAxis, selection);
            const secondRun = runOnce(patch.value, seed, kAxis, selection);
            const rivalRun = runOnce(rival, seed, kAxis, selection);
            if (!firstRun.ok || !secondRun.ok || !rivalRun.ok) continue;

            rows.push({
              anyCollapse: firstRun.run.coilCollapsed || secondRun.run.coilCollapsed || rivalRun.run.coilCollapsed,
              anyShort: firstRun.run.shorted || secondRun.run.shorted || rivalRun.run.shorted,
              selectionLabel, kAxis, seed, turnCount, playerBias, reversedLength, rivalBias,
              firstFinish: firstRun.run.finishTimeS,
              secondFinish: secondRun.run.finishTimeS,
              rivalFinish: rivalRun.run.finishTimeS,
              firstStatus: firstRun.run.status,
              secondStatus: secondRun.run.status,
              rivalStatus: rivalRun.run.status,
              firstDelta: firstRun.run.finishTimeS !== null && rivalRun.run.finishTimeS !== null ? firstRun.run.finishTimeS - rivalRun.run.finishTimeS : null,
              secondDelta: secondRun.run.finishTimeS !== null && rivalRun.run.finishTimeS !== null ? secondRun.run.finishTimeS - rivalRun.run.finishTimeS : null,
            });
            }
          }
        }
      }
    }
  }
}
console.log(`総組合せ数: ${combinations}、走行成立: ${rows.length}`);

// §7.3の条件: 初走は完走してrivalへ僅差負け / 二走目は初走より改善 / 改善後はrivalへ僅差勝ち / 両走20〜30秒
const NARROW_S = 1.5; // 「僅差」の上限(script-localの探索条件。ゲーム定数ではない)
const accepted = rows.filter((r) =>
  r.firstStatus === 'finished' && r.secondStatus === 'finished' && r.rivalStatus === 'finished'
  && r.firstFinish !== null && r.secondFinish !== null && r.rivalFinish !== null
  && r.firstFinish >= 20 && r.firstFinish <= 30 && r.secondFinish >= 20 && r.secondFinish <= 30
  && r.firstDelta !== null && r.firstDelta > 0 && r.firstDelta <= NARROW_S
  && r.secondFinish < r.firstFinish
  && r.secondDelta !== null && r.secondDelta < 0 && Math.abs(r.secondDelta) <= NARROW_S,
);
console.log(`§7.3を満たす候補: ${accepted.length}`);
for (const rev of REVERSED_LENGTH_CANDIDATES) {
  console.log(`  逆巻き長${rev}: 候補${accepted.filter((r) => r.reversedLength === rev).length}件`);
}
const withUnintended = accepted.filter((r) => r.anyCollapse || r.anyShort);
console.log(`うち意図しない発火(coilCollapse/短絡)を含む候補: ${withUnintended.length}`);
const clean = accepted.filter((r) => !r.anyCollapse && !r.anyShort);
console.log(`意図しない発火0の候補: ${clean.length}`);
// 僅差の度合いが「見分けられる」範囲かを示す(小さすぎる差は人間が気づけない)
/**
 * 正式推奨の選び方: 受理帯`[0, NARROW_S]`の**4つの端すべてからの最小距離**を最大化する。
 *
 * 差が最大の候補を推すと勝ち幅がちょうどNARROW_Sに張り付き、探索条件(未承認の
 * script-local値)を少し動かすだけで受理/不受理が反転する。閾値ぎりぎりの値を
 * 正典候補に据えないため、両端から最も離れた候補を推奨する。
 */
function robustness(r: CandidateRow): number {
  const lossGap = r.firstDelta as number;
  const winGap = Math.abs(r.secondDelta as number);
  return Math.min(lossGap, NARROW_S - lossGap, winGap, NARROW_S - winGap);
}

/** 同点時の決定論tie-break(K→seed→player左本数→rival左本数の昇順)。 */
function tieBreak(a: CandidateRow, b: CandidateRow): number {
  return (a.kAxis - b.kAxis) || (a.seed - b.seed) || (a.playerBias - b.playerBias) || (a.rivalBias - b.rivalBias);
}

const ranked = [...clean].sort((a, b) => (robustness(b) - robustness(a)) || tieBreak(a, b));

/** 参考表示用: 両側の差が最も大きい候補(=帯の端に寄る)。 */
const widest = [...clean].sort((a, b) => {
  const gap = (r: CandidateRow): number => Math.min(Math.abs(r.firstDelta as number), Math.abs(r.secondDelta as number));
  return (gap(b) - gap(a)) || tieBreak(a, b);
})[0];
if (ranked.length > 0) {
  const top = ranked[0];
  console.log(`\n推奨1案(受理帯[0, ${NARROW_S}]の4端からの最小距離=${robustness(top).toFixed(4)} sが最大): [${top.selectionLabel}]`
    + ` K=${top.kAxis.toFixed(6)} seed=${top.seed} turns=${top.turnCount} player左${Math.round(top.playerBias * PHASE4_CANDIDATE_TURNS)}本`
    + ` rev=${top.reversedLength} rival左${Math.round(top.rivalBias * PHASE4_CANDIDATE_TURNS)}本`);
  console.log(`  初走 ${fmt(top.firstFinish)}s / rival ${fmt(top.rivalFinish)}s / 差 +${fmt(top.firstDelta)}s(負け)`);
  console.log(`  二走 ${fmt(top.secondFinish)}s / 差 ${fmt(top.secondDelta)}s(勝ち)、初走比 ${fmt((top.secondFinish as number) - (top.firstFinish as number))}s`);

  // 人間承認バンドル用のexact値。ここで再走行し、step数・status・区間時刻・記録SHAまで出す。
  const selection = SELECTION_CANDIDATES.find((c) => c.label === top.selectionLabel)!.selection;
  const firstRecord = buildWindingRecord(top.turnCount, top.playerBias, top.reversedLength > 0 ? { start: PATCH_START, end: PATCH_START + top.reversedLength } : undefined);
  const patched = applyWindingPatch(firstRecord, PATCH_START, top.reversedLength, buildWindingRecord(top.reversedLength, top.playerBias));
  const rivalRecord = buildWindingRecord(top.turnCount, top.rivalBias);
  const bundle: { readonly name: string; readonly record: WindingRecord }[] = [
    { name: 'player初走', record: firstRecord },
    { name: 'player二走', record: patched.ok ? patched.value : firstRecord },
    { name: 'rival', record: rivalRecord },
  ];
  console.log('\n--- exact値バンドル(人間承認用) ---');
  for (const entry of bundle) {
    const run = runOnce(entry.record, top.seed, top.kAxis, selection);
    if (!run.ok) { console.log(`${entry.name}: 走行不成立(${run.reason})`); continue; }
    // C3是正: 完走したrunのゴール線は正典finishTimeSで埋める(補間・書換えはしない)。
    const times = resolveSectionTimes(run.run.trace, PHASE4_SECTION_BOUNDARIES_M, resolveFinishInfo(run.run));
    console.log(
      `${entry.name}: finish=${fmt(run.run.finishTimeS)}s step=${run.run.steps} status=${run.run.status}`
      + ` coilCollapsed=${run.run.coilCollapsed} shorted=${run.run.shorted} truncated=${run.run.truncated}`
      + ` | ratio=${run.run.aggregate.effectiveTurnsRatio.toFixed(6)} axisOffsetMm=${run.run.aggregate.axisOffsetMm.toFixed(6)}`
      + ` | 区間 ${times.map((t) => (t === null ? 'null' : fmt(t))).join(' / ')}`
      + ` | balanceErrorRatio=${run.run.aggregate.balanceErrorRatio.toFixed(6)} K_axis=${top.kAxis.toFixed(6)}`
      + ` | SHA-256=${recordSha256(entry.record)}`,
    );
  }
  console.log(`dt=${PHASE4_DT_S} 固定。区間境界=${PHASE4_SECTION_BOUNDARIES_M.join(' / ')} m(第4区間=ゴール線)`);

  if (widest !== undefined && widest !== top) {
    console.log(`\n参考(両側の差が最大だが、勝ち幅が受理帯の端 ${NARROW_S} sに張り付くため**非推奨**): [${widest.selectionLabel}]`
      + ` K=${widest.kAxis.toFixed(6)} seed=${widest.seed} player左${Math.round(widest.playerBias * PHASE4_CANDIDATE_TURNS)}本`
      + ` rev=${widest.reversedLength} rival左${Math.round(widest.rivalBias * PHASE4_CANDIDATE_TURNS)}本`
      + ` | 初走 ${fmt(widest.firstFinish)}s (差 +${fmt(widest.firstDelta)}s) → 二走 ${fmt(widest.secondFinish)}s (差 ${fmt(widest.secondDelta)}s)`
      + ` | 4端からの最小距離=${robustness(widest).toFixed(4)} s`);
  }

  // 「僅差」の解釈は未承認のため、受理帯の反対端(差が最も小さい組)も併記する。
  const narrowest = [...clean].sort((a, b) => {
    const gap = (r: CandidateRow): number => Math.max(Math.abs(r.firstDelta as number), Math.abs(r.secondDelta as number));
    return gap(a) - gap(b);
  })[0];
  if (narrowest !== undefined && narrowest !== top) {
    console.log(`\n参考(差が最も小さい代表候補): [${narrowest.selectionLabel}] K=${narrowest.kAxis.toFixed(6)} seed=${narrowest.seed}`
      + ` turns=${narrowest.turnCount} pBias=${narrowest.playerBias} rev=${narrowest.reversedLength} rBias=${narrowest.rivalBias}`
      + ` | 初走 ${fmt(narrowest.firstFinish)}s (差 +${fmt(narrowest.firstDelta)}s) → 二走 ${fmt(narrowest.secondFinish)}s (差 ${fmt(narrowest.secondDelta)}s)`);
  }
}
for (const row of accepted.slice(0, 10)) {
  console.log(
    `[${row.selectionLabel}] K=${row.kAxis} seed=${row.seed} turns=${row.turnCount} pBias=${row.playerBias} rev=${row.reversedLength} rBias=${row.rivalBias}`
    + ` | 初走 ${fmt(row.firstFinish)}s (rival差 ${fmt(row.firstDelta)}s) → 二走 ${fmt(row.secondFinish)}s (rival差 ${fmt(row.secondDelta)}s)`,
  );
}

if (accepted.length === 0) {
  console.log('\n候補なし。物理・閾値・相手補正を追加せず停止する(計画§7.3)。');
  // どの条件で落ちたのかを段階的に数える(条件を緩めるのではなく、事実を出すだけ)。
  const clauses: { readonly label: string; readonly test: (r: CandidateRow) => boolean }[] = [
    { label: '3走とも finished', test: (r) => r.firstStatus === 'finished' && r.secondStatus === 'finished' && r.rivalStatus === 'finished' },
    { label: '+ 初走・二走とも 20〜30 s', test: (r) => r.firstFinish !== null && r.secondFinish !== null && r.firstFinish >= 20 && r.firstFinish <= 30 && r.secondFinish >= 20 && r.secondFinish <= 30 },
    { label: `+ 初走は rival へ 0〈差≤${NARROW_S} s で負け`, test: (r) => r.firstDelta !== null && r.firstDelta > 0 && r.firstDelta <= NARROW_S },
    { label: '+ 二走は初走より速い', test: (r) => r.secondFinish !== null && r.firstFinish !== null && r.secondFinish < r.firstFinish },
    { label: `+ 二走は rival へ 0〈差≤${NARROW_S} s で勝ち`, test: (r) => r.secondDelta !== null && r.secondDelta < 0 && Math.abs(r.secondDelta) <= NARROW_S },
  ];
  let surviving = rows;
  for (const clause of clauses) {
    surviving = surviving.filter(clause.test);
    console.log(`  ${clause.label}: ${surviving.length}件`);
  }
  // 最後の1条件だけで落ちた組は、あと何が足りないのかを個別に出す(緩めずに事実だけ)。
  const nearMiss = rows.filter((r) => clauses.slice(0, 4).every((c) => c.test(r)));
  if (nearMiss.length > 0) {
    console.log(`  最終条件(二走がrivalへ僅差勝ち)だけで落ちた組 ${nearMiss.length}件:`);
    for (const r of nearMiss) {
      console.log(`    [${r.selectionLabel}] K=${r.kAxis.toFixed(6)} seed=${r.seed} 左${Math.round(r.playerBias * PHASE4_CANDIDATE_TURNS)}本 rev=${r.reversedLength} rival左${Math.round(r.rivalBias * PHASE4_CANDIDATE_TURNS)}本`
        + ` | 初走 ${fmt(r.firstFinish)}s (差 +${fmt(r.firstDelta)}s) → 二走 ${fmt(r.secondFinish)}s (差 ${fmt(r.secondDelta)}s) rival ${fmt(r.rivalFinish)}s`);
      printAggregates(r);
    }
  }

  // 20〜30 sまで残った組が、rival差でどう落ちているかを出す(緩めずに事実だけ)。
  const inWindow = rows.filter((r) => clauses[0]!.test(r) && clauses[1]!.test(r));
  if (inWindow.length > 0) {
    const deltas = inWindow.map((r) => r.firstDelta as number).sort((a, b) => a - b);
    const wins = deltas.filter((d) => d <= 0).length;
    console.log(`  診断: 20〜30 s帯の初走rival差 ${deltas[0]!.toFixed(3)}〜${deltas[deltas.length - 1]!.toFixed(3)} s`
      + `(初走の時点で既に勝っている組 ${wins}件 / 1.5 sを超えて負けている組 ${deltas.filter((d) => d > NARROW_S).length}件)`);
    const revs = [...new Set(inWindow.map((r) => r.reversedLength))].sort((a, b) => a - b);
    console.log(`  診断: 20〜30 s帯に残った逆巻き長 ${revs.join(', ')}(30ターン中)`);
  }
  const finishedRows = rows.filter((r) => r.firstStatus === 'finished' && r.secondStatus === 'finished' && r.rivalStatus === 'finished');
  if (finishedRows.length > 0) {
    const firsts = finishedRows.map((r) => r.firstFinish as number);
    console.log(`  参考: 3走完走した組の初走finish ${Math.min(...firsts).toFixed(3)}〜${Math.max(...firsts).toFixed(3)} s`);
  }
  // 診断用: 完走した組の実測レンジだけを出す(候補を作るためではなく、なぜ無いかを示すため)
  const finished = rows.filter((r) => r.firstStatus === 'finished' && r.firstFinish !== null);
  if (finished.length > 0) {
    const times = finished.map((r) => r.firstFinish as number);
    console.log(`診断: 初走完走 ${finished.length}件、finish ${Math.min(...times).toFixed(3)}〜${Math.max(...times).toFixed(3)} s`);
    const statuses = new Set(rows.map((r) => `${r.firstStatus}/${r.secondStatus}/${r.rivalStatus}`));
    console.log(`診断: 終端の組合せ ${[...statuses].slice(0, 6).join(' , ')}`);
  } else {
    const statuses = new Set(rows.map((r) => r.firstStatus));
    console.log(`診断: 初走完走0件。終端status: ${[...statuses].join(', ')}`);
  }
}

