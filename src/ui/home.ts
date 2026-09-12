import { CATEGORY_LABEL, EXERCISES } from '../exercises/definitions';
import { estimateDuration, PROGRAMS, singleExerciseProgram, type Program } from '../programs/definitions';
import { clearHistory, loadDanceRecords, loadHistory, saveSettings, type Settings } from '../storage';
import { LEVELS } from '../dance/chart';
import type { Level } from '../dance/types';
import { el, formatDuration } from './dom';

type Tab = 'programs' | 'exercises' | 'dance' | 'history' | 'settings';

export interface HomeHandlers {
  onStart(program: Program): void;
  onDance(level: Level): void;
}

let currentTab: Tab = 'programs';

export function renderHome(root: HTMLElement, settings: Settings, handlers: HomeHandlers): void {
  root.innerHTML = '';
  const screen = el('div', { class: 'screen' });

  screen.append(
    el('div', { class: 'topbar' }, [
      el('div', {}, [el('h1', {}, ['AR 動作教練']), el('div', { class: 'sub' }, ['相機偵測關節角度，帶您完成每一組動作'])]),
    ]),
  );

  const tabs = el('div', { class: 'tabs' });
  const tabDefs: Array<[Tab, string]> = [
    ['programs', '課程'],
    ['exercises', '單項動作'],
    ['dance', '跳舞'],
    ['history', '紀錄'],
    ['settings', '設定'],
  ];
  const content = el('div');
  const renderTab = (tab: Tab) => {
    currentTab = tab;
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    content.innerHTML = '';
    if (tab === 'programs') content.append(programsTab(handlers));
    if (tab === 'exercises') content.append(exercisesTab(handlers));
    if (tab === 'dance') content.append(danceTab(handlers));
    if (tab === 'history') content.append(historyTab(() => renderTab('history')));
    if (tab === 'settings') content.append(settingsTab(settings));
  };
  for (const [tab, label] of tabDefs) {
    tabs.append(el('button', { 'data-tab': tab, onClick: () => renderTab(tab) }, [label]));
  }
  screen.append(tabs, content);
  root.append(screen);
  renderTab(currentTab);
}

function programsTab(handlers: HomeHandlers): HTMLElement {
  const wrap = el('div');
  wrap.append(el('p', { class: 'note' }, ['選一個課程開始。手機請放在腰部高度、距離約 2 公尺，讓全身入鏡效果最好。']));
  for (const p of PROGRAMS) {
    const names = p.items.map((i) => EXERCISES.find((e) => e.id === i.exerciseId)?.name ?? i.exerciseId);
    const uniq = [...new Set(names)];
    wrap.append(
      el('button', { class: 'card', onClick: () => handlers.onStart(p) }, [
        el('h3', {}, [p.name, el('span', { class: `chip ${p.level === '入門' ? 'accent' : p.level === '進階' ? 'warn' : ''}` }, [p.level])]),
        el('p', {}, [p.description]),
        el('div', { class: 'meta' }, [
          el('span', { class: 'chip' }, [`約 ${formatDuration(estimateDuration(p))}`]),
          el('span', { class: 'chip' }, [`${p.items.length} 個動作`]),
          el('span', { class: 'chip' }, [uniq.join('、')]),
        ]),
      ]),
    );
  }
  return wrap;
}

function exercisesTab(handlers: HomeHandlers): HTMLElement {
  const wrap = el('div');
  wrap.append(el('p', { class: 'note' }, ['單獨練習一個動作，並看即時關節角度。']));
  const cats = ['lower', 'upper', 'mobility', 'core'] as const;
  for (const cat of cats) {
    const list = EXERCISES.filter((e) => e.category === cat);
    if (list.length === 0) continue;
    wrap.append(el('div', { class: 'section-title' }, [CATEGORY_LABEL[cat]]));
    for (const ex of list) {
      const target = ex.mode === 'hold' ? `${ex.defaultReps} 次，每次維持 ${ex.holdSeconds} 秒` : `${ex.defaultReps} 次`;
      wrap.append(
        el('button', { class: 'card', onClick: () => handlers.onStart(singleExerciseProgram(ex.id)) }, [
          el('h3', {}, [ex.name]),
          el('p', {}, [ex.description]),
          el('div', { class: 'meta' }, [
            el('span', { class: 'chip accent' }, [target]),
            el('span', { class: 'chip' }, [ex.fullBody ? '需全身入鏡' : '上半身入鏡即可']),
          ]),
        ]),
      );
    }
  }
  return wrap;
}

function danceTab(handlers: HomeHandlers): HTMLElement {
  const wrap = el('div');
  const records = loadDanceRecords();
  wrap.append(
    el('p', { class: 'note' }, [
      '跳舞九宮格：地板上會出現 3×3 格子，跟著節拍把腳踩進亮起的格子，看到手勢圖示就做動作。需要全身入鏡，建議把手機放在腰部高度、距離 2 到 2.5 公尺。',
    ]),
  );
  for (const lv of LEVELS) {
    const rec = records[lv.id];
    const stars = rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : '☆☆☆';
    wrap.append(
      el('button', { class: 'card', onClick: () => handlers.onDance(lv) }, [
        el('h3', {}, [`第 ${lv.id} 關　${lv.name}`, el('span', { class: 'chip warn', style: 'letter-spacing:2px' }, [stars])]),
        el('p', {}, [
          [
            `${lv.bpm} BPM`,
            `${lv.bars} 小節`,
            lv.density === 1 ? '每 2 拍一步' : lv.density === 2 ? '每拍一步' : '含半拍',
            lv.diagonals ? '含斜角' : '只有前後左右',
            lv.gestureProb > 0 ? '含手勢' : '',
            lv.jumpProb > 0 ? '含雙腳跳' : '',
          ]
            .filter(Boolean)
            .join(' · '),
        ]),
        el('div', { class: 'meta' }, [
          rec ? el('span', { class: 'chip accent' }, [`最高 ${rec.score} 分 · ${Math.round(rec.accuracy * 100)}%`]) : el('span', { class: 'chip' }, ['尚未挑戰']),
          rec ? el('span', { class: 'chip' }, [`最高連擊 ${rec.maxCombo}`]) : null,
        ]),
      ]),
    );
  }
  return wrap;
}

