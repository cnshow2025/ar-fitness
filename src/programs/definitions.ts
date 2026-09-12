import { EXERCISE_BY_ID } from '../exercises/definitions';

export interface ProgramItem {
  exerciseId: string;
  /** 目標次數（reps 或 hold 次） */
  reps?: number;
  /** 以時間為準（秒）；到時間就結束，次數照樣計 */
  durationSec?: number;
  /** 完成後休息秒數 */
  restSec: number;
}

export interface Program {
  id: string;
  name: string;
  level: '入門' | '中等' | '進階';
  description: string;
  items: ProgramItem[];
}

export const PROGRAMS: Program[] = [
  {
    id: 'warmup5',
    name: '5 分鐘熱身',
    level: '入門',
    description: '輕鬆活動全身關節，適合運動前或久坐後。',
    items: [
      { exerciseId: 'march', durationSec: 45, restSec: 10 },
      { exerciseId: 'overhead_raise', reps: 10, restSec: 10 },
      { exerciseId: 'trunk_side_bend', reps: 8, restSec: 10 },
      { exerciseId: 'lateral_raise', reps: 10, restSec: 10 },
      { exerciseId: 'squat', reps: 8, restSec: 10 },
      { exerciseId: 'high_knee', durationSec: 40, restSec: 0 },
    ],
  },
  {
    id: 'full_body',
    name: '全身循環',
    level: '中等',
    description: '上下肢交替，訓練肌力與心肺。',
    items: [
      { exerciseId: 'squat', reps: 12, restSec: 20 },
      { exerciseId: 'overhead_raise', reps: 12, restSec: 15 },
      { exerciseId: 'lunge', reps: 12, restSec: 20 },
      { exerciseId: 'bicep_curl', reps: 12, restSec: 15 },
      { exerciseId: 'high_knee', durationSec: 45, restSec: 20 },
      { exerciseId: 'lateral_raise', reps: 12, restSec: 15 },
      { exerciseId: 'squat', reps: 12, restSec: 0 },
    ],
  },
  {
    id: 'upper',
    name: '上肢日',
    level: '中等',
    description: '肩、肘為主，全程只需上半身入鏡。',
    items: [
      { exerciseId: 'lateral_raise', reps: 12, restSec: 15 },
      { exerciseId: 'overhead_raise', reps: 12, restSec: 15 },
      { exerciseId: 'bicep_curl', reps: 15, restSec: 15 },
      { exerciseId: 'lateral_raise', reps: 12, restSec: 15 },
      { exerciseId: 'arm_raise_hold', reps: 4, restSec: 0 },
    ],
  },
  {
    id: 'lower',
    name: '下肢日',
    level: '進階',
    description: '深蹲、弓箭步、高抬腿，需要全身入鏡。',
    items: [
      { exerciseId: 'march', durationSec: 30, restSec: 10 },
      { exerciseId: 'squat', reps: 15, restSec: 25 },
      { exerciseId: 'lunge', reps: 16, restSec: 25 },
      { exerciseId: 'high_knee', durationSec: 45, restSec: 25 },
      { exerciseId: 'squat', reps: 15, restSec: 0 },
    ],
  },
  {
    id: 'mobility',
    name: '關節活動度',
    level: '入門',
    description: '緩慢、有控制的關節活動，適合復健或年長者。可坐著做。',
    items: [
      { exerciseId: 'shoulder_abduction_hold', reps: 5, restSec: 15 },
      { exerciseId: 'arm_raise_hold', reps: 5, restSec: 15 },
      { exerciseId: 'knee_flexion', reps: 10, restSec: 15 },
      { exerciseId: 'trunk_side_bend', reps: 8, restSec: 0 },
    ],
  },
];

export const PROGRAM_BY_ID: Record<string, Program> = Object.fromEntries(PROGRAMS.map((p) => [p.id, p]));

/** 估算課程總時間（秒）。 */
export function estimateDuration(program: Program): number {
  let total = 0;
  for (const item of program.items) {
    const ex = EXERCISE_BY_ID[item.exerciseId];
    if (item.durationSec) total += item.durationSec;
    else total += (item.reps ?? ex.defaultReps) * Math.max(ex.minRepSeconds * 1.6, 2);
    total += item.restSec + 8; // 每個動作前的說明與倒數
  }
  return total;
}

/** 單一動作快速練習用的臨時課程。 */
export function singleExerciseProgram(exerciseId: string, reps?: number): Program {
  const ex = EXERCISE_BY_ID[exerciseId];
  return {
    id: `single:${exerciseId}`,
    name: ex.name,
    level: '入門',
    description: ex.description,
    items: [{ exerciseId, reps: reps ?? ex.defaultReps, restSec: 0 }],
  };
}
