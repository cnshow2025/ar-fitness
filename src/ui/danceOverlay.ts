import { LM, SKELETON, type Pose } from '../pose/landmarks';
import type { FloorGrid } from '../dance/grid';
import { CELL_NAMES, cellCol, cellRow, type Foot } from '../dance/types';

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
  /** pad＝俯視跳舞墊，ar＝貼地透視格 */
  mode: 'pad' | 'ar';
  /** 跳舞墊上排代表往後退（像照鏡子）；false 則上排代表往手機走 */
  upIsBack: boolean;
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
    if (opts.mode === 'pad') {
      this.drawPad(pose, opts);
      return;
    }
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

  /**
   * 俯視跳舞墊：畫在腳邊的平面 3×3，上排＝靠近手機（資料 row 2）、下排＝遠離手機（row 0），
   * 左右＝玩家的左右。腳的位置依連續格子座標畫在墊子上。
   */
  private drawPad(pose: Pose | null, opts: DanceOverlayOptions): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const scale = Math.max(1, Math.min(w, h) / 360);
    const mx = (x: number) => (opts.mirrored ? w - x : x);

    // 淡淡的骨架（先畫，墊子疊在上面）
    if (pose) {
      ctx.strokeStyle = 'rgba(79,209,197,0.4)';
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
    }
    if (!opts.grid) return;

    const cell = Math.min(w, h) * 0.22;
    const padW = cell * 3;
    const pad = 12 * scale;
    const padCx = Math.min(w - padW / 2 - pad, Math.max(padW / 2 + pad, opts.grid.cal.cx));
    const padCy = Math.min(h - padW / 2 - 40 * scale, Math.max(padW / 2 + 60 * scale, opts.grid.cal.cy));
    const padTop = padCy - padW / 2;
    // 資料格 → 影像座標矩形（col 0 = 玩家左 = 影像 x 較大）
    // upIsBack：row 0（後）在上排，跟鏡像影像一致；否則 row 2（前）在上排
    const padRow = (row: number) => (opts.upIsBack ? row : 2 - row);
    const rectOf = (c: number) => {
      const col = cellCol(c);
      const row = cellRow(c);
      const x0 = padCx + (1 - col) * cell - cell / 2;
      const y0 = padTop + padRow(row) * cell;
      const sx = Math.min(mx(x0), mx(x0 + cell));
      return { x: sx, y: y0, w: cell, h: cell };
    };
    const roundRect = (r: { x: number; y: number; w: number; h: number }, inset: number) => {
      const rad = 10 * scale;
      const x = r.x + inset;
      const y = r.y + inset;
      const ww = r.w - inset * 2;
      const hh = r.h - inset * 2;
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, rad);
      ctx.arcTo(x + ww, y + hh, x, y + hh, rad);
      ctx.arcTo(x, y + hh, x, y, rad);
      ctx.arcTo(x, y, x + ww, y, rad);
      ctx.closePath();
    };

    // 墊子底
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect({ x: mx(padCx + padW / 2) < mx(padCx - padW / 2) ? mx(padCx + padW / 2) : mx(padCx - padW / 2), y: padTop, w: padW, h: padW }, -8 * scale);
    ctx.fill();
    const glow = 0.55 + 0.45 * opts.beatPulse;
    for (let c = 0; c < 9; c++) {
      const r = rectOf(c);
      roundRect(r, 3 * scale);
      ctx.fillStyle = c === 4 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${glow})`;
      ctx.lineWidth = (2 + 2 * opts.beatPulse) * scale;
      ctx.stroke();
    }
    // 命中閃光
    for (const f of opts.flashes) {
      roundRect(rectOf(f.cell), 3 * scale);
      ctx.fillStyle = f.color;
      ctx.globalAlpha = f.alpha * 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 目標格
    for (const t of opts.targets) {
      const color = FOOT_COLOR[t.foot];
      const p = Math.min(1, Math.max(0, t.progress));
      const r = rectOf(t.cell);
      roundRect(r, 3 * scale);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5 + 0.35 * p + 0.15 * opts.beatPulse;
      ctx.fill();
      ctx.globalAlpha = 1;
      roundRect(r, -(1 - p) * cell * 0.45);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = (7 + 3 * p) * scale;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = (4 + 3 * p) * scale;
      ctx.stroke();
      const label = t.foot === 'both' ? '跳' : t.foot === 'L' ? '左' : '右';
      ctx.font = `bold ${cell * 0.42}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5 * scale;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(label, r.x + r.w / 2, r.y + r.h / 2 + cell * 0.15);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + cell * 0.15);
    }
    // 格子名稱
    if (opts.showLabels) {
      ctx.font = `bold ${14 * scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      for (let c = 0; c < 9; c++) {
        const r = rectOf(c);
        ctx.lineWidth = 3 * scale;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(CELL_NAMES[c], r.x + r.w / 2, r.y + r.h - 8 * scale);
        ctx.fillStyle = '#fff';
        ctx.fillText(CELL_NAMES[c], r.x + r.w / 2, r.y + r.h - 8 * scale);
      }
    }
    // 方向標記
    const centerSx = (rectOf(3).x + rectOf(5).x + cell) / 2;
    ctx.font = `bold ${13 * scale}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3 * scale;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    const topText = opts.upIsBack ? '後（往後退）' : '📱 手機這邊（前）';
    const bottomText = opts.upIsBack ? '📱 手機這邊（前）' : '後（往後退）';
    ctx.strokeText(topText, centerSx, padTop - 14 * scale);
    ctx.fillStyle = '#fff';
    ctx.fillText(topText, centerSx, padTop - 14 * scale);
    ctx.strokeText(bottomText, centerSx, padTop + padW + 22 * scale);
    ctx.fillText(bottomText, centerSx, padTop + padW + 22 * scale);

    if (!pose) return;
    // 雙腳：畫在墊子上的對應位置
    for (const foot of ['L', 'R'] as Foot[]) {
      const p = pose[foot === 'L' ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE];
      if (p.visibility < 0.4) continue;
      const { colCont, rowCont } = opts.grid.continuous(p);
      const ix = padCx + (1.5 - colCont) * cell;
      const y = padTop + (opts.upIsBack ? rowCont : 3 - rowCont) * cell;
      const x = mx(ix);
      ctx.fillStyle = FOOT_COLOR[foot];
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3 * scale;
      ctx.stroke();
      ctx.fillStyle = '#0b1020';
      ctx.font = `bold ${cell * 0.16}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(foot, x, y + cell * 0.06);
      // 實際腳踝位置也點一下，方便對照
      ctx.fillStyle = FOOT_COLOR[foot];
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(mx(p.x), p.y, 6 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
