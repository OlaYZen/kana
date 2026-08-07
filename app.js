/* ==========================================================================
   Kana Practice — pure client-side, no build step, no backend.
   Decks and answers live in kana.json; this file is only game logic.
   ========================================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const el = {
    menu: $("menu"), play: $("play"), end: $("end"), fatal: $("fatal"),
    decks: $("decks"), menuScroll: document.querySelector(".menu__scroll"),
    flickDecks: $("flickDecks"), flickTitle: $("flickTitle"),
    scriptSwitch: $("scriptSwitch"),
    playMark: $("playMark"), playLabel: $("playLabel"),
    square: $("square"), glyph: $("glyph"), feedback: $("feedback"),
    typeMode: $("typeMode"), chooseMode: $("chooseMode"), writeMode: $("writeMode"),
    input: $("input"), submitBtn: $("submitBtn"),
    kanaInput: $("kanaInput"), writeSubmitBtn: $("writeSubmitBtn"),
    revealBtn: $("revealBtn"), revealBtnTop: $("revealBtnTop"), revealBar: $("revealBar"),
    typedTools: $("typedTools"), typedHint: $("typedHint"),
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
    fatalMsg: $("fatalMsg"),
    auth: $("auth"), authTitle: $("authTitle"), authBlurb: $("authBlurb"),
    authForm: $("authForm"), authUser: $("authUser"), authPass: $("authPass"),
    authMsg: $("authMsg"), authSubmit: $("authSubmit"), authSwap: $("authSwap"),
    authSignedIn: $("authSignedIn"), authWho: $("authWho"), authBackBtn: $("authBackBtn"),
    logoutBtn: $("logoutBtn"), deleteBtn: $("deleteBtn"),
    pwToggle: $("pwToggle"), pwForm: $("pwForm"), pwMsg: $("pwMsg"),
    pwCurrent: $("pwCurrent"), pwNew: $("pwNew"), pwConfirm: $("pwConfirm"),
    pwSubmit: $("pwSubmit"), pwCancel: $("pwCancel"),
    accountBtn: $("accountBtn"), accountName: $("accountName"),
    moreBtn: $("moreBtn"), moreSheet: $("moreSheet"), moreCloseBtn: $("moreCloseBtn"),
    moreMode: $("moreMode"),
    stats: $("stats"), statsBtn: $("statsBtn"), statsBody: $("statsBody"),
    statsBackBtn: $("statsBackBtn"), deckPick: $("deckPick"),
    statsScriptSwitch: $("statsScriptSwitch"),
    themeColor: document.querySelector('meta[name="theme-color"]'),
    // Three switches now share .seg__btn. Never select that class document-wide:
    // the device switch has no data-mode, so a global query wires
    // setMode(undefined) onto it and blanks its aria-checked every time the
    // answer mode changes. Each switch has an id of its own for that reason.
    modeSwitch: $("modeSwitch"),
    themeSwitch: $("themeSwitch"),
    deviceSwitch: document.querySelector(".seg--device")
  };

  /* ---------- localStorage keys ----------
     All three were prefixed `hkk.` — the old name of the project directory —
     until they were renamed to match it; renameKeys() below moves anything
     still under the old names. */
  const STORE = "kana.v1";         // prefs + records, the blob an account syncs
  const TOKEN_KEY = "kana.token";  // session token: deliberately outside the
                                   // blob, which is uploaded, and a token has no
                                   // business making that round trip
  const THEME_KEY = "kana.theme";  // light/dark: outside it too, and for a
                                   // second reason — see the theme section

  // Renaming a key silently wipes every record anyone has set, so nothing is
  // renamed without moving what was there. Runs immediately rather than at boot:
  // `state` and `api` both read their key while this file is still evaluating.
  // Idempotent — after the first load there is nothing left to find.
  (function renameKeys() {
    try {
      [["hkk.v1", STORE], ["hkk.token", TOKEN_KEY]].forEach(([was, now]) => {
        const val = localStorage.getItem(was);
        if (val === null) return;
        if (localStorage.getItem(now) === null) localStorage.setItem(now, val);
        localStorage.removeItem(was);
      });
    } catch (e) { /* private mode — there is nothing stored to move */ }
  })();

  const REVEAL_DELAY = 620;   // ms the 〇 stamp stays before advancing

  // Phones and tablets: typing romaji on a virtual keyboard is slow and the
  // keyboard eats half the screen, so first-time visitors start in Choosing.
  const TOUCH = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  const MODES = ["type", "choose", "write"];
  // "flick" is not a selectable answer mode — the flick drills are their own
  // runs, and they record under it so their scores never mix with a deck's.
  const MODE_LABEL = { type: "Typing", choose: "Choosing", write: "Writing", flick: "Flick" };

  // Reading kana, picking from four, and writing kana from a sound are three
  // different skills, so each keeps its own records — a record belongs to a
  // deck *and* a mode, never to a deck alone.
  const recordKey = (deckId, mode) => deckId + "|" + mode;

  /* ---------- persisted preferences + best scores ---------- */
  const store = {
    read() {
      try { return JSON.parse(localStorage.getItem(STORE)) || {}; }
      catch (e) { return {}; }
    },
    write(patch) {
      try { localStorage.setItem(STORE, JSON.stringify(Object.assign(store.read(), patch))); }
      catch (e) { /* private mode — preferences just don't persist */ }
      schedulePush();   // mirror to the account, if there is one
    },

    // Records were once keyed by deck alone, from when all modes shared one
    // score. Those are moved to whichever mode was last selected — the only
    // evidence there is of which mode earned them — rather than being thrown
    // away. `rev` tracks the *shape* inside the key, which is how a shape
    // change ships without touching the key's name; renaming that is a
    // separate and much more dangerous act, handled once by renameKeys().
    migrate() {
      const data = store.read();
      if (data.rev >= 2) return;
      const mode = MODES.includes(data.mode) ? data.mode : "type";
      const rekey = (table) => {
        const out = {};
        Object.keys(table || {}).forEach((k) => {
          out[k.indexOf("|") > -1 ? k : recordKey(k, mode)] = table[k];
        });
        return out;
      };
      store.write({ rev: 2, best: rekey(data.best), bestTime: rekey(data.bestTime) });
    },

    best(deckId, mode) { return (store.read().best || {})[recordKey(deckId, mode)] || 0; },
    setBest(deckId, mode, pct) {
      const best = store.read().best || {};
      const k = recordKey(deckId, mode);
      if (pct > (best[k] || 0)) { best[k] = pct; store.write({ best: best }); return true; }
      return false;
    },

    // Best time is only recorded for a run with no mistakes. Timing every run
    // would let a rushed or revealed-answer run set a record that can never be
    // beaten honestly, which makes the number worthless.
    bestTime(deckId, mode) { return (store.read().bestTime || {})[recordKey(deckId, mode)] || 0; },
    setBestTime(deckId, mode, ms) {
      const times = store.read().bestTime || {};
      const k = recordKey(deckId, mode);
      const prev = times[k] || 0;
      if (!prev || ms < prev) { times[k] = ms; store.write({ bestTime: times }); return true; }
      return false;
    }
  };
  // migrate() is called from boot, not here: it writes, and a write reaches
  // schedulePush(), which touches the `api` const declared further down. Doing
  // it at this point would hit that binding's temporal dead zone and throw.

  /* ==========================================================================
     Fonts

     Five of the styles are **bundled** — the face ships under fonts/, subset to
     kana, and the @font-face rules at the top of the stylesheet load it. Those
     are always offered: whether the device has them is not a question, and the
     probe below could not answer it anyway, because web fonts load long after
     this runs and probing one at boot always reports "missing". Before they
     were bundled, a stock Windows install saw barely half the picker — Windows
     ships no Japanese serif or textbook face unless an optional feature is
     installed.

     The probe is still here for the rest. For a device-only style the only
     usable faces are the ones already installed, and neither obvious test works
     for kana: document.fonts.check() answers true for names that don't exist,
     and every CJK face is full-width so canvas text widths are identical across
     all of them. So each candidate is rendered to a canvas and its pixels
     hashed — which also settles the question that actually matters, "does this
     option look any different?". Anything that renders like the last-resort
     font, or like an option already on the list, is dropped instead of being
     offered as a choice that does nothing.

     A bundled option skips the dedupe as well as the presence check, and has
     to: at boot none of the five have loaded, so all five hash to whatever
     their generic falls back to — identical to one another — and a dedupe would
     keep one and throw the other four away.
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

  // The bundled face leads, so everyone sees the same one; the installed names
  // sit behind it and only ever render what the subset deliberately leaves out
  // — a kanji typed into the write field, mostly. The generic is last as always.
  const stackFor = (def, families) =>
    (def.bundled ? ['"' + def.bundled + '"'] : [])
      .concat(families.map(quoted))
      .concat(def.generic || "serif")
      .join(", ");

  const option = (def, stack) => ({
    id: def.id, label: def.label, ja: def.ja || "",
    note: def.note || "", bundled: Boolean(def.bundled), stack: stack
  });

  function resolveFonts(defs) {
    const all = (defs || []).map((d) => option(d, stackFor(d, d.families || [])));

    const probe = inkHash && inkHash('"__kana_probe_missing__", monospace') ? inkHash : null;
    if (!probe) return { list: all, missing: [] };   // can't verify — offer everything

    const lastResort = probe('"__kana_probe_missing__", monospace');
    // Seeded with the last-resort shape, so a style that renders identically to
    // it is dropped by the same rule that drops a duplicate. That was always
    // the intent — it is the one thing an option can be and still be worth
    // nothing, since it is what you would get without the option existing —
    // but the comparison was never actually made.
    //
    // Note this is *not* a tofu test and can't be one. A browser falls back
    // per character, so on a Windows box with no Japanese font "serif" still
    // renders real kana out of whatever face the engine finds; last-resort here
    // means "indistinguishable from the default", not "boxes". Seeding it was
    // only safe once five styles shipped with the app — before that, dropping
    // an option that matched the default could have emptied the picker.
    const seen = new Set([lastResort]);
    const list = [], missing = [];

    (defs || []).forEach((def) => {
      const named = (def.families || []).filter(
        (f) => probe(quoted(f) + ", monospace") !== lastResort
      );

      // A bundled style ships with the app: it is always offered, and it is
      // never hashed. At this point its @font-face has not loaded, so the hash
      // would be its generic's — the same for all five — and the dedupe below
      // would throw four of them away.
      if (def.bundled) { list.push(option(def, stackFor(def, named))); return; }

      // A device-only style with families listed but none installed would
      // silently render as its generic twin, so it is not offered at all.
      if ((def.families || []).length && !named.length) { missing.push(def.label); return; }

      const stack = stackFor(def, named);
      const h = probe(stack);
      if (h && seen.has(h)) { missing.push(def.label); return; }
      if (h) seen.add(h);
      list.push(option(def, stack));
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
    mixed: null,       // the derived everything-deck; kept out of decks[] above
    deck: null,        // active deck definition
    queue: [],         // shuffled cards for this run
    i: 0,
    // the menu lists one script at a time; this is which one
    script: ["hiragana", "katakana"].includes(store.read().script)
      ? store.read().script
      : "hiragana",
    // type: kana → romaji.  choose: kana → romaji, multiple choice.
    // write: romaji → kana, which needs the device's Japanese keyboard.
    mode: MODES.includes(store.read().mode)
      ? store.read().mode
      : (TOUCH ? "choose" : "type"),
    answered: 0, correct: 0, streak: 0, bestStreak: 0,
    missed: [],        // unique wrong cards, chart order
    graded: false,     // answer already scored — waiting to advance
    kbDismissed: false, // user put the on-screen keyboard away; don't force it back
    flick: null,       // "vowel" | "key" while a flick drill is running
    isDrill: false,
    timer: 0,          // pending auto-advance, cleared whenever the card changes
    answers: [],       // per-card log for this run, posted at the end
    cardAt: 0,         // performance.now() when the current card was shown
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

  // Kana typed through an IME can arrive half-width (ｱ) or with the dakuten as a
  // separate combining mark, both of which are the character the user meant.
  // NFKC folds them to the composed full-width form the decks are written in;
  // the ideographic space it produces is then stripped along with the rest.
  const normKana = (s) => s.normalize("NFKC").replace(/\s/g, "");

  // Which of the run's categories a card came from. Only the mixed deck has
  // any — every other deck is one category, itself, which is what collapses
  // both callers back to exactly what they did before it existed.
  const cardGroup = (c) => (state.deck.groupOf && state.deck.groupOf.get(c)) || state.deck;

  // Writing runs the deck backwards, and backwards the mapping is many-to-one:
  // じ and ぢ are both "ji", ず and づ are both "zu". The prompt is only the
  // reading, so the user has no way to tell which of the pair is being asked —
  // every kana in the deck sharing this reading has to be accepted. (The same
  // collision, from the other side, is why choose-mode dedupes its distractors
  // by reading rather than by card.)
  //
  // Scoped to the card's own category rather than to the whole deck, which is
  // the same thing everywhere except the mixed deck. There the collision runs
  // across scripts too — か and カ are both "ka" — so the prompt names the
  // script it wants (writeAsk) and the answer is held to it. Accept the whole
  // deck there and every write answer in a mixed run could be typed in hiragana.
  const writeAccepts = (c, value) =>
    cardGroup(c).cards.some((x) => x.a === c.a && normKana(x.q) === value);

  // What the current run scores as. A flick drill ignores the answer mode.
  const activeMode = () => (state.flick ? "flick" : state.mode);

  // The answer is kana in write and flick alike, so both use the IME field.
  const kanaAnswer = () => state.flick !== null || state.mode === "write";

  // typing and writing are one interaction with the prompt reversed, so they
  // share a submit path — only the field and what counts as correct differ
  const typedField = () =>
    kanaAnswer()
      ? { input: el.kanaInput, submit: el.writeSubmitBtn }
      : { input: el.input, submit: el.submitBtn };

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
    [el.menu, el.play, el.end, el.fatal, el.auth, el.stats]
      .forEach((s) => s.classList.add("hidden"));
    screen.classList.remove("hidden");
  };

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

  // matches the two grounds in styles.css — the browser's own chrome (status
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
  function openSheet(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");   // no <dialog> support: inert fallback
  }

  function closeSheet(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    // a sheet steals focus while it is up; hand it back so the keyboard returns
    // with it rather than staying down for the rest of the card
    if (!el.play.classList.contains("hidden") && state.mode !== "choose") {
      focusField(typedField().input);
    }
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
    // opens on whichever script the menu is showing
    renderChart(state.script);
    openSheet(el.chartSheet);
    el.chartBody.focus();     // so arrow keys / space scroll the tables
  }

  /* ==========================================================================
     Flick keyboard drills

     A Japanese phone keyboard has ten keys, one per gojūon row, and the vowel
     comes from the direction you flick: middle a, left i, up u, right e, down o.
     These two drills train the two halves of that separately — one asks for a
     direction and takes any character with that vowel, the other asks for a key
     and takes any character from its row.

     Both mappings are derived from the chart grids in kana.json rather than
     listed here: a grid row already knows its consonant and a grid column
     already knows its vowel, so the drills cannot disagree with the chart.
     ========================================================================== */
  const FLICK_LEN = 20;            // prompts per run
  const VOWELS = ["a", "i", "u", "e", "o"];

  // Dakuten rows are not their own keys — が is the か key plus the ゛ mark, so
  // for "which key is it on" they fold back onto the base row.
  const BASE_KEY = { g: "k", z: "s", d: "t", b: "h", p: "h" };

  // The prompt is the row letter, plain. ふ is spelt "fu" but is the H key, and
  // labelling it "H/F" would hand over the one association the drill is for.
  const keyLabel = (k) => (k || "?").toUpperCase();

  const flickIndex = { vowel: new Map(), key: new Map(), reading: new Map() };

  function buildFlickIndex() {
    flickIndex.vowel.clear(); flickIndex.key.clear(); flickIndex.reading.clear();

    state.decks.forEach((d) => d.cards.forEach((c) => {
      if (!flickIndex.reading.has(c.q)) flickIndex.reading.set(c.q, c.a);
    }));

    state.charts.forEach((ch) => (ch.sections || []).forEach((sec) => {
      if (sec.type !== "grid") return;
      (sec.rows || []).forEach((row) => {
        // an empty row label is the vowel row itself — the あ key
        const k = BASE_KEY[row.label] || row.label || "a";
        row.cells.forEach((cell, i) => {
          if (!cell) return;
          if (!flickIndex.key.has(cell)) flickIndex.key.set(cell, k);
          if (!flickIndex.vowel.has(cell)) flickIndex.vowel.set(cell, sec.cols[i]);
        });
      });
    }));
  }

  // The keys actually present in the charts, in chart order.
  function flickKeys() {
    const seen = [];
    flickIndex.key.forEach((k) => { if (seen.indexOf(k) < 0) seen.push(k); });
    return seen;
  }

  // What a typed character is, as far as the keyboard is concerned. A yōon like
  // きゃ is typed on the first kana's key and carries the small kana's vowel —
  // ゃゅょ are not in the grids, so the vowel falls back to the deck reading.
  // ん resolves to neither and is rejected: it has no vowel, and which key it
  // sits on differs between keyboards, so drilling it would teach a guess.
  function kanaInfo(value) {
    const v = normKana(value);
    if (!v) return null;
    const key = flickIndex.key.get(v[0]);
    let vowel = flickIndex.vowel.get(v[v.length - 1]);
    if (!vowel) {
      const reading = flickIndex.reading.get(v) || "";
      const last = reading.slice(-1);
      if (VOWELS.indexOf(last) > -1) vowel = last;
    }
    return (key || vowel) ? { key: key, vowel: vowel } : null;
  }

  // a few real characters to show as "what would have counted"
  function flickExamples(kind, group) {
    const out = [];
    const table = kind === "vowel" ? flickIndex.vowel : flickIndex.key;
    table.forEach((g, kana) => {
      if (g === group && out.length < 6 && flickIndex.reading.has(kana)) out.push(kana);
    });
    return out;
  }

  function flickCard(kind, group) {
    return {
      q: kind === "vowel" ? group.toUpperCase() : keyLabel(group),
      a: flickExamples(kind, group).join(" "),
      flick: { kind: kind, group: group }
    };
  }

  // Deal the groups out evenly and then shuffle, rather than sampling at
  // random: over only 20 prompts, random sampling can leave a whole direction
  // out of the run entirely, which is the one thing this drill must not do.
  function flickQueue(kind, only) {
    const groups = only && only.length
      ? only
      : (kind === "vowel" ? VOWELS.slice() : flickKeys());
    const len = only && only.length
      ? Math.min(FLICK_LEN, only.length * 4)
      : FLICK_LEN;
    const out = [];
    while (out.length < len) out.push.apply(out, shuffle(groups));
    out.length = len;
    return shuffle(out).map((g) => flickCard(kind, g));
  }

  function flickAccepts(c, value) {
    const info = kanaInfo(value);
    if (!info) return false;
    return c.flick.kind === "vowel"
      ? info.vowel === c.flick.group
      : info.key === c.flick.group;
  }

  const FLICK_DECKS = [
    { id: "flick-vowel", flick: "vowel", sample: "あ", label: "Flick directions",
      subtitle: "a i u e o by swipe" },
    { id: "flick-key", flick: "key", sample: "か", label: "Flick keys",
      subtitle: "which key each row is on" }
  ];

  const deckSize = (deck) => (deck.flick ? FLICK_LEN : deck.cards.length);

  /* ==========================================================================
     The mixed deck

     Everything at once — both scripts, base, dakuten and yōon, every character
     exactly once in a run. It carries no cards in kana.json and is built here
     from every deck in the file, holding the *same card objects* rather than
     copies of them: identity is what `state.missed.includes(c)` and the
     chart-order review on the results screen both rely on. The other side of
     that is that nothing which walks every card in the app — chart readings,
     the flick index — may ever be handed this deck, or it counts each character
     twice; `state.decks` therefore stays the decks kana.json actually lists and
     the mixed deck is kept beside it.

     Ordering a run is the part that isn't a plain shuffle. Shuffling all 214
     together deals visible clumps — eight hiragana yōon, then a stretch of
     katakana base — and a clump is the deck it came from arriving again, which
     is the one thing this deck exists not to do. So each source deck is a
     category, each is shuffled on its own, and they are dealt out under a
     single rule: never more than MIX_RUN in a row from the same category.
     Nothing is sampled and nothing is dropped — this decides order alone.
     ========================================================================== */
  const MIX_RUN = 2;   // consecutive cards allowed from one category

  function buildMixedDeck(def) {
    if (!def || !state.decks.length) return null;
    const groupOf = new Map();
    const cards = [];
    state.decks.forEach((d) => d.cards.forEach((c) => {
      groupOf.set(c, d);
      cards.push(c);
    }));
    return {
      id: def.id || "mixed",
      label: def.label || "Mixed kana",
      sample: def.sample || "あア",
      subtitle: def.subtitle || "",
      note: def.note || "",
      // No script of its own, which is what puts it under both seal stamps:
      // the menu and the progress screen both read a missing script as "this
      // one belongs to neither, so show it under either".
      script: null,
      mix: state.decks.slice(),   // one category per source deck, in file order
      groupOf: groupOf,
      cards: cards
    };
  }

  // Every deck the menu can start, real and derived.
  const allDecks = () => state.decks.concat(state.mixed ? [state.mixed] : []);

  /* Can what is left in hand still be laid out under the run limit at all? m
     cards of one category need the others as separators: r of them open r+1
     gaps, each holding at most MIX_RUN, so m has to fit inside MIX_RUN × (r+1).
     A run already under way has eaten into the first of those gaps.

     Checked before every card is taken rather than repaired afterwards, and
     that is what keeps the end of a run honest. Weighted choice empties the
     piles at roughly the same rate but not exactly, and whichever pile is left
     over at the end has nothing to alternate with — so without this the last
     dozen cards of a run would all come from it. */
  function mixFits(left, last, run) {
    let total = 0;
    left.forEach((n) => { total += n; });
    return left.every((m, i) =>
      !m || m <= MIX_RUN * (total - m + 1) - (i === last ? run : 0));
  }

  // Weighted by what each category has left, so the order stays unpredictable
  // and the piles run down together instead of one of them outlasting the rest.
  function mixPick(open, left) {
    let total = 0;
    open.forEach((i) => { total += left[i]; });
    let r = Math.random() * total;
    for (let k = 0; k < open.length; k++) {
      r -= left[open[k]];
      if (r < 0) return open[k];
    }
    return open[open.length - 1];
  }

  function mixedQueue(deck) {
    const piles = deck.mix.map((g) => shuffle(g.cards));
    const left = piles.map((p) => p.length);
    const out = [];
    let last = -1, run = 0;

    while (out.length < deck.cards.length) {
      const open = [];
      left.forEach((n, i) => {
        if (!n) return;
        if (i === last && run >= MIX_RUN) return;   // would be three in a row
        left[i]--;
        if (mixFits(left, i, i === last ? run + 1 : 1)) open.push(i);
        left[i]++;
      });
      // mixFits holds at every step and holds for the full deck, so there is
      // nothing open only if kana.json grows a deck so much larger than the
      // rest that no ordering can space it out. Deal the biggest pile rather
      // than dropping cards: the run is still every character exactly once, it
      // just bunches up.
      const pick = open.length
        ? mixPick(open, left)
        : left.reduce((best, n, i) => (n > left[best] ? i : best), 0);
      run = pick === last ? run + 1 : 1;
      last = pick;
      left[pick]--;
      out.push(piles[pick].pop());
    }
    return out;
  }

  /* ---------- menu ---------- */
  function buildMenu() {
    el.decks.innerHTML = "";
    // A deck with no script of its own belongs to both stamps rather than to
    // neither — that is how the mixed deck comes to be listed twice while
    // recording once. It sorts last because it is built last: the three decks
    // above it are what you practise on the way to it.
    allDecks().filter((d) => !d.script || d.script === state.script)
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
    const mode = deck.flick ? "flick" : state.mode;
    const size = deckSize(deck);
    const unit = deck.flick ? " prompts" : " cards";
    const best = store.best(deck.id, mode);
    const bestMs = store.bestTime(deck.id, mode);

    b.setAttribute("aria-label", deck.label + " — " + size + unit +
      ", " + MODE_LABEL[mode].toLowerCase() +
      (best ? ", best " + best + "%" : ", no attempts yet") +
      (bestMs ? ", fastest clean run " + fmtTime(bestMs) : ""));

    b.innerHTML =
      '<span class="deck__sample" lang="ja">' + deck.sample + "</span>" +
      '<span><span class="deck__name">' + deck.label + "</span>" +
      '<span class="deck__meta">' + deck.subtitle + " · " + size + unit + "</span></span>" +
      '<span class="deck__best" title="Your best in ' + MODE_LABEL[mode] + '">' +
        '<span class="deck__pct">' + (best ? best + "%" : "—") + "</span>" +
        (bestMs ? '<span class="deck__time" title="Fastest run with no mistakes">' +
                  fmtTime(bestMs) + "</span>" : "") +
        // the mode names the figure: each mode keeps its own records, and an
        // unlabelled percentage would silently look like the deck's only score
        "<small>" + MODE_LABEL[mode] + "</small>" +
      "</span>";

    b.addEventListener("click", () => start(deck));
    return b;
  }

  function toMenu() {
    clearTimeout(state.timer);
    stopClock(false);          // abandoned run — drop the clock, don't record it
    state.graded = false;
    state.flick = null;        // back to the selected answer mode
    buildMenu();
    show(el.menu);
  }

  function setMode(mode) {
    state.mode = mode;
    Array.from(el.modeSwitch.children).forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
    store.write({ mode: mode });
    // the mode lives behind the Options sheet now, so the button that opens it
    // carries the current value — otherwise it is invisible from the menu
    el.moreMode.textContent = MODE_LABEL[mode] || mode;
    // the deck list shows this mode's records, so it has to be rebuilt too
    if (el.play.classList.contains("hidden")) buildMenu();
    else render();
  }

  // Which script's decks the menu is showing. The accent flips with it, the same
  // vermilion/indigo pairing the chart sheet uses.
  function setScript(id) {
    state.script = id;
    el.menu.dataset.script = id;
    Array.from(el.scriptSwitch.children).forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.script === id)));
    store.write({ script: id });
    buildMenu();
    el.menuScroll.scrollTop = 0;
  }

  /* ---------- run ---------- */
  function start(deck, cards) {
    state.deck = deck;
    state.flick = deck.flick || null;
    state.isDrill = Boolean(cards);
    // A flick run is generated, not dealt from a deck; a drill of one narrows
    // the generator to the groups that were missed. A drill is a plain shuffle
    // whatever the deck: balancing a handful of cards says nothing, and a drill
    // of five misses that all came from one category has no other category to
    // interleave with.
    state.queue = state.flick
      ? flickQueue(state.flick, (cards || []).map((c) => c.flick.group))
      : cards && cards.length ? shuffle(cards)
      : deck.mix ? mixedQueue(deck)
      : shuffle(deck.cards);
    state.i = 0;
    state.answered = 0; state.correct = 0;
    state.streak = 0; state.bestStreak = 0;
    state.missed = [];
    state.answers = [];
    state.kbDismissed = false;   // a fresh run always offers the keyboard
    store.write({ deck: deck.id });

    el.playMark.textContent = deck.sample;
    el.playLabel.textContent = deck.label + (state.isDrill ? " · drill" : "");
    show(el.play);
    startClock();
    render();
  }

  // Every graded answer, with how long the card was on screen. The server
  // decides what to do with an implausible time; the client just reports it.
  function logAnswer(c, given, correct, revealed) {
    state.answers.push({
      q: String(c.q).slice(0, 16),
      a: String(c.a).slice(0, 64),
      given: given == null ? null : String(given).slice(0, 64),
      correct: Boolean(correct),
      revealed: Boolean(revealed),
      ms: Math.round(Math.max(0, performance.now() - state.cardAt))
    });
  }

  function render() {
    const c = card();
    state.graded = false;
    clearTimeout(state.timer);
    state.cardAt = performance.now();

    // Latin prompt in three of the four cases: writing asks with romaji, and
    // both flick drills ask with a bare letter.
    const flicking = state.flick !== null;
    const writing = !flicking && state.mode === "write";
    const choosing = !flicking && state.mode === "choose";
    const latinPrompt = writing || flicking;

    el.square.classList.remove("is-correct", "is-wrong", "is-graded");
    el.glyph.textContent = flicking ? c.q : writing ? c.a : c.q;
    el.glyph.lang = latinPrompt ? "en" : "ja";
    el.glyph.classList.toggle("is-pair", !latinPrompt && c.q.length > 1);
    el.glyph.classList.toggle("is-romaji", latinPrompt);
    el.feedback.textContent =
      flicking ? (state.flick === "vowel"
                    ? "Any character that ends in this vowel."
                    : "Any character from this key.") :
      state.mode === "type"   ? "Type the sound this character makes." :
      state.mode === "choose" ? "Pick the sound this character makes."
                              : writeAsk();

    el.mProgress.innerHTML = (state.i + 1) + "<small>/" + state.queue.length + "</small>";
    updateStats();

    el.typeMode.classList.toggle("hidden", flicking || state.mode !== "type");
    el.writeMode.classList.toggle("hidden", !kanaAnswer());
    el.chooseMode.classList.toggle("hidden", !choosing);
    // reveal and the hint row belong to the two typing modes only
    el.typedTools.classList.toggle("hidden", choosing);
    el.revealBar.classList.toggle("hidden", choosing);

    if (choosing) {
      const stale = el.chooseTools.querySelector(".btn");
      if (stale) stale.remove();
      el.chooseHint.classList.remove("hidden");
      buildChoices(c);
    } else {
      // the IME reminder has to survive on touch, where the keyboard hint is
      // deliberately suppressed — hence the different class
      const ime = kanaAnswer();
      el.typedHint.textContent = ime ? "Japanese keyboard" : "Enter ↵ to check";
      el.typedHint.className = ime ? "hint hint--ime" : "hint hint--keys";

      const f = typedField();
      f.input.value = "";
      f.submit.textContent = "Check";
      // Never disable or blur the field: on a phone that dismisses the
      // keyboard between every card. state.graded gates input instead.
      // Focus every card unconditionally — only refocusing when focus happened
      // to still be in the box meant tapping the box again for every single
      // character on a phone.
      focusField(f.input);
    }
  }

  // Writing asks with the sound alone, and in the mixed deck a sound is not
  // enough to identify a character: か and カ are both "ka". So the script is
  // named rather than left to be guessed, and writeAccepts() holds the answer
  // to the same scope. Every other deck is one script and says nothing.
  function writeAsk() {
    const g = cardGroup(card());
    return state.deck.mix && g.script
      ? "Write the " + g.script + " for this sound."
      : "Write the character for this sound.";
  }

  // preventScroll: the stage is height-capped, so a focus that scrolls the page
  // drags the dock out from under the keyboard
  function focusField(input) {
    if (TOUCH && state.kbDismissed) return;      // they closed it on purpose
    if (document.activeElement === input) return; // already there — don't churn
    try { input.focus({ preventScroll: true }); }
    catch (e) { input.focus(); }
  }

  /* The on-screen keyboard follows focus, so anything that takes focus off the
     answer field closes it — and the refocus on the next card opens it again,
     which reads as the keyboard flickering between every card. Tapping the
     square to continue, Check, and Reveal all did exactly that.

     preventDefault on the press stops the control taking focus in the first
     place, so focus never leaves the field and the keyboard simply never moves.
     The click still fires; this only suppresses the focus side effect.

     Both pointerdown and mousedown are guarded: whichever one a browser treats
     as the focus trigger has to be the one prevented, and preventing the other
     as well is harmless. Neither suppresses the click. */
  function keepKeyboard(node) {
    const hold = (e) => {
      if (state.mode === "choose") return;   // nothing is focused to protect
      e.preventDefault();
    };
    node.addEventListener("pointerdown", hold);
    node.addEventListener("mousedown", hold);
  }

  // A blur that survives the guards above was the user's own doing — the
  // keyboard's hide key, or a tap somewhere we don't own. Respect it and stop
  // forcing the keyboard back up until they put the caret in a field again.
  function noteBlur() {
    if (!TOUCH) return;
    if (sheetIsOpen()) return;              // a sheet took focus, not the user
    state.kbDismissed = true;
  }

  function buildChoices(c) {
    // Distractors come from the same deck so the options stay plausible, and are
    // deduped by reading — じ and ぢ are both "ji", so picking cards blindly
    // would render two identical buttons. (The dedupe is also why the mixed
    // deck needs nothing special for the other half of that collision: カ is
    // dropped as a duplicate reading when the prompt is か.)
    //
    // "The same deck" is 214 cards across both scripts and every category once
    // the mixed deck is running, and a one-mora prompt beside three yōon
    // readings answers itself. So the draw starts inside the prompt's own
    // category and widens to the rest of the deck only if that can't spare
    // three distinct readings. Everywhere else the category is the deck, and
    // nothing about this changes.
    const taken = new Set([c.a]);
    const pool = [];
    const take = (from) => shuffle(from).forEach((x) => {
      if (pool.length >= 3 || taken.has(x.a)) return;
      taken.add(x.a); pool.push(x);
    });
    take(cardGroup(c).cards);
    if (pool.length < 3) take(state.deck.cards);
    const opts = shuffle(pool.concat(c));

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
    const best = state.deck && !state.isDrill ? store.best(state.deck.id, activeMode()) : 0;
    el.mAcc.innerHTML = pct +
      (best ? '<span class="metric__best">' + best + "%</span>" : "");

    el.barFill.style.width = (state.i / state.queue.length * 100) + "%";
  }

  /* ---------- answering ---------- */
  function submitTyped() {
    if (state.graded) { next(); return; }
    const c = card();

    if (state.flick) {
      const value = normKana(el.kanaInput.value);
      if (!value) return;
      const right = flickAccepts(c, value);
      logAnswer(c, value, right, false);
      if (right) markCorrect(value);
      else markWrong(c, false, value);
      return;
    }

    if (state.mode === "write") {
      const value = normKana(el.kanaInput.value);
      if (!value) return;
      const right = writeAccepts(c, value);
      logAnswer(c, value, right, false);
      if (right) markCorrect(value);
      else markWrong(c, false);
      return;
    }

    const value = norm(el.input.value);
    if (!value) return;
    const right = accepts(c, value);
    logAnswer(c, value, right, false);
    if (right) markCorrect();
    else markWrong(c, false);
  }

  function pick(btn, opt, c) {
    if (state.graded) return;
    Array.from(el.choices.children).forEach((b) => { b.disabled = true; });
    logAnswer(c, opt.a, opt.a === c.a, false);
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
    logAnswer(card(), null, false, true);
    markWrong(card(), true);
  }

  function markCorrect(typed) {
    const c = card();
    state.answered++; state.correct++;
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.graded = true;

    // credit the character actually written when it is the deck's other reading
    // of the same sound, so the confirmation isn't about a kana they didn't type
    const shown = typed && typed !== normKana(c.q) ? typed : c.q;

    el.square.classList.add("is-correct", "is-graded");
    el.feedback.innerHTML = state.flick
      ? '<span class="ok">Correct — <b lang="ja">' + shown + "</b> " +
        (state.flick === "vowel" ? "ends in " : "is on ") + c.q + ".</span>"
      : '<span class="ok">Correct — <b lang="ja">' + shown +
        '</b> is “' + c.a + '”.</span>';
    updateStats();
    state.timer = setTimeout(next, REVEAL_DELAY);
  }

  function markWrong(c, viaReveal, typed) {
    state.answered++;
    state.streak = 0;
    state.graded = true;
    if (!state.missed.includes(c)) state.missed.push(c);

    el.square.classList.remove("is-correct");
    el.square.classList.add("is-wrong", "is-graded");

    const tail = TOUCH ? "Tap to continue."
      : activeMode() !== "choose" ? "Press Enter to continue." : "";

    if (state.flick) {
      // name what they actually typed, so a wrong answer teaches where that
      // character really sits rather than only restating the prompt
      const info = typed ? kanaInfo(typed) : null;
      const got = !typed ? ""
        : !info ? '<b lang="ja">' + typed + "</b> isn’t a character this keyboard makes. "
        : '<b lang="ja">' + typed + '</b> is <span class="no">' +
          (state.flick === "vowel"
            ? (info.vowel || "?").toUpperCase()
            : keyLabel(info.key)) + "</span>, not " + c.q + ". ";
      el.feedback.innerHTML =
        (viaReveal ? "" : '<span class="no">Not quite. </span>') + got +
        "Try " + '<b lang="ja">' + c.a + "</b>. " + tail;
    } else {
      const readings = [c.a].concat(c.alt || []).join(" / ");
      el.feedback.innerHTML =
        (viaReveal ? "" : '<span class="no">Not quite. </span>') +
        '<b lang="ja">' + c.q + '</b> is “<span class="no">' + readings + '</span>”. ' + tail;
    }

    updateStats();

    if (activeMode() !== "choose") {
      const f = typedField();
      // show the answer in the field the user was answering in: a worked example
      // for flick, the kana when writing, the romaji when typing
      f.input.value = state.flick ? c.a.split(" ")[0]
        : state.mode === "write" ? c.q : c.a;
      focusField(f.input);
      // selecting shows drag handles on a phone, which reads as an invitation
      // to edit an answer that is already graded
      if (!TOUCH) f.input.select();
      f.submit.textContent = "Next →";
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
    reportRun();
    const took = elapsed();
    const pct = state.answered ? Math.round(state.correct / state.answered * 100) : 0;
    const mode = activeMode();
    const isRecord = !state.isDrill && store.setBest(state.deck.id, mode, pct);
    const best = store.best(state.deck.id, mode);
    // a clean sweep is what earns a time; reveals count as misses, so this
    // can't be gamed by rushing
    const flawless = !state.isDrill && pct === 100;
    const isFastest = flawless && store.setBestTime(state.deck.id, mode, took);
    const bestMs = state.isDrill ? 0 : store.bestTime(state.deck.id, mode);

    el.endMark.textContent = state.deck.sample;
    el.endLabel.textContent = state.deck.label + " complete";
    el.endScore.textContent = pct + "%";
    el.endSub.textContent =
      state.correct + " of " + state.answered + " right · " + fmtTime(took) +
      " · longest streak " + state.bestStreak;

    // Beside the score: this deck's records *in this mode*, named so the figure
    // can't be mistaken for a different mode's. The accuracy is dropped when it
    // equals this run (first attempt, new record, exact tie) — repeating the same
    // number twice says nothing. Drills are a handful of cards, so no records.
    const parts = [];
    if (!state.isDrill && best > 0 && best !== pct) parts.push("<b>" + best + "%</b>");
    if (bestMs && !isFastest) parts.push("<b>" + fmtTime(bestMs) + "</b>");
    el.endBestChip.classList.toggle("hidden", !parts.length);
    if (parts.length) {
      el.endBestChip.innerHTML = MODE_LABEL[mode].toLowerCase() + " best " + parts.join(" · ");
    }

    const news = [];
    if (isRecord) news.push("New " + MODE_LABEL[mode] + " best for this " +
      (state.flick ? "drill." : "deck."));
    if (isFastest) news.push(isRecord ? "Fastest clean run too." : "Fastest clean run yet.");
    el.endBest.classList.toggle("hidden", !news.length);
    el.endBest.textContent = news.join(" ");

    // Unique misses, back in chart order. A flick run has no deck to order by,
    // and the same prompt recurs through the run as separate cards, so its
    // misses are collapsed by group instead.
    const missed = state.flick
      ? state.missed.filter((c, i) =>
          state.missed.findIndex((x) => x.flick.group === c.flick.group) === i)
      : state.deck.cards.filter((c) => state.missed.includes(c));

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

    el.againBtn.textContent = state.flick
      ? "Practice " + FLICK_LEN + " more"     // a fresh random run, not the same one
      : "Practice all " + state.deck.cards.length + " again";
    el.againBtn.onclick = () => start(state.deck);
    show(el.end);
  }

  /* ---------- wiring ---------- */
  // The square is the largest target on a phone: tap it to move on.
  el.square.addEventListener("click", () => { if (state.graded) next(); });

  el.submitBtn.addEventListener("click", submitTyped);
  el.writeSubmitBtn.addEventListener("click", submitTyped);
  el.revealBtn.addEventListener("click", reveal);
  el.revealBtnTop.addEventListener("click", reveal);

  // every control that can be tapped mid-card, so none of them close the keyboard
  [el.square, el.submitBtn, el.writeSubmitBtn, el.revealBtn, el.revealBtnTop]
    .forEach(keepKeyboard);

  [el.input, el.kanaInput].forEach((f) => {
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

  // Everything reachable from Options closes it on the way out: a second
  // showModal() over an open dialog stacks them, and the backdrop-close handler
  // below would then only ever see the top one.
  const fromMore = (fn) => () => { closeSheet(el.moreSheet); fn(); };

  el.moreBtn.addEventListener("click", () => openSheet(el.moreSheet));
  el.moreCloseBtn.addEventListener("click", () => closeSheet(el.moreSheet));

  el.playFontBtn.addEventListener("click", openFontSheet);
  el.menuFontBtn.addEventListener("click", fromMore(openFontSheet));
  el.fontCloseBtn.addEventListener("click", () => closeSheet(el.fontSheet));
  el.chartBtn.addEventListener("click", fromMore(openChartSheet));
  el.chartCloseBtn.addEventListener("click", () => closeSheet(el.chartSheet));
  Array.from(el.chartSwitch.children).forEach((b) =>
    b.addEventListener("click", () => {
      renderChart(b.dataset.chart);
      el.chartBody.scrollTop = 0;
    }));

  // click outside the panel (i.e. on the backdrop) closes it
  [el.fontSheet, el.chartSheet, el.moreSheet].forEach((sheet) =>
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

  Array.from(el.modeSwitch.children).forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode)));

  Array.from(el.themeSwitch.children).forEach((b) =>
    b.addEventListener("click", () => setTheme(b.dataset.theme)));

  Array.from(el.scriptSwitch.children).forEach((b) =>
    b.addEventListener("click", () => setScript(b.dataset.script)));

  el.menuBtn.addEventListener("click", toMenu);
  el.endMenuBtn.addEventListener("click", toMenu);
  el.restartBtn.addEventListener("click", () => start(state.deck));

  /* account + progress */
  el.accountBtn.addEventListener("click", fromMore(() => {
    authError("");
    paintAccount();
    show(el.auth);
    if (!api.user) el.authUser.focus();
  }));
  el.authBackBtn.addEventListener("click", toMenu);
  el.statsBackBtn.addEventListener("click", toMenu);
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

  el.statsBtn.addEventListener("click", fromMore(openStats));
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

  /* ==========================================================================
     Backend

     Entirely optional. The app is still the four static files it always was:
     if nothing answers /api/health — opened from a plain file server, or the
     server is down — `api.up` stays false, the account and progress buttons
     never appear, and everything runs on localStorage exactly as before.

     An account does not replace localStorage so much as outrank it: the local
     copy stays as the offline cache, and the server holds the copy that
     follows you between devices. Two things are held back from that trip and
     live under their own keys — the session token and the theme; both are
     declared and explained at the top of this file.
     ========================================================================== */
  const api = {
    up: false,
    user: null,
    token: (function () {
      try { return localStorage.getItem(TOKEN_KEY) || null; } catch (e) { return null; }
    })(),

    setToken(t) {
      api.token = t;
      try {
        if (t) localStorage.setItem(TOKEN_KEY, t);
        else localStorage.removeItem(TOKEN_KEY);
      } catch (e) { /* private mode — the session just won't outlive the tab */ }
    },

    call(method, path, body) {
      const opts = { method: method, headers: {} };
      if (body !== undefined) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
      if (api.token) opts.headers.Authorization = "Bearer " + api.token;
      return fetch(path, opts).then((r) =>
        r.json().catch(() => ({})).then((data) => {
          if (r.status === 401 && api.token) signedOut();   // session expired
          if (!r.ok) throw new Error(data.error || "HTTP " + r.status);
          return data;
        }));
    }
  };

  /* ---------- account ---------- */
  let authMode = "login";
  let pushTimer = 0;

  function signedOut() {
    api.setToken(null);
    api.user = null;
    paintAccount();
  }

  function paintAccount() {
    el.accountBtn.classList.toggle("hidden", !api.up);
    el.statsBtn.classList.toggle("hidden", !api.up || !api.user);
    el.accountName.textContent = api.user || "Sign in";
    el.authSignedIn.classList.toggle("hidden", !api.user);
    el.authForm.classList.toggle("hidden", Boolean(api.user));
    el.authSwap.classList.toggle("hidden", Boolean(api.user));
    el.authBlurb.classList.toggle("hidden", Boolean(api.user));
    if (api.user) el.authWho.textContent = api.user;
    el.authTitle.textContent = api.user ? "Account"
      : authMode === "login" ? "Sign in" : "Create account";
    // Half-typed passwords must not survive a sign-out and be sitting there for
    // whoever signs in next.
    if (!api.user) closePasswordForm();
  }

  function authError(msg) {
    el.authMsg.textContent = msg || "";
    el.authMsg.classList.toggle("hidden", !msg);
  }

  /* ---------- changing a password ----------
     Changing one, not recovering one. There is no email on file and no reset
     link, so knowing the current password is the whole of the proof — which is
     why the endpoint asks for it even though the caller already holds a valid
     session. A borrowed unlocked phone is exactly the case it is there for. */
  function pwMessage(text, good) {
    el.pwMsg.textContent = text || "";
    el.pwMsg.classList.toggle("hidden", !text);
    el.pwMsg.classList.toggle("auth__msg--ok", Boolean(good));
  }

  function openPasswordForm() {
    el.pwForm.reset();
    pwMessage("");
    el.pwForm.classList.remove("hidden");
    el.pwToggle.classList.add("hidden");
    el.pwCurrent.focus();
  }

  // Deliberately leaves the message alone: the confirmation is shown *by*
  // closing the form, so clearing it here would erase what just happened.
  function closePasswordForm() {
    el.pwForm.reset();
    el.pwForm.classList.add("hidden");
    el.pwToggle.classList.remove("hidden");
  }

  function submitPassword(e) {
    if (e) e.preventDefault();
    const current = el.pwCurrent.value;
    const next = el.pwNew.value;
    const again = el.pwConfirm.value;

    if (!current || !next || !again) { pwMessage("Fill in all three fields."); return; }
    // Caught here rather than at the server: the second box exists to stop a
    // typo becoming a password nobody knows, which is a question about what was
    // typed on this screen and nothing the server can answer.
    if (next !== again) { pwMessage("The new passwords don't match."); return; }

    el.pwSubmit.disabled = true;
    pwMessage("");
    api.call("POST", "/api/password",
             { current_password: current, new_password: next })
      .then((data) => {
        // The change dropped every session this account had, including the one
        // this device was using; the reply carries its replacement.
        api.setToken(data.token);
        closePasswordForm();
        pwMessage("Password changed. Every other device has been signed out.", true);
      })
      .catch((err) => pwMessage(err.message))
      .then(() => { el.pwSubmit.disabled = false; });
  }

  function setAuthMode(mode) {
    authMode = mode;
    authError("");
    el.authSubmit.textContent = mode === "login" ? "Sign in" : "Create account";
    el.authSwap.textContent = mode === "login"
      ? "No account yet? Create one"
      : "Already have an account? Sign in";
    el.authPass.autocomplete = mode === "login" ? "current-password" : "new-password";
    paintAccount();
  }

  // The server's copy wins on sign-in, except when it has nothing yet — then
  // this device seeds it, so signing up doesn't throw away existing progress.
  function pullState() {
    return api.call("GET", "/api/state").then((data) => {
      const prefs = data.prefs || {};
      if (Object.keys(prefs).length) {
        try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
        store.migrate();
      } else {
        return pushState();
      }
    });
  }

  function pushState() {
    if (!api.user) return Promise.resolve();
    return api.call("PUT", "/api/state", { prefs: store.read() }).catch(() => {});
  }

  // store.write fires on every setting change and every record; batch them.
  function schedulePush() {
    if (!api.user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushState, 800);
  }

  // Pulling prefs rewrites localStorage, but `state` was read from the old copy
  // at boot — every one of them has to be pushed back through its setter or the
  // screen keeps showing the previous device's settings.
  function applyStoredPrefs() {
    const saved = store.read();
    applyFont(saved.font);
    if (MODES.includes(saved.mode)) setMode(saved.mode);
    const known = ["hiragana", "katakana"].indexOf(saved.script) > -1;
    const hasDecks = state.decks.some((d) => d.script === saved.script);
    if (known && hasDecks) setScript(saved.script);
    else buildMenu();     // records changed even if the script didn't
  }

  function afterSignIn(data) {
    api.setToken(data.token);
    api.user = data.username;
    authError("");
    el.authPass.value = "";
    return pullState().then(() => {
      applyStoredPrefs();
      paintAccount();
      toMenu();
    });
  }

  function submitAuth(e) {
    if (e) e.preventDefault();
    const username = el.authUser.value.trim();
    const password = el.authPass.value;
    if (!username || !password) { authError("Fill in both fields."); return; }
    el.authSubmit.disabled = true;
    authError("");
    api.call("POST", authMode === "login" ? "/api/login" : "/api/signup",
             { username: username, password: password })
      .then(afterSignIn)
      .catch((err) => authError(err.message))
      .then(() => { el.authSubmit.disabled = false; });
  }

  /* ---------- run reporting ---------- */
  // Posted whole, once, at the end of a run rather than card by card: a run
  // that was abandoned halfway is not evidence of anything.
  function reportRun() {
    if (!api.user || !state.answers.length) return;
    api.call("POST", "/api/runs", {
      deck_id: state.deck.id,
      mode: activeMode(),
      script: state.deck.script || null,
      device: DEVICE,
      is_drill: state.isDrill,
      duration_ms: Math.round(elapsed()),
      answers: state.answers
    }).catch(() => {});   // analytics are never worth interrupting practice for
  }

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
  function renderRuns(runs) {
    if (!runs || !runs.length) return;
    const b = statBlock("Runs", runs.length >= 25 ? "Most recent 25." : null);
    runs.forEach((r) => {
      const pct = r.total ? Math.round(r.correct / r.total * 100) : 0;
      // The deck is already the heading here, so the row names the mode instead,
      // with when it was finished under it — five columns of figures don't fit
      // across a small phone, and the two belong together anyway: they are what
      // the run *was*, as against how it went.
      const when = fmtWhen(r.created_at);
      statRow(b, [
        { text: MODE_LABEL[r.mode] || r.mode, cls: "srow__r srow__r--wide",
          sub: when || null },
        { text: r.correct + "/" + r.total, cls: "srow__s" },
        { text: fmtExact(r.duration_ms), cls: "srow__s srow__s--time" },
        { text: pct + "%", cls: "srow__v" + (pct < 70 ? " srow__v--bad" : "") }
      ]);
    });
  }

  // Two things belong to neither script and so stay in the picker under either
  // stamp: the flick drills, which aren't decks at all, and the mixed deck,
  // which is both scripts at once. One deck id, one set of figures — finding it
  // under あ or under ア is the same report.
  function forScript(decks) {
    return decks.filter((r) => {
      const deck = allDecks().find((d) => d.id === r.deck_id);
      return !deck || !deck.script || deck.script === statsScript;
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
      renderRuns(report.recent_runs);
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
      renderRuns(report.recent_runs);
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
        { text: MODE_LABEL[m.mode] || m.mode, cls: "srow__r srow__r--wide" },
        { text: fmtMs(m.median_ms), cls: "srow__v" },
        { text: m.accuracy + "%", cls: "srow__s" }
      ]));
    }

    renderRuns(report.recent_runs);
  }

  // Fetch and draw, keeping whatever is currently selected. Used by the device
  // switch, which must not disturb the chosen script.
  function loadStats() {
    show(el.stats);
    el.statsBody.innerHTML = "";
    el.deckPick.innerHTML = "";
    add(el.statsBody, "p", "sblock__note", "Loading…");
    Array.from(el.deviceSwitch.children).forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.device === statsDevice)));
    api.call("GET", "/api/analytics?device=" + statsDevice)
      .then((data) => renderStats(data[statsDevice] || { decks: [] }))
      .catch((err) => {
        el.statsBody.innerHTML = "";
        add(el.statsBody, "p", "sblock__note", "Couldn’t load: " + err.message);
      });
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

  /* ---------- boot ---------- */
  store.migrate();
  // <head> already put data-theme on the page before first paint; this catches
  // the switch up with it, and owns it from here on.
  paintTheme();
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
      el.chartBtn.classList.toggle("hidden", !state.charts.length);
      buildFlickIndex();   // needs both decks and charts
      // built from decks, and deliberately after everything that walks them:
      // its cards are theirs, so anything counting characters must not meet
      // this deck as well
      state.mixed = buildMixedDeck(data.mixed);
      probeBackend();      // runs alongside; the app never waits on it
      const fonts = resolveFonts(data.fonts);
      state.fonts = fonts.list;
      state.fontsMissing = fonts.missing;
      applyFont(store.read().font);
      setMode(state.mode);

      // a script with no decks in kana.json gets no button, and never gets
      // selected — otherwise the menu would open on an empty list
      const hasDecks = (id) => state.decks.some((d) => d.script === id);
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
})();
