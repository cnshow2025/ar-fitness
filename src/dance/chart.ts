import { CENTER_CELL, cellCol, cellIndex, cellRow, type Foot, type Gesture, type Level, type Note } from './types';

export const LEVELS: Level[] = [
  { id: 1, name: '暖身：左右前後', bpm: 80, bars: 8, density: 1, diagonals: false, gestureProb: 0, jumpProb: 0, seed: 101 },
  { id: 2, name: '基本節拍', bpm: 90, bars: 8, density: 2, diagonals: false, gestureProb: 0.1, jumpProb: 0, seed: 202 },
  { id: 3, name: '加入斜角', bpm: 95, bars: 12, density: 2, diagonals: true, gestureProb: 0.12, jumpProb: 0, seed: 303 },
  { id: 4, name: '跳起來', bpm: 100, bars: 12, density: 2, diagonals: true, gestureProb: 0.12, jumpProb: 0.12, seed: 404 },
  { id: 5, name: '半拍出現', bpm: 105, bars: 12, density: 3, diagonals: true, gestureProb: 0.12, jumpProb: 0.12, seed: 505 },
  { id: 6, name: '加速', bpm: 115, bars: 16, density: 3, diagonals: true, gestureProb: 0.15, jumpProb: 0.15, seed: 606 },
  { id: 7, name: '舞林高手', bpm: 125, bars: 16, density: 3, diagonals: true, gestureProb: 0.15, jumpProb: 0.18, seed: 707 },
  { id: 8, name: '極限', bpm: 135, bars: 16, density: 3, diagonals: true, gestureProb: 0.18, jumpProb: 0.2, seed: 808 },
];

export const LEVEL_BY_ID: Record<number, Level> = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

/** 固定種子的亂數，同一關每次譜面都一樣。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 左腳只能用左欄與中欄，右腳只能用中欄與右欄，避免交叉腿。 */
export function allowedCols(foot: Foot): number[] {
  return foot === 'L' ? [0, 1] : [1, 2];
}

function chebyshev(a: number, b: number): number {
  return Math.max(Math.abs(cellRow(a) - cellRow(b)), Math.abs(cellCol(a) - cellCol(b)));
}

function isDiagonal(cell: number): boolean {
  return cellRow(cell) !== 1 && cellCol(cell) !== 1;
}

/** 這隻腳從目前位置可以踩去的格子。 */
export function candidateCells(foot: Foot, from: number, other: number, diagonals: boolean): number[] {
  const out: number[] = [];
  for (let cell = 0; cell < 9; cell++) {
    if (cell === from) continue;
    if (!allowedCols(foot).includes(cellCol(cell))) continue;
    if (!diagonals && isDiagonal(cell)) continue;
    if (chebyshev(cell, from) > 1) continue;
    if (cell === other && cell !== CENTER_CELL) continue;
    out.push(cell);
  }
  return out;
}

function beatsInBar(density: Level['density'], rnd: () => number): number[] {
  if (density === 1) return [0, 2];
  if (density === 2) return [0, 1, 2, 3];
  // density 3：偶爾插入半拍
  const base = [0, 1, 2, 3];
  const extra = rnd() < 0.5 ? [1.5] : [2.5];
  return [...base, ...extra].sort((a, b) => a - b);
}

/** 產生一關的譜面。第一小節前有 4 拍預備拍（beat 0..3），指令從 beat 4 開始。 */
export function generateChart(level: Level): Note[] {
  const rnd = mulberry32(level.seed);
  const notes: Note[] = [];
  let feet: Record<Foot, number> = { L: CENTER_CELL, R: CENTER_CELL };
  let lastFoot: Foot = 'R';
  const gestures: Gesture[] = ['handsUp', 'clap', 'tpose'];
  const LEAD_IN = 4;

  for (let bar = 0; bar < level.bars; bar++) {
    const beats = beatsInBar(level.density, rnd);
    for (const b of beats) {
      const beat = LEAD_IN + bar * 4 + b;
      const isHalf = b % 1 !== 0;
      // 手勢：只放在整拍，且前後至少空一拍讓人回位
      if (!isHalf && rnd() < level.gestureProb) {
        notes.push({ kind: 'gesture', beat, gesture: gestures[Math.floor(rnd() * gestures.length)] });
        continue;
      }
      // 雙腳跳：目標在中欄，兩腳都到得了
      if (!isHalf && rnd() < level.jumpProb) {
        const targets = [1, 4, 7].filter(
          (c) => chebyshev(c, feet.L) <= 1 && chebyshev(c, feet.R) <= 1 && !(feet.L === c && feet.R === c),
        );
        if (targets.length) {
          const cell = targets[Math.floor(rnd() * targets.length)];
          notes.push({ kind: 'step', beat, foot: 'both', cell });
          feet = { L: cell, R: cell };
          continue;
        }
      }
      // 一般踩格：優先換腳
      let foot: Foot = rnd() < 0.85 ? (lastFoot === 'L' ? 'R' : 'L') : lastFoot;
      let cands = candidateCells(foot, feet[foot], feet[foot === 'L' ? 'R' : 'L'], level.diagonals);
      if (cands.length === 0) {
        foot = foot === 'L' ? 'R' : 'L';
        cands = candidateCells(foot, feet[foot], feet[foot === 'L' ? 'R' : 'L'], level.diagonals);
      }
      if (cands.length === 0) continue;
      // 從中央出去後偏好回到中央，讓舞步有「回位」的節奏
      const preferCenter = feet[foot] !== CENTER_CELL && cands.includes(CENTER_CELL) && rnd() < 0.45;
      const cell = preferCenter ? CENTER_CELL : cands[Math.floor(rnd() * cands.length)];
      notes.push({ kind: 'step', beat, foot, cell });
      feet[foot] = cell;
      lastFoot = foot;
    }
  }
  return notes;
}

/** 譜面總拍數（最後一個指令再加 2 拍收尾）。 */
export function chartLengthBeats(notes: Note[]): number {
  return (notes.length ? notes[notes.length - 1].beat : 4) + 2;
}

/** 讓 UI 顯示用：格子名稱的相對位置（row, col）。 */
export function cellRC(cell: number): [number, number] {
  return [cellRow(cell), cellCol(cell)];
}

export { cellIndex };
