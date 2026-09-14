/* js/quick.js — quick access: pinned Settings rows on the menu and in the Q dialog.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* Quick access puts chosen Settings rows on the menu, and again in a dialog the
   Q key opens, so a setting you change often is one tap away instead of two
   screens. The rows in both places are not copies anyone maintains: each is
   cloned from its row on the Settings page, a tap on it clicks the original
   button — the one wiring.js listens to — and a MutationObserver copies
   aria-checked back whenever a setter repaints the original. One row, one
   listener and one painter per setting, so no copy can drift from its source.

   Which rows are pinned is kept on this device, like the theme: how much of the
   menu there is room for is a fact about the screen, and a phone and a laptop
   want different answers. Answer by is pinned until you say otherwise. */
const QUICK_DEFAULT = ["mode"];

// Every row on the Settings page that can be pinned, in page order.
const quickRows = () => Array.from(el.settings.querySelectorAll(".modebar[data-setting]"));
// Everywhere the pinned rows are shown.
const quickBoxes = () => [el.quick, el.quickDialogBody];

function readQuick() {
  const known = quickRows().map((r) => r.dataset.setting);
  try {
    const saved = JSON.parse(localStorage.getItem(QUICK_KEY));
    if (Array.isArray(saved)) return saved.filter((id) => known.includes(id));
  } catch (e) { /* unreadable, or private mode: the default stands */ }
  return QUICK_DEFAULT.filter((id) => known.includes(id));
}

function writeQuick(ids) {
  try { localStorage.setItem(QUICK_KEY, JSON.stringify(ids)); }
  catch (e) { /* private mode — the choice lasts as long as the tab */ }
}

// The pin toggles on the Settings page, one per pinnable row, each named by
// the row's own label so the two can never disagree. Switches rather than
// checkboxes, because each takes effect the moment it is flipped.
function buildQuickToggles() {
  el.quickToggles.innerHTML = "";
  const pinned = readQuick();
  quickRows().forEach((row) => {
    const id = row.dataset.setting;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "qtoggle";
    b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", String(pinned.includes(id)));
    b.dataset.quick = id;
    b.innerHTML = '<span class="qtoggle__label"></span>' +
      '<span class="qtoggle__track" aria-hidden="true"><span class="qtoggle__thumb"></span></span>';
    b.firstChild.textContent = row.querySelector(".modebar__label").textContent;
    b.addEventListener("click", () => {
      const on = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", String(on));
      // kept in page order, so both places list them the way Settings does
      const was = readQuick();
      writeQuick(quickRows().map((r) => r.dataset.setting)
        .filter((x) => (x === id ? on : was.includes(x))));
      buildQuick();
    });
    el.quickToggles.appendChild(b);
  });
}

function cloneRow(row) {
  const copy = row.cloneNode(true);
  copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  const originals = Array.from(row.querySelector(".seg").children);
  Array.from(copy.querySelector(".seg").children).forEach((b, i) =>
    b.addEventListener("click", () => originals[i].click()));
  return copy;
}

// The pinned rows themselves, in both places, rebuilt whenever the pins change.
function buildQuick() {
  const pinned = readQuick();
  const rows = quickRows().filter((r) => pinned.includes(r.dataset.setting));
  quickBoxes().forEach((box) => {
    box.innerHTML = "";
    rows.forEach((row) => box.appendChild(cloneRow(row)));
  });
  el.quick.classList.toggle("hidden", !rows.length);
  el.quickDialogEmpty.classList.toggle("hidden", rows.length > 0);
  // The mode is the one setting otherwise invisible from the menu, so the More
  // button names it — unless it is pinned and on show already.
  el.moreModeWrap.classList.toggle("hidden", pinned.includes("mode"));
}

// Copies each original's aria-checked onto its pinned copies. The setters only
// ever paint the originals, which is what keeps them the one source.
function mirrorQuick() {
  quickBoxes().forEach((box) => box.querySelectorAll(".modebar[data-setting]").forEach((copy) => {
    const row = el.settings.querySelector('.modebar[data-setting="' + copy.dataset.setting + '"]');
    if (!row) return;
    const src = Array.from(row.querySelector(".seg").children);
    Array.from(copy.querySelector(".seg").children).forEach((b, i) => {
      if (src[i]) b.setAttribute("aria-checked", src[i].getAttribute("aria-checked"));
    });
  }));
}

/* The Q dialog. It is the app's one modal, and deliberately a small one: a
   handful of switches never needs the height cap that sank the old sheets, and
   <dialog> gives it Escape, a focus trap and the top layer for nothing. Closing
   it any way — ✕, Escape, the backdrop — lands on the one `close` event, which
   puts focus back: into the answer field mid-card, since the on-screen keyboard
   follows focus, and otherwise wherever it was when Q was pressed. */
let quickReturn = null;

function openQuickDialog() {
  if (el.quickDialog.open) return;
  quickReturn = document.activeElement;
  el.quickDialog.showModal();
  const start = el.quickDialogBody.querySelector('.seg__btn[aria-checked="true"]') || el.quickDialogEdit;
  start.focus();
}

function afterQuickDialog() {
  const back = quickReturn;
  quickReturn = null;
  if (!el.play.classList.contains("hidden") && !choosingNow()) {
    focusField(typedField().input);
    return;
  }
  if (back && document.contains(back)) {
    try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); }
  }
}

// Called from boot once every setter has painted its switch, so the copies
// start from the state the originals are in.
function initQuick() {
  new MutationObserver(mirrorQuick).observe(el.settings,
    { subtree: true, attributes: true, attributeFilter: ["aria-checked"] });
  buildQuickToggles();
  buildQuick();

  el.quickDialogClose.addEventListener("click", () => el.quickDialog.close());
  // The panel fills the dialog, so a click whose target is the dialog itself
  // landed on the backdrop.
  el.quickDialog.addEventListener("click", (e) => {
    if (e.target === el.quickDialog) el.quickDialog.close();
  });
  el.quickDialog.addEventListener("close", afterQuickDialog);
  el.quickDialogEdit.addEventListener("click", () => {
    el.quickDialog.close();
    navTo(el.settings);
    if (el.quickToggles.scrollIntoView) el.quickToggles.scrollIntoView({ block: "nearest" });
  });
}
