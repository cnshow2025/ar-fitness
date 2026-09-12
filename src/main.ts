import './style.css';
import type { Program } from './programs/definitions';
import { loadSettings, saveSession, type SessionResult } from './storage';
import { renderHome } from './ui/home';
import { mountSession } from './ui/session';
import { renderSummary } from './ui/summary';

const root = document.getElementById('app')!;
const settings = loadSettings();
let teardown: (() => void) | null = null;

function goHome(): void {
  teardown?.();
  teardown = null;
  window.scrollTo(0, 0);
  renderHome(root, settings, { onStart: startProgram });
}

function startProgram(program: Program): void {
  teardown?.();
  teardown = mountSession(root, program, settings, {
    onFinish: (result: SessionResult) => {
      teardown = null;
      saveSession(result);
      renderSummary(root, result, { onHome: goHome, onRepeat: () => startProgram(program) });
      window.scrollTo(0, 0);
    },
    onExit: goHome,
  });
}

goHome();

// PWA：註冊 service worker（僅在 https 或 localhost 有效）。
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => console.warn('SW 註冊失敗', err));
  });
}