function historyTab(rerender: () => void): HTMLElement {
  const wrap = el('div');
  const list = loadHistory();
  if (list.length === 0) {
    wrap.append(el('p', { class: 'note' }, ['還沒有紀錄。完成一次課程後會顯示在這裡（只存在這支手機上）。']));
    return wrap;
  }
  for (const s of list) {
    const reps = s.items.reduce((a, i) => a + i.reps, 0);
    const d = new Date(s.date);
    wrap.append(
      el('div', { class: 'card' }, [
        el('h3', {}, [s.programName]),
        el('p', {}, [`${d.toLocaleDateString('zh-TW')} ${d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`]),
        el('div', { class: 'meta' }, [
          el('span', { class: 'chip accent' }, [`${reps} 次`]),
          el('span', { class: 'chip' }, [formatDuration(s.durationSec)]),
          el('span', { class: 'chip' }, [`${s.items.filter((i) => !i.skipped).length}/${s.items.length} 個動作完成`]),
        ]),
      ]),
    );
  }
  wrap.append(
    el(
      'button',
      {
        class: 'btn secondary block',
        onClick: () => {
          if (confirm('確定要清除所有紀錄嗎？')) {
            clearHistory();
            rerender();
          }
        },
      },
      ['清除紀錄'],
    ),
  );
  return wrap;
}

function settingsTab(settings: Settings): HTMLElement {
  const wrap = el('div');
  const toggleRow = (label: string, desc: string, get: () => boolean, set: (v: boolean) => void) => {
    const t = el('button', { class: `toggle ${get() ? 'on' : ''}`, 'aria-label': label });
    t.addEventListener('click', () => {
      set(!get());
      saveSettings(settings);
      t.classList.toggle('on', get());
    });
    return el('div', { class: 'setting' }, [el('div', {}, [el('div', {}, [label]), el('div', { class: 'note' }, [desc])]), t]);
  };
  wrap.append(
    toggleRow(
      '語音提示',
      '念出次數與動作提示',
      () => settings.voice,
      (v) => (settings.voice = v),
    ),
    toggleRow(
      '顯示關節角度',
      '在畫面上標示角度數字',
      () => settings.showAngles,
      (v) => (settings.showAngles = v),
    ),
    toggleRow(
      '預設使用前鏡頭',
      '關閉則預設使用後鏡頭（請他人幫忙拍或用支架）',
      () => settings.facing === 'user',
      (v) => (settings.facing = v ? 'user' : 'environment'),
    ),
  );
  wrap.append(
    toggleRow(
      '手勢控制',
      '單手高舉 1.5 秒＝開始／下一個；雙手胸前交叉 1.5 秒＝跳過，不用走到手機前',
      () => settings.gestureControl,
      (v) => (settings.gestureControl = v),
    ),
    toggleRow(
      '自動開始',
      '動作說明時偵測到您入鏡後，5 秒自動倒數開始',
      () => settings.autoStart,
      (v) => (settings.autoStart = v),
    ),
    toggleRow(
      '跳舞語音報格',
      '跳舞時提前一拍念出下一步（BPM 太快時自動關閉）',
      () => settings.danceVoice,
      (v) => (settings.danceVoice = v),
    ),
  );
  const offsetVal = el('b', {}, [`${settings.danceOffsetMs} ms`]);
  const step = (d: number) => {
    settings.danceOffsetMs = Math.max(-200, Math.min(400, settings.danceOffsetMs + d));
    offsetVal.textContent = `${settings.danceOffsetMs} ms`;
    saveSettings(settings);
  };
  wrap.append(
    el('div', { class: 'setting' }, [
      el('div', {}, [el('div', {}, ['跳舞判定延遲補償']), el('div', { class: 'note' }, ['覺得明明踩準卻總是判「晚了」就調大，總是判「早了」就調小'])]),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn secondary small', onClick: () => step(-20) }, ['−']),
        offsetVal,
        el('button', { class: 'btn secondary small', onClick: () => step(20) }, ['+']),
      ]),
    ]),
  );
  wrap.append(
    el('div', { class: 'section-title' }, ['關於']),
    el('p', { class: 'note' }, [
      '姿勢偵測（MediaPipe Pose）完全在手機上執行，影像不會上傳到任何伺服器。',
    ]),
    el('p', { class: 'note' }, ['本 App 只提供動作引導與計次，不是醫療建議。若有不適請立即停止並諮詢專業人員。']),
    el('p', { class: 'note' }, ['提示：在瀏覽器選單選「加入主畫面」可以像 App 一樣全螢幕使用。']),
  );
  return wrap;
}
