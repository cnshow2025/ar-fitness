import { describe, expect, it } from 'vitest';
import { DIFFICULTY_BY_ID, MoleGame } from './game';
import { mulberry32 } from '../dance/chart';

describe('MoleGame', () => {
  it('會冒出地鼠，沒打到會縮回並算 miss', () => {
    const g = new MoleGame(DIFFICULTY_BY_ID.easy, mulberry32(1));
    const ev = g.update(700);
    expect(ev.some((e) => e.type === 'spawn')).toBe(true);
    expect(g.moles.size).toBe(1);
    const later = g.update(700 + 2500);
    expect(later.some((e) => e.type === 'miss' || e.type === 'hide')).toBe(true);
  });

  it('打中一般地鼠 +1，連續 5 次後每次 +2', () => {
    // 找一個不含炸彈與金色的種子行為：直接操作 moles
    const g = new MoleGame(DIFFICULTY_BY_ID.easy, () => 0.99);
    for (let i = 0; i < 6; i++) {
      g.moles.set(i, { hole: i, kind: 'normal', upAt: 0, hideAt: 9999 });
      g.hit(i, 100 + i);
    }
    expect(g.hits).toBe(6);
    expect(g.combo).toBe(6);
    expect(g.score).toBe(5 + 2 + 1); // 前 4 次各 1，第 5、6 次各 2
  });

  it('金色 +3，炸彈 −2 且不會低於 0、combo 歸零', () => {
    const g = new MoleGame(DIFFICULTY_BY_ID.normal, () => 0.5);
    g.moles.set(0, { hole: 0, kind: 'golden', upAt: 0, hideAt: 9999 });
    expect(g.hit(0, 10)).toMatchObject({ type: 'hit', points: 3 });
    g.moles.set(1, { hole: 1, kind: 'bomb', upAt: 0, hideAt: 9999 });
    expect(g.hit(1, 20)).toMatchObject({ type: 'bomb', points: -2 });
    expect(g.score).toBe(1);
    expect(g.combo).toBe(0);
    g.moles.set(2, { hole: 2, kind: 'bomb', upAt: 0, hideAt: 9999 });
    g.hit(2, 30);
    expect(g.score).toBe(0);
  });

  it('沒有地鼠的洞打了沒事', () => {
    const g = new MoleGame(DIFFICULTY_BY_ID.easy, () => 0.5);
    expect(g.hit(3, 10)).toBeNull();
    expect(g.hits).toBe(0);
  });

  it('同時出現的地鼠不超過上限，60 秒後結束', () => {
    const g = new MoleGame(DIFFICULTY_BY_ID.hard, mulberry32(7));
    let max = 0;
    for (let t = 0; t <= 61000; t += 50) {
      g.update(t);
      max = Math.max(max, g.moles.size);
    }
    expect(max).toBeLessThanOrEqual(DIFFICULTY_BY_ID.hard.maxConcurrent);
    expect(g.finished(60000)).toBe(true);
    expect(g.update(60500)).toEqual([]);
  });
});
