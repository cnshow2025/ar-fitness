import { describe, expect, it } from 'vitest';
import { DanceGame } from './game';
import type { Note } from './types';

const bpm = 120; // 500ms 一拍
const notes: Note[] = [
  { kind: 'step', beat: 4, foot: 'L', cell: 3 },
  { kind: 'step', beat: 5, foot: 'R', cell: 5 },
  { kind: 'step', beat: 6, foot: 'both', cell: 4 },
  { kind: 'gesture', beat: 7, gesture: 'handsUp' },
];
const idle = { feet: { L: 3, R: 5 }, gestures: new Set<never>() };

describe('DanceGame', () => {
  it('準時踩到是 perfect，稍晚是 good', () => {
    const g = new DanceGame(notes, bpm);
    expect(g.onStep('L', 3, 2000 + 50)?.judgement).toBe('perfect');
    expect(g.onStep('R', 5, 2500 + 200)?.judgement).toBe('good');
    expect(g.score).toBe(160);
    expect(g.combo).toBe(2);
  });

  it('踩錯格或錯腳不算', () => {
    const g = new DanceGame(notes, bpm);
    expect(g.onStep('L', 4, 2000)).toBeNull();
    expect(g.onStep('R', 3, 2000)).toBeNull();
    expect(g.judgedCount).toBe(0);
  });

  it('逾時會變成 miss 並中斷 combo', () => {
    const g = new DanceGame(notes, bpm);
    g.onStep('L', 3, 2000);
    const ev = g.onFrame(idle, 2500 + 300);
    expect(ev.map((e) => e.judgement)).toEqual(['miss']);
    expect(g.combo).toBe(0);
    expect(g.counts.miss).toBe(1);
  });

  it('雙腳跳與手勢在每幀判定', () => {
    const g = new DanceGame(notes, bpm);
    g.onStep('L', 3, 2000);
    g.onStep('R', 5, 2500);
    expect(g.onFrame({ feet: { L: 4, R: 3 }, gestures: new Set() }, 3000)).toEqual([]);
    const both = g.onFrame({ feet: { L: 4, R: 4 }, gestures: new Set() }, 3000 + 100);
    expect(both[0].judgement).toBe('perfect');
    const gest = g.onFrame({ feet: { L: 4, R: 4 }, gestures: new Set(['handsUp'] as const) }, 3500 - 200);
    expect(gest[0].judgement).toBe('good');
    expect(g.finished).toBe(true);
    expect(g.maxCombo).toBe(4);
    expect(g.stars).toBe(3);
  });

  it('雙腳跳：一開始就站在目標格不算，要離開再踩回來', () => {
    const g = new DanceGame([{ kind: 'step', beat: 4, foot: 'both', cell: 4 }], bpm);
    const at4 = { feet: { L: 4, R: 4 }, gestures: new Set<never>() };
    expect(g.onFrame(at4, 2000 - 250)).toEqual([]);
    expect(g.onFrame(at4, 2000 - 100)).toEqual([]);
    expect(g.onFrame({ feet: { L: 1, R: 1 }, gestures: new Set<never>() }, 2000 - 50)).toEqual([]);
    expect(g.onFrame(at4, 2000 + 40)[0].judgement).toBe('perfect');
  });

  it('太早的踩格不會被算進去', () => {
    const g = new DanceGame(notes, bpm);
    expect(g.onStep('L', 3, 2000 - 400)).toBeNull();
  });
});
