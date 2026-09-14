/* js/base.js — DOM handles, constants, localStorage keys and the persisted store.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

const $ = (id) => document.getElementById(id);

const el = {
  menu: $("menu"), play: $("play"), end: $("end"), fatal: $("fatal"),
  decks: $("decks"), menuScroll: document.querySelector(".menu__scroll"),
  flickDecks: $("flickDecks"), flickTitle: $("flickTitle"),
  scriptSwitch: $("scriptSwitch"),
  playMark: $("playMark"), playLabel: $("playLabel"), playClock: $("playClock"),
  square: $("square"), glyph: $("glyph"), feedback: $("feedback"),
  typeMode: $("typeMode"), chooseMode: $("chooseMode"), writeMode: $("writeMode"),
  numberMode: $("numberMode"), numInput: $("numInput"), numSubmitBtn: $("numSubmitBtn"),
  input: $("input"), submitBtn: $("submitBtn"),
  kanaInput: $("kanaInput"), writeSubmitBtn: $("writeSubmitBtn"),
  revealBtn: $("revealBtn"), revealBtnTop: $("revealBtnTop"), revealBar: $("revealBar"),
  typedTools: $("typedTools"), typedHint: $("typedHint"),
  choices: $("choices"), chooseTools: $("chooseTools"), chooseHint: $("chooseHint"),
  drawPad: $("drawPad"), drawMode: $("drawMode"), drawUndo: $("drawUndo"),
  drawClear: $("drawClear"), drawCheck: $("drawCheck"), drawNote: $("drawNote"),
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
  moreMode: $("moreMode"), moreModeWrap: $("moreModeWrap"),
  quick: $("quickAccess"), quickToggles: $("quickToggles"),
  settings: $("settings"), settingsBtn: $("settingsBtn"), settingsBackBtn: $("settingsBackBtn"),
  quickDialog: $("quickDialog"), quickDialogBody: $("quickDialogBody"),
  quickDialogClose: $("quickDialogClose"), quickDialogEmpty: $("quickDialogEmpty"),
  quickDialogEdit: $("quickDialogEdit"),
  stats: $("stats"), statsBtn: $("statsBtn"), statsBody: $("statsBody"),
  statsBackBtn: $("statsBackBtn"), deckPick: $("deckPick"),
  statsScriptSwitch: $("statsScriptSwitch"),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  // Eight switches now share .seg__btn. Never select that class document-wide:
  // the device switch has no data-mode, so a global query wires
  // setMode(undefined) onto it and blanks its aria-checked every time the
  // answer mode changes. Each switch has an id of its own for that reason.
  modeSwitch: $("modeSwitch"),
  promptSwitch: $("promptSwitch"),
  datesSwitch: $("datesSwitch"),
  clockSwitch: $("clockSwitch"),
  timesSwitch: $("timesSwitch"),
  easySwitch: $("easySwitch"),
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
// Which Settings rows are pinned to the menu — this device's alone, like the
// theme: how much menu there is room for is a fact about the screen.
const QUICK_KEY = "kana.quick";
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

const MODES = ["type", "choose", "write", "draw"];

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
  type: "Typing", choose: "Choosing", write: "Writing", draw: "Drawing", flick: "Flick"
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
  Boolean(deck && (deck.numbers || deck.calendar)) && mode !== "write" && mode !== "draw";
// A calendar drill asked with 9月 wants the reading rather than the value, so
// it is a third question beside 九月 → 9 and "kugatsu" → 9, and records as
// "-numeral". A weekday has no number to write either way and keeps "-kanji".
// A weekday is always asked with its kanji and answered with its reading, so the
// prompt setting does not reach it and it records as "-said" — a different
// question from the English-name answer it had before, whose records stay put.
const promptForm = (deck, prompt) =>
  deck.calendar === "week" ? "said"
    : prompt === "kanji" && deck.calendar && state.dates === "numeral" ? "numeral"
    : prompt;
// Easy drawing traces over the kana rather than recalling it, so it records
// apart as "draw-easy" — the same reason the prompt forms do.
const recordMode = (deck, mode, prompt) =>
  promptApplies(deck, mode) ? mode + "-" + promptForm(deck, prompt)
    : mode === "draw" && state.easyDraw ? "draw-easy"
    : mode;

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
