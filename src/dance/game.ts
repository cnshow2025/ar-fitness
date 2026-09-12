import type { Foot, Gesture, Judgement, Note } from './types';

export interface JudgeOptions {
  perfectMs: number;
  goodMs: number;
}

export const DEFAULT_JUDGE: JudgeOptions = { perfectMs: 130, goodMs: 260 };

export const SCORE: Record<Judgement, number> = { perfect: 100, good: 60, miss: 0 };

export interface JudgedNote {
  note: Note;
  judgement: Judgement | null;
  /** 命中時的誤差（毫秒，正值代表晚了） */
  deltaMs: number | null;
}

export interface JudgeEvent {
  index: number;
  judgement: Judgement;
  deltaMs: number | null;
}

export interface FrameState {
  feet: Record<Foot, number | null>;
  gestures: Set<Gesture>;
}

/**
 * 節奏判定與計分。所有時間都是「歌曲時間」毫秒（beat 0 = 0ms）。
 * 呼叫端負責把姿勢時間戳減掉偵測延遲補償後再傳進來。
 */
export class DanceGame {
  readonly notes: JudgedNote[];
  score = 0;
  combo = 0;
  maxCombo = 0;
  counts: Record<Judgement, number> = { perfect: 0, good: 0, miss: 0 };
  private cursor = 0;
  /** 雙腳跳指令：視窗打開時若雙腳已經站在目標格，必須先離開再踩進來才算 */
  private needsRelease = new Set<number>();
  private seen = new Set<number>();
  readonly msPerBeat: number;

  constructor(
    notes: Note[],
    readonly bpm: number,
    private readonly judge: JudgeOptions = DEFAULT_JUDGE,
  ) {
    this.msPerBeat = 60000 / bpm;
    this.notes = notes.map((note) => ({ note, judgement: null, deltaMs: null }));
  }

  noteTime(i: number): number {
    return this.notes[i].note.beat * this.msPerBeat;
  }

  get maxScore(): number {
    return this.notes.length * SCORE.perfect;
  }

  get accuracy(): number {
    return this.maxScore ? this.score / this.maxScore : 0;
  }

  get stars(): number {
    const a = this.accuracy;
    return a >= 0.9 ? 3 : a >= 0.7 ? 2 : a >= 0.5 ? 1 : 0;
  }

  get judgedCount(): number {
    return this.counts.perfect + this.counts.good + this.counts.miss;
  }

  get finished(): boolean {
    return this.judgedCount >= this.notes.length;
  }

  private classify(deltaMs: number): Judgement | null {
    const d = Math.abs(deltaMs);
    if (d <= this.judge.perfectMs) return 'perfect';
    if (d <= this.judge.goodMs) return 'good';
    return null;
  }

  private apply(i: number, judgement: Judgement, deltaMs: number | null): JudgeEvent {
    const n = this.notes[i];
    n.judgement = judgement;
    n.deltaMs = deltaMs;
    this.counts[judgement] += 1;
    this.score += SCORE[judgement];
    if (judgement === 'miss') this.combo = 0;
    else {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    while (this.cursor < this.notes.length && this.notes[this.cursor].judgement !== null) this.cursor += 1;
    return { index: i, judgement, deltaMs };
  }

  /** 判定視窗內、尚未判定的指令索引（依時間順序）。 */
  private windowIndices(tMs: number): number[] {
    const out: number[] = [];
    for (let i = this.cursor; i < this.notes.length; i++) {
      const nt = this.noteTime(i);
      if (nt - tMs > this.judge.goodMs) break;
      if (this.notes[i].judgement === null && Math.abs(nt - tMs) <= this.judge.goodMs) out.push(i);
    }
    return out;
  }

  /** 單腳踩進某格。 */
  onStep(foot: Foot, cell: number, tMs: number): JudgeEvent | null {
    for (const i of this.windowIndices(tMs)) {
      const n = this.notes[i].note;
      if (n.kind !== 'step' || n.foot !== foot || n.cell !== cell) continue;
      const delta = tMs - this.noteTime(i);
      const j = this.classify(delta);
      if (j) return this.apply(i, j, delta);
    }
    return null;
  }

  /**
   * 每幀呼叫：處理雙腳跳與手勢指令的命中，以及逾時未命中的 miss。
   */
  onFrame(state: FrameState, tMs: number): JudgeEvent[] {
    const events: JudgeEvent[] = [];
    for (const i of this.windowIndices(tMs)) {
      const n = this.notes[i].note;
      let hit = false;
      if (n.kind === 'step' && n.foot === 'both') {
        const bothIn = state.feet.L === n.cell && state.feet.R === n.cell;
        if (!this.seen.has(i)) {
          this.seen.add(i);
          if (bothIn) this.needsRelease.add(i);
        }
        if (this.needsRelease.has(i)) {
          if (!bothIn) this.needsRelease.delete(i);
          continue;
        }
        hit = bothIn;
      } else if (n.kind === 'gesture') hit = state.gestures.has(n.gesture);
      if (!hit) continue;
      const delta = tMs - this.noteTime(i);
      const j = this.classify(delta);
      if (j) events.push(this.apply(i, j, delta));
    }
    // 逾時
    for (let i = this.cursor; i < this.notes.length; i++) {
      const nt = this.noteTime(i);
      if (nt + this.judge.goodMs >= tMs) break;
      if (this.notes[i].judgement === null) events.push(this.apply(i, 'miss', null));
    }
    return events;
  }

  /** 接下來 n 個未判定的指令。 */
  upcoming(tMs: number, n: number): Array<{ index: number; note: Note; msUntil: number }> {
    const out: Array<{ index: number; note: Note; msUntil: number }> = [];
    for (let i = this.cursor; i < this.notes.length && out.length < n; i++) {
      if (this.notes[i].judgement !== null) continue;
      out.push({ index: i, note: this.notes[i].note, msUntil: this.noteTime(i) - tMs });
    }
    return out;
  }
}
