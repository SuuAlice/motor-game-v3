// Phase 4 P4-0 G1a(docs/phase4-p4-0-plan.md v3 §5・§6、arbiter条件P4-C1/P4-C3): 巻線記録の
// **正典型**と、記録に対する純関数群(量子化・検証・走行可否・値コピー・半開区間置換・集計)。
//
// spec §9.1の核: 「プレイヤーの描いた軌跡がそのままローターになる」。各ターンを
// `{位置, 腕, 方向, 張力}`として記録し、**記録→物理パラメータの変換は集計の純関数**として
// 写像層に置く(エンジン本体は従来どおり集計済みパラメータを受けるのみ)。
//
// **決定論(spec §9.1)**: 「同一の操作列は端末・入力機器・フレームレートに依らず同一の
// 巻線記録を生む」。この要求を型で支えるため、連続値(`position`/`tension`)は**記録前に
// 1/256刻みへ量子化**する。1/256は2の冪なのでIEEE754で厳密に表現でき、量子化判定に
// 許容誤差を持ち込む必要がない(丸め幅を許すと端末差が記録差として残りうる)。
//
// **P4-C3(隔離)**: 本ファイルは`recipeKey.ts`・`recipeCode.ts`をimportしない。P4-0の
// `effectiveTurnsRatio≠1`なMotorConfigがproduction保存経路(`materialComposedBase`契約)へ
// 漏れないよう、依存を持たないことで構造的に保証する。
//
// **本ファイルの範囲**: 記録の型・量子化・検証・走行可否・値コピー・半開区間置換(G1a)と、
// 記録→P4-0物理入力への**最小2軸の集計**(G3、§6)。
// **`K_axis`(balanceErrorRatio→axisOffsetMmの係数)の数値は本ファイルで決めない**——
// G3のread-only有限sweepで既存`axisOffsetMm`(0〜3 mm)の到達可能域を測ってから逆算し、
// 人間承認を経て`src/p40/scenario.ts`が持つ。ここでは既定値を持たない引数として受け取る。

/** 巻線1ターンが軸のどちら側に載ったか。`straddle`は中央で爪楊枝をまたいだターン(spec §9.0)。 */
export type WindingArm = 'left' | 'right' | 'straddle';

/** 巻き方向。逆巻きは磁気的に打ち消し合う(spec §9.2「方向一貫性」)。 */
export type WindingDirection = 1 | -1;

export interface WindingTurn {
  /** 短冊上の巻き位置。0〜1、1/256刻みへ量子化済み。 */
  readonly position: number;
  readonly arm: WindingArm;
  readonly direction: WindingDirection;
  /** 保持した張力。0〜1、1/256刻みへ量子化済み。**P4-0では物理へ接続しない**(§6.4)。 */
  readonly tension: number;
}

export type WindingRecord = readonly WindingTurn[];

/** 連続値の量子化刻み。2の冪であり厳密に表現できる(上記の決定論の根拠)。 */
export const WINDING_QUANTIZATION_STEP = 1 / 256;

/** 記録の上限ターン数(spec §9.1「最大150ターン×4値程度」)。 */
export const MAX_WINDING_TURNS = 150;

/**
 * 走行可能な下限ターン数。既存`MotorConfig.coilTurns`の受理範囲10〜150に由来する——
 * **本ファイルが新しい下限を決めているのではなく、engineの既存範囲をそのまま参照している**。
 */
export const MIN_RUNNABLE_WINDING_TURNS = 10;

/**
 * 1/256刻みへ量子化する。**記録を作る側が入力の直後に必ず通す**関数であり、
 * validatorは「量子化済みであること」を要求する(量子化はvalidatorの仕事ではない)。
 * 非有限値はそのまま返さず`null`を返す——ここで0等へ丸めると、壊れた入力が
 * 正当な記録として通ってしまう。
 */
export function quantizeWindingValue(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return Math.round(value * 256) / 256;
}

