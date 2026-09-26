import { LM, type Pose } from '../pose/landmarks';
import { OneEuro2D } from '../pose/smoothing';
import { holeAt, type HoleLayout } from './layout';

/** 依手腕速度往前推算的時間（毫秒），抵銷相機與偵測的延遲 */
export const LEAD_MS = 100;
/** 手速低於這個值（像素／秒）就不做預測，避免靜止時抖動 */
const PREDICT_MIN_SPEED = 250;

/** 點到線段的最短距離 */
export function segmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

export type Hand = 'L' | 'R';

export interface HandEvent {
  hand: Hand;
  hole: number;
  t: number;
}

/**
 * 追蹤雙手手腕：用未平滑的位置，依速度往前預測，並檢查「上一幀到預測位置」的路徑有沒有掃過洞，
 * 快速揮過也不會漏判。手一直放在同一個洞不會重複觸發。
 */
export class HandTracker {
  holes: Record<Hand, number | null> = { L: null, R: null };
  /** 顯示用：濾波並預測後的位置 */
  pos: Record<Hand, { x: number; y: number } | null> = { L: null, R: null };
  private last: Record<Hand, { x: number; y: number; t: number } | null> = { L: null, R: null };
  /** 自適應濾波：靜止去抖、快動不拖延 */
  private filters: Record<Hand, OneEuro2D> = { L: new OneEuro2D(1.2, 0.01), R: new OneEuro2D(1.2, 0.01) };

  update(pose: Pose, layout: HoleLayout, t: number): HandEvent[] {
    const events: HandEvent[] = [];
    const reach = layout.radius * 1.4;
    for (const hand of ['L', 'R'] as Hand[]) {
      const p = pose[hand === 'L' ? LM.LEFT_WRIST : LM.RIGHT_WRIST];
      if (p.visibility < 0.4) {
        this.pos[hand] = null;
        this.holes[hand] = null;
        this.last[hand] = null;
        this.filters[hand].reset();
        continue;
      }
      const prev = this.last[hand];
      const f = this.filters[hand].push({ x: p.x, y: p.y }, t);
      const v = this.filters[hand].velocity; // 像素／秒
      let pred = { x: f.x, y: f.y };
      const speed = Math.hypot(v.x, v.y);
      if (prev && speed > PREDICT_MIN_SPEED) {
        let dx = (v.x * LEAD_MS) / 1000;
        let dy = (v.y * LEAD_MS) / 1000;
        const mag = Math.hypot(dx, dy);
        const cap = layout.radius * 1.5;
        if (mag > cap) {
          dx *= cap / mag;
          dy *= cap / mag;
        }
        pred = { x: f.x + dx, y: f.y + dy };
      }
      this.pos[hand] = pred;
      const from = prev ? { x: prev.x, y: prev.y } : pred;
      const swept: number[] = [];
      layout.centers.forEach((c, i) => {
        if (segmentDistance(c, from, pred) <= reach) swept.push(i);
      });
      const resting = this.holes[hand];
      for (const h of swept) if (h !== resting) events.push({ hand, hole: h, t });
      this.holes[hand] = holeAt(layout, pred);
      this.last[hand] = { x: f.x, y: f.y, t };
    }
    return events;
  }

  reset(): void {
    this.holes = { L: null, R: null };
    this.pos = { L: null, R: null };
    this.last = { L: null, R: null };
    this.filters.L.reset();
    this.filters.R.reset();
  }
}
