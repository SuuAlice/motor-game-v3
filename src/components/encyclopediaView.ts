// P3-4 G7(UI計画§10.4・§3.2、人間承認2026-08-20): 図鑑/検死レポートと実験ノート詳細の
// **表示判断を純関数として切り出す**。Reactレンダリングなしでテスト固定するため
// (既存`saveGateMode.ts`と同じ方針。新規テスト依存は追加しない)。
//
// 中核契約は「**legacy recordを断定的に表示しない**」こと。P3-4以前の記録は
// `finalDestructionState`(および図鑑側の`discoveryEvent`/`runDegradationDiffs`)を持たない——
// これは「観測したが異常が無かった」ではなく「**そもそも記録していない**」である。
// 「膨張なし」のように**無かったと断定する表示をしてはならない**(§10.4)。
import type { DestructionModeId, DestructionState } from '../engine/destructionModes';
import type { DegradationDiff, DestructionEvent } from '../engine/destructionOrchestration';
import type { StoredCodexRecordEntry } from '../store/runOutcomeApplication';

/** 記録の有無を表す3値。`unrecorded`を`absent`(無かった)と同一視しないための区別。 */
export type RecordedFact<T> =
  | { kind: 'recorded'; value: T }
  | { kind: 'unrecorded'; note: string };

/** legacy record共通の中立文言。「無かった」と読めない表現にする。 */
export const UNRECORDED_NOTE = '記録なし(旧バージョンの走行)';

/**
 * D04(電池膨張〜炎上)の段階表示(§10.4)。
 *
 * **当該セッションの記録としてのみ**返す——電池個体自体のプロパティとしては表示しない
 * (走行外の在庫画面で「この電池は膨張している」と表示しない、という既存契約)。
 * legacy record(`finalDestructionState`を持たない)では`unrecorded`を返し、
 * 呼出し側が「膨張なし」と断定表示することを型で防ぐ。
 */
export function describeD04Stage(
  finalDestructionState: DestructionState | undefined,
): RecordedFact<'none' | 'swelling' | 'smoking' | 'burning'> {
  if (finalDestructionState === undefined) return { kind: 'unrecorded', note: UNRECORDED_NOTE };
  const battery = finalDestructionState.battery;
  // nonLipo電池はD04の段階そのものを持たない。これは「記録がない」のではなく
  // 「この構成では起こりえない」——観測済みの事実として'none'を返す。
  if (battery.profile !== 'lipo') return { kind: 'recorded', value: 'none' };
  return { kind: 'recorded', value: battery.d04.stage };
}

/** 図鑑1件の表示モデル。legacy/currentで持てる情報が異なることを型で表す。 */
export type CodexRecordView = {
  modeId: string;
  firstDiscoveredAtRunSequence: number;
  /** 走行文脈の表示にのみ使う。`recipeKey`は画面へ出さない(§3.5)。 */
  replaySnapshot: { runContext: { context: string }; track: unknown };
  discoveryEvent: RecordedFact<DestructionEvent>;
  runDegradationDiffs: RecordedFact<readonly DegradationDiff[]>;
};

/**
 * 図鑑記録を表示モデルへ変換する(§3.2の検死レポート)。
 *
 * legacy record(P3-4以前に発見したモード)は`discoveryEvent`/`runDegradationDiffs`を
 * 持たないため`unrecorded`になる——**「劣化なし」と表示してはならない**。
 * 発見済みという事実(`modeId`・`firstDiscoveredAtRunSequence`)自体は legacy でも保持される。
 */
