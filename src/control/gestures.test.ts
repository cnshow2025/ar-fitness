import { describe, expect, it } from 'vitest';
import { LM, type Point, type Pose } from '../pose/landmarks';
import { detectControlGesture, HoldController } from './gestures';

const pt = (x: number, y: number): Point => ({ x, y, z: 0, visibility: 1 });

function pose(opts: { lw?: [number, number]; rw?: [number, number] } = {}): Pose {
  const p: Pose = Array.from({ length: 33 }, () => pt(0, 0));
  p[LM.NOSE] = pt(200, 40);
  p[LM.LEFT_SHOULDER] = pt(240, 100);
  p[LM.RIGHT_SHOULDER] = pt(160, 100); // 肩寬 80
  p[LM.LEFT_WRIST] = pt(...(opts.lw ?? [250, 220]));
  p[LM.RIGHT_WRIST] = pt(...(opts.rw ?? [150, 220]));
  return p;
}

describe('detectControlGesture', () => {
  it('雙手自然垂下不是手勢', () => {
    expect(detectControlGesture(pose())).toBeNull();
  });
  it('單手高舉過頭、另一手垂下 → raiseOne', () => {
    expect(detectControlGesture(pose({ lw: [250, 10] }))?.gesture).toBe('raiseOne');
    expect(detectControlGesture(pose({ rw: [150, 10] }))?.gesture).toBe('raiseOne');
  });
  it('雙手都舉高不是控制手勢（那是跳舞／運動的舉手）', () => {
    expect(detectControlGesture(pose({ lw: [250, 10], rw: [150, 10] }))).toBeNull();
  });
  it('雙手胸前交叉 → crossArms', () => {
    expect(detectControlGesture(pose({ lw: [170, 110], rw: [230, 110] }))?.gesture).toBe('crossArms');
  });
  it('手放在同側肩膀（彎舉）不是交叉', () => {
    expect(detectControlGesture(pose({ lw: [235, 110], rw: [165, 110] }))).toBeNull();
  });
});

describe('HoldController', () => {
  const up = pose({ lw: [250, 10] });
  it('維持 1.5 秒才觸發，之後要放下才能再觸發', () => {
    const c = new HoldController(1500, 1000);
    expect(c.update(up, 0)).toBeNull();
    expect(c.update(up, 800)).toBeNull();
    expect(c.state.progress).toBeCloseTo(800 / 1500, 2);
    expect(c.update(up, 1500)).toBe('raiseOne');
    expect(c.update(up, 4000)).toBeNull(); // 一直舉著不會重複觸發
    expect(c.update(null, 4100)).toBeNull(); // 放下
    expect(c.update(up, 4200)).toBeNull();
    expect(c.update(up, 5700)).toBe('raiseOne');
  });
  it('中途放下會重新計時', () => {
    const c = new HoldController(1500, 1000);
    c.update(up, 0);
    c.update(up, 1000);
    c.update(null, 1100);
    c.update(up, 1200);
    expect(c.update(up, 2500)).toBeNull();
    expect(c.update(up, 2700)).toBe('raiseOne');
  });
});
