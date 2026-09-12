import { LM, type Pose } from '../pose/landmarks';
import type { FloorGrid } from './grid';
import { FloorGrid as Grid } from './grid';
import type { Foot, Gesture } from './types';

export interface FootEvent {
  foot: Foot;
  cell: number;
  t: number;
}

/** 追蹤左右腳目前在哪一格；連續兩幀在同一新格子才算移動，避免抖動。 */
export class FootTracker {
  cells: Record<Foot, number | null> = { L: null, R: null };
  private candidate: Record<Foot, number | null> = { L: null, R: null };
  private candidateCount: Record<Foot, number> = { L: 0, R: 0 };

  constructor(private readonly dwellFrames = 2) {}

  update(pose: Pose, grid: FloorGrid, t: number): FootEvent[] {
    const events: FootEvent[] = [];
    for (const foot of ['L', 'R'] as Foot[]) {
      const p = Grid.footPoint(pose, foot);
      if (p.visibility < 0.4) continue;
      const cell = grid.cellOf(p);
      if (cell === this.cells[foot]) {
        this.candidate[foot] = null;
        this.candidateCount[foot] = 0;
        continue;
      }
      if (cell === this.candidate[foot]) this.candidateCount[foot] += 1;
      else {
        this.candidate[foot] = cell;
        this.candidateCount[foot] = 1;
      }
      if (this.candidateCount[foot] >= this.dwellFrames) {
        this.cells[foot] = cell;
        this.candidate[foot] = null;
        this.candidateCount[foot] = 0;
        if (cell !== null) events.push({ foot, cell, t });
      }
    }
    return events;
  }

  reset(): void {
    this.cells = { L: null, R: null };
    this.candidate = { L: null, R: null };
    this.candidateCount = { L: 0, R: 0 };
  }
}

/** 一幀中哪些手勢成立。 */
export function detectGestures(pose: Pose): Set<Gesture> {
  const out = new Set<Gesture>();
  const ls = pose[LM.LEFT_SHOULDER];
  const rs = pose[LM.RIGHT_SHOULDER];
  const lw = pose[LM.LEFT_WRIST];
  const rw = pose[LM.RIGHT_WRIST];
  const lh = pose[LM.LEFT_HIP];
  const rh = pose[LM.RIGHT_HIP];
  const nose = pose[LM.NOSE];
  const vis = (p: { visibility: number }) => p.visibility >= 0.4;
  if (![ls, rs, lw, rw].every(vis)) return out;
  const sw = Math.max(1, Math.hypot(ls.x - rs.x, ls.y - rs.y));
  const shoulderY = (ls.y + rs.y) / 2;

  // 舉手：雙手手腕都高於鼻子（影像 y 較小）
  if (vis(nose) && lw.y < nose.y && rw.y < nose.y) out.add('handsUp');

  // 拍手：雙手手腕靠得很近，且在肩膀以下、髖以上（胸前）
  const wristDist = Math.hypot(lw.x - rw.x, lw.y - rw.y);
  const hipY = vis(lh) && vis(rh) ? (lh.y + rh.y) / 2 : shoulderY + sw * 1.5;
  const midY = (lw.y + rw.y) / 2;
  if (wristDist < 0.35 * sw && midY > shoulderY - 0.3 * sw && midY < hipY + 0.2 * sw) out.add('clap');

  // 張開雙臂：手腕與肩同高、往外伸直
  const lLevel = Math.abs(lw.y - ls.y) < 0.4 * sw && Math.abs(lw.x - ls.x) > 0.9 * sw;
  const rLevel = Math.abs(rw.y - rs.y) < 0.4 * sw && Math.abs(rw.x - rs.x) > 0.9 * sw;
  if (lLevel && rLevel && wristDist > 2.4 * sw) out.add('tpose');

  return out;
}

/** 手勢狀態追蹤（連續兩幀才算成立）。 */
export class GestureTracker {
  active = new Set<Gesture>();
  private pending = new Map<Gesture, number>();

  update(pose: Pose): Set<Gesture> {
    const now = detectGestures(pose);
    for (const g of ['handsUp', 'clap', 'tpose'] as Gesture[]) {
      if (now.has(g)) {
        const n = (this.pending.get(g) ?? 0) + 1;
        this.pending.set(g, n);
        if (n >= 2) this.active.add(g);
      } else {
        this.pending.set(g, 0);
        this.active.delete(g);
      }
    }
    return this.active;
  }

  reset(): void {
    this.active.clear();
    this.pending.clear();
  }
}