/** 0〜1かつ1/256の格子上にあるか。1/256は2の冪のため許容誤差を要しない。 */
export function isQuantizedWindingValue(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value < 0 || value > 1) return false;
  return Number.isInteger(value * 256);
}

export type WindingValidationResult<T> = { ok: true; value: T } | { ok: false; reason: string };

function isWindingArm(value: unknown): value is WindingArm {
  return value === 'left' || value === 'right' || value === 'straddle';
}

function isWindingDirection(value: unknown): value is WindingDirection {
  return value === 1 || value === -1;
}

/**
 * 1ターンの検証。NaN・Infinity・範囲外・非量子化値・未知のarm/directionを拒否する(§5.1)。
 * 失敗理由は日本語で、どのフィールドが不正かが分かる形で返す。
 */
export function validateWindingTurn(raw: unknown): WindingValidationResult<WindingTurn> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'ターンがオブジェクトではありません' };
  }
  const turn = raw as Record<string, unknown>;
  if (!isQuantizedWindingValue(turn.position)) {
    return { ok: false, reason: `positionが0〜1の1/256量子化値ではありません: ${String(turn.position)}` };
  }
  if (!isQuantizedWindingValue(turn.tension)) {
    return { ok: false, reason: `tensionが0〜1の1/256量子化値ではありません: ${String(turn.tension)}` };
  }
  if (!isWindingArm(turn.arm)) {
    return { ok: false, reason: `armが不正です: ${String(turn.arm)}` };
  }
  if (!isWindingDirection(turn.direction)) {
    return { ok: false, reason: `directionが1または-1ではありません: ${String(turn.direction)}` };
  }
  return { ok: true, value: { position: turn.position, arm: turn.arm, direction: turn.direction, tension: turn.tension } };
}

/**
 * 記録全体の検証。**0ターン(空記録)は受理する**——入力途中の状態として正当であり、
 * 走行開始できるかどうかは別の判定(`resolveWindingRunnability`)が持つ(§5.1、P4-C1)。
 */
export function validateWindingRecord(raw: unknown): WindingValidationResult<WindingRecord> {
  if (!Array.isArray(raw)) return { ok: false, reason: '記録が配列ではありません' };
  if (raw.length > MAX_WINDING_TURNS) {
    return { ok: false, reason: `記録が上限${MAX_WINDING_TURNS}ターンを超えています: ${raw.length}` };
  }
  const turns: WindingTurn[] = [];
  for (const [index, rawTurn] of raw.entries()) {
    const result = validateWindingTurn(rawTurn);
    if (!result.ok) return { ok: false, reason: `turns[${index}]: ${result.reason}` };
    turns.push(result.value);
  }
  return { ok: true, value: turns };
}

/**
 * 走行開始できるか(§5.1・§6.2、P4-C1)。集計・描画は0ターンから受理する一方、
 * **走行は既存`coilTurns`の受理範囲10〜150に限る**。範囲外を黙ってclampせず、
 * 「走行不可である」という事実を理由付きで返す——丸めると、プレイヤーが巻いた本数と
 * 走った本数が食い違ったまま結果だけが出る。
 */
export function resolveWindingRunnability(record: WindingRecord): { runnable: true } | { runnable: false; reason: string } {
  if (record.length < MIN_RUNNABLE_WINDING_TURNS) {
    return { runnable: false, reason: `走行には${MIN_RUNNABLE_WINDING_TURNS}ターン以上必要です(現在${record.length}ターン)` };
  }
  if (record.length > MAX_WINDING_TURNS) {
    return { runnable: false, reason: `走行できるのは${MAX_WINDING_TURNS}ターンまでです(現在${record.length}ターン)` };
  }
  return { runnable: true };
}

