import { EXERCISE_BY_ID } from '../exercises/definitions';
import { directionLabel, metricLabel, tripletsFor } from '../exercises/metrics';
import { ExerciseTracker } from '../exercises/tracker';
import type { Exercise } from '../exercises/types';
import { Camera } from '../pose/camera';
import { PoseDetector } from '../pose/detector';
import { allVisible } from '../pose/angles';
import { FULL_BODY_POINTS, UPPER_BODY_POINTS, type Pose } from '../pose/landmarks';
import type { Program, ProgramItem } from '../programs/definitions';
import { speech } from '../speech';
import type { SessionItemResult, SessionResult, Settings } from '../storage';
import { el } from './dom';
import { Overlay } from './overlay';

export interface SessionHandlers {
  onFinish(result: SessionResult): void;
  onExit(): void;
}

type Phase = 'loading' | 'intro' | 'countdown' | 'active' | 'rest' | 'done';

/** 訓練畫面：相機 + 骨架疊加 + 動作引導。回傳清理函式。 */
export function mountSession(root: HTMLElement, program: Program, settings: Settings, handlers: SessionHandlers): () => void {
  root.innerHTML = '';
  speech.enabled = settings.voice;

  // ───── DOM ─────
  const video = el('video', { class: settings.facing === 'user' ? 'mirrored' : '' });
  const canvas = el('canvas');
  const titleName = el('b');
  const titleSub = el('span');
  const counter = el('div', { class: 'counter' });
  const cue = el('div', { class: 'cue' });
  const metricText = el('b');
  const dirText = el('span');
  const stateText = el('span', { class: 'chip' });
  const progressBar = el('div');
  const flipBtn = el('button', { class: 'icon-btn', 'aria-label': '切換鏡頭', onClick: () => void flipCamera() }, ['🔄']);
  const muteBtn = el('button', { class: 'icon-btn', 'aria-label': '語音', onClick: toggleVoice }, [settings.voice ? '🔊' : '🔇']);
  const skipBtn = el('button', { class: 'btn secondary', onClick: () => skipItem() }, ['跳過此動作']);
  const endBtn = el('button', { class: 'btn danger', onClick: () => endSession() }, ['結束']);
  const panel = el('div', { class: 'panel' });
  const hudBottom = el('div', { class: 'hud-bottom' }, [
    cue,
    el('div', { class: 'metric-row' }, [metricText, dirText, el('span', { class: 'spacer' }), stateText]),
    el('div', { class: 'progress' }, [progressBar]),
    el('div', { class: 'hud-actions' }, [skipBtn, endBtn]),
  ]);
  const wrap = el('div', { class: 'session' }, [
    video,
    canvas,
    el('div', { class: 'hud-top' }, [
      el('button', { class: 'icon-btn', 'aria-label': '返回', onClick: () => endSession(true) }, ['✕']),
      el('div', { class: 'title' }, [titleName, titleSub]),
      counter,
      muteBtn,
      flipBtn,
    ]),
    hudBottom,
    panel,
  ]);
  root.append(wrap);

  // ───── 狀態 ─────
  const camera = new Camera(video);
  const detector = new PoseDetector();
  const overlay = new Overlay(canvas);
  let phase: Phase = 'loading';
  let itemIndex = 0;
  let tracker: ExerciseTracker | null = null;
  let currentPose: Pose | null = null;
  let bodyVisible = false;
  let lastVisibleAt = 0;
  let itemStartedAt = 0;
  let rafId = 0;
  let timerId = 0;
  let cueTimer = 0;
  let disposed = false;
  const sessionStartedAt = Date.now();
  const results: SessionItemResult[] = [];

  const currentItem = (): ProgramItem => program.items[itemIndex];
  const currentExercise = (): Exercise => EXERCISE_BY_ID[currentItem().exerciseId];
  const targetReps = (): number => currentItem().reps ?? currentExercise().defaultReps;

  // ───── 提示 ─────
  function showCue(text: string, kind: 'warn' | 'good' | 'danger' | '' = '', speak = true, holdMs = 2500): void {
    cue.textContent = text;
    cue.className = `cue ${kind}`;
    if (speak) speech.speak(text);
    window.clearTimeout(cueTimer);
    if (holdMs > 0) cueTimer = window.setTimeout(() => {
      if (cue.textContent === text) cue.textContent = '';
    }, holdMs);
  }

  function toggleVoice(): void {
    speech.enabled = !speech.enabled;
    muteBtn.textContent = speech.enabled ? '🔊' : '🔇';
    if (!speech.enabled) speech.stop();
  }

  async function flipCamera(): Promise<void> {
    try {
      await camera.flip();
      video.classList.toggle('mirrored', camera.mirrored);
      detector.reset();
    } catch (err) {
      showCue(`切換鏡頭失敗：${(err as Error).message}`, 'danger', false);
    }
  }

  // ───── 面板 ─────
  function setPanel(content: HTMLElement | null): void {
    panel.innerHTML = '';
    panel.hidden = content === null;
    if (content) panel.append(content);
  }

  function showLoading(msg: string): void {
    setPanel(el('div', {}, [el('div', { class: 'spinner', style: 'margin:0 auto 16px' }), el('h2', {}, ['準備中']), el('p', { class: 'note' }, [msg])]));
  }

  function showError(msg: string): void {
    setPanel(
      el('div', {}, [
        el('h2', {}, ['無法啟動']),
        el('div', { class: 'error' }, [msg]),
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn block', onClick: () => void init() }, ['重試']),
          el('button', { class: 'btn secondary block', onClick: () => handlers.onExit() }, ['回首頁']),
        ]),
      ]),
    );
  }

  function showIntro(): void {
    phase = 'intro';
    const ex = currentExercise();
    const item = currentItem();
    tracker = new ExerciseTracker(ex);
    titleName.textContent = ex.name;
    titleSub.textContent = `第 ${itemIndex + 1} / ${program.items.length} 個動作`;
    counter.innerHTML = '';
    progressBar.style.width = '0%';
    cue.textContent = '';
    const target = item.durationSec
      ? `${item.durationSec} 秒`
      : ex.mode === 'hold'
        ? `${targetReps()} 次，每次維持 ${ex.holdSeconds} 秒`
        : `${targetReps()} 次`;
    const visibilityHint = el('p', { class: 'note' });
    const startBtn = el('button', { class: 'btn block', onClick: () => startCountdown() }, ['開始']);
    setPanel(
      el('div', {}, [
        el('div', { class: 'chip accent' }, [`第 ${itemIndex + 1} / ${program.items.length} 個動作`]),
        el('h2', {}, [ex.name]),
        el('p', {}, [ex.description]),
        el('ol', {}, ex.steps.map((s) => el('li', {}, [s]))),
        el('p', {}, [el('b', {}, [`目標：${target}`])]),
        visibilityHint,
        el('div', { class: 'actions' }, [startBtn, el('button', { class: 'btn secondary block', onClick: () => skipItem() }, ['跳過此動作'])]),
      ]),
    );
    speech.speak(`下一個動作，${ex.name}。${ex.description}`, { interrupt: true });
    // 每 300ms 更新入鏡狀態
    window.clearInterval(timerId);
    timerId = window.setInterval(() => {
      if (phase !== 'intro') return;
      if (!currentPose) visibilityHint.textContent = '尚未偵測到人，請站到相機前。';
      else if (!bodyVisible) visibilityHint.textContent = ex.fullBody ? '請退後一點，讓全身（含腳踝）入鏡。' : '請讓上半身（含手肘）入鏡。';
      else visibilityHint.textContent = '✓ 已偵測到您，可以開始。';
    }, 300);
  }

  function startCountdown(): void {
    speech.unlock();
    phase = 'countdown';
    window.clearInterval(timerId);
    let n = 3;
    const big = el('div', { class: 'big' }, [String(n)]);
    setPanel(el('div', {}, [el('h2', {}, [currentExercise().name]), big, el('p', { class: 'note' }, ['準備…'])]));
    speech.speak(String(n), { interrupt: true });
    timerId = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(timerId);
        startActive();
        return;
      }
      big.textContent = String(n);
      speech.speak(String(n), { interrupt: true });
    }, 1000);
  }

  function startActive(): void {
    phase = 'active';
    setPanel(null);
    tracker?.reset();
    itemStartedAt = performance.now();
    showCue('開始！', 'good');
    const item = currentItem();
    if (item.durationSec) {
      window.clearInterval(timerId);
      let lastSpoken = -1;
      timerId = window.setInterval(() => {
        if (phase !== 'active') return;
        const elapsed = (performance.now() - itemStartedAt) / 1000;
        const remain = Math.max(0, item.durationSec! - elapsed);
        updateCounter(remain);
        if (remain <= 0) {
          completeItem(false);
          return;
        }
        const whole = Math.ceil(remain);
        if (whole <= 3 && whole !== lastSpoken) {
          lastSpoken = whole;
          speech.speak(String(whole));
        }
      }, 250);
    }
    updateCounter();
  }

  function updateCounter(remainSec?: number): void {
    const reps = tracker?.reps ?? 0;
    const item = currentItem();
    if (item.durationSec) {
      counter.innerHTML = `${Math.ceil(remainSec ?? item.durationSec)}<small> 秒 · ${reps} 次</small>`;
    } else {
      counter.innerHTML = `${reps}<small> / ${targetReps()}</small>`;
    }
  }

  function recordItem(skipped: boolean): void {
    const ex = currentExercise();
    const snap = tracker?.snapshot();
    results.push({
      exerciseId: ex.id,
      name: ex.name,
      reps: tracker?.reps ?? 0,
      target: targetReps(),
      durationSec: currentItem().durationSec,
      metricLabel: metricLabel(ex.metric.kind),
      romMin: snap?.romMin ?? 0,
      romMax: snap?.romMax ?? 0,
      skipped,
    });
  }

  function completeItem(skipped: boolean): void {
    window.clearInterval(timerId);
    recordItem(skipped);
    const isLast = itemIndex >= program.items.length - 1;
    if (!skipped) speech.speak('完成，做得好！', { interrupt: true });
    if (isLast) {
      finish();
      return;
    }
    const rest = currentItem().restSec;
    itemIndex += 1;
    if (rest > 0 && !skipped) showRest(rest);
    else showIntro();
  }

  function skipItem(): void {
    if (phase === 'loading' || phase === 'done') return;
    completeItem(true);
  }

  function showRest(sec: number): void {
    phase = 'rest';
    let remain = sec;
    const next = EXERCISE_BY_ID[currentItem().exerciseId];
    const big = el('div', { class: 'big' }, [String(remain)]);
    setPanel(
      el('div', {}, [
        el('h2', {}, ['休息一下']),
        big,
        el('p', {}, ['下一個：', el('b', {}, [next.name])]),
        el('div', { class: 'actions' }, [el('button', { class: 'btn secondary block', onClick: () => showIntro() }, ['跳過休息'])]),
      ]),
    );
    speech.speak(`休息 ${sec} 秒`);
    window.clearInterval(timerId);
    timerId = window.setInterval(() => {
      remain -= 1;
      big.textContent = String(Math.max(0, remain));
      if (remain === 3) speech.speak('休息結束，準備下一個動作');
      if (remain <= 0) {
        window.clearInterval(timerId);
        showIntro();
      }
    }, 1000);
  }

  function endSession(silent = false): void {
    if (phase === 'done') return;
    if (phase === 'loading') {
      handlers.onExit();
      return;
    }
    const anyDone = results.length > 0 || (tracker?.reps ?? 0) > 0;
    if (!silent && !confirm('確定要結束這次訓練嗎？')) return;
    if (silent && !anyDone) {
      cleanup();
      handlers.onExit();
      return;
    }
    if (phase === 'active' || phase === 'countdown' || phase === 'intro') recordItem(phase !== 'active');
    finish();
  }

  function finish(): void {
    phase = 'done';
    const result: SessionResult = {
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      programId: program.id,
      programName: program.name,
      durationSec: Math.round((Date.now() - sessionStartedAt) / 1000),
      items: results,
    };
    cleanup();
    handlers.onFinish(result);
  }

  // ───── 偵測迴圈 ─────
  function loop(): void {
    if (disposed) return;
    rafId = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.videoWidth === 0) return;
    const now = performance.now();
    const frame = detector.detect(video, now);
    overlay.resize(frame.width, frame.height);
    currentPose = frame.pose;
    const ex = phase === 'loading' ? null : currentExercise();

    if (!frame.pose) {
      bodyVisible = false;
      overlay.clear();
      if (phase === 'active' && now - lastVisibleAt > 1000) showCue('沒有偵測到人，請站到相機前', 'danger', false, 0);
      return;
    }
    const needed = ex?.fullBody ? FULL_BODY_POINTS : UPPER_BODY_POINTS;
    bodyVisible = allVisible(frame.pose, needed, 0.45);
    if (bodyVisible) lastVisibleAt = now;

    let progress = 0;
    if (tracker && ex) {
      if (phase === 'active') {
        if (!bodyVisible && now - lastVisibleAt > 1000) {
          showCue(ex.fullBody ? '請退後，讓全身入鏡' : '請讓上半身入鏡', 'danger', false, 0);
        } else if (cue.classList.contains('danger') && bodyVisible) {
          cue.textContent = '';
          cue.className = 'cue';
        }
        const events = tracker.update(frame.pose, now);
        for (const ev of events) {
          if (ev.type === 'rep') {
            speech.speak(String(ev.reps), { interrupt: true });
            cue.textContent = ex.mode === 'hold' ? `完成 ${ev.reps} 次` : '';
            cue.className = 'cue good';
            updateCounter();
            const item = currentItem();
            if (!item.durationSec && (ev.reps ?? 0) >= targetReps()) {
              completeItem(false);
              return;
            }
          } else if (ev.type === 'cue') {
            const good = ev.text === ex.cues.reached;
            showCue(ev.text, good ? 'good' : 'warn');
          }
        }
      } else {
        // 說明／休息時也讓追蹤器更新，畫面上才會有角度，但不計次。
        tracker.update(frame.pose, now);
        tracker.reps = 0;
      }
      const snap = tracker.snapshot();
      const active = snap.channels.filter((c) => c.visible);
      const lead = active.length ? active.reduce((a, b) => (b.progress > a.progress ? b : a)) : snap.channels[0];
      progress = lead.progress;
      metricText.textContent = `${metricLabel(ex.metric.kind)} ${Math.round(lead.value)}°`;
      dirText.textContent = directionLabel(ex.metric.kind, lead.velocity);
      stateText.textContent =
        ex.mode === 'hold' && lead.state === 'reached'
          ? `維持 ${lead.holdSeconds.toFixed(1)} / ${ex.holdSeconds} 秒`
          : lead.state === 'rest'
            ? '起始'
            : lead.state === 'reached'
              ? '到位'
              : '進行中';
      progressBar.style.width = `${Math.round(progress * 100)}%`;
      progressBar.className = progress >= 0.85 ? 'done' : '';
      if (ex.mode === 'hold' && phase === 'active' && lead.state === 'reached') {
        cue.textContent = `維持住… ${Math.max(0, (ex.holdSeconds ?? 3) - lead.holdSeconds).toFixed(1)} 秒`;
        cue.className = 'cue good';
      }
    }

    overlay.draw(frame.pose, {
      mirrored: camera.mirrored,
      triplets: ex ? tripletsFor(ex.metric) : [],
      progress,
      showAngles: settings.showAngles,
    });
  }

  // ───── 啟動／清理 ─────
  async function init(): Promise<void> {
    phase = 'loading';
    showLoading('開啟相機…');
    try {
      await camera.start(settings.facing);
      video.classList.toggle('mirrored', camera.mirrored);
      if (!detector.ready) await detector.load((msg) => showLoading(msg));
      if (disposed) return;
      cancelAnimationFrame(rafId);
      loop();
      showIntro();
    } catch (err) {
      console.error(err);
      showError((err as Error).message ?? String(err));
    }
  }

  function cleanup(): void {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    window.clearInterval(timerId);
    window.clearTimeout(cueTimer);
    speech.stop();
    camera.stop();
    detector.close();
  }

  void init();
  return cleanup;
}
