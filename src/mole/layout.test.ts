import { describe, expect, it } from 'vitest';
import { LM, type Point, type Pose } from '../pose/landmarks';
import { holeAt, layoutFromPose } from './layout';

const pt = (x: number, y: number): Point => ({ x, y, z: 0, visibility: 1 });
const pose: Pose = Array.from({ length: 33 }, () => pt(0, 0));
pose[LM.NOSE] = pt(360, 300);
pose[LM.LEFT_SHOULDER] = pt(420, 400);
pose[LM.RIGHT_SHOULDER] = pt(300, 400);
pose[LM.LEFT_ELBOW] = pt(460, 520);
pose[LM.RIGHT_ELBOW] = pt(260, 520);
pose[LM.LEFT_WRIST] = pt(480, 640);
pose[LM.RIGHT_WRIST] = pt(240, 640);

describe('layoutFromPose', () => {
  it('排出 9 個洞，全部在畫面內，並以肩膀為中心', () => {
    const l = layoutFromPose(pose, 720, 1280)!;
    expect(l.centers).toHaveLength(9);
    for (const c of l.centers) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(720);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(1280);
    }
    const midX = (l.centers[0].x + l.centers[2].x) / 2;
    expect(midX).toBeCloseTo(360, 0);
  });
  it('holeAt 找到最近的洞，離太遠回傳 null', () => {
    const l = layoutFromPose(pose, 720, 1280)!;
    expect(holeAt(l, l.centers[5])).toBe(5);
    expect(holeAt(l, { x: l.centers[5].x + l.radius * 1.2, y: l.centers[5].y })).toBe(5);
    expect(holeAt(l, { x: 5, y: 5 })).toBeNull();
  });
});
