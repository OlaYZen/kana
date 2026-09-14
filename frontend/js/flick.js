/* js/flick.js — the flick keyboard drills.
   One of the classic scripts index.html loads in order; see CLAUDE.md, "Scripts". */
"use strict";

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
