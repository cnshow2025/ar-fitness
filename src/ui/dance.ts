import { BeatAudio } from '../dance/audio';
import { chartLengthBeats, generateChart, LEVEL_BY_ID } from '../dance/chart';
import { FootTracker, GestureTracker } from '../dance/detect';
import { DanceGame, type JudgeEvent } from '../dance/game';
import { averageCalibrations, calibrateFromPose, FloorGrid, type GridCalibration } from '../dance/grid';
import { CELL_NAMES, GESTURE_ICONS, GESTURE_NAMES, type Judgement, type Level, type Note } from '../dance/types';
import { allVisible } from '../pose/angles';
import { Camera } from '../pose/camera';
import { PoseDetector } from '../pose/detector';
import { FULL_BODY_POINTS, type Pose } from '../pose/landmarks';
import { speech } from '../speech';
import { saveDanceRecord, type DanceRecord, type Settings } from '../storage';
import { DanceOverlay, FOOT_COLOR, FOOT_LABEL, type FlashDraw, type TargetDraw } from './danceOverlay';
import { el } from './dom';
import { CONTROL_HINT, drawHoldRing, HoldController } from '../control/gestures';

export interface DanceHandlers {
  onExit(): void;
  onPlay(level: Level): void;
}

type Phase = 'loading' | 'calibrate' | 'ready' | 'countdown' | 'playing' | 'result' | 'error';

const JUDGE_LABEL: Record<Judgement, string> = { perfect: 'PERFECT', good: 'GOOD', miss: 'MISS' };

function noteLabel(n: Note): string {
  if (n.kind === 'gesture') return `${GESTURE_ICONS[n.gesture]} ${GESTURE_NAMES[n.gesture]}`;
  return `${FOOT_LABEL[n.foot]} ${CELL_NAMES[n.cell]}`;
}

function noteVoice(n: Note): string {
  if (n.kind === 'gesture') return GESTURE_NAMES[n.gesture];
  if (n.foot === 'both') return `跳${CELL_NAMES[n.cell]}`;
  return `${n.foot === 'L' ? '左' : '右'}，${CELL_NAMES[n.cell]}`;
}

