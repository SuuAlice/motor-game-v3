// P4-0 G5: 走行幾何の純検証。整数ピクセル規律と「外挿しない」ことを固定する。
import { describe, expect, it } from 'vitest';
import {
  MAX_VIBRATION_PX,
  computePhase4RaceGeometry,
  computeVibrationOffsetPx,
  projectPositionToX,
  computeSectionSplits,
  samplePositionAtTime,
} from '../phase4RaceGeometry';

const W = 480;
const H = 270;
const LENGTH_M = 10;
const BOUNDARIES = [2.5, 5, 7.5, 10];

describe('computePhase4RaceGeometry', () => {
  const geo = computePhase4RaceGeometry(W, H, LENGTH_M, BOUNDARIES);

  it('座標はすべて整数で、走路は画面内に収まる', () => {
    const values = [
      geo.trackRect.x, geo.trackRect.y, geo.trackRect.widthPx, geo.trackRect.heightPx,
      geo.startX, geo.finishX, geo.playerLaneY, geo.ghostLaneY, ...geo.sectionMarkerXs,
    ];
    for (const value of values) expect(Number.isInteger(value)).toBe(true);
    expect(geo.startX).toBeGreaterThanOrEqual(0);
    expect(geo.finishX).toBeLessThanOrEqual(W);
    expect(geo.trackRect.y + geo.trackRect.heightPx).toBeLessThanOrEqual(H);
  });

  it('ghostは奥、playerは手前のレーンで、重ならない', () => {
    expect(geo.ghostLaneY).toBeLessThan(geo.playerLaneY);
    expect(geo.playerLaneY - geo.ghostLaneY).toBeGreaterThanOrEqual(geo.carSprite.wallHeightPx);
  });

  it('最終区間境界はfinishと一致する', () => {
    expect(geo.sectionMarkerXs[BOUNDARIES.length - 1]).toBe(geo.finishX);
  });
});

describe('projectPositionToX', () => {
  it('0メートルはstart、コース長はfinishへ写る', () => {
    expect(projectPositionToX(0, LENGTH_M, 40, 440)).toBe(40);
    expect(projectPositionToX(LENGTH_M, LENGTH_M, 40, 440)).toBe(440);
  });

  it('コース長を超えても外挿せず、finishで止まる', () => {
    expect(projectPositionToX(999, LENGTH_M, 40, 440)).toBe(440);
    expect(projectPositionToX(-5, LENGTH_M, 40, 440)).toBe(40);
  });

  it('単調非減少で、常に整数を返す', () => {
    let previous = -Infinity;
    for (let m = 0; m <= LENGTH_M; m += 0.13) {
      const x = projectPositionToX(m, LENGTH_M, 40, 440);
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(previous);
      previous = x;
    }
  });
});

describe('computeVibrationOffsetPx', () => {
  it('reduced motionでは常に0', () => {
    for (let t = 0; t < 1; t += 0.017) {
      expect(computeVibrationOffsetPx(1, t, true)).toBe(0);
    }
  });

  it('軸ずれ0では揺れない', () => {
    for (let t = 0; t < 1; t += 0.017) {
      expect(computeVibrationOffsetPx(0, t, false)).toBe(0);
    }
  });

  it('振幅は上限を超えず、整数のみ', () => {
    for (let t = 0; t < 1; t += 0.003) {
      const v = computeVibrationOffsetPx(5, t, false);
      expect(Number.isInteger(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(MAX_VIBRATION_PX);
    }
  });
});

describe('samplePositionAtTime', () => {
  const trace = [
    { t: 0, positionM: 0 },
    { t: 1, positionM: 2 },
    { t: 2, positionM: 6 },
  ];

  it('標本間は線形補間する', () => {
    expect(samplePositionAtTime(trace, 0.5)).toBeCloseTo(1, 10);
    expect(samplePositionAtTime(trace, 1.25)).toBeCloseTo(3, 10);
  });

  it('範囲外は端の値で止め、外挿しない', () => {
    expect(samplePositionAtTime(trace, -1)).toBe(0);
    expect(samplePositionAtTime(trace, 99)).toBe(6);
  });

  it('空traceでも有限値を返す', () => {
    expect(samplePositionAtTime([], 1)).toBe(0);
  });
});

describe('computeSectionSplits', () => {
  it('通過時刻の差を返し、先頭は0からの所要時間', () => {
    expect(computeSectionSplits([1, 2.5, 4, 5])).toEqual([1, 1.5, 1.5, 1]);
  });

  it('未通過はnullのまま伝え、0秒として混ぜない', () => {
    expect(computeSectionSplits([1, 2.5, null, null])).toEqual([1, 1.5, null, null]);
    // 直前が未通過なら、その次の所要時間も求まらない。
    expect(computeSectionSplits([1, null, 4])).toEqual([1, null, null]);
  });
});
