/* js/screens.js — moving between screens, and the font picker.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* ---------- screens ----------
   Every view is a screen; nothing is a modal. Options, the font picker and
   the chart were <dialog> sheets until a sheet's height cap turned out to be
   the thing deciding whether Sign out was reachable — see CLAUDE.md. As
   screens they scroll like the rest, and on a wide window they are the pane
   beside the deck rail rather than a panel floating over it.

   `data-screen` on <body> is how the stylesheet knows which one is up, which
   is what lets the wide layout keep the menu on screen beside it. */
const SCREENS = [el.menu, el.play, el.end, el.fatal, el.auth, el.stats,
                 el.options, el.settings, el.fontPicker, el.chart];

function paint(screen) {
  SCREENS.forEach((s) => s.classList.toggle("hidden", s !== screen));
  document.body.dataset.screen = screen.id;
  // On a wide window the pane is empty while nothing is running, and the
  // chart is what belongs there: the reference table beside the deck list.
  // The stylesheet decides whether it is visible; this only keeps it built.
  if (screen === el.menu && state.charts.length) renderChart(state.script);
}

// A plain move — the way you got here stops mattering, so the trail is cut.
const show = (screen) => { trail.length = 0; paint(screen); };

/* Going somewhere you can come back from. The trail replaces what <dialog>
   gave for free, and it has to remember two things per step: the screen, and
   what had focus — Escape out of the font picker has to put the caret back in
   the answer box, or on a phone the keyboard stays down for the rest of the
   card. That was the bug the sheets' `close` handler existed for. */
const trail = [];

function navTo(screen) {
  trail.push({ screen: activeScreen(), focus: document.activeElement });
  paint(screen);
}

function navBack() {
  const from = trail.pop();
  paint(from ? from.screen : el.menu);
  // Mid-card the answer field wins over whatever opened the panel: the
  // on-screen keyboard follows focus, and the point is to get it back up.
  if (!el.play.classList.contains("hidden") && !choosingNow()) {
    focusField(typedField().input);
    return;
  }
  if (from && from.focus && document.contains(from.focus)) {
    try { from.focus.focus({ preventScroll: true }); }
    catch (e) { from.focus.focus(); }
  }
}

const activeScreen = () =>
  SCREENS.find((s) => !s.classList.contains("hidden")) || el.menu;

// Every screen that is reached from somewhere and returned from: Escape leaves
// them, and while one is up it owns the keyboard. Account and progress were
// missing — they have always been navTo() screens with a Back button, and
// Escape simply did nothing on them.
const PANELS = [el.options, el.settings, el.fontPicker, el.chart, el.auth, el.stats];
const onPanel = () => PANELS.indexOf(activeScreen()) >= 0;

// Which pool this run's timings belong to. Typing romaji on a keyboard and
// flicking on glass are different physical acts, so the server never pools
// them; see backend/app/analytics.py.
const DEVICE = TOUCH ? "mobile" : "desktop";

const card = () => state.queue[state.i];

/* ---------- font picker ---------- */
function applyFont(id) {
  const font = state.fonts.find((f) => f.id === id) || state.fonts[0];
  if (!font) return;
  state.font = font;
  document.documentElement.style.setProperty("--kana", font.stack);
  el.menuFontName.textContent = font.label;
  store.write({ font: font.id });
  Array.from(el.fontList.children).forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.font === font.id)));
}

// The sample is the card being asked when there is one — seeing *this*
// character in another face is the whole point.
function fontSampleText() {
  // a flick prompt is a Latin letter, which shows nothing about a kana face
  return el.play.classList.contains("hidden") || !state.queue.length || state.flick
    ? "あ"
    : card().q;
}

function buildFontList() {
  const sample = fontSampleText();
  el.fontList.innerHTML = "";
  state.fonts.forEach((font) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "font";
    b.dataset.font = font.id;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(state.font && font.id === state.font.id));

    const sp = document.createElement("span");
    sp.className = "font__sample";
    sp.lang = "ja";
    sp.textContent = sample;
    sp.style.fontFamily = font.stack;

    const mid = document.createElement("span");
    mid.innerHTML =
      '<span class="font__name">' + font.label +
      (font.ja ? ' <span class="ja" lang="ja">' + font.ja + "</span>" : "") + "</span>" +
      (font.note ? '<span class="font__note">' + font.note + "</span>" : "");

    const tick = document.createElement("span");
    tick.className = "font__tick";
    tick.textContent = "✓";
    tick.setAttribute("aria-hidden", "true");

    b.append(sp, mid, tick);
    b.addEventListener("click", () => applyFont(font.id));
    el.fontList.appendChild(b);
  });

  // The bundled styles are always here, so this is only ever about the extras
  // that come from the device — which is why it no longer says that fonts in
  // general have to be installed. Saying that with five faces shipping in the
  // page would be untrue and would read as an apology for the whole picker.
  el.fontNote.textContent = state.fontsMissing.length
    ? state.fontsMissing.length + " further " +
      (state.fontsMissing.length === 1 ? "style needs a font" : "styles need fonts") +
      " this device doesn’t have, so " +
      (state.fontsMissing.length === 1 ? "it isn’t" : "they aren’t") + " shown: " +
      state.fontsMissing.join(", ") + "."
    : "";
}
