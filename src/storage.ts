export interface SessionItemResult {
  exerciseId: string;
  name: string;
  reps: number;
  target: number;
  /** 以時間為準的項目 */
  durationSec?: number;
  metricLabel: string;
  romMin: number;
  romMax: number;
  skipped: boolean;
}

export interface SessionResult {
  id: string;
  date: string; // ISO
  programId: string;
  programName: string;
  durationSec: number;
  items: SessionItemResult[];
}

export interface Settings {
  voice: boolean;
  facing: 'user' | 'environment';
  showAngles: boolean;
  /** 跳舞判定的延遲補償（毫秒），補償相機與姿勢偵測的延遲 */
  danceOffsetMs: number;
  /** 跳舞時語音報格（預設關閉，節奏用鼓點與畫面就夠清楚） */
  danceCallout: boolean;
  /** 偵測到人入鏡後自動倒數開始 */
  autoStart: boolean;
  /** 單手高舉／雙手交叉的控制手勢 */
  gestureControl: boolean;
  /** 跳舞地板格顯示：pad＝俯視跳舞墊（上＝手機），ar＝貼地透視 */
  danceFloorMode: 'pad' | 'ar';
  /** 跳舞格子大小倍率（1 = 預設） */
  danceCellScale: number;
  /** 上排代表往後退（像照鏡子，預設）；false 則上排代表往手機走（像跳舞機） */
  danceUpIsBack: boolean;
}

export interface DanceRecord {
  levelId: number;
  score: number;
  accuracy: number;
  stars: number;
  maxCombo: number;
  date: string;
}

const HISTORY_KEY = 'arfit.history.v1';
const SETTINGS_KEY = 'arfit.settings.v1';
const DANCE_KEY = 'arfit.dance.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 私密模式等情況下寫不進去就算了 */
  }
}

export function loadHistory(): SessionResult[] {
  return read<SessionResult[]>(HISTORY_KEY, []);
}

export function saveSession(result: SessionResult): void {
  const list = loadHistory();
  list.unshift(result);
  write(HISTORY_KEY, list.slice(0, 100));
}

export function clearHistory(): void {
  write(HISTORY_KEY, []);
}

export function loadSettings(): Settings {
  return {
    voice: true,
    facing: 'user',
    showAngles: true,
    danceOffsetMs: 100,
    danceCallout: false,
    autoStart: true,
    gestureControl: true,
    danceFloorMode: 'pad',
    danceCellScale: 1,
    danceUpIsBack: true,
    ...read<Partial<Settings>>(SETTINGS_KEY, {}),
  };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}

export function loadDanceRecords(): Record<number, DanceRecord> {
  return read<Record<number, DanceRecord>>(DANCE_KEY, {});
}

/** 只保留每關最高分。回傳是否刷新紀錄。 */
export function saveDanceRecord(rec: DanceRecord): boolean {
  const all = loadDanceRecords();
  const prev = all[rec.levelId];
  if (prev && prev.score >= rec.score) return false;
  all[rec.levelId] = rec;
  write(DANCE_KEY, all);
  return true;
}
