import { describe, expect, it } from 'vitest';
import { FloorGrid, type GridCalibration } from './grid';
import { CELL_NAMES, cellIndex } from './types';

const cal: GridCalibration = { cx: 500, cy: 600, w: 100, h: 50, k: 0.12 };
const grid = new FloorGrid(cal);

describe('FloorGrid', () => {
  it('中央格在校正點', () => {
    expect(grid.cellOf({ x: 500, y: 600 })).toBe(4);
  });
  it('玩家左邊是影像 x 較大的那側', () => {
    expect(grid.cellOf({ x: 600, y: 600 })).toBe(cellIndex(1, 0));
    expect(CELL_NAMES[grid.cellOf({ x: 600, y: 600 })!]).toBe('左');
    expect(CELL_NAMES[grid.cellOf({ x: 400, y: 600 })!]).toBe('右');
  });
  it('前排在畫面下方、後排在上方', () => {
    expect(CELL_NAMES[grid.cellOf({ x: 500, y: 600 + 60 })!]).toBe('前');
    expect(CELL_NAMES[grid.cellOf({ x: 500, y: 600 - 50 })!]).toBe('後');
  });
  it('每一格的中心都會被歸到自己', () => {
    for (let c = 0; c < 9; c++) expect(grid.cellOf(grid.center(c))).toBe(c);
  });
  it('離得太遠回傳 null', () => {
    expect(grid.cellOf({ x: 500, y: 100 })).toBeNull();
    expect(grid.cellOf({ x: 900, y: 600 })).toBeNull();
  });
});
