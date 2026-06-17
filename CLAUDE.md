# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running locally

No build step. Open directly in a browser or serve with:

```bash
python3 -m http.server 8765
# → http://127.0.0.1:8765/
```

Telegram WebApp SDK (`telegram-web-app.js`) is loaded from Telegram's CDN. All `tg.*` calls are optional-chained so the app degrades gracefully outside Telegram.

## Architecture

Two DOM containers, both in `index.html`, never nested inside each other:

- `#app` — scrollable main content (header + exercise cards). Replaced wholesale on each render.
- `#bar` — fixed bottom bar (rest timer + finish button). Replaced separately so timer survives exercise dot taps.

Render flow in `app.js`:
- `render()` — entry point; calls `renderWorkout()` then `renderBar()`. Also called after `finishDay()` via `setTimeout(render, 2000)`.
- `renderWorkout()` — rebuilds `#app`, re-attaches dot-tap listeners, restores `window.scrollY`.
- `renderBar()` — rebuilds `#bar` based on `timerTick` (running?) and whether all sets are done.

Timer state (`timerTick`, `timerSec`) is **module-level globals**, not in localStorage. The interval callback updates `#timer-text` and `#ring-fill` by ID — it does not call `renderBar()` on every tick, only on expiry. When `renderBar()` re-renders mid-timer, it reads `timerSec` and sets `stroke-dashoffset` directly so the SVG ring stays accurate.

## State (localStorage key: `wt_v1`)

```js
{
  week: 0,      // 0–7
  day: 0,       // 0–2  (Пн=0, Ср=1, Пт=2)
  workout: {    // null until first tap of the day
    week, day,
    sets: boolean[][]   // [exerciseIdx][setIdx]
  }
}
```

`workout` is initialized lazily in `render()` when `state.workout` is null or stale.

## Workout data (`data.js`)

`WORKOUTS[weekIdx][dayIdx]` → array of exercise objects:

```js
{ name, intensity, sets, reps, isDropset }
// intensity: 'тяжёлая' | 'средняя'
// sets: number of circles to render
// reps: display string e.g. '8–12' or '12-6-6'
// isDropset: drives the 'дропсет' tag
```

Card border color is driven by CSS classes: `.excard` = heavy (default, red border), `.excard.medium` = blue border, `.excard.all-done` = brass border + opacity 0.5.

## Design tokens

All defined as CSS custom properties in `style.css`:

| Variable | Meaning |
|---|---|
| `--heavy` | Iron-red — тяжёлая intensity |
| `--medium` | Steel-blue — средняя intensity |
| `--brass` | Knurled gold — completed dots, timer ring, done state |
| `--green` | Finish button |

Oswald 700 (Google Fonts) is used only for `.day-name` and `.fullscreen h1`. Everything else is `system-ui`.

## Deployment

GitHub Pages: push files to repo root on `main`, enable Pages in Settings. `.nojekyll` is present to skip Jekyll processing. No workflow file needed.

Telegram: set the GitHub Pages URL as the Mini App URL via `/setmenubutton` in @BotFather.
