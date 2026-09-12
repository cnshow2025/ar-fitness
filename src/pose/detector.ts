import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Pose } from './landmarks';
import { PoseSmoother } from './smoothing';

const LOCAL_MODEL = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;
const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const WASM_PATH = `${import.meta.env.BASE_URL}wasm`;

export interface DetectionFrame {
  /** 像素座標的 33 個關鍵點；偵測不到人時為 null。 */
  pose: Pose | null;
  /** 影像寬高（像素） */
  width: number;
  height: number;
  /** performance.now() 時間戳 */
  timestamp: number;
}

/** MediaPipe Pose Landmarker 封裝：負責載入模型與逐幀偵測。 */
export class PoseDetector {
  private landmarker: PoseLandmarker | null = null;
  private smoother = new PoseSmoother(0.55);
  private lastTimestamp = -1;

  async load(onProgress?: (msg: string) => void): Promise<void> {
    onProgress?.('載入姿勢偵測引擎…');
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    onProgress?.('載入姿勢模型…');
    const create = (modelAssetPath: string, delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    // 先用站台自己提供的模型檔，失敗再用 Google 的；GPU 不行就退回 CPU。
    const attempts: Array<[string, 'GPU' | 'CPU']> = [
      [LOCAL_MODEL, 'GPU'],
      [LOCAL_MODEL, 'CPU'],
      [REMOTE_MODEL, 'GPU'],
      [REMOTE_MODEL, 'CPU'],
    ];
    let lastErr: unknown = null;
    for (const [url, delegate] of attempts) {
      try {
        this.landmarker = await create(url, delegate);
        return;
      } catch (err) {
        console.warn(`PoseLandmarker init failed (${url === LOCAL_MODEL ? 'local' : 'remote'}, ${delegate})`, err);
        lastErr = err;
      }
    }
    throw new Error(`無法載入姿勢模型：${(lastErr as Error)?.message ?? lastErr}`);
  }

  get ready(): boolean {
    return this.landmarker !== null;
  }

  detect(video: HTMLVideoElement, timestamp: number): DetectionFrame {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!this.landmarker || width === 0 || height === 0) {
      return { pose: null, width, height, timestamp };
    }
    // MediaPipe 要求時間戳嚴格遞增。
    if (timestamp <= this.lastTimestamp) timestamp = this.lastTimestamp + 1;
    this.lastTimestamp = timestamp;

    const result = this.landmarker.detectForVideo(video, timestamp);
    const raw = result.landmarks[0];
    if (!raw) {
      this.smoother.reset();
      return { pose: null, width, height, timestamp };
    }
    const pose: Pose = raw.map((p) => ({
      x: p.x * width,
      y: p.y * height,
      z: p.z * width,
      visibility: p.visibility ?? 0,
    }));
    return { pose: this.smoother.push(pose), width, height, timestamp };
  }

  reset(): void {
    this.smoother.reset();
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
