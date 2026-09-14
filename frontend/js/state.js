/* js/state.js — run state, small helpers and the run clock.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

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
  // whether the run clock is on screen mid-run — hidden unless chosen
  showClock: store.read().clock === "shown",
  // how a run's time is written — rounded to the second unless Exact is chosen
  exactTimes: store.read().times === "exact",
  // Easy drawing: the kana faintly on the pad to trace over — off unless chosen
  easyDraw: store.read().easy === true,
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
  clockTick: 0,      // interval repainting the play bar's clock, when it is shown
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
  state.calendar !== null && !state.flick && state.mode !== "write" &&
  // a weekday always: its English name is a translation, not an answer
  (state.calendar === "week" || (state.prompt === "kanji" && state.dates === "numeral"));

// What a pick is graded against: the value, or the reading when that is asked.
const choiceAnswer = (c) => (answersReading() ? c.cal.reading : c.a);

const typedField = () =>
  kanaAnswer()
    ? { input: el.kanaInput, submit: el.writeSubmitBtn }
    : numericAnswer()
      ? { input: el.numInput, submit: el.numSubmitBtn }
      : { input: el.input, submit: el.submitBtn };

/* ---------- clock ---------- */
// The run is always timed, and by default the clock stays off screen while
// practising — a ticking counter turns practice into a race for anyone who
// didn't ask for one. The Timer switch in Options puts it in the play bar for
// those who do. Either way the results screen shows the total exactly, to the
// millisecond, because that is the figure the record is kept in.
const elapsed = () =>
  state.finishedMs || (state.startedAt ? performance.now() - state.startedAt : 0);

// Whole seconds: how a time is written unless Settings asks for Exact.
function fmtTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

// A run's exact length, milliseconds and all — what the progress report always
// shows, and everything else does under Times shown as · Exact. Rounding there hides the difference between two runs
// of the same deck when you are chasing your own time.
function fmtExact(ms) {
  const total = Math.max(0, Math.round(ms));
  const mins = Math.floor(total / 60000);
  const secs = Math.floor(total % 60000 / 1000);
  return mins + ":" + (secs < 10 ? "0" : "") + secs +
         "." + String(total % 1000).padStart(3, "0");
}

// How a run's time is written everywhere but the progress report: the results
// screen, the best-time chip, the deck list and the live clock. Rounded to the
// second unless Settings says Exact. The report calls fmtExact itself and
// ignores the setting — telling two runs apart is the whole of what it is for.
const fmtRun = (ms) => (state.exactTimes ? fmtExact(ms) : fmtTime(ms));

function startClock() {
  state.startedAt = performance.now();
  state.finishedMs = 0;
  runClockTick();
}

// Repaints the play bar's clock while a run is going and the Timer switch says
// to show it. Four times a second keeps a whole-second display from visibly
// lagging, and about twenty a second lets an exact one's milliseconds run;
// nothing is measured off this — the run is timed from performance.now(),
// never by counting ticks.
function runClockTick() {
  clearInterval(state.clockTick);
  state.clockTick = 0;
  const running = Boolean(state.startedAt) && !state.finishedMs;
  el.playClock.classList.toggle("hidden", !state.showClock);
  if (!state.showClock || !running) return;
  const paint = () => { el.playClock.textContent = fmtRun(elapsed()); };
  paint();
  state.clockTick = setInterval(paint, state.exactTimes ? 47 : 250);
}

// Synced through `store` like the prompt and date settings: whether you want
// to see a clock is about how you practise, not about the screen in front of
// you. Mid-run it takes effect at once.
function setClock(shown) {
  state.showClock = Boolean(shown);
  Array.from(el.clockSwitch.children).forEach((b) =>
    b.setAttribute("aria-checked", String((b.dataset.clock === "shown") === state.showClock)));
  store.write({ clock: state.showClock ? "shown" : "hidden" });
  runClockTick();
}

// Rounded or exact, synced through `store` like the timer. The deck list and a
// running clock pick it up at once; a results screen is written when its run
// ends; the progress report ignores it and is always exact.
function setTimes(exact) {
  state.exactTimes = Boolean(exact);
  Array.from(el.timesSwitch.children).forEach((b) =>
    b.setAttribute("aria-checked", String((b.dataset.times === "exact") === state.exactTimes)));
  store.write({ times: state.exactTimes ? "exact" : "rounded" });
  runClockTick();
  if (el.play.classList.contains("hidden")) buildMenu();
}

// On or off, synced like the timer: how you want to practise drawing is about
// what you are learning. The deck list shows the easy records while it is on.
function setEasyDraw(on) {
  state.easyDraw = Boolean(on);
  el.easySwitch.setAttribute("aria-checked", String(state.easyDraw));
  store.write({ easy: state.easyDraw });
  if (el.play.classList.contains("hidden")) buildMenu();
}

function stopClock(keep) {
  // an abandoned run is not running any more, so nothing may keep ticking
  if (!keep) state.startedAt = 0;
  state.finishedMs = keep ? performance.now() - state.startedAt : 0;
  runClockTick();
}
