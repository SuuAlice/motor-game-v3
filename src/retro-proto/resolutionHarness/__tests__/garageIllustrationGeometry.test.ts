import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../../retro/palette';
import { computeGarageIllustrationGeometry, type GarageElementId } from '../garageIllustrationGeometry';

const CONTENT_RESOLUTIONS: Array<[number, number]> = [
  [320, 180],
  [480, 270],
  [640, 360],
  [960, 540],
];

describe('computeGarageIllustrationGeometry', () => {
  it.each(CONTENT_RESOLUTIONS)(
    'art-spec §2.2(整数ピクセル規律): %ix%i で全図形の全数値が整数になる',
    (w, h) => {
      const shapes = computeGarageIllustrationGeometry(w, h);
      expect(shapes.length).toBeGreaterThan(0);
      for (const shape of shapes) {
        for (const [key, value] of Object.entries(shape)) {
          if (key === 'kind' || key === 'color' || key === 'elementId') continue;
          expect(Number.isInteger(value), `${shape.elementId} ${key}が整数ではない: ${value}`).toBe(true);
        }
      }
    },
  );

  it('机・棚・本棚・ドア・正典機の要素を含む(矩形+円の混在)', () => {
    const shapes = computeGarageIllustrationGeometry(480, 270);
    expect(shapes.some((s) => s.kind === 'circle')).toBe(true);
    expect(shapes.some((s) => s.kind === 'rect')).toBe(true);
  });

  // Task#GARAGE-DENSITY(Suu承認): shape数やrect存在だけでの判定を避け、
  // semanticなelementIdで各要素の存在を厳密に確認する。
  it('art-spec §5.4のハブ全要素(机・棚・カタログ・本棚・ドア・ラジオ)のelementIdを含む', () => {
    const shapes = computeGarageIllustrationGeometry(480, 270);
    const ids = new Set<GarageElementId>(shapes.map((s) => s.elementId));
    const expectedIds: GarageElementId[] = [
      'wall',
      'floor',
      'floorGrain',
      'desk',
      'deskLegLeft',
      'deskLegRight',
      'shelf',
      'shelfDivider',
      'shelfPart',
      'catalogStand',
      'catalogPage',
      'catalogLine',
      'bookshelf',
      'bookSpine',
      'door',
      'doorknob',
      'radioBody',
      'radioDial',
      'radioAntenna',
    ];
    for (const id of expectedIds) {
      expect(ids.has(id), `elementId "${id}" が見つからない`).toBe(true);
    }
  });

  it('正典機の素材感(段ボール中芯・爪楊枝軸・車輪・釘頭)のelementIdを含む', () => {
    const shapes = computeGarageIllustrationGeometry(480, 270);
    const ids = new Set<GarageElementId>(shapes.map((s) => s.elementId));
    expect(ids.has('canonicalCarBase')).toBe(true);
    expect(ids.has('cardboardRib')).toBe(true);
    expect(ids.has('toothpickAxle')).toBe(true);
    expect(ids.has('canonicalCarWheel')).toBe(true);
    expect(shapes.filter((s) => s.elementId === 'canonicalCarWheel')).toHaveLength(2);
    expect(ids.has('nailHead')).toBe(true);
    expect(shapes.filter((s) => s.elementId === 'nailHead')).toHaveLength(2);
  });

  it('接地影(desk/shelf/bookshelf/catalogStand/door)は対象物より先に描画される(背面になる)', () => {
    const shapes = computeGarageIllustrationGeometry(480, 270);
    const anchors: GarageElementId[] = ['desk', 'shelf', 'bookshelf', 'catalogStand', 'door'];
    for (const anchorId of anchors) {
      const anchorIndex = shapes.findIndex((s) => s.elementId === anchorId);
      expect(anchorIndex, `elementId "${anchorId}" が見つからない`).toBeGreaterThan(0);
      expect(shapes[anchorIndex - 1].elementId, `"${anchorId}"の直前がshadowではない`).toBe('shadow');
    }
  });

  it('接地影はW0(暗色)を使う(W3等の明色は影に使わない)', () => {
    const shapes = computeGarageIllustrationGeometry(480, 270);
    const shadows = shapes.filter((s) => s.elementId === 'shadow');
    expect(shadows.length).toBeGreaterThanOrEqual(5);
    for (const shadow of shadows) {
      expect(shadow.color).toBe(PALETTE.W0);
    }
  });
});
