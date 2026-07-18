// spec docs/spec.md §2「失敗パターン(実物と1対1対応させる)」の原因判定。
// config(調整可能パラメータ)と直近の時系列サンプル(store.historyと同じ形)から、
// 優先順位付きの原因候補を返す純関数。
//
// spec §2表の「回すと速度が頭打ちになる → 逆起電力(仕様、故障ではない)」は
// 意図的にここでは扱わない(表内で明記されている通り、直すべき失敗ではなく
// 観察ポイントのため。GraphPanelの逆起電力プロットで可視化する)。
import type { MotorConfig } from './motorPhysics';
import type { HistorySample } from './scoring';
import { CHATTER_PRESSURE_THRESHOLD } from './constants';

export type FailureCategory =
  | 'shorted'
  | 'sandingResidue'
  | 'brushTooTight'
  | 'brushTooLoose'
  | 'weakField'
  | 'axisWobble';

export interface FailureDiagnosis {
  category: FailureCategory;
  symptom: string; // spec §2表の「症状」列
  causeParam: keyof MotorConfig; // ユーザーが調整すべきパラメータ
  hintStage1: string; // 段階表示1段目(曖昧な問いかけ)
  hintStage2: string; // 段階表示2段目(具体的なヒント)
}

// 各しきい値は scripts/ の一時検証スクリプトで実際のstep()出力に対して
// 動作確認して決めた(Phase3で追加)。単発の理論値ではなく、実シミュレーション上で
// 期待するカテゴリが検出されることを確認済み。
const RECENT_WINDOW_SEC = 3;
// FLICK_INITIAL_OMEGA(15rad/s)からの立ち上がりピークはRPM_SMOOTHING_ALPHAの
// 平滑化により最初の0.1秒サンプルの時点で既に減衰し始めているため、8/2という
// 小さめの値でないと「動いてから止まった」を検出できない
const MOVING_RPM = 8;
const STOPPED_RPM = 2;
// 逆起電力支配域では巻き数・磁石距離を悪化させても定常回転数はあまり下がらず
// (むしろ上がることすらある)、磁石強度だけが「弱いが動く」帯域を持つ。実測で
// magnetStrength=0.3のとき約600RPM(適正パラメータの約半分)だったため、
// それを検出できる水準に設定
const WEAK_CEILING_RPM = 700;
const WOBBLE_MIN_MEAN_RPM = 300;
const WOBBLE_DEVIATION_RATIO = 0.12;
// 「時々回るが不安定」の代理指標(変動係数)。健全な定常回転は同条件で1%未満、
// チャタリングで乱れている場合は10〜40%程度になることを実測で確認した
// (乱数任せの挙動のため完全に安定はしないが、8%を超えれば明確に異常)
const INTERMITTENT_CV_THRESHOLD = 0.08;

const SANDING_RESIDUE_THRESHOLD = 0.5;
// 実測: このモデルでは brushPressure≈0.43 を境に「まったく動けない」領域に入る
// (0.42では約900RPMで安定、0.43では静止摩擦を振り切れず停止する)。0.6という
// 設計時の見立てはこの境界より高すぎて検出対象を逃していたため引き下げた
const BRUSH_TOO_TIGHT_THRESHOLD = 0.4;
const WEAK_COIL_TURNS_THRESHOLD = 50;
const WEAK_MAGNET_STRENGTH_THRESHOLD = 0.4;
const FAR_MAGNET_DISTANCE_THRESHOLD = 20;
const WOBBLE_AXIS_OFFSET_THRESHOLD = 1.5;

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function recentWindow(history: HistorySample[]): HistorySample[] {
  if (history.length === 0) return [];
  const endTime = history[history.length - 1].t;
  return history.filter((s) => s.t >= endTime - RECENT_WINDOW_SEC);
}

// 「回るがすぐ減速して止まる」の判定: 直近の窓でほぼ止まっている。
// 実測: ブラシ圧が高いほど停止までが速く(数フレーム)、RPM表示の移動平均・
// 0.1秒間隔のサンプリングでは立ち上がりの一瞬をほぼ捉えられないため、
// 「動いたことがある」を要求せず、現在ほぼ止まっていることだけを見る
// (フリックしても動き出せない場合も含めて「ブラシ圧が高すぎる」という
// 診断は正しいため)
function isStalled(history: HistorySample[]): boolean {
  const recent = recentWindow(history);
  if (recent.length === 0) return false;
  return recent.every((s) => s.rpm < STOPPED_RPM);
}

// 「時々回るが不安定」の判定: 接触不良のチャタリングで回転数が大きく暴れる。
// 「動いている瞬間と止まっている瞬間が混在する」を素朴に判定すると、実際には
// 一度勢いに乗ると完全なゼロには戻らないことが多く検出できないため、
// 変動係数(標準偏差/平均)の大きさを代理指標にする
function isIntermittent(history: HistorySample[]): boolean {
  const recent = recentWindow(history);
  if (recent.length < 4) return false;
  const meanRpm = average(recent.map((s) => s.rpm));
  if (meanRpm <= MOVING_RPM) return false;
  const variance = average(recent.map((s) => (s.rpm - meanRpm) ** 2));
  const coefficientOfVariation = Math.sqrt(variance) / meanRpm;
  return coefficientOfVariation > INTERMITTENT_CV_THRESHOLD;
}

