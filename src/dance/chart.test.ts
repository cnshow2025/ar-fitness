import { describe, expect, it } from 'vitest';
import { allowedCols, generateChart, LEVELS } from './chart';
import { cellCol, cellRow, CENTER_CELL, type Foot } from './types';

function cheb(a: number, b: number): number {
  return Math.max(Math.abs(cellRow(a) - cellRow(b)), Math.abs(cellCol(a) - cellCol(b)));
}

describe('generateChart', () => {
  for (const level of LEVELS) {
    it(`第 ${level.id} 關的譜面每一步都踩得到`, () => {
      const notes = generateChart(level);
      expect(notes.length).toBeGreaterThan(level.bars);
      const feet: Record<Foot, number> = { L: CENTER_CELL, R: CENTER_CELL };
      let prevBeat = -1;
      for (const n of notes) {
        expect(n.beat).toBeGreaterThan(prevBeat);
        expect(n.beat).toBeGreaterThanOrEqual(4);
        prevBeat = n.beat;
        if (n.kind === 'gesture') continue;
        if (n.foot === 'both') {
          expect(cellCol(n.cell)).toBe(1);
          expect(cheb(n.cell, feet.L)).toBeLessThanOrEqual(1);
          expect(cheb(n.cell, feet.R)).toBeLessThanOrEqual(1);
          feet.L = n.cell;
          feet.R = n.cell;
          continue;
        }
        expect(allowedCols(n.foot)).toContain(cellCol(n.cell));
        expect(cheb(n.cell, feet[n.foot])).toBeLessThanOrEqual(1);
        expect(n.cell).not.toBe(feet[n.foot]);
        if (!level.diagonals) expect(cellRow(n.cell) === 1 || cellCol(n.cell) === 1).toBe(true);
        feet[n.foot] = n.cell;
      }
    });
  }

  it('同一關每次產生的譜面相同', () => {
    expect(generateChart(LEVELS[2])).toEqual(generateChart(LEVELS[2]));
  });
});
