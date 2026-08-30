// PHASE1-UNITD-REVIEW追加指摘: art-spec §2.2(整数ピクセル規律)に適合させるため、
// 乱巻き軌跡の座標算出をdrawWindingTrace.ts(canvas依存)から分離した純関数。
// 曲線(quadraticCurveTo)の始点・制御点・終点も含め、返り値をすべて整数化する
// (静止画・曲線描画も例外にしない、Suu判断)。
import type { WindingTurn } from '../../materials/windingRecord';

const ARM_OFFSET_RATIO = 0.018;

// Task#WINDING-AGE-RADIUS(Suu承認): 新旧ターンの明度差(recent: M2明色/M1暗色)が
// 色分けとしては実装済みでも、全ターンが同じ上下の包絡(topY/bottomY固定)を通るため
// 空間的にほぼ完全に重なり、後から描かれる新しいターン(M2)が古いターン(M1)を
// ほとんどの領域で覆い隠してしまう問題があった。armOffset(x方向、arm='left'/'right'/
// 'straddle'の左右偏り)を古さで変えると左右バランス表現が壊れるため使わず、
// 半径方向(stripY中心からcontrolY/startY・endYまでの上下距離)をターンindexに応じて
// 連続的・単調に拡大する(古いターン=内層・小さい包絡、新しいターン=外層・現行最大
// 包絡)。position/tension由来のcx・wobble(x方向の乱れ)は無変更のため、整然とした
// 同心円にはならず、右巻き/左巻きの乱雑さは維持される。
// WINDING_INNER_RADIUS_RATIO=0.4は「最古のターンでも内層として十分視認できる大きさ」
// を確保しつつ(0だと点に潰れる)、最新のターン(i=n-1)では厳密に1.0倍=現行の最大
// 包絡(topY/bottomYそのもの)に一致させ、既存の外形を超えないようにする値。
const WINDING_INNER_RADIUS_RATIO = 0.4;

/**
 * 輪郭を刻む区間数。短冊を横に等分し、各区間へ落ちたターン数で厚みを決める。
 * 480px幅なら1区間15pxで、隣接ターン間隔(実測で中央値10px前後)より粗く、
 * 手癖の偏りが「山」として見える粒度になる。
 */
const OUTLINE_BUCKET_COUNT = 32;

/**
 * 膨らみの誇張倍率(art-spec第一条3「実寸比の約3倍」)。**第一試作の初期値**であり、
 * 最終値はU2視認試遊で決める。実値ではなく読み取りやすさのための誇張である。
 *
 * 効かせ方は`computeWindingOutlineThicknessRatios`のとおり「**平均からの偏差**を倍する」。
 * 密度そのものを倍すると最大値で頭打ちになり、倍率を変えても絵が変わらない。
 */
export const WINDING_OUTLINE_EXAGGERATION = 3;

/** 輪郭の最小厚み比。ターンが1本も無い区間でも軸が消えないように芯を残す。 */
const OUTLINE_MIN_THICKNESS_RATIO = 0.12;

/**
 * 区間ごとのターン数から、0〜1の厚み比を作る。
 *
 * **平均密度を1として、そこからの偏差を`exaggeration`倍する**。art-spec第一条3の
 * 「実寸比の約3倍で誇張」は「厚みそのものを3倍する」ではない——密度を直接倍すると
 * 最大値でクランプされて頭打ちになり、倍率を上げても絵が変わらなくなる。
 * 偏差を倍せば、均一な巻きは平らのまま、偏った巻きだけが強く凸凹する。
 *
 * 最後に最大値で正規化するので、**倍率をいくつにしても最大包絡は超えない**。
 * 乱数・平滑化・補間は入れない(記録に無い凹凸を作らない)。
 */
export function computeWindingOutlineThicknessRatios(
  counts: readonly number[],
  exaggeration: number = WINDING_OUTLINE_EXAGGERATION,
): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0 || counts.length === 0) return counts.map(() => 0);
  const mean = total / counts.length;
  // 平均で1、密集で1超、空きで1未満。偏差を倍してから負を切り落とす。
  const raw = counts.map((count) => Math.max(0, 1 + (count / mean - 1) * exaggeration));
  const peak = Math.max(...raw);
  // 全区間が平均どおり(=偏差0)なら peak は1で、比はすべて1(平ら)になる。
  return peak > 0 ? raw.map((value) => value / peak) : raw.map(() => 0);
}

export interface IntRect {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
}

/**
 * 年代の階調段数(M0〜M3の4段)。art-spec §5.3「新しいターンほど手前(明色)、古いターンは
 * 1段暗色に沈める」の規則は変えず、段数だけ2段から4段へ広げた有限差分(人間承認済み)。
 * 2段では30本が重なると層の前後が潰れ、巻いた順序と重なりの深さが読めなかった。
 */
