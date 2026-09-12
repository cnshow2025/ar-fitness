import type { Side } from '../pose/landmarks';

/** 可量測的關節指標種類。 */
export type MetricKind = 'knee' | 'hip' | 'elbow' | 'shoulder' | 'trunkTilt' | 'armRaise';

/**
 * 動作要看哪一側：
 * - both：左右平均（例如深蹲、雙手側平舉）
 * - left / right：只看單側
 * - alternate：左右分開計次，各自有狀態機，總次數相加（例如高抬腿）
 */
export type SideMode = 'both' | 'alternate' | Side;

export interface MetricSpec {
  kind: MetricKind;
  side: SideMode;
}

export type ExerciseCategory = 'lower' | 'upper' | 'mobility' | 'core';

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  /** 一句話怎麼做 */
  description: string;
  /** 逐步說明 */
  steps: string[];
  metric: MetricSpec;
  /** 起始（休息）姿勢的指標值，例如深蹲站直膝角 170 */
  restValue: number;
  /** 目標姿勢的指標值，例如深蹲蹲到膝角 95 */
  targetValue: number;
  /** reps：來回一次算一次；hold：到達目標並維持 holdSeconds 算一次 */
  mode: 'reps' | 'hold';
  holdSeconds?: number;
  /** 一次動作至少要花的秒數，太快會提醒放慢 */
  minRepSeconds: number;
  /** 提示語 */
  cues: {
    /** 做到一半就回來時的提示，例如「再蹲低一點」 */
    more: string;
    /** 到達目標時 */
    reached: string;
    /** 回到起始 */
    back: string;
  };
  /** 是否需要全身入鏡（否則只需上半身） */
  fullBody: boolean;
  defaultReps: number;
}

export interface JointTriplet {
  /** a-b-c，b 是要標示角度的關節 */
  a: number;
  b: number;
  c: number;
}

/** 某一側（或合併後）的即時量測結果 */
export interface MetricReading {
  value: number;
  /** 需要的關鍵點是否都看得到 */
  visible: boolean;
}
