import { LM, type Pose } from '../pose/landmarks';
import { holeAt, type HoleLayout } from './layout';

export type Hand = 'L' | 'R';

export interface HandEvent {
  hand: Hand;
  hole: number;
  t: number;
}

/** 追蹤雙手手腕在哪個洞；進到新的洞時發出事件（手一直放在同一個洞不會重複觸發）。 */
export class HandTracker {
  holes: Record<Hand, number | null> = { L: null, R: null };
  pos: Record<Hand, { x: number; y: number } | null> = { L: null, R: null };

  update(pose: Pose, layout: HoleLayout, t: number): HandEvent[] {
    const events: HandEvent[] = [];
    for (const hand of ['L', 'R'] as Hand[]) {
      const p = pose[hand === 'L' ? LM.LEFT_WRIST : LM.RIGHT_WRIST];
      if (p.visibility < 0.4) {
        this.pos[hand] = null;
        this.holes[hand] = null;
        continue;
      }
      this.pos[hand] = { x: p.x, y: p.y };
      const hole = holeAt(layout, p);
      if (hole !== this.holes[hand]) {
        this.holes[hand] = hole;
        if (hole !== null) events.push({ hand, hole, t });
      }
    }
    return events;
  }

  reset(): void {
    this.holes = { L: null, R: null };
    this.pos = { L: null, R: null };
  }
}
