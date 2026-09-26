import type { Pose } from './landmarks';

/**
 * 指數移動平均，用來平滑關鍵點與角度，減少抖動。
 * alpha 越大越跟隨新值（反應快、抖動多），越小越平滑（延遲多）。
 */
export class EmaValue {
  private value: number | null = null;
  constructor(private readonly alpha: number) {}

  push(next: number): number {
    this.value = this.value === null ? next : this.value + this.alpha * (next - this.value);
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

export class PoseSmoother {
  private prev: Pose | null = null;
  constructor(private readonly alpha = 0.5) {}

  push(pose: Pose): Pose {
    if (!this.prev || this.prev.length !== pose.length) {
      this.prev = pose.map((p) => ({ ...p }));
      return this.prev;
    }
    const a = this.alpha;
    const out = pose.map((p, i) => {
      const q = this.prev![i];
      // 可見度突然掉下去時，不要把舊位置拖著走。
      if (p.visibility < 0.3) return { ...p };
      return {
        x: q.x + a * (p.x - q.x),
        y: q.y + a * (p.y - q.y),
        z: q.z + a * (p.z - q.z),
        visibility: p.visibility,
      };
    });
    this.prev = out;
    return out;
  }

  reset(): void {
    this.prev = null;
  }
}

/** 用最近幾幀的數值估計變化速度（單位／秒）。 */
export class VelocityEstimator {
  private samples: Array<{ t: number; v: number }> = [];
  constructor(private readonly windowMs = 250) {}

  push(t: number, v: number): number {
    this.samples.push({ t, v });
    const cutoff = t - this.windowMs;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift();
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return 0;
    return (last.v - first.v) / dt;
  }

  reset(): void {
    this.samples = [];
  }
}

/**
 * One Euro filter（2D）：慢動作時強力去抖、快動作時幾乎不濾也不拖延。
 * minCutoff 越小越平滑（靜止時），beta 越大越跟得上快速移動。
 */
export class OneEuro2D {
  private xPrev: { x: number; y: number } | null = null;
  private dxPrev = { x: 0, y: 0 };
  private tPrev = 0;
  /** 最近一次濾波後的速度（單位／秒） */
  velocity = { x: 0, y: 0 };

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.01,
    private readonly dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  push(p: { x: number; y: number }, tMs: number): { x: number; y: number } {
    if (!this.xPrev) {
      this.xPrev = { ...p };
      this.tPrev = tMs;
      return { ...p };
    }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    this.tPrev = tMs;
    const dx = { x: (p.x - this.xPrev.x) / dt, y: (p.y - this.xPrev.y) / dt };
    const ad = this.alpha(this.dCutoff, dt);
    const dxHat = { x: this.dxPrev.x + ad * (dx.x - this.dxPrev.x), y: this.dxPrev.y + ad * (dx.y - this.dxPrev.y) };
    this.dxPrev = dxHat;
    this.velocity = dxHat;
    const speed = Math.hypot(dxHat.x, dxHat.y);
    const cutoff = this.minCutoff + this.beta * speed;
    const a = this.alpha(cutoff, dt);
    const out = { x: this.xPrev.x + a * (p.x - this.xPrev.x), y: this.xPrev.y + a * (p.y - this.xPrev.y) };
    this.xPrev = out;
    return out;
  }

  reset(): void {
    this.xPrev = null;
    this.dxPrev = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
  }
}
