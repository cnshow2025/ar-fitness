import type { Pose } from '../pose/landmarks';
import { EmaValue, VelocityEstimator } from '../pose/smoothing';
import { measure } from './metrics';
import type { Exercise, MetricReading } from './types';

export type TrackerEventType = 'rep' | 'cue';

export interface TrackerEvent {
  type: TrackerEventType;
  /** rep：目前累計次數；cue：提示文字 */
  text: string;
  reps?: number;
}

export type ChannelState = 'rest' | 'moving' | 'reached' | 'returning';

export interface ChannelSnapshot {
  id: string;
  state: ChannelState;
  /** 平滑後的指標值 */
  value: number;
  /** 0..1，離目標多近 */
  progress: number;
  visible: boolean;
  /** 指標變化速度（度／秒） */
  velocity: number;
  /** hold 模式：已經維持的秒數 */
  holdSeconds: number;
}

export interface TrackerSnapshot {
  reps: number;
  channels: ChannelSnapshot[];
  /** 全部通道的最小／最大指標值（活動範圍） */
  romMin: number;
  romMax: number;
  /** 最近一次提示 */
  lastCue: string;
}

const REST_EXIT = 0.25;
const REST_ENTER = 0.18;
const REACHED = 0.85;
const HOLD_KEEP = 0.7;
const PARTIAL_MIN = 0.45;

class Channel {
  state: ChannelState = 'rest';
  private ema = new EmaValue(0.35);
  private vel = new VelocityEstimator(250);
  private peak = 0;
  private startedAt = 0;
  private reachedAt = 0;
  private lastVisibleAt = 0;
  value = 0;
  progress = 0;
  velocity = 0;
  visible = false;
  holdSeconds = 0;

  constructor(readonly id: string, private readonly ex: Exercise) {}

  private toProgress(v: number): number {
    const span = this.ex.targetValue - this.ex.restValue;
    if (span === 0) return 0;
    return Math.min(1, Math.max(0, (v - this.ex.restValue) / span));
  }

  update(reading: MetricReading, t: number): TrackerEvent[] {
    const events: TrackerEvent[] = [];
    this.visible = reading.visible;
    if (!reading.visible) {
      // 看不到超過 1.5 秒就重置，避免亂計次。
      if (t - this.lastVisibleAt > 1500 && this.state !== 'rest') {
        this.state = 'rest';
        this.ema.reset();
        this.vel.reset();
      }
      return events;
    }
    this.lastVisibleAt = t;
    this.value = this.ema.push(reading.value);
    this.velocity = this.vel.push(t, this.value);
    const p = this.toProgress(this.value);
    this.progress = p;

    switch (this.state) {
      case 'rest':
        if (p > REST_EXIT) {
          this.state = 'moving';
          this.peak = p;
          this.startedAt = t;
        }
        break;
      case 'moving':
        this.peak = Math.max(this.peak, p);
        if (p >= REACHED) {
          this.state = 'reached';
          this.reachedAt = t;
          this.holdSeconds = 0;
          if (this.ex.mode === 'reps' && this.ex.cues.reached) events.push({ type: 'cue', text: this.ex.cues.reached });
        } else if (p < REST_ENTER) {
          this.state = 'rest';
          if (this.peak >= PARTIAL_MIN) events.push({ type: 'cue', text: this.ex.cues.more });
        }
        break;
      case 'reached':
        if (this.ex.mode === 'hold') {
          if (p >= HOLD_KEEP) {
            this.holdSeconds = (t - this.reachedAt) / 1000;
            if (this.holdSeconds >= (this.ex.holdSeconds ?? 3)) {
              this.state = 'returning';
              events.push({ type: 'rep', text: '' });
            }
          } else {
            this.state = 'moving';
            this.holdSeconds = 0;
            events.push({ type: 'cue', text: '還沒到時間，再撐一下' });
          }
        } else if (p < REST_ENTER) {
          this.state = 'rest';
          const dur = (t - this.startedAt) / 1000;
          events.push({ type: 'rep', text: '' });
          if (dur < this.ex.minRepSeconds) events.push({ type: 'cue', text: '慢一點，動作做完整' });
        }
        break;
      case 'returning':
        if (p < REST_ENTER) {
          this.state = 'rest';
          this.holdSeconds = 0;
        }
        break;
    }
    return events;
  }

  reset(): void {
    this.state = 'rest';
    this.ema.reset();
    this.vel.reset();
    this.peak = 0;
    this.holdSeconds = 0;
  }
}

/** 一個動作的計次／回饋追蹤器，會依 side 設定建立一或兩個通道。 */
export class ExerciseTracker {
  reps = 0;
  private channels: Channel[];
  private romMin = Number.POSITIVE_INFINITY;
  private romMax = Number.NEGATIVE_INFINITY;
  private lastCue = '';
  private lastCueAt = 0;

  constructor(readonly exercise: Exercise) {
    const ids = exercise.metric.side === 'alternate' ? ['left', 'right'] : [exercise.metric.side];
    this.channels = ids.map((id) => new Channel(id, exercise));
  }

  /** 餵入一幀，回傳這一幀產生的事件（計次、提示）。 */
  update(pose: Pose, t: number): TrackerEvent[] {
    const readings = measure(this.exercise.metric, pose);
    const out: TrackerEvent[] = [];
    for (const ch of this.channels) {
      const reading = readings[ch.id];
      if (!reading) continue;
      const events = ch.update(reading, t);
      if (reading.visible) {
        this.romMin = Math.min(this.romMin, ch.value);
        this.romMax = Math.max(this.romMax, ch.value);
      }
      for (const ev of events) {
        if (ev.type === 'rep') {
          this.reps += 1;
          out.push({ type: 'rep', text: String(this.reps), reps: this.reps });
        } else if (ev.text) {
          // 同樣的提示 4 秒內不重複，避免一直碎念。
          if (ev.text !== this.lastCue || t - this.lastCueAt > 4000) {
            this.lastCue = ev.text;
            this.lastCueAt = t;
            out.push(ev);
          }
        }
      }
    }
    return out;
  }

  /** 沒偵測到人時呼叫，避免舊資料殘留。 */
  noPose(): void {
    /* 通道會在可見度中斷後自行重置 */
  }

  snapshot(): TrackerSnapshot {
    return {
      reps: this.reps,
      channels: this.channels.map((c) => ({
        id: c.id,
        state: c.state,
        value: c.value,
        progress: c.progress,
        visible: c.visible,
        velocity: c.velocity,
        holdSeconds: c.holdSeconds,
      })),
      romMin: Number.isFinite(this.romMin) ? this.romMin : 0,
      romMax: Number.isFinite(this.romMax) ? this.romMax : 0,
      lastCue: this.lastCue,
    };
  }

  reset(): void {
    this.reps = 0;
    this.channels.forEach((c) => c.reset());
    this.romMin = Number.POSITIVE_INFINITY;
    this.romMax = Number.NEGATIVE_INFINITY;
    this.lastCue = '';
  }
}
