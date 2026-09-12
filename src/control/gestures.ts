import { LM, type Pose } from '../pose/landmarks';

/**
 * 免碰手機的控制手勢：
 * - raiseOne：單手高舉過頭、另一手自然垂下 → 開始／下一個
 * - crossArms：雙手在胸前交叉（手腕靠近對側肩膀）→ 跳過／結束
 * 這兩個手勢刻意避開運動動作（雙手上舉、彎舉）與跳舞手勢（雙手舉手、拍手、張開雙臂）。
 */
export type ControlGesture = 'raiseOne' | 'crossArms';

export const CONTROL_LABEL: Record<ControlGesture, string> = {
  raiseOne: '開始',
  crossArms: '跳過',
};

export const CONTROL_HINT = '✋ 單手高舉 1.5 秒＝開始／下一個　✖ 雙手胸前交叉 1.5 秒＝跳過';

export interface ControlDetection {
  gesture: ControlGesture;
  /** 畫進度環的位置（影像座標） */
  anchor: { x: number; y: number };
}

export function detectControlGesture(pose: Pose): ControlDetection | null {
  const ls = pose[LM.LEFT_SHOULDER];
  const rs = pose[LM.RIGHT_SHOULDER];
  const lw = pose[LM.LEFT_WRIST];
  const rw = pose[LM.RIGHT_WRIST];
  const nose = pose[LM.NOSE];
  const vis = (p: { visibility: number }) => p.visibility >= 0.4;
  if (![ls, rs, lw, rw].every(vis)) return null;
  const sw = Math.max(1, Math.hypot(ls.x - rs.x, ls.y - rs.y));

  // 雙手胸前交叉：左腕靠近右肩、右腕靠近左肩
  const lwToRs = Math.hypot(lw.x - rs.x, lw.y - rs.y);
  const rwToLs = Math.hypot(rw.x - ls.x, rw.y - ls.y);
  if (lwToRs < 0.5 * sw && rwToLs < 0.5 * sw) {
    return { gesture: 'crossArms', anchor: { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 + 0.6 * sw } };
  }

  // 單手高舉：一手腕高於鼻子，另一手腕低於肩膀一段距離
  if (vis(nose)) {
    const lUp = lw.y < nose.y - 0.1 * sw;
    const rUp = rw.y < nose.y - 0.1 * sw;
    const lDown = lw.y > ls.y + 0.5 * sw;
    const rDown = rw.y > rs.y + 0.5 * sw;
    if (lUp && rDown) return { gesture: 'raiseOne', anchor: { x: lw.x, y: lw.y } };
    if (rUp && lDown) return { gesture: 'raiseOne', anchor: { x: rw.x, y: rw.y } };
  }
  return null;
}

export interface HoldState {
  gesture: ControlGesture | null;
  /** 0..1 */
  progress: number;
  anchor: { x: number; y: number } | null;
}

/** 手勢要維持一段時間才觸發；觸發後要先放下再做一次才會再觸發。 */
export class HoldController {
  private current: ControlGesture | null = null;
  private since = 0;
  private armed = true;
  private lastFired = -Infinity;
  state: HoldState = { gesture: null, progress: 0, anchor: null };

  constructor(
    private readonly holdMs = 1500,
    private readonly cooldownMs = 1200,
  ) {}

  update(pose: Pose | null, now: number): ControlGesture | null {
    const det = pose ? detectControlGesture(pose) : null;
    if (!det) {
      this.current = null;
      this.armed = true;
      this.state = { gesture: null, progress: 0, anchor: null };
      return null;
    }
    if (det.gesture !== this.current) {
      this.current = det.gesture;
      this.since = now;
    }
    const inCooldown = now - this.lastFired < this.cooldownMs;
    const progress = this.armed && !inCooldown ? Math.min(1, (now - this.since) / this.holdMs) : 0;
    this.state = { gesture: det.gesture, progress, anchor: det.anchor };
    if (this.armed && !inCooldown && progress >= 1) {
      this.armed = false;
      this.lastFired = now;
      this.state.progress = 0;
      return det.gesture;
    }
    return null;
  }

  reset(): void {
    this.current = null;
    this.armed = true;
    this.state = { gesture: null, progress: 0, anchor: null };
  }
}

/** 在畫布上畫維持進度環（畫布本身不做 CSS 鏡像，這裡自行換算）。 */
export function drawHoldRing(canvas: HTMLCanvasElement, state: HoldState, mirrored: boolean): void {
  if (!state.gesture || !state.anchor || state.progress <= 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const scale = Math.max(1, Math.min(canvas.width, canvas.height) / 360);
  const x = mirrored ? canvas.width - state.anchor.x : state.anchor.x;
  const y = state.anchor.y;
  const r = 30 * scale;
  ctx.save();
  ctx.lineWidth = 6 * scale;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = state.gesture === 'raiseOne' ? '#4ade80' : '#f87171';
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.progress);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${14 * scale}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(CONTROL_LABEL[state.gesture], x, y + r + 18 * scale);
  ctx.restore();
}