/** 跳舞九宮格遊戲畫面。回傳清理函式。 */
export function mountDance(root: HTMLElement, level: Level, settings: Settings, handlers: DanceHandlers): () => void {
  root.innerHTML = '';
  speech.enabled = settings.voice;
  speech.unlock();
  const audio = new BeatAudio();
  void audio.unlock().catch(() => {});

  // ───── DOM ─────
  const video = el('video', { class: settings.facing === 'user' ? 'mirrored' : '' });
  const canvas = el('canvas');
  const scoreEl = el('div', { class: 'counter' }, ['0']);
  const comboEl = el('div', { class: 'combo' });
  const beatLights = Array.from({ length: 4 }, () => el('span', { class: 'beat-light' }));
  const previewCells = Array.from({ length: 9 }, () => el('div', { class: 'pv-cell' }));
  const previewGesture = el('div', { class: 'pv-gesture' });
  // 平面預告格用「俯視、玩家面向手機」的方向：上排＝靠近手機（前）、下排＝遠離手機（後）。
  // 資料的 row 0 是後排，所以顯示時上下翻轉。
  const previewOrder = [6, 7, 8, 3, 4, 5, 0, 1, 2].map((i) => previewCells[i]);
  const preview = el('div', { class: 'preview-grid', hidden: true }, [
    previewGesture,
    el('div', { class: 'pv-marker' }, ['📱 手機這邊（前）']),
    el('div', { class: 'pv-grid' }, previewOrder),
    el('div', { class: 'pv-marker' }, ['後']),
  ]);
  const lane = el('div', { class: 'dance-lane' });
  const gestureBanner = el('div', { class: 'gesture-banner', hidden: true });
  const judgePop = el('div', { class: 'judge-pop' });
  const progressBar = el('div');
  const hint = el('div', { class: 'cue' });
  const panel = el('div', { class: 'panel' });
  const holdLabel = el('span');
  const holdFill = el('i');
  const holdBar = el('div', { class: 'hold-bar', hidden: true }, [holdLabel, el('div', { class: 'track' }, [holdFill])]);
  const flipBtn = el('button', { class: 'icon-btn', 'aria-label': '切換鏡頭', onClick: () => void flipCamera() }, ['🔄']);
  const wrap = el('div', { class: 'session dance' }, [
    video,
    canvas,
    el('div', { class: 'hud-top' }, [
      el('button', { class: 'icon-btn', 'aria-label': '返回', onClick: () => exit() }, ['✕']),
      el('div', { class: 'title' }, [el('b', {}, [`第 ${level.id} 關 ${level.name}`]), el('span', { class: 'beat-lights' }, [`${level.bpm} BPM `, ...beatLights])]),
      el('div', {}, [scoreEl, comboEl]),
      flipBtn,
    ]),
    preview,
    lane,
    gestureBanner,
    judgePop,
    el('div', { class: 'hud-bottom' }, [hint, el('div', { class: 'progress' }, [progressBar])]),
    panel,
  ]);
  root.append(wrap);

  // ───── 狀態 ─────
  const camera = new Camera(video);
  const detector = new PoseDetector();
  const overlay = new DanceOverlay(canvas);
  const feet = new FootTracker(2);
  const gestures = new GestureTracker();
  const notes = generateChart(level);
  const totalBeats = chartLengthBeats(notes);
  let game = new DanceGame(notes, level.bpm);
  let grid: FloorGrid | null = null;
  let phase: Phase = 'loading';
  let rafId = 0;
  let timerId = 0;
  let disposed = false;
  let perfStart = 0;
  let calSamples: GridCalibration[] = [];
  let calAnchor: { x: number; y: number } | null = null;
  let calStableSince = 0;
  const flashes: Array<FlashDraw & { until: number }> = [];
  const announced = new Set<number>();
  let lastBeatInt = -1;
  let lastPreviewKey = '';
  let currentPose: Pose | null = null;
  const control = new HoldController();
  let readyTimer = 0;
  let resultNext: (() => void) | null = null;

  const msPerBeat = 60000 / level.bpm;
  const songTime = (perfT: number) => perfT - perfStart - settings.danceOffsetMs;

  function setPanel(content: HTMLElement | null): void {
    panel.innerHTML = '';
    panel.hidden = content === null;
    if (content) panel.append(content);
  }

  function showLoading(msg: string): void {
    setPanel(el('div', {}, [el('div', { class: 'spinner', style: 'margin:0 auto 16px' }), el('h2', {}, ['準備中']), el('p', { class: 'note' }, [msg])]));
  }

  function showError(msg: string): void {
    phase = 'error';
    setPanel(
      el('div', {}, [
        el('h2', {}, ['無法啟動']),
        el('div', { class: 'error' }, [msg]),
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn block', onClick: () => void init() }, ['重試']),
          el('button', { class: 'btn secondary block', onClick: () => exit() }, ['回關卡列表']),
        ]),
      ]),
    );
  }

  // ───── 校正 ─────
  function startCalibrate(): void {
    phase = 'calibrate';
    grid = null;
    calSamples = [];
    calAnchor = null;
    calStableSince = 0;
    feet.reset();
    gestures.reset();
    panel.hidden = true;
    hint.className = 'cue';
    hint.textContent = '請站到畫面中央，雙腳併攏，讓全身入鏡';
    speech.speak('請站到畫面中央，雙腳併攏，面對相機', { interrupt: true });
  }

  function calibrateFrame(pose: Pose | null, now: number): void {
    if (!pose || !allVisible(pose, FULL_BODY_POINTS, 0.45)) {
      hint.textContent = '請退後一點，讓全身（含腳踝）入鏡';
      calSamples = [];
      calStableSince = 0;
      return;
    }
    const cal = calibrateFromPose(pose, settings.danceCellScale);
    if (!cal) return;
    const mid = { x: cal.cx, y: cal.cy };
    const moved = calAnchor ? Math.hypot(mid.x - calAnchor.x, mid.y - calAnchor.y) : Infinity;
    if (moved > cal.w * 0.15) {
      calAnchor = mid;
      calSamples = [];
      calStableSince = now;
    }
    calSamples.push(cal);
    const stableFor = (now - calStableSince) / 1000;
    hint.textContent = stableFor < 1.5 ? `保持不動… ${Math.max(0, 1.5 - stableFor).toFixed(1)} 秒` : '';
    if (stableFor >= 1.5 && calSamples.length >= 10) {
      grid = new FloorGrid(averageCalibrations(calSamples.slice(-20)));
      showReady();
    }
  }

  function showReady(): void {
    phase = 'ready';
    hint.textContent = '';
    control.reset();
    const startBtn = el('button', { class: 'btn block', onClick: () => void startCountdown() }, ['開始跳舞']);
    const autoNote = el('p', { class: 'note' }, [settings.gestureControl ? CONTROL_HINT : '']);
    if (settings.autoStart) {
      let left = 5;
      startBtn.textContent = `開始跳舞（${left}）`;
      window.clearInterval(readyTimer);
      readyTimer = window.setInterval(() => {
        if (phase !== 'ready') return;
        left -= 1;
        if (left <= 0) {
          window.clearInterval(readyTimer);
          void startCountdown();
          return;
        }
        startBtn.textContent = `開始跳舞（${left}）`;
      }, 1000);
    }
    setPanel(
      el('div', { class: 'ready-panel' }, [
        el('h2', {}, ['九宮格已就位']),
        el('p', {}, [settings.danceFloorMode === 'pad' ? '腳邊的跳舞墊：上排＝靠近手機、下排＝遠離手機，亮起的格子就是要踩的位置。' : '亮起的格子就是要踩的位置。', el('br'), el('b', { style: `color:${FOOT_COLOR.L}` }, ['藍色 = 左腳']), '　', el('b', { style: `color:${FOOT_COLOR.R}` }, ['橘色 = 右腳']), '　', el('b', { style: `color:${FOOT_COLOR.both}` }, ['綠色 = 雙腳跳']), el('br'), '外框縮到貼齊格子的那一刻踩下去最準。', el('br'), '看到 🙌 👏 ↔️ 就做出對應手勢。']),
        el('div', { class: 'actions' }, [
          startBtn,
          el('button', { class: 'btn secondary block', onClick: () => startCalibrate() }, ['重新校正']),
        ]),
        autoNote,
        holdBar,
      ]),
    );
    speech.speak(settings.autoStart ? '校正完成，5 秒後開始' : '校正完成，準備好就按開始');
  }

  // ───── 倒數與遊玩 ─────
  async function startCountdown(): Promise<void> {
    try {
      await audio.unlock();
    } catch {
      /* 沒有音效也能玩 */
    }
    speech.unlock();
    window.clearInterval(readyTimer);
    phase = 'countdown';
    game = new DanceGame(notes, level.bpm);
    announced.clear();
    lastBeatInt = -1;
    setPanel(null);
    perfStart = audio.start(level.bpm, totalBeats, 0.5);
    lastPreviewKey = '';
    preview.hidden = false;
    renderLane(0);
  }

  function updateCountdown(now: number): void {
    const beat = audio.beatAt(now);
    const n = Math.ceil(4 - beat);
    if (beat < 0) hint.textContent = '準備…';
    else if (n > 0) hint.textContent = String(n);
    if (beat >= 4 - 1e-6) {
      phase = 'playing';
      hint.textContent = '';
    }
    hint.className = 'cue big';
    updateBeatLights(beat);
  }

  function showJudge(j: Judgement): void {
    judgePop.textContent = JUDGE_LABEL[j];
    judgePop.className = `judge-pop show ${j}`;
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => (judgePop.className = 'judge-pop'), 450);
    audio.playJudgement(j);
  }

  function handleEvents(events: JudgeEvent[], now: number): void {
    for (const ev of events) {
      showJudge(ev.judgement);
      const note = game.notes[ev.index].note;
      if (note.kind === 'step' && grid) {
        flashes.push({ cell: note.cell, color: ev.judgement === 'miss' ? '#f87171' : '#4ade80', alpha: 1, until: now + 400 });
      }
    }
    scoreEl.textContent = String(game.score);
    comboEl.textContent = game.combo >= 3 ? `${game.combo} combo` : '';
  }

  function renderLane(tMs: number): void {
    const next = game.upcoming(tMs, 5);
    const key = next.map((u) => u.index).join(',');
    if (key !== lastPreviewKey) {
      lastPreviewKey = key;
      lane.innerHTML = '';
      next.forEach((u, i) => {
        const item = el('div', { class: `lane-item ${i === 0 ? 'first' : ''}` }, [
          el('b', { class: 'lane-num', style: `background:${u.note.kind === 'step' ? FOOT_COLOR[u.note.foot] : '#a78bfa'}` }, [String(i + 1)]),
          el('span', {}, [noteLabel(u.note)]),
        ]);
        lane.append(item);
      });
      // 平面預告九宮格：數字 1～5 放在對應格子
      previewCells.forEach((c) => (c.innerHTML = ''));
      previewGesture.innerHTML = '';
      next.forEach((u, i) => {
        if (u.note.kind === 'gesture') {
          previewGesture.append(el('span', { class: `pv-badge n${i + 1} gesture` }, [`${i + 1} ${GESTURE_ICONS[u.note.gesture]}`]));
          return;
        }
        previewCells[u.note.cell].append(
          el('span', { class: `pv-badge n${i + 1}`, style: `background:${FOOT_COLOR[u.note.foot]}` }, [String(i + 1)]),
        );
      });
    }
    const first = next[0];
    if (first && first.note.kind === 'gesture' && first.msUntil < msPerBeat * 2) {
      const p = Math.min(1, Math.max(0, 1 - first.msUntil / (msPerBeat * 2)));
      gestureBanner.hidden = false;
      gestureBanner.innerHTML = `<div class="ring" style="--p:${p}"><span>${GESTURE_ICONS[first.note.gesture]}</span></div><b>${GESTURE_NAMES[first.note.gesture]}</b>`;
    } else gestureBanner.hidden = true;
  }

  function updateBeatLights(beat: number): void {
    const idx = beat >= 0 ? Math.floor(beat) % 4 : -1;
    beatLights.forEach((l, i) => l.classList.toggle('on', i === idx));
  }

  function playFrame(pose: Pose | null, now: number): void {
    const t = songTime(now);
    if (pose && grid) {
      for (const ev of feet.update(pose, grid, now)) {
        const r = game.onStep(ev.foot, ev.cell, songTime(ev.t));
        if (r) handleEvents([r], now);
      }
      gestures.update(pose);
    }
    handleEvents(game.onFrame({ feet: feet.cells, gestures: gestures.active }, t), now);

    // 語音報格（預設關閉）：提前一拍
    if (settings.danceCallout && level.bpm <= 115) {
      for (const u of game.upcoming(t, 2)) {
        if (!announced.has(u.index) && u.msUntil <= msPerBeat * 1.1) {
          announced.add(u.index);
          if (typeof speechSynthesis === 'undefined' || !speechSynthesis.speaking) speech.speak(noteVoice(u.note), { rate: 1.3 });
        }
      }
    }

    // 節拍指示
    const beatInt = Math.floor(audio.beatAt(now));
    if (beatInt !== lastBeatInt) {
      lastBeatInt = beatInt;
      updateBeatLights(audio.beatAt(now));
    }
    progressBar.style.width = `${Math.min(100, (t / (totalBeats * msPerBeat)) * 100)}%`;
    renderLane(t);

    if (!pose && hint.textContent !== '沒有偵測到人') {
      hint.className = 'cue danger';
      hint.textContent = '沒有偵測到人';
    } else if (pose && hint.className.includes('danger')) {
      hint.className = 'cue';
      hint.textContent = '';
    }

    if (game.finished || t > totalBeats * msPerBeat + 500) showResult();
  }

  function showResult(): void {
    phase = 'result';
    audio.stop();
    lane.innerHTML = '';
    preview.hidden = true;
    gestureBanner.hidden = true;
    updateBeatLights(-1);
    const rec: DanceRecord = {
      levelId: level.id,
      score: game.score,
      accuracy: game.accuracy,
      stars: game.stars,
      maxCombo: game.maxCombo,
      date: new Date().toISOString(),
    };
    const isBest = saveDanceRecord(rec);
    const next = LEVEL_BY_ID[level.id + 1];
    const stars = '★'.repeat(game.stars) + '☆'.repeat(3 - game.stars);
    control.reset();
    resultNext = next && game.stars >= 1 ? () => handlers.onPlay(next) : () => handlers.onPlay(level);
    setPanel(
      el('div', {}, [
        el('h2', {}, [game.stars === 3 ? '太棒了！' : game.stars >= 1 ? '完成！' : '再試一次'] ),
        el('div', { class: 'stars' }, [stars]),
        el('div', { class: 'stat-row' }, [
          el('div', { class: 'stat' }, [el('b', {}, [String(game.score)]), el('span', {}, [isBest ? '分數（新紀錄）' : '分數'])]),
          el('div', { class: 'stat' }, [el('b', {}, [`${Math.round(game.accuracy * 100)}%`]), el('span', {}, ['準確率'])]),
          el('div', { class: 'stat' }, [el('b', {}, [String(game.maxCombo)]), el('span', {}, ['最高連擊'])]),
        ]),
        el('p', { class: 'note' }, [`Perfect ${game.counts.perfect}　Good ${game.counts.good}　Miss ${game.counts.miss}`]),
        el('div', { class: 'actions' }, [
          next && game.stars >= 1 ? el('button', { class: 'btn block', onClick: () => handlers.onPlay(next) }, [`下一關：${next.name}`]) : null,
          el('button', { class: `btn block ${next && game.stars >= 1 ? 'secondary' : ''}`, onClick: () => handlers.onPlay(level) }, ['再玩一次']),
          el('button', { class: 'btn secondary block', onClick: () => exit() }, ['回關卡列表']),
        ]),
        settings.gestureControl ? el('p', { class: 'note' }, [next && game.stars >= 1 ? '✋ 單手高舉＝下一關　✖ 雙手交叉＝回列表' : '✋ 單手高舉＝再玩一次　✖ 雙手交叉＝回列表']) : null,
        holdBar,
      ]),
    );
    speech.speak(game.stars === 3 ? '太棒了，三顆星！' : game.stars >= 1 ? `完成，${game.stars} 顆星` : '再試一次', { interrupt: true });
  }

  // ───── 迴圈 ─────
  function loop(): void {
    if (disposed) return;
    rafId = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.videoWidth === 0) return;
    const now = performance.now();
    const frame = detector.detect(video, now);
    overlay.resize(frame.width, frame.height);
    currentPose = frame.pose;

    if (phase === 'calibrate') calibrateFrame(frame.pose, now);
    else if (phase === 'countdown') {
      updateCountdown(now);
      if (frame.pose && grid) feet.update(frame.pose, grid, now);
    } else if (phase === 'playing') playFrame(frame.pose, now);
    else if (phase === 'ready' || phase === 'result') {
      if (frame.pose && grid) feet.update(frame.pose, grid, now);
      // 控制手勢：就位頁＝開始／回列表，結果頁＝下一關（或再玩）／回列表
      const fired = settings.gestureControl ? control.update(frame.pose, now) : null;
      if (fired === 'raiseOne') {
        if (phase === 'ready') void startCountdown();
        else resultNext?.();
        return;
      }
      if (fired === 'crossArms') {
        exit();
        return;
      }
      const st = control.state;
      if (st.gesture && st.progress > 0) {
        holdBar.hidden = false;
        holdLabel.textContent = st.gesture === 'raiseOne' ? (phase === 'ready' ? '✋ 維持中…開始' : '✋ 維持中…下一步') : '✖ 維持中…回列表';
        holdFill.style.width = `${Math.round(st.progress * 100)}%`;
      } else holdBar.hidden = true;
    }

    // 目標與閃光
    const targets: TargetDraw[] = [];
    if (phase === 'playing') {
      const t = songTime(now);
      for (const u of game.upcoming(t, 3)) {
        if (u.note.kind !== 'step' || u.msUntil > msPerBeat * 2) continue;
        targets.push({ cell: u.note.cell, foot: u.note.foot, progress: 1 - u.msUntil / (msPerBeat * 2) });
      }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].alpha = Math.max(0, (flashes[i].until - now) / 400);
      if (flashes[i].alpha <= 0) flashes.splice(i, 1);
    }
    const previewGrid = phase === 'calibrate' && currentPose ? previewGridFrom(currentPose) : grid;
    let beatPulse = 0;
    if (phase === 'playing' || phase === 'countdown') {
      const frac = audio.beatAt(now) % 1;
      if (frac >= 0) beatPulse = Math.max(0, 1 - frac * 3);
    }
    overlay.draw(frame.pose, {
      mirrored: camera.mirrored,
      grid: previewGrid,
      feet: feet.cells,
      targets,
      flashes,
      showLabels: phase !== 'playing',
      beatPulse,
      mode: settings.danceFloorMode,
    });
    if (phase === 'ready' || phase === 'result') drawHoldRing(canvas, control.state, camera.mirrored);
  }

  function previewGridFrom(pose: Pose): FloorGrid | null {
    if (calSamples.length) return new FloorGrid(averageCalibrations(calSamples.slice(-10)));
    const cal = calibrateFromPose(pose, settings.danceCellScale);
    return cal ? new FloorGrid(cal) : null;
  }

  async function flipCamera(): Promise<void> {
    try {
      await camera.flip();
      video.classList.toggle('mirrored', camera.mirrored);
      detector.reset();
      if (phase !== 'loading' && phase !== 'error') startCalibrate();
    } catch (err) {
      hint.textContent = `切換鏡頭失敗：${(err as Error).message}`;
    }
  }

  function exit(): void {
    cleanup();
    handlers.onExit();
  }

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
      startCalibrate();
    } catch (err) {
      console.error(err);
      showError((err as Error).message ?? String(err));
    }
  }

  function cleanup(): void {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    window.clearTimeout(timerId);
    window.clearInterval(readyTimer);
    speech.stop();
    audio.close();
    camera.stop();
    detector.close();
  }

  void init();
  return cleanup;
}