export function toCodexRecordView(record: StoredCodexRecordEntry): CodexRecordView {
  const hasDiscoveryEvent = 'discoveryEvent' in record && record.discoveryEvent !== undefined;
  return {
    modeId: record.modeId,
    firstDiscoveredAtRunSequence: record.firstDiscoveredAtRunSequence,
    replaySnapshot: record.replaySnapshot,
    discoveryEvent: hasDiscoveryEvent
      ? { kind: 'recorded', value: record.discoveryEvent as DestructionEvent }
      : { kind: 'unrecorded', note: UNRECORDED_NOTE },
    runDegradationDiffs: hasDiscoveryEvent
      // 交差不変条件(saveStoreのvalidatorが保証): 2フィールドは同時に存在するか同時に不在。
      // したがって`discoveryEvent`の有無だけで両方の記録有無が決まる。
      ? { kind: 'recorded', value: record.runDegradationDiffs as readonly DegradationDiff[] }
      : { kind: 'unrecorded', note: UNRECORDED_NOTE },
  };
}

/**
 * 走行単位の劣化差分を、日本語1行の事実として整形する。
 *
 * **原因を断定しない**(spec §1.2「答えを教えない、生の数値を見せる、現象は隠さないが
 * 原因は特定させる」)——どの操作が悪かったかは書かず、観測された差分だけを並べる。
 */
export function formatDegradationDiff(diff: DegradationDiff): string {
  const role = ({
    magnet: '磁石', gear: 'ギヤ', bearing: '軸受', brush: 'ブラシ', rotor: 'ローター',
    battery: '電池', body: 'ボディ',
  } as Record<string, string>)[diff.role] ?? diff.role;
  switch (diff.kind) {
    case 'demagnetization': return `${role}: 減磁 ${(diff.deltaFraction * 100).toFixed(1)} %`;
    case 'scorch': return `${role}: 焦げ ${(diff.deltaFraction * 100).toFixed(1)} %`;
    case 'toothLoss': return `${role}: 歯欠け ${diff.deltaCount} 本`;
    case 'seizure': return `${role}: 焼付き ${(diff.deltaFraction * 100).toFixed(1)} %`;
    case 'wear': return `${role}: 摩耗 ${(diff.deltaFraction * 100).toFixed(1)} %`;
    case 'collapse': return `${role}: 崩壊`;
    case 'burnout': return `${role}: 焼損`;
    case 'consumed': return `${role}: 消耗(消滅)`;
  }
}

/**
 * 図鑑一覧の固定枠(§3.2、UI計画219行): **D01〜D07・D09の8マス固定**。
 * **D08(クラッシュ)は一覧に含めない**——Phase 5の(e)拡張後に追加されるモードであり、
 * Phase 3時点で枠だけ見せると「取り逃した」という誤解を与える。
 */
export const CODEX_MODE_IDS = ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D09'] as const satisfies readonly DestructionModeId[];

/** spec §7.1の症状名。見出しは「モードID+症状名」で表示する(§3.2の1)。 */
const MODE_SYMPTOM_NAME: Record<string, string> = {
  D01: 'コイル崩壊', D02: 'エナメル焼損', D03: '電池破裂', D04: 'リポ炎上',
  D05: 'ブラシ火花', D06: 'ギヤ歯欠け', D07: '熱減磁', D09: '軸受焼付き',
};

/** 未発見マスの表示(§3.2「未発見(シルエット)の場合」)。モードIDを伏せる。 */
export type CodexCellView =
  | { kind: 'discovered'; modeId: string; heading: string; record: CodexRecordView }
  | { kind: 'silhouette'; heading: string };

/**
 * 一覧8マスを組み立てる(§3.2)。未発見マスは**モードIDを伏せた「未発見」表示**にとどめ、
 * 発見情報・構成情報・原因情報は一切出さない——どのモードが残っているかを教えてしまうと
 * 「答えを教えない」(spec §1.2)に反するため。
 */
export function buildCodexCells(records: readonly StoredCodexRecordEntry[]): readonly CodexCellView[] {
  const byModeId = new Map(records.map((record) => [record.modeId, record]));
  return CODEX_MODE_IDS.map((modeId) => {
    const record = byModeId.get(modeId);
    if (record === undefined) return { kind: 'silhouette', heading: '未発見' };
    return {
      kind: 'discovered',
      modeId,
      heading: `${modeId} ${MODE_SYMPTOM_NAME[modeId] ?? ''}`.trim(),
      record: toCodexRecordView(record),
    };
  });
}

