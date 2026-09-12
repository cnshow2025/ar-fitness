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
}

const HISTORY_KEY = 'arfit.history.v1';
const SETTINGS_KEY = 'arfit.settings.v1';

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
  return { voice: true, facing: 'user', showAngles: true, ...read<Partial<Settings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}
