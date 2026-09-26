export type MoleKind = 'normal' | 'golden' | 'bomb';

export interface Mole {
  hole: number;
  kind: MoleKind;
  /** 冒出時間（毫秒，遊戲時間） */
  upAt: number;
  /** 沒被打到就縮回去的時間 */
  hideAt: number;
}

export interface MoleDifficulty {
  id: 'easy' | 'normal' | 'hard';
  name: string;
  description: string;
  /** 出現間隔（毫秒）：開始 → 結束（隨時間線性變快） */
  spawnStart: number;
  spawnEnd: number;
  /** 地鼠停留時間（毫秒）：開始 → 結束 */
  upStart: number;
  upEnd: number;
  maxConcurrent: number;
  goldenProb: number;
  bombProb: number;
}

export const DIFFICULTIES: MoleDifficulty[] = [
  { id: 'easy', name: '慢', description: '地鼠停久一點，適合暖身', spawnStart: 1400, spawnEnd: 900, upStart: 1900, upEnd: 1300, maxConcurrent: 2, goldenProb: 0.1, bombProb: 0.06 },
  { id: 'normal', name: '中', description: '節奏適中，偶爾有炸彈', spawnStart: 1000, spawnEnd: 650, upStart: 1400, upEnd: 950, maxConcurrent: 3, goldenProb: 0.1, bombProb: 0.12 },
  { id: 'hard', name: '快', description: '手要很快，炸彈變多', spawnStart: 750, spawnEnd: 450, upStart: 1100, upEnd: 700, maxConcurrent: 4, goldenProb: 0.12, bombProb: 0.16 },
];

export const DIFFICULTY_BY_ID: Record<string, MoleDifficulty> = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d]));

export const HOLE_COUNT = 9;
export const HOLE_COLS = 3;
export const HOLE_ROWS = 3;
export const GAME_DURATION_MS = 60000;

export type MoleEvent =
  | { type: 'spawn'; hole: number; kind: MoleKind }
  | { type: 'miss'; hole: number }
  | { type: 'hide'; hole: number }
  | { type: 'hit'; hole: number; kind: MoleKind; points: number }
  | { type: 'bomb'; hole: number; points: number };

/** 打地鼠遊戲邏輯（純邏輯、可測試）。時間單位毫秒，從 0 開始。 */
export class MoleGame {
  score = 0;
  hits = 0;
  misses = 0;
  bombsHit = 0;
  combo = 0;
  maxCombo = 0;
  readonly moles = new Map<number, Mole>();
  private nextSpawnAt = 600;
  private lastHole = -1;

  constructor(
    readonly difficulty: MoleDifficulty,
    private readonly rng: () => number = Math.random,
    readonly durationMs = GAME_DURATION_MS,
  ) {}

  finished(t: number): boolean {
    return t >= this.durationMs;
  }

  remainingMs(t: number): number {
    return Math.max(0, this.durationMs - t);
  }

  /** 0..1 遊戲進度，用來讓節奏越來越快 */
  private progress(t: number): number {
    return Math.min(1, Math.max(0, t / this.durationMs));
  }

  private lerp(a: number, b: number, p: number): number {
    return a + (b - a) * p;
  }

  get accuracy(): number {
    const total = this.hits + this.misses;
    return total ? this.hits / total : 0;
  }

  /** 每幀呼叫：處理冒出與縮回。 */
  update(t: number): MoleEvent[] {
    const events: MoleEvent[] = [];
    if (this.finished(t)) return events;
    const d = this.difficulty;
    // 縮回
    for (const [hole, m] of [...this.moles]) {
      if (t >= m.hideAt) {
        this.moles.delete(hole);
        if (m.kind === 'bomb') events.push({ type: 'hide', hole });
        else {
          this.misses += 1;
          this.combo = 0;
          events.push({ type: 'miss', hole });
        }
      }
    }
    // 冒出
    const p = this.progress(t);
    while (t >= this.nextSpawnAt && this.moles.size < d.maxConcurrent) {
      const free: number[] = [];
      for (let h = 0; h < HOLE_COUNT; h++) if (!this.moles.has(h) && h !== this.lastHole) free.push(h);
      if (free.length === 0) break;
      const hole = free[Math.floor(this.rng() * free.length)];
      const r = this.rng();
      const kind: MoleKind = r < d.bombProb ? 'bomb' : r < d.bombProb + d.goldenProb ? 'golden' : 'normal';
      const up = this.lerp(d.upStart, d.upEnd, p) * (kind === 'golden' ? 0.65 : 1);
      this.moles.set(hole, { hole, kind, upAt: t, hideAt: t + up });
      this.lastHole = hole;
      events.push({ type: 'spawn', hole, kind });
      this.nextSpawnAt = t + this.lerp(d.spawnStart, d.spawnEnd, p) * (0.8 + 0.4 * this.rng());
    }
    if (t >= this.nextSpawnAt && this.moles.size >= d.maxConcurrent) this.nextSpawnAt = t + 150;
    return events;
  }

  /** 手進到某個洞：有地鼠就算打中。回傳事件，沒打到東西回傳 null。 */
  hit(hole: number, t: number): MoleEvent | null {
    if (this.finished(t)) return null;
    const m = this.moles.get(hole);
    if (!m) return null;
    this.moles.delete(hole);
    if (m.kind === 'bomb') {
      this.bombsHit += 1;
      this.combo = 0;
      const points = -2;
      this.score = Math.max(0, this.score + points);
      return { type: 'bomb', hole, points };
    }
    this.hits += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    let points = m.kind === 'golden' ? 3 : 1;
    if (this.combo >= 5) points += 1;
    this.score += points;
    return { type: 'hit', hole, kind: m.kind, points };
  }
}
