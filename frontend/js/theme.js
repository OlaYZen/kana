/* js/theme.js — the theme and performance mode.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* ==========================================================================
   Theme

   Deliberately outside `store`, and so deliberately never synced to an
   account: which theme is right is a fact about the *device* — a phone in a
   dark room, a laptop under office lights — not a preference that should
   follow you onto the next one. It is the one setting where copying it
   across is wrong more often than right. Records and answer mode still sync;
   this doesn't.

   "auto" is resolved here rather than in CSS, so the stylesheet only ever
   sees data-theme="light" or "dark" and no rule in it has to test
   prefers-color-scheme. The same resolution is duplicated, deliberately, in
   an inline <script> in <head>: this file loads at the end of <body>, so
   without it every load flashes light before the theme lands. Change one and
   change the other.
   ========================================================================== */
const THEMES = ["auto", "light", "dark"];
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

// matches the two grounds in css/light.css and css/dark.css — the browser's own chrome (status
// bar, address bar) has to sit on the same paper the page does
const THEME_COLOR = { light: "#EFE9DC", dark: "#1B1916" };

function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEMES.includes(saved) ? saved : "auto";
  } catch (e) { return "auto"; }
}

function paintTheme() {
  const choice = readTheme();
  const dark = choice === "dark" || (choice === "auto" && prefersDark.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  if (el.themeColor) el.themeColor.setAttribute("content", THEME_COLOR[dark ? "dark" : "light"]);
  Array.from(el.themeSwitch.children).forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.theme === choice)));
}

function setTheme(choice) {
  if (!THEMES.includes(choice)) return;
  try { localStorage.setItem(THEME_KEY, choice); }
  catch (e) { /* private mode — the theme just won't outlive the tab */ }
  paintTheme();
}

// On "auto", the OS flipping at sunset has to reach the page while it is open
if (prefersDark.addEventListener) prefersDark.addEventListener("change", paintTheme);

/* ---------- sheets ---------- */
/* ---------- performance mode ---------- */
/* Two switches, one setting each, and the same reasoning behind both: the
   theme is a fact about the screen and this is a fact about the device, so
   neither has any business following an account between them. Both are read
   and written directly rather than through `store`, which is precisely what
   keeps them out of the blob that syncs.

   Unlike the theme it has no `auto`. The OS already has a way to ask for less
   motion and the stylesheet obeys it unconditionally; what this adds on top
   is the pause after a right answer, which is pacing rather than motion and
   is not something a system setting has any opinion about. Inferring it would
   mean quietly changing how fast someone's drill runs because of an
   accessibility preference they set for a different reason. */
function readPerf() {
  try { return localStorage.getItem(PERF_KEY) === "on"; }
  catch (e) { return false; }
}

function paintPerf() {
  document.documentElement.dataset.perf = state.perf ? "on" : "off";
  Array.from(el.perfSwitch.children).forEach((b) =>
    b.setAttribute("aria-checked", String((b.dataset.perf === "on") === state.perf)));
}

function setPerf(on) {
  state.perf = Boolean(on);
  try { localStorage.setItem(PERF_KEY, state.perf ? "on" : "off"); }
  catch (e) { /* private mode — it just won't persist */ }
  paintPerf();
}

function openFontPicker() {
  buildFontList();
  navTo(el.fontPicker);
  const checked = el.fontList.querySelector('[aria-checked="true"]') || el.fontList.firstElementChild;
  if (checked) checked.focus();
}
