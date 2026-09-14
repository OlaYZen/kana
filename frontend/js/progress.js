/* js/progress.js — the progress report.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* ==========================================================================
   Progress report
   ========================================================================== */
let statsDevice = DEVICE;
let statsDeck = null;      // which deck's report is on screen
let statsScript = null;    // re-synced from the menu on every openStats()

const fmtMs = (ms) => (ms == null ? "—" : (ms / 1000).toFixed(1) + "s");

// A run's exact length, milliseconds and all. fmtTime rounds to the second,
// which is right on the results screen but hides the difference between two
// runs of the same deck when you are chasing your own time.
function fmtExact(ms) {
  const total = Math.max(0, Math.round(ms));
  const mins = Math.floor(total / 60000);
  const secs = Math.floor(total % 60000 / 1000);
  return mins + ":" + (secs < 10 ? "0" : "") + secs +
         "." + String(total % 1000).padStart(3, "0");
}

// When a run was finished. The server stamps runs in UTC; `Date` renders that
// in the device's own zone, which is the only one the person reading it was
// ever in. Formatted here rather than with toLocaleString so the shape is the
// same on every device — a run list that reads 05.07.26 on the phone and
// 7/5/26 on the laptop is the same history looking like two.
function fmtWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + " " +
         p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + p(d.getFullYear() % 100);
}

function deckLabel(id) {
  const deck = allDecks().concat(FLICK_DECKS).find((d) => d.id === id);
  return deck ? deck.label : id;
}

function statRow(parent, cells, cls) {
  const row = add(parent, "div", "srow" + (cls ? " " + cls : ""));
  cells.forEach((c) => {
    const n = add(row, "span", c.cls || null, c.sub == null ? c.text : null);
    // A cell can carry a second line. Both halves need display:block of their
    // own or the two run together — the same trap as .deck__name/.deck__meta.
    if (c.sub != null) {
      add(n, "span", "srow__t", c.text);
      add(n, "span", "srow__sub", c.sub);
    }
    if (c.lang) n.lang = c.lang;
  });
  return row;
}

function statBlock(title, note) {
  const b = add(el.statsBody, "section", "sblock");
  add(b, "h3", null, title);
  if (note) add(b, "p", "sblock__note", note);
  return b;
}

// Your own runs, listed from the first one. What you scored is a fact; the
// analysis below the gate is an inference, which is the part that needs
// several runs before it means anything. Drills never appear here — the
// server leaves them out of recent_runs entirely.
function renderRuns(report) {
  const runs = report.recent_runs;
  if (!runs || !runs.length) return;
  const b = statBlock("Runs", runs.length >= 25 ? "Most recent 25." : null);
  // One per mode, and only a flawless run — the server picks them from all of
  // history, so a record older than this list tags nothing rather than
  // crowning the quickest of what happens to be shown.
  const fastest = new Set(report.fastest_run_ids || []);
  runs.forEach((r) => {
    const pct = r.total ? Math.round(r.correct / r.total * 100) : 0;
    // The deck is already the heading here, so the row names the mode instead,
    // with when it was finished under it — five columns of figures don't fit
    // across a small phone, and the two belong together anyway: they are what
    // the run *was*, as against how it went.
    const when = fmtWhen(r.created_at);
    const row = statRow(b, [
      { text: modeLabel(r.mode), cls: "srow__r srow__r--wide",
        sub: when || null },
      { text: r.correct + "/" + r.total, cls: "srow__s" },
      { text: fmtExact(r.duration_ms), cls: "srow__s srow__s--time" },
      { text: pct + "%", cls: "srow__v" + (pct < 70 ? " srow__v--bad" : "") }
    ]);
    if (fastest.has(r.id)) {
      const tag = add(row.querySelector(".srow__t") || row.firstChild, "span", "srow__tag", "Fastest");
      tag.title = "Fastest clean run in this mode";
    }
  });
}

// Same rule as the menu, so a deck is found in the report under the stamp it
// was started from. The flick drills are the exception and stay under every
// stamp: they aren't decks at all, so `allDecks()` never finds them, and a
// direction or a key belongs to neither script.
function forScript(decks) {
  return decks.filter((r) => {
    const deck = allDecks().find((d) => d.id === r.deck_id);
    return !deck || deck.script === statsScript;
  });
}

// Each deck is its own dataset — katakana is not evidence about hiragana, and
// the base gojūon is not evidence about dakuten. The picker chooses which one
// is on screen; nothing is ever summed across them.
// Returns whether it actually rendered, which decides if the deck still needs
// naming below.
function renderDeckPicker(decks) {
  el.deckPick.innerHTML = "";
  // A picker with one option is not a choice.
  if (decks.length < 2) return false;
  decks.forEach((r) => {
    const b = add(el.deckPick, "button", "deckpick__btn");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(r.deck_id === statsDeck));
    add(b, "span", "deckpick__name", deckLabel(r.deck_id));
    add(b, "span", "deckpick__n", r.runs + (r.runs === 1 ? " run" : " runs"));
    b.addEventListener("click", () => {
      statsDeck = r.deck_id;
      renderStats(lastReport);
    });
  });
  return true;
}

