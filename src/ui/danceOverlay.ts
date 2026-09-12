import { LM, SKELETON, type Pose } from '../pose/landmarks';
import type { FloorGrid } from '../dance/grid';
import { CELL_NAMES, type Foot } from '../dance/types';

export interface TargetDraw {
  cell: number;
  foot: Foot | 'both';
  /** 0 = 還很遠，1 = 就是現在 */
  progress: number;
}

export interface FlashDraw {
  cell: number;
  color: string;
  /** 0..1 淡出 */
  alpha: number;
}

export interface DanceOverlayOptions {
  mirrored: boolean;
  grid: FloorGrid | null;
  feet: Record<Foot, number | null>;
  targets: TargetDraw[];
  flashes: FlashDraw[];
  showLabels: boolean;
  /** 0..1，剛打到拍點時為 1，之後衰減；用來讓格線隨節拍閃動 */
  beatPulse: number;
}

export const FOOT_COLOR: Record<Foot | 'both', string> = {
  L: '#60a5fa',
  R: '#fb923c',
  both: '#4ade80',
};
export const FOOT_LABEL: Record<Foot | 'both', string> = { L: '左腳', R: '右腳', both: '雙腳跳' };

/** 跳舞畫面的疊加：地板九宮格、目標格、雙腳位置、淡淡的骨架。 */
export class DanceOverlay {
  private ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  draw(pose: Pose | null, opts: DanceOverlayOptions): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    ctx.clearRect(0, 0, w, canvas.height);
    const scale = Math.max(1, Math.min(w, canvas.height) / 360);
    const mx = (x: number) => (opts.mirrored ? w - x : x);
    const poly = (cell: number, inset = 0) => {
      const pts = opts.grid!.polygon(cell);
      const c = opts.grid!.center(cell);
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = mx(c.x + (p.x - c.x) * (1 - inset));
        const y = c.y + (p.y - c.y) * (1 - inset);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    };

    if (opts.grid) {
      // 九宮格底：先鋪深色底，再畫「深色描邊 + 白色亮線」的雙層格線
      for (let cell = 0; cell < 9; cell++) {
        poly(cell);
        ctx.fillStyle = cell === 4 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)';
        ctx.fill();
      }
      const glow = 0.55 + 0.45 * opts.beatPulse;
      for (let cell = 0; cell < 9; cell++) {
        poly(cell);
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 9 * scale;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${glow})`;
        ctx.lineWidth = (4 + 2 * opts.beatPulse) * scale;
        ctx.stroke();
      }
      if (opts.showLabels) {
        for (let cell = 0; cell < 9; cell++) {
          const c = opts.grid.center(cell);
          ctx.font = `bold ${16 * scale}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4 * scale;
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.strokeText(CELL_NAMES[cell], mx(c.x), c.y + 6 * scale);
          ctx.fillStyle = '#fff';
          ctx.fillText(CELL_NAMES[cell], mx(c.x), c.y + 6 * scale);
        }
      }
      // 命中閃光
      for (const f of opts.flashes) {
        poly(f.cell);
        ctx.fillStyle = f.color;
        ctx.globalAlpha = f.alpha * 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // 目標格：整格實心亮色（隨接近變濃、隨節拍脈動），外框由大縮小到貼齊格子
      for (const t of opts.targets) {
        const color = FOOT_COLOR[t.foot];
        const p = Math.min(1, Math.max(0, t.progress));
        poly(t.cell);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.45 + 0.4 * p + 0.15 * opts.beatPulse;
        ctx.fill();
        ctx.globalAlpha = 1;
        const inset = -(1 - p) * 0.9; // 負 inset = 放大
        poly(t.cell, inset);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = (7 + 3 * p) * scale;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = (4 + 3 * p) * scale;
        ctx.stroke();
        const c = opts.grid.center(t.cell);
        const label = t.foot === 'both' ? '跳' : t.foot === 'L' ? '左' : '右';
        ctx.font = `bold ${26 * scale}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 5 * scale;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(label, mx(c.x), c.y + 9 * scale);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, mx(c.x), c.y + 9 * scale);
      }
    }

    if (!pose) return;

    // 淡淡的骨架
    ctx.strokeStyle = 'rgba(79,209,197,0.45)';
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = 'round';
    for (const [a, b] of SKELETON) {
      const pa = pose[a];
      const pb = pose[b];
      if (pa.visibility < 0.4 || pb.visibility < 0.4) continue;
      ctx.beginPath();
      ctx.moveTo(mx(pa.x), pa.y);
      ctx.lineTo(mx(pb.x), pb.y);
      ctx.stroke();
    }

    // 雙腳標記
    for (const foot of ['L', 'R'] as Foot[]) {
      const p = pose[foot === 'L' ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE];
      if (p.visibility < 0.4) continue;
      ctx.fillStyle = FOOT_COLOR[foot];
      ctx.beginPath();
      ctx.arc(mx(p.x), p.y, 11 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
      ctx.fillStyle = '#0b1020';
      ctx.font = `bold ${12 * scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(foot, mx(p.x), p.y + 4 * scale);
    }
  }
}
