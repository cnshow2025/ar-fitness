export type Facing = 'user' | 'environment';

/** 手機相機控制：開啟、切換前後鏡頭、關閉。 */
export class Camera {
  private stream: MediaStream | null = null;
  facing: Facing = 'user';

  constructor(private readonly video: HTMLVideoElement) {
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    video.autoplay = true;
  }

  async start(facing: Facing = this.facing): Promise<void> {
    this.stop();
    this.facing = facing;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('此瀏覽器不支援相機，請改用 Chrome 或 Safari，並以 https 開啟。');
    }
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError') throw new Error('相機權限被拒絕，請在瀏覽器設定允許使用相機。');
      if (name === 'NotFoundError') throw new Error('找不到可用的相機。');
      throw err;
    }
    this.video.srcObject = this.stream;
    await new Promise<void>((resolve) => {
      if (this.video.readyState >= 2) return resolve();
      this.video.onloadedmetadata = () => resolve();
    });
    await this.video.play();
  }

  async flip(): Promise<void> {
    await this.start(this.facing === 'user' ? 'environment' : 'user');
  }

  /** 前鏡頭要鏡像顯示，使用者才會覺得像照鏡子。 */
  get mirrored(): boolean {
    return this.facing === 'user';
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}