/**
 * 走行文脈の表示(§3.2の3)。`replaySnapshot`から導く。
 * **`recipeKey`は画面に出さない**——個体を特定しうる内部識別子であり、§3.5の
 * 「内部識別子を表示しない」契約に反するため、本関数は受け取りも返しもしない。
 */
export function describeRunContext(snapshot: { runContext: { context: string }; track: unknown }): string {
  if (snapshot.runContext.context === 'motor') return 'モーター単体';
  return snapshot.track === null ? 'テスト走行' : 'コース走行';
}

/**
 * 原因情報(causeLog)を日本語の行へ整形する(§3.2の4)。
 *
 * causeLogはモードごとにフィールドが異なるため、**共通して意味のある値だけ**を出す。
 * 温度は`{kind:'uncalibratedGauge'|'unavailable'}`の2状態しかPhase 3では生成されず
 * (§3.2「熱ゲージ表示」)、`uncalibratedGauge`は**未較正である旨を必ず併記する**——
 * 生の比率を温度として読ませない。
 */
export function formatCauseLogLines(causeLog: Record<string, unknown>): readonly string[] {
  const lines: string[] = [];
  if (typeof causeLog.atT === 'number') lines.push(`発生時刻: ${causeLog.atT.toFixed(2)} 秒`);
  if (typeof causeLog.rpm === 'number') lines.push(`回転数: ${Math.round(causeLog.rpm)} rpm`);
  if (typeof causeLog.currentA === 'number') lines.push(`電流: ${causeLog.currentA.toFixed(3)} A`);
  const temperature = causeLog.temperature as { kind?: string; ratio?: number } | undefined;
  if (temperature?.kind === 'uncalibratedGauge' && typeof temperature.ratio === 'number') {
    lines.push(`熱ゲージ: ${(temperature.ratio * 100).toFixed(1)} %(温度モデル未較正)`);
  } else if (temperature?.kind === 'unavailable') {
    lines.push('熱ゲージ: 計測できません');
  }
  return lines;
}

const FIRE_EXPOSURE_ROLE_LABEL: Record<string, string> = {
  body: 'ボディ', magnet: '磁石', rotor: 'ローター', brush: 'ブラシ', gear: 'ギヤ',
  bearing: '軸受', battery: '電池',
};

const D04_STAGE_TEXT: Record<string, string> = {
  none: '膨張なし', swelling: '膨張', smoking: '発煙', burning: '炎上',
};

/**
 * モード固有のcauseLog値を整形する(§3.2の4)。`DestructionEvent`の判別unionに対する
 * **有限switch**——汎用のスキーマ駆動rendererは作らない。モードごとに意味の異なる値を
 * 一律のラベルで並べると、プレイヤーに誤った読み方をさせるためである。
 *
 * `event`を丸ごと受け取るのは、`mode`と`causeLog`の対応が型で保証されるのはunionの要素と
 * してだけだからである(causeLogだけ渡すとどのモードのものか型で辿れない)。
 */
