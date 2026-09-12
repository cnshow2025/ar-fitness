import type { DanceGrid, Poly } from './grid';
import { cellCol, cellIndex, cellRow } from './types';

export interface Pt {
  x: number;
  y: number;
}

/** 引導式校正的結果：中央與前後左右四個實際踩到的位置（影像座標）。 */
export interface MeasuredCalibration {
  center: Pt;
  front: Pt;
  back: Pt;
  left: Pt;
  right: Pt;
  /** 校正時的影像尺寸與鏡頭，換了就要重新校正 */
  width: number;
  height: number;
  facing: 'user' | 'environment';
  date: string;
}

/** 校正流程的四個方向與對應格子。 */
export const CALIB_DIRS: Array<{ key: 'front' | 'back' | 'left' | 'right'; cell: number; label: string; say: string }> = [
  { key: 'front', cell: 7, label: '前', say: '往前踩一步，停住' },
  { key: 'back', cell: 1, label: '後', say: '往後踩一步，停住' },
  { key: 'left', cell: 3, label: '左', say: '往左踩一步，停住' },
  { key: 'right', cell: 5, label: '右', say: '往右踩一步，停住' },
];

/**
 * 以實際踩出的位置建立的九宮格：
 * - 列（前後）由 center / front / back 的 y 決定，前後各自的距離可以不同
 * - 欄（左右）由 center / left / right 的 x 偏移決定，並依透視隨 y 微幅縮放
 * - 斜角格由前後與左右合成
 * 方向完全依校正時使用者實際的動作，不假設「前」在畫面的哪一邊。
 */
export class MeasuredGrid implements DanceGrid {
  private readonly cx: number;
  private readonly cy: number;
  private readonly df: number; // front.y - cy
  private readonly db: number; // back.y - cy
  private readonly dl: number; // left.x - cx
  private readonly dr: number; // right.x - cx
  private readonly hAvg: number;
  private readonly k = 0.12;

  constructor(readonly cal: MeasuredCalibration) {
    this.cx = cal.center.x;
    this.cy = cal.center.y;
    this.df = cal.front.y - this.cy;
    this.db = cal.back.y - this.cy;
    this.dl = cal.left.x - this.cx;
    this.dr = cal.right.x - this.cx;
    this.hAvg = Math.max(1, (Math.abs(this.df) + Math.abs(this.db)) / 2);
  }

  /** 校正是否合理：前後要相反、左右要相反，而且步幅不能太小。 */
  static validate(cal: MeasuredCalibration): string | null {
    const df = cal.front.y - cal.center.y;
    const db = cal.back.y - cal.center.y;
    const dl = cal.left.x - cal.center.x;
    const dr = cal.right.x - cal.center.x;
    const min = Math.min(cal.width, cal.height) * 0.03;
    if (Math.abs(df) < min || Math.abs(db) < min) return '前後的步伐太小，請踩大步一點';
    if (Math.abs(dl) < min || Math.abs(dr) < min) return '左右的步伐太小，請踩大步一點';
    if (df * db > 0) return '前和後踩到同一邊了，請重新校正';
    if (dl * dr > 0) return '左和右踩到同一邊了，請重新校正';
    return null;
  }

  /** 越靠近相機（畫面越下方）左右距離越大 */
  private scaleAt(y: number): number {
    return Math.max(0.4, 1 + (this.k * (y - this.cy)) / this.hAvg);
  }

  /** 該列的中心 x：前後的校正點若有左右偏移，沿著列內插 */
  private rowX(y: number): number {
    const t = y - this.cy;
    if (t * this.df > 0) return this.cx + (this.cal.front.x - this.cx) * Math.min(1.3, t / this.df);
    if (t * this.db > 0) return this.cx + (this.cal.back.x - this.cx) * Math.min(1.3, t / this.db);
    return this.cx;
  }

  continuous(p: { x: number; y: number }): { colCont: number; rowCont: number } {
    const ty = p.y - this.cy;
    let rowCont: number;
    if (ty * this.df > 0) rowCont = 1.5 + ty / this.df;
    else if (ty * this.db > 0) rowCont = 1.5 - ty / this.db;
    else rowCont = 1.5;
    const s = this.scaleAt(p.y);
    const tx = p.x - this.rowX(p.y);
    let colCont: number;
    if (tx * this.dl > 0) colCont = 1.5 - tx / (this.dl * s);
    else if (tx * this.dr > 0) colCont = 1.5 + tx / (this.dr * s);
    else colCont = 1.5;
    const clamp = (v: number) => Math.min(3.5, Math.max(-0.5, v));
    return { colCont: clamp(colCont), rowCont: clamp(rowCont) };
  }

  cellOf(p: { x: number; y: number }): number | null {
    const { colCont, rowCont } = this.continuous(p);
    if (colCont < -0.3 || colCont > 3.3 || rowCont < -0.3 || rowCont > 3.3) return null;
    const col = Math.min(2, Math.max(0, Math.floor(colCont)));
    const row = Math.min(2, Math.max(0, Math.floor(rowCont)));
    return cellIndex(row, col);
  }

  /** 連續格子座標 → 影像座標 */
  toImage(colCont: number, rowCont: number): Pt {
    const y = rowCont >= 1.5 ? this.cy + (rowCont - 1.5) * this.df : this.cy + (1.5 - rowCont) * this.db;
    const s = this.scaleAt(y);
    const rx = this.rowX(y);
    const x = colCont >= 1.5 ? rx + (colCont - 1.5) * this.dr * s : rx + (1.5 - colCont) * this.dl * s;
    return { x, y };
  }

  polygon(cell: number): Poly {
    const c = cellCol(cell);
    const r = cellRow(cell);
    return [this.toImage(c, r), this.toImage(c + 1, r), this.toImage(c + 1, r + 1), this.toImage(c, r + 1)];
  }

  center(cell: number): Pt {
    return this.toImage(cellCol(cell) + 0.5, cellRow(cell) + 0.5);
  }
}
