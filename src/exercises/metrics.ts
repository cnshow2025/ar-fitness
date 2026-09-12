import { angleAt, angleFromVertical, midpoint, signedTiltFromVertical, visibilityOf } from '../pose/angles';
import { LM, type Pose, type Side } from '../pose/landmarks';
import type { JointTriplet, MetricKind, MetricReading, MetricSpec } from './types';

const VIS_MIN = 0.45;

function sidePts(side: Side) {
  return side === 'left'
    ? {
        shoulder: LM.LEFT_SHOULDER,
        elbow: LM.LEFT_ELBOW,
        wrist: LM.LEFT_WRIST,
        hip: LM.LEFT_HIP,
        knee: LM.LEFT_KNEE,
        ankle: LM.LEFT_ANKLE,
      }
    : {
        shoulder: LM.RIGHT_SHOULDER,
        elbow: LM.RIGHT_ELBOW,
        wrist: LM.RIGHT_WRIST,
        hip: LM.RIGHT_HIP,
        knee: LM.RIGHT_KNEE,
        ankle: LM.RIGHT_ANKLE,
      };
}

/** 指標對應要畫角度弧線的三點（單側）。 */
export function tripletFor(kind: MetricKind, side: Side): JointTriplet | null {
  const p = sidePts(side);
  switch (kind) {
    case 'knee':
      return { a: p.hip, b: p.knee, c: p.ankle };
    case 'hip':
      return { a: p.shoulder, b: p.hip, c: p.knee };
    case 'elbow':
      return { a: p.shoulder, b: p.elbow, c: p.wrist };
    case 'shoulder':
    case 'armRaise':
      return { a: p.hip, b: p.shoulder, c: p.elbow };
    case 'trunkTilt':
      return null;
  }
}

/** 單側量測。 */
export function measureSide(kind: MetricKind, side: Side, pose: Pose): MetricReading {
  const p = sidePts(side);
  switch (kind) {
    case 'knee': {
      const ids = [p.hip, p.knee, p.ankle];
      return { value: angleAt(pose[p.hip], pose[p.knee], pose[p.ankle]), visible: visibilityOf(pose, ids) >= VIS_MIN };
    }
    case 'hip': {
      const ids = [p.shoulder, p.hip, p.knee];
      return { value: angleAt(pose[p.shoulder], pose[p.hip], pose[p.knee]), visible: visibilityOf(pose, ids) >= VIS_MIN };
    }
    case 'elbow': {
      const ids = [p.shoulder, p.elbow, p.wrist];
      return { value: angleAt(pose[p.shoulder], pose[p.elbow], pose[p.wrist]), visible: visibilityOf(pose, ids) >= VIS_MIN };
    }
    case 'shoulder': {
      // 肩外展／屈曲：軀幹（髖→肩）與上臂（肩→肘）的夾角
      const ids = [p.hip, p.shoulder, p.elbow];
      return { value: angleAt(pose[p.hip], pose[p.shoulder], pose[p.elbow]), visible: visibilityOf(pose, ids) >= VIS_MIN };
    }
    case 'armRaise': {
      // 手臂上舉：肩→腕 相對垂直向上的角度，0 = 直直朝上，180 = 垂放
      const ids = [p.shoulder, p.wrist];
      return { value: angleFromVertical(pose[p.shoulder], pose[p.wrist]), visible: visibilityOf(pose, ids) >= VIS_MIN };
    }
    case 'trunkTilt': {
      const ids = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP];
      const hips = midpoint(pose[LM.LEFT_HIP], pose[LM.RIGHT_HIP]);
      const shoulders = midpoint(pose[LM.LEFT_SHOULDER], pose[LM.RIGHT_SHOULDER]);
      const tilt = signedTiltFromVertical(hips, shoulders);
      // left = 往畫面左傾為正；right = 往畫面右傾為正
      return { value: side === 'left' ? -tilt : tilt, visible: visibilityOf(pose, ids) >= VIS_MIN };
    }
  }
}

/** 依 side 設定，回傳各「通道」的讀值（both 會合併成一個通道）。 */
export function measure(spec: MetricSpec, pose: Pose): Record<string, MetricReading> {
  if (spec.side === 'both') {
    const l = measureSide(spec.kind, 'left', pose);
    const r = measureSide(spec.kind, 'right', pose);
    if (l.visible && r.visible) return { both: { value: (l.value + r.value) / 2, visible: true } };
    // 側身時只看得到一邊，就用看得到的那邊。
    if (l.visible) return { both: l };
    if (r.visible) return { both: r };
    return { both: { value: (l.value + r.value) / 2, visible: false } };
  }
  if (spec.side === 'alternate') {
    return { left: measureSide(spec.kind, 'left', pose), right: measureSide(spec.kind, 'right', pose) };
  }
  return { [spec.side]: measureSide(spec.kind, spec.side, pose) };
}

/** 給畫面用：這個指標要標示哪些關節。 */
export function tripletsFor(spec: MetricSpec): JointTriplet[] {
  const sides: Side[] = spec.side === 'left' || spec.side === 'right' ? [spec.side] : ['left', 'right'];
  return sides.map((s) => tripletFor(spec.kind, s)).filter((t): t is JointTriplet => t !== null);
}

/** 指標值變化方向的中文描述。 */
export function directionLabel(kind: MetricKind, velocity: number): string {
  const still = Math.abs(velocity) < 12; // 度／秒
  if (still) return '靜止';
  const increasing = velocity > 0;
  switch (kind) {
    case 'knee':
      return increasing ? '膝伸展中 ↑' : '膝屈曲中 ↓';
    case 'hip':
      return increasing ? '髖伸展中 ↓' : '髖屈曲中 ↑';
    case 'elbow':
      return increasing ? '肘伸直中' : '肘彎曲中';
    case 'shoulder':
      return increasing ? '手臂抬高中 ↑' : '手臂放下中 ↓';
    case 'armRaise':
      return increasing ? '手臂放下中 ↓' : '手臂舉高中 ↑';
    case 'trunkTilt':
      return increasing ? '側彎中' : '回正中';
  }
}

export function metricLabel(kind: MetricKind): string {
  switch (kind) {
    case 'knee':
      return '膝關節角度';
    case 'hip':
      return '髖關節角度';
    case 'elbow':
      return '肘關節角度';
    case 'shoulder':
      return '肩關節角度';
    case 'armRaise':
      return '手臂舉高角度';
    case 'trunkTilt':
      return '軀幹側傾角度';
  }
}