export const WINDING_AGE_STEPS = 4;

/** 年代の階調。0=最古(最も暗い層)、3=最新(最も明るい層)。 */
export type WindingAgeStep = 0 | 1 | 2 | 3;

export interface TurnStroke {
  /** 0=最古〜3=最新。indexに対し単調非減少(古い層→新しい層)。 */
  ageStep: WindingAgeStep;
  startX: number;
  startY: number;
  controlX: number;
  controlY: number;
  endX: number;
  endY: number;
}

/**
 * 巻線治具の「いまの保持状態」。**記録からは導けない**——記録が空のときも、turn確定の
 * 合間も、導線ガイドはどこかに居て張力を保っているが、それは確定済みターンの列には
 * 現れない。そのため描画側へ明示的に渡す(art-spec §5.3 r3)。
 *
 * 単一出典は`WindingInputState`(入力3案が収束する唯一のstate)。ここで既定値を作らず、
 * 渡されなければ治具を描かない——未入力なのに中立位置の治具が見えると嘘になる。
 */
export type WindingJigState = Pick<WindingTurn, 'position' | 'arm' | 'tension' | 'direction'>;

/**
 * 治具の座標。段ボール板・導線ガイド・輪ゴム・正転逆転スイッチだけを持つ。
 * 良否・推奨・目盛りは持たない(数値も評価語も出さない)。
 */
export interface WindingJigGeometry {
  /** 段ボールの治具板。短冊の下に敷く。 */
  boardRect: IntRect;
  /** 板に開いた導線ガイドのスロット3つ(左腕/中央/右腕)。縁がposition 1/3・2/3に当たる。 */
  slotRects: IntRect[];
  /** いまガイドが居るスロットのindex(0=左腕, 1=中央, 2=右腕)。 */
  activeSlotIndex: number;
  /** 導線ガイドそのもの(木の駒)。xは現在のpositionに追従する。 */
  guideRect: IntRect;
  /** 輪ゴム。張力が高いほど短く張る。 */
  rubberBandRect: IntRect;
  /** 正転/逆転スイッチのレバー。倒れる向きがdirectionを表す。 */
  switchBaseRect: IntRect;
  switchLeverRect: IntRect;
}

/**
 * P4-1B B3(2026-08-30人間承認): 外形輪郭の1点。art-spec第一条3
 * 「**コイルの膨らみは実寸比の約3倍で誇張。乱巻きは輪郭の凸凹で表現**」の実装。
 *
 * 4段積層は「どのターンが手前か」を示すが、**どこが厚いか**は示さない。輪郭は
 * 位置ヒストグラムの粗密をそのまま外形の凸凹に写すので、密集は外へ、空きは内へ凹む。
 * 良否は言わない——形が出るだけで、どこを直すかはプレイヤーが決める。
 */
export interface WindingOutlinePoint {
  readonly x: number;
  /** 短冊中心から上側の輪郭y。 */
  readonly topY: number;
  /** 短冊中心から下側の輪郭y。上下対称。 */
  readonly bottomY: number;
}

/** 中央またぎ(渡り線)の1本。軸を横切る形で示し、色に頼らず判別できるようにする。 */
export interface WindingCrossoverSegment {
  readonly startX: number;
  readonly endX: number;
  readonly y: number;
}

export interface WindingTraceGeometry {
  stripRect: IntRect;
  axisRect: IntRect;
  strokes: TurnStroke[];
  /** 外形輪郭(左端→右端)。記録が空なら空配列。 */
  outline: WindingOutlinePoint[];
  /** 中央またぎのターンから作る渡り線。straddleが無ければ空配列。 */
  crossovers: WindingCrossoverSegment[];
  /** `jig`を渡さない呼び出しでは**存在しない**。既存の絵は1pxも変わらない。 */
  jig?: WindingJigGeometry;
}

// ターンindex(0始まり)における半径方向包絡のスケール(WINDING_INNER_RADIUS_RATIO〜1.0、
// index増加に対し単調非減少)。totalTurns<=1のときは1(該当ターンが最新かつ最古を兼ねる)。
export function computeWindingEnvelopeScale(index: number, totalTurns: number): number {
  if (totalTurns <= 1) return 1;
  const t = index / (totalTurns - 1);
  return WINDING_INNER_RADIUS_RATIO + (1 - WINDING_INNER_RADIUS_RATIO) * t;
}

/**
 * ターンindex(0始まり)の年代階調。`totalTurns<=1`のときは最新(3)を返す——
 * 唯一のターンは最古かつ最新であり、最も手前に積まれている。
 */
export function computeWindingAgeStep(index: number, totalTurns: number): WindingAgeStep {
  if (totalTurns <= 1) return 3;
  const t = index / (totalTurns - 1);
  // 0..1を4段へ。t=1がちょうど段数に一致してしまうのでMath.minで最終段へ丸める。
  return Math.min(WINDING_AGE_STEPS - 1, Math.floor(t * WINDING_AGE_STEPS)) as WindingAgeStep;
}

