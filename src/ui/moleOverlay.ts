import type { Pose } from '../pose/landmarks';
import type { Mole } from '../mole/game';
import type { HoleLayout } from '../mole/layout';
import type { Hand } from '../mole/detect';

export interface MoleFx {
  hole: number;
  text: string;
  color: string;
  until: number;
  /** 0..1 淡出 */
  alpha: number;
}

export interface MoleOverlayOptions {
  mirrored: boolean;
  layout: HoleLayout | null;
  moles: Map<number, Mole>;
  /** 目前遊戲時間（毫秒） */
  t: number;
  hands: Record<Hand, { x: number; y: number } | null>;
  fx: MoleFx[];
}

export const HAND_COLOR: Record<Hand, string> = { L: '#60a5fa', R: '#fb923c' };

/** 打地鼠疊加：洞、地鼠、雙手。 */
export class MoleOverlay {
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

  draw(_pose: Pose | null, opts: MoleOverlayOptions): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    ctx.clearRect(0, 0, w, canvas.height);
    const scale = Math.max(1, Math.min(w, canvas.height) / 360);
    const mx = (x: number) => (opts.mirrored ? w - x : x);
    if (!opts.layout) return;
    const r = opts.layout.radius;

    // 洞（後排先畫）
    opts.layout.centers.forEach((c, i) => {
      const x = mx(c.x);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.ellipse(x, c.y + r * 0.35, r * 1.05, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 3 * scale;
      ctx.stroke();
      // 地鼠
      const m = opts.moles.get(i);
      if (m) {
        const age = opts.t - m.upAt;
        const left = m.hideAt - opts.t;
        const rise = Math.min(1, age / 140);
        const sink = Math.min(1, Math.max(0, left / 160));
        const s = Math.min(rise, sink);
        const my = c.y + r * 0.35 - r * 0.9 * s;
        const color = m.kind === 'bomb' ? '#1f2937' : m.kind === 'golden' ? '#fbbf24' : '#b45309';
        if (m.kind === 'golden') {
          ctx.strokeStyle = 'rgba(251,191,36,0.9)';
          ctx.lineWidth = 6 * scale;
          ctx.beginPath();
          ctx.arc(x, my, r * 0.95 * s + 4 * scale, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, my, r * 0.8 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3 * scale;
        ctx.stroke();
        ctx.font = `${r * 1.1 * s}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.kind === 'bomb' ? '💣' : '🐹', x, my);
        ctx.textBaseline = 'alphabetic';
        // 剩餘時間環
        const frac = Math.max(0, left / (m.hideAt - m.upAt));
        ctx.strokeStyle = m.kind === 'bomb' ? '#f87171' : '#4ade80';
        ctx.lineWidth = 4 * scale;
        ctx.beginPath();
        ctx.arc(x, my, r * 0.95 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.stroke();
      }
    });

    // 特效文字
    for (const f of opts.fx) {
      const c = opts.layout.centers[f.hole];
      ctx.globalAlpha = f.alpha;
      ctx.font = `bold ${r * 0.9}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5 * scale;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(f.text, mx(c.x), c.y - r * (0.6 + (1 - f.alpha) * 0.6));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, mx(c.x), c.y - r * (0.6 + (1 - f.alpha) * 0.6));
      ctx.globalAlpha = 1;
    }

    // 雙手
    for (const hand of ['L', 'R'] as Hand[]) {
      const p = opts.hands[hand];
      if (!p) continue;
      ctx.fillStyle = HAND_COLOR[hand];
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(mx(p.x), p.y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3 * scale;
      ctx.stroke();
      ctx.fillStyle = '#0b1020';
      ctx.font = `bold ${r * 0.4}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(hand, mx(p.x), p.y + r * 0.14);
    }
  }
}
