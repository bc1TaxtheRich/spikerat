const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

function haptic(t) { tg?.HapticFeedback?.impactOccurred(t || 'light'); }
function hapticOk() { tg?.HapticFeedback?.notificationOccurred('success'); }

// ── Wake Lock ──────────────────────────────────────────
let wakeLock = null;

async function keepAwake() {
  if (!navigator.wakeLock || wakeLock) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}

function releaseWake() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});

// ── State ──────────────────────────────────────────────
const KEY = 'wt_v1';

function freshState() {
  return { week: 0, day: 0, workout: null, history: [] };
}

function load() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) {
      const s = JSON.parse(r);
      if (!s.history) s.history = [];  // migrate old saves
      return s;
    }
  } catch {}
  return freshState();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

let state = load();

// ── Timer ──────────────────────────────────────────────
const TIMER_MAX = 120;
let timerSec = 0;
let timerTick = null;

function startTimer(auto = false) {
  if (timerTick && !auto) return;
  stopTimer();
  timerSec = TIMER_MAX;
  if (!auto) haptic('medium');
  timerTick = setInterval(() => {
    timerSec--;
    if (timerSec <= 0) {
      clearInterval(timerTick);
      timerTick = null;
      hapticOk();
      renderBar();
    } else {
      const txt = document.getElementById('timer-text');
      const fill = document.getElementById('ring-fill');
      if (txt) txt.textContent = fmt(timerSec);
      if (fill) {
        fill.style.strokeDashoffset = (251.33 * (1 - timerSec / TIMER_MAX)).toFixed(2);
        if (timerSec <= 30) fill.classList.add('urgent');
      }
    }
  }, 1000);
  renderBar();
}

function stopTimer() {
  clearInterval(timerTick);
  timerTick = null;
}

function fmt(s) {
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ── DOM refs ───────────────────────────────────────────
const appEl = document.getElementById('app');
const barEl = document.getElementById('bar');

// ── Exercise image overlay (2-frame animation) ─────────
function showExerciseImage(ex) {
  if (!ex.img) return;
  haptic('light');

  const frame1 = ex.img;
  const frame2 = ex.img.replace('/0.jpg', '/1.jpg');

  const overlay = document.createElement('div');
  overlay.className = 'img-overlay';
  overlay.innerHTML = `
    <div class="img-modal">
      <div class="img-exname">${ex.name}</div>
      <img id="ex-gif" src="${frame1}" alt="${ex.name}" loading="lazy">
      <button class="img-close">✕</button>
    </div>`;
  document.body.appendChild(overlay);

  // Alternate frames to simulate animation
  let tick = 0;
  const frames = [frame1, frame2];
  const interval = setInterval(() => {
    const img = document.getElementById('ex-gif');
    if (!img) { clearInterval(interval); return; }
    tick = 1 - tick;
    img.src = frames[tick];
  }, 700);

  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.classList.contains('img-close')) {
      clearInterval(interval);
      overlay.remove();
    }
  });
}

// ── Calendar overlay ───────────────────────────────────
function showCalendar() {
  haptic('light');
  const DAY_LABELS = ['Пн', 'Ср', 'Пт'];
  const MONTH_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

  const rows = Array.from({length: 8}, (_, wi) => {
    const cells = Array.from({length: 3}, (_, di) => {
      const h = state.history.find(x => x.week === wi && x.day === di);
      const isCurrent = wi === state.week && di === state.day;
      let cls = 'cal-cell';
      if (h) cls += ' cal-done';
      else if (isCurrent) cls += ' cal-current';
      else if (wi > state.week || (wi === state.week && di > state.day)) cls += ' cal-future';

      const dateStr = h ? (() => {
        const d = new Date(h.date);
        return `${d.getDate()} ${MONTH_RU[d.getMonth()]}`;
      })() : '';
      return `<div class="${cls}">${dateStr ? `<span class="cal-date">${dateStr}</span>` : ''}</div>`;
    }).join('');
    return `<div class="cal-row"><span class="cal-wk">Н${wi + 1}</span>${cells}</div>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'img-overlay';
  overlay.innerHTML = `
    <div class="img-modal cal-modal-inner">
      <div class="img-exname">
        История тренировок
        <span style="color:var(--hint);font-weight:400;font-size:12px;margin-left:8px">${state.history.length} / 24</span>
      </div>
      <div class="cal-overlay-grid">
        <div class="cal-overlay-head">
          <span></span>
          ${DAY_LABELS.map(l => `<span>${l}</span>`).join('')}
        </div>
        ${rows}
      </div>
      <button class="img-close">✕</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.classList.contains('img-close')) overlay.remove();
  });
}

// ── Main render ────────────────────────────────────────
function render() {
  stopTimer();

  if (state.week >= 8) {
    releaseWake();
    renderComplete();
    return;
  }

  keepAwake();

  if (!state.workout || state.workout.week !== state.week || state.workout.day !== state.day) {
    const exs = WORKOUTS[state.week][state.day];
    state.workout = {
      week: state.week,
      day: state.day,
      sets: exs.map(ex => Array(ex.sets).fill(false)),
    };
    save();
  }

  renderWorkout();
  renderBar();
}