export function formatModeSpecificCauseLines(event: DestructionEvent): readonly string[] {
  switch (event.mode) {
    case 'D01':
      return []; // D01固有値なし(共通のrpm等のみ)
    case 'D02':
      return [`コイル発熱ゲージ: ${(event.causeLog.coilHeatGaugeRatio * 100).toFixed(1)} %(温度モデル未較正)`];
    case 'D03':
      return [
        `電池発熱: ${(event.causeLog.batteryHeatRatio * 100).toFixed(1)} %(温度モデル未較正)`,
        `短絡継続: ${event.causeLog.shortCircuitDurationS.toFixed(2)} 秒`,
      ];
    case 'D04': {
      const lines = [
        `段階: ${D04_STAGE_TEXT[event.causeLog.stage] ?? event.causeLog.stage}`,
        `電池発熱: ${(event.causeLog.batteryHeatRatio * 100).toFixed(1)} %(温度モデル未較正)`,
        `短絡継続: ${event.causeLog.shortCircuitDurationS.toFixed(2)} 秒`,
      ];
      // 過放電は起きていない場合nullになる。0と混同させないため、その旨を明示する。
      lines.push(event.causeLog.overDischargeRatio === null
        ? '過放電: なし'
        : `過放電: ${(event.causeLog.overDischargeRatio * 100).toFixed(1)} %`);
      // 延焼部位は`affectedRoles`を**唯一の入力**として表示する(§3.2「延焼(D04)表示」)。
      // 装備状況から推測して補わない——engineが判定した事実だけを出す。
      lines.push(event.affectedRoles.length === 0
        ? '延焼: なし'
        : `延焼: ${event.affectedRoles.map((role) => FIRE_EXPOSURE_ROLE_LABEL[role] ?? role).join('・')}`);
      return lines;
    }
    case 'D05':
      return [
        `火花の継続: ${event.causeLog.sparkDurationS.toFixed(3)} 秒`,
        // 理論電流は「接触が保たれていれば流れたはずの値」。実電流(共通行)との差が
        // 瞬断の度合いを示すため、両方を並べる。
        `理論電流: ${event.causeLog.theoreticalCurrentA.toFixed(3)} A`,
      ];
    case 'D06':
      return [
        `負荷トルク: ${event.causeLog.loadTorqueNm.toFixed(5)} N·m`,
        `歯欠け: ${event.causeLog.toothLossCount} 本`,
        ...(event.isTotalLoss ? ['ギヤ全損(空転)'] : []),
      ];
    case 'D07':
      return [`磁石発熱ゲージ: ${(event.causeLog.magnetHeatGaugeRatio * 100).toFixed(1)} %(温度モデル未較正)`];
    case 'D09':
      return [
        `軸受発熱ゲージ: ${(event.causeLog.bearingHeatGaugeRatio * 100).toFixed(1)} %(温度モデル未較正)`,
        // OR条件のどちらが成立したか(spec §7.1「金属ギヤ接触**または**高負荷×高速継続」)。
        `金属ギヤ接触: ${event.causeLog.metalGearContactActive ? 'あり' : 'なし'}`,
        `高負荷×高速: ${event.causeLog.highLoadHighSpeedActive ? 'あり' : 'なし'}`,
      ];
  }
}

/**
 * 初回発見時の報酬表示(§3.2の5)。**初回発見時のみ**表示し、既発見では報酬ブロックを出さない
 * (3.3-B(3)の既存契約)。報酬は原子的反映で既に付与済みであり、本画面は表示のみを行う。
 */
export function shouldShowFirstDiscoveryReward(
  record: CodexRecordView,
  currentRunSequence: number | null,
): boolean {
  if (currentRunSequence === null) return false;
  return record.firstDiscoveredAtRunSequence === currentRunSequence;
}

/**
 * 回帰差分の表示文(§11.2)。**事実のみを述べ、原因を特定しない**(spec §1.2)。
 *
 * `null`は「比較できなかった」であり「悪化なし」ではない——同一レシピの過去記録が無いか、
 * 当該走行が観測対象外(未完走等)。**「悪化なし」と表示してはならない**ため、
 * 比較対象が無い旨を明示する文言を返す。
 */
export function formatRegressionReport(
  report: { hasAnomaly: boolean; currentValue: number; baselineValue: number; percentChange: number } | null,
): string {
  if (report === null) return '同じ構成の過去の記録がないため、比較できません。';
  if (!report.hasAnomaly) return '同じ構成の過去の記録と比べて、目立った低下はありません。';
  return `同じ構成で記録が ${(report.percentChange * 100).toFixed(1)} % 低下しています。`;
}