/** 治具板の上端(content高さ比)と厚み。短冊より下、画面下端より上に収める。 */
const JIG_BOARD_TOP_RATIO = 0.8;
const JIG_BOARD_HEIGHT_RATIO = 0.16;

/** スロットの数。左腕/中央/右腕の3つ(`resolveGuideFromX`の1/3・2/3境界に対応)。 */
const JIG_SLOT_COUNT = 3;

/** 輪ゴムの伸び。張力1で最短、張力0で最長。 */
const JIG_RUBBER_MIN_RATIO = 0.02;
const JIG_RUBBER_MAX_RATIO = 0.1;

/**
 * 治具の座標を作る。**記録は見ない**——ここが描くのは「いまの保持状態」だけで、
 * 巻き終えた軌跡の形には一切関与しない(責務が混ざると出典が二重化する)。
 */
function computeWindingJigGeometry(
  jig: WindingJigState,
  contentWidthPx: number,
  contentHeightPx: number,
): WindingJigGeometry {
  const w = contentWidthPx;
  const h = contentHeightPx;
  const boardY = Math.round(h * JIG_BOARD_TOP_RATIO);
  const boardHeight = Math.max(4, Math.round(h * JIG_BOARD_HEIGHT_RATIO));
  const boardRect: IntRect = { x: 0, y: boardY, widthPx: Math.round(w), heightPx: boardHeight };

  // スロットは板を3等分した位置に開ける。縁がそのままposition 1/3・2/3になるので、
  // 目盛りを引かなくても左腕/中央/右腕の境目が絵に出る。
  const slotMargin = Math.max(1, Math.round(w * 0.01));
  const slotHeight = Math.max(2, Math.round(boardHeight * 0.35));
  const slotY = boardY + Math.round((boardHeight - slotHeight) / 2);
  const slotRects: IntRect[] = Array.from({ length: JIG_SLOT_COUNT }, (_, i) => {
    const left = Math.round((w * i) / JIG_SLOT_COUNT);
    const right = Math.round((w * (i + 1)) / JIG_SLOT_COUNT);
    return { x: left + slotMargin, y: slotY, widthPx: right - left - slotMargin * 2, heightPx: slotHeight };
  });
  const activeSlotIndex = jig.arm === 'left' ? 0 : jig.arm === 'right' ? 2 : 1;

  // 導線ガイドの駒。positionにそのまま追従する(0..1 → 板の左端..右端)。
  // 駒は板の上を滑る実体なので、両端では板からはみ出さない位置で止まる。
  const guideWidth = Math.max(3, Math.round(w * 0.016));
  const guideHeight = slotHeight + Math.max(2, Math.round(boardHeight * 0.3));
  const guideHalf = Math.round(guideWidth / 2);
  const guideCenterX = Math.min(w - guideWidth + guideHalf, Math.max(guideHalf, Math.round(jig.position * w)));
  const guideRect: IntRect = {
    x: guideCenterX - Math.round(guideWidth / 2),
    y: slotY - Math.round((guideHeight - slotHeight) / 2),
    widthPx: guideWidth,
    heightPx: guideHeight,
  };

  // 輪ゴム: 短冊とガイドの間に渡す。張力が高いほど短く張り、低いほど伸びてたるむ。
  const rubberSpan = JIG_RUBBER_MIN_RATIO + (JIG_RUBBER_MAX_RATIO - JIG_RUBBER_MIN_RATIO) * (1 - jig.tension);
  const rubberHeight = Math.max(1, Math.round(h * rubberSpan));
  const rubberRect: IntRect = {
    x: Math.min(w - 2, Math.max(0, guideCenterX - 1)),
    y: Math.max(0, guideRect.y - rubberHeight),
    widthPx: 2,
    heightPx: rubberHeight,
  };

  // 正転/逆転スイッチ: 板の右端に置き、レバーの倒れる向きでdirectionを示す。
  const switchWidth = Math.max(6, Math.round(w * 0.05));
  const switchHeight = Math.max(3, Math.round(boardHeight * 0.3));
  const switchX = Math.round(w - switchWidth - slotMargin);
  const switchY = boardY + boardHeight - switchHeight - 1;
  const switchBaseRect: IntRect = { x: switchX, y: switchY, widthPx: switchWidth, heightPx: switchHeight };
  const leverWidth = Math.max(2, Math.round(switchWidth / 2));
  const switchLeverRect: IntRect = {
    // 正転は右へ、逆転は左へ倒す。座標そのものが向きを表すので色に頼らない。
    x: jig.direction === 1 ? switchX + switchWidth - leverWidth : switchX,
    y: switchY,
    widthPx: leverWidth,
    heightPx: switchHeight,
  };

  return { boardRect, slotRects, activeSlotIndex, guideRect, rubberBandRect: rubberRect, switchBaseRect, switchLeverRect };
}

