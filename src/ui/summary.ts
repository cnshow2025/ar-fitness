import type { SessionResult } from '../storage';
import { el, formatDuration } from './dom';

export interface SummaryHandlers {
  onHome(): void;
  onRepeat(): void;
}

export function renderSummary(root: HTMLElement, result: SessionResult, handlers: SummaryHandlers): void {
  root.innerHTML = '';
  const screen = el('div', { class: 'screen' });
  const totalReps = result.items.reduce((a, i) => a + i.reps, 0);
  const done = result.items.filter((i) => !i.skipped).length;

  screen.append(
    el('div', { class: 'topbar' }, [
      el('div', {}, [el('h1', {}, ['完成！']), el('div', { class: 'sub' }, [result.programName])]),
    ]),
    el('div', { class: 'stat-row' }, [
      el('div', { class: 'stat' }, [el('b', {}, [String(totalReps)]), el('span', {}, ['總次數'])]),
      el('div', { class: 'stat' }, [el('b', {}, [formatDuration(result.durationSec)]), el('span', {}, ['用時'])]),
      el('div', { class: 'stat' }, [el('b', {}, [`${done}/${result.items.length}`]), el('span', {}, ['完成動作'])]),
    ]),
  );

  const table = el('table', { class: 'summary' });
  table.append(
    el('tr', {}, [el('th', {}, ['動作']), el('th', {}, ['次數']), el('th', {}, ['關節活動範圍'])]),
  );
  for (const item of result.items) {
    const reps = item.durationSec ? `${item.reps} 次 / ${item.durationSec} 秒` : `${item.reps} / ${item.target}`;
    const rom = item.romMax > item.romMin ? `${Math.round(item.romMin)}° – ${Math.round(item.romMax)}°` : '—';
    table.append(
      el('tr', {}, [
        el('td', {}, [item.name, item.skipped ? el('span', { class: 'chip', style: 'margin-left:6px' }, ['略過']) : null]),
        el('td', { class: 'num' }, [reps]),
        el('td', {}, [el('div', {}, [rom]), el('div', { class: 'note', style: 'margin:0' }, [item.metricLabel])]),
      ]),
    );
  }
  screen.append(table);
  screen.append(
    el('p', { class: 'note' }, ['關節活動範圍是這個動作期間量到的最小與最大角度，可用來觀察活動度的變化。']),
    el('div', { class: 'actions', style: 'display:flex;flex-direction:column;gap:10px;margin-top:20px' }, [
      el('button', { class: 'btn block', onClick: handlers.onRepeat }, ['再做一次']),
      el('button', { class: 'btn secondary block', onClick: handlers.onHome }, ['回首頁']),
    ]),
  );
  root.append(screen);
}
