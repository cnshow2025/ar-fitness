import { describe, expect, it } from 'vitest';
import { LM, type Point, type Pose } from '../pose/landmarks';
import { HandTracker, segmentDistance } from './detect';
import type { HoleLayout } from './layout';

const pt = (x: number, y: number): Point => ({ x, y, z: 0, visibility: 1 });
const layout: HoleLayout = {
  centers: [
    { x: 100, y: 100 }, { x: 300, y: 100 }, { x: 500, y: 100 },
    { x: 100, y: 300 }, { x: 300, y: 300 }, { x: 500, y: 300 },
    { x: 100, y: 500 }, { x: 300, y: 500 }, { x: 500, y: 500 },
  ],
  radius: 50,
  cellW: 200,
  cellH: 200,
};
function poseWith(rw: [number, number]): Pose {
  const p: Pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  p[LM.RIGHT_WRIST] = pt(...rw);
  p[LM.LEFT_WRIST] = { x: 0, y: 0, z: 0, visibility: 0 };
  return p;
}

describe('segmentDistance', () => {
  it('點在線段中間上方', () => {
    expect(segmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });
  it('點超出端點時量到端點', () => {
    expect(segmentDistance({ x: 14, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });
});

describe('HandTracker', () => {
  it('快速揮過洞（兩幀之間跨過）也會觸發', () => {
    const tr = new HandTracker();
    tr.update(poseWith([300, 700]), layout, 0); // 洞外
    const ev = tr.update(poseWith([300, 380]), layout, 33); // 一幀內從 700 移到 380，路徑掃過 (300,500) 的洞 7
    expect(ev.map((e) => e.hole)).toContain(7);
  });
  it('手停在同一個洞不會重複觸發', () => {
    const tr = new HandTracker();
    tr.update(poseWith([300, 300]), layout, 0);
    expect(tr.update(poseWith([302, 301]), layout, 33)).toEqual([]);
    expect(tr.update(poseWith([301, 302]), layout, 66)).toEqual([]);
  });
  it('依速度往前預測：往洞移動時提前判定', () => {
    const tr = new HandTracker();
    tr.update(poseWith([300, 800]), layout, 0);
    // 33ms 移動 100px，預測 100ms 後再前進 75px（受 1.5 倍半徑上限）→ 到 (300, 625)，離洞 7 (300,500) 125px > 70，還不算
    expect(tr.update(poseWith([300, 700]), layout, 33)).toEqual([]);
    // 再一幀：位置 600，預測到 525，路徑 700→525 掃過 500±70 → 觸發
    expect(tr.update(poseWith([300, 600]), layout, 66).map((e) => e.hole)).toContain(7);
  });
});

describe('HandTracker 去抖', () => {
  it('手靜止時小幅雜訊不會讓圓圈亂跳', () => {
    const tr = new HandTracker();
    const xs: number[] = [];
    for (let i = 0; i < 30; i++) {
      const noise = (i % 2 === 0 ? 1 : -1) * 6; // ±6px 抖動
      tr.update(poseWith([300 + noise, 300]), layout, i * 33);
      if (i > 10) xs.push(tr.pos.R!.x);
    }
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread).toBeLessThan(4);
  });
});