export function computeWindingTraceGeometry(
  turns: readonly WindingTurn[],
  contentWidthPx: number,
  contentHeightPx: number,
  jig?: WindingJigState,
): WindingTraceGeometry {
  const w = contentWidthPx;
  const h = contentHeightPx;

  const stripHeight = Math.max(2, Math.round(h * 0.05));
  const stripY = Math.round(h * 0.5);
  const stripRect: IntRect = {
    x: 0,
    y: Math.round(stripY - stripHeight / 2),
    widthPx: Math.round(w),
    heightPx: stripHeight,
  };

  const axisX = Math.round(w / 2);
  const axisTop = Math.round(h * 0.1);
  const axisBottom = Math.round(h * 0.9);
  const axisRect: IntRect = {
    x: axisX - 1,
    y: axisTop,
    widthPx: 2,
    heightPx: axisBottom - axisTop,
  };

  const maxRadius = stripY - Math.round(h * 0.12); // 現行の最大包絡(旧topY基準の半径)
  const n = turns.length;

  const strokes: TurnStroke[] = turns.map((turn, i) => {
    const cx = Math.round(turn.position * w);
    const wobble = Math.round((1 - turn.tension) * w * 0.05);
    const armOffset = Math.round(
      turn.arm === 'left' ? -w * ARM_OFFSET_RATIO : turn.arm === 'right' ? w * ARM_OFFSET_RATIO : 0,
    );
    const radius = Math.round(maxRadius * computeWindingEnvelopeScale(i, n));
    const startY = stripY + radius;
    const controlY = stripY - radius;
    const endY = stripY + radius;

    return {
      ageStep: computeWindingAgeStep(i, n),
      startX: cx - wobble + armOffset,
      startY,
      controlX: cx + armOffset,
      controlY,
      endX: cx + wobble + armOffset,
      endY,
    };
  });

  const outline = computeWindingOutline(turns, w, stripY, maxRadius);
  const crossovers = computeWindingCrossovers(turns, w, stripY, maxRadius, n);

  return jig === undefined
    ? { stripRect, axisRect, strokes, outline, crossovers }
    : { stripRect, axisRect, strokes, outline, crossovers, jig: computeWindingJigGeometry(jig, w, h) };
}

/**
 * 外形輪郭。位置ヒストグラムの粗密を上下対称の包絡へ写す。
 *
 * **記録に無い凹凸を作らない**——各区間の厚みはその区間へ落ちたターン数だけで決まり、
 * 平滑化も補間も乱数も入れない。空記録では空配列を返す(存在しない輪郭を描かない)。
 */
function computeWindingOutline(
  turns: readonly WindingTurn[],
  w: number,
  stripY: number,
  maxRadius: number,
): WindingOutlinePoint[] {
  if (turns.length === 0) return [];

  const counts = new Array<number>(OUTLINE_BUCKET_COUNT).fill(0);
  for (const turn of turns) {
    const index = Math.min(OUTLINE_BUCKET_COUNT - 1, Math.floor(turn.position * OUTLINE_BUCKET_COUNT));
    counts[index] += 1;
  }
  const ratios = computeWindingOutlineThicknessRatios(counts);
  const minThickness = maxRadius * OUTLINE_MIN_THICKNESS_RATIO;
  const span = maxRadius - minThickness;

  return ratios.map((ratio, index) => {
    const thickness = Math.round(minThickness + span * ratio);
    return {
      x: Math.round((w * (index + 0.5)) / OUTLINE_BUCKET_COUNT),
      topY: stripY - thickness,
      bottomY: stripY + thickness,
    };
  });
}

/**
 * 中央またぎの渡り線。**軸を横切る水平線**として描くための座標を返す。
 * arm='straddle'のターンだけが対象で、色ではなく形で判別できるようにする
 * (art-spec §5.3「逆巻きは色で区別しない」と同じ態度)。
 */
function computeWindingCrossovers(
  turns: readonly WindingTurn[],
  w: number,
  stripY: number,
  maxRadius: number,
  totalTurns: number,
): WindingCrossoverSegment[] {
  const half = Math.max(2, Math.round(w * ARM_OFFSET_RATIO * 2));
  const segments: WindingCrossoverSegment[] = [];
  turns.forEach((turn, i) => {
    if (turn.arm !== 'straddle') return;
    const cx = Math.round(turn.position * w);
    // 年代と同じ半径方向の位置に置く。渡り線が軌跡と別の層に浮かないようにする。
    const radius = Math.round(maxRadius * computeWindingEnvelopeScale(i, totalTurns));
    segments.push({ startX: cx - half, endX: cx + half, y: stripY - radius });
  });
  return segments;
}
