// docs/phase1-plan.md §5.4/Unit E: 色演算許可リスト(加算合成・50%平均合成)と
// 市松ディザの効果を比較する3試作(発光・煙・夕景)。演算あり/なし/ディザの3系統を
// 同一データから生成する。座標はart-spec §2.2の整数ピクセル規律に従いすべて整数。
import { PALETTE } from '../../retro/palette';
import { blend50Average, blendAdditive, isDitherOn } from '../../retro/colorOps/blend';

export interface Cell {
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
  color: string;
}

export interface SceneComparison {
  withOperation: Cell[];
  withoutOperation: Cell[];
  dither: Cell[];
}

function buildDitherCells(originX: number, originY: number, sizePx: number, baseColor: string, overlayColor: string): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < sizePx; y++) {
    for (let x = 0; x < sizePx; x++) {
      cells.push({
        x: originX + x,
        y: originY + y,
        widthPx: 1,
        heightPx: 1,
        color: isDitherOn(x, y) ? overlayColor : baseColor,
      });
    }
  }
  return cells;
}

// 発光(火花コア・ヘッドライト・CRTにじみ相当): 加算合成で重ね描きするほど明るくなる
// ことを示す。3つの光点を段階的に重ね、withOperationでは加算合成、
// withoutOperationでは単純な不透明色の重ね塗り(変化なし)として対比する。
const GLOW_BG = PALETTE.N0;
const GLOW_SPARK = PALETTE.Y1;
const GLOW_LAYERS = 3;
const GLOW_SWATCH_SIZE = 14;

export function buildGlowComparison(originX: number, originY: number): SceneComparison {
  const withOperation: Cell[] = [];
  const withoutOperation: Cell[] = [];
  let accumulated: string = GLOW_BG;

  for (let i = 0; i < GLOW_LAYERS; i++) {
    accumulated = blendAdditive(accumulated, GLOW_SPARK);
    const x = originX + i * (GLOW_SWATCH_SIZE + 2);
    withOperation.push({ x, y: originY, widthPx: GLOW_SWATCH_SIZE, heightPx: GLOW_SWATCH_SIZE, color: accumulated });
    withoutOperation.push({ x, y: originY, widthPx: GLOW_SWATCH_SIZE, heightPx: GLOW_SWATCH_SIZE, color: GLOW_SPARK });
  }

  const ditherX = originX;
  const ditherY = originY + GLOW_SWATCH_SIZE + 4;
  const dither = buildDitherCells(ditherX, ditherY, GLOW_SWATCH_SIZE, GLOW_BG, GLOW_SPARK);

  return { withOperation, withoutOperation, dither };
}

// 煙(D02段階の希薄化): 白→灰→黒への段階遷移を、地色に対する50%平均合成の
// 重ね回数で表現する(art-spec §6破壊演出「煙(D02段階): 白N5→灰N3→黒N1」)。
const SMOKE_GROUND = PALETTE.B0;
const SMOKE_PUFF = PALETTE.N5;
const SMOKE_LAYERS = 3;
const SMOKE_SWATCH_SIZE = 14;

export function buildSmokeComparison(originX: number, originY: number): SceneComparison {
  const withOperation: Cell[] = [];
  const withoutOperation: Cell[] = [];
  let accumulated: string = SMOKE_GROUND;

  for (let i = 0; i < SMOKE_LAYERS; i++) {
    accumulated = blend50Average(accumulated, SMOKE_PUFF);
    const x = originX + i * (SMOKE_SWATCH_SIZE + 2);
    withOperation.push({ x, y: originY, widthPx: SMOKE_SWATCH_SIZE, heightPx: SMOKE_SWATCH_SIZE, color: accumulated });
    withoutOperation.push({ x, y: originY, widthPx: SMOKE_SWATCH_SIZE, heightPx: SMOKE_SWATCH_SIZE, color: SMOKE_PUFF });
  }

  const ditherX = originX;
  const ditherY = originY + SMOKE_SWATCH_SIZE + 4;
  const dither = buildDitherCells(ditherX, ditherY, SMOKE_SWATCH_SIZE, SMOKE_GROUND, SMOKE_PUFF);

  return { withOperation, withoutOperation, dither };
}

// 夕景(遠景レイヤへの空気遠近、一律50%合成): 空色(B系)に夕焼け色(S系)を
// 50%平均合成で重ね、遠景の色を昼→夕方へ寄せる効果を示す。
const SUNSET_SKY = PALETTE.B1;
const SUNSET_TINT = PALETTE.S2;
const SUNSET_LAYERS = 3;
const SUNSET_SWATCH_SIZE = 14;

export function buildSunsetComparison(originX: number, originY: number): SceneComparison {
  const withOperation: Cell[] = [];
  const withoutOperation: Cell[] = [];
  let accumulated: string = SUNSET_SKY;

  for (let i = 0; i < SUNSET_LAYERS; i++) {
    accumulated = blend50Average(accumulated, SUNSET_TINT);
    const x = originX + i * (SUNSET_SWATCH_SIZE + 2);
    withOperation.push({ x, y: originY, widthPx: SUNSET_SWATCH_SIZE, heightPx: SUNSET_SWATCH_SIZE, color: accumulated });
    withoutOperation.push({ x, y: originY, widthPx: SUNSET_SWATCH_SIZE, heightPx: SUNSET_SWATCH_SIZE, color: SUNSET_TINT });
  }

  const ditherX = originX;
  const ditherY = originY + SUNSET_SWATCH_SIZE + 4;
  const dither = buildDitherCells(ditherX, ditherY, SUNSET_SWATCH_SIZE, SUNSET_SKY, SUNSET_TINT);

  return { withOperation, withoutOperation, dither };
}
