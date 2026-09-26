/** 打地鼠音效（Web Audio 合成）。 */
export class MoleSfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;

  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.15);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'triangle', slideTo?: number): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  pop(): void {
    this.tone(500, 0.09, 0.18, 'sine', 900);
  }

  hit(golden = false): void {
    this.tone(golden ? 1318 : 880, 0.08, 0.35, 'square');
    this.tone(golden ? 1760 : 1175, 0.12, 0.3, 'square');
    if (golden) this.tone(2349, 0.16, 0.25, 'triangle');
  }

  miss(): void {
    this.tone(300, 0.15, 0.15, 'sine', 180);
  }

  bomb(): void {
    if (!this.ctx || !this.master || !this.noise || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(100, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.36);
  }

  tick(): void {
    this.tone(1000, 0.04, 0.15, 'square');
  }

  close(): void {
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }
}
