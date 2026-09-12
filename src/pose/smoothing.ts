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
