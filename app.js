const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

function haptic(t) { tg?.HapticFeedback?.impactOccurred(t || 'light'); }
function hapticOk() { tg?.HapticFeedback?.notificationOccurred('success'); }

// ── State ──────────────────────────────────────────────
const KEY = 'wt_v1';

function freshState() {
  return { week: 0, day: 0, workout: null };
}

function load() {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch {}
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

function startTimer() {
  if (timerTick) return;
  timerSec = TIMER_MAX;
  haptic('medium');
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

// ── Main render ────────────────────────────────────────
function render() {
  stopTimer();

  if (state.week >= 8) {
    renderComplete();
    return;
  }

  // Init workout state if needed
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
    return `
      <div class="${cardClass}">
        <div class="exmeta">
          ${ex.isDropset ? '<span class="dropset-tag">дропсет</span>' : ''}
          <span>${ex.sets}×${ex.reps}</span>
        </div>
        <div class="exname">${ex.name}</div>
        <div class="sets-row">${dots}</div>
      </div>`;
  }).join('');

  appEl.innerHTML = `
    <div class="hdr">
      <div class="week-tag" id="week-tag">Неделя ${w + 1} из 8</div>
      <div class="day-name">${DAY_NAMES[d]}</div>
      <div class="day-dots">${dayDots}</div>
    </div>
    <div class="exlist">${cards}</div>`;

  // Long-press on week tag → reset progress
  let pressTimer = null;
  const weekTag = document.getElementById('week-tag');
  weekTag.addEventListener('pointerdown', () => {
    pressTimer = setTimeout(() => {
      haptic('heavy');
      if (confirm('Сбросить весь прогресс и начать с недели 1?')) {
        state = freshState();
        save();
        render();
      }
    }, 1000);
  });
  weekTag.addEventListener('pointerup',    () => clearTimeout(pressTimer));
  weekTag.addEventListener('pointerleave', () => clearTimeout(pressTimer));

  appEl.querySelectorAll('.sdot').forEach(btn => {
    btn.addEventListener('click', () => {
      const ei = +btn.dataset.ei;
      const si = +btn.dataset.si;
      const scrollY = window.scrollY;

      state.workout.sets[ei][si] = !state.workout.sets[ei][si];
      save();
      haptic('light');

      renderWorkout();
      renderBar();
      window.scrollTo({ top: scrollY, behavior: 'instant' });
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
  document.getElementById('btn-rest')?.addEventListener('click', startTimer);
  document.getElementById('btn-skip')?.addEventListener('click', () => {
    stopTimer();
    haptic('medium');
    renderBar();
  });
}

function finishDay() {
  stopTimer();
  hapticOk();

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