// Only ever writes the progress screen's own state. The menu's `state.script`
// is deliberately untouched — see openStats() for why the sync is one way.
function setStatsScript(id) {
  statsScript = id;
  el.stats.dataset.script = id;      // flips the accent, as on the menu
  Array.from(el.statsScriptSwitch.children).forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.script === id)));
}

let lastReport = null;

function renderStats(payload) {
  lastReport = payload;
  el.statsBody.innerHTML = "";
  el.deckPick.innerHTML = "";
  const label = statsDevice === "mobile" ? "phone" : "desktop";
  const all = (payload && payload.decks) || [];
  const decks = forScript(all);

  if (!decks.length) {
    const b = statBlock("Nothing here yet");
    add(b, "p", "sblock__note", all.length
      ? "No finished " + statsScript + " runs on " + label + " yet — though " +
        "there are runs under the other stamp."
      : "No finished runs on " + label + " yet.");
    add(b, "p", "sblock__note",
      "Phone and desktop are kept apart — typing on a keyboard and flicking " +
      "on glass aren't comparable — so each has its own figures.");
    return;
  }

  if (!statsDeck || !decks.some((d) => d.deck_id === statsDeck)) {
    statsDeck = decks[0].deck_id;
  }
  const picker = renderDeckPicker(decks);

  const report = decks.find((d) => d.deck_id === statsDeck);
  // The deck is named once, wherever that lands. The selected chip names it
  // when there is a picker, and the seal stamp already says Hiragana or
  // Katakana — so a heading is only worth the space when neither did, which
  // is a lone non-base deck: the picker is gone and "Hiragana" would be the
  // wrong name for Dakuten hiragana or a flick drill.
  const deckName = deckLabel(report.deck_id);
  if (!picker && deckName.toLowerCase() !== statsScript) {
    add(el.statsBody, "h2", "sdeck", deckName);
  }

  if (!report.analysable) {
    const b = statBlock("Not analysed");
    add(b, "p", "sblock__note",
      "A flick drill asks for a direction or a key, and any character with " +
      "that vowel or on that key counts — so there is no character to call " +
      "slow, and a wrong answer can't be traced to one. The runs are below.");
    renderRuns(report);
    return;
  }

  if (!report.ready) {
    const b = statBlock(report.runs ? "Not enough to analyse yet" : "Nothing here yet");
    add(b, "p", "sblock__note",
      report.runs === 0
        ? "No finished runs of this deck on " + label + " yet."
        : report.runs + " of " + report.min_runs + " runs of this deck on " + label +
          ". " + report.runs_needed + " more before the breakdown appears.");
    add(b, "p", "sblock__note",
      "One run can't tell a bad day from a weak character, so which " +
      "characters are slow or shaky isn't worked out until there are enough " +
      "of them — and runs of another deck don't count towards this one. " +
      "Your runs themselves are below either way.");
    renderRuns(report);
    return;
  }

  const o = report.overall;
  const head = statBlock("Overall", "On " + label + ".");
  const grid = add(head, "div", "sgrid");
  [["Accuracy", o.accuracy + "%"], ["Typical time", fmtMs(o.median_ms)],
   ["Characters seen", String(report.cards_tracked)], ["Runs", String(report.runs)]]
    .forEach(([k, v]) => {
      const cell = add(grid, "div", "sgrid__cell");
      add(cell, "div", "sgrid__n", v);
      add(cell, "div", "sgrid__l", k);
    });
  if (report.excluded_slow) {
    add(head, "p", "sblock__note",
      report.excluded_slow + " answer" + (report.excluded_slow === 1 ? "" : "s") +
      " took over " + Math.round(report.max_card_ms / 1000) +
      "s and were left out of the times — that's someone looking away, not " +
      "someone thinking.");
  }

  // These three read the last few runs rather than all of history, so each
  // says so — an unqualified "Slowest to recall" is a claim about everything
  // you have ever done, and that is no longer the figure being shown.
  const lately = "Your last " + report.recent_window + " run" +
                 (report.recent_window === 1 ? "" : "s") + ".";

  if (report.slowest.length) {
    const b = statBlock("Slowest to recall", "Where the hesitation is. " + lately);
    report.slowest.forEach((c) => statRow(b, [
      { text: c.q, cls: "srow__k", lang: "ja" },
      { text: c.a, cls: "srow__r" },
      { text: fmtMs(c.median_ms), cls: "srow__v" },
      { text: c.accuracy + "%", cls: "srow__s" }
    ]));
  }

  if (report.fastest.length) {
    const b = statBlock("Fastest to recall", "These ones are automatic. " + lately);
    report.fastest.forEach((c) => statRow(b, [
      { text: c.q, cls: "srow__k", lang: "ja" },
      { text: c.a, cls: "srow__r" },
      { text: fmtMs(c.median_ms), cls: "srow__v srow__v--good" },
      { text: c.accuracy + "%", cls: "srow__s" }
    ]));
  }

  if (report.weakest.length) {
    const b = statBlock("Least accurate", "Worth drilling. Across every run.");
    report.weakest.forEach((c) => statRow(b, [
      { text: c.q, cls: "srow__k", lang: "ja" },
      { text: c.a, cls: "srow__r" },
      { text: c.accuracy + "%", cls: "srow__v srow__v--bad" },
      { text: c.attempts + "×", cls: "srow__s" }
    ]));
  }

  if (report.confusions.length) {
    const b = statBlock("Mixed up with", "What you reach for instead. " + lately);
    report.confusions.forEach((c) => statRow(b, [
      { text: c.q, cls: "srow__k", lang: "ja" },
      { text: "→ " + (c.mistaken_for || "?"), cls: "srow__k srow__k--bad", lang: "ja" },
      { text: c.a, cls: "srow__r" },
      { text: c.count + "×", cls: "srow__s" }
    ]));
  }

  if (report.by_mode.length > 1) {
    const b = statBlock("By answer mode", "Same deck, different skill.");
    report.by_mode.forEach((m) => statRow(b, [
      { text: modeLabel(m.mode), cls: "srow__r srow__r--wide" },
      { text: fmtMs(m.median_ms), cls: "srow__v" },
      { text: m.accuracy + "%", cls: "srow__s" }
    ]));
  }

  renderRuns(report);
}