// 「弱々しく回る」の判定: 止まってはいないが、上限に対して明らかに遅い
function isWeaklySpinning(history: HistorySample[]): boolean {
  const recent = recentWindow(history);
  if (recent.length === 0) return false;
  const meanRpm = average(recent.map((s) => s.rpm));
  return meanRpm > MOVING_RPM && meanRpm < WEAK_CEILING_RPM;
}

// 「高速で回すとガタガタ揺れて外れる」の判定: 高回転域でRPMのブレが大きい
// (エンジン側はSimStateに専用フラグを持たないため、RPMのばらつきを代理指標にする)
function isWobbling(history: HistorySample[]): boolean {
  const recent = recentWindow(history);
  if (recent.length < 4) return false;
  const meanRpm = average(recent.map((s) => s.rpm));
  if (meanRpm < WOBBLE_MIN_MEAN_RPM) return false;
  const maxDeviation = Math.max(...recent.map((s) => Math.abs(s.rpm - meanRpm)));
  return maxDeviation > meanRpm * WOBBLE_DEVIATION_RATIO;
}

export function diagnoseFailures(
  config: MotorConfig,
  history: HistorySample[],
  lockedKeys: ReadonlySet<keyof MotorConfig> = new Set(),
): FailureDiagnosis[] {
  const candidates: FailureDiagnosis[] = [];

  // spec §2表の掲載順(原因がはっきりしているものから)
  if (config.slitWidthMm <= 0) {
    candidates.push({
      category: 'shorted',
      symptom: 'まったく回らない・電池が熱くなる',
      causeParam: 'slitWidthMm',
      hintStage1: '電池が熱いよ…?',
      hintStage2: '整流子のすき間(スリット幅)を見てみよう。くっついていないかな?',
    });
  }

  // 実測: この物理モデルでは接触抵抗の増加は「止まる」よりも「弱く回り続ける」
  // 形で現れる(R_CONTACT_FLOORのため完全な遮断にはならない)ため、
  // movedThenStoppedではなくisWeaklySpinningで判定する
  if (config.sandingQuality < SANDING_RESIDUE_THRESHOLD && isWeaklySpinning(history)) {
    candidates.push({
      category: 'sandingResidue',
      symptom: 'ピクッと動いて止まる',
      causeParam: 'sandingQuality',
      hintStage1: '動くけど、続かないね…?',
      hintStage2: 'エナメル線の削り具合を見てみよう。削り残しがあると電気が流れにくいよ。',
    });
  }

  if (config.brushPressure > BRUSH_TOO_TIGHT_THRESHOLD && isStalled(history)) {
    candidates.push({
      category: 'brushTooTight',
      symptom: '回るがすぐ減速して止まる',
      causeParam: 'brushPressure',
      hintStage1: 'だんだん遅くなっていくね…?',
      hintStage2: 'ブラシの押し付け圧が強すぎるかも。触れるか触れないかくらいに弱めてみよう。',
    });
  }

  if (config.brushPressure < CHATTER_PRESSURE_THRESHOLD && isIntermittent(history)) {
    candidates.push({
      category: 'brushTooLoose',
      symptom: '時々回るが不安定',
      causeParam: 'brushPressure',
      hintStage1: '回ったり止まったりするね…?',
      hintStage2: 'ブラシの押し付け圧が弱すぎるかも。少しだけ強めに押し当ててみよう。',
    });
  }

  if (isWeaklySpinning(history)) {
    if (config.coilTurns < WEAK_COIL_TURNS_THRESHOLD) {
      candidates.push({
        category: 'weakField',
        symptom: '弱々しく回る',
        causeParam: 'coilTurns',
        hintStage1: '回ってるけど、なんだか弱いね…?',
        hintStage2: 'コイルの巻き数を増やしてみよう。',
      });
    }
    if (config.magnetStrength < WEAK_MAGNET_STRENGTH_THRESHOLD) {
      candidates.push({
        category: 'weakField',
        symptom: '弱々しく回る',
        causeParam: 'magnetStrength',
        hintStage1: '回ってるけど、なんだか弱いね…?',
        hintStage2: '磁石の強さを見てみよう。強い磁石に変えられないかな。',
      });
    }
    if (config.magnetDistanceMm > FAR_MAGNET_DISTANCE_THRESHOLD) {
      candidates.push({
        category: 'weakField',
        symptom: '弱々しく回る',
        causeParam: 'magnetDistanceMm',
        hintStage1: '回ってるけど、なんだか弱いね…?',
        hintStage2: '磁石を釘に近づけてみよう。',
      });
    }
  }

  if (config.axisOffsetMm > WOBBLE_AXIS_OFFSET_THRESHOLD && isWobbling(history)) {
    candidates.push({
      category: 'axisWobble',
      symptom: '高速で回すとガタガタ揺れて外れる',
      causeParam: 'axisOffsetMm',
      hintStage1: '速く回すとガタガタ揺れてない…?',
      hintStage2: '軸(十字の中心)がずれているかも。まっすぐ合わせ直してみよう。',
    });
  }

  // ロック中(チャレンジで固定されている)パラメータが原因のヒントは、直せないので出さない
  return candidates.filter((c) => !lockedKeys.has(c.causeParam));
}
