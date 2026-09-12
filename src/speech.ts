/** 語音提示：用瀏覽器內建的 speechSynthesis，優先挑中文語音。 */
class Speech {
  enabled = true;
  private voice: SpeechSynthesisVoice | null = null;
  private unlocked = false;

  constructor() {
    if (typeof speechSynthesis === 'undefined') return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this.voice =
        voices.find((v) => v.lang === 'zh-TW') ??
        voices.find((v) => v.lang.toLowerCase().startsWith('zh')) ??
        voices.find((v) => v.lang.toLowerCase().startsWith('cmn')) ??
        null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  }

  get supported(): boolean {
    return typeof speechSynthesis !== 'undefined';
  }

  /** iOS 需要在使用者點擊時先講一次才會允許之後自動播放。 */
  unlock(): void {
    if (!this.supported || this.unlocked) return;
    const u = new SpeechSynthesisUtterance('');
    speechSynthesis.speak(u);
    this.unlocked = true;
  }

  speak(text: string, opts: { interrupt?: boolean; rate?: number } = {}): void {
    if (!this.enabled || !this.supported || !text) return;
    if (opts.interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    if (this.voice) u.voice = this.voice;
    u.rate = opts.rate ?? 1.05;
    speechSynthesis.speak(u);
  }

  stop(): void {
    if (this.supported) speechSynthesis.cancel();
  }
}

export const speech = new Speech();
