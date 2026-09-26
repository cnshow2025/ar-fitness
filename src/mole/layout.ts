import { LM, type Pose } from '../pose/landmarks';
import { visibilityOf } from '../pose/angles';
import { HOLE_COLS, HOLE_COUNT, HOLE_ROWS } from './game';

export interface HoleLayout {
  /** 每個洞的中心（影像座標），索引 = row*3 + col */
  centers: Array<{ x: number; y: number }>;
  radius: number;
  cellW: number;
  cellH: number;
}

/**
 * 依身體尺寸把 3×3 的洞排在雙手搆得到的範圍（洞大、間距大）：
 * 橫向以肩膀中心為準、寬度約兩隻手臂長加肩寬；縱向從頭頂上方到腰。
 */
export function layoutFromPose(pose: Pose, width: number, height: number): HoleLayout | null {
  const ids = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_ELBOW, LM.RIGHT_ELBOW, LM.LEFT_WRIST, LM.RIGHT_WRIST, LM.NOSE];
  if (visibilityOf(pose, ids) < 0.45) return null;
  const ls = pose[LM.LEFT_SHOULDER];
  const rs = pose[LM.RIGHT_SHOULDER];
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const armL = dist(ls, pose[LM.LEFT_ELBOW]) + dist(pose[LM.LEFT_ELBOW], pose[LM.LEFT_WRIST]);
  const armR = dist(rs, pose[LM.RIGHT_ELBOW]) + dist(pose[LM.RIGHT_ELBOW], pose[LM.RIGHT_WRIST]);
  const arm = (armL + armR) / 2;
  const sw = dist(ls, rs);
  if (arm < 20 || sw < 10) return null;
  const cx = (ls.x + rs.x) / 2;
  const sy = (ls.y + rs.y) / 2;
  const gridW = Math.min(width * 0.98, 2.3 * arm + sw);
  const gridH = Math.min(height * 0.85, 2.0 * arm);
  const left = Math.min(width - gridW, Math.max(0, cx - gridW / 2));
  const top = Math.min(height - gridH, Math.max(0, sy - 0.9 * arm));
  const cellW = gridW / HOLE_COLS;
  const cellH = gridH / HOLE_ROWS;
  const centers = [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    const col = i % HOLE_COLS;
    const row = Math.floor(i / HOLE_COLS);
    centers.push({ x: left + (col + 0.5) * cellW, y: top + (row + 0.5) * cellH });
  }
  return { centers, radius: Math.min(cellW * 0.4, cellH * 0.42), cellW, cellH };
}

/** 平均多幀排版讓洞的位置穩定。 */
export function averageLayouts(list: HoleLayout[]): HoleLayout {
  const n = list.length;
  const centers = list[0].centers.map((_, i) => ({
    x: list.reduce((a, l) => a + l.centers[i].x, 0) / n,
    y: list.reduce((a, l) => a + l.centers[i].y, 0) / n,
  }));
  return {
    centers,
    radius: list.reduce((a, l) => a + l.radius, 0) / n,
    cellW: list.reduce((a, l) => a + l.cellW, 0) / n,
    cellH: list.reduce((a, l) => a + l.cellH, 0) / n,
  };
}

/** 某個點落在哪個洞（在半徑的 1.4 倍內，手的感應範圍比洞大一點），沒有回傳 null。 */
export function holeAt(layout: HoleLayout, p: { x: number; y: number }): number | null {
  let best = -1;
  let bestD = Infinity;
  layout.centers.forEach((c, i) => {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return bestD <= layout.radius * 1.4 ? best : null;
}