function renderWorkout() {
  const DAY_NAMES = ['Понедельник', 'Среда', 'Пятница'];
  const w = state.week;
  const d = state.day;
  const exs = WORKOUTS[w][d];
  const ws = state.workout.sets;

  const dayDots = [0, 1, 2].map(i => {
    const cls = i < d ? 'done' : i === d ? 'current' : '';
    return `<span class="day-dot ${cls}"></span>`;
  }).join('');

  const cards = exs.map((ex, ei) => {
    const allDone = ws[ei].every(Boolean);
    const dots = ws[ei].map((done, si) =>
      `<button class="sdot${done ? ' done' : ''}" data-ei="${ei}" data-si="${si}"></button>`
    ).join('');

    const heavy = ex.intensity === 'тяжёлая';
    const cardClass = `excard${heavy ? '' : ' medium'}${allDone ? ' all-done' : ''}`;
    const hasImg = !!ex.img;
    return `
      <div class="${cardClass}">
        <div class="exmeta">
          ${ex.isDropset ? '<span class="dropset-tag">дропсет</span>' : ''}
          <span>${ex.sets}×${ex.reps}</span>
        </div>
        <div class="exname${hasImg ? ' has-img' : ''}" data-ei="${ei}">${ex.name}${hasImg ? '<span class="img-hint">▶</span>' : ''}</div>
        <div class="sets-row">${dots}</div>
      </div>`;
  }).join('');

  appEl.innerHTML = `
    <div class="hdr">
      <div class="hdr-top">
        <div class="week-tag" id="week-tag">Неделя ${w + 1} из 8</div>
        <button class="cal-btn" id="cal-btn" title="История">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 1v3M11 1v3M1 7h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="day-name">${DAY_NAMES[d]}</div>
      <div class="day-dots">${dayDots}</div>
    </div>
    <div class="exlist">${cards}</div>`;

  // Long-press on week tag → reset
  let pressTimer = null;
  const weekTag = document.getElementById('week-tag');
  weekTag.addEventListener('pointerdown', () => {
    pressTimer = setTimeout(() => {
      haptic('heavy');
      const doReset = () => { state = freshState(); save(); render(); };
      if (tg?.showConfirm) {
        tg.showConfirm('Сбросить весь прогресс и начать с недели 1?', ok => { if (ok) doReset(); });
      } else {
        if (confirm('Сбросить весь прогресс и начать с недели 1?')) doReset();
      }
    }, 1000);
  });
  weekTag.addEventListener('pointerup',    () => clearTimeout(pressTimer));
  weekTag.addEventListener('pointerleave', () => clearTimeout(pressTimer));

  document.getElementById('cal-btn')?.addEventListener('click', showCalendar);

  // Exercise name tap → show image
  appEl.querySelectorAll('.exname.has-img').forEach(el => {
    el.addEventListener('click', () => {
      const ei = +el.dataset.ei;
      showExerciseImage(exs[ei]);
    });
  });

  // Set dot taps
  appEl.querySelectorAll('.sdot').forEach(btn => {
    btn.addEventListener('click', () => {
      const ei = +btn.dataset.ei;
      const si = +btn.dataset.si;
      const scrollY = window.scrollY;
      const isLastSetOfExercise = si === state.workout.sets[ei].length - 1;

      state.workout.sets[ei][si] = !state.workout.sets[ei][si];
      const nowDone = state.workout.sets[ei][si];
      save();
      haptic('light');

      renderWorkout();
      renderBar();
      window.scrollTo({ top: scrollY, behavior: 'instant' });

      if (nowDone && !isLastSetOfExercise) startTimer(true);
    });
  });
}

function renderBar() {
  const allDone = state.workout?.sets.every(ex => ex.every(Boolean));
  let html = '';

  if (allDone) {
    html += `<button class="btn btn-finish" id="btn-finish">Завершить тренировку ✓</button>`;
  }

  if (timerTick) {
    const offset = (251.33 * (1 - timerSec / TIMER_MAX)).toFixed(2);
    const urgent = timerSec <= 30;
    html += `
      <div class="timer-wrap">
        <div class="ring-outer">
          <svg class="ring-svg" viewBox="0 0 100 100">
            <circle class="ring-track" cx="50" cy="50" r="40"/>
            <circle class="ring-fill${urgent ? ' urgent' : ''}" id="ring-fill"
                    cx="50" cy="50" r="40"
                    style="stroke-dashoffset:${offset}"/>
          </svg>
          <div id="timer-text">${fmt(timerSec)}</div>
        </div>
      </div>
      <button class="btn btn-skip" id="btn-skip">Начать раньше</button>`;
  } else {
    html += `<button class="btn btn-rest" id="btn-rest">⏱ Отдых 2 мин</button>`;
  }

  barEl.innerHTML = html;

  document.getElementById('btn-finish')?.addEventListener('click', finishDay);
  document.getElementById('btn-rest')?.addEventListener('click', () => startTimer());
  document.getElementById('btn-skip')?.addEventListener('click', () => {
    stopTimer();
    haptic('medium');
    renderBar();
  });
}

function finishDay() {
  stopTimer();
  hapticOk();

  // Record history
  const today = new Date().toISOString().slice(0, 10);
  const already = state.history.find(h => h.week === state.week && h.day === state.day);
  if (!already) state.history.push({ week: state.week, day: state.day, date: today });

  state.day++;
  if (state.day >= 3) { state.day = 0; state.week++; }
  state.workout = null;
  save();

  appEl.innerHTML = `<div class="fullscreen"><div class="big-icon">💪</div><h1>Готово!</h1></div>`;
  barEl.innerHTML = '';

  setTimeout(render, 2000);
}

function renderComplete() {
  appEl.innerHTML = `
    <div class="fullscreen">
      <div class="big-icon">🏆</div>
      <h1>Программа завершена!</h1>
      <p>8 недель пройдено.<br>Отличная работа!</p>
      <button class="btn btn-restart" id="btn-restart">Начать заново</button>
    </div>`;
  barEl.innerHTML = '';

  document.getElementById('btn-restart')?.addEventListener('click', () => {
    state = freshState();
    save();
    render();
  });
}

render();
