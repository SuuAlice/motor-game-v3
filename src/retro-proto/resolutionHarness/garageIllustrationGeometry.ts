// spec §5.4: ガレージ拠点はクリッカブルな一枚絵(机・棚・カタログ・本棚・ドア・ラジオ)。
// PHASE1-UNITD-REVIEW追加指摘: art-spec §2.2(整数ピクセル規律)に適合させるため、
// 図形の座標算出をdrawGarageIllustration.ts(canvas依存)から分離した純関数。
// 色はPALETTE参照の文字列であり座標ではないため、そのまま各図形へ含める。
//
// Task#GARAGE-DENSITY(Suu承認): art-spec §5.4のハブ構成(机・棚・カタログ・本棚・
// ドア・ラジオ)のうちカタログ・ラジオが未実装、§5.3が求める素朴な素材感(段ボールの
// 断面・爪楊枝の木肌・釘の頭)・接地影も未実装だったため追加する。要素にはすべて
// semanticなelementIdを付与し、test側で「意味のある要素が存在するか」を厳密に
// 識別できるようにする(shape数やrect存在だけでは実装済みと判定しない)。
// 画像アセット・RGB直値・任意alpha・新規依存は使わず、既存PALETTE参照+整数座標の
// 手続き図形のみで構成する。
import { PALETTE } from '../../retro/palette';

export type GarageElementId =
  | 'wall'
  | 'floor'
  | 'floorGrain'
  | 'shadow'
  | 'desk'
  | 'deskLegLeft'
  | 'deskLegRight'
  | 'shelf'
  | 'shelfDivider'
  | 'shelfPart'
  | 'bookshelf'
  | 'bookSpine'
  | 'door'
  | 'doorknob'
  | 'catalogStand'
  | 'catalogPage'
  | 'catalogLine'
  | 'radioBody'
  | 'radioDial'
  | 'radioAntenna'
  | 'canonicalCarBase'
  | 'cardboardRib'
  | 'toothpickAxle'
  | 'canonicalCarWheel'
  | 'nailHead';

export interface GarageRect {
  kind: 'rect';
  elementId: GarageElementId;
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
  color: string;
}

export interface GarageCircle {
  kind: 'circle';
  elementId: GarageElementId;
  cx: number;
  cy: number;
  radiusPx: number;
  color: string;
}

export type GarageShape = GarageRect | GarageCircle;

function rect(elementId: GarageElementId, x: number, y: number, widthPx: number, heightPx: number, color: string): GarageRect {
  return {
    kind: 'rect',
    elementId,
    x: Math.round(x),
    y: Math.round(y),
    widthPx: Math.max(1, Math.round(widthPx)),
    heightPx: Math.max(1, Math.round(heightPx)),
    color,
  };
}

function circle(elementId: GarageElementId, cx: number, cy: number, radiusPx: number, color: string): GarageCircle {
  return {
    kind: 'circle',
    elementId,
    cx: Math.round(cx),
    cy: Math.round(cy),
    radiusPx: Math.max(1, Math.round(radiusPx)),
    color,
  };
}

// 対象物より先(=描画上は背面)にshapesへ積む接地影。W3(明色)は影に不適切なため
// W0(暗色の木調)を使う。対象物のx・widthPxをそのまま踏襲し、対象物の下端に薄く敷く。
function pushShadow(shapes: GarageShape[], x: number, bottomY: number, widthPx: number, h: number): void {
  const shadowHeight = Math.max(1, h * 0.02);
  shapes.push(rect('shadow', x, bottomY - shadowHeight / 2, widthPx, shadowHeight, PALETTE.W0));
}