// Fetch and draw, keeping whatever is currently selected. Used by the device
// switch, which must not disturb the chosen script.
/* The report has a shape before it has any numbers — a row of deck chips and
   two blocks of rows — so what stands in for it is that shape, not a word.
   A spinner says "something is happening"; this says what is coming.

   Two timings around it, and both exist because the server is usually on the
   same LAN and answers in about ten milliseconds:

   - nothing at all for the first quarter-second, so a fast load goes straight
     from the menu to the report. A placeholder that appears and vanishes
     inside one frame reads as a glitch, not as loading.
   - once it *is* up it stays a moment, so a reply landing at 260ms doesn't
     replace it before it has been seen. */
const SKEL_WAIT = 250;   // ms before a placeholder is worth showing at all
const SKEL_HOLD = 300;   // …and the least time it stays once it is up
let skelTimer = 0, skelShown = 0;

function statsSkeleton() {
  el.statsBody.innerHTML = "";
  const chips = add(el.statsBody, "div", "skel__chips");
  [72, 96, 64].forEach((w) => {
    add(chips, "span", "skel__chip").style.width = w + "px";
  });
  [3, 4].forEach((rows) => {
    const block = add(el.statsBody, "section", "sblock");
    add(block, "span", "skel__line skel__line--title");
    for (let i = 0; i < rows; i++) add(block, "span", "skel__line");
  });
  el.statsBody.setAttribute("aria-busy", "true");
}

function loadStats() {
  // Only a *move* to the report starts a trail. The device switch re-fetches
  // from here while already on it, and that must not forget where Back goes.
  if (activeScreen() !== el.stats) navTo(el.stats);
  el.statsBody.innerHTML = "";
  el.deckPick.innerHTML = "";
  clearTimeout(skelTimer);
  skelShown = 0;
  skelTimer = setTimeout(() => {
    skelShown = Date.now();
    statsSkeleton();
  }, SKEL_WAIT);

  // whatever answers, paint it — but never before the placeholder has had its
  // moment, and never leave the timer armed to overwrite what was painted
  const settle = (paint) => {
    clearTimeout(skelTimer);
    const seen = skelShown ? Date.now() - skelShown : SKEL_HOLD;
    const wait = Math.max(0, SKEL_HOLD - seen);
    const done = () => { el.statsBody.removeAttribute("aria-busy"); paint(); };
    if (wait) setTimeout(done, wait); else done();
  };

  Array.from(el.deviceSwitch.children).forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.device === statsDevice)));
  api.call("GET", "/api/analytics?device=" + statsDevice)
    .then((data) => settle(() => renderStats(data[statsDevice] || { decks: [] })))
    .catch((err) => settle(() => {
      el.statsBody.innerHTML = "";
      add(el.statsBody, "p", "sblock__note", "Couldn’t load: " + err.message);
    }));
}

// Entering from the menu. The script follows the menu **every time**, not just
// the first: practising katakana and then opening progress on hiragana is
// never what was meant.
//
// The sync is one-way on purpose. Flipping the stamp in here is a question
// about your history — "how am I doing on the other script" — not a decision
// to go and practise it, so it must not reach back and retarget the menu you
// are about to return to. That is why setStatsScript() never writes
// `state.script`, and why this is the only place the two are connected.
function openStats() {
  setStatsScript(state.script);
  statsDeck = null;          // the other script has a different set of decks
  loadStats();
}
