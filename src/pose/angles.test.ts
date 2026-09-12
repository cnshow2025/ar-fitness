import { describe, expect, it } from 'vitest';
import { angleAt, angleFromVertical, signedTiltFromVertical } from './angles';
import type { Point } from './landmarks';

const P = (x: number, y: number): Point => ({ x, y, z: 0, visibility: 1 });

describe('angleAt', () => {
  it('直線是 180 度', () => {
    expect(angleAt(P(0, 0), P(0, 10), P(0, 20))).toBeCloseTo(180, 5);
  });
  it('直角是 90 度', () => {
    expect(angleAt(P(0, 0), P(0, 10), P(10, 10))).toBeCloseTo(90, 5);
  });
  it('折回來是 0 度', () => {
    expect(angleAt(P(0, 0), P(0, 10), P(0, 0))).toBeCloseTo(0, 5);
  });
  it('點重疊時回 0 而不是 NaN', () => {
    expect(angleAt(P(5, 5), P(5, 5), P(9, 9))).toBe(0);
  });
});

describe('angleFromVertical', () => {
  it('朝上是 0 度（影像 y 向下為正）', () => {
    expect(angleFromVertical(P(0, 10), P(0, 0))).toBeCloseTo(0, 5);
  });
  it('水平是 90 度', () => {
    expect(angleFromVertical(P(0, 0), P(10, 0))).toBeCloseTo(90, 5);
  });
  it('朝下是 180 度', () => {
    expect(angleFromVertical(P(0, 0), P(0, 10))).toBeCloseTo(180, 5);
  });
});

describe('signedTiltFromVertical', () => {
  it('往右傾為正、往左傾為負', () => {
    expect(signedTiltFromVertical(P(0, 10), P(3, 0))).toBeGreaterThan(0);
    expect(signedTiltFromVertical(P(0, 10), P(-3, 0))).toBeLessThan(0);
    expect(signedTiltFromVertical(P(0, 10), P(0, 0))).toBeCloseTo(0, 5);
  });
});
