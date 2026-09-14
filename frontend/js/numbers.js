/* js/numbers.js — numbers: reading, grading, dealing and arithmetic.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

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
