export type Foot = 'L' | 'R';
export type Gesture = 'handsUp' | 'clap' | 'tpose';

export interface StepNote {
  kind: 'step';
  /** 拍數（0 起算，可為小數） */
  beat: number;
  foot: Foot | 'both';
  /** 0..8，row*3+col；row 0=後、2=前；col 0=玩家左、2=玩家右 */
  cell: number;
}

export interface GestureNote {
  kind: 'gesture';
  beat: number;
  gesture: Gesture;
}

export type Note = StepNote | GestureNote;

export interface Level {
  id: number;
  name: string;
  bpm: number;
  bars: number;
  /** 1=每小節 2 拍有指令、2=每拍、3=含半拍 */
  density: 1 | 2 | 3;
  diagonals: boolean;
  gestureProb: number;
  jumpProb: number;
  seed: number;
}

export type Judgement = 'perfect' | 'good' | 'miss';

export const CELL_NAMES = ['左後', '後', '右後', '左', '中', '右', '左前', '前', '右前'] as const;

export const GESTURE_NAMES: Record<Gesture, string> = {
  handsUp: '舉手',
  clap: '拍手',
  tpose: '張開雙臂',
};

export const GESTURE_ICONS: Record<Gesture, string> = {
  handsUp: '🙌',
  clap: '👏',
  tpose: '↔️',
};

export const CENTER_CELL = 4;

export function cellRow(cell: number): number {
  return Math.floor(cell / 3);
}
export function cellCol(cell: number): number {
  return cell % 3;
}
export function cellIndex(row: number, col: number): number {
  return row * 3 + col;
}
