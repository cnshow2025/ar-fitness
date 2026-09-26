import { CONTROL_HINT, drawHoldRing, HoldController } from '../control/gestures';
import { HandTracker } from '../mole/detect';
import { GAME_DURATION_MS, MoleGame, type MoleDifficulty } from '../mole/game';
import { averageLayouts, layoutFromPose, type HoleLayout } from '../mole/layout';
import { MoleSfx } from '../mole/sfx';
import { allVisible } from '../pose/angles';
import { Camera } from '../pose/camera';
import { PoseDetector } from '../pose/detector';
import { UPPER_BODY_POINTS, type Pose } from '../pose/landmarks';
import { speech } from '../speech';
import { saveMoleRecord, type MoleRecord, type Settings } from '../storage';
import { el } from './dom';
import { MoleOverlay, type MoleFx } from './moleOverlay';

export interface MoleHandlers {
  onExit(): void;
  onPlay(difficulty: MoleDifficulty): void;
}

type Phase = 'loading' | 'place' | 'ready' | 'countdown' | 'playing' | 'result' | 'error';

/** 打地鼠遊戲畫面。回傳清理函式。 */
export function mountMole(root: HTMLElement, difficulty: MoleDifficulty, settings: Settings, handlers: MoleHandlers): () => void {
  root.innerHTML = '';
  speech.enabled = settings.voice;
  speech.unlock();
  const sfx = new MoleSfx();
  void sfx.unlock().catch(() => {});

  const video = el('video', { class: settings.facing === 'user' ? 'mirrored' : '' });
  const canvas = el('canvas');
  const scoreEl = el('div', { class: 'counter' }, ['0']);
  const comboEl = el('div', { class: 'combo' });
  const timeEl = el('span', { class: 'chip warn' }, ['60 秒']);
  const hint = el('div', { class: 'cue' });
  const progressBar = el('div');
  const panel = el('div', { class: 'panel' });
  const holdLabel = el('span');
  const holdFill = el('i');
  const holdBar = el('div', { class: 'hold-bar', hidden: true }, [holdLabel, el('div', { class: 'track' }, [holdFill])]);
  const flipBtn = el('button', { class: 'icon-btn', 'aria-label': '切換鏡頭', onClick: () => void flipCamera() }, ['🔄']);
  const wrap = el('div', { class: 'session mole' }, [
    video,
    canvas,
    el('div', { class: 'hud-top' }, [
      el('button', { class: 'icon-btn', 'aria-label': '返回', onClick: () => exit() }, ['✕']),
      el('div', { class: 'title' }, [el('b', {}, [`打地鼠 · ${difficulty.name}`]), timeEl]),
      el('div', {}, [scoreEl, comboEl]),
      flipBtn,
    ]),
    el('div', { class: 'hud-bottom' }, [hint, el('div', { class: 'progress' }, [progressBar])]),
    panel,
  ]);
  root.append(wrap);

  const camera = new Camera(video);
  const detector = new PoseDetector();
  const overlay = new MoleOverlay(canvas);
  const hands = new HandTracker();
  const control = new HoldController();
  let game = new MoleGame(difficulty);
  let layout: HoleLayout | null = null;
  let phase: Phase = 'loading';
  let rafId = 0;
  let timerId = 0;
  let readyTimer = 0;
  let disposed = false;
  let startAt = 0;
  let placeSamples: HoleLayout[] = [];
  let placeAnchor: { x: number; y: number } | null = null;
  let placeSince = 0;
  let lastTickSec = -1;
  const fx: MoleFx[] = [];

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
          el('button', { class: 'btn secondary block', onClick: () => exit() }, ['回列表']),
        ]),
      ]),
    );
  }

  // ───── 定位洞的位置 ─────
  function startPlace(): void {
    phase = 'place';
    layout = null;
    placeSamples = [];
    placeAnchor = null;
    placeSince = 0;
    hands.reset();
    control.reset();
    panel.hidden = true;
    hint.className = 'cue';
    hint.textContent = '請面對相機站好，雙手自然垂下，讓上半身入鏡';
    speech.speak('請面對相機站好，雙手自然垂下', { interrupt: true });
  }

  function placeFrame(pose: Pose | null, now: number): void {
    if (!pose || !allVisible(pose, UPPER_BODY_POINTS, 0.45)) {
      hint.textContent = '請讓上半身（含雙手）入鏡';
      placeSamples = [];
      placeSince = 0;
      return;
    }
    const l = layoutFromPose(pose, canvas.width, canvas.height);
    if (!l) return;
    const mid = l.centers[4];
    const moved = placeAnchor ? Math.hypot(mid.x - placeAnchor.x, mid.y - placeAnchor.y) : Infinity;
    if (moved > l.radius * 0.5) {
      placeAnchor = mid;
      placeSamples = [];
      placeSince = now;
    }
    placeSamples.push(l);
    const stableFor = (now - placeSince) / 1000;
    hint.textContent = stableFor < 1.5 ? `保持不動… ${Math.max(0, 1.5 - stableFor).toFixed(1)} 秒` : '';
    if (stableFor >= 1.5 && placeSamples.length >= 10) {
      layout = averageLayouts(placeSamples.slice(-20));
      showReady();
    }
  }

  function showReady(): void {
    phase = 'ready';
    hint.textContent = '';
    control.reset();
    const startBtn = el('button', { class: 'btn block', onClick: () => void startCountdown() }, ['開始']);
    if (settings.autoStart) {
      let left = 5;
      startBtn.textContent = `開始（${left}）`;
      window.clearInterval(readyTimer);
      readyTimer = window.setInterval(() => {
        if (phase !== 'ready') return;
        left -= 1;
        if (left <= 0) {
          window.clearInterval(readyTimer);
          void startCountdown();
          return;
        }
        startBtn.textContent = `開始（${left}）`;
      }, 1000);
    }
    setPanel(
      el('div', { class: 'ready-panel' }, [
        el('h2', {}, ['洞已排好']),
        el('p', {}, ['🐹 冒出來就用手揮過去打它：+1 分', el('br'), '🐹 金色的 +3 分，但很快就縮回去', el('br'), '💣 炸彈不要打，打到 −2 分', el('br'), '連續打中 5 次以上，每次多 +1', el('br'), `時間 ${GAME_DURATION_MS / 1000} 秒。可先揮揮手，確認手的圓圈在洞上。`]),
        el('div', { class: 'actions' }, [startBtn, el('button', { class: 'btn secondary block', onClick: () => startPlace() }, ['重新定位'])]),
        el('p', { class: 'note' }, [settings.gestureControl ? CONTROL_HINT : '']),
        holdBar,
      ]),
    );
    speech.speak(settings.autoStart ? '準備好了，5 秒後開始' : '準備好就按開始');
  }

  async function startCountdown(): Promise<void> {
    try {
      await sfx.unlock();
    } catch {
      /* 沒音效也能玩 */
    }
    speech.unlock();
    window.clearInterval(readyTimer);
    phase = 'countdown';
    game = new MoleGame(difficulty);
    fx.length = 0;
    setPanel(null);
    let n = 3;
    hint.className = 'cue big';
    hint.textContent = String(n);
    sfx.tick();
    window.clearInterval(timerId);
    timerId = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(timerId);
        phase = 'playing';
        startAt = performance.now();
        lastTickSec = -1;
        hint.className = 'cue good';
        hint.textContent = '開始！';
        window.setTimeout(() => {
          if (phase === 'playing' && hint.textContent === '開始！') hint.textContent = '';
        }, 800);
        return;
      }
      hint.textContent = String(n);
      sfx.tick();
    }, 1000);
  }

  function addFx(hole: number, text: string, color: string, now: number): void {
    fx.push({ hole, text, color, until: now + 600, alpha: 1 });
  }

  function playFrame(pose: Pose | null, now: number): void {
    const t = now - startAt;
    for (const ev of game.update(t)) {
      if (ev.type === 'spawn') sfx.pop();
      else if (ev.type === 'miss') {
        sfx.miss();
        addFx(ev.hole, 'MISS', '#f87171', now);
      }
    }
    if (pose && layout) {
      for (const h of hands.update(pose, layout, now)) {
        const r = game.hit(h.hole, t);
        if (!r) continue;
        if (r.type === 'hit') {
          sfx.hit(r.kind === 'golden');
          addFx(r.hole, `+${r.points}`, r.kind === 'golden' ? '#fbbf24' : '#4ade80', now);
        } else if (r.type === 'bomb') {
          sfx.bomb();
          addFx(r.hole, '−2', '#f87171', now);
          hint.className = 'cue danger';
          hint.textContent = '炸彈！';
          window.clearTimeout(timerId);
          timerId = window.setTimeout(() => (hint.textContent = ''), 700);
        }
      }
    }
    scoreEl.textContent = String(game.score);
    comboEl.textContent = game.combo >= 3 ? `${game.combo} 連擊` : '';
    const remain = game.remainingMs(t);
    const sec = Math.ceil(remain / 1000);
    timeEl.textContent = `${sec} 秒`;
    if (sec <= 5 && sec !== lastTickSec) {
      lastTickSec = sec;
      sfx.tick();
    }
    progressBar.style.width = `${Math.min(100, (t / GAME_DURATION_MS) * 100)}%`;
    if (game.finished(t)) showResult();
  }

  function showResult(): void {
    phase = 'result';
    const rec: MoleRecord = {
      difficulty: difficulty.id,
      score: game.score,
      hits: game.hits,
      misses: game.misses,
      accuracy: game.accuracy,
      maxCombo: game.maxCombo,
      date: new Date().toISOString(),
    };
    const isBest = saveMoleRecord(rec);
    control.reset();
    setPanel(
      el('div', {}, [
        el('h2', {}, ['時間到！']),
        el('div', { class: 'stat-row' }, [
          el('div', { class: 'stat' }, [el('b', {}, [String(game.score)]), el('span', {}, [isBest ? '分數（新紀錄）' : '分數'])]),
          el('div', { class: 'stat' }, [el('b', {}, [`${Math.round(game.accuracy * 100)}%`]), el('span', {}, ['命中率'])]),
          el('div', { class: 'stat' }, [el('b', {}, [String(game.maxCombo)]), el('span', {}, ['最高連擊'])]),
        ]),
        el('p', { class: 'note' }, [`打中 ${game.hits}　漏掉 ${game.misses}　炸彈 ${game.bombsHit}`]),
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn block', onClick: () => handlers.onPlay(difficulty) }, ['再玩一次']),
          el('button', { class: 'btn secondary block', onClick: () => exit() }, ['回列表']),
        ]),
        settings.gestureControl ? el('p', { class: 'note' }, ['✋ 單手高舉＝再玩一次　✖ 雙手交叉＝回列表']) : null,
        holdBar,
      ]),
    );
    speech.speak(`時間到，${game.score} 分`, { interrupt: true });
  }

  function loop(): void {
    if (disposed) return;
    rafId = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.videoWidth === 0) return;
    const now = performance.now();
    const frame = detector.detect(video, now);
    overlay.resize(frame.width, frame.height);

    if (phase === 'place') placeFrame(frame.pose, now);
    else if (phase === 'playing') playFrame(frame.pose, now);
    else if (phase === 'ready' || phase === 'result') {
      if (frame.pose && layout) hands.update(frame.pose, layout, now);
      const fired = settings.gestureControl ? control.update(frame.pose, now) : null;
      if (fired === 'raiseOne') {
        if (phase === 'ready') void startCountdown();
        else handlers.onPlay(difficulty);
        return;
      }
      if (fired === 'crossArms') {
        exit();
        return;
      }
      const st = control.state;
      if (st.gesture && st.progress > 0) {
        holdBar.hidden = false;
        holdLabel.textContent = st.gesture === 'raiseOne' ? (phase === 'ready' ? '✋ 維持中…開始' : '✋ 維持中…再玩一次') : '✖ 維持中…回列表';
        holdFill.style.width = `${Math.round(st.progress * 100)}%`;
      } else holdBar.hidden = true;
    } else if (phase === 'countdown' && frame.pose && layout) hands.update(frame.pose, layout, now);

    for (let i = fx.length - 1; i >= 0; i--) {
      fx[i].alpha = Math.max(0, (fx[i].until - now) / 600);
      if (fx[i].alpha <= 0) fx.splice(i, 1);
    }
    const previewLayout = phase === 'place' && placeSamples.length ? averageLayouts(placeSamples.slice(-10)) : layout;
    overlay.draw(frame.pose, {
      mirrored: camera.mirrored,
      layout: previewLayout,
      moles: phase === 'playing' ? game.moles : new Map(),
      t: now - startAt,
      hands: hands.pos,
      fx,
    });
    if (phase === 'ready' || phase === 'result') drawHoldRing(canvas, control.state, camera.mirrored);
  }

  async function flipCamera(): Promise<void> {
    try {
      await camera.flip();
      video.classList.toggle('mirrored', camera.mirrored);
      detector.reset();
      if (phase !== 'loading' && phase !== 'error') startPlace();
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
      startPlace();
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
    window.clearInterval(readyTimer);
    speech.stop();
    sfx.close();
    camera.stop();
    detector.close();
  }

  void init();
  return cleanup;
}
