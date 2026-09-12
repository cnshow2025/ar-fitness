/** 用 Web Audio 合成鼓點與提示音；同時當作遊戲的時鐘。 */
export class BeatAudio {
  private ctx: AudioContext | null = null;
  private bpm = 100;
  private startCtxTime = 0;
  private startPerfTime = 0;
  private nextBeat = 0;
  private totalBeats = 0;
  private timer = 0;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;
  enabled = true;

  get supported(): boolean {
    return typeof AudioContext !== 'undefined' || typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined';
  }

  /** 需要在使用者點擊時呼叫，iOS 才會允許播放。 */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.1);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  /**
   * 開始播放節拍。回傳 beat 0 對應的 performance.now() 時間（毫秒）。
   * 之後遊戲用 performance.now() 就能換算成拍數。
   */
  start(bpm: number, totalBeats: number, delaySec = 0.3): number {
    if (!this.ctx || !this.master) throw new Error('audio not unlocked');
    this.stop();
    this.bpm = bpm;
    this.totalBeats = totalBeats;
    this.startCtxTime = this.ctx.currentTime + delaySec;
    this.startPerfTime = performance.now() + delaySec * 1000;
    this.nextBeat = 0;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 80);
    return this.startPerfTime;
  }

  private schedule(): void {
    if (!this.ctx) return;
    const ahead = 0.3;
    const secPerBeat = 60 / this.bpm;
    while (this.nextBeat < this.totalBeats) {
      const t = this.startCtxTime + this.nextBeat * secPerBeat;
      if (t > this.ctx.currentTime + ahead) break;
      if (this.enabled) {
        const inBar = this.nextBeat % 4;
        this.kick(t, inBar === 0 ? 1.2 : 0.95);
        if (inBar === 0) this.click(t, 1800, 0.45, 0.09);
        else this.click(t, 1000, 0.22, 0.05);
        if (inBar === 1 || inBar === 3) this.snare(t, 0.35);
        this.hat(t + secPerBeat / 2, 0.12);
      }
      this.nextBeat += 1;
    }
  }

  private kick(t: number, vol: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private hat(t: number, vol: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'highpass';
    bp.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.06);
  }

  private snare(t: number, vol: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.13);
  }

  private click(t: number, freq: number, vol: number, dur = 0.06): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  /** 命中／失誤提示音（立即播放）。 */
  playJudgement(kind: 'perfect' | 'good' | 'miss'): void {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    if (kind === 'perfect') {
      this.click(t, 1568, 0.3, 0.08);
      this.click(t + 0.06, 2093, 0.25, 0.1);
    } else if (kind === 'good') {
      this.click(t, 1047, 0.25, 0.08);
    } else {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.15);
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  /** 目前拍數（以 performance.now 換算）。 */
  beatAt(perfNow: number): number {
    return ((perfNow - this.startPerfTime) / 1000) * (this.bpm / 60);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  close(): void {
    this.stop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }
}
