import type { Point, Pose } from './landmarks';

/** 以 b 為頂點，a-b-c 三點夾角（度，0..180）。 */
export function angleAt(a: Point, b: Point, c: Point): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magAB = Math.hypot(abx, aby);
  const magCB = Math.hypot(cbx, cby);
  if (magAB === 0 || magCB === 0) return 0;
  const cos = Math.min(1, Math.max(-1, dot / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * 向量 from→to 與「畫面正上方」的夾角（度，0..180）。
 * 0 代表完全垂直向上，90 代表水平。
 */
export function angleFromVertical(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y; // 影像座標 y 向下為正
  const mag = Math.hypot(dx, dy);
  if (mag === 0) return 0;
  const cos = Math.min(1, Math.max(-1, -dy / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** 有正負號的側傾角：from→to 相對垂直向上，往畫面右側傾為正。 */
export function signedTiltFromVertical(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

export function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

/** 指定關鍵點是否都達到最低可見度。 */
export function allVisible(pose: Pose, indices: readonly number[], min = 0.5): boolean {
  return indices.every((i) => (pose[i]?.visibility ?? 0) >= min);
}

export function visibilityOf(pose: Pose, indices: readonly number[]): number {
  if (indices.length === 0) return 1;
  return Math.min(...indices.map((i) => pose[i]?.visibility ?? 0));
}
