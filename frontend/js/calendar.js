/* js/calendar.js — the calendar and the clock.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

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
  const out = [], seen = new Set();
  let hs = [], ms = [];
  for (let guard = 0; out.length < deck.len && guard < deck.len * 40; guard++) {
    if (!hs.length) hs = shuffle(hours.slice());
    if (!ms.length) ms = shuffle(deck.minutes.slice());
    const h = hs.pop(), m = ms.pop();
    const id = clockIdent(h, m);
    if (seen.has(id)) continue;       // the same face twice in one run
    seen.add(id);
    out.push({ h: h, m: m });
  }
  // 午前 and 午後 are dealt over the finished list, a shuffled pair at a time,
  // so a run is exactly half of each. Dealing them inside the loop above let
  // every skipped duplicate throw a half away and tip the run to one side.
  if (deck.meridiem) {
    let halves = [];
    out.forEach((v) => {
      if (!halves.length) halves = shuffle(CAL.meridiem.slice());
      v.mer = halves.pop();
    });
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
