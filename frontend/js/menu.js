/* js/menu.js — the deck menu and the settings behind it.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

/* ---------- menu ---------- */
function buildMenu() {
  el.decks.innerHTML = "";
  // Derived decks and the number drills carry a script like any other, so
  // this stays one comparison. They come out after the real decks because
  // `allDecks()` appends them, which is also the order they want: under あ or
  // ア the mix sits below the three decks it is built from, under かな the
  // whole stamp is derived, and under 十 there is nothing else.
  allDecks().filter((d) => d.script === state.script)
    .forEach((deck) => el.decks.appendChild(deckRow(deck)));

  // Flick drills aren't decks and aren't script-specific, so they sit in
  // their own section below the list rather than being filtered with it.
  // They are offered on touch devices only: flicking is a phone keyboard
  // gesture, and there is nothing to practise with a physical keyboard.
  // Both are derived from the chart grids, so without charts there is nothing
  // to drill and the section is dropped entirely.
  const ready = TOUCH && flickIndex.key.size > 0;
  el.flickTitle.classList.toggle("hidden", !ready);
  el.flickDecks.classList.toggle("hidden", !ready);
  el.flickDecks.innerHTML = "";
  if (ready) FLICK_DECKS.forEach((deck) => el.flickDecks.appendChild(deckRow(deck)));
}

function deckRow(deck) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "deck" + (deck.sample.length > 1 ? " deck--combo" : "");

  // A flick run is its own skill and always scores as "flick", whatever the
  // answer mode is set to; a deck's figures are the selected mode's, which is
  // why switching mode rebuilds the list.
  const mode = deck.flick ? "flick" : recordMode(deck, state.mode, state.prompt);
  const size = deckSize(deck);
  // A generated run deals prompts; only a deck has cards to count.
  const unit = deck.flick || deck.numbers || deck.calendar ? " prompts" : " cards";
  const best = store.best(deck.id, mode);
  const bestMs = store.bestTime(deck.id, mode);

  b.setAttribute("aria-label", deck.label + " — " + size + unit +
    ", " + modeLabel(mode).toLowerCase() +
    (best ? ", best " + best + "%" : ", no attempts yet") +
    (bestMs ? ", fastest clean run " + fmtRun(bestMs) : ""));

  b.innerHTML =
    '<span class="deck__sample" lang="ja">' + deckText(deck, deck.sample) + "</span>" +
    '<span><span class="deck__name">' + deck.label + "</span>" +
    '<span class="deck__meta">' + deckText(deck, deck.subtitle) + " · " + size + unit + "</span></span>" +
    '<span class="deck__best" title="Your best in ' + modeLabel(mode) + '">' +
      '<span class="deck__pct">' + (best ? best + "%" : "—") + "</span>" +
      (bestMs ? '<span class="deck__time" title="Fastest run with no mistakes">' +
                fmtRun(bestMs) + "</span>" : "") +
      // the mode names the figure: each mode keeps its own records, and an
      // unlabelled percentage would silently look like the deck's only score
      "<small>" + modeLabel(mode) + "</small>" +
    "</span>";

  b.addEventListener("click", () => start(deck));
  return b;
}

function toMenu() {
  clearTimeout(state.timer);
  stopClock(false);          // abandoned run — drop the clock, don't record it
  state.graded = false;
  state.flick = null;        // back to the selected answer mode
  state.numbers = null;
  state.calendar = null;
  buildMenu();
  show(el.menu);
}

function setMode(mode) {
  state.mode = mode;
  Array.from(el.modeSwitch.children).forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
  store.write({ mode: mode });
  // unless Answer by is pinned to quick access the mode is invisible from the
  // menu, so the Settings button carries it; quick.js hides it when pinned
  el.moreMode.textContent = MODE_LABEL[mode] || mode;
  // the deck list shows this mode's records, so it has to be rebuilt too
  if (el.play.classList.contains("hidden")) buildMenu();
  else render();
}

// Which script the generated drills ask in. Like setMode(), this has to
// rebuild the deck list rather than only re-render: each form keeps its own
// records, so every figure under 十 and 日時 changes with it. Mid-run it
// re-renders instead, which flips every remaining prompt — the same
// behaviour, and for the same reason, as changing the answer mode does.
function setPrompt(prompt) {
  state.prompt = prompt;
  Array.from(el.promptSwitch.children).forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.prompt === prompt)));
  store.write({ prompt: prompt });
  if (el.play.classList.contains("hidden")) buildMenu();
  else render();
}

// How months, dates and times are written. Rebuilds the menu for
// setPrompt()'s reason — under 9月 Typing and Choosing ask for the reading
// and keep their own records — and mid-run re-renders the card instead.
function setDates(form) {
  state.dates = form;
  Array.from(el.datesSwitch.children).forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.dates === form)));
  store.write({ dates: form });
  // the calendar table shows the same form, and on a wide window it is on
  // screen beside the menu
  if (el.chart.dataset.script) renderChart(el.chart.dataset.script);
  if (el.play.classList.contains("hidden")) buildMenu();
  else render();
}

// Whether the chart is worth offering under the stamp on screen. Every stamp
// but かな wants its own table and nothing else will do: falling back under 十
// or 日時 would hand over a kana table in answer to a question about counting
// or about dates. かな is the one place a fallback is right — there is no
// combined table and both scripts' are relevant. "Are there charts at all" is
// the same question and lives here too, so the two can never disagree.
const chartApplies = () =>
  state.charts.length > 0 &&
  (state.script === "kana" || state.charts.some((c) => c.id === state.script));

// Which script's decks the menu is showing. The accent flips with it — the
// vermilion/indigo pairing the chart sheet uses, purple for かな, and 納戸 for
// the counting drills.
function setScript(id) {
  state.script = id;
  el.menu.dataset.script = id;
  Array.from(el.scriptSwitch.children).forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.script === id)));
  store.write({ script: id });
  el.chartBtn.classList.toggle("hidden", !chartApplies());
  buildMenu();
  el.menuScroll.scrollTop = 0;
  // On a wide window the chart is the pane while the menu is the rail, so a
  // stamp has to move both — the deck list and the table beside it.
  if (activeScreen() === el.menu && state.charts.length) {
    renderChart(id);
    el.chartBody.scrollTop = 0;
  }
}
