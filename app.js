/* ==========================================================================
   Kana Practice — pure client-side, no build step, no backend.
   Decks and answers live in kana.json; this file is only game logic.
   ========================================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const el = {
    menu: $("menu"), play: $("play"), end: $("end"), fatal: $("fatal"),
    decks: $("decks"),
    playMark: $("playMark"), playLabel: $("playLabel"),
    square: $("square"), glyph: $("glyph"), feedback: $("feedback"),
    typeMode: $("typeMode"), chooseMode: $("chooseMode"),
    input: $("input"), submitBtn: $("submitBtn"), revealBtn: $("revealBtn"),
    choices: $("choices"), chooseTools: $("chooseTools"), chooseHint: $("chooseHint"),
    barFill: $("barFill"), mProgress: $("mProgress"), mStreak: $("mStreak"), mAcc: $("mAcc"),
    menuBtn: $("menuBtn"), restartBtn: $("restartBtn"),
    fontSheet: $("fontSheet"), fontList: $("fontList"), fontNote: $("fontNote"),
    fontCloseBtn: $("fontCloseBtn"), playFontBtn: $("playFontBtn"),
    menuFontBtn: $("menuFontBtn"), menuFontName: $("menuFontName"),
    chartSheet: $("chartSheet"), chartBody: $("chartBody"),
    chartSwitch: document.querySelector(".chart__switch"),
    chartBtn: $("chartBtn"), chartCloseBtn: $("chartCloseBtn"),
    endMark: $("endMark"), endLabel: $("endLabel"),
    endScore: $("endScore"), endSub: $("endSub"), endBest: $("endBest"),
    endBestChip: $("endBestChip"),
    missedBlock: $("missedBlock"), missedGrid: $("missedGrid"),
    drillBtn: $("drillBtn"), againBtn: $("againBtn"), endMenuBtn: $("endMenuBtn"),
    fatalMsg: $("fatalMsg")
  };

  const STORE = "hkk.v1";
  const REVEAL_DELAY = 620;   // ms the 〇 stamp stays before advancing

  // Phones and tablets: typing romaji on a virtual keyboard is slow and the
  // keyboard eats half the screen, so first-time visitors start in Choosing.
  const TOUCH = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  /* ---------- persisted preferences + best scores ---------- */
  const store = {
    read() {
      try { return JSON.parse(localStorage.getItem(STORE)) || {}; }
      catch (e) { return {}; }
    },
    write(patch) {
      try { localStorage.setItem(STORE, JSON.stringify(Object.assign(store.read(), patch))); }
      catch (e) { /* private mode — preferences just don't persist */ }
    },
    best(deckId) { return (store.read().best || {})[deckId] || 0; },
    setBest(deckId, pct) {
      const best = store.read().best || {};
      if (pct > (best[deckId] || 0)) { best[deckId] = pct; store.write({ best: best }); return true; }
      return false;
    },

    // Best time is only recorded for a run with no mistakes. Timing every run
    // would let a rushed or revealed-answer run set a record that can never be
    // beaten honestly, which makes the number worthless.
    bestTime(deckId) { return (store.read().bestTime || {})[deckId] || 0; },
    setBestTime(deckId, ms) {
      const times = store.read().bestTime || {};
      const prev = times[deckId] || 0;
      if (!prev || ms < prev) { times[deckId] = ms; store.write({ bestTime: times }); return true; }
      return false;
    }
  };

  /* ==========================================================================
     Fonts

     There is no backend and no web fonts, so the only usable faces are the ones
     already installed. Neither of the obvious availability tests works for kana:
     document.fonts.check() answers true for names that don't exist, and every
     CJK face is full-width so canvas text widths are identical across all of
     them. So each candidate is rendered to a canvas and its pixels hashed —
     which also settles the question that actually matters, "does this option
     look any different?". Anything that renders like the last-resort font, or
     like an option already on the list, is dropped instead of being offered as
     a choice that does nothing.
     ========================================================================== */
  const GENERIC = /^(serif|sans-serif|monospace|system-ui|cursive|fantasy)$/;
  const quoted = (f) => (GENERIC.test(f) ? f : '"' + f + '"');

  const inkHash = (function () {
    let ctx = null;
    try {
      const cv = document.createElement("canvas");
      cv.width = 420; cv.height = 80;
      ctx = cv.getContext("2d", { willReadFrequently: true });
    } catch (e) { return null; }
    if (!ctx) return null;
    return function (stack) {
      try {
        ctx.clearRect(0, 0, 420, 80);
        ctx.fillStyle = "#000";
        ctx.textBaseline = "top";
        ctx.font = '56px ' + stack;
        ctx.fillText("あきカヂョ", 0, 6);
        const d = ctx.getImageData(0, 0, 420, 80).data;
        let h = 5381, ink = 0;
        for (let i = 3; i < d.length; i += 4) {
          if (d[i] > 8) { ink++; h = ((h * 33) ^ (i * 31 + d[i])) >>> 0; }
        }
        return h + ":" + ink;
      } catch (e) { return null; }   // canvas blocked (privacy mode)
    };
  })();

  function resolveFonts(defs) {
    const all = (defs || []).map((d) => ({
      id: d.id,
      label: d.label,
      ja: d.ja || "",
      note: d.note || "",
      stack: (d.families || []).map(quoted).concat(d.generic || "serif").join(", ")
    }));

    const probe = inkHash && inkHash('"__kana_probe_missing__", monospace') ? inkHash : null;
    if (!probe) return { list: all, missing: [] };   // can't verify — offer everything

    const lastResort = probe('"__kana_probe_missing__", monospace');
    const seen = new Set();
    const list = [], missing = [];

    (defs || []).forEach((def, idx) => {
      const named = (def.families || []).filter(
        (f) => probe(quoted(f) + ", monospace") !== lastResort
      );
      // A style with families listed but none installed would silently render as
      // its generic twin, so it is not offered at all.
      if ((def.families || []).length && !named.length) { missing.push(def.label); return; }

      const stack = named.map(quoted).concat(def.generic || "serif").join(", ");
      const h = probe(stack);
      if (h && seen.has(h)) { missing.push(def.label); return; }
      if (h) seen.add(h);
      list.push({ id: def.id, label: def.label, ja: def.ja || "",
                  note: def.note || "", stack: stack });
    });

    return list.length ? { list: list, missing: missing } : { list: all, missing: [] };
  }

  /* ---------- state ---------- */
  const state = {
    decks: [],
    charts: [],        // reference-table layout from kana.json
    fonts: [],         // resolved, verified-distinct font options
    fontsMissing: [],  // styles this device can't show
    font: null,        // active option
    deck: null,        // active deck definition
    queue: [],         // shuffled cards for this run
    i: 0,
    mode: ["type", "choose"].includes(store.read().mode)
      ? store.read().mode
      : (TOUCH ? "choose" : "type"),
    answered: 0, correct: 0, streak: 0, bestStreak: 0,
    missed: [],        // unique wrong cards, chart order
    graded: false,     // answer already scored — waiting to advance
    isDrill: false,
    timer: 0,          // pending auto-advance, cleared whenever the card changes
    startedAt: 0,      // performance.now() when the run began
    finishedMs: 0      // frozen elapsed time once the deck is done
  };

  /* ---------- helpers ---------- */
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let j = a.length - 1; j > 0; j--) {
      const t = Math.floor(Math.random() * (j + 1));
      [a[j], a[t]] = [a[t], a[j]];
    }
    return a;
  };

  const norm = (s) => s.toLowerCase().trim().replace(/[\s'’\-]/g, "");

  const accepts = (card, value) =>
    [card.a].concat(card.alt || []).some((v) => norm(v) === value);

  /* ---------- clock ---------- */
  // The run is timed, but deliberately never shown while practising — a ticking
  // counter turns practice into a race. The total appears once, on the results
  // screen, where it's information rather than pressure.
  const elapsed = () =>
    state.finishedMs || (state.startedAt ? performance.now() - state.startedAt : 0);

  function fmtTime(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60), s = total % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function startClock() {
    state.startedAt = performance.now();
    state.finishedMs = 0;
  }

  function stopClock(keep) {
    state.finishedMs = keep ? performance.now() - state.startedAt : 0;
  }

  const show = (screen) => {
    [el.menu, el.play, el.end, el.fatal].forEach((s) => s.classList.add("hidden"));
    screen.classList.remove("hidden");
  };

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
    return el.play.classList.contains("hidden") || !state.queue.length
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

    el.fontNote.textContent = state.fontsMissing.length
      ? "Only fonts installed on this device can be used, so " +
        state.fontsMissing.length + " more " +
        (state.fontsMissing.length === 1 ? "style" : "styles") + " can’t be shown here: " +
        state.fontsMissing.join(", ") + "."
      : "";
  }

  /* ---------- sheets ---------- */
  function openSheet(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");   // no <dialog> support: inert fallback
  }

  function closeSheet(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  const sheetIsOpen = () => Boolean(document.querySelector("dialog[open]"));

  function openFontSheet() {
    buildFontList();
    openSheet(el.fontSheet);
    const checked = el.fontList.querySelector('[aria-checked="true"]') || el.fontList.firstElementChild;
    if (checked) checked.focus();
  }

  /* ---------- character chart ---------- */
  const add = (parent, tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    parent.appendChild(n);
    return n;
  };

  // Readings come from the decks wherever a kana is drilled, so the chart's
  // layout data and the quiz can never disagree. A flow item may carry its own
  // `a` — the extended katakana are reference-only and in no deck.
  function chartReadings() {
    const map = new Map();
    state.decks.forEach((d) => d.cards.forEach((c) => {
      if (!map.has(c.q)) map.set(c.q, c.a);
    }));
    return map;
  }

  function kanaCell(parent, q, romaji) {
    const cell = add(parent, "span", "kcell");
    add(cell, "span", "kcell__k", q).lang = "ja";
    add(cell, "span", "kcell__r", romaji);
    return cell;
  }

  function renderChart(id) {
    const chart = state.charts.find((c) => c.id === id) || state.charts[0];
    if (!chart) return;
    const readings = chartReadings();
    const readingOf = (item) =>
      typeof item === "string" ? (readings.get(item) || "?") : (item.a || readings.get(item.q) || "?");
    const kanaOf = (item) => (typeof item === "string" ? item : item.q);

    el.chartSheet.dataset.script = chart.id;
    Array.from(el.chartSwitch.children).forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.chart === chart.id)));

    el.chartBody.innerHTML = "";
    const mast = add(el.chartBody, "div", "chart__masthead");
    add(mast, "h3", null, chart.ja).lang = "ja";
    add(mast, "p", null, chart.subtitle || chart.label);

    chart.sections.forEach((sec) => {
      const block = add(el.chartBody, "section", "chart__block");
      const h = add(block, "h4", null, sec.title);
      if (sec.en) add(h, "span", "en", sec.en);

      if (sec.type === "flow") {
        const flow = add(block, "div", "chart--flow");
        (sec.items || []).forEach((item) => kanaCell(flow, kanaOf(item), readingOf(item)));
        return;
      }

      const table = add(block, "table", "chart");
      const headRow = add(add(table, "thead"), "tr");
      add(headRow, "th", null, "").setAttribute("aria-hidden", "true");   // corner
      sec.cols.forEach((c) => { add(headRow, "th", null, c).scope = "col"; });

      const body = add(table, "tbody");
      sec.rows.forEach((row) => {
        const tr = add(body, "tr");
        add(tr, "th", null, row.label).scope = "row";
        sec.cols.forEach((_, idx) => {
          const q = row.cells[idx];
          const td = add(tr, "td", q ? null : "is-gap");
          if (q) kanaCell(td, q, readings.get(q) || "?");
        });
      });

      // the final nasal stands alone rather than pretending to be an a-column
      if (sec.single) {
        const solo = add(block, "div", "chart--single");
        kanaCell(solo, sec.single, readings.get(sec.single) || "?");
      }
    });

    const note = add(el.chartBody, "p", "chart__note");
    add(note, "span", "chart__seal", "五十音").lang = "ja";
    add(note, "span", "chart__notetext", "Rows follow the standard gojūon ordering.");
  }

  function openChartSheet() {
    renderChart(el.chartSheet.dataset.script || "hiragana");
    openSheet(el.chartSheet);
    el.chartBody.focus();     // so arrow keys / space scroll the tables
  }

  /* ---------- menu ---------- */
  function buildMenu() {
    el.decks.innerHTML = "";
    state.decks.forEach((deck) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "deck" + (deck.sample.length > 1 ? " deck--combo" : "");

      const best = store.best(deck.id);
      const bestMs = store.bestTime(deck.id);
      b.setAttribute("aria-label", deck.label + " — " + deck.cards.length + " cards" +
        (best ? ", best " + best + "%" : "") +
        (bestMs ? ", fastest clean run " + fmtTime(bestMs) : ""));

      b.innerHTML =
        '<span class="deck__sample" lang="ja">' + deck.sample + "</span>" +
        '<span><span class="deck__name">' + deck.label + "</span>" +
        '<span class="deck__meta">' + deck.subtitle + " · " + deck.cards.length + " cards</span></span>" +
        '<span class="deck__best">' +
          '<span class="deck__pct">' + (best ? best + "%" : "—") + "</span>" +
          (bestMs ? '<span class="deck__time" title="Fastest run with no mistakes">' +
                    fmtTime(bestMs) + "</span>" : "") +
          "<small>" + (best ? "best" : "new") + "</small>" +
        "</span>";

      b.addEventListener("click", () => start(deck));
      el.decks.appendChild(b);
    });
  }

  function toMenu() {
    clearTimeout(state.timer);
    stopClock(false);          // abandoned run — drop the clock, don't record it
    state.graded = false;
    buildMenu();
    show(el.menu);
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".seg__btn").forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
    store.write({ mode: mode });
    if (!el.play.classList.contains("hidden")) render();
  }

  /* ---------- run ---------- */
  function start(deck, cards) {
    state.deck = deck;
    state.isDrill = Boolean(cards);
    state.queue = shuffle(cards && cards.length ? cards : deck.cards);
    state.i = 0;
    state.answered = 0; state.correct = 0;
    state.streak = 0; state.bestStreak = 0;
    state.missed = [];
    store.write({ deck: deck.id });

    el.playMark.textContent = deck.sample;
    el.playLabel.textContent = deck.label + (state.isDrill ? " · drill" : "");
    show(el.play);
    startClock();
    render();
  }

  function render() {
    const c = card();
    state.graded = false;
    clearTimeout(state.timer);

    el.square.classList.remove("is-correct", "is-wrong", "is-graded");
    el.glyph.textContent = c.q;
    el.glyph.classList.toggle("is-pair", c.q.length > 1);
    el.feedback.textContent = state.mode === "type"
      ? "Type the sound this character makes."
      : "Pick the sound this character makes.";

    el.mProgress.innerHTML = (state.i + 1) + "<small>/" + state.queue.length + "</small>";
    updateStats();

    if (state.mode === "type") {
      el.typeMode.classList.remove("hidden");
      el.chooseMode.classList.add("hidden");
      el.input.value = "";
      el.submitBtn.textContent = "Check";
      // Never disable or blur the field: on a phone that dismisses the
      // keyboard between every card. state.graded gates input instead.
      if (!TOUCH || document.activeElement === el.input) el.input.focus();
    } else {
      el.typeMode.classList.add("hidden");
      el.chooseMode.classList.remove("hidden");
      const stale = el.chooseTools.querySelector(".btn");
      if (stale) stale.remove();
      el.chooseHint.classList.remove("hidden");
      buildChoices(c);
    }
  }

  function buildChoices(c) {
    // Distractors come from the same deck so the options stay plausible, and are
    // deduped by reading — じ and ぢ are both "ji", so picking cards blindly
    // would render two identical buttons.
    const taken = new Set([c.a]);
    const pool = [];
    shuffle(state.deck.cards).forEach((x) => {
      if (!taken.has(x.a)) { taken.add(x.a); pool.push(x); }
    });
    const opts = shuffle(pool.slice(0, 3).concat(c));

    el.choices.innerHTML = "";
    opts.forEach((o, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.dataset.a = o.a;
      b.innerHTML = '<span class="choice__key">' + (idx + 1) + "</span>" + o.a;
      b.addEventListener("click", () => pick(b, o, c));
      el.choices.appendChild(b);
    });
  }

  function updateStats() {
    el.mStreak.textContent = state.streak;

    // live accuracy, with your best for this deck alongside it as the target
    const pct = state.answered
      ? Math.round(state.correct / state.answered * 100) + "%"
      : "—";
    const best = state.deck && !state.isDrill ? store.best(state.deck.id) : 0;
    el.mAcc.innerHTML = pct +
      (best ? '<span class="metric__best">' + best + "%</span>" : "");

    el.barFill.style.width = (state.i / state.queue.length * 100) + "%";
  }

  /* ---------- answering ---------- */
  function submitType() {
    if (state.graded) { next(); return; }
    const value = norm(el.input.value);
    if (!value) return;
    if (accepts(card(), value)) markCorrect();
    else markWrong(card(), false);
  }

  function pick(btn, opt, c) {
    if (state.graded) return;
    Array.from(el.choices.children).forEach((b) => { b.disabled = true; });
    if (opt.a === c.a) {
      btn.classList.add("is-picked-ok");
      markCorrect();
    } else {
      btn.classList.add("is-picked-no");
      const right = Array.from(el.choices.children).find((b) => b.dataset.a === c.a);
      if (right) right.classList.add("is-answer");
      markWrong(c, false);
    }
  }

  function reveal() {
    if (state.graded) return;
    markWrong(card(), true);
  }

  function markCorrect() {
    const c = card();
    state.answered++; state.correct++;
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.graded = true;

    el.square.classList.add("is-correct", "is-graded");
    el.feedback.innerHTML = '<span class="ok">Correct — <b lang="ja">' + c.q +
      '</b> is “' + c.a + '”.</span>';
    updateStats();
    state.timer = setTimeout(next, REVEAL_DELAY);
  }

  function markWrong(c, viaReveal) {
    state.answered++;
    state.streak = 0;
    state.graded = true;
    if (!state.missed.includes(c)) state.missed.push(c);

    el.square.classList.remove("is-correct");
    el.square.classList.add("is-wrong", "is-graded");

    const readings = [c.a].concat(c.alt || []).join(" / ");
    el.feedback.innerHTML =
      (viaReveal ? "" : '<span class="no">Not quite. </span>') +
      '<b lang="ja">' + c.q + '</b> is “<span class="no">' + readings + '</span>”. ' +
      (TOUCH ? "Tap to continue." : state.mode === "type" ? "Press Enter to continue." : "");

    updateStats();

    if (state.mode === "type") {
      el.input.value = c.a;
      if (!TOUCH) { el.input.focus(); el.input.select(); }
      el.submitBtn.textContent = "Next →";
    } else {
      el.chooseHint.classList.add("hidden");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--primary";
      b.textContent = "Continue →";
      b.addEventListener("click", next);
      el.chooseTools.appendChild(b);
      b.focus();
    }
  }

  function next() {
    clearTimeout(state.timer);
    state.graded = false;
    state.i++;
    if (state.i >= state.queue.length) { finish(); return; }
    render();
  }

  /* ---------- end ---------- */
  function finish() {
    stopClock(true);
    const took = elapsed();
    const pct = state.answered ? Math.round(state.correct / state.answered * 100) : 0;
    const isRecord = !state.isDrill && store.setBest(state.deck.id, pct);
    const best = store.best(state.deck.id);
    // a clean sweep is what earns a time; reveals count as misses, so this
    // can't be gamed by rushing
    const flawless = !state.isDrill && pct === 100;
    const isFastest = flawless && store.setBestTime(state.deck.id, took);
    const bestMs = state.isDrill ? 0 : store.bestTime(state.deck.id);

    el.endMark.textContent = state.deck.sample;
    el.endLabel.textContent = state.deck.label + " complete";
    el.endScore.textContent = pct + "%";
    el.endSub.textContent =
      state.correct + " of " + state.answered + " right · " + fmtTime(took) +
      " · longest streak " + state.bestStreak;

    // Beside the score: this deck's records. The accuracy is dropped when it
    // equals this run (first attempt, new record, exact tie) — repeating the same
    // number twice says nothing. Drills are a handful of cards, so no records.
    const parts = [];
    if (!state.isDrill && best > 0 && best !== pct) parts.push("<b>" + best + "%</b>");
    if (bestMs && !isFastest) parts.push("<b>" + fmtTime(bestMs) + "</b>");
    el.endBestChip.classList.toggle("hidden", !parts.length);
    if (parts.length) el.endBestChip.innerHTML = "best " + parts.join(" · ");

    const news = [];
    if (isRecord) news.push("New best for this deck.");
    if (isFastest) news.push(isRecord ? "Fastest clean run too." : "Fastest clean run yet.");
    el.endBest.classList.toggle("hidden", !news.length);
    el.endBest.textContent = news.join(" ");

    // unique misses, back in chart order
    const missed = state.deck.cards.filter((c) => state.missed.includes(c));

    if (missed.length) {
      el.missedBlock.classList.remove("hidden");
      el.missedGrid.innerHTML = "";
      missed.forEach((c) => {
        const d = document.createElement("div");
        d.className = "miss";
        d.innerHTML = '<span class="miss__k" lang="ja">' + c.q + '</span>' +
                      '<span class="miss__r">' + c.a + "</span>";
        el.missedGrid.appendChild(d);
      });
      el.drillBtn.classList.remove("hidden");
      el.drillBtn.textContent = "Drill " + missed.length +
        (missed.length === 1 ? " miss" : " misses");
      el.drillBtn.onclick = () => start(state.deck, missed);
    } else {
      el.missedBlock.classList.add("hidden");
      el.drillBtn.classList.add("hidden");
    }

    el.againBtn.textContent = "Practice all " + state.deck.cards.length + " again";
    el.againBtn.onclick = () => start(state.deck);
    show(el.end);
  }

  /* ---------- wiring ---------- */
  // The square is the largest target on a phone: tap it to move on.
  el.square.addEventListener("click", () => { if (state.graded) next(); });

  el.submitBtn.addEventListener("click", submitType);
  el.revealBtn.addEventListener("click", reveal);
  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitType(); }
  });

  el.playFontBtn.addEventListener("click", openFontSheet);
  el.menuFontBtn.addEventListener("click", openFontSheet);
  el.fontCloseBtn.addEventListener("click", () => closeSheet(el.fontSheet));
  el.chartBtn.addEventListener("click", openChartSheet);
  el.chartCloseBtn.addEventListener("click", () => closeSheet(el.chartSheet));
  Array.from(el.chartSwitch.children).forEach((b) =>
    b.addEventListener("click", () => {
      renderChart(b.dataset.chart);
      el.chartBody.scrollTop = 0;
    }));

  // click outside the panel (i.e. on the backdrop) closes it
  [el.fontSheet, el.chartSheet].forEach((sheet) =>
    sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(sheet); }));

  document.addEventListener("keydown", (e) => {
    if (sheetIsOpen()) return;              // an open sheet owns the keyboard
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

  document.querySelectorAll(".seg__btn").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode)));

  el.menuBtn.addEventListener("click", toMenu);
  el.endMenuBtn.addEventListener("click", toMenu);
  el.restartBtn.addEventListener("click", () => start(state.deck));

  /* ---------- boot ---------- */
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
      el.chartBtn.classList.toggle("hidden", !state.charts.length);
      const fonts = resolveFonts(data.fonts);
      state.fonts = fonts.list;
      state.fontsMissing = fonts.missing;
      applyFont(store.read().font);
      setMode(state.mode);
      toMenu();
    })
    .catch((err) => {
      el.fatalMsg.textContent = String(err.message || err);
      show(el.fatal);
    });
})();
