import { describe, expect, it } from 'vitest';
import { LM, type Point, type Pose } from '../pose/landmarks';
import { EXERCISE_BY_ID } from './definitions';
import { measure } from './metrics';
import { ExerciseTracker } from './tracker';

const pt = (x: number, y: number): Point => ({ x, y, z: 0, visibility: 1 });

/** 造一個站立的人（像素座標，正面對相機），可指定膝角與肩角。 */
function standingPose(opts: { kneeAngle?: number; shoulderAngle?: number } = {}): Pose {
  const pose: Pose = Array.from({ length: 33 }, () => pt(0, 0));
  const kneeAngle = opts.kneeAngle ?? 180;
  const shoulderAngle = opts.shoulderAngle ?? 10;
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 220 : 180;
    const shoulder = side === 'L' ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER;
    const elbow = side === 'L' ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW;
    const wrist = side === 'L' ? LM.LEFT_WRIST : LM.RIGHT_WRIST;
    const hip = side === 'L' ? LM.LEFT_HIP : LM.RIGHT_HIP;
    const knee = side === 'L' ? LM.LEFT_KNEE : LM.RIGHT_KNEE;
    const ankle = side === 'L' ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE;
    pose[shoulder] = pt(sx, 100);
    pose[hip] = pt(sx, 200);
    // 膝：從髖往下 60px，再從膝以指定角度接到踝
    pose[knee] = pt(sx, 260);
    const rad = ((180 - kneeAngle) * Math.PI) / 180;
    pose[ankle] = pt(sx + 60 * Math.sin(rad), 260 + 60 * Math.cos(rad));
    // 肩：上臂相對軀幹（往下）張開 shoulderAngle
    const dir = side === 'L' ? 1 : -1;
    const srad = (shoulderAngle * Math.PI) / 180;
    pose[elbow] = pt(sx + dir * 40 * Math.sin(srad), 100 + 40 * Math.cos(srad));
    pose[wrist] = pt(sx + dir * 80 * Math.sin(srad), 100 + 80 * Math.cos(srad));
  }
  pose[LM.NOSE] = pt(200, 40);
  return pose;
}

describe('measure', () => {
  it('膝角量測跟造出來的角度一致', () => {
    const r = measure({ kind: 'knee', side: 'both' }, standingPose({ kneeAngle: 95 }));
    expect(r.both.visible).toBe(true);
    expect(r.both.value).toBeCloseTo(95, 0);
  });
  it('肩角量測跟造出來的角度一致', () => {
    const r = measure({ kind: 'shoulder', side: 'both' }, standingPose({ shoulderAngle: 85 }));
    expect(r.both.value).toBeCloseTo(85, 0);
  });
});

function runSequence(tracker: ExerciseTracker, angles: number[], frameMs: number, key: 'kneeAngle' | 'shoulderAngle') {
  const events = [];
  let t = 0;
  for (const a of angles) {
    t += frameMs;
    events.push(...tracker.update(standingPose({ [key]: a }), t));
  }
  return events;
}

describe('ExerciseTracker 深蹲', () => {
  const squat = EXERCISE_BY_ID.squat;

  it('完整蹲下再站起算一次', () => {
    const tracker = new ExerciseTracker(squat);
    // 站直 → 慢慢蹲到 90 → 站回 175，每幀 100ms
    const down = Array.from({ length: 12 }, (_, i) => 175 - (i * 85) / 11);
    const hold = Array(3).fill(90);
    const up = Array.from({ length: 12 }, (_, i) => 90 + (i * 85) / 11);
    const seq = [...Array(5).fill(175), ...down, ...hold, ...up, ...Array(5).fill(175)];
    const events = runSequence(tracker, seq, 100, 'kneeAngle');
    expect(tracker.reps).toBe(1);
    expect(events.some((e) => e.type === 'rep' && e.reps === 1)).toBe(true);
  });

  it('只蹲一半就回來不計次，但會給「再蹲低一點」提示', () => {
    const tracker = new ExerciseTracker(squat);
    const down = Array.from({ length: 10 }, (_, i) => 175 - (i * 50) / 9); // 到 125
    const stay = Array(4).fill(125);
    const up = Array.from({ length: 10 }, (_, i) => 125 + (i * 50) / 9);
    const events = runSequence(tracker, [...Array(5).fill(175), ...down, ...stay, ...up, ...Array(5).fill(175)], 100, 'kneeAngle');
    expect(tracker.reps).toBe(0);
    expect(events.some((e) => e.type === 'cue' && e.text === squat.cues.more)).toBe(true);
  });

  it('連續三次會計到 3', () => {
    const tracker = new ExerciseTracker(squat);
    const one = [
      ...Array.from({ length: 10 }, (_, i) => 175 - (i * 85) / 9),
      ...Array.from({ length: 10 }, (_, i) => 90 + (i * 85) / 9),
      ...Array(3).fill(175),
    ];
    runSequence(tracker, [...Array(5).fill(175), ...one, ...one, ...one], 100, 'kneeAngle');
    expect(tracker.reps).toBe(3);
  });

  it('活動範圍會記錄最小與最大角度', () => {
    const tracker = new ExerciseTracker(squat);
    runSequence(tracker, [175, 175, 175, 150, 120, 100, 100, 100, 100, 100, 130, 160, 175, 175, 175, 175], 200, 'kneeAngle');
    const snap = tracker.snapshot();
    expect(snap.romMin).toBeLessThan(115);
    expect(snap.romMax).toBeGreaterThan(165);
  });
});

describe('ExerciseTracker 維持型動作', () => {
  const hold = EXERCISE_BY_ID.shoulder_abduction_hold;

  it('抬到位並維持 3 秒才算一次', () => {
    const tracker = new ExerciseTracker(hold);
    const up = Array.from({ length: 10 }, (_, i) => 15 + (i * 70) / 9); // 到 85
    const keep = Array(35).fill(85); // 3.5 秒（每幀 100ms）
    const down = Array.from({ length: 10 }, (_, i) => 85 - (i * 70) / 9);
    runSequence(tracker, [...Array(5).fill(15), ...up, ...keep, ...down, ...Array(5).fill(15)], 100, 'shoulderAngle');
    expect(tracker.reps).toBe(1);
  });

  it('沒撐滿時間就放下不算', () => {
    const tracker = new ExerciseTracker(hold);
    const up = Array.from({ length: 10 }, (_, i) => 15 + (i * 70) / 9);
    const keep = Array(10).fill(85); // 只有 1 秒
    const down = Array.from({ length: 10 }, (_, i) => 85 - (i * 70) / 9);
    runSequence(tracker, [...Array(5).fill(15), ...up, ...keep, ...down, ...Array(5).fill(15)], 100, 'shoulderAngle');
    expect(tracker.reps).toBe(0);
  });
});
