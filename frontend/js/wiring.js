/* js/wiring.js — every event listener; loads after everything they point at.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* ---------- wiring ---------- */
// The square is the largest target on a phone: tap it to move on.
el.square.addEventListener("click", () => { if (state.graded) next(); });

el.submitBtn.addEventListener("click", submitTyped);
el.writeSubmitBtn.addEventListener("click", submitTyped);
el.numSubmitBtn.addEventListener("click", submitTyped);
el.revealBtn.addEventListener("click", reveal);
el.revealBtnTop.addEventListener("click", reveal);

// every control that can be tapped mid-card, so none of them close the keyboard
[el.square, el.submitBtn, el.writeSubmitBtn, el.numSubmitBtn,
 el.revealBtn, el.revealBtnTop].forEach(keepKeyboard);

[el.input, el.kanaInput, el.numInput].forEach((f) => {
  f.addEventListener("blur", noteBlur);
  f.addEventListener("focus", () => { state.kbDismissed = false; });
});

// Enter must not grade while an IME is composing — that keypress belongs to
// the IME, which is confirming the kana being built. Without the guard the
// first Enter of every "ka"→か submits a half-finished romaji string.
// keyCode 229 is the same event on browsers that predate isComposing.
const enterSubmits = (e) => {
  if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  submitTyped();
};
el.input.addEventListener("keydown", enterSubmits);
el.kanaInput.addEventListener("keydown", enterSubmits);
el.numInput.addEventListener("keydown", enterSubmits);

// More and Settings are screens, so everything they lead to is one step deeper
// and one step back — no sheet to close first, and nothing that can stack.
el.moreBtn.addEventListener("click", () => navTo(el.options));
el.optionsBackBtn.addEventListener("click", navBack);
el.settingsBtn.addEventListener("click", () => navTo(el.settings));
el.settingsBackBtn.addEventListener("click", navBack);

// Keyboard shortcuts, on the menu only: 1–5 pick a stamp, Q opens the quick
// options dialog. Never during a run — Q there once opened the dialog over the
// card whenever the answer field had lost focus, a tap elsewhere or the
// keyboard put away being enough — and 1–4 stay Choosing's. Never while typing
// into a field, never with a modifier held, and never on a panel, which the
// handler below has already returned for.
function shortcut(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return false;
  const onMenu = activeScreen() === el.menu;
  if ((e.key === "q" || e.key === "Q") && onMenu) {
    e.preventDefault();
    openQuickDialog();
    return true;
  }
  if (onMenu && /^[1-5]$/.test(e.key)) {
    const stamp = el.scriptSwitch.children[Number(e.key) - 1];
    if (stamp && !stamp.classList.contains("hidden")) stamp.click();
    return true;
  }
  return false;
}

el.playFontBtn.addEventListener("click", openFontPicker);
el.menuFontBtn.addEventListener("click", openFontPicker);
el.fontBackBtn.addEventListener("click", navBack);
el.chartBtn.addEventListener("click", openChart);
el.chartBackBtn.addEventListener("click", navBack);
Array.from(el.chartSwitch.children).forEach((b) =>
  b.addEventListener("click", () => {
    renderChart(b.dataset.chart);
    el.chartBody.scrollTop = 0;
  }));