export function computeGarageIllustrationGeometry(contentWidthPx: number, contentHeightPx: number): GarageShape[] {
  const w = contentWidthPx;
  const h = contentHeightPx;
  const shapes: GarageShape[] = [];

  // 壁
  shapes.push(rect('wall', 0, 0, w, h * 0.72, PALETTE.N6));

  // 床(木目、W2/W3のランプで簡易的に段を付ける)
  shapes.push(rect('floor', 0, h * 0.72, w, h * 0.28, PALETTE.W2));
  const grainStep = Math.max(4, Math.round(w * 0.08));
  for (let x = 0; x < w; x += grainStep) {
    shapes.push(rect('floorGrain', x, h * 0.72, w * 0.01, h * 0.28, PALETTE.W3));
  }

  // 机(左)
  const deskX = w * 0.06;
  const deskY = h * 0.5;
  const deskW = w * 0.28;
  const deskH = h * 0.22;
  pushShadow(shapes, deskX, deskY + deskH, deskW, h);
  shapes.push(rect('desk', deskX, deskY, deskW, deskH * 0.18, PALETTE.M1));
  shapes.push(rect('deskLegLeft', deskX + deskW * 0.06, deskY + deskH * 0.18, deskW * 0.1, deskH * 0.82, PALETTE.M0));
  shapes.push(rect('deskLegRight', deskX + deskW * 0.84, deskY + deskH * 0.18, deskW * 0.1, deskH * 0.82, PALETTE.M0));

  // 棚(中央、在庫)
  const shelfX = w * 0.4;
  const shelfY = h * 0.16;
  const shelfW = w * 0.2;
  const shelfH = h * 0.5;
  pushShadow(shapes, shelfX, shelfY + shelfH, shelfW, h);
  shapes.push(rect('shelf', shelfX, shelfY, shelfW, shelfH, PALETTE.W1));
  for (let i = 1; i < 4; i++) {
    shapes.push(rect('shelfDivider', shelfX, shelfY + (shelfH / 4) * i, shelfW, h * 0.01, PALETTE.N4));
  }
  const partColors = [PALETTE.R1, PALETTE.B1, PALETTE.G1, PALETTE.Y1];
  partColors.forEach((color, i) => {
    shapes.push(
      rect('shelfPart', shelfX + shelfW * 0.15, shelfY + (shelfH / 4) * i + shelfH * 0.05, shelfW * 0.7, shelfH * 0.12, color),
    );
  });

  // ラジオ(棚の天板の上、設定入口)
  const radioW = shelfW * 0.4;
  const radioH = h * 0.06;
  const radioX = shelfX + shelfW * 0.3;
  const radioY = shelfY - radioH;
  shapes.push(rect('radioBody', radioX, radioY, radioW, radioH, PALETTE.M0));
  shapes.push(circle('radioDial', radioX + radioW * 0.25, radioY + radioH * 0.5, radioH * 0.3, PALETTE.N4));
  shapes.push(rect('radioAntenna', radioX + radioW * 0.75, radioY - radioH * 0.8, w * 0.004, radioH * 0.8, PALETTE.N3));

  // 本棚(右、失敗図鑑・実験ノート)
  const bookX = w * 0.68;
  const bookY = h * 0.1;
  const bookW = w * 0.14;
  const bookH = h * 0.56;
  pushShadow(shapes, bookX, bookY + bookH, bookW, h);
  shapes.push(rect('bookshelf', bookX, bookY, bookW, bookH, PALETTE.M0));
  const spineColors = [PALETTE.R0, PALETTE.B0, PALETTE.G0, PALETTE.P0, PALETTE.Y0];
  spineColors.forEach((color, i) => {
    shapes.push(
      rect(
        'bookSpine',
        bookX + (bookW / spineColors.length) * i,
        bookY + bookH * 0.08,
        bookW / spineColors.length - 1,
        bookH * 0.84,
        color,
      ),
    );
  });

  // カタログ(棚と本棚の間の隙間、専用スタンド上の開いたカタログ、ショップ入口)。
  // 隙間(shelf右端〜bookshelf左端)から直接寸法を導出し、他家具と重ならないようにする。
  const catalogGapStart = shelfX + shelfW;
  const catalogGapEnd = bookX;
  const catalogGapWidth = catalogGapEnd - catalogGapStart;
  const catalogMargin = catalogGapWidth * 0.1;
  const catalogStandW = catalogGapWidth * 0.2;
  const catalogPageW = catalogGapWidth * 0.32;
  const catalogStandX = catalogGapStart + catalogGapWidth / 2 - catalogStandW / 2;
  const catalogStandY = h * 0.5;
  const catalogStandH = h * 0.22;
  pushShadow(shapes, catalogGapStart + catalogMargin, catalogStandY + catalogStandH, catalogGapWidth - catalogMargin * 2, h);
  shapes.push(rect('catalogStand', catalogStandX, catalogStandY, catalogStandW, catalogStandH, PALETTE.M0));
  const catalogPageY = catalogStandY - h * 0.1;
  const catalogPageH = h * 0.1;
  const catalogLeftPageX = catalogGapStart + catalogMargin;
  const catalogRightPageX = catalogGapEnd - catalogMargin - catalogPageW;
  shapes.push(rect('catalogPage', catalogLeftPageX, catalogPageY, catalogPageW, catalogPageH, PALETTE.N7));
  shapes.push(rect('catalogPage', catalogRightPageX, catalogPageY, catalogPageW, catalogPageH, PALETTE.N7));
  for (let i = 0; i < 3; i++) {
    const lineY = catalogPageY + catalogPageH * (0.25 + i * 0.25);
    shapes.push(rect('catalogLine', catalogLeftPageX + catalogPageW * 0.15, lineY, catalogPageW * 0.7, h * 0.006, PALETTE.N3));
  }

  // ドア(右端、会場選択)
  const doorX = w * 0.86;
  const doorY = h * 0.14;
  const doorW = w * 0.1;
  const doorH = h * 0.58;
  pushShadow(shapes, doorX, doorY + doorH, doorW, h);
  shapes.push(rect('door', doorX, doorY, doorW, doorH, PALETTE.M0));
  shapes.push(rect('doorknob', doorX + doorW * 0.8, doorY + doorH * 0.5, doorW * 0.08, doorW * 0.08, PALETTE.M3));

  // 正典機(段ボール台座・爪楊枝軸)を机の上に小さく配置。素朴な素材感(段ボールの
  // 断面=波形の中芯、爪楊枝の木肌、釘の頭)をart-spec §5.3どおりドットで拾う。
  const carX = deskX + deskW * 0.15;
  const carY = deskY - deskH * 0.12;
  const carBaseW = deskW * 0.55;
  const carBaseH = deskH * 0.12;
  shapes.push(rect('canonicalCarBase', carX, carY, carBaseW, carBaseH, PALETTE.W1));
  const ribStep = Math.max(1, carBaseW * 0.12);
  for (let x = carX + ribStep * 0.5; x < carX + carBaseW; x += ribStep) {
    shapes.push(rect('cardboardRib', x, carY, w * 0.003, carBaseH, PALETTE.W2));
  }
  shapes.push(rect('toothpickAxle', carX + carBaseW * 0.27, carY - carBaseH * 0.6, w * 0.004, carBaseH * 2.2, PALETTE.W3));
  shapes.push(circle('canonicalCarWheel', carX + deskW * 0.12, carY + deskH * 0.12, deskW * 0.05, PALETTE.N4));
  shapes.push(circle('canonicalCarWheel', carX + deskW * 0.42, carY + deskH * 0.12, deskW * 0.05, PALETTE.N4));
  shapes.push(circle('nailHead', carX + deskW * 0.12, carY + deskH * 0.12, deskW * 0.012, PALETTE.N2));
  shapes.push(circle('nailHead', carX + deskW * 0.42, carY + deskH * 0.12, deskW * 0.012, PALETTE.N2));

  return shapes;
}
