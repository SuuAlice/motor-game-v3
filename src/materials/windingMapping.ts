// Phase 4 P4-1A(2026-08-28人間承認): 巻線記録 → production `MotorConfig`フィールドの写像。
//
// spec §2(a)の写像層に属する純関数であり、engine本体は巻線記録を知らない。P4-0の
// `src/p40/scenario.ts`は**比較試作の凍結証跡**なので、production側はここを単一出典にする
// (p40をimportしない)。
//
// **P4-0との違い**: P4-0はセッション限定で`effectiveTurnsRatio`へ直接入れていたが、
// productionでは`windingTurnsRatio`(base契約`(0,1]`)へ入れる。走行中の実効値は
// `composeEffectiveMotorConfig`の単一乗算点がD01因子と掛け合わせて作る。

import { aggregateWindingRecord, type WindingRecord } from './windingRecord';

/**
 * `balanceErrorRatio` → `axisOffsetMm`の係数 [mm](承認項目8、K_axis=3.0)。
 *
 * P4-0 G3のread-only有限sweepが、到達可能な離散`balanceErrorRatio`(30ターンで
 * 0 / 0.0667 / … / 0.6)と既存`axisOffsetMm`の体感可能域(0〜3 mm)から逆算し、
 * 2026-08-28の人間承認で確定した値である(`1 mm ÷ ratio 0.3333`として導出)。
 */
export const PRODUCTION_AXIS_OFFSET_COEFFICIENT_MM = 3;

/**
 * P4-1C C1(2026-08-31人間承認、JST): 平均張力 → 占積(整列)の係数。
 *
 * **`windingTurnsRatio`はP4-1Aで「方向一貫性」として凍結された定義であり、C1はこれを
 * `方向一貫性 × 張力占積`へ限定拡張する**(無申告の再解釈ではない)。単一合成点・`(0,1]`契約・
 * `coilTurns`・canonical E2・MC4 payload・recipeKey v2・save schemaはいずれも不変。
 */
export interface TensionPackingCalibration {
  /** 張力0でも下回らない下限。**0を含まない**——0にすると緩い巻きが「作れない」になるが、
   *  緩い巻きは作れないのではなく**弱い**べきであり、生成拒否は方向の完全打ち消しに限る。 */
  readonly minPackingRatio: number;
  /** この平均張力で占積が1.0に達する基準値。 */
  readonly referenceTension: number;
}

/**
 * production較正値(2026-08-31人間承認、JST)。
 *
 * P41C-R1-SWEEPが平均張力`k/256`の257点 × 候補20組(初回)+16組(拡張)を実測して逆算した。
 * `minPackingRatio = 0.85`は「全257点が完走し、かつ**全点が20〜30秒帯の内側**に収まる中で
 * 最大の性能差(全幅8.775秒)」を与える格子点である(`0.83`は全幅10.96秒だが低張力端が
 * 30.9167秒で帯を超えるため不採用)。`referenceTension = 1.0`は**飽和域を持たない唯一の値**で、
 * これより小さいと平均張力の上側が頭打ちになり「上げても何も起きない」区間ができる。
 */
export const PRODUCTION_TENSION_PACKING: TensionPackingCalibration = {
  minPackingRatio: 0.85,
  referenceTension: 1,
};

/** 巻線記録から決まる`MotorConfig`フィールド。**これ以外を巻線記録から導出しない**。 */
export interface WindingDerivedMotorFields {
  /** 実在巻数=記録長。逆巻きでも導線は実在するのでR_coil・Jは減らさない(P3-3-Q5)。 */
  readonly coilTurns: number;
  /** 磁気的な方向一貫性 × 張力占積。`(0,1]`。 */
  readonly windingTurnsRatio: number;
  /** 左右バランス由来の軸ずれ [mm]。 */
  readonly axisOffsetMm: number;
}

/**
 * 記録の平均張力(純関数)。**算術平均だけ**を使い、分散・最大値・連続高張力区間は混ぜない
 * (P41C-H3)。空記録は0を返す——0除算を作らず、空記録はそもそも走行不可である。
 *
 * **事前条件違反はfail-fastでthrowする**(`computeRecipeKey`の非有限値throwと同じ規律)。
 * 正規経路では`validateWindingRecord`が量子化済み`[0,1]`だけを通すため到達しない防御的分岐だが、
 * 型を迂回した非有限値をここで素通りさせると、NaNが`windingTurnsRatio`まで伝播して
 * `(0,1]`契約が静かに破れる。
 */
