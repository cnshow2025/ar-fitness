import { angleAt } from '../pose/angles';
import { LM, SKELETON, type Pose } from '../pose/landmarks';
import type { JointTriplet } from '../exercises/types';

export interface OverlayOptions {
  mirrored: boolean;
  /** 要標示角度的關節 */
  triplets: JointTriplet[];
  /** 0..1 每個 triplet 對應的進度（用來上色） */
  progress: number;
  showAngles: boolean;
}

const COLOR_BONE = 'rgba(79, 209, 197, 0.9)';
const COLOR_JOINT = '#f6ad55';
const COLOR_ACTIVE = '#ffd166';
const COLOR_DONE = '#4ade80';

/** 在相機畫面上疊加骨架與關節角度。 */
export class Overlay {
  private ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** 讓畫布解析度跟影像一致。 */
  resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(pose: Pose | null, opts: OverlayOptions): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!pose) return;

    const w = canvas.width;
    const scale = Math.max(1, Math.min(w, canvas.height) / 360);
    const mx = (x: number) => (opts.mirrored ? w - x : x);

    // 骨架
    ctx.lineWidth = 4 * scale;
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLOR_BONE;
    for (const [a, b] of SKELETON) {
      const pa = pose[a];
      const pb = pose[b];
      if (pa.visibility < 0.4 || pb.visibility < 0.4) continue;
      ctx.beginPath();
      ctx.moveTo(mx(pa.x), pa.y);
      ctx.lineTo(mx(pb.x), pb.y);
      ctx.stroke();
    }

    // 關節點
    ctx.fillStyle = COLOR_JOINT;
    const jointIds = new Set(SKELETON.flat());
    for (const id of jointIds) {
      const p = pose[id];
      if (p.visibility < 0.4) continue;
      ctx.beginPath();
      ctx.arc(mx(p.x), p.y, 5 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // 頭：用鼻子畫個小圓代表
    const nose = pose[LM.NOSE];
    if (nose.visibility > 0.4) {
      ctx.strokeStyle = COLOR_BONE;
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.arc(mx(nose.x), nose.y, 14 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 目前動作的關節：角度弧線 + 數字
    const color = opts.progress >= 0.85 ? COLOR_DONE : COLOR_ACTIVE;
    for (const t of opts.triplets) {
      const a = pose[t.a];
      const b = pose[t.b];
      const c = pose[t.c];
      if (a.visibility < 0.4 || b.visibility < 0.4 || c.visibility < 0.4) continue;
      const ang = angleAt(a, b, c);
      const r = 26 * scale;
      const start = Math.atan2(a.y - b.y, mx(a.x) - mx(b.x));
      const end = Math.atan2(c.y - b.y, mx(c.x) - mx(b.x));
      // 取較小的那段弧
      let diff = end - start;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.arc(mx(b.x), b.y, r, start, start + diff, diff < 0);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx(b.x), b.y, 8 * scale, 0, Math.PI * 2);
      ctx.fill();

      if (opts.showAngles) {
        const label = `${Math.round(ang)}°`;
        ctx.font = `bold ${16 * scale}px system-ui, sans-serif`;
        const tw = ctx.measureText(label).width;
        const lx = mx(b.x) + 14 * scale;
        const ly = b.y - 14 * scale;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(lx - 4 * scale, ly - 16 * scale, tw + 8 * scale, 22 * scale);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, lx, ly);
      }
    }
  }
}
