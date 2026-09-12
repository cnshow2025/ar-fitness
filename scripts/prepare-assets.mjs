// 建置前準備：
// 1. 把 MediaPipe 的 WASM 檔複製到 public/wasm（讓 App 自己提供，不依賴外部 CDN）。
// 2. 若 public/models 沒有姿勢模型，就下載一份（部署站自己提供模型檔）。
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = resolve(root, 'public/wasm');
mkdirSync(wasmDst, { recursive: true });
cpSync(wasmSrc, wasmDst, { recursive: true });
console.log('[prepare-assets] WASM copied to public/wasm');

const modelDir = resolve(root, 'public/models');
const modelFile = resolve(modelDir, 'pose_landmarker_lite.task');
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
mkdirSync(modelDir, { recursive: true });
if (existsSync(modelFile)) {
  console.log('[prepare-assets] model already present');
} else {
  try {
    const res = await fetch(modelUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(modelFile, Buffer.from(await res.arrayBuffer()));
    console.log('[prepare-assets] model downloaded');
  } catch (err) {
    console.warn(`[prepare-assets] model download failed (${err}); app will fall back to the Google-hosted URL at runtime`);
  }
}