export function computeMeanTension(record: WindingRecord): number {
  if (record.length === 0) return 0;
  let sum = 0;
  for (const [index, turn] of record.entries()) {
    if (!Number.isFinite(turn.tension)) {
      throw new Error(`computeMeanTension: turns[${index}].tensionが非有限値です: ${String(turn.tension)}`);
    }
    if (turn.tension < 0 || turn.tension > 1) {
      throw new Error(`computeMeanTension: turns[${index}].tensionが0〜1の範囲外です: ${turn.tension}`);
    }
    sum += turn.tension;
  }
  return sum / record.length;
}

/**
 * 平均張力 → 占積比(純関数)。**単調非減少**で、高張力側に罰を置かない
 * (利益は整列・占積、危険は素材許容超えの損傷という別現象として分ける、P41C-H2)。
 *
 * `min(1, …)`で上限1に張り付くため`(0,1]`を外れない。張力0でも`minPackingRatio`を下回らない。
 */
export function computeTensionPackingRatio(meanTension: number, calibration: TensionPackingCalibration): number {
  const { minPackingRatio, referenceTension } = calibration;
  // 事前条件をfail-fastで検証する(clampしない)。clampすると壊れた較正値が
  // 「それらしい値」へ丸められて通り、(0,1]契約が守られている理由が消える。
  if (!Number.isFinite(meanTension) || meanTension < 0 || meanTension > 1) {
    throw new Error(`computeTensionPackingRatio: meanTensionが0〜1の有限値ではありません: ${String(meanTension)}`);
  }
  if (!Number.isFinite(minPackingRatio) || minPackingRatio <= 0 || minPackingRatio > 1) {
    throw new Error(`computeTensionPackingRatio: minPackingRatioが(0,1]の有限値ではありません: ${String(minPackingRatio)}`);
  }
  if (!Number.isFinite(referenceTension) || referenceTension <= 0) {
    throw new Error(`computeTensionPackingRatio: referenceTensionが正の有限値ではありません: ${String(referenceTension)}`);
  }
  // 上の3条件から、戻り値は必ず[minPackingRatio, 1] ⊂ (0,1]に入る。
  return minPackingRatio + (1 - minPackingRatio) * Math.min(1, meanTension / referenceTension);
}

// ---------------------------------------------------------------------------
// P4-1C R3(C3張力破断、2026-09-01人間再承認): 極端な高張力の継続による線材破断。
//
// **素材非依存の`designAssumption`である**。H8の一次資料調査で、同一条件(丸線・エナメル被覆・
// 同一径・同一規格)で最大巻線張力を比較できたのは銅のみ(ELEKTRISOLA IEC/JIS、0.400 mmで854 cN)で、
// アルミ線・純銀線・銀メッキ銅線は一次資料が揃わなかった。銅値を他素材へ外挿せず、
// 0..1張力への数値換算も行わない——854 cNは「この現象が実在する」ことの参考であって、
// 下記定数の導出根拠ではない(R3-D7)。素材別破断値はC3では実装しない。
// ---------------------------------------------------------------------------

export interface WindingBreakCalibration {
  /** これ以下の張力では超過が0となり、何ターン巻いても破断しない安全域の上端。 */
  readonly safeTension: number;
  /** 累積超過がこの値を**超えた**ときに破断する(等号では破断しない)。 */
  readonly breakExposure: number;
}

/**
 * production確定値(2026-09-01人間再承認、R3-E2)。25候補のread-only sweepから選定した。
 *
 * `safeTension = 224/256 = 0.875`・`breakExposure = 4`のとき、最大張力を巻き続けると
 * **33ターン目で破断**する。選定理由(実測):
 *  - `MIN_RUNNABLE_WINDING_TURNS`=10に対し33なので、最大張力でも30ターン級は完成できる
 *    (破断ターンが10以下の候補は「最大張力では走行可能な巻線を1本も作れない」になる)。
 *  - 50・80・150ターンでは破断するため、「長く巻くほど張力を抑える」トレードオフが常用域に出る。
 *  - 安全域だけでC1の占積利益の87.5%が無リスクで取れ、危険域は最後の12.5%を賭ける形になる。
 *  - 最大/0の交互では65ターンまで伸び、「引きっぱなしが悪い」ことが累積の性質から出る。
 * 変更には人間再承認を要する。
 */