document.addEventListener("keydown", (e) => {
  // An Escape during IME composition cancels the conversion; it is not a
  // request to leave the screen. Same guard as Enter in enterSubmits.
  if (e.isComposing || e.keyCode === 229) return;
  // The quick options dialog owns the keyboard while it is open; <dialog>
  // handles its own Escape.
  if (el.quickDialog.open) return;
  // Escape backs out of a panel, which is what <dialog> used to do for free —
  // one layer at a time. The change-password form inside Account closes first,
  // as its Cancel does, and only the next Escape leaves the screen.
  if (onPanel()) {
    if (e.key !== "Escape") return;       // the panel owns the keyboard
    if (activeScreen() === el.auth && !el.pwForm.classList.contains("hidden")) {
      el.pwCancel.click();
      el.pwToggle.focus();
      return;
    }
    navBack();
    return;
  }
  // The results screen's way out that isn't another run, as everywhere else.
  if (activeScreen() === el.end) {
    if (e.key === "Escape") toMenu();
    return;
  }
  if (shortcut(e)) return;
  if (el.play.classList.contains("hidden")) return;
  if (e.key === "Escape") { toMenu(); return; }
  if (state.mode !== "choose") return;

  if (!state.graded && /^[1-4]$/.test(e.key)) {
    const b = el.choices.children[Number(e.key) - 1];
    if (b && b.classList.contains("choice")) b.click();
  } else if (state.graded && e.key === "Enter") {
    const cont = el.chooseTools.querySelector(".btn");
    if (cont) cont.click();
  }
});

Array.from(el.modeSwitch.children).forEach((b) =>
  b.addEventListener("click", () => setMode(b.dataset.mode)));

Array.from(el.promptSwitch.children).forEach((b) =>
  b.addEventListener("click", () => setPrompt(b.dataset.prompt)));

Array.from(el.datesSwitch.children).forEach((b) =>
  b.addEventListener("click", () => setDates(b.dataset.dates)));

Array.from(el.clockSwitch.children).forEach((b) =>
  b.addEventListener("click", () => setClock(b.dataset.clock === "shown")));

Array.from(el.themeSwitch.children).forEach((b) =>
  b.addEventListener("click", () => setTheme(b.dataset.theme)));

Array.from(el.perfSwitch.children).forEach((b) =>
  b.addEventListener("click", () => setPerf(b.dataset.perf === "on")));

Array.from(el.scriptSwitch.children).forEach((b) =>
  b.addEventListener("click", () => setScript(b.dataset.script)));

el.menuBtn.addEventListener("click", toMenu);
el.endMenuBtn.addEventListener("click", toMenu);
el.restartBtn.addEventListener("click", () => start(state.deck));

/* account + progress */
el.accountBtn.addEventListener("click", () => {
  authError("");
  paintAccount();
  navTo(el.auth);
  if (!api.user) el.authUser.focus();
});
// Back where you came from, which is Options — the four screens behind it are
// one trail, not four ways of landing on the menu.
el.authBackBtn.addEventListener("click", navBack);
el.statsBackBtn.addEventListener("click", navBack);
el.authForm.addEventListener("submit", submitAuth);
el.authSwap.addEventListener("click", () =>
  setAuthMode(authMode === "login" ? "signup" : "login"));

el.logoutBtn.addEventListener("click", () => {
  api.call("POST", "/api/logout").catch(() => {}).then(() => {
    signedOut();
    setAuthMode("login");
    toMenu();
  });
});

el.pwToggle.addEventListener("click", openPasswordForm);
el.pwCancel.addEventListener("click", () => { closePasswordForm(); pwMessage(""); });
el.pwForm.addEventListener("submit", submitPassword);

el.deleteBtn.addEventListener("click", () => {
  if (!window.confirm(
    "Delete your account? Every run, record and setting stored on the server " +
    "is removed and cannot be recovered.")) return;
  api.call("DELETE", "/api/me").then(() => {
    signedOut();
    setAuthMode("login");
    toMenu();
  }).catch((err) => authError(err.message));
});

el.statsBtn.addEventListener("click", openStats);
Array.from(el.deviceSwitch.children).forEach((b) =>
  b.addEventListener("click", () => {
    statsDevice = b.dataset.device;
    statsDeck = null;          // the other device may not have run this deck
    loadStats();               // not openStats: keep the chosen script
  }));

Array.from(el.statsScriptSwitch.children).forEach((b) =>
  b.addEventListener("click", () => {
    setStatsScript(b.dataset.script);
    statsDeck = null;          // this script has a different set of decks
    // already have the payload — this is a filter, not a fetch
    if (lastReport) renderStats(lastReport);
    else loadStats();
  }));