export interface P4WindingAggregate {
  /** 表示用。記録長そのもの。 */
  readonly woundTurnCount: number;
  /**
   * engineへ渡す**実在**巻数。`record.length`と等しい——逆巻きでも導線は実在するため、
   * 抵抗(R_coil)と慣性(J)は減らさない(motorPhysics.tsの「R_coil/Jは実coilTurnsのまま
   * 据え置く」という設計に合わせる、P3-3-Q5)。
   */
  readonly coilTurns: number;
  /**
   * engineへ渡す**磁気的**な方向一貫性。`abs(sum(direction)) / length`。
   * 逆巻き区間は磁気トルクと逆起電力だけを減らす(K_E=K_T相反性を保つ既存フィールド)。
   * 空記録では1(打ち消しなし)を返す(P4-C1)。
   */
  readonly effectiveTurnsRatio: number;
  readonly leftTurnCount: number;
  readonly rightTurnCount: number;
  readonly straddleTurnCount: number;
  /**
   * **表示・テスト用の生集計**。0〜1。`straddle`は左右へ0.5ずつ配分して算出するため、
   * 分子には現れず分母(総ターン数)にのみ効く。
   * **この値自体は物理入力ではない**——物理へ渡すのは下の`axisOffsetMm`だけである(§6.3)。
   */
  readonly balanceErrorRatio: number;
  /**
   * P4-0で**唯一**engineへ渡す左右バランス由来の物理入力(既存`MotorConfig.axisOffsetMm`)。
   * `balanceErrorRatio × K_axis`。K_axisは未確定のため呼出し側から受け取る(§6.3、G3で確定)。
   */
  readonly axisOffsetMm: number;
}

export interface AggregateWindingOptions {
  /**
   * `balanceErrorRatio`から`axisOffsetMm`(mm)を得る係数`K_axis`。**既定値を持たない**——
   * G3のread-only有限sweepで既存`axisOffsetMm`(0〜3 mm)の到達可能域を測ってから逆算する
   * 未確定値であり、ここで数値を発明しないための設計(§6.3)。
   */
  readonly axisOffsetCoefficientMm: number;
}

/**
 * 記録→P4-0の物理入力への集計(純関数、§6)。
 *
 * **定義域は0〜150ターンの全域**で、どの長さでも有限値を返す(P4-C1)。空記録は
 * `coilTurns=0`・`effectiveTurnsRatio=1`・`balanceErrorRatio=0`とし、**0除算でNaNを作らない**。
 * 走行可否は本関数では判定しない(`resolveWindingRunnability`が持つ)。
 *
 * `position`・`tension`は集計に用いない——P4-0では物理へ接続しないため(§6.4)。
 */
export function aggregateWindingRecord(record: WindingRecord, options: AggregateWindingOptions): P4WindingAggregate {
  let leftTurnCount = 0;
  let rightTurnCount = 0;
  let straddleTurnCount = 0;
  let directionSum = 0;
  for (const turn of record) {
    if (turn.arm === 'left') leftTurnCount += 1;
    else if (turn.arm === 'right') rightTurnCount += 1;
    else straddleTurnCount += 1;
    directionSum += turn.direction;
  }

  const woundTurnCount = record.length;
  // 空記録での0除算を避ける。1(打ち消しなし)は「まだ何も打ち消していない」の自然な表現でもある。
  const effectiveTurnsRatio = woundTurnCount === 0 ? 1 : Math.abs(directionSum) / woundTurnCount;
  // straddleは左右へ0.5ずつ配分するため、分子には現れず分母(総数)にだけ効く。
  const balanceErrorRatio = woundTurnCount === 0 ? 0 : Math.abs(leftTurnCount - rightTurnCount) / woundTurnCount;

  return {
    woundTurnCount,
    coilTurns: woundTurnCount,
    effectiveTurnsRatio,
    leftTurnCount,
    rightTurnCount,
    straddleTurnCount,
    balanceErrorRatio,
    axisOffsetMm: balanceErrorRatio * options.axisOffsetCoefficientMm,
  };
}

