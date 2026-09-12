import { describe, expect, it } from 'vitest';
import { MeasuredGrid, type MeasuredCalibration } from './measuredGrid';
import { CELL_NAMES } from './types';

// 玩家面對相機：前 = 畫面下方（y 大），玩家左 = 畫面右（x 大）
const cal: MeasuredCalibration = {
  center: { x: 500, y: 600 },
  front: { x: 505, y: 690 },
  back: { x: 498, y: 540 },
  left: { x: 610, y: 602 },
  right: { x: 400, y: 598 },
  width: 720,
  height: 1280,
  facing: 'user',
  date: '',
};
const grid = new MeasuredGrid(cal);

describe('MeasuredGrid', () => {
  it('校正點都落在自己的格子', () => {
    expect(CELL_NAMES[grid.cellOf(cal.center)!]).toBe('中');
    expect(CELL_NAMES[grid.cellOf(cal.front)!]).toBe('前');
    expect(CELL_NAMES[grid.cellOf(cal.back)!]).toBe('後');
    expect(CELL_NAMES[grid.cellOf(cal.left)!]).toBe('左');
    expect(CELL_NAMES[grid.cellOf(cal.right)!]).toBe('右');
  });
  it('斜角由前後與左右合成', () => {
    expect(CELL_NAMES[grid.cellOf({ x: 610, y: 690 })!]).toBe('左前');
    expect(CELL_NAMES[grid.cellOf({ x: 400, y: 540 })!]).toBe('右後');
  });
  it('每一格的中心都會被歸到自己', () => {
    for (let c = 0; c < 9; c++) expect(grid.cellOf(grid.center(c))).toBe(c);
  });
  it('連續座標：中央是 (1.5, 1.5)，前是 rowCont 2.5', () => {
    expect(grid.continuous(cal.center)).toEqual({ colCont: 1.5, rowCont: 1.5 });
    expect(grid.continuous(cal.front).rowCont).toBeCloseTo(2.5, 5);
    expect(grid.continuous(cal.left).colCont).toBeCloseTo(0.5, 1);
  });
  it('方向反過來的人也能用（把「前」定義成畫面上方）', () => {
    const flipped: MeasuredCalibration = { ...cal, front: { x: 500, y: 520 }, back: { x: 500, y: 690 } };
    const g = new MeasuredGrid(flipped);
    expect(CELL_NAMES[g.cellOf({ x: 500, y: 520 })!]).toBe('前');
    expect(CELL_NAMES[g.cellOf({ x: 500, y: 690 })!]).toBe('後');
  });
  it('離太遠回傳 null', () => {
    expect(grid.cellOf({ x: 500, y: 100 })).toBeNull();
  });
  it('validate 會抓出前後同邊', () => {
    expect(MeasuredGrid.validate({ ...cal, back: { x: 500, y: 660 } })).toContain('同一邊');
    expect(MeasuredGrid.validate(cal)).toBeNull();
  });
});
