import { LM, type Point, type Pose } from '../pose/landmarks';
import { visibilityOf } from '../pose/angles';
import { cellCol, cellIndex, cellRow } from './types';

/** 地板九宮格的校正參數（像素、影像座標）。 */
export interface GridCalibration {
  /** 中央格中心（雙腳併攏站在中央時的腳踝中點） */
  cx: number;
  cy: number;
  /** 一格的橫向寬度（在中央列的高度） */
  w: number;
  /** 一格的縱向高度（前後方向，因透視縮短） */
  h: number;
  /** 透視係數：越靠近相機（畫面越下方）格子越寬 */
  k: number;
}

const ROW_OFFSETS = [-1.6, -0.5, 0.6, 1.9] as const;

/** 預設格寬／格高相對腿長的比例（一步約 0.45 倍腿長，不用跨太大步）。 */
export const CELL_W_RATIO = 0.45;
export const CELL_H_RATIO = 0.26;

/** 從一幀姿勢推算校正參數：需要髖與腳踝可見。scale 可放大縮小格子（1 = 預設）。 */
export function calibrateFromPose(pose: Pose, scale = 1): GridCalibration | null {
  const ids = [LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_ANKLE, LM.RIGHT_ANKLE];
  if (visibilityOf(pose, ids) < 0.5) return null;
  const la = pose[LM.LEFT_ANKLE];
  const ra = pose[LM.RIGHT_ANKLE];
  const lh = pose[LM.LEFT_HIP];
  const rh = pose[LM.RIGHT_HIP];
  const legLen = (Math.hypot(la.x - lh.x, la.y - lh.y) + Math.hypot(ra.x - rh.x, ra.y - rh.y)) / 2;
  if (legLen < 20) return null;
  return {
    cx: (la.x + ra.x) / 2,
    cy: (la.y + ra.y) / 2,
    w: legLen * CELL_W_RATIO * scale,
    h: legLen * CELL_H_RATIO * scale,
    k: 0.12,
  };
}

/** 平均多幀校正，讓格子位置穩定。 */
export function averageCalibrations(list: GridCalibration[]): GridCalibration {
  const n = list.length;
  const sum = list.reduce(
    (a, c) => ({ cx: a.cx + c.cx, cy: a.cy + c.cy, w: a.w + c.w, h: a.h + c.h, k: c.k }),
    { cx: 0, cy: 0, w: 0, h: 0, k: 0.12 },
  );
  return { cx: sum.cx / n, cy: sum.cy / n, w: sum.w / n, h: sum.h / n, k: sum.k };
}

export type Poly = Array<{ x: number; y: number }>;

/**
 * 地板九宮格：以玩家視角定義（col 0 = 玩家左邊），對應到影像座標。
 * 玩家面對相機，所以玩家的左邊在影像中是 x 較大的那側。
 */
export class FloorGrid {
  constructor(readonly cal: GridCalibration) {}

  private rowBounds(): number[] {
    return ROW_OFFSETS.map((o) => this.cal.cy + o * this.cal.h);
  }

  private scaleAt(y: number): number {
    return Math.max(0.4, 1 + (this.cal.k * (y - this.cal.cy)) / this.cal.h);
  }

  /** 玩家座標 u（往玩家左邊為負）轉影像 x */
  private xOf(u: number, y: number): number {
    return this.cal.cx - u * this.scaleAt(y);
  }

  /** 某個影像點落在哪一格；離九宮格太遠回傳 null。 */
  cellOf(p: { x: number; y: number }): number | null {
    const rb = this.rowBounds();
    const { h, w } = this.cal;
    if (p.y < rb[0] - 0.6 * h || p.y > rb[3] + 0.8 * h) return null;
    let row = 1;
    if (p.y < rb[1]) row = 0;
    else if (p.y >= rb[2]) row = 2;
    const u = (this.cal.cx - p.x) / this.scaleAt(p.y);
    if (u < -2.0 * w || u > 2.0 * w) return null;
    const col = Math.min(2, Math.max(0, Math.floor(u / w + 1.5)));
    return cellIndex(row, col);
  }

  /**
   * 連續的格子座標：colCont 0..3（1.5 = 中欄中心）、rowCont 0..3（1.5 = 中排中心），
   * 超出範圍會被夾在 -0.5..3.5，用來把腳畫在俯視跳舞墊上。
   */
  continuous(p: { x: number; y: number }): { colCont: number; rowCont: number } {
    const rb = this.rowBounds();
    let rowCont: number;
    if (p.y < rb[0]) rowCont = (p.y - rb[0]) / (rb[1] - rb[0]);
    else if (p.y >= rb[3]) rowCont = 3 + (p.y - rb[3]) / (rb[3] - rb[2]);
    else {
      const i = p.y < rb[1] ? 0 : p.y < rb[2] ? 1 : 2;
      rowCont = i + (p.y - rb[i]) / (rb[i + 1] - rb[i]);
    }
    const u = (this.cal.cx - p.x) / this.scaleAt(p.y);
    const colCont = u / this.cal.w + 1.5;
    const clamp = (v: number) => Math.min(3.5, Math.max(-0.5, v));
    return { colCont: clamp(colCont), rowCont: clamp(rowCont) };
  }

  /** 格子的四個角（影像座標），用來畫在地板上。 */
  polygon(cell: number): Poly {
    const rb = this.rowBounds();
    const r = cellRow(cell);
    const c = cellCol(cell);
    const y0 = rb[r];
    const y1 = rb[r + 1];
    const u0 = (c - 1.5) * this.cal.w;
    const u1 = (c - 0.5) * this.cal.w;
    return [
      { x: this.xOf(u0, y0), y: y0 },
      { x: this.xOf(u1, y0), y: y0 },
      { x: this.xOf(u1, y1), y: y1 },
      { x: this.xOf(u0, y1), y: y1 },
    ];
  }

  center(cell: number): { x: number; y: number } {
    const poly = this.polygon(cell);
    return {
      x: poly.reduce((a, p) => a + p.x, 0) / 4,
      y: poly.reduce((a, p) => a + p.y, 0) / 4,
    };
  }

  /** 腳的代表點：用腳踝（比腳尖穩定）。 */
  static footPoint(pose: Pose, foot: 'L' | 'R'): Point {
    return pose[foot === 'L' ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE];
  }
}