/**
 * 型紙複製(spec §9.6)。**値コピーであり、数値補間・平滑化・自動改善をしない**——
 * 「複製元より良い巻きが自動で得られることはない」という仕様上の保証を、
 * 変換を一切挟まないことで守る。
 */
export function copyWindingRecord(record: WindingRecord): WindingRecord {
  return record.map((turn) => ({ ...turn }));
}

/**
 * 部分修正(spec §9.6)。半開区間`[start, start + deleteCount)`だけを`turns`で置換する。
 *
 * 範囲外index・負値・非整数・上限超過・不正turnはすべて`ok:false`で拒否し、
 * **元の記録は一切変更しない**(引数非破壊)。「一箇所だけ直す」が中核ループである以上、
 * 置換区間の外が1ターンでも変わってはならない。
 */
export function replaceWindingRange(
  record: WindingRecord,
  start: number,
  deleteCount: number,
  turns: WindingRecord,
): WindingValidationResult<WindingRecord> {
  if (!Number.isInteger(start) || start < 0 || start > record.length) {
    return { ok: false, reason: `startが記録範囲外です: ${start}(記録長${record.length})` };
  }
  if (!Number.isInteger(deleteCount) || deleteCount < 0 || start + deleteCount > record.length) {
    return { ok: false, reason: `deleteCountが記録範囲外です: ${deleteCount}(start=${start}, 記録長${record.length})` };
  }
  const replacement = validateWindingRecord(turns);
  if (!replacement.ok) return { ok: false, reason: `置換区間: ${replacement.reason}` };

  const next = [...record.slice(0, start), ...replacement.value.map((turn) => ({ ...turn })), ...record.slice(start + deleteCount)];
  if (next.length > MAX_WINDING_TURNS) {
    return { ok: false, reason: `置換後の記録が上限${MAX_WINDING_TURNS}ターンを超えます: ${next.length}` };
  }
  return { ok: true, value: next };
}

// ---------------------------------------------------------------------------
// P4-1A(2026-08-28人間承認): canonical encoding(候補E2)。
//
// **同じ巻線記録は常に同じ文字列になり、decode後の再encodeも同じ文字列になる**ことを
// 保証する。レシピ文字列(MC4)とrecipeKey v2がこの正規形をそのまま収載する——hash・要約・
// 圧縮は使わない(衝突しうる代替を正規形にすると、別の記録が同一レシピと見なされる)。
//
// **1ターン=3バイト固定(big-endian)**の24bit word:
//   bit23..15 = positionQ (0..256)   position × 256
//   bit14..6  = tensionQ  (0..256)   tension  × 256
//   bit5..4   = arm       (left=0 / right=1 / straddle=2、3は不正)
//   bit3      = direction (+1 → 0 / -1 → 1)
//   bit2..0   = 0 固定(非0は破損)
// ターン順は記録順。ビット詰め(1ターン=21bit連続)より14%長いが、**ターン境界がバイト境界と
// 一致するため破損位置をターン単位で特定できる**。
// ---------------------------------------------------------------------------

/** 1ターンあたりのバイト数(E2固定長)。 */
export const WINDING_ENCODED_BYTES_PER_TURN = 3;

const ARM_TO_CODE: Record<WindingArm, number> = { left: 0, right: 1, straddle: 2 };
const CODE_TO_ARM: readonly (WindingArm | null)[] = ['left', 'right', 'straddle', null];

/** 量子化値(0〜1、1/256格子)を整数0..256へ。呼出し前に量子化済みであること。 */
function toQuantizedInt(value: number): number {
  return Math.round(value * 256);
}

/**
 * 記録をcanonicalなバイト列へ符号化する。**検証済みの記録だけを渡すこと**——
 * 未量子化値や不正armが混じった記録を符号化すると、decodeできない文字列ができる。
 * 呼出し側は`validateWindingRecord`を通した値を渡す(型では強制できないためコメントで契約化)。
 */
