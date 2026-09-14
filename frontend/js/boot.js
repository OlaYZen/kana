/* js/boot.js — boot: fetches kana.json and starts the app; loads last.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* ---------- boot ---------- */
store.migrate();
// <head> already put data-theme on the page before first paint; this catches
// the switch up with it, and owns it from here on.
paintTheme();
state.perf = readPerf();
paintPerf();
setAuthMode("login");

// Is there a backend at all? Everything account-shaped stays hidden until
// this answers, and the app is fully usable if it never does.
function probeBackend() {
  return fetch("api/health", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no backend"))))
    .then(() => {
      api.up = true;
      if (!api.token) { paintAccount(); return; }
      return api.call("GET", "/api/me")
        .then((me) => {
          api.user = me.username;
          return pullState().then(applyStoredPrefs);
        })
        .catch(() => signedOut())
        .then(paintAccount);
    })
    .catch(() => { api.up = false; paintAccount(); });
}

// no-cache (revalidate, don't blindly reuse) so edits to kana.json show up on
// a plain reload instead of being masked by the HTTP cache
fetch("kana.json", { cache: "no-cache" })
  .then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status + " " + r.statusText);
    return r.json();
  })
  .then((data) => {
    state.decks = data.decks;
    state.charts = data.charts || [];
    // Numbers are content like everything else, and the drills are listed in
    // the file beside the parts they are read out of. `numbers` mirrors
    // `flick` as the flag every branch tests, so the two read the same way.
    NUM = data.numbers || null;
    // `script` is what puts them under the 十 stamp, exactly as it puts a
    // derived deck under かな; `numbers` mirrors `flick` as the flag every
    // branch tests, so the two read the same way.
    NUMBER_DECKS = NUM && NUM.drills
      ? NUM.drills
          .map((d) => Object.assign({}, d, {
            numbers: d.kind, script: "number",
            // the kinds kana.json still carries; a sum drill left with none
            // is dropped below rather than offered as a run with no cards
            ops: d.kind === "math" ? (d.ops || []).filter(mathKind) : d.ops
          }))
          .filter((d) => d.numbers !== "math" || (d.ops.length > 0 && d.len > 0))
      : [];
    // The calendar: four more deck-shaped drills, under a stamp of their
    // own. A drill whose counter has gone from kana.json is dropped rather
    // than offered as a run that cannot generate a card — the same rule that
    // drops a derived deck with nothing left to derive from.
    CAL = data.calendar || null;
    CALENDAR_DECKS = CAL && CAL.drills
      ? CAL.drills
          .map((d) => Object.assign({}, d, {
            calendar: d.kind,
            script: "calendar",
            // a drill that names the values it asks carries no `len`: two
            // copies of the same count are one of them waiting to go stale
            len: d.values ? d.values.length : d.len
          }))
          .filter((d) => (d.calendar === "week"
            ? ((CAL.weekdays || []).length > 0)
            // the clock is built from two counters and a list of marks, and
            // is dropped unless kana.json still carries all three
            : d.calendar === "time"
            ? ((d.counters || []).length === 2 &&
               d.counters.every(calCounter) && (d.minutes || []).length > 0 &&
               // and 午前/午後 needs both halves, or there is no other one to offer
               (!d.meridiem || (CAL.meridiem || []).length >= 2))
            : Boolean(calCounter(d.calendar)) && d.len > 0))
      : [];
    buildFlickIndex();   // needs both decks and charts
    // built from decks, and deliberately after everything that walks them:
    // their cards are the decks' own, so anything counting characters must
    // not meet these as well
    state.derived = buildDerivedDecks(data.derived);
    probeBackend();      // runs alongside; the app never waits on it
    const fonts = resolveFonts(data.fonts);
    state.fonts = fonts.list;
    state.fontsMissing = fonts.missing;
    applyFont(store.read().font);
    setPrompt(state.prompt);   // before setMode: buildMenu() reads it
    setDates(state.dates);     // likewise — the calendar records depend on it
    setMode(state.mode);

    // A script with no decks in kana.json gets no button, and never gets
    // selected — otherwise the menu would open on an empty list. Derived
    // decks count: the かな stamp has nothing else under it.
    const hasDecks = (id) => allDecks().some((d) => d.script === id);
    Array.from(el.scriptSwitch.children).forEach((b) =>
      b.classList.toggle("hidden", !hasDecks(b.dataset.script)));
    setScript(hasDecks(state.script)
      ? state.script
      : (state.decks[0] && state.decks[0].script) || state.script);

    toMenu();
  })
  .catch((err) => {
    el.fatalMsg.textContent = String(err.message || err);
    show(el.fatal);
  });