export const PRODUCTION_WINDING_BREAK: WindingBreakCalibration = {
  safeTension: 224 / 256,
  breakExposure: 4,
};

/**
 * 1ターン分の超過張力(純関数)。`max(0, tension − safeTension)`。
 *
 * 事前条件違反はfail-fastでthrowする(`computeTensionPackingRatio`と同じ規律)。clampしない。
 */
export function computeTensionExcess(tension: number, calibration: WindingBreakCalibration): number {
  if (!Number.isFinite(tension) || tension < 0 || tension > 1) {
    throw new Error(`computeTensionExcess: tensionが0〜1の有限値ではありません: ${String(tension)}`);
  }
  const { safeTension, breakExposure } = calibration;
  if (!Number.isFinite(safeTension) || safeTension < 0 || safeTension > 1) {
    throw new Error(`computeTensionExcess: safeTensionが0〜1の有限値ではありません: ${String(safeTension)}`);
  }
  if (!Number.isFinite(breakExposure) || breakExposure <= 0) {
    throw new Error(`computeTensionExcess: breakExposureが正の有限値ではありません: ${String(breakExposure)}`);
  }
  return Math.max(0, tension - safeTension);
}

/**
 * 記録済みprefixと候補ターンから累積超過を導出する(純関数)。
 *
 * **毎回prefixから計算し直す**。累積値を`WindingInputState`や保存schemaへ持たせない——
 * 持たせると「記録と累積が食い違った状態」が構築可能になり、復元時に検証する術がなくなる。
 * 緩いターンでは超過0が足されるだけで、**減少も0リセットもしない**(R3-D8確定、回復規則なし)。
 */
export function computeTensionExposure(
  prefix: WindingRecord,
  nextTension: number,
  calibration: WindingBreakCalibration,
): number {
  let exposure = 0;
  for (const turn of prefix) exposure += computeTensionExcess(turn.tension, calibration);
  return exposure + computeTensionExcess(nextTension, calibration);
}

/**
 * 候補ターンを**記録へ追加する前**の破断判定(純関数)。
 *
 * `true`のとき、そのターンは記録へ追加せず(prefixは`prefix`のまま)、
 * **破断ターンを含む本数分**の線材を消費する(消費 = `prefix.length + 1`ターン分)。
 * 等号(`exposure === breakExposure`)では破断しない——境界は厳密な`>`である。
 */
export function willWindingBreak(
  prefix: WindingRecord,
  nextTension: number,
  calibration: WindingBreakCalibration,
): boolean {
  return computeTensionExposure(prefix, nextTension, calibration) > calibration.breakExposure;
}

/**
 * 巻線記録から`MotorConfig`の3フィールドを導出する(純関数)。
 *
 * `windingTurnsRatio`は**方向一貫性 × 張力占積**の積(C1)。積を作るのはここ1箇所だけで、
 * 走行中の実効値は`composeEffectiveMotorConfig`の単一乗算点がD01因子を掛けて作る。
 *
 * **空記録**では方向一貫性が1(`aggregateWindingRecord`の0除算回避)、平均張力0のため
 * 積は`minPackingRatio`になる。空記録はそもそも走行不可(`resolveWindingRunnability`)なので、
 * この値が走行へ届くことはない。
 *
 * **`aggregateWindingRecord`は変更していない**——P4-0の集計契約(張力が違っても集計は同一)を
 * 保ち、`P4WindingAggregate`を読む`src/p40/sessionRunner.ts`へ波及させないため、張力因子は
 * 写像層であるこのファイルに閉じている。
 */
export function deriveWindingMotorFields(record: WindingRecord): WindingDerivedMotorFields {
  const aggregate = aggregateWindingRecord(record, { axisOffsetCoefficientMm: PRODUCTION_AXIS_OFFSET_COEFFICIENT_MM });
  const packingRatio = computeTensionPackingRatio(computeMeanTension(record), PRODUCTION_TENSION_PACKING);
  return {
    coilTurns: aggregate.coilTurns,
    windingTurnsRatio: aggregate.effectiveTurnsRatio * packingRatio,
    axisOffsetMm: aggregate.axisOffsetMm,
  };
}