export function encodeWindingRecordBytes(record: WindingRecord): Uint8Array {
  const bytes = new Uint8Array(record.length * WINDING_ENCODED_BYTES_PER_TURN);
  record.forEach((turn, index) => {
    const positionQ = toQuantizedInt(turn.position);
    const tensionQ = toQuantizedInt(turn.tension);
    const armCode = ARM_TO_CODE[turn.arm];
    const directionCode = turn.direction === -1 ? 1 : 0;
    const word = (positionQ << 15) | (tensionQ << 6) | (armCode << 4) | (directionCode << 3);
    const offset = index * WINDING_ENCODED_BYTES_PER_TURN;
    bytes[offset] = (word >>> 16) & 0xff;
    bytes[offset + 1] = (word >>> 8) & 0xff;
    bytes[offset + 2] = word & 0xff;
  });
  return bytes;
}

/**
 * バイト列を記録へ復号する。**fail-closed**——padビットが0でない、armが3、量子化整数が
 * 256を超える、長さが3の倍数でない、いずれも`{ok:false}`で返す。部分復元はしない。
 */
export function decodeWindingRecordBytes(bytes: Uint8Array): WindingValidationResult<WindingRecord> {
  if (bytes.length % WINDING_ENCODED_BYTES_PER_TURN !== 0) {
    return { ok: false, reason: `バイト長が${WINDING_ENCODED_BYTES_PER_TURN}の倍数ではありません: ${bytes.length}` };
  }
  const turnCount = bytes.length / WINDING_ENCODED_BYTES_PER_TURN;
  if (turnCount > MAX_WINDING_TURNS) {
    return { ok: false, reason: `記録が上限${MAX_WINDING_TURNS}ターンを超えています: ${turnCount}` };
  }
  const turns: WindingTurn[] = [];
  for (let index = 0; index < turnCount; index += 1) {
    const offset = index * WINDING_ENCODED_BYTES_PER_TURN;
    const word = (bytes[offset]! << 16) | (bytes[offset + 1]! << 8) | bytes[offset + 2]!;
    if ((word & 0b111) !== 0) return { ok: false, reason: `turns[${index}]: padビットが0ではありません` };
    const positionQ = (word >>> 15) & 0x1ff;
    const tensionQ = (word >>> 6) & 0x1ff;
    if (positionQ > 256) return { ok: false, reason: `turns[${index}]: positionQが256を超えています: ${positionQ}` };
    if (tensionQ > 256) return { ok: false, reason: `turns[${index}]: tensionQが256を超えています: ${tensionQ}` };
    const arm = CODE_TO_ARM[(word >>> 4) & 0b11];
    if (arm === null) return { ok: false, reason: `turns[${index}]: armコードが不正です(3)` };
    turns.push({
      position: positionQ / 256,
      arm,
      direction: ((word >>> 3) & 0b1) === 1 ? -1 : 1,
      tension: tensionQ / 256,
    });
  }
  return { ok: true, value: turns };
}

/**
 * canonicalバイト列をbase64url(padなし)の文字列にする。**レシピ文字列とrecipeKeyが
 * 共有する唯一の正規形**であり、hash・要約・圧縮ではない(可逆であり、衝突しない)。
 */
export function encodeWindingRecordCanonical(record: WindingRecord): string {
  const bytes = encodeWindingRecordBytes(record);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

/**
 * canonical文字列を記録へ戻す。**fail-closed**——base64url以外の文字、復号不能、
 * バイト列としての破損(pad非0・arm=3・量子化整数>256・長さ不一致)はすべて`{ok:false}`。
 */
export function decodeWindingRecordCanonical(value: string): WindingValidationResult<WindingRecord> {
  if (value.length === 0) return { ok: true, value: [] };
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    return { ok: false, reason: '巻線記録に使用できない文字が含まれています' };
  }
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  let bytes: Uint8Array;
  try {
    const binary = atob(base64);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return { ok: false, reason: '巻線記録を復号できません' };
  }
  return decodeWindingRecordBytes(bytes);
}
