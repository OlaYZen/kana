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
    numberMode: $("numberMode"), numInput: $("numInput"), numSubmitBtn: $("numSubmitBtn"),
    input: $("input"), submitBtn: $("submitBtn"),
    kanaInput: $("kanaInput"), writeSubmitBtn: $("writeSubmitBtn"),
    revealBtn: $("revealBtn"), revealBtnTop: $("revealBtnTop"), revealBar: $("revealBar"),
    typedTools: $("typedTools"), typedHint: $("typedHint"),
    choices: $("choices"), chooseTools: $("chooseTools"), chooseHint: $("chooseHint"),
    barFill: $("barFill"), mProgress: $("mProgress"), mStreak: $("mStreak"), mAcc: $("mAcc"),
    menuBtn: $("menuBtn"), restartBtn: $("restartBtn"),
    fontPicker: $("fontPicker"), fontList: $("fontList"), fontNote: $("fontNote"),
    fontBackBtn: $("fontBackBtn"),
    playFontBtn: $("playFontBtn"),
    menuFontBtn: $("menuFontBtn"), menuFontName: $("menuFontName"),
    chart: $("chart"), chartBody: $("chartBody"), chartBackBtn: $("chartBackBtn"),
    chartSwitch: document.querySelector(".chart__switch"),
    chartBtn: $("chartBtn"),
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
    moreBtn: $("moreBtn"), options: $("options"), optionsBackBtn: $("optionsBackBtn"),
    moreMode: $("moreMode"),
    stats: $("stats"), statsBtn: $("statsBtn"), statsBody: $("statsBody"),
    statsBackBtn: $("statsBackBtn"), deckPick: $("deckPick"),
    statsScriptSwitch: $("statsScriptSwitch"),
    themeColor: document.querySelector('meta[name="theme-color"]'),
    // Five switches now share .seg__btn. Never select that class document-wide:
    // the device switch has no data-mode, so a global query wires
    // setMode(undefined) onto it and blanks its aria-checked every time the
    // answer mode changes. Each switch has an id of its own for that reason.
    modeSwitch: $("modeSwitch"),
    promptSwitch: $("promptSwitch"),
    datesSwitch: $("datesSwitch"),
    themeSwitch: $("themeSwitch"),
    perfSwitch: $("perfSwitch"),
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
  const PERF_KEY = "kana.perf";    // outside it for the theme's reason exactly:
                                   // whether animation costs this device
                                   // anything is a fact about this device

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

  // ...and nothing in Fast, where there is no stamp to stay. A wrong answer is
  // untouched by this: it waits for you either way, because the correction is
  // the part worth reading and skipping it would make the mode a way to answer
  // badly and never find out.
  const revealDelay = () => (state.perf ? 0 : REVEAL_DELAY);

  // Phones and tablets: typing romaji on a virtual keyboard is slow and the
  // keyboard eats half the screen, so first-time visitors start in Choosing.
  const TOUCH = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  // The seal stamps, in the order index.html lists them. Only the first two are
  // scripts anyone writes in: "kana" is the stamp for material that is both at
  // once, "number" is counting and "calendar" is weekdays, months and dates,
  // neither of which is kana at all. All four are a script as far as everything
  // downstream is concerned, which is what keeps every deck filter to a single
  // comparison — see CLAUDE.md.
  const SCRIPTS = ["hiragana", "katakana", "kana", "number", "calendar"];

  const MODES = ["type", "choose", "write"];

  // Which script the generated drills ask in, when they are the ones asking:
  // 六 or "roku", 二十日 or "hatsuka". Both are worth practising and they are
  // different questions, so this is a setting rather than a decision made for
  // you — and it belongs to what you are learning rather than to this screen,
  // so it lives in `store` and follows an account, where the theme does not.
  //
  // Writing is untouched by it: that direction asks with the identity, 6 or
  // 20日 or Monday, and answers in kana. There is no reading to ask with.
  const PROMPTS = ["kanji", "reading"];
  // How a month, a date or a clock time is written wherever the app shows it:
  // 9月 and 3時45分, which is how nearly everything in Japan prints them, or
  // 九月 and 三時四十五分, which is how a textbook does. Weekdays have no number
  // in them and look the same either way. It follows an account for the Prompt
  // setting's reason — it is about what you are learning to read.
  //
  // The numeral form changes the question as well as the look. Typing and
  // Choosing on the kanji prompt answer with the value, and 9月 → 9 would be
  // the answer copied off the square, so under it those two ask for how the
  // value is said instead — see answersReading().
  const DATE_FORMS = ["numeral", "kanji"];
  // "flick" is not a selectable answer mode — the flick drills are their own
  // runs, and they record under it so their scores never mix with a deck's.
  // The number drills are not here: they answer to the three above like a deck.
  const MODE_LABEL = {
    type: "Typing", choose: "Choosing", write: "Writing", flick: "Flick"
  };

  // A generated drill's record mode carries the prompt form after it —
  // "type-kanji" — so the label has to come apart the same way. Run rows sent
  // back by the server arrive as these strings too, which is why this parses
  // one rather than taking the pieces.
  function modeLabel(mode) {
    const cut = String(mode).indexOf("-");
    if (cut < 0) return MODE_LABEL[mode] || mode;
    const base = MODE_LABEL[mode.slice(0, cut)];
    return base ? base + " · " + mode.slice(cut + 1) : mode;
  }

  // Reading kana, picking from four, and writing kana from a sound are three
  // different skills, so each keeps its own records — a record belongs to a
  // deck *and* a mode, never to a deck alone.
  const recordKey = (deckId, mode) => deckId + "|" + mode;

  // …and for the generated drills, to the prompt form as well. 六 → 6 and
  // "roku" → 6 are not the same question — the kanji gives itself away to
  // anyone who has met ten of them — so pooling the two would let the easier
  // one set a score the harder can never beat, which is the whole reason
  // records split by mode in the first place. Both forms are suffixed, and
  // `rev 4` moves the records that predate the split onto "-reading".
  const promptApplies = (deck, mode) =>
    Boolean(deck && (deck.numbers || deck.calendar)) && mode !== "write";
  // A calendar drill asked with 9月 wants the reading rather than the value, so
  // it is a third question beside 九月 → 9 and "kugatsu" → 9, and records as
  // "-numeral". A weekday has no number to write either way and keeps "-kanji".
  const promptForm = (deck, prompt) =>
    prompt === "kanji" && deck.calendar && deck.calendar !== "week" &&
    state.dates === "numeral" ? "numeral" : prompt;
  const recordMode = (deck, mode, prompt) =>
    promptApplies(deck, mode) ? mode + "-" + promptForm(deck, prompt) : mode;

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
      if (data.rev >= 4) return;
      const mode = MODES.includes(data.mode) ? data.mode : "type";
      const patch = {};

      // rev 2: records keyed by bare deck id predate the split by mode. The
      // mode last selected is the only evidence of which one earned them.
      const rekey = (table) => {
        const out = {};
        Object.keys(table || {}).forEach((k) => {
          out[k.indexOf("|") > -1 ? k : recordKey(k, mode)] = table[k];
        });
        return out;
      };
      // rev 3: the number drills briefly scored under a reserved mode of their
      // own before they answered to the three real ones. Those records are
      // moved to the mode that was selected, rather than dropped — the same
      // reasoning and the same evidence as rev 2 — and only where that mode has
      // no record already, so a real one is never overwritten by a stale one.
      const unreserve = (table) => {
        const out = {};
        Object.keys(table || {}).forEach((k) => {
          const to = k.slice(-7) === "|number" ? recordKey(k.slice(0, -7), mode) : k;
          if (to === k || out[to] === undefined) out[to] = table[k];
        });
        return out;
      };
      // rev 4: the generated drills asked only in romaji before the kanji
      // prompt existed, so every record they hold was earned on "reading" and
      // is moved onto that key. Suffixing both forms rather than leaving one
      // bare is what keeps the deck row from labelling a record "Typing" when
      // the other form would also be "Typing".
      const byPrompt = (table) => {
        const out = {};
        Object.keys(table || {}).forEach((k) => {
          const cut = k.lastIndexOf("|");
          const id = k.slice(0, cut), m = k.slice(cut + 1);
          const generated = id.indexOf("num-") === 0 || id.indexOf("cal-") === 0;
          out[generated && (m === "type" || m === "choose") ? k + "-reading" : k] = table[k];
        });
        return out;
      };
      const move = (table) => byPrompt(unreserve(rekey(table)));

      patch.rev = 4;
      patch.best = move(data.best);
      patch.bestTime = move(data.bestTime);
      store.write(patch);
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
    derived: [],       // decks built from the ones above; kept out of decks[]
    deck: null,        // active deck definition
    queue: [],         // shuffled cards for this run
    i: 0,
    // the menu lists one script at a time; this is which one
    script: SCRIPTS.includes(store.read().script)
      ? store.read().script
      : "hiragana",
    // type: kana → romaji.  choose: kana → romaji, multiple choice.
    // write: romaji → kana, which needs the device's Japanese keyboard.
    mode: MODES.includes(store.read().mode)
      ? store.read().mode
      : (TOUCH ? "choose" : "type"),
    // how the number and calendar drills ask, in the two modes that read
    prompt: PROMPTS.includes(store.read().prompt) ? store.read().prompt : "kanji",
    // how months, dates and times are written — 9月 unless 九月 was chosen
    dates: DATE_FORMS.includes(store.read().dates) ? store.read().dates : "numeral",
    answered: 0, correct: 0, streak: 0, bestStreak: 0,
    missed: [],        // unique wrong cards, chart order
    graded: false,     // answer already scored — waiting to advance
    kbDismissed: false, // user put the on-screen keyboard away; don't force it back
    perf: false,       // Fast: no animation, and no pause after a right answer
    flick: null,       // "vowel" | "key" while a flick drill is running
    numbers: null,     // "count" | "random" while a number drill is running
    calendar: null,    // "week" | "month" | "day" while a calendar drill is running
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

  // What the current run scores as. A flick drill is the only thing that is not
  // one of the three answer modes; a number or calendar drill answers to them
  // like a deck, so its records are keyed by the mode that earned them — and by
  // the prompt form, which is a second thing that changes the question.
  const activeMode = () =>
    (state.flick ? "flick" : recordMode(state.deck, state.mode, state.prompt));

  // Whether the card on screen is answered by picking. Not `activeMode()`,
  // which now carries a suffix, and not `state.mode` alone, which a flick run
  // ignores — a flick answer is always typed whatever the mode says.
  const choosingNow = () => !state.flick && state.mode === "choose";

  // The answer is kana in write and flick alike, so both use the IME field —
  // and writing a number means writing ろく, so numbers are in this too.
  const kanaAnswer = () => state.flick !== null || state.mode === "write";

  // typing and writing are one interaction with the prompt reversed, so they
  // share a submit path — only the field and what counts as correct differ.
  // Typing a *number* answers in digits rather than romaji, and a numeric
  // keypad is a third field rather than an inputmode swap on #input: changing
  // inputmode on a live field does not reliably re-trigger the on-screen
  // keyboard, which is the same reason #kanaInput is separate.
  //
  // Whether the answer is a *number* is the question, not which drill is
  // running: a month and a date are answered with theirs exactly as a number
  // is, and so is a clock time — 3:45 is typed as digits, the colon being a
  // separator rather than a character the keypad would have to carry. A weekday
  // is the one generated prompt that isn't: it answers with its English name,
  // so it takes the plain field a deck takes. Choosing asks this too, where it
  // decides how an option is set.
  const numericAnswer = () =>
    !kanaAnswer() && !answersReading() &&
    (state.numbers !== null || (state.calendar !== null && state.calendar !== "week"));

  // A month, a date or a clock time written 9月, in Typing or Choosing on the
  // kanji prompt. The value is already on the square, so these ask for how it
  // is said instead — romaji on the plain field, or four readings to pick from.
  // Writing already asks with 9月 and answers in kana, and a weekday has no
  // number in it to give away.
  const answersReading = () =>
    state.calendar !== null && state.calendar !== "week" && !state.flick &&
    state.mode !== "write" && state.prompt === "kanji" && state.dates === "numeral";

  // What a pick is graded against: the value, or the reading when that is asked.
  const choiceAnswer = (c) => (answersReading() ? c.cal.reading : c.a);

  const typedField = () =>
    kanaAnswer()
      ? { input: el.kanaInput, submit: el.writeSubmitBtn }
      : numericAnswer()
        ? { input: el.numInput, submit: el.numSubmitBtn }
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

  /* ---------- screens ----------
     Every view is a screen; nothing is a modal. Options, the font picker and
     the chart were <dialog> sheets until a sheet's height cap turned out to be
     the thing deciding whether Sign out was reachable — see CLAUDE.md. As
     screens they scroll like the rest, and on a wide window they are the pane
     beside the deck rail rather than a panel floating over it.

     `data-screen` on <body> is how the stylesheet knows which one is up, which
     is what lets the wide layout keep the menu on screen beside it. */
  const SCREENS = [el.menu, el.play, el.end, el.fatal, el.auth, el.stats,
                   el.options, el.fontPicker, el.chart];

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

  // The three that are reached from somewhere and returned from: Escape leaves
  // them, and while one is up it owns the keyboard.
  const PANELS = [el.options, el.fontPicker, el.chart];
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

    el.chart.dataset.script = chart.id;
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

      // Numbers are the one chart whose readings cannot be looked up — there is
      // no deck of them to look them up *from* — so an item carries all three
      // parts itself. What keeps it honest is that the shipped entries were
      // generated by readNumber(), not typed; the suite regenerates them and
      // fails if the file has drifted.
      if (sec.type === "numbers") {
        // `wide` is one item per row, for readings too long to sit beside
        // another — 12,345 is eighteen kana.
        const list = add(block, "div", "chart--num" + (sec.wide ? " chart--num--wide" : ""));
        (sec.items || []).forEach((item) => {
          const row = add(list, "div", "nrow");
          // Four facts, three columns: the leading cell carries both what the
          // row is — 6, Monday, the 20th — and how that is written, which is
          // what the drill now shows. `x` is optional, so a chart that has no
          // written form for a row simply names it.
          const lead = add(row, "span", "nrow__n");
          // the calendar table is written the way the Dates setting says —
          // 4時20分 or 四時二十分 — so it matches the square beside it
          const x = item.x && chart.id === "calendar" && state.dates === "numeral"
            ? numeralText(item.x) : item.x;
          if (x) add(lead, "span", "nrow__x", x).lang = "ja";
          add(lead, "span", "nrow__id", item.n);
          add(row, "span", "nrow__k", item.q).lang = "ja";
          add(row, "span", "nrow__r", item.a);
        });
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

    // The seal and the line beside it belong to the chart, not to the sheet:
    // "rows follow the gojūon ordering" is false of a table of numbers. The
    // two kana charts carry neither and keep what they always said.
    const note = add(el.chartBody, "p", "chart__note");
    add(note, "span", "chart__seal", chart.seal || "五十音").lang = "ja";
    add(note, "span", "chart__notetext",
        chart.note || "Rows follow the standard gojūon ordering.");
  }

  function openChart() {
    // opens on whichever script the menu is showing
    renderChart(state.script);
    navTo(el.chart);
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

  /* ==========================================================================
     Numbers

     The app's second subject, and the only one that is generated rather than
     dealt: 1 to 1,000,000 is not a card list. kana.json carries the parts a
     reading is built out of — the nine digits, the places 千 百 十, the group
     万 — and readNumber() composes them. No number's sound is written here, for
     the same reason no kana reading is.

     Unlike the flick drills these are **not** their own mode: they answer to
     the same three the decks do, and the mode is what decides which way round a
     prompt goes. That is the whole reason they are decks under a stamp rather
     than a section of drills.

       type    the reading is shown, the digits are typed    "roku" → 6
       choose  the reading is shown, the digits are picked   "roku" → 6
       write   the digits are shown, the kana are typed      6 → ろく

     Which mirrors the decks exactly: type and choose share a direction and
     differ only in how the answer arrives, and write is the reverse of both and
     the one that needs an IME. An earlier version dealt the direction per card
     and ignored the mode — so Typing showed a number half the time and a
     reading the other half, and the answer box changed under you mid-run. Don't
     go back to it: "which way round am I being asked" is a property of the
     mode, and a mode the user chose is the one place that answer belongs.
     ========================================================================== */
  let NUM = null;          // the numbers block of kana.json
  let NUMBER_DECKS = [];   // its drills[], in file order

  // Magnitude bands the random drill deals across. Uniform sampling of
  // 1..1,000,000 is not what "random numbers" should mean here: nine tenths of
  // that range is six digits long, so a run would be twenty variations on one
  // problem and never once ask for 8 or 40. Dealing round-robin over the bands
  // is the same reasoning as flickQueue's — the drill exists to cover the
  // magnitudes, so covering them cannot be left to chance.
  const NUM_BANDS = [
    [1, 9], [10, 99], [100, 999], [1000, 9999], [10000, 99999], [100000, 1000000]
  ];

  // The ceiling, taken from the bands rather than written twice.
  const NUM_MAX = NUM_BANDS[NUM_BANDS.length - 1][1];

  /* ---------- reading a number ---------- */

  // The four-digit group 1..9999, biggest place first. A place drops a leading
  // one — 十 is juu, never ichijuu — which is what separates `places` from
  // `groups` in kana.json, where 万 keeps it.
  //
  // A digit's `alt` is deliberately not carried into a compound. 四 alone is yon
  // or shi, but 四十 is yonjuu and 四百 yonhyaku; accepting shijuu would have the
  // drill agree with something nobody counts with.
  function readGroup(n) {
    const parts = [];
    NUM.places.forEach((place) => {
      const d = Math.floor(n / place.value) % 10;
      if (!d) return;
      const irregular = place.forms && place.forms[String(d)];
      if (irregular) parts.push(irregular);
      else if (d === 1) parts.push(place);
      else {
        const one = NUM.ones[d - 1];
        parts.push({ r: one.r + place.r, k: one.k + place.k });
      }
    });
    const ones = n % 10;
    if (ones) parts.push(NUM.ones[ones - 1]);
    return parts;
  }

  // The whole number, as a list of *chunks* — the units it is spoken in, each
  // one a list of parts. A group takes its whole multiplier with it, because
  // that is what the group word applies to: 999,999 is 九十九万 九千九百九十九,
  // not ninety, nine, ten-thousand. Everything below the last group is one
  // chunk per place.
  //
  // Chunks exist for the display alone; grading walks the parts flat, and the
  // spacing between them is dropped before anything is compared.
  function readNumber(n) {
    let left = n;
    let chunks = [];
    NUM.groups.forEach((group) => {
      const q = Math.floor(left / group.value);
      if (!q) return;
      chunks.push(readGroup(q).concat([group]));
      left = left % group.value;
    });
    if (left) chunks = chunks.concat(readGroup(left).map((part) => [part]));
    return chunks;
  }

  const numParts = (chunks) => chunks.reduce((all, c) => all.concat(c), []);

  // How the value is *written*. Same split as the reading — a place drops a
  // leading one (十, never 一十) and a group keeps it (一万) — which is why one
  // pair of loops does both and why `places` and `groups` stay two lists.
  //
  // Deliberately built from `j` alone, with no reference to `forms`: a form
  // changes how a place sounds (三百 is sanbyaku) and never how it is written,
  // so the kanji cannot drift from the reading by being derived beside it.
  function kanjiGroup(n) {
    let out = "";
    NUM.places.forEach((place) => {
      const d = Math.floor(n / place.value) % 10;
      if (!d) return;
      out += (d === 1 ? "" : NUM.ones[d - 1].j) + place.j;
    });
    const ones = n % 10;
    return ones ? out + NUM.ones[ones - 1].j : out;
  }

  function kanjiNumber(n) {
    let left = n, out = "";
    NUM.groups.forEach((group) => {
      const q = Math.floor(left / group.value);
      if (!q) return;
      out += kanjiGroup(q) + group.j;
      left = left % group.value;
    });
    return left ? out + kanjiGroup(left) : out;
  }

  // The same text with its kanji numerals as digits — 四時二十分 → 4時20分, 月曜日
  // untouched. Read back from `j` in `numbers`, so it knows exactly the numerals
  // kanjiNumber() writes. Places only, not groups: the calendar is the one thing
  // that calls it, and nothing there reaches 万.
  function numeralText(text) {
    const val = new Map();
    NUM.ones.forEach((o, i) => val.set(o.j, { digit: i + 1 }));
    NUM.places.forEach((p) => val.set(p.j, { place: p.value }));
    let out = "", total = 0, cur = 0, run = false;
    const flush = () => {
      if (run) out += total + cur;
      total = cur = 0; run = false;
    };
    for (const ch of text) {
      const v = val.get(ch);
      if (!v) { flush(); out += ch; continue; }
      run = true;
      if (v.digit) cur = v.digit;
      else { total += (cur || 1) * v.place; cur = 0; }   // 十 alone is ten
    }
    flush();
    return out;
  }

  // A chunk is written as one word and the chunks are spaced apart, which is
  // how the number is actually built: "ichiman nisen sanbyaku yonjuu go" shows
  // 一万 二千 三百 四十 五 at a glance, where the run-on romaji real Japanese
  // uses hides the one thing the drill is teaching. Nothing is graded on the
  // spacing — nothing is ever typed in romaji, so it costs nothing.
  const numReading = (chunks) =>
    chunks.map((c) => c.map((p) => p.r).join("")).join(" ");
  const numKana = (chunks) => chunks.map((c) => c.map((p) => p.k).join("")).join("");

  // Thousands separators in the prompt, so a six-digit number can be read at a
  // glance rather than counted. Stripped again before grading.
  const fmtDigits = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, ",");

  /* ---------- grading ---------- */

  // Digits as typed. NFKC folds an IME's full-width ７; everything that isn't a
  // digit goes, which is what lets 1,000,000 and 1000000 both be the answer,
  // and what makes a stray space or a typed comma harmless.
  const normDigits = (s) => s.normalize("NFKC").replace(/[^0-9]/g, "");

  /* Romaji, folded to one spelling of each sound. In order: case, spaces and
     the apostrophe in kin'yōbi; then macrons off, ō → o and ū → u; then the
     y-form jyu → ju; then every way a long vowel gets written down — jū, juu,
     jyuu and ju arrive as the same string, and so do yōka, youka and yooka.

     **Vowel length is therefore not graded on this path**, and that is the
     price of the path existing rather than a bug to fix later. A fold that
     makes those four spellings one answer cannot also tell a long vowel from a
     short one, and demanding a macron from someone typing on a plain keyboard
     is asking them to guess a romanisation convention. The kana path grades
     length exactly, which is one more reason to use the IME where there is one. */
  const normRomaji = (s) => s
    .toLowerCase().trim()
    .replace(/[\s'’\-]/g, "")
    .replace(/ō/g, "o").replace(/ū/g, "u")
    .replace(/jy/g, "j")
    .replace(/ou|oo/g, "o")
    .replace(/uu/g, "u")
    .replace(/aa/g, "a").replace(/ii/g, "i").replace(/ee/g, "e");

  // Every kana spelling one part will answer to, normalised once and cached on
  // the part itself. kana.json shares its parts across every card that uses
  // them, so this is computed once per place rather than once per prompt.
  function numKanaSpellings(part) {
    if (!part._kk) {
      part._kk = [part.k].concat(part.altk || []).map(normKana);
    }
    return part._kk;
  }

  /* Romaji, for the same parts and by the same rule — `alt` beside `r` where
     `altk` sits beside `k`. This is the *second* answer a generated drill takes
     in Writing, and it exists because the drill is otherwise unanswerable
     without a Japanese IME installed, which is a thing about the machine rather
     than about the person practising.

     It is safe here and would not be for a deck. Writing asks a deck with the
     reading — か is asked as "ka" — so accepting romaji there would be typing
     the prompt back; the answer would be the question. A generated drill asks
     with the identity instead, 6 or 20日 or Monday, so "roku" is a real answer
     to it and not an echo. **Romaji is accepted exactly where it is not the
     prompt**, which is the whole rule.

     The cost is vowel length, and it is unavoidable rather than an oversight:
     see normRomaji. */
  function numRomajiSpellings(part) {
    if (!part._rr) {
      part._rr = [part.r].concat(part.alt || []).map(normRomaji);
    }
    return part._rr;
  }

  // Walk the answer against the parts rather than expanding them. 四 is よん or
  // し, 七 なな or しち, 九 きゅう or く, so a seven-part reading has a few
  // hundred spellings between them; matching left to right with a backtrack
  // costs a handful of string compares, and a wrong prefix prunes the rest.
  //
  // Only a bare trailing digit carries alternates, because that is where they
  // are true: 四十 is よんじゅう and never しじゅう. Compounds are built from
  // `k` and `r` alone in readGroup(), so this needs no rule of its own.
  function partsAccept(parts, value, spellings) {
    if (!value) return false;
    const walk = (i, rest) => {
      if (i === parts.length) return rest === "";
      return spellings(parts[i]).some(
        (v) => v && rest.lastIndexOf(v, 0) === 0 && walk(i + 1, rest.slice(v.length)));
    };
    return walk(0, value);
  }

  const numKanaAccepts = (parts, value) =>
    partsAccept(parts, value, numKanaSpellings);
  const numRomajiAccepts = (parts, value) =>
    partsAccept(parts, value, numRomajiSpellings);

  // Wrong answers worth offering in Choosing: the same number with one digit
  // changed, or with two adjacent digits swapped. 45 against 54 and 44 is a
  // question about the reading; 45 against 8 and 1,300 answers itself.
  function numNeighbours(n) {
    const digits = String(n);
    const out = [];
    const keep = (v) => { if (v >= 1 && v <= NUM_MAX && v !== n) out.push(v); };
    for (let i = 0; i < digits.length; i++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === digits[i]) continue;
        if (i === 0 && d === 0 && digits.length > 1) continue;   // no leading zero
        keep(Number(digits.slice(0, i) + d + digits.slice(i + 1)));
      }
      if (i + 1 < digits.length && digits[i] !== digits[i + 1] &&
          !(i === 0 && digits[i + 1] === "0")) {
        const swapped = digits.split("");
        const t = swapped[i]; swapped[i] = swapped[i + 1]; swapped[i + 1] = t;
        keep(Number(swapped.join("")));
      }
    }

    // The ceiling has none of the above: every digit of 1,000,000 that can be
    // changed leaves the range, and its swaps are all zeros. Top up from the
    // value's own magnitude band instead — a wrong answer of the right size,
    // which is the next best thing to a one-digit miss and still never the
    // giveaway of a number half as long.
    if (out.length < 3) {
      const band = NUM_BANDS.find((b) => n >= b[0] && n <= b[1]) || [1, NUM_MAX];
      for (let guard = 0; out.length < 8 && guard < 80; guard++) {
        const v = band[0] + Math.floor(Math.random() * (band[1] - band[0] + 1));
        if (v !== n && out.indexOf(v) < 0) out.push(v);
      }
    }
    return out;
  }

  /* ---------- dealing a run ---------- */

  // `key` is the number itself in both directions, so the progress report pools
  // them: what it has to say is which numbers you don't know, not which of the
  // two ways of asking was slower. logAnswer() prefers it over `q`.
  function numberCard(n) {
    const chunks = readNumber(n);
    const digits = fmtDigits(n);
    return {
      // `q` and `a` are the deck-shaped pair the shared code paths expect: the
      // prompt two of the three modes show, and the answer they take. Write
      // mode swaps them for its own, out of `num` below.
      q: numReading(chunks),
      a: digits,
      key: String(n),
      num: {
        n: n,
        parts: numParts(chunks),      // flat, for numKanaAccepts
        digits: digits, kanji: kanjiNumber(n),
        reading: numReading(chunks), kana: numKana(chunks),
        // What Writing asks with, and what the feedback says the value is. A
        // plain number is both of those by itself; a sum is not — see mathCard.
        ask: digits, ident: digits,
        ord: n                        // counting order, for the misses
      }
    };
  }

  // Distinct values for one run. `count` is the whole range and needs no
  // choosing; `random` deals round-robin across the magnitude bands — see
  // NUM_BANDS. The retry guard matters for the 1–9 band, which cannot hold
  // twenty distinct values and will be asked for four or five.
  function numberValues(deck) {
    if (deck.numbers === "count") {
      const all = [];
      for (let n = 1; n <= deck.max; n++) all.push(n);
      return all;
    }
    const bands = shuffle(NUM_BANDS.slice());
    const seen = new Set();
    const out = [];
    for (let i = 0; out.length < deck.len && i < deck.len * 40; i++) {
      const band = bands[i % bands.length];
      const v = band[0] + Math.floor(Math.random() * (band[1] - band[0] + 1));
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }

  // One card per value. Which way round it is asked is not on the card at all —
  // the mode decides that at render time, so switching mode mid-run would flip
  // every remaining prompt rather than leaving a half-dealt run inconsistent.
  function numberQueue(deck) {
    if (deck.numbers === "math") return mathQueue(deck);
    return shuffle(numberValues(deck)).map(numberCard);
  }

  /* ---------- arithmetic ----------
     Plus, minus, times, divide and percent. A sum is read as the two numbers
     it is made of, each composed exactly as readNumber() already composes it,
     with the operator said between them: 三たす四 is "san tasu yon". Percent is
     the other way round — said after its number and joined to the whole with
     の, 二百の二十五パーセント — and, like a calendar counter, it has values whose
     reading changes as a whole: 十 before パ closes up to じゅっ. kana.json
     carries the words, the signs and the ranges; nothing here spells a sound.

     The answer is the *result*. That keeps the mode rule intact — Typing and
     Choosing read the Japanese and answer with a number on the keypad, Writing
     is shown the sum in signs and answers with how it is said — and it makes
     reading the operator the thing being tested: 八わる二 answered with 16 is a
     word misread, not a slip.

     The operators are in kana, 三たす四 rather than 三足す四. Arithmetic read
     aloud is written that way in teaching material, and it keeps the square
     inside the bundled subsets without four more kanji. */
  const numOp = (id) =>
    ((NUM && NUM.operators) || []).find((o) => o.id === id) || null;

  // A kind a drill may name: one of the operators, or percent.
  const mathKind = (id) => (id === "percent" ? Boolean(NUM && NUM.percent) : Boolean(numOp(id)));

  const between = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

  // The two operands and the result. The ranges are kana.json's; which pairs
  // are allowed is arithmetic, and is here — a minus that stays above zero and
  // a divide that comes out whole, built from its answer rather than filtered.
  function mathOperands(op) {
    if (op.id === "minus") {
      const a = between(op.min + 1, op.max);
      const b = between(op.min, a - 1);
      return { a: a, b: b, n: a - b };
    }
    if (op.id === "divide") {
      const b = between(op.min, op.max), q = between(op.min, op.max);
      return { a: b * q, b: b, n: q };
    }
    const a = between(op.min, op.max), b = between(op.min, op.max);
    return { a: a, b: b, n: op.id === "times" ? a * b : a + b };
  }

  // The card shared by both shapes. `key` is the operator rather than the
  // values: twenty sums are never the same twenty twice, but the five words
  // come round every run, so the report can rank what is actually recurring —
  // that わる is slow — where ranking "20 ÷ 4" would say nothing.
  function mathShape(kind, ord, chunks, kanji, ask, n) {
    const digits = fmtDigits(n);
    return {
      q: numReading(chunks),
      a: digits,
      key: kind,
      num: {
        n: n,
        parts: numParts(chunks),
        digits: digits, kanji: kanji,
        reading: numReading(chunks), kana: numKana(chunks),
        ask: ask, ident: ask + " = " + digits,
        ord: ord * 100000 + n         // grouped by kind, then by result
      }
    };
  }

  function mathCard(kind, ord) {
    if (kind === "percent") return percentCard(ord);
    const op = numOp(kind);
    const v = mathOperands(op);
    // The operator is a part like any other — an object from kana.json with
    // `k`/`r` and their alternates — so numKanaAccepts() walks it without being
    // told it is a word rather than a digit, and プラス is accepted for たす.
    const chunks = readNumber(v.a).concat([[op]], readNumber(v.b));
    return mathShape(kind, ord, chunks,
      kanjiNumber(v.a) + op.k + kanjiNumber(v.b),
      fmtDigits(v.a) + " " + op.sym + " " + fmtDigits(v.b), v.n);
  }

  // "b% of a". Writing asks in that English order and the answer is in the
  // Japanese one, a first — which is the thing about percent worth learning,
  // and the feedback shows both. The bases are multiples of `step`, which with
  // the shipped values keeps every result a whole number; a value that would
  // not is redrawn rather than rounded.
  function percentCard(ord) {
    const pc = NUM.percent;
    const steps = Math.floor((pc.bases.max - pc.bases.min) / pc.bases.step);
    let a = 0, b = 0;
    for (let guard = 0; guard < 40; guard++) {
      a = pc.bases.min + between(0, steps) * pc.bases.step;
      b = pc.values[between(0, pc.values.length - 1)];
      if ((a * b) % 100 === 0) break;
    }
    const irregular = pc.irregular && pc.irregular[String(b)];
    const tail = irregular ? [[irregular]] : readNumber(b).concat([[pc]]);
    const chunks = readNumber(a).concat([[pc.of]], tail);
    return mathShape("percent", ord, chunks,
      kanjiNumber(a) + pc.of.k + kanjiNumber(b) + pc.k,
      b + pc.sym + " of " + fmtDigits(a), (a * b) / 100);
  }

  // Dealt, not sampled: each kind the drill names comes up len / kinds times,
  // for the flick drills' reason — twenty draws at random can leave divide out
  // of a run altogether. The same sum twice in one run is redrawn.
  function mathQueue(deck) {
    const kinds = deck.ops;
    const out = [], seen = new Set();
    for (let i = 0, guard = 0; out.length < deck.len && guard < deck.len * 40; guard++) {
      const kind = kinds[i % kinds.length];
      const c = mathCard(kind, kinds.indexOf(kind));
      if (seen.has(c.num.ident)) continue;
      seen.add(c.num.ident);
      out.push(c);
      i++;
    }
    return shuffle(out);
  }

  // What each kind of number drill says, per mode. Counting asks for the value;
  // a sum asks for the result, which has to be worked out and says so.
  const NUM_ASK = {
    count: { type: "Type the number this reads.",
             choose: "Pick the number this reads.",
             write: "Write this number in kana." },
    math:  { type: "Work it out, then type the answer.",
             choose: "Work it out, then pick the answer.",
             write: "Write how this is read, in kana." }
  };
  const numAsk = () => NUM_ASK[state.numbers === "math" ? "math" : "count"];

  // The prompt spans one character to about fifty — 六 and "rokujūrokuman
  // rokusen kyūhyaku kyūjū kyū" land in the same slot, which nothing else in
  // the app has to cope with. The square is a container, so the glyph is sized
  // in cqw and JS only picks the multiplier; CSS does the arithmetic. Buckets
  // rather than a formula: there are a handful of sizes that matter and a
  // bucket can be looked at.
  //
  // Measured in columns rather than characters, because the prompt now comes in
  // both scripts: "1,000,000" is nine narrow glyphs where 一万二千三百四十五 is
  // nine full-width ones and wants twice the room. Everything from CJK
  // punctuation up is two columns; Latin, digits and ō are one.
  const fitWidth = (text) => {
    let cols = 0;
    for (let i = 0; i < text.length; i++) cols += text.charCodeAt(i) > 0x2E7F ? 2 : 1;
    return cols;
  };
  //
  // Seven columns has a bucket of its own because that is where the two scripts
  // disagree most: 二十日 is three full-width glyphs and "Tuesday" is seven
  // narrow ones, and a column of Latin is wider against the font size than half
  // a full-width glyph is. The kanji can also wrap and be none the worse —
  // 一万二千三百四十五 over two lines is still legible — where a word broken as
  // "Tuesda / y" is just wrong, so the Latin case sets the size.
  //
  // The 12/13 boundary is measured rather than chosen: at 13cqw a thirteenth
  // column is past the square's inner width, so everything from there up takes
  // the next size down. It is the clock that made this visible — 十一時二十五分
  // is fourteen columns — but it was wrong before that, and the three date
  // readings it broke mid-word (nijūrokunichi, nijūhachinichi, sanjūichinichi)
  // are the reason the rule above is about *words* and not about lines.
  const NUM_FIT = [[2, 44], [4, 34], [6, 22], [7, 19], [11, 15], [12, 13],
                   [17, 11], [20, 10], [26, 8]];
  const numFit = (text) => {
    const cols = fitWidth(text);
    const hit = NUM_FIT.find((b) => cols <= b[0]);
    return hit ? hit[1] : 6;
  };

  const deckSize = (deck) =>
    deck.flick ? FLICK_LEN
      : deck.numbers || deck.calendar ? deck.len
      : deck.cards.length;

  /* ==========================================================================
     The calendar

     Weekdays, months and dates. Two thirds of it is counting with something on
     the end: 4月 is the number four plus a counter, 20日 the number twenty plus
     another. So a reading is *composed* exactly as a number's is — readNumber()
     for the value, then the counter — and kana.json writes down only what
     composition gets wrong. That list is `irregular`, keyed by the whole value
     rather than by a digit, because these replace the entire reading and not
     one part of it: 1日 is tsuitachi, 20日 hatsuka, 4月 shigatsu.

     Which values have to be in it is not a matter of taste. 4, 7 and 9 carry
     alternates in `numbers` (yon/shi, nana/shichi, kyuu/ku) and a bare trailing
     digit takes them, so every value ending in one of the three is written out
     — otherwise 17日 would quietly accept juunananichi, which no calendar says.

     Weekdays are not counting at all and are simply listed. What makes them the
     same kind of thing as a date is that both have an *identity* that isn't
     Japanese — the number for a month or a day, the English name for a weekday
     — and that identity is what Typing and Choosing answer with, exactly as the
     number drills answer with digits. Writing runs it the other way and takes
     the kana. That is the rule the whole app turns on: type is a plain
     keyboard, write is the IME, choose is a pick — which is why this is three
     more decks and not a fourth answer mode.
     ========================================================================== */
  let CAL = null;            // the calendar block of kana.json
  let CALENDAR_DECKS = [];   // its drills[], in file order

  const calCounter = (kind) =>
    ((CAL && CAL.counters) || []).find((c) => c.id === kind) || null;

  // What each drill says it wants, per answer mode. Type and choose share a
  // direction and write is the reverse of both, as everywhere else.
  const CAL_ASK = {
    // The weekdays are the one drill that takes a stem — every one of them ends
    // in the same ようび, so what is being asked for is the part in front. Said
    // in general terms rather than by example: naming the stem would name the
    // answer. See kana.json's `altk` on each weekday.
    week:  { type: "Type the day this reads.",
             choose: "Pick the day this reads.",
             write: "Write this day — its first part is enough." },
    month: { type: "Type the month this reads.",
             choose: "Pick the month this reads.",
             write: "Write this month in kana.",
             sayType: "Type how this month is said.",
             sayChoose: "Pick how this month is said." },
    day:   { type: "Type the date this reads.",
             choose: "Pick the date this reads.",
             write: "Write this date in kana.",
             sayType: "Type how this date is said.",
             sayChoose: "Pick how this date is said." },
    hour:  { type: "Type the hour this reads.",
             choose: "Pick the hour this reads.",
             write: "Write this hour in kana.",
             sayType: "Type how this hour is said.",
             sayChoose: "Pick how this hour is said." },
    minute:{ type: "Type the minutes this reads.",
             choose: "Pick the minutes this reads.",
             write: "Write these minutes in kana.",
             sayType: "Type how these minutes are said.",
             sayChoose: "Pick how these minutes are said." },
    second:{ type: "Type the seconds this reads.",
             choose: "Pick the seconds this reads.",
             write: "Write these seconds in kana.",
             sayType: "Type how these seconds are said.",
             sayChoose: "Pick how these seconds are said." },
    // The clock's identity has a colon in it and a numeric keypad has no colon
    // key, so the field takes the digits either way — see readClock(). The
    // placeholder is what says so, rather than this line naming a format.
    time:  { type: "Type the time this reads.",
             choose: "Pick the time this reads.",
             write: "Write this time in kana.",
             sayType: "Type how this time is said.",
             sayChoose: "Pick how this time is said." },
    // 午前 and 午後 are answered on the 24-hour clock, the one way to say "pm"
    // on a keypad. The line names that clock, or 午後3時45分 would read as a
    // request for 3:45.
    meridiem: { type: "Type this time on the 24-hour clock.",
                choose: "Pick this time on the 24-hour clock.",
                write: "Write this time in kana.",
                sayType: "Type how this time is said.",
                sayChoose: "Pick how this time is said." }
  };
  const calAsk = () => CAL_ASK[state.deck.meridiem ? "meridiem" : state.calendar];

  // The reading as the flat list of parts numKanaAccepts() walks. An irregular
  // value is a single part — the whole word — which is also what puts its
  // `altk` in the right place: alternates belong to what is actually said, and
  // nothing composed here has any, because everything that would have taken one
  // is listed instead.
  function calParts(kind, n) {
    const counter = calCounter(kind);
    const irregular = counter.irregular && counter.irregular[String(n)];
    if (irregular) return [irregular];
    return numParts(readNumber(n)).concat([counter]);
  }

  // A date is one word — nijuuyokka, never "nijuu yokka". Numbers space their
  // chunks apart to show how the value is built; the counter welds it into a
  // unit, so that spacing would be describing a structure the word no longer
  // has. Nothing is graded on it either way; nothing here is answered in romaji.
  const calJoin = (parts, key) => parts.map((p) => p[key]).join("");

  // A clock time is the exception, and it is two words rather than one: 三時
  // 四十五分 is "sanji yonjūgofun", the hour said and then the minute. So a
  // reading is built from *chunks* the way a number's is — one chunk per
  // counter — and only the romaji keeps the space between them. The kana runs
  // together as it is written, and grading never sees either: partsAccept()
  // walks the parts flat and normRomaji drops spaces anyway.
  const chunkJoin = (chunks, key, sep) =>
    chunks.map((c) => calJoin(c, key)).join(sep);

  const clockIdent = (h, m) => h + ":" + (m < 10 ? "0" : "") + m;

  // The two counters a clock time is built from, named by the drill rather than
  // written in here: an id belongs to the content, like every reading it
  // carries. Both are composed exactly as a month or a date is — 四時 is the
  // number four plus 時, 四十五分 the number forty-five plus 分 — so the clock
  // adds no way of reading a value, only the joining of two of them.
  //
  // 半 is an alternate on the minute and not a second reading of the time: 三時
  // 半 and 三時三十分 are the same clock face. It is merged onto a *copy*, since
  // kana.json shares its part objects between cards and caches their spellings
  // on them, and only where the minute is a single part — which is what being
  // listed in `irregular` makes it. A bare 三十分 is さんじゅっぷん and never
  // はん, so this must not reach the minutes drill, and it doesn't.
  function timeChunks(deck, h, m) {
    const chunks = [calParts(deck.counters[0], h)];
    if (!m) return chunks;                       // 三時, with nothing after it
    const parts = calParts(deck.counters[1], m);
    const half = calCounter(deck.counters[1]).half;
    if (half && m === half.n && parts.length === 1) {
      const only = parts[0];
      chunks.push([{
        r: only.r, k: only.k,
        alt: (only.alt || []).concat([half.r]),
        altk: (only.altk || []).concat([half.k])
      }]);
      return chunks;
    }
    chunks.push(parts);
    return chunks;
  }

  // A typed clock time, as {h, m}, or null. The minutes are the last two digits
  // and the hour is whatever is in front of them, so 3:45, 345 and 03:45 all
  // arrive as the same pair. That is what lets the numeric keypad answer a
  // prompt whose identity has a colon in it: a phone keyboard has no colon key,
  // and asking for one would leave the drill unanswerable on the device it is
  // most likely to be used on.
  function readClock(digits) {
    if (digits.length < 3 || digits.length > 4) return null;
    return { h: Number(digits.slice(0, -2)), m: Number(digits.slice(-2)) };
  }

  // One card per value. Which way round it is asked is not on the card — the
  // mode decides that at render time, exactly as it does for a number.
  //
  // `key` is the identity, which is what the card is *about*: the report should
  // say you are slow on the 20th, not rank "hatsuka" against "20".
  // The English a value stands for: a weekday and a month have a name, a date
  // has an ordinal, which is a rule about the number rather than a word to be
  // written down — the same reason fmtDigits() is code and not content.
  function calEnglish(kind, entry) {
    if (kind === "week") return entry.en;
    if (kind === "time") return clockIdent(entry.h, entry.m);
    const names = calCounter(kind).names;
    if (names) return names[entry.n - 1];
    // An hour is named by the clock face it makes and a minute by how many of
    // them there are — both rules about the number, like the ordinal below, and
    // neither a word anyone had to write down.
    if (kind === "hour") return clockIdent(entry.n, 0);
    if (kind === "minute") return entry.n + " min";
    if (kind === "second") return entry.n + " sec";
    const n = entry.n, tens = n % 100;
    const suffix = tens > 10 && tens < 14 ? "th"
      : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
    return "the " + n + suffix;
  }

  function calendarCard(deck, entry) {
    const kind = deck.calendar;
    const week = kind === "week";
    const time = kind === "time";
    // 午前 or 午後, where the drill names the half of the day: a word of its own
    // said before the hour, and the 24-hour clock is the identity it stands for
    const mer = time && entry.mer ? entry.mer : null;
    const h24 = time ? entry.h + (mer ? mer.from : 0) : null;
    // One chunk per counter, which is one chunk for everything but the clock.
    const chunks = time ? (mer ? [[mer]] : []).concat(timeChunks(deck, entry.h, entry.m))
      : [week ? [entry] : calParts(kind, entry.n)];
    const parts = chunks.reduce((all, c) => all.concat(c), []);
    const ident = time ? clockIdent(h24, entry.m)
      : week ? entry.en : String(entry.n);
    // How it is written: 月曜日 as listed, or the value in kanji with its
    // counter — 二十日, 四月, and 三時四十五分, which is two of them. Nothing
    // writes those out; `j` in `numbers` already says how a value is written
    // and kanjiNumber() composes it. An o'clock has no minute to write.
    const face = week ? entry.ja
      : time ? (mer ? mer.j : "") + kanjiNumber(entry.h) + calCounter(deck.counters[0]).suffix +
               (entry.m ? kanjiNumber(entry.m) + calCounter(deck.counters[1]).suffix : "")
      : kanjiNumber(entry.n) + calCounter(kind).suffix;
    // …and the same with the value in digits — 9月, 20日, 3時45分 — which is how
    // it is printed nearly everywhere outside a textbook. The Dates setting
    // picks between the two; see calFace().
    const numeral = week ? entry.ja
      : time ? (mer ? mer.j : "") + entry.h + calCounter(deck.counters[0]).suffix +
               (entry.m ? entry.m + calCounter(deck.counters[1]).suffix : "")
      : entry.n + calCounter(kind).suffix;
    return {
      // the deck-shaped pair every shared path expects: the romaji reading two
      // of the three modes prompt with, and the identity they take
      q: chunkJoin(chunks, "r", " "),
      a: ident,
      key: ident,
      cal: {
        kind: kind,
        // the counted value, where there is exactly one of them: a weekday
        // isn't counted at all and a clock time is counted twice, so both
        // carry null here and are told apart by `kind` rather than by this
        n: week || time ? null : entry.n,
        h: time ? entry.h : null,
        m: time ? entry.m : null,
        h24: h24,                          // what a typed clock answer is checked against
        mer: mer,
        ord: week ? entry.i                // the order the material has
          : time ? h24 * 60 + entry.m      // round the face, or round the day
          : entry.n,
        ident: ident,
        // Monday, April, the 20th, 3:45 — and "3:45 pm (15:45)", which names
        // both clocks, since how the two relate is what that drill teaches
        en: mer ? clockIdent(entry.h, entry.m) + " " + mer.en + " (" + ident + ")"
          : calEnglish(kind, entry),
        face: face,                        // 月曜日, 四月, 二十日, 三時四十五分
        numeral: numeral,                  // 月曜日, 4月, 20日, 3時45分
        // Writing asks with the identity, in the plain script — Monday, 3:45,
        // or the value with its counter after it, 20日 and 4月. Asking with
        // 二十日 there would be the same question the other two modes ask,
        // since the kanji is what they show; the counter still has to be named,
        // or "20" could want either はつか or にじゅう. A clock time needs no
        // such help: nothing else is written 3:45.
        // A 午前/午後 time asks with "3:45 pm": the words are what is being
        // written, and a 24-hour prompt would make the question arithmetic.
        ask: mer ? clockIdent(entry.h, entry.m) + " " + mer.en
          : week || time ? ident : numeral,
        askLang: week || time ? "en" : "ja",
        parts: parts,
        kana: chunkJoin(chunks, "k", ""),
        reading: chunkJoin(chunks, "r", " ")
      }
    };
  }

  // What a drill asks: the whole range of its counter, or the values kana.json
  // names for it. A drill with `values` is a subset of the same material and
  // not a second kind of thing — the native dates are thirteen of the same
  // thirty-one, composed, graded and reported exactly as they are in the full
  // drill, and the only thing that changes is which of them come up.
  const calPool = (deck) => {
    if (deck.values) return deck.values;
    const out = [];
    for (let n = 1; n <= calCounter(deck.calendar).max; n++) out.push(n);
    return out;
  };

  // Every value once, shuffled. A calendar is a fixed set — seven days, twelve
  // months, thirty-one dates, or the thirteen a drill picks out of them — so
  // there is nothing to sample and no magnitude band to deal across.
  function calendarQueue(deck) {
    const kind = deck.calendar;
    if (kind === "week") {
      return shuffle((CAL.weekdays || []).map((w, i) =>
        calendarCard(deck, Object.assign({ i: i }, w))));
    }
    if (kind === "time") {
      return shuffle(timeValues(deck).map((v) => calendarCard(deck, v)));
    }
    return shuffle(calPool(deck).map((n) => calendarCard(deck, { n: n })));
  }

  // The clock is the one calendar drill with more values than a run: twelve
  // hours against twelve marks is 144 faces, and a run asks twenty. So they are
  // *dealt* rather than sampled — each list cycled through in a shuffled order,
  // so every hour is asked before any hour is asked twice and the same for the
  // marks. Sampling twenty of 144 at random can leave 四時 or 七時 out of a run
  // altogether, which is the same argument that deals the flick prompts.
  function timeValues(deck) {
    const hours = deck.hours ? deck.hours.slice() : [];
    if (!deck.hours) for (let h = 1; h <= calCounter(deck.counters[0]).max; h++) hours.push(h);
    // 午前 and 午後 are dealt the same way, so a run is half of each
    const halves = deck.meridiem ? CAL.meridiem : [null];
    const out = [], seen = new Set();
    let hs = [], ms = [], ds = [];
    for (let guard = 0; out.length < deck.len && guard < deck.len * 40; guard++) {
      if (!hs.length) hs = shuffle(hours.slice());
      if (!ms.length) ms = shuffle(deck.minutes.slice());
      if (!ds.length) ds = shuffle(halves.slice());
      const h = hs.pop(), m = ms.pop(), mer = ds.pop();
      const id = clockIdent(h, m) + (mer ? mer.id : "");
      if (seen.has(id)) continue;       // the same face twice in one run
      seen.add(id);
      out.push(mer ? { h: h, m: m, mer: mer } : { h: h, m: m });
    }
    return out;
  }

  // Wrong times worth offering: the marks either side, then the same minute an
  // hour or two away, then the hours that sound alike — 四時 against 七時. The
  // face wraps, so 12:55 is five minutes from 1:00 and is offered as one.
  // Everything is checked back against the drill's own marks, for the reason
  // calNeighbours() deals from its pool.
  const CLOCK_FACE = 12 * 60;
  function timeNeighbours(deck, h, m) {
    const out = [], self = clockIdent(h, m);
    const at = (h % 12) * 60 + m;
    const keep = (t) => {
      t = ((t % CLOCK_FACE) + CLOCK_FACE) % CLOCK_FACE;
      const mm = t % 60;
      if (deck.minutes.indexOf(mm) < 0) return;
      const id = clockIdent(Math.floor(t / 60) || 12, mm);
      if (id !== self && out.indexOf(id) < 0) out.push(id);
    };
    [5, -5, 60, -60, 10, -10, 120, -120, 180, -180, 15, -15]
      .forEach((d) => keep(at + d));
    return out;
  }

  // A time identity read back into what a card is built from. On the 24-hour
  // clock the half of the day is whichever 午前/午後 starts at or before the
  // hour, which is what each one's `from` in kana.json says.
  function timeEntry(deck, ident) {
    const t = ident.split(":").map(Number);
    if (!deck.meridiem) return { h: t[0], m: t[1] };
    const mer = CAL.meridiem.slice().sort((a, b) => b.from - a.from)
      .find((x) => t[0] >= x.from);
    return { h: t[0] - mer.from, m: t[1], mer: mer };
  }

  // Wrong answers for a 午前/午後 time, on the 24-hour clock. The same face in
  // the other half of the day comes first and is always offered — 午前 against
  // 午後 is the whole of what this drill adds — then the clock's own
  // neighbours, kept in this half and to the hours the drill asks.
  function meridiemNeighbours(deck, c) {
    const other = CAL.meridiem.find((x) => x !== c.cal.mer);
    const out = [clockIdent(c.cal.h + other.from, c.cal.m)];
    timeNeighbours(deck, c.cal.h, c.cal.m).forEach((id) => {
      const t = id.split(":").map(Number);
      if (deck.hours && deck.hours.indexOf(t[0]) < 0) return;
      const v = clockIdent(t[0] + c.cal.mer.from, t[1]);
      if (out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }

  // Wrong answers worth offering in Choosing: the dates around this one, then
  // the one a week or ten days away. Nearest-first rather than numNeighbours'
  // digit surgery, which over a range of 31 would offer 10 and 30 for the 20th
  // and never 19 — the two you actually mix up.
  //
  // They are drawn from `pool` — the values this drill asks — and not from the
  // counter's whole range. Offering the 19th against はつか in a drill that
  // only ever asks thirteen dates answers the question for anyone who knows
  // which thirteen those are, which is the same giveaway numNeighbours() tops
  // up its band to avoid.
  function calNeighbours(n, pool) {
    const out = [];
    const keep = (v) => {
      if (v !== n && pool.indexOf(v) >= 0 && out.indexOf(v) < 0) out.push(v);
    };
    [1, -1, 2, -2, 7, -7, 10, -10, 3, -3].forEach((d) => keep(n + d));
    // a pool too small or too sparse for those offsets to fill: nearest first,
    // so a subset falls back to the values around this one rather than to 1
    pool.slice().sort((a, b) => Math.abs(a - n) - Math.abs(b - n)).forEach(keep);
    return out;
  }

  // How it is written, then what it is, then how it is said — the same three
  // in the same order for a number and for a date, and in whichever direction
  // the card was asked. The pair is the fact worth repeating; which half was on
  // the square is not.
  const says = (written, what) =>
    '<span lang="ja">' + written + "</span> is " + what + " — ";
  // The written half in whichever form the Dates setting shows, so the answer
  // reads the way the square did.
  const calFace = (c) => (state.dates === "numeral" ? c.cal.numeral : c.cal.face);
  const calSays = (c) => says(calFace(c), c.cal.en);
  const numSays = (c) => says(c.num.kanji, c.num.ident);

  /* ==========================================================================
     Derived decks

     Decks with no cards of their own, built here from the source decks they
     name in kana.json. Two shapes of them ship: a per-script mix (all three
     hiragana decks, all three katakana decks) and the whole `kana` stamp —
     base, dakuten and yōon each across both scripts, plus everything at once.

     They hold the source decks' *own card objects*, not copies. Identity is
     what `state.missed.includes(c)` and the chart-order review on the results
     screen both rely on. The other side of that is that nothing which walks
     every card in the app — chart readings, the flick index — may ever be
     handed one of these, or it counts characters two and three times over;
     `state.decks` therefore stays the decks kana.json actually lists, and the
     derived ones are kept beside it in `state.derived`.

     Ordering a run is the part that isn't a plain shuffle. Shuffle a source
     deck's worth of cards together and it deals visible clumps — eight yōon,
     then a stretch of katakana base — and a clump is the source deck arriving
     again, which is the one thing these decks exist not to do. So each source
     is a category, each is shuffled on its own, and they are dealt out under a
     single rule: never more than MIX_RUN in a row from the same category.
     Nothing is sampled and nothing is dropped — this decides order alone.
     ========================================================================== */
  const MIX_RUN = 2;   // consecutive cards allowed from one category

  function buildDerivedDecks(defs) {
    return (defs || []).map((def) => {
      const mix = (def.sources || [])
        .map((id) => state.decks.find((d) => d.id === id))
        .filter(Boolean);
      // One category is not a mix; it would also make mixFits() meaningless.
      // A deck whose sources have gone from kana.json is dropped rather than
      // offered as an empty run.
      if (mix.length < 2) return null;

      const groupOf = new Map();
      const cards = [];
      mix.forEach((d) => d.cards.forEach((c) => { groupOf.set(c, d); cards.push(c); }));

      return {
        id: def.id,
        label: def.label || def.id,
        sample: def.sample || "",
        subtitle: def.subtitle || "",
        note: def.note || "",
        // Placed under a stamp by the same field a real deck uses. "kana" is
        // the third stamp — material that is both scripts at once — and is a
        // script like the other two as far as everything downstream is
        // concerned, which is what keeps the filters single-clause.
        script: def.script || null,
        mix: mix,               // one category per source deck, in listed order
        groupOf: groupOf,
        cards: cards,
        // Whether a romaji prompt is ambiguous here, worked out rather than
        // declared: か and カ are both "ka", so a deck spanning both scripts has
        // to say which it wants. See writeAsk().
        spansScripts: new Set(mix.map((d) => d.script)).size > 1
      };
    }).filter(Boolean);
  }

  // Every deck the menu can start, real and derived.
  // Every deck the menu can start, and the one list the stamp filters run over.
  // The number and calendar drills join it because they carry a `script` like
  // anything else; they are safe here for the reason the rule below is about —
  // they have no `cards` at all, and nothing that counts characters uses this.
  const allDecks = () =>
    state.decks.concat(state.derived, NUMBER_DECKS, CALENDAR_DECKS);

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
      (bestMs ? ", fastest clean run " + fmtTime(bestMs) : ""));

    b.innerHTML =
      '<span class="deck__sample" lang="ja">' + deck.sample + "</span>" +
      '<span><span class="deck__name">' + deck.label + "</span>" +
      '<span class="deck__meta">' + deck.subtitle + " · " + size + unit + "</span></span>" +
      '<span class="deck__best" title="Your best in ' + modeLabel(mode) + '">' +
        '<span class="deck__pct">' + (best ? best + "%" : "—") + "</span>" +
        (bestMs ? '<span class="deck__time" title="Fastest run with no mistakes">' +
                  fmtTime(bestMs) + "</span>" : "") +
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
    // the mode lives behind the Options sheet now, so the button that opens it
    // carries the current value — otherwise it is invisible from the menu
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

  /* ---------- run ---------- */
  function start(deck, cards) {
    state.deck = deck;
    state.flick = deck.flick || null;
    state.numbers = deck.numbers || null;
    state.calendar = deck.calendar || null;
    state.isDrill = Boolean(cards);
    // A flick run is generated, not dealt from a deck; a drill of one narrows
    // the generator to the groups that were missed. A drill is a plain shuffle
    // whatever the deck: balancing a handful of cards says nothing, and a drill
    // of five misses that all came from one category has no other category to
    // interleave with.
    state.queue = state.flick
      ? flickQueue(state.flick, (cards || []).map((c) => c.flick.group))
      : cards && cards.length ? shuffle(cards)
      // A number drill is generated too, but a drill of one is just its misses
      // dealt again — the cards above — so this sits below that branch, where
      // flick's sits above it.
      : state.numbers ? numberQueue(deck)
      : state.calendar ? calendarQueue(deck)
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
      // `key` is what a card is *about* where that isn't its prompt: a number
      // asked both ways is one thing you either know or don't, and the report
      // should say "you are slow on 8", not rank "8" against "hachi".
      q: String(c.key || c.q).slice(0, 16),
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

    // A number or a calendar run is one of the three modes like a deck is;
    // only the flick drills sit outside them.
    const numbering = state.numbers !== null;
    const calendaring = state.calendar !== null;
    const flicking = state.flick !== null;
    const writing = !flicking && state.mode === "write";
    const choosing = !flicking && state.mode === "choose";
    // The generated drills ask in whichever script the Prompt setting says —
    // 二十日 or "hatsuka", 六 or "roku". Writing is untouched by it: that
    // direction asks with the identity and answers in kana.
    const reading = state.prompt === "reading";
    const text =
      calendaring ? (writing ? c.cal.ask : reading ? c.cal.reading : calFace(c)) :
      numbering ? (writing ? c.num.ask : reading ? c.num.reading : c.num.kanji) :
      flicking ? c.q : writing ? c.a : c.q;
    // Latin prompt in every case but reading Japanese. Both generated subjects
    // read the same way round: Typing and Choosing show the kanji — 六, 二十日,
    // 月曜日 — and answer with what it stands for, and Writing shows that and
    // answers in kana. So only Writing is Latin here, and for a weekday, whose
    // identity is a word rather than a number, only Writing's prompt is.
    const latinPrompt = calendaring
      ? (writing ? c.cal.askLang === "en" : reading)
      : numbering ? (writing || reading)
      : flicking || writing;

    el.square.classList.remove("is-correct", "is-wrong", "is-graded");
    el.glyph.textContent = text;
    el.glyph.lang = latinPrompt ? "en" : "ja";
    // Two kana in the square — きゃ — and not two of anything else: a generated
    // prompt is long by nature and sizes itself through --fit just below.
    el.glyph.classList.toggle("is-pair",
      !latinPrompt && !numbering && !calendaring && text.length > 1);
    el.glyph.classList.toggle("is-romaji", latinPrompt);
    // Nothing else in the app has a prompt that runs from one character to
    // forty-five, so a generated prompt is the one that picks its own size —
    // measured off what is actually on screen, which differs by mode.
    el.glyph.classList.toggle("is-number", numbering || calendaring);
    el.glyph.style.setProperty("--fit",
      numbering || calendaring ? numFit(text) : "");
    el.feedback.textContent =
      calendaring ? calAsk()[answersReading()
        ? (choosing ? "sayChoose" : "sayType") : state.mode] :
      numbering ? numAsk()[state.mode] :
      flicking ? (state.flick === "vowel"
                    ? "Any character that ends in this vowel."
                    : "Any character from this key.") :
      state.mode === "type"   ? "Type the sound this character makes." :
      state.mode === "choose" ? "Pick the sound this character makes."
                              : writeAsk();

    el.mProgress.innerHTML = (state.i + 1) + "<small>/" + state.queue.length + "</small>";
    updateStats();

    // Typing a number answers in digits, and so does typing a month or a date,
    // so all three take the numeric field where a deck takes the romaji one — a
    // weekday answers with its English name and takes the romaji field like a
    // deck. Writing is kana in every case, and Choosing has no field at all.
    const typing = !flicking && !writing && !choosing;
    const keypad = numericAnswer();
    el.typeMode.classList.toggle("hidden", !typing || keypad);
    el.numberMode.classList.toggle("hidden", !typing || !keypad);
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
      // The IME reminder has to survive on touch, where the keyboard hint is
      // deliberately suppressed — hence the different class. A generated drill
      // takes romaji as well, and says so: without that line the mode looks
      // broken on a machine with no Japanese input installed.
      const ime = kanaAnswer();
      const either = ime && (numbering || calendaring);
      el.typedHint.textContent = !ime ? "Enter ↵ to check"
        : either ? "Kana or romaji" : "Japanese keyboard";
      el.typedHint.className = ime ? "hint hint--ime" : "hint hint--keys";

      const f = typedField();
      f.input.value = "";
      // The keypad is shared by three subjects that want different shapes of
      // number, and the clock is the one whose answer has two parts — say so
      // here rather than in the instruction line, which would be naming the
      // format of the answer right above the question.
      if (keypad) {
        const clock = state.calendar === "time";
        el.numInput.placeholder = clock ? (state.deck.meridiem ? "hh:mm, 24-hour…" : "h:mm…")
          : "digits…";
        el.numInput.setAttribute("aria-label",
          clock ? "Type the time in digits" : "Type the number in digits");
      }
      f.submit.textContent = "Check";
      // Never disable or blur the field: on a phone that dismisses the
      // keyboard between every card. state.graded gates input instead.
      // Focus every card unconditionally — only refocusing when focus happened
      // to still be in the box meant tapping the box again for every single
      // character on a phone.
      focusField(f.input);
    }
  }

  // Writing asks with the sound alone, and across scripts a sound is not enough
  // to identify a character: か and カ are both "ka". A deck that spans both
  // therefore names the one it wants rather than leaving it to be guessed, and
  // writeAccepts() holds the answer to the same scope. A deck inside one script
  // — including Mixed hiragana — has nothing to disambiguate and says nothing.
  function writeAsk() {
    if (state.numbers) return numAsk().write;
    if (state.calendar) return calAsk().write;
    const g = cardGroup(card());
    return state.deck.spansScripts && g.script
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
    // Leaving the play screen moves focus by itself — that is the app's doing
    // and not a decision to put the keyboard away, so it must not be recorded
    // as one. (It was `a sheet is open` while these were dialogs.)
    if (el.play.classList.contains("hidden")) return;
    state.kbDismissed = true;
  }

  function buildChoices(c) {
    // Numbers have no deck of cards to draw distractors from, so they are
    // generated: the same value with one digit changed or two swapped. Drawing
    // any four numbers would make the option obvious from its length alone —
    // "roku" beside 6, 400 and 12,000 is not a question about the reading.
    // The calendar generates its distractors too: the dates either side of this
    // one, or the rest of the week. Four dates drawn at random would be
    // answerable from the length of the reading alone.
    if (state.calendar) {
      // `kind`, never `n`: a weekday and a clock time both carry null there,
      // one because it is not counted and the other because it is counted twice
      const near = c.cal.kind === "week"
        ? shuffle((CAL.weekdays || []).filter((w) => w.en !== c.cal.ident))
            .map((w) => w.en)
        : c.cal.mer
        // the other half of the day stays first, so slice(0, 3) always keeps it
        ? ((n) => n.slice(0, 1).concat(shuffle(n.slice(1, 6))))(meridiemNeighbours(state.deck, c))
        : c.cal.kind === "time"
        ? shuffle(timeNeighbours(state.deck, c.cal.h, c.cal.m).slice(0, 6))
        : shuffle(calNeighbours(c.cal.n, calPool(state.deck)).slice(0, 6))
            .map(String);
      // Under 9月 the options are how the same neighbours are said, built as
      // cards of their own so the readings come from the same composition.
      const reads = answersReading();
      const said = (ident) => calendarCard(state.deck,
        c.cal.kind === "time" ? timeEntry(state.deck, ident) : { n: Number(ident) }).cal.reading;
      buildChoiceButtons(shuffle(near.slice(0, 3)
        .map((a) => ({ a: reads ? said(a) : a }))
        .concat({ a: choiceAnswer(c) })), c);
      return;
    }

    if (state.numbers) {
      const taken = new Set([c.a]);
      const pool = [];
      shuffle(numNeighbours(c.num.n)).forEach((v) => {
        const label = fmtDigits(v);
        if (pool.length >= 3 || taken.has(label)) return;
        taken.add(label); pool.push({ a: label });
      });
      buildChoiceButtons(shuffle(pool.concat({ a: c.a })), c);
      return;
    }

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
    buildChoiceButtons(shuffle(pool.concat(c)), c);
  }

  // Shared by both draws above: an option is anything with an `a`, and `a` is
  // what pick() grades against, so a generated number option needs nothing else.
  function buildChoiceButtons(opts, c) {
    el.choices.innerHTML = "";
    opts.forEach((o, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice" + (numericAnswer() ? " choice--num" : "");
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

    // Numbers, in whichever of the two typed modes. Writing takes the kana and
    // accepts every reading the value has — 4 is よん or し — while Typing takes
    // the digits and drops anything that is not one, so 1,000,000 and 1000000
    // are the same answer.
    // The calendar, in whichever of the two typed modes. Writing takes the kana
    // and accepts every reading the value has — 17日 is juushichinichi or
    // juunananichi — while Typing takes the identity, which is the number for a
    // month or a date and the English name for a weekday.
    if (state.calendar) {
      const field = typedField().input;
      let value, right;
      if (state.mode === "write") {
        value = normKana(field.value);
        if (!value) return;
        // kana if there is an IME, romaji if there isn't — the prompt is 20日,
        // so はつか and "hatsuka" are both answers to it rather than echoes
        right = numKanaAccepts(c.cal.parts, value) ||
                numRomajiAccepts(c.cal.parts, normRomaji(field.value));
      } else if (answersReading()) {
        // 9月 on the square: the value is showing, so the answer is how it is
        // said — romaji from a plain keyboard, or kana if an IME is to hand
        value = field.value.trim();
        if (!value) return;
        right = numRomajiAccepts(c.cal.parts, normRomaji(value)) ||
                numKanaAccepts(c.cal.parts, normKana(value));
      } else if (c.cal.kind === "week") {
        value = norm(field.value);
        if (!value) return;
        right = value === norm(c.cal.ident);
      } else if (c.cal.kind === "time") {
        // the digits either way — "3:45" and "345" are one answer, because a
        // numeric keypad cannot type the colon the identity is written with
        value = normDigits(field.value);
        if (!value) return;
        const t = readClock(value);
        right = Boolean(t) && t.h === c.cal.h24 && t.m === c.cal.m;
      } else {
        value = normDigits(field.value);
        if (!value) return;
        right = Number(value) === c.cal.n;
      }
      logAnswer(c, value.slice(0, 64), right, false);
      if (right) markCorrect(); else markWrong(c, false);
      return;
    }

    if (state.numbers) {
      const field = typedField().input;
      if (state.mode === "write") {
        const value = normKana(field.value);
        if (!value) return;
        const right = numKanaAccepts(c.num.parts, value) ||
                      numRomajiAccepts(c.num.parts, normRomaji(field.value));
        logAnswer(c, value.slice(0, 64), right, false);
        if (right) markCorrect(); else markWrong(c, false);
      } else {
        const value = normDigits(field.value);
        if (!value) return;
        const right = Number(value) === c.num.n;
        logAnswer(c, value, right, false);
        if (right) markCorrect(); else markWrong(c, false);
      }
      return;
    }

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
    const want = state.calendar ? choiceAnswer(c) : c.a;
    logAnswer(c, opt.a, opt.a === want, false);
    if (opt.a === want) {
      btn.classList.add("is-picked-ok");
      markCorrect();
    } else {
      btn.classList.add("is-picked-no");
      const right = Array.from(el.choices.children).find((b) => b.dataset.a === want);
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
    // A number is always confirmed the same way round — digits, then kana, then
    // reading — whichever direction it was asked in. The pair is the fact worth
    // repeating; which half was on the card is not.
    el.feedback.innerHTML = state.calendar
      ? '<span class="ok">Correct — ' + calSays(c) + '<b lang="ja">' +
        c.cal.kana + '</b> “' + c.cal.reading + '”.</span>'
      : state.numbers
      ? '<span class="ok">Correct — ' + numSays(c) + '<b lang="ja">' +
        c.num.kana + '</b> “' + c.num.reading + '”.</span>'
      : state.flick
      ? '<span class="ok">Correct — <b lang="ja">' + shown + "</b> " +
        (state.flick === "vowel" ? "ends in " : "is on ") + c.q + ".</span>"
      : '<span class="ok">Correct — <b lang="ja">' + shown +
        '</b> is “' + c.a + '”.</span>';
    updateStats();
    state.timer = setTimeout(next, revealDelay());
  }

  function markWrong(c, viaReveal, typed) {
    state.answered++;
    state.streak = 0;
    state.graded = true;
    if (!state.missed.includes(c)) state.missed.push(c);

    el.square.classList.remove("is-correct");
    el.square.classList.add("is-wrong", "is-graded");

    const tail = TOUCH ? "Tap to continue."
      : !choosingNow() ? "Press Enter to continue." : "";

    if (state.calendar) {
      el.feedback.innerHTML =
        (viaReveal ? "" : '<span class="no">Not quite. </span>') +
        calSays(c) + '<b lang="ja">' + c.cal.kana + '</b> “<span class="no">' +
        c.cal.reading + '</span>”. ' + tail;
    } else if (state.numbers) {
      el.feedback.innerHTML =
        (viaReveal ? "" : '<span class="no">Not quite. </span>') +
        numSays(c) + '<b lang="ja">' + c.num.kana + '</b> “<span class="no">' +
        c.num.reading + '</span>”. ' + tail;
    } else if (state.flick) {
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

    if (!choosingNow()) {
      const f = typedField();
      // show the answer in the field the user was answering in: a worked example
      // for flick, the kana when writing, the romaji when typing
      f.input.value = state.flick ? c.a.split(" ")[0]
        : state.numbers ? (state.mode === "write" ? c.num.kana : c.num.digits)
        : state.calendar ? (state.mode === "write" ? c.cal.kana
                              : answersReading() ? c.cal.reading : c.cal.ident)
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
    // A clean sweep is what earns a time; reveals count as misses, so this
    // can't be gamed by rushing.
    //
    // Fast runs count, and there is one records pool. They are quicker by about
    // the stamp delay per card — half a minute over a 50-card deck — so in
    // practice the record ends up being a Fast one. That is a deliberate
    // choice and not an oversight: splitting the pool would mean two "fastest"
    // figures per deck per mode on a screen that already carries two, and
    // refusing the time outright is worse still — it throws away a run you
    // actually did and sat through. If the two ever need comparing, the fix is
    // to stop counting the app's own pause towards the clock, not to start
    // rejecting runs.
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
      el.endBestChip.innerHTML = modeLabel(mode).toLowerCase() + " best " + parts.join(" · ");
    }

    const news = [];
    if (isRecord) news.push("New " + modeLabel(mode) + " best for this " +
      (state.flick ? "drill." : "deck."));
    if (isFastest) news.push(isRecord ? "Fastest clean run too." : "Fastest clean run yet.");
    el.endBest.classList.toggle("hidden", !news.length);
    el.endBest.textContent = news.join(" ");

    // Unique misses, back in chart order. A flick run has no deck to order by,
    // and the same prompt recurs through the run as separate cards, so its
    // misses are collapsed by group instead.
    // Unique misses, back in the order the material has. A flick run has no
    // deck to order by and the same prompt recurs as separate cards, so its
    // misses collapse by group; a number run has no cards either, but every
    // value appears once and counting order is the order that means something.
    const missed = state.flick
      ? state.missed.filter((c, i) =>
          state.missed.findIndex((x) => x.flick.group === c.flick.group) === i)
      : state.numbers
      ? state.missed.slice().sort((a, b) => a.num.ord - b.num.ord)
      // a calendar run has no cards either, and its order is the week's or the
      // month's — `ord` is that, the number for a date and the weekday's place
      // in kana.json for a day of the week
      : state.calendar
      ? state.missed.slice().sort((a, b) => a.cal.ord - b.cal.ord)
      : state.deck.cards.filter((c) => state.missed.includes(c));

    if (missed.length) {
      el.missedBlock.classList.remove("hidden");
      el.missedGrid.innerHTML = "";
      missed.forEach((c) => {
        const d = document.createElement("div");
        // A missed number is reviewed the one useful way round — the value,
        // then how it is said — never as whichever half happened to be asked.
        d.className = "miss" + (state.numbers || state.calendar ? " miss--num" : "");
        // reviewed as the material, not as whichever direction it was asked
        // in: how it is written, then how it is said
        d.innerHTML = state.calendar
          ? '<span class="miss__k" lang="ja">' + calFace(c) + '</span>' +
            '<span class="miss__r" lang="ja">' + c.cal.kana + "</span>"
          : state.numbers
          ? '<span class="miss__k" lang="ja">' + c.num.kanji + '</span>' +
            '<span class="miss__r" lang="ja">' + c.num.kana + "</span>"
          : '<span class="miss__k" lang="ja">' + c.q + '</span>' +
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
      // "again" only where it is the same material a second time: the random
      // drill deals twenty it has never asked before.
      : state.numbers === "random" || state.numbers === "math"
        ? "Practice " + state.deck.len + " more"
      // `max` where there is one: a drill of ten asked both ways is "all 10
      // again", not all 20 — the prompts are twenty, the material is ten.
      : state.numbers ? "Practice all " + (state.deck.max || state.deck.len) + " again"
      // the clock deals twenty of 144 faces, so a second run is twenty it has
      // mostly not asked — "again" belongs to the drills that are a fixed set
      : state.calendar === "time" ? "Practice " + state.deck.len + " more"
      : state.calendar ? "Practice all " + state.deck.len + " again"
      : "Practice all " + state.deck.cards.length + " again";
    el.againBtn.onclick = () => start(state.deck);
    show(el.end);
  }

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

  // Options is a screen, so everything it leads to is one step deeper and one
  // step back — no sheet to close first, and nothing that can stack.
  el.moreBtn.addEventListener("click", () => navTo(el.options));
  el.optionsBackBtn.addEventListener("click", navBack);

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
    // Escape backs out of a panel, which is what <dialog> used to do for free.
    if (onPanel()) {
      if (e.key === "Escape") navBack();
      return;                               // the panel owns the keyboard
    }
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

  /* A submit button is never disabled to gate a form — it is always pressable
     and the check happens on submit, so the error can say what is actually
     wrong instead of leaving you guessing which field the button is waiting on.
     The one time it is disabled is *during* the request, to stop a second one,
     and then it says so: signing in runs 600k PBKDF2 rounds, which is long
     enough that a button that only greys out reads as a dead button. */
  function busy(btn, label) {
    if (label) {
      if (btn.dataset.idle === undefined) btn.dataset.idle = btn.textContent;
      btn.textContent = label;
    } else if (btn.dataset.idle !== undefined) {
      btn.textContent = btn.dataset.idle;
      delete btn.dataset.idle;
    }
    btn.disabled = Boolean(label);
    btn.setAttribute("aria-busy", String(Boolean(label)));
  }

  // The message is announced by its own live region; this is what points a
  // screen reader at it from the field, and marks the field as the thing to fix.
  const markInvalid = (fields, bad) => fields.forEach((f) => {
    if (bad) f.setAttribute("aria-invalid", "true");
    else f.removeAttribute("aria-invalid");
  });

  function authError(msg) {
    el.authMsg.textContent = msg || "";
    el.authMsg.classList.toggle("hidden", !msg);
    markInvalid([el.authUser, el.authPass], Boolean(msg));
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
    markInvalid([el.pwCurrent, el.pwNew, el.pwConfirm], Boolean(text) && !good);
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

    busy(el.pwSubmit, "Saving…");
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
      .then(() => busy(el.pwSubmit, null));
  }

  function setAuthMode(mode) {
    authMode = mode;
    authError("");
    const idle = mode === "login" ? "Sign in" : "Create account";
    // If a request is in flight the button is showing its busy label; write the
    // new idle text where busy() will find it rather than over the top of it.
    if (el.authSubmit.dataset.idle !== undefined) el.authSubmit.dataset.idle = idle;
    else el.authSubmit.textContent = idle;
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
    if (PROMPTS.includes(saved.prompt)) setPrompt(saved.prompt);
    if (DATE_FORMS.includes(saved.dates)) setDates(saved.dates);
    if (MODES.includes(saved.mode)) setMode(saved.mode);
    const known = SCRIPTS.indexOf(saved.script) > -1;
    const hasDecks = allDecks().some((d) => d.script === saved.script);
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
    busy(el.authSubmit, authMode === "login" ? "Signing in…" : "Creating…");
    authError("");
    api.call("POST", authMode === "login" ? "/api/login" : "/api/signup",
             { username: username, password: password })
      .then(afterSignIn)
      .catch((err) => authError(err.message))
      .then(() => busy(el.authSubmit, null));
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
})();
